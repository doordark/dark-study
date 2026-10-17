import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import React from "react";
import { Text, View } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { GlassContainer } from "@/components/GlassContainer";

export interface ActionItem {
  key: string;
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  onPress: () => void;
  /** 中间凸起的主按钮 */
  primary?: boolean;
  /** 当前选中态 */
  active?: boolean;
}

const SPRING = { damping: 15, stiffness: 150, mass: 0.6 };

function TabButton({ item }: { item: ActionItem }) {
  const scale = useSharedValue(1);

  const isPrimary = item.primary;

  // 跟手弹簧按压（worklet 内修改 shared value）
  const tap = Gesture.Tap()
    .onBegin(() => {
      scale.value = withSpring(isPrimary ? 0.88 : 0.9, SPRING);
    })
    .onFinalize(() => {
      scale.value = withSpring(1, SPRING);
    })
    .onEnd(() => {
      runOnJS(item.onPress)();
    });

  const style = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  return (
    <Animated.View style={style}>
      <GestureDetector gesture={tap}>
        <View className="items-center">
          {isPrimary ? (
            /* 中间凸起主按钮 */
            <LinearGradient
              colors={["#38BDF8", "#2DD4BF"]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={{
                width: 48,
                height: 48,
                borderRadius: 24,
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
          ) : (
            /* 普通 tab：选中态有玻璃光晕 */
            <View
              className={`h-9 items-center justify-center rounded-full border ${
                item.active
                  ? "border-white/35 bg-white/25 dark:border-white/15 dark:bg-white/[0.12]"
                  : "border-transparent"
              }`}
              style={{ paddingHorizontal: item.active ? 14 : 12 }}
            >
              <Ionicons
                name={item.icon}
                size={19}
                color={item.active ? "#38BDF8" : "#94A3B8"}
              />
            </View>
          )}

          {!isPrimary ? (
            <Text
              className={`mt-1 text-[9.5px] font-medium ${
                item.active
                  ? "text-sky-600 dark:text-sky-300"
                  : "text-slate-400 dark:text-slate-500"
              }`}
            >
              {item.label}
            </Text>
          ) : null}
        </View>
      </GestureDetector>
    </Animated.View>
  );
}

/**
 * 底部悬浮玻璃胶囊 Action Bar（HyperOS 4 悬浮胶囊风）。
 * 内容从玻璃下透出，选中项有玻璃光晕，中间凸起主按钮。
 */
export function ActionBar({ items }: { items: ActionItem[] }) {
  const insets = useSafeAreaInsets();
  return (
    <View
      className="px-4"
      style={{ paddingBottom: Math.max(insets.bottom, 12) }}
    >
      <GlassContainer
        radius={32}
        intensity={62}
        borderOpacity={0.3}
        glow
        glowColor="rgba(56,189,248,0.28)"
      >
        <View className="flex-row items-center justify-around px-3 py-2">
          {items.map((item) => (
            <TabButton key={item.key} item={item} />
          ))}
        </View>
      </GlassContainer>
    </View>
  );
}
