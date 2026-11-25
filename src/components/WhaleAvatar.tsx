import { usePathname } from "expo-router";
import { useEffect, useId } from "react";
import { StyleSheet, View } from "react-native";
import { useColorScheme } from "nativewind";
import Animated, {
  cancelAnimation,
  Easing,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withRepeat,
  withTiming,
} from "react-native-reanimated";
import Svg, {
  Circle,
  Defs,
  Ellipse,
  LinearGradient as SvgLinearGradient,
  Path,
  RadialGradient,
  Stop,
} from "react-native-svg";

import { BACKGROUND_PRESETS, resolveTint } from "@/constants/backgrounds";
import { useAnimationActive } from "@/hooks/useAnimationActive";
import { useSettings } from "@/store/useSettings";
import { renderQuality } from "@/utils/renderQuality";
import { AnimatedAtlas } from "./AnimatedAtlas";

const AVATAR = require("../../assets/whale/avatar-sheet.png");
const FRAMES = [0, 1, 2, 1, 0, 3, 0];
const HOLDS = [2600, 90, 110, 90, 2100, 350, 1800];

/**
 * 大肥鱼近景头像：
 * - `dock` 变体：用于底部悬浮栏中央，采用圆润液态玻璃珍珠徽章 + 柔边水波托底，
 *   彻底消除原图下半身生硬直线切割，并配自然呼吸浮游、微光光晕与小泡泡星闪细节。
 * - `plain` 变体：用于聊天与设置页，同样以圆弧裁切与轻柔底雾柔和收边。
 */
export function WhaleAvatar({
  size = 40,
  variant = "plain",
  active = true,
}: {
  size?: number;
  variant?: "plain" | "dock";
  /** 可选外部动画门控，默认 true */
  active?: boolean;
}) {
  const isDock = variant === "dock";
  const pathname = usePathname();
  const { colorScheme } = useColorScheme();
  const isDark = colorScheme !== "light";
  const quality = useSettings((s) => s.renderQuality);
  const bgTint = useSettings((s) => s.backgroundTint);
  const qualitySpec = renderQuality(quality);
  const reduced = useReducedMotion();

  // 兼顾前台状态、主页焦点（dock 仅在主页显示时运行）、系统减弱动态效果与画质节电档
  const dockFocused = !isDock || pathname === "/";
  const animationActive = useAnimationActive(
    active && dockFocused && !reduced && qualitySpec.idleAnimation,
  );
  const showMicroDeco = isDock && qualitySpec.particles > 0;
  const uid = useId().replace(/[^a-zA-Z0-9_-]/g, "");

  const breath = useSharedValue(0);
  const shimmer = useSharedValue(0);
  const bubbleFloat = useSharedValue(0);

  useEffect(() => {
    if (!animationActive) {
      cancelAnimation(breath);
      cancelAnimation(shimmer);
      cancelAnimation(bubbleFloat);
      breath.value = 0;
      shimmer.value = 0;
      bubbleFloat.value = 0;
      return;
    }
    breath.value = withRepeat(
      withTiming(1, {
        duration: isDock ? 2350 : 2500,
        easing: Easing.inOut(Easing.sin),
      }),
      -1,
      true,
    );
    if (isDock) {
      shimmer.value = withDelay(
        260,
        withRepeat(
          withTiming(1, {
            duration: 3100,
            easing: Easing.inOut(Easing.sin),
          }),
          -1,
          true,
        ),
      );
      if (showMicroDeco) {
        bubbleFloat.value = withDelay(
          140,
          withRepeat(
            withTiming(1, {
              duration: 2800,
              easing: Easing.inOut(Easing.sin),
            }),
            -1,
            true,
          ),
        );
      }
    }
    return () => {
      cancelAnimation(breath);
      cancelAnimation(shimmer);
      cancelAnimation(bubbleFloat);
    };
  }, [breath, shimmer, bubbleFloat, animationActive, isDock, showMicroDeco]);

  const badgeSize = isDock ? Math.round((size * 1.18) / 2) * 2 : size;
  const radius = badgeSize / 2;
  // 轻微放大并顺势下沉，让头像下半身自然没入圆形水波托底曲线，彻底隐藏原图底部直切边
  const portraitSize = Math.round(badgeSize * 1.07);
  const portraitOffsetY = Math.round(badgeSize * 0.055);
  const haloSize = badgeSize + 18;

  const preset = BACKGROUND_PRESETS[resolveTint(bgTint)];
  const accentRgb = preset.glowRgb[0];

  const bodyStyle = useAnimatedStyle(() => {
    const b = breath.value;
    if (!isDock) {
      return {
        transform: [
          { translateY: b * -1 },
          { scale: 1 + b * 0.014 },
        ],
      };
    }
    return {
      transform: [
        { translateY: 0.9 - b * 2.4 },
        { scaleX: 1.006 - b * 0.012 },
        { scaleY: 0.994 + b * 0.022 },
        { rotate: `${(b - 0.5) * 3.2}deg` },
      ],
    };
  });

  const haloStyle = useAnimatedStyle(() => ({
    opacity: 0.56 + shimmer.value * 0.34,
    transform: [{ scale: 0.94 + shimmer.value * 0.1 }],
  }));

  const sparkleStyle = useAnimatedStyle(() => ({
    opacity: 0.52 + shimmer.value * 0.48,
    transform: [
      { translateY: -bubbleFloat.value * 2.2 },
      { scale: 0.78 + shimmer.value * 0.34 },
      { rotate: `${-10 + shimmer.value * 22}deg` },
    ],
  }));

  const leftBubbleStyle = useAnimatedStyle(() => ({
    opacity: 0.42 + bubbleFloat.value * 0.48,
    transform: [
      { translateY: 1.5 - bubbleFloat.value * 4.2 },
      { translateX: -bubbleFloat.value * 1.2 },
      { scale: 0.86 + bubbleFloat.value * 0.24 },
    ],
  }));

  const rightBubbleStyle = useAnimatedStyle(() => ({
    opacity: 0.36 + (1 - bubbleFloat.value) * 0.46,
    transform: [
      { translateY: -1.5 + bubbleFloat.value * 3.2 },
      { scale: 0.82 + (1 - bubbleFloat.value) * 0.24 },
    ],
  }));

  const poolTop = isDark ? "#0D2B4C" : "#E6F6FF";
  const poolMid = isDark ? "#13466E" : "#C5EAFF";
  const poolBot = isDark ? "#156A8A" : "#8BD6FF";
  const mistColor = isDark ? "#0F4C6C" : "#DDF3FF";
  const waveColor = isDark ? "#7DD3FC" : "#FFFFFF";
  const rimHighlight = isDark ? "#E0F2FE" : "#FFFFFF";
  const rimAccent = isDark ? "#38BDF8" : "#7DD3FC";
  const shadowColor = isDark ? "#22D3EE" : "#38BDF8";

  if (!isDock) {
    return (
      <Animated.View
        style={[
          {
            width: badgeSize,
            height: badgeSize,
            borderRadius: radius,
            overflow: "hidden",
            alignItems: "center",
            justifyContent: "center",
          },
          bodyStyle,
        ]}
      >
        <Svg
          pointerEvents="none"
          style={StyleSheet.absoluteFill}
          width={badgeSize}
          height={badgeSize}
          viewBox={`0 0 ${badgeSize} ${badgeSize}`}
        >
          <Defs>
            <SvgLinearGradient id={`${uid}-pb`} x1="0%" y1="0%" x2="100%" y2="100%">
              <Stop offset="0" stopColor={poolTop} stopOpacity={isDark ? 0.9 : 0.85} />
              <Stop offset="1" stopColor={poolBot} stopOpacity={isDark ? 0.85 : 0.72} />
            </SvgLinearGradient>
          </Defs>
          <Circle cx={radius} cy={radius} r={radius} fill={`url(#${uid}-pb)`} />
        </Svg>

        <View
          style={{
            width: portraitSize,
            height: portraitSize,
            transform: [{ translateY: portraitOffsetY }],
          }}
        >
          <AnimatedAtlas
            source={AVATAR}
            columns={2}
            rows={2}
            frames={FRAMES}
            holds={HOLDS}
            width={portraitSize}
            active={animationActive}
          />
        </View>

        <Svg
          pointerEvents="none"
          style={StyleSheet.absoluteFill}
          width={badgeSize}
          height={badgeSize}
          viewBox={`0 0 ${badgeSize} ${badgeSize}`}
        >
          <Defs>
            <SvgLinearGradient id={`${uid}-pm`} x1="0%" y1="62%" x2="0%" y2="100%">
              <Stop offset="0" stopColor={mistColor} stopOpacity="0" />
              <Stop offset="0.65" stopColor={mistColor} stopOpacity={isDark ? 0.28 : 0.34} />
              <Stop offset="1" stopColor={mistColor} stopOpacity={isDark ? 0.62 : 0.74} />
            </SvgLinearGradient>
            <SvgLinearGradient id={`${uid}-pr`} x1="15%" y1="0%" x2="85%" y2="100%">
              <Stop offset="0" stopColor={rimHighlight} stopOpacity={isDark ? 0.55 : 0.9} />
              <Stop offset="1" stopColor={rimAccent} stopOpacity={isDark ? 0.45 : 0.5} />
            </SvgLinearGradient>
          </Defs>
          <Circle cx={radius} cy={radius} r={radius} fill={`url(#${uid}-pm)`} />
          <Circle
            cx={radius}
            cy={radius}
            r={radius - 0.75}
            fill="none"
            stroke={`url(#${uid}-pr)`}
            strokeWidth={1.3}
          />
        </Svg>
      </Animated.View>
    );
  }

  return (
    <View
      style={{
        width: badgeSize,
        height: badgeSize,
        alignItems: "center",
        justifyContent: "center",
        overflow: "visible",
      }}
    >
      {/* 外层柔和呼吸水波光晕（融合当前主题色调与海洋星光） */}
      <Animated.View
        pointerEvents="none"
        style={[
          {
            position: "absolute",
            width: haloSize,
            height: haloSize,
            alignItems: "center",
            justifyContent: "center",
          },
          haloStyle,
        ]}
      >
        <Svg width={haloSize} height={haloSize} viewBox={`0 0 ${haloSize} ${haloSize}`}>
          <Defs>
            <RadialGradient id={`${uid}-halo`} cx="50%" cy="50%" r="50%">
              <Stop
                offset="0.46"
                stopColor={isDark ? "#38BDF8" : "#7DD3FC"}
                stopOpacity={isDark ? 0.48 : 0.42}
              />
              <Stop
                offset="0.76"
                stopColor={`rgb(${accentRgb})`}
                stopOpacity={isDark ? 0.24 : 0.2}
              />
              <Stop offset="1" stopColor={`rgb(${accentRgb})`} stopOpacity="0" />
            </RadialGradient>
          </Defs>
          <Circle cx={haloSize / 2} cy={haloSize / 2} r={haloSize / 2} fill={`url(#${uid}-halo)`} />
        </Svg>
      </Animated.View>

      {/* 圆润浮雕液态玻璃徽章主体 + 柔边水波托底 */}
      <Animated.View
        style={[
          {
            width: badgeSize,
            height: badgeSize,
            borderRadius: radius,
            overflow: "hidden",
            alignItems: "center",
            justifyContent: "center",
            shadowColor,
            shadowOffset: { width: 0, height: 3 },
            shadowOpacity: isDark ? 0.42 : 0.26,
            shadowRadius: 8,
            // 不使用 elevation，避免 Android 缩放动效下阴影光栅化为实心方块
          },
          bodyStyle,
        ]}
      >
        {/* 底层清透水池渐变 */}
        <Svg
          pointerEvents="none"
          style={StyleSheet.absoluteFill}
          width={badgeSize}
          height={badgeSize}
          viewBox={`0 0 ${badgeSize} ${badgeSize}`}
        >
          <Defs>
            <SvgLinearGradient id={`${uid}-pool`} x1="12%" y1="0%" x2="88%" y2="100%">
              <Stop offset="0" stopColor={poolTop} stopOpacity="0.96" />
              <Stop offset="0.58" stopColor={poolMid} stopOpacity="0.94" />
              <Stop offset="1" stopColor={poolBot} stopOpacity="0.96" />
            </SvgLinearGradient>
            <RadialGradient id={`${uid}-inner-glow`} cx="50%" cy="32%" r="56%">
              <Stop
                offset="0"
                stopColor="#FFFFFF"
                stopOpacity={isDark ? 0.16 : 0.56}
              />
              <Stop offset="1" stopColor="#FFFFFF" stopOpacity="0" />
            </RadialGradient>
          </Defs>
          <Circle cx={radius} cy={radius} r={radius} fill={`url(#${uid}-pool)`} />
          <Circle cx={radius} cy={radius} r={radius} fill={`url(#${uid}-inner-glow)`} />
        </Svg>

        {/* 大肥鱼眨眼立绘：顺圆弧内嵌下沉，下缘自然过渡至圆弧外，完全无直切边 */}
        <View
          style={{
            width: portraitSize,
            height: portraitSize,
            transform: [{ translateY: portraitOffsetY }],
          }}
        >
          <AnimatedAtlas
            source={AVATAR}
            columns={2}
            rows={2}
            frames={FRAMES}
            holds={HOLDS}
            width={portraitSize}
            active={animationActive}
          />
        </View>

        {/* 前景柔边水雾托底 + 半月浪花圆弧 + 液态玻璃高光折边 */}
        <Svg
          pointerEvents="none"
          style={StyleSheet.absoluteFill}
          width={badgeSize}
          height={badgeSize}
          viewBox={`0 0 ${badgeSize} ${badgeSize}`}
        >
          <Defs>
            <SvgLinearGradient id={`${uid}-mist`} x1="0%" y1="60%" x2="0%" y2="100%">
              <Stop offset="0" stopColor={mistColor} stopOpacity="0" />
              <Stop offset="0.52" stopColor={mistColor} stopOpacity={isDark ? 0.34 : 0.36} />
              <Stop offset="0.86" stopColor={poolBot} stopOpacity={isDark ? 0.72 : 0.78} />
              <Stop offset="1" stopColor={poolBot} stopOpacity={isDark ? 0.92 : 0.94} />
            </SvgLinearGradient>
            <SvgLinearGradient id={`${uid}-wave`} x1="0%" y1="0%" x2="100%" y2="0%">
              <Stop offset="0" stopColor={waveColor} stopOpacity="0.16" />
              <Stop offset="0.5" stopColor={waveColor} stopOpacity={isDark ? 0.55 : 0.76} />
              <Stop offset="1" stopColor={waveColor} stopOpacity="0.16" />
            </SvgLinearGradient>
            <SvgLinearGradient id={`${uid}-rim`} x1="12%" y1="4%" x2="88%" y2="96%">
              <Stop offset="0" stopColor={rimHighlight} stopOpacity={isDark ? 0.76 : 0.98} />
              <Stop offset="0.42" stopColor={rimAccent} stopOpacity={isDark ? 0.5 : 0.62} />
              <Stop offset="0.78" stopColor="#2DD4BF" stopOpacity={isDark ? 0.44 : 0.42} />
              <Stop offset="1" stopColor={rimHighlight} stopOpacity={isDark ? 0.64 : 0.9} />
            </SvgLinearGradient>
          </Defs>

          {/* 柔边水雾渐变承托 */}
          <Circle cx={radius} cy={radius} r={radius} fill={`url(#${uid}-mist)`} />

          {/* 圆润水波浪弧托底，营造从水面探头的可爱感 */}
          <Path
            d={`M ${badgeSize * 0.04} ${badgeSize * 0.85} Q ${badgeSize * 0.30} ${badgeSize * 0.78} ${badgeSize * 0.52} ${badgeSize * 0.85} T ${badgeSize * 0.96} ${badgeSize * 0.83} L ${badgeSize} ${badgeSize} L 0 ${badgeSize} Z`}
            fill={isDark ? "rgba(56,189,248,0.22)" : "rgba(255,255,255,0.44)"}
          />
          <Path
            d={`M ${badgeSize * 0.08} ${badgeSize * 0.85} Q ${badgeSize * 0.30} ${badgeSize * 0.785} ${badgeSize * 0.52} ${badgeSize * 0.85} T ${badgeSize * 0.92} ${badgeSize * 0.835}`}
            fill="none"
            stroke={`url(#${uid}-wave)`}
            strokeWidth={1.35}
            strokeLinecap="round"
          />

          {/* 顶部左上玻璃水滴反光 */}
          <Ellipse
            cx={badgeSize * 0.32}
            cy={badgeSize * 0.16}
            rx={badgeSize * 0.17}
            ry={badgeSize * 0.065}
            transform={`rotate(-22 ${badgeSize * 0.32} ${badgeSize * 0.16})`}
            fill="#FFFFFF"
            fillOpacity={isDark ? 0.22 : 0.48}
          />

          {/* 液态玻璃浮雕亮边 */}
          <Circle
            cx={radius}
            cy={radius}
            r={radius - 0.95}
            fill="none"
            stroke={`url(#${uid}-rim)`}
            strokeWidth={1.8}
          />
        </Svg>
      </Animated.View>

      {/* 轻盈小泡泡 & 迷你星光细节（流畅档自动隐藏，标准/精美档优雅漂浮） */}
      {showMicroDeco ? (
        <>
          {/* 右上小四角星光 */}
          <Animated.View
            pointerEvents="none"
            style={[
              {
                position: "absolute",
                top: -3,
                right: -3,
                width: 11,
                height: 11,
              },
              sparkleStyle,
            ]}
          >
            <Svg width={11} height={11} viewBox="0 0 12 12">
              <Path
                d="M6 0.5 L7.4 4.6 L11.5 6 L7.4 7.4 L6 11.5 L4.6 7.4 L0.5 6 L4.6 4.6 Z"
                fill={isDark ? "#BAE6FD" : "#38BDF8"}
              />
              <Circle cx="6" cy="6" r="1.4" fill="#FFFFFF" />
            </Svg>
          </Animated.View>

          {/* 左上悬浮水泡泡 */}
          <Animated.View
            pointerEvents="none"
            style={[
              {
                position: "absolute",
                top: 1,
                left: -4,
                width: 7,
                height: 7,
                borderRadius: 3.5,
                borderWidth: 1,
                borderColor: isDark ? "rgba(186,230,253,0.78)" : "rgba(56,189,248,0.68)",
                backgroundColor: isDark ? "rgba(125,211,252,0.18)" : "rgba(255,255,255,0.68)",
              },
              leftBubbleStyle,
            ]}
          >
            <View
              style={{
                position: "absolute",
                top: 1,
                left: 1,
                width: 2,
                height: 2,
                borderRadius: 1,
                backgroundColor: "#FFFFFF",
              }}
            />
          </Animated.View>

          {/* 右下小水珠 */}
          <Animated.View
            pointerEvents="none"
            style={[
              {
                position: "absolute",
                bottom: 2,
                right: -3,
                width: 5,
                height: 5,
                borderRadius: 2.5,
                backgroundColor: isDark ? "rgba(125,211,252,0.72)" : "rgba(56,189,248,0.58)",
              },
              rightBubbleStyle,
            ]}
          />
        </>
      ) : null}
    </View>
  );
}
