import { useCallback, useEffect, useMemo } from "react";
import Animated, { cancelAnimation, useAnimatedStyle, useFrameCallback, useReducedMotion, useSharedValue, withTiming, type SharedValue } from "react-native-reanimated";
import { AnimatedAtlas } from "@/components/AnimatedAtlas";
import { useAnimationActive } from "@/hooks/useAnimationActive";
import { RESIDENTS, type ResidentId } from "@/utils/farmLife";
const WALK = require("../../../assets/images/farm-people-walk-v2.png");
const IDLE = require("../../../assets/images/farm-people-idle-v2.png");
const TALK = require("../../../assets/images/farm-people-talk-v2.png");
const IDLE_HOLDS = [1700, 500, 80, 90, 80, 650];

export function FarmPersonSprite({ who, activity = "idle", size, active = true, positionX, positionY, walkSpeed = 26 }: {
  who: ResidentId | "hero"; activity?: "idle" | "walk" | "talk"; size: number; active?: boolean;
  positionX?: SharedValue<number>; positionY?: SharedValue<number>; walkSpeed?: number;
}) {
  const awake = useAnimationActive(active);
  const reduced = useReducedMotion();
  const walking = activity === "walk";
  const row = who === "hero" ? 6 : RESIDENTS[who].row;
  const frames = useMemo(() => Array.from({ length: 6 }, (_, i) => row * 6 + i), [row]);
  const walkFrames = useMemo(() => Array.from({ length: 8 }, (_, i) => row * 8 + i), [row]);
  const envelope = useSharedValue(0);
  const rate = useSharedValue(0);
  const distance = useSharedValue(0);
  const lastX = useSharedValue(0);
  const lastY = useSharedValue(0);
  const onFrame = useCallback((info: { timeSincePreviousFrame: number | null }) => {
    "worklet";
    if (!positionX || !positionY) { rate.set(1); return; }
    const x = positionX.value; const y = positionY.value;
    if (info.timeSincePreviousFrame == null) { lastX.set(x); lastY.set(y); rate.set(0); return; }
    const travel = Math.hypot(x - lastX.value, y - lastY.value);
    lastX.set(x); lastY.set(y);
    distance.set(distance.value + travel);
    // Compensate for route duration/easing without React renders or reading layout pixels.
    rate.set(Math.min(2, travel / Math.max(1, info.timeSincePreviousFrame) * 1000 / walkSpeed));
  }, [positionX, positionY, rate, lastX, lastY, distance, walkSpeed]);
  const clock = useFrameCallback(onFrame, false);
  useEffect(() => {
    envelope.set(withTiming(awake && walking && !reduced ? 1 : 0, { duration: 110 }));
    clock.setActive(awake && walking && !reduced);
    return () => { clock.setActive(false); cancelAnimation(envelope); };
  }, [awake, walking, reduced, clock, envelope]);
  const body = useAnimatedStyle(() => {
    const phase = distance.value / (walkSpeed * 0.64) * Math.PI * 2;
    return { transform: [
      { translateY: -Math.abs(Math.sin(phase)) * size * 0.028 * envelope.value },
      { rotate: `${Math.sin(phase) * 1.1 * envelope.value}deg` },
    ] };
  });
  const walkingStyle = useAnimatedStyle(() => ({ opacity: envelope.value }));
  const restingStyle = useAnimatedStyle(() => ({ opacity: 1 - envelope.value }));
  return <Animated.View style={[{ width: size, height: size * 1.25 }, body]}>
    <Animated.View style={[{ position: "absolute" }, restingStyle]}>
      <AnimatedAtlas source={activity === "talk" ? TALK : IDLE} columns={6} rows={7} frames={frames}
        holds={activity === "talk" ? undefined : IDLE_HOLDS} frameDuration={110} width={size} height={size * 1.25} active={awake && !walking} />
    </Animated.View>
    <Animated.View style={[{ position: "absolute" }, walkingStyle]}>
      <AnimatedAtlas source={WALK} columns={8} rows={7} frames={walkFrames} frameDuration={80}
        width={size} height={size * 1.25} active={awake && walking} playbackRate={rate} />
    </Animated.View>
  </Animated.View>;
}
