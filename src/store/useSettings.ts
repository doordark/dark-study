import { create } from "zustand";
import { persist } from "zustand/middleware";

import {
  resolveEffect,
  resolveTint,
  type BackgroundEffect,
  type BackgroundTint,
} from "@/constants/backgrounds";
import { coordinatedJSONStorage } from "@/utils/storage";
import type { RenderQuality } from '@/utils/renderQuality';
import type { GpaScaleId } from "@/types";
import { isGpaScaleId } from "@/utils/grades";

interface SettingsState {
  renderQuality: RenderQuality;
  setRenderQuality: (quality: RenderQuality) => void;
  gpaScale: GpaScaleId;
  setGpaScale: (scale: GpaScaleId) => void;
  apiKey: string;
  farmWebSearch: boolean;
  setFarmWebSearch: (enabled: boolean) => void;
  reminderEnabled: boolean;
  reminderMinutes: number;
  reminderCount: number;
  setReminder: (patch: Partial<Pick<SettingsState, "reminderEnabled" | "reminderMinutes" | "reminderCount">>) => void;
  /** 主题：跟随系统 / 浅色 / 深色 */
  appearance: "system" | "light" | "dark";
  /** 卡片材质：扁平实心 / 玻璃（毛玻璃模糊） */
  material: "flat" | "glass";
  /** 自定义背景图 uri，null = 使用默认渐变 */
  backgroundImage: string | null;
  /** 自定义背景图遮罩强度（0 ~ 0.65），提高文字对比度 */
  backgroundDim: number;
  /** 默认背景的色调（大肥鱼可代改） */
  backgroundTint: BackgroundTint;
  /** 默认背景的光效 */
  backgroundEffect: BackgroundEffect;
  /** 课表默认/上次使用的视图模式 */
  defaultScheduleView: "day" | "week";
  /** 周视图是否显示周六周日 */
  showWeekend: boolean;
  /** 周视图是否半透明展示非本周课程 */
  showOtherWeeks: boolean;
  /** 周视图是否按节次等高紧凑排布（折叠大段午休/晚休空白） */
  compactWeekGrid: boolean;
  /** 大肥鱼当前的召唤口令（大爹可代改） */
  whalePhrase: string;
  setApiKey: (key: string) => void;
  setAppearance: (a: SettingsState["appearance"]) => void;
  setMaterial: (m: SettingsState["material"]) => void;
  setBackgroundImage: (uri: string | null) => void;
  setBackgroundDim: (dim: number) => void;
  setBackgroundTint: (t: BackgroundTint) => void;
  setBackgroundEffect: (e: BackgroundEffect) => void;
  setDefaultScheduleView: (v: "day" | "week") => void;
  setShowWeekend: (v: boolean) => void;
  setShowOtherWeeks: (v: boolean) => void;
  setCompactWeekGrid: (v: boolean) => void;
  setWhalePhrase: (p: string) => void;
}

export const useSettings = create<SettingsState>()(
  persist(
    (set) => ({
      renderQuality: 'standard',
      setRenderQuality: (renderQuality) => set({ renderQuality }),
      gpaScale: "five",
      setGpaScale: (scale) =>
        set({ gpaScale: isGpaScaleId(scale) ? scale : "five" }),
      // 默认为空：API Key 由用户在「设置」中填写，只存本地，
      // 永远不要把真实 Key 写进代码或提交到仓库
      apiKey: "",
      farmWebSearch: false,
      setFarmWebSearch: (farmWebSearch) => set({ farmWebSearch }),
      reminderEnabled: false,
      reminderMinutes: 15,
      reminderCount: 1,
      setReminder: (patch) => set(patch),
      appearance: "system",
      material: "flat",
      backgroundImage: null,
      backgroundDim: 0.18,
      backgroundTint: "sky",
      backgroundEffect: "aurora",
      defaultScheduleView: "day",
      showWeekend: true,
      showOtherWeeks: false,
      compactWeekGrid: false,
      whalePhrase: "大爹来了",
      setApiKey: (apiKey) => set({ apiKey: apiKey.trim() }),
      setAppearance: (appearance) => set({ appearance }),
      setMaterial: (material) => set({ material }),
      setBackgroundImage: (backgroundImage) => set({ backgroundImage }),
      setBackgroundDim: (dim) =>
        set({
          backgroundDim: Number.isFinite(dim)
            ? Math.max(0, Math.min(0.65, Math.round(dim * 100) / 100))
            : 0.18,
        }),
      setBackgroundTint: (backgroundTint) =>
        set({ backgroundTint: resolveTint(backgroundTint) }),
      setBackgroundEffect: (backgroundEffect) =>
        set({ backgroundEffect: resolveEffect(backgroundEffect) }),
      setDefaultScheduleView: (defaultScheduleView) =>
        set({ defaultScheduleView }),
      setShowWeekend: (showWeekend) => set({ showWeekend }),
      setShowOtherWeeks: (showOtherWeeks) => set({ showOtherWeeks }),
      setCompactWeekGrid: (compactWeekGrid) => set({ compactWeekGrid }),
      setWhalePhrase: (whalePhrase) => {
        const phrase = whalePhrase.replace(/[\s「」"“”'']/g, "").slice(0, 12);
        if (phrase.length >= 2) set({ whalePhrase: phrase });
      },
    }),
    {
      name: "dark-study-settings",
      storage: coordinatedJSONStorage("courseflow-settings"),
    },
  ),
);
