import type { Schedule } from "@/types";
import { addDays, mondayOf, parseIsoDate, toIsoDate } from "@/utils/time";

export type WidgetShape = "square" | "rectangle" | "large";
export type WidgetTheme = "dark" | "light";
export const WIDGET_SHAPES = [
  { key: "square", label: "正方形", size: "2 × 2", capacity: 2 },
  { key: "rectangle", label: "长方形", size: "4 × 2", capacity: 2 },
  { key: "large", label: "大卡片", size: "4 × 4", capacity: 5 },
] as const;

export interface WidgetCourse {
  id: string;
  name: string;
  classroom: string;
  teacher: string;
  start: number;
  end: number;
  time: string;
}

function clock(value: string | undefined): number | null {
  const match = value?.match(/^(\d{1,2}):(\d{2})$/);
  if (!match || +match[1] > 23 || +match[2] > 59) return null;
  return +match[1] * 60 + +match[2];
}

/** Expand actual teaching weeks, retaining ongoing lessons and future occurrences. */
export function upcomingWidgetCourses(schedule: Schedule | undefined, now = new Date()): WidgetCourse[] {
  if (!schedule) return [];
  const monday = mondayOf(parseIsoDate(schedule.startDate));
  if (!Number.isFinite(monday.getTime())) return [];
  const result: WidgetCourse[] = [];
  for (const course of schedule.courses) {
    const first = schedule.periods.find((p) => p.index === course.startPeriod);
    const last = schedule.periods.find((p) => p.index === course.endPeriod);
    const from = clock(first?.startTime);
    const to = clock(last?.endTime);
    if (from === null || to === null || to <= from || !Number.isInteger(course.weekday) || course.weekday < 1 || course.weekday > 7) continue;
    for (const week of new Set(course.weeks)) {
      if (!Number.isInteger(week) || week < 1 || week > schedule.totalWeeks) continue;
      const day = addDays(monday, (week - 1) * 7 + course.weekday - 1);
      const iso = toIsoDate(day);
      if (iso < schedule.startDate || iso > schedule.endDate) continue;
      const start = new Date(day);
      const end = new Date(day);
      start.setHours(Math.floor(from / 60), from % 60, 0, 0);
      end.setHours(Math.floor(to / 60), to % 60, 0, 0);
      if (end.getTime() <= now.getTime()) continue;
      result.push({ id: `${course.id}-${iso}`, name: course.name, classroom: course.classroom, teacher: course.teacher,
        start: start.getTime(), end: end.getTime(), time: `${first!.startTime}–${last!.endTime}` });
    }
  }
  return result.sort((a, b) => a.start - b.start || a.name.localeCompare(b.name));
}

export function widgetDayLabel(start: number, now = new Date()): string {
  const date = new Date(start);
  if (toIsoDate(date) === toIsoDate(now)) return "今天";
  if (toIsoDate(date) === toIsoDate(addDays(now, 1))) return "明天";
  return `${date.getMonth() + 1}/${date.getDate()} 周${"日一二三四五六"[date.getDay()]}`;
}
