import * as Notifications from "expo-notifications";
import { Platform } from "react-native";
import type { Schedule } from "@/types";
import { addDays, mondayOf, parseIsoDate, toIsoDate } from "@/utils/time";

const CHANNEL = "course-reminders";
const MARKER = "dark-study-course-reminder";
const LEGACY_TASK_MARKER = "dark-study-course-task";

if (Platform.OS !== "web") {
  Notifications.setNotificationHandler({ handleNotification: async () => ({
    shouldShowBanner: true, shouldShowList: true, shouldPlaySound: true, shouldSetBadge: false,
  }) });
}

export async function prepareReminderChannel() {
  if (Platform.OS === "android") await Notifications.setNotificationChannelAsync(CHANNEL, {
    // Expo exports this enum at runtime; ESLint cannot resolve the package barrel.
    // eslint-disable-next-line import/namespace
    name: "上课提醒", importance: Notifications.AndroidImportance.HIGH,
    sound: "default", vibrationPattern: [0, 250, 150, 250],
  });
}

export function buildCourseReminders(schedule: Schedule, minutes: number, count: number, now = new Date()) {
  minutes = Number.isFinite(minutes) ? Math.max(1, Math.min(60, Math.round(minutes))) : 15;
  count = Number.isFinite(count) ? Math.max(1, Math.min(3, minutes, Math.round(count))) : 1;
  const result: { date: Date; title: string; body: string }[] = [];
  const firstMonday = mondayOf(parseIsoDate(schedule.startDate));
  if (!Number.isFinite(firstMonday.getTime())) return result;
  for (const course of schedule.courses) {
    const time = course.startTime ?? schedule.periods.find((p) => p.index === course.startPeriod)?.startTime;
    const match = time?.match(/^(\d{1,2}):(\d{2})$/);
    if (!match || +match[1] > 23 || +match[2] > 59 || !Number.isInteger(course.weekday) || course.weekday < 1 || course.weekday > 7) continue;
    for (const week of new Set(course.weeks)) {
      if (!Number.isInteger(week) || week < 1 || week > schedule.totalWeeks) continue;
      const start = addDays(firstMonday, (week - 1) * 7 + course.weekday - 1);
      const day = toIsoDate(start);
      if (day < schedule.startDate || day > schedule.endDate) continue;
      start.setHours(+match[1], +match[2], 0, 0);
      for (let i = 0; i < count; i++) {
        const offset = Math.max(1, Math.round(minutes * (count - i) / count));
        const date = new Date(start.getTime() - offset * 60000);
        if (date <= now) continue;
        result.push({ date, title: `${course.name} 即将上课`, body: `${offset} 分钟后 · ${time}${course.classroom ? ` · ${course.classroom}` : ""}` });
      }
    }
  }
  return result.sort((a, b) => a.date.getTime() - b.date.getTime());
}

export interface CourseReminderSummary {
  scheduledCount: number;
  totalPlanned: number;
  lastDate: Date | null;
  capped: boolean;
}

/** 汇总当前已排程的上课提醒数量与覆盖截止日期 */
export async function getCourseReminderSummary(
  schedule: Schedule | undefined,
  minutes: number,
  count: number,
): Promise<CourseReminderSummary> {
  const totalPlanned = schedule ? buildCourseReminders(schedule, minutes, count).length : 0;
  if (Platform.OS === "web") {
    return { scheduledCount: 0, totalPlanned, lastDate: null, capped: false };
  }
  const existing = await Notifications.getAllScheduledNotificationsAsync();
  const mine = existing.filter((item) => item.content.data?.kind === MARKER);
  let lastMs = 0;
  for (const item of mine) {
    const trigger = item.trigger as { value?: number; date?: number } | null;
    const rawKey = typeof item.content.data?.key === "string" ? item.content.data.key : null;
    let ms = typeof trigger?.value === "number" ? trigger.value : typeof trigger?.date === "number" ? trigger.date : 0;
    if (!ms && rawKey) {
      try {
        const parsed = JSON.parse(rawKey);
        if (Array.isArray(parsed) && typeof parsed[1] === "number") ms = parsed[1];
      } catch {
        // ignore
      }
    }
    if (ms > lastMs) lastMs = ms;
  }
  const limit = Platform.OS === "ios" ? 60 : 450;
  return {
    scheduledCount: mine.length,
    totalPlanned,
    lastDate: lastMs > 0 ? new Date(lastMs) : null,
    capped: totalPlanned > limit,
  };
}

/** 发送一条 2 秒后触发的测试通知，帮助用户确认横幅、提示音与振动正常 */
export async function sendTestCourseReminder(minutes: number): Promise<void> {
  if (Platform.OS === "web") throw new Error("网页端不支持系统本地通知");
  await prepareReminderChannel();
  let perm = await Notifications.getPermissionsAsync();
  if (!perm.granted && perm.canAskAgain) perm = await Notifications.requestPermissionsAsync();
  if (!perm.granted) throw new Error("通知权限未开启，请先在系统设置中允许通知");
  await Notifications.scheduleNotificationAsync({
    content: {
      title: "Dark Study 测试提醒",
      body: `上课提醒工作正常 · 当前设为提前 ${minutes} 分钟通知`,
      sound: "default",
      data: { kind: "dark-study-course-reminder-test" },
    },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.DATE,
      date: new Date(Date.now() + 1500),
      channelId: CHANNEL,
    },
  });
}

let queue = Promise.resolve();
let generation = 0;
export function syncCourseReminders(schedule: Schedule | undefined, enabled: boolean, minutes: number, count: number) {
  if (Platform.OS === "web") return;
  const current = ++generation;
  queue = queue.catch(() => {}).then(async () => {
    if (current !== generation) return;
    const existing = await Notifications.getAllScheduledNotificationsAsync();
    const allowed = (await Notifications.getPermissionsAsync()).granted;
    const reminders = allowed && enabled && schedule ? buildCourseReminders(schedule, minutes, count) : [];
    const desired = new Map<string, typeof reminders[number]>();
    for (const item of reminders) {
      if (desired.size >= (Platform.OS === "ios" ? 60 : 450)) break;
      desired.set(JSON.stringify([MARKER, item.date.getTime(), item.title, item.body]), item);
    }
    if (current !== generation) return;
    for (const scheduled of existing) {
      const data = scheduled.content.data;
      if (data?.kind !== MARKER && data?.kind !== LEGACY_TASK_MARKER) continue;
      if (data.kind === MARKER && typeof data.key === "string" && desired.delete(data.key)) continue;
      await Notifications.cancelScheduledNotificationAsync(scheduled.identifier);
    }
    if (desired.size) await prepareReminderChannel();
    for (const [key, item] of desired) {
      if (current !== generation) return;
      await Notifications.scheduleNotificationAsync({
        content: { title: item.title, body: item.body, sound: "default", data: { kind: MARKER, key } },
        trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: item.date, channelId: CHANNEL },
      });
    }
  }).catch((error) => { console.warn("课程提醒安排失败", error); });
  return queue;
}
