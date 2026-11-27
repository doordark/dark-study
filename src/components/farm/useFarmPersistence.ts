import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type Dispatch,
  type RefObject,
  type SetStateAction,
} from "react";
import { AppState } from "react-native";

import {
  MINUTE,
  PLOT_COUNT,
  SAVE_KEY,
  SEASONS,
  VENDOR_MEMORY_KEYS,
  WAKE_HOUR,
  WET_MS,
  chatId,
  emptyPlot,
  eventTime,
  midnightOf,
  parseFarmSaveRaw,
  type FarmChatMsg,
  type SaveData,
  type Speaker,
} from "@/components/farm/farmScreenConstants";
import { CROP_ART, type CropKind } from "@/components/farm/sprites";
import { POND, plotApproach } from "@/constants/farmMap";
import { playSfx, risingRate } from "@/services/soundEffects";
import { useActiveSchedule, useStore } from "@/store/useStore";
import { useStudyProgress } from "@/store/useStudyProgress";
import { useWhaleMemory } from "@/store/useWhaleMemory";
import { useWhalePersona } from "@/store/useWhalePersona";
import { useWhalePet } from "@/store/useWhalePet";
import { deferredJSONWriter, getStoredText } from "@/utils/coordinatedStorage";
import type { NpcAction } from "@/utils/farmActions";
import { COOP_SUPPLIES, coopComfort, type CoopSupply } from "@/utils/farmCoop";
import {
  buildDecorAnnouncementEvent,
  emptyDecorState,
  getDecorMeta,
  type DecorId,
} from "@/utils/farmDecor";
import {
  CROP_KINDS,
  CROP_META,
  completeOrder,
  consume,
  craft,
  cropRecord,
  deliverableOrders,
  harvestResult,
  irrigationCost,
  restoreEconomy,
  stockCount,
  stockValue,
  wetDuration,
  type Recipe,
} from "@/utils/farmEconomy";
import {
  farmDeltaToWhaleEmotionDelta,
  sleepTransitionEmotionDelta,
  weatherEmotionPulse,
} from "@/utils/farmEmotion";
import { detectAvailableFestival, hostCampfireGathering } from "@/utils/farmFestivals";
import {
  FISH_META,
  applyFishingCatch,
  cookFishSoupFromBook,
  emptyFishingBook,
  sellFishFromBook,
  type CatchOutcome,
  type FishKind,
} from "@/utils/farmFishing";
import { emptyFocusStats, settleFocusSession } from "@/utils/farmFocus";
import type { FarmGroupMessage } from "@/utils/farmGroupChat";
import { RESIDENTS, RESIDENT_IDS, type ResidentId } from "@/utils/farmLife";
import {
  BAG_SLOTS,
  CAN_TIERS,
  QUALITY,
  UPGRADE_PRICES,
  bagStacks,
  canCapacity,
  marketOffers,
  marketWindow,
  negotiateVendorDeal,
  offerLevel,
  offerRemaining,
  pestAt,
  qualityOf,
  rareOffer,
  restoreGear,
  vendorAvailable,
  vendorCanTrade,
  vendorQuotedPrice,
  type BagStack,
  type Offer,
  type Vendor,
} from "@/utils/farmMarket";
import { restoreFarmMemories, shiftResidentMemoryEmotion } from "@/utils/farmMemory";
import { appendEpisode, recordVerifiedGiftMemory } from "@/utils/farmPersonaMemory";
import type { PlotState } from "@/utils/farmPlot";
import {
  compostReward,
  emptyJournal,
  farmLevel,
  fertilizedGrowth,
  realDate,
  recordActivity,
  type FarmActivity,
} from "@/utils/farmProgress";
import {
  emptyRandomEventState,
  getRandomEventById,
  pickFarmRandomEvent,
  type FarmRandomEventChoice,
} from "@/utils/farmRandomEvents";
import {
  TUCK_IN_REACTIONS,
  WAKE_UP_LINES,
  resolvePlayerSleep,
} from "@/utils/farmSleep";
import {
  evaluateResidentGift,
  generateDailyWishes,
  giftLabel,
  type GiftItemId,
  type ResidentWish,
} from "@/utils/farmSocial";
import {
  claimStoryChapter,
  emptyStoryProgress,
  nextUnlockableChapter,
} from "@/utils/farmStories";
import {
  applyPendingRewardsToFarmCoins,
  summarizeStudyDay,
} from "@/utils/farmStudyLink";
import { farmTime } from "@/utils/farmTime";
import {
  RESIDENT_DUTIES,
  emptyTownState,
  type FarmNeedsSnapshot,
  type FarmTownState,
  type ResidentDuty,
} from "@/utils/farmTown";
import {
  emptyVisitorState,
  evaluateVisitorGift,
  isFarmSleepDeprived,
  recordHorrorAftermathToFamily,
  resolveHorrorBanish,
  resolveVisitorDisplayProfile,
  resolveVisitorVisit,
  type HorrorBanishMethod,
  type NormalVisitorId,
  type VisitorId,
  type WhaleVisitorSyncContext,
} from "@/utils/farmVisitors";
import {
  farmPlotGrowth as plotGrowth,
  waterFarmPlots,
} from "@/utils/farmWatering";
import {
  buildStarDewTownEvent,
  consumeStarDewBlessing,
} from "@/utils/nightSkyData";
import {
  getAttendanceRiskCourses,
  getTodayFocusMinutes,
} from "@/utils/studyProgress";

export interface UseFarmPersistenceOptions {
  focused: boolean;
  now: number;
  shopOpen: boolean;
  showToast: (text: string, durationMs?: number) => void;
  moveTo: (
    x: number,
    y: number,
    opts?: { showRipple?: boolean; faceTowardX?: number },
  ) => number;
  onHeroHappyPulse: () => void;
  onCloseBag: () => void;
  onCloseHouse: () => void;
  onCloseTown: () => void;
  onOpenRandomEventModal: () => void;
  onCloseRandomEventModal: () => void;
  selected: CropKind | null;
  setSelected: Dispatch<SetStateAction<CropKind | null>>;
  supply: "repellent" | "growth" | null;
  setSupply: Dispatch<SetStateAction<"repellent" | "growth" | null>>;
  fertilizing: boolean;
  setFertilizing: Dispatch<SetStateAction<boolean>>;
  setBagDetail: Dispatch<SetStateAction<string>>;
  setInspectCan: Dispatch<SetStateAction<boolean>>;
  setThreads: Dispatch<SetStateAction<Record<Speaker, FarmChatMsg[]>>>;
  setVisitorThreads: Dispatch<SetStateAction<Record<VisitorId, FarmChatMsg[]>>>;
  setWokenNightState: Dispatch<
    SetStateAction<{ day: number; ids: ResidentId[] }>
  >;
  pestPlotRef: RefObject<number | null>;
  gameToken: number;
  settledGameRef: RefObject<number>;
}

export function useFarmPersistence({
  focused,
  now,
  shopOpen,
  showToast,
  moveTo,
  onHeroHappyPulse,
  onCloseBag,
  onCloseHouse,
  onCloseTown,
  onOpenRandomEventModal,
  onCloseRandomEventModal,
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
  pestPlotRef,
  gameToken,
  settledGameRef,
}: UseFarmPersistenceOptions) {
  const [loaded, setLoaded] = useState(false);
  const [loadFailed, setLoadFailed] = useState(false);
  const [saveError, setSaveError] = useState(false);

  const [timeShift, setTimeShift] = useState(0);
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
  const [plots, setPlots] = useState<PlotState[]>(() =>
    Array.from({ length: PLOT_COUNT }, () => emptyPlot(eventTime())),
  );
  const [harvested, setHarvested] = useState(0);
  const [gear, setGear] = useState(restoreGear);
  const [vendorMemories, setVendorMemories] = useState(restoreFarmMemories);
  const [water, setWater] = useState(0);
  const [canUpgrade, setCanUpgrade] = useState(0);
  const [compost, setCompost] = useState(2);
  const [journal, setJournal] = useState(() => emptyJournal(eventTime()));
  const [recapSeenAt, setRecapSeenAt] = useState(0);
  const [recapReadIds, setRecapReadIds] = useState<string[]>([]);
  const [memories, setMemories] = useState(restoreFarmMemories);
  const [groupMembers, setGroupMembers] = useState<ResidentId[]>([
    "door",
    "gu",
    "xiaoba",
    "yujie",
  ]);
  const [groupMessages, setGroupMessages] = useState<FarmGroupMessage[]>([]);
  const [town, setTown] = useState<FarmTownState>(emptyTownState);

  const [saveWriter] = useState(() => deferredJSONWriter<SaveData>(SAVE_KEY));
  useEffect(() => {
    const unsubscribe = saveWriter.subscribe((error) =>
      setSaveError(Boolean(error)),
    );
    const sub = AppState.addEventListener("change", (state) => {
      if (state !== "active") void saveWriter.flush().catch(() => {});
    });
    return () => {
      unsubscribe();
      sub.remove();
      void saveWriter.flush().catch(() => {});
    };
  }, [saveWriter]);

  const priceDealsRef = useRef(gear.priceDeals);
  useEffect(() => {
    priceDealsRef.current = gear.priceDeals;
  }, [gear.priceDeals]);

  const vendorMemoryRef = useRef(vendorMemories);
  useEffect(() => {
    vendorMemoryRef.current = vendorMemories;
  }, [vendorMemories]);

  const updateVendorMemory = (
    vendor: Vendor,
    memory: (typeof vendorMemories)[ResidentId],
  ) => {
    const next = {
      ...vendorMemoryRef.current,
      [VENDOR_MEMORY_KEYS[vendor]]: memory,
    };
    vendorMemoryRef.current = next;
    setVendorMemories(next);
  };

  const waterCap = canCapacity(canUpgrade);
  const stacks = useMemo(
    () => bagStacks(seeds, economy.inventory, gear.extras, compost),
    [seeds, economy.inventory, gear.extras, compost],
  );
  const bagCap = BAG_SLOTS[gear.bag];
  const level = farmLevel(harvested);

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

  /* ---------------- 跨模块状态同步（课表学习进度 + 大肥鱼人设记忆） ---------------- */
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

  const activeSchedule = useActiveSchedule();
  const studyGrades = useStore((s) => s.grades);
  const studyFocusLogs = useStudyProgress((s) => s.focusLogs);
  const studyAttendanceByCourse = useStudyProgress((s) => s.attendanceByCourse);
  const studyCustomAbsenceLimits = useStudyProgress(
    (s) => s.customAbsenceLimits,
  );
  const pendingStudyRewardCount = useStudyProgress(
    (s) => s.pendingFarmRewards.length,
  );

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

  const grown = plots.map((plot) => plotGrowth(plot, vNow));
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
      logs: [...whaleMemoryMsgs, ...whaleMessages, ...whalePetMessages].slice(
        -36,
      ),
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
  const sleepDeprived = isFarmSleepDeprived(visitorState, day);
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
  const deliverableOrderList = deliverableOrders(economy, level, now);

  /* ---------------- 存档读取 / 合并写入 ---------------- */
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
        if (parsed.recapSeenAt !== undefined)
          setRecapSeenAt(parsed.recapSeenAt);
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

  /* ---------------- 学习闭环奖励自动承接 ---------------- */
  useEffect(() => {
    if (!loaded || loadFailed || !focused || pendingStudyRewardCount <= 0)
      return;
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
        settlement.summary || `收到学习奖励：+${settlement.totalCoins} dark币`,
        3200,
      );
    }, 120);
    return () => clearTimeout(timer);
  }, [focused, loadFailed, loaded, pendingStudyRewardCount, showToast]);

  /* ---------------- 夜空星露祝福消费 ---------------- */
  const starDewCheckedRef = useRef(false);
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
            : `✦ 「${res.blessing.constellationName}」的星光正轻照doordoor农场`,
        );
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [loaded, loadFailed, showToast]);

  /* ---------------- 天气/时段切换推动全家情绪 ---------------- */
  const lastWeatherPulseKey = useRef<string>("");
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

  /* ---------------- 核心田地、集市、居民协办与扩展事务 ---------------- */
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
    playSfx("farm_harvest", {
      rate: risingRate(Math.min(indices.length - 1, 5), 0.04, 0.96),
      volume: 0.74,
    });
    showToast(`收获 ${count} 份已放进背包 · 可去集市出售`);
  };

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
      settledResidentWork.current.delete(
        settledResidentWork.current.values().next().value!,
      );
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
        .map((plot, idx) =>
          plot.crop && plotGrowth(plot, vAt) >= CROP_META[plot.crop].growMs
            ? idx
            : -1,
        )
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
          ? "在池边守漂钓上一条肥鱼，换了 10 dark币放进农场钱匣。"
          : "在池塘边碰运气钓上一条小鱼，换了 10 dark币！";
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
    showToast(`出售${CROP_ART[kind].label} · +${gain} dark币`);
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
        " dark币" +
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
      `${recipe.label}已售出 · 扣费后 +${recipe.sell - recipe.fee} dark币`,
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
      setGear((prevGear) => ({
        ...prevGear,
        rust: Math.min(100, prevGear.rust + Math.max(1, 6 - canUpgrade)),
      }));
    showToast(`浇水了，接下来长得很快 · 水壶还剩 ${result.water} 次`);
  };

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
    onCloseHouse();
    showToast(outcome.summary);
  };

  const finishBugGame = (score: number, jumpMs: number) => {
    if (settledGameRef.current === gameToken) return;
    settledGameRef.current = gameToken;
    if (score <= 0) {
      showToast("虫子还在，再试一次吧");
      return;
    }
    const index = pestPlotRef.current;
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
      onCloseBag();
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
      onCloseBag();
      showToast("请选择要施肥的作物");
    } else if (stack.extra === "growth" || stack.extra === "repellent") {
      setSupply(stack.extra);
      setFertilizing(false);
      onCloseBag();
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
    onCloseBag();
    if (ready.length) collectHarvest(ready, t);
    else showToast("没有可直接收获的作物");
  };

  const bulkWater = () => {
    if (!beginAction()) return;
    onCloseBag();
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

  function applyGiftToResident(who: ResidentId, item: GiftItemId) {
    const nowAt = eventTime();
    const dateKey = realDate(nowAt);
    const giftedToday =
      town.giftCounts?.date === dateKey
        ? (town.giftCounts.counts[who] ?? 0)
        : 0;
    const outcome = evaluateResidentGift(
      who,
      item,
      memories[who],
      giftedToday,
      nowAt,
    );
    setMemories((prev) => ({ ...prev, [who]: outcome.nextMemory }));
    const itemText = giftLabel(item);
    setThreads((prev) => ({
      ...prev,
      [who]: [
        ...prev[who],
        {
          id: `gift-${chatId()}`,
          role: "user" as const,
          text: `（送给你一份${itemText}）`,
          gift: {
            kind: "gift" as const,
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
        {
          id: `${chatId()}-gift`,
          role: "assistant" as const,
          text: outcome.reply,
        },
      ].slice(-40),
    }));
    setTown((prev) => {
      const baseCounts =
        prev.giftCounts?.date === dateKey ? prev.giftCounts.counts : {};
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
      if (reward.kind === "coins") setCoins((c) => c + reward.amount);
      else if (reward.kind === "compost")
        setCompost((c) => Math.min(5, c + reward.amount));
      else if (reward.kind === "seed" && reward.crop) {
        const rewardCrop = reward.crop;
        setSeeds((s) => ({
          ...s,
          [rewardCrop]: s[rewardCrop] + reward.amount,
        }));
      }
    }
    const deltaNote =
      outcome.affinityDelta > 0
        ? `好感 +${outcome.affinityDelta}`
        : "今日送礼好感已达上限";
    const rewardNote = outcome.reward ? ` · 回礼：${outcome.reward.label}` : "";
    playSfx("farm_gift", { volume: 0.74 });
    showToast(
      `送给${RESIDENTS[who].name}「${itemText}」· ${deltaNote}${rewardNote}`,
    );
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
      showToast(`材料或dark币不足，暂无法现做${recipe.label}`);
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
        : `哇，真的送来 ${wish.quantity} 份${giftLabel(wish.crop)}啦！正好派上大用场，这 ${wish.rewardCoins} dark币和有机肥你一定要收下！`;
    setThreads((prev) => ({
      ...prev,
      [wish.resident]: [
        ...prev[wish.resident],
        {
          id: `wish-${chatId()}`,
          role: "user" as const,
          text: `（帮你实现心愿：送来 ${wish.quantity} 份${giftLabel(wish.crop)}）`,
          gift: {
            kind: "wish" as const,
            itemLabel: giftLabel(wish.crop),
            itemId: wish.crop,
            quantity: wish.quantity,
            recipientName: RESIDENTS[wish.resident].name,
            tier: "loved" as const,
            affinityDelta: 8,
            rewardLabel: `${wish.rewardCoins} dark币 · 1 有机肥`,
            inventoryConsumed: true,
          },
        },
        {
          id: `${chatId()}-wish`,
          role: "assistant" as const,
          text: thankLine,
        },
      ].slice(-40),
    }));
    setTown((prev) => {
      const baseWishes =
        prev.wishes &&
        prev.wishes.length > 0 &&
        prev.wishes[0].date === wish.date
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
          ...prev.events.filter(
            (ev) => ev.expiresAt > nowAt && ev.title !== rumor.title,
          ),
          rumor,
        ].slice(-12),
      };
    });
    showToast(
      `实现${RESIDENTS[wish.resident].name}的心愿！+${wish.rewardCoins} dark币 · +1 有机肥 · +8 好感`,
    );
  }

  function handleCompleteFocus(
    minutes: number,
    companions: ResidentId[],
    topic: string,
  ) {
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
    if (res.rewardCompost > 0)
      setCompost((c) => Math.min(5, c + res.rewardCompost));
    setTimeShift((s) => s + res.growthBoostMs);
    setTown((prev) => ({ ...prev, focus: res.nextStats }));
    showToast(
      `伴读完成！+${res.rewardCoins} dark币${res.rewardCompost ? " · +1 有机肥" : ""} · 作物加速生长`,
    );
    return res.note;
  }

  function handleHostFestival(recipe?: Recipe) {
    if (!loaded || loadFailed) return null;
    if (recipe) {
      const nextInv = craft(economy.inventory, recipe, coins);
      if (!nextInv) {
        showToast(`材料或dark币不足，暂无法现做${recipe.label}`);
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
        ...prev.events.filter(
          (ev) => ev.expiresAt > nowAt && ev.title !== res.townEvent.title,
        ),
        res.townEvent,
      ].slice(-12),
    }));
    showToast(
      `「${activeFestival.title}」点亮广场篝火！全家好感 +${res.affinityBoost}，已收藏纪念明信片`,
    );
    return res.postcard;
  }

  function handleFishingCatch(outcome: CatchOutcome) {
    const nextBook = applyFishingCatch(fishingBook, outcome);
    setTown((prev) => ({ ...prev, fishing: nextBook }));
    if (outcome.kind === "bottle") {
      setCoins((c) => c + outcome.bottle.bonusCoins);
      showToast(
        `捞到漂流瓶「${outcome.bottle.title}」· +${outcome.bottle.bonusCoins} dark币`,
      );
    } else {
      if (outcome.luckyBonus) {
        setMemories((prev) => ({
          ...prev,
          weigang: {
            ...prev.weigang,
            affinity: Math.min(100, prev.weigang.affinity + 1),
          },
        }));
      }
      showToast(
        `钓起 ${FISH_META[outcome.fish].label}${outcome.isNewRecord ? "（新图鉴！）" : ""}`,
      );
    }
  }

  function handleSellFish(fish: FishKind) {
    const res = sellFishFromBook(fishingBook, fish);
    if (res.sold <= 0) return;
    setTown((prev) => ({ ...prev, fishing: res.nextBook }));
    setCoins((c) => c + res.earned);
    showToast(`出售 ${res.sold} 条${FISH_META[fish].label} · +${res.earned} dark币`);
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
        next[id] = {
          ...next[id],
          affinity: Math.min(100, next[id].affinity + 1),
          mood: "开心",
        };
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
          detail:
            "顾用刚从池塘钓起的新鲜河鱼熬了一大锅奶白鲜鱼汤，全家人都闻香而来。",
          kind: "rumor" as const,
          knownBy: ["gu", "weigang"] as ResidentId[],
          hotspot: "houseDoor" as const,
          createdAt: nowAt,
          expiresAt: nowAt + 12 * 3600_000,
        },
      ].slice(-12),
    }));
    playSfx("farm_cook", { volume: 0.76 });
    showToast("炖好一锅鲜鱼豆腐汤！+64 dark币 · 全员好感 +1");
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
    if (res.chapter.rewardCompost > 0)
      setCompost((c) => Math.min(5, c + res.chapter.rewardCompost));
    playSfx("farm_level_up", { volume: 0.74 });
    showToast(
      `解锁${RESIDENTS[who].name}第 ${res.chapter.act} 幕「${res.chapter.title}」· +${res.chapter.rewardCoins} dark币`,
    );
  }

  function handleBuyDecor(id: DecorId) {
    if (!loaded || loadFailed || decorState.owned.includes(id)) return;
    const item = getDecorMeta(id);
    if (coins < item.price) {
      showToast(`dark币不足，需要 ${item.price} dark币`);
      return;
    }
    const nowAt = eventTime();
    const firstNoticer =
      id === "pond_lantern"
        ? "weigang"
        : id === "windmill"
          ? "xiaoba"
          : id === "campfire_ring"
            ? "yujie"
            : "gu";
    const ev = buildDecorAnnouncementEvent(id, firstNoticer, nowAt);
    setCoins((c) => Math.max(0, c - item.price));
    setTown((prev) => ({
      ...prev,
      decor: {
        owned: [...decorState.owned, id],
        placed: [...decorState.placed, id],
        announced: [...decorState.announced, id],
      },
      events: [
        ...prev.events.filter((e) => e.expiresAt > nowAt && e.title !== ev.title),
        ev,
      ].slice(-12),
    }));
    showToast(
      `已购置并摆出「${item.label}」！${RESIDENTS[firstNoticer].name}一眼就注意到啦`,
    );
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
    showToast(
      isPlaced
        ? `已暂时收起「${getDecorMeta(id).label}」`
        : `已将「${getDecorMeta(id).label}」摆进院子`,
    );
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
      [who]: [
        ...prev[who],
        { id: `${chatId()}-wake`, role: "assistant" as const, text: line },
      ].slice(-40),
    }));
    onCloseHouse();
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
          ...prev.events.filter(
            (e) => e.expiresAt > nowAt && e.title !== aftermath.event.title,
          ),
          aftermath.event,
        ].slice(-12),
      };
    });
    onCloseTown();
    playSfx("horror_appear", { ignoreCooldown: true, volume: 0.76 });
    showToast("⚠ 恐怖徐睡阴扛着幽蓝电脑闯进院子打瓦啦！快去点他把人赶走！");
  }

  function applyVisitorGift(who: NormalVisitorId, item: CropKind | Recipe["id"]) {
    const nowAt = eventTime();
    const res = evaluateVisitorGift(
      who,
      item,
      visitorState.records[who],
      nowAt,
      whaleSync,
    );
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
      useWhaleMemory
        .getState()
        .applyMood(farmDeltaToWhaleEmotionDelta(res.emotionDelta), nowAt);
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
          role: "user" as const,
          text: `（送给来串门的${displayProfile.name}一份${label}）`,
          gift: {
            kind: "gift" as const,
            itemLabel: label,
            itemId: item,
            quantity: 1,
            recipientName: displayProfile.name,
            affinityDelta: res.affinityDelta,
            inventoryConsumed: true,
          },
        },
        { id: `${chatId()}-vg`, role: "assistant" as const, text: res.reply },
      ].slice(-36),
    }));
    playSfx(who === "dafeiyu" ? "whale_cute_happy" : "farm_gift", {
      volume: 0.74,
    });
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
    setEconomy((prev) => ({
      ...prev,
      inventory: { ...prev.inventory, [crop]: rest },
    }));
    applyVisitorGift(who, crop);
  }

  function handleVisitorGiveDish(who: NormalVisitorId, recipe: Recipe) {
    const nextInv = craft(economy.inventory, recipe, coins);
    if (!nextInv) {
      showToast(`材料或dark币不足，暂无法现做${recipe.label}`);
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
          ...prev.events.filter(
            (e) => e.expiresAt > nowAt && e.title !== res.rumor.title,
          ),
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
      onCloseTown();
      onOpenRandomEventModal();
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
    if (choice.waterRefill)
      setWater((w) => Math.min(waterCap, w + (choice.waterRefill ?? 0)));
    if (choice.growthBoostMinutes)
      setTimeShift((s) => s + (choice.growthBoostMinutes ?? 0) * MINUTE);

    setMemories((prev) => {
      const next = { ...prev };
      for (const id of ev.participants) {
        const shifted = shiftResidentMemoryEmotion(
          next[id],
          id,
          choice.emotionDelta,
          nowAt,
        );
        next[id] = {
          ...shifted,
          affinity: Math.min(100, shifted.affinity + (choice.affinityDelta ?? 0)),
        };
      }
      return next;
    });

    if (ev.preferredVisitor === "dafeiyu" && whaleSyncEnabled) {
      useWhaleMemory
        .getState()
        .applyMood(farmDeltaToWhaleEmotionDelta(choice.emotionDelta), nowAt);
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
        events: [
          ...prev.events.filter((e) => e.expiresAt > nowAt),
          ...extraEvent,
        ].slice(-12),
        randomEvents: {
          activeEventId: null,
          activeTriggeredAt: 0,
          lastResolvedAt: nowAt,
          recentIds: [
            ...prevRE.recentIds.filter((id) => id !== ev.id),
            ev.id,
          ].slice(-8),
          resolvedCount: prevRE.resolvedCount + 1,
        },
      };
    });

    onCloseRandomEventModal();
    onHeroHappyPulse();
    showToast(choice.outcomeText);
  }

  return {
    loaded,
    loadFailed,
    saveError,
    epoch,
    timeShift,
    setTimeShift,
    coins,
    setCoins,
    seeds,
    setSeeds,
    economy,
    setEconomy,
    plots,
    setPlots,
    harvested,
    gear,
    setGear,
    vendorMemories,
    setVendorMemories,
    updateVendorMemory,
    water,
    setWater,
    canUpgrade,
    compost,
    setCompost,
    journal,
    setJournal,
    recapSeenAt,
    recapReadIds,
    setRecapReadIds,
    memories,
    setMemories,
    groupMembers,
    setGroupMembers,
    groupMessages,
    setGroupMessages,
    town,
    setTown,
    waterCap,
    stacks,
    bagCap,
    level,
    actionBusy,
    beginAction,
    record,
    workResources,
    settledResidentWork,
    vNow,
    night,
    period,
    weather,
    rainbow,
    day,
    season,
    clock,
    sceneVariant,
    seasonName,
    grown,
    growing,
    ripe,
    dryPlots,
    farmNeeds,
    studyContext,
    dailyWishes,
    focusStats,
    postcards,
    fishingBook,
    storyProgress,
    decorState,
    whaleSyncEnabled,
    randomEventsEnabled,
    emotionSpritesEnabled,
    whaleSync,
    randomEventState,
    activeRandomEvent,
    tuckedIdsToday,
    visitorState,
    activeVisitorVisit,
    activeNormalVisitor,
    sleepDeprived,
    activeFestival,
    storyBadgeCount,
    deliverableOrderList,
    collectHarvest,
    executeResidentWork,
    executeAutonomousDuty,
    beginVendorAction,
    vendorPrice,
    agreeVendorDiscount,
    sellStock,
    deliverOrder,
    improveIrrigation,
    makeRecipe,
    buildKitchen,
    rescueSeeds,
    actOnPlot,
    fetchWater,
    doSleep,
    finishBugGame,
    buyCoopSupply,
    buyOffer,
    smithService,
    pickStack,
    bulkHarvest,
    bulkWater,
    handleGiveCrop,
    handleGiveDish,
    handleFulfillWish,
    handleCompleteFocus,
    handleHostFestival,
    handleFishingCatch,
    handleSellFish,
    handleCookFishSoup,
    handleClaimStoryChapter,
    handleBuyDecor,
    handleToggleDecor,
    handleWakeResident,
    handleTuckInResident,
    summonHorrorVisitor,
    handleVisitorGiveCrop,
    handleVisitorGiveDish,
    handleBanishHorror,
    handleTriggerRandomEvent,
    handleResolveRandomEvent,
  };
}

export type FarmPersistence = ReturnType<typeof useFarmPersistence>;
