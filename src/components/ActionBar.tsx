import Ionicons from "@expo/vector-icons/Ionicons";
import { LinearGradient } from "expo-linear-gradient";
import React from "react";
import { Pressable, Text, View } from "react-native";
import { useColorScheme } from "nativewind";
import Animated, {
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
  /** 自定义图标内容（主按钮可换成头像之类），优先于 icon */
  iconNode?: React.ReactNode;
}

const SPRING = { damping: 15, stiffness: 150, mass: 0.6 };

function TabButton({ item }: { item: ActionItem }) {
  const scale = useSharedValue(1);
  const { colorScheme } = useColorScheme();
  const isDark = colorScheme !== "light";

  const isPrimary = item.primary;

  const style = useAnimatedStyle(() => ({
    transform: [{ scale: scale.get() }],
  }));

  return (
    <Animated.View style={style}>
      <Pressable
        className="items-center"
        onPress={item.onPress}
        onPressIn={() => { scale.set(withSpring(isPrimary ? 0.88 : 0.9, SPRING)); }}
        onPressOut={() => { scale.set(withSpring(1, SPRING)); }}
        accessibilityRole="button"
        accessibilityLabel={item.label}
        accessibilityState={{ selected: !!item.active }}
        style={{ minWidth: 48, minHeight: 48, justifyContent: "center" }}
      >
        {isPrimary ? (
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
            {item.iconNode ?? (
              <Ionicons name={item.icon} size={22} color="#FFFFFF" />
            )}
          </LinearGradient>
        ) : (
          /* 普通 tab：选中态有玻璃光晕 */
          <View
            style={{
              borderRadius: 18,
              height: 34,
              minWidth: 48,
              alignItems: "center",
              justifyContent: "center",
              backgroundColor: item.active
                ? isDark ? "rgba(125,211,252,0.12)" : "rgba(14,165,233,0.10)"
                : "transparent",
              borderWidth: item.active ? 1 : 0,
              borderColor: isDark ? "rgba(186,230,253,0.16)" : "rgba(255,255,255,0.8)",
            }}
          >
            <Ionicons
              name={item.icon}
              size={19}
              color={item.active ? isDark ? "#BAE6FD" : "#0284C7" : isDark ? "#94A3B8" : "#64748B"}
            />
          </View>
        )}

        {!isPrimary ? (
          <Text
            className={`mt-1 text-[10px] font-medium ${
              item.active
                ? "text-sky-600 dark:text-sky-300"
                : "text-slate-500 dark:text-slate-400"
            }`}
          >
            {item.label}
          </Text>
        ) : null}
      </Pressable>
    </Animated.View>
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
        borderOpacity={0.22}
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
