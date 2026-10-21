import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useColorScheme } from "nativewind";
import { GestureHandlerRootView } from "react-native-gesture-handler";

import { ImportTaskOverlay } from "@/components/ImportTaskOverlay";
import "@/global.css";

export default function RootLayout() {
  const { colorScheme } = useColorScheme();
  const isDark = colorScheme !== "light";

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
        </Stack>
        {/* 全局导入任务悬浮层：分析进度弹窗 / 可拖动进度球，退出导入页后任务继续 */}
        <ImportTaskOverlay />
        <StatusBar style={isDark ? "light" : "dark"} />
      </ThemeProvider>
    </GestureHandlerRootView>
  );
}
