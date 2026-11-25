import { coursePalette } from "@/constants/palette";
import type { WidgetAccent } from "@/constants/widgetPalette";
import type { Schedule } from "@/types";
import type {
  WidgetDisplayMode,
  WidgetShape,
  WidgetSurfaceStyle,
  WidgetTheme,
} from "@/utils/courseWidget";
import { NativeModules, Platform } from "react-native";

export interface WidgetSyncExtras {
  style?: WidgetSurfaceStyle;
  mode?: WidgetDisplayMode;
}

interface CourseWidgetModule {
  sync: (payload: string) => Promise<void>;
  pin: (shape: WidgetShape) => Promise<boolean>;
  status?: () => Promise<WidgetStatus>;
  openPermissions?: () => Promise<void>;
}

export interface WidgetStatus {
  registered: number;
  installed: number;
  pinSupported: boolean;
  manufacturer: string;
  brand?: string;
  sdkInt?: number;
  isHyperOs?: boolean;
  hyperOsVersion?: string;
}

const native: CourseWidgetModule | undefined =
  Platform?.OS === "android" ? NativeModules?.CourseWidget : undefined;

export const courseWidgetsAvailable = !!native;

/**
 * Keeps extra display preferences synced even when callers (such as CourseWidgetSync)
 * invoke the 4-argument syncCourseWidgets(schedule, count, theme, accent) signature.
 */
let cachedExtras: WidgetSyncExtras = {};

export function setWidgetSyncExtras(extras: WidgetSyncExtras) {
  cachedExtras = { ...cachedExtras, ...extras };
}

export async function getCourseWidgetStatus() {
  return native?.status ? native.status() : null;
}

export async function openWidgetPermissions() {
  if (native?.openPermissions) return native.openPermissions();
  const { Linking } = await import("react-native");
  return Linking.openSettings();
}

/** 课程主题色以实际 hex 传给原生，保证组件里与课表配色完全一致 */
const courseColors = Object.fromEntries(
  Object.entries(coursePalette).map(([key, value]) => [key, value.solid]),
);

export async function syncCourseWidgets(
  schedule: Schedule | undefined,
  count: number,
  theme: WidgetTheme,
  accent: WidgetAccent,
  extras?: WidgetSyncExtras,
) {
  if (extras) {
    cachedExtras = { ...cachedExtras, ...extras };
  }
  if (!native) return;
  const payload: Record<string, unknown> = {
    schedule: schedule ?? null,
    count,
    theme,
    accent,
    colorPalette: courseColors,
  };
  if (cachedExtras.style) payload.style = cachedExtras.style;
  if (cachedExtras.mode) payload.mode = cachedExtras.mode;
  await native.sync(JSON.stringify(payload));
}

export async function pinCourseWidget(shape: WidgetShape) {
  return native ? native.pin(shape) : false;
}
