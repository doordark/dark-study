import { LinearGradient } from "expo-linear-gradient";
import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Image, Pressable, StyleSheet, Text, View } from "react-native";
import Animated, {
  Easing,
  cancelAnimation,
  runOnJS,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withSpring,
  withTiming,
} from "react-native-reanimated";
import Svg, {
  Circle,
  Defs,
  G,
  Path,
  RadialGradient,
  Stop,
} from "react-native-svg";

import {
  BLOOD_MOON_QUOTES,
  createQuoteBag,
  formatQuoteAttribution,
  type BloodMoonQuote,
} from "@/constants/nightSkyQuotes";
import { playSfx, resolveStarScaleSfx } from "@/services/soundEffects";
import { tapHaptic, thumpHaptic } from "@/utils/haptics";
import type { MoonPhaseInfo } from "@/utils/nightSkyData";

const BLOOD_MOON_BG = require("../../../assets/images/night-blood-moon-bg.webp");
const BLOOD_MOON_ORB = require("../../../assets/images/night-blood-moon-orb.webp");
const BLOOD_OWL = require("../../../assets/images/night-blood-owl.webp");

const BLOOD_MOON_WHISPERS = [
  "血月把时间折进了暗红色的裂缝里……再怎么轻点，银月也不会自己回来。",
  "猩红的日冕正在缓慢转动，似乎在等待有人破开底部的夜幕禁制。",
  "血潮低语：不要把目光移开太久，枝头的影子在数你的呼吸。",
  "月轮表面裂开细小的红痕，传出像古钟余韵般的低沉回响。",
] as const;

const BLOOD_OWL_WHISPERS = [
  "「它看见了你，在钟声第七次落下之前。」",
  "「别在逆星阵前数眼睛——枝头只有一双，还是两双？」",
  "「银月已经被蚀进血幕后面了，想回去的话，去触碰底部的破除印记吧。」",
  "「这里的星弦被调低了半个音阶，拨动它们，听听深渊的回声。」",
] as const;

interface EmberSpec {
  id: number;
  xRatio: number;
  yRatio: number;
  size: number;
  dx: number;
  rise: number;
  delay: number;
  duration: number;
  crimson: boolean;
}

const EMBER_SPECS: readonly EmberSpec[] = [
  { id: 0, xRatio: 0.1, yRatio: 0.78, size: 3.2, dx: 16, rise: 150, delay: 0, duration: 4200, crimson: true },
  { id: 1, xRatio: 0.22, yRatio: 0.84, size: 2.6, dx: -14, rise: 180, delay: 460, duration: 4800, crimson: false },
  { id: 2, xRatio: 0.34, yRatio: 0.72, size: 3.6, dx: 18, rise: 140, delay: 920, duration: 3900, crimson: true },
  { id: 3, xRatio: 0.48, yRatio: 0.88, size: 2.4, dx: -12, rise: 210, delay: 1380, duration: 5100, crimson: true },
  { id: 4, xRatio: 0.62, yRatio: 0.76, size: 3.0, dx: 15, rise: 165, delay: 680, duration: 4400, crimson: false },
  { id: 5, xRatio: 0.75, yRatio: 0.85, size: 3.4, dx: -16, rise: 195, delay: 1720, duration: 4700, crimson: true },
  { id: 6, xRatio: 0.88, yRatio: 0.74, size: 2.5, dx: -10, rise: 150, delay: 1120, duration: 4100, crimson: false },
  { id: 7, xRatio: 0.16, yRatio: 0.56, size: 2.2, dx: 14, rise: 120, delay: 1980, duration: 4600, crimson: true },
  { id: 8, xRatio: 0.41, yRatio: 0.62, size: 2.8, dx: -15, rise: 145, delay: 2260, duration: 4300, crimson: false },
  { id: 9, xRatio: 0.57, yRatio: 0.54, size: 2.4, dx: 12, rise: 135, delay: 2540, duration: 4900, crimson: true },
  { id: 10, xRatio: 0.71, yRatio: 0.6, size: 2.9, dx: -18, rise: 155, delay: 1540, duration: 4500, crimson: true },
  { id: 11, xRatio: 0.84, yRatio: 0.52, size: 2.3, dx: 10, rise: 130, delay: 2820, duration: 4700, crimson: false },
];

/** 中央「猩红逆星阵」7 节点几何（归一化坐标，居中留白区间） */
const INVERTED_ARRAY_SPOTS: readonly { x: number; y: number; r: number }[] = [
  { x: 0.5, y: 0.86, r: 9.5 }, // 0: 倒五芒底尖（深渊锚点）
  { x: 0.2, y: 0.34, r: 8.5 }, // 1: 左上翼尖
  { x: 0.8, y: 0.34, r: 8.5 }, // 2: 右上翼尖
  { x: 0.28, y: 0.68, r: 7.8 }, // 3: 左下翼尖
  { x: 0.72, y: 0.68, r: 7.8 }, // 4: 右下翼尖
  { x: 0.5, y: 0.16, r: 8.2 }, // 5: 倒悬顶冠星
  { x: 0.5, y: 0.49, r: 10.5 }, // 6: 逆星阵瞳核
];

const INVERTED_ARRAY_EDGES: readonly (readonly [number, number])[] = [
  // 逆五芒主星线（1-2-3-5-4-1 + 0 锚点连缀）
  [1, 2],
  [2, 3],
  [3, 5],
  [5, 4],
  [4, 1],
  [1, 3],
  [2, 4],
  [3, 0],
  [4, 0],
  [0, 6],
  [5, 6],
  [1, 6],
  [2, 6],
];

const EmberParticle = memo(function EmberParticle({
  spec,
  w,
  h,
  motion,
}: {
  spec: EmberSpec;
  w: number;
  h: number;
  motion: boolean;
}) {
  const t = useSharedValue(0);

  useEffect(() => {
    if (!motion) {
      t.value = 0;
      return;
    }
    t.value = withDelay(
      spec.delay,
      withRepeat(
        withTiming(1, { duration: spec.duration, easing: Easing.linear }),
        -1,
        false,
      ),
    );
    return () => cancelAnimation(t);
  }, [motion, spec.delay, spec.duration, t]);

  const style = useAnimatedStyle(() => {
    const p = t.value;
    const envelope = p <= 0 || p >= 1 ? 0 : Math.sin(p * Math.PI);
    return {
      opacity: envelope * 0.74,
      transform: [
        { translateX: Math.sin(p * Math.PI * 2) * spec.dx },
        { translateY: -p * spec.rise },
        { scale: 0.65 + envelope * 0.5 },
      ],
    };
  });

  const halo = spec.size * 3.2;

  return (
    <Animated.View
      pointerEvents="none"
      style={[
        {
          position: "absolute",
          left: spec.xRatio * w - halo / 2,
          top: spec.yRatio * h - halo / 2,
          width: halo,
          height: halo,
          alignItems: "center",
          justifyContent: "center",
        },
        style,
      ]}
    >
      <View
        style={{
          position: "absolute",
          width: halo,
          height: halo,
          borderRadius: halo / 2,
          backgroundColor: spec.crimson
            ? "rgba(220,38,38,0.22)"
            : "rgba(251,146,60,0.18)",
        }}
      />
      <View
        style={{
          width: spec.size,
          height: spec.size,
          borderRadius: spec.size / 2,
          backgroundColor: spec.crimson ? "#F87171" : "#FDBA74",
        }}
      />
    </Animated.View>
  );
});

const CrimsonArrayNode = memo(function CrimsonArrayNode({
  index,
  cx,
  cy,
  radius,
  motion,
  onPluck,
}: {
  index: number;
  cx: number;
  cy: number;
  radius: number;
  motion: boolean;
  onPluck: (index: number) => void;
}) {
  const pulse = useSharedValue(0);
  const bump = useSharedValue(1);
  const breathe = useSharedValue(0.6);

  useEffect(() => {
    if (!motion) {
      breathe.value = 0.72;
      return;
    }
    breathe.value = withDelay(
      (index * 260) % 1400,
      withRepeat(
        withSequence(
          withTiming(1, {
            duration: 1600 + (index % 3) * 320,
            easing: Easing.inOut(Easing.sin),
          }),
          withTiming(0.45, {
            duration: 1600 + (index % 3) * 320,
            easing: Easing.inOut(Easing.sin),
          }),
        ),
        -1,
      ),
    );
    return () => cancelAnimation(breathe);
  }, [breathe, index, motion]);

  useEffect(
    () => () => {
      cancelAnimation(pulse);
      cancelAnimation(bump);
    },
    [bump, pulse],
  );

  const handlePress = useCallback(() => {
    if (motion) {
      pulse.value = 0;
      pulse.value = withTiming(1, {
        duration: 680,
        easing: Easing.out(Easing.cubic),
      });
      bump.value = withSequence(
        withTiming(1.48, { duration: 105 }),
        withSpring(1, { damping: 9, stiffness: 185 }),
      );
    }
    onPluck(index);
  }, [bump, index, motion, onPluck, pulse]);

  const haloStyle = useAnimatedStyle(() => ({
    opacity: breathe.value,
    transform: [{ scale: 0.92 + breathe.value * 0.14 }],
  }));
  const ringStyle = useAnimatedStyle(() => ({
    opacity: pulse.value > 0 ? (1 - pulse.value) * 0.85 : 0,
    transform: [{ scale: 0.45 + pulse.value * 2.2 }],
  }));
  const coreStyle = useAnimatedStyle(() => ({
    transform: [{ scale: bump.value }],
  }));

  return (
    <Pressable
      onPress={handlePress}
      hitSlop={16}
      accessibilityRole="button"
      accessibilityLabel={`拨动猩红逆星阵第 ${index + 1} 节点`}
      style={{
        position: "absolute",
        left: cx - 22,
        top: cy - 22,
        width: 44,
        height: 44,
        alignItems: "center",
        justifyContent: "center",
        zIndex: 5,
      }}
    >
      <Animated.View
        pointerEvents="none"
        style={[
          {
            position: "absolute",
            width: 38,
            height: 38,
            alignItems: "center",
            justifyContent: "center",
          },
          haloStyle,
        ]}
      >
        <Svg width={38} height={38} viewBox="0 0 100 100">
          <Defs>
            <RadialGradient id={`bloodNodeGlow-${index}`} cx="50%" cy="50%" r="50%">
              <Stop offset="0" stopColor="#FCA5A5" stopOpacity={0.72} />
              <Stop offset="0.35" stopColor="#EF4444" stopOpacity={0.42} />
              <Stop offset="0.7" stopColor="#991B1B" stopOpacity={0.16} />
              <Stop offset="1" stopColor="#450A0A" stopOpacity={0} />
            </RadialGradient>
          </Defs>
          <Circle cx="50" cy="50" r="50" fill={`url(#bloodNodeGlow-${index})`} />
        </Svg>
      </Animated.View>

      <Animated.View
        pointerEvents="none"
        style={[
          {
            position: "absolute",
            width: 28,
            height: 28,
            borderRadius: 14,
            borderWidth: 1.2,
            borderColor: "#FCA5A5",
          },
          ringStyle,
        ]}
      />

      <Animated.View pointerEvents="none" style={coreStyle}>
        <Svg width={radius * 2.4} height={radius * 2.4} viewBox="0 0 24 24">
          {/* 裂星外菱角 */}
          <Path
            d="M12 2 L14.4 9.2 L22 12 L14.4 14.8 L12 22 L9.6 14.8 L2 12 L9.6 9.2 Z"
            fill="#DC2626"
            stroke="#FECACA"
            strokeWidth={0.8}
          />
          {/* 裂隙暗纹 */}
          <Path
            d="M12 4.5 L11.1 10.5 L13.2 13.5 L12 19.5"
            stroke="#450A0A"
            strokeWidth={1}
            fill="none"
          />
          <Circle cx="12" cy="12" r="2.2" fill="#FEE2E2" />
        </Svg>
      </Animated.View>
    </Pressable>
  );
});

const sharedBloodQuoteBag = createQuoteBag<BloodMoonQuote>(BLOOD_MOON_QUOTES);

export interface BloodMoonRealmProps {
  w: number;
  h: number;
  insetTop: number;
  insetBottom: number;
  compact: boolean;
  motion: boolean;
  allowRichDecor: boolean;
  allowFullDecor: boolean;
  exiting: boolean;
  moonInfo: MoonPhaseInfo;
  onExit: () => void;
  onExited?: () => void;
}

export const BloodMoonRealm = memo(function BloodMoonRealm({
  w,
  h,
  insetTop,
  insetBottom,
  compact,
  motion,
  allowRichDecor,
  allowFullDecor,
  exiting,
  moonInfo,
  onExit,
  onExited,
}: BloodMoonRealmProps) {
  const reduceMotion = useReducedMotion();
  const [quote, setQuote] = useState<BloodMoonQuote>(() =>
    sharedBloodQuoteBag.next(),
  );
  const [whisperBanner, setWhisperBanner] = useState("");
  const [owlWhisper, setOwlWhisper] = useState("");
  const [activeArrayFlash, setActiveArrayFlash] = useState(false);

  const realmOpacity = useSharedValue(0);
  const vignettePulse = useSharedValue(0.3);
  const heartbeatPulse = useSharedValue(0);
  const coronaSpin = useSharedValue(0);
  const moonPulse = useSharedValue(0);
  const owlSway = useSharedValue(0);
  const owlHop = useSharedValue(1);
  const owlBubbleAnim = useSharedValue(0);
  const quoteFade = useSharedValue(1);
  const quoteLift = useSharedValue(0);

  const moonWhisperCursorRef = useRef(0);
  const owlWhisperCursorRef = useRef(0);
  const bannerTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const owlTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const flashTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (bannerTimerRef.current) clearTimeout(bannerTimerRef.current);
      if (owlTimerRef.current) clearTimeout(owlTimerRef.current);
      if (flashTimerRef.current) clearTimeout(flashTimerRef.current);
    };
  }, []);

  useEffect(() => {
    if (exiting) {
      realmOpacity.value = withTiming(
        0,
        {
          duration: reduceMotion ? 140 : 380,
          easing: Easing.inOut(Easing.cubic),
        },
        (finished) => {
          if (finished && onExited) runOnJS(onExited)();
        },
      );
      return () => cancelAnimation(realmOpacity);
    }
    realmOpacity.value = withTiming(1, {
      duration: reduceMotion ? 140 : 420,
      easing: Easing.out(Easing.cubic),
    });
    return () => cancelAnimation(realmOpacity);
  }, [exiting, onExited, realmOpacity, reduceMotion]);

  useEffect(() => {
    if (!motion) {
      vignettePulse.value = 0.45;
      coronaSpin.value = 0;
      owlSway.value = 0;
      heartbeatPulse.value = 0;
      return;
    }

    vignettePulse.value = withRepeat(
      withSequence(
        withTiming(0.85, { duration: 3600, easing: Easing.inOut(Easing.sin) }),
        withTiming(0.28, { duration: 3600, easing: Easing.inOut(Easing.sin) }),
      ),
      -1,
    );

    coronaSpin.value = 0;
    coronaSpin.value = withRepeat(
      withTiming(360, { duration: 28000, easing: Easing.linear }),
      -1,
      false,
    );

    owlSway.value = withRepeat(
      withSequence(
        withTiming(1, { duration: 2800, easing: Easing.inOut(Easing.sin) }),
        withTiming(-1, { duration: 2800, easing: Easing.inOut(Easing.sin) }),
      ),
      -1,
    );

    if (allowRichDecor) {
      heartbeatPulse.value = withRepeat(
        withSequence(
          withDelay(3400, withTiming(0.7, { duration: 150 })),
          withTiming(0.15, { duration: 180 }),
          withTiming(0.95, { duration: 150 }),
          withTiming(0, { duration: 720, easing: Easing.out(Easing.cubic) }),
        ),
        -1,
      );
    } else {
      heartbeatPulse.value = 0;
    }

    return () => {
      cancelAnimation(vignettePulse);
      cancelAnimation(coronaSpin);
      cancelAnimation(owlSway);
      cancelAnimation(heartbeatPulse);
    };
  }, [
    allowRichDecor,
    coronaSpin,
    heartbeatPulse,
    motion,
    owlSway,
    vignettePulse,
  ]);

  useEffect(
    () => () => {
      cancelAnimation(moonPulse);
      cancelAnimation(owlHop);
      cancelAnimation(owlBubbleAnim);
      cancelAnimation(quoteFade);
      cancelAnimation(quoteLift);
    },
    [moonPulse, owlBubbleAnim, owlHop, quoteFade, quoteLift],
  );

  useEffect(() => {
    if (!owlWhisper) {
      owlBubbleAnim.value = 0;
      return;
    }
    if (reduceMotion || !motion) {
      owlBubbleAnim.value = 1;
      return;
    }
    owlBubbleAnim.value = 0;
    owlBubbleAnim.value = withSpring(1, { damping: 13, stiffness: 180 });
    return () => cancelAnimation(owlBubbleAnim);
  }, [motion, owlBubbleAnim, owlWhisper, reduceMotion]);

  const showWhisperBanner = useCallback((text: string, durationMs = 3400) => {
    setWhisperBanner(text);
    if (bannerTimerRef.current) clearTimeout(bannerTimerRef.current);
    bannerTimerRef.current = setTimeout(() => setWhisperBanner(""), durationMs);
  }, []);

  const handleBloodMoonTap = useCallback(() => {
    if (exiting) return;
    thumpHaptic();
    playSfx("horror_appear", { rate: 0.84, volume: 0.48 });
    if (motion && !reduceMotion) {
      moonPulse.value = 0;
      moonPulse.value = withTiming(1, {
        duration: 840,
        easing: Easing.out(Easing.cubic),
      });
    }
    const idx = moonWhisperCursorRef.current % BLOOD_MOON_WHISPERS.length;
    moonWhisperCursorRef.current += 1;
    showWhisperBanner(BLOOD_MOON_WHISPERS[idx], 3800);
  }, [exiting, moonPulse, motion, reduceMotion, showWhisperBanner]);

  const handleBloodOwlTap = useCallback(() => {
    if (exiting) return;
    tapHaptic();
    playSfx("owl_hoot", { rate: 0.72, volume: 0.74, ignoreCooldown: true });
    if (motion && !reduceMotion) {
      owlHop.value = withSequence(
        withTiming(1.09, { duration: 100 }),
        withSpring(1, { damping: 9, stiffness: 190 }),
      );
    }
    const idx = owlWhisperCursorRef.current % BLOOD_OWL_WHISPERS.length;
    owlWhisperCursorRef.current += 1;
    setOwlWhisper(BLOOD_OWL_WHISPERS[idx]);
    if (owlTimerRef.current) clearTimeout(owlTimerRef.current);
    owlTimerRef.current = setTimeout(() => setOwlWhisper(""), 4200);
  }, [exiting, motion, owlHop, reduceMotion]);

  const handlePluckArrayNode = useCallback(
    (index: number) => {
      if (exiting) return;
      tapHaptic();
      playSfx(resolveStarScaleSfx(index), { rate: 0.68, volume: 0.76 });
      setActiveArrayFlash(true);
      if (flashTimerRef.current) clearTimeout(flashTimerRef.current);
      flashTimerRef.current = setTimeout(() => setActiveArrayFlash(false), 360);
    },
    [exiting],
  );

  const handleNextQuote = useCallback(() => {
    if (exiting) return;
    tapHaptic();
    const next = sharedBloodQuoteBag.next(quote.id);
    setQuote(next);
    if (!reduceMotion && motion) {
      quoteFade.value = 0;
      quoteLift.value = 5;
      quoteFade.value = withTiming(1, {
        duration: 320,
        easing: Easing.out(Easing.cubic),
      });
      quoteLift.value = withTiming(0, {
        duration: 320,
        easing: Easing.out(Easing.cubic),
      });
    }
  }, [exiting, motion, quote.id, quoteFade, quoteLift, reduceMotion]);

  const moonSize = compact ? 92 : 114;
  const moonTop = insetTop + 26;
  const moonRight = 22;
  const owlSize = compact ? 86 : 102;
  const owlLeft = Math.max(12, w - moonRight - owlSize - 8);
  const owlTop = moonTop + moonSize + 10;

  const arrayTop = owlTop + (compact ? 66 : 78);
  const cardEstimate = compact ? 236 : 254;
  const arrayBottom = Math.max(
    arrayTop + 140,
    h - insetBottom - cardEstimate - (compact ? 24 : 34),
  );
  const arrayWidth = Math.min(w * 0.84, 330);
  const arrayLeft = (w - arrayWidth) / 2;
  const arrayHeight = arrayBottom - arrayTop;

  const arrayPoints = useMemo(
    () =>
      INVERTED_ARRAY_SPOTS.map((spot) => ({
        x: arrayLeft + spot.x * arrayWidth,
        y: arrayTop + spot.y * arrayHeight,
        r: spot.r,
      })),
    [arrayHeight, arrayLeft, arrayTop, arrayWidth],
  );

  const crackedThreadPaths = useMemo(() => {
    const mainSegs: string[] = [];
    const veinSegs: string[] = [];
    for (let i = 0; i < INVERTED_ARRAY_EDGES.length; i++) {
      const [a, b] = INVERTED_ARRAY_EDGES[i];
      const p1 = arrayPoints[a];
      const p2 = arrayPoints[b];
      if (!p1 || !p2) continue;
      mainSegs.push(`M${p1.x} ${p1.y} L${p2.x} ${p2.y}`);
      const mx = (p1.x + p2.x) / 2 + ((i % 2 === 0 ? 1 : -1) * 5);
      const my = (p1.y + p2.y) / 2 + ((i % 3 === 0 ? -1 : 1) * 4);
      veinSegs.push(`M${p1.x} ${p1.y} L${mx} ${my} L${p2.x} ${p2.y}`);
    }
    return {
      main: mainSegs.join(" "),
      veins: veinSegs.join(" "),
    };
  }, [arrayPoints]);

  const activeEmbers = useMemo(() => {
    if (!allowRichDecor || !motion) return [];
    return EMBER_SPECS.slice(0, allowFullDecor ? 12 : 7);
  }, [allowFullDecor, allowRichDecor, motion]);

  const rootStyle = useAnimatedStyle(() => ({
    opacity: realmOpacity.value,
  }));
  const vignetteStyle = useAnimatedStyle(() => ({
    opacity: vignettePulse.value,
  }));
  const heartbeatStyle = useAnimatedStyle(() => ({
    opacity: heartbeatPulse.value * 0.42,
  }));
  const coronaStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${coronaSpin.value}deg` }],
  }));
  const moonPulseStyle = useAnimatedStyle(() => ({
    opacity: moonPulse.value > 0 ? (1 - moonPulse.value) * 0.72 : 0,
    transform: [{ scale: 0.78 + moonPulse.value * 1.28 }],
  }));
  const owlAnimStyle = useAnimatedStyle(() => ({
    transform: [
      { translateY: owlSway.value * -2 },
      { rotate: `${owlSway.value * 1.6}deg` },
      { scale: owlHop.value },
    ],
  }));
  const owlBubbleStyle = useAnimatedStyle(() => ({
    opacity: owlBubbleAnim.value,
    transform: [
      { translateX: (1 - owlBubbleAnim.value) * 8 },
      { scale: 0.92 + owlBubbleAnim.value * 0.08 },
    ],
  }));
  const quoteTextStyle = useAnimatedStyle(() => ({
    opacity: quoteFade.value,
    transform: [{ translateY: quoteLift.value }],
  }));

  const headerMaxWidth = Math.max(176, w - moonRight - moonSize - 32);
  const attribution = formatQuoteAttribution(quote);

  return (
    <Animated.View
      accessibilityViewIsModal
      style={[styles.root, rootStyle]}
    >
      {/* 独立恐怖血月背景 */}
      <Image
        pointerEvents="none"
        source={BLOOD_MOON_BG}
        resizeMode="cover"
        fadeDuration={0}
        style={[styles.absFill, { width: w, height: h }]}
      />

      {/* 深渊黑红压暗渐变，确保中心逆星阵与底部卡片阅读对比度 */}
      <LinearGradient
        pointerEvents="none"
        colors={[
          "rgba(14,2,5,0.44)",
          "rgba(24,4,8,0.22)",
          "rgba(10,2,4,0.78)",
        ]}
        style={styles.absFill}
      />

      {/* 呼吸式深红暗角 */}
      <Animated.View pointerEvents="none" style={[styles.absFill, vignetteStyle]}>
        <Svg width={w} height={h} viewBox="0 0 100 100" preserveAspectRatio="none">
          <Defs>
            <RadialGradient id="bloodVignette" cx="50%" cy="46%" r="64%">
              <Stop offset="0" stopColor="#000000" stopOpacity={0} />
              <Stop offset="0.58" stopColor="#450A0A" stopOpacity={0.22} />
              <Stop offset="1" stopColor="#1A0205" stopOpacity={0.78} />
            </RadialGradient>
          </Defs>
          <Circle cx="50" cy="50" r="82" fill="url(#bloodVignette)" />
        </Svg>
      </Animated.View>

      {/* 偶发细微心跳边缘红脉冲 */}
      <Animated.View
        pointerEvents="none"
        style={[styles.heartbeatFrame, heartbeatStyle]}
      />

      {/* 飘浮暗烬粒子 */}
      {activeEmbers.map((ember) => (
        <EmberParticle
          key={ember.id}
          spec={ember}
          w={w}
          h={h}
          motion={motion}
        />
      ))}

      {/* 顶部诡异标题 */}
      <View
        style={[
          styles.headerWrap,
          { top: insetTop + 24, maxWidth: headerMaxWidth },
        ]}
      >
        <View style={styles.eyebrowPill}>
          <Text style={styles.eyebrowText}>BLOOD ECLIPSE</Text>
        </View>
        <Text style={styles.realmTitle}>血月禁域</Text>
        <Text style={styles.realmSub}>
          {`${moonInfo.name} · 猩红月蚀第 ${Math.max(1, Math.round(moonInfo.ageDays))} 夜`}
        </Text>
      </View>

      {/* 右上角血月（独立血月天体 + 旋转 SVG 日冕光环，轻点只触发脉动与低语，绝不退出） */}
      <View
        style={{
          position: "absolute",
          top: moonTop,
          right: moonRight,
          width: moonSize,
          height: moonSize,
          alignItems: "center",
          justifyContent: "center",
          zIndex: 5,
        }}
      >
        <View
          pointerEvents="none"
          style={{
            position: "absolute",
            width: moonSize * 2.5,
            height: moonSize * 2.5,
          }}
        >
          <Svg width="100%" height="100%" viewBox="0 0 100 100">
            <Defs>
              <RadialGradient id="bloodOrbGlow" cx="50%" cy="50%" r="50%">
                <Stop offset="0" stopColor="#EF4444" stopOpacity={0.44} />
                <Stop offset="0.42" stopColor="#991B1B" stopOpacity={0.22} />
                <Stop offset="0.78" stopColor="#450A0A" stopOpacity={0.08} />
                <Stop offset="1" stopColor="#140205" stopOpacity={0} />
              </RadialGradient>
            </Defs>
            <Circle cx="50" cy="50" r="50" fill="url(#bloodOrbGlow)" />
          </Svg>
        </View>

        <Animated.View
          pointerEvents="none"
          style={[
            {
              position: "absolute",
              width: moonSize * 1.48,
              height: moonSize * 1.48,
            },
            coronaStyle,
          ]}
        >
          <Svg width="100%" height="100%" viewBox="0 0 120 120">
            <Circle
              cx="60"
              cy="60"
              r="52"
              stroke="rgba(248,113,113,0.42)"
              strokeWidth={1.1}
              strokeDasharray="6 4 2 5"
              fill="none"
            />
            <Circle
              cx="60"
              cy="60"
              r="45"
              stroke="rgba(220,38,38,0.34)"
              strokeWidth={0.9}
              strokeDasharray="14 8"
              fill="none"
            />
            <G opacity={0.55}>
              <Path
                d="M60 3 L62 11 L58 11 Z M60 117 L62 109 L58 109 Z M3 60 L11 62 L11 58 Z M117 60 L109 62 L109 58 Z"
                fill="#FCA5A5"
              />
            </G>
          </Svg>
        </Animated.View>

        <Animated.View
          pointerEvents="none"
          style={[
            {
              position: "absolute",
              width: moonSize * 1.16,
              height: moonSize * 1.16,
              borderRadius: moonSize,
              borderWidth: 1.5,
              borderColor: "rgba(252,165,165,0.78)",
            },
            moonPulseStyle,
          ]}
        />

        <Pressable
          onPress={handleBloodMoonTap}
          hitSlop={12}
          accessibilityRole="button"
          accessibilityLabel="血月天体，轻点聆听猩红低语"
          style={{ alignItems: "center", justifyContent: "center" }}
        >
          <Image
            source={BLOOD_MOON_ORB}
            resizeMode="contain"
            fadeDuration={0}
            style={{ width: moonSize * 0.94, height: moonSize * 0.94 }}
          />
        </Pressable>
      </View>

      {/* 枯枝暗影猫头鹰 */}
      <View
        style={{
          position: "absolute",
          left: owlLeft,
          top: owlTop,
          zIndex: 6,
        }}
      >
        {owlWhisper ? (
          <Animated.View
            pointerEvents="none"
            style={[
              styles.owlWhisperBubble,
              {
                right: owlSize + 8,
                maxWidth: Math.max(132, Math.min(216, owlLeft - 14)),
              },
              owlBubbleStyle,
            ]}
          >
            <Text style={styles.owlWhisperText}>{owlWhisper}</Text>
            <Svg
              width={9}
              height={13}
              style={{ position: "absolute", right: -9, top: 14 }}
            >
              <Path
                d="M0 1 L8 6.5 L0 12"
                fill="#1D060B"
                stroke="rgba(248,113,113,0.48)"
                strokeWidth={1}
              />
            </Svg>
          </Animated.View>
        ) : null}

        <Pressable
          onPress={handleBloodOwlTap}
          hitSlop={12}
          accessibilityRole="button"
          accessibilityLabel="枯枝暗影猫头鹰，轻点聆听低语"
        >
          <Animated.View style={owlAnimStyle}>
            <Image
              source={BLOOD_OWL}
              resizeMode="contain"
              fadeDuration={0}
              style={{ width: owlSize, height: owlSize }}
            />
          </Animated.View>
        </Pressable>
      </View>

      {/* 血月低语横幅 */}
      {whisperBanner ? (
        <View
          pointerEvents="none"
          style={[styles.bannerWrap, { top: insetTop + (compact ? 94 : 108) }]}
        >
          <View style={styles.bannerPill}>
            <Text numberOfLines={2} style={styles.bannerText}>
              {whisperBanner}
            </Text>
          </View>
        </View>
      ) : null}

      {/* 中央「猩红逆星阵」：细裂血丝连线 + 暗红裂星节点 */}
      <Svg
        pointerEvents="none"
        width={w}
        height={h}
        style={styles.absFill}
      >
        <Circle
          cx={arrayLeft + arrayWidth * 0.5}
          cy={arrayTop + arrayHeight * 0.5}
          r={Math.min(arrayWidth, arrayHeight) * 0.44}
          stroke={
            activeArrayFlash
              ? "rgba(252,165,165,0.52)"
              : "rgba(185,28,28,0.28)"
          }
          strokeWidth={1}
          strokeDasharray="6 5"
          fill="none"
        />
        <Path
          d={crackedThreadPaths.main}
          stroke={
            activeArrayFlash
              ? "rgba(248,113,113,0.68)"
              : "rgba(153,27,27,0.46)"
          }
          strokeWidth={activeArrayFlash ? 1.8 : 1.25}
          fill="none"
        />
        <Path
          d={crackedThreadPaths.veins}
          stroke={
            activeArrayFlash
              ? "rgba(254,202,202,0.72)"
              : "rgba(220,38,38,0.34)"
          }
          strokeWidth={0.8}
          strokeDasharray="4 3"
          fill="none"
        />
      </Svg>

      {arrayPoints.map((pt, idx) => (
        <CrimsonArrayNode
          key={idx}
          index={idx}
          cx={pt.x}
          cy={pt.y}
          radius={pt.r}
          motion={motion}
          onPluck={handlePluckArrayNode}
        />
      ))}

      {/* 底部暗黑哥特风星笺卡片 + 「破除血月 · 逃回现实」 */}
      <View
        style={[
          styles.cardWrap,
          {
            left: w < 380 ? 14 : 20,
            right: w < 380 ? 14 : 20,
            bottom: insetBottom + (compact ? 12 : 20),
          },
        ]}
      >
        <View
          style={[
            styles.gothicCard,
            {
              paddingHorizontal: compact ? 15 : 18,
              paddingVertical: compact ? 13 : 16,
            },
          ]}
        >
          <LinearGradient
            pointerEvents="none"
            colors={[
              "rgba(32,5,11,0.94)",
              "rgba(16,3,7,0.96)",
              "rgba(26,4,10,0.95)",
            ]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.absFill}
          />

          <View style={styles.cardHeader}>
            <Text style={styles.cardEyebrow}>BLOOD ECLIPSE · 猩红夜幕</Text>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="换一句猩红夜幕摘录"
              disabled={exiting}
              hitSlop={8}
              onPress={handleNextQuote}
              style={({ pressed }) => [
                styles.nextQuoteBtn,
                pressed ? styles.nextQuoteBtnPressed : null,
              ]}
            >
              <Text style={styles.nextQuoteText}>换一句 ↗</Text>
            </Pressable>
          </View>

          <Animated.View style={[styles.quoteBody, quoteTextStyle]}>
            <Text numberOfLines={3} style={styles.quoteText}>
              {quote.text}
            </Text>
            {attribution ? (
              <Text numberOfLines={1} style={styles.quoteAttribution}>
                {attribution}
              </Text>
            ) : null}
          </Animated.View>

          <View style={styles.cardFooter}>
            <Text numberOfLines={1} style={styles.footerHint}>
              轻点逆星阵可拨动回响 · 血月无法靠轻点月轮退去
            </Text>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="破除血月，逃回现实"
              disabled={exiting}
              onPress={onExit}
              style={({ pressed }) => [
                styles.breakSealBtn,
                pressed ? styles.breakSealBtnPressed : null,
              ]}
            >
              <LinearGradient
                colors={
                  exiting
                    ? ["rgba(127,29,29,0.5)", "rgba(69,10,10,0.6)"]
                    : ["rgba(185,28,28,0.86)", "rgba(127,29,29,0.92)"]
                }
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.breakSealGradient}
              >
                <Text style={styles.breakSealText}>破除血月 · 逃回现实</Text>
              </LinearGradient>
            </Pressable>
          </View>
        </View>
      </View>
    </Animated.View>
  );
});

const styles = StyleSheet.create({
  root: {
    position: "absolute",
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
    zIndex: 30,
    backgroundColor: "#0D0205",
    overflow: "hidden",
  },
  absFill: {
    position: "absolute",
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
  },
  heartbeatFrame: {
    position: "absolute",
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
    borderWidth: 10,
    borderColor: "rgba(220,38,38,0.45)",
  },
  headerWrap: {
    position: "absolute",
    left: 20,
    zIndex: 7,
  },
  eyebrowPill: {
    alignSelf: "flex-start",
    paddingHorizontal: 8,
    paddingVertical: 2.5,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "rgba(248,113,113,0.45)",
    backgroundColor: "rgba(69,10,10,0.65)",
  },
  eyebrowText: {
    color: "#FCA5A5",
    fontSize: 9,
    fontWeight: "700",
    letterSpacing: 2.4,
  },
  realmTitle: {
    color: "#FEE2E2",
    fontSize: 21,
    fontWeight: "800",
    letterSpacing: 2,
    marginTop: 6,
  },
  realmSub: {
    color: "rgba(254,202,202,0.7)",
    fontSize: 11,
    marginTop: 3,
    letterSpacing: 0.6,
  },
  owlWhisperBubble: {
    position: "absolute",
    top: 6,
    minWidth: 120,
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "rgba(248,113,113,0.48)",
    backgroundColor: "rgba(29,6,11,0.95)",
  },
  owlWhisperText: {
    color: "#FEE2E2",
    fontSize: 11.5,
    lineHeight: 17,
  },
  bannerWrap: {
    position: "absolute",
    left: 22,
    right: 22,
    alignItems: "center",
    zIndex: 9,
  },
  bannerPill: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "rgba(248,113,113,0.46)",
    backgroundColor: "rgba(24,4,8,0.9)",
    paddingHorizontal: 13,
    paddingVertical: 7,
  },
  bannerText: {
    color: "#FECACA",
    fontSize: 11,
    lineHeight: 16,
    textAlign: "center",
  },
  cardWrap: {
    position: "absolute",
    zIndex: 10,
  },
  gothicCard: {
    borderRadius: 24,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "rgba(220,38,38,0.46)",
    backgroundColor: "rgba(16,3,7,0.94)",
    shadowColor: "#DC2626",
    shadowOpacity: 0.25,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 6 },
    elevation: 10,
  },
  cardHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  cardEyebrow: {
    color: "#FCA5A5",
    fontSize: 9.5,
    fontWeight: "700",
    letterSpacing: 2.2,
  },
  nextQuoteBtn: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "rgba(248,113,113,0.34)",
    backgroundColor: "rgba(127,29,29,0.28)",
  },
  nextQuoteBtnPressed: {
    backgroundColor: "rgba(185,28,28,0.44)",
  },
  nextQuoteText: {
    color: "#FECACA",
    fontSize: 10.5,
    fontWeight: "600",
  },
  quoteBody: {
    minHeight: 84,
    paddingTop: 10,
    justifyContent: "space-between",
  },
  quoteText: {
    color: "#FEF2F2",
    fontSize: 14,
    lineHeight: 22,
    letterSpacing: 0.3,
  },
  quoteAttribution: {
    color: "rgba(254,202,202,0.74)",
    fontSize: 11,
    textAlign: "right",
    marginTop: 6,
    letterSpacing: 0.4,
  },
  cardFooter: {
    marginTop: 12,
    gap: 10,
  },
  footerHint: {
    color: "rgba(252,165,165,0.68)",
    fontSize: 10.5,
    textAlign: "center",
    letterSpacing: 0.3,
  },
  breakSealBtn: {
    borderRadius: 999,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "rgba(252,165,165,0.62)",
  },
  breakSealBtnPressed: {
    opacity: 0.86,
  },
  breakSealGradient: {
    minHeight: 44,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 18,
    paddingVertical: 10,
  },
  breakSealText: {
    color: "#FFF1F2",
    fontSize: 13.5,
    fontWeight: "800",
    letterSpacing: 1.4,
  },
});
