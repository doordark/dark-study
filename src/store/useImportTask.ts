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
  | { type: "grades"; grades: GradeDraft[]; yearId?: string; sources?: ImportRowSource[] }
  | { type: "count"; count: number };

export interface ImportTaskState {
  status: TaskStatus;
  kind: TaskKind | null;
  /** 任务序号：每次 open 递增，用于结果弹窗按任务实例重挂（内部选择自动重置） */
  seq: number;
  /** 任务名，如「课程表识别」 */
  label: string;
  /** 素材来源描述：照片 / 文档 */
  sourceLabel: string;
  phase: string;
  progress: number;
  /** true=弹窗展示，false=收起为悬浮进度球 */
  expanded: boolean;
  result: TaskResult | null;
  message: string;
  retry: ImportPageRetry | null;

  open: (kind: TaskKind, sourceLabel: string) => void;
  setPhase: (phase: string, progress: number) => void;
  complete: (result: TaskResult, message: string, retry?: ImportPageRetry) => void;
  fail: (message: string, retry?: ImportPageRetry) => void;
  /** 结果被确认应用后：清掉待确认结果，仅保留反馈文案 */
  ack: (message: string) => void;
  setExpanded: (expanded: boolean) => void;
  editCourse: (expected: TaskResult, index: number, course: Course) => boolean;
  editGrade: (expected: TaskResult, index: number, grade: GradeDraft) => boolean;
  clear: () => void;
}

const KIND_LABEL: Record<TaskKind, string> = {
  schedule: "课程表识别",
  periods: "作息表识别",
  grades: "成绩识别",
};

let timer: ReturnType<typeof setInterval> | null = null;
const markEdited = (sources: ImportRowSource[] | undefined, index: number) =>
  sources?.map((source, i) => i === index ? { ...source, edited: true } : source);

function stopTimer() {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
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
    set((s) => ({
      status: "analyzing",
      kind,
      seq: s.seq + 1,
      label: KIND_LABEL[kind],
      sourceLabel,
      phase: `${sourceLabel}已导入，正在准备分析awa…`,
      progress: 8,
      expanded: true,
      result: null,
      message: "",
      retry: null,
    }));
    // 模型不回传真实进度：用渐进阶段给用户连续的进度反馈
    timer = setInterval(() => {
      const s = get();
      if (s.status !== "analyzing") {
        stopTimer();
        return;
      }
      const next = Math.min(92, s.progress + 3 + Math.random() * 5);
      const phase =
        next < 35
          ? `${sourceLabel}已导入，正在上传…`
          : next < 70
            ? s.kind === "grades"
              ? "正在提取课程、学分与成绩…"
              : "正在处理导入内容…"
            : s.kind === "grades"
              ? "正在整理成绩数据…"
              : "正在整理结构化数据…";
      set({ progress: next, phase });
    }, 700);
  },

  setPhase: (phase, progress) => set({ phase, progress }),

  complete: (result, message, retry) => {
    stopTimer();
    set({
      status: "done",
      result,
      message,
      retry: retry ?? null,
      progress: 100,
      phase: "(o゜▽゜)o☆[BINGO!] 分析完成",
      expanded: true,
    });
  },

  fail: (message, retry) => {
    stopTimer();
    set({
      status: "error",
      message,
      retry: retry ?? null,
      phase: "啊偶QAQ分析失败",
      expanded: true,
    });
  },

  ack: (message) => set({ result: null, message, retry: null }),

  setExpanded: (expanded) => set({ expanded }),
  editCourse: (expected, index, course) => {
    const { result, status } = get();
    if (status !== "done" || result !== expected || result.type !== "schedule" || !result.schedule.courses[index]) return false;
    const courses = result.schedule.courses.map((row, i) => i === index ? course : row);
    set({ result: { ...result, schedule: { ...result.schedule, courses }, sources: markEdited(result.sources, index) } });
    return true;
  },
  editGrade: (expected, index, grade) => {
    const { result, status } = get();
    if (status !== "done" || result !== expected || result.type !== "grades" || !result.grades[index]) return false;
    set({ result: { ...result, grades: result.grades.map((row, i) => i === index ? grade : row), sources: markEdited(result.sources, index) } });
    return true;
  },

  clear: () => {
    stopTimer();
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
