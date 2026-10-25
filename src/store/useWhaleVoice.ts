import AsyncStorage from "@react-native-async-storage/async-storage";
import { create } from "zustand";

/** 大肥鱼语音开关：助手页与桌宠共用同一份，静音后两边都不出声 */
const VOICE_KEY = "dark-study-whale-voice";

interface WhaleVoiceState {
  on: boolean;
  /** 是否已经从本地读过一次 */
  loaded: boolean;
  hydrate: () => Promise<void>;
  toggle: () => void;
}

export const useWhaleVoice = create<WhaleVoiceState>((set, get) => ({
  on: true,
  loaded: false,
  hydrate: async () => {
    if (get().loaded) return;
    try {
      const raw = await AsyncStorage.getItem(VOICE_KEY);
      set({ on: raw !== "0", loaded: true });
    } catch {
      set({ loaded: true });
    }
  },
  toggle: () => {
    const on = !get().on;
    set({ on });
    AsyncStorage.setItem(VOICE_KEY, on ? "1" : "0").catch(() => {});
  },
}));
