import { decodeTextBytes, inflateRaw } from "./documentParser";

/* -------------------------------------------------------------------------- */
/*  纯 TS PDF 文本提取器（零原生依赖，支持 FlateDecode + ToUnicode CMap + 表格聚类） */
/* -------------------------------------------------------------------------- */

const SCAN_GUIDANCE_ERROR =
  "该 PDF 未包含可提取的文本（可能是扫描件或纯图片 PDF），请截图或保存为图片后使用「相册识图 / 拍照识别」";

const ENCRYPTED_PDF_ERROR =
  "该 PDF 已加密保护，暂不支持直接提取文字，请先解除密码或截图后使用「相册识图 / 拍照识别」";

interface PdfIndirectObject {
  id: string;
  dict: string;
  body: string;
  rawStream: Uint8Array | null;
  streamError?: boolean;
}

interface CMapData {
  map: Map<string, string>;
  byteLengths: number[];
  codespaceByteLengths: number[];
}

interface TextFragment {
  text: string;
  x: number;
  y: number;
  fontSize: number;
  width: number;
  seq: number;
}

type Matrix6 = [number, number, number, number, number, number];

type ContentToken =
  | { type: "string"; bytes: Uint8Array; isHex: boolean }
  | { type: "array"; items: ContentToken[] }
  | { type: "name"; value: string }
  | { type: "number"; value: number }
  | { type: "operator"; value: string };

const WIN_ANSI_128_159: Record<number, number> = {
  0x80: 0x20ac,
  0x82: 0x201a,
  0x83: 0x0192,
  0x84: 0x201e,
  0x85: 0x2026,
  0x86: 0x2020,
  0x87: 0x2021,
  0x88: 0x02c6,
  0x89: 0x2030,
  0x8a: 0x0160,
  0x8b: 0x2039,
  0x8c: 0x0152,
  0x8e: 0x017d,
  0x91: 0x2018,
  0x92: 0x2019,
  0x93: 0x201c,
  0x94: 0x201d,
  0x95: 0x2022,
  0x96: 0x2013,
  0x97: 0x2014,
  0x98: 0x02dc,
  0x99: 0x2122,
  0x9a: 0x0161,
  0x9b: 0x203a,
  0x9c: 0x0153,
  0x9e: 0x017e,
  0x9f: 0x0178,
};

function bytesToLatin1(bytes: Uint8Array): string {
  const chunks: string[] = [];
  const step = 16384;
  for (let i = 0; i < bytes.length; i += step) {
    const slice = bytes.subarray(i, Math.min(i + step, bytes.length));
    let part = "";
    for (let j = 0; j < slice.length; j++) {
      part += String.fromCharCode(slice[j]);
    }
    chunks.push(part);
  }
  return chunks.join("");
}

function isPdfWhitespace(ch: number): boolean {
  return (
    ch === 0x00 ||
    ch === 0x09 ||
    ch === 0x0a ||
    ch === 0x0c ||
    ch === 0x0d ||
    ch === 0x20
  );
}

function isPdfDelimiter(ch: number): boolean {
  return (
    isPdfWhitespace(ch) ||
    ch === 0x28 || // (
    ch === 0x29 || // )
    ch === 0x3c || // <
    ch === 0x3e || // >
    ch === 0x5b || // [
    ch === 0x5d || // ]
    ch === 0x7b || // {
    ch === 0x7d || // }
    ch === 0x2f || // /
    ch === 0x25 // %
  );
}

function skipWsAndComments(src: string, pos: number): number {
  let i = pos;
  while (i < src.length) {
    const ch = src.charCodeAt(i);
    if (isPdfWhitespace(ch)) {
      i++;
    } else if (ch === 0x25) {
      // % comment until EOL
      while (i < src.length && src.charCodeAt(i) !== 0x0a && src.charCodeAt(i) !== 0x0d) {
        i++;
      }
    } else {
      break;
    }
  }
  return i;
}

/** 从 `<<` 位置读取完整平衡字典（跳过嵌套 `<<>>` 与字面量字符串 `(...)`） */
function readBalancedDict(src: string, start: number): { text: string; end: number } | null {
  if (src[start] !== "<" || src[start + 1] !== "<") return null;
  let depth = 0;
  let i = start;
  while (i < src.length) {
    const c = src[i];
    if (c === "%") {
      while (i < src.length && src[i] !== "\n" && src[i] !== "\r") i++;
      continue;
    }
    if (c === "(") {
      let pDepth = 1;
      i++;
      while (i < src.length && pDepth > 0) {
        if (src[i] === "\\") {
          i += 2;
          continue;
        }
        if (src[i] === "(") pDepth++;
        else if (src[i] === ")") pDepth--;
        i++;
      }
      continue;
    }
    if (c === "<" && src[i + 1] === "<") {
      depth++;
      i += 2;
      continue;
    }
    if (c === ">" && src[i + 1] === ">") {
      depth--;
      i += 2;
      if (depth === 0) {
        return { text: src.slice(start, i), end: i };
      }
      continue;
    }
    i++;
  }
  return null;
}

/** 解码 ASCIIHexDecode 滤镜 */
function decodeAsciiHex(src: Uint8Array): Uint8Array {
  const digits: number[] = [];
  for (let i = 0; i < src.length; i++) {
    const b = src[i];
    if (b === 0x3e) break; // '>'
    if (b >= 0x30 && b <= 0x39) digits.push(b - 0x30);
    else if (b >= 0x41 && b <= 0x46) digits.push(b - 55);
    else if (b >= 0x61 && b <= 0x66) digits.push(b - 87);
  }
  if (digits.length % 2 === 1) digits.push(0);
  const out = new Uint8Array(digits.length / 2);
  for (let i = 0; i < out.length; i++) {
    out[i] = (digits[i * 2] << 4) | digits[i * 2 + 1];
  }
  return out;
}

/** 还原 PNG Predictor（PDF 1.5+ ObjStm / XRef 常见 /Predictor 10..15） */
function unapplyPngPredictor(data: Uint8Array, columns: number): Uint8Array {
  if (columns <= 0) return data;
  const stride = columns + 1;
  const rows = Math.floor(data.length / stride);
  if (rows <= 0) return data;
  const out = new Uint8Array(rows * columns);
  for (let r = 0; r < rows; r++) {
    const filter = data[r * stride];
    const rowIn = r * stride + 1;
    const rowOut = r * columns;
    const prevOut = (r - 1) * columns;
    for (let c = 0; c < columns; c++) {
      const raw = data[rowIn + c];
      const left = c > 0 ? out[rowOut + c - 1] : 0;
      const up = r > 0 ? out[prevOut + c] : 0;
      const upLeft = r > 0 && c > 0 ? out[prevOut + c - 1] : 0;
      let val = raw;
      if (filter === 1) val = (raw + left) & 0xff;
      else if (filter === 2) val = (raw + up) & 0xff;
      else if (filter === 3) val = (raw + ((left + up) >> 1)) & 0xff;
      else if (filter === 4) {
        const p = left + up - upLeft;
        const pa = Math.abs(p - left);
        const pb = Math.abs(p - up);
        const pc = Math.abs(p - upLeft);
        const pr = pa <= pb && pa <= pc ? left : pb <= pc ? up : upLeft;
        val = (raw + pr) & 0xff;
      }
      out[rowOut + c] = val;
    }
  }
  return out;
}

/** 解压 PDF /FlateDecode 流（自动剥离 RFC 1950 2 字节 zlib 头与可选 FDICT，并兜底原始 DEFLATE） */
function decompressFlateStream(raw: Uint8Array): Uint8Array {
  let start = 0;
  if (
    raw.length >= 2 &&
    !((raw[0] & 0x0f) === 8 && (((raw[0] << 8) | raw[1]) % 31) === 0)
  ) {
    while (start < raw.length && isPdfWhitespace(raw[start])) start++;
  }
  const view = start > 0 && start < raw.length ? raw.subarray(start) : raw;

  if (view.length >= 2) {
    const cmf = view[0];
    const flg = view[1];
    if ((cmf & 0x0f) === 8 && (((cmf << 8) | flg) % 31) === 0) {
      const headerLen = (flg & 0x20) !== 0 ? 6 : 2;
      if (headerLen < view.length) {
        try {
          return inflateRaw(view.subarray(headerLen));
        } catch {
          // 继续尝试 raw deflate
        }
      }
    }
  }
  return inflateRaw(view);
}

/** 提取流字典中声明的滤镜序列 */
function extractFilters(dict: string): string[] {
  const arrMatch = dict.match(/\/Filter\s*\[([^\]]*)\]/);
  if (arrMatch) {
    return [...arrMatch[1].matchAll(/\/([A-Za-z0-9]+)/g)].map((m) => m[1]);
  }
  const singleMatch = dict.match(/\/Filter\s*\/([A-Za-z0-9]+)/);
  if (singleMatch) return [singleMatch[1]];
  return [];
}

function shouldSkipStreamDict(dict: string): boolean {
  if (/\/Subtype\s*\/Image\b/.test(dict)) return true;
  if (/\/Subtype\s*\/Type1C\b/.test(dict)) return true;
  if (/\/Subtype\s*\/CIDFontType0C\b/.test(dict)) return true;
  if (/\/Length1\s+\d+/.test(dict)) return true;
  const filters = extractFilters(dict);
  for (const f of filters) {
    if (
      f === "DCTDecode" ||
      f === "DCT" ||
      f === "JPXDecode" ||
      f === "CCITTFaxDecode" ||
      f === "CCF" ||
      f === "JBIG2Decode"
    ) {
      return true;
    }
  }
  return false;
}

function decodePdfStream(dict: string, raw: Uint8Array): Uint8Array | null {
  if (shouldSkipStreamDict(dict)) return null;
  const filters = extractFilters(dict);
  let data = raw;
  try {
    for (const f of filters) {
      if (f === "FlateDecode" || f === "Fl") {
        data = decompressFlateStream(data);
        const predMatch = dict.match(/\/Predictor\s+(\d+)/);
        const colMatch = dict.match(/\/Columns\s+(\d+)/);
        const predictor = predMatch ? Number(predMatch[1]) : 1;
        const columns = colMatch ? Number(colMatch[1]) : 1;
        if (predictor >= 10 && predictor <= 15 && columns > 0) {
          data = unapplyPngPredictor(data, columns);
        }
      } else if (f === "ASCIIHexDecode" || f === "AHx") {
        data = decodeAsciiHex(data);
      } else {
        return null;
      }
    }
    return data;
  } catch {
    return null;
  }
}

/** 扫描 PDF 中全部间接对象（跳过 stream 二进制负载，避免误匹配） */
function parseIndirectObjects(
  bytes: Uint8Array,
  latin1: string,
): { objects: Map<string, PdfIndirectObject>; standaloneStreams: { dict: string; data: Uint8Array }[] } {
  const objects = new Map<string, PdfIndirectObject>();
  const standaloneStreams: { dict: string; data: Uint8Array }[] = [];
  const objHeaderRe = /(?:^|[\r\n\t \f\0])(\d+)\s+(\d+)\s+obj(?=$|[\r\n\t \f\0<\[(\/%])/g;

  let cursor = 0;
  while (cursor < latin1.length) {
    objHeaderRe.lastIndex = cursor;
    const m = objHeaderRe.exec(latin1);
    if (!m) break;

    const id = `${m[1]} ${m[2]}`;
    let pos = skipWsAndComments(latin1, m.index + m[0].length);
    let dict = "";
    let rawStream: Uint8Array | null = null;
    let body = "";

    const dictRes = readBalancedDict(latin1, pos);
    if (dictRes) {
      dict = dictRes.text;
      pos = skipWsAndComments(latin1, dictRes.end);
    }

    if (
      latin1.startsWith("stream", pos) &&
      (latin1[pos + 6] === "\r" || latin1[pos + 6] === "\n")
    ) {
      let dataStart = pos + 6;
      if (latin1[dataStart] === "\r" && latin1[dataStart + 1] === "\n") {
        dataStart += 2;
      } else {
        dataStart += 1;
      }

      let dataEnd = -1;
      let afterStream = -1;

      const directLen = dict.match(/\/Length\s+(\d+)(?!\s+\d+\s+R)/);
      if (directLen) {
        const len = Number(directLen[1]);
        const candEnd = dataStart + len;
        if (candEnd >= dataStart && candEnd <= bytes.length) {
          let check = candEnd;
          while (
            check < latin1.length &&
            (latin1[check] === "\r" || latin1[check] === "\n" || latin1[check] === " ")
          ) {
            check++;
          }
          if (latin1.startsWith("endstream", check)) {
            dataEnd = candEnd;
            afterStream = check + 9;
          }
        }
      }

      if (dataEnd < 0) {
        const endIdx = latin1.indexOf("endstream", dataStart);
        if (endIdx >= dataStart) {
          dataEnd = endIdx;
          if (dataEnd > dataStart && latin1[dataEnd - 1] === "\n") dataEnd--;
          if (dataEnd > dataStart && latin1[dataEnd - 1] === "\r") dataEnd--;
          afterStream = endIdx + 9;
        }
      }

      if (dataEnd >= dataStart) {
        rawStream = bytes.subarray(dataStart, dataEnd);
        pos = afterStream;
      }
    }

    const endObjIdx = latin1.indexOf("endobj", pos);
    if (endObjIdx >= pos) {
      if (!dict && !rawStream) {
        body = latin1.slice(pos, endObjIdx).trim();
      }
      cursor = endObjIdx + 6;
    } else {
      cursor = Math.max(pos + 1, m.index + m[0].length);
    }

    objects.set(id, { id, dict, body, rawStream });
  }

  // 解包 PDF 1.5+ 对象流 (/Type /ObjStm) 里的字体、页面与资源字典
  const objStmList = [...objects.values()].filter(
    (obj) => obj.rawStream && /\/Type\s*\/ObjStm\b/.test(obj.dict),
  );
  for (const stm of objStmList) {
    const nMatch = stm.dict.match(/\/N\s+(\d+)/);
    const firstMatch = stm.dict.match(/\/First\s+(\d+)/);
    if (!nMatch || !firstMatch || !stm.rawStream) continue;
    const count = Number(nMatch[1]);
    const first = Number(firstMatch[1]);
    const decoded = decodePdfStream(stm.dict, stm.rawStream);
    if (!decoded || first > decoded.length) continue;
    const text = bytesToLatin1(decoded);
    const headerNums = text
      .slice(0, first)
      .trim()
      .split(/\s+/)
      .map(Number);
    const pairs: { num: number; offset: number }[] = [];
    for (let i = 0; i + 1 < headerNums.length && pairs.length < count; i += 2) {
      if (Number.isInteger(headerNums[i]) && Number.isInteger(headerNums[i + 1])) {
        pairs.push({ num: headerNums[i], offset: headerNums[i + 1] });
      }
    }
    for (let i = 0; i < pairs.length; i++) {
      const start = first + pairs[i].offset;
      const end = i + 1 < pairs.length ? first + pairs[i + 1].offset : text.length;
      if (start < 0 || start > text.length || end < start) continue;
      const slice = text.slice(start, end).trim();
      const id = `${pairs[i].num} 0`;
      if (!objects.has(id)) {
        const dRes = slice.startsWith("<<") ? readBalancedDict(slice, 0) : null;
        objects.set(id, {
          id,
          dict: dRes ? dRes.text : "",
          body: dRes ? "" : slice,
          rawStream: null,
        });
      }
    }
  }

  // 若文件缺少标准 obj 包装，也扫描裸 stream...endstream 作为兜底
  if (objects.size === 0) {
    let idx = 0;
    while (idx < latin1.length) {
      const sIdx = latin1.indexOf("stream", idx);
      if (sIdx < 0) break;
      let dataStart = sIdx + 6;
      if (latin1[dataStart] === "\r" && latin1[dataStart + 1] === "\n") dataStart += 2;
      else if (latin1[dataStart] === "\n" || latin1[dataStart] === "\r") dataStart += 1;
      else {
        idx = sIdx + 6;
        continue;
      }
      const eIdx = latin1.indexOf("endstream", dataStart);
      if (eIdx < 0) break;
      let dataEnd = eIdx;
      if (dataEnd > dataStart && latin1[dataEnd - 1] === "\n") dataEnd--;
      if (dataEnd > dataStart && latin1[dataEnd - 1] === "\r") dataEnd--;
      const lookback = latin1.slice(Math.max(0, sIdx - 512), sIdx);
      const dictPos = lookback.lastIndexOf("<<");
      const dict = dictPos >= 0 ? lookback.slice(dictPos) : "";
      const decoded = decodePdfStream(dict, bytes.subarray(dataStart, dataEnd));
      if (decoded) standaloneStreams.push({ dict, data: decoded });
      idx = eIdx + 9;
    }
  }

  return { objects, standaloneStreams };
}

/* -------------------------------------------------------------------------- */
/*  /ToUnicode CMap 解析（beginbfchar + beginbfrange + codespacerange）        */
/* -------------------------------------------------------------------------- */

function hexToUnicodeString(hexRaw: string): string {
  const hex = hexRaw.replace(/\s+/g, "");
  if (!hex) return "";
  if (hex.length <= 2) {
    const code = parseInt(hex, 16);
    return Number.isFinite(code) ? String.fromCharCode(code) : "";
  }
  const padded =
    hex.length % 4 === 0 ? hex : hex.padStart(Math.ceil(hex.length / 4) * 4, "0");
  let out = "";
  for (let i = 0; i < padded.length; i += 4) {
    const unit = parseInt(padded.slice(i, i + 4), 16);
    if (Number.isFinite(unit) && unit !== 0) {
      out += String.fromCharCode(unit);
    }
  }
  return out;
}

function parseToUnicodeCMap(cmapText: string): CMapData | null {
  if (
    !cmapText.includes("beginbfchar") &&
    !cmapText.includes("beginbfrange") &&
    !cmapText.includes("begincmap")
  ) {
    return null;
  }

  const map = new Map<string, string>();
  const lenSet = new Set<number>();
  const csLenSet = new Set<number>();

  // 1) begincodespacerange ... endcodespacerange
  const csBlockRe = /begincodespacerange([\s\S]*?)endcodespacerange/g;
  let bm: RegExpExecArray | null;
  while ((bm = csBlockRe.exec(cmapText)) !== null) {
    const pairRe = /<([0-9A-Fa-f\s]+)>\s*<([0-9A-Fa-f\s]+)>/g;
    let pm: RegExpExecArray | null;
    while ((pm = pairRe.exec(bm[1])) !== null) {
      const hex = pm[1].replace(/\s+/g, "");
      if (hex.length >= 2) csLenSet.add(Math.ceil(hex.length / 2));
    }
  }

  // 2) beginbfchar ... endbfchar
  const charBlockRe = /beginbfchar([\s\S]*?)endbfchar/g;
  while ((bm = charBlockRe.exec(cmapText)) !== null) {
    const pairRe = /<([0-9A-Fa-f\s]+)>\s*<([0-9A-Fa-f\s]+)>/g;
    let pm: RegExpExecArray | null;
    while ((pm = pairRe.exec(bm[1])) !== null) {
      let src = pm[1].replace(/\s+/g, "").toUpperCase();
      if (src.length % 2 === 1) src = "0" + src;
      const dst = hexToUnicodeString(pm[2]);
      if (src && dst) {
        map.set(src, dst);
        lenSet.add(src.length / 2);
      }
    }
  }

  // 3) beginbfrange ... endbfrange（同时支持区间递增与数组映射）
  const rangeBlockRe = /beginbfrange([\s\S]*?)endbfrange/g;
  while ((bm = rangeBlockRe.exec(cmapText)) !== null) {
    const entryRe =
      /<([0-9A-Fa-f\s]+)>\s*<([0-9A-Fa-f\s]+)>\s*(?:\[([\s\S]*?)\]|<([0-9A-Fa-f\s]+)>)/g;
    let em: RegExpExecArray | null;
    while ((em = entryRe.exec(bm[1])) !== null) {
      let loHex = em[1].replace(/\s+/g, "").toUpperCase();
      let hiHex = em[2].replace(/\s+/g, "").toUpperCase();
      if (loHex.length % 2 === 1) loHex = "0" + loHex;
      if (hiHex.length % 2 === 1) hiHex = "0" + hiHex;
      const hexLen = Math.max(loHex.length, hiHex.length);
      const start = parseInt(loHex, 16);
      const end = parseInt(hiHex, 16);
      if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) {
        continue;
      }
      const byteLen = hexLen / 2;
      lenSet.add(byteLen);

      if (em[3] != null) {
        const arrHexes = [...em[3].matchAll(/<([0-9A-Fa-f\s]+)>/g)].map((x) => x[1]);
        const limit = Math.min(arrHexes.length, end - start + 1, 65536);
        for (let i = 0; i < limit; i++) {
          const key = (start + i).toString(16).toUpperCase().padStart(hexLen, "0");
          const val = hexToUnicodeString(arrHexes[i]);
          if (val) map.set(key, val);
        }
      } else if (em[4] != null) {
        const dstRaw = em[4].replace(/\s+/g, "").toUpperCase();
        const tailLen = dstRaw.length >= 4 ? 4 : dstRaw.length;
        const prefix = dstRaw.slice(0, dstRaw.length - tailLen);
        const dstBase = parseInt(dstRaw.slice(dstRaw.length - tailLen), 16);
        if (!Number.isFinite(dstBase)) continue;
        const limit = Math.min(end - start + 1, 65536);
        for (let i = 0; i < limit; i++) {
          const key = (start + i).toString(16).toUpperCase().padStart(hexLen, "0");
          const dstHex =
            prefix + (dstBase + i).toString(16).toUpperCase().padStart(tailLen, "0");
          const val = hexToUnicodeString(dstHex);
          if (val) map.set(key, val);
        }
      }
    }
  }

  if (map.size === 0) return null;
  return {
    map,
    byteLengths: [...lenSet].sort((a, b) => b - a),
    codespaceByteLengths: [...csLenSet].sort((a, b) => b - a),
  };
}

function bytesToHexUpper(bytes: Uint8Array, start: number, len: number): string {
  let out = "";
  for (let i = 0; i < len; i++) {
    out += bytes[start + i].toString(16).toUpperCase().padStart(2, "0");
  }
  return out;
}

function decodeWithCMap(
  bytes: Uint8Array,
  cmap: CMapData,
): { text: string; hits: number; total: number } {
  let out = "";
  let hits = 0;
  let total = 0;
  let i = 0;
  const minStep =
    cmap.codespaceByteLengths.length === 1
      ? cmap.codespaceByteLengths[0]
      : cmap.byteLengths.length === 1
        ? cmap.byteLengths[0]
        : 1;

  while (i < bytes.length) {
    let matched = false;
    for (const len of cmap.byteLengths) {
      if (i + len <= bytes.length) {
        const key = bytesToHexUpper(bytes, i, len);
        const mapped = cmap.map.get(key);
        if (mapped !== undefined) {
          out += mapped;
          hits++;
          total++;
          i += len;
          matched = true;
          break;
        }
      }
    }
    if (!matched) {
      total++;
      if (minStep === 1 && bytes[i] >= 0x20 && bytes[i] <= 0x7e) {
        out += String.fromCharCode(bytes[i]);
      } else if (minStep === 2 && i + 1 < bytes.length) {
        const u = (bytes[i] << 8) | bytes[i + 1];
        if (u >= 0x20 && u <= 0x7e) out += String.fromCharCode(u);
      }
      i += Math.min(minStep, bytes.length - i);
    }
  }
  return { text: out, hits, total };
}

function decodeUtf16Be(bytes: Uint8Array): string {
  let out = "";
  for (let i = 0; i + 1 < bytes.length; i += 2) {
    const code = (bytes[i] << 8) | bytes[i + 1];
    if (code !== 0) out += String.fromCharCode(code);
  }
  return out;
}

function decodeWinAnsi(bytes: Uint8Array): string {
  let out = "";
  for (let i = 0; i < bytes.length; i++) {
    const b = bytes[i];
    if (b >= 0x80 && b <= 0x9f) {
      const mapped = WIN_ANSI_128_159[b];
      if (mapped) out += String.fromCharCode(mapped);
    } else if (b >= 0x20 || b === 0x09 || b === 0x0a || b === 0x0d) {
      out += String.fromCharCode(b);
    }
  }
  return out;
}

function looksLikePrintableAscii(bytes: Uint8Array): boolean {
  if (!bytes.length) return true;
  for (let i = 0; i < bytes.length; i++) {
    const b = bytes[i];
    if (!(b === 0x09 || b === 0x0a || b === 0x0d || (b >= 0x20 && b <= 0x7e))) {
      return false;
    }
  }
  return true;
}

function looksLikeUtf16BeWithoutBom(bytes: Uint8Array): boolean {
  if (bytes.length < 2 || bytes.length % 2 !== 0) return false;
  let plausible = 0;
  const pairs = bytes.length / 2;
  for (let i = 0; i < bytes.length; i += 2) {
    const u = (bytes[i] << 8) | bytes[i + 1];
    if (
      (u >= 0x20 && u <= 0x7e) ||
      (u >= 0x4e00 && u <= 0x9fff) ||
      (u >= 0x3000 && u <= 0x303f) ||
      (u >= 0xff00 && u <= 0xffef)
    ) {
      plausible++;
    }
  }
  return plausible / pairs >= 0.7;
}

function decodePdfStringBytes(
  bytes: Uint8Array,
  isHex: boolean,
  fontCMap: CMapData | undefined,
  fallbackCMap: CMapData | undefined,
): string {
  if (!bytes.length) return "";

  // 1) UTF-16BE BOM (<FEFF...>) 优先直接解码
  if (bytes.length >= 2 && bytes[0] === 0xfe && bytes[1] === 0xff) {
    return decodeUtf16Be(bytes.subarray(2));
  }
  // 2) UTF-8 BOM
  if (bytes.length >= 3 && bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) {
    return decodeTextBytes(bytes);
  }

  // 3) 字体专属 /ToUnicode CMap
  if (fontCMap) {
    const res = decodeWithCMap(bytes, fontCMap);
    if (res.hits > 0 || res.text.length > 0) return res.text;
  }

  // 4) 若无专属 CMap 但 hex 串命中全局 CMap
  if (isHex && fallbackCMap) {
    const res = decodeWithCMap(bytes, fallbackCMap);
    if (res.total > 0 && res.hits / res.total >= 0.5) return res.text;
  }

  // 5) 纯 ASCII 字面量 / Hex
  if (looksLikePrintableAscii(bytes)) {
    return decodeWinAnsi(bytes);
  }

  // 6) 无 BOM 的 UTF-16BE（常见中文 / 含高字节 0x00 的十六进制串）
  if (isHex && looksLikeUtf16BeWithoutBom(bytes)) {
    return decodeUtf16Be(bytes);
  }

  // 7) 尝试 UTF-8 / GBK，最后回落 WinAnsi
  if (typeof TextDecoder !== "undefined") {
    try {
      return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    } catch {
      // 非合法 UTF-8
    }
  }
  if (looksLikeUtf16BeWithoutBom(bytes)) {
    return decodeUtf16Be(bytes);
  }
  return decodeWinAnsi(bytes);
}

/* -------------------------------------------------------------------------- */
/*  内容流词法分析与文本状态机（BT/ET、Td/TD/Tm/T*、Tj/TJ/'/"、q/Q/cm）        */
/* -------------------------------------------------------------------------- */

function tokenizeContentStream(src: string): ContentToken[] {
  const tokens: ContentToken[] = [];
  let i = 0;

  const parseLiteralString = (): Uint8Array => {
    // src[i] === '('
    i++;
    const out: number[] = [];
    let depth = 1;
    while (i < src.length && depth > 0) {
      const ch = src.charCodeAt(i);
      if (ch === 0x5c) {
        // backslash escape
        i++;
        if (i >= src.length) break;
        const esc = src.charCodeAt(i);
        if (esc === 0x6e) { out.push(0x0a); i++; } // \n
        else if (esc === 0x72) { out.push(0x0d); i++; } // \r
        else if (esc === 0x74) { out.push(0x09); i++; } // \t
        else if (esc === 0x62) { out.push(0x08); i++; } // \b
        else if (esc === 0x66) { out.push(0x0c); i++; } // \f
        else if (esc === 0x28 || esc === 0x29 || esc === 0x5c) { out.push(esc); i++; }
        else if (esc === 0x0d) {
          i++;
          if (src.charCodeAt(i) === 0x0a) i++;
        } else if (esc === 0x0a) {
          i++;
        } else if (esc >= 0x30 && esc <= 0x37) {
          // 1~3 位八进制转义
          let oct = esc - 0x30;
          i++;
          for (let k = 0; k < 2 && i < src.length; k++) {
            const d = src.charCodeAt(i);
            if (d >= 0x30 && d <= 0x37) {
              oct = (oct << 3) | (d - 0x30);
              i++;
            } else {
              break;
            }
          }
          out.push(oct & 0xff);
        } else {
          out.push(esc & 0xff);
          i++;
        }
      } else if (ch === 0x28) {
        depth++;
        out.push(ch);
        i++;
      } else if (ch === 0x29) {
        depth--;
        if (depth > 0) out.push(ch);
        i++;
      } else if (ch === 0x0d) {
        // PDF 规范：字面量未转义 CR/CRLF 统一归一化为 LF
        out.push(0x0a);
        i++;
        if (src.charCodeAt(i) === 0x0a) i++;
      } else {
        out.push(ch & 0xff);
        i++;
      }
    }
    return new Uint8Array(out);
  };

  const parseHexString = (): Uint8Array => {
    // src[i] === '<'
    i++;
    const digits: number[] = [];
    while (i < src.length && src.charCodeAt(i) !== 0x3e) {
      const c = src.charCodeAt(i);
      if (c >= 0x30 && c <= 0x39) digits.push(c - 0x30);
      else if (c >= 0x41 && c <= 0x46) digits.push(c - 55);
      else if (c >= 0x61 && c <= 0x66) digits.push(c - 87);
      i++;
    }
    if (i < src.length && src.charCodeAt(i) === 0x3e) i++;
    if (digits.length % 2 === 1) digits.push(0);
    const out = new Uint8Array(digits.length / 2);
    for (let k = 0; k < out.length; k++) {
      out[k] = (digits[k * 2] << 4) | digits[k * 2 + 1];
    }
    return out;
  };

  const parseNext = (): ContentToken | null => {
    while (i < src.length) {
      const ch = src.charCodeAt(i);
      if (isPdfWhitespace(ch)) {
        i++;
        continue;
      }
      if (ch === 0x25) {
        while (i < src.length && src.charCodeAt(i) !== 0x0a && src.charCodeAt(i) !== 0x0d) {
          i++;
        }
        continue;
      }
      if (ch === 0x28) {
        return { type: "string", bytes: parseLiteralString(), isHex: false };
      }
      if (ch === 0x3c) {
        if (src.charCodeAt(i + 1) === 0x3c) {
          // 跳过内联字典 << ... >>（如 BDC 属性）
          const d = readBalancedDict(src, i);
          i = d ? d.end : i + 2;
          continue;
        }
        return { type: "string", bytes: parseHexString(), isHex: true };
      }
      if (ch === 0x5b) {
        i++;
        const items: ContentToken[] = [];
        while (i < src.length) {
          while (i < src.length && isPdfWhitespace(src.charCodeAt(i))) i++;
          if (i >= src.length || src.charCodeAt(i) === 0x5d) {
            i++;
            break;
          }
          const tok = parseNext();
          if (tok) items.push(tok);
        }
        return { type: "array", items };
      }
      if (
        ch === 0x5d ||
        ch === 0x3e ||
        ch === 0x29 ||
        ch === 0x7b ||
        ch === 0x7d
      ) {
        i++;
        continue;
      }
      if (ch === 0x2f) {
        i++;
        let raw = "";
        while (i < src.length && !isPdfDelimiter(src.charCodeAt(i))) {
          raw += src[i++];
        }
        const decodedName = raw.replace(/#([0-9A-Fa-f]{2})/g, (_, h) =>
          String.fromCharCode(parseInt(h, 16)),
        );
        return { type: "name", value: decodedName };
      }
      // 数字或运算符
      const start = i;
      while (i < src.length && !isPdfDelimiter(src.charCodeAt(i))) i++;
      if (i === start) {
        i++;
        continue;
      }
      const word = src.slice(start, i);
      if (/^[+-]?(?:\d+\.?\d*|\.\d+)$/.test(word)) {
        return { type: "number", value: Number(word) };
      }
      return { type: "operator", value: word };
    }
    return null;
  };

  while (i < src.length) {
    const tok = parseNext();
    if (!tok) break;
    tokens.push(tok);
  }
  return tokens;
}

/** PDF 行向量矩阵乘法：local × parent */
function mulMatrix(m1: Matrix6, m2: Matrix6): Matrix6 {
  const [a1, b1, c1, d1, e1, f1] = m1;
  const [a2, b2, c2, d2, e2, f2] = m2;
  return [
    a1 * a2 + b1 * c2,
    a1 * b2 + b1 * d2,
    c1 * a2 + d1 * c2,
    c1 * b2 + d1 * d2,
    e1 * a2 + f1 * c2 + e2,
    e1 * b2 + f1 * d2 + f2,
  ];
}

function estimateTextWidth(text: string, fontSize: number): number {
  let units = 0;
  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i);
    if (code >= 0x2e80) units += 1.0;
    else if (code === 0x20) units += 0.3;
    else units += 0.54;
  }
  return units * fontSize;
}

function isCjkChar(ch: string): boolean {
  if (!ch) return false;
  const c = ch.charCodeAt(0);
  return (c >= 0x2e80 && c <= 0x9fff) || (c >= 0xf900 && c <= 0xfaff) || (c >= 0xff00 && c <= 0xffef);
}

interface PageResources {
  fontCMaps: Map<string, CMapData>;
  xObjects: Map<string, string>;
}

function extractFragmentsFromStream(
  streamText: string,
  resources: PageResources,
  globalFontCMaps: Map<string, CMapData>,
  fallbackCMap: CMapData | undefined,
  objects: Map<string, PdfIndirectObject>,
  objectCMaps: Map<string, CMapData>,
  initialCtm: Matrix6,
  fragments: TextFragment[],
  depth = 0,
): void {
  if (depth > 6) return;
  const tokens = tokenizeContentStream(streamText);
  const operands: ContentToken[] = [];

  let ctm: Matrix6 = [...initialCtm];
  const ctmStack: Matrix6[] = [];

  let inText = false;
  let tm: Matrix6 = [1, 0, 0, 1, 0, 0];
  let tlm: Matrix6 = [1, 0, 0, 1, 0, 0];
  let leading = 0;
  let fontName = "";
  let fontSize = 12;

  const numAt = (idx: number, fallback = 0): number => {
    const tok = operands[idx];
    return tok && tok.type === "number" && Number.isFinite(tok.value)
      ? tok.value
      : fallback;
  };

  const resolveActiveCMap = (): CMapData | undefined =>
    resources.fontCMaps.get(fontName) ?? globalFontCMaps.get(fontName);

  const effectiveFontSize = (): number => {
    const scaleTm = Math.hypot(tm[0], tm[1]) || 1;
    const scaleCtm = Math.hypot(ctm[0], ctm[1]) || 1;
    const fs = Math.abs(fontSize) * scaleTm * scaleCtm;
    return Number.isFinite(fs) && fs > 0.5 ? fs : 12;
  };

  const currentPoint = (): { x: number; y: number } => {
    const combined = mulMatrix(tm, ctm);
    return { x: combined[4], y: combined[5] };
  };

  const advanceTm = (deltaTextUnits: number) => {
    tm = mulMatrix([1, 0, 0, 1, deltaTextUnits, 0], tm);
  };

  const emitText = (text: string) => {
    if (!text) return;
    const fs = effectiveFontSize();
    const { x, y } = currentPoint();
    const width = estimateTextWidth(text, fs);
    fragments.push({
      text,
      x,
      y,
      fontSize: fs,
      width,
      seq: fragments.length,
    });
    const scaleTm = Math.hypot(tm[0], tm[1]) || 1;
    const scaleCtm = Math.hypot(ctm[0], ctm[1]) || 1;
    const denom = scaleTm * scaleCtm || 1;
    advanceTm(width / denom);
  };

  const handleTj = (tok: ContentToken | undefined) => {
    if (!tok || tok.type !== "string") return;
    const decoded = decodePdfStringBytes(
      tok.bytes,
      tok.isHex,
      resolveActiveCMap(),
      fallbackCMap,
    );
    emitText(decoded);
  };

  const handleTJ = (tok: ContentToken | undefined) => {
    if (!tok || tok.type !== "array") return;
    const activeCMap = resolveActiveCMap();
    let buffer = "";
    const flush = () => {
      if (buffer) {
        emitText(buffer);
        buffer = "";
      }
    };

    for (const item of tok.items) {
      if (item.type === "string") {
        buffer += decodePdfStringBytes(item.bytes, item.isHex, activeCMap, fallbackCMap);
      } else if (item.type === "number") {
        // PDF TJ 数组里的负数表示向右移动（千分之一字号）
        const shiftRight = -item.value;
        if (shiftRight >= 900) {
          flush();
          advanceTm((shiftRight / 1000) * Math.abs(fontSize || 12));
        } else if (shiftRight >= 180) {
          if (buffer && !buffer.endsWith(" ")) {
            const lastChar = buffer[buffer.length - 1];
            if (!isCjkChar(lastChar) || shiftRight >= 450) {
              buffer += " ";
            }
          }
        }
      }
    }
    flush();
  };

  for (const tok of tokens) {
    if (tok.type !== "operator") {
      operands.push(tok);
      continue;
    }

    const op = tok.value;
    switch (op) {
      case "q":
        ctmStack.push([...ctm]);
        break;
      case "Q":
        if (ctmStack.length) ctm = ctmStack.pop()!;
        break;
      case "cm":
        if (operands.length >= 6) {
          const base = operands.length - 6;
          const m: Matrix6 = [
            numAt(base),
            numAt(base + 1),
            numAt(base + 2),
            numAt(base + 3),
            numAt(base + 4),
            numAt(base + 5),
          ];
          ctm = mulMatrix(m, ctm);
        }
        break;
      case "BT":
        inText = true;
        tm = [1, 0, 0, 1, 0, 0];
        tlm = [1, 0, 0, 1, 0, 0];
        break;
      case "ET":
        inText = false;
        break;
      case "Tf":
        if (operands.length >= 2) {
          const nameTok = operands[operands.length - 2];
          if (nameTok.type === "name") fontName = nameTok.value;
          const sizeVal = numAt(operands.length - 1, 12);
          if (sizeVal !== 0) fontSize = sizeVal;
        }
        break;
      case "TL":
        if (operands.length >= 1) {
          leading = numAt(operands.length - 1, 0);
        }
        break;
      case "Tm":
        if (inText && operands.length >= 6) {
          const base = operands.length - 6;
          tm = [
            numAt(base),
            numAt(base + 1),
            numAt(base + 2),
            numAt(base + 3),
            numAt(base + 4),
            numAt(base + 5),
          ];
          tlm = [...tm];
        }
        break;
      case "Td":
        if (inText && operands.length >= 2) {
          const tx = numAt(operands.length - 2, 0);
          const ty = numAt(operands.length - 1, 0);
          tlm = mulMatrix([1, 0, 0, 1, tx, ty], tlm);
          tm = [...tlm];
        }
        break;
      case "TD":
        if (inText && operands.length >= 2) {
          const tx = numAt(operands.length - 2, 0);
          const ty = numAt(operands.length - 1, 0);
          leading = -ty;
          tlm = mulMatrix([1, 0, 0, 1, tx, ty], tlm);
          tm = [...tlm];
        }
        break;
      case "T*":
        if (inText) {
          tlm = mulMatrix([1, 0, 0, 1, 0, -leading], tlm);
          tm = [...tlm];
        }
        break;
      case "Tj":
        if (inText && operands.length >= 1) {
          handleTj(operands[operands.length - 1]);
        }
        break;
      case "TJ":
        if (inText && operands.length >= 1) {
          handleTJ(operands[operands.length - 1]);
        }
        break;
      case "'":
        if (inText && operands.length >= 1) {
          tlm = mulMatrix([1, 0, 0, 1, 0, -leading], tlm);
          tm = [...tlm];
          handleTj(operands[operands.length - 1]);
        }
        break;
      case '"':
        if (inText && operands.length >= 1) {
          tlm = mulMatrix([1, 0, 0, 1, 0, -leading], tlm);
          tm = [...tlm];
          handleTj(operands[operands.length - 1]);
        }
        break;
      case "Do":
        if (operands.length >= 1) {
          const xTok = operands[operands.length - 1];
          if (xTok.type === "name") {
            const xObjId = resources.xObjects.get(xTok.value);
            const xObj = xObjId ? objects.get(xObjId) : undefined;
            if (xObj && xObj.rawStream && /\/Subtype\s*\/Form\b/.test(xObj.dict)) {
              const decoded = decodePdfStream(xObj.dict, xObj.rawStream);
              if (decoded) {
                const formRes = resolveResourcesFromDict(xObj.dict, objects, objectCMaps);
                const mergedRes: PageResources = {
                  fontCMaps: new Map([...resources.fontCMaps, ...formRes.fontCMaps]),
                  xObjects: new Map([...resources.xObjects, ...formRes.xObjects]),
                };
                const matMatch = xObj.dict.match(
                  /\/Matrix\s*\[\s*([+-]?[\d.]+)\s+([+-]?[\d.]+)\s+([+-]?[\d.]+)\s+([+-]?[\d.]+)\s+([+-]?[\d.]+)\s+([+-]?[\d.]+)\s*\]/,
                );
                const formCtm = matMatch
                  ? mulMatrix(
                      [
                        Number(matMatch[1]),
                        Number(matMatch[2]),
                        Number(matMatch[3]),
                        Number(matMatch[4]),
                        Number(matMatch[5]),
                        Number(matMatch[6]),
                      ],
                      ctm,
                    )
                  : ctm;
                extractFragmentsFromStream(
                  bytesToLatin1(decoded),
                  mergedRes,
                  globalFontCMaps,
                  fallbackCMap,
                  objects,
                  objectCMaps,
                  formCtm,
                  fragments,
                  depth + 1,
                );
              }
            }
          }
        }
        break;
      default:
        break;
    }

    operands.length = 0;
  }
}

/* -------------------------------------------------------------------------- */
/*  资源字典、页面遍历与 Y 坐标行聚类（还原表格 TSV）                           */
/* -------------------------------------------------------------------------- */

function extractSubDict(dict: string, key: string): string | null {
  const re = new RegExp(`\\/${key}\\s*<<`);
  const m = re.exec(dict);
  if (!m) return null;
  const openPos = m.index + m[0].length - 2;
  const res = readBalancedDict(dict, openPos);
  return res ? res.text : null;
}

function resolveRefOrSubDict(
  dict: string,
  key: string,
  objects: Map<string, PdfIndirectObject>,
): string | null {
  const inline = extractSubDict(dict, key);
  if (inline) return inline;
  const refRe = new RegExp(`\\/${key}\\s+(\\d+)\\s+(\\d+)\\s+R`);
  const refMatch = refRe.exec(dict);
  if (!refMatch) return null;
  const target = objects.get(`${refMatch[1]} ${refMatch[2]}`);
  return target?.dict || null;
}

function resolveFontCMap(
  fontObjId: string,
  objects: Map<string, PdfIndirectObject>,
  objectCMaps: Map<string, CMapData>,
): CMapData | undefined {
  const fontObj = objects.get(fontObjId);
  if (!fontObj?.dict) return undefined;
  const toUni = fontObj.dict.match(/\/ToUnicode\s+(\d+)\s+(\d+)\s+R/);
  if (toUni) {
    return objectCMaps.get(`${toUni[1]} ${toUni[2]}`);
  }
  return undefined;
}

function resolveResourcesFromDict(
  dict: string,
  objects: Map<string, PdfIndirectObject>,
  objectCMaps: Map<string, CMapData>,
): PageResources {
  const fontCMaps = new Map<string, CMapData>();
  const xObjects = new Map<string, string>();
  const resDict = resolveRefOrSubDict(dict, "Resources", objects);
  if (!resDict) return { fontCMaps, xObjects };

  const fontDict = resolveRefOrSubDict(resDict, "Font", objects);
  if (fontDict) {
    const entryRe = /\/([^\s\/<>[\]()%]+)\s+(\d+)\s+(\d+)\s+R/g;
    let m: RegExpExecArray | null;
    while ((m = entryRe.exec(fontDict)) !== null) {
      const cmap = resolveFontCMap(`${m[2]} ${m[3]}`, objects, objectCMaps);
      if (cmap) fontCMaps.set(m[1], cmap);
    }
  }

  const xObjDict = resolveRefOrSubDict(resDict, "XObject", objects);
  if (xObjDict) {
    const entryRe = /\/([^\s\/<>[\]()%]+)\s+(\d+)\s+(\d+)\s+R/g;
    let m: RegExpExecArray | null;
    while ((m = entryRe.exec(xObjDict)) !== null) {
      xObjects.set(m[1], `${m[2]} ${m[3]}`);
    }
  }

  return { fontCMaps, xObjects };
}

function collectOrderedPageIds(objects: Map<string, PdfIndirectObject>): string[] {
  const ordered: string[] = [];
  const visited = new Set<string>();

  const walk = (id: string) => {
    if (visited.has(id)) return;
    visited.add(id);
    const obj = objects.get(id);
    if (!obj?.dict) return;
    if (/\/Type\s*\/Page\b/.test(obj.dict) && !/\/Type\s*\/Pages\b/.test(obj.dict)) {
      ordered.push(id);
      return;
    }
    const kidsMatch = obj.dict.match(/\/Kids\s*\[([\s\S]*?)\]/);
    if (kidsMatch) {
      for (const m of kidsMatch[1].matchAll(/(\d+)\s+(\d+)\s+R/g)) {
        walk(`${m[1]} ${m[2]}`);
      }
    }
  };

  for (const obj of objects.values()) {
    if (/\/Type\s*\/Catalog\b/.test(obj.dict)) {
      const pagesRef = obj.dict.match(/\/Pages\s+(\d+)\s+(\d+)\s+R/);
      if (pagesRef) walk(`${pagesRef[1]} ${pagesRef[2]}`);
    }
  }

  // 若 Catalog 缺失或未遍历全，补录全部 /Type /Page 对象
  for (const obj of objects.values()) {
    if (
      /\/Type\s*\/Page\b/.test(obj.dict) &&
      !/\/Type\s*\/Pages\b/.test(obj.dict) &&
      !visited.has(obj.id)
    ) {
      ordered.push(obj.id);
    }
  }
  return ordered;
}

function resolvePageContentIds(
  pageDict: string,
  objects: Map<string, PdfIndirectObject>,
): string[] {
  const arrMatch = pageDict.match(/\/Contents\s*\[([\s\S]*?)\]/);
  if (arrMatch) {
    return [...arrMatch[1].matchAll(/(\d+)\s+(\d+)\s+R/g)].map(
      (m) => `${m[1]} ${m[2]}`,
    );
  }
  const singleMatch = pageDict.match(/\/Contents\s+(\d+)\s+(\d+)\s+R/);
  if (!singleMatch) return [];
  const refId = `${singleMatch[1]} ${singleMatch[2]}`;
  const target = objects.get(refId);
  if (target && !target.rawStream && target.body.startsWith("[")) {
    return [...target.body.matchAll(/(\d+)\s+(\d+)\s+R/g)].map(
      (m) => `${m[1]} ${m[2]}`,
    );
  }
  return [refId];
}

function resolveInheritedResources(
  pageObj: PdfIndirectObject,
  objects: Map<string, PdfIndirectObject>,
  objectCMaps: Map<string, CMapData>,
): PageResources {
  const chain: PdfIndirectObject[] = [];
  const seen = new Set<string>();
  let cur: PdfIndirectObject | undefined = pageObj;
  while (cur && !seen.has(cur.id)) {
    seen.add(cur.id);
    chain.push(cur);
    const parentRef: RegExpMatchArray | null = cur.dict.match(
      /\/Parent\s+(\d+)\s+(\d+)\s+R/,
    );
    cur = parentRef ? objects.get(`${parentRef[1]} ${parentRef[2]}`) : undefined;
  }
  const fontCMaps = new Map<string, CMapData>();
  const xObjects = new Map<string, string>();
  // 从顶层向当前页覆盖合并
  for (let i = chain.length - 1; i >= 0; i--) {
    const res = resolveResourcesFromDict(chain[i].dict, objects, objectCMaps);
    for (const [k, v] of res.fontCMaps) fontCMaps.set(k, v);
    for (const [k, v] of res.xObjects) xObjects.set(k, v);
  }
  return { fontCMaps, xObjects };
}

function groupFragmentsToLines(fragments: TextFragment[]): string[] {
  const valid = fragments
    .map((f) => ({ ...f, text: f.text.replace(/[\r\n]+/g, " ") }))
    .filter((f) => f.text.trim().length > 0);
  if (!valid.length) return [];

  const sizes = valid.map((f) => f.fontSize).sort((a, b) => a - b);
  const medFontSize = sizes[Math.floor(sizes.length / 2)] || 12;
  const rowTol = Math.max(2.5, medFontSize * 0.45);

  // PDF 坐标系 Y 轴向上，从上到下按 Y 降序排列
  const sorted = [...valid].sort((a, b) => b.y - a.y || a.x - b.x || a.seq - b.seq);
  const rows: { y: number; items: TextFragment[] }[] = [];

  for (const frag of sorted) {
    const last = rows[rows.length - 1];
    if (last && Math.abs(frag.y - last.y) <= rowTol) {
      last.items.push(frag);
    } else {
      rows.push({ y: frag.y, items: [frag] });
    }
  }

  const lines: string[] = [];
  for (const row of rows) {
    const items = row.items.sort((a, b) => a.x - b.x || a.seq - b.seq);
    let line = "";
    let prev: TextFragment | null = null;
    for (const item of items) {
      const piece = item.text;
      if (!prev) {
        line = piece;
      } else {
        const fs = Math.max(prev.fontSize, item.fontSize, 8);
        const gap = item.x - (prev.x + prev.width);
        const tabThreshold = Math.max(fs * 0.8, 8);
        const spaceThreshold = Math.max(fs * 0.25, 2.5);
        const prevTrim = line.trimEnd();
        const nextTrim = piece.trimStart();
        if (gap >= tabThreshold) {
          line = `${prevTrim}\t${nextTrim}`;
        } else if (gap >= spaceThreshold) {
          const prevChar = prevTrim[prevTrim.length - 1] ?? "";
          const nextChar = nextTrim[0] ?? "";
          if (isCjkChar(prevChar) && isCjkChar(nextChar)) {
            line = prevTrim + nextTrim;
          } else {
            line = `${prevTrim} ${nextTrim}`;
          }
        } else {
          line += piece;
        }
      }
      prev = item;
    }

    const cleaned = line
      .split("\t")
      .map((cell) => cell.replace(/\s+/g, " ").trim())
      .join("\t")
      .replace(/\t+$/, "");
    if (cleaned.replace(/\t/g, "").trim().length > 0) {
      lines.push(cleaned);
    }
  }
  return lines;
}

/**
 * 纯 TS 解析大学教务课表 / 成绩单 PDF 字节为按行聚类的文本（表格列以 Tab 分隔）。
 * 若 PDF 为纯图片扫描件（未提取到任何文字操作符），抛出友好引导错误。
 */
export function parsePdfToText(bytes: Uint8Array): string {
  if (!bytes || bytes.length < 8) {
    throw new Error("PDF 文件为空或已损坏");
  }

  const head = bytesToLatin1(bytes.subarray(0, Math.min(1024, bytes.length)));
  if (!head.includes("%PDF-")) {
    throw new Error("文件不是有效的 PDF 文档");
  }

  const latin1 = bytesToLatin1(bytes);
  const isEncrypted = /\/Encrypt\s+(?:\d+\s+\d+\s+R|<<)/.test(latin1);

  const { objects, standaloneStreams } = parseIndirectObjects(bytes, latin1);

  // 第 1 遍：解压流并识别所有 /ToUnicode CMap
  const decodedStreams = new Map<string, Uint8Array>();
  const objectCMaps = new Map<string, CMapData>();
  const mergedCMapMap = new Map<string, string>();
  const mergedLengths = new Set<number>();

  for (const obj of objects.values()) {
    if (!obj.rawStream) continue;
    if (/\/Type\s*\/ObjStm\b/.test(obj.dict) || /\/Type\s*\/XRef\b/.test(obj.dict)) {
      continue;
    }
    const decoded = decodePdfStream(obj.dict, obj.rawStream);
    if (!decoded) continue;
    decodedStreams.set(obj.id, decoded);

    const text = bytesToLatin1(decoded);
    const cmap = parseToUnicodeCMap(text);
    if (cmap) {
      objectCMaps.set(obj.id, cmap);
      for (const [k, v] of cmap.map) {
        if (!mergedCMapMap.has(k)) mergedCMapMap.set(k, v);
      }
      for (const l of cmap.byteLengths) mergedLengths.add(l);
    }
  }

  for (const st of standaloneStreams) {
    const cmap = parseToUnicodeCMap(bytesToLatin1(st.data));
    if (cmap) {
      for (const [k, v] of cmap.map) {
        if (!mergedCMapMap.has(k)) mergedCMapMap.set(k, v);
      }
      for (const l of cmap.byteLengths) mergedLengths.add(l);
    }
  }

  // 全局字体名 -> CMap 兜底索引
  const globalFontCMaps = new Map<string, CMapData>();
  for (const obj of objects.values()) {
    if (!obj.dict) continue;
    const res = resolveResourcesFromDict(obj.dict, objects, objectCMaps);
    for (const [fontKey, cmap] of res.fontCMaps) {
      if (!globalFontCMaps.has(fontKey)) globalFontCMaps.set(fontKey, cmap);
    }
  }

  const fallbackCMap: CMapData | undefined =
    mergedCMapMap.size > 0
      ? {
          map: mergedCMapMap,
          byteLengths: [...mergedLengths].sort((a, b) => b - a),
          codespaceByteLengths: [],
        }
      : undefined;

  // 第 2 遍：按页提取文本片段并按 Y 坐标聚类成行
  const pageIds = collectOrderedPageIds(objects);
  const allPageLines: string[] = [];
  const usedContentIds = new Set<string>();

  for (const pageId of pageIds) {
    const pageObj = objects.get(pageId);
    if (!pageObj) continue;
    const resources = resolveInheritedResources(pageObj, objects, objectCMaps);
    const contentIds = resolvePageContentIds(pageObj.dict, objects);
    const pageFragments: TextFragment[] = [];

    // 同一页的多个内容流按顺序拼接后再解析（兼容跨流 BT/ET 与图形状态）
    const combinedParts: string[] = [];
    for (const cid of contentIds) {
      usedContentIds.add(cid);
      const data = decodedStreams.get(cid);
      if (data) combinedParts.push(bytesToLatin1(data));
    }
    if (combinedParts.length) {
      extractFragmentsFromStream(
        combinedParts.join("\n"),
        resources,
        globalFontCMaps,
        fallbackCMap,
        objects,
        objectCMaps,
        [1, 0, 0, 1, 0, 0],
        pageFragments,
      );
      allPageLines.push(...groupFragmentsToLines(pageFragments));
    }
  }

  // 兜底：若页面树不完整导致没有提取到任何文本，扫描其余含 BT/ET 的内容流
  if (!allPageLines.length) {
    const emptyRes: PageResources = {
      fontCMaps: new Map(),
      xObjects: new Map(),
    };
    for (const [id, data] of decodedStreams) {
      if (usedContentIds.has(id) || objectCMaps.has(id)) continue;
      const text = bytesToLatin1(data);
      if (!text.includes("BT") || !text.includes("ET")) continue;
      const frags: TextFragment[] = [];
      extractFragmentsFromStream(
        text,
        emptyRes,
        globalFontCMaps,
        fallbackCMap,
        objects,
        objectCMaps,
        [1, 0, 0, 1, 0, 0],
        frags,
      );
      allPageLines.push(...groupFragmentsToLines(frags));
    }
    for (const st of standaloneStreams) {
      const text = bytesToLatin1(st.data);
      if (!text.includes("BT") || !text.includes("ET")) continue;
      const frags: TextFragment[] = [];
      extractFragmentsFromStream(
        text,
        emptyRes,
        globalFontCMaps,
        fallbackCMap,
        objects,
        objectCMaps,
        [1, 0, 0, 1, 0, 0],
        frags,
      );
      allPageLines.push(...groupFragmentsToLines(frags));
    }
  }

  const output = allPageLines.join("\n").trim();
  if (!output) {
    throw new Error(isEncrypted ? ENCRYPTED_PDF_ERROR : SCAN_GUIDANCE_ERROR);
  }
  return output;
}
