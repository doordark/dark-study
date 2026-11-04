import { coursePalette } from "@/constants/palette";
import type { WidgetAccent } from "@/constants/widgetPalette";
import type { Schedule } from "@/types";
import type { WidgetShape, WidgetTheme } from "@/utils/courseWidget";
import { NativeModules, Platform } from "react-native";

interface CourseWidgetModule {
  sync: (payload: string) => Promise<void>;
  pin: (shape: WidgetShape) => Promise<boolean>;
  status?: () => Promise<WidgetStatus>;
  openPermissions?: () => Promise<void>;
}
export interface WidgetStatus { registered: number; installed: number; pinSupported: boolean; manufacturer: string }
export async function getCourseWidgetStatus() { return native?.status ? native.status() : null; }
export async function openWidgetPermissions() {
  if (native?.openPermissions) return native.openPermissions();
  const { Linking } = await import("react-native");
  return Linking.openSettings();
}
const native: CourseWidgetModule | undefined = Platform.OS === "android" ? NativeModules.CourseWidget : undefined;
export const courseWidgetsAvailable = !!native;

/** 课程主题色以实际 hex 传给原生，保证组件里与课表配色完全一致 */
const courseColors = Object.fromEntries(
  Object.entries(coursePalette).map(([key, value]) => [key, value.solid]),
);

export async function syncCourseWidgets(schedule: Schedule | undefined, count: number, theme: WidgetTheme, accent: WidgetAccent) {
  if (native) await native.sync(JSON.stringify({ schedule: schedule ?? null, count, theme, accent, colorPalette: courseColors }));
}

export async function pinCourseWidget(shape: WidgetShape) {
  return native ? native.pin(shape) : false;
}
