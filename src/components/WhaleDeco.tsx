import { LinearGradient } from "expo-linear-gradient";
import { useIsFocused } from "expo-router";
import { useColorScheme } from "nativewind";
import { useEffect } from "react";
import { StyleSheet, View } from "react-native";
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

import { BACKGROUND_PRESETS, resolveTint } from "@/constants/backgrounds";
import { useAnimationActive } from "@/hooks/useAnimationActive";
import { useSettings } from "@/store/useSettings";
import { renderQuality } from "@/utils/renderQuality";

/** 角色立绘来自作者三视图；星光/泡泡等贴图来自 OpenMoji（CC BY-SA 4.0） */
const CHIBI_HAPPY = require("../../assets/character/chibi-happy.png");
const CHIBI_SLEEP = require("../../assets/character/chibi-sleep.png");
const BUBBLE = require("../../assets/stickers/bubble.png");
const HEART = require("../../assets/stickers/heart.png");
const RICE = require("../../assets/stickers/rice.png");
const SPARKLES = require("../../assets/stickers/sparkles.png");
const FISH = require("../../assets/stickers/fish.png");

interface DecoItem {
  key: string;
  src: number;
  size: number;
  /** 相对聊天区域的定位，集中在画布四角边沿，不干扰中央文字阅读 */
  left?: `${number}%`;
  right?: `${number}%`;
  top?: `${number}%`;
  bottom?: `${number}%`;
  opacityLight: number;
  opacityDark: number;
  drift: number;
  duration: number;
  delay: number;
}

const ITEMS: DecoItem[] = [
  {
    key: "whale",
    src: CHIBI_HAPPY,
    size: 40,
    left: "3%",
    top: "6%",
    opacityLight: 0.34,
    opacityDark: 0.28,
    drift: 7,
    duration: 4600,
    delay: 0,
  },
  {
    key: "bubble",
    src: BUBBLE,
    size: 24,
    right: "6%",
    top: "14%",
    opacityLight: 0.32,
    opacityDark: 0.26,
    drift: 6,
    duration: 3800,
    delay: 320,
  },
  {
    key: "sparkles",
    src: SPARKLES,
    size: 22,
    right: "14%",
    top: "4%",
    opacityLight: 0.34,
    opacityDark: 0.28,
    drift: 6,
    duration: 4100,
    delay: 700,
  },
  {
    key: "heart",
    src: HEART,
    size: 20,
    left: "7%",
    bottom: "22%",
    opacityLight: 0.3,
    opacityDark: 0.24,
    drift: 8,
    duration: 4900,
    delay: 520,
  },
  {
    key: "rice",
    src: RICE,
    size: 26,
    right: "5%",
    bottom: "28%",
    opacityLight: 0.32,
    opacityDark: 0.26,
    drift: 7,
    duration: 4300,
    delay: 920,
  },
  {
    key: "whale2",
    src: CHIBI_SLEEP,
    size: 36,
    left: "4%",
    bottom: "8%",
    opacityLight: 0.3,
    opacityDark: 0.24,
    drift: 6,
    duration: 5200,
    delay: 240,
  },
  {
    key: "fish",
    src: FISH,
    size: 22,
    right: "20%",
    bottom: "12%",
    opacityLight: 0.24,
    opacityDark: 0.2,
    drift: 6,
    duration: 4600,
    delay: 1100,
  },
];

/** 单个漂浮贴图：柔和上下浮动 + 轻盈呼吸缩放 + 微幅摆动，互不打扰 */
function Floating({
  item,
  active,
  isDark,
}: {
  item: DecoItem;
  active: boolean;
  isDark: boolean;
}) {
  const t = useSharedValue(0);
  const reduced = useReducedMotion();
  const awake = useAnimationActive(active && !reduced);

  useEffect(() => {
    if (!awake) {
      cancelAnimation(t);
      return;
    }
    t.value = withDelay(
      item.delay,
      withRepeat(
        withTiming(1, {
          duration: item.duration,
          easing: Easing.inOut(Easing.sin),
        }),
        -1,
        true,
      ),
    );
    return () => cancelAnimation(t);
  }, [t, item.delay, item.duration, awake]);

  const style = useAnimatedStyle(() => ({
    transform: [
      { translateY: -item.drift + t.value * item.drift * 2 },
      { scale: 0.96 + t.value * 0.08 },
      { rotate: `${(t.value - 0.5) * 7}deg` },
    ],
  }));

  return (
    <Animated.Image
      source={item.src}
      resizeMode="contain"
      style={[
        {
          position: "absolute",
          left: item.left,
          right: item.right,
          top: item.top,
          bottom: item.bottom,
          width: item.size,
          height: item.size,
          opacity: isDark ? item.opacityDark : item.opacityLight,
        },
        style,
      ]}
    />
  );
}

/** 鲸鱼模式下聊天区的主题自适应轻盈装饰层：柔色渐变薄雾 + 边角漂浮小贴图 */
export function WhaleDeco({ active = true }: { active?: boolean }) {
  const focused = useIsFocused();
  const { colorScheme } = useColorScheme();
  const isDark = colorScheme !== "light";
  const quality = useSettings((s) => s.renderQuality);
  const backgroundTint = useSettings((s) => s.backgroundTint);
  const count = renderQuality(quality).particles;
  if (!count) return null;

  const preset = BACKGROUND_PRESETS[resolveTint(backgroundTint)];
  const primaryGlow = preset.glowRgb[0];
  const secondaryGlow = preset.glowRgb[2];

  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      <LinearGradient
        colors={
          isDark
            ? [
                `rgba(${primaryGlow},0.06)`,
                "rgba(15,23,42,0)",
                `rgba(${secondaryGlow},0.05)`,
              ]
            : [
                `rgba(${primaryGlow},0.07)`,
                "rgba(255,255,255,0)",
                `rgba(${secondaryGlow},0.05)`,
              ]
        }
        start={{ x: 0.1, y: 0 }}
        end={{ x: 0.9, y: 1 }}
        style={StyleSheet.absoluteFill}
      />
      {ITEMS.slice(0, count).map((item) => (
        <Floating key={item.key} item={item} active={focused && active} isDark={isDark} />
      ))}
    </View>
  );
}
