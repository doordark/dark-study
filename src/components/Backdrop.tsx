import { LinearGradient } from "expo-linear-gradient";
import React from "react";
import { ImageBackground, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useColorScheme } from "nativewind";

import { GlassTargetProvider } from "@/components/GlassContainer";
import { useSettings } from "@/store/useSettings";

/**
 * HyperOS 4「生命感」氛围底色：
 * 沉浸式墨灰蓝 + 径向柔光（用叠加的大尺寸柔光圆模拟）。
 * 支持用户自定义背景图（覆盖在渐变之上，柔光叠加其上）。
 */
export function Backdrop({ children }: { children?: React.ReactNode }) {
  const { colorScheme } = useColorScheme();
  const isDark = colorScheme !== "light";
  const backgroundImage = useSettings((s) => s.backgroundImage);
  const insets = useSafeAreaInsets();

  const glow1Color = isDark ? "rgba(56,189,248,0.16)" : "rgba(56,189,248,0.22)";
  const glow2Color = isDark ? "rgba(139,92,246,0.14)" : "rgba(139,92,246,0.18)";
  const glow3Color = isDark ? "rgba(34,211,238,0.08)" : "rgba(34,211,238,0.12)";

  const body = (
    <>
      <LinearGradient
        style={StyleSheet.absoluteFill}
        colors={
          isDark
            ? (["#0F172A", "#0B1122", "#090D16"] as const)
            : (["#EAF2FF", "#EEF4FF", "#F6F8FC"] as const)
        }
        start={{ x: 0.15, y: 0 }}
        end={{ x: 0.85, y: 1 }}
      />

      {/* 自定义背景图层 */}
      {backgroundImage ? (
        <ImageBackground
          source={{ uri: backgroundImage }}
          style={StyleSheet.absoluteFill}
          resizeMode="cover"
        />
      ) : null}

      {/* 径向柔光 —— 仅默认渐变背景时叠加；使用自定义背景图时不叠加 */}
      {!backgroundImage ? (
        <>
          {/* 径向柔光 1 —— 顶部冷蓝 */}
          <View
            pointerEvents="none"
            style={[
              styles.glow,
              { top: -140, right: -110, backgroundColor: glow1Color },
            ]}
          />

          {/* 径向柔光 2 —— 左下紫雾 */}
          <View
            pointerEvents="none"
            style={[
              styles.glow,
              { bottom: -180, left: -140, backgroundColor: glow2Color },
            ]}
          />

          {/* 径向柔光 3 —— 中部青光 */}
          <View
            pointerEvents="none"
            style={[
              styles.glow,
              { top: "38%", alignSelf: "center", backgroundColor: glow3Color },
            ]}
          />
        </>
      ) : null}

      {/* 内容层：避开状态栏（顶部安全区），渐变仍铺满全屏 */}
      <View style={{ flex: 1, paddingTop: insets.top }}>{children}</View>
    </>
  );

  // 页面级模糊源：本页面的玻璃组件模糊本页面的背景。
  // 不在导航器外层共享模糊源——BlurTargetView 会代理子视图树，
  // 在 Android 上会破坏 react-native-screens 转场导致崩溃。
  return (
    <GlassTargetProvider>
      <View className="flex-1">{body}</View>
    </GlassTargetProvider>
  );
}

const styles = StyleSheet.create({
  glow: {
    position: "absolute",
    width: 380,
    height: 380,
    borderRadius: 190,
  },
});
