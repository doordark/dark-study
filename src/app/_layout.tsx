import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { colorScheme as appColorScheme, useColorScheme } from "nativewind";
import { useEffect } from "react";
import { GestureHandlerRootView } from "react-native-gesture-handler";

import { ImportTaskOverlay } from "@/components/ImportTaskOverlay";
import { WhalePet } from "@/components/WhalePet";
import { useSettings } from "@/store/useSettings";
import "@/global.css";

export default function RootLayout() {
  const { colorScheme } = useColorScheme();
  const appearance = useSettings((s) => s.appearance);
  const isDark = colorScheme !== "light";

  // Reapply the saved theme after storage hydration, including direct web loads.
  useEffect(() => {
    appColorScheme.set(appearance);
  }, [appearance]);

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <ThemeProvider value={isDark ? DarkTheme : DefaultTheme}>
        <Stack
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
          <Stack.Screen name="whale-settings" options={{ presentation: "modal" }} />
          <Stack.Screen
            name="farm"
            options={{ presentation: "fullScreenModal", animation: "fade" }}
          />
        </Stack>
        {/* 全局导入任务悬浮层：分析进度弹窗 / 可拖动进度球，退出导入页后任务继续 */}
        <ImportTaskOverlay />
        {/* 大肥鱼桌宠：从对话里叫出来后常驻在所有页面之上 */}
        <WhalePet />
        <StatusBar style={isDark ? "light" : "dark"} />
      </ThemeProvider>
    </GestureHandlerRootView>
  );
}
