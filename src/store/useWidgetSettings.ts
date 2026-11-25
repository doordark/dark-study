import { create } from "zustand";
import { persist } from "zustand/middleware";

import type { WidgetAccent } from "@/constants/widgetPalette";
import { setWidgetSyncExtras } from "@/services/courseWidget";
import type {
  WidgetDisplayMode,
  WidgetShape,
  WidgetSurfaceStyle,
  WidgetTheme,
} from "@/utils/courseWidget";
import { coordinatedJSONStorage } from "@/utils/storage";

interface WidgetSettings {
  shape: WidgetShape;
  theme: WidgetTheme;
  accent: WidgetAccent;
  style: WidgetSurfaceStyle;
  mode: WidgetDisplayMode;
  count: number;
  setShape: (shape: WidgetShape) => void;
  setTheme: (theme: WidgetTheme) => void;
  setAccent: (accent: WidgetAccent) => void;
  setStyle: (style: WidgetSurfaceStyle) => void;
  setMode: (mode: WidgetDisplayMode) => void;
  setCount: (count: number) => void;
}

export const useWidgetSettings = create<WidgetSettings>()(
  persist(
    (set) => ({
      shape: "rectangle",
      theme: "system",
      accent: "default",
      style: "frosted",
      mode: "upcoming",
      count: 3,
      setShape: (shape) => set({ shape }),
      setTheme: (theme) => set({ theme }),
      setAccent: (accent) => set({ accent }),
      setStyle: (style) => {
        setWidgetSyncExtras({ style });
        set({ style });
      },
      setMode: (mode) => {
        setWidgetSyncExtras({ mode });
        set({ mode });
      },
      setCount: (count) =>
        set({ count: Math.max(1, Math.min(5, Math.round(count))) }),
    }),
    {
      name: "dark-study-widget-settings",
      storage: coordinatedJSONStorage("dark-study-widget-settings"),
      onRehydrateStorage: () => (state) => {
        if (state) {
          setWidgetSyncExtras({
            style: state.style ?? "frosted",
            mode: state.mode ?? "upcoming",
          });
        }
      },
    },
  ),
);
