import * as Notifications from "expo-notifications";
import { Platform } from "react-native";
import type { Schedule } from "@/types";
import { addDays, mondayOf, parseIsoDate, toIsoDate } from "@/utils/time";

const CHANNEL = "course-reminders";
const MARKER = "dark-study-course-reminder";

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

let queue = Promise.resolve();
let generation = 0;
export function syncCourseReminders(schedule: Schedule | undefined, enabled: boolean, minutes: number, count: number) {
  if (Platform.OS === "web") return;
  const current = ++generation;
  queue = queue.catch(() => {}).then(async () => {
    if (current !== generation) return;
    const existing = await Notifications.getAllScheduledNotificationsAsync();
    await Promise.all(existing.filter((n) => n.content.data?.kind === MARKER).map((n) => Notifications.cancelScheduledNotificationAsync(n.identifier)));
    if (!enabled || !schedule || !(await Notifications.getPermissionsAsync()).granted) return;
    await prepareReminderChannel();
    const reminders = buildCourseReminders(schedule, minutes, count);
    // Keep headroom under platform limits; opening the app replenishes upcoming reminders.
    for (const item of reminders.slice(0, Platform.OS === "ios" ? 60 : 450)) {
      if (current !== generation) return;
      await Notifications.scheduleNotificationAsync({
        content: { title: item.title, body: item.body, sound: "default", data: { kind: MARKER } },
        trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: item.date, channelId: CHANNEL },
      });
    }
  }).catch((error) => { console.warn("课程提醒安排失败", error); });
}
