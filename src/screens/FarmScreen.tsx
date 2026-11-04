import { FarmFrame, FarmButton, FarmPaper, FarmText as Text, FARM_BODY_FONT } from "@/components/farm/FarmSkin";
/* eslint-disable react-hooks/immutability --
   Reanimated 共享值（px/py/face 等）本质是跨渲染、跨线程可变的容器，
   在事件回调与 effect 中赋值是官方标准用法，React 编译器的不可变假设不适用 */

import Ionicons from "@expo/vector-icons/Ionicons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useIsFocused, useRouter } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  AppState,
  Keyboard,
  Modal,
  Image,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
  useWindowDimensions,
  type ScrollViewInstance,
} from "react-native";
import Animated, {
  cancelAnimation,
  Easing,
  FadeIn,
  FadeInDown,
  FadeOut,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withTiming,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useForegroundClock } from "@/hooks/useForegroundClock";
import Svg, { G, Rect } from "react-native-svg";

import {
  CROP_ART,
  DOOR_PALETTE,
  DOOR_ROWS,
  GU_PALETTE,
  GU_ROWS,
  PROP_ART,
  WEIGANG_PALETTE,
  WEIGANG_ROWS,
  XIAOBA_PALETTE,
  XIAOBA_ROWS,
  YUJIE_PALETTE,
  YUJIE_ROWS,
  type CropKind,
} from "@/components/farm/sprites";
import { SCENE_SIZE, HOUSE, POND, PLOTS, COOP, MARKET, INTERACTION_ZONES, PLAYER_START, RESIDENT_PLACEMENTS, plotApproach, farmSceneViewport } from "@/constants/farmMap";
import { planFarmRoute } from "@/utils/farmNavigation";
import { FarmSceneFacilities } from "@/components/farm/FarmSceneFacilities";
import { farmTime } from "@/utils/farmTime";
import { CROP_KINDS, CROP_META, cropRecord, restoreSeeds, restoreEconomy, migrateCoins, isCropKind, harvestResult, stockCount, stockValue, completeOrder, irrigationCost, wetDuration, craft, type Economy, type Recipe } from "@/utils/farmEconomy";
import { FarmEconomyPanel } from "@/components/farm/FarmEconomyPanel";
import { realDate } from "@/utils/farmProgress";
import { BugGame } from "@/components/farm/BugGame";
import { HouseInterior } from "@/components/farm/HouseInterior";
import { FarmWater } from "@/components/farm/FarmWater";
import { CropSprite, FarmToolSprite } from "@/components/farm/CropSprite";
import { FarmLifeLayer } from "@/components/farm/FarmLifeLayer";
import { FarmPersonSprite } from "@/components/farm/FarmPersonSprite";
import { FarmJournalPanel } from "@/components/farm/FarmJournalPanel";
import { claimGoal, compostReward, fertilizedGrowth, remainingGrowthTime, emptyJournal, farmLevel, finiteCount, recordActivity, restoreJournal, upgradeCost, waterCapacity, type FarmActivity, type FarmJournal } from "@/utils/farmProgress";
import { farmChat } from "@/services/farmChat";
import { localNpcCommand, parseNpcReply, NPC_ACTION_SCHEMA, type NpcAction } from "@/utils/farmActions";
import { farmPlotGrowth as plotGrowth, waterFarmPlots } from "@/utils/farmWatering";
import { useFarmResidents } from "@/hooks/useFarmResidents";
import type { ResidentId } from "@/utils/farmLife";
import { useSettings } from "@/store/useSettings";

/* -------------------------------------------------------------------------- */
/*  场景几何（虚拟像素坐标，最终按屏宽等比缩放）                                 */
/* -------------------------------------------------------------------------- */

const VIEW_W = SCENE_SIZE.width;
const VIEW_H = SCENE_SIZE.height;
const PLOT_COUNT = PLOTS.length;
const SAVE_KEY = "dark-study-farm";
const plotPos = (i: number) => PLOTS[i];
const MINUTE = 60_000;
// Read the clock only from event handlers/effects; keep React's render path deterministic.
const eventTime = () => Date.now();
const DAY = 24 * MINUTE * 60;


/** 浇一次水保持湿润的时长：湿润期按真实时间 1:1 生长，干土只有 35% 速度 */
const WET_MS = 30 * MINUTE;
/** 长到第一阶段的进度比例 */
const STAGE1_AT = 0.45;
/** 早上几点醒来 */
const WAKE_HOUR = 7;

interface PlotState {
  crop: CropKind | null;
  /** 上次结算时累计的生长毫秒 */
  growMs: number;
  /** 上次结算的时间戳（虚拟时间） */
  lastSync: number;
  /** 湿润截止时间（虚拟时间） */
  wetUntil: number;
  fertilized?: boolean;
  plantedSeason?: number;
  harvests?: number;
}

interface SaveData {
  v: 4;
  economy: Economy;
  canUpgrade: number;
  compost: number;
  journal: FarmJournal;
  /** 第 1 天 0 点对应的虚拟时间戳 */
  epoch: number;
  /** 睡觉 / 小游戏攒下的时间偏移 */
  timeShift: number;
  coins: number;
  seeds: Record<CropKind, number>;
  plots: PlotState[];
  harvested: number;
  /** 水壶剩余次数（老存档没有这个字段，读档时补 0） */
  water?: number;
}

/** 兼容老存档的宽结构 */
interface RawSave {
  economy?: unknown;
  canUpgrade?: number;
  compost?: number;
  journal?: unknown;
  v?: number;
  epoch?: number;
  timeShift?: number;
  coins?: number;
  seeds?: Record<string, number>;
  plots?: (Partial<PlotState> & {
    crop?: string | null;
    stage?: number;
    watered?: boolean;
  })[];
  harvested?: number;
  water?: number;
  day?: number;
}

const emptyPlot = (at: number): PlotState => ({
  crop: null,
  growMs: 0,
  lastSync: at,
  wetUntil: 0,
});

/** 每七个农场日换季；当季播种增加产量。 */
const SEASONS = ["春", "夏", "秋", "冬"];

/** Quiet side gutters on short devices; the sky is part of the terrain artwork. */
const SCENE_FRAME = { day: "#233C2A", night: "#101B28" };

const PIXEL_FONT = Platform.select({
  ios: "Courier",
  android: "monospace",
  default: "monospace",
});

/* -------------------------------------------------------------------------- */
/*  真实时间与作物生长                                                         */
/* -------------------------------------------------------------------------- */

function midnightOf(ts: number) {
  const d = new Date(ts);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

/** 累计生长：湿润期按 1:1 计，干土按 35% 慢慢长 */

function plotStage(p: PlotState, now: number) {
  if (!p.crop) return 0;
  const ratio = plotGrowth(p, now) / CROP_META[p.crop].growMs;
  return ratio >= 1 ? 2 : ratio >= STAGE1_AT ? 1 : 0;
}

function isWet(p: PlotState, now: number) {
  return p.crop !== null && now < p.wetUntil;
}

/** 剩余时间：不足一分钟按秒说，超过就按分钟 */
function restLabel(ms: number) {
  if (ms <= 0) return "马上就好";
  if (ms < MINUTE) return `${Math.max(1, Math.ceil(ms / 1000))} 秒`;
  const m = Math.ceil(ms / MINUTE);
  if (m < 60) return `${m} 分钟`;
  const h = Math.floor(m / 60);
  const r = m % 60;
  return r ? `${h} 小时 ${r} 分钟` : `${h} 小时`;
}

/* -------------------------------------------------------------------------- */
/*  离线台词（没有配置 AI Key / 请求失败时兜底，仍然好玩）                       */
/* -------------------------------------------------------------------------- */

function fallbackLine(
  who: Speaker,
  ctx: { day: number; coins: number; growing: number; harvested: number },
) {
  const gu = [
    `第 ${ctx.day} 天了，作物在长，你也要好好吃饭。`,
    `金币 ${ctx.coins}，别全买种子，留一点给自己买杯热牛奶。`,
    ctx.growing > 0
      ? `还有 ${ctx.growing} 株没长大，浇水的时候顺便把心情也浇一浇。`
      : "地里空空的，要不要种点什么？我比较想看星星果。",
    "累了就睡一觉，明天的土会更松一点。",
    ctx.harvested > 0
      ? `已经收了 ${ctx.harvested} 次啦，你比看起来更会照顾东西。`
      : "第一颗种子总是最难的，种下去就赢了一半。",
    "他写的这个农场藏这么深，还好你找到了。",
    "要是学习也能像作物一样，浇浇水就长大就好了。",
  ];
  const door = [
    "这个农场本来只是写着玩的，结果你真的找到了。",
    `第 ${ctx.day} 天，代码 0 报错，作物 0 枯死，今天算顺利。`,
    "别问我为什么课表里藏农场，问就是想让学习這件事轻一点。",
    "顾说我黑眼圈重，我觉得是屏幕太亮。",
    `金币 ${ctx.coins}，够买种子，不够买显卡。`,
    "写这个应用的时候，我最想做的其实是一个能喘气的地方。",
    ctx.growing > 0
      ? "地里的东西不用一直盯着，它们比你更懂慢慢来。"
      : "先种点什么吧，空着的田看着怪孤单的。",
    "你继续玩，我去修个 bug。真的有 bug，不是借口。",
  ];
  const chicken = [
    "咕，你来啦。今天的地里没有虫子，只有我。",
    "咕咕咕……顾撒的米比种子好吃，别说是我说的。",
    ctx.growing > 0
      ? "咕？那些苗苗还在长，我每天都来看一眼。"
      : "咕……地里空着，我想在土里洗澡，被顾说了。",
    "我叫坤坤，会打篮球的那种鸡，咕。",
    `第 ${ctx.day} 天啦，咕，我数不清，但看你来了就开心。`,
    "怕猫，但我更怕你走了不回来，咕。",
    `金币 ${ctx.coins} 也用不完我的一粒米，咕咕。`,
    "累了就坐在田边吧，我陪你，反正我也没别的事，咕。",
  ];
  const xiaoba = [
    "地我替你看过了，苗都还站着，放心吧。",
    `第 ${ctx.day} 天，弟弟们又吵架了，我来田边躲一会儿。`,
    ctx.growing > 0
      ? `还有 ${ctx.growing} 株在长，水我浇过一遍了，你歇着。`
      : "地空着也好看，风一吹全是草的味道。",
    `金币 ${ctx.coins}，别乱花，弟弟们还等着买种子。`,
    ctx.harvested > 0
      ? `收了 ${ctx.harvested} 次啦，你比我会照顾东西。`
      : "第一颗种子最难，种下去就赢了一半。",
    "我是小八，家里老大，习惯了先看别人。",
    "我爸写这个农场的时候，说是给自己留个能喘气的地方。",
  ];
  const yujie = [
    "今天有没有熟的？我饿了，真的很饿。",
    `金币 ${ctx.coins}！够买三根烤肠了吧？`,
    ctx.growing > 0
      ? `那 ${ctx.growing} 株还没好，我盯它们好久了，一点动静都没有。`
      : "地里空空的，我哥说种子不能偷吃，我觉得可以商量。",
    `第 ${ctx.day} 天，我哥又在装大人了。`,
    "我叫玉洁，名字好听吧，我妈取的。",
    "唯纲说他会魔法，我觉得他只会摔跤。",
    ctx.harvested > 0
      ? `收了 ${ctx.harvested} 次，每次我都先尝过。`
      : "下次多种点蓝莓吧，那个甜。",
  ];
  const weigang = [
    "别碰帽子，这是法师的帽子。",
    "我哥说没有魔法，那是他没看见。",
    `第 ${ctx.day} 天，我算过了，今天适合浇水。`,
    ctx.growing > 0
      ? `那 ${ctx.growing} 株苗我用魔法催过了，别急。`
      : "空地正好，我可以在这儿画个法阵。",
    "等我学会火球术，就帮家里烧水。",
    `金币 ${ctx.coins}，法师也是要吃饭的。`,
    "你想学魔法吗？先学会站好别摔。",
  ];
  const bank: Record<Speaker, string[]> = {
    gu,
    door,
    chicken,
    xiaoba,
    yujie,
    weigang,
  };
  const lines = bank[who];
  return lines[Math.floor(Math.random() * lines.length)];
}

/* -------------------------------------------------------------------------- */
/*  对话                                                                       */
/* -------------------------------------------------------------------------- */

type Speaker =
  | "door"
  | "gu"
  | "chicken"
  | "xiaoba"
  | "yujie"
  | "weigang";

interface FarmChatMsg {
  id: string;
  role: "user" | "assistant";
  text: string;
}

/** 角色人设：door 是作者，顾是他的女友，小鸡坤坤是农场常驻，三个儿子是来农场玩的 */
const TALK_PERSONA: Record<Speaker, string> = {
  door: "door，课程表应用 dark-study 的作者，白天写前端，晚上改 bug。性格温和、嘴硬心软、会自嘲，聊到女友顾的时候会明显变软。说话像熟人聊天，偶尔带一点程序员梗，但不炫技。",
  gu: "顾，door 的女友，农场常驻。性格温柔、俏皮、细腻，喜欢观察生活和小动物，会吐槽 door 的黑眼圈，也会认真鼓励人。说话轻快，偶尔撒娇，但不过分。",
  chicken:
    "坤坤，农场里那只圆滚滚的小鸡，胆子小但很黏人。说话短、碎碎念，喜欢用「咕」当语气词，爱聊虫子、晒太阳、顾撒的米，偶尔一本正经地吹自己球技好。不装作很聪明，会一本正经地说傻话，也会安慰人。",
  xiaoba:
    "小八，door 和顾的大儿子，家里老大。性格稳重、话不多但很会照顾人，习惯先看两个弟弟再顾自己，有点小大人的疲惫感。说话温和、句子短，会关心对方累不累、吃饭没有，偶尔透出一点想被照顾的心思。",
  yujie:
    "玉洁，door 和顾的二儿子。性格活泼、嘴贫、爱吃，说话又快又爱笑，喜欢抢话、开哥哥和弟弟的玩笑，也护着家里人。不会真的调皮捣蛋，但总觉得地里的东西「可以先尝一口」。",
  weigang:
    "唯纲，door 和顾的三儿子，最小的那个。戴着一顶紫色的巫师帽，坚信自己是魔法师，说话一本正经地胡说八道，会认真解释「魔法原理」，被拆穿也不承认。天真、黏人，会想让对方也相信魔法。",
};

const TALK_TOPICS: Record<Speaker, string[]> = {
  door: ["这农场怎么藏得这么深？", "你平时怎么写代码？", "说说顾吧"],
  gu: ["door 最近在忙什么？", "今天适合种点什么？", "夸夸我"],
  chicken: ["坤坤今天吃了什么？", "你怕不怕猫？", "陪我待一会儿"],
  xiaoba: ["当哥哥累不累？", "平时帮家里做什么？", "弟弟们闹了怎么办？"],
  yujie: ["玉洁今天吃了什么？", "你俩谁更调皮？", "最喜欢哪种作物？"],
  weigang: ["帽子哪来的？", "你真的会魔法吗？", "变个东西给我看看"],
};

/** 对话面板抬头：名字、身份、头像 */
const SPEAKER_META: Record<
  Speaker,
  { name: string; sub: string; rows: string[]; palette: Record<string, string> }
> = {
  door: {
    name: "door",
    sub: "dark-study 作者 · 农场主",
    rows: DOOR_ROWS,
    palette: DOOR_PALETTE,
  },
  gu: {
    name: "顾",
    sub: "door 的女友 · 农场常驻",
    rows: GU_ROWS,
    palette: GU_PALETTE,
  },
  chicken: {
    name: "坤坤",
    sub: "农场里的小鸡 · 黏人",
    rows: PROP_ART.chicken.rows,
    palette: PROP_ART.chicken.palette,
  },
  xiaoba: {
    name: "小八",
    sub: "大儿子 · 家里老大",
    rows: XIAOBA_ROWS,
    palette: XIAOBA_PALETTE,
  },
  yujie: {
    name: "玉洁",
    sub: "二儿子 · 嘴贫爱吃",
    rows: YUJIE_ROWS,
    palette: YUJIE_PALETTE,
  },
  weigang: {
    name: "唯纲",
    sub: "三儿子 · 自称魔法师",
    rows: WEIGANG_ROWS,
    palette: WEIGANG_PALETTE,
  },
};

/** 三个儿子：站位、名牌与贴图 */
function farmSystemPrompt(
  who: Speaker,
  ctx: {
    day: number;
    season: string;
    coins: number;
    growing: number;
    harvested: number;
  },
) {
  return `你在像素农场「doordoor农场」里扮演 ${TALK_PERSONA[who]}
当前农场状态：第 ${ctx.day} 天（${ctx.season}天），金币 ${ctx.coins}，${ctx.growing} 株作物还没成熟，累计收获 ${ctx.harvested} 次。
规则：用中文口语聊天；每次回复 1-3 句、不超过 80 个字；不要用引号包住整段话，不要写括号动作或旁白，不要提及 AI、模型或提示词；可以自然聊农场、课表、写代码和日常；遇到不适合回答的话题就轻轻岔开。`;
}

const chatId = () => `${eventTime()}-${Math.random().toString(36).slice(2, 7)}`;

/* -------------------------------------------------------------------------- */
/*  会轻轻呼吸的像素小人                                                       */
/* -------------------------------------------------------------------------- */

const MOTES = (() => {
  let seed = 23;
  const rnd = () => {
    seed = (seed * 1103515245 + 12345) % 2147483648;
    return seed / 2147483648;
  };
  return Array.from({ length: 7 }, (_, i) => ({
    id: i,
    x: 8 + rnd() * 184,
    y: 150 + rnd() * 140,
    dur: 2800 + rnd() * 2400,
    delay: rnd() * 2000,
    size: rnd() > 0.6 ? 2 : 1,
  }));
})();

function Mote({
  x,
  y,
  dur,
  delay,
  size,
  scale,
}: {
  x: number;
  y: number;
  dur: number;
  delay: number;
  size: number;
  scale: number;
}) {
  const v = useSharedValue(0);

  useEffect(() => {
    v.value = withDelay(
      delay,
      withRepeat(
        withTiming(1, { duration: dur, easing: Easing.inOut(Easing.sin) }),
        -1,
        true,
      ),
    );
  }, [v, dur, delay]);

  const style = useAnimatedStyle(() => ({
    opacity: 0.16 + v.value * 0.38,
    transform: [
      { translateY: -v.value * 5 * scale },
      { translateX: v.value * 2 * scale },
    ],
  }));

  return (
    <Animated.View
      pointerEvents="none"
      style={[
        {
          position: "absolute",
          left: x * scale,
          top: y * scale,
          width: size * scale,
          height: size * scale,
          backgroundColor: "#FFF6C9",
        },
        style,
      ]}
    />
  );
}

/** NPC 头顶的小铭牌，提示这里可以对话 */
function NameTag({
  label,
  accent,
  scale,
  hit,
  center = 8,
}: {
  label: string;
  accent: string;
  scale: number;
  hit: boolean;
  /** 名牌对准精灵中心的横向单位（默认按 16 宽精灵） */
  center?: number;
}) {
  return (
    <View
      pointerEvents="none"
      style={{
        position: "absolute",
        top: -19,
        left: center * scale - 17,
        width: 34,
        height: 14,
        borderRadius: 7,
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: "rgba(14,26,18,0.78)",
        borderWidth: 1,
        borderColor: "rgba(246,238,220,0.18)",
      }}
    >
      <View
        style={{
          width: 3,
          height: 3,
          borderRadius: 2,
          marginRight: 3,
          backgroundColor: hit ? accent : "#8FA08F",
        }}
      />
      <Text
        style={{
          color: hit ? "#F6EEDC" : "rgba(246,238,220,0.7)",
          fontSize: 8.5,
          fontWeight: "700",
          fontFamily: PIXEL_FONT,
        }}
      >
        {label}
      </Text>
    </View>
  );
}

/* -------------------------------------------------------------------------- */
/*  农场主界面                                                                 */
/* -------------------------------------------------------------------------- */

export function FarmScreen() {
  const router = useRouter();
  const focused = useIsFocused();
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const apiKey = useSettings((s) => s.apiKey);

  const { width: sceneW, height: sceneH, scale } = farmSceneViewport(width, height, insets.top, insets.bottom);
  /** 聊天消息区高度：小屏 + 键盘弹起时不把面板顶出屏幕 */
  const chatMaxH = Math.max(150, Math.min(258, Math.round(height * 0.32)));

  const [loaded, setLoaded] = useState(false);
  const now = useForegroundClock(3000).getTime();
  /** 睡觉、小游戏攒出来的时间偏移：虚拟时间 = 真实时间 + 偏移 */
  const [timeShift, setTimeShift] = useState(0);
  /** 第 1 天 0 点对应的虚拟时间戳 */
  const [epoch, setEpoch] = useState(() => midnightOf(eventTime()));
  const [coins, setCoins] = useState(120);
  const [seeds, setSeeds] = useState<Record<CropKind, number>>(() => ({ ...cropRecord(), radish: 3, wheat: 2 }));
  const [economy, setEconomy] = useState(() => restoreEconomy(undefined, eventTime()));
  const [saveError, setSaveError] = useState(false);
  const saveQueue = useRef(Promise.resolve());
  const [loadFailed, setLoadFailed] = useState(false);
  const [plots, setPlots] = useState<PlotState[]>(() =>
    Array.from({ length: PLOT_COUNT }, () => emptyPlot(eventTime())),
  );
  const [harvested, setHarvested] = useState(0);
  const [selected, setSelected] = useState<CropKind>("radish");
  /** 水壶里还能浇几次；必须先去水池打水 */
  const [water, setWater] = useState(0);
  const [canUpgrade, setCanUpgrade] = useState(0);
  const [compost, setCompost] = useState(2);
  const [journal, setJournal] = useState(() => emptyJournal(eventTime()));
  const [journalOpen, setJournalOpen] = useState(false);
  const [lifeOpen, setLifeOpen] = useState(false);
  const [fertilizing, setFertilizing] = useState(false);
  const waterCap = waterCapacity(canUpgrade);
  const level = farmLevel(harvested);
  const actionBusy = useRef(false);
  useEffect(() => { actionBusy.current = false; });
  const beginAction = () => {
    if (!loaded || loadFailed || actionBusy.current) return false;
    actionBusy.current = true;
    return true;
  };
  const record = (kind: FarmActivity, amount = 1) => setJournal((j) => recordActivity(j, kind, amount, eventTime()));
  /** 小铺一次买几包 */
  const [qty, setQty] = useState(1);

  const [houseOpen, setHouseOpen] = useState(false);
  const [gameOpen, setGameOpen] = useState(false);
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
  const [speaker, setSpeaker] = useState<Speaker | null>(null);
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
  const [kbH, setKbH] = useState(0);
  const chatRef = useRef<ScrollViewInstance>(null);
  const personalRequest = useRef<AbortController | null>(null);
  const workResources = useRef({ plots, water, waterCap, timeShift, irrigation: economy.irrigation });
  const settledResidentWork = useRef(new Set<string>());
  useEffect(() => { workResources.current = { plots, water, waterCap, timeShift, irrigation: economy.irrigation }; }, [plots, water, waterCap, timeShift, economy.irrigation]);
  useEffect(() => () => { personalRequest.current?.abort(); }, [speaker, focused]);

  /* ---------------- 天色用本地时间；生长、天数和季节用游戏时间 ---------------- */
  const { growthNow: vNow, night, day, season, clock } = farmTime(now, timeShift, epoch);
  const seasonName = SEASONS[season];
  const residents = useFarmResidents({
    enabled: focused && loaded && folkReady && !loadFailed,
    paused: shopOpen || houseOpen || gameOpen || journalOpen || lifeOpen,
    autonomous: !speaker, night, apiKey, onWork: executeResidentWork,
  });

  function executeResidentWork(actor: ResidentId, action: NpcAction, id: string): string {
    const settlement = `${actor}:${id}`;
    if (settledResidentWork.current.has(settlement)) return "这件事已经办好了。";
    if (actionBusy.current) return "你正在操作田地，忙完后再叫我吧。";
    settledResidentWork.current.add(settlement);
    if (settledResidentWork.current.size > 100) settledResidentWork.current.delete(settledResidentWork.current.values().next().value!);
    const resources = workResources.current;
    if (action.type === "fetch_water") {
      if (resources.water >= resources.waterCap) return "水壶本来就是满的，不用再打水啦。";
      workResources.current = { ...resources, water: resources.waterCap };
      setWater(resources.waterCap);
      return "我把水壶装满了，可以照料田地啦。";
    }
    if (action.type === "water_crops") {
      if (resources.water <= 0) return "水壶空了，先让我去打点水吧。";
      const result = waterFarmPlots(resources.plots, resources.water, eventTime() + resources.timeShift, wetDuration(resources.irrigation));
      if (!result.ids.length) return "田地都湿润了，或暂时没有要照料的苗。";
      workResources.current = { ...resources, plots: result.plots, water: result.water };
      setPlots(result.plots); setWater(result.water); record("water", result.ids.length);
      return `照料了 ${result.ids.length} 块田地，水壶还剩 ${result.water} 次。`;
    }
    return "这件事已经安排好了。";
  }

  /** 每块地的累计生长量（每次渲染按当前虚拟时间实时结算，不落库） */
  const grown = plots.map((p) => plotGrowth(p, vNow));
  const growing = plots.filter(
    (p, i) => p.crop && grown[i] < CROP_META[p.crop].growMs,
  ).length;

  // 每 3 秒走一次表：作物进度、天色、时钟都靠它刷新
  // （原来 1 秒一次，整棵树每秒重渲染会让贴图与动画掉帧）
  useEffect(() => {
    const subscription = AppState.addEventListener("change", (state) => {
      if (state !== "active") personalRequest.current?.abort();
    });
    return () => subscription.remove();
  }, []);

  // 首次读档后再挂贴图，之后用交叉淡化切换真实昼夜。
  const nightV = useSharedValue(night ? 1 : 0);
  const nightSettled = useRef(false);
  /** 读档完成、天色已硬切到位之后才挂场景贴图 */
  const [texReady, setTexReady] = useState(false);
  useEffect(() => {
    if (!loaded) return;
    if (nightSettled.current) {
      nightV.value = withTiming(night ? 1 : 0, { duration: 700 });
      return;
    }
    nightSettled.current = true;
    nightV.value = night ? 1 : 0;
    setTexReady(true);
  }, [night, loaded, nightV]);
  const dayLayerStyle = useAnimatedStyle(() => ({
    opacity: 1 - nightV.value,
  }));
  const nightLayerStyle = useAnimatedStyle(() => ({ opacity: nightV.value }));


  /* ---------------- 玩家位置：UI 线程上平滑走动 ---------------- */
  const [playerMoving, setPlayerMoving] = useState(false);
  const px = useSharedValue(PLAYER_START.x);
  const py = useSharedValue(PLAYER_START.y);
  const face = useSharedValue(1);

  const playerFacingStyle = useAnimatedStyle(() => ({ transform: [{ scaleX: face.value }] }));
  const playerStyle = useAnimatedStyle(() => ({
    zIndex: Math.round(py.value),
    transform: [
      { translateX: (px.value - 10) * scale },
      { translateY: (py.value - 25) * scale },
    ],
  }));

  const moveTo = useCallback(
    (x: number, y: number) => {
      if (houseTimer.current) { clearTimeout(houseTimer.current); houseTimer.current = null; }
      const route = planFarmRoute({ x: px.value, y: py.value }, { x, y });
      cancelAnimation(px); cancelAnimation(py);
      if (!route.length) { setPlayerMoving(false); return 0; }
      setPlayerMoving(true);
      face.value = route[0].x < px.value ? -1 : 1;
      let previous = { x: px.value, y: py.value };
      let total = 0;
      const steps = route.map(point => {
        const duration = Math.max(90, Math.hypot(point.x - previous.x, point.y - previous.y) * 18);
        previous = point; total += duration;
        return { point, duration };
      });
      // 回调必须带 worklet 标记单独定义：写在三元表达式里的内联箭头不会被
      // Reanimated 插件 worklet 化，走路结束那一刻 UI 线程调用 JS 闭包会直接闪退
      const walkFinished = (finished?: boolean) => {
        "worklet";
        if (finished) runOnJS(setPlayerMoving)(false);
      };
      px.value = withSequence(...steps.map(step => withTiming(step.point.x, { duration: step.duration, easing: Easing.linear })));
      py.value = withSequence(...steps.map((step, i) => withTiming(step.point.y, { duration: step.duration, easing: Easing.linear }, i === steps.length - 1 ? walkFinished : undefined)));
      return total;
    },
    [face, px, py],
  );

  const showToast = useCallback((text: string) => {
    setToast({ id: eventTime(), text });
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 1800);
  }, []);

  useEffect(
    () => () => {
      if (toastTimer.current) clearTimeout(toastTimer.current);
      if (houseTimer.current) clearTimeout(houseTimer.current);
    },
    [],
  );

  /** 键盘高度：避免聊天输入条被键盘顶住或遮住 */
  useEffect(() => {
    const showEvt =
      Platform.OS === "ios" ? "keyboardWillShow" : "keyboardDidShow";
    const hideEvt =
      Platform.OS === "ios" ? "keyboardWillHide" : "keyboardDidHide";
    const s = Keyboard.addListener(showEvt, (e) =>
      setKbH(e.endCoordinates.height),
    );
    const h = Keyboard.addListener(hideEvt, () => setKbH(0));
    return () => {
      s.remove();
      h.remove();
    };
  }, []);

  /* ---------------- 存档读取 / 写入 ---------------- */
  useEffect(() => {
    let alive = true;
    AsyncStorage.getItem(SAVE_KEY)
      .then((raw) => {
        if (!alive || !raw) return;
        let data: RawSave;
        try {
          data = JSON.parse(raw) as RawSave;
        } catch {
          setLoadFailed(true);
          return;
        }
        if (!data || typeof data !== "object" || Array.isArray(data)) { setLoadFailed(true); return; }
        const realNow = eventTime();
        const shift = typeof data.timeShift === "number" && Number.isFinite(data.timeShift) ? Math.max(0, data.timeShift) : 0;

        if ((data.v === 2 || data.v === 3 || data.v === 4) && typeof data.epoch === "number" && Number.isFinite(data.epoch)) {
          setEpoch(data.epoch);
          setTimeShift(shift);
        } else {
          // 老存档只有天数：把第 1 天的 0 点倒推出来，作物进度按旧阶段换算
          const oldDay = Math.max(1, Number(data.day) || 1);
          setEpoch(midnightOf(realNow) - (oldDay - 1) * DAY);
          setTimeShift(0);
        }

        setCanUpgrade(finiteCount(data.canUpgrade, 3));
        setCompost(data.compost === undefined ? 2 : finiteCount(data.compost));
        setJournal(restoreJournal(data.journal, realNow));
        setCoins(migrateCoins(data.v, data.coins));
        setEconomy(restoreEconomy(data.economy, realNow));
        if (typeof data.water === "number") {
          setWater(finiteCount(data.water, waterCapacity(finiteCount(data.canUpgrade, 3))));
        }
        if (typeof data.harvested === "number") {
          setHarvested(finiteCount(data.harvested));
        }
        if (data.seeds) {
          setSeeds(restoreSeeds(data.seeds));
        }
        if (Array.isArray(data.plots) && data.plots.length > 0) {
          const vNowNow = realNow + shift;
          const parsed = data.plots.slice(0, PLOT_COUNT).map((p) => {
              const kind =
                isCropKind(p?.crop)
                  ? p.crop
                  : null;
              if (!kind) return emptyPlot(vNowNow);
              const need = CROP_META[kind].growMs;
              // 新结构：直接恢复生长累计
              if (
                typeof p.growMs === "number" &&
                Number.isFinite(p.growMs) &&
                typeof p.lastSync === "number" && Number.isFinite(p.lastSync)
              ) {
                return {
                  crop: kind,
                  growMs: Math.min(need, Math.max(0, p.growMs)),
                  lastSync: Math.max(0, p.lastSync),
                  wetUntil: typeof p.wetUntil === "number" && Number.isFinite(p.wetUntil) ? p.wetUntil : 0,
                  fertilized: p.fertilized === true,
                  plantedSeason: finiteCount(p.plantedSeason, 3),
                  harvests: finiteCount(p.harvests, CROP_META[kind].rounds - 1),
                };
              }
              // 旧结构：按 stage / watered 折算
              const stage = Math.min(2, Math.max(0, Number(p.stage) || 0));
              return {
                crop: kind,
                growMs: stage >= 2 ? need : stage === 1 ? need * STAGE1_AT : 0,
                lastSync: vNowNow,
                wetUntil: p.watered ? vNowNow + WET_MS / 2 : 0,
              };
          });
          // 9 格老存档自动补齐到 16 格，原有作物数据不丢
          while (parsed.length < PLOT_COUNT) parsed.push(emptyPlot(vNowNow));
          setPlots(parsed);
        }
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
      economy,
      canUpgrade,
      compost,
      journal,
      epoch,
      timeShift,
      coins,
      seeds,
      plots,
      harvested,
      water,
    };
    const serialized = JSON.stringify(payload);
    saveQueue.current = saveQueue.current.then(() => AsyncStorage.setItem(SAVE_KEY, serialized)).then(() => setSaveError(false)).catch(() => setSaveError(true));
  }, [loaded, loadFailed, economy, epoch, timeShift, coins, seeds, plots, harvested, water, canUpgrade, compost, journal]);

  /* ---------------- 操作 ---------------- */
  const collectHarvest = (indices: number[], t: number) => {
    const next = { ...economy.inventory };
    let count = 0;
    const newPlots = plots.map((plot, i) => {
      if (!indices.includes(i) || !plot.crop) return plot;
      const kind = plot.crop;
      const result = harvestResult(kind, plot.fertilized === true, plot.plantedSeason ?? season, plot.harvests);
      const quality = result.premium ? "premium" : "normal";
      next[kind] = { ...next[kind], [quality]: next[kind][quality] + result.quantity };
      count += result.quantity;
      return result.regrow ? { ...plot, growMs: CROP_META[kind].growMs * 0.5, lastSync: t, harvests: (plot.harvests ?? 0) + 1, fertilized: false } : emptyPlot(t);
    });
    setEconomy(e => ({ ...e, inventory: next }));
    setPlots(newPlots);
    setHarvested(h => h + indices.length);
    record("harvest", indices.length);
    showToast(`收获 ${count} 份已入仓 · 手账里出售、交订单或加工`);
  };
  const sellStock = (kind: CropKind) => {
    if (!beginAction()) return;
    const gain = stockValue(kind, economy.inventory[kind], eventTime());
    if (!gain) return;
    setCoins(c => c + gain);
    setEconomy(e => ({ ...e, inventory: { ...e.inventory, [kind]: { normal: 0, premium: 0 } } }));
    showToast(`出售${CROP_ART[kind].label} · +${gain} 金币`);
  };
  const deliverOrder = (kind: CropKind) => {
    if (!beginAction() || level < CROP_META[kind].level) return;
    const result = completeOrder(economy, kind, level, eventTime());
    if (!result) { showToast("订单已交付或库存不足"); return; }
    setEconomy(result.economy);
    setCoins(c => c + result.reward);
    setCompost(c => c + 1);
    showToast("订单完成 · +" + result.reward + " 金币，+1 肥料");
  };
  const improveIrrigation = () => {
    if (!beginAction() || economy.irrigation >= 3 || level < economy.irrigation + 2 || coins < irrigationCost(economy.irrigation)) return;
    setCoins(c => c - irrigationCost(economy.irrigation));
    setEconomy(e => ({ ...e, irrigation: e.irrigation + 1 }));
    showToast("保水改良完成 · 此后每次浇水多保持湿润 15 分钟");
  };
  const makeRecipe = (recipe: Recipe) => {
    if (!beginAction() || !economy.kitchen) return;
    const next = craft(economy.inventory, recipe, coins);
    if (!next) { showToast("食材或加工费不足"); return; }
    setEconomy(e => ({ ...e, inventory: next }));
    setCoins(c => c + recipe.sell - recipe.fee);
    showToast(`${recipe.label}已售出 · 扣费后 +${recipe.sell - recipe.fee} 金币`);
  };
  const buildKitchen = () => {
    if (!beginAction() || economy.kitchen || level < 3 || coins < 280) return;
    setCoins(c => c - 280);
    setEconomy(e => ({ ...e, kitchen: true }));
    showToast("厨房建好了，试着把收成做成料理吧");
  };
  const rescueSeeds = () => {
    if (!beginAction()) return;
    const date = realDate(eventTime());
    if (economy.rescueDate === date) { showToast("今天已领过起步种子，明天再来"); return; }
    if (coins >= CROP_META.radish.price || plots.some(p => p.crop) || CROP_KINDS.some(k => seeds[k] > 0 || stockCount(economy.inventory[k]) > 0)) { showToast("还有可用资金、种子或作物，先经营一下吧"); return; }
    setSeeds(s => ({ ...s, radish: 3 }));
    setEconomy(e => ({ ...e, rescueDate: date }));
    showToast("顾送来 3 包萝卜种子，重新出发吧");
  };
  const actOnPlot = (index: number) => {
    if (!beginAction()) return;
    const t = eventTime() + timeShift;
    const plot = plots[index];
    const approach = plotApproach(index);
    moveTo(approach.x, approach.y);

    if (fertilizing) {
      if (!plot.crop) { showToast("先播种，再施肥"); return; }
      const need = CROP_META[plot.crop].growMs;
      if (plotGrowth(plot, t) >= need) { showToast("这株已经成熟，可以收获啦"); return; }
      if (plot.fertilized) { showToast("这轮已经施过肥啦"); return; }
      if (compost <= 0) { showToast("肥料不足，抓 4 只虫可制作 1 份"); return; }
      setCompost((c) => c - 1);
      setPlots((ps) => ps.map((p, i) => i === index ? { ...p, growMs: fertilizedGrowth(plotGrowth(p, t), need), lastSync: t, fertilized: true } : p));
      showToast("施肥完成 · 成长 +25%，收获为优质品");
      return;
    }

    if (!plot.crop) {
      if (CROP_META[selected].level > level) { showToast("等级不足，多收获就能解锁"); return; }
      if (seeds[selected] <= 0) {
        showToast("种子用完了，去小铺买一点吧");
        return;
      }
      const kind = selected;
      record("plant");
      setSeeds((s) => ({ ...s, [kind]: s[kind] - 1 }));
      setPlots((ps) =>
        ps.map((p, i) =>
          i === index
            ? { crop: kind, growMs: 0, lastSync: t, wetUntil: 0, plantedSeason: season, harvests: 0 }
            : p,
        ),
      );
      showToast(`种下了${CROP_ART[kind].label}，浇点水会长得更快`);
      return;
    }

    const kind = plot.crop;
    const need = CROP_META[kind].growMs;
    const g = plotGrowth(plot, t);

    if (g >= need) {
      collectHarvest([index], t);
      return;
    }

    if (t < plot.wetUntil) {
      const pct = Math.min(99, Math.floor((g / need) * 100));
      showToast(
        `${CROP_ART[kind].label} · 成长 ${pct}% · 还需 ${restLabel(remainingGrowthTime(need - g, plot.wetUntil - t))}`,
      );
      return;
    }

    if (water <= 0) {
      showToast("水壶空了，先去水池打水");
      return;
    }

    const result = waterFarmPlots(plots, water, t, wetDuration(economy.irrigation), [index]);
    setWater(result.water); setPlots(result.plots); record("water", result.ids.length);
    showToast(`浇水了，接下来长得很快 · 水壶还剩 ${result.water} 次`);
  };

  /** 去水池打水：走到岸边，把水壶灌满 */
  const fetchWater = () => {
    if (!beginAction()) return;
    moveTo(POND.approach.x, POND.approach.y);
    if (water >= waterCap) {
      showToast(`水壶是满的（${water}/${waterCap}）`);
      return;
    }
    setWater(waterCap);
    showToast(`打满水壶，能浇 ${waterCap} 块地`);
  };

  /** 点击房子：先走到门口，再进屋 */
  const enterHouse = () => {
    const travel = moveTo(HOUSE.door.x, HOUSE.door.y) ?? 0;
    if (houseTimer.current) clearTimeout(houseTimer.current);
    houseTimer.current = setTimeout(() => setHouseOpen(true), Math.max(180, travel + 50));
  };

  /** 睡到第二天早上 7 点：虚拟时间一起往前跳，作物跟着长 */
  const doSleep = () => {
    if (!beginAction()) return;
    const t = eventTime() + timeShift;
    const d = new Date(t);
    const target = new Date(t);
    if (d.getHours() >= WAKE_HOUR) target.setDate(target.getDate() + 1);
    target.setHours(WAKE_HOUR, 0, 0, 0);
    const jump = Math.max(MINUTE, target.getTime() - t);
    const next = t + jump;
    setTimeShift((s) => s + jump);
    setHouseOpen(false);
    const nextDay = Math.max(1, Math.floor((next - epoch) / DAY) + 1);
    showToast(`第 ${nextDay} 天 · 作物悄悄长高了，天色仍跟随本地时间`);
  };

  /** 抓虫小游戏结算：游戏时长也算进农场时间，作物自然长得更快（不再直接发金币，钱靠种地） */
  const finishBugGame = (score: number, jumpMs: number) => {
    if (settledGame.current === gameToken) return;
    settledGame.current = gameToken;
    const reward = compostReward(score);
    setCompost((c) => c + reward);
    setTimeShift((s) => s + jumpMs);
    const mins = Math.max(1, Math.round(jumpMs / MINUTE));
    showToast(`抓了 ${score} 只虫 · 肥料 +${reward} · 生长加速 ${mins} 分钟`);
  };

  const openBugGame = () => {
    setGameToken((t) => t + 1);
    setGameOpen(true);
  };


  const buy = (kind: CropKind) => {
    if (!beginAction()) return;
    if (level < CROP_META[kind].level) { showToast("等级不足，收获作物可升级"); return; }
    const price = CROP_META[kind].price * qty;
    if (coins < price) {
      showToast("金币不够，去手账卖点库存或交订单吧");
      return;
    }
    setCoins((c) => c - price);
    setSeeds((s) => ({ ...s, [kind]: s[kind] + qty }));
    showToast(`买到了 ${qty} 包${CROP_ART[kind].label}种子`);
  };

  const harvestAll = () => {
    if (!beginAction()) return;
    const t = eventTime() + timeShift;
    const ready = plots.map((p, i) => p.crop && plotGrowth(p, t) >= CROP_META[p.crop].growMs ? i : -1).filter((i) => i >= 0);
    if (ready.length) collectHarvest(ready, t);
    else showToast("还没有成熟作物，再等一会儿吧");
  };
  const waterAll = () => {
    if (!beginAction()) return;
    const t = eventTime() + timeShift;
    const result = waterFarmPlots(plots, water, t, wetDuration(economy.irrigation));
    const dry = result.ids;
    if (dry.length) { setWater(result.water); setPlots(result.plots); record("water", dry.length); }
    setJournalOpen(false);
    showToast(dry.length ? `照料了 ${dry.length} 块田地 · 按田地顺序浇水` : water <= 0 ? "水壶空了，先去水池打水" : "作物都已湿润，或还没有需要浇水的作物");
  };
  const claimDaily = (kind: FarmActivity) => {
    if (!beginAction()) return;
    const result = claimGoal(journal, kind, eventTime());
    setJournal(result.journal);
    if (result.reward) { setCoins((c) => c + result.reward); setCompost((c) => c + 1); }
  };
  const upgradeCan = () => {
    if (!beginAction()) return;
    if (canUpgrade >= 3 || level < canUpgrade + 2 || coins < upgradeCost(canUpgrade)) { showToast("尚未满足水壶升级条件"); return; }
    setCoins((c) => c - upgradeCost(canUpgrade));
    setCanUpgrade((u) => u + 1);
  };

  const openTalk = (who: Speaker, position?: { x: number; y: number }) => {
    residents.interact(who);
    const at = position ?? RESIDENT_PLACEMENTS[who].home;
    moveTo(at.x - 14, at.y + 3);
    setSpeaker(who);
    setDraft("");
    setChatOffline(!apiKey);
    // 第一次搭话先给一句本地招呼，不让人干等
    setThreads((prev) =>
      prev[who].length
        ? prev
        : {
            ...prev,
            [who]: [
              {
                id: chatId(),
                role: "assistant",
                text: fallbackLine(who, { day, coins, growing, harvested }),
              },
            ],
          },
    );
  };

  const closePersonalChat = () => { personalRequest.current?.abort(); setSpeaker(null); Keyboard.dismiss(); };

  const sendChat = async (raw: string) => {
    const text = raw.trim(); const who = speaker;
    if (!text || !who || chatBusy || personalRequest.current) return;
    const request = new AbortController(); personalRequest.current = request;
    const mine: FarmChatMsg = { id: chatId(), role: "user", text };
    const history = [...threads[who], mine];
    setThreads(prev => ({ ...prev, [who]: [...prev[who], mine].slice(-40) }));
    setDraft(""); setChatBusy(true);
    let reply = ""; let action: NpcAction | null = null;
    try {
      if (!apiKey) {
        action = localNpcCommand(text, who);
        reply = action ? "好呀，我来安排。" : fallbackLine(who, { day, coins, growing, harvested });
        setChatOffline(true);
      } else {
        const rawReply = await farmChat([
          { role: "system", content: farmSystemPrompt(who, { day, season: seasonName, coins, growing, harvested }) + "\n" + NPC_ACTION_SCHEMA },
          ...history.slice(-8).map(m => ({ role: m.role, content: m.text })),
        ], apiKey, { timeoutMs: 16000, maxTokens: 480, signal: request.signal });
        if (request.signal.aborted) return;
        const parsed = parseNpcReply(rawReply);
        if (parsed) { reply = parsed.reply; action = parsed.action; }
        else { reply = /^[\s]*[\[{]/.test(rawReply) ? "我刚才没想明白，这次先不忙做事。" : rawReply.trim().slice(0,140); action = null; }
        setChatOffline(false);
      }
    } catch {
      if (request.signal.aborted) return;
      reply = fallbackLine(who, { day, coins, growing, harvested }); action = null; setChatOffline(true);
    } finally {
      if (personalRequest.current === request) { personalRequest.current = null; setChatBusy(false); }
    }
    if (request.signal.aborted) return;
    if (action) { const result = residents.command(who, action); if (!result.ok) reply = result.message; }
    setThreads(prev => ({ ...prev, [who]: [...prev[who], { id: chatId(), role: "assistant" as const, text: reply || "我在这里陪着你。" }].slice(-40) }));
  };

  const speakerMeta = SPEAKER_META[speaker ?? "gu"];
  const speakerName = speakerMeta.name;
  const speakerSub = speakerMeta.sub;

  return (
    <View style={{ flex: 1, backgroundColor: "#F5EDD8" }}>
      <StatusBar style="dark" />

      <View style={{ paddingTop: insets.top + 6, paddingBottom: 8, paddingHorizontal: 12, gap: 7, backgroundColor: '#F5EDD8', borderBottomWidth: 2, borderColor: '#D5B88D' }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <FarmButton onPress={() => router.back()} tone="paper" style={{ width: 44, paddingHorizontal: 0 }}><Ionicons name="chevron-back" size={18} color="#76583B" /></FarmButton>
          <View style={{ flex: 1 }}><Text variant="title" style={{ letterSpacing: .6 }}>doordoor · 农场</Text>
            <Text style={{ color: '#86745A', fontSize: 10, marginTop: 3 }}>{`Lv.${level} · 第 ${day} 天 · ${seasonName} · ${clock} ${night ? '夜晚' : '白天'}`}</Text></View>
        </View>
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <View accessibilityLabel={`金币 ${coins}`} style={{ flex: 1, minHeight: 38, justifyContent: 'center', alignItems: 'center', flexDirection: 'row', gap: 7 }}><FarmFrame /><View style={{ width: 12, height: 12, borderWidth: 2, borderColor: '#B48236', backgroundColor: '#E9C163' }} /><Text style={{ color: '#76572E', fontWeight: '800', fontSize: 13 }}>{coins}</Text><Text style={{ color: '#8B7352', fontSize: 10 }}>金币</Text></View>
          <FarmButton onPress={fetchWater} tone="blue" style={{ flex: 1, minHeight: 38, paddingVertical: 7, flexDirection: 'row', gap: 6 }}><Ionicons name="water" size={13} color="#537F91" /><Text style={{ color: '#426B7A', fontSize: 12, fontWeight: '700' }}>{water}/{waterCap}</Text><Text style={{ color: '#608494', fontSize: 10 }}>打水</Text></FarmButton>
        </View>
      </View>

      {/* ---------- 场景 ---------- */}
      {/* 贴图自身含完整天空（含太阳/月亮/星空），天空延展也画进了贴图，这里不再有代码画的天空 */}
      <ScrollView
        showsVerticalScrollIndicator={false}
        bounces={false}
        contentContainerStyle={{ flexGrow: 1, justifyContent: "center", alignItems: "center" }}
        style={{
          flex: 1,
          overflow: "hidden",
          // 贴图还没挂之前先铺夜色：上一屏是深色夜空，这样过渡过去不会闪一块亮蓝
          backgroundColor: !texReady || night ? SCENE_FRAME.night : SCENE_FRAME.day,
        }}
      >

        {/* 场景贴底：贴图自己带完整天空，高于容器时从顶部裁掉多余的天空 */}
        <View style={{ width: sceneW, height: sceneH, overflow: "hidden", flexShrink: 0 }}>
          {texReady ? (
            <>
              <Animated.View style={[StyleSheet.absoluteFill, dayLayerStyle]}>
                <Image
                  source={require("../../assets/images/farm-day-v3.png")}
                  style={{ width: sceneW, height: sceneH }}
                  resizeMode="stretch"
                  fadeDuration={0}
                />
              </Animated.View>
              <Animated.View style={[StyleSheet.absoluteFill, nightLayerStyle]}>
                <Image
                  source={require("../../assets/images/farm-night-v3.png")}
                  style={{ width: sceneW, height: sceneH }}
                  resizeMode="stretch"
                  fadeDuration={0}
                />
              </Animated.View>
            </>
          ) : null}
          {texReady ? <FarmSceneFacilities scale={scale} decorReady={decorReady} dayStyle={dayLayerStyle} nightStyle={nightLayerStyle} /> : null}
          {decorReady && texReady ? <FarmWater scale={scale} night={night} /> : null}
          <Svg
            pointerEvents="none"
            width={sceneW}
            height={sceneH}
            viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
            style={{ position: "absolute", left: 0, top: 0 }}
          >
            {/* 田地：土壤已烘焙进背景，这里画作物、成长进度与浇水状态 */}
            {plots.map((p, i) => {
              const pos = plotPos(i);
              const stage = plotStage(p, vNow);
              const wet = isWet(p, vNow);
              const ratio = p.crop
                ? Math.min(1, grown[i] / CROP_META[p.crop].growMs)
                : 0;
              return (
                <G key={i}>
                  {wet ? (
                    <Rect
                      x={pos.x}
                      y={pos.y}
                      width={pos.w}
                      height={pos.h}
                      fill="#241209"
                      opacity="0.32"
                    />
                  ) : null}

                  {p.crop && stage < 2 ? (
                    <>
                      <Rect
                        x={pos.x}
                        y={pos.y - 2.4}
                        width={pos.w}
                        height="1"
                        fill="#F5EDD8"
                        opacity="0.42"
                      />
                      <Rect
                        x={pos.x}
                        y={pos.y - 2.4}
                        width={Math.max(0.6, pos.w * ratio)}
                        height="1"
                        fill={wet ? "#7ED957" : "#D7C58A"}
                      />
                    </>
                  ) : null}
                  {wet ? (
                    <Rect
                      x={pos.x + pos.w - 3.2}
                      y={pos.y + 0.8}
                      width="1.6"
                      height="2.6"
                      fill="#557F98"
                      opacity="0.9"
                    />
                  ) : null}
                  {stage >= 2 ? (
                    <>
                      <Rect
                        x={pos.x + 15}
                        y={pos.y + 3}
                        width="1"
                        height="1"
                        fill="#FFF6C9"
                      />
                      <Rect
                        x={pos.x + 3}
                        y={pos.y + 6}
                        width="1"
                        height="1"
                        fill="#FFF6C9"
                        opacity="0.8"
                      />
                    </>
                  ) : null}
                </G>
              );
            })}
          </Svg>

          {plots.map((p, i) => {
            if (!p.crop) return null;
            const pos = plotPos(i);
            return <View key={i} pointerEvents="none" style={{ position: "absolute", left: (pos.x + 0.5) * scale, top: (pos.y - 3) * scale, zIndex: Math.round(pos.y + pos.h) }}>
              <CropSprite kind={p.crop} stage={plotStage(p, vNow)} size={14.5 * scale} />
              {p.fertilized ? <Text style={{ position: "absolute", right: 0, top: 0, color: "#FFF4A6", fontSize: 7 * scale }}>✦</Text> : null}
            </View>;
          })}

          {/* 空气里缓慢浮动的光点 */}
          {decorReady
            ? MOTES.map((m) => (
                <Mote
                  key={m.id}
                  x={m.x}
                  y={m.y}
                  dur={m.dur}
                  delay={m.delay}
                  size={m.size}
                  scale={scale}
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
              const { locationX, locationY } = e.nativeEvent;
              moveTo(locationX / scale, locationY / scale);
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

          {/* 水池：轻点打水 */}
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
          <View
            pointerEvents="none"
            style={{
              position: "absolute",
              left: (POND.x + POND.w / 2 - 20) * scale,
              top: (POND.y - 6) * scale,
              zIndex: POND.footY + 2,
            }}
          >
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                borderRadius: 3,
                paddingHorizontal: 7,
                paddingVertical: 3,
                backgroundColor: "rgba(14,26,18,0.66)",
                borderWidth: 1,
                borderColor: "rgba(94,200,242,0.28)",
              }}
            >
              <Ionicons name="water" size={9} color="#47798F" />
              <Text
                style={{
                  marginLeft: 4,
                  color: "rgba(246,238,220,0.86)",
                  fontSize: 8.5,
                  fontWeight: "700",
                  fontFamily: PIXEL_FONT,
                }}
              >
                打水
              </Text>
            </View>
          </View>

          <Pressable accessibilityRole="button" accessibilityLabel="农场小铺" onPress={() => { moveTo(MARKET.approach.x, MARKET.approach.y); setShopOpen(true); }}
            style={{ position: "absolute", left: MARKET.x * scale, top: MARKET.y * scale, width: MARKET.w * scale, height: MARKET.h * scale, zIndex: MARKET.footY }} />
          <Pressable accessibilityRole="button" accessibilityLabel="鸡窝" onPress={() => { moveTo(COOP.approach.x, COOP.approach.y); showToast("坤坤的小窝，铺着暖暖的稻草"); }}
            style={{ position: "absolute", left: COOP.x * scale, top: COOP.y * scale, width: COOP.w * scale, height: COOP.h * scale, zIndex: COOP.footY }} />

          {folkReady ? <FarmLifeLayer scale={scale} controller={residents} hasApiKey={Boolean(apiKey)} at={now}
            panelOpen={lifeOpen} onClosePanel={() => setLifeOpen(false)} onTalk={openTalk} /> : null}


          {/* 玩家 */}
          <Animated.View
            pointerEvents="none"
            style={[
              { position: "absolute", left: 0, top: 0, zIndex: 6 },
              playerStyle,
            ]}
          >
            <NameTag label="你" accent="#9E7338" scale={scale} hit center={7} />
            <View
              style={{
                position: "absolute",
                left: 2 * scale,
                top: 19 * scale,
                width: 10 * scale,
                height: 2 * scale,
                borderRadius: 99,
                backgroundColor: "rgba(0,0,0,0.18)",
              }}
            />
            <Animated.View style={playerFacingStyle}><FarmPersonSprite who="hero" activity={playerMoving ? "walk" : "idle"} size={20 * scale} active={focused} positionX={px} positionY={py} walkSpeed={1000 / 18} /></Animated.View>
          </Animated.View>

          {/* 提示 */}
          {toast ? (
            <Animated.View
              key={toast.id}
              entering={FadeInDown.springify()}
              exiting={FadeOut.duration(160)}
              pointerEvents="none"
              style={{
                position: "absolute",
                left: 0,
                right: 0,
                bottom: 10,
                zIndex: 1000,
                alignItems: "center",
              }}
            >
              <View
                style={{
                  maxWidth: sceneW - 24,
                  borderRadius: 3,
                  paddingHorizontal: 14,
                  paddingVertical: 7,
                  backgroundColor: "#FFF4DE",
                  borderWidth: 1,
                  borderColor: "rgba(246,238,220,0.16)",
                }}
              >
                <Text style={{ color: "#59432E", fontSize: 11.5 }}>
                  {toast.text}
                </Text>
              </View>
            </Animated.View>
          ) : null}
        </View>
      </ScrollView>

      <View style={{ paddingHorizontal: 10, paddingTop: 8, paddingBottom: insets.bottom + 8, gap: 7, borderTopWidth: 2, borderColor: '#CBB38B', backgroundColor: '#F5EDD8' }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <Text style={{ flex: 1, color: '#877358', fontSize: 10, lineHeight: 16 }}>{loadFailed ? '存档读取失败，请退出农场重进' : saveError ? '保存失败，请保持应用开启' : fertilizing ? '施肥模式 · 轻点未成熟作物' : '横滑选种 · 手账出售 · 水池打水'}</Text>
          <FarmButton label="居民生活" tone="rose" onPress={() => setLifeOpen(true)} style={{ minHeight: 36, paddingVertical: 8 }} />
        </View>
        <ScrollView horizontal style={{ flexGrow: 0 }} showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 7 }}>
          {CROP_KINDS.map(kind => <FarmButton key={kind} onPress={() => setSelected(kind)} tone={selected === kind ? 'sage' : 'paper'} style={{ minWidth: 116, minHeight: 49, flexDirection: 'row', gap: 5, paddingHorizontal: 13 }}>
            <CropSprite kind={kind} size={26} /><View><Text style={{ color: '#655035', fontWeight: '700', fontSize: 11 }}>{CROP_ART[kind].label}</Text><Text style={{ color: '#8A785B', fontSize: 10 }}>{level < CROP_META[kind].level ? 'Lv.' + CROP_META[kind].level + ' 解锁' : '种子 ×' + seeds[kind]}</Text></View>
          </FarmButton>)}
        </ScrollView>
        <View style={{ flexDirection: 'row', gap: 7 }}>
          <FarmButton label="小铺" tone="paper" onPress={() => setShopOpen(true)} style={{ flex: 1 }} />
          <FarmButton onPress={() => setJournalOpen(true)} tone="sage" style={{ flex: 1.3, flexDirection: 'row', gap: 3, paddingHorizontal: 10 }}><FarmToolSprite kind={fertilizing ? 'compost' : 'seed'} size={22} /><Text style={{ color: '#5B6340', fontSize: 11, fontWeight: '700' }}>{fertilizing ? '施肥中' : `手账 Lv.${level}`}</Text></FarmButton>
          <FarmButton label="抓虫小游戏" tone="rose" onPress={openBugGame} style={{ flex: 1.3, paddingHorizontal: 10 }} />
        </View>
      </View>

      {/* ---------- 小铺 ---------- */}
      <FarmJournalPanel visible={journalOpen} onClose={() => setJournalOpen(false)}
        harvested={harvested} coins={coins} upgrade={canUpgrade} compost={compost}
        journal={restoreJournal(journal, now)} fertilizing={fertilizing}
        onClaim={claimDaily} onUpgrade={upgradeCan} onHarvestAll={harvestAll} onWaterAll={waterAll}
        onFertilize={() => { setFertilizing((v) => !v); setJournalOpen(false); }} >
        <FarmEconomyPanel economy={economy} coins={coins} level={level} season={season} at={now}
          onSell={sellStock} onOrder={deliverOrder} onCraft={makeRecipe} onKitchen={buildKitchen} onRescue={rescueSeeds} onIrrigation={improveIrrigation} />
      </FarmJournalPanel>
      <Modal
        visible={shopOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setShopOpen(false)}
      >
        <View style={{ flex: 1, justifyContent: "flex-end" }}>
          <Pressable
            style={{
              position: "absolute",
              left: 0,
              right: 0,
              top: 0,
              bottom: 0,
              backgroundColor: "rgba(0,0,0,0.45)",
            }}
            onPress={() => setShopOpen(false)}
          />
          <Animated.View entering={FadeInDown.springify()}>
            <View
              style={{
                backgroundColor: "#FAF2DF",
                borderRadius: 3,
                paddingHorizontal: 18,
                paddingTop: 16,
                paddingBottom: insets.bottom + 18,
                maxHeight: height * 0.82,
                borderTopWidth: 1,
                borderColor: "#DECFAF",
              }}
            >
              <FarmPaper theme="shop" />
              <View
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  justifyContent: "space-between",
                  marginBottom: 8,
                }}
              >
                <View>
                  <Text variant="title"
                    style={{
                      color: "#59432E",
                      fontSize: 15,
                      fontWeight: "800",
                      letterSpacing: 1,
                    }}
                  >
                    doordoor 小铺
                  </Text>
                  <Text
                    style={{
                      color: "#8A785E",
                      fontSize: 10,
                      marginTop: 2,
                    }}
                  >
                    顾说种子随便挑，收成归你
                  </Text>
                </View>
                <Pressable onPress={() => setShopOpen(false)}>
                  <Ionicons name="close" size={18} color="#8FA08F" />
                </Pressable>
              </View>

              {/* 买几包 */}
              <View
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  gap: 6,
                  marginBottom: 4,
                }}
              >
                <Text
                  style={{
                    color: "#8A785E",
                    fontSize: 10,
                    marginRight: 2,
                  }}
                >
                  数量
                </Text>
                {[1, 5, 10].map((n) => {
                  const on = qty === n;
                  return (
                    <Pressable
                      key={n}
                      onPress={() => setQty(n)}
                      style={{
                        paddingHorizontal: 10,
                        paddingVertical: 5,
                        borderRadius: 3,
                        borderWidth: 1,
                        borderColor: on
                          ? "rgba(143,209,79,0.6)"
                          : "#DECFAF",
                        backgroundColor: on
                          ? "rgba(143,209,79,0.16)"
                          : "#F5ECD8",
                      }}
                    >
                      <Text
                        style={{
                          fontSize: 10.5,
                          fontWeight: "700",
                          color: on ? "#5F7749" : "#8A785E",
                        }}
                      >
                        {`×${n}`}
                      </Text>
                    </Pressable>
                  );
                })}
                <Text
                  style={{
                    flex: 1,
                    textAlign: "right",
                    color: "#8A785E",
                    fontSize: 10,
                  }}
                >
                  {`持有 ${coins} 金币`}
                </Text>
              </View>

              <ScrollView showsVerticalScrollIndicator={false}>
              {CROP_KINDS.map((kind) => (
                <View
                  key={kind}
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    paddingVertical: 10,
                    borderTopWidth: 1,
                    borderColor: "#F1E5CC",
                  }}
                >
                  <View style={{ width: 32, height: 32 }}>
                    <CropSprite kind={kind} size={32} />
                  </View>
                  <View style={{ flex: 1, marginLeft: 10 }}>
                    <Text
                      style={{
                        color: "#59432E",
                        fontSize: 13,
                        fontWeight: "700",
                      }}
                    >
                      {CROP_ART[kind].label}种子 · Lv.{CROP_META[kind].level}
                    </Text>
                    <Text
                      style={{
                        color: "#8A785E",
                        fontSize: 10,
                        marginTop: 2,
                      }}
                    >
                      {CROP_META[kind].price + " 金币/包 · 基础单价 " + CROP_META[kind].sell + " · " + CROP_META[kind].growMs / MINUTE + " 分钟 · " + CROP_META[kind].rounds + " 轮"}
                    </Text>
                  </View>
                  <Pressable
                    disabled={level < CROP_META[kind].level || coins < CROP_META[kind].price * qty}
                    onPress={() => buy(kind)}
                    style={{
                      borderRadius: 3,
                      paddingHorizontal: 12,
                      paddingVertical: 7,
                      backgroundColor:
                        level >= CROP_META[kind].level && coins >= CROP_META[kind].price * qty
                          ? "#A4B887"
                          : "#DECFAF",
                    }}
                  >
                    <Text
                      style={{
                        fontSize: 11.5,
                        fontWeight: "800",
                        color:
                          level >= CROP_META[kind].level && coins >= CROP_META[kind].price * qty
                            ? "#435532"
                            : "#8A785E",
                      }}
                    >
                      {level < CROP_META[kind].level ? "Lv." + CROP_META[kind].level + " 解锁" : "买入 ×" + qty + " · " + CROP_META[kind].price * qty}
                    </Text>
                  </Pressable>
                </View>
              ))}
              </ScrollView>
            </View>
          </Animated.View>
        </View>
      </Modal>

      {/* ---------- 对话 ---------- */}
      <Modal
        visible={speaker !== null}
        transparent
        animationType="fade"
        onRequestClose={() => {
          closePersonalChat();
          Keyboard.dismiss();
        }}
      >
        <View style={{ flex: 1, justifyContent: "flex-end", paddingBottom: kbH }}>
          <Pressable
            style={{
              position: "absolute",
              left: 0,
              right: 0,
              top: 0,
              bottom: 0,
              backgroundColor: "rgba(0,0,0,0.45)",
            }}
            onPress={() => {
              closePersonalChat();
              Keyboard.dismiss();
            }}
          />
          <Animated.View entering={FadeInDown.springify()}>
            <View
              style={{
                margin: 10,
                borderRadius: 3,
                backgroundColor: "#FAF2DF",
                borderWidth: 1,
                borderColor: "#DECFAF",
                overflow: "hidden",
              }}
            >
              <FarmPaper theme="chat" />
              <View
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  paddingHorizontal: 14,
                  paddingTop: 12,
                  paddingBottom: 10,
                  borderBottomWidth: 1,
                  borderBottomColor: "#F1E5CC",
                }}
              >
                <View
                  style={{
                    width: 42,
                    height: 54,
                    alignItems: "center",
                    justifyContent: "center",
                    borderRadius: 3,
                    backgroundColor: "#F5ECD8",
                  }}
                >
                  <FarmPersonSprite who={speaker ?? "gu"} size={36} />
                </View>
                <View style={{ marginLeft: 10, flex: 1 }}>
                  <View style={{ flexDirection: "row", alignItems: "center" }}>
                    <Text variant="title"
                      style={{
                        color: "#59432E",
                        fontSize: 14,
                        fontWeight: "800",
                        letterSpacing: 1,
                      }}
                    >
                      {speakerName} · 我的聊天
                    </Text>
                    <View
                      style={{
                        marginLeft: 7,
                        paddingHorizontal: 6,
                        paddingVertical: 1.5,
                        borderRadius: 99,
                        backgroundColor: chatOffline
                          ? "#F1E5CC"
                          : "rgba(143,209,79,0.16)",
                      }}
                    >
                      <Text
                        style={{
                          color: chatOffline
                            ? "#8A785E"
                            : "#5F7749",
                          fontSize: 8.5,
                          fontWeight: "700",
                        }}
                      >
                        {chatOffline ? "本地台词" : "在线"}
                      </Text>
                    </View>
                  </View>
                  <Text
                    style={{
                      color: "#8A785E",
                      fontSize: 10,
                      marginTop: 3,
                    }}
                  >
                    {speakerSub}
                  </Text>
                </View>
                <Pressable
                  onPress={() => {
                    closePersonalChat();
                    Keyboard.dismiss();
                  }}
                  hitSlop={8}
                  style={{
                    width: 28,
                    height: 28,
                    borderRadius: 3,
                    alignItems: "center",
                    justifyContent: "center",
                    backgroundColor: "#F5ECD8",
                  }}
                >
                  <Ionicons name="close" size={16} color="#8FA08F" />
                </Pressable>
              </View>

              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                keyboardShouldPersistTaps="handled"
                contentContainerStyle={{
                  gap: 7,
                  paddingHorizontal: 14,
                  paddingVertical: 9,
                }}
              >
                {TALK_TOPICS[speaker ?? "gu"].map((topic) => (
                  <Pressable
                    key={topic}
                    disabled={chatBusy}
                    onPress={() => {
                      void sendChat(topic);
                    }}
                    style={{
                      paddingHorizontal: 11,
                      paddingVertical: 6,
                      borderRadius: 99,
                      borderWidth: 1,
                      borderColor: "#D7C6A6",
                      backgroundColor: "#F5ECD8",
                      opacity: chatBusy ? 0.45 : 1,
                    }}
                  >
                    <Text
                      style={{
                        color: "#6B573E",
                        fontSize: 10.5,
                      }}
                    >
                      {topic}
                    </Text>
                  </Pressable>
                ))}
              </ScrollView>

              <ScrollView
                ref={chatRef}
                style={{ maxHeight: chatMaxH }}
                contentContainerStyle={{
                  paddingHorizontal: 14,
                  paddingBottom: 10,
                  gap: 8,
                }}
                keyboardShouldPersistTaps="handled"
                onContentSizeChange={() =>
                  chatRef.current?.scrollToEnd({ animated: true })
                }
              >
                {threads[speaker ?? "gu"].map((m) => (
                  <View
                    key={m.id}
                    style={{
                      alignItems:
                        m.role === "user" ? "flex-end" : "flex-start",
                    }}
                  >
                    <View
                      style={{
                        maxWidth: "84%",
                        borderRadius: 4,
                        paddingHorizontal: 11,
                        paddingVertical: 8,
                        borderWidth: 1,
                        borderColor: m.role === "user" ? "#AEB98D" : "#DFC1B3",
                        backgroundColor:
                          m.role === "user"
                            ? "#E2E8CC"
                            : "#FFF8EB",
                      }}
                    >
                      <Text
                        style={{
                          color: m.role === "user" ? "#435532" : "#59432E",
                          fontSize: 13,
                          lineHeight: 20,
                        }}
                      >
                        {m.text}
                      </Text>
                    </View>
                  </View>
                ))}

                {chatBusy ? (
                  <View style={{ alignItems: "flex-start" }}>
                    <View
                      style={{
                        borderRadius: 15,
                        borderTopLeftRadius: 5,
                        paddingHorizontal: 11,
                        paddingVertical: 8,
                        borderWidth: 1,
                        borderColor: "#DECFAF",
                        backgroundColor: "#F2E7CF",
                      }}
                    >
                      <Text
                        style={{
                          color: "#8A785E",
                          fontSize: 12,
                        }}
                      >
                        正在想…
                      </Text>
                    </View>
                  </View>
                ) : null}
              </ScrollView>

              {chatOffline ? (
                <Text
                  style={{
                    paddingHorizontal: 14,
                    paddingBottom: 2,
                    color: "#8A785E",
                    fontSize: 9.5,
                  }}
                >
                  {apiKey
                    ? "本轮由本地对白陪你，聊天仍可继续"
                    : "当前使用本地对白，可在设置中开启 AI 聊天"}
                </Text>
              ) : null}

              <View
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  gap: 8,
                  paddingHorizontal: 12,
                  paddingTop: 8,
                  paddingBottom: 12,
                  borderTopWidth: 1,
                  borderTopColor: "#F1E5CC",
                  backgroundColor: "#F0E5CC",
                }}
              >
                <TextInput
                  value={draft}
                  onChangeText={setDraft}
                  placeholder={`和${speakerName}聊天，或请他打水、浇地…`}
                  placeholderTextColor="#9A896C"
                  style={{
                    fontFamily: FARM_BODY_FONT,
                    flex: 1,
                    height: 42,
                    borderRadius: 3,
                    paddingHorizontal: 12,
                    color: "#59432E",
                    fontSize: 13,
                    backgroundColor: "#F5ECD8",
                    borderWidth: 1,
                    borderColor: "#DECFAF",
                  }}
                  maxLength={200}
                  returnKeyType="send"
                  editable={!chatBusy}
                  onSubmitEditing={() => {
                    void sendChat(draft);
                  }}
                />
                <Pressable
                  onPress={() => {
                    void sendChat(draft);
                  }}
                  disabled={!draft.trim() || chatBusy}
                  style={{
                    width: 42,
                    height: 42,
                    borderRadius: 3,
                    alignItems: "center",
                    justifyContent: "center",
                    backgroundColor:
                      !draft.trim() || chatBusy
                        ? "rgba(143,209,79,0.22)"
                        : "#A4B887",
                  }}
                >
                  <Ionicons
                    name="arrow-up"
                    size={18}
                    color={
                      !draft.trim() || chatBusy
                        ? "rgba(21,42,18,0.45)"
                        : "#435532"
                    }
                  />
                </Pressable>
              </View>
            </View>
          </Animated.View>
        </View>
      </Modal>

      {/* ---------- 小屋：进屋点床睡觉 ---------- */}
      <HouseInterior
        visible={houseOpen}
        night={night}
        day={day}
        clock={clock}
        onClose={() => setHouseOpen(false)}
        onSleep={doSleep}
      />

      {/* ---------- 抓虫小游戏 ---------- */}
      <BugGame
        key={gameToken}
        visible={gameOpen}
        onClose={() => setGameOpen(false)}
        onFinish={finishBugGame}
      />

      <Animated.View
        pointerEvents="none"
        entering={FadeIn.duration(400)}
        style={{ position: "absolute", left: 0, right: 0, top: 0, bottom: 0 }}
      />
    </View>
  );
}
