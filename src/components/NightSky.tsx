/* eslint-disable react-hooks/immutability --
   Reanimated 共享值（fade/grow/blink 等）本质是跨渲染、跨线程可变的容器，
   在 effect 与手势中赋值是官方标准用法，React 编译器的不可变假设不适用 */

import AsyncStorage from "@react-native-async-storage/async-storage";
import { LinearGradient } from "expo-linear-gradient";
import { StatusBar } from "expo-status-bar";
import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { BackHandler, Image, Pressable, Text, View, useWindowDimensions } from "react-native";
import Animated, {
  Easing,
  cancelAnimation,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  useReducedMotion,
  withDelay,
  withRepeat,
  withSequence,
  withSpring,
  withTiming,
} from "react-native-reanimated";
import Svg, { Circle, Path } from "react-native-svg";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { AtlasSprite } from "@/components/AtlasSprite";
import { NightSkyMessage } from "@/components/NightSkyMessage";

import {
  successHaptic,
  tapHaptic,
  thumpHaptic,
} from "@/utils/haptics";

/** 彩蛋观感：固定的种子让每次进入星空时星位一致，不会随机跳动 */
const VISIT_KEY = "dark-study-night-visits";
const TOTAL_STARS = 7;

/** 猫头鹰要听够几次呼唤才肯带路：前几句是对话，最后一句才放行 */
const OWL_LINES = [
  "（它歪了歪头，圆眼睛在你身上打量了好一会儿）",
  "（它低头啄了啄羽毛，又抬起来看你，像是在确认什么）",
  "（它轻轻叫了一声，声音被夜风卷走了）",
  "（它朝小径的方向跳了半步，又回头望你）",
  "（它终于展开翅膀，落在小径入口回头等你）",
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
  { x: 0.15, y: 0.33, s: 26 },
  { x: 0.31, y: 0.45, s: 22 },
  { x: 0.47, y: 0.31, s: 28 },
  { x: 0.63, y: 0.44, s: 23 },
  { x: 0.23, y: 0.58, s: 24 },
  { x: 0.42, y: 0.57, s: 27 },
  { x: 0.73, y: 0.58, s: 24 },
] as const;

const NIGHT_SPRITES = require("../../assets/images/night-sprites.png");

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

  useEffect(() => {
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
  }, [delay, dur, v]);

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

  useEffect(() => {
    if (reduceMotion) return;
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
  }, [delay, t, reduceMotion]);

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

  useEffect(() => {
    grow.value = withSpring(1, { damping: 18, stiffness: 90 });
    halo.value = withRepeat(
      withSequence(
        withTiming(1, { duration: 2800, easing: Easing.inOut(Easing.sin) }),
        withTiming(0.5, { duration: 2800, easing: Easing.inOut(Easing.sin) }),
      ),
      -1,
    );
  }, [grow, halo]);

  const growStyle = useAnimatedStyle(() => ({
    transform: [{ scale: grow.value }],
  }));
  const haloStyle = useAnimatedStyle(() => ({ opacity: halo.value }));

  const bright = 0.35 + (lit / TOTAL_STARS) * 0.65;

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
      <Animated.View
        style={[
          {
            position: "absolute",
            width: size * 2.1,
            height: size * 2.1,
            borderRadius: size,
            backgroundColor: `rgba(253,230,138,${0.05 * bright})`,
          },
          haloStyle,
        ]}
      />
      <View
        style={{
          position: "absolute",
          width: size * 1.55,
          height: size * 1.55,
          borderRadius: size,
          backgroundColor: `rgba(253,230,138,${0.08 * bright})`,
        }}
      />
      <Svg width={size} height={size} viewBox="0 0 100 100">
        <Circle
          cx="50"
          cy="50"
          r="34"
          fill="#FDE68A"
          opacity={0.75 + bright * 0.25}
        />
        <Circle
          cx="50"
          cy="50"
          r="34"
          fill="none"
          stroke="rgba(255,255,255,0.5)"
          strokeWidth="1"
        />
        <Circle cx="38" cy="41" r="7" fill="#FCD34D" opacity="0.75" />
        <Circle cx="61" cy="59" r="9" fill="#FCD34D" opacity="0.65" />
        <Circle cx="55" cy="33" r="4" fill="#FCD34D" opacity="0.7" />
        <Circle cx="64" cy="45" r="3" fill="#FCD34D" opacity="0.55" />
      </Svg>
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

  useEffect(() => {
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
  }, [glow, x]);

  useEffect(() => {
    if (!collected) return;
    cancelAnimation(glow);
    ripple.value = withTiming(1, { duration: reduceMotion ? 180 : 680, easing: Easing.out(Easing.cubic) });
    scale.value = withSequence(
      withTiming(1.4, { duration: 130 }),
      withTiming(0.25, { duration: 380, easing: Easing.out(Easing.cubic) }),
    );
    opacity.value = withDelay(100, withTiming(0, { duration: 380 }));
  }, [collected, opacity, scale, glow, ripple, reduceMotion]);

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
      <Animated.View
        style={[
          {
            position: "absolute",
            width: box * 1.7,
            height: box * 1.7,
            borderRadius: box,
            backgroundColor: "rgba(253,224,71,0.10)",
          },
          halo,
        ]}
      />
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="拾起这颗星星"
        onPress={onCollect}
        hitSlop={18}
        disabled={collected}
        style={{ alignItems: "center", justifyContent: "center" }}
      >
        <AtlasSprite source={NIGHT_SPRITES} columns={2} rows={2} column={0} row={0} width={s * 1.5} />
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

  useEffect(() => {
    t.value = withDelay(
      delay,
      withTiming(1, { duration: 820, easing: Easing.out(Easing.cubic) }),
    );
  }, [delay, t]);

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

/* -------------------------------------------------------------------------- */
/*  猫头鹰：拾满星后从月边探出头，会眨眼                                        */
/* -------------------------------------------------------------------------- */

function OwlBody() {
  const bob = useSharedValue(0);
  const blink = useSharedValue(1);
  useEffect(() => {
    bob.value = withRepeat(withTiming(-3, { duration: 1900, easing: Easing.inOut(Easing.sin) }), -1, true);
    blink.value = withRepeat(withSequence(withDelay(2800, withTiming(0, { duration: 70 })), withDelay(100, withTiming(1, { duration: 100 }))), -1, false);
  }, [blink, bob]);
  const body = useAnimatedStyle(() => ({ transform: [{ translateY: bob.value }] }));
  const open = useAnimatedStyle(() => ({ opacity: blink.value }));
  const closed = useAnimatedStyle(() => ({ opacity: 1 - blink.value }));
  return <Animated.View style={[{ width: 80, height: 86 }, body]}>
    <Animated.View style={[{ position: "absolute" }, open]}><AtlasSprite source={NIGHT_SPRITES} columns={2} rows={2} column={0} row={1} width={80} height={86} /></Animated.View>
    <Animated.View style={[{ position: "absolute" }, closed]}><AtlasSprite source={NIGHT_SPRITES} columns={2} rows={2} column={1} row={1} width={80} height={86} /></Animated.View>
  </Animated.View>;
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
  const pop = useSharedValue(0);
  const hop = useSharedValue(0);

  useEffect(() => {
    pop.value = withSpring(1, { damping: 12, stiffness: 150 });
  }, [pop]);

  const popStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: hop.value }, { scale: pop.value }],
    opacity: Math.min(1, pop.value),
  }));

  const press = () => {
    hop.value = withSequence(
      withTiming(-9, { duration: 110, easing: Easing.out(Easing.quad) }),
      withSpring(0, { damping: 13, stiffness: 190 }),
    );
    onTap();
  };

  return (
    <Animated.View
      style={[{ position: "absolute", left, top, zIndex: 6 }, popStyle]}
    >
      {hint ? (
        <View
          pointerEvents="none"
          style={{
            position: "absolute",
            bottom: 66,
            right: -4,
            width: 152,
            borderRadius: 14,
            borderWidth: 1,
            borderColor: "rgba(125,211,252,0.22)",
            backgroundColor: "rgba(8,18,36,0.92)",
            paddingHorizontal: 11,
            paddingVertical: 8,
          }}
        >
          <Text
            style={{
              color: "rgba(186,230,253,0.95)",
              fontSize: 10.5,
              lineHeight: 16,
            }}
          >
            {hint}
          </Text>
        </View>
      ) : null}
      <Pressable onPress={press} hitSlop={16}>
        <OwlBody />
      </Pressable>
    </Animated.View>
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
  const [seenFarm, setSeenFarm] = useState(false);
  const [owlHint, setOwlHint] = useState("");
  const owlTaps = useRef(0);
  const hintTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // 看星星的时候顺手把农场贴图解好码：进农场直接命中已解码的位图，
  // 转场那一下不用再临时解码两张 1080 宽的图，就不会卡一下
  const [farmWarm, setFarmWarm] = useState(false);
  useEffect(() => {
    if (!onEnterFarm) return;
    const t = setTimeout(() => setFarmWarm(true), 420);
    return () => clearTimeout(t);
  }, [onEnterFarm]);

  useEffect(
    () => () => {
      if (hintTimer.current) clearTimeout(hintTimer.current);
    },
    [],
  );

  const fade = useSharedValue(0);
  const reduceMotion = useReducedMotion();
  const closingRef = useRef(false);
  const done = lit >= TOTAL_STARS;
  useEffect(() => { if (done) successHaptic(); }, [done]);
  /** 去过星露坡的人，猫头鹰会先探出头来；没去过就得多攒一点星光 */
  const showOwl = done || seenFarm;

  const fadeStyle = useAnimatedStyle(() => ({ opacity: fade.value }));
  const sceneStyle = useAnimatedStyle(() => ({
    transform: [{ scale: reduceMotion ? 1 : 1.045 - fade.value * 0.045 }],
  }));
  const panelStyle = useAnimatedStyle(() => ({
    opacity: Math.max(0, (fade.value - 0.2) / 0.8),
    transform: [{ translateY: reduceMotion ? 0 : (1 - fade.value) * 32 }],
  }));

  useEffect(() => {
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
    // 农场有存档 = 曾经走过那条小径
    AsyncStorage.getItem("dark-study-farm")
      .then((raw) => {
        if (alive && raw) setSeenFarm(true);
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
    fade.value = withTiming(
      0,
      { duration: reduceMotion ? 150 : 420, easing: Easing.inOut(Easing.cubic) },
      (finished) => {
        if (finished) runOnJS(onClose)();
      },
    );
  }, [fade, onClose, reduceMotion]);

  useEffect(() => {
    const subscription = BackHandler.addEventListener("hardwareBackPress", () => { close(); return true; });
    return () => subscription.remove();
  }, [close]);

  const enterFarm = useCallback(() => {
    if (closingRef.current) return;
    closingRef.current = true;
    setClosing(true);
    // 先推农场（自带淡入），夜空在下面同时溶解，形成一次交叉过渡而不是黑屏两段
    if (onEnterFarm) onEnterFarm();
    fade.value = withTiming(
      0,
      { duration: 520, easing: Easing.inOut(Easing.cubic) },
      (finished) => {
        if (finished) runOnJS(onClose)();
      },
    );
  }, [fade, onClose, onEnterFarm]);

  const labels = (courseNames.some((name) => name.trim()) ? courseNames : ["", ""])
    .map((n) => n.trim())
    .slice(0, 2);

  const compact = h < 740;
  const moonSize = compact ? 76 : 104;
  const moonTop = insets.top + 34;
  const moonRight = 26;
  const moonCx = w - moonRight - moonSize / 2;
  const moonCy = moonTop + moonSize / 2;
  // Collectibles live between the header/moon and the bottom card, including short phones.
  const skyTop = insets.top + (compact ? 148 : 188);
  const skyBottom = Math.max(skyTop + 60, h - insets.bottom - panelHeight - (compact ? 12 : 24) - 42);
  const starY = (y: number) => skyTop + ((y - 0.31) / 0.27) * (skyBottom - skyTop);
  const constellation = SPOTS.filter((_, i) => picked[i]);

  return (
    <Animated.View
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

      {/* 农场贴图预热：铺满屏幕但完全透明，只为提前解码，不参与交互。
          尺寸必须和农场场景一致（场景高 = 屏宽 × 330/200），否则 Fresco 会按
          另一个尺寸重新解码，预热就白做了 */}
      {farmWarm ? (
        <View
          pointerEvents="none"
          style={{
            position: "absolute",
            left: 0,
            top: 0,
            width: w,
            height: (w * 330) / 200,
            opacity: 0,
          }}
        >
          <Image
            source={require("../../assets/images/farm-day-v2.png")}
            style={{ width: w, height: (w * 330) / 200 }}
            resizeMode="stretch"
            fadeDuration={0}
          />
          <Image
            source={require("../../assets/images/farm-night-v2.png")}
            style={{ width: w, height: (w * 330) / 200 }}
            resizeMode="stretch"
            fadeDuration={0}
          />
        </View>
      ) : null}

      <LinearGradient
        colors={["#03060F", "#071022", "#0E1A33"]}
        start={{ x: 0.2, y: 0 }}
        end={{ x: 0.85, y: 1 }}
        style={{ position: "absolute", left: 0, right: 0, top: 0, bottom: 0 }}
      />
      <Animated.Image
        pointerEvents="none"
        source={require("../../assets/images/night-forest.png")}
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

      {DOTS.map((d) => (
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
        {constellation.length > 1 ? <Path
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

      {done ? <Burst cx={moonCx} cy={moonCy} /> : null}
      {showOwl ? (
        <>
          {/* 猫头鹰身下的一圈暖光，提示它是可以互动的 */}
          <View
            pointerEvents="none"
            style={{
              position: "absolute",
              left: Math.max(12, w - moonRight - moonSize - 8) - 10,
              top: moonTop + moonSize - 24,
              width: 64,
              height: 64,
              borderRadius: 32,
              backgroundColor: "rgba(252,211,77,0.08)",
              borderWidth: 1,
              borderColor: "rgba(252,211,77,0.16)",
              zIndex: 5,
            }}
          />
          <Owl
            left={Math.max(12, w - moonRight - moonSize - 8)}
            top={moonTop + moonSize - 14}
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
        </>
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
            borderWidth: 1,
            borderColor: "rgba(194,204,255,0.18)",
            backgroundColor: "rgba(12,17,36,0.94)",
            paddingHorizontal: compact ? 16 : 20,
            paddingVertical: compact ? 12 : 16,
          }}
        >
          <LinearGradient pointerEvents="none" colors={["rgba(151,126,225,0.13)", "rgba(85,154,207,0.02)"]}
            start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
            style={{ position: "absolute", left: 0, right: 0, top: 0, bottom: 0, borderRadius: 26 }} />
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
                <AtlasSprite key={i} source={NIGHT_SPRITES} columns={2} rows={2}
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
                ? showOwl
                  ? "夜空已亮 · 远处有个小家伙在看你"
                  : `拾起散落的星 · ${lit} / ${TOTAL_STARS}`
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
    </Animated.View>
  );
}
