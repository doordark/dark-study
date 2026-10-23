import { useEffect, useRef } from "react";
import { Image, Text } from "react-native";
import Animated, {
  Easing,
  interpolate,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withSpring,
  withTiming,
  type SharedValue,
} from "react-native-reanimated";

/** 角色立绘来自作者提供的三视图；星光贴图来自 OpenMoji（CC BY-SA 4.0） */
const WHALE = require("../../assets/character/whale-front.png");
const SPARKLES = require("../../assets/stickers/sparkles.png");
const HEART = require("../../assets/stickers/heart.png");
const BUBBLE = require("../../assets/stickers/bubble.png");

// 这两个工具函数会被 useAnimatedStyle 的 worklet 调用，
// 必须显式声明为 worklet，否则 UI 线程会当成远程函数同步调用而直接崩溃
const clamp01 = (v: number) => {
  "worklet";
  return Math.min(1, Math.max(0, v));
};
const window01 = (v: number, from: number, to: number) => {
  "worklet";
  return clamp01((v - from) / (to - from));
};

interface SparkleProps {
  p: SharedValue<number>;
  source: number;
  dx: number;
  dy: number;
  size: number;
  appear: number;
}

function Sparkle({ p, source, dx, dy, size, appear }: SparkleProps) {
  const style = useAnimatedStyle(() => {
    const t = window01(p.value, appear, appear + 0.1);
    const out = 1 - window01(p.value, 0.84, 1);
    return {
      opacity: t * out * 0.9,
      transform: [
        { translateX: dx },
        { translateY: dy - 16 * t },
        { scale: 0.5 + 0.6 * t },
        { rotate: `${t * 20}deg` },
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
  from: number;
  to: number;
}

function SplashRing({ p, size, appear, color, from, to }: RingProps) {
  const style = useAnimatedStyle(() => {
    const t = window01(p.value, appear, appear + 0.34);
    return {
      opacity: (1 - t) * 0.6,
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
          borderWidth: 1.5,
          borderColor: color,
        },
        style,
      ]}
    />
  );
}

/** 施法法阵：两圈细环反向旋转，不带虚线，避免 Android 渲染异常 */
function SpellCircle({ p }: { p: SharedValue<number> }) {
  const spin = useSharedValue(0);
  useEffect(() => {
    spin.value = withRepeat(
      withTiming(1, { duration: 2000, easing: Easing.linear }),
      -1,
      false,
    );
  }, [spin]);

  const outer = useAnimatedStyle(() => {
    const t = window01(p.value, 0.58, 1);
    return {
      opacity: Math.sin(t * Math.PI) * 0.65,
      transform: [{ scale: 0.2 + 2.2 * t }, { rotate: `${spin.value * 200}deg` }],
    };
  });
  const inner = useAnimatedStyle(() => {
    const t = window01(p.value, 0.64, 1);
    return {
      opacity: Math.sin(t * Math.PI) * 0.55,
      transform: [{ scale: 0.2 + 1.5 * t }, { rotate: `${-spin.value * 280}deg` }],
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
            borderWidth: 1.5,
            borderColor: "rgba(125,211,252,0.85)",
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
            width: 168,
            height: 168,
            marginLeft: -84,
            marginTop: -84,
            borderRadius: 84,
            borderWidth: 1,
            borderColor: "rgba(186,230,253,0.7)",
          },
          inner,
        ]}
      />
    </>
  );
}

/**
 * 召唤大肥鱼的全屏动效：
 * 立绘从右下角游进来 → 水花与星光炸开 → 法阵扩张、蓝光一闪 → 界面已是鲸鱼空间
 */
export function WhaleSummonFX({ onDone }: { onDone: () => void }) {
  const doneRef = useRef(onDone);
  const firedRef = useRef(false);

  useEffect(() => {
    doneRef.current = onDone;
  }, [onDone]);

  const p = useSharedValue(0);
  const enter = useSharedValue(0);
  const idle = useSharedValue(0);

  useEffect(() => {
    firedRef.current = false;
    p.value = withTiming(1, { duration: 2300, easing: Easing.linear });
    enter.value = withDelay(
      100,
      withSpring(1, { damping: 14, stiffness: 120, mass: 1 }),
    );
    idle.value = withDelay(
      900,
      withRepeat(
        withTiming(1, { duration: 1500, easing: Easing.inOut(Easing.sin) }),
        -1,
        true,
      ),
    );

    // 用 JS 定时器收尾，不走 runOnJS，避免 UI 线程回调的边界问题
    const timer = setTimeout(() => {
      if (firedRef.current) return;
      firedRef.current = true;
      doneRef.current();
    }, 2360);
    return () => clearTimeout(timer);
  }, [p, enter, idle]);

  const overlay = useAnimatedStyle(() => ({
    opacity: interpolate(p.value, [0, 0.05, 0.86, 1], [0, 1, 1, 0]),
  }));

  const whaleStyle = useAnimatedStyle(() => {
    // 落地后仍有呼吸起伏与轻微摆动，看起来是活的而不像一张贴图
    const breathe = 1 + (idle.value - 0.5) * 0.035;
    return {
      opacity: interpolate(enter.value, [0, 0.2, 1], [0, 1, 1]),
      transform: [
        { translateX: (1 - enter.value) * 170 + (idle.value - 0.5) * 7 },
        { translateY: (1 - enter.value) * 130 + (idle.value - 0.5) * 10 },
        {
          scale:
            interpolate(enter.value, [0, 0.72, 1], [0.35, 1.12, 1]) * breathe,
        },
        {
          rotate: `${(1 - enter.value) * -20 + (idle.value - 0.5) * 4}deg`,
        },
      ],
    };
  });

  const titleStyle = useAnimatedStyle(() => {
    const t = window01(p.value, 0.4, 0.54);
    return {
      opacity: t * (1 - window01(p.value, 0.86, 1)),
      transform: [{ scale: interpolate(t, [0, 0.75, 1], [0.6, 1.1, 1]) }],
    };
  });

  const spellTextStyle = useAnimatedStyle(() => ({
    opacity: window01(p.value, 0.6, 0.7) * (1 - window01(p.value, 0.94, 1)),
  }));

  const flashStyle = useAnimatedStyle(() => {
    const t = window01(p.value, 0.66, 0.78);
    return { opacity: t * (1 - window01(p.value, 0.78, 0.92)) * 0.45 };
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
          backgroundColor: "rgba(8,25,50,0.6)",
          zIndex: 40,
        },
        overlay,
      ]}
    >
      <SpellCircle p={p} />

      <SplashRing p={p} size={150} appear={0.16} color="#7DD3FC" from={0.5} to={2} />
      <SplashRing p={p} size={150} appear={0.23} color="#BAE6FD" from={0.4} to={1.6} />
      <SplashRing p={p} size={150} appear={0.3} color="#E0F2FE" from={0.3} to={1.25} />

      <Sparkle p={p} source={SPARKLES} dx={-96} dy={-104} size={26} appear={0.22} />
      <Sparkle p={p} source={SPARKLES} dx={96} dy={-84} size={22} appear={0.28} />
      <Sparkle p={p} source={SPARKLES} dx={-84} dy={52} size={20} appear={0.32} />
      <Sparkle p={p} source={SPARKLES} dx={88} dy={76} size={24} appear={0.25} />
      <Sparkle p={p} source={HEART} dx={-6} dy={-128} size={22} appear={0.36} />
      <Sparkle p={p} source={BUBBLE} dx={62} dy={-134} size={18} appear={0.4} />

      <Animated.View
        style={[
          {
            position: "absolute",
            left: "50%",
            top: "50%",
            width: 180,
            height: 216,
            marginLeft: -90,
            marginTop: -108,
          },
          whaleStyle,
        ]}
      >
        <Image
          source={WHALE}
          style={{ width: 180, height: 216 }}
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
            marginTop: 124,
            alignItems: "center",
          },
          titleStyle,
        ]}
      >
        <Text
          style={{
            fontSize: 21,
            fontWeight: "900",
            color: "#E0F2FE",
            letterSpacing: 2,
          }}
        >
          闪亮登场！
        </Text>
        <Text
          style={{
            marginTop: 6,
            fontSize: 10.5,
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
            bottom: "18%",
            alignItems: "center",
          },
          spellTextStyle,
        ]}
      >
        <Text
          style={{
            fontSize: 12,
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

/* -------------------------------------------------------------------------- */
/*  退场动效：缩成一个小身影、摆尾钻回水里，气泡上浮，界面淡回正常              */
/* -------------------------------------------------------------------------- */

function CollapseRing({
  p,
  size,
  color,
  delay,
}: {
  p: SharedValue<number>;
  size: number;
  color: string;
  delay: number;
}) {
  const style = useAnimatedStyle(() => {
    const t = window01(p.value, delay, delay + 0.62);
    return {
      opacity: (1 - t) * 0.55,
      transform: [{ scale: 1.55 - 1.3 * t }],
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
          borderWidth: 1.5,
          borderColor: color,
        },
        style,
      ]}
    />
  );
}

function ExitBubble({
  p,
  dx,
  size,
  delay,
}: {
  p: SharedValue<number>;
  dx: number;
  size: number;
  delay: number;
}) {
  const style = useAnimatedStyle(() => {
    const t = window01(p.value, delay, delay + 0.55);
    return {
      opacity: (1 - t) * 0.85,
      transform: [
        { translateX: dx + Math.sin(t * 7) * 5 },
        { translateY: -46 * t },
        { scale: 0.55 + 0.55 * t },
      ],
    };
  });
  return (
    <Animated.Image
      source={BUBBLE}
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

/**
 * 大肥鱼退场：原地一闪 → 立绘缩小摆尾游向屏幕外 → 水圈收缩、气泡上浮，
 * 遮罩在末尾淡出，露出正常课表助手界面。
 */
export function WhaleLeaveFX({ onDone }: { onDone: () => void }) {
  const doneRef = useRef(onDone);
  const firedRef = useRef(false);

  useEffect(() => {
    doneRef.current = onDone;
  }, [onDone]);

  const p = useSharedValue(0);

  useEffect(() => {
    firedRef.current = false;
    p.value = withTiming(1, { duration: 1500, easing: Easing.inOut(Easing.cubic) });

    const timer = setTimeout(() => {
      if (firedRef.current) return;
      firedRef.current = true;
      doneRef.current();
    }, 1560);
    return () => clearTimeout(timer);
  }, [p]);

  const overlay = useAnimatedStyle(() => ({
    opacity: interpolate(p.value, [0, 0.1, 0.72, 1], [0, 1, 1, 0]),
  }));

  const whaleStyle = useAnimatedStyle(() => {
    const t = p.value;
    return {
      opacity: interpolate(t, [0, 0.62, 0.95], [1, 1, 0]),
      transform: [
        { translateX: 150 * t * t + Math.sin(t * 9) * 6 },
        { translateY: 132 * t * t },
        { scale: interpolate(t, [0, 0.16, 1], [1, 1.12, 0.2]) },
        { rotate: `${-18 * t}deg` },
      ],
    };
  });

  const textStyle = useAnimatedStyle(() => {
    const t = window01(p.value, 0.06, 0.26);
    return {
      opacity: t * (1 - window01(p.value, 0.62, 0.82)),
      transform: [{ translateY: -18 * t }],
    };
  });

  const flashStyle = useAnimatedStyle(() => ({
    opacity: (1 - window01(p.value, 0, 0.18)) * 0.5,
  }));

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
          backgroundColor: "rgba(8,25,50,0.5)",
          zIndex: 40,
        },
        overlay,
      ]}
    >
      <CollapseRing p={p} size={158} color="#7DD3FC" delay={0.02} />
      <CollapseRing p={p} size={158} color="#E0F2FE" delay={0.12} />

      <ExitBubble p={p} dx={-58} size={16} delay={0.2} />
      <ExitBubble p={p} dx={44} size={20} delay={0.26} />
      <ExitBubble p={p} dx={4} size={13} delay={0.32} />

      <Animated.View
        style={[
          {
            position: "absolute",
            left: "50%",
            top: "50%",
            width: 180,
            height: 216,
            marginLeft: -90,
            marginTop: -108,
          },
          whaleStyle,
        ]}
      >
        <Image
          source={WHALE}
          style={{ width: 180, height: 216 }}
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
            marginTop: 124,
            alignItems: "center",
          },
          textStyle,
        ]}
      >
        <Text
          style={{
            fontSize: 19,
            fontWeight: "900",
            color: "#E0F2FE",
            letterSpacing: 2,
          }}
        >
          扑通——
        </Text>
        <Text
          style={{
            marginTop: 6,
            fontSize: 10.5,
            fontWeight: "600",
            color: "rgba(186,230,253,0.85)",
            letterSpacing: 1,
          }}
        >
          大肥鱼先溜回水里啦，学累了记得喊我
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
            backgroundColor: "#E0F2FE",
          },
          flashStyle,
        ]}
      />
    </Animated.View>
  );
}
