import AsyncStorage from "@react-native-async-storage/async-storage";
import { create } from "zustand";
import { setStoredText } from "@/utils/coordinatedStorage";

/** 彩蛋与农场互动音效总开关（与大肥鱼语音开关解耦） */
export const SOUND_EFFECTS_KEY = "dark-study-sound-effects";

interface SoundEffectsState {
  on: boolean;
  loaded: boolean;
  hydrate: () => Promise<void>;
  setOn: (next: boolean) => void;
  toggle: () => void;
}

let hydration: Promise<void> | null = null;

export const useSoundEffects = create<SoundEffectsState>((set, get) => ({
  on: true,
  loaded: false,
  hydrate: async () => {
    if (get().loaded) return;
    if (!hydration) {
      hydration = (async () => {
        try {
          const raw = await AsyncStorage.getItem(SOUND_EFFECTS_KEY);
          set({ on: raw !== "0", loaded: true });
        } catch {
          set({ loaded: true });
        }
      })();
    }
    await hydration;
  },
  setOn: (on) => {
    set({ on, loaded: true });
    void setStoredText(SOUND_EFFECTS_KEY, on ? "1" : "0").catch(() => {});
  },
  toggle: () => {
    get().setOn(!get().on);
  },
}));
