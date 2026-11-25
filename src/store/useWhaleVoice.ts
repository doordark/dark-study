import AsyncStorage from "@react-native-async-storage/async-storage";
import { create } from "zustand";
import { setStoredText } from "@/utils/coordinatedStorage";

/** 大肥鱼语音开关：助手页与桌宠共用同一份，静音后两边都不出声 */
export const VOICE_KEY = "dark-study-whale-voice";
/** 大肥鱼语音引擎与音色配置（不含 API Key，Key 单独存在 SecureStore） */
export const VOICE_CONFIG_KEY = "dark-study-whale-voice-config";

export type WhaleVoiceEngine =
  | "auto"
  | "breezeblue"
  | "siliconflow"
  | "edge"
  | "cute_sfx"
  | "system";

export type EdgeCuteVoiceId = "zh-CN-XiaoyiNeural" | "zh-CN-XiaoshuangNeural";

export interface WhaleVoiceConfig {
  engine: WhaleVoiceEngine;
  breezeVoiceId: string;
  breezeVoiceName: string;
  siliconVoice: string;
  edgeVoice: EdgeCuteVoiceId;
  /** 云端/免Key通道不可用时是否回退到系统朗读；默认 false（回退内置软萌拟声） */
  fallbackToSystem: boolean;
}

export const DEFAULT_WHALE_VOICE_CONFIG: WhaleVoiceConfig = {
  engine: "auto",
  breezeVoiceId: "",
  breezeVoiceName: "",
  siliconVoice: "FunAudioLLM/CosyVoice2-0.5B:diana",
  edgeVoice: "zh-CN-XiaoyiNeural",
  fallbackToSystem: false,
};

const VALID_ENGINES = new Set<WhaleVoiceEngine>([
  "auto",
  "breezeblue",
  "siliconflow",
  "edge",
  "cute_sfx",
  "system",
]);

const VALID_EDGE_VOICES = new Set<EdgeCuteVoiceId>([
  "zh-CN-XiaoyiNeural",
  "zh-CN-XiaoshuangNeural",
]);

export function normalizeWhaleVoiceConfig(raw: unknown): WhaleVoiceConfig {
  if (!raw || typeof raw !== "object") return { ...DEFAULT_WHALE_VOICE_CONFIG };
  const input = raw as Partial<WhaleVoiceConfig>;
  return {
    engine:
      typeof input.engine === "string" && VALID_ENGINES.has(input.engine as WhaleVoiceEngine)
        ? (input.engine as WhaleVoiceEngine)
        : DEFAULT_WHALE_VOICE_CONFIG.engine,
    breezeVoiceId: typeof input.breezeVoiceId === "string" ? input.breezeVoiceId.trim().slice(0, 128) : "",
    breezeVoiceName: typeof input.breezeVoiceName === "string" ? input.breezeVoiceName.trim().slice(0, 64) : "",
    siliconVoice:
      typeof input.siliconVoice === "string" && input.siliconVoice.trim()
        ? input.siliconVoice.trim().slice(0, 180)
        : DEFAULT_WHALE_VOICE_CONFIG.siliconVoice,
    edgeVoice:
      typeof input.edgeVoice === "string" && VALID_EDGE_VOICES.has(input.edgeVoice as EdgeCuteVoiceId)
        ? (input.edgeVoice as EdgeCuteVoiceId)
        : DEFAULT_WHALE_VOICE_CONFIG.edgeVoice,
    fallbackToSystem: input.fallbackToSystem === true,
  };
}

interface WhaleVoiceState {
  on: boolean;
  /** 是否已经从本地读过一次 */
  loaded: boolean;
  config: WhaleVoiceConfig;
  hydrate: () => Promise<void>;
  toggle: () => void;
  setConfig: (patch: Partial<WhaleVoiceConfig>) => void;
}

let hydration: Promise<void> | null = null;

export const useWhaleVoice = create<WhaleVoiceState>((set, get) => ({
  on: true,
  loaded: false,
  config: { ...DEFAULT_WHALE_VOICE_CONFIG },
  hydrate: async () => {
    if (get().loaded) return;
    if (!hydration) {
      hydration = (async () => {
        try {
          const [rawOn, rawConfig] = await Promise.all([
            AsyncStorage.getItem(VOICE_KEY),
            AsyncStorage.getItem(VOICE_CONFIG_KEY),
          ]);
          let parsed: unknown = null;
          if (rawConfig) {
            try {
              parsed = JSON.parse(rawConfig);
            } catch {
              parsed = null;
            }
          }
          set({
            on: rawOn !== "0",
            config: normalizeWhaleVoiceConfig(parsed),
            loaded: true,
          });
        } catch {
          set({ loaded: true });
        }
      })();
    }
    await hydration;
  },
  toggle: () => {
    const on = !get().on;
    set({ on });
    void setStoredText(VOICE_KEY, on ? "1" : "0").catch(() => {});
  },
  setConfig: (patch) => {
    const next = normalizeWhaleVoiceConfig({ ...get().config, ...patch });
    set({ config: next, loaded: true });
    void setStoredText(VOICE_CONFIG_KEY, JSON.stringify(next)).catch(() => {});
  },
}));
