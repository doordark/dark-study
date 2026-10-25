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
): Course | undefined {
  return (
    schedule.courses.find((c) => c.id === courseId) ??
    (courseName
      ? schedule.courses.find((c) => c.name === courseName)
      : undefined)
  );
}

/** 执行一条课表操作，返回给人看的结果文案 */
export function applyScheduleAction(
  action: ScheduleAction,
  schedule: Schedule,
): string {
  const store = useStore.getState();
  switch (action.type) {
    case "add": {
      const draft = normalizeDraft(action.course, schedule);
      if (!draft) return "添加失败：节次数据无效";
      store.addCourse(draft);
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
      const target = resolveCourse(schedule, action.courseId, action.courseName);
      if (!target)
        return `未找到课程「${action.courseName ?? action.courseId}」`;
      const patch: Partial<Course> = { ...action.patch };
      if (patch.startPeriod != null || patch.endPeriod != null) {
        const clamped = clampPeriods(
          schedule.periods,
          patch.startPeriod ?? target.startPeriod,
          patch.endPeriod ?? target.endPeriod,
        );
        if (clamped) Object.assign(patch, clamped);
      }
      if (patch.weeks) {
        const totalWeeks = Math.max(1, schedule.totalWeeks ?? 18);
        patch.weeks = [
          ...new Set(patch.weeks.filter((w) => w >= 1 && w <= totalWeeks)),
        ].sort((a, b) => a - b);
      }
      store.updateCourse(target.id, patch);
      return `已更新「${target.name}」`;
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
  return actions.map((a) => applyScheduleAction(a, schedule));
}
