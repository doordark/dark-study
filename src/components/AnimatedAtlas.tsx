import { useCallback, useEffect, useMemo, useRef } from "react";
import { AppState, View, type ImageSourcePropType } from "react-native";
import Animated, { runOnJS, useAnimatedStyle, useFrameCallback, useReducedMotion, useSharedValue, type SharedValue } from "react-native-reanimated";
import { atlasPose, atlasTimeline } from "@/utils/atlasTimeline";

/** Authored sprite timing on the UI thread, independent of screen refresh rate. */
export function AnimatedAtlas({ source, columns, rows, frames, holds, frameDuration = 80, fps, loop = true, loopFrom = 0, width, height = width, active = true, playbackRate }: {
  source: ImageSourcePropType; columns: number; rows: number; frames: readonly number[]; holds?: readonly number[];
  frameDuration?: number; fps?: number; loop?: boolean; width: number; height?: number; active?: boolean;
  playbackRate?: SharedValue<number>; loopFrom?: number;
}) {
  const reduced = useReducedMotion();
  const cols = Math.max(1, Math.floor(columns) || 1);
  const rowCount = Math.max(1, Math.floor(rows) || 1);
  // Value identity keeps inline arrays and unrelated renders from restarting playback.
  const signature = JSON.stringify(atlasTimeline(frames, cols * rowCount, frameDuration, fps, holds));
  const timeline = useMemo(() => JSON.parse(signature) as ReturnType<typeof atlasTimeline>, [signature]);
  const loopStart = timeline.holds.slice(0, Math.max(0, Math.min(timeline.frames.length - 1, Math.floor(loopFrom) || 0))).reduce((sum, ms) => sum + ms, 0);
  const sequence = useSharedValue({ ...timeline, signature });
  const elapsed = useSharedValue(0);
  const pose = useSharedValue(timeline.frames[0]);
  const ended = useSharedValue(false);
  const clockRef = useRef<{ setActive: (value: boolean) => void } | null>(null);
  const stop = useCallback(() => clockRef.current?.setActive(false), []);
  const onFrame = useCallback((info: { timeSincePreviousFrame: number | null }) => {
    "worklet";
    const seq = sequence.value;
    // Activation starts with a null delta; foreground resumes in place.
    const delta = Math.max(0, Math.min(info.timeSincePreviousFrame ?? 0, 100));
    const rate = playbackRate ? playbackRate.value : 1;
    const next = elapsed.value + delta * (Number.isFinite(rate) ? Math.max(0, rate) : 1);
    elapsed.set(loop && next >= seq.total ? loopStart + (next - seq.total) % (seq.total - loopStart) : Math.min(next, seq.total));
    const frame = atlasPose(elapsed.value, seq.frames, seq.holds);
    if (pose.value !== frame) pose.set(frame);
    if (!loop && next >= seq.total && !ended.value) {
      ended.set(true);
      runOnJS(stop)();
    }
  }, [sequence, elapsed, playbackRate, loop, loopStart, pose, ended, stop]);
  const clock = useFrameCallback(onFrame, false);
  useEffect(() => { clockRef.current = clock; }, [clock]);
  useEffect(() => {
    sequence.set({ ...timeline, signature });
    elapsed.set(0);
    ended.set(false);
    pose.set(timeline.frames[0]);
  }, [timeline, signature, sequence, elapsed, ended, pose]);
  useEffect(() => {
    const resume = (state: string | null | undefined) => {
      if (reduced) pose.set(timeline.frames[0]);
      clock.setActive(active && timeline.frames.length > 1 && !reduced && (!ended.value || loop) && (!state || state === "active"));
    };
    resume(AppState.currentState);
    const subscription = AppState.addEventListener("change", resume);
    return () => { subscription.remove(); clock.setActive(false); };
  }, [active, clock, timeline, loop, reduced, ended, pose]);
  const style = useAnimatedStyle(() => ({ transform: [
    { translateX: -(pose.value % cols) * width },
    { translateY: -Math.floor(pose.value / cols) * height },
  ] }));
  return <View pointerEvents="none" style={{ width, height, overflow: "hidden" }}>
    <Animated.Image source={source} fadeDuration={0} resizeMode="stretch"
      style={[{ position: "absolute", left: 0, top: 0, width: width * cols, height: height * rowCount }, style]} />
  </View>;
}
