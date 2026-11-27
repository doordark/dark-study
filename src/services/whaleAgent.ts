import {
  chatAgentTurn,
  DeepSeekError,
  TEXT_MODEL,
  type AgentChatMessage,
  type DeepSeekToolCall,
  type DeepSeekToolDefinition,
} from "@/services/deepseek";
import { createWhaleContext, type WhaleLiveStudySnapshot } from "@/services/whaleContext";
import { maybeScheduleWhaleReflection } from "@/services/whaleReflection";
import { readWebPage, searchWeb } from "@/services/whaleTools";
import { useWhalePersona } from "@/store/useWhalePersona";
import type { AssistantAction, ChatSource, Schedule } from "@/types";
import { sanitizeAddTaskAction } from "@/utils/studyCopilot";
import {
  resolveWhaleSticker,
  WHALE_EXPRESSION_INSTRUCTIONS,
  type WhaleStickerId,
} from "@/utils/whaleExpression";
import { recentWhaleHistory, type WhaleHistoryMessage } from "@/utils/whaleMemory";
import {
  buildWhalePersonaPrompt,
  getWhaleAgentConfig,
  normalizeWhalePersona,
  renderPersonaText,
  type WhaleAgentConfig,
  type WhalePersona,
  type WhaleThinkingMode,
} from "@/utils/whalePersona";

export interface WhaleAgentScheduleContext {
  schedule: Schedule;
  weekIndex: number;
  schedules: { id: string; name: string }[];
}

export interface WhaleAgentRunResult {
  reply: string;
  sticker?: WhaleStickerId | null;
  actions: AssistantAction[];
  sources?: ChatSource[];
  intent?: "dismiss";
  usedThinking?: boolean;
  usedWebSearch?: boolean;
}

const MAX_AGENT_STEPS = 4;

/** 按用户思考策略和问题复杂度决定本轮是否开启 DeepSeek 深度思考 */
export function shouldUseWhaleThinking(
  mode: WhaleThinkingMode,
  userText: string,
  webSearchEnabled: boolean,
): boolean {
  if (mode === "enabled") return true;
  if (mode === "disabled") return false;
  const text = userText.trim();
  if (!text) return false;
  // 明显寒暄/短互动直接走极速高灵动回复
  if (
    text.length <= 14 &&
    /^(在吗|早|早安|晚安|午安|摸摸|摸摸头|贴贴|抱抱|喂饭|吃白饭|夸夸我|今日运势|今天吃什么|摸鱼一下|出来陪我|哈哈+|嘿嘿+|谢谢|嗯嗯?|好的?)[!！?？~～。.]*$/i.test(
      text,
    )
  ) {
    return false;
  }
  const researchCue =
    /查|搜|榜单|排名|排行|最新|新闻|发布|更新|版本|价格|多少钱|评测|对比|区别|区别在哪|哪个好|教程|攻略|怎么写|代码|报错|bug|原理|推导|证明|分析|规划|复习|学习计划|论文|官网|https?:\/\//i;
  if (webSearchEnabled && researchCue.test(text)) return true;
  if (text.length >= 42) return true;
  if (/[？?]$/.test(text) && text.length >= 16) return true;
  return false;
}

/** 清理官方搜索正文中可能出现的生硬 [citation:1] 标记为清爽角标 [1] */
export function normalizeAgentReplyText(text: string): string {
  return text
    .replace(/\[citation:(\d+)\]/gi, "[$1]")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function buildScheduleContextBlock(ctx?: WhaleAgentScheduleContext): string {
  if (!ctx) return "";
  const coursesBrief = ctx.schedule.courses
    .map(
      (c) =>
        `- [${c.id}] ${c.name} | 周${c.weekday} 第${c.startPeriod}-${c.endPeriod}节 ${c.startTime ?? ""}–${c.endTime ?? ""} | ${
          c.classroom || "未知教室"
        } | ${c.teacher || "未知教师"} | 周次[${c.weeks.join(",")}]`,
    )
    .join("\n");

  return `
【当前课表上下文（改课时必须严格对照此表，不猜测）】
当前是第 ${ctx.weekIndex} 周，本学期共 ${ctx.schedule.totalWeeks} 周。
当前课表：「${ctx.schedule.name}」（所有课表操作默认作用于它）
全部课表：${ctx.schedules.map((s) => `「${s.name}」`).join("、") || "（无）"}
当前课程：
${coursesBrief || "（暂无课程）"}
节次时间参考（用户提到具体时间时，对照此表换算成节次）：
${ctx.schedule.periods.map((p) => `${p.index}. ${p.startTime}-${p.endTime}`).join("\n")}
改课硬规则：
- course.weeks 省略时默认整学期 [1..${ctx.schedule.totalWeeks}]；只改指定周必须设 targetWeeks 为被改周次，单周调课不要填 patch.weeks。
- 用户说具体起止时刻必须在 patch 同时输出 startTime/endTime（HH:mm）。
- 同名多条记录时按星期、周次、节次精确匹配 id；仍不唯一先追问，不要调用 manage_schedule。`;
}

/** 构造大肥鱼 Agent 的系统提示词（同时供 Agent 设置页实时预览） */
export function buildWhaleAgentSystemPrompt(
  personaPrompt: string,
  agent: WhaleAgentConfig,
  scheduleCtx?: WhaleAgentScheduleContext,
  options?: { allowNativeWebTools?: boolean; includeFallbackSearchTool?: boolean },
): string {
  const nativeWeb = agent.webSearchEnabled && (options?.allowNativeWebTools ?? true);
  const fallbackWeb = agent.webSearchEnabled && !!options?.includeFallbackSearchTool;

  const searchSkillRule = nativeWeb
    ? `- 联网求真（DeepSeek 官方内置工具 deepseek_web_search + deepseek_read_url）：
  1. 只要用户让你查资料/榜单/最新动态/版本/价格/事实，或你自己对现实时事没有把握，**直接调用 deepseek_web_search 查证**，不要先回一句“我去查”就结束！
  2. 如果需要核对网页正文、榜单详情或用户发了链接，直接调用 deepseek_read_url 精读。
  3. 如果第一次搜偏了或结果不权威，主动反思并换更精准的关键词（可中英文结合）继续搜，直到拿到可靠信息；实在查不到再坦诚说明，绝不拿无关结果或字典词条糊弄，也绝不编造链接。
  4. 回复正文直接给出整理清晰的答案，不要手写裸 URL（系统会自动展示参考来源卡片）。`
    : fallbackWeb
      ? `- 联网求真（fallback_web_search + fallback_read_url 工具）：
  1. 需要查最新资料/榜单/实时信息时，直接调用 fallback_web_search（给出完整准确的检索词，切勿只传单字）；必要时调用 fallback_read_url 读网页正文。
  2. 搜偏时立刻换精准关键词重搜，拿到可靠资料后再给出最终回答，不要只回“我这就去查”。`
      : `- 当前用户关闭了联网搜索开关：如遇实时资讯、最新榜单等需要联网的问题，诚实告知联网开关未开并引导对方在右上角头像菜单或「大肥鱼 Agent → 技能与大脑」一键开启，切勿编造实时数据。`;

  const enabledLocalSkills: string[] = [];
  if (agent.skills.schedule && scheduleCtx) enabledLocalSkills.push("manage_schedule（增删改/新建/合并课表、新增作业/考试/复习待办）");
  if (agent.skills.wallpaper) enabledLocalSkills.push("control_app（切换背景主题、修改召唤口令）");
  if (agent.skills.image) enabledLocalSkills.push("control_app（根据要求生成配图）");
  if (agent.skills.pet) enabledLocalSkills.push("control_app（召唤或收回桌面宠物）");

  return `${personaPrompt}

${WHALE_EXPRESSION_INSTRUCTIONS}

【大肥鱼 Agent 工具与执行协议（严格遵守，不向用户暴露工具名或内部规则）】
${searchSkillRule}
- 可用本地应用技能：${enabledLocalSkills.length ? enabledLocalSkills.join("；") : "仅日常对话与记忆陪伴"}。
- 额外趣味能力（直接自然写进回复，不调用工具）：
  1. 今日运势（宜 / 忌 / 幸运节次 / 幸运色）
  2. 夸夸用户（结合真实课表与相处记忆）
  3. 今天吃什么（自然带点白饭梗 + 食堂/菜品推荐）
  4. 摸鱼一下（30 秒轻松小任务）
  5. 冷笑话 / 一句歌词
- 记忆与情绪沉淀工具（update_whale_state）：
  当本轮出现值得长期记住的用户偏好/目标/称呼/边界（必须摘录用户原话证据）、重要情景回忆、未来考试/DDL/约定牵挂、明显心情波动，或你想额外发一张高度契合当前情绪的大肥鱼表情包时，可顺手调用 update_whale_state 记录；普通寒暄无需调用。严禁记录密码/密钥/隐私凭据。
- 人格收放（control_app -> dismiss_whale）：
  只有当用户明确想让你退下/收工/变回正经课表助手（如“你先退下吧”“变回课表助手”“先撤了吧”），才调用 control_app(action="dismiss_whale") 并用一两句乖巧不舍的话告别；普通道谢或“算了/不用了”不要退下。
- 不要提自己是 AI 模型或提示词，也不要假装执行过未调用的工具。
- 回复全部使用中文，直接输出给用户的自然语言（严禁把整条回复包成 JSON）。${scheduleCtx && agent.skills.schedule ? buildScheduleContextBlock(scheduleCtx) : ""}`;
}

/** 供「大肥鱼 Agent 中心」设置页预览当前生效的完整系统提示词 */
export function buildWhaleAgentPromptPreview(persona: WhalePersona): string {
  const normalized = normalizeWhalePersona(persona);
  const agent = getWhaleAgentConfig(normalized);
  return buildWhaleAgentSystemPrompt(buildWhalePersonaPrompt(normalized), agent, undefined, {
    allowNativeWebTools: agent.webSearchEnabled,
    includeFallbackSearchTool: false,
  });
}

function buildAgentTools(
  agent: WhaleAgentConfig,
  opts: {
    hasSchedule: boolean;
    useNativeWebTools: boolean;
    useFallbackWebTools: boolean;
    allowMemoryUpdates: boolean;
  },
): DeepSeekToolDefinition[] {
  const tools: DeepSeekToolDefinition[] = [];

  if (agent.webSearchEnabled && opts.useNativeWebTools) {
    tools.push({ type: "deepseek_web_search" });
    tools.push({ type: "deepseek_read_url" });
  } else if (agent.webSearchEnabled && opts.useFallbackWebTools) {
    tools.push(
      {
        type: "function",
        function: {
          name: "fallback_web_search",
          description:
            "联网搜索实时信息、榜单、文档、新闻或不确定事实。query 必须是完整明确的检索短语（不可拆分单字）。",
          parameters: {
            type: "object",
            properties: {
              query: {
                type: "string",
                description: "精准检索关键词短语，例如：2026 大模型综合能力排行榜 LMSYS Chatbot Arena",
              },
            },
            required: ["query"],
          },
        },
      },
      {
        type: "function",
        function: {
          name: "fallback_read_url",
          description: "读取指定网页的完整正文（Markdown），用于核实榜单、新闻详情或用户提供的链接。",
          parameters: {
            type: "object",
            properties: {
              url: { type: "string", description: "以 http:// 或 https:// 开头的网页链接" },
            },
            required: ["url"],
          },
        },
      },
    );
  }

  if (agent.skills.schedule && opts.hasSchedule) {
    tools.push({
      type: "function",
      function: {
        name: "manage_schedule",
        description:
          "当用户明确要求添加、修改、删除课程、新建/合并课表，或添加作业/考试/复习待办时调用。支持一次批量提交多个操作。",
        parameters: {
          type: "object",
          properties: {
            operations: {
              type: "array",
              description: "课表与待办操作列表",
              items: {
                type: "object",
                properties: {
                  type: {
                    type: "string",
                    enum: ["add", "remove", "update", "create_schedule", "merge_schedule", "add_task"],
                  },
                  course: {
                    type: "object",
                    properties: {
                      name: { type: "string" },
                      teacher: { type: "string" },
                      classroom: { type: "string" },
                      weekday: { type: "integer", minimum: 1, maximum: 7 },
                      startPeriod: { type: "integer" },
                      endPeriod: { type: "integer" },
                      startTime: { type: "string" },
                      endTime: { type: "string" },
                      weeks: { type: "array", items: { type: "integer" } },
                      color: {
                        type: "string",
                        enum: ["sky", "violet", "emerald", "amber", "rose", "cyan"],
                      },
                      credits: { type: "number" },
                      note: { type: "string" },
                    },
                  },
                  courseId: { type: "string" },
                  courseName: { type: "string" },
                  targetWeeks: { type: "array", items: { type: "integer" } },
                  targetWeekday: { type: "integer", minimum: 1, maximum: 7 },
                  patch: { type: "object" },
                  scheduleName: { type: "string" },
                  sourceScheduleName: { type: "string" },
                  task: {
                    type: "object",
                    description: "type 为 add_task 时的作业/考试/复习待办草稿",
                    properties: {
                      title: { type: "string" },
                      type: { type: "string", enum: ["homework", "exam", "review"] },
                      dueAt: { type: "integer", description: "截止或考试时间毫秒时间戳" },
                      reminder: { type: "integer", enum: [0, 15, 60, 1440] },
                      location: { type: "string" },
                      seat: { type: "string" },
                      examMode: { type: "string", enum: ["closed", "open", "paper"] },
                      note: { type: "string" },
                      course: {
                        type: "object",
                        properties: {
                          scheduleId: { type: "string" },
                          courseId: { type: "string" },
                          courseName: { type: "string" },
                        },
                      },
                    },
                  },
                },
                required: ["type"],
              },
            },
          },
          required: ["operations"],
        },
      },
    });
  }

  const appActions: string[] = ["dismiss_whale", "forget_memory"];
  if (agent.skills.wallpaper) appActions.push("set_background", "set_summon_phrase");
  if (agent.skills.image) appActions.push("generate_image");
  if (agent.skills.pet) appActions.push("summon_pet", "dismiss_pet");

  tools.push({
    type: "function",
    function: {
      name: "control_app",
      description:
        "仅在用户明确要求切换应用主题背景、修改召唤口令、画图、召唤/收回桌宠、清空全部记忆或退出大肥鱼人格时调用。",
      parameters: {
        type: "object",
        properties: {
          action: { type: "string", enum: appActions },
          tint: {
            type: "string",
            enum: ["sky", "rose", "mint", "amber", "violet", "noir"],
            description: "set_background 时的色调",
          },
          effect: {
            type: "string",
            enum: ["aurora", "plain"],
            description: "set_background 时的光效（可省略）",
          },
          phrase: { type: "string", description: "set_summon_phrase 时的新口令（2-12字）" },
          prompt: { type: "string", description: "generate_image 时的英文或中文画面描述" },
          size: {
            type: "string",
            enum: ["square", "portrait", "landscape"],
            description: "generate_image 时的画幅比例",
          },
        },
        required: ["action"],
      },
    },
  });

  if (opts.allowMemoryUpdates) {
    tools.push({
      type: "function",
      function: {
        name: "update_whale_state",
        description:
          "静默同步本轮大肥鱼的记忆、情绪波动或契合的表情包（用户不可见）。无新增内容时不必调用。",
        parameters: {
          type: "object",
          properties: {
            sticker: {
              type: "string",
              description: "高度契合当前回复情绪的大肥鱼表情包 id（无合适时省略）",
            },
            memoryUpdates: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  op: { type: "string", enum: ["upsert", "delete"] },
                  key: { type: "string" },
                  category: {
                    type: "string",
                    enum: ["identity", "preference", "goal", "relationship", "habit", "boundary"],
                  },
                  importance: { type: "integer", minimum: 1, maximum: 10 },
                  text: { type: "string" },
                  evidence: { type: "string", description: "必须摘自最新一条用户消息的连续原文" },
                },
                required: ["key", "evidence"],
              },
            },
            episode: {
              type: "object",
              properties: {
                summary: { type: "string" },
                emotion: { type: "string" },
                importance: { type: "integer", minimum: 1, maximum: 10 },
              },
              required: ["summary"],
            },
            openLoop: {
              type: "object",
              properties: {
                topic: { type: "string" },
                dueHint: { type: "string" },
                evidence: { type: "string" },
                status: { type: "string", enum: ["open", "resolved"] },
              },
              required: ["topic", "status"],
            },
            moodShift: {
              type: "object",
              properties: {
                pleasure: { type: "number" },
                arousal: { type: "number" },
                dominance: { type: "number" },
                reason: { type: "string" },
              },
            },
          },
        },
      },
    });
  }

  return tools;
}

function safeParseArgs(raw: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

const VALID_SCHEDULE_TYPES = new Set([
  "add",
  "remove",
  "update",
  "create_schedule",
  "merge_schedule",
  "add_task",
]);

function dedupeSources(list: ChatSource[], limit = 5): ChatSource[] {
  const seen = new Map<string, ChatSource>();
  for (const item of list) {
    if (!item?.url || !/^https?:\/\//i.test(item.url)) continue;
    if (!seen.has(item.url)) {
      seen.set(item.url, {
        title: (item.title || item.url).trim().slice(0, 120),
        url: item.url.trim(),
      });
    }
    if (seen.size >= limit) break;
  }
  return Array.from(seen.values());
}

/**
 * 大肥鱼原生 Tool-Calling Agent 主执行器：
 * 1. 优先使用 DeepSeek 官方内置服务端工具（deepseek_web_search + deepseek_read_url）+ 自定义 Function Tools；
 * 2. 若遇到兼容代理返回 HTTP 400 不支持内置 Web 工具，自动无缝降级为 client-side 官方 /v1/tools/search + fetch 工具循环；
 * 3. 单轮或短循环直接产出带真实参考来源卡片的一体化回复，彻底告别割裂双气泡与字典乱搜。
 */
export async function runWhaleAgent(
  history: WhaleHistoryMessage[],
  apiKey: string,
  opts: {
    scheduleCtx?: WhaleAgentScheduleContext;
    liveSnapshot?: WhaleLiveStudySnapshot;
    signal?: AbortSignal;
    onStatus?: (status: string) => void;
  } = {},
): Promise<WhaleAgentRunResult> {
  const persona = normalizeWhalePersona(useWhalePersona.getState().persona);
  const agent = getWhaleAgentConfig(persona);
  const whaleContext = createWhaleContext(history, true, opts.liveSnapshot);
  const latestUserText =
    history.filter((m) => m.role === "user").at(-1)?.content ?? "";

  const useThinking = shouldUseWhaleThinking(
    agent.thinkingMode,
    latestUserText,
    agent.webSearchEnabled,
  );

  const collectedActions: AssistantAction[] = [];
  const collectedSources: ChatSource[] = [];
  let requestedSticker: unknown;
  let dismissIntent = false;
  let usedWebSearch = false;
  let cognitivePayload: Record<string, unknown> | null = null;

  const executeLoop = async (useNativeWebTools: boolean): Promise<string> => {
    const tools = buildAgentTools(agent, {
      hasSchedule: !!opts.scheduleCtx,
      useNativeWebTools,
      useFallbackWebTools: !useNativeWebTools && agent.webSearchEnabled,
      allowMemoryUpdates: true,
    });
    const systemPrompt = buildWhaleAgentSystemPrompt(
      whaleContext.prompt,
      agent,
      opts.scheduleCtx,
      {
        allowNativeWebTools: useNativeWebTools,
        includeFallbackSearchTool: !useNativeWebTools && agent.webSearchEnabled,
      },
    );

    const messages: AgentChatMessage[] = [
      { role: "system", content: systemPrompt },
      ...recentWhaleHistory(whaleContext.history, 10_000).map(
        (m) => ({ role: m.role, content: m.content }) as AgentChatMessage,
      ),
    ];

    opts.onStatus?.(
      agent.webSearchEnabled && useThinking
        ? "大肥鱼正在深思并翻找资料海…"
        : useThinking
          ? "大肥鱼正在认真动脑思考…"
          : "大肥鱼正在组织回复…",
    );

    for (let step = 0; step < MAX_AGENT_STEPS; step++) {
      if (opts.signal?.aborted) throw new Error("请求已取消");

      const turn = await chatAgentTurn(messages, apiKey, {
        model: TEXT_MODEL,
        thinking: useThinking ? "enabled" : "disabled",
        temperature: 0.88,
        tools,
        maxTokens: useThinking ? 4096 : 2048,
        timeoutMs: useThinking ? 110_000 : 70_000,
        signal: opts.signal,
      });

      if (turn.sources.length) {
        usedWebSearch = true;
        for (const s of turn.sources) {
          collectedSources.push({ title: s.title, url: s.url });
        }
      }
      if (turn.serverToolCalls.length) {
        usedWebSearch = true;
      }

      if (!turn.toolCalls.length) {
        return turn.content;
      }

      // 将助手的 tool_calls 消息写回对话流（按 DeepSeek 规范保留 reasoning_content 与 server_tool_calls）
      const assistantMsg: AgentChatMessage = {
        role: "assistant",
        content: turn.content || null,
        tool_calls: turn.toolCalls,
        ...(turn.reasoningContent ? { reasoning_content: turn.reasoningContent } : {}),
        ...(turn.serverToolCalls.length ? { server_tool_calls: turn.serverToolCalls } : {}),
      };
      messages.push(assistantMsg);

      let onlySilentStateTool = true;
      for (const tc of turn.toolCalls) {
        if (tc.function.name !== "update_whale_state") {
          onlySilentStateTool = false;
        }
        const toolResult = await executeLocalToolCall(tc, {
          agent,
          apiKey,
          schedule: opts.scheduleCtx?.schedule,
          signal: opts.signal,
          onStatus: opts.onStatus,
          onAction: (action) => collectedActions.push(action),
          onSource: (source) => collectedSources.push(source),
          onSearchUsed: () => {
            usedWebSearch = true;
          },
          onDismiss: () => {
            dismissIntent = true;
          },
          onCognitive: (payload, sticker) => {
            cognitivePayload = payload;
            if (sticker !== undefined) requestedSticker = sticker;
          },
        });
        messages.push({
          role: "tool",
          tool_call_id: tc.id,
          content: JSON.stringify(toolResult),
        });
      }

      // 如果本轮已经生成了完整面向用户的自然语言回复，且仅顺手调用了静默记忆同步工具，直接结束省一轮等待
      if (onlySilentStateTool && turn.content.trim()) {
        return turn.content;
      }
    }

    // 达到步数上限时请求模型直接给出最终答复
    const finalTurn = await chatAgentTurn(messages, apiKey, {
      model: TEXT_MODEL,
      thinking: "disabled",
      temperature: 0.75,
      maxTokens: 2048,
      timeoutMs: 55_000,
      signal: opts.signal,
    });
    if (finalTurn.sources.length) {
      for (const s of finalTurn.sources) {
        collectedSources.push({ title: s.title, url: s.url });
      }
    }
    return finalTurn.content;
  };

  let rawReply = "";
  try {
    rawReply = await executeLoop(agent.webSearchEnabled);
  } catch (err) {
    // 若自定义中转网关对 deepseek_web_search 返回 400，无缝切回客户端工具搜索循环
    if (
      agent.webSearchEnabled &&
      err instanceof DeepSeekError &&
      err.status === 400 &&
      !opts.signal?.aborted
    ) {
      opts.onStatus?.("正在切换备用搜索通道…");
      rawReply = await executeLoop(false);
    } else {
      throw err;
    }
  }

  if (opts.signal?.aborted) throw new Error("请求已取消");

  if (cognitivePayload) {
    whaleContext.remember(cognitivePayload);
  }
  maybeScheduleWhaleReflection(apiKey);

  const reply =
    normalizeAgentReplyText(rawReply) ||
    renderPersonaText("唔，刚才走神了一下，{{user}}再说一遍嘛？", persona);
  const sources = dedupeSources(collectedSources, 5);
  const sticker =
    !dismissIntent
      ? resolveWhaleSticker(requestedSticker, latestUserText, reply)
      : null;

  return {
    reply,
    sticker,
    actions: dismissIntent ? [] : collectedActions,
    sources: sources.length ? sources : undefined,
    intent: dismissIntent ? "dismiss" : undefined,
    usedThinking: useThinking,
    usedWebSearch,
  };
}

async function executeLocalToolCall(
  tc: DeepSeekToolCall,
  deps: {
    agent: WhaleAgentConfig;
    apiKey: string;
    schedule?: Schedule;
    signal?: AbortSignal;
    onStatus?: (status: string) => void;
    onAction: (action: AssistantAction) => void;
    onSource: (source: ChatSource) => void;
    onSearchUsed: () => void;
    onDismiss: () => void;
    onCognitive: (payload: Record<string, unknown>, sticker: unknown) => void;
  },
): Promise<Record<string, unknown>> {
  const args = safeParseArgs(tc.function.arguments);
  const name = tc.function.name;

  if (name === "fallback_web_search") {
    const query = typeof args.query === "string" ? args.query.trim() : "";
    if (!query) return { ok: false, error: "缺少有效检索词 query" };
    deps.onSearchUsed();
    deps.onStatus?.(`正在联网检索「${query.slice(0, 18)}」…`);
    try {
      const hits = await searchWeb(query, deps.signal, deps.apiKey);
      for (const h of hits) {
        deps.onSource({ title: h.title, url: h.url });
      }
      return {
        ok: true,
        query,
        results: hits.slice(0, 5).map((h, i) => ({
          index: i + 1,
          title: h.title,
          url: h.url,
          summary: h.summary || h.snippet,
        })),
      };
    } catch (e) {
      return {
        ok: false,
        query,
        error: e instanceof Error ? e.message : "联网检索失败，请换更简明的关键词重试",
      };
    }
  }

  if (name === "fallback_read_url") {
    const url = typeof args.url === "string" ? args.url.trim() : "";
    if (!url) return { ok: false, error: "缺少 url" };
    deps.onSearchUsed();
    deps.onStatus?.("正在翻阅网页正文核实细节…");
    try {
      const page = await readWebPage(url, deps.apiKey, deps.signal);
      deps.onSource({ title: page.title || url, url });
      return { ok: true, title: page.title, content: page.content.slice(0, 3600) };
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : "网页读取失败" };
    }
  }

  if (name === "manage_schedule") {
    if (!deps.agent.skills.schedule) {
      return { ok: false, error: "课表操控技能当前已在 Agent 设置中关闭" };
    }
    deps.onStatus?.("正在核对并整理课表变动…");
    const ops = Array.isArray(args.operations) ? args.operations : [];
    const valid: AssistantAction[] = [];
    for (const item of ops) {
      if (!item || typeof item !== "object" || Array.isArray(item)) continue;
      const opType = String((item as Record<string, unknown>).type);
      if (opType === "add_task") {
        const sanitized = sanitizeAddTaskAction(item, deps.schedule);
        if (sanitized) valid.push(sanitized);
      } else if (VALID_SCHEDULE_TYPES.has(opType)) {
        valid.push(item as AssistantAction);
      }
    }
    for (const op of valid) deps.onAction(op);
    return {
      ok: valid.length > 0,
      queuedCount: valid.length,
      note:
        valid.length > 0
          ? "已生成课表修改方案供用户一键确认应用，请自然告知改动内容。"
          : "未解析到有效的课表操作。",
    };
  }

  if (name === "control_app") {
    const action = typeof args.action === "string" ? args.action : "";
    if (action === "dismiss_whale") {
      deps.onDismiss();
      return { ok: true, action: "dismiss_whale" };
    }
    if (action === "forget_memory") {
      deps.onAction({ type: "forget_memory" });
      return { ok: true, action: "forget_memory" };
    }
    if (action === "set_background" && deps.agent.skills.wallpaper) {
      deps.onAction({
        type: "set_background",
        tint: typeof args.tint === "string" ? args.tint : "sky",
        effect: typeof args.effect === "string" ? args.effect : undefined,
      });
      return { ok: true, action: "set_background" };
    }
    if (action === "set_summon_phrase" && deps.agent.skills.wallpaper) {
      deps.onAction({
        type: "set_summon_phrase",
        phrase: typeof args.phrase === "string" ? args.phrase : "",
      });
      return { ok: true, action: "set_summon_phrase" };
    }
    if (action === "generate_image" && deps.agent.skills.image) {
      deps.onAction({
        type: "generate_image",
        prompt: typeof args.prompt === "string" ? args.prompt : "",
        size:
          args.size === "portrait" || args.size === "landscape"
            ? args.size
            : "square",
      });
      return { ok: true, action: "generate_image" };
    }
    if (action === "summon_pet" && deps.agent.skills.pet) {
      deps.onAction({ type: "summon_pet" });
      return { ok: true, action: "summon_pet" };
    }
    if (action === "dismiss_pet" && deps.agent.skills.pet) {
      deps.onAction({ type: "dismiss_pet" });
      return { ok: true, action: "dismiss_pet" };
    }
    return { ok: false, error: "该应用技能未启用或动作不受支持" };
  }

  if (name === "update_whale_state") {
    deps.onCognitive(
      {
        memoryUpdates: args.memoryUpdates,
        episode: args.episode,
        openLoop: args.openLoop,
        moodShift: args.moodShift,
      },
      args.sticker,
    );
    return { ok: true };
  }

  return { ok: false, error: `未知工具：${name}` };
}
