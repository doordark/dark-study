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
  View,
  type ScrollViewInstance,
} from "react-native";
import Animated, { FadeInDown } from "react-native-reanimated";

import { Backdrop } from "@/components/Backdrop";
import { ChatInputBar } from "@/components/ChatInputBar";
import { GlassContainer } from "@/components/GlassContainer";
import { askAssistant } from "@/services/ai";
import type { AssistantResult } from "@/services/ai";
import { useSettings } from "@/store/useSettings";
import { useActiveSchedule, useStore } from "@/store/useStore";
import type { ChatMessage, Course, ScheduleAction } from "@/types";
import { nowTs, uid } from "@/utils/id";
import { clampPeriods, getDateInfo } from "@/utils/time";

const SUGGESTIONS = [
  "把周三的体育课改到周五下午",
  "新建一份叫「外教课」的课表",
  "帮我把周六的学术写作工作坊删掉",
  "这学期哪天的课最多？",
  "给周四加一门晚上 7 点的《人工智能导论》",
];

export function AssistantScreen() {
  const apiKey = useSettings((s) => s.apiKey);
  const schedule = useActiveSchedule();
  const schedules = useStore((s) => s.schedules);
  const addCourse = useStore((s) => s.addCourse);
  const updateCourse = useStore((s) => s.updateCourse);
  const removeCourse = useStore((s) => s.removeCourse);
  const addSchedule = useStore((s) => s.addSchedule);
  const mergeSchedule = useStore((s) => s.mergeSchedule);

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
        {
          schedule,
          weekIndex: dateInfo.weekIndex,
          schedules: schedules.map((s) => ({ id: s.id, name: s.name })),
        },
        apiKey,
      );

      const botMsg: ChatMessage = {
        id: uid(),
        role: "assistant",
        content: result.reply,
        actions: result.actions.length ? result.actions : undefined,
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

  /** 校验并规范化模型返回的课程草稿（节次钳位、周次默认整学期） */
  const normalizeDraft = (
    draft: Omit<Course, "id">,
  ): Omit<Course, "id"> | null => {
    const clamped = clampPeriods(
      schedule.periods,
      Number(draft.startPeriod) || 1,
      Number(draft.endPeriod) || 1,
    );
    if (!clamped) return null;
    const totalWeeks = Math.max(1, schedule.totalWeeks ?? 18);
    const weeks =
      Array.isArray(draft.weeks) && draft.weeks.length
        ? [
            ...new Set(
              draft.weeks.filter(
                (w) => Number.isInteger(w) && w >= 1 && w <= totalWeeks,
              ),
            ),
          ].sort((a, b) => a - b)
        : Array.from({ length: totalWeeks }, (_, i) => i + 1);
    return {
      ...draft,
      name: String(draft.name ?? "").trim() || "未命名课程",
      weekday: Math.min(Math.max(Number(draft.weekday) || 1, 1), 7),
      startPeriod: clamped.startPeriod,
      endPeriod: clamped.endPeriod,
      weeks: weeks.length ? weeks : [1],
    };
  };

  /** 按 id 定位课程，找不到时按名称兜底（模型给的 id 可能不准） */
  const resolveCourse = (courseId: string, courseName?: string) =>
    schedule.courses.find((c) => c.id === courseId) ??
    (courseName
      ? schedule.courses.find((c) => c.name === courseName)
      : undefined);

  const applyAction = (action: ScheduleAction): string => {
    switch (action.type) {
      case "add": {
        const draft = normalizeDraft(action.course);
        if (!draft) return "添加失败：节次数据无效";
        addCourse(draft);
        return `已添加「${draft.name}」`;
      }
      case "remove": {
        const target = resolveCourse(action.courseId, action.courseName);
        if (!target)
          return `未找到课程「${action.courseName ?? action.courseId}」`;
        removeCourse(target.id);
        return `已删除「${target.name}」`;
      }
      case "update": {
        const target = resolveCourse(action.courseId, action.courseName);
        if (!target)
          return `未找到课程「${action.courseName ?? action.courseId}」`;
        const patch: Partial<Course> = { ...action.patch };
        if (patch.startPeriod != null || patch.endPeriod != null) {
          const clamped = clampPeriods(
            schedule.periods,
            patch.startPeriod ?? target.startPeriod,
            patch.endPeriod ?? target.endPeriod,
          );
          if (clamped) Object.assign(patch, clamped);
        }
        if (patch.weeks) {
          const totalWeeks = Math.max(1, schedule.totalWeeks ?? 18);
          patch.weeks = [
            ...new Set(patch.weeks.filter((w) => w >= 1 && w <= totalWeeks)),
          ].sort((a, b) => a - b);
        }
        updateCourse(target.id, patch);
        return `已更新「${target.name}」`;
      }
      case "create_schedule": {
        const name = String(action.scheduleName ?? "").trim();
        if (!name) return "新建失败：缺少课表名称";
        if (schedules.some((s) => s.name === name))
          return `课表「${name}」已存在，无需重复新建`;
        addSchedule(name);
        return `已新建课表「${name}」并切换为当前`;
      }
      case "merge_schedule": {
        const report = mergeSchedule(action.sourceScheduleName);
        if (!report.added && !report.skipped)
          return `未找到可合并的课表「${action.sourceScheduleName}」`;
        return (
          `已合并 ${report.added} 门课` +
          (report.skipped ? `，跳过 ${report.skipped} 门` : "") +
          (report.conflicts.length
            ? `，⚠ 时间冲突：${report.conflicts.join("；")}`
            : "，无时间冲突")
        );
      }
    }
  };

  const applyActions = (actions: ScheduleAction[]) => {
    const results = actions.map(applyAction);
    setNotice({
      type: results.some((r) => r.includes("失败") || r.includes("未找到"))
        ? "error"
        : "success",
      text: results.join("\n"),
    });
    setMessages((prev) =>
      prev.map((m) =>
        m.actions === actions ? { ...m, actions: undefined } : m,
      ),
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
                                      : m.actions[0].type === "create_schedule"
                                        ? "应用：新建课表"
                                        : "应用：合并课表"}
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

          {/* 输入区：独立组件，实心表面与背景彻底分离 */}
          <ChatInputBar
            value={input}
            onChangeText={setInput}
            onSend={() => send(input)}
            busy={busy}
            bottomInset={kbHeight > 0 ? 10 : undefined}
          />
        </View>
      </Backdrop>
    </View>
  );
}
