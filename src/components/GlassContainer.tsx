import React, {
  type PropsWithChildren,
  type RefObject,
  createContext,
  useContext,
} from "react";
import {
  View as RNView,
  type ViewProps,
  type View as RNViewType,
} from "react-native";
import { useColorScheme } from "nativewind";

/* -------------------------------------------------------------------------- */
/*  GlassTargetProvider —— 兼容保留（不再需要模糊源，透传 children）             */
/* -------------------------------------------------------------------------- */

const GlassTargetContext = createContext<RefObject<RNViewType | null> | null>(
  null,
);

export function GlassTargetProvider({ children }: PropsWithChildren) {
  return (
    <GlassTargetContext.Provider value={null}>
      {children}
    </GlassTargetContext.Provider>
  );
}

export function useGlassTarget(): RefObject<RNViewType | null> | undefined {
  return useContext(GlassTargetContext) ?? undefined;
}

/* -------------------------------------------------------------------------- */
/*  GlassContainer —— 现代化扁平卡片                                            */
/*                                                                              */
/*  实心表面 + 发丝边框 + 轻投影，无模糊/高光/发光等玻璃材质                      */
/*  接口保持向后兼容：intensity/tint/sheen/highlight 等玻璃参数被忽略              */
/* -------------------------------------------------------------------------- */

export interface GlassContainerProps extends ViewProps {
  /** @deprecated 扁平材质下忽略（原模糊强度） */
  intensity?: number;
  /** 连续曲率大圆角半径，默认 28 */
  radius?: number;
  /** @deprecated 扁平材质下忽略 */
  tint?: "light" | "dark" | "default";
  /** 覆盖默认表面底色 */
  overlayClassName?: string;
  /** 边框透明度 0-1，默认 0.16 */
  borderOpacity?: number;
  /** @deprecated 扁平材质下忽略 */
  highlight?: boolean;
  /** @deprecated 扁平材质下忽略 */
  sheen?: boolean;
  /** @deprecated 扁平材质下忽略 */
  glow?: boolean;
  /** @deprecated 扁平材质下忽略 */
  glowColor?: string;
  children?: React.ReactNode;
}

export function GlassContainer({
  intensity: _intensity,
  radius = 28,
  tint: _tint,
  overlayClassName,
  borderOpacity = 0.16,
  highlight: _highlight,
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

  const surface = overlayClassName
    ? undefined
    : isDark
      ? "rgba(17,25,40,0.78)"
      : "rgba(255,255,255,0.92)";
  const border = isDark
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
      {overlayClassName ? (
        <RNView className={`absolute inset-0 ${overlayClassName}`} />
      ) : null}
      {children}
    </RNView>
  );
}
