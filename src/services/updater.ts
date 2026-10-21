import Constants from "expo-constants";
import * as FileSystem from "expo-file-system/legacy";
import { ActivityAction, startActivityAsync } from "expo-intent-launcher";
import { Platform } from "react-native";

import { GITHUB_REPO } from "@/config/update";

/** 覆盖安装的 APK MIME 类型 */
const APK_MIME = "application/vnd.android.package-archive";
/** FLAG_GRANT_READ_URI_PERMISSION：允许安装器读取我们共享的 content:// 文件 */
const FLAG_GRANT_READ = 1;

const APK_DIR = "update-apk";
const APK_NAME = "dark-study-update.apk";

export interface ReleaseInfo {
  /** 语义化版本（无 v 前缀），如 "1.1.0" */
  version: string;
  /** 原始 tag，如 "v1.1.0" */
  tagName: string;
  /** Release 说明 */
  notes: string;
  /** APK 附件下载地址 */
  apkUrl: string;
  /** APK 大小（字节） */
  apkSize: number;
  publishedAt: string;
}

const normalize = (v: string) => v.trim().replace(/^v/i, "");

/** 当前运行的版本号（构建时由 app.json 注入） */
export function currentVersion(): string {
  return normalize(Constants.expoConfig?.version ?? "0.0.0");
}

/** 应用包名（覆盖安装要求新旧包名一致，数据才会保留） */
export function appPackageName(): string {
  return Constants.expoConfig?.android?.package ?? "";
}

export function isAndroid(): boolean {
  return Platform.OS === "android";
}

/** 比较 a 与 b：>0 表示 a 更新，<0 表示 b 更新，0 相同（按段数值比较，容忍 v 前缀） */
export function compareVersions(a: string, b: string): number {
  const pa = normalize(a)
    .split(".")
    .map((x) => parseInt(x, 10) || 0);
  const pb = normalize(b)
    .split(".")
    .map((x) => parseInt(x, 10) || 0);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const d = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (d) return d;
  }
  return 0;
}

/** 拉取 GitHub 最新 Release 并解析 APK 附件信息 */
export async function fetchLatestRelease(): Promise<ReleaseInfo> {
  // 弱网环境下避免「检查中」无限挂起
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15_000);
  let res: Response;
  try {
    res = await fetch(
      `https://api.github.com/repos/${GITHUB_REPO}/releases/latest`,
      {
        headers: { Accept: "application/vnd.github+json" },
        signal: controller.signal,
      },
    );
  } catch {
    throw new Error("网络连接失败，请检查网络后重试");
  } finally {
    clearTimeout(timer);
  }
  if (res.status === 404) throw new Error("仓库还没有发布任何版本");
  if (res.status === 403) throw new Error("请求过于频繁，请稍后再试");
  if (!res.ok) throw new Error(`GitHub 接口异常（HTTP ${res.status}）`);
  const data = (await res.json()) as {
    tag_name?: string;
    body?: string;
    published_at?: string;
    assets?: { browser_download_url?: string; size?: number }[];
  };
  const asset = (data.assets ?? []).find((a) =>
    a.browser_download_url?.toLowerCase().endsWith(".apk"),
  );
  if (!data.tag_name || !asset?.browser_download_url) {
    throw new Error("最新 Release 中没有找到 APK 附件");
  }
  return {
    version: normalize(data.tag_name),
    tagName: data.tag_name,
    notes: (data.body ?? "").trim(),
    apkUrl: asset.browser_download_url,
    apkSize: asset.size ?? 0,
    publishedAt: data.published_at ?? "",
  };
}

/** 最新版本是否比当前版本更新 */
export function isNewer(latest: ReleaseInfo): boolean {
  return compareVersions(latest.version, currentVersion()) > 0;
}

const apkFileUri = () => {
  const cache = FileSystem.cacheDirectory;
  if (!cache) throw new Error("无法访问应用缓存目录");
  return `${cache}${APK_DIR}/${APK_NAME}`;
};

/** 下载到本地缓存，返回 promise 与取消句柄；onProgress 以 0..1 上报 */
export function createApkDownload(
  url: string,
  onProgress: (p: number) => void,
): { promise: Promise<string>; cancel: () => void } {
  const fileUri = apkFileUri();
  const task = FileSystem.createDownloadResumable(url, fileUri, {}, (p) => {
    const total = p.totalBytesExpectedToWrite;
    if (total > 0) onProgress(Math.min(1, p.totalBytesWritten / total));
  });
  return {
    promise: task.downloadAsync().then((r) => {
      if (!r?.uri) throw new Error("下载未完成");
      return r.uri;
    }),
    cancel: () => {
      task.cancelAsync().catch(() => {});
    },
  };
}

/** 确认之前下载的 APK 仍存在（缓存可能被系统清理） */
export async function verifyApk(fileUri: string): Promise<boolean> {
  try {
    const info = await FileSystem.getInfoAsync(fileUri);
    return info.exists;
  } catch {
    return false;
  }
}

/** 调起系统安装器覆盖安装（同包名、更高 versionCode，用户数据自动保留） */
export async function installApk(fileUri: string): Promise<void> {
  const contentUri = await FileSystem.getContentUriAsync(fileUri);
  await startActivityAsync("android.intent.action.VIEW", {
    data: contentUri,
    type: APK_MIME,
    flags: FLAG_GRANT_READ,
  });
}

/** 打开「允许安装未知应用」的系统设置页（定位到本应用） */
export async function openInstallPermissionSettings(): Promise<void> {
  await startActivityAsync(ActivityAction.MANAGE_UNKNOWN_APP_SOURCES, {
    data: `package:${appPackageName()}`,
  });
}

/** 字节数 → 人类可读大小 */
export function formatBytes(bytes: number): string {
  if (!bytes) return "";
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}
