import Ionicons from "@expo/vector-icons/Ionicons";
import { LinearGradient } from "expo-linear-gradient";
import React, { useEffect, useState } from "react";
import { ActivityIndicator, Pressable, TextInput, View } from "react-native";
import Animated, {
  cancelAnimation,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withSpring,
  withTiming,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useColorScheme } from "nativewind";

import { GlassContainer } from "@/components/GlassContainer";
import { resolveGlassOpticalProfile } from "@/constants/glassThemes";
import { useSettings } from "@/store/useSettings";

export interface ChatInputBarProps {
  value: string;
  onChangeText: (text: string) => void;
  onSend: () => void;
  onStop?: () => void;
  busy?: boolean;
  placeholder?: string;
  /** 覆盖底部安全区（键盘弹出时由页面传入，避免重复留白） */
  bottomInset?: number;
  whaleTheme?: boolean;
  /** 紧凑模式：用于桌宠浮动互动卡片内，避免双层留白与厚重底板 */
  compact?: boolean;
  onFocusChange?: (focused: boolean) => void;
}

const SPRING_PRESS = { damping: 20, stiffness: 320, mass: 0.72 };

/**
 * 液态玻璃浮动输入胶囊：
 * - 悬浮在画布上方，无生硬底板切割；
 * - 随当前主题色自动适配高光与描边，聚焦时柔光提亮；
 * - 发送与停止按钮配备 Q 弹弹簧按压反馈。
 */
export function ChatInputBar({
  value,
  onChangeText,
  onSend,
  onStop,
  busy = false,
  placeholder = "例如：把周四的课和周五的换一下…",
  bottomInset,
  whaleTheme = false,
  compact = false,
  onFocusChange,
}: ChatInputBarProps) {
  const { colorScheme } = useColorScheme();
  const isDark = colorScheme !== "light";
  const insets = useSafeAreaInsets();
  const reducedMotion = useReducedMotion();
  const backgroundTint = useSettings((s) => s.backgroundTint);
  const hasWallpaper = useSettings((s) => !!s.backgroundImage);
  const [focused, setFocused] = useState(false);

  const btnScale = useSharedValue(1);
  const focusProgress = useSharedValue(0);

  useEffect(() => {
    focusProgress.set(
      reducedMotion
        ? focused
          ? 1
          : 0
        : withTiming(focused ? 1 : 0, { duration: 180 }),
    );
  }, [focused, focusProgress, reducedMotion]);

  useEffect(
    () => () => {
      cancelAnimation(btnScale);
      cancelAnimation(focusProgress);
    },
    [btnScale, focusProgress],
  );

  const canSend = value.trim().length > 0 && !busy;
  const isStopping = busy && !!onStop;
  const actionDisabled = !canSend && !isStopping;
  const padBottom = bottomInset ?? Math.max(insets.bottom, 10);

  const profile = resolveGlassOpticalProfile(backgroundTint, isDark, hasWallpaper);
  const accentRgb = profile.accentRgb;
  const accentRgba = (alpha: number) =>
    `rgba(${Math.round(accentRgb[0] * 255)},${Math.round(accentRgb[1] * 255)},${Math.round(accentRgb[2] * 255)},${alpha})`;

  const sendGradient: readonly [string, string] = whaleTheme
    ? isDark
      ? ["#38BDF8", "#6366F1"]
      : ["#0EA5E9", "#4F8EF7"]
    : isDark
      ? ["#38BDF8", "#0284C7"]
      : ["#0EA5E9", "#0284C7"];

  const btnAnimStyle = useAnimatedStyle(() => ({
    transform: [{ scale: btnScale.value }],
  }));

  const capsuleAnimStyle = useAnimatedStyle(() => ({
    transform: [{ scale: 1 + focusProgress.value * (compact ? 0.004 : 0.006) }],
  }));

  const handlePressIn = () => {
    if (actionDisabled || reducedMotion) return;
    btnScale.set(withSpring(0.9, SPRING_PRESS));
  };

  const handlePressOut = () => {
    if (reducedMotion) return;
    btnScale.set(withSpring(1, SPRING_PRESS));
  };

  const handleFocus = () => {
    setFocused(true);
    onFocusChange?.(true);
  };

  const handleBlur = () => {
    setFocused(false);
    onFocusChange?.(false);
  };

  const actionButton = (
    <Animated.View style={btnAnimStyle}>
      <Pressable
        onPress={isStopping ? onStop : onSend}
        onPressIn={handlePressIn}
        onPressOut={handlePressOut}
        disabled={actionDisabled}
        accessibilityRole="button"
        accessibilityLabel={isStopping ? "停止生成" : "发送消息"}
        accessibilityState={{ disabled: actionDisabled, busy }}
        hitSlop={8}
        style={{
          width: compact ? 32 : 38,
          height: compact ? 32 : 38,
          borderRadius: compact ? 16 : 19,
          overflow: "hidden",
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: isStopping
            ? isDark
              ? "rgba(251,113,133,0.22)"
              : "rgba(244,63,94,0.14)"
            : canSend
              ? "transparent"
              : isDark
                ? "rgba(255,255,255,0.08)"
                : "rgba(148,163,184,0.18)",
          borderWidth: isStopping ? 1 : canSend ? 0.75 : 0,
          borderColor: isStopping
            ? isDark
              ? "rgba(251,113,133,0.45)"
              : "rgba(244,63,94,0.34)"
            : "rgba(255,255,255,0.32)",
          boxShadow: canSend
            ? [
                {
                  offsetX: 0,
                  offsetY: 3,
                  blurRadius: 10,
                  color: whaleTheme
                    ? "rgba(56,189,248,0.38)"
                    : "rgba(14,165,233,0.32)",
                },
              ]
            : undefined,
        }}
      >
        {canSend ? (
          <LinearGradient
            colors={sendGradient}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={{
              position: "absolute",
              inset: 0,
            }}
          />
        ) : null}
        {isStopping ? (
          <Ionicons
            name="stop"
            size={compact ? 13 : 15}
            color={isDark ? "#FDA4AF" : "#E11D48"}
          />
        ) : busy ? (
          <ActivityIndicator size="small" color={isDark ? "#7DD3FC" : "#0284C7"} />
        ) : (
          <Ionicons
            name="arrow-up"
            size={compact ? 16 : 18}
            color={canSend ? "#FFFFFF" : isDark ? "#64748B" : "#94A3B8"}
          />
        )}
      </Pressable>
    </Animated.View>
  );

  const textInputNode = (
    <TextInput
      value={value}
      onChangeText={onChangeText}
      onFocus={handleFocus}
      onBlur={handleBlur}
      placeholder={placeholder}
      placeholderTextColor={
        isDark ? "rgba(186,214,242,0.46)" : "rgba(71,85,105,0.52)"
      }
      onSubmitEditing={onSend}
      returnKeyType="send"
      editable={!busy}
      style={{
        flex: 1,
        paddingVertical: compact ? 7 : 10,
        paddingRight: 8,
        fontSize: compact ? 12.5 : 14,
        lineHeight: compact ? 17 : 20,
        color: isDark ? "#F1F5F9" : "#0F172A",
      }}
    />
  );

  if (compact) {
    return (
      <View
        style={{
          paddingHorizontal: 10,
          paddingTop: 6,
          paddingBottom: padBottom,
        }}
      >
        <Animated.View
          style={[
            {
              flexDirection: "row",
              alignItems: "center",
              minHeight: 42,
              borderRadius: 21,
              borderCurve: "continuous",
              paddingLeft: 13,
              paddingRight: 5,
              overflow: "hidden",
              backgroundColor: isDark
                ? "rgba(255,255,255,0.075)"
                : "rgba(255,255,255,0.82)",
              borderWidth: 1,
              borderColor: focused
                ? whaleTheme
                  ? "rgba(125,211,252,0.58)"
                  : accentRgba(0.55)
                : isDark
                  ? "rgba(186,230,253,0.18)"
                  : "rgba(148,163,184,0.28)",
            },
            capsuleAnimStyle,
          ]}
        >
          {textInputNode}
          {actionButton}
        </Animated.View>
      </View>
    );
  }

  return (
    <View
      style={{
        paddingHorizontal: 16,
        paddingTop: 6,
        paddingBottom: padBottom,
      }}
    >
      <Animated.View style={capsuleAnimStyle}>
        <GlassContainer
          radius={28}
          variant="floating"
          borderOpacity={focused ? 0.34 : 0.22}
          highlight
          style={{
            flexDirection: "row",
            alignItems: "center",
            minHeight: 50,
            paddingLeft: 16,
            paddingRight: 6,
            borderWidth: focused ? 1.2 : 1,
            borderColor: focused
              ? whaleTheme
                ? isDark
                  ? "rgba(125,211,252,0.56)"
                  : "rgba(56,189,248,0.55)"
                : accentRgba(0.52)
              : whaleTheme
                ? isDark
                  ? "rgba(147,197,253,0.28)"
                  : "rgba(125,211,252,0.46)"
                : isDark
                  ? "rgba(255,255,255,0.14)"
                  : "rgba(148,163,184,0.26)",
          }}
        >
          <View
            pointerEvents="none"
            style={{
              position: "absolute",
              inset: 0,
              backgroundColor: whaleTheme
                ? isDark
                  ? "rgba(15,32,58,0.34)"
                  : "rgba(255,255,255,0.48)"
                : isDark
                  ? "rgba(15,23,42,0.28)"
                  : "rgba(255,255,255,0.42)",
            }}
          />
          {whaleTheme ? (
            <View
              style={{
                width: 26,
                height: 26,
                borderRadius: 13,
                marginRight: 8,
                alignItems: "center",
                justifyContent: "center",
                backgroundColor: focused
                  ? isDark
                    ? "rgba(56,189,248,0.24)"
                    : "rgba(14,165,233,0.16)"
                  : isDark
                    ? "rgba(125,211,252,0.12)"
                    : "rgba(14,165,233,0.09)",
              }}
            >
              <Ionicons
                name="sparkles"
                size={13}
                color={focused ? "#38BDF8" : isDark ? "#7DD3FC" : "#0284C7"}
              />
            </View>
          ) : null}
          {textInputNode}
          {actionButton}
        </GlassContainer>
      </Animated.View>
    </View>
  );
}
