import { recognizeText } from "rn-mlkit-ocr";

import { DEFAULT_PERIODS } from "@/constants/sample";
import type { Course, CourseColor, GradeRecord, Schedule, SemesterKind } from "@/types";
import { normalizeGradeInput } from "@/utils/grades";
import {
  addDays,
  parseIsoDate,
  resolveSemester,
  toIsoDate,
} from "@/utils/time";

/**
 * 离线识别：设备端 OCR + 规则解析。
 * 无网络（或未配置 API Key）时由 ImportScreen 自动切换到这里，
 * 全程不联网、不上传图片。
 */

const COLOR_VALUES: CourseColor[] = [
  "sky",
  "violet",
  "emerald",
  "amber",
  "rose",
  "cyan",
];

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

const WEEKDAY_RE = /^(周|星期|礼拜)[一二三四五六日天1-7]$/;

/** 解析星期：返回 1..7，无法判断返回 null */
export function parseWeekday(raw: string): number | null {
  const t = raw.replace(/\s/g, "");
  for (const [word, n] of WEEKDAY_WORDS) {
    if (t === word || t.startsWith(word)) return n;
  }
  const en = t.toLowerCase();
  if (/^(mon|monday)/.test(en)) return 1;
  if (/^(tue|tuesday)/.test(en)) return 2;
  if (/^(wed|wednesday)/.test(en)) return 3;
  if (/^(thu|thursday)/.test(en)) return 4;
  if (/^(fri|friday)/.test(en)) return 5;
  if (/^(sat|saturday)/.test(en)) return 6;
  if (/^(sun|sunday)/.test(en)) return 7;
  return null;
}

/** 解析节次区间：支持「1-2节」「第3节」「1~2」等写法 */
function parsePeriodRange(text: string): [number, number] | null {
  const range = text.match(/第?\s*(\d{1,2})\s*[-~—–至到]\s*(\d{1,2})\s*节/);
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

/** 解析周次：支持「1-16周」「第3周」「1-16周(单)」「单周/双周」 */
function parseWeeks(text: string, totalWeeks: number): number[] {
  const all = Array.from({ length: totalWeeks }, (_, i) => i + 1);
  let list = all;

  const range = text.match(/(\d{1,2})\s*[-~—–至到]\s*(\d{1,2})\s*周/);
  if (range) {
    const a = Number(range[1]);
    const b = Number(range[2]);
    list = [];
    for (let w = a; w <= b && w <= totalWeeks; w++) if (w >= 1) list.push(w);
  } else {
    const single = text.match(/第?\s*(\d{1,2})\s*周/);
    if (single) {
      const w = Number(single[1]);
      if (w >= 1 && w <= totalWeeks) list = [w];
    }
  }

  const odd = /单周|\(单\)|（单）/.test(text);
  const even = /双周|\(双\)|（双）/.test(text);
  if (odd) list = list.filter((w) => w % 2 === 1);
  if (even) list = list.filter((w) => w % 2 === 0);
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
    .split(/\n|,|，|;|；/)
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
        !/(\d{1,2}\s*[-~至]\s*\d{1,2}\s*周)/.test(t),
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

/**
 * 表格型课表解析：
 * 1) 用「周一..周日」表头确定 7 列的 x 中心；
 * 2) 用左侧纯数字（节次）确定行带；
 * 3) 其余文字按最近列/行归入单元格，再按单元格内容解析课程。
 */
function parseTable(lines: OcrLine[], totalWeeks: number): Course[] {
  const sorted = [...lines].sort((a, b) => centerY(a) - centerY(b));

  // ---- 1. 表头 ----
  const headerLines = sorted.filter((l) => {
    const t = l.text.replace(/\s/g, "");
    return t.length <= 6 && WEEKDAY_RE.test(t) && parseWeekday(t) != null;
  });
  if (headerLines.length < 3) return [];

  const columns = headerLines
    .map((l) => ({ text: l.text.replace(/\s/g, ""), cx: centerX(l) }))
    .sort((a, b) => a.cx - b.cx);
  const colWidth =
    (columns[columns.length - 1].cx - columns[0].cx) /
    Math.max(1, columns.length - 1);
  const firstColLeft = columns[0].cx - colWidth / 2;
  const headerY = Math.max(...headerLines.map(centerY));

  // ---- 2. 行带（左侧节次数字 / 时间） ----
  // 只把纯数字（或 1-2 这类区段）当作节次；时间戳只用于定位，不能当节次号
  const leftLabels = sorted.filter(
    (l) => centerY(l) > headerY && centerX(l) < firstColLeft,
  );
  const isPeriodLabel = (t: string) =>
    /^\d{1,2}(\s*[-~—]\s*\d{1,2})?$/.test(t.trim());
  const digitLabels = leftLabels.filter((l) => isPeriodLabel(l.text));
  const labelLines =
    digitLabels.length >= 2
      ? digitLabels
      : leftLabels.filter((l) => /^\d{1,2}:\d{2}$/.test(l.text.trim()));
  if (labelLines.length < 2) return [];

  const rows = labelLines
    .map((l, i) => {
      const t = l.text.trim();
      const n = isPeriodLabel(t) ? Number(t.split(/[-~—]/)[0]) : i + 1;
      return { n, cy: centerY(l) };
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
    // 左侧时间列（08:00）不参与课程内容
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
    if (bestRow < 0 || bestDy > rowGap * 0.8) continue;

    const key = `${bestCol}:${bestRow}`;
    const arr = cells.get(key) ?? [];
    arr.push(line);
    cells.set(key, arr);
  }

  // ---- 4. 逐列合并跨节次的同一门课 ----
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
      // 同一门课在相邻行重复出现 → 视为跨节次
      for (let k = r + 1; k < occupied.length; k++) {
        const next = occupied[k];
        if (!next.length) break;
        const nextText = next.map((l) => l.text.trim()).join(" ");
        const sameName =
          nextText.includes(firstLine.slice(0, 3)) ||
          firstLine.includes(nextText.slice(0, 3));
        if (!sameName) break;
        group.push(...next);
        end = k;
      }

      const body = group
        .sort((a, b) => centerY(a) - centerY(b))
        .map((l) => l.text)
        .join("\n");
      const startPeriod = rows[r].n;
      let endPeriod = rows[end].n;
      // 行号通常按 1,2,3... 排列；若节次标签本身是「1-2」这类，已被 regex 过滤
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
/*  纯文本 / CSV 解析                                                   */
/* ------------------------------------------------------------------ */

export function parseScheduleTextCourses(
  text: string,
  totalWeeks: number,
): Course[] {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);

  const chunks: string[][] = [];
  let current: string[] = [];
  for (const line of lines) {
    // 新记录的两类起点：显式字段名，或当前记录已有星期后又出现新的星期行
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
    // 没有星期信息就无法定位，跳过（可能是表头等噪声）
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
/*  对外入口                                                            */
/* ------------------------------------------------------------------ */

function buildSchedule(courses: Course[]): Schedule {
  const sem = resolveSemester();
  return {
    id: "import-preview",
    name: sem.name,
    kind: sem.kind,
    startDate: sem.startDate,
    endDate: toIsoDate(
      addDays(parseIsoDate(sem.startDate), sem.totalWeeks * 7 - 1),
    ),
    totalWeeks: sem.totalWeeks,
    periods: DEFAULT_PERIODS,
    courses,
  };
}

/** 离线识别课表图片（ML Kit 设备端 OCR，不联网） */
export async function recognizeScheduleOffline(uri: string): Promise<Schedule> {
  const sem = resolveSemester();
  const result = await recognizeText(uri, "chinese");
  const lines = flattenLines(result);
  if (!lines.length) {
    throw new Error("未能从图片中识别到文字，请确认图片清晰、光线充足");
  }

  let courses = parseTable(lines, sem.totalWeeks);
  if (!courses.length) courses = parseLooseText(lines, sem.totalWeeks);
  if (!courses.length) {
    throw new Error(
      "离线识别未能解析出课程表结构（需要表头为周一~周日、左侧为节次）。可换一张更清晰的截图，或联网使用 AI 识别",
    );
  }
  return buildSchedule(courses);
}

/** 离线解析文本课表（CSV / 复制粘贴文本） */
export function recognizeScheduleFromTextOffline(text: string): Schedule {
  const sem = resolveSemester();
  const courses = parseScheduleTextCourses(text, sem.totalWeeks);
  if (!courses.length) {
    throw new Error(
      "离线解析未找到课程记录。请保证每行包含「星期 + 节次」，例如：高等数学 周一 1-2节 教一101 张三 1-16周",
    );
  }
  return buildSchedule(courses);
}

/* ------------------------------------------------------------------ */
/*  成绩单解析                                                          */
/* ------------------------------------------------------------------ */

type GradeDraft = Omit<GradeRecord, "id">;
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

function parseGradeType(text: string): string | null {
  if (/通识|公选|通选/.test(text)) return "general";
  if (/必修|学位/.test(text)) return "required";
  if (/选修|任选|限选/.test(text)) return "elective";
  return null;
}

/** 解析学分：0.5 ~ 30 */
function parseCreditValue(text: string): number | null {
  const cleaned = text.replace(/学分|credit/gi, "").trim();
  const m = cleaned.match(/\d{1,2}(?:\.\d{1,2})?/);
  if (!m) return null;
  const n = Number(m[0]);
  return Number.isFinite(n) && n >= 0.5 && n <= 30 ? n : null;
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

/** 解析成绩单元格：数字 / A+ / 优秀 / 合格等，原样保留 */
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
  const t = token.replace(/成绩|分数/g, "").trim();
  if (!t) return null;
  if (/^(A\+|A-|A|B\+|B-|B|C\+|C-|C|D\+|D-|D|F)$/i.test(t)) {
    return { score: t.toUpperCase(), scoreType: "letter" };
  }
  if (/^(优秀|良好|中等|及格|不及格|合格|不合格|通过|未通过|缓考|免修)$/.test(t)) {
    return { score: t, scoreType: "text" };
  }
  if (/^\d{1,3}(?:\.\d{1,2})?$/.test(t)) {
    const n = Number(t);
    if (n >= 20 && n <= 100) return { score: String(n), scoreType: "numeric" };
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
function parseLooseGradeRow(
  raw: string,
  fallbackSemester: SemesterKind,
): GradeDraft | null {
  const text = raw.replace(/\s+/g, " ").trim();
  if (!text || text.length < 2 || GRADE_SUMMARY_RE.test(text)) return null;

  const tokens = text.split(/[\s,，;；|]+/).filter(Boolean);
  if (!tokens.length) return null;

  const consumed = new Set<number>();
  let score = "";
  let scoreType: "numeric" | "letter" | "text" = "numeric";

  // 字母 / 文字成绩
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
  }
  const nums: NumToken[] = [];
  tokens.forEach((token, i) => {
    if (consumed.has(i)) return;
    const cleaned = token.replace(/学分|分|绩点|成绩/gi, "");
    if (!/^\d{1,3}(?:\.\d{1,2})?$/.test(cleaned)) return;
    const value = Number(cleaned);
    if (Number.isFinite(value)) nums.push({ value, index: i });
  });

  let credit: number | null = null;
  let gpa: number | null = null;

  if (!score) {
    const scoreToken = nums.find((n) => n.value >= 20 && n.value <= 100);
    if (scoreToken) {
      score = String(scoreToken.value);
      scoreType = "numeric";
      consumed.add(scoreToken.index);
    }
  }

  const remaining = nums.filter((n) => !consumed.has(n.index));
  if (remaining.length >= 2) {
    credit = remaining.find((n) => n.value >= 0.5 && n.value <= 30)?.value ?? null;
    const gpaToken = [...remaining]
      .reverse()
      .find((n) => n.value >= 0 && n.value <= 5 && n.value !== credit);
    gpa = gpaToken ? gpaToken.value : null;
    remaining.forEach((n) => consumed.add(n.index));
  } else if (remaining.length === 1) {
    const one = remaining[0];
    if (one.value >= 0.5 && one.value <= 30 && score) {
      credit = one.value;
    } else if (!score) {
      if (one.value >= 20) {
        score = String(one.value);
        scoreType = "numeric";
      } else {
        credit = one.value >= 0.5 ? one.value : null;
      }
    }
    consumed.add(one.index);
  }

  // 课程名：去掉已消费的成绩/学分 token 后剩余部分
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
  if (!credit || (!score && gpa == null)) return null;

  return normalizeGradeInput({
    name,
    credit,
    score,
    scoreType,
    gpa,
    type: parseGradeType(text) ?? "required",
    semester: detectGradeSemester(text) ?? fallbackSemester,
  });
}

/** OCR 表格：用表头关键字估算列中心，按行聚类后按列取单元格 */
function parseGradeTable(
  lines: OcrLine[],
  fallbackSemester: SemesterKind,
): GradeDraft[] {
  const sorted = [...lines].sort((a, b) => centerY(a) - centerY(b));
  const headerCandidates = sorted.filter(
    (l) => l.text.trim().length <= 24 && gradeHeaderKeys(l.text).length > 0,
  );
  if (!headerCandidates.length) return [];

  // 表头可能被 OCR 拆成同一行的多个单元格，按 y 聚类后取关键字最多的一组
  const groups: OcrLine[][] = [];
  for (const line of headerCandidates) {
    const group = groups.find(
      (g) =>
        Math.abs(
          g.reduce((sum, l) => sum + centerY(l), 0) / g.length - centerY(line),
        ) <= 28,
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
        const start =
          line.frame.x + line.frame.width * (index / len);
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

  // 按 y 聚类成行
  const rows: OcrLine[][] = [];
  for (const line of bodyLines) {
    const last = rows[rows.length - 1];
    const lastY = last
      ? last.reduce((sum, l) => sum + centerY(l), 0) / last.length
      : -Infinity;
    if (last && Math.abs(centerY(line) - lastY) <= 20) last.push(line);
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
        // 与所有列都不重叠时退回最近中心
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

    if (name && name.length >= 2 && credit && (score || gpa != null)) {
      const draft = normalizeGradeInput({
        name,
        credit,
        score: score?.score ?? "",
        scoreType: score?.scoreType,
        gpa,
        type: parseGradeType(cellText("type")) ?? parseGradeType(row.map((l) => l.text).join(" ")) ?? "required",
        semester:
          detectGradeSemester(cellText("semester")) ??
          detectGradeSemester(row.map((l) => l.text).join(" ")) ??
          fallbackSemester,
      });
      if (draft) drafts.push(draft);
      continue;
    }

    // 单元格没对齐（OCR 行被合并）时整行兜底
    const loose = parseLooseGradeRow(
      row.map((l) => l.text).join(" "),
      fallbackSemester,
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

/** 纯文本 / CSV 成绩解析 */
export function recognizeGradesFromTextOffline(
  text: string,
  fallbackSemester: SemesterKind = "fall",
): GradeDraft[] {
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
      if (name && name.length >= 2 && credit && (score || gpa != null)) {
        const draft = normalizeGradeInput({
          name,
          credit,
          score: score?.score ?? "",
          scoreType: score?.scoreType,
          gpa,
          type:
            parseGradeType(pick("type")) ?? parseGradeType(line) ?? "required",
          semester:
            detectGradeSemester(pick("semester")) ??
            detectGradeSemester(line) ??
            fallbackSemester,
        });
        if (draft) {
          drafts.push(draft);
          continue;
        }
      }
    }

    const loose = parseLooseGradeRow(line, fallbackSemester);
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
): Promise<GradeDraft[]> {
  const result = await recognizeText(uri, "chinese");
  const lines = flattenLines(result);
  if (!lines.length) {
    throw new Error("未能从图片中识别到文字，请确认图片清晰、光线充足");
  }

  let drafts = parseGradeTable(lines, fallbackSemester);
  if (!drafts.length) {
    drafts = lines
      .map((l) => parseLooseGradeRow(l.text, fallbackSemester))
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
