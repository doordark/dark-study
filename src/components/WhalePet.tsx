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
  useSharedValue,
  withRepeat,
  withSequence,
  withSpring,
  withTiming,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useColorScheme } from "nativewind";

import { ChatInputBar } from "@/components/ChatInputBar";
import { askWhalePet } from "@/services/ai";
import { useSettings } from "@/store/useSettings";
import { useWhalePet } from "@/store/useWhalePet";
import type { PetActionKind } from "@/types";
import { uid } from "@/utils/id";

/* eslint-disable react-hooks/immutability --
   Reanimated shared value（x/y/scale/bob/turn/hop）本质是跨渲染、跨线程可变的容器，
   手势回调与 effect 对其赋值是官方标准用法，React 编译器的不可变假设不适用 */

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
const RATIO = 1.37;
const EDGE = 8;
const PANEL_W = 246;

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

/** 没人理的时候自己嘀咕 */
const AMBIENT_LINES = [
  "大爹，写累了就歇会儿。",
  "我不占地方，就在边上待着。",
  "这屏幕好亮啊，眼睛会疼的。",
  "要不要摸一下我的头？",
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

/** 三下点开小对话框后的快捷动作 */
const PET_CHIPS = ["跳个舞", "转个圈", "吃团子", "陪我学习"];

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

const SLEEP_AFTER = 26_000;
const AMBIENT_EVERY = 24_000;

interface PetMsg {
  id: string;
  role: "user" | "assistant";
  text: string;
}

/** 随机挑一句，抽到组件外避免被 React 编译器误判为渲染期副作用 */
function randomLine(lines: string[]): string {
  return lines[Math.floor(Math.random() * lines.length)];
}

/** 当前时间戳，同上抽到组件外 */
const tapNow = () => Date.now();

/**
 * 大肥鱼桌宠：常驻在应用最上层的可拖拽小鲸鱼。
 * 拖到哪停在哪（松手自动吸到最近屏幕边），轻点有反应，连点三下开小对话框，
 * 长按收回。对话里可以让她跳舞、转圈、吃团子、陪你学习。
 */
export function WhalePet() {
  const visible = useWhalePet((s) => s.visible);
  if (!visible) return null;
  // 每次被叫出来都重新挂载：气泡、表情与睡眠计时自然重置
  return <WhalePetLayer />;
}

function WhalePetLayer() {
  const hide = useWhalePet((s) => s.hide);
  const apiKey = useSettings((s) => s.apiKey);
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const { colorScheme } = useColorScheme();
  const isDark = colorScheme !== "light";

  const x = useSharedValue(width - SIZE - EDGE);
  const y = useSharedValue(height * 0.6);
  const startX = useSharedValue(0);
  const startY = useSharedValue(0);
  const scale = useSharedValue(0.4);
  const bob = useSharedValue(0);
  /** 动作：左右扭动的角度 / 蹦跳的位移 / 转圈角度 */
  const turn = useSharedValue(0);
  const hop = useSharedValue(0);

  const [frame, setFrame] = useState<PetFrame>("idle");
  const [bubble, setBubble] = useState<string | null>(
    "大爹，我出来啦～拖我到哪儿都行，戳我三下能说话",
  );
  const [nearRight, setNearRight] = useState(true);

  const [chatOpen, setChatOpen] = useState(false);
  const [chatMsgs, setChatMsgs] = useState<PetMsg[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [panelPos, setPanelPos] = useState({ left: 12, top: 120 });
  const [kbHeight, setKbHeight] = useState(0);

  const bubbleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const frameTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const sleepTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const leaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const actionTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const chatRef = useRef<ScrollViewInstance>(null);
  const taps = useRef({ count: 0, at: 0 });

  const showBubble = (text: string, ms = 2600) => {
    if (bubbleTimer.current) clearTimeout(bubbleTimer.current);
    setBubble(text);
    bubbleTimer.current = setTimeout(() => setBubble(null), ms);
  };

  /** 重新计时：一段时间没人碰就打瞌睡 */
  const armSleep = () => {
    if (sleepTimer.current) clearTimeout(sleepTimer.current);
    setFrame((f) => (f === "sleep" ? "idle" : f));
    sleepTimer.current = setTimeout(() => setFrame("sleep"), SLEEP_AFTER);
  };

  // 登场：从右下角弹出来；开场招呼用初始 state，这里只负责按时收起
  useEffect(() => {
    x.value = width - SIZE - EDGE;
    y.value = height * 0.6;
    scale.value = 0.4;
    scale.value = withSpring(1, { damping: 14, stiffness: 190 });
    bubbleTimer.current = setTimeout(() => setBubble(null), 4200);
    sleepTimer.current = setTimeout(() => setFrame("sleep"), SLEEP_AFTER);
  }, [width, height, x, y, scale]);

  // 待机呼吸
  useEffect(() => {
    bob.value = withRepeat(
      withTiming(1, { duration: 1800, easing: Easing.inOut(Easing.sin) }),
      -1,
      true,
    );
    return () => {
      cancelAnimation(bob);
      bob.value = 0;
    };
  }, [bob]);

  // 键盘高度：打开对话框时用，避免输入框被键盘盖住
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

  // 自己嘀咕 + 组件卸载时清理全部定时器
  useEffect(() => {
    const ambient = setInterval(() => {
      setBubble((cur) => {
        if (cur) return cur;
        return AMBIENT_LINES[Math.floor(Math.random() * AMBIENT_LINES.length)];
      });
    }, AMBIENT_EVERY);
    return () => {
      clearInterval(ambient);
      if (bubbleTimer.current) clearTimeout(bubbleTimer.current);
      if (frameTimer.current) clearTimeout(frameTimer.current);
      if (sleepTimer.current) clearTimeout(sleepTimer.current);
      if (leaveTimer.current) clearTimeout(leaveTimer.current);
      if (actionTimer.current) clearTimeout(actionTimer.current);
    };
  }, []);

  const pan = Gesture.Pan()
    .enabled(!chatOpen)
    .minDistance(5)
    .onStart(() => {
      startX.value = x.value;
      startY.value = y.value;
    })
    .onUpdate((e) => {
      const minY = insets.top + 56;
      const maxY = height - SIZE * RATIO - insets.bottom - 18;
      x.value = Math.min(
        Math.max(startX.value + e.translationX, EDGE),
        width - SIZE - EDGE,
      );
      y.value = Math.min(Math.max(startY.value + e.translationY, minY), maxY);
    })
    .onEnd(() => {
      const right = x.value > width / 2;
      x.value = withSpring(right ? width - SIZE - EDGE : EDGE, {
        damping: 26,
        stiffness: 240,
      });
      runOnJS(setNearRight)(right);
    });

  const style = useAnimatedStyle(() => ({
    transform: [
      { translateX: x.value },
      { translateY: y.value },
      { scale: scale.value },
    ],
  }));

  const bobStyle = useAnimatedStyle(() => ({
    transform: [
      { translateY: bob.value * 3 + hop.value },
      { rotate: `${turn.value}deg` },
    ],
  }));

  /** 收掉正在播放的动作 */
  const stopAction = () => {
    if (actionTimer.current) clearTimeout(actionTimer.current);
    cancelAnimation(turn);
    cancelAnimation(hop);
    turn.value = 0;
    hop.value = 0;
  };

  /** 播放一个动作，结束后回到待机 */
  const playAction = (kind: PetActionKind) => {
    stopAction();
    if (sleepTimer.current) clearTimeout(sleepTimer.current);
    if (frameTimer.current) clearTimeout(frameTimer.current);

    const settle = (ms: number) => {
      actionTimer.current = setTimeout(() => {
        setFrame("idle");
        turn.value = 0;
        hop.value = 0;
        armSleep();
      }, ms);
    };

    switch (kind) {
      case "dance":
        setFrame("dance");
        turn.value = withRepeat(
          withTiming(9, { duration: 240, easing: Easing.inOut(Easing.quad) }),
          -1,
          true,
        );
        hop.value = withRepeat(withTiming(-5, { duration: 240 }), -1, true);
        settle(3200);
        break;
      case "spin":
        setFrame("dance");
        turn.value = withTiming(
          720,
          { duration: 1100, easing: Easing.inOut(Easing.cubic) },
          () => {
            turn.value = 0;
          },
        );
        settle(1250);
        break;
      case "eat":
        setFrame("eat");
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
        hop.value = withSequence(
          withTiming(-14, { duration: 170, easing: Easing.out(Easing.quad) }),
          withTiming(0, { duration: 200, easing: Easing.in(Easing.quad) }),
          withTiming(-10, { duration: 150 }),
          withTiming(0, { duration: 180 }),
        );
        settle(900);
        break;
      case "wave":
        setFrame("happy");
        turn.value = withRepeat(withTiming(7, { duration: 170 }), 5, true);
        settle(1100);
        break;
    }
    showBubble(ACTION_LINES[kind], 2600);
  };

  const poke = () => {
    stopAction();
    setFrame("happy");
    scale.value = withSequence(
      withSpring(1.12, { damping: 26, stiffness: 240 }),
      withSpring(1, { damping: 26, stiffness: 240 }),
    );
    if (frameTimer.current) clearTimeout(frameTimer.current);
    frameTimer.current = setTimeout(() => setFrame("idle"), 1500);
    showBubble(randomLine(POKE_LINES));
    armSleep();
  };

  /** 三下点开小对话框，位置贴着桌宠并夹在屏幕内 */
  const openChat = () => {
    if (chatOpen) return;
    const px = x.value;
    const py = y.value;
    const left = Math.min(
      Math.max(px + SIZE / 2 - PANEL_W / 2, 8),
      width - PANEL_W - 8,
    );
    const top =
      py - 306 > insets.top + 52
        ? py - 306
        : Math.min(py + SIZE * RATIO + 12, height - 330);
    setPanelPos({ left, top });
    setChatOpen(true);
    setBubble(null);
    if (chatMsgs.length === 0) {
      setChatMsgs([
        {
          id: uid(),
          role: "assistant",
          text: "大爹叫我？想聊什么，还是想看我跳舞呀～",
        },
      ]);
    }
  };

  const onPetPress = () => {
    if (chatOpen) {
      poke();
      return;
    }
    const now = tapNow();
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

  /** 发一句话：动作口令本地直接播，日常闲聊交给模型 */
  const sendChat = (text?: string) => {
    const content = (text ?? input).trim();
    if (!content || busy) return;
    setInput("");
    setChatMsgs((prev) => [
      ...prev,
      { id: uid(), role: "user", text: content },
    ]);

    const local = LOCAL_ACTIONS.find((a) => a.re.test(content));
    if (local) {
      setTimeout(() => {
        setChatMsgs((prev) => [
          ...prev,
          { id: uid(), role: "assistant", text: local.reply },
        ]);
        playAction(local.action);
      }, 260);
      return;
    }

    if (!apiKey) {
      setTimeout(() => {
        setChatMsgs((prev) => [
          ...prev,
          {
            id: uid(),
            role: "assistant",
            text: "大爹没喂我 Key，我只能自己玩玩…去设置里填一下，我就能陪你聊天啦。",
          },
        ]);
      }, 300);
      return;
    }

    setBusy(true);
    const history = [...chatMsgs, { role: "user" as const, text: content }].map(
      (m) => ({ role: m.role, content: m.text }),
    );
    askWhalePet(history, apiKey)
      .then((res) => {
        setChatMsgs((prev) => [
          ...prev,
          { id: uid(), role: "assistant", text: res.reply },
        ]);
        if (res.action) playAction(res.action);
      })
      .catch((e) => {
        setChatMsgs((prev) => [
          ...prev,
          {
            id: uid(),
            role: "assistant",
            text: e instanceof Error ? e.message : "鱼脑子卡住了，再说一次？",
          },
        ]);
      })
      .finally(() => setBusy(false));
  };

  const dismiss = () => {
    if (leaveTimer.current) return;
    setChatOpen(false);
    stopAction();
    showBubble("那我先回水里啦，大爹记得再叫我…", 1200);
    setFrame("sleep");
    leaveTimer.current = setTimeout(() => {
      leaveTimer.current = null;
      hide();
    }, 900);
  };

  const panelTop =
    kbHeight > 0
      ? Math.max(insets.top + 56, height - kbHeight - 316)
      : panelPos.top;

  return (
    <View pointerEvents="box-none" style={StyleSheet.absoluteFill}>
      <GestureDetector gesture={pan}>
        <Animated.View
          style={[
            { position: "absolute", left: 0, top: 0, zIndex: 20 },
            { width: SIZE, height: SIZE * RATIO },
            style,
          ]}
        >
          {bubble ? (
            <Animated.View
              entering={FadeIn.duration(160)}
              exiting={FadeOut.duration(120)}
              pointerEvents="none"
              style={{
                position: "absolute",
                bottom: SIZE * RATIO - 6,
                width: 176,
                ...(nearRight ? { right: 0 } : { left: 0 }),
                borderRadius: 12,
                paddingHorizontal: 9,
                paddingVertical: 7,
                backgroundColor: "rgba(10,18,34,0.86)",
                borderWidth: 1,
                borderColor: "rgba(125,211,252,0.26)",
              }}
            >
              <Text style={{ color: "#E4F2FF", fontSize: 10.5 }}>
                {bubble}
              </Text>
            </Animated.View>
          ) : null}

          <Pressable
            onPress={onPetPress}
            onLongPress={dismiss}
            delayLongPress={620}
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
                style={{ width: SIZE, height: SIZE * RATIO }}
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
            borderRadius: 20,
            paddingTop: 10,
            paddingBottom: 2,
            overflow: "hidden",
            backgroundColor: isDark
              ? "rgba(10,18,34,0.95)"
              : "rgba(255,255,255,0.96)",
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
            <Pressable onPress={() => setChatOpen(false)} hitSlop={8}>
              <Ionicons
                name="close"
                size={15}
                color={isDark ? "#7DD3FC" : "#0284C7"}
              />
            </Pressable>
          </View>

          <ScrollView
            ref={chatRef}
            style={{ maxHeight: 118, marginTop: 8 }}
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
