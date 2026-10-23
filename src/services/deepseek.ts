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

export class DeepSeekError extends Error {}

/** 发起一次 chat completion，返回文本 */
export async function chat(
  messages: ChatContent[],
  apiKey: string,
  opts: {
    model?: string;
    temperature?: number;
    jsonMode?: boolean;
    timeoutMs?: number;
  } = {},
): Promise<string> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), opts.timeoutMs ?? 90_000);

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
        ...(opts.jsonMode ? { response_format: { type: "json_object" } } : {}),
      }),
      signal: controller.signal,
    });

    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      throw new DeepSeekError(
        `DeepSeek 请求失败 (${res.status}): ${detail.slice(0, 200)}`,
      );
    }

    const data = await res.json();
    const text: string | undefined = data?.choices?.[0]?.message?.content;
    if (typeof text !== "string") {
      throw new DeepSeekError("DeepSeek 返回了非预期的结构");
    }
    return text;
  } catch (e) {
    if (e instanceof Error && e.name === "AbortError") {
      throw new DeepSeekError("请求超时，请检查网络后重试");
    }
    throw e;
  } finally {
    clearTimeout(timer);
  }
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
