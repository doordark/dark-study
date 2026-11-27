import { WEEKDAY_LABELS } from "@/constants/palette";
import type { Course, Schedule } from "@/types";
import { occurrenceDate } from "@/utils/courseEditing";
import { uid } from "@/utils/id";
import {
  formatDateLabel,
  mondayOf,
  parseIsoDate,
  toIsoDate,
  weeksFromDates,
} from "@/utils/time";

export interface DateWeekPosition {
  week: number;
  weekday: number;
}

export interface HolidayCancelResult {
  courses: Course[];
  affectedCount: number;
  summary: string;
}

export interface HolidayMoveOptions {
  replaceTargetDay?: boolean;
}

export interface HolidayMoveResult {
  courses: Course[];
  movedCount: number;
  clearedTargetCount: number;
  summary: string;
}

export interface HolidaySwapResult {
  courses: Course[];
  swappedACount: number;
  swappedBCount: number;
  summary: string;
}

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function resolveTotalWeeks(schedule: Schedule): number {
  if (Number.isInteger(schedule.totalWeeks) && schedule.totalWeeks >= 1) {
    return schedule.totalWeeks;
  }
  if (schedule.startDate && schedule.endDate) {
    return weeksFromDates(schedule.startDate, schedule.endDate);
  }
  return 18;
}

function formatPositionLabel(dateIso: string, pos: DateWeekPosition): string {
  const weekdayLabel = WEEKDAY_LABELS[pos.weekday - 1] ?? `周${pos.weekday}`;
  return `${formatDateLabel(dateIso)}（第${pos.week}周${weekdayLabel}）`;
}

/**
 * 将 ISO 日期（yyyy-MM-dd）换算为学期内的教学周次与星期几（1=周一 ... 7=周日）。
 * 若日期格式无效、超出学期起止日期或不在 1..totalWeeks 范围内，返回 null。
 */
export function dateToWeekAndWeekday(
  schedule: Schedule,
  dateIso: string,
): DateWeekPosition | null {
  if (!ISO_DATE_RE.test(dateIso)) return null;
  const date = parseIsoDate(dateIso);
  if (!Number.isFinite(date.getTime()) || toIsoDate(date) !== dateIso) {
    return null;
  }
  if (schedule.startDate && dateIso < schedule.startDate) return null;
  if (schedule.endDate && dateIso > schedule.endDate) return null;

  const startBase = parseIsoDate(schedule.startDate);
  if (!Number.isFinite(startBase.getTime())) return null;
  const startMonday = mondayOf(startBase);

  const startUtc = Date.UTC(
    startMonday.getFullYear(),
    startMonday.getMonth(),
    startMonday.getDate(),
  );
  const targetUtc = Date.UTC(
    date.getFullYear(),
    date.getMonth(),
    date.getDate(),
  );
  const diffDays = Math.round((targetUtc - startUtc) / 86400000);
  if (diffDays < 0) return null;

  const week = Math.floor(diffDays / 7) + 1;
  const weekday = (diffDays % 7) + 1;
  const totalWeeks = resolveTotalWeeks(schedule);
  if (week < 1 || week > totalWeeks || weekday < 1 || weekday > 7) {
    return null;
  }
  return { week, weekday };
}

/** 根据教学周次与星期几得到对应 ISO 日期（yyyy-MM-dd） */
export function weekAndWeekdayToDate(
  schedule: Schedule,
  week: number,
  weekday: number,
): string {
  return occurrenceDate(schedule, week, weekday);
}

/** 列出指定日期当天排到的所有课程（按节次升序） */
export function getCoursesOnDate(schedule: Schedule, dateIso: string): Course[] {
  const pos = dateToWeekAndWeekday(schedule, dateIso);
  if (!pos) return [];
  return schedule.courses
    .filter((c) => c.weekday === pos.weekday && c.weeks.includes(pos.week))
    .sort((a, b) => a.startPeriod - b.startPeriod || a.endPeriod - b.endPeriod);
}

/**
 * 整日放假停课：仅移除 dateIso 当天对应 (week, weekday) 的单次上课记录。
 * 其他周次保持完全不变；若某门课仅剩这一周，则移除该课程记录。
 */
export function planHolidayCancelDay(
  schedule: Schedule,
  dateIso: string,
): HolidayCancelResult {
  const target = dateToWeekAndWeekday(schedule, dateIso);
  if (!target) {
    throw new Error("所选放假日期不在本学期有效范围内。");
  }

  let affectedCount = 0;
  const nextCourses: Course[] = [];

  for (const course of schedule.courses) {
    if (
      course.weekday === target.weekday &&
      course.weeks.includes(target.week)
    ) {
      affectedCount += 1;
      const remainingWeeks = course.weeks.filter((w) => w !== target.week);
      if (remainingWeeks.length > 0) {
        nextCourses.push({ ...course, weeks: remainingWeeks });
      }
    } else {
      nextCourses.push(course);
    }
  }

  const label = formatPositionLabel(dateIso, target);
  const summary =
    affectedCount > 0
      ? `已将 ${label} 的 ${affectedCount} 门课程设为停课`
      : `${label} 当天原本无课，课表未改动`;

  return {
    courses: nextCourses,
    affectedCount,
    summary,
  };
}

/**
 * 整日调休补课：将 fromDateIso 当天所有课程拆出单周并平移到 toDateIso。
 * 非目标周次完全不受影响；当 opts.replaceTargetDay 为 true 时会同时清空目标日原有课程。
 */
export function planHolidayMoveDay(
  schedule: Schedule,
  fromDateIso: string,
  toDateIso: string,
  opts?: HolidayMoveOptions,
): HolidayMoveResult {
  const from = dateToWeekAndWeekday(schedule, fromDateIso);
  if (!from) {
    throw new Error("原上课日期不在本学期有效范围内。");
  }
  const to = dateToWeekAndWeekday(schedule, toDateIso);
  if (!to) {
    throw new Error("目标补课日期不在本学期有效范围内。");
  }

  const fromLabel = formatPositionLabel(fromDateIso, from);
  const toLabel = formatPositionLabel(toDateIso, to);

  if (from.week === to.week && from.weekday === to.weekday) {
    return {
      courses: schedule.courses,
      movedCount: 0,
      clearedTargetCount: 0,
      summary: `${fromLabel} 与目标日期相同，无需调休`,
    };
  }

  const replaceTargetDay = Boolean(opts?.replaceTargetDay);
  const sourceMatches: Course[] = [];
  let clearedTargetCount = 0;
  const baseCourses: Course[] = [];

  for (const course of schedule.courses) {
    const hitsFrom =
      course.weekday === from.weekday && course.weeks.includes(from.week);
    const hitsTo =
      replaceTargetDay &&
      course.weekday === to.weekday &&
      course.weeks.includes(to.week);

    if (hitsFrom) {
      sourceMatches.push(course);
    }
    if (hitsTo) {
      clearedTargetCount += 1;
    }

    if (!hitsFrom && !hitsTo) {
      baseCourses.push(course);
      continue;
    }

    const remainingWeeks = course.weeks.filter(
      (w) =>
        !(hitsFrom && w === from.week) && !(hitsTo && w === to.week),
    );
    if (remainingWeeks.length > 0) {
      baseCourses.push({ ...course, weeks: remainingWeeks });
    }
  }

  const shiftedCourses: Course[] = sourceMatches.map((course) => ({
    ...course,
    id: uid(),
    weekday: to.weekday,
    weeks: [to.week],
  }));

  const movedCount = shiftedCourses.length;
  const nextCourses = [...baseCourses, ...shiftedCourses];

  let summary: string;
  if (movedCount === 0 && clearedTargetCount === 0) {
    summary = `${fromLabel} 当天原本无课，课表未改动`;
  } else if (movedCount === 0 && clearedTargetCount > 0) {
    summary = `${fromLabel} 原本无课，已清空 ${toLabel} 原有的 ${clearedTargetCount} 门课程`;
  } else {
    summary = `已将 ${fromLabel} 的 ${movedCount} 门课程调休至 ${toLabel}${
      clearedTargetCount > 0
        ? `（并替换目标日原有 ${clearedTargetCount} 门课程）`
        : ""
    }`;
  }

  return {
    courses: nextCourses,
    movedCount,
    clearedTargetCount,
    summary,
  };
}

/**
 * 两日课表原子互换：一次性将 dateAIso 与 dateBIso 两天的课程彼此交换。
 * 其他所有周次均原样保留；支持同一星期不同周次以及其中一天为空课的场景。
 */
export function planHolidaySwapDays(
  schedule: Schedule,
  dateAIso: string,
  dateBIso: string,
): HolidaySwapResult {
  const posA = dateToWeekAndWeekday(schedule, dateAIso);
  if (!posA) {
    throw new Error("日期 A 不在本学期有效范围内。");
  }
  const posB = dateToWeekAndWeekday(schedule, dateBIso);
  if (!posB) {
    throw new Error("日期 B 不在本学期有效范围内。");
  }

  const labelA = formatPositionLabel(dateAIso, posA);
  const labelB = formatPositionLabel(dateBIso, posB);

  if (posA.week === posB.week && posA.weekday === posB.weekday) {
    return {
      courses: schedule.courses,
      swappedACount: 0,
      swappedBCount: 0,
      summary: `${labelA} 与日期 B 相同，无需互换`,
    };
  }

  const matchesA: Course[] = [];
  const matchesB: Course[] = [];
  const baseCourses: Course[] = [];

  for (const course of schedule.courses) {
    const hitsA =
      course.weekday === posA.weekday && course.weeks.includes(posA.week);
    const hitsB =
      course.weekday === posB.weekday && course.weeks.includes(posB.week);

    if (hitsA) matchesA.push(course);
    if (hitsB) matchesB.push(course);

    if (!hitsA && !hitsB) {
      baseCourses.push(course);
      continue;
    }

    const remainingWeeks = course.weeks.filter(
      (w) => !(hitsA && w === posA.week) && !(hitsB && w === posB.week),
    );
    if (remainingWeeks.length > 0) {
      baseCourses.push({ ...course, weeks: remainingWeeks });
    }
  }

  if (matchesA.length === 0 && matchesB.length === 0) {
    return {
      courses: schedule.courses,
      swappedACount: 0,
      swappedBCount: 0,
      summary: `${labelA} 与 ${labelB} 均无课程，课表未改动`,
    };
  }

  const movedAToB: Course[] = matchesA.map((course) => ({
    ...course,
    id: uid(),
    weekday: posB.weekday,
    weeks: [posB.week],
  }));
  const movedBToA: Course[] = matchesB.map((course) => ({
    ...course,
    id: uid(),
    weekday: posA.weekday,
    weeks: [posA.week],
  }));

  const nextCourses = [...baseCourses, ...movedAToB, ...movedBToA];
  const summary = `已互换 ${labelA}（${matchesA.length} 门）与 ${labelB}（${matchesB.length} 门）的课程安排`;

  return {
    courses: nextCourses,
    swappedACount: matchesA.length,
    swappedBCount: matchesB.length,
    summary,
  };
}
