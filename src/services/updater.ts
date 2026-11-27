import Constants from "expo-constants";
import * as FileSystem from "expo-file-system/legacy";
import { ActivityAction, startActivityAsync } from "expo-intent-launcher";
import { Platform } from "react-native";

import {
  applyMirrorUrl,
  DEFAULT_UPDATE_PROBE_URL,
  GITHUB_REPO,
  UPDATE_MIRRORS,
  UPDATE_ROUTE_CACHE_TTL_MS,
  UPDATE_ROUTE_PROBE_TIMEOUT_MS,
} from "@/config/update";
import { sha256Bytes, Sha256Hasher } from "@/utils/sha256";

/** 覆盖安装的 APK MIME 类型 */
const APK_MIME = "application/vnd.android.package-archive";
/** FLAG_GRANT_READ_URI_PERMISSION：允许安装器读取我们共享的 content:// 文件 */
const FLAG_GRANT_READ = 1;

const APK_DIR = "update-apk";
const STREAM_CHUNK_SIZE = 256 * 1024;
const HEX64_EXACT = /^[0-9a-fA-F]{64}$/;
const HEX64_TOKEN = /(?:^|[^0-9a-fA-F])([0-9a-fA-F]{64})(?![0-9a-fA-F])/;
const GNU_CHECKSUM_LINE = /^\s*([0-9a-fA-F]{64})\s+\*?(.+?)\s*$/;
const BSD_CHECKSUM_LINE = /^\s*SHA[-_]?256\s*\(([^)]+)\)\s*=\s*([0-9a-fA-F]{64})\s*$/i;
const LABELED_SHA256 =
  /sha[-_\s]?256\b[^0-9a-fA-F\r\n]{0,24}([0-9a-fA-F]{64})(?![0-9a-fA-F])/i;
const LABELED_SHA256_NEXTLINE =
  /sha[-_\s]?256\b[^\r\n]*\r?\n\s*(?:```[a-z0-9_-]*\r?\n\s*)?([0-9a-fA-F]{64})(?![0-9a-fA-F])/i;
const CHECKSUM_ASSET_PATTERN =
  /(?:\.sha256(?:sum)?$|^(?:sha256sums?|checksums?)(?:\.txt|\.sha256)?$)/i;

const BASE64_TABLE = (() => {
  const table = new Int16Array(128).fill(-1);
  const chars =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
  for (let i = 0; i < chars.length; i++) {
    table[chars.charCodeAt(i)] = i;
  }
  return table;
})();

let downloadId = 0;
const activeDownloads = new Set<string>();

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
  /** APK 的 SHA-256 校验摘要（64 位小写十六进制） */
  sha256?: string;
  /** 校验文件附件下载地址（如 .sha256 / checksums.txt） */
  checksumUrl?: string;
}

export interface FetchReleaseOptions {
  mirrorPrefix?: string;
  orderedPrefixes?: string[];
}

export interface DetectUpdateRouteOptions {
  timeoutMs?: number;
  ttlMs?: number;
  forceRefresh?: boolean;
  mirrors?: readonly string[];
}

export interface UpdateRouteMeasurement {
  prefix: string;
  ok: boolean;
  latencyMs: number;
  method?: "HEAD" | "RANGE";
  status?: number;
}

export interface UpdateRouteResult {
  fastestPrefix: string;
  orderedPrefixes: string[];
  fallbackMirrors: string[];
  fromCache: boolean;
  checkedAt: number;
  measurements: UpdateRouteMeasurement[];
}

export interface ApkDownloadOptions {
  expectedSha256?: string;
  mirrorPrefix?: string;
  fallbackMirrors?: string[];
}

const normalize = (v: string) => v.trim().replace(/^v/i, "");

function basenameLower(input: string): string {
  const cleaned = input.trim().replace(/[`"'*]/g, "").split(/[?#]/)[0] ?? "";
  const parts = cleaned.split(/[\\/]/);
  return (parts[parts.length - 1] ?? "").toLowerCase();
}

function withMirror(url: string, prefix: string): string {
  if (!prefix) return url;
  if (typeof applyMirrorUrl === "function") {
    return applyMirrorUrl(url, prefix);
  }
  const cleanPrefix = prefix.trim();
  if (!cleanPrefix || !/^https?:\/\//i.test(url)) return url;
  const normalized = cleanPrefix.endsWith("/") ? cleanPrefix : `${cleanPrefix}/`;
  return url.startsWith(normalized) ? url : `${normalized}${url}`;
}

function base64ToBytes(base64: string): Uint8Array {
  const cleaned = base64.replace(/[\r\n\s]/g, "");
  if (!cleaned) return new Uint8Array(0);
  let padding = 0;
  if (cleaned.endsWith("==")) padding = 2;
  else if (cleaned.endsWith("=")) padding = 1;
  const outLen = Math.max(0, Math.floor((cleaned.length * 3) / 4) - padding);
  const out = new Uint8Array(outLen);
  let outPos = 0;
  for (let i = 0; i < cleaned.length; i += 4) {
    const c0 = cleaned.charCodeAt(i);
    const c1 = cleaned.charCodeAt(i + 1);
    const c2 = cleaned.charCodeAt(i + 2);
    const c3 = cleaned.charCodeAt(i + 3);
    const v0 = c0 < 128 ? BASE64_TABLE[c0] : -1;
    const v1 = c1 < 128 ? BASE64_TABLE[c1] : -1;
    const v2 = c2 < 128 ? BASE64_TABLE[c2] : -1;
    const v3 = c3 < 128 ? BASE64_TABLE[c3] : -1;
    if (v0 < 0 || v1 < 0) break;
    const triple =
      (v0 << 18) | (v1 << 12) | ((v2 > 0 ? v2 : 0) << 6) | (v3 > 0 ? v3 : 0);
    if (outPos < outLen) out[outPos++] = (triple >>> 16) & 0xff;
    if (v2 >= 0 && outPos < outLen) out[outPos++] = (triple >>> 8) & 0xff;
    if (v3 >= 0 && outPos < outLen) out[outPos++] = triple & 0xff;
  }
  return outPos === outLen ? out : out.subarray(0, outPos);
}

function hasZipMagic(bytes: Uint8Array): boolean {
  return (
    bytes.length >= 4 &&
    bytes[0] === 0x50 &&
    bytes[1] === 0x4b &&
    bytes[2] === 0x03 &&
    bytes[3] === 0x04
  );
}

/** 从 Release 正文或 .sha256 / checksums.txt 文本中提取 64 位小写 SHA-256 */
export function extractSha256FromText(
  text: string,
  apkFilename?: string,
): string | undefined {
  if (!text || !text.trim()) return undefined;

  const targetName = apkFilename ? basenameLower(apkFilename) : "";
  const lines = text.split(/\r?\n/);

  const entries: { hash: string; file: string }[] = [];
  for (const line of lines) {
    const gnu = line.match(GNU_CHECKSUM_LINE);
    if (gnu) {
      entries.push({ hash: gnu[1].toLowerCase(), file: basenameLower(gnu[2]) });
      continue;
    }
    const bsd = line.match(BSD_CHECKSUM_LINE);
    if (bsd) {
      entries.push({ hash: bsd[2].toLowerCase(), file: basenameLower(bsd[1]) });
    }
  }

  if (entries.length > 0) {
    if (targetName) {
      const exact = entries.find((entry) => entry.file === targetName);
      if (exact) return exact.hash;
      if (entries.length === 1 && entries[0].file.endsWith(".apk")) {
        return entries[0].hash;
      }
      return undefined;
    }
    const apkEntry = entries.find((entry) => entry.file.endsWith(".apk"));
    return (apkEntry ?? entries[0]).hash;
  }

  if (targetName) {
    for (const line of lines) {
      if (!line.toLowerCase().includes(targetName)) continue;
      const match = line.match(HEX64_TOKEN);
      if (match) return match[1].toLowerCase();
    }
  }

  const labeled = text.match(LABELED_SHA256) ?? text.match(LABELED_SHA256_NEXTLINE);
  if (labeled) return labeled[1].toLowerCase();

  const stripped = text.trim().replace(/^`+|`+$/g, "").trim();
  if (HEX64_EXACT.test(stripped)) return stripped.toLowerCase();

  return undefined;
}

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

let routeCache: Omit<UpdateRouteResult, "fromCache"> | null = null;

export function clearUpdateRouteCache(): void {
  routeCache = null;
}

function getDefaultMirrorPrefixes(customMirrors?: readonly string[]): string[] {
  const raw =
    customMirrors && customMirrors.length > 0
      ? customMirrors
      : Array.isArray(UPDATE_MIRRORS)
        ? UPDATE_MIRRORS.map((m) => m.prefix)
        : ["", "https://gh-proxy.com/", "https://ghfast.top/"];
  const unique: string[] = [];
  for (const item of raw) {
    const trimmed = typeof item === "string" ? item.trim() : "";
    if (!unique.includes(trimmed)) {
      unique.push(trimmed);
    }
  }
  return unique.length > 0 ? unique : ["", "https://gh-proxy.com/", "https://ghfast.top/"];
}

async function probeSingleRoute(
  probeUrl: string,
  prefix: string,
  controller: AbortController,
  timeoutMs: number,
): Promise<UpdateRouteMeasurement> {
  const targetUrl = withMirror(probeUrl, prefix);
  const start = Date.now();
  const failMeasurement: UpdateRouteMeasurement = {
    prefix,
    ok: false,
    latencyMs: Number.POSITIVE_INFINITY,
  };
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  const runProbe = async (): Promise<UpdateRouteMeasurement> => {
    try {
      const headRes = await fetch(targetUrl, {
        method: "HEAD",
        signal: controller.signal,
      });
      if (headRes.ok || (headRes.status >= 200 && headRes.status < 400)) {
        return {
          prefix,
          ok: true,
          latencyMs: Math.max(1, Date.now() - start),
          method: "HEAD",
          status: headRes.status,
        };
      }

      if (controller.signal.aborted) {
        return failMeasurement;
      }

      // 部分镜像或对象存储不支持 HEAD，回退轻量 Range: bytes=0-0 探测
      const rangeRes = await fetch(targetUrl, {
        method: "GET",
        headers: { Range: "bytes=0-0" },
        signal: controller.signal,
      });
      try {
        await rangeRes.body?.cancel?.();
      } catch {
        // 忽略关闭响应流异常
      }
      if (rangeRes.ok || rangeRes.status === 206) {
        return {
          prefix,
          ok: true,
          latencyMs: Math.max(1, Date.now() - start),
          method: "RANGE",
          status: rangeRes.status,
        };
      }
      return {
        prefix,
        ok: false,
        latencyMs: Number.POSITIVE_INFINITY,
        method: "RANGE",
        status: rangeRes.status,
      };
    } catch {
      return failMeasurement;
    }
  };

  try {
    if (controller.signal.aborted) return failMeasurement;
    return await new Promise<UpdateRouteMeasurement>((resolve) => {
      let settled = false;
      const finish = (res: UpdateRouteMeasurement) => {
        if (!settled) {
          settled = true;
          controller.signal.removeEventListener("abort", onAbort);
          resolve(res);
        }
      };
      const onAbort = () => finish(failMeasurement);
      controller.signal.addEventListener("abort", onAbort, { once: true });
      runProbe().then(finish, () => finish(failMeasurement));
    });
  } finally {
    clearTimeout(timer);
  }
}

/**
 * 并发探测直连与镜像线路速度（优先 HEAD，不支持时回退 Range: bytes=0-0），
 * 收到最快可用响应后中止其余请求并按延迟排序，结果缓存 5 分钟。
 * 全超时或全部不可用时优雅回退默认顺序。
 */
export async function detectFastestUpdateRoute(
  probeUrl?: string,
  options?: DetectUpdateRouteOptions,
): Promise<UpdateRouteResult> {
  const ttlMs = options?.ttlMs ?? UPDATE_ROUTE_CACHE_TTL_MS;
  const timeoutMs = options?.timeoutMs ?? UPDATE_ROUTE_PROBE_TIMEOUT_MS;
  const now = Date.now();

  if (
    !options?.forceRefresh &&
    !options?.mirrors &&
    routeCache &&
    now - routeCache.checkedAt < ttlMs
  ) {
    return {
      ...routeCache,
      fromCache: true,
    };
  }

  const defaultPrefixes = getDefaultMirrorPrefixes(options?.mirrors);
  const targetProbeUrl = probeUrl?.trim() || DEFAULT_UPDATE_PROBE_URL;
  const controllers = defaultPrefixes.map(() => new AbortController());
  let winnerSettled = false;

  const probePromises = defaultPrefixes.map((prefix, index) =>
    probeSingleRoute(targetProbeUrl, prefix, controllers[index], timeoutMs).then(
      (result) => {
        if (result.ok && !winnerSettled) {
          winnerSettled = true;
          for (let i = 0; i < controllers.length; i += 1) {
            if (i !== index) {
              controllers[i].abort();
            }
          }
        }
        return result;
      },
    ),
  );

  const settled = await Promise.allSettled(probePromises);
  const measurements: UpdateRouteMeasurement[] = settled.map((item, idx) =>
    item.status === "fulfilled"
      ? item.value
      : {
          prefix: defaultPrefixes[idx],
          ok: false,
          latencyMs: Number.POSITIVE_INFINITY,
        },
  );

  const successful = measurements
    .filter((m) => m.ok)
    .sort((a, b) => a.latencyMs - b.latencyMs);

  const orderedPrefixes: string[] = [];
  for (const hit of successful) {
    if (!orderedPrefixes.includes(hit.prefix)) {
      orderedPrefixes.push(hit.prefix);
    }
  }
  for (const fallback of defaultPrefixes) {
    if (!orderedPrefixes.includes(fallback)) {
      orderedPrefixes.push(fallback);
    }
  }

  const resultBase: Omit<UpdateRouteResult, "fromCache"> = {
    fastestPrefix: orderedPrefixes[0] ?? "",
    orderedPrefixes,
    fallbackMirrors: orderedPrefixes.slice(1),
    checkedAt: Date.now(),
    measurements,
  };

  if (successful.length > 0 && !options?.mirrors) {
    routeCache = resultBase;
  }

  return {
    ...resultBase,
    fromCache: false,
  };
}

async function fetchChecksumBestEffort(
  checksumUrl: string,
  apkFilename: string,
  routePrefixes?: string[],
): Promise<string | undefined> {
  const prefixes = routePrefixes && routePrefixes.length > 0 ? routePrefixes : [""];
  const urls = Array.from(
    new Set(prefixes.map((prefix) => withMirror(checksumUrl, prefix)).filter(Boolean)),
  );

  for (const url of urls) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 8_000);
    try {
      const res = await fetch(url, { signal: controller.signal });
      if (!res.ok) continue;
      const body = await res.text();
      const parsed = extractSha256FromText(body, apkFilename);
      if (parsed) return parsed;
    } catch {
      // 校验文件拉取为尽力而为，绝不阻断版本检查
    } finally {
      clearTimeout(timer);
    }
  }
  return undefined;
}

interface GitHubReleasePayload {
  tag_name?: string;
  body?: string;
  published_at?: string;
  assets?: { name?: string; browser_download_url?: string; size?: number }[];
}

async function fetchReleaseJsonFromUrl(
  url: string,
  timeoutMs = 12_000,
): Promise<{ res: Response; data: GitHubReleasePayload } | { error: Error; status?: number }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      headers: { Accept: "application/vnd.github+json" },
      signal: controller.signal,
    });
    if (res.status === 404) {
      return { error: new Error("仓库还没有发布任何版本"), status: 404 };
    }
    if (res.status === 403) {
      return { error: new Error("请求过于频繁，请稍后再试"), status: 403 };
    }
    if (!res.ok) {
      return {
        error: new Error(`GitHub 接口异常（HTTP ${res.status}）`),
        status: res.status,
      };
    }
    const data = (await res.json()) as GitHubReleasePayload;
    return { res, data };
  } catch {
    return { error: new Error("网络连接失败，请检查网络后重试") };
  } finally {
    clearTimeout(timer);
  }
}

/** 拉取 GitHub 最新 Release 并解析 APK 附件及校验信息 */
export async function fetchLatestRelease(
  options?: FetchReleaseOptions,
): Promise<ReleaseInfo> {
  const apiUrl = `https://api.github.com/repos/${GITHUB_REPO}/releases/latest`;
  let cachedRoute: UpdateRouteResult | null = null;

  // 优先直连 GitHub API；404 直接返回无版本；网络超时或失败时自动尝试代理链路
  const directAttempt = await fetchReleaseJsonFromUrl(apiUrl, 12_000);
  let data: GitHubReleasePayload | null = null;
  let lastError: Error | null = null;

  if ("data" in directAttempt) {
    data = directAttempt.data;
  } else if (directAttempt.status === 404) {
    throw directAttempt.error;
  } else {
    lastError = directAttempt.error;
    const baseOrdered =
      options?.orderedPrefixes && options.orderedPrefixes.length > 0
        ? options.orderedPrefixes
        : (cachedRoute = await detectFastestUpdateRoute()).orderedPrefixes;
    const proxyCandidates = Array.from(
      new Set(
        [
          options?.mirrorPrefix ?? "",
          ...baseOrdered,
          ...getDefaultMirrorPrefixes(),
        ]
          .map((p) => p.trim())
          .filter(Boolean),
      ),
    );

    for (const proxyPrefix of proxyCandidates) {
      const attempt = await fetchReleaseJsonFromUrl(
        withMirror(apiUrl, proxyPrefix),
        10_000,
      );
      if ("data" in attempt) {
        data = attempt.data;
        lastError = null;
        break;
      }
      if (attempt.status === 404) {
        throw attempt.error;
      }
      lastError = attempt.error;
    }
  }

  if (!data) {
    throw lastError ?? new Error("网络连接失败，请检查网络后重试");
  }

  const assets = data.assets ?? [];
  const asset = assets.find((a) =>
    a.browser_download_url?.toLowerCase().endsWith(".apk"),
  );
  if (!data.tag_name || !asset?.browser_download_url) {
    throw new Error("最新 Release 中没有找到 APK 附件");
  }

  const apkFilename =
    asset.name?.trim() || basenameLower(asset.browser_download_url);
  const apkNameLower = apkFilename.toLowerCase();
  const checksumAsset =
    assets.find((a) => {
      const name = (a.name || basenameLower(a.browser_download_url ?? "")).toLowerCase();
      return (
        Boolean(a.browser_download_url) &&
        (name === `${apkNameLower}.sha256` || name === `${apkNameLower}.sha256sum`)
      );
    }) ??
    assets.find((a) => {
      const name = (a.name || basenameLower(a.browser_download_url ?? "")).toLowerCase();
      return Boolean(a.browser_download_url) && CHECKSUM_ASSET_PATTERN.test(name);
    });

  const notes = (data.body ?? "").trim();
  const checksumUrl = checksumAsset?.browser_download_url;
  let sha256 = extractSha256FromText(notes, apkFilename);
  if (!sha256 && checksumUrl) {
    let checksumPrefixes: string[];
    if (options?.orderedPrefixes?.length || options?.mirrorPrefix !== undefined) {
      checksumPrefixes = [
        ...(options.mirrorPrefix !== undefined ? [options.mirrorPrefix] : []),
        ...(options.orderedPrefixes ?? []),
        "",
      ];
    } else {
      const route = cachedRoute ?? (await detectFastestUpdateRoute(checksumUrl));
      checksumPrefixes = route.orderedPrefixes;
    }
    sha256 = await fetchChecksumBestEffort(
      checksumUrl,
      apkFilename,
      checksumPrefixes,
    );
  }

  return {
    version: normalize(data.tag_name),
    tagName: data.tag_name,
    notes,
    apkUrl: asset.browser_download_url,
    apkSize: asset.size ?? 0,
    publishedAt: data.published_at ?? "",
    ...(sha256 ? { sha256 } : {}),
    ...(checksumUrl ? { checksumUrl } : {}),
  };
}

/** 最新版本是否比当前版本更新 */
export function isNewer(latest: ReleaseInfo): boolean {
  return compareVersions(latest.version, currentVersion()) > 0;
}

const apkDirUri = () => {
  const cache = FileSystem.cacheDirectory;
  if (!cache) throw new Error("无法访问应用缓存目录");
  return `${cache}${APK_DIR}`;
};

interface FileInspection {
  readable: boolean;
  isZip: boolean;
  sha256?: string;
}

async function inspectApkFile(
  fileUri: string,
  needHash: boolean,
): Promise<FileInspection> {
  // 1. 优先使用新版 expo-file-system File（支持流式分块或直接读取字节）
  try {
    const fsNext = await import("expo-file-system");
    if (typeof fsNext?.File === "function") {
      const file = new fsNext.File(fileUri);
      if (typeof file.open === "function") {
        let handle: ReturnType<typeof file.open> | null = null;
        try {
          handle = fsNext.FileMode?.ReadOnly
            ? file.open(fsNext.FileMode.ReadOnly)
            : file.open();
          const header = new Uint8Array(4);
          let headerPos = 0;
          const hasher = needHash ? new Sha256Hasher() : null;
          if (!needHash) {
            const first = await handle.readBytes(4);
            const bytes = first instanceof Uint8Array ? first : new Uint8Array(first);
            const copyLen = Math.min(4, bytes.length);
            header.set(bytes.subarray(0, copyLen), 0);
            headerPos = copyLen;
          } else {
            while (true) {
              const chunk = await handle.readBytes(STREAM_CHUNK_SIZE);
              const bytes = chunk instanceof Uint8Array ? chunk : new Uint8Array(chunk);
              if (bytes.length === 0) break;
              if (headerPos < 4) {
                const take = Math.min(4 - headerPos, bytes.length);
                header.set(bytes.subarray(0, take), headerPos);
                headerPos += take;
              }
              hasher?.update(bytes);
            }
          }
          return {
            readable: true,
            isZip: headerPos >= 4 && hasZipMagic(header),
            sha256: hasher?.digestHex(),
          };
        } catch {
          // 回退到 file.bytes()
        } finally {
          try {
            handle?.close();
          } catch {
            // 忽略关闭异常
          }
        }
      }

      if (typeof file.bytes === "function") {
        const raw = await file.bytes();
        const bytes = raw instanceof Uint8Array ? raw : new Uint8Array(raw);
        return {
          readable: true,
          isZip: hasZipMagic(bytes),
          sha256: needHash ? sha256Bytes(bytes) : undefined,
        };
      }
    }
  } catch {
    // 不可用（例如单测仅 mock 了 legacy 模块）时继续尝试 legacy base64 读取
  }

  // 2. 回退到 expo-file-system/legacy readAsStringAsync(base64)
  if (typeof FileSystem.readAsStringAsync === "function") {
    try {
      const base64 = await FileSystem.readAsStringAsync(fileUri, {
        encoding: FileSystem.EncodingType?.Base64 ?? "base64",
      });
      const bytes = base64ToBytes(base64);
      return {
        readable: true,
        isZip: hasZipMagic(bytes),
        sha256: needHash ? sha256Bytes(bytes) : undefined,
      };
    } catch {
      return { readable: false, isZip: false };
    }
  }

  return { readable: false, isZip: false };
}

function buildCandidateUrls(url: string, options?: ApkDownloadOptions): string[] {
  if (!options) return [url];
  const prefixes: string[] = [];
  if (options.mirrorPrefix !== undefined) {
    prefixes.push(options.mirrorPrefix);
  }
  if (options.fallbackMirrors !== undefined) {
    prefixes.push(...options.fallbackMirrors);
  } else if (options.mirrorPrefix) {
    prefixes.push("");
  }
  if (prefixes.length === 0) return [url];

  const candidates: string[] = [];
  const seen = new Set<string>();
  for (const prefix of prefixes) {
    const candidate = withMirror(url, prefix);
    if (candidate && !seen.has(candidate)) {
      seen.add(candidate);
      candidates.push(candidate);
    }
  }
  return candidates.length > 0 ? candidates : [url];
}

/** 确认 APK 存在、非空，并在可读时校验 ZIP 魔数与可选 SHA-256 */
export async function verifyApk(
  fileUri: string,
  expectedSha256?: string,
): Promise<boolean> {
  try {
    const info = await FileSystem.getInfoAsync(fileUri);
    if (!info.exists || info.isDirectory || info.size <= 0) return false;

    const rawExpected = expectedSha256?.trim();
    if (rawExpected && !HEX64_EXACT.test(rawExpected)) return false;
    const normalizedExpected = rawExpected ? rawExpected.toLowerCase() : undefined;

    const inspected = await inspectApkFile(fileUri, Boolean(normalizedExpected));
    if (!inspected.readable) {
      return !normalizedExpected;
    }
    if (!inspected.isZip) return false;
    if (normalizedExpected && inspected.sha256 !== normalizedExpected) {
      return false;
    }
    return true;
  } catch {
    return false;
  }
}

/** 下载到本地缓存，支持镜像回退与 SHA-256 完整性校验；onProgress 以 0..1 上报 */
export function createApkDownload(
  url: string,
  onProgress: (p: number) => void,
  options?: ApkDownloadOptions,
): { promise: Promise<string>; cancel: () => void } {
  let task: FileSystem.DownloadResumable | null = null;
  let cancelled = false;
  const destination = `${apkDirUri()}/update-${Date.now()}-${++downloadId}.apk`;
  activeDownloads.add(destination);
  const checkCancelled = () => {
    if (cancelled) throw new Error("下载已取消");
  };

  const promise = (async () => {
    try {
      // Android 上 createDownloadResumable 不会自动建目录。
      await FileSystem.makeDirectoryAsync(apkDirUri(), { intermediates: true });
      checkCancelled();
      // Keep only the current download; exclude other requests still cancelling.
      const files = await FileSystem.readDirectoryAsync(apkDirUri());
      await Promise.all(
        files
          .filter((name) => /^(?:dark-study-update|update-\d+-\d+)\.apk$/.test(name))
          .map((name) => `${apkDirUri()}/${name}`)
          .filter((uri) => !activeDownloads.has(uri))
          .map((uri) => FileSystem.deleteAsync(uri, { idempotent: true }).catch(() => {})),
      );
      checkCancelled();

      const candidates = buildCandidateUrls(url, options);
      let downloadedUri: string | null = null;
      let lastError: unknown = null;

      for (let i = 0; i < candidates.length; i++) {
        checkCancelled();
        const candidateUrl = candidates[i];
        try {
          task = FileSystem.createDownloadResumable(candidateUrl, destination, {}, (p) => {
            const total = p.totalBytesExpectedToWrite;
            if (!cancelled && total > 0) {
              onProgress(Math.min(1, p.totalBytesWritten / total));
            }
          });
          const r = await task.downloadAsync();
          checkCancelled();
          if (!r?.uri || r.status !== 200) {
            throw new Error(`下载未完成（HTTP ${r?.status ?? "未知"}）`);
          }
          const info = await FileSystem.getInfoAsync(r.uri);
          checkCancelled();
          if (!info.exists || info.isDirectory || info.size <= 0) {
            throw new Error("安装包为空，请重新下载");
          }
          // 若还有备用源且镜像返回了非 APK/ZIP 内容（如错误页 HTML），则自动回退下一源
          if (i < candidates.length - 1) {
            const quickCheck = await inspectApkFile(r.uri, false);
            checkCancelled();
            if (quickCheck.readable && !quickCheck.isZip) {
              throw new Error("镜像返回了无效安装包");
            }
          }
          downloadedUri = r.uri;
          break;
        } catch (error) {
          if (cancelled) throw new Error("下载已取消");
          lastError = error;
          if (i < candidates.length - 1) {
            await FileSystem.deleteAsync(destination, { idempotent: true }).catch(() => {});
            onProgress(0);
          }
        }
      }

      if (!downloadedUri) {
        throw lastError ?? new Error("下载失败，请稍后重试");
      }

      const expectedSha256 = options?.expectedSha256?.trim();
      if (expectedSha256) {
        const valid = await verifyApk(downloadedUri, expectedSha256);
        checkCancelled();
        if (!valid) {
          throw new Error("安装包完整性校验失败（SHA-256 不匹配），请重新下载");
        }
      } else {
        const inspected = await inspectApkFile(downloadedUri, false);
        checkCancelled();
        if (inspected.readable && !inspected.isZip) {
          throw new Error("安装包文件损坏，请重新下载");
        }
      }

      return downloadedUri;
    } catch (error) {
      await FileSystem.deleteAsync(destination, { idempotent: true }).catch(() => {});
      throw error;
    } finally {
      activeDownloads.delete(destination);
    }
  })();

  return {
    promise,
    cancel: () => {
      cancelled = true;
      task?.cancelAsync().catch(() => {});
    },
  };
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
