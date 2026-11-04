import { TEXT_MODEL, type ChatContent } from './deepseek';

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

/** JSON 模式被拒或没吐出内容时，降级为普通模式时追加的硬约束 */
function reinforceJson(last: ChatContent): ChatContent {
  const suffix = '\n\n【重要】只输出一个严格的 JSON 对象，不要任何解释文字、不要代码围栏。';
  if (typeof last.content === 'string') {
    return { ...last, content: last.content + suffix };
  }
  return {
    ...last,
    content: last.content.map(part => part.type === 'text' ? { ...part, text: part.text + suffix } : part),
  };
}

async function requestOnce(messages: ChatContent[], apiKey: string, options: {
  signal?: AbortSignal;
  timeoutMs?: number;
  maxTokens?: number;
  jsonMode?: boolean;
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
  }, Math.max(1000, Math.min(20000, options.timeoutMs ?? 12000)));
  try {
    if (controller.signal.aborted) throw cancelled();
    const jsonMode = options.jsonMode ?? true;
    const body = jsonMode
      ? messages
      : [...messages.slice(0, -1), reinforceJson(messages[messages.length - 1])];
    const result = await fetch('https://api.deepseek.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: TEXT_MODEL,
        messages: body,
        temperature: 0.8,
        thinking: {
          type: 'disabled'
        },
        ...(jsonMode ? { response_format: { type: 'json_object' } } : {}),
        max_tokens: Math.max(64, Math.min(1024, options.maxTokens ?? 480))
      }),
      signal: controller.signal
    });
    if (!result.ok) throw httpFailure(result.status);
    const data = await result.json();
    const text = data?.choices?.[0]?.message?.content;
    if (typeof text !== 'string' || !text.trim()) {
      throw new FarmChatError('没有收到完整回复', { retryable: true, empty: true });
    }
    if (jsonMode) {
      try {
        JSON.parse(text);
      } catch {
        throw new FarmChatError('回复格式不完整', { retryable: true, empty: true });
      }
    }
    return text;
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
 * （DeepSeek 已知问题）会降级为普通模式补一次请求，避免直接掉进本地台词。 */
export async function farmChat(messages: ChatContent[], apiKey: string, options: {
  signal?: AbortSignal;
  timeoutMs?: number;
  maxTokens?: number;
  /** 临时故障的额外重试次数，默认 0（自动对话用） */
  retries?: number;
  /** 默认使用 JSON 输出模式；降级重试时会自动切到普通模式 */
  jsonMode?: boolean;
} = {}): Promise<string> {
  if (!apiKey) throw new FarmChatError('未配置 API Key');
  let remaining = Math.max(0, Math.min(2, options.retries ?? 0));
  let jsonMode = options.jsonMode ?? true;
  const startedAt = Date.now();
  // 客户端总时长做上限，避免多次重试把「正在想…」拖到几十秒
  const budget = 26000;
  while (true) {
    if (options.signal?.aborted) throw cancelled();
    const left = budget - (Date.now() - startedAt);
    if (left < 1500) throw new FarmChatError('回复超时，请检查网络');
    try {
      return await requestOnce(messages, apiKey, {
        ...options,
        jsonMode,
        timeoutMs: Math.min(options.timeoutMs ?? 12000, left),
      });
    } catch (e) {
      if (options.signal?.aborted) throw cancelled();
      if (!(e instanceof FarmChatError)) throw e;
      if ((Date.now() - startedAt) >= budget) throw e;
      if (remaining > 0 && jsonMode && (e.status === 400 || e.empty)) {
        // 降级为普通模式补一次，不算无效的重复请求
        jsonMode = false;
        remaining -= 1;
        continue;
      }
      if (!e.retryable || remaining <= 0) throw e;
      remaining -= 1;
      await wait(600 + Math.floor(Math.random() * 250), options.signal);
    }
  }
}
