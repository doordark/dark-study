import { memo, useEffect } from "react";
import { Image, View } from "react-native";
import Animated, { cancelAnimation, Easing, useAnimatedStyle, useSharedValue, withRepeat, withTiming } from "react-native-reanimated";
import Svg, { Path, Rect } from "react-native-svg";

const PROPS = require("../../../assets/images/farm-props.png");
const PLACEMENTS = [
  { col: 0, row: 0, x: 35, y: 226, size: 24 },
  { col: 1, row: 0, x: 112, y: 235, size: 28 },
  { col: 0, row: 1, x: 148, y: 174, size: 17 },
  { col: 1, row: 1, x: 163, y: 279, size: 22 },
] as const;

export const FarmProps = memo(function FarmProps({ scale, night }: { scale: number; night: boolean }) {
  return <View pointerEvents="none" style={{ position: "absolute", left: 0, top: 0, width: 200 * scale, height: 330 * scale }}>
    {PLACEMENTS.map((p) => {
      const size = p.size * scale;
      return <View key={`${p.col}-${p.row}`} style={{ position: "absolute", left: p.x * scale, top: p.y * scale, width: size, height: size, overflow: "hidden", opacity: night ? 0.74 : 1 }}>
        <Image source={PROPS} resizeMode="stretch" fadeDuration={0}
          style={{ position: "absolute", left: -p.col * size, top: -p.row * size, width: size * 2, height: size * 2 }} />
      </View>;
    })}
    {night ? <View style={{ position: "absolute", left: 42 * scale, top: 232 * scale, width: 12 * scale, height: 12 * scale, borderRadius: 30, backgroundColor: "rgba(255,204,111,0.14)" }} /> : null}
  </View>;
});

/** Pixel-sized water highlights and bank reeds; no touch surface above the pond. */
export const FarmWater = memo(function FarmWater({ scale, night }: { scale: number; night: boolean }) {
  const ripple = useSharedValue(0);
  useEffect(() => {
    ripple.value = withRepeat(withTiming(1, { duration: 2800, easing: Easing.inOut(Easing.sin) }), -1, true);
    return () => cancelAnimation(ripple);
  }, [ripple]);
  const style = useAnimatedStyle(() => ({
    opacity: 0.4 + ripple.value * 0.45,
    transform: [{ translateX: ripple.value * 2 * scale }],
  }));
  return (
    <Animated.View pointerEvents="none" style={[{ position: "absolute", left: 100 * scale, top: 262 * scale, width: 68 * scale, height: 36 * scale }, style]}>
      <Svg width={68 * scale} height={36 * scale} viewBox="0 0 68 36">
        <Path d="M16 11h10m-4 2h5m12 7h12m-8 2h5M19 26h8" fill="none" stroke={night ? "#B4C7FF" : "#D7F7FF"} strokeWidth="0.7" />
        <Rect x="48" y="8" width="6" height="3" rx="1" fill={night ? "#3B654E" : "#589A52"} />
        <Rect x="50" y="7" width="2" height="2" fill="#EDB6C8" />
        <Path d="M4 25v-6m2 8v-5m55 5v-6m2 4v-8" stroke={night ? "#42624E" : "#487B40"} strokeWidth="1" />
      </Svg>
    </Animated.View>
  );
});
