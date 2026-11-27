/* eslint-disable react-hooks/immutability --
   Reanimated 共享值（breathe/drift/t/v/p/grow/halo/pulse/scale/opacity/glow/ripple/bump/progress 等）
   本质是跨渲染、跨线程可变的容器，在 effect 与手势中赋值是官方标准用法，React 编译器的不可变假设不适用 */

import { LinearGradient } from "expo-linear-gradient";
import {
  createContext,
  memo,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import {
  Image,
  Pressable,
  Text,
  View,
  type GestureResponderEvent,
} from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, {
  Easing,
  cancelAnimation,
  runOnJS,
  useAnimatedProps,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withSpring,
  withTiming,
  type SharedValue,
} from "react-native-reanimated";
import Svg, {
  Circle,
  Defs,
  Ellipse,
  G,
  Path,
  RadialGradient,
  Stop,
} from "react-native-svg";

import { AtlasSprite } from "@/components/AtlasSprite";
import {
  TOTAL_STARS,
  type ConstellationDef,
  type MoonPhaseInfo,
} from "@/utils/nightSkyData";

export const NightMotion = createContext(true);

export const STAR_TINTS = [
  "#E0F2FE",
  "#E0F2FE",
  "#E0F2FE",
  "#F8FAFC",
  "#FDE68A",
  "#DDD6FE",
] as const;

export function seededDots(count: number) {
  let seed = 20261021;
  const rnd = () => {
    seed = (seed * 1664525 + 1013904223) % 4294967296;
    return seed / 4294967296;
  };
  return Array.from({ length: count }, (_, i) => ({
    id: i,
    x: rnd(),
    y: rnd() * 0.9,
    r: 0.6 + rnd() * 1.45,
    delay: rnd() * 2800,
    dur: 1500 + rnd() * 2400,
    color: STAR_TINTS[Math.floor(rnd() * STAR_TINTS.length)],
    cross: i % 13 === 2,
  }));
}

export function seededFireflies(count: number) {
  let seed = 20261127;
  const rnd = () => {
    seed = (seed * 1664525 + 1013904223) % 4294967296;
    return seed / 4294967296;
  };
  return Array.from({ length: count }, (_, i) => ({
    id: i,
    x: 0.08 + rnd() * 0.84,
    y: 0.72 + rnd() * 0.2,
    size: 2.4 + rnd() * 1.6,
    dx: (rnd() - 0.5) * 28,
    dy: -(8 + rnd() * 16),
    delay: rnd() * 2400,
    dur: 2600 + rnd() * 2200,
  }));
}

export const DOTS = seededDots(64);
export const FIREFLIES = seededFireflies(10);

export const MOON_ATLAS = require("../../../assets/images/night-moon-phases.png");
export const NIGHT_SPRITES = require("../../../assets/images/night-sprites-v2.png");
export const STAR_LUMINOUS = require("../../../assets/images/night-star-luminous.webp");

export const INITIAL_DRAG_COORDS: number[] = [
  -999, -999, -999, -999, -999, -999, -999, -999,
  -999, -999, -999, -999, -999, -999, -999, -999,
];
export const STAR_HIT_RADIUS_SQ = 34 * 34;
export const MAX_RECENT_NOTES = 8;
export const BLOOD_MOON_WINDOW_MS = 5000;
export const BLOOD_MOON_TAPS = 7;

export interface SkyRippleItem {
  id: number;
  x: number;
  y: number;
}

/* -------------------------------------------------------------------------- */
/*  极光微息层 & 林间流萤（仅标准/精美画质且非减弱动态时启用）                   */
/* -------------------------------------------------------------------------- */

export const AuroraVeil = memo(function AuroraVeil({
  w,
  h,
  rich,
  auroraPrimary = "#38BDF8",
  auroraSecondary = "#C084FC",
}: {
  w: number;
  h: number;
  rich: boolean;
  auroraPrimary?: string;
  auroraSecondary?: string;
}) {
  const breathe = useSharedValue(0);
  const drift = useSharedValue(0);
  const motion = useContext(NightMotion);

  useEffect(() => {
    if (!motion) {
      breathe.value = 0.5;
      drift.value = 0;
      return;
    }
    breathe.value = withRepeat(
      withSequence(
        withTiming(1, { duration: 4800, easing: Easing.inOut(Easing.sin) }),
        withTiming(0.25, { duration: 4800, easing: Easing.inOut(Easing.sin) }),
      ),
      -1,
    );
    drift.value = withRepeat(
      withSequence(
        withTiming(1, { duration: 9200, easing: Easing.inOut(Easing.sin) }),
        withTiming(-1, { duration: 9200, easing: Easing.inOut(Easing.sin) }),
      ),
      -1,
    );
    return () => {
      cancelAnimation(breathe);
      cancelAnimation(drift);
    };
  }, [breathe, drift, motion]);

  const veilStyle = useAnimatedStyle(() => ({
    opacity: 0.42 + breathe.value * (rich ? 0.42 : 0.28),
    transform: [{ translateX: drift.value * 18 }],
  }));

  return (
    <Animated.View
      pointerEvents="none"
      style={[
        {
          position: "absolute",
          left: -28,
          top: -20,
          width: w + 56,
          height: h * 0.54,
        },
        veilStyle,
      ]}
    >
      <Svg width="100%" height="100%" viewBox="0 0 400 260" preserveAspectRatio="none">
        <Defs>
          <RadialGradient id="auroraCyan" cx="28%" cy="34%" r="55%">
            <Stop offset="0" stopColor={auroraPrimary} stopOpacity={rich ? 0.16 : 0.11} />
            <Stop offset="0.55" stopColor="#6366F1" stopOpacity={rich ? 0.08 : 0.05} />
            <Stop offset="1" stopColor="#071022" stopOpacity={0} />
          </RadialGradient>
          <RadialGradient id="auroraViolet" cx="74%" cy="22%" r="50%">
            <Stop offset="0" stopColor={auroraSecondary} stopOpacity={rich ? 0.14 : 0.09} />
            <Stop offset="0.6" stopColor={auroraPrimary} stopOpacity={0.05} />
            <Stop offset="1" stopColor="#071022" stopOpacity={0} />
          </RadialGradient>
        </Defs>
        <Ellipse cx="115" cy="95" rx="185" ry="96" fill="url(#auroraCyan)" />
        <Ellipse cx="295" cy="68" rx="160" ry="86" fill="url(#auroraViolet)" />
      </Svg>
    </Animated.View>
  );
});

export const FireflyDot = memo(function FireflyDot({
  x,
  y,
  size,
  dx,
  dy,
  delay,
  dur,
  w,
  h,
}: {
  x: number;
  y: number;
  size: number;
  dx: number;
  dy: number;
  delay: number;
  dur: number;
  w: number;
  h: number;
}) {
  const t = useSharedValue(0);
  const motion = useContext(NightMotion);

  useEffect(() => {
    if (!motion) {
      t.value = 0;
      return;
    }
    t.value = withDelay(
      delay,
      withRepeat(
        withSequence(
          withTiming(1, { duration: dur, easing: Easing.inOut(Easing.sin) }),
          withTiming(0, { duration: dur, easing: Easing.inOut(Easing.sin) }),
        ),
        -1,
      ),
    );
    return () => cancelAnimation(t);
  }, [delay, dur, motion, t]);

  const style = useAnimatedStyle(() => {
    const p = t.value;
    return {
      opacity: Math.sin(p * Math.PI) * 0.72,
      transform: [
        { translateX: p * dx },
        { translateY: p * dy },
        { scale: 0.7 + Math.sin(p * Math.PI) * 0.45 },
      ],
    };
  });

  return (
    <Animated.View
      pointerEvents="none"
      style={[
        {
          position: "absolute",
          left: x * w,
          top: y * h,
          width: size * 3,
          height: size * 3,
          alignItems: "center",
          justifyContent: "center",
        },
        style,
      ]}
    >
      <View
        style={{
          position: "absolute",
          width: size * 3,
          height: size * 3,
          borderRadius: size * 1.5,
          backgroundColor: "rgba(253,230,138,0.22)",
        }}
      />
      <View
        style={{
          width: size,
          height: size,
          borderRadius: size / 2,
          backgroundColor: "#FEF08A",
        }}
      />
    </Animated.View>
  );
});

/* -------------------------------------------------------------------------- */
/*  背景微光星点：各自呼吸闪烁                                                 */
/* -------------------------------------------------------------------------- */

export const Twinkle = memo(function Twinkle({
  x,
  y,
  r,
  delay,
  dur,
  color,
}: {
  x: number;
  y: number;
  r: number;
  delay: number;
  dur: number;
  color: string;
}) {
  const v = useSharedValue(0.18);
  const motion = useContext(NightMotion);

  useEffect(() => {
    if (!motion) {
      v.value = 0.36;
      return;
    }
    v.value = withDelay(
      delay,
      withRepeat(
        withSequence(
          withTiming(0.95, { duration: dur, easing: Easing.inOut(Easing.sin) }),
          withTiming(0.14, { duration: dur, easing: Easing.inOut(Easing.sin) }),
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
          backgroundColor: color,
        },
        style,
      ]}
    />
  );
});

/* -------------------------------------------------------------------------- */
/*  拾满星后的星屑爆发（播完自动卸载）                                         */
/* -------------------------------------------------------------------------- */

export function BurstDot({
  dx,
  dy,
  delay,
  color = "#FDE68A",
}: {
  dx: number;
  dy: number;
  delay: number;
  color?: string;
}) {
  const t = useSharedValue(0);
  const motion = useContext(NightMotion);

  useEffect(() => {
    if (!motion) {
      t.value = 1;
      return;
    }
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
          backgroundColor: color,
        },
        style,
      ]}
    />
  );
}

export function Burst({ cx, cy }: { cx: number; cy: number }) {
  const [visible, setVisible] = useState(true);
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

  useEffect(() => {
    const timer = setTimeout(() => setVisible(false), 1100);
    return () => clearTimeout(timer);
  }, []);

  if (!visible) return null;

  return (
    <View
      pointerEvents="none"
      style={{
        position: "absolute",
        left: cx,
        top: cy,
        width: 1,
        height: 1,
        zIndex: 5,
      }}
    >
      {dots.map((d) => (
        <BurstDot key={d.id} dx={d.dx} dy={d.dy} delay={d.delay} />
      ))}
    </View>
  );
}

/* -------------------------------------------------------------------------- */
/*  指尖触控星尘涟漪 + 许愿流星                                                */
/* -------------------------------------------------------------------------- */

export const SkyTapRipple = memo(function SkyTapRipple({
  x,
  y,
}: {
  x: number;
  y: number;
}) {
  const t = useSharedValue(0);
  const motion = useContext(NightMotion);

  useEffect(() => {
    if (!motion) {
      t.value = 1;
      return;
    }
    t.value = withTiming(1, {
      duration: 860,
      easing: Easing.out(Easing.cubic),
    });
    return () => cancelAnimation(t);
  }, [motion, t]);

  const ringStyle = useAnimatedStyle(() => ({
    opacity: (1 - t.value) * 0.55,
    transform: [{ scale: 0.25 + t.value * 1.9 }],
  }));

  return (
    <View
      pointerEvents="none"
      style={{
        position: "absolute",
        left: x - 26,
        top: y - 26,
        width: 52,
        height: 52,
        alignItems: "center",
        justifyContent: "center",
        zIndex: 2,
      }}
    >
      <Animated.View
        style={[
          {
            width: 44,
            height: 44,
            borderRadius: 22,
            borderWidth: 1,
            borderColor: "rgba(186,230,253,0.75)",
          },
          ringStyle,
        ]}
      />
      {[0, 1, 2, 3].map((i) => (
        <BurstDot
          key={i}
          dx={Math.cos((i * Math.PI) / 2 + Math.PI / 4) * 26}
          dy={Math.sin((i * Math.PI) / 2 + Math.PI / 4) * 26}
          delay={i * 18}
          color="#BAE6FD"
        />
      ))}
    </View>
  );
});

export const WishMeteor = memo(function WishMeteor({
  token,
  w,
  top,
}: {
  token: number;
  w: number;
  top: number;
}) {
  const p = useSharedValue(0);
  const active = useSharedValue(0);
  const reduceMotion = useReducedMotion();

  useEffect(() => {
    if (token <= 0 || reduceMotion) return;
    p.value = 0;
    active.value = 1;
    p.value = withTiming(
      1,
      { duration: 1180, easing: Easing.out(Easing.quad) },
      (finished) => {
        if (finished) active.value = 0;
      },
    );
    return () => {
      cancelAnimation(p);
      cancelAnimation(active);
    };
  }, [active, p, reduceMotion, token]);

  const style = useAnimatedStyle(() => {
    const prog = p.value;
    const vis = active.value;
    const opacity =
      vis === 0
        ? 0
        : prog < 0.14
          ? prog / 0.14
          : prog > 0.65
            ? (1 - prog) / 0.35
            : 1;
    return {
      opacity,
      transform: [
        { translateX: -240 + prog * (w + 520) },
        { translateY: top + prog * (w + 520) * 0.25 },
        { rotate: "14deg" },
      ],
    };
  });

  if (token <= 0 || reduceMotion) return null;

  return (
    <Animated.View
      pointerEvents="none"
      style={[
        { position: "absolute", flexDirection: "row", alignItems: "center", zIndex: 5 },
        style,
      ]}
    >
      <LinearGradient
        colors={[
          "rgba(253,230,138,0)",
          "rgba(253,230,138,0.5)",
          "rgba(255,251,235,0.95)",
        ]}
        start={{ x: 0, y: 0.5 }}
        end={{ x: 1, y: 0.5 }}
        style={{
          width: 196,
          height: 2.6,
          borderRadius: 2,
        }}
      />
      <View
        style={{
          width: 6,
          height: 6,
          borderRadius: 3,
          backgroundColor: "#FFFBEB",
          marginLeft: -2,
        }}
      />
      <View
        style={{
          position: "absolute",
          right: -10,
          width: 24,
          height: 24,
          borderRadius: 12,
          backgroundColor: "rgba(253,230,138,0.28)",
        }}
      />
    </Animated.View>
  );
});

/* -------------------------------------------------------------------------- */
/*  课程流星：去重轮播所有真实课程名，轻点课程流星可触发彩蛋寄放提示             */
/* -------------------------------------------------------------------------- */

export const ShootingStar = memo(function ShootingStar({
  w,
  laneIndex,
  baseTop,
  coursePool,
  onPop,
}: {
  w: number;
  laneIndex: number;
  baseTop: number;
  coursePool: readonly string[];
  onPop?: (label: string, x: number, y: number) => void;
}) {
  const t = useSharedValue(0);
  const popped = useSharedValue(0);
  const [pass, setPass] = useState(0);
  const [poppedPass, setPoppedPass] = useState(-1);
  const reduceMotion = useReducedMotion();
  const motion = useContext(NightMotion);

  const advance = useCallback(() => {
    setPass((prev) => prev + 1);
  }, []);

  useEffect(() => {
    if (reduceMotion || !motion) {
      t.value = 0;
      popped.value = 0;
      return;
    }
    const waitMs =
      pass === 0
        ? 950 + laneIndex * 2600
        : 3600 + ((pass * 1370 + laneIndex * 1900) % 3400);
    const flyMs = 1420 + ((pass + laneIndex) % 3) * 180;
    popped.value = 0;
    t.value = 0;
    t.value = withDelay(
      waitMs,
      withTiming(
        1,
        { duration: flyMs, easing: Easing.linear },
        (finished) => {
          if (finished) runOnJS(advance)();
        },
      ),
    );
    return () => {
      cancelAnimation(t);
      cancelAnimation(popped);
    };
  }, [advance, laneIndex, motion, pass, popped, reduceMotion, t]);

  const label =
    coursePool.length > 0
      ? coursePool[(laneIndex + pass * 2) % coursePool.length]
      : "";
  const topOffset = baseTop + (((pass * 37 + laneIndex * 23) % 54) - 22);
  const warmTint = (pass + laneIndex) % 3 === 2;
  const isTappable = Boolean(label) && poppedPass !== pass && !reduceMotion && motion;

  const handlePop = useCallback(
    (event: GestureResponderEvent) => {
      if (!label || poppedPass === pass) return;
      popped.value = 1;
      setPoppedPass(pass);
      const x = event.nativeEvent.pageX ?? event.nativeEvent.locationX;
      const y = event.nativeEvent.pageY ?? event.nativeEvent.locationY;
      onPop?.(
        label,
        Number.isFinite(x) ? x : w * 0.5,
        Number.isFinite(y) ? y : topOffset,
      );
    },
    [label, onPop, pass, popped, poppedPass, topOffset, w],
  );

  const style = useAnimatedStyle(() => {
    const p = t.value;
    const hidden = popped.value > 0.5 || p <= 0 || p >= 1;
    const opacity = hidden
      ? 0
      : p < 0.12
        ? p / 0.12
        : p > 0.62
          ? (1 - p) / 0.38
          : 1;
    return {
      opacity,
      transform: [
        { translateX: hidden ? -9999 : -300 + p * (w + 540) },
        { translateY: hidden ? -9999 : topOffset + p * (w + 540) * 0.27 },
        { rotate: "15.1deg" },
      ],
    };
  });

  const streakContent = (
    <>
      {label ? (
        <Text
          style={{
            color: warmTint
              ? "rgba(253,230,138,0.52)"
              : "rgba(224,242,254,0.48)",
            fontSize: 9,
            letterSpacing: 1.5,
            marginRight: 7,
          }}
        >
          {label}
        </Text>
      ) : null}
      <LinearGradient
        colors={
          warmTint
            ? ["rgba(253,230,138,0)", "rgba(253,230,138,0.78)"]
            : ["rgba(224,242,254,0)", "rgba(186,230,253,0.82)"]
        }
        start={{ x: 0, y: 0.5 }}
        end={{ x: 1, y: 0.5 }}
        style={{
          width: 146,
          height: 2,
          borderRadius: 1,
        }}
      />
      <View
        style={{
          width: 4,
          height: 4,
          borderRadius: 2,
          backgroundColor: warmTint ? "#FFFBEB" : "#F0F9FF",
          marginLeft: -1,
        }}
      />
      <View
        pointerEvents="none"
        style={{
          position: "absolute",
          right: -6,
          width: 16,
          height: 16,
          borderRadius: 8,
          backgroundColor: warmTint
            ? "rgba(253,230,138,0.2)"
            : "rgba(186,230,253,0.18)",
        }}
      />
    </>
  );

  return (
    <Animated.View
      pointerEvents={isTappable ? "box-none" : "none"}
      style={[
        {
          position: "absolute",
          flexDirection: "row",
          alignItems: "center",
          zIndex: isTappable ? 5 : 2,
        },
        style,
      ]}
    >
      {isTappable ? (
        <Pressable
          onPress={handlePop}
          hitSlop={14}
          accessibilityRole="button"
          accessibilityLabel={`轻点课程流星 ${label}`}
          style={{ flexDirection: "row", alignItems: "center" }}
        >
          {streakContent}
        </Pressable>
      ) : (
        streakContent
      )}
    </Animated.View>
  );
});

/* -------------------------------------------------------------------------- */
/*  月亮：真实月相、随拾星数渐盈增辉，轻点查月相笺，连点 7 次触发血月月蚀       */
/* -------------------------------------------------------------------------- */

export const Moon = memo(function Moon({
  lit,
  top,
  right,
  size,
  phaseInfo,
  bloodMoon,
  locked = false,
  onInspect,
}: {
  lit: number;
  top: number;
  right: number;
  size: number;
  phaseInfo: MoonPhaseInfo;
  bloodMoon: boolean;
  locked?: boolean;
  onInspect: (info: MoonPhaseInfo) => void;
}) {
  const grow = useSharedValue(0.55);
  const halo = useSharedValue(0.6);
  const pulse = useSharedValue(0);
  const motion = useContext(NightMotion);
  const reduceMotion = useReducedMotion();

  // 随拾星进度 0..7 平滑放大月轮（1.0 -> 1.09）
  useEffect(() => {
    const targetScale = 1 + (Math.min(TOTAL_STARS, lit) / TOTAL_STARS) * 0.09;
    if (!motion || reduceMotion) {
      grow.value = targetScale;
      return;
    }
    grow.value = withSpring(targetScale, { damping: 16, stiffness: 95 });
    return () => cancelAnimation(grow);
  }, [grow, lit, motion, reduceMotion]);

  useEffect(() => {
    if (!motion) {
      halo.value = 0.65;
      return;
    }
    halo.value = withRepeat(
      withSequence(
        withTiming(1, { duration: 2800, easing: Easing.inOut(Easing.sin) }),
        withTiming(0.52, { duration: 2800, easing: Easing.inOut(Easing.sin) }),
      ),
      -1,
    );
    return () => cancelAnimation(halo);
  }, [halo, motion]);

  useEffect(() => () => cancelAnimation(pulse), [pulse]);

  const growStyle = useAnimatedStyle(() => ({
    transform: [{ scale: grow.value }],
  }));
  const haloStyle = useAnimatedStyle(() => ({ opacity: halo.value }));
  const pulseStyle = useAnimatedStyle(() => ({
    opacity: pulse.value > 0 ? (1 - pulse.value) * 0.55 : 0,
    transform: [{ scale: 0.72 + pulse.value * 1.15 }],
  }));

  const isNewMoon = phaseInfo.index === 0;
  const bright =
    phaseInfo.haloStrength * (0.48 + (Math.min(TOTAL_STARS, lit) / TOTAL_STARS) * 0.52);

  const handlePress = useCallback(() => {
    if (locked || bloodMoon) return;
    if (motion && !reduceMotion) {
      pulse.value = 0;
      pulse.value = withTiming(1, {
        duration: 780,
        easing: Easing.out(Easing.cubic),
      });
    }
    onInspect(phaseInfo);
  }, [bloodMoon, locked, motion, onInspect, phaseInfo, pulse, reduceMotion]);

  return (
    <Animated.View
      style={[
        {
          position: "absolute",
          top,
          right,
          width: size,
          height: size,
          alignItems: "center",
          justifyContent: "center",
          zIndex: 5,
        },
        growStyle,
      ]}
    >
      <Animated.View
        pointerEvents="none"
        style={[
          { position: "absolute", width: size * 3, height: size * 3 },
          haloStyle,
        ]}
      >
        <Svg width="100%" height="100%" viewBox="0 0 100 100">
          <Defs>
            <RadialGradient id="moonAtmosphere" cx="50%" cy="50%" r="50%">
              <Stop
                offset="0"
                stopColor={
                  bloodMoon ? "#F87171" : isNewMoon ? "#93C5FD" : "#E9D2B2"
                }
                stopOpacity={
                  bloodMoon
                    ? 0.34 * Math.max(0.55, bright)
                    : (isNewMoon ? 0.2 : 0.26) * bright
                }
              />
              <Stop
                offset="0.4"
                stopColor={
                  bloodMoon ? "#EF4444" : isNewMoon ? "#818CF8" : "#B6A0CE"
                }
                stopOpacity={
                  bloodMoon ? 0.18 * Math.max(0.55, bright) : 0.12 * bright
                }
              />
              <Stop
                offset="1"
                stopColor={bloodMoon ? "#7F1D1D" : "#8F9BCD"}
                stopOpacity={0}
              />
            </RadialGradient>
          </Defs>
          <Circle cx="50" cy="50" r="50" fill="url(#moonAtmosphere)" />
        </Svg>
      </Animated.View>
      <Animated.View
        pointerEvents="none"
        style={[
          {
            position: "absolute",
            width: size * 1.15,
            height: size * 1.15,
            borderRadius: size,
            borderWidth: 1,
            borderColor: bloodMoon
              ? "rgba(248,113,113,0.78)"
              : isNewMoon
                ? "rgba(147,197,253,0.72)"
                : "rgba(253,230,138,0.72)",
          },
          pulseStyle,
        ]}
      />
      <Pressable
        onPress={handlePress}
        hitSlop={12}
        accessibilityRole="button"
        accessibilityLabel={
          bloodMoon
            ? "血月月蚀中，轻点恢复银月"
            : `${phaseInfo.name}，轻点查看今夜月相详情`
        }
        style={{ alignItems: "center", justifyContent: "center" }}
      >
        <AtlasSprite
          source={MOON_ATLAS}
          columns={4}
          rows={2}
          column={phaseInfo.index % 4}
          row={Math.floor(phaseInfo.index / 4)}
          width={size * 0.8}
        />
        {bloodMoon ? (
          <View
            pointerEvents="none"
            style={{
              position: "absolute",
              width: size * 0.78,
              height: size * 0.78,
              borderRadius: size * 0.39,
              backgroundColor: "rgba(239,68,68,0.34)",
              borderWidth: 1,
              borderColor: "rgba(248,113,113,0.45)",
            }}
          />
        ) : null}
      </Pressable>
    </Animated.View>
  );
});

/* -------------------------------------------------------------------------- */
/*  可拾取的星：轻触即拾起，粒子播完即自动卸载释放内存                         */
/* -------------------------------------------------------------------------- */

export const CollectStar = memo(function CollectStar({
  spotIndex,
  x,
  y,
  s,
  w,
  h,
  collected,
  onCollect,
}: {
  spotIndex: number;
  x: number;
  y: number;
  s: number;
  w: number;
  h: number;
  collected: boolean;
  onCollect: (spotIndex: number) => void;
}) {
  const scale = useSharedValue(1);
  const opacity = useSharedValue(1);
  const glow = useSharedValue(0.5);
  const spin = useSharedValue(0);
  const ripple = useSharedValue(0);
  const [burstDone, setBurstDone] = useState(false);
  const reduceMotion = useReducedMotion();
  const motion = useContext(NightMotion);

  useEffect(() => {
    if (!motion || collected) {
      cancelAnimation(glow);
      cancelAnimation(spin);
      return;
    }
    scale.value = 1;
    opacity.value = 1;
    ripple.value = 0;
    const staggerMs = (spotIndex * 290) % 1400;
    const breathMs = 1350 + (spotIndex % 4) * 280;
    glow.value = withDelay(
      staggerMs,
      withRepeat(
        withSequence(
          withTiming(1, {
            duration: breathMs,
            easing: Easing.inOut(Easing.sin),
          }),
          withTiming(0.36, {
            duration: breathMs,
            easing: Easing.inOut(Easing.sin),
          }),
        ),
        -1,
      ),
    );
    spin.value = (spotIndex * 27) % 360;
    spin.value = withRepeat(
      withTiming(spin.value + 360, {
        duration: 9600 + (spotIndex % 3) * 2400,
        easing: Easing.linear,
      }),
      -1,
      false,
    );
    return () => {
      cancelAnimation(glow);
      cancelAnimation(spin);
    };
  }, [glow, spin, spotIndex, motion, collected, opacity, ripple, scale]);

  useEffect(() => {
    if (!collected) return;
    if (!motion) {
      scale.value = 0.25;
      opacity.value = 0;
      ripple.value = 1;
      return;
    }
    cancelAnimation(glow);
    cancelAnimation(spin);
    ripple.value = withTiming(1, {
      duration: reduceMotion ? 180 : 660,
      easing: Easing.out(Easing.cubic),
    });
    scale.value = withSequence(
      withTiming(1.38, { duration: 130 }),
      withTiming(0.25, { duration: 360, easing: Easing.out(Easing.cubic) }),
    );
    opacity.value = withDelay(90, withTiming(0, { duration: 360 }));
    const timer = setTimeout(() => setBurstDone(true), 900);
    return () => {
      clearTimeout(timer);
      cancelAnimation(ripple);
      cancelAnimation(scale);
      cancelAnimation(opacity);
    };
  }, [collected, opacity, scale, glow, spin, ripple, reduceMotion, motion]);

  const wrap = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
    opacity: opacity.value,
  }));
  const halo = useAnimatedStyle(() => ({
    opacity: 0.56 + glow.value * 0.44,
    transform: [{ scale: 0.9 + glow.value * 0.2 }],
  }));
  const flareStyle = useAnimatedStyle(() => ({
    opacity: 0.45 + glow.value * 0.45,
    transform: [{ rotate: `${spin.value}deg` }],
  }));
  const ring = useAnimatedStyle(() => ({
    opacity: collected ? (1 - ripple.value) * 0.8 : 0,
    transform: [{ scale: 0.4 + ripple.value * 2.25 }],
  }));

  const box = s * 2.1;
  const glowSize = s * 3.6;
  const flareSize = s * 2.4;

  return (
    <Animated.View
      pointerEvents={collected ? "none" : "auto"}
      style={{
        position: "absolute",
        left: x * w - box / 2,
        top: y * h - box / 2,
        width: box,
        height: box,
        alignItems: "center",
        justifyContent: "center",
        zIndex: 4,
      }}
    >
      <Animated.View
        pointerEvents="none"
        style={[
          {
            position: "absolute",
            width: box,
            height: box,
            borderRadius: box,
            borderWidth: 1,
            borderColor: "#D8E6FF",
          },
          ring,
        ]}
      />
      {collected && !burstDone && !reduceMotion ? (
        <View
          pointerEvents="none"
          style={{ position: "absolute", left: box / 2, top: box / 2 }}
        >
          {Array.from({ length: 6 }, (_, i) => (
            <BurstDot
              key={i}
              dx={Math.cos((i * Math.PI) / 3) * 38}
              dy={Math.sin((i * Math.PI) / 3) * 38}
              delay={i * 12}
            />
          ))}
        </View>
      ) : null}
      <Animated.View
        style={[{ alignItems: "center", justifyContent: "center" }, wrap]}
      >
        <Animated.View
          pointerEvents="none"
          style={[
            {
              position: "absolute",
              width: glowSize,
              height: glowSize,
            },
            halo,
          ]}
        >
          <Svg width={glowSize} height={glowSize} viewBox="0 0 100 100">
            <Defs>
              <RadialGradient
                id={`collectStarGlow-${spotIndex}`}
                cx="50%"
                cy="50%"
                r="50%"
              >
                <Stop offset="0" stopColor="#FFFDF5" stopOpacity={0.72} />
                <Stop offset="0.22" stopColor="#FDE68A" stopOpacity={0.42} />
                <Stop offset="0.52" stopColor="#BAE6FD" stopOpacity={0.14} />
                <Stop offset="0.8" stopColor="#93C5FD" stopOpacity={0.04} />
                <Stop offset="1" stopColor="#93C5FD" stopOpacity={0} />
              </RadialGradient>
            </Defs>
            <Circle cx="50" cy="50" r="50" fill={`url(#collectStarGlow-${spotIndex})`} />
          </Svg>
        </Animated.View>

        <Animated.View
          pointerEvents="none"
          style={[
            {
              position: "absolute",
              width: flareSize,
              height: flareSize,
            },
            flareStyle,
          ]}
        >
          <Svg width={flareSize} height={flareSize} viewBox="0 0 100 100">
            <Path
              d="M50 6 L52.2 47.8 L94 50 L52.2 52.2 L50 94 L47.8 52.2 L6 50 L47.8 47.8 Z"
              fill="#FFFBEB"
              opacity={0.58}
            />
            <Path
              d="M27 27 L50 48.2 L73 27 L51.8 50 L73 73 L50 51.8 L27 73 L48.2 50 Z"
              fill="#E0F2FE"
              opacity={0.28}
            />
          </Svg>
        </Animated.View>

        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`拾起第 ${spotIndex + 1} 颗星星`}
          onPress={() => onCollect(spotIndex)}
          hitSlop={18}
          disabled={collected}
          style={{ alignItems: "center", justifyContent: "center" }}
        >
          <Image
            source={STAR_LUMINOUS}
            resizeMode="contain"
            fadeDuration={0}
            style={{ width: s * 1.65, height: s * 1.65 }}
          />
        </Pressable>
      </Animated.View>
    </Animated.View>
  );
});

/* -------------------------------------------------------------------------- */
/*  星空八音盒星键：七星成图后轻点任意星座星点即可重奏对应音阶                 */
/* -------------------------------------------------------------------------- */

export const HarpStarNode = memo(function HarpStarNode({
  cx,
  cy,
  noteIndex,
  onPlay,
}: {
  cx: number;
  cy: number;
  noteIndex: number;
  onPlay: (noteIndex: number) => void;
}) {
  const pulse = useSharedValue(0);
  const bump = useSharedValue(1);
  const motion = useContext(NightMotion);
  const reduceMotion = useReducedMotion();

  useEffect(() => () => {
    cancelAnimation(pulse);
    cancelAnimation(bump);
  }, [bump, pulse]);

  const ringStyle = useAnimatedStyle(() => ({
    opacity: pulse.value > 0 ? (1 - pulse.value) * 0.85 : 0,
    transform: [{ scale: 0.5 + pulse.value * 2.1 }],
  }));
  const coreStyle = useAnimatedStyle(() => ({
    transform: [{ scale: bump.value }],
  }));

  const handlePress = () => {
    onPlay(noteIndex);
    if (motion && !reduceMotion) {
      pulse.value = 0;
      pulse.value = withTiming(1, {
        duration: 620,
        easing: Easing.out(Easing.cubic),
      });
      bump.value = withSequence(
        withTiming(1.55, { duration: 110 }),
        withSpring(1, { damping: 10, stiffness: 180 }),
      );
    }
  };

  return (
    <Pressable
      onPress={handlePress}
      hitSlop={14}
      accessibilityRole="button"
      accessibilityLabel={`演奏第 ${noteIndex + 1} 音阶星点`}
      style={{
        position: "absolute",
        left: cx - 20,
        top: cy - 20,
        width: 40,
        height: 40,
        alignItems: "center",
        justifyContent: "center",
        zIndex: 5,
      }}
    >
      <View pointerEvents="none" style={{ position: "absolute", width: 38, height: 38 }}>
        <Svg width={38} height={38} viewBox="0 0 100 100">
          <Defs>
            <RadialGradient id={`harpStarGlow-${noteIndex}`} cx="50%" cy="50%" r="50%">
              <Stop offset="0" stopColor="#FFFDF5" stopOpacity={0.62} />
              <Stop offset="0.32" stopColor="#FDE68A" stopOpacity={0.28} />
              <Stop offset="0.68" stopColor="#C4B5FD" stopOpacity={0.1} />
              <Stop offset="1" stopColor="#A78BFA" stopOpacity={0} />
            </RadialGradient>
          </Defs>
          <Circle cx="50" cy="50" r="50" fill={`url(#harpStarGlow-${noteIndex})`} />
        </Svg>
      </View>
      <Animated.View
        pointerEvents="none"
        style={[
          {
            position: "absolute",
            width: 24,
            height: 24,
            borderRadius: 12,
            borderWidth: 1.2,
            borderColor: "#FDE68A",
          },
          ringStyle,
        ]}
      />
      <Animated.View pointerEvents="none" style={coreStyle}>
        <Svg width={18} height={18} viewBox="0 0 24 24">
          <Path
            d="M12 2 L14.1 9.9 L22 12 L14.1 14.1 L12 22 L9.9 14.1 L2 12 L9.9 9.9 Z"
            fill="#FFF7DF"
            opacity={0.94}
          />
          <Circle cx="12" cy="12" r="2.6" fill="#FFFFFF" />
        </Svg>
      </Animated.View>
    </Pressable>
  );
});

const AnimatedPath = Animated.createAnimatedComponent(Path);

export function ConstellationReveal({
  constellation,
  points,
  width,
  height,
}: {
  constellation: ConstellationDef;
  points: { x: number; y: number }[];
  width: number;
  height: number;
}) {
  const motion = useContext(NightMotion);
  const progress = useSharedValue(0);

  const { path, length } = useMemo(() => {
    const segs: string[] = [];
    let total = 0;
    for (const [a, b] of constellation.edges) {
      const p1 = points[a];
      const p2 = points[b];
      if (!p1 || !p2) continue;
      segs.push(`M${p1.x} ${p1.y} L${p2.x} ${p2.y}`);
      total += Math.hypot(p2.x - p1.x, p2.y - p1.y);
    }
    return { path: segs.join(" "), length: Math.max(1, total) };
  }, [constellation.edges, points]);

  useEffect(() => {
    progress.value = 0;
    progress.value = motion
      ? withTiming(1, { duration: 1550, easing: Easing.inOut(Easing.cubic) })
      : 1;
    return () => cancelAnimation(progress);
  }, [constellation.id, motion, progress]);

  const trace = useAnimatedProps(() => ({
    strokeDashoffset: length * (1 - progress.value),
  }));
  const flash = useAnimatedProps(() => ({
    opacity: Math.sin(progress.value * Math.PI) * 0.68,
    strokeDashoffset: length * (1 - progress.value),
  }));

  return (
    <Svg
      pointerEvents="none"
      width={width}
      height={height}
      style={{ position: "absolute", zIndex: 3 }}
    >
      <AnimatedPath
        d={path}
        fill="none"
        stroke="#A89AFF"
        strokeWidth={7.5}
        strokeLinecap="round"
        strokeDasharray={[length, length]}
        animatedProps={flash}
      />
      <AnimatedPath
        d={path}
        fill="none"
        stroke="#FCE5BB"
        strokeWidth={1.8}
        strokeLinecap="round"
        strokeDasharray={[length, length]}
        animatedProps={trace}
      />
      {points.map((pt, idx) => (
        <G key={`${constellation.id}-${idx}`}>
          <Circle cx={pt.x} cy={pt.y} r={10} fill="#BAA6FF" opacity={0.18} />
          <Circle cx={pt.x} cy={pt.y} r={3.2} fill="#FFF2CE" />
        </G>
      ))}
    </Svg>
  );
}

/* -------------------------------------------------------------------------- */
/*  拾星画布与划星手势容器：UI 线程零 JS 帧开销连星 + 星尘光轨更新              */
/* -------------------------------------------------------------------------- */

export const SkyPanCanvas = memo(function SkyPanCanvas({
  constellationKey,
  done,
  disabled,
  allowDragTrail,
  constellationPoints,
  pickOrder,
  dragCoords,
  dragActive,
  onCollectStar,
  onSkyPress,
  onSkyLongPress,
  children,
}: {
  constellationKey: string;
  done: boolean;
  disabled: boolean;
  allowDragTrail: boolean;
  constellationPoints: readonly { x: number; y: number }[];
  pickOrder: readonly number[];
  dragCoords: SharedValue<number[]>;
  dragActive: SharedValue<number>;
  onCollectStar: (spotIndex: number) => void;
  onSkyPress: (event: GestureResponderEvent) => void;
  onSkyLongPress: () => void;
  children: ReactNode;
}) {
  const starCoordsSV = useSharedValue<number[]>([]);
  const collectedMaskSV = useSharedValue(0);
  const panStartX = useSharedValue(-999);
  const panStartY = useSharedValue(-999);

  useEffect(() => {
    const flat: number[] = [];
    for (const pt of constellationPoints) {
      flat.push(pt.x, pt.y);
    }
    starCoordsSV.value = flat;
  }, [constellationPoints, starCoordsSV]);

  useEffect(() => {
    let mask = 0;
    for (const idx of pickOrder) {
      mask |= 1 << idx;
    }
    collectedMaskSV.value = mask;
  }, [collectedMaskSV, constellationKey, pickOrder]);

  useEffect(
    () => () => {
      cancelAnimation(starCoordsSV);
      cancelAnimation(collectedMaskSV);
      cancelAnimation(panStartX);
      cancelAnimation(panStartY);
    },
    [collectedMaskSV, panStartX, panStartY, starCoordsSV],
  );

  const skyPanGesture = useMemo(
    () =>
      Gesture.Pan()
        .minDistance(10)
        .enabled(!done && !disabled)
        .onBegin((e) => {
          panStartX.value = e.x;
          panStartY.value = e.y;
        })
        .onStart((e) => {
          const coords = starCoordsSV.value;
          const count = Math.floor(coords.length / 2);
          let mask = collectedMaskSV.value;
          const sx = panStartX.value;
          const sy = panStartY.value;
          for (let i = 0; i < count; i++) {
            if ((mask & (1 << i)) !== 0) continue;
            const starX = coords[i * 2];
            const starYVal = coords[i * 2 + 1];
            const d0x = sx - starX;
            const d0y = sy - starYVal;
            const d1x = e.x - starX;
            const d1y = e.y - starYVal;
            if (
              d0x * d0x + d0y * d0y <= STAR_HIT_RADIUS_SQ ||
              d1x * d1x + d1y * d1y <= STAR_HIT_RADIUS_SQ
            ) {
              mask |= 1 << i;
              collectedMaskSV.value = mask;
              runOnJS(onCollectStar)(i);
            }
          }
          if (allowDragTrail) {
            dragActive.value = 1;
            dragCoords.value = [
              e.x, e.y,
              -999, -999, -999, -999, -999, -999,
              -999, -999, -999, -999, -999, -999, -999, -999,
            ];
          }
        })
        .onUpdate((e) => {
          const px = e.x;
          const py = e.y;
          if (allowDragTrail) {
            const prev = dragCoords.value;
            const dxMove = px - prev[0];
            const dyMove = py - prev[1];
            if (dxMove * dxMove + dyMove * dyMove >= 16) {
              dragCoords.value = [
                px, py,
                prev[0], prev[1],
                prev[2], prev[3],
                prev[4], prev[5],
                prev[6], prev[7],
                prev[8], prev[9],
                prev[10], prev[11],
                prev[12], prev[13],
              ];
            }
          }
          const coords = starCoordsSV.value;
          const count = Math.floor(coords.length / 2);
          let mask = collectedMaskSV.value;
          for (let i = 0; i < count; i++) {
            if ((mask & (1 << i)) !== 0) continue;
            const dx = px - coords[i * 2];
            const dy = py - coords[i * 2 + 1];
            if (dx * dx + dy * dy <= STAR_HIT_RADIUS_SQ) {
              mask |= 1 << i;
              collectedMaskSV.value = mask;
              runOnJS(onCollectStar)(i);
            }
          }
        })
        .onFinalize(() => {
          dragActive.value = 0;
          dragCoords.value = [
            -999, -999, -999, -999, -999, -999, -999, -999,
            -999, -999, -999, -999, -999, -999, -999, -999,
          ];
        }),
    [
      allowDragTrail,
      collectedMaskSV,
      disabled,
      done,
      dragActive,
      dragCoords,
      onCollectStar,
      panStartX,
      panStartY,
      starCoordsSV,
    ],
  );

  return (
    <GestureDetector gesture={skyPanGesture}>
      <View
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          top: 0,
          bottom: 0,
          zIndex: 4,
        }}
      >
        <Pressable
          accessibilityLabel="夜空画布，轻触泛起星光涟漪，长按写下星愿"
          onPress={onSkyPress}
          onLongPress={onSkyLongPress}
          delayLongPress={420}
          style={{
            position: "absolute",
            left: 0,
            right: 0,
            top: 0,
            bottom: 0,
          }}
        />
        {children}
      </View>
    </GestureDetector>
  );
});
