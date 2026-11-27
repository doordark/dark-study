export type AiProviderId =
  | "deepseek"
  | "siliconflow"
  | "qwen"
  | "gemini"
  | "openrouter"
  | "ollama"
  | "custom";

export interface AiProviderPreset {
  id: AiProviderId;
  label: string;
  hint: string;
  baseUrl: string;
  defaultTextModel: string;
  defaultVisionModel: string;
  supportsDeepSeekServerTools: boolean;
  requiresApiKey: boolean;
}

export interface AiRuntimeSettingsInput {
  aiProvider?: AiProviderId | string;
  aiBaseUrl?: string;
  aiTextModel?: string;
  aiVisionModel?: string;
}

export interface AiRuntimeConfig {
  provider: AiProviderId;
  baseUrl: string;
  textModel: string;
  visionModel: string;
  supportsServerTools: boolean;
  requiresApiKey: boolean;
}

export const DEFAULT_AI_PROVIDER: AiProviderId = "deepseek";

export const AI_PROVIDER_PRESETS: readonly AiProviderPreset[] = [
  {
    id: "deepseek",
    label: "DeepSeek 官方",
    hint: "DeepSeek 官方（默认 deepseek-flash，支持联网搜索、深度思考与识图；旗舰推理可选 deepseek-v4-pro）",
    baseUrl: "https://api.deepseek.com/v1",
    defaultTextModel: "deepseek-flash",
    defaultVisionModel: "deepseek-flash",
    supportsDeepSeekServerTools: true,
    requiresApiKey: true,
  },
  {
    id: "siliconflow",
    label: "硅基流动",
    hint: "国内直连稳定，推荐 Qwen/Qwen3-32B、deepseek-ai/DeepSeek-V4.1-Flash 等最新模型",
    baseUrl: "https://api.siliconflow.cn/v1",
    defaultTextModel: "Qwen/Qwen3-32B",
    defaultVisionModel: "Qwen/Qwen3-VL-30B-A3B-Instruct",
    supportsDeepSeekServerTools: false,
    requiresApiKey: true,
  },
  {
    id: "qwen",
    label: "通义千问 DashScope",
    hint: "阿里云百炼 OpenAI 兼容接口（推荐 qwen3.8-flash / qwen3.8-max，视觉 qwen3-vl-plus）",
    baseUrl: "https://dashscope.aliyuncs.com/compatible-mode/v1",
    defaultTextModel: "qwen3.8-flash",
    defaultVisionModel: "qwen3-vl-plus",
    supportsDeepSeekServerTools: false,
    requiresApiKey: true,
  },
  {
    id: "gemini",
    label: "Gemini (OpenAI 兼容)",
    hint: "Google Gemini 原生多模态（最新稳定版 gemini-3.8-flash，旗舰可选 gemini-4-neon / gemini-4-hydrogen），需可访问 Google 网络",
    baseUrl: "https://generativelanguage.googleapis.com/v1beta/openai",
    defaultTextModel: "gemini-3.8-flash",
    defaultVisionModel: "gemini-3.8-flash",
    supportsDeepSeekServerTools: false,
    requiresApiKey: true,
  },
  {
    id: "openrouter",
    label: "OpenRouter",
    hint: "聚合全球最新主流模型（默认 google/gemini-3.8-flash），统一 OpenAI 协议调用",
    baseUrl: "https://openrouter.ai/api/v1",
    defaultTextModel: "google/gemini-3.8-flash",
    defaultVisionModel: "google/gemini-3.8-flash",
    supportsDeepSeekServerTools: false,
    requiresApiKey: true,
  },
  {
    id: "ollama",
    label: "本地 Ollama",
    hint: "本机或局域网私有模型（推荐 qwen3:8b / qwen3-vl:8b），无需 API Key",
    baseUrl: "http://127.0.0.1:11434/v1",
    defaultTextModel: "qwen3:8b",
    defaultVisionModel: "qwen3-vl:8b",
    supportsDeepSeekServerTools: false,
    requiresApiKey: false,
  },
  {
    id: "custom",
    label: "自定义 OpenAI 兼容",
    hint: "手动填写任意 OpenAI 协议中转或自建网关地址",
    baseUrl: "",
    defaultTextModel: "",
    defaultVisionModel: "",
    supportsDeepSeekServerTools: false,
    requiresApiKey: true,
  },
] as const;

const PRESET_MAP: Record<AiProviderId, AiProviderPreset> = Object.fromEntries(
  AI_PROVIDER_PRESETS.map((preset) => [preset.id, preset]),
) as Record<AiProviderId, AiProviderPreset>;

const MAX_BASE_URL_LENGTH = 512;
const MAX_MODEL_NAME_LENGTH = 160;

export function isAiProviderId(value: unknown): value is AiProviderId {
  return typeof value === "string" && Object.hasOwn(PRESET_MAP, value);
}

export function getAiProviderPreset(id?: unknown): AiProviderPreset {
  return isAiProviderId(id) ? PRESET_MAP[id] : PRESET_MAP[DEFAULT_AI_PROVIDER];
}

/** 规范化接口基地址：去首尾空白与末尾斜杠，仅允许合法 http/https 地址，否则返回空字符串 */
export function normalizeBaseUrl(url: string): string {
  if (typeof url !== "string") return "";
  const trimmed = url.trim();
  if (!trimmed || trimmed.length > MAX_BASE_URL_LENGTH) return "";
  if (/[\s\u0000-\u001f\u007f]/.test(trimmed)) return "";
  if (!/^https?:\/\//i.test(trimmed)) return "";
  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return "";
    if (!parsed.hostname) return "";
  } catch {
    return "";
  }
  return trimmed.replace(/\/+$/, "");
}

/** 清理模型名称：去首尾空白与控制字符，限制长度 */
export function sanitizeAiModelName(value: unknown): string {
  if (typeof value !== "string") return "";
  return value.replace(/[\r\n\t\u0000-\u001f\u007f]/g, "").trim().slice(0, MAX_MODEL_NAME_LENGTH);
}

/** 根据当前设置解析生效的 AI 服务商、接口地址、文本/视觉模型与能力标记 */
export function resolveAiRuntimeConfig(
  settings?: Partial<AiRuntimeSettingsInput> | null,
): AiRuntimeConfig {
  const preset = getAiProviderPreset(settings?.aiProvider);
  const customBaseUrl =
    typeof settings?.aiBaseUrl === "string"
      ? normalizeBaseUrl(settings.aiBaseUrl)
      : "";
  const customTextModel = sanitizeAiModelName(settings?.aiTextModel);
  const customVisionModel = sanitizeAiModelName(settings?.aiVisionModel);

  const baseUrl = customBaseUrl || preset.baseUrl;
  const textModel = customTextModel || preset.defaultTextModel;
  const visionModel = customVisionModel || preset.defaultVisionModel || textModel;

  return {
    provider: preset.id,
    baseUrl,
    textModel,
    visionModel,
    supportsServerTools: preset.supportsDeepSeekServerTools,
    requiresApiKey: preset.requiresApiKey,
  };
}
