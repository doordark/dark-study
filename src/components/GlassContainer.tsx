import React, {
  type ComponentRef,
  type PropsWithChildren,
  type RefObject,
  createContext,
  useContext,
  useId,
} from "react";
import { Platform, StyleSheet, View as RNView, type ViewProps } from "react-native";
import { requireNativeView, requireOptionalNativeModule } from "expo";
import { BlurView } from "expo-blur";
import { LinearGradient } from "expo-linear-gradient";
import { useColorScheme } from "nativewind";
import Svg, { Defs, LinearGradient as SvgGradient, Rect, Stop } from "react-native-svg";

import { useReducedTransparency } from "@/hooks/useReducedTransparency";
import { useSettings } from "@/store/useSettings";

export type GlassTargetRef = RefObject<ComponentRef<typeof RNView> | null>;
const GlassTargetContext = createContext<GlassTargetRef | null>(null);

/** Only static page backgrounds belong in the Android blur target. */
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

const DEPTH = {
  surface: { blur: 18, dark: [0.15, 0.24], light: [0.20, 0.10] },
  floating: { blur: 25, dark: [0.18, 0.30], light: [0.27, 0.14] },
  sheet: { blur: 42, dark: [0.55, 0.68], light: [0.67, 0.55] },
} as const;

const isAndroid = Platform.OS === "android";
const androidVersion = Number(Platform.Version);
const refractionModule = "DarkStudyGlassRefraction";
const RefractionView = isAndroid && androidVersion >= 33 && requireOptionalNativeModule(refractionModule)
  ? requireNativeView<PropsWithChildren<ViewProps & { radius: number }>>(refractionModule)
  : null;

export interface GlassContainerProps extends ViewProps {
  intensity?: number;
  radius?: number;
  tint?: "light" | "dark" | "default";
  overlayClassName?: string;
  /** Edge opacity, including 0 for a borderless surface. */
  borderOpacity?: number;
  highlight?: boolean;
  /** Cards, floating controls and sheets have different optical depth. */
  variant?: keyof typeof DEPTH;
  /** Explicit override for the material picker previews. */
  material?: "flat" | "glass";
  /** @deprecated Use highlight. */
  sheen?: boolean;
  /** @deprecated Floating surfaces include a subtle rim automatically. */
  glow?: boolean;
  /** @deprecated The glass wash follows the selected background tint. */
  glowColor?: string;
  children?: React.ReactNode;
}

/** A lightly blurred backdrop with a directional glass edge. */
export function GlassContainer({
  intensity,
  radius = 28,
  tint,
  overlayClassName,
  borderOpacity = 0.16,
  highlight = true,
  variant = "surface",
  material,
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
  const darkGlass = tint === "dark" || (tint !== "light" && isDark);
  const selectedMaterial = useSettings((s) => s.material);
  const reduceTransparency = useReducedTransparency();
  const glass = (material ?? selectedMaterial) === "glass" && !reduceTransparency;
  const glassTarget = useGlassTarget();
  const depth = DEPTH[variant];
  const rimId = useId().replace(/[^\w-]/g, "");
  // Dialogs on Android live in a separate native window without a valid target.
  const canBlur = glass && (!isAndroid || (androidVersion >= 31 && !!glassTarget));
  const edge = Math.max(0, Math.min(1, borderOpacity));
  const fallback = darkGlass ? "rgba(19,28,45,0.88)" : "rgba(247,250,255,0.94)";
  const flat = reduceTransparency
    ? isDark ? "#111928" : "#FFFFFF"
    : isDark ? "rgba(17,25,40,0.78)" : "rgba(255,255,255,0.92)";
  const wash = darkGlass ? depth.dark : depth.light;
  const innerRadius = Math.max(0, radius - 1);
  const rim = Math.min(0.9, edge * (darkGlass ? 2.5 : 4));
  const border = glass
    ? "transparent"
    : isDark ? `rgba(255,255,255,${edge * 0.5})` : `rgba(148,163,184,${edge})`;
  const blur = canBlur ? (
    <BlurView
      style={StyleSheet.absoluteFill}
      blurMethod="dimezisBlurViewSdk31Plus"
      blurReductionFactor={5}
      blurTarget={glassTarget}
      intensity={Math.max(1, Math.min(100, intensity == null ? depth.blur : intensity * 0.5))}
      tint={isAndroid && !darkGlass ? "default" : tint ?? (darkGlass ? "dark" : "light")}
    />
  ) : null;

  return (
    <RNView
      {...rest}
      className={className}
      style={[
        {
          borderRadius: radius,
          borderCurve: "continuous",
          overflow: "hidden",
          borderWidth: 1,
          borderColor: border,
          boxShadow: glass && variant !== "surface" &&
            (!isAndroid || androidVersion >= 28)
            ? [{ offsetX: 0, offsetY: variant === "sheet" ? 4 : 6,
                blurRadius: 18, color: darkGlass ? "rgba(0,4,16,0.28)" : "rgba(30,64,100,0.14)" }]
            : undefined,
          // No Android elevation: it causes opaque rectangles during transforms.
          backgroundColor: glass ? "transparent" : overlayClassName && !reduceTransparency ? undefined : flat,
        },
        style,
      ]}
    >
      {glass ? (
        <RNView
          pointerEvents="none"
          accessible={false}
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
          style={[StyleSheet.absoluteFill, !canBlur && { backgroundColor: fallback }]}
        >
          {blur && RefractionView ? (
            <RefractionView style={StyleSheet.absoluteFill} radius={innerRadius}>
              {blur}
            </RefractionView>
          ) : blur}
          <LinearGradient
            colors={darkGlass
              ? [`rgba(45,60,85,${wash[0]})`, `rgba(8,14,29,${wash[1]})`]
              : [`rgba(255,255,255,${wash[0]})`, `rgba(235,245,255,${wash[1]})`]}
            start={{ x: 0, y: 0 }}
            end={{ x: 0.85, y: 1 }}
            style={StyleSheet.absoluteFill}
          />
        </RNView>
      ) : null}
      {overlayClassName && !reduceTransparency ? (
        <RNView pointerEvents="none" className={`absolute inset-0 ${overlayClassName}`} />
      ) : null}
      {children}
      {glass && edge > 0 ? (
        <Svg pointerEvents="none" style={StyleSheet.absoluteFill} width="100%" height="100%">
          <Defs>
            <SvgGradient id={rimId} x1="0%" y1="0%" x2="75%" y2="100%">
              <Stop offset="0" stopColor="#F5FCFF" stopOpacity={rim * (highlight ? 1 : 0.35)} />
              <Stop offset="0.43" stopColor="#CBE5FD" stopOpacity={rim * 0.22} />
              <Stop offset="0.72" stopColor="#557294" stopOpacity={rim * 0.20} />
              <Stop offset="1" stopColor="#E7F6FF" stopOpacity={rim * (highlight ? 0.58 : 0.28)} />
            </SvgGradient>
          </Defs>
          <Rect width="100%" height="100%" rx={innerRadius} fill="none" stroke={`url(#${rimId})`} strokeWidth={1.6} />
        </Svg>
      ) : null}
    </RNView>
  );
}
