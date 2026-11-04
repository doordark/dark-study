import { NativeModules, Platform } from "react-native";
import type { Schedule } from "@/types";
import type { WidgetShape, WidgetTheme } from "@/utils/courseWidget";

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

export async function syncCourseWidgets(schedule: Schedule | undefined, count: number, theme: WidgetTheme) {
  if (native) await native.sync(JSON.stringify({ schedule: schedule ?? null, count, theme }));
}

export async function pinCourseWidget(shape: WidgetShape) {
  return native ? native.pin(shape) : false;
}
