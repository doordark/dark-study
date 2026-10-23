import React, { useEffect } from "react";
import { Text, View } from "react-native";
import Animated, {
  Easing,
  FadeInDown,
  FadeOut,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withSequence,
  withSpring,
  withTiming,
} from "react-native-reanimated";

/**
 * 失重卡片：触发后整列卡片依次缓缓浮起、轻微翻转，再弹回原位。
 * 只做 transform 且位移很小，不会超出滚动容器可视区域，也不影响手势与布局。
 */
export function GravityCard({
  token,
  index,
  lift,
  children,
}: {
  token: number;
  index: number;
  lift: number;
  children: React.ReactNode;
}) {
  const ty = useSharedValue(0);
  const rot = useSharedValue(0);

  useEffect(() => {
    if (token <= 0) return;
    const dir = index % 2 === 0 ? 1 : -1;
    const float = -(lift + (index % 3) * 10);
    ty.value = 0;
    rot.value = 0;
    ty.value = withDelay(
      index * 60,
      withSequence(
        withTiming(float, {
          duration: 520,
          easing: Easing.out(Easing.cubic),
        }),
        withDelay(
          520,
          withSpring(0, { damping: 10, stiffness: 90, mass: 0.9 }),
        ),
      ),
    );
    rot.value = withDelay(
      index * 60,
      withSequence(
        withTiming(dir * (1.2 + index * 0.4), {
          duration: 520,
          easing: Easing.out(Easing.cubic),
        }),
        withSpring(0, { damping: 9, stiffness: 90 }),
      ),
    );
  }, [index, lift, token, rot, ty]);

  const style = useAnimatedStyle(() => ({
    transform: [{ translateY: ty.value }, { rotate: `${rot.value}deg` }],
  }));

  return <Animated.View style={style}>{children}</Animated.View>;
}

/** 短暂浮现的失重提示 */
export function GravityBadge() {
  return (
    <Animated.View
      entering={FadeInDown.springify()}
      exiting={FadeOut.duration(220)}
      pointerEvents="none"
      style={{
        position: "absolute",
        left: 0,
        right: 0,
        bottom: 106,
        alignItems: "center",
        zIndex: 40,
      }}
    >
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          borderRadius: 999,
          borderWidth: 1,
          borderColor: "rgba(56,189,248,0.4)",
          backgroundColor: "rgba(56,189,248,0.14)",
          paddingHorizontal: 12,
          paddingVertical: 5,
        }}
      >
        <View
          style={{
            width: 5,
            height: 5,
            borderRadius: 3,
            backgroundColor: "#38BDF8",
            marginRight: 6,
          }}
        />
        <Text
          style={{
            fontSize: 9,
            fontWeight: "700",
            letterSpacing: 2,
            color: "#38BDF8",
          }}
        >
          ZERO-G · 9.8 → 0.0 m/s²
        </Text>
      </View>
    </Animated.View>
  );
}
