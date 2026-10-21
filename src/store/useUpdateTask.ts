import { create } from "zustand";

import type { ReleaseInfo } from "@/services/updater";
import {
  createApkDownload,
  fetchLatestRelease,
  installApk,
  isNewer,
  verifyApk,
} from "@/services/updater";

export type UpdatePhase =
  | "idle"
  | "checking"
  | "upToDate"
  | "available"
  | "downloading"
  | "downloaded"
  | "error";

interface UpdateState {
  phase: UpdatePhase;
  /** 最新版本信息（upToDate / available / downloading / downloaded 阶段有效） */
  info: ReleaseInfo | null;
  /** 下载进度 0..1 */
  progress: number;
  /** 错误或提示文案 */
  message: string;
  /** 已下载 APK 的本地路径 */
  fileUri: string | null;
  /** 上次检查时间戳 */
  lastCheckedAt: number | null;

  check: () => Promise<void>;
  download: () => Promise<void>;
  cancelDownload: () => void;
  install: () => Promise<void>;
}

const errMsg = (e: unknown) =>
  e instanceof Error ? e.message : typeof e === "string" ? e : "未知错误";

/** 模块级下载句柄与取消标记（不放进 zustand，避免闭包陈旧） */
let activeCancel: (() => void) | null = null;
let cancelRequested = false;

export const useUpdateTask = create<UpdateState>()((set, get) => ({
  phase: "idle",
  info: null,
  progress: 0,
  message: "",
  fileUri: null,
  lastCheckedAt: null,

  check: async () => {
    const { phase } = get();
    if (phase === "checking" || phase === "downloading") return;
    set({ phase: "checking", message: "" });
    try {
      const info = await fetchLatestRelease();
      if (isNewer(info)) {
        set({
          phase: "available",
          info,
          progress: 0,
          message: "",
          lastCheckedAt: Date.now(),
        });
      } else {
        set({ phase: "upToDate", info, lastCheckedAt: Date.now() });
      }
    } catch (e) {
      set({ phase: "error", message: errMsg(e), lastCheckedAt: Date.now() });
    }
  },

  download: async () => {
    const { phase, info } = get();
    if (phase !== "available" || !info) return;
    cancelRequested = false;
    set({ phase: "downloading", progress: 0, message: "" });
    /** 进度按整数百分比去重上报，避免高频 setState 抖动渲染 */
    let lastPercent = -1;
    const { promise, cancel } = createApkDownload(info.apkUrl, (p) => {
      const percent = Math.floor(p * 100);
      if (percent !== lastPercent) {
        lastPercent = percent;
        set({ progress: p });
      }
    });
    activeCancel = cancel;
    try {
      const uri = await promise;
      activeCancel = null;
      if (get().phase === "downloading") {
        set({ phase: "downloaded", fileUri: uri, progress: 1 });
      }
    } catch (e) {
      activeCancel = null;
      if (cancelRequested) return; // 用户主动取消，cancelDownload 已复位状态
      if (get().phase === "downloading") {
        set({ phase: "error", message: `下载失败：${errMsg(e)}` });
      }
    }
  },

  cancelDownload: () => {
    cancelRequested = true;
    activeCancel?.();
    activeCancel = null;
    if (get().phase === "downloading") {
      set({ phase: "available", progress: 0 });
    }
  },

  install: async () => {
    const { phase, fileUri } = get();
    if (phase !== "downloaded" || !fileUri) return;
    try {
      // 缓存可能被系统清理：先确认安装包还在
      if (!(await verifyApk(fileUri))) {
        set({
          phase: "available",
          fileUri: null,
          message: "安装包已失效，请重新下载",
        });
        return;
      }
      await installApk(fileUri);
    } catch (e) {
      set({ phase: "error", message: `无法启动安装：${errMsg(e)}` });
    }
  },
}));
