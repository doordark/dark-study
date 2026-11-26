import Ionicons from "@expo/vector-icons/Ionicons";
import DateTimePicker, {
  DateTimePickerAndroid,
} from "@react-native-community/datetimepicker";
import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  Alert,
  Keyboard,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  useWindowDimensions,
  View,
  type ScrollViewInstance,
} from "react-native";
import { useColorScheme } from "nativewind";
import Animated, { Easing, FadeInDown, useReducedMotion } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { CourseExceptionForm } from "@/components/CourseExceptionForm";
import {
  GlassContainer,
  GlassTargetProvider,
} from "@/components/GlassContainer";
import {
  courseColorNames,
  coursePalette,
  WEEKDAY_LABELS,
} from "@/constants/palette";
import type { Course, CourseColor, Period, Schedule } from "@/types";
import {
  courseDeletionRows,
  sameCourseIdentity,
  validClock,
} from "@/utils/courseEditing";
import { findConflicts, normalizeClockInput } from "@/utils/time";

const actionButton = "items-center rounded-2xl py-3.5";
const actionText = "text-[15px] font-bold text-white";

const COURSE_COLOR_LABELS: Record<CourseColor, string> = {
  sky: "天蓝",
  violet: "紫罗兰",
  emerald: "翡翠绿",
  amber: "琥珀黄",
  rose: "玫瑰红",
  cyan: "青色",
};

function hexToRgba(hex: string, alpha: number): string {
  const clean = hex.replace("#", "");
  const r = parseInt(clean.slice(0, 2), 16);
  const g = parseInt(clean.slice(2, 4), 16);
  const b = parseInt(clean.slice(4, 6), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

interface DeleteConfirmation {
  schedule: Schedule;
  weeks?: number[];
  recordOnly?: boolean;
  siblingCount: number;
  rows: Course[];
}

export interface CourseEditorPanelProps {
  visible: boolean;
  periods: Period[];
  /** 学期总周数，默认 18 */
  totalWeeks?: number;
  /** 传入则为编辑，undefined 为新建 */
  course?: Course;
  /** 新建课程时的初始预填（如当前浏览星期、周视图空白格节次或复制已有课程） */
  initialDraft?: Partial<Omit<Course, "id">>;
  /** 直接进入「临时调整（调/停/补课）」子视图 */
  initialException?: boolean;
  exceptionSchedule?: Schedule;
  currentWeek?: number;
  onClose: () => void;
  onSave: (course: Omit<Course, "id"> & { id?: string }, targetWeeks?: number[]) => void;
  /** 传入 targetWeeks 只删指定周次；recordOnly=true 仅删本条记录；否则删除整门课全部记录。 */
  onDelete?: (
    id: string,
    schedule: Schedule,
    targetWeeks?: number[],
    recordOnly?: boolean,
  ) => void;
}

const emptyDraft = (
  totalWeeks: number,
  periods: Period[],
  initial?: Partial<Omit<Course, "id">>,
): Omit<Course, "id"> => {
  const maxPeriod = periods[periods.length - 1]?.index ?? 12;
  const startPeriod = Math.min(Math.max(initial?.startPeriod ?? 1, 1), maxPeriod);
  const defaultEnd = initial?.endPeriod ?? Math.min(startPeriod + 1, maxPeriod);
  const endPeriod = Math.min(Math.max(defaultEnd, startPeriod), maxPeriod);
  return {
    name: initial?.name ?? "",
    teacher: initial?.teacher ?? "",
    classroom: initial?.classroom ?? "",
    weekday: Math.min(Math.max(initial?.weekday ?? 1, 1), 7),
    startPeriod,
    endPeriod,
    weeks:
      initial?.weeks?.length
        ? [...initial.weeks]
        : Array.from({ length: totalWeeks }, (_, i) => i + 1),
    color: initial?.color ?? "sky",
    startTime: initial?.startTime,
    endTime: initial?.endTime,
    credits: initial?.credits,
    note: initial?.note ?? "",
  };
};

function Field({
  label,
  value,
  placeholder,
  onChange,
  keyboardType,
  multiline,
  rightAction,
  onFocus,
}: {
  label: string;
  value: string;
  placeholder?: string;
  onChange: (v: string) => void;
  keyboardType?: "default" | "numeric" | "decimal-pad";
  multiline?: boolean;
  rightAction?: React.ReactNode;
  onFocus?: () => void;
}) {
  return (
    <View className="mb-3">
      <Text className="mb-1.5 text-[11px] font-semibold text-slate-600 dark:text-slate-400">
        {label}
      </Text>
      <View className="flex-row items-center gap-2">
        <TextInput
          value={value}
          onChangeText={onChange}
          onFocus={onFocus}
          placeholder={placeholder}
          placeholderTextColor="rgba(148,163,184,0.75)"
          keyboardType={keyboardType}
          multiline={multiline}
          textAlignVertical={multiline ? "top" : "center"}
          style={multiline ? { minHeight: 72 } : undefined}
          className="flex-1 rounded-2xl border border-slate-300/35 bg-white/50 px-3.5 py-2.5 text-[14px] text-slate-800 dark:border-white/10 dark:bg-white/[0.07] dark:text-slate-100"
        />
        {rightAction}
      </View>
    </View>
  );
}

function parseClockToDate(clock: string | undefined, fallback: string | undefined): Date {
  const src = normalizeClockInput(clock || fallback || "08:00");
  const d = new Date();
  const m = /^(\d{2}):(\d{2})$/.exec(src);
  if (m) d.setHours(Number(m[1]), Number(m[2]), 0, 0);
  else d.setHours(8, 0, 0, 0);
  return d;
}

function formatDateClock(d: Date): string {
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

export function CourseEditorPanel(props: CourseEditorPanelProps) {
  // 关闭时不挂载 Modal 与 Keyboard 监听，降低常驻内存与事件开销
  if (!props.visible) return null;
  return <CourseEditorPanelBody {...props} />;
}

function CourseEditorPanelBody({
  visible,
  periods,
  totalWeeks = 18,
  course,
  initialDraft,
  initialException = false,
  exceptionSchedule,
  currentWeek = 1,
  onClose,
  onSave,
  onDelete,
}: CourseEditorPanelProps) {
  const [draft, setDraft] = useState<Omit<Course, "id">>(() =>
    course
      ? (({ id: _id, ...rest }) => rest)(course)
      : emptyDraft(totalWeeks, periods, initialDraft),
  );
  const [creditText, setCreditText] = useState(() =>
    draft.credits != null ? String(draft.credits) : "",
  );

  const [scope, setScope] = useState<"record" | "selected">("record");
  const [exceptionOpen, setExceptionOpen] = useState(
    Boolean(initialException && course && exceptionSchedule),
  );
  const [deleteConfirmation, setDeleteConfirmation] =
    useState<DeleteConfirmation | null>(null);
  const [iosTimeField, setIosTimeField] = useState<"startTime" | "endTime" | null>(
    null,
  );

  const closePanel = () => {
    if (deleteConfirmation) setDeleteConfirmation(null);
    else if (exceptionOpen) setExceptionOpen(false);
    else onClose();
  };

  const [targetWeeks, setTargetWeeks] = useState<number[]>(
    course?.weeks.includes(currentWeek)
      ? [currentWeek]
      : course?.weeks.slice(0, 1) ?? [],
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

  const { height: winH } = useWindowDimensions();
  const { colorScheme } = useColorScheme();
  const isDark = colorScheme !== "light";
  const insets = useSafeAreaInsets();
  const reducedMotion = useReducedMotion();
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

  const sheetH = Math.max(
    320,
    Math.min(Math.round(winH * 0.84), winH - kbH - 16),
  );
  const bottomSafePad = kbH > 0 ? 16 : Math.max(insets.bottom, 16) + 12;

  const focusTopField = () => {
    scrollRef.current?.scrollTo({ y: 0, animated: true });
  };

  const periodOptions = useMemo(() => periods.map((p) => p.index), [periods]);
  const weekOptions = useMemo(
    () =>
      [
        ...new Set([
          ...Array.from({ length: totalWeeks }, (_, i) => i + 1),
          ...(course?.weeks ?? []),
        ]),
      ].sort((a, b) => a - b),
    [totalWeeks, course?.weeks],
  );

  /** 周次快捷预设：同时适用于全选周次与指定修改周次 */
  const applyWeekPreset = (
    pool: number[],
    preset: "all" | "odd" | "even" | "firstHalf" | "secondHalf" | "clear",
    setter: (next: number[]) => void,
  ) => {
    const mid = Math.ceil(totalWeeks / 2);
    if (preset === "all") setter([...pool]);
    else if (preset === "odd") setter(pool.filter((w) => w % 2 === 1));
    else if (preset === "even") setter(pool.filter((w) => w % 2 === 0));
    else if (preset === "firstHalf") setter(pool.filter((w) => w <= mid));
    else if (preset === "secondHalf") setter(pool.filter((w) => w > mid));
    else setter([]);
  };

  /** 实时冲突预警：保存前让用户一眼看到是否与已有课程重叠（不阻塞保存） */
  const draftConflicts = useMemo(() => {
    if (!exceptionSchedule) return [];
    const activeWeeks = scope === "selected" ? targetWeeks : draft.weeks;
    if (!activeWeeks.length) return [];
    const normalizedStart = draft.startTime
      ? normalizeClockInput(draft.startTime)
      : undefined;
    const normalizedEnd = draft.endTime
      ? normalizeClockInput(draft.endTime)
      : undefined;
    const probeId = "__draft_probe__";
    const probe: Course = {
      ...draft,
      id: probeId,
      weeks: activeWeeks,
      startTime: validClock(normalizedStart) ? normalizedStart : undefined,
      endTime: validClock(normalizedEnd) ? normalizedEnd : undefined,
    };
    const others = exceptionSchedule.courses.filter((c) => {
      if (!course || c.id !== course.id) return true;
      // 编辑部分周次时，原记录保留的未选周仍可能和新时段冲突；整条修改时排除原记录本身
      return scope === "selected";
    }).map((c) => {
      if (course && c.id === course.id && scope === "selected") {
        return { ...c, weeks: c.weeks.filter((w) => !targetWeeks.includes(w)) };
      }
      return c;
    });
    const map = findConflicts([...others, probe], undefined, periods);
    return [...new Set(map.get(probeId) ?? [])];
  }, [course, draft, exceptionSchedule, periods, scope, targetWeeks]);

  const openTimePicker = (field: "startTime" | "endTime") => {
    const fallback = periods.find(
      (p) => p.index === (field === "startTime" ? draft.startPeriod : draft.endPeriod),
    )?.[field];
    const current = parseClockToDate(draft[field], fallback);
    if (Platform.OS === "android") {
      DateTimePickerAndroid.open({
        value: current,
        mode: "time",
        is24Hour: true,
        onValueChange: (_e, selected) => {
          if (selected) set(field, formatDateClock(selected));
        },
      });
    } else if (Platform.OS === "ios") {
      setIosTimeField(field);
    }
  };

  const openDeleteConfirmation = () => {
    if (!course || !exceptionSchedule) return;
    if (scope === "selected" && !targetWeeks.length) {
      Alert.alert("请选择删除周次");
      return;
    }
    const weeks = scope === "selected" ? [...targetWeeks] : undefined;
    const allRows = courseDeletionRows(exceptionSchedule, course, weeks);
    if (!allRows.length) {
      Alert.alert("没有可删除的上课记录");
      return;
    }
    const siblingCount = exceptionSchedule.courses.filter((row) =>
      sameCourseIdentity(row, course),
    ).length;
    Keyboard.dismiss();
    // 若同门课有多个不同星期/时段记录，默认先选中「仅删本条记录」以降低误删风险，同时支持一键切「全部记录」
    const defaultRecordOnly = !weeks && siblingCount > 1;
    setDeleteConfirmation({
      schedule: exceptionSchedule,
      weeks,
      recordOnly: defaultRecordOnly,
      siblingCount,
      rows: defaultRecordOnly ? [course] : allRows,
    });
  };

  const switchDeleteScope = (recordOnly: boolean) => {
    if (!deleteConfirmation || !course) return;
    const rows = recordOnly
      ? [course]
      : courseDeletionRows(deleteConfirmation.schedule, course);
    setDeleteConfirmation({ ...deleteConfirmation, recordOnly, rows });
  };

  const confirmDelete = () => {
    if (!course || !deleteConfirmation || !onDelete) return;
    setDeleteConfirmation(null);
    try {
      onDelete(
        course.id,
        deleteConfirmation.schedule,
        deleteConfirmation.weeks,
        deleteConfirmation.recordOnly,
      );
    } catch (error) {
      Alert.alert(
        "删除失败",
        error instanceof Error ? error.message : "请重新打开课程后再试",
      );
    }
  };

  const handleSavePress = () => {
    if (scope === "selected" && !targetWeeks.length) {
      Alert.alert("请选择修改周次");
      return;
    }
    const trimmedCredit = creditText.trim();
    let parsedCredits: number | undefined;
    if (trimmedCredit) {
      const n = Number(trimmedCredit);
      if (!Number.isFinite(n) || n <= 0 || n > 30) {
        Alert.alert("学分无效", "请输入 0 到 30 之间的数字，或留空。");
        return;
      }
      parsedCredits = n;
    }
    const cleanedDraft: Omit<Course, "id"> = {
      ...draft,
      name: draft.name.trim(),
      teacher: draft.teacher.trim(),
      classroom: draft.classroom.trim(),
      note: draft.note?.trim() ?? "",
      credits: parsedCredits,
      startTime: draft.startTime?.trim()
        ? normalizeClockInput(draft.startTime)
        : undefined,
      endTime: draft.endTime?.trim()
        ? normalizeClockInput(draft.endTime)
        : undefined,
    };
    onSave(
      course
        ? {
            ...cleanedDraft,
            id: course.id,
            weeks: scope === "selected" ? targetWeeks : cleanedDraft.weeks,
          }
        : cleanedDraft,
      scope === "selected" ? targetWeeks : undefined,
    );
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={closePanel}
    >
      <GlassTargetProvider>
        <View className="flex-1 justify-end bg-black/45">
          <Pressable className="flex-1" onPress={closePanel} />
          <KeyboardAvoidingView
            behavior="padding"
            importantForAccessibility={
              deleteConfirmation ? "no-hide-descendants" : "auto"
            }
            accessibilityElementsHidden={!!deleteConfirmation}
          >
            <Animated.View
              entering={
                reducedMotion
                  ? undefined
                  : FadeInDown.duration(220).easing(Easing.out(Easing.cubic))
              }
            >
              {/* 关闭 GlassContainer 顶层 SVG 99% 描边并把底部留白移入 ScrollView，避免白色底边横线穿过“删除课程”按钮 */}
              <GlassContainer
                variant="sheet"
                radius={32}
                borderOpacity={0}
                style={{
                  height: sheetH,
                  borderTopLeftRadius: 32,
                  borderTopRightRadius: 32,
                  borderBottomLeftRadius: 0,
                  borderBottomRightRadius: 0,
                  borderWidth: 1,
                  borderBottomWidth: 0,
                  borderColor: isDark
                    ? "rgba(255,255,255,0.16)"
                    : "rgba(255,255,255,0.72)",
                }}
              >
                <ScrollView
                  ref={scrollRef}
                  style={{ flex: 1 }}
                  contentContainerStyle={{ paddingBottom: bottomSafePad }}
                  className="px-5 pt-5"
                  showsVerticalScrollIndicator={false}
                  keyboardShouldPersistTaps="handled"
                >
                  {exceptionOpen && course && exceptionSchedule ? (
                    <CourseExceptionForm
                      course={course}
                      schedule={exceptionSchedule}
                      currentWeek={currentWeek}
                      onClose={() => setExceptionOpen(false)}
                      onDone={onClose}
                    />
                  ) : (
                    <>
                      {/* 头部 */}
                      <View className="mb-3.5 flex-row items-center justify-between">
                        <Text className="text-[17px] font-bold text-slate-800 dark:text-white">
                          {course ? "编辑课程" : "添加课程"}
                        </Text>
                        <Pressable
                          onPress={onClose}
                          accessibilityRole="button"
                          accessibilityLabel="关闭课程编辑面板"
                          className="h-8 w-8 items-center justify-center rounded-full bg-slate-400/15 dark:bg-white/10"
                        >
                          <Ionicons name="close" size={16} color="#64748B" />
                        </Pressable>
                      </View>

                      {course && exceptionSchedule ? (
                        <View className="mb-3.5 flex-row flex-wrap gap-2">
                          <Pressable
                            accessibilityRole="button"
                            onPress={() => {
                              setExceptionOpen(true);
                              scrollRef.current?.scrollTo({ y: 0, animated: false });
                            }}
                            className="flex-row items-center self-start rounded-xl border border-sky-400/35 bg-sky-400/15 px-3 py-2"
                          >
                            <Ionicons name="swap-horizontal" size={13} color="#0284C7" />
                            <Text className="ml-1.5 text-xs font-semibold text-sky-700 dark:text-sky-300">
                              临时调课 / 停课 / 补课
                            </Text>
                          </Pressable>
                        </View>
                      ) : null}

                      <Field
                        label="课程名称"
                        value={draft.name}
                        placeholder="如：数据结构"
                        onChange={(v) => set("name", v)}
                        onFocus={focusTopField}
                      />
                      <View className="flex-row gap-2.5">
                        <View className="flex-1">
                          <Field
                            label="授课教师"
                            value={draft.teacher}
                            placeholder="选填"
                            onChange={(v) => set("teacher", v)}
                            onFocus={focusTopField}
                          />
                        </View>
                        <View className="w-24">
                          <Field
                            label="学分"
                            value={creditText}
                            placeholder="如 3.0"
                            keyboardType="decimal-pad"
                            onChange={setCreditText}
                            onFocus={focusTopField}
                          />
                        </View>
                      </View>
                      <Field
                        label="上课教室"
                        value={draft.classroom}
                        placeholder="如：教三 210"
                        onChange={(v) => set("classroom", v)}
                        onFocus={focusTopField}
                      />
                      <Field
                        label="课程备注（选填：群号 / 教材 / 考核方式等）"
                        value={draft.note ?? ""}
                        placeholder="在日视图课程卡片上展示摘要"
                        onChange={(v) => set("note", v)}
                        multiline
                      />

                      {course ? (
                        <View className="mb-4">
                          <Text className="mb-2 text-xs font-semibold text-slate-600 dark:text-slate-400">
                            修改 / 删除范围（本条：{WEEKDAY_LABELS[course.weekday - 1]} 第{course.startPeriod}
                            {course.endPeriod !== course.startPeriod ? `–${course.endPeriod}` : ""}节）
                          </Text>
                          <View className="flex-row gap-2">
                            {(
                              [
                                ["record", "整条重复记录"],
                                ["selected", "仅指定周次"],
                              ] as const
                            ).map(([key, label]) => {
                              const on = scope === key;
                              return (
                                <Pressable
                                  key={key}
                                  accessibilityRole="radio"
                                  accessibilityState={{ checked: on }}
                                  onPress={() => setScope(key)}
                                  className={`flex-1 items-center rounded-xl border py-2.5 ${
                                    on
                                      ? "border-sky-500/75 bg-sky-500/20"
                                      : "border-slate-300/35 bg-slate-400/10 dark:border-white/10 dark:bg-white/[0.05]"
                                  }`}
                                >
                                  <Text
                                    className={`text-xs font-semibold ${
                                      on
                                        ? "text-sky-700 dark:text-sky-300"
                                        : "text-slate-600 dark:text-slate-300"
                                    }`}
                                  >
                                    {on ? "✓ " : ""}
                                    {label}
                                  </Text>
                                </Pressable>
                              );
                            })}
                          </View>
                          {scope === "selected" ? (
                            <>
                              <Text className="mt-2 text-xs text-slate-500 dark:text-slate-400">
                                仅拆分修改或删除本条记录中勾选的周次（已选 {targetWeeks.length} 周）
                              </Text>
                              <View className="mt-2 flex-row flex-wrap gap-1.5">
                                {(
                                  [
                                    ["all", "全选"],
                                    ["odd", "单周"],
                                    ["even", "双周"],
                                    ["clear", "清空"],
                                  ] as const
                                ).map(([preset, title]) => (
                                  <Pressable
                                    key={preset}
                                    onPress={() =>
                                      applyWeekPreset(course.weeks, preset, setTargetWeeks)
                                    }
                                    className="rounded-lg border border-slate-300/35 bg-white/30 px-2.5 py-1 dark:border-white/10 dark:bg-white/[0.06]"
                                  >
                                    <Text className="text-[11px] font-semibold text-slate-600 dark:text-slate-300">
                                      {title}
                                    </Text>
                                  </Pressable>
                                ))}
                              </View>
                              <View className="mt-2 flex-row flex-wrap gap-1.5">
                                {course.weeks.map((w) => {
                                  const sel = targetWeeks.includes(w);
                                  return (
                                    <Pressable
                                      key={w}
                                      onPress={() =>
                                        setTargetWeeks((prev) =>
                                          prev.includes(w)
                                            ? prev.filter((x) => x !== w)
                                            : [...prev, w].sort((a, b) => a - b),
                                        )
                                      }
                                      className={`rounded-lg border px-2.5 py-1.5 ${
                                        sel
                                          ? "border-sky-500/75 bg-sky-500/20"
                                          : "border-slate-300/30 bg-slate-400/10 dark:border-white/10"
                                      }`}
                                    >
                                      <Text
                                        className={`text-xs font-semibold ${
                                          sel
                                            ? "text-sky-700 dark:text-sky-300"
                                            : "text-slate-600 dark:text-slate-300"
                                        }`}
                                      >
                                        第{w}周
                                      </Text>
                                    </Pressable>
                                  );
                                })}
                              </View>
                            </>
                          ) : null}
                        </View>
                      ) : null}

                      {/* 星期 */}
                      <Text className="mb-1.5 text-[11px] font-semibold text-slate-600 dark:text-slate-400">
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
                                  ? "border-sky-500/75 bg-sky-500/20"
                                  : "border-slate-300/35 bg-white/30 dark:border-white/15 dark:bg-white/[0.06]"
                              }`}
                            >
                              <Text
                                className={`text-[11px] font-semibold ${
                                  sel
                                    ? "text-sky-700 dark:text-sky-300"
                                    : "text-slate-600 dark:text-slate-400"
                                }`}
                              >
                                {label}
                              </Text>
                            </Pressable>
                          );
                        })}
                      </View>

                      {/* 节次 */}
                      <View className="mb-3 flex-row items-center gap-x-3">
                        <View className="flex-1">
                          <Text className="mb-1.5 text-[11px] font-semibold text-slate-600 dark:text-slate-400">
                            开始节次 · 第{draft.startPeriod}节
                          </Text>
                          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                            <View className="flex-row gap-x-1.5">
                              {periodOptions.map((p) => {
                                const sel = draft.startPeriod === p;
                                return (
                                  <Pressable
                                    key={p}
                                    onPress={() =>
                                      setDraft((d) => ({
                                        ...d,
                                        startTime: undefined,
                                        endTime: undefined,
                                        startPeriod: p,
                                        endPeriod: periodOptions.includes(d.endPeriod)
                                          ? Math.max(p, d.endPeriod)
                                          : p,
                                      }))
                                    }
                                    className={`h-8 w-8 items-center justify-center rounded-lg border ${
                                      sel
                                        ? "border-sky-500/75 bg-sky-500/20"
                                        : "border-slate-300/35 bg-white/30 dark:border-white/15 dark:bg-white/[0.06]"
                                    }`}
                                  >
                                    <Text
                                      className={`text-[11px] font-semibold ${
                                        sel
                                          ? "text-sky-700 dark:text-sky-300"
                                          : "text-slate-600 dark:text-slate-400"
                                      }`}
                                    >
                                      {p}
                                    </Text>
                                  </Pressable>
                                );
                              })}
                            </View>
                          </ScrollView>
                        </View>
                        <View className="flex-1">
                          <Text className="mb-1.5 text-[11px] font-semibold text-slate-600 dark:text-slate-400">
                            结束节次 · 第{draft.endPeriod}节
                          </Text>
                          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                            <View className="flex-row gap-x-1.5">
                              {periodOptions.map((p) => {
                                const sel = draft.endPeriod === p;
                                return (
                                  <Pressable
                                    key={p}
                                    disabled={p < draft.startPeriod}
                                    onPress={() =>
                                      setDraft((d) => ({
                                        ...d,
                                        endPeriod: p,
                                        startTime: undefined,
                                        endTime: undefined,
                                      }))
                                    }
                                    className={`h-8 w-8 items-center justify-center rounded-lg border ${
                                      sel
                                        ? "border-sky-500/75 bg-sky-500/20"
                                        : "border-slate-300/35 bg-white/30 dark:border-white/15 dark:bg-white/[0.06]"
                                    } ${p < draft.startPeriod ? "opacity-30" : ""}`}
                                  >
                                    <Text
                                      className={`text-[11px] font-semibold ${
                                        sel
                                          ? "text-sky-700 dark:text-sky-300"
                                          : "text-slate-600 dark:text-slate-400"
                                      }`}
                                    >
                                      {p}
                                    </Text>
                                  </Pressable>
                                );
                              })}
                            </View>
                          </ScrollView>
                        </View>
                      </View>

                      {/* 精确起止时间（支持直接输入或点时钟选择） */}
                      <View className="flex-row gap-2.5">
                        <View className="flex-1">
                          <Field
                            label="精确开始时间（可选）"
                            value={draft.startTime ?? ""}
                            placeholder={
                              periods.find((p) => p.index === draft.startPeriod)?.startTime ?? "08:00"
                            }
                            onChange={(v) => set("startTime", v || undefined)}
                            rightAction={
                              Platform.OS !== "web" ? (
                                <Pressable
                                  accessibilityRole="button"
                                  accessibilityLabel="选择精确开始时间"
                                  onPress={() => openTimePicker("startTime")}
                                  className="h-11 w-10 items-center justify-center rounded-2xl border border-slate-300/35 bg-white/40 dark:border-white/10 dark:bg-white/[0.07]"
                                >
                                  <Ionicons name="time-outline" size={16} color="#0EA5E9" />
                                </Pressable>
                              ) : undefined
                            }
                          />
                        </View>
                        <View className="flex-1">
                          <Field
                            label="精确结束时间（可选）"
                            value={draft.endTime ?? ""}
                            placeholder={
                              periods.find((p) => p.index === draft.endPeriod)?.endTime ?? "09:40"
                            }
                            onChange={(v) => set("endTime", v || undefined)}
                            rightAction={
                              Platform.OS !== "web" ? (
                                <Pressable
                                  accessibilityRole="button"
                                  accessibilityLabel="选择精确结束时间"
                                  onPress={() => openTimePicker("endTime")}
                                  className="h-11 w-10 items-center justify-center rounded-2xl border border-slate-300/35 bg-white/40 dark:border-white/10 dark:bg-white/[0.07]"
                                >
                                  <Ionicons name="time-outline" size={16} color="#0EA5E9" />
                                </Pressable>
                              ) : undefined
                            }
                          />
                        </View>
                      </View>

                      {iosTimeField ? (
                        <View className="mb-3 rounded-2xl border border-slate-300/30 bg-white/35 p-2 dark:border-white/10 dark:bg-white/[0.06]">
                          <DateTimePicker
                            value={parseClockToDate(
                              draft[iosTimeField],
                              periods.find(
                                (p) =>
                                  p.index ===
                                  (iosTimeField === "startTime"
                                    ? draft.startPeriod
                                    : draft.endPeriod),
                              )?.[iosTimeField],
                            )}
                            mode="time"
                            is24Hour
                            onValueChange={(_e, selected) => {
                              if (selected) set(iosTimeField, formatDateClock(selected));
                            }}
                            onDismiss={() => setIosTimeField(null)}
                          />
                          <Pressable
                            onPress={() => setIosTimeField(null)}
                            className="mt-1 items-center rounded-xl bg-sky-500/20 py-2"
                          >
                            <Text className="text-xs font-bold text-sky-700 dark:text-sky-300">完成</Text>
                          </Pressable>
                        </View>
                      ) : null}

                      {/* 周次（含快捷选择） */}
                      {scope === "record" ? (
                        <>
                          <View className="mb-1.5 mt-1 flex-row items-center justify-between">
                            <Text className="text-[11px] font-semibold text-slate-600 dark:text-slate-400">
                              上课周次（已选 {draft.weeks.length} 周）
                            </Text>
                          </View>
                          <View className="mb-2 flex-row flex-wrap gap-1.5">
                            {(
                              [
                                ["all", "全选"],
                                ["odd", "单周"],
                                ["even", "双周"],
                                ["firstHalf", "前半学期"],
                                ["secondHalf", "后半学期"],
                                ["clear", "清空"],
                              ] as const
                            ).map(([preset, title]) => (
                              <Pressable
                                key={preset}
                                onPress={() =>
                                  applyWeekPreset(weekOptions, preset, (next) =>
                                    set("weeks", next),
                                  )
                                }
                                className="rounded-lg border border-slate-300/35 bg-white/35 px-2.5 py-1 dark:border-white/10 dark:bg-white/[0.06]"
                              >
                                <Text className="text-[11px] font-semibold text-slate-600 dark:text-slate-300">
                                  {title}
                                </Text>
                              </Pressable>
                            ))}
                          </View>
                          <View className="mb-3 flex-row flex-wrap gap-1.5">
                            {weekOptions.map((w) => {
                              const sel = draft.weeks.includes(w);
                              return (
                                <Pressable
                                  key={w}
                                  onPress={() => toggleWeek(w)}
                                  className={`h-8 w-8 items-center justify-center rounded-lg border ${
                                    sel
                                      ? "border-sky-500/75 bg-sky-500/20"
                                      : "border-slate-300/35 bg-white/30 dark:border-white/15 dark:bg-white/[0.06]"
                                  }`}
                                >
                                  <Text
                                    className={`text-[11px] font-semibold ${
                                      sel
                                        ? "text-sky-700 dark:text-sky-300"
                                        : "text-slate-600 dark:text-slate-400"
                                    }`}
                                  >
                                    {w}
                                  </Text>
                                </Pressable>
                              );
                            })}
                          </View>
                        </>
                      ) : null}

                      {/* 颜色 */}
                      <Text className="mb-1.5 text-[11px] font-semibold text-slate-600 dark:text-slate-400">
                        主题色
                      </Text>
                      <View className="mb-4 flex-row items-center gap-x-2">
                        {courseColorNames.map((name: CourseColor) => {
                          const selected = draft.color === name;
                          const solid = coursePalette[name].solid;
                          return (
                            <View
                              key={name}
                              className="flex-1 rounded-full"
                              style={{
                                borderWidth: 1.5,
                                borderColor: selected
                                  ? hexToRgba(solid, isDark ? 0.65 : 0.52)
                                  : "transparent",
                                boxShadow: selected
                                  ? isDark
                                    ? [
                                        {
                                          offsetX: 0,
                                          offsetY: 0,
                                          blurRadius: 12,
                                          color: hexToRgba(solid, 0.52),
                                        },
                                      ]
                                    : [
                                        {
                                          offsetX: 0,
                                          offsetY: 3,
                                          blurRadius: 10,
                                          color: hexToRgba(solid, 0.42),
                                        },
                                        {
                                          offsetX: 0,
                                          offsetY: 1,
                                          blurRadius: 4,
                                          color: "rgba(15,23,42,0.12)",
                                        },
                                      ]
                                  : undefined,
                              }}
                            >
                              <Pressable
                                onPress={() => set("color", name)}
                                accessibilityRole="radio"
                                accessibilityState={{ selected }}
                                accessibilityLabel={`主题色 ${COURSE_COLOR_LABELS[name]}`}
                                className="h-9 items-center justify-center rounded-full"
                                style={{
                                  backgroundColor: solid,
                                  borderWidth: selected ? 2.5 : 1,
                                  borderColor: selected
                                    ? "#FFFFFF"
                                    : isDark
                                      ? "rgba(255,255,255,0.16)"
                                      : "rgba(255,255,255,0.52)",
                                }}
                              >
                                {selected ? (
                                  <Ionicons
                                    name="checkmark"
                                    size={16}
                                    color="#FFFFFF"
                                    style={{
                                      textShadowColor: "rgba(15,23,42,0.22)",
                                      textShadowOffset: { width: 0, height: 1 },
                                      textShadowRadius: 2,
                                    }}
                                  />
                                ) : null}
                              </Pressable>
                            </View>
                          );
                        })}
                      </View>

                      {/* 实时冲突提示 */}
                      {draftConflicts.length > 0 ? (
                        <View className="mb-3 flex-row items-center rounded-2xl border border-amber-400/45 bg-amber-400/15 px-3.5 py-2.5">
                          <Ionicons name="warning" size={14} color="#F59E0B" />
                          <Text className="ml-2 flex-1 text-[11.5px] font-medium text-amber-700 dark:text-amber-300">
                            与「{draftConflicts.slice(0, 3).join("、")}」在部分周次存在时间冲突（仍可保存）
                          </Text>
                        </View>
                      ) : null}

                      {/* 保存 / 删除 */}
                      <View className="mt-1 gap-y-3">
                        <Pressable
                          onPress={handleSavePress}
                          accessibilityRole="button"
                          className={`${actionButton} bg-sky-500`}
                        >
                          <Text className={actionText}>
                            {course ? "保存修改" : "添加课程"}
                          </Text>
                        </Pressable>
                        {course && onDelete && exceptionSchedule ? (
                          <Pressable
                            accessibilityRole="button"
                            onPress={openDeleteConfirmation}
                            className={`${actionButton} bg-rose-600`}
                          >
                            <Text className={actionText}>删除课程</Text>
                          </Pressable>
                        ) : null}
                      </View>
                    </>
                  )}
                </ScrollView>
              </GlassContainer>
            </Animated.View>
          </KeyboardAvoidingView>

          {deleteConfirmation && course ? (
            <View
              accessibilityViewIsModal
              className="absolute inset-0 items-center justify-center bg-black/50 p-6"
            >
              <View className="w-full max-w-md rounded-3xl bg-white p-5 dark:bg-slate-900">
                <Text
                  accessibilityRole="header"
                  className="text-lg font-bold text-slate-900 dark:text-white"
                >
                  确认删除课程
                </Text>
                <Text className="mt-1 text-sm text-slate-600 dark:text-slate-300">
                  {course.name} ·{" "}
                  {deleteConfirmation.weeks
                    ? "指定周次"
                    : deleteConfirmation.recordOnly
                      ? "仅删除本条上课记录"
                      : "全部上课记录"}
                </Text>

                {/* 当该门课存在多个上课时段时，允许在弹窗里清晰二选一 */}
                {!deleteConfirmation.weeks && deleteConfirmation.siblingCount > 1 ? (
                  <View className="mt-3 flex-row gap-2">
                    <Pressable
                      accessibilityRole="radio"
                      accessibilityState={{ checked: !!deleteConfirmation.recordOnly }}
                      onPress={() => switchDeleteScope(true)}
                      className={`flex-1 items-center rounded-xl border py-2 ${
                        deleteConfirmation.recordOnly
                          ? "border-sky-500/75 bg-sky-500/15"
                          : "border-slate-300/40 bg-slate-100 dark:border-white/10 dark:bg-white/[0.06]"
                      }`}
                    >
                      <Text
                        className={`text-xs font-semibold ${
                          deleteConfirmation.recordOnly
                            ? "text-sky-700 dark:text-sky-300"
                            : "text-slate-600 dark:text-slate-300"
                        }`}
                      >
                        仅删本条记录
                      </Text>
                    </Pressable>
                    <Pressable
                      accessibilityRole="radio"
                      accessibilityState={{ checked: !deleteConfirmation.recordOnly }}
                      onPress={() => switchDeleteScope(false)}
                      className={`flex-1 items-center rounded-xl border py-2 ${
                        !deleteConfirmation.recordOnly
                          ? "border-rose-500/75 bg-rose-500/15"
                          : "border-slate-300/40 bg-slate-100 dark:border-white/10 dark:bg-white/[0.06]"
                      }`}
                    >
                      <Text
                        className={`text-xs font-semibold ${
                          !deleteConfirmation.recordOnly
                            ? "text-rose-600 dark:text-rose-300"
                            : "text-slate-600 dark:text-slate-300"
                        }`}
                      >
                        删除全部 {deleteConfirmation.siblingCount} 条
                      </Text>
                    </Pressable>
                  </View>
                ) : null}

                <ScrollView
                  style={{ maxHeight: winH * 0.32 }}
                  className="my-4"
                  keyboardShouldPersistTaps="handled"
                >
                  {deleteConfirmation.rows.map((row) => (
                    <View
                      key={row.id}
                      className="mb-2 rounded-xl bg-slate-100 px-3 py-2 dark:bg-white/10"
                    >
                      <Text className="font-semibold text-slate-800 dark:text-slate-100">
                        {WEEKDAY_LABELS[row.weekday - 1]} · 第{row.startPeriod}
                        {row.endPeriod !== row.startPeriod
                          ? `–${row.endPeriod}`
                          : ""}
                        节
                      </Text>
                      <Text className="mt-1 text-sm text-slate-600 dark:text-slate-300">
                        第 {[...new Set(row.weeks)].sort((a, b) => a - b).join("、")} 周
                      </Text>
                    </View>
                  ))}
                </ScrollView>
                <View className="flex-row gap-3">
                  <Pressable
                    accessibilityRole="button"
                    onPress={() => setDeleteConfirmation(null)}
                    className={`${actionButton} flex-1 bg-slate-100 dark:bg-white/10`}
                  >
                    <Text className="text-[15px] font-bold text-slate-700 dark:text-slate-200">
                      取消
                    </Text>
                  </Pressable>
                  <Pressable
                    accessibilityRole="button"
                    onPress={confirmDelete}
                    className={`${actionButton} flex-1 bg-rose-600`}
                  >
                    <Text className={actionText}>确认删除</Text>
                  </Pressable>
                </View>
              </View>
            </View>
          ) : null}
        </View>
      </GlassTargetProvider>
    </Modal>
  );
}
