import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

import { migratingStorage } from "@/utils/storage";

interface SettingsState {
  apiKey: string;
  /** 主题：跟随系统 / 浅色 / 深色 */
  appearance: "system" | "light" | "dark";
  /** 自定义背景图 uri，null = 使用默认渐变 */
  backgroundImage: string | null;
  setApiKey: (key: string) => void;
  setAppearance: (a: SettingsState["appearance"]) => void;
  setBackgroundImage: (uri: string | null) => void;
}

export const useSettings = create<SettingsState>()(
  persist(
    (set) => ({
      // 默认为空：API Key 由用户在「设置」中填写，只存本地，
      // 永远不要把真实 Key 写进代码或提交到仓库
      apiKey: "",
      appearance: "system",
      backgroundImage: null,
      setApiKey: (apiKey) => set({ apiKey: apiKey.trim() }),
      setAppearance: (appearance) => set({ appearance }),
      setBackgroundImage: (backgroundImage) => set({ backgroundImage }),
    }),
    {
      name: "dark-study-settings",
      storage: createJSONStorage(() => migratingStorage("courseflow-settings")),
    },
  ),
);
