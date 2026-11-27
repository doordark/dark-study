import type { Course, Schedule } from "@/types";
import type { CourseTaskType } from "@/utils/courseTasks";
import { toIsoDate } from "@/utils/time";

export type AttendanceStatus = "present" | "leave" | "absent";

export interface AttendanceRecord {
  id: string;
  courseKey: string;
  courseName: string;
  dateIso: string;
  status: AttendanceStatus;
  note?: string;
  at: number;
}

export interface CourseFocusLog {
  id: string;
  courseKey: string;
  courseName: string;
  minutes: number;
  coinsAwarded: number;
  at: number;
}

export interface PendingFarmReward {
  id: string;
  source: "focus" | "task" | "exam";
  title: string;
  coins: number;
  growthBoostMin: number;
  at: number;
}

export type AttendanceRiskLevel = "safe" | "warn" | "danger";

export interface AttendanceSummary {
  present: number;
  leave: number;
  absent: number;
  totalExpected: number;
  redline: number;
  remainingBeforeRedline: number;
  riskLevel: AttendanceRiskLevel;
}

export interface StudyProgressSnapshot {
  attendanceByCourse: Record<string, AttendanceRecord[]>;
  customAbsenceLimits: Record<string, number>;
  focusLogs: CourseFocusLog[];
  pendingFarmRewards: PendingFarmReward[];
}

export const FOCUS_PRESET_MINUTES = [15, 25, 45] as const;

const VALID_ATTENDANCE_STATUSES = new Set<AttendanceStatus>([
  "present",
  "leave",
  "absent",
]);
const VALID_REWARD_SOURCES = new Set<PendingFarmReward["source"]>([
  "focus",
  "task",
  "exam",
]);
const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const MAX_ATTENDANCE_PER_COURSE = 120;
const MAX_FOCUS_LOGS = 500;
const MAX_PENDING_REWARDS = 100;

let idSeq = 0;
export function makeProgressId(prefix: string, at = Date.now()): string {
  idSeq = (idSeq + 1) % 10000;
  return `${prefix}_${at}_${idSeq}_${Math.random().toString(36).slice(2, 6)}`;
}

/**
 * 归一化课程唯一标识键，用于将一周多次排课的同一门课程合并统计考勤与专注时长。
 */
export function courseIdentityKey(
  course: Pick<Course, "name" | "teacher">,
): string {
  const name = (course.name ?? "").trim().toLowerCase().replace(/\s+/g, " ");
  const teacher = (course.teacher ?? "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
  return `${name}::${teacher}`;
}

/** 返回课表中与指定课程属于同一学科的全部排课槽位 */
export function getCourseSlotsByKey(
  schedule: Schedule | undefined,
  courseKey: string,
): Course[] {
  if (!schedule?.courses?.length || !courseKey) return [];
  return schedule.courses.filter((c) => courseIdentityKey(c) === courseKey);
}

/** 去重提取课表中的学科列表（每个学科保留首个槽位作为代表并汇总全部槽位） */
export function listDistinctScheduleCourses(
  schedule: Schedule | undefined,
): { courseKey: string; course: Course; slots: Course[] }[] {
  if (!schedule?.courses?.length) return [];
  const map = new Map<string, { courseKey: string; course: Course; slots: Course[] }>();
  for (const c of schedule.courses) {
    if (!c.name?.trim()) continue;
    const key = courseIdentityKey(c);
    const existing = map.get(key);
    if (existing) {
      existing.slots.push(c);
    } else {
      map.set(key, { courseKey: key, course: c, slots: [c] });
    }
  }
  return [...map.values()];
}

function uniqueValidWeekCount(weeks: readonly number[] | undefined): number {
  if (!Array.isArray(weeks)) return 0;
  const set = new Set<number>();
  for (const w of weeks) {
    if (Number.isInteger(w) && w > 0) set.add(w);
  }
  return set.size;
}

/**
 * 计算单门课程的考勤汇总与缺勤红线风险等级（默认沿用国内高校 1/3 缺勤红线规则）。
 * 支持传入单个 Course 槽位或同一学科的多个 Course 槽位数组。
 */
export function computeAttendanceSummary(
  course:
    | Pick<Course, "weeks">
    | readonly Pick<Course, "weeks">[]
    | null
    | undefined,
  records: readonly AttendanceRecord[] | undefined,
  customLimit?: number,
): AttendanceSummary {
  let totalExpected = 0;
  if (Array.isArray(course)) {
    for (const slot of course) {
      totalExpected += uniqueValidWeekCount(slot?.weeks);
    }
  } else if (course && "weeks" in course) {
    totalExpected = uniqueValidWeekCount(course.weeks);
  }

  const defaultRedline = Math.max(2, Math.floor(totalExpected / 3));
  const redline =
    typeof customLimit === "number" &&
    Number.isFinite(customLimit) &&
    customLimit >= 1
      ? Math.max(1, Math.min(60, Math.floor(customLimit)))
      : defaultRedline;

  let present = 0;
  let leave = 0;
  let absent = 0;
  if (Array.isArray(records)) {
    for (const rec of records) {
      if (!rec) continue;
      if (rec.status === "present") present += 1;
      else if (rec.status === "leave") leave += 1;
      else if (rec.status === "absent") absent += 1;
    }
  }

  const rawRemaining = redline - absent;
  const remainingBeforeRedline = Math.max(0, rawRemaining);
  const riskLevel: AttendanceRiskLevel =
    rawRemaining <= 0 ? "danger" : rawRemaining === 1 ? "warn" : "safe";

  return {
    present,
    leave,
    absent,
    totalExpected,
    redline,
    remainingBeforeRedline,
    riskLevel,
  };
}

/** 计算学科专注完成后对应的星露坡奖励（15m->18币, 25m->32币, 45m->60币） */
export function buildFarmRewardForFocus(
  minutes: number,
  courseName: string,
  at = Date.now(),
): PendingFarmReward {
  const safeMin = Number.isFinite(minutes)
    ? Math.max(1, Math.min(240, Math.round(minutes)))
    : 25;
  let coins: number;
  if (safeMin === 15) coins = 18;
  else if (safeMin === 25) coins = 32;
  else if (safeMin === 45) coins = 60;
  else {
    const rate = safeMin >= 40 ? 1.33 : safeMin >= 20 ? 1.28 : 1.2;
    coins = Math.max(2, Math.round(safeMin * rate));
  }
  const cleanName = courseName.trim().slice(0, 48);
  const title = cleanName
    ? `${cleanName}专注 ${safeMin} 分钟`
    : `专注学习 ${safeMin} 分钟`;
  return {
    id: makeProgressId("rew_focus", at),
    source: "focus",
    title,
    coins,
    growthBoostMin: safeMin,
    at,
  };
}

/** 计算完成课程作业/复习/考试后对应的星露坡奖励（作业15币、复习20币、考试50币） */
export function buildFarmRewardForTask(
  type: CourseTaskType,
  title: string,
  at = Date.now(),
): PendingFarmReward {
  const cleanTitle = title.trim().slice(0, 64) || "学习任务";
  if (type === "exam") {
    return {
      id: makeProgressId("rew_exam", at),
      source: "exam",
      title: `完成考试「${cleanTitle}」`,
      coins: 50,
      growthBoostMin: 40,
      at,
    };
  }
  if (type === "review") {
    return {
      id: makeProgressId("rew_review", at),
      source: "task",
      title: `完成复习「${cleanTitle}」`,
      coins: 20,
      growthBoostMin: 15,
      at,
    };
  }
  return {
    id: makeProgressId("rew_task", at),
    source: "task",
    title: `完成作业「${cleanTitle}」`,
    coins: 15,
    growthBoostMin: 10,
    at,
  };
}

/** 汇总今日累计专注分钟数 */
export function getTodayFocusMinutes(
  focusLogs: readonly CourseFocusLog[] | undefined,
  now = Date.now(),
): number {
  if (!Array.isArray(focusLogs) || !focusLogs.length) return 0;
  const todayIso = toIsoDate(new Date(now));
  let total = 0;
  for (const log of focusLogs) {
    if (!log || !Number.isFinite(log.at) || !Number.isFinite(log.minutes)) continue;
    if (toIsoDate(new Date(log.at)) === todayIso) {
      total += Math.max(0, Math.round(log.minutes));
    }
  }
  return total;
}

/** 汇总指定学科的累计专注分钟数 */
export function getCourseFocusMinutes(
  focusLogs: readonly CourseFocusLog[] | undefined,
  courseKey: string,
): number {
  if (!Array.isArray(focusLogs) || !courseKey) return 0;
  let total = 0;
  for (const log of focusLogs) {
    if (log && log.courseKey === courseKey && Number.isFinite(log.minutes)) {
      total += Math.max(0, Math.round(log.minutes));
    }
  }
  return total;
}

/** 扫描课表中所有已触发 warn / danger 考勤红线的学科 */
export function getAttendanceRiskCourses(
  schedule: Schedule | undefined,
  attendanceByCourse: Record<string, AttendanceRecord[]> | undefined,
  customAbsenceLimits?: Record<string, number>,
): { courseKey: string; courseName: string; summary: AttendanceSummary }[] {
  const distinct = listDistinctScheduleCourses(schedule);
  if (!distinct.length || !attendanceByCourse) return [];
  const results: {
    courseKey: string;
    courseName: string;
    summary: AttendanceSummary;
  }[] = [];
  for (const item of distinct) {
    const records = attendanceByCourse[item.courseKey];
    if (!records?.length) continue;
    const summary = computeAttendanceSummary(
      item.slots,
      records,
      customAbsenceLimits?.[item.courseKey],
    );
    if (summary.riskLevel !== "safe") {
      results.push({
        courseKey: item.courseKey,
        courseName: item.course.name,
        summary,
      });
    }
  }
  return results;
}

const isRecord = (v: unknown): v is Record<string, unknown> =>
  Boolean(v) && typeof v === "object" && !Array.isArray(v);

const validTimestamp = (v: unknown): v is number =>
  typeof v === "number" &&
  Number.isFinite(v) &&
  v > 0 &&
  v < 253402300800000;

export function normalizeAttendanceRecord(
  raw: unknown,
): AttendanceRecord | null {
  if (!isRecord(raw)) return null;
  if (
    typeof raw.id !== "string" ||
    !raw.id.trim() ||
    raw.id.length > 128 ||
    typeof raw.courseKey !== "string" ||
    !raw.courseKey.trim() ||
    raw.courseKey.length > 200 ||
    typeof raw.courseName !== "string" ||
    !raw.courseName.trim() ||
    raw.courseName.length > 120 ||
    typeof raw.dateIso !== "string" ||
    !ISO_DATE_RE.test(raw.dateIso) ||
    typeof raw.status !== "string" ||
    !VALID_ATTENDANCE_STATUSES.has(raw.status as AttendanceStatus) ||
    !validTimestamp(raw.at)
  ) {
    return null;
  }
  let note: string | undefined;
  if (raw.note !== undefined) {
    if (typeof raw.note !== "string") return null;
    const trimmed = raw.note.trim().slice(0, 120);
    if (trimmed) note = trimmed;
  }
  return {
    id: raw.id.trim(),
    courseKey: raw.courseKey.trim(),
    courseName: raw.courseName.trim(),
    dateIso: raw.dateIso,
    status: raw.status as AttendanceStatus,
    ...(note ? { note } : {}),
    at: Math.floor(raw.at),
  };
}

export function normalizeCourseFocusLog(raw: unknown): CourseFocusLog | null {
  if (!isRecord(raw)) return null;
  if (
    typeof raw.id !== "string" ||
    !raw.id.trim() ||
    raw.id.length > 128 ||
    typeof raw.courseKey !== "string" ||
    !raw.courseKey.trim() ||
    raw.courseKey.length > 200 ||
    typeof raw.courseName !== "string" ||
    !raw.courseName.trim() ||
    raw.courseName.length > 120 ||
    typeof raw.minutes !== "number" ||
    !Number.isFinite(raw.minutes) ||
    raw.minutes < 1 ||
    raw.minutes > 600 ||
    typeof raw.coinsAwarded !== "number" ||
    !Number.isFinite(raw.coinsAwarded) ||
    raw.coinsAwarded < 0 ||
    raw.coinsAwarded > 10000 ||
    !validTimestamp(raw.at)
  ) {
    return null;
  }
  return {
    id: raw.id.trim(),
    courseKey: raw.courseKey.trim(),
    courseName: raw.courseName.trim(),
    minutes: Math.round(raw.minutes),
    coinsAwarded: Math.round(raw.coinsAwarded),
    at: Math.floor(raw.at),
  };
}

export function normalizePendingFarmReward(
  raw: unknown,
): PendingFarmReward | null {
  if (!isRecord(raw)) return null;
  if (
    typeof raw.id !== "string" ||
    !raw.id.trim() ||
    raw.id.length > 128 ||
    typeof raw.source !== "string" ||
    !VALID_REWARD_SOURCES.has(raw.source as PendingFarmReward["source"]) ||
    typeof raw.title !== "string" ||
    !raw.title.trim() ||
    raw.title.length > 120 ||
    typeof raw.coins !== "number" ||
    !Number.isFinite(raw.coins) ||
    raw.coins < 0 ||
    raw.coins > 10000 ||
    typeof raw.growthBoostMin !== "number" ||
    !Number.isFinite(raw.growthBoostMin) ||
    raw.growthBoostMin < 0 ||
    raw.growthBoostMin > 600 ||
    !validTimestamp(raw.at)
  ) {
    return null;
  }
  return {
    id: raw.id.trim(),
    source: raw.source as PendingFarmReward["source"],
    title: raw.title.trim(),
    coins: Math.round(raw.coins),
    growthBoostMin: Math.round(raw.growthBoostMin),
    at: Math.floor(raw.at),
  };
}

export function normalizeStudyProgressState(
  raw: unknown,
): StudyProgressSnapshot {
  const base: StudyProgressSnapshot = {
    attendanceByCourse: {},
    customAbsenceLimits: {},
    focusLogs: [],
    pendingFarmRewards: [],
  };
  if (!isRecord(raw)) return base;

  if (isRecord(raw.attendanceByCourse)) {
    for (const [key, list] of Object.entries(raw.attendanceByCourse)) {
      if (!key || key.length > 200 || !Array.isArray(list)) continue;
      const seen = new Set<string>();
      const cleaned: AttendanceRecord[] = [];
      for (const item of list.slice(0, MAX_ATTENDANCE_PER_COURSE)) {
        const rec = normalizeAttendanceRecord(item);
        if (!rec || seen.has(rec.id)) continue;
        seen.add(rec.id);
        cleaned.push(rec);
      }
      if (cleaned.length) {
        cleaned.sort((a, b) => b.at - a.at);
        base.attendanceByCourse[key] = cleaned;
      }
    }
  }

  if (isRecord(raw.customAbsenceLimits)) {
    for (const [key, val] of Object.entries(raw.customAbsenceLimits)) {
      if (
        key &&
        key.length <= 200 &&
        typeof val === "number" &&
        Number.isFinite(val) &&
        val >= 1 &&
        val <= 60
      ) {
        base.customAbsenceLimits[key] = Math.floor(val);
      }
    }
  }

  if (Array.isArray(raw.focusLogs)) {
    const seen = new Set<string>();
    for (const item of raw.focusLogs.slice(0, MAX_FOCUS_LOGS)) {
      const log = normalizeCourseFocusLog(item);
      if (!log || seen.has(log.id)) continue;
      seen.add(log.id);
      base.focusLogs.push(log);
    }
    base.focusLogs.sort((a, b) => b.at - a.at);
  }

  if (Array.isArray(raw.pendingFarmRewards)) {
    const seen = new Set<string>();
    for (const item of raw.pendingFarmRewards.slice(0, MAX_PENDING_REWARDS)) {
      const reward = normalizePendingFarmReward(item);
      if (!reward || seen.has(reward.id)) continue;
      seen.add(reward.id);
      base.pendingFarmRewards.push(reward);
    }
  }

  return base;
}
