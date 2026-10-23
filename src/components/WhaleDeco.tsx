import { useEffect } from "react";
import { View } from "react-native";
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withTiming,
} from "react-native-reanimated";

/** 贴图来源：OpenMoji（CC BY-SA 4.0） */
const WHALE = require("../../assets/stickers/whale.png");
const WHALE2 = require("../../assets/stickers/whale2.png");
const BUBBLE = require("../../assets/stickers/bubble.png");
const HEART = require("../../assets/stickers/heart.png");
const RICE = require("../../assets/stickers/rice.png");
const SPARKLES = require("../../assets/stickers/sparkles.png");
const FISH = require("../../assets/stickers/fish.png");

interface DecoItem {
  key: string;
  src: number;
  size: number;
  /** 相对聊天区域的定位，用百分比保证不同屏幕都在边角 */
  left?: `${number}%`;
  right?: `${number}%`;
  top?: `${number}%`;
  bottom?: `${number}%`;
  opacity: number;
  drift: number;
  duration: number;
  delay: number;
}

const ITEMS: DecoItem[] = [
  {
    key: "whale",
    src: WHALE,
    size: 46,
    left: "3%",
    top: "7%",
    opacity: 0.45,
    drift: 8,
    duration: 4200,
    delay: 0,
  },
  {
    key: "bubble",
    src: BUBBLE,
    size: 26,
    right: "9%",
    top: "15%",
    opacity: 0.4,
    drift: 6,
    duration: 3400,
    delay: 300,
  },
  {
    key: "sparkles",
    src: SPARKLES,
    size: 24,
    right: "18%",
    top: "4%",
    opacity: 0.42,
    drift: 7,
    duration: 3800,
    delay: 700,
  },
  {
    key: "heart",
    src: HEART,
    size: 22,
    left: "11%",
    bottom: "20%",
    opacity: 0.42,
    drift: 9,
    duration: 4600,
    delay: 500,
  },
  {
    key: "rice",
    src: RICE,
    size: 30,
    right: "7%",
    bottom: "28%",
    opacity: 0.45,
    drift: 8,
    duration: 4000,
    delay: 900,
  },
  {
    key: "whale2",
    src: WHALE2,
    size: 26,
    left: "6%",
    bottom: "9%",
    opacity: 0.3,
    drift: 6,
    duration: 5000,
    delay: 200,
  },
  {
    key: "fish",
    src: FISH,
    size: 24,
    right: "26%",
    bottom: "14%",
    opacity: 0.28,
    drift: 7,
    duration: 4400,
    delay: 1100,
  },
];

/** 单个漂浮贴图：上下缓慢浮动 + 轻微摆动，互不打扰 */
function Floating({ item }: { item: DecoItem }) {
  const t = useSharedValue(0);

  useEffect(() => {
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
  }, [t, item.delay, item.duration]);

  const style = useAnimatedStyle(() => {
    return {
      transform: [
        { translateY: -item.drift + t.value * item.drift * 2 },
        { rotate: `${(t.value - 0.5) * 8}deg` },
      ],
    };
  });

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
          opacity: item.opacity,
        },
        style,
      ]}
    />
  );
}

/** 鲸鱼模式下聊天区的可爱装饰层：浅蓝薄雾 + 漂来漂去的小贴图 */
export function WhaleDeco() {
  return (
    <View
      pointerEvents="none"
      style={{ position: "absolute", top: 0, right: 0, bottom: 0, left: 0 }}
    >
      <View
        style={{
          position: "absolute",
          top: 0,
          right: 0,
          bottom: 0,
          left: 0,
          backgroundColor: "rgba(56,189,248,0.06)",
        }}
      />
      {ITEMS.map((item) => (
        <Floating key={item.key} item={item} />
      ))}
    </View>
  );
}
