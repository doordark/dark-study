import Ionicons from "@expo/vector-icons/Ionicons";
import React, { useEffect, useRef, useState } from "react";
import {
  Alert,
  Keyboard,
  KeyboardAvoidingView,
  Modal,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  useWindowDimensions,
  View,
  type ScrollViewInstance,
} from "react-native";
import Animated, { FadeInDown, FadeOutDown } from "react-native-reanimated";

import {
  GlassContainer,
  GlassTargetProvider,
} from "@/components/GlassContainer";
import {
  courseColorNames,
  coursePalette,
  WEEKDAY_LABELS,
} from "@/constants/palette";
import type { Course, CourseColor, Period } from "@/types";

export interface CourseEditorPanelProps {
  visible: boolean;
  periods: Period[];
  /** 学期总周数，默认 18 */
  totalWeeks?: number;
  /** 传入则为编辑，undefined 为新建 */
  course?: Course;
  /** 同一门课（名称 + 教师 + 教室一致）的上课记录条数 */
  occurrenceCount?: number;
  currentWeek?: number;
  onClose: () => void;
  onSave: (course: Omit<Course, "id"> & { id?: string }, targetWeeks?: number[]) => void;
  /** once 按当前记录或指定周次删除；all 删除该课程全部记录 */
  onDelete?: (id: string, scope: "once" | "all", targetWeeks?: number[]) => void;
}

const emptyDraft = (totalWeeks: number): Omit<Course, "id"> => ({
  name: "",
  teacher: "",
  classroom: "",
  weekday: 1,
  startPeriod: 1,
  endPeriod: 2,
  weeks: Array.from({ length: totalWeeks }, (_, i) => i + 1),
  color: "sky",
  credits: undefined,
  note: "",
});

function Field({
  label,
  value,
  placeholder,
  onChange,
  keyboardType,
  onFocus,
}: {
  label: string;
  value: string;
  placeholder?: string;
  onChange: (v: string) => void;
  keyboardType?: "default" | "numeric";
  onFocus?: () => void;
}) {
  return (
    <View className="mb-3">
      <Text className="mb-1.5 text-[11px] font-semibold text-slate-500 dark:text-slate-400">
        {label}
      </Text>
      <TextInput
        value={value}
        onChangeText={onChange}
        onFocus={onFocus}
        placeholder={placeholder}
        placeholderTextColor="rgba(148,163,184,0.7)"
        keyboardType={keyboardType}
        className="rounded-2xl border border-white/25 bg-white/40 px-3.5 py-2.5 text-[14px] text-slate-800 dark:border-white/10 dark:bg-white/[0.07] dark:text-slate-100"
      />
    </View>
  );
}

export function CourseEditorPanel({
  visible,
  periods,
  totalWeeks = 18,
  course,
  occurrenceCount = 1,
  currentWeek = 1,
  onClose,
  onSave,
  onDelete,
}: CourseEditorPanelProps) {
  // 由父组件通过 key 保证每次打开时重新挂载，草稿直接从 props 初始化
  const [draft, setDraft] = useState<Omit<Course, "id">>(() =>
    course ? (({ id: _id, ...rest }) => rest)(course) : emptyDraft(totalWeeks),
  );

  const [scope, setScope] = useState<"record" | "selected">("record");
  const [targetWeeks, setTargetWeeks] = useState<number[]>(course?.weeks.includes(currentWeek) ? [currentWeek] : course?.weeks.slice(0, 1) ?? []);

  const set = <K extends keyof Omit<Course, "id">>(
    key: K,
    value: Omit<Course, "id">[K],
  ) => setDraft((d) => ({ ...d, [key]: value }));

  const toggleWeek = (w: number) =>
    setDraft((d) => ({
      ...d,
      weeks: d.weeks.includes(w)
        ? d.weeks.filter((x) => x !== w)
        : [...d.weeks, w].sort((a, b) => a - b),
    }));

  /* ---------------- 键盘避让 ----------------
     vh 单位在原生端不生效，ScrollView 必须用实测高度约束，
     否则面板随内容撑开、键盘弹出后顶部输入框被顶出屏幕且无法滚动 */
  const { height: winH } = useWindowDimensions();
  const [kbH, setKbH] = useState(0);
  const scrollRef = useRef<ScrollViewInstance>(null);

  useEffect(() => {
    const show = Keyboard.addListener("keyboardDidShow", (e) =>
      setKbH(e.endCoordinates.height),
    );
    const hide = Keyboard.addListener("keyboardDidHide", () => setKbH(0));
    return () => {
      show.remove();
      hide.remove();
    };
  }, []);

  /** 面板高度固定为屏高的固定比例：从任何入口打开位置都一致；
      键盘弹出时收缩并整体上移（KAV 负责），内容在内部滚动 */
  const sheetH = Math.max(
    300,
    Math.min(Math.round(winH * 0.82), winH - kbH - 16),
  );

  /** 聚焦时回到内容顶部：三个文本输入框都在顶部区域，
      保证键盘弹出后输入框始终在可视区内（Android 不会自动滚动） */
  const focusField = () => {
    scrollRef.current?.scrollTo({ y: 0, animated: true });
  };

  const maxPeriod = periods[periods.length - 1]?.index ?? 12;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      {/* Modal 在 Android 上是独立 Dialog 窗口，必须自带模糊源，
          否则跨窗口引用 blurTarget 会导致原生崩溃 */}
      <GlassTargetProvider>
        <View className="flex-1 justify-end bg-black/45">
          <Pressable className="flex-1" onPress={onClose} />
          {/* 弹窗是独立 Dialog 窗口，不随系统 resize，
              用 KAV 把面板整体抬到键盘上方 */}
          <KeyboardAvoidingView behavior="padding">
            <Animated.View
              entering={FadeInDown.springify()}
              exiting={FadeOutDown}
            >
              <GlassContainer
                variant="sheet"
                radius={32}
                borderOpacity={0.3}
                style={{ height: sheetH, paddingBottom: 16 }}
              >
                <ScrollView
                  ref={scrollRef}
                  style={{ flex: 1 }}
                  contentContainerStyle={{ paddingBottom: 4 }}
                  className="px-5 pt-5"
                  keyboardShouldPersistTaps="handled"
                >
                  {/* 头部 */}
                  <View className="mb-4 flex-row items-center justify-between">
                    <Text className="text-[17px] font-bold text-slate-800 dark:text-white">
                      {course ? "编辑课程" : "添加课程"}
                    </Text>
                    <Pressable
                      onPress={onClose}
                      className="h-8 w-8 items-center justify-center rounded-full bg-white/20 dark:bg-white/10"
                    >
                      <Ionicons name="close" size={16} color="#94A3B8" />
                    </Pressable>
                  </View>

                  <Field
                    label="课程名称"
                    value={draft.name}
                    onChange={(v) => set("name", v)}
                    onFocus={focusField}
                  />
                  <Field
                    label="授课教师"
                    value={draft.teacher}
                    onChange={(v) => set("teacher", v)}
                    onFocus={focusField}
                  />
                  <Field
                    label="上课教室"
                    value={draft.classroom}
                    onChange={(v) => set("classroom", v)}
                    onFocus={focusField}
                  />

                  {course && <View className="mb-4">
                    <Text className="mb-2 text-xs font-semibold text-slate-500 dark:text-slate-400">修改 / 删除范围（本条记录：周{course.weekday} 第{course.startPeriod}–{course.endPeriod}节）</Text>
                    <View className="flex-row gap-2">
                      <Pressable onPress={() => setScope("record")} className="rounded-xl bg-sky-400/20 p-3"><Text className="text-sky-600 dark:text-sky-300">{scope === "record" ? "✓ " : ""}整条重复记录</Text></Pressable>
                      <Pressable onPress={() => setScope("selected")} className="rounded-xl bg-sky-400/20 p-3"><Text className="text-sky-600 dark:text-sky-300">{scope === "selected" ? "✓ " : ""}指定周次</Text></Pressable>
                    </View>
                    {scope === "selected" && <>
                      <Text className="my-2 text-xs text-slate-500 dark:text-slate-400">修改或删除仅作用于以下周次，其余周保持原样</Text>
                      <View className="flex-row flex-wrap gap-2">{course.weeks.map(w => <Pressable key={w} onPress={() => setTargetWeeks(prev => prev.includes(w) ? prev.filter(x => x !== w) : [...prev, w])} className={`rounded-lg p-2 ${targetWeeks.includes(w) ? "bg-sky-400/40" : "bg-slate-400/10"}`}><Text className="text-slate-700 dark:text-slate-200">第{w}周</Text></Pressable>)}</View>
                    </>}
                    {onDelete && <>
                      <Text className="my-2 text-xs text-slate-500 dark:text-slate-400">该课程共有 {occurrenceCount} 条上课记录。删除按原课程范围执行，不受下方未保存修改影响。</Text>
                      <View className="flex-row flex-wrap gap-2">
                        {(["once", "all"] as const).map(deleteScope => <Pressable key={deleteScope}
                          onPress={() => {
                            if (deleteScope === "once" && scope === "selected" && !targetWeeks.length) { Alert.alert("请选择删除周次"); return; }
                            const weeks = deleteScope === "once" && scope === "selected" ? [...targetWeeks] : undefined;
                            const range = deleteScope === "all" ? `全部 ${occurrenceCount} 条上课记录及其全部周次` : weeks ? `本条记录的第 ${weeks.join("、")} 周` : "本条重复记录的全部周次";
                            Alert.alert("确认删除", `将删除「${course.name}」${range}。`, [
                              { text: "取消", style: "cancel" },
                              { text: "确认删除", style: "destructive", onPress: () => { onDelete(course.id, deleteScope, weeks); onClose(); } },
                            ]);
                          }}
                          className="rounded-xl border border-rose-400/40 bg-rose-400/10 p-3">
                          <Text className="text-xs font-semibold text-rose-600 dark:text-rose-300">{deleteScope === "all" ? "一键删除该课程全部记录" : "删除所选范围"}</Text>
                        </Pressable>)}
                      </View>
                    </>}
                  </View>}
                  {/* 星期 */}
                  <Text className="mb-1.5 text-[11px] font-semibold text-slate-500 dark:text-slate-400">
                    星期
                  </Text>
                  <View className="mb-3 flex-row gap-x-1.5">
                    {WEEKDAY_LABELS.map((label, i) => {
                      const day = i + 1;
                      const sel = draft.weekday === day;
                      return (
                        <Pressable
                          key={label}
                          onPress={() => set("weekday", day)}
                          className={`flex-1 items-center rounded-xl border py-2 ${
                            sel
                              ? "border-sky-400/70 bg-sky-400/25"
                              : "border-white/15 bg-white/[0.06]"
                          }`}
                        >
                          <Text
                            className={`text-[11px] font-semibold ${
                              sel
                                ? "text-sky-300"
                                : "text-slate-500 dark:text-slate-400"
                            }`}
                          >
                            {label}
                          </Text>
                        </Pressable>
                      );
                    })}
                  </View>

                  {/* 节次 */}
                  <View className="mb-1 flex-row items-center gap-x-3">
                    <View className="flex-1">
                      <Text className="mb-1.5 text-[11px] font-semibold text-slate-500 dark:text-slate-400">
                        开始节次
                      </Text>
                      <ScrollView
                        horizontal
                        showsHorizontalScrollIndicator={false}
                      >
                        <View className="flex-row gap-x-1.5">
                          {Array.from(
                            { length: maxPeriod },
                            (_, i) => i + 1,
                          ).map((p) => (
                            <Pressable
                              key={p}
                              onPress={() =>
                                setDraft((d) => ({
                                  ...d,
                                  startTime: undefined,
                                  endTime: undefined,
                                  startPeriod: p,
                                  endPeriod: Math.max(p, d.endPeriod),
                                }))
                              }
                              className={`h-8 w-8 items-center justify-center rounded-lg border ${
                                draft.startPeriod === p
                                  ? "border-sky-400/70 bg-sky-400/25"
                                  : "border-white/15 bg-white/[0.06]"
                              }`}
                            >
                              <Text
                                className={`text-[11px] ${
                                  draft.startPeriod === p
                                    ? "text-sky-300"
                                    : "text-slate-500 dark:text-slate-400"
                                }`}
                              >
                                {p}
                              </Text>
                            </Pressable>
                          ))}
                        </View>
                      </ScrollView>
                    </View>
                    <View className="flex-1">
                      <Text className="mb-1.5 text-[11px] font-semibold text-slate-500 dark:text-slate-400">
                        结束节次
                      </Text>
                      <ScrollView
                        horizontal
                        showsHorizontalScrollIndicator={false}
                      >
                        <View className="flex-row gap-x-1.5">
                          {Array.from(
                            { length: maxPeriod },
                            (_, i) => i + 1,
                          ).map((p) => (
                            <Pressable
                              key={p}
                              disabled={p < draft.startPeriod}
                              onPress={() => setDraft(d => ({ ...d, endPeriod: p, startTime: undefined, endTime: undefined }))}
                              className={`h-8 w-8 items-center justify-center rounded-lg border ${
                                draft.endPeriod === p
                                  ? "border-sky-400/70 bg-sky-400/25"
                                  : "border-white/15 bg-white/[0.06]"
                              } ${p < draft.startPeriod ? "opacity-30" : ""}`}
                            >
                              <Text
                                className={`text-[11px] ${
                                  draft.endPeriod === p
                                    ? "text-sky-300"
                                    : "text-slate-500 dark:text-slate-400"
                                }`}
                              >
                                {p}
                              </Text>
                            </Pressable>
                          ))}
                        </View>
                      </ScrollView>
                    </View>
                  </View>

                  <Field label="精确开始时间（可选，HH:mm）" value={draft.startTime ?? ""} placeholder={periods.find(p => p.index === draft.startPeriod)?.startTime} onChange={v => set("startTime", v || undefined)} />
                  <Field label="精确结束时间（可选，HH:mm）" value={draft.endTime ?? ""} placeholder={periods.find(p => p.index === draft.endPeriod)?.endTime} onChange={v => set("endTime", v || undefined)} />
                  {/* 周次 */}
                  {scope === "record" && <>
                  <Text className="mb-1.5 mt-3 text-[11px] font-semibold text-slate-500 dark:text-slate-400">
                    上课周次（已选 {draft.weeks.length} 周）
                  </Text>
                  <View className="mb-3 flex-row flex-wrap gap-1.5">
                    {Array.from({ length: totalWeeks }, (_, i) => i + 1).map(
                      (w) => {
                        const sel = draft.weeks.includes(w);
                        return (
                          <Pressable
                            key={w}
                            onPress={() => toggleWeek(w)}
                            className={`h-8 w-8 items-center justify-center rounded-lg border ${
                              sel
                                ? "border-sky-400/70 bg-sky-400/25"
                                : "border-white/15 bg-white/[0.06]"
                            }`}
                          >
                            <Text
                              className={`text-[11px] ${sel ? "text-sky-300" : "text-slate-500 dark:text-slate-400"}`}
                            >
                              {w}
                            </Text>
                          </Pressable>
                        );
                      },
                    )}
                  </View>

                  </>}
                  {/* 颜色 */}
                  <Text className="mb-1.5 text-[11px] font-semibold text-slate-500 dark:text-slate-400">
                    主题色
                  </Text>
                  <View className="mb-4 flex-row gap-x-2.5">
                    {courseColorNames.map((name: CourseColor) => (
                      <Pressable
                        key={name}
                        onPress={() => set("color", name)}
                        className={`h-9 flex-1 rounded-full border ${
                          draft.color === name
                            ? "border-white/60"
                            : "border-transparent"
                        }`}
                        style={{ backgroundColor: coursePalette[name].solid }}
                      />
                    ))}
                  </View>

                  {/* 保存 / 删除 */}
                  <Pressable
                    onPress={() => {
                      if (scope === "selected" && !targetWeeks.length) { Alert.alert("请选择修改周次"); return; }
                      onSave(course ? { ...draft, id: course.id, weeks: scope === "selected" ? targetWeeks : draft.weeks } : draft, scope === "selected" ? targetWeeks : undefined);
                    }}
                    className="mb-3 items-center rounded-2xl bg-sky-500/90 py-3.5"
                  >
                    <Text className="text-[15px] font-bold text-white">
                      {course ? "保存修改" : "添加课程"}
                    </Text>
                  </Pressable>

                </ScrollView>
              </GlassContainer>
            </Animated.View>
          </KeyboardAvoidingView>
        </View>
      </GlassTargetProvider>
    </Modal>
  );
}
