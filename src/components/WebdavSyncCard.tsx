import Ionicons from "@expo/vector-icons/Ionicons";
import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  Text,
  TextInput,
  View,
} from "react-native";

import { GlassContainer } from "./GlassContainer";
import { getWebdavPassword } from "@/services/webdavCredentials";
import {
  DEFAULT_WEBDAV_REMOTE_PATH,
  WEBDAV_PRESETS,
  getWebdavPreset,
  normalizeWebdavRemotePath,
  pullBackupFromWebdav,
  pushBackupToWebdav,
  restoreWebdavBackup,
  testWebdavConnection,
  type BackupSummary,
} from "@/services/webdavSync";
import { useWebdavSettings } from "@/store/useWebdavSettings";
import type { Backup } from "@/utils/backup";

type NoticeTone = "neutral" | "success" | "error";

interface ActionNotice {
  tone: NoticeTone;
  text: string;
}

function formatSyncTime(timestamp: number | null): string {
  if (!timestamp || !Number.isFinite(timestamp)) return "尚未同步";
  try {
    return new Date(timestamp).toLocaleString();
  } catch {
    return "已同步";
  }
}

export function WebdavSyncCard() {
  const preset = useWebdavSettings((s) => s.preset);
  const serverUrl = useWebdavSettings((s) => s.serverUrl);
  const username = useWebdavSettings((s) => s.username);
  const remotePath = useWebdavSettings((s) => s.remotePath);
  const lastSyncAt = useWebdavSettings((s) => s.lastSyncAt);
  const lastSyncMessage = useWebdavSettings((s) => s.lastSyncMessage);
  const hasPassword = useWebdavSettings((s) => s.hasPassword);

  const setPreset = useWebdavSettings((s) => s.setPreset);
  const setServerUrl = useWebdavSettings((s) => s.setServerUrl);
  const setUsername = useWebdavSettings((s) => s.setUsername);
  const setRemotePath = useWebdavSettings((s) => s.setRemotePath);
  const setLastSync = useWebdavSettings((s) => s.setLastSync);
  const refreshPasswordStatus = useWebdavSettings(
    (s) => s.refreshPasswordStatus,
  );
  const savePassword = useWebdavSettings((s) => s.savePassword);
  const clearPassword = useWebdavSettings((s) => s.clearPassword);

  const [passwordDraft, setPasswordDraft] = useState("");
  const [revealPassword, setRevealPassword] = useState(false);
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [notice, setNotice] = useState<ActionNotice | null>(null);
  const [pulled, setPulled] = useState<{
    backup: Backup;
    summary: BackupSummary;
  } | null>(null);
  const [restoreMode, setRestoreMode] = useState<"merge" | "replace">("merge");

  const activePreset = getWebdavPreset(preset);
  const busy = busyAction !== null;

  useEffect(() => {
    void refreshPasswordStatus().catch(() => {});
  }, [refreshPasswordStatus]);

  const resolveActivePassword = async (): Promise<string> => {
    const typed = passwordDraft.trim();
    if (typed) {
      await savePassword(typed);
      setPasswordDraft("");
      setRevealPassword(false);
      return typed;
    }
    return getWebdavPassword();
  };

  const buildCurrentConfig = () => {
    const resolvedRemotePath = remotePath.trim() || DEFAULT_WEBDAV_REMOTE_PATH;
    return {
      serverUrl: serverUrl.trim(),
      username: username.trim(),
      remotePath: resolvedRemotePath,
    };
  };

  const runAction = async (
    label: string,
    action: () => Promise<void>,
  ): Promise<void> => {
    if (busy) return;
    setBusyAction(label);
    setNotice(null);
    try {
      await action();
    } catch (error) {
      const text =
        error instanceof Error ? error.message : "WebDAV 操作未完成，请重试";
      setNotice({ tone: "error", text });
    } finally {
      setBusyAction(null);
    }
  };

  const handleSavePassword = () =>
    void runAction("保存密码", async () => {
      const trimmed = passwordDraft.trim();
      if (!trimmed) {
        setNotice({ tone: "error", text: "请先输入应用密码后再保存" });
        return;
      }
      await savePassword(trimmed);
      setPasswordDraft("");
      setRevealPassword(false);
      setNotice({
        tone: "success",
        text: "应用密码已保存至本机系统安全存储。",
      });
    });

  const handleClearPassword = () =>
    void runAction("清除密码", async () => {
      await clearPassword();
      setPasswordDraft("");
      setRevealPassword(false);
      setNotice({ tone: "neutral", text: "已清除本地保存的 WebDAV 密码。" });
    });

  const handleTestConnection = () =>
    void runAction("测试连接", async () => {
      const password = await resolveActivePassword();
      const config = buildCurrentConfig();
      const result = await testWebdavConnection(config, password);
      setNotice({
        tone: result.ok ? "success" : "error",
        text: result.message,
      });
    });

  const handlePushBackup = () =>
    void runAction("上传备份", async () => {
      const password = await resolveActivePassword();
      const config = buildCurrentConfig();
      const normalizedPath = normalizeWebdavRemotePath(config.remotePath);
      if (normalizedPath !== remotePath) {
        setRemotePath(normalizedPath);
      }
      const result = await pushBackupToWebdav(
        { ...config, remotePath: normalizedPath },
        password,
      );
      const summaryText = `已上传到云端（${result.summary.schedules} 份课表 · ${result.summary.courses} 条课程 · ${result.summary.grades} 条成绩）`;
      setLastSync({
        lastSyncAt: Date.now(),
        lastSyncMessage: summaryText,
      });
      setNotice({ tone: "success", text: summaryText });
    });

  const handlePullPreview = () =>
    void runAction("拉取云端备份", async () => {
      const password = await resolveActivePassword();
      const config = buildCurrentConfig();
      const normalizedPath = normalizeWebdavRemotePath(config.remotePath);
      if (normalizedPath !== remotePath) {
        setRemotePath(normalizedPath);
      }
      const result = await pullBackupFromWebdav(
        { ...config, remotePath: normalizedPath },
        password,
      );
      setPulled(result);
      setRestoreMode("merge");
      setNotice({
        tone: "success",
        text: "云端备份校验通过，请确认下方恢复方式。",
      });
    });

  const handleConfirmRestore = () => {
    if (!pulled) return;
    const targetBackup = pulled.backup;
    const selectedMode = restoreMode;
    void runAction("恢复云端备份", async () => {
      await restoreWebdavBackup(targetBackup, selectedMode);
      setPulled(null);
      const text =
        selectedMode === "replace"
          ? "已从云端备份覆盖恢复数据。"
          : "已从云端备份合并导入数据。";
      setLastSync({
        lastSyncAt: Date.now(),
        lastSyncMessage: text,
      });
      setNotice({ tone: "success", text });
    });
  };

  const liveMessage = notice?.text || lastSyncMessage;
  const liveTone: NoticeTone = notice?.tone ?? "neutral";
  const liveToneClass =
    liveTone === "success"
      ? "text-emerald-600 dark:text-emerald-300"
      : liveTone === "error"
        ? "text-rose-600 dark:text-rose-300"
        : "text-slate-600 dark:text-slate-300";

  return (
    <GlassContainer radius={24} intensity={42} borderOpacity={0.22}>
      <View style={{ padding: 18, gap: 14 }}>
        <View className="flex-row items-start justify-between gap-2">
          <View className="flex-1">
            <View className="flex-row items-center gap-2">
              <Ionicons name="cloud-outline" size={19} color="#38BDF8" />
              <Text className="text-lg font-bold text-slate-800 dark:text-white">
                WebDAV 云端同步
              </Text>
            </View>
            <Text className="mt-1 text-xs leading-5 text-slate-500 dark:text-slate-400">
              直连个人网盘或自建 NAS，跨设备加密传输与恢复完整备份，不经第三方中转服务器。
            </Text>
          </View>
          <View className="rounded-full bg-slate-400/15 px-2.5 py-1">
            <Text className="text-[11px] font-semibold text-slate-600 dark:text-slate-300">
              {hasPassword ? "密码已存" : "未存密码"}
            </Text>
          </View>
        </View>

        {/* 服务商预设 */}
        <View style={{ gap: 8 }}>
          <Text className="text-xs font-semibold text-slate-600 dark:text-slate-300">
            服务预设
          </Text>
          <View className="flex-row flex-wrap gap-2">
            {WEBDAV_PRESETS.map((item) => {
              const selected = preset === item.id;
              return (
                <Pressable
                  key={item.id}
                  disabled={busy}
                  accessibilityRole="radio"
                  accessibilityState={{ checked: selected }}
                  onPress={() => {
                    setPreset(item.id);
                    setNotice(null);
                  }}
                  className={`rounded-xl border px-3 py-1.5 ${
                    selected
                      ? "border-sky-500/75 bg-sky-500/20"
                      : "border-slate-300/30 bg-white/25 dark:border-white/10 dark:bg-white/[0.05]"
                  }`}
                >
                  <Text
                    className={`text-xs font-semibold ${
                      selected
                        ? "text-sky-700 dark:text-sky-300"
                        : "text-slate-600 dark:text-slate-300"
                    }`}
                  >
                    {item.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>
          <Text className="text-xs leading-5 text-slate-500 dark:text-slate-400">
            {activePreset.hint}
          </Text>
        </View>

        {/* 连接参数表单 */}
        <View style={{ gap: 10 }}>
          <View style={{ gap: 4 }}>
            <Text className="text-xs font-semibold text-slate-600 dark:text-slate-300">
              服务器地址
            </Text>
            <TextInput
              accessibilityLabel="WebDAV 服务器地址"
              editable={!busy}
              value={serverUrl}
              onChangeText={(value) => {
                setServerUrl(value);
                setNotice(null);
              }}
              placeholder={activePreset.placeholderUrl}
              placeholderTextColor="#94A3B8"
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="url"
              className="rounded-xl border border-slate-300/35 bg-white/40 px-3 py-2.5 text-[13px] text-slate-800 dark:border-white/10 dark:bg-white/[0.06] dark:text-slate-100"
            />
          </View>

          <View style={{ gap: 4 }}>
            <Text className="text-xs font-semibold text-slate-600 dark:text-slate-300">
              用户名
            </Text>
            <TextInput
              accessibilityLabel="WebDAV 用户名"
              editable={!busy}
              value={username}
              onChangeText={(value) => {
                setUsername(value);
                setNotice(null);
              }}
              placeholder={activePreset.usernamePlaceholder}
              placeholderTextColor="#94A3B8"
              autoCapitalize="none"
              autoCorrect={false}
              className="rounded-xl border border-slate-300/35 bg-white/40 px-3 py-2.5 text-[13px] text-slate-800 dark:border-white/10 dark:bg-white/[0.06] dark:text-slate-100"
            />
          </View>

          <View style={{ gap: 6 }}>
            <View className="flex-row items-center justify-between">
              <Text className="text-xs font-semibold text-slate-600 dark:text-slate-300">
                应用密码
              </Text>
              <Text className="text-[11px] text-slate-500 dark:text-slate-400">
                仅存本机系统安全存储（SecureStore）
              </Text>
            </View>
            <View className="flex-row items-center rounded-xl border border-slate-300/35 bg-white/40 dark:border-white/10 dark:bg-white/[0.06]">
              <TextInput
                accessibilityLabel="WebDAV 应用密码"
                editable={!busy}
                value={passwordDraft}
                onChangeText={(value) => {
                  setPasswordDraft(value);
                  setNotice(null);
                }}
                placeholder={
                  hasPassword
                    ? "已保存密码（留空沿用，或输入新密码覆盖）"
                    : activePreset.passwordHint
                }
                placeholderTextColor="#94A3B8"
                autoCapitalize="none"
                autoCorrect={false}
                secureTextEntry={!revealPassword}
                className="flex-1 px-3 py-2.5 text-[13px] text-slate-800 dark:text-slate-100"
              />
              <Pressable
                disabled={busy}
                accessibilityRole="button"
                accessibilityLabel={revealPassword ? "隐藏密码" : "显示密码"}
                onPress={() => setRevealPassword((prev) => !prev)}
                className="h-10 w-10 items-center justify-center"
              >
                <Ionicons
                  name={revealPassword ? "eye-off-outline" : "eye-outline"}
                  size={18}
                  color="#94A3B8"
                />
              </Pressable>
            </View>

            <View className="flex-row gap-2">
              <Pressable
                disabled={busy || !passwordDraft.trim()}
                accessibilityRole="button"
                onPress={handleSavePassword}
                className={`flex-1 items-center rounded-xl border border-sky-500/45 bg-sky-500/15 py-2 ${
                  busy || !passwordDraft.trim() ? "opacity-45" : ""
                }`}
              >
                <Text className="text-xs font-bold text-sky-700 dark:text-sky-300">
                  保存密码
                </Text>
              </Pressable>
              <Pressable
                disabled={busy || (!hasPassword && !passwordDraft.trim())}
                accessibilityRole="button"
                onPress={handleClearPassword}
                className={`flex-1 items-center rounded-xl border border-rose-500/35 bg-rose-500/10 py-2 ${
                  busy || (!hasPassword && !passwordDraft.trim())
                    ? "opacity-45"
                    : ""
                }`}
              >
                <Text className="text-xs font-bold text-rose-600 dark:text-rose-300">
                  清除密码
                </Text>
              </Pressable>
            </View>
          </View>

          <View style={{ gap: 4 }}>
            <View className="flex-row items-center justify-between">
              <Text className="text-xs font-semibold text-slate-600 dark:text-slate-300">
                远程备份路径
              </Text>
              {remotePath.trim() !== DEFAULT_WEBDAV_REMOTE_PATH ? (
                <Pressable
                  disabled={busy}
                  accessibilityRole="button"
                  onPress={() => setRemotePath(DEFAULT_WEBDAV_REMOTE_PATH)}
                >
                  <Text className="text-[11px] font-semibold text-sky-600 dark:text-sky-300">
                    恢复默认路径
                  </Text>
                </Pressable>
              ) : null}
            </View>
            <TextInput
              accessibilityLabel="远程备份路径"
              editable={!busy}
              value={remotePath}
              onChangeText={(value) => {
                setRemotePath(value);
                setNotice(null);
              }}
              placeholder={DEFAULT_WEBDAV_REMOTE_PATH}
              placeholderTextColor="#94A3B8"
              autoCapitalize="none"
              autoCorrect={false}
              className="rounded-xl border border-slate-300/35 bg-white/40 px-3 py-2.5 text-[13px] text-slate-800 dark:border-white/10 dark:bg-white/[0.06] dark:text-slate-100"
            />
          </View>
        </View>

        {/* 操作按钮 */}
        <View style={{ gap: 10 }}>
          <View className="flex-row gap-2.5">
            <Pressable
              disabled={busy}
              accessibilityRole="button"
              onPress={handleTestConnection}
              className={`flex-1 rounded-xl border border-sky-500/45 bg-sky-500/12 p-3 ${
                busy ? "opacity-50" : ""
              }`}
            >
              <Text className="text-center font-bold text-sky-700 dark:text-sky-300">
                测试连接
              </Text>
            </Pressable>
            <Pressable
              disabled={busy}
              accessibilityRole="button"
              onPress={handlePushBackup}
              className={`flex-1 rounded-xl bg-sky-500 p-3 ${
                busy ? "opacity-50" : ""
              }`}
            >
              <Text className="text-center font-bold text-white">
                上传到云端
              </Text>
            </Pressable>
          </View>

          <Pressable
            disabled={busy}
            accessibilityRole="button"
            onPress={handlePullPreview}
            className={`rounded-xl bg-slate-400/20 p-3 ${
              busy ? "opacity-50" : ""
            }`}
          >
            <Text className="text-center font-bold text-slate-700 dark:text-white">
              从云端拉取并预览
            </Text>
          </Pressable>
        </View>

        {/* 拉取后的安全预览与恢复方式选择（复用本地备份安全 UX） */}
        {pulled ? (
          <View
            style={{ gap: 12 }}
            className="rounded-2xl border border-sky-500/25 bg-sky-500/5 p-3.5"
          >
            <Text className="font-bold text-slate-800 dark:text-white">
              云端备份校验通过 ·{" "}
              {new Date(pulled.backup.createdAt).toLocaleString()}
            </Text>
            <Text className="text-sm text-slate-600 dark:text-slate-300">
              {pulled.summary.schedules} 份课表 · {pulled.summary.courses}{" "}
              条课程 · {pulled.summary.grades} 条成绩 ·{" "}
              {pulled.summary.messages} 条聊天
              {pulled.summary.farm
                ? ` · 含农场进度（${pulled.summary.coins} 金币）`
                : ""}
            </Text>
            {(["merge", "replace"] as const).map((value) => (
              <Pressable
                key={value}
                disabled={busy}
                accessibilityRole="radio"
                accessibilityState={{ checked: restoreMode === value }}
                onPress={() => setRestoreMode(value)}
                className={
                  restoreMode === value
                    ? "rounded-xl bg-sky-400/25 p-3"
                    : "rounded-xl bg-slate-400/10 p-3"
                }
              >
                <Text className="font-bold text-slate-800 dark:text-white">
                  {value === "merge" ? "合并导入" : "覆盖恢复"}
                  {restoreMode === value ? " ✓" : ""}
                </Text>
                <Text className="mt-1 text-xs text-slate-600 dark:text-slate-300">
                  {value === "merge"
                    ? "追加不同 ID 的课表、成绩和记忆，同 ID 保留当前内容。已有农场进度与偏好继续使用当前数据。"
                    : "覆盖备份中包含的数据。当前 API 密钥、WebDAV 密码、自定义背景与联网用量保持不变。"}
                </Text>
              </Pressable>
            ))}
            <Pressable
              disabled={busy}
              accessibilityRole="button"
              onPress={handleConfirmRestore}
              className="rounded-xl bg-emerald-600 p-3"
            >
              <Text className="text-center font-bold text-white">
                {restoreMode === "replace"
                  ? "确认覆盖为云端数据"
                  : "确认合并云端数据"}
              </Text>
            </Pressable>
            <Pressable
              disabled={busy}
              accessibilityRole="button"
              onPress={() => setPulled(null)}
            >
              <Text className="text-center text-slate-500 dark:text-slate-400">
                取消恢复
              </Text>
            </Pressable>
          </View>
        ) : null}

        {/* 状态栏与上次同步时间 */}
        {busy ? (
          <View className="flex-row items-center gap-2">
            <ActivityIndicator color="#38BDF8" />
            <Text className="text-xs text-slate-500 dark:text-slate-400">
              正在{busyAction}…
            </Text>
          </View>
        ) : null}

        <View style={{ gap: 4 }}>
          <Text className="text-xs text-slate-500 dark:text-slate-400">
            上次同步：{formatSyncTime(lastSyncAt)}
          </Text>
          {liveMessage ? (
            <Text
              accessibilityLiveRegion="polite"
              className={`text-sm ${liveToneClass}`}
            >
              {liveMessage}
            </Text>
          ) : null}
        </View>
      </View>
    </GlassContainer>
  );
}
