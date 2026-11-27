import Ionicons from "@expo/vector-icons/Ionicons";
import { LinearGradient } from "expo-linear-gradient";
import { router, useFocusEffect, useIsFocused } from "expo-router";
import { useColorScheme } from "nativewind";
import React, {
  memo,
  startTransition,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  AppState,
  FlatList,
  Image,
  Keyboard,
  Linking,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
  type PressableProps,
  type StyleProp,
  type ViewStyle,
} from "react-native";
import Animated, {
  Easing,
  FadeIn,
  FadeInDown,
  FadeOut,
  cancelAnimation,
  runOnJS,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withSequence,
  withSpring,
  withTiming,
} from "react-native-reanimated";

import { AssistantMessage } from "@/components/AssistantMessage";
import { Backdrop } from "@/components/Backdrop";
import { ChatImage } from "@/components/ChatImage";
import { ChatInputBar } from "@/components/ChatInputBar";
import { GlassContainer } from "@/components/GlassContainer";
import { ScheduleChangeDialog } from "@/components/ScheduleChangeDialog";
import { AssistantEmptyState } from "@/components/AssistantEmptyState";
import { WhaleAvatar } from "@/components/WhaleAvatar";
import { WhaleDeco } from "@/components/WhaleDeco";
import { WhaleLeaveFX, WhaleSummonFX } from "@/components/WhaleSummonFX";
import { BACKGROUND_PRESETS, resolveTint } from "@/constants/backgrounds";
import { resolveGlassOpticalProfile } from "@/constants/glassThemes";
import { WHALE_STICKERS, type WhaleStickerId } from "@/constants/whaleStickers";
import { useAnimationActive } from "@/hooks/useAnimationActive";
import { buildDesktopPetPayload } from "@/hooks/useDesktopPetSync";
import { askAssistant, type AssistantResult } from "@/services/ai";
import { previewScheduleActions, type ScheduleActionPreview } from "@/services/assistantSchedule";
import {
  desktopPetAvailable,
  getDesktopPetStatus,
  requestDesktopPetPermission,
  startDesktopPet,
} from "@/services/desktopPet";
import { playSfx } from "@/services/soundEffects";
import {
  answerFromSearch,
  buildImageUrl,
  imageAspect,
  searchWeb,
} from "@/services/whaleTools";
import { speakWhale, stopWhaleVoice } from "@/services/whaleVoice";
import { useDesktopPet } from "@/store/useDesktopPet";
import { useSettings } from "@/store/useSettings";
import { useActiveSchedule, useStore } from "@/store/useStore";
import { useWhaleMemory } from "@/store/useWhaleMemory";
import { useWhalePersona } from "@/store/useWhalePersona";
import { useWhalePet } from "@/store/useWhalePet";
import { useWhaleVoice } from "@/store/useWhaleVoice";
import type {
  AssistantAction,
  ChatMessage,
  ScheduleAction,
  WhaleAction,
} from "@/types";
import {
  bumpHaptic,
  successHaptic,
  tapHaptic,
  thumpHaptic,
} from "@/utils/haptics";
import { nowTs, uid } from "@/utils/id";
import { getDateInfo } from "@/utils/time";
import { pickPersonaLine } from "@/utils/whaleBehavior";
import { describeWhaleEmotion, resolveBondStage } from "@/utils/whaleEmotion";
import { getWhaleAgentConfig, renderPersonaText, type WhaleThinkingMode } from "@/utils/whalePersona";


interface WhaleQuickItem {
  label: string;
  prompt: string;
  icon: keyof typeof Ionicons.glyphMap;
  tint: string;
}

/** 用户专属：大肥鱼的额外玩法快捷胶囊 */
const WHALE_QUICK_ITEMS: readonly WhaleQuickItem[] = [
  { label: "出来陪我", prompt: "出来陪我", icon: "sparkles", tint: "#38BDF8" },
  { label: "今日运势", prompt: "帮我看看今日运势", icon: "planet-outline", tint: "#A78BFA" },
  { label: "夸夸我", prompt: "夸夸我", icon: "heart-outline", tint: "#F472B6" },
  { label: "今天吃什么", prompt: "今天吃什么", icon: "restaurant-outline", tint: "#FBBF24" },
  { label: "摸鱼一下", prompt: "摸鱼一下", icon: "cafe-outline", tint: "#34D399" },
  { label: "晚霞粉背景", prompt: "把背景换成晚霞粉", icon: "color-palette-outline", tint: "#FB7185" },
  { label: "薄荷绿背景", prompt: "让背景变成薄荷绿", icon: "leaf-outline", tint: "#2DD4BF" },
  { label: "搜 AI 新闻", prompt: "帮我搜一下最近有什么 AI 新闻", icon: "globe-outline", tint: "#60A5FA" },
  { label: "画吃白饭", prompt: "画一张你在吃白饭的样子", icon: "brush-outline", tint: "#C084FC" },
  { label: "先退下吧", prompt: "行了你先退下吧，我要好好学习了", icon: "moon-outline", tint: "#94A3B8" },
];

const WHALE_STARTER_CARDS: readonly {
  title: string;
  subtitle: string;
  prompt: string;
  icon: keyof typeof Ionicons.glyphMap;
  color: string;
}[] = [
  {
    title: "召唤桌宠",
    subtitle: "到屏幕边陪你玩",
    prompt: "出来陪我",
    icon: "sparkles",
    color: "#38BDF8",
  },
  {
    title: "今日运势",
    subtitle: "看看今天的幸运色",
    prompt: "帮我看看今日运势",
    icon: "planet-outline",
    color: "#A78BFA",
  },
  {
    title: "夸夸充电",
    subtitle: "来点软乎乎鼓励",
    prompt: "夸夸我",
    icon: "heart",
    color: "#F472B6",
  },
  {
    title: "换个主题色",
    subtitle: "切换治愈晚霞粉",
    prompt: "把背景换成晚霞粉",
    icon: "color-palette-outline",
    color: "#FB923C",
  },
];

/** 想让她到屏幕边上陪着（桌宠）的说法；精确口令走本地，语义判断交给模型 */
const PET_WORDS = /桌宠|出来陪我|出来陪|陪我玩|出来玩|跳出来|爬出来/;

/** 连点互动头像时的递进反应 */
const AVATAR_TAPS = [
  "呀，被{{user}}轻轻点了一下～有什么事呀？",
  "别一直戳啦，会戳出小泡泡的…",
  "呜，我可是会记仇的（假装气鼓鼓）",
  "再戳？再戳我就直接跳到屏幕边陪你啦！",
  "嘿嘿…其实我也一直想贴在{{user}}旁边呢～",
];

/** 除自定义口令外始终有效的通用召唤词 */
const SUMMON_ALIASES = ["召唤大肥鱼", "大肥鱼出来", "肥鱼出来", "whaletest"];
const DISMISS_ALIASES = ["大爹走了", "退下吧", "变回课表助手"];

const POPOVER_SPRING = { damping: 18, stiffness: 270, mass: 0.78 };
const PRESS_SPRING = { damping: 20, stiffness: 320, mass: 0.72 };

const messageKey = (message: ChatMessage) => message.id;

const normalizeCmd = (text: string) => text.trim().replace(/[!！。.~～]+$/, "");

const SCHEDULE_TYPES = new Set([
  "add",
  "remove",
  "update",
  "create_schedule",
  "merge_schedule",
  "add_task",
]);
const isScheduleAction = (a: AssistantAction): a is ScheduleAction =>
  SCHEDULE_TYPES.has(a.type);
const isWhaleAction = (a: AssistantAction): a is WhaleAction =>
  !SCHEDULE_TYPES.has(a.type);

function formatMessageTime(ts?: number): string {
  if (!ts || !Number.isFinite(ts)) return "";
  const d = new Date(ts);
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  return `${hh}:${mm}`;
}

function clampPct(value: number): number {
  return Math.min(100, Math.max(4, Math.round(value)));
}

interface TactilePressableProps
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
function TactilePressable({
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

/* -------------------------------------------------------------------------- */
/*  大肥鱼聊天界面专属子组件（液态玻璃消息气泡 / 动态思考波点 / 快捷胶囊 / 进度条）   */
/* -------------------------------------------------------------------------- */

const WhaleChatBubble = memo(function WhaleChatBubble({
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
              source={WHALE_STICKERS[m.sticker as WhaleStickerId]}
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
            source={require("../../assets/stickers/bubble.png")}
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
function WhaleTypingBubble({
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
      pulse.value = 0.5;
      return;
    }
    pulse.value = withRepeat(
      withTiming(1, { duration: 1050, easing: Easing.inOut(Easing.sin) }),
      -1,
      true,
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
function WhaleQuickPill({
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

/* -------------------------------------------------------------------------- */
/*  主页面：AssistantScreen                                                    */
/* -------------------------------------------------------------------------- */

export function AssistantScreen() {
  const { colorScheme } = useColorScheme();
  const isDark = colorScheme !== "light";
  const { width } = useWindowDimensions();
  const reducedMotion = useReducedMotion();
  const animationActive = useAnimationActive();

  const apiKey = useSettings((s) => s.apiKey);
  const whalePhrase = useSettings((s) => s.whalePhrase);
  const setWhalePhrase = useSettings((s) => s.setWhalePhrase);
  const setBackgroundTint = useSettings((s) => s.setBackgroundTint);
  const setBackgroundEffect = useSettings((s) => s.setBackgroundEffect);
  const backgroundTint = useSettings((s) => s.backgroundTint);
  const hasWallpaper = useSettings((s) => !!s.backgroundImage);
  const schedule = useActiveSchedule();
  const schedules = useStore((s) => s.schedules);

  // 大肥鱼的对话与人格状态存在本地，退出应用后记忆还在
  const messages = useWhaleMemory((s) => s.messages);
  const setMessages = useWhaleMemory((s) => s.setMessages);
  const whale = useWhaleMemory((s) => s.active);
  const emotion = useWhaleMemory((s) => s.emotion);
  const bond = useWhaleMemory((s) => s.bond);
  const factsCount = useWhaleMemory((s) => s.facts.length);
  const applyMood = useWhaleMemory((s) => s.applyMood);
  const bumpBond = useWhaleMemory((s) => s.bumpBond);
  const persona = useWhalePersona((s) => s.persona);
  const updateWhaleAgent = useWhalePersona((s) => s.updateAgent);
  const whaleAgent = useMemo(() => getWhaleAgentConfig(persona), [persona]);
  const personaName = persona.name;
  const setWhale = useWhaleMemory((s) => s.setActive);
  const archiveMemory = useWhaleMemory((s) => s.archive);
  const restoreMemory = useWhaleMemory((s) => s.restore);
  const removeMemoryMessages = useWhaleMemory((s) => s.removeMessages);
  const clearMemory = useWhaleMemory((s) => s.clearMemory);

  const petVisible = useWhalePet((s) => s.visible);
  const petCare = useWhalePet((s) => s.care);
  const showPet = useWhalePet((s) => s.show);
  const hidePet = useWhalePet((s) => s.hide);
  const feedPet = useWhalePet((s) => s.feed);
  const patPet = useWhalePet((s) => s.pat);

  const autoFollow = useDesktopPet((s) => s.autoFollowBackground);
  const desktopPermission = useDesktopPet((s) => s.permission);
  const setAutoFollow = useDesktopPet((s) => s.setAutoFollowBackground);
  const setOverlayMode = useDesktopPet((s) => s.setOverlayMode);
  const refreshDesktop = useDesktopPet((s) => s.refresh);

  const emotionDesc = useMemo(() => describeWhaleEmotion(emotion), [emotion]);
  const bondStage = useMemo(
    () => resolveBondStage(bond, petCare.bond, factsCount),
    [bond, petCare.bond, factsCount],
  );
  const glassProfile = useMemo(
    () => resolveGlassOpticalProfile(backgroundTint, isDark, hasWallpaper),
    [backgroundTint, isDark, hasWallpaper],
  );

  // 长按消息进入多选，挑着删
  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [busyStatus, setBusyStatus] = useState<string | null>(null);
  const pendingRequest = useRef<AbortController | null>(null);
  const stopRequest = useCallback(() => {
    pendingRequest.current?.abort();
    pendingRequest.current = null;
    setBusy(false);
    setBusyStatus(null);
  }, []);
  const [notice, setNotice] = useState<{
    type: "error" | "success";
    text: string;
  } | null>(null);
  const [kbHeight, setKbHeight] = useState(0);
  const scrollRef = useRef<FlatList<ChatMessage>>(null);
  const followLatest = useRef(true);
  const displayMessages = useMemo(() => messages.slice().reverse(), [messages]);
  const onSelectMessage = useCallback(
    (id: string, long: boolean) => {
      if (long) {
        longPressAt.current = Date.now();
        setSelectMode(true);
        setSelectedIds([id]);
        bumpHaptic();
        return;
      }
      if (Date.now() - longPressAt.current < 600) return;
      if (selectMode) {
        setSelectedIds((previous) =>
          previous.includes(id)
            ? previous.filter((value) => value !== id)
            : [...previous, id],
        );
      }
    },
    [selectMode],
  );
  const voiceOn = useWhaleVoice((s) => s.on);
  const voiceScreenFocused = useIsFocused();
  useFocusEffect(useCallback(() => () => stopRequest(), [stopRequest]));
  useEffect(() => {
    const sub = AppState.addEventListener("change", (state) => {
      if (state !== "active") stopRequest();
    });
    const forget = useWhaleMemory.subscribe((next, previous) => {
      if (next.epoch !== previous.epoch) stopRequest();
    });
    return () => {
      sub.remove();
      forget();
      pendingRequest.current?.abort();
      pendingRequest.current = null;
    };
  }, [stopRequest]);
  const toggleVoiceStore = useWhaleVoice((s) => s.toggle);
  const hydrateVoice = useWhaleVoice((s) => s.hydrate);
  const spokenId = useRef<string | null>(null);
  // 本次进入页面之前的旧消息不再重读，避免每次打开对话都重新合成一遍语音
  const openedAt = useRef(nowTs());
  const longPressAt = useRef(0);
  const mountedRef = useRef(true);
  const [summonFx, setSummonFx] = useState(false);
  const [leaveFx, setLeaveFx] = useState(false);
  const [preview, setPreview] = useState<string | null>(null);

  /* ---- 右上角大肥鱼互动浮层状态与弹簧动画 ---- */
  const [popoverMounted, setPopoverMounted] = useState(false);
  const [popoverOpen, setPopoverOpen] = useState(false);
  const [popoverReaction, setPopoverReaction] = useState<string | null>(null);
  const taps = useRef({ count: 0, at: 0 });
  const reactionTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const popoverCloseTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** 退场动画期间延后的「切人格 / 追加告别 / 归档记忆」定时器 */
  const leaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const settleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const popoverProgress = useSharedValue(0);
  const avatarBtnScale = useSharedValue(1);
  const popoverAvatarBounce = useSharedValue(1);
  const haloPulse = useSharedValue(0);
  // 首帧进场与径向扩散波纹期间保持极轻骨架，等扩散波纹完全落幕后再无感点亮次要装饰与呼吸光环
  const [mountSettled, setMountSettled] = useState(false);

  useEffect(() => {
    let cancelled = false;
    let rafId: number | null = null;
    let timer: ReturnType<typeof setTimeout> | null = null;
    rafId = requestAnimationFrame(() => {
      rafId = null;
      if (cancelled) return;
      timer = setTimeout(() => {
        if (!cancelled) {
          startTransition(() => setMountSettled(true));
        }
      }, 460);
    });
    return () => {
      cancelled = true;
      if (rafId != null) cancelAnimationFrame(rafId);
      if (timer) clearTimeout(timer);
    };
  }, []);

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

  // 离开页面时自动收起浮层并清理定时器
  useFocusEffect(
    useCallback(
      () => () => {
        if (popoverCloseTimer.current) {
          clearTimeout(popoverCloseTimer.current);
          popoverCloseTimer.current = null;
        }
        cancelAnimation(popoverProgress);
        popoverProgress.set(0);
        setPopoverOpen(false);
        setPopoverMounted(false);
      },
      [popoverProgress],
    ),
  );

  useEffect(
    () => () => {
      mountedRef.current = false;
      if (reactionTimer.current) clearTimeout(reactionTimer.current);
      if (popoverCloseTimer.current) clearTimeout(popoverCloseTimer.current);
      if (leaveTimer.current) clearTimeout(leaveTimer.current);
      if (settleTimer.current) clearTimeout(settleTimer.current);
      cancelAnimation(popoverProgress);
      cancelAnimation(avatarBtnScale);
      cancelAnimation(popoverAvatarBounce);
      cancelAnimation(haloPulse);
    },
    [popoverProgress, avatarBtnScale, popoverAvatarBounce, haloPulse],
  );

  const finishClosePopover = useCallback(() => {
    if (!mountedRef.current) return;
    setPopoverMounted(false);
  }, []);

  const openCompanionPopover = useCallback(() => {
    if (popoverCloseTimer.current) {
      clearTimeout(popoverCloseTimer.current);
      popoverCloseTimer.current = null;
    }
    Keyboard.dismiss();
    tapHaptic();
    setPopoverMounted(true);
    setPopoverOpen(true);
    cancelAnimation(popoverProgress);
    if (reducedMotion) {
      popoverProgress.set(1);
    } else {
      popoverProgress.set(withSpring(1, POPOVER_SPRING));
    }
  }, [popoverProgress, reducedMotion]);

  const closeCompanionPopover = useCallback(
    () => {
      if (popoverCloseTimer.current) {
        clearTimeout(popoverCloseTimer.current);
        popoverCloseTimer.current = null;
      }
      if (!popoverOpen && !popoverMounted) return;
      setPopoverOpen(false);
      cancelAnimation(popoverProgress);
      if (reducedMotion) {
        popoverProgress.set(0);
        setPopoverMounted(false);
      } else {
        popoverProgress.set(
          withTiming(
            0,
            { duration: 160, easing: Easing.in(Easing.cubic) },
            (finished) => {
              if (finished) runOnJS(finishClosePopover)();
            },
          ),
        );
      }
    },
    [popoverOpen, popoverMounted, popoverProgress, reducedMotion, finishClosePopover],
  );

  /** 浮层内短反应气泡文字 */
  const flashPopoverReaction = useCallback((text: string, duration = 3600) => {
    if (reactionTimer.current) clearTimeout(reactionTimer.current);
    setPopoverReaction(text);
    reactionTimer.current = setTimeout(() => {
      if (mountedRef.current) setPopoverReaction(null);
      reactionTimer.current = null;
    }, duration);
  }, []);

  const triggerPortraitBounce = useCallback(() => {
    if (reducedMotion) return;
    popoverAvatarBounce.set(
      withSequence(
        withTiming(0.88, { duration: 75, easing: Easing.out(Easing.quad) }),
        withSpring(1, { damping: 10, stiffness: 260, mass: 0.65 }),
      ),
    );
  }, [popoverAvatarBounce, reducedMotion]);

  /** 点击右上角大肥鱼头像：立即优雅展开 / 收起玻璃态伴侣互动卡片 */
  const onTopRightAvatarPress = useCallback(() => {
    if (!whale) return;
    if (popoverOpen) {
      closeCompanionPopover();
    } else {
      openCompanionPopover();
    }
  }, [whale, popoverOpen, closeCompanionPopover, openCompanionPopover]);

  /** 在浮层内戳一戳大肥鱼头像：保留俏皮递进台词反馈 */
  const onPokeInPopover = useCallback(() => {
    const now = Date.now();
    if (now - taps.current.at > 4500) taps.current.count = 0;
    taps.current.count += 1;
    taps.current.at = now;
    const idx = Math.min(taps.current.count - 1, AVATAR_TAPS.length - 1);
    tapHaptic();
    triggerPortraitBounce();
    if (idx >= 2) {
      playSfx("whale_cute_tsun", {
        volume: 0.64,
        rate: 1 + idx * 0.03,
      });
    }
    flashPopoverReaction(
      renderPersonaText(AVATAR_TAPS[idx], useWhalePersona.getState().persona),
    );
    if (idx === AVATAR_TAPS.length - 1) {
      taps.current.count = 0;
    }
  }, [flashPopoverReaction, triggerPortraitBounce]);

  /** 浮层内：一键召唤或收回桌宠（平滑状态反馈，彻底消除割裂弹窗） */
  const handleTogglePetFromPopover = useCallback(() => {
    triggerPortraitBounce();
    if (petVisible) {
      tapHaptic();
      playSfx("whale_pet_dismiss", { volume: 0.64 });
      hidePet();
      flashPopoverReaction(
        renderPersonaText(
          "（轻轻摆尾游回水里）那我先在聊天窗里等你，{{user}}想我就再叫我出来～",
          useWhalePersona.getState().persona,
        ),
        2800,
      );
      return;
    }
    successHaptic();
    // 桌宠登场音效统一由 WhalePetLayer 挂载单点触发，避免双倍重叠发声
    showPet();
    applyMood({ pleasure: 8, arousal: 8, reason: "被叫到屏幕边陪着啦" });
    bumpBond("interaction");
    flashPopoverReaction(
      renderPersonaText(
        "来啦来啦！我这就游到屏幕边陪{{user}}，拖我或戳我都行哦～",
        useWhalePersona.getState().persona,
      ),
      2600,
    );
    if (popoverCloseTimer.current) clearTimeout(popoverCloseTimer.current);
    popoverCloseTimer.current = setTimeout(() => {
      popoverCloseTimer.current = null;
      if (mountedRef.current) closeCompanionPopover();
    }, 560);
  }, [
    petVisible,
    hidePet,
    showPet,
    applyMood,
    bumpBond,
    flashPopoverReaction,
    triggerPortraitBounce,
    closeCompanionPopover,
  ]);

  /** 浮层内：摸摸头快捷互动 */
  const handlePatFromPopover = useCallback(() => {
    tapHaptic();
    triggerPortraitBounce();
    patPet();
    applyMood({ pleasure: 10, arousal: 3, reason: "被温柔摸了摸头" });
    bumpBond("interaction");
    const line = pickPersonaLine(
      "headpat",
      useWhalePersona.getState().persona,
      useWhaleMemory.getState().emotion,
    );
    flashPopoverReaction(renderPersonaText(line, useWhalePersona.getState().persona));
  }, [patPet, applyMood, bumpBond, flashPopoverReaction, triggerPortraitBounce]);

  /** 浮层内：喂白饭快捷互动 */
  const handleFeedFromPopover = useCallback(() => {
    successHaptic();
    triggerPortraitBounce();
    playSfx("whale_cute_happy", {
      volume: 0.74,
      rate: 1.05,
    });
    feedPet();
    applyMood({ pleasure: 10, arousal: 5, reason: "吃到了香香的白米饭" });
    bumpBond("interaction");
    flashPopoverReaction(
      renderPersonaText(
        "白饭团子！嗷呜——香喷喷的，谢谢{{user}}投喂～",
        useWhalePersona.getState().persona,
      ),
    );
  }, [feedPet, applyMood, bumpBond, flashPopoverReaction, triggerPortraitBounce]);

  /** 浮层内：Android 一键切换切后台自动驻留手机桌面 */
  const handleDesktopFollowFromPopover = useCallback(async () => {
    if (!desktopPetAvailable) return;
    tapHaptic();
    const status = await getDesktopPetStatus().catch(() => null);
    if (!status?.permission) {
      await requestDesktopPetPermission().catch(() => {});
      flashPopoverReaction("请先开启「显示在其他应用上层」，回来就能自动跟去手机桌面啦～");
      return;
    }
    const next = !autoFollow;
    setAutoFollow(next);
    if (next) {
      setOverlayMode("auto");
      await startDesktopPet(buildDesktopPetPayload(reducedMotion, true)).catch(() => {});
      await refreshDesktop().catch(() => {});
      flashPopoverReaction("好耶！切回手机桌面时我也会悄悄跟出来陪你啦～");
    } else {
      flashPopoverReaction("已关闭后台自动驻留桌面，只在应用内陪着你。");
    }
  }, [autoFollow, setAutoFollow, setOverlayMode, reducedMotion, refreshDesktop, flashPopoverReaction]);

  // 本地精确口令只作为「零延迟快捷通道」：其余任何说法都交给模型按语义识别
  const isSummonCmd = (text: string) => {
    const cmd = normalizeCmd(text);
    return cmd === normalizeCmd(whalePhrase) || SUMMON_ALIASES.includes(cmd);
  };
  const isDismissCmd = (text: string) =>
    DISMISS_ALIASES.includes(normalizeCmd(text));

  // 语音开关与桌宠共用同一份本地记忆，默认开着
  useEffect(() => {
    hydrateVoice();
  }, [hydrateVoice]);

  /** 大肥鱼开口：每条新的助手消息只读一次，静音或人格不在时默默跳过 */
  useEffect(() => {
    if (messages.length === 0) return;
    const last = messages[messages.length - 1];
    if (last.role !== "assistant" || last.id === spokenId.current) return;
    spokenId.current = last.id;
    // 刚进入页面时接回来的历史对话（或上次留下的最后一句）不朗读
    if (!last.timestamp || last.timestamp < openedAt.current) return;
    if (!whale || !voiceOn || !voiceScreenFocused) return;
    speakWhale(last.content);
  }, [messages, whale, voiceOn, voiceScreenFocused]);

  // 离开页面时让她闭嘴
  useEffect(() => {
    if (!voiceScreenFocused) stopWhaleVoice();
    return () => stopWhaleVoice();
  }, [voiceScreenFocused]);

  const localMsg = (content: string): ChatMessage => ({
    id: uid(),
    role: "assistant",
    content: renderPersonaText(content, useWhalePersona.getState().persona),
    timestamp: nowTs(),
  });

  const pushLocal = (content: string) => {
    setMessages((prev) => [...prev, localMsg(content)]);
  };

  /** 追加一条只显示表情包的消息 */
  const pushSticker = (id: WhaleStickerId) => {
    setMessages((prev) => [
      ...prev,
      {
        id: uid(),
        role: "assistant",
        content: "",
        sticker: id,
        timestamp: nowTs(),
      },
    ]);
  };

  const exitSelect = () => {
    setSelectMode(false);
    setSelectedIds([]);
  };

  /** 删掉勾中的消息（记忆里同一批也一起删掉） */
  const deleteSelected = () => {
    if (!selectedIds.length) return;
    bumpHaptic();
    removeMemoryMessages(selectedIds);
    exitSelect();
  };

  const rememberWhale = (on: boolean) => setWhale(on);

  /** 进入鲸鱼人格；message 为空时由模型返回的回复充当登场白 */
  const enterWhale = (message?: string) => {
    restoreMemory();
    setWhale(true);
    setSummonFx(true);
    thumpHaptic();
    Keyboard.dismiss();
    if (message) pushLocal(message);
  };

  /** 收回人格：先播退场动效，动画结束后再切回普通助手界面 */
  const leaveWhale = (message?: string) => {
    if (leaveFx) return;
    closeCompanionPopover();
    bumpHaptic();
    // 先只挂动效遮罩；切人格、追加告别消息都挪到遮罩最深的时候再做，
    // 否则一堆重渲染和动画首帧撞在一起，退场会明显卡一下
    setLeaveFx(true);
    if (leaveTimer.current) clearTimeout(leaveTimer.current);
    leaveTimer.current = setTimeout(() => {
      rememberWhale(false);
      if (message) pushLocal(message);
    }, 360);
  };

  /** 退场动效结束：真正收回鲸鱼人格，聊天记录先存进记忆下次接着聊 */
  const finishLeaveWhale = () => {
    setLeaveFx(false);
    // 遮罩撤掉的那一帧先别做任何重活，把收尾推到下一帧之后
    requestAnimationFrame(() => {
      setPopoverReaction(null);
      setPreview(null);
      setNotice(null);
      setInput("");
      spokenId.current = null;
      taps.current.count = 0;
      exitSelect();
      // 归档要序列化整段对话，再往后挪一点，别卡在动画收尾上
      settleTimer.current = setTimeout(() => archiveMemory(), 320);
    });
  };

  const summonWhale = () => {
    if (whale) {
      pushLocal("人家一直都在呀，{{user}} (￣▽￣) 说吧，今天想让鱼做什么？");
      return;
    }
    enterWhale(
      "（一团蓝色的影子从屏幕边游出来，尾巴轻轻拍了下你的手）\n{{user}}！你终于想起我啦 (๑•̀ㅂ•́)و✧ 课表我都有好好看着……大概。要不要让我算运势、夸夸你，或者报个白饭菜单？",
    );
  };

  const dismissWhale = () => {
    if (!whale) return;
    leaveWhale("呜……那我先变回正经的课表助手。{{user}}下次记得再叫我呀。");
  };

  /** 聊天框最上方的声音按钮：静音 / 开启鱼语（桌宠也一起静音） */
  const toggleVoice = () => {
    const next = !voiceOn;
    tapHaptic();
    toggleVoiceStore();
    if (next)
      speakWhale(
        renderPersonaText(
          "声音开好啦，{{user}}。",
          useWhalePersona.getState().persona,
        ),
      );
    else stopWhaleVoice();
  };

  useEffect(() => {
    const showEvt =
      Platform.OS === "ios" ? "keyboardWillShow" : "keyboardDidShow";
    const hideEvt =
      Platform.OS === "ios" ? "keyboardWillHide" : "keyboardDidHide";
    const s = Keyboard.addListener(showEvt, (e) =>
      setKbHeight(e.endCoordinates.height),
    );
    const h = Keyboard.addListener(hideEvt, () => setKbHeight(0));
    return () => {
      s.remove();
      h.remove();
    };
  }, []);

  const dateInfo = getDateInfo(schedule.startDate);

  const send = async (text: string) => {
    const content = text.trim();
    if (!content || pendingRequest.current) return;
    // 用户开口时先让鱼闭嘴，免得两边同时说话
    stopWhaleVoice();
    if (popoverOpen) closeCompanionPopover();

    // 精确口令走本地快捷通道（零延迟、不消耗额度）；其余说法交给模型按语义判断
    if (isSummonCmd(content)) {
      setInput("");
      summonWhale();
      return;
    }
    if (isDismissCmd(content)) {
      setInput("");
      dismissWhale();
      return;
    }

    // 想让她到屏幕边上陪着：本地直接叫出来，不用等模型（首次登场音效由 WhalePet 单点播放）
    if (whale && PET_WORDS.test(content)) {
      setInput("");
      showPet();
      pushLocal(
        "（尾巴一摆，从屏幕边探出头来）来啦来啦，我就挂在这儿陪你。拖我到哪儿都行，长按或点三下可以打开互动卡。",
      );
      pushSticker("happy");
      return;
    }

    if (!apiKey) {
      setNotice({
        type: "error",
        text: "你不喂我API Key我咋工作（凶巴巴）",
      });
      return;
    }

    const userMsg: ChatMessage = {
      id: uid(),
      role: "user",
      content,
      timestamp: nowTs(),
    };
    const controller = new AbortController();
    pendingRequest.current = controller;
    followLatest.current = true;
    setMessages((prev) => [...prev, userMsg]);
    setInput("");
    setBusy(true);
    setBusyStatus(null);
    setNotice(null);
    const memoryEpoch = useWhaleMemory.getState().epoch;

    try {
      const history = [...messages, userMsg].map((m) => ({
        id: m.id,
        role: m.role,
        content: m.content,
        sticker: m.sticker,
      }));
      const result: AssistantResult = await askAssistant(
        history,
        {
          schedule,
          weekIndex: dateInfo.weekIndex,
          schedules: schedules.map((s) => ({ id: s.id, name: s.name })),
          persona: whale ? "whale" : undefined,
        },
        apiKey,
        controller.signal,
        {
          onStatus: (status) => {
            if (!controller.signal.aborted && mountedRef.current) {
              setBusyStatus(status);
            }
          },
        },
      );
      if (controller.signal.aborted || useWhaleMemory.getState().epoch !== memoryEpoch) return;

      const scheduleActions = result.actions.filter(isScheduleAction);
      // 收回人格的那一句不执行任何用户专属操作
      const whaleActions =
        whale && result.intent !== "dismiss"
          ? result.actions.filter(isWhaleAction)
          : [];

      const botMsg: ChatMessage = {
        id: uid(),
        role: "assistant",
        content: result.reply,
        actions: scheduleActions.length ? scheduleActions : undefined,
        sources: result.sources?.length ? result.sources : undefined,
        timestamp: nowTs(),
      };
      // 文本与表情一起入库，下一轮立即可见，避免延迟补发串到下一轮。
      const stickerMsg: ChatMessage | undefined =
        whale && result.sticker && result.intent !== "dismiss"
          ? {
              id: uid(),
              role: "assistant",
              content: "",
              sticker: result.sticker,
              timestamp: nowTs(),
            }
          : undefined;
      setMessages((prev) => [
        ...prev,
        botMsg,
        ...(stickerMsg ? [stickerMsg] : []),
      ]);

      // 大肥鱼召唤 / 退出由模型按语义识别，模型回复本身就是登场白或告别白
      if (result.intent === "summon" && !whale) {
        enterWhale();
      } else if (result.intent === "dismiss" && whale) {
        leaveWhale();
      }

      // 用户权限自动执行：改口令 / 改背景 / 生图 / 联网
      if (whaleActions.length) {
        await runWhaleActions(whaleActions, content, controller.signal);
      }
    } catch (e) {
      if (controller.signal.aborted) return;
      setNotice({
        type: "error",
        text: e instanceof Error ? e.message : "助手调用失败，请重试",
      });
    } finally {
      if (pendingRequest.current === controller) {
        pendingRequest.current = null;
        setBusy(false);
        setBusyStatus(null);
      }
    }
  };

  /** 执行用户专属操作：改口令 / 改背景 / 生图 / 联网，全程自动 */
  async function runWhaleActions(
    actions: WhaleAction[],
    userText: string,
    signal: AbortSignal,
  ) {
    const memoryEpoch = useWhaleMemory.getState().epoch;
    for (const action of actions) {
      if (signal.aborted || useWhaleMemory.getState().epoch !== memoryEpoch) return;
      if (action.type === "set_summon_phrase") {
        const phrase = String(action.phrase ?? "")
          .replace(/[\s「」"“”'']/g, "")
          .slice(0, 12);
        if (phrase.length < 2) {
          setMessages((prev) => [
            ...prev,
            localMsg("这个口令太短啦，换一个 2-12 个字的吧，{{user}}。"),
          ]);
          continue;
        }
        setWhalePhrase(phrase);
        setMessages((prev) => [
          ...prev,
          localMsg(`（尾巴晃了晃）记住啦：以后喊「${phrase}」，我就游出来。`),
        ]);
      } else if (action.type === "set_background") {
        const tint = resolveTint(action.tint);
        setBackgroundTint(tint);
        if (action.effect === "aurora" || action.effect === "plain") {
          setBackgroundEffect(action.effect);
        }
        setMessages((prev) => [
          ...prev,
          localMsg(
            `（把背景调成了「${BACKGROUND_PRESETS[tint].label}」）{{user}}看看，喜不喜欢？`,
          ),
        ]);
      } else if (action.type === "generate_image") {
        const uri = buildImageUrl(String(action.prompt ?? ""), action.size);
        setMessages((prev) => [
          ...prev,
          {
            ...localMsg("画好啦，{{user}}收好。"),
            imageUri: uri,
            imageAspect: imageAspect(action.size),
          },
        ]);
      } else if (action.type === "web_search") {
        const query = String(action.query ?? "").trim();
        if (!query) continue;
        try {
          setBusyStatus(`正在联网检索「${query.slice(0, 18)}」…`);
          const hits = await searchWeb(query, signal, apiKey);
          if (!hits.length) throw new Error("没有结果");
          const answer = await answerFromSearch(userText, hits, apiKey, signal);
          if (signal.aborted || useWhaleMemory.getState().epoch !== memoryEpoch) return;
          const unique = Array.from(
            new Map(hits.map((h) => [h.url, h])).values(),
          ).slice(0, 3);
          setMessages((prev) => [
            ...prev,
            {
              ...localMsg(answer),
              sources: unique.map((h) => ({ title: h.title, url: h.url })),
            },
          ]);
        } catch {
          if (signal.aborted || useWhaleMemory.getState().epoch !== memoryEpoch) return;
          setMessages((prev) => [
            ...prev,
            localMsg(
              `呜，网线被海浪打断了……「${query}」没查到，{{user}}等会儿再让我试试？`,
            ),
          ]);
        }
      } else if (action.type === "summon_pet") {
        // 首次召唤音效由 WhalePetLayer 挂载单点播放，避免双倍重叠
        showPet();
        setMessages((prev) => [
          ...prev,
          localMsg(
            "（从屏幕中间蹦出来）我出来啦，就挂在旁边陪你，拖我、戳我都行，点三下或长按展开互动卡。",
          ),
        ]);
      } else if (action.type === "dismiss_pet") {
        if (useWhalePet.getState().visible) {
          playSfx("whale_pet_dismiss", { volume: 0.62 });
        }
        hidePet();
        setMessages((prev) => [
          ...prev,
          localMsg(
            "（尾巴一摆，乖乖缩回水里）那我先回去啦，{{user}}想我就再叫一声。",
          ),
        ]);
      } else if (action.type === "forget_memory") {
        clearMemory();
        exitSelect();
        setMessages(() => [
          localMsg(
            "（歪了歪头）好，之前聊的我都不记得啦……{{user}}，我们重新认识一下？",
          ),
        ]);
      }
    }
    requestAnimationFrame(
      () =>
        followLatest.current &&
        scrollRef.current?.scrollToOffset({ offset: 0, animated: true }),
    );
  }

  const [scheduleChange, setScheduleChange] = useState<{
    preview: ScheduleActionPreview;
    actions: ScheduleAction[];
  } | null>(null);
  const applyActions = useCallback(
    (actions: ScheduleAction[]) => {
      setScheduleChange({
        preview: previewScheduleActions(actions, schedule),
        actions,
      });
    },
    [schedule, setScheduleChange],
  );

  /* ---- Reanimated 样式（头像触控、呼吸光环、浮层遮罩与从右上角绽放的交互卡片） ---- */
  const avatarPressStyle = useAnimatedStyle(() => ({
    transform: [{ scale: avatarBtnScale.value }],
  }));

  const haloStyle = useAnimatedStyle(() => ({
    opacity: 0.34 + haloPulse.value * 0.42,
    transform: [{ scale: 1 + haloPulse.value * 0.08 }],
  }));

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

  const popoverWidth = Math.min(width - 28, 330);
  const defaultPopoverLine = useMemo(() => {
    if (emotion.reason) {
      return renderPersonaText(
        `刚刚${emotion.reason}，现在感觉${emotionDesc.label}～`,
        persona,
      );
    }
    if (petVisible) {
      return renderPersonaText(
        `我正挂在屏幕边陪着{{user}}呢，随时可以戳我或收回水里哦～`,
        persona,
      );
    }
    return renderPersonaText(
      `{{user}}点开我看啦～想摸摸头、投喂白饭，还是叫我出来当桌宠呀？`,
      persona,
    );
  }, [emotion.reason, emotionDesc.label, petVisible, persona]);

  return (
    <View className="flex-1">
      <Backdrop>
        {/* 仅在页面稳定后的人格切换时执行交叉淡入淡出，避免首次进场叠加整页 saveLayerAlpha 与扩散动画抢帧 */}
        <Animated.View
          key={whale ? "whale" : "normal"}
          entering={mountSettled && !reducedMotion ? FadeIn.duration(260) : undefined}
          exiting={mountSettled && !reducedMotion ? FadeOut.duration(220) : undefined}
          className="flex-1"
          style={{ paddingBottom: kbHeight }}
        >
          {/* 悬浮液态玻璃顶栏 */}
          <View style={{ paddingHorizontal: 14, paddingTop: 4, paddingBottom: 6, zIndex: 25 }}>
            <GlassContainer
                radius={26}
                variant="floating"
                borderOpacity={0.24}
                highlight
                style={{
                  paddingHorizontal: 10,
                  paddingVertical: 8,
                }}
              >
                <View style={{ flexDirection: "row", alignItems: "center" }}>
                  <TactilePressable
                    onPress={() => router.back()}
                    hitSlop={8}
                    accessibilityRole="button"
                    accessibilityLabel="返回"
                    pressedOpacity={0.72}
                    style={{
                      width: 36,
                      height: 36,
                      borderRadius: 18,
                      marginRight: 10,
                      alignItems: "center",
                      justifyContent: "center",
                      backgroundColor: isDark
                        ? "rgba(255,255,255,0.08)"
                        : "rgba(255,255,255,0.62)",
                      borderWidth: 0.75,
                      borderColor: isDark
                        ? "rgba(255,255,255,0.12)"
                        : "rgba(148,163,184,0.25)",
                    }}
                  >
                    <Ionicons
                      name="chevron-back"
                      size={18}
                      color={isDark ? "#E2E8F0" : "#334155"}
                    />
                  </TactilePressable>

                  <View style={{ flex: 1, minWidth: 0 }}>
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                      <Text
                        numberOfLines={1}
                        style={{
                          fontSize: 18.5,
                          fontWeight: "800",
                          letterSpacing: -0.2,
                          color: isDark ? "#F8FAFC" : "#0F172A",
                        }}
                      >
                        {whale ? personaName : "课程表助手"}
                      </Text>
                      {whale ? (
                        <View
                          style={{
                            flexDirection: "row",
                            alignItems: "center",
                            gap: 4,
                            borderRadius: 999,
                            paddingHorizontal: 7.5,
                            paddingVertical: 2.5,
                            backgroundColor: isDark
                              ? "rgba(56,189,248,0.16)"
                              : "rgba(14,165,233,0.12)",
                            borderWidth: 0.75,
                            borderColor: isDark
                              ? "rgba(125,211,252,0.34)"
                              : "rgba(14,165,233,0.28)",
                          }}
                        >
                          <View
                            style={{
                              width: 6,
                              height: 6,
                              borderRadius: 3,
                              backgroundColor: emotionDesc.color,
                            }}
                          />
                          <Text
                            style={{
                              fontSize: 9.5,
                              fontWeight: "700",
                              color: isDark ? "#BAE6FD" : "#0369A1",
                            }}
                          >
                            {emotionDesc.label}
                          </Text>
                        </View>
                      ) : null}
                    </View>
                    <Text
                      numberOfLines={1}
                      style={{
                        marginTop: 2,
                        fontSize: 10.5,
                        color: isDark
                          ? "rgba(186,214,242,0.72)"
                          : "rgba(71,85,105,0.82)",
                      }}
                    >
                      {whale
                        ? `Lv.${bondStage.level} ${bondStage.title} · ${persona.userName}专属陪伴`
                        : "自然语言调课 · 智能查询与课表管理"}
                    </Text>
                  </View>

                  {/* 右侧控制组：语音 + 人设设置 + 可展开互动浮层的大肥鱼头像 */}
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 6, flexShrink: 0 }}>
                    {whale ? (
                      <>
                        <TactilePressable
                          onPress={toggleVoice}
                          hitSlop={8}
                          accessibilityRole="button"
                          accessibilityLabel={voiceOn ? "关闭鱼语" : "开启鱼语"}
                          pressedOpacity={0.72}
                          style={{
                            width: 34,
                            height: 34,
                            borderRadius: 17,
                            alignItems: "center",
                            justifyContent: "center",
                            backgroundColor: voiceOn
                              ? isDark
                                ? "rgba(56,189,248,0.22)"
                                : "rgba(14,165,233,0.14)"
                              : isDark
                                ? "rgba(255,255,255,0.07)"
                                : "rgba(255,255,255,0.52)",
                            borderWidth: 0.75,
                            borderColor: voiceOn
                              ? isDark
                                ? "rgba(125,211,252,0.36)"
                                : "rgba(14,165,233,0.30)"
                              : isDark
                                ? "rgba(255,255,255,0.1)"
                                : "rgba(148,163,184,0.24)",
                          }}
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
                          onPress={() => {
                            if (popoverOpen) closeCompanionPopover();
                            router.push("/whale-settings");
                          }}
                          hitSlop={6}
                          pressedOpacity={0.72}
                          style={{
                            width: 34,
                            height: 34,
                            borderRadius: 17,
                            alignItems: "center",
                            justifyContent: "center",
                            backgroundColor: isDark
                              ? "rgba(255,255,255,0.07)"
                              : "rgba(255,255,255,0.52)",
                            borderWidth: 0.75,
                            borderColor: isDark
                              ? "rgba(255,255,255,0.1)"
                              : "rgba(148,163,184,0.24)",
                          }}
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
                    <Animated.View style={[{ position: "relative" }, avatarPressStyle]}>
                      {whale ? (
                        <Animated.View
                          pointerEvents="none"
                          style={[
                            {
                              position: "absolute",
                              inset: -3,
                              borderRadius: 20,
                              borderWidth: 1.5,
                              borderColor: popoverOpen ? "#38BDF8" : emotionDesc.color,
                            },
                            haloStyle,
                          ]}
                        />
                      ) : null}

                      <Pressable
                        onPress={whale ? onTopRightAvatarPress : undefined}
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
                        style={{
                          width: 46,
                          height: 46,
                          borderRadius: 17,
                          borderCurve: "continuous",
                          alignItems: "center",
                          justifyContent: "center",
                          overflow: "hidden",
                          backgroundColor: whale
                            ? isDark
                              ? "rgba(56,189,248,0.22)"
                              : "rgba(224,242,254,0.92)"
                            : isDark
                              ? "rgba(56,189,248,0.18)"
                              : "rgba(224,242,254,0.75)",
                          borderWidth: 1,
                          borderColor: popoverOpen
                            ? "#38BDF8"
                            : isDark
                              ? "rgba(186,230,253,0.34)"
                              : "rgba(125,211,252,0.65)",
                        }}
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
                          style={{
                            position: "absolute",
                            right: -2,
                            bottom: -2,
                            width: 16,
                            height: 16,
                            borderRadius: 8,
                            alignItems: "center",
                            justifyContent: "center",
                            backgroundColor: petVisible
                              ? "#10B981"
                              : isDark
                                ? "#0F2942"
                                : "#FFFFFF",
                            borderWidth: 1.5,
                            borderColor: isDark ? "#1E293B" : "#E0F2FE",
                          }}
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

          {/* 消息区：鲸鱼模式下在扩散动画落幕后再挂载柔光漂浮贴图，保证进场 120fps 零卡顿 */}
          <View className="flex-1">
            {whale && mountSettled ? <WhaleDeco active /> : null}

            {selectMode ? (
              <Animated.View
                entering={FadeInDown.duration(180)}
                style={{ paddingHorizontal: 16, marginBottom: 6 }}
              >
                <GlassContainer
                  radius={18}
                  variant="floating"
                  borderOpacity={0.22}
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    justifyContent: "space-between",
                    paddingHorizontal: 14,
                    paddingVertical: 8,
                  }}
                >
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                    <Ionicons name="checkmark-done-circle" size={16} color="#38BDF8" />
                    <Text
                      style={{
                        fontSize: 12,
                        fontWeight: "700",
                        color: isDark ? "#E2E8F0" : "#1E293B",
                      }}
                    >
                      已选 {selectedIds.length} 条消息
                    </Text>
                  </View>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
                    <Pressable
                      onPress={deleteSelected}
                      hitSlop={8}
                      style={{
                        borderRadius: 999,
                        paddingHorizontal: 11,
                        paddingVertical: 4,
                        backgroundColor: "rgba(244,63,94,0.16)",
                        borderWidth: 0.75,
                        borderColor: "rgba(251,113,133,0.4)",
                      }}
                    >
                      <Text
                        style={{
                          fontSize: 11,
                          fontWeight: "700",
                          color: isDark ? "#FDA4AF" : "#E11D48",
                        }}
                      >
                        删除
                      </Text>
                    </Pressable>
                    <Pressable onPress={exitSelect} hitSlop={8}>
                      <Text
                        style={{
                          fontSize: 11.5,
                          fontWeight: "600",
                          color: isDark ? "#94A3B8" : "#64748B",
                        }}
                      >
                        取消
                      </Text>
                    </Pressable>
                  </View>
                </GlassContainer>
              </Animated.View>
            ) : null}

            {displayMessages.length === 0 ? (
              <ScrollView
                className="flex-1"
                style={{ paddingHorizontal: 16 }}
                contentContainerStyle={{
                  flexGrow: 1,
                  justifyContent: kbHeight > 0 ? "flex-start" : "center",
                  paddingTop: 10,
                  paddingBottom: 18,
                }}
                overScrollMode="never"
                keyboardShouldPersistTaps="handled"
                showsVerticalScrollIndicator={false}
              >
                {!whale ? (
                  <AssistantEmptyState
                    isDark={isDark}
                    compact={kbHeight > 0}
                    reducedMotion={Boolean(reducedMotion)}
                    onPick={(text) => void send(text)}
                  />
                ) : (
                <Animated.View
                  entering={reducedMotion ? undefined : FadeInDown.springify().damping(20)}
                >
                  <GlassContainer
                    radius={28}
                    variant="surface"
                    borderOpacity={0.24}
                    highlight
                  >
                    <View style={{ alignItems: "center", paddingHorizontal: 18, paddingTop: 22, paddingBottom: 20 }}>
                      <View
                        style={{
                          width: whale ? 92 : 64,
                          height: whale ? 92 : 64,
                          borderRadius: whale ? 30 : 22,
                          borderCurve: "continuous",
                          alignItems: "center",
                          justifyContent: "center",
                          overflow: "hidden",
                          backgroundColor: isDark
                            ? "rgba(56,189,248,0.18)"
                            : "rgba(224,242,254,0.85)",
                          borderWidth: 1.5,
                          borderColor: whale
                            ? isDark
                              ? "rgba(186,230,253,0.34)"
                              : "rgba(125,211,252,0.68)"
                            : isDark
                              ? "rgba(255,255,255,0.18)"
                              : "rgba(125,211,252,0.5)",
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
                        {whale ? (
                          <WhaleAvatar size={84} />
                        ) : (
                          <Ionicons name="chatbubble-ellipses" size={26} color="#38BDF8" />
                        )}
                      </View>

                      <Text
                        style={{
                          marginTop: 12,
                          fontSize: 16.5,
                          fontWeight: "800",
                          color: isDark ? "#F1F5F9" : "#0F172A",
                        }}
                      >
                        {whale ? `${personaName}上线啦` : "试试对我说"}
                      </Text>

                      {whale ? (
                        <>
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
                                  backgroundColor: emotionDesc.color,
                                }}
                              />
                              <Text
                                style={{
                                  fontSize: 10,
                                  fontWeight: "700",
                                  color: isDark ? "#BAE6FD" : "#0369A1",
                                }}
                              >
                                此刻 · {emotionDesc.label}
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
                                Lv.{bondStage.level} {bondStage.title}
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
                                onPress={() => void send(card.prompt)}
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
                        </>
                      ) : null}
                    </View>
                  </GlassContainer>
                </Animated.View>
                )}

                {busy ? (
                  <View style={{ marginTop: 12 }}>
                    <WhaleTypingBubble
                      whale={whale}
                      personaName={personaName}
                      isDark={isDark}
                      statusText={busyStatus}
                    />
                  </View>
                ) : null}
                {notice ? (
                  <Animated.View
                    entering={FadeInDown.duration(180)}
                    style={{ marginTop: 10 }}
                  >
                    <View
                      style={{
                        flexDirection: "row",
                        alignItems: "center",
                        gap: 8,
                        borderRadius: 16,
                        borderCurve: "continuous",
                        borderWidth: 1,
                        paddingHorizontal: 13,
                        paddingVertical: 10,
                        borderColor:
                          notice.type === "error"
                            ? isDark
                              ? "rgba(251,113,133,0.34)"
                              : "rgba(244,63,94,0.32)"
                            : isDark
                              ? "rgba(52,211,153,0.34)"
                              : "rgba(16,185,129,0.32)",
                        backgroundColor:
                          notice.type === "error"
                            ? isDark
                              ? "rgba(244,63,94,0.16)"
                              : "rgba(255,241,242,0.88)"
                            : isDark
                              ? "rgba(16,185,129,0.16)"
                              : "rgba(236,253,245,0.88)",
                      }}
                    >
                      <Ionicons
                        name={
                          notice.type === "error"
                            ? "alert-circle-outline"
                            : "checkmark-circle-outline"
                        }
                        size={16}
                        color={
                          notice.type === "error"
                            ? isDark
                              ? "#FDA4AF"
                              : "#E11D48"
                            : isDark
                              ? "#6EE7B7"
                              : "#059669"
                        }
                      />
                      <Text
                        style={{
                          flex: 1,
                          fontSize: 11.5,
                          lineHeight: 17,
                          color:
                            notice.type === "error"
                              ? isDark
                                ? "#FFE4E6"
                                : "#9F1239"
                              : isDark
                                ? "#D1FAE5"
                                : "#065F46",
                        }}
                      >
                        {notice.text}
                      </Text>
                    </View>
                  </Animated.View>
                ) : null}
              </ScrollView>
            ) : (
              <FlatList
                ref={scrollRef}
                data={displayMessages}
                inverted
                keyExtractor={messageKey}
                className="flex-1"
                style={{ paddingHorizontal: 16 }}
                contentContainerStyle={{ paddingTop: 12, paddingBottom: 18 }}
                initialNumToRender={5}
                maxToRenderPerBatch={4}
                windowSize={5}
                removeClippedSubviews={false}
                overScrollMode="never"
                keyboardShouldPersistTaps="handled"
                showsVerticalScrollIndicator={false}
                onScroll={(event) => {
                  followLatest.current = event.nativeEvent.contentOffset.y < 100;
                }}
                scrollEventThrottle={100}
                onContentSizeChange={() => {
                  if (followLatest.current) {
                    scrollRef.current?.scrollToOffset({ offset: 0, animated: false });
                  }
                }}
                renderItem={({ item }) => (
                  <View style={{ marginBottom: 14 }}>
                    {whale ? (
                      <WhaleChatBubble
                        message={item}
                        isDark={isDark}
                        selectMode={selectMode}
                        checked={selectedIds.includes(item.id)}
                        onSelect={onSelectMessage}
                        onPreview={setPreview}
                        onApply={applyActions}
                      />
                    ) : (
                      <AssistantMessage
                        message={item}
                        whale={false}
                        selectMode={selectMode}
                        checked={selectedIds.includes(item.id)}
                        onSelect={onSelectMessage}
                        onPreview={setPreview}
                        onApply={applyActions}
                      />
                    )}
                  </View>
                )}
                ListHeaderComponent={
                  <View>
                    {busy ? (
                      <WhaleTypingBubble
                        whale={whale}
                        personaName={personaName}
                        isDark={isDark}
                        statusText={busyStatus}
                      />
                    ) : null}
                    {notice ? (
                      <Animated.View
                        entering={FadeInDown.duration(180)}
                        style={{ marginTop: 8, marginBottom: 4 }}
                      >
                        <View
                          style={{
                            flexDirection: "row",
                            alignItems: "center",
                            gap: 8,
                            borderRadius: 16,
                            borderCurve: "continuous",
                            borderWidth: 1,
                            paddingHorizontal: 13,
                            paddingVertical: 10,
                            borderColor:
                              notice.type === "error"
                                ? isDark
                                  ? "rgba(251,113,133,0.34)"
                                  : "rgba(244,63,94,0.32)"
                                : isDark
                                  ? "rgba(52,211,153,0.34)"
                                  : "rgba(16,185,129,0.32)",
                            backgroundColor:
                              notice.type === "error"
                                ? isDark
                                  ? "rgba(244,63,94,0.16)"
                                  : "rgba(255,241,242,0.88)"
                                : isDark
                                  ? "rgba(16,185,129,0.16)"
                                  : "rgba(236,253,245,0.88)",
                          }}
                        >
                          <Ionicons
                            name={
                              notice.type === "error"
                                ? "alert-circle-outline"
                                : "checkmark-circle-outline"
                            }
                            size={16}
                            color={
                              notice.type === "error"
                                ? isDark
                                  ? "#FDA4AF"
                                  : "#E11D48"
                                : isDark
                                  ? "#6EE7B7"
                                  : "#059669"
                            }
                          />
                          <Text
                            style={{
                              flex: 1,
                              fontSize: 11.5,
                              lineHeight: 17,
                              color:
                                notice.type === "error"
                                  ? isDark
                                    ? "#FFE4E6"
                                    : "#9F1239"
                                  : isDark
                                    ? "#D1FAE5"
                                    : "#065F46",
                            }}
                          >
                            {notice.text}
                          </Text>
                        </View>
                      </Animated.View>
                    ) : null}
                  </View>
                }
              />
            )}
          </View>

          {/* 用户专属：大肥鱼图标化液态玻璃快捷胶囊条 */}
          {whale ? (
            <View style={{ paddingBottom: 4 }}>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={{ paddingHorizontal: 16, gap: 7 }}
              >
                {WHALE_QUICK_ITEMS.map((item) => (
                  <WhaleQuickPill
                    key={item.label}
                    item={item}
                    isDark={isDark}
                    disabled={busy}
                    onPress={() => void send(item.prompt)}
                  />
                ))}
              </ScrollView>
            </View>
          ) : null}

          {/* 液态玻璃浮动输入胶囊 */}
          <ChatInputBar
            value={input}
            onChangeText={setInput}
            onSend={() => void send(input)}
            busy={busy}
            onStop={stopRequest}
            whaleTheme={whale}
            placeholder={
              whale
                ? renderPersonaText("跟{{char}}说点什么吧，{{user}}…", persona)
                : undefined
            }
            bottomInset={kbHeight > 0 ? 10 : undefined}
          />
        </Animated.View>

        {/* ================================================================= */}
        {/*  右上角大肥鱼灵动玻璃态互动浮层与召唤桌宠卡片（位于 Backdrop 内享原生液态玻璃折射） */}
        {/* ================================================================= */}
        {whale && popoverMounted ? (
          <View
            pointerEvents="box-none"
            style={[StyleSheet.absoluteFill, { zIndex: 40 }]}
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
                onPress={() => closeCompanionPopover()}
                accessibilityRole="button"
                accessibilityLabel="关闭互动浮层"
              />
            </Animated.View>

            {/* 从右上角头像自然绽放的玻璃态互动浮层 */}
            <Animated.View
              style={[
                {
                  position: "absolute",
                  top: 72,
                  right: 14,
                  width: popoverWidth,
                  zIndex: 42,
                },
                popoverCardStyle,
              ]}
            >
              {/* 与右上角头像衔接的外置裁剪光滴指针（严格位于卡片边沿外侧，零半透明叠加穿帮） */}
              <View
                pointerEvents="none"
                style={{
                  position: "absolute",
                  top: -8,
                  right: 22,
                  width: 20,
                  height: 8,
                  overflow: "hidden",
                }}
              >
                <View
                  style={{
                    position: "absolute",
                    left: 4,
                    top: 3,
                    width: 12,
                    height: 12,
                    borderRadius: 2.5,
                    transform: [{ rotate: "45deg" }],
                    backgroundColor: isDark
                      ? "rgba(22,38,66,0.92)"
                      : "rgba(246,251,255,0.95)",
                    borderTopWidth: 1,
                    borderLeftWidth: 1,
                    borderColor: isDark
                      ? "rgba(186,230,253,0.28)"
                      : "rgba(125,211,252,0.55)",
                  }}
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
                      onPress={onPokeInPopover}
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
                        borderColor: emotionDesc.color,
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
                          Lv.{bondStage.level} {bondStage.title}
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
                          backgroundColor: emotionDesc.color,
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
                        {emotionDesc.label}
                      </Text>
                      <Text
                        numberOfLines={1}
                        style={{
                          fontSize: 10,
                          color: isDark ? "#94A3B8" : "#64748B",
                        }}
                      >
                        · 相伴 {bond.daysActive} 天
                      </Text>
                    </View>
                  </View>

                  <TactilePressable
                    onPress={() => closeCompanionPopover()}
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
                  key={popoverReaction ?? "default-line"}
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
                    {popoverReaction ?? defaultPopoverLine}
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
                      onPress={handleTogglePetFromPopover}
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
                      onPress={() => void handleDesktopFollowFromPopover()}
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
                        updateWhaleAgent({
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
                        updateWhaleAgent({ thinkingMode: next });
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
                    onPress={handlePatFromPopover}
                  />
                  <PopoverQuickAction
                    icon="restaurant-outline"
                    label="喂白饭"
                    accent="#FBBF24"
                    isDark={isDark}
                    onPress={handleFeedFromPopover}
                  />
                  <PopoverQuickAction
                    icon="options-outline"
                    label="Agent 设置"
                    accent="#38BDF8"
                    isDark={isDark}
                    onPress={() => {
                      closeCompanionPopover();
                      router.push("/whale-settings");
                    }}
                  />
                </View>
              </GlassContainer>
            </Animated.View>
          </View>
        ) : null}
      </Backdrop>

      {/* 召唤动效：闪亮登场 + 施法变身 */}
      {summonFx ? <WhaleSummonFX onDone={() => setSummonFx(false)} /> : null}

      {/* 退场动效：摆尾钻回水里，结束后收回鲸鱼人格 */}
      {leaveFx ? <WhaleLeaveFX onDone={finishLeaveWhale} /> : null}

      {scheduleChange ? (
        <ScheduleChangeDialog
          preview={scheduleChange.preview}
          onClose={() => setScheduleChange(null)}
          onApplied={() => {
            successHaptic();
            setMessages((previous) =>
              previous.map((message) =>
                message.actions === scheduleChange.actions
                  ? { ...message, actions: undefined }
                  : message,
              ),
            );
          }}
        />
      ) : null}

      {/* 生成图全屏预览 */}
      <Modal
        visible={!!preview}
        transparent
        animationType="fade"
        statusBarTranslucent
        onRequestClose={() => setPreview(null)}
      >
        <Pressable
          style={{
            flex: 1,
            alignItems: "center",
            justifyContent: "center",
            backgroundColor: "rgba(4,10,22,0.92)",
            paddingHorizontal: 18,
          }}
          onPress={() => setPreview(null)}
        >
          <Pressable
            onPress={() => setPreview(null)}
            hitSlop={10}
            style={{
              position: "absolute",
              top: 52,
              right: 20,
              width: 38,
              height: 38,
              borderRadius: 19,
              alignItems: "center",
              justifyContent: "center",
              backgroundColor: "rgba(255,255,255,0.14)",
              borderWidth: 1,
              borderColor: "rgba(255,255,255,0.22)",
            }}
          >
            <Ionicons name="close" size={20} color="#F8FAFC" />
          </Pressable>
          {preview ? (
            <Image
              source={{ uri: preview }}
              style={{ width: "100%", height: "74%", borderRadius: 20 }}
              resizeMode="contain"
            />
          ) : null}
          <Text style={{ marginTop: 16, fontSize: 11.5, color: "rgba(226,232,240,0.68)" }}>
            轻点任意空白处关闭预览
          </Text>
        </Pressable>
      </Modal>
    </View>
  );
}
