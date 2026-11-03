import { memo, useEffect, useState } from "react";
import { Pressable, Text, View } from "react-native";
import Animated, { cancelAnimation, Easing, runOnJS, useAnimatedStyle, useReducedMotion, useSharedValue, withDelay, withRepeat, withSequence, withTiming } from "react-native-reanimated";
import { RESIDENTS, type ResidentId } from "@/utils/farmLife";
import { FarmPersonSprite } from "./FarmPersonSprite";

export interface ResidentMeeting { id: number; pair: readonly ResidentId[]; speaking?: ResidentId; text?: string }
const random = () => Math.random();

export const FarmResident = memo(function FarmResident({ who, scale, active, roaming, meeting, onTalk }: {
  who: ResidentId; scale: number; active: boolean; roaming: boolean; meeting: ResidentMeeting | null;
  onTalk: (who: ResidentId, position: { x: number; y: number }) => void;
}) {
  const meta = RESIDENTS[who];
  const x = useSharedValue(meta.home.x);
  const y = useSharedValue(meta.home.y);
  const face = useSharedValue(1);
  const breath = useSharedValue(0);
  const [moving, setMoving] = useState(false);
  const reduced = useReducedMotion();
  const pair = meeting?.pair;
  const meetingId = meeting?.id;
  useEffect(() => {
    setMoving(false);
    if (!active || reduced) return;
    const goTo = (tx: number, ty: number, lookAt = 0) => {
      cancelAnimation(x); cancelAnimation(y);
      setMoving(true);
      face.value = tx >= x.value ? 1 : -1;
      const duration = (distance: number) => Math.min(4500, Math.max(350, Math.abs(distance) / 26 * 1000));
      const sameLane = (x.value < 43 && tx < 43) || (x.value >= 145 && tx >= 145) || (y.value >= 222 && ty >= 222);
      const settle = (finished?: boolean) => { "worklet"; if (finished) { if (lookAt) face.value = lookAt; runOnJS(setMoving)(false); } };
      const cfg = { duration: duration(Math.hypot(tx - x.value, ty - y.value)), easing: Easing.linear };
      if (sameLane) { x.value = withTiming(tx, cfg); y.value = withTiming(ty, cfg, settle); }
      else {
        // Route across the lawn below the plots. Never walk through crops, house or pond.
        const down = duration(230 - y.value); const across = duration(tx - x.value); const up = duration(ty - 230);
        x.value = withDelay(down, withTiming(tx, { duration: across, easing: Easing.linear }));
        y.value = withSequence(withTiming(230, { duration: down, easing: Easing.linear }), withDelay(across, withTiming(ty, { duration: up, easing: Easing.linear }, settle)));
      }
    };
    const member = pair?.indexOf(who) ?? -1;
    if (member >= 0 && roaming) goTo(member === 0 ? 76 : 108, 230, member === 0 ? 1 : -1);
    let timer: ReturnType<typeof setInterval> | undefined;
    let first: ReturnType<typeof setTimeout> | undefined;
    if (member < 0 && roaming) {
      const wander = () => goTo(meta.lane.x + random() * meta.lane.w, meta.lane.y + random() * meta.lane.h);
      first = setTimeout(wander, 1600 + meta.row * 800);
      timer = setInterval(wander, 12_000 + meta.row * 1300);
    }
    return () => { clearTimeout(first); clearInterval(timer); cancelAnimation(x); cancelAnimation(y); };
  }, [active, roaming, meetingId, pair, meta, who, x, y, face, reduced]);
  useEffect(() => {
    if (active && !reduced) breath.value = withRepeat(withTiming(1, { duration: 1900 + meta.row * 120, easing: Easing.inOut(Easing.sin) }), -1, true);
    return () => cancelAnimation(breath);
  }, [active, reduced, breath, meta.row]);
  const position = useAnimatedStyle(() => ({ zIndex: Math.round(y.value), transform: [{ translateX: x.value * scale }, { translateY: y.value * scale - breath.value * 0.6 * scale }] }));
  const facing = useAnimatedStyle(() => ({ transform: [{ scaleX: face.value }] }));
  const speaking = meeting?.speaking === who;
  const right = roaming && !reduced ? (pair?.indexOf(who) ?? -1) === 1 : meta.home.x > 100;
  return <Animated.View style={[{ position: "absolute", left: 0, top: 0, width: 22 * scale, height: 28 * scale }, position]}>
    {speaking && meeting?.text ? <View pointerEvents="none" style={{ position: "absolute", bottom: 31 * scale, ...(right ? { right: 0 } : { left: 0 }), width: 142, padding: 8, borderRadius: 12, borderWidth: 1, borderColor: "#91A76B", backgroundColor: "rgba(20,35,26,0.95)" }}><Text style={{ color: "#F6EEDC", fontSize: 11, lineHeight: 16 }}>{meeting.text}</Text></View> : null}
    <Text pointerEvents="none" style={{ position: "absolute", top: -13, alignSelf: "center", color: speaking ? "#FFE6A1" : "#F6EEDC", backgroundColor: "rgba(15,28,20,0.75)", paddingHorizontal: 5, borderRadius: 5, fontSize: 10 }}>{meta.name}{speaking ? " ···" : ""}</Text>
    <Pressable accessibilityRole="button" accessibilityLabel={`${meta.name}，点击聊天`} hitSlop={6} onPress={() => onTalk(who, { x: x.value, y: y.value })}>
      <Animated.View style={facing}><FarmPersonSprite who={who} activity={moving ? "walk" : speaking ? "talk" : "idle"} size={22 * scale} active={active} /></Animated.View>
    </Pressable>
  </Animated.View>;
});
