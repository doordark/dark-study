import { create } from "zustand";

import type { Course, GradeDraft, Period, Schedule } from "@/types";

export type TaskKind = "schedule" | "periods" | "grades";
export type TaskStatus = "idle" | "analyzing" | "done" | "error";
export interface ImportPageRetry {
  pages: number[];
  run: () => Promise<void>;
}
export interface ImportRowSource {
  key: string;
  pages: number[];
  edited?: boolean;
}

export type TaskResult =
  | { type: "schedule"; schedule: Schedule; sources?: ImportRowSource[] }
  | { type: "periods"; periods: Period[]; scheduleId?: string }
  | {
      type: "grades";
      grades: GradeDraft[];
      yearId?: string;
      sources?: ImportRowSource[];
    }
  | { type: "count"; count: number };

export interface ImportTaskState {
  status: TaskStatus;
  kind: TaskKind | null;
  /** 任务序号：每次 open 递增，用于结果弹窗按任务实例重挂（内部选择自动重置） */
  seq: number;
  /** 任务名，如「课程表识别」 */
  label: string;
  /** 素材来源描述：照片 / 文档 / 粘贴文本 */
  sourceLabel: string;
  phase: string;
  progress: number;
  /** true=弹窗展示，false=收起为悬浮进度球 */
  expanded: boolean;
  result: TaskResult | null;
  message: string;
  retry: ImportPageRetry | null;

  open: (kind: TaskKind, sourceLabel: string) => AbortSignal;
  getSignal: () => AbortSignal | undefined;
  setPhase: (phase: string, progress: number) => void;
  complete: (
    result: TaskResult,
    message: string,
    retry?: ImportPageRetry,
  ) => void;
  fail: (message: string, retry?: ImportPageRetry) => void;
  /** 用户主动取消正在进行的分析任务 */
  cancel: () => void;
  /** 结果被确认应用后：清掉待确认结果，仅保留反馈文案 */
  ack: (message: string) => void;
  setExpanded: (expanded: boolean) => void;
  editCourse: (expected: TaskResult, index: number, course: Course) => boolean;
  removeCourse: (expected: TaskResult, index: number) => boolean;
  editGrade: (
    expected: TaskResult,
    index: number,
    grade: GradeDraft,
  ) => boolean;
  removeGrade: (expected: TaskResult, index: number) => boolean;
  setGradeTargetYear: (expected: TaskResult, yearId: string) => boolean;
  editPeriod: (expected: TaskResult, index: number, period: Period) => boolean;
  removePeriod: (expected: TaskResult, index: number) => boolean;
  clear: () => void;
}

const KIND_LABEL: Record<TaskKind, string> = {
  schedule: "课程表识别",
  periods: "作息表识别",
  grades: "成绩识别",
};

let timer: ReturnType<typeof setInterval> | null = null;
let activeController: AbortController | null = null;
/** 一旦业务侧调用过 setPhase 显式写入真实阶段文案，模拟定时器只微调进度且绝不覆写文案或回退进度 */
let hasExplicitPhase = false;

const markEdited = (sources: ImportRowSource[] | undefined, index: number) =>
  sources?.map((source, i) =>
    i === index ? { ...source, edited: true } : source,
  );

function stopTimer() {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
}

function resetController(abortExisting: boolean) {
  if (abortExisting && activeController) {
    activeController.abort();
  }
  activeController = null;
}

export const useImportTask = create<ImportTaskState>((set, get) => ({
  status: "idle",
  kind: null,
  seq: 0,
  label: "",
  sourceLabel: "",
  phase: "",
  progress: 0,
  expanded: true,
  result: null,
  message: "",
  retry: null,

  open: (kind, sourceLabel) => {
    stopTimer();
    resetController(true);
    activeController = new AbortController();
    hasExplicitPhase = false;
    set((s) => ({
      status: "analyzing",
      kind,
      seq: s.seq + 1,
      label: KIND_LABEL[kind],
      sourceLabel,
      phase: `${sourceLabel}已导入，正在准备分析…`,
      progress: 8,
      expanded: true,
      result: null,
      message: "",
      retry: null,
    }));
    // 渐进反馈：仅在未设置显式阶段时更新通用文案，进度严格单调不回退
    timer = setInterval(() => {
      const s = get();
      if (s.status !== "analyzing") {
        stopTimer();
        return;
      }
      const step = hasExplicitPhase ? 0.8 + Math.random() * 1.2 : 3 + Math.random() * 4;
      const next = Math.min(92, s.progress + step);
      if (hasExplicitPhase) {
        set({ progress: next });
        return;
      }
      const phase =
        next < 35
          ? `${sourceLabel}已导入，正在上传…`
          : next < 70
            ? s.kind === "grades"
              ? "正在提取课程、学分与成绩…"
              : s.kind === "periods"
                ? "正在提取作息节次与起止时间…"
                : "正在处理导入内容…"
            : s.kind === "grades"
              ? "正在整理成绩数据…"
              : "正在整理结构化数据…";
      set({ progress: next, phase });
    }, 700);
    return activeController.signal;
  },

  getSignal: () => activeController?.signal,

  setPhase: (phase, progress) => {
    hasExplicitPhase = true;
    set((s) => ({
      phase,
      progress: Math.min(95, Math.max(s.progress, progress)),
    }));
  },

  complete: (result, message, retry) => {
    stopTimer();
    resetController(false);
    set({
      status: "done",
      result,
      message,
      retry: retry ?? null,
      progress: 100,
      phase: "分析完成",
      expanded: true,
    });
  },

  fail: (message, retry) => {
    stopTimer();
    resetController(false);
    set({
      status: "error",
      message,
      retry: retry ?? null,
      phase: "分析失败",
      expanded: true,
    });
  },

  cancel: () => {
    stopTimer();
    resetController(true);
    hasExplicitPhase = false;
    set((s) => ({
      status: "idle",
      kind: null,
      seq: s.seq + 1,
      label: "",
      sourceLabel: "",
      phase: "",
      progress: 0,
      expanded: true,
      result: null,
      message: "",
      retry: null,
    }));
  },

  ack: (message) => set({ result: null, message, retry: null }),

  setExpanded: (expanded) => set({ expanded }),

  editCourse: (expected, index, course) => {
    const { result, status } = get();
    if (
      status !== "done" ||
      result !== expected ||
      result.type !== "schedule" ||
      !result.schedule.courses[index]
    ) {
      return false;
    }
    const courses = result.schedule.courses.map((row, i) =>
      i === index ? course : row,
    );
    set({
      result: {
        ...result,
        schedule: { ...result.schedule, courses },
        sources: markEdited(result.sources, index),
      },
    });
    return true;
  },

  removeCourse: (expected, index) => {
    const { result, status } = get();
    if (
      status !== "done" ||
      result !== expected ||
      result.type !== "schedule" ||
      !result.schedule.courses[index]
    ) {
      return false;
    }
    const courses = result.schedule.courses.filter((_, i) => i !== index);
    const sources = result.sources?.filter((_, i) => i !== index);
    set({
      result: {
        ...result,
        schedule: { ...result.schedule, courses },
        ...(sources ? { sources } : {}),
      },
    });
    return true;
  },

  editGrade: (expected, index, grade) => {
    const { result, status } = get();
    if (
      status !== "done" ||
      result !== expected ||
      result.type !== "grades" ||
      !result.grades[index]
    ) {
      return false;
    }
    set({
      result: {
        ...result,
        grades: result.grades.map((row, i) => (i === index ? grade : row)),
        sources: markEdited(result.sources, index),
      },
    });
    return true;
  },

  removeGrade: (expected, index) => {
    const { result, status } = get();
    if (
      status !== "done" ||
      result !== expected ||
      result.type !== "grades" ||
      !result.grades[index]
    ) {
      return false;
    }
    const grades = result.grades.filter((_, i) => i !== index);
    const sources = result.sources?.filter((_, i) => i !== index);
    set({
      result: {
        ...result,
        grades,
        ...(sources ? { sources } : {}),
      },
    });
    return true;
  },

  setGradeTargetYear: (expected, yearId) => {
    const { result, status } = get();
    if (status !== "done" || result !== expected || result.type !== "grades") {
      return false;
    }
    set({ result: { ...result, yearId } });
    return true;
  },

  editPeriod: (expected, index, period) => {
    const { result, status } = get();
    if (
      status !== "done" ||
      result !== expected ||
      result.type !== "periods" ||
      !result.periods[index]
    ) {
      return false;
    }
    const periods = result.periods.map((row, i) =>
      i === index ? { ...period, index: i + 1 } : row,
    );
    set({ result: { ...result, periods } });
    return true;
  },

  removePeriod: (expected, index) => {
    const { result, status } = get();
    if (
      status !== "done" ||
      result !== expected ||
      result.type !== "periods" ||
      !result.periods[index]
    ) {
      return false;
    }
    const periods = result.periods
      .filter((_, i) => i !== index)
      .map((row, i) => ({ ...row, index: i + 1 }));
    set({ result: { ...result, periods } });
    return true;
  },

  clear: () => {
    stopTimer();
    resetController(true);
    hasExplicitPhase = false;
    set({
      status: "idle",
      kind: null,
      label: "",
      sourceLabel: "",
      phase: "",
      progress: 0,
      expanded: true,
      result: null,
      message: "",
      retry: null,
    });
  },
}));
