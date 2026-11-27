import * as Notifications from "expo-notifications";
import { Platform } from "react-native";
import type { Schedule } from "@/types";
import { EXAM_MODES, type CourseTask } from "@/utils/courseTasks";
import { addDays, mondayOf, parseIsoDate, toIsoDate } from "@/utils/time";

const CHANNEL = "course-reminders";
const MARKER = "dark-study-course-reminder";
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

/** 请求系统通知权限（供任务/提醒保存时静默确保权限就绪） */
export async function ensureReminderPermission(): Promise<boolean> {
  if (Platform.OS === "web") return false;
  await prepareReminderChannel();
  let perm = await Notifications.getPermissionsAsync();
  if (!perm.granted && perm.canAskAgain) perm = await Notifications.requestPermissionsAsync();
  return perm.granted;
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

export interface CourseTaskReminderItem {
  taskId: string;
  date: Date;
  title: string;
  body: string;
}

function formatTaskDueTime(dueAt: number): string {
  const d = new Date(dueAt);
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  const hh = String(d.getHours()).padStart(2, "0");
  const min = String(d.getMinutes()).padStart(2, "0");
  return `${mm}/${dd} ${hh}:${min}`;
}

function formatReminderLead(minutes: number): string {
  if (minutes >= 1440) return `${Math.round(minutes / 1440)} 天`;
  if (minutes >= 60) return `${Math.round(minutes / 60)} 小时`;
  return `${minutes} 分钟`;
}

/** 为未完成且开启提前提醒的作业/考试/复习待办生成本地通知计划 */
export function buildCourseTaskReminders(
  tasks: readonly CourseTask[],
  now = new Date(),
): CourseTaskReminderItem[] {
  const result: CourseTaskReminderItem[] = [];
  const nowMs = now.getTime();
  for (const task of tasks) {
    if (task.completedAt) continue;
    if (!Number.isFinite(task.dueAt) || !Number.isFinite(task.reminder) || task.reminder <= 0) continue;
    const triggerMs = task.dueAt - task.reminder * 60000;
    if (!Number.isFinite(triggerMs) || triggerMs <= nowMs) continue;
    const prefix =
      task.type === "exam"
        ? "[考试倒计时]"
        : task.type === "homework"
          ? "[作业提醒]"
          : "[复习提醒]";
    const parts: string[] = [
      `${formatTaskDueTime(task.dueAt)} ${task.type === "exam" ? "开考" : "截止"}`,
      `提前 ${formatReminderLead(task.reminder)}`,
    ];
    if (task.course?.courseName) parts.push(task.course.courseName);
    if (task.location) parts.push(`考场 ${task.location}`);
    if (task.seat) parts.push(`座位 ${task.seat}`);
    if (task.examMode) parts.push(EXAM_MODES[task.examMode]);
    result.push({
      taskId: task.id,
      date: new Date(triggerMs),
      title: `${prefix} ${task.title}`,
      body: parts.join(" · "),
    });
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

interface PlannedNotification {
  kind: typeof MARKER | typeof TASK_MARKER;
  date: Date;
  title: string;
  body: string;
}

let queue = Promise.resolve();
let generation = 0;
export function syncCourseReminders(
  schedule: Schedule | undefined,
  enabled: boolean,
  minutes: number,
  count: number,
  tasks: readonly CourseTask[] = [],
) {
  if (Platform.OS === "web") return;
  const current = ++generation;
  queue = queue.catch(() => {}).then(async () => {
    if (current !== generation) return;
    const existing = await Notifications.getAllScheduledNotificationsAsync();
    const allowed = (await Notifications.getPermissionsAsync()).granted;
    const limit = Platform.OS === "ios" ? 60 : 450;
    const courseReminders = allowed && enabled && schedule ? buildCourseReminders(schedule, minutes, count) : [];
    const taskReminders = allowed && tasks.length ? buildCourseTaskReminders(tasks) : [];

    // 为作业/考试倒计时保留合理配额，避免大量未来课表提醒在 iOS 60 条上限下挤掉考试提醒
    const taskQuota = Math.min(
      taskReminders.length,
      Math.max(limit - courseReminders.length, Math.floor(limit / 3)),
    );
    const chosenTasks = taskReminders.slice(0, taskQuota);
    const chosenCourses = courseReminders.slice(0, Math.max(0, limit - chosenTasks.length));

    const desired = new Map<string, PlannedNotification>();
    for (const item of chosenCourses) {
      if (desired.size >= limit) break;
      desired.set(JSON.stringify([MARKER, item.date.getTime(), item.title, item.body]), {
        kind: MARKER,
        date: item.date,
        title: item.title,
        body: item.body,
      });
    }
    for (const item of chosenTasks) {
      if (desired.size >= limit) break;
      desired.set(JSON.stringify([TASK_MARKER, item.taskId, item.date.getTime(), item.title, item.body]), {
        kind: TASK_MARKER,
        date: item.date,
        title: item.title,
        body: item.body,
      });
    }
    if (current !== generation) return;
    for (const scheduled of existing) {
      const data = scheduled.content.data;
      if (data?.kind !== MARKER && data?.kind !== TASK_MARKER) continue;
      const key = typeof data.key === "string" ? data.key : null;
      const target = key ? desired.get(key) : undefined;
      if (key && target && target.kind === data.kind) {
        desired.delete(key);
        continue;
      }
      await Notifications.cancelScheduledNotificationAsync(scheduled.identifier);
    }
    if (desired.size) await prepareReminderChannel();
    for (const [key, item] of desired) {
      if (current !== generation) return;
      await Notifications.scheduleNotificationAsync({
        content: { title: item.title, body: item.body, sound: "default", data: { kind: item.kind, key } },
        trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: item.date, channelId: CHANNEL },
      });
    }
  }).catch((error) => { console.warn("课程提醒安排失败", error); });
  return queue;
}
