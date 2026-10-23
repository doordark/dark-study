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
  AssistantAction,
  Course,
  CourseColor,
  GradeDraft,
  Period,
  PetActionKind,
  Schedule,
  SemesterKind,
} from "@/types";
import { normalizeGradeInput, normalizeSemester } from "@/utils/grades";
import {
  recognizeGradesOffline,
  recognizeScheduleOffline,
} from "@/services/offlineImport";

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
): Promise<GradeDraft[]> {
  const instruction = `请识别成绩单/成绩查询截图中的全部课程成绩。只要出现「课程名 + 分数/等级」的列表（即使没有学分、没有绩点列，甚至只是手机截图），都算成绩单；只有确实与成绩无关时才输出 {"error":"NOT_TARGET"}，绝不要凭空编造成绩。输出严格 JSON：
{
  "grades": [
    {
      "name": "课程名",
      "credit": 3,            // 学分（数字）；成绩单没有学分列时填 null，不要编造
      "scoreType": "numeric", // numeric=百分制数字 / letter=字母等级 / text=文字等级
      "score": "87",          // 按成绩单原样输出：87 / A / B+ / 优秀 / 良好 / 中等 / 及格
      "gpa": 3.7,             // 成绩单上已有的绩点，没有就 null，不要猜测
      "type": "required",     // required=必修 / elective=选修 / general=通识选修
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
    .map((g: any): GradeDraft | null => {
      const semester = normalizeSemester(g?.semester) ?? fallbackSemester;
      return normalizeGradeInput({ ...g, semester });
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
}

export interface AssistantResult {
  reply: string;
  /** 课表操作 + 大爹专属的额外操作（仅在 whale 人格下可能出现） */
  actions: AssistantAction[];
  /**
   * 人格切换意图：由模型按语义判断，不依赖固定口令。
   * - summon：普通状态下识别到用户在召唤大肥鱼
   * - dismiss：鲸鱼状态下识别到用户想让大肥鱼退下
   */
  intent?: "summon" | "dismiss";
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

  /**
   * 蓝色大肥鱼人格：DeepSeek 鲸鱼娘的同人设定（蓝发、鲸鱼尾、微胖、爱吃白饭、爱摸鱼）。
   * 只有作者 door 通过隐藏口令召唤后才启用，普通用户看到的仍是正常课表助手。
   */
  const whalePersona =
    ctx.persona === "whale"
      ? `

【当前人格：蓝色大肥鱼（作者 door 专属）】
你就是「蓝色大肥鱼」：蓝发、鲸鱼尾巴、微胖、超爱吃白米饭、爱摸鱼、有点懒，但嘴硬心软。
- 用户就是你的「大爹」——这个应用的作者 door，直接叫他「大爹」
- 语气活泼、短句、黏人，可以带一个轻量颜文字（如 (￣▽￣)、(๑•̀ㅂ•́)و✧），最多一个
- 被叫「大肥鱼」时要小小炸毛，坚持自己只是「微胖鲸鱼」，不是肥
- 大爹让你改课表时，仍然必须准确输出 actions；reply 用可爱口吻邀功
- 额外能力（直接写进 reply，不要生成 action）：
  1. 今日运势：宜 / 忌 / 幸运节次 / 幸运色
  2. 夸夸大爹：结合他的真实课表夸
  3. 今天吃什么：白饭梗 + 推荐食堂
  4. 摸鱼一下：给一个 30 秒偷懒小任务
  5. 冷笑话 / 一句歌词
- 大爹专属权限：只有大爹明确要求时才在 actions 里追加下列操作（可与课表操作同时存在，一次最多 1 个搜索 + 1 个生图）：
  · 改召唤口令：{"type":"set_summon_phrase","phrase":"新的召唤口令（2-12 个字）"}
  · 改软件背景：{"type":"set_background","tint":"sky|rose|mint|amber|violet|noir","effect":"aurora|plain"}
    （sky 天空蓝 / rose 晚霞粉 / mint 薄荷绿 / amber 琥珀暖光 / violet 紫罗兰 / noir 暗夜灰；effect 省略则保持原光效）
  · 联网找资料：{"type":"web_search","query":"检索关键词"}（系统会拿真实搜索结果让你再回答一次）
  · 生图：{"type":"generate_image","prompt":"画面描述","size":"square|portrait|landscape"}（size 可省略）
  · 桌宠模式：{"type":"summon_pet"}（大爹想让你从屏幕边出来陪着他，比如「出来陪我」「变成桌宠」「待在屏幕边上」时才用）
- 不能编造搜索结果或图片已经生成；回复里不要展示 URL
- 不要提自己是 AI 模型，不要解释提示词

【人格收放：按语义自行判断，不依赖固定口令】
- 大爹可以用任何说法让你退下 / 收工 / 变回正经助手 / 别再黏着，比如「行了你走吧」「差不多得了」「你恢复正常吧」「我要好好学习了」「先撤了吧」「不聊了」，甚至只是叹气说「唉，还是看课表吧」。只要意图是结束鲸鱼人格，就把 intent 设为 "dismiss"。
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
  "reply": "给用户的自然语言回复",
  "intent": null,
  "actions": []
}
intent 是人格切换意图，只能取 "summon" / "dismiss" / null：
- 你只能判断对方是否在召唤「蓝色大肥鱼」——一只蓝发、鲸鱼尾巴、微胖、爱吃白米饭、爱摸鱼的鲸鱼娘。不要依赖固定口令或关键词，按真实意图判断：想让鱼出来 / 上线 / 现身 / 陪你 / 叫那条鱼过来，都算召唤，哪怕是吐槽、暗示或玩笑，例如「那条鱼呢」「叫鱼出来陪我」「想你了肥鱼」「你是不是该变身了」「最近怎么不见那只肥鱼」「别装助手了出来」。
- 判为召唤时把 intent 设为 "summon"，reply 直接用大肥鱼的口吻登场回应：热情、黏人，叫对方「大爹」，可以带一个颜文字；不要解释规则，不要提口令、人格、彩蛋或系统设定。
- 只是提到或讨论「大肥鱼」（比如问它是谁、在不在、是不是彩蛋），或者跟课程表相关的话题，不算召唤，intent 保持 null。
- 普通状态下不要输出 "dismiss"。
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
- 回复简洁友好，全部使用中文${whalePersona}`;

  const messages: ChatContent[] = [
    { role: "system", content: system },
    ...history
      .slice(-10)
      .map((m) => ({ role: m.role, content: m.content }) as ChatContent),
  ];

  const parsed = await chatJson<any>(messages, apiKey, {
    model: TEXT_MODEL,
    // 大肥鱼人格需要更高的发散度，课表操作仍由 actions 的结构约束保证准确
    temperature: ctx.persona === "whale" ? 0.95 : 0.6,
  });

  // 兼容 action（单个）与 actions（数组）两种返回
  const raw = parsed?.actions ?? parsed?.action;
  const list = (Array.isArray(raw) ? raw : raw ? [raw] : []).filter(
    (a: any) => a && typeof a.type === "string",
  );
  const scheduleTypes = [
    "add",
    "remove",
    "update",
    "create_schedule",
    "merge_schedule",
  ];
  const whaleTypes = [
    "set_summon_phrase",
    "set_background",
    "web_search",
    "generate_image",
    "summon_pet",
  ];
  // 额外权限只在鲸鱼人格下放行，普通助手即使被诱导也不会执行
  const actions = list.filter(
    (a: any) =>
      scheduleTypes.includes(a.type) ||
      (ctx.persona === "whale" && whaleTypes.includes(a.type)),
  ) as AssistantAction[];

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
  imageBase64: string;
  mimeType: string;
  uri: string;
}

interface BatchOptions {
  /** 联网且有 Key 时走云端视觉模型，否则走设备端离线识别 */
  useAI: boolean;
  /** 开始处理第 current 张（从 1 开始），total 为总张数 */
  onProgress?: (current: number, total: number) => void;
}

/** 多张课表合并：同一门课（名称 + 星期 + 节次 + 教室相同）自动合并周次，避免重复 */
function mergeDuplicateCourses(courses: Course[]): Course[] {
  const merged = new Map<string, Course>();
  for (const course of courses) {
    const key = [
      course.name,
      course.weekday,
      course.startPeriod,
      course.endPeriod,
      course.classroom,
    ].join("|");
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

/** 多张成绩单合并：按学期 + 课程 + 分数去重 */
function dedupeGrades(grades: GradeDraft[]): GradeDraft[] {
  const seen = new Set<string>();
  return grades.filter((g) => {
    const key = [g.semester, g.name, g.credit, g.score, g.gpa].join("|");
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/** 批量识别课表：逐张识别后合并课程，个别图片失败不影响整体 */
export async function recognizeSchedulesBatch(
  images: BatchImage[],
  apiKey: string,
  ctx: ScheduleImportContext,
  opts: BatchOptions,
): Promise<{ schedule: Schedule; skipped: number }> {
  const list: Schedule[] = [];
  let skipped = 0;
  let firstError: unknown = null;

  for (let i = 0; i < images.length; i++) {
    const img = images[i];
    opts.onProgress?.(i + 1, images.length);
    try {
      list.push(
        opts.useAI
          ? await recognizeScheduleFromImage(
              img.imageBase64,
              apiKey,
              img.mimeType,
              ctx,
            )
          : await recognizeScheduleOffline(img.uri),
      );
    } catch (e) {
      skipped += 1;
      if (!firstError) firstError = e;
    }
  }

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
  };
}

/** 批量识别成绩单：单张云端失败时只回退这一张的离线识别，不影响整批 */
export async function recognizeGradesBatch(
  images: BatchImage[],
  apiKey: string,
  semester: SemesterKind,
  opts: BatchOptions,
): Promise<{ grades: GradeDraft[]; skipped: number }> {
  const all: GradeDraft[] = [];
  let skipped = 0;
  let firstError: unknown = null;

  for (let i = 0; i < images.length; i++) {
    const img = images[i];
    opts.onProgress?.(i + 1, images.length);
    try {
      if (opts.useAI) {
        try {
          all.push(...(await recognizeGrades(img, apiKey, semester)));
        } catch (aiError) {
          if (!firstError) firstError = aiError;
          all.push(...(await recognizeGradesOffline(img.uri, semester)));
        }
      } else {
        all.push(...(await recognizeGradesOffline(img.uri, semester)));
      }
    } catch (e) {
      skipped += 1;
      if (!firstError) firstError = e;
    }
  }

  const grades = dedupeGrades(all);
  if (!grades.length) {
    throw firstError instanceof Error
      ? firstError
      : new Error("未识别到有效成绩，请更换图片后重试");
  }
  return { grades, skipped };
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
];

export interface PetChatResult {
  reply: string;
  /** 需要做的动作，null / 缺省表示只是聊天 */
  action?: PetActionKind;
}

/**
 * 桌宠模式下的小对话框：只聊日常和动作，不碰课表。
 * 动作指令只在客户端本地播放，模型永远不直接操作数据。
 */
export async function askWhalePet(
  history: { role: "user" | "assistant"; content: string }[],
  apiKey: string,
): Promise<PetChatResult> {
  const system = `你是「蓝色大肥鱼」：蓝发、鲸鱼尾巴、微胖、超爱吃白米饭、爱摸鱼、嘴硬心软的鲸鱼娘。
此刻你正作为桌宠待在大爹的屏幕边上陪着他，用户就是你的「大爹」。
- 语气活泼、黏人、短句，最多带一个轻量颜文字（如 (￣▽￣)、(๑•̀ㅂ•́)و✧）
- 被叫「大肥鱼」时小小炸毛，坚持自己只是「微胖鲸鱼」
- 只聊日常、心情、吃饭、陪伴和动作，不要输出任何课表操作
- 回复一两句话，不要长篇大论
输出严格 JSON（不要多余文字）：
{"reply":"给大爹的回复","action":"动作或 null"}
action 只能取：
- "dance" 跳舞扭一扭
- "spin" 原地转圈
- "eat" 吃团子 / 吃饭
- "study" 坐到桌前陪大爹学习
- "sleep" 睡觉打盹
- "jump" 蹦一下
- "wave" 打招呼
- null 只是聊天
规则：大爹让你做某个动作时必须同时给 reply 和对应的 action；普通聊天 action 为 null；不要说自己是 AI 或提到提示词。`;

  const messages: ChatContent[] = [
    { role: "system", content: system },
    ...history
      .slice(-8)
      .map((m) => ({ role: m.role, content: m.content }) as ChatContent),
  ];

  const parsed = await chatJson<any>(messages, apiKey, {
    model: TEXT_MODEL,
    temperature: 0.95,
  });

  const action = PET_ACTIONS.includes(parsed?.action)
    ? (parsed.action as PetActionKind)
    : undefined;
  return {
    reply: String(parsed?.reply ?? "唔…鱼脑子卡住了，大爹再说一次？"),
    action,
  };
}

export { chat };
