import { useStore } from "@/store/useStore";
import { clampPeriods } from "@/utils/time";
import type { Course, Schedule, ScheduleAction } from "@/types";

/**
 * AI 返回的课表操作 → 真正写库。
 *
 * 助手页与桌宠小对话框都走这一份逻辑，避免两边校验规则漂移
 * （模型给的节次越界、id 对不上、周次超学期都要在这里兜住）。
 */

/** 校验并规范化模型返回的课程草稿（节次钳位、周次默认整学期） */
function normalizeDraft(
  draft: Omit<Course, "id">,
  schedule: Schedule,
): Omit<Course, "id"> | null {
  const clamped = clampPeriods(
    schedule.periods,
    Number(draft.startPeriod) || 1,
    Number(draft.endPeriod) || 1,
  );
  if (!clamped) return null;
  const totalWeeks = Math.max(1, schedule.totalWeeks ?? 18);
  const weeks =
    Array.isArray(draft.weeks) && draft.weeks.length
      ? [
          ...new Set(
            draft.weeks.filter(
              (w) => Number.isInteger(w) && w >= 1 && w <= totalWeeks,
            ),
          ),
        ].sort((a, b) => a - b)
      : Array.from({ length: totalWeeks }, (_, i) => i + 1);
  return {
    ...draft,
    name: String(draft.name ?? "").trim() || "未命名课程",
    weekday: Math.min(Math.max(Number(draft.weekday) || 1, 1), 7),
    startPeriod: clamped.startPeriod,
    endPeriod: clamped.endPeriod,
    weeks: weeks.length ? weeks : [1],
  };
}

/** 按 id 定位课程，找不到时按名称兜底（模型给的 id 可能不准） */
function resolveCourse(
  schedule: Schedule,
  courseId: string,
  courseName?: string,
  weeks?: number[],
  weekday?: number,
): Course | undefined {
  const candidates = schedule.courses.filter(c =>
    (!courseName || c.name === courseName) &&
    (weekday === undefined || c.weekday === weekday) &&
    (!weeks || weeks.every(w => c.weeks.includes(w))));
  const byId = candidates.find(c => c.id === courseId);
  return byId ?? (candidates.length === 1 && courseName ? candidates[0] : undefined);
}

/** 执行一条课表操作，返回给人看的结果文案 */
export function applyScheduleAction(
  action: ScheduleAction,
  schedule: Schedule,
): string {
  const store = useStore.getState();
  if (store.activeScheduleId !== schedule.id) return "课表已切换，请在当前课表重新确认操作";
  // Earlier operations in this batch may have edited or deleted a course.
  schedule = store.schedules.find((s) => s.id === schedule.id) ?? schedule;
  switch (action.type) {
    case "add": {
      const draft = normalizeDraft(action.course, schedule);
      if (!draft) return "添加失败：节次数据无效";
      try { store.addCourse(draft); }
      catch (error) { return `添加失败：${error instanceof Error ? error.message : "课程数据无效"}`; }
      return `已添加「${draft.name}」`;
    }
    case "remove": {
      const target = resolveCourse(schedule, action.courseId, action.courseName);
      if (!target)
        return `未找到课程「${action.courseName ?? action.courseId}」`;
      store.removeCourse(target.id);
      return `已删除「${target.name}」`;
    }
    case "update": {
      if (!action.patch || typeof action.patch !== "object" || Array.isArray(action.patch)) return "修改失败：缺少有效的课程修改内容";
      if (action.targetWeeks !== undefined && (!Array.isArray(action.targetWeeks) || !action.targetWeeks.length || action.targetWeeks.some(w => !Number.isInteger(w)))) return "修改失败：请选择有效的修改周次";
      const target = resolveCourse(schedule, action.courseId, action.courseName, action.targetWeeks, action.targetWeekday);
      if (!target)
        return `课程定位不唯一或不存在，请确认原课程的星期、周次和节次后重试`;
      try {
        store.updateCourse(target.id, action.patch, action.targetWeeks);
      } catch (error) { return `修改失败：${error instanceof Error ? error.message : "课程数据无效"}`; }
      const latest = useStore.getState().schedules.find(s => s.id === schedule.id);
      const updated = latest?.courses.find(c => c.name === (action.patch.name ?? target.name) && c.weekday === (action.patch.weekday ?? target.weekday) && (action.targetWeeks ?? target.weeks).some(w => c.weeks.includes(w)));
      return `已更新「${target.name}」${action.targetWeeks ? `（第${action.targetWeeks.join("、")}周）` : ""}${updated ? `，周${updated.weekday} 第${updated.startPeriod}–${updated.endPeriod}节${updated.startTime ? ` ${updated.startTime}–${updated.endTime}` : ""}` : ""}`;
    }
    case "create_schedule": {
      const name = String(action.scheduleName ?? "").trim();
      if (!name) return "新建失败：缺少课表名称";
      if (store.schedules.some((s) => s.name === name))
        return `课表「${name}」已存在，无需重复新建`;
      store.addSchedule(name);
      return `已新建课表「${name}」并切换为当前`;
    }
    case "merge_schedule": {
      const report = store.mergeSchedule(action.sourceScheduleName);
      if (!report.added && !report.skipped)
        return `未找到可合并的课表「${action.sourceScheduleName}」`;
      return (
        `已合并 ${report.added} 门课` +
        (report.skipped ? `，跳过 ${report.skipped} 门` : "") +
        (report.conflicts.length
          ? `，⚠ 时间冲突：${report.conflicts.join("；")}`
          : "，无时间冲突")
      );
    }
  }
}

/** 批量执行，返回每条操作的结果文案 */
export function applyScheduleActions(
  actions: ScheduleAction[],
  schedule: Schedule,
): string[] {
  if (useStore.getState().activeScheduleId !== schedule.id) {
    return actions.map(() => "课表已切换，请在当前课表重新确认操作");
  }
  return actions.map((action) => {
    const state = useStore.getState();
    const current = state.schedules.find((s) => s.id === state.activeScheduleId);
    return current ? applyScheduleAction(action, current) : "当前课表不存在，请重新选择课表";
  });
}
