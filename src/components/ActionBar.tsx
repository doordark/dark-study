import Ionicons from "@expo/vector-icons/Ionicons";
import { LinearGradient } from "expo-linear-gradient";
import React, { type ComponentRef, useCallback, useEffect, useRef } from "react";
import { Pressable, Text, View } from "react-native";
import { useColorScheme } from "nativewind";
import Animated, {
  cancelAnimation,
  Easing,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withSpring,
  withTiming,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { GlassContainer } from "@/components/GlassContainer";
import {
  reportWhaleDockOrigin,
  triggerWhaleWave,
} from "@/components/WhaleSummonFX";
import { resolveTint, type BackgroundTint } from "@/constants/backgrounds";
import { useSettings } from "@/store/useSettings";
import { tapHaptic } from "@/utils/haptics";

const THEME_ACTIVE_ICON: Record<BackgroundTint, { light: string; dark: string }> = {
  sky: { light: "#0284C7", dark: "#0369A1" },
  rose: { light: "#DB2777", dark: "#BE185D" },
  mint: { light: "#059669", dark: "#047857" },
  amber: { light: "#D97706", dark: "#B45309" },
  violet: { light: "#7C3AED", dark: "#6D28D9" },
  noir: { light: "#1E293B", dark: "#0F172A" },
};

export interface ActionItem {
  key: string;
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  onPress: () => void;
  /** 中间凸起的主按钮 */
  primary?: boolean;
  /** 当前选中态 */
  active?: boolean;
  /** 自定义图标内容（主按钮可换成头像之类），优先于 icon */
  iconNode?: React.ReactNode;
}

const TAB_SPRING = { damping: 15, stiffness: 150, mass: 0.6 };
const WHALE_SQUISH_SPRING = { damping: 14, stiffness: 320, mass: 0.48 };
const WHALE_BOUNCE_SPRING = { damping: 9.5, stiffness: 250, mass: 0.52 };

function TabButton({ item }: { item: ActionItem }) {
  const scaleX = useSharedValue(1);
  const scaleY = useSharedValue(1);
  const pressY = useSharedValue(0);
  const tapRing = useSharedValue(0);
  const primaryRef = useRef<ComponentRef<typeof View> | null>(null);

  const { colorScheme } = useColorScheme();
  const isDark = colorScheme !== "light";
  const glass = useSettings((s) => s.material === "glass");
  const bgTint = useSettings((s) => s.backgroundTint);
  const reduced = useReducedMotion();
  const resolvedTint = resolveTint(bgTint);
  const activeAccent = THEME_ACTIVE_ICON[resolvedTint];

  const isPrimary = !!item.primary;
  const isWhaleDock = isPrimary && !!item.iconNode;

  useEffect(
    () => () => {
      cancelAnimation(scaleX);
      cancelAnimation(scaleY);
      cancelAnimation(pressY);
      cancelAnimation(tapRing);
    },
    [scaleX, scaleY, pressY, tapRing],
  );

  const measurePrimaryOrigin = useCallback(
    (onMeasured?: (origin: { x: number; y: number }) => void) => {
      if (!isPrimary || !primaryRef.current) return;
      primaryRef.current.measureInWindow((x, y, width, height) => {
        if (width > 0 && height > 0) {
          const origin = { x: x + width / 2, y: y + height / 2 };
          reportWhaleDockOrigin(origin);
          onMeasured?.(origin);
        }
      });
    },
    [isPrimary],
  );

  const style = useAnimatedStyle(() => ({
    transform: [
      { translateY: pressY.get() },
      { scaleX: scaleX.get() },
      { scaleY: scaleY.get() },
    ],
  }));

  const tapRingStyle = useAnimatedStyle(() => {
    const t = tapRing.get();
    return {
      opacity: t > 0 && t < 1 ? (1 - t) * (isDark ? 0.78 : 0.65) : 0,
      transform: [{ scale: 0.86 + t * 0.78 }],
    };
  });

  const handlePressIn = () => {
    if (isPrimary) measurePrimaryOrigin();
    if (reduced) {
      scaleX.set(withTiming(0.94, { duration: 90 }));
      scaleY.set(withTiming(0.94, { duration: 90 }));
      return;
    }
    if (isWhaleDock) {
      // Q 弹果冻按压：横向微鼓、纵向微压，松手后灵动回弹
      scaleX.set(withSpring(1.08, WHALE_SQUISH_SPRING));
      scaleY.set(withSpring(0.87, WHALE_SQUISH_SPRING));
      pressY.set(withSpring(1.8, WHALE_SQUISH_SPRING));
    } else {
      const target = isPrimary ? 0.88 : 0.9;
      scaleX.set(withSpring(target, TAB_SPRING));
      scaleY.set(withSpring(target, TAB_SPRING));
    }
  };

  const handlePressOut = () => {
    if (reduced) {
      scaleX.set(withTiming(1, { duration: 90 }));
      scaleY.set(withTiming(1, { duration: 90 }));
      pressY.set(0);
      return;
    }
    if (isWhaleDock) {
      scaleX.set(withSpring(1, WHALE_BOUNCE_SPRING));
      scaleY.set(withSpring(1, WHALE_BOUNCE_SPRING));
      pressY.set(withSpring(0, WHALE_BOUNCE_SPRING));
    } else {
      scaleX.set(withSpring(1, TAB_SPRING));
      scaleY.set(withSpring(1, TAB_SPRING));
    }
  };

  const handlePress = () => {
    if (isWhaleDock) {
      tapHaptic();
      if (!reduced) {
        tapRing.set(0);
        tapRing.set(
          withTiming(1, {
            duration: 440,
            easing: Easing.out(Easing.cubic),
          }),
        );
      }
      // 使用最近测得的底部中央大肥鱼按钮精确坐标向外绽放全局 UI 扩散水波纹，并刷新测量值
      measurePrimaryOrigin();
      triggerWhaleWave({ kind: "enter", tint: resolvedTint });
    } else if (isPrimary) {
      measurePrimaryOrigin();
    }
    item.onPress();
  };

  return (
    <View
      ref={isPrimary ? primaryRef : undefined}
      collapsable={false}
      onLayout={isPrimary ? () => measurePrimaryOrigin() : undefined}
      style={{ alignItems: "center", justifyContent: "center" }}
    >
      {/* 点击大肥鱼底栏按钮时绽放的贴身水环微涟漪 */}
      {isWhaleDock ? (
        <Animated.View
          pointerEvents="none"
          style={[
            {
              position: "absolute",
              width: 54,
              height: 54,
              borderRadius: 27,
              borderWidth: 1.8,
              borderColor: isDark ? "#7DD3FC" : "#38BDF8",
            },
            tapRingStyle,
          ]}
        />
      ) : null}

      <Animated.View style={style}>
        <Pressable
          className="items-center"
          onPress={handlePress}
          onPressIn={handlePressIn}
          onPressOut={handlePressOut}
          accessibilityRole="button"
          accessibilityLabel={item.label}
          accessibilityState={{ selected: !!item.active }}
          style={{
            minWidth: isWhaleDock ? 56 : 48,
            minHeight: isWhaleDock ? 52 : 48,
            justifyContent: "center",
          }}
        >
          {isPrimary ? (
            item.iconNode ?? (
              /* 中间凸起主按钮 */
              <LinearGradient
                colors={["#7DD3FC", "#38BDF8", "#2DD4BF"]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={{
                  width: 48,
                  height: 48,
                  borderRadius: 24,
                  borderWidth: 1,
                  borderColor: "rgba(255,255,255,0.45)",
                  alignItems: "center",
                  justifyContent: "center",
                  shadowColor: "#2DD4BF",
                  shadowOffset: { width: 0, height: 4 },
                  shadowOpacity: 0.5,
                  shadowRadius: 10,
                  // 不用 elevation：Android 上 elevation 阴影在转场/缩放动画中
                  // 会被光栅化成实心块（闪烁方框），光效交给渐变 + iOS 阴影
                }}
              >
                <Ionicons name={item.icon} size={22} color="#FFFFFF" />
              </LinearGradient>
            )
          ) : (
            /* 普通 tab：液态玻璃下选中态为高亮瓷白胶囊，形成清透玻璃与瓷白实体反差 */
            <View
              style={{
                borderRadius: 18,
                height: 34,
                minWidth: 48,
                alignItems: "center",
                justifyContent: "center",
                backgroundColor: item.active
                  ? glass
                    ? isDark
                      ? "rgba(248,250,252,0.92)"
                      : "rgba(255,255,255,0.88)"
                    : isDark
                      ? "rgba(125,211,252,0.12)"
                      : "rgba(14,165,233,0.10)"
                  : "transparent",
                borderWidth: item.active ? 1 : 0,
                borderColor: glass
                  ? "rgba(255,255,255,0.96)"
                  : isDark
                    ? "rgba(186,230,253,0.16)"
                    : "rgba(255,255,255,0.8)",
              }}
            >
              <Ionicons
                name={item.icon}
                size={19}
                color={
                  item.active
                    ? glass
                      ? isDark
                        ? activeAccent.dark
                        : activeAccent.light
                      : isDark
                        ? "#BAE6FD"
                        : "#0284C7"
                    : glass
                      ? isDark
                        ? "rgba(241,245,249,0.86)"
                        : "#334155"
                      : isDark
                        ? "#94A3B8"
                        : "#64748B"
                }
              />
            </View>
          )}

          {!isPrimary ? (
            <Text
              className={`mt-1 text-[10px] font-medium ${
                item.active
                  ? glass
                    ? "font-semibold text-slate-900 dark:text-white"
                    : "text-sky-600 dark:text-sky-300"
                  : glass
                    ? "text-slate-700 dark:text-slate-200/90"
                    : "text-slate-500 dark:text-slate-400"
              }`}
            >
              {item.label}
            </Text>
          ) : null}
        </Pressable>
      </Animated.View>
    </View>
  );
}

/**
 * 悬浮胶囊使用更厚的玻璃，选中项以低饱和透色承接主按钮。
 */
export function ActionBar({ items }: { items: ActionItem[] }) {
  const insets = useSafeAreaInsets();
  return (
    <View
      className="px-5"
      style={{ paddingBottom: Math.max(insets.bottom, 12) }}
    >
      <GlassContainer
        radius={32}
        variant="floating"
        borderOpacity={0.26}
      >
        <View className="flex-row items-center justify-around px-2 py-2.5">
          {items.map((item) => (
            <TabButton key={item.key} item={item} />
          ))}
        </View>
      </GlassContainer>
    </View>
  );
}
