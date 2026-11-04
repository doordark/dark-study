import { BlurTargetView } from "expo-blur";
import { useId, useRef, type ComponentRef } from "react";
import { Platform, StyleSheet, View } from "react-native";
import Svg, { Defs, LinearGradient, Path, Rect, Stop } from "react-native-svg";

import { GlassContainer, GlassTargetProvider } from "@/components/GlassContainer";
import { useReducedTransparency } from "@/hooks/useReducedTransparency";

export function GlassMaterialPreview({ material }: { material: "flat" | "glass" }) {
  const id = useId().replace(/[^\w-]/g, "");
  const target = useRef<ComponentRef<typeof View> | null>(null);
  const reduceTransparency = useReducedTransparency();
  const capture = material === "glass" && !reduceTransparency &&
    Platform.OS === "android" && Number(Platform.Version) >= 31;
  const Background = capture ? BlurTargetView : View;

  return (
    <GlassTargetProvider target={capture ? target : undefined}>
      <View pointerEvents="none" style={styles.tile}>
        <Background ref={capture ? target : undefined} style={StyleSheet.absoluteFill}>
          <Svg width="100%" height="100%" viewBox="0 0 200 130" preserveAspectRatio="none">
            <Defs>
              <LinearGradient id={`${id}-sky`} x1="0%" y1="0%" x2="100%" y2="100%">
                <Stop offset="0" stopColor="#E3F0FC" />
                <Stop offset="0.6" stopColor="#95C4E8" />
                <Stop offset="1" stopColor="#274B93" />
              </LinearGradient>
              <LinearGradient id={`${id}-wave`} x1="4%" y1="85%" x2="95%" y2="5%">
                <Stop offset="0" stopColor="#0679BB" />
                <Stop offset="0.39" stopColor="#5EC9EE" />
                <Stop offset="0.56" stopColor="#BAEEFF" />
                <Stop offset="0.72" stopColor="#2476DC" />
                <Stop offset="0.89" stopColor="#0D2D88" />
                <Stop offset="1" stopColor="#071D51" />
              </LinearGradient>
              <LinearGradient id={`${id}-arc`} x1="0%" y1="40%" x2="100%" y2="78%">
                <Stop offset="0" stopColor="#111C62" />
                <Stop offset="0.38" stopColor="#1253D4" />
                <Stop offset="0.69" stopColor="#39BAED" />
                <Stop offset="1" stopColor="#AFDEFD" />
              </LinearGradient>
            </Defs>
            <Rect width="200" height="130" fill={`url(#${id}-sky)`} />
            <Path d="M-15 8 C 52 17 68 97 216 112 L 216 140 H -15 Z" fill={`url(#${id}-wave)`} />
            <Path d="M-15 8 C 52 17 68 97 216 112" fill="none" stroke="#0A2470" strokeWidth="2" />
            <Path d="M176 -10 C 155 21 132 76 204 107 L 218 -10 Z" fill={`url(#${id}-arc)`} />
            <Path d="M176 -10 C 155 21 132 76 204 107" fill="none" stroke="#0A2470" strokeWidth="2.5" />
            <Path d="M-8 102 C 43 69 74 102 95 137 H -8 Z" fill="#178FC9" stroke="#7CDBFD" strokeWidth="1" />
          </Svg>
        </Background>
        <GlassContainer material={material} variant="floating" tint="light" radius={20}
          borderOpacity={0.22} style={styles.sample} />
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
    backgroundColor: "#95C4E8",
  },
  sample: { width: "77%", height: 36 },
});
