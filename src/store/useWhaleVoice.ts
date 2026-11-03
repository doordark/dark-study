import AsyncStorage from "@react-native-async-storage/async-storage";
import { create } from "zustand";

/** 大肥鱼语音开关：助手页与桌宠共用同一份，静音后两边都不出声 */
const VOICE_KEY = "dark-study-whale-voice";

interface WhaleVoiceState {
  on: boolean;
  /** 是否已经从本地读过一次 */
  loaded: boolean;
  engine: "auto" | "fish" | "system";
  referenceId: string;
  configure: (engine: "auto" | "fish" | "system", referenceId: string) => void;
  hydrate: () => Promise<void>;
  toggle: () => void;
}

let hydration: Promise<void> | null = null;
export const useWhaleVoice = create<WhaleVoiceState>((set, get) => ({
  on: true,
  loaded: false,
  engine: "auto",
  referenceId: "",
  configure: (engine, referenceId) => {
    referenceId = referenceId.trim();
    set({ engine, referenceId });
    AsyncStorage.setItem(`${VOICE_KEY}-config`, JSON.stringify({ engine, referenceId })).catch(() => {});
  },
  hydrate: async () => {
    if (get().loaded) return;
    if (!hydration) hydration = (async () => {
      try {
        const [raw, config] = await Promise.all([AsyncStorage.getItem(VOICE_KEY), AsyncStorage.getItem(`${VOICE_KEY}-config`)]);
        const parsed = config ? JSON.parse(config) : {};
        set({ on: raw !== "0", loaded: true,
          engine: ["fish", "system"].includes(parsed?.engine) ? parsed.engine : "auto",
          referenceId: typeof parsed?.referenceId === "string" ? parsed.referenceId : "" });
      } catch { set({ loaded: true }); }
    })();
    await hydration;
  },
  toggle: () => {
    const on = !get().on;
    set({ on });
    AsyncStorage.setItem(VOICE_KEY, on ? "1" : "0").catch(() => {});
  },
}));
