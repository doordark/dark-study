import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

import {
  resolveEffect,
  resolveTint,
  type BackgroundEffect,
  type BackgroundTint,
} from "@/constants/backgrounds";
import { migratingStorage } from "@/utils/storage";

interface SettingsState {
  apiKey: string;
  /** 主题：跟随系统 / 浅色 / 深色 */
  appearance: "system" | "light" | "dark";
  /** 自定义背景图 uri，null = 使用默认渐变 */
  backgroundImage: string | null;
  /** 默认背景的色调（大肥鱼可代改） */
  backgroundTint: BackgroundTint;
  /** 默认背景的光效 */
  backgroundEffect: BackgroundEffect;
  /** 大肥鱼当前的召唤口令（大爹可代改） */
  whalePhrase: string;
  setApiKey: (key: string) => void;
  setAppearance: (a: SettingsState["appearance"]) => void;
  setBackgroundImage: (uri: string | null) => void;
  setBackgroundTint: (t: BackgroundTint) => void;
  setBackgroundEffect: (e: BackgroundEffect) => void;
  setWhalePhrase: (p: string) => void;
}

export const useSettings = create<SettingsState>()(
  persist(
    (set) => ({
      // 默认为空：API Key 由用户在「设置」中填写，只存本地，
      // 永远不要把真实 Key 写进代码或提交到仓库
      apiKey: "",
      appearance: "system",
      backgroundImage: null,
      backgroundTint: "sky",
      backgroundEffect: "aurora",
      whalePhrase: "大爹来了",
      setApiKey: (apiKey) => set({ apiKey: apiKey.trim() }),
      setAppearance: (appearance) => set({ appearance }),
      setBackgroundImage: (backgroundImage) => set({ backgroundImage }),
      setBackgroundTint: (backgroundTint) =>
        set({ backgroundTint: resolveTint(backgroundTint) }),
      setBackgroundEffect: (backgroundEffect) =>
        set({ backgroundEffect: resolveEffect(backgroundEffect) }),
      setWhalePhrase: (whalePhrase) => {
        const phrase = whalePhrase.replace(/[\s「」"“”'']/g, "").slice(0, 12);
        if (phrase.length >= 2) set({ whalePhrase: phrase });
      },
    }),
    {
      name: "dark-study-settings",
      storage: createJSONStorage(() => migratingStorage("courseflow-settings")),
    },
  ),
);
