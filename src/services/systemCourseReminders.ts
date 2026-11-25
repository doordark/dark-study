import * as IntentLauncher from "expo-intent-launcher";
import { Platform } from "react-native";
import type { WidgetCourse } from "@/utils/courseWidget";

/** 系统界面由用户保存，避免静默创建无法跟随调课撤销的系统记录。 */
export async function openCourseCalendar(course: WidgetCourse, minutes: number) {
  if (Platform.OS !== "android") throw new Error("当前仅支持 Android 系统日历");
  await IntentLauncher.startActivityAsync("android.intent.action.INSERT", {
    data: "content://com.android.calendar/events",
    type: "vnd.android.cursor.dir/event",
    extra: {
      title: course.name,
      eventLocation: course.classroom,
      description: `${course.teacher ? `教师：${course.teacher}。` : ""}请在日历中设置提前 ${minutes} 分钟提醒。此日程为课表快照，调课后请在系统日历中同步修改。`,
      beginTime: course.start, endTime: course.end,
    },
  });
}

export async function openCourseAlarm(course: WidgetCourse, minutes: number, now = new Date(), skipUI = false) {
  if (Platform.OS !== "android") throw new Error("当前仅支持 Android 系统闹钟");
  const date = new Date(course.start - minutes * 60000);
  if (+date <= +now || +date - +now >= 86400000) throw new Error("系统闹钟只支持下一次时刻，请选择未来 24 小时内的课程；更远的日期请添加系统日程");
  try { await IntentLauncher.startActivityAsync("android.intent.action.SET_ALARM", {
    extra: {
      "android.intent.extra.alarm.HOUR": date.getHours(),
      "android.intent.extra.alarm.MINUTES": date.getMinutes(),
      "android.intent.extra.alarm.MESSAGE": `${course.name}${course.classroom ? ` · ${course.classroom}` : ""}`,
      "android.intent.extra.alarm.SKIP_UI": skipUI,
    },
  }); } catch (error) {
    if (/SecurityException|Permission Denial|SET_ALARM/i.test(String(error))) {
      throw new Error("当前安装包缺少系统闹钟权限，请安装包含此修复的新版本；无需在通知设置里反复授权。");
    }
    throw error;
  }
}

export interface CourseImportResult {
  completed: number;
  skipped: number;
  failures: string[];
}

export function canImportAlarm(course: WidgetCourse, minutes: number, now = Date.now()) {
  const trigger = course.start - minutes * 60000;
  return trigger > now && trigger - now < 86400000;
}

/** Sequential intents: the launcher supports only one pending activity at a time. */
export async function importCourseAlarms(courses: WidgetCourse[], minutes: number): Promise<CourseImportResult> {
  if (Platform.OS !== "android") throw new Error("当前仅支持 Android 系统闹钟");
  const result: CourseImportResult = { completed: 0, skipped: 0, failures: [] };
  for (const course of courses) {
    if (!canImportAlarm(course, minutes)) { result.skipped++; continue; }
    try {
      await openCourseAlarm(course, minutes, new Date(), true);
      result.completed++;
    } catch (error) {
      result.failures.push(`${course.name}：${error instanceof Error ? error.message : "无法打开系统时钟"}`);
    }
  }
  return result;
}

const CALENDAR_NAME = "dark-study-courses";
const MARKER_PREFIX = "DarkStudy:";

function parseMarkerScheduleId(notes: string | undefined): string | null {
  const firstLine = notes?.split(/\r?\n/)[0]?.trim();
  if (!firstLine?.startsWith(MARKER_PREFIX)) return null;
  try {
    const parsed = JSON.parse(firstLine.slice(MARKER_PREFIX.length));
    return Array.isArray(parsed) && typeof parsed[0] === "string" ? parsed[0] : null;
  } catch {
    return null;
  }
}

/** Own calendar + full-day batch lookup makes retries & same-day time shifts idempotent without duplicates. */
export async function importCourseCalendar(courses: WidgetCourse[], minutes: number, scheduleId: string): Promise<CourseImportResult> {
  if (Platform.OS !== "android") throw new Error("当前仅支持 Android 系统日历");
  const Calendar = await import("expo-calendar/legacy");
  const permission = await Calendar.requestCalendarPermissionsAsync();
  if (!permission.granted) throw new Error("请允许访问系统日历后重试；如果已禁止询问，可在系统应用权限中开启日历权限。");
  const calendars = await Calendar.getCalendarsAsync(Calendar.EntityTypes.EVENT);
  let calendarId = calendars.find(c => c.name === CALENDAR_NAME && c.allowsModifications)?.id;
  if (!calendarId) calendarId = await Calendar.createCalendarAsync({
    title: "Dark Study 课程", name: CALENDAR_NAME, color: "#38BDF8",
    entityType: Calendar.EntityTypes.EVENT, source: { isLocalAccount: true, name: "Dark Study", type: Calendar.SourceType.LOCAL },
    ownerAccount: "Dark Study", accessLevel: Calendar.CalendarAccessLevel.OWNER,
  });
  const result: CourseImportResult = { completed: 0, skipped: 0, failures: [] };
  const now = Date.now();
  const pending: WidgetCourse[] = [];
  for (const course of courses) {
    if (course.start <= now) result.skipped++;
    else pending.push(course);
  }
  if (!pending.length) return result;
  // 按涉及的起止自然日整天拉取一次已有事件，既减少 IPC 次数，也能在同天调课时精准命中旧日程并原地更新。
  let minStart = pending[0].start;
  let maxEnd = pending[0].end;
  for (const c of pending) {
    if (c.start < minStart) minStart = c.start;
    if (c.end > maxEnd) maxEnd = c.end;
  }
  const rangeStart = new Date(minStart);
  rangeStart.setHours(0, 0, 0, 0);
  const rangeEnd = new Date(maxEnd);
  rangeEnd.setHours(23, 59, 59, 999);
  const existingEvents = await Calendar.getEventsAsync([calendarId], rangeStart, rangeEnd);
  const byMarker = new Map<string, typeof existingEvents[number]>();
  for (const event of existingEvents) {
    const key = event.notes?.split(/\r?\n/)[0]?.trim();
    if (key?.startsWith(MARKER_PREFIX) && !byMarker.has(key)) byMarker.set(key, event);
  }
  for (const course of pending) {
    try {
      const marker = `${MARKER_PREFIX}${JSON.stringify([scheduleId, course.id])}`;
      const existing = byMarker.get(marker);
      const details = {
        title: course.name, location: course.classroom,
        startDate: new Date(course.start), endDate: new Date(course.end),
        notes: `${marker}\n${course.teacher ? `教师：${course.teacher}。` : ""}课表快照，调课后请重新导入或在日历中修改。`,
        alarms: [{ relativeOffset: -minutes }],
      };
      if (existing) {
        await Calendar.updateEventAsync(existing.id, details);
      } else {
        const createdId = await Calendar.createEventAsync(calendarId, details);
        byMarker.set(marker, { id: createdId, ...details } as typeof existingEvents[number]);
      }
      result.completed++;
    } catch (error) {
      result.failures.push(`${course.name}：${error instanceof Error ? error.message : "日程写入失败"}`);
    }
  }
  return result;
}

/** 清空 Dark Study 专属系统日历中的课程快照（传入 scheduleId 时仅清理该课表）。 */
export async function clearCourseCalendar(scheduleId?: string): Promise<number> {
  if (Platform.OS !== "android") throw new Error("当前仅支持 Android 系统日历");
  const Calendar = await import("expo-calendar/legacy");
  const permission = await Calendar.requestCalendarPermissionsAsync();
  if (!permission.granted) throw new Error("请允许访问系统日历后重试。");
  const calendars = await Calendar.getCalendarsAsync(Calendar.EntityTypes.EVENT);
  const calendarId = calendars.find(c => c.name === CALENDAR_NAME && c.allowsModifications)?.id;
  if (!calendarId) return 0;
  const now = Date.now();
  const rangeStart = new Date(now - 365 * 86400000);
  const rangeEnd = new Date(now + 730 * 86400000);
  const events = await Calendar.getEventsAsync([calendarId], rangeStart, rangeEnd);
  let removed = 0;
  for (const event of events) {
    const sid = parseMarkerScheduleId(event.notes);
    if (!sid) continue;
    if (scheduleId && sid !== scheduleId) continue;
    try {
      await Calendar.deleteEventAsync(event.id);
      removed++;
    } catch (error) {
      console.warn("跳过无法删除的日程", event.id, error);
    }
  }
  return removed;
}
