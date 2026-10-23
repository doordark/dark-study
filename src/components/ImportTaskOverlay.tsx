import { Ionicons } from "@expo/vector-icons";
import { router, usePathname } from "expo-router";
import React from "react";
import {
  Pressable,
  ScrollView,
  Text,
  View,
  useWindowDimensions,
} from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, {
  FadeIn,
  FadeInDown,
  runOnJS,
  useAnimatedProps,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from "react-native-reanimated";

import Svg, { Circle, Defs, LinearGradient, Stop } from "react-native-svg";

import { GlassContainer } from "@/components/GlassContainer";
import { useImportTask, type TaskStatus } from "@/store/useImportTask";
import { useStore } from "@/store/useStore";
import type { MergeReport, Schedule } from "@/types";
import { formatCourseGpa } from "@/utils/grades";

const BALL_SIZE = 52;
const EDGE_PAD = 10;
const PRESS_SPRING = { damping: 15, stiffness: 150, mass: 0.6 };

/** 进度环尺寸 */
const RING_R = (BALL_SIZE - 7) / 2;
const RING_C = 2 * Math.PI * RING_R;

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

/** [1,2,3,5] → "1-3,5"，用于预览每门课实际的上课周次 */
function weeksLabel(weeks: number[]): string {
  const sorted = [...weeks].sort((a, b) => a - b);
  if (!sorted.length) return "-";
  const parts: string[] = [];
  let start = sorted[0];
  let prev = sorted[0];
  const flush = () => {
    parts.push(start === prev ? `${start}` : `${start}-${prev}`);
  };
  for (const w of sorted.slice(1)) {
    if (w === prev + 1) {
      prev = w;
      continue;
    }
    flush();
    start = w;
    prev = w;
  }
  flush();
  return parts.join(",");
}

const STATUS_META: Record<
  Exclude<TaskStatus, "idle">,
  {
    icon: "sparkles" | "checkmark" | "alert";
    tint: string;
    tint2: string;
    label: string;
  }
> = {
  analyzing: {
    icon: "sparkles",
    tint: "#38BDF8",
    tint2: "#2DD4BF",
    label: "分析中",
  },
  done: { icon: "checkmark", tint: "#34D399", tint2: "#2DD4BF", label: "完成" },
  error: { icon: "alert", tint: "#F87171", tint2: "#FB7185", label: "失败" },
};

/**
 * 全局导入任务悬浮层：
 * - 弹窗形态：进度条 + 阶段文案，可「收起」为进度球
 * - 进度球形态：吸附屏幕边框、可拖动、点按还原弹窗
 * - 挂载于根布局，退出导入页后任务继续后台分析
 */
export function ImportTaskOverlay() {
  const status = useImportTask((s) => s.status);
  const expanded = useImportTask((s) => s.expanded);
  /** 每个任务一个弹窗实例：新任务重挂，弹窗内选择（如适用周数）自动回到默认 */
  const seq = useImportTask((s) => s.seq);

  if (status === "idle") return null;

  return (
    <View
      pointerEvents="box-none"
      style={{
        position: "absolute",
        left: 0,
        right: 0,
        top: 0,
        bottom: 0,
        zIndex: 999,
      }}
    >
      {expanded ? <TaskDialog key={seq} /> : <ProgressBall />}
    </View>
  );
}

/* -------------------------------------------------------------------------- */
/*  弹窗形态                                                                   */
/* -------------------------------------------------------------------------- */

function TaskDialog() {
  const status = useImportTask((s) => s.status);
  const label = useImportTask((s) => s.label);
  const sourceLabel = useImportTask((s) => s.sourceLabel);
  const phase = useImportTask((s) => s.phase);
  const progress = useImportTask((s) => s.progress);
  const message = useImportTask((s) => s.message);
  const result = useImportTask((s) => s.result);
  const setExpanded = useImportTask((s) => s.setExpanded);
  const clear = useImportTask((s) => s.clear);
  const ack = useImportTask((s) => s.ack);
  const importSchedule = useStore((s) => s.importSchedule);
  const setPeriods = useStore((s) => s.setPeriods);
  const addScheduleWithData = useStore((s) => s.addScheduleWithData);
  const mergeIncoming = useStore((s) => s.mergeIncoming);
  const addGrade = useStore((s) => s.addGrade);
  /** 识别结果默认归入当前学年 */
  const activeGradeYearId = useStore((s) => s.activeGradeYearId);
  /** 当前课表已有课程时，导入前需选择：融合 / 新建 / 覆盖 */
  const hasCourses = useStore((s) => {
    const cur =
      s.schedules.find((x) => x.id === s.activeScheduleId) ?? s.schedules[0];
    return (cur?.courses.length ?? 0) > 0;
  });
  const pathname = usePathname();

  /** 导入方式选择："none"=未选 "choose"=三选一 "mergeConfirm"=冲突确认 */
  const [pick, setPick] = React.useState<"none" | "choose" | "mergeConfirm">(
    "none",
  );
  const [mergePreview, setMergePreview] = React.useState<MergeReport | null>(
    null,
  );

  /* ---------------- 课表适用周数：默认沿用识别出的每门课周次 ---------------- */
  /** null = 沿用识别结果（默认）；数组 = 手动勾选并统一覆盖全部课程 */
  const scheduleResult =
    result?.type === "schedule" ? result.schedule : undefined;
  const scheduleKey = scheduleResult?.id ?? "none";
  // 以识别结果 id 为 key：新结果自动回到「沿用识别周次」，无需 effect 重置
  const [weekSelState, setWeekSelState] = React.useState<{
    key: string;
    value: number[] | null;
  }>({ key: scheduleKey, value: null });
  const weekSel = weekSelState.key === scheduleKey ? weekSelState.value : null;
  const setWeekSel: React.Dispatch<
    React.SetStateAction<number[] | null>
  > = (next) =>
    setWeekSelState((prev) => {
      const current = prev.key === scheduleKey ? prev.value : null;
      const value = typeof next === "function" ? next(current) : next;
      return { key: scheduleKey, value };
    });
  const totalWeeks = Math.max(1, scheduleResult?.totalWeeks ?? 18);
  const allWeeks = React.useMemo(
    () => Array.from({ length: totalWeeks }, (_, i) => i + 1),
    [totalWeeks],
  );
  const applyWeeks = weekSel?.length ? weekSel : allWeeks;
  /** 把所选周数写入全部课程（覆盖识别出的周次），融合/新建/覆盖统一生效；
      未手动选择时保留每门课识别出的周次（同一门课可能只在少数周上课） */
  const withWeeks = (s: Schedule): Schedule =>
    weekSel?.length
      ? { ...s, courses: s.courses.map((c) => ({ ...c, weeks: weekSel })) }
      : s;
  const toggleWeek = (w: number) =>
    setWeekSel((prev) => {
      const cur = prev ?? allWeeks;
      const next = cur.includes(w)
        ? cur.filter((x) => x !== w)
        : [...cur, w].sort((a, b) => a - b);
      // 至少保留 1 周
      return next.length ? next : cur;
    });

  /** 融合：先 dryRun 预检冲突，有冲突则先进确认页 */
  const applyMerge = () => {
    if (!result || result.type !== "schedule") return;
    const preview = mergeIncoming(withWeeks(result.schedule), { dryRun: true });
    if (preview.conflicts.length) {
      setMergePreview(preview);
      setPick("mergeConfirm");
      return;
    }
    doMerge();
  };

  const doMerge = () => {
    if (!result || result.type !== "schedule") return;
    const r = mergeIncoming(withWeeks(result.schedule));
    ack(
      `已融合 ${r.added} 门课程到当前课表${
        r.skipped ? `，${r.skipped} 门无法映射已跳过` : ""
      }${r.conflicts.length ? `；⚠ ${r.conflicts.length} 处时间冲突已标注` : ""}`,
    );
  };

  const applyNew = () => {
    if (!result || result.type !== "schedule") return;
    addScheduleWithData(withWeeks(result.schedule));
    ack(
      `已新建课表「${result.schedule.name?.trim() || "导入课表"}」，导入 ${result.schedule.courses.length} 门课程`,
    );
  };

  const applyReplace = () => {
    if (!result || result.type !== "schedule") return;
    importSchedule(withWeeks(result.schedule));
    ack(`已覆盖当前课表，导入 ${result.schedule.courses.length} 门课程`);
  };

  const applyGrades = () => {
    if (!result || result.type !== "grades") return;
    const yearId = result.yearId ?? activeGradeYearId;
    result.grades.forEach((g) => addGrade({ ...g, yearId }));
    ack(
      `已导入 ${result.grades.length} 条成绩，可在「成绩」页按学年、学期查看和修改`,
    );
  };

  const meta = STATUS_META[status === "idle" ? "analyzing" : status];
  /** 未进入识别流程就失败（如未填 API Key）时 label 为空，给兜底标题 */
  const titleLabel = label || "AI 智能导入";

  /** 关闭弹窗并跳转（已在目标页则不重复跳转） */
  const goto = (path: "/import" | "/grades") => {
    clear();
    if (pathname !== path) router.push(path);
  };

  return (
    <View className="flex-1 items-center justify-center px-8">
      {/* 半透明遮罩：分析中点按无副作用（避免误关）；
          有未确认结果时点按仅收起为悬浮球（防止误丢结果），其余情况关闭 */}
      <Pressable
        style={{ position: "absolute", left: 0, right: 0, top: 0, bottom: 0 }}
        className="bg-black/35"
        onPress={() => {
          if (status === "analyzing") return;
          if (result) setExpanded(false);
          else clear();
        }}
      />
      <Animated.View
        entering={FadeInDown.springify()}
        style={{ width: "100%", maxWidth: 360 }}
      >
        <GlassContainer radius={28} borderOpacity={0.22}>
          <View className="px-5 py-5">
            {/* 头部 */}
            <View className="flex-row items-center">
              <View
                className="h-11 w-11 items-center justify-center rounded-[16px]"
                style={{ backgroundColor: `${meta.tint}25` }}
              >
                <Ionicons name={meta.icon} size={20} color={meta.tint} />
              </View>
              <View className="ml-3 flex-1">
                <Text className="text-[15px] font-bold text-slate-800 dark:text-white">
                  {status === "analyzing"
                    ? `${sourceLabel}已导入 · 正在分析`
                    : status === "done"
                      ? `${titleLabel}完成`
                      : `${titleLabel}失败`}
                </Text>
                <Text className="mt-0.5 text-[11px] text-slate-500 dark:text-slate-400">
                  {titleLabel}
                </Text>
              </View>
              {status === "analyzing" ? (
                <Pressable
                  onPress={() => setExpanded(false)}
                  className="h-8 w-8 items-center justify-center rounded-full bg-white/20 dark:bg-white/[0.07]"
                >
                  <Ionicons name="remove" size={16} color="#94A3B8" />
                </Pressable>
              ) : (
                <Pressable
                  onPress={clear}
                  className="h-8 w-8 items-center justify-center rounded-full bg-white/20 dark:bg-white/[0.07]"
                >
                  <Ionicons name="close" size={16} color="#94A3B8" />
                </Pressable>
              )}
            </View>

            {/* 进度区（仅分析中） */}
            {status === "analyzing" ? (
              <View className="mt-4">
                <View className="h-1.5 overflow-hidden rounded-full bg-white/25 dark:bg-white/[0.08]">
                  <Animated.View
                    style={{
                      width: `${progress}%`,
                      height: "100%",
                      borderRadius: 999,
                      backgroundColor: meta.tint,
                    }}
                  />
                </View>
                <View className="mt-2 flex-row items-center justify-between">
                  <Text className="flex-1 text-[11px] text-slate-500 dark:text-slate-400">
                    {phase}
                  </Text>
                  <Text
                    className="ml-2 text-[11px] font-bold"
                    style={{ color: meta.tint }}
                  >
                    {Math.round(progress)}%
                  </Text>
                </View>
              </View>
            ) : (
              <View className="mt-3.5 rounded-2xl bg-white/20 px-3.5 py-2.5 dark:bg-white/[0.05]">
                <Text className="text-[11.5px] leading-4 text-slate-600 dark:text-slate-300">
                  {message}
                </Text>
              </View>
            )}

            {/* 结果摘要：适用周数选择 + 识别出的课程（确认前可滚动核对） */}
            {result?.type === "schedule" ? (
              <View className="mt-2.5 rounded-2xl bg-white/20 px-3.5 py-2.5 dark:bg-white/[0.05]">
                <View className="flex-row items-center justify-between">
                  <Text className="text-[11px] font-semibold text-slate-700 dark:text-slate-200">
                    课表适用周数
                  </Text>
                  <Pressable hitSlop={6} onPress={() => setWeekSel(null)}>
                    <Text className="text-[10px] font-semibold text-sky-500 dark:text-sky-300">
                      沿用识别周次（默认）
                    </Text>
                  </Pressable>
                </View>
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  className="mt-1.5"
                  contentContainerStyle={{ gap: 5, paddingRight: 6 }}
                >
                  {allWeeks.map((w) => {
                    const on = weekSel?.includes(w) ?? false;
                    return (
                      <Pressable
                        key={w}
                        onPress={() => toggleWeek(w)}
                        className={`h-[26px] min-w-[28px] items-center justify-center rounded-full border px-1.5 ${
                          on
                            ? "border-sky-400/70 bg-sky-400/85"
                            : "border-white/15 bg-white/15 dark:border-white/[0.06] dark:bg-white/[0.05]"
                        }`}
                      >
                        <Text
                          className={`text-[10.5px] font-bold ${
                            on
                              ? "text-white"
                              : "text-slate-500 dark:text-slate-400"
                          }`}
                        >
                          {w}
                        </Text>
                      </Pressable>
                    );
                  })}
                </ScrollView>
                <Text className="mt-1 text-[9.5px] text-slate-400 dark:text-slate-500">
                  {weekSel == null
                    ? "默认保留每门课识别出的周次；点选上方周次可统一覆盖全部课程"
                    : `已选 ${applyWeeks.length} 周，将统一覆盖全部课程的周次`}
                </Text>

                <ScrollView className="mt-2 max-h-[110px]">
                  {result.schedule.courses.map((c, i) => (
                    <Text
                      key={`${c.name}-${i}`}
                      numberOfLines={1}
                      className="py-0.5 text-[10.5px] text-slate-600 dark:text-slate-300"
                    >
                      · {c.name}（周{c.weekday} 第{c.startPeriod}–{c.endPeriod}
                      节{c.classroom ? ` · ${c.classroom}` : ""} · 第
                      {weeksLabel(c.weeks)}周）
                    </Text>
                  ))}
                </ScrollView>
                <Text className="mt-1 text-[10px] text-slate-400">
                  共 {result.schedule.courses.length} 门课
                </Text>
              </View>
            ) : null}
            {result?.type === "periods" ? (
              <View className="mt-2.5 rounded-2xl bg-white/20 px-3.5 py-2.5 dark:bg-white/[0.05]">
                {result.periods.slice(0, 4).map((p) => (
                  <Text
                    key={p.index}
                    className="text-[10.5px] text-slate-600 dark:text-slate-300"
                  >
                    {p.label} · {p.startTime}–{p.endTime}
                  </Text>
                ))}
                <Text className="mt-1 text-[10px] text-slate-400">
                  共 {result.periods.length} 节…
                </Text>
              </View>
            ) : null}
            {result?.type === "grades" ? (
              <View className="mt-2.5 rounded-2xl bg-white/20 px-3.5 py-2.5 dark:bg-white/[0.05]">
                <View className="flex-row items-center pb-1">
                  <Text className="flex-1 text-[10px] font-semibold text-slate-400 dark:text-slate-500">
                    课程
                  </Text>
                  <Text className="w-12 text-right text-[10px] font-semibold text-slate-400 dark:text-slate-500">
                    学分
                  </Text>
                  <Text className="w-12 text-right text-[10px] font-semibold text-slate-400 dark:text-slate-500">
                    分数
                  </Text>
                  <Text className="w-12 text-right text-[10px] font-semibold text-slate-400 dark:text-slate-500">
                    绩点
                  </Text>
                </View>
                <View>
                  {result.grades.slice(0, 5).map((g, i) => (
                    <View key={`${g.name}-${i}`} className="flex-row items-center py-0.5">
                      <Text
                        numberOfLines={1}
                        className="flex-1 text-[10.5px] text-slate-600 dark:text-slate-300"
                      >
                        {g.name}
                      </Text>
                      <Text className="w-12 text-right text-[10.5px] text-slate-500 dark:text-slate-400">
                        {g.credit}
                      </Text>
                      <Text className="w-12 text-right text-[10.5px] text-slate-500 dark:text-slate-400">
                        {g.score || "--"}
                      </Text>
                      <Text className="w-12 text-right text-[10.5px] font-semibold text-sky-500 dark:text-sky-300">
                        {formatCourseGpa(g.gpa)}
                      </Text>
                    </View>
                  ))}
                </View>
                <Text className="mt-1 text-[10px] text-slate-400">
                  共 {result.grades.length} 条成绩
                  {result.grades.length > 5 ? "（仅展示前 5 条）" : ""} ·
                  将按学期归入「成绩」页
                </Text>
              </View>
            ) : null}

            {/* 底部操作 */}
            <View className="mt-4 flex-row gap-x-2.5">
              {status === "analyzing" ? (
                <Pressable
                  onPress={() => setExpanded(false)}
                  className="flex-1 items-center rounded-2xl border border-white/20 bg-white/15 py-2.5 dark:border-white/10 dark:bg-white/[0.05]"
                >
                  <Text className="text-[12px] font-semibold text-slate-600 dark:text-slate-300">
                    收起，后台分析
                  </Text>
                </Pressable>
              ) : result?.type === "schedule" ? (
                pick === "choose" ? (
                  /* 三选一：融合 / 新建 / 覆盖 */
                  <View className="flex-1 gap-y-2">
                    <Pressable
                      onPress={applyMerge}
                      className="flex-row items-center rounded-2xl border border-white/20 bg-white/15 px-3.5 py-2.5 dark:border-white/10 dark:bg-white/[0.05]"
                    >
                      <Ionicons
                        name="git-merge-outline"
                        size={16}
                        color="#38BDF8"
                      />
                      <View className="ml-2.5 flex-1">
                        <Text className="text-[12px] font-semibold text-slate-700 dark:text-slate-200">
                          融合到当前课表
                        </Text>
                        <Text className="mt-0.5 text-[10px] text-slate-400 dark:text-slate-500">
                          时间、周数自动换算，保留现有课程
                        </Text>
                      </View>
                    </Pressable>
                    <Pressable
                      onPress={applyNew}
                      className="flex-row items-center rounded-2xl border border-white/20 bg-white/15 px-3.5 py-2.5 dark:border-white/10 dark:bg-white/[0.05]"
                    >
                      <Ionicons
                        name="duplicate-outline"
                        size={16}
                        color="#34D399"
                      />
                      <View className="ml-2.5 flex-1">
                        <Text className="text-[12px] font-semibold text-slate-700 dark:text-slate-200">
                          新建课表
                        </Text>
                        <Text className="mt-0.5 text-[10px] text-slate-400 dark:text-slate-500">
                          存为独立课表并切换，当前课表不变
                        </Text>
                      </View>
                    </Pressable>
                    <Pressable
                      onPress={applyReplace}
                      className="flex-row items-center rounded-2xl border border-white/20 bg-white/15 px-3.5 py-2.5 dark:border-white/10 dark:bg-white/[0.05]"
                    >
                      <Ionicons
                        name="refresh-outline"
                        size={16}
                        color="#FB7185"
                      />
                      <View className="ml-2.5 flex-1">
                        <Text className="text-[12px] font-semibold text-slate-700 dark:text-slate-200">
                          覆盖当前课表
                        </Text>
                        <Text className="mt-0.5 text-[10px] text-slate-400 dark:text-slate-500">
                          清空现有课程后导入
                        </Text>
                      </View>
                    </Pressable>
                    <Pressable
                      onPress={() => setPick("none")}
                      className="items-center rounded-2xl py-1.5"
                    >
                      <Text className="text-[11px] text-slate-400 dark:text-slate-500">
                        取消
                      </Text>
                    </Pressable>
                  </View>
                ) : pick === "mergeConfirm" && mergePreview ? (
                  /* 融合前冲突确认 */
                  <View className="flex-1 gap-y-2.5">
                    <View className="rounded-2xl border border-amber-400/45 bg-amber-400/15 px-3.5 py-2.5">
                      <Text className="text-[11.5px] font-semibold text-amber-600 dark:text-amber-300">
                        ⚠ 检测到 {mergePreview.conflicts.length} 处时间冲突
                      </Text>
                      {mergePreview.conflicts.slice(0, 4).map((c) => (
                        <Text
                          key={c}
                          numberOfLines={1}
                          className="mt-1 text-[10.5px] text-amber-700/90 dark:text-amber-200/90"
                        >
                          · {c}
                        </Text>
                      ))}
                      {mergePreview.conflicts.length > 4 ? (
                        <Text className="mt-1 text-[10px] text-amber-700/70 dark:text-amber-200/70">
                          等共 {mergePreview.conflicts.length} 处…
                        </Text>
                      ) : null}
                      <Text className="mt-1.5 text-[10.5px] leading-4 text-amber-700/85 dark:text-amber-200/85">
                        仍要融合吗？冲突课程会在日/周视图中用琥珀色标注
                      </Text>
                    </View>
                    <View className="flex-row gap-x-2.5">
                      <Pressable
                        onPress={() => setPick("choose")}
                        className="flex-1 items-center rounded-2xl border border-white/20 bg-white/15 py-2.5 dark:border-white/10 dark:bg-white/[0.05]"
                      >
                        <Text className="text-[12px] font-semibold text-slate-600 dark:text-slate-300">
                          返回
                        </Text>
                      </Pressable>
                      <Pressable
                        onPress={doMerge}
                        className="flex-1 items-center rounded-2xl bg-amber-500/85 py-2.5"
                      >
                        <Text className="text-[12px] font-bold text-white">
                          确认融合
                        </Text>
                      </Pressable>
                    </View>
                  </View>
                ) : (
                  <>
                    <Pressable
                      onPress={clear}
                      className="flex-1 items-center rounded-2xl border border-white/20 bg-white/15 py-2.5 dark:border-white/10 dark:bg-white/[0.05]"
                    >
                      <Text className="text-[12px] font-semibold text-slate-600 dark:text-slate-300">
                        放弃
                      </Text>
                    </Pressable>
                    <Pressable
                      onPress={() => {
                        if (hasCourses) {
                          setPick("choose");
                          return;
                        }
                        importSchedule(withWeeks(result.schedule));
                        ack(
                          "已导入当前课表，可在首页查看；开学/放假日期可在「设置」中调整",
                        );
                      }}
                      className="flex-1 items-center rounded-2xl bg-sky-500/85 py-2.5"
                    >
                      <Text className="text-[12px] font-bold text-white">
                        导入课表
                      </Text>
                    </Pressable>
                  </>
                )
              ) : result?.type === "periods" ? (
                <>
                  <Pressable
                    onPress={clear}
                    className="flex-1 items-center rounded-2xl border border-white/20 bg-white/15 py-2.5 dark:border-white/10 dark:bg-white/[0.05]"
                  >
                    <Text className="text-[12px] font-semibold text-slate-600 dark:text-slate-300">
                      放弃
                    </Text>
                  </Pressable>
                  <Pressable
                    onPress={() => {
                      setPeriods(result.periods);
                      ack("作息表已应用到当前课表");
                    }}
                    className="flex-1 items-center rounded-2xl bg-violet-500/85 py-2.5"
                  >
                    <Text className="text-[12px] font-bold text-white">
                      应用作息表
                    </Text>
                  </Pressable>
                </>
              ) : result?.type === "grades" ? (
                <>
                  <Pressable
                    onPress={clear}
                    className="flex-1 items-center rounded-2xl border border-white/20 bg-white/15 py-2.5 dark:border-white/10 dark:bg-white/[0.05]"
                  >
                    <Text className="text-[12px] font-semibold text-slate-600 dark:text-slate-300">
                      放弃
                    </Text>
                  </Pressable>
                  <Pressable
                    onPress={applyGrades}
                    className="flex-1 items-center rounded-2xl bg-sky-500/85 py-2.5"
                  >
                    <Text className="text-[12px] font-bold text-white">
                      导入 {result.grades.length} 条成绩
                    </Text>
                  </Pressable>
                </>
              ) : result?.type === "count" ? (
                <>
                  <Pressable
                    onPress={clear}
                    className="flex-1 items-center rounded-2xl border border-white/20 bg-white/15 py-2.5 dark:border-white/10 dark:bg-white/[0.05]"
                  >
                    <Text className="text-[12px] font-semibold text-slate-600 dark:text-slate-300">
                      关闭
                    </Text>
                  </Pressable>
                  <Pressable
                    onPress={() => goto("/grades")}
                    className="flex-1 items-center rounded-2xl bg-sky-500/85 py-2.5"
                  >
                    <Text className="text-[12px] font-bold text-white">
                      去「成绩」查看
                    </Text>
                  </Pressable>
                </>
              ) : status === "error" ? (
                <>
                  <Pressable
                    onPress={clear}
                    className="flex-1 items-center rounded-2xl border border-white/20 bg-white/15 py-2.5 dark:border-white/10 dark:bg-white/[0.05]"
                  >
                    <Text className="text-[12px] font-semibold text-slate-600 dark:text-slate-300">
                      关闭
                    </Text>
                  </Pressable>
                  <Pressable
                    onPress={() => goto("/import")}
                    className="flex-1 items-center rounded-2xl bg-sky-500/85 py-2.5"
                  >
                    <Text className="text-[12px] font-bold text-white">
                      重新识别
                    </Text>
                  </Pressable>
                </>
              ) : (
                /* 结果已确认应用 */
                <Pressable
                  onPress={clear}
                  className="flex-1 items-center rounded-2xl bg-sky-500/85 py-2.5"
                >
                  <Text className="text-[12px] font-bold text-white">完成</Text>
                </Pressable>
              )}
            </View>

            {status === "analyzing" ? (
              <Text className="mt-2.5 text-center text-[10px] text-slate-400 dark:text-slate-500">
                可收起为悬浮球，拖动调整位置，分析在后台继续
              </Text>
            ) : null}
          </View>
        </GlassContainer>
      </Animated.View>
    </View>
  );
}

/* -------------------------------------------------------------------------- */
/*  进度球形态：吸附边框 + 拖动 + 点按还原                                      */
/* -------------------------------------------------------------------------- */

function ProgressBall() {
  const { width, height } = useWindowDimensions();
  const status = useImportTask((s) => s.status);
  const progress = useImportTask((s) => s.progress);
  const setExpanded = useImportTask((s) => s.setExpanded);

  const meta = STATUS_META[status === "idle" ? "analyzing" : status];

  const edgeX = width - BALL_SIZE - EDGE_PAD;
  const edgeY = Math.round(height * 0.32);

  // 拖拽位置（手势写入）：初始吸附右侧边框
  const x = useSharedValue(edgeX);
  const y = useSharedValue(edgeY);
  const scale = useSharedValue(1);
  // 入场偏移（仅效果内写入）：收起瞬间球在屏幕中心，弹簧归零即「弹到边框」
  const entryX = useSharedValue((width - BALL_SIZE) / 2 - edgeX);
  const entryY = useSharedValue((height - BALL_SIZE) / 2 - edgeY);

  React.useEffect(() => {
    entryX.value = withSpring(0, PRESS_SPRING);
    entryY.value = withSpring(0, PRESS_SPRING);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 进度环平滑推进（仅效果内写入，UI 线程 withTiming 插值）
  const ring = useSharedValue(progress);
  React.useEffect(() => {
    ring.value = withTiming(progress, { duration: 450 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [progress]);

  // 注意：以下手势回调运行在 UI 线程（worklet），
  // 只能用 Math 等全局 + 捕获的原始值，严禁调用组件作用域普通 JS 函数
  // （Reanimated 4 会同步跨线程调用失败直接闪退）
  const pan = Gesture.Pan()
    // 需要明显拖动才激活：否则轻微手指抖动会抢走点击（点球无反应）
    .activeOffsetX([-12, 12])
    .activeOffsetY([-12, 12])
    .onBegin(() => {
      scale.value = withSpring(1.12, PRESS_SPRING);
    })
    .onUpdate((e) => {
      x.value = Math.min(
        Math.max(e.absoluteX - BALL_SIZE / 2, EDGE_PAD),
        width - BALL_SIZE - EDGE_PAD,
      );
      y.value = Math.min(
        Math.max(e.absoluteY - BALL_SIZE / 2, 64),
        height - BALL_SIZE - 120,
      );
    })
    .onEnd(() => {
      // 松手后吸附最近的竖向边框
      x.value = withSpring(
        x.value + BALL_SIZE / 2 < width / 2
          ? EDGE_PAD
          : width - BALL_SIZE - EDGE_PAD,
        PRESS_SPRING,
      );
    })
    .onFinalize(() => {
      scale.value = withSpring(1, PRESS_SPRING);
    });

  const tap = Gesture.Tap()
    .maxDuration(500)
    .onEnd(() => {
      // 还原为进度弹窗，实时显示当前进度
      runOnJS(setExpanded)(true);
    });

  const gesture = Gesture.Race(pan, tap);

  const ballStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: x.value + entryX.value },
      { translateY: y.value + entryY.value },
      { scale: scale.value },
    ],
  }));

  const ringProps = useAnimatedProps(() => ({
    strokeDashoffset: RING_C * (1 - ring.value / 100),
  }));

  return (
    <GestureDetector gesture={gesture}>
      {/* 入场动画与拖动位移必须分层：布局动画(FadeIn)会写 transform，
          与 ballStyle 同节点冲突（Reanimated 告警 + 原生端报错） */}
      <Animated.View
        entering={FadeIn.springify().damping(15).stiffness(150)}
        style={{
          position: "absolute",
          width: BALL_SIZE,
          height: BALL_SIZE,
        }}
      >
        <Animated.View style={ballStyle}>
          {/* 玻璃球体：与全站 GlassContainer 同质感（雾面 + 发丝边框） */}
          <GlassContainer
            radius={BALL_SIZE / 2}
            borderOpacity={0.22}
            style={{ width: BALL_SIZE, height: BALL_SIZE }}
          >
            {/* 内容层铺满整个球体（含 1px 边框），圆心即球体正中心 */}
            <View
              style={{
                position: "absolute",
                left: -1,
                top: -1,
                width: BALL_SIZE,
                height: BALL_SIZE,
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              {/* 渐变进度环：铺满球体，绕球心旋转起始角（12 点方向起） */}
              <Svg
                width={BALL_SIZE}
                height={BALL_SIZE}
                style={{
                  position: "absolute",
                  left: 0,
                  top: 0,
                }}
              >
                <Defs>
                  <LinearGradient id="ballRingGrad" x1="0" y1="0" x2="1" y2="1">
                    <Stop offset="0" stopColor={meta.tint} stopOpacity={0.55} />
                    <Stop
                      offset="1"
                      stopColor={meta.tint2}
                      stopOpacity={0.55}
                    />
                  </LinearGradient>
                </Defs>
                <Circle
                  cx={BALL_SIZE / 2}
                  cy={BALL_SIZE / 2}
                  r={RING_R}
                  stroke="rgba(148,163,184,0.2)"
                  strokeWidth={3}
                  fill="none"
                />
                <AnimatedCircle
                  cx={BALL_SIZE / 2}
                  cy={BALL_SIZE / 2}
                  r={RING_R}
                  rotation={-90}
                  originX={BALL_SIZE / 2}
                  originY={BALL_SIZE / 2}
                  stroke="url(#ballRingGrad)"
                  strokeWidth={3}
                  strokeLinecap="round"
                  fill="none"
                  strokeDasharray={`${RING_C} ${RING_C}`}
                  animatedProps={ringProps}
                />
              </Svg>

              {status === "analyzing" ? (
                <Text style={{ color: meta.tint, opacity: 0.72 }}>
                  <Text className="text-[13px] font-bold">
                    {Math.round(progress)}
                  </Text>
                  <Text className="text-[8px] font-medium">%</Text>
                </Text>
              ) : (
                <Ionicons
                  name={status === "done" ? "checkmark-circle" : "alert-circle"}
                  size={20}
                  color={meta.tint}
                  style={{ opacity: 0.72 }}
                />
              )}
            </View>
          </GlassContainer>
        </Animated.View>
      </Animated.View>
    </GestureDetector>
  );
}
