import { BlurTargetView } from "expo-blur";
import { LinearGradient } from "expo-linear-gradient";
import React, { type ComponentRef, useEffect, useRef } from "react";
import { findNodeHandle, ImageBackground, StyleSheet, View } from "react-native";
import Animated, {
  cancelAnimation,
  Easing,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useColorScheme } from "nativewind";
import Svg, { Defs, RadialGradient, Rect, Stop } from "react-native-svg";

import {
  BACKGROUND_PRESETS,
  resolveEffect,
  resolveTint,
} from "@/constants/backgrounds";
import { GlassTargetProvider } from "@/components/GlassContainer";
import { NativeLiquidGlassTargetView } from "@/components/LiquidGlassNative";
import { useReducedTransparency } from "@/hooks/useReducedTransparency";
import { useSettings } from "@/store/useSettings";
import { renderQuality } from "@/utils/renderQuality";

const GLASS_LIGHT_ORBS = [
  { cx: 345, cy: 110, rx: 280, ry: 310, alpha: 0.42 },
  { cx: 35, cy: 410, rx: 270, ry: 320, alpha: 0.34 },
  { cx: 350, cy: 690, rx: 290, ry: 330, alpha: 0.38 },
  { cx: 110, cy: 840, rx: 250, ry: 250, alpha: 0.30 },
] as const;

const GLASS_DARK_ORBS = [
  { cx: 340, cy: 120, rx: 290, ry: 330, alpha: 0.48 },
  { cx: 30, cy: 430, rx: 280, ry: 340, alpha: 0.42 },
  { cx: 350, cy: 710, rx: 300, ry: 340, alpha: 0.44 },
  { cx: 95, cy: 830, rx: 260, ry: 270, alpha: 0.34 },
] as const;

/**
 * 沉浸式底色与连续衰减的径向光场，为液态玻璃提供丰富且柔和的透射色。
 * 支持用户自定义背景图（覆盖在渐变之上，柔光叠加其上）。
 * 色调和光效可由大肥鱼代大爹切换。
 */
export function Backdrop({ children }: { children?: React.ReactNode }) {
  const { colorScheme } = useColorScheme();
  const isDark = colorScheme !== "light";
  const backgroundImage = useSettings((s) => s.backgroundImage);
  const backgroundDim = useSettings((s) => s.backgroundDim);
  const tint = useSettings((s) => s.backgroundTint);
  const effect = useSettings((s) => s.backgroundEffect);
  const glass = useSettings((s) => s.material === "glass");
  const quality = useSettings((s) => s.renderQuality);
  const reduceTransparency = useReducedTransparency();
  const blurEnabled = glass && !reduceTransparency && renderQuality(quality).blur;
  const glowId = React.useId().replace(/:/g, "");
  const insets = useSafeAreaInsets();
  // 玻璃材质下，这层背景会被本页所有玻璃卡片当作模糊与折射源
  const glassTarget = React.useRef<ComponentRef<typeof View> | null>(null);
  const [glassTargetId, setGlassTargetId] = React.useState<number | undefined>(
    undefined,
  );
  const bindGlassTarget = React.useCallback(
    (node: ComponentRef<typeof View> | null) => {
      glassTarget.current = node;
      const nextId = node ? (findNodeHandle(node) ?? undefined) : undefined;
      setGlassTargetId((prev) => (prev === nextId ? prev : nextId));
    },
    [],
  );

  const preset = BACKGROUND_PRESETS[resolveTint(tint)];
  const mode = resolveEffect(effect);
  const richGlassBackdrop = glass && !reduceTransparency;
  const gradientColors = richGlassBackdrop
    ? isDark
      ? preset.glassDark
      : preset.glassLight
    : isDark
      ? preset.dark
      : preset.light;
  const reducedMotion = useReducedMotion();
  const canAnimateTransition = !reducedMotion && renderQuality(quality).idleAnimation;
  const themeSignature = `${resolveTint(tint)}:${isDark ? 1 : 0}:${richGlassBackdrop ? 1 : 0}`;
  const primaryColor = gradientColors[0];
  const prevThemeRef = useRef<{ sig: string; color: string } | null>(null);
  const veilOpacity = useSharedValue(0);
  const veilColor = useSharedValue("transparent");

  useEffect(() => {
    if (!prevThemeRef.current) {
      prevThemeRef.current = { sig: themeSignature, color: primaryColor };
      return;
    }
    if (prevThemeRef.current.sig !== themeSignature) {
      const fromColor = prevThemeRef.current.color;
      prevThemeRef.current = { sig: themeSignature, color: primaryColor };
      if (canAnimateTransition) {
        veilColor.value = fromColor;
        veilOpacity.value = 0.62;
        veilOpacity.value = withTiming(0, {
          duration: 460,
          easing: Easing.out(Easing.cubic),
        });
      }
    }
  }, [themeSignature, primaryColor, canAnimateTransition, veilColor, veilOpacity]);

  useEffect(
    () => () => {
      cancelAnimation(veilOpacity);
    },
    [veilOpacity],
  );

  const transitionVeilStyle = useAnimatedStyle(() => ({
    opacity: veilOpacity.value,
    backgroundColor: veilColor.value,
  }));
  const flatGlowAlpha = isDark ? [0.18, 0.15, 0.08] : [0.24, 0.20, 0.12];
  // 玻璃材质下壁纸暗罩更克制，避免平涂灰雾抹平透色光泽
  const effectiveDim = Math.max(
    0,
    Math.min(0.65, richGlassBackdrop ? backgroundDim * 0.72 : backgroundDim),
  );

  const TargetContainer = NativeLiquidGlassTargetView ?? BlurTargetView;

  const body = (
    <>
      <LinearGradient
        style={StyleSheet.absoluteFill}
        colors={gradientColors}
        start={{ x: 0.12, y: 0 }}
        end={{ x: 0.88, y: 1 }}
      />
      {/* 主题/色调切换时的柔和色温过渡薄纱（纯 UI 线程淡出，避免画面生硬跳变） */}
      <Animated.View
        pointerEvents="none"
        style={[StyleSheet.absoluteFill, transitionVeilStyle]}
      />

      {/* 自定义背景图层 */}
      {backgroundImage ? (
        <>
          <ImageBackground
            source={{ uri: backgroundImage }}
            style={StyleSheet.absoluteFill}
            resizeMode="cover"
          />
          {/* 可调可读性遮罩 + 轻色调薄雾，避免花哨壁纸导致课表文字看不清 */}
          <View
            pointerEvents="none"
            style={[
              StyleSheet.absoluteFill,
              {
                backgroundColor: isDark
                  ? `rgba(6,10,20,${effectiveDim})`
                  : `rgba(248,250,252,${effectiveDim})`,
              },
            ]}
          />
          <View
            pointerEvents="none"
            style={[
              StyleSheet.absoluteFill,
              {
                backgroundColor: `rgba(${preset.glowRgb[0]},${
                  richGlassBackdrop ? (isDark ? 0.05 : 0.05) : isDark ? 0.08 : 0.09
                })`,
              },
            ]}
          />
        </>
      ) : null}

      {/* 单个静态 SVG 光场，没有硬边圆，也不逐帧重算模糊。 */}
      {!backgroundImage && mode === "aurora" ? (
        richGlassBackdrop ? (
          <Svg
            pointerEvents="none"
            style={StyleSheet.absoluteFill}
            width="100%"
            height="100%"
            viewBox="0 0 400 900"
            preserveAspectRatio="none"
          >
            <Defs>
              {(isDark ? preset.glassDarkGlowRgb : preset.glassLightGlowRgb).map(
                (rgb, i) => {
                  const orb = isDark ? GLASS_DARK_ORBS[i] : GLASS_LIGHT_ORBS[i];
                  return (
                    <RadialGradient
                      key={i}
                      id={`${glowId}-glass-${i}`}
                      gradientUnits="userSpaceOnUse"
                      cx={orb.cx}
                      cy={orb.cy}
                      rx={orb.rx}
                      ry={orb.ry}
                    >
                      <Stop offset="0" stopColor={`rgb(${rgb})`} stopOpacity={orb.alpha} />
                      <Stop
                        offset="0.46"
                        stopColor={`rgb(${rgb})`}
                        stopOpacity={orb.alpha * 0.44}
                      />
                      <Stop offset="1" stopColor={`rgb(${rgb})`} stopOpacity={0} />
                    </RadialGradient>
                  );
                },
              )}
            </Defs>
            {(isDark ? preset.glassDarkGlowRgb : preset.glassLightGlowRgb).map(
              (_, i) => (
                <Rect
                  key={i}
                  width="400"
                  height="900"
                  fill={`url(#${glowId}-glass-${i})`}
                />
              ),
            )}
          </Svg>
        ) : (
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
                  <Stop offset="0" stopColor={`rgb(${rgb})`} stopOpacity={flatGlowAlpha[i]} />
                  <Stop
                    offset="0.42"
                    stopColor={`rgb(${rgb})`}
                    stopOpacity={flatGlowAlpha[i] * 0.42}
                  />
                  <Stop offset="1" stopColor={`rgb(${rgb})`} stopOpacity={0} />
                </RadialGradient>
              ))}
            </Defs>
            {preset.glowRgb.map((_, i) => (
              <Rect
                key={i}
                width="400"
                height="900"
                fill={`url(#${glowId}-ambient-${i})`}
              />
            ))}
          </Svg>
        )
      ) : null}
    </>
  );

  // 页面级模糊源：本页面的玻璃组件模糊并折射本页面的背景。
  // 不在导航器外层共享模糊源——BlurTarget 会代理子视图树，
  // 仅包裹纯静态背景层，内容层作为其兄弟节点，彻底避免嵌套采样与转场异常。
  return (
    <GlassTargetProvider
      target={blurEnabled ? glassTarget : undefined}
      targetId={blurEnabled ? glassTargetId : undefined}
    >
      <View className="flex-1" style={{ overflow: "hidden" }}>
        {blurEnabled ? (
          <TargetContainer
            ref={bindGlassTarget}
            pointerEvents="none"
            style={StyleSheet.absoluteFill}
          >
            {body}
          </TargetContainer>
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
