import * as Notifications from "expo-notifications";
import { Platform } from "react-native";
import type { Schedule } from "@/types";
import { TASK_TYPES, type CourseTask } from "@/utils/courseTasks";
import { addDays, mondayOf, parseIsoDate, toIsoDate } from "@/utils/time";

const CHANNEL = "course-reminders";
const MARKER = "dark-study-course-reminder";
const TASK_CHANNEL = "course-task-reminders";
const TASK_MARKER = "dark-study-course-task";

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

async function prepareTaskChannel() {
  if (Platform.OS === "android") await Notifications.setNotificationChannelAsync(TASK_CHANNEL, {
    // eslint-disable-next-line import/namespace
    name: "课程待办提醒", importance: Notifications.AndroidImportance.HIGH,
    sound: "default",
  });
}

export async function requestCourseTaskPermission(): Promise<boolean> {
  if (Platform.OS === "web") return false;
  await prepareTaskChannel();
  const permission = await Notifications.getPermissionsAsync();
  return permission.granted || (permission.canAskAgain && (await Notifications.requestPermissionsAsync()).granted);
}

export function buildTaskReminders(tasks: readonly CourseTask[], now = new Date()) {
  return tasks.flatMap(task => {
    const at = task.dueAt - task.reminder * 60000;
    if (task.completedAt !== undefined || !task.reminder || at <= now.getTime()) return [];
    return [{
      date: new Date(at),
      title: `${TASK_TYPES[task.type]} · ${task.title}`,
      body: `${task.course ? task.course.courseName + " · " : ""}还有 ${task.reminder === 1440 ? "1 天" : `${task.reminder} 分钟`}到期`,
    }];
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
export function syncCourseReminders(schedule: Schedule | undefined, enabled: boolean, minutes: number, count: number, tasks: readonly CourseTask[] = []) {
  if (Platform.OS === "web") return;
  const current = ++generation;
  queue = queue.catch(() => {}).then(async () => {
    if (current !== generation) return;
    const existing = await Notifications.getAllScheduledNotificationsAsync();
    const allowed = (await Notifications.getPermissionsAsync()).granted;
    const course = allowed && enabled && schedule ? buildCourseReminders(schedule, minutes, count) : [];
    const task = allowed ? buildTaskReminders(tasks) : [];
    const reminders = [...course.map(item => ({ ...item, kind: MARKER, channelId: CHANNEL })),
      ...task.map(item => ({ ...item, kind: TASK_MARKER, channelId: TASK_CHANNEL }))]
      .sort((a, b) => a.date.getTime() - b.date.getTime());
    const desired = new Map<string, typeof reminders[number]>();
    for (const item of reminders) {
      if (desired.size >= (Platform.OS === "ios" ? 60 : 450)) break;
      desired.set(JSON.stringify([item.kind, item.date.getTime(), item.title, item.body]), item);
    }
    if (current !== generation) return;
    for (const scheduled of existing) {
      const data = scheduled.content.data;
      if (data?.kind !== MARKER && data?.kind !== TASK_MARKER) continue;
      if (typeof data.key === "string" && desired.delete(data.key)) continue;
      await Notifications.cancelScheduledNotificationAsync(scheduled.identifier);
    }
    if (course.length && desired.size) await prepareReminderChannel();
    if (task.length && desired.size) await prepareTaskChannel();
    for (const [key, item] of desired) {
      if (current !== generation) return;
      await Notifications.scheduleNotificationAsync({
        content: { title: item.title, body: item.body, sound: "default", data: { kind: item.kind, key } },
        trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: item.date, channelId: item.channelId },
      });
    }
  }).catch((error) => { console.warn("课程提醒安排失败", error); });
  return queue;
}
