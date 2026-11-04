import AsyncStorage from "@react-native-async-storage/async-storage";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import type { WidgetShape, WidgetTheme } from "@/utils/courseWidget";

interface WidgetSettings {
  shape: WidgetShape;
  theme: WidgetTheme;
  count: number;
  setShape: (shape: WidgetShape) => void;
  setTheme: (theme: WidgetTheme) => void;
  setCount: (count: number) => void;
}

export const useWidgetSettings = create<WidgetSettings>()(persist((set) => ({
  shape: "square", theme: "dark", count: 3,
  setShape: (shape) => set({ shape }),
  setTheme: (theme) => set({ theme }),
  setCount: (count) => set({ count: Math.max(1, Math.min(5, Math.round(count))) }),
}), { name: "dark-study-widget-settings", storage: createJSONStorage(() => AsyncStorage) }));
