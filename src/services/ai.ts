import {
  chat,
  chatJson,
  imagePart,
  TEXT_MODEL,
  VISION_MODEL,
  type ChatContent,
} from "@/services/deepseek";
import { DEFAULT_PERIODS } from "@/constants/sample";
import {
  resolveSemester,
  addDays,
  parseIsoDate,
  toIsoDate,
} from "@/utils/time";
import type {
  Course,
  CourseColor,
  GradeRecord,
  Period,
  Schedule,
  ScheduleAction,
  SemesterKind,
} from "@/types";
import { normalizeGradeInput, normalizeSemester } from "@/utils/grades";

const COLOR_VALUES: CourseColor[] = [
  "sky",
  "violet",
  "emerald",
  "amber",
  "rose",
  "cyan",
];

/** 导入上下文：课表开学日期 / 总周数，用于把图片里的具体日期换算成周次 */
export interface ScheduleImportContext {
  /** 目标课表第一周的周一（yyyy-MM-dd） */
  startDate?: string;
  /** 目标课表总周数 */
  totalWeeks?: number;
  /** 今天（yyyy-MM-dd） */
  today?: string;
}

const scheduleSchemaHint = (ctx?: ScheduleImportContext) => {
  const totalWeeks = ctx?.totalWeeks ?? 18;
  const semester =
    ctx?.startDate && ctx?.totalWeeks
      ? `学期信息：第 1 周的周一是 ${ctx.startDate}，本学期共 ${ctx.totalWeeks} 周${
          ctx.today ? `，今天是 ${ctx.today}` : ""
        }。`
      : `学期信息：本学期共 ${totalWeeks} 周。`;
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
${semester}
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
    const w = Math.round(n);
    if (w >= 1 && w <= totalWeeks) out.push(w);
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
    // 去掉「第 / 周 / 到 / 空白」，再按分隔符拆成区间
    const norm = v.replace(/[第周\s]/g, "");
    for (const part of norm.split(/[,，、;；]/)) {
      const m = part.match(/^(\d+)(?:[-~至](\d+))?$/);
      if (!m) continue;
      const a = Number(m[1]);
      const b = m[2] ? Number(m[2]) : a;
      for (let w = Math.min(a, b); w <= Math.max(a, b); w++) push(w);
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
    const t = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])).getTime();
    if (Number.isNaN(t)) continue;
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
      if (!weekday || weekday < 1 || weekday > 7) return null;
      const s = Number.isFinite(start) ? Math.max(1, start) : 1;
      const e = Number.isFinite(end) ? Math.max(s, end) : s;
      // 优先用具体日期换算周次（最精确）；否则用 weeks，最后才默认整学期
      const fromDates = weeksFromDates(c?.dates, ctx?.startDate, totalWeeks);
      const fromWeeks = parseWeeksValue(c?.weeks, totalWeeks);
      const weeks = fromDates.length
        ? fromDates
        : fromWeeks.length
          ? fromWeeks
          : allWeeks;
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
        credits: Number.isFinite(Number(c?.credits))
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
  });
  ensureTarget(parsed, "这张图片不是课程表，请更换正确的图片后重试");

  return buildSchedule(parsed, ctx);
}

/** 把模型解析结果组装成 Schedule（含学期类型与总周数） */
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
    periods: DEFAULT_PERIODS,
    courses,
  };
}

/** 从文本/表格内容识别课程 */
export async function recognizeScheduleFromText(
  text: string,
  apiKey: string,
  ctx?: ScheduleImportContext,
): Promise<Schedule> {
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
  });
  ensureTarget(parsed, "该文档不是课程表，请更换正确的文件后重试");
  return buildSchedule(parsed, ctx);
}

/** 从作息表图片/文本识别节次时间 */
export async function recognizePeriods(
  source: { imageBase64?: string; text?: string },
  apiKey: string,
): Promise<Period[]> {
  const parts: ChatContent["content"] = [];
  const text = `请识别作息表中的节次与起止时间。先判断输入是否确实是作息表（上下课时间表）；若不是，输出 {"error":"NOT_TARGET"}，绝不要凭空编造时间。输出严格 JSON：{"periods":[{"index":1,"label":"第1节","startTime":"08:00","endTime":"08:45"}]}，时间用 24 小时制 HH:mm。${
    source.text ? `\n作息内容：\n${source.text.slice(0, 8000)}` : ""
  }`;
  if (source.imageBase64) {
    parts.push({ type: "text", text }, imagePart(source.imageBase64));
  } else {
    parts.push({ type: "text", text });
  }

  const parsed = await chatJson<any>(
    [{ role: "user", content: parts }],
    apiKey,
    { model: source.imageBase64 ? VISION_MODEL : TEXT_MODEL, temperature: 0.1 },
  );
  ensureTarget(
    parsed,
    source.imageBase64
      ? "这张图片不是作息表，请更换正确的作息表（上下课时间表）后重试"
      : "该文档不是作息表，请更换正确的作息表（上下课时间表）后重试",
  );

  const periods = Array.isArray(parsed?.periods)
    ? parsed.periods
        .map(
          (p: any, i: number): Period => ({
            index: Number(p?.index) || i + 1,
            label: String(p?.label ?? `第${Number(p?.index) || i + 1}节`),
            startTime: String(p?.startTime ?? ""),
            endTime: String(p?.endTime ?? ""),
          }),
        )
        .filter(
          (p: Period) =>
            /^\d{1,2}:\d{2}$/.test(p.startTime) &&
            /^\d{1,2}:\d{2}$/.test(p.endTime),
        )
        .map((p: Period, i: number) => ({ ...p, index: i + 1 }))
    : [];
  // 不兜底默认作息：识别不出就明确失败，绝不凭空编造时间
  return periods;
}

/** 从成绩单（图片/文本）解析成绩记录：分数、绩点、课程类型与学期 */
export async function recognizeGrades(
  source: { imageBase64?: string; text?: string; mimeType?: string },
  apiKey: string,
  fallbackSemester: SemesterKind = "fall",
): Promise<Omit<GradeRecord, "id">[]> {
  const instruction = `请识别成绩单/成绩截图中的全部课程成绩。先判断输入是否确实是成绩单；若不是，输出 {"error":"NOT_TARGET"}，绝不要凭空编造成绩。输出严格 JSON：
{
  "grades": [
    {
      "name": "课程名",
      "credit": 3,            // 学分（数字）
      "scoreType": "numeric", // numeric=百分制数字 / letter=字母等级 / text=文字等级
      "score": "87",          // 按成绩单原样输出：87 / A / B+ / 优秀 / 良好
      "gpa": 3.7,             // 成绩单上已有的绩点，没有就 null，不要猜测
      "type": "required",     // required=必修 / elective=选修 / general=通识选修
      "semester": "fall"      // fall=上学期(秋) / spring=下学期(春) / summer=短学期，无法判断用 null
    }
  ]
}
注意：
- 只输出 JSON，不要多余文字
- 每门课一条记录；姓名、学号、总绩点、平均分等非课程行不要输出
- score 必须保留成绩单上的原始写法（数字 / 字母 / 文字），不要擅自换算成百分制
- gpa 只填成绩单上明确标注的数值（0-5），没有则填 null${
    source.text ? `\n成绩单内容：\n${source.text.slice(0, 10000)}` : ""
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
    .map((g: any): Omit<GradeRecord, "id"> | null => {
      const semester = normalizeSemester(g?.semester) ?? fallbackSemester;
      return normalizeGradeInput({ ...g, semester });
    })
    .filter((g): g is Omit<GradeRecord, "id"> => g !== null);
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
}

export interface AssistantResult {
  reply: string;
  actions: ScheduleAction[];
}

/** 自然语言改课表：模型返回对话文本 + 可一键应用的操作（支持批量） */
export async function askAssistant(
  history: { role: "user" | "assistant"; content: string }[],
  ctx: AssistantContext,
  apiKey: string,
): Promise<AssistantResult> {
  const coursesBrief = ctx.schedule.courses
    .map(
      (c) =>
        `- [${c.id}] ${c.name} | 周${c.weekday} 第${c.startPeriod}-${c.endPeriod}节 | ${
          c.classroom || "未知教室"
        } | ${c.teacher || "未知教师"} | 周次[${c.weeks.join(",")}]`,
    )
    .join("\n");

  const system = `你是「课程表专属助手」，帮用户用自然语言调整和优化课表。当前是第 ${ctx.weekIndex} 周，本学期共 ${ctx.schedule.totalWeeks} 周。
当前课表：「${ctx.schedule.name}」（所有操作默认作用于它）
全部课表：${ctx.schedules.map((s) => `「${s.name}」`).join("、") || "（无）"}
当前课程：
${coursesBrief || "（暂无课程）"}
节次时间参考（用户提到具体时间时，对照此表换算成节次）：
${ctx.schedule.periods.map((p) => `${p.index}. ${p.startTime}-${p.endTime}`).join("\n")}

你需要回复一个严格 JSON（不要带注释或多余文本）：
{
  "reply": "给用户的自然语言回复",
  "actions": []
}
actions 是操作数组，一次可以放多个（用户一句话提出多件事时全部放进去）；不需要改课表时返回空数组。可用操作：
  添加课程：{"type":"add","course":{"name":"","teacher":"","classroom":"","weekday":1,"startPeriod":1,"endPeriod":2,"weeks":[1,2,3],"color":"sky","credits":3,"note":""}}
  删除课程：{"type":"remove","courseId":"...","courseName":"..."}
  修改课程：{"type":"update","courseId":"...","courseName":"...","patch":{仅需改动的字段}}
  新建课表：{"type":"create_schedule","scheduleName":"外教课"}
  合并课表：{"type":"merge_schedule","sourceScheduleName":"外教课"}（把那份课表的课程并入当前课表）

规则：
- course.weeks 是开课周次数组；用户没说周次时默认整学期 [1..${ctx.schedule.totalWeeks}]
- weekday 取 1-7（周一到周日）；startPeriod/endPeriod 必须取自节次参考表
- 删除/修改课程时 courseId 必须来自当前课程列表的 [id]；拿不准就同时写 courseName（会按名称兜底）
- 合并/新建课表时 scheduleName 必须来自全部课表列表（新建除外，名称由用户指定）
- 回复简洁友好，全部使用中文`;

  const messages: ChatContent[] = [
    { role: "system", content: system },
    ...history
      .slice(-10)
      .map((m) => ({ role: m.role, content: m.content }) as ChatContent),
  ];

  const parsed = await chatJson<any>(messages, apiKey, {
    model: TEXT_MODEL,
    temperature: 0.6,
  });

  // 兼容 action（单个）与 actions（数组）两种返回
  const raw = parsed?.actions ?? parsed?.action;
  const actions = (Array.isArray(raw) ? raw : raw ? [raw] : []).filter(
    (a: any) => a && typeof a.type === "string",
  ) as ScheduleAction[];

  return {
    reply: String(parsed?.reply ?? "我暂时没能理解，可以换个说法吗？"),
    actions,
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

export { chat };
