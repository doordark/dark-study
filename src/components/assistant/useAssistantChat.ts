import { useFocusEffect, useIsFocused } from "expo-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AppState, Keyboard, Platform } from "react-native";

import { BACKGROUND_PRESETS, resolveTint } from "@/constants/backgrounds";
import type { WhaleStickerId } from "@/constants/whaleStickers";
import { askAssistant, type AssistantResult } from "@/services/ai";
import { previewScheduleActions, type ScheduleActionPreview } from "@/services/assistantSchedule";
import { playSfx } from "@/services/soundEffects";
import {
  answerFromSearch,
  buildImageUrl,
  imageAspect,
  searchWeb,
} from "@/services/whaleTools";
import { speakWhale, stopWhaleVoice } from "@/services/whaleVoice";
import { useSettings } from "@/store/useSettings";
import { useActiveSchedule, useStore } from "@/store/useStore";
import { useWhaleMemory } from "@/store/useWhaleMemory";
import { useWhalePersona } from "@/store/useWhalePersona";
import { useWhalePet } from "@/store/useWhalePet";
import { useWhaleVoice } from "@/store/useWhaleVoice";
import type {
  AssistantAction,
  ChatMessage,
  ScheduleAction,
  WhaleAction,
} from "@/types";
import { bumpHaptic, successHaptic, tapHaptic, thumpHaptic } from "@/utils/haptics";
import { nowTs, uid } from "@/utils/id";
import { getDateInfo } from "@/utils/time";
import { renderPersonaText } from "@/utils/whalePersona";

import {
  DISMISS_ALIASES,
  PET_WORDS,
  SUMMON_ALIASES,
  normalizeCmd,
} from "./assistantStyles";

const SCHEDULE_TYPES = new Set([
  "add",
  "remove",
  "update",
  "create_schedule",
  "merge_schedule",
  "add_task",
]);
const isScheduleAction = (a: AssistantAction): a is ScheduleAction =>
  SCHEDULE_TYPES.has(a.type);
const isWhaleAction = (a: AssistantAction): a is WhaleAction =>
  !SCHEDULE_TYPES.has(a.type);

export interface AssistantNotice {
  type: "error" | "success";
  text: string;
}

export interface PendingScheduleChange {
  preview: ScheduleActionPreview;
  actions: ScheduleAction[];
}

export interface UseAssistantChatOptions {
  onBeforeSend?: () => void;
  onBeforeLeave?: () => void;
  onAfterLeave?: () => void;
  onFollowLatest?: () => void;
  onScrollToLatest?: () => void;
}

/**
 * 课程表助手与大肥鱼核心对话引擎 Hook：
 * 负责消息流状态、请求取消与内存代际隔离、课表变更预览、用户专属动作、召唤/退场生命周期与 TTS 语音协同。
 */
export function useAssistantChat({
  onBeforeSend,
  onBeforeLeave,
  onAfterLeave,
  onFollowLatest,
  onScrollToLatest,
}: UseAssistantChatOptions = {}) {
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

  const showPet = useWhalePet((s) => s.show);
  const hidePet = useWhalePet((s) => s.hide);

  const voiceOn = useWhaleVoice((s) => s.on);
  const toggleVoiceStore = useWhaleVoice((s) => s.toggle);
  const hydrateVoice = useWhaleVoice((s) => s.hydrate);
  const voiceScreenFocused = useIsFocused();

  // 长按消息进入多选，挑着删
  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [busyStatus, setBusyStatus] = useState<string | null>(null);
  const [notice, setNotice] = useState<AssistantNotice | null>(null);
  const [kbHeight, setKbHeight] = useState(0);
  const [summonFx, setSummonFx] = useState(false);
  const [leaveFx, setLeaveFx] = useState(false);
  const [preview, setPreview] = useState<string | null>(null);
  const [scheduleChange, setScheduleChange] = useState<PendingScheduleChange | null>(null);

  const pendingRequest = useRef<AbortController | null>(null);
  const spokenId = useRef<string | null>(null);
  // 本次进入页面之前的旧消息不再重读，避免每次打开对话都重新合成一遍语音
  const openedAt = useRef(nowTs());
  const longPressAt = useRef(0);
  const mountedRef = useRef(true);
  /** 退场动画期间延后的「切人格 / 追加告别 / 归档记忆」定时器 */
  const leaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const settleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const stopRequest = useCallback(() => {
    pendingRequest.current?.abort();
    pendingRequest.current = null;
    setBusy(false);
    setBusyStatus(null);
  }, []);

  useFocusEffect(useCallback(() => () => stopRequest(), [stopRequest]));

  useEffect(() => {
    const sub = AppState.addEventListener("change", (state) => {
      if (state !== "active") stopRequest();
    });
    const forget = useWhaleMemory.subscribe((next, previous) => {
      if (next.epoch !== previous.epoch) stopRequest();
    });
    return () => {
      sub.remove();
      forget();
      pendingRequest.current?.abort();
      pendingRequest.current = null;
    };
  }, [stopRequest]);

  useEffect(
    () => () => {
      mountedRef.current = false;
      if (leaveTimer.current) clearTimeout(leaveTimer.current);
      if (settleTimer.current) clearTimeout(settleTimer.current);
    },
    [],
  );

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
    // 刚进入页面时接回来的历史对话（或上次留下的最后一句）不朗读
    if (!last.timestamp || last.timestamp < openedAt.current) return;
    if (!whale || !voiceOn || !voiceScreenFocused) return;
    speakWhale(last.content);
  }, [messages, whale, voiceOn, voiceScreenFocused]);

  // 离开页面时让她闭嘴
  useEffect(() => {
    if (!voiceScreenFocused) stopWhaleVoice();
    return () => stopWhaleVoice();
  }, [voiceScreenFocused]);

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

  const displayMessages = useMemo(() => messages.slice().reverse(), [messages]);

  const onSelectMessage = useCallback(
    (id: string, long: boolean) => {
      if (long) {
        longPressAt.current = Date.now();
        setSelectMode(true);
        setSelectedIds([id]);
        bumpHaptic();
        return;
      }
      if (Date.now() - longPressAt.current < 600) return;
      if (selectMode) {
        setSelectedIds((previous) =>
          previous.includes(id)
            ? previous.filter((value) => value !== id)
            : [...previous, id],
        );
      }
    },
    [selectMode],
  );

  const localMsg = (content: string): ChatMessage => ({
    id: uid(),
    role: "assistant",
    content: renderPersonaText(content, useWhalePersona.getState().persona),
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
    onBeforeLeave?.();
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
      onAfterLeave?.();
      setPreview(null);
      setNotice(null);
      setInput("");
      spokenId.current = null;
      exitSelect();
      // 归档要序列化整段对话，再往后挪一点，别卡在动画收尾上
      settleTimer.current = setTimeout(() => archiveMemory(), 320);
    });
  };

  const summonWhale = () => {
    if (whale) {
      pushLocal("人家一直都在呀，{{user}} (￣▽￣) 说吧，今天想让鱼做什么？");
      return;
    }
    enterWhale(
      "（一团蓝色的影子从屏幕边游出来，尾巴轻轻拍了下你的手）\n{{user}}！你终于想起我啦 (๑•̀ㅂ•́)و✧ 课表我都有好好看着……大概。要不要让我算运势、夸夸你，或者报个白饭菜单？",
    );
  };

  const dismissWhale = () => {
    if (!whale) return;
    leaveWhale("呜……那我先变回正经的课表助手。{{user}}下次记得再叫我呀。");
  };

  /** 聊天框最上方的声音按钮：静音 / 开启鱼语（桌宠也一起静音） */
  const toggleVoice = () => {
    const next = !voiceOn;
    tapHaptic();
    toggleVoiceStore();
    if (next) {
      speakWhale(
        renderPersonaText(
          "声音开好啦，{{user}}。",
          useWhalePersona.getState().persona,
        ),
      );
    } else {
      stopWhaleVoice();
    }
  };

  // 本地精确口令只作为「零延迟快捷通道」：其余任何说法都交给模型按语义识别
  const isSummonCmd = (text: string) => {
    const cmd = normalizeCmd(text);
    return cmd === normalizeCmd(whalePhrase) || (SUMMON_ALIASES as readonly string[]).includes(cmd);
  };
  const isDismissCmd = (text: string) =>
    (DISMISS_ALIASES as readonly string[]).includes(normalizeCmd(text));

  /** 执行用户专属操作：改口令 / 改背景 / 生图 / 联网，全程自动 */
  async function runWhaleActions(
    actions: WhaleAction[],
    userText: string,
    signal: AbortSignal,
  ) {
    const memoryEpoch = useWhaleMemory.getState().epoch;
    for (const action of actions) {
      if (signal.aborted || useWhaleMemory.getState().epoch !== memoryEpoch) return;
      if (action.type === "set_summon_phrase") {
        const phrase = String(action.phrase ?? "")
          .replace(/[\s「」"“”'']/g, "")
          .slice(0, 12);
        if (phrase.length < 2) {
          setMessages((prev) => [
            ...prev,
            localMsg("这个口令太短啦，换一个 2-12 个字的吧，{{user}}。"),
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
            `（把背景调成了「${BACKGROUND_PRESETS[tint].label}」）{{user}}看看，喜不喜欢？`,
          ),
        ]);
      } else if (action.type === "generate_image") {
        const uri = buildImageUrl(String(action.prompt ?? ""), action.size);
        setMessages((prev) => [
          ...prev,
          {
            ...localMsg("画好啦，{{user}}收好。"),
            imageUri: uri,
            imageAspect: imageAspect(action.size),
          },
        ]);
      } else if (action.type === "web_search") {
        const query = String(action.query ?? "").trim();
        if (!query) continue;
        try {
          setBusyStatus(`正在联网检索「${query.slice(0, 18)}」…`);
          const hits = await searchWeb(query, signal, apiKey);
          if (!hits.length) throw new Error("没有结果");
          const answer = await answerFromSearch(userText, hits, apiKey, signal);
          if (signal.aborted || useWhaleMemory.getState().epoch !== memoryEpoch) return;
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
          if (signal.aborted || useWhaleMemory.getState().epoch !== memoryEpoch) return;
          setMessages((prev) => [
            ...prev,
            localMsg(
              `呜，网线被海浪打断了……「${query}」没查到，{{user}}等会儿再让我试试？`,
            ),
          ]);
        }
      } else if (action.type === "summon_pet") {
        // 首次召唤音效由 WhalePetStage 挂载单点播放，避免双倍重叠
        showPet();
        setMessages((prev) => [
          ...prev,
          localMsg(
            "（从屏幕中间蹦出来）我出来啦，就挂在旁边陪你，拖我、戳我都行，点三下或长按展开互动卡。",
          ),
        ]);
      } else if (action.type === "dismiss_pet") {
        if (useWhalePet.getState().visible) {
          playSfx("whale_pet_dismiss", { volume: 0.62 });
        }
        hidePet();
        setMessages((prev) => [
          ...prev,
          localMsg(
            "（尾巴一摆，乖乖缩回水里）那我先回去啦，{{user}}想我就再叫一声。",
          ),
        ]);
      } else if (action.type === "forget_memory") {
        clearMemory();
        exitSelect();
        setMessages(() => [
          localMsg(
            "（歪了歪头）好，之前聊的我都不记得啦……{{user}}，我们重新认识一下？",
          ),
        ]);
      }
    }
    requestAnimationFrame(() => onScrollToLatest?.());
  }

  const dateInfo = getDateInfo(schedule.startDate);

  const send = async (text: string) => {
    const content = text.trim();
    if (!content || pendingRequest.current) return;
    // 用户开口时先让鱼闭嘴，免得两边同时说话
    stopWhaleVoice();
    onBeforeSend?.();

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

    // 想让她到屏幕边上陪着：本地直接叫出来，不用等模型（首次登场音效由 WhalePet 单点播放）
    if (whale && PET_WORDS.test(content)) {
      setInput("");
      showPet();
      pushLocal(
        "（尾巴一摆，从屏幕边探出头来）来啦来啦，我就挂在这儿陪你。拖我到哪儿都行，长按或点三下可以打开互动卡。",
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
    const controller = new AbortController();
    pendingRequest.current = controller;
    onFollowLatest?.();
    setMessages((prev) => [...prev, userMsg]);
    setInput("");
    setBusy(true);
    setBusyStatus(null);
    setNotice(null);
    const memoryEpoch = useWhaleMemory.getState().epoch;

    try {
      const history = [...messages, userMsg].map((m) => ({
        id: m.id,
        role: m.role,
        content: m.content,
        sticker: m.sticker,
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
        controller.signal,
        {
          onStatus: (status) => {
            if (!controller.signal.aborted && mountedRef.current) {
              setBusyStatus(status);
            }
          },
        },
      );
      if (controller.signal.aborted || useWhaleMemory.getState().epoch !== memoryEpoch) return;

      const scheduleActions = result.actions.filter(isScheduleAction);
      // 收回人格的那一句不执行任何用户专属操作
      const whaleActions =
        whale && result.intent !== "dismiss"
          ? result.actions.filter(isWhaleAction)
          : [];

      const botMsg: ChatMessage = {
        id: uid(),
        role: "assistant",
        content: result.reply,
        actions: scheduleActions.length ? scheduleActions : undefined,
        sources: result.sources?.length ? result.sources : undefined,
        timestamp: nowTs(),
      };
      // 文本与表情一起入库，下一轮立即可见，避免延迟补发串到下一轮。
      const stickerMsg: ChatMessage | undefined =
        whale && result.sticker && result.intent !== "dismiss"
          ? {
              id: uid(),
              role: "assistant",
              content: "",
              sticker: result.sticker,
              timestamp: nowTs(),
            }
          : undefined;
      setMessages((prev) => [
        ...prev,
        botMsg,
        ...(stickerMsg ? [stickerMsg] : []),
      ]);

      // 大肥鱼召唤 / 退出由模型按语义识别，模型回复本身就是登场白或告别白
      if (result.intent === "summon" && !whale) {
        enterWhale();
      } else if (result.intent === "dismiss" && whale) {
        leaveWhale();
      }

      // 用户权限自动执行：改口令 / 改背景 / 生图 / 联网
      if (whaleActions.length) {
        await runWhaleActions(whaleActions, content, controller.signal);
      }
    } catch (e) {
      if (controller.signal.aborted) return;
      setNotice({
        type: "error",
        text: e instanceof Error ? e.message : "助手调用失败，请重试",
      });
    } finally {
      if (pendingRequest.current === controller) {
        pendingRequest.current = null;
        setBusy(false);
        setBusyStatus(null);
      }
    }
  };

  const applyActions = useCallback(
    (actions: ScheduleAction[]) => {
      setScheduleChange({
        preview: previewScheduleActions(actions, schedule),
        actions,
      });
    },
    [schedule],
  );

  const closeScheduleChange = useCallback(() => {
    setScheduleChange(null);
  }, []);

  const markScheduleChangeApplied = useCallback(() => {
    if (!scheduleChange) return;
    const appliedActions = scheduleChange.actions;
    successHaptic();
    setMessages((previous) =>
      previous.map((message) =>
        message.actions === appliedActions
          ? { ...message, actions: undefined }
          : message,
      ),
    );
  }, [scheduleChange, setMessages]);

  return {
    whale,
    voiceOn,
    voiceScreenFocused,
    displayMessages,
    selectMode,
    selectedIds,
    input,
    setInput,
    busy,
    busyStatus,
    notice,
    kbHeight,
    summonFx,
    setSummonFx,
    leaveFx,
    finishLeaveWhale,
    preview,
    setPreview,
    scheduleChange,
    applyActions,
    closeScheduleChange,
    markScheduleChangeApplied,
    onSelectMessage,
    exitSelect,
    deleteSelected,
    stopRequest,
    toggleVoice,
    send,
  };
}
