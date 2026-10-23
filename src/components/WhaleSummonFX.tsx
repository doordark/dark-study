import { useEffect, useRef } from "react";
import { Image, Text, View } from "react-native";
import Animated, {
  Easing,
  interpolate,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withSpring,
  withTiming,
  type SharedValue,
} from "react-native-reanimated";

/** 贴图来源：OpenMoji（CC BY-SA 4.0） */
const WHALE = require("../../assets/stickers/whale.png");
const SPARKLES = require("../../assets/stickers/sparkles.png");
const HEART = require("../../assets/stickers/heart.png");
const BUBBLE = require("../../assets/stickers/bubble.png");

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));

/** 一段时间窗口内的 0→1 进度（工作区里用来做交错出现） */
const window01 = (v: number, from: number, to: number) =>
  clamp01((v - from) / (to - from));

interface SparkleProps {
  p: SharedValue<number>;
  source: number;
  dx: number;
  dy: number;
  size: number;
  appear: number;
}

/** 围绕大肥鱼炸开的小星光，各自带延迟 */
function Sparkle({ p, source, dx, dy, size, appear }: SparkleProps) {
  const style = useAnimatedStyle(() => {
    const t = window01(p.value, appear, appear + 0.1);
    const out = 1 - window01(p.value, 0.84, 1);
    return {
      opacity: t * out * 0.95,
      transform: [
        { translateX: dx },
        { translateY: dy - 18 * t },
        { scale: 0.5 + 0.6 * t },
        { rotate: `${t * 24}deg` },
      ],
    };
  });
  return (
    <Animated.Image
      source={source}
      style={[
        {
          position: "absolute",
          left: "50%",
          top: "50%",
          width: size,
          height: size,
          marginLeft: -size / 2,
          marginTop: -size / 2,
        },
        style,
      ]}
    />
  );
}

interface RingProps {
  p: SharedValue<number>;
  size: number;
  appear: number;
  color: string;
  /** 初始缩放 / 结束缩放 */
  from: number;
  to: number;
}

/** 水花圈：从大肥鱼身边一圈圈荡开 */
function SplashRing({ p, size, appear, color, from, to }: RingProps) {
  const style = useAnimatedStyle(() => {
    const t = window01(p.value, appear, appear + 0.36);
    return {
      opacity: (1 - t) * 0.7,
      transform: [{ scale: from + (to - from) * t }],
    };
  });
  return (
    <Animated.View
      style={[
        {
          position: "absolute",
          left: "50%",
          top: "50%",
          width: size,
          height: size,
          marginLeft: -size / 2,
          marginTop: -size / 2,
          borderRadius: size / 2,
          borderWidth: 2,
          borderColor: color,
        },
        style,
      ]}
    />
  );
}

/** 施法法阵：两圈缓慢反向旋转的细环 */
function SpellCircle({ p }: { p: SharedValue<number> }) {
  const spin = useSharedValue(0);
  useEffect(() => {
    spin.value = withRepeat(
      withTiming(1, { duration: 1800, easing: Easing.linear }),
      -1,
      false,
    );
  }, [spin]);

  const outer = useAnimatedStyle(() => {
    const t = window01(p.value, 0.6, 1);
    return {
      opacity: Math.sin(t * Math.PI) * 0.75,
      transform: [{ scale: 0.2 + 2.1 * t }, { rotate: `${spin.value * 180}deg` }],
    };
  });
  const inner = useAnimatedStyle(() => {
    const t = window01(p.value, 0.66, 1);
    return {
      opacity: Math.sin(t * Math.PI) * 0.6,
      transform: [{ scale: 0.2 + 1.5 * t }, { rotate: `${-spin.value * 260}deg` }],
    };
  });

  return (
    <>
      <Animated.View
        style={[
          {
            position: "absolute",
            left: "50%",
            top: "50%",
            width: 230,
            height: 230,
            marginLeft: -115,
            marginTop: -115,
            borderRadius: 115,
            borderWidth: 2,
            borderStyle: "dashed",
            borderColor: "#7DD3FC",
          },
          outer,
        ]}
      />
      <Animated.View
        style={[
          {
            position: "absolute",
            left: "50%",
            top: "50%",
            width: 170,
            height: 170,
            marginLeft: -85,
            marginTop: -85,
            borderRadius: 85,
            borderWidth: 1.5,
            borderColor: "#BAE6FD",
          },
          inner,
        ]}
      />
    </>
  );
}

/**
 * 召唤大肥鱼的全屏动效：
 * 1. 屏幕压暗 → 大肥鱼从右下角蹦进来（闪亮登场）
 * 2. 水花四散、星光炸开、标题弹出
 * 3. 施法法阵扩张，白光一闪，界面已换成鲸鱼风格
 */
export function WhaleSummonFX({ onDone }: { onDone: () => void }) {
  const doneRef = useRef(onDone);
  useEffect(() => {
    doneRef.current = onDone;
  }, [onDone]);

  const p = useSharedValue(0);
  const whaleIn = useSharedValue(0);
  const wiggle = useSharedValue(0);

  useEffect(() => {
    p.value = withTiming(1, { duration: 2400, easing: Easing.linear }, (f) => {
      if (f) runOnJS(fireDone)();
    });
    whaleIn.value = withDelay(
      180,
      withSpring(1, { damping: 13, stiffness: 150, mass: 1 }),
    );
    wiggle.value = withDelay(
      650,
      withRepeat(
        withTiming(1, { duration: 900, easing: Easing.inOut(Easing.sin) }),
        -1,
        true,
      ),
    );
    function fireDone() {
      doneRef.current();
    }
  }, [p, whaleIn, wiggle]);

  const overlay = useAnimatedStyle(() => ({
    opacity: interpolate(p.value, [0, 0.045, 0.86, 1], [0, 1, 1, 0]),
  }));

  const whaleStyle = useAnimatedStyle(() => ({
    opacity: interpolate(whaleIn.value, [0, 0.25, 1], [0, 1, 1]),
    transform: [
      { translateX: (1 - whaleIn.value) * 190 },
      { translateY: (1 - whaleIn.value) * 140 },
      {
        scale: interpolate(
          whaleIn.value,
          [0, 0.72, 1],
          [0.35, 1.14, 1],
        ),
      },
      { rotate: `${(1 - whaleIn.value) * -26 + (wiggle.value - 0.5) * 7}deg` },
    ],
  }));

  const titleStyle = useAnimatedStyle(() => {
    const t = window01(p.value, 0.42, 0.54);
    return {
      opacity: t * (1 - window01(p.value, 0.86, 1)),
      transform: [{ scale: interpolate(t, [0, 0.75, 1], [0.55, 1.12, 1]) }],
    };
  });

  const spellTextStyle = useAnimatedStyle(() => ({
    opacity: window01(p.value, 0.6, 0.7) * (1 - window01(p.value, 0.94, 1)),
  }));

  const flashStyle = useAnimatedStyle(() => {
    const t = window01(p.value, 0.66, 0.78);
    const out = 1 - window01(p.value, 0.78, 0.9);
    return { opacity: t * out * 0.5 };
  });

  return (
    <Animated.View
      pointerEvents="none"
      style={[
        {
          position: "absolute",
          top: 0,
          right: 0,
          bottom: 0,
          left: 0,
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: "rgba(8,25,50,0.62)",
          zIndex: 40,
        },
        overlay,
      ]}
    >
      <SpellCircle p={p} />

      <SplashRing p={p} size={150} appear={0.16} color="#7DD3FC" from={0.5} to={2.1} />
      <SplashRing p={p} size={150} appear={0.22} color="#BAE6FD" from={0.4} to={1.7} />
      <SplashRing p={p} size={150} appear={0.28} color="#E0F2FE" from={0.3} to={1.3} />

      <View
        style={{
          position: "absolute",
          left: "50%",
          top: "50%",
          width: 0,
          height: 0,
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <Sparkle p={p} source={SPARKLES} dx={-108} dy={-96} size={30} appear={0.24} />
        <Sparkle p={p} source={SPARKLES} dx={104} dy={-72} size={24} appear={0.29} />
        <Sparkle p={p} source={SPARKLES} dx={-86} dy={58} size={22} appear={0.33} />
        <Sparkle p={p} source={SPARKLES} dx={96} dy={88} size={28} appear={0.26} />
        <Sparkle p={p} source={HEART} dx={-8} dy={-120} size={26} appear={0.36} />
        <Sparkle p={p} source={BUBBLE} dx={70} dy={-128} size={20} appear={0.4} />
      </View>

      <Animated.View
        style={[
          {
            position: "absolute",
            left: "50%",
            top: "50%",
            marginLeft: -92,
            marginTop: -78,
            width: 184,
            height: 184,
            alignItems: "center",
            justifyContent: "center",
          },
          whaleStyle,
        ]}
      >
        <Image
          source={WHALE}
          style={{ width: 176, height: 176 }}
          resizeMode="contain"
        />
      </Animated.View>

      <Animated.View
        style={[
          {
            position: "absolute",
            left: 0,
            right: 0,
            top: "50%",
            marginTop: 96,
            alignItems: "center",
          },
          titleStyle,
        ]}
      >
        <Text
          style={{
            fontSize: 22,
            fontWeight: "900",
            color: "#E0F2FE",
            letterSpacing: 2,
            textShadowColor: "rgba(56,189,248,0.85)",
            textShadowOffset: { width: 0, height: 0 },
            textShadowRadius: 12,
          }}
        >
          闪亮登场！
        </Text>
        <Text
          style={{
            marginTop: 6,
            fontSize: 11,
            fontWeight: "600",
            color: "rgba(186,230,253,0.85)",
            letterSpacing: 1,
          }}
        >
          大肥鱼来啦 · 准备施法
        </Text>
      </Animated.View>

      <Animated.View
        style={[
          {
            position: "absolute",
            left: 0,
            right: 0,
            bottom: "22%",
            alignItems: "center",
          },
          spellTextStyle,
        ]}
      >
        <Text
          style={{
            fontSize: 13,
            fontWeight: "800",
            color: "#7DD3FC",
            letterSpacing: 3,
          }}
        >
          ✦ 鲸 鱼 空 间 · 开 ✦
        </Text>
      </Animated.View>

      <Animated.View
        pointerEvents="none"
        style={[
          {
            position: "absolute",
            top: 0,
            right: 0,
            bottom: 0,
            left: 0,
            backgroundColor: "#BAE6FD",
          },
          flashStyle,
        ]}
      />
    </Animated.View>
  );
}
