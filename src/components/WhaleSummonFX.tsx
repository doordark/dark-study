import { useEffect, useId, useRef, useState } from "react";
import { StyleSheet, Text, View, useWindowDimensions } from "react-native";
import { useColorScheme } from "nativewind";
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
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Svg, {
  Circle,
  Defs,
  Ellipse,
  LinearGradient as SvgLinearGradient,
  Path,
  RadialGradient,
  Stop,
} from "react-native-svg";

import {
  BACKGROUND_PRESETS,
  resolveTint,
  type BackgroundTint,
} from "@/constants/backgrounds";
import { playSfx } from "@/services/soundEffects";
import { useSettings } from "@/store/useSettings";
import { useWhalePersona } from "@/store/useWhalePersona";
import { renderQuality } from "@/utils/renderQuality";
import { renderPersonaText } from "@/utils/whalePersona";

const ACTIONS = require("../../assets/whale/pet-actions-v2.png");
const TURN = require("../../assets/whale/pet-spin-v2.png");
const W = 192;
const H = 256;

const JUMP = [1, 2, 3, 4, 4, 5, 6, 7];
const WAVE = [8, 9, 10, 11, 12, 13, 14, 15];
const ARRIVE = [8, 9, 10, 11, 12, 13, 14, 15, 0];
const DEPART = [0, 1, 2, 3, 4, 5, 6, 7, 8];

type Mode = "summon" | "leave";
type Timeline = { p: SharedValue<number>; mode: Mode };

/* -------------------------------------------------------------------------- */
/*  全局扩散动效触发坐标与事件总线（零常驻组件，触发时精准从底部大肥鱼按钮绽放）     */
/* -------------------------------------------------------------------------- */

export interface WhaleWaveOrigin {
  x: number;
  y: number;
}

export type WhaleWaveKind = "enter" | "exit" | "summon" | "leave" | "theme";

export interface WhaleWaveRequest {
  kind: WhaleWaveKind;
  origin?: WhaleWaveOrigin;
  tint?: BackgroundTint;
  /** 由召唤/退场专属特效自行播放音效时设为 true，避免重复发声 */
  silent?: boolean;
}

interface ActiveWave {
  id: number;
  kind: WhaleWaveKind;
  origin?: WhaleWaveOrigin;
  tint?: BackgroundTint;
  silent?: boolean;
}

type WaveListener = (wave: ActiveWave) => void;

let lastDockOrigin: WhaleWaveOrigin | null = null;
let waveSeq = 1;
const lastWaveByKind: Partial<Record<WhaleWaveKind, number>> = {};
let lastThemeTint: BackgroundTint | undefined;
const waveListeners = new Set<WaveListener>();

/**
 * 同类型防重窗口：
 * - 路由/进退场波纹覆盖整段波纹周期与慢机路由挂载耗时（850ms），彻底杜绝
 *   ActionBar -> _layout usePathname 或 store 订阅 -> WhaleSummonFX 的二次重播与双音效。
 * - theme 切换在色调变化时立即放行，仅对同色调连点做 220ms 防抖。
 */
const WAVE_DEDUPE_MS: Record<WhaleWaveKind, number> = {
  enter: 850,
  exit: 850,
  summon: 900,
  leave: 900,
  theme: 220,
};

/** 由底部悬浮栏中央按钮上报精确屏幕坐标（window 坐标系中心点） */
export function reportWhaleDockOrigin(origin: WhaleWaveOrigin): void {
  if (
    !Number.isFinite(origin.x) ||
    !Number.isFinite(origin.y) ||
    origin.x <= 0 ||
    origin.y <= 0
  ) {
    return;
  }
  lastDockOrigin = { x: origin.x, y: origin.y };
}

export function getWhaleDockOrigin(): WhaleWaveOrigin | null {
  return lastDockOrigin;
}

/** 触发一次从底部中央大肥鱼按钮绽放的全局水波纹/径向光晕扩散动效 */
export function triggerWhaleWave(req: WhaleWaveRequest): void {
  const now = Date.now();
  const prevAt = lastWaveByKind[req.kind] ?? 0;
  const dedupeMs = WAVE_DEDUPE_MS[req.kind];
  if (req.kind === "theme") {
    if (req.tint === lastThemeTint && now - prevAt < dedupeMs) return;
    lastThemeTint = req.tint;
  } else if (now - prevAt < dedupeMs) {
    return;
  }
  lastWaveByKind[req.kind] = now;
  const payload: ActiveWave = {
    id: waveSeq++,
    kind: req.kind,
    origin: req.origin,
    tint: req.tint,
    silent: req.silent,
  };
  for (const listener of waveListeners) {
    listener(payload);
  }
}

/* -------------------------------------------------------------------------- */
/*  Worklet 时间工具                                                           */
/* -------------------------------------------------------------------------- */

function phase(value: number, start: number, end: number) {
  "worklet";
  return Math.max(0, Math.min(1, (value - start) / (end - start)));
}

function poseAt(value: number, frames: number[]) {
  "worklet";
  return frames[Math.min(frames.length - 1, Math.floor(value * frames.length))];
}

function easeOutBack(t: number) {
  "worklet";
  const c1 = 1.70158;
  const c3 = c1 + 1;
  const x = t - 1;
  return 1 + c3 * x * x * x + c1 * x * x;
}

/* -------------------------------------------------------------------------- */
/*  全局 UI 径向水波纹扩散覆盖层（挂在 _layout.tsx，空闲时完全不渲染）             */
/* -------------------------------------------------------------------------- */

const BLOOM_BASE = 320;
const RING_BASE = 220;
const WAVE_SPARKLES = [
  { angle: -Math.PI * 0.88, reach: 56, size: 7, star: false },
  { angle: -Math.PI * 0.70, reach: 72, size: 10, star: true },
  { angle: -Math.PI * 0.56, reach: 82, size: 6, star: false },
  { angle: -Math.PI * 0.44, reach: 82, size: 9, star: true },
  { angle: -Math.PI * 0.30, reach: 70, size: 6, star: false },
  { angle: -Math.PI * 0.12, reach: 54, size: 8, star: true },
] as const;

function WaveSparkle({
  p,
  spec,
  ox,
  oy,
  color,
}: {
  p: SharedValue<number>;
  spec: (typeof WAVE_SPARKLES)[number];
  ox: number;
  oy: number;
  color: string;
}) {
  const style = useAnimatedStyle(() => {
    const t = phase(p.value, 0.02, 0.62);
    const ease = 1 - (1 - t) * (1 - t);
    const dx = Math.cos(spec.angle) * spec.reach * ease;
    const dy = Math.sin(spec.angle) * spec.reach * ease - 10 * t;
    return {
      opacity: Math.sin(t * Math.PI) * 0.92,
      transform: [
        { translateX: dx },
        { translateY: dy },
        { scale: 0.45 + Math.sin(t * Math.PI) * 0.72 },
        { rotate: `${t * 48}deg` },
      ],
    };
  });

  return (
    <Animated.View
      pointerEvents="none"
      style={[
        {
          position: "absolute",
          left: ox - spec.size / 2,
          top: oy - spec.size / 2,
          width: spec.size,
          height: spec.size,
        },
        style,
      ]}
    >
      {spec.star ? (
        <Svg width={spec.size} height={spec.size} viewBox="0 0 12 12">
          <Path
            d="M6 0.4 L7.5 4.5 L11.6 6 L7.5 7.5 L6 11.6 L4.5 7.5 L0.4 6 L4.5 4.5 Z"
            fill={color}
          />
        </Svg>
      ) : (
        <View
          style={{
            width: spec.size,
            height: spec.size,
            borderRadius: spec.size / 2,
            borderWidth: 1.2,
            borderColor: color,
            backgroundColor: "rgba(255,255,255,0.28)",
          }}
        />
      )}
    </Animated.View>
  );
}

function ActiveWaveScene({
  wave,
  onFinish,
}: {
  wave: ActiveWave;
  onFinish: (id: number) => void;
}) {
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const { colorScheme } = useColorScheme();
  const isDark = colorScheme !== "light";
  const bgTint = useSettings((s) => s.backgroundTint);
  const quality = useSettings((s) => s.renderQuality);
  const reduced = useReducedMotion();
  const uid = useId().replace(/[^a-zA-Z0-9_-]/g, "");

  const qualitySpec = renderQuality(quality);
  const isSmooth = !qualitySpec.idleAnimation;
  const isRetreat = wave.kind === "leave" || wave.kind === "exit";

  const ox = wave.origin?.x ?? lastDockOrigin?.x ?? width / 2;
  const oy =
    wave.origin?.y ??
    lastDockOrigin?.y ??
    height - Math.max(insets.bottom, 12) - 36;
  const maxRadius =
    Math.hypot(Math.max(ox, width - ox), Math.max(oy, height - oy)) * 1.12;
  const bloomTargetScale = (maxRadius * 2.15) / BLOOM_BASE;
  const ringTargetScale = (maxRadius * 2.04) / RING_BASE;

  const resolvedTint = resolveTint(wave.tint ?? bgTint);
  const preset = BACKGROUND_PRESETS[resolvedTint];
  const isThemeWave = wave.kind === "theme";

  const primaryRgb = isThemeWave
    ? preset.glowRgb[0]
    : isRetreat
      ? "96,165,250"
      : "56,189,248";
  const secondaryRgb = isThemeWave
    ? preset.glowRgb[1]
    : isRetreat
      ? "165,243,252"
      : "45,212,191";
  const coreColor = isThemeWave
    ? `rgb(${preset.glowRgb[2]})`
    : isRetreat
      ? "#BAE6FD"
      : "#7DD3FC";
  const sparkleColor = isDark ? "#E0F2FE" : `rgb(${primaryRgb})`;

  const duration = reduced
    ? 240
    : isSmooth
      ? 420
      : isRetreat
        ? 560
        : 680;

  const p = useSharedValue(0);
  const finishRef = useRef(onFinish);

  useEffect(() => {
    finishRef.current = onFinish;
  }, [onFinish]);

  useEffect(() => {
    p.value = 0;
    p.value = withTiming(1, {
      duration,
      easing: Easing.out(Easing.cubic),
      reduceMotion: ReduceMotion.Never,
    });
    if (!wave.silent) {
      if (wave.kind === "enter") {
        playSfx("whale_ui_ripple", { volume: 0.44 });
      } else if (wave.kind === "theme") {
        playSfx("whale_ui_ripple", { volume: 0.56 });
      } else if (wave.kind === "exit") {
        playSfx("whale_popover_close", { volume: 0.34 });
      }
    }
    const timer = setTimeout(() => finishRef.current(wave.id), duration + 50);
    return () => {
      clearTimeout(timer);
      cancelAnimation(p);
    };
  }, [duration, p, wave.id, wave.kind, wave.silent]);

  const reducedVeilStyle = useAnimatedStyle(() => ({
    opacity: Math.sin(p.value * Math.PI) * (isDark ? 0.24 : 0.22),
  }));

  const bloomStyle = useAnimatedStyle(() => {
    const t = p.value;
    const scale = isRetreat
      ? interpolate(t, [0, 0.36, 1], [0.22, bloomTargetScale * 0.72, 0.14], Extrapolation.CLAMP)
      : 0.14 + t * (bloomTargetScale - 0.14);
    const alphaPeak = isDark ? 0.46 : 0.40;
    const opacity = isRetreat
      ? interpolate(t, [0, 0.22, 0.72, 1], [0, alphaPeak * 0.82, alphaPeak * 0.42, 0], Extrapolation.CLAMP)
      : interpolate(t, [0, 0.14, 0.62, 1], [0, alphaPeak, alphaPeak * 0.52, 0], Extrapolation.CLAMP);
    return {
      opacity,
      transform: [{ scale }],
    };
  });

  const ring1Style = useAnimatedStyle(() => {
    const t = p.value;
    const scale = isRetreat
      ? interpolate(t, [0, 1], [ringTargetScale * 0.64, 0.16], Extrapolation.CLAMP)
      : 0.18 + t * (ringTargetScale - 0.18);
    const opacity = interpolate(
      t,
      [0, 0.12, 0.65, 1],
      [0, isDark ? 0.82 : 0.74, 0.32, 0],
      Extrapolation.CLAMP,
    );
    return {
      opacity,
      transform: [{ scale }],
    };
  });

  const ring2Style = useAnimatedStyle(() => {
    const t = phase(p.value, 0.12, 1);
    const scale = isRetreat
      ? interpolate(t, [0, 1], [ringTargetScale * 0.46, 0.12], Extrapolation.CLAMP)
      : 0.16 + t * (ringTargetScale * 0.92 - 0.16);
    const opacity = interpolate(
      t,
      [0, 0.16, 0.68, 1],
      [0, isDark ? 0.68 : 0.58, 0.24, 0],
      Extrapolation.CLAMP,
    );
    return {
      opacity,
      transform: [{ scale }],
    };
  });

  const originFlashStyle = useAnimatedStyle(() => {
    const t = phase(p.value, 0, 0.42);
    return {
      opacity: Math.sin(t * Math.PI) * (isDark ? 0.85 : 0.75),
      transform: [{ scale: 0.55 + t * 1.15 }],
    };
  });

  if (reduced) {
    return (
      <Animated.View
        pointerEvents="none"
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
        style={[
          StyleSheet.absoluteFill,
          { backgroundColor: `rgb(${primaryRgb})`, zIndex: 35 },
          reducedVeilStyle,
        ]}
      />
    );
  }

  return (
    <View
      pointerEvents="none"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={[StyleSheet.absoluteFill, { overflow: "hidden", zIndex: 35 }]}
    >
      {/* 第一层：丝滑色温径向光晕扩散（GPU scale 缩放预渲染柔和径向光盘，零掉帧） */}
      <Animated.View
        style={[
          {
            position: "absolute",
            left: ox - BLOOM_BASE / 2,
            top: oy - BLOOM_BASE / 2,
            width: BLOOM_BASE,
            height: BLOOM_BASE,
          },
          bloomStyle,
        ]}
      >
        <Svg width={BLOOM_BASE} height={BLOOM_BASE} viewBox={`0 0 ${BLOOM_BASE} ${BLOOM_BASE}`}>
          <Defs>
            <RadialGradient id={`${uid}-wave-bloom`} cx="50%" cy="50%" r="50%">
              <Stop offset="0" stopColor={coreColor} stopOpacity="0.16" />
              <Stop offset="0.46" stopColor={`rgb(${primaryRgb})`} stopOpacity="0.28" />
              <Stop offset="0.74" stopColor={`rgb(${secondaryRgb})`} stopOpacity="0.54" />
              <Stop offset="0.88" stopColor="#FFFFFF" stopOpacity={isDark ? 0.46 : 0.62} />
              <Stop offset="1" stopColor={`rgb(${primaryRgb})`} stopOpacity="0" />
            </RadialGradient>
          </Defs>
          <Circle
            cx={BLOOM_BASE / 2}
            cy={BLOOM_BASE / 2}
            r={BLOOM_BASE / 2}
            fill={`url(#${uid}-wave-bloom)`}
          />
        </Svg>
      </Animated.View>

      {/* 第二层：主水波纹光环 */}
      <Animated.View
        style={[
          {
            position: "absolute",
            left: ox - RING_BASE / 2,
            top: oy - RING_BASE / 2,
            width: RING_BASE,
            height: RING_BASE,
            borderRadius: RING_BASE / 2,
            borderWidth: 2.2,
            borderColor: isDark ? "rgba(224,242,254,0.88)" : `rgba(${primaryRgb},0.78)`,
          },
          ring1Style,
        ]}
      />

      {/* 第三层：错峰伴随水波纹光环（流畅档自动省略） */}
      {!isSmooth ? (
        <Animated.View
          style={[
            {
              position: "absolute",
              left: ox - RING_BASE / 2,
              top: oy - RING_BASE / 2,
              width: RING_BASE,
              height: RING_BASE,
              borderRadius: RING_BASE / 2,
              borderWidth: 1.6,
              borderColor: `rgba(${secondaryRgb},0.82)`,
            },
            ring2Style,
          ]}
        />
      ) : null}

      {/* 起点珍珠微光脉冲 + 星闪水珠飞溅（流畅档自动省略） */}
      {!isSmooth ? (
        <>
          <Animated.View
            style={[
              {
                position: "absolute",
                left: ox - 36,
                top: oy - 36,
                width: 72,
                height: 72,
              },
              originFlashStyle,
            ]}
          >
            <Svg width={72} height={72} viewBox="0 0 72 72">
              <Defs>
                <RadialGradient id={`${uid}-origin`} cx="50%" cy="50%" r="50%">
                  <Stop offset="0" stopColor="#FFFFFF" stopOpacity="0.92" />
                  <Stop offset="0.48" stopColor={coreColor} stopOpacity="0.56" />
                  <Stop offset="1" stopColor={coreColor} stopOpacity="0" />
                </RadialGradient>
              </Defs>
              <Circle cx="36" cy="36" r="36" fill={`url(#${uid}-origin)`} />
            </Svg>
          </Animated.View>
          {WAVE_SPARKLES.map((spec, index) => (
            <WaveSparkle
              key={index}
              p={p}
              spec={spec}
              ox={ox}
              oy={oy}
              color={sparkleColor}
            />
          ))}
        </>
      ) : null}
    </View>
  );
}

/** 挂载于根布局的全局径向扩散覆盖层：无动效时返回 null，零常驻内存与过度绘制 */
export function WhaleWaveOverlay() {
  const [wave, setWave] = useState<ActiveWave | null>(null);

  useEffect(() => {
    const onWave: WaveListener = (next) => {
      setWave(next);
    };
    waveListeners.add(onWave);
    return () => {
      waveListeners.delete(onWave);
    };
  }, []);

  if (!wave) return null;
  return (
    <ActiveWaveScene
      key={wave.id}
      wave={wave}
      onFinish={(id) => setWave((cur) => (cur?.id === id ? null : cur))}
    />
  );
}

/* -------------------------------------------------------------------------- */
/*  大肥鱼召唤 & 退场灵动编排特效                                              */
/* -------------------------------------------------------------------------- */

/** 单一场景时钟驱动旋转、雀跃、招手与 Q 弹挤压拉伸，杜绝掉帧时人物与水花脱节 */
function Character({ p, mode, reduced }: Timeline & { reduced: boolean }) {
  const leaving = mode === "leave";

  const actionStyle = useAnimatedStyle(() => {
    const t = p.value;
    if (reduced) {
      return { transform: [{ translateX: 0 }, { translateY: -H }] };
    }
    if (leaving) {
      // 退场前段先温柔招手，随后蹲身蓄力准备潜回水里
      if (t < 0.36) {
        const frame = poseAt(phase(t, 0.04, 0.36), WAVE);
        return {
          transform: [
            { translateX: -(frame % 8) * W },
            { translateY: -Math.floor(frame / 8) * H },
          ],
        };
      }
      // 俏皮小蹲准备跳水（Row 0 frame 1）
      return { transform: [{ translateX: -W }, { translateY: 0 }] };
    }

    // 进场：0.38~0.56 开心原地雀跃举手笑（JUMP），0.56~0.94 轻快挥手打招呼（WAVE）
    if (t < 0.56) {
      const frame = poseAt(phase(t, 0.38, 0.56), JUMP);
      return {
        transform: [
          { translateX: -(frame % 8) * W },
          { translateY: -Math.floor(frame / 8) * H },
        ],
      };
    }
    const waveCycle = (phase(t, 0.56, 0.94) * 1.45) % 1;
    const frame = poseAt(waveCycle, WAVE);
    return {
      transform: [
        { translateX: -(frame % 8) * W },
        { translateY: -Math.floor(frame / 8) * H },
      ],
    };
  });

  const turnStyle = useAnimatedStyle(() => {
    const t = phase(p.value, leaving ? 0.44 : 0.11, leaving ? 0.70 : 0.39);
    const frame = poseAt(t, leaving ? DEPART : ARRIVE);
    return {
      transform: [
        { translateX: -(frame % 4) * W },
        { translateY: -Math.floor(frame / 4) * H },
      ],
    };
  });

  const actionLayer = useAnimatedStyle(() => ({
    opacity: reduced
      ? 1
      : leaving
        ? 1 - phase(p.value, 0.42, 0.46)
        : phase(p.value, 0.36, 0.40),
  }));

  const turnLayer = useAnimatedStyle(() => ({
    opacity: reduced
      ? 0
      : leaving
        ? phase(p.value, 0.42, 0.46)
        : 1 - phase(p.value, 0.36, 0.40),
  }));

  const body = useAnimatedStyle(() => {
    const t = p.value;
    if (reduced) return { opacity: 1 };

    if (!leaving) {
      // 进场：水门弹簧跃出（带轻微过冲高点）+ 落地 Q 弹软萌压缩 + 轻盈漂浮摇曳
      const emerge = phase(t, 0.11, 0.38);
      const springY = 1 - easeOutBack(emerge);
      const settleBounce = Math.sin(phase(t, 0.38, 0.52) * Math.PI);
      const hover = Math.sin(phase(t, 0.44, 0.92) * Math.PI * 3);
      const exitLift = phase(t, 0.88, 1.0);

      const translateY = springY * 252 - settleBounce * 10 + hover * -5.5 - exitLift * 14;
      const translateX = (1 - emerge) * 18 + Math.sin(phase(t, 0.45, 0.92) * Math.PI * 2) * 3;
      const stretchPhase = Math.sin(phase(t, 0.13, 0.34) * Math.PI);
      const squishPhase = Math.sin(phase(t, 0.35, 0.46) * Math.PI);
      const scaleX = 1 - stretchPhase * 0.08 + squishPhase * 0.09 + exitLift * 0.04;
      const scaleY = 1 + stretchPhase * 0.11 - squishPhase * 0.08 + exitLift * 0.04;
      const rotate = (1 - emerge) * 5 + Math.sin(phase(t, 0.46, 0.92) * Math.PI * 2) * 2.4;

      return {
        opacity: phase(t, 0.10, 0.18) * (1 - phase(t, 0.90, 1.0)),
        transform: [
          { translateX },
          { translateY },
          { scaleX },
          { scaleY },
          { rotate: `${rotate}deg` },
        ],
      };
    }

    // 退场：温柔招手浮游 -> 俏皮小蹲蓄力 -> 轻盈跃起甩尾转身 -> 流畅潜回水门
    const squat = Math.sin(phase(t, 0.35, 0.45) * Math.PI);
    const hop = Math.sin(phase(t, 0.44, 0.60) * Math.PI);
    const dive = phase(t, 0.58, 0.87);
    const hover = Math.sin(phase(t, 0.04, 0.35) * Math.PI * 2) * (1 - phase(t, 0.34, 0.42));

    const translateY = hover * -4.5 + squat * 9 - hop * 22 + dive * dive * 282;
    const translateX = dive * -14;
    const scaleX = 1 + squat * 0.08 - dive * 0.10;
    const scaleY = 1 - squat * 0.08 + hop * 0.06 + dive * 0.12;
    const rotate = -dive * 6.5 + hover * 1.8;

    return {
      opacity: phase(t, 0.02, 0.10) * (1 - phase(t, 0.79, 0.88)),
      transform: [
        { translateX },
        { translateY },
        { scaleX },
        { scaleY },
        { rotate: `${rotate}deg` },
      ],
    };
  });

  return (
    <View style={styles.characterClip}>
      <Animated.View style={[styles.character, body]}>
        <Animated.View style={[styles.cell, turnLayer]}>
          <Animated.Image
            source={TURN}
            fadeDuration={0}
            resizeMode="stretch"
            style={[styles.sheet, { height: H * 4 }, turnStyle]}
          />
        </Animated.View>
        <Animated.View style={[styles.cell, actionLayer]}>
          <Animated.Image
            source={ACTIONS}
            fadeDuration={0}
            resizeMode="stretch"
            style={[styles.sheet, { width: W * 8, height: H * 5 }, actionStyle]}
          />
        </Animated.View>
      </Animated.View>
    </View>
  );
}

function Portal({ p, mode, front = false }: Timeline & { front?: boolean }) {
  const uid = useId().replace(/[^a-zA-Z0-9_-]/g, "");
  const style = useAnimatedStyle(() => {
    const openRaw = phase(p.value, 0.01, mode === "leave" ? 0.18 : 0.14);
    const open = openRaw > 0 && openRaw < 1 ? Math.min(1.08, easeOutBack(openRaw)) : openRaw;
    const close = 1 - phase(p.value, mode === "leave" ? 0.83 : 0.78, 0.98);
    const shimmer = 0.94 + Math.sin(p.value * 24) * 0.06;
    return {
      opacity: Math.min(1, openRaw) * close,
      transform: [{ scaleX: open * close }, { scaleY: shimmer * (0.4 + 0.6 * close) }],
    };
  });

  if (front) {
    return (
      <Animated.View style={[styles.portal, styles.portalFront, style]}>
        <Svg width={236} height={56} viewBox="0 0 236 56">
          <Defs>
            <SvgLinearGradient id={`${uid}-front`} x1="0%" y1="0%" x2="100%" y2="0%">
              <Stop offset="0" stopColor="#7DD3FC" stopOpacity="0.25" />
              <Stop offset="0.5" stopColor="#E0F2FE" stopOpacity="0.95" />
              <Stop offset="1" stopColor="#2DD4BF" stopOpacity="0.35" />
            </SvgLinearGradient>
          </Defs>
          {/* 前半水门高光弧：自然遮住人物水面以下部分，形成真正破水而出的纵深感 */}
          <Path
            d="M 8 28 A 110 22 0 0 0 228 28"
            fill="none"
            stroke={`url(#${uid}-front)`}
            strokeWidth={2.6}
            strokeLinecap="round"
          />
        </Svg>
      </Animated.View>
    );
  }

  return (
    <Animated.View style={[styles.portal, style]}>
      <Svg width={236} height={56} viewBox="0 0 236 56">
        <Defs>
          <RadialGradient id={`${uid}-pool`} cx="50%" cy="50%" r="50%">
            <Stop offset="0" stopColor="#E0F2FE" stopOpacity="0.58" />
            <Stop offset="0.48" stopColor="#38BDF8" stopOpacity="0.42" />
            <Stop offset="0.86" stopColor="#0E7490" stopOpacity="0.28" />
            <Stop offset="1" stopColor="#0E7490" stopOpacity="0" />
          </RadialGradient>
        </Defs>
        <Ellipse cx="118" cy="28" rx="116" ry="26" fill={`url(#${uid}-pool)`} />
        <Ellipse
          cx="118"
          cy="28"
          rx="110"
          ry="22"
          fill="none"
          stroke="#7DD3FC"
          strokeOpacity="0.72"
          strokeWidth={1.8}
        />
        <Ellipse
          cx="118"
          cy="28"
          rx="84"
          ry="14"
          fill="none"
          stroke="#BAE6FD"
          strokeOpacity="0.45"
          strokeWidth={1}
        />
      </Svg>
    </Animated.View>
  );
}

function Ripple({ p, mode, index }: Timeline & { index: number }) {
  const style = useAnimatedStyle(() => {
    const start = (mode === "leave" ? 0.62 : 0.18) + index * 0.055;
    const t = phase(p.value, start, start + 0.28);
    return {
      opacity: Math.sin(t * Math.PI) * 0.72,
      transform: [{ scaleX: 0.45 + t * 1.35 }, { scaleY: 0.45 + t * 1.05 }],
    };
  });
  return <Animated.View style={[styles.ripple, style]} />;
}

/** 水花、透明气泡与星光混合粒子：精准卡在破水/落水节拍上 */
function WaterParticle({ p, mode, index }: Timeline & { index: number }) {
  const kind = index % 3; // 0: 气泡, 1: 星光, 2: 水滴
  const size = kind === 0 ? 9 + (index % 4) * 1.5 : kind === 1 ? 10 + (index % 3) * 2 : 5 + (index % 3);

  const style = useAnimatedStyle(() => {
    const baseStart = mode === "leave" ? 0.62 : 0.17;
    const start = baseStart + (index % 5) * 0.032 + (kind === 1 ? 0.06 : 0);
    const span = kind === 1 ? 0.36 : 0.28;
    const t = phase(p.value, start, start + span);
    const direction = index % 2 === 0 ? -1 : 1;
    const reach = 28 + (index % 7) * 11;
    const driftY =
      kind === 0
        ? -136 * t
        : kind === 1
          ? -158 * t - Math.sin(t * Math.PI) * 18
          : -Math.sin(t * Math.PI) * (46 + (index % 5) * 9) + 18 * t;

    return {
      opacity: Math.sin(t * Math.PI) * (kind === 1 ? 0.96 : 0.88),
      transform: [
        { translateX: direction * (16 + reach * t) },
        { translateY: driftY },
        { scale: kind === 1 ? 0.55 + Math.sin(t * Math.PI) * 0.65 : 1 - 0.42 * t },
        { rotate: `${direction * t * (kind === 1 ? 85 : 50)}deg` },
      ],
    };
  });

  if (kind === 1) {
    return (
      <Animated.View style={[styles.particle, { width: size, height: size }, style]}>
        <Svg width={size} height={size} viewBox="0 0 12 12">
          <Path
            d="M6 0.4 L7.4 4.6 L11.6 6 L7.4 7.4 L6 11.6 L4.6 7.4 L0.4 6 L4.6 4.6 Z"
            fill={index % 2 === 0 ? "#E0F2FE" : "#7DD3FC"}
          />
        </Svg>
      </Animated.View>
    );
  }

  return (
    <Animated.View
      style={[
        styles.particle,
        {
          width: size,
          height: kind === 0 ? size : size * 1.75,
          borderRadius: size,
          backgroundColor: kind === 0 ? "rgba(186,230,253,0.16)" : "#BAE6FD",
          borderWidth: kind === 0 ? 1.2 : 0,
          borderColor: "#E0F2FE",
        },
        style,
      ]}
    />
  );
}

function WhaleTransition({ mode, onDone }: { mode: Mode; onDone: () => void }) {
  const doneRef = useRef(onDone);
  const p = useSharedValue(0);
  const reduced = useReducedMotion();
  const { width, height } = useWindowDimensions();
  const persona = useWhalePersona((s) => s.persona);
  const quality = useSettings((s) => s.renderQuality);
  const uid = useId().replace(/[^a-zA-Z0-9_-]/g, "");

  const qualitySpec = renderQuality(quality);
  const particleCount = qualitySpec.particles === 0 ? 6 : qualitySpec.particles >= 20 ? 18 : 12;
  const duration = reduced ? 280 : mode === "summon" ? 2450 : 1950;
  const sceneScale = Math.min(
    1,
    Math.max(0.42, (width - 24) / 320),
    Math.max(0.42, (height - 32) / 460),
  );

  useEffect(() => {
    doneRef.current = onDone;
  }, [onDone]);

  useEffect(() => {
    p.value = 0;
    p.value = withTiming(1, {
      duration,
      easing: Easing.linear,
      reduceMotion: ReduceMotion.Never,
    });
    // 同步触发底部大肥鱼按钮位置的全局径向水波纹扩散（不重复发声）
    triggerWhaleWave({ kind: mode, silent: true });
    playSfx(mode === "summon" ? "whale_summon" : "whale_leave", {
      ignoreCooldown: true,
      volume: 0.78,
    });
    // 仅结束回调走 JS，所有姿态、弹跳、水门与粒子全在 UI 线程执行
    const timer = setTimeout(() => doneRef.current(), duration + 40);
    return () => {
      clearTimeout(timer);
      cancelAnimation(p);
    };
  }, [duration, mode, p]);

  const overlay = useAnimatedStyle(() => ({
    opacity: interpolate(p.value, [0, 0.08, 0.87, 1], [0, 1, 1, 0], Extrapolation.CLAMP),
  }));

  const aura = useAnimatedStyle(() => {
    const t = phase(p.value, mode === "leave" ? 0.02 : 0.14, mode === "leave" ? 0.86 : 0.88);
    return {
      opacity: Math.sin(t * Math.PI) * 0.78,
      transform: [{ scale: 0.84 + Math.sin(t * Math.PI) * 0.24 }],
    };
  });

  const caption = useAnimatedStyle(() => {
    const appear = phase(
      p.value,
      mode === "leave" ? 0.05 : 0.40,
      mode === "leave" ? 0.17 : 0.54,
    );
    const fade = 1 - phase(p.value, 0.84, 0.98);
    return {
      opacity: reduced ? 1 : appear * fade,
      transform: [
        { translateY: reduced ? 0 : (1 - easeOutBack(appear)) * 12 },
        { scale: reduced ? 1 : 0.94 + appear * 0.06 },
      ],
    };
  });

  return (
    <Animated.View
      pointerEvents="none"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={[styles.overlay, overlay]}
    >
      <View style={[styles.scene, { transform: [{ scale: sceneScale }] }]}>
        {/* 柔和海面星辉光场，烘托大肥鱼立体层次 */}
        {!reduced ? (
          <Animated.View style={[styles.aura, aura]}>
            <Svg width={296} height={296} viewBox="0 0 296 296">
              <Defs>
                <RadialGradient id={`${uid}-scene-aura`} cx="50%" cy="50%" r="50%">
                  <Stop offset="0" stopColor="#7DD3FC" stopOpacity="0.42" />
                  <Stop offset="0.52" stopColor="#38BDF8" stopOpacity="0.18" />
                  <Stop offset="1" stopColor="#0284C7" stopOpacity="0" />
                </RadialGradient>
              </Defs>
              <Circle cx="148" cy="148" r="148" fill={`url(#${uid}-scene-aura)`} />
            </Svg>
          </Animated.View>
        ) : null}

        {!reduced ? <Portal p={p} mode={mode} /> : null}
        <Character p={p} mode={mode} reduced={reduced} />
        {!reduced ? (
          <>
            <Portal p={p} mode={mode} front />
            {[0, 1, 2].map((index) => (
              <Ripple key={index} p={p} mode={mode} index={index} />
            ))}
            {Array.from({ length: particleCount }, (_, index) => (
              <WaterParticle key={index} p={p} mode={mode} index={index} />
            ))}
          </>
        ) : null}

        <Animated.View style={[styles.caption, caption]}>
          <View style={styles.eyebrowPill}>
            <Text style={styles.eyebrow}>
              {mode === "summon" ? "✦ 鲸鱼空间 · 开 ✦" : "✦ 暂时潜水中 ✦"}
            </Text>
          </View>
          <Text style={styles.title}>
            {mode === "summon"
              ? "喊我就来！"
              : renderPersonaText("一会儿见，{{user}}", persona)}
          </Text>
          <Text style={styles.subtitle}>
            {mode === "summon"
              ? renderPersonaText("{{char}}扑通跃出水面，开心地朝你挥手", persona)
              : "甩甩尾巴回水里歇一会儿，想我就喊我"}
          </Text>
        </Animated.View>
      </View>
    </Animated.View>
  );
}

export function WhaleSummonFX({ onDone }: { onDone: () => void }) {
  return <WhaleTransition mode="summon" onDone={onDone} />;
}

export function WhaleLeaveFX({ onDone }: { onDone: () => void }) {
  return <WhaleTransition mode="leave" onDone={onDone} />;
}

const styles = StyleSheet.create({
  overlay: {
    position: "absolute",
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(6,20,42,0.74)",
    zIndex: 40,
  },
  scene: { width: 320, height: 460 },
  aura: {
    position: "absolute",
    top: 44,
    left: 12,
    width: 296,
    height: 296,
  },
  characterClip: {
    position: "absolute",
    top: 16,
    left: 0,
    width: 320,
    height: 294,
    overflow: "hidden",
  },
  character: {
    position: "absolute",
    top: 22,
    left: (320 - W) / 2,
    width: W,
    height: H,
  },
  cell: { position: "absolute", top: 0, right: 0, bottom: 0, left: 0, overflow: "hidden" },
  sheet: { position: "absolute", top: 0, left: 0, width: W * 4 },
  portal: {
    position: "absolute",
    left: 42,
    top: 280,
    width: 236,
    height: 56,
  },
  portalFront: {
    zIndex: 6,
  },
  ripple: {
    position: "absolute",
    top: 284,
    left: 48,
    width: 224,
    height: 48,
    borderRadius: 112,
    borderWidth: 1.4,
    borderColor: "#BAE6FD",
  },
  particle: { position: "absolute", left: 156, top: 296 },
  caption: {
    position: "absolute",
    top: 348,
    left: 0,
    right: 0,
    alignItems: "center",
  },
  eyebrowPill: {
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "rgba(125,211,252,0.42)",
    backgroundColor: "rgba(14,116,144,0.28)",
  },
  eyebrow: { color: "#BAE6FD", fontSize: 10, fontWeight: "700", letterSpacing: 2.5 },
  title: { marginTop: 10, color: "#F0F9FF", fontSize: 24, fontWeight: "900", letterSpacing: 2 },
  subtitle: { marginTop: 7, color: "#BAE6FD", fontSize: 11.5, textAlign: "center" },
});
