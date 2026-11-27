import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { GestureResponderEvent, LayoutChangeEvent } from "react-native";

import {
  BLOOD_MOON_TAPS,
  BLOOD_MOON_WINDOW_MS,
  DOTS,
  FIREFLIES,
  MAX_RECENT_NOTES,
  type SkyRippleItem,
} from "@/components/nightSky/NightSkyPrimitives";
import { playSfx, playStarScaleNote } from "@/services/soundEffects";
import { useWhalePersona } from "@/store/useWhalePersona";
import { selectHaptic, successHaptic, tapHaptic } from "@/utils/haptics";
import type { RenderQuality } from "@/utils/renderQuality";
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
  type MoonPhaseInfo,
  type NightSkyChronicle,
  type NightSkyWish,
  type SecretBadgeId,
} from "@/utils/nightSkyData";

export interface UseNightSkyStateOptions {
  w: number;
  h: number;
  insetTop: number;
  insetBottom: number;
  qualityMode: RenderQuality;
  courseNames: string[];
  todayCourseCount?: number;
  motionEnabled: boolean;
  reduceMotion: boolean;
  allowRichDecor: boolean;
  allowFullDecor: boolean;
}

export function useNightSkyState({
  w,
  h,
  insetTop,
  insetBottom,
  qualityMode,
  courseNames,
  todayCourseCount,
  motionEnabled,
  reduceMotion,
  allowRichDecor,
  allowFullDecor,
}: UseNightSkyStateOptions) {
  const whalePersona = useWhalePersona((s) => s.persona);
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

  const handlePanelLayout = useCallback(
    (event: LayoutChangeEvent) => {
      const measured = Math.ceil(event.nativeEvent.layout.height);
      const vp = `${w}x${h}`;
      setPanelState((prev) => {
        const base = prev.viewport === vp ? prev.height : compact ? 268 : 292;
        return measured > base || prev.viewport !== vp
          ? { viewport: vp, height: Math.max(base, measured) }
          : prev;
      });
    },
    [compact, h, w],
  );

  const [chronicle, setChronicle] = useState<NightSkyChronicle | null>(null);
  const [constellationIdx, setConstellationIdx] = useState(0);
  const [constellationRun, setConstellationRun] = useState(0);
  const [pickOrder, setPickOrder] = useState<number[]>([]);
  const [closing, setClosing] = useState(false);

  const [visitHour] = useState(() => new Date().getHours());
  const [moonInfo, setMoonInfo] = useState<MoonPhaseInfo>(() =>
    getMoonPhaseInfo(new Date()),
  );
  const [moonCard, setMoonCard] = useState<MoonPhaseInfo | null>(null);
  const [owlLanded, setOwlLanded] = useState(false);
  const [followingOwl, setFollowingOwl] = useState(false);
  const [owlBounceToken, setOwlBounceToken] = useState(0);
  const [owlHint, setOwlHint] = useState("");
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

  const closingRef = useRef(false);
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
  const whaleTapCountRef = useRef(0);
  const wishCountRef = useRef(0);
  const rippleIdRef = useRef(0);

  const hintTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const moonTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const wishTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const wishMeteorTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const showerTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const swarmTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const bannerTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const whaleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const echoTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const rippleTimers = useRef<Set<ReturnType<typeof setTimeout>>>(new Set());

  const activeConstellation = NIGHT_CONSTELLATIONS[constellationIdx];
  const picked = activeConstellation.spots.map((_, index) =>
    pickOrder.includes(index),
  );
  const lit = pickOrder.length;
  const done = lit >= TOTAL_STARS;

  const celestial = useMemo(
    () => getCelestialEvent(new Date(), moonInfo),
    [moonInfo],
  );
  const scheduleMoodNote = useMemo(
    () => getScheduleMoodNote(todayCourseCount),
    [todayCourseCount],
  );

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
      if (showerTimer.current) clearTimeout(showerTimer.current);
      if (swarmTimer.current) clearTimeout(swarmTimer.current);
      if (bannerTimer.current) clearTimeout(bannerTimer.current);
      if (whaleTimer.current) clearTimeout(whaleTimer.current);
      if (echoTimer.current) clearTimeout(echoTimer.current);
      for (const id of timers) clearTimeout(id);
      timers.clear();
    };
  }, []);

  const isClosing = useCallback(() => closingRef.current, []);

  const markClosing = useCallback(() => {
    if (closingRef.current) return false;
    closingRef.current = true;
    setClosing(true);
    return true;
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

  const markOwlPathUnlocked = useCallback(() => {
    if (!chronicleRef.current.owlPathUnlocked) {
      const updated = { ...chronicleRef.current, owlPathUnlocked: true };
      chronicleRef.current = updated;
      if (chronicleLoadedRef.current) {
        setChronicle(updated);
        void saveNightChronicle(updated);
      }
    }
  }, []);

  const recordMoonTapAndCheckBloodMoon = useCallback(
    (info: MoonPhaseInfo, now: number): boolean => {
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
        return true;
      }
      return false;
    },
    [],
  );

  const resetMoonTaps = useCallback(() => {
    moonTapsRef.current = [];
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

  // 读取并推进夜航志
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
      if (merged !== loaded) void saveNightChronicle(merged);
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

  const handleSelectConstellation = useCallback((idx: number) => {
    if (closingRef.current || idx < 0 || idx >= NIGHT_CONSTELLATIONS.length)
      return;
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
      if (closingRef.current || collectedSetRef.current.has(spotIndex)) return;
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
      if (closingRef.current || !text.trim()) return;
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
      if (!reduceMotion) spawnRipple(x, y);
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

  /* ---------------- 几何排版与星空装饰派生 ---------------- */
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
  const moonTop = insetTop + 34;
  const moonRight = 24;
  const moonCx = w - moonRight - moonSize / 2;
  const moonCy = moonTop + moonSize / 2;
  const owlLeft = Math.max(12, w - moonRight - 102);
  const owlTop = moonTop + moonSize - 5;
  const branchWidth = w - owlLeft + 76;
  const skyTop = owlTop + 106;
  const skyBottom = Math.max(
    skyTop + 60,
    h - insetBottom - stablePanelHeight - (compact ? 26 : 42),
  );
  const starY = (y: number) => skyTop + y * (skyBottom - skyTop);
  const headerMaxWidth = Math.max(176, w - moonRight - moonSize - 32);

  const constellationPoints = useMemo(
    () =>
      activeConstellation.spots.map((spot) => ({
        x: spot.x * w,
        y: skyTop + spot.y * (skyBottom - skyTop),
      })),
    [activeConstellation.spots, skyBottom, skyTop, w],
  );
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

  const showWhaleCameo =
    allowRichDecor &&
    (moonInfo.index === 4 ||
      unlockedCount >= NIGHT_CONSTELLATIONS.length ||
      showerSeen ||
      (chronicle !== null &&
        chronicle.visits > 0 &&
        chronicle.visits % 3 === 0));

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

  return {
    compact,
    stablePanelHeight,
    handlePanelLayout,
    chronicle,
    constellationRun,
    pickOrder,
    closing,
    isClosing,
    markClosing,
    moonInfo,
    moonCard,
    owlLanded,
    setOwlLanded,
    followingOwl,
    setFollowingOwl,
    owlBounceToken,
    setOwlBounceToken,
    owlHint,
    setOwlHint,
    pureMode,
    setPureMode,
    atlasOpen,
    setAtlasOpen,
    wishOpen,
    setWishOpen,
    wishes,
    wishToken,
    wishMeteorVisible,
    wishText,
    showerToken,
    showerActive,
    swarmToken,
    swarmActive,
    skyBanner,
    whaleBubble,
    ripples,
    activeConstellation,
    picked,
    lit,
    done,
    celestial,
    scheduleMoodNote,
    coursePool,
    meteorLaneCount,
    moonSize,
    moonTop,
    moonRight,
    moonCx,
    moonCy,
    owlLeft,
    owlTop,
    branchWidth,
    skyTop,
    starY,
    headerMaxWidth,
    constellationPoints,
    pickedTrailPoints,
    unlockedCount,
    owlLines,
    owlTapsNeeded,
    showWhaleCameo,
    twinkleDots,
    staticDots,
    activeFireflies,
    showOwlHint,
    showSkyBanner,
    unlockBadge,
    markOwlPathUnlocked,
    recordMoonTapAndCheckBloodMoon,
    resetMoonTaps,
    handleSelectConstellation,
    handleNextConstellation,
    handleCollectStar,
    openWishComposer,
    handleCloseWish,
    handleOpenAtlas,
    handleCloseAtlas,
    handleTogglePureMode,
    handleEnterPureMode,
    handleExitPureMode,
    handleSendWish,
    handleQuickMeteor,
    handleSkyPress,
    handlePlayHarpNote,
    handlePopCourseMeteor,
    handleWhaleTap,
  };
}
