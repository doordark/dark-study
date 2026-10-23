/* eslint-disable react-hooks/immutability --
   Reanimated 共享值（fade/grow/blink 等）本质是跨渲染、跨线程可变的容器，
   在 effect 与手势中赋值是官方标准用法，React 编译器的不可变假设不适用 */

import AsyncStorage from "@react-native-async-storage/async-storage";
import { LinearGradient } from "expo-linear-gradient";
import { StatusBar } from "expo-status-bar";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Pressable, Text, View, useWindowDimensions } from "react-native";
import Animated, {
  Easing,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withSpring,
  withTiming,
} from "react-native-reanimated";
import Svg, { Circle, Ellipse, Path } from "react-native-svg";
import { useSafeAreaInsets } from "react-native-safe-area-context";

/** 彩蛋观感：固定的种子让每次进入星空时星位一致，不会随机跳动 */
const VISIT_KEY = "dark-study-night-visits";
const TOTAL_STARS = 7;

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

const STAR_PATH =
  "M50 4 L62 36 L96 37 L69 58 L79 92 L50 72 L21 92 L31 58 L4 37 L38 36 Z";

/* -------------------------------------------------------------------------- */
/*  背景微光星点：各自呼吸闪烁                                                 */
/* -------------------------------------------------------------------------- */

function Twinkle({
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
}

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

  useEffect(() => {
    t.value = withDelay(
      delay,
      withRepeat(
        withTiming(1, { duration: 3600, easing: Easing.linear }),
        -1,
        false,
      ),
    );
  }, [delay, t]);

  const style = useAnimatedStyle(() => {
    const p = t.value;
    const opacity = p < 0.08 ? p / 0.08 : p > 0.82 ? (1 - p) / 0.18 : 1;
    return {
      opacity,
      transform: [
        { translateX: -150 + p * (w + 320) },
        { translateY: top + p * 150 },
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
            color: "rgba(224,242,254,0.50)",
            fontSize: 9,
            letterSpacing: 1.5,
            marginRight: 7,
          }}
        >
          {label}
        </Text>
      ) : null}
      <LinearGradient
        colors={["rgba(224,242,254,0)", "rgba(186,230,253,0.8)"]}
        start={{ x: 0, y: 0.5 }}
        end={{ x: 1, y: 0.5 }}
        style={{
          width: 118,
          height: 1.4,
          borderRadius: 1,
          transform: [{ rotate: "-6deg" }],
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
    scale.value = withSequence(
      withTiming(1.55, { duration: 120 }),
      withTiming(0.3, { duration: 240, easing: Easing.out(Easing.cubic) }),
    );
    opacity.value = withTiming(0, { duration: 320 });
  }, [collected, opacity, scale]);

  const wrap = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
    opacity: opacity.value,
  }));
  const halo = useAnimatedStyle(() => ({ opacity: glow.value }));

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
        wrap,
      ]}
    >
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
        onPress={onCollect}
        hitSlop={18}
        disabled={collected}
        style={{ alignItems: "center", justifyContent: "center" }}
      >
        <Svg width={s} height={s} viewBox="0 0 100 100">
          <Path
            d={STAR_PATH}
            fill="#FCD34D"
            stroke="rgba(255,255,255,0.6)"
            strokeWidth="2"
          />
        </Svg>
      </Pressable>
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
    bob.value = withRepeat(
      withTiming(-4, { duration: 1900, easing: Easing.inOut(Easing.sin) }),
      -1,
      true,
    );
    blink.value = withRepeat(
      withSequence(
        withDelay(2400, withTiming(0.08, { duration: 90 })),
        withTiming(1, { duration: 110 }),
      ),
      -1,
      false,
    );
  }, [blink, bob]);

  const bobStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: bob.value }],
  }));
  const eyeStyle = useAnimatedStyle(() => ({
    transform: [{ scaleY: blink.value }],
  }));

  return (
    <Animated.View style={[{ width: 70, height: 80 }, bobStyle]}>
      <Svg width={70} height={80} viewBox="0 0 70 80">
        {/* 耳朵 */}
        <Path d="M15 26 L12 8 L27 21 Z" fill="#FDE68A" />
        <Path d="M55 26 L58 8 L43 21 Z" fill="#FDE68A" />
        {/* 身体 */}
        <Ellipse cx="35" cy="47" rx="23" ry="27" fill="#FDE68A" />
        {/* 肚子 */}
        <Ellipse cx="35" cy="53" rx="14" ry="19" fill="#FEF3C7" />
        {/* 翅膀 */}
        <Ellipse cx="13" cy="50" rx="7" ry="15" fill="#FCD34D" />
        <Ellipse cx="57" cy="50" rx="7" ry="15" fill="#FCD34D" />
        {/* 喙 */}
        <Path d="M35 38 L40 45 L30 45 Z" fill="#F59E0B" />
        {/* 爪子 */}
        <Path
          d="M28 72 L28 75 M42 72 L42 75"
          stroke="#F59E0B"
          strokeWidth="2.4"
          strokeLinecap="round"
        />
      </Svg>

      {/* 眼睛单独用 View 画，眨眼只压缩纵向 */}
      <Animated.View
        style={[
          {
            position: "absolute",
            left: 20,
            top: 30,
            width: 14,
            height: 14,
            borderRadius: 7,
            backgroundColor: "#1E293B",
          },
          eyeStyle,
        ]}
      >
        <View
          style={{
            position: "absolute",
            left: 3,
            top: 3,
            width: 4,
            height: 4,
            borderRadius: 2,
            backgroundColor: "#F8FAFC",
          }}
        />
      </Animated.View>
      <Animated.View
        style={[
          {
            position: "absolute",
            left: 36,
            top: 30,
            width: 14,
            height: 14,
            borderRadius: 7,
            backgroundColor: "#1E293B",
          },
          eyeStyle,
        ]}
      >
        <View
          style={{
            position: "absolute",
            left: 3,
            top: 3,
            width: 4,
            height: 4,
            borderRadius: 2,
            backgroundColor: "#F8FAFC",
          }}
        />
      </Animated.View>
    </Animated.View>
  );
}

function Owl({
  left,
  top,
  onTap,
}: {
  left: number;
  top: number;
  onTap: () => void;
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
      <Pressable onPress={press} hitSlop={16}>
        <OwlBody />
      </Pressable>
    </Animated.View>
  );
}

/* -------------------------------------------------------------------------- */
/*  打字机效果                                                                 */
/* -------------------------------------------------------------------------- */

function useTyped(text: string, speed = 46) {
  const [shown, setShown] = useState({ text, n: 0 });
  // 文案变化时无需重置状态：旧记录不匹配即视为 0，交给新的计时器推进
  const n = shown.text === text ? shown.n : 0;

  useEffect(() => {
    let i = 0;
    const id = setInterval(() => {
      i += 1;
      setShown({ text, n: i });
      if (i >= text.length) clearInterval(id);
    }, speed);
    return () => clearInterval(id);
  }, [speed, text]);

  return text.slice(0, n);
}

/* -------------------------------------------------------------------------- */
/*  夜空彩蛋                                                                   */
/* -------------------------------------------------------------------------- */

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
  const [lit, setLit] = useState(0);
  const [closing, setClosing] = useState(false);
  const [seenFarm, setSeenFarm] = useState(false);
  const owlTaps = useRef(0);

  const fade = useSharedValue(0);
  const done = lit >= TOTAL_STARS;
  /** 去过星露坡的人，猫头鹰会先探出头来；没去过就得多攒一点星光 */
  const showOwl = done || seenFarm;

  const fadeStyle = useAnimatedStyle(() => ({ opacity: fade.value }));

  useEffect(() => {
    fade.value = withTiming(1, {
      duration: 460,
      easing: Easing.out(Easing.cubic),
    });
  }, [fade]);

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

  const hour = new Date().getHours();
  const opening =
    hour < 5
      ? "这个点还没睡？星星替你记着。"
      : hour < 11
        ? "白天的星星没有消失，只是藏起来了。"
        : hour < 18
          ? "把课表翻到背面，是一片夜空。"
          : "今晚的星星，比昨天多了一颗。";
  const message = done ? "七颗星都归位了。现在，这片夜空只属于你。" : opening;
  const typed = useTyped(message);
  const typing = typed.length < message.length;

  const close = useCallback(() => {
    if (closing) return;
    setClosing(true);
    fade.value = withTiming(
      0,
      { duration: 240, easing: Easing.in(Easing.cubic) },
      (finished) => {
        if (finished) runOnJS(onClose)();
      },
    );
  }, [closing, fade, onClose]);

  const enterFarm = useCallback(() => {
    if (closing) return;
    setClosing(true);
    fade.value = withTiming(
      0,
      { duration: 420, easing: Easing.in(Easing.cubic) },
      (finished) => {
        if (!finished) return;
        runOnJS(onClose)();
        if (onEnterFarm) runOnJS(onEnterFarm)();
      },
    );
  }, [closing, fade, onClose, onEnterFarm]);

  const labels = courseNames
    .map((n) => n.trim())
    .filter((n) => n.length > 0)
    .slice(0, 2);

  const moonSize = 104;
  const moonTop = insets.top + 34;
  const moonRight = 26;
  const moonCx = w - moonRight - moonSize / 2;
  const moonCy = moonTop + moonSize / 2;

  return (
    <Animated.View
      style={[
        {
          position: "absolute",
          left: 0,
          right: 0,
          top: 0,
          bottom: 0,
          zIndex: 60,
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

      {SPOTS.map((s, i) => (
        <CollectStar
          key={i}
          x={s.x}
          y={s.y}
          s={s.s}
          w={w}
          h={h}
          collected={i < lit}
          onCollect={() => setLit((n) => Math.min(TOTAL_STARS, n + 1))}
        />
      ))}

      {done ? <Burst cx={moonCx} cy={moonCy} /> : null}
      {showOwl ? (
        <Owl
          left={Math.max(12, w - moonRight - moonSize - 8)}
          top={moonTop + moonSize - 14}
          onTap={() => {
            owlTaps.current += 1;
            if (owlTaps.current >= 3) enterFarm();
          }}
        />
      ) : null}

      {/* 底部信息面板 */}
      <View
        style={{
          position: "absolute",
          left: 22,
          right: 22,
          bottom: insets.bottom + 24,
        }}
      >
        <View
          style={{
            borderRadius: 26,
            borderWidth: 1,
            borderColor: "rgba(255,255,255,0.10)",
            backgroundColor: "rgba(255,255,255,0.06)",
            paddingHorizontal: 20,
            paddingVertical: 16,
          }}
        >
          <View className="flex-row items-center justify-between">
            <Text
              style={{
                color: "rgba(125,211,252,0.85)",
                fontSize: 9,
                fontWeight: "700",
                letterSpacing: 3,
              }}
            >
              NIGHT SHIFT
            </Text>
            <View className="flex-row items-center" style={{ gap: 5 }}>
              {Array.from({ length: TOTAL_STARS }).map((_, i) => (
                <View
                  key={i}
                  style={{
                    width: 5,
                    height: 5,
                    borderRadius: 3,
                    backgroundColor:
                      i < lit ? "#FCD34D" : "rgba(255,255,255,0.16)",
                  }}
                />
              ))}
            </View>
          </View>

          <Text
            style={{
              marginTop: 10,
              color: "#E2E8F0",
              fontSize: 13.5,
              minHeight: 38,
            }}
          >
            {typed}
            <Text style={{ color: "#7DD3FC" }}>{typing ? "▍" : ""}</Text>
          </Text>

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
            <Text style={{ color: "rgba(148,163,184,0.9)", fontSize: 11 }}>
              {done
                ? "夜空亮度 100%"
                : `拾起散落的星 · ${lit} / ${TOTAL_STARS}`}
            </Text>
            <Pressable
              onPress={close}
              style={{
                borderRadius: 999,
                backgroundColor: "rgba(56,189,248,0.9)",
                paddingHorizontal: 16,
                paddingVertical: 8,
              }}
            >
              <Text
                style={{ color: "#04121F", fontSize: 12, fontWeight: "700" }}
              >
                回到现实
              </Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Animated.View>
  );
}
