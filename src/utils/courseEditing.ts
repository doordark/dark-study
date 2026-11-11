import type { Course, Period, Schedule } from "@/types";
import { periodAtTime, periodEndingAtTime, timeToMinutes } from "@/utils/time";

export function validClock(value: unknown): value is string {
  return typeof value === "string" && /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(value);
}

export function validatePeriods(periods: Period[], courses: Course[] = []): string | null {
  if (!periods.length) return "至少保留一个节次";
  for (let i = 0; i < periods.length; i++) {
    const p = periods[i];
    if (p.index !== i + 1) return "节次必须从 1 开始连续编号";
    if (!validClock(p.startTime) || !validClock(p.endTime)) return "请使用 24 小时制 HH:mm（例如 08:00）";
    if (timeToMinutes(p.startTime) >= timeToMinutes(p.endTime)) return `第 ${p.index} 节结束时间必须晚于开始时间`;
    if (i && timeToMinutes(p.startTime) < timeToMinutes(periods[i - 1].endTime)) return "节次时间不能重叠或倒序";
  }
  if (courses.some(c => c.startPeriod > periods.length || c.endPeriod > periods.length)) return "被课程使用的节次不能删除，请先调整课程";
  return null;
}

/** 所有改课入口共用校验，精确时间同时派生节次。 */
export function normalizeCoursePatch(target: Course, patch: Partial<Course>, schedule: Schedule): Partial<Course> {
  const result = { ...patch };
  delete result.id;
  if (result.startPeriod !== undefined || result.endPeriod !== undefined) {
    result.startTime = result.startTime ?? undefined;
    result.endTime = result.endTime ?? undefined;
  }
  const next = { ...target, ...result };
  if (next.startTime || next.endTime) {
    const start = next.startTime ?? schedule.periods.find(p => p.index === next.startPeriod)?.startTime;
    const end = next.endTime ?? schedule.periods.find(p => p.index === next.endPeriod)?.endTime;
    if (!validClock(start) || !validClock(end) || timeToMinutes(end) <= timeToMinutes(start)) throw new Error("课程起止时间无效");
    if (timeToMinutes(start) < timeToMinutes(schedule.periods[0].startTime) || timeToMinutes(end) > timeToMinutes(schedule.periods[schedule.periods.length - 1].endTime)) throw new Error("时间超出作息表范围，请先编辑作息表");
    result.startPeriod = periodAtTime(schedule.periods, start)!;
    result.endPeriod = periodEndingAtTime(schedule.periods, end)!;
    result.startTime = start;
    result.endTime = end;
  }
  const merged = { ...target, ...result };
  if (!merged.name.trim()) throw new Error("请输入课程名称");
  if (!Number.isInteger(merged.weekday) || merged.weekday < 1 || merged.weekday > 7) throw new Error("星期必须为 1 到 7");
  if (!Number.isInteger(merged.startPeriod) || !Number.isInteger(merged.endPeriod) || merged.endPeriod < merged.startPeriod || !schedule.periods.some(p => p.index === merged.startPeriod) || !schedule.periods.some(p => p.index === merged.endPeriod)) throw new Error("课程节次无效");
  if (!Array.isArray(merged.weeks) || !merged.weeks.length || merged.weeks.some(w => !Number.isInteger(w) || w < 1 || w > schedule.totalWeeks)) throw new Error("请选择学期内有效的上课周次");
  return result;
}

export function editCourseWeeks(courses: Course[], id: string, patch: Partial<Course>, targetWeeks: number[], newId: string): Course[] {
  const target = courses.find(c => c.id === id);
  if (!target || !targetWeeks.length || targetWeeks.some(w => !target.weeks.includes(w))) throw new Error("修改范围不属于原课程的上课周次");
  const selected = [...new Set(targetWeeks)].sort((a,b) => a-b);
  const remaining = target.weeks.filter(w => !selected.includes(w));
  return courses.flatMap(c => c.id !== id ? [c] : [
    ...(remaining.length ? [{ ...c, weeks: remaining }] : []),
    { ...c, ...patch, id: remaining.length ? newId : c.id, weeks: patch.weeks ?? selected },
  ]);
}
