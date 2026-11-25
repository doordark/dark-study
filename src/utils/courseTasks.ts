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

const record = (value: unknown): Record<string, unknown> => value && typeof value === "object" && !Array.isArray(value)
  ? value as Record<string, unknown> : {};
const validTime = (value: unknown): value is number => typeof value === "number" && Number.isSafeInteger(value) && value > 0 && value < 253402300800000;

function normalizeTaskDraft(value: unknown): CourseTaskDraft | null {
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
