import { useEffect } from "react";
import { AppState, View, type ImageSourcePropType } from "react-native";
import Animated, { useAnimatedStyle, useFrameCallback, useReducedMotion, useSharedValue } from "react-native-reanimated";

/** Play authored poses on the UI thread; pausing never starts a JS frame timer. */
export function AnimatedAtlas({ source, columns, rows, frames, holds, width, height = width, active = true }: {
  source: ImageSourcePropType; columns: number; rows: number; frames: readonly number[]; holds: readonly number[];
  width: number; height?: number; active?: boolean;
}) {
  const reduced = useReducedMotion();
  const pose = useSharedValue(frames[0] ?? 0);
  const total = holds.reduce((sum, ms) => sum + ms, 0);
  const clock = useFrameCallback((info) => {
    let elapsed = info.timeSinceFirstFrame % Math.max(1, total);
    let index = 0;
    while (index < frames.length - 1 && elapsed >= holds[index]) {
      elapsed -= holds[index]; index += 1;
    }
    const next = frames[index] ?? 0;
    if (pose.value !== next) pose.value = next;
  }, false);
  useEffect(() => {
    const resume = (state: string | null | undefined) => clock.setActive(active && frames.length > 1 && !reduced && (!state || state === "active"));
    resume(AppState.currentState ?? "active");
    const subscription = AppState.addEventListener("change", resume);
    return () => { subscription.remove(); clock.setActive(false); };
  }, [active, clock, frames.length, reduced]);
  const style = useAnimatedStyle(() => ({ transform: [
    { translateX: -(pose.value % columns) * width },
    { translateY: -Math.floor(pose.value / columns) * height },
  ] }));
  return <View pointerEvents="none" style={{ width, height, overflow: "hidden" }}>
    <Animated.Image source={source} fadeDuration={0} resizeMode="stretch"
      style={[{ position: "absolute", left: 0, top: 0, width: width * columns, height: height * rows }, style]} />
  </View>;
}
