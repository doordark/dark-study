import Ionicons from "@expo/vector-icons/Ionicons";
import { LinearGradient } from "expo-linear-gradient";
import { router } from "expo-router";
import React from "react";
import { Image, Modal, Platform, Pressable, StyleSheet, Text, View } from "react-native";
import Animated, {
  FadeIn,
  useAnimatedStyle,
  type SharedValue,
} from "react-native-reanimated";

import { GlassContainer } from "@/components/GlassContainer";
import { ScheduleChangeDialog } from "@/components/ScheduleChangeDialog";
import { WhaleAvatar } from "@/components/WhaleAvatar";
import { WhaleLeaveFX, WhaleSummonFX } from "@/components/WhaleSummonFX";
import type { GlassOpticalProfile } from "@/constants/glassThemes";
import { desktopPetAvailable } from "@/services/desktopPet";
import type { WhaleCare } from "@/store/useWhalePet";
import { tapHaptic } from "@/utils/haptics";
import type { WhaleAgentConfig, WhaleThinkingMode } from "@/utils/whalePersona";

import { TactilePressable } from "./AssistantChatWidgets";
import { assistantStyles as styles, clampPct } from "./assistantStyles";
import type { PendingScheduleChange } from "./useAssistantChat";

/** 浮层内的迷你养护数值条 */
function PopoverCarePill({
  label,
  value,
  color,
  icon,
  isDark,
}: {
  label: string;
  value: number;
  color: string;
  icon: keyof typeof Ionicons.glyphMap;
  isDark: boolean;
}) {
  return (
    <View
      style={{
        flex: 1,
        minWidth: 0,
        borderRadius: 14,
        borderCurve: "continuous",
        paddingHorizontal: 9,
        paddingVertical: 7.5,
        backgroundColor: isDark
          ? "rgba(255,255,255,0.065)"
          : "rgba(255,255,255,0.88)",
        borderWidth: 1,
        borderColor: isDark
          ? "rgba(186,230,253,0.16)"
          : "rgba(148,163,184,0.24)",
      }}
    >
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: 5,
        }}
      >
        <View style={{ flexDirection: "row", alignItems: "center", gap: 3 }}>
          <Ionicons name={icon} size={10.5} color={color} />
          <Text
            numberOfLines={1}
            style={{
              fontSize: 10,
              fontWeight: "600",
              color: isDark ? "#CBD5E1" : "#475569",
            }}
          >
            {label}
          </Text>
        </View>
        <Text
          style={{
            fontSize: 10.5,
            fontWeight: "800",
            color: isDark ? "#F1F5F9" : "#0F172A",
          }}
        >
          {Math.round(value)}
        </Text>
      </View>
      <View
        style={{
          height: 4.5,
          borderRadius: 99,
          overflow: "hidden",
          backgroundColor: isDark
            ? "rgba(255,255,255,0.11)"
            : "rgba(148,163,184,0.22)",
        }}
      >
        <View
          style={{
            width: `${clampPct(value)}%`,
            height: "100%",
            borderRadius: 99,
            backgroundColor: color,
          }}
        />
      </View>
    </View>
  );
}

/** 浮层底部的等宽均分快捷动作卡片按钮 */
function PopoverQuickAction({
  icon,
  label,
  accent,
  isDark,
  onPress,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  accent: string;
  isDark: boolean;
  onPress: () => void;
}) {
  return (
    <TactilePressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      pressedOpacity={0.8}
      pressedScale={0.97}
      style={{
        flex: 1,
        minWidth: 0,
        height: 42,
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "center",
        gap: 5,
        borderRadius: 14,
        borderCurve: "continuous",
        paddingHorizontal: 6,
        backgroundColor: isDark
          ? "rgba(26,44,74,0.82)"
          : "rgba(255,255,255,0.94)",
        borderWidth: 1,
        borderColor: isDark
          ? "rgba(186,230,253,0.22)"
          : "rgba(125,211,252,0.42)",
        boxShadow: [
          {
            offsetX: 0,
            offsetY: 2,
            blurRadius: 6,
            color: isDark ? "rgba(2,8,20,0.32)" : "rgba(15,41,66,0.06)",
          },
        ],
      }}
    >
      <Ionicons name={icon} size={14.5} color={accent} />
      <Text
        numberOfLines={1}
        style={{
          fontSize: 11.5,
          fontWeight: "700",
          color: isDark ? "#E6F4FF" : "#0F2942",
        }}
      >
        {label}
      </Text>
    </TactilePressable>
  );
}

export interface AssistantCompanionPopoverProps {
  isDark: boolean;
  popoverWidth: number;
  popoverProgress: SharedValue<number>;
  popoverAvatarBounce: SharedValue<number>;
  glassProfile: GlassOpticalProfile;
  personaName: string;
  emotionLabel: string;
  emotionColor: string;
  bondLevel: number;
  bondTitle: string;
  daysActive: number;
  popoverLine: string;
  popoverLineKey: string;
  petCare: WhaleCare;
  petVisible: boolean;
  autoFollow: boolean;
  desktopPermission: boolean;
  whaleAgent: WhaleAgentConfig;
  onUpdateWhaleAgent: (patch: Partial<WhaleAgentConfig>) => void;
  onClose: () => void;
  onPoke: () => void;
  onTogglePet: () => void;
  onToggleDesktopFollow: () => void;
  onPat: () => void;
  onFeed: () => void;
}

/**
 * 右上角大肥鱼灵动玻璃态互动浮层与召唤桌宠卡片：
 * 位于 `<Backdrop>` 内以享原生液态玻璃折射，仅在展开期间挂载。
 */
export function AssistantCompanionPopover({
  isDark,
  popoverWidth,
  popoverProgress,
  popoverAvatarBounce,
  glassProfile,
  personaName,
  emotionLabel,
  emotionColor,
  bondLevel,
  bondTitle,
  daysActive,
  popoverLine,
  popoverLineKey,
  petCare,
  petVisible,
  autoFollow,
  desktopPermission,
  whaleAgent,
  onUpdateWhaleAgent,
  onClose,
  onPoke,
  onTogglePet,
  onToggleDesktopFollow,
  onPat,
  onFeed,
}: AssistantCompanionPopoverProps) {
  const scrimStyle = useAnimatedStyle(() => ({
    opacity: popoverProgress.value,
  }));

  const popoverCardStyle = useAnimatedStyle(() => {
    const p = popoverProgress.value;
    return {
      opacity: Math.max(0, Math.min(1, p)),
      transform: [
        { translateX: (1 - p) * 28 },
        { translateY: (1 - p) * -18 },
        { scale: 0.84 + p * 0.16 },
      ],
    };
  });

  const popoverPortraitStyle = useAnimatedStyle(() => ({
    transform: [{ scale: popoverAvatarBounce.value }],
  }));

  return (
    <View
      pointerEvents="box-none"
      style={[StyleSheet.absoluteFill, styles.popoverRoot]}
    >
      {/* 柔和点击收起遮罩 */}
      <Animated.View
        style={[
          StyleSheet.absoluteFill,
          {
            backgroundColor: isDark
              ? "rgba(3,9,20,0.34)"
              : "rgba(15,23,42,0.12)",
          },
          scrimStyle,
        ]}
      >
        <Pressable
          style={StyleSheet.absoluteFill}
          onPress={onClose}
          accessibilityRole="button"
          accessibilityLabel="关闭互动浮层"
        />
      </Animated.View>

      {/* 从右上角头像自然绽放的玻璃态互动浮层 */}
      <Animated.View
        style={[
          styles.popoverCardWrap,
          { width: popoverWidth },
          popoverCardStyle,
        ]}
      >
        {/* 与右上角头像衔接的外置裁剪光滴指针（严格位于卡片边沿外侧，零半透明叠加穿帮） */}
        <View pointerEvents="none" style={styles.popoverCaretClip}>
          <View
            style={[
              styles.popoverCaretDiamond,
              {
                backgroundColor: isDark
                  ? "rgba(22,38,66,0.92)"
                  : "rgba(246,251,255,0.95)",
                borderColor: isDark
                  ? "rgba(186,230,253,0.28)"
                  : "rgba(125,211,252,0.55)",
              },
            ]}
          />
        </View>

        <GlassContainer
          radius={26}
          variant="sheet"
          borderOpacity={0.3}
          highlight
          style={{
            padding: 14,
            boxShadow: [
              {
                offsetX: 0,
                offsetY: 16,
                blurRadius: 36,
                color: glassProfile.shadowColor,
              },
            ],
          }}
        >
          {/* 柔光可读性底衬，确保任意壁纸与主题下文字清晰通透 */}
          <LinearGradient
            pointerEvents="none"
            colors={
              isDark
                ? ["rgba(15,27,48,0.86)", "rgba(12,22,40,0.92)"]
                : ["rgba(255,255,255,0.88)", "rgba(242,249,255,0.94)"]
            }
            start={{ x: 0, y: 0 }}
            end={{ x: 0.9, y: 1 }}
            style={StyleSheet.absoluteFill}
          />

          {/* 1. 头部：可点戳的头像 + 名字/羁绊/情绪 + 关闭按钮 */}
          <View style={{ flexDirection: "row", alignItems: "center" }}>
            <Animated.View style={popoverPortraitStyle}>
              <Pressable
                onPress={onPoke}
                accessibilityRole="button"
                accessibilityLabel="戳一戳大肥鱼"
                style={{
                  width: 50,
                  height: 50,
                  borderRadius: 18,
                  borderCurve: "continuous",
                  alignItems: "center",
                  justifyContent: "center",
                  overflow: "hidden",
                  marginRight: 11,
                  backgroundColor: isDark
                    ? "rgba(56,189,248,0.2)"
                    : "rgba(224,242,254,0.92)",
                  borderWidth: 1.25,
                  borderColor: emotionColor,
                }}
              >
                <WhaleAvatar size={45} />
              </Pressable>
            </Animated.View>

            <View style={{ flex: 1, minWidth: 0, marginRight: 8 }}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                <Text
                  numberOfLines={1}
                  style={{
                    flexShrink: 1,
                    fontSize: 15.5,
                    fontWeight: "800",
                    color: isDark ? "#F0F9FF" : "#0C4A6E",
                  }}
                >
                  {personaName}
                </Text>
                <View
                  style={{
                    flexShrink: 0,
                    borderRadius: 999,
                    paddingHorizontal: 7.5,
                    paddingVertical: 2.5,
                    backgroundColor: isDark
                      ? "rgba(167,139,250,0.2)"
                      : "rgba(139,92,246,0.12)",
                  }}
                >
                  <Text
                    numberOfLines={1}
                    style={{
                      fontSize: 9.5,
                      fontWeight: "700",
                      color: isDark ? "#DDD6FE" : "#6D28D9",
                    }}
                  >
                    Lv.{bondLevel} {bondTitle}
                  </Text>
                </View>
              </View>

              <View
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  gap: 6,
                  marginTop: 4,
                }}
              >
                <View
                  style={{
                    width: 6.5,
                    height: 6.5,
                    borderRadius: 3.5,
                    backgroundColor: emotionColor,
                  }}
                />
                <Text
                  numberOfLines={1}
                  style={{
                    fontSize: 11,
                    fontWeight: "600",
                    color: isDark ? "#BAE6FD" : "#0369A1",
                  }}
                >
                  {emotionLabel}
                </Text>
                <Text
                  numberOfLines={1}
                  style={{
                    fontSize: 10,
                    color: isDark ? "#94A3B8" : "#64748B",
                  }}
                >
                  · 相伴 {daysActive} 天
                </Text>
              </View>
            </View>

            <TactilePressable
              onPress={onClose}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel="关闭"
              pressedOpacity={0.7}
              style={{
                flexShrink: 0,
                width: 30,
                height: 30,
                borderRadius: 15,
                alignItems: "center",
                justifyContent: "center",
                backgroundColor: isDark
                  ? "rgba(255,255,255,0.09)"
                  : "rgba(148,163,184,0.15)",
                borderWidth: 0.75,
                borderColor: isDark
                  ? "rgba(255,255,255,0.14)"
                  : "rgba(148,163,184,0.24)",
              }}
            >
              <Ionicons
                name="close"
                size={15}
                color={isDark ? "#BAE6FD" : "#0369A1"}
              />
            </TactilePressable>
          </View>

          {/* 2. 柔光角色台词反馈条（点头像/摸头/喂饭实时互动，告别生硬黑框） */}
          <Animated.View
            key={popoverLineKey}
            entering={FadeIn.duration(180)}
            style={{
              marginTop: 11,
              borderRadius: 16,
              borderCurve: "continuous",
              paddingHorizontal: 12,
              paddingVertical: 9,
              backgroundColor: isDark
                ? "rgba(56,189,248,0.11)"
                : "rgba(224,242,254,0.62)",
              borderWidth: 0.75,
              borderColor: isDark
                ? "rgba(125,211,252,0.22)"
                : "rgba(125,211,252,0.48)",
            }}
          >
            <Text
              style={{
                fontSize: 11.5,
                lineHeight: 17.5,
                color: isDark ? "#E0F2FE" : "#0C4A6E",
              }}
            >
              {popoverLine}
            </Text>
          </Animated.View>

          {/* 3. 养护状态三联条 */}
          <View style={{ flexDirection: "row", gap: 7, marginTop: 10 }}>
            <PopoverCarePill
              label="饱食"
              value={petCare.fullness}
              color="#FBBF24"
              icon="restaurant"
              isDark={isDark}
            />
            <PopoverCarePill
              label="心情"
              value={petCare.mood}
              color="#38BDF8"
              icon="happy"
              isDark={isDark}
            />
            <PopoverCarePill
              label="好感"
              value={petCare.bond}
              color="#F472B6"
              icon="heart"
              isDark={isDark}
            />
          </View>

          {/* 4. 核心召唤 / 收回桌宠状态卡片 */}
          <View
            style={{
              marginTop: 11,
              borderRadius: 18,
              borderCurve: "continuous",
              overflow: "hidden",
              borderWidth: 1,
              borderColor: petVisible
                ? isDark
                  ? "rgba(52,211,153,0.34)"
                  : "rgba(16,185,129,0.32)"
                : isDark
                  ? "rgba(125,211,252,0.28)"
                  : "rgba(56,189,248,0.34)",
            }}
          >
            <LinearGradient
              pointerEvents="none"
              colors={
                petVisible
                  ? isDark
                    ? ["rgba(16,185,129,0.18)", "rgba(56,189,248,0.08)"]
                    : ["rgba(209,250,229,0.72)", "rgba(224,242,254,0.62)"]
                  : isDark
                    ? ["rgba(56,189,248,0.20)", "rgba(99,102,241,0.12)"]
                    : ["rgba(224,242,254,0.86)", "rgba(238,242,255,0.72)"]
              }
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={StyleSheet.absoluteFill}
            />

            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                paddingHorizontal: 12,
                paddingVertical: 11,
                gap: 10,
              }}
            >
              <View
                style={{
                  width: 36,
                  height: 36,
                  borderRadius: 13,
                  alignItems: "center",
                  justifyContent: "center",
                  backgroundColor: petVisible
                    ? isDark
                      ? "rgba(16,185,129,0.25)"
                      : "rgba(16,185,129,0.16)"
                    : isDark
                      ? "rgba(56,189,248,0.24)"
                      : "rgba(14,165,233,0.16)",
                }}
              >
                <Ionicons
                  name={petVisible ? "checkmark-circle" : "sparkles"}
                  size={18}
                  color={
                    petVisible
                      ? isDark
                        ? "#6EE7B7"
                        : "#059669"
                      : isDark
                        ? "#7DD3FC"
                        : "#0284C7"
                  }
                />
              </View>

              <View style={{ flex: 1, minWidth: 0 }}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 5 }}>
                  <Text
                    style={{
                      fontSize: 12.5,
                      fontWeight: "800",
                      color: isDark ? "#F0F9FF" : "#0F2942",
                    }}
                  >
                    {petVisible ? "桌宠陪伴中" : "召唤大肥鱼桌宠"}
                  </Text>
                  {petVisible ? (
                    <View
                      style={{
                        width: 6,
                        height: 6,
                        borderRadius: 3,
                        backgroundColor: "#10B981",
                      }}
                    />
                  ) : null}
                </View>
                <Text
                  numberOfLines={2}
                  style={{
                    marginTop: 2,
                    fontSize: 10,
                    lineHeight: 14,
                    color: isDark ? "#94A3B8" : "#475569",
                  }}
                >
                  {petVisible
                    ? "拖拽抛起或点三下即可打开互动面板"
                    : "挂在屏幕边陪你学习、抛团子与课前提醒"}
                </Text>
              </View>

              <TactilePressable
                onPress={onTogglePet}
                accessibilityRole="button"
                accessibilityLabel={petVisible ? "收回桌宠" : "召唤桌宠"}
                pressedOpacity={0.82}
                pressedScale={0.96}
                style={{
                  flexShrink: 0,
                  height: 34,
                  borderRadius: 999,
                  overflow: "hidden",
                  paddingHorizontal: 14,
                  alignItems: "center",
                  justifyContent: "center",
                  backgroundColor: petVisible
                    ? isDark
                      ? "rgba(255,255,255,0.11)"
                      : "rgba(255,255,255,0.92)"
                    : "#0EA5E9",
                  borderWidth: 1,
                  borderColor: petVisible
                    ? isDark
                      ? "rgba(255,255,255,0.18)"
                      : "rgba(148,163,184,0.32)"
                    : "rgba(255,255,255,0.38)",
                  boxShadow: petVisible
                    ? undefined
                    : [
                        {
                          offsetX: 0,
                          offsetY: 3,
                          blurRadius: 8,
                          color: "rgba(14,165,233,0.28)",
                        },
                      ],
                }}
              >
                {!petVisible ? (
                  <LinearGradient
                    pointerEvents="none"
                    colors={["#38BDF8", "#4F7DF3"]}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 1 }}
                    style={StyleSheet.absoluteFill}
                  />
                ) : null}
                <Text
                  numberOfLines={1}
                  style={{
                    fontSize: 11.5,
                    fontWeight: "800",
                    color: petVisible
                      ? isDark
                        ? "#E2E8F0"
                        : "#334155"
                      : "#FFFFFF",
                  }}
                >
                  {petVisible ? "收回" : "召唤出来"}
                </Text>
              </TactilePressable>
            </View>

            {/* Android 原生桌面悬浮随行快捷切换条 */}
            {Platform.OS === "android" && desktopPetAvailable ? (
              <TactilePressable
                onPress={onToggleDesktopFollow}
                accessibilityRole="button"
                accessibilityLabel="切后台自动驻留手机桌面"
                pressedOpacity={0.78}
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: 8,
                  minHeight: 37,
                  paddingHorizontal: 12,
                  paddingVertical: 8,
                  borderTopWidth: 1,
                  borderTopColor: isDark
                    ? "rgba(186,230,253,0.12)"
                    : "rgba(56,189,248,0.22)",
                  backgroundColor: isDark
                    ? "rgba(15,23,42,0.30)"
                    : "rgba(255,255,255,0.52)",
                }}
              >
                <View style={{ flex: 1, minWidth: 0, flexDirection: "row", alignItems: "center", gap: 6 }}>
                  <Ionicons
                    name="phone-portrait-outline"
                    size={13}
                    color={
                      autoFollow && desktopPermission
                        ? "#38BDF8"
                        : isDark
                          ? "#94A3B8"
                          : "#64748B"
                    }
                  />
                  <Text
                    numberOfLines={1}
                    style={{
                      flex: 1,
                      fontSize: 11,
                      fontWeight: "600",
                      color: isDark ? "#CBD5E1" : "#334155",
                    }}
                  >
                    切后台自动驻留手机桌面
                  </Text>
                </View>
                <View
                  style={{
                    flexShrink: 0,
                    flexDirection: "row",
                    alignItems: "center",
                    gap: 4,
                    borderRadius: 999,
                    paddingHorizontal: 8.5,
                    paddingVertical: 3,
                    backgroundColor:
                      autoFollow && desktopPermission
                        ? isDark
                          ? "rgba(56,189,248,0.20)"
                          : "rgba(14,165,233,0.14)"
                        : isDark
                          ? "rgba(255,255,255,0.08)"
                          : "rgba(148,163,184,0.16)",
                    borderWidth: 0.75,
                    borderColor:
                      autoFollow && desktopPermission
                        ? isDark
                          ? "rgba(125,211,252,0.36)"
                          : "rgba(14,165,233,0.28)"
                        : isDark
                          ? "rgba(255,255,255,0.14)"
                          : "rgba(148,163,184,0.24)",
                  }}
                >
                  <View
                    style={{
                      width: 5,
                      height: 5,
                      borderRadius: 2.5,
                      backgroundColor:
                        autoFollow && desktopPermission
                          ? "#10B981"
                          : isDark
                            ? "#64748B"
                            : "#94A3B8",
                    }}
                  />
                  <Text
                    numberOfLines={1}
                    style={{
                      fontSize: 10,
                      fontWeight: "700",
                      color:
                        autoFollow && desktopPermission
                          ? isDark
                            ? "#7DD3FC"
                            : "#0284C7"
                          : isDark
                            ? "#94A3B8"
                            : "#64748B",
                    }}
                  >
                    {autoFollow && desktopPermission ? "已开启" : "去开启"}
                  </Text>
                </View>
              </TactilePressable>
            ) : null}
          </View>

          {/* 4.5 Agent 能力快捷微调：联网搜索 / 深度思考 / 临时指令状态 */}
          <View
            style={{
              marginTop: 10,
              borderRadius: 16,
              padding: 10,
              backgroundColor: isDark
                ? "rgba(15,23,42,0.42)"
                : "rgba(255,255,255,0.60)",
              borderWidth: 1,
              borderColor: isDark
                ? "rgba(186,230,253,0.14)"
                : "rgba(56,189,248,0.22)",
              gap: 8,
            }}
          >
            <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
              <TactilePressable
                accessibilityRole="switch"
                accessibilityState={{ checked: whaleAgent.webSearchEnabled }}
                accessibilityLabel="DeepSeek 官方联网搜索"
                onPress={() => {
                  tapHaptic();
                  onUpdateWhaleAgent({
                    webSearchEnabled: !whaleAgent.webSearchEnabled,
                  });
                }}
                style={{
                  flex: 1,
                  flexDirection: "row",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 5,
                  minHeight: 34,
                  borderRadius: 12,
                  paddingHorizontal: 8,
                  backgroundColor: whaleAgent.webSearchEnabled
                    ? isDark
                      ? "rgba(56,189,248,0.22)"
                      : "rgba(14,165,233,0.14)"
                    : isDark
                      ? "rgba(255,255,255,0.06)"
                      : "rgba(148,163,184,0.14)",
                  borderWidth: 0.75,
                  borderColor: whaleAgent.webSearchEnabled
                    ? "rgba(56,189,248,0.45)"
                    : "rgba(148,163,184,0.24)",
                }}
              >
                <Ionicons
                  name="globe-outline"
                  size={13}
                  color={whaleAgent.webSearchEnabled ? "#38BDF8" : "#94A3B8"}
                />
                <Text
                  numberOfLines={1}
                  style={{
                    fontSize: 11,
                    fontWeight: "700",
                    color: whaleAgent.webSearchEnabled
                      ? isDark
                        ? "#7DD3FC"
                        : "#0284C7"
                      : isDark
                        ? "#94A3B8"
                        : "#64748B",
                  }}
                >
                  官方联网 {whaleAgent.webSearchEnabled ? "开" : "关"}
                </Text>
              </TactilePressable>

              <TactilePressable
                accessibilityRole="button"
                accessibilityLabel="切换思考模式"
                onPress={() => {
                  tapHaptic();
                  const order: WhaleThinkingMode[] = ["auto", "enabled", "disabled"];
                  const next =
                    order[(order.indexOf(whaleAgent.thinkingMode) + 1) % order.length];
                  onUpdateWhaleAgent({ thinkingMode: next });
                }}
                style={{
                  flex: 1,
                  flexDirection: "row",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 5,
                  minHeight: 34,
                  borderRadius: 12,
                  paddingHorizontal: 8,
                  backgroundColor:
                    whaleAgent.thinkingMode !== "disabled"
                      ? isDark
                        ? "rgba(167,139,250,0.22)"
                        : "rgba(139,92,246,0.13)"
                      : isDark
                        ? "rgba(255,255,255,0.06)"
                        : "rgba(148,163,184,0.14)",
                  borderWidth: 0.75,
                  borderColor:
                    whaleAgent.thinkingMode !== "disabled"
                      ? "rgba(167,139,250,0.45)"
                      : "rgba(148,163,184,0.24)",
                }}
              >
                <Ionicons
                  name="bulb-outline"
                  size={13}
                  color={
                    whaleAgent.thinkingMode !== "disabled" ? "#A78BFA" : "#94A3B8"
                  }
                />
                <Text
                  numberOfLines={1}
                  style={{
                    fontSize: 11,
                    fontWeight: "700",
                    color:
                      whaleAgent.thinkingMode !== "disabled"
                        ? isDark
                          ? "#DDD6FE"
                          : "#6D28D9"
                        : isDark
                          ? "#94A3B8"
                          : "#64748B",
                  }}
                >
                  思考：
                  {whaleAgent.thinkingMode === "auto"
                    ? "智能"
                    : whaleAgent.thinkingMode === "enabled"
                      ? "深思"
                      : "极速"}
                </Text>
              </TactilePressable>
            </View>

            {whaleAgent.quickDirectiveEnabled && whaleAgent.quickDirective ? (
              <Text
                numberOfLines={1}
                style={{
                  fontSize: 10.5,
                  color: isDark ? "#7DD3FC" : "#0369A1",
                }}
              >
                ⚡ 临时指令生效中：{whaleAgent.quickDirective}
              </Text>
            ) : null}
          </View>

          {/* 5. 底部快捷互动三键：摸摸头 / 喂白饭 / Agent 设置 */}
          <View style={{ flexDirection: "row", alignItems: "stretch", gap: 8, marginTop: 11 }}>
            <PopoverQuickAction
              icon="hand-left-outline"
              label="摸摸头"
              accent="#F472B6"
              isDark={isDark}
              onPress={onPat}
            />
            <PopoverQuickAction
              icon="restaurant-outline"
              label="喂白饭"
              accent="#FBBF24"
              isDark={isDark}
              onPress={onFeed}
            />
            <PopoverQuickAction
              icon="options-outline"
              label="Agent 设置"
              accent="#38BDF8"
              isDark={isDark}
              onPress={() => {
                onClose();
                router.push("/whale-settings");
              }}
            />
          </View>
        </GlassContainer>
      </Animated.View>
    </View>
  );
}

export interface AssistantOverlaysProps {
  summonFx: boolean;
  onSummonDone: () => void;
  leaveFx: boolean;
  onLeaveDone: () => void;
  scheduleChange: PendingScheduleChange | null;
  onCloseScheduleChange: () => void;
  onAppliedScheduleChange: () => void;
  preview: string | null;
  onClosePreview: () => void;
}

/**
 * 助手全屏遮罩层宿主（召唤动效 / 退场动效 / 课表变更确认 / 生成图全屏预览）：
 * 全部严格按条件挂载，关闭时零常驻 Modal 与动画节点。
 */
export function AssistantOverlays({
  summonFx,
  onSummonDone,
  leaveFx,
  onLeaveDone,
  scheduleChange,
  onCloseScheduleChange,
  onAppliedScheduleChange,
  preview,
  onClosePreview,
}: AssistantOverlaysProps) {
  return (
    <>
      {/* 召唤动效：闪亮登场 + 施法变身 */}
      {summonFx ? <WhaleSummonFX onDone={onSummonDone} /> : null}

      {/* 退场动效：摆尾钻回水里，结束后收回鲸鱼人格 */}
      {leaveFx ? <WhaleLeaveFX onDone={onLeaveDone} /> : null}

      {scheduleChange ? (
        <ScheduleChangeDialog
          preview={scheduleChange.preview}
          onClose={onCloseScheduleChange}
          onApplied={onAppliedScheduleChange}
        />
      ) : null}

      {/* 生成图全屏预览（仅在打开预览时挂载 Modal） */}
      {preview ? (
        <Modal
          visible
          transparent
          animationType="fade"
          statusBarTranslucent
          onRequestClose={onClosePreview}
        >
          <Pressable style={styles.previewBackdrop} onPress={onClosePreview}>
            <Pressable
              onPress={onClosePreview}
              hitSlop={10}
              style={styles.previewCloseBtn}
            >
              <Ionicons name="close" size={20} color="#F8FAFC" />
            </Pressable>
            <Image
              source={{ uri: preview }}
              style={styles.previewImage}
              resizeMode="contain"
            />
            <Text style={styles.previewHint}>轻点任意空白处关闭预览</Text>
          </Pressable>
        </Modal>
      ) : null}
    </>
  );
}
