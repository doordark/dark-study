import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { colorScheme as appColorScheme, useColorScheme } from "nativewind";
import { useEffect, useState } from "react";
import { ActivityIndicator, AppState, Pressable, Text, View } from "react-native";
import { useDataSession } from '@/store/useDataSession';
import { recoverInterruptedRestore } from '@/services/restoreTransaction';
import { flushPendingWrites, withPendingWritesSuspended } from '@/utils/coalescedWriter';
import { disposeWhaleVoice, stopWhaleVoice } from "@/services/whaleVoice";
import { useWhaleVoice } from "@/store/useWhaleVoice";
import { GestureHandlerRootView } from "react-native-gesture-handler";

import { CourseReminderSync } from "@/components/CourseReminderSync";
import { CourseWidgetSync } from "@/components/CourseWidgetSync";
import { ImportTaskOverlay } from "@/components/ImportTaskOverlay";
import { WhalePet } from "@/components/WhalePet";
import { useSettings } from "@/store/useSettings";
import "@/global.css";

export default function RootLayout() {
  const { colorScheme } = useColorScheme();
  const appearance = useSettings((s) => s.appearance);
  const isDark = colorScheme !== "light";
  const dataRevision = useDataSession(s => s.revision);
  const restoring = useDataSession(s => s.restoring);
  const [bootReady, setBootReady] = useState(false);
  const [bootError, setBootError] = useState('');
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    let mounted = true;
    void withPendingWritesSuspended(async () => {
      const recovered = await recoverInterruptedRestore();
      if (recovered) await (await import('@/services/backupStorage')).hydrateBackupStores();
    }).then(() => {
      if (mounted) setBootReady(true);
    }).catch(error => { if (mounted) setBootError(error instanceof Error ? error.message : '数据恢复未完成'); });
    return () => { mounted = false; };
  }, [retry]);

  useEffect(() => {

    void useWhaleVoice.getState().hydrate();
    const state = AppState.addEventListener("change", (next) => {
      if (next !== "active") { stopWhaleVoice(); void flushPendingWrites().catch(() => {}); }
    });
    const unsubscribe = useWhaleVoice.subscribe((next, prev) => {
      if (!next.on && prev.on) stopWhaleVoice();

    });
    return () => { state.remove(); unsubscribe(); disposeWhaleVoice(); };
  }, []);

  // Reapply the saved theme after storage hydration, including direct web loads.
  useEffect(() => {
    appColorScheme.set(appearance);
  }, [appearance]);

  if (!bootReady) return <GestureHandlerRootView style={{ flex: 1 }}><View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, backgroundColor: isDark ? '#111928' : '#FFFFFF', gap: 16 }}>
    {bootError ? <><Text style={{ color: isDark ? '#E2E8F0' : '#334155' }}>{bootError}</Text><Pressable onPress={() => { setBootError(''); setRetry(value => value + 1); }}><Text style={{ color: '#0EA5E9' }}>重试恢复原数据</Text></Pressable></> : <ActivityIndicator color="#38BDF8" />}
  </View></GestureHandlerRootView>;

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <ThemeProvider value={isDark ? DarkTheme : DefaultTheme}>
        <Stack
          key={`navigation-${dataRevision}`}
          screenOptions={{
            headerShown: false,
            animation: "slide_from_bottom",
            contentStyle: { backgroundColor: "transparent" },
          }}
        >
          <Stack.Screen name="index" />
          <Stack.Screen name="import" options={{ presentation: "modal" }} />
          <Stack.Screen name="assistant" options={{ presentation: "modal" }} />
          <Stack.Screen name="grades" options={{ presentation: "modal" }} />
          <Stack.Screen name="settings" options={{ presentation: "modal" }} />
          <Stack.Screen name="settings/[category]" options={{ animation: "slide_from_right" }} />
          <Stack.Screen name="whale-settings" options={{ presentation: "modal" }} />
          <Stack.Screen
            name="farm"
            options={{
              presentation: "fullScreenModal",
              animation: "none",
              contentStyle: { backgroundColor: "#081224" },
            }}
          />
        </Stack>
        {/* 全局导入任务悬浮层：分析进度弹窗 / 可拖动进度球，退出导入页后任务继续 */}
        <CourseReminderSync />
        <CourseWidgetSync />
        <ImportTaskOverlay />
        {/* 大肥鱼桌宠：从对话里叫出来后常驻在所有页面之上 */}
        <WhalePet key={`pet-${dataRevision}`} />
        {restoring ? <View style={{ position: 'absolute', inset: 0, backgroundColor: isDark ? '#111928EE' : '#FFFFFFEE', justifyContent: 'center', alignItems: 'center', gap: 14 }}>
          <ActivityIndicator color="#38BDF8" /><Text style={{ color: isDark ? '#E2E8F0' : '#334155' }}>正在恢复数据…</Text>
        </View> : null}
        <StatusBar style={isDark ? "light" : "dark"} />
      </ThemeProvider>
    </GestureHandlerRootView>
  );
}
