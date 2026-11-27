/* eslint-disable react-hooks/immutability --
   Reanimated 共享值（fade/flightClock/travel/pureAnim/dragCoords/dragActive 等）
   本质是跨渲染、跨线程可变的容器，在 effect 与回调中赋值是官方标准用法，React 编译器的不可变假设不适用 */

import { LinearGradient } from "expo-linear-gradient";
import { StatusBar } from "expo-status-bar";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  BackHandler,
  Image,
  Pressable,
  Text,
  View,
  useWindowDimensions,
  type GestureResponderEvent,
} from "react-native";
import Animated, {
  Easing,
  cancelAnimation,
  runOnJS,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withSequence,
  withSpring,
  withTiming,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Svg, { Circle, Defs, G, Path, RadialGradient, Stop } from "react-native-svg";

import { AtlasSprite } from "@/components/AtlasSprite";
import { NightSkyMessage } from "@/components/NightSkyMessage";
import { BloodMoonRealm } from "@/components/nightSky/BloodMoonRealm";
import {
  FireflySwarm,
  MeteorShower,
  StarDragTrail,
  WhaleSkyCameo,
} from "@/components/nightSky/NightSkyEffects";
import {
  StarAtlasModal,
  WishComposerModal,
} from "@/components/nightSky/NightSkyOverlays";
import {
  ARRIVAL_MS,
  DEPARTURE_MS,
  OWL_BRANCH,
  Owl,
  OwlFlight,
  type OwlStage,
} from "@/components/nightSky/NightSkyOwl";
import {
  AuroraVeil,
  BLOOD_MOON_TAPS,
  BLOOD_MOON_WINDOW_MS,
  Burst,
  CollectStar,
  ConstellationReveal,
  DOTS,
  FIREFLIES,
  FireflyDot,
  HarpStarNode,
  INITIAL_DRAG_COORDS,
  MAX_RECENT_NOTES,
  Moon,
  NIGHT_SPRITES,
  NightMotion,
  ShootingStar,
  SkyPanCanvas,
  SkyTapRipple,
  Twinkle,
  WishMeteor,
  type SkyRippleItem,
} from "@/components/nightSky/NightSkyPrimitives";
import { nightSkyStyles } from "@/components/nightSky/NightSkyStyles";
import { useAnimationActive } from "@/hooks/useAnimationActive";
import {
  playSfx,
  playStarScaleNote,
  risingRate,
} from "@/services/soundEffects";
import { useSettings } from "@/store/useSettings";
import { useWhalePersona } from "@/store/useWhalePersona";
import {
  selectHaptic,
  successHaptic,
  tapHaptic,
  thumpHaptic,
} from "@/utils/haptics";
import {
  DEFAULT_NIGHT_CHRONICLE,
  NIGHT_CONSTELLATIONS,
  TOTAL_STARS,
  WISH_METEOR_LINES,
  addNightWish,
  buildMeteorCoursePool,
  buildWhaleSkyLine,
  formatCourseMeteorPop,
  getCelestialEvent,
  getMoonPhaseInfo,
  getOwlDialogue,
  getScheduleMoodNote,
  loadAndBumpNightChronicle,
  loadNightWishes,
  markWishEchoed,
  matchSecretMelody,
  pickEchoWish,
  pickInitialConstellationIndex,
  pickNextConstellationIndex,
  saveNightChronicle,
  saveNightWishes,
  unlockConstellationInChronicle,
  unlockSecretBadgeInChronicle,
  writeStarDewBlessing,
  type MoonPhaseInfo,
  type NightSkyChronicle,
  type NightSkyWish,
  type SecretBadgeId,
} from "@/utils/nightSkyData";

/* -------------------------------------------------------------------------- */
/*  主星空彩蛋组件                                                             */
/* -------------------------------------------------------------------------- */

export const BLOOD_MOON_ENTRY_LOCK_MS = 3000;
export type BloodMoonPhase = "idle" | "entering" | "active" | "exiting";

export interface NightSkyProps {
  onClose: () => void;
  /** 夜空最深处的那条小径 */
  onEnterFarm?: () => void;
  /** 课表里的课程名：会去重轮播变成流星尾巴上的小标签 */
  courseNames?: string[];
  /** 今日真实课程节数：用于猫头鹰语境共情与夜空暖心提示 */
  todayCourseCount?: number;
}

export function NightSky({
  onClose,
  onEnterFarm,
  courseNames = [],
  todayCourseCount,
}: NightSkyProps) {
  const { width: w, height: h } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const qualityMode = useSettings((s) => s.renderQuality);
  const whalePersona = useWhalePersona((s) => s.persona);

  const [chronicle, setChronicle] = useState<NightSkyChronicle | null>(null);
  const [constellationIdx, setConstellationIdx] = useState(0);
  const [constellationRun, setConstellationRun] = useState(0);
  const [pickOrder, setPickOrder] = useState<number[]>([]);
  const [closing, setClosing] = useState(false);

  const compact = h < 740;
  // 锁住单调不收缩的底部面板高度，彻底消除切语录/出成就时的星图垂直抖动
  const [panelState, setPanelState] = useState(() => ({
    viewport: `${w}x${h}`,
    height: compact ? 268 : 292,
  }));
  const stablePanelHeight =
    panelState.viewport === `${w}x${h}`
      ? panelState.height
      : compact
        ? 268
        : 292;
  const [visitHour] = useState(() => new Date().getHours());
  const [moonInfo, setMoonInfo] = useState<MoonPhaseInfo>(() =>
    getMoonPhaseInfo(new Date()),
  );

  const [owlLanded, setOwlLanded] = useState(false);
  const [followingOwl, setFollowingOwl] = useState(false);
  const [farmHandoff, setFarmHandoff] = useState(false);
  const [owlBounceToken, setOwlBounceToken] = useState(0);
  const [owlHint, setOwlHint] = useState("");
  const [moonCard, setMoonCard] = useState<MoonPhaseInfo | null>(null);
  const [bloodMoonPhase, setBloodMoonPhase] = useState<BloodMoonPhase>("idle");
  const [pureMode, setPureMode] = useState(false);
  const [atlasOpen, setAtlasOpen] = useState(false);
  const [wishOpen, setWishOpen] = useState(false);
  const [wishes, setWishes] = useState<NightSkyWish[]>([]);
  const [wishToken, setWishToken] = useState(0);
  const [wishMeteorVisible, setWishMeteorVisible] = useState(false);
  const [wishText, setWishText] = useState("");
  const [showerToken, setShowerToken] = useState(0);
  const [showerActive, setShowerActive] = useState(false);
  const [showerSeen, setShowerSeen] = useState(false);
  const [swarmToken, setSwarmToken] = useState(0);
  const [swarmActive, setSwarmActive] = useState(false);
  const [skyBanner, setSkyBanner] = useState("");
  const [whaleBubble, setWhaleBubble] = useState("");
  const [ripples, setRipples] = useState<SkyRippleItem[]>([]);

  const flightClock = useSharedValue(0);
  const travel = useSharedValue(0);
  const fade = useSharedValue(0);
  const pureAnim = useSharedValue(0);
  const dragCoords = useSharedValue<number[]>(INITIAL_DRAG_COORDS);
  const dragActive = useSharedValue(0);
  const whaleBubbleAnim = useSharedValue(0);
  const bloodMoonShakeX = useSharedValue(0);
  const bloodMoonShakeY = useSharedValue(0);
  const bloodMoonShock = useSharedValue(0);
  const bloodMoonSweep = useSharedValue(0);
  const bloodMoonVeil = useSharedValue(0);

  const owlTaps = useRef(0);
  const collectedSetRef = useRef<Set<number>>(new Set());
  const chronicleRef = useRef<NightSkyChronicle>(DEFAULT_NIGHT_CHRONICLE);
  const chronicleLoadedRef = useRef(false);
  const unlockedThisSessionRef = useRef<Set<string>>(new Set());
  const sessionBadgesRef = useRef<Set<SecretBadgeId>>(new Set());
  const sessionWishesDeltaRef = useRef(0);
  const sessionMeteorsDeltaRef = useRef(0);
  const wishesRef = useRef<NightSkyWish[]>([]);
  const recentNotesRef = useRef<number[]>([]);
  const moonTapsRef = useRef<number[]>([]);
  const bloodMoonEnteredAtRef = useRef<number>(0);
  const bloodMoonPhaseRef = useRef<BloodMoonPhase>("idle");
  const bloodMoonTransitionTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const bloodMoonHapticTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const whaleTapCountRef = useRef(0);
  const wishCountRef = useRef(0);
  const rippleIdRef = useRef(0);
  const hintTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const moonTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const wishTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const wishMeteorTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const constellationTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const showerTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const swarmTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const bannerTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const whaleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const echoTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const rippleTimers = useRef<Set<ReturnType<typeof setTimeout>>>(new Set());
  const closingRef = useRef(false);

  const awake = useAnimationActive();
  const reduceMotion = useReducedMotion();
  const bloodMoon = bloodMoonPhase !== "idle";
  const bloodMoonRealmMounted =
    bloodMoonPhase === "active" || bloodMoonPhase === "exiting";
  const motionEnabled =
    awake && !reduceMotion && !farmHandoff && bloodMoonPhase === "idle";
  const bloodMoonMotionEnabled = awake && !reduceMotion && !farmHandoff;
  const allowRichDecor = !reduceMotion && qualityMode !== "smooth";
  const allowFullDecor = !reduceMotion && qualityMode === "beautiful";

  const activeConstellation = NIGHT_CONSTELLATIONS[constellationIdx];
  const picked = activeConstellation.spots.map((_, index) =>
    pickOrder.includes(index),
  );
  const lit = pickOrder.length;
  const done = lit >= TOTAL_STARS;
  const allowDragTrail = allowRichDecor && !done;

  const celestial = useMemo(
    () => getCelestialEvent(new Date(), moonInfo),
    [moonInfo],
  );
  const scheduleMoodNote = useMemo(
    () => getScheduleMoodNote(todayCourseCount),
    [todayCourseCount],
  );

  // 单一月相刷新定时器（同时驱动月相视觉、天象事件与大飞鱼彩蛋）
  useEffect(() => {
    if (!motionEnabled) return;
    const timer = setInterval(
      () => setMoonInfo(getMoonPhaseInfo(new Date())),
      60000,
    );
    return () => clearInterval(timer);
  }, [motionEnabled]);

  useEffect(() => {
    const timers = rippleTimers.current;
    return () => {
      if (hintTimer.current) clearTimeout(hintTimer.current);
      if (moonTimer.current) clearTimeout(moonTimer.current);
      if (wishTimer.current) clearTimeout(wishTimer.current);
      if (wishMeteorTimer.current) clearTimeout(wishMeteorTimer.current);
      if (constellationTimer.current) clearTimeout(constellationTimer.current);
      if (showerTimer.current) clearTimeout(showerTimer.current);
      if (swarmTimer.current) clearTimeout(swarmTimer.current);
      if (bannerTimer.current) clearTimeout(bannerTimer.current);
      if (whaleTimer.current) clearTimeout(whaleTimer.current);
      if (echoTimer.current) clearTimeout(echoTimer.current);
      if (bloodMoonTransitionTimer.current) {
        clearTimeout(bloodMoonTransitionTimer.current);
      }
      if (bloodMoonHapticTimer.current) {
        clearTimeout(bloodMoonHapticTimer.current);
      }
      for (const id of timers) clearTimeout(id);
      timers.clear();
    };
  }, []);

  const showOwlHint = useCallback((text: string, durationMs = 3400) => {
    setOwlHint(text);
    if (hintTimer.current) clearTimeout(hintTimer.current);
    hintTimer.current = setTimeout(() => setOwlHint(""), durationMs);
  }, []);

  const showSkyBanner = useCallback((text: string, durationMs = 3000) => {
    setSkyBanner(text);
    if (bannerTimer.current) clearTimeout(bannerTimer.current);
    bannerTimer.current = setTimeout(() => setSkyBanner(""), durationMs);
  }, []);

  const launchWishMeteor = useCallback((bannerText: string, durationMs = 2800) => {
    const next = ++wishCountRef.current;
    setWishToken(next);
    setWishMeteorVisible(true);
    if (wishMeteorTimer.current) clearTimeout(wishMeteorTimer.current);
    wishMeteorTimer.current = setTimeout(() => setWishMeteorVisible(false), 1300);
    setWishText(bannerText);
    if (wishTimer.current) clearTimeout(wishTimer.current);
    wishTimer.current = setTimeout(() => setWishText(""), durationMs);
  }, []);

  const unlockBadge = useCallback((badgeId: SecretBadgeId) => {
    sessionBadgesRef.current.add(badgeId);
    const updated = unlockSecretBadgeInChronicle(chronicleRef.current, badgeId);
    if (updated !== chronicleRef.current) {
      chronicleRef.current = updated;
      if (chronicleLoadedRef.current) {
        setChronicle(updated);
        void saveNightChronicle(updated);
      }
    }
  }, []);

  const spawnRipple = useCallback((x: number, y: number) => {
    if (!Number.isFinite(x) || !Number.isFinite(y)) return;
    const id = ++rippleIdRef.current;
    setRipples((prev) => [...prev.slice(-3), { id, x, y }]);
    const timer = setTimeout(() => {
      rippleTimers.current.delete(timer);
      setRipples((prev) => prev.filter((item) => item.id !== id));
    }, 920);
    rippleTimers.current.add(timer);
  }, []);

  // 读取并推进夜航志（自动迁移旧版来访计数，并合并加载期间已发生的本轮解锁/徽章/统计）
  useEffect(() => {
    let alive = true;
    void loadAndBumpNightChronicle().then((loaded) => {
      if (!alive) return;
      let merged = loaded;
      for (const cid of unlockedThisSessionRef.current) {
        merged = unlockConstellationInChronicle(merged, cid, TOTAL_STARS);
      }
      for (const badgeId of sessionBadgesRef.current) {
        merged = unlockSecretBadgeInChronicle(merged, badgeId);
      }
      if (
        sessionWishesDeltaRef.current > 0 ||
        sessionMeteorsDeltaRef.current > 0 ||
        (chronicleRef.current.owlPathUnlocked && !merged.owlPathUnlocked)
      ) {
        merged = {
          ...merged,
          owlPathUnlocked:
            merged.owlPathUnlocked || chronicleRef.current.owlPathUnlocked,
          wishesSent: merged.wishesSent + sessionWishesDeltaRef.current,
          meteorsTapped:
            merged.meteorsTapped + sessionMeteorsDeltaRef.current,
        };
      }
      chronicleLoadedRef.current = true;
      chronicleRef.current = merged;
      setChronicle(merged);
      if (merged !== loaded) {
        void saveNightChronicle(merged);
      }
      // 仅在尚未开始拾星时根据历史记录选择推荐星象，避免打断刚点下的星星
      if (collectedSetRef.current.size === 0) {
        setConstellationIdx(
          pickInitialConstellationIndex(
            merged.visits,
            merged.unlockedConstellations,
            merged.lastConstellationId,
          ),
        );
      }
    });
    return () => {
      alive = false;
    };
  }, []);

  // 加载历史星愿并在 3.2 秒后触发昔日星愿回响
  useEffect(() => {
    let alive = true;
    void loadNightWishes().then((loaded) => {
      if (!alive) return;
      wishesRef.current = loaded;
      setWishes(loaded);
      const echo = pickEchoWish(loaded);
      if (!echo) return;
      echoTimer.current = setTimeout(() => {
        if (!alive || closingRef.current) return;
        playStarScaleNote(6, { volume: 0.56 });
        launchWishMeteor(`✦ 昔日星愿回响：「${echo.text}」`, 4600);
        const marked = markWishEchoed(wishesRef.current, echo.id);
        wishesRef.current = marked;
        setWishes(marked);
        void saveNightWishes(marked);
      }, 3200);
    });
    return () => {
      alive = false;
      if (echoTimer.current) {
        clearTimeout(echoTimer.current);
        echoTimer.current = null;
      }
    };
  }, [launchWishMeteor]);

  // 集齐七星：触发胜利触感与高音 Do' 星座和弦收束
  useEffect(() => {
    if (!done) return;
    successHaptic();

    // 紧接第 7 颗星的 Si (B5)，约 220ms 后由高音 Do' (C6) 星座和弦自然收束
    constellationTimer.current = setTimeout(() => {
      if (!closingRef.current) {
        playSfx("star_constellation", { volume: 0.76, ignoreCooldown: true });
      }
    }, 220);
    return () => {
      if (constellationTimer.current) {
        clearTimeout(constellationTimer.current);
        constellationTimer.current = null;
      }
    };
  }, [done]);

  const owlStage: OwlStage = followingOwl
    ? "leaving"
    : !done && !owlLanded
      ? "waiting"
      : owlLanded || reduceMotion
        ? "perched"
        : "arriving";

  const landOwl = useCallback(() => setOwlLanded(true), []);
  const travelStyle = useAnimatedStyle(() => ({ opacity: travel.value }));

  useEffect(() => {
    if (!done || owlLanded || reduceMotion || closingRef.current) return;
    flightClock.value = 0;
    flightClock.value = withDelay(
      340,
      withTiming(
        ARRIVAL_MS,
        { duration: ARRIVAL_MS, easing: Easing.linear },
        (finished) => {
          if (finished) runOnJS(landOwl)();
        },
      ),
    );
    return () => cancelAnimation(flightClock);
  }, [done, flightClock, landOwl, owlLanded, reduceMotion]);

  useEffect(() => {
    if (reduceMotion) {
      pureAnim.value = pureMode ? 1 : 0;
      return;
    }
    pureAnim.value = withTiming(pureMode ? 1 : 0, {
      duration: 320,
      easing: Easing.out(Easing.cubic),
    });
    return () => cancelAnimation(pureAnim);
  }, [pureAnim, pureMode, reduceMotion]);

  useEffect(() => {
    if (!whaleBubble) {
      whaleBubbleAnim.value = 0;
      return;
    }
    if (reduceMotion) {
      whaleBubbleAnim.value = 1;
      return;
    }
    whaleBubbleAnim.value = 0;
    whaleBubbleAnim.value = withSpring(1, { damping: 13, stiffness: 185 });
    return () => cancelAnimation(whaleBubbleAnim);
  }, [reduceMotion, whaleBubble, whaleBubbleAnim]);

  useEffect(
    () => () => {
      cancelAnimation(flightClock);
      cancelAnimation(travel);
      cancelAnimation(pureAnim);
      cancelAnimation(dragActive);
      cancelAnimation(dragCoords);
      cancelAnimation(whaleBubbleAnim);
      cancelAnimation(bloodMoonShakeX);
      cancelAnimation(bloodMoonShakeY);
      cancelAnimation(bloodMoonShock);
      cancelAnimation(bloodMoonSweep);
      cancelAnimation(bloodMoonVeil);
    },
    [
      bloodMoonShakeX,
      bloodMoonShakeY,
      bloodMoonShock,
      bloodMoonSweep,
      bloodMoonVeil,
      dragActive,
      dragCoords,
      flightClock,
      pureAnim,
      travel,
      whaleBubbleAnim,
    ],
  );

  const fadeStyle = useAnimatedStyle(() => ({ opacity: fade.value }));
  const sceneStyle = useAnimatedStyle(() => ({
    transform: [
      {
        scale: reduceMotion
          ? 1
          : 1.045 - fade.value * 0.045 + travel.value * 0.06,
      },
      { translateX: (reduceMotion ? 0 : -travel.value * 14) + bloodMoonShakeX.value },
      { translateY: bloodMoonShakeY.value },
    ],
  }));
  const skyShakeStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: bloodMoonShakeX.value },
      { translateY: bloodMoonShakeY.value },
    ],
  }));
  const bloodShockStyle = useAnimatedStyle(() => ({
    opacity: bloodMoonShock.value > 0 ? (1 - bloodMoonShock.value) * 0.85 : 0,
    transform: [{ scale: 0.25 + bloodMoonShock.value * 7.8 }],
  }));
  const bloodSweepStyle = useAnimatedStyle(() => ({
    opacity:
      bloodMoonSweep.value > 0 && bloodMoonSweep.value < 1
        ? Math.sin(bloodMoonSweep.value * Math.PI) * 0.85
        : 0,
    transform: [
      { translateX: (1 - bloodMoonSweep.value) * 260 - 130 },
      { translateY: bloodMoonSweep.value * 140 - 40 },
      { scale: 0.9 + bloodMoonSweep.value * 1.4 },
    ],
  }));
  const bloodVeilStyle = useAnimatedStyle(() => ({
    opacity: bloodMoonVeil.value,
  }));
  const whaleBubbleStyle = useAnimatedStyle(() => ({
    opacity: whaleBubbleAnim.value,
    transform: [
      { translateY: (1 - whaleBubbleAnim.value) * -6 },
      { scale: 0.9 + whaleBubbleAnim.value * 0.1 },
    ],
  }));
  const panelStyle = useAnimatedStyle(() => {
    const enterOpacity = Math.max(0, (fade.value - 0.2) / 0.8);
    const pureVisible = 1 - pureAnim.value;
    return {
      opacity: enterOpacity * pureVisible,
      transform: [
        {
          translateY: reduceMotion
            ? pureAnim.value * 420
            : (1 - fade.value) * 32 + pureAnim.value * (stablePanelHeight + 80),
        },
      ],
    };
  });

  useEffect(() => {
    if (closingRef.current) return;
    fade.value = withTiming(1, {
      duration: reduceMotion ? 180 : 760,
      easing: Easing.out(Easing.cubic),
    });
    return () => cancelAnimation(fade);
  }, [fade, reduceMotion]);

  const close = useCallback(() => {
    if (closingRef.current) return;
    closingRef.current = true;
    setClosing(true);
    cancelAnimation(flightClock);
    fade.value = withTiming(
      0,
      {
        duration: reduceMotion ? 150 : 420,
        easing: Easing.inOut(Easing.cubic),
      },
      (finished) => {
        if (finished) runOnJS(onClose)();
      },
    );
  }, [fade, flightClock, onClose, reduceMotion]);

  const handleRequestExitBloodMoon = useCallback(() => {
    if (closingRef.current) return;
    if (bloodMoonPhaseRef.current !== "active") return;
    bloodMoonPhaseRef.current = "exiting";
    setBloodMoonPhase("exiting");
    tapHaptic();
    playSfx("horror_banish", { volume: 0.72, ignoreCooldown: true });
  }, []);

  const handleBloodMoonExited = useCallback(() => {
    bloodMoonPhaseRef.current = "idle";
    setBloodMoonPhase("idle");
    moonTapsRef.current = [];
    playStarScaleNote(4, { volume: 0.48 });
    showSkyBanner("银月复明，清辉重回夜空。", 2600);
    if (owlStage === "perched") {
      showOwlHint("银月回来啦，晚风也跟着温柔下来了。", 2800);
    }
  }, [owlStage, showOwlHint, showSkyBanner]);

  useEffect(() => {
    const subscription = BackHandler.addEventListener(
      "hardwareBackPress",
      () => {
        if (
          bloodMoonPhaseRef.current === "entering" ||
          bloodMoonPhaseRef.current === "exiting"
        ) {
          return true;
        }
        if (bloodMoonPhaseRef.current === "active") {
          if (
            Date.now() - bloodMoonEnteredAtRef.current <
            BLOOD_MOON_ENTRY_LOCK_MS
          ) {
            return true;
          }
          handleRequestExitBloodMoon();
          return true;
        }
        if (atlasOpen) {
          setAtlasOpen(false);
          return true;
        }
        if (wishOpen) {
          setWishOpen(false);
          return true;
        }
        if (pureMode) {
          setPureMode(false);
          return true;
        }
        close();
        return true;
      },
    );
    return () => subscription.remove();
  }, [atlasOpen, close, handleRequestExitBloodMoon, pureMode, wishOpen]);

  const openFarm = useCallback(() => {
    if (!onEnterFarm) {
      onClose();
      return;
    }
    setFarmHandoff(true);
    onEnterFarm();
    fade.value = withDelay(
      600,
      withTiming(0, { duration: 0 }, (finished) => {
        if (finished) runOnJS(onClose)();
      }),
    );
  }, [fade, onClose, onEnterFarm]);

  const enterFarm = useCallback(() => {
    if (closingRef.current) return;
    closingRef.current = true;
    setClosing(true);
    setOwlHint("");
    setFollowingOwl(true);

    if (done) {
      void writeStarDewBlessing(activeConstellation);
    }

    if (!chronicleRef.current.owlPathUnlocked) {
      const updated = { ...chronicleRef.current, owlPathUnlocked: true };
      chronicleRef.current = updated;
      if (chronicleLoadedRef.current) {
        setChronicle(updated);
        void saveNightChronicle(updated);
      }
    }

    flightClock.value = 0;
    if (!reduceMotion) {
      flightClock.value = withTiming(DEPARTURE_MS, {
        duration: DEPARTURE_MS,
        easing: Easing.linear,
      });
    }
    travel.value = withDelay(
      reduceMotion ? 0 : DEPARTURE_MS - 190,
      withTiming(
        1,
        {
          duration: reduceMotion ? 150 : 430,
          easing: Easing.inOut(Easing.cubic),
        },
        (finished) => {
          if (finished) runOnJS(openFarm)();
        },
      ),
    );
  }, [activeConstellation, done, flightClock, openFarm, reduceMotion, travel]);

  const handleSelectConstellation = useCallback((idx: number) => {
    if (closingRef.current) return;
    if (idx < 0 || idx >= NIGHT_CONSTELLATIONS.length) return;
    tapHaptic();
    collectedSetRef.current = new Set();
    recentNotesRef.current = [];
    setPickOrder([]);
    setConstellationIdx(idx);
    setConstellationRun((prev) => prev + 1);
    setAtlasOpen(false);
    playStarScaleNote(0, { volume: 0.45 });
  }, []);

  const handleNextConstellation = useCallback(() => {
    if (closingRef.current) return;
    const nextIdx = pickNextConstellationIndex(
      constellationIdx,
      chronicleRef.current.unlockedConstellations,
    );
    handleSelectConstellation(nextIdx);
  }, [constellationIdx, handleSelectConstellation]);

  const handleCollectStar = useCallback(
    (spotIndex: number) => {
      if (closingRef.current) return;
      if (collectedSetRef.current.has(spotIndex)) return;
      const stepIndex = collectedSetRef.current.size;
      collectedSetRef.current.add(spotIndex);
      tapHaptic();
      playStarScaleNote(stepIndex, { volume: 0.74 });
      setPickOrder((prev) =>
        prev.includes(spotIndex) ? prev : [...prev, spotIndex],
      );
      if (collectedSetRef.current.size >= TOTAL_STARS) {
        const cid = activeConstellation.id;
        if (!unlockedThisSessionRef.current.has(cid)) {
          unlockedThisSessionRef.current.add(cid);
          const updated = unlockConstellationInChronicle(
            chronicleRef.current,
            cid,
            TOTAL_STARS,
          );
          chronicleRef.current = updated;
          if (chronicleLoadedRef.current) {
            setChronicle(updated);
            void saveNightChronicle(updated);
          }
        }
      }
    },
    [activeConstellation.id],
  );

  const triggerWishMeteor = useCallback(() => {
    if (closingRef.current) return;
    selectHaptic();
    playStarScaleNote(6, { volume: 0.62 });
    const lineIdx = wishCountRef.current % WISH_METEOR_LINES.length;
    launchWishMeteor(WISH_METEOR_LINES[lineIdx], 2800);
  }, [launchWishMeteor]);

  const openWishComposer = useCallback(() => {
    if (closingRef.current) return;
    selectHaptic();
    setWishOpen(true);
  }, []);

  const handleCloseWish = useCallback(() => setWishOpen(false), []);
  const handleOpenAtlas = useCallback(() => {
    if (closingRef.current) return;
    tapHaptic();
    setAtlasOpen(true);
  }, []);
  const handleCloseAtlas = useCallback(() => setAtlasOpen(false), []);

  const handleTogglePureMode = useCallback(() => {
    if (closingRef.current) return;
    tapHaptic();
    setPureMode((prev) => !prev);
  }, []);

  const handleEnterPureMode = useCallback(() => {
    if (closingRef.current) return;
    tapHaptic();
    setPureMode(true);
  }, []);

  const handleExitPureMode = useCallback(() => {
    if (closingRef.current) return;
    tapHaptic();
    setPureMode(false);
  }, []);

  const handleSendWish = useCallback(
    (text: string) => {
      if (closingRef.current) return;
      if (!text.trim()) return;
      const nextList = addNightWish(
        wishesRef.current,
        text,
        activeConstellation.name,
      );
      wishesRef.current = nextList;
      setWishes(nextList);
      void saveNightWishes(nextList);

      sessionWishesDeltaRef.current += 1;
      sessionBadgesRef.current.add("wish-keeper");
      const withWish = unlockSecretBadgeInChronicle(
        {
          ...chronicleRef.current,
          wishesSent: chronicleRef.current.wishesSent + 1,
        },
        "wish-keeper",
      );
      chronicleRef.current = withWish;
      if (chronicleLoadedRef.current) {
        setChronicle(withWish);
        void saveNightChronicle(withWish);
      }

      setWishOpen(false);
      selectHaptic();
      playStarScaleNote(6, { volume: 0.66 });
      const whisper =
        WISH_METEOR_LINES[wishCountRef.current % WISH_METEOR_LINES.length];
      launchWishMeteor(`✦ ${whisper}`, 3200);
    },
    [activeConstellation.name, launchWishMeteor],
  );

  const handleQuickMeteor = useCallback(() => {
    setWishOpen(false);
    triggerWishMeteor();
  }, [triggerWishMeteor]);

  const handleSkyPress = useCallback(
    (event: GestureResponderEvent) => {
      if (closingRef.current || !allowRichDecor) return;
      const x = event.nativeEvent.pageX ?? event.nativeEvent.locationX;
      const y = event.nativeEvent.pageY ?? event.nativeEvent.locationY;
      if (!Number.isFinite(x) || !Number.isFinite(y)) return;
      tapHaptic();
      spawnRipple(x, y);
    },
    [allowRichDecor, spawnRipple],
  );

  const handleMoonInspect = useCallback(
    (info: MoonPhaseInfo) => {
      if (closingRef.current) return;
      const now = Date.now();
      if (
        bloodMoonPhaseRef.current !== "idle" ||
        now - bloodMoonEnteredAtRef.current < BLOOD_MOON_ENTRY_LOCK_MS
      ) {
        return;
      }

      setMoonCard(info);
      if (moonTimer.current) clearTimeout(moonTimer.current);
      moonTimer.current = setTimeout(() => setMoonCard(null), 3600);

      const recent = moonTapsRef.current.filter(
        (ts) => now - ts <= BLOOD_MOON_WINDOW_MS,
      );
      recent.push(now);
      moonTapsRef.current = recent.slice(-BLOOD_MOON_TAPS);

      if (moonTapsRef.current.length >= BLOOD_MOON_TAPS) {
        moonTapsRef.current = [];
        if (moonTimer.current) {
          clearTimeout(moonTimer.current);
          moonTimer.current = null;
        }
        setMoonCard(null);
        bloodMoonEnteredAtRef.current = now;
        bloodMoonPhaseRef.current = "entering";
        setBloodMoonPhase("entering");
        unlockBadge("blood-moon");

        thumpHaptic();
        playSfx("horror_appear", {
          volume: 0.78,
          ignoreCooldown: true,
        });
        if (bloodMoonHapticTimer.current) {
          clearTimeout(bloodMoonHapticTimer.current);
        }
        bloodMoonHapticTimer.current = setTimeout(() => {
          if (bloodMoonPhaseRef.current === "entering") thumpHaptic();
        }, 480);

        const transitionMs = reduceMotion ? 260 : 1500;
        if (!reduceMotion) {
          bloodMoonShakeX.value = withSequence(
            withTiming(-6, { duration: 55 }),
            withTiming(6, { duration: 60 }),
            withTiming(-5, { duration: 60 }),
            withTiming(4, { duration: 60 }),
            withTiming(-3, { duration: 70 }),
            withTiming(2, { duration: 75 }),
            withTiming(0, { duration: 120 }),
          );
          bloodMoonShakeY.value = withSequence(
            withTiming(4, { duration: 55 }),
            withTiming(-5, { duration: 60 }),
            withTiming(4, { duration: 60 }),
            withTiming(-3, { duration: 60 }),
            withTiming(2, { duration: 75 }),
            withTiming(0, { duration: 120 }),
          );
          bloodMoonShock.value = 0;
          bloodMoonShock.value = withTiming(1, {
            duration: 1120,
            easing: Easing.out(Easing.cubic),
          });
          bloodMoonSweep.value = 0;
          bloodMoonSweep.value = withTiming(1, {
            duration: 1050,
            easing: Easing.inOut(Easing.cubic),
          });
          bloodMoonVeil.value = 0;
          bloodMoonVeil.value = withSequence(
            withTiming(0.48, { duration: 160 }),
            withTiming(0.14, { duration: 180 }),
            withTiming(0.76, { duration: 170 }),
            withTiming(0.32, { duration: 220 }),
            withTiming(0.96, {
              duration: 680,
              easing: Easing.inOut(Easing.cubic),
            }),
          );
        } else {
          bloodMoonVeil.value = 0.85;
        }

        if (bloodMoonTransitionTimer.current) {
          clearTimeout(bloodMoonTransitionTimer.current);
        }
        bloodMoonTransitionTimer.current = setTimeout(() => {
          bloodMoonTransitionTimer.current = null;
          if (closingRef.current) return;
          bloodMoonPhaseRef.current = "active";
          setBloodMoonPhase("active");
          bloodMoonShakeX.value = 0;
          bloodMoonShakeY.value = 0;
          bloodMoonShock.value = 0;
          bloodMoonSweep.value = 0;
          bloodMoonVeil.value = 0;
        }, transitionMs);
        return;
      }

      tapHaptic();
      playStarScaleNote(4, { volume: 0.48 });
    },
    [
      bloodMoonShakeX,
      bloodMoonShakeY,
      bloodMoonShock,
      bloodMoonSweep,
      bloodMoonVeil,
      reduceMotion,
      unlockBadge,
    ],
  );

  const handlePlayHarpNote = useCallback(
    (noteIndex: number) => {
      if (closingRef.current) return;
      tapHaptic();
      playStarScaleNote(noteIndex, { volume: 0.72 });

      const nextNotes = [...recentNotesRef.current, noteIndex].slice(
        -MAX_RECENT_NOTES,
      );
      recentNotesRef.current = nextNotes;
      const match = matchSecretMelody(nextNotes);
      if (!match) return;

      recentNotesRef.current = [];
      unlockBadge(match.badgeId);

      if (match.id === "twinkle") {
        setShowerSeen(true);
        if (allowRichDecor) {
          setShowerToken((prev) => prev + 1);
          setShowerActive(true);
          if (showerTimer.current) clearTimeout(showerTimer.current);
          showerTimer.current = setTimeout(() => setShowerActive(false), 2600);
        }
        playSfx("star_constellation", { volume: 0.8, ignoreCooldown: true });
        successHaptic();
        showSkyBanner(match.message, 3800);
      } else if (match.id === "maj7") {
        if (allowRichDecor) {
          setSwarmToken((prev) => prev + 1);
          setSwarmActive(true);
          if (swarmTimer.current) clearTimeout(swarmTimer.current);
          swarmTimer.current = setTimeout(() => setSwarmActive(false), 2400);
        }
        successHaptic();
        setOwlBounceToken((prev) => prev + 1);
        showOwlHint(match.message, 3800);
        showSkyBanner(`✦ ${match.title}`, 3200);
      }
    },
    [allowRichDecor, showOwlHint, showSkyBanner, unlockBadge],
  );

  const handlePopCourseMeteor = useCallback(
    (label: string, x: number, y: number) => {
      if (closingRef.current) return;
      selectHaptic();
      playStarScaleNote(5, { volume: 0.64 });
      if (!reduceMotion) {
        spawnRipple(x, y);
      }
      sessionMeteorsDeltaRef.current += 1;
      const updated: NightSkyChronicle = {
        ...chronicleRef.current,
        meteorsTapped: chronicleRef.current.meteorsTapped + 1,
      };
      chronicleRef.current = updated;
      if (chronicleLoadedRef.current) {
        setChronicle(updated);
        void saveNightChronicle(updated);
      }

      const quip = formatCourseMeteorPop(
        label,
        activeConstellation.name,
        updated.meteorsTapped,
      );
      showSkyBanner(quip, 2800);
    },
    [activeConstellation.name, reduceMotion, showSkyBanner, spawnRipple],
  );

  const handleWhaleTap = useCallback(() => {
    if (closingRef.current) return;
    const tapIndex = whaleTapCountRef.current;
    whaleTapCountRef.current += 1;
    const line = buildWhaleSkyLine({
      whaleName: whalePersona.name,
      userName: whalePersona.userName,
      tsundere: whalePersona.traits.tsundere,
      constellationName: activeConstellation.name,
      tapCount: tapIndex,
    });
    playSfx(
      line.mood === "tsun" ? "whale_cute_tsun" : "whale_cute_happy",
      { volume: 0.72 },
    );
    tapHaptic();
    unlockBadge("whale-watcher");
    setWhaleBubble(line.text);
    if (whaleTimer.current) clearTimeout(whaleTimer.current);
    whaleTimer.current = setTimeout(() => setWhaleBubble(""), 4200);
  }, [
    activeConstellation.name,
    unlockBadge,
    whalePersona.name,
    whalePersona.traits.tsundere,
    whalePersona.userName,
  ]);

  const coursePool = useMemo(
    () => buildMeteorCoursePool(courseNames),
    [courseNames],
  );
  const meteorLaneCount = reduceMotion
    ? 0
    : qualityMode === "smooth"
      ? 1
      : celestial.meteorRateBoost
        ? 3
        : 2;

  const moonSize = compact ? 76 : 102;
  const moonTop = insets.top + 34;
  const moonRight = 24;
  const moonCx = w - moonRight - moonSize / 2;
  const moonCy = moonTop + moonSize / 2;
  const owlLeft = Math.max(12, w - moonRight - 102);
  const owlTop = moonTop + moonSize - 5;
  const branchWidth = w - owlLeft + 76;
  const skyTop = owlTop + 106;
  const skyBottom = Math.max(
    skyTop + 60,
    h - insets.bottom - stablePanelHeight - (compact ? 26 : 42),
  );
  const starY = (y: number) => skyTop + y * (skyBottom - skyTop);

  const constellationPoints = useMemo(
    () =>
      activeConstellation.spots.map((spot) => ({
        x: spot.x * w,
        y: skyTop + spot.y * (skyBottom - skyTop),
      })),
    [activeConstellation.spots, skyBottom, skyTop, w],
  );

  useEffect(() => {
    if (done || !allowRichDecor) {
      dragActive.value = 0;
      dragCoords.value = INITIAL_DRAG_COORDS;
    }
  }, [allowRichDecor, done, dragActive, dragCoords]);

  const pickedTrailPoints = pickOrder.map(
    (idx) => activeConstellation.spots[idx],
  );
  const unlockedCount = chronicle?.unlockedConstellations.length ?? 0;
  const owlLines = useMemo(
    () =>
      getOwlDialogue({
        hour: visitHour,
        visits: chronicle?.visits ?? 1,
        owlPathUnlocked: chronicle?.owlPathUnlocked ?? false,
        constellationName: activeConstellation.name,
        todayCourseCount,
        sleepy: celestial.sleepyOwl,
      }),
    [
      activeConstellation.name,
      celestial.sleepyOwl,
      chronicle?.owlPathUnlocked,
      chronicle?.visits,
      todayCourseCount,
      visitHour,
    ],
  );
  const owlTapsNeeded = owlLines.length + 1;

  const handleOwlTap = useCallback(() => {
    setOwlBounceToken((prev) => prev + 1);
    const n = owlTaps.current + 1;
    owlTaps.current = n;
    if (n >= owlTapsNeeded) {
      thumpHaptic();
      playSfx("owl_hoot", { volume: 0.74, ignoreCooldown: true });
      enterFarm();
      return;
    }
    tapHaptic();
    playSfx("owl_hoot", {
      rate: risingRate(n - 1, 0.05, 0.96),
      volume: 0.68,
    });
    showOwlHint(owlLines[n - 1] ?? "", 3400);
  }, [enterFarm, owlLines, owlTapsNeeded, showOwlHint]);

  const showWhaleCameo =
    allowRichDecor &&
    (moonInfo.index === 4 ||
      unlockedCount >= NIGHT_CONSTELLATIONS.length ||
      showerSeen ||
      (chronicle !== null && chronicle.visits > 0 && chronicle.visits % 3 === 0));

  const twinkleDots = useMemo(() => {
    if (!allowRichDecor) return [];
    const step = allowFullDecor ? 3 : 4;
    return DOTS.filter((dot) => dot.id % step === 0);
  }, [allowFullDecor, allowRichDecor]);

  const staticDots = useMemo(() => {
    if (!allowRichDecor) return DOTS;
    const step = allowFullDecor ? 3 : 4;
    return DOTS.filter((dot) => dot.id % step !== 0);
  }, [allowFullDecor, allowRichDecor]);

  const activeFireflies = useMemo(() => {
    if (!allowRichDecor) return [];
    return FIREFLIES.slice(0, allowFullDecor ? 10 : 6);
  }, [allowFullDecor, allowRichDecor]);

  const headerMaxWidth = Math.max(176, w - moonRight - moonSize - 32);

  return (
    <NightMotion.Provider value={motionEnabled}>
      <Animated.View
        accessibilityViewIsModal
        style={[nightSkyStyles.rootOverlay, fadeStyle]}
      >
        <StatusBar style="light" />

        <LinearGradient
          colors={["#03060F", "#071022", "#0E1A33"]}
          start={{ x: 0.2, y: 0 }}
          end={{ x: 0.85, y: 1 }}
          style={nightSkyStyles.fill}
        />

        {!bloodMoonRealmMounted ? (
          <Animated.View style={[nightSkyStyles.fill, skyShakeStyle]}>
            <Animated.Image
              pointerEvents="none"
              source={require("../../assets/images/night-forest-v2.webp")}
              resizeMode="cover"
              fadeDuration={0}
              style={[
                nightSkyStyles.absolute,
                { width: w, height: h, opacity: 0.7 },
                sceneStyle,
              ]}
            />
            <LinearGradient
              pointerEvents="none"
              colors={["rgba(3,6,15,0.12)", "transparent", "rgba(3,6,15,0.7)"]}
              style={[nightSkyStyles.absolute, { width: w, height: h }]}
            />

            {bloodMoon ? (
              <View pointerEvents="none" style={nightSkyStyles.bloodMoonTint} />
            ) : null}

            {allowRichDecor ? (
              <AuroraVeil
                w={w}
                h={h}
                rich={allowFullDecor}
                auroraPrimary={celestial.auroraPrimary}
                auroraSecondary={celestial.auroraSecondary}
              />
            ) : null}

            {/* 地平线处的冷光 */}
            <View
              pointerEvents="none"
              style={{
                position: "absolute",
                bottom: -180,
                left: -60,
                width: w * 0.95,
                height: w * 0.95,
                borderRadius: w,
                backgroundColor: "rgba(56,189,248,0.06)",
              }}
            />

            {/* 多光谱冷暖星野 + 四芒十字星辉（单层静态 SVG 合批渲染） */}
            <Svg
              pointerEvents="none"
              width={w}
              height={h}
              style={nightSkyStyles.absolute}
            >
              {staticDots.map((dot) => {
                const cx = dot.x * w;
                const cy = dot.y * h;
                const baseOpacity = 0.2 + (dot.id % 5) * 0.11;
                return dot.cross ? (
                  <G key={dot.id} opacity={Math.min(0.85, baseOpacity + 0.18)}>
                    <Path
                      d={`M${cx - dot.r * 3.2} ${cy} L${cx + dot.r * 3.2} ${cy} M${cx} ${cy - dot.r * 3.2} L${cx} ${cy + dot.r * 3.2}`}
                      stroke={dot.color}
                      strokeWidth={0.7}
                      strokeLinecap="round"
                    />
                    <Circle cx={cx} cy={cy} r={dot.r * 0.9} fill="#FFFFFF" />
                  </G>
                ) : (
                  <Circle
                    key={dot.id}
                    cx={cx}
                    cy={cy}
                    r={dot.r}
                    fill={dot.color}
                    opacity={baseOpacity}
                  />
                );
              })}
            </Svg>

            {twinkleDots.map((d) => (
              <Twinkle
                key={d.id}
                x={d.x}
                y={d.y}
                r={d.r}
                delay={d.delay}
                dur={d.dur}
                color={d.color}
              />
            ))}

            {/* 林间流萤 */}
            {activeFireflies.map((f) => (
              <FireflyDot
                key={f.id}
                x={f.x}
                y={f.y}
                size={f.size}
                dx={f.dx}
                dy={f.dy}
                delay={f.delay}
                dur={f.dur}
                w={w}
                h={h}
              />
            ))}

            {ripples.map((r) => (
              <SkyTapRipple key={r.id} x={r.x} y={r.y} />
            ))}

            {/* 拾星画布与划星手势容器：轻触泛涟漪、长按写星愿、滑动连星零 JS 帧开销 */}
            <SkyPanCanvas
              constellationKey={`${activeConstellation.id}-${constellationRun}`}
              done={done}
              disabled={closing || atlasOpen || wishOpen || bloodMoon}
              allowDragTrail={allowDragTrail}
              constellationPoints={constellationPoints}
              pickOrder={pickOrder}
              dragCoords={dragCoords}
              dragActive={dragActive}
              onCollectStar={handleCollectStar}
              onSkyPress={handleSkyPress}
              onSkyLongPress={openWishComposer}
            >
              {/* 拾星轨迹预览（未完成时按实际顺序虚线连缀） */}
              <Svg
                pointerEvents="none"
                width={w}
                height={h}
                style={nightSkyStyles.absolute}
              >
                {!done && pickedTrailPoints.length > 1 ? (
                  <Path
                    d={pickedTrailPoints
                      .map((s, i) => `${i ? "L" : "M"}${s.x * w} ${starY(s.y)}`)
                      .join(" ")}
                    stroke="rgba(186,211,255,0.36)"
                    strokeWidth="1.1"
                    strokeDasharray="3 6"
                    fill="none"
                  />
                ) : null}
                {!done
                  ? pickedTrailPoints.map((s, idx) => (
                      <Circle
                        key={`trail-${idx}`}
                        cx={s.x * w}
                        cy={starY(s.y)}
                        r="2.6"
                        fill="#FDE9B2"
                      />
                    ))
                  : null}
              </Svg>

              {/* 七颗可拾取星星 */}
              {activeConstellation.spots.map((s, i) => (
                <CollectStar
                  key={`${activeConstellation.id}-${constellationRun}-${i}`}
                  spotIndex={i}
                  x={s.x}
                  y={starY(s.y) / h}
                  s={s.s}
                  w={w}
                  h={h}
                  collected={picked[i]}
                  onCollect={handleCollectStar}
                />
              ))}
            </SkyPanCanvas>

            {/* 指尖划星光轨（仅未完成且允许丰富动效时挂载） */}
            {allowDragTrail ? (
              <StarDragTrail coords={dragCoords} active={dragActive} />
            ) : null}

            {/* 课程流星轮播（有课程名时轻点可寄放） */}
            {Array.from({ length: meteorLaneCount }, (_, i) => (
              <ShootingStar
                key={`meteor-lane-${i}`}
                w={w}
                laneIndex={i}
                baseTop={insets.top + 118 + i * 94}
                coursePool={coursePool}
                onPop={handlePopCourseMeteor}
              />
            ))}

            {wishMeteorVisible ? (
              <WishMeteor token={wishToken} w={w} top={insets.top + 92} />
            ) : null}

            {showerActive && allowRichDecor ? (
              <MeteorShower
                key={showerToken}
                w={w}
                insetTop={insets.top}
                reduced={!allowRichDecor}
              />
            ) : null}

            {swarmActive && allowRichDecor ? (
              <FireflySwarm
                key={swarmToken}
                w={w}
                h={h}
                reduced={!allowRichDecor}
              />
            ) : null}

            {showWhaleCameo ? (
              <WhaleSkyCameo
                visible={showWhaleCameo}
                w={w}
                top={insets.top + (compact ? 94 : 110)}
                motion={motionEnabled}
                onTap={handleWhaleTap}
              />
            ) : null}

            {/* 真实月相（连点 7 次触发血月月蚀，进入期间锁定防误触） */}
            <Moon
              lit={lit}
              top={moonTop}
              right={moonRight}
              size={moonSize}
              phaseInfo={moonInfo}
              bloodMoon={bloodMoon}
              locked={bloodMoon}
              onInspect={handleMoonInspect}
            />

            {/* 月相笺浮层 */}
            {moonCard ? (
              <View
                pointerEvents="none"
                style={[
                  nightSkyStyles.moonCard,
                  {
                    top: moonTop + 8,
                    right: moonRight + moonSize + 10,
                    maxWidth: Math.max(140, w - moonRight - moonSize - 34),
                    borderColor: "rgba(233,210,178,0.34)",
                  },
                ]}
              >
                <Text
                  style={[nightSkyStyles.moonCardTitle, { color: "#FDE68A" }]}
                >
                  {`${moonCard.name} · 月龄 ${moonCard.ageDays} 天 · 光度 ${Math.round(moonCard.illumination * 100)}%`}
                </Text>
                <Text style={nightSkyStyles.moonCardNote}>
                  {`「${moonCard.note}」`}
                </Text>
              </View>
            ) : null}

            {/* 标题、星图入口、天象徽标与许愿按钮 */}
            <View
              style={[
                nightSkyStyles.headerWrap,
                { top: insets.top + 24, maxWidth: headerMaxWidth },
              ]}
            >
              <View style={nightSkyStyles.headerRow}>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={
                    pureMode ? "退出纯净观星模式" : "切换纯净观星模式"
                  }
                  disabled={closing}
                  hitSlop={8}
                  onPress={handleTogglePureMode}
                  style={({ pressed }) => ({
                    opacity: pressed ? 0.68 : pureMode ? 0.56 : 1,
                  })}
                >
                  <Text style={nightSkyStyles.nocturneText}>NOCTURNE</Text>
                </Pressable>
                {!pureMode ? (
                  <>
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel="打开星愿胶囊，写下或召唤许愿流星"
                      disabled={closing}
                      hitSlop={8}
                      onPress={openWishComposer}
                      style={({ pressed }) => [
                        nightSkyStyles.wishChip,
                        {
                          backgroundColor: pressed
                            ? "rgba(253,230,138,0.2)"
                            : "rgba(253,230,138,0.08)",
                        },
                      ]}
                    >
                      <Text style={nightSkyStyles.wishChipText}>✦ 许愿</Text>
                    </Pressable>
                    {celestial.badge ? (
                      <View
                        pointerEvents="none"
                        style={nightSkyStyles.celestialBadge}
                      >
                        <Text style={nightSkyStyles.celestialBadgeText}>
                          {celestial.badge}
                        </Text>
                      </View>
                    ) : null}
                  </>
                ) : null}
              </View>

              {!pureMode ? (
                <View style={nightSkyStyles.chronicleRow}>
                  <Text style={nightSkyStyles.chronicleText}>
                    {chronicle
                      ? `第 ${chronicle.visits} 次夜航 ·`
                      : "夜航星图加载中…"}
                  </Text>
                  {chronicle ? (
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={`打开星图录，已点亮 ${unlockedCount} 个星座`}
                      disabled={closing}
                      hitSlop={8}
                      onPress={handleOpenAtlas}
                      style={({ pressed }) => [
                        nightSkyStyles.atlasChip,
                        {
                          backgroundColor: pressed
                            ? "rgba(125,211,252,0.2)"
                            : "rgba(125,211,252,0.08)",
                        },
                      ]}
                    >
                      <Text style={nightSkyStyles.atlasChipText}>
                        {`星图 ${unlockedCount}/${NIGHT_CONSTELLATIONS.length}`}
                      </Text>
                    </Pressable>
                  ) : null}
                </View>
              ) : null}

              {wishText ? (
                <Text style={nightSkyStyles.wishStatusText}>{wishText}</Text>
              ) : null}
            </View>

            {/* 浮空轻提示横幅（隐藏旋律 / 课程流星寄放） */}
            {skyBanner ? (
              <View
                pointerEvents="none"
                style={[nightSkyStyles.skyBannerWrap, { top: skyTop - 16 }]}
              >
                <View style={nightSkyStyles.skyBannerPill}>
                  <Text numberOfLines={2} style={nightSkyStyles.skyBannerText}>
                    {skyBanner}
                  </Text>
                </View>
              </View>
            ) : null}

            {/* 星海大肥鱼星光透亮玻璃浮泡 */}
            {whaleBubble ? (
              <Animated.View
                pointerEvents="none"
                style={[
                  nightSkyStyles.whaleBubbleWrap,
                  { top: insets.top + (compact ? 186 : 204) },
                  whaleBubbleStyle,
                ]}
              >
                <Svg
                  width={16}
                  height={10}
                  viewBox="0 0 16 10"
                  style={nightSkyStyles.whaleBubblePointer}
                >
                  <Path
                    d="M1 10 L8 1.5 L15 10 Z"
                    fill="#0D1B3E"
                    stroke="rgba(125,211,252,0.52)"
                    strokeWidth={1}
                  />
                </Svg>
                <View
                  style={[
                    nightSkyStyles.whaleBubbleOuter,
                    { maxWidth: Math.min(316, w - 44) },
                  ]}
                >
                  <LinearGradient
                    colors={[
                      "rgba(13,27,62,0.94)",
                      "rgba(8,17,42,0.92)",
                      "rgba(19,26,58,0.94)",
                    ]}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 1 }}
                    style={nightSkyStyles.whaleBubbleGradient}
                  >
                    <View style={nightSkyStyles.whaleBubbleInner}>
                      <View style={nightSkyStyles.whaleBubbleBadge}>
                        <Text style={nightSkyStyles.whaleBubbleBadgeText}>
                          ✦ 大肥鱼 · 星海漫游
                        </Text>
                      </View>
                      <Text style={nightSkyStyles.whaleBubbleText}>
                        {whaleBubble}
                      </Text>
                    </View>
                  </LinearGradient>
                </View>
              </Animated.View>
            ) : null}

            {/* 七星点亮后的真实星象连线、星屑绽放与可演奏星空八音盒星键 */}
            {done ? (
              <>
                <ConstellationReveal
                  constellation={activeConstellation}
                  points={constellationPoints}
                  width={w}
                  height={h}
                />
                {constellationPoints.map((pt, spotIdx) => {
                  const noteIndex = Math.max(0, pickOrder.indexOf(spotIdx));
                  return (
                    <HarpStarNode
                      key={`harp-${activeConstellation.id}-${constellationRun}-${spotIdx}`}
                      cx={pt.x}
                      cy={pt.y}
                      noteIndex={noteIndex}
                      onPlay={handlePlayHarpNote}
                    />
                  );
                })}
                <Burst
                  key={`burst-${activeConstellation.id}-${constellationRun}`}
                  cx={moonCx}
                  cy={moonCy}
                />
              </>
            ) : null}

            {/* 枝桠与猫头鹰 */}
            <Image
              source={OWL_BRANCH}
              pointerEvents="none"
              resizeMode="stretch"
              fadeDuration={0}
              style={{
                position: "absolute",
                right: 0,
                top: owlTop + 77 - branchWidth * 0.15,
                width: branchWidth,
                height: branchWidth / 3,
                zIndex: 4,
              }}
            />
            {!reduceMotion &&
            (owlStage === "arriving" || owlStage === "leaving") ? (
              <OwlFlight
                stage={owlStage}
                elapsed={flightClock}
                x={owlLeft + 40}
                y={owlTop + 43}
                screenWidth={w}
                insetTop={insets.top}
              />
            ) : null}
            {owlStage === "perched" ? (
              <Owl
                left={owlLeft}
                top={owlTop}
                hint={owlHint || undefined}
                bounceToken={owlBounceToken}
                sleepy={celestial.sleepyOwl}
                onTap={handleOwlTap}
              />
            ) : null}

            {/* 纯净观星模式恢复胶囊 */}
            {pureMode ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="展开底部星笺面板"
                disabled={closing}
                hitSlop={10}
                onPress={handleExitPureMode}
                style={({ pressed }) => [
                  nightSkyStyles.pureRestorePill,
                  {
                    bottom: insets.bottom + (compact ? 14 : 22),
                    backgroundColor: pressed
                      ? "rgba(24,38,72,0.88)"
                      : "rgba(12,18,38,0.78)",
                  },
                ]}
              >
                <Text style={nightSkyStyles.pureRestoreText}>展开星笺 ✦</Text>
              </Pressable>
            ) : null}

            {/* 底部信息面板 */}
            <Animated.View
              pointerEvents={pureMode ? "none" : "auto"}
              onLayout={(event) => {
                const measured = Math.ceil(event.nativeEvent.layout.height);
                const vp = `${w}x${h}`;
                setPanelState((prev) => {
                  const base =
                    prev.viewport === vp ? prev.height : compact ? 268 : 292;
                  return measured > base || prev.viewport !== vp
                    ? { viewport: vp, height: Math.max(base, measured) }
                    : prev;
                });
              }}
              style={[
                nightSkyStyles.panelWrap,
                {
                  left: w < 380 ? 14 : 22,
                  right: w < 380 ? 14 : 22,
                  bottom: insets.bottom + (compact ? 12 : 22),
                },
                panelStyle,
              ]}
            >
              <View
                style={[
                  nightSkyStyles.panelCard,
                  {
                    paddingHorizontal: compact ? 15 : 19,
                    paddingVertical: compact ? 12 : 15,
                  },
                ]}
              >
                <Image
                  pointerEvents="none"
                  source={require("../../assets/images/night-letter-bg.webp")}
                  resizeMode="cover"
                  fadeDuration={0}
                  style={nightSkyStyles.panelBgImage}
                />
                <LinearGradient
                  pointerEvents="none"
                  colors={["rgba(7,12,30,0.24)", "rgba(7,12,30,0.4)"]}
                  style={nightSkyStyles.fill}
                />

                {/* 顶栏：STARRY LETTER + 7 颗星进度 + 收起观星按钮 */}
                <View className="flex-row items-center justify-between">
                  <View style={nightSkyStyles.letterHeaderLeft}>
                    <Text style={nightSkyStyles.letterTitle}>STARRY LETTER</Text>
                    <Text style={nightSkyStyles.letterConstellation}>
                      · {activeConstellation.name}
                    </Text>
                  </View>
                  <View className="flex-row items-center" style={{ gap: 6 }}>
                    <View className="flex-row items-center" style={{ gap: 5 }}>
                      {Array.from({ length: TOTAL_STARS }).map((_, i) => (
                        <AtlasSprite
                          key={i}
                          source={NIGHT_SPRITES}
                          columns={3}
                          rows={2}
                          column={picked[i] ? 0 : 1}
                          row={0}
                          width={14}
                        />
                      ))}
                    </View>
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel="收起星笺进入纯净观星模式"
                      disabled={closing}
                      hitSlop={8}
                      onPress={handleEnterPureMode}
                      style={({ pressed }) => [
                        nightSkyStyles.pureCollapseBtn,
                        {
                          backgroundColor: pressed
                            ? "rgba(186,211,255,0.22)"
                            : "rgba(186,211,255,0.08)",
                        },
                      ]}
                    >
                      <Text style={nightSkyStyles.pureCollapseIcon}>⌄</Text>
                    </Pressable>
                  </View>
                </View>

                <NightSkyMessage closing={closing} />

                {/* 成就与星象铭牌行（固定单行高度槽，防止解锁瞬间面板突跳） */}
                <View style={nightSkyStyles.achievementRow}>
                  {done ? (
                    <>
                      <Pressable
                        accessibilityRole="button"
                        accessibilityLabel="查看夜航星图录"
                        disabled={closing}
                        onPress={handleOpenAtlas}
                        hitSlop={6}
                        style={({ pressed }) => [
                          nightSkyStyles.achievementBadge,
                          {
                            backgroundColor: pressed
                              ? "rgba(252,211,77,0.22)"
                              : "rgba(252,211,77,0.12)",
                          },
                        ]}
                      >
                        <Text
                          numberOfLines={1}
                          style={nightSkyStyles.achievementBadgeText}
                        >
                          {`✦ ${activeConstellation.name} · ${activeConstellation.subtitle} (${unlockedCount}/${NIGHT_CONSTELLATIONS.length})`}
                        </Text>
                      </Pressable>
                      <Pressable
                        accessibilityRole="button"
                        accessibilityLabel="切换下一组星象重新拾星"
                        disabled={closing}
                        onPress={handleNextConstellation}
                        hitSlop={6}
                        style={({ pressed }) => [
                          nightSkyStyles.redrawBtn,
                          {
                            backgroundColor: pressed
                              ? "rgba(186,211,255,0.2)"
                              : "rgba(186,211,255,0.1)",
                          },
                        ]}
                      >
                        <Text style={nightSkyStyles.redrawText}>
                          再绘星图 ↻
                        </Text>
                      </Pressable>
                    </>
                  ) : (
                    <Text
                      numberOfLines={1}
                      style={nightSkyStyles.constellationHint}
                    >
                      {`今夜星象 · ${activeConstellation.name}（${activeConstellation.subtitle}）`}
                    </Text>
                  )}
                </View>

                {/* 底部提示与操作按钮 */}
                <View
                  className="flex-row items-center justify-between"
                  style={{ marginTop: 10, gap: 8 }}
                >
                  <Text numberOfLines={2} style={nightSkyStyles.footerHint}>
                    {done
                      ? owlStage === "perched"
                        ? `${activeConstellation.motto} 轻点星点可弹音阶，戳猫头鹰聊聊`
                        : owlStage === "leaving"
                          ? "跟着猫头鹰，沿着夜色去星露坡"
                          : "星光点亮了枝头 · 有个小家伙正在飞来"
                      : lit === 0
                        ? scheduleMoodNote
                          ? `${scheduleMoodNote} · 轻点或划连拾星`
                          : "轻点或滑动连结星光 · 长按夜空可许愿"
                        : `拾起散落的星 · ${lit} / ${TOTAL_STARS}`}
                  </Text>
                  <View style={nightSkyStyles.footerActions}>
                    {done && chronicle?.owlPathUnlocked && onEnterFarm ? (
                      <Pressable
                        accessibilityRole="button"
                        accessibilityLabel="沿夜色小径前往星露坡"
                        disabled={closing}
                        onPress={() => {
                          thumpHaptic();
                          playSfx("owl_hoot", {
                            volume: 0.74,
                            ignoreCooldown: true,
                          });
                          enterFarm();
                        }}
                        style={({ pressed }) => [
                          nightSkyStyles.goFarmBtn,
                          {
                            backgroundColor: pressed
                              ? "rgba(253,230,138,0.24)"
                              : "rgba(253,230,138,0.14)",
                          },
                        ]}
                      >
                        <Text style={nightSkyStyles.goFarmText}>
                          去星露坡 →
                        </Text>
                      </Pressable>
                    ) : null}
                    <Pressable
                      accessibilityRole="button"
                      disabled={closing}
                      onPress={() => {
                        tapHaptic();
                        close();
                      }}
                      style={nightSkyStyles.closeBtn}
                    >
                      <Text style={nightSkyStyles.closeBtnText}>回到现实</Text>
                    </Pressable>
                  </View>
                </View>
              </View>
            </Animated.View>
          </Animated.View>
        ) : null}

        {/* 血月降临 1.5s 转场演出层（防误触拦截 + 冲击波 + 月蚀黑影 + 心跳闪黑揭幕） */}
        {bloodMoonPhase === "entering" ? (
          <View
            pointerEvents="auto"
            style={[nightSkyStyles.fill, { zIndex: 25 }]}
          >
            {/* 猩红冲击波扩散 */}
            <Animated.View
              pointerEvents="none"
              style={[
                {
                  position: "absolute",
                  left: moonCx - 48,
                  top: moonCy - 48,
                  width: 96,
                  height: 96,
                  borderRadius: 48,
                  borderWidth: 2.5,
                  borderColor: "rgba(248,113,113,0.92)",
                  backgroundColor: "rgba(185,28,28,0.24)",
                },
                bloodShockStyle,
              ]}
            />
            {/* 月蚀黑影掠过 */}
            <Animated.View
              pointerEvents="none"
              style={[
                {
                  position: "absolute",
                  left: moonCx - w * 0.55,
                  top: moonCy - w * 0.55,
                  width: w * 1.1,
                  height: w * 1.1,
                },
                bloodSweepStyle,
              ]}
            >
              <Svg width="100%" height="100%" viewBox="0 0 100 100">
                <Defs>
                  <RadialGradient id="eclipseSweep" cx="50%" cy="50%" r="50%">
                    <Stop offset="0" stopColor="#050103" stopOpacity={0.96} />
                    <Stop offset="0.58" stopColor="#450A0A" stopOpacity={0.78} />
                    <Stop offset="1" stopColor="#7F1D1D" stopOpacity={0} />
                  </RadialGradient>
                </Defs>
                <Circle cx="50" cy="50" r="50" fill="url(#eclipseSweep)" />
              </Svg>
            </Animated.View>
            {/* 暗红心跳闪黑揭幕 */}
            <Animated.View
              pointerEvents="none"
              style={[
                nightSkyStyles.fill,
                { backgroundColor: "#140206" },
                bloodVeilStyle,
              ]}
            />
          </View>
        ) : null}

        {/* 独立恐怖血月界面（未激活时零挂载） */}
        {bloodMoonRealmMounted ? (
          <BloodMoonRealm
            w={w}
            h={h}
            insetTop={insets.top}
            insetBottom={insets.bottom}
            compact={compact}
            motion={bloodMoonMotionEnabled}
            allowRichDecor={allowRichDecor}
            allowFullDecor={allowFullDecor}
            exiting={bloodMoonPhase === "exiting"}
            moonInfo={moonInfo}
            onExit={handleRequestExitBloodMoon}
            onExited={handleBloodMoonExited}
          />
        ) : null}

        <Animated.View
          pointerEvents="none"
          style={[nightSkyStyles.travelVeil, travelStyle]}
        />

        {atlasOpen ? (
          <StarAtlasModal
            visible={atlasOpen}
            chronicle={chronicle ?? DEFAULT_NIGHT_CHRONICLE}
            activeConstellationId={activeConstellation.id}
            wishCount={wishes.length}
            onSelectConstellation={handleSelectConstellation}
            onClose={handleCloseAtlas}
          />
        ) : null}

        {wishOpen ? (
          <WishComposerModal
            visible={wishOpen}
            wishes={wishes}
            constellationName={activeConstellation.name}
            onSendWish={handleSendWish}
            onQuickMeteor={handleQuickMeteor}
            onClose={handleCloseWish}
          />
        ) : null}
      </Animated.View>
    </NightMotion.Provider>
  );
}
