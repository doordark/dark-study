import type { CourseColor, Schedule } from "@/types";
import type { WidgetAccentPalette } from "@/constants/widgetPalette";
import { widgetAccent } from "@/constants/widgetPalette";
import { addDays, mondayOf, parseIsoDate, toIsoDate } from "@/utils/time";

export type WidgetShape = "square" | "rectangle" | "large";
export type WidgetTheme = "system" | "dark" | "light";
/** 卡片表面质感：清透玻璃 / 澎湃瓷卡 / 主题彩卡 */
export type WidgetSurfaceStyle = "frosted" | "porcelain" | "tinted";
/** 展示内容模式：智能预告（今日及后续） / 仅看今日（今日无课显示可爱空态） / 本周一览（周一至周日紧凑全览） */
export type WidgetDisplayMode = "upcoming" | "today" | "week";

export const WIDGET_SHAPES = [
  { key: "square", label: "小方卡", size: "2 × 2", capacity: 2, desc: "紧凑聚焦" },
  { key: "rectangle", label: "宽卡片", size: "4 × 2", capacity: 2, desc: "桌面与负一屏首选" },
  { key: "large", label: "大卡片", size: "4 × 4", capacity: 5, desc: "全景日程一览" },
] as const;

export const WIDGET_SURFACE_STYLES = [
  { key: "frosted", label: "清透玻璃", desc: "柔和半透质感" },
  { key: "porcelain", label: "澎湃瓷卡", desc: "通透纯净卡片" },
  { key: "tinted", label: "主题彩卡", desc: "柔和渐变色彩" },
] as const;

export const WIDGET_DISPLAY_MODES = [
  { key: "upcoming", label: "智能预告", desc: "优先今日，顺延显示后续课程" },
  { key: "today", label: "仅看今日", desc: "今日无课时展示可爱放空态" },
  { key: "week", label: "本周一览", desc: "按周一至周日紧凑展示本周每天的课程安排" },
] as const;

export interface WeekWidgetDayCourse {
  id: string;
  name: string;
  startTime: string;
  classroom: string;
  color: CourseColor;
}

export interface WeekWidgetDay {
  weekday: number;
  dayLabel: string;
  isToday: boolean;
  courses: WeekWidgetDayCourse[];
}

const WEEK_DAY_LABELS = ["周一", "周二", "周三", "周四", "周五", "周六", "周日"] as const;

export interface WidgetCourse {
  id: string;
  name: string;
  classroom: string;
  teacher: string;
  start: number;
  end: number;
  time: string;
  /** 课程主题色，跟随课表里为课程设置的主题色 */
  color: CourseColor;
}

function clock(value: string | undefined): number | null {
  const match = value?.match(/^(\d{1,2}):(\d{2})$/);
  if (!match || +match[1] > 23 || +match[2] > 59) return null;
  return +match[1] * 60 + +match[2];
}

function hexToRgba(hex: string, alpha: number): string {
  const cleaned = hex.replace("#", "");
  if (cleaned.length !== 6) return hex;
  const r = parseInt(cleaned.slice(0, 2), 16);
  const g = parseInt(cleaned.slice(2, 4), 16);
  const b = parseInt(cleaned.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
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
    const from = clock(course.startTime ?? first?.startTime);
    const to = clock(course.endTime ?? last?.endTime);
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
      result.push({
        id: `${course.id}-${iso}`,
        name: course.name,
        classroom: course.classroom,
        teacher: course.teacher,
        start: start.getTime(),
        end: end.getTime(),
        time: `${course.startTime ?? first!.startTime}–${course.endTime ?? last!.endTime}`,
        color: course.color,
      });
    }
  }
  return result.sort((a, b) => a.start - b.start || a.name.localeCompare(b.name));
}

/** Filter upcoming courses to today only (still ongoing or later today). */
export function todayWidgetCourses(courses: WidgetCourse[], now = new Date()): WidgetCourse[] {
  const todayIso = toIsoDate(now);
  return courses.filter((item) => toIsoDate(new Date(item.start)) === todayIso);
}

/** 按周一至周日汇总当前教学周的课程列表，供「本周一览」小组件预览与测试使用 */
export function weekWidgetDays(
  schedule: Schedule | undefined,
  now = new Date(),
): WeekWidgetDay[] {
  if (!schedule) return [];
  const monday = mondayOf(parseIsoDate(schedule.startDate));
  if (!Number.isFinite(monday.getTime())) return [];

  const diffDays = Math.floor(
    (Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()) -
      Date.UTC(monday.getFullYear(), monday.getMonth(), monday.getDate())) /
      86400000,
  );
  const activeWeek = Math.floor(diffDays / 7) + 1;
  const todayWeekday = now.getDay() === 0 ? 7 : now.getDay();
  const buckets: { startMin: number; course: WeekWidgetDayCourse }[][] = Array.from(
    { length: 7 },
    () => [],
  );

  if (activeWeek >= 1 && activeWeek <= schedule.totalWeeks) {
    for (const course of schedule.courses) {
      if (!Number.isInteger(course.weekday) || course.weekday < 1 || course.weekday > 7) continue;
      if (!course.weeks.includes(activeWeek)) continue;
      const first = schedule.periods.find((p) => p.index === course.startPeriod);
      const last = schedule.periods.find((p) => p.index === course.endPeriod);
      const startTime = course.startTime?.trim() || first?.startTime?.trim();
      const endTime = course.endTime?.trim() || last?.endTime?.trim();
      const from = clock(startTime);
      const to = clock(endTime);
      if (from === null || to === null || to <= from || !startTime) continue;

      const day = addDays(monday, (activeWeek - 1) * 7 + course.weekday - 1);
      const iso = toIsoDate(day);
      if (iso < schedule.startDate || iso > schedule.endDate) continue;

      buckets[course.weekday - 1].push({
        startMin: from,
        course: {
          id: course.id,
          name: course.name,
          startTime,
          classroom: course.classroom,
          color: course.color,
        },
      });
    }
  }

  return WEEK_DAY_LABELS.map((dayLabel, idx) => {
    const weekday = idx + 1;
    const courses = buckets[idx]
      .sort((a, b) => a.startMin - b.startMin || a.course.name.localeCompare(b.course.name))
      .map((entry) => entry.course);
    return {
      weekday,
      dayLabel,
      isToday: weekday === todayWeekday,
      courses,
    };
  });
}

export function widgetDayLabel(start: number, now = new Date()): string {
  const date = new Date(start);
  if (toIsoDate(date) === toIsoDate(now)) return "今天";
  if (toIsoDate(date) === toIsoDate(addDays(now, 1))) return "明天";
  return `${date.getMonth() + 1}/${date.getDate()} 周${"日一二三四五六"[date.getDay()]}`;
}

/** 组件右上角的日期信息：11.4 第8周 周三（不在学期内或紧凑尺寸时可省略周次） */
export function widgetMeta(schedule: Schedule | undefined, now = new Date(), compact = false): string {
  const weekday = `周${"日一二三四五六"[now.getDay()]}`;
  const dateLabel = `${now.getMonth() + 1}.${now.getDate()}`;
  if (!schedule || compact) return `${dateLabel} ${weekday}`;
  const monday = mondayOf(parseIsoDate(schedule.startDate));
  if (!Number.isFinite(monday.getTime())) return `${dateLabel} ${weekday}`;
  const diffDays = Math.floor(
    (Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()) -
      Date.UTC(monday.getFullYear(), monday.getMonth(), monday.getDate())) /
      86400000,
  );
  const week = Math.floor(diffDays / 7) + 1;
  if (week < 1 || week > schedule.totalWeeks) return `${dateLabel} ${weekday}`;
  return `${dateLabel} 第${week}周 ${weekday}`;
}

export interface ResolvedWidgetColors {
  background: string;
  backgroundEnd: string;
  border: string;
  brand: string;
  ink: string;
  muted: string;
  weekdayHighlight: string;
  emptyKaomoji: string;
}

/** 根据深浅模式与表面质感取小组件主题色对应的完整配色（与原生 XML Drawable 同步） */
export function widgetAccentColors(
  accent: string | undefined,
  theme: WidgetTheme,
  systemDark = true,
  style: WidgetSurfaceStyle = "tinted",
): ResolvedWidgetColors {
  const palette: WidgetAccentPalette = widgetAccent(accent);
  const dark = theme === "dark" || (theme === "system" && systemDark);
  const ink = dark ? "#F8FAFC" : "#172033";
  const muted = dark ? "#9EB0C9" : "#64748B";
  const brand = dark ? palette.brandDark : palette.brandLight;
  const emptyKaomoji = dark ? "#94A3B8" : "#7B879B";

  if (style === "porcelain") {
    return dark
      ? {
          background: hexToRgba(palette.porcelainDark, 0.96),
          backgroundEnd: hexToRgba(palette.porcelainDarkEnd, 0.96),
          border: hexToRgba(palette.borderDark, 0.36),
          brand,
          ink,
          muted,
          weekdayHighlight: brand,
          emptyKaomoji,
        }
      : {
          background: hexToRgba(palette.porcelainLight, 0.96),
          backgroundEnd: hexToRgba(palette.porcelainLightEnd, 0.96),
          border: hexToRgba(palette.borderLight, 0.55),
          brand,
          ink,
          muted,
          weekdayHighlight: brand,
          emptyKaomoji,
        };
  }

  if (style === "frosted") {
    return dark
      ? {
          background: hexToRgba(palette.bgDark, 0.84),
          backgroundEnd: hexToRgba(palette.bgDarkEnd, 0.88),
          border: hexToRgba(palette.borderDark, 0.62),
          brand,
          ink,
          muted,
          weekdayHighlight: brand,
          emptyKaomoji,
        }
      : {
          background: hexToRgba(palette.porcelainLight, 0.86),
          backgroundEnd: hexToRgba(palette.bgLight, 0.88),
          border: hexToRgba(palette.borderLight, 0.72),
          brand,
          ink,
          muted,
          weekdayHighlight: brand,
          emptyKaomoji,
        };
  }

  return dark
    ? {
        background: palette.bgDark,
        backgroundEnd: palette.bgDarkEnd,
        border: palette.borderDark,
        brand,
        ink,
        muted,
        weekdayHighlight: brand,
        emptyKaomoji,
      }
    : {
        background: palette.bgLight,
        backgroundEnd: palette.bgLightEnd,
        border: palette.borderLight,
        brand,
        ink,
        muted,
        weekdayHighlight: brand,
        emptyKaomoji,
      };
}
