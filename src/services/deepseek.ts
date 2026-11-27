import type {
  AiRuntimeConfig,
  AiRuntimeSettingsInput,
} from "@/constants/aiProviders";
import { runAIRequest, type RequestPriority } from "../utils/requestCoordinator";
import { extractJson } from "@/utils/base64";

/**
 * AI 接口接入层（默认 DeepSeek 官方，并动态兼容多服务商 OpenAI 协议）。
 *
 * - 文本任务默认哨兵：`deepseek-flash`（自动路由至当前配置的服务商文本模型）
 * - 图片识别默认哨兵：`deepseek-flash`（检测到图片消息时自动路由至当前配置的服务商视觉模型）
 *
 * 安全提示：API Key 由用户在「设置」中填写并仅保存在本地安全存储，
 * 切勿硬编码进代码或提交到仓库；生产环境应放在自有服务端中转。
 */
const BASE_URL = "https://api.deepseek.com/v1";

export const VISION_MODEL = "deepseek-flash";
export const TEXT_MODEL = "deepseek-flash";

const DEFAULT_RUNTIME: AiRuntimeConfig = {
  provider: "deepseek",
  baseUrl: BASE_URL,
  textModel: TEXT_MODEL,
  visionModel: VISION_MODEL,
  supportsServerTools: true,
  requiresApiKey: true,
};

function loadAiProvidersModule():
  | typeof import("../constants/aiProviders")
  | null {
  try {
    // 兼容仅 mock requestCoordinator/base64 的隔离单测与完整应用运行时
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return require("../constants/aiProviders") as typeof import("../constants/aiProviders");
  } catch {
    return null;
  }
}

function readRuntimeSettings(): Partial<AiRuntimeSettingsInput> | null {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const mod = require("../store/useSettings") as {
      useSettings?: { getState?: () => Partial<AiRuntimeSettingsInput> };
    };
    return mod?.useSettings?.getState?.() ?? null;
  } catch {
    return null;
  }
}

function getRuntimeConfig(
  override?: Partial<AiRuntimeSettingsInput>,
): AiRuntimeConfig {
  const providers = loadAiProvidersModule();
  if (!providers || typeof providers.resolveAiRuntimeConfig !== "function") {
    return DEFAULT_RUNTIME;
  }
  const settings = readRuntimeSettings();
  if (!override) {
    return providers.resolveAiRuntimeConfig(settings);
  }
  return providers.resolveAiRuntimeConfig({
    aiProvider: override.aiProvider ?? settings?.aiProvider,
    aiBaseUrl: override.aiBaseUrl ?? settings?.aiBaseUrl,
    aiTextModel: override.aiTextModel ?? settings?.aiTextModel,
    aiVisionModel: override.aiVisionModel ?? settings?.aiVisionModel,
  });
}

function hasImageContent(
  messages: readonly (ChatContent | AgentChatMessage)[],
): boolean {
  for (const msg of messages) {
    if (!Array.isArray(msg.content)) continue;
    for (const part of msg.content) {
      if (part && typeof part === "object" && part.type === "image_url") {
        return true;
      }
    }
  }
  return false;
}

function requireBaseUrl(runtime: AiRuntimeConfig): string {
  if (!runtime.baseUrl) {
    throw new DeepSeekError("请先在「设置 → AI 连接」中填写有效的接口地址（Base URL）");
  }
  return runtime.baseUrl;
}

function buildAuthHeaders(
  apiKey: string,
  runtime: AiRuntimeConfig,
  includeJsonContentType: boolean,
): Record<string, string> {
  const key = apiKey.trim();
  if (!key && runtime.requiresApiKey) {
    throw new DeepSeekError("请先填写 API Key");
  }
  const headers: Record<string, string> = {};
  if (includeJsonContentType) {
    headers["Content-Type"] = "application/json";
  }
  if (key) {
    headers.Authorization = `Bearer ${key}`;
  }
  return headers;
}

function resolveRuntimeModel(
  requestedModel: string | undefined,
  runtime: AiRuntimeConfig,
  messages?: readonly (ChatContent | AgentChatMessage)[],
): string {
  const requested = requestedModel?.trim() ?? "";
  const isDefaultSentinel =
    !requested || requested === TEXT_MODEL || requested === VISION_MODEL;
  const resolved = isDefaultSentinel
    ? messages && hasImageContent(messages)
      ? runtime.visionModel || runtime.textModel
      : runtime.textModel || runtime.visionModel
    : requested;
  if (!resolved) {
    throw new DeepSeekError("请先在「设置 → AI 连接」中填写模型名称");
  }
  return resolved;
}

export interface ChatContent {
  role: "system" | "user" | "assistant";
  content:
    | string
    | (
        | { type: "text"; text: string }
        | { type: "image_url"; image_url: { url: string } }
      )[];
}

export type AgentChatMessage =
  | ChatContent
  | {
      role: "assistant";
      content: string | null;
      tool_calls?: DeepSeekToolCall[];
      reasoning_content?: string;
      server_tool_calls?: DeepSeekServerToolStep[];
    }
  | {
      role: "tool";
      tool_call_id: string;
      name?: string;
      content: string;
    };

export interface DeepSeekToolCall {
  id: string;
  type: "function";
  function: {
    name: string;
    arguments: string;
  };
}

export interface DeepSeekAnnotation {
  type?: string;
  url?: string;
  title?: string;
  start_index?: number;
  end_index?: number;
}

export interface DeepSeekServerToolSource {
  title?: string;
  url?: string;
  snippet?: string;
  site_name?: string;
  published_at?: string;
}

export interface DeepSeekServerToolCallItem {
  id?: string;
  type?: string;
  kind?: string;
  status?: string;
  action?: { type?: string; queries?: string[]; url?: string };
  sources?: DeepSeekServerToolSource[];
}

export interface DeepSeekServerToolStep {
  step?: number;
  calls?: DeepSeekServerToolCallItem[];
}

export type DeepSeekToolDefinition =
  | { type: "deepseek_web_search"; name?: "deepseek_web_search" }
  | { type: "deepseek_read_url"; name?: "deepseek_read_url" }
  | {
      type: "function";
      function: {
        name: string;
        description: string;
        parameters: Record<string, unknown>;
      };
    };

export interface DeepSeekWebSource {
  title: string;
  url: string;
  snippet?: string;
}

export interface DeepSeekAgentTurnResult {
  content: string;
  reasoningContent?: string;
  toolCalls: DeepSeekToolCall[];
  annotations: DeepSeekAnnotation[];
  serverToolCalls: DeepSeekServerToolStep[];
  sources: DeepSeekWebSource[];
  finishReason?: string;
}

export interface DeepSeekSearchHit {
  title: string;
  url: string;
  snippet: string;
  summary: string;
  content: string;
  rerankScore: number;
}

export class DeepSeekError extends Error {
  /** HTTP 状态码；解析失败等服务内错误没有该字段 */
  readonly status?: number;
  /** 是否属于可自动重试的临时故障（5xx、429、网络抖动） */
  readonly retryable: boolean;

  constructor(message: string, opts: { status?: number; retryable?: boolean } = {}) {
    super(message);
    this.name = "DeepSeekError";
    this.status = opts.status;
    this.retryable = opts.retryable ?? false;
  }
}

/** 服务端临时故障：503「Service is too busy」等，退避后可重试 */
const RETRYABLE_STATUS = new Set([408, 425, 429, 500, 502, 503, 504]);
const MAX_ATTEMPTS = 3;

function abortError() {
  const err = new Error("请求已取消");
  err.name = "AbortError";
  return err;
}

function wait(ms: number, signal?: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    if (signal?.aborted) {
      reject(abortError());
      return;
    }
    const onAbort = () => {
      clearTimeout(timer);
      reject(abortError());
    };
    const timer = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

/** 轻量连通性测试：查询 /models，零 token 消耗，校验密钥与网络连通性 */
export async function testDeepSeekConnection(
  apiKey: string,
  signal?: AbortSignal,
  configOverride?: Partial<AiRuntimeSettingsInput>,
): Promise<{ latencyMs: number; modelCount: number }> {
  const runtime = getRuntimeConfig(configOverride);
  const baseUrl = requireBaseUrl(runtime);
  const headers = buildAuthHeaders(apiKey, runtime, false);
  const start = Date.now();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 12000);
  const onAbort = () => controller.abort();
  signal?.addEventListener("abort", onAbort, { once: true });
  try {
    const res = await fetch(`${baseUrl}/models`, {
      method: "GET",
      headers,
      signal: controller.signal,
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      throw httpError(res.status, detail);
    }
    const json = (await res.json().catch(() => ({}))) as {
      data?: unknown[];
      models?: unknown[];
    };
    const list = Array.isArray(json.data)
      ? json.data
      : Array.isArray(json.models)
        ? json.models
        : [];
    return {
      latencyMs: Math.max(1, Date.now() - start),
      modelCount: list.length,
    };
  } catch (err) {
    if (err instanceof DeepSeekError) throw err;
    if (signal?.aborted) throw abortError();
    if (err instanceof Error && err.name === "AbortError") {
      throw new DeepSeekError("连接超时，请检查网络或代理后重试", { retryable: true });
    }
    throw new DeepSeekError("网络不可达，请检查网络连接后重试", { retryable: true });
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener("abort", onAbort);
  }
}

/**
 * 把 HTTP 错误翻译成用户能看懂的话。
 * 原始 JSON（request_id、service_unavailable 等）只进开发日志，不直接甩到聊天框。
 */
function httpError(status: number, detail: string) {
  if (typeof __DEV__ !== "undefined" && __DEV__) {
    console.warn(`[deepseek] HTTP ${status}: ${detail.slice(0, 300)}`);
  }
  if (status === 401 || status === 403) {
    return new DeepSeekError("API Key 无效或没有权限，请在「设置」里检查后重试", { status });
  }
  if (status === 402) {
    return new DeepSeekError("AI 账户余额不足，请充值后再试", { status });
  }
  if (status === 429) {
    return new DeepSeekError("请求太频繁了，缓一小会儿再试", { status, retryable: true });
  }
  if (RETRYABLE_STATUS.has(status)) {
    return new DeepSeekError("AI 服务暂时繁忙，请稍后再试", { status, retryable: true });
  }
  return new DeepSeekError(`AI 服务返回异常（${status}），请稍后再试`, { status });
}

/** 单次请求；超时、外部取消与网络错误都在这里转成 DeepSeekError */
async function requestOnce(
  messages: ChatContent[],
  apiKey: string,
  opts: {
    model?: string;
    temperature?: number;
    jsonMode?: boolean;
    expectJson?: boolean;
    timeoutMs?: number;
    maxTokens?: number;
    signal?: AbortSignal;
  },
): Promise<string> {
  const runtime = getRuntimeConfig();
  const baseUrl = requireBaseUrl(runtime);
  const headers = buildAuthHeaders(apiKey, runtime, true);
  const model = resolveRuntimeModel(opts.model, runtime, messages);

  const controller = new AbortController();
  const external = opts.signal;
  const abort = () => controller.abort();
  if (external?.aborted) controller.abort();
  external?.addEventListener("abort", abort, { once: true });
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, opts.timeoutMs ?? 90_000);

  const payload: Record<string, unknown> = {
    model,
    messages,
    temperature: opts.temperature ?? 0.4,
    ...(runtime.supportsServerTools
      ? {
          // V4.1-Flash 默认开启思考模式；日常对话/结构化解析关掉更快，也能让 temperature 生效
          thinking: { type: "disabled" },
        }
      : {}),
    ...(opts.maxTokens !== undefined
      ? { max_tokens: Math.max(16, Math.min(1024, Math.floor(opts.maxTokens))) }
      : {}),
    ...(opts.jsonMode ? { response_format: { type: "json_object" } } : {}),
  };

  try {
    const res = await fetch(`${baseUrl}/chat/completions`, {
      method: "POST",
      headers,
      body: JSON.stringify(payload),
      signal: controller.signal,
    });

    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      throw httpError(res.status, detail);
    }

    const data = await res.json();
    const choice = data?.choices?.[0];
    const text: string | undefined = choice?.message?.content;
    if (typeof text !== "string") {
      throw new DeepSeekError("AI 服务返回了非预期的结构");
    }
    if (
      opts.expectJson &&
      choice?.finish_reason === "length" &&
      !extractJson(text)
    ) {
      throw new DeepSeekError(
        "单次识别内容过多导致返回被截断，建议拆分图片或分批上传后重试",
        { status: 413 },
      );
    }
    return text;
  } catch (e) {
    if (e instanceof Error && e.name === "AbortError") {
      if (external?.aborted) throw abortError();
      throw new DeepSeekError(
        timedOut ? "请求超时，请检查网络后重试" : "请求已中断，请重试",
      );
    }
    const message = e instanceof Error ? e.message : "";
    if (e instanceof TypeError || /Network request failed|Failed to fetch|NetworkError/i.test(message)) {
      throw new DeepSeekError("网络连接失败，请检查网络后重试", { retryable: true });
    }
    throw e;
  } finally {
    clearTimeout(timer);
    external?.removeEventListener("abort", abort);
  }
}

/** 发起 chat completion：临时故障自动退避重试，仍失败则抛出可读的错误 */
async function chatDirect(
  messages: ChatContent[],
  apiKey: string,
  opts: {
    model?: string;
    temperature?: number;
    jsonMode?: boolean;
    expectJson?: boolean;
    timeoutMs?: number;
    maxTokens?: number;
    signal?: AbortSignal;
    priority?: RequestPriority;
  } = {},
): Promise<string> {
  let lastError: unknown;
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    try {
      return await requestOnce(messages, apiKey, opts);
    } catch (e) {
      lastError = e;
      const retryable = e instanceof DeepSeekError && e.retryable;
      if (!retryable || attempt === MAX_ATTEMPTS - 1 || opts.signal?.aborted) throw e;
      // 0.7s / 1.4s 退避，加一点抖动避免多个请求同时重试
      await wait(700 * 2 ** attempt + Math.floor(Math.random() * 250), opts.signal);
    }
  }
  throw lastError instanceof Error ? lastError : new DeepSeekError("请求失败，请重试");
}

export function chat(messages: ChatContent[], apiKey: string, opts: Parameters<typeof chatDirect>[2] = {}): Promise<string> {
  return runAIRequest(signal => chatDirect(messages, apiKey, { ...opts, signal }), { signal: opts.signal, priority: opts.priority, label: '助手/识别' });
}

/** 调用模型并解析 JSON：优先用 JSON 输出模式，失败自动降级重试一次 */
export async function chatJson<T>(
  messages: ChatContent[],
  apiKey: string,
  opts: {
    model?: string;
    temperature?: number;
    timeoutMs?: number;
    /** 最多尝试次数，默认 3；成绩识别等交互任务可缩短，避免长时间转圈 */
    attempts?: number;
    signal?: AbortSignal;
    priority?: RequestPriority;
  } = {},
): Promise<T> {
  let lastError: unknown = null;
  const attempts = Math.max(1, opts.attempts ?? 3);

  for (let attempt = 0; attempt < attempts; attempt++) {
    if (opts.signal?.aborted) throw new DeepSeekError("请求已取消");
    // 第 1 次走 JSON 输出模式，后续降级为普通模式（个别模型/场景对 json_object 支持不稳）
    const jsonMode = attempt === 0;
    const reqMessages: ChatContent[] =
      attempt === 0
        ? messages
        : [
            ...messages.slice(0, -1),
            reinforceJson(messages[messages.length - 1]),
          ];

    try {
      const raw = await chat(reqMessages, apiKey, {
        signal: opts.signal,
        priority: opts.priority,
        model: opts.model,
        jsonMode,
        expectJson: true,
        timeoutMs: opts.timeoutMs,
        temperature: attempt === 0 ? (opts.temperature ?? 0.4) : 0.1,
      });
      const parsed = extractJson<T>(raw);
      if (parsed) return parsed;
      lastError = new DeepSeekError("无法解析模型输出为结构化数据");
    } catch (e) {
      lastError = e;
      if (opts.signal?.aborted || e instanceof Error && e.name === 'AbortError') throw e;
      // chat() 内部已对 5xx/429/网络抖动做过退避重试，这类错误换模式再试也没用；
      // 只有 400（可能是 json_object 不被支持）和解析失败才值得降级重试
      if (e instanceof DeepSeekError && e.status !== 400) break;
    }
  }

  throw lastError instanceof Error
    ? lastError
    : new DeepSeekError("无法解析模型输出为结构化数据");
}

/** 重试时在末条消息上追加「只输出 JSON」的硬约束 */
function reinforceJson(last: ChatContent): ChatContent {
  const suffix =
    "\n\n【重要】只输出一个严格的 JSON 对象，不要任何解释文字、不要代码围栏、不要注释。";
  if (typeof last.content === "string") {
    return { ...last, content: last.content + suffix };
  }
  if (!Array.isArray(last.content)) {
    return { ...last, content: suffix };
  }
  return {
    ...last,
    content: last.content.map((part) =>
      part.type === "text" ? { ...part, text: part.text + suffix } : part,
    ),
  };
}

/** 从 DeepSeek 官方响应的 annotations 与 server_tool_calls 中提取去重参考来源 */
export function extractSourcesFromAgentMessage(message: {
  annotations?: unknown;
  server_tool_calls?: unknown;
}): DeepSeekWebSource[] {
  const map = new Map<string, DeepSeekWebSource>();
  const add = (url: unknown, title: unknown, snippet?: unknown) => {
    const cleanUrl = typeof url === "string" ? url.trim() : "";
    if (!cleanUrl || !/^https?:\/\//i.test(cleanUrl)) return;
    const cleanTitle =
      typeof title === "string" && title.trim()
        ? title.trim().slice(0, 120)
        : cleanUrl.replace(/^https?:\/\//i, "").split("/")[0] || cleanUrl;
    const cleanSnippet =
      typeof snippet === "string" && snippet.trim()
        ? snippet.trim().slice(0, 260)
        : undefined;
    const existing = map.get(cleanUrl);
    if (!existing) {
      map.set(cleanUrl, { title: cleanTitle, url: cleanUrl, snippet: cleanSnippet });
    } else if (!existing.snippet && cleanSnippet) {
      existing.snippet = cleanSnippet;
    }
  };

  if (Array.isArray(message.annotations)) {
    for (const item of message.annotations) {
      if (!item || typeof item !== "object") continue;
      const a = item as DeepSeekAnnotation;
      add(a.url, a.title);
    }
  }

  if (Array.isArray(message.server_tool_calls)) {
    for (const step of message.server_tool_calls) {
      if (!step || typeof step !== "object") continue;
      const calls = (step as DeepSeekServerToolStep).calls;
      if (!Array.isArray(calls)) continue;
      for (const call of calls) {
        if (!call || typeof call !== "object" || !Array.isArray(call.sources)) continue;
        for (const src of call.sources) {
          if (!src || typeof src !== "object") continue;
          add(src.url, src.title || src.site_name, src.snippet);
        }
      }
    }
  }

  return Array.from(map.values());
}

/** 单次 DeepSeek 原生 Agent 回合：支持官方 deepseek_web_search / deepseek_read_url + 自定义 function 工具 + 深度思考 */
async function requestAgentTurnOnce(
  messages: AgentChatMessage[],
  apiKey: string,
  opts: {
    model?: string;
    temperature?: number;
    thinking?: "enabled" | "disabled";
    tools?: DeepSeekToolDefinition[];
    toolChoice?: "auto" | "none" | "required";
    timeoutMs?: number;
    maxTokens?: number;
    signal?: AbortSignal;
  },
): Promise<DeepSeekAgentTurnResult> {
  const runtime = getRuntimeConfig();
  const baseUrl = requireBaseUrl(runtime);
  const headers = buildAuthHeaders(apiKey, runtime, true);
  const model = resolveRuntimeModel(opts.model, runtime, messages);

  const controller = new AbortController();
  const external = opts.signal;
  const abort = () => controller.abort();
  if (external?.aborted) controller.abort();
  external?.addEventListener("abort", abort, { once: true });
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, opts.timeoutMs ?? 90_000);

  const thinkingType = opts.thinking ?? "disabled";
  const outgoingMessages = runtime.supportsServerTools
    ? messages
    : messages.map((msg) => {
        if (
          msg.role === "assistant" &&
          ("server_tool_calls" in msg || "reasoning_content" in msg)
        ) {
          const {
            server_tool_calls: _ignoredServerCalls,
            reasoning_content: _ignoredReasoning,
            ...rest
          } = msg;
          return rest;
        }
        return msg;
      });

  const body: Record<string, unknown> = {
    model,
    messages: outgoingMessages,
  };
  if (runtime.supportsServerTools) {
    body.thinking = { type: thinkingType };
    // DeepSeek 官方文档：思考模式开启时忽略 temperature，仅在关闭思考时传入
    if (thinkingType === "disabled" && opts.temperature !== undefined) {
      body.temperature = opts.temperature;
    }
  } else if (opts.temperature !== undefined) {
    body.temperature = opts.temperature;
  }
  if (opts.maxTokens !== undefined) {
    body.max_tokens = Math.max(64, Math.min(8192, Math.floor(opts.maxTokens)));
  }
  if (opts.tools?.length) {
    const outgoingTools = runtime.supportsServerTools
      ? opts.tools
      : opts.tools.filter((tool) => tool.type === "function");
    if (outgoingTools.length) {
      body.tools = outgoingTools;
      if (opts.toolChoice) body.tool_choice = opts.toolChoice;
    }
  }

  try {
    const res = await fetch(`${baseUrl}/chat/completions`, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
      signal: controller.signal,
    });

    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      throw httpError(res.status, detail);
    }

    const data = await res.json();
    const choice = data?.choices?.[0];
    const msg = choice?.message;
    if (!msg || typeof msg !== "object") {
      throw new DeepSeekError("AI 服务返回了非预期的结构");
    }

    const toolCalls: DeepSeekToolCall[] = Array.isArray(msg.tool_calls)
      ? msg.tool_calls
          .filter(
            (tc: unknown): tc is DeepSeekToolCall =>
              !!tc &&
              typeof tc === "object" &&
              typeof (tc as DeepSeekToolCall).id === "string" &&
              typeof (tc as DeepSeekToolCall).function?.name === "string",
          )
          .map((tc: DeepSeekToolCall) => ({
            id: tc.id,
            type: "function" as const,
            function: {
              name: tc.function.name,
              arguments:
                typeof tc.function.arguments === "string"
                  ? tc.function.arguments
                  : JSON.stringify(tc.function.arguments ?? {}),
            },
          }))
      : [];

    const annotations: DeepSeekAnnotation[] = Array.isArray(msg.annotations)
      ? msg.annotations
      : [];
    const serverToolCalls: DeepSeekServerToolStep[] = Array.isArray(msg.server_tool_calls)
      ? msg.server_tool_calls
      : [];

    return {
      content: typeof msg.content === "string" ? msg.content : "",
      reasoningContent:
        typeof msg.reasoning_content === "string" ? msg.reasoning_content : undefined,
      toolCalls,
      annotations,
      serverToolCalls,
      sources: extractSourcesFromAgentMessage(msg),
      finishReason: typeof choice?.finish_reason === "string" ? choice.finish_reason : undefined,
    };
  } catch (e) {
    if (e instanceof Error && e.name === "AbortError") {
      if (external?.aborted) throw abortError();
      throw new DeepSeekError(
        timedOut ? "请求超时，请检查网络后重试" : "请求已中断，请重试",
      );
    }
    const message = e instanceof Error ? e.message : "";
    if (e instanceof TypeError || /Network request failed|Failed to fetch|NetworkError/i.test(message)) {
      throw new DeepSeekError("网络连接失败，请检查网络后重试", { retryable: true });
    }
    throw e;
  } finally {
    clearTimeout(timer);
    external?.removeEventListener("abort", abort);
  }
}

export function chatAgentTurn(
  messages: AgentChatMessage[],
  apiKey: string,
  opts: Parameters<typeof requestAgentTurnOnce>[2] & { priority?: RequestPriority } = {},
): Promise<DeepSeekAgentTurnResult> {
  return runAIRequest(
    async (signal) => {
      let lastError: unknown;
      for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
        try {
          return await requestAgentTurnOnce(messages, apiKey, { ...opts, signal });
        } catch (e) {
          lastError = e;
          const retryable = e instanceof DeepSeekError && e.retryable;
          if (!retryable || attempt === MAX_ATTEMPTS - 1 || signal.aborted) throw e;
          await wait(700 * 2 ** attempt + Math.floor(Math.random() * 250), signal);
        }
      }
      throw lastError instanceof Error ? lastError : new DeepSeekError("请求失败，请重试");
    },
    { signal: opts.signal, priority: opts.priority, label: "大肥鱼 Agent" },
  );
}

/**
 * DeepSeek 官方独立联网搜索接口：POST https://api.deepseek.com/v1/tools/search
 * 直接复用用户 DeepSeek API Key，返回带 rerank_score 与模型优化摘要 summary 的高质量结果。
 */
export async function deepseekWebSearch(
  query: string,
  apiKey: string,
  opts: {
    count?: number;
    needContent?: boolean;
    timeoutMs?: number;
    signal?: AbortSignal;
  } = {},
): Promise<DeepSeekSearchHit[]> {
  const runtime = getRuntimeConfig();
  if (!runtime.supportsServerTools) return [];
  const key = apiKey.trim();
  const q = query.trim().slice(0, 128);
  if ((!key && runtime.requiresApiKey) || !q || !runtime.baseUrl) return [];

  const controller = new AbortController();
  const external = opts.signal;
  const abort = () => controller.abort();
  if (external?.aborted) controller.abort();
  external?.addEventListener("abort", abort, { once: true });
  const timer = setTimeout(() => controller.abort(), opts.timeoutMs ?? 20_000);

  try {
    const res = await fetch(`${runtime.baseUrl}/tools/search`, {
      method: "POST",
      headers: buildAuthHeaders(key, runtime, true),
      body: JSON.stringify({
        query: q,
        count: Math.max(1, Math.min(15, opts.count ?? 6)),
        need_content: !!opts.needContent,
      }),
      signal: controller.signal,
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      throw httpError(res.status, detail);
    }
    const data = (await res.json()) as { results?: unknown[] };
    if (!Array.isArray(data?.results)) return [];
    const parsed: DeepSeekSearchHit[] = [];
    for (const raw of data.results) {
      if (!raw || typeof raw !== "object") continue;
      const r = raw as Record<string, unknown>;
      const url = typeof r.url === "string" ? r.url.trim() : "";
      const title = typeof r.title === "string" ? r.title.trim() : "";
      if (!url || !/^https?:\/\//i.test(url) || !title) continue;
      const snippet = typeof r.snippet === "string" ? r.snippet.trim() : "";
      const summary = typeof r.summary === "string" ? r.summary.trim() : "";
      const content = typeof r.content === "string" ? r.content.trim() : "";
      const score =
        typeof r.rerank_score === "number" && Number.isFinite(r.rerank_score)
          ? r.rerank_score
          : 1;
      parsed.push({ title, url, snippet, summary, content, rerankScore: score });
    }
    return parsed.sort((a, b) => b.rerankScore - a.rerankScore);
  } catch (e) {
    if (e instanceof Error && e.name === "AbortError") {
      if (external?.aborted) throw abortError();
      throw new DeepSeekError("官方搜索超时，请稍后再试", { retryable: true });
    }
    throw e;
  } finally {
    clearTimeout(timer);
    external?.removeEventListener("abort", abort);
  }
}

/**
 * DeepSeek 官方独立网页抓取接口：POST https://api.deepseek.com/v1/tools/fetch
 * 将目标 URL 转换为干净的 Markdown 供 Agent 精读核实。
 */
export async function deepseekFetchUrl(
  url: string,
  apiKey: string,
  opts: { timeoutMs?: number; signal?: AbortSignal } = {},
): Promise<{ title: string; content: string }> {
  const runtime = getRuntimeConfig();
  if (!runtime.supportsServerTools) {
    throw new DeepSeekError("当前 AI 服务商不支持 DeepSeek 官方网页抓取");
  }
  const baseUrl = requireBaseUrl(runtime);
  const headers = buildAuthHeaders(apiKey, runtime, true);
  const target = url.trim();
  if (!/^https?:\/\//i.test(target)) {
    throw new DeepSeekError("网页链接无效");
  }

  const controller = new AbortController();
  const external = opts.signal;
  const abort = () => controller.abort();
  if (external?.aborted) controller.abort();
  external?.addEventListener("abort", abort, { once: true });
  const timer = setTimeout(() => controller.abort(), opts.timeoutMs ?? 20_000);

  try {
    const res = await fetch(`${baseUrl}/tools/fetch`, {
      method: "POST",
      headers,
      body: JSON.stringify({ url: target }),
      signal: controller.signal,
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      throw httpError(res.status, detail);
    }
    const data = (await res.json()) as { title?: unknown; content?: unknown };
    return {
      title: typeof data?.title === "string" ? data.title.trim() : "",
      content: typeof data?.content === "string" ? data.content.trim() : "",
    };
  } finally {
    clearTimeout(timer);
    external?.removeEventListener("abort", abort);
  }
}

/** 把图片封装成 OpenAI 风格的 image_url 消息块 */
export function imagePart(base64: string, mimeType = "image/jpeg") {
  return {
    type: "image_url" as const,
    image_url: { url: `data:${mimeType};base64,${base64}` },
  };
}
