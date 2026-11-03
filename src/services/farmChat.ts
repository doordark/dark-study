import { TEXT_MODEL, type ChatContent } from './deepseek';

/** Single-attempt farm requests: a reserved quota slot always means one HTTP call.
 * Keep the existing general/voice chat client untouched. No automatic retries. */
export async function farmChat(messages: ChatContent[], apiKey: string, options: {
  signal?: AbortSignal;
  timeoutMs?: number;
  maxTokens?: number;
} = {}): Promise<string> {
  if (!apiKey) throw new Error('未配置 API Key');
  const controller = new AbortController();
  const abort = () => controller.abort();
  if (options.signal?.aborted) controller.abort();
  options.signal?.addEventListener('abort', abort, {
    once: true
  });
  const timer = setTimeout(abort, Math.max(1000, Math.min(20000, options.timeoutMs ?? 12000)));
  try {
    if (controller.signal.aborted) throw new Error('请求已取消');
    const result = await fetch('https://api.deepseek.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: TEXT_MODEL,
        messages,
        temperature: 0.8,
        thinking: {
          type: 'disabled'
        },
        response_format: {
          type: 'json_object'
        },
        max_tokens: Math.max(64, Math.min(1024, options.maxTokens ?? 480))
      }),
      signal: controller.signal
    });
    if (!result.ok) throw new Error(`农场对话暂不可用（${result.status}）`);
    const data = await result.json();
    const text = data?.choices?.[0]?.message?.content;
    if (typeof text !== 'string' || !text.trim()) throw new Error('没有收到完整回复');
    return text;
  } finally {
    clearTimeout(timer);
    options.signal?.removeEventListener('abort', abort);
  }
}
