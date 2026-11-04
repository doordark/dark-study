import { useEffect } from "react";
import { View } from "react-native";
import Animated, { cancelAnimation, Easing, useAnimatedStyle, useReducedMotion, useSharedValue, withRepeat, withTiming } from "react-native-reanimated";
import { AnimatedAtlas } from "./AnimatedAtlas";
const AVATAR = require("../../assets/whale/avatar-sheet.png");
const FRAMES = [0, 1, 2, 1, 0, 3, 0];
const HOLDS = [2600, 90, 110, 90, 2100, 350, 1800];
/** Dedicated close-up portrait, readable at dock size with a quiet blink loop. */
export function WhaleAvatar({ size = 40, variant = "plain" }: { size?: number; variant?: "plain" | "dock" }) {
  const bob = useSharedValue(0);
  const reduced = useReducedMotion();
  useEffect(() => {
    if (!reduced) bob.value = withRepeat(withTiming(1, { duration: 2200, easing: Easing.inOut(Easing.sin) }), -1, true);
    return () => cancelAnimation(bob);
  }, [bob, reduced]);
  const style = useAnimatedStyle(() => ({ transform: [{ translateY: bob.value * -1 }, { scale: 1 + bob.value * 0.015 }] }));
  const isDock = variant === "dock";
  const portraitSize = isDock ? size : size - 2;
  return <Animated.View style={[{
    width: size,
    height: size,
    borderRadius: isDock ? 0 : size / 2,
    backgroundColor: isDock ? "transparent" : "rgba(82,149,216,0.12)",
    overflow: isDock ? "visible" : "hidden",
    alignItems: "center",
    justifyContent: "center",
  }, style]}>
    <View style={{ width: portraitSize, height: portraitSize }}><AnimatedAtlas source={AVATAR} columns={2} rows={2} frames={FRAMES} holds={HOLDS} width={portraitSize} /></View>
  </Animated.View>;
}
