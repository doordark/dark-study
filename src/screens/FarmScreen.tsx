/* eslint-disable react-hooks/immutability --
   Reanimated 共享值（px/py/face 等）本质是跨渲染、跨线程可变的容器，
   在事件回调与 effect 中赋值是官方标准用法，React 编译器的不可变假设不适用 */

import { useIsFocused, useRouter } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useCallback, useEffect, useRef, useState, type ComponentRef } from "react";
import {
  Alert,
  AppState,
  Keyboard,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
  useWindowDimensions,
} from "react-native";
import Animated, {
  Easing,
  cancelAnimation,
  runOnJS,
  useAnimatedReaction,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withSequence,
  withTiming,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { FarmBottomDock, farmBottomDockHeight } from "@/components/farm/FarmBottomDock";
import { FarmMapHud, FarmShopSectionHost, FarmTopHud } from "@/components/farm/FarmHudOverlay";
import { FarmSheetsHost } from "@/components/farm/FarmSheetsHost";
import { FarmWorldStage } from "@/components/farm/FarmWorldStage";
import {
  PERIOD_SHORT_LABELS,
  VIEW_H,
  VIEW_W,
  boundaryReplyForResident,
  buildFallbackChatEpisode,
  buildInterruptedRequestRecords,
  buildResidentChatSystemPrompt,
  chatId,
  eventTime,
  fallbackLine,
  plotPos,
  syncResidentAssignmentMemories,
  type FarmChatMsg,
  type Speaker,
} from "@/components/farm/farmScreenConstants";
import { farmScreenStyles as st } from "@/components/farm/farmScreenStyles";
import { warmMarketAssets } from "@/components/farm/marketAssets";
import type { CropKind } from "@/components/farm/sprites";
import { useFarmPersistence } from "@/components/farm/useFarmPersistence";
import { HOUSE, PLAYER_START, POND, RESIDENT_PLACEMENTS, plotApproach } from "@/constants/farmMap";
import { useAnimationActive } from "@/hooks/useAnimationActive";
import { useFarmResidents } from "@/hooks/useFarmResidents";
import { useForegroundClock } from "@/hooks/useForegroundClock";
import { FarmChatError, farmChat } from "@/services/farmChat";
import { NPC_CHAT_UNAVAILABLE } from "@/services/farmVendorChat";
import { playSfx } from "@/services/soundEffects";
import { searchWeb, type SearchHit } from "@/services/whaleTools";
import { speakWhale } from "@/services/whaleVoice";
import { useSettings } from "@/store/useSettings";
import { useSoundEffects } from "@/store/useSoundEffects";
import { useWhaleMemory } from "@/store/useWhaleMemory";
import {
  bindTalkPurpose,
  localNpcCommand,
  parseNpcReply,
  playerDiscussionCommand,
  playerTalkCommand,
  type NpcAction,
} from "@/utils/farmActions";
import { RESIDENT_PROJECTS, residentReflections } from "@/utils/farmAgency";
import {
  assignmentRecall,
  detectRelayIntent,
  formatAssignmentAck,
  understandAssignment,
  type FarmAssignment,
} from "@/utils/farmAssignment";
import { chickenCanHelp, coopComfort } from "@/utils/farmCoop";
import { CROP_META } from "@/utils/farmEconomy";
import {
  describeFarmEmotion,
  evaluateNpcSocialImpact,
  farmDeltaToWhaleEmotionDelta,
  isNpcRefusingChat,
} from "@/utils/farmEmotion";
import {
  extractGroupAction,
  runFarmGroupTurn,
  seedGroupMessagesFromRecord,
  type FarmGroupMessage,
} from "@/utils/farmGroupChat";
import {
  RESIDENTS,
  lifeRequestBlockReason,
  privateFarmChatReply,
  unreadRequestReports,
  type ResidentConversation,
  type ResidentId,
} from "@/utils/farmLife";
import { pestAt, type Vendor } from "@/utils/farmMarket";
import {
  familyTopicRecall,
  farmChatContext,
  getResidentEmotion,
  heardFarmTopic,
  isFarmChatContinuation,
  localSocialReaction,
  offlineFarmRecall,
  recordFarmChatTurn,
  resolveEffectiveSocialReaction,
} from "@/utils/farmMemory";
import { planFarmRoute } from "@/utils/farmNavigation";
import { PERSONALITIES, npcRefusalLine, personalityReply } from "@/utils/farmPersonality";
import {
  applyPlayerMemoryUpdates,
  formatPersonaMemoryBlock,
  maybeSynthesizeReflection,
  recordGroupChatMemory,
  recordNpcConversationMemory,
  type NpcConversationMemoryNote,
} from "@/utils/farmPersonaMemory";
import { emptyRandomEventState, pickFarmRandomEvent } from "@/utils/farmRandomEvents";
import { approachSpotForTarget } from "@/utils/farmResidentSpace";
import { computeSleepingResidents } from "@/utils/farmSleep";
import { farmTime } from "@/utils/farmTime";
import {
  RESIDENT_DUTIES,
  compileFarmGazette,
  detectDutyCommand,
  detectSeedRumorFromChat,
  polishGazetteWithAI,
  propagateTownEvents,
} from "@/utils/farmTown";
import {
  applyVisitorChatOutcome,
  emptyVisitorState,
  markVisitorSlotGreeted,
  recordHorrorAftermathToFamily,
  resolveVisitorDisplayProfile,
  resolveVisitorEmotion,
  runVisitorChatTurn,
  shouldTriggerNightHorror,
  visitorArrivalLine,
  visitorFarewellLine,
  type NormalVisitorId,
  type VisitorId,
} from "@/utils/farmVisitors";
import { farmPlotGrowth as plotGrowth } from "@/utils/farmWatering";

/* -------------------------------------------------------------------------- */
/*  农场主界面（编排层：持久化、舞台、HUD 与 14+ 懒加载抽屉均已解耦）           */
/* -------------------------------------------------------------------------- */

export function FarmScreen() {
  const router = useRouter();
  const focused = useIsFocused();
  const farmForeground = useAnimationActive(focused);
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const apiKey = useSettings((s) => s.apiKey);
  const quality = useSettings((s) => s.renderQuality);
  const farmWebSearch = useSettings((s) => s.farmWebSearch);
  const sfxOn = useSoundEffects((s) => s.on);
  const toggleSfx = useSoundEffects((s) => s.toggle);

  const [headerHeight, setHeaderHeight] = useState(0);
  const [mapHeight, setMapHeight] = useState(0);
  const sceneW = width;
  const scale = sceneW / VIEW_W;
  const sceneH = VIEW_H * scale;
  const sceneFrameStyle = { width: sceneW, height: sceneH };
  const hudOverlayH = farmBottomDockHeight(insets.bottom);
  const chatMaxH = Math.max(150, Math.min(258, Math.round(height * 0.32)));

  const now = useForegroundClock(30_000).getTime();

  /* ---------------- 交互与抽屉开关状态 ---------------- */
  const [selected, setSelected] = useState<CropKind | null>(null);
  const [bagOpen, setBagOpen] = useState(false);
  const [bagDetail, setBagDetail] = useState("");
  const [inspectCan, setInspectCan] = useState(false);
  const [supply, setSupply] = useState<"repellent" | "growth" | null>(null);
  const [fertilizing, setFertilizing] = useState(false);
  const [lifeOpen, setLifeOpen] = useState(false);
  const [lifeInitialTab, setLifeInitialTab] = useState<"life" | "ai" | "logs">("life");
  const [lifeReportsOnly, setLifeReportsOnly] = useState(false);
  const [recapManuallyOpen, setRecapManuallyOpen] = useState(false);
  const [recapVisible, setRecapVisible] = useState(false);
  const [houseOpen, setHouseOpen] = useState(false);
  const [gameOpen, setGameOpen] = useState(false);
  const [gameToken, setGameToken] = useState(0);
  const [shopOpen, setShopOpen] = useState(false);
  const [marketOrders, setMarketOrders] = useState(false);
  const [speaker, setSpeaker] = useState<Speaker | null>(null);
  const [followUp, setFollowUp] = useState<ResidentConversation | null>(null);
  const [threads, setThreads] = useState<Record<Speaker, FarmChatMsg[]>>({
    door: [], gu: [], chicken: [], xiaoba: [], yujie: [], weigang: [],
  });
  const [draft, setDraft] = useState("");
  const [chatBusy, setChatBusy] = useState(false);
  const [chatOffline, setChatOffline] = useState(false);
  const [chatHint, setChatHint] = useState("");
  const [memoryBookOpen, setMemoryBookOpen] = useState(false);
  const [giftBarOpen, setGiftBarOpen] = useState(false);
  const [groupOpen, setGroupOpen] = useState(false);
  const [groupDraft, setGroupDraft] = useState("");
  const [groupBusy, setGroupBusy] = useState(false);
  const [groupHint, setGroupHint] = useState("");
  const [groupTypingLabel, setGroupTypingLabel] = useState("");
  const [groupOnline, setGroupOnline] = useState(() => Boolean(apiKey));
  const [townOpen, setTownOpen] = useState(false);
  const [focusOpen, setFocusOpen] = useState(false);
  const [festivalOpen, setFestivalOpen] = useState(false);
  const [fishingOpen, setFishingOpen] = useState(false);
  const [storiesOpen, setStoriesOpen] = useState(false);
  const [decorOpen, setDecorOpen] = useState(false);
  const [visitorSpeaker, setVisitorSpeaker] = useState<VisitorId | null>(null);
  const [visitorDraft, setVisitorDraft] = useState("");
  const [visitorBusy, setVisitorBusy] = useState(false);
  const [visitorOnline, setVisitorOnline] = useState(() => Boolean(apiKey));
  const [visitorHint, setVisitorHint] = useState("");
  const [visitorThreads, setVisitorThreads] = useState<Record<VisitorId, FarmChatMsg[]>>({
    huboqi: [], xushuiyin: [], huangbingqi: [], dark_xushuiyin: [],
    dafeiyu: [], claude: [], gpt: [], gemini: [],
  });
  const [randomEventModalOpen, setRandomEventModalOpen] = useState(false);
  const [heroEmotionPose, setHeroEmotionPose] = useState<"neutral" | "happy">("neutral");
  const [wokenNightState, setWokenNightState] = useState<{ day: number; ids: ResidentId[] }>({
    day: 0, ids: [],
  });
  const [followedId, setFollowedId] = useState<ResidentId | null>(null);
  const [gazettePolishing, setGazettePolishing] = useState(false);
  const [gazetteError, setGazetteError] = useState("");
  const [walkRipple, setWalkRipple] = useState<{ id: number; x: number; y: number } | null>(null);
  const [toast, setToast] = useState<{ id: number; text: string } | null>(null);
  const [playerAnchor, setPlayerAnchor] = useState<{ x: number; y: number }>(PLAYER_START);
  const [playerMoving, setPlayerMoving] = useState(false);

  const farmScroll = useRef<ComponentRef<typeof ScrollView>>(null);
  const chatInputRef = useRef<ComponentRef<typeof TextInput>>(null);
  const pestPlot = useRef<number | null>(null);
  const settledGame = useRef(-1);
  const houseTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const rippleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const heroEmotionTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const personalRequest = useRef<AbortController | null>(null);
  const groupRequest = useRef<AbortController | null>(null);
  const groupRevealTimers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const visitorRequest = useRef<AbortController | null>(null);
  const gazetteRequest = useRef<AbortController | null>(null);
  const horrorCheckedDayRef = useRef(-1);
  const lastObservedVisitRef = useRef<{ slotKey: string; who: NormalVisitorId } | null>(null);
  const manualDismissedSlotRef = useRef<string>("");
  const visitorCycleReadyRef = useRef(false);

  const [decorReady, setDecorReady] = useState(false);
  const [folkReady, setFolkReady] = useState(false);
  useEffect(() => {
    const a = setTimeout(() => setDecorReady(true), 340);
    const b = setTimeout(() => setFolkReady(true), 660);
    return () => {
      clearTimeout(a);
      clearTimeout(b);
    };
  }, []);

  const showToast = useCallback((text: string, durationMs = 1800) => {
    setToast({ id: eventTime(), text });
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), durationMs);
  }, []);

  const triggerHeroHappyPulse = useCallback(() => {
    setHeroEmotionPose("happy");
    if (heroEmotionTimer.current) clearTimeout(heroEmotionTimer.current);
    heroEmotionTimer.current = setTimeout(() => setHeroEmotionPose("neutral"), 4200);
  }, []);

  /* ---------------- 玩家移动（UI 线程平滑路径） ---------------- */
  const px = useSharedValue(PLAYER_START.x);
  const py = useSharedValue(PLAYER_START.y);
  const face = useSharedValue(1);

  useAnimatedReaction(
    () => px.get(),
    (current, previous) => {
      if (previous !== null && Math.abs(current - previous) > 0.15)
        face.set(current > previous ? 1 : -1);
    },
  );
  const playerFacingStyle = useAnimatedStyle(() => ({
    transform: [{ scaleX: face.value }],
  }));
  const playerStyle = useAnimatedStyle(() => ({
    zIndex: Math.round(py.value),
    transform: [
      { translateX: (px.value - 10) * scale },
      { translateY: (py.value - 25) * scale },
    ],
  }));

  const moveTo = useCallback(
    (x: number, y: number, opts?: { showRipple?: boolean; faceTowardX?: number }) => {
      if (houseTimer.current) {
        clearTimeout(houseTimer.current);
        houseTimer.current = null;
      }
      if (!Number.isFinite(x) || !Number.isFinite(y)) return 0;
      const start =
        Number.isFinite(px.value) && Number.isFinite(py.value)
          ? { x: px.value, y: py.value }
          : PLAYER_START;
      if (!Number.isFinite(px.value) || !Number.isFinite(py.value)) {
        px.value = start.x;
        py.value = start.y;
      }
      const route = planFarmRoute(start, { x, y });
      cancelAnimation(px);
      cancelAnimation(py);
      if (!route.length) {
        setPlayerMoving(false);
        if (typeof opts?.faceTowardX === "number" && Math.abs(opts.faceTowardX - start.x) > 0.1) {
          face.value = opts.faceTowardX >= start.x ? 1 : -1;
        }
        return 0;
      }
      setPlayerMoving(true);
      if (Math.abs(route[0].x - px.value) > 0.15) face.value = route[0].x < px.value ? -1 : 1;
      const dest = route[route.length - 1];
      setPlayerAnchor(dest);
      if (opts?.showRipple) {
        if (rippleTimer.current) clearTimeout(rippleTimer.current);
        setWalkRipple({ id: eventTime(), x: dest.x, y: dest.y });
        rippleTimer.current = setTimeout(() => setWalkRipple(null), 560);
      }
      let previous = { x: px.value, y: py.value };
      let total = 0;
      const steps = route.map((point) => {
        const dist = Math.hypot(point.x - previous.x, point.y - previous.y);
        const duration = Math.max(70, Math.round(dist * 16.5));
        previous = point;
        total += duration;
        return { point, duration };
      });
      const finalFace =
        typeof opts?.faceTowardX === "number" && Math.abs(opts.faceTowardX - dest.x) > 0.1
          ? opts.faceTowardX >= dest.x
            ? 1
            : -1
          : 0;
      const walkFinished = (finished?: boolean) => {
        "worklet";
        if (finished) {
          if (finalFace !== 0) face.value = finalFace;
          runOnJS(setPlayerMoving)(false);
        }
      };
      px.value = withSequence(
        ...steps.map((step) =>
          withTiming(step.point.x, { duration: step.duration, easing: Easing.linear }),
        ),
      );
      py.value = withSequence(
        ...steps.map((step, i) =>
          withTiming(
            step.point.y,
            { duration: step.duration, easing: Easing.linear },
            i === steps.length - 1 ? walkFinished : undefined,
          ),
        ),
      );
      return total;
    },
    [face, px, py],
  );

  /* ---------------- 持久化状态、学习奖励与星露祝福 Hook ---------------- */
  const closeBag = useCallback(() => setBagOpen(false), []);
  const closeHouse = useCallback(() => setHouseOpen(false), []);
  const closeTown = useCallback(() => setTownOpen(false), []);
  const openRandomEventModal = useCallback(() => setRandomEventModalOpen(true), []);
  const closeRandomEventModal = useCallback(() => setRandomEventModalOpen(false), []);

  const farm = useFarmPersistence({
    focused,
    now,
    shopOpen,
    showToast,
    moveTo,
    onHeroHappyPulse: triggerHeroHappyPulse,
    onCloseBag: closeBag,
    onCloseHouse: closeHouse,
    onCloseTown: closeTown,
    onOpenRandomEventModal: openRandomEventModal,
    onCloseRandomEventModal: closeRandomEventModal,
    selected,
    setSelected,
    supply,
    setSupply,
    fertilizing,
    setFertilizing,
    setBagDetail,
    setInspectCan,
    setThreads,
    setVisitorThreads,
    setWokenNightState,
    pestPlotRef: pestPlot,
    gameToken,
    settledGameRef: settledGame,
  });

  useEffect(
    () => () => {
      personalRequest.current?.abort();
    },
    [speaker, focused],
  );

  const wokenIdsToday =
    farm.night && wokenNightState.day === farm.day ? wokenNightState.ids : [];
  const { sleeping: sleepingResidents, soloEvent: nightSoloEvent } =
    computeSleepingResidents({
      night: farm.night,
      day: farm.day,
      wokenIds: wokenIdsToday,
      weather: farm.weather,
    });

  function handleConversationMemory(
    recordEntry: ResidentConversation,
    aiMemory?: NpcConversationMemoryNote,
  ) {
    const at = eventTime();
    farm.setMemories((previous) =>
      recordNpcConversationMemory(previous, recordEntry, aiMemory, at),
    );
    if (recordEntry.participants.length >= 2) {
      farm.setTown((previous) => {
        const res = propagateTownEvents(previous.events, recordEntry.participants, at);
        return res.diffused.length ? { ...previous, events: res.events } : previous;
      });
    }
  }

  const residents = useFarmResidents({
    enabled: focused && farm.loaded && folkReady && !farm.loadFailed,
    paused:
      shopOpen || houseOpen || gameOpen || bagOpen || groupOpen || focusOpen ||
      festivalOpen || fishingOpen || storiesOpen || decorOpen || visitorSpeaker !== null,
    autonomous: !groupOpen,
    busyResident: speaker,
    night: farm.night,
    apiKey,
    memories: farm.memories,
    town: farm.town,
    farmNeeds: farm.farmNeeds,
    sleepingResidents,
    nightSoloEvent,
    scene: { day: farm.day, season: farm.seasonName, growing: farm.growing, ripe: farm.ripe },
    onWork: farm.executeResidentWork,
    onAutoWork: farm.executeAutonomousDuty,
    onAssignments: syncAssignments,
    onConversationMemory: handleConversationMemory,
  });

  const getResidentsRef = residents.getResidents;
  const subscribeResidentsRef = residents.subscribeResidents;
  useEffect(() => {
    if (
      !followedId || !focused || shopOpen || houseOpen || gameOpen || bagOpen ||
      lifeOpen || townOpen || groupOpen || speaker !== null || mapHeight <= 0
    ) {
      return;
    }
    let lastTargetY = -1;
    const syncCamera = () => {
      const target = getResidentsRef().find((r) => r.id === followedId);
      if (!target) return;
      const visibleMapH = Math.max(180, mapHeight - hudOverlayH);
      const nextY = Math.max(0, Math.round(target.logicalPosition.y * scale - visibleMapH / 2));
      if (Math.abs(nextY - lastTargetY) >= 8) {
        lastTargetY = nextY;
        farmScroll.current?.scrollTo({ y: nextY, animated: true });
      }
    };
    syncCamera();
    return subscribeResidentsRef(syncCamera);
  }, [
    followedId, focused, shopOpen, houseOpen, gameOpen, bagOpen, lifeOpen,
    townOpen, groupOpen, speaker, mapHeight, hudOverlayH, scale,
    getResidentsRef, subscribeResidentsRef,
  ]);

  useEffect(() => {
    if (!farm.loaded || farm.loadFailed || !farm.night || horrorCheckedDayRef.current === farm.day)
      return;
    horrorCheckedDayRef.current = farm.day;
    if (!shouldTriggerNightHorror({ state: farm.visitorState, night: farm.night, day: farm.day }))
      return;
    const timer = setTimeout(() => {
      const at = eventTime();
      farm.setMemories((prev) => recordHorrorAftermathToFamily(prev, at).nextMemories);
      farm.setTown((prev) => {
        const curV = prev.visitors ?? emptyVisitorState();
        if (curV.horrorActive || curV.lastHorrorDay === farm.day) return prev;
        const ev = recordHorrorAftermathToFamily(farm.memories, at).event;
        return {
          ...prev,
          visitors: { ...curV, horrorActive: true, lastHorrorDay: farm.day, sleepDeprivedDay: farm.day },
          events: [...prev.events.filter((e) => e.expiresAt > at && e.title !== ev.title), ev].slice(-12),
        };
      });
      playSfx("horror_appear", { ignoreCooldown: true, volume: 0.76 });
      showToast("⚠ 深夜异动！恐怖徐睡阴裹着被子扛电脑来农场疯狂打瓦了！");
    }, 1800);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [farm.loaded, farm.loadFailed, farm.night, farm.day]);

  useEffect(() => {
    if (!farm.loaded || farm.loadFailed || farm.visitorState.horrorActive) return;
    const prev = lastObservedVisitRef.current;
    const curKey = farm.activeVisitorVisit?.slotKey ?? "";
    const curWho = farm.activeVisitorVisit?.who ?? null;
    const isInitialSync = !visitorCycleReadyRef.current;
    const isSamePersonHandoff = prev !== null && curWho !== null && prev.who === curWho;
    const isManualReplace = farm.activeVisitorVisit?.source === "invited";
    const shouldToastDeparture =
      !isInitialSync && prev !== null && prev.slotKey !== curKey &&
      !isSamePersonHandoff && !isManualReplace &&
      manualDismissedSlotRef.current !== prev.slotKey && focused;
    const shouldGreetScheduled =
      farm.activeVisitorVisit !== null &&
      farm.activeVisitorVisit.source === "scheduled" &&
      farm.visitorState.lastGreetedSlotKey !== farm.activeVisitorVisit.slotKey &&
      (isInitialSync || farm.activeVisitorVisit.slotKey !== prev?.slotKey);
    const departingWho = shouldToastDeparture && prev ? prev.who : null;
    const arrivingVisit = shouldGreetScheduled ? farm.activeVisitorVisit : null;
    const timer = setTimeout(() => {
      visitorCycleReadyRef.current = true;
      lastObservedVisitRef.current = curWho && curKey ? { slotKey: curKey, who: curWho } : null;
      if (!isInitialSync && prev && prev.slotKey !== curKey) manualDismissedSlotRef.current = "";
      if (arrivingVisit) {
        const at = eventTime();
        farm.setTown((p) => ({
          ...p,
          visitors: markVisitorSlotGreeted(
            p.visitors ?? emptyVisitorState(),
            arrivingVisit,
            at,
            !isSamePersonHandoff,
          ),
        }));
      }
      if (!isInitialSync && focused) {
        if (departingWho && arrivingVisit && !isSamePersonHandoff) {
          const prevName = resolveVisitorDisplayProfile(departingWho, farm.whaleSync).name;
          const nextName = resolveVisitorDisplayProfile(arrivingVisit.who, farm.whaleSync).name;
          showToast(`${prevName}告辞离开，${nextName}正好来院子里串门啦！`);
        } else if (departingWho) {
          showToast(visitorFarewellLine(departingWho, farm.whaleSync));
        } else if (arrivingVisit && !isSamePersonHandoff) {
          showToast(visitorArrivalLine(arrivingVisit.who, farm.whaleSync));
        }
      }
    }, isInitialSync ? 250 : 400);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    farm.loaded, farm.loadFailed, farm.activeVisitorVisit?.slotKey,
    farm.activeVisitorVisit?.who, farm.activeVisitorVisit?.source,
    farm.visitorState.lastGreetedSlotKey, focused, farm.visitorState.horrorActive,
  ]);

  const taskReportSince = useRef(eventTime());
  const interruptedRequests: ResidentConversation[] = lifeOpen
    ? buildInterruptedRequestRecords(farm.memories, residents.history)
    : [];

  function resumeRequest(recordEntry: ResidentConversation) {
    const [actor, target] = recordEntry.participants;
    const purpose = recordEntry.discussion?.question;
    if (!farm.loaded || farm.loadFailed || !target || !purpose) return;
    const current = farm.memories[actor].assignment;
    if (current?.engineId === recordEntry.taskId && current?.status === "cancelled") {
      Alert.alert("这项委托已取消", "如果还要问，可以打开居民对话发起新委托。");
      return;
    }
    const result = residents.command(actor, { type: "talk_to", target, purpose }, recordEntry);
    if (!result.ok || !result.id) {
      Alert.alert("暂时无法续办", result.message);
      return;
    }
    const engineId = result.id;
    const resumeFrom = residents.history.some((entry) => entry.id === recordEntry.id)
      ? recordEntry.id
      : recordEntry.resumedFrom;
    farm.setMemories((previous) => ({
      ...previous,
      [actor]: {
        ...previous[actor],
        assignment: {
          id: engineId, engineId, resumeFrom, target, question: purpose,
          status: "walking", updatedAt: eventTime(),
        },
      },
    }));
    setLifeOpen(false);
  }

  function syncAssignments(
    snapshot: ReturnType<typeof residents.getResidents>,
    history: typeof residents.history,
  ) {
    farm.setMemories((previous) =>
      syncResidentAssignmentMemories(previous, snapshot, history, eventTime()),
    );
  }

  const reportedTasks = useRef(new Set<string>());
  useEffect(() => {
    for (const recordEntry of residents.history) {
      if (
        !recordEntry.requestOutcome ||
        recordEntry.startedAt < taskReportSince.current ||
        reportedTasks.current.has(recordEntry.id)
      )
        continue;
      reportedTasks.current.add(recordEntry.id);
      const actor = recordEntry.participants[0];
      setThreads((previous) => ({
        ...previous,
        [actor]: [
          ...previous[actor],
          { id: recordEntry.id + "-report", role: "assistant" as const, text: recordEntry.requestOutcome! },
        ].slice(-40),
      }));
    }
  }, [residents.history]);

  const clearGroupRevealTimers = useCallback(() => {
    for (const timer of groupRevealTimers.current) clearTimeout(timer);
    groupRevealTimers.current = [];
    setGroupTypingLabel("");
  }, []);

  useEffect(() => {
    const subscription = AppState.addEventListener("change", (state) => {
      if (state !== "active") {
        personalRequest.current?.abort();
        groupRequest.current?.abort();
        gazetteRequest.current?.abort();
        clearGroupRevealTimers();
      }
    });
    return () => {
      subscription.remove();
      gazetteRequest.current?.abort();
      clearGroupRevealTimers();
      if (rippleTimer.current) clearTimeout(rippleTimer.current);
      if (toastTimer.current) clearTimeout(toastTimer.current);
      if (houseTimer.current) clearTimeout(houseTimer.current);
      if (heroEmotionTimer.current) clearTimeout(heroEmotionTimer.current);
    };
  }, [clearGroupRevealTimers]);

  const nightV = useSharedValue(farm.night ? 1 : 0);
  useEffect(() => {
    nightV.value = withTiming(farm.night ? 1 : 0, { duration: 700 });
  }, [farm.night, nightV]);

  const [terrainPainted, setTerrainPainted] = useState(false);
  const [entranceFinished, setEntranceFinished] = useState(false);
  const entranceCover = useSharedValue(1);
  const reduceMotion = useReducedMotion();
  const sceneReady = farm.loaded && decorReady && mapHeight > 0 && terrainPainted;
  const finishEntrance = useCallback(() => setEntranceFinished(true), []);
  const entranceStyle = useAnimatedStyle(() => ({ opacity: entranceCover.value }));

  useEffect(() => {
    if (!focused || !sceneReady || entranceFinished) return;
    entranceCover.value = withTiming(
      0,
      { duration: reduceMotion ? 120 : 320, easing: Easing.out(Easing.cubic) },
      (finished) => {
        if (finished) runOnJS(finishEntrance)();
      },
    );
    return () => cancelAnimation(entranceCover);
  }, [entranceCover, entranceFinished, finishEntrance, focused, reduceMotion, sceneReady]);

  const goToMarket = (showOrders = false) => {
    if (!farm.loaded || farm.loadFailed || shopOpen) return;
    void warmMarketAssets(farmTime(eventTime(), 0, eventTime()).sceneVariant);
    if (houseTimer.current) clearTimeout(houseTimer.current);
    const travel = moveTo(85, 316) ?? 0;
    houseTimer.current = setTimeout(() => {
      setPlayerMoving(false);
      setMarketOrders(showOrders);
      setShopOpen(true);
    }, travel);
  };

  const enterHouse = () => {
    const travel = moveTo(HOUSE.door.x, HOUSE.door.y) ?? 0;
    if (houseTimer.current) clearTimeout(houseTimer.current);
    houseTimer.current = setTimeout(() => setHouseOpen(true), Math.max(180, travel + 50));
  };

  const openBugGame = (index: number) => {
    pestPlot.current = index;
    setGameToken((t) => t + 1);
    setGameOpen(true);
  };

  /* ---------------- 坤坤巡田捉虫 & 随机奇遇巡检 ---------------- */
  const {
    actionBusy,
    workResources,
    setPlots,
    setGear,
    setTown,
    loaded: farmLoaded,
    loadFailed: farmLoadFailed,
    randomEventsEnabled,
    activeRandomEvent,
    randomEventState,
    weather: farmWeather,
    rainbow: farmRainbow,
    period: farmPeriod,
    activeNormalVisitor,
  } = farm;
  const chickenHelpState = useRef({
    plots: farm.plots, gear: farm.gear, focused, loaded: farmLoaded,
    loadFailed: farmLoadFailed, shopOpen, houseOpen, gameOpen, bagOpen,
    lifeOpen, speaker, getResidents: residents.getResidents,
  });
  useEffect(() => {
    chickenHelpState.current = {
      plots: farm.plots, gear: farm.gear, focused, loaded: farmLoaded,
      loadFailed: farmLoadFailed, shopOpen, houseOpen, gameOpen, bagOpen,
      lifeOpen, speaker, getResidents: residents.getResidents,
    };
  }, [
    farm.plots, farm.gear, focused, farmLoaded, farmLoadFailed, shopOpen,
    houseOpen, gameOpen, bagOpen, lifeOpen, speaker, residents.getResidents,
  ]);
  useEffect(() => {
    const timer = setInterval(() => {
      const state = chickenHelpState.current;
      const at = eventTime();
      const hen = state.getResidents().find((value) => value.id === "chicken");
      if (
        (AppState.currentState && AppState.currentState !== "active") ||
        !state.focused || !state.loaded || state.loadFailed || state.shopOpen ||
        state.houseOpen || state.gameOpen || state.bagOpen || state.lifeOpen ||
        state.speaker || !hen || hen.task || hen.state === "talking" || actionBusy.current
      )
        return;
      if (
        !chickenCanHelp(
          coopComfort(state.gear.coop),
          at,
          state.gear.lastChickenHelp,
          farmTime(at, 0, at).night,
        )
      )
        return;
      const index = state.plots.findIndex(
        (plot, i) =>
          plot.crop &&
          plot.pestProne &&
          pestAt(
            plotGrowth(plot, at + workResources.current.timeShift),
            CROP_META[plot.crop].growMs,
            plot.pestCleared,
          ) &&
          Math.hypot(hen.logicalPosition.x - plotApproach(i).x, hen.logicalPosition.y - plotApproach(i).y) <= 40,
      );
      if (index < 0) return;
      setPlots((current) =>
        current.map((plot, i) => (i === index ? { ...plot, pestCleared: true } : plot)),
      );
      setGear((current) => ({ ...current, lastChickenHelp: at }));
      showToast("坤坤在田边啄掉了一处虫害");
    }, 60_000);
    return () => clearInterval(timer);
  }, [actionBusy, setGear, setPlots, workResources, showToast]);

  useEffect(() => {
    if (!focused || !farmLoaded || farmLoadFailed || !randomEventsEnabled) return;
    const id = setInterval(() => {
      if (
        (AppState.currentState && AppState.currentState !== "active") ||
        shopOpen || houseOpen || gameOpen || bagOpen || groupOpen || townOpen ||
        speaker || visitorSpeaker || randomEventModalOpen || activeRandomEvent
      )
        return;
      const nowAt = eventTime();
      const picked = pickFarmRandomEvent({
        state: randomEventState,
        weather: farmWeather,
        rainbow: farmRainbow,
        period: farmPeriod,
        activeVisitor: activeNormalVisitor,
        at: nowAt,
      });
      if (picked) {
        setTown((prev) => ({
          ...prev,
          randomEvents: {
            ...(prev.randomEvents ?? emptyRandomEventState()),
            activeEventId: picked.id,
            activeTriggeredAt: nowAt,
          },
        }));
      }
    }, 38_000);
    return () => clearInterval(id);
  }, [
    focused, farmLoaded, farmLoadFailed, randomEventsEnabled, shopOpen,
    houseOpen, gameOpen, bagOpen, groupOpen, townOpen, speaker, visitorSpeaker,
    randomEventModalOpen, activeRandomEvent, randomEventState,
    farmWeather, farmRainbow, farmPeriod, activeNormalVisitor, setTown,
  ]);

  /* ---------------- 居民对话、访客对话与家庭群聊 ---------------- */
  const openTalk = (who: Speaker, position?: { x: number; y: number }) => {
    if (!farm.loaded || farm.loadFailed) return;
    const at = position ?? RESIDENT_PLACEMENTS[who].home;
    const residentPositions = residents
      .getResidents()
      .filter((r) => r.id !== who)
      .map((r) => r.logicalPosition);
    const standSpot = approachSpotForTarget(playerAnchor, at, residentPositions) ?? {
      x: at.x - 14,
      y: at.y + 3,
    };
    residents.interact(who, standSpot.x);
    moveTo(standSpot.x, standSpot.y, { faceTowardX: at.x });
    setSpeaker(who);
    setMemoryBookOpen(false);
    setGiftBarOpen(false);
    setFollowUp(null);
    setDraft("");
    setChatHint("");
    setChatOffline(!apiKey);
    const saved: FarmChatMsg[] = farm.memories[who].turns.flatMap((turn) => [
      { id: turn.id, role: "user", text: turn.player },
      { id: `${turn.id}-reply`, role: "assistant", text: turn.reply },
    ]);
    setThreads((prev) =>
      prev[who].length
        ? prev
        : {
            ...prev,
            [who]: saved.length
              ? saved
              : [
                  {
                    id: chatId(),
                    role: "assistant",
                    text: fallbackLine(who, {
                      day: farm.day, coins: farm.coins,
                      growing: farm.growing, harvested: farm.harvested,
                    }),
                  },
                ],
          },
    );
  };

  const closePersonalChat = () => {
    personalRequest.current?.abort();
    Keyboard.dismiss();
    setSpeaker(null);
    setMemoryBookOpen(false);
    setGiftBarOpen(false);
    setFollowUp(null);
    setChatHint("");
  };

  function openVisitorTalk(who: VisitorId, position?: { x: number; y: number }) {
    if (!farm.loaded || farm.loadFailed) return;
    closePersonalChat();
    if (position) {
      const standSpot = approachSpotForTarget(playerAnchor, position, []) ?? {
        x: position.x - 14, y: position.y + 3,
      };
      moveTo(standSpot.x, standSpot.y, { faceTowardX: position.x });
    }
    setVisitorSpeaker(who);
    setVisitorDraft("");
    setVisitorHint("");
    setVisitorOnline(Boolean(apiKey));
    const profile = resolveVisitorDisplayProfile(who, farm.whaleSync);
    setVisitorThreads((prev) =>
      prev[who].length
        ? prev
        : { ...prev, [who]: [{ id: chatId(), role: "assistant", text: profile.greetings[0] }] },
    );
  }

  function closeVisitorChat() {
    visitorRequest.current?.abort();
    visitorRequest.current = null;
    Keyboard.dismiss();
    setVisitorSpeaker(null);
    setVisitorBusy(false);
    setVisitorHint("");
  }

  async function sendVisitorChat(overrideText?: string) {
    const who = visitorSpeaker;
    const text = (overrideText ?? visitorDraft).trim();
    if (!who || !text || visitorBusy || visitorRequest.current) return;
    const controller = new AbortController();
    visitorRequest.current = controller;
    const historyBefore = visitorThreads[who];
    setVisitorThreads((prev) => ({
      ...prev,
      [who]: [...prev[who], { id: chatId(), role: "user", text }].slice(-36),
    }));
    if (!overrideText) setVisitorDraft("");
    setVisitorBusy(true);
    setVisitorHint("");
    try {
      const nowAt = eventTime();
      const vEmotion = resolveVisitorEmotion(who, farm.visitorState, farm.whaleSync, nowAt);
      const res = await runVisitorChatTurn({
        who, text, history: historyBefore,
        scene: {
          day: farm.day, season: farm.seasonName, night: farm.night,
          weather: farm.weather, rainbow: farm.rainbow, period: farm.period,
        },
        sleepDeprived: farm.sleepDeprived,
        emotion: vEmotion,
        whaleSync: farm.whaleSync,
        apiKey,
        signal: controller.signal,
        now: nowAt,
      });
      if (controller.signal.aborted) return;
      setVisitorOnline(res.online);
      setVisitorHint(res.hint ?? "");
      setVisitorThreads((prev) => ({
        ...prev,
        [who]: [...prev[who], { id: `${chatId()}-v`, role: "assistant", text: res.reply }].slice(-36),
      }));
      if (who !== "dark_xushuiyin") {
        farm.setTown((prev) => ({
          ...prev,
          visitors: applyVisitorChatOutcome(prev.visitors ?? emptyVisitorState(), who, res, nowAt),
        }));
        if (who === "dafeiyu") {
          void speakWhale(res.reply);
          if (farm.whaleSyncEnabled) {
            useWhaleMemory.getState().applyMood(farmDeltaToWhaleEmotionDelta(res.emotionDelta), nowAt);
            if (res.reaction !== "insult" && res.reaction !== "teasing" && !res.refusingChat) {
              useWhaleMemory.getState().bumpBond("interaction", nowAt);
            }
          }
        }
      }
    } catch {
      // Aborted
    } finally {
      if (visitorRequest.current === controller) {
        visitorRequest.current = null;
        setVisitorBusy(false);
      }
    }
  }

  const openGroupChat = (
    initialMembers?: readonly ResidentId[],
    seedRecord?: ResidentConversation,
  ) => {
    if (!farm.loaded || farm.loadFailed) return;
    closePersonalChat();
    setLifeOpen(false);
    clearGroupRevealTimers();
    if (initialMembers && initialMembers.length >= 2) {
      farm.setGroupMembers([...new Set(initialMembers)]);
    }
    if (seedRecord) farm.setGroupMessages(seedGroupMessagesFromRecord(seedRecord));
    setGroupOnline(Boolean(apiKey));
    setGroupHint("");
    setGroupOpen(true);
  };

  const closeGroupChat = () => {
    groupRequest.current?.abort();
    clearGroupRevealTimers();
    Keyboard.dismiss();
    setGroupOpen(false);
  };

  const executeGroupTurn = async (banterOnly: boolean) => {
    if (!farm.loaded || farm.loadFailed || groupBusy || groupRequest.current) return;
    const text = banterOnly ? "" : groupDraft.trim();
    if (!banterOnly && !text) return;
    clearGroupRevealTimers();
    const activeMembers =
      farm.groupMembers.length >= 2 ? farm.groupMembers : (["door", "gu"] as ResidentId[]);
    const controller = new AbortController();
    groupRequest.current = controller;
    const at = eventTime();
    const historyBefore = farm.groupMessages;
    let actionHint = "";
    if (!banterOnly) {
      farm.setGroupMessages((prev) =>
        [...prev, { id: chatId(), speaker: "player" as const, text, at }].slice(-50),
      );
      setGroupDraft("");
      const groupAction = extractGroupAction(text, activeMembers);
      if (groupAction) {
        const res = residents.command(groupAction.actor, groupAction.action);
        if (res.ok) {
          const actorName = RESIDENTS[groupAction.actor].name;
          actionHint =
            groupAction.action.type === "talk_to"
              ? `已安排${actorName}去找${RESIDENTS[groupAction.action.target].name}`
              : `已安排${actorName}去执行，关闭群聊后会马上出发`;
        }
      }
    }
    setGroupBusy(true);
    setGroupHint(actionHint);
    try {
      const result = await runFarmGroupTurn({
        text,
        members: activeMembers,
        memories: farm.memories,
        recentMessages: historyBefore,
        scene: {
          day: farm.day, season: farm.seasonName, growing: farm.growing, ripe: farm.ripe,
          night: farm.night, weather: farm.weather, rainbow: farm.rainbow, period: farm.period,
        },
        studyBrief: farm.studyContext.brief || undefined,
        sleepDeprivedNote: farm.sleepDeprived
          ? "昨晚黑暗邪恶形态的徐睡阴裹着被子扛电脑来农场疯狂打瓦吵所有人睡觉，今天全员睡眠不足顶着黑眼圈，可以自然吐槽或调侃这件事。"
          : undefined,
        apiKey,
        signal: controller.signal,
        at,
        banterOnly,
      });
      if (controller.signal.aborted) return;
      setGroupOnline(result.online);
      setGroupHint([actionHint, result.hint].filter(Boolean).join(" · "));
      const incoming: FarmGroupMessage[] = result.lines.map((line, index) => ({
        id: `${chatId()}-g${index}`,
        speaker: line.speaker,
        text: line.text,
        ...(line.mood ? { mood: line.mood } : {}),
        at: at + index + 1,
      }));
      if (incoming.length <= 1 || reduceMotion) {
        farm.setGroupMessages((prev) => [...prev, ...incoming].slice(-50));
      } else {
        farm.setGroupMessages((prev) => [...prev, incoming[0]].slice(-50));
        setGroupTypingLabel(`${RESIDENTS[incoming[1].speaker as ResidentId].name} 正在接话…`);
        for (let i = 1; i < incoming.length; i++) {
          const msg = incoming[i];
          const nextMsg = incoming[i + 1];
          const timer = setTimeout(() => {
            farm.setGroupMessages((prev) => [...prev, msg].slice(-50));
            setGroupTypingLabel(
              nextMsg ? `${RESIDENTS[nextMsg.speaker as ResidentId].name} 正在接话…` : "",
            );
          }, i * 520);
          groupRevealTimers.current.push(timer);
        }
      }
      farm.setMemories((previous) => {
        let next = recordGroupChatMemory(previous, activeMembers, text, result.lines, result.memory, at);
        if (!banterOnly) {
          const responderSet = new Set(result.lines.map((l) => l.speaker));
          for (const id of activeMembers) {
            if (result.reaction === "neutral" && !responderSet.has(id)) continue;
            const p = PERSONALITIES[id];
            const interested = Boolean(p?.interests.some((topic) => text.includes(topic)) && text.length >= 6);
            const curEm = getResidentEmotion(next[id], id, at);
            const impact = evaluateNpcSocialImpact({
              actorId: id, current: curEm, reaction: result.reaction, interested, now: at,
            });
            const desc = describeFarmEmotion(impact.nextEmotion);
            const delta =
              result.reaction === "insult" ? -(p?.insultLoss ?? 8)
                : result.reaction === "teasing" ? -(p?.teaseLoss ?? 4)
                  : result.reaction === "warm" ? Math.max(1, Math.round((p?.warmGain ?? 2) / 2))
                    : result.reaction === "apology" ? (p?.apologyGain ?? 1) : 0;
            next = {
              ...next,
              [id]: {
                ...next[id],
                affinity: Math.min(100, Math.max(0, next[id].affinity + delta)),
                emotion: impact.nextEmotion,
                ...(desc.legacyMood ? { mood: desc.legacyMood } : {}),
              },
            };
          }
        }
        return next;
      });
    } catch (error) {
      if (!controller.signal.aborted) {
        setGroupHint(error instanceof FarmChatError ? error.message : "群聊暂时不可用");
      }
    } finally {
      if (groupRequest.current === controller) {
        groupRequest.current = null;
        setGroupBusy(false);
      }
    }
  };

  const sendChat = async (raw: string, followUpRecord?: ResidentConversation) => {
    const text = raw.trim();
    const who = speaker;
    if (!text || !who || !farm.loaded || farm.loadFailed || chatBusy || personalRequest.current)
      return;
    const request = new AbortController();
    personalRequest.current = request;
    const memory = farm.memories[who];
    const privateReply = privateFarmChatReply(who, text, Math.floor(memory.affinity / 2));
    const dutyCommand = detectDutyCommand(text, who);
    const seededRumor = detectSeedRumorFromChat(text, who, eventTime());
    if (seededRumor) {
      farm.setTown((prev) => ({
        ...prev,
        events: [
          ...prev.events.filter((ev) => ev.expiresAt > seededRumor.createdAt && ev.title !== seededRumor.title),
          seededRumor,
        ].slice(-12),
      }));
    }
    const continuing = isFarmChatContinuation(text);
    const discussion = playerDiscussionCommand(text, who);
    const talkContext = threads[who]
      .filter((message) => message.role === "user")
      .map((message) => ({ player: message.text }));
    const explicitTalk = playerTalkCommand(text, who, talkContext);
    const previousQuestion = followUpRecord?.discussion?.question;
    const previousTarget = followUpRecord?.participants[1];
    const followUpDetail = text.slice(0, 116);
    const followUpQuestion =
      previousQuestion && previousTarget && followUpRecord?.participants[0] === who
        ? previousQuestion.slice(0, 156 - followUpDetail.length) + "；补充：" + followUpDetail
        : undefined;
    const assignmentInput = understandAssignment(text, who, memory.assignment, talkContext, eventTime());
    const mine: FarmChatMsg = { id: chatId(), role: "user", text };
    setThreads((prev) => ({ ...prev, [who]: [...prev[who], mine].slice(-40) }));
    setDraft("");
    setChatBusy(true);
    setFollowUp(null);
    const heard = residents.settings.shareTopics ? heardFarmTopic(residents.history, who, text) : undefined;
    const familyMemory = heard ? familyTopicRecall(heard) : "";
    const project = RESIDENT_PROJECTS[who];
    const recentLife = residentReflections(residents.history, who);
    const taskReports = residents.history
      .filter((rec) => rec.source === "player_command" && rec.participants[0] === who && rec.requestOutcome)
      .slice(-2)
      .map((rec) => rec.requestOutcome!);
    const asksTaskReport =
      /(?:问得|办得|结果|回复|答复|怎么样了|说了什么|问清楚了吗)/.test(text) &&
      (taskReports.length > 0 || Boolean(memory.assignment));
    const askProject = /^(?:最近在忙什么|你最近在忙什么|你有什么小目标)[？?]?$/.test(text);
    const localReply = () =>
      asksTaskReport
        ? memory.assignment ? assignmentRecall(memory.assignment) : taskReports.at(-1)!
        : askProject
          ? `我最近想${project.goal}。${recentLife.find((note) => note.startsWith("最近抽空")) ?? "等有空，我想先" + project.activity + "。"}`
          : (personalityReply(who, text, localSocialReaction(text), memory.mood) ??
            offlineFarmRecall(who, memory, text) ??
            (familyMemory
              ? familyMemory + "你想接着聊哪一部分？"
              : fallbackLine(who, {
                  day: farm.day, coins: farm.coins,
                  growing: farm.growing, harvested: farm.harvested,
                })));
    let reply = "";
    let chatUnavailable = false;
    let action: NpcAction | null = null;
    let assignmentUpdate: FarmAssignment | undefined;
    let memoryUpdates: unknown[] | undefined;
    let replyEpisode: { text?: unknown; importance?: unknown; emotion?: unknown } | undefined;
    const localReaction = followUpQuestion ? "neutral" : localSocialReaction(text);
    let reaction = localReaction;
    const residentEmotionBefore = getResidentEmotion(memory, who, eventTime());
    const refusingBeforeChat = !followUpQuestion && isNpcRefusingChat(residentEmotionBefore, eventTime());
    const crossedBoundary = !apiKey && (reaction === "teasing" || reaction === "insult");
    const query = /^(?:请|能不能)?(?:帮我)?(?:联网搜(?:索)?|查(?:一)?下|搜(?:一)?下|搜索)[：:，,\s]*(.{2,120})$/u
      .exec(text)?.[1]?.trim();
    let sources: SearchHit[] = [];
    setChatHint("");
    const boundaryReply = () => boundaryReplyForResident(who, reaction, text, memory.mood);
    const personaMemoryText = formatPersonaMemoryBlock(who, memory, {
      query: text, peers: ["player"], at: eventTime(), includePrivate: true, maxEpisodes: 5,
    });
    const pendingRelayIntent = assignmentInput?.execute
      ? assignmentInput.execute
      : explicitTalk?.type === "talk_to" && explicitTalk.purpose
        ? {
            target: explicitTalk.target,
            purpose: explicitTalk.purpose,
            intent: explicitTalk.intent ?? detectRelayIntent(explicitTalk.purpose),
          }
        : null;
    try {
      if (refusingBeforeChat && localReaction !== "apology") {
        reply = npcRefusalLine(who);
        action = null;
        setChatHint("对方正在拒绝沟通，输入一句真诚道歉或点上方「送礼」破冰吧");
        setChatOffline(false);
      } else if (crossedBoundary) {
        reply = boundaryReply();
        setChatOffline(true);
      } else if (followUpQuestion && previousTarget) {
        action = {
          type: "talk_to", target: previousTarget, purpose: followUpQuestion,
          intent: detectRelayIntent(followUpQuestion),
        };
        reply = formatAssignmentAck(who, previousTarget, followUpQuestion, detectRelayIntent(followUpQuestion));
        setChatOffline(true);
      } else if (dutyCommand) {
        farm.setTown((prev) => {
          const nextDuties = { ...prev.duties };
          if (dutyCommand.duty) nextDuties[who] = dutyCommand.duty;
          else delete nextDuties[who];
          return { ...prev, duties: nextDuties };
        });
        reply = dutyCommand.reply;
        setChatHint(
          dutyCommand.duty
            ? `已为${RESIDENTS[who].name}设置长期分工：${RESIDENT_DUTIES[dutyCommand.duty].label}`
            : `已取消${RESIDENTS[who].name}的长期分工`,
        );
        setChatOffline(false);
      } else if (privateReply !== null) {
        reply = privateReply;
      } else if (query && (!farmWebSearch || !apiKey)) {
        reply = NPC_CHAT_UNAVAILABLE;
        chatUnavailable = true;
      } else if (discussion) {
        action = discussion;
        reply = "";
        setChatOffline(true);
      } else if (!query && assignmentInput && (!assignmentInput.execute || !apiKey)) {
        assignmentUpdate = assignmentInput.task;
        reply = assignmentInput.reply;
        if (assignmentInput.cancel && memory.assignment?.engineId)
          residents.cancelCommand(who, memory.assignment.engineId);
        if (assignmentInput.execute) action = { type: "talk_to", ...assignmentInput.execute };
        setChatOffline(true);
      } else if (pendingRelayIntent && !apiKey) {
        if (assignmentInput) assignmentUpdate = assignmentInput.task;
        action = { type: "talk_to", ...pendingRelayIntent };
        reply = formatAssignmentAck(
          who, pendingRelayIntent.target, pendingRelayIntent.purpose, pendingRelayIntent.intent,
        );
        setChatOffline(true);
      } else if (!apiKey || (continuing && !memory.turns.length)) {
        action = continuing ? null : localNpcCommand(text, who);
        reply = action
          ? "好呀，交给我来办。"
          : reaction === "apology" && (memory.mood === "生气" || memory.mood === "不悦")
            ? "我听到了。给我一点时间，我们慢慢说。"
            : localReply();
        if (!action && reaction !== "apology" && !askProject && !asksTaskReport) {
          reply = NPC_CHAT_UNAVAILABLE;
          chatUnavailable = true;
        }
        setChatOffline(true);
      } else {
        if (query) {
          sources = await searchWeb(query, request.signal, apiKey);
          if (request.signal.aborted) return;
        }
        const relayContextHint = pendingRelayIntent
          ? `\n本轮玩家明确托你去找${RESIDENTS[pendingRelayIntent.target].name}（意图：${pendingRelayIntent.intent}，内容：${JSON.stringify(pendingRelayIntent.purpose)}）。请用你自己的性格口吻自然接下（绝不要说“我记住了：找XX问「…」”这类工单话术），并在 action 里输出 {"type":"talk_to","target":"${pendingRelayIntent.target}","purpose":${JSON.stringify(pendingRelayIntent.purpose)},"intent":"${pendingRelayIntent.intent}"}。`
          : "";
        const rawReply = await farmChat(
          [
            {
              role: "system",
              content: buildResidentChatSystemPrompt({
                who, day: farm.day, seasonName: farm.seasonName, coins: farm.coins,
                growing: farm.growing, ripe: farm.ripe, harvested: farm.harvested,
                weather: farm.weather, rainbow: farm.rainbow, period: farm.period, night: farm.night,
                query, memory, project, recentLife, coop: farm.gear.coop,
                personaMemoryText, studyBrief: farm.studyContext.brief,
                sleepDeprived: farm.sleepDeprived, nightSoloEvent, taskReports,
                relayContextHint, familyMemory, at: eventTime(),
              }),
            },
            ...farmChatContext(memory, text).flatMap((turn) => [
              { role: "user" as const, content: turn.player },
              { role: "assistant" as const, content: turn.reply },
            ]),
            {
              role: "user",
              content: query
                ? JSON.stringify({
                    question: text,
                    searchResults: sources.slice(0, 4).map((hit) => ({
                      title: hit.title.slice(0, 120),
                      snippet: hit.snippet.slice(0, 300),
                    })),
                  })
                : text,
            },
          ],
          apiKey,
          {
            timeoutMs: 16000, maxTokens: 560, retries: 2,
            validate: (rawText) => parseNpcReply(rawText, true) !== null,
            signal: request.signal,
          },
        );
        if (request.signal.aborted) return;
        const parsed = parseNpcReply(rawReply, true);
        if (parsed) {
          reaction = query ? "neutral" : resolveEffectiveSocialReaction(text, parsed.reaction);
          reply = parsed.reply;
          memoryUpdates = parsed.memoryUpdates;
          replyEpisode = parsed.episode;
          action =
            continuing || query || reaction === "teasing" || reaction === "insult"
              ? null
              : parsed.action;
          if (!action && pendingRelayIntent && reaction !== "teasing" && reaction !== "insult") {
            action = { type: "talk_to", ...pendingRelayIntent };
          }
          if (assignmentInput?.execute) assignmentUpdate = assignmentInput.task;
        } else if (pendingRelayIntent) {
          if (assignmentInput) assignmentUpdate = assignmentInput.task;
          action = { type: "talk_to", ...pendingRelayIntent };
          reply = formatAssignmentAck(
            who, pendingRelayIntent.target, pendingRelayIntent.purpose, pendingRelayIntent.intent,
          );
          setChatOffline(true);
        } else {
          reply = NPC_CHAT_UNAVAILABLE;
          chatUnavailable = true;
          action = null;
        }
        setChatOffline(false);
      }
    } catch (error) {
      if (request.signal.aborted) return;
      if (pendingRelayIntent) {
        if (assignmentInput) assignmentUpdate = assignmentInput.task;
        action = { type: "talk_to", ...pendingRelayIntent };
        reply = formatAssignmentAck(
          who, pendingRelayIntent.target, pendingRelayIntent.purpose, pendingRelayIntent.intent,
        );
        setChatOffline(true);
      } else {
        reply = NPC_CHAT_UNAVAILABLE;
        chatUnavailable = true;
        action = null;
        setChatOffline(true);
      }
      if (error instanceof FarmChatError && error.status !== undefined && !error.retryable) {
        console.warn("[farm-chat]", { status: error.status, reason: error.message });
      } else {
        console.warn("[farm-chat]", {
          reason: error instanceof FarmChatError ? error.message : "request-failed",
        });
      }
    } finally {
      if (personalRequest.current === request) {
        personalRequest.current = null;
        setChatBusy(false);
      }
    }
    if (request.signal.aborted) return;
    const nowAt = eventTime();
    const fallbackEpisode =
      !replyEpisode && !chatUnavailable && reaction !== "neutral"
        ? buildFallbackChatEpisode(reaction, text)
        : replyEpisode;
    if (privateReply === null && !query && !action && reply.trim()) {
      const turn = {
        id: mine.id, player: text, reply,
        ...(chatUnavailable ? { unavailable: true as const } : {}),
      };
      farm.setMemories((previous) => {
        let updated = recordFarmChatTurn(
          { ...previous[who], ...(assignmentUpdate ? { assignment: assignmentUpdate } : {}) },
          turn, reaction, who,
        );
        if (!chatUnavailable) {
          updated = applyPlayerMemoryUpdates(updated, memoryUpdates, text, nowAt, fallbackEpisode);
          updated = maybeSynthesizeReflection(updated, who, nowAt);
        }
        return { ...previous, [who]: updated };
      });
    }
    if (query && sources.length && reply && !reply.startsWith("这次没能"))
      reply += "\n\n参考：" + sources.slice(0, 2).map((hit) => hit.title + "\n" + hit.url).join("\n");
    if (action) {
      action =
        action.type === "talk_to" && assignmentUpdate?.question
          ? {
              ...action,
              purpose: assignmentUpdate.question,
              intent: action.intent ?? assignmentUpdate.intent ?? detectRelayIntent(assignmentUpdate.question),
            }
          : action.type === "talk_to" && action.purpose
            ? { ...action, intent: action.intent ?? detectRelayIntent(action.purpose) }
            : bindTalkPurpose(action, text, talkContext);
      if (action.type === "talk_to" && action.purpose && memory.assignment?.engineId)
        residents.cancelCommand(who, memory.assignment.engineId);
      const result = residents.command(who, action);
      if (!result.ok || action.type === "discuss") reply = result.message;
      if (result.ok && action.type === "talk_to" && action.purpose) {
        const reason = apiKey
          ? lifeRequestBlockReason(residents.usage, residents.settings, eventTime(), true)
          : "未配置 API Key";
        if (!reply.trim()) {
          reply = formatAssignmentAck(
            who, action.target, action.purpose, action.intent ?? detectRelayIntent(action.purpose),
          );
        }
        setChatHint(
          reason
            ? `已安排前往找${RESIDENTS[action.target].name}（本地对白：${reason}）`
            : `已安排前往找${RESIDENTS[action.target].name}（AI 联网对白）`,
        );
      }
      if (action.type === "talk_to" && action.purpose)
        assignmentUpdate = {
          id: assignmentUpdate?.id ?? mine.id,
          target: action.target,
          question: action.purpose,
          intent: action.intent ?? detectRelayIntent(action.purpose),
          status: result.ok ? "walking" : "interrupted",
          updatedAt: eventTime(),
          ...(result.id ? { engineId: result.id } : {}),
          ...(!result.ok ? { outcome: result.message } : {}),
        };
      farm.setMemories((previous) => {
        let updated = recordFarmChatTurn(
          { ...previous[who], ...(assignmentUpdate ? { assignment: assignmentUpdate } : {}) },
          { id: mine.id, player: text, reply },
          reaction,
          who,
        );
        updated = applyPlayerMemoryUpdates(updated, memoryUpdates, text, nowAt, fallbackEpisode);
        return { ...previous, [who]: updated };
      });
    }
    setThreads((prev) => ({
      ...prev,
      [who]: [...prev[who], { id: chatId(), role: "assistant" as const, text: reply || "我在这里陪着你。" }].slice(-40),
    }));
  };

  /* ---------------- 视口延展与 HUD 派生量 ---------------- */
  const effectiveHeaderH = headerHeight > 0 ? headerHeight : insets.top + 58;
  const availMapH = mapHeight > 0 ? mapHeight : Math.max(0, height - effectiveHeaderH);
  const bottomSkirtH = Math.max(0, Math.ceil(Math.max(availMapH - sceneH, hudOverlayH - 6)));
  const skirtStretch = 1.8;
  const skirtTileH = Math.max(22, Math.round(sceneH * 0.026 * skirtStretch));
  const skirtImageH = Math.round(sceneH * skirtStretch);
  const skirtTileCount = bottomSkirtH > 0 ? Math.ceil(bottomSkirtH / skirtTileH) : 0;

  const weigangAtPond = (() => {
    const wg = residents.getResidents().find((r) => r.id === "weigang");
    return Boolean(
      wg && Math.hypot(wg.logicalPosition.x - POND.approach.x, wg.logicalPosition.y - POND.approach.y) <= 46,
    );
  })();
  const pondNeedsWater = farm.gear.rust < 100 && farm.water < farm.waterCap;
  const pondFishingBonus = weigangAtPond || farm.period === "evening" || farm.period === "night";
  const activeTownEvents = farm.town.events.filter((ev) => ev.expiresAt > now);
  const unfulfilledWishCount = farm.dailyWishes.filter((w) => !w.fulfilled).length;
  const townBadgeCount = activeTownEvents.length + farm.storyBadgeCount + unfulfilledWishCount;
  const activeVisitorName = farm.activeNormalVisitor
    ? resolveVisitorDisplayProfile(farm.activeNormalVisitor, farm.whaleSync).name
    : undefined;
  const canShowRecap = farmForeground && entranceFinished && residents.ready && !farm.loadFailed;
  const unreadReportIds = new Set(
    (residents.ready
      ? unreadRequestReports(residents.history, farm.recapReadIds, farm.recapSeenAt)
      : []
    ).map((row) => row.id),
  );
  const recap = canShowRecap
    ? {
        mature: farm.plots.flatMap((plot, index) =>
          plot.crop && farm.grown[index] >= CROP_META[plot.crop].growMs ? [index] : [],
        ),
        orders: farm.deliverableOrderList,
        reports: unreadReportIds.size,
      }
    : null;

  const renderShop = (
    vendor: Vendor,
    section: "trade" | "requests" | "sell" | "guide" | "craft",
  ) => (
    <FarmShopSectionHost
      vendor={vendor}
      section={section}
      journal={farm.journal}
      now={now}
      gear={farm.gear}
      canUpgrade={farm.canUpgrade}
      bagCap={farm.bagCap}
      economy={farm.economy}
      coins={farm.coins}
      level={farm.level}
      season={farm.season}
      seeds={farm.seeds}
      stacks={farm.stacks}
      compost={farm.compost}
      vendorPrice={farm.vendorPrice}
      beginVendorAction={farm.beginVendorAction}
      onSmithService={farm.smithService}
      onImproveIrrigation={farm.improveIrrigation}
      onBuyCoopSupply={farm.buyCoopSupply}
      onBuyOffer={farm.buyOffer}
      onUpdateEconomy={farm.setEconomy}
      onAddCoins={(delta) => farm.setCoins((c) => c + delta)}
      onUpdateGear={farm.setGear}
      onUpdateJournal={farm.setJournal}
      onSelectCompostFromShop={() => {
        setFertilizing(true);
        setSupply(null);
        setShopOpen(false);
      }}
      onSellStock={farm.sellStock}
      onDeliverOrder={farm.deliverOrder}
      onMakeRecipe={farm.makeRecipe}
      onBuildKitchen={farm.buildKitchen}
      onRescueSeeds={farm.rescueSeeds}
    />
  );

  const anySheetBlockingMap =
    shopOpen || houseOpen || bagOpen || gameOpen || lifeOpen || groupOpen || townOpen || speaker !== null;

  return (
    <View style={st.root}>
      <StatusBar style={entranceFinished ? "dark" : "light"} />

      <FarmTopHud
        insetTop={insets.top}
        shopOpen={shopOpen}
        level={farm.level}
        day={farm.day}
        seasonName={farm.seasonName}
        clock={farm.clock}
        periodLabel={PERIOD_SHORT_LABELS[farm.period]}
        coins={farm.coins}
        sfxOn={sfxOn}
        lifeOpen={lifeOpen}
        hasUnreadReports={unreadReportIds.size > 0}
        onLayoutHeight={(next) =>
          setHeaderHeight((prev) => (Math.abs(prev - next) >= 1 ? next : prev))
        }
        onBack={() => (shopOpen ? setShopOpen(false) : router.back())}
        onToggleSfx={toggleSfx}
        onOpenSettings={() => {
          setLifeInitialTab("life");
          setLifeReportsOnly(false);
          setLifeOpen(true);
        }}
      />

      <FarmWorldStage
        farm={farm}
        sceneW={sceneW}
        sceneH={sceneH}
        sceneFrameStyle={sceneFrameStyle}
        scale={scale}
        bottomSkirtH={bottomSkirtH}
        skirtTileH={skirtTileH}
        skirtImageH={skirtImageH}
        skirtTileCount={skirtTileCount}
        farmScrollRef={farmScroll}
        onMapHeightChange={setMapHeight}
        onTerrainPainted={() => setTerrainPainted(true)}
        focused={focused}
        quality={quality}
        now={now}
        decorReady={decorReady}
        folkReady={folkReady}
        shopOpen={shopOpen}
        marketOrders={marketOrders}
        bagOpen={bagOpen}
        lifeOpen={lifeOpen}
        houseOpen={houseOpen}
        gameOpen={gameOpen}
        groupOpen={groupOpen}
        townOpen={townOpen}
        focusOpen={focusOpen}
        festivalOpen={festivalOpen}
        fishingOpen={fishingOpen}
        storiesOpen={storiesOpen}
        decorOpen={decorOpen}
        randomEventModalOpen={randomEventModalOpen}
        speaker={speaker}
        visitorSpeaker={visitorSpeaker}
        apiKey={apiKey}
        farmWebSearch={farmWebSearch}
        onCloseShop={() => setShopOpen(false)}
        renderShop={renderShop}
        pondNeedsWater={pondNeedsWater}
        weigangAtPond={weigangAtPond}
        pondFishingBonus={pondFishingBonus}
        onOpenBugGame={openBugGame}
        onEnterHouse={enterHouse}
        onGoToMarket={goToMarket}
        onOpenFishing={() => {
          moveTo(POND.approach.x, POND.approach.y);
          setFishingOpen(true);
        }}
        onOpenFestival={() => setFestivalOpen(true)}
        onShowToast={showToast}
        playerAnchor={playerAnchor}
        playerMoving={playerMoving}
        playerStyle={playerStyle}
        playerFacingStyle={playerFacingStyle}
        heroEmotionPose={heroEmotionPose}
        walkRipple={walkRipple}
        onMoveTo={moveTo}
        residents={residents}
        lifeInitialTab={lifeInitialTab}
        lifeReportsOnly={lifeReportsOnly}
        unreadReportIds={unreadReportIds}
        recapVisible={recapVisible}
        followedId={followedId}
        sleepingResidents={sleepingResidents}
        nightSoloEvent={nightSoloEvent}
        interruptedRequests={interruptedRequests}
        onOpenRecapFromLife={() => {
          setLifeOpen(false);
          setRecapManuallyOpen(true);
        }}
        onCloseLifePanel={() => setLifeOpen(false)}
        onTalkResident={openTalk}
        onJoinGroup={openGroupChat}
        onSetDraft={setDraft}
        onResumeRequest={resumeRequest}
        onFollowUp={(recordEntry) => {
          setLifeOpen(false);
          openTalk(recordEntry.participants[0]);
          setFollowUp(recordEntry);
        }}
        onOpenVisitorTalk={openVisitorTalk}
        onOpenRandomEventModal={openRandomEventModal}
        mapOverlay={
          <FarmMapHud
            recap={recap}
            recapHidden={anySheetBlockingMap}
            recapManuallyOpen={recapManuallyOpen}
            onRecapVisibleChange={setRecapVisible}
            onCloseRecap={() => setRecapManuallyOpen(false)}
            onScrollToCrop={(index) => {
              const plot = plotPos(index);
              const visibleMapH = Math.max(180, mapHeight - hudOverlayH);
              farmScroll.current?.scrollTo({
                y: Math.max(0, (plot.y + plot.h / 2) * scale - visibleMapH / 2),
                animated: true,
              });
            }}
            onOpenOrders={() => goToMarket(true)}
            onOpenReports={() => {
              setLifeInitialTab("logs");
              setLifeReportsOnly(true);
              setLifeOpen(true);
            }}
            toast={toast}
            sceneW={sceneW}
            hudOverlayH={hudOverlayH}
            showHorrorBanner={
              Boolean(farm.visitorState.horrorActive) &&
              !anySheetBlockingMap &&
              visitorSpeaker === null
            }
            onOpenHorror={() => openVisitorTalk("dark_xushuiyin")}
            followedId={followedId}
            showFollowBar={!anySheetBlockingMap}
            period={farm.period}
            weather={farm.weather}
            rainbow={farm.rainbow}
            activeEvents={activeTownEvents}
            onTalkFollowed={(who) => {
              const model = residents.getResidents().find((r) => r.id === who);
              openTalk(who, model?.logicalPosition);
            }}
            onStopFollow={() => setFollowedId(null)}
          />
        }
      />

      <FarmBottomDock
        insetsBottom={insets.bottom}
        shopOpen={shopOpen}
        weather={farm.weather}
        rainbow={farm.rainbow}
        period={farm.period}
        ripe={farm.ripe}
        dryPlots={farm.dryPlots}
        growing={farm.growing}
        water={farm.water}
        waterCap={farm.waterCap}
        canRust={farm.gear.rust}
        selectedSeed={selected}
        selectedSeedCount={selected ? farm.seeds[selected] : 0}
        fertilizing={fertilizing}
        compost={farm.compost}
        supply={supply}
        supplyCount={supply ? farm.gear.extras[supply] : 0}
        bagTier={farm.gear.bag}
        deliverableOrderCount={farm.deliverableOrderList.length}
        townBadgeCount={townBadgeCount}
        storyBadgeCount={farm.storyBadgeCount}
        horrorActive={Boolean(farm.visitorState.horrorActive)}
        activeRandomEventTitle={farm.activeRandomEvent?.title}
        activeVisitorName={activeVisitorName}
        saveBanner={
          farm.loadFailed
            ? "存档读取失败，请退出农场重进"
            : farm.saveError
              ? "保存失败，请保持应用开启"
              : null
        }
        townOpen={townOpen}
        groupOpen={groupOpen}
        bagOpen={bagOpen}
        focusOpen={focusOpen}
        onClearTool={() => {
          setSelected(null);
          setFertilizing(false);
          setSupply(null);
          showToast("已收起手持工具");
        }}
        onMarketPress={() => (shopOpen ? setShopOpen(false) : goToMarket())}
        onTownPress={() => {
          setGazetteError("");
          setTownOpen(true);
        }}
        onGroupPress={() => openGroupChat()}
        onBagPress={() => {
          setBagDetail("");
          setInspectCan(false);
          setBagOpen(true);
        }}
        onFocusPress={() => setFocusOpen(true)}
        onBulkHarvest={farm.bulkHarvest}
        onBulkWater={farm.bulkWater}
        onFetchWater={farm.fetchWater}
        onOpenHorror={() => openVisitorTalk("dark_xushuiyin")}
        onOpenRandomEvent={openRandomEventModal}
        onOpenVisitor={() => {
          if (farm.activeNormalVisitor) openVisitorTalk(farm.activeNormalVisitor);
        }}
        onEnterHouse={enterHouse}
        onOpenFishing={() => {
          moveTo(POND.approach.x, POND.approach.y);
          setFishingOpen(true);
        }}
        onOpenStories={() => setStoriesOpen(true)}
        onOpenDecor={() => setDecorOpen(true)}
        onOpenLogs={() => {
          setLifeInitialTab("logs");
          setLifeReportsOnly(false);
          setLifeOpen(true);
        }}
      />

      <FarmSheetsHost
        farm={farm}
        now={now}
        selected={selected}
        chatMaxH={chatMaxH}
        apiKey={apiKey}
        residentHistory={residents.history}
        getResidentPosition={(who) =>
          residents.getResidents().find((r) => r.id === who)?.logicalPosition
        }
        getResidentMood={(who) =>
          residents.getResidents().find((r) => r.id === who)?.mood
        }
        showToast={showToast}
        weigangAtPond={weigangAtPond}
        sleepingResidents={sleepingResidents}
        nightSoloEvent={nightSoloEvent}
        bagOpen={bagOpen}
        bagDetail={bagDetail}
        inspectCan={inspectCan}
        onCloseBag={closeBag}
        speaker={speaker}
        chatOffline={chatOffline}
        giftBarOpen={giftBarOpen}
        memoryBookOpen={memoryBookOpen}
        chatBusy={chatBusy}
        followUp={followUp}
        threads={threads}
        draft={draft}
        chatHint={chatHint}
        chatInputRef={chatInputRef}
        onClosePersonalChat={closePersonalChat}
        onToggleGiftBar={() => {
          setMemoryBookOpen(false);
          setGiftBarOpen((prev) => !prev);
        }}
        onToggleMemoryBook={() => {
          setGiftBarOpen(false);
          setMemoryBookOpen((prev) => !prev);
        }}
        onOpenGroupChat={openGroupChat}
        onChangeDraft={setDraft}
        onSendChat={sendChat}
        groupOpen={groupOpen}
        groupBusy={groupBusy}
        groupDraft={groupDraft}
        onChangeGroupDraft={setGroupDraft}
        groupOnline={groupOnline}
        groupHint={groupHint}
        groupTypingLabel={groupTypingLabel}
        onCloseGroupChat={closeGroupChat}
        onExecuteGroupTurn={executeGroupTurn}
        onClearGroupChat={() => {
          clearGroupRevealTimers();
          farm.setGroupMessages([]);
          setGroupHint("");
        }}
        townOpen={townOpen}
        setTownOpen={setTownOpen}
        gazettePolishing={gazettePolishing}
        gazetteError={gazetteError}
        setGazetteError={setGazetteError}
        onCloseTownBoard={() => {
          gazetteRequest.current?.abort();
          setGazettePolishing(false);
          setTownOpen(false);
        }}
        onPolishGazette={() => {
          if (!apiKey || gazettePolishing) return;
          gazetteRequest.current?.abort();
          const controller = new AbortController();
          gazetteRequest.current = controller;
          setGazettePolishing(true);
          setGazetteError("");
          const draftGazette = compileFarmGazette({
            day: farm.day,
            seasonIndex: farm.season,
            weather: farm.weather,
            rainbow: farm.rainbow,
            history: residents.history,
            town: farm.town,
            memories: farm.memories,
            studyNote: farm.studyContext.gazetteNote || undefined,
            at: eventTime(),
          });
          void polishGazetteWithAI(draftGazette, apiKey, controller.signal)
            .then((polished) => {
              if (!controller.signal.aborted) {
                farm.setTown((prev) => ({ ...prev, gazette: polished }));
              }
            })
            .catch((error) => {
              if (!controller.signal.aborted) {
                setGazetteError(
                  error instanceof FarmChatError
                    ? error.message
                    : "日报润色失败，已保留实时简报",
                );
              }
            })
            .finally(() => {
              if (gazetteRequest.current === controller) {
                gazetteRequest.current = null;
                setGazettePolishing(false);
              }
            });
        }}
        followedId={followedId}
        setFollowedId={setFollowedId}
        onMarkManualDismissedSlot={(slotKey) => {
          manualDismissedSlotRef.current = slotKey;
        }}
        onTalkResident={openTalk}
        onOpenFocus={() => setFocusOpen(true)}
        onOpenFestival={() => setFestivalOpen(true)}
        onOpenFishing={() => setFishingOpen(true)}
        onOpenStories={() => setStoriesOpen(true)}
        onOpenDecor={() => setDecorOpen(true)}
        onOpenHouse={() => setHouseOpen(true)}
        onOpenRandomEventModal={openRandomEventModal}
        onTalkVisitor={(who) => openVisitorTalk(who)}
        visitorSpeaker={visitorSpeaker}
        visitorThreads={visitorThreads}
        visitorBusy={visitorBusy}
        visitorOnline={visitorOnline}
        visitorHint={visitorHint}
        visitorDraft={visitorDraft}
        onChangeVisitorDraft={setVisitorDraft}
        onSendVisitorChat={sendVisitorChat}
        onCloseVisitorChat={closeVisitorChat}
        focusOpen={focusOpen}
        onCloseFocus={() => setFocusOpen(false)}
        festivalOpen={festivalOpen}
        onCloseFestival={() => setFestivalOpen(false)}
        fishingOpen={fishingOpen}
        onCloseFishing={() => setFishingOpen(false)}
        storiesOpen={storiesOpen}
        onCloseStories={() => setStoriesOpen(false)}
        decorOpen={decorOpen}
        onCloseDecor={() => setDecorOpen(false)}
        houseOpen={houseOpen}
        onCloseHouse={closeHouse}
        randomEventModalOpen={randomEventModalOpen}
        onDismissRandomEvent={closeRandomEventModal}
        gameOpen={gameOpen}
        gameToken={gameToken}
        onCloseGame={() => setGameOpen(false)}
      />

      {!entranceFinished ? (
        <Animated.View
          accessible={false}
          importantForAccessibility="no-hide-descendants"
          style={[StyleSheet.absoluteFill, st.entranceCover, entranceStyle]}
        />
      ) : null}
    </View>
  );
}
