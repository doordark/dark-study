import type { Course, Schedule } from "@/types";
import { addDays, getCourseTime, getDateInfo, mondayOf, parseIsoDate, toIsoDate } from "@/utils/time";

export const TASK_TYPES = { homework: "作业", exam: "考试", review: "复习" } as const;
export type CourseTaskType = keyof typeof TASK_TYPES;
export const TASK_REMINDERS = [0, 15, 60, 1440] as const;
export type TaskReminder = typeof TASK_REMINDERS[number];

export interface CourseTaskLink {
  scheduleId: string;
  courseId: string;
  courseName: string;
}
export interface CourseTaskDraft {
  title: string;
  type: CourseTaskType;
  dueAt: number;
  reminder: TaskReminder;
  course?: CourseTaskLink;
}
export interface CourseTask extends CourseTaskDraft {
  id: string;
  completedAt?: number;
}

export function taskDueTime(day: string, time: string): number | null {
  const date = /^(\d{4})-(\d{2})-(\d{2})$/.exec(day);
  const clock = /^(\d{2}):(\d{2})$/.exec(time);
  if (!date || !clock) return null;
  const [, year, month, ordinal] = date.map(Number);
  const [, hour, minute] = clock.map(Number);
  const value = new Date(year, month - 1, ordinal, hour, minute, 0, 0);
  return value.getFullYear() === year && value.getMonth() + 1 === month && value.getDate() === ordinal &&
    value.getHours() === hour && value.getMinutes() === minute ? value.getTime() : null;
}

const record = (value: unknown): Record<string, unknown> => value && typeof value === "object" && !Array.isArray(value)
  ? value as Record<string, unknown> : {};
const validTime = (value: unknown): value is number => typeof value === "number" && Number.isSafeInteger(value) && value > 0 && value < 253402300800000;

export function normalizeTaskDraft(value: unknown): CourseTaskDraft | null {
  const raw = record(value);
  const title = typeof raw.title === "string" ? raw.title.trim() : "";
  if (!title || title.length > 120 || typeof raw.type !== "string" || !Object.hasOwn(TASK_TYPES, raw.type) ||
    !validTime(raw.dueAt) || !TASK_REMINDERS.includes(raw.reminder as TaskReminder)) return null;
  const source = record(raw.course);
  const course = typeof source.scheduleId === "string" && source.scheduleId.length > 0 && source.scheduleId.length <= 128 &&
    typeof source.courseId === "string" && source.courseId.length > 0 && source.courseId.length <= 128 &&
    typeof source.courseName === "string" && source.courseName.trim() && source.courseName.length <= 120
    ? { scheduleId: source.scheduleId, courseId: source.courseId, courseName: source.courseName.trim() }
    : undefined;
  if (raw.course !== undefined && !course) return null;
  return { title, type: raw.type as CourseTaskType, dueAt: raw.dueAt, reminder: raw.reminder as TaskReminder, ...(course ? { course } : {}) };
}

export function normalizeCourseTasks(raw: unknown): CourseTask[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  const result: CourseTask[] = [];
  for (const value of raw.slice(0, 3000)) {
    const row = record(value);
    const task = normalizeTaskDraft(row);
    if (!task || typeof row.id !== "string" || !row.id || row.id.length > 128 || seen.has(row.id)) continue;
    if (row.completedAt !== undefined && !validTime(row.completedAt)) continue;
    seen.add(row.id);
    result.push({ ...task, id: row.id, ...(validTime(row.completedAt) ? { completedAt: row.completedAt } : {}) });
  }
  return result;
}

export function nextCourse(schedule: Schedule, now: Date) {
  let next: { course: Course; date: Date; time: string } | undefined;
  const start = mondayOf(parseIsoDate(schedule.startDate));
  if (!Number.isFinite(start.getTime())) return next;
  for (const course of schedule.courses) {
    if (!Number.isInteger(course.weekday) || course.weekday < 1 || course.weekday > 7) continue;
    const { startTime } = getCourseTime(schedule.periods, course.startPeriod, course.endPeriod, course);
    for (const week of course.weeks) {
      if (!Number.isInteger(week) || week < 1 || week > schedule.totalWeeks) continue;
      const day = toIsoDate(addDays(start, (week - 1) * 7 + course.weekday - 1));
      if (day < schedule.startDate || day > schedule.endDate) continue;
      const at = taskDueTime(day, startTime);
      if (at === null || at < now.getTime() || (next && at >= next.date.getTime())) continue;
      next = { course, date: new Date(at), time: startTime };
    }
  }
  return next;
}

export function todayTasks(tasks: CourseTask[], now: Date) {
  const tomorrow = addDays(new Date(now.getFullYear(), now.getMonth(), now.getDate()), 1).getTime();
  const pending = tasks.filter(task => task.completedAt === undefined).sort((a, b) => a.dueAt - b.dueAt);
  return { due: pending.filter(task => task.dueAt < tomorrow), exam: pending.find(task => task.type === "exam" && task.dueAt >= tomorrow) };
}

export type AgendaItem =
  | { key: string; at: number; type: "course"; course: Course; start: string; end: string }
  | { key: string; at: number; type: "task"; task: CourseTask };

export function weekAgenda(schedule: Schedule, tasks: CourseTask[], now: Date) {
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const end = addDays(start, 7).getTime();
  const sections = Array.from({ length: 7 }, (_, offset) => {
    const date = addDays(start, offset);
    const key = toIsoDate(date);
    const { weekIndex, weekday } = getDateInfo(schedule.startDate, date);
    const data: AgendaItem[] = [];
    if (key >= schedule.startDate && key <= schedule.endDate && weekIndex >= 1 && weekIndex <= schedule.totalWeeks) {
      for (const course of schedule.courses) {
        if (course.weekday !== weekday || !course.weeks.includes(weekIndex)) continue;
        const { startTime, endTime } = getCourseTime(schedule.periods, course.startPeriod, course.endPeriod, course);
        const at = taskDueTime(key, startTime);
        if (at !== null) data.push({ key: `course-${course.id}`, at, type: "course", course, start: startTime, end: endTime });
      }
    }
    return { key, date, data };
  });
  const byDate = new Map(sections.map(section => [section.key, section]));
  for (const task of tasks) {
    if (task.completedAt !== undefined || task.dueAt < start.getTime() || task.dueAt >= end) continue;
    byDate.get(toIsoDate(new Date(task.dueAt)))?.data.push({ key: `task-${task.id}`, at: task.dueAt, type: "task", task });
  }
  for (const day of sections) day.data.sort((a,b) => a.at - b.at || a.key.localeCompare(b.key));
  return sections;
}
