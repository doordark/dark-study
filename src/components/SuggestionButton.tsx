import { Ionicons } from "@expo/vector-icons";
import React from "react";
import { Pressable, Text } from "react-native";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from "react-native-reanimated";

interface SuggestionButtonProps {
  label: string;
  onPress: () => void;
  /** row：空状态里的整行入口；pill：输入框上方的横向小胶囊 */
  variant?: "row" | "pill";
  /** 鲸鱼模式的天蓝配色 */
  cute?: boolean;
  disabled?: boolean;
}

/** 提示词按钮：按下去有跟手的弹簧回弹，不再是一块硬邦邦的色块 */
export function SuggestionButton({
  label,
  onPress,
  variant = "row",
  cute = false,
  disabled = false,
}: SuggestionButtonProps) {
  const scale = useSharedValue(1);

  const press = () => {
    scale.value = withSpring(0.96, { damping: 26, stiffness: 240 });
  };
  const release = () => {
    scale.value = withSpring(1, { damping: 26, stiffness: 240 });
  };

  const style = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
    opacity: disabled ? 0.5 : 1,
  }));

  const rowSurface = cute
    ? "border-sky-300/45 bg-sky-400/12 dark:border-sky-300/25 dark:bg-sky-400/12"
    : "border-white/30 bg-white/45 dark:border-white/12 dark:bg-white/[0.07]";
  const pillSurface = cute
    ? "border-sky-300/40 bg-sky-400/10 dark:border-sky-300/20 dark:bg-sky-400/10"
    : "border-white/25 bg-white/35 dark:border-white/10 dark:bg-white/[0.06]";

  return (
    <Animated.View style={style}>
      <Pressable
        onPress={onPress}
        onPressIn={press}
        onPressOut={release}
        disabled={disabled}
        className={`flex-row items-center border ${
          variant === "row"
            ? `gap-x-2.5 rounded-2xl px-3.5 py-3 ${rowSurface}`
            : `gap-x-1.5 rounded-full px-3 py-1.5 ${pillSurface}`
        }`}
      >
        <Ionicons
          name="sparkles"
          size={variant === "row" ? 13 : 10}
          color={cute ? "#38BDF8" : "#64748B"}
        />
        <Text
          className={`${
            variant === "row" ? "flex-1 text-[11.5px]" : "text-[10.5px]"
          } ${
            cute
              ? "text-sky-800 dark:text-sky-100"
              : "text-slate-600 dark:text-slate-300"
          }`}
        >
          {label}
        </Text>
        {variant === "row" ? (
          <Ionicons
            name="chevron-forward"
            size={12}
            color={cute ? "rgba(56,189,248,0.7)" : "rgba(148,163,184,0.8)"}
          />
        ) : null}
      </Pressable>
    </Animated.View>
  );
}
