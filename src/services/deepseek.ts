import { extractJson } from "@/utils/base64";

/**
 * DeepSeek 接入层。
 *
 * - 文本任务：`deepseek-flash`（DeepSeek-V4.1-Flash）
 * - 图片识别（课表截图 / 作息表 / 成绩单）：`deepseek-flash`（多模态视觉模型）
 *
 * 安全提示：API Key 由用户在「设置」中填写并仅保存在本地设备，
 * 切勿硬编码进代码或提交到仓库；生产环境应放在自有服务端中转。
 */
const BASE_URL = "https://api.deepseek.com/v1";

export const VISION_MODEL = "deepseek-flash";
export const TEXT_MODEL = "deepseek-flash";

export interface ChatContent {
  role: "system" | "user" | "assistant";
  content:
    | string
    | (
        | { type: "text"; text: string }
        | { type: "image_url"; image_url: { url: string } }
      )[];
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
    return new DeepSeekError("DeepSeek 账户余额不足，请充值后再试", { status });
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
    timeoutMs?: number;
    maxTokens?: number;
    signal?: AbortSignal;
  },
): Promise<string> {
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

  try {
    const res = await fetch(`${BASE_URL}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: opts.model ?? TEXT_MODEL,
        messages,
        temperature: opts.temperature ?? 0.4,
        // V4.1-Flash 默认开启思考模式；日常对话/结构化解析关掉更快，也能让 temperature 生效
        thinking: { type: "disabled" },
        ...(opts.maxTokens !== undefined ? { max_tokens: Math.max(16, Math.min(1024, Math.floor(opts.maxTokens))) } : {}),
        ...(opts.jsonMode ? { response_format: { type: "json_object" } } : {}),
      }),
      signal: controller.signal,
    });

    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      throw httpError(res.status, detail);
    }

    const data = await res.json();
    const text: string | undefined = data?.choices?.[0]?.message?.content;
    if (typeof text !== "string") {
      throw new DeepSeekError("DeepSeek 返回了非预期的结构");
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
export async function chat(
  messages: ChatContent[],
  apiKey: string,
  opts: {
    model?: string;
    temperature?: number;
    jsonMode?: boolean;
    timeoutMs?: number;
    maxTokens?: number;
    signal?: AbortSignal;
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
  } = {},
): Promise<T> {
  let lastError: unknown = null;
  const attempts = Math.max(1, opts.attempts ?? 3);

  for (let attempt = 0; attempt < attempts; attempt++) {
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
        model: opts.model,
        jsonMode,
        timeoutMs: opts.timeoutMs,
        temperature: attempt === 0 ? (opts.temperature ?? 0.4) : 0.1,
      });
      const parsed = extractJson<T>(raw);
      if (parsed) return parsed;
      lastError = new DeepSeekError("无法解析模型输出为结构化数据");
    } catch (e) {
      lastError = e;
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
  return {
    ...last,
    content: last.content.map((part) =>
      part.type === "text" ? { ...part, text: part.text + suffix } : part,
    ),
  };
}

/** 把图片封装成 OpenAI 风格的 image_url 消息块 */
export function imagePart(base64: string, mimeType = "image/jpeg") {
  return {
    type: "image_url" as const,
    image_url: { url: `data:${mimeType};base64,${base64}` },
  };
}
