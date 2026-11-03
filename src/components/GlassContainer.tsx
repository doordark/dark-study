import React, {
  type ComponentRef,
  type PropsWithChildren,
  type RefObject,
  createContext,
  useContext,
} from "react";
import { Platform, StyleSheet, View as RNView, type ViewProps } from "react-native";
import { BlurView } from "expo-blur";
import { LinearGradient } from "expo-linear-gradient";
import { useColorScheme } from "nativewind";

import { BACKGROUND_PRESETS, resolveTint } from "@/constants/backgrounds";
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
  surface: { dark: 36, light: 48, wash: 0.025 },
  floating: { dark: 56, light: 64, wash: 0.045 },
  sheet: { dark: 68, light: 76, wash: 0.018 },
} as const;

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

/** Frosted substrate, tinted transmission, directional light and a fine inner bevel. */
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
  const selectedMaterial = useSettings((s) => s.material);
  const backgroundTint = useSettings((s) => s.backgroundTint);
  const reduceTransparency = useReducedTransparency();
  const glass = (material ?? selectedMaterial) === "glass" && !reduceTransparency;
  const glassTarget = useGlassTarget();
  const depth = DEPTH[variant];
  const accent = BACKGROUND_PRESETS[resolveTint(backgroundTint)].glowRgb[0];
  // Dialogs on Android live in a separate native window without a valid target.
  const canBlur = glass && (Platform.OS !== "android" ||
    (Number(Platform.Version) >= 31 && !!glassTarget));
  const edge = Math.max(0, Math.min(1, borderOpacity));
  const transmitted = isDark
    ? variant === "sheet" ? "rgba(13,20,36,0.62)" : "rgba(13,20,36,0.20)"
    : variant === "sheet" ? "rgba(255,255,255,0.70)" : "rgba(255,255,255,0.25)";
  const fallback = isDark ? "rgba(19,28,45,0.88)" : "rgba(247,250,255,0.94)";
  const flat = reduceTransparency
    ? isDark ? "#111928" : "#FFFFFF"
    : isDark ? "rgba(17,25,40,0.78)" : "rgba(255,255,255,0.92)";
  const surface = glass ? canBlur ? transmitted : fallback : flat;
  const border = glass
    ? `rgba(255,255,255,${Math.min(1, edge * (isDark ? 1.25 : 3.2))})`
    : isDark ? `rgba(255,255,255,${edge * 0.5})` : `rgba(148,163,184,${edge})`;

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
            (Platform.OS !== "android" || Number(Platform.Version) >= 28)
            ? [{ offsetX: 0, offsetY: variant === "sheet" ? 4 : 8,
                blurRadius: 24, color: isDark ? "rgba(0,4,16,0.28)" : "rgba(30,64,100,0.10)" }]
            : undefined,
          // No Android elevation: it causes opaque rectangles during transforms.
          backgroundColor: glass ? "transparent" : overlayClassName && !reduceTransparency ? undefined : surface,
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
          style={StyleSheet.absoluteFill}
        >
          {canBlur ? (
            <BlurView
              style={StyleSheet.absoluteFill}
              blurMethod="dimezisBlurViewSdk31Plus"
              blurReductionFactor={4}
              blurTarget={glassTarget}
              intensity={Math.max(1, Math.min(100, intensity ?? (isDark ? depth.dark : depth.light)))}
              tint={tint ?? (isDark ? "dark" : "light")}
            />
          ) : null}
          <RNView style={[StyleSheet.absoluteFill, { backgroundColor: surface }]} />
          <LinearGradient
            colors={[
              `rgba(${accent},${depth.wash})`,
              "rgba(255,255,255,0)",
              isDark ? "rgba(3,7,18,0.14)" : "rgba(148,163,184,0.06)",
            ]}
            locations={[0, 0.48, 1]}
            start={{ x: 0, y: 0 }}
            end={{ x: 0.9, y: 1 }}
            style={StyleSheet.absoluteFill}
          />
          {highlight ? (
            <LinearGradient
              colors={isDark
                ? ["rgba(255,255,255,0.105)", "rgba(255,255,255,0.015)", "rgba(255,255,255,0)"]
                : ["rgba(255,255,255,0.50)", "rgba(255,255,255,0.10)", "rgba(255,255,255,0)"]}
              locations={[0, 0.32, 0.74]}
              start={{ x: 0.05, y: 0 }}
              end={{ x: 0.8, y: 1 }}
              style={StyleSheet.absoluteFill}
            />
          ) : null}
        </RNView>
      ) : null}
      {overlayClassName && !reduceTransparency ? (
        <RNView pointerEvents="none" className={`absolute inset-0 ${overlayClassName}`} />
      ) : null}
      {children}
      {glass && edge > 0 ? (
        <RNView pointerEvents="none" style={StyleSheet.absoluteFill}>
          <RNView style={[
            styles.bevel,
            {
              borderRadius: Math.max(0, radius - 2),
              borderTopColor: highlight ? `rgba(255,255,255,${Math.min(1, edge * (isDark ? 0.8 : 1.3))})` : "transparent",
              borderBottomColor: isDark ? "rgba(2,6,23,0.24)" : "rgba(71,85,105,0.07)",
            },
          ]} />
          {highlight ? (
            <LinearGradient
              colors={["rgba(255,255,255,0)", `rgba(255,255,255,${Math.min(0.85, edge * 2.6)})`, "rgba(255,255,255,0)"]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={{ position: "absolute", top: 0, left: radius * 0.6, right: radius * 0.6, height: 1 }}
            />
          ) : null}
        </RNView>
      ) : null}
    </RNView>
  );
}

const styles = StyleSheet.create({
  bevel: {
    ...StyleSheet.absoluteFill,
    margin: 1,
    borderWidth: 1,
    borderColor: "transparent",
  },
});
