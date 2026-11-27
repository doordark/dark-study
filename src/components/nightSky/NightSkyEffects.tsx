import { LinearGradient } from "expo-linear-gradient";
import { memo, useCallback, useEffect, useState } from "react";
import { Image, Pressable, StyleSheet, View } from "react-native";
import Animated, {
  Easing,
  cancelAnimation,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withSpring,
  withTiming,
  type SharedValue,
} from "react-native-reanimated";
import Svg, { Circle, Defs, Path, RadialGradient, Stop } from "react-native-svg";

const WHALE_SKY_CAMEO = require("../../../assets/images/night-whale-cameo.webp");

/* -------------------------------------------------------------------------- */
/*  流星雨（隐藏旋律「小星星」彩蛋，播完 2450ms 自动卸载释放节点）              */
/* -------------------------------------------------------------------------- */

interface ShowerSpec {
  id: number;
  delay: number;
  duration: number;
  startXOffset: number;
  topOffset: number;
  length: number;
  warm: boolean;
  angleDeg: number;
  slope: number;
}

const SHOWER_SPECS: readonly ShowerSpec[] = [
  { id: 0, delay: 0, duration: 1080, startXOffset: -190, topOffset: 14, length: 158, warm: true, angleDeg: 16, slope: 0.28 },
  { id: 1, delay: 110, duration: 1180, startXOffset: -140, topOffset: 62, length: 132, warm: false, angleDeg: 15, slope: 0.27 },
  { id: 2, delay: 230, duration: 1020, startXOffset: -220, topOffset: 34, length: 174, warm: true, angleDeg: 17, slope: 0.3 },
  { id: 3, delay: 360, duration: 1220, startXOffset: -160, topOffset: 104, length: 144, warm: false, angleDeg: 15.5, slope: 0.28 },
  { id: 4, delay: 490, duration: 1100, startXOffset: -200, topOffset: 148, length: 164, warm: true, angleDeg: 16.5, slope: 0.29 },
  { id: 5, delay: 620, duration: 1160, startXOffset: -150, topOffset: 48, length: 138, warm: false, angleDeg: 15, slope: 0.27 },
  { id: 6, delay: 760, duration: 1080, startXOffset: -210, topOffset: 122, length: 170, warm: true, angleDeg: 16.5, slope: 0.29 },
  { id: 7, delay: 890, duration: 1180, startXOffset: -170, topOffset: 78, length: 148, warm: false, angleDeg: 15.5, slope: 0.28 },
  { id: 8, delay: 1020, duration: 1120, startXOffset: -195, topOffset: 168, length: 160, warm: true, angleDeg: 16, slope: 0.28 },
  { id: 9, delay: 1140, duration: 1160, startXOffset: -165, topOffset: 24, length: 142, warm: false, angleDeg: 15, slope: 0.27 },
];

const SHOWER_WARM_COLORS = [
  "rgba(253,230,138,0)",
  "rgba(253,230,138,0.52)",
  "rgba(255,251,235,0.96)",
] as const;

const SHOWER_SILVER_COLORS = [
  "rgba(186,230,253,0)",
  "rgba(186,230,253,0.54)",
  "rgba(240,249,255,0.95)",
] as const;

const ShowerStreak = memo(function ShowerStreak({
  spec,
  w,
  insetTop,
}: {
  spec: ShowerSpec;
  w: number;
  insetTop: number;
}) {
  const progress = useSharedValue(0);

  useEffect(() => {
    progress.value = 0;
    progress.value = withDelay(
      spec.delay,
      withTiming(1, {
        duration: spec.duration,
        easing: Easing.out(Easing.quad),
      }),
    );
    return () => cancelAnimation(progress);
  }, [progress, spec.delay, spec.duration]);

  const travel = w + 420;
  const startY = insetTop + spec.topOffset;
  const rotateValue = `${spec.angleDeg}deg`;

  const animStyle = useAnimatedStyle(() => {
    const p = progress.value;
    const opacity =
      p <= 0 || p >= 1
        ? 0
        : p < 0.14
          ? p / 0.14
          : p > 0.66
            ? (1 - p) / 0.34
            : 1;
    return {
      opacity,
      transform: [
        { translateX: spec.startXOffset + p * travel },
        { translateY: startY + p * travel * spec.slope },
        { rotate: rotateValue },
      ],
    };
  });

  return (
    <Animated.View
      pointerEvents="none"
      style={[styles.streakRow, animStyle]}
    >
      <LinearGradient
        colors={spec.warm ? SHOWER_WARM_COLORS : SHOWER_SILVER_COLORS}
        start={{ x: 0, y: 0.5 }}
        end={{ x: 1, y: 0.5 }}
        style={{
          width: spec.length,
          height: spec.warm ? 2.4 : 2,
          borderRadius: 2,
        }}
      />
      <View
        style={{
          width: spec.warm ? 5 : 4.2,
          height: spec.warm ? 5 : 4.2,
          borderRadius: 3,
          backgroundColor: spec.warm ? "#FFFBEB" : "#F0F9FF",
          marginLeft: -1.5,
        }}
      />
      <View
        style={{
          position: "absolute",
          right: -7,
          width: 18,
          height: 18,
          borderRadius: 9,
          backgroundColor: spec.warm
            ? "rgba(253,230,138,0.24)"
            : "rgba(186,230,253,0.22)",
        }}
      />
    </Animated.View>
  );
});

export const MeteorShower = memo(function MeteorShower({
  w,
  insetTop,
  reduced,
}: {
  w: number;
  insetTop: number;
  reduced: boolean;
}) {
  const [finished, setFinished] = useState(false);

  useEffect(() => {
    if (reduced) return;
    const timer = setTimeout(() => setFinished(true), 2450);
    return () => clearTimeout(timer);
  }, [reduced]);

  if (reduced || finished) return null;

  return (
    <View pointerEvents="none" style={[styles.fullLayer, styles.effectsZ]}>
      {SHOWER_SPECS.map((spec) => (
        <ShowerStreak key={spec.id} spec={spec} w={w} insetTop={insetTop} />
      ))}
    </View>
  );
});

/* -------------------------------------------------------------------------- */
/*  流萤旋舞（隐藏旋律「大七和弦」彩蛋，播完 2250ms 自动卸载释放节点）           */
/* -------------------------------------------------------------------------- */

interface SwarmSpec {
  id: number;
  xRatio: number;
  yRatio: number;
  size: number;
  rise: number;
  swirlRadius: number;
  swirlTurns: number;
  phase: number;
  delay: number;
  duration: number;
  coreColor: string;
  haloColor: string;
}

const SWARM_SPECS: readonly SwarmSpec[] = [
  { id: 0, xRatio: 0.16, yRatio: 0.78, size: 3.4, rise: 170, swirlRadius: 22, swirlTurns: 1.5, phase: 0.2, delay: 0, duration: 1740, coreColor: "#FEF08A", haloColor: "rgba(253,230,138,0.28)" },
  { id: 1, xRatio: 0.26, yRatio: 0.84, size: 4.2, rise: 196, swirlRadius: 28, swirlTurns: 1.8, phase: 1.4, delay: 70, duration: 1720, coreColor: "#FFFBEB", haloColor: "rgba(254,240,138,0.3)" },
  { id: 2, xRatio: 0.35, yRatio: 0.74, size: 3.2, rise: 156, swirlRadius: 18, swirlTurns: 1.4, phase: 2.3, delay: 140, duration: 1680, coreColor: "#FDE68A", haloColor: "rgba(253,230,138,0.26)" },
  { id: 3, xRatio: 0.44, yRatio: 0.82, size: 4.4, rise: 210, swirlRadius: 32, swirlTurns: 2.0, phase: 0.8, delay: 40, duration: 1780, coreColor: "#FEF08A", haloColor: "rgba(253,224,71,0.28)" },
  { id: 4, xRatio: 0.52, yRatio: 0.76, size: 3.8, rise: 184, swirlRadius: 24, swirlTurns: 1.6, phase: 3.1, delay: 210, duration: 1660, coreColor: "#FFFBEB", haloColor: "rgba(253,230,138,0.3)" },
  { id: 5, xRatio: 0.61, yRatio: 0.86, size: 3.6, rise: 198, swirlRadius: 26, swirlTurns: 1.7, phase: 1.9, delay: 120, duration: 1740, coreColor: "#FDE68A", haloColor: "rgba(254,240,138,0.26)" },
  { id: 6, xRatio: 0.69, yRatio: 0.72, size: 4.0, rise: 164, swirlRadius: 20, swirlTurns: 1.5, phase: 4.2, delay: 280, duration: 1640, coreColor: "#FEF08A", haloColor: "rgba(253,230,138,0.28)" },
  { id: 7, xRatio: 0.76, yRatio: 0.81, size: 3.3, rise: 188, swirlRadius: 30, swirlTurns: 1.9, phase: 2.8, delay: 180, duration: 1700, coreColor: "#FFFBEB", haloColor: "rgba(253,224,71,0.28)" },
  { id: 8, xRatio: 0.84, yRatio: 0.75, size: 3.9, rise: 172, swirlRadius: 22, swirlTurns: 1.4, phase: 5.0, delay: 320, duration: 1620, coreColor: "#FDE68A", haloColor: "rgba(253,230,138,0.28)" },
  { id: 9, xRatio: 0.48, yRatio: 0.68, size: 3.5, rise: 152, swirlRadius: 25, swirlTurns: 1.6, phase: 0.5, delay: 360, duration: 1640, coreColor: "#FEF08A", haloColor: "rgba(254,240,138,0.3)" },
];

const SwarmFirefly = memo(function SwarmFirefly({
  spec,
  w,
  h,
}: {
  spec: SwarmSpec;
  w: number;
  h: number;
}) {
  const progress = useSharedValue(0);

  useEffect(() => {
    progress.value = 0;
    progress.value = withDelay(
      spec.delay,
      withTiming(1, {
        duration: spec.duration,
        easing: Easing.out(Easing.cubic),
      }),
    );
    return () => cancelAnimation(progress);
  }, [progress, spec.delay, spec.duration]);

  const animStyle = useAnimatedStyle(() => {
    const p = progress.value;
    const envelope = p <= 0 || p >= 1 ? 0 : Math.sin(p * Math.PI);
    const shimmer = 0.76 + 0.24 * Math.sin(p * Math.PI * 5 + spec.phase);
    const angle = p * Math.PI * 2 * spec.swirlTurns + spec.phase;
    return {
      opacity: envelope * shimmer * 0.92,
      transform: [
        { translateX: Math.sin(angle) * spec.swirlRadius * (0.45 + p * 0.65) },
        { translateY: -p * spec.rise },
        { scale: 0.65 + envelope * 0.55 },
      ],
    };
  });

  const haloDiameter = spec.size * 3.4;

  return (
    <Animated.View
      pointerEvents="none"
      style={[
        {
          position: "absolute",
          left: spec.xRatio * w - haloDiameter / 2,
          top: spec.yRatio * h - haloDiameter / 2,
          width: haloDiameter,
          height: haloDiameter,
          alignItems: "center",
          justifyContent: "center",
        },
        animStyle,
      ]}
    >
      <View
        style={{
          position: "absolute",
          width: haloDiameter,
          height: haloDiameter,
          borderRadius: haloDiameter / 2,
          backgroundColor: spec.haloColor,
        }}
      />
      <View
        style={{
          width: spec.size,
          height: spec.size,
          borderRadius: spec.size / 2,
          backgroundColor: spec.coreColor,
        }}
      />
    </Animated.View>
  );
});

export const FireflySwarm = memo(function FireflySwarm({
  w,
  h,
  reduced,
}: {
  w: number;
  h: number;
  reduced: boolean;
}) {
  const [finished, setFinished] = useState(false);

  useEffect(() => {
    if (reduced) return;
    const timer = setTimeout(() => setFinished(true), 2250);
    return () => clearTimeout(timer);
  }, [reduced]);

  if (reduced || finished) return null;

  return (
    <View pointerEvents="none" style={[styles.fullLayer, styles.effectsZ]}>
      {SWARM_SPECS.map((spec) => (
        <SwarmFirefly key={spec.id} spec={spec} w={w} h={h} />
      ))}
    </View>
  );
});

/* -------------------------------------------------------------------------- */
/*  指尖划星光轨：固定 8 颗轻量光珠，100% UI 线程零 React 重渲染                 */
/* -------------------------------------------------------------------------- */

export interface StarDragTrailProps {
  coords: SharedValue<number[]>;
  active: SharedValue<number>;
}

const BEAD_SPECS = [
  { index: 0, size: 14, opacity: 0.94, color: "#FFFBEB", borderColor: "rgba(253,230,138,0.58)" },
  { index: 1, size: 12, opacity: 0.82, color: "#FEF08A", borderColor: "rgba(253,230,138,0.44)" },
  { index: 2, size: 10.5, opacity: 0.7, color: "#FDE68A", borderColor: "rgba(186,230,253,0.36)" },
  { index: 3, size: 9, opacity: 0.58, color: "#E0F2FE", borderColor: "rgba(186,230,253,0.3)" },
  { index: 4, size: 8, opacity: 0.46, color: "#BAE6FD", borderColor: "rgba(125,211,252,0.24)" },
  { index: 5, size: 7, opacity: 0.35, color: "#93C5FD", borderColor: "rgba(125,211,252,0.18)" },
  { index: 6, size: 6, opacity: 0.25, color: "#93C5FD", borderColor: "rgba(147,197,253,0.14)" },
  { index: 7, size: 5, opacity: 0.16, color: "#BFDBFE", borderColor: "rgba(147,197,253,0.1)" },
] as const;

const TrailBead = memo(function TrailBead({
  spec,
  coords,
  active,
}: {
  spec: (typeof BEAD_SPECS)[number];
  coords: SharedValue<number[]>;
  active: SharedValue<number>;
}) {
  const half = spec.size / 2;
  const offset = spec.index * 2;
  const baseScale = 1 - spec.index * 0.04;

  const animStyle = useAnimatedStyle(() => {
    const arr = coords.value;
    const x = arr[offset];
    const y = arr[offset + 1];
    const act = active.value;
    const valid =
      act > 0 &&
      x !== undefined &&
      y !== undefined &&
      x >= -500 &&
      y >= -500;
    return {
      opacity: valid ? spec.opacity * act : 0,
      transform: [
        { translateX: valid ? x - half : -999 },
        { translateY: valid ? y - half : -999 },
        { scale: valid ? baseScale : 0.01 },
      ],
    };
  });

  return (
    <Animated.View
      pointerEvents="none"
      style={[
        {
          position: "absolute",
          left: 0,
          top: 0,
          width: spec.size,
          height: spec.size,
          borderRadius: half,
          backgroundColor: spec.color,
          borderWidth: spec.index < 3 ? 1.5 : 1,
          borderColor: spec.borderColor,
        },
        animStyle,
      ]}
    />
  );
});

export const StarDragTrail = memo(function StarDragTrail({
  coords,
  active,
}: StarDragTrailProps) {
  return (
    <View pointerEvents="none" style={[styles.fullLayer, styles.trailZ]}>
      {BEAD_SPECS.map((spec) => (
        <TrailBead key={spec.index} spec={spec} coords={coords} active={active} />
      ))}
    </View>
  );
});

/* -------------------------------------------------------------------------- */
/*  星海大肥鱼漫游彩蛋：全身专属立绘 + 柔光 SVG 星海微光，不可见时零挂载       */
/* -------------------------------------------------------------------------- */

interface WhaleSkyCameoProps {
  visible: boolean;
  w: number;
  top: number;
  motion: boolean;
  onTap: () => void;
}

const WHALE_DUST_SPECS = [
  { id: 0, left: 6, top: 18, size: 3.2, color: "#BAE6FD", opacity: 0.78 },
  { id: 1, left: 82, top: 12, size: 2.6, color: "#FDE68A", opacity: 0.85 },
  { id: 2, left: 12, top: 76, size: 2.4, color: "#E0F2FE", opacity: 0.68 },
  { id: 3, left: 80, top: 74, size: 3.0, color: "#DDD6FE", opacity: 0.72 },
] as const;

const WhaleSkyCameoActive = memo(function WhaleSkyCameoActive({
  w,
  top,
  motion,
  onTap,
}: Omit<WhaleSkyCameoProps, "visible">) {
  const glide = useSharedValue(0);
  const bob = useSharedValue(0);
  const hop = useSharedValue(1);
  const sparkle = useSharedValue(0);

  useEffect(() => {
    if (!motion) {
      cancelAnimation(glide);
      cancelAnimation(bob);
      glide.value = 0.28;
      bob.value = 0;
      return;
    }
    glide.value = 0;
    glide.value = withRepeat(
      withTiming(1, { duration: 14800, easing: Easing.linear }),
      -1,
      false,
    );
    bob.value = 0;
    bob.value = withRepeat(
      withTiming(1, { duration: 3600, easing: Easing.linear }),
      -1,
      false,
    );
    return () => {
      cancelAnimation(glide);
      cancelAnimation(bob);
    };
  }, [bob, glide, motion]);

  useEffect(
    () => () => {
      cancelAnimation(hop);
      cancelAnimation(sparkle);
    },
    [hop, sparkle],
  );

  const handlePress = useCallback(() => {
    if (motion) {
      hop.value = withSequence(
        withTiming(1.13, { duration: 110, easing: Easing.out(Easing.cubic) }),
        withSpring(1, { damping: 8, stiffness: 195 }),
      );
      sparkle.value = 0;
      sparkle.value = withSequence(
        withTiming(1, { duration: 160, easing: Easing.out(Easing.cubic) }),
        withTiming(0, { duration: 540, easing: Easing.out(Easing.cubic) }),
      );
    }
    onTap();
  }, [hop, motion, onTap, sparkle]);

  const travelWidth = w + 144;

  const animStyle = useAnimatedStyle(() => {
    const g = glide.value;
    const edgeOpacity = g < 0.08 ? g / 0.08 : g > 0.92 ? (1 - g) / 0.08 : 1;
    const phase = bob.value * Math.PI * 2;
    return {
      opacity: edgeOpacity * 0.96,
      transform: [
        { translateX: -96 + g * travelWidth },
        { translateY: Math.sin(phase) * 7.5 },
        { rotate: `${Math.cos(phase) * 3.2}deg` },
        { scale: hop.value },
      ],
    };
  });

  const sparkleStyle = useAnimatedStyle(() => ({
    opacity: sparkle.value,
    transform: [{ scale: 0.72 + sparkle.value * 0.48 }],
  }));

  return (
    <Animated.View
      style={[
        {
          position: "absolute",
          left: 0,
          top,
          zIndex: 6,
        },
        animStyle,
      ]}
    >
      <Pressable
        onPress={handlePress}
        hitSlop={16}
        accessibilityRole="button"
        accessibilityLabel="星海漫游的大肥鱼，轻点听它说话"
        style={({ pressed }) => [
          styles.whaleStage,
          pressed ? styles.whaleStagePressed : null,
        ]}
      >
        <View pointerEvents="none" style={styles.whaleAuraWrap}>
          <Svg width={136} height={136} viewBox="0 0 100 100">
            <Defs>
              <RadialGradient id="whaleStarSeaAura" cx="50%" cy="50%" r="50%">
                <Stop offset="0" stopColor="#BAE6FD" stopOpacity={0.34} />
                <Stop offset="0.38" stopColor="#38BDF8" stopOpacity={0.16} />
                <Stop offset="0.72" stopColor="#A78BFA" stopOpacity={0.05} />
                <Stop offset="1" stopColor="#071022" stopOpacity={0} />
              </RadialGradient>
            </Defs>
            <Circle cx="50" cy="50" r="50" fill="url(#whaleStarSeaAura)" />
          </Svg>
        </View>

        <View pointerEvents="none" style={styles.whaleDustLayer}>
          {WHALE_DUST_SPECS.map((d) => (
            <View
              key={d.id}
              style={{
                position: "absolute",
                left: d.left,
                top: d.top,
                width: d.size,
                height: d.size,
                borderRadius: d.size / 2,
                backgroundColor: d.color,
                opacity: d.opacity,
              }}
            />
          ))}
        </View>

        <Animated.View
          pointerEvents="none"
          style={[styles.whaleSparkleLayer, sparkleStyle]}
        >
          <Svg width={116} height={116} viewBox="0 0 100 100">
            <Path
              d="M20 22 L21.4 25.6 L25 27 L21.4 28.4 L20 32 L18.6 28.4 L15 27 L18.6 25.6 Z"
              fill="#FDE68A"
            />
            <Path
              d="M82 26 L83.1 28.9 L86 30 L83.1 31.1 L82 34 L80.9 31.1 L78 30 L80.9 28.9 Z"
              fill="#E0F2FE"
            />
            <Path
              d="M78 76 L79.2 79.2 L82.4 80.4 L79.2 81.6 L78 84.8 L76.8 81.6 L73.6 80.4 L76.8 79.2 Z"
              fill="#FDE68A"
            />
          </Svg>
        </Animated.View>

        <Image
          source={WHALE_SKY_CAMEO}
          resizeMode="contain"
          fadeDuration={0}
          style={styles.whaleImage}
        />
      </Pressable>
    </Animated.View>
  );
});

export const WhaleSkyCameo = memo(function WhaleSkyCameo({
  visible,
  w,
  top,
  motion,
  onTap,
}: WhaleSkyCameoProps) {
  if (!visible) return null;
  return (
    <WhaleSkyCameoActive
      w={w}
      top={top}
      motion={motion}
      onTap={onTap}
    />
  );
});

const styles = StyleSheet.create({
  fullLayer: {
    position: "absolute",
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
  },
  effectsZ: {
    zIndex: 6,
  },
  trailZ: {
    zIndex: 5,
  },
  streakRow: {
    position: "absolute",
    flexDirection: "row",
    alignItems: "center",
  },
  whaleStage: {
    width: 92,
    height: 92,
    alignItems: "center",
    justifyContent: "center",
  },
  whaleStagePressed: {
    opacity: 0.9,
  },
  whaleAuraWrap: {
    position: "absolute",
    width: 136,
    height: 136,
    alignItems: "center",
    justifyContent: "center",
  },
  whaleDustLayer: {
    position: "absolute",
    width: 92,
    height: 92,
  },
  whaleSparkleLayer: {
    position: "absolute",
    width: 116,
    height: 116,
    alignItems: "center",
    justifyContent: "center",
  },
  whaleImage: {
    width: 88,
    height: 88,
  },
});
