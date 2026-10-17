import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import React, { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Keyboard,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
  type ScrollViewInstance,
} from "react-native";
import Animated, { FadeInDown } from "react-native-reanimated";

import { Backdrop } from "@/components/Backdrop";
import { GlassContainer } from "@/components/GlassContainer";
import { askAssistant } from "@/services/ai";
import type { AssistantResult } from "@/services/ai";
import { useSettings } from "@/store/useSettings";
import { useActiveSchedule, useStore } from "@/store/useStore";
import type { ChatMessage, Course, ScheduleAction } from "@/types";
import { nowTs, uid } from "@/utils/id";
import { getDateInfo } from "@/utils/time";

const SUGGESTIONS = [
  "把周三的体育课改到周五下午",
  "帮我把周六的学术写作工作坊删掉",
  "这学期哪天的课最多？",
  "给周四加一门晚上 7 点的《人工智能导论》",
];

export function AssistantScreen() {
  const apiKey = useSettings((s) => s.apiKey);
  const schedule = useActiveSchedule();
  const addCourse = useStore((s) => s.addCourse);
  const updateCourse = useStore((s) => s.updateCourse);
  const removeCourse = useStore((s) => s.removeCourse);

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{
    type: "error" | "success";
    text: string;
  } | null>(null);
  const [kbHeight, setKbHeight] = useState(0);
  const scrollRef = useRef<ScrollViewInstance>(null);

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
    if (!apiKey) {
      setNotice({
        type: "error",
        text: "请先在「设置」中填写 DeepSeek API Key",
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
        { schedule, weekIndex: dateInfo.weekIndex },
        apiKey,
      );

      const botMsg: ChatMessage = {
        id: uid(),
        role: "assistant",
        content: result.reply,
        action: result.action,
        timestamp: nowTs(),
      };
      setMessages((prev) => [...prev, botMsg]);
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

  const applyAction = (action: ScheduleAction) => {
    switch (action.type) {
      case "add": {
        const id = addCourse(action.course);
        setNotice({
          type: "success",
          text: `已添加课程：${action.course.name}（ID ${id.slice(0, 6)}）`,
        });
        break;
      }
      case "remove": {
        removeCourse(action.courseId);
        setNotice({
          type: "success",
          text: `已删除课程：${action.courseName}`,
        });
        break;
      }
      case "update": {
        const { id, ...patch } = {
          id: action.courseId,
          ...action.patch,
        } as Course & {
          id: string;
        };
        updateCourse(id, patch);
        setNotice({
          type: "success",
          text: `已更新课程：${action.courseName}`,
        });
        break;
      }
    }
    setMessages((prev) =>
      prev.map((m) => (m.action === action ? { ...m, action: undefined } : m)),
    );
  };

  return (
    <View className="flex-1">
      <Backdrop>
        <View className="flex-1" style={{ paddingBottom: kbHeight }}>
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
                  <Text className="text-[22px] font-extrabold text-slate-800 dark:text-white">
                    课程表助手
                  </Text>
                  <Text className="text-[11px] text-slate-500 dark:text-slate-400">
                    用自然语言帮你修改和优化课表
                  </Text>
                </View>
                <View className="h-10 w-10 items-center justify-center rounded-[16px] bg-sky-400/25">
                  <Ionicons name="sparkles" size={18} color="#38BDF8" />
                </View>
              </View>
            </Animated.View>
          </View>

          {/* 消息区 */}
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
                <GlassContainer radius={24} intensity={38} borderOpacity={0.2}>
                  <View className="items-center px-5 py-8">
                    <View className="h-14 w-14 items-center justify-center rounded-[20px] bg-sky-400/25">
                      <Ionicons
                        name="chatbubble-ellipses"
                        size={24}
                        color="#38BDF8"
                      />
                    </View>
                    <Text className="mt-3 text-[15px] font-bold text-slate-700 dark:text-slate-200">
                      试试对我说
                    </Text>
                    <View className="mt-3 w-full gap-y-2">
                      {SUGGESTIONS.map((s) => (
                        <Pressable
                          key={s}
                          onPress={() => send(s)}
                          className="rounded-2xl border border-white/20 bg-white/20 px-3.5 py-2.5 dark:border-white/10 dark:bg-white/[0.05]"
                        >
                          <Text className="text-[11.5px] text-slate-600 dark:text-slate-300">
                            {s}
                          </Text>
                        </Pressable>
                      ))}
                    </View>
                  </View>
                </GlassContainer>
              </Animated.View>
            ) : (
              <View className="gap-y-3 pt-2">
                {messages.map((m) => {
                  const isUser = m.role === "user";
                  return (
                    <Animated.View
                      key={m.id}
                      entering={FadeInDown.springify()}
                      className={`flex-row ${isUser ? "justify-end" : "justify-start"}`}
                    >
                      <View
                        className={`max-w-[82%] rounded-[20px] px-3.5 py-2.5 ${
                          isUser
                            ? "rounded-br-md bg-sky-500/85"
                            : "rounded-bl-md border border-white/20 bg-white/35 dark:border-white/10 dark:bg-white/[0.08]"
                        }`}
                      >
                        <Text
                          className={`text-[12.5px] leading-5 ${
                            isUser
                              ? "text-white"
                              : "text-slate-700 dark:text-slate-200"
                          }`}
                        >
                          {m.content}
                        </Text>

                        {m.action ? (
                          <Pressable
                            onPress={() => m.action && applyAction(m.action)}
                            className="mt-2.5 flex-row items-center self-start rounded-full bg-emerald-400/85 px-3.5 py-1.5"
                          >
                            <Ionicons
                              name="checkmark-circle"
                              size={13}
                              color="#fff"
                            />
                            <Text className="ml-1 text-[11px] font-bold text-white">
                              {m.action.type === "add"
                                ? "应用：添加这门课"
                                : m.action.type === "remove"
                                  ? "应用：删除这门课"
                                  : "应用：更新这门课"}
                            </Text>
                          </Pressable>
                        ) : null}
                      </View>
                    </Animated.View>
                  );
                })}

                {busy ? (
                  <Animated.View
                    entering={FadeInDown.springify()}
                    className="flex-row"
                  >
                    <View className="rounded-[20px] rounded-bl-md border border-white/20 bg-white/35 px-4 py-3 dark:border-white/10 dark:bg-white/[0.08]">
                      <ActivityIndicator size="small" color="#38BDF8" />
                    </View>
                  </Animated.View>
                ) : null}
              </View>
            )}

            {notice ? (
              <Animated.View entering={FadeInDown.springify()} className="mt-3">
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

          {/* 输入区 */}
          <View className="px-5 pb-3">
            <GlassContainer radius={22} intensity={54} borderOpacity={0.26}>
              <View className="flex-row items-center px-3 py-2">
                <TextInput
                  value={input}
                  onChangeText={setInput}
                  placeholder="例如：把周四的课和周五的换一下…"
                  placeholderTextColor="rgba(148,163,184,0.7)"
                  className="flex-1 px-2 py-1.5 text-[13px] text-slate-800 dark:text-slate-100"
                  onSubmitEditing={() => send(input)}
                  returnKeyType="send"
                  editable={!busy}
                />
                <Pressable
                  onPress={() => send(input)}
                  disabled={busy || !input.trim()}
                  className={`ml-2 h-9 w-9 items-center justify-center rounded-full ${
                    busy || !input.trim() ? "bg-slate-300/50" : "bg-sky-500/85"
                  }`}
                >
                  {busy ? (
                    <ActivityIndicator size="small" color="#fff" />
                  ) : (
                    <Ionicons name="arrow-up" size={16} color="#fff" />
                  )}
                </Pressable>
              </View>
            </GlassContainer>
          </View>
        </View>
      </Backdrop>
    </View>
  );
}
