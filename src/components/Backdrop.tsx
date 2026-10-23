import { LinearGradient } from "expo-linear-gradient";
import React from "react";
import { ImageBackground, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useColorScheme } from "nativewind";

import {
  BACKGROUND_PRESETS,
  resolveEffect,
  resolveTint,
} from "@/constants/backgrounds";
import { GlassTargetProvider } from "@/components/GlassContainer";
import { useSettings } from "@/store/useSettings";

/**
 * HyperOS 4「生命感」氛围底色：
 * 沉浸式墨灰蓝 + 径向柔光（用叠加的大尺寸柔光圆模拟）。
 * 支持用户自定义背景图（覆盖在渐变之上，柔光叠加其上）。
 * 色调和光效可由大肥鱼代大爹切换。
 */
export function Backdrop({ children }: { children?: React.ReactNode }) {
  const { colorScheme } = useColorScheme();
  const isDark = colorScheme !== "light";
  const backgroundImage = useSettings((s) => s.backgroundImage);
  const tint = useSettings((s) => s.backgroundTint);
  const effect = useSettings((s) => s.backgroundEffect);
  const insets = useSafeAreaInsets();

  const preset = BACKGROUND_PRESETS[resolveTint(tint)];
  const mode = resolveEffect(effect);
  const glowAlpha = isDark ? [0.16, 0.14, 0.08] : [0.22, 0.18, 0.12];
  const glowColors = (mode === "aurora" ? preset.glowRgb : []).map(
    (rgb, i) => `rgba(${rgb},${glowAlpha[i]})`,
  );

  const body = (
    <>
      <LinearGradient
        style={StyleSheet.absoluteFill}
        colors={isDark ? preset.dark : preset.light}
        start={{ x: 0.15, y: 0 }}
        end={{ x: 0.85, y: 1 }}
      />

      {/* 自定义背景图层 */}
      {backgroundImage ? (
        <>
          <ImageBackground
            source={{ uri: backgroundImage }}
            style={StyleSheet.absoluteFill}
            resizeMode="cover"
          />
          {/* 色调薄雾：让大爹选的背景色也能压住自定义图片 */}
          <View
            pointerEvents="none"
            style={[
              StyleSheet.absoluteFill,
              {
                backgroundColor: `rgba(${preset.glowRgb[0]},${
                  isDark ? 0.1 : 0.12
                })`,
              },
            ]}
          />
        </>
      ) : null}

      {/* 径向柔光 —— 仅默认渐变背景且光效为 aurora 时叠加 */}
      {!backgroundImage && mode === "aurora" ? (
        <>
          {/* 径向柔光 1 —— 顶部主色 */}
          <View
            pointerEvents="none"
            style={[
              styles.glow,
              { top: -140, right: -110, backgroundColor: glowColors[0] },
            ]}
          />

          {/* 径向柔光 2 —— 左下副色 */}
          <View
            pointerEvents="none"
            style={[
              styles.glow,
              { bottom: -180, left: -140, backgroundColor: glowColors[1] },
            ]}
          />

          {/* 径向柔光 3 —— 中部点缀色 */}
          <View
            pointerEvents="none"
            style={[
              styles.glow,
              { top: "38%", alignSelf: "center", backgroundColor: glowColors[2] },
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
