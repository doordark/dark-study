import { create } from "zustand";

import { UPDATE_MIRRORS } from "@/config/update";
import type { ReleaseInfo } from "@/services/updater";
import {
  createApkDownload,
  detectFastestUpdateRoute,
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
  /** 下载镜像前缀（空字符串表示 GitHub 直连） */
  mirrorPrefix: string;

  setMirrorPrefix: (prefix: string) => void;
  check: () => Promise<void>;
  download: () => Promise<void>;
  cancelDownload: () => void;
  install: () => Promise<void>;
}

const errMsg = (e: unknown) =>
  e instanceof Error ? e.message : typeof e === "string" ? e : "未知错误";

/** 模块级下载句柄与取消标记（不放进 zustand，避免闭包陈旧） */
let activeCancel: (() => void) | null = null;
let downloadGeneration = 0;

export const useUpdateTask = create<UpdateState>()((set, get) => ({
  phase: "idle",
  info: null,
  progress: 0,
  message: "",
  fileUri: null,
  lastCheckedAt: null,
  mirrorPrefix: "",

  setMirrorPrefix: (prefix: string) => {
    set({ mirrorPrefix: prefix.trim() });
  },

  check: async () => {
    const { phase, mirrorPrefix } = get();
    if (phase === "checking" || phase === "downloading") return;
    set({ phase: "checking", message: "" });
    try {
      const defaultFallbacks = (Array.isArray(UPDATE_MIRRORS) ? UPDATE_MIRRORS : [])
        .map((item) => item.prefix)
        .filter((prefix) => prefix !== mirrorPrefix);
      const route =
        typeof detectFastestUpdateRoute === "function"
          ? await detectFastestUpdateRoute()
          : {
              fastestPrefix: mirrorPrefix,
              orderedPrefixes: [mirrorPrefix, ...defaultFallbacks],
              fallbackMirrors: defaultFallbacks,
            };
      const primaryPrefix = route.fastestPrefix;
      set({ mirrorPrefix: primaryPrefix });
      const info = await fetchLatestRelease({
        mirrorPrefix: primaryPrefix,
        orderedPrefixes: route.orderedPrefixes,
      });
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
    const { phase, info, mirrorPrefix } = get();
    if (phase !== "available" || !info) return;
    const generation = ++downloadGeneration;
    const current = () => generation === downloadGeneration;
    set({ phase: "downloading", progress: 0, message: "" });

    const defaultFallbacks = (Array.isArray(UPDATE_MIRRORS) ? UPDATE_MIRRORS : [])
      .map((item) => item.prefix)
      .filter((prefix) => prefix !== mirrorPrefix);

    let primaryMirror = mirrorPrefix;
    let fallbackMirrors = defaultFallbacks;
    if (typeof detectFastestUpdateRoute === "function") {
      try {
        const route = await detectFastestUpdateRoute(info.apkUrl);
        if (!current()) return;
        primaryMirror = route.fastestPrefix;
        fallbackMirrors = route.fallbackMirrors;
        set({ mirrorPrefix: primaryMirror });
      } catch {
        if (!current()) return;
      }
    }

    /** 进度按整数百分比去重上报，避免高频 setState 抖动渲染 */
    let lastPercent = -1;
    const { promise, cancel } = createApkDownload(
      info.apkUrl,
      (p) => {
        const percent = Math.floor(p * 100);
        if (current() && percent !== lastPercent) {
          lastPercent = percent;
          set({ progress: p });
        }
      },
      {
        expectedSha256: info.sha256,
        mirrorPrefix: primaryMirror,
        fallbackMirrors,
      },
    );
    activeCancel = cancel;
    try {
      const uri = await promise;
      if (!current()) return;
      activeCancel = null;
      if (get().phase === "downloading") {
        set({ phase: "downloaded", fileUri: uri, progress: 1 });
      }
    } catch (e) {
      if (!current()) return;
      activeCancel = null;
      if (get().phase === "downloading") {
        set({ phase: "error", message: `下载失败：${errMsg(e)}` });
      }
    }
  },

  cancelDownload: () => {
    downloadGeneration += 1;
    activeCancel?.();
    activeCancel = null;
    if (get().phase === "downloading") {
      set({ phase: "available", progress: 0 });
    }
  },

  install: async () => {
    const { phase, fileUri, info } = get();
    if (phase !== "downloaded" || !fileUri) return;
    try {
      // 缓存可能被系统清理或文件被篡改：先确认安装包有效
      if (!(await verifyApk(fileUri, info?.sha256))) {
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
