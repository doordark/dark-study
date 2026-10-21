import { Ionicons } from "@expo/vector-icons";
import React, { useEffect, useRef, useState } from "react";
import {
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
  onClose: () => void;
  onSave: (course: Omit<Course, "id"> & { id?: string }) => void;
  onDelete?: (id: string) => void;
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
  onClose,
  onSave,
  onDelete,
}: CourseEditorPanelProps) {
  // 由父组件通过 key 保证每次打开时重新挂载，草稿直接从 props 初始化
  const [draft, setDraft] = useState<Omit<Course, "id">>(() =>
    course ? (({ id: _id, ...rest }) => rest)(course) : emptyDraft(totalWeeks),
  );

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

  /** 弹窗可视区高度扣除键盘，面板压缩为可滚动 */
  const bodyMaxH = Math.max(240, winH - kbH - 24);

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
                radius={32}
                intensity={62}
                borderOpacity={0.3}
                style={{ paddingBottom: 16 }}
              >
                <ScrollView
                  ref={scrollRef}
                  style={{ maxHeight: bodyMaxH }}
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
                    placeholder="如：数据结构与算法"
                    onChange={(v) => set("name", v)}
                    onFocus={focusField}
                  />
                  <Field
                    label="授课教师"
                    value={draft.teacher}
                    placeholder="如：陈明远"
                    onChange={(v) => set("teacher", v)}
                    onFocus={focusField}
                  />
                  <Field
                    label="上课教室"
                    value={draft.classroom}
                    placeholder="如：教三 305"
                    onChange={(v) => set("classroom", v)}
                    onFocus={focusField}
                  />

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
                              onPress={() => set("endPeriod", p)}
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

                  {/* 周次 */}
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
                    onPress={() =>
                      onSave(course ? { ...draft, id: course.id } : draft)
                    }
                    className="mb-3 items-center rounded-2xl bg-sky-500/90 py-3.5"
                  >
                    <Text className="text-[15px] font-bold text-white">
                      {course ? "保存修改" : "添加课程"}
                    </Text>
                  </Pressable>

                  {course && onDelete ? (
                    <Pressable
                      onPress={() => {
                        onDelete(course.id);
                        onClose();
                      }}
                      className="mb-2 items-center rounded-2xl border border-rose-400/40 bg-rose-400/15 py-3"
                    >
                      <Text className="text-[14px] font-semibold text-rose-300">
                        删除课程
                      </Text>
                    </Pressable>
                  ) : null}
                </ScrollView>
              </GlassContainer>
            </Animated.View>
          </KeyboardAvoidingView>
        </View>
      </GlassTargetProvider>
    </Modal>
  );
}
