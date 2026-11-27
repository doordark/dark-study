import { bytesToBase64 } from "@/utils/base64";
import { backupSummary, parseBackup, type Backup } from "@/utils/backup";

export type WebdavPresetId = "jianguoyun" | "nextcloud" | "alist" | "custom";

export interface WebdavPreset {
  id: WebdavPresetId;
  label: string;
  hint: string;
  defaultServerUrl: string;
  placeholderUrl: string;
  usernamePlaceholder: string;
  passwordHint: string;
}

export interface WebdavConfig {
  serverUrl: string;
  username: string;
  remotePath: string;
}

export interface WebdavTestResult {
  ok: boolean;
  status?: number;
  method?: "PROPFIND" | "OPTIONS" | "HEAD";
  message: string;
}

export type BackupSummary = ReturnType<typeof backupSummary>;

export interface WebdavPushResult {
  targetUrl: string;
  createdAt: string;
  bytes: number;
  summary: BackupSummary;
}

export interface WebdavPullResult {
  backup: Backup;
  summary: BackupSummary;
}

export type AutoSyncDecisionAction =
  | "pull_merge"
  | "push_initial"
  | "noop_up_to_date"
  | "noop_local_newer";

export interface AutoSyncDecisionInput {
  remoteCreatedAt?: string | number | null;
  localLastSyncAt?: number | null;
  hasRemote: boolean;
  /** 时钟漂移容差（毫秒），默认 5 秒，避免毫秒级时间差反复同步 */
  skewToleranceMs?: number;
}

export interface AutoSyncDecision {
  action: AutoSyncDecisionAction;
  remoteTimeMs: number | null;
  reason: string;
}

export type AutoSyncOutcomeStatus =
  | "skipped"
  | "up_to_date"
  | "local_newer"
  | "merged"
  | "available"
  | "pushed"
  | "error";

export interface WebdavAutoSyncResult {
  status: AutoSyncOutcomeStatus;
  message: string;
  syncedAt: number | null;
  remoteCreatedAt?: string;
  summary?: BackupSummary;
  decision?: AutoSyncDecision;
}

export interface AutoSyncLaunchOptions {
  timeoutMs?: number;
  /** 云端更新时是否自动执行非破坏性合并（默认 true） */
  autoMerge?: boolean;
  /** 云端尚无备份文件（404）时是否上传初始备份（默认 true） */
  pushWhenMissing?: boolean;
  now?: number;
}

export const DEFAULT_WEBDAV_PRESET: WebdavPresetId = "jianguoyun";
export const DEFAULT_WEBDAV_REMOTE_PATH = "/DarkStudy/dark-study-backup.json";
export const WEBDAV_TIMEOUT_MS = 20_000;
export const WEBDAV_AUTO_SYNC_TIMEOUT_MS = 12_000;
const DEFAULT_SYNC_SKEW_TOLERANCE_MS = 5_000;

const MAX_URL_LENGTH = 512;
const MAX_REMOTE_PATH_LENGTH = 512;
const MKCOL_OK_STATUSES = new Set([200, 201, 204, 301, 302, 405, 409]);

export const WEBDAV_PRESETS: readonly WebdavPreset[] = [
  {
    id: "jianguoyun",
    label: "坚果云",
    hint: "需在坚果云网页端「账户信息 → 安全选项」中生成第三方应用密码，切勿填写登录密码。",
    defaultServerUrl: "https://dav.jianguoyun.com/dav/",
    placeholderUrl: "https://dav.jianguoyun.com/dav/",
    usernamePlaceholder: "坚果云注册邮箱",
    passwordHint: "第三方应用密码",
  },
  {
    id: "nextcloud",
    label: "Nextcloud",
    hint: "服务器地址通常为 https://你的域名/remote.php/dav/files/用户名/，建议创建应用专用密码。",
    defaultServerUrl: "",
    placeholderUrl: "https://cloud.example.com/remote.php/dav/files/username/",
    usernamePlaceholder: "Nextcloud 用户名",
    passwordHint: "应用专用密码或账号密码",
  },
  {
    id: "alist",
    label: "Alist",
    hint: "适配 Alist / OpenList 自建网盘 WebDAV 接口，地址一般以 /dav/ 结尾。",
    defaultServerUrl: "",
    placeholderUrl: "https://alist.example.com/dav/",
    usernamePlaceholder: "Alist 用户名",
    passwordHint: "Alist 密码",
  },
  {
    id: "custom",
    label: "自定义",
    hint: "兼容群晖 NAS、InfiniCLOUD、TeraCLOUD 等任意标准 WebDAV 服务。",
    defaultServerUrl: "",
    placeholderUrl: "https://dav.example.com/dav/",
    usernamePlaceholder: "WebDAV 用户名",
    passwordHint: "WebDAV 密码或应用密钥",
  },
] as const;

const PRESET_MAP: Record<WebdavPresetId, WebdavPreset> = Object.fromEntries(
  WEBDAV_PRESETS.map((preset) => [preset.id, preset]),
) as Record<WebdavPresetId, WebdavPreset>;

export function isWebdavPresetId(value: unknown): value is WebdavPresetId {
  return typeof value === "string" && Object.hasOwn(PRESET_MAP, value);
}

export function getWebdavPreset(id?: unknown): WebdavPreset {
  return isWebdavPresetId(id) ? PRESET_MAP[id] : PRESET_MAP[DEFAULT_WEBDAV_PRESET];
}

function encodeUtf8(input: string): Uint8Array {
  if (typeof TextEncoder !== "undefined") {
    return new TextEncoder().encode(input);
  }
  const bytes: number[] = [];
  for (let i = 0; i < input.length; i++) {
    let codePoint = input.charCodeAt(i);
    if (codePoint >= 0xd800 && codePoint <= 0xdbff && i + 1 < input.length) {
      const low = input.charCodeAt(i + 1);
      if (low >= 0xdc00 && low <= 0xdfff) {
        codePoint = ((codePoint - 0xd800) << 10) + (low - 0xdc00) + 0x10000;
        i++;
      }
    }
    if (codePoint <= 0x7f) {
      bytes.push(codePoint);
    } else if (codePoint <= 0x7ff) {
      bytes.push(0xc0 | (codePoint >> 6), 0x80 | (codePoint & 0x3f));
    } else if (codePoint <= 0xffff) {
      bytes.push(
        0xe0 | (codePoint >> 12),
        0x80 | ((codePoint >> 6) & 0x3f),
        0x80 | (codePoint & 0x3f),
      );
    } else {
      bytes.push(
        0xf0 | (codePoint >> 18),
        0x80 | ((codePoint >> 12) & 0x3f),
        0x80 | ((codePoint >> 6) & 0x3f),
        0x80 | (codePoint & 0x3f),
      );
    }
  }
  return new Uint8Array(bytes);
}

function assertSafePathSegment(segment: string, contextLabel: string): void {
  if (!segment) return;
  let current = segment;
  for (let round = 0; round < 3; round++) {
    if (
      current === "." ||
      current === ".." ||
      current.includes("/") ||
      current.includes("\\") ||
      /[\u0000-\u001f\u007f]/.test(current)
    ) {
      throw new Error(`${contextLabel}不能包含 .. 或非法路径字符`);
    }
    if (!current.includes("%")) break;
    let decoded: string;
    try {
      decoded = decodeURIComponent(current);
    } catch {
      throw new Error(`${contextLabel}包含无效的百分号编码`);
    }
    if (decoded === current) break;
    current = decoded;
  }
}

/**
 * 校验并规范化 WebDAV 服务器地址（去除末尾斜杠）。
 * 仅允许 http/https，禁止内嵌凭据、查询参数、锚点与上级目录跳转。
 */
export function normalizeWebdavServerUrl(serverUrl: string): string {
  if (typeof serverUrl !== "string") {
    throw new Error("请填写 WebDAV 服务器地址");
  }
  const trimmed = serverUrl.trim();
  if (!trimmed) {
    throw new Error("请填写 WebDAV 服务器地址");
  }
  if (trimmed.length > MAX_URL_LENGTH || /[\s\u0000-\u001f\u007f]/.test(trimmed)) {
    throw new Error("WebDAV 服务器地址格式无效");
  }
  if (!/^https?:\/\//i.test(trimmed)) {
    throw new Error("WebDAV 服务器地址必须以 http:// 或 https:// 开头");
  }
  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    throw new Error("WebDAV 服务器地址格式无效");
  }
  if (
    (parsed.protocol !== "http:" && parsed.protocol !== "https:") ||
    !parsed.hostname
  ) {
    throw new Error("WebDAV 服务器地址必须为有效的 http 或 https 地址");
  }
  if (parsed.username || parsed.password) {
    throw new Error("请勿在服务器地址中直接携带用户名或密码");
  }
  if (parsed.search || parsed.hash) {
    throw new Error("WebDAV 服务器地址不能包含查询参数或锚点");
  }
  if (trimmed.includes("\\")) {
    throw new Error("WebDAV 服务器地址不能包含反斜杠");
  }
  const afterScheme = trimmed.replace(/^https?:\/\//i, "");
  const slashIndex = afterScheme.indexOf("/");
  if (slashIndex >= 0) {
    const rawPath = afterScheme.slice(slashIndex);
    for (const segment of rawPath.split("/")) {
      assertSafePathSegment(segment, "服务器路径");
    }
  }
  return trimmed.replace(/\/+$/, "");
}

/**
 * 校验并规范化远程备份文件路径（统一为前导 `/` 的规范路径）。
 * 拦截 `..`、`.`、编码后的 `%2e%2e`、反斜杠、协议头以及目录路径。
 */
export function normalizeWebdavRemotePath(remotePath: string): string {
  if (typeof remotePath !== "string") {
    throw new Error("请填写远程备份路径");
  }
  const trimmed = remotePath.trim();
  if (!trimmed) {
    throw new Error("请填写远程备份路径");
  }
  if (
    trimmed.length > MAX_REMOTE_PATH_LENGTH ||
    /[\u0000-\u001f\u007f]/.test(trimmed)
  ) {
    throw new Error("远程备份路径包含无效字符");
  }
  if (trimmed.includes("\\") || trimmed.includes("?") || trimmed.includes("#")) {
    throw new Error("远程备份路径不能包含反斜杠、? 或 #");
  }
  if (/^[a-z][a-z0-9+.-]*:/i.test(trimmed) || trimmed.startsWith("//")) {
    throw new Error("远程备份路径必须为相对服务器根目录的路径");
  }
  if (trimmed.endsWith("/")) {
    throw new Error("远程备份路径需要包含文件名，例如 /DarkStudy/dark-study-backup.json");
  }

  const rawSegments = trimmed.split("/").filter((segment) => segment.length > 0);
  if (rawSegments.length === 0) {
    throw new Error("远程备份路径需要包含文件名，例如 /DarkStudy/dark-study-backup.json");
  }
  for (const segment of rawSegments) {
    assertSafePathSegment(segment, "远程备份路径");
  }
  return `/${rawSegments.join("/")}`;
}

/** 拼接并二次校验最终 WebDAV 文件 URL，确保不会逃逸出服务器根目录 */
export function buildWebdavTargetUrl(
  serverUrl: string,
  remotePath: string,
): string {
  const base = normalizeWebdavServerUrl(serverUrl);
  const normalizedPath = normalizeWebdavRemotePath(remotePath);
  const segments = normalizedPath.slice(1).split("/");
  const encodedPath = segments.map((seg) => encodeURIComponent(seg)).join("/");
  const target = `${base}/${encodedPath}`;

  const baseParsed = new URL(`${base}/`);
  const targetParsed = new URL(target);
  if (
    targetParsed.origin !== baseParsed.origin ||
    !targetParsed.pathname.startsWith(baseParsed.pathname)
  ) {
    throw new Error("远程备份路径超出 WebDAV 服务器根目录范围");
  }
  return target;
}

/** 返回远程文件所在的所有逐级父目录 URL（含末尾斜杠，供 MKCOL 依次建目录） */
export function buildWebdavParentDirUrls(
  serverUrl: string,
  remotePath: string,
): string[] {
  const base = normalizeWebdavServerUrl(serverUrl);
  const normalizedPath = normalizeWebdavRemotePath(remotePath);
  const segments = normalizedPath.slice(1).split("/");
  if (segments.length <= 1) return [];

  const urls: string[] = [];
  for (let i = 0; i < segments.length - 1; i++) {
    const prefix = segments
      .slice(0, i + 1)
      .map((seg) => encodeURIComponent(seg))
      .join("/");
    urls.push(`${base}/${prefix}/`);
  }
  return urls;
}

/**
 * UTF-8 安全的 HTTP Basic 认证头编码（不依赖可能缺失或仅支持 Latin-1 的 btoa）。
 */
export function encodeWebdavBasicAuth(
  username: string,
  password: string,
): string {
  if (/[\r\n\u0000-\u001f\u007f]/.test(username) || /[\r\n\u0000-\u001f\u007f]/.test(password)) {
    throw new Error("用户名或密码包含非法控制字符");
  }
  if (username.includes(":")) {
    throw new Error("WebDAV 用户名不能包含冒号（:）");
  }
  const bytes = encodeUtf8(`${username}:${password}`);
  return `Basic ${bytesToBase64(bytes)}`;
}

function resolveAuthHeader(
  username: string,
  password: string,
): string | undefined {
  const user = typeof username === "string" ? username.trim() : "";
  const pass = typeof password === "string" ? password.trim() : "";
  if (user && !pass) {
    throw new Error("请先输入并保存 WebDAV 应用密码");
  }
  if (!user && pass) {
    throw new Error("请填写 WebDAV 用户名");
  }
  if (!user && !pass) {
    return undefined;
  }
  return encodeWebdavBasicAuth(user, pass);
}

async function webdavFetch(
  url: string,
  init: RequestInit,
  timeoutMs = WEBDAV_TIMEOUT_MS,
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, {
      ...init,
      signal: controller.signal,
    });
  } catch (error) {
    if (
      controller.signal.aborted ||
      (error instanceof Error && error.name === "AbortError")
    ) {
      const seconds = Math.max(1, Math.round(timeoutMs / 1000));
      throw new Error(`WebDAV 请求超时（超过 ${seconds} 秒），请检查网络或服务器地址`);
    }
    throw new Error("无法连接到 WebDAV 服务器，请检查网络或服务器地址");
  } finally {
    clearTimeout(timer);
  }
}

function describeAuthOrHttpFailure(
  status: number,
  actionLabel: string,
): string {
  if (status === 401) {
    return "认证失败（401）：请检查用户名与应用密码（坚果云需使用第三方应用密码）";
  }
  if (status === 403) {
    return "无权限访问（403）：请检查账号权限或 WebDAV 目录授权";
  }
  if (status === 404) {
    return actionLabel === "下载云端备份"
      ? "云端未找到备份文件（404），请确认已上传或检查远程路径"
      : "服务器路径不存在（404）：请检查 WebDAV 服务器地址是否正确";
  }
  if (status === 409) {
    return `${actionLabel}失败（409）：远程目录结构冲突，请检查远程路径`;
  }
  if (status === 507) {
    return "云端存储空间不足（507），请清理空间后重试";
  }
  return `${actionLabel}失败（HTTP ${status}）`;
}

/**
 * 测试 WebDAV 连接连通性：优先使用 PROPFIND Depth:0，
 * 若服务端不支持该方法（405/501）则自动回退至 OPTIONS / HEAD。
 */
export async function testWebdavConnection(
  config: WebdavConfig,
  password: string,
): Promise<WebdavTestResult> {
  let rootUrl: string;
  let authHeader: string | undefined;
  try {
    const base = normalizeWebdavServerUrl(config.serverUrl);
    if (typeof config.remotePath === "string" && config.remotePath.trim()) {
      buildWebdavTargetUrl(config.serverUrl, config.remotePath);
    }
    rootUrl = `${base}/`;
    authHeader = resolveAuthHeader(config.username, password);
  } catch (error) {
    return {
      ok: false,
      message: error instanceof Error ? error.message : "WebDAV 配置无效",
    };
  }

  const baseHeaders: Record<string, string> = authHeader
    ? { Authorization: authHeader }
    : {};

  const attempts: {
    method: "PROPFIND" | "OPTIONS" | "HEAD";
    headers: Record<string, string>;
  }[] = [
    {
      method: "PROPFIND",
      headers: {
        ...baseHeaders,
        Depth: "0",
        Accept: "application/xml, text/xml, */*",
      },
    },
    { method: "OPTIONS", headers: baseHeaders },
    { method: "HEAD", headers: baseHeaders },
  ];

  for (let i = 0; i < attempts.length; i++) {
    const attempt = attempts[i];
    let res: Response;
    try {
      res = await webdavFetch(rootUrl, {
        method: attempt.method,
        headers: attempt.headers,
      });
    } catch (error) {
      return {
        ok: false,
        method: attempt.method,
        message:
          error instanceof Error
            ? error.message
            : "无法连接到 WebDAV 服务器，请检查网络与地址",
      };
    }

    if (res.status === 207 || (res.status >= 200 && res.status < 300)) {
      return {
        ok: true,
        status: res.status,
        method: attempt.method,
        message:
          attempt.method === "PROPFIND"
            ? "WebDAV 连接成功，服务正常可用"
            : `WebDAV 连接成功（通过 ${attempt.method} 验证）`,
      };
    }

    if (
      (res.status === 405 || res.status === 501) &&
      i < attempts.length - 1
    ) {
      continue;
    }

    return {
      ok: false,
      status: res.status,
      method: attempt.method,
      message: describeAuthOrHttpFailure(res.status, "连接测试"),
    };
  }

  return {
    ok: false,
    message: "WebDAV 连接测试未获响应，请检查服务器配置",
  };
}

/**
 * 逐级 MKCOL 创建远程父目录，容忍 201 / 405 / 301 / 409（目录已存在或重定向）。
 */
export async function ensureRemoteParentDirs(
  serverUrl: string,
  remotePath: string,
  authHeader?: string,
  timeoutMs = WEBDAV_TIMEOUT_MS,
): Promise<string[]> {
  const dirUrls = buildWebdavParentDirUrls(serverUrl, remotePath);
  const headers: Record<string, string> = authHeader
    ? { Authorization: authHeader }
    : {};

  for (const dirUrl of dirUrls) {
    const res = await webdavFetch(
      dirUrl,
      {
        method: "MKCOL",
        headers,
      },
      timeoutMs,
    );
    if (MKCOL_OK_STATUSES.has(res.status)) {
      continue;
    }
    throw new Error(describeAuthOrHttpFailure(res.status, "创建远程目录"));
  }
  return dirUrls;
}

/** 采集本地安全备份并上传至 WebDAV（先自动建父目录再 PUT JSON） */
export async function pushBackupToWebdav(
  config: WebdavConfig,
  password: string,
  timeoutMs = WEBDAV_TIMEOUT_MS,
): Promise<WebdavPushResult> {
  const targetUrl = buildWebdavTargetUrl(config.serverUrl, config.remotePath);
  const authHeader = resolveAuthHeader(config.username, password);
  const { collectBackup } = await import("@/services/backupStorage");
  const backup = await collectBackup();
  const payload = JSON.stringify(backup);

  await ensureRemoteParentDirs(
    config.serverUrl,
    config.remotePath,
    authHeader,
    timeoutMs,
  );

  const headers: Record<string, string> = {
    "Content-Type": "application/json; charset=utf-8",
    ...(authHeader ? { Authorization: authHeader } : {}),
  };
  const res = await webdavFetch(
    targetUrl,
    {
      method: "PUT",
      headers,
      body: payload,
    },
    timeoutMs,
  );

  if (res.status < 200 || res.status >= 300) {
    throw new Error(describeAuthOrHttpFailure(res.status, "上传备份"));
  }

  return {
    targetUrl,
    createdAt: backup.createdAt,
    bytes: encodeUtf8(payload).byteLength,
    summary: backupSummary(backup),
  };
}

/** 从 WebDAV 拉取远程备份文件并经 parseBackup 完整校验 */
export async function pullBackupFromWebdav(
  config: WebdavConfig,
  password: string,
  timeoutMs = WEBDAV_TIMEOUT_MS,
): Promise<WebdavPullResult> {
  const targetUrl = buildWebdavTargetUrl(config.serverUrl, config.remotePath);
  const authHeader = resolveAuthHeader(config.username, password);

  const headers: Record<string, string> = {
    Accept: "application/json, text/plain, */*",
    "Cache-Control": "no-cache",
    ...(authHeader ? { Authorization: authHeader } : {}),
  };
  const res = await webdavFetch(
    targetUrl,
    {
      method: "GET",
      headers,
    },
    timeoutMs,
  );

  if (res.status < 200 || res.status >= 300) {
    throw new Error(describeAuthOrHttpFailure(res.status, "下载云端备份"));
  }

  const text = await res.text();
  const backup = parseBackup(text);
  return {
    backup,
    summary: backupSummary(backup),
  };
}

/** 使用本地备份事务引擎安全恢复已预览的云端备份 */
export async function restoreWebdavBackup(
  backup: Backup,
  mode: "merge" | "replace",
): Promise<void> {
  const { restoreBackup } = await import("@/services/backupStorage");
  await restoreBackup(backup, mode);
}

/**
 * 纯决策函数：根据云端备份是否存在及其创建时间、本地上次同步时间，
 * 决定启动自动同步的安全动作，绝不盲目覆盖更新的本地数据。
 */
export function decideAutoSyncAction(
  input: AutoSyncDecisionInput,
): AutoSyncDecision {
  const tolerance =
    typeof input.skewToleranceMs === "number" &&
    Number.isFinite(input.skewToleranceMs) &&
    input.skewToleranceMs >= 0
      ? input.skewToleranceMs
      : DEFAULT_SYNC_SKEW_TOLERANCE_MS;

  if (!input.hasRemote) {
    return {
      action: "push_initial",
      remoteTimeMs: null,
      reason: "云端尚无备份文件，将上传本地数据作为首次云端备份",
    };
  }

  let remoteTimeMs: number | null = null;
  if (
    typeof input.remoteCreatedAt === "number" &&
    Number.isFinite(input.remoteCreatedAt) &&
    input.remoteCreatedAt > 0
  ) {
    remoteTimeMs = input.remoteCreatedAt;
  } else if (
    typeof input.remoteCreatedAt === "string" &&
    input.remoteCreatedAt.trim()
  ) {
    const parsed = Date.parse(input.remoteCreatedAt);
    if (Number.isFinite(parsed) && parsed > 0) {
      remoteTimeMs = parsed;
    }
  }

  if (remoteTimeMs === null) {
    return {
      action: "noop_up_to_date",
      remoteTimeMs: null,
      reason: "云端备份缺少有效时间戳，已跳过自动同步以保护本地数据",
    };
  }

  const localSyncMs =
    typeof input.localLastSyncAt === "number" &&
    Number.isFinite(input.localLastSyncAt) &&
    input.localLastSyncAt > 0
      ? input.localLastSyncAt
      : null;

  if (localSyncMs === null) {
    return {
      action: "pull_merge",
      remoteTimeMs,
      reason: "首次检测到云端备份，将以合并模式安全同步（保留本地已有数据）",
    };
  }

  if (remoteTimeMs > localSyncMs + tolerance) {
    return {
      action: "pull_merge",
      remoteTimeMs,
      reason: "检测到云端有更新的备份，将以合并模式安全同步",
    };
  }

  if (localSyncMs > remoteTimeMs + tolerance) {
    return {
      action: "noop_local_newer",
      remoteTimeMs,
      reason: "本地同步时间较云端更新，已保留本地数据不自动覆盖",
    };
  }

  return {
    action: "noop_up_to_date",
    remoteTimeMs,
    reason: "云端备份与本地已是最新状态",
  };
}

/**
 * 启动自动同步主入口（永不抛出未捕获异常）：
 * - 遵守超时限制，避免启动卡顿；
 * - 若云端存在更新备份，仅以非破坏性 merge 模式合并（或返回可拉取摘要）；
 * - 若本地较新，绝不覆盖本地数据；
 * - 若云端尚无备份（404），按策略上传首次备份。
 */
export async function runAutoSyncOnLaunch(
  config: WebdavConfig,
  password: string,
  localLastSyncAt: number | null,
  options?: AutoSyncLaunchOptions,
): Promise<WebdavAutoSyncResult> {
  const timeoutMs =
    typeof options?.timeoutMs === "number" &&
    Number.isFinite(options.timeoutMs) &&
    options.timeoutMs >= 500
      ? options.timeoutMs
      : WEBDAV_AUTO_SYNC_TIMEOUT_MS;
  const autoMerge = options?.autoMerge !== false;
  const pushWhenMissing = options?.pushWhenMissing !== false;
  const now =
    typeof options?.now === "number" && Number.isFinite(options.now)
      ? options.now
      : Date.now();

  try {
    const serverUrl =
      typeof config.serverUrl === "string" ? config.serverUrl.trim() : "";
    const username =
      typeof config.username === "string" ? config.username.trim() : "";
    const remotePath =
      typeof config.remotePath === "string" && config.remotePath.trim()
        ? config.remotePath.trim()
        : DEFAULT_WEBDAV_REMOTE_PATH;
    const trimmedPassword =
      typeof password === "string" ? password.trim() : "";

    if (!serverUrl) {
      return {
        status: "skipped",
        message: "尚未配置 WebDAV 服务器地址，已跳过启动自动同步",
        syncedAt: null,
      };
    }
    if (username && !trimmedPassword) {
      return {
        status: "skipped",
        message: "尚未保存 WebDAV 应用密码，已跳过启动自动同步",
        syncedAt: null,
      };
    }

    const normalizedConfig: WebdavConfig = {
      serverUrl,
      username,
      remotePath: normalizeWebdavRemotePath(remotePath),
    };
    const targetUrl = buildWebdavTargetUrl(
      normalizedConfig.serverUrl,
      normalizedConfig.remotePath,
    );
    const authHeader = resolveAuthHeader(
      normalizedConfig.username,
      trimmedPassword,
    );

    const headers: Record<string, string> = {
      Accept: "application/json, text/plain, */*",
      "Cache-Control": "no-cache",
      ...(authHeader ? { Authorization: authHeader } : {}),
    };
    const res = await webdavFetch(
      targetUrl,
      {
        method: "GET",
        headers,
      },
      timeoutMs,
    );

    if (res.status === 404) {
      const decision = decideAutoSyncAction({
        remoteCreatedAt: null,
        localLastSyncAt,
        hasRemote: false,
      });
      if (!pushWhenMissing) {
        return {
          status: "skipped",
          message: "云端尚无备份文件，可在 WebDAV 同步卡片手动上传",
          syncedAt: null,
          decision,
        };
      }
      const pushed = await pushBackupToWebdav(
        normalizedConfig,
        trimmedPassword,
        timeoutMs,
      );
      return {
        status: "pushed",
        message: `启动自动同步：云端尚无备份，已上传初始备份（${pushed.summary.schedules} 份课表 · ${pushed.summary.courses} 条课程）`,
        syncedAt: now,
        remoteCreatedAt: pushed.createdAt,
        summary: pushed.summary,
        decision,
      };
    }

    if (res.status < 200 || res.status >= 300) {
      return {
        status: "error",
        message: `启动自动同步未完成：${describeAuthOrHttpFailure(res.status, "检查云端备份")}`,
        syncedAt: null,
      };
    }

    const text = await res.text();
    const backup = parseBackup(text);
    const summary = backupSummary(backup);
    const decision = decideAutoSyncAction({
      remoteCreatedAt: backup.createdAt,
      localLastSyncAt,
      hasRemote: true,
    });

    if (decision.action === "noop_up_to_date") {
      return {
        status: "up_to_date",
        message: "启动自动同步：云端备份已是最新，无需更新",
        syncedAt: null,
        remoteCreatedAt: backup.createdAt,
        summary,
        decision,
      };
    }

    if (decision.action === "noop_local_newer") {
      return {
        status: "local_newer",
        message:
          "启动自动同步：本地记录较云端更新，已保留本地数据（如需同步请手动上传）",
        syncedAt: null,
        remoteCreatedAt: backup.createdAt,
        summary,
        decision,
      };
    }

    if (!autoMerge) {
      return {
        status: "available",
        message: `检测到云端有更新备份（${summary.schedules} 份课表 · ${summary.courses} 条课程 · ${summary.grades} 条成绩），可前往设置拉取合并`,
        syncedAt: null,
        remoteCreatedAt: backup.createdAt,
        summary,
        decision,
      };
    }

    await restoreWebdavBackup(backup, "merge");
    const syncedAt = Math.max(now, decision.remoteTimeMs ?? now);
    return {
      status: "merged",
      message: `启动自动同步：已安全合并云端更新（${summary.schedules} 份课表 · ${summary.courses} 条课程 · ${summary.grades} 条成绩）`,
      syncedAt,
      remoteCreatedAt: backup.createdAt,
      summary,
      decision,
    };
  } catch (error) {
    const detail =
      error instanceof Error ? error.message : "网络或 WebDAV 服务异常";
    return {
      status: "error",
      message: `启动自动同步失败：${detail}`,
      syncedAt: null,
    };
  }
}
