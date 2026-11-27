import { DarkTheme, DefaultTheme, router, Stack, ThemeProvider, usePathname } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { colorScheme as appColorScheme, useColorScheme } from "nativewind";
import { useEffect, useRef, useState } from "react";
import { ActivityIndicator, AppState, Pressable, Text, View } from "react-native";
import { useDataSession } from '@/store/useDataSession';
import { recoverInterruptedRestore } from '@/services/restoreTransaction';
import { flushPendingWrites, withPendingWritesSuspended } from '@/utils/coalescedWriter';
import { disposeWhaleVoice, stopWhaleVoice } from "@/services/whaleVoice";
import { stopAllSfx } from "@/services/soundEffects";
import { useSoundEffects } from "@/store/useSoundEffects";
import { useWhaleMemory } from "@/store/useWhaleMemory";
import { useWhalePet } from "@/store/useWhalePet";
import { useWhaleVoice } from "@/store/useWhaleVoice";
import { GestureHandlerRootView } from "react-native-gesture-handler";

import { AppErrorBoundary } from "@/components/AppErrorBoundary";
import { CourseReminderSync } from "@/components/CourseReminderSync";
import { CourseWidgetSync } from "@/components/CourseWidgetSync";
import { ImportTaskOverlay } from "@/components/ImportTaskOverlay";
import { WhalePet } from "@/components/WhalePet";
import { triggerWhaleWave, WhaleWaveOverlay } from "@/components/WhaleSummonFX";
import { useSettings } from "@/store/useSettings";
import "@/global.css";

/** 衔接大肥鱼界面进出、人格切换与主题色温变更时的全局径向水波纹扩散 */
function WhaleWaveCoordinator() {
  const pathname = usePathname();
  const prevPathRef = useRef<string | null>(null);

  useEffect(() => {
    const prev = prevPathRef.current;
    prevPathRef.current = pathname;
    if (!prev || prev === pathname) return;
    const whaleOn = useWhaleMemory.getState().active || useWhalePet.getState().visible;
    if (!whaleOn) return;
    const tint = useSettings.getState().backgroundTint;
    if (prev === "/assistant" && pathname !== "/assistant") {
      triggerWhaleWave({ kind: "exit", tint });
    } else if (prev !== "/assistant" && pathname === "/assistant") {
      triggerWhaleWave({ kind: "enter", tint });
    }
  }, [pathname]);

  useEffect(() => {
    let settingsReady = useSettings.persist.hasHydrated();
    const unsubHydrate = useSettings.persist.onFinishHydration(() => {
      settingsReady = true;
    });
    const unsubSettings = useSettings.subscribe((next, prev) => {
      if (!settingsReady) return;
      if (
        next.backgroundTint !== prev.backgroundTint ||
        next.appearance !== prev.appearance ||
        next.material !== prev.material
      ) {
        triggerWhaleWave({ kind: "theme", tint: next.backgroundTint });
      }
    });
    const unsubMemory = useWhaleMemory.subscribe((next, prev) => {
      if (!prev.hydrated || !next.hydrated) return;
      if (next.active !== prev.active) {
        triggerWhaleWave({
          kind: next.active ? "summon" : "leave",
          tint: useSettings.getState().backgroundTint,
          silent: true,
        });
      }
    });
    return () => {
      unsubHydrate();
      unsubSettings();
      unsubMemory();
    };
  }, []);

  return <WhaleWaveOverlay />;
}

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
    void useSoundEffects.getState().hydrate();
    const state = AppState.addEventListener("change", (next) => {
      if (next !== "active") { stopWhaleVoice(); stopAllSfx(); void flushPendingWrites().catch(() => {}); }
    });
    const unsubscribe = useWhaleVoice.subscribe((next, prev) => {
      if (!next.on && prev.on) stopWhaleVoice();
    });
    const unsubscribeSfx = useSoundEffects.subscribe((next, prev) => {
      if (!next.on && prev.on) stopAllSfx();
    });
    return () => { state.remove(); unsubscribe(); unsubscribeSfx(); disposeWhaleVoice(); stopAllSfx(); };
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
        <AppErrorBoundary isDark={isDark} onGoHome={() => router.replace("/")}>
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
            <Stack.Screen
              name="assistant"
              options={{
                animation: "fade",
                animationDuration: 180,
              }}
            />
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
        </AppErrorBoundary>
        {/* 全局导入任务悬浮层：分析进度弹窗 / 可拖动进度球，退出导入页后任务继续 */}
        <CourseReminderSync />
        <CourseWidgetSync />
        <ImportTaskOverlay />
        {/* 大肥鱼进退场与主题切换径向扩散波纹层（精确锚定底部中央按钮） */}
        <WhaleWaveCoordinator />
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
