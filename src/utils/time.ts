import type { Course, Period, SemesterKind } from "@/types";

/** 三种学期的默认配置：上学期（秋季）/ 下学期（春季）/ 短学期（小学期） */
export const SEMESTER_DEFS: Record<
  SemesterKind,
  {
    label: string;
    /** 短标签：上 / 下 / 短 */
    shortLabel: string;
    /** 起始锚点（月、日），实际开学取该日之后的第一个周一 */
    anchorMonth: number;
    anchorDay: number;
    totalWeeks: number;
  }
> = {
  fall: {
    label: "秋季学期",
    shortLabel: "上",
    anchorMonth: 9,
    anchorDay: 1,
    totalWeeks: 18,
  },
  spring: {
    label: "春季学期",
    shortLabel: "下",
    anchorMonth: 2,
    anchorDay: 23,
    totalWeeks: 18,
  },
  summer: {
    label: "短学期",
    shortLabel: "短",
    anchorMonth: 7,
    anchorDay: 13,
    totalWeeks: 4,
  },
};

export interface SemesterInfo {
  kind: SemesterKind;
  /** 展示名，如 "2026 秋季学期" */
  name: string;
  shortLabel: string;
  /** 学期第一周的周一 */
  startDate: string;
  /** 学期最后一周的周日（放假日期） */
  endDate: string;
  totalWeeks: number;
}

export const toIsoDate = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate(),
  ).padStart(2, "0")}`;

/** "2026-09-20" -> 当天 00:00 的 Date */
export const parseIsoDate = (iso: string) => new Date(`${iso}T00:00:00`);

/** 日期加天数（返回新 Date） */
export function addDays(date: Date, days: number): Date {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

/** 取该日期所在周的周一（周一开始为一周之始） */
export function mondayOf(date: Date): Date {
  const d = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const offset = (d.getDay() + 6) % 7; // 周一 = 0 ... 周日 = 6
  return addDays(d, -offset);
}

/** 由开学/放假日期推导总周数（放假日所在周算最后一周） */
export function weeksFromDates(startDate: string, endDate: string): number {
  const diffDays = Math.floor(
    (parseIsoDate(endDate).getTime() - parseIsoDate(startDate).getTime()) /
      86400000,
  );
  return Math.max(1, Math.floor(diffDays / 7) + 1);
}

/** "2026-09-20" -> "2026年9月20日" */
export function formatDateLabel(iso: string): string {
  const d = parseIsoDate(iso);
  return `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日`;
}

/** 锚点日（含）之后的第一个周一，作为学期第一周 */
function firstMonday(year: number, month: number, day: number): Date {
  const d = new Date(year, month - 1, day);
  d.setDate(d.getDate() + ((8 - (d.getDay() === 0 ? 7 : d.getDay())) % 7));
  return d;
}

function makeSemester(kind: SemesterKind, year: number): SemesterInfo {
  const def = SEMESTER_DEFS[kind];
  const start = firstMonday(year, def.anchorMonth, def.anchorDay);
  return {
    kind,
    name: `${year} ${def.label}`,
    shortLabel: def.shortLabel,
    startDate: toIsoDate(start),
    endDate: toIsoDate(addDays(start, def.totalWeeks * 7 - 1)),
    totalWeeks: def.totalWeeks,
  };
}

/**
 * 解析某个日期所属的学期（上/下/短三种之一）。
 * 取「第一周不晚于该日期」的最近一个学期，让课表时间轴与真实日期对齐。
 */
export function resolveSemester(date: Date = new Date()): SemesterInfo {
  const today = toIsoDate(date);
  const y = date.getFullYear();
  const candidates = [
    makeSemester("spring", y - 1),
    makeSemester("summer", y - 1),
    makeSemester("fall", y - 1),
    makeSemester("spring", y),
    makeSemester("summer", y),
    makeSemester("fall", y),
  ].sort((a, b) => (a.startDate < b.startDate ? -1 : 1));

  let picked = candidates[0];
  for (const c of candidates) {
    if (c.startDate <= today) picked = c;
  }
  return picked;
}

/** "08:00" -> 480 分钟 */
export function timeToMinutes(time: string): number {
  const [h, m] = time.split(":").map(Number);
  return h * 60 + (m ?? 0);
}

export interface CourseTime {
  startTime: string;
  endTime: string;
  startMinutes: number;
  endMinutes: number;
  durationMinutes: number;
}

/** 根据节次区间计算课程的起止时间 */
export function getCourseTime(
  periods: Period[],
  startPeriod: number,
  endPeriod: number,
): CourseTime {
  const start = periods.find((p) => p.index === startPeriod);
  const end =
    periods.find((p) => p.index === endPeriod) ?? periods[periods.length - 1];
  const startTime = start?.startTime ?? "--:--";
  const endTime = end?.endTime ?? "--:--";
  return {
    startTime,
    endTime,
    startMinutes: start ? timeToMinutes(startTime) : 0,
    endMinutes: end ? timeToMinutes(endTime) : 0,
    durationMinutes: Math.max(
      0,
      timeToMinutes(endTime) - timeToMinutes(startTime),
    ),
  };
}

export interface DateInfo {
  /** 当前是学期第几周，从 1 开始 */
  weekIndex: number;
  /** 周几：1 = 周一 ... 7 = 周日 */
  weekday: number;
  /** "10月16日" */
  dateLabel: string;
}

/** 根据学期起始日计算当前周次与星期 */
export function getDateInfo(
  startDate: string,
  now: Date = new Date(),
): DateInfo {
  const start = new Date(`${startDate}T00:00:00`);
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const diffDays = Math.floor((today.getTime() - start.getTime()) / 86400000);
  return {
    weekIndex: Math.floor(diffDays / 7) + 1,
    weekday: today.getDay() === 0 ? 7 : today.getDay(),
    dateLabel: `${today.getMonth() + 1}月${today.getDate()}日`,
  };
}

/** 当前时间点该课程是否正在进行 */
export function isCourseActive(
  course: Course,
  periods: Period[],
  weekIndex: number,
  weekday: number,
  now: Date = new Date(),
): boolean {
  if (course.weekday !== weekday || !course.weeks.includes(weekIndex))
    return false;
  const minutes = now.getHours() * 60 + now.getMinutes();
  const { startMinutes, endMinutes } = getCourseTime(
    periods,
    course.startPeriod,
    course.endPeriod,
  );
  return minutes >= startMinutes && minutes <= endMinutes;
}

/** 该课程是否已上过（本周内） */
export function isCourseFinished(
  course: Course,
  periods: Period[],
  weekIndex: number,
  weekday: number,
  now: Date = new Date(),
): boolean {
  if (course.weekday !== weekday || !course.weeks.includes(weekIndex))
    return false;
  const minutes = now.getHours() * 60 + now.getMinutes();
  return (
    minutes >
    getCourseTime(periods, course.startPeriod, course.endPeriod).endMinutes
  );
}

export function formatClock(date: Date = new Date()): string {
  return `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}

/* -------------------------------------------------------------------------- */
/*  课表冲突检测 & 不同作息之间的节次映射                                          */
/* -------------------------------------------------------------------------- */

/** 时间冲突：同一天、节次重叠、周次相交。返回 courseId -> 与之冲突的课程名列表 */
export function findConflicts(courses: Course[]): Map<string, string[]> {
  const map = new Map<string, string[]>();
  for (let i = 0; i < courses.length; i++) {
    for (let j = i + 1; j < courses.length; j++) {
      const a = courses[i];
      const b = courses[j];
      if (a.weekday !== b.weekday) continue;
      if (a.startPeriod > b.endPeriod || a.endPeriod < b.startPeriod) continue;
      const weeksB = new Set(b.weeks);
      if (!a.weeks.some((w) => weeksB.has(w))) continue;
      map.set(a.id, [...(map.get(a.id) ?? []), b.name]);
      map.set(b.id, [...(map.get(b.id) ?? []), a.name]);
    }
  }
  return map;
}

/** 把上课时刻映射到目标作息中的节次（早于第一节归入第一节，晚于最后一节归入最后一节） */
export function periodAtTime(periods: Period[], time: string): number | null {
  if (!periods.length) return null;
  const t = timeToMinutes(time);
  for (const p of periods) {
    if (t < timeToMinutes(p.endTime)) return p.index;
  }
  return periods[periods.length - 1].index;
}

/** 把下课时刻映射到目标作息中的节次（反向查找：该时刻之前的最后一节） */
export function periodEndingAtTime(
  periods: Period[],
  time: string,
): number | null {
  if (!periods.length) return null;
  const t = timeToMinutes(time);
  for (let i = periods.length - 1; i >= 0; i--) {
    if (t > timeToMinutes(periods[i].startTime)) return periods[i].index;
  }
  return periods[0].index;
}

/** 节次序号是否落在作息表范围内（用于防御非法数据） */
export function clampPeriods(
  periods: Period[],
  startPeriod: number,
  endPeriod: number,
): { startPeriod: number; endPeriod: number } | null {
  if (!periods.length) return null;
  const min = periods[0].index;
  const max = periods[periods.length - 1].index;
  const start = Math.min(Math.max(startPeriod, min), max);
  const end = Math.min(Math.max(endPeriod, start), max);
  return { startPeriod: start, endPeriod: end };
}

/**
 * 周数换算：把源课表某周的某一天换算成目标课表的周数。
 * 两份课表开学日期不同时，按「同一个真实日期」对齐。
 */
export function mapWeeks(
  weeks: number[],
  weekday: number,
  sourceStartDate: string,
  targetStartDate: string,
  targetTotalWeeks: number,
): number[] {
  const src = parseIsoDate(sourceStartDate);
  const dst = parseIsoDate(targetStartDate);
  const mapped = weeks.map(
    (w) =>
      Math.floor(
        (addDays(src, (w - 1) * 7 + (weekday - 1)).getTime() - dst.getTime()) /
          86400000 /
          7,
      ) + 1,
  );
  return [...new Set(mapped)]
    .filter((w) => w >= 1 && w <= targetTotalWeeks)
    .sort((a, b) => a - b);
}
