import type { Course, CourseColor, Period } from "@/types";
import {
  addDays,
  mondayOf,
  parseIsoDate,
  periodAtTime,
  periodEndingAtTime,
  toIsoDate,
} from "@/utils/time";

const COLOR_VALUES: CourseColor[] = [
  "sky",
  "violet",
  "emerald",
  "amber",
  "rose",
  "cyan",
];

/* -------------------------------------------------------------------------- */
/*  编码自动识别（UTF-8 / GB18030 / GBK + 去 BOM）                             */
/* -------------------------------------------------------------------------- */

export function decodeTextBytes(bytes: Uint8Array): string {
  // 处理 UTF-16LE / UTF-16BE BOM（部分教务导出的 Unicode 表格文本）
  if (bytes.length >= 2 && bytes[0] === 0xff && bytes[1] === 0xfe) {
    const view = bytes.subarray(2);
    if (typeof TextDecoder !== "undefined") {
      try {
        return new TextDecoder("utf-16le").decode(view);
      } catch {
        // 兜底手动解码
      }
    }
    let out = "";
    for (let i = 0; i + 1 < view.length; i += 2) {
      out += String.fromCharCode(view[i] | (view[i + 1] << 8));
    }
    return out;
  }
  if (bytes.length >= 2 && bytes[0] === 0xfe && bytes[1] === 0xff) {
    const view = bytes.subarray(2);
    if (typeof TextDecoder !== "undefined") {
      try {
        return new TextDecoder("utf-16be").decode(view);
      } catch {
        // 兜底手动解码
      }
    }
    let out = "";
    for (let i = 0; i + 1 < view.length; i += 2) {
      out += String.fromCharCode((view[i] << 8) | view[i + 1]);
    }
    return out;
  }

  const hasBom =
    bytes.length >= 3 &&
    bytes[0] === 0xef &&
    bytes[1] === 0xbb &&
    bytes[2] === 0xbf;
  const view = hasBom ? bytes.subarray(3) : bytes;

  if (typeof TextDecoder !== "undefined") {
    try {
      return new TextDecoder("utf-8", { fatal: true }).decode(view);
    } catch {
      // 常见中文 Excel 导出 CSV 使用 GBK / GB18030
      for (const encoding of ["gb18030", "gbk"]) {
        try {
          return new TextDecoder(encoding).decode(view);
        } catch {
          // 尝试下一个编码
        }
      }
      return new TextDecoder("utf-8").decode(view);
    }
  }

  // 兜底 UTF-8 手动解码
  let out = "";
  for (let i = 0; i < view.length; i++) {
    out += String.fromCharCode(view[i]);
  }
  return out;
}

/* -------------------------------------------------------------------------- */
/*  HTML 表格与网页清洗（剔除 style/script，还原表格为紧凑 TSV）                 */
/* -------------------------------------------------------------------------- */

export function decodeEntities(input: string): string {
  return input
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&apos;|&#39;/gi, "'")
    .replace(/&#x([0-9a-fA-F]+);/g, (_, hex) => {
      const cp = parseInt(hex, 16);
      return Number.isFinite(cp) ? String.fromCodePoint(cp) : "";
    })
    .replace(/&#(\d+);/g, (_, dec) => {
      const cp = parseInt(dec, 10);
      return Number.isFinite(cp) ? String.fromCodePoint(cp) : "";
    });
}

export function cleanHtmlToText(html: string): string {
  const stripped = html
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/<(script|style|head|noscript|svg|iframe)[^>]*>[\s\S]*?<\/\1>/gi, "")
    .replace(/<br\s*\/?>/gi, " ")
    .replace(/<\/t[dh]\s*>/gi, "\t")
    .replace(/<\/tr\s*>/gi, "\n")
    .replace(/<\/(?:p|div|li|h[1-6]|section|article|table)\s*>/gi, "\n")
    .replace(/<[^>]+>/g, "");

  return decodeEntities(stripped)
    .split(/\r?\n/)
    .map((line) =>
      line
        .split("\t")
        .map((cell) => cell.replace(/\s+/g, " ").trim())
        .join("\t")
        .replace(/\t+$/, ""),
    )
    .filter((line) => line.replace(/\t/g, "").trim().length > 0)
    .join("\n");
}

/* -------------------------------------------------------------------------- */
/*  纯 TS RFC 1951 Inflate + ZIP + XLSX 工作表读取（零原生依赖）               */
/* -------------------------------------------------------------------------- */

const LEN_BASE = [
  3, 4, 5, 6, 7, 8, 9, 10, 11, 13, 15, 17, 19, 23, 27, 31, 35, 43, 51, 59, 67,
  83, 99, 115, 131, 163, 195, 227, 258,
];
const LEN_EXTRA = [
  0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 2, 2, 2, 2, 3, 3, 3, 3, 4, 4, 4, 4, 5, 5,
  5, 5, 0,
];
const DIST_BASE = [
  1, 2, 3, 4, 5, 7, 9, 13, 17, 25, 33, 49, 65, 97, 129, 193, 257, 385, 513,
  769, 1025, 1537, 2049, 3073, 4097, 6145, 8193, 12289, 16385, 24577,
];
const DIST_EXTRA = [
  0, 0, 0, 0, 1, 1, 2, 2, 3, 3, 4, 4, 5, 5, 6, 6, 7, 7, 8, 8, 9, 9, 10, 10, 11,
  11, 12, 12, 13, 13,
];
const CL_ORDER = [
  16, 17, 18, 0, 8, 7, 9, 6, 10, 5, 11, 4, 12, 3, 13, 2, 14, 1, 15,
];

interface HuffTable {
  counts: Int32Array;
  symbols: Int32Array;
  maxBits: number;
}

function buildHuffman(lengths: number[]): HuffTable {
  let maxBits = 0;
  const counts = new Int32Array(16);
  for (let i = 0; i < lengths.length; i++) {
    const len = lengths[i];
    if (len > 0) {
      counts[len]++;
      if (len > maxBits) maxBits = len;
    }
  }
  const offsets = new Int32Array(16);
  for (let i = 1; i < 15; i++) offsets[i + 1] = offsets[i] + counts[i];
  const symbols = new Int32Array(lengths.length);
  for (let i = 0; i < lengths.length; i++) {
    const len = lengths[i];
    if (len > 0) symbols[offsets[len]++] = i;
  }
  return { counts, symbols, maxBits };
}

const FIXED_LIT = (() => {
  const lens = new Array<number>(288);
  for (let i = 0; i <= 143; i++) lens[i] = 8;
  for (let i = 144; i <= 255; i++) lens[i] = 9;
  for (let i = 256; i <= 279; i++) lens[i] = 7;
  for (let i = 280; i <= 287; i++) lens[i] = 8;
  return buildHuffman(lens);
})();

const FIXED_DIST = buildHuffman(new Array<number>(32).fill(5));

/** 解压原始 DEFLATE 数据（ZIP method 8） */
export function inflateRaw(src: Uint8Array): Uint8Array {
  let pos = 0;
  let bitBuf = 0;
  let bitCnt = 0;

  const needBits = (n: number) => {
    while (bitCnt < n) {
      if (pos >= src.length) throw new Error("XLSX 压缩流不完整");
      bitBuf |= src[pos++] << bitCnt;
      bitCnt += 8;
    }
  };
  const readBits = (n: number): number => {
    if (n === 0) return 0;
    needBits(n);
    const val = bitBuf & ((1 << n) - 1);
    bitBuf >>>= n;
    bitCnt -= n;
    return val;
  };
  const decodeSym = (table: HuffTable): number => {
    let code = 0;
    let first = 0;
    let index = 0;
    for (let len = 1; len <= table.maxBits; len++) {
      code |= readBits(1);
      const count = table.counts[len];
      if (code - count < first) {
        return table.symbols[index + (code - first)];
      }
      index += count;
      first = (first + count) << 1;
      code <<= 1;
    }
    throw new Error("XLSX 哈夫曼编码无效");
  };

  let cap = Math.max(256, src.length * 4);
  let out = new Uint8Array(cap);
  let outLen = 0;
  const ensure = (extra: number) => {
    if (outLen + extra <= cap) return;
    while (outLen + extra > cap) cap *= 2;
    const grown = new Uint8Array(cap);
    grown.set(out.subarray(0, outLen));
    out = grown;
  };

  let bfinal = 0;
  do {
    bfinal = readBits(1);
    const btype = readBits(2);
    if (btype === 0) {
      // 无压缩块
      bitBuf = 0;
      bitCnt = 0;
      if (pos + 4 > src.length) throw new Error("XLSX 存储块损坏");
      const len = src[pos] | (src[pos + 1] << 8);
      const nlen = src[pos + 2] | (src[pos + 3] << 8);
      pos += 4;
      if ((len ^ 0xffff) !== nlen || pos + len > src.length) {
        throw new Error("XLSX 存储块校验失败");
      }
      ensure(len);
      out.set(src.subarray(pos, pos + len), outLen);
      outLen += len;
      pos += len;
      continue;
    }

    let litTable = FIXED_LIT;
    let distTable = FIXED_DIST;
    if (btype === 2) {
      const hlit = readBits(5) + 257;
      const hdist = readBits(5) + 1;
      const hclen = readBits(4) + 4;
      const clLens = new Array<number>(19).fill(0);
      for (let i = 0; i < hclen; i++) clLens[CL_ORDER[i]] = readBits(3);
      const clTable = buildHuffman(clLens);
      const lengths: number[] = [];
      const total = hlit + hdist;
      while (lengths.length < total) {
        const sym = decodeSym(clTable);
        if (sym < 16) {
          lengths.push(sym);
        } else if (sym === 16) {
          const rep = readBits(2) + 3;
          const prev = lengths[lengths.length - 1] ?? 0;
          for (let r = 0; r < rep; r++) lengths.push(prev);
        } else if (sym === 17) {
          const rep = readBits(3) + 3;
          for (let r = 0; r < rep; r++) lengths.push(0);
        } else if (sym === 18) {
          const rep = readBits(7) + 11;
          for (let r = 0; r < rep; r++) lengths.push(0);
        }
      }
      litTable = buildHuffman(lengths.slice(0, hlit));
      distTable = buildHuffman(lengths.slice(hlit, total));
    } else if (btype !== 1) {
      throw new Error("不支持的 XLSX 压缩类型");
    }

    while (true) {
      const sym = decodeSym(litTable);
      if (sym < 256) {
        ensure(1);
        out[outLen++] = sym;
      } else if (sym === 256) {
        break;
      } else {
        const lenIdx = sym - 257;
        if (lenIdx < 0 || lenIdx >= LEN_BASE.length) {
          throw new Error("XLSX 长度码越界");
        }
        const length = LEN_BASE[lenIdx] + readBits(LEN_EXTRA[lenIdx]);
        const distSym = decodeSym(distTable);
        if (distSym < 0 || distSym >= DIST_BASE.length) {
          throw new Error("XLSX 距离码越界");
        }
        const dist = DIST_BASE[distSym] + readBits(DIST_EXTRA[distSym]);
        if (dist > outLen) throw new Error("XLSX 回溯偏移越界");
        ensure(length);
        for (let k = 0; k < length; k++) {
          out[outLen] = out[outLen - dist];
          outLen++;
        }
      }
    }
  } while (!bfinal);

  return out.subarray(0, outLen);
}

function readZipEntries(bytes: Uint8Array): Map<string, Uint8Array> {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let eocd = -1;
  const minOffset = Math.max(0, bytes.length - 65557);
  for (let i = bytes.length - 22; i >= minOffset; i--) {
    if (view.getUint32(i, true) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw new Error("文件不是有效的 XLSX（ZIP）表格");

  const cdCount = view.getUint16(eocd + 10, true);
  const cdOffset = view.getUint32(eocd + 16, true);
  const entries = new Map<string, Uint8Array>();

  let offset = cdOffset;
  for (let i = 0; i < cdCount; i++) {
    if (offset + 46 > bytes.length || view.getUint32(offset, true) !== 0x02014b50) {
      break;
    }
    const method = view.getUint16(offset + 10, true);
    const compSize = view.getUint32(offset + 20, true);
    const nameLen = view.getUint16(offset + 28, true);
    const extraLen = view.getUint16(offset + 30, true);
    const commentLen = view.getUint16(offset + 32, true);
    const localHeaderOffset = view.getUint32(offset + 42, true);
    const name = decodeTextBytes(
      bytes.subarray(offset + 46, offset + 46 + nameLen),
    );
    offset += 46 + nameLen + extraLen + commentLen;

    if (
      name === "xl/sharedStrings.xml" ||
      /^xl\/worksheets\/sheet\d+\.xml$/i.test(name)
    ) {
      if (
        localHeaderOffset + 30 > bytes.length ||
        view.getUint32(localHeaderOffset, true) !== 0x04034b50
      ) {
        continue;
      }
      const lNameLen = view.getUint16(localHeaderOffset + 26, true);
      const lExtraLen = view.getUint16(localHeaderOffset + 28, true);
      const dataStart = localHeaderOffset + 30 + lNameLen + lExtraLen;
      const slice = bytes.subarray(dataStart, dataStart + compSize);
      if (method === 0) {
        entries.set(name, slice);
      } else if (method === 8) {
        entries.set(name, inflateRaw(slice));
      }
    }
  }
  return entries;
}

function colRefToIndex(ref: string): number {
  const letters = ref.replace(/\d+/g, "").toUpperCase();
  let col = 0;
  for (let i = 0; i < letters.length; i++) {
    col = col * 26 + (letters.charCodeAt(i) - 64);
  }
  return Math.max(0, col - 1);
}

function extractXmlTextRuns(xml: string): string {
  const parts: string[] = [];
  const re = /<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml)) !== null) {
    parts.push(decodeEntities(m[1]));
  }
  return parts.join("");
}

/** 读取 .xlsx 字节并展开为 TSV 文本（多工作表按序拼接） */
export function parseXlsxToTsv(bytes: Uint8Array): string {
  const entries = readZipEntries(bytes);
  const sharedStrings: string[] = [];
  const ssBytes = entries.get("xl/sharedStrings.xml");
  if (ssBytes) {
    const ssXml = decodeTextBytes(ssBytes);
    const siRe = /<si[^>]*>([\s\S]*?)<\/si>/g;
    let m: RegExpExecArray | null;
    while ((m = siRe.exec(ssXml)) !== null) {
      sharedStrings.push(extractXmlTextRuns(m[1]).replace(/\r?\n/g, " ").trim());
    }
  }

  const sheetNames = [...entries.keys()]
    .filter((k) => /^xl\/worksheets\/sheet\d+\.xml$/i.test(k))
    .sort((a, b) => {
      const na = Number(a.match(/sheet(\d+)/i)?.[1] ?? 0);
      const nb = Number(b.match(/sheet(\d+)/i)?.[1] ?? 0);
      return na - nb;
    });
  if (!sheetNames.length) {
    throw new Error("未在 XLSX 表格中找到工作表内容");
  }

  const allLines: string[] = [];
  for (const name of sheetNames) {
    const xml = decodeTextBytes(entries.get(name)!);
    const rowRe = /<row[^>]*>([\s\S]*?)<\/row>/g;
    let rm: RegExpExecArray | null;
    while ((rm = rowRe.exec(xml)) !== null) {
      const rowXml = rm[1];
      const cells: string[] = [];
      const cellRe = /<c\b([^>]*)>([\s\S]*?)<\/c>/g;
      let cm: RegExpExecArray | null;
      let nextCol = 0;
      while ((cm = cellRe.exec(rowXml)) !== null) {
        const attrs = cm[1];
        const body = cm[2];
        const refMatch = attrs.match(/\br="([A-Za-z]+\d+)"/);
        const typeMatch = attrs.match(/\bt="([^"]+)"/);
        const colIdx = refMatch ? colRefToIndex(refMatch[1]) : nextCol;
        nextCol = colIdx + 1;

        let val = "";
        const cellType = typeMatch?.[1];
        if (cellType === "inlineStr") {
          val = extractXmlTextRuns(body);
        } else {
          const vMatch = body.match(/<v[^>]*>([\s\S]*?)<\/v>/);
          const rawV = vMatch ? decodeEntities(vMatch[1]).trim() : "";
          if (cellType === "s") {
            const idx = Number(rawV);
            val = Number.isInteger(idx) ? (sharedStrings[idx] ?? "") : "";
          } else {
            val = rawV;
          }
        }
        cells[colIdx] = val.replace(/[\r\n\t]+/g, " ").trim();
      }
      const normalized = Array.from({ length: cells.length }, (_, i) => cells[i] ?? "");
      if (normalized.some((c) => c.length > 0)) {
        allLines.push(normalized.join("\t").replace(/\t+$/, ""));
      }
    }
  }

  if (!allLines.length) {
    throw new Error("XLSX 表格中没有可读取的单元格数据");
  }
  return allLines.join("\n");
}

/* -------------------------------------------------------------------------- */
/*  .ics (iCalendar) 课表直解析                                                */
/* -------------------------------------------------------------------------- */

const ICS_DAY_TO_NUM: Record<string, number> = {
  MO: 1,
  TU: 2,
  WE: 3,
  TH: 4,
  FR: 5,
  SA: 6,
  SU: 7,
};

const KNOWN_TZ_OFFSETS_MIN: Record<string, number> = {
  "asia/shanghai": 480,
  "asia/chongqing": 480,
  "asia/harbin": 480,
  "asia/hong_kong": 480,
  "asia/taipei": 480,
  "asia/singapore": 480,
  "asia/urumqi": 480,
  prc: 480,
  "etc/gmt-8": 480,
  "china standard time": 480,
  "asia/tokyo": 540,
  "asia/seoul": 540,
  utc: 0,
  gmt: 0,
  "etc/utc": 0,
};

interface WallDateTime {
  year: number;
  month: number; // 1..12
  day: number; // 1..31
  hour: number; // 0..23
  minute: number; // 0..59
  second: number; // 0..59
}

export interface IcsParseContext {
  startDate?: string;
  totalWeeks?: number;
  periods: Period[];
  /** 可选：用于解析未声明 VTIMEZONE 的 UTC (Z) 时间戳 */
  timezoneOffsetMinutes?: number;
}

export interface ParsedIcsScheduleResult {
  courses: Course[];
  startDate?: string;
  totalWeeks?: number;
  calendarName?: string;
}

function parseTzOffsetMinutes(raw: string): number | null {
  const m = raw.trim().match(/^([+-])(\d{2})(\d{2})$/);
  if (!m) return null;
  const sign = m[1] === "-" ? -1 : 1;
  const hours = Number(m[2]);
  const mins = Number(m[3]);
  if (hours > 14 || mins > 59) return null;
  return sign * (hours * 60 + mins);
}

function resolveKnownTzOffset(tzName: string | undefined): number | null {
  if (!tzName) return null;
  const normalized = tzName.trim().replace(/^["']|["']$/g, "").toLowerCase();
  if (Object.hasOwn(KNOWN_TZ_OFFSETS_MIN, normalized)) {
    return KNOWN_TZ_OFFSETS_MIN[normalized];
  }
  return null;
}

function wallFromUtcMs(utcMs: number): WallDateTime {
  const d = new Date(utcMs);
  return {
    year: d.getUTCFullYear(),
    month: d.getUTCMonth() + 1,
    day: d.getUTCDate(),
    hour: d.getUTCHours(),
    minute: d.getUTCMinutes(),
    second: d.getUTCSeconds(),
  };
}

function wallToUtcMs(w: WallDateTime): number {
  return Date.UTC(w.year, w.month - 1, w.day, w.hour, w.minute, w.second);
}

function wallToDateIso(w: Pick<WallDateTime, "year" | "month" | "day">): string {
  return `${String(w.year).padStart(4, "0")}-${String(w.month).padStart(2, "0")}-${String(w.day).padStart(2, "0")}`;
}

function wallWeekday(w: Pick<WallDateTime, "year" | "month" | "day">): number {
  const dow = new Date(Date.UTC(w.year, w.month - 1, w.day)).getUTCDay();
  return dow === 0 ? 7 : dow;
}

function wallClock(w: Pick<WallDateTime, "hour" | "minute">): string {
  return `${String(w.hour).padStart(2, "0")}:${String(w.minute).padStart(2, "0")}`;
}

function parseIcsDateTimeWall(
  raw: string,
  utcOffsetMinutes: number | null,
): WallDateTime | null {
  const cleaned = raw.trim();
  const m = cleaned.match(
    /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})?(Z)?$/i,
  );
  if (!m) return null;
  const year = Number(m[1]);
  const month = Number(m[2]);
  const day = Number(m[3]);
  const hour = Number(m[4]);
  const minute = Number(m[5]);
  const second = Number(m[6] ?? 0);
  if (
    month < 1 ||
    month > 12 ||
    day < 1 ||
    day > 31 ||
    hour > 23 ||
    minute > 59 ||
    second > 59
  ) {
    return null;
  }
  if (m[7]?.toUpperCase() === "Z") {
    const utcMs = Date.UTC(year, month - 1, day, hour, minute, second);
    const offsetMin =
      utcOffsetMinutes !== null
        ? utcOffsetMinutes
        : -new Date(utcMs).getTimezoneOffset();
    return wallFromUtcMs(utcMs + offsetMin * 60_000);
  }
  return { year, month, day, hour, minute, second };
}

function parseIcsDateOrDateTimeIso(
  raw: string,
  utcOffsetMinutes: number | null,
): string | null {
  const trimmed = raw.trim();
  const dateOnly = trimmed.match(/^(\d{4})(\d{2})(\d{2})$/);
  if (dateOnly) {
    return `${dateOnly[1]}-${dateOnly[2]}-${dateOnly[3]}`;
  }
  const wall = parseIcsDateTimeWall(trimmed, utcOffsetMinutes);
  return wall ? wallToDateIso(wall) : null;
}

function parseIcsDurationMs(raw: string): number | null {
  const m = raw
    .trim()
    .match(
      /^([+-])?P(?:(\d+)W)?(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?$/i,
    );
  if (!m || m[1] === "-") return null;
  const weeks = Number(m[2] ?? 0);
  const days = Number(m[3] ?? 0);
  const hours = Number(m[4] ?? 0);
  const minutes = Number(m[5] ?? 0);
  const seconds = Number(m[6] ?? 0);
  const totalMs =
    ((((weeks * 7 + days) * 24 + hours) * 60 + minutes) * 60 + seconds) * 1000;
  return totalMs > 0 ? totalMs : null;
}

/** 单遍 RFC 5545 反转义：正确区分 `\\n`（字面反斜杠+n）与 `\n`（换行） */
function unescapeIcs(value: string): string {
  return value
    .replace(/\\([nN,;\\])/g, (_, ch: string) =>
      ch === "n" || ch === "N" ? "\n" : ch,
    )
    .trim();
}

function calendarWeekFromWall(
  wall: Pick<WallDateTime, "year" | "month" | "day">,
  termMondayUtcMs: number,
): number {
  const dayUtc = Date.UTC(wall.year, wall.month - 1, wall.day);
  return Math.floor((dayUtc - termMondayUtcMs) / 86_400_000 / 7) + 1;
}

function parseDescriptionMeta(description: string): {
  teacher: string;
  credits?: number;
  note: string;
  explicitWeek?: number;
  explicitPeriods?: [number, number];
} {
  if (!description) return { teacher: "", note: "" };

  const teacherMatch = description.match(
    /(?:任课教师|授课教师|主讲教师|教师|老师|主讲|Teacher|Instructor|Lecturer)\s*[:：]\s*([^\n,;，；|]+)/i,
  );
  const teacher = teacherMatch ? teacherMatch[1].trim().slice(0, 40) : "";

  let credits: number | undefined;
  const creditsMatch = description.match(
    /(?:学分|Credits?)\s*[:：]\s*(\d+(?:\.\d+)?)\b/i,
  );
  if (creditsMatch) {
    const n = Number(creditsMatch[1]);
    if (Number.isFinite(n) && n >= 0 && n <= 30) {
      credits = n;
    }
  }

  let note = "";
  const noteMatch = description.match(
    /(?:^|\n)(?:备注|说明|Note)\s*[:：]\s*([\s\S]+)$/i,
  );
  if (noteMatch) {
    note = noteMatch[1].trim().slice(0, 200);
  }

  let explicitWeek: number | undefined;
  const weekMatch = description.match(/第\s*(\d{1,2})\s*周/);
  if (weekMatch) {
    const w = Number(weekMatch[1]);
    if (Number.isInteger(w) && w >= 1 && w <= 30) {
      explicitWeek = w;
    }
  }

  let explicitPeriods: [number, number] | undefined;
  const periodRange = description.match(
    /第\s*(\d{1,2})\s*[-~—–至到]\s*(\d{1,2})\s*节/,
  );
  if (periodRange) {
    const s = Number(periodRange[1]);
    const e = Number(periodRange[2]);
    if (s >= 1 && e >= s) explicitPeriods = [s, e];
  } else {
    const singlePeriod = description.match(/第\s*(\d{1,2})\s*节/);
    if (singlePeriod) {
      const s = Number(singlePeriod[1]);
      if (s >= 1) explicitPeriods = [s, s];
    }
  }

  return { teacher, credits, note, explicitWeek, explicitPeriods };
}

function extractPropTzid(propHeader: string): string | undefined {
  const m = propHeader.match(/;TZID=([^;:]+)/i);
  return m ? m[1].trim().replace(/^["']|["']$/g, "") : undefined;
}

/**
 * 完整 RFC 5545 `.ics` 课表解析（支持 VTIMEZONE、TZID、UTC Z、DURATION、
 * 折行展开、单遍反转义、VALARM 隔离、RRULE WEEKLY/INTERVAL/BYDAY/COUNT/UNTIL、
 * EXDATE/RDATE，以及 Dark Study 导出格式无损往返）。
 */
export function parseIcsScheduleDetailed(
  icsText: string,
  ctx: IcsParseContext,
): ParsedIcsScheduleResult {
  const stripped = icsText.replace(/^\uFEFF/, "");
  const unfolded = stripped.replace(/\r\n[ \t]|\n[ \t]|\r[ \t]/g, "");
  const lines = unfolded.split(/\r\n|\n|\r/);

  type RawEvent = {
    summary: string;
    location: string;
    description: string;
    dtstart: string;
    dtstartTzid?: string;
    dtend: string;
    dtendTzid?: string;
    duration: string;
    rrule: string;
    exdates: { raw: string; tzid?: string }[];
    rdates: { raw: string; tzid?: string }[];
  };

  let calendarName = "";
  let calendarTzName = "";
  const tzOffsetsById = new Map<string, number>();
  let firstVtzOffset: number | null = null;

  let inTimezone = false;
  let currentTzId = "";
  let inStandard = false;

  const events: RawEvent[] = [];
  let cur: RawEvent | null = null;
  let subComponentDepth = 0;

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) continue;
    const upper = line.toUpperCase();

    if (cur) {
      if (upper === "END:VEVENT" && subComponentDepth === 0) {
        events.push(cur);
        cur = null;
        continue;
      }
      if (upper.startsWith("BEGIN:")) {
        subComponentDepth += 1;
        continue;
      }
      if (upper.startsWith("END:")) {
        if (subComponentDepth > 0) subComponentDepth -= 1;
        continue;
      }
      if (subComponentDepth > 0) continue;

      const colon = line.indexOf(":");
      if (colon < 0) continue;
      const header = line.slice(0, colon);
      const prop = header.split(";")[0].toUpperCase();
      const val = line.slice(colon + 1);
      if (prop === "SUMMARY") cur.summary = unescapeIcs(val);
      else if (prop === "LOCATION") cur.location = unescapeIcs(val);
      else if (prop === "DESCRIPTION") cur.description = unescapeIcs(val);
      else if (prop === "DTSTART") {
        cur.dtstart = val.trim();
        cur.dtstartTzid = extractPropTzid(header);
      } else if (prop === "DTEND") {
        cur.dtend = val.trim();
        cur.dtendTzid = extractPropTzid(header);
      } else if (prop === "DURATION") {
        cur.duration = val.trim();
      } else if (prop === "RRULE") {
        cur.rrule = val.trim();
      } else if (prop === "EXDATE") {
        const tzid = extractPropTzid(header);
        for (const item of val.split(",")) {
          if (item.trim()) cur.exdates.push({ raw: item.trim(), tzid });
        }
      } else if (prop === "RDATE") {
        const tzid = extractPropTzid(header);
        for (const item of val.split(",")) {
          if (item.trim()) cur.rdates.push({ raw: item.trim(), tzid });
        }
      }
      continue;
    }

    if (upper === "BEGIN:VEVENT") {
      cur = {
        summary: "",
        location: "",
        description: "",
        dtstart: "",
        dtend: "",
        duration: "",
        rrule: "",
        exdates: [],
        rdates: [],
      };
      subComponentDepth = 0;
      continue;
    }

    if (upper === "BEGIN:VTIMEZONE") {
      inTimezone = true;
      currentTzId = "";
      inStandard = false;
      continue;
    }
    if (upper === "END:VTIMEZONE") {
      inTimezone = false;
      currentTzId = "";
      inStandard = false;
      continue;
    }
    if (inTimezone) {
      if (upper === "BEGIN:STANDARD") {
        inStandard = true;
        continue;
      }
      if (upper === "END:STANDARD") {
        inStandard = false;
        continue;
      }
      const colon = line.indexOf(":");
      if (colon < 0) continue;
      const prop = line.slice(0, colon).split(";")[0].toUpperCase();
      const val = line.slice(colon + 1).trim();
      if (prop === "TZID") {
        currentTzId = val;
      } else if (prop === "TZOFFSETTO") {
        const offsetMin = parseTzOffsetMinutes(val);
        if (offsetMin !== null) {
          if (firstVtzOffset === null || inStandard) {
            firstVtzOffset = offsetMin;
          }
          if (currentTzId && (inStandard || !tzOffsetsById.has(currentTzId))) {
            tzOffsetsById.set(currentTzId, offsetMin);
          }
        }
      }
      continue;
    }

    const colon = line.indexOf(":");
    if (colon >= 0) {
      const prop = line.slice(0, colon).split(";")[0].toUpperCase();
      const val = line.slice(colon + 1);
      if (prop === "X-WR-CALNAME" && !calendarName) {
        calendarName = unescapeIcs(val);
      } else if (prop === "X-WR-TIMEZONE" && !calendarTzName) {
        calendarTzName = val.trim();
      }
    }
  }

  const defaultUtcOffsetMin: number | null =
    typeof ctx.timezoneOffsetMinutes === "number" &&
    Number.isFinite(ctx.timezoneOffsetMinutes)
      ? ctx.timezoneOffsetMinutes
      : firstVtzOffset ??
        resolveKnownTzOffset(calendarTzName) ??
        (tzOffsetsById.size > 0
          ? (tzOffsetsById.values().next().value ?? null)
          : null);

  interface PreparedEvent {
    summary: string;
    location: string;
    teacher: string;
    credits?: number;
    note: string;
    explicitWeek?: number;
    start: WallDateTime;
    end: WallDateTime;
    startPeriod: number;
    endPeriod: number;
    rrule: string;
    exdateIsos: Set<string>;
    rdateWalls: WallDateTime[];
    utcOffsetMin: number | null;
  }

  const prepared: PreparedEvent[] = [];
  for (const ev of events) {
    if (!ev.summary || !ev.dtstart) continue;
    const evOffset =
      (ev.dtstartTzid ? tzOffsetsById.get(ev.dtstartTzid) ?? resolveKnownTzOffset(ev.dtstartTzid) : null) ??
      defaultUtcOffsetMin;
    const start = parseIcsDateTimeWall(ev.dtstart, evOffset);
    if (!start) continue;

    let end: WallDateTime | null = null;
    if (ev.dtend) {
      const endOffset =
        (ev.dtendTzid ? tzOffsetsById.get(ev.dtendTzid) ?? resolveKnownTzOffset(ev.dtendTzid) : null) ??
        evOffset;
      end = parseIcsDateTimeWall(ev.dtend, endOffset);
    } else if (ev.duration) {
      const durMs = parseIcsDurationMs(ev.duration);
      if (durMs) {
        end = wallFromUtcMs(wallToUtcMs(start) + durMs);
      }
    }
    if (!end) {
      end = wallFromUtcMs(wallToUtcMs(start) + 90 * 60_000);
    }
    if (wallToUtcMs(end) <= wallToUtcMs(start)) continue;

    const meta = parseDescriptionMeta(ev.description);
    const startClock = wallClock(start);
    const endClock = wallClock(end);

    let startPeriod = periodAtTime(ctx.periods, startClock);
    let endPeriod = periodEndingAtTime(ctx.periods, endClock);
    if (startPeriod == null || endPeriod == null) {
      startPeriod = meta.explicitPeriods?.[0] ?? 1;
      endPeriod = meta.explicitPeriods?.[1] ?? startPeriod;
    }
    endPeriod = Math.max(startPeriod, endPeriod);

    const exdateIsos = new Set<string>();
    for (const ex of ev.exdates) {
      const exOffset =
        (ex.tzid ? tzOffsetsById.get(ex.tzid) ?? resolveKnownTzOffset(ex.tzid) : null) ??
        evOffset;
      const iso = parseIcsDateOrDateTimeIso(ex.raw, exOffset);
      if (iso) exdateIsos.add(iso);
    }

    const rdateWalls: WallDateTime[] = [];
    for (const rd of ev.rdates) {
      const rdOffset =
        (rd.tzid ? tzOffsetsById.get(rd.tzid) ?? resolveKnownTzOffset(rd.tzid) : null) ??
        evOffset;
      const wall = parseIcsDateTimeWall(rd.raw, rdOffset);
      if (wall) rdateWalls.push(wall);
    }

    prepared.push({
      summary: ev.summary,
      location: ev.location,
      teacher: meta.teacher,
      credits: meta.credits,
      note: meta.note,
      explicitWeek: meta.explicitWeek,
      start,
      end,
      startPeriod,
      endPeriod,
      rrule: ev.rrule,
      exdateIsos,
      rdateWalls,
      utcOffsetMin: evOffset,
    });
  }

  if (!prepared.length) {
    return {
      courses: [],
      calendarName: calendarName || undefined,
    };
  }

  const expandForAnchor = (
    anchorIso: string,
    maxWeeks: number,
    unboundedWeekLimit = maxWeeks,
  ): { courses: Course[]; maxWeekObserved: number } => {
    const anchorDate = mondayOf(parseIsoDate(anchorIso));
    const termMondayUtcMs = Date.UTC(
      anchorDate.getFullYear(),
      anchorDate.getMonth(),
      anchorDate.getDate(),
    );

    const merged = new Map<string, Course>();
    let colorIdx = 0;
    let maxWeekObserved = 0;

    for (const ev of prepared) {
      const baseWeek = calendarWeekFromWall(ev.start, termMondayUtcMs);
      const baseWeekday = wallWeekday(ev.start);

      const occurrences: { weekday: number; week: number }[] = [];
      const seenOcc = new Set<string>();
      const pushOcc = (week: number, weekday: number, dateIso: string) => {
        if (ev.exdateIsos.has(dateIso)) return;
        if (week < 1 || week > maxWeeks) return;
        const occKey = `${week}:${weekday}`;
        if (seenOcc.has(occKey)) return;
        seenOcc.add(occKey);
        if (week > maxWeekObserved) maxWeekObserved = week;
        occurrences.push({ week, weekday });
      };

      const ruleMap = new Map<string, string>();
      if (ev.rrule) {
        for (const seg of ev.rrule.split(";")) {
          const eq = seg.indexOf("=");
          if (eq > 0) {
            ruleMap.set(
              seg.slice(0, eq).trim().toUpperCase(),
              seg.slice(eq + 1).trim().toUpperCase(),
            );
          }
        }
      }

      const freq = ruleMap.get("FREQ");
      const rawInterval = Math.max(1, Number(ruleMap.get("INTERVAL")) || 1);
      const isWeeklyRule =
        freq === "WEEKLY" || (freq === "DAILY" && rawInterval % 7 === 0);

      if (isWeeklyRule) {
        const interval =
          freq === "DAILY" ? Math.max(1, Math.floor(rawInterval / 7)) : rawInterval;
        const count = Math.max(0, Number(ruleMap.get("COUNT")) || 0);
        const untilRaw = ruleMap.get("UNTIL");
        let untilWall: WallDateTime | null = null;
        if (untilRaw) {
          untilWall = parseIcsDateTimeWall(
            /^\d{8}$/.test(untilRaw) ? `${untilRaw}T235959` : untilRaw,
            ev.utcOffsetMin,
          );
        }
        const untilMs = untilWall ? wallToUtcMs(untilWall) : null;

        const byDay = (ruleMap.get("BYDAY") ?? "")
          .split(",")
          .map((d) => ICS_DAY_TO_NUM[d.trim().replace(/^[+-]?\d+/, "")])
          .filter((d): d is number => Boolean(d));
        const weekdays = byDay.length
          ? [...new Set(byDay)].sort((a, b) => a - b)
          : [baseWeekday];

        let startWeekIter = baseWeek;
        let produced = 0;
        // 防止极早历史 DTSTART 触发无界循环
        if (startWeekIter < -104 && count === 0) {
          const skipSteps = Math.floor((1 - startWeekIter) / interval);
          startWeekIter += skipSteps * interval;
        }

        const loopMaxWeek =
          count === 0 && untilMs === null
            ? Math.min(maxWeeks, unboundedWeekLimit)
            : maxWeeks;

        let steps = 0;
        for (
          let week = startWeekIter;
          week <= loopMaxWeek && steps < 520;
          week += interval, steps += 1
        ) {
          let stopped = false;
          for (const wd of weekdays) {
            if (week === baseWeek && wd < baseWeekday) continue;
            const occUtcDayMs =
              termMondayUtcMs + ((week - 1) * 7 + (wd - 1)) * 86_400_000;
            const occDate = wallFromUtcMs(occUtcDayMs);
            const occWithTime: WallDateTime = {
              year: occDate.year,
              month: occDate.month,
              day: occDate.day,
              hour: ev.start.hour,
              minute: ev.start.minute,
              second: ev.start.second,
            };
            if (untilMs !== null && wallToUtcMs(occWithTime) > untilMs) {
              stopped = true;
              break;
            }
            const iso = wallToDateIso(occWithTime);
            // RFC 5545: COUNT 计入生成的实例（排除前）
            produced += 1;
            pushOcc(week, wd, iso);
            if (count > 0 && produced >= count) {
              stopped = true;
              break;
            }
          }
          if (stopped) break;
        }
      } else {
        pushOcc(baseWeek, baseWeekday, wallToDateIso(ev.start));
      }

      for (const rd of ev.rdateWalls) {
        pushOcc(
          calendarWeekFromWall(rd, termMondayUtcMs),
          wallWeekday(rd),
          wallToDateIso(rd),
        );
      }

      for (const occ of occurrences) {
        const key = JSON.stringify([
          ev.summary,
          occ.weekday,
          ev.startPeriod,
          ev.endPeriod,
          ev.location,
          ev.teacher,
        ]);
        const existing = merged.get(key);
        if (existing) {
          if (!existing.weeks.includes(occ.week)) {
            existing.weeks.push(occ.week);
            existing.weeks.sort((a, b) => a - b);
          }
          if (!existing.teacher && ev.teacher) existing.teacher = ev.teacher;
          if (existing.credits === undefined && ev.credits !== undefined) {
            existing.credits = ev.credits;
          }
          if (!existing.note && ev.note) existing.note = ev.note;
        } else {
          merged.set(key, {
            id: "",
            name: ev.summary,
            teacher: ev.teacher,
            classroom: ev.location,
            weekday: occ.weekday,
            startPeriod: ev.startPeriod,
            endPeriod: ev.endPeriod,
            weeks: [occ.week],
            color: COLOR_VALUES[colorIdx++ % COLOR_VALUES.length],
            ...(ev.credits !== undefined ? { credits: ev.credits } : {}),
            note: ev.note,
          });
        }
      }
    }

    const courses = [...merged.values()].sort(
      (a, b) =>
        a.weekday - b.weekday ||
        a.startPeriod - b.startPeriod ||
        a.endPeriod - b.endPeriod ||
        a.name.localeCompare(b.name),
    );
    return { courses, maxWeekObserved };
  };

  const inferAnchorStartDate = (): string => {
    let earliestMondayMs = Infinity;
    for (const ev of prepared) {
      const evDate = new Date(ev.start.year, ev.start.month - 1, ev.start.day);
      const evMon = mondayOf(evDate);
      const weekOffsetDays =
        ev.explicitWeek && ev.explicitWeek >= 1 ? (ev.explicitWeek - 1) * 7 : 0;
      const inferredMon = addDays(evMon, -weekOffsetDays);
      const utcMs = Date.UTC(
        inferredMon.getFullYear(),
        inferredMon.getMonth(),
        inferredMon.getDate(),
      );
      if (utcMs < earliestMondayMs) {
        earliestMondayMs = utcMs;
      }
    }
    const d = wallFromUtcMs(earliestMondayMs);
    return toIsoDate(new Date(d.year, d.month - 1, d.day));
  };

  const requestedTotalWeeks = Math.max(
    1,
    Math.min(30, Math.floor(ctx.totalWeeks ?? 18)),
  );
  const hasExplicitStart = Boolean(
    ctx.startDate && /^\d{4}-\d{2}-\d{2}$/.test(ctx.startDate),
  );

  if (hasExplicitStart) {
    const direct = expandForAnchor(ctx.startDate!, requestedTotalWeeks);
    if (direct.courses.length > 0) {
      return {
        courses: direct.courses,
        startDate: toIsoDate(mondayOf(parseIsoDate(ctx.startDate!))),
        totalWeeks: requestedTotalWeeks,
        calendarName: calendarName || undefined,
      };
    }
  }

  // 未提供开学日期，或外部日历跨学期导致全部落在当前学期外时：自动从事件锚定开学周一
  const inferredStart = inferAnchorStartDate();
  const inferred = expandForAnchor(
    inferredStart,
    Math.max(requestedTotalWeeks, 30),
    requestedTotalWeeks,
  );
  const effectiveTotalWeeks = Math.max(
    ctx.totalWeeks ? requestedTotalWeeks : 1,
    Math.min(30, Math.max(inferred.maxWeekObserved, ctx.totalWeeks ? requestedTotalWeeks : inferred.maxWeekObserved || 18)),
  );
  return {
    courses: inferred.courses,
    startDate: inferredStart,
    totalWeeks: effectiveTotalWeeks,
    calendarName: calendarName || undefined,
  };
}

export function parseIcsSchedule(
  icsText: string,
  ctx: { startDate: string; totalWeeks: number; periods: Period[] },
): Course[] {
  return parseIcsScheduleDetailed(icsText, ctx).courses;
}
