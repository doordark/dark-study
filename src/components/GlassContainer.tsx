import React, {
  type ComponentRef,
  type PropsWithChildren,
  type RefObject,
  createContext,
  useContext,
} from "react";
import {
  StyleSheet,
  View as RNView,
  type ViewProps,
} from "react-native";
import { BlurView } from "expo-blur";
import { LinearGradient } from "expo-linear-gradient";
import { useColorScheme } from "nativewind";

import { useSettings } from "@/store/useSettings";

/* -------------------------------------------------------------------------- */
/*  GlassTargetProvider —— 提供「本页要模糊的那层背景」                           */
/*                                                                              */
/*  Android 上 BlurView 必须通过 blurTarget 指向一个 BlurTargetView；这里把它      */
/*  按页面共享下去，页面里所有玻璃卡片都模糊同一层背景（比每张卡各自建一份省得多）   */
/* -------------------------------------------------------------------------- */

const GlassTargetContext = createContext<GlassTargetRef | null>(null);

/** 页面背景的 ref：BlurView 在 Android 上要靠它找到要模糊的那层 */
export type GlassTargetRef = RefObject<ComponentRef<typeof RNView> | null>;

export function GlassTargetProvider({
  target,
  children,
}: PropsWithChildren<{ target?: GlassTargetRef }>) {
  return (
    <GlassTargetContext.Provider value={target ?? null}>
      {children}
    </GlassTargetContext.Provider>
  );
}

export function useGlassTarget(): GlassTargetRef | undefined {
  return useContext(GlassTargetContext) ?? undefined;
}

/* -------------------------------------------------------------------------- */
/*  GlassContainer                                                             */
/*                                                                              */
/*  材质跟随「设置 → 材质」：                                                    */
/*   · 扁平：实心表面 + 发丝边框 + 轻投影                                        */
/*   · 玻璃：毛玻璃模糊 + 半透明色层 + 斜向反光 + 亮边                            */
/*  Android 12 以下没有硬件模糊，自动退回「半透明色层 + 反光」的磨砂观感            */
/* -------------------------------------------------------------------------- */

export interface GlassContainerProps extends ViewProps {
  /** 模糊强度（仅玻璃材质生效），默认按明暗给出 */
  intensity?: number;
  /** 连续曲率大圆角半径，默认 28 */
  radius?: number;
  /** 模糊色调（仅玻璃材质生效） */
  tint?: "light" | "dark" | "default";
  /** 覆盖默认表面底色 */
  overlayClassName?: string;
  /** 边框透明度 0-1，默认 0.16 */
  borderOpacity?: number;
  /** 顶部斜向反光，默认开启（仅玻璃材质生效） */
  highlight?: boolean;
  /** @deprecated 已合并进玻璃材质，忽略 */
  sheen?: boolean;
  /** @deprecated 扁平材质下忽略 */
  glow?: boolean;
  /** @deprecated 扁平材质下忽略 */
  glowColor?: string;
  children?: React.ReactNode;
}

export function GlassContainer({
  intensity,
  radius = 28,
  tint,
  overlayClassName,
  borderOpacity = 0.16,
  highlight = true,
  sheen: _sheen,
  glow: _glow,
  glowColor: _glowColor,
  className,
  style,
  children,
  ...rest
}: GlassContainerProps) {
  const { colorScheme } = useColorScheme();
  const isDark = colorScheme !== "light";
  const glass = useSettings((s) => s.material === "glass");
  const glassTarget = useGlassTarget();

  const surface = overlayClassName
    ? undefined
    : isDark
      ? glass
        ? "rgba(17,25,40,0.34)"
        : "rgba(17,25,40,0.78)"
      : glass
        ? "rgba(255,255,255,0.46)"
        : "rgba(255,255,255,0.92)";
  const border = glass
    ? isDark
      ? "rgba(255,255,255,0.22)"
      : "rgba(255,255,255,0.75)"
    : isDark
      ? `rgba(255,255,255,${borderOpacity * 0.5})`
      : `rgba(148,163,184,${borderOpacity})`;

  return (
    <RNView
      {...rest}
      className={className}
      style={[
        {
          borderRadius: radius,
          overflow: "hidden",
          backgroundColor: surface,
          borderWidth: 1,
          borderColor: border,
          // iOS 阴影（极轻）。Android 不用 elevation —— elevation 阴影在
          // 转场/缩放动画期间会被光栅化成实心灰块（闪烁方框），且会打乱
          // 兄弟视图的 z 层级，扁平风格下用边框+底色即可
          shadowColor: "#0F172A",
          shadowOffset: { width: 0, height: 4 },
          shadowOpacity: isDark ? 0 : 0.08,
          shadowRadius: 12,
        },
        style,
      ]}
    >
      {glass ? (
        <>
          <BlurView
            pointerEvents="none"
            style={StyleSheet.absoluteFill}
            // Android 11 及以下没有 RenderNode 硬件模糊，只在新系统上开，
            // 老机器退回半透明磨砂，避免 RenderScript 的高开销
            blurMethod="dimezisBlurViewSdk31Plus"
            blurReductionFactor={4}
            blurTarget={glassTarget}
            intensity={intensity ?? (isDark ? 32 : 46)}
            tint={tint ?? (isDark ? "dark" : "light")}
          />
          {highlight ? (
            <LinearGradient
              pointerEvents="none"
              colors={
                isDark
                  ? ["rgba(255,255,255,0.14)", "rgba(255,255,255,0.02)", "rgba(255,255,255,0)"] as const
                  : ["rgba(255,255,255,0.55)", "rgba(255,255,255,0.12)", "rgba(255,255,255,0)"] as const
              }
              locations={[0, 0.45, 1] as const}
              start={{ x: 0, y: 0 }}
              end={{ x: 0.85, y: 0.9 }}
              style={StyleSheet.absoluteFill}
            />
          ) : null}
        </>
      ) : null}
      {overlayClassName ? (
        <RNView className={`absolute inset-0 ${overlayClassName}`} />
      ) : null}
      {children}
    </RNView>
  );
}
