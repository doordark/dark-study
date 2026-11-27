import Ionicons from "@expo/vector-icons/Ionicons";
import { LinearGradient } from "expo-linear-gradient";
import React, { memo, useEffect, useState } from "react";
import {
  Image,
  Linking,
  Pressable,
  StyleSheet,
  Text,
  View,
  type PressableProps,
  type StyleProp,
  type ViewStyle,
} from "react-native";
import Animated, {
  Easing,
  FadeInDown,
  cancelAnimation,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withSpring,
  withTiming,
} from "react-native-reanimated";

import { ChatImage } from "@/components/ChatImage";
import { GlassContainer } from "@/components/GlassContainer";
import { WhaleAvatar } from "@/components/WhaleAvatar";
import { getWhaleSticker, type WhaleStickerId } from "@/constants/whaleStickers";
import { useAnimationActive } from "@/hooks/useAnimationActive";
import type { ChatMessage, ScheduleAction } from "@/types";
import type { WhalePersona } from "@/utils/whalePersona";
import { renderPersonaText } from "@/utils/whalePersona";

import {
  PRESS_SPRING,
  WHALE_STARTER_CARDS,
  assistantStyles as styles,
  formatMessageTime,
  getNoticePalette,
  type WhaleQuickItem,
} from "./assistantStyles";

export interface TactilePressableProps
  extends Omit<PressableProps, "style" | "children"> {
  style?: StyleProp<ViewStyle>;
  pressedOpacity?: number;
  pressedScale?: number;
  children?: React.ReactNode;
}

/**
 * 兼容 NativeWind v4 + RN 0.88 的按压容器：
 * 始终向 Pressable 传递静态数组 style（避免函数式 style 被 css-interop 整段丢弃），
 * 同时保留顺滑的按压透明度与微缩放反馈。
 */
export function TactilePressable({
  style,
  pressedOpacity = 0.78,
  pressedScale = 1,
  disabled,
  onPressIn,
  onPressOut,
  children,
  ...rest
}: TactilePressableProps) {
  const [pressed, setPressed] = useState(false);

  return (
    <Pressable
      {...rest}
      disabled={disabled}
      onPressIn={(event) => {
        if (!disabled) setPressed(true);
        onPressIn?.(event);
      }}
      onPressOut={(event) => {
        setPressed(false);
        onPressOut?.(event);
      }}
      style={[
        style,
        pressed && !disabled
          ? {
              opacity: pressedOpacity,
              ...(pressedScale !== 1
                ? { transform: [{ scale: pressedScale }] }
                : {}),
            }
          : null,
      ]}
    >
      {children}
    </Pressable>
  );
}

/** 大肥鱼聊天界面专属液态玻璃消息气泡 */
export const WhaleChatBubble = memo(function WhaleChatBubble({
  message: m,
  isDark,
  selectMode,
  checked,
  onSelect,
  onPreview,
  onApply,
}: {
  message: ChatMessage;
  isDark: boolean;
  selectMode: boolean;
  checked: boolean;
  onSelect: (id: string, long: boolean) => void;
  onPreview: (uri: string) => void;
  onApply: (actions: ScheduleAction[]) => void;
}) {
  const isUser = m.role === "user";
  const timeLabel = formatMessageTime(m.timestamp);

  const rowGesture = {
    delayLongPress: 280,
    onLongPress: () => onSelect(m.id, true),
    onPress: () => onSelect(m.id, false),
  };

  const checkDot = selectMode ? (
    <View style={{ marginRight: isUser ? 0 : 8, marginLeft: isUser ? 8 : 0, alignSelf: "center" }}>
      <Ionicons
        name={checked ? "checkmark-circle" : "ellipse-outline"}
        size={20}
        color={checked ? "#38BDF8" : isDark ? "rgba(148,163,184,0.65)" : "#94A3B8"}
      />
    </View>
  ) : null;

  const avatarBadge = (
    <View
      style={{
        marginRight: 9,
        alignSelf: "flex-end",
        width: 40,
        height: 40,
        borderRadius: 15,
        borderCurve: "continuous",
        alignItems: "center",
        justifyContent: "center",
        overflow: "hidden",
        backgroundColor: isDark ? "rgba(56,189,248,0.16)" : "rgba(255,255,255,0.72)",
        borderWidth: 1,
        borderColor: isDark ? "rgba(186,230,253,0.24)" : "rgba(125,211,252,0.46)",
        boxShadow: [
          {
            offsetX: 0,
            offsetY: 3,
            blurRadius: 10,
            color: isDark ? "rgba(2,10,24,0.32)" : "rgba(56,130,196,0.14)",
          },
        ],
      }}
    >
      <WhaleAvatar size={36} active={false} />
    </View>
  );

  // 表情包消息：清爽无框悬浮呈现，带柔和落影
  if (m.sticker) {
    return (
      <Pressable {...rowGesture}>
        <View
          style={{
            flexDirection: "row",
            justifyContent: "flex-start",
            alignItems: "flex-end",
            opacity: selectMode && !checked ? 0.72 : 1,
          }}
        >
          {checkDot}
          {avatarBadge}
          <View
            style={{
              borderRadius: 22,
              padding: 4,
              backgroundColor: isDark ? "rgba(255,255,255,0.04)" : "rgba(255,255,255,0.35)",
              borderWidth: 1,
              borderColor: isDark ? "rgba(186,230,253,0.12)" : "rgba(255,255,255,0.6)",
            }}
          >
            <Image
              source={getWhaleSticker(m.sticker as WhaleStickerId)}
              resizeMode="contain"
              style={{ width: 124, height: 124 }}
            />
          </View>
        </View>
      </Pressable>
    );
  }

  return (
    <Pressable {...rowGesture}>
      <View
        style={{
          flexDirection: "row",
          justifyContent: isUser ? "flex-end" : "flex-start",
          alignItems: "flex-end",
          opacity: selectMode && !checked ? 0.72 : 1,
        }}
      >
        {!isUser ? checkDot : null}
        {!isUser ? avatarBadge : null}

        <View
          style={{
            maxWidth: "79%",
            overflow: "hidden",
            borderRadius: 22,
            borderCurve: "continuous",
            borderBottomRightRadius: isUser ? 6 : 22,
            borderBottomLeftRadius: isUser ? 22 : 6,
            paddingHorizontal: 14,
            paddingTop: 11,
            paddingBottom: timeLabel ? 8 : 11,
            backgroundColor: isUser
              ? "#0EA5E9"
              : isDark
                ? "rgba(22,40,68,0.68)"
                : "rgba(255,255,255,0.84)",
            borderWidth: 1,
            borderColor: checked
              ? "#38BDF8"
              : isUser
                ? "rgba(255,255,255,0.28)"
                : isDark
                  ? "rgba(186,230,253,0.22)"
                  : "rgba(186,230,253,0.72)",
            boxShadow: [
              {
                offsetX: 0,
                offsetY: 4,
                blurRadius: 14,
                color: isUser
                  ? isDark
                    ? "rgba(14,165,233,0.26)"
                    : "rgba(14,165,233,0.22)"
                  : isDark
                    ? "rgba(2,8,22,0.34)"
                    : "rgba(30,82,138,0.10)",
              },
            ],
          }}
        >
          {/* 顶部液态玻璃高光折射膜 */}
          {isUser ? (
            <LinearGradient
              pointerEvents="none"
              colors={isDark ? ["#38BDF8", "#4F7BF2"] : ["#0EA5E9", "#3B82F6"]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={StyleSheet.absoluteFill}
            />
          ) : (
            <LinearGradient
              pointerEvents="none"
              colors={
                isDark
                  ? [
                      "rgba(204,238,255,0.14)",
                      "rgba(96,165,250,0.04)",
                      "rgba(15,23,42,0.06)",
                    ]
                  : [
                      "rgba(255,255,255,0.76)",
                      "rgba(232,246,255,0.24)",
                      "rgba(240,249,255,0.08)",
                    ]
              }
              start={{ x: 0, y: 0 }}
              end={{ x: 0.9, y: 1 }}
              style={StyleSheet.absoluteFill}
            />
          )}

          {/* 极克制的水泡角标水印，保持文字绝对清晰 */}
          <Image
            pointerEvents="none"
            source={require("../../../assets/stickers/bubble.png")}
            resizeMode="contain"
            style={{
              position: "absolute",
              width: 32,
              height: 32,
              right: -4,
              top: -6,
              opacity: isUser ? 0.11 : isDark ? 0.11 : 0.14,
            }}
          />

          <Text
            style={{
              fontSize: 13.5,
              lineHeight: 21.5,
              letterSpacing: 0.12,
              color: isUser ? "#FFFFFF" : isDark ? "#EAF4FF" : "#0F2942",
            }}
          >
            {m.content}
          </Text>

          {m.imageUri ? (
            <TactilePressable
              onPress={() => onPreview(m.imageUri!)}
              pressedOpacity={0.9}
              style={{
                marginTop: 9,
                borderRadius: 16,
                overflow: "hidden",
                borderWidth: 1,
                borderColor: isDark
                  ? "rgba(186,230,253,0.22)"
                  : "rgba(125,211,252,0.46)",
              }}
            >
              <ChatImage uri={m.imageUri} aspectRatio={m.imageAspect ?? 1} />
              <View
                pointerEvents="none"
                style={{
                  position: "absolute",
                  right: 7,
                  bottom: 7,
                  flexDirection: "row",
                  alignItems: "center",
                  gap: 3,
                  borderRadius: 999,
                  paddingHorizontal: 8,
                  paddingVertical: 3,
                  backgroundColor: "rgba(9,16,30,0.62)",
                  borderWidth: 0.75,
                  borderColor: "rgba(255,255,255,0.22)",
                }}
              >
                <Ionicons name="expand-outline" size={10} color="#E0F2FE" />
                <Text style={{ fontSize: 9.5, fontWeight: "600", color: "#E0F2FE" }}>
                  查看大图
                </Text>
              </View>
            </TactilePressable>
          ) : null}

          {m.sources?.length ? (
            <View style={{ marginTop: 9, gap: 5 }}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
                <Ionicons
                  name="globe-outline"
                  size={11}
                  color={isDark ? "#7DD3FC" : "#0284C7"}
                />
                <Text
                  style={{
                    fontSize: 9.5,
                    fontWeight: "700",
                    letterSpacing: 0.3,
                    color: isDark ? "#7DD3FC" : "#0284C7",
                  }}
                >
                  参考来源
                </Text>
              </View>
              {m.sources.map((s) => (
                <TactilePressable
                  key={s.url}
                  onPress={() => Linking.openURL(s.url).catch(() => {})}
                  pressedOpacity={0.75}
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    gap: 5,
                    borderRadius: 10,
                    paddingHorizontal: 8,
                    paddingVertical: 5,
                    backgroundColor: isDark
                      ? "rgba(125,211,252,0.09)"
                      : "rgba(14,165,233,0.08)",
                    borderWidth: 0.75,
                    borderColor: isDark
                      ? "rgba(125,211,252,0.18)"
                      : "rgba(14,165,233,0.18)",
                  }}
                >
                  <Ionicons
                    name="link-outline"
                    size={11}
                    color={isDark ? "#93C5FD" : "#0369A1"}
                  />
                  <Text
                    numberOfLines={1}
                    style={{
                      flex: 1,
                      fontSize: 10,
                      color: isDark ? "#BAE6FD" : "#0369A1",
                    }}
                  >
                    {s.title}
                  </Text>
                </TactilePressable>
              ))}
            </View>
          ) : null}

          {m.actions?.length ? (
            <TactilePressable
              onPress={() => onApply(m.actions!)}
              pressedOpacity={0.8}
              pressedScale={0.97}
              style={{
                marginTop: 10,
                alignSelf: "flex-start",
                flexDirection: "row",
                alignItems: "center",
                gap: 5,
                borderRadius: 999,
                paddingHorizontal: 13,
                paddingVertical: 6.5,
                backgroundColor: isDark
                  ? "rgba(16,185,129,0.28)"
                  : "rgba(16,185,129,0.16)",
                borderWidth: 1,
                borderColor: isDark
                  ? "rgba(52,211,153,0.52)"
                  : "rgba(16,185,129,0.4)",
              }}
            >
              <Ionicons
                name="checkmark-circle"
                size={14}
                color={isDark ? "#6EE7B7" : "#059669"}
              />
              <Text
                style={{
                  fontSize: 11.5,
                  fontWeight: "700",
                  color: isDark ? "#D1FAE5" : "#065F46",
                }}
              >
                {m.actions.length > 1
                  ? `预览 ${m.actions.length} 项操作`
                  : m.actions[0].type === "add"
                    ? "预览添加课程"
                    : m.actions[0].type === "remove"
                      ? "预览删除课程"
                      : m.actions[0].type === "update"
                        ? "预览课程修改"
                        : m.actions[0].type === "create_schedule"
                          ? "预览新建课表"
                          : m.actions[0].type === "merge_schedule"
                            ? "预览合并课表"
                            : "预览新增待办"}
              </Text>
            </TactilePressable>
          ) : null}

          {timeLabel ? (
            <Text
              style={{
                marginTop: 4,
                alignSelf: isUser ? "flex-end" : "flex-start",
                fontSize: 9,
                color: isUser
                  ? "rgba(255,255,255,0.72)"
                  : isDark
                    ? "rgba(148,184,218,0.62)"
                    : "rgba(100,116,139,0.68)",
              }}
            >
              {timeLabel}
            </Text>
          ) : null}
        </View>

        {isUser ? checkDot : null}
      </View>
    </Pressable>
  );
});

/** 有机三点波浪输入指示器 */
export function WhaleTypingBubble({
  whale,
  personaName,
  isDark,
  statusText,
}: {
  whale: boolean;
  personaName: string;
  isDark: boolean;
  statusText?: string | null;
}) {
  const reducedMotion = useReducedMotion();
  const active = useAnimationActive(!reducedMotion);
  const pulse = useSharedValue(0);

  useEffect(() => {
    if (!active) {
      cancelAnimation(pulse);
      pulse.set(0.5);
      return;
    }
    pulse.set(
      withRepeat(
        withTiming(1, { duration: 1050, easing: Easing.inOut(Easing.sin) }),
        -1,
        true,
      ),
    );
    return () => cancelAnimation(pulse);
  }, [active, pulse]);

  const dot0 = useAnimatedStyle(() => {
    const v = Math.sin(pulse.value * Math.PI);
    return { opacity: 0.4 + v * 0.6, transform: [{ translateY: -v * 3 }] };
  });
  const dot1 = useAnimatedStyle(() => {
    const v = Math.sin((pulse.value + 0.33) * Math.PI);
    return { opacity: 0.4 + Math.abs(v) * 0.6, transform: [{ translateY: -Math.abs(v) * 3 }] };
  });
  const dot2 = useAnimatedStyle(() => {
    const v = Math.sin((pulse.value + 0.66) * Math.PI);
    return { opacity: 0.4 + Math.abs(v) * 0.6, transform: [{ translateY: -Math.abs(v) * 3 }] };
  });

  const dotColor = whale
    ? isDark
      ? "#7DD3FC"
      : "#0284C7"
    : isDark
      ? "#94A3B8"
      : "#475569";

  return (
    <Animated.View
      entering={FadeInDown.duration(180)}
      style={{ flexDirection: "row", alignItems: "flex-end", marginBottom: 4 }}
    >
      {whale ? (
        <View
          style={{
            marginRight: 9,
            width: 34,
            height: 34,
            borderRadius: 13,
            alignItems: "center",
            justifyContent: "center",
            overflow: "hidden",
            backgroundColor: isDark ? "rgba(56,189,248,0.16)" : "rgba(255,255,255,0.72)",
            borderWidth: 1,
            borderColor: isDark ? "rgba(186,230,253,0.22)" : "rgba(125,211,252,0.46)",
          }}
        >
          <WhaleAvatar size={30} />
        </View>
      ) : null}
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          gap: 7,
          borderRadius: 20,
          borderBottomLeftRadius: 6,
          borderCurve: "continuous",
          paddingHorizontal: 14,
          paddingVertical: 10,
          backgroundColor: whale
            ? isDark
              ? "rgba(22,40,68,0.72)"
              : "rgba(255,255,255,0.86)"
            : isDark
              ? "rgba(255,255,255,0.09)"
              : "rgba(255,255,255,0.72)",
          borderWidth: 1,
          borderColor: whale
            ? isDark
              ? "rgba(186,230,253,0.22)"
              : "rgba(125,211,252,0.52)"
            : isDark
              ? "rgba(255,255,255,0.12)"
              : "rgba(148,163,184,0.28)",
        }}
      >
        <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
          {[dot0, dot1, dot2].map((dotStyle, idx) => (
            <Animated.View
              key={idx}
              style={[
                {
                  width: 5.5,
                  height: 5.5,
                  borderRadius: 3,
                  backgroundColor: dotColor,
                },
                dotStyle,
              ]}
            />
          ))}
        </View>
        <Text
          style={{
            fontSize: 11.5,
            fontWeight: "600",
            color: whale
              ? isDark
                ? "#BAE6FD"
                : "#0369A1"
              : isDark
                ? "#CBD5E1"
                : "#475569",
          }}
        >
          {statusText || (whale ? `${personaName}正在嚼白饭想回复…` : "正在思考…")}
        </Text>
      </View>
    </Animated.View>
  );
}

/** 快捷玻璃态功能胶囊（带图标与 Q 弹回弹） */
export function WhaleQuickPill({
  item,
  isDark,
  disabled,
  onPress,
}: {
  item: WhaleQuickItem;
  isDark: boolean;
  disabled: boolean;
  onPress: () => void;
}) {
  const scale = useSharedValue(1);
  const reducedMotion = useReducedMotion();

  useEffect(() => () => cancelAnimation(scale), [scale]);

  const animStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
    opacity: disabled ? 0.45 : 1,
  }));

  return (
    <Animated.View style={animStyle}>
      <Pressable
        onPress={onPress}
        onPressIn={() => {
          if (!disabled && !reducedMotion) scale.set(withSpring(0.94, PRESS_SPRING));
        }}
        onPressOut={() => {
          if (!reducedMotion) scale.set(withSpring(1, PRESS_SPRING));
        }}
        disabled={disabled}
        style={{
          flexDirection: "row",
          alignItems: "center",
          gap: 5,
          borderRadius: 999,
          paddingHorizontal: 11,
          paddingVertical: 6.5,
          backgroundColor: isDark
            ? "rgba(22,38,64,0.62)"
            : "rgba(255,255,255,0.76)",
          borderWidth: 1,
          borderColor: isDark
            ? "rgba(186,230,253,0.20)"
            : "rgba(186,230,253,0.68)",
          boxShadow: [
            {
              offsetX: 0,
              offsetY: 2,
              blurRadius: 8,
              color: isDark ? "rgba(2,8,20,0.26)" : "rgba(30,82,138,0.08)",
            },
          ],
        }}
      >
        <Ionicons name={item.icon} size={12.5} color={item.tint} />
        <Text
          style={{
            fontSize: 11,
            fontWeight: "600",
            color: isDark ? "#E0F2FE" : "#0F2942",
          }}
        >
          {item.label}
        </Text>
      </Pressable>
    </Animated.View>
  );
}

/** 通用错误/成功提示条 */
export function NoticeBanner({
  notice,
  isDark,
  style,
}: {
  notice: { type: "error" | "success"; text: string };
  isDark: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const palette = getNoticePalette(notice.type, isDark);
  return (
    <Animated.View entering={FadeInDown.duration(180)} style={style}>
      <View
        style={[
          styles.noticeBox,
          {
            borderColor: palette.borderColor,
            backgroundColor: palette.backgroundColor,
          },
        ]}
      >
        <Ionicons name={palette.iconName} size={16} color={palette.iconColor} />
        <Text style={[styles.noticeText, { color: palette.textColor }]}>
          {notice.text}
        </Text>
      </View>
    </Animated.View>
  );
}

/** 多选删除顶部悬浮操作条 */
export function SelectModeBar({
  selectedCount,
  isDark,
  onDelete,
  onCancel,
}: {
  selectedCount: number;
  isDark: boolean;
  onDelete: () => void;
  onCancel: () => void;
}) {
  return (
    <Animated.View entering={FadeInDown.duration(180)} style={styles.selectBarWrap}>
      <GlassContainer
        radius={18}
        variant="floating"
        borderOpacity={0.22}
        style={styles.selectBarGlass}
      >
        <View style={styles.selectBarLeft}>
          <Ionicons name="checkmark-done-circle" size={16} color="#38BDF8" />
          <Text
            style={[
              styles.selectBarCount,
              { color: isDark ? "#E2E8F0" : "#1E293B" },
            ]}
          >
            已选 {selectedCount} 条消息
          </Text>
        </View>
        <View style={styles.selectBarRight}>
          <Pressable onPress={onDelete} hitSlop={8} style={styles.selectDeleteBtn}>
            <Text
              style={[
                styles.selectDeleteText,
                { color: isDark ? "#FDA4AF" : "#E11D48" },
              ]}
            >
              删除
            </Text>
          </Pressable>
          <Pressable onPress={onCancel} hitSlop={8}>
            <Text
              style={[
                styles.selectCancelText,
                { color: isDark ? "#94A3B8" : "#64748B" },
              ]}
            >
              取消
            </Text>
          </Pressable>
        </View>
      </GlassContainer>
    </Animated.View>
  );
}

/** 鲸鱼模式空态欢迎卡 + 2x2 玻璃态开场快捷卡片 */
export function WhaleEmptyCard({
  isDark,
  reducedMotion,
  persona,
  emotionLabel,
  emotionColor,
  bondLevel,
  bondTitle,
  onPickPrompt,
}: {
  isDark: boolean;
  reducedMotion: boolean;
  persona: WhalePersona;
  emotionLabel: string;
  emotionColor: string;
  bondLevel: number;
  bondTitle: string;
  onPickPrompt: (prompt: string) => void;
}) {
  return (
    <Animated.View
      entering={reducedMotion ? undefined : FadeInDown.springify().damping(20)}
    >
      <GlassContainer radius={28} variant="surface" borderOpacity={0.24} highlight>
        <View style={{ alignItems: "center", paddingHorizontal: 18, paddingTop: 22, paddingBottom: 20 }}>
          <View
            style={{
              width: 92,
              height: 92,
              borderRadius: 30,
              borderCurve: "continuous",
              alignItems: "center",
              justifyContent: "center",
              overflow: "hidden",
              backgroundColor: isDark
                ? "rgba(56,189,248,0.18)"
                : "rgba(224,242,254,0.85)",
              borderWidth: 1.5,
              borderColor: isDark
                ? "rgba(186,230,253,0.34)"
                : "rgba(125,211,252,0.68)",
              boxShadow: [
                {
                  offsetX: 0,
                  offsetY: 6,
                  blurRadius: 18,
                  color: isDark
                    ? "rgba(56,189,248,0.22)"
                    : "rgba(56,189,248,0.2)",
                },
              ],
            }}
          >
            <WhaleAvatar size={84} />
          </View>

          <Text
            style={{
              marginTop: 12,
              fontSize: 16.5,
              fontWeight: "800",
              color: isDark ? "#F1F5F9" : "#0F172A",
            }}
          >
            {persona.name}上线啦
          </Text>

          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              gap: 6,
              marginTop: 6,
            }}
          >
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                gap: 4,
                borderRadius: 999,
                paddingHorizontal: 9,
                paddingVertical: 3,
                backgroundColor: isDark
                  ? "rgba(56,189,248,0.14)"
                  : "rgba(14,165,233,0.1)",
              }}
            >
              <View
                style={{
                  width: 6,
                  height: 6,
                  borderRadius: 3,
                  backgroundColor: emotionColor,
                }}
              />
              <Text
                style={{
                  fontSize: 10,
                  fontWeight: "700",
                  color: isDark ? "#BAE6FD" : "#0369A1",
                }}
              >
                此刻 · {emotionLabel}
              </Text>
            </View>
            <View
              style={{
                borderRadius: 999,
                paddingHorizontal: 9,
                paddingVertical: 3,
                backgroundColor: isDark
                  ? "rgba(167,139,250,0.15)"
                  : "rgba(139,92,246,0.1)",
              }}
            >
              <Text
                style={{
                  fontSize: 10,
                  fontWeight: "700",
                  color: isDark ? "#DDD6FE" : "#6D28D9",
                }}
              >
                Lv.{bondLevel} {bondTitle}
              </Text>
            </View>
          </View>

          <Text
            style={{
              marginTop: 8,
              textAlign: "center",
              fontSize: 11.5,
              lineHeight: 17,
              color: isDark ? "#94A3B8" : "#64748B",
            }}
          >
            {renderPersonaText(
              "{{user}}，今天想让我做点什么？点右上角头像还能随时唤我当桌宠哦。",
              persona,
            )}
          </Text>

          {/* 2x2 玻璃态开场快捷卡片 */}
          <View
            style={{
              marginTop: 14,
              width: "100%",
              flexDirection: "row",
              flexWrap: "wrap",
              gap: 8,
            }}
          >
            {WHALE_STARTER_CARDS.map((card) => (
              <TactilePressable
                key={card.title}
                onPress={() => onPickPrompt(card.prompt)}
                pressedOpacity={0.78}
                pressedScale={0.97}
                style={{
                  flexGrow: 1,
                  flexBasis: "46%",
                  minWidth: 0,
                  borderRadius: 16,
                  borderCurve: "continuous",
                  paddingHorizontal: 11,
                  paddingVertical: 10,
                  backgroundColor: isDark
                    ? "rgba(255,255,255,0.06)"
                    : "rgba(255,255,255,0.72)",
                  borderWidth: 1,
                  borderColor: isDark
                    ? "rgba(186,230,253,0.16)"
                    : "rgba(186,230,253,0.58)",
                }}
              >
                <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                  <View
                    style={{
                      width: 24,
                      height: 24,
                      borderRadius: 9,
                      alignItems: "center",
                      justifyContent: "center",
                      backgroundColor: isDark
                        ? "rgba(255,255,255,0.08)"
                        : "rgba(241,245,249,0.9)",
                    }}
                  >
                    <Ionicons name={card.icon} size={13} color={card.color} />
                  </View>
                  <Text
                    numberOfLines={1}
                    style={{
                      flex: 1,
                      fontSize: 12,
                      fontWeight: "700",
                      color: isDark ? "#E2F2FF" : "#0F2942",
                    }}
                  >
                    {card.title}
                  </Text>
                </View>
                <Text
                  numberOfLines={1}
                  style={{
                    marginTop: 4,
                    fontSize: 10,
                    color: isDark ? "#94A3B8" : "#64748B",
                  }}
                >
                  {card.subtitle}
                </Text>
              </TactilePressable>
            ))}
          </View>
        </View>
      </GlassContainer>
    </Animated.View>
  );
}
