import Ionicons from "@expo/vector-icons/Ionicons";
import { LinearGradient } from "expo-linear-gradient";
import { memo, useCallback, useEffect, useMemo, useState } from "react";
import {
  Keyboard,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
  type PressableProps,
  type StyleProp,
  type ViewStyle,
} from "react-native";
import Animated, { useAnimatedStyle, type SharedValue } from "react-native-reanimated";

import { ChatImage } from "@/components/ChatImage";
import { ChatInputBar } from "@/components/ChatInputBar";
import { ChatMessageList } from "@/components/ChatMessageList";
import { ScheduleChangeDialog } from "@/components/ScheduleChangeDialog";
import { WhaleAvatar } from "@/components/WhaleAvatar";
import type { GlassOpticalProfile } from "@/constants/glassThemes";
import { previewScheduleActions, type ScheduleActionPreview } from "@/services/assistantSchedule";
import { desktopPetAvailable } from "@/services/desktopPet";
import { speakWhale, stopWhaleVoice } from "@/services/whaleVoice";
import { useDesktopPet } from "@/store/useDesktopPet";
import { useActiveSchedule } from "@/store/useStore";
import { useWhaleMemory } from "@/store/useWhaleMemory";
import { useWhalePersona } from "@/store/useWhalePersona";
import type { WhaleCare } from "@/store/useWhalePet";
import { useWhaleVoice } from "@/store/useWhaleVoice";
import type { ChatMessage } from "@/types";
import { successHaptic, tapHaptic } from "@/utils/haptics";
import { describeWhaleEmotion } from "@/utils/whaleEmotion";
import { renderPersonaText } from "@/utils/whalePersona";

import {
  PET_QUICK_ACTIONS,
  POPOVER_CHROME_H,
  clampNumber,
  parsePetBubbleText,
  tintHex,
  whalePetStyles as styles,
  type PanelAnchor,
  type PetQuickActionDef,
} from "./whalePetHelpers";

const QUICK_ACTION_ROWS: readonly (readonly PetQuickActionDef[])[] = [
  PET_QUICK_ACTIONS.slice(0, 3),
  PET_QUICK_ACTIONS.slice(3, 6),
];

interface PetTactilePressableProps
  extends Omit<PressableProps, "style" | "children"> {
  style?: StyleProp<ViewStyle>;
  pressedOpacity?: number;
  pressedScale?: number;
  children?: React.ReactNode;
}

/** 静态数组 style 按压封装，彻底规避 NativeWind v4 + RN 0.88 丢弃函数式 style */
function PetTactilePressable({
  style,
  pressedOpacity = 0.76,
  pressedScale = 1,
  disabled,
  onPressIn,
  onPressOut,
  children,
  ...rest
}: PetTactilePressableProps) {
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
              ...(pressedScale !== 1 ? { transform: [{ scale: pressedScale }] } : {}),
            }
          : null,
      ]}
    >
      {children}
    </Pressable>
  );
}

function CareBar({
  label,
  value,
  color,
  icon,
  isDark,
  highlight = false,
  onPress,
  accessibilityLabel,
}: {
  label: string;
  value: number;
  color: string;
  icon: keyof typeof Ionicons.glyphMap;
  isDark: boolean;
  highlight?: boolean;
  onPress: () => void;
  accessibilityLabel: string;
}) {
  const rounded = Math.round(clampNumber(value, 0, 100));
  const isZero = rounded <= 0;

  return (
    <PetTactilePressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      pressedOpacity={0.78}
      pressedScale={0.97}
      style={[
        styles.careCard,
        {
          backgroundColor: highlight
            ? isDark
              ? "rgba(245,158,11,0.18)"
              : "rgba(254,243,199,0.80)"
            : isZero
              ? isDark
                ? tintHex(color, 0.11)
                : tintHex(color, 0.08)
              : isDark
                ? "rgba(255,255,255,0.06)"
                : "rgba(255,255,255,0.88)",
          borderColor: highlight
            ? isDark
              ? "rgba(251,191,36,0.58)"
              : "rgba(245,158,11,0.54)"
            : isZero
              ? isDark
                ? tintHex(color, 0.36)
                : tintHex(color, 0.4)
              : isDark
                ? "rgba(186,230,253,0.16)"
                : "rgba(148,163,184,0.24)",
        },
      ]}
    >
      <View style={styles.careCardHeader}>
        <View style={styles.careLabelGroup}>
          <Ionicons
            name={icon}
            size={10.5}
            color={highlight ? (isDark ? "#FBBF24" : "#D97706") : color}
          />
          <Text
            numberOfLines={1}
            style={[
              styles.careLabel,
              {
                color: highlight
                  ? isDark
                    ? "#FDE68A"
                    : "#92400E"
                  : isDark
                    ? "rgba(186,230,253,0.84)"
                    : "#475569",
              },
            ]}
          >
            {label}
          </Text>
        </View>
        <Text
          style={[
            styles.careValue,
            {
              color: highlight
                ? isDark
                  ? "#FDE68A"
                  : "#B45309"
                : isZero
                  ? isDark
                    ? "rgba(226,232,240,0.78)"
                    : "#64748B"
                  : isDark
                    ? "#F1F5F9"
                    : "#0F172A",
            },
          ]}
        >
          {rounded}
        </Text>
      </View>
      <View
        style={[
          styles.careTrack,
          {
            backgroundColor: highlight
              ? isDark
                ? "rgba(251,191,36,0.22)"
                : "rgba(245,158,11,0.20)"
              : isZero
                ? isDark
                  ? tintHex(color, 0.16)
                  : tintHex(color, 0.14)
                : isDark
                  ? "rgba(255,255,255,0.11)"
                  : "rgba(148,163,184,0.22)",
          },
        ]}
      >
        <View
          style={[
            styles.careFill,
            isZero
              ? { width: 8, backgroundColor: color, opacity: 0.52 }
              : { width: `${clampNumber(value, 6, 100)}%`, backgroundColor: color },
          ]}
        />
      </View>
    </PetTactilePressable>
  );
}

/** 桌宠浮层专属高对比度气泡：解决白底白框问题，并优雅清洗历史括号前缀 */
const WhalePetBubble = memo(function WhalePetBubble({
  message: m,
  isDark,
  onApply,
}: {
  message: ChatMessage;
  isDark: boolean;
  onApply: (id: string) => void;
}) {
  const isUser = m.role === "user";
  const parsed = useMemo(
    () => (isUser ? { stageNote: null, body: m.content } : parsePetBubbleText(m.content)),
    [isUser, m.content],
  );

  return (
    <View style={{ alignItems: isUser ? "flex-end" : "flex-start" }}>
      {m.imageUri ? (
        <View
          style={{
            marginBottom: 6,
            borderRadius: 14,
            overflow: "hidden",
            borderWidth: 1,
            borderColor: isDark
              ? "rgba(186,230,253,0.24)"
              : "rgba(56,189,248,0.45)",
          }}
        >
          <ChatImage uri={m.imageUri} aspectRatio={m.imageAspect} />
        </View>
      ) : null}

      <View
        style={{
          maxWidth: "88%",
          borderRadius: 16,
          borderCurve: "continuous",
          borderBottomRightRadius: isUser ? 5 : 16,
          borderBottomLeftRadius: isUser ? 16 : 5,
          paddingHorizontal: 12,
          paddingVertical: 8.5,
          overflow: "hidden",
          backgroundColor: isUser
            ? "#0EA5E9"
            : isDark
              ? "rgba(28,50,82,0.92)"
              : "#FFFFFF",
          borderWidth: 1,
          borderColor: isUser
            ? "rgba(255,255,255,0.28)"
            : isDark
              ? "rgba(125,211,252,0.28)"
              : "rgba(56,189,248,0.46)",
          boxShadow: [
            {
              offsetX: 0,
              offsetY: 2,
              blurRadius: 7,
              color: isUser
                ? "rgba(14,165,233,0.26)"
                : isDark
                  ? "rgba(2,8,20,0.34)"
                  : "rgba(15,41,66,0.09)",
            },
          ],
        }}
      >
        {isUser ? (
          <LinearGradient
            pointerEvents="none"
            colors={isDark ? ["#0284C7", "#3B82F6"] : ["#0EA5E9", "#2563EB"]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={StyleSheet.absoluteFill}
          />
        ) : null}

        {parsed.stageNote ? (
          <View
            style={{
              alignSelf: "flex-start",
              flexDirection: "row",
              alignItems: "center",
              gap: 3,
              marginBottom: 4,
              borderRadius: 999,
              paddingHorizontal: 7,
              paddingVertical: 2,
              backgroundColor: isDark
                ? "rgba(56,189,248,0.16)"
                : "rgba(224,242,254,0.85)",
            }}
          >
            <Ionicons
              name="sparkles"
              size={9}
              color={isDark ? "#7DD3FC" : "#0284C7"}
            />
            <Text
              style={{
                fontSize: 9.5,
                fontWeight: "600",
                color: isDark ? "#BAE6FD" : "#0369A1",
              }}
            >
              {parsed.stageNote}
            </Text>
          </View>
        ) : null}

        <Text
          style={{
            fontSize: 12,
            lineHeight: 18,
            letterSpacing: 0.1,
            color: isUser ? "#FFFFFF" : isDark ? "#EFF8FF" : "#0F2942",
          }}
        >
          {parsed.body}
        </Text>

        {m.actions?.length ? (
          <PetTactilePressable
            onPress={() => onApply(m.id)}
            pressedOpacity={0.78}
            pressedScale={0.97}
            style={{
              marginTop: 7,
              alignSelf: "flex-start",
              flexDirection: "row",
              alignItems: "center",
              gap: 4,
              borderRadius: 999,
              paddingHorizontal: 10,
              paddingVertical: 4.5,
              backgroundColor: isDark
                ? "rgba(16,185,129,0.26)"
                : "rgba(16,185,129,0.14)",
              borderWidth: 1,
              borderColor: isDark
                ? "rgba(52,211,153,0.48)"
                : "rgba(16,185,129,0.38)",
            }}
          >
            <Ionicons
              name="calendar-outline"
              size={11}
              color={isDark ? "#6EE7B7" : "#047857"}
            />
            <Text
              style={{
                fontSize: 10.5,
                fontWeight: "700",
                color: isDark ? "#A7F3D0" : "#065F46",
              }}
            >
              预览课表变更 · {m.actions.length} 项
            </Text>
          </PetTactilePressable>
        ) : null}
      </View>
    </View>
  );
});

export interface WhalePetPopoverProps {
  isDark: boolean;
  height: number;
  insetTop: number;
  panelW: number;
  panelH: number;
  panelAnchor: PanelAnchor;
  panelProgress: SharedValue<number>;
  glassProfile: GlassOpticalProfile;
  care: WhaleCare;
  hungry: boolean;
  input: string;
  busy: boolean;
  onChangeInput: (text: string) => void;
  onSend: () => void;
  onStopRequest: () => void;
  onClose: () => void;
  onDismiss: () => void;
  onQuickAction: (id: PetQuickActionDef["id"]) => void;
  onQuickDesktopFollow: () => void;
}

/** 仅在桌宠互动浮层展开期间挂载的养护面板与迷你对话浮层（关闭即卸载，零闲置开销） */
export function WhalePetPopover({
  isDark,
  height,
  insetTop,
  panelW,
  panelH,
  panelAnchor,
  panelProgress,
  glassProfile,
  care,
  hungry,
  input,
  busy,
  onChangeInput,
  onSend,
  onStopRequest,
  onClose,
  onDismiss,
  onQuickAction,
  onQuickDesktopFollow,
}: WhalePetPopoverProps) {
  const personaName = useWhalePersona((s) => s.persona.name);
  const emotionRaw = useWhaleMemory((s) => s.emotion);
  const emotionDesc = useMemo(() => describeWhaleEmotion(emotionRaw), [emotionRaw]);
  const chatMsgs = useWhaleMemory((s) => s.petMessages);
  const setChatMsgs = useWhaleMemory((s) => s.setPetMessages);
  const autoFollow = useDesktopPet((s) => s.autoFollowBackground);
  const desktopPermission = useDesktopPet((s) => s.permission);
  const voiceOn = useWhaleVoice((s) => s.on);
  const toggleVoice = useWhaleVoice((s) => s.toggle);
  const schedule = useActiveSchedule();

  const [kbHeight, setKbHeight] = useState(0);
  const [scheduleChange, setScheduleChange] = useState<{
    preview: ScheduleActionPreview;
    id: string;
  } | null>(null);

  // 键盘高度监听仅在浮层展开时注册，关闭即注销
  useEffect(() => {
    const showEvt = Platform.OS === "ios" ? "keyboardWillShow" : "keyboardDidShow";
    const hideEvt = Platform.OS === "ios" ? "keyboardWillHide" : "keyboardDidHide";
    const s = Keyboard.addListener(showEvt, (e) => setKbHeight(e.endCoordinates.height));
    const h = Keyboard.addListener(hideEvt, () => setKbHeight(0));
    return () => {
      s.remove();
      h.remove();
    };
  }, []);

  const panelScrimStyle = useAnimatedStyle(() => ({
    opacity: panelProgress.value,
  }));

  const panelCardStyle = useAnimatedStyle(() => {
    const p = panelProgress.value;
    const dy = panelAnchor.above ? 24 : -24;
    return {
      opacity: Math.max(0, Math.min(1, p)),
      transform: [
        { translateX: (1 - p) * panelAnchor.originOffsetX * 0.42 },
        { translateY: (1 - p) * dy },
        { scale: 0.84 + p * 0.16 },
      ],
    };
  });

  const applyPending = useCallback(
    (id: string) => {
      const msg = useWhaleMemory.getState().petMessages.find((m) => m.id === id);
      if (!msg?.actions?.length) return;
      setScheduleChange({ preview: previewScheduleActions(msg.actions, schedule), id });
    },
    [schedule],
  );

  const renderPetMessage = useCallback(
    (message: ChatMessage) => (
      <WhalePetBubble message={message} isDark={isDark} onApply={applyPending} />
    ),
    [isDark, applyPending],
  );

  const kbAvailableH =
    kbHeight > 0 ? Math.max(320, height - kbHeight - insetTop - 16) : panelH;
  const chatMaxHeight =
    kbHeight > 0
      ? clampNumber(Math.min(panelH, kbAvailableH) - POPOVER_CHROME_H, 76, 136)
      : clampNumber(panelH - POPOVER_CHROME_H, 92, 150);
  const effectivePanelH =
    kbHeight > 0 ? Math.min(panelH, POPOVER_CHROME_H + chatMaxHeight) : panelH;
  const panelTop =
    kbHeight > 0
      ? Math.max(insetTop + 8, height - kbHeight - effectivePanelH - 8)
      : panelAnchor.top;

  const footerHint = hungry
    ? {
        icon: "restaurant-outline" as const,
        text: "肚子饿啦，点「抛白饭」喂喂她～",
        iconColor: isDark ? "#FBBF24" : "#D97706",
        textColor: isDark ? "#FDE68A" : "#B45309",
      }
    : care.mood < 35
      ? {
          icon: "heart-outline" as const,
          text: "心情有点低落，摸摸头哄哄她吧～",
          iconColor: isDark ? "#F472B6" : "#DB2777",
          textColor: isDark ? "#FBCFE8" : "#BE185D",
        }
      : {
          icon: "sparkles-outline" as const,
          text: "轻点上方状态卡也能直接互动哦",
          iconColor: isDark ? "#7DD3FC" : "#0284C7",
          textColor: isDark ? "rgba(186,230,253,0.76)" : "#475569",
        };

  const chatEdgeColor = isDark ? "rgba(6,14,28,0.58)" : "rgba(214,234,248,0.68)";
  const chatEdgeTransparent = isDark ? "rgba(6,14,28,0)" : "rgba(214,234,248,0)";

  return (
    <>
      {/* 点击空白处流畅收起桌宠互动浮层的柔和遮罩 */}
      <Animated.View
        style={[
          StyleSheet.absoluteFill,
          styles.scrim,
          {
            backgroundColor: isDark ? "rgba(3,9,20,0.34)" : "rgba(15,23,42,0.12)",
          },
          panelScrimStyle,
        ]}
      >
        <Pressable
          style={StyleSheet.absoluteFill}
          onPress={onClose}
          accessibilityRole="button"
          accessibilityLabel="点击空白处收起桌宠互动卡片"
        />
      </Animated.View>

      {/* 灵动玻璃态桌宠互动浮层：点桌宠三下或长按，从角色位置自然弹簧绽放 */}
      <Animated.View
        style={[
          styles.popoverOuter,
          {
            left: panelAnchor.left,
            top: panelTop,
            width: panelW,
          },
          panelCardStyle,
        ]}
      >
        {/* 锚点外置裁剪光滴指针（严格位于卡片外沿，零半透明叠影与内框线） */}
        {kbHeight === 0 ? (
          <View
            pointerEvents="none"
            style={[
              styles.pointerClip,
              {
                left: panelAnchor.pointerLeft - 3,
                ...(panelAnchor.above ? { bottom: -8 } : { top: -8 }),
              },
            ]}
          >
            <View
              style={[
                styles.pointerDiamond,
                {
                  ...(panelAnchor.above ? { bottom: 3 } : { top: 3 }),
                  backgroundColor: isDark ? "rgba(18,31,54,0.95)" : "rgba(246,251,255,0.96)",
                  ...(panelAnchor.above
                    ? { borderRightWidth: 1, borderBottomWidth: 1 }
                    : { borderTopWidth: 1, borderLeftWidth: 1 }),
                  borderColor: isDark ? "rgba(186,230,253,0.26)" : "rgba(125,211,252,0.52)",
                },
              ]}
            />
          </View>
        ) : null}

        <View
          style={[
            styles.popoverCard,
            {
              backgroundColor: isDark ? "rgba(15,26,46,0.94)" : "rgba(246,251,255,0.95)",
              borderColor: isDark ? "rgba(186,230,253,0.24)" : "rgba(125,211,252,0.52)",
              boxShadow: [
                {
                  offsetX: 0,
                  offsetY: 16,
                  blurRadius: 36,
                  color: glassProfile.shadowColor,
                },
              ],
            },
          ]}
        >
          {/* 主题自适应液态玻璃斜向折射高光 */}
          <LinearGradient
            pointerEvents="none"
            colors={glassProfile.sheenColors}
            locations={[0, 0.36, 1]}
            start={{ x: 0, y: 0 }}
            end={{ x: 0.9, y: 1 }}
            style={StyleSheet.absoluteFill}
          />

          {/* 顶栏：角色头像 + 名称/心情胶囊 + 桌面随行/语音/关闭 */}
          <View style={styles.headerRow}>
            <View
              style={[
                styles.avatarFrame,
                {
                  backgroundColor: isDark ? "rgba(56,189,248,0.18)" : "rgba(224,242,254,0.92)",
                  borderColor: emotionDesc.color,
                },
              ]}
            >
              <WhaleAvatar size={36} />
            </View>
            <View style={styles.headerInfo}>
              <Text
                numberOfLines={1}
                style={[
                  styles.headerName,
                  { color: isDark ? "#EBF6FF" : "#0C4A6E" },
                ]}
              >
                {personaName}
              </Text>
              <View style={styles.moodRow}>
                <View style={[styles.moodDot, { backgroundColor: emotionDesc.color }]} />
                <Text
                  numberOfLines={1}
                  style={[
                    styles.moodLabel,
                    { color: isDark ? "#BAE6FD" : "#0369A1" },
                  ]}
                >
                  {emotionDesc.label}
                </Text>
              </View>
            </View>

            <View style={styles.headerControls}>
              {Platform.OS === "android" && desktopPetAvailable ? (
                <PetTactilePressable
                  onPress={onQuickDesktopFollow}
                  hitSlop={6}
                  accessibilityRole="button"
                  accessibilityLabel="开启后台自动驻留桌面"
                  pressedOpacity={0.76}
                  style={[
                    styles.desktopPill,
                    {
                      backgroundColor:
                        autoFollow && desktopPermission
                          ? isDark
                            ? "rgba(56,189,248,0.22)"
                            : "rgba(14,165,233,0.14)"
                          : isDark
                            ? "rgba(255,255,255,0.08)"
                            : "rgba(148,163,184,0.14)",
                      borderColor:
                        autoFollow && desktopPermission
                          ? isDark
                            ? "rgba(125,211,252,0.42)"
                            : "rgba(14,165,233,0.32)"
                          : isDark
                            ? "rgba(255,255,255,0.12)"
                            : "rgba(148,163,184,0.24)",
                    },
                  ]}
                >
                  <Ionicons
                    name="phone-portrait-outline"
                    size={12}
                    color={
                      autoFollow && desktopPermission
                        ? isDark
                          ? "#7DD3FC"
                          : "#0284C7"
                        : isDark
                          ? "#94A3B8"
                          : "#64748B"
                    }
                  />
                  <Text
                    numberOfLines={1}
                    style={[
                      styles.desktopPillText,
                      {
                        color:
                          autoFollow && desktopPermission
                            ? isDark
                              ? "#7DD3FC"
                              : "#0284C7"
                            : isDark
                              ? "#94A3B8"
                              : "#64748B",
                      },
                    ]}
                  >
                    {autoFollow && desktopPermission ? "随行中" : "去桌面"}
                  </Text>
                </PetTactilePressable>
              ) : null}

              <PetTactilePressable
                onPress={() => {
                  const next = !voiceOn;
                  tapHaptic();
                  toggleVoice();
                  if (next) {
                    speakWhale(
                      renderPersonaText("声音开好啦，{{user}}。", useWhalePersona.getState().persona),
                    );
                  } else {
                    stopWhaleVoice();
                  }
                }}
                hitSlop={8}
                accessibilityRole="button"
                accessibilityLabel={voiceOn ? "关闭鱼语" : "开启鱼语"}
                pressedOpacity={0.72}
                style={[
                  styles.roundIconBtn,
                  {
                    backgroundColor: voiceOn
                      ? isDark
                        ? "rgba(56,189,248,0.20)"
                        : "rgba(14,165,233,0.13)"
                      : isDark
                        ? "rgba(255,255,255,0.08)"
                        : "rgba(148,163,184,0.14)",
                    borderColor: voiceOn
                      ? isDark
                        ? "rgba(125,211,252,0.34)"
                        : "rgba(14,165,233,0.28)"
                      : isDark
                        ? "rgba(255,255,255,0.12)"
                        : "rgba(148,163,184,0.22)",
                  },
                ]}
              >
                <Ionicons
                  name={voiceOn ? "volume-high" : "volume-mute"}
                  size={14}
                  color={voiceOn ? (isDark ? "#7DD3FC" : "#0284C7") : isDark ? "#94A3B8" : "#64748B"}
                />
              </PetTactilePressable>

              <PetTactilePressable
                onPress={onClose}
                hitSlop={8}
                accessibilityRole="button"
                accessibilityLabel="关闭聊天"
                pressedOpacity={0.72}
                style={[
                  styles.roundIconBtn,
                  {
                    backgroundColor: isDark ? "rgba(255,255,255,0.09)" : "rgba(148,163,184,0.15)",
                    borderColor: isDark ? "rgba(255,255,255,0.14)" : "rgba(148,163,184,0.24)",
                  },
                ]}
              >
                <Ionicons name="close" size={15} color={isDark ? "#BAE6FD" : "#0284C7"} />
              </PetTactilePressable>
            </View>
          </View>

          {/* 养护数值条（轻盈玻璃态交互卡：轻点直接喂食 / 摸头 / 打招呼） */}
          <View style={styles.careRow}>
            <CareBar
              label="饱食"
              value={care.fullness}
              color="#FBBF24"
              icon="restaurant"
              isDark={isDark}
              highlight={hungry}
              onPress={() => {
                tapHaptic();
                onQuickAction("feed");
              }}
              accessibilityLabel={`饱食度 ${Math.round(care.fullness)}，轻点${hungry ? "抛白饭" : "抛团子"}喂食`}
            />
            <CareBar
              label="心情"
              value={care.mood}
              color="#38BDF8"
              icon="happy"
              isDark={isDark}
              onPress={() => {
                tapHaptic();
                onQuickAction("pat");
              }}
              accessibilityLabel={`心情 ${Math.round(care.mood)}，轻点摸摸头`}
            />
            <CareBar
              label="好感"
              value={care.bond}
              color="#F472B6"
              icon="heart"
              isDark={isDark}
              onPress={() => {
                tapHaptic();
                onQuickAction("wave");
              }}
              accessibilityLabel={`好感 ${Math.round(care.bond)}，轻点打个招呼`}
            />
          </View>

          {/* 内嵌微冷灰蓝凹槽对话区（柔和上下缓冲 + 高对比分层） */}
          <View
            style={[
              styles.chatListFrame,
              {
                backgroundColor: isDark ? "rgba(6,14,28,0.66)" : "rgba(214,234,248,0.72)",
                borderColor: isDark ? "rgba(125,211,252,0.20)" : "rgba(125,211,252,0.52)",
              },
            ]}
          >
            <ChatMessageList
              messages={chatMsgs}
              renderMessage={renderPetMessage}
              maxHeight={chatMaxHeight}
              itemGap={9}
              contentContainerStyle={styles.chatListContent}
              emptyComponent={
                <View style={styles.emptyBox}>
                  <Text
                    style={[
                      styles.emptyText,
                      { color: isDark ? "rgba(186,230,253,0.68)" : "#64748B" },
                    ]}
                  >
                    点下方互动或发句话逗逗{personaName}吧～
                  </Text>
                </View>
              }
              header={
                busy ? (
                  <View style={styles.busyWrap}>
                    <View
                      style={[
                        styles.busyPill,
                        {
                          backgroundColor: isDark ? "rgba(28,50,82,0.92)" : "#FFFFFF",
                          borderColor: isDark
                            ? "rgba(125,211,252,0.30)"
                            : "rgba(56,189,248,0.42)",
                        },
                      ]}
                    >
                      <Text
                        style={[
                          styles.busyText,
                          { color: isDark ? "#BAE6FD" : "#0369A1" },
                        ]}
                      >
                        {personaName}正在想回复…
                      </Text>
                    </View>
                  </View>
                ) : null
              }
            />
            <LinearGradient
              pointerEvents="none"
              colors={[chatEdgeColor, chatEdgeTransparent]}
              style={styles.chatEdgeFadeTop}
            />
            <LinearGradient
              pointerEvents="none"
              colors={[chatEdgeTransparent, chatEdgeColor]}
              style={styles.chatEdgeFadeBottom}
            />
          </View>

          {/* 3×2 对称快捷互动网格（零盲划、零 flex 塌陷，高频互动一目了然） */}
          <View style={styles.quickGrid}>
            {QUICK_ACTION_ROWS.map((row, rowIndex) => (
              <View key={rowIndex} style={styles.quickGridRow}>
                {row.map((action) => {
                  const isHungryFeed = action.id === "feed" && hungry;
                  const textLabel =
                    isHungryFeed && action.hungryLabel ? action.hungryLabel : action.label;
                  return (
                    <PetTactilePressable
                      key={action.id}
                      onPress={() => {
                        tapHaptic();
                        onQuickAction(action.id);
                      }}
                      accessibilityRole="button"
                      accessibilityLabel={textLabel}
                      pressedOpacity={0.78}
                      pressedScale={0.96}
                      style={[
                        styles.quickPill,
                        {
                          borderColor: isHungryFeed
                            ? isDark
                              ? "rgba(251,191,36,0.72)"
                              : "rgba(245,158,11,0.68)"
                            : isDark
                              ? tintHex(action.accent, 0.34)
                              : tintHex(action.accent, 0.32),
                          backgroundColor: isHungryFeed
                            ? isDark
                              ? "rgba(245,158,11,0.26)"
                              : "rgba(254,243,199,0.96)"
                            : isDark
                              ? tintHex(action.accent, 0.14)
                              : tintHex(action.accent, 0.1),
                          boxShadow: [
                            {
                              offsetX: 0,
                              offsetY: 1,
                              blurRadius: isHungryFeed ? 6 : 4,
                              color: isHungryFeed
                                ? isDark
                                  ? "rgba(245,158,11,0.24)"
                                  : "rgba(245,158,11,0.18)"
                                : isDark
                                  ? "rgba(2,8,20,0.24)"
                                  : "rgba(15,41,66,0.05)",
                            },
                          ],
                        },
                      ]}
                    >
                      <Ionicons
                        name={action.icon}
                        size={12}
                        color={
                          isHungryFeed
                            ? isDark
                              ? "#FBBF24"
                              : "#D97706"
                            : action.accent
                        }
                      />
                      <Text
                        numberOfLines={1}
                        style={[
                          styles.quickPillText,
                          {
                            color: isHungryFeed
                              ? isDark
                                ? "#FDE68A"
                                : "#92400E"
                              : isDark
                                ? "#E8F5FF"
                                : "#0F2942",
                          },
                        ]}
                      >
                        {textLabel}
                      </Text>
                    </PetTactilePressable>
                  );
                })}
              </View>
            ))}
          </View>

          {/* 轻盈底栏：左侧情境照料提示 + 右侧常驻「收起来」控制 */}
          <View style={styles.utilityRow}>
            <View style={styles.utilityHintWrap}>
              <Ionicons name={footerHint.icon} size={11.5} color={footerHint.iconColor} />
              <Text
                numberOfLines={1}
                style={[styles.utilityHintText, { color: footerHint.textColor }]}
              >
                {footerHint.text}
              </Text>
            </View>

            <PetTactilePressable
              onPress={onDismiss}
              hitSlop={4}
              accessibilityRole="button"
              accessibilityLabel="收起桌宠"
              pressedOpacity={0.78}
              pressedScale={0.96}
              style={[
                styles.dismissPill,
                {
                  borderColor: isDark
                    ? "rgba(148,163,184,0.28)"
                    : "rgba(148,163,184,0.36)",
                  backgroundColor: isDark
                    ? "rgba(30,41,59,0.78)"
                    : "rgba(241,245,249,0.95)",
                },
              ]}
            >
              <Ionicons
                name="moon-outline"
                size={11.5}
                color={isDark ? "#CBD5E1" : "#475569"}
              />
              <Text
                numberOfLines={1}
                style={[
                  styles.dismissPillText,
                  { color: isDark ? "#E2E8F0" : "#334155" },
                ]}
              >
                收起来
              </Text>
            </PetTactilePressable>
          </View>

          {/* 紧凑模式液态玻璃输入框 */}
          <ChatInputBar
            value={input}
            onChangeText={onChangeInput}
            onSend={onSend}
            busy={busy}
            onStop={onStopRequest}
            whaleTheme
            compact
            placeholder="跟她说点什么…"
            bottomInset={5}
          />

          {scheduleChange ? (
            <ScheduleChangeDialog
              preview={scheduleChange.preview}
              onClose={() => setScheduleChange(null)}
              onApplied={() => {
                successHaptic();
                setChatMsgs((previous) =>
                  previous.map((message) =>
                    message.id === scheduleChange.id ? { ...message, actions: undefined } : message,
                  ),
                );
              }}
            />
          ) : null}
        </View>
      </Animated.View>
    </>
  );
}
