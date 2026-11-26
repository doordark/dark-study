import { memo, useEffect, useMemo } from 'react';
import { StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Svg, { Path } from 'react-native-svg';
import Animated, {
  cancelAnimation,
  Easing,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import { useAnimationActive } from '@/hooks/useAnimationActive';
import { useSettings } from '@/store/useSettings';
import { renderQuality } from '@/utils/renderQuality';

interface RainLayerSpec {
  id: string;
  tileW: number;
  tileH: number;
  count: number;
  minLen: number;
  maxLen: number;
  strokeWidth: number;
  opacity: number;
  softOpacity: number;
  duration: number;
  tiltDeg: number;
  seed: number;
}

const FAR_LAYER: RainLayerSpec = {
  id: 'far',
  tileW: 220,
  tileH: 220,
  count: 26,
  minLen: 8,
  maxLen: 14,
  strokeWidth: 0.85,
  opacity: 0.28,
  softOpacity: 0.16,
  duration: 1020,
  tiltDeg: 11.5,
  seed: 137,
};

const MID_LAYER: RainLayerSpec = {
  id: 'mid',
  tileW: 240,
  tileH: 260,
  count: 22,
  minLen: 13,
  maxLen: 22,
  strokeWidth: 1.2,
  opacity: 0.5,
  softOpacity: 0.28,
  duration: 640,
  tiltDeg: 13.5,
  seed: 293,
};

const NEAR_LAYER: RainLayerSpec = {
  id: 'near',
  tileW: 260,
  tileH: 300,
  count: 14,
  minLen: 20,
  maxLen: 32,
  strokeWidth: 1.6,
  opacity: 0.6,
  softOpacity: 0.34,
  duration: 430,
  tiltDeg: 15,
  seed: 521,
};

interface SplashSpot {
  xPct: number;
  yPct: number;
  size: number;
  delayMs: number;
  durationMs: number;
  pauseMs: number;
}

const SPLASH_SPOTS: readonly SplashSpot[] = [
  { xPct: 0.14, yPct: 0.34, size: 14, delayMs: 0, durationMs: 560, pauseMs: 420 },
  { xPct: 0.78, yPct: 0.38, size: 16, delayMs: 280, durationMs: 600, pauseMs: 500 },
  { xPct: 0.36, yPct: 0.52, size: 18, delayMs: 140, durationMs: 540, pauseMs: 380 },
  { xPct: 0.64, yPct: 0.6, size: 15, delayMs: 460, durationMs: 580, pauseMs: 460 },
  { xPct: 0.22, yPct: 0.72, size: 19, delayMs: 620, durationMs: 560, pauseMs: 520 },
  { xPct: 0.84, yPct: 0.78, size: 17, delayMs: 360, durationMs: 620, pauseMs: 400 },
  // 精美画质额外水花涟漪
  { xPct: 0.48, yPct: 0.44, size: 13, delayMs: 520, durationMs: 520, pauseMs: 480 },
  { xPct: 0.12, yPct: 0.58, size: 16, delayMs: 740, durationMs: 580, pauseMs: 440 },
  { xPct: 0.54, yPct: 0.68, size: 18, delayMs: 210, durationMs: 560, pauseMs: 560 },
  { xPct: 0.72, yPct: 0.84, size: 20, delayMs: 880, durationMs: 600, pauseMs: 460 },
  { xPct: 0.31, yPct: 0.86, size: 15, delayMs: 410, durationMs: 540, pauseMs: 520 },
  { xPct: 0.88, yPct: 0.49, size: 14, delayMs: 670, durationMs: 550, pauseMs: 490 },
];

function seededRand(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 0x100000000;
  };
}

/**
 * 构建严格垂直周期可平铺的雨丝路径：
 * 配合旋转后的容器，纯垂直平移 `0 -> tileH` 即可沿雨丝真实倾角匀速斜落，首尾像素级重合零跳帧。
 */
function buildSeamlessRainPaths(spec: RainLayerSpec, covW: number, covH: number) {
  const rand = seededRand(spec.seed);
  const baseDrops: { x: number; y: number; len: number; bright: boolean }[] = [];
  for (let i = 0; i < spec.count; i++) {
    // 分层网格抖动，避免雨丝扎堆或出现明显条带
    const cellX = (i + 0.15 + rand() * 0.7) / spec.count;
    const x = Math.round(((cellX * spec.tileW + rand() * 23) % spec.tileW) * 10) / 10;
    const y = Math.round(rand() * spec.tileH * 10) / 10;
    const len = Math.round((spec.minLen + rand() * (spec.maxLen - spec.minLen)) * 10) / 10;
    baseDrops.push({ x, y, len, bright: i % 2 === 0 });
  }

  const cols = Math.max(1, Math.ceil(covW / spec.tileW));
  const rows = Math.max(2, Math.ceil(covH / spec.tileH) + 2);
  const svgW = cols * spec.tileW;
  const svgH = rows * spec.tileH;

  const brightParts: string[] = [];
  const softParts: string[] = [];

  for (let r = 0; r < rows; r++) {
    const oy = r * spec.tileH;
    for (let c = 0; c < cols; c++) {
      const ox = c * spec.tileW;
      for (const d of baseDrops) {
        const seg = `M${(ox + d.x).toFixed(1)},${(oy + d.y).toFixed(1)}v${d.len.toFixed(1)}`;
        if (d.bright) brightParts.push(seg);
        else softParts.push(seg);
      }
    }
  }

  return {
    svgW,
    svgH,
    brightD: brightParts.join(''),
    softD: softParts.join(''),
  };
}

const RainDepthLayer = memo(function RainDepthLayer({
  spec,
  width,
  height,
  awake,
  night,
  sway,
}: {
  spec: RainLayerSpec;
  width: number;
  height: number;
  awake: boolean;
  night: boolean;
  sway: boolean;
}) {
  const padX = Math.ceil(height * 0.28) + 44;
  const padY = Math.ceil(width * 0.28) + 44;
  const covW = Math.max(240, Math.ceil(width + padX * 2));
  const covH = Math.max(260, Math.ceil(height + padY * 2));

  const geometry = useMemo(
    () => buildSeamlessRainPaths(spec, covW, covH),
    [spec, covW, covH],
  );

  const fall = useSharedValue(0);
  const breeze = useSharedValue(0);

  useEffect(() => {
    fall.set(0);
    breeze.set(0);
    if (awake) {
      fall.set(
        withRepeat(
          withTiming(spec.tileH, { duration: spec.duration, easing: Easing.linear }),
          -1,
          false,
        ),
      );
      if (sway) {
        breeze.set(
          withRepeat(
            withSequence(
              withTiming(1.6, { duration: 2800, easing: Easing.inOut(Easing.sin) }),
              withTiming(-1.2, { duration: 3100, easing: Easing.inOut(Easing.sin) }),
            ),
            -1,
            true,
          ),
        );
      }
    }
    return () => {
      cancelAnimation(fall);
      cancelAnimation(breeze);
    };
  }, [awake, sway, spec.tileH, spec.duration, fall, breeze]);

  const fallStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: fall.get() - spec.tileH }],
  }));

  const windStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${spec.tiltDeg + breeze.get()}deg` }],
  }));

  const strokeColor = night ? '#B9D6F0' : '#DCEEFB';
  const softStrokeColor = night ? '#96B9DA' : '#C5E1F5';

  return (
    <Animated.View
      pointerEvents="none"
      style={[
        {
          position: 'absolute',
          left: (width - covW) / 2,
          top: (height - covH) / 2,
          width: covW,
          height: covH,
          overflow: 'hidden',
        },
        windStyle,
      ]}
    >
      <Animated.View
        style={[
          {
            position: 'absolute',
            left: (covW - geometry.svgW) / 2,
            top: 0,
            width: geometry.svgW,
            height: geometry.svgH,
          },
          fallStyle,
        ]}
      >
        <Svg width={geometry.svgW} height={geometry.svgH}>
          <Path
            d={geometry.softD}
            stroke={softStrokeColor}
            strokeWidth={Math.max(0.65, spec.strokeWidth * 0.8)}
            strokeLinecap="round"
            opacity={night ? spec.softOpacity * 0.85 : spec.softOpacity}
          />
          <Path
            d={geometry.brightD}
            stroke={strokeColor}
            strokeWidth={spec.strokeWidth}
            strokeLinecap="round"
            opacity={night ? spec.opacity * 0.85 : spec.opacity}
          />
        </Svg>
      </Animated.View>
    </Animated.View>
  );
});

const RainSplash = memo(function RainSplash({
  spot,
  width,
  height,
  awake,
  night,
}: {
  spot: SplashSpot;
  width: number;
  height: number;
  awake: boolean;
  night: boolean;
}) {
  const progress = useSharedValue(0);

  useEffect(() => {
    progress.set(0);
    if (awake) {
      progress.set(
        withDelay(
          spot.delayMs,
          withRepeat(
            withSequence(
              withTiming(1, { duration: spot.durationMs, easing: Easing.out(Easing.quad) }),
              withTiming(1, { duration: spot.pauseMs, easing: Easing.linear }),
              withTiming(0, { duration: 0 }),
            ),
            -1,
            false,
          ),
        ),
      );
    }
    return () => cancelAnimation(progress);
  }, [awake, spot.delayMs, spot.durationMs, spot.pauseMs, progress]);

  const rippleStyle = useAnimatedStyle(() => {
    const p = progress.get();
    const scale = 0.26 + p * 0.96;
    // 落地瞬间微微泛亮，扩散过程柔和消散
    const opacity = p <= 0.2 ? (p / 0.2) * 0.48 : Math.max(0, (1 - (p - 0.2) / 0.8) * 0.48);
    return {
      opacity,
      transform: [{ scale }],
    };
  });

  const rippleH = Math.max(4, Math.round(spot.size * 0.36));

  return (
    <Animated.View
      pointerEvents="none"
      style={[
        {
          position: 'absolute',
          left: Math.round(width * spot.xPct - spot.size / 2),
          top: Math.round(height * spot.yPct - rippleH / 2),
          width: spot.size,
          height: rippleH,
          borderRadius: 99,
          borderWidth: 1,
          borderColor: night ? 'rgba(186, 217, 245, 0.72)' : 'rgba(228, 244, 255, 0.85)',
          backgroundColor: night ? 'rgba(164, 204, 238, 0.12)' : 'rgba(220, 241, 255, 0.14)',
        },
        rippleStyle,
      ]}
    />
  );
});

export function FarmRain({
  width,
  height,
  active,
  night = false,
}: {
  width: number;
  height: number;
  active: boolean;
  night?: boolean;
}) {
  const quality = useSettings(s => s.renderQuality);
  const preset = renderQuality(quality);
  const enabled = active && preset.rain && width > 0 && height > 0;
  const awake = useAnimationActive(enabled);
  const reduced = useReducedMotion();
  const isBeautiful = quality === 'beautiful';

  const fade = useSharedValue(0);
  useEffect(() => {
    if (enabled && !reduced) {
      fade.set(0);
      fade.set(withTiming(1, { duration: 480, easing: Easing.out(Easing.quad) }));
    } else {
      cancelAnimation(fade);
      fade.set(0);
    }
    return () => cancelAnimation(fade);
  }, [enabled, reduced, fade]);

  const fadeStyle = useAnimatedStyle(() => ({ opacity: fade.get() }));

  if (!enabled || reduced) return null;

  const splashCount = isBeautiful ? SPLASH_SPOTS.length : 6;

  return (
    <Animated.View
      pointerEvents="none"
      style={[
        {
          position: 'absolute',
          left: 0,
          top: 0,
          width,
          height,
          overflow: 'hidden',
          zIndex: 1600,
        },
        fadeStyle,
      ]}
    >
      {/* 柔和阴雨天光薄纱，让雨丝自然融入昼夜场景 */}
      <LinearGradient
        pointerEvents="none"
        colors={
          night
            ? ['rgba(24, 42, 68, 0.20)', 'rgba(34, 56, 84, 0.08)', 'rgba(18, 32, 54, 0.14)']
            : ['rgba(124, 158, 186, 0.18)', 'rgba(162, 192, 214, 0.07)', 'rgba(116, 150, 178, 0.12)']
        }
        locations={[0, 0.55, 1]}
        style={StyleSheet.absoluteFill}
      />

      {/* 远景细雨雾层 */}
      <RainDepthLayer spec={FAR_LAYER} width={width} height={height} awake={awake} night={night} sway={false} />

      {/* 中景主雨幕（带微弱阵风摆动） */}
      <RainDepthLayer spec={MID_LAYER} width={width} height={height} awake={awake} night={night} sway />

      {/* 近景轻快雨丝（精美画质开启，强化空间景深） */}
      {isBeautiful ? (
        <RainDepthLayer spec={NEAR_LAYER} width={width} height={height} awake={awake} night={night} sway />
      ) : null}

      {/* 地面雨滴水花涟漪 */}
      {SPLASH_SPOTS.slice(0, splashCount).map((spot, idx) => (
        <RainSplash key={idx} spot={spot} width={width} height={height} awake={awake} night={night} />
      ))}
    </Animated.View>
  );
}
