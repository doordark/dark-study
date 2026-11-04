import { useEffect, useRef } from "react";
import { useWhalePersona } from "@/store/useWhalePersona";
import { renderPersonaText } from "@/utils/whalePersona";
import { StyleSheet, Text, View, useWindowDimensions } from "react-native";
import Animated, {
  cancelAnimation,
  Easing,
  Extrapolation,
  interpolate,
  ReduceMotion,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withTiming,
  type SharedValue,
} from "react-native-reanimated";

const ACTIONS = require("../../assets/whale/pet-actions-v2.png");
const TURN = require("../../assets/whale/pet-spin-v2.png");
const W = 192;
const H = 256;
const WAVE = [8, 9, 10, 11, 12, 13, 14, 15];
const ARRIVE = [8, 9, 10, 11, 12, 13, 14, 15, 0];
const DEPART = [0, 1, 2, 3, 4, 5, 6, 7, 8];
type Mode = "summon" | "leave";
type Timeline = { p: SharedValue<number>; mode: Mode };

function phase(value: number, start: number, end: number) {
  "worklet";
  return Math.max(0, Math.min(1, (value - start) / (end - start)));
}

function poseAt(value: number, frames: number[]) {
  "worklet";
  return frames[Math.min(frames.length - 1, Math.floor(value * frames.length))];
}

/** Both pose tracks share the scene clock: a slow frame never separates the turn from the dive. */
function Character({ p, mode, reduced }: Timeline & { reduced: boolean }) {
  const leaving = mode === "leave";
  const waveStyle = useAnimatedStyle(() => {
    const elapsed = Math.max(0, p.value - (leaving ? 0.06 : 0.42)) * (leaving ? 2100 : 2600);
    const frame = reduced ? 8 : WAVE[Math.min(7, Math.floor(elapsed / 70))];
    return { transform: [{ translateX: -(frame % 8) * W }, { translateY: -Math.floor(frame / 8) * H }] };
  });
  const turnStyle = useAnimatedStyle(() => {
    const t = phase(p.value, leaving ? 0.42 : 0.12, leaving ? 0.69 : 0.42);
    const frame = poseAt(t, leaving ? DEPART : ARRIVE);
    return { transform: [
      { translateX: -(frame % 4) * W },
      { translateY: -Math.floor(frame / 4) * H },
    ] };
  });
  const waveLayer = useAnimatedStyle(() => ({
    opacity: reduced ? 1 : leaving
      ? 1 - phase(p.value, 0.40, 0.44)
      : phase(p.value, 0.40, 0.44),
  }));
  const turnLayer = useAnimatedStyle(() => ({
    opacity: reduced ? 0 : leaving
      ? phase(p.value, 0.40, 0.44)
      : 1 - phase(p.value, 0.40, 0.44),
  }));
  const body = useAnimatedStyle(() => {
    const t = p.value;
    if (reduced) return { opacity: 1 };
    const travel = leaving ? phase(t, 0.58, 0.88) : 1 - phase(t, 0.12, 0.42);
    const float = Math.sin(phase(t, 0.44, 0.87) * Math.PI * 2);
    return {
      opacity: leaving ? 1 - phase(t, 0.80, 0.88) : phase(t, 0.12, 0.20),
      transform: [
        { translateX: leaving ? travel * -14 : travel * 22 },
        { translateY: travel * travel * 278 + float * -5 },
        { rotate: `${leaving ? travel * -3 : travel * 3}deg` },
      ],
    };
  });
  return <View style={styles.characterClip}>
    <Animated.View style={[styles.character, body]}>
      <Animated.View style={[styles.cell, turnLayer]}>
        <Animated.Image source={TURN} fadeDuration={0} resizeMode="stretch"
          style={[styles.sheet, { height: H * 4 }, turnStyle]} />
      </Animated.View>
      <Animated.View style={[styles.cell, waveLayer]}>
        <Animated.Image source={ACTIONS} fadeDuration={0} resizeMode="stretch"
          style={[styles.sheet, { width: W * 8, height: H * 5 }, waveStyle]} />
      </Animated.View>
    </Animated.View>
  </View>;
}

function Portal({ p, mode, front = false }: Timeline & { front?: boolean }) {
  const style = useAnimatedStyle(() => {
    const open = phase(p.value, 0.02, mode === "leave" ? 0.22 : 0.14);
    const close = 1 - phase(p.value, mode === "leave" ? 0.85 : 0.76, 0.98);
    return {
      opacity: open * close,
      transform: [{ scaleX: open * close }, { scaleY: 0.92 + Math.sin(p.value * 22) * 0.08 }],
    };
  });
  return <Animated.View style={[styles.portal, front ? styles.portalFront : styles.portalBack, style]}>
    {!front && <View style={styles.portalInner} />}
  </Animated.View>;
}

function Ripple({ p, mode, index }: Timeline & { index: number }) {
  const style = useAnimatedStyle(() => {
    const start = (mode === "leave" ? 0.65 : 0.22) + index * 0.045;
    const t = phase(p.value, start, start + 0.22);
    return {
      opacity: Math.sin(t * Math.PI) * 0.65,
      transform: [{ scaleX: 0.5 + t * 1.1 }, { scaleY: 0.5 + t * 0.8 }],
    };
  });
  return <Animated.View style={[styles.ripple, style]} />;
}

/** Small native shapes, staggered around the exact emergence / dive beat. */
function WaterParticle({ p, mode, index }: Timeline & { index: number }) {
  const bubble = index % 3 === 0;
  const size = bubble ? 9 + index % 4 : 4 + index % 3;
  const style = useAnimatedStyle(() => {
    const start = (mode === "leave" ? 0.64 : 0.20) + (index % 4) * 0.025;
    const t = phase(p.value, start, start + 0.26);
    const direction = index % 2 === 0 ? -1 : 1;
    const reach = 32 + index * 6;
    return {
      opacity: Math.sin(t * Math.PI) * 0.9,
      transform: [
        { translateX: direction * (18 + reach * t) },
        { translateY: bubble ? -110 * t : -Math.sin(t * Math.PI) * (32 + index * 4) + 14 * t },
        { scale: 1 - 0.5 * t },
        { rotate: `${direction * t * 55}deg` },
      ],
    };
  });
  return <Animated.View style={[styles.particle, {
    width: size, height: bubble ? size : size * 1.8, borderRadius: size,
    backgroundColor: bubble ? "rgba(125,211,252,0.12)" : "#BAE6FD",
    borderWidth: bubble ? 1 : 0, borderColor: "#BAE6FD",
  }, style]} />;
}

function WhaleTransition({ mode, onDone }: { mode: Mode; onDone: () => void }) {
  const doneRef = useRef(onDone);
  const p = useSharedValue(0);
  const reduced = useReducedMotion();
  const { width, height } = useWindowDimensions();
  const persona = useWhalePersona((s) => s.persona);
  const duration = reduced ? 240 : mode === "summon" ? 2600 : 2100;
  const sceneScale = Math.min(1, Math.max(0.4, (width - 24) / 320), Math.max(0.4, (height - 32) / 460));

  useEffect(() => { doneRef.current = onDone; }, [onDone]);
  useEffect(() => {
    p.value = 0;
    p.value = withTiming(1, { duration, easing: Easing.linear, reduceMotion: ReduceMotion.Never });
    // Only completion uses JS; poses, motion and water effects stay on the UI thread.
    const timer = setTimeout(() => doneRef.current(), duration + 40);
    return () => { clearTimeout(timer); cancelAnimation(p); };
  }, [duration, mode, p]);

  const overlay = useAnimatedStyle(() => ({
    opacity: interpolate(p.value, [0, 0.08, 0.88, 1], [0, 1, 1, 0], Extrapolation.CLAMP),
  }));
  const caption = useAnimatedStyle(() => ({
    opacity: reduced ? 1 : phase(p.value, mode === "leave" ? 0.06 : 0.43, mode === "leave" ? 0.16 : 0.53) * (1 - phase(p.value, 0.86, 0.98)),
    transform: [{ translateY: reduced ? 0 : 8 * (1 - phase(p.value, 0.40, 0.54)) }],
  }));
  return <Animated.View pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={[styles.overlay, overlay]}>
    <View style={[styles.scene, { transform: [{ scale: sceneScale }] }]}>
      {!reduced && <Portal p={p} mode={mode} />}
      <Character p={p} mode={mode} reduced={reduced} />
      {!reduced && <>
        <Portal p={p} mode={mode} front />
        {[0, 1, 2].map(index => <Ripple key={index} p={p} mode={mode} index={index} />)}
        {Array.from({ length: 12 }, (_, index) => <WaterParticle key={index} p={p} mode={mode} index={index} />)}
      </>}
      <Animated.View style={[styles.caption, caption]}>
        <Text style={styles.eyebrow}>{mode === "summon" ? "✦ 鲸鱼空间 · 开 ✦" : "✦ 暂时潜水中 ✦"}</Text>
        <Text style={styles.title}>{mode === "summon" ? "喊我就来！" : renderPersonaText("一会儿见，{{user}}", persona)}</Text>
        <Text style={styles.subtitle}>{mode === "summon" ? renderPersonaText("{{char}}浮出水面，向你挥了挥手", persona) : "先回水里歇一会，想我了就喊我"}</Text>
      </Animated.View>
    </View>
  </Animated.View>;
}

export function WhaleSummonFX({ onDone }: { onDone: () => void }) {
  return <WhaleTransition mode="summon" onDone={onDone} />;
}

export function WhaleLeaveFX({ onDone }: { onDone: () => void }) {
  return <WhaleTransition mode="leave" onDone={onDone} />;
}

const styles = StyleSheet.create({
  overlay: { position: "absolute", top: 0, right: 0, bottom: 0, left: 0, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(5,18,38,0.78)", zIndex: 40 },
  scene: { width: 320, height: 460 },
  characterClip: { position: "absolute", top: 22, left: 0, width: 320, height: 286, overflow: "hidden" },
  character: { position: "absolute", top: 16, left: (320 - W) / 2, width: W, height: H },
  cell: { position: "absolute", top: 0, right: 0, bottom: 0, left: 0, overflow: "hidden" },
  sheet: { position: "absolute", top: 0, left: 0, width: W * 4 },
  portal: { position: "absolute", left: 48, top: 284, width: 224, height: 48, borderRadius: 112, borderWidth: 2, borderColor: "#7DD3FC" },
  portalBack: { backgroundColor: "rgba(14,116,144,0.30)" },
  portalFront: { borderTopColor: "transparent", backgroundColor: "transparent" },
  portalInner: { position: "absolute", top: 9, bottom: 9, left: 20, right: 20, borderRadius: 92, borderWidth: 1, borderColor: "rgba(186,230,253,0.4)", backgroundColor: "rgba(56,189,248,0.16)" },
  ripple: { position: "absolute", top: 284, left: 48, width: 224, height: 48, borderRadius: 112, borderWidth: 1, borderColor: "#BAE6FD" },
  particle: { position: "absolute", left: 156, top: 299 },
  caption: { position: "absolute", top: 352, left: 0, right: 0, alignItems: "center" },
  eyebrow: { color: "#7DD3FC", fontSize: 10, fontWeight: "700", letterSpacing: 3 },
  title: { marginTop: 10, color: "#E0F2FE", fontSize: 23, fontWeight: "900", letterSpacing: 2 },
  subtitle: { marginTop: 8, color: "#BAE6FD", fontSize: 11, textAlign: "center" },
});
