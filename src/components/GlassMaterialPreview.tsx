import { BlurTargetView } from "expo-blur";
import { useCallback, useId, useRef, useState, type ComponentRef } from "react";
import { findNodeHandle, Platform, StyleSheet, View } from "react-native";
import { useColorScheme } from "nativewind";
import Svg, { Defs, LinearGradient, Path, Rect, Stop } from "react-native-svg";

import { BACKGROUND_PRESETS, resolveTint } from "@/constants/backgrounds";
import { GlassContainer, GlassTargetProvider } from "@/components/GlassContainer";
import { NativeLiquidGlassTargetView } from "@/components/LiquidGlassNative";
import { useReducedTransparency } from "@/hooks/useReducedTransparency";
import { useSettings } from "@/store/useSettings";

export function GlassMaterialPreview({ material }: { material: "flat" | "glass" }) {
  const id = useId().replace(/[^\w-]/g, "");
  const target = useRef<ComponentRef<typeof View> | null>(null);
  const [targetId, setTargetId] = useState<number | undefined>(undefined);
  const bindTarget = useCallback((node: ComponentRef<typeof View> | null) => {
    target.current = node;
    const nextId = node ? (findNodeHandle(node) ?? undefined) : undefined;
    setTargetId((prev) => (prev === nextId ? prev : nextId));
  }, []);
  const { colorScheme } = useColorScheme();
  const isDark = colorScheme !== "light";
  const backgroundTint = useSettings((s) => s.backgroundTint);
  const preset = BACKGROUND_PRESETS[resolveTint(backgroundTint)];
  const reduceTransparency = useReducedTransparency();
  const capture =
    material === "glass" &&
    !reduceTransparency &&
    Platform.OS === "android" &&
    Number(Platform.Version) >= 31;
  const Background = capture
    ? (NativeLiquidGlassTargetView ?? BlurTargetView)
    : View;

  const baseColors = isDark ? preset.glassDark : preset.glassLight;
  const glows = isDark ? preset.glassDarkGlowRgb : preset.glassLightGlowRgb;

  return (
    <GlassTargetProvider
      target={capture ? target : undefined}
      targetId={capture ? targetId : undefined}
    >
      <View
        pointerEvents="none"
        style={[styles.tile, { backgroundColor: baseColors[0] }]}
      >
        <Background
          ref={capture ? bindTarget : undefined}
          style={StyleSheet.absoluteFill}
        >
          <Svg
            width="100%"
            height="100%"
            viewBox="0 0 200 130"
            preserveAspectRatio="none"
          >
            <Defs>
              <LinearGradient id={`${id}-bg`} x1="0%" y1="0%" x2="100%" y2="100%">
                <Stop offset="0" stopColor={baseColors[0]} />
                <Stop offset="0.52" stopColor={baseColors[1]} />
                <Stop offset="1" stopColor={baseColors[2]} />
              </LinearGradient>
              <LinearGradient id={`${id}-wave`} x1="4%" y1="88%" x2="96%" y2="8%">
                <Stop offset="0" stopColor={`rgb(${glows[0]})`} stopOpacity={0.92} />
                <Stop offset="0.5" stopColor={`rgb(${glows[1]})`} stopOpacity={0.86} />
                <Stop offset="1" stopColor={`rgb(${glows[2]})`} stopOpacity={0.9} />
              </LinearGradient>
              <LinearGradient id={`${id}-arc`} x1="0%" y1="20%" x2="100%" y2="85%">
                <Stop offset="0" stopColor={`rgb(${glows[3]})`} stopOpacity={0.92} />
                <Stop offset="0.55" stopColor={`rgb(${glows[0]})`} stopOpacity={0.78} />
                <Stop offset="1" stopColor={`rgb(${glows[2]})`} stopOpacity={0.85} />
              </LinearGradient>
            </Defs>
            <Rect width="200" height="130" fill={`url(#${id}-bg)`} />
            <Path
              d="M-12 18 C 46 14 78 88 214 102 L 214 140 H -12 Z"
              fill={`url(#${id}-wave)`}
            />
            <Path
              d="M158 -12 C 138 28 124 72 206 106 L 218 -12 Z"
              fill={`url(#${id}-arc)`}
            />
            <Path
              d="M-10 92 C 38 66 76 96 108 136 H -10 Z"
              fill={`rgb(${glows[3]})`}
              fillOpacity={0.72}
            />
          </Svg>
        </Background>
        <GlassContainer
          material={material}
          variant="floating"
          tint={isDark ? "dark" : "light"}
          radius={20}
          borderOpacity={0.26}
          style={styles.sample}
        >
          <View style={styles.sampleRow}>
            <View
              style={[
                styles.activePill,
                {
                  backgroundColor:
                    material === "glass"
                      ? isDark
                        ? "rgba(255,255,255,0.9)"
                        : "rgba(255,255,255,0.92)"
                      : isDark
                        ? "rgba(56,189,248,0.28)"
                        : "rgba(14,165,233,0.18)",
                },
              ]}
            />
            <View style={styles.barGroup}>
              <View
                style={[
                  styles.barPrimary,
                  {
                    backgroundColor: isDark
                      ? "rgba(255,255,255,0.82)"
                      : "rgba(15,23,42,0.72)",
                  },
                ]}
              />
              <View
                style={[
                  styles.barSub,
                  {
                    backgroundColor: isDark
                      ? "rgba(255,255,255,0.42)"
                      : "rgba(51,65,85,0.42)",
                  },
                ]}
              />
            </View>
          </View>
        </GlassContainer>
      </View>
    </GlassTargetProvider>
  );
}

const styles = StyleSheet.create({
  tile: {
    aspectRatio: 1.54,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 15,
    overflow: "hidden",
  },
  sample: {
    width: "80%",
    height: 40,
    justifyContent: "center",
  },
  sampleRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 10,
    gap: 8,
  },
  activePill: {
    width: 22,
    height: 22,
    borderRadius: 11,
  },
  barGroup: {
    flex: 1,
    gap: 4,
  },
  barPrimary: {
    width: "68%",
    height: 6,
    borderRadius: 3,
  },
  barSub: {
    width: "42%",
    height: 4,
    borderRadius: 2,
  },
});
