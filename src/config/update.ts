/**
 * 应用内更新配置。
 * 新版本发布流程：GitHub Releases 发布一个 Release（tag 形如 v1.1.0），
 * 并把构建出的 .apk（及可选的 .sha256 / checksums.txt）作为附件上传，
 * App 内「检查更新」会自动发现并下载校验安装。
 */
export const GITHUB_REPO = "doordark/dark-study";

export const UPDATE_ROUTE_CACHE_TTL_MS = 5 * 60_000;
export const UPDATE_ROUTE_PROBE_TIMEOUT_MS = 3_500;
export const DEFAULT_UPDATE_PROBE_URL = `https://github.com/${GITHUB_REPO}/releases/latest`;

export interface UpdateMirrorPreset {
  id: "direct" | "ghproxy" | "ghfast";
  label: string;
  prefix: string;
}

export const UPDATE_MIRRORS: readonly UpdateMirrorPreset[] = [
  { id: "direct", label: "GitHub 直连", prefix: "" },
  { id: "ghproxy", label: "镜像加速 (gh-proxy)", prefix: "https://gh-proxy.com/" },
  { id: "ghfast", label: "镜像加速 (ghfast)", prefix: "https://ghfast.top/" },
] as const;

/** 将下载地址按镜像前缀改写（空前缀返回原地址，已带同前缀时保持幂等） */
export function applyMirrorUrl(url: string, prefix: string): string {
  const trimmedUrl = url.trim();
  const trimmedPrefix = prefix.trim();
  if (!trimmedUrl || !trimmedPrefix) return trimmedUrl;
  if (!/^https?:\/\//i.test(trimmedUrl)) return trimmedUrl;
  const normalizedPrefix = trimmedPrefix.endsWith("/")
    ? trimmedPrefix
    : `${trimmedPrefix}/`;
  if (trimmedUrl.startsWith(normalizedPrefix)) return trimmedUrl;
  return `${normalizedPrefix}${trimmedUrl}`;
}
