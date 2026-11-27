import Ionicons from "@expo/vector-icons/Ionicons";
import { router } from "expo-router";
import React, { useEffect } from "react";
import { Pressable, Text, View } from "react-native";
import Animated, {
  Easing,
  cancelAnimation,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSpring,
  withTiming,
} from "react-native-reanimated";

import { GlassContainer } from "@/components/GlassContainer";
import { WhaleAvatar } from "@/components/WhaleAvatar";

import { TactilePressable } from "./AssistantChatWidgets";
import { PRESS_SPRING, assistantStyles as styles } from "./assistantStyles";

export interface AssistantHeaderProps {
  isDark: boolean;
  whale: boolean;
  personaName: string;
  userName: string;
  emotionLabel: string;
  emotionColor: string;
  bondLevel: number;
  bondTitle: string;
  voiceOn: boolean;
  petVisible: boolean;
  popoverOpen: boolean;
  voiceScreenFocused: boolean;
  animationActive: boolean;
  mountSettled: boolean;
  reducedMotion: boolean;
  onToggleVoice: () => void;
  onOpenSettings: () => void;
  onAvatarPress: () => void;
}

/** 悬浮液态玻璃顶栏：返回按钮、标题/情绪/羁绊状态、语音/设置入口及交互头像徽章 */
export function AssistantHeader({
  isDark,
  whale,
  personaName,
  userName,
  emotionLabel,
  emotionColor,
  bondLevel,
  bondTitle,
  voiceOn,
  petVisible,
  popoverOpen,
  voiceScreenFocused,
  animationActive,
  mountSettled,
  reducedMotion,
  onToggleVoice,
  onOpenSettings,
  onAvatarPress,
}: AssistantHeaderProps) {
  const avatarBtnScale = useSharedValue(1);
  const haloPulse = useSharedValue(0);

  // 顶栏头像情绪呼吸光环（遵守节电、前台生命周期与进场转场稳定门控）
  useEffect(() => {
    if (!whale || !voiceScreenFocused || !animationActive || !mountSettled || reducedMotion) {
      cancelAnimation(haloPulse);
      haloPulse.set(0);
      return;
    }
    haloPulse.set(
      withRepeat(
        withTiming(1, { duration: 2400, easing: Easing.inOut(Easing.sin) }),
        -1,
        true,
      ),
    );
    return () => cancelAnimation(haloPulse);
  }, [whale, voiceScreenFocused, animationActive, mountSettled, reducedMotion, haloPulse]);

  useEffect(
    () => () => {
      cancelAnimation(avatarBtnScale);
      cancelAnimation(haloPulse);
    },
    [avatarBtnScale, haloPulse],
  );

  const avatarPressStyle = useAnimatedStyle(() => ({
    transform: [{ scale: avatarBtnScale.value }],
  }));

  const haloStyle = useAnimatedStyle(() => ({
    opacity: 0.34 + haloPulse.value * 0.42,
    transform: [{ scale: 1 + haloPulse.value * 0.08 }],
  }));

  return (
    <View style={styles.headerWrap}>
      <GlassContainer
        radius={26}
        variant="floating"
        borderOpacity={0.24}
        highlight
        style={styles.headerGlass}
      >
        <View style={styles.headerRow}>
          <TactilePressable
            onPress={() => router.back()}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel="返回"
            pressedOpacity={0.72}
            style={[
              styles.backBtn,
              {
                backgroundColor: isDark
                  ? "rgba(255,255,255,0.08)"
                  : "rgba(255,255,255,0.62)",
                borderColor: isDark
                  ? "rgba(255,255,255,0.12)"
                  : "rgba(148,163,184,0.25)",
              },
            ]}
          >
            <Ionicons
              name="chevron-back"
              size={18}
              color={isDark ? "#E2E8F0" : "#334155"}
            />
          </TactilePressable>

          <View style={styles.headerTitleCol}>
            <View style={styles.headerTitleRow}>
              <Text
                numberOfLines={1}
                style={[
                  styles.headerTitle,
                  { color: isDark ? "#F8FAFC" : "#0F172A" },
                ]}
              >
                {whale ? personaName : "课程表助手"}
              </Text>
              {whale ? (
                <View
                  style={[
                    styles.moodPill,
                    {
                      backgroundColor: isDark
                        ? "rgba(56,189,248,0.16)"
                        : "rgba(14,165,233,0.12)",
                      borderColor: isDark
                        ? "rgba(125,211,252,0.34)"
                        : "rgba(14,165,233,0.28)",
                    },
                  ]}
                >
                  <View style={[styles.moodDot, { backgroundColor: emotionColor }]} />
                  <Text
                    style={[
                      styles.moodText,
                      { color: isDark ? "#BAE6FD" : "#0369A1" },
                    ]}
                  >
                    {emotionLabel}
                  </Text>
                </View>
              ) : null}
            </View>
            <Text
              numberOfLines={1}
              style={[
                styles.headerSubtitle,
                {
                  color: isDark
                    ? "rgba(186,214,242,0.72)"
                    : "rgba(71,85,105,0.82)",
                },
              ]}
            >
              {whale
                ? `Lv.${bondLevel} ${bondTitle} · ${userName}专属陪伴`
                : "自然语言调课 · 智能查询与课表管理"}
            </Text>
          </View>

          {/* 右侧控制组：语音 + 人设设置 + 可展开互动浮层的大肥鱼头像 */}
          <View style={styles.headerActions}>
            {whale ? (
              <>
                <TactilePressable
                  onPress={onToggleVoice}
                  hitSlop={8}
                  accessibilityRole="button"
                  accessibilityLabel={voiceOn ? "关闭鱼语" : "开启鱼语"}
                  pressedOpacity={0.72}
                  style={[
                    styles.headerCircleBtn,
                    {
                      backgroundColor: voiceOn
                        ? isDark
                          ? "rgba(56,189,248,0.22)"
                          : "rgba(14,165,233,0.14)"
                        : isDark
                          ? "rgba(255,255,255,0.07)"
                          : "rgba(255,255,255,0.52)",
                      borderColor: voiceOn
                        ? isDark
                          ? "rgba(125,211,252,0.36)"
                          : "rgba(14,165,233,0.30)"
                        : isDark
                          ? "rgba(255,255,255,0.1)"
                          : "rgba(148,163,184,0.24)",
                    },
                  ]}
                >
                  <Ionicons
                    name={voiceOn ? "volume-high" : "volume-mute"}
                    size={15.5}
                    color={
                      voiceOn
                        ? isDark
                          ? "#7DD3FC"
                          : "#0284C7"
                        : isDark
                          ? "#94A3B8"
                          : "#64748B"
                    }
                  />
                </TactilePressable>

                <TactilePressable
                  accessibilityRole="button"
                  accessibilityLabel="人设与记忆"
                  onPress={onOpenSettings}
                  hitSlop={6}
                  pressedOpacity={0.72}
                  style={[
                    styles.headerCircleBtn,
                    {
                      backgroundColor: isDark
                        ? "rgba(255,255,255,0.07)"
                        : "rgba(255,255,255,0.52)",
                      borderColor: isDark
                        ? "rgba(255,255,255,0.1)"
                        : "rgba(148,163,184,0.24)",
                    },
                  ]}
                >
                  <Ionicons
                    name="options-outline"
                    size={16.5}
                    color={isDark ? "#BAE6FD" : "#0369A1"}
                  />
                </TactilePressable>
              </>
            ) : null}

            {/* 右上角大肥鱼徽章：单点即从角色位置柔和舒展伴侣互动与召唤桌宠卡片 */}
            <Animated.View style={[styles.avatarBtnWrap, avatarPressStyle]}>
              {whale ? (
                <Animated.View
                  pointerEvents="none"
                  style={[
                    styles.avatarHalo,
                    { borderColor: popoverOpen ? "#38BDF8" : emotionColor },
                    haloStyle,
                  ]}
                />
              ) : null}

              <Pressable
                onPress={whale ? onAvatarPress : undefined}
                onPressIn={() => {
                  if (whale && !reducedMotion) {
                    avatarBtnScale.set(withSpring(0.91, PRESS_SPRING));
                  }
                }}
                onPressOut={() => {
                  if (!reducedMotion) {
                    avatarBtnScale.set(withSpring(1, PRESS_SPRING));
                  }
                }}
                hitSlop={8}
                accessibilityRole={whale ? "button" : "image"}
                accessibilityLabel={
                  whale
                    ? popoverOpen
                      ? "收起大肥鱼互动卡片"
                      : "展开大肥鱼互动与桌宠召唤卡片"
                    : "课程表助手"
                }
                style={[
                  styles.avatarBtn,
                  {
                    backgroundColor: whale
                      ? isDark
                        ? "rgba(56,189,248,0.22)"
                        : "rgba(224,242,254,0.92)"
                      : isDark
                        ? "rgba(56,189,248,0.18)"
                        : "rgba(224,242,254,0.75)",
                    borderColor: popoverOpen
                      ? "#38BDF8"
                      : isDark
                        ? "rgba(186,230,253,0.34)"
                        : "rgba(125,211,252,0.65)",
                  },
                ]}
              >
                {whale ? (
                  <WhaleAvatar size={42} />
                ) : (
                  <Ionicons name="sparkles" size={19} color="#38BDF8" />
                )}
              </Pressable>

              {/* 桌宠在场 / 可展开提示角标 */}
              {whale ? (
                <View
                  pointerEvents="none"
                  style={[
                    styles.avatarCornerBadge,
                    {
                      backgroundColor: petVisible
                        ? "#10B981"
                        : isDark
                          ? "#0F2942"
                          : "#FFFFFF",
                      borderColor: isDark ? "#1E293B" : "#E0F2FE",
                    },
                  ]}
                >
                  <Ionicons
                    name={
                      petVisible
                        ? "sparkles"
                        : popoverOpen
                          ? "chevron-up"
                          : "chevron-down"
                    }
                    size={9}
                    color={
                      petVisible
                        ? "#FFFFFF"
                        : isDark
                          ? "#7DD3FC"
                          : "#0284C7"
                    }
                  />
                </View>
              ) : null}
            </Animated.View>
          </View>
        </View>
      </GlassContainer>
    </View>
  );
}
