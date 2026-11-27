import { createRequestSession, type RequestTicket } from "@/utils/requestSession";
import { foregroundStore } from "@/utils/foreground";
import Ionicons from "@expo/vector-icons/Ionicons";
import { LinearGradient } from "expo-linear-gradient";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AppState,
  Keyboard,
  Pressable,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
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

import { PetAnimation } from "@/components/PetAnimation";
import { PetParticles, type PetParticleItem, type PetParticleKind } from "@/components/PetParticles";
import { BACKGROUND_PRESETS, resolveTint } from "@/constants/backgrounds";
import { resolveGlassOpticalProfile } from "@/constants/glassThemes";
import { useAnimationActive } from "@/hooks/useAnimationActive";
import { buildDesktopPetPayload } from "@/hooks/useDesktopPetSync";
import { askWhalePet } from "@/services/ai";
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
import type { ChatMessage, PetActionKind, WhaleAction } from "@/types";
import { bumpHaptic, tapHaptic } from "@/utils/haptics";
import { uid } from "@/utils/id";
import { getDateInfo } from "@/utils/time";
import {
  decideAutonomousBehavior,
  findUpcomingCourse,
  pickPersonaLine,
} from "@/utils/whaleBehavior";
import { renderPersonaText } from "@/utils/whalePersona";

import { WhalePetPopover } from "./WhalePetPopover";
import {
  ACTION_LINES,
  BASE_SIZE,
  EDGE,
  FLOOR_RESERVE,
  IDLE_DELAY_MAX,
  IDLE_DELAY_MIN,
  LOCAL_ACTIONS,
  MAX_THROW_SPEED,
  PANEL_SPRING,
  RATIO,
  SLEEP_AFTER,
  THROW_DEAD_ZONE,
  careHint,
  clampNumber,
  computePanelAnchor,
  isScheduleAction,
  isWhaleAction,
  nowMs,
  petMsg,
  rand,
  randBetween,
  splitPages,
  whalePetStyles as styles,
  type PanelAnchor,
  type PetFrame,
  type PetQuickActionDef,
} from "./whalePetHelpers";

/* eslint-disable react-hooks/immutability, react-hooks/refs --
   Reanimated shared value（坐标 / 速度 / 挤压 / 朝向）本质是跨渲染、跨线程可变的容器，
   手势回调、帧回调与 effect 对其赋值是官方标准用法；手势回调只在事件触发时执行，
   不会在渲染期读 ref。React 编译器的不可变/纯函数假设不适用于这些场景 */

/**
 * 大肥鱼桌宠主舞台（按需懒加载）：
 * 承载桌宠立绘动画、手势抛掷物理、自主巡游与贴边探头、养护心跳与请求会话生命周期；
 * 互动卡片与聊天浮层交由 `WhalePetPopover` 仅在展开时挂载。
 */
export function WhalePetStage() {
  const animationActive = useAnimationActive();
  const reducedMotion = useReducedMotion();
  const hide = useWhalePet((s) => s.hide);
  const care = useWhalePet((s) => s.care);
  const feedPet = useWhalePet((s) => s.feed);
  const patPet = useWhalePet((s) => s.pat);
  const tickPet = useWhalePet((s) => s.tick);
  const setLastPosition = useWhalePet((s) => s.setLastPosition);
  const petScale = useDesktopPet((s) => s.petScale);
  const setAutoFollow = useDesktopPet((s) => s.setAutoFollowBackground);
  const setOverlayMode = useDesktopPet((s) => s.setOverlayMode);
  const refreshDesktop = useDesktopPet((s) => s.refresh);
  const apiKey = useSettings((s) => s.apiKey);
  const setWhalePhrase = useSettings((s) => s.setWhalePhrase);
  const setBackgroundTint = useSettings((s) => s.setBackgroundTint);
  const setBackgroundEffect = useSettings((s) => s.setBackgroundEffect);
  const backgroundTint = useSettings((s) => s.backgroundTint);
  const hasWallpaper = useSettings((s) => !!s.backgroundImage);
  const hydrateVoice = useWhaleVoice((s) => s.hydrate);
  const schedule = useActiveSchedule();
  const schedules = useStore((s) => s.schedules);
  const setChatMsgs = useWhaleMemory((s) => s.setPetMessages);

  useEffect(() => {
    hydrateVoice();
  }, [hydrateVoice]);

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

  const [bubble, setBubble] = useState<string | null>(
    renderPersonaText(
      "{{user}}，我出来啦～摸头、抛团子、拖我都行，点三下或长按打开互动卡",
      useWhalePersona.getState().persona,
    ),
  );
  const [bubbleBelow, setBubbleBelow] = useState(false);
  const [nearRight, setNearRight] = useState(true);
  const [particles, setParticles] = useState<PetParticleItem[]>([]);
  const [snackPos, setSnackPos] = useState<{ x: number; y: number } | null>(null);

  const [chatOpen, setChatOpen] = useState(false);
  const [panelMounted, setPanelMounted] = useState(false);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [chatSession] = useState(createRequestSession);
  const stopChatRequest = useCallback(() => {
    chatSession.cancel();
    setBusy(false);
    stopWhaleVoice();
  }, [chatSession, setBusy]);

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
      const horizontal =
        (targetX < minX.value && boxX.value > minX.value) ||
        (targetX > maxX.value && boxX.value < maxX.value);
      const vertical =
        (targetY < minY.value && boxY.value > minY.value) ||
        (targetY > maxY.value && boxY.value < maxY.value);
      const impact = Math.max(
        horizontal ? Math.abs(e.velocityX) : 0,
        vertical ? Math.abs(e.velocityY) : 0,
      );
      if (impact >= 550 && boundaryClock.value - lastBoundaryHit.value >= 1400) {
        lastBoundaryHit.value = boundaryClock.value;
        runOnJS(onBoundaryHit)(
          impact,
          horizontal
            ? targetX < minX.value
              ? "左边框"
              : "右边框"
            : targetY < minY.value
              ? "上边框"
              : "下边框",
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
  }, [setPanelMounted]);

  /** 从桌宠位置自然舒展玻璃态互动卡片（锚点精准对齐 + 弹簧微位移绽放） */
  const openChat = () => {
    if (chatOpenRef.current) return;
    setPanelAnchor(
      computePanelAnchor({
        px: boxX.value,
        py: boxY.value,
        petSize: SIZE,
        petHeight: H,
        panelW,
        panelH,
        width,
        height,
        insetTop: insets.top,
        insetBottom: insets.bottom,
      }),
    );
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
    if (useWhaleMemory.getState().petMessages.length === 0) {
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
    const prevMsgs = useWhaleMemory.getState().petMessages;
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
    const history = [...prevMsgs, userMsg].map((m) => ({ id: m.id, role: m.role, content: m.content }));
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
          style={[styles.snackPill, { left: snackPos.x, top: snackPos.y }]}
        >
          <Text style={styles.snackEmoji}>🍙</Text>
        </Animated.View>
      ) : null}

      <GestureDetector gesture={pan}>
        <Animated.View
          style={[
            styles.petContainer,
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
              style={[
                styles.needBadge,
                { backgroundColor: hungry ? "rgba(251,191,36,0.95)" : "#38BDF8" },
              ]}
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
              style={[
                styles.floatingBubble,
                {
                  ...(bubbleBelow ? { top: H + 10 } : { bottom: H + 10 }),
                  ...(nearRight ? { right: 0 } : { left: 0 }),
                  backgroundColor: isDark ? "rgba(13,24,44,0.90)" : "rgba(255,255,255,0.94)",
                  borderColor: isDark ? "rgba(186,230,253,0.28)" : "rgba(125,211,252,0.52)",
                  boxShadow: [
                    {
                      offsetX: 0,
                      offsetY: 6,
                      blurRadius: 18,
                      color: glassProfile.shadowColor,
                    },
                  ],
                },
              ]}
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
                style={[
                  styles.floatingBubbleText,
                  { color: isDark ? "#E8F5FF" : "#0F2A43" },
                ]}
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
                  styles.petShadow,
                  { left: SIZE * 0.22, width: SIZE * 0.56 },
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

      {/* 互动浮层与迷你对话：仅在展开时挂载，关闭动画结束后立即卸载 */}
      {panelMounted ? (
        <WhalePetPopover
          isDark={isDark}
          height={height}
          insetTop={insets.top}
          panelW={panelW}
          panelH={panelH}
          panelAnchor={panelAnchor}
          panelProgress={panelProgress}
          glassProfile={glassProfile}
          care={care}
          hungry={hungry}
          input={input}
          busy={busy}
          onChangeInput={setInput}
          onSend={() => sendChat()}
          onStopRequest={stopChatRequest}
          onClose={closeChat}
          onDismiss={dismiss}
          onQuickAction={handleQuickActionPress}
          onQuickDesktopFollow={() => void handleQuickDesktopFollow()}
        />
      ) : null}
    </View>
  );
}

export default WhalePetStage;
