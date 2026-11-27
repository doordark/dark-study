import { createRequestSession, type RequestTicket } from "@/utils/requestSession";
import { foregroundStore } from "@/utils/foreground";
import Ionicons from "@expo/vector-icons/Ionicons";
import { LinearGradient } from "expo-linear-gradient";
import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AppState,
  Keyboard,
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
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, {
  Easing,
  FadeIn,
  FadeOut,
  cancelAnimation,
  runOnJS,
  useAnimatedStyle,
  useFrameCallback,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withSequence,
  withSpring,
  withTiming,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useColorScheme } from "nativewind";

import { ChatImage } from "@/components/ChatImage";
import { ChatInputBar } from "@/components/ChatInputBar";
import { ChatMessageList } from "@/components/ChatMessageList";
import { PetAnimation, type PetAnimationKind } from "@/components/PetAnimation";
import { PetParticles, type PetParticleItem, type PetParticleKind } from "@/components/PetParticles";
import { ScheduleChangeDialog } from "@/components/ScheduleChangeDialog";
import { WhaleAvatar } from "@/components/WhaleAvatar";
import { BACKGROUND_PRESETS, resolveTint } from "@/constants/backgrounds";
import { resolveGlassOpticalProfile } from "@/constants/glassThemes";
import { useAnimationActive } from "@/hooks/useAnimationActive";
import { buildDesktopPetPayload, useDesktopPetSync } from "@/hooks/useDesktopPetSync";
import { askWhalePet } from "@/services/ai";
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
import { useWhalePet, type WhaleCare } from "@/store/useWhalePet";
import { useWhaleVoice } from "@/store/useWhaleVoice";
import type {
  AssistantAction,
  ChatMessage,
  PetActionKind,
  ScheduleAction,
  WhaleAction,
} from "@/types";
import { bumpHaptic, successHaptic, tapHaptic } from "@/utils/haptics";
import { uid } from "@/utils/id";
import { getDateInfo } from "@/utils/time";
import {
  decideAutonomousBehavior,
  findUpcomingCourse,
  pickPersonaLine,
} from "@/utils/whaleBehavior";
import { describeWhaleEmotion } from "@/utils/whaleEmotion";
import { renderPersonaText } from "@/utils/whalePersona";

/* eslint-disable react-hooks/immutability, react-hooks/refs --
   Reanimated shared value（坐标 / 速度 / 挤压 / 朝向）本质是跨渲染、跨线程可变的容器，
   手势回调、帧回调与 effect 对其赋值是官方标准用法；手势回调只在事件触发时执行，
   不会在渲染期读 ref。React 编译器的不可变/纯函数假设不适用于这些场景 */

type PetFrame = PetAnimationKind;

const BASE_SIZE = 84;
/** 立绘高宽比（素材是竖构图 192:256） */
const RATIO = 1.35;
const EDGE = 10;
/** 底部操作栏预留：桌宠落地时停在胶囊栏上方，不挡按钮 */
const FLOOR_RESERVE = 72;
const PANEL_SPRING = { damping: 19, stiffness: 275, mass: 0.78 };

const IDLE_DELAY_MIN = 6_500;
const IDLE_DELAY_MAX = 12_500;
const SLEEP_AFTER = 125_000;
/** 甩出去的判定门槛（px/s），低于它就是轻轻放下 */
const THROW_DEAD_ZONE = 480;
const MAX_THROW_SPEED = 3600;

/** 各动作随口说的话 */
const ACTION_LINES: Record<PetActionKind, string> = {
  dance: "♪ 扭一扭～{{user}}看好了！",
  spin: "转圈圈——晕了晕了…",
  eat: "团子！嗷呜——好吃！",
  study: "我陪你写，不吵你。",
  sleep: "那我也眯一小会儿…",
  jump: "嘿咻！",
  wave: "{{user}}～我在这儿呢",
  cuddle: "嘿嘿…蹭蹭{{user}}～",
};

/** 浮层去重整合后的快捷互动胶囊（零重复，按高频互动排序） */
interface PetQuickActionDef {
  id: "feed" | "pat" | "dance" | "study" | "spin" | "wave";
  label: string;
  hungryLabel?: string;
  icon: keyof typeof Ionicons.glyphMap;
  accent: string;
}

const PET_QUICK_ACTIONS: readonly PetQuickActionDef[] = [
  { id: "feed", label: "抛团子", hungryLabel: "抛白饭", icon: "restaurant-outline", accent: "#F59E0B" },
  { id: "pat", label: "摸摸头", icon: "heart-outline", accent: "#EC4899" },
  { id: "dance", label: "跳支舞", icon: "musical-notes-outline", accent: "#0EA5E9" },
  { id: "study", label: "陪我学习", icon: "book-outline", accent: "#6366F1" },
  { id: "spin", label: "转个圈", icon: "refresh-outline", accent: "#10B981" },
  { id: "wave", label: "打个招呼", icon: "hand-left-outline", accent: "#38BDF8" },
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

/**
 * 清洗并柔化桌宠对话中的括号前缀：
 * 1. 彻底剔除生硬冗余的系统碰撞前缀（如 "(刚才撞到了屏幕下边框)"），兼容已持久化旧消息；
 * 2. 将温和神态描写（如 "（尾巴晃了晃）"）提炼为轻盈微标签，不再硬塞进正文。
 */
function parsePetBubbleText(raw: string): { stageNote: string | null; body: string } {
  const trimmed = raw.trim();
  const withoutBump = trimmed.replace(/^[（(]\s*刚才撞到了屏幕[^）)]*[）)]\s*/u, "");
  const stageMatch = withoutBump.match(/^[（(]([^）)]{1,18})[）)]\s*(.+)$/su);
  if (stageMatch) {
    return {
      stageNote: stageMatch[1].trim(),
      body: stageMatch[2].trim(),
    };
  }
  return {
    stageNote: null,
    body: withoutBump || trimmed,
  };
}

/** 本地动作口令：无 Key 时零延迟直接播 */
const LOCAL_ACTIONS: { re: RegExp; action: PetActionKind; reply: string }[] = [
  { re: /转(个)?圈|旋转|转一转|spin/i, action: "spin", reply: "看好啦，转圈圈～" },
  {
    re: /跳舞|扭一扭|扭两下|来一段|dance/i,
    action: "dance",
    reply: "嘿嘿，那我扭两下，别笑我。",
  },
  { re: /吃|饭|团子|饿|零食/, action: "eat", reply: "团子我可不客气啦！" },
  {
    re: /学习|写作业|陪你(写|学)|一起学/,
    action: "study",
    reply: "好，我坐这儿陪你，不吵你。",
  },
  { re: /睡|困|晚安|休息/, action: "sleep", reply: "那我也眯一会儿…你也别熬太晚。" },
  { re: /蹦|跳一下|跳跳/, action: "jump", reply: "嘿咻！" },
  { re: /打招呼|招手|^hi$|^hello$/i, action: "wave", reply: "{{user}}～我在这儿呢" },
  { re: /摸摸|摸头|蹭蹭|贴贴|抱抱/, action: "cuddle", reply: "嘿嘿…再蹭一小会儿～" },
];

type PetMsg = ChatMessage;

const petMsg = (role: PetMsg["role"], text: string): PetMsg => ({
  id: uid(),
  role,
  content: role === "assistant" ? renderPersonaText(text, useWhalePersona.getState().persona) : text,
  timestamp: Date.now(),
});

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

const rand = () => Math.random();
const randBetween = (min: number, max: number) =>
  min + Math.random() * (max - min);
const nowMs = () => Date.now();
const clampNumber = (v: number, min: number, max: number) =>
  Math.min(Math.max(v, min), max);

/** 气泡太长就分页，一页一页说完，避免糊成一大坨 */
function splitPages(text: string): string[] {
  const clean = text.trim();
  if (clean.length <= 36) return [clean];
  const out: string[] = [];
  for (let i = 0; i < clean.length; i += 32) out.push(clean.slice(i, i + 32));
  return out;
}

function careHint(care: WhaleCare): string {
  const lines = [
    `饱食度 ${Math.round(care.fullness)}/100`,
    `心情 ${Math.round(care.mood)}/100`,
    `好感 ${Math.round(care.bond)}/100`,
  ];
  if (care.fullness < 25) lines.push("她现在很饿，说话会没力气");
  if (care.mood < 30) lines.push("她有点委屈，因为很久没人陪了");
  return lines.join("，");
}

/**
 * 大肥鱼桌宠：常驻应用最上层的可拖拽小鲸鱼。
 *
 * 升级亮点：
 * - 无缝后台随行：开启悬浮窗后，退后台自动 0ms 交由原生桌面悬浮窗接力，回前台自动归还并同步互动
 * - 灵动玻璃态锚点浮层：从角色坐标平滑弹簧舒展，带点击空白关闭遮罩、情绪状态条、快捷动作与紧凑对话
 * - 全套灵动动作：小跑巡游(walk)、贴边坐着探头(peek)、悬空踢腿(dangle)、摸头蹭蹭(cuddle) + 原有动作
 * - 分区触控 + 摇晃眩晕 + 抛团子接住小游戏 + 课前主动提醒 + 轻量 Reanimated 粒子层
 */
export function WhalePet() {
  useDesktopPetSync();
  // 只有原生桌面悬浮窗真正处于可见状态时才隐藏应用内桌宠；前台 Standby 隐身待命期间保留应用内桌宠
  const onDesktopVisible = useDesktopPet((s) => s.running && s.visible);
  const visible = useWhalePet((s) => s.visible);
  const hydrateVoice = useWhaleVoice((s) => s.hydrate);
  useEffect(() => {
    hydrateVoice();
  }, [hydrateVoice]);
  if (!visible || onDesktopVisible) return null;
  return <WhalePetLayer />;
}

interface PanelAnchor {
  left: number;
  top: number;
  above: boolean;
  originOffsetX: number;
  pointerLeft: number;
}

function WhalePetLayer() {
  const animationActive = useAnimationActive();
  const reducedMotion = useReducedMotion();
  const hide = useWhalePet((s) => s.hide);
  const care = useWhalePet((s) => s.care);
  const feedPet = useWhalePet((s) => s.feed);
  const patPet = useWhalePet((s) => s.pat);
  const tickPet = useWhalePet((s) => s.tick);
  const setLastPosition = useWhalePet((s) => s.setLastPosition);
  const petScale = useDesktopPet((s) => s.petScale);
  const autoFollow = useDesktopPet((s) => s.autoFollowBackground);
  const desktopPermission = useDesktopPet((s) => s.permission);
  const setAutoFollow = useDesktopPet((s) => s.setAutoFollowBackground);
  const setOverlayMode = useDesktopPet((s) => s.setOverlayMode);
  const refreshDesktop = useDesktopPet((s) => s.refresh);
  const apiKey = useSettings((s) => s.apiKey);
  const setWhalePhrase = useSettings((s) => s.setWhalePhrase);
  const setBackgroundTint = useSettings((s) => s.setBackgroundTint);
  const setBackgroundEffect = useSettings((s) => s.setBackgroundEffect);
  const backgroundTint = useSettings((s) => s.backgroundTint);
  const hasWallpaper = useSettings((s) => !!s.backgroundImage);
  const voiceOn = useWhaleVoice((s) => s.on);
  const toggleVoice = useWhaleVoice((s) => s.toggle);
  const schedule = useActiveSchedule();
  const schedules = useStore((s) => s.schedules);

  const SIZE = Math.round(BASE_SIZE * clampNumber(petScale, 0.85, 1.2));
  const H = Math.round(SIZE * RATIO);

  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const { colorScheme } = useColorScheme();
  const isDark = colorScheme !== "light";

  const panelW = Math.min(width - 24, 316);
  const panelH = Math.min(392, Math.max(300, height - insets.top - insets.bottom - 108));
  const glassProfile = useMemo(
    () => resolveGlassOpticalProfile(backgroundTint, isDark, hasWallpaper),
    [backgroundTint, isDark, hasWallpaper],
  );

  // 位置 / 速度 / 状态机：0 待机，1 拖拽中，2 飞行中
  const boxX = useSharedValue(width - SIZE - EDGE);
  const boxY = useSharedValue(height * 0.58);
  const velocityX = useSharedValue(0);
  const velocityY = useSharedValue(0);
  const phase = useSharedValue(0);
  const face = useSharedValue(1);
  const sqX = useSharedValue(1);
  const sqY = useSharedValue(1);
  const tilt = useSharedValue(0);
  const bob = useSharedValue(0);
  const breathEnergy = useSharedValue(1);
  const lift = useSharedValue(0);
  const scale = useSharedValue(1);
  const appear = useSharedValue(0);
  const panelProgress = useSharedValue(0);
  const lastBoundaryHit = useSharedValue(-1400);
  const boundaryClock = useSharedValue(0);
  // 拖拽左右快速摇晃检测（在 UI 线程零拷贝统计方向反转次数）
  const shakeDir = useSharedValue(0);
  const shakeCount = useSharedValue(0);
  const shakeLastFlip = useSharedValue(0);
  const landed = useSharedValue(0);
  const dragStartX = useSharedValue(0);
  const dragStartY = useSharedValue(0);

  const minX = useSharedValue(EDGE);
  const maxX = useSharedValue(Math.max(EDGE, width - SIZE - EDGE));
  const minY = useSharedValue(insets.top + 48);
  const maxY = useSharedValue(Math.max(insets.top + 48, height - H - insets.bottom - FLOOR_RESERVE));

  const [frame, setFrameState] = useState<PetFrame>("idle");
  const frameRef = useRef<PetFrame>("idle");
  const mountedRef = useRef(true);
  const lastInteraction = useRef(0);
  const lastPainAt = useRef(0);
  const remindedCourseRef = useRef<string>("");
  const pendingDesktopAuth = useRef(false);

  const setFrame = (next: PetFrame) => {
    frameRef.current = next;
    setFrameState(next);
  };

  const personaName = useWhalePersona((s) => s.persona.name);
  const emotionRaw = useWhaleMemory((s) => s.emotion);
  const emotionDesc = useMemo(() => describeWhaleEmotion(emotionRaw), [emotionRaw]);
  const [bubble, setBubble] = useState<string | null>(
    renderPersonaText("{{user}}，我出来啦～摸头、抛团子、拖我都行，点三下或长按打开互动卡", useWhalePersona.getState().persona),
  );
  const [bubbleBelow, setBubbleBelow] = useState(false);
  const [nearRight, setNearRight] = useState(true);
  const [particles, setParticles] = useState<PetParticleItem[]>([]);
  const [snackPos, setSnackPos] = useState<{ x: number; y: number } | null>(null);

  const [chatOpen, setChatOpen] = useState(false);
  const [panelMounted, setPanelMounted] = useState(false);
  const chatMsgs = useWhaleMemory((s) => s.petMessages);
  const setChatMsgs = useWhaleMemory((s) => s.setPetMessages);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [chatSession] = useState(createRequestSession);
  const stopChatRequest = useCallback(() => {
    chatSession.cancel();
    setBusy(false);
    stopWhaleVoice();
  }, [chatSession]);

  useEffect(() => {
    const foreground = foregroundStore.subscribe(() => {
      if (!foregroundStore.getSnapshot()) stopChatRequest();
    });
    const memory = useWhaleMemory.subscribe((next, previous) => {
      if (next.epoch !== previous.epoch) stopChatRequest();
    });
    return () => {
      foreground();
      memory();
      chatSession.cancel();
    };
  }, [chatSession, stopChatRequest]);

  // 从系统悬浮窗授权页返回时自动激活后台自动随行
  useEffect(() => {
    const sub = AppState.addEventListener("change", (next) => {
      if (next !== "active" || !pendingDesktopAuth.current) return;
      pendingDesktopAuth.current = false;
      void (async () => {
        const status = await getDesktopPetStatus().catch(() => null);
        if (status?.permission) {
          setAutoFollow(true);
          setOverlayMode("auto");
          await startDesktopPet(buildDesktopPetPayload(reducedMotion, true)).catch(() => {});
          await refreshDesktop().catch(() => {});
          showBubble("好耶！现在按 Home 键我也会跟着去手机桌面陪你啦～", 3200);
        }
      })();
    });
    return () => sub.remove();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reducedMotion, refreshDesktop, setAutoFollow, setOverlayMode]);

  const [panelAnchor, setPanelAnchor] = useState<PanelAnchor>({
    left: 12,
    top: 120,
    above: true,
    originOffsetX: 0,
    pointerLeft: 148,
  });
  const [kbHeight, setKbHeight] = useState(0);

  const chatOpenRef = useRef(false);
  const bubbleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const frameTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const idleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const sleepTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const leaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const particleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const zzzTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const snackTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const particleSeq = useRef(1);
  const taps = useRef({ count: 0, at: 0 });
  const pokes = useRef({ count: 0, at: 0 });
  const lastPat = useRef(0);
  const lastSpoke = useRef(0);
  const bubblePages = useRef<string[]>([]);
  const bubblePage = useRef(0);

  /** 触发一组轻量 Reanimated 粒子，自动回收（零常驻内存） */
  const emitParticles = useCallback(
    (kind: PetParticleKind, count = 4) => {
      if (reducedMotion || !animationActive) return;
      const items: PetParticleItem[] = [];
      for (let i = 0; i < Math.min(count, 5); i++) {
        items.push({
          id: particleSeq.current++,
          kind,
          x: SIZE * (0.24 + Math.random() * 0.52),
          y: kind === "zzz" ? H * 0.14 : H * (0.16 + Math.random() * 0.28),
          dx: kind === "zzz" ? 10 + i * 6 : (Math.random() - 0.5) * 44,
          dy: -(26 + Math.random() * 32),
          delay: i * 95,
          duration: kind === "zzz" ? 1350 : 950,
          scale: 0.85 + Math.random() * 0.35,
        });
      }
      setParticles((prev) => [...prev, ...items].slice(-8));
      if (particleTimer.current) clearTimeout(particleTimer.current);
      particleTimer.current = setTimeout(() => {
        if (mountedRef.current) setParticles([]);
        particleTimer.current = null;
      }, 1650);
    },
    [SIZE, H, reducedMotion, animationActive],
  );

  /** 同步最新归一化位置给 store，供退后台 0ms 交接坐标 */
  const syncPosition = useCallback(() => {
    const spanX = Math.max(1, maxX.value - minX.value);
    const spanY = Math.max(1, maxY.value - minY.value);
    setLastPosition(
      (boxX.value - minX.value) / spanX,
      (boxY.value - minY.value) / spanY,
      face.value,
    );
  }, [boxX, boxY, minX, maxX, minY, maxY, face, setLastPosition]);

  /** 只在开着语音时开口，且两次朗读之间留点空隙 */
  const say = (text: string) => {
    text = renderPersonaText(text, useWhalePersona.getState().persona);
    if (!useWhaleVoice.getState().on) return;
    const now = nowMs();
    if (now - lastSpoke.current < 1800) return;
    lastSpoke.current = now;
    speakWhale(text);
  };

  const clearBubble = () => {
    if (bubbleTimer.current) clearTimeout(bubbleTimer.current);
    bubbleTimer.current = null;
    bubblePages.current = [];
    bubblePage.current = 0;
  };

  /** 冒一句话：自动分页、按当前位置决定朝左还是朝右、贴顶时翻到下方 */
  const showBubble = (text: string, ms = 2800) => {
    clearBubble();
    bubblePages.current = splitPages(renderPersonaText(text, useWhalePersona.getState().persona));
    bubblePage.current = 0;
    setBubble(bubblePages.current[0] ?? null);
    setNearRight(boxX.value > width / 2);
    setBubbleBelow(boxY.value < insets.top + 96);
    const next = () => {
      bubblePage.current += 1;
      if (bubblePage.current >= bubblePages.current.length) {
        if (mountedRef.current) setBubble(null);
        return;
      }
      if (mountedRef.current) setBubble(bubblePages.current[bubblePage.current]);
      bubbleTimer.current = setTimeout(next, ms);
    };
    bubbleTimer.current = setTimeout(next, ms);
  };

  /** Q 弹挤压与拉伸 */
  const squash = (depth = 0.82) => {
    if (reducedMotion) return;
    sqY.value = withSequence(
      withTiming(depth, { duration: 85, easing: Easing.out(Easing.quad) }),
      withSpring(1, { damping: 9, stiffness: 180, mass: 0.68 }),
    );
    sqX.value = withSequence(
      withTiming(1 + (1 - depth) * 0.58, {
        duration: 85,
        easing: Easing.out(Easing.quad),
      }),
      withSpring(1, { damping: 9, stiffness: 180, mass: 0.68 }),
    );
  };

  const armIdle = () => {
    if (idleTimer.current) clearTimeout(idleTimer.current);
    if (sleepTimer.current) clearTimeout(sleepTimer.current);
    if (frameRef.current === "sleep" || chatOpenRef.current) return;
    idleTimer.current = setTimeout(
      runIdleTick,
      IDLE_DELAY_MIN + randBetween(0, IDLE_DELAY_MAX - IDLE_DELAY_MIN),
    );
    sleepTimer.current = setTimeout(() => {
      if (chatOpenRef.current || phase.value !== 0 || frameTimer.current) {
        armIdle();
        return;
      }
      stopAction();
      setFrame("sleep");
      if (idleTimer.current) clearTimeout(idleTimer.current);
    }, Math.max(1000, SLEEP_AFTER - (nowMs() - lastInteraction.current)));
  };

  const wake = () => {
    lastInteraction.current = nowMs();
    if (frameRef.current === "sleep" || frameRef.current === "peek") setFrame("idle");
    armIdle();
  };

  const hasMountedBounds = useRef(false);

  // 仅首次挂载执行 Q 弹跃出登场、星光粒子与单点召唤音效（避免尺寸/安全区微变时重播或瞬移）
  useEffect(() => {
    lastInteraction.current = nowMs();
    const lo = insets.top + 48;
    const hi = Math.max(lo, height - H - insets.bottom - FLOOR_RESERVE);
    minX.value = EDGE;
    maxX.value = Math.max(EDGE, width - SIZE - EDGE);
    minY.value = lo;
    maxY.value = hi;
    const restY = Math.min(Math.max(height * 0.56, lo), hi);
    boxX.value = Math.max(EDGE, (width - SIZE) / 2);
    let introSparkleTimer: ReturnType<typeof setTimeout> | null = null;
    if (reducedMotion) {
      scale.value = 1;
      appear.value = withTiming(1, { duration: 120 });
      boxY.value = restY;
    } else {
      scale.value = 0.62;
      appear.value = withTiming(1, { duration: 220, easing: Easing.out(Easing.cubic) });
      scale.value = withSpring(1, { damping: 13, stiffness: 215, mass: 0.72 });
      boxY.value = restY + 18;
      boxY.value = withSpring(restY, { damping: 16, stiffness: 185, mass: 0.8 });
      introSparkleTimer = setTimeout(() => {
        if (mountedRef.current) emitParticles("sparkle", 4);
      }, 60);
    }
    playSfx("whale_pet_summon", { volume: 0.72 });
    bubbleTimer.current = setTimeout(() => {
      if (mountedRef.current) setBubble(null);
    }, 4600);
    armIdle();
    return () => {
      if (introSparkleTimer) clearTimeout(introSparkleTimer);
      if (bubbleTimer.current) clearTimeout(bubbleTimer.current);
      if (idleTimer.current) clearTimeout(idleTimer.current);
      if (sleepTimer.current) clearTimeout(sleepTimer.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 屏幕尺寸、安全区或桌宠缩放变化时仅更新活动边界并平滑 clamp，不瞬移、不重播登场动画与音效
  useEffect(() => {
    if (!hasMountedBounds.current) {
      hasMountedBounds.current = true;
      return;
    }
    const lo = insets.top + 48;
    const hi = Math.max(lo, height - H - insets.bottom - FLOOR_RESERVE);
    const nextMaxX = Math.max(EDGE, width - SIZE - EDGE);
    minX.value = EDGE;
    maxX.value = nextMaxX;
    minY.value = lo;
    maxY.value = hi;
    boxX.value = clampNumber(boxX.value, EDGE, nextMaxX);
    boxY.value = clampNumber(boxY.value, lo, hi);
  }, [width, height, insets.top, insets.bottom, SIZE, H, minX, maxX, minY, maxY, boxX, boxY]);

  // 退后台时暂停自主行为定时器，回到前台后自动恢复，零后台空转
  useEffect(() => {
    if (!animationActive) {
      if (idleTimer.current) {
        clearTimeout(idleTimer.current);
        idleTimer.current = null;
      }
      if (sleepTimer.current) {
        clearTimeout(sleepTimer.current);
        sleepTimer.current = null;
      }
      return;
    }
    armIdle();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [animationActive]);

  // 有机呼吸起伏：告别机械停顿，随动作状态动态改变节奏与幅度
  useEffect(() => {
    if (!animationActive || reducedMotion) {
      bob.value = 0;
      return;
    }
    breathEnergy.value = withTiming(
      frame === "sleep" ? 0.55 : frame === "walk" ? 1.35 : frame === "cuddle" ? 1.2 : 1,
      { duration: 320 },
    );
    bob.value = withRepeat(
      withTiming(1, {
        duration:
          frame === "sleep"
            ? 2900
            : frame === "eat" || frame === "walk"
              ? 520
              : frame === "cuddle"
                ? 760
                : 1750,
        easing: Easing.inOut(Easing.sin),
      }),
      -1,
      true,
    );
    return () => {
      cancelAnimation(bob);
      bob.value = 0;
    };
  }, [bob, breathEnergy, frame, animationActive, reducedMotion]);

  // 睡觉时轻柔飘出 Zzz 粒子
  useEffect(() => {
    if (frame !== "sleep" || !animationActive || reducedMotion) {
      if (zzzTimer.current) {
        clearInterval(zzzTimer.current);
        zzzTimer.current = null;
      }
      return;
    }
    const first = setTimeout(() => emitParticles("zzz", 2), 180);
    zzzTimer.current = setInterval(() => emitParticles("zzz", 2), 2800);
    return () => {
      clearTimeout(first);
      if (zzzTimer.current) {
        clearInterval(zzzTimer.current);
        zzzTimer.current = null;
      }
    };
  }, [frame, animationActive, reducedMotion, emitParticles]);

  // 养护心跳：仅在前台运行时每分钟结算一次，切回前台瞬间立即补结算，避免后台无意义写入
  useEffect(() => {
    let timer: ReturnType<typeof setInterval> | null = null;
    const stop = () => {
      if (timer) {
        clearInterval(timer);
        timer = null;
      }
    };
    const start = () => {
      if (timer || !foregroundStore.getSnapshot()) return;
      timer = setInterval(() => {
        if (foregroundStore.getSnapshot()) tickPet();
      }, 60_000);
    };
    let wasForeground = foregroundStore.getSnapshot();
    if (wasForeground) start();
    const unsubscribe = foregroundStore.subscribe(() => {
      const isForeground = foregroundStore.getSnapshot();
      if (isForeground && !wasForeground) {
        tickPet();
        start();
      } else if (!isForeground) {
        stop();
      }
      wasForeground = isForeground;
    });
    return () => {
      unsubscribe();
      stop();
    };
  }, [tickPet]);

  // 键盘高度
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

  // 卸载清理所有定时器、动画与声音（零内存泄漏）
  useEffect(
    () => () => {
      mountedRef.current = false;
      stopWhaleVoice();
      if (bubbleTimer.current) clearTimeout(bubbleTimer.current);
      if (frameTimer.current) clearTimeout(frameTimer.current);
      if (idleTimer.current) clearTimeout(idleTimer.current);
      if (sleepTimer.current) clearTimeout(sleepTimer.current);
      if (leaveTimer.current) clearTimeout(leaveTimer.current);
      if (particleTimer.current) clearTimeout(particleTimer.current);
      if (zzzTimer.current) clearInterval(zzzTimer.current);
      if (snackTimer.current) clearTimeout(snackTimer.current);
      cancelAnimation(appear);
      cancelAnimation(scale);
      cancelAnimation(boxX);
      cancelAnimation(boxY);
      cancelAnimation(tilt);
      cancelAnimation(lift);
      cancelAnimation(sqX);
      cancelAnimation(sqY);
      cancelAnimation(bob);
      cancelAnimation(breathEnergy);
      cancelAnimation(face);
      cancelAnimation(panelProgress);
    },
    [appear, scale, boxX, boxY, tilt, lift, sqX, sqY, bob, breathEnergy, face, panelProgress],
  );

  /* ------------------------------------------------------------------ */
  /*  动作、巡游与贴边探头                                                */
  /* ------------------------------------------------------------------ */

  const finishWalk = (afterWalk?: () => void) => {
    cancelAnimation(tilt);
    tilt.value = withTiming(0, { duration: 180 });
    if (frameRef.current === "walk") setFrame("idle");
    syncPosition();
    if (afterWalk) afterWalk();
    else armIdle();
  };

  /** 欢快小跑游向目标位置（真正切换 walk 步态动画） */
  const walkTo = (target: number, onArrive?: () => void) => {
    if (phase.value !== 0) return;
    const from = boxX.value;
    if (Math.abs(target - from) < 20) {
      onArrive?.();
      return;
    }
    const dir = target > from ? 1 : -1;
    // 素材 walk 略微朝左，朝右走时翻转朝向；保持视觉自然
    face.value = withTiming(dir, { duration: 150 });
    setFrame("walk");
    cancelAnimation(tilt);
    tilt.value = withRepeat(
      withTiming(dir * 3.2, {
        duration: 240,
        easing: Easing.inOut(Easing.sin),
      }),
      -1,
      true,
    );
    const dist = Math.abs(target - from);
    boxX.value = withTiming(
      target,
      {
        duration: Math.min(3400, Math.max(520, (dist / 92) * 1000)),
        easing: Easing.inOut(Easing.quad),
      },
      (finished) => {
        if (finished) runOnJS(finishWalk)(onArrive);
      },
    );
  };

  const walkSomewhere = () => {
    if (phase.value !== 0) return;
    const dir = rand() < 0.5 ? -1 : 1;
    const dist = 70 + randBetween(0, 165);
    walkTo(clampNumber(boxX.value + dir * dist, minX.value, maxX.value));
  };

  /** 走到屏幕边坐下探头晃小脚（Shimeji 风格贴边陪伴） */
  const peekAtEdge = (line?: string) => {
    if (phase.value !== 0) return;
    const goLeft = boxX.value < width / 2;
    const targetX = goLeft ? minX.value : maxX.value;
    walkTo(targetX, () => {
      face.value = goLeft ? 1 : -1;
      setFrame("peek");
      if (line) showBubble(line, 3200);
      emitParticles("bubble", 2);
      if (frameTimer.current) clearTimeout(frameTimer.current);
      frameTimer.current = setTimeout(() => {
        frameTimer.current = null;
        if (frameRef.current === "peek") setFrame("idle");
        armIdle();
      }, 6500);
    });
  };

  /** 收掉正在播放的动作 */
  const stopAction = () => {
    if (frameTimer.current) clearTimeout(frameTimer.current);
    frameTimer.current = null;
    if (snackTimer.current) clearTimeout(snackTimer.current);
    snackTimer.current = null;
    setSnackPos(null);
    cancelAnimation(boxX);
    cancelAnimation(tilt);
    cancelAnimation(lift);
    tilt.value = withTiming(0, { duration: 180 });
    lift.value = withSpring(0, { damping: 16, stiffness: 180 });
  };

  /** 播放一个动作，配粒子特效，结束后回到待机并重新计时 */
  const playAction = (kind: PetActionKind, silent = false, customBubble?: string) => {
    if (phase.value === 2) return;
    stopAction();
    if (!silent) wake();
    if (sleepTimer.current) clearTimeout(sleepTimer.current);

    const settle = (ms: number) => {
      frameTimer.current = setTimeout(() => {
        frameTimer.current = null;
        if (mountedRef.current) setFrame("idle");
        cancelAnimation(tilt);
        tilt.value = withTiming(0, { duration: 220 });
        lift.value = withSpring(0, { damping: 16, stiffness: 180 });
        armIdle();
      }, ms);
    };

    switch (kind) {
      case "dance":
        setFrame("dance");
        emitParticles("note", 4);
        tilt.value = withRepeat(
          withTiming(8, { duration: 230, easing: Easing.inOut(Easing.quad) }),
          -1,
          true,
        );
        lift.value = withRepeat(withTiming(-7, { duration: 230 }), -1, true);
        settle(3200);
        break;
      case "spin":
        setFrame("spin");
        emitParticles("sparkle", 4);
        lift.value = withSequence(withTiming(-6, { duration: 200 }), withTiming(0, { duration: 920 }));
        settle(1120);
        break;
      case "eat":
        setFrame("eat");
        playSfx("whale_cute_happy", { volume: 0.64 });
        feedPet();
        useWhaleMemory.getState().applyMood({ pleasure: 10, arousal: 4, reason: "吃到了香香的团子" });
        useWhaleMemory.getState().bumpBond("interaction");
        emitParticles("note", 3);
        settle(2800);
        break;
      case "study":
        setFrame("study");
        settle(4600);
        break;
      case "sleep":
        setFrame("sleep");
        if (idleTimer.current) clearTimeout(idleTimer.current);
        break;
      case "jump":
        setFrame("happy");
        emitParticles("sparkle", 3);
        squash(0.86);
        lift.value = withSequence(
          withTiming(-20, { duration: 170, easing: Easing.out(Easing.quad) }),
          withTiming(0, { duration: 200, easing: Easing.in(Easing.quad) }),
          withTiming(-12, { duration: 150 }),
          withTiming(0, { duration: 180 }),
        );
        settle(920);
        break;
      case "wave":
        setFrame("wave");
        emitParticles("bubble", 3);
        tilt.value = withRepeat(withTiming(6, { duration: 170 }), 5, true);
        settle(1150);
        break;
      case "cuddle":
        setFrame("cuddle");
        patPet();
        useWhaleMemory.getState().applyMood({ pleasure: 11, arousal: 3, reason: "被温柔摸了摸头" });
        useWhaleMemory.getState().bumpBond("interaction");
        emitParticles("heart", 4);
        squash(0.87);
        settle(1750);
        break;
    }
    const line = customBubble ?? ACTION_LINES[kind];
    showBubble(line, 2400);
    if (!silent) say(line);
  };

  /** 抛团子小互动：往旁边丢一颗白饭团子，大肥鱼欢快跑过去“嗷呜”接住 */
  const throwSnack = () => {
    if (phase.value !== 0) {
      playAction("eat");
      return;
    }
    stopAction();
    wake();
    const goRight = boxX.value < width * 0.52;
    const delta = randBetween(95, 165) * (goRight ? 1 : -1);
    const targetX = clampNumber(boxX.value + delta, minX.value + 16, maxX.value - 16);
    const snackY = boxY.value + H - 24;
    setSnackPos({ x: targetX + SIZE * 0.35, y: snackY });
    const line = pickPersonaLine("throw_snack", useWhalePersona.getState().persona, useWhaleMemory.getState().emotion);
    showBubble(line, 1800);
    walkTo(targetX, () => {
      if (mountedRef.current) setSnackPos(null);
      playAction("eat");
    });
    snackTimer.current = setTimeout(() => {
      if (mountedRef.current) setSnackPos(null);
    }, 3200);
  };

  /** 自主行为引擎：结合课表提醒、时段、饱食/心情、边缘状态和人设滑条主动做动作 */
  const runIdleTick = () => {
    if (frameRef.current === "sleep") return;
    if (chatOpenRef.current || phase.value !== 0 || frameTimer.current) {
      armIdle();
      return;
    }
    const now = new Date();
    const upcoming = findUpcomingCourse(schedule, now, 20);
    const nearEdge = boxX.value <= minX.value + 36 || boxX.value >= maxX.value - 36;
    const decision = decideAutonomousBehavior({
      care: useWhalePet.getState().care,
      persona: useWhalePersona.getState().persona,
      emotion: useWhaleMemory.getState().emotion,
      nearEdge,
      hour: now.getHours(),
      upcomingCourse: upcoming,
      remindedCourseId: remindedCourseRef.current,
    });

    if (upcoming && decision.kind === "action" && decision.bubble === upcoming.summary) {
      remindedCourseRef.current = upcoming.courseId;
    }

    if (decision.kind === "walk") {
      walkSomewhere();
    } else if (decision.kind === "peek") {
      peekAtEdge(decision.bubble);
    } else if (decision.kind === "action") {
      playAction(decision.action, true, decision.bubble);
    } else {
      showBubble(decision.bubble, 3000);
      armIdle();
    }
  };

  /* ------------------------------------------------------------------ */
  /*  抛掷物理、拎起晃晕与撞边反馈                                         */
  /* ------------------------------------------------------------------ */

  const onFloorHit = (impact: number) => {
    const t = clampNumber((impact - 280) / 1100, 0, 1);
    if (!reducedMotion) squash(0.95 - 0.14 * t);
  };

  const onBoundaryHit = (impact: number, edge: string) => {
    const now = nowMs();
    if (impact < 550 || now - lastPainAt.current < 1400) return;
    lastPainAt.current = now;
    if (frameTimer.current) clearTimeout(frameTimer.current);
    if (idleTimer.current) clearTimeout(idleTimer.current);
    if (sleepTimer.current) clearTimeout(sleepTimer.current);
    setFrame("hurt");
    emitParticles("star", 4);
    const line = impact > 1200 ? "呜……撞疼了，{{user}}轻一点嘛。" : `哎哟，撞到${edge}了！`;
    showBubble(line, 2400);
    say(line);
    if (!reducedMotion) bumpHaptic();
    useWhaleMemory.getState().applyMood({ pleasure: -14, arousal: 10, reason: `不小心撞到了${edge}` });
    setChatMsgs((prev) => [...prev, petMsg("assistant", line)].slice(-200));
    frameTimer.current = setTimeout(() => {
      frameTimer.current = null;
      if (mountedRef.current && frameRef.current === "hurt") setFrame("idle");
      if (phase.value === 0) armIdle();
    }, 850);
  };

  const onShakeDizzy = () => {
    if (nowMs() - lastPainAt.current < 2200) return;
    lastPainAt.current = nowMs();
    if (!reducedMotion) bumpHaptic();
    emitParticles("star", 5);
    const line = pickPersonaLine("shake_dizzy", useWhalePersona.getState().persona, useWhaleMemory.getState().emotion);
    showBubble(line, 2500);
    say(line);
    useWhaleMemory.getState().applyMood({ pleasure: -6, arousal: 18, reason: "被晃得晕头转向啦" });
  };

  const onLandRest = () => {
    if (frameRef.current !== "hurt") setFrame("idle");
    landed.value = 0;
    syncPosition();
    armIdle();
  };

  const onThrowStart = () => {
    if (frameRef.current !== "hurt") stopAction();
    wake();
    landed.value = 0;
    if (frameRef.current !== "hurt") {
      clearBubble();
      setBubble(null);
    }
  };

  const onDragStart = () => {
    stopAction();
    setFrame("dangle");
    wake();
    cancelAnimation(boxX);
    cancelAnimation(boxY);
    lift.value = withTiming(-10, { duration: 120 });
  };

  const onDragEnd = (thrown: boolean) => {
    lift.value = withTiming(0, { duration: 200 });
    if (!thrown) {
      phase.value = 0;
      if (frameRef.current === "dangle") setFrame("idle");
      tilt.value = withSpring(0, { damping: 14, stiffness: 160 });
      squash(0.9);
      syncPosition();
      armIdle();
    }
  };

  const physicsClock = useFrameCallback((info) => {
    boundaryClock.value = info.timestamp;
    if (phase.value !== 2) return;
    const dt = Math.min(Math.max((info.timeSincePreviousFrame ?? 16) / 1000, 0.001), 0.05);
    let x = boxX.value;
    let y = boxY.value;
    let vx = velocityX.value;
    let vy = velocityY.value;
    let floorHit = 0;
    let boundaryImpact = 0;
    let edge = "";

    const travel = Math.hypot(vx, vy) * dt;
    const steps = Math.min(16, Math.max(1, Math.ceil(travel / 8)));
    const stepDt = dt / steps;

    for (let i = 0; i < steps; i++) {
      vy += 1400 * stepDt;
      x += vx * stepDt;
      y += vy * stepDt;
      if (x < minX.value) {
        if (Math.abs(vx) > boundaryImpact) { boundaryImpact = Math.abs(vx); edge = "左边框"; }
        x = minX.value;
        vx = Math.abs(vx) * 0.78;
      } else if (x > maxX.value) {
        if (Math.abs(vx) > boundaryImpact) { boundaryImpact = Math.abs(vx); edge = "右边框"; }
        x = maxX.value;
        vx = -Math.abs(vx) * 0.78;
      }
      if (y < minY.value) {
        if (Math.abs(vy) > boundaryImpact) { boundaryImpact = Math.abs(vy); edge = "上边框"; }
        y = minY.value;
        vy = Math.abs(vy) * 0.78;
      } else if (y > maxY.value) {
        if (Math.abs(vy) > boundaryImpact) { boundaryImpact = Math.abs(vy); edge = "下边框"; }
        floorHit = Math.max(floorHit, Math.abs(vy));
        y = maxY.value;
        vx *= Math.max(0, 1 - 2.5 * stepDt);
        vy = Math.abs(vy) < 40 ? 0 : -Math.abs(vy) * 0.78;
      }
    }

    boxX.value = x;
    boxY.value = y;
    velocityX.value = vx;
    velocityY.value = vy;
    tilt.value = Math.max(-16, Math.min(16, vx * 0.014));
    if (Math.abs(vx) > 80) face.value = vx > 0 ? 1 : -1;
    if (boundaryImpact >= 550 && boundaryClock.value - lastBoundaryHit.value >= 1400) {
      lastBoundaryHit.value = boundaryClock.value;
      runOnJS(onBoundaryHit)(boundaryImpact, edge);
    }

    if (floorHit > 260 && landed.value === 0) {
      landed.value = 1;
      runOnJS(onFloorHit)(floorHit);
    }

    const atRest = y >= maxY.value - 1 && Math.abs(vy) < 1 && Math.abs(vx) < 15;
    if (atRest) {
      phase.value = 0;
      tilt.value = withTiming(0, { duration: 180 });
      runOnJS(onLandRest)();
    }
  }, true);

  useEffect(() => {
    physicsClock.setActive(animationActive);
    return () => physicsClock.setActive(false);
  }, [physicsClock, animationActive]);

  const pan = Gesture.Pan()
    .enabled(!chatOpen)
    .minDistance(4)
    .onStart(() => {
      phase.value = 1;
      dragStartX.value = boxX.value;
      dragStartY.value = boxY.value;
      shakeDir.value = 0;
      shakeCount.value = 0;
      cancelAnimation(boxX);
      cancelAnimation(boxY);
      runOnJS(onDragStart)();
    })
    .onUpdate((e) => {
      const targetX = dragStartX.value + e.translationX;
      const targetY = dragStartY.value + e.translationY;
      const horizontal = (targetX < minX.value && boxX.value > minX.value) || (targetX > maxX.value && boxX.value < maxX.value);
      const vertical = (targetY < minY.value && boxY.value > minY.value) || (targetY > maxY.value && boxY.value < maxY.value);
      const impact = Math.max(horizontal ? Math.abs(e.velocityX) : 0, vertical ? Math.abs(e.velocityY) : 0);
      if (impact >= 550 && boundaryClock.value - lastBoundaryHit.value >= 1400) {
        lastBoundaryHit.value = boundaryClock.value;
        runOnJS(onBoundaryHit)(
          impact,
          horizontal ? (targetX < minX.value ? "左边框" : "右边框") : targetY < minY.value ? "上边框" : "下边框",
        );
      }

      // 检测拎在手里左右猛摇 → 晕乎乎
      if (Math.abs(e.velocityX) > 650) {
        const dir = e.velocityX > 0 ? 1 : -1;
        if (shakeDir.value !== 0 && shakeDir.value !== dir) {
          if (boundaryClock.value - shakeLastFlip.value < 420) {
            shakeCount.value += 1;
            if (shakeCount.value >= 4) {
              shakeCount.value = 0;
              runOnJS(onShakeDizzy)();
            }
          } else {
            shakeCount.value = 1;
          }
          shakeLastFlip.value = boundaryClock.value;
        }
        shakeDir.value = dir;
      }

      // 真实钟摆物理倾角：手往右甩身体往左惯性滞后摆动
      tilt.value = withSpring(Math.max(-22, Math.min(22, -e.velocityX * 0.018)), {
        damping: 12,
        stiffness: 165,
      });
      boxX.value = Math.min(Math.max(targetX, minX.value), maxX.value);
      boxY.value = Math.min(Math.max(targetY, minY.value), maxY.value);
    })
    .onEnd((e) => {
      const speed = Math.hypot(e.velocityX, e.velocityY);
      if (speed >= THROW_DEAD_ZONE) {
        const clamped = MAX_THROW_SPEED * (1 - Math.exp(-speed / MAX_THROW_SPEED));
        velocityX.value = (e.velocityX / speed) * clamped;
        velocityY.value = (e.velocityY / speed) * clamped;
        phase.value = 2;
        runOnJS(onThrowStart)();
        runOnJS(onDragEnd)(true);
      } else {
        phase.value = 0;
        runOnJS(onDragEnd)(false);
      }
    })
    .onFinalize(() => {
      if (phase.value === 1) {
        phase.value = 0;
        runOnJS(onDragEnd)(false);
      }
    });

  const wrapperStyle = useAnimatedStyle(() => ({
    opacity: appear.value,
    transform: [
      { translateX: boxX.value },
      { translateY: boxY.value + (H * (1 - sqY.value)) / 2 + lift.value },
      { scale: scale.value },
      { rotate: `${tilt.value}deg` },
      { scaleX: sqX.value },
      { scaleY: sqY.value },
    ],
  }));

  const bobStyle = useAnimatedStyle(() => ({
    transform: [
      { translateY: phase.value === 0 ? (bob.value - 0.5) * 4.2 * breathEnergy.value : 0 },
      { rotate: `${phase.value === 0 ? (bob.value - 0.5) * 2.2 * breathEnergy.value : 0}deg` },
      { scaleX: 1 + (bob.value - 0.5) * 0.026 * breathEnergy.value },
      { scaleY: 1 - (bob.value - 0.5) * 0.024 * breathEnergy.value },
    ],
  }));

  const shadowStyle = useAnimatedStyle(() => {
    const elevated = phase.value !== 0 || lift.value < -4;
    return {
      opacity: elevated ? 0.08 : 0.18,
      transform: [{ scaleX: elevated ? 0.72 : 1 + (bob.value - 0.5) * 0.08 }],
    };
  });

  const facingStyle = useAnimatedStyle(() => ({
    transform: [{ scaleX: face.value }],
  }));

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

  /* ------------------------------------------------------------------ */
  /*  分区点按（摸头 vs 戳肚子 vs 狂戳炸毛） / 灵动玻璃态互动浮层          */
  /* ------------------------------------------------------------------ */

  const interactByZone = (locationY: number) => {
    stopAction();
    wake();
    const persona = useWhalePersona.getState().persona;
    const emotion = useWhaleMemory.getState().emotion;
    const isHead = locationY < H * 0.46;

    const now = nowMs();
    if (now - pokes.current.at > 2600) pokes.current.count = 0;
    pokes.current.count += 1;
    pokes.current.at = now;

    if (isHead) {
      // 上半区：温柔摸头蹭蹭
      squash(0.86);
      setFrame("cuddle");
      emitParticles("heart", 4);
      if (now - lastPat.current > 4500) {
        lastPat.current = now;
        patPet();
        useWhaleMemory.getState().applyMood({ pleasure: 9, arousal: 3, reason: "被温柔摸了摸头" });
        useWhaleMemory.getState().bumpBond("interaction");
      }
      const line = pickPersonaLine("headpat", persona, emotion);
      showBubble(line, 2500);
      say(line);
      if (frameTimer.current) clearTimeout(frameTimer.current);
      frameTimer.current = setTimeout(() => {
        frameTimer.current = null;
        if (mountedRef.current && frameRef.current === "cuddle") setFrame("idle");
        armIdle();
      }, 1700);
      return;
    }

    // 连续狂戳身体 4 次以上 → 炸毛傲娇抗议
    if (pokes.current.count >= 4) {
      pokes.current.count = 0;
      playSfx("whale_cute_tsun", { ignoreCooldown: true, volume: 0.78 });
      squash(0.78);
      setFrame("hurt");
      emitParticles("sweat", 4);
      if (!reducedMotion) bumpHaptic();
      useWhaleMemory.getState().applyMood({ pleasure: -8, arousal: 16, dominance: 10, reason: "被连续狂戳有点气鼓鼓" });
      const line = pickPersonaLine("poke_spam", persona, emotion);
      showBubble(line, 2600);
      say(line);
      if (frameTimer.current) clearTimeout(frameTimer.current);
      frameTimer.current = setTimeout(() => {
        frameTimer.current = null;
        if (mountedRef.current && frameRef.current === "hurt") setFrame("idle");
        armIdle();
      }, 1300);
      return;
    }

    // 下半区：轻戳肚子弹跳反应
    squash(0.83);
    lift.value = withSequence(
      withTiming(-8, { duration: 110, easing: Easing.out(Easing.quad) }),
      withSpring(0, { damping: 16, stiffness: 220 }),
    );
    setFrame("happy");
    emitParticles("sparkle", 3);
    if (frameTimer.current) clearTimeout(frameTimer.current);
    frameTimer.current = setTimeout(() => {
      frameTimer.current = null;
      if (mountedRef.current) setFrame("idle");
      armIdle();
    }, 1450);

    const c = useWhalePet.getState().care;
    const line =
      c.fullness < 20 && rand() < 0.5
        ? pickPersonaLine("hungry", persona, emotion)
        : c.bond > 78 && rand() < 0.35
          ? pickPersonaLine("close", persona, emotion)
          : pickPersonaLine("poke_belly", persona, emotion);
    showBubble(line);
    say(line);
  };

  const finishClosePanel = useCallback(() => {
    if (!mountedRef.current) return;
    setPanelMounted(false);
  }, []);

  /** 从桌宠位置自然舒展玻璃态互动卡片（锚点精准对齐 + 弹簧微位移绽放） */
  const openChat = () => {
    if (chatOpenRef.current) return;
    const px = boxX.value;
    const py = boxY.value;
    const petCenterX = px + SIZE / 2;
    const left = clampNumber(petCenterX - panelW / 2, 12, width - panelW - 12);
    const aboveTop = py - panelH - 12;
    const above = aboveTop > insets.top + 8;
    const top = above
      ? aboveTop
      : clampNumber(py + H + 12, insets.top + 8, height - panelH - insets.bottom - 10);
    const originOffsetX = clampNumber(petCenterX - (left + panelW / 2), -panelW * 0.36, panelW * 0.36);
    const pointerLeft = clampNumber(petCenterX - left - 7, 24, panelW - 38);

    setPanelAnchor({ left, top, above, originOffsetX, pointerLeft });
    chatOpenRef.current = true;
    setChatOpen(true);
    setPanelMounted(true);
    clearBubble();
    setBubble(null);
    stopAction();
    cancelAnimation(boxX);
    cancelAnimation(boxY);
    setFrame("idle");
    if (idleTimer.current) clearTimeout(idleTimer.current);
    if (sleepTimer.current) clearTimeout(sleepTimer.current);
    if (chatMsgs.length === 0) {
      setChatMsgs([
        petMsg("assistant", "{{user}}叫我？想聊什么，还是想给我抛个白饭团子呀～"),
      ]);
    }
    cancelAnimation(panelProgress);
    if (reducedMotion) {
      panelProgress.value = 1;
    } else {
      panelProgress.value = withSpring(1, PANEL_SPRING);
    }
  };

  const closeChat = () => {
    stopChatRequest();
    if (!chatOpenRef.current && !panelMounted) return;
    chatOpenRef.current = false;
    setChatOpen(false);
    Keyboard.dismiss();
    cancelAnimation(panelProgress);
    if (reducedMotion) {
      panelProgress.value = 0;
      setPanelMounted(false);
    } else {
      panelProgress.value = withTiming(
        0,
        { duration: 155, easing: Easing.in(Easing.cubic) },
        (finished) => {
          if (finished) runOnJS(finishClosePanel)();
        },
      );
    }
    wake();
  };

  const onPetPress = (locationY: number) => {
    tapHaptic();
    if (chatOpen) {
      interactByZone(locationY);
      return;
    }
    const now = nowMs();
    if (now - taps.current.at > 750) taps.current.count = 0;
    taps.current.count += 1;
    taps.current.at = now;
    if (taps.current.count >= 3) {
      taps.current.count = 0;
      openChat();
      return;
    }
    interactByZone(locationY);
  };

  /** 一键开启「切后台自动随行桌面」或立即去桌面 */
  const handleQuickDesktopFollow = async () => {
    if (!desktopPetAvailable) {
      showBubble("桌面悬浮需要安装包含原生模块的新 APK 哦～", 3000);
      return;
    }
    const status = await getDesktopPetStatus().catch(() => null);
    if (!status?.permission) {
      pendingDesktopAuth.current = true;
      await requestDesktopPetPermission().catch(() => {});
      showBubble("请允许「显示在其他应用上层」，回来后按 Home 键我就会跟出去啦！", 3600);
      return;
    }
    setAutoFollow(true);
    setOverlayMode("auto");
    syncPosition();
    await startDesktopPet(buildDesktopPetPayload(reducedMotion, true)).catch(() => {});
    await refreshDesktop().catch(() => {});
    showBubble("后台随行已开启！按 Home 键切到桌面就能看到我啦～", 3200);
  };

  /** 面板里的「摸摸头」 */
  const patHead = () => {
    playAction(
      "cuddle",
      false,
      pickPersonaLine("headpat", useWhalePersona.getState().persona, useWhaleMemory.getState().emotion),
    );
  };

  /** 面板里的「抛团子喂食」 */
  const feedFromPanel = () => {
    throwSnack();
  };

  const runWhaleActions = async (
    actions: WhaleAction[],
    userText: string,
    ticket: RequestTicket,
  ) => {
    const memoryEpoch = useWhaleMemory.getState().epoch;
    for (const action of actions) {
      if (!ticket.isCurrent() || useWhaleMemory.getState().epoch !== memoryEpoch) return;
      if (action.type === "set_summon_phrase") {
        const phrase = String(action.phrase ?? "")
          .replace(/[\s「」"“”'']/g, "")
          .slice(0, 12);
        if (phrase.length < 2) {
          setChatMsgs((prev) =>
            [...prev, petMsg("assistant", "这个口令太短啦，换一个 2-12 个字的吧。")].slice(-200),
          );
          continue;
        }
        setWhalePhrase(phrase);
        const line = `（尾巴晃了晃）记住啦：以后喊「${phrase}」，我就游出来。`;
        setChatMsgs((prev) => [...prev, petMsg("assistant", line)].slice(-200));
        showBubble(line, 2600);
      } else if (action.type === "set_background") {
        const tint = resolveTint(action.tint);
        setBackgroundTint(tint);
        if (action.effect === "aurora" || action.effect === "plain") {
          setBackgroundEffect(action.effect);
        }
        const line = `（把背景调成了「${BACKGROUND_PRESETS[tint].label}」）{{user}}看看，喜不喜欢？`;
        setChatMsgs((prev) => [...prev, petMsg("assistant", line)].slice(-200));
        showBubble(line, 2600);
      } else if (action.type === "generate_image") {
        const uri = buildImageUrl(String(action.prompt ?? ""), action.size);
        setChatMsgs((prev) =>
          [
            ...prev,
            {
              ...petMsg("assistant", "画好啦，{{user}}收好。"),
              imageUri: uri,
              imageAspect: imageAspect(action.size),
            },
          ].slice(-200),
        );
      } else if (action.type === "web_search") {
        const query = String(action.query ?? "").trim();
        if (!query) continue;
        try {
          const hits = await searchWeb(query, ticket.signal, apiKey);
          if (!hits.length) throw new Error("没有结果");
          const answer = await answerFromSearch(userText, hits, apiKey, ticket.signal);
          if (!ticket.isCurrent() || useWhaleMemory.getState().epoch !== memoryEpoch) return;
          const unique = Array.from(new Map(hits.map((h) => [h.url, h])).values()).slice(0, 3);
          setChatMsgs((prev) =>
            [
              ...prev,
              {
                ...petMsg("assistant", answer),
                sources: unique.map((h) => ({ title: h.title, url: h.url })),
              },
            ].slice(-200),
          );
          showBubble(answer, 3000);
          say(answer);
        } catch {
          if (!ticket.isCurrent() || useWhaleMemory.getState().epoch !== memoryEpoch) return;
          setChatMsgs((prev) =>
            [...prev, petMsg("assistant", `呜，网线被海浪打断了……「${query}」没查到。`)].slice(-200),
          );
        }
      } else if (action.type === "dismiss_pet") {
        chatSession.defer(ticket, () => dismiss(), 700);
      } else if (action.type === "forget_memory") {
        useWhaleMemory.getState().clearMemory();
        stopWhaleVoice();
        clearBubble();
        showBubble("已经忘掉之前的对话啦，我们重新聊吧。", 2600);
        return;
      }
    }
  };

  const [scheduleChange, setScheduleChange] = useState<{ preview: ScheduleActionPreview; id: string } | null>(null);
  const applyPending = useCallback((id: string) => {
    const msg = useWhaleMemory.getState().petMessages.find((m) => m.id === id);
    if (!msg?.actions?.length) return;
    setScheduleChange({ preview: previewScheduleActions(msg.actions, schedule), id });
  }, [schedule]);

  const renderPetMessage = useCallback(
    (message: ChatMessage) => (
      <WhalePetBubble message={message} isDark={isDark} onApply={applyPending} />
    ),
    [isDark, applyPending],
  );

  const handleQuickActionPress = (actionId: PetQuickActionDef["id"]) => {
    switch (actionId) {
      case "feed":
        feedFromPanel();
        return;
      case "pat":
        patHead();
        return;
      case "dance":
        playAction("dance");
        return;
      case "spin":
        playAction("spin");
        return;
      case "wave":
        playAction("wave");
        return;
      case "study":
        sendChat("陪我学习");
        return;
    }
  };

  const sendChat = (text?: string) => {
    const content = (text ?? input).trim();
    if (!content || chatSession.pending || !chatOpenRef.current || !foregroundStore.getSnapshot()) return;
    if (content === "抛团子") {
      setInput("");
      throwSnack();
      return;
    }
    let ticket = chatSession.begin(false);
    setInput("");
    const userMsg: ChatMessage = { id: uid(), role: "user", content, timestamp: nowMs() };
    setChatMsgs((prev) => [...prev, userMsg]);
    const memoryEpoch = useWhaleMemory.getState().epoch;

    const reply = (line: string) => {
      chatSession.defer(ticket, () => {
        if (!ticket.isCurrent() || useWhaleMemory.getState().epoch !== memoryEpoch) return;
        setChatMsgs((prev) => [...prev, petMsg("assistant", line)].slice(-200));
        showBubble(line, 2400);
        say(line);
      }, 220);
    };

    const pushReply = (line: string) => {
      chatSession.defer(ticket, () => {
        if (!ticket.isCurrent() || useWhaleMemory.getState().epoch !== memoryEpoch) return;
        setChatMsgs((prev) => [...prev, petMsg("assistant", line)].slice(-200));
      }, 220);
    };

    const looksLikeSchedule =
      /课表|课程|改到|换到|加一门|新增|删掉|删除|新建|合并|第[一二三四五六七八九十0-9]+节|周[一二三四五六日天]/.test(
        content,
      );

    if (/^(请|你)?(回去|退下|收起来|藏起来|走吧|变回去|别陪我)(吧|啦|了|休息吧)?[。！!～~]*$/.test(content)) {
      reply("呜…那我先回水里啦，{{user}}记得再叫我。");
      chatSession.defer(ticket, () => dismiss(), 900);
      return;
    }
    if (!apiKey && !looksLikeSchedule && /^(喂你|给你|吃饭|吃点|吃个|吃吧)/.test(content)) {
      pushReply("白饭！嗷呜——好吃，谢谢{{user}}。");
      playAction("eat");
      return;
    }
    if (!apiKey && !looksLikeSchedule && /^(摸摸|摸头|抱抱|亲亲|贴贴|rua)/i.test(content)) {
      pushReply("唔…摸头的话，我就原谅你啦。");
      patHead();
      return;
    }

    const local = looksLikeSchedule || apiKey ? undefined : LOCAL_ACTIONS.find((a) => a.re.test(content));
    if (local) {
      pushReply(local.reply);
      chatSession.defer(ticket, () => playAction(local.action), 240);
      return;
    }

    if (!apiKey) {
      reply("{{user}}没喂我 Key，我只能自己玩玩…去设置里填一下，我就能陪你聊天啦。");
      return;
    }

    ticket = chatSession.begin();
    setBusy(true);
    const history = [...chatMsgs, userMsg].map((m) => ({ id: m.id, role: m.role, content: m.content }));
    const ctx = {
      schedule,
      weekIndex: getDateInfo(schedule.startDate).weekIndex,
      schedules: schedules.map((s) => ({ id: s.id, name: s.name })),
      persona: "whale" as const,
    };
    askWhalePet(history, apiKey, {
      status: careHint(useWhalePet.getState().care),
      ctx,
      signal: ticket.signal,
    })
      .then(async (res) => {
        if (!ticket.isCurrent() || useWhaleMemory.getState().epoch !== memoryEpoch) return;
        const scheduleActions = res.actions.filter(isScheduleAction);
        const whaleActions = res.actions.filter(isWhaleAction);
        setChatMsgs((prev) =>
          [
            ...prev,
            {
              ...petMsg("assistant", res.reply),
              actions: scheduleActions.length ? scheduleActions : undefined,
            },
          ].slice(-200),
        );
        showBubble(res.reply, 2800);
        say(res.reply);
        if (res.action) playAction(res.action, true);
        if (whaleActions.length) await runWhaleActions(whaleActions, content, ticket);
      })
      .catch((e) => {
        if (!ticket.isCurrent() || useWhaleMemory.getState().epoch !== memoryEpoch) return;
        setChatMsgs((prev) =>
          [
            ...prev,
            petMsg("assistant", e instanceof Error ? e.message : "鱼脑子卡住了，再说一次？"),
          ].slice(-200),
        );
      })
      .finally(() => {
        if (chatSession.finish(ticket)) setBusy(false);
      });
  };

  const dismiss = () => {
    if (leaveTimer.current) return;
    bumpHaptic();
    playSfx("whale_pet_dismiss", { volume: 0.64 });
    stopWhaleVoice();
    closeChat();
    stopAction();
    clearBubble();
    setBubble(null);
    emitParticles("bubble", 4);
    phase.value = 0;
    cancelAnimation(boxX);
    cancelAnimation(boxY);
    if (reducedMotion) {
      appear.value = withTiming(0, { duration: 150 });
    } else {
      scale.value = withSequence(
        withTiming(1.08, { duration: 90, easing: Easing.out(Easing.quad) }),
        withTiming(0, { duration: 300, easing: Easing.in(Easing.cubic) }),
      );
      appear.value = withTiming(0, { duration: 340, easing: Easing.in(Easing.quad) });
      lift.value = withTiming(-26, { duration: 340, easing: Easing.in(Easing.quad) });
    }
    leaveTimer.current = setTimeout(() => {
      leaveTimer.current = null;
      hide();
    }, reducedMotion ? 160 : 380);
  };

  const panelTop =
    kbHeight > 0
      ? Math.max(insets.top + 8, height - kbHeight - panelH - 8)
      : panelAnchor.top;
  const chatMaxHeight =
    kbHeight > 0
      ? Math.max(92, Math.min(136, height - kbHeight - insets.top - 216))
      : 146;

  const hungry = care.fullness < 25;
  const lonely = care.mood < 32;

  return (
    <View pointerEvents="box-none" style={StyleSheet.absoluteFill}>
      {/* 抛出的小团子（仅抛食瞬间挂载，吃完立即卸载，零常驻开销） */}
      {snackPos ? (
        <Animated.View
          entering={FadeIn.duration(160)}
          exiting={FadeOut.duration(120)}
          pointerEvents="none"
          style={{
            position: "absolute",
            left: snackPos.x,
            top: snackPos.y,
            width: 26,
            height: 26,
            borderRadius: 13,
            backgroundColor: "rgba(255,255,255,0.96)",
            borderWidth: 1.5,
            borderColor: "#38BDF8",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 19,
            boxShadow: [
              { offsetX: 0, offsetY: 3, blurRadius: 8, color: "rgba(56,189,248,0.28)" },
            ],
          }}
        >
          <Text style={{ fontSize: 13.5 }}>🍙</Text>
        </Animated.View>
      ) : null}

      {/* 点击空白处流畅收起桌宠互动浮层的柔和遮罩 */}
      {panelMounted ? (
        <Animated.View
          style={[
            StyleSheet.absoluteFill,
            {
              zIndex: 25,
              backgroundColor: isDark ? "rgba(3,9,20,0.34)" : "rgba(15,23,42,0.12)",
            },
            panelScrimStyle,
          ]}
        >
          <Pressable
            style={StyleSheet.absoluteFill}
            onPress={() => closeChat()}
            accessibilityRole="button"
            accessibilityLabel="点击空白处收起桌宠互动卡片"
          />
        </Animated.View>
      ) : null}

      <GestureDetector gesture={pan}>
        <Animated.View
          style={[
            { position: "absolute", left: 0, top: 0, zIndex: 27 },
            { width: SIZE, height: H },
            wrapperStyle,
          ]}
        >
          {/* 饿 / 委屈的小角标 */}
          {hungry || lonely ? (
            <Animated.View
              entering={FadeIn.duration(200)}
              exiting={FadeOut.duration(160)}
              pointerEvents="none"
              style={{
                position: "absolute",
                top: -6,
                right: 0,
                width: 19,
                height: 19,
                borderRadius: 9.5,
                alignItems: "center",
                justifyContent: "center",
                backgroundColor: hungry ? "rgba(251,191,36,0.95)" : "#38BDF8",
                borderWidth: 1.5,
                borderColor: "rgba(255,255,255,0.78)",
                zIndex: 4,
              }}
            >
              <Ionicons name={hungry ? "restaurant" : "sad"} size={10} color="#172033" />
            </Animated.View>
          ) : null}

          {/* 轻量特效粒子层（爱心 / 泡泡 / Zzz / 眩晕星 / 音符） */}
          <PetParticles items={particles} />

          {/* 玻璃态轻盈悬浮气泡：贴顶时自动翻到下方，靠边时自动朝内 */}
          {bubble ? (
            <Animated.View
              entering={FadeIn.duration(170)}
              exiting={FadeOut.duration(130)}
              pointerEvents="none"
              style={{
                position: "absolute",
                width: 204,
                ...(bubbleBelow ? { top: H + 10 } : { bottom: H + 10 }),
                ...(nearRight ? { right: 0 } : { left: 0 }),
                borderRadius: 16,
                borderCurve: "continuous",
                overflow: "hidden",
                paddingHorizontal: 11,
                paddingVertical: 8,
                backgroundColor: isDark ? "rgba(13,24,44,0.90)" : "rgba(255,255,255,0.94)",
                borderWidth: 1,
                borderColor: isDark ? "rgba(186,230,253,0.28)" : "rgba(125,211,252,0.52)",
                zIndex: 7,
                boxShadow: [
                  {
                    offsetX: 0,
                    offsetY: 6,
                    blurRadius: 18,
                    color: glassProfile.shadowColor,
                  },
                ],
              }}
            >
              <LinearGradient
                pointerEvents="none"
                colors={
                  isDark
                    ? ["rgba(186,230,253,0.14)", "rgba(56,189,248,0.02)"]
                    : ["rgba(255,255,255,0.8)", "rgba(224,242,254,0.25)"]
                }
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={StyleSheet.absoluteFill}
              />
              <Text
                style={{
                  fontSize: 11,
                  lineHeight: 16.5,
                  color: isDark ? "#E8F5FF" : "#0F2A43",
                }}
              >
                {bubble}
              </Text>
            </Animated.View>
          ) : null}

          <Pressable
            onPress={(e) => onPetPress(e.nativeEvent.locationY)}
            onLongPress={openChat}
            delayLongPress={520}
            hitSlop={{ top: 8, bottom: 8, left: 6, right: 6 }}
          >
            <Animated.View style={bobStyle}>
              <Animated.View
                style={[
                  {
                    position: "absolute",
                    left: SIZE * 0.22,
                    bottom: 2,
                    width: SIZE * 0.56,
                    height: 6,
                    borderRadius: 99,
                    backgroundColor: "rgba(0,0,0,0.8)",
                  },
                  shadowStyle,
                ]}
              />
              <Animated.View style={[{ width: SIZE, height: H }, facingStyle]}>
                <PetAnimation kind={frame} width={SIZE} height={H} active={animationActive} />
              </Animated.View>
            </Animated.View>
          </Pressable>
        </Animated.View>
      </GestureDetector>

      {/* 灵动玻璃态桌宠互动浮层：点桌宠三下或长按，从角色位置自然弹簧绽放 */}
      {panelMounted ? (
        <Animated.View
          style={[
            {
              position: "absolute",
              left: panelAnchor.left,
              top: panelTop,
              width: panelW,
              zIndex: 30,
            },
            panelCardStyle,
          ]}
        >
          {/* 锚点外置裁剪光滴指针（严格位于卡片外沿，零半透明叠影与内框线） */}
          {kbHeight === 0 ? (
            <View
              pointerEvents="none"
              style={{
                position: "absolute",
                left: panelAnchor.pointerLeft - 3,
                ...(panelAnchor.above ? { bottom: -8 } : { top: -8 }),
                width: 20,
                height: 8,
                overflow: "hidden",
              }}
            >
              <View
                style={{
                  position: "absolute",
                  left: 4,
                  ...(panelAnchor.above ? { bottom: 3 } : { top: 3 }),
                  width: 12,
                  height: 12,
                  borderRadius: 2.5,
                  transform: [{ rotate: "45deg" }],
                  backgroundColor: isDark ? "rgba(18,31,54,0.95)" : "rgba(246,251,255,0.96)",
                  ...(panelAnchor.above
                    ? { borderRightWidth: 1, borderBottomWidth: 1 }
                    : { borderTopWidth: 1, borderLeftWidth: 1 }),
                  borderColor: isDark ? "rgba(186,230,253,0.26)" : "rgba(125,211,252,0.52)",
                }}
              />
            </View>
          ) : null}

          <View
            style={{
              borderRadius: 26,
              borderCurve: "continuous",
              paddingTop: 13,
              paddingBottom: 4,
              overflow: "hidden",
              backgroundColor: isDark ? "rgba(15,26,46,0.94)" : "rgba(246,251,255,0.95)",
              borderWidth: 1,
              borderColor: isDark ? "rgba(186,230,253,0.24)" : "rgba(125,211,252,0.52)",
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
            <View style={{ flexDirection: "row", alignItems: "center", paddingHorizontal: 13 }}>
              <View
                style={{
                  width: 40,
                  height: 40,
                  borderRadius: 15,
                  borderCurve: "continuous",
                  marginRight: 9,
                  alignItems: "center",
                  justifyContent: "center",
                  overflow: "hidden",
                  backgroundColor: isDark ? "rgba(56,189,248,0.18)" : "rgba(224,242,254,0.92)",
                  borderWidth: 1.2,
                  borderColor: emotionDesc.color,
                }}
              >
                <WhaleAvatar size={36} />
              </View>
              <View style={{ flex: 1, minWidth: 0, marginRight: 8 }}>
                <Text
                  numberOfLines={1}
                  style={{
                    fontSize: 14.5,
                    fontWeight: "800",
                    color: isDark ? "#EBF6FF" : "#0C4A6E",
                  }}
                >
                  {personaName}
                </Text>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 4.5, marginTop: 2.5 }}>
                  <View
                    style={{
                      width: 6,
                      height: 6,
                      borderRadius: 3,
                      backgroundColor: emotionDesc.color,
                    }}
                  />
                  <Text
                    numberOfLines={1}
                    style={{
                      fontSize: 10.5,
                      fontWeight: "600",
                      color: isDark ? "#BAE6FD" : "#0369A1",
                    }}
                  >
                    {emotionDesc.label}
                  </Text>
                </View>
              </View>

              <View style={{ flexDirection: "row", alignItems: "center", gap: 6, flexShrink: 0 }}>
                {Platform.OS === "android" && desktopPetAvailable ? (
                  <PetTactilePressable
                    onPress={() => void handleQuickDesktopFollow()}
                    hitSlop={6}
                    accessibilityRole="button"
                    accessibilityLabel="开启后台自动驻留桌面"
                    pressedOpacity={0.76}
                    style={{
                      height: 30,
                      paddingHorizontal: 10,
                      borderRadius: 15,
                      flexDirection: "row",
                      alignItems: "center",
                      justifyContent: "center",
                      gap: 4,
                      backgroundColor:
                        autoFollow && desktopPermission
                          ? isDark
                            ? "rgba(56,189,248,0.22)"
                            : "rgba(14,165,233,0.14)"
                          : isDark
                            ? "rgba(255,255,255,0.08)"
                            : "rgba(148,163,184,0.14)",
                      borderWidth: 1,
                      borderColor:
                        autoFollow && desktopPermission
                          ? isDark
                            ? "rgba(125,211,252,0.42)"
                            : "rgba(14,165,233,0.32)"
                          : isDark
                            ? "rgba(255,255,255,0.12)"
                            : "rgba(148,163,184,0.24)",
                    }}
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
                      {autoFollow && desktopPermission ? "随行中" : "去桌面"}
                    </Text>
                  </PetTactilePressable>
                ) : null}

                <PetTactilePressable
                  onPress={() => {
                    const next = !voiceOn;
                    tapHaptic();
                    toggleVoice();
                    if (next) speakWhale(renderPersonaText("声音开好啦，{{user}}。", useWhalePersona.getState().persona));
                    else stopWhaleVoice();
                  }}
                  hitSlop={8}
                  accessibilityRole="button"
                  accessibilityLabel={voiceOn ? "关闭鱼语" : "开启鱼语"}
                  pressedOpacity={0.72}
                  style={{
                    width: 30,
                    height: 30,
                    borderRadius: 15,
                    alignItems: "center",
                    justifyContent: "center",
                    backgroundColor: voiceOn
                      ? isDark
                        ? "rgba(56,189,248,0.20)"
                        : "rgba(14,165,233,0.13)"
                      : isDark
                        ? "rgba(255,255,255,0.08)"
                        : "rgba(148,163,184,0.14)",
                    borderWidth: 0.75,
                    borderColor: voiceOn
                      ? isDark
                        ? "rgba(125,211,252,0.34)"
                        : "rgba(14,165,233,0.28)"
                      : isDark
                        ? "rgba(255,255,255,0.12)"
                        : "rgba(148,163,184,0.22)",
                  }}
                >
                  <Ionicons
                    name={voiceOn ? "volume-high" : "volume-mute"}
                    size={14}
                    color={voiceOn ? (isDark ? "#7DD3FC" : "#0284C7") : isDark ? "#94A3B8" : "#64748B"}
                  />
                </PetTactilePressable>

                <PetTactilePressable
                  onPress={() => closeChat()}
                  hitSlop={8}
                  accessibilityRole="button"
                  accessibilityLabel="关闭聊天"
                  pressedOpacity={0.72}
                  style={{
                    width: 30,
                    height: 30,
                    borderRadius: 15,
                    alignItems: "center",
                    justifyContent: "center",
                    backgroundColor: isDark ? "rgba(255,255,255,0.09)" : "rgba(148,163,184,0.15)",
                    borderWidth: 0.75,
                    borderColor: isDark ? "rgba(255,255,255,0.14)" : "rgba(148,163,184,0.24)",
                  }}
                >
                  <Ionicons name="close" size={15} color={isDark ? "#BAE6FD" : "#0284C7"} />
                </PetTactilePressable>
              </View>
            </View>

            {/* 养护数值条（轻盈玻璃态胶囊） */}
            <View style={{ flexDirection: "row", gap: 7, paddingHorizontal: 12, paddingTop: 10 }}>
              <CareBar label="饱食" value={care.fullness} color="#FBBF24" icon="restaurant" isDark={isDark} />
              <CareBar label="心情" value={care.mood} color="#38BDF8" icon="happy" isDark={isDark} />
              <CareBar label="好感" value={care.bond} color="#F472B6" icon="heart" isDark={isDark} />
            </View>

            {/* 内嵌微冷灰蓝凹槽对话区（高对比分层，彻底告别白底配白框） */}
            <ChatMessageList
              messages={chatMsgs}
              renderMessage={renderPetMessage}
              maxHeight={chatMaxHeight}
              itemGap={9}
              contentContainerStyle={{ paddingHorizontal: 10, paddingVertical: 10 }}
              emptyComponent={
                <View style={{ alignItems: "center", paddingVertical: 18 }}>
                  <Text
                    style={{
                      fontSize: 11,
                      fontWeight: "600",
                      color: isDark ? "rgba(186,230,253,0.68)" : "#64748B",
                    }}
                  >
                    点下方胶囊或发句话逗逗{personaName}吧～
                  </Text>
                </View>
              }
              header={
                busy ? (
                  <View style={{ alignItems: "flex-start", paddingBottom: 4 }}>
                    <View
                      style={{
                        borderRadius: 14,
                        borderBottomLeftRadius: 4,
                        paddingHorizontal: 11,
                        paddingVertical: 6,
                        backgroundColor: isDark
                          ? "rgba(28,50,82,0.92)"
                          : "#FFFFFF",
                        borderWidth: 1,
                        borderColor: isDark
                          ? "rgba(125,211,252,0.30)"
                          : "rgba(56,189,248,0.42)",
                      }}
                    >
                      <Text
                        style={{
                          fontSize: 10.5,
                          fontWeight: "600",
                          color: isDark ? "#BAE6FD" : "#0369A1",
                        }}
                      >
                        {personaName}正在想回复…
                      </Text>
                    </View>
                  </View>
                ) : null
              }
              style={{
                marginTop: 10,
                marginHorizontal: 12,
                borderRadius: 18,
                borderCurve: "continuous",
                backgroundColor: isDark ? "rgba(6,14,28,0.66)" : "rgba(214,234,248,0.72)",
                borderWidth: 1,
                borderColor: isDark ? "rgba(125,211,252,0.20)" : "rgba(125,211,252,0.52)",
              }}
            />

            {/* 统一去重后的快捷互动栏：左侧横向可滚互动胶囊 + 右侧常驻核心控制「收起」 */}
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                paddingLeft: 12,
                paddingRight: 12,
                paddingTop: 9,
                paddingBottom: 2,
                flexShrink: 0,
              }}
            >
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                style={{ flex: 1, flexGrow: 0, flexShrink: 1 }}
                contentContainerStyle={{ gap: 6, paddingRight: 6, alignItems: "center" }}
              >
                {PET_QUICK_ACTIONS.map((action) => {
                  const textLabel =
                    action.id === "feed" && hungry && action.hungryLabel
                      ? action.hungryLabel
                      : action.label;
                  return (
                    <PetTactilePressable
                      key={action.id}
                      onPress={() => handleQuickActionPress(action.id)}
                      accessibilityRole="button"
                      accessibilityLabel={textLabel}
                      pressedOpacity={0.78}
                      pressedScale={0.96}
                      style={{
                        height: 31,
                        flexDirection: "row",
                        alignItems: "center",
                        justifyContent: "center",
                        gap: 4.5,
                        borderRadius: 999,
                        borderWidth: 1,
                        paddingHorizontal: 10.5,
                        borderColor: isDark
                          ? "rgba(186,230,253,0.24)"
                          : "rgba(56,189,248,0.36)",
                        backgroundColor: isDark
                          ? "rgba(26,45,76,0.82)"
                          : "rgba(255,255,255,0.94)",
                        boxShadow: [
                          {
                            offsetX: 0,
                            offsetY: 1,
                            blurRadius: 4,
                            color: isDark ? "rgba(2,8,20,0.28)" : "rgba(15,41,66,0.06)",
                          },
                        ],
                      }}
                    >
                      <Ionicons name={action.icon} size={12} color={action.accent} />
                      <Text
                        numberOfLines={1}
                        style={{
                          fontSize: 10.5,
                          fontWeight: "700",
                          color: isDark ? "#E0F2FE" : "#0F2942",
                        }}
                      >
                        {textLabel}
                      </Text>
                    </PetTactilePressable>
                  );
                })}
              </ScrollView>

              <View
                style={{
                  width: 1,
                  height: 16,
                  marginHorizontal: 6,
                  backgroundColor: isDark
                    ? "rgba(186,230,253,0.16)"
                    : "rgba(148,163,184,0.32)",
                }}
              />

              <PetTactilePressable
                onPress={dismiss}
                accessibilityRole="button"
                accessibilityLabel="收起桌宠"
                pressedOpacity={0.78}
                pressedScale={0.96}
                style={{
                  flexShrink: 0,
                  height: 31,
                  flexDirection: "row",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 4,
                  borderRadius: 999,
                  borderWidth: 1,
                  paddingHorizontal: 10,
                  borderColor: isDark
                    ? "rgba(148,163,184,0.28)"
                    : "rgba(148,163,184,0.38)",
                  backgroundColor: isDark
                    ? "rgba(30,41,59,0.78)"
                    : "rgba(241,245,249,0.95)",
                }}
              >
                <Ionicons
                  name="moon-outline"
                  size={11.5}
                  color={isDark ? "#CBD5E1" : "#475569"}
                />
                <Text
                  numberOfLines={1}
                  style={{
                    fontSize: 10.5,
                    fontWeight: "700",
                    color: isDark ? "#E2E8F0" : "#334155",
                  }}
                >
                  收起来
                </Text>
              </PetTactilePressable>
            </View>

            {/* 紧凑模式液态玻璃输入框 */}
            <ChatInputBar
              value={input}
              onChangeText={setInput}
              onSend={() => sendChat()}
              busy={busy}
              onStop={stopChatRequest}
              whaleTheme
              compact
              placeholder="跟她说点什么…"
              bottomInset={6}
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
      ) : null}
    </View>
  );
}

function CareBar({
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
        borderRadius: 12,
        borderCurve: "continuous",
        paddingHorizontal: 8,
        paddingVertical: 6.5,
        backgroundColor: isDark ? "rgba(255,255,255,0.06)" : "rgba(255,255,255,0.88)",
        borderWidth: 1,
        borderColor: isDark ? "rgba(186,230,253,0.14)" : "rgba(148,163,184,0.24)",
      }}
    >
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 4 }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 3 }}>
          <Ionicons name={icon} size={10} color={color} />
          <Text numberOfLines={1} style={{ fontSize: 9.5, fontWeight: "600", color: isDark ? "rgba(186,230,253,0.82)" : "#475569" }}>
            {label}
          </Text>
        </View>
        <Text style={{ fontSize: 10, fontWeight: "800", color: isDark ? "#F1F5F9" : "#0F172A" }}>
          {Math.round(value)}
        </Text>
      </View>
      <View
        style={{
          height: 4,
          borderRadius: 99,
          overflow: "hidden",
          backgroundColor: isDark ? "rgba(255,255,255,0.1)" : "rgba(148,163,184,0.22)",
        }}
      >
        <View
          style={{
            width: `${clampNumber(value, 4, 100)}%`,
            height: "100%",
            borderRadius: 99,
            backgroundColor: color,
          }}
        />
      </View>
    </View>
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
    <View
      style={{
        alignItems: isUser ? "flex-end" : "flex-start",
      }}
    >
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
