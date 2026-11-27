import Ionicons from "@expo/vector-icons/Ionicons";
import * as Network from "expo-network";
import { useColorScheme } from "nativewind";
import { useEffect, useRef, useState } from "react";
import { Pressable, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { getWebdavPassword } from "@/services/webdavCredentials";
import {
  DEFAULT_WEBDAV_REMOTE_PATH,
  runAutoSyncOnLaunch,
} from "@/services/webdavSync";
import { useDataSession } from "@/store/useDataSession";
import { useImportTask } from "@/store/useImportTask";
import { useSettings } from "@/store/useSettings";
import { useStore } from "@/store/useStore";
import { useWebdavSettings } from "@/store/useWebdavSettings";

const LAUNCH_DELAY_MS = 1200;
const TOAST_DURATION_MS = 3800;

async function isNetworkReadyForSync(): Promise<boolean> {
  try {
    const state = await Network.getNetworkStateAsync();
    return Boolean(state.isConnected) && state.isInternetReachable !== false;
  } catch {
    return true;
  }
}

/**
 * 启动期 WebDAV 自动同步守护组件（每次冷启动至多执行一次）：
 * 等待核心持久化 Store 完成水合后，若用户开启了 autoSyncOnLaunch 且凭据完整，
 * 在后台安全检查云端备份并在有更新时非破坏性合并，完成后以轻量悬浮胶囊提示。
 */
export function WebdavAutoSync() {
  const { colorScheme } = useColorScheme();
  const isDark = colorScheme !== "light";
  const insets = useSafeAreaInsets();

  const [ready, setReady] = useState(false);
  const [toastText, setToastText] = useState<string | null>(null);
  const hasAttemptedRef = useRef(false);

  useEffect(() => {
    const check = () =>
      setReady(
        useWebdavSettings.persist.hasHydrated() &&
          useStore.persist.hasHydrated() &&
          useSettings.persist.hasHydrated(),
      );
    const unsubWebdav = useWebdavSettings.persist.onFinishHydration(check);
    const unsubStore = useStore.persist.onFinishHydration(check);
    const unsubSettings = useSettings.persist.onFinishHydration(check);
    check();
    return () => {
      unsubWebdav();
      unsubStore();
      unsubSettings();
    };
  }, []);

  useEffect(() => {
    if (!toastText) return;
    const dismissTimer = setTimeout(() => {
      setToastText(null);
    }, TOAST_DURATION_MS);
    return () => clearTimeout(dismissTimer);
  }, [toastText]);

  useEffect(() => {
    if (!ready || hasAttemptedRef.current) return;
    hasAttemptedRef.current = true;

    let cancelled = false;
    const timer = setTimeout(() => {
      void (async () => {
        try {
          const webdavState = useWebdavSettings.getState();
          if (!webdavState.autoSyncOnLaunch) return;

          const serverUrl = webdavState.serverUrl.trim();
          const username = webdavState.username.trim();
          const remotePath =
            webdavState.remotePath.trim() || DEFAULT_WEBDAV_REMOTE_PATH;
          if (!serverUrl) return;

          if (
            useDataSession.getState().restoring ||
            useImportTask.getState().status === "analyzing"
          ) {
            return;
          }

          const online = await isNetworkReadyForSync();
          if (cancelled || !online) return;

          const password = await getWebdavPassword();
          if (cancelled) return;
          if (username && !password) return;

          const result = await runAutoSyncOnLaunch(
            { serverUrl, username, remotePath },
            password,
            webdavState.lastSyncAt,
          );
          if (cancelled) return;

          if (result.status === "merged" || result.status === "pushed") {
            useWebdavSettings.getState().setLastSync({
              lastSyncAt: result.syncedAt ?? Date.now(),
              lastSyncMessage: result.message,
            });
            setToastText(
              result.status === "merged"
                ? "WebDAV 已同步 · 已安全合并云端最新数据"
                : "WebDAV 已同步 · 已上传首次云端备份",
            );
          } else if (
            result.status === "up_to_date" ||
            result.status === "local_newer" ||
            result.status === "error"
          ) {
            useWebdavSettings.getState().setLastSync({
              lastSyncMessage: result.message,
            });
          }
        } catch {
          // 启动后台同步绝不向上抛出异常影响主界面
        }
      })();
    }, LAUNCH_DELAY_MS);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [ready]);

  if (!toastText) return null;

  return (
    <View
      pointerEvents="box-none"
      style={{
        position: "absolute",
        top: Math.max(12, insets.top + 8),
        left: 16,
        right: 16,
        alignItems: "center",
        zIndex: 60,
      }}
    >
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="关闭云端同步提示"
        onPress={() => setToastText(null)}
        style={{
          flexDirection: "row",
          alignItems: "center",
          gap: 7,
          paddingHorizontal: 14,
          paddingVertical: 9,
          borderRadius: 999,
          backgroundColor: isDark
            ? "rgba(15, 23, 42, 0.92)"
            : "rgba(255, 255, 255, 0.94)",
          borderWidth: 1,
          borderColor: isDark
            ? "rgba(56, 189, 248, 0.35)"
            : "rgba(14, 165, 233, 0.28)",
          shadowColor: "#020617",
          shadowOpacity: isDark ? 0.36 : 0.12,
          shadowRadius: 12,
          shadowOffset: { width: 0, height: 4 },
          elevation: 6,
        }}
      >
        <Ionicons name="cloud-done-outline" size={15} color="#38BDF8" />
        <Text
          numberOfLines={1}
          style={{
            fontSize: 12,
            fontWeight: "600",
            color: isDark ? "#E2E8F0" : "#0F172A",
          }}
        >
          {toastText}
        </Text>
      </Pressable>
    </View>
  );
}
