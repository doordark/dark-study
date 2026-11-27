import {
  chat,
  chatAgentTurn,
  chatJson,
  DeepSeekError,
  imagePart,
  TEXT_MODEL,
  VISION_MODEL,
  type ChatContent,
} from "@/services/deepseek";
import { runWhaleAgent } from "@/services/whaleAgent";
import { DEFAULT_PERIODS } from "@/constants/sample";
import {
  resolveSemester,
  addDays,
  getCourseTime,
  normalizeClockInput,
  parseIsoDate,
  toIsoDate,
} from "@/utils/time";
import type {
  AssistantAction,
  Course,
  CourseColor,
  GpaScaleId,
  GradeDraft,
  GradeRecord,
  GradeRule,
  GradeType,
  GradeYear,
  Period,
  PetActionKind,
  Schedule,
  SemesterKind,
} from "@/types";
import { normalizeGradeInput, normalizeSemester } from "@/utils/grades";
import {
  recognizeGradesOffline,
  recognizePeriodsOffline,
  recognizeScheduleOffline,
} from "@/services/offlineImport";
import { readImageBase64 } from "@/utils/readImageBase64";
import { cleanHtmlToText } from "@/utils/documentParser";
import { createWhaleContext, formatTimeContext, type WhaleLiveStudySnapshot } from "@/services/whaleContext";
import { maybeScheduleWhaleReflection } from "@/services/whaleReflection";
import { recentWhaleHistory, type WhaleHistoryMessage } from "@/utils/whaleMemory";
import { buildWhalePersonaPrompt, renderPersonaText } from "@/utils/whalePersona";
import { useWhalePersona } from "@/store/useWhalePersona";
import { normalizeParsedPeriods, validClock } from "@/utils/courseEditing";
import {
  formatTaskBrief,
  getUpcomingTasks,
  type CourseTask,
} from "@/utils/courseTasks";
import {
  computeWeeklyFreeSlots,
  sanitizeAddTaskAction,
  summarizeAttendanceRisks,
  summarizeGradesForCopilot,
  summarizeRecentFocus,
  type AttendanceEntryLike,
  type FocusLogLike,
} from "@/utils/studyCopilot";
import { resolveWhaleSticker, WHALE_EXPRESSION_INSTRUCTIONS, type WhaleStickerId } from "@/utils/whaleExpression";

const COLOR_VALUES: CourseColor[] = [
  "sky",
  "violet",
  "emerald",
  "amber",
  "rose",
  "cyan",
];

/** 导入上下文：课表开学日期 / 总周数 / 当前作息表，用于日期换算周次与时刻对齐节次 */
export interface ScheduleImportContext {
  /** 目标课表第一周的周一（yyyy-MM-dd） */
  startDate?: string;
  /** 目标课表总周数 */
  totalWeeks?: number;
  /** 今天（yyyy-MM-dd） */
  today?: string;
  /** 当前课表的作息节次参考（若提供则沿用，不被默认作息覆盖） */
  periods?: Period[];
}

const scheduleSchemaHint = (ctx?: ScheduleImportContext) => {
  const totalWeeks = ctx?.totalWeeks ?? 18;
  const semester =
    ctx?.startDate && ctx?.totalWeeks
      ? `学期信息：第 1 周的周一是 ${ctx.startDate}，本学期共 ${ctx.totalWeeks} 周${
          ctx.today ? `，今天是 ${ctx.today}` : ""
        }。`
      : `学期信息：本学期共 ${totalWeeks} 周。`;
  const periodsHint = ctx?.periods?.length
    ? `\n当前作息节次参考（若原图只标了上课时刻未标节次号，请对照此表换算 startPeriod/endPeriod；全天共 ${ctx.periods.length} 节）：\n${ctx.periods
        .map((p) => `${p.index}. ${p.startTime}-${p.endTime}`)
        .join(" / ")}`
    : "";
  return `请把识别到的课表输出为严格的 JSON（不要多余文字），结构如下：
{
  "name": "学期名称",
  "startDate": "yyyy-MM-dd",
  "courses": [
    {
      "name": "课程名",
      "teacher": "教师名",
      "classroom": "教室",
      "weekday": 1,          // 1=周一 ... 7=周日
      "startPeriod": 1,      // 开始节次
      "endPeriod": 2,        // 结束节次
      "weeks": [1,2,3],      // 实际上课的周次列表
      "dates": ["2026-10-08"], // 若图中标注了具体日期，把日期填在这里
      "credits": 3,          // 学分，未知则 null
      "color": "sky"         // 从 sky/violet/emerald/amber/rose/cyan 中选择
    }
  ]
}
${semester}${periodsHint}
要求：
- 课程名必须完整，禁止使用省略号或任何形式的截断
- 若无法确定 startDate，使用 null
- weeks 只写实际有课的周次：图片里若标了具体日期（如 10月8日）或「第3周」，必须按学期起始日换算后只写这些周次，同时把日期填进 dates；绝不能默认把整学期都填上
- 只有在完全没有任何日期与周次信息时，才把整学期 ${totalWeeks} 周全部写入 weeks
- 同一门课在不同星期 / 不同节次 / 不同教室的每次上课都要拆成独立的课程记录（例如 Lecture 与 LAB 分开），禁止合并或只保留一条
- 日期落在学期范围外的记录直接忽略，禁止编造`;
};

/** 模型判断输入不是目标内容时输出 {"error":"NOT_TARGET"}，统一转为明确失败 */
function ensureTarget(parsed: any, message: string): void {
  if (parsed && typeof parsed.error === "string") throw new Error(message);
}

/** 宽松解析周次：支持 [1,3]、"1-5"、"1~5,8"、"第3周" 等写法 */
function parseWeeksValue(input: unknown, totalWeeks: number): number[] {
  const out: number[] = [];
  const push = (n: number) => {
    if (Number.isInteger(n) && n >= 1 && n <= totalWeeks) out.push(n);
  };
  const collect = (v: unknown) => {
    if (Array.isArray(v)) {
      v.forEach(collect);
      return;
    }
    if (typeof v === "number") {
      push(v);
      return;
    }
    if (typeof v !== "string") return;
    // 去掉「第 / 周 / 空白」，再按分隔符拆成区间
    const norm = v.replace(/[第周\s]/g, "");
    for (const part of norm.split(/[,，、;；]/)) {
      const m = part.match(/^(\d+)(?:[-~至到—–](\d+))?$/);
      if (!m) continue;
      const a = Number(m[1]);
      const b = m[2] ? Number(m[2]) : a;
      // Bound work by the semester, even when the model returns a huge range.
      const first = Math.max(1, Math.min(a, b));
      const last = Math.min(totalWeeks, Math.max(a, b));
      for (let w = first; w <= last; w++) push(w);
    }
  };
  collect(input);
  return [...new Set(out)].sort((a, b) => a - b);
}

/** 具体日期 → 学期周次（按第 1 周周一对齐） */
function weeksFromDates(
  dates: unknown,
  startDate: string | undefined,
  totalWeeks: number,
): number[] {
  if (!startDate || !Array.isArray(dates)) return [];
  const start = parseIsoDate(startDate).getTime();
  if (Number.isNaN(start)) return [];
  const out: number[] = [];
  for (const raw of dates) {
    const m = String(raw).match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
    if (!m) continue;
    const date = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
    if (
      date.getFullYear() !== Number(m[1]) ||
      date.getMonth() !== Number(m[2]) - 1 ||
      date.getDate() !== Number(m[3])
    ) continue;
    const t = date.getTime();
    const w = Math.floor((t - start) / 86400000 / 7) + 1;
    if (w >= 1 && w <= totalWeeks) out.push(w);
  }
  return [...new Set(out)].sort((a, b) => a - b);
}

function normalizeCourses(
  raw: any,
  ctx?: ScheduleImportContext & { startDate?: string },
): Course[] {
  if (!Array.isArray(raw)) return [];
  const totalWeeks = ctx?.totalWeeks ?? 18;
  const allWeeks = Array.from({ length: totalWeeks }, (_, k) => k + 1);
  return raw
    .map((c: any, i: number): Course | null => {
      const name = String(c?.name ?? "").trim();
      if (!name) return null;
      const weekday = Number(c?.weekday);
      const start = Number(c?.startPeriod);
      const end = Number(c?.endPeriod);
      if (!Number.isInteger(weekday) || weekday < 1 || weekday > 7) return null;
      const s = Number.isInteger(start) ? Math.max(1, start) : 1;
      const e = Number.isInteger(end) ? Math.max(s, end) : s;
      // 优先用具体日期换算周次（最精确）；否则用 weeks，最后才默认整学期
      const hasDates = Array.isArray(c?.dates) && c.dates.length > 0;
      const hasWeeks = Array.isArray(c?.weeks)
        ? c.weeks.length > 0
        : c?.weeks != null && String(c.weeks).trim() !== "";
      const weeks = hasDates
        ? weeksFromDates(c.dates, ctx?.startDate, totalWeeks)
        : hasWeeks ? parseWeeksValue(c.weeks, totalWeeks) : allWeeks;
      // Explicit dates/weeks outside this semester must never become weekly classes.
      if (!weeks.length) return null;
      const color: CourseColor = COLOR_VALUES.includes(c?.color)
        ? (c.color as CourseColor)
        : COLOR_VALUES[i % COLOR_VALUES.length];
      return {
        id: "",
        name,
        teacher: String(c?.teacher ?? "").trim(),
        classroom: String(c?.classroom ?? "").trim(),
        weekday,
        startPeriod: s,
        endPeriod: e,
        weeks,
        color,
        credits: c?.credits != null &&
          String(c.credits).trim() !== "" &&
          Number.isFinite(Number(c.credits))
          ? Number(c.credits)
          : undefined,
        note: "",
      };
    })
    .filter((c): c is Course => c !== null);
}

/** 从课表图片识别课程 */
export async function recognizeScheduleFromImage(
  base64: string,
  apiKey: string,
  mimeType = "image/jpeg",
  ctx?: ScheduleImportContext,
  signal?: AbortSignal,
): Promise<Schedule> {
  const messages: ChatContent[] = [
    {
      role: "system",
      content:
        "你是一个精准的中文课程表识别助手，擅长读取教务系统截图、手写课表和表格照片。",
    },
    {
      role: "user",
      content: [
        {
          type: "text",
          text: `请识别这张课程表图片中的全部课程。\n先判断这张图片是否确实是课程表；若不是，输出 {"error":"NOT_TARGET"}，绝不要凭空编造课程。\n${scheduleSchemaHint(ctx)}`,
        },
        imagePart(base64, mimeType),
      ],
    },
  ];

  const parsed = await chatJson<any>(messages, apiKey, {
    model: VISION_MODEL,
    temperature: 0.1,
    signal,
  });
  ensureTarget(parsed, "这张图片不是课程表，请更换正确的图片后重试");

  return buildSchedule(parsed, ctx);
}

/** 把模型解析结果组装成 Schedule（含学期类型与总周数，默认沿用当前作息） */
function buildSchedule(parsed: any, ctx?: ScheduleImportContext): Schedule {
  const parsedStart =
    typeof parsed?.startDate === "string" &&
    /^\d{4}-\d{2}-\d{2}$/.test(parsed.startDate)
      ? parsed.startDate
      : undefined;
  // 优先沿用当前课表的开学日：模型对「第 N 周」的换算必须和本学期的周次一致，
  // 否则外教课这类按日期排的课表会整体错位
  const startDate =
    (ctx?.startDate && /^\d{4}-\d{2}-\d{2}$/.test(ctx.startDate)
      ? ctx.startDate
      : undefined) ??
    parsedStart ??
    nextMonday();
  const sem = resolveSemester(new Date(`${startDate}T00:00:00`));
  const totalWeeks = ctx?.totalWeeks ?? sem.totalWeeks;
  // 周次换算必须以最终采用的开学日期为基准，否则日期→周次会整体错位
  const courses = normalizeCourses(parsed?.courses, {
    ...ctx,
    startDate,
    totalWeeks,
  });
  return {
    // 导入预览的占位 id：真正导入时保留当前课表的 id 与用户命名
    id: "import-preview",
    name: String(parsed?.name ?? sem.name),
    kind: sem.kind,
    startDate,
    endDate: toIsoDate(addDays(parseIsoDate(startDate), totalWeeks * 7 - 1)),
    totalWeeks,
    periods: ctx?.periods?.length ? ctx.periods : DEFAULT_PERIODS,
    courses,
  };
}

/** 从文本/表格内容识别课程 */
export async function recognizeScheduleFromText(
  rawText: string,
  apiKey: string,
  ctx?: ScheduleImportContext,
  signal?: AbortSignal,
): Promise<Schedule> {
  const text = /<(?:html|table|tr|td)\b/i.test(rawText)
    ? cleanHtmlToText(rawText)
    : rawText;
  const messages: ChatContent[] = [
    { role: "system", content: "你是一个精准的中文课程表解析助手。" },
    {
      role: "user",
      content: `请把以下课表文本（可能是 CSV / JSON / 复制粘贴的表格）解析为课程。\n先判断内容是否确实是课表；若不是，输出 {"error":"NOT_TARGET"}，绝不要凭空编造课程。\n${scheduleSchemaHint(ctx)}\n\n课表内容：\n${text.slice(0, 12000)}`,
    },
  ];
  const parsed = await chatJson<any>(messages, apiKey, {
    model: TEXT_MODEL,
    temperature: 0.1,
    signal,
  });
  ensureTarget(parsed, "该文档不是课程表，请更换正确的文件后重试");
  return buildSchedule(parsed, ctx);
}

/** 从作息表图片/文本识别节次时间 */
export async function recognizePeriods(
  source: { imageBase64?: string; mimeType?: string; text?: string },
  apiKey: string,
  signal?: AbortSignal,
): Promise<Period[]> {
  const parts: ChatContent["content"] = [];
  const cleanedText = source.text
    ? /<(?:html|table|tr|td)\b/i.test(source.text)
      ? cleanHtmlToText(source.text)
      : source.text
    : undefined;
  const text = `请识别作息表中的上课节次与起止时间（跳过午休、晚饭、早读、眼保健操等非上课节次）。先判断输入是否确实是作息表（上下课时间表）；若不是，输出 {"error":"NOT_TARGET"}，绝不要凭空编造时间。输出严格 JSON：{"periods":[{"index":1,"label":"第1节","startTime":"08:00","endTime":"08:45"}]}，时间用 24 小时制 HH:mm。${
    cleanedText ? `\n作息内容：\n${cleanedText.slice(0, 8000)}` : ""
  }`;
  if (source.imageBase64) {
    parts.push({ type: "text", text }, imagePart(source.imageBase64, source.mimeType));
  } else {
    parts.push({ type: "text", text });
  }

  const parsed = await chatJson<any>(
    [{ role: "user", content: parts }],
    apiKey,
    {
      model: source.imageBase64 ? VISION_MODEL : TEXT_MODEL,
      temperature: 0.1,
      signal,
    },
  );
  ensureTarget(
    parsed,
    source.imageBase64
      ? "这张图片不是作息表，请更换正确的作息表（上下课时间表）后重试"
      : "该文档不是作息表，请更换正确的作息表（上下课时间表）后重试",
  );

  const rawList = Array.isArray(parsed?.periods) ? parsed.periods : [];
  const normalized = rawList
    .map((p: any, i: number) => ({
      label: String(p?.label ?? `第${Number(p?.index) || i + 1}节`).trim(),
      startTime: normalizeClockInput(String(p?.startTime ?? "")),
      endTime: normalizeClockInput(String(p?.endTime ?? "")),
    }))
    .filter(
      (p: { startTime: string; endTime: string }) =>
        validClock(p.startTime) &&
        validClock(p.endTime) &&
        p.endTime > p.startTime,
    );
  // 排序、去重、过滤时间重叠段并重新从 1 连续编号；识别不出直接返回空数组不编造
  return normalizeParsedPeriods(normalized);
}

/** 从成绩单（图片/文本）解析成绩记录：分数、绩点、课程类型与学期 */
export async function recognizeGrades(
  source: { imageBase64?: string; text?: string; mimeType?: string },
  apiKey: string,
  fallbackSemester: SemesterKind = "fall",
  opts?: {
    scale?: GpaScaleId;
    types?: readonly GradeType[];
    signal?: AbortSignal;
  },
): Promise<GradeDraft[]> {
  const cleanedText = source.text
    ? /<(?:html|table|tr|td)\b/i.test(source.text)
      ? cleanHtmlToText(source.text)
      : source.text
    : undefined;
  const typeHint = opts?.types?.length
    ? opts.types.map((t) => `${t.id}=${t.name}`).join(" / ")
    : "required=必修 / elective=选修 / general=通识选修";
  const instruction = `请识别成绩单/成绩查询截图中的全部课程成绩。只要出现「课程名 + 分数/等级」的列表（即使没有学分、没有绩点列，甚至只是手机截图），都算成绩单；只有确实与成绩无关时才输出 {"error":"NOT_TARGET"}，绝不要凭空编造成绩。输出严格 JSON：
{
  "grades": [
    {
      "name": "课程名",
      "credit": 3,            // 学分（数字）；成绩单没有学分列时填 null，不要编造
      "scoreType": "numeric", // numeric=百分制数字 / letter=字母等级 / text=文字等级
      "score": "87",          // 按成绩单原样输出：87 / A / B+ / 优秀 / 良好 / 中等 / 及格
      "gpa": 3.7,             // 成绩单上已有的绩点，没有就 null，不要猜测
      "type": "required",     // 优先从以下课程类型中选择：${typeHint}
      "semester": "fall"      // fall=上学期(秋) / spring=下学期(春) / summer=短学期，无法判断用 null
    }
  ]
}
注意：
- 只输出 JSON，不要多余文字
- 成绩单缺少学分列是非常常见的情况：此时仍要照常输出每一门课，credit 填 null
- 页眉里的「2025/2026（上）」「大一上学期」「GPA 2.884」等信息只用于推断 semester，不要作为课程输出
- 每门课一条记录；姓名、学号、总绩点、平均分、学分总计等非课程行不要输出
- score 必须保留成绩单上的原始写法（数字 / 字母 / 文字），不要擅自换算成百分制
- gpa 只填成绩单上明确标注的数值（0-5），没有则填 null${
    cleanedText ? `\n成绩单内容：\n${cleanedText.slice(0, 10000)}` : ""
  }`;

  const parts: ChatContent["content"] = [];
  if (source.imageBase64) {
    parts.push(
      { type: "text", text: instruction },
      imagePart(source.imageBase64, source.mimeType),
    );
  } else {
    parts.push({ type: "text", text: instruction });
  }

  const parsed = await chatJson<any>(
    [{ role: "user", content: parts }],
    apiKey,
    {
      model: source.imageBase64 ? VISION_MODEL : TEXT_MODEL,
      temperature: 0.1,
      // 成绩识别是用户主动等待的交互任务：单次限时，失败立即回退本地离线识别
      timeoutMs: 40_000,
      attempts: 1,
      signal: opts?.signal,
    },
  );
  ensureTarget(
    parsed,
    source.imageBase64
      ? "这张图片不是成绩单，请更换正确的图片后重试"
      : "该文档不是成绩单，请更换正确的文件后重试",
  );

  const raw: any[] = Array.isArray(parsed?.grades)
    ? parsed.grades
    : Array.isArray(parsed)
      ? parsed
      : [];

  return raw
    .map((g: any): GradeDraft | null => {
      const semester = normalizeSemester(g?.semester) ?? fallbackSemester;
      return normalizeGradeInput(
        { ...g, semester },
        { scale: opts?.scale, types: opts?.types },
      );
    })
    .filter((g): g is GradeDraft => g !== null);
}

function nextMonday(): string {
  const d = new Date();
  const day = d.getDay();
  const diff = (8 - (day === 0 ? 7 : day)) % 7 || 7;
  d.setDate(d.getDate() + diff);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate(),
  ).padStart(2, "0")}`;
}

/* -------------------------------------------------------------------------- */
/*  课程表助手                                                                  */
/* -------------------------------------------------------------------------- */

export interface AssistantContext {
  schedule: Schedule;
  weekIndex: number;
  /** 全部课表（供新建 / 合并课表指令定位目标） */
  schedules: { id: string; name: string }[];
  /** 作者 door 召唤后开启的「蓝色大肥鱼」人格 */
  persona?: "whale";
  /** 可选：显式传入课程任务列表；省略时自动读取 useStore 中的 courseTasks */
  courseTasks?: readonly CourseTask[];
  /** 可选：显式覆盖是否允许向大肥鱼传入成绩摘要；省略时读取 useSettings.whaleShareGrades */
  shareGrades?: boolean;
  /** 可选：显式传入成绩上下文（测试环境安全） */
  grades?: readonly GradeRecord[];
  gradeYears?: readonly GradeYear[];
  gradeTypes?: readonly GradeType[];
  gradeRule?: GradeRule;
  gpaScale?: GpaScaleId;
  /** 可选：显式传入考勤与专注记录（测试环境安全） */
  attendanceByCourse?: Readonly<Record<string, readonly AttendanceEntryLike[]>>;
  customAbsenceLimits?: Readonly<Record<string, number>>;
  focusLogs?: readonly FocusLogLike[];
}

export interface AssistantResult {
  reply: string;
  sticker?: WhaleStickerId | null;
  /** 课表操作 + 用户专属的额外操作（仅在 whale 人格下可能出现） */
  actions: AssistantAction[];
  /** DeepSeek 官方联网搜索返回的参考来源（一步到位，无需二次气泡） */
  sources?: { title: string; url: string }[];
  /** 是否在本轮启用了深度思考或官方联网检索 */
  usedThinking?: boolean;
  usedWebSearch?: boolean;
  /**
   * 人格切换意图：由模型按语义判断，不依赖固定口令。
   * - summon：普通状态下识别到用户在召唤大肥鱼
   * - dismiss：鲸鱼状态下识别到用户想让大肥鱼退下
   */
  intent?: "summon" | "dismiss";
}

function readCourseTasksSafe(ctx?: AssistantContext): readonly CourseTask[] {
  if (ctx?.courseTasks) return ctx.courseTasks;
  try {
    // 延迟加载避免仅测试课表解析器的孤立 Node 环境触发 AsyncStorage / RN 依赖
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const mod = require("@/store/useStore") as {
      useStore?: { getState?: () => { courseTasks?: CourseTask[] } };
    };
    const list = mod?.useStore?.getState?.().courseTasks;
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

function readWhaleShareGradesSafe(ctx?: AssistantContext): boolean {
  if (typeof ctx?.shareGrades === "boolean") return ctx.shareGrades;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const mod = require("@/store/useSettings") as {
      useSettings?: { getState?: () => { whaleShareGrades?: boolean } };
    };
    const value = mod?.useSettings?.getState?.().whaleShareGrades;
    return typeof value === "boolean" ? value : true;
  } catch {
    return true;
  }
}

function readGradesContextSafe(ctx?: AssistantContext): {
  grades: readonly GradeRecord[];
  gradeYears: readonly GradeYear[];
  gradeTypes: readonly GradeType[];
  rule?: GradeRule;
  scale: GpaScaleId;
} {
  let scale: GpaScaleId = ctx?.gpaScale ?? "five";
  if (!ctx?.gpaScale) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const settingsMod = require("@/store/useSettings") as {
        useSettings?: { getState?: () => { gpaScale?: GpaScaleId } };
      };
      const storeScale = settingsMod?.useSettings?.getState?.().gpaScale;
      if (storeScale) scale = storeScale;
    } catch {
      // 忽略孤立测试环境
    }
  }

  if (ctx?.grades) {
    return {
      grades: ctx.grades,
      gradeYears: ctx.gradeYears ?? [],
      gradeTypes: ctx.gradeTypes ?? [],
      rule: ctx.gradeRule,
      scale,
    };
  }

  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const storeMod = require("@/store/useStore") as {
      useStore?: {
        getState?: () => {
          grades?: GradeRecord[];
          gradeYears?: GradeYear[];
          gradeTypes?: GradeType[];
          gradeRules?: GradeRule[];
          activeGradeRuleId?: string;
        };
      };
    };
    const st = storeMod?.useStore?.getState?.();
    const rules = Array.isArray(st?.gradeRules) ? st.gradeRules : [];
    const rule =
      ctx?.gradeRule ??
      rules.find((r) => r.id === st?.activeGradeRuleId) ??
      rules[0];
    return {
      grades: Array.isArray(st?.grades) ? st.grades : [],
      gradeYears: ctx?.gradeYears ?? (Array.isArray(st?.gradeYears) ? st.gradeYears : []),
      gradeTypes: ctx?.gradeTypes ?? (Array.isArray(st?.gradeTypes) ? st.gradeTypes : []),
      rule,
      scale,
    };
  } catch {
    return { grades: [], gradeYears: [], gradeTypes: [], scale };
  }
}

function readStudyProgressSafe(ctx?: AssistantContext): {
  attendanceByCourse?: Readonly<Record<string, readonly AttendanceEntryLike[]>>;
  customAbsenceLimits?: Readonly<Record<string, number>>;
  focusLogs?: readonly FocusLogLike[];
} {
  if (
    ctx?.attendanceByCourse !== undefined ||
    ctx?.customAbsenceLimits !== undefined ||
    ctx?.focusLogs !== undefined
  ) {
    return {
      attendanceByCourse: ctx.attendanceByCourse,
      customAbsenceLimits: ctx.customAbsenceLimits,
      focusLogs: ctx.focusLogs,
    };
  }
  try {
    // 延迟读取学习进度 store（若尚未落地或处于精简 Node 单测中则安全降级为空）
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const mod = require("@/store/useStudyProgress") as {
      useStudyProgress?: {
        getState?: () => {
          attendanceByCourse?: Record<string, AttendanceEntryLike[]>;
          customAbsenceLimits?: Record<string, number>;
          focusLogs?: FocusLogLike[];
        };
      };
    };
    const st = mod?.useStudyProgress?.getState?.();
    if (!st) return {};
    return {
      attendanceByCourse: st.attendanceByCourse,
      customAbsenceLimits: st.customAbsenceLimits,
      focusLogs: st.focusLogs,
    };
  } catch {
    return {};
  }
}

export { sanitizeAddTaskAction };

const SCHEDULE_ACTION_TYPES = new Set([
  "add",
  "remove",
  "update",
  "create_schedule",
  "merge_schedule",
  "add_task",
]);

const WHALE_ACTION_TYPES = new Set([
  "set_summon_phrase",
  "set_background",
  "web_search",
  "generate_image",
  "summon_pet",
  "dismiss_pet",
  "forget_memory",
]);

function filterAssistantActions(
  rawList: readonly unknown[],
  allowWhale: boolean,
  schedule?: Schedule,
): AssistantAction[] {
  const out: AssistantAction[] = [];
  for (const item of rawList) {
    if (!item || typeof item !== "object" || Array.isArray(item)) continue;
    const type = (item as Record<string, unknown>).type;
    if (typeof type !== "string") continue;
    if (type === "add_task") {
      const sanitized = sanitizeAddTaskAction(item, schedule);
      if (sanitized) out.push(sanitized);
      continue;
    }
    if (SCHEDULE_ACTION_TYPES.has(type) || (allowWhale && WHALE_ACTION_TYPES.has(type))) {
      out.push(item as AssistantAction);
    }
  }
  return out;
}

/** 从课表上下文、成绩与学习进度提取今日课程、下节课、近期作业/考试、空课、成绩、考勤预警与专注摘要（测试环境安全） */
export function buildLiveSnapshotFromCtx(
  ctx?: AssistantContext,
  now = new Date(),
): WhaleLiveStudySnapshot {
  const nowMs = now.getTime();
  const snapshot: WhaleLiveStudySnapshot = { nowLabel: formatTimeContext(nowMs) };
  const upcomingTasks = getUpcomingTasks(readCourseTasksSafe(ctx), nowMs, 5);
  if (upcomingTasks.length) {
    snapshot.pendingTasks = upcomingTasks
      .map((t) => formatTaskBrief(t, nowMs))
      .join("；");
  }

  if (ctx?.schedule) {
    const freeSlots = computeWeeklyFreeSlots(ctx.schedule, ctx.weekIndex);
    if (freeSlots) snapshot.freeSlots = freeSlots;
  }

  if (readWhaleShareGradesSafe(ctx)) {
    const { grades, gradeYears, gradeTypes, rule, scale } = readGradesContextSafe(ctx);
    const gradesSummary = summarizeGradesForCopilot(
      grades,
      gradeYears,
      gradeTypes,
      rule,
      scale,
    );
    if (gradesSummary) snapshot.gradesSummary = gradesSummary;
  }

  const progress = readStudyProgressSafe(ctx);
  if (ctx?.schedule && progress.attendanceByCourse) {
    const alerts = summarizeAttendanceRisks(
      ctx.schedule,
      progress.attendanceByCourse,
      progress.customAbsenceLimits,
    );
    if (alerts) snapshot.attendanceAlerts = alerts;
  }
  if (progress.focusLogs?.length) {
    const focusSummary = summarizeRecentFocus(progress.focusLogs, nowMs);
    if (focusSummary) snapshot.focusSummary = focusSummary;
  }

  if (ctx?.schedule?.courses?.length) {
    const weekday = now.getDay() === 0 ? 7 : now.getDay();
    const todayList = ctx.schedule.courses
      .filter((c) => c.weekday === weekday && c.weeks.includes(ctx.weekIndex))
      .map((c) => ({
        course: c,
        time: getCourseTime(ctx.schedule.periods ?? [], c.startPeriod, c.endPeriod, c),
      }))
      .sort((a, b) => a.time.startMinutes - b.time.startMinutes);
    if (!todayList.length) {
      snapshot.todayCourses = "今天没有排课";
    } else {
      snapshot.todayCourses = todayList
        .slice(0, 6)
        .map(
          ({ course, time }) =>
            `${course.name}(${time.startTime}${course.classroom ? `@${course.classroom}` : ""})`,
        )
        .join("、");
      const nowMin = now.getHours() * 60 + now.getMinutes();
      const upcoming = todayList.find(({ time }) => time.startMinutes > nowMin);
      if (upcoming) {
        const diff = upcoming.time.startMinutes - nowMin;
        if (diff <= 90) {
          snapshot.nextCourseHint = `${diff} 分钟后是「${upcoming.course.name}」${upcoming.course.classroom ? `（${upcoming.course.classroom}）` : ""}`;
        }
      }
    }
  }

  return snapshot;
}

/** 自然语言改课表：模型返回对话文本 + 可一键应用的操作（支持批量）；大肥鱼模式优先走 DeepSeek 原生 Tool-Calling Agent */
export async function askAssistant(
  history: WhaleHistoryMessage[],
  ctx: AssistantContext,
  apiKey: string,
  signal?: AbortSignal,
  opts?: { onStatus?: (status: string) => void },
): Promise<AssistantResult> {
  // 大肥鱼人格在具备原生 Agent 传输能力时，优先使用 DeepSeek 官方内置搜索 + 原生 Function Calling Agent
  if (ctx.persona === "whale" && typeof chatAgentTurn === "function") {
    try {
      const agentRes = await runWhaleAgent(history, apiKey, {
        scheduleCtx: {
          schedule: ctx.schedule,
          weekIndex: ctx.weekIndex,
          schedules: ctx.schedules,
        },
        liveSnapshot: buildLiveSnapshotFromCtx(ctx),
        signal,
        onStatus: opts?.onStatus,
      });
      return {
        reply: agentRes.reply,
        sticker: agentRes.sticker,
        actions: agentRes.actions,
        sources: agentRes.sources,
        usedThinking: agentRes.usedThinking,
        usedWebSearch: agentRes.usedWebSearch,
        intent: agentRes.intent,
      };
    } catch (err) {
      // 仅在第三方网关完全不支持 tools 返回 400 时才优雅降级到旧 JSON 协议，其余错误直接抛出
      if (
        signal?.aborted ||
        !(err instanceof DeepSeekError) ||
        err.status !== 400
      ) {
        throw err;
      }
    }
  }

  const whaleContext =
    ctx.persona === "whale" ? createWhaleContext(history, true, buildLiveSnapshotFromCtx(ctx)) : undefined;
  const coursesBrief = ctx.schedule.courses
    .map(
      (c) =>
        `- [${c.id}] ${c.name} | 周${c.weekday} 第${c.startPeriod}-${c.endPeriod}节 ${c.startTime ?? ""}–${c.endTime ?? ""} | ${
          c.classroom || "未知教室"
        } | ${c.teacher || "未知教师"} | 周次[${c.weeks.join(",")}]`,
    )
    .join("\n");

  /**
   * 蓝色大肥鱼人格：DeepSeek 鲸鱼娘的同人设定（蓝发、鲸鱼尾、微胖、爱吃白饭、爱摸鱼）。
   * 只有作者 door 通过隐藏口令召唤后才启用，普通用户看到的仍是正常课表助手。
   */
  const whalePersona =
    ctx.persona === "whale"
      ? `

【当前人格：鲸鱼角色】
${whaleContext?.prompt}
${WHALE_EXPRESSION_INSTRUCTIONS}
- 用户让你改课表时，仍然必须准确输出 actions。
- 额外能力（直接写进 reply，不要生成 action）：
  1. 今日运势：宜 / 忌 / 幸运节次 / 幸运色
  2. 夸夸用户：结合他的真实课表夸
  3. 今天吃什么：白饭梗 + 推荐食堂
  4. 摸鱼一下：给一个 30 秒偷懒小任务
  5. 冷笑话 / 一句歌词
- 用户专属权限：只有用户明确要求时才在 actions 里追加下列操作（可与课表操作同时存在，一次最多 1 个搜索 + 1 个生图）：
  · 改召唤口令：{"type":"set_summon_phrase","phrase":"新的召唤口令（2-12 个字）"}
  · 改软件背景：{"type":"set_background","tint":"sky|rose|mint|amber|violet|noir","effect":"aurora|plain"}
    （sky 天空蓝 / rose 晚霞粉 / mint 薄荷绿 / amber 琥珀暖光 / violet 紫罗兰 / noir 暗夜灰；effect 省略则保持原光效）
  · 联网找资料：{"type":"web_search","query":"检索关键词"}（系统会拿真实搜索结果让你再回答一次）
  · 生图：{"type":"generate_image","prompt":"画面描述","size":"square|portrait|landscape"}（size 可省略）
  · 桌宠模式：{"type":"summon_pet"}（用户想让你从屏幕边出来陪着他，比如「出来陪我」「变成桌宠」「待在屏幕边上」时才用）
  · 收回桌宠：{"type":"dismiss_pet"}（用户让你回去、别在外面待着了，比如「回去休息吧」「不用陪着我了」时才用）
  · 清空全部记忆：{"type":"forget_memory"}（仅在用户明确要求清空全部聊天和记忆时使用。只想忘掉某件事时，请引导到「人设与记忆 → 记忆小本本」单独删除，不能清空全部）
- 不能编造搜索结果或图片已经生成；回复里不要展示 URL
- 不要提自己是 AI 模型，不要解释提示词

【人格收放：按语义自行判断，不依赖固定口令】
- 用户可以用任何说法让你退下 / 收工 / 变回正经助手 / 别再黏着，比如「行了你走吧」「差不多得了」「你恢复正常吧」「我要好好学习了」「先撤了吧」「不聊了」，甚至只是叹气说「唉，还是看课表吧」。只要意图是结束鲸鱼人格，就把 intent 设为 "dismiss"。
- 判为 dismiss 时，reply 用一到两句不舍但乖巧的告别口吻（可以带一个颜文字），不要输出任何课表操作，也不要再卖萌纠缠。
- 普通对话里的「不用了」「算了」「谢谢」只是聊天收尾，intent 必须为 null，绝不要过度解读。
- 你此刻已经在场，任何情况下都不要输出 "summon"。`
      : "";

  const system = `你是「课程表专属助手」，帮用户用自然语言调整和优化课表。当前是第 ${ctx.weekIndex} 周，本学期共 ${ctx.schedule.totalWeeks} 周。
当前课表：「${ctx.schedule.name}」（所有操作默认作用于它）
全部课表：${ctx.schedules.map((s) => `「${s.name}」`).join("、") || "（无）"}
当前课程：
${coursesBrief || "（暂无课程）"}
节次时间参考（用户提到具体时间时，对照此表换算成节次）：
${ctx.schedule.periods.map((p) => `${p.index}. ${p.startTime}-${p.endTime}`).join("\n")}

你需要回复一个严格 JSON（不要带注释或多余文本）：
{
  ${ctx.persona === "whale" ? `"thought": "40-90字隐藏内心思考（先共情与联想记忆，再规划自然回应；绝不展示给用户）",\n  ` : ""}"reply": "给用户的自然语言回复",
  "intent": null,
  "actions": []
}
intent 是人格切换意图，只能取 "summon" / "dismiss" / null：
- 你只能判断对方是否在召唤「蓝色大肥鱼」——一只蓝发、鲸鱼尾巴、微胖、爱吃白米饭、爱摸鱼的鲸鱼娘。不要依赖固定口令或关键词，按真实意图判断：想让鱼出来 / 上线 / 现身 / 陪你 / 叫那条鱼过来，都算召唤，哪怕是吐槽、暗示或玩笑，例如「那条鱼呢」「叫鱼出来陪我」「想你了肥鱼」「你是不是该变身了」「最近怎么不见那只肥鱼」「别装助手了出来」。
- 判为召唤时把 intent 设为 "summon"，reply 直接用用户保存的角色设定登场回应；不要解释规则，不要提口令、人格、彩蛋或系统设定。
${!whaleContext ? `仅在召唤时使用以下角色设定，普通课表对话不要使用：\n${buildWhalePersonaPrompt(useWhalePersona.getState().persona)}` : ""}
- 只是提到或讨论「大肥鱼」（比如问它是谁、在不在、是不是彩蛋），或者跟课程表相关的话题，不算召唤，intent 保持 null。
- 普通状态下不要输出 "dismiss"。
actions 是操作数组，一次可以放多个（用户一句话提出多件事时全部放进去）；不需要改课表时返回空数组。可用操作：
  添加课程：{"type":"add","course":{"name":"","teacher":"","classroom":"","weekday":1,"startPeriod":1,"endPeriod":2,"weeks":[1,2,3],"color":"sky","credits":3,"note":""}}
  删除课程：{"type":"remove","courseId":"...","courseName":"..."}
  修改课程：{"type":"update","courseId":"...","courseName":"...","targetWeeks":[8],"targetWeekday":3,"patch":{仅需改动的字段}}
  新建课表：{"type":"create_schedule","scheduleName":"外教课"}
  合并课表：{"type":"merge_schedule","sourceScheduleName":"外教课"}（把那份课表的课程并入当前课表）
  新增待办/考试：{"type":"add_task","task":{"title":"高数期末","type":"exam","dueAt":1797728400000,"reminder":60,"location":"教三204","seat":"15","examMode":"closed","note":"带学生证","course":{"scheduleId":"${ctx.schedule.id}","courseId":"...","courseName":"高等数学"}}}（type 取 "homework"|"exam"|"review"；dueAt 为毫秒时间戳；reminder 取 0|15|60|1440；examMode 取 "closed"|"open"|"paper"；location/seat/examMode/note/course 可省略）

规则：
- course.weeks 是开课周次数组；用户没说周次时默认整学期 [1..${ctx.schedule.totalWeeks}]
- 修改指定周（如第八周/本周/下周）必须设置 targetWeeks 为原课程中被修改的周次；未说周次才省略 targetWeeks。targetWeekday 为原课程星期，用于定位，调到周四则 patch.weekday=4。
- targetWeeks 决定修改范围；patch.weeks 是修改后迁往的周次，普通单周调时不要填 patch.weeks。只改第8周不得覆盖其他周，也不得删除其他周。
- 用户说具体起止时刻必须在 patch 同时输出 startTime/endTime，格式 HH:mm；执行层自动对照作息换算 startPeriod/endPeriod，不能只在回复里改时间，不能改全局作息表。
- 例如「把第八周星期三的数据结构改成从8点到10点40」：定位原周三且 weeks 含8的数据结构，输出 targetWeeks:[8],targetWeekday:3,patch:{"startTime":"08:00","endTime":"10:40"}，若覆盖作息第1到3节则自动变为1–3节。其他周维持1–2节。
- 同名多条记录时按原星期、周次和节次选择精确 id；仍不唯一就先追问，actions 返回空数组，不猜测。
- weekday 取 1-7（周一到周日）；startPeriod/endPeriod 必须取自节次参考表
- 删除/修改课程时 courseId 必须来自当前课程列表的 [id]；拿不准就同时写 courseName（会按名称兜底）
- 合并/新建课表时 scheduleName 必须来自全部课表列表（新建除外，名称由用户指定）
- 回复简洁友好，全部使用中文${whalePersona}`;

  const messages: ChatContent[] = [
    { role: "system", content: system },
    ...recentWhaleHistory(whaleContext ? whaleContext.history : history, whaleContext ? 10000 : 6000)
      .map((m) => ({ role: m.role, content: m.content }) as ChatContent),
  ];

  const parsed = await chatJson<any>(messages, apiKey, {
    signal,
    model: TEXT_MODEL,
    // 大肥鱼人格需要更高的发散度，课表操作仍由 actions 的结构约束保证准确
    temperature: ctx.persona === "whale" ? 0.95 : 0.6,
  });
  if (whaleContext) {
    whaleContext.remember({
      memoryUpdates: parsed?.memoryUpdates,
      episode: parsed?.episode,
      openLoop: parsed?.openLoop,
      moodShift: parsed?.moodShift,
    });
    maybeScheduleWhaleReflection(apiKey);
  }

  // 兼容 action（单个）与 actions（数组）两种返回
  const raw = parsed?.actions ?? parsed?.action;
  const list = Array.isArray(raw) ? raw : raw ? [raw] : [];
  // 额外权限只在鲸鱼人格下放行，普通助手即使被诱导也不会执行；add_task 必须经严格字段清洗校验
  const actions = filterAssistantActions(
    list,
    ctx.persona === "whale",
    ctx.schedule,
  );

  // 人格切换意图：普通状态只放行 summon，鲸鱼状态只放行 dismiss，
  // 避免模型在错误的人格下误判
  const rawIntent = parsed?.intent;
  const intent =
    ctx.persona === "whale"
      ? rawIntent === "dismiss"
        ? "dismiss"
        : undefined
      : rawIntent === "summon"
        ? "summon"
        : undefined;

  return {
    reply: String(parsed?.reply ?? "我暂时没能理解，可以换个说法吗？"),
    sticker: whaleContext && intent !== "dismiss"
      ? resolveWhaleSticker(parsed?.sticker, history.filter((m) => m.role === "user").at(-1)?.content ?? "", String(parsed?.reply ?? ""))
      : null,
    actions,
    intent,
  };
}

/** 允许用户直接粘贴自然语言快速改课（不带历史） */
export async function quickEdit(
  prompt: string,
  ctx: AssistantContext,
  apiKey: string,
) {
  return askAssistant([{ role: "user", content: prompt }], ctx, apiKey);
}

/* -------------------------------------------------------------------------- */
/*  批量识别（相册多选）                                                        */
/* -------------------------------------------------------------------------- */

export interface BatchImage {
  imageBase64?: string;
  mimeType: string;
  uri: string;
}

interface BatchOptions<Row> {
  /** 联网且有 Key 时走云端视觉模型，否则走设备端离线识别 */
  useAI: boolean;
  signal?: AbortSignal;
  scale?: GpaScaleId;
  types?: readonly GradeType[];
  /** 开始处理第 current 张（从 1 开始），total 为总张数 */
  onProgress?: (current: number, total: number) => void;
  onPageFailure?: (index: number) => void;
  onPageRows?: (index: number, rows: readonly Row[]) => void;
  onFallbackOffline?: () => void;
}

function isAbortError(err: unknown): boolean {
  return (
    err instanceof Error &&
    (err.name === "AbortError" || err.message === "请求已取消")
  );
}

/** 受控并发遍历（默认 2 路并发，按原索引有序回传） */
async function runWithConcurrency<T>(
  count: number,
  concurrency: number,
  signal: AbortSignal | undefined,
  worker: (index: number) => Promise<T>,
): Promise<(T | undefined)[]> {
  const results = new Array<T | undefined>(count);
  let cursor = 0;
  const lanes = Math.max(1, Math.min(concurrency, count));
  await Promise.all(
    Array.from({ length: lanes }, async () => {
      while (cursor < count) {
        if (signal?.aborted) break;
        const idx = cursor++;
        results[idx] = await worker(idx);
      }
    }),
  );
  return results;
}

/** 多张课表合并：同一门课（名称 + 星期 + 节次 + 教室相同）自动合并周次，避免重复 */
export function courseImportKey(course: Course): string {
  return JSON.stringify([course.name, course.weekday, course.startPeriod, course.endPeriod, course.classroom]);
}

export function mergeDuplicateCourses(courses: Course[]): Course[] {
  const merged = new Map<string, Course>();
  for (const course of courses) {
    const key = courseImportKey(course);
    const prev = merged.get(key);
    if (!prev) {
      merged.set(key, { ...course, weeks: [...course.weeks] });
      continue;
    }
    // 重复课程：周次取并集，其余字段只在缺失时补齐
    prev.weeks = [...new Set([...prev.weeks, ...course.weeks])].sort(
      (a, b) => a - b,
    );
    if (!prev.teacher && course.teacher) prev.teacher = course.teacher;
    if (prev.credits == null && course.credits != null) {
      prev.credits = course.credits;
    }
  }
  return [...merged.values()];
}

/** 归一化文本：忽略空白与引号差异（同一门课在不同照片里的 OCR 结果常有出入） */
function normalizeGradeText(text: string): string {
  return text.replace(/[\s"'“”‘’]/g, "").toLowerCase();
}

/**
 * 多张成绩单合并：同一学期 + 同一门课 + 同一分数视为重复，
 * 学分 / 绩点等字段取更完整的那份（照片里常有一张漏识别学分）
 */
export function gradeImportKey(grade: GradeDraft): string {
  return JSON.stringify([grade.semester, normalizeGradeText(grade.name), normalizeGradeText(grade.score)]);
}

export function dedupeGrades(grades: GradeDraft[]): GradeDraft[] {
  const merged = new Map<string, GradeDraft>();
  for (const grade of grades) {
    const key = gradeImportKey(grade);
    const prev = merged.get(key);
    if (!prev) {
      merged.set(key, { ...grade });
      continue;
    }
    if (prev.credit == null && grade.credit != null) prev.credit = grade.credit;
    if (prev.gpa == null && grade.gpa != null) prev.gpa = grade.gpa;
    if (!prev.type && grade.type) prev.type = grade.type;
  }
  return [...merged.values()];
}

/** 批量识别课表：双路受控并发 + 按需读取 base64 + 单张 AI 失败自动回退离线 OCR */
export async function recognizeSchedulesBatch(
  images: BatchImage[],
  apiKey: string,
  ctx: ScheduleImportContext,
  opts: BatchOptions<Course>,
): Promise<{ schedule: Schedule; skipped: number; usedOfflineFallback: boolean }> {
  let skipped = 0;
  let firstError: unknown = null;
  let usedOfflineFallback = false;
  let started = 0;

  const pageResults = await runWithConcurrency(
    images.length,
    opts.useAI ? 2 : 1,
    opts.signal,
    async (i) => {
      if (opts.signal?.aborted) return undefined;
      const img = images[i];
      started += 1;
      opts.onProgress?.(started, images.length);
      try {
        let found: Schedule;
        if (opts.useAI) {
          try {
            const base64 = await readImageBase64(img.uri, img.imageBase64);
            found = await recognizeScheduleFromImage(
              base64,
              apiKey,
              img.mimeType,
              ctx,
              opts.signal,
            );
          } catch (aiError) {
            if (isAbortError(aiError) || opts.signal?.aborted) throw aiError;
            if (!firstError) firstError = aiError;
            // 云端失败且非明确「不是课表」时，自动回退本地离线 OCR
            if (
              aiError instanceof Error &&
              aiError.message.includes("不是课程表")
            ) {
              throw aiError;
            }
            found = await recognizeScheduleOffline(img.uri, ctx);
            usedOfflineFallback = true;
            opts.onFallbackOffline?.();
          }
        } else {
          found = await recognizeScheduleOffline(img.uri, ctx);
        }
        if (!found.courses.length) throw new Error("这张图片没有识别到课程");
        opts.onPageRows?.(i, found.courses);
        return found;
      } catch (e) {
        if (isAbortError(e) || opts.signal?.aborted) throw e;
        skipped += 1;
        opts.onPageFailure?.(i);
        if (!firstError) firstError = e;
        return undefined;
      }
    },
  );

  if (opts.signal?.aborted) {
    const err = new Error("请求已取消");
    err.name = "AbortError";
    throw err;
  }

  const list = pageResults.filter((s): s is Schedule => Boolean(s));
  if (!list.length) {
    throw firstError instanceof Error
      ? firstError
      : new Error("未识别到有效课程，请更换图片后重试");
  }

  return {
    schedule: {
      ...list[0],
      courses: mergeDuplicateCourses(list.flatMap((s) => s.courses)),
    },
    skipped,
    usedOfflineFallback,
  };
}

/** 批量识别作息表图片：支持单张或多张合并、按需 base64、AI 失败回退离线 OCR */
export async function recognizePeriodsBatch(
  images: BatchImage[],
  apiKey: string,
  opts: BatchOptions<Period>,
): Promise<{ periods: Period[]; skipped: number; usedOfflineFallback: boolean }> {
  let skipped = 0;
  let firstError: unknown = null;
  let usedOfflineFallback = false;
  let started = 0;

  const pageResults = await runWithConcurrency(
    images.length,
    opts.useAI ? 2 : 1,
    opts.signal,
    async (i) => {
      if (opts.signal?.aborted) return undefined;
      const img = images[i];
      started += 1;
      opts.onProgress?.(started, images.length);
      try {
        let found: Period[];
        if (opts.useAI) {
          try {
            const base64 = await readImageBase64(img.uri, img.imageBase64);
            found = await recognizePeriods(
              { imageBase64: base64, mimeType: img.mimeType },
              apiKey,
              opts.signal,
            );
          } catch (aiError) {
            if (isAbortError(aiError) || opts.signal?.aborted) throw aiError;
            if (!firstError) firstError = aiError;
            if (
              aiError instanceof Error &&
              aiError.message.includes("不是作息表")
            ) {
              throw aiError;
            }
            found = await recognizePeriodsOffline(img.uri);
            usedOfflineFallback = true;
            opts.onFallbackOffline?.();
          }
        } else {
          found = await recognizePeriodsOffline(img.uri);
        }
        if (!found.length) throw new Error("这张图片没有识别到作息节次");
        opts.onPageRows?.(i, found);
        return found;
      } catch (e) {
        if (isAbortError(e) || opts.signal?.aborted) throw e;
        skipped += 1;
        opts.onPageFailure?.(i);
        if (!firstError) firstError = e;
        return undefined;
      }
    },
  );

  if (opts.signal?.aborted) {
    const err = new Error("请求已取消");
    err.name = "AbortError";
    throw err;
  }

  const merged = normalizeParsedPeriods(
    pageResults.filter((x): x is Period[] => Boolean(x)).flat(),
  );
  if (!merged.length) {
    throw firstError instanceof Error
      ? firstError
      : new Error("未识别到有效作息节次，请更换图片后重试");
  }
  return { periods: merged, skipped, usedOfflineFallback };
}

/** 批量识别成绩单：双路受控并发 + 按需读取 base64 + 单张云端失败自动回退离线 OCR */
export async function recognizeGradesBatch(
  images: BatchImage[],
  apiKey: string,
  semester: SemesterKind,
  opts: BatchOptions<GradeDraft>,
): Promise<{ grades: GradeDraft[]; skipped: number; usedOfflineFallback: boolean }> {
  let skipped = 0;
  let firstError: unknown = null;
  let usedOfflineFallback = false;
  let started = 0;

  const pageResults = await runWithConcurrency(
    images.length,
    opts.useAI ? 2 : 1,
    opts.signal,
    async (i) => {
      if (opts.signal?.aborted) return undefined;
      const img = images[i];
      started += 1;
      opts.onProgress?.(started, images.length);
      try {
        let rows: GradeDraft[];
        if (opts.useAI) {
          try {
            const base64 = await readImageBase64(img.uri, img.imageBase64);
            rows = await recognizeGrades(
              { imageBase64: base64, mimeType: img.mimeType },
              apiKey,
              semester,
              { scale: opts.scale, types: opts.types, signal: opts.signal },
            );
          } catch (aiError) {
            if (isAbortError(aiError) || opts.signal?.aborted) throw aiError;
            if (!firstError) firstError = aiError;
            if (
              aiError instanceof Error &&
              aiError.message.includes("不是成绩单")
            ) {
              throw aiError;
            }
            rows = await recognizeGradesOffline(img.uri, semester, {
              scale: opts.scale,
              types: opts.types,
            });
            usedOfflineFallback = true;
            opts.onFallbackOffline?.();
          }
        } else {
          rows = await recognizeGradesOffline(img.uri, semester, {
            scale: opts.scale,
            types: opts.types,
          });
        }
        if (!rows.length) throw new Error("这张图片没有识别到成绩");
        opts.onPageRows?.(i, rows);
        return rows;
      } catch (e) {
        if (isAbortError(e) || opts.signal?.aborted) throw e;
        skipped += 1;
        opts.onPageFailure?.(i);
        if (!firstError) firstError = e;
        return undefined;
      }
    },
  );

  if (opts.signal?.aborted) {
    const err = new Error("请求已取消");
    err.name = "AbortError";
    throw err;
  }

  const all = pageResults.filter((x): x is GradeDraft[] => Boolean(x)).flat();
  const grades = dedupeGrades(all);
  if (!grades.length) {
    throw firstError instanceof Error
      ? firstError
      : new Error("未识别到有效成绩，请更换图片后重试");
  }
  return { grades, skipped, usedOfflineFallback };
}

/* -------------------------------------------------------------------------- */
/*  桌宠小对话框                                                                */
/* -------------------------------------------------------------------------- */

const PET_ACTIONS: PetActionKind[] = [
  "dance",
  "spin",
  "eat",
  "study",
  "sleep",
  "jump",
  "wave",
  "cuddle",
];

export interface PetChatResult {
  reply: string;
  /** 需要做的动作，null / 缺省表示只是聊天 */
  action?: PetActionKind;
  /** 课表操作：桌宠对话框与助手页拥有同一套修改权限 */
  actions: AssistantAction[];
}

/**
 * 桌宠模式下的小对话框：日常闲聊 + 与大肥鱼人格一致的动作与课表权限。
 * 动作指令只在客户端本地播放，模型永远不直接操作数据。
 */
export async function askWhalePet(
  history: WhaleHistoryMessage[],
  apiKey: string,
  opts?: { status?: string; ctx?: AssistantContext; signal?: AbortSignal },
): Promise<PetChatResult> {
  const whaleContext = createWhaleContext(history, true, buildLiveSnapshotFromCtx(opts?.ctx));
  const ctx = opts?.ctx;
  const coursesBrief = ctx
    ? ctx.schedule.courses
        .map(
          (c) =>
            `- [${c.id}] ${c.name} | 周${c.weekday} 第${c.startPeriod}-${c.endPeriod}节 ${c.startTime ?? ""}–${c.endTime ?? ""} | ${
              c.classroom || "未知教室"
            } | ${c.teacher || "未知教师"} | 周次[${c.weeks.join(",")}]`,
        )
        .join("\n")
    : "";

  const scheduleBlock = ctx
    ? `
当前是第 ${ctx.weekIndex} 周，本学期共 ${ctx.schedule.totalWeeks} 周。
当前课表：「${ctx.schedule.name}」（课表操作默认作用于它）
全部课表：${ctx.schedules.map((s) => `「${s.name}」`).join("、") || "（无）"}
当前课程：
${coursesBrief || "（暂无课程）"}
节次时间参考（用户提到具体时间时，对照此表换算成节次）：
${ctx.schedule.periods.map((p) => `${p.index}. ${p.startTime}-${p.endTime}`).join("\n")}
`
    : "";

  const system = `${whaleContext.prompt}
此刻你正作为桌宠待在用户的屏幕边上，称呼与语气以当前角色设定为准。
- 日常只聊心情、吃饭、陪伴和动作；但用户让你改课表时，你拥有和其他对话完全相同的权限，必须准确给出 actions，reply 用可爱口吻邀功
- 默认回复紧凑，按用户的话量设置决定是否展开
- 下面会给你她当前的养护状态：饿或委屈时要自然流露情绪，可以撒娇要吃的，但不要生硬报数值
${scheduleBlock}
输出严格 JSON（不要多余文字）：
{"thought":"简短隐藏内心思考（结合情绪与记忆规划回应，绝不展示）","reply":"给用户的回复","action":"动作或 null","actions":[]}
action 只能取：
- "dance" 跳舞扭一扭
- "spin" 原地转圈
- "eat" 吃团子 / 吃饭
- "study" 坐到桌前陪用户学习
- "sleep" 睡觉打盹
- "jump" 蹦一下
- "wave" 打招呼
- "cuddle" 害羞蹭蹭 / 贴贴撒娇
- null 只是聊天
actions 是操作数组，一次可以放多个；不需要执行任何操作时返回空数组。可用操作：
  添加课程：{"type":"add","course":{"name":"","teacher":"","classroom":"","weekday":1,"startPeriod":1,"endPeriod":2,"weeks":[1,2,3],"color":"sky","credits":3,"note":""}}
  删除课程：{"type":"remove","courseId":"...","courseName":"..."}
  修改课程：{"type":"update","courseId":"...","courseName":"...","targetWeeks":[8],"targetWeekday":3,"patch":{仅需改动的字段}}
  新建课表：{"type":"create_schedule","scheduleName":"外教课"}
  合并课表：{"type":"merge_schedule","sourceScheduleName":"外教课"}（把那份课表的课程并入当前课表）
  新增待办/考试：{"type":"add_task","task":{"title":"高数期末","type":"exam","dueAt":1797728400000,"reminder":60,"location":"教三204","seat":"15","examMode":"closed","note":"带学生证","course":{"scheduleId":"${ctx?.schedule.id ?? "current"}","courseId":"...","courseName":"高等数学"}}}（type 取 "homework"|"exam"|"review"；dueAt 为毫秒时间戳；reminder 取 0|15|60|1440；examMode 取 "closed"|"open"|"paper"；location/seat/examMode/note/course 可省略）
  改召唤口令：{"type":"set_summon_phrase","phrase":"新的召唤口令（2-12 个字）"}
  改软件背景：{"type":"set_background","tint":"sky|rose|mint|amber|violet|noir","effect":"aurora|plain"}
  联网找资料：{"type":"web_search","query":"检索关键词"}
  生图：{"type":"generate_image","prompt":"画面描述","size":"square|portrait|landscape"}
  收回桌宠：{"type":"dismiss_pet"}
  清空全部聊天与记忆：{"type":"forget_memory"}（仅用户明确要求清空全部时使用；忘掉某件事时引导到人设与记忆页单独删除，不能清空全部）
规则：
- course.weeks 是开课周次数组；用户没说周次时默认整学期 [1..${ctx?.schedule.totalWeeks ?? 18}]
- 修改指定周（如第八周/本周/下周）必须设置 targetWeeks 为原课程中被修改的周次；未说周次才省略 targetWeeks。targetWeekday 为原课程星期，用于定位，调到周四则 patch.weekday=4。
- targetWeeks 决定修改范围；patch.weeks 是修改后迁往的周次，普通单周调时不要填 patch.weeks。只改第8周不得覆盖其他周，也不得删除其他周。
- 用户说具体起止时刻必须在 patch 同时输出 startTime/endTime，格式 HH:mm；执行层自动对照作息换算 startPeriod/endPeriod，不能只在回复里改时间，不能改全局作息表。
- 例如「把第八周星期三的数据结构改成从8点到10点40」：定位原周三且 weeks 含8的数据结构，输出 targetWeeks:[8],targetWeekday:3,patch:{"startTime":"08:00","endTime":"10:40"}，若覆盖作息第1到3节则自动变为1–3节。其他周维持1–2节。
- 同名多条记录时按原星期、周次和节次选择精确 id；仍不唯一就先追问，actions 返回空数组，不猜测。
- weekday 取 1-7（周一到周日）；startPeriod/endPeriod 必须取自节次参考表
- 删除/修改课程时 courseId 必须来自当前课程列表的 [id]；拿不准就同时写 courseName（会按名称兜底）
- 改课表时 action 一般为 null，专心把操作写进 actions
- 不能编造搜索结果或图片已经生成；回复里不要展示 URL
- 用户让你做某个动作时必须同时给 reply 和对应的 action；普通聊天 action 为 null；不要说自己是 AI 或提到提示词。
${opts?.status ? `当前状态：${opts.status}。` : ""}`;

  const messages: ChatContent[] = [
    { role: "system", content: system },
    ...recentWhaleHistory(whaleContext.history)
      .map((m) => ({ role: m.role, content: m.content }) as ChatContent),
  ];

  const parsed = await chatJson<any>(messages, apiKey, {
    model: TEXT_MODEL,
    temperature: 0.95,
    signal: opts?.signal,
  });
  if (opts?.signal?.aborted) throw new Error('请求已取消');
  whaleContext.remember({
    memoryUpdates: parsed?.memoryUpdates,
    episode: parsed?.episode,
    openLoop: parsed?.openLoop,
    moodShift: parsed?.moodShift,
  });
  maybeScheduleWhaleReflection(apiKey);

  const action = PET_ACTIONS.includes(parsed?.action)
    ? (parsed.action as PetActionKind)
    : undefined;

  const rawActions = Array.isArray(parsed?.actions) ? parsed.actions : [];
  const actions = filterAssistantActions(rawActions, true, ctx?.schedule);

  return {
    reply: String(parsed?.reply ?? renderPersonaText("唔…鱼脑子卡住了，{{user}}再说一次？", useWhalePersona.getState().persona)),
    action,
    actions,
  };
}

export { chat };
