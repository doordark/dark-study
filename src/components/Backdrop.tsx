import { BlurTargetView } from "expo-blur";
import { LinearGradient } from "expo-linear-gradient";
import React, { type ComponentRef } from "react";
import { ImageBackground, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useColorScheme } from "nativewind";
import Svg, { Defs, RadialGradient, Rect, Stop } from "react-native-svg";

import {
  BACKGROUND_PRESETS,
  resolveEffect,
  resolveTint,
} from "@/constants/backgrounds";
import { GlassTargetProvider } from "@/components/GlassContainer";
import { useReducedTransparency } from "@/hooks/useReducedTransparency";
import { useSettings } from "@/store/useSettings";

/**
 * 沉浸式底色与连续衰减的径向光场，为玻璃提供柔和的透射色。
 * 支持用户自定义背景图（覆盖在渐变之上，柔光叠加其上）。
 * 色调和光效可由大肥鱼代大爹切换。
 */
export function Backdrop({ children }: { children?: React.ReactNode }) {
  const { colorScheme } = useColorScheme();
  const isDark = colorScheme !== "light";
  const backgroundImage = useSettings((s) => s.backgroundImage);
  const tint = useSettings((s) => s.backgroundTint);
  const effect = useSettings((s) => s.backgroundEffect);
  const glass = useSettings((s) => s.material === "glass");
  const reduceTransparency = useReducedTransparency();
  const blurEnabled = glass && !reduceTransparency;
  const glowId = React.useId().replace(/:/g, "");
  const insets = useSafeAreaInsets();
  // 玻璃材质下，这层背景会被本页所有玻璃卡片当作模糊源
  const glassTarget = React.useRef<ComponentRef<typeof View> | null>(null);

  const preset = BACKGROUND_PRESETS[resolveTint(tint)];
  const mode = resolveEffect(effect);
  const glowAlpha = isDark
    ? glass ? [0.28, 0.22, 0.12] : [0.18, 0.15, 0.08]
    : [0.24, 0.20, 0.12];

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

      {/* 单个静态 SVG 光场，没有硬边圆，也不逐帧重算模糊。 */}
      {!backgroundImage && mode === "aurora" ? (
        <Svg
          pointerEvents="none"
          style={StyleSheet.absoluteFill}
          width="100%"
          height="100%"
          viewBox="0 0 400 900"
          preserveAspectRatio="none"
        >
          <Defs>
            {preset.glowRgb.map((rgb, i) => (
              <RadialGradient
                key={i}
                id={`${glowId}-ambient-${i}`}
                gradientUnits="userSpaceOnUse"
                cx={[360, 0, 240][i]}
                cy={[100, 760, 460][i]}
                rx={[330, 360, 280][i]}
                ry={[390, 440, 360][i]}
              >
                <Stop offset="0" stopColor={`rgb(${rgb})`} stopOpacity={glowAlpha[i]} />
                <Stop offset="0.42" stopColor={`rgb(${rgb})`} stopOpacity={glowAlpha[i] * 0.42} />
                <Stop offset="1" stopColor={`rgb(${rgb})`} stopOpacity={0} />
              </RadialGradient>
            ))}
          </Defs>
          {preset.glowRgb.map((_, i) => (
            <Rect key={i} width="400" height="900" fill={`url(#${glowId}-ambient-${i})`} />
          ))}
        </Svg>
      ) : null}
    </>
  );

  // 页面级模糊源：本页面的玻璃组件模糊本页面的背景。
  // 不在导航器外层共享模糊源——BlurTargetView 会代理子视图树，
  // 在 Android 上会破坏 react-native-screens 转场导致崩溃。
  // 玻璃材质下只把「背景层」包进 BlurTargetView（它是纯静态图层），
  // 内容层仍是它的兄弟节点，不参与代理，避免转场出问题。
  return (
    <GlassTargetProvider target={blurEnabled ? glassTarget : undefined}>
      <View className="flex-1" style={{ overflow: "hidden" }}>
        {blurEnabled ? (
          <BlurTargetView
            ref={glassTarget}
            pointerEvents="none"
            style={StyleSheet.absoluteFill}
          >
            {body}
          </BlurTargetView>
        ) : (
          <View pointerEvents="none" style={StyleSheet.absoluteFill}>
            {body}
          </View>
        )}

        {/* 内容层：避开状态栏（顶部安全区），渐变仍铺满全屏 */}
        <View style={{ flex: 1, paddingTop: insets.top }}>{children}</View>
      </View>
    </GlassTargetProvider>
  );
}
