import { runAIRequest, type RequestPriority } from '../utils/requestCoordinator';
import {
  extractJsonObjectText,
  FARM_REAL_GIFT_BOUNDARY,
  speakerAliasesFor,
  unwrapModelReplyText,
} from '../utils/farmReplyClean';
import { TEXT_MODEL, type ChatContent } from './deepseek';

export {
  extractJsonObjectText,
  FARM_REAL_GIFT_BOUNDARY,
  speakerAliasesFor,
  unwrapModelReplyText,
};

/** 农场对话错误：区分可重试的临时故障与需要用户处理的配置问题 */
export class FarmChatError extends Error {
  readonly status?: number;
  readonly retryable: boolean;
  /** JSON 模式返回了空内容或无法解析的文本 */
  readonly empty: boolean;

  constructor(message: string, opts: { status?: number; retryable?: boolean; empty?: boolean } = {}) {
    super(message);
    this.name = 'FarmChatError';
    this.status = opts.status;
    this.retryable = opts.retryable ?? false;
    this.empty = opts.empty ?? false;
  }
}

/** 服务端临时故障：503「Service is too busy」等，退避后可重试 */
const RETRYABLE_STATUS = new Set([408, 425, 429, 500, 502, 503, 504]);

function cancelled() {
  return new FarmChatError('请求已取消');
}

function wait(ms: number, signal?: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    if (signal?.aborted) {
      reject(cancelled());
      return;
    }
    const onAbort = () => {
      clearTimeout(timer);
      reject(cancelled());
    };
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    signal?.addEventListener('abort', onAbort, { once: true });
  });
}

function httpFailure(status: number): FarmChatError {
  if (status === 401 || status === 403) {
    return new FarmChatError('API Key 无效或没有权限，请在「设置」里检查后重试', { status });
  }
  if (status === 402) {
    return new FarmChatError('DeepSeek 账户余额不足，请充值后再试', { status });
  }
  return new FarmChatError(
    `农场对话暂时不可用（${status}）`,
    { status, retryable: RETRYABLE_STATUS.has(status) },
  );
}

function messageText(msg: ChatContent): string {
  if (typeof msg.content === 'string') return msg.content;
  return msg.content.map(part => (part.type === 'text' ? part.text : '')).join('\n');
}

function appendToMessage(msg: ChatContent, suffix: string): ChatContent {
  if (typeof msg.content === 'string') {
    return { ...msg, content: msg.content + suffix };
  }
  return {
    ...msg,
    content: msg.content.map(part => (part.type === 'text' ? { ...part, text: part.text + suffix } : part)),
  };
}

/**
 * 自动判断调用方期望结构化 JSON 还是纯文本回复：
 * - 显式传 `jsonMode: false` 或系统提示词明令“不输出 JSON / 直接输出纯文本”时，走纯文本通道（不传 `response_format: json_object`），从根源避免大肥鱼等访客吐出 `{"response":"..."}`。
 */
function inferExpectsJson(
  messages: ChatContent[],
  options: { jsonMode?: boolean; validate?: (raw: string) => boolean },
): boolean {
  if (typeof options.jsonMode === 'boolean') return options.jsonMode;
  const systemText = messages
    .filter(m => m.role === 'system')
    .map(messageText)
    .join('\n');
  const explicitPlain = /(?:不|不要|别|勿|严禁)输出\s*JSON|直接输出纯文本|只输出纯文本/i.test(systemText);
  const explicitJson = /(?:严格|只)输出(?:一个)?(?:严格(?:的)?)?\s*JSON|严格\s*JSON\s*[:：]/i.test(systemText);
  if (explicitPlain && !explicitJson) return false;
  if (options.validate || explicitJson || /\bJSON\b/i.test(systemText)) return true;
  // farmChat 默认面向结构化 JSON 协议；仅显式 jsonMode:false 或系统提示要求纯文本时关闭
  return true;
}

/** 为面向玩家的互动聊天自动补齐“防口头画饼”真实送礼边界（避免重复注入，不影响报纸润色与纯居民后台闲聊） */
function augmentInteractiveSystemPrompt(
  messages: ChatContent[],
  options: { priority?: RequestPriority },
): ChatContent[] {
  if (options.priority === 'background') return messages;
  const systemIndex = messages.findIndex(m => m.role === 'system');
  if (systemIndex < 0) return messages;
  const sysText = messageText(messages[systemIndex]);
  if (
    sysText.includes('真实递出礼物') ||
    sysText.includes('真实送礼事实边界') ||
    sysText.includes('doordoor农场日报') ||
    sysText.includes('不要旁白或向玩家提问')
  ) {
    return messages;
  }
  return messages.map((msg, idx) =>
    idx === systemIndex ? appendToMessage(msg, `\n${FARM_REAL_GIFT_BOUNDARY}`) : msg,
  );
}

/** 对结构化 JSON 中的对话文本字段统一做二次解包清洗，保留所有业务字段不变 */
function sanitizeStructuredReplyJson(parsed: unknown): string {
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return JSON.stringify(parsed);
  }
  const clone: Record<string, unknown> = { ...(parsed as Record<string, unknown>) };
  if (typeof clone.reply === 'string') {
    clone.reply = unwrapModelReplyText(clone.reply);
  }
  if (Array.isArray(clone.lines)) {
    clone.lines = clone.lines.map(item => {
      if (!item || typeof item !== 'object' || Array.isArray(item)) return item;
      const lineObj = item as Record<string, unknown>;
      if (typeof lineObj.text !== 'string') return item;
      const speakerId = typeof lineObj.speaker === 'string' ? lineObj.speaker : undefined;
      const scoped = speakerAliasesFor(speakerId);
      return {
        ...lineObj,
        text: unwrapModelReplyText(lineObj.text, scoped.length ? { speakerNames: scoped } : undefined),
      };
    });
  }
  return JSON.stringify(clone);
}

/** JSON 模式被拒或没吐出内容时，降级为普通模式时追加的硬约束 */
function reinforceJson(last: ChatContent): ChatContent {
  return appendToMessage(last, '\n\n【重要】只输出一个严格的 JSON 对象，不要任何解释文字、不要代码围栏。');
}

async function requestOnce(messages: ChatContent[], apiKey: string, options: {
  signal?: AbortSignal;
  timeoutMs?: number;
  maxTokens?: number;
  temperature?: number;
  expectsJson: boolean;
  useJsonFormat: boolean;
}): Promise<string> {
  const controller = new AbortController();
  const external = options.signal;
  const abort = () => controller.abort();
  if (external?.aborted) controller.abort();
  external?.addEventListener('abort', abort, { once: true });
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, Math.max(1000, Math.min(25000, options.timeoutMs ?? 12000)));
  try {
    if (controller.signal.aborted) throw cancelled();
    const { expectsJson, useJsonFormat } = options;
    const body = expectsJson && !useJsonFormat
      ? [...messages.slice(0, -1), reinforceJson(messages[messages.length - 1])]
      : messages;
    const temperature = typeof options.temperature === 'number' && Number.isFinite(options.temperature)
      ? Math.max(0.2, Math.min(1.4, options.temperature))
      : 0.95;
    const result = await fetch('https://api.deepseek.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: TEXT_MODEL,
        messages: body,
        temperature,
        thinking: {
          type: 'disabled',
        },
        ...(expectsJson && useJsonFormat ? { response_format: { type: 'json_object' } } : {}),
        max_tokens: Math.max(64, Math.min(4096, options.maxTokens ?? 480)),
      }),
      signal: controller.signal,
    });
    if (!result.ok) throw httpFailure(result.status);
    const data = await result.json();
    const text = data?.choices?.[0]?.message?.content;
    if (typeof text !== 'string' || !text.trim()) {
      throw new FarmChatError('没有收到完整回复', { retryable: true, empty: true });
    }
    if (expectsJson) {
      const candidate = extractJsonObjectText(text);
      try {
        const parsed = JSON.parse(candidate);
        return sanitizeStructuredReplyJson(parsed);
      } catch {
        throw new FarmChatError('回复格式不完整', { retryable: true, empty: true });
      }
    }
    const cleaned = unwrapModelReplyText(text);
    if (!cleaned) {
      throw new FarmChatError('没有收到完整回复', { retryable: true, empty: true });
    }
    return cleaned;
  } catch (e) {
    if (external?.aborted) throw cancelled();
    if (e instanceof FarmChatError) throw e;
    if (e instanceof Error && e.name === 'AbortError') {
      if (external?.aborted) throw cancelled();
      throw new FarmChatError(timedOut ? '回复超时，请检查网络' : '请求已中断，请重试', { retryable: true });
    }
    const message = e instanceof Error ? e.message : '';
    if (e instanceof TypeError || /Network request failed|Failed to fetch|NetworkError/i.test(message)) {
      throw new FarmChatError('网络连接失败，请检查网络后重试', { retryable: true });
    }
    throw new FarmChatError('农场对话暂时不可用，请稍后再试');
  } finally {
    clearTimeout(timer);
    external?.removeEventListener('abort', abort);
  }
}

/** 农场对话请求。
 *
 * 默认单次请求：自动居民对话每次额度预留对应一次 HTTP 调用。
 * 玩家主动聊天可传 `retries` 开启短退避重试；JSON 模式偶发返回空内容时
 * （DeepSeek 已知问题）会降级为普通模式补一次请求，避免直接掉进本地台词。
 * 纯文本对话（如大肥鱼等访客）会自动关闭 `response_format: json_object` 并走统一解包清洗，彻底杜绝 `{"response":"..."}` 泄露。 */
async function farmChatDirect(messages: ChatContent[], apiKey: string, options: {
  signal?: AbortSignal;
  priority?: RequestPriority;
  beforeStart?: () => Promise<void>;
  timeoutMs?: number;
  maxTokens?: number;
  temperature?: number;
  /** 临时故障的额外重试次数，默认 0（自动对话用） */
  retries?: number;
  /** 显式指定是否要求 JSON 输出；留空时根据提示词自动识别纯文本或 JSON */
  jsonMode?: boolean;
  /** Optional caller schema check shares the same bounded retry budget. */
  validate?: (raw: string) => boolean;
} = {}): Promise<string> {
  if (!apiKey) throw new FarmChatError('未配置 API Key');
  const enrichedMessages = augmentInteractiveSystemPrompt(messages, options);
  const expectsJson = inferExpectsJson(enrichedMessages, options);
  let remaining = Math.max(0, Math.min(2, options.retries ?? 0));
  let useJsonFormat = expectsJson;
  const startedAt = Date.now();
  // 客户端总时长做上限，避免多次重试把「正在想…」拖到几十秒
  const budget = 26000;
  while (true) {
    if (options.signal?.aborted) throw cancelled();
    const left = budget - (Date.now() - startedAt);
    if (left < 1500) throw new FarmChatError('回复超时，请检查网络');
    try {
      const raw = await requestOnce(enrichedMessages, apiKey, {
        ...options,
        expectsJson,
        useJsonFormat,
        timeoutMs: Math.min(options.timeoutMs ?? 12000, left),
      });
      if (options.validate && !options.validate(raw)) throw new FarmChatError('回复格式不完整', { retryable: true, empty: true });
      return raw;
    } catch (e) {
      if (options.signal?.aborted) throw cancelled();
      if (!(e instanceof FarmChatError)) throw e;
      if ((Date.now() - startedAt) >= budget) throw e;
      if (remaining > 0 && expectsJson && useJsonFormat && (e.status === 400 || e.empty)) {
        // 降级为普通模式补一次，不算无效的重复请求
        useJsonFormat = false;
        remaining -= 1;
        continue;
      }
      if (!e.retryable || remaining <= 0) throw e;
      remaining -= 1;
      await wait(600 + Math.floor(Math.random() * 250), options.signal);
    }
  }
}

export function farmChat(messages: ChatContent[], apiKey: string, options: Parameters<typeof farmChatDirect>[2] = {}): Promise<string> {
  return runAIRequest(async signal => {
    if (signal.aborted) throw cancelled();
    await options.beforeStart?.();
    return farmChatDirect(messages, apiKey, { ...options, signal });
  }, { signal: options.signal, priority: options.priority, label: options.priority === 'background' ? '居民闲聊' : '农场聊天' });
}
