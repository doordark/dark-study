export const TASK_TYPES = { homework: "作业", exam: "考试", review: "复习" } as const;
export type CourseTaskType = keyof typeof TASK_TYPES;
export const TASK_REMINDERS = [0, 15, 60, 1440] as const;
export type TaskReminder = typeof TASK_REMINDERS[number];
export const EXAM_MODES = { closed: "闭卷", open: "开卷", paper: "论文答辩" } as const;
export type CourseExamMode = keyof typeof EXAM_MODES;

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
  /** 考场号 / 地点（最多 80 字） */
  location?: string;
  /** 座位号（最多 32 字） */
  seat?: string;
  /** 考试形式：闭卷 / 开卷 / 论文答辩 */
  examMode?: CourseExamMode;
  /** 备注（最多 200 字） */
  note?: string;
}
export interface CourseTask extends CourseTaskDraft {
  id: string;
  completedAt?: number;
}

export interface TaskCountdownInfo {
  label: string;
  urgent: boolean;
  overdue: boolean;
}

const DAY_MS = 86_400_000;
const MINUTE_MS = 60_000;
const DEFAULT_OVERDUE_WINDOW_MS = 7 * DAY_MS;

const record = (value: unknown): Record<string, unknown> => value && typeof value === "object" && !Array.isArray(value)
  ? value as Record<string, unknown> : {};
const validTime = (value: unknown): value is number => typeof value === "number" && Number.isSafeInteger(value) && value > 0 && value < 253402300800000;

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

function startOfLocalDay(ms: number): number {
  const d = new Date(ms);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}

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

  let location: string | undefined;
  if (raw.location !== undefined) {
    if (typeof raw.location !== "string") return null;
    const trimmed = raw.location.trim();
    if (trimmed.length > 80) return null;
    if (trimmed) location = trimmed;
  }

  let seat: string | undefined;
  if (raw.seat !== undefined) {
    if (typeof raw.seat !== "string") return null;
    const trimmed = raw.seat.trim();
    if (trimmed.length > 32) return null;
    if (trimmed) seat = trimmed;
  }

  let examMode: CourseExamMode | undefined;
  if (raw.examMode !== undefined) {
    if (typeof raw.examMode !== "string" || !Object.hasOwn(EXAM_MODES, raw.examMode)) return null;
    examMode = raw.examMode as CourseExamMode;
  }

  let note: string | undefined;
  if (raw.note !== undefined) {
    if (typeof raw.note !== "string") return null;
    const trimmed = raw.note.trim();
    if (trimmed.length > 200) return null;
    if (trimmed) note = trimmed;
  }

  return {
    title,
    type: raw.type as CourseTaskType,
    dueAt: raw.dueAt,
    reminder: raw.reminder as TaskReminder,
    ...(course ? { course } : {}),
    ...(location ? { location } : {}),
    ...(seat ? { seat } : {}),
    ...(examMode ? { examMode } : {}),
    ...(note ? { note } : {}),
  };
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

/** 格式化作业/考试倒计时文案与紧急状态 */
export function formatTaskCountdown(dueAt: number, now = Date.now()): TaskCountdownInfo {
  const diffMs = dueAt - now;
  if (diffMs < 0) {
    const overdueDays = Math.floor(-diffMs / DAY_MS);
    return {
      label: overdueDays >= 1 ? `已逾期 ${overdueDays} 天` : "已逾期",
      urgent: true,
      overdue: true,
    };
  }
  const urgent = diffMs <= DAY_MS;
  const dueDate = new Date(dueAt);
  const clock = `${pad2(dueDate.getHours())}:${pad2(dueDate.getMinutes())}`;
  const diffMins = Math.ceil(diffMs / MINUTE_MS);
  if (diffMins < 60) {
    return {
      label: diffMins <= 1 ? "即将截止" : `剩 ${diffMins} 分钟`,
      urgent: true,
      overdue: false,
    };
  }
  const dayDiff = Math.round((startOfLocalDay(dueAt) - startOfLocalDay(now)) / DAY_MS);
  if (dayDiff <= 0) {
    return { label: `今天 ${clock}`, urgent: true, overdue: false };
  }
  if (dayDiff === 1) {
    return { label: `明天 ${clock}`, urgent, overdue: false };
  }
  return { label: `剩 ${dayDiff} 天`, urgent, overdue: false };
}

/** 获取近期未完成任务（默认包含 7 天内已逾期及全部未来任务，按截止时间升序） */
export function getUpcomingTasks(
  tasks: readonly CourseTask[],
  now = Date.now(),
  limit?: number,
  opts?: { overdueWindowMs?: number },
): CourseTask[] {
  const overdueWindowMs = opts?.overdueWindowMs ?? DEFAULT_OVERDUE_WINDOW_MS;
  const minDueAt = now - Math.max(0, overdueWindowMs);
  const pending = tasks
    .filter((t) => !t.completedAt && t.dueAt >= minDueAt)
    .sort((a, b) => a.dueAt - b.dueAt || a.id.localeCompare(b.id));
  if (limit === undefined) return pending;
  return pending.slice(0, Math.max(0, limit));
}

/** 格式化供 AI 上下文或摘要展示的单条任务简述 */
export function formatTaskBrief(task: CourseTask, now = Date.now()): string {
  const countdown = formatTaskCountdown(task.dueAt, now);
  const details: string[] = [countdown.label];
  if (task.course?.courseName) details.push(task.course.courseName);
  if (task.location) details.push(`考场 ${task.location}`);
  if (task.seat) details.push(`座位 ${task.seat}`);
  if (task.examMode) details.push(EXAM_MODES[task.examMode]);
  return `[${TASK_TYPES[task.type]}] ${task.title}（${details.join("，")}）`;
}
