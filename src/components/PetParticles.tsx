import { useEffect } from "react";
import { Text, View } from "react-native";
import Animated, {
  cancelAnimation,
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withTiming,
} from "react-native-reanimated";

export type PetParticleKind = "heart" | "bubble" | "zzz" | "star" | "note" | "sparkle" | "sweat";

export interface PetParticleItem {
  id: number;
  kind: PetParticleKind;
  x: number;
  y: number;
  dx: number;
  dy: number;
  delay: number;
  duration: number;
  scale: number;
}

const GLYPH: Record<PetParticleKind, { text: string; color: string }> = {
  heart: { text: "♥", color: "#F472B6" },
  bubble: { text: "○", color: "#7DD3FC" },
  zzz: { text: "Z", color: "#A5B4FC" },
  star: { text: "✦", color: "#FBBF24" },
  note: { text: "♪", color: "#38BDF8" },
  sparkle: { text: "✧", color: "#67E8F9" },
  sweat: { text: "💧", color: "#60A5FA" },
};

function ParticleNode({ item }: { item: PetParticleItem }) {
  const p = useSharedValue(0);

  useEffect(() => {
    p.value = withDelay(
      item.delay,
      withTiming(1, { duration: item.duration, easing: Easing.out(Easing.cubic) }),
    );
    return () => cancelAnimation(p);
  }, [p, item.delay, item.duration]);

  const style = useAnimatedStyle(() => {
    const t = p.value;
    const opacity = t < 0.16 ? t / 0.16 : 1 - (t - 0.16) / 0.84;
    const sway = Math.sin(t * Math.PI * 2) * (item.kind === "bubble" ? 5 : 2.5);
    return {
      opacity: Math.max(0, Math.min(1, opacity)),
      transform: [
        { translateX: item.dx * t + sway },
        { translateY: item.dy * t },
        { rotate: `${Math.sin(t * Math.PI) * (item.dx >= 0 ? 12 : -12)}deg` },
        { scale: item.scale * (0.68 + Math.sin(t * Math.PI) * 0.48) },
      ],
    };
  });

  const visual = GLYPH[item.kind];
  return (
    <Animated.View
      pointerEvents="none"
      style={[
        {
          position: "absolute",
          left: item.x,
          top: item.y,
        },
        style,
      ]}
    >
      <Text
        style={{
          fontSize: item.kind === "zzz" ? 11 : 13.5,
          fontWeight: "800",
          color: visual.color,
          textShadowColor: "rgba(15,23,42,0.32)",
          textShadowOffset: { width: 0, height: 1 },
          textShadowRadius: 3,
        }}
      >
        {visual.text}
      </Text>
    </Animated.View>
  );
}

/**
 * 轻量 Reanimated 粒子层：
 * - 无粒子时返回 null，零常驻节点与零帧回调开销（内存友好）；
 * - 卸载时自动取消动画，严格限制同时渲染上限（最多 8 个）。
 */
export function PetParticles({ items }: { items: readonly PetParticleItem[] }) {
  if (!items.length) return null;
  return (
    <View
      pointerEvents="none"
      style={{
        position: "absolute",
        left: 0,
        top: 0,
        right: 0,
        bottom: 0,
        overflow: "visible",
        zIndex: 6,
      }}
    >
      {items.slice(-8).map((item) => (
        <ParticleNode key={item.id} item={item} />
      ))}
    </View>
  );
}
