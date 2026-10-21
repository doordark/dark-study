import { create } from "zustand";

import type { GradeRecord, Period, Schedule } from "@/types";

export type TaskKind = "schedule" | "periods" | "grades";
export type TaskStatus = "idle" | "analyzing" | "done" | "error";

export type TaskResult =
  | { type: "schedule"; schedule: Schedule }
  | { type: "periods"; periods: Period[] }
  | { type: "grades"; grades: Omit<GradeRecord, "id">[] }
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

  open: (kind: TaskKind, sourceLabel: string) => void;
  setPhase: (phase: string, progress: number) => void;
  complete: (result: TaskResult, message: string) => void;
  fail: (message: string) => void;
  /** 结果被确认应用后：清掉待确认结果，仅保留反馈文案 */
  ack: (message: string) => void;
  setExpanded: (expanded: boolean) => void;
  clear: () => void;
}

const KIND_LABEL: Record<TaskKind, string> = {
  schedule: "课程表识别",
  periods: "作息表识别",
  grades: "成绩识别",
};

let timer: ReturnType<typeof setInterval> | null = null;

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

  open: (kind, sourceLabel) => {
    stopTimer();
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
              : "AI 正在解析画面内容…"
            : s.kind === "grades"
              ? "正在整理成绩数据…"
              : "正在整理结构化数据…";
      set({ progress: next, phase });
    }, 700);
  },

  setPhase: (phase, progress) => set({ phase, progress }),

  complete: (result, message) => {
    stopTimer();
    set({
      status: "done",
      result,
      message,
      progress: 100,
      phase: "分析完成",
      expanded: true,
    });
  },

  fail: (message) => {
    stopTimer();
    set({
      status: "error",
      message,
      phase: "分析失败",
      expanded: true,
    });
  },

  ack: (message) => set({ result: null, message }),

  setExpanded: (expanded) => set({ expanded }),

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
    });
  },
}));
