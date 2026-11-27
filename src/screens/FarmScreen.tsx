import { FarmButton } from "@/components/farm/FarmSkin";
/* eslint-disable react-hooks/immutability --
   Reanimated 共享值（px/py/face 等）本质是跨渲染、跨线程可变的容器，
   在事件回调与 effect 中赋值是官方标准用法，React 编译器的不可变假设不适用 */

import { deferredJSONWriter, getStoredText } from '@/utils/coordinatedStorage';
import { useAnimationActive } from '@/hooks/useAnimationActive';
import { renderQuality } from '@/utils/renderQuality';
import { useIsFocused, useRouter } from "expo-router";
import { StatusBar } from "expo-status-bar";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ComponentRef,
} from "react";
import {
  Alert,
  AppState,
  Keyboard,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
  useWindowDimensions,
} from "react-native";
import Animated, {
  cancelAnimation,
  Easing,
  runOnJS,
  useAnimatedStyle,
  useAnimatedReaction,
  useSharedValue,
  useReducedMotion,
  withSequence,
  withTiming,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useForegroundClock } from "@/hooks/useForegroundClock";
import { playSfx, risingRate } from "@/services/soundEffects";
import { speakWhale } from "@/services/whaleVoice";
import { useSoundEffects } from "@/store/useSoundEffects";
import { useStudyProgress } from "@/store/useStudyProgress";
import { FarmCropLayer } from "@/components/farm/FarmCropLayer";
import type { PlotState } from "@/utils/farmPlot";

import { CROP_ART, type CropKind } from "@/components/farm/sprites";
import {
  HOUSE,
  POND,
  COOP,
  MARKET,
  INTERACTION_ZONES,
  PLAYER_START,
  RESIDENT_PLACEMENTS,
  plotApproach,
} from "@/constants/farmMap";
import { farmPressPoint } from "@/utils/farmPressPoint";
import { planFarmRoute } from "@/utils/farmNavigation";
import { approachSpotForTarget } from "@/utils/farmResidentSpace";
import { FARM_SCENES } from "@/components/farm/sceneTextures";
import { FarmBottomDock, farmBottomDockHeight } from "@/components/farm/FarmBottomDock";
import { warmMarketAssets } from "@/components/farm/marketAssets";
import { FarmGroupChatSheet } from "@/components/farm/FarmGroupChatSheet";
import { FarmTownBoard } from "@/components/farm/FarmTownBoard";
import { FarmFocusModal } from "@/components/farm/FarmFocusModal";
import { FarmFestivalSheet } from "@/components/farm/FarmFestivalSheet";
import { FarmFishingModal } from "@/components/farm/FarmFishingModal";
import { FarmStoryAlbumSheet } from "@/components/farm/FarmStoryAlbumSheet";
import { FarmDecorSheet } from "@/components/farm/FarmDecorSheet";
import { FarmVisitorActor } from "@/components/farm/FarmVisitorActor";
import { FarmVisitorSheet } from "@/components/farm/FarmVisitorSheet";
import {
  COOP_SUPPLIES,
  coopComfort,
  chickenCanHelp,
  type CoopSupply,
} from "@/utils/farmCoop";
import {
  npcRefusalLine,
  PERSONALITIES,
  personalityReply,
} from "@/utils/farmPersonality";
import {
  vendorQuotedPrice,
  vendorCanTrade,
  negotiateVendorDeal,
} from "@/utils/farmMarket";
import { FarmRain } from "@/components/farm/FarmRain";
import { farmTime } from "@/utils/farmTime";
import {
  CROP_KINDS,
  CROP_META,
  consume,
  cropRecord,
  restoreEconomy,
  harvestResult,
  stockCount,
  stockValue,
  completeOrder,
  deliverableOrders,
  irrigationCost,
  wetDuration,
  craft,
  type Recipe,
} from "@/utils/farmEconomy";
import { FarmBag, FarmMarket } from "@/components/farm/FarmMarket";
import {
  BAG_SLOTS,
  BAG_TIERS,
  CAN_TIERS,
  QUALITY,
  UPGRADE_PRICES,
  bagStacks,
  canCapacity,
  marketOffers,
  marketWindow,
  offerLevel,
  offerRemaining,
  rareOffer,
  pestAt,
  qualityOf,
  restoreGear,
  vendorAvailable,
  type BagStack,
  type Offer,
  type Vendor,
} from "@/utils/farmMarket";
import { realDate } from "@/utils/farmProgress";
import { BugGame } from "@/components/farm/BugGame";
import { HouseInterior } from "@/components/farm/HouseInterior";

import { FarmLifeLayer } from "@/components/farm/FarmLifeLayer";
import { FarmReturnSummary } from "@/components/farm/FarmReturnSummary";
import { FarmPersonSprite } from "@/components/farm/FarmPersonSprite";
import {
  FarmBottomSkirt,
  FarmDecorOverlay,
  FarmHeaderBar,
  FarmMapOverlays,
  FarmPersonalChatSheet,
  FarmPondActionBar,
  FarmRandomEventBanner,
  FarmShopSectionContent,
  Mote,
  NameTag,
} from "@/components/farm/FarmSceneHelpers";
import {
  MOTES,
  MINUTE,
  PERIOD_SHORT_LABELS,
  PLOT_COUNT,
  SAVE_KEY,
  SEASONS,
  VENDOR_MEMORY_KEYS,
  VIEW_H,
  VIEW_W,
  WAKE_HOUR,
  WET_MS,
  boundaryReplyForResident,
  buildFallbackChatEpisode,
  buildInterruptedRequestRecords,
  buildResidentChatSystemPrompt,
  chatId,
  emptyPlot,
  eventTime,
  fallbackLine,
  midnightOf,
  parseFarmSaveRaw,
  plotPos,
  syncResidentAssignmentMemories,
  type FarmChatMsg,
  type SaveData,
  type Speaker,
} from "@/components/farm/farmScreenConstants";
import { farmScreenStyles as st } from "@/components/farm/farmScreenStyles";

import {
  claimGoal,
  compostReward,
  fertilizedGrowth,
  emptyJournal,
  farmLevel,
  recordActivity,
  type FarmActivity,
} from "@/utils/farmProgress";
import { FarmChatError, farmChat } from "@/services/farmChat";
import { NPC_CHAT_UNAVAILABLE } from "@/services/farmVendorChat";
import {
  DISCUSSION_PROMPT,
  localNpcCommand,
  bindTalkPurpose,
  playerTalkCommand,
  playerDiscussionCommand,
  parseNpcReply,
  type NpcAction,
} from "@/utils/farmActions";
import {
  farmPlotGrowth as plotGrowth,
  waterFarmPlots,
} from "@/utils/farmWatering";
import { useFarmResidents } from "@/hooks/useFarmResidents";
import {
  RESIDENTS,
  RESIDENT_IDS,
  privateFarmChatReply,
  type ResidentId,
  type ResidentConversation,
  unreadRequestReports,
  lifeRequestBlockReason,
} from "@/utils/farmLife";
import { searchWeb, type SearchHit } from "@/services/whaleTools";
import {
  getResidentEmotion,
  localSocialReaction,
  resolveEffectiveSocialReaction,
  familyTopicRecall,
  farmChatContext,
  heardFarmTopic,
  isFarmChatContinuation,
  offlineFarmRecall,
  recordFarmChatTurn,
  restoreFarmMemories,
  shiftResidentMemoryEmotion,
} from "@/utils/farmMemory";
import { RESIDENT_PROJECTS, residentReflections } from "@/utils/farmAgency";
import {
  understandAssignment,
  assignmentRecall,
  formatAssignmentAck,
  detectRelayIntent,
  type FarmAssignment,
} from "@/utils/farmAssignment";
import {
  appendEpisode,
  applyPlayerMemoryUpdates,
  formatPersonaMemoryBlock,
  maybeSynthesizeReflection,
  recordGroupChatMemory,
  recordNpcConversationMemory,
  recordVerifiedGiftMemory,
  removeMemoryEpisode,
  removePlayerFact,
  type NpcConversationMemoryNote,
} from "@/utils/farmPersonaMemory";
import {
  compileFarmGazette,
  detectDutyCommand,
  detectSeedRumorFromChat,
  emptyTownState,
  polishGazetteWithAI,
  propagateTownEvents,
  RESIDENT_DUTIES,
  type FarmNeedsSnapshot,
  type FarmTownState,
  type ResidentDuty,
} from "@/utils/farmTown";
import {
  extractGroupAction,
  runFarmGroupTurn,
  seedGroupMessagesFromRecord,
  type FarmGroupMessage,
} from "@/utils/farmGroupChat";
import { useSettings } from "@/store/useSettings";
import { useActiveSchedule, useStore } from "@/store/useStore";
import { useWhalePersona } from "@/store/useWhalePersona";
import { useWhaleMemory } from "@/store/useWhaleMemory";
import { useWhalePet } from "@/store/useWhalePet";
import { FarmRandomEventModal } from "@/components/farm/FarmRandomEventModal";
import {
  describeFarmEmotion,
  evaluateNpcSocialImpact,
  farmDeltaToWhaleEmotionDelta,
  isNpcRefusingChat,
  sleepTransitionEmotionDelta,
  weatherEmotionPulse,
} from "@/utils/farmEmotion";
import {
  emptyRandomEventState,
  getRandomEventById,
  pickFarmRandomEvent,
  type FarmRandomEventChoice,
} from "@/utils/farmRandomEvents";
import {
  evaluateResidentGift,
  generateDailyWishes,
  giftLabel,
  type GiftItemId,
  type ResidentWish,
} from "@/utils/farmSocial";
import {
  applyPendingRewardsToFarmCoins,
  summarizeStudyDay,
} from "@/utils/farmStudyLink";
import {
  getAttendanceRiskCourses,
  getTodayFocusMinutes,
} from "@/utils/studyProgress";
import { emptyFocusStats, settleFocusSession } from "@/utils/farmFocus";
import { detectAvailableFestival, hostCampfireGathering } from "@/utils/farmFestivals";
import {
  applyFishingCatch,
  cookFishSoupFromBook,
  emptyFishingBook,
  FISH_META,
  sellFishFromBook,
  type CatchOutcome,
  type FishKind,
} from "@/utils/farmFishing";
import {
  claimStoryChapter,
  emptyStoryProgress,
  nextUnlockableChapter,
} from "@/utils/farmStories";
import {
  buildDecorAnnouncementEvent,
  emptyDecorState,
  getDecorMeta,
  type DecorId,
} from "@/utils/farmDecor";
import {
  applyVisitorChatOutcome,
  dismissActiveVisitor,
  emptyVisitorState,
  evaluateVisitorGift,
  formatVisitorStayHint,
  inviteVisitorToFarm,
  isFarmSleepDeprived,
  markVisitorSlotGreeted,
  recordHorrorAftermathToFamily,
  resolveHorrorBanish,
  resolveVisitorDisplayProfile,
  resolveVisitorEmotion,
  resolveVisitorVisit,
  runVisitorChatTurn,
  shouldTriggerNightHorror,
  visitorArrivalLine,
  visitorFarewellLine,
  type HorrorBanishMethod,
  type NormalVisitorId,
  type VisitorId,
  type WhaleVisitorSyncContext,
} from "@/utils/farmVisitors";
import {
  computeSleepingResidents,
  resolvePlayerSleep,
  TUCK_IN_REACTIONS,
  WAKE_UP_LINES,
} from "@/utils/farmSleep";
import {
  buildStarDewTownEvent,
  consumeStarDewBlessing,
} from "@/utils/nightSkyData";

/* -------------------------------------------------------------------------- */
/*  农场主界面                                                                 */
/* -------------------------------------------------------------------------- */

export function FarmScreen() {
  const router = useRouter();
  const focused = useIsFocused();
  const farmForeground = useAnimationActive(focused);
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const apiKey = useSettings((s) => s.apiKey);
  const quality = useSettings(s => s.renderQuality);
  const farmWebSearch = useSettings((s) => s.farmWebSearch);

  const [headerHeight, setHeaderHeight] = useState(0);
  const [mapHeight, setMapHeight] = useState(0);
  const sceneW = width;
  const scale = sceneW / VIEW_W;
  const sceneH = VIEW_H * scale;
  const hudOverlayH = farmBottomDockHeight(insets.bottom);
  /** 聊天消息区高度：小屏 + 键盘弹起时不把面板顶出屏幕 */
  const chatMaxH = Math.max(150, Math.min(258, Math.round(height * 0.32)));

  const [loaded, setLoaded] = useState(false);
  const now = useForegroundClock(30_000).getTime();
  /** 睡觉、小游戏攒出来的时间偏移：虚拟时间 = 真实时间 + 偏移 */
  const [timeShift, setTimeShift] = useState(0);
  /** 第 1 天 0 点对应的虚拟时间戳 */
  const [epoch, setEpoch] = useState(() => midnightOf(eventTime()));
  const [coins, setCoins] = useState(120);
  const [seeds, setSeeds] = useState<Record<CropKind, number>>(() => ({
    ...cropRecord(),
    radish: 3,
    wheat: 2,
  }));
  const [economy, setEconomy] = useState(() =>
    restoreEconomy(undefined, eventTime()),
  );
  const [saveError, setSaveError] = useState(false);
  const [saveWriter] = useState(() => deferredJSONWriter<SaveData>(SAVE_KEY));
  useEffect(() => {
    const unsubscribe = saveWriter.subscribe(error => setSaveError(Boolean(error)));
    const sub = AppState.addEventListener('change', state => {
      if (state !== 'active') void saveWriter.flush().catch(() => {});
    });
    return () => {
      unsubscribe();
      sub.remove();
      void saveWriter.flush().catch(() => {});
    };
  }, [saveWriter]);
  const [loadFailed, setLoadFailed] = useState(false);
  const [plots, setPlots] = useState<PlotState[]>(() =>
    Array.from({ length: PLOT_COUNT }, () => emptyPlot(eventTime())),
  );
  const [harvested, setHarvested] = useState(0);
  const [selected, setSelected] = useState<CropKind | null>(null);
  const [gear, setGear] = useState(restoreGear);
  const priceDealsRef = useRef(gear.priceDeals);
  useEffect(() => {
    priceDealsRef.current = gear.priceDeals;
  }, [gear.priceDeals]);
  const [vendorMemories, setVendorMemories] = useState(restoreFarmMemories);
  const vendorMemoryRef = useRef(vendorMemories);
  useEffect(() => {
    vendorMemoryRef.current = vendorMemories;
  }, [vendorMemories]);
  const [bagOpen, setBagOpen] = useState(false);
  const [bagDetail, setBagDetail] = useState("");
  const [inspectCan, setInspectCan] = useState(false);
  const [supply, setSupply] = useState<"repellent" | "growth" | null>(null);
  /** 水壶里还能浇几次；必须先去水池打水 */
  const [water, setWater] = useState(0);
  const [canUpgrade, setCanUpgrade] = useState(0);
  const [compost, setCompost] = useState(2);
  const [journal, setJournal] = useState(() => emptyJournal(eventTime()));
  const [lifeOpen, setLifeOpen] = useState(false);
  const [lifeInitialTab, setLifeInitialTab] = useState<"life" | "ai" | "logs">("life");
  const [lifeReportsOnly, setLifeReportsOnly] = useState(false);
  const [recapSeenAt, setRecapSeenAt] = useState(0);
  const [recapReadIds, setRecapReadIds] = useState<string[]>([]);
  const [recapManuallyOpen, setRecapManuallyOpen] = useState(false);
  const farmScroll = useRef<ComponentRef<typeof ScrollView>>(null);
  const [fertilizing, setFertilizing] = useState(false);
  const waterCap = canCapacity(canUpgrade);
  const stacks = useMemo(
    () => bagStacks(seeds, economy.inventory, gear.extras, compost),
    [seeds, economy.inventory, gear.extras, compost],
  );
  const bagCap = BAG_SLOTS[gear.bag];
  const level = farmLevel(harvested);
  const sfxOn = useSoundEffects((s) => s.on);
  const toggleSfx = useSoundEffects((s) => s.toggle);
  const prevLevelRef = useRef<number | null>(null);
  useEffect(() => {
    if (!loaded || loadFailed) return;
    if (prevLevelRef.current !== null && level > prevLevelRef.current) {
      playSfx("farm_level_up", { ignoreCooldown: true, volume: 0.78 });
    }
    prevLevelRef.current = level;
  }, [loaded, loadFailed, level]);
  const actionBusy = useRef(false);
  useEffect(() => {
    actionBusy.current = false;
  });
  const beginAction = () => {
    if (!loaded || loadFailed || actionBusy.current) return false;
    actionBusy.current = true;
    return true;
  };
  const record = (kind: FarmActivity, amount = 1) =>
    setJournal((j) => recordActivity(j, kind, amount, eventTime()));
  /** 小铺一次买几包 */

  const [houseOpen, setHouseOpen] = useState(false);
  const [gameOpen, setGameOpen] = useState(false);
  const pestPlot = useRef<number | null>(null);
  const [gameToken, setGameToken] = useState(0);
  const settledGame = useRef(-1);
  const houseTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [toast, setToast] = useState<{ id: number; text: string } | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // 转场（约 320ms 淡入）期间先只挂场景主图与作物，装饰和光点等画面稳住再挂，
  // 会呼吸的小角色放在最后一批：把一次性的挂载开销拆成几段，进农场不再整屏卡
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

  const [shopOpen, setShopOpen] = useState(false);
  const [marketOrders, setMarketOrders] = useState(false);
  const [speaker, setSpeaker] = useState<Speaker | null>(null);
  const [followUp, setFollowUp] = useState<ResidentConversation | null>(null);
  const [memories, setMemories] = useState(restoreFarmMemories);
  const [threads, setThreads] = useState<Record<Speaker, FarmChatMsg[]>>({
    door: [],
    gu: [],
    chicken: [],
    xiaoba: [],
    yujie: [],
    weigang: [],
  });
  const [draft, setDraft] = useState("");
  const [chatBusy, setChatBusy] = useState(false);
  const [chatOffline, setChatOffline] = useState(false);
  const [chatHint, setChatHint] = useState("");
  const [memoryBookOpen, setMemoryBookOpen] = useState(false);
  const [giftBarOpen, setGiftBarOpen] = useState(false);
  const [recapVisible, setRecapVisible] = useState(false);
  const [walkRipple, setWalkRipple] = useState<{
    id: number;
    x: number;
    y: number;
  } | null>(null);
  const rippleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const chatInputRef = useRef<ComponentRef<typeof TextInput>>(null);
  const personalRequest = useRef<AbortController | null>(null);
  const [groupOpen, setGroupOpen] = useState(false);
  const [groupMembers, setGroupMembers] = useState<ResidentId[]>([
    "door",
    "gu",
    "xiaoba",
    "yujie",
  ]);
  const [groupMessages, setGroupMessages] = useState<FarmGroupMessage[]>([]);
  const [groupDraft, setGroupDraft] = useState("");
  const [groupBusy, setGroupBusy] = useState(false);
  const [groupHint, setGroupHint] = useState("");
  const [groupTypingLabel, setGroupTypingLabel] = useState("");
  const [groupOnline, setGroupOnline] = useState(() => Boolean(apiKey));
  const groupRequest = useRef<AbortController | null>(null);
  const groupRevealTimers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const [town, setTown] = useState<FarmTownState>(emptyTownState);
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
    huboqi: [],
    xushuiyin: [],
    huangbingqi: [],
    dark_xushuiyin: [],
    dafeiyu: [],
    claude: [],
    gpt: [],
    gemini: [],
  });
  const [randomEventModalOpen, setRandomEventModalOpen] = useState(false);
  const [heroEmotionPose, setHeroEmotionPose] = useState<"neutral" | "happy">("neutral");
  const heroEmotionTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastWeatherPulseKey = useRef<string>("");
  const whalePersona = useWhalePersona((s) => s.persona);
  const whaleFacts = useWhaleMemory((s) => s.facts);
  const whaleEpisodes = useWhaleMemory((s) => s.episodes);
  const whaleOpenLoops = useWhaleMemory((s) => s.openLoops);
  const whaleReflections = useWhaleMemory((s) => s.reflections);
  const whaleMessages = useWhaleMemory((s) => s.messages);
  const whaleMemoryMsgs = useWhaleMemory((s) => s.memory);
  const whalePetMessages = useWhaleMemory((s) => s.petMessages);
  const whaleEmotion = useWhaleMemory((s) => s.emotion);
  const whaleBond = useWhaleMemory((s) => s.bond);
  const whaleCare = useWhalePet((s) => s.care);
  const visitorRequest = useRef<AbortController | null>(null);
  const [wokenNightState, setWokenNightState] = useState<{ day: number; ids: ResidentId[] }>({
    day: 0,
    ids: [],
  });
  const horrorCheckedDayRef = useRef(-1);
  const starDewCheckedRef = useRef(false);
  const [followedId, setFollowedId] = useState<ResidentId | null>(null);
  const [gazettePolishing, setGazettePolishing] = useState(false);
  const [gazetteError, setGazetteError] = useState("");
  const gazetteRequest = useRef<AbortController | null>(null);
  const activeSchedule = useActiveSchedule();
  const studyGrades = useStore((s) => s.grades);
  const studyFocusLogs = useStudyProgress((s) => s.focusLogs);
  const studyAttendanceByCourse = useStudyProgress((s) => s.attendanceByCourse);
  const studyCustomAbsenceLimits = useStudyProgress((s) => s.customAbsenceLimits);
  const pendingStudyRewardCount = useStudyProgress(
    (s) => s.pendingFarmRewards.length,
  );
  const [playerAnchor, setPlayerAnchor] = useState<{ x: number; y: number }>(
    PLAYER_START,
  );
  const workResources = useRef({
    plots,
    water,
    waterCap,
    timeShift,
    irrigation: economy.irrigation,
    rust: gear.rust,
    canTier: canUpgrade,
  });
  const settledResidentWork = useRef(new Set<string>());
  useEffect(() => {
    workResources.current = {
      plots,
      water,
      waterCap,
      timeShift,
      irrigation: economy.irrigation,
      rust: gear.rust,
      canTier: canUpgrade,
    };
  }, [
    plots,
    water,
    waterCap,
    timeShift,
    economy.irrigation,
    gear.rust,
    canUpgrade,
  ]);
  useEffect(
    () => () => {
      personalRequest.current?.abort();
    },
    [speaker, focused],
  );

  /* ---------------- 天色用本地时间；生长、天数和季节用游戏时间 ---------------- */
  const {
    growthNow: vNow,
    night,
    period,
    weather,
    rainbow,
    day,
    season,
    clock,
    sceneVariant,
  } = farmTime(now, timeShift, epoch);
  const seasonName = SEASONS[season];
  /** 每块地的累计生长量（每次渲染按当前虚拟时间实时结算，不落库） */
  const grown = plots.map(plot => plotGrowth(plot, vNow));
  const growing = plots.filter(
    (p, i) => p.crop && grown[i] < CROP_META[p.crop].growMs,
  ).length;

  const ripe = plots.filter(
    (plot, index) => plot.crop && grown[index] >= CROP_META[plot.crop].growMs,
  ).length;
  const dryPlots = plots.filter(
    (plot, index) =>
      plot.crop &&
      grown[index] < CROP_META[plot.crop].growMs &&
      plot.wetUntil <= vNow,
  ).length;
  const farmNeeds: FarmNeedsSnapshot = {
    dryPlots,
    ripePlots: ripe,
    water,
    waterCap,
    canRust: gear.rust,
    coopComfort: coopComfort(gear.coop),
    period,
    weather,
    rainbow,
    day,
    season,
  };
  const todayFocusMinutes = getTodayFocusMinutes(studyFocusLogs, now);
  const attendanceDangerCourses = getAttendanceRiskCourses(
    activeSchedule,
    studyAttendanceByCourse,
    studyCustomAbsenceLimits,
  ).map((item) => item.courseName);
  const studyContext = summarizeStudyDay(
    activeSchedule,
    studyGrades,
    now,
    town.studyLinkEnabled !== false,
    {
      todayFocusMinutes,
      attendanceDangerCourses,
      pendingRewardCount: pendingStudyRewardCount,
    },
  );
  const todayStr = realDate(now);
  const dailyWishes =
    town.wishes && town.wishes.length > 0 && town.wishes[0].date === todayStr
      ? town.wishes
      : generateDailyWishes(level, now);
  const focusStats = town.focus ?? emptyFocusStats();
  const postcards = town.postcards ?? [];
  const fishingBook = town.fishing ?? emptyFishingBook();
  const storyProgress = town.stories ?? emptyStoryProgress();
  const decorState = town.decor ?? emptyDecorState();
  const whaleSyncEnabled = town.whaleSyncEnabled !== false;
  const randomEventsEnabled = town.randomEventsEnabled !== false;
  const emotionSpritesEnabled = town.emotionSpritesEnabled !== false;
  const whaleSync = useMemo<WhaleVisitorSyncContext>(
    () => ({
      enabled: whaleSyncEnabled,
      persona: whalePersona,
      facts: whaleFacts,
      episodes: whaleEpisodes,
      openLoops: whaleOpenLoops,
      reflections: whaleReflections,
      logs: [...whaleMemoryMsgs, ...whaleMessages, ...whalePetMessages].slice(-36),
      emotion: whaleEmotion,
      bond: whaleBond,
      care: whaleCare,
    }),
    [
      whaleSyncEnabled,
      whalePersona,
      whaleFacts,
      whaleEpisodes,
      whaleOpenLoops,
      whaleReflections,
      whaleMemoryMsgs,
      whaleMessages,
      whalePetMessages,
      whaleEmotion,
      whaleBond,
      whaleCare,
    ],
  );
  const randomEventState = town.randomEvents ?? emptyRandomEventState();
  const activeRandomEvent = getRandomEventById(randomEventState.activeEventId);
  const tuckedIdsToday = town.tuckedIn?.day === day ? town.tuckedIn.ids : [];
  const visitorState = town.visitors ?? emptyVisitorState();
  const activeVisitorVisit = resolveVisitorVisit(visitorState, now);
  const activeNormalVisitor = activeVisitorVisit?.who ?? null;
  const lastObservedVisitRef = useRef<{ slotKey: string; who: NormalVisitorId } | null>(null);
  const manualDismissedSlotRef = useRef<string>("");
  const visitorCycleReadyRef = useRef(false);
  const sleepDeprived = isFarmSleepDeprived(visitorState, day);
  const wokenIdsToday = night && wokenNightState.day === day ? wokenNightState.ids : [];
  const { sleeping: sleepingResidents, soloEvent: nightSoloEvent } = computeSleepingResidents({
    night,
    day,
    wokenIds: wokenIdsToday,
    weather,
  });
  const activeFestival = detectAvailableFestival({
    day,
    seasonIndex: season,
    rainbow,
    period,
    at: now,
  });
  const storyBadgeCount = RESIDENT_IDS.filter(
    (id) => nextUnlockableChapter(id, storyProgress, memories) !== null,
  ).length;
  function handleConversationMemory(
    record: ResidentConversation,
    aiMemory?: NpcConversationMemoryNote,
  ) {
    const at = eventTime();
    setMemories((previous) =>
      recordNpcConversationMemory(previous, record, aiMemory, at),
    );
    if (record.participants.length >= 2) {
      setTown((previous) => {
        const res = propagateTownEvents(previous.events, record.participants, at);
        return res.diffused.length ? { ...previous, events: res.events } : previous;
      });
    }
  }

  const residents = useFarmResidents({
    enabled: focused && loaded && folkReady && !loadFailed,
    // Keep in-flight dialogue alive while its history/settings panel is open.
    paused: shopOpen || houseOpen || gameOpen || bagOpen || groupOpen || focusOpen || festivalOpen || fishingOpen || storiesOpen || decorOpen || visitorSpeaker !== null,
    autonomous: !groupOpen,
    busyResident: speaker,
    night,
    apiKey,
    memories,
    town,
    farmNeeds,
    sleepingResidents,
    nightSoloEvent,
    scene: { day, season: seasonName, growing, ripe },
    onWork: executeResidentWork,
    onAutoWork: executeAutonomousDuty,
    onAssignments: syncAssignments,
    onConversationMemory: handleConversationMemory,
  });

  const getResidentsRef = residents.getResidents;
  const subscribeResidentsRef = residents.subscribeResidents;
  useEffect(() => {
    if (
      !followedId ||
      !focused ||
      shopOpen ||
      houseOpen ||
      gameOpen ||
      bagOpen ||
      lifeOpen ||
      townOpen ||
      groupOpen ||
      speaker !== null ||
      mapHeight <= 0
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
    followedId,
    focused,
    shopOpen,
    houseOpen,
    gameOpen,
    bagOpen,
    lifeOpen,
    townOpen,
    groupOpen,
    speaker,
    mapHeight,
    hudOverlayH,
    scale,
    getResidentsRef,
    subscribeResidentsRef,
  ]);

  useEffect(() => {
    if (!loaded || loadFailed || !night || horrorCheckedDayRef.current === day) return;
    horrorCheckedDayRef.current = day;
    if (!shouldTriggerNightHorror({ state: visitorState, night, day })) return;
    const timer = setTimeout(() => {
      const at = eventTime();
      setMemories((prev) => recordHorrorAftermathToFamily(prev, at).nextMemories);
      setTown((prev) => {
        const curV = prev.visitors ?? emptyVisitorState();
        if (curV.horrorActive || curV.lastHorrorDay === day) return prev;
        const ev = recordHorrorAftermathToFamily(memories, at).event;
        return {
          ...prev,
          visitors: {
            ...curV,
            horrorActive: true,
            lastHorrorDay: day,
            sleepDeprivedDay: day,
          },
          events: [...prev.events.filter((e) => e.expiresAt > at && e.title !== ev.title), ev].slice(-12),
        };
      });
      playSfx("horror_appear", { ignoreCooldown: true, volume: 0.76 });
      showToast("⚠ 深夜异动！恐怖徐睡阴裹着被子扛电脑来农场疯狂打瓦了！");
    }, 1800);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loaded, loadFailed, night, day]);

  // 访客多时段自然到达与到点告辞生命周期：记录到访次数并在进退场时给出温和提示
  useEffect(() => {
    if (!loaded || loadFailed || visitorState.horrorActive) return;
    const prev = lastObservedVisitRef.current;
    const curKey = activeVisitorVisit?.slotKey ?? "";
    const curWho = activeVisitorVisit?.who ?? null;
    const isInitialSync = !visitorCycleReadyRef.current;

    const isSamePersonHandoff = prev !== null && curWho !== null && prev.who === curWho;
    const isManualReplace = activeVisitorVisit?.source === "invited";
    const shouldToastDeparture =
      !isInitialSync &&
      prev !== null &&
      prev.slotKey !== curKey &&
      !isSamePersonHandoff &&
      !isManualReplace &&
      manualDismissedSlotRef.current !== prev.slotKey &&
      focused;

    const shouldGreetScheduled =
      activeVisitorVisit !== null &&
      activeVisitorVisit.source === "scheduled" &&
      visitorState.lastGreetedSlotKey !== activeVisitorVisit.slotKey &&
      (isInitialSync || activeVisitorVisit.slotKey !== prev?.slotKey);

    const departingWho = shouldToastDeparture && prev ? prev.who : null;
    const arrivingVisit = shouldGreetScheduled ? activeVisitorVisit : null;
    const timer = setTimeout(() => {
      visitorCycleReadyRef.current = true;
      lastObservedVisitRef.current = curWho && curKey ? { slotKey: curKey, who: curWho } : null;
      if (!isInitialSync && prev && prev.slotKey !== curKey) {
        manualDismissedSlotRef.current = "";
      }

      if (arrivingVisit) {
        const at = eventTime();
        setTown((p) => ({
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
          const prevName = resolveVisitorDisplayProfile(departingWho, whaleSync).name;
          const nextName = resolveVisitorDisplayProfile(arrivingVisit.who, whaleSync).name;
          showToast(`${prevName}告辞离开，${nextName}正好来院子里串门啦！`);
        } else if (departingWho) {
          showToast(visitorFarewellLine(departingWho, whaleSync));
        } else if (arrivingVisit && !isSamePersonHandoff) {
          showToast(visitorArrivalLine(arrivingVisit.who, whaleSync));
        }
      }
    }, isInitialSync ? 250 : 400);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    loaded,
    loadFailed,
    activeVisitorVisit?.slotKey,
    activeVisitorVisit?.who,
    activeVisitorVisit?.source,
    visitorState.lastGreetedSlotKey,
    focused,
    visitorState.horrorActive,
  ]);

  const taskReportSince = useRef(eventTime());
  const interruptedRequests: ResidentConversation[] = lifeOpen
    ? buildInterruptedRequestRecords(memories, residents.history)
    : [];

  function resumeRequest(record: ResidentConversation) {
    const [actor, target] = record.participants;
    const purpose = record.discussion?.question;
    if (!loaded || loadFailed || !target || !purpose) return;
    const current = memories[actor].assignment;
    if (current?.engineId === record.taskId && current?.status === "cancelled") {
      Alert.alert("这项委托已取消", "如果还要问，可以打开居民对话发起新委托。");
      return;
    }
    const result = residents.command(actor, { type: "talk_to", target, purpose }, record);
    if (!result.ok || !result.id) {
      Alert.alert("暂时无法续办", result.message);
      return;
    }
    const engineId = result.id;
    const resumeFrom = residents.history.some(entry => entry.id === record.id) ? record.id : record.resumedFrom;
    setMemories(previous => ({
      ...previous,
      [actor]: { ...previous[actor], assignment: {
        id: engineId, engineId, resumeFrom, target, question: purpose, status: "walking", updatedAt: eventTime(),
      } },
    }));
    setLifeOpen(false);
  }

  function syncAssignments(
    snapshot: ReturnType<typeof residents.getResidents>,
    history: typeof residents.history,
  ) {
    setMemories((previous) =>
      syncResidentAssignmentMemories(previous, snapshot, history, eventTime()),
    );
  }
  const reportedTasks = useRef(new Set<string>());
  useEffect(() => {
    for (const record of residents.history) {
      if (
        !record.requestOutcome ||
        record.startedAt < taskReportSince.current ||
        reportedTasks.current.has(record.id)
      )
        continue;
      reportedTasks.current.add(record.id);
      const actor = record.participants[0];
      setThreads((previous) => ({
        ...previous,
        [actor]: [
          ...previous[actor],
          {
            id: record.id + "-report",
            role: "assistant" as const,
            text: record.requestOutcome!,
          },
        ].slice(-40),
      }));
    }
  }, [residents.history]);

  function executeResidentWork(
    actor: ResidentId,
    action: NpcAction,
    id: string,
  ): string {
    const settlement = `${actor}:${id}`;
    if (settledResidentWork.current.has(settlement))
      return "这件事已经办好了。";
    if (actionBusy.current) return "你正在操作田地，忙完后再叫我吧。";
    settledResidentWork.current.add(settlement);
    if (settledResidentWork.current.size > 100)
      settledResidentWork.current.delete(
        settledResidentWork.current.values().next().value!,
      );
    const resources = workResources.current;
    if (
      (action.type === "fetch_water" || action.type === "water_crops") &&
      resources.rust >= 100
    )
      return "水壶锈住了，先请铁匠清理吧。";
    if (action.type === "fetch_water") {
      if (resources.water >= resources.waterCap)
        return "水壶本来就是满的，不用再打水啦。";
      workResources.current = { ...resources, water: resources.waterCap };
      setWater(resources.waterCap);
      return "我把水壶装满了，可以照料田地啦。";
    }
    if (action.type === "water_crops") {
      if (resources.water <= 0) return "水壶空了，先让我去打点水吧。";
      const wear = Math.max(1, 6 - resources.canTier);
      const usable = Math.min(
        resources.water,
        Math.ceil((100 - resources.rust) / wear),
      );
      const result = waterFarmPlots(
        resources.plots,
        usable,
        eventTime() + resources.timeShift,
        wetDuration(resources.irrigation),
      );
      if (!result.ids.length) return "田地都湿润了，或暂时没有要照料的苗。";
      const remainingWater = resources.water - result.ids.length;
      const rust = Math.min(100, resources.rust + result.ids.length * wear);
      workResources.current = {
        ...resources,
        plots: result.plots,
        water: remainingWater,
        rust,
      };
      setPlots(result.plots);
      setWater(remainingWater);
      record("water", result.ids.length);
      setGear((g) => ({ ...g, rust }));
      return `照料了 ${result.ids.length} 块田地，水壶还剩 ${remainingWater} 次。`;
    }
    return "这件事已经安排好了。";
  }

  function executeAutonomousDuty(
    actor: ResidentId,
    duty: ResidentDuty,
    id: string,
  ): string {
    const settlement = `auto:${actor}:${id}`;
    if (settledResidentWork.current.has(settlement)) return "已经顺手帮着办好啦。";
    if (actionBusy.current) return "看你正忙着照料田地，我晚点再来搭把手。";
    settledResidentWork.current.add(settlement);
    if (settledResidentWork.current.size > 100) {
      settledResidentWork.current.delete(settledResidentWork.current.values().next().value!);
    }
    const resources = workResources.current;
    const nowAt = eventTime();
    const recordHelperDeed = (summary: string) => {
      setTown((prev) => ({
        ...prev,
        helperLog: [
          ...prev.helperLog,
          { id: `help-${nowAt}-${actor}`, actor, duty, summary, at: nowAt },
        ].slice(-16),
      }));
      setMemories((prev) => ({
        ...prev,
        [actor]: appendEpisode(prev[actor], {
          id: `duty-${nowAt}-${actor}`,
          kind: "npc_talk",
          text: `我顺手帮客人照料农场：${summary}`,
          actors: ["player"],
          tags: [RESIDENT_DUTIES[duty].short, "帮干活", "农场"],
          importance: 5,
          privacy: "public",
          at: nowAt,
        }),
      }));
    };

    if (duty === "water") {
      if (resources.water <= 0) {
        workResources.current = { ...resources, water: resources.waterCap };
        setWater(resources.waterCap);
        const msg = "顺手去池塘把水壶打满了，待会浇水更方便。";
        recordHelperDeed(msg);
        return msg;
      }
      const wear = Math.max(1, 6 - resources.canTier);
      const usable = Math.min(
        2,
        resources.water,
        Math.ceil((100 - resources.rust) / wear),
      );
      const result = waterFarmPlots(
        resources.plots,
        usable,
        nowAt + resources.timeShift,
        wetDuration(resources.irrigation),
      );
      if (!result.ids.length) return "田里的土都还湿润着呢，我巡了一圈回来啦。";
      const remainingWater = resources.water - result.ids.length;
      const rust = Math.min(100, resources.rust + result.ids.length * wear);
      workResources.current = { ...resources, plots: result.plots, water: remainingWater, rust };
      setPlots(result.plots);
      setWater(remainingWater);
      record("water", result.ids.length);
      setGear((g) => ({ ...g, rust }));
      const msg = `看土干了，顺手帮忙浇了 ${result.ids.length} 块田地。`;
      recordHelperDeed(msg);
      return msg;
    }

    if (duty === "repair") {
      if (resources.rust < 10) return "水壶看着还挺亮堂的，暂不用大修。";
      const nextRust = Math.max(0, resources.rust - 20);
      workResources.current = { ...resources, rust: nextRust };
      setGear((g) => ({ ...g, rust: nextRust }));
      const msg = `顺手给水壶擦洗除锈，锈迹降到了 ${nextRust}%。`;
      recordHelperDeed(msg);
      return msg;
    }

    if (duty === "harvest") {
      const vAt = nowAt + resources.timeShift;
      const ripeIds = resources.plots
        .map((plot, idx) => (plot.crop && plotGrowth(plot, vAt) >= CROP_META[plot.crop].growMs ? idx : -1))
        .filter((idx) => idx >= 0)
        .slice(0, 2);
      if (!ripeIds.length) return "地里暂时还没有熟透的作物，过会儿再来看。";
      collectHarvest(ripeIds, vAt);
      const msg = `巡田看见菜熟了，顺手帮忙收了 ${ripeIds.length} 块田的熟菜进仓库。`;
      recordHelperDeed(msg);
      return msg;
    }

    if (duty === "fish") {
      setCoins((c) => c + 10);
      const msg =
        actor === "weigang"
          ? "在池边守漂钓上一条肥鱼，换了 10 金币放进农场钱匣。"
          : "在池塘边碰运气钓上一条小鱼，换了 10 金币！";
      recordHelperDeed(msg);
      return msg;
    }

    if (duty === "bugs") {
      setCompost((c) => Math.min(5, c + 1));
      const msg =
        actor === "chicken"
          ? "咕咕！巡田抓了一小堆虫子，帮着攒出 1 份有机肥！"
          : "在菜地抓了几只小虫子，顺手堆出 1 份有机肥。";
      recordHelperDeed(msg);
      return msg;
    }

    return "顺手搭了把手。";
  }

  // 每 3 秒走一次表：作物进度、天色、时钟都靠它刷新
  // （原来 1 秒一次，整棵树每秒重渲染会让贴图与动画掉帧）
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
    };
  }, [clearGroupRevealTimers]);

  // 天色取自本地时钟，背景贴图可以与存档并行加载。
  const nightV = useSharedValue(night ? 1 : 0);
  useEffect(() => {
    nightV.value = withTiming(night ? 1 : 0, { duration: 700 });
  }, [night, nightV]);

  const [terrainPainted, setTerrainPainted] = useState(false);
  const [entranceFinished, setEntranceFinished] = useState(false);
  const entranceCover = useSharedValue(1);
  const reduceMotion = useReducedMotion();
  const sceneReady = loaded && decorReady && mapHeight > 0 && terrainPainted;
  const finishEntrance = useCallback(() => setEntranceFinished(true), []);
  const entranceStyle = useAnimatedStyle(() => ({
    opacity: entranceCover.value,
  }));

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
  }, [
    entranceCover,
    entranceFinished,
    finishEntrance,
    focused,
    reduceMotion,
    sceneReady,
  ]);

  /* ---------------- 玩家位置：UI 线程上平滑走动 ---------------- */
  const [playerMoving, setPlayerMoving] = useState(false);
  const px = useSharedValue(PLAYER_START.x);
  const py = useSharedValue(PLAYER_START.y);
  const face = useSharedValue(1);

  useAnimatedReaction(
    () => px.get(),
    (current, previous) => {
      // 0.15 logical-px deadzone prevents horizontal facing flicker on near-vertical walks
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
      if (Math.abs(route[0].x - px.value) > 0.15) {
        face.value = route[0].x < px.value ? -1 : 1;
      }
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
      // 回调必须带 worklet 标记单独定义：写在三元表达式里的内联箭头不会被
      // Reanimated 插件 worklet 化，走路结束那一刻 UI 线程调用 JS 闭包会直接闪退
      const walkFinished = (finished?: boolean) => {
        "worklet";
        if (finished) {
          if (finalFace !== 0) face.value = finalFace;
          runOnJS(setPlayerMoving)(false);
        }
      };
      px.value = withSequence(
        ...steps.map((step) =>
          withTiming(step.point.x, {
            duration: step.duration,
            easing: Easing.linear,
          }),
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

  const goToMarket = (showOrders = false) => {
    if (!loaded || loadFailed || shopOpen) return;
    void warmMarketAssets(farmTime(eventTime(), 0, eventTime()).sceneVariant);
    if (houseTimer.current) clearTimeout(houseTimer.current);
    const travel = moveTo(85, 316) ?? 0;
    houseTimer.current = setTimeout(() => {
      setPlayerMoving(false);
      setMarketOrders(showOrders);
      setShopOpen(true);
    }, travel);
  };

  const showToast = useCallback((text: string, durationMs = 1800) => {
    setToast({ id: eventTime(), text });
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), durationMs);
  }, []);

  // 自动承接学科专注与任务完成存入的学习闭环奖励（金币 + 作物生长加速）
  useEffect(() => {
    if (!loaded || loadFailed || !focused || pendingStudyRewardCount <= 0) return;
    const timer = setTimeout(() => {
      const claimed = useStudyProgress.getState().claimPendingFarmRewards();
      if (!claimed.length) return;
      const settlement = applyPendingRewardsToFarmCoins(0, claimed);
      if (settlement.totalCoins <= 0 && settlement.totalGrowthMin <= 0) return;
      if (settlement.totalCoins > 0) {
        setCoins((c) => applyPendingRewardsToFarmCoins(c, claimed).nextCoins);
      }
      if (settlement.totalGrowthMin > 0) {
        setTimeShift((s) => s + settlement.totalGrowthMin * MINUTE);
      }
      playSfx("farm_level_up", { volume: 0.74 });
      showToast(
        settlement.summary || `收到学习奖励：+${settlement.totalCoins} 金币`,
        3200,
      );
    }, 120);
    return () => clearTimeout(timer);
  }, [focused, loadFailed, loaded, pendingStudyRewardCount, showToast]);

  // 夜空点亮星象后来到星露坡：承接一次星露祝福，润湿最多 4 块干土并写进小镇传闻
  useEffect(() => {
    if (!loaded || loadFailed || starDewCheckedRef.current) return;
    starDewCheckedRef.current = true;
    let alive = true;
    consumeStarDewBlessing(new Date())
      .then((res) => {
        if (!alive || !res) return;
        const at = eventTime();
        const vAt = at + workResources.current.timeShift;
        let wateredCount = 0;
        if (res.canWaterToday) {
          wateredCount = waterFarmPlots(
            workResources.current.plots,
            4,
            vAt,
            WET_MS,
          ).ids.length;
          if (wateredCount > 0) {
            setPlots((prev) => waterFarmPlots(prev, 4, vAt, WET_MS).plots);
          }
        }
        const ev = buildStarDewTownEvent(res.blessing, at);
        setTown((prev) => ({
          ...prev,
          events: [
            ...prev.events.filter(
              (e) => e.expiresAt > at && e.title !== ev.title,
            ),
            ev,
          ].slice(-12),
        }));
        playSfx("star_constellation", { volume: 0.68 });
        showToast(
          wateredCount > 0
            ? `✦ 「${res.blessing.constellationName}」星露降临，替你润湿了 ${wateredCount} 块干土`
            : `✦ 「${res.blessing.constellationName}」的星光正轻照星露坡`,
        );
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [loaded, loadFailed, showToast]);

  const chickenHelpState = useRef({
    plots,
    gear,
    focused,
    loaded,
    loadFailed,
    shopOpen,
    houseOpen,
    gameOpen,
    bagOpen,
    lifeOpen,
    speaker,
    getResidents: residents.getResidents,
  });
  useEffect(() => {
    chickenHelpState.current = {
      plots,
      gear,
      focused,
      loaded,
      loadFailed,
      shopOpen,
      houseOpen,
      gameOpen,
      bagOpen,
      lifeOpen,
      speaker,
      getResidents: residents.getResidents,
    };
  }, [
    plots,
    gear,
    focused,
    loaded,
    loadFailed,
    shopOpen,
    houseOpen,
    gameOpen,
    bagOpen,
    lifeOpen,
    speaker,
    residents.getResidents,
  ]);
  useEffect(() => {
    const timer = setInterval(() => {
      const state = chickenHelpState.current,
        at = eventTime(),
        hen = state.getResidents().find((value) => value.id === "chicken");
      if (
        (AppState.currentState && AppState.currentState !== "active") ||
        !state.focused ||
        !state.loaded ||
        state.loadFailed ||
        state.shopOpen ||
        state.houseOpen ||
        state.gameOpen ||
        state.bagOpen ||
        state.lifeOpen ||
        state.speaker ||
        !hen ||
        hen.task ||
        hen.state === "talking" ||
        actionBusy.current
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
          Math.hypot(
            hen.logicalPosition.x - plotApproach(i).x,
            hen.logicalPosition.y - plotApproach(i).y,
          ) <= 40,
      );
      if (index < 0) return;
      setPlots((current) =>
        current.map((plot, i) =>
          i === index ? { ...plot, pestCleared: true } : plot,
        ),
      );
      setGear((current) => ({ ...current, lastChickenHelp: at }));
      showToast("坤坤在田边啄掉了一处虫害");
    }, 60_000);
    return () => clearInterval(timer);
  }, [showToast]);

  useEffect(
    () => () => {
      if (toastTimer.current) clearTimeout(toastTimer.current);
      if (houseTimer.current) clearTimeout(houseTimer.current);
    },
    [],
  );

  /* ---------------- 存档读取 / 写入 ---------------- */
  useEffect(() => {
    let alive = true;
    getStoredText(SAVE_KEY)
      .then((raw) => {
        if (!alive || !raw) return;
        const parsed = parseFarmSaveRaw(raw, eventTime());
        if (!parsed) {
          setLoadFailed(true);
          return;
        }
        if (parsed.recapSeenAt !== undefined) setRecapSeenAt(parsed.recapSeenAt);
        if (parsed.recapReadIds) setRecapReadIds(parsed.recapReadIds);
        setEpoch(parsed.epoch);
        setTimeShift(parsed.timeShift);
        setCanUpgrade(parsed.canUpgrade);
        setGear(parsed.gear);
        setVendorMemories(parsed.vendorMemories);
        setCompost(parsed.compost);
        setJournal(parsed.journal);
        setMemories(parsed.memories);
        if (parsed.groupChat) {
          setGroupMembers(parsed.groupChat.members);
          setGroupMessages(parsed.groupChat.messages);
        }
        if (parsed.town) setTown(parsed.town);
        setCoins(parsed.coins);
        setEconomy(parsed.economy);
        if (parsed.water !== undefined) setWater(parsed.water);
        if (parsed.harvested !== undefined) setHarvested(parsed.harvested);
        if (parsed.seeds) setSeeds(parsed.seeds);
        if (parsed.plots) setPlots(parsed.plots);
      })
      .catch(() => setLoadFailed(true))
      .finally(() => {
        if (alive) setLoaded(true);
      });
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    if (!loaded || loadFailed) return;
    const payload: SaveData = {
      v: 4,
      gear,
      vendorMemories,
      economy,
      canUpgrade,
      compost,
      journal,
      memories,
      epoch,
      timeShift,
      coins,
      seeds,
      plots,
      harvested,
      water,
      recapSeenAt,
      recapReadIds,
      groupChat: {
        members: groupMembers,
        messages: groupMessages.slice(-30),
      },
      town,
    };
    saveWriter.schedule(payload);
  }, [
    loaded,
    loadFailed,
    economy,
    epoch,
    timeShift,
    coins,
    seeds,
    plots,
    harvested,
    water,
    recapSeenAt,
    recapReadIds,
    canUpgrade,
    compost,
    journal,
    memories,
    gear,
    vendorMemories,
    groupMembers,
    groupMessages,
    town,
    saveWriter,
  ]);

  /* ---------------- 操作 ---------------- */
  const collectHarvest = (indices: number[], t: number) => {
    const next = { ...economy.inventory };
    let count = 0;
    const newPlots = plots.map((plot, i) => {
      if (!indices.includes(i) || !plot.crop) return plot;
      const kind = plot.crop;
      const result = harvestResult(
        kind,
        plot.fertilized === true,
        plot.plantedSeason ?? season,
        plot.harvests,
      );
      const quality = result.premium ? "premium" : "normal";
      next[kind] = {
        ...next[kind],
        [quality]: next[kind][quality] + result.quantity,
      };
      count += result.quantity;
      return result.regrow
        ? {
            ...plot,
            growMs: CROP_META[kind].growMs * 0.5,
            lastSync: t,
            harvests: (plot.harvests ?? 0) + 1,
            fertilized: false,
          }
        : emptyPlot(t);
    });
    if (
      gear.bagWear >= 100 ||
      bagStacks(seeds, next, gear.extras, compost).length > bagCap
    ) {
      showToast("背包已满或需要维修，收成留在地里");
      return;
    }
    setGear((g) => ({
      ...g,
      bagWear: Math.min(100, g.bagWear + indices.length),
    }));
    setEconomy((e) => ({ ...e, inventory: next }));
    setPlots(newPlots);
    setHarvested((h) => h + indices.length);
    record("harvest", indices.length);
    playSfx("farm_harvest", { rate: risingRate(Math.min(indices.length - 1, 5), 0.04, 0.96), volume: 0.74 });
    showToast(`收获 ${count} 份已放进背包 · 可去集市出售`);
  };
  const sellStock = (kind: CropKind) => {
    if (!beginVendorAction("farmer")) return;
    const gain = stockValue(kind, economy.inventory[kind], eventTime());
    if (!gain) return;
    setCoins((c) => c + gain);
    setEconomy((e) => ({
      ...e,
      inventory: { ...e.inventory, [kind]: { normal: 0, premium: 0 } },
    }));
    playSfx("farm_coin", { volume: 0.72 });
    showToast(`出售${CROP_ART[kind].label} · +${gain} 金币`);
  };
  const deliverOrder = (kind: CropKind) => {
    if (!beginVendorAction("farmer") || level < CROP_META[kind].level) return;
    const result = completeOrder(economy, kind, level, eventTime());
    if (!result) {
      showToast("订单已交付或库存不足");
      return;
    }
    setEconomy(result.economy);
    setCoins((c) => c + result.reward);
    const rewardFits =
      bagStacks(seeds, result.economy.inventory, gear.extras, compost + 1)
        .length <= bagCap;
    if (rewardFits) setCompost((c) => c + 1);
    playSfx("farm_level_up", { volume: 0.72 });
    showToast(
      "订单完成 · +" +
        result.reward +
        " 金币" +
        (rewardFits ? "，+1 肥料" : " · 背包没空位放肥料"),
    );
  };
  const improveIrrigation = (vendor: Vendor = "farmer") => {
    if (
      !beginVendorAction(vendor) ||
      economy.irrigation >= 3 ||
      level < economy.irrigation + 2 ||
      coins < irrigationCost(economy.irrigation)
    )
      return;
    setCoins((c) => c - irrigationCost(economy.irrigation));
    setEconomy((e) => ({ ...e, irrigation: e.irrigation + 1 }));
    playSfx("farm_level_up", { volume: 0.7 });
    showToast("保水改良完成 · 此后每次浇水多保持湿润 15 分钟");
  };
  const makeRecipe = (recipe: Recipe) => {
    if (!beginVendorAction("farmer") || !economy.kitchen) return;
    const next = craft(economy.inventory, recipe, coins);
    if (!next) {
      showToast("食材或加工费不足");
      return;
    }
    setEconomy((e) => ({ ...e, inventory: next }));
    setCoins((c) => c + recipe.sell - recipe.fee);
    playSfx("farm_cook", { volume: 0.74 });
    showToast(
      `${recipe.label}已售出 · 扣费后 +${recipe.sell - recipe.fee} 金币`,
    );
  };
  const buildKitchen = () => {
    if (
      !beginVendorAction("farmer") ||
      economy.kitchen ||
      level < 3 ||
      coins < 280
    )
      return;
    setCoins((c) => c - 280);
    setEconomy((e) => ({ ...e, kitchen: true }));
    playSfx("farm_level_up", { volume: 0.76 });
    showToast("厨房建好了，试着把收成做成料理吧");
  };
  const rescueSeeds = () => {
    if (!beginVendorAction("farmer")) return;
    const date = realDate(eventTime());
    if (economy.rescueDate === date) {
      showToast("今天已领过起步种子，明天再来");
      return;
    }
    if (
      coins >= CROP_META.radish.price ||
      plots.some((p) => p.crop) ||
      CROP_KINDS.some(
        (k) => seeds[k] > 0 || stockCount(economy.inventory[k]) > 0,
      )
    ) {
      showToast("还有可用资金、种子或作物，先经营一下吧");
      return;
    }
    setSeeds((s) => ({ ...s, radish: 3 }));
    setEconomy((e) => ({ ...e, rescueDate: date }));
    showToast("顾送来 3 包萝卜种子，重新出发吧");
  };
  const actOnPlot = (index: number) => {
    if (!beginAction()) return;
    const t = eventTime() + timeShift;
    const plot = plots[index];
    const approach = plotApproach(index);
    moveTo(approach.x, approach.y);

    if (supply) {
      if (!plot.crop) {
        showToast("请点选种有作物的地块");
        return;
      }
      if (gear.extras[supply] <= 0) {
        setSupply(null);
        showToast("药剂已经用完");
        return;
      }
      const need = CROP_META[plot.crop].growMs;
      const progress = plotGrowth(plot, t);
      if (
        supply === "repellent" &&
        (!plot.pestProne || !pestAt(progress, need, plot.pestCleared))
      ) {
        showToast("这株没有虫害");
        return;
      }
      if (supply === "growth" && progress >= need) {
        showToast("这株已经成熟");
        return;
      }
      setGear((g) => ({
        ...g,
        extras: { ...g.extras, [supply]: g.extras[supply] - 1 },
      }));
      setPlots((ps) =>
        ps.map((p, i) =>
          i !== index
            ? p
            : supply === "repellent"
              ? { ...p, pestCleared: true }
              : {
                  ...p,
                  growMs: Math.min(need, progress + need * 0.45),
                  lastSync: t,
                },
        ),
      );
      setSupply(null);
      showToast(supply === "repellent" ? "已清除虫害" : "成长进度增加 45%");
      return;
    }
    if (fertilizing) {
      if (!plot.crop) {
        showToast("先播种，再施肥");
        return;
      }
      const need = CROP_META[plot.crop].growMs;
      if (plotGrowth(plot, t) >= need) {
        showToast("这株已经成熟，可以收获啦");
        return;
      }
      if (plot.fertilized) {
        showToast("这轮已经施过肥啦");
        return;
      }
      if (compost <= 0) {
        showToast("肥料不足，抓 4 只虫可制作 1 份");
        return;
      }
      setCompost((c) => c - 1);
      setPlots((ps) =>
        ps.map((p, i) =>
          i === index
            ? {
                ...p,
                growMs: fertilizedGrowth(plotGrowth(p, t), need),
                lastSync: t,
                fertilized: true,
              }
            : p,
        ),
      );
      showToast("施肥完成 · 成长 +25%，收获为优质品");
      return;
    }

    if (!plot.crop) {
      if (!selected) {
        showToast("先打开背包选一包种子");
        return;
      }
      if (gear.hoe <= 0) {
        showToast("锄头坏了，去集市找铁匠修理");
        return;
      }
      if (CROP_META[selected].level > level) {
        showToast("等级不足，多收获就能解锁");
        return;
      }
      if (seeds[selected] <= 0) {
        showToast("种子用完了，去集市找农民吧");
        return;
      }
      const kind = selected;
      record("plant");
      setGear((g) => ({ ...g, hoe: g.hoe - 1 }));
      setSeeds((s) => ({ ...s, [kind]: s[kind] - 1 }));
      setPlots((ps) =>
        ps.map((p, i) =>
          i === index
            ? {
                crop: kind,
                growMs: 0,
                lastSync: t,
                wetUntil: 0,
                plantedSeason: season,
                harvests: 0,
                pestProne: (index + Math.floor(t / MINUTE)) % 3 === 0,
              }
            : p,
        ),
      );
      showToast(`种下了${CROP_ART[kind].label} · 水壶 ${water}/${waterCap}`);
      return;
    }

    const kind = plot.crop;
    const need = CROP_META[kind].growMs;
    const g = plotGrowth(plot, t);

    if (plot.pestProne && pestAt(g, need, plot.pestCleared)) {
      showToast("点作物上方的小虫气泡，或使用杀虫剂");
      return;
    }

    if (g >= need) {
      collectHarvest([index], t);
      return;
    }

    if (t < plot.wetUntil) {
      showToast(
        `${CROP_ART[kind].label} · 土壤湿润 · 水壶 ${water}/${waterCap}`,
      );
      return;
    }

    if (gear.rust >= 100) {
      showToast("水壶锈住了，请找铁匠清理");
      return;
    }
    if (water <= 0) {
      showToast("水壶空了，先去水池打水");
      return;
    }

    const result = waterFarmPlots(
      plots,
      water,
      t,
      wetDuration(economy.irrigation),
      [index],
    );
    setWater(result.water);
    setPlots(result.plots);
    record("water", result.ids.length);
    if (result.ids.length)
      setGear((g) => ({
        ...g,
        rust: Math.min(100, g.rust + Math.max(1, 6 - canUpgrade)),
      }));
    showToast(`浇水了，接下来长得很快 · 水壶还剩 ${result.water} 次`);
  };

  /** 去水池打水：走到岸边，把水壶灌满 */
  const fetchWater = () => {
    if (!beginAction()) return;
    if (gear.rust >= 100) {
      showToast("水壶锈住了，请找铁匠清理");
      return;
    }
    moveTo(POND.approach.x, POND.approach.y);
    if (water >= waterCap) {
      showToast("水壶已经是满的");
      return;
    }
    setWater(waterCap);
    showToast("打满了水壶");
  };

  /** 点击房子：先走到门口，再进屋 */
  const enterHouse = () => {
    const travel = moveTo(HOUSE.door.x, HOUSE.door.y) ?? 0;
    if (houseTimer.current) clearTimeout(houseTimer.current);
    houseTimer.current = setTimeout(
      () => setHouseOpen(true),
      Math.max(180, travel + 50),
    );
  };

  /** 睡到第二天早上 7 点或小憩 3 小时：虚拟时间往前跳，作物跟着长，全员情绪与精力按睡眠质量恢复 */
  const doSleep = (mode: "nap" | "full" = "full") => {
    if (!beginAction()) return;
    const at = eventTime();
    const t = at + timeShift;
    const outcome = resolvePlayerSleep({
      mode,
      currentGrowthNow: t,
      epoch,
      wakeHour: WAKE_HOUR,
      sleepDeprived,
    });
    setTimeShift((s) => s + outcome.jumpMs);
    setMemories((prev) => {
      const next = { ...prev };
      for (const id of RESIDENT_IDS) {
        next[id] = shiftResidentMemoryEmotion(
          next[id],
          id,
          sleepTransitionEmotionDelta({
            actorId: id,
            action: mode === "full" ? "full_sleep" : "nap",
          }),
          at,
        );
      }
      return next;
    });
    setHouseOpen(false);
    showToast(outcome.summary);
  };

  /** 抓虫小游戏结算：游戏时长也算进农场时间，作物自然长得更快（不再直接发金币，钱靠种地） */
  const finishBugGame = (score: number, jumpMs: number) => {
    if (settledGame.current === gameToken) return;
    settledGame.current = gameToken;
    if (score <= 0) {
      showToast("虫子还在，再试一次吧");
      return;
    }
    const index = pestPlot.current;
    if (index !== null && score > 0)
      setPlots((ps) =>
        ps.map((plot, i) =>
          i === index ? { ...plot, pestCleared: true } : plot,
        ),
      );
    const earned = compostReward(score);
    const reward =
      bagStacks(seeds, economy.inventory, gear.extras, compost + earned)
        .length <= bagCap
        ? earned
        : 0;
    setCompost((c) => c + reward);
    setTimeShift((s) => s + jumpMs);
    const mins = Math.max(1, Math.round(jumpMs / MINUTE));
    showToast(`抓了 ${score} 只虫 · 肥料 +${reward} · 生长加速 ${mins} 分钟`);
  };

  const openBugGame = (index: number) => {
    pestPlot.current = index;
    setGameToken((t) => t + 1);
    setGameOpen(true);
  };

  const beginVendorAction = (vendor: Vendor) => {
    if (
      !shopOpen ||
      !vendorAvailable(vendor, eventTime()) ||
      !vendorCanTrade(vendorMemoryRef.current[VENDOR_MEMORY_KEYS[vendor]])
    ) {
      showToast("店主暂停交易，请先好好沟通");
      return false;
    }
    return beginAction();
  };

  const vendorPrice = (vendor: Vendor, price: number) =>
    vendorQuotedPrice(
      vendor,
      price,
      vendorMemoryRef.current[VENDOR_MEMORY_KEYS[vendor]],
      eventTime(),
      priceDealsRef.current[vendor],
    );
  const agreeVendorDiscount = (vendor: Vendor, percent: number) => {
    const at = eventTime();
    if (!shopOpen || !vendorAvailable(vendor, at))
      return "这次没能调整价格，等店铺营业时再谈吧。";
    const deal = negotiateVendorDeal(
      vendor,
      vendorMemoryRef.current[VENDOR_MEMORY_KEYS[vendor]],
      percent,
      at,
    );
    if (!deal) return "我现在不给优惠，先按店里的标价来吧。";
    const next = { ...priceDealsRef.current, [vendor]: deal };
    priceDealsRef.current = next;
    setGear((previous) => ({ ...previous, priceDeals: next }));
    return deal.discountPercent > 0
      ? `这轮给你的议价优惠定为${deal.discountPercent}%，已经计入店里的标价。总优惠最多25%，商品下次刷新后恢复。`
      : "这一轮恢复通常报价，店里的价格已经更新了。";
  };
  const buyCoopSupply = (id: CoopSupply) => {
    if (!beginVendorAction("farmer") || gear.coop[id]) return;
    const price = vendorPrice("farmer", COOP_SUPPLIES[id].price);
    if (coins < price) return;
    setCoins((value) => value - price);
    setGear((value) => ({ ...value, coop: { ...value.coop, [id]: true } }));
    showToast("鸡窝已安装" + COOP_SUPPLIES[id].label);
  };

  const buyOffer = (vendor: Vendor, offer: Offer) => {
    if (!beginVendorAction(vendor)) return;
    const window = marketWindow(eventTime());
    if (window !== marketWindow(now)) return;
    const key = vendor + ":" + offer.id;
    const currentOffer = marketOffers(vendor, eventTime()).find(
      (item) => item.id === offer.id,
    );
    if (
      !currentOffer ||
      level < offerLevel(currentOffer) ||
      !offerRemaining(currentOffer, vendor, gear, eventTime())
    )
      return;
    offer = currentOffer;
    const purchases = gear.stockWindow === window ? gear.purchased : {};
    const price = vendorPrice(vendor, offer.price);
    if (coins < price) return;
    const nextSeeds = offer.crop
      ? { ...seeds, [offer.crop]: seeds[offer.crop] + 1 }
      : seeds;
    const nextExtras = offer.extra
      ? { ...gear.extras, [offer.extra]: gear.extras[offer.extra] + 1 }
      : gear.extras;
    if (
      gear.bagWear >= 100 ||
      bagStacks(nextSeeds, economy.inventory, nextExtras, compost).length >
        bagCap
    )
      return;
    setSeeds(nextSeeds);
    setCoins((c) => c - price);
    setGear((g) => ({
      ...g,
      extras: nextExtras,
      stockWindow: window,
      purchased: { ...purchases, [key]: (purchases[key] ?? 0) + 1 },
      rarePurchases: rareOffer(offer)
        ? { day: realDate(eventTime()), count: 1 }
        : g.rarePurchases,
    }));
  };

  const smithService = (
    service: "bag" | "can" | "bagRepair" | "canRepair" | "hoe",
  ) => {
    if (!beginVendorAction("smith")) return;
    const base =
      service === "bag"
        ? UPGRADE_PRICES[gear.bag]
        : service === "can"
          ? UPGRADE_PRICES[canUpgrade]
          : service === "bagRepair"
            ? gear.bagWear
            : service === "canRepair"
              ? gear.rust
              : 40 - gear.hoe;
    if (!base) return;
    const price = vendorPrice("smith", base);
    if (coins < price) return;
    setCoins((c) => c - price);
    if (service === "can") {
      setCanUpgrade((c) => c + 1);
      setGear((g) => ({ ...g, rust: 0 }));
    } else
      setGear((g) =>
        service === "bag"
          ? { ...g, bag: g.bag + 1, bagWear: 0 }
          : service === "bagRepair"
            ? { ...g, bagWear: 0 }
            : service === "canRepair"
              ? { ...g, rust: 0 }
              : { ...g, hoe: 40 },
      );
  };

  const pickStack = (stack: BagStack) => {
    setInspectCan(stack.type === "can");
    if (stack.type === "seed" && stack.kind) {
      setSelected(stack.kind);
      setSupply(null);
      setFertilizing(false);
      setBagOpen(false);
      showToast("已选中 " + CROP_ART[stack.kind].label + "种子");
    } else if (stack.type === "can")
      setBagDetail(
        CAN_TIERS[canUpgrade] +
          " · 水量 " +
          water +
          "/" +
          waterCap +
          " · 锈蚀 " +
          gear.rust +
          "%",
      );
    else if (stack.type === "hoe") setBagDetail("锄头耐久 " + gear.hoe + "/40");
    else if (stack.type === "compost") {
      setFertilizing(true);
      setSupply(null);
      setBagOpen(false);
      showToast("请选择要施肥的作物");
    } else if (stack.extra === "growth" || stack.extra === "repellent") {
      setSupply(stack.extra);
      setFertilizing(false);
      setBagOpen(false);
      showToast("请选择要用药的作物");
    } else
      setBagDetail(
        stack.kind
          ? CROP_ART[stack.kind].label +
              " · " +
              QUALITY[
                Math.min(
                  4,
                  qualityOf(stack.kind) + (stack.type === "premium" ? 1 : 0),
                )
              ].label
          : "旅行商人的铜铃纪念品",
      );
  };

  const bulkHarvest = () => {
    if (!beginAction()) return;
    const t = eventTime() + timeShift;
    const ready = plots.flatMap((plot, i) =>
      plot.crop &&
      plotGrowth(plot, t) >= CROP_META[plot.crop].growMs &&
      (!plot.pestProne || plot.pestCleared)
        ? [i]
        : [],
    );
    setBagOpen(false);
    if (ready.length) collectHarvest(ready, t);
    else showToast("没有可直接收获的作物");
  };

  const bulkWater = () => {
    if (!beginAction()) return;
    setBagOpen(false);
    if (gear.rust >= 100) {
      showToast("水壶锈住了，请找铁匠清理");
      return;
    }
    const wear = Math.max(1, 6 - canUpgrade);
    const usable = Math.min(water, Math.ceil((100 - gear.rust) / wear));
    const result = waterFarmPlots(
      plots,
      usable,
      eventTime() + timeShift,
      wetDuration(economy.irrigation),
    );
    if (!result.ids.length) {
      showToast("没有可浇的田地，或水壶已空");
      return;
    }
    setPlots(result.plots);
    setWater(water - result.ids.length);
    setGear((g) => ({
      ...g,
      rust: Math.min(100, g.rust + result.ids.length * wear),
    }));
    record("water", result.ids.length);
    playSfx("farm_water", { volume: 0.74, rate: 1.05 });
    showToast(`已照料 ${result.ids.length} 块田地`);
  };

  const renderShop = (
    vendor: Vendor,
    section: "trade" | "requests" | "sell" | "guide" | "craft",
  ) => (
    <FarmShopSectionContent
      vendor={vendor}
      section={section}
      journal={journal}
      now={now}
      gear={gear}
      canUpgrade={canUpgrade}
      bagCap={bagCap}
      economy={economy}
      coins={coins}
      level={level}
      season={season}
      seeds={seeds}
      stacks={stacks}
      compost={compost}
      vendorPrice={vendorPrice}
      onSmithService={smithService}
      onImproveIrrigation={improveIrrigation}
      onBuyCoopSupply={buyCoopSupply}
      onBuyOffer={buyOffer}
      onResolveRequest={({ vendor: targetVendor, date, requestCrop, amount, reward, request }) => {
        if (
          !beginVendorAction(targetVendor) ||
          realDate(eventTime()) !== date ||
          request?.delivered
        )
          return;
        if (request) {
          const rest = consume(economy.inventory[requestCrop], amount);
          if (!rest) return;
          setEconomy((e) => ({
            ...e,
            inventory: { ...e.inventory, [requestCrop]: rest },
          }));
          setCoins((c) => c + reward);
        }
        setGear((g) => ({
          ...g,
          requests: {
            ...g.requests,
            [targetVendor]: { day: date, delivered: Boolean(request) },
          },
        }));
      }}
      onClaimGoal={(targetVendor, goal) => {
        if (!beginVendorAction(targetVendor)) return;
        const result = claimGoal(journal, goal, eventTime());
        setJournal(result.journal);
        if (result.reward) {
          setCoins((c) => c + result.reward);
          playSfx("farm_level_up", { volume: 0.74 });
        }
      }}
      onSelectCompost={(targetVendor) => {
        if (!beginVendorAction(targetVendor)) return;
        setFertilizing(true);
        setSupply(null);
        setShopOpen(false);
      }}
      onSellStock={sellStock}
      onDeliverOrder={deliverOrder}
      onMakeRecipe={makeRecipe}
      onBuildKitchen={buildKitchen}
      onRescueSeeds={rescueSeeds}
    />
  );

  const openTalk = (who: Speaker, position?: { x: number; y: number }) => {
    if (!loaded || loadFailed) return;
    const at = position ?? RESIDENT_PLACEMENTS[who].home;
    const residentPositions = residents
      .getResidents()
      .filter((r) => r.id !== who)
      .map((r) => r.logicalPosition);
    const standSpot =
      approachSpotForTarget(playerAnchor, at, residentPositions) ?? {
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
    // Prefer saved dialogue over a new greeting when opening an existing relationship.
    const saved: FarmChatMsg[] = memories[who].turns.flatMap((turn) => [
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
                    text: fallbackLine(who, { day, coins, growing, harvested }),
                  },
                ],
          },
    );
  };

  // 先收键盘再关面板：避免键盘收起与弹层关闭同时发生，页面高度停留在被键盘压缩后的状态
  const closePersonalChat = () => {
    personalRequest.current?.abort();
    Keyboard.dismiss();
    setSpeaker(null);
    setMemoryBookOpen(false);
    setGiftBarOpen(false);
    setFollowUp(null);
    setChatHint("");
  };

  function applyGiftToResident(who: ResidentId, item: GiftItemId) {
    const nowAt = eventTime();
    const dateKey = realDate(nowAt);
    const giftedToday =
      town.giftCounts?.date === dateKey ? (town.giftCounts.counts[who] ?? 0) : 0;
    const outcome = evaluateResidentGift(who, item, memories[who], giftedToday, nowAt);
    setMemories((prev) => ({ ...prev, [who]: outcome.nextMemory }));
    const itemText = giftLabel(item);
    setThreads((prev) => ({
      ...prev,
      [who]: [
        ...prev[who],
        {
          id: `gift-${chatId()}`,
          role: "user",
          text: `（送给你一份${itemText}）`,
          gift: {
            kind: "gift",
            itemLabel: itemText,
            itemId: item,
            quantity: 1,
            recipientName: RESIDENTS[who].name,
            tier: outcome.tier,
            affinityDelta: outcome.affinityDelta,
            rewardLabel: outcome.reward?.label,
            inventoryConsumed: true,
          },
        },
        { id: `${chatId()}-gift`, role: "assistant", text: outcome.reply },
      ].slice(-40),
    }));
    setTown((prev) => {
      const baseCounts = prev.giftCounts?.date === dateKey ? prev.giftCounts.counts : {};
      const nextEvents = outcome.rumor
        ? [
            ...prev.events.filter(
              (ev) => ev.expiresAt > nowAt && ev.title !== outcome.rumor!.title,
            ),
            outcome.rumor,
          ].slice(-12)
        : prev.events;
      return {
        ...prev,
        events: nextEvents,
        giftCounts: {
          date: dateKey,
          counts: { ...baseCounts, [who]: outcome.countsToday },
        },
      };
    });
    if (outcome.reward) {
      const reward = outcome.reward;
      if (reward.kind === "coins") {
        setCoins((c) => c + reward.amount);
      } else if (reward.kind === "compost") {
        setCompost((c) => Math.min(5, c + reward.amount));
      } else if (reward.kind === "seed" && reward.crop) {
        const rewardCrop = reward.crop;
        setSeeds((s) => ({ ...s, [rewardCrop]: s[rewardCrop] + reward.amount }));
      }
    }
    const deltaNote =
      outcome.affinityDelta > 0 ? `好感 +${outcome.affinityDelta}` : "今日送礼好感已达上限";
    const rewardNote = outcome.reward ? ` · 回礼：${outcome.reward.label}` : "";
    playSfx("farm_gift", { volume: 0.74 });
    showToast(`送给${RESIDENTS[who].name}「${itemText}」· ${deltaNote}${rewardNote}`);
  }

  function handleGiveCrop(who: ResidentId, crop: CropKind) {
    if (!loaded || loadFailed) return;
    const rest = consume(economy.inventory[crop], 1);
    if (!rest) {
      showToast(`仓库里没有足够的${giftLabel(crop)}`);
      return;
    }
    setEconomy((prev) => ({
      ...prev,
      inventory: { ...prev.inventory, [crop]: rest },
    }));
    applyGiftToResident(who, crop);
  }

  function handleGiveDish(who: ResidentId, recipe: Recipe) {
    if (!loaded || loadFailed) return;
    const nextInventory = craft(economy.inventory, recipe, coins);
    if (!nextInventory) {
      showToast(`材料或金币不足，暂无法现做${recipe.label}`);
      return;
    }
    setCoins((c) => Math.max(0, c - recipe.fee));
    setEconomy((prev) => ({ ...prev, inventory: nextInventory }));
    applyGiftToResident(who, recipe.id);
  }

  function handleFulfillWish(wish: ResidentWish) {
    if (!loaded || loadFailed || wish.fulfilled) return;
    const rest = consume(economy.inventory[wish.crop], wish.quantity);
    if (!rest) {
      showToast(`仓库里${giftLabel(wish.crop)}不足 ${wish.quantity} 份`);
      return;
    }
    const nowAt = eventTime();
    setEconomy((prev) => ({
      ...prev,
      inventory: { ...prev.inventory, [wish.crop]: rest },
    }));
    setCoins((c) => c + wish.rewardCoins);
    setCompost((c) => Math.min(5, c + 1));
    setMemories((prev) => {
      const current = prev[wish.resident];
      const boosted = recordVerifiedGiftMemory(
        {
          ...current,
          affinity: Math.min(100, current.affinity + 8),
          mood: "开心",
        },
        {
          who: wish.resident,
          itemId: wish.crop,
          itemLabel: giftLabel(wish.crop),
          quantity: wish.quantity,
          tier: "loved",
          source: "wish",
          note: `客人帮我实现了今日心愿，从背包实际送来 ${wish.quantity} 份${giftLabel(wish.crop)}（${wish.reason}），特别暖心。`,
          at: nowAt,
        },
      );
      return { ...prev, [wish.resident]: boosted };
    });
    const thankLine =
      wish.resident === "chicken"
        ? `咕咕咕！太好啦，收到 ${wish.quantity} 份${giftLabel(wish.crop)}，坤坤把小奖励偷偷塞给你！`
        : `哇，真的送来 ${wish.quantity} 份${giftLabel(wish.crop)}啦！正好派上大用场，这 ${wish.rewardCoins} 金币和有机肥你一定要收下！`;
    setThreads((prev) => ({
      ...prev,
      [wish.resident]: [
        ...prev[wish.resident],
        {
          id: `wish-${chatId()}`,
          role: "user",
          text: `（帮你实现心愿：送来 ${wish.quantity} 份${giftLabel(wish.crop)}）`,
          gift: {
            kind: "wish",
            itemLabel: giftLabel(wish.crop),
            itemId: wish.crop,
            quantity: wish.quantity,
            recipientName: RESIDENTS[wish.resident].name,
            tier: "loved",
            affinityDelta: 8,
            rewardLabel: `${wish.rewardCoins} 金币 · 1 有机肥`,
            inventoryConsumed: true,
          },
        },
        { id: `${chatId()}-wish`, role: "assistant", text: thankLine },
      ].slice(-40),
    }));
    setTown((prev) => {
      const baseWishes =
        prev.wishes && prev.wishes.length > 0 && prev.wishes[0].date === wish.date
          ? prev.wishes
          : dailyWishes;
      const nextWishes = baseWishes.map((w) =>
        w.id === wish.id ? { ...w, fulfilled: true } : w,
      );
      const rumor = {
        id: `wish-rumor-${nowAt}-${wish.resident}`,
        title: `${RESIDENTS[wish.resident].name}的今日心愿实现啦`,
        detail: `客人贴心送来 ${wish.quantity} 份${giftLabel(wish.crop)}，${RESIDENTS[wish.resident].name}乐得合不拢嘴。`,
        kind: "rumor" as const,
        knownBy: [wish.resident],
        hotspot: "plaza" as const,
        createdAt: nowAt,
        expiresAt: nowAt + 12 * 3600_000,
      };
      return {
        ...prev,
        wishes: nextWishes,
        events: [
          ...prev.events.filter((ev) => ev.expiresAt > nowAt && ev.title !== rumor.title),
          rumor,
        ].slice(-12),
      };
    });
    showToast(
      `实现${RESIDENTS[wish.resident].name}的心愿！+${wish.rewardCoins} 金币 · +1 有机肥 · +8 好感`,
    );
  }

  function handleCompleteFocus(minutes: number, companions: ResidentId[], topic: string) {
    const nowAt = eventTime();
    const res = settleFocusSession({
      stats: focusStats,
      memories,
      minutes,
      companions,
      topic,
      at: nowAt,
    });
    setMemories(res.nextMemories);
    setCoins((c) => c + res.rewardCoins);
    if (res.rewardCompost > 0) {
      setCompost((c) => Math.min(5, c + res.rewardCompost));
    }
    setTimeShift((s) => s + res.growthBoostMs);
    setTown((prev) => ({ ...prev, focus: res.nextStats }));
    showToast(
      `伴读完成！+${res.rewardCoins} 金币${res.rewardCompost ? " · +1 有机肥" : ""} · 作物加速生长`,
    );
    return res.note;
  }

  function handleHostFestival(recipe?: Recipe) {
    if (!loaded || loadFailed) return null;
    if (recipe) {
      const nextInv = craft(economy.inventory, recipe, coins);
      if (!nextInv) {
        showToast(`材料或金币不足，暂无法现做${recipe.label}`);
        return null;
      }
      setCoins((c) => Math.max(0, c - recipe.fee));
      setEconomy((prev) => ({ ...prev, inventory: nextInv }));
    }
    const nowAt = eventTime();
    const res = hostCampfireGathering({
      festival: activeFestival,
      day,
      memories,
      dishLabel: recipe?.label,
      at: nowAt,
    });
    setMemories(res.nextMemories);
    setTown((prev) => ({
      ...prev,
      postcards: [...(prev.postcards ?? []), res.postcard].slice(-16),
      events: [
        ...prev.events.filter((ev) => ev.expiresAt > nowAt && ev.title !== res.townEvent.title),
        res.townEvent,
      ].slice(-12),
    }));
    showToast(`「${activeFestival.title}」点亮广场篝火！全家好感 +${res.affinityBoost}，已收藏纪念明信片`);
    return res.postcard;
  }

  function handleFishingCatch(outcome: CatchOutcome) {
    const nowAt = eventTime();
    const nextBook = applyFishingCatch(fishingBook, outcome);
    setTown((prev) => ({ ...prev, fishing: nextBook }));
    if (outcome.kind === "bottle") {
      setCoins((c) => c + outcome.bottle.bonusCoins);
      showToast(`捞到漂流瓶「${outcome.bottle.title}」· +${outcome.bottle.bonusCoins} 金币`);
    } else {
      if (outcome.luckyBonus) {
        setMemories((prev) => ({
          ...prev,
          weigang: { ...prev.weigang, affinity: Math.min(100, prev.weigang.affinity + 1) },
        }));
      }
      showToast(
        `钓起 ${FISH_META[outcome.fish].label}${outcome.isNewRecord ? "（新图鉴！）" : ""}`,
      );
    }
    void nowAt;
  }

  function handleSellFish(fish: FishKind) {
    const res = sellFishFromBook(fishingBook, fish);
    if (res.sold <= 0) return;
    setTown((prev) => ({ ...prev, fishing: res.nextBook }));
    setCoins((c) => c + res.earned);
    showToast(`出售 ${res.sold} 条${FISH_META[fish].label} · +${res.earned} 金币`);
  }

  function handleCookFishSoup() {
    const res = cookFishSoupFromBook(fishingBook);
    if (!res.ok) {
      showToast("鱼篓里没有可用于煲汤的银鲫或锦鲤");
      return;
    }
    const nowAt = eventTime();
    setCoins((c) => c + 64);
    setMemories((prev) => {
      const next = { ...prev };
      for (const id of RESIDENT_IDS) {
        next[id] = { ...next[id], affinity: Math.min(100, next[id].affinity + 1), mood: "开心" };
      }
      return next;
    });
    setTown((prev) => ({
      ...prev,
      fishing: res.nextBook,
      events: [
        ...prev.events.filter((ev) => ev.expiresAt > nowAt),
        {
          id: `fish-soup-${nowAt}`,
          title: "院子里飘起鲜鱼豆腐汤的香味",
          detail: "顾用刚从池塘钓起的新鲜河鱼熬了一大锅奶白鲜鱼汤，全家人都闻香而来。",
          kind: "rumor" as const,
          knownBy: ["gu", "weigang"] as ResidentId[],
          hotspot: "houseDoor" as const,
          createdAt: nowAt,
          expiresAt: nowAt + 12 * 3600_000,
        },
      ].slice(-12),
    }));
    playSfx("farm_cook", { volume: 0.76 });
    showToast("炖好一锅鲜鱼豆腐汤！+64 金币 · 全员好感 +1");
  }

  function handleClaimStoryChapter(who: ResidentId) {
    const nowAt = eventTime();
    const res = claimStoryChapter({
      who,
      progress: storyProgress,
      memories,
      day,
      at: nowAt,
    });
    if (!res) return;
    setMemories(res.nextMemories);
    setTown((prev) => ({ ...prev, stories: res.nextProgress }));
    setCoins((c) => c + res.chapter.rewardCoins);
    if (res.chapter.rewardCompost > 0) {
      setCompost((c) => Math.min(5, c + res.chapter.rewardCompost));
    }
    playSfx("farm_level_up", { volume: 0.74 });
    showToast(
      `解锁${RESIDENTS[who].name}第 ${res.chapter.act} 幕「${res.chapter.title}」· +${res.chapter.rewardCoins} 金币`,
    );
  }

  function handleBuyDecor(id: DecorId) {
    if (!loaded || loadFailed || decorState.owned.includes(id)) return;
    const item = getDecorMeta(id);
    if (coins < item.price) {
      showToast(`金币不足，需要 ${item.price} 金币`);
      return;
    }
    const nowAt = eventTime();
    const firstNoticer =
      id === "pond_lantern" ? "weigang" : id === "windmill" ? "xiaoba" : id === "campfire_ring" ? "yujie" : "gu";
    const ev = buildDecorAnnouncementEvent(id, firstNoticer, nowAt);
    setCoins((c) => Math.max(0, c - item.price));
    setTown((prev) => ({
      ...prev,
      decor: {
        owned: [...decorState.owned, id],
        placed: [...decorState.placed, id],
        announced: [...decorState.announced, id],
      },
      events: [...prev.events.filter((e) => e.expiresAt > nowAt && e.title !== ev.title), ev].slice(-12),
    }));
    showToast(`已购置并摆出「${item.label}」！${RESIDENTS[firstNoticer].name}一眼就注意到啦`);
  }

  function handleToggleDecor(id: DecorId) {
    if (!decorState.owned.includes(id)) return;
    const isPlaced = decorState.placed.includes(id);
    const nextPlaced = isPlaced
      ? decorState.placed.filter((x) => x !== id)
      : [...decorState.placed, id];
    setTown((prev) => ({
      ...prev,
      decor: { ...decorState, placed: nextPlaced },
    }));
    showToast(isPlaced ? `已暂时收起「${getDecorMeta(id).label}」` : `已将「${getDecorMeta(id).label}」摆进院子`);
  }

  function summonHorrorVisitor() {
    if (!loaded || loadFailed) return;
    const nowAt = eventTime();
    const aftermath = recordHorrorAftermathToFamily(memories, nowAt);
    setMemories(aftermath.nextMemories);
    setTown((prev) => {
      const curV = prev.visitors ?? emptyVisitorState();
      return {
        ...prev,
        visitors: {
          ...curV,
          horrorActive: true,
          lastHorrorDay: day,
          sleepDeprivedDay: day,
        },
        events: [
          ...prev.events.filter((e) => e.expiresAt > nowAt && e.title !== aftermath.event.title),
          aftermath.event,
        ].slice(-12),
      };
    });
    setTownOpen(false);
    playSfx("horror_appear", { ignoreCooldown: true, volume: 0.76 });
    showToast("⚠ 恐怖徐睡阴扛着幽蓝电脑闯进院子打瓦啦！快去点他把人赶走！");
  }

  function openVisitorTalk(who: VisitorId, position?: { x: number; y: number }) {
    if (!loaded || loadFailed) return;
    closePersonalChat();
    if (position) {
      const standSpot =
        approachSpotForTarget(playerAnchor, position, []) ?? {
          x: position.x - 14,
          y: position.y + 3,
        };
      moveTo(standSpot.x, standSpot.y, { faceTowardX: position.x });
    }
    setVisitorSpeaker(who);
    setVisitorDraft("");
    setVisitorHint("");
    setVisitorOnline(Boolean(apiKey));
    const profile = resolveVisitorDisplayProfile(who, whaleSync);
    setVisitorThreads((prev) =>
      prev[who].length
        ? prev
        : {
            ...prev,
            [who]: [{ id: chatId(), role: "assistant", text: profile.greetings[0] }],
          },
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
      const vEmotion = resolveVisitorEmotion(who, visitorState, whaleSync, nowAt);
      const res = await runVisitorChatTurn({
        who,
        text,
        history: historyBefore,
        scene: { day, season: seasonName, night, weather, rainbow, period },
        sleepDeprived,
        emotion: vEmotion,
        whaleSync,
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
        setTown((prev) => ({
          ...prev,
          visitors: applyVisitorChatOutcome(prev.visitors ?? emptyVisitorState(), who, res, nowAt),
        }));
        if (who === "dafeiyu") {
          void speakWhale(res.reply);
          if (whaleSyncEnabled) {
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

  function applyVisitorGift(who: NormalVisitorId, item: CropKind | Recipe["id"]) {
    const nowAt = eventTime();
    const res = evaluateVisitorGift(who, item, visitorState.records[who], nowAt, whaleSync);
    const displayProfile = resolveVisitorDisplayProfile(who, whaleSync);
    setTown((prev) => {
      const curV = prev.visitors ?? emptyVisitorState();
      return {
        ...prev,
        visitors: {
          ...curV,
          records: { ...curV.records, [who]: res.nextRecord },
        },
      };
    });
    if (who === "dafeiyu" && whaleSyncEnabled) {
      useWhaleMemory.getState().applyMood(farmDeltaToWhaleEmotionDelta(res.emotionDelta), nowAt);
      useWhaleMemory.getState().bumpBond("interaction", nowAt);
      useWhalePet.getState().feed();
    }
    const label = giftLabel(item);
    setVisitorThreads((prev) => ({
      ...prev,
      [who]: [
        ...prev[who],
        {
          id: `vg-${chatId()}`,
          role: "user",
          text: `（送给来串门的${displayProfile.name}一份${label}）`,
          gift: {
            kind: "gift",
            itemLabel: label,
            itemId: item,
            quantity: 1,
            recipientName: displayProfile.name,
            affinityDelta: res.affinityDelta,
            inventoryConsumed: true,
          },
        },
        { id: `${chatId()}-vg`, role: "assistant", text: res.reply },
      ].slice(-36),
    }));
    playSfx(who === "dafeiyu" ? "whale_cute_happy" : "farm_gift", { volume: 0.74 });
    showToast(
      `招待${displayProfile.name}「${label}」${res.affinityDelta > 0 ? ` · 好感 +${res.affinityDelta}` : " · 今日好感已满"}`,
    );
  }

  function handleVisitorGiveCrop(who: NormalVisitorId, crop: CropKind) {
    const rest = consume(economy.inventory[crop], 1);
    if (!rest) {
      showToast(`仓库里没有足够的${giftLabel(crop)}`);
      return;
    }
    setEconomy((prev) => ({ ...prev, inventory: { ...prev.inventory, [crop]: rest } }));
    applyVisitorGift(who, crop);
  }

  function handleVisitorGiveDish(who: NormalVisitorId, recipe: Recipe) {
    const nextInv = craft(economy.inventory, recipe, coins);
    if (!nextInv) {
      showToast(`材料或金币不足，暂无法现做${recipe.label}`);
      return;
    }
    setCoins((c) => Math.max(0, c - recipe.fee));
    setEconomy((prev) => ({ ...prev, inventory: nextInv }));
    applyVisitorGift(who, recipe.id);
  }

  function handleBanishHorror(method: HorrorBanishMethod) {
    const nowAt = eventTime();
    const res = resolveHorrorBanish(method, nowAt);
    setCoins((c) => c + res.rewardCoins);
    setTown((prev) => {
      const curV = prev.visitors ?? emptyVisitorState();
      return {
        ...prev,
        visitors: {
          ...curV,
          horrorActive: false,
          horrorBanishedCount: curV.horrorBanishedCount + 1,
        },
        events: [
          ...prev.events.filter((e) => e.expiresAt > nowAt && e.title !== res.rumor.title),
          res.rumor,
        ].slice(-12),
      };
    });
    setVisitorThreads((prev) => ({
      ...prev,
      dark_xushuiyin: [
        ...prev.dark_xushuiyin,
        { id: `${chatId()}-banish`, role: "assistant" as const, text: res.reply },
      ].slice(-36),
    }));
    playSfx("horror_banish", { ignoreCooldown: true, volume: 0.78 });
    showToast(res.toast);
  }

  function handleWakeResident(who: Exclude<ResidentId, "chicken">) {
    const nowAt = eventTime();
    setWokenNightState((prev) => {
      const list = prev.day === day ? prev.ids : [];
      if (list.includes(who)) return prev;
      return { day, ids: [...list, who] };
    });
    setMemories((prev) => ({
      ...prev,
      [who]: shiftResidentMemoryEmotion(
        prev[who],
        who,
        sleepTransitionEmotionDelta({ actorId: who, action: "wake_up" }),
        nowAt,
      ),
    }));
    const line = WAKE_UP_LINES[who];
    setThreads((prev) => ({
      ...prev,
      [who]: [...prev[who], { id: `${chatId()}-wake`, role: "assistant", text: line }].slice(-40),
    }));
    setHouseOpen(false);
    showToast(`叫醒了${RESIDENTS[who].name}：「${line.slice(0, 26)}…」`);
  }

  function handleTuckInResident(who: Exclude<ResidentId, "chicken">) {
    const nowAt = eventTime();
    if (tuckedIdsToday.includes(who)) return;
    setTown((prev) => {
      const curIds = prev.tuckedIn?.day === day ? prev.tuckedIn.ids : [];
      if (curIds.includes(who)) return prev;
      return { ...prev, tuckedIn: { day, ids: [...curIds, who] } };
    });
    setMemories((prev) => ({
      ...prev,
      [who]: {
        ...shiftResidentMemoryEmotion(
          prev[who],
          who,
          sleepTransitionEmotionDelta({ actorId: who, action: "tuck_in" }),
          nowAt,
        ),
        affinity: Math.min(100, prev[who].affinity + 2),
      },
    }));
    showToast(TUCK_IN_REACTIONS[who]);
  }

  function triggerHeroHappyPulse() {
    setHeroEmotionPose("happy");
    if (heroEmotionTimer.current) clearTimeout(heroEmotionTimer.current);
    heroEmotionTimer.current = setTimeout(() => setHeroEmotionPose("neutral"), 4200);
  }

  function handleTriggerRandomEvent(force = true) {
    const nowAt = eventTime();
    const picked = pickFarmRandomEvent({
      state: randomEventState,
      weather,
      rainbow,
      period,
      activeVisitor: activeNormalVisitor,
      at: nowAt,
      force,
    });
    if (!picked) {
      if (force) showToast("院子里风平浪静，稍后再来看看新奇遇吧");
      return;
    }
    setTown((prev) => ({
      ...prev,
      randomEvents: {
        ...(prev.randomEvents ?? emptyRandomEventState()),
        activeEventId: picked.id,
        activeTriggeredAt: nowAt,
      },
    }));
    if (force) {
      setTownOpen(false);
      setRandomEventModalOpen(true);
    } else {
      showToast(`✨ 农场新奇遇：${picked.title}`);
    }
  }

  function handleResolveRandomEvent(choice: FarmRandomEventChoice) {
    const ev = activeRandomEvent;
    if (!ev) return;
    const nowAt = eventTime();
    if (choice.coins) setCoins((c) => c + (choice.coins ?? 0));
    if (choice.compost) setCompost((n) => n + (choice.compost ?? 0));
    if (choice.waterRefill) setWater((w) => Math.min(waterCap, w + (choice.waterRefill ?? 0)));
    if (choice.growthBoostMinutes) setTimeShift((s) => s + (choice.growthBoostMinutes ?? 0) * MINUTE);

    setMemories((prev) => {
      const next = { ...prev };
      for (const id of ev.participants) {
        const shifted = shiftResidentMemoryEmotion(next[id], id, choice.emotionDelta, nowAt);
        next[id] = {
          ...shifted,
          affinity: Math.min(100, shifted.affinity + (choice.affinityDelta ?? 0)),
        };
      }
      return next;
    });

    if (ev.preferredVisitor === "dafeiyu" && whaleSyncEnabled) {
      useWhaleMemory.getState().applyMood(farmDeltaToWhaleEmotionDelta(choice.emotionDelta), nowAt);
      useWhaleMemory.getState().bumpBond("interaction", nowAt);
    }

    setTown((prev) => {
      const prevRE = prev.randomEvents ?? emptyRandomEventState();
      const extraEvent = choice.rumorTitle
        ? [
            {
              id: `re-${ev.id}-${nowAt}`,
              title: choice.rumorTitle,
              detail: choice.rumorDetail ?? choice.outcomeText,
              kind: "rumor" as const,
              knownBy: [...ev.participants],
              hotspot: ev.hotspot,
              createdAt: nowAt,
              expiresAt: nowAt + 18 * 3600_000,
            },
          ]
        : [];
      return {
        ...prev,
        events: [...prev.events.filter((e) => e.expiresAt > nowAt), ...extraEvent].slice(-12),
        randomEvents: {
          activeEventId: null,
          activeTriggeredAt: 0,
          lastResolvedAt: nowAt,
          recentIds: [...prevRE.recentIds.filter((id) => id !== ev.id), ev.id].slice(-8),
          resolvedCount: prevRE.resolvedCount + 1,
        },
      };
    });

    setRandomEventModalOpen(false);
    triggerHeroHappyPulse();
    showToast(choice.outcomeText);
  }

  // 天气或时段切换时，温和推动全家四维情绪变化
  useEffect(() => {
    if (!loaded || loadFailed) return;
    const key = `${day}-${period}-${weather}-${rainbow ? 1 : 0}`;
    if (lastWeatherPulseKey.current === key) return;
    const isInitial = lastWeatherPulseKey.current === "";
    lastWeatherPulseKey.current = key;
    if (isInitial) return;
    const nowAt = eventTime();
    setMemories((prev) => {
      const next = { ...prev };
      for (const id of RESIDENT_IDS) {
        next[id] = shiftResidentMemoryEmotion(
          next[id],
          id,
          weatherEmotionPulse(id, weather, rainbow, period),
          nowAt,
        );
      }
      return next;
    });
  }, [loaded, loadFailed, day, period, weather, rainbow]);

  // 农场随机奇遇定时巡检（每 38 秒检查冷却，不打断打开中的面板）
  useEffect(() => {
    if (!focused || !loaded || loadFailed || !randomEventsEnabled) return;
    const id = setInterval(() => {
      if (
        (AppState.currentState && AppState.currentState !== "active") ||
        shopOpen ||
        houseOpen ||
        gameOpen ||
        bagOpen ||
        groupOpen ||
        townOpen ||
        speaker ||
        visitorSpeaker ||
        randomEventModalOpen
      ) {
        return;
      }
      if (activeRandomEvent) return;
      const nowAt = eventTime();
      const picked = pickFarmRandomEvent({
        state: randomEventState,
        weather,
        rainbow,
        period,
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
    focused,
    loaded,
    loadFailed,
    randomEventsEnabled,
    shopOpen,
    houseOpen,
    gameOpen,
    bagOpen,
    groupOpen,
    townOpen,
    speaker,
    visitorSpeaker,
    randomEventModalOpen,
    activeRandomEvent,
    randomEventState,
    weather,
    rainbow,
    period,
    activeNormalVisitor,
  ]);

  useEffect(() => () => {
    if (heroEmotionTimer.current) clearTimeout(heroEmotionTimer.current);
  }, []);

  const openGroupChat = (
    initialMembers?: readonly ResidentId[],
    seedRecord?: ResidentConversation,
  ) => {
    if (!loaded || loadFailed) return;
    closePersonalChat();
    setLifeOpen(false);
    clearGroupRevealTimers();
    if (initialMembers && initialMembers.length >= 2) {
      setGroupMembers([...new Set(initialMembers)]);
    }
    if (seedRecord) {
      setGroupMessages(seedGroupMessagesFromRecord(seedRecord));
    }
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
    if (!loaded || loadFailed || groupBusy || groupRequest.current) return;
    const text = banterOnly ? "" : groupDraft.trim();
    if (!banterOnly && !text) return;
    clearGroupRevealTimers();
    const activeMembers = groupMembers.length >= 2 ? groupMembers : (["door", "gu"] as ResidentId[]);
    const controller = new AbortController();
    groupRequest.current = controller;
    const at = eventTime();
    const historyBefore = groupMessages;
    let actionHint = "";
    if (!banterOnly) {
      setGroupMessages((prev) =>
        [...prev, { id: chatId(), speaker: "player" as const, text, at }].slice(-50),
      );
      setGroupDraft("");
      // Allow explicit @member farm tasks or relays to absent residents directly from group chat
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
        memories,
        recentMessages: historyBefore,
        scene: { day, season: seasonName, growing, ripe, night, weather, rainbow, period },
        studyBrief: studyContext.brief || undefined,
        sleepDeprivedNote: sleepDeprived
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
      // Stagger multi-speaker replies (~520ms apart) so group banter flows naturally instead of flooding at once
      if (incoming.length <= 1 || reduceMotion) {
        setGroupMessages((prev) => [...prev, ...incoming].slice(-50));
      } else {
        setGroupMessages((prev) => [...prev, incoming[0]].slice(-50));
        setGroupTypingLabel(`${RESIDENTS[incoming[1].speaker as ResidentId].name} 正在接话…`);
        for (let i = 1; i < incoming.length; i++) {
          const msg = incoming[i];
          const nextMsg = incoming[i + 1];
          const timer = setTimeout(() => {
            setGroupMessages((prev) => [...prev, msg].slice(-50));
            setGroupTypingLabel(
              nextMsg ? `${RESIDENTS[nextMsg.speaker as ResidentId].name} 正在接话…` : "",
            );
          }, i * 520);
          groupRevealTimers.current.push(timer);
        }
      }
      setMemories((previous) => {
        let next = recordGroupChatMemory(
          previous,
          activeMembers,
          text,
          result.lines,
          result.memory,
          at,
        );
        if (!banterOnly) {
          const responderSet = new Set(result.lines.map((l) => l.speaker));
          for (const id of activeMembers) {
            if (result.reaction === "neutral" && !responderSet.has(id)) continue;
            const p = PERSONALITIES[id];
            const interested = Boolean(
              p?.interests.some((topic) => text.includes(topic)) && text.length >= 6,
            );
            const curEm = getResidentEmotion(next[id], id, at);
            const impact = evaluateNpcSocialImpact({
              actorId: id,
              current: curEm,
              reaction: result.reaction,
              interested,
              now: at,
            });
            const desc = describeFarmEmotion(impact.nextEmotion);
            const delta =
              result.reaction === "insult"
                ? -(p?.insultLoss ?? 8)
                : result.reaction === "teasing"
                  ? -(p?.teaseLoss ?? 4)
                  : result.reaction === "warm"
                    ? Math.max(1, Math.round((p?.warmGain ?? 2) / 2))
                    : result.reaction === "apology"
                      ? (p?.apologyGain ?? 1)
                      : 0;
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
    if (
      !text ||
      !who ||
      !loaded ||
      loadFailed ||
      chatBusy ||
      personalRequest.current
    )
      return;
    const request = new AbortController();
    personalRequest.current = request;
    const memory = memories[who];
    const privateReply = privateFarmChatReply(
      who,
      text,
      Math.floor(memory.affinity / 2),
    );
    const dutyCommand = detectDutyCommand(text, who);
    const seededRumor = detectSeedRumorFromChat(text, who, eventTime());
    if (seededRumor) {
      setTown((prev) => ({
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
    const followUpQuestion = previousQuestion && previousTarget && followUpRecord?.participants[0] === who
      ? previousQuestion.slice(0, 156 - followUpDetail.length) + "；补充：" + followUpDetail
      : undefined;
    const assignmentInput = understandAssignment(
      text,
      who,
      memory.assignment,
      talkContext,
      eventTime(),
    );
    const mine: FarmChatMsg = { id: chatId(), role: "user", text };
    setThreads((prev) => ({ ...prev, [who]: [...prev[who], mine].slice(-40) }));
    setDraft("");
    setChatBusy(true);
    setFollowUp(null);
    const heard = residents.settings.shareTopics
      ? heardFarmTopic(residents.history, who, text)
      : undefined;
    const familyMemory = heard ? familyTopicRecall(heard) : "";
    const project = RESIDENT_PROJECTS[who];
    const recentLife = residentReflections(residents.history, who);
    const taskReports = residents.history
      .filter(
        (record) =>
          record.source === "player_command" &&
          record.participants[0] === who &&
          record.requestOutcome,
      )
      .slice(-2)
      .map((record) => record.requestOutcome!);
    const asksTaskReport =
      /(?:问得|办得|结果|回复|答复|怎么样了|说了什么|问清楚了吗)/.test(text) &&
      (taskReports.length > 0 || Boolean(memory.assignment));
    const askProject =
      /^(?:最近在忙什么|你最近在忙什么|你有什么小目标)[？?]?$/.test(text);
    const localReply = () =>
      asksTaskReport
        ? memory.assignment
          ? assignmentRecall(memory.assignment)
          : taskReports.at(-1)!
        : askProject
          ? `我最近想${project.goal}。${recentLife.find((note) => note.startsWith("最近抽空")) ?? "等有空，我想先" + project.activity + "。"}`
          : (personalityReply(
              who,
              text,
              localSocialReaction(text),
              memory.mood,
            ) ??
            offlineFarmRecall(who, memory, text) ??
            (familyMemory
              ? familyMemory + "你想接着聊哪一部分？"
              : fallbackLine(who, { day, coins, growing, harvested })));
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
    const query =
      /^(?:请|能不能)?(?:帮我)?(?:联网搜(?:索)?|查(?:一)?下|搜(?:一)?下|搜索)[：:，,\s]*(.{2,120})$/u
        .exec(text)?.[1]
        ?.trim();
    let sources: SearchHit[] = [];
    setChatHint("");
    const boundaryReply = () =>
      boundaryReplyForResident(who, reaction, text, memory.mood);
    const personaMemoryText = formatPersonaMemoryBlock(who, memory, {
      query: text,
      peers: ["player"],
      at: eventTime(),
      includePrivate: true,
      maxEpisodes: 5,
    });
    const pendingRelayIntent =
      assignmentInput?.execute
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
          type: "talk_to",
          target: previousTarget,
          purpose: followUpQuestion,
          intent: detectRelayIntent(followUpQuestion),
        };
        reply = formatAssignmentAck(
          who,
          previousTarget,
          followUpQuestion,
          detectRelayIntent(followUpQuestion),
        );
        setChatOffline(true);
      } else if (dutyCommand) {
        setTown((prev) => {
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
        if (assignmentInput.execute)
          action = { type: "talk_to", ...assignmentInput.execute };
        setChatOffline(true);
      } else if (pendingRelayIntent && !apiKey) {
        if (assignmentInput) assignmentUpdate = assignmentInput.task;
        action = { type: "talk_to", ...pendingRelayIntent };
        reply = formatAssignmentAck(
          who,
          pendingRelayIntent.target,
          pendingRelayIntent.purpose,
          pendingRelayIntent.intent,
        );
        setChatOffline(true);
      } else if (!apiKey || (continuing && !memory.turns.length)) {
        action = continuing ? null : localNpcCommand(text, who);
        reply = action
          ? "好呀，交给我来办。"
          : reaction === "apology" &&
              (memory.mood === "生气" || memory.mood === "不悦")
            ? "我听到了。给我一点时间，我们慢慢说。"
            : localReply();
        if (
          !action &&
          reaction !== "apology" &&
          !askProject &&
          !asksTaskReport
        ) {
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
                who,
                day,
                seasonName,
                coins,
                growing,
                ripe,
                harvested,
                weather,
                rainbow,
                period,
                night,
                query,
                memory,
                project,
                recentLife,
                coop: gear.coop,
                personaMemoryText,
                studyBrief: studyContext.brief,
                sleepDeprived,
                nightSoloEvent,
                taskReports,
                relayContextHint,
                familyMemory,
                at: eventTime(),
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
            timeoutMs: 16000,
            maxTokens: 560,
            retries: 2,
            validate: (raw) => parseNpcReply(raw, true) !== null,
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
            continuing ||
            query ||
            reaction === "teasing" ||
            reaction === "insult"
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
            who,
            pendingRelayIntent.target,
            pendingRelayIntent.purpose,
            pendingRelayIntent.intent,
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
          who,
          pendingRelayIntent.target,
          pendingRelayIntent.purpose,
          pendingRelayIntent.intent,
        );
        setChatOffline(true);
      } else {
        reply = NPC_CHAT_UNAVAILABLE;
        chatUnavailable = true;
        action = null;
        setChatOffline(true);
      }
      // 临时故障（超时/网络/服务繁忙）只影响这一轮，下一句仍会尝试联网
      if (
        error instanceof FarmChatError &&
        error.status !== undefined &&
        !error.retryable
      ) {
        console.warn("[farm-chat]", {
          status: error.status,
          reason: error.message,
        });
      } else {
        console.warn("[farm-chat]", {
          reason:
            error instanceof FarmChatError ? error.message : "request-failed",
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
        id: mine.id,
        player: text,
        reply,
        ...(chatUnavailable ? { unavailable: true as const } : {}),
      };
      setMemories((previous) => {
        let updated = recordFarmChatTurn(
          {
            ...previous[who],
            ...(assignmentUpdate ? { assignment: assignmentUpdate } : {}),
          },
          turn,
          reaction,
          who,
        );
        if (!chatUnavailable) {
          updated = applyPlayerMemoryUpdates(
            updated,
            memoryUpdates,
            text,
            nowAt,
            fallbackEpisode,
          );
          updated = maybeSynthesizeReflection(updated, who, nowAt);
        }
        return { ...previous, [who]: updated };
      });
    }
    if (query && sources.length && reply && !reply.startsWith("这次没能"))
      reply +=
        "\n\n参考：" +
        sources
          .slice(0, 2)
          .map((hit) => hit.title + "\n" + hit.url)
          .join("\n");
    if (action) {
      action =
        action.type === "talk_to" && assignmentUpdate?.question
          ? {
              ...action,
              purpose: assignmentUpdate.question,
              intent:
                action.intent ??
                assignmentUpdate.intent ??
                detectRelayIntent(assignmentUpdate.question),
            }
          : action.type === "talk_to" && action.purpose
            ? {
                ...action,
                intent: action.intent ?? detectRelayIntent(action.purpose),
              }
            : bindTalkPurpose(action, text, talkContext);
      if (
        action.type === "talk_to" &&
        action.purpose &&
        memory.assignment?.engineId
      )
        residents.cancelCommand(who, memory.assignment.engineId);
      const result = residents.command(who, action);
      if (!result.ok || action.type === "discuss") reply = result.message;
      if (result.ok && action.type === "talk_to" && action.purpose) {
        const reason = apiKey
          ? lifeRequestBlockReason(
              residents.usage,
              residents.settings,
              eventTime(),
              true,
            )
          : "未配置 API Key";
        if (!reply.trim()) {
          reply = formatAssignmentAck(
            who,
            action.target,
            action.purpose,
            action.intent ?? detectRelayIntent(action.purpose),
          );
        }
        // Keep system status out of the NPC's spoken dialogue; show it cleanly in the subtle hint bar.
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
      setMemories((previous) => {
        let updated = recordFarmChatTurn(
          {
            ...previous[who],
            ...(assignmentUpdate ? { assignment: assignmentUpdate } : {}),
          },
          { id: mine.id, player: text, reply },
          reaction,
          who,
        );
        updated = applyPlayerMemoryUpdates(
          updated,
          memoryUpdates,
          text,
          nowAt,
          fallbackEpisode,
        );
        return { ...previous, [who]: updated };
      });
    }
    setThreads((prev) => ({
      ...prev,
      [who]: [
        ...prev[who],
        {
          id: chatId(),
          role: "assistant" as const,
          text: reply || "我在这里陪着你。",
        },
      ].slice(-40),
    }));
  };

  const chatResident = RESIDENTS[speaker ?? "gu"];
  const speakerName = chatResident.name;
  const chatMemory = memories[speaker ?? "gu"];
  const speakerMood =
    chatMemory.mood ??
    residents.getResidents().find((resident) => resident.id === speaker)?.mood ??
    "平静";
  const canContinueChat = chatMemory.turns.some(
    (turn) => !isFarmChatContinuation(turn.player),
  );
  const effectiveHeaderH = headerHeight > 0 ? headerHeight : insets.top + 58;
  const availMapH = mapHeight > 0 ? mapHeight : Math.max(0, height - effectiveHeaderH);
  // 让农场背景贴图自然延展铺满至屏幕底端，并为小屏提供平滑滚动避让悬浮底栏的草坡余量
  const bottomSkirtH = Math.max(0, Math.ceil(Math.max(availMapH - sceneH, hudOverlayH - 6)));
  const skirtStretch = 1.8;
  const skirtTileH = Math.max(22, Math.round(sceneH * 0.026 * skirtStretch));
  const skirtImageH = Math.round(sceneH * skirtStretch);
  const skirtTileCount = bottomSkirtH > 0 ? Math.ceil(bottomSkirtH / skirtTileH) : 0;
  const weigangAtPond = (() => {
    const wg = residents.getResidents().find((r) => r.id === "weigang");
    return Boolean(
      wg &&
        Math.hypot(
          wg.logicalPosition.x - POND.approach.x,
          wg.logicalPosition.y - POND.approach.y,
        ) <= 46,
    );
  })();
  const pondNeedsWater = gear.rust < 100 && water < waterCap;
  const pondFishingBonus = weigangAtPond || period === "evening" || period === "night";
  const deliverableOrderList = deliverableOrders(economy, level, now);
  const activeTownEventsCount = town.events.filter((ev) => ev.expiresAt > now).length;
  const unfulfilledWishCount = dailyWishes.filter((w) => !w.fulfilled).length;
  const townBadgeCount = activeTownEventsCount + storyBadgeCount + unfulfilledWishCount;
  const activeVisitorName = activeNormalVisitor
    ? resolveVisitorDisplayProfile(activeNormalVisitor, whaleSync).name
    : undefined;
  const periodLabel = PERIOD_SHORT_LABELS[period];
  const canShowRecap = farmForeground && entranceFinished && residents.ready && !loadFailed;
  const unreadReportIds = new Set((residents.ready ? unreadRequestReports(residents.history, recapReadIds, recapSeenAt) : []).map(row => row.id));
  const recap = canShowRecap ? {
      mature: plots.flatMap((plot, index) => plot.crop && grown[index] >= CROP_META[plot.crop].growMs ? [index] : []),
      orders: deliverableOrderList,
      reports: unreadReportIds.size,
    } : null;

  return (
    <View style={st.root}>
      <StatusBar style={entranceFinished ? "dark" : "light"} />

      <FarmHeaderBar
        insetTop={insets.top}
        shopOpen={shopOpen}
        level={level}
        day={day}
        seasonName={seasonName}
        clock={clock}
        periodLabel={periodLabel}
        coins={coins}
        sfxOn={sfxOn}
        lifeOpen={lifeOpen}
        hasUnreadReports={unreadReportIds.size > 0}
        onLayoutHeight={(next) =>
          setHeaderHeight((prev) => (Math.abs(prev - next) >= 1 ? next : prev))
        }
        onBack={() => (shopOpen ? setShopOpen(false) : router.back())}
        onToggleSfx={() => {
          const next = !sfxOn;
          toggleSfx();
          if (next) {
            playSfx("farm_harvest", {
              ignoreCooldown: true,
              bypassToggle: true,
              volume: 0.65,
            });
          }
        }}
        onOpenSettings={() => {
          setLifeInitialTab("life");
          setLifeReportsOnly(false);
          setLifeOpen(true);
        }}
      />

      <View
        onLayout={({ nativeEvent }) => setMapHeight(nativeEvent.layout.height)}
        style={[
          st.mapContainer,
          { backgroundColor: night ? "#122134" : "#3E5D38" },
        ]}
      >
        {shopOpen && focused ? (
          <FarmMarket
            visible
            initialOrders={marketOrders}
            onClose={() => setShopOpen(false)}
            coins={coins}
            paused={bagOpen || lifeOpen || !focused}
            at={now}
            apiKey={apiKey}
            webSearch={farmWebSearch}
            priceDeals={gear.priceDeals}
            onDiscount={agreeVendorDiscount}
            vendorMemories={{
              smith: vendorMemories.door,
              farmer: vendorMemories.gu,
              chemist: vendorMemories.xiaoba,
              traveler: vendorMemories.yujie,
            }}
            weather={weather}
            rainbow={rainbow}
            period={period}
            onMemory={(vendor, memory) => {
              const next = {
                ...vendorMemoryRef.current,
                [VENDOR_MEMORY_KEYS[vendor]]: memory,
              };
              vendorMemoryRef.current = next;
              setVendorMemories(next);
            }}
            renderShop={renderShop}
          />
        ) : null}
        <ScrollView
          ref={farmScroll}
          style={{ display: shopOpen ? "none" : "flex" }}
          showsVerticalScrollIndicator={false}
          bounces={false}
          keyboardShouldPersistTaps="handled"
        >
          <View style={{ width: sceneW }}>
            <View style={{ width: sceneW, height: sceneH }}>
              <Image
                pointerEvents="none"
                source={FARM_SCENES[sceneVariant]}
                style={{ width: sceneW, height: sceneH }}
                resizeMode="cover"
                fadeDuration={0}
                onLoadEnd={() => setTerrainPainted(true)}
              />
            <FarmCropLayer plots={plots} scale={scale} timeShift={timeShift} active={focused && !shopOpen} onBug={openBugGame} />

            {/* 空气里缓慢浮动的光点 */}
            {decorReady
              ? MOTES.slice(0, renderQuality(quality).particles).map((m) => (
                  <Mote
                    key={m.id}
                    x={m.x}
                    y={m.y}
                    dur={m.dur}
                    delay={m.delay}
                    size={m.size}
                    scale={scale}
                    active={focused && !shopOpen && !houseOpen && !gameOpen}
                  />
                ))
              : null}

            {/* 点击地面走动 */}
            <Pressable
              style={{
                position: "absolute",
                left: 0,
                top: 0,
                right: 0,
                bottom: 0,
              }}
              onPress={(e) => {
                const point = farmPressPoint(e, scale);
                if (!point) return;
                if (point.y >= 310) goToMarket();
                else moveTo(point.x, point.y, { showRipple: true });
              }}
            />

            {/* 房子：轻点进屋，屋里点床睡觉 */}
            <Pressable
              onPress={enterHouse}
              accessibilityRole="button"
              accessibilityLabel="进屋"
              style={{
                position: "absolute",
                left: INTERACTION_ZONES.house.x * scale,
                top: INTERACTION_ZONES.house.y * scale,
                width: INTERACTION_ZONES.house.w * scale,
                height: INTERACTION_ZONES.house.h * scale,
                zIndex: HOUSE.footY,
              }}
            />

            {/* 田地点击 */}
            {plots.map((_, i) => {
              const pos = plotPos(i);
              return (
                <Pressable
                  key={i}
                  onPress={() => actOnPlot(i)}
                  hitSlop={1}
                  accessibilityRole="button"
                  accessibilityLabel={`第 ${i + 1} 块田地`}
                  style={{
                    position: "absolute",
                    left: pos.x * scale,
                    top: pos.y * scale,
                    width: pos.w * scale,
                    height: pos.h * scale,
                    zIndex: 210,
                  }}
                />
              );
            })}

            <Pressable
              accessibilityRole="button"
              accessibilityLabel="前往dark集市"
              onPress={() => goToMarket()}
              style={{
                position: "absolute",
                left: 0,
                bottom: 0,
                width: sceneW,
                height: 20 * scale,
                zIndex: 400,
              }}
            />

            {/* 水池：轻点水面也可直接打水 */}
            <Pressable
              onPress={fetchWater}
              accessibilityRole="button"
              accessibilityLabel="在水池打水"
              style={{
                position: "absolute",
                left: INTERACTION_ZONES.pond.x * scale,
                top: INTERACTION_ZONES.pond.y * scale,
                width: INTERACTION_ZONES.pond.w * scale,
                height: INTERACTION_ZONES.pond.h * scale,
                borderRadius: (POND.w * scale) / 2,
                zIndex: POND.footY + 2,
              }}
            />

            <Pressable
              accessibilityRole="button"
              accessibilityLabel="农场旧摊位"
              onPress={() =>
                showToast("商贩都在doordoor集市，从农场下方入口过去")
              }
              style={{
                position: "absolute",
                left: MARKET.x * scale,
                top: MARKET.y * scale,
                width: MARKET.w * scale,
                height: MARKET.h * scale,
                zIndex: MARKET.footY,
              }}
            />
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="鸡窝"
              onPress={() => {
                playSfx("farm_chicken", { volume: 0.72 });
                moveTo(COOP.approach.x, COOP.approach.y);
                showToast(`坤坤的小窝 · 舒适度 ${coopComfort(gear.coop)}/100`);
              }}
              style={{
                position: "absolute",
                left: COOP.x * scale,
                top: COOP.y * scale,
                width: COOP.w * scale,
                height: COOP.h * scale,
                zIndex: COOP.footY,
              }}
            />

            <FarmDecorOverlay
              placed={decorState.placed}
              scale={scale}
              night={night}
              period={period}
              onOpenFestival={() => setFestivalOpen(true)}
              onShowToast={showToast}
            />

            {/* 池塘南岸统一实景胶囊操作栏：打水与钓鱼整齐并排落位，避开池心莲花与北岸站立居民 */}
            <FarmPondActionBar
              scale={scale}
              rust={gear.rust}
              water={water}
              waterCap={waterCap}
              pondNeedsWater={pondNeedsWater}
              weigangAtPond={weigangAtPond}
              pondFishingBonus={pondFishingBonus}
              period={period}
              onFetchWater={fetchWater}
              onOpenFishing={() => {
                moveTo(POND.approach.x, POND.approach.y);
                setFishingOpen(true);
              }}
            />

            {walkRipple ? (
              <View
                key={walkRipple.id}
                pointerEvents="none"
                style={[
                  st.walkRipple,
                  {
                    left: (walkRipple.x - 6) * scale,
                    top: (walkRipple.y - 3) * scale,
                    width: 12 * scale,
                    height: 6 * scale,
                    zIndex: Math.max(2, Math.round(walkRipple.y) - 1),
                  },
                ]}
              />
            ) : null}

            {folkReady ? (
              <FarmLifeLayer
                scale={scale}
                controller={residents}
                hasApiKey={Boolean(apiKey)}
                at={now}
                panelOpen={lifeOpen}
                initialTab={lifeInitialTab}
                reportsOnly={lifeReportsOnly}
                unreadReportIds={unreadReportIds}
                onReadReport={id => setRecapReadIds(previous => previous.includes(id) ? previous : [...previous, id].slice(-100))}
                onOpenRecap={() => { setLifeOpen(false); setRecapManuallyOpen(true); }}
                onClosePanel={() => setLifeOpen(false)}
                onTalk={openTalk}
                playerPosition={playerAnchor}
                followedId={followedId}
                sleepingResidents={sleepingResidents}
                sleepDeprived={sleepDeprived}
                nightSoloEvent={nightSoloEvent}
                memories={memories}
                whaleSyncEnabled={whaleSyncEnabled}
                onToggleWhaleSync={(enabled) => {
                  setTown((prev) => ({ ...prev, whaleSyncEnabled: enabled }));
                  showToast(enabled ? "大肥鱼访客已同步课表人设与记忆" : "已关闭大肥鱼课表人设同步");
                }}
                randomEventsEnabled={randomEventsEnabled}
                onToggleRandomEvents={(enabled) => {
                  setTown((prev) => ({ ...prev, randomEventsEnabled: enabled }));
                  showToast(enabled ? "已开启农场随机奇遇事件" : "已关闭农场随机奇遇自动触发");
                }}
                emotionSpritesEnabled={emotionSpritesEnabled}
                onToggleEmotionSprites={(enabled) => {
                  setTown((prev) => ({ ...prev, emotionSpritesEnabled: enabled }));
                  showToast(enabled ? "已开启人物像素情绪动作贴图" : "已关闭人物情绪动作贴图");
                }}
                weather={weather}
                rainbow={rainbow}
                period={period}
                topBlockedHeight={recapVisible ? 132 : 0}
                onJoinGroup={(record) => openGroupChat(record.participants, record)}
                onPressBubble={(resident) => {
                  if (resident.bubble?.kind === "thought" && resident.bubble.text) {
                    const thoughtSnippet = resident.bubble.text.slice(0, 26);
                    openTalk(resident.id, resident.logicalPosition);
                    setDraft(`刚看你在想「${thoughtSnippet}」，跟我聊聊？`);
                    return;
                  }
                  if (resident.conversationSize >= 2) {
                    const active = [...residents.history]
                      .reverse()
                      .find(
                        (rec) =>
                          rec.endedAt === null &&
                          rec.participants.includes(resident.id) &&
                          rec.participants.length >= 2,
                      );
                    if (active) {
                      openGroupChat(active.participants, active);
                      return;
                    }
                    const fallbackMembers = resident.conversationPartner
                      ? [resident.id, resident.conversationPartner]
                      : [resident.id, ...RESIDENT_IDS.filter((id) => id !== resident.id).slice(0, 2)];
                    openGroupChat(fallbackMembers);
                    return;
                  }
                  openTalk(resident.id, resident.logicalPosition);
                }}
                interruptedRequests={interruptedRequests}
                onResumeRequest={resumeRequest}
                onFollowUp={(record) => {
                  if (!loaded || loadFailed) return;
                  setLifeOpen(false);
                  openTalk(record.participants[0]);
                  setFollowUp(record);
                }}
              />
            ) : null}

            {/* 常驻串门访客（含同步课表人设的大肥鱼与 door 大学室友，感知晴雨与彩虹） */}
            {folkReady && activeNormalVisitor && !visitorState.horrorActive ? (() => {
              const vEm = resolveVisitorEmotion(activeNormalVisitor, visitorState, whaleSync, now);
              const vDesc = describeFarmEmotion(vEm);
              return (
                <FarmVisitorActor
                  who={activeNormalVisitor}
                  scale={scale}
                  weather={weather}
                  rainbow={rainbow}
                  whaleSync={whaleSync}
                  emotionPose={emotionSpritesEnabled ? vDesc.pose : "neutral"}
                  emotionBadge={emotionSpritesEnabled && vDesc.pose !== "neutral" ? vDesc.badge : undefined}
                  active={
                    focused &&
                    !shopOpen &&
                    !houseOpen &&
                    !gameOpen &&
                    !bagOpen &&
                    !groupOpen &&
                    !focusOpen &&
                    !festivalOpen &&
                    !fishingOpen &&
                    !storiesOpen &&
                    !decorOpen &&
                    !randomEventModalOpen &&
                    visitorSpeaker === null
                  }
                  onPress={openVisitorTalk}
                />
              );
            })() : null}

            {/* 夜晚恐怖彩蛋：黑暗邪恶形态徐睡阴扛电脑打瓦闹觉 */}
            {folkReady && visitorState.horrorActive ? (
              <FarmVisitorActor
                who="dark_xushuiyin"
                scale={scale}
                weather={weather}
                rainbow={rainbow}
                active={
                  focused &&
                  !shopOpen &&
                  !houseOpen &&
                  !gameOpen &&
                  !bagOpen &&
                  !groupOpen &&
                  !focusOpen &&
                  !festivalOpen &&
                  !fishingOpen &&
                  !storiesOpen &&
                  !decorOpen &&
                  visitorSpeaker === null
                }
                onPress={openVisitorTalk}
              />
            ) : null}

            {/* 玩家 */}
            <Animated.View
              pointerEvents="none"
              style={[st.playerRoot, playerStyle]}
            >
              <NameTag
                label="你"
                accent="#9E7338"
                scale={scale}
                hit
                center={7}
              />
              <View
                style={[
                  st.playerShadow,
                  {
                    left: 2 * scale,
                    top: 19 * scale,
                    width: 10 * scale,
                    height: 2 * scale,
                  },
                ]}
              />
              <Animated.View style={playerFacingStyle}>
                <FarmPersonSprite
                  who="hero"
                  activity={playerMoving ? "walk" : "idle"}
                  emotionPose={emotionSpritesEnabled ? heroEmotionPose : "neutral"}
                  size={20 * scale}
                  active={focused && !shopOpen}
                  walkSpeed={1000 / 18}
                />
              </Animated.View>
            </Animated.View>

            {/* 农场随机奇遇顶部悬浮入口条 */}
            {activeRandomEvent && !randomEventModalOpen ? (
              <FarmRandomEventBanner
                event={activeRandomEvent}
                onOpen={() => setRandomEventModalOpen(true)}
              />
            ) : null}
            </View>

            {/* 无缝延展南侧草坡与出院小路，使农场贴图自然延伸铺满至屏幕底部并衬托悬浮 HUD */}
            <FarmBottomSkirt
              sceneW={sceneW}
              bottomSkirtH={bottomSkirtH}
              skirtTileH={skirtTileH}
              skirtImageH={skirtImageH}
              skirtTileCount={skirtTileCount}
              night={night}
              sceneVariant={sceneVariant}
              onGoToMarket={() => goToMarket()}
            />

            <FarmRain
              width={sceneW}
              height={sceneH + bottomSkirtH}
              night={night}
              active={
                focused &&
                !shopOpen &&
                !speaker &&
                !groupOpen &&
                !townOpen &&
                !bagOpen &&
                !lifeOpen &&
                !houseOpen &&
                !gameOpen &&
                weather === "rain"
              }
            />
          </View>
        </ScrollView>
        {recap ? <FarmReturnSummary
          items={recap}
          hidden={shopOpen || houseOpen || bagOpen || gameOpen || lifeOpen || groupOpen || townOpen || speaker !== null}
          manuallyOpen={recapManuallyOpen}
          onVisibleChange={setRecapVisible}
          onClose={() => setRecapManuallyOpen(false)}
          onCrops={index => {
            const plot = plotPos(index);
            const visibleMapH = Math.max(180, mapHeight - hudOverlayH);
            farmScroll.current?.scrollTo({ y: Math.max(0, (plot.y + plot.h / 2) * scale - visibleMapH / 2), animated: true });
          }}
          onOrders={() => goToMarket(true)}
          onReports={() => { setLifeInitialTab("logs"); setLifeReportsOnly(true); setLifeOpen(true); }}
        /> : null}

        <FarmMapOverlays
          toast={toast}
          sceneW={sceneW}
          hudOverlayH={hudOverlayH}
          showHorrorBanner={
            Boolean(visitorState.horrorActive) &&
            !shopOpen &&
            !houseOpen &&
            !bagOpen &&
            !gameOpen &&
            !lifeOpen &&
            !groupOpen &&
            !townOpen &&
            visitorSpeaker === null &&
            speaker === null
          }
          onOpenHorror={() => openVisitorTalk("dark_xushuiyin")}
          followedId={followedId}
          showFollowBar={
            !shopOpen &&
            !houseOpen &&
            !bagOpen &&
            !gameOpen &&
            !lifeOpen &&
            !groupOpen &&
            !townOpen &&
            speaker === null
          }
          period={period}
          weather={weather}
          rainbow={rainbow}
          activeEvents={town.events.filter((ev) => ev.expiresAt > now)}
          onTalkFollowed={(who) => {
            const model = residents.getResidents().find((r) => r.id === who);
            openTalk(who, model?.logicalPosition);
          }}
          onStopFollow={() => setFollowedId(null)}
        />
      </View>

      <FarmBottomDock
        insetsBottom={insets.bottom}
        shopOpen={shopOpen}
        weather={weather}
        rainbow={rainbow}
        period={period}
        ripe={ripe}
        dryPlots={dryPlots}
        growing={growing}
        water={water}
        waterCap={waterCap}
        canRust={gear.rust}
        selectedSeed={selected}
        selectedSeedCount={selected ? seeds[selected] : 0}
        fertilizing={fertilizing}
        compost={compost}
        supply={supply}
        supplyCount={supply ? gear.extras[supply] : 0}
        bagTier={gear.bag}
        deliverableOrderCount={deliverableOrderList.length}
        townBadgeCount={townBadgeCount}
        storyBadgeCount={storyBadgeCount}
        horrorActive={Boolean(visitorState.horrorActive)}
        activeRandomEventTitle={activeRandomEvent?.title}
        activeVisitorName={activeVisitorName}
        saveBanner={
          loadFailed
            ? "存档读取失败，请退出农场重进"
            : saveError
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
        onMarketPress={() => {
          if (shopOpen) setShopOpen(false);
          else goToMarket();
        }}
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
        onBulkHarvest={bulkHarvest}
        onBulkWater={bulkWater}
        onFetchWater={fetchWater}
        onOpenHorror={() => openVisitorTalk("dark_xushuiyin")}
        onOpenRandomEvent={() => setRandomEventModalOpen(true)}
        onOpenVisitor={() => {
          if (activeNormalVisitor) openVisitorTalk(activeNormalVisitor);
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
      <FarmBag
        visible={bagOpen}
        close={() => setBagOpen(false)}
        title={BAG_TIERS[gear.bag] + "背包"}
        detail={bagDetail}
        bagTier={gear.bag}
        canTier={canUpgrade}
        capacity={bagCap}
        stacks={stacks}
        selected={selected ? "seed:" + selected + ":0" : null}
        onPick={pickStack}
        actions={
          <View style={st.bagActionsRow}>
            <FarmButton label="收取成熟作物" onPress={bulkHarvest} />
            {inspectCan ? (
              <FarmButton label="给田地浇水" onPress={bulkWater} />
            ) : null}
          </View>
        }
      />

      <FarmPersonalChatSheet
        speaker={speaker}
        speakerName={speakerName}
        speakerMood={speakerMood}
        chatMemory={chatMemory}
        weather={weather}
        rainbow={rainbow}
        period={period}
        now={now}
        chatOffline={chatOffline}
        giftBarOpen={giftBarOpen}
        memoryBookOpen={memoryBookOpen}
        dailyWishes={dailyWishes}
        chatBusy={chatBusy}
        canContinueChat={canContinueChat}
        chatMaxH={chatMaxH}
        economy={economy}
        coins={coins}
        followUp={followUp}
        messages={threads[speaker ?? "gu"]}
        draft={draft}
        chatHint={chatHint}
        chatInputRef={chatInputRef}
        onClose={closePersonalChat}
        onToggleGiftBar={() => {
          setMemoryBookOpen(false);
          setGiftBarOpen((prev) => !prev);
        }}
        onToggleMemoryBook={() => {
          setGiftBarOpen(false);
          setMemoryBookOpen((prev) => !prev);
        }}
        onOpenGroupWithSpeaker={(whoNow) => {
          const companions = RESIDENT_IDS.filter((id) => id !== whoNow).slice(0, 2);
          openGroupChat([whoNow, ...companions]);
        }}
        onInsertDiscussionPrompt={() => {
          setDraft((previous) =>
            previous.startsWith(DISCUSSION_PROMPT)
              ? previous
              : DISCUSSION_PROMPT + previous,
          );
        }}
        onSendTopic={(topic) => {
          void sendChat(topic);
        }}
        onDeleteFact={(targetWho, key) => {
          setMemories((prev) => ({
            ...prev,
            [targetWho]: removePlayerFact(prev[targetWho], key),
          }));
        }}
        onDeleteEpisode={(targetWho, id) => {
          setMemories((prev) => ({
            ...prev,
            [targetWho]: removeMemoryEpisode(prev[targetWho], id),
          }));
        }}
        onGiveCrop={handleGiveCrop}
        onGiveDish={handleGiveDish}
        onFulfillWish={handleFulfillWish}
        onChangeDraft={setDraft}
        onSendDraft={() => {
          void sendChat(draft, followUp ?? undefined);
        }}
      />

      <FarmGroupChatSheet
        visible={groupOpen}
        onClose={closeGroupChat}
        members={groupMembers}
        onChangeMembers={setGroupMembers}
        messages={groupMessages}
        busy={groupBusy}
        value={groupDraft}
        onChange={setGroupDraft}
        onSend={() => {
          void executeGroupTurn(false);
        }}
        onBanter={() => {
          void executeGroupTurn(true);
        }}
        onClear={() => {
          clearGroupRevealTimers();
          setGroupMessages([]);
          setGroupHint("");
        }}
        online={groupOnline}
        hint={groupHint || undefined}
        typingLabel={groupTypingLabel || undefined}
        maxHeight={chatMaxH}
      />

      <FarmTownBoard
        visible={townOpen}
        onClose={() => {
          gazetteRequest.current?.abort();
          setGazettePolishing(false);
          setTownOpen(false);
        }}
        town={town}
        gazette={
          town.gazette?.day === day
            ? town.gazette
            : compileFarmGazette({
                day,
                seasonIndex: season,
                weather,
                rainbow,
                history: residents.history,
                town,
                memories,
                studyNote: studyContext.gazetteNote || undefined,
                at: now,
              })
        }
        needs={farmNeeds}
        memories={memories}
        economy={economy}
        wishes={dailyWishes}
        studyContext={studyContext}
        followedId={followedId}
        at={now}
        hasApiKey={Boolean(apiKey)}
        polishing={gazettePolishing}
        polishError={gazetteError || undefined}
        onRefreshGazette={() => {
          setGazetteError("");
          const fresh = compileFarmGazette({
            day,
            seasonIndex: season,
            weather,
            rainbow,
            history: residents.history,
            town,
            memories,
            studyNote: studyContext.gazetteNote || undefined,
            at: eventTime(),
          });
          setTown((prev) => ({ ...prev, gazette: fresh }));
        }}
        onPolishGazette={() => {
          if (!apiKey || gazettePolishing) return;
          gazetteRequest.current?.abort();
          const controller = new AbortController();
          gazetteRequest.current = controller;
          setGazettePolishing(true);
          setGazetteError("");
          const draft = compileFarmGazette({
            day,
            seasonIndex: season,
            weather,
            rainbow,
            history: residents.history,
            town,
            memories,
            studyNote: studyContext.gazetteNote || undefined,
            at: eventTime(),
          });
          void polishGazetteWithAI(draft, apiKey, controller.signal)
            .then((polished) => {
              if (!controller.signal.aborted) {
                setTown((prev) => ({ ...prev, gazette: polished }));
              }
            })
            .catch((error) => {
              if (!controller.signal.aborted) {
                setGazetteError(
                  error instanceof FarmChatError ? error.message : "日报润色失败，已保留实时简报",
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
        onDropEvent={(title, detail, mode, hotspot) => {
          const at = eventTime();
          const starter = RESIDENT_IDS[Math.floor(Math.random() * RESIDENT_IDS.length)];
          const knownBy = mode === "broadcast" ? [...RESIDENT_IDS] : [starter];
          const nextEvent = {
            id: `event-${at}`,
            title,
            detail,
            kind: "director" as const,
            knownBy,
            hotspot,
            createdAt: at,
            expiresAt: at + 24 * 3600_000,
          };
          setTown((prev) => ({
            ...prev,
            events: [...prev.events.filter((ev) => ev.expiresAt > at), nextEvent].slice(-12),
          }));
          showToast(
            mode === "broadcast"
              ? `全镇广播：「${title}」已传遍全家！`
              : `已悄悄告诉${RESIDENTS[starter].name}，等他们碰面慢慢传开…`,
          );
        }}
        onDeleteEvent={(id) => {
          setTown((prev) => ({
            ...prev,
            events: prev.events.filter((ev) => ev.id !== id),
          }));
        }}
        onSetDuty={(who, duty) => {
          setTown((prev) => {
            const nextDuties = { ...prev.duties };
            if (duty) nextDuties[who] = duty;
            else delete nextDuties[who];
            return { ...prev, duties: nextDuties };
          });
        }}
        onToggleStudyLink={(enabled) => {
          setTown((prev) => ({ ...prev, studyLinkEnabled: enabled }));
          showToast(enabled ? "已开启课表节奏温柔联动" : "已关闭课表节奏联动");
        }}
        onFulfillWish={handleFulfillWish}
        onFollowResident={(who) => {
          setFollowedId((prev) => {
            const next = prev === who ? null : who;
            showToast(
              next ? `开始跟拍 ${RESIDENTS[next].name}，可随时点击下方退出` : "已退出跟拍视角",
            );
            return next;
          });
          setTownOpen(false);
        }}
        onTalkResident={(who) => {
          setTownOpen(false);
          const model = residents.getResidents().find((r) => r.id === who);
          openTalk(who, model?.logicalPosition);
        }}
        onOpenFocus={() => {
          setTownOpen(false);
          setFocusOpen(true);
        }}
        onOpenFestival={() => {
          setTownOpen(false);
          setFestivalOpen(true);
        }}
        onOpenFishing={() => {
          setTownOpen(false);
          setFishingOpen(true);
        }}
        onOpenStories={() => {
          setTownOpen(false);
          setStoriesOpen(true);
        }}
        onOpenDecor={() => {
          setTownOpen(false);
          setDecorOpen(true);
        }}
        storyBadgeCount={storyBadgeCount}
        visitorState={visitorState}
        activeVisitor={activeNormalVisitor}
        activeVisit={activeVisitorVisit}
        whaleSync={whaleSync}
        activeRandomEvent={activeRandomEvent}
        onTriggerRandomEvent={() => handleTriggerRandomEvent(true)}
        onOpenRandomEvent={() => {
          setTownOpen(false);
          setRandomEventModalOpen(true);
        }}
        sleepingResidents={sleepingResidents}
        nightSoloEvent={nightSoloEvent}
        onInviteVisitor={(who) => {
          const at = eventTime();
          if (activeVisitorVisit) manualDismissedSlotRef.current = activeVisitorVisit.slotKey;
          const displayProfile = resolveVisitorDisplayProfile(who, whaleSync);
          setTown((prev) => ({
            ...prev,
            visitors: inviteVisitorToFarm(prev.visitors ?? emptyVisitorState(), who, at),
          }));
          setTownOpen(false);
          showToast(
            who === "dafeiyu"
              ? `已邀请「${displayProfile.name}」从课表来农场串门 45 分钟啦！`
              : `已邀请 door 的室友「${displayProfile.name}」来农场串门 45 分钟啦！`,
          );
        }}
        onTalkVisitor={(who) => {
          setTownOpen(false);
          openVisitorTalk(who);
        }}
        onDismissVisitor={() => {
          const res = dismissActiveVisitor(visitorState, now);
          if (!res.departed) return;
          if (activeVisitorVisit) manualDismissedSlotRef.current = activeVisitorVisit.slotKey;
          setTown((prev) => ({
            ...prev,
            visitors: dismissActiveVisitor(prev.visitors ?? emptyVisitorState(), now).nextState,
          }));
          if (visitorSpeaker === res.departed) closeVisitorChat();
          setTownOpen(false);
          showToast(visitorFarewellLine(res.departed, whaleSync));
        }}
        onToggleHorror={(enabled) => {
          setTown((prev) => ({
            ...prev,
            visitors: {
              ...(prev.visitors ?? emptyVisitorState()),
              horrorEnabled: enabled,
              ...(enabled ? {} : { horrorActive: false }),
            },
          }));
          showToast(enabled ? "已开启深夜「恐怖徐睡阴」恐怖彩蛋" : "已关闭深夜恐怖徐睡阴彩蛋");
        }}
        onSummonHorror={() => {
          if (visitorState.horrorActive) {
            setTownOpen(false);
            openVisitorTalk("dark_xushuiyin");
          } else {
            summonHorrorVisitor();
          }
        }}
        onOpenHouseWake={() => {
          setTownOpen(false);
          setHouseOpen(true);
        }}
        maxHeight={chatMaxH}
      />

      {/* ---------- 大学室友访客 & 恐怖徐睡阴互动面板 ---------- */}
      <FarmVisitorSheet
        visible={visitorSpeaker !== null}
        who={visitorSpeaker}
        record={
          visitorSpeaker && visitorSpeaker !== "dark_xushuiyin"
            ? visitorState.records[visitorSpeaker]
            : undefined
        }
        messages={visitorSpeaker ? visitorThreads[visitorSpeaker] : []}
        busy={visitorBusy}
        online={visitorOnline}
        hint={visitorHint || undefined}
        draft={visitorDraft}
        onChangeDraft={setVisitorDraft}
        onSend={(override) => {
          void sendVisitorChat(override);
        }}
        economy={economy}
        coins={coins}
        onGiveCrop={handleVisitorGiveCrop}
        onGiveDish={handleVisitorGiveDish}
        onBanishHorror={handleBanishHorror}
        onDismissVisitor={
          activeVisitorVisit && visitorSpeaker === activeVisitorVisit.who
            ? () => {
                const res = dismissActiveVisitor(visitorState, now);
                if (!res.departed) {
                  closeVisitorChat();
                  return;
                }
                manualDismissedSlotRef.current = activeVisitorVisit.slotKey;
                setTown((prev) => ({
                  ...prev,
                  visitors: dismissActiveVisitor(prev.visitors ?? emptyVisitorState(), now).nextState,
                }));
                closeVisitorChat();
                showToast(visitorFarewellLine(res.departed, whaleSync));
              }
            : undefined
        }
        stayHint={
          activeVisitorVisit && visitorSpeaker === activeVisitorVisit.who
            ? formatVisitorStayHint(activeVisitorVisit)
            : undefined
        }
        onClose={closeVisitorChat}
        maxHeight={chatMaxH}
        weather={weather}
        rainbow={rainbow}
        whaleSync={whaleSync}
        emotion={
          visitorSpeaker
            ? resolveVisitorEmotion(visitorSpeaker, visitorState, whaleSync, now)
            : undefined
        }
      />

      {/* ---------- 模块 A：农场自习伴读钟 ---------- */}
      <FarmFocusModal
        visible={focusOpen}
        onClose={() => setFocusOpen(false)}
        stats={focusStats}
        onComplete={handleCompleteFocus}
      />

      {/* ---------- 模块 B：小镇动态节庆与篝火茶话会 ---------- */}
      <FarmFestivalSheet
        visible={festivalOpen}
        onClose={() => setFestivalOpen(false)}
        festival={activeFestival}
        economy={economy}
        coins={coins}
        postcards={postcards}
        onHost={handleHostFestival}
        maxHeight={chatMaxH}
      />

      {/* ---------- 模块 C：池塘真·钓鱼小游戏与漂流瓶图鉴 ---------- */}
      <FarmFishingModal
        visible={fishingOpen}
        onClose={() => setFishingOpen(false)}
        period={period}
        weigangNearby={weigangAtPond}
        book={fishingBook}
        onCatch={handleFishingCatch}
        onSellFish={handleSellFish}
        onCookFishSoup={handleCookFishSoup}
      />

      {/* ---------- 模块 D：家庭个人支线剧情与纪念相册 ---------- */}
      <FarmStoryAlbumSheet
        visible={storiesOpen}
        onClose={() => setStoriesOpen(false)}
        progress={storyProgress}
        memories={memories}
        onClaimChapter={handleClaimStoryChapter}
        maxHeight={chatMaxH}
      />

      {/* ---------- 模块 E：庭院轻装扮工坊 ---------- */}
      <FarmDecorSheet
        visible={decorOpen}
        onClose={() => setDecorOpen(false)}
        decor={decorState}
        coins={coins}
        onBuy={handleBuyDecor}
        onTogglePlace={handleToggleDecor}
        maxHeight={chatMaxH}
      />

      {/* ---------- 多房间像素小屋：主卧双人床 & 三子房间睡眠与盖被互动 ---------- */}
      <HouseInterior
        visible={houseOpen}
        night={night}
        day={day}
        clock={clock}
        hour={new Date(now).getHours()}
        sleepingResidents={sleepingResidents}
        tuckedInIds={tuckedIdsToday}
        sleepDeprived={sleepDeprived}
        onClose={() => setHouseOpen(false)}
        onSleep={doSleep}
        onWakeResident={handleWakeResident}
        onTuckInResident={handleTuckInResident}
        onOpenFocus={() => {
          setHouseOpen(false);
          setFocusOpen(true);
        }}
      />

      {/* ---------- 农场随机天气奇遇互动弹窗 ---------- */}
      <FarmRandomEventModal
        visible={randomEventModalOpen && activeRandomEvent !== null}
        event={activeRandomEvent}
        onSelect={handleResolveRandomEvent}
        onDismiss={() => setRandomEventModalOpen(false)}
      />

      {/* ---------- 抓虫小游戏 ---------- */}
      <BugGame
        key={gameToken}
        visible={gameOpen}
        onClose={() => setGameOpen(false)}
        onFinish={finishBugGame}
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
