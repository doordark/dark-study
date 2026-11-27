import type {
  Course,
  GpaScaleId,
  GradeRecord,
  GradeRule,
  GradeType,
  GradeYear,
  Period,
  Schedule,
  ScheduleAction,
} from "@/types";
import { normalizeCourseTasks, normalizeTaskDraft } from "@/utils/courseTasks";
import {
  buildTermGpaTrend,
  calcGradeStats,
  deriveGpa,
  formatCourseGpa,
  formatGpa,
  formatWeightedScore,
  getGpaScaleMeta,
  isGradeIncluded,
} from "@/utils/grades";
import { getCourseTime, timeToMinutes } from "@/utils/time";

/** 考勤记录结构接口（结构化只读形状，避免与 useStudyProgress 产生循环依赖） */
export interface AttendanceEntryLike {
  status: "present" | "leave" | "absent";
  dateIso: string;
}

/** 专注记录结构接口（结构化只读形状，避免与 useStudyProgress 产生循环依赖） */
export interface FocusLogLike {
  courseName: string;
  minutes: number;
  at: number;
}

const WEEKDAY_LABELS = ["", "周一", "周二", "周三", "周四", "周五", "周六", "周日"] as const;
const MAX_COPILOT_SUMMARY_CHARS = 300;
const DAY_MS = 86_400_000;
const CLOCK_RE = /^\d{1,2}:\d{2}$/;

function joinWithinLimit(
  parts: readonly string[],
  separator: string,
  maxChars: number,
): string {
  const out: string[] = [];
  let len = 0;
  for (const part of parts) {
    if (!part) continue;
    const addLen = (out.length ? separator.length : 0) + part.length;
    if (len + addLen > maxChars) {
      if (!out.length) {
        return maxChars > 1 ? `${part.slice(0, maxChars - 1)}…` : part.slice(0, maxChars);
      }
      break;
    }
    out.push(part);
    len += addLen;
  }
  return out.join(separator);
}

function normalizeIdentityText(text: string | undefined): string {
  return String(text ?? "")
    .trim()
    .replace(/\s+/g, "")
    .toLowerCase();
}

function isPeriodOccupied(
  period: Period,
  dayCourses: readonly { course: Course; startMin: number; endMin: number; hasCustomClock: boolean }[],
): boolean {
  const pHasClock = CLOCK_RE.test(period.startTime) && CLOCK_RE.test(period.endTime);
  const pStart = pHasClock ? timeToMinutes(period.startTime) : 0;
  const pEnd = pHasClock ? timeToMinutes(period.endTime) : 0;
  for (const item of dayCourses) {
    if (period.index >= item.course.startPeriod && period.index <= item.course.endPeriod) {
      return true;
    }
    if (item.hasCustomClock && pHasClock && item.startMin < pEnd && item.endMin > pStart) {
      return true;
    }
  }
  return false;
}

/**
 * 扫描指定教学周（周一至周日）的空课节次并合并连续空闲时段，输出紧凑中文摘要（<= 300 字）。
 */
export function computeWeeklyFreeSlots(
  schedule: Schedule | undefined,
  week: number,
): string {
  if (!schedule || !Array.isArray(schedule.periods) || !schedule.periods.length) {
    return "";
  }
  if (!Number.isInteger(week) || week < 1) return "";

  const periods = [...schedule.periods]
    .filter((p) => Number.isInteger(p.index) && p.index >= 1)
    .sort((a, b) => a.index - b.index);
  if (!periods.length) return "";

  const courses = Array.isArray(schedule.courses) ? schedule.courses : [];
  const daySummaries: string[] = [];

  for (let weekday = 1; weekday <= 7; weekday++) {
    const dayCourses = courses
      .filter(
        (c) =>
          c.weekday === weekday &&
          Array.isArray(c.weeks) &&
          c.weeks.includes(week),
      )
      .map((course) => {
        const hasCustomClock = Boolean(
          course.startTime &&
            course.endTime &&
            CLOCK_RE.test(course.startTime) &&
            CLOCK_RE.test(course.endTime),
        );
        const time = getCourseTime(periods, course.startPeriod, course.endPeriod, course);
        return {
          course,
          startMin: time.startMinutes,
          endMin: time.endMinutes,
          hasCustomClock,
        };
      });

    if (!dayCourses.length) {
      daySummaries.push(`${WEEKDAY_LABELS[weekday]} 全天空闲`);
      continue;
    }

    const freeRuns: { start: Period; end: Period }[] = [];
    let currentRun: { start: Period; end: Period } | null = null;
    let freeCount = 0;

    for (const period of periods) {
      const busy = isPeriodOccupied(period, dayCourses);
      if (!busy) {
        freeCount += 1;
        if (!currentRun) {
          currentRun = { start: period, end: period };
        } else {
          currentRun.end = period;
        }
      } else if (currentRun) {
        freeRuns.push(currentRun);
        currentRun = null;
      }
    }
    if (currentRun) freeRuns.push(currentRun);

    if (!freeRuns.length) continue;
    if (freeCount === periods.length) {
      daySummaries.push(`${WEEKDAY_LABELS[weekday]} 全天空闲`);
      continue;
    }

    const ranges = freeRuns.map(({ start, end }) => {
      if (CLOCK_RE.test(start.startTime) && CLOCK_RE.test(end.endTime)) {
        return `${start.startTime}-${end.endTime}`;
      }
      return start.index === end.index
        ? `第${start.index}节`
        : `第${start.index}-${end.index}节`;
    });
    daySummaries.push(`${WEEKDAY_LABELS[weekday]} ${ranges.join("/")}`);
  }

  return joinWithinLimit(daySummaries, "；", MAX_COPILOT_SUMMARY_CHARS);
}

/**
 * 汇总当前成绩绩点、加权均分、已获学分及最多 3 门高学分/低分提分关注课程（<= 300 字；无成绩返回空串）。
 */
export function summarizeGradesForCopilot(
  grades: readonly GradeRecord[] | undefined,
  gradeYears: readonly GradeYear[] = [],
  gradeTypes: readonly GradeType[] = [],
  rule?: GradeRule,
  scale: GpaScaleId = "five",
): string {
  if (!Array.isArray(grades) || !grades.length) return "";
  const included = grades.filter((g) => isGradeIncluded(rule, g));
  if (!included.length) return "";

  const stats = calcGradeStats(rule, [...grades]);
  const meta = getGpaScaleMeta(scale);
  const typeNameById = new Map(gradeTypes.map((t) => [t.id, t.name]));

  const overviewParts: string[] = [];
  if (stats.value !== null) {
    overviewParts.push(
      `总GPA ${formatGpa(stats.value)}/${meta.maxGpa.toFixed(1)}（${meta.shortLabel}）`,
    );
  }
  if (stats.weightedScore !== null) {
    overviewParts.push(`加权均分 ${formatWeightedScore(stats.weightedScore)}`);
  }
  if (stats.earnedCredits > 0) {
    overviewParts.push(`已获 ${stats.earnedCredits} 学分`);
  }
  overviewParts.push(`计入 ${stats.count || included.length} 门`);

  let summary = overviewParts.join("，");

  // 如有多个学期记录，附带最近一学期趋势
  if (gradeYears.length) {
    const trend = buildTermGpaTrend(grades, gradeYears, rule);
    if (trend.length >= 2) {
      const latest = trend[trend.length - 1];
      const trendSnippet = `；近期 ${latest.label} GPA ${formatGpa(latest.gpa)}`;
      if (summary.length + trendSnippet.length <= MAX_COPILOT_SUMMARY_CHARS) {
        summary += trendSnippet;
      }
    }
  }

  // 选出最多 3 门对提升 GPA 影响最大的高学分 / 低分课程
  const candidates = included
    .map((g) => {
      const effectiveGpa =
        g.gpa != null && Number.isFinite(g.gpa)
          ? g.gpa
          : deriveGpa(g.scoreType, g.score, scale);
      const credit =
        g.credit != null && Number.isFinite(g.credit) && g.credit > 0
          ? g.credit
          : 1;
      const hasExplicitCredit =
        g.credit != null && Number.isFinite(g.credit) && g.credit > 0;
      const gap = effectiveGpa != null ? Math.max(0, meta.maxGpa - effectiveGpa) : 0;
      const impact = gap * credit;
      return {
        grade: g,
        effectiveGpa,
        credit,
        hasExplicitCredit,
        gap,
        impact,
      };
    })
    .filter((item) => item.effectiveGpa !== null && item.gap > 0.05)
    .sort(
      (a, b) =>
        b.impact - a.impact ||
        (a.effectiveGpa ?? 0) - (b.effectiveGpa ?? 0) ||
        b.credit - a.credit ||
        a.grade.name.localeCompare(b.grade.name),
    )
    .slice(0, 3);

  if (candidates.length) {
    const focusPrefix = "；提分关注：";
    const remaining = MAX_COPILOT_SUMMARY_CHARS - summary.length - focusPrefix.length;
    if (remaining > 12) {
      const items = candidates.map(({ grade, effectiveGpa, hasExplicitCredit }) => {
        const metaParts: string[] = [];
        if (hasExplicitCredit) metaParts.push(`${grade.credit}学分`);
        const rawScore = grade.score.trim();
        if (rawScore) {
          metaParts.push(grade.scoreType === "numeric" ? `${rawScore}分` : rawScore);
        } else if (effectiveGpa !== null) {
          metaParts.push(`GPA ${formatCourseGpa(effectiveGpa)}`);
        }
        const typeLabel = typeNameById.get(grade.type);
        if (typeLabel && typeLabel.includes("必修") && metaParts.length < 2) {
          metaParts.push("必修");
        }
        return `${grade.name}(${metaParts.join("/")})`;
      });
      const joined = joinWithinLimit(items, "、", remaining);
      if (joined) summary += `${focusPrefix}${joined}`;
    }
  }

  return summary.length <= MAX_COPILOT_SUMMARY_CHARS
    ? summary
    : `${summary.slice(0, MAX_COPILOT_SUMMARY_CHARS - 1)}…`;
}

function resolveCourseRecordKey<T>(
  map: Readonly<Record<string, T>> | undefined,
  courseName: string,
  teacher: string,
  courseIds: readonly string[],
): { key: string; value: T } | null {
  if (!map) return null;
  const trimmedName = courseName.trim();
  const trimmedTeacher = teacher.trim();
  const collapsedName = trimmedName.toLowerCase().replace(/\s+/g, " ");
  const collapsedTeacher = trimmedTeacher.toLowerCase().replace(/\s+/g, " ");
  const normName = normalizeIdentityText(trimmedName);
  const normTeacher = normalizeIdentityText(trimmedTeacher);

  const directCandidates = [
    `${collapsedName}::${collapsedTeacher}`,
    `${trimmedName}::${trimmedTeacher}`,
    `${normName}::${normTeacher}`,
    `${trimmedName}|${trimmedTeacher}`,
    `${trimmedName.toLowerCase()}|${trimmedTeacher.toLowerCase()}`,
    `${normName}|${normTeacher}`,
    trimmedName,
    trimmedName.toLowerCase(),
    normName,
    ...courseIds,
  ].filter(Boolean);

  for (const key of directCandidates) {
    if (Object.hasOwn(map, key)) {
      return { key, value: map[key] };
    }
  }

  // 兜底匹配：容错不同分隔符或大小写/空格归一化后的 courseKey
  for (const [key, value] of Object.entries(map)) {
    const parts = key.split(/[|:@]/);
    const keyName = normalizeIdentityText(parts[0]);
    if (!keyName || keyName !== normName) continue;
    const keyTeacher = parts.length > 1 ? normalizeIdentityText(parts.slice(1).join("")) : "";
    if (!keyTeacher || !normTeacher || keyTeacher === normTeacher) {
      return { key, value };
    }
  }

  return null;
}

/**
 * 检查课表内每门课的缺勤次数是否逼近或达到缺勤红线，输出预警摘要供大肥鱼主动提醒。
 */
export function summarizeAttendanceRisks(
  schedule: Schedule | undefined,
  attendanceByCourse: Readonly<Record<string, readonly AttendanceEntryLike[]>> | undefined,
  customLimits?: Readonly<Record<string, number>>,
): string {
  if (!schedule?.courses?.length || !attendanceByCourse) return "";

  // 按课程名 + 教师归并一周多时段记录，统计每门课实际授课周数
  const grouped = new Map<
    string,
    { name: string; teacher: string; weeks: Set<number>; ids: string[] }
  >();
  for (const c of schedule.courses) {
    const name = c.name.trim();
    if (!name) continue;
    const teacher = c.teacher.trim();
    const groupKey = `${normalizeIdentityText(name)}|${normalizeIdentityText(teacher)}`;
    let entry = grouped.get(groupKey);
    if (!entry) {
      entry = { name, teacher, weeks: new Set<number>(), ids: [] };
      grouped.set(groupKey, entry);
    }
    entry.ids.push(c.id);
    if (Array.isArray(c.weeks)) {
      for (const w of c.weeks) {
        if (Number.isInteger(w) && w >= 1) entry.weeks.add(w);
      }
    }
  }

  const alerts: { severity: number; ratio: number; text: string }[] = [];
  const usedAttendanceKeys = new Set<string>();

  for (const course of grouped.values()) {
    const matchedEntries = resolveCourseRecordKey(
      attendanceByCourse,
      course.name,
      course.teacher,
      course.ids,
    );
    if (!matchedEntries || usedAttendanceKeys.has(matchedEntries.key)) continue;
    usedAttendanceKeys.add(matchedEntries.key);

    const records = Array.isArray(matchedEntries.value) ? matchedEntries.value : [];
    const absent = records.filter((r) => r?.status === "absent").length;
    if (absent <= 0) continue;

    const matchedLimit = resolveCourseRecordKey(
      customLimits,
      course.name,
      course.teacher,
      course.ids,
    );
    const rawLimit = matchedLimit?.value;
    const hasCustomLimit =
      typeof rawLimit === "number" && Number.isFinite(rawLimit) && rawLimit >= 1;
    const uniqueWeeks = course.weeks.size;
    const redline = hasCustomLimit
      ? Math.max(1, Math.floor(rawLimit))
      : Math.max(2, Math.floor(uniqueWeeks / 3));

    if (absent < redline - 1) continue;

    const isDanger = absent >= redline;
    const text = isDanger
      ? `${course.name}（已缺勤 ${absent}/${redline} 次，已达红线）`
      : `${course.name}（已缺勤 ${absent}/${redline} 次，临近红线）`;
    alerts.push({
      severity: isDanger ? 2 : 1,
      ratio: absent / redline,
      text,
    });
  }

  if (!alerts.length) return "";
  alerts.sort((a, b) => b.severity - a.severity || b.ratio - a.ratio);
  return joinWithinLimit(
    alerts.map((a) => a.text),
    "；",
    MAX_COPILOT_SUMMARY_CHARS,
  );
}

/**
 * 汇总最近 7 天学习专注总时长与最专注学科（无记录返回空串）。
 */
export function summarizeRecentFocus(
  focusLogs: readonly FocusLogLike[] | undefined,
  now = Date.now(),
): string {
  if (!Array.isArray(focusLogs) || !focusLogs.length) return "";
  const cutoff = now - 7 * DAY_MS;
  const recent = focusLogs.filter(
    (log) =>
      log &&
      typeof log.minutes === "number" &&
      Number.isFinite(log.minutes) &&
      log.minutes > 0 &&
      typeof log.at === "number" &&
      Number.isFinite(log.at) &&
      log.at >= cutoff &&
      log.at <= now + 60_000,
  );
  if (!recent.length) return "";

  let totalMinutes = 0;
  const byCourse = new Map<string, { minutes: number; latestAt: number }>();

  for (const log of recent) {
    const mins = Math.round(log.minutes);
    totalMinutes += mins;
    const name = String(log.courseName ?? "").trim() || "自主学习";
    const prev = byCourse.get(name);
    if (prev) {
      prev.minutes += mins;
      if (log.at > prev.latestAt) prev.latestAt = log.at;
    } else {
      byCourse.set(name, { minutes: mins, latestAt: log.at });
    }
  }

  if (totalMinutes <= 0) return "";

  let topName = "";
  let topMinutes = -1;
  let topAt = -1;
  for (const [name, stat] of byCourse.entries()) {
    if (stat.minutes > topMinutes || (stat.minutes === topMinutes && stat.latestAt > topAt)) {
      topName = name;
      topMinutes = stat.minutes;
      topAt = stat.latestAt;
    }
  }

  return `近 7 天累计专注 ${totalMinutes} 分钟（${recent.length} 次），最专注学科：${topName}（${topMinutes} 分钟）`;
}

function parseDueAtMs(value: unknown): number | null {
  if (typeof value === "number") {
    const truncated = Math.trunc(value);
    return Number.isSafeInteger(truncated) && truncated > 0 ? truncated : null;
  }
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) return null;
    if (/^\d{10,15}$/.test(trimmed)) {
      const num = Number(trimmed);
      if (Number.isSafeInteger(num) && num > 0) {
        return trimmed.length === 10 ? num * 1000 : num;
      }
    }
    const localMatch =
      /^(\d{4})-(\d{1,2})-(\d{1,2})(?:[T\s](\d{1,2}):(\d{2})(?::(\d{2}))?)?$/.exec(
        trimmed,
      );
    if (localMatch) {
      const y = Number(localMatch[1]);
      const mo = Number(localMatch[2]);
      const d = Number(localMatch[3]);
      const hh = localMatch[4] ? Number(localMatch[4]) : 23;
      const mm = localMatch[5] ? Number(localMatch[5]) : 59;
      const ss = localMatch[6] ? Number(localMatch[6]) : 0;
      const dt = new Date(y, mo - 1, d, hh, mm, ss, 0);
      if (
        dt.getFullYear() === y &&
        dt.getMonth() === mo - 1 &&
        dt.getDate() === d &&
        dt.getHours() === hh &&
        dt.getMinutes() === mm
      ) {
        return dt.getTime();
      }
      return null;
    }
    const parsed = Date.parse(trimmed);
    return Number.isFinite(parsed) && parsed > 0 ? Math.trunc(parsed) : null;
  }
  return null;
}

/** 校验并清洗 LLM 产出的 add_task 操作，格式不合法时返回 null 安全丢弃 */
export function sanitizeAddTaskAction(
  rawAction: unknown,
  schedule?: Schedule,
): Extract<ScheduleAction, { type: "add_task" }> | null {
  if (!rawAction || typeof rawAction !== "object" || Array.isArray(rawAction)) {
    return null;
  }
  const rec = rawAction as Record<string, unknown>;
  if (rec.type !== "add_task") return null;
  const rawTask = rec.task;
  if (!rawTask || typeof rawTask !== "object" || Array.isArray(rawTask)) {
    return null;
  }
  const t = rawTask as Record<string, unknown>;
  const dueAt = parseDueAtMs(t.dueAt);
  if (dueAt === null) return null;

  const type = t.type;
  const reminder =
    t.reminder === undefined || t.reminder === null
      ? type === "exam"
        ? 60
        : 15
      : t.reminder;

  let course: unknown = undefined;
  if (t.course !== undefined && t.course !== null) {
    if (typeof t.course !== "object" || Array.isArray(t.course)) return null;
    const rawCourse = t.course as Record<string, unknown>;
    const hasFullLink =
      typeof rawCourse.scheduleId === "string" &&
      rawCourse.scheduleId.trim().length > 0 &&
      typeof rawCourse.courseId === "string" &&
      rawCourse.courseId.trim().length > 0 &&
      typeof rawCourse.courseName === "string" &&
      rawCourse.courseName.trim().length > 0;
    if (hasFullLink) {
      course = {
        scheduleId: (rawCourse.scheduleId as string).trim(),
        courseId: (rawCourse.courseId as string).trim(),
        courseName: (rawCourse.courseName as string).trim(),
      };
    } else if (schedule) {
      const targetId =
        typeof rawCourse.courseId === "string" ? rawCourse.courseId.trim() : "";
      const targetName =
        typeof rawCourse.courseName === "string" ? rawCourse.courseName.trim() : "";
      const matched = schedule.courses.find(
        (c) =>
          (targetId && c.id === targetId) ||
          (targetName && c.name === targetName),
      );
      if (matched) {
        course = {
          scheduleId: schedule.id,
          courseId: matched.id,
          courseName: matched.name,
        };
      }
    }
  }

  const candidate: Record<string, unknown> = {
    title: typeof t.title === "string" ? t.title.trim() : t.title,
    type,
    dueAt,
    reminder,
    ...(course !== undefined ? { course } : {}),
    ...(t.location !== undefined && t.location !== null
      ? { location: t.location }
      : {}),
    ...(t.seat !== undefined && t.seat !== null ? { seat: t.seat } : {}),
    ...(t.examMode !== undefined && t.examMode !== null && t.examMode !== ""
      ? { examMode: t.examMode }
      : {}),
    ...(t.note !== undefined && t.note !== null ? { note: t.note } : {}),
  };

  const draft = normalizeTaskDraft(candidate);
  if (!draft) return null;
  const [checked] = normalizeCourseTasks([{ ...draft, id: "ai-draft" }]);
  if (!checked) return null;
  const { id: _ignoredId, completedAt: _ignoredDone, ...cleanDraft } = checked;
  return { type: "add_task", task: cleanDraft };
}
