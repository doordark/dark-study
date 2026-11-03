import { useEffect } from "react";
import { AppState, View } from "react-native";
import Animated, { useAnimatedStyle, useFrameCallback, useSharedValue } from "react-native-reanimated";

// Eight authored poses, 384×512 per cell. Hold open eyes longer than the blink.
const HOLDS = [1600, 260, 260, 90, 110, 90, 260, 300];
const LOOP_MS = HOLDS.reduce((sum, ms) => sum + ms, 0);
const SHEET = require("../../assets/whale/pet-idle-sheet.png");

export function PetIdleAnimation({ width, height }: { width: number; height: number }) {
  const pose = useSharedValue(0);
  const clock = useFrameCallback((info) => {
    let elapsed = info.timeSinceFirstFrame % LOOP_MS;
    let index = 0;
    while (index < HOLDS.length - 1 && elapsed >= HOLDS[index]) {
      elapsed -= HOLDS[index];
      index += 1;
    }
    if (pose.value !== index) pose.value = index;
  });
  useEffect(() => {
    clock.setActive(AppState.currentState === "active");
    const sub = AppState.addEventListener("change", (state) => clock.setActive(state === "active"));
    return () => { sub.remove(); clock.setActive(false); };
  }, [clock]);
  const style = useAnimatedStyle(() => ({
    transform: [
      { translateX: -(pose.value % 4) * width },
      { translateY: -Math.floor(pose.value / 4) * height },
    ],
  }));
  return (
    <View pointerEvents="none" style={{ width, height, overflow: "hidden" }}>
      <Animated.Image source={SHEET} fadeDuration={0} resizeMode="stretch"
        style={[{ position: "absolute", left: 0, top: 0, width: width * 4, height: height * 2 }, style]} />
    </View>
  );
}
