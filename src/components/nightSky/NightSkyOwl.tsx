import { memo, useContext, useEffect } from "react";
import { Pressable, Text, View } from "react-native";
import Animated, {
  Easing,
  cancelAnimation,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withSpring,
  withTiming,
} from "react-native-reanimated";
import Svg, { Path } from "react-native-svg";

import { AtlasSprite } from "@/components/AtlasSprite";
import {
  NIGHT_SPRITES,
  NightMotion,
} from "@/components/nightSky/NightSkyPrimitives";

export const OWL_FLIGHT = require("../../../assets/images/night-owl-flight.png");
export const OWL_BRANCH = require("../../../assets/images/night-owl-branch.png");
export const FLIGHT_SIZE = 128;
export const ARRIVAL_MS = 1640;
export const DEPARTURE_MS = 1160;
export type OwlStage = "waiting" | "arriving" | "perched" | "leaving";

/* -------------------------------------------------------------------------- */
/*  猫头鹰：拾满星后飞落枝头，会眨眼、轻晃呼吸，带丝滑弹簧对话气泡             */
/* -------------------------------------------------------------------------- */

export function OwlFlight({
  stage,
  elapsed,
  x,
  y,
  screenWidth,
  insetTop,
}: {
  stage: OwlStage;
  elapsed: ReturnType<typeof useSharedValue<number>>;
  x: number;
  y: number;
  screenWidth: number;
  insetTop: number;
}) {
  const flying = stage === "arriving" || stage === "leaving";
  const leaving = stage === "leaving";
  const flightStyle = useAnimatedStyle(() => {
    const progress = Math.min(
      1,
      elapsed.value / (leaving ? DEPARTURE_MS : ARRIVAL_MS),
    );
    const t = leaving
      ? progress * progress * (2 - progress)
      : 1 - (1 - progress) ** 1.28;
    const u = 1 - t;
    const dx = leaving
      ? 2 * u * t * 30 + t * t * (screenWidth - x + FLIGHT_SIZE)
      : -u * u * (x + FLIGHT_SIZE) + 2 * u * t * 34;
    const dy = leaving
      ? -2 * u * t * 75 - t * t * (y - insetTop + FLIGHT_SIZE)
      : -u * u * 70 - 2 * u * t * 125;
    return {
      opacity: flying ? (leaving ? Math.min(1, u * 8) : 1) : 0,
      transform: [
        { translateX: dx },
        { translateY: dy },
        { rotate: `${leaving ? -9 * Math.sin(t * Math.PI) : 10 * u}deg` },
        { scale: leaving ? 1 - t * 0.56 : 0.74 + t * 0.26 },
      ],
    };
  });
  const frameStyle = useAnimatedStyle(() => {
    const time = elapsed.value;
    let frame = Math.floor(time / 54) % 4;
    if (leaving) {
      if (time < 100) frame = 6;
      else if (time < 155) frame = 7;
      else frame = 8 + (Math.floor((time - 155) / 54) % 4);
    } else if (time >= ARRIVAL_MS - 270) {
      frame = time >= ARRIVAL_MS - 115 ? 5 : 4;
    }
    return {
      transform: [
        { translateX: -(frame % 4) * FLIGHT_SIZE },
        { translateY: -Math.floor(frame / 4) * FLIGHT_SIZE },
      ],
    };
  });

  return (
    <Animated.View
      pointerEvents="none"
      style={[
        {
          position: "absolute",
          left: x - FLIGHT_SIZE / 2,
          top: y - FLIGHT_SIZE / 2,
          width: FLIGHT_SIZE,
          height: FLIGHT_SIZE,
          overflow: "hidden",
          zIndex: 6,
        },
        flightStyle,
      ]}
    >
      <Animated.Image
        source={OWL_FLIGHT}
        resizeMode="stretch"
        fadeDuration={0}
        style={[
          {
            position: "absolute",
            width: FLIGHT_SIZE * 4,
            height: FLIGHT_SIZE * 3,
          },
          frameStyle,
        ]}
      />
    </Animated.View>
  );
}

export function OwlBody({
  bounceToken,
  sleepy = false,
}: {
  bounceToken: number;
  sleepy?: boolean;
}) {
  const blink = useSharedValue(sleepy ? 0 : 1);
  const sway = useSharedValue(0);
  const hop = useSharedValue(1);
  const peek = useSharedValue(0);
  const motion = useContext(NightMotion);

  useEffect(() => {
    if (!motion) {
      blink.value = sleepy ? 0 : 1;
      sway.value = 0;
      return;
    }
    if (sleepy) {
      blink.value = 0;
      blink.value = withRepeat(
        withSequence(
          withDelay(4600, withTiming(1, { duration: 0 })),
          withDelay(180, withTiming(0, { duration: 0 })),
        ),
        -1,
        false,
      );
    } else {
      blink.value = 1;
      blink.value = withRepeat(
        withSequence(
          withDelay(2800, withTiming(0, { duration: 0 })),
          withDelay(105, withTiming(1, { duration: 0 })),
        ),
        -1,
        false,
      );
    }
    sway.value = withRepeat(
      withSequence(
        withTiming(1, {
          duration: sleepy ? 3200 : 2400,
          easing: Easing.inOut(Easing.sin),
        }),
        withTiming(-1, {
          duration: sleepy ? 3200 : 2400,
          easing: Easing.inOut(Easing.sin),
        }),
      ),
      -1,
    );
    return () => {
      cancelAnimation(blink);
      cancelAnimation(sway);
    };
  }, [blink, motion, sleepy, sway]);

  useEffect(() => {
    if (bounceToken <= 0 || !motion) return;
    hop.value = withSequence(
      withTiming(1.08, { duration: 95 }),
      withSpring(1, { damping: 9, stiffness: 190 }),
    );
    if (sleepy) {
      peek.value = withSequence(
        withTiming(1, { duration: 0 }),
        withDelay(1900, withTiming(0, { duration: 160 })),
      );
    }
    return () => {
      cancelAnimation(hop);
      cancelAnimation(peek);
    };
  }, [bounceToken, hop, motion, peek, sleepy]);

  useEffect(
    () => () => {
      cancelAnimation(hop);
      cancelAnimation(peek);
    },
    [hop, peek],
  );

  const closed = useAnimatedStyle(() => ({
    opacity: Math.max(0, (1 - blink.value) * (1 - peek.value)),
  }));
  const bodyStyle = useAnimatedStyle(() => ({
    transform: [
      { translateY: sway.value * -1.5 },
      { rotate: `${sway.value * 1.3}deg` },
      { scale: hop.value },
    ],
  }));

  return (
    <Animated.View style={[{ width: 80, height: 86 }, bodyStyle]}>
      <AtlasSprite
        source={NIGHT_SPRITES}
        columns={3}
        rows={2}
        column={0}
        row={1}
        width={80}
        height={86}
      />
      <Animated.View
        pointerEvents="none"
        style={[
          {
            position: "absolute",
            left: 20,
            top: 21,
            width: 40,
            height: 17,
            borderRadius: 7,
            overflow: "hidden",
          },
          closed,
        ]}
      >
        <View style={{ position: "absolute", left: -20, top: -21 }}>
          <AtlasSprite
            source={NIGHT_SPRITES}
            columns={3}
            rows={2}
            column={1}
            row={1}
            width={80}
            height={86}
          />
        </View>
      </Animated.View>
    </Animated.View>
  );
}

export const Owl = memo(function Owl({
  left,
  top,
  onTap,
  hint,
  bounceToken,
  sleepy = false,
}: {
  left: number;
  top: number;
  onTap: () => void;
  hint?: string;
  bounceToken: number;
  sleepy?: boolean;
}) {
  const bubblePop = useSharedValue(0);
  const reduceMotion = useReducedMotion();

  useEffect(() => {
    if (!hint) {
      bubblePop.value = 0;
      return;
    }
    if (reduceMotion) {
      bubblePop.value = 1;
      return;
    }
    bubblePop.value = 0;
    bubblePop.value = withSpring(1, { damping: 14, stiffness: 170 });
    return () => cancelAnimation(bubblePop);
  }, [bubblePop, hint, reduceMotion]);

  const bubbleStyle = useAnimatedStyle(() => ({
    opacity: bubblePop.value,
    transform: [
      { translateX: (1 - bubblePop.value) * 8 },
      { scale: 0.92 + bubblePop.value * 0.08 },
    ],
  }));

  const bubbleMaxWidth = Math.max(120, Math.min(208, left - 18));

  return (
    <View style={{ position: "absolute", left, top, zIndex: 6 }}>
      {hint ? (
        <Animated.View
          pointerEvents="none"
          style={[
            {
              position: "absolute",
              top: 2,
              right: 88,
              minWidth: 112,
              maxWidth: bubbleMaxWidth,
              paddingHorizontal: 12,
              paddingVertical: 9,
              borderRadius: 13,
              borderWidth: 1,
              borderColor: "#BDA784",
              backgroundColor: "rgba(18,28,53,0.95)",
            },
            bubbleStyle,
          ]}
        >
          <Text
            style={{
              color: "#F2E6D6",
              fontSize: 12,
              lineHeight: 18,
              flexShrink: 1,
            }}
          >
            {hint}
          </Text>
          <Svg
            width={9}
            height={13}
            style={{ position: "absolute", right: -9, top: 13 }}
          >
            <Path
              d="M0 1 L8 6.5 L0 12"
              fill="#121C35"
              stroke="#BDA784"
              strokeWidth={1}
            />
          </Svg>
        </Animated.View>
      ) : null}
      <Pressable
        onPress={onTap}
        accessibilityRole="button"
        accessibilityLabel="和猫头鹰对话"
        hitSlop={12}
      >
        <OwlBody bounceToken={bounceToken} sleepy={sleepy} />
      </Pressable>
    </View>
  );
});
