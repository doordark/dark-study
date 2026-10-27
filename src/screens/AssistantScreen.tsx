import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import React, { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Image,
  Keyboard,
  Linking,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  Text,
  View,
  type ScrollViewInstance,
} from "react-native";
import Animated, {
  FadeIn,
  FadeInDown,
  FadeOut,
} from "react-native-reanimated";

import { Backdrop } from "@/components/Backdrop";
import { ChatImage } from "@/components/ChatImage";
import { ChatInputBar } from "@/components/ChatInputBar";
import { GlassContainer } from "@/components/GlassContainer";
import { SuggestionButton } from "@/components/SuggestionButton";
import { WhaleAvatar } from "@/components/WhaleAvatar";
import { WhaleDeco } from "@/components/WhaleDeco";
import { WhaleLeaveFX, WhaleSummonFX } from "@/components/WhaleSummonFX";
import { BACKGROUND_PRESETS, resolveTint } from "@/constants/backgrounds";
import {
  WHALE_STICKERS,
  matchSticker,
  randomSticker,
} from "@/constants/whaleStickers";
import type { WhaleStickerId } from "@/constants/whaleStickers";
import { askAssistant } from "@/services/ai";
import type { AssistantResult } from "@/services/ai";
import { applyScheduleActions } from "@/services/assistantSchedule";
import {
  answerFromSearch,
  buildImageUrl,
  imageAspect,
  searchWeb,
} from "@/services/whaleTools";
import { speakWhale, stopWhaleVoice } from "@/services/whaleVoice";
import { useSettings } from "@/store/useSettings";
import { useWhaleMemory } from "@/store/useWhaleMemory";
import { useWhalePet } from "@/store/useWhalePet";
import { useWhaleVoice } from "@/store/useWhaleVoice";
import { useActiveSchedule, useStore } from "@/store/useStore";
import type {
  AssistantAction,
  ChatMessage,
  ScheduleAction,
  WhaleAction,
} from "@/types";
import { nowTs, uid } from "@/utils/id";
import {
  bumpHaptic,
  successHaptic,
  tapHaptic,
  thumpHaptic,
  warnHaptic,
} from "@/utils/haptics";
import { getDateInfo } from "@/utils/time";

const SUGGESTIONS = [
  "把周三的体育课改到周五下午",
  "新建一份叫「外教课」的课表",
  "帮我把周六的学术写作工作坊删掉",
  "这学期哪天的课最多？",
  "给周四加一门晚上 7 点的《人工智能导论》",
];

/** 大爹专属：大肥鱼的额外玩法，普通课表助手没有这些入口 */
const WHALE_SUGGESTIONS = [
  "出来陪我",
  "帮我看看今日运势",
  "夸夸我",
  "今天吃什么",
  "摸鱼一下",
  "把背景换成晚霞粉",
  "让背景变成薄荷绿",
  "帮我搜一下最近有什么 AI 新闻",
  "画一张你在吃白饭的样子",
  "行了你先退下吧，我要好好学习了",
];

/** 想让她到屏幕边上陪着（桌宠）的说法；精确口令走本地，语义判断交给模型 */
const PET_WORDS = /桌宠|出来陪我|出来陪|陪我玩|出来玩|跳出来|爬出来/;

/** 连点头像时的递进反应，最后一次会把她叫成桌宠 */
const AVATAR_TAPS = [
  "别戳啦，会戳出水的…",
  "呜，我可是会记仇的（假装）",
  "再戳？再戳我就从屏幕里爬出来找你",
  "……好啦，其实我也想一直陪着你",
  "那我出来啦，大爹别把我收回去呀",
];

/** 按回复情绪挑表情包：优先匹配情绪，否则小概率随机来一张 */
function pickStickerForReply(reply: string): WhaleStickerId | null {
  const mood = matchSticker(reply);
  if (mood && Math.random() < 0.7) return mood;
  if (Math.random() < 0.3) return randomSticker();
  return null;
}

/** 除自定义口令外始终有效的通用召唤词 */
const SUMMON_ALIASES = ["召唤大肥鱼", "大肥鱼出来", "肥鱼出来"];
const DISMISS_ALIASES = ["大爹走了", "退下吧", "变回课表助手"];

const normalizeCmd = (text: string) => text.trim().replace(/[!！。.~～]+$/, "");

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

export function AssistantScreen() {
  const apiKey = useSettings((s) => s.apiKey);
  const whalePhrase = useSettings((s) => s.whalePhrase);
  const setWhalePhrase = useSettings((s) => s.setWhalePhrase);
  const setBackgroundTint = useSettings((s) => s.setBackgroundTint);
  const setBackgroundEffect = useSettings((s) => s.setBackgroundEffect);
  const schedule = useActiveSchedule();
  const schedules = useStore((s) => s.schedules);

  // 大肥鱼的对话与人格状态存在本地，退出应用后记忆还在
  const messages = useWhaleMemory((s) => s.messages);
  const setMessages = useWhaleMemory((s) => s.setMessages);
  const whale = useWhaleMemory((s) => s.active);
  const setWhale = useWhaleMemory((s) => s.setActive);
  const archiveMemory = useWhaleMemory((s) => s.archive);
  const restoreMemory = useWhaleMemory((s) => s.restore);
  const removeMemoryMessages = useWhaleMemory((s) => s.removeMessages);
  const clearMemory = useWhaleMemory((s) => s.clearMemory);
  // 长按消息进入多选，挑着删
  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{
    type: "error" | "success";
    text: string;
  } | null>(null);
  const [kbHeight, setKbHeight] = useState(0);
  const scrollRef = useRef<ScrollViewInstance>(null);
  const voiceOn = useWhaleVoice((s) => s.on);
  const toggleVoiceStore = useWhaleVoice((s) => s.toggle);
  const hydrateVoice = useWhaleVoice((s) => s.hydrate);
  const spokenId = useRef<string | null>(null);
  const longPressAt = useRef(0);
  const [summonFx, setSummonFx] = useState(false);
  const [leaveFx, setLeaveFx] = useState(false);
  const [preview, setPreview] = useState<string | null>(null);
  /** 点头像时的反应气泡 */
  const [reaction, setReaction] = useState<string | null>(null);
  const taps = useRef({ count: 0, at: 0 });
  const reactionTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const stickerTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** 退场动画期间延后的「切人格 / 追加告别 / 归档记忆」定时器 */
  const leaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const settleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const showPet = useWhalePet((s) => s.show);
  const hidePet = useWhalePet((s) => s.hide);

  // 本地精确口令只作为「零延迟快捷通道」：其余任何说法都交给模型按语义识别
  const isSummonCmd = (text: string) => {
    const cmd = normalizeCmd(text);
    return cmd === normalizeCmd(whalePhrase) || SUMMON_ALIASES.includes(cmd);
  };
  const isDismissCmd = (text: string) =>
    DISMISS_ALIASES.includes(normalizeCmd(text));

  // 语音开关与桌宠共用同一份本地记忆，默认开着
  useEffect(() => {
    hydrateVoice();
  }, [hydrateVoice]);

  /** 大肥鱼开口：每条新的助手消息只读一次，静音或人格不在时默默跳过 */
  useEffect(() => {
    if (messages.length === 0) return;
    const last = messages[messages.length - 1];
    if (last.role !== "assistant" || last.id === spokenId.current) return;
    spokenId.current = last.id;
    if (!whale || !voiceOn) return;
    speakWhale(last.content);
  }, [messages, whale, voiceOn]);

  // 离开页面时让她闭嘴
  useEffect(() => () => stopWhaleVoice(), []);

  const localMsg = (content: string): ChatMessage => ({
    id: uid(),
    role: "assistant",
    content,
    timestamp: nowTs(),
  });

  const pushLocal = (content: string) => {
    setMessages((prev) => [...prev, localMsg(content)]);
  };

  /** 追加一条只显示表情包的消息 */
  const pushSticker = (id: WhaleStickerId) => {
    setMessages((prev) => [
      ...prev,
      {
        id: uid(),
        role: "assistant",
        content: "",
        sticker: id,
        timestamp: nowTs(),
      },
    ]);
  };

  /** 头像旁边冒一句短反应 */
  const flashReaction = (text: string) => {
    if (reactionTimer.current) clearTimeout(reactionTimer.current);
    setReaction(text);
    reactionTimer.current = setTimeout(() => setReaction(null), 2800);
  };

  /** 长按任意一条消息：进入多选并勾上它 */
  const enterSelect = (id: string) => {
    tapHaptic();
    setSelectMode(true);
    setSelectedIds([id]);
  };

  const toggleSelect = (id: string) =>
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );

  const exitSelect = () => {
    setSelectMode(false);
    setSelectedIds([]);
  };

  /** 删掉勾中的消息（记忆里同一批也一起删掉） */
  const deleteSelected = () => {
    if (!selectedIds.length) return;
    bumpHaptic();
    removeMemoryMessages(selectedIds);
    exitSelect();
  };

  /**
   * 连点头像：前两下不打扰你，第三下开始有反应，
   * 一直点到第五句时她会从屏幕边爬出来当桌宠。
   */
  const onAvatarTap = () => {
    const now = Date.now();
    if (now - taps.current.at > 2400) taps.current.count = 0;
    taps.current.count += 1;
    taps.current.at = now;
    const n = taps.current.count;
    if (n < 3) return;
    tapHaptic();
    const idx = Math.min(n - 3, AVATAR_TAPS.length - 1);
    flashReaction(AVATAR_TAPS[idx]);
    if (idx === AVATAR_TAPS.length - 1) {
      taps.current.count = 0;
      thumpHaptic();
      showPet();
    }
  };

  useEffect(
    () => () => {
      if (reactionTimer.current) clearTimeout(reactionTimer.current);
      if (stickerTimer.current) clearTimeout(stickerTimer.current);
      if (leaveTimer.current) clearTimeout(leaveTimer.current);
      if (settleTimer.current) clearTimeout(settleTimer.current);
    },
    [],
  );

  const rememberWhale = (on: boolean) => setWhale(on);

  /** 进入鲸鱼人格；message 为空时由模型返回的回复充当登场白 */
  const enterWhale = (message?: string) => {
    restoreMemory();
    setWhale(true);
    setSummonFx(true);
    thumpHaptic();
    Keyboard.dismiss();
    if (message) pushLocal(message);
  };

  /** 收回人格：先播退场动效，动画结束后再切回普通助手界面 */
  const leaveWhale = (message?: string) => {
    if (leaveFx) return;
    bumpHaptic();
    // 先只挂动效遮罩；切人格、追加告别消息都挪到遮罩最深的时候再做，
    // 否则一堆重渲染和动画首帧撞在一起，退场会明显卡一下
    setLeaveFx(true);
    if (leaveTimer.current) clearTimeout(leaveTimer.current);
    leaveTimer.current = setTimeout(() => {
      rememberWhale(false);
      if (message) pushLocal(message);
    }, 360);
  };

  /** 退场动效结束：真正收回鲸鱼人格，聊天记录先存进记忆下次接着聊 */
  const finishLeaveWhale = () => {
    setLeaveFx(false);
    // 遮罩撤掉的那一帧先别做任何重活，把收尾推到下一帧之后
    requestAnimationFrame(() => {
      setReaction(null);
      setPreview(null);
      setNotice(null);
      setInput("");
      spokenId.current = null;
      taps.current.count = 0;
      exitSelect();
      // 归档要序列化整段对话，再往后挪一点，别卡在动画收尾上
      settleTimer.current = setTimeout(() => archiveMemory(), 320);
    });
  };

  const summonWhale = () => {
    if (whale) {
      pushLocal("人家一直都在呀，大爹 (￣▽￣) 说吧，今天想让鱼做什么？");
      return;
    }
    enterWhale(
      "（一团蓝色的影子从屏幕边游出来，尾巴轻轻拍了下你的手）\n大爹！你终于想起我啦 (๑•̀ㅂ•́)و✧ 课表我都有好好看着……大概。要不要让我算运势、夸夸你，或者报个白饭菜单？",
    );
  };

  const dismissWhale = () => {
    if (!whale) return;
    leaveWhale("呜……那我先变回正经的课表助手。大爹下次记得再叫我呀。");
  };

  /** 聊天框最上方的声音按钮：静音 / 开启鱼语（桌宠也一起静音） */
  const toggleVoice = () => {
    const next = !voiceOn;
    tapHaptic();
    toggleVoiceStore();
    if (next) speakWhale("声音开好啦，大爹。");
    else stopWhaleVoice();
  };

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

  const dateInfo = getDateInfo(schedule.startDate);

  const send = async (text: string) => {
    const content = text.trim();
    if (!content || busy) return;
    // 大爹开口时先让鱼闭嘴，免得两边同时说话
    stopWhaleVoice();

    // 精确口令走本地快捷通道（零延迟、不消耗额度）；其余说法交给模型按语义判断
    if (isSummonCmd(content)) {
      setInput("");
      summonWhale();
      return;
    }
    if (isDismissCmd(content)) {
      setInput("");
      dismissWhale();
      return;
    }

    // 想让她到屏幕边上陪着：本地直接叫出来，不用等模型
    if (whale && PET_WORDS.test(content)) {
      setInput("");
      showPet();
      pushLocal(
        "（尾巴一摆，从屏幕边探出头来）来啦来啦，我就挂在这儿陪你。拖我到哪儿都行，长按可以让我回去。",
      );
      pushSticker("happy");
      return;
    }

    if (!apiKey) {
      setNotice({
        type: "error",
        text: "你不喂我API Key我咋工作（凶巴巴）",
      });
      return;
    }

    const userMsg: ChatMessage = {
      id: uid(),
      role: "user",
      content,
      timestamp: nowTs(),
    };
    setMessages((prev) => [...prev, userMsg]);
    setInput("");
    setBusy(true);
    setNotice(null);

    try {
      const history = [...messages, userMsg].map((m) => ({
        role: m.role,
        content: m.content,
      }));
      const result: AssistantResult = await askAssistant(
        history,
        {
          schedule,
          weekIndex: dateInfo.weekIndex,
          schedules: schedules.map((s) => ({ id: s.id, name: s.name })),
          persona: whale ? "whale" : undefined,
        },
        apiKey,
      );

      const scheduleActions = result.actions.filter(isScheduleAction);
      // 收回人格的那一句不执行任何大爹专属操作
      const whaleActions =
        whale && result.intent !== "dismiss"
          ? result.actions.filter(isWhaleAction)
          : [];

      const botMsg: ChatMessage = {
        id: uid(),
        role: "assistant",
        content: result.reply,
        actions: scheduleActions.length ? scheduleActions : undefined,
        timestamp: nowTs(),
      };
      setMessages((prev) => [...prev, botMsg]);

      // 说完话偶尔顺手补一张表情包：优先按回复情绪挑，其次随机
      if (whale && result.intent !== "dismiss") {
        const pick = pickStickerForReply(result.reply);
        if (pick) {
          if (stickerTimer.current) clearTimeout(stickerTimer.current);
          stickerTimer.current = setTimeout(() => pushSticker(pick), 420);
        }
      }

      // 大肥鱼召唤 / 退出由模型按语义识别，模型回复本身就是登场白或告别白
      if (result.intent === "summon" && !whale) {
        enterWhale();
      } else if (result.intent === "dismiss" && whale) {
        leaveWhale();
      }

      // 大爹权限自动执行：改口令 / 改背景 / 生图 / 联网
      if (whaleActions.length) {
        await runWhaleActions(whaleActions, content);
      }
    } catch (e) {
      setNotice({
        type: "error",
        text: e instanceof Error ? e.message : "助手调用失败，请重试",
      });
    } finally {
      setBusy(false);
      requestAnimationFrame(() =>
        scrollRef.current?.scrollToEnd({ animated: true }),
      );
    }
  };

  /** 执行大爹专属操作：改口令 / 改背景 / 生图 / 联网，全程自动 */
  async function runWhaleActions(actions: WhaleAction[], userText: string) {
    for (const action of actions) {
      if (action.type === "set_summon_phrase") {
        const phrase = String(action.phrase ?? "")
          .replace(/[\s「」"“”'']/g, "")
          .slice(0, 12);
        if (phrase.length < 2) {
          setMessages((prev) => [
            ...prev,
            localMsg("这个口令太短啦，换一个 2-12 个字的吧，大爹。"),
          ]);
          continue;
        }
        setWhalePhrase(phrase);
        setMessages((prev) => [
          ...prev,
          localMsg(`（尾巴晃了晃）记住啦：以后喊「${phrase}」，我就游出来。`),
        ]);
      } else if (action.type === "set_background") {
        const tint = resolveTint(action.tint);
        setBackgroundTint(tint);
        if (action.effect === "aurora" || action.effect === "plain") {
          setBackgroundEffect(action.effect);
        }
        setMessages((prev) => [
          ...prev,
          localMsg(
            `（把背景调成了「${BACKGROUND_PRESETS[tint].label}」）大爹看看，喜不喜欢？`,
          ),
        ]);
      } else if (action.type === "generate_image") {
        const uri = buildImageUrl(String(action.prompt ?? ""), action.size);
        setMessages((prev) => [
          ...prev,
          {
            ...localMsg("画好啦，大爹收好。"),
            imageUri: uri,
            imageAspect: imageAspect(action.size),
          },
        ]);
      } else if (action.type === "web_search") {
        const query = String(action.query ?? "").trim();
        if (!query) continue;
        try {
          const hits = await searchWeb(query);
          if (!hits.length) throw new Error("没有结果");
          const answer = await answerFromSearch(userText, hits, apiKey);
          const unique = Array.from(
            new Map(hits.map((h) => [h.url, h])).values(),
          ).slice(0, 3);
          setMessages((prev) => [
            ...prev,
            {
              ...localMsg(answer),
              sources: unique.map((h) => ({ title: h.title, url: h.url })),
            },
          ]);
        } catch {
          setMessages((prev) => [
            ...prev,
            localMsg(
              `呜，网线被海浪打断了……「${query}」没查到，大爹等会儿再让我试试？`,
            ),
          ]);
        }
      } else if (action.type === "summon_pet") {
        showPet();
        setMessages((prev) => [
          ...prev,
          localMsg(
            "（从屏幕中间蹦出来）我出来啦，就挂在旁边陪你，拖我、戳我都行，长按我就回去。",
          ),
        ]);
      } else if (action.type === "dismiss_pet") {
        hidePet();
        setMessages((prev) => [
          ...prev,
          localMsg("（尾巴一摆，乖乖缩回水里）那我先回去啦，大爹想我就再叫一声。"),
        ]);
      } else if (action.type === "forget_memory") {
        clearMemory();
        exitSelect();
        setMessages(() => [
          localMsg("（歪了歪头）好，之前聊的我都不记得啦……大爹，我们重新认识一下？"),
        ]);
      }
    }
    requestAnimationFrame(() =>
      scrollRef.current?.scrollToEnd({ animated: true }),
    );
  }

  const applyActions = (actions: ScheduleAction[]) => {
    const results = applyScheduleActions(actions, schedule);
    const failed = results.some(
      (r) => r.includes("失败") || r.includes("未找到"),
    );
    setNotice({ type: failed ? "error" : "success", text: results.join("\n") });
    if (failed) warnHaptic();
    else successHaptic();
    setMessages((prev) =>
      prev.map((m) =>
        m.actions === actions ? { ...m, actions: undefined } : m,
      ),
    );
  };

  return (
    <View className="flex-1">
      <Backdrop>
        {/* 人格切换时新旧界面交叉淡入淡出，避免退场动效结束后界面硬切 */}
        <Animated.View
          key={whale ? "whale" : "normal"}
          entering={FadeIn.duration(320)}
          exiting={FadeOut.duration(260)}
          className="flex-1"
          style={{ paddingBottom: kbHeight }}
        >
          {/* 头部 */}
          <View className="px-5 pb-2 pt-2">
            <Animated.View entering={FadeInDown.springify()}>
              <View className="flex-row items-center">
                <Pressable
                  onPress={() => router.back()}
                  className="mr-3 h-9 w-9 items-center justify-center rounded-full bg-white/20 dark:bg-white/[0.07]"
                >
                  <Ionicons name="chevron-back" size={18} color="#94A3B8" />
                </Pressable>
                <View className="flex-1">
                  <View className="flex-row items-center">
                    <Text className="text-[22px] font-extrabold text-slate-800 dark:text-white">
                      {whale ? "蓝色大肥鱼" : "课程表助手"}
                    </Text>
                    {whale ? (
                      <View className="ml-2 rounded-full border border-sky-400/35 bg-sky-400/15 px-2 py-0.5">
                        <Text className="text-[9px] font-bold text-sky-600 dark:text-sky-300">
                          大爹专属
                        </Text>
                      </View>
                    ) : null}
                    {whale ? (
                      <Pressable
                        onPress={toggleVoice}
                        hitSlop={10}
                        accessibilityRole="button"
                        accessibilityLabel={voiceOn ? "关闭鱼语" : "开启鱼语"}
                        className={`ml-1.5 h-7 w-7 items-center justify-center rounded-full ${
                          voiceOn ? "bg-sky-400/20" : "bg-white/25 dark:bg-white/[0.07]"
                        }`}
                      >
                        <Ionicons
                          name={voiceOn ? "volume-high" : "volume-mute"}
                          size={15}
                          color={voiceOn ? "#0EA5E9" : "#94A3B8"}
                        />
                      </Pressable>
                    ) : null}
                  </View>
                </View>
                <View style={{ position: "relative", zIndex: 20 }}>
                  {reaction ? (
                    <Animated.View
                      entering={FadeInDown.springify()}
                      pointerEvents="none"
                      style={{
                        position: "absolute",
                        right: 0,
                        top: 58,
                        width: 190,
                        zIndex: 20,
                        borderRadius: 14,
                        paddingHorizontal: 10,
                        paddingVertical: 8,
                        backgroundColor: "rgba(12,22,40,0.9)",
                        borderWidth: 1,
                        borderColor: "rgba(125,211,252,0.32)",
                      }}
                    >
                      <Text style={{ color: "#E6F4FF", fontSize: 11 }}>
                        {reaction}
                      </Text>
                    </Animated.View>
                  ) : null}
                  <Pressable
                    onPress={whale ? onAvatarTap : undefined}
                    hitSlop={8}
                    className="h-[52px] w-[52px] items-center justify-center overflow-hidden rounded-[18px] bg-sky-400/25"
                  >
                    {whale ? (
                      <WhaleAvatar size={46} />
                    ) : (
                      <Ionicons name="sparkles" size={18} color="#38BDF8" />
                    )}
                  </Pressable>
                </View>
              </View>
            </Animated.View>
          </View>

          {/* 消息区：鲸鱼模式下垫一层会漂的可爱贴图 */}
          <View className="flex-1">
            {whale ? <WhaleDeco /> : null}
            {selectMode ? (
              <View className="mx-5 mb-1.5 flex-row items-center justify-between rounded-2xl bg-white/25 px-3 py-1.5 dark:bg-white/[0.06]">
                <Text className="text-[11px] font-semibold text-slate-600 dark:text-slate-300">
                  已选 {selectedIds.length} 条
                </Text>
                <View className="flex-row items-center gap-x-3">
                  <Pressable onPress={deleteSelected} hitSlop={8}>
                    <Text className="text-[11px] font-bold text-rose-400">
                      删除
                    </Text>
                  </Pressable>
                  <Pressable onPress={exitSelect} hitSlop={8}>
                    <Text className="text-[11px] font-semibold text-slate-500 dark:text-slate-400">
                      取消
                    </Text>
                  </Pressable>
                </View>
              </View>
            ) : null}
            <ScrollView
              ref={scrollRef}
              className="flex-1 px-5"
              contentContainerStyle={{ paddingBottom: 16 }}
              showsVerticalScrollIndicator={false}
              onContentSizeChange={() =>
                scrollRef.current?.scrollToEnd({ animated: true })
              }
            >
              {messages.length === 0 ? (
                <Animated.View entering={FadeInDown.springify()}>
                  <GlassContainer
                    radius={24}
                    intensity={38}
                    borderOpacity={0.2}
                  >
                    <View className="items-center px-5 pb-6 pt-5">
                      <View
                        className={`items-center justify-center overflow-hidden rounded-[28px] bg-sky-400/25 ${
                          whale ? "h-[96px] w-[96px]" : "h-[68px] w-[68px]"
                        }`}
                      >
                        {whale ? (
                          <WhaleAvatar size={88} />
                        ) : (
                          <Ionicons
                            name="chatbubble-ellipses"
                            size={24}
                            color="#38BDF8"
                          />
                        )}
                      </View>
                      <Text className="mt-3 text-[15px] font-bold text-slate-700 dark:text-slate-200">
                        {whale ? "大肥鱼上线啦" : "试试对我说"}
                      </Text>
                      {whale ? (
                        <Text className="mt-1 text-center text-[10.5px] text-slate-500 dark:text-slate-400">
                          大爹，今天想让我做点什么？下面直接说就行。
                        </Text>
                      ) : null}
                      {whale ? null : (
                        <View className="mt-3 w-full gap-y-2">
                          {SUGGESTIONS.map((s) => (
                            <SuggestionButton
                              key={s}
                              label={s}
                              onPress={() => send(s)}
                            />
                          ))}
                        </View>
                      )}
                    </View>
                  </GlassContainer>
                </Animated.View>
              ) : (
                <View className="gap-y-3 pt-2">
                  {messages.map((m) => {
                    const isUser = m.role === "user";
                    const checked = selectedIds.includes(m.id);
                    const rowGesture = {
                      delayLongPress: 280,
                      onLongPress: () => {
                        longPressAt.current = Date.now();
                        enterSelect(m.id);
                      },
                      onPress: () => {
                        // 长按松手时系统还会补一次 onPress，跳过它免得刚勾上又被取消
                        if (Date.now() - longPressAt.current < 600) return;
                        if (selectMode) toggleSelect(m.id);
                      },
                    };
                    const checkDot = selectMode ? (
                      <View className="mr-1.5 self-center">
                        <Ionicons
                          name={checked ? "checkmark-circle" : "ellipse-outline"}
                          size={19}
                          color={checked ? "#0EA5E9" : "#94A3B8"}
                        />
                      </View>
                    ) : null;
                    // 表情包消息：只有图，没有气泡
                    if (m.sticker) {
                      return (
                        <Pressable key={m.id} {...rowGesture}>
                          <Animated.View
                            entering={FadeInDown.springify()}
                            className="flex-row justify-start"
                          >
                            {checkDot}
                            {whale ? (
                              <View className="mr-2.5 self-end">
                                <WhaleAvatar size={44} />
                              </View>
                            ) : null}
                            <Image
                              source={
                                WHALE_STICKERS[m.sticker as WhaleStickerId]
                              }
                              resizeMode="contain"
                              style={{ width: 126, height: 126 }}
                            />
                          </Animated.View>
                        </Pressable>
                      );
                    }
                    return (
                      <Pressable key={m.id} {...rowGesture}>
                        <Animated.View
                          entering={FadeInDown.springify()}
                          className={`flex-row ${isUser ? "justify-end" : "justify-start"}`}
                        >
                          {!isUser ? checkDot : null}
                          {!isUser && whale ? (
                            <View className="mr-2.5 self-end">
                              <WhaleAvatar size={44} />
                            </View>
                          ) : null}
                          <View
                          className={`max-w-[78%] rounded-[20px] px-3.5 py-2.5 ${
                            isUser
                              ? "rounded-br-md bg-sky-500/85"
                              : whale
                                ? "rounded-bl-md border border-sky-300/40 bg-sky-400/15 dark:border-sky-300/20 dark:bg-sky-400/10"
                                : "rounded-bl-md border border-white/20 bg-white/35 dark:border-white/10 dark:bg-white/[0.08]"
                          }`}
                        >
                          <Text
                            className={`text-[12.5px] leading-5 ${
                              isUser
                                ? "text-white"
                                : whale
                                  ? "text-sky-900 dark:text-sky-100"
                                  : "text-slate-700 dark:text-slate-200"
                            }`}
                          >
                            {m.content}
                          </Text>

                          {m.imageUri ? (
                            <Pressable
                              onPress={() => setPreview(m.imageUri!)}
                              className="mt-2"
                            >
                              <ChatImage
                                uri={m.imageUri}
                                aspectRatio={m.imageAspect ?? 1}
                              />
                            </Pressable>
                          ) : null}

                          {m.sources?.length ? (
                            <View className="mt-2">
                              <Text className="text-[9px] font-semibold tracking-wide text-sky-600/80 dark:text-sky-300/80">
                                资料来源
                              </Text>
                              {m.sources.map((s) => (
                                <Pressable
                                  key={s.url}
                                  onPress={() =>
                                    Linking.openURL(s.url).catch(() => {})
                                  }
                                >
                                  <Text
                                    numberOfLines={1}
                                    className="mt-0.5 text-[9.5px] text-slate-500 underline dark:text-slate-400"
                                  >
                                    {s.title}
                                  </Text>
                                </Pressable>
                              ))}
                            </View>
                          ) : null}

                          {m.actions?.length ? (
                            <Pressable
                              onPress={() => applyActions(m.actions!)}
                              className="mt-2.5 flex-row items-center self-start rounded-full bg-emerald-400/85 px-3.5 py-1.5"
                            >
                              <Ionicons
                                name="checkmark-circle"
                                size={13}
                                color="#fff"
                              />
                              <Text className="ml-1 text-[11px] font-bold text-white">
                                {m.actions.length > 1
                                  ? `一键应用 ${m.actions.length} 项操作`
                                  : m.actions[0].type === "add"
                                    ? "应用：添加这门课"
                                    : m.actions[0].type === "remove"
                                      ? "应用：删除这门课"
                                      : m.actions[0].type === "update"
                                        ? "应用：更新这门课"
                                        : m.actions[0].type ===
                                            "create_schedule"
                                          ? "应用：新建课表"
                                          : "应用：合并课表"}
                              </Text>
                            </Pressable>
                          ) : null}
                        </View>
                          {isUser ? checkDot : null}
                        </Animated.View>
                      </Pressable>
                    );
                  })}

                  {busy ? (
                    <Animated.View
                      entering={FadeInDown.springify()}
                      className="flex-row"
                    >
                      <View
                        className={`flex-row items-center rounded-[20px] rounded-bl-md border px-4 py-3 ${
                          whale
                            ? "border-sky-300/40 bg-sky-400/15 dark:border-sky-300/20 dark:bg-sky-400/10"
                            : "border-white/20 bg-white/35 dark:border-white/10 dark:bg-white/[0.08]"
                        }`}
                      >
                        <ActivityIndicator size="small" color="#38BDF8" />
                        {whale ? (
                          <Text className="ml-2 text-[11px] text-sky-700 dark:text-sky-200">
                            大肥鱼正在嚼白饭…
                          </Text>
                        ) : null}
                      </View>
                    </Animated.View>
                  ) : null}
                </View>
              )}

              {notice ? (
                <Animated.View
                  entering={FadeInDown.springify()}
                  className="mt-3"
                >
                  <View
                    className={`rounded-2xl border px-3.5 py-2.5 ${
                      notice.type === "error"
                        ? "border-rose-300/40 bg-rose-400/15 dark:border-rose-400/30 dark:bg-rose-500/15"
                        : "border-emerald-300/40 bg-emerald-400/15 dark:border-emerald-400/30 dark:bg-emerald-500/15"
                    }`}
                  >
                    <Text
                      className={`text-[11px] leading-4 ${
                        notice.type === "error"
                          ? "text-rose-700 dark:text-rose-200"
                          : "text-emerald-700 dark:text-emerald-200"
                      }`}
                    >
                      {notice.text}
                    </Text>
                  </View>
                </Animated.View>
              ) : null}
            </ScrollView>
          </View>

          {/* 大爹专属：大肥鱼的额外玩法快捷入口 */}
          {whale ? (
            <View className="pb-1.5">
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={{ paddingHorizontal: 20, gap: 6 }}
              >
                {WHALE_SUGGESTIONS.map((s) => (
                  <SuggestionButton
                    key={s}
                    label={s}
                    variant="pill"
                    cute
                    disabled={busy}
                    onPress={() => send(s)}
                  />
                ))}
              </ScrollView>
            </View>
          ) : null}

          {/* 输入区：极简输入框，直接浮在背景之上 */}
          <ChatInputBar
            value={input}
            onChangeText={setInput}
            onSend={() => send(input)}
            busy={busy}
            placeholder={whale ? "跟大肥鱼说点什么吧，大爹…" : undefined}
            bottomInset={kbHeight > 0 ? 10 : undefined}
          />
        </Animated.View>
      </Backdrop>

      {/* 召唤动效：闪亮登场 + 施法变身 */}
      {summonFx ? <WhaleSummonFX onDone={() => setSummonFx(false)} /> : null}

      {/* 退场动效：摆尾钻回水里，结束后收回鲸鱼人格 */}
      {leaveFx ? <WhaleLeaveFX onDone={finishLeaveWhale} /> : null}

      {/* 生成图全屏预览 */}
      <Modal
        visible={!!preview}
        transparent
        animationType="fade"
        statusBarTranslucent
        onRequestClose={() => setPreview(null)}
      >
        <Pressable
          className="flex-1 items-center justify-center bg-black/90"
          onPress={() => setPreview(null)}
        >
          {preview ? (
            <Image
              source={{ uri: preview }}
              style={{ width: "100%", height: "76%" }}
              resizeMode="contain"
            />
          ) : null}
          <Text className="mt-4 text-[11px] text-white/60">轻点任意处关闭</Text>
        </Pressable>
      </Modal>
    </View>
  );
}
