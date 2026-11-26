import React, {
  type ComponentRef,
  type PropsWithChildren,
  type RefObject,
  createContext,
  useContext,
  useId,
  useMemo,
  useState,
} from "react";
import {
  Platform,
  StyleSheet,
  View as RNView,
  type ViewProps,
} from "react-native";
import { BlurView } from "expo-blur";
import { LinearGradient } from "expo-linear-gradient";
import { useColorScheme } from "nativewind";
import Svg, { Defs, LinearGradient as SvgGradient, Rect, Stop } from "react-native-svg";

import type { BackgroundTint } from "@/constants/backgrounds";
import {
  GLASS_DEPTH,
  resolveGlassOpticalProfile,
  type GlassVariant,
} from "@/constants/glassThemes";
import {
  hasAgslLiquidGlass,
  NativeLiquidGlassView,
} from "@/components/LiquidGlassNative";
import { useReducedTransparency } from "@/hooks/useReducedTransparency";
import { useSettings } from "@/store/useSettings";
import { renderQuality } from "@/utils/renderQuality";

export type GlassTargetRef = RefObject<ComponentRef<typeof RNView> | null>;
interface GlassTargetValue {
  target: GlassTargetRef | null;
  targetId?: number;
}
const GlassTargetContext = createContext<GlassTargetValue>({ target: null });

/** Only static page backgrounds belong in the Android blur target. */
export function GlassTargetProvider({
  target,
  targetId,
  children,
}: PropsWithChildren<{ target?: GlassTargetRef; targetId?: number }>) {
  const value = useMemo<GlassTargetValue>(
    () => ({ target: target ?? null, targetId }),
    [target, targetId],
  );
  return (
    <GlassTargetContext.Provider value={value}>
      {children}
    </GlassTargetContext.Provider>
  );
}

export function useGlassTarget(): GlassTargetRef | undefined {
  return useContext(GlassTargetContext).target ?? undefined;
}

export function useGlassTargetId(): number | undefined {
  return useContext(GlassTargetContext).targetId;
}

const isAndroid = Platform.OS === "android";
const androidVersion = isAndroid ? Number(Platform.Version) : 0;

export interface GlassContainerProps extends ViewProps {
  intensity?: number;
  radius?: number;
  tint?: "light" | "dark" | "default";
  overlayClassName?: string;
  /** Edge opacity, including 0 for a borderless surface. */
  borderOpacity?: number;
  highlight?: boolean;
  /** Cards, floating controls and sheets have different optical depth. */
  variant?: GlassVariant;
  /** Explicit override for the material picker previews. */
  material?: "flat" | "glass";
  /** Explicit theme tint override (defaults to active backgroundTint). */
  themeTint?: BackgroundTint;
  /** Explicit refraction strength override for Android 13+ AGSL liquid glass. */
  refraction?: number;
  /** @deprecated Use highlight. */
  sheen?: boolean;
  /** @deprecated Floating surfaces include a subtle rim automatically. */
  glow?: boolean;
  /** @deprecated The glass wash follows the selected background tint. */
  glowColor?: string;
  children?: React.ReactNode;
}

/**
 * Liquid glass container with theme-adaptive transmission, specular reflection,
 * and Android 13+ native AGSL bevel refraction (gracefully falling back on API 31-32 / iOS / Web).
 */
export function GlassContainer({
  intensity,
  radius = 28,
  tint,
  overlayClassName,
  borderOpacity = 0.16,
  highlight = true,
  variant = "surface",
  material,
  themeTint,
  refraction,
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
  const activeBgTint = useSettings((s) => s.backgroundTint);
  const hasWallpaper = useSettings((s) => !!s.backgroundImage);
  const quality = useSettings((s) => s.renderQuality);
  const reduceTransparency = useReducedTransparency();
  const glass =
    (material ?? selectedMaterial) === "glass" &&
    !reduceTransparency &&
    renderQuality(quality).blur;
  const glassTarget = useGlassTarget();
  const glassTargetId = useGlassTargetId();
  const depth = GLASS_DEPTH[variant];
  const effectiveTint = themeTint ?? activeBgTint;
  const profile = useMemo(
    () => resolveGlassOpticalProfile(effectiveTint, darkGlass, hasWallpaper),
    [effectiveTint, darkGlass, hasWallpaper],
  );
  const rimId = useId().replace(/[^\w-]/g, "");
  const [rimSize, setRimSize] = useState<{ w: number; h: number } | null>(null);

  // Dialogs/Modals on Android live in a separate native window without a valid blur target.
  const canBlur = glass && (!isAndroid || (androidVersion >= 31 && !!glassTarget));
  const useNativeLiquid = canBlur && !!NativeLiquidGlassView;
  const useAgsl = useNativeLiquid && hasAgslLiquidGlass;
  const blurTargetId = useNativeLiquid ? glassTargetId : undefined;

  const edge = Math.max(0, Math.min(1, borderOpacity));
  const flat = reduceTransparency
    ? isDark
      ? "#111928"
      : "#FFFFFF"
    : isDark
      ? "rgba(17,25,40,0.78)"
      : "rgba(255,255,255,0.92)";

  const blurRadius =
    intensity == null
      ? depth.blurRadius
      : Math.max(5, Math.min(25, intensity * 0.42));
  const fallbackBlurIntensity = Math.max(
    1,
    Math.min(100, intensity == null ? depth.fallbackBlur : intensity * 0.78),
  );
  const rimStrength =
    edge > 0
      ? Math.min(
          1.25,
          edge * (darkGlass ? 4.0 : 4.4) * depth.rimScale * (highlight ? 1 : 0.45),
        )
      : 0;
  const reflectionStrength =
    profile.reflectionStrength *
    depth.reflectionScale *
    (highlight ? 1 : 0.35);

  const flatBorder = isDark
    ? `rgba(255,255,255,${edge * 0.5})`
    : `rgba(148,163,184,${edge})`;
  const containerBorderColor = glass
    ? useAgsl
      ? "transparent"
      : edge > 0
        ? profile.outerHairline
        : "transparent"
    : flatBorder;

  const showShadow = glass && (!isAndroid || androidVersion >= 28);
  const tintAlpha = profile.tintAlpha[variant];
  const tintRgba = useMemo<[number, number, number, number]>(
    () => [profile.tintRgb[0], profile.tintRgb[1], profile.tintRgb[2], tintAlpha],
    [profile.tintRgb, tintAlpha],
  );

  const backdropLayer = !glass ? null : useNativeLiquid && NativeLiquidGlassView ? (
    <NativeLiquidGlassView
      pointerEvents="none"
      style={StyleSheet.absoluteFill}
      blurTargetId={blurTargetId}
      blurRadius={blurRadius}
      cornerRadius={radius}
      isDark={darkGlass}
      tintRgba={tintRgba}
      accentRgb={profile.accentRgb}
      reflectionRgb={profile.reflectionRgb}
      refractionStrength={refraction ?? depth.refraction}
      dispersion={profile.dispersion}
      saturation={profile.saturation}
      rimStrength={rimStrength}
      reflectionStrength={reflectionStrength}
      luminanceLift={profile.luminanceLift}
    />
  ) : canBlur ? (
    <BlurView
      style={StyleSheet.absoluteFill}
      blurMethod="dimezisBlurViewSdk31Plus"
      blurReductionFactor={3}
      blurTarget={glassTarget}
      intensity={fallbackBlurIntensity}
      tint={
        isAndroid && !darkGlass
          ? "default"
          : (tint ?? (darkGlass ? "systemUltraThinMaterialDark" : "systemUltraThinMaterialLight"))
      }
    />
  ) : null;

  // When AGSL is active, specular reflection and crisp diagonal rim are rendered in GPU shader.
  // For API 31-32 fallback, iOS, Web, or Android Modals (no blur target), render crisp JS/SVG sheen + rim.
  const showJsSpecular = glass && !useAgsl;
  const fallbackRimOpacity = Math.min(0.95, edge * (darkGlass ? 3.8 : 4.8));
  const innerRadius = Math.max(0, radius - 1);

  return (
    <RNView
      {...rest}
      className={className}
      style={[
        {
          borderRadius: radius,
          borderCurve: "continuous",
          overflow: "hidden",
          borderWidth: glass && useAgsl ? 0 : 1,
          borderColor: containerBorderColor,
          boxShadow: showShadow
            ? [
                {
                  offsetX: 0,
                  offsetY: depth.shadowOffsetY,
                  blurRadius: depth.shadowBlur,
                  color: profile.shadowColor,
                },
              ]
            : undefined,
          // No Android elevation: it causes opaque rectangles during transforms.
          backgroundColor: glass
            ? "transparent"
            : overlayClassName && !reduceTransparency
              ? undefined
              : flat,
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
          style={[
            StyleSheet.absoluteFill,
            !canBlur && { backgroundColor: profile.fallbackFill },
          ]}
        >
          {backdropLayer}
          {showJsSpecular ? (
            <LinearGradient
              colors={profile.sheenColors}
              locations={[0, 0.36, 1]}
              start={{ x: 0, y: 0 }}
              end={{ x: 0.9, y: 1 }}
              style={StyleSheet.absoluteFill}
            />
          ) : null}
        </RNView>
      ) : null}
      {overlayClassName && !reduceTransparency ? (
        <RNView
          pointerEvents="none"
          className={`absolute inset-0 ${overlayClassName}`}
        />
      ) : null}
      {children}
      {showJsSpecular && edge > 0 ? (
        // Measure in px: react-native-svg resolves "%"/rx against the wrong box on Android,
        // which drew a second, offset rounded rim inside headers and the composer.
        <RNView
          pointerEvents="none"
          style={StyleSheet.absoluteFill}
          onLayout={(event) => {
            const { width, height } = event.nativeEvent.layout;
            setRimSize((prev) =>
              prev && Math.abs(prev.w - width) < 0.5 && Math.abs(prev.h - height) < 0.5
                ? prev
                : { w: width, h: height },
            );
          }}
        >
          {rimSize && rimSize.w > 3 && rimSize.h > 3 ? (
        <Svg
          pointerEvents="none"
          width={rimSize.w}
          height={rimSize.h}
        >
          <Defs>
            <SvgGradient id={rimId} x1="0%" y1="0%" x2="88%" y2="100%">
              <Stop
                offset="0"
                stopColor={profile.rimStops[0]}
                stopOpacity={fallbackRimOpacity * (highlight ? 1 : 0.45)}
              />
              <Stop
                offset="0.34"
                stopColor={profile.rimStops[1]}
                stopOpacity={fallbackRimOpacity * 0.28}
              />
              <Stop
                offset="0.68"
                stopColor={profile.rimStops[2]}
                stopOpacity={fallbackRimOpacity * 0.18}
              />
              <Stop
                offset="1"
                stopColor={profile.rimStops[3]}
                stopOpacity={fallbackRimOpacity * (highlight ? 0.76 : 0.36)}
              />
            </SvgGradient>
          </Defs>
          <Rect
            x={0.75}
            y={0.75}
            width={rimSize.w - 1.5}
            height={rimSize.h - 1.5}
            rx={Math.min(innerRadius, (rimSize.h - 1.5) / 2, (rimSize.w - 1.5) / 2)}
            fill="none"
            stroke={`url(#${rimId})`}
            strokeWidth={1.5}
          />
        </Svg>
          ) : null}
        </RNView>
      ) : null}
    </RNView>
  );
}
