import { recognizeText } from "rn-mlkit-ocr";

import { DEFAULT_PERIODS } from "@/constants/sample";
import type {
  Course,
  CourseColor,
  GpaScaleId,
  GradeDraft,
  GradeType,
  Period,
  Schedule,
  SemesterKind,
} from "@/types";
import { normalizeParsedPeriods } from "@/utils/courseEditing";
import { cleanHtmlToText, parseIcsSchedule } from "@/utils/documentParser";
import {
  parseEduCourses,
  parseEduGrades,
  parseEduPeriods,
} from "@/utils/eduAdapters";
import { normalizeGradeInput, resolveGradeTypeId } from "@/utils/grades";
import {
  addDays,
  parseIsoDate,
  resolveSemester,
  toIsoDate,
} from "@/utils/time";
export { normalizeParsedPeriods };

/**
 * 离线识别：设备端 OCR + 规则解析。
 * 无网络、未配置 API Key 或云端失败时自动切换到这里，全程不联网、不上传图片。
 */

const COLOR_VALUES: CourseColor[] = [
  "sky",
  "violet",
  "emerald",
  "amber",
  "rose",
  "cyan",
];

export interface OfflineScheduleContext {
  startDate?: string;
  totalWeeks?: number;
  periods?: Period[];
}

export interface OfflineGradeOptions {
  scale?: GpaScaleId;
  types?: readonly GradeType[];
}

interface OcrFrame {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface OcrLine {
  text: string;
  frame: OcrFrame;
}

const WEEKDAY_WORDS: [string, number][] = [
  ["周一", 1],
  ["星期一", 1],
  ["礼拜一", 1],
  ["周1", 1],
  ["周二", 2],
  ["星期二", 2],
  ["礼拜二", 2],
  ["周2", 2],
  ["周三", 3],
  ["星期三", 3],
  ["礼拜三", 3],
  ["周3", 3],
  ["周四", 4],
  ["星期四", 4],
  ["礼拜四", 4],
  ["周4", 4],
  ["周五", 5],
  ["星期五", 5],
  ["礼拜五", 5],
  ["周5", 5],
  ["周六", 6],
  ["星期六", 6],
  ["礼拜六", 6],
  ["周6", 6],
  ["周日", 7],
  ["周天", 7],
  ["星期日", 7],
  ["星期天", 7],
  ["礼拜日", 7],
  ["周7", 7],
];

/** 解析星期：返回 1..7，无法判断返回 null */
export function parseWeekday(raw: string): number | null {
  const t = raw.replace(/\s/g, "");
  for (const [word, n] of WEEKDAY_WORDS) {
    if (t === word || t.startsWith(word)) return n;
  }
  const en = t.toLowerCase();
  if (/^(mon|monday)(?:$|[^a-z])/.test(en)) return 1;
  if (/^(tue|tues|tuesday)(?:$|[^a-z])/.test(en)) return 2;
  if (/^(wed|wednesday)(?:$|[^a-z])/.test(en)) return 3;
  if (/^(thu|thur|thurs|thursday)(?:$|[^a-z])/.test(en)) return 4;
  if (/^(fri|friday)(?:$|[^a-z])/.test(en)) return 5;
  if (/^(sat|saturday)(?:$|[^a-z])/.test(en)) return 6;
  if (/^(sun|sunday)(?:$|[^a-z])/.test(en)) return 7;
  return null;
}

/** 识别表头单元格：兼容「周一」「周一 9/2」「星期二(09.03)」「Mon」「Tue 9/2」 */
function isWeekdayHeader(raw: string): boolean {
  const compact = raw.replace(/\s+/g, " ").trim();
  if (!compact || compact.length > 14) return false;
  if (parseWeekday(compact) == null) return false;
  // 去掉星期词后，剩余部分只允许是日期/括号/数字/分隔符，避免把课程正文误判成表头
  const tail = compact
    .replace(/^(?:周|星期|礼拜)[一二三四五六日天1-7]/, "")
    .replace(/^(?:monday|tuesday|wednesday|thursday|friday|saturday|sunday|mon|tues|tue|wed|thurs|thur|thu|fri|sat|sun)/i, "")
    .trim();
  return tail === "" || /^[\d/.月日()（）\-—\s]{1,10}$/.test(tail);
}

/** 解析节次区间：支持「1-2节」「第3节」「1~2」「第1、2节」等写法 */
function parsePeriodRange(text: string): [number, number] | null {
  const range = text.match(/第?\s*(\d{1,2})\s*[-~—–至到,，、]\s*(\d{1,2})\s*节/);
  if (range) {
    const a = Number(range[1]);
    const b = Number(range[2]);
    if (a >= 1 && b >= a) return [a, b];
  }
  const single = text.match(/第\s*(\d{1,2})\s*节/);
  if (single) {
    const a = Number(single[1]);
    if (a >= 1) return [a, a];
  }
  return null;
}

/**
 * 解析周次：支持多段区间与单双周，如：
 * 「1-6周, 10-16周」「1-8,10,12-16周」「1-16周(单)」「2-16双周」「第3周」
 */
export function parseWeeks(text: string, totalWeeks: number): number[] {
  const all = Array.from({ length: totalWeeks }, (_, i) => i + 1);
  const collected = new Set<number>();

  // 匹配带「周」的复合块，如 "1-6,8,10-16周(单)" 或 "1-6周, 10-16周"
  const blockRe =
    /(?:第\s*)?(\d{1,2}(?:\s*[-~—–至到]\s*\d{1,2})?(?:\s*[,，、]\s*\d{1,2}(?:\s*[-~—–至到]\s*\d{1,2})?)*)\s*(单|双)?\s*周(?:\s*[（(]\s*(单|双)周?\s*[）)])?/g;
  let m: RegExpExecArray | null;
  while ((m = blockRe.exec(text)) !== null) {
    const expr = m[1];
    const parity = m[2] || m[3] || "";
    const parts = expr.split(/[,，、]/);
    for (const part of parts) {
      const seg = part.trim().match(/^(\d{1,2})(?:\s*[-~—–至到]\s*(\d{1,2}))?$/);
      if (!seg) continue;
      const a = Number(seg[1]);
      const b = seg[2] ? Number(seg[2]) : a;
      const first = Math.max(1, Math.min(a, b));
      const last = Math.min(totalWeeks, Math.max(a, b));
      for (let w = first; w <= last; w++) {
        if (parity === "单" && w % 2 === 0) continue;
        if (parity === "双" && w % 2 === 1) continue;
        collected.add(w);
      }
    }
  }

  let list = collected.size ? [...collected].sort((a, b) => a - b) : all;

  // 若整体标注单周/双周但未紧跟在数字后面，兜底再过滤一次
  if (!collected.size) {
    const odd = /单周|\(单\)|（单）/.test(text);
    const even = /双周|\(双\)|（双）/.test(text);
    if (odd) list = list.filter((w) => w % 2 === 1);
    if (even) list = list.filter((w) => w % 2 === 0);
  }
  return list.length ? list : all;
}

/** 清理 OCR 常见噪声与字段前缀 */
function clean(s: string): string {
  return s
    .replace(
      /^(课程名称|课程|科目|教师|老师|任课教师|教室|地点|上课地点|时间|周次|节次)\s*[:：]?\s*/g,
      "",
    )
    .replace(/[|·]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const CLASSROOM_RE = /[A-Za-z\u4e00-\u9fa5]{0,6}\d{2,4}(?:室|楼|馆|栋)?/;

function isClassroomToken(s: string): boolean {
  return CLASSROOM_RE.test(s) && s.length <= 16 && !/周/.test(s);
}

function isTeacherToken(s: string): boolean {
  return /^[\u4e00-\u9fa5·]{2,4}$/.test(s);
}

function isMetadataOnlyText(text: string): boolean {
  const parts = text
    .split(/[\n,，;；\s]+/)
    .map(clean)
    .filter(Boolean);
  if (!parts.length) return false;
  return parts.every(
    (t) =>
      isClassroomToken(t) ||
      isTeacherToken(t) ||
      Boolean(parsePeriodRange(t)) ||
      /(\d{1,2}\s*[-~—–至到]\s*\d{1,2}|第?\d{1,2})\s*(单|双)?周/.test(t) ||
      /^(?:单周|双周|\(单\)|\(双\)|（单）|（双）)$/.test(t) ||
      /^\d+(?:\.\d+)?学分$/.test(t),
  );
}

/** 把一段文本（同一单元格 / 同一行）解析成一门课程 */
function courseFromText(
  rawText: string,
  weekday: number,
  startPeriod: number,
  endPeriod: number,
  totalWeeks: number,
  index: number,
): Course | null {
  const lines = rawText
    .split(/\n|,|，|;|；|\t/)
    .map((s) => s.trim())
    .filter(Boolean);
  const joined = lines.join(" ");

  const explicit = parsePeriodRange(joined);
  const s = explicit ? explicit[0] : startPeriod;
  const e = explicit ? Math.max(explicit[0], explicit[1]) : endPeriod;

  // 课程名：第一段不含「数字教室/周次/教师」特征、长度最长的片段
  const nameCandidates = lines
    .map(clean)
    .filter(
      (t) =>
        t &&
        !parseWeekday(t) &&
        !/^\d+$/.test(t) &&
        !parsePeriodRange(t) &&
        !/(\d{1,2}\s*[-~—–至到]\s*\d{1,2}\s*(单|双)?周)/.test(t),
    );
  if (!nameCandidates.length) return null;

  const name =
    nameCandidates
      .filter((t) => !isClassroomToken(t) && !isTeacherToken(t))
      .sort((a, b) => b.length - a.length)[0] ?? nameCandidates[0];
  if (!name || name.length < 2) return null;

  const others = nameCandidates.filter((t) => t !== name);
  const classroom =
    others.find((t) => isClassroomToken(t)) ??
    joined.match(CLASSROOM_RE)?.[0] ??
    "";
  const teacher =
    others.find((t) => isTeacherToken(t) && t !== classroom) ?? "";

  return {
    id: "",
    name: name.slice(0, 40),
    teacher,
    classroom,
    weekday,
    startPeriod: s,
    endPeriod: e,
    weeks: parseWeeks(joined, totalWeeks),
    color: COLOR_VALUES[index % COLOR_VALUES.length],
    note: "",
  };
}

/* ------------------------------------------------------------------ */
/*  图片表格解析                                                        */
/* ------------------------------------------------------------------ */

function flattenLines(result: any): OcrLine[] {
  const out: OcrLine[] = [];
  const blocks = Array.isArray(result?.blocks) ? result.blocks : [];
  for (const b of blocks) {
    for (const l of b?.lines ?? []) {
      const text = String(l?.text ?? "").trim();
      if (!text) continue;
      const f = l.frame ?? b.frame;
      if (!f) continue;
      out.push({
        text,
        frame: {
          x: Number(f.x) || 0,
          y: Number(f.y) || 0,
          width: Number(f.width) || 0,
          height: Number(f.height) || 0,
        },
      });
    }
  }
  return out;
}

const centerX = (l: OcrLine) => l.frame.x + l.frame.width / 2;
const centerY = (l: OcrLine) => l.frame.y + l.frame.height / 2;

function medianLineHeight(lines: OcrLine[], fallback = 24): number {
  const heights = lines
    .map((l) => l.frame.height)
    .filter((h) => Number.isFinite(h) && h > 4)
    .sort((a, b) => a - b);
  if (!heights.length) return fallback;
  return heights[Math.floor(heights.length / 2)];
}

/**
 * 表格型课表解析：
 * 1) 用「周一..周日」（兼容带日期/英文）表头确定列的 x 中心；
 * 2) 用左侧纯数字（节次）或时间确定行带；
 * 3) 其余文字按最近列/行归入单元格，并合并同课跨节次及合并单元格元数据行。
 */
export function parseTable(lines: OcrLine[], totalWeeks: number): Course[] {
  const sorted = [...lines].sort((a, b) => centerY(a) - centerY(b));

  // ---- 1. 表头 ----
  const headerCandidates = sorted.filter((l) => isWeekdayHeader(l.text));
  if (headerCandidates.length < 3) return [];

  // 若页面中多处出现星期词，按 Y 聚类取包含最多不同星期的那一行
  const medH = medianLineHeight(sorted);
  const headerGroups: OcrLine[][] = [];
  for (const line of headerCandidates) {
    const group = headerGroups.find(
      (g) =>
        Math.abs(
          g.reduce((s, x) => s + centerY(x), 0) / g.length - centerY(line),
        ) <= Math.max(24, medH * 1.4),
    );
    if (group) group.push(line);
    else headerGroups.push([line]);
  }
  const distinctWeekdays = (g: OcrLine[]) =>
    new Set(g.map((l) => parseWeekday(l.text)).filter(Boolean)).size;
  const headerLines = headerGroups.sort(
    (a, b) => distinctWeekdays(b) - distinctWeekdays(a),
  )[0];
  if (!headerLines || distinctWeekdays(headerLines) < 3) return [];

  const columns = headerLines
    .map((l) => ({ text: l.text.trim(), cx: centerX(l) }))
    .sort((a, b) => a.cx - b.cx);
  const colWidth =
    (columns[columns.length - 1].cx - columns[0].cx) /
    Math.max(1, columns.length - 1);
  const firstColLeft = columns[0].cx - colWidth / 2;
  const headerY = Math.max(...headerLines.map((l) => l.frame.y + l.frame.height));

  // ---- 2. 行带（左侧节次数字 / 时间） ----
  const leftLabels = sorted.filter(
    (l) => centerY(l) > headerY && centerX(l) < firstColLeft,
  );
  const isPeriodLabel = (t: string) =>
    /^第?\s*\d{1,2}(\s*[-~—]\s*\d{1,2})?\s*节?$/.test(t.trim());
  const digitLabels = leftLabels.filter((l) => isPeriodLabel(l.text));
  const labelLines =
    digitLabels.length >= 2
      ? digitLabels
      : leftLabels.filter((l) => /^\d{1,2}[:：]\d{2}$/.test(l.text.trim()));
  if (labelLines.length < 2) return [];

  const rows = labelLines
    .map((l, i) => {
      const t = l.text.replace(/[第节\s]/g, "");
      const rangeMatch = t.match(/^(\d{1,2})[-~—](\d{1,2})$/);
      if (rangeMatch) {
        return {
          n: Number(rangeMatch[1]),
          endN: Number(rangeMatch[2]),
          cy: centerY(l),
        };
      }
      const n = /^\d{1,2}$/.test(t) ? Number(t) : i + 1;
      return { n, endN: n, cy: centerY(l) };
    })
    .sort((a, b) => a.cy - b.cy);
  const rowGap =
    (rows[rows.length - 1].cy - rows[0].cy) / Math.max(1, rows.length - 1);

  // ---- 3. 归类到单元格 ----
  const cells = new Map<string, OcrLine[]>();
  for (const line of sorted) {
    if (centerY(line) <= headerY) continue;
    if (headerLines.includes(line)) continue;
    if (labelLines.includes(line)) continue;
    if (centerX(line) < firstColLeft) continue;

    let bestCol = -1;
    let bestDx = Infinity;
    columns.forEach((c, i) => {
      const d = Math.abs(centerX(line) - c.cx);
      if (d < bestDx) {
        bestDx = d;
        bestCol = i;
      }
    });
    if (bestCol < 0 || bestDx > colWidth * 0.75) continue;

    let bestRow = -1;
    let bestDy = Infinity;
    rows.forEach((r, i) => {
      const d = Math.abs(centerY(line) - r.cy);
      if (d < bestDy) {
        bestDy = d;
        bestRow = i;
      }
    });
    if (bestRow < 0 || bestDy > rowGap * 0.85) continue;

    const key = `${bestCol}:${bestRow}`;
    const arr = cells.get(key) ?? [];
    arr.push(line);
    cells.set(key, arr);
  }

  // ---- 4. 逐列合并跨节次的同一门课（兼容重复课名 + 合并单元格下层教室/教师/周次） ----
  const courses: Course[] = [];
  columns.forEach((col, cIdx) => {
    const weekday = parseWeekday(col.text);
    if (!weekday) return;

    const occupied = rows.map((_, rIdx) => cells.get(`${cIdx}:${rIdx}`) ?? []);
    let r = 0;
    while (r < occupied.length) {
      if (!occupied[r].length) {
        r++;
        continue;
      }
      const group = [...occupied[r]];
      const firstLine = group.map((l) => l.text.trim()).join(" ");
      let end = r;
      for (let k = r + 1; k < occupied.length; k++) {
        const next = occupied[k];
        if (!next.length) break;
        const nextText = next.map((l) => l.text.trim()).join(" ");
        const sameName =
          nextText.includes(firstLine.slice(0, 3)) ||
          firstLine.includes(nextText.slice(0, 3));
        // 教务网格合并单元格中，第 1 行是课程名，第 2 行常是教室 / 教师 / 周次等纯元数据
        const continuationMeta = isMetadataOnlyText(nextText);
        if (!sameName && !continuationMeta) break;
        group.push(...next);
        end = k;
      }

      const body = group
        .sort((a, b) => centerY(a) - centerY(b))
        .map((l) => l.text)
        .join("\n");
      const startPeriod = rows[r].n;
      let endPeriod = rows[end].endN;
      if (endPeriod < startPeriod) endPeriod = startPeriod;

      const course = courseFromText(
        body,
        weekday,
        startPeriod,
        endPeriod,
        totalWeeks,
        courses.length,
      );
      if (course) courses.push(course);
      r = end + 1;
    }
  });

  return courses;
}

/** 纯文本兜底：把整页文字按「含星期的行」切分 */
function parseLooseText(lines: OcrLine[], totalWeeks: number): Course[] {
  const text = lines.map((l) => l.text).join("\n");
  return parseScheduleTextCourses(text, totalWeeks);
}

/* ------------------------------------------------------------------ */
/*  纯文本 / CSV / JSON / ICS 解析                                      */
/* ------------------------------------------------------------------ */

type ScheduleColumnKey =
  | "name"
  | "teacher"
  | "classroom"
  | "weekday"
  | "period"
  | "weeks"
  | "credits";

const SCHEDULE_HEADER_PATTERNS: [ScheduleColumnKey, RegExp][] = [
  ["name", /课程名称|课程名|科目|^课程$/],
  ["teacher", /教师|老师|主讲/],
  ["classroom", /教室|地点|场地/],
  ["weekday", /星期|周几/],
  ["period", /节次|节数|上课时间/],
  ["weeks", /周次|起止周/],
  ["credits", /学分/],
];

function parseScheduleJson(text: string, totalWeeks: number): Course[] {
  const trimmed = text.trim();
  if (!trimmed.startsWith("{") && !trimmed.startsWith("[")) return [];
  try {
    const parsed = JSON.parse(trimmed);
    const arr = Array.isArray(parsed)
      ? parsed
      : Array.isArray(parsed?.courses)
        ? parsed.courses
        : null;
    if (!arr) return [];
    const courses: Course[] = [];
    arr.forEach((item: any, idx: number) => {
      const name = String(item?.name ?? item?.courseName ?? "").trim();
      if (!name) return;
      const weekday =
        Number.isInteger(Number(item?.weekday)) &&
        Number(item?.weekday) >= 1 &&
        Number(item?.weekday) <= 7
          ? Number(item.weekday)
          : parseWeekday(String(item?.weekday ?? ""));
      if (!weekday) return;
      const s = Math.max(1, Number(item?.startPeriod) || 1);
      const e = Math.max(s, Number(item?.endPeriod) || s);
      const weeks = Array.isArray(item?.weeks)
        ? item.weeks
            .map(Number)
            .filter(
              (w: number) => Number.isInteger(w) && w >= 1 && w <= totalWeeks,
            )
        : typeof item?.weeks === "string"
          ? parseWeeks(item.weeks, totalWeeks)
          : Array.from({ length: totalWeeks }, (_, i) => i + 1);
      if (!weeks.length) return;
      courses.push({
        id: "",
        name,
        teacher: String(item?.teacher ?? "").trim(),
        classroom: String(item?.classroom ?? item?.location ?? "").trim(),
        weekday,
        startPeriod: s,
        endPeriod: e,
        weeks: [...new Set<number>(weeks)].sort((a, b) => a - b),
        color: COLOR_VALUES[idx % COLOR_VALUES.length],
        credits:
          item?.credits != null && Number.isFinite(Number(item.credits))
            ? Number(item.credits)
            : undefined,
        note: String(item?.note ?? "").trim(),
      });
    });
    return courses;
  } catch {
    return [];
  }
}

function parseScheduleCsvTable(lines: string[], totalWeeks: number): Course[] {
  const detectDelimiter = (line: string) =>
    /\t/.test(line) ? /\t/ : /[,，;；]/.test(line) ? /[,，;；]/ : /\s{2,}/;

  let headerIdx = -1;
  let colMap = new Map<ScheduleColumnKey, number>();
  for (let i = 0; i < Math.min(lines.length, 6); i++) {
    const cells = lines[i].split(detectDelimiter(lines[i]));
    const map = new Map<ScheduleColumnKey, number>();
    cells.forEach((cell, idx) => {
      const cleaned = cell.replace(/\s+/g, "");
      for (const [key, re] of SCHEDULE_HEADER_PATTERNS) {
        if (re.test(cleaned) && !map.has(key)) {
          map.set(key, idx);
          break;
        }
      }
    });
    if (map.has("name") && (map.has("weekday") || map.has("period"))) {
      headerIdx = i;
      colMap = map;
      break;
    }
  }
  if (headerIdx < 0) return [];

  const delim = detectDelimiter(lines[headerIdx]);
  const courses: Course[] = [];
  for (let i = headerIdx + 1; i < lines.length; i++) {
    const cells = lines[i].split(delim).map((c) => c.trim());
    const pick = (key: ScheduleColumnKey) =>
      colMap.has(key) ? (cells[colMap.get(key)!] ?? "") : "";
    const name = clean(pick("name"));
    if (!name || name.length < 2) continue;
    const rawLine = cells.join(" ");
    const weekday =
      parseWeekday(pick("weekday")) ??
      (Number.isInteger(Number(pick("weekday"))) &&
      Number(pick("weekday")) >= 1 &&
      Number(pick("weekday")) <= 7
        ? Number(pick("weekday"))
        : parseWeekday(rawLine));
    if (!weekday) continue;

    const periodText = pick("period") || rawLine;
    const parsedPeriod =
      parsePeriodRange(periodText) ??
      (() => {
        const m = periodText.match(/(\d{1,2})\s*[-~—–至到]\s*(\d{1,2})/);
        if (m) return [Number(m[1]), Number(m[2])] as [number, number];
        const single = periodText.match(/^(\d{1,2})$/);
        if (single) return [Number(single[1]), Number(single[1])] as [number, number];
        return null;
      })();
    const startPeriod = parsedPeriod ? Math.max(1, parsedPeriod[0]) : 1;
    const endPeriod = parsedPeriod ? Math.max(startPeriod, parsedPeriod[1]) : Math.min(2, DEFAULT_PERIODS.length);
    const weeks = parseWeeks(pick("weeks") || rawLine, totalWeeks);
    const creditNum = Number(pick("credits"));

    courses.push({
      id: "",
      name: name.slice(0, 40),
      teacher: clean(pick("teacher")),
      classroom: clean(pick("classroom")),
      weekday,
      startPeriod,
      endPeriod,
      weeks,
      color: COLOR_VALUES[courses.length % COLOR_VALUES.length],
      credits:
        pick("credits") !== "" && Number.isFinite(creditNum) && creditNum > 0
          ? creditNum
          : undefined,
      note: "",
    });
  }
  return courses;
}

export function parseScheduleTextCourses(
  rawText: string,
  totalWeeks: number,
  ctx?: OfflineScheduleContext,
): Course[] {
  // 1) .ics 日历直接解析
  if (/BEGIN:VCALENDAR/i.test(rawText) && /BEGIN:VEVENT/i.test(rawText)) {
    const sem = resolveSemester();
    const icsCourses = parseIcsSchedule(rawText, {
      startDate: ctx?.startDate ?? sem.startDate,
      totalWeeks,
      periods: ctx?.periods?.length ? ctx.periods : DEFAULT_PERIODS,
    });
    if (icsCourses.length) return icsCourses;
  }

  // 1.5) 教务系统（新正方 JSON / 强智·青果 HTML）与 WakeUp 导出快车道
  const fromEdu = parseEduCourses(rawText, totalWeeks);
  if (fromEdu.length) return fromEdu;

  // 2) JSON 直解析
  const fromJson = parseScheduleJson(rawText, totalWeeks);
  if (fromJson.length) return fromJson;

  const text = /<(?:html|table|tr|td)\b/i.test(rawText)
    ? cleanHtmlToText(rawText)
    : rawText;

  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);

  // 3) CSV / TSV 表头列映射
  const fromCsv = parseScheduleCsvTable(lines, totalWeeks);
  if (fromCsv.length) return fromCsv;

  // 4) 自由文本按星期切块兜底
  const chunks: string[][] = [];
  let current: string[] = [];
  for (const line of lines) {
    const startsWithField = /^(课程名称|课程|科目)\s*[:：]/.test(line);
    const hasWeekday = parseWeekday(line) !== null;
    const currentHasWeekday = current.some((l) => parseWeekday(l) !== null);
    if (
      current.length &&
      (startsWithField || (hasWeekday && currentHasWeekday))
    ) {
      chunks.push(current);
      current = [];
    }
    current.push(line);
  }
  if (current.length) chunks.push(current);

  const courses: Course[] = [];
  for (const chunk of chunks) {
    const joined = chunk.join(" ");
    const wdLine = chunk.find((l) => parseWeekday(l) !== null);
    const weekday = wdLine ? parseWeekday(wdLine) : parseWeekday(joined);
    if (!weekday) continue;

    const period = parsePeriodRange(joined);
    const start = period ? period[0] : 1;
    const end = period
      ? Math.max(period[0], period[1])
      : Math.min(2, DEFAULT_PERIODS.length);

    const course = courseFromText(
      joined,
      weekday,
      start,
      end,
      totalWeeks,
      courses.length,
    );
    if (course) courses.push(course);
  }
  return courses;
}

/* ------------------------------------------------------------------ */
/*  作息表离线解析（文本 / OCR 图片）                                    */
/* ------------------------------------------------------------------ */

const NON_CLASS_PERIOD_RE = /午休|午饭|午餐|晚饭|晚餐|眼保健操|早读|晚自习|自习|课间休息|休息/;

/** 离线解析作息表文本（支持表格、粘贴通知、HTML/XLSX 转换文本、WakeUp 时间节点） */
export function recognizePeriodsFromTextOffline(rawText: string): Period[] {
  const fromEduPeriods = parseEduPeriods(rawText);
  if (fromEduPeriods.length) return fromEduPeriods;

  const text = /<(?:html|table|tr|td)\b/i.test(rawText)
    ? cleanHtmlToText(rawText)
    : rawText;
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);

  const candidates: { label?: string; startTime: string; endTime: string }[] = [];
  const rangeRe =
    /(\d{1,2}\s*[:：]\s*\d{2})\s*[-~—–至到]+\s*(\d{1,2}\s*[:：]\s*\d{2})/g;

  for (const line of lines) {
    const isBreakLine =
      NON_CLASS_PERIOD_RE.test(line) && !/第?\s*\d{1,2}\s*节/.test(line);
    if (isBreakLine) continue;

    const labelMatch =
      line.match(/第\s*[一二三四五六七八九十\d]{1,3}(?:\s*[-~—–]\s*\d{1,2})?\s*节/) ??
      line.match(/\b\d{1,2}\s*[-~—–]\s*\d{1,2}\s*节/);
    let m: RegExpExecArray | null;
    rangeRe.lastIndex = 0;
    while ((m = rangeRe.exec(line)) !== null) {
      candidates.push({
        label: labelMatch?.[0]?.replace(/\s+/g, ""),
        startTime: m[1].replace(/\s+/g, ""),
        endTime: m[2].replace(/\s+/g, ""),
      });
    }
  }

  const periods = normalizeParsedPeriods(candidates);
  if (!periods.length) {
    throw new Error(
      "离线未能识别出作息节次。请确保内容包含起止时间，例如：第1节 08:00-08:45",
    );
  }
  return periods;
}

/** 离线识别作息表图片（ML Kit OCR + 行聚类提取时间段） */
export async function recognizePeriodsOffline(uri: string): Promise<Period[]> {
  const result = await recognizeText(uri, "chinese");
  const lines = flattenLines(result);
  if (!lines.length) {
    throw new Error("未能从图片中识别到文字，请确认图片清晰、光线充足");
  }

  // 把同一水平行上的 OCR 片段合并后再按文本提取，解决「第1节」「08:00」「08:45」被拆成多块的问题
  const sorted = [...lines].sort((a, b) => centerY(a) - centerY(b));
  const rowTol = Math.max(12, medianLineHeight(sorted) * 0.7);
  const rows: OcrLine[][] = [];
  for (const line of sorted) {
    const last = rows[rows.length - 1];
    const lastY = last
      ? last.reduce((s, x) => s + centerY(x), 0) / last.length
      : -Infinity;
    if (last && Math.abs(centerY(line) - lastY) <= rowTol) last.push(line);
    else rows.push([line]);
  }

  const mergedText = rows
    .map((row) =>
      row
        .sort((a, b) => a.frame.x - b.frame.x)
        .map((l) => l.text)
        .join(" "),
    )
    .join("\n");

  try {
    return recognizePeriodsFromTextOffline(mergedText);
  } catch {
    // 若开始时间与结束时间分属不同单元格且无连字符（如「08:00   08:45」），做行内双时钟兜底
    const pairCandidates: { label?: string; startTime: string; endTime: string }[] = [];
    for (const line of mergedText.split("\n")) {
      if (NON_CLASS_PERIOD_RE.test(line) && !/第?\s*\d{1,2}\s*节/.test(line)) {
        continue;
      }
      const clocks = line.match(/\b\d{1,2}[:：]\d{2}\b/g);
      if (clocks && clocks.length >= 2) {
        const labelMatch = line.match(/第\s*[一二三四五六七八九十\d]{1,3}\s*节/);
        pairCandidates.push({
          label: labelMatch?.[0]?.replace(/\s+/g, ""),
          startTime: clocks[0],
          endTime: clocks[1],
        });
      }
    }
    const periods = normalizeParsedPeriods(pairCandidates);
    if (!periods.length) {
      throw new Error(
        "离线识别未能解析出作息节次，请换一张更清晰的作息表图片，或联网使用 AI 识别",
      );
    }
    return periods;
  }
}

/* ------------------------------------------------------------------ */
/*  课表离线对外入口                                                    */
/* ------------------------------------------------------------------ */

function buildSchedule(
  courses: Course[],
  ctx?: OfflineScheduleContext,
): Schedule {
  const sem = resolveSemester();
  const startDate =
    ctx?.startDate && /^\d{4}-\d{2}-\d{2}$/.test(ctx.startDate)
      ? ctx.startDate
      : sem.startDate;
  const totalWeeks = ctx?.totalWeeks ?? sem.totalWeeks;
  const periods = ctx?.periods?.length ? ctx.periods : DEFAULT_PERIODS;
  return {
    id: "import-preview",
    name: sem.name,
    kind: sem.kind,
    startDate,
    endDate: toIsoDate(
      addDays(parseIsoDate(startDate), totalWeeks * 7 - 1),
    ),
    totalWeeks,
    periods,
    courses,
  };
}

/** 离线识别课表图片（ML Kit 设备端 OCR，不联网） */
export async function recognizeScheduleOffline(
  uri: string,
  ctx?: OfflineScheduleContext,
): Promise<Schedule> {
  const sem = resolveSemester();
  const totalWeeks = ctx?.totalWeeks ?? sem.totalWeeks;
  const result = await recognizeText(uri, "chinese");
  const lines = flattenLines(result);
  if (!lines.length) {
    throw new Error("未能从图片中识别到文字，请确认图片清晰、光线充足");
  }

  let courses = parseTable(lines, totalWeeks);
  if (!courses.length) courses = parseLooseText(lines, totalWeeks);
  if (!courses.length) {
    throw new Error(
      "离线识别未能解析出课程表结构（需要表头为周一~周日、左侧为节次）。可换一张更清晰的截图，或联网使用 AI 识别",
    );
  }
  return buildSchedule(courses, ctx);
}

/** 离线解析文本课表（CSV / TSV / JSON / ICS / HTML / 复制粘贴文本） */
export function recognizeScheduleFromTextOffline(
  text: string,
  ctx?: OfflineScheduleContext,
): Schedule {
  const sem = resolveSemester();
  const totalWeeks = ctx?.totalWeeks ?? sem.totalWeeks;
  const courses = parseScheduleTextCourses(text, totalWeeks, ctx);
  if (!courses.length) {
    throw new Error(
      "离线解析未找到课程记录。请保证每行包含「星期 + 节次」，例如：高等数学 周一 1-2节 教一101 张三 1-16周",
    );
  }
  return buildSchedule(courses, ctx);
}

/* ------------------------------------------------------------------ */
/*  成绩单解析                                                          */
/* ------------------------------------------------------------------ */

type GradeColumnKey = "name" | "credit" | "score" | "gpa" | "type" | "semester";

const GRADE_HEADER_PATTERNS: [GradeColumnKey, RegExp][] = [
  ["type", /课程性质|课程类型|课程属性|类别|属性/],
  ["credit", /学分/],
  ["gpa", /绩点|GPA/i],
  ["score", /成绩|分数/],
  ["semester", /学期/],
  ["name", /课程名称|课程名|科目|^课程$/],
];

const GRADE_TYPE_WORD =
  /通识|公选|通选|必修|学位|选修|任选|限选/;

const GRADE_SUMMARY_RE =
  /^(合计|总计|总学分|已修学分|平均分|平均成绩|平均绩点|总成绩|备注|说明|学期|学号|姓名)/;

function gradeHeaderKey(text: string): GradeColumnKey | null {
  const t = text.replace(/\s/g, "").replace(/[:：]/g, "");
  if (!t) return null;
  for (const [key, re] of GRADE_HEADER_PATTERNS) {
    if (re.test(t)) return key;
  }
  return null;
}

/** 一行里可能同时包含多个表头词（OCR 合并单元格） */
function gradeHeaderKeys(text: string): GradeColumnKey[] {
  const t = text.replace(/\s/g, "").replace(/[:：]/g, "");
  if (!t) return [];
  return GRADE_HEADER_PATTERNS.filter(([, re]) => re.test(t)).map(
    ([key]) => key,
  );
}

function detectGradeSemester(text: string): SemesterKind | null {
  if (/第一学期|上学期|秋季|秋学期/.test(text)) return "fall";
  if (/第二学期|下学期|春季|春学期/.test(text)) return "spring";
  if (/短学期|小学期|夏季|夏学期/.test(text)) return "summer";
  return null;
}

function parseGradeType(
  text: string,
  customTypes?: readonly GradeType[],
): string | null {
  if (customTypes?.length) {
    const matchedCustom = customTypes.find(
      (t) => t.name.trim().length >= 2 && text.includes(t.name.trim()),
    );
    if (matchedCustom) return matchedCustom.id;
  }
  if (/通识|公选|通选/.test(text)) return resolveGradeTypeId("general", customTypes);
  if (/必修|学位/.test(text)) return resolveGradeTypeId("required", customTypes);
  if (/选修|任选|限选/.test(text)) return resolveGradeTypeId("elective", customTypes);
  return null;
}

/** 解析学分：支持 0.1 ~ 30（兼容 0.25 / 0.2 学分微课/讲座） */
function parseCreditValue(text: string): number | null {
  const cleaned = text.replace(/学分|credit/gi, "").trim();
  const m = cleaned.match(/\d{1,2}(?:\.\d{1,2})?/);
  if (!m) return null;
  const n = Number(m[0]);
  return Number.isFinite(n) && n >= 0.1 && n <= 30 ? n : null;
}

/** 解析绩点：0 ~ 5 */
function parseGpaValue(text: string): number | null {
  const cleaned = text.replace(/绩点|gpa/gi, "").trim();
  const m = cleaned.match(/\d(?:\.\d{1,2})?/);
  if (!m) return null;
  const n = Number(m[0]);
  return Number.isFinite(n) && n >= 0 && n <= 5 ? n : null;
}

interface ParsedScore {
  score: string;
  scoreType: "numeric" | "letter" | "text";
}

/** 解析成绩单元格：数字（0~100）/ A+ / 优秀 / 合格等，原样保留 */
function parseScoreCell(text: string): ParsedScore | null {
  const cleaned = text
    .replace(/成绩|分数/g, "")
    .replace(/绩点|gpa/gi, "")
    .trim();
  if (!cleaned) return null;

  const letter = cleaned.match(/A\+|A-|A|B\+|B-|B|C\+|C-|C|D\+|D-|D|F/i);
  if (letter) {
    return { score: letter[0].toUpperCase(), scoreType: "letter" };
  }

  const word = cleaned.match(
    /优秀|良好|中等|及格|不及格|合格|不合格|通过|未通过|缓考|免修/,
  );
  if (word) return { score: word[0], scoreType: "text" };

  const num = cleaned.match(/\d{1,3}(?:\.\d{1,2})?/);
  if (num) {
    const n = Number(num[0]);
    if (n >= 0 && n <= 100) return { score: String(n), scoreType: "numeric" };
  }
  return null;
}

/** 整行解析时只把「完整 token」视作成绩，避免把课程名里的 A / C 当成分数 */
function parseScoreTokenStrict(token: string): ParsedScore | null {
  const hasScoreSuffix = /成绩|分数|分$/.test(token) && !/学分/.test(token);
  const t = token.replace(/成绩|分数|分$/g, "").trim();
  if (!t) return null;
  if (/^(A\+|A-|A|B\+|B-|B|C\+|C-|C|D\+|D-|D|F)$/i.test(t)) {
    return { score: t.toUpperCase(), scoreType: "letter" };
  }
  if (/^(优秀|良好|中等|及格|不及格|合格|不合格|通过|未通过|缓考|免修)$/.test(t)) {
    return { score: t, scoreType: "text" };
  }
  if (/^\d{1,3}(?:\.\d{1,2})?$/.test(t)) {
    const n = Number(t);
    // 带「分」后缀时允许 0~100 全区间；裸数字优先把 >=20 视为百分制，避免与学分混淆
    if (hasScoreSuffix ? n >= 0 && n <= 100 : n >= 20 && n <= 100) {
      return { score: String(n), scoreType: "numeric" };
    }
  }
  return null;
}

function cleanGradeName(raw: string): string {
  return raw
    .replace(/^\s*\d{1,3}\s*[.、)）]?\s*/, "")
    .replace(
      /课程名称|课程名|学分|成绩|分数|绩点|课程性质|课程类型|类型|学期/g,
      " ",
    )
    .replace(/[|,，;；:：]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** 无表头时的整行兜底解析 */
export function parseLooseGradeRow(
  raw: string,
  fallbackSemester: SemesterKind,
  opts?: OfflineGradeOptions,
): GradeDraft | null {
  const text = raw.replace(/\s+/g, " ").trim();
  if (!text || text.length < 2 || GRADE_SUMMARY_RE.test(text)) return null;

  const tokens = text.split(/[\s,，;；|]+/).filter(Boolean);
  if (!tokens.length) return null;

  const consumed = new Set<number>();
  let score = "";
  let scoreType: "numeric" | "letter" | "text" = "numeric";

  // 字母 / 文字成绩 / 显式带「分」或 >=20 裸分
  tokens.forEach((token, i) => {
    if (score) return;
    const parsed = parseScoreTokenStrict(token);
    if (parsed) {
      score = parsed.score;
      scoreType = parsed.scoreType;
      consumed.add(i);
    }
  });

  interface NumToken {
    value: number;
    index: number;
    raw: string;
  }
  const nums: NumToken[] = [];
  tokens.forEach((token, i) => {
    if (consumed.has(i)) return;
    const cleaned = token.replace(/学分|分|绩点|成绩/gi, "");
    if (!/^\d{1,3}(?:\.\d{1,2})?$/.test(cleaned)) return;
    const value = Number(cleaned);
    if (Number.isFinite(value)) nums.push({ value, index: i, raw: token });
  });

  let credit: number | null = null;
  let gpa: number | null = null;

  if (!score) {
    const scoreToken =
      nums.find((n) => n.value >= 20 && n.value <= 100) ??
      // 3 个数字（典型：学分 成绩(可能<20或0) 绩点）时中间项为成绩
      (nums.length >= 3 && nums[1].value >= 0 && nums[1].value <= 100
        ? nums[1]
        : undefined) ??
      // 2 个数字且第二个为 0（如 "高等数学 3 0" 缺考 0 分）
      (nums.length === 2 && nums[1].value === 0 ? nums[1] : undefined);
    if (scoreToken) {
      score = String(scoreToken.value);
      scoreType = "numeric";
      consumed.add(scoreToken.index);
    }
  }

  const remaining = nums.filter((n) => !consumed.has(n.index));
  if (remaining.length >= 2) {
    const creditToken = remaining.find((n) => n.value >= 0.1 && n.value <= 30);
    credit = creditToken?.value ?? null;
    // 按 token 索引而非数值排重，彻底修复「3 学分且 3.0 绩点」丢失绩点的 Bug
    const gpaToken = [...remaining]
      .reverse()
      .find(
        (n) =>
          n.value >= 0 &&
          n.value <= 5 &&
          n.index !== creditToken?.index,
      );
    gpa = gpaToken ? gpaToken.value : null;
    remaining.forEach((n) => consumed.add(n.index));
  } else if (remaining.length === 1) {
    const one = remaining[0];
    if (one.value >= 0.1 && one.value <= 30 && score) {
      credit = one.value;
    } else if (!score) {
      if (one.value >= 20) {
        score = String(one.value);
        scoreType = "numeric";
      } else if (one.value === 0) {
        score = "0";
        scoreType = "numeric";
      } else {
        credit = one.value >= 0.1 ? one.value : null;
      }
    }
    consumed.add(one.index);
  }

  let name = tokens
    .filter((_, i) => !consumed.has(i))
    .filter((t) => !GRADE_TYPE_WORD.test(t))
    .join(" ")
    .trim();
  name = cleanGradeName(name);

  if (!name && tokens.length === 1) {
    name = cleanGradeName(
      text
        .replace(/\d{1,3}(?:\.\d{1,2})?\s*(学分|分|绩点)?/g, " ")
        .replace(/(?:^|\s)(A\+|A-|A|B\+|B-|B|C\+|C-|C|D\+|D-|D|F)(?=\s|$)/gi, " "),
    );
  }
  if (!name || name.length < 2) return null;
  if (!score && gpa == null) return null;

  return normalizeGradeInput(
    {
      name,
      credit,
      score,
      scoreType,
      gpa,
      type: parseGradeType(text, opts?.types) ?? "required",
      semester: detectGradeSemester(text) ?? fallbackSemester,
    },
    opts,
  );
}

/** OCR 表格：用表头关键字估算列中心，按行高中位数动态聚类后按列取单元格 */
export function parseGradeTable(
  lines: OcrLine[],
  fallbackSemester: SemesterKind,
  opts?: OfflineGradeOptions,
): GradeDraft[] {
  const sorted = [...lines].sort((a, b) => centerY(a) - centerY(b));
  const headerCandidates = sorted.filter(
    (l) => l.text.trim().length <= 24 && gradeHeaderKeys(l.text).length > 0,
  );
  if (!headerCandidates.length) return [];

  const medH = medianLineHeight(sorted);
  const headerTol = Math.max(14, medH * 0.9);
  const rowTol = Math.max(12, medH * 0.65);

  const groups: OcrLine[][] = [];
  for (const line of headerCandidates) {
    const group = groups.find(
      (g) =>
        Math.abs(
          g.reduce((sum, l) => sum + centerY(l), 0) / g.length - centerY(line),
        ) <= headerTol,
    );
    if (group) group.push(line);
    else groups.push([line]);
  }
  const keyCount = (g: OcrLine[]) =>
    new Set(g.flatMap((l) => gradeHeaderKeys(l.text))).size;
  const header = groups.sort((a, b) => keyCount(b) - keyCount(a))[0];
  if (!header || keyCount(header) < 2) return [];

  const ranges = new Map<GradeColumnKey, { start: number; end: number }[]>();
  for (const line of header) {
    for (const [key, re] of GRADE_HEADER_PATTERNS) {
      const global = new RegExp(
        re.source,
        re.flags.includes("g") ? re.flags : `${re.flags}g`,
      );
      for (const match of line.text.matchAll(global)) {
        const index = match.index ?? 0;
        const len = Math.max(1, line.text.length);
        const start = line.frame.x + line.frame.width * (index / len);
        const end =
          line.frame.x +
          line.frame.width * ((index + match[0].length) / len);
        ranges.set(key, [...(ranges.get(key) ?? []), { start, end }]);
      }
    }
  }
  const columns = [...ranges.entries()].map(([key, xs]) => {
    const start = xs.reduce((a, b) => a + b.start, 0) / xs.length;
    const end = xs.reduce((a, b) => a + b.end, 0) / xs.length;
    return { key, start, end, cx: (start + end) / 2 };
  });
  if (!columns.length) return [];

  const headerBottom = Math.max(
    ...header.map((l) => l.frame.y + l.frame.height),
  );

  const bodyLines = sorted.filter(
    (l) =>
      centerY(l) > headerBottom &&
      !header.includes(l) &&
      !GRADE_SUMMARY_RE.test(l.text.trim()),
  );
  if (!bodyLines.length) return [];

  // 基于行高中位数动态聚类成行，适配高分屏截图与低分缩略图
  const rows: OcrLine[][] = [];
  for (const line of bodyLines) {
    const last = rows[rows.length - 1];
    const lastY = last
      ? last.reduce((sum, l) => sum + centerY(l), 0) / last.length
      : -Infinity;
    if (last && Math.abs(centerY(line) - lastY) <= rowTol) last.push(line);
    else rows.push([line]);
  }

  const drafts: GradeDraft[] = [];
  for (const row of rows) {
    const cells = new Map<GradeColumnKey, string[]>();
    for (const line of row) {
      const lineStart = line.frame.x;
      const lineEnd = line.frame.x + line.frame.width;
      let bestKey: GradeColumnKey = columns[0].key;
      let bestOverlap = 0;
      for (const col of columns) {
        const overlap = Math.max(
          0,
          Math.min(lineEnd, col.end) - Math.max(lineStart, col.start),
        );
        if (overlap > bestOverlap) {
          bestOverlap = overlap;
          bestKey = col.key;
        }
      }
      if (bestOverlap <= 0) {
        let bestDx = Infinity;
        for (const col of columns) {
          const d = Math.abs(centerX(line) - col.cx);
          if (d < bestDx) {
            bestDx = d;
            bestKey = col.key;
          }
        }
      }
      cells.set(bestKey, [...(cells.get(bestKey) ?? []), line.text]);
    }

    const cellText = (key: GradeColumnKey) =>
      (cells.get(key) ?? []).join(" ").trim();
    const name = cleanGradeName(cellText("name"));
    const credit = parseCreditValue(cellText("credit"));
    const score = parseScoreCell(cellText("score"));
    const gpa = parseGpaValue(cellText("gpa"));

    if (name && name.length >= 2 && (score || gpa != null)) {
      const draft = normalizeGradeInput(
        {
          name,
          credit,
          score: score?.score ?? "",
          scoreType: score?.scoreType,
          gpa,
          type:
            parseGradeType(cellText("type"), opts?.types) ??
            parseGradeType(row.map((l) => l.text).join(" "), opts?.types) ??
            "required",
          semester:
            detectGradeSemester(cellText("semester")) ??
            detectGradeSemester(row.map((l) => l.text).join(" ")) ??
            fallbackSemester,
        },
        opts,
      );
      if (draft) drafts.push(draft);
      continue;
    }

    const loose = parseLooseGradeRow(
      row.map((l) => l.text).join(" "),
      fallbackSemester,
      opts,
    );
    if (loose) drafts.push(loose);
  }

  return drafts;
}

function dedupeGrades(list: GradeDraft[]): GradeDraft[] {
  const seen = new Set<string>();
  return list.filter((g) => {
    const key = `${g.semester}|${g.name}|${g.credit}|${g.score}|${g.gpa}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/** 纯文本 / CSV / XLSX-TSV / XLS / PDF / HTML / 教务 JSON 成绩解析 */
export function recognizeGradesFromTextOffline(
  rawText: string,
  fallbackSemester: SemesterKind = "fall",
  opts?: OfflineGradeOptions,
): GradeDraft[] {
  const fromEdu = parseEduGrades(rawText, fallbackSemester, opts);
  if (fromEdu.length) return dedupeGrades(fromEdu);

  const text = /<(?:html|table|tr|td)\b/i.test(rawText)
    ? cleanHtmlToText(rawText)
    : rawText;
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  if (!lines.length) throw new Error("文件内容为空");

  const detectDelimiter = (line: string) =>
    /\t/.test(line) ? /\t/ : /[,，;；]/.test(line) ? /[,，;；]/ : /\s{2,}|\s/;

  let headerIndex = -1;
  let headerColumns = new Map<GradeColumnKey, number>();
  for (let i = 0; i < Math.min(lines.length, 6); i++) {
    const cells = lines[i].split(detectDelimiter(lines[i]));
    const map = new Map<GradeColumnKey, number>();
    cells.forEach((cell, index) => {
      const key = gradeHeaderKey(cell);
      if (key && !map.has(key)) map.set(key, index);
    });
    if (map.size >= 2 && (map.has("credit") || map.has("score") || map.has("gpa"))) {
      headerIndex = i;
      headerColumns = map;
      break;
    }
  }

  const drafts: GradeDraft[] = [];
  const start = headerIndex >= 0 ? headerIndex + 1 : 0;
  for (let i = start; i < lines.length; i++) {
    const line = lines[i];
    if (!line || GRADE_SUMMARY_RE.test(line)) continue;

    if (headerIndex >= 0) {
      const cells = line.split(detectDelimiter(lines[headerIndex]));
      const pick = (key: GradeColumnKey) =>
        headerColumns.has(key)
          ? (cells[headerColumns.get(key)!] ?? "").trim()
          : "";
      const name = cleanGradeName(pick("name"));
      const credit = parseCreditValue(pick("credit"));
      const score = parseScoreCell(pick("score"));
      const gpa = parseGpaValue(pick("gpa"));
      if (name && name.length >= 2 && (score || gpa != null)) {
        const draft = normalizeGradeInput(
          {
            name,
            credit,
            score: score?.score ?? "",
            scoreType: score?.scoreType,
            gpa,
            type:
              parseGradeType(pick("type"), opts?.types) ??
              parseGradeType(line, opts?.types) ??
              "required",
            semester:
              detectGradeSemester(pick("semester")) ??
              detectGradeSemester(line) ??
              fallbackSemester,
          },
          opts,
        );
        if (draft) {
          drafts.push(draft);
          continue;
        }
      }
    }

    const loose = parseLooseGradeRow(line, fallbackSemester, opts);
    if (loose) drafts.push(loose);
  }

  const result = dedupeGrades(drafts);
  if (!result.length) {
    throw new Error(
      "离线解析未找到成绩记录。请保证表格包含「课程名称 / 学分 / 成绩」列，或每行形如：高等数学 3 87 3.7",
    );
  }
  return result;
}

/** 离线识别成绩单图片（ML Kit 设备端 OCR，不联网） */
export async function recognizeGradesOffline(
  uri: string,
  fallbackSemester: SemesterKind = "fall",
  opts?: OfflineGradeOptions,
): Promise<GradeDraft[]> {
  const result = await recognizeText(uri, "chinese");
  const lines = flattenLines(result);
  if (!lines.length) {
    throw new Error("未能从图片中识别到文字，请确认图片清晰、光线充足");
  }

  let drafts = parseGradeTable(lines, fallbackSemester, opts);
  if (!drafts.length) {
    drafts = lines
      .map((l) => parseLooseGradeRow(l.text, fallbackSemester, opts))
      .filter((g): g is GradeDraft => g !== null);
  }
  drafts = dedupeGrades(drafts);
  if (!drafts.length) {
    throw new Error(
      "离线识别未能解析出成绩（需要「课程名称 / 学分 / 成绩 / 绩点」表格）。可换一张更清晰的成绩单截图，或联网使用 AI 识别",
    );
  }
  return drafts;
}
