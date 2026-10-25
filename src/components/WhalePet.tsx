import { Ionicons } from "@expo/vector-icons";
import { useEffect, useRef, useState } from "react";
import {
  Keyboard,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
  type ImageSourcePropType,
  type ScrollViewInstance,
} from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, {
  Easing,
  FadeIn,
  FadeInDown,
  FadeOut,
  cancelAnimation,
  runOnJS,
  useAnimatedStyle,
  useFrameCallback,
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
import { BACKGROUND_PRESETS, resolveTint } from "@/constants/backgrounds";
import { askWhalePet } from "@/services/ai";
import { applyScheduleActions } from "@/services/assistantSchedule";
import {
  answerFromSearch,
  buildImageUrl,
  imageAspect,
  searchWeb,
} from "@/services/whaleTools";
import { speakWhale, stopWhaleVoice } from "@/services/whaleVoice";
import { useActiveSchedule, useStore } from "@/store/useStore";
import { useSettings } from "@/store/useSettings";
import { useWhalePet } from "@/store/useWhalePet";
import type { WhaleCare } from "@/store/useWhalePet";
import { useWhaleVoice } from "@/store/useWhaleVoice";
import type {
  AssistantAction,
  PetActionKind,
  ScheduleAction,
  WhaleAction,
} from "@/types";
import { uid } from "@/utils/id";
import { getDateInfo } from "@/utils/time";

/* eslint-disable react-hooks/immutability, react-hooks/refs --
   Reanimated shared value（坐标 / 速度 / 挤压 / 朝向）本质是跨渲染、跨线程可变的容器，
   手势回调、帧回调与 effect 对其赋值是官方标准用法；手势回调只在事件触发时执行，
   不会在渲染期读 ref。React 编译器的不可变/纯函数假设不适用于这些场景 */

type PetFrame = "idle" | "happy" | "sleep" | "dance" | "eat" | "study";

/** 桌宠立绘：待机 / 被戳开心 / 打瞌睡 / 跳舞 / 吃团子 / 陪你学习 */
const SPRITES: Record<PetFrame, ImageSourcePropType> = {
  idle: require("../../assets/whale/pet-idle.png"),
  happy: require("../../assets/whale/pet-happy.png"),
  sleep: require("../../assets/whale/pet-sleep.png"),
  dance: require("../../assets/whale/pet-dance.png"),
  eat: require("../../assets/whale/pet-eat.png"),
  study: require("../../assets/whale/pet-study.png"),
};

const SIZE = 84;
/** 立绘高宽比（素材是竖构图） */
const H = SIZE * 1.37;
const EDGE = 10;
/** 底部操作栏预留：桌宠落地时停在胶囊栏上方，不挡按钮 */
const FLOOR_RESERVE = 72;
const PANEL_W = 264;
const PANEL_H = 336;

const IDLE_DELAY_MIN = 9_000;
const IDLE_DELAY_MAX = 17_000;
const SLEEP_AFTER = 86_000;
/** 甩出去的判定门槛（px/s），低于它就是轻轻放下 */
const THROW_DEAD_ZONE = 500;
const MAX_THROW_SPEED = 3600;

/** 被戳的时候随口说的话 */
const POKE_LINES = [
  "戳我干嘛呀，大爹～",
  "在呢在呢，别急。",
  "摸头可以，摸肚子不行！",
  "再戳我就变成鲸鱼气球飘走咯。",
  "大爹今天有没有好好吃饭？",
  "陪你待着挺好的，就是有点想白饭。",
  "你学习，我看着你，不吵。",
];

/** 饿的时候的抱怨 */
const HUNGRY_LINES = [
  "肚子空空的…大爹有没有白饭？",
  "呜，我好像饿扁了一点点…",
  "再不吃东西，尾巴都没力气摆了。",
];

/** 长时间没人理她 */
const LONELY_LINES = [
  "……大爹是不是把我忘了。",
  "我自己在这儿游了好久啦。",
  "没关系，你忙你的，我不吵…",
];

/** 好感很高时才会说 */
const CLOSE_LINES = [
  "大爹在的地方，我就想待着。",
  "今天也一起加油吧，我陪着你。",
  "嘿嘿，能出来陪你真好。",
];

/** 没人理的时候自己嘀咕 */
const AMBIENT_LINES = [
  "大爹，写累了就歇会儿。",
  "我不占地方，就在边上待着。",
  "这屏幕好亮啊，眼睛会疼的。",
  "要不要摸一下我的头？",
  "鲸鱼也是需要休息的哦。",
];

/** 各动作随口说的话 */
const ACTION_LINES: Record<PetActionKind, string> = {
  dance: "♪ 扭一扭～大爹看好了！",
  spin: "转圈圈——晕了晕了…",
  eat: "团子！嗷呜——好吃！",
  study: "我陪你写，不吵你。",
  sleep: "那我也眯一小会儿…",
  jump: "嘿咻！",
  wave: "大爹～我在这儿呢",
};

/** 小对话框里的快捷动作 */
const PET_CHIPS = ["跳个舞", "转个圈", "吃团子", "陪我学习", "摸摸头"];

/** 本地动作口令：精确说法零延迟直接播，不吃 API */
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
  { re: /打招呼|招手|^hi$|^hello$/i, action: "wave", reply: "大爹～我在这儿呢" },
];

interface PetMsg {
  id: string;
  role: "user" | "assistant";
  text: string;
  /** 待确认的课表操作 */
  actions?: ScheduleAction[];
  /** 生成图 */
  imageUri?: string;
  imageAspect?: number;
}

const petMsg = (role: PetMsg["role"], text: string): PetMsg => ({
  id: uid(),
  role,
  text,
});

const SCHEDULE_TYPES = new Set([
  "add",
  "remove",
  "update",
  "create_schedule",
  "merge_schedule",
]);
const isScheduleAction = (a: AssistantAction): a is ScheduleAction =>
  SCHEDULE_TYPES.has(a.type);
const isWhaleAction = (a: AssistantAction): a is WhaleAction =>
  !SCHEDULE_TYPES.has(a.type);

/** 组件外的纯工具：随机取值 / 分页 / 夹取 */
const pick = <T,>(pool: readonly T[]): T =>
  pool[Math.floor(Math.random() * pool.length)];

/** 随机与时间抽到组件外，避免被 React 编译器误判为渲染期副作用 */
const rand = () => Math.random();
const randBetween = (min: number, max: number) =>
  min + Math.random() * (max - min);
const nowMs = () => Date.now();

const clampNumber = (v: number, min: number, max: number) =>
  Math.min(Math.max(v, min), max);

/** 气泡太长就分页，一页一页说完，避免糊成一大坨 */
function splitPages(text: string): string[] {
  const clean = text.trim();
  if (clean.length <= 34) return [clean];
  const out: string[] = [];
  for (let i = 0; i < clean.length; i += 30) out.push(clean.slice(i, i + 30));
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
 * 交互（参考 dsh-pet / dsh-pet-indesktop 的手感重做）：
 * - 拖拽跟手，甩出去会按重力飞行、撞墙反弹、落地压扁（Q 弹）
 * - 轻轻放下就浮在原地；没人陪时会自己沿屏幕慢慢游动、东张西望
 * - 点一下 Q 弹回应，连点三下打开小对话框，长按收回
 * - 面板里能看到饱食 / 心情 / 好感，可以喂饭、摸头
 * - 回复带情绪表情包，开了语音就会念出来
 */
export function WhalePet() {
  const visible = useWhalePet((s) => s.visible);
  const hydrateVoice = useWhaleVoice((s) => s.hydrate);
  useEffect(() => {
    hydrateVoice();
  }, [hydrateVoice]);
  if (!visible) return null;
  // 每次被叫出来都重新挂载：气泡、表情与睡眠计时自然重置
  return <WhalePetLayer />;
}

function WhalePetLayer() {
  const hide = useWhalePet((s) => s.hide);
  const care = useWhalePet((s) => s.care);
  const feedPet = useWhalePet((s) => s.feed);
  const patPet = useWhalePet((s) => s.pat);
  const tickPet = useWhalePet((s) => s.tick);
  const apiKey = useSettings((s) => s.apiKey);
  const setWhalePhrase = useSettings((s) => s.setWhalePhrase);
  const setBackgroundTint = useSettings((s) => s.setBackgroundTint);
  const setBackgroundEffect = useSettings((s) => s.setBackgroundEffect);
  const voiceOn = useWhaleVoice((s) => s.on);
  const toggleVoice = useWhaleVoice((s) => s.toggle);
  // 小对话框与助手页共用同一份课表数据与权限
  const schedule = useActiveSchedule();
  const schedules = useStore((s) => s.schedules);

  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const { colorScheme } = useColorScheme();
  const isDark = colorScheme !== "light";

  // 位置 / 速度 / 状态机：0 待机，1 拖拽中，2 飞行中
  const boxX = useSharedValue(width - SIZE - EDGE);
  const boxY = useSharedValue(height * 0.6);
  const velocityX = useSharedValue(0);
  const velocityY = useSharedValue(0);
  const phase = useSharedValue(0);
  const face = useSharedValue(1);
  const sqX = useSharedValue(1);
  const sqY = useSharedValue(1);
  const tilt = useSharedValue(0);
  const bob = useSharedValue(0);
  const lift = useSharedValue(0);
  const scale = useSharedValue(0.5);
  /** 本次抛掷是否已经触发过落地反馈 */
  const landed = useSharedValue(0);
  const dragStartX = useSharedValue(0);
  const dragStartY = useSharedValue(0);
  // 活动边界（跟随屏幕尺寸 / 安全区更新）
  const minX = useSharedValue(EDGE);
  const maxX = useSharedValue(width - SIZE - EDGE);
  const minY = useSharedValue(insets.top + 48);
  const maxY = useSharedValue(height - H - insets.bottom - FLOOR_RESERVE);

  const [frame, setFrame] = useState<PetFrame>("idle");
  const [bubble, setBubble] = useState<string | null>(
    "大爹，我出来啦～拖我、戳我都行，点三下能说话",
  );
  const [bubbleBelow, setBubbleBelow] = useState(false);
  const [nearRight, setNearRight] = useState(true);

  const [chatOpen, setChatOpen] = useState(false);
  const [chatMsgs, setChatMsgs] = useState<PetMsg[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [panelPos, setPanelPos] = useState({ left: 12, top: 120 });
  const [kbHeight, setKbHeight] = useState(0);

  const chatOpenRef = useRef(false);
  const bubbleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const frameTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const idleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const sleepTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const leaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const chatRef = useRef<ScrollViewInstance>(null);
  const taps = useRef({ count: 0, at: 0 });
  const lastPat = useRef(0);
  const lastSpoke = useRef(0);
  const bubblePages = useRef<string[]>([]);
  const bubblePage = useRef(0);

  /** 只在开着语音时开口，且两次朗读之间留点空隙 */
  const say = (text: string) => {
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
    bubblePages.current = splitPages(text);
    bubblePage.current = 0;
    setBubble(bubblePages.current[0] ?? null);
    setNearRight(boxX.value > width / 2);
    setBubbleBelow(boxY.value < insets.top + 96);
    const next = () => {
      bubblePage.current += 1;
      if (bubblePage.current >= bubblePages.current.length) {
        setBubble(null);
        return;
      }
      setBubble(bubblePages.current[bubblePage.current]);
      bubbleTimer.current = setTimeout(next, ms);
    };
    bubbleTimer.current = setTimeout(next, ms);
  };

  /** 被摸 / 被戳的 Q 弹：高度压下去，宽度横向摊开 */
  const squash = (depth = 0.82) => {
    sqY.value = withSequence(
      withTiming(depth, { duration: 90, easing: Easing.out(Easing.quad) }),
      withSpring(1, { damping: 9, stiffness: 170, mass: 0.7 }),
    );
    sqX.value = withSequence(
      withTiming(1 + (1 - depth) * 0.55, {
        duration: 90,
        easing: Easing.out(Easing.quad),
      }),
      withSpring(1, { damping: 9, stiffness: 170, mass: 0.7 }),
    );
  };

  const armIdle = () => {
    if (idleTimer.current) clearTimeout(idleTimer.current);
    if (sleepTimer.current) clearTimeout(sleepTimer.current);
    idleTimer.current = setTimeout(
      runIdleTick,
      IDLE_DELAY_MIN + randBetween(0, IDLE_DELAY_MAX - IDLE_DELAY_MIN),
    );
    sleepTimer.current = setTimeout(() => {
      if (chatOpenRef.current) return;
      if (phase.value !== 0) return;
      setFrame("sleep");
    }, SLEEP_AFTER);
  };

  const wake = () => {
    setFrame((f) => (f === "sleep" ? "idle" : f));
    armIdle();
  };

  // 登场：从右下角弹出来，开场招呼只显示一小会儿
  useEffect(() => {
    const lo = insets.top + 48;
    const hi = Math.max(lo, height - H - insets.bottom - FLOOR_RESERVE);
    minX.value = EDGE;
    maxX.value = Math.max(EDGE, width - SIZE - EDGE);
    minY.value = lo;
    maxY.value = hi;
    boxX.value = maxX.value;
    boxY.value = Math.min(Math.max(height * 0.62, lo), hi);
    scale.value = withSpring(1, { damping: 14, stiffness: 190 });
    bubbleTimer.current = setTimeout(() => setBubble(null), 4600);
    armIdle();
    return () => {
      if (bubbleTimer.current) clearTimeout(bubbleTimer.current);
      if (idleTimer.current) clearTimeout(idleTimer.current);
      if (sleepTimer.current) clearTimeout(sleepTimer.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [width, height, insets.top, insets.bottom]);

  // 待机呼吸：鲸鱼浮在空气里轻轻起伏
  useEffect(() => {
    bob.value = withRepeat(
      withTiming(1, { duration: 1900, easing: Easing.inOut(Easing.sin) }),
      -1,
      true,
    );
    return () => {
      cancelAnimation(bob);
      bob.value = 0;
    };
  }, [bob]);

  // 养护心跳：每分钟按真实时间结算一次（应用开着也不会忘记饿）
  useEffect(() => {
    const timer = setInterval(() => tickPet(), 60_000);
    return () => clearInterval(timer);
  }, [tickPet]);

  // 键盘高度：打开对话框时避免输入框被盖住
  useEffect(() => {
    const showEvt =
      Platform.OS === "ios" ? "keyboardWillShow" : "keyboardDidShow";
    const hideEvt =
      Platform.OS === "ios" ? "keyboardWillHide" : "keyboardDidHide";
    const s = Keyboard.addListener(showEvt, (e) =>
      setKbHeight(e.endCoordinates.height),
    );
    const h = Keyboard.addListener(hideEvt, () => setKbHeight(0));
    return () => {
      s.remove();
      h.remove();
    };
  }, []);

  // 卸载时把定时器、动画和声音全部收干净
  useEffect(
    () => () => {
      stopWhaleVoice();
      if (bubbleTimer.current) clearTimeout(bubbleTimer.current);
      if (frameTimer.current) clearTimeout(frameTimer.current);
      if (idleTimer.current) clearTimeout(idleTimer.current);
      if (sleepTimer.current) clearTimeout(sleepTimer.current);
      if (leaveTimer.current) clearTimeout(leaveTimer.current);
      cancelAnimation(tilt);
      cancelAnimation(lift);
      cancelAnimation(sqX);
      cancelAnimation(sqY);
    },
    [tilt, lift, sqX, sqY],
  );

  /* ------------------------------------------------------------------ */
  /*  动作与闲逛                                                         */
  /* ------------------------------------------------------------------ */

  const finishWalk = () => {
    cancelAnimation(tilt);
    tilt.value = withTiming(0, { duration: 180 });
    armIdle();
  };

  /** 沿屏幕慢慢游到目标位置（鲸鱼不需要腿，靠尾巴摆） */
  const walkTo = (target: number) => {
    if (phase.value !== 0) return;
    const from = boxX.value;
    if (Math.abs(target - from) < 24) return;
    face.value = target > from ? 1 : -1;
    cancelAnimation(tilt);
    tilt.value = withRepeat(
      withTiming(face.value * 2.4, {
        duration: 330,
        easing: Easing.inOut(Easing.sin),
      }),
      -1,
      true,
    );
    const dist = Math.abs(target - from);
    boxX.value = withTiming(
      target,
      {
        duration: Math.min(4200, Math.max(720, (dist / 66) * 1000)),
        easing: Easing.inOut(Easing.quad),
      },
      (finished) => {
        if (finished) runOnJS(finishWalk)();
      },
    );
  };

  const walkSomewhere = () => {
    if (phase.value !== 0) return;
    const dir = rand() < 0.5 ? -1 : 1;
    const dist = 60 + randBetween(0, 150);
    walkTo(clampNumber(boxX.value + dir * dist, minX.value, maxX.value));
  };

  /** 收掉正在播放的动作 */
  const stopAction = () => {
    if (frameTimer.current) clearTimeout(frameTimer.current);
    frameTimer.current = null;
    cancelAnimation(tilt);
    cancelAnimation(lift);
    tilt.value = 0;
    lift.value = 0;
  };

  /** 播放一个动作，结束后回到待机并重新计时 */
  const playAction = (kind: PetActionKind, silent = false) => {
    if (phase.value === 2) return;
    stopAction();
    wake();
    if (sleepTimer.current) clearTimeout(sleepTimer.current);

    const settle = (ms: number) => {
      frameTimer.current = setTimeout(() => {
        setFrame("idle");
        cancelAnimation(tilt);
        tilt.value = 0;
        lift.value = 0;
        armIdle();
      }, ms);
    };

    switch (kind) {
      case "dance":
        setFrame("dance");
        tilt.value = withRepeat(
          withTiming(9, { duration: 240, easing: Easing.inOut(Easing.quad) }),
          -1,
          true,
        );
        lift.value = withRepeat(withTiming(-6, { duration: 240 }), -1, true);
        settle(3200);
        break;
      case "spin":
        setFrame("dance");
        tilt.value = withTiming(
          720,
          { duration: 1100, easing: Easing.inOut(Easing.cubic) },
          () => {
            tilt.value = 0;
          },
        );
        settle(1250);
        break;
      case "eat":
        setFrame("eat");
        feedPet();
        settle(3200);
        break;
      case "study":
        setFrame("study");
        settle(4500);
        break;
      case "sleep":
        setFrame("sleep");
        settle(6000);
        break;
      case "jump":
        setFrame("happy");
        lift.value = withSequence(
          withTiming(-18, { duration: 170, easing: Easing.out(Easing.quad) }),
          withTiming(0, { duration: 200, easing: Easing.in(Easing.quad) }),
          withTiming(-12, { duration: 150 }),
          withTiming(0, { duration: 180 }),
        );
        settle(900);
        break;
      case "wave":
        setFrame("happy");
        tilt.value = withRepeat(withTiming(7, { duration: 170 }), 5, true);
        settle(1100);
        break;
    }
    showBubble(ACTION_LINES[kind], 2200);
    if (!silent) say(ACTION_LINES[kind]);
  };

  /** 空闲时的自娱自乐：饿 / 孤独会优先抱怨，其余时间游动、小动作、自语 */
  const runIdleTick = () => {
    // 正在对话、被拖着/飞着、或动作还没播完时，先不安排新的自娱自乐
    if (chatOpenRef.current || phase.value !== 0 || frameTimer.current) {
      armIdle();
      return;
    }
    const c = useWhalePet.getState().care;
    const roll = rand();
    setFrame((f) => (f === "sleep" ? "idle" : f));

    if (c.fullness < 25 && roll < 0.55) {
      showBubble(pick(HUNGRY_LINES));
    } else if (c.mood < 32 && roll < 0.55) {
      showBubble(pick(LONELY_LINES));
    } else if (roll < 0.3) {
      walkSomewhere();
    } else if (roll < 0.48) {
      playAction(pick(["jump", "wave", "spin"] as const), true);
    } else if (roll < 0.66) {
      showBubble(
        c.bond > 78 && rand() < 0.5
          ? pick(CLOSE_LINES)
          : pick(AMBIENT_LINES),
      );
    }
    armIdle();
  };

  /* ------------------------------------------------------------------ */
  /*  抛掷物理（参考 dsh-pet：重力 / 反弹 / 摩擦 / 落地压扁）             */
  /* ------------------------------------------------------------------ */

  const onFloorHit = (impact: number) => {
    // 冲击越大压得越狠：300px/s 轻落，1500px/s 重砸
    const t = clampNumber((impact - 300) / 1200, 0, 1);
    squash(0.8 - 0.26 * t);
    if (impact > 1100) {
      showBubble("呜哇——摔成鱼饼了！", 1800);
    }
  };

  const onLandRest = () => {
    setFrame("idle");
    landed.value = 0;
    armIdle();
  };

  const onThrowStart = () => {
    stopAction();
    wake();
    landed.value = 0;
    clearBubble();
    setBubble(null);
  };

  const onDragStart = () => {
    stopAction();
    wake();
    cancelAnimation(boxX);
    cancelAnimation(boxY);
    lift.value = withTiming(-8, { duration: 120 });
  };

  const onDragEnd = (thrown: boolean) => {
    lift.value = withTiming(0, { duration: 200 });
    if (!thrown) {
      phase.value = 0;
      armIdle();
    }
  };

  useFrameCallback((info) => {
    if (phase.value !== 2) return;
    const dt = Math.min(
      Math.max((info.timeSincePreviousFrame ?? 16) / 1000, 0.001),
      0.05,
    );
    let x = boxX.value;
    let y = boxY.value;
    let vx = velocityX.value;
    let vy = velocityY.value;
    let floorHit = 0;

    // 一帧位移超过 8px 就拆步，避免高速时跳过落地 / 反弹
    const travel = Math.hypot(vx, vy) * dt;
    const steps = Math.min(16, Math.max(1, Math.ceil(travel / 8)));
    const stepDt = dt / steps;

    for (let i = 0; i < steps; i++) {
      vy += 1400 * stepDt;
      x += vx * stepDt;
      y += vy * stepDt;
      if (x < minX.value) {
        x = minX.value;
        vx = Math.abs(vx) * 0.78;
      } else if (x > maxX.value) {
        x = maxX.value;
        vx = -Math.abs(vx) * 0.78;
      }
      if (y < minY.value) {
        y = minY.value;
        vy = Math.abs(vy) * 0.78;
      } else if (y > maxY.value) {
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
    tilt.value = Math.max(-14, Math.min(14, vx * 0.012));
    if (Math.abs(vx) > 80) face.value = vx > 0 ? 1 : -1;

    if (floorHit > 260 && landed.value === 0) {
      landed.value = 1;
      runOnJS(onFloorHit)(floorHit);
    }

    const atRest =
      y >= maxY.value - 1 && Math.abs(vy) < 1 && Math.abs(vx) < 15;
    if (atRest) {
      phase.value = 0;
      tilt.value = withTiming(0, { duration: 180 });
      runOnJS(onLandRest)();
    }
  }, true);

  const pan = Gesture.Pan()
    .enabled(!chatOpen)
    .minDistance(4)
    .onStart(() => {
      phase.value = 1;
      dragStartX.value = boxX.value;
      dragStartY.value = boxY.value;
      cancelAnimation(boxX);
      cancelAnimation(boxY);
      runOnJS(onDragStart)();
    })
    .onUpdate((e) => {
      boxX.value = Math.min(
        Math.max(dragStartX.value + e.translationX, minX.value),
        maxX.value,
      );
      boxY.value = Math.min(
        Math.max(dragStartY.value + e.translationY, minY.value),
        maxY.value,
      );
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
    });

  const wrapperStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: boxX.value },
      {
        translateY: boxY.value + (H * (1 - sqY.value)) / 2 - lift.value,
      },
      { scale: scale.value },
      { rotate: `${tilt.value}deg` },
      { scaleX: face.value * sqX.value },
      { scaleY: sqY.value },
    ],
  }));

  const bobStyle = useAnimatedStyle(() => ({
    transform: [
      { translateY: bob.value * 3.4 },
      { rotate: `${(bob.value - 0.5) * 1.6}deg` },
    ],
  }));

  /* ------------------------------------------------------------------ */
  /*  点按 / 对话                                                       */
  /* ------------------------------------------------------------------ */

  const poke = () => {
    wake();
    squash(0.84);
    lift.value = withSequence(
      withTiming(-7, { duration: 110, easing: Easing.out(Easing.quad) }),
      withSpring(0, { damping: 17, stiffness: 220 }),
    );
    setFrame("happy");
    if (frameTimer.current) clearTimeout(frameTimer.current);
    frameTimer.current = setTimeout(() => setFrame("idle"), 1500);

    // 点一下算摸头：加心情，但短时间内连点不会无限刷
    if (nowMs() - lastPat.current > 6000) {
      lastPat.current = nowMs();
      patPet();
    }

    const c = useWhalePet.getState().care;
    const line =
      c.fullness < 20 && rand() < 0.5
        ? pick(HUNGRY_LINES)
        : c.bond > 78 && rand() < 0.4
          ? pick(CLOSE_LINES)
          : pick(POKE_LINES);
    showBubble(line);
    say(line);
  };

  /** 三下点开小对话框，位置贴着桌宠并夹在屏幕内 */
  const openChat = () => {
    if (chatOpenRef.current) return;
    const px = boxX.value;
    const py = boxY.value;
    const left = clampNumber(px + SIZE / 2 - PANEL_W / 2, 8, width - PANEL_W - 8);
    const above = py - PANEL_H - 10;
    const top =
      above > insets.top + 8
        ? above
        : clampNumber(
            py + H + 10,
            insets.top + 8,
            height - PANEL_H - insets.bottom - 8,
          );
    setPanelPos({ left, top });
    chatOpenRef.current = true;
    setChatOpen(true);
    clearBubble();
    setBubble(null);
    stopAction();
    // 停下正在进行的游动，免得面板开着鱼还在滑
    cancelAnimation(boxX);
    cancelAnimation(boxY);
    setFrame("idle");
    if (idleTimer.current) clearTimeout(idleTimer.current);
    if (sleepTimer.current) clearTimeout(sleepTimer.current);
    if (chatMsgs.length === 0) {
      setChatMsgs([
        petMsg("assistant", "大爹叫我？想聊什么，还是想看我跳舞呀～"),
      ]);
    }
  };

  const closeChat = () => {
    chatOpenRef.current = false;
    setChatOpen(false);
    armIdle();
  };

  const onPetPress = () => {
    if (chatOpen) {
      poke();
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
    poke();
  };

  /** 面板里的「摸摸头」 */
  const patHead = () => {
    patPet();
    lastPat.current = nowMs();
    setFrame("happy");
    squash(0.82);
    const c = useWhalePet.getState().care;
    const line = c.mood > 96 ? "嘿嘿…再摸下去我要化成一滩水了。" : pick(POKE_LINES);
    showBubble(line);
    say(line);
    if (frameTimer.current) clearTimeout(frameTimer.current);
    frameTimer.current = setTimeout(() => setFrame("idle"), 1600);
  };

  /** 面板里的「喂白饭」 */
  const feedFromPanel = () => {
    playAction("eat");
  };

  /** 大爹专属操作：改口令 / 改背景 / 生图 / 联网，权限与助手页一致 */
  const runWhaleActions = async (
    actions: WhaleAction[],
    userText: string,
  ) => {
    for (const action of actions) {
      if (action.type === "set_summon_phrase") {
        const phrase = String(action.phrase ?? "")
          .replace(/[\s「」"“”'']/g, "")
          .slice(0, 12);
        if (phrase.length < 2) {
          setChatMsgs((prev) =>
            [
              ...prev,
              petMsg("assistant", "这个口令太短啦，换一个 2-12 个字的吧。"),
            ].slice(-30),
          );
          continue;
        }
        setWhalePhrase(phrase);
        const line = `（尾巴晃了晃）记住啦：以后喊「${phrase}」，我就游出来。`;
        setChatMsgs((prev) =>
          [...prev, petMsg("assistant", line)].slice(-30),
        );
        showBubble(line, 2600);
      } else if (action.type === "set_background") {
        const tint = resolveTint(action.tint);
        setBackgroundTint(tint);
        if (action.effect === "aurora" || action.effect === "plain") {
          setBackgroundEffect(action.effect);
        }
        const line = `（把背景调成了「${BACKGROUND_PRESETS[tint].label}」）大爹看看，喜不喜欢？`;
        setChatMsgs((prev) =>
          [...prev, petMsg("assistant", line)].slice(-30),
        );
        showBubble(line, 2600);
      } else if (action.type === "generate_image") {
        const uri = buildImageUrl(String(action.prompt ?? ""), action.size);
        setChatMsgs((prev) =>
          [
            ...prev,
            {
              ...petMsg("assistant", "画好啦，大爹收好。"),
              imageUri: uri,
              imageAspect: imageAspect(action.size),
            },
          ].slice(-30),
        );
      } else if (action.type === "web_search") {
        const query = String(action.query ?? "").trim();
        if (!query) continue;
        try {
          const hits = await searchWeb(query);
          if (!hits.length) throw new Error("没有结果");
          const answer = await answerFromSearch(userText, hits, apiKey);
          setChatMsgs((prev) =>
            [...prev, petMsg("assistant", answer)].slice(-30),
          );
          showBubble(answer, 3000);
          say(answer);
        } catch {
          setChatMsgs((prev) =>
            [
              ...prev,
              petMsg(
                "assistant",
                `呜，网线被海浪打断了……「${query}」没查到。`,
              ),
            ].slice(-30),
          );
        }
      } else if (action.type === "dismiss_pet") {
        setTimeout(() => dismiss(), 700);
      }
    }
  };

  /** 确认执行小对话框里挂起的课表操作 */
  const applyPending = (id: string) => {
    const msg = chatMsgs.find((m) => m.id === id);
    if (!msg?.actions?.length) return;
    const summary = applyScheduleActions(msg.actions, schedule).join("；");
    setChatMsgs((prev) =>
      [
        ...prev.map((m) =>
          m.id === id ? { ...m, actions: undefined } : m,
        ),
        petMsg("assistant", `课表改好啦：${summary}`),
      ].slice(-30),
    );
    showBubble(summary, 2800);
    say("改好啦，大爹。");
  };

  /** 发一句话：动作口令 / 喂饭 / 摸头走本地，日常闲聊交给模型 */
  const sendChat = (text?: string) => {
    const content = (text ?? input).trim();
    if (!content || busy) return;
    setInput("");
    setChatMsgs((prev) => [...prev, petMsg("user", content)].slice(-30));

    const reply = (line: string) => {
      setTimeout(() => {
        setChatMsgs((prev) => [...prev, petMsg("assistant", line)].slice(-30));
        showBubble(line, 2400);
        say(line);
      }, 220);
    };

    /** 只往对话里补一句，气泡和语音交给动作本身 */
    const pushReply = (line: string) => {
      setTimeout(() => {
        setChatMsgs((prev) => [...prev, petMsg("assistant", line)].slice(-30));
      }, 220);
    };

    // 提到课表 / 节次 / 星期几的请求直接交给模型，避免被「吃 / 摸 / 动作」口令截胡
    const looksLikeSchedule =
      /课表|课程|改到|换到|加一门|新增|删掉|删除|新建|合并|第[一二三四五六七八九十0-9]+节|周[一二三四五六日天]/.test(
        content,
      );

    // 想让她回去：桌宠自己收起来
    if (/回去|退下|收起来|藏起来|走吧|变回去|别陪我/.test(content)) {
      reply("呜…那我先回水里啦，大爹记得再叫我。");
      setTimeout(() => dismiss(), 900);
      return;
    }
    if (!looksLikeSchedule && /饿|喂|吃|饭|团子|零食/.test(content)) {
      pushReply("白饭！嗷呜——好吃，谢谢大爹。");
      playAction("eat");
      return;
    }
    if (!looksLikeSchedule && /摸|抱|亲|贴|rua|头/i.test(content)) {
      pushReply("唔…摸头的话，我就原谅你啦。");
      patHead();
      return;
    }

    const local = looksLikeSchedule
      ? undefined
      : LOCAL_ACTIONS.find((a) => a.re.test(content));
    if (local) {
      pushReply(local.reply);
      setTimeout(() => playAction(local.action), 240);
      return;
    }

    if (!apiKey) {
      reply("大爹没喂我 Key，我只能自己玩玩…去设置里填一下，我就能陪你聊天啦。");
      return;
    }

    setBusy(true);
    const history = [
      ...chatMsgs,
      { role: "user" as const, text: content },
    ].map((m) => ({ role: m.role, content: m.text }));
    // 带上当前课表上下文：小对话框也能像助手页一样增删改课表
    const ctx = {
      schedule,
      weekIndex: getDateInfo(schedule.startDate).weekIndex,
      schedules: schedules.map((s) => ({ id: s.id, name: s.name })),
      persona: "whale" as const,
    };
    askWhalePet(history, apiKey, {
      status: careHint(useWhalePet.getState().care),
      ctx,
    })
      .then(async (res) => {
        const scheduleActions = res.actions.filter(isScheduleAction);
        const whaleActions = res.actions.filter(isWhaleAction);
        setChatMsgs((prev) =>
          [
            ...prev,
            {
              ...petMsg("assistant", res.reply),
              actions: scheduleActions.length ? scheduleActions : undefined,
            },
          ].slice(-30),
        );
        showBubble(res.reply, 2800);
        say(res.reply);
        // 回复已经念过一遍，动作只播画面，不再重复念台词
        if (res.action) playAction(res.action, true);
        if (whaleActions.length) await runWhaleActions(whaleActions, content);
      })
      .catch((e) => {
        setChatMsgs((prev) =>
          [
            ...prev,
            petMsg(
              "assistant",
              e instanceof Error ? e.message : "鱼脑子卡住了，再说一次？",
            ),
          ].slice(-30),
        );
      })
      .finally(() => setBusy(false));
  };

  const dismiss = () => {
    if (leaveTimer.current) return;
    stopWhaleVoice();
    closeChat();
    stopAction();
    showBubble("那我先回水里啦，大爹记得再叫我…", 1000);
    setFrame("sleep");
    scale.value = withTiming(0.35, {
      duration: 620,
      easing: Easing.in(Easing.cubic),
    });
    leaveTimer.current = setTimeout(() => {
      leaveTimer.current = null;
      hide();
    }, 700);
  };

  const panelTop =
    kbHeight > 0
      ? Math.max(insets.top + 8, height - kbHeight - PANEL_H - 8)
      : panelPos.top;

  const hungry = care.fullness < 25;
  const lonely = care.mood < 32;

  return (
    <View pointerEvents="box-none" style={StyleSheet.absoluteFill}>
      <GestureDetector gesture={pan}>
        <Animated.View
          style={[
            { position: "absolute", left: 0, top: 0, zIndex: 20 },
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
                width: 18,
                height: 18,
                borderRadius: 9,
                alignItems: "center",
                justifyContent: "center",
                backgroundColor: hungry ? "rgba(251,191,36,0.95)" : "#38BDF8",
                borderWidth: 1,
                borderColor: "rgba(255,255,255,0.65)",
                zIndex: 4,
              }}
            >
              <Ionicons
                name={hungry ? "restaurant" : "sad"}
                size={10}
                color="#172033"
              />
            </Animated.View>
          ) : null}

          {/* 气泡：贴顶时自动翻到下方，靠边时自动朝内 */}
          {bubble ? (
            <Animated.View
              entering={FadeIn.duration(150)}
              exiting={FadeOut.duration(120)}
              pointerEvents="none"
              style={{
                position: "absolute",
                width: 186,
                ...(bubbleBelow ? { top: H + 8 } : { bottom: H + 8 }),
                ...(nearRight ? { right: 0 } : { left: 0 }),
                borderRadius: 13,
                paddingHorizontal: 9,
                paddingVertical: 7,
                backgroundColor: isDark
                  ? "rgba(10,18,34,0.9)"
                  : "rgba(255,255,255,0.95)",
                borderWidth: 1,
                borderColor: isDark
                  ? "rgba(125,211,252,0.26)"
                  : "rgba(56,189,248,0.3)",
                zIndex: 5,
              }}
            >
              <Text
                style={{
                  fontSize: 10.5,
                  color: isDark ? "#E4F2FF" : "#0F2A43",
                }}
              >
                {bubble}
              </Text>
            </Animated.View>
          ) : null}

          <Pressable
            onPress={onPetPress}
            onLongPress={dismiss}
            delayLongPress={620}
            hitSlop={{ top: 8, bottom: 8, left: 6, right: 6 }}
          >
            <Animated.View style={bobStyle}>
              <View
                style={{
                  position: "absolute",
                  left: SIZE * 0.22,
                  bottom: 2,
                  width: SIZE * 0.56,
                  height: 6,
                  borderRadius: 99,
                  backgroundColor: "rgba(0,0,0,0.16)",
                }}
              />
              <Animated.Image
                source={SPRITES[frame]}
                resizeMode="contain"
                style={{ width: SIZE, height: H }}
              />
            </Animated.View>
          </Pressable>
        </Animated.View>
      </GestureDetector>

      {/* 小对话框：点桌宠三下打开 */}
      {chatOpen ? (
        <Animated.View
          entering={FadeInDown.springify().damping(22)}
          exiting={FadeOut.duration(120)}
          style={{
            position: "absolute",
            left: panelPos.left,
            top: panelTop,
            width: PANEL_W,
            zIndex: 30,
            borderRadius: 22,
            paddingTop: 10,
            paddingBottom: 2,
            overflow: "hidden",
            backgroundColor: isDark
              ? "rgba(10,18,34,0.96)"
              : "rgba(255,255,255,0.97)",
            borderWidth: 1,
            borderColor: isDark
              ? "rgba(125,211,252,0.3)"
              : "rgba(56,189,248,0.35)",
          }}
        >
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              paddingHorizontal: 12,
            }}
          >
            <View
              style={{
                width: 6,
                height: 6,
                borderRadius: 3,
                marginRight: 6,
                backgroundColor: "#38BDF8",
              }}
            />
            <Text
              style={{
                flex: 1,
                fontSize: 11.5,
                fontWeight: "700",
                color: isDark ? "#E2F2FF" : "#0C4A6E",
              }}
            >
              大肥鱼
            </Text>
            <Pressable
              onPress={() => {
                const next = !voiceOn;
                toggleVoice();
                if (next) speakWhale("声音开好啦，大爹。");
                else stopWhaleVoice();
              }}
              hitSlop={8}
              style={{ marginRight: 10 }}
            >
              <Ionicons
                name={voiceOn ? "volume-high" : "volume-mute"}
                size={15}
                color={voiceOn ? "#38BDF8" : isDark ? "#64748B" : "#94A3B8"}
              />
            </Pressable>
            <Pressable onPress={closeChat} hitSlop={8}>
              <Ionicons
                name="close"
                size={15}
                color={isDark ? "#7DD3FC" : "#0284C7"}
              />
            </Pressable>
          </View>

          {/* 养护状态：饱食 / 心情 / 好感 */}
          <View
            style={{
              flexDirection: "row",
              gap: 8,
              paddingHorizontal: 12,
              paddingTop: 9,
            }}
          >
            <CareBar
              label="饱食"
              value={care.fullness}
              color="#FBBF24"
              isDark={isDark}
            />
            <CareBar
              label="心情"
              value={care.mood}
              color="#38BDF8"
              isDark={isDark}
            />
            <CareBar
              label="好感"
              value={care.bond}
              color="#F472B6"
              isDark={isDark}
            />
          </View>

          <View
            style={{
              flexDirection: "row",
              gap: 6,
              paddingHorizontal: 12,
              paddingTop: 8,
            }}
          >
            <CareAction
              icon="restaurant"
              label={hungry ? "喂白饭" : "喂一口"}
              onPress={feedFromPanel}
              isDark={isDark}
            />
            <CareAction
              icon="hand-left"
              label="摸摸头"
              onPress={patHead}
              isDark={isDark}
            />
            <CareAction
              icon="moon"
              label="收起来"
              onPress={dismiss}
              isDark={isDark}
            />
          </View>

          <ScrollView
            ref={chatRef}
            style={{ maxHeight: 96, marginTop: 9 }}
            contentContainerStyle={{ paddingHorizontal: 10, gap: 6 }}
            showsVerticalScrollIndicator={false}
            onContentSizeChange={() =>
              chatRef.current?.scrollToEnd({ animated: true })
            }
          >
            {chatMsgs.map((m) => (
              <View
                key={m.id}
                style={{
                  alignItems: m.role === "user" ? "flex-end" : "flex-start",
                }}
              >
                {m.imageUri ? (
                  <View style={{ marginBottom: 6 }}>
                    <ChatImage uri={m.imageUri} aspectRatio={m.imageAspect} />
                  </View>
                ) : null}
                <View
                  style={{
                    maxWidth: "92%",
                    borderRadius: 12,
                    paddingHorizontal: 9,
                    paddingVertical: 6,
                    backgroundColor:
                      m.role === "user"
                        ? "rgba(56,189,248,0.82)"
                        : isDark
                          ? "rgba(125,211,252,0.14)"
                          : "rgba(14,165,233,0.1)",
                  }}
                >
                  <Text
                    style={{
                      fontSize: 11,
                      color:
                        m.role === "user"
                          ? "#FFFFFF"
                          : isDark
                            ? "#E4F2FF"
                            : "#0F172A",
                    }}
                  >
                    {m.text}
                  </Text>
                  {m.actions?.length ? (
                    <Pressable
                      onPress={() => applyPending(m.id)}
                      style={{
                        marginTop: 6,
                        alignSelf: "flex-start",
                        borderRadius: 999,
                        paddingHorizontal: 9,
                        paddingVertical: 4,
                        backgroundColor: "rgba(52,211,153,0.9)",
                      }}
                    >
                      <Text style={{ fontSize: 10, color: "#062B23" }}>
                        确认修改课表 · {m.actions.length} 项
                      </Text>
                    </Pressable>
                  ) : null}
                </View>
              </View>
            ))}
          </ScrollView>

          <View
            style={{
              flexDirection: "row",
              flexWrap: "wrap",
              gap: 6,
              paddingHorizontal: 10,
              paddingTop: 8,
            }}
          >
            {PET_CHIPS.map((label) => (
              <Pressable
                key={label}
                onPress={() => sendChat(label)}
                style={{
                  borderRadius: 999,
                  borderWidth: 1,
                  paddingHorizontal: 9,
                  paddingVertical: 4,
                  borderColor: isDark
                    ? "rgba(125,211,252,0.28)"
                    : "rgba(14,165,233,0.25)",
                  backgroundColor: isDark
                    ? "rgba(125,211,252,0.08)"
                    : "rgba(14,165,233,0.07)",
                }}
              >
                <Text
                  style={{
                    fontSize: 10,
                    color: isDark ? "#9BD9FF" : "#0369A1",
                  }}
                >
                  {label}
                </Text>
              </Pressable>
            ))}
          </View>

          <ChatInputBar
            value={input}
            onChangeText={setInput}
            onSend={() => sendChat()}
            busy={busy}
            placeholder="跟她说点什么…"
            bottomInset={6}
          />
        </Animated.View>
      ) : null}
    </View>
  );
}

/** 养护数值的小进度条 */
function CareBar({
  label,
  value,
  color,
  isDark,
}: {
  label: string;
  value: number;
  color: string;
  isDark: boolean;
}) {
  return (
    <View style={{ flex: 1 }}>
      <View
        style={{
          flexDirection: "row",
          justifyContent: "space-between",
          marginBottom: 3,
        }}
      >
        <Text
          style={{
            fontSize: 8.5,
            color: isDark ? "rgba(148,197,235,0.75)" : "#64748B",
          }}
        >
          {label}
        </Text>
        <Text
          style={{
            fontSize: 8.5,
            color: isDark ? "rgba(148,197,235,0.75)" : "#64748B",
          }}
        >
          {Math.round(value)}
        </Text>
      </View>
      <View
        style={{
          height: 4,
          borderRadius: 2,
          overflow: "hidden",
          backgroundColor: isDark
            ? "rgba(255,255,255,0.1)"
            : "rgba(148,163,184,0.22)",
        }}
      >
        <View
          style={{
            width: `${clampNumber(value, 3, 100)}%`,
            height: "100%",
            borderRadius: 2,
            backgroundColor: color,
          }}
        />
      </View>
    </View>
  );
}

/** 面板里的养护按钮 */
function CareAction({
  icon,
  label,
  onPress,
  isDark,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  onPress: () => void;
  isDark: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={{
        flex: 1,
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "center",
        gap: 4,
        borderRadius: 10,
        borderWidth: 1,
        paddingVertical: 6,
        borderColor: isDark
          ? "rgba(125,211,252,0.24)"
          : "rgba(14,165,233,0.22)",
        backgroundColor: isDark
          ? "rgba(125,211,252,0.08)"
          : "rgba(14,165,233,0.07)",
      }}
    >
      <Ionicons
        name={icon}
        size={11}
        color={isDark ? "#9BD9FF" : "#0369A1"}
      />
      <Text
        style={{ fontSize: 9.5, color: isDark ? "#9BD9FF" : "#0369A1" }}
      >
        {label}
      </Text>
    </Pressable>
  );
}
