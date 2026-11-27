import type { Course, CourseColor, Period } from "@/types";
import {
  mondayOf,
  parseIsoDate,
  periodAtTime,
  periodEndingAtTime,
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

function parseIcsDateTime(raw: string): Date | null {
  const m = raw.match(
    /(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})?(Z)?$/i,
  );
  if (!m) return null;
  const year = Number(m[1]);
  const month = Number(m[2]) - 1;
  const day = Number(m[3]);
  const hour = Number(m[4]);
  const minute = Number(m[5]);
  const second = Number(m[6] ?? 0);
  if (m[7]?.toUpperCase() === "Z") {
    return new Date(Date.UTC(year, month, day, hour, minute, second));
  }
  return new Date(year, month, day, hour, minute, second);
}

function unescapeIcs(value: string): string {
  return value
    .replace(/\\n/gi, "\n")
    .replace(/\\,/g, ",")
    .replace(/\\;/g, ";")
    .replace(/\\\\/g, "\\")
    .trim();
}

function calendarWeekOf(date: Date, termMonday: Date): number {
  const dayUtc = Date.UTC(date.getFullYear(), date.getMonth(), date.getDate());
  const monUtc = Date.UTC(
    termMonday.getFullYear(),
    termMonday.getMonth(),
    termMonday.getDate(),
  );
  return Math.floor((dayUtc - monUtc) / 86400000 / 7) + 1;
}

export function parseIcsSchedule(
  icsText: string,
  ctx: { startDate: string; totalWeeks: number; periods: Period[] },
): Course[] {
  const unfolded = icsText.replace(/\r?\n[ \t]/g, "");
  const lines = unfolded.split(/\r?\n/);
  const termMonday = mondayOf(parseIsoDate(ctx.startDate));
  const totalWeeks = Math.max(1, ctx.totalWeeks);

  type RawEvent = {
    summary: string;
    location: string;
    description: string;
    dtstart: string;
    dtend: string;
    rrule: string;
  };
  const events: RawEvent[] = [];
  let cur: RawEvent | null = null;
  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (line === "BEGIN:VEVENT") {
      cur = {
        summary: "",
        location: "",
        description: "",
        dtstart: "",
        dtend: "",
        rrule: "",
      };
      continue;
    }
    if (line === "END:VEVENT") {
      if (cur) events.push(cur);
      cur = null;
      continue;
    }
    if (!cur) continue;
    const colon = line.indexOf(":");
    if (colon < 0) continue;
    const prop = line.slice(0, colon).split(";")[0].toUpperCase();
    const val = line.slice(colon + 1);
    if (prop === "SUMMARY") cur.summary = unescapeIcs(val);
    else if (prop === "LOCATION") cur.location = unescapeIcs(val);
    else if (prop === "DESCRIPTION") cur.description = unescapeIcs(val);
    else if (prop === "DTSTART") cur.dtstart = val.trim();
    else if (prop === "DTEND") cur.dtend = val.trim();
    else if (prop === "RRULE") cur.rrule = val.trim();
  }

  const merged = new Map<string, Course>();
  let colorIdx = 0;

  for (const ev of events) {
    if (!ev.summary || !ev.dtstart) continue;
    const start = parseIcsDateTime(ev.dtstart);
    if (!start) continue;
    const end = ev.dtend
      ? parseIcsDateTime(ev.dtend)
      : new Date(start.getTime() + 90 * 60000);
    if (!end || end <= start) continue;

    const startClock = `${String(start.getHours()).padStart(2, "0")}:${String(
      start.getMinutes(),
    ).padStart(2, "0")}`;
    const endClock = `${String(end.getHours()).padStart(2, "0")}:${String(
      end.getMinutes(),
    ).padStart(2, "0")}`;

    const startPeriod = periodAtTime(ctx.periods, startClock) ?? 1;
    const endPeriod = Math.max(
      startPeriod,
      periodEndingAtTime(ctx.periods, endClock) ?? startPeriod,
    );

    const teacherMatch = ev.description.match(
      /(?:教师|老师|任课教师|主讲)\s*[:：]\s*([^\n,;，；]+)/,
    );
    const teacher = teacherMatch ? teacherMatch[1].trim() : "";

    const baseWeek = calendarWeekOf(start, termMonday);
    const baseWeekday = start.getDay() === 0 ? 7 : start.getDay();

    const occurrences: { weekday: number; week: number }[] = [];
    if (ev.rrule && /FREQ=WEEKLY/i.test(ev.rrule)) {
      const ruleMap = new Map<string, string>();
      for (const seg of ev.rrule.split(";")) {
        const [k, v] = seg.split("=");
        if (k && v) ruleMap.set(k.toUpperCase(), v.toUpperCase());
      }
      const interval = Math.max(1, Number(ruleMap.get("INTERVAL")) || 1);
      const count = Number(ruleMap.get("COUNT")) || 0;
      const untilRaw = ruleMap.get("UNTIL");
      const untilDate = untilRaw
        ? parseIcsDateTime(
            /^\d{8}$/.test(untilRaw) ? `${untilRaw}T235959` : untilRaw,
          )
        : null;
      const byDay = (ruleMap.get("BYDAY") ?? "")
        .split(",")
        .map((d) => ICS_DAY_TO_NUM[d.replace(/^[+-]?\d+/, "")])
        .filter((d): d is number => Boolean(d));
      const weekdays = byDay.length ? byDay : [baseWeekday];

      let produced = 0;
      for (
        let week = Math.max(1, baseWeek);
        week <= totalWeeks;
        week += interval
      ) {
        for (const wd of weekdays) {
          if (week === baseWeek && wd < baseWeekday) continue;
          const occDate = new Date(
            termMonday.getFullYear(),
            termMonday.getMonth(),
            termMonday.getDate() + (week - 1) * 7 + (wd - 1),
            start.getHours(),
            start.getMinutes(),
          );
          if (untilDate && occDate > untilDate) continue;
          occurrences.push({ weekday: wd, week });
          produced += 1;
          if (count > 0 && produced >= count) break;
        }
        if (count > 0 && produced >= count) break;
      }
    } else if (baseWeek >= 1 && baseWeek <= totalWeeks) {
      occurrences.push({ weekday: baseWeekday, week: baseWeek });
    }

    for (const occ of occurrences) {
      if (occ.week < 1 || occ.week > totalWeeks) continue;
      const key = JSON.stringify([
        ev.summary,
        occ.weekday,
        startPeriod,
        endPeriod,
        ev.location,
      ]);
      const existing = merged.get(key);
      if (existing) {
        if (!existing.weeks.includes(occ.week)) {
          existing.weeks.push(occ.week);
          existing.weeks.sort((a, b) => a - b);
        }
        if (!existing.teacher && teacher) existing.teacher = teacher;
      } else {
        merged.set(key, {
          id: "",
          name: ev.summary,
          teacher,
          classroom: ev.location,
          weekday: occ.weekday,
          startPeriod,
          endPeriod,
          weeks: [occ.week],
          color: COLOR_VALUES[colorIdx++ % COLOR_VALUES.length],
          note: "",
        });
      }
    }
  }

  return [...merged.values()];
}
