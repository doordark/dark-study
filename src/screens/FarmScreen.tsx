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
  Platform,
  Pressable,
  ScrollView,
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
import Svg, {
  Circle,
  Defs,
  Ellipse,
  G,
  LinearGradient as SvgGradient,
  Rect,
  Stop,
} from "react-native-svg";

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
  cropRects,
  propRects,
  type CropKind,
} from "@/components/farm/sprites";
import { chat } from "@/services/deepseek";
import { useSettings } from "@/store/useSettings";

/* -------------------------------------------------------------------------- */
/*  场景几何（虚拟像素坐标，最终按屏宽等比缩放）                                 */
/* -------------------------------------------------------------------------- */

const VIEW_W = 200;
const VIEW_H = 170;

const PLOT_X = 66;
const PLOT_Y = 108;
const PLOT_W = 20;
const PLOT_H = 14;
const PLOT_GAP = 2;
const PLOT_COUNT = 9;

const PLAYER_START = { x: 48, y: 96 };
const GU_AT = { x: 148, y: 100 };
const DOOR_AT = { x: 18, y: 94 };

const SAVE_KEY = "dark-study-farm";

function plotPos(i: number) {
  return {
    x: PLOT_X + (i % 3) * (PLOT_W + PLOT_GAP),
    y: PLOT_Y + Math.floor(i / 3) * (PLOT_H + PLOT_GAP),
  };
}

const CROP_META: Record<CropKind, { price: number; sell: number }> = {
  radish: { price: 20, sell: 55 },
  berry: { price: 45, sell: 120 },
  star: { price: 90, sell: 260 },
};

interface PlotState {
  crop: CropKind | null;
  stage: number;
  watered: boolean;
}

interface SaveData {
  day: number;
  coins: number;
  seeds: Record<CropKind, number>;
  plots: PlotState[];
  harvested: number;
}

const emptyPlot = (): PlotState => ({ crop: null, stage: 0, watered: false });

const THEMES = [
  {
    name: "春",
    skyTop: "#9BD9F5",
    skyBottom: "#DFF6E4",
    grass: "#7EC850",
    grassDark: "#5BAA39",
    hill: "#6FBF49",
    hillDark: "#4E9C34",
    sun: "#FFF3B0",
  },
  {
    name: "夏",
    skyTop: "#79CDF2",
    skyBottom: "#CFF0FF",
    grass: "#6BBD41",
    grassDark: "#4F9E2F",
    hill: "#5FAF37",
    hillDark: "#428C26",
    sun: "#FFE88A",
  },
  {
    name: "秋",
    skyTop: "#F4C27A",
    skyBottom: "#FDE9C6",
    grass: "#C9A24E",
    grassDark: "#A9853A",
    hill: "#C08F45",
    hillDark: "#9A6E33",
    sun: "#FFD98A",
  },
  {
    name: "冬",
    skyTop: "#BBD9EC",
    skyBottom: "#EEF8FF",
    grass: "#E6F3FA",
    grassDark: "#C7DEEB",
    hill: "#D6E9F5",
    hillDark: "#B9D5E6",
    sun: "#F2FAFF",
  },
];

/** 固定种子的草丛纹理，保证每次进入位置一致 */
const TUFTS = (() => {
  let seed = 7;
  const rnd = () => {
    seed = (seed * 1103515245 + 12345) % 2147483648;
    return seed / 2147483648;
  };
  return Array.from({ length: 48 }, (_, i) => ({
    id: i,
    x: 4 + rnd() * 190,
    y: 92 + rnd() * 72,
    w: rnd() > 0.6 ? 2 : 1,
    light: rnd() > 0.5,
    o: 0.12 + rnd() * 0.3,
  }));
})();

const PIXEL_FONT = Platform.select({
  ios: "Courier",
  android: "monospace",
  default: "monospace",
});

/* -------------------------------------------------------------------------- */
/*  离线台词（没有配置 AI Key / 请求失败时兜底，仍然好玩）                       */
/* -------------------------------------------------------------------------- */

function fallbackLine(
  who: "door" | "gu",
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
  const bank = who === "gu" ? gu : door;
  return bank[Math.floor(Math.random() * bank.length)];
}

/* -------------------------------------------------------------------------- */
/*  对话                                                                       */
/* -------------------------------------------------------------------------- */

type Speaker = "door" | "gu";

interface FarmChatMsg {
  id: string;
  role: "user" | "assistant";
  text: string;
}

/** 角色人设：door 是作者，顾是他的女友，两个人都住在农场里 */
const TALK_PERSONA: Record<Speaker, string> = {
  door: "door，课程表应用 dark-study 的作者，白天写前端，晚上改 bug。性格温和、嘴硬心软、会自嘲，聊到女友顾的时候会明显变软。说话像熟人聊天，偶尔带一点程序员梗，但不炫技。",
  gu: "顾，door 的女友，农场常驻。性格温柔、俏皮、细腻，喜欢观察生活和小动物，会吐槽 door 的黑眼圈，也会认真鼓励人。说话轻快，偶尔撒娇，但不过分。",
};

const TALK_TOPICS: Record<Speaker, string[]> = {
  door: ["这农场怎么藏得这么深？", "你平时怎么写代码？", "说说顾吧"],
  gu: ["door 最近在忙什么？", "今天适合种点什么？", "夸夸我"],
};

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
            left: 2 * pixel,
            top: 17 * pixel,
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
        top: -17 * scale,
        left: 6 * scale - 17,
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
  const [day, setDay] = useState(1);
  const [coins, setCoins] = useState(120);
  const [seeds, setSeeds] = useState<Record<CropKind, number>>({
    radish: 3,
    berry: 0,
    star: 0,
  });
  const [plots, setPlots] = useState<PlotState[]>(() =>
    Array.from({ length: PLOT_COUNT }, emptyPlot),
  );
  const [harvested, setHarvested] = useState(0);
  const [selected, setSelected] = useState<CropKind>("radish");

  const [toast, setToast] = useState<{ id: number; text: string } | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [shopOpen, setShopOpen] = useState(false);
  const [speaker, setSpeaker] = useState<Speaker | null>(null);
  const [threads, setThreads] = useState<Record<Speaker, FarmChatMsg[]>>({
    door: [],
    gu: [],
  });
  const [draft, setDraft] = useState("");
  const [chatBusy, setChatBusy] = useState(false);
  const [chatOffline, setChatOffline] = useState(false);
  const [kbH, setKbH] = useState(0);
  const chatRef = useRef<ScrollViewInstance>(null);

  const season = Math.floor((day - 1) / 7) % 4;
  const theme = THEMES[season];
  const growing = plots.filter((p) => p.crop && p.stage < 2).length;

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
        const data = JSON.parse(raw) as Partial<SaveData>;
        if (typeof data.day === "number") setDay(Math.max(1, data.day));
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
          setPlots(
            data.plots.map((p) => ({
              crop:
                p?.crop === "radish" ||
                p?.crop === "berry" ||
                p?.crop === "star"
                  ? p.crop
                  : null,
              stage: Math.min(2, Math.max(0, Number(p?.stage) || 0)),
              watered: Boolean(p?.watered),
            })),
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
    AsyncStorage.setItem(
      SAVE_KEY,
      JSON.stringify({ day, coins, seeds, plots, harvested }),
    ).catch(() => {});
  }, [loaded, day, coins, seeds, plots, harvested]);

  /* ---------------- 操作 ---------------- */
  const actOnPlot = (index: number) => {
    const plot = plots[index];
    const pos = plotPos(index);
    moveTo(pos.x + 3, pos.y + PLOT_H - 16);

    if (!plot.crop) {
      if (seeds[selected] <= 0) {
        showToast("种子用完了，去小铺买一点吧");
        return;
      }
      const kind = selected;
      setSeeds((s) => ({ ...s, [kind]: s[kind] - 1 }));
      setPlots((ps) =>
        ps.map((p, i) =>
          i === index ? { crop: kind, stage: 0, watered: false } : p,
        ),
      );
      showToast(`种下了${CROP_ART[kind].label}，记得浇水`);
      return;
    }

    if (plot.stage >= 2) {
      const kind = plot.crop;
      const gain = CROP_META[kind].sell;
      setCoins((c) => c + gain);
      setHarvested((h) => h + 1);
      setPlots((ps) => ps.map((p, i) => (i === index ? emptyPlot() : p)));
      showToast(`收获${CROP_ART[kind].label} +${gain}`);
      return;
    }

    if (plot.watered) {
      showToast("今天已经浇过水了");
      return;
    }

    setPlots((ps) =>
      ps.map((p, i) => (i === index ? { ...p, watered: true } : p)),
    );
    showToast("浇水了，睡一觉就会长高");
  };

  const sleep = () => {
    setDay((d) => d + 1);
    setPlots((ps) =>
      ps.map((p) => ({
        ...p,
        stage: p.crop && p.watered && p.stage < 2 ? p.stage + 1 : p.stage,
        watered: false,
      })),
    );
    showToast("晚安。夜色轻轻盖住了整片农场。");
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
    const at = who === "gu" ? GU_AT : DOOR_AT;
    moveTo(at.x + (who === "gu" ? -16 : 16), at.y + 4);
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
              season: theme.name,
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

  const speakerName = speaker === "gu" ? "顾" : "door";

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
            {`door & 顾的小农场 · 第 ${day} 天 · ${theme.name}天`}
          </Text>
        </View>

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

      {/* ---------- 场景 ---------- */}
      <View style={{ flex: 1, justifyContent: "center" }}>
        <View style={{ width, height: sceneH, overflow: "hidden" }}>
          <Svg
            width={width}
            height={sceneH}
            viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
          >
            <Defs>
              <SvgGradient id="sky" x1="0" y1="0" x2="0" y2="1">
                <Stop offset="0" stopColor={theme.skyTop} />
                <Stop offset="1" stopColor={theme.skyBottom} />
              </SvgGradient>
            </Defs>

            {/* 天空与太阳 */}
            <Rect x="0" y="0" width={VIEW_W} height={VIEW_H} fill="url(#sky)" />
            <Circle cx="170" cy="26" r="14" fill="rgba(255,255,255,0.25)" />
            <Circle cx="170" cy="26" r="10" fill={theme.sun} />

            {/* 云 */}
            <G opacity="0.85">
              <Rect x="18" y="24" width="34" height="6" rx="3" fill="#FFFFFF" />
              <Rect x="26" y="19" width="18" height="7" rx="3" fill="#FFFFFF" />
              <Rect
                x="124"
                y="36"
                width="26"
                height="5"
                rx="2.5"
                fill="#FFFFFF"
                opacity="0.8"
              />
            </G>

            {/* 远山与地面 */}
            <Rect x="0" y="76" width={VIEW_W} height="16" fill={theme.hill} />
            <Rect
              x="0"
              y="88"
              width={VIEW_W}
              height="4"
              fill={theme.hillDark}
            />
            <Rect x="0" y="86" width={VIEW_W} height="84" fill={theme.grass} />
            <Rect
              x="0"
              y="86"
              width={VIEW_W}
              height="3"
              fill={theme.grassDark}
              opacity="0.45"
            />

            {/* 草丛 */}
            {TUFTS.map((t) => (
              <Rect
                key={t.id}
                x={t.x}
                y={t.y}
                width={t.w}
                height="1"
                fill={t.light ? "#FFFFFF" : theme.grassDark}
                opacity={t.o}
              />
            ))}

            {/* 小路 */}
            <Rect
              x="36"
              y="90"
              width="10"
              height="80"
              fill="#D9C08A"
              opacity="0.75"
            />
            <Rect
              x="46"
              y="112"
              width="20"
              height="10"
              fill="#D9C08A"
              opacity="0.75"
            />

            {/* 池塘 */}
            <Ellipse cx="26" cy="150" rx="20" ry="11" fill="#5FB6E8" />
            <Ellipse
              cx="26"
              cy="150"
              rx="15"
              ry="7"
              fill="#8FD3F6"
              opacity="0.8"
            />
            <Rect
              x="14"
              y="146"
              width="10"
              height="1"
              fill="#FFFFFF"
              opacity="0.5"
            />
            <Rect
              x="22"
              y="152"
              width="8"
              height="1"
              fill="#FFFFFF"
              opacity="0.35"
            />

            {/* 房子 */}
            <Rect x="14" y="60" width="52" height="32" fill="#F4E4C1" />
            <Rect x="58" y="60" width="8" height="32" fill="#E2CEA2" />
            <Rect x="14" y="60" width="52" height="2" fill="#FFF6E0" />
            <Rect x="14" y="90" width="52" height="2" fill="#C9B58B" />
            <Rect x="54" y="46" width="6" height="14" fill="#A45A3E" />
            <Circle cx="57" cy="42" r="3" fill="#FFFFFF" opacity="0.45" />
            <Circle cx="59" cy="36" r="2" fill="#FFFFFF" opacity="0.3" />
            <Rect x="32" y="76" width="12" height="16" fill="#8B5E3C" />
            <Rect x="32" y="76" width="12" height="2" fill="#A9744F" />
            <Rect x="42" y="84" width="1" height="1" fill="#F5C466" />
            <Rect x="20" y="68" width="9" height="7" fill="#9EDBFF" />
            <Rect x="24" y="68" width="1" height="7" fill="#6BA8C9" />
            <Rect x="20" y="71" width="9" height="1" fill="#6BA8C9" />
            <Rect x="51" y="68" width="9" height="7" fill="#9EDBFF" />
            <Rect x="55" y="68" width="1" height="7" fill="#6BA8C9" />
            <Rect x="51" y="71" width="9" height="1" fill="#6BA8C9" />
            {[20, 27, 51, 57].map((x) => (
              <Rect key={x} x={x} y="75" width="1" height="3" fill="#D97757" />
            ))}
            {/* 屋顶 */}
            <Rect x="8" y="60" width="64" height="3" fill="#B95A3E" />
            <Rect x="12" y="54" width="56" height="7" fill="#C96A4A" />
            <Rect x="16" y="48" width="48" height="7" fill="#D9795A" />
            <Rect x="22" y="42" width="36" height="7" fill="#E08565" />
            <Rect x="30" y="38" width="20" height="5" fill="#E99473" />

            {/* 树 */}
            <G>
              <Rect x="152" y="70" width="6" height="20" fill="#7A5230" />
              <Rect x="144" y="54" width="24" height="10" fill="#2F7D32" />
              <Rect x="140" y="60" width="32" height="9" fill="#3E9C3F" />
              <Rect x="148" y="46" width="16" height="10" fill="#4CAF50" />
              <Rect x="150" y="50" width="12" height="4" fill="#66BB6A" />
              <Rect x="146" y="58" width="4" height="3" fill="#2F7D32" />
            </G>
            <G>
              <Rect x="180" y="80" width="5" height="14" fill="#7A5230" />
              <Rect x="176" y="70" width="15" height="7" fill="#3E9C3F" />
              <Rect x="173" y="74" width="21" height="7" fill="#4CAF50" />
              <Rect x="178" y="66" width="11" height="6" fill="#66BB6A" />
            </G>

            {/* 栅栏 */}
            <Rect x="62" y="98" width="72" height="2" fill="#C8A46B" />
            <Rect x="62" y="104" width="72" height="2" fill="#C8A46B" />
            {[62, 80, 98, 116, 132].map((x) => (
              <Rect key={x} x={x} y="96" width="2" height="12" fill="#A98552" />
            ))}

            {/* 场景装饰：Kenney「Tiny Farm」素材（CC0） */}
            {propRects("pine", 118, 58)}
            {propRects("sunflower", 164, 112)}
            {propRects("chicken", 180, 120)}
            {propRects("cabbage", 140, 144)}
            {propRects("crate", 180, 144)}

            {/* 田地 */}
            <Rect
              x={PLOT_X - 2}
              y={PLOT_Y - 2}
              width={PLOT_W * 3 + PLOT_GAP * 2 + 4}
              height={PLOT_H * 3 + PLOT_GAP * 2 + 4}
              fill="#8C6239"
              opacity="0.28"
            />
            {plots.map((p, i) => {
              const pos = plotPos(i);
              return (
                <G key={i}>
                  <Rect
                    x={pos.x}
                    y={pos.y}
                    width={PLOT_W}
                    height={PLOT_H}
                    fill={p.watered ? "#7B5236" : "#A9744F"}
                  />
                  <Rect
                    x={pos.x}
                    y={pos.y}
                    width={PLOT_W}
                    height="1"
                    fill="#C08A63"
                    opacity="0.6"
                  />
                  {[4, 8, 12].map((dy) => (
                    <Rect
                      key={dy}
                      x={pos.x + 2}
                      y={pos.y + dy}
                      width={PLOT_W - 4}
                      height="1"
                      fill="#6F4A2F"
                      opacity="0.35"
                    />
                  ))}
                  {p.crop
                    ? cropRects(p.crop, p.stage, pos.x + 5, pos.y + 4)
                    : null}
                  {p.stage >= 2 ? (
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

          {/* 田地点击 */}
          {plots.map((_, i) => {
            const pos = plotPos(i);
            return (
              <Pressable
                key={i}
                onPress={() => actOnPlot(i)}
                hitSlop={4}
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
          paddingBottom: insets.bottom + 10,
          gap: 8,
        }}
      >
        <Text
          style={{
            color: "rgba(246,238,220,0.42)",
            fontSize: 10,
            textAlign: "center",
          }}
        >
          轻点土地：种下 / 浇水 / 收获　·　轻点 door 或顾：聊聊天
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
                  paddingVertical: 8,
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
                <View style={{ width: 20, height: 20 }}>
                  <PixelSprite
                    rows={CROP_STAGE_ROWS[2]}
                    palette={CROP_ART[kind].palette}
                    pixel={2}
                  />
                </View>
                <View style={{ marginLeft: 6 }}>
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
            onPress={sleep}
            style={{
              flex: 1.2,
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "center",
              paddingVertical: 11,
              borderRadius: 16,
              backgroundColor: "#8FD14F",
            }}
          >
            <Ionicons name="moon" size={14} color="#152A12" />
            <Text
              style={{
                marginLeft: 6,
                color: "#152A12",
                fontSize: 12.5,
                fontWeight: "800",
              }}
            >
              睡一觉
            </Text>
          </Pressable>

          <Pressable
            onPress={() => setShopOpen(true)}
            style={{
              flex: 1,
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "center",
              paddingVertical: 11,
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
            onPress={() => openTalk("gu")}
            style={{
              flex: 1,
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "center",
              paddingVertical: 11,
              borderRadius: 16,
              borderWidth: 1,
              borderColor: "rgba(246,238,220,0.12)",
              backgroundColor: "rgba(246,238,220,0.05)",
            }}
          >
            <Ionicons
              name="chatbubble-ellipses-outline"
              size={14}
              color="#E6DCC7"
            />
            <Text
              style={{
                marginLeft: 6,
                color: "#E6DCC7",
                fontSize: 12.5,
                fontWeight: "700",
              }}
            >
              聊天
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
                    rows={speaker === "gu" ? GU_ROWS : DOOR_ROWS}
                    palette={speaker === "gu" ? GU_PALETTE : DOOR_PALETTE}
                    pixel={2.6}
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
                    {speaker === "gu"
                      ? "door 的女友 · 农场常驻"
                      : "dark-study 作者 · 农场主"}
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

      <Animated.View
        pointerEvents="none"
        entering={FadeIn.duration(400)}
        style={{ position: "absolute", left: 0, right: 0, top: 0, bottom: 0 }}
      />
    </View>
  );
}
