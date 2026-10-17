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
  GpaRule,
  GradeRecord,
  Period,
  Schedule,
  ScheduleAction,
} from "@/types";

const COLOR_VALUES: CourseColor[] = [
  "sky",
  "violet",
  "emerald",
  "amber",
  "rose",
  "cyan",
];

const SCHEDULE_SCHEMA_HINT = `请把识别到的课表输出为严格的 JSON（不要多余文字），结构如下：
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
      "weeks": [1,2,3],      // 上课周次列表
      "credits": 3,          // 学分，未知则 null
      "color": "sky"         // 从 sky/violet/emerald/amber/rose/cyan 中选择
    }
  ]
}
若无法确定 startDate，使用 null。`;

function normalizeCourses(raw: any): Course[] {
  if (!Array.isArray(raw)) return [];
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
      const weeks: number[] = Array.isArray(c?.weeks)
        ? c.weeks
            .map(Number)
            .filter((n: number) => Number.isFinite(n) && n >= 1)
        : Array.from({ length: 18 }, (_, k) => k + 1);
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
        weeks: weeks.length
          ? weeks
          : Array.from({ length: 18 }, (_, k) => k + 1),
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
          text: `请识别这张课程表图片中的全部课程。\n${SCHEDULE_SCHEMA_HINT}`,
        },
        imagePart(base64, mimeType),
      ],
    },
  ];

  const parsed = await chatJson<any>(messages, apiKey, {
    model: VISION_MODEL,
    temperature: 0.1,
  });

  return buildSchedule(parsed);
}

/** 把模型解析结果组装成 Schedule（含学期类型与总周数） */
function buildSchedule(parsed: any): Schedule {
  const courses = normalizeCourses(parsed?.courses);
  const startDate =
    typeof parsed?.startDate === "string" &&
    /^\d{4}-\d{2}-\d{2}$/.test(parsed.startDate)
      ? parsed.startDate
      : nextMonday();
  const sem = resolveSemester(new Date(`${startDate}T00:00:00`));
  return {
    // 导入预览的占位 id：真正导入时保留当前课表的 id 与用户命名
    id: "import-preview",
    name: String(parsed?.name ?? sem.name),
    kind: sem.kind,
    startDate,
    endDate: toIsoDate(
      addDays(parseIsoDate(startDate), sem.totalWeeks * 7 - 1),
    ),
    totalWeeks: sem.totalWeeks,
    periods: DEFAULT_PERIODS,
    courses,
  };
}

/** 从文本/表格内容识别课程 */
export async function recognizeScheduleFromText(
  text: string,
  apiKey: string,
): Promise<Schedule> {
  const messages: ChatContent[] = [
    { role: "system", content: "你是一个精准的中文课程表解析助手。" },
    {
      role: "user",
      content: `请把以下课表文本（可能是 CSV / JSON / 复制粘贴的表格）解析为课程。\n${SCHEDULE_SCHEMA_HINT}\n\n课表内容：\n${text.slice(0, 12000)}`,
    },
  ];
  const parsed = await chatJson<any>(messages, apiKey, {
    model: TEXT_MODEL,
    temperature: 0.1,
  });
  return buildSchedule(parsed);
}

/** 从作息表图片/文本识别节次时间 */
export async function recognizePeriods(
  source: { imageBase64?: string; text?: string },
  apiKey: string,
): Promise<Period[]> {
  const parts: ChatContent["content"] = [];
  const text = `请识别作息表中的节次与起止时间。输出严格 JSON：{"periods":[{"index":1,"label":"第1节","startTime":"08:00","endTime":"08:45"}]}，时间用 24 小时制 HH:mm。${
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
  return periods.length ? periods : DEFAULT_PERIODS;
}

/** 从成绩换算规则（文本/图片）解析绩点档位 */
export async function recognizeGpaRules(
  source: { imageBase64?: string; text?: string },
  apiKey: string,
): Promise<GpaRule[]> {
  const instruction = `请解析绩点/成绩换算规则。输出严格 JSON：
{
  "rules": [
    {
      "name": "规则名称，如 保研绩点",
      "formula": "weighted",      // weighted=学分加权，simple=简单平均
      "description": "简述",
      "bands": [
        {"grade":"A","minScore":90,"maxScore":100,"gpa":4.0}
      ]
    }
  ]
}
若无法确定 gpa 数值，用 null 并在 description 说明。${
    source.text ? `\n规则内容：\n${source.text.slice(0, 10000)}` : ""
  }`;

  const parts: ChatContent["content"] = [];
  if (source.imageBase64) {
    parts.push(
      { type: "text", text: instruction },
      imagePart(source.imageBase64),
    );
  } else {
    parts.push({ type: "text", text: instruction });
  }

  const parsed = await chatJson<any>(
    [{ role: "user", content: parts }],
    apiKey,
    { model: source.imageBase64 ? VISION_MODEL : TEXT_MODEL, temperature: 0.1 },
  );

  const raw = Array.isArray(parsed?.rules)
    ? parsed.rules
    : Array.isArray(parsed)
      ? parsed
      : [];
  return raw
    .map((r: any): GpaRule | null => {
      const bands = Array.isArray(r?.bands)
        ? r.bands
            .map((b: any) => ({
              grade: String(b?.grade ?? ""),
              minScore: Number(b?.minScore),
              maxScore: Number(b?.maxScore),
              gpa: Number(b?.gpa),
            }))
            .filter(
              (b: any) => Number.isFinite(b.minScore) && Number.isFinite(b.gpa),
            )
        : [];
      if (!bands.length) return null;
      return {
        id: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
        name: String(r?.name ?? "导入规则"),
        formula: r?.formula === "simple" ? "simple" : "weighted",
        description: String(r?.description ?? ""),
        bands,
      };
    })
    .filter((r: GpaRule | null): r is GpaRule => r !== null);
}

/** 从成绩单（图片/文本）解析成绩记录 */
export async function recognizeGrades(
  source: { imageBase64?: string; text?: string; mimeType?: string },
  apiKey: string,
): Promise<GradeRecord[]> {
  const instruction = `请识别成绩单/成绩截图中的全部课程成绩。输出严格 JSON：
{
  "grades": [
    {
      "name": "课程名",
      "credit": 3,          // 学分
      "score": 87,          // 百分制分数，若只有等级制则 null
      "grade": "A",         // 等级制成绩，百分制则 null
      "semester": "2026秋",  // 学期，未知则 null
      "type": "required"    // required=必修 / elective=选修 / other=其他
    }
  ]
}
注意：
- 只输出 JSON，不要多余文字
- 每门课一条记录，重复课程保留学分最高的或都保留
- 学分/分数必须是数字，无法确定用 null${
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
    },
  );

  const raw = Array.isArray(parsed?.grades)
    ? parsed.grades
    : Array.isArray(parsed)
      ? parsed
      : [];

  return raw
    .map((g: any): GradeRecord | null => {
      const name = String(g?.name ?? "").trim();
      if (!name) return null;
      const credit = Number(g?.credit);
      if (!Number.isFinite(credit) || credit <= 0) return null;

      const scoreRaw = g?.score;
      const score =
        scoreRaw != null && Number.isFinite(Number(scoreRaw))
          ? Math.max(0, Math.min(100, Number(scoreRaw)))
          : null;
      const grade = g?.grade != null ? String(g.grade).trim() : null;
      if (score == null && !grade) return null;

      const type: GradeRecord["type"] =
        g?.type === "elective"
          ? "elective"
          : g?.type === "other"
            ? "other"
            : "required";
      return {
        id: "",
        name,
        credit,
        score,
        grade: grade || null,
        semester: String(g?.semester ?? ""),
        type,
        includedInGpa: true,
      };
    })
    .filter((g: GradeRecord | null): g is GradeRecord => g !== null);
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
