import { WEEKDAY_LABELS } from "@/constants/palette";
import type { CourseColor, Period, Schedule } from "@/types";
import { bytesToBase64 } from "@/utils/base64";
import { QR_MAX_BYTES, utf8ByteLength, utf8Encode } from "@/utils/qrMatrix";

/* -------------------------------------------------------------------------- */
/*  Shared Peer Schedule Types                                                */
/* -------------------------------------------------------------------------- */

export interface SharedPeerCourse {
  /** 课程名 */
  n: string;
  /** 星期几：1 = 周一 ... 7 = 周日 */
  d: number;
  /** 起始节次（含） */
  s: number;
  /** 结束节次（含） */
  e: number;
  /** 上课周次数组，如 [1, 2, 3, ...] */
  w: number[];
  /** 教室（可选） */
  r?: string;
  /** 教师（可选） */
  t?: string;
}

export interface SharedPeerSchedule {
  id: string;
  nickname: string;
  color: CourseColor;
  scheduleName: string;
  totalWeeks: number;
  startDate: string;
  courses: SharedPeerCourse[];
  active: boolean;
  importedAt: number;
}

export type DecodedPeerSchedule = Omit<
  SharedPeerSchedule,
  "id" | "color" | "active" | "importedAt"
>;

export interface BusySlotPerson {
  personName: string;
  courseName: string;
  classroom?: string;
  isMe: boolean;
  color: CourseColor;
}

export interface CommonFreeSlotCell {
  weekday: number;
  periodIndex: number;
  label: string;
  startTime: string;
  endTime: string;
  allFree: boolean;
  freeCount: number;
  totalPeople: number;
  freePeople: string[];
  busy: BusySlotPerson[];
}

export interface RecommendedFreeBlock {
  weekday: number;
  dayLabel: string;
  startPeriod: number;
  endPeriod: number;
  startTime: string;
  endTime: string;
  periodCount: number;
}

export interface CommonFreeSlotsResult {
  week: number;
  weekdays: number[];
  periods: Period[];
  cells: CommonFreeSlotCell[];
  cellMap: Record<string, CommonFreeSlotCell>;
  recommendedBlocks: RecommendedFreeBlock[];
  totalPeople: number;
  allFreeSlotCount: number;
  totalSlotCount: number;
}

/* -------------------------------------------------------------------------- */
/*  Compact Wire Format & Binary Helpers (Hermes + Node safe)                 */
/* -------------------------------------------------------------------------- */

type WireCourseTuple =
  | [string, number, number, number, string]
  | [string, number, number, number, string, string]
  | [string, number, number, number, string, string, string];

interface WireSchedulePayload {
  v: 1;
  /** 课表名称 */
  s: string;
  /** 昵称（可选） */
  u?: string;
  /** 学期总周数 */
  w: number;
  /** 开学日期 yyyy-MM-dd */
  d: string;
  /** 压缩后的课程元组列表 */
  c: WireCourseTuple[];
}

const TOKEN_PREFIX = "DS1:";
const MAX_TOTAL_WEEKS = 52;
const MAX_PERIOD_INDEX = 24;
const MAX_COURSES = 400;

const CRC32_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let k = 0; k < 8; k++) {
      c = (c & 1) !== 0 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[i] = c >>> 0;
  }
  return table;
})();

function crc32Hex8(text: string): string {
  const bytes = utf8Encode(text);
  let crc = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) {
    crc = CRC32_TABLE[(crc ^ bytes[i]) & 0xff] ^ (crc >>> 8);
  }
  return ((crc ^ 0xffffffff) >>> 0).toString(16).padStart(8, "0");
}

const B64URL_LOOKUP = (() => {
  const map = new Int16Array(128).fill(-1);
  const chars =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
  for (let i = 0; i < chars.length; i++) {
    map[chars.charCodeAt(i)] = i;
  }
  return map;
})();

function base64UrlEncode(bytes: Uint8Array): string {
  return bytesToBase64(bytes)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function base64UrlDecode(encoded: string): Uint8Array {
  const len = encoded.length;
  if (len === 0 || len % 4 === 1) {
    throw new Error("课表口令编码长度异常，请确认已完整复制");
  }
  const outLen = Math.floor((len * 3) / 4);
  const out = new Uint8Array(outLen);
  let outPos = 0;

  for (let i = 0; i < len; i += 4) {
    const c0 = encoded.charCodeAt(i);
    const c1 = encoded.charCodeAt(i + 1);
    const c2 = i + 2 < len ? encoded.charCodeAt(i + 2) : -1;
    const c3 = i + 3 < len ? encoded.charCodeAt(i + 3) : -1;

    const v0 = c0 < 128 ? B64URL_LOOKUP[c0] : -1;
    const v1 = c1 < 128 ? B64URL_LOOKUP[c1] : -1;
    const v2 = c2 === -1 ? 0 : c2 < 128 ? B64URL_LOOKUP[c2] : -1;
    const v3 = c3 === -1 ? 0 : c3 < 128 ? B64URL_LOOKUP[c3] : -1;

    if (v0 < 0 || v1 < 0 || v2 < 0 || v3 < 0) {
      throw new Error("课表口令包含非法字符，请重新复制");
    }

    const triple = (v0 << 18) | (v1 << 12) | (v2 << 6) | v3;
    out[outPos++] = (triple >>> 16) & 0xff;
    if (c2 !== -1) out[outPos++] = (triple >>> 8) & 0xff;
    if (c3 !== -1) out[outPos++] = triple & 0xff;
  }

  return out;
}

function utf8Decode(bytes: Uint8Array): string {
  const chars: string[] = [];
  let i = 0;
  while (i < bytes.length) {
    const b0 = bytes[i++];
    if (b0 < 0x80) {
      chars.push(String.fromCharCode(b0));
    } else if ((b0 & 0xe0) === 0xc0) {
      if (i >= bytes.length) throw new Error("课表口令 UTF-8 数据不完整");
      const b1 = bytes[i++];
      if ((b1 & 0xc0) !== 0x80) throw new Error("课表口令 UTF-8 数据损坏");
      const cp = ((b0 & 0x1f) << 6) | (b1 & 0x3f);
      if (cp < 0x80) throw new Error("课表口令 UTF-8 编码异常");
      chars.push(String.fromCharCode(cp));
    } else if ((b0 & 0xf0) === 0xe0) {
      if (i + 1 >= bytes.length) throw new Error("课表口令 UTF-8 数据不完整");
      const b1 = bytes[i++];
      const b2 = bytes[i++];
      if ((b1 & 0xc0) !== 0x80 || (b2 & 0xc0) !== 0x80) {
        throw new Error("课表口令 UTF-8 数据损坏");
      }
      const cp = ((b0 & 0x0f) << 12) | ((b1 & 0x3f) << 6) | (b2 & 0x3f);
      if (cp < 0x800 || (cp >= 0xd800 && cp <= 0xdfff)) {
        throw new Error("课表口令 UTF-8 编码异常");
      }
      chars.push(String.fromCharCode(cp));
    } else if ((b0 & 0xf8) === 0xf0) {
      if (i + 2 >= bytes.length) throw new Error("课表口令 UTF-8 数据不完整");
      const b1 = bytes[i++];
      const b2 = bytes[i++];
      const b3 = bytes[i++];
      if (
        (b1 & 0xc0) !== 0x80 ||
        (b2 & 0xc0) !== 0x80 ||
        (b3 & 0xc0) !== 0x80
      ) {
        throw new Error("课表口令 UTF-8 数据损坏");
      }
      const cp =
        ((b0 & 0x07) << 18) |
        ((b1 & 0x3f) << 12) |
        ((b2 & 0x3f) << 6) |
        (b3 & 0x3f);
      if (cp < 0x10000 || cp > 0x10ffff) {
        throw new Error("课表口令 UTF-8 编码异常");
      }
      const offset = cp - 0x10000;
      chars.push(
        String.fromCharCode(0xd800 | (offset >> 10), 0xdc00 | (offset & 0x3ff)),
      );
    } else {
      throw new Error("课表口令 UTF-8 数据损坏");
    }
  }
  return chars.join("");
}

/* -------------------------------------------------------------------------- */
/*  Compact RLE / Range Week Codec ("1-16", "1-15:2", "2-16:2", "1-4,6-8")    */
/* -------------------------------------------------------------------------- */

export function encodeWeeksSpec(weeks: readonly number[]): string {
  const sorted = [...new Set(weeks)]
    .filter((w) => Number.isInteger(w) && w >= 1 && w <= MAX_TOTAL_WEEKS)
    .sort((a, b) => a - b);
  if (sorted.length === 0) return "";
  if (sorted.length === 1) return String(sorted[0]);

  // Fast-path: pure step-2 sequence (odd/even weeks, e.g. 1-15:2 or 2-16:2)
  if (sorted.length >= 2) {
    let allStep2 = true;
    for (let i = 1; i < sorted.length; i++) {
      if (sorted[i] - sorted[i - 1] !== 2) {
        allStep2 = false;
        break;
      }
    }
    if (allStep2) {
      return `${sorted[0]}-${sorted[sorted.length - 1]}:2`;
    }
  }

  const parts: string[] = [];
  let i = 0;
  while (i < sorted.length) {
    // Prefer contiguous step-1 run when length >= 2
    let j = i;
    while (j + 1 < sorted.length && sorted[j + 1] === sorted[j] + 1) {
      j++;
    }
    if (j > i) {
      parts.push(`${sorted[i]}-${sorted[j]}`);
      i = j + 1;
      continue;
    }

    // Otherwise check step-2 run of length >= 3 (more compact than comma list)
    let k = i;
    while (k + 1 < sorted.length && sorted[k + 1] === sorted[k] + 2) {
      k++;
    }
    if (k - i >= 2) {
      parts.push(`${sorted[i]}-${sorted[k]}:2`);
      i = k + 1;
      continue;
    }

    parts.push(String(sorted[i]));
    i++;
  }
  return parts.join(",");
}

export function decodeWeeksSpec(spec: string): number[] {
  const trimmed = spec.trim();
  if (!trimmed) {
    throw new Error("课表口令中的周次数据为空");
  }
  const set = new Set<number>();
  const segments = trimmed.split(",");
  for (const seg of segments) {
    const match = /^(\d{1,2})(?:-(\d{1,2})(?::(\d{1,2}))?)?$/.exec(seg.trim());
    if (!match) {
      throw new Error(`课表口令中的周次格式无效：${seg}`);
    }
    const start = Number(match[1]);
    const end = match[2] !== undefined ? Number(match[2]) : start;
    const step = match[3] !== undefined ? Number(match[3]) : 1;
    if (
      !Number.isInteger(start) ||
      !Number.isInteger(end) ||
      !Number.isInteger(step) ||
      start < 1 ||
      end > MAX_TOTAL_WEEKS ||
      start > end ||
      step < 1 ||
      step > 20
    ) {
      throw new Error("课表口令中的周次超出允许范围");
    }
    for (let w = start; w <= end; w += step) {
      set.add(w);
    }
  }
  const result = [...set].sort((a, b) => a - b);
  if (result.length === 0) {
    throw new Error("课表口令中的周次数据为空");
  }
  return result;
}

/* -------------------------------------------------------------------------- */
/*  Share Code Encoder & Decoder                                              */
/* -------------------------------------------------------------------------- */

function isValidIsoDate(iso: string): boolean {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!match) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (year < 2000 || year > 2100 || month < 1 || month > 12 || day < 1 || day > 31) {
    return false;
  }
  const probe = new Date(Date.UTC(year, month - 1, day));
  return (
    probe.getUTCFullYear() === year &&
    probe.getUTCMonth() === month - 1 &&
    probe.getUTCDate() === day
  );
}

function truncateText(text: string, maxChars: number): string {
  const trimmed = text.trim();
  if (trimmed.length <= maxChars) return trimmed;
  return trimmed.slice(0, maxChars);
}

function encodeWirePayload(payload: WireSchedulePayload): string {
  const json = JSON.stringify(payload);
  const b64 = base64UrlEncode(utf8Encode(json));
  return `${TOKEN_PREFIX}${b64}.${crc32Hex8(b64)}`;
}

function buildWireCourseTuples(
  courses: Schedule["courses"],
  options?: { stripMeta?: boolean; maxNameChars?: number },
): WireCourseTuple[] {
  const stripMeta = options?.stripMeta ?? false;
  const maxNameChars = options?.maxNameChars ?? 60;
  const tuples: WireCourseTuple[] = [];

  for (const c of courses) {
    const rawName = (c.name ?? "").trim();
    if (!rawName) continue;
    const weekday = Math.round(c.weekday);
    const startPeriod = Math.round(c.startPeriod);
    const endPeriod = Math.round(c.endPeriod);
    if (
      weekday < 1 ||
      weekday > 7 ||
      startPeriod < 1 ||
      endPeriod < startPeriod ||
      endPeriod > MAX_PERIOD_INDEX
    ) {
      continue;
    }
    const weeksSpec = encodeWeeksSpec(c.weeks);
    if (!weeksSpec) continue;

    const name = truncateText(rawName, maxNameChars);
    const room = stripMeta ? "" : truncateText(c.classroom ?? "", 40);
    const teacher = stripMeta ? "" : truncateText(c.teacher ?? "", 30);

    if (teacher) {
      tuples.push([name, weekday, startPeriod, endPeriod, weeksSpec, room, teacher]);
    } else if (room) {
      tuples.push([name, weekday, startPeriod, endPeriod, weeksSpec, room]);
    } else {
      tuples.push([name, weekday, startPeriod, endPeriod, weeksSpec]);
    }
  }

  return tuples.slice(0, MAX_COURSES);
}

/**
 * 将当前课表编码为紧凑、可跨平台分享的 Dark Study 课表口令：
 * `DS1:<base64url>.<crc32Hex8>`
 */
export function encodeScheduleShareCode(
  schedule: Schedule,
  nickname?: string,
): string {
  const totalWeeks = Math.max(
    1,
    Math.min(MAX_TOTAL_WEEKS, Math.round(schedule.totalWeeks || 18)),
  );
  const startDate = isValidIsoDate(schedule.startDate)
    ? schedule.startDate
    : "2026-09-01";
  const scheduleName = truncateText(schedule.name || "我的课表", 64) || "我的课表";
  const cleanNick = nickname ? truncateText(nickname, 24) : "";

  const payload: WireSchedulePayload = {
    v: 1,
    s: scheduleName,
    ...(cleanNick ? { u: cleanNick } : {}),
    w: totalWeeks,
    d: startDate,
    c: buildWireCourseTuples(schedule.courses),
  };

  return encodeWirePayload(payload);
}

function parseSharedCourseItem(item: unknown): SharedPeerCourse {
  let rawName: unknown;
  let rawDay: unknown;
  let rawStart: unknown;
  let rawEnd: unknown;
  let rawWeeks: unknown;
  let rawRoom: unknown;
  let rawTeacher: unknown;

  if (Array.isArray(item)) {
    if (item.length < 5 || item.length > 7) {
      throw new Error("课表口令中的课程条目格式无效");
    }
    [rawName, rawDay, rawStart, rawEnd, rawWeeks, rawRoom, rawTeacher] = item;
  } else if (item && typeof item === "object") {
    const obj = item as Record<string, unknown>;
    rawName = obj.n;
    rawDay = obj.d;
    rawStart = obj.s;
    rawEnd = obj.e;
    rawWeeks = obj.w;
    rawRoom = obj.r;
    rawTeacher = obj.t;
  } else {
    throw new Error("课表口令中的课程条目格式无效");
  }

  if (typeof rawName !== "string" || !rawName.trim() || rawName.trim().length > 60) {
    throw new Error("课表口令中的课程名称无效");
  }
  if (
    typeof rawDay !== "number" ||
    !Number.isInteger(rawDay) ||
    rawDay < 1 ||
    rawDay > 7
  ) {
    throw new Error("课表口令中的星期数值超出范围（需为 1–7）");
  }
  if (
    typeof rawStart !== "number" ||
    !Number.isInteger(rawStart) ||
    rawStart < 1 ||
    rawStart > MAX_PERIOD_INDEX
  ) {
    throw new Error("课表口令中的起始节次超出范围");
  }
  if (
    typeof rawEnd !== "number" ||
    !Number.isInteger(rawEnd) ||
    rawEnd < rawStart ||
    rawEnd > MAX_PERIOD_INDEX
  ) {
    throw new Error("课表口令中的结束节次无效");
  }

  let weeks: number[];
  if (typeof rawWeeks === "string") {
    weeks = decodeWeeksSpec(rawWeeks);
  } else if (Array.isArray(rawWeeks)) {
    const cleaned = [...new Set(rawWeeks)].filter(
      (w): w is number =>
        typeof w === "number" && Number.isInteger(w) && w >= 1 && w <= MAX_TOTAL_WEEKS,
    );
    if (cleaned.length === 0 || cleaned.length !== new Set(rawWeeks).size) {
      throw new Error("课表口令中的周次列表包含非法数值");
    }
    weeks = cleaned.sort((a, b) => a - b);
  } else {
    throw new Error("课表口令中的周次字段缺失或类型错误");
  }

  const course: SharedPeerCourse = {
    n: rawName.trim(),
    d: rawDay,
    s: rawStart,
    e: rawEnd,
    w: weeks,
  };

  if (rawRoom !== undefined && rawRoom !== null) {
    if (typeof rawRoom !== "string") {
      throw new Error("课表口令中的教室字段类型错误");
    }
    const trimmedRoom = rawRoom.trim();
    if (trimmedRoom.length > 40) {
      throw new Error("课表口令中的教室名称过长");
    }
    if (trimmedRoom) course.r = trimmedRoom;
  }

  if (rawTeacher !== undefined && rawTeacher !== null) {
    if (typeof rawTeacher !== "string") {
      throw new Error("课表口令中的教师字段类型错误");
    }
    const trimmedTeacher = rawTeacher.trim();
    if (trimmedTeacher.length > 30) {
      throw new Error("课表口令中的教师名称过长");
    }
    if (trimmedTeacher) course.t = trimmedTeacher;
  }

  return course;
}

function extractTokenParts(raw: string): { payloadB64: string; checksumHex: string } {
  if (typeof raw !== "string" || !raw.trim()) {
    throw new Error("请先粘贴好友的课表口令");
  }
  const directMatch = /DS1:([A-Za-z0-9_-]+)\.([0-9a-fA-F]{8})/.exec(raw);
  if (directMatch) {
    return { payloadB64: directMatch[1], checksumHex: directMatch[2] };
  }

  // Fallback for line-wrapped tokens pasted from chat apps
  const idx = raw.indexOf(TOKEN_PREFIX);
  if (idx >= 0) {
    const collapsed = raw.slice(idx).replace(/[\r\n]+/g, "");
    const wrappedMatch = /DS1:([A-Za-z0-9_-]+)\.([0-9a-fA-F]{8})/.exec(collapsed);
    if (wrappedMatch) {
      return { payloadB64: wrappedMatch[1], checksumHex: wrappedMatch[2] };
    }
    throw new Error(
      "课表口令格式不完整或已被截断，请确认包含完整的 DS1:... 校验后缀",
    );
  }

  throw new Error("未检测到有效的 Dark Study 课表口令（需以 DS1: 开头）");
}

/**
 * 解析并严格校验好友分享的 `DS1:` 课表口令（支持从大段聊天记录中自动提取）。
 */
export function decodeScheduleShareCode(raw: string): DecodedPeerSchedule {
  const { payloadB64, checksumHex } = extractTokenParts(raw);

  const expectedChecksum = crc32Hex8(payloadB64);
  if (expectedChecksum !== checksumHex.toLowerCase()) {
    throw new Error("课表口令校验失败，内容可能被截断或篡改，请让好友重新发送");
  }

  let parsed: unknown;
  try {
    const bytes = base64UrlDecode(payloadB64);
    const jsonText = utf8Decode(bytes);
    parsed = JSON.parse(jsonText);
  } catch (err) {
    if (err instanceof Error && err.message.startsWith("课表口令")) {
      throw err;
    }
    throw new Error("课表口令内容损坏，无法解析为课表数据");
  }

  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("课表口令数据结构无效");
  }
  const obj = parsed as Record<string, unknown>;

  if (obj.v !== 1) {
    throw new Error("不支持的课表口令版本，请升级 Dark Study 后重试");
  }
  if (typeof obj.s !== "string" || obj.s.trim().length > 64) {
    throw new Error("课表口令中的课表名称无效");
  }
  if (
    obj.u !== undefined &&
    (typeof obj.u !== "string" || obj.u.trim().length > 24)
  ) {
    throw new Error("课表口令中的昵称格式无效");
  }
  if (
    typeof obj.w !== "number" ||
    !Number.isInteger(obj.w) ||
    obj.w < 1 ||
    obj.w > MAX_TOTAL_WEEKS
  ) {
    throw new Error("课表口令中的学期周数无效");
  }
  if (typeof obj.d !== "string" || !isValidIsoDate(obj.d)) {
    throw new Error("课表口令中的开学日期无效");
  }
  if (!Array.isArray(obj.c) || obj.c.length > MAX_COURSES) {
    throw new Error("课表口令中的课程列表无效或超出数量上限");
  }

  const courses = obj.c.map(parseSharedCourseItem);
  const scheduleName = obj.s.trim() || "好友课表";
  const nickname =
    typeof obj.u === "string" && obj.u.trim() ? obj.u.trim() : scheduleName;

  return {
    nickname,
    scheduleName,
    totalWeeks: obj.w,
    startDate: obj.d,
    courses,
  };
}

/**
 * 构建适合放入 QR 码（<= 271 字节）的紧凑 `DS1:` 分享码：
 * 若整学期口令本身可放入 QR 码则直接使用；否则自动生成当前教学周的精简版 `DS1:` 口令，
 * 保证扫码后依然能 100% 正常导入并准确参与空课对比。
 */
export function buildCompactQrSummary(
  schedule: Schedule,
  week: number,
  nickname?: string,
): string {
  const full = encodeScheduleShareCode(schedule, nickname);
  if (utf8ByteLength(full) <= QR_MAX_BYTES) {
    return full;
  }

  const totalWeeks = Math.max(
    1,
    Math.min(MAX_TOTAL_WEEKS, Math.round(schedule.totalWeeks || 18)),
  );
  const safeWeek = Math.max(1, Math.min(totalWeeks, Math.round(week || 1)));
  const startDate = isValidIsoDate(schedule.startDate)
    ? schedule.startDate
    : "2026-09-01";
  const cleanNick = nickname ? truncateText(nickname, 12) : "";

  const weekCourses = schedule.courses
    .filter((c) => c.weeks.includes(safeWeek))
    .map((c) => ({ ...c, weeks: [safeWeek] }));

  // Tier 1: single week with full metadata
  const singleWeekSchedule: Schedule = {
    ...schedule,
    name: truncateText(schedule.name || `第${safeWeek}周`, 24) || `第${safeWeek}周`,
    totalWeeks,
    startDate,
    courses: weekCourses,
  };
  const tier1 = encodeScheduleShareCode(singleWeekSchedule, cleanNick || undefined);
  if (utf8ByteLength(tier1) <= QR_MAX_BYTES) {
    return tier1;
  }

  // Tier 2: single week without classroom/teacher, progressively shortening long course names
  const shortTitle = `第${safeWeek}周`;
  for (const maxLen of [12, 6, 4, 2, 1]) {
    const candidate = encodeWirePayload({
      v: 1,
      s: shortTitle,
      ...(cleanNick && maxLen >= 4 ? { u: truncateText(cleanNick, 8) } : {}),
      w: totalWeeks,
      d: startDate,
      c: buildWireCourseTuples(weekCourses, {
        stripMeta: true,
        maxNameChars: maxLen,
      }),
    });
    if (utf8ByteLength(candidate) <= QR_MAX_BYTES) {
      return candidate;
    }
  }

  // Tier 3 (extreme density fallback): merge adjacent/overlapping slots per day into minimal busy spans
  const byDay = new Map<number, { s: number; e: number }[]>();
  for (const c of weekCourses) {
    const d = Math.round(c.weekday);
    const s = Math.max(1, Math.min(MAX_PERIOD_INDEX, Math.round(c.startPeriod)));
    const e = Math.max(s, Math.min(MAX_PERIOD_INDEX, Math.round(c.endPeriod)));
    if (d < 1 || d > 7) continue;
    const list = byDay.get(d);
    if (list) list.push({ s, e });
    else byDay.set(d, [{ s, e }]);
  }

  const mergedTuples: WireCourseTuple[] = [];
  const weekSpec = String(safeWeek);
  for (let d = 1; d <= 7; d++) {
    const list = byDay.get(d);
    if (!list || list.length === 0) continue;
    list.sort((a, b) => a.s - b.s || a.e - b.e);
    let curStart = list[0].s;
    let curEnd = list[0].e;
    for (let i = 1; i < list.length; i++) {
      if (list[i].s <= curEnd + 1) {
        curEnd = Math.max(curEnd, list[i].e);
      } else {
        mergedTuples.push(["课", d, curStart, curEnd, weekSpec]);
        curStart = list[i].s;
        curEnd = list[i].e;
      }
    }
    mergedTuples.push(["课", d, curStart, curEnd, weekSpec]);
  }

  // Fit as many merged spans as possible within QR_MAX_BYTES
  while (mergedTuples.length > 0) {
    const candidate = encodeWirePayload({
      v: 1,
      s: `W${safeWeek}`,
      w: totalWeeks,
      d: startDate,
      c: mergedTuples,
    });
    if (utf8ByteLength(candidate) <= QR_MAX_BYTES) {
      return candidate;
    }
    mergedTuples.pop();
  }

  return encodeWirePayload({
    v: 1,
    s: `W${safeWeek}`,
    w: totalWeeks,
    d: startDate,
    c: [],
  });
}

/* -------------------------------------------------------------------------- */
/*  Multi-Peer Common Free Slot Radar                                         */
/* -------------------------------------------------------------------------- */

export function slotCellKey(weekday: number, periodIndex: number): string {
  return `${weekday}-${periodIndex}`;
}

/**
 * 结合当前用户课表与所有已启用好友课表，计算指定教学周的 `(weekday × periodIndex)` 空课热力矩阵
 * 以及按连空时长降序排列的「全员共同空课推荐时段」。
 */
export function computeCommonFreeSlots(
  mySchedule: Schedule,
  peers: readonly SharedPeerSchedule[],
  week: number,
  options?: { includeWeekend?: boolean },
): CommonFreeSlotsResult {
  const includeWeekend = options?.includeWeekend ?? false;
  const weekdays = includeWeekend ? [1, 2, 3, 4, 5, 6, 7] : [1, 2, 3, 4, 5];
  const periods = [...mySchedule.periods].sort((a, b) => a.index - b.index);
  const activePeers = peers.filter((p) => p.active);
  const totalPeople = 1 + activePeers.length;

  const myWeekCourses = mySchedule.courses.filter((c) => c.weeks.includes(week));
  const peerWeekEntries = activePeers.map((peer) => ({
    peer,
    courses: peer.courses.filter((c) => c.w.includes(week)),
  }));

  const cells: CommonFreeSlotCell[] = [];
  const cellMap: Record<string, CommonFreeSlotCell> = {};
  const recommendedBlocks: RecommendedFreeBlock[] = [];
  let allFreeSlotCount = 0;

  for (const weekday of weekdays) {
    let runStart: Period | null = null;
    let runEnd: Period | null = null;
    let runCount = 0;

    const flushRun = () => {
      if (runStart && runEnd && runCount > 0) {
        recommendedBlocks.push({
          weekday,
          dayLabel: WEEKDAY_LABELS[weekday - 1] ?? `周${weekday}`,
          startPeriod: runStart.index,
          endPeriod: runEnd.index,
          startTime: runStart.startTime,
          endTime: runEnd.endTime,
          periodCount: runCount,
        });
      }
      runStart = null;
      runEnd = null;
      runCount = 0;
    };

    for (const period of periods) {
      const busy: BusySlotPerson[] = [];
      const busyPersonIds = new Set<string>();

      for (const c of myWeekCourses) {
        if (
          c.weekday === weekday &&
          c.startPeriod <= period.index &&
          c.endPeriod >= period.index
        ) {
          busyPersonIds.add("__me__");
          busy.push({
            personName: "我",
            courseName: c.name,
            classroom: c.classroom?.trim() || undefined,
            isMe: true,
            color: c.color,
          });
        }
      }

      for (const { peer, courses } of peerWeekEntries) {
        for (const c of courses) {
          if (
            c.d === weekday &&
            c.s <= period.index &&
            c.e >= period.index
          ) {
            busyPersonIds.add(peer.id);
            busy.push({
              personName: peer.nickname,
              courseName: c.n,
              classroom: c.r?.trim() || undefined,
              isMe: false,
              color: peer.color,
            });
          }
        }
      }

      const freePeople: string[] = [];
      if (!busyPersonIds.has("__me__")) freePeople.push("我");
      for (const peer of activePeers) {
        if (!busyPersonIds.has(peer.id)) freePeople.push(peer.nickname);
      }

      const allFree = busyPersonIds.size === 0;
      const freeCount = Math.max(0, totalPeople - busyPersonIds.size);
      if (allFree) {
        allFreeSlotCount++;
        if (!runStart) runStart = period;
        runEnd = period;
        runCount++;
      } else {
        flushRun();
      }

      const cell: CommonFreeSlotCell = {
        weekday,
        periodIndex: period.index,
        label: period.label,
        startTime: period.startTime,
        endTime: period.endTime,
        allFree,
        freeCount,
        totalPeople,
        freePeople,
        busy,
      };
      cells.push(cell);
      cellMap[slotCellKey(weekday, period.index)] = cell;
    }

    flushRun();
  }

  recommendedBlocks.sort(
    (a, b) =>
      b.periodCount - a.periodCount ||
      a.weekday - b.weekday ||
      a.startPeriod - b.startPeriod,
  );

  return {
    week,
    weekdays,
    periods,
    cells,
    cellMap,
    recommendedBlocks,
    totalPeople,
    allFreeSlotCount,
    totalSlotCount: cells.length,
  };
}
