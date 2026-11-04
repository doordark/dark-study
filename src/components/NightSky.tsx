/* eslint-disable react-hooks/immutability --
   Reanimated 共享值（fade/grow/blink 等）本质是跨渲染、跨线程可变的容器，
   在 effect 与手势中赋值是官方标准用法，React 编译器的不可变假设不适用 */

import AsyncStorage from "@react-native-async-storage/async-storage";
import { LinearGradient } from "expo-linear-gradient";
import { StatusBar } from "expo-status-bar";
import { createContext, memo, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { BackHandler, Image, Pressable, Text, View, useWindowDimensions } from "react-native";
import Animated, {
  Easing,
  cancelAnimation,
  runOnJS,
  useAnimatedStyle,
  useAnimatedProps,
  useSharedValue,
  useReducedMotion,
  withDelay,
  withRepeat,
  withSequence,
  withSpring,
  withTiming,
} from "react-native-reanimated";
import Svg, { Circle, Defs, G, Path, RadialGradient, Stop } from "react-native-svg";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { AtlasSprite } from "@/components/AtlasSprite";
import { NightSkyMessage } from "@/components/NightSkyMessage";
import { useAnimationActive } from "@/hooks/useAnimationActive";

import {
  successHaptic,
  tapHaptic,
  thumpHaptic,
} from "@/utils/haptics";

const NightMotion = createContext(true);

/** 彩蛋观感：固定的种子让每次进入星空时星位一致，不会随机跳动 */
const VISIT_KEY = "dark-study-night-visits";
const TOTAL_STARS = 7;

/** 猫头鹰要听够几次呼唤才肯带路：前几句是对话，最后一句才放行 */
const OWL_LINES = [
  "嘘——夜还长，先陪我看一会儿星星吧。",
  "你拾起的每一颗星，我都记着呢。",
  "风里有翻书的声音，你听见了吗？",
  "想不想去一个更安静的地方？",
  "那就跟紧我，小径就在前面。",
] as const;
const OWL_TAPS_NEEDED = OWL_LINES.length + 1;

function seededDots(count: number) {
  let seed = 20261021;
  const rnd = () => {
    seed = (seed * 1664525 + 1013904223) % 4294967296;
    return seed / 4294967296;
  };
  return Array.from({ length: count }, (_, i) => ({
    id: i,
    x: rnd(),
    y: rnd() * 0.9,
    r: 0.6 + rnd() * 1.4,
    delay: rnd() * 2800,
    dur: 1500 + rnd() * 2400,
  }));
}

const DOTS = seededDots(56);

/** 七颗可拾取的星：避开顶部标题、月亮与底部面板 */
const SPOTS = [
  { x: 0.17, y: 0.04, s: 26 },
  { x: 0.38, y: 0.22, s: 22 },
  { x: 0.63, y: 0.08, s: 28 },
  { x: 0.81, y: 0.46, s: 23 },
  { x: 0.55, y: 0.67, s: 24 },
  { x: 0.27, y: 0.53, s: 27 },
  { x: 0.22, y: 0.97, s: 24 },
] as const;

const OWL_FLIGHT = require("../../assets/images/night-owl-flight.png");
const OWL_BRANCH = require("../../assets/images/night-owl-branch.png");
const FLIGHT_SIZE = 128;
const ARRIVAL_MS = 1640;
const DEPARTURE_MS = 1160;
type OwlStage = "waiting" | "arriving" | "perched" | "leaving";

const MOON_ATLAS = require("../../assets/images/night-moon-phases.png");
const NIGHT_SPRITES = require("../../assets/images/night-sprites-v2.png");

/* -------------------------------------------------------------------------- */
/*  背景微光星点：各自呼吸闪烁                                                 */
/* -------------------------------------------------------------------------- */

const Twinkle = memo(function Twinkle({
  x,
  y,
  r,
  delay,
  dur,
}: {
  x: number;
  y: number;
  r: number;
  delay: number;
  dur: number;
}) {
  const v = useSharedValue(0.15);
  const motion = useContext(NightMotion);

  useEffect(() => {
    if (!motion) { v.value = 0.35; return; }
    v.value = withDelay(
      delay,
      withRepeat(
        withSequence(
          withTiming(0.95, { duration: dur, easing: Easing.inOut(Easing.sin) }),
          withTiming(0.12, { duration: dur, easing: Easing.inOut(Easing.sin) }),
        ),
        -1,
      ),
    );
    return () => cancelAnimation(v);
  }, [delay, dur, v, motion]);

  const style = useAnimatedStyle(() => ({ opacity: v.value }));

  return (
    <Animated.View
      pointerEvents="none"
      style={[
        {
          position: "absolute",
          left: `${x * 100}%`,
          top: `${y * 100}%`,
          width: r * 2,
          height: r * 2,
          borderRadius: r,
          backgroundColor: "#E0F2FE",
        },
        style,
      ]}
    />
  );
});

/* -------------------------------------------------------------------------- */
/*  流星：尾巴上挂着课表里的课程名，划过夜空                                   */
/* -------------------------------------------------------------------------- */

function ShootingStar({
  w,
  delay,
  label,
  top,
}: {
  w: number;
  delay: number;
  label?: string;
  top: number;
}) {
  const t = useSharedValue(0);
  const reduceMotion = useReducedMotion();
  const motion = useContext(NightMotion);

  useEffect(() => {
    if (reduceMotion || !motion) { t.value = 0; return; }
    t.value = withDelay(
      delay,
      withRepeat(
        withSequence(
          withTiming(1, { duration: 1450, easing: Easing.linear }),
          withDelay(4200 + delay, withTiming(0, { duration: 0 })),
        ),
        -1,
        false,
      ),
    );
    return () => cancelAnimation(t);
  }, [delay, t, reduceMotion, motion]);

  const style = useAnimatedStyle(() => {
    const p = t.value;
    const opacity = p < 0.12 ? p / 0.12 : p > 0.62 ? (1 - p) / 0.38 : 1;
    return {
      opacity,
      transform: [
        { translateX: -220 + p * (w + 460) },
        { translateY: top + p * (w + 460) * 0.28 },
        { rotate: "15.64deg" },
      ],
    };
  });

  return (
    <Animated.View
      pointerEvents="none"
      style={[
        { position: "absolute", flexDirection: "row", alignItems: "center" },
        style,
      ]}
    >
      {label ? (
        <Text
          style={{
            color: "rgba(224,242,254,0.38)",
            fontSize: 9,
            letterSpacing: 1.5,
            marginRight: 7,
          }}
        >
          {label.slice(0, 12)}
        </Text>
      ) : null}
      <LinearGradient
        colors={["rgba(224,242,254,0)", "rgba(186,230,253,0.8)"]}
        start={{ x: 0, y: 0.5 }}
        end={{ x: 1, y: 0.5 }}
        style={{
          width: 148,
          height: 2,
          borderRadius: 1,
        }}
      />
      <View
        style={{
          width: 4,
          height: 4,
          borderRadius: 2,
          backgroundColor: "#F0F9FF",
          marginLeft: -1,
        }}
      />
      <View style={{ position: "absolute", right: -6, width: 16, height: 16, borderRadius: 8, backgroundColor: "rgba(186,230,253,0.18)" }} />
    </Animated.View>
  );
}

/* -------------------------------------------------------------------------- */
/*  月亮：拾满七颗星后会稍微长大、光晕更亮                                     */
/* -------------------------------------------------------------------------- */

const MOON_NAMES = ["新月", "娥眉月", "上弦月", "盈凸月", "满月", "亏凸月", "下弦月", "残月"];

function moonPhase(date: Date) {
  // Mean synodic month, anchored at the 2024-04-08 new moon.
  const localNoon = new Date(date.getFullYear(), date.getMonth(), date.getDate(), 12);
  const cycles = (localNoon.getTime() - Date.UTC(2024, 3, 8, 18, 21)) / (29.530588853 * 86400000);
  return Math.round((cycles - Math.floor(cycles)) * 8) % 8;
}

function Moon({
  lit,
  top,
  right,
  size,
}: {
  lit: number;
  top: number;
  right: number;
  size: number;
}) {
  const grow = useSharedValue(0.55);
  const halo = useSharedValue(0);
  const motion = useContext(NightMotion);

  useEffect(() => {
    if (!motion) { grow.value = 1; halo.value = 0.6; return; }
    grow.value = withSpring(1, { damping: 18, stiffness: 90 });
    halo.value = withRepeat(
      withSequence(
        withTiming(1, { duration: 2800, easing: Easing.inOut(Easing.sin) }),
        withTiming(0.5, { duration: 2800, easing: Easing.inOut(Easing.sin) }),
      ),
      -1,
    );
    return () => { cancelAnimation(grow); cancelAnimation(halo); };
  }, [grow, halo, motion]);

  const growStyle = useAnimatedStyle(() => ({
    transform: [{ scale: grow.value }],
  }));
  const haloStyle = useAnimatedStyle(() => ({ opacity: halo.value }));

  const [phase, setPhase] = useState(() => moonPhase(new Date()));
  useEffect(() => {
    const refresh = () => setPhase(moonPhase(new Date()));
    const timer = setInterval(refresh, 30000);
    return () => clearInterval(timer);
  }, []);
  const illumination = [0, 0.16, 0.5, 0.84, 1, 0.84, 0.5, 0.16][phase];
  const bright = illumination * (0.45 + (lit / TOTAL_STARS) * 0.55);

  return (
    <Animated.View
      pointerEvents="none"
      style={[
        {
          position: "absolute",
          top,
          right,
          width: size,
          height: size,
          alignItems: "center",
          justifyContent: "center",
        },
        growStyle,
      ]}
    >
      <Animated.View pointerEvents="none" style={[{ position: "absolute", width: size * 3, height: size * 3 }, haloStyle]}>
        <Svg width="100%" height="100%" viewBox="0 0 100 100">
          <Defs><RadialGradient id="moonAtmosphere" cx="50%" cy="50%" r="50%">
            <Stop offset="0" stopColor="#E9D2B2" stopOpacity={0.23 * bright} />
            <Stop offset="0.38" stopColor="#B6A0CE" stopOpacity={0.11 * bright} />
            <Stop offset="1" stopColor="#8F9BCD" stopOpacity={0} />
          </RadialGradient></Defs>
          <Circle cx="50" cy="50" r="50" fill="url(#moonAtmosphere)" />
        </Svg>
      </Animated.View>
      <View accessible accessibilityRole="image" accessibilityLabel={MOON_NAMES[phase]}>
        <AtlasSprite source={MOON_ATLAS} columns={4} rows={2} column={phase % 4} row={Math.floor(phase / 4)} width={size * 0.8} />
      </View>
    </Animated.View>
  );
}

/* -------------------------------------------------------------------------- */
/*  可拾取的星：轻触即拾起，缩放着消散                                         */
/* -------------------------------------------------------------------------- */

function CollectStar({
  x,
  y,
  s,
  w,
  h,
  collected,
  onCollect,
}: {
  x: number;
  y: number;
  s: number;
  w: number;
  h: number;
  collected: boolean;
  onCollect: () => void;
}) {
  const scale = useSharedValue(1);
  const opacity = useSharedValue(1);
  const glow = useSharedValue(0.5);
  const ripple = useSharedValue(0);
  const reduceMotion = useReducedMotion();
  const motion = useContext(NightMotion);

  useEffect(() => {
    if (!motion || collected) return;
    glow.value = withRepeat(
      withSequence(
        withTiming(1, {
          duration: 1400 + x * 900,
          easing: Easing.inOut(Easing.sin),
        }),
        withTiming(0.4, {
          duration: 1400 + x * 900,
          easing: Easing.inOut(Easing.sin),
        }),
      ),
      -1,
    );
    return () => cancelAnimation(glow);
  }, [glow, x, motion, collected]);

  useEffect(() => {
    if (!collected) return;
    if (!motion) { scale.value = 0.25; opacity.value = 0; ripple.value = 1; return; }
    cancelAnimation(glow);
    ripple.value = withTiming(1, { duration: reduceMotion ? 180 : 680, easing: Easing.out(Easing.cubic) });
    scale.value = withSequence(
      withTiming(1.4, { duration: 130 }),
      withTiming(0.25, { duration: 380, easing: Easing.out(Easing.cubic) }),
    );
    opacity.value = withDelay(100, withTiming(0, { duration: 380 }));
    return () => { cancelAnimation(ripple); cancelAnimation(scale); cancelAnimation(opacity); };
  }, [collected, opacity, scale, glow, ripple, reduceMotion, motion]);

  const wrap = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
    opacity: opacity.value,
  }));
  const halo = useAnimatedStyle(() => ({ opacity: glow.value }));
  const ring = useAnimatedStyle(() => ({
    opacity: collected ? (1 - ripple.value) * 0.8 : 0,
    transform: [{ scale: 0.4 + ripple.value * 2.3 }],
  }));

  const box = s * 2.1;

  return (
    <Animated.View
      style={[
        {
          position: "absolute",
          left: x * w - box / 2,
          top: y * h - box / 2,
          width: box,
          height: box,
          alignItems: "center",
          justifyContent: "center",
        },
      ]}
    >
      <Animated.View pointerEvents="none" style={[{ position: "absolute", width: box, height: box, borderRadius: box, borderWidth: 1, borderColor: "#D8E6FF" }, ring]} />
      {collected && !reduceMotion ? <View pointerEvents="none" style={{ position: "absolute", left: box / 2, top: box / 2 }}>
        {Array.from({ length: 6 }, (_, i) => <BurstDot key={i} dx={Math.cos(i * Math.PI / 3) * 38} dy={Math.sin(i * Math.PI / 3) * 38} delay={i * 12} />)}
      </View> : null}
      <Animated.View style={[{ alignItems: "center", justifyContent: "center" }, wrap]}>
      <Animated.View pointerEvents="none" style={[{ position: "absolute", width: box * 2, height: box * 2 }, halo]}>
        <Svg width="100%" height="100%" viewBox="0 0 100 100">
          <Defs><RadialGradient id={"starGlow" + Math.round(x * 100)} cx="50%" cy="50%" r="50%">
            <Stop offset="0" stopColor="#FFE7AB" stopOpacity={0.32} />
            <Stop offset="0.38" stopColor="#D4BCB5" stopOpacity={0.11} />
            <Stop offset="1" stopColor="#A8B7EB" stopOpacity={0} />
          </RadialGradient></Defs>
          <Circle cx="50" cy="50" r="50" fill={"url(#starGlow" + Math.round(x * 100) + ")"} />
        </Svg>
      </Animated.View>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="拾起这颗星星"
        onPress={onCollect}
        hitSlop={18}
        disabled={collected}
        style={{ alignItems: "center", justifyContent: "center" }}
      >
        <AtlasSprite source={NIGHT_SPRITES} columns={3} rows={2} column={0} row={0} width={s * 1.5} />
      </Pressable>
      </Animated.View>
    </Animated.View>
  );
}

/* -------------------------------------------------------------------------- */
/*  拾满星后的星屑爆发                                                         */
/* -------------------------------------------------------------------------- */

function BurstDot({
  dx,
  dy,
  delay,
}: {
  dx: number;
  dy: number;
  delay: number;
}) {
  const t = useSharedValue(0);
  const motion = useContext(NightMotion);

  useEffect(() => {
    if (!motion) { t.value = 1; return; }
    t.value = withDelay(
      delay,
      withTiming(1, { duration: 820, easing: Easing.out(Easing.cubic) }),
    );
    return () => cancelAnimation(t);
  }, [delay, t, motion]);

  const style = useAnimatedStyle(() => ({
    opacity: 1 - t.value,
    transform: [{ translateX: t.value * dx }, { translateY: t.value * dy }],
  }));

  const size = 2 + ((Math.abs(dx) + Math.abs(dy)) % 3);

  return (
    <Animated.View
      style={[
        {
          position: "absolute",
          width: size,
          height: size,
          borderRadius: size,
          backgroundColor: "#FDE68A",
        },
        style,
      ]}
    />
  );
}

function Burst({ cx, cy }: { cx: number; cy: number }) {
  const dots = useMemo(
    () =>
      Array.from({ length: 16 }, (_, i) => {
        const angle = (i / 16) * Math.PI * 2;
        const dist = 66 + (i % 4) * 24;
        return {
          id: i,
          dx: Math.cos(angle) * dist,
          dy: Math.sin(angle) * dist,
          delay: (i % 3) * 60,
        };
      }),
    [],
  );

  return (
    <View
      pointerEvents="none"
      style={{
        position: "absolute",
        left: cx,
        top: cy,
        width: 1,
        height: 1,
      }}
    >
      {dots.map((d) => (
        <BurstDot key={d.id} dx={d.dx} dy={d.dy} delay={d.delay} />
      ))}
    </View>
  );
}

const AnimatedPath = Animated.createAnimatedComponent(Path);

function ConstellationReveal({ points, width, height }: {
  points: { x: number; y: number }[];
  width: number;
  height: number;
}) {
  const motion = useContext(NightMotion);
  const progress = useSharedValue(0);
  const path = points.map(({ x, y }, index) => `${index ? "L" : "M"}${x} ${y}`).join(" ");
  const length = points.reduce((total, point, index) => {
    const previous = points[index - 1];
    return previous ? total + Math.hypot(point.x - previous.x, point.y - previous.y) : total;
  }, 0);
  useEffect(() => {
    progress.value = motion
      ? withTiming(1, { duration: 1650, easing: Easing.inOut(Easing.cubic) })
      : 1;
    return () => cancelAnimation(progress);
  }, [motion, progress]);
  const trace = useAnimatedProps(() => ({ strokeDashoffset: length * (1 - progress.value) }));
  const flash = useAnimatedProps(() => ({
    opacity: Math.sin(progress.value * Math.PI) * 0.65,
    strokeDashoffset: length * (1 - progress.value),
  }));

  return (
    <Svg pointerEvents="none" width={width} height={height} style={{ position: "absolute" }}>
      <AnimatedPath d={path} fill="none" stroke="#A89AFF" strokeWidth={8} strokeLinecap="round"
        strokeDasharray={[length, length]} animatedProps={flash} />
      <AnimatedPath d={path} fill="none" stroke="#FCE5BB" strokeWidth={1.8} strokeLinecap="round"
        strokeDasharray={[length, length]} animatedProps={trace} />
      {points.map(({ x, y }) => (
        <G key={x}>
          <Circle cx={x} cy={y} r={8} fill="#BAA6FF" opacity={0.19} />
          <Circle cx={x} cy={y} r={3.4} fill="#FFF2CE" />
        </G>
      ))}
    </Svg>
  );
}

/* -------------------------------------------------------------------------- */
/*  猫头鹰：拾满星后从月边探出头，会眨眼                                        */
/* -------------------------------------------------------------------------- */

/** Position and atlas cell share one UI-thread clock. React only handles stage changes. */
function OwlFlight({ stage, elapsed, x, y, screenWidth, insetTop }: {
  stage: OwlStage;
  elapsed: ReturnType<typeof useSharedValue<number>>;
  x: number;
  y: number;
  screenWidth: number;
  insetTop: number;
}) {
  const flying = stage === "arriving" || stage === "leaving";
  const leaving = stage === "leaving";
  const flightStyle = useAnimatedStyle(() => {
    const progress = Math.min(1, elapsed.value / (leaving ? DEPARTURE_MS : ARRIVAL_MS));
    const t = leaving ? progress * progress * (2 - progress) : 1 - (1 - progress) ** 1.28;
    const u = 1 - t;
    const dx = leaving
      ? 2 * u * t * 30 + t * t * (screenWidth - x + FLIGHT_SIZE)
      : -u * u * (x + FLIGHT_SIZE) + 2 * u * t * 34;
    const dy = leaving
      ? -2 * u * t * 75 - t * t * (y - insetTop + FLIGHT_SIZE)
      : -u * u * 70 - 2 * u * t * 125;
    return {
      opacity: flying ? (leaving ? Math.min(1, u * 8) : 1) : 0,
      transform: [
        { translateX: dx },
        { translateY: dy },
        { rotate: `${leaving ? -9 * Math.sin(t * Math.PI) : 10 * u}deg` },
        { scale: leaving ? 1 - t * 0.56 : 0.74 + t * 0.26 },
      ],
    };
  });
  const frameStyle = useAnimatedStyle(() => {
    const time = elapsed.value;
    let frame = Math.floor(time / 54) % 4;
    if (leaving) {
      if (time < 100) frame = 6;
      else if (time < 155) frame = 7;
      else frame = 8 + Math.floor((time - 155) / 54) % 4;
    } else if (time >= ARRIVAL_MS - 270) {
      frame = time >= ARRIVAL_MS - 115 ? 5 : 4;
    }
    return { transform: [
      { translateX: -(frame % 4) * FLIGHT_SIZE },
      { translateY: -Math.floor(frame / 4) * FLIGHT_SIZE },
    ] };
  });

  return (
    <Animated.View pointerEvents="none" style={[{
      position: "absolute",
      left: x - FLIGHT_SIZE / 2,
      top: y - FLIGHT_SIZE / 2,
      width: FLIGHT_SIZE,
      height: FLIGHT_SIZE,
      overflow: "hidden",
      zIndex: 6,
    }, flightStyle]}>
      <Animated.Image source={OWL_FLIGHT} resizeMode="stretch" fadeDuration={0} style={[{
        position: "absolute",
        width: FLIGHT_SIZE * 4,
        height: FLIGHT_SIZE * 3,
      }, frameStyle]} />
    </Animated.View>
  );
}

function OwlBody() {
  const blink = useSharedValue(1);
  const motion = useContext(NightMotion);
  useEffect(() => {
    if (!motion) { blink.value = 1; return; }
    blink.value = withRepeat(withSequence(withDelay(2800, withTiming(0, { duration: 0 })), withDelay(105, withTiming(1, { duration: 0 }))), -1, false);
    return () => cancelAnimation(blink);
  }, [blink, motion]);
  const closed = useAnimatedStyle(() => ({ opacity: 1 - blink.value }));
  return <View style={{ width: 80, height: 86 }}>
    <AtlasSprite source={NIGHT_SPRITES} columns={3} rows={2} column={0} row={1} width={80} height={86} />
    <Animated.View pointerEvents="none" style={[{ position: "absolute", left: 20, top: 21, width: 40, height: 17, borderRadius: 7, overflow: "hidden" }, closed]}>
      <View style={{ position: "absolute", left: -20, top: -21 }}>
        <AtlasSprite source={NIGHT_SPRITES} columns={3} rows={2} column={1} row={1} width={80} height={86} />
      </View>
    </Animated.View>
  </View>;
}

function Owl({
  left,
  top,
  onTap,
  hint,
}: {
  left: number;
  top: number;
  onTap: () => void;
  hint?: string;
}) {
  // Give the text all available space to the left of the owl.
  const bubbleWidth = Math.max(1, Math.min(196, left - 20));

  return (
    <View style={{ position: "absolute", left, top, zIndex: 6 }}>
      {hint ? (
        <View
          pointerEvents="none"
          style={{
            position: "absolute",
            top: 2,
            right: 88,
            maxWidth: bubbleWidth,
            paddingHorizontal: 12,
            paddingVertical: 9,
            borderRadius: 13,
            borderWidth: 1,
            borderColor: "#BDA784",
            backgroundColor: "#121C35",
          }}
        >
          <Text
            style={{
              color: "#F2E6D6",
              width: bubbleWidth - 44,
              fontSize: 12,
              lineHeight: 18,
            }}
          >
            {hint}
          </Text>
          <Svg width={9} height={13} style={{ position: "absolute", right: -9, top: 13 }}>
            <Path d="M0 1 L8 6.5 L0 12" fill="#121C35" stroke="#BDA784" strokeWidth={1} />
          </Svg>
        </View>
      ) : null}
      <Pressable onPress={onTap} accessibilityRole="button" accessibilityLabel="和猫头鹰对话" hitSlop={12}>
        <OwlBody />
      </Pressable>
    </View>
  );
}

export interface NightSkyProps {
  onClose: () => void;
  /** 夜空最深处的那条小径 */
  onEnterFarm?: () => void;
  /** 课表里的课程名：会变成流星尾巴上的小标签 */
  courseNames?: string[];
}

export function NightSky({
  onClose,
  onEnterFarm,
  courseNames = [],
}: NightSkyProps) {
  const { width: w, height: h } = useWindowDimensions();
  const insets = useSafeAreaInsets();

  const [visits, setVisits] = useState(1);
  // 逐颗记录，点哪颗收哪颗；不能用数量推导顺序，否则会收错星
  const [picked, setPicked] = useState<boolean[]>(() =>
    Array<boolean>(TOTAL_STARS).fill(false),
  );
  const lit = picked.filter(Boolean).length;
  const [closing, setClosing] = useState(false);
  const [panelHeight, setPanelHeight] = useState(300);
  const [owlLanded, setOwlLanded] = useState(false);
  const [followingOwl, setFollowingOwl] = useState(false);
  const [farmHandoff, setFarmHandoff] = useState(false);
  const flightClock = useSharedValue(0);
  const travel = useSharedValue(0);
  const [owlHint, setOwlHint] = useState("");
  const owlTaps = useRef(0);
  const hintTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (hintTimer.current) clearTimeout(hintTimer.current);
    },
    [],
  );

  const fade = useSharedValue(0);
  const awake = useAnimationActive();
  const reduceMotion = useReducedMotion();
  const closingRef = useRef(false);
  const done = lit >= TOTAL_STARS;
  useEffect(() => { if (done) successHaptic(); }, [done]);
  const owlStage: OwlStage = followingOwl ? "leaving"
    : !done ? "waiting" : owlLanded || reduceMotion ? "perched" : "arriving";
  const landOwl = useCallback(() => setOwlLanded(true), []);
  const travelStyle = useAnimatedStyle(() => ({ opacity: travel.value }));
  useEffect(() => {
    if (!done || owlLanded || reduceMotion || closingRef.current) return;
    flightClock.value = 0;
    flightClock.value = withDelay(340, withTiming(
      ARRIVAL_MS,
      { duration: ARRIVAL_MS, easing: Easing.linear },
      (finished) => { if (finished) runOnJS(landOwl)(); },
    ));
  }, [done, flightClock, landOwl, owlLanded, reduceMotion]);

  useEffect(() => () => {
    cancelAnimation(flightClock);
    cancelAnimation(travel);
  }, [flightClock, travel]);

  const fadeStyle = useAnimatedStyle(() => ({ opacity: fade.value }));
  const sceneStyle = useAnimatedStyle(() => ({
    transform: [
      { scale: reduceMotion ? 1 : 1.045 - fade.value * 0.045 + travel.value * 0.06 },
      { translateX: reduceMotion ? 0 : -travel.value * 14 },
    ],
  }));
  const panelStyle = useAnimatedStyle(() => ({
    opacity: Math.max(0, (fade.value - 0.2) / 0.8),
    transform: [{ translateY: reduceMotion ? 0 : (1 - fade.value) * 32 }],
  }));

  useEffect(() => {
    if (closingRef.current) return;
    fade.value = withTiming(1, {
      duration: reduceMotion ? 180 : 780,
      easing: Easing.out(Easing.cubic),
    });
    return () => cancelAnimation(fade);
  }, [fade, reduceMotion]);

  // 记录来访次数，让这片夜空记得你
  useEffect(() => {
    let alive = true;
    AsyncStorage.getItem(VISIT_KEY)
      .then((raw) => {
        const next = (Number(raw) || 0) + 1;
        if (!alive) return;
        setVisits(next);
        AsyncStorage.setItem(VISIT_KEY, String(next)).catch(() => {});
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);

  const close = useCallback(() => {
    if (closingRef.current) return;
    closingRef.current = true;
    setClosing(true);
    cancelAnimation(flightClock);
    fade.value = withTiming(
      0,
      { duration: reduceMotion ? 150 : 420, easing: Easing.inOut(Easing.cubic) },
      (finished) => {
        if (finished) runOnJS(onClose)();
      },
    );
  }, [fade, flightClock, onClose, reduceMotion]);

  useEffect(() => {
    const subscription = BackHandler.addEventListener("hardwareBackPress", () => { close(); return true; });
    return () => subscription.remove();
  }, [close]);

  const openFarm = useCallback(() => {
    if (!onEnterFarm) {
      onClose();
      return;
    }
    setFarmHandoff(true);
    onEnterFarm();
    // Leave the opaque cover in place while the destination screen mounts.
    fade.value = withDelay(600, withTiming(0, { duration: 0 }, (finished) => {
      if (finished) runOnJS(onClose)();
    }));
  }, [fade, onClose, onEnterFarm]);

  const enterFarm = useCallback(() => {
    if (closingRef.current) return;
    closingRef.current = true;
    setClosing(true);
    setOwlHint("");
    setFollowingOwl(true);
    flightClock.value = 0;
    if (!reduceMotion) {
      flightClock.value = withTiming(DEPARTURE_MS, {
        duration: DEPARTURE_MS,
        easing: Easing.linear,
      });
    }
    travel.value = withDelay(reduceMotion ? 0 : DEPARTURE_MS - 190, withTiming(
      1,
      { duration: reduceMotion ? 150 : 430, easing: Easing.inOut(Easing.cubic) },
      (finished) => { if (finished) runOnJS(openFarm)(); },
    ));
  }, [flightClock, openFarm, reduceMotion, travel]);

  const labels = (courseNames.some((name) => name.trim()) ? courseNames : ["", ""])
    .map((n) => n.trim())
    .slice(0, 2);

  const compact = h < 740;
  const moonSize = compact ? 76 : 104;
  const moonTop = insets.top + 34;
  const moonRight = 26;
  const moonCx = w - moonRight - moonSize / 2;
  const moonCy = moonTop + moonSize / 2;
  const owlLeft = Math.max(12, w - moonRight - 102);
  const owlTop = moonTop + moonSize - 5;
  const branchWidth = w - owlLeft + 76;
  const skyTop = owlTop + 109;
  // Reserve space for the achievement before the seventh star is picked.
  const skyBottom = Math.max(skyTop + 24, h - insets.bottom - panelHeight - (done ? 0 : 38) - (compact ? 32 : 46));
  const starY = (y: number) => skyTop + y * (skyBottom - skyTop);
  const constellation = SPOTS.filter((_, i) => picked[i]);

  return (
    <NightMotion.Provider value={awake && !reduceMotion && !farmHandoff}><Animated.View
      accessibilityViewIsModal
      style={[
        {
          position: "absolute",
          left: 0,
          right: 0,
          top: 0,
          bottom: 0,
          zIndex: 60,
          overflow: "hidden",
        },
        fadeStyle,
      ]}
    >
      <StatusBar style="light" />

      <LinearGradient
        colors={["#03060F", "#071022", "#0E1A33"]}
        start={{ x: 0.2, y: 0 }}
        end={{ x: 0.85, y: 1 }}
        style={{ position: "absolute", left: 0, right: 0, top: 0, bottom: 0 }}
      />
      <Animated.Image
        pointerEvents="none"
        source={require("../../assets/images/night-forest-v2.png")}
        resizeMode="cover"
        fadeDuration={0}
        style={[{ position: "absolute", width: w, height: h, opacity: 0.68 }, sceneStyle]}
      />
      <LinearGradient pointerEvents="none" colors={["rgba(3,6,15,0.1)", "transparent", "rgba(3,6,15,0.68)"]}
        style={{ position: "absolute", width: w, height: h }} />

      {/* 地平线处的冷光 */}
      <View
        pointerEvents="none"
        style={{
          position: "absolute",
          bottom: -180,
          left: -60,
          width: w * 0.95,
          height: w * 0.95,
          borderRadius: w,
          backgroundColor: "rgba(56,189,248,0.06)",
        }}
      />

      <Svg pointerEvents="none" width={w} height={h} style={{ position: "absolute" }}>
        {DOTS.filter((dot) => dot.id % 4 !== 0).map((dot) => (
          <Circle key={dot.id} cx={dot.x * w} cy={dot.y * h} r={dot.r}
            fill="#E0F2FE" opacity={0.16 + (dot.id % 5) * 0.10} />
        ))}
      </Svg>
      {DOTS.filter((dot) => dot.id % 4 === 0).map((d) => (
        <Twinkle
          key={d.id}
          x={d.x}
          y={d.y}
          r={d.r}
          delay={d.delay}
          dur={d.dur}
        />
      ))}

      <Moon lit={lit} top={moonTop} right={moonRight} size={moonSize} />

      {labels.map((name, i) => (
        <ShootingStar
          key={`${name}-${i}`}
          w={w}
          delay={900 + i * 2400}
          label={name}
          top={insets.top + 128 + i * 96}
        />
      ))}

      {/* 标题 */}
      <View
        pointerEvents="none"
        style={{ position: "absolute", left: 24, top: insets.top + 26 }}
      >
        <Text
          style={{
            color: "rgba(125,211,252,0.8)",
            fontSize: 10,
            fontWeight: "700",
            letterSpacing: 4,
          }}
        >
          NOCTURNE
        </Text>
        <Text
          style={{
            color: "rgba(226,232,240,0.42)",
            fontSize: 11,
            marginTop: 7,
          }}
        >
          {`第 ${visits} 次夜航`}
        </Text>
      </View>

      <Svg pointerEvents="none" width={w} height={h} style={{ position: "absolute" }}>
        {!done && constellation.length > 1 ? <Path
          d={constellation.map((s, i) => `${i ? "L" : "M"}${s.x * w} ${starY(s.y)}`).join(" ")}
          stroke="rgba(186,211,255,0.35)" strokeWidth="1" strokeDasharray="3 6" fill="none"
        /> : null}
        {constellation.map((s) => <Circle key={`${s.x}-${s.y}`} cx={s.x * w} cy={starY(s.y)} r="2.5" fill="#FDE9B2" />)}
      </Svg>
      {SPOTS.map((s, i) => (
        <CollectStar
          key={i}
          x={s.x}
          y={starY(s.y) / h}
          s={s.s}
          w={w}
          h={h}
          collected={picked[i]}
          onCollect={() => {
            if (closingRef.current) return;
            tapHaptic();

            setPicked((prev) =>
              prev[i] ? prev : prev.map((v, idx) => (idx === i ? true : v)),
            );
          }}
        />
      ))}

      {done ? (
        <>
          <ConstellationReveal points={SPOTS.map((spot) => ({ x: spot.x * w, y: starY(spot.y) }))} width={w} height={h} />
          <Burst cx={moonCx} cy={moonCy} />
        </>
      ) : null}
      <Image source={OWL_BRANCH} pointerEvents="none" resizeMode="stretch" fadeDuration={0}
        style={{ position: "absolute", right: 0, top: owlTop + 77 - branchWidth * 0.15, width: branchWidth, height: branchWidth / 3, zIndex: 4 }} />
      <OwlFlight stage={reduceMotion ? "waiting" : owlStage} elapsed={flightClock}
        x={owlLeft + 40} y={owlTop + 43} screenWidth={w} insetTop={insets.top} />
      {owlStage === "perched" ? (
        <Owl
          left={owlLeft}
          top={owlTop}
          hint={owlHint || undefined}
          onTap={() => {
            const n = owlTaps.current + 1;
            owlTaps.current = n;
            // 前几次都只是对话，最后一次呼唤它才肯带路
            if (n >= OWL_TAPS_NEEDED) {
              thumpHaptic();
              enterFarm();
              return;
            }
            tapHaptic();
            setOwlHint(OWL_LINES[n - 1] ?? "");
            if (hintTimer.current) clearTimeout(hintTimer.current);
            hintTimer.current = setTimeout(() => setOwlHint(""), 3000);
          }}
        />
      ) : null}

      {/* 底部信息面板 */}
      <Animated.View
        onLayout={(event) => setPanelHeight(event.nativeEvent.layout.height)}
        style={[{
          position: "absolute",
          left: w < 380 ? 14 : 22,
          right: w < 380 ? 14 : 22,
          bottom: insets.bottom + (compact ? 12 : 24),
        }, panelStyle]}
      >
        <View
          style={{
            borderRadius: 26,
            overflow: "hidden",
            borderWidth: 1,
            borderColor: "rgba(194,204,255,0.18)",
            backgroundColor: "rgba(12,17,36,0.94)",
            paddingHorizontal: compact ? 16 : 20,
            paddingVertical: compact ? 12 : 16,
          }}
        >
          <Image pointerEvents="none" source={require("../../assets/images/night-letter-bg.png")}
            resizeMode="cover" fadeDuration={0}
            style={{ position: "absolute", left: 0, right: 0, top: 0, bottom: 0, width: "100%", height: "100%" }} />
          <LinearGradient pointerEvents="none" colors={["rgba(7,12,30,0.24)", "rgba(7,12,30,0.38)"]}
            style={{ position: "absolute", left: 0, right: 0, top: 0, bottom: 0 }} />
          <View className="flex-row items-center justify-between">
            <Text
              style={{
                color: "rgba(125,211,252,0.85)",
                fontSize: 9,
                fontWeight: "700",
                letterSpacing: 3,
              }}
            >
              STARRY LETTER
            </Text>
            <View className="flex-row items-center" style={{ gap: 5 }}>
              {Array.from({ length: TOTAL_STARS }).map((_, i) => (
                <AtlasSprite key={i} source={NIGHT_SPRITES} columns={3} rows={2}
                  column={picked[i] ? 0 : 1} row={0} width={14} />
              ))}
            </View>
          </View>

          <NightSkyMessage closing={closing} />

          {done ? (
            <View
              style={{
                marginTop: 12,
                alignSelf: "flex-start",
                borderRadius: 999,
                borderWidth: 1,
                borderColor: "rgba(252,211,77,0.35)",
                backgroundColor: "rgba(252,211,77,0.12)",
                paddingHorizontal: 12,
                paddingVertical: 5,
              }}
            >
              <Text
                style={{
                  color: "#FCD34D",
                  fontSize: 10.5,
                  fontWeight: "700",
                  letterSpacing: 1,
                }}
              >
                成就解锁 · 拾星人
              </Text>
            </View>
          ) : null}

          <View
            className="flex-row items-center justify-between"
            style={{ marginTop: 14 }}
          >
            <Text style={{ flex: 1, marginRight: 12, lineHeight: 17, color: "rgba(179,197,220,0.9)", fontSize: 11 }}>
              {done
                ? owlStage === "perched"
                  ? "猫头鹰落在枝头，轻点它说说话"
                  : owlStage === "leaving"
                    ? "跟着猫头鹰，沿着夜色去星露坡"
                    : "星光点亮了枝头 · 有个小家伙正在飞来"
                : lit === 0
                  ? "轻点散落的星光，把它们收进口袋"
                  : `拾起散落的星 · ${lit} / ${TOTAL_STARS}`}
            </Text>
            <Pressable
              accessibilityRole="button"
              disabled={closing}
              onPress={() => {
                tapHaptic();
                close();
              }}
              style={{
                minHeight: 44,
                justifyContent: "center",
                borderRadius: 999,
                backgroundColor: "rgba(186,211,255,0.14)",
                borderWidth: 1,
                borderColor: "rgba(186,211,255,0.22)",
                paddingHorizontal: 16,
                paddingVertical: 8,
              }}
            >
              <Text
                style={{ color: "#DCE9FF", fontSize: 12, fontWeight: "700" }}
              >
                回到现实
              </Text>
            </Pressable>
          </View>
        </View>
      </Animated.View>
      <Animated.View pointerEvents="none" style={[{
        position: "absolute", top: 0, right: 0, bottom: 0, left: 0,
        backgroundColor: "#081224", zIndex: 12,
      }, travelStyle]} />
    </Animated.View></NightMotion.Provider>
  );
}
