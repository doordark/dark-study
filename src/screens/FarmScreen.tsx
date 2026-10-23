/* eslint-disable react-hooks/immutability --
   Reanimated 共享值（px/py/face 等）本质是跨渲染、跨线程可变的容器，
   在事件回调与 effect 中赋值是官方标准用法，React 编译器的不可变假设不适用 */

import { Ionicons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useRouter } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  Keyboard,
  Modal,
  Image,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  useWindowDimensions,
  type ScrollViewInstance,
} from "react-native";
import Animated, {
  Easing,
  FadeIn,
  FadeInDown,
  FadeOut,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withTiming,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Svg, { G, Rect } from "react-native-svg";

import {
  CROP_ART,
  CROP_STAGE_ROWS,
  DOOR_PALETTE,
  DOOR_ROWS,
  GU_PALETTE,
  GU_ROWS,
  HERO_PALETTE,
  HERO_ROWS,
  PixelSprite,
  PROP_ART,
  WEIGANG_PALETTE,
  WEIGANG_ROWS,
  XIAOBA_PALETTE,
  XIAOBA_ROWS,
  YUJIE_PALETTE,
  YUJIE_ROWS,
  cropRects,
  type CropKind,
} from "@/components/farm/sprites";
import { BugGame } from "@/components/farm/BugGame";
import { HouseInterior } from "@/components/farm/HouseInterior";
import { chat } from "@/services/deepseek";
import { useSettings } from "@/store/useSettings";

/* -------------------------------------------------------------------------- */
/*  场景几何（虚拟像素坐标，最终按屏宽等比缩放）                                 */
/* -------------------------------------------------------------------------- */

const VIEW_W = 200;
const VIEW_H = 170;

/* 九块田地：坐标对齐背景里烘焙好的土壤格 */
const PLOT_X = 64;
const PLOT_Y = 105;
const PLOT_W = 20;
const PLOT_H = 13.5;
const PLOT_GAP_X = 2;
const PLOT_GAP_Y = 2;
const PLOT_COUNT = 9;

const PLAYER_START = { x: 50, y: 101 };
/** 顾：田地右侧的草坪 */
const GU_AT = { x: 146, y: 104 };
/** door：屋前小路左侧 */
const DOOR_AT = { x: 26, y: 101 };
/** 小鸡坤坤：鸡窝前 */
const CHICKEN_AT = { x: 156, y: 146 };
/** 三个儿子：池塘边与草地上散开站着 */
const XIAOBA_AT = { x: 4, y: 112 };
const YUJIE_AT = { x: 18, y: 148 };
const WEIGANG_AT = { x: 44, y: 146 };
/** 跟儿子们聊天时玩家站的位置（池塘与田地之间的草地） */
const SONS_SPOT = { x: 31, y: 143 };

/** 房子所占区域：轻点即进屋睡觉 */
const HOUSE_RECT = { x: 3, y: 42, w: 78, h: 56 };

const SAVE_KEY = "dark-study-farm";

function plotPos(i: number) {
  return {
    x: PLOT_X + (i % 3) * (PLOT_W + PLOT_GAP_X),
    y: PLOT_Y + Math.floor(i / 3) * (PLOT_H + PLOT_GAP_Y),
  };
}

const MINUTE = 60_000;
const DAY = 24 * MINUTE * 60;

/** 作物：种子价 / 售价 / 从种下到成熟所需的真实时间 */
const CROP_META: Record<
  CropKind,
  { price: number; sell: number; growMs: number }
> = {
  radish: { price: 20, sell: 55, growMs: 3 * MINUTE },
  berry: { price: 45, sell: 120, growMs: 7 * MINUTE },
  star: { price: 90, sell: 260, growMs: 14 * MINUTE },
};

/** 浇一次水保持湿润的时长：湿润期按真实时间 1:1 生长，干土只有 35% 速度 */
const WET_MS = 30 * MINUTE;
const DRY_RATE = 0.35;
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
}

interface SaveData {
  v: 2;
  /** 第 1 天 0 点对应的虚拟时间戳 */
  epoch: number;
  /** 睡觉 / 小游戏攒下的时间偏移 */
  timeShift: number;
  coins: number;
  seeds: Record<CropKind, number>;
  plots: PlotState[];
  harvested: number;
}

/** 兼容老存档的宽结构 */
interface RawSave {
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
  day?: number;
}

const emptyPlot = (at: number): PlotState => ({
  crop: null,
  growMs: 0,
  lastSync: at,
  wetUntil: 0,
});

/** 四季名（季节随天数轮换，只影响文案） */
const SEASONS = ["春", "夏", "秋", "冬"];

/** 白天/黑夜两张背景贴图上下边缘的精确色值，用来把场景外的天空填成同一片天色 */
const SKY_FILL = { day: "#6CBAF0", night: "#080C1E" };

/** 夜空延展区里的固定星光（只在黑夜显示） */
const SKY_STARS = [
  { id: 0, left: "8%", top: "18%", size: 2, o: 0.5 },
  { id: 1, left: "19%", top: "46%", size: 1.5, o: 0.34 },
  { id: 2, left: "27%", top: "12%", size: 2.5, o: 0.6 },
  { id: 3, left: "38%", top: "62%", size: 1.5, o: 0.28 },
  { id: 4, left: "46%", top: "28%", size: 2, o: 0.45 },
  { id: 5, left: "57%", top: "70%", size: 1.5, o: 0.3 },
  { id: 6, left: "64%", top: "16%", size: 2, o: 0.52 },
  { id: 7, left: "73%", top: "44%", size: 1.5, o: 0.32 },
  { id: 8, left: "81%", top: "24%", size: 2.5, o: 0.58 },
  { id: 9, left: "90%", top: "58%", size: 1.5, o: 0.3 },
  { id: 10, left: "13%", top: "78%", size: 2, o: 0.4 },
  { id: 11, left: "52%", top: "6%", size: 1.5, o: 0.36 },
];

const PIXEL_FONT = Platform.select({
  ios: "Courier",
  android: "monospace",
  default: "monospace",
});

/* -------------------------------------------------------------------------- */
/*  真实时间与作物生长                                                         */
/* -------------------------------------------------------------------------- */

function pad2(n: number) {
  return n < 10 ? `0${n}` : `${n}`;
}

function clockLabel(ts: number) {
  const d = new Date(ts);
  return `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

/** 19:00 到次日 6:00 算夜晚，场景跟着真实时间自动换 */
function isNightAt(ts: number) {
  const h = new Date(ts).getHours();
  return h >= 19 || h < 6;
}

function midnightOf(ts: number) {
  const d = new Date(ts);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

/** 累计生长：湿润期按 1:1 计，干土按 35% 慢慢长 */
function plotGrowth(p: PlotState, now: number) {
  if (!p.crop) return 0;
  if (now <= p.lastSync) return p.growMs;
  const wetEnd = Math.max(p.lastSync, p.wetUntil);
  const wet = Math.max(0, Math.min(now, wetEnd) - p.lastSync);
  const dry = Math.max(0, now - wetEnd);
  return p.growMs + wet + dry * DRY_RATE;
}

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
const SONS: {
  who: Speaker;
  label: string;
  accent: string;
  at: { x: number; y: number };
  rows: string[];
  palette: Record<string, string>;
}[] = [
  {
    who: "xiaoba",
    label: "小八",
    accent: "#A78BFA",
    at: XIAOBA_AT,
    rows: XIAOBA_ROWS,
    palette: XIAOBA_PALETTE,
  },
  {
    who: "yujie",
    label: "玉洁",
    accent: "#FB923C",
    at: YUJIE_AT,
    rows: YUJIE_ROWS,
    palette: YUJIE_PALETTE,
  },
  {
    who: "weigang",
    label: "唯纲",
    accent: "#D176D0",
    at: WEIGANG_AT,
    rows: WEIGANG_ROWS,
    palette: WEIGANG_PALETTE,
  },
];

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

const chatId = () => `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

/* -------------------------------------------------------------------------- */
/*  会轻轻呼吸的像素小人                                                       */
/* -------------------------------------------------------------------------- */

function IdleSprite({
  rows,
  palette,
  pixel,
  onPress,
}: {
  rows: string[];
  palette: Record<string, string>;
  pixel: number;
  onPress: () => void;
}) {
  const bob = useSharedValue(0);

  useEffect(() => {
    bob.value = withRepeat(
      withTiming(-1, { duration: 1400, easing: Easing.inOut(Easing.sin) }),
      -1,
      true,
    );
  }, [bob]);

  const style = useAnimatedStyle(() => ({
    transform: [{ translateY: bob.value * pixel }],
  }));

  return (
    <Pressable onPress={onPress} hitSlop={12}>
      <View>
        <View
          style={{
            position: "absolute",
            left: 4 * pixel,
            top: 16 * pixel,
            width: 8 * pixel,
            height: 2 * pixel,
            borderRadius: 99,
            backgroundColor: "rgba(0,0,0,0.18)",
          }}
        />
        <Animated.View style={style}>
          <PixelSprite rows={rows} palette={palette} pixel={pixel} />
        </Animated.View>
      </View>
    </Pressable>
  );
}

/* -------------------------------------------------------------------------- */
/*  空气里飘的光点                                                             */
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
    y: 92 + rnd() * 68,
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

/** 天空里慢慢飘过的云（只有白天出现） */
function Cloud({
  left,
  top,
  size,
  delay,
}: {
  left: number;
  top: number;
  size: number;
  delay: number;
}) {
  const v = useSharedValue(0);

  useEffect(() => {
    v.value = withDelay(
      delay,
      withRepeat(
        withTiming(1, { duration: 34_000, easing: Easing.linear }),
        -1,
        false,
      ),
    );
  }, [v, delay]);

  const style = useAnimatedStyle(() => ({
    transform: [{ translateX: (v.value - 0.5) * size * 1.2 }],
  }));

  return (
    <Animated.View
      pointerEvents="none"
      style={[
        {
          position: "absolute",
          left,
          top,
          width: size,
          height: size * 0.24,
          borderRadius: size,
          backgroundColor: "rgba(255,255,255,0.9)",
        },
        style,
      ]}
    >
      <View
        style={{
          position: "absolute",
          left: size * 0.16,
          top: -size * 0.11,
          width: size * 0.42,
          height: size * 0.24,
          borderRadius: size,
          backgroundColor: "rgba(255,255,255,0.9)",
        }}
      />
      <View
        style={{
          position: "absolute",
          left: size * 0.52,
          top: -size * 0.07,
          width: size * 0.3,
          height: size * 0.2,
          borderRadius: size,
          backgroundColor: "rgba(255,255,255,0.9)",
        }}
      />
    </Animated.View>
  );
}

/** NPC 头顶的小铭牌，提示这里可以对话 */
function NameTag({
  label,
  accent,
  scale,
  hit,
}: {
  label: string;
  accent: string;
  scale: number;
  hit: boolean;
}) {
  return (
    <View
      pointerEvents="none"
      style={{
        position: "absolute",
        top: -19,
        left: 8 * scale - 17,
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
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const apiKey = useSettings((s) => s.apiKey);

  const scale = width / VIEW_W;
  const sceneH = VIEW_H * scale;
  /** 聊天消息区高度：小屏 + 键盘弹起时不把面板顶出屏幕 */
  const chatMaxH = Math.max(150, Math.min(258, Math.round(height * 0.32)));

  const [loaded, setLoaded] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  /** 睡觉、小游戏攒出来的时间偏移：虚拟时间 = 真实时间 + 偏移 */
  const [timeShift, setTimeShift] = useState(0);
  /** 第 1 天 0 点对应的虚拟时间戳 */
  const [epoch, setEpoch] = useState(() => midnightOf(Date.now()));
  const [coins, setCoins] = useState(120);
  const [seeds, setSeeds] = useState<Record<CropKind, number>>({
    radish: 3,
    berry: 0,
    star: 0,
  });
  const [plots, setPlots] = useState<PlotState[]>(() =>
    Array.from({ length: PLOT_COUNT }, () => emptyPlot(Date.now())),
  );
  const [harvested, setHarvested] = useState(0);
  const [selected, setSelected] = useState<CropKind>("radish");

  const [houseOpen, setHouseOpen] = useState(false);
  const [gameOpen, setGameOpen] = useState(false);
  const [gameToken, setGameToken] = useState(0);
  const houseTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [toast, setToast] = useState<{ id: number; text: string } | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

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

  /* ---------------- 时间 / 昼夜 / 季节：全部由真实时间推导 ---------------- */
  const vNow = now + timeShift;
  const night = isNightAt(vNow);
  const day = Math.max(1, Math.floor((vNow - epoch) / DAY) + 1);
  const season = Math.floor((day - 1) / 7) % 4;
  const seasonName = SEASONS[season];

  /** 每块地的累计生长量（每次渲染按当前虚拟时间实时结算，不落库） */
  const grown = plots.map((p) => plotGrowth(p, vNow));
  const growing = plots.filter(
    (p, i) => p.crop && grown[i] < CROP_META[p.crop].growMs,
  ).length;

  // 每秒走一次表：作物进度、天色、时钟都靠它刷新
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  // 昼夜切换用一层透明渐变，不要硬切
  const nightV = useSharedValue(night ? 1 : 0);
  useEffect(() => {
    nightV.value = withTiming(night ? 1 : 0, { duration: 700 });
  }, [night, nightV]);
  const dayLayerStyle = useAnimatedStyle(() => ({
    opacity: 1 - nightV.value,
  }));
  const nightLayerStyle = useAnimatedStyle(() => ({ opacity: nightV.value }));


  /* ---------------- 玩家位置：UI 线程上平滑走动 ---------------- */
  const px = useSharedValue(PLAYER_START.x);
  const py = useSharedValue(PLAYER_START.y);
  const face = useSharedValue(1);

  const playerStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: px.value * scale },
      { translateY: py.value * scale },
      { scaleX: face.value },
    ],
  }));

  const moveTo = useCallback(
    (x: number, y: number) => {
      const targetX = Math.min(Math.max(x, 2), VIEW_W - 14);
      const targetY = Math.min(Math.max(y, 88), VIEW_H - 20);
      const dist = Math.hypot(targetX - px.value, targetY - py.value);
      face.value = targetX < px.value ? -1 : 1;
      const duration = Math.min(820, 180 + dist * 9);
      const cfg = { duration, easing: Easing.inOut(Easing.quad) };
      px.value = withTiming(targetX, cfg);
      py.value = withTiming(targetY, cfg);
    },
    [face, px, py],
  );

  const showToast = useCallback((text: string) => {
    setToast({ id: Date.now(), text });
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
          return;
        }
        const realNow = Date.now();
        const shift = typeof data.timeShift === "number" ? data.timeShift : 0;

        if (data.v === 2 && typeof data.epoch === "number") {
          setEpoch(data.epoch);
          setTimeShift(shift);
        } else {
          // 老存档只有天数：把第 1 天的 0 点倒推出来，作物进度按旧阶段换算
          const oldDay = Math.max(1, Number(data.day) || 1);
          setEpoch(midnightOf(realNow) - (oldDay - 1) * DAY);
          setTimeShift(0);
        }

        if (typeof data.coins === "number") setCoins(Math.max(0, data.coins));
        if (typeof data.harvested === "number") {
          setHarvested(Math.max(0, data.harvested));
        }
        if (data.seeds) {
          setSeeds({
            radish: Math.max(0, Number(data.seeds.radish) || 0),
            berry: Math.max(0, Number(data.seeds.berry) || 0),
            star: Math.max(0, Number(data.seeds.star) || 0),
          });
        }
        if (Array.isArray(data.plots) && data.plots.length === PLOT_COUNT) {
          const vNowNow = realNow + shift;
          setPlots(
            data.plots.map((p) => {
              const kind =
                p?.crop === "radish" ||
                p?.crop === "berry" ||
                p?.crop === "star"
                  ? p.crop
                  : null;
              if (!kind) return emptyPlot(vNowNow);
              const need = CROP_META[kind].growMs;
              // 新结构：直接恢复生长累计
              if (
                typeof p.growMs === "number" &&
                typeof p.lastSync === "number"
              ) {
                return {
                  crop: kind,
                  growMs: Math.min(need, Math.max(0, p.growMs)),
                  lastSync: Math.max(0, p.lastSync),
                  wetUntil: typeof p.wetUntil === "number" ? p.wetUntil : 0,
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
            }),
          );
        }
      })
      .catch(() => {})
      .finally(() => {
        if (alive) setLoaded(true);
      });
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    if (!loaded) return;
    const payload: SaveData = {
      v: 2,
      epoch,
      timeShift,
      coins,
      seeds,
      plots,
      harvested,
    };
    AsyncStorage.setItem(SAVE_KEY, JSON.stringify(payload)).catch(() => {});
  }, [loaded, epoch, timeShift, coins, seeds, plots, harvested]);

  /* ---------------- 操作 ---------------- */
  const actOnPlot = (index: number) => {
    const t = now + timeShift;
    const plot = plots[index];
    const pos = plotPos(index);
    moveTo(pos.x + 4, pos.y + PLOT_H - 14);

    if (!plot.crop) {
      if (seeds[selected] <= 0) {
        showToast("种子用完了，去小铺买一点吧");
        return;
      }
      const kind = selected;
      setSeeds((s) => ({ ...s, [kind]: s[kind] - 1 }));
      setPlots((ps) =>
        ps.map((p, i) =>
          i === index
            ? { crop: kind, growMs: 0, lastSync: t, wetUntil: 0 }
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
      const gain = CROP_META[kind].sell;
      setCoins((c) => c + gain);
      setHarvested((h) => h + 1);
      setPlots((ps) => ps.map((p, i) => (i === index ? emptyPlot(t) : p)));
      showToast(`收获${CROP_ART[kind].label} +${gain}`);
      return;
    }

    if (t < plot.wetUntil) {
      const pct = Math.min(99, Math.floor((g / need) * 100));
      showToast(
        `${CROP_ART[kind].label} · 成长 ${pct}% · 还需 ${restLabel(need - g)}`,
      );
      return;
    }

    setPlots((ps) =>
      ps.map((p, i) =>
        i === index
          ? { ...p, growMs: g, lastSync: t, wetUntil: t + WET_MS }
          : p,
      ),
    );
    showToast("浇水了，接下来半小时长得很快");
  };

  /** 点击房子：先走到门口，再进屋 */
  const enterHouse = () => {
    moveTo(46, 100);
    if (houseTimer.current) clearTimeout(houseTimer.current);
    houseTimer.current = setTimeout(() => setHouseOpen(true), 380);
  };

  /** 睡到第二天早上 7 点：虚拟时间一起往前跳，作物跟着长 */
  const doSleep = () => {
    const t = now + timeShift;
    const d = new Date(t);
    const target = new Date(t);
    if (d.getHours() >= WAKE_HOUR) target.setDate(target.getDate() + 1);
    target.setHours(WAKE_HOUR, 0, 0, 0);
    const jump = Math.max(MINUTE, target.getTime() - t);
    const next = t + jump;
    setTimeShift((s) => s + jump);
    setHouseOpen(false);
    const nextDay = Math.max(1, Math.floor((next - epoch) / DAY) + 1);
    showToast(`第 ${nextDay} 天 · 早上 7:00，作物悄悄长高了`);
  };

  /** 抓虫小游戏结算：游戏时长也算进农场时间，作物自然长得更快 */
  const finishBugGame = (score: number, jumpMs: number) => {
    setTimeShift((s) => s + jumpMs);
    if (score > 0) setCoins((c) => c + Math.floor(score / 2));
    const mins = Math.max(1, Math.round(jumpMs / MINUTE));
    showToast(
      `抓了 ${score} 只虫，农场时间前进了 ${mins} 分钟${
        score > 0 ? `，金币 +${Math.floor(score / 2)}` : ""
      }`,
    );
  };

  const openBugGame = () => {
    setGameToken((t) => t + 1);
    setGameOpen(true);
  };


  const buy = (kind: CropKind) => {
    const price = CROP_META[kind].price;
    if (coins < price) {
      showToast("金币不够，先去收点作物吧");
      return;
    }
    setCoins((c) => c - price);
    setSeeds((s) => ({ ...s, [kind]: s[kind] + 1 }));
    showToast(`买到了${CROP_ART[kind].label}种子`);
  };

  const openTalk = (who: Speaker) => {
    const at = {
      door: DOOR_AT,
      gu: GU_AT,
      chicken: CHICKEN_AT,
      xiaoba: XIAOBA_AT,
      yujie: YUJIE_AT,
      weigang: WEIGANG_AT,
    }[who];
    const isSon = who === "xiaoba" || who === "yujie" || who === "weigang";
    if (isSon) {
      moveTo(SONS_SPOT.x, SONS_SPOT.y);
    } else {
      moveTo(at.x + (who === "door" ? 16 : -16), at.y + 4);
    }
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

  const sendChat = async (raw: string) => {
    const text = raw.trim();
    const who = speaker;
    if (!text || !who || chatBusy) return;

    const mine: FarmChatMsg = { id: chatId(), role: "user", text };
    const history = [...threads[who], mine];
    setThreads((prev) => ({ ...prev, [who]: [...prev[who], mine] }));
    setDraft("");
    setChatBusy(true);

    try {
      if (!apiKey) throw new Error("no-key");
      const reply = await chat(
        [
          {
            role: "system",
            content: farmSystemPrompt(who, {
              day,
              season: seasonName,
              coins,
              growing,
              harvested,
            }),
          },
          ...history.slice(-8).map((m) => ({
            role: m.role,
            content: m.text,
          })),
        ],
        apiKey,
        { temperature: 0.9, timeoutMs: 20_000 },
      );
      const clean = reply
        .trim()
        .replace(/^["“]/, "")
        .replace(/["”]$/, "")
        .replace(/\s+/g, " ");
      if (!clean) throw new Error("empty");
      setChatOffline(false);
      setThreads((prev) => ({
        ...prev,
        [who]: [
          ...prev[who],
          { id: chatId(), role: "assistant", text: clean.slice(0, 140) },
        ],
      }));
    } catch {
      setChatOffline(true);
      setThreads((prev) => ({
        ...prev,
        [who]: [
          ...prev[who],
          {
            id: chatId(),
            role: "assistant",
            text: fallbackLine(who, { day, coins, growing, harvested }),
          },
        ],
      }));
    } finally {
      setChatBusy(false);
    }
  };

  const speakerMeta = SPEAKER_META[speaker ?? "gu"];
  const speakerName = speakerMeta.name;
  const speakerSub = speakerMeta.sub;

  return (
    <View style={{ flex: 1, backgroundColor: "#0E1A12" }}>
      <StatusBar style="light" />

      {/* ---------- 顶部 ---------- */}
      <View
        style={{
          paddingTop: insets.top + 8,
          paddingHorizontal: 14,
          flexDirection: "row",
          alignItems: "center",
        }}
      >
        <Pressable
          onPress={() => router.back()}
          style={{
            width: 34,
            height: 34,
            borderRadius: 17,
            alignItems: "center",
            justifyContent: "center",
            backgroundColor: "rgba(246,238,220,0.08)",
            borderWidth: 1,
            borderColor: "rgba(246,238,220,0.12)",
          }}
        >
          <Ionicons name="chevron-back" size={18} color="#F6EEDC" />
        </Pressable>

        <View style={{ flex: 1, marginLeft: 10 }}>
          <Text
            style={{
              color: "#F6EEDC",
              fontSize: 16,
              fontWeight: "800",
              letterSpacing: 1.5,
              fontFamily: PIXEL_FONT,
            }}
          >
            doordoor<Text style={{ color: "#8FD14F" }}>农场</Text>
          </Text>
          <Text
            style={{
              color: "rgba(246,238,220,0.5)",
              fontSize: 10,
              marginTop: 2,
            }}
          >
            {`第 ${day} 天 · ${seasonName} · ${clockLabel(vNow)} ${
              night ? "夜晚" : "白天"
            }`}
          </Text>
        </View>

        <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              borderRadius: 999,
              paddingHorizontal: 12,
              paddingVertical: 6,
              backgroundColor: "rgba(245,196,102,0.12)",
              borderWidth: 1,
              borderColor: "rgba(245,196,102,0.3)",
            }}
          >
            <View
              style={{
                width: 11,
                height: 11,
                borderRadius: 6,
                backgroundColor: "#F5C466",
                borderWidth: 1,
                borderColor: "#C9973A",
              }}
            />
            <Text
              style={{
                color: "#F5C466",
                fontSize: 12.5,
                fontWeight: "800",
                marginLeft: 6,
              }}
            >
              {coins}
            </Text>
          </View>
        </View>
      </View>

      {/* ---------- 场景 ---------- */}
      <View style={{ flex: 1 }}>
        {/* 天空延展：与贴图顶端同色，白天飘云，夜里点星 */}
        <View
          style={{
            flex: 1,
            backgroundColor: night ? SKY_FILL.night : SKY_FILL.day,
            overflow: "hidden",
          }}
        >
          {/* 天上的太阳 / 月亮，让延展出来的天空不至于太空 */}
          {night ? (
            <>
              <View
                style={{
                  position: "absolute",
                  right: width * 0.12 - 12,
                  top: 12,
                  width: 78,
                  height: 78,
                  borderRadius: 39,
                  backgroundColor: "rgba(246,238,220,0.1)",
                }}
              />
              <View
                style={{
                  position: "absolute",
                  right: width * 0.12,
                  top: 24,
                  width: 54,
                  height: 54,
                  borderRadius: 27,
                  backgroundColor: "#F6EEDC",
                }}
              />
              <View
                style={{
                  position: "absolute",
                  right: width * 0.12 + 10,
                  top: 18,
                  width: 54,
                  height: 54,
                  borderRadius: 27,
                  backgroundColor: SKY_FILL.night,
                }}
              />
            </>
          ) : (
            <>
              <View
                style={{
                  position: "absolute",
                  right: width * 0.1 - 16,
                  top: 4,
                  width: 94,
                  height: 94,
                  borderRadius: 47,
                  backgroundColor: "rgba(255,240,180,0.16)",
                }}
              />
              <View
                style={{
                  position: "absolute",
                  right: width * 0.1,
                  top: 20,
                  width: 62,
                  height: 62,
                  borderRadius: 31,
                  backgroundColor: "rgba(255,240,180,0.92)",
                }}
              />
            </>
          )}
          {night ? (
            SKY_STARS.map((s) => (
              <View
                key={s.id}
                style={{
                  position: "absolute",
                  left: s.left,
                  top: s.top,
                  width: s.size,
                  height: s.size,
                  borderRadius: s.size,
                  backgroundColor: "#FFFFFF",
                  opacity: s.o,
                }}
              />
            ))
          ) : (
            <>
              <Cloud left={width * 0.04} top={30} size={112} delay={0} />
              <Cloud left={width * 0.42} top={82} size={84} delay={5200} />
              <Cloud left={width * 0.58} top={22} size={134} delay={9800} />
            </>
          )}
        </View>

        {/* 场景贴底：多出来的高度留给天空，农场紧贴操作区 */}
        <View style={{ width, height: sceneH, overflow: "hidden" }}>
          <Animated.View style={[StyleSheet.absoluteFill, dayLayerStyle]}>
            <Image
              source={require("../../assets/images/farm-day.png")}
              style={{ width, height: sceneH }}
              resizeMode="stretch"
            />
          </Animated.View>
          <Animated.View style={[StyleSheet.absoluteFill, nightLayerStyle]}>
            <Image
              source={require("../../assets/images/farm-night.png")}
              style={{ width, height: sceneH }}
              resizeMode="stretch"
            />
          </Animated.View>
          <Svg
            width={width}
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
                      width={PLOT_W}
                      height={PLOT_H}
                      fill="#241209"
                      opacity="0.32"
                    />
                  ) : null}
                  {p.crop
                    ? cropRects(p.crop, stage, pos.x + 5, pos.y + 4)
                    : null}
                  {p.crop && stage < 2 ? (
                    <>
                      <Rect
                        x={pos.x}
                        y={pos.y - 2.4}
                        width={PLOT_W}
                        height="1"
                        fill="#0E1A12"
                        opacity="0.42"
                      />
                      <Rect
                        x={pos.x}
                        y={pos.y - 2.4}
                        width={Math.max(0.6, PLOT_W * ratio)}
                        height="1"
                        fill={wet ? "#7ED957" : "#D7C58A"}
                      />
                    </>
                  ) : null}
                  {wet ? (
                    <Rect
                      x={pos.x + PLOT_W - 3.2}
                      y={pos.y + 0.8}
                      width="1.6"
                      height="2.6"
                      fill="#5EC8F2"
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

          {/* 空气里缓慢浮动的光点 */}
          {MOTES.map((m) => (
            <Mote
              key={m.id}
              x={m.x}
              y={m.y}
              dur={m.dur}
              delay={m.delay}
              size={m.size}
              scale={scale}
            />
          ))}

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
              left: HOUSE_RECT.x * scale,
              top: HOUSE_RECT.y * scale,
              width: HOUSE_RECT.w * scale,
              height: HOUSE_RECT.h * scale,
              zIndex: 3,
            }}
          />

          {/* 田地点击 */}
          {plots.map((_, i) => {
            const pos = plotPos(i);
            return (
              <Pressable
                key={i}
                onPress={() => actOnPlot(i)}
                hitSlop={4}
                accessibilityRole="button"
                accessibilityLabel={`第 ${i + 1} 块田地`}
                style={{
                  position: "absolute",
                  left: pos.x * scale,
                  top: pos.y * scale,
                  width: PLOT_W * scale,
                  height: PLOT_H * scale,
                }}
              />
            );
          })}

          {/* 顾 */}
          <View
            style={{
              position: "absolute",
              left: GU_AT.x * scale,
              top: GU_AT.y * scale,
              zIndex: 5,
            }}
          >
            <NameTag
              label="顾"
              accent="#F9A8D4"
              scale={scale}
              hit={threads.gu.length > 0}
            />
            <IdleSprite
              rows={GU_ROWS}
              palette={GU_PALETTE}
              pixel={scale}
              onPress={() => openTalk("gu")}
            />
          </View>

          {/* door */}
          <View
            style={{
              position: "absolute",
              left: DOOR_AT.x * scale,
              top: DOOR_AT.y * scale,
              zIndex: 5,
            }}
          >
            <NameTag
              label="door"
              accent="#38BDF8"
              scale={scale}
              hit={threads.door.length > 0}
            />
            <IdleSprite
              rows={DOOR_ROWS}
              palette={DOOR_PALETTE}
              pixel={scale}
              onPress={() => openTalk("door")}
            />
          </View>

          {/* 小鸡坤坤 */}
          <View
            style={{
              position: "absolute",
              left: CHICKEN_AT.x * scale,
              top: CHICKEN_AT.y * scale,
              zIndex: 5,
            }}
          >
            <NameTag
              label="坤坤"
              accent="#F5C466"
              scale={scale}
              hit={threads.chicken.length > 0}
            />
            <IdleSprite
              rows={PROP_ART.chicken.rows}
              palette={PROP_ART.chicken.palette}
              pixel={scale}
              onPress={() => openTalk("chicken")}
            />
          </View>

          {/* 三个儿子：小八 / 玉洁 / 唯纲 */}
          {SONS.map((son) => (
            <View
              key={son.who}
              style={{
                position: "absolute",
                left: son.at.x * scale,
                top: son.at.y * scale,
                zIndex: 5,
              }}
            >
              <NameTag
                label={son.label}
                accent={son.accent}
                scale={scale * 0.8}
                hit={threads[son.who].length > 0}
              />
              <IdleSprite
                rows={son.rows}
                palette={son.palette}
                pixel={scale * 0.8}
                onPress={() => openTalk(son.who)}
              />
            </View>
          ))}

          {/* 玩家 */}
          <Animated.View
            pointerEvents="none"
            style={[
              { position: "absolute", left: 0, top: 0, zIndex: 6 },
              playerStyle,
            ]}
          >
            <View
              style={{
                position: "absolute",
                left: 2 * scale,
                top: 17 * scale,
                width: 8 * scale,
                height: 2 * scale,
                borderRadius: 99,
                backgroundColor: "rgba(0,0,0,0.18)",
              }}
            />
            <PixelSprite
              rows={HERO_ROWS}
              palette={HERO_PALETTE}
              pixel={scale}
            />
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
                alignItems: "center",
              }}
            >
              <View
                style={{
                  maxWidth: width - 48,
                  borderRadius: 999,
                  paddingHorizontal: 14,
                  paddingVertical: 7,
                  backgroundColor: "rgba(14,26,18,0.86)",
                  borderWidth: 1,
                  borderColor: "rgba(246,238,220,0.16)",
                }}
              >
                <Text style={{ color: "#F6EEDC", fontSize: 11.5 }}>
                  {toast.text}
                </Text>
              </View>
            </Animated.View>
          ) : null}
        </View>
      </View>

      {/* ---------- 底部操作区 ---------- */}
      <View
        style={{
          paddingHorizontal: 12,
          paddingBottom: insets.bottom + 8,
          gap: 7,
        }}
      >
        <Text
          style={{
            color: "rgba(246,238,220,0.42)",
            fontSize: 10,
            textAlign: "center",
          }}
        >
          轻点土地耕作　·　轻点房子进屋睡觉　·　轻点小人聊天
        </Text>

        <View style={{ flexDirection: "row", gap: 8 }}>
          {(Object.keys(CROP_ART) as CropKind[]).map((kind) => {
            const on = selected === kind;
            return (
              <Pressable
                key={kind}
                onPress={() => setSelected(kind)}
                style={{
                  flex: 1,
                  flexDirection: "row",
                  alignItems: "center",
                  justifyContent: "center",
                  paddingVertical: 6,
                  borderRadius: 14,
                  borderWidth: 1,
                  borderColor: on
                    ? "rgba(245,196,102,0.7)"
                    : "rgba(246,238,220,0.10)",
                  backgroundColor: on
                    ? "rgba(245,196,102,0.14)"
                    : "rgba(246,238,220,0.04)",
                }}
              >
                <View style={{ width: 18, height: 18 }}>
                  <PixelSprite
                    rows={CROP_STAGE_ROWS[2]}
                    palette={CROP_ART[kind].palette}
                    pixel={1.8}
                  />
                </View>
                <View style={{ marginLeft: 5 }}>
                  <Text
                    style={{
                      color: on ? "#F5C466" : "#E6DCC7",
                      fontSize: 11,
                      fontWeight: "700",
                    }}
                  >
                    {CROP_ART[kind].label}
                  </Text>
                  <Text
                    style={{
                      color: "rgba(246,238,220,0.5)",
                      fontSize: 9.5,
                      marginTop: 1,
                    }}
                  >
                    {`种子 ×${seeds[kind]}`}
                  </Text>
                </View>
              </Pressable>
            );
          })}
        </View>

        <View style={{ flexDirection: "row", gap: 8 }}>
          <Pressable
            onPress={() => setShopOpen(true)}
            style={{
              flex: 1,
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "center",
              paddingVertical: 10,
              borderRadius: 16,
              borderWidth: 1,
              borderColor: "rgba(245,196,102,0.32)",
              backgroundColor: "rgba(245,196,102,0.1)",
            }}
          >
            <Ionicons name="storefront-outline" size={14} color="#F5C466" />
            <Text
              style={{
                marginLeft: 6,
                color: "#F5C466",
                fontSize: 12.5,
                fontWeight: "700",
              }}
            >
              小铺
            </Text>
          </Pressable>

          <Pressable
            onPress={openBugGame}
            style={{
              flex: 1.3,
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "center",
              paddingVertical: 10,
              borderRadius: 16,
              backgroundColor: "#8FD14F",
            }}
          >
            <Ionicons name="bug" size={14} color="#152A12" />
            <Text
              style={{
                marginLeft: 6,
                color: "#152A12",
                fontSize: 12.5,
                fontWeight: "800",
              }}
            >
              抓虫小游戏
            </Text>
          </Pressable>
        </View>
      </View>

      {/* ---------- 小铺 ---------- */}
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
                backgroundColor: "#16261A",
                borderTopLeftRadius: 26,
                borderTopRightRadius: 26,
                paddingHorizontal: 18,
                paddingTop: 16,
                paddingBottom: insets.bottom + 18,
                borderTopWidth: 1,
                borderColor: "rgba(246,238,220,0.10)",
              }}
            >
              <View
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  justifyContent: "space-between",
                  marginBottom: 8,
                }}
              >
                <View>
                  <Text
                    style={{
                      color: "#F6EEDC",
                      fontSize: 15,
                      fontWeight: "800",
                      letterSpacing: 1,
                    }}
                  >
                    doordoor 小铺
                  </Text>
                  <Text
                    style={{
                      color: "rgba(246,238,220,0.42)",
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

              {(Object.keys(CROP_ART) as CropKind[]).map((kind) => (
                <View
                  key={kind}
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    paddingVertical: 10,
                    borderTopWidth: 1,
                    borderColor: "rgba(246,238,220,0.08)",
                  }}
                >
                  <View style={{ width: 24, height: 24 }}>
                    <PixelSprite
                      rows={CROP_STAGE_ROWS[2]}
                      palette={CROP_ART[kind].palette}
                      pixel={2.4}
                    />
                  </View>
                  <View style={{ flex: 1, marginLeft: 10 }}>
                    <Text
                      style={{
                        color: "#F6EEDC",
                        fontSize: 13,
                        fontWeight: "700",
                      }}
                    >
                      {CROP_ART[kind].label}种子
                    </Text>
                    <Text
                      style={{
                        color: "rgba(246,238,220,0.45)",
                        fontSize: 10,
                        marginTop: 2,
                      }}
                    >
                      {`价格 ${CROP_META[kind].price} · 成熟后卖 ${CROP_META[kind].sell}`}
                    </Text>
                  </View>
                  <Pressable
                    onPress={() => buy(kind)}
                    style={{
                      borderRadius: 999,
                      paddingHorizontal: 14,
                      paddingVertical: 7,
                      backgroundColor:
                        coins >= CROP_META[kind].price
                          ? "#8FD14F"
                          : "rgba(246,238,220,0.12)",
                    }}
                  >
                    <Text
                      style={{
                        fontSize: 11.5,
                        fontWeight: "800",
                        color:
                          coins >= CROP_META[kind].price
                            ? "#152A12"
                            : "rgba(246,238,220,0.4)",
                      }}
                    >
                      买入
                    </Text>
                  </Pressable>
                </View>
              ))}
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
          setSpeaker(null);
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
              setSpeaker(null);
              Keyboard.dismiss();
            }}
          />
          <Animated.View entering={FadeInDown.springify()}>
            <View
              style={{
                margin: 10,
                borderRadius: 22,
                backgroundColor: "#16261A",
                borderWidth: 1,
                borderColor: "rgba(246,238,220,0.12)",
                overflow: "hidden",
              }}
            >
              <View
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  paddingHorizontal: 14,
                  paddingTop: 12,
                  paddingBottom: 10,
                  borderBottomWidth: 1,
                  borderBottomColor: "rgba(246,238,220,0.08)",
                }}
              >
                <View
                  style={{
                    width: 42,
                    height: 54,
                    alignItems: "center",
                    justifyContent: "center",
                    borderRadius: 12,
                    backgroundColor: "rgba(246,238,220,0.06)",
                  }}
                >
                  <PixelSprite
                    rows={speakerMeta.rows}
                    palette={speakerMeta.palette}
                    pixel={speaker === "chicken" ? 3 : 2.6}
                  />
                </View>
                <View style={{ marginLeft: 10, flex: 1 }}>
                  <View style={{ flexDirection: "row", alignItems: "center" }}>
                    <Text
                      style={{
                        color: "#F6EEDC",
                        fontSize: 14,
                        fontWeight: "800",
                        letterSpacing: 1,
                      }}
                    >
                      {speakerName}
                    </Text>
                    <View
                      style={{
                        marginLeft: 7,
                        paddingHorizontal: 6,
                        paddingVertical: 1.5,
                        borderRadius: 99,
                        backgroundColor: chatOffline
                          ? "rgba(246,238,220,0.08)"
                          : "rgba(143,209,79,0.16)",
                      }}
                    >
                      <Text
                        style={{
                          color: chatOffline
                            ? "rgba(246,238,220,0.42)"
                            : "#8FD14F",
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
                      color: "rgba(246,238,220,0.45)",
                      fontSize: 10,
                      marginTop: 3,
                    }}
                  >
                    {speakerSub}
                  </Text>
                </View>
                <Pressable
                  onPress={() => {
                    setSpeaker(null);
                    Keyboard.dismiss();
                  }}
                  hitSlop={8}
                  style={{
                    width: 28,
                    height: 28,
                    borderRadius: 14,
                    alignItems: "center",
                    justifyContent: "center",
                    backgroundColor: "rgba(246,238,220,0.06)",
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
                      borderColor: "rgba(246,238,220,0.14)",
                      backgroundColor: "rgba(246,238,220,0.04)",
                      opacity: chatBusy ? 0.45 : 1,
                    }}
                  >
                    <Text
                      style={{
                        color: "rgba(246,238,220,0.7)",
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
                        borderRadius: 15,
                        borderTopLeftRadius: m.role === "user" ? 15 : 5,
                        borderTopRightRadius: m.role === "user" ? 5 : 15,
                        paddingHorizontal: 11,
                        paddingVertical: 8,
                        borderWidth: m.role === "user" ? 0 : 1,
                        borderColor: "rgba(246,238,220,0.1)",
                        backgroundColor:
                          m.role === "user"
                            ? "#8FD14F"
                            : "rgba(246,238,220,0.07)",
                      }}
                    >
                      <Text
                        style={{
                          color: m.role === "user" ? "#152A12" : "#EDE4CE",
                          fontSize: 13,
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
                        borderColor: "rgba(246,238,220,0.1)",
                        backgroundColor: "rgba(246,238,220,0.05)",
                      }}
                    >
                      <Text
                        style={{
                          color: "rgba(246,238,220,0.5)",
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
                    color: "rgba(246,238,220,0.32)",
                    fontSize: 9.5,
                  }}
                >
                  {apiKey
                    ? "刚刚没连上，先用本地台词陪你"
                    : "在设置里填好 Key，就能真正聊起来了"}
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
                  borderTopColor: "rgba(246,238,220,0.08)",
                  backgroundColor: "#122019",
                }}
              >
                <TextInput
                  value={draft}
                  onChangeText={setDraft}
                  placeholder={`和${speakerName}说点什么…`}
                  placeholderTextColor="rgba(246,238,220,0.28)"
                  style={{
                    flex: 1,
                    height: 42,
                    borderRadius: 14,
                    paddingHorizontal: 12,
                    color: "#F6EEDC",
                    fontSize: 13,
                    backgroundColor: "rgba(246,238,220,0.06)",
                    borderWidth: 1,
                    borderColor: "rgba(246,238,220,0.12)",
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
                    borderRadius: 14,
                    alignItems: "center",
                    justifyContent: "center",
                    backgroundColor:
                      !draft.trim() || chatBusy
                        ? "rgba(143,209,79,0.22)"
                        : "#8FD14F",
                  }}
                >
                  <Ionicons
                    name="arrow-up"
                    size={18}
                    color={
                      !draft.trim() || chatBusy
                        ? "rgba(21,42,18,0.45)"
                        : "#152A12"
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
        clock={clockLabel(vNow)}
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
