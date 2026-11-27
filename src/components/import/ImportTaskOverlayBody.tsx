import Ionicons from "@expo/vector-icons/Ionicons";
import { router, usePathname } from "expo-router";
import React from "react";
import {
  Alert,
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
import { ImportRowEditor } from "@/components/ImportRowEditor";
import { useImportTask, type TaskStatus } from "@/store/useImportTask";
import { extendPeriodsToCount, useStore } from "@/store/useStore";
import type { MergeReport, Schedule } from "@/types";
import {
  formatCourseGpa,
  gradeDuplicateKey,
  semesterLabel,
} from "@/utils/grades";

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
 * - 弹窗形态：进度条 + 阶段文案，可「收起」为进度球，也可随时取消
 * - 进度球形态：吸附屏幕边框、可拖动、点按还原弹窗
 * - 挂载于根布局，退出导入页后任务继续后台分析
 */
export function ImportTaskOverlayBody() {
  const status = useImportTask((s) => s.status);
  const expanded = useImportTask((s) => s.expanded);
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
  const [editing, setEditing] = React.useState<number | null>(null);
  const retry = useImportTask((s) => s.retry);
  const setExpanded = useImportTask((s) => s.setExpanded);
  const clear = useImportTask((s) => s.clear);
  const cancel = useImportTask((s) => s.cancel);
  const ack = useImportTask((s) => s.ack);

  const importSchedule = useStore((s) => s.importSchedule);
  const setPeriods = useStore((s) => s.setPeriods);
  const addScheduleWithData = useStore((s) => s.addScheduleWithData);
  const mergeIncoming = useStore((s) => s.mergeIncoming);
  const upsertGrades = useStore((s) => s.upsertGrades);
  const existingGrades = useStore((s) => s.grades);
  const gradeYears = useStore((s) => s.gradeYears);
  const gradeTypes = useStore((s) => s.gradeTypes);
  const activeGradeYearId = useStore((s) => s.activeGradeYearId);
  const activeSchedule = useStore(
    (s) =>
      s.schedules.find((x) => x.id === s.activeScheduleId) ?? s.schedules[0],
  );
  const currentCourseCount = activeSchedule?.courses.length ?? 0;
  const hasCourses = currentCourseCount > 0;
  const pathname = usePathname();

  const [pick, setPick] = React.useState<
    "none" | "choose" | "mergeConfirm" | "replaceConfirm" | "gradeDupConfirm"
  >("none");
  const [mergePreview, setMergePreview] = React.useState<MergeReport | null>(
    null,
  );

  /* ---------------- 课表适用周数：默认沿用识别出的每门课周次 ---------------- */
  const scheduleResult =
    result?.type === "schedule" ? result.schedule : undefined;
  const scheduleKey = scheduleResult?.id ?? "none";
  const [weekSelState, setWeekSelState] = React.useState<{
    key: string;
    value: number[] | null;
  }>({ key: scheduleKey, value: null });
  const weekSel = weekSelState.key === scheduleKey ? weekSelState.value : null;
  const setWeekSel: React.Dispatch<React.SetStateAction<number[] | null>> = (
    next,
  ) =>
    setWeekSelState((prev) => {
      const current = prev.key === scheduleKey ? prev.value : null;
      const value = typeof next === "function" ? next(current) : next;
      return { key: scheduleKey, value };
    });
  const totalWeeks = Math.max(
    1,
    activeSchedule?.totalWeeks ?? scheduleResult?.totalWeeks ?? 18,
  );
  const allWeeks = React.useMemo(
    () => Array.from({ length: totalWeeks }, (_, i) => i + 1),
    [totalWeeks],
  );
  const applyWeeks = weekSel?.length ? weekSel : allWeeks;
  const withWeeks = (s: Schedule): Schedule =>
    weekSel?.length
      ? { ...s, courses: s.courses.map((c) => ({ ...c, weeks: weekSel })) }
      : s;

  /**
   * 修复反选 Bug：未手动覆盖（null）时点选某周 w，直接开始选中 [w]；
   * 若取消最后一周，自动回到「沿用识别周次（null）」。
   */
  const toggleWeek = (w: number) =>
    setWeekSel((prev) => {
      if (prev === null) return [w];
      const next = prev.includes(w)
        ? prev.filter((x) => x !== w)
        : [...prev, w].sort((a, b) => a - b);
      return next.length ? next : null;
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
    ack(
      `已覆盖当前课表，导入 ${result.schedule.courses.length} 门课程（已保留当前作息设置）`,
    );
  };

  /* ---------------- 成绩重复项检测 ---------------- */
  const gradeTargetYearId =
    result?.type === "grades"
      ? (result.yearId && gradeYears.some((y) => y.id === result.yearId)
          ? result.yearId
          : activeGradeYearId)
      : activeGradeYearId;

  const existingGradeKeys = React.useMemo(
    () =>
      new Set(
        existingGrades.map((g) =>
          gradeDuplicateKey(g.yearId, g.semester, g.name),
        ),
      ),
    [existingGrades],
  );

  const duplicateGradeCount = React.useMemo(() => {
    if (result?.type !== "grades") return 0;
    return result.grades.filter((g) =>
      existingGradeKeys.has(
        gradeDuplicateKey(gradeTargetYearId, g.semester, g.name),
      ),
    ).length;
  }, [result, existingGradeKeys, gradeTargetYearId]);

  const commitGrades = (
    mode: "skipDuplicates" | "overwriteDuplicates" | "append",
  ) => {
    if (!result || result.type !== "grades" || !result.grades.length) return;
    const rows = result.grades.map((g) => ({ ...g, yearId: gradeTargetYearId }));
    const summary = upsertGrades(rows, mode);
    const parts = [
      summary.added ? `新增 ${summary.added} 条` : null,
      summary.updated ? `更新 ${summary.updated} 条` : null,
      summary.skipped ? `跳过重复 ${summary.skipped} 条` : null,
    ].filter(Boolean);
    const yearName =
      gradeYears.find((y) => y.id === gradeTargetYearId)?.name ?? "当前学年";
    ack(`成绩导入完成（${yearName}）：${parts.join("，") || "无变更"}`);
  };

  const handleImportGradesPress = () => {
    if (!result || result.type !== "grades" || !result.grades.length) return;
    if (duplicateGradeCount > 0) {
      setPick("gradeDupConfirm");
      return;
    }
    commitGrades("append");
  };

  const handleApplyPeriods = () => {
    if (!result || result.type !== "periods" || !result.periods.length) return;
    const state = useStore.getState();
    if (result.scheduleId && state.activeScheduleId !== result.scheduleId) {
      Alert.alert("无法应用作息", "课表已切换，请切回导入时的课表再应用作息");
      return;
    }
    const targetSched =
      state.schedules.find((x) => x.id === state.activeScheduleId) ??
      state.schedules[0];
    const maxUsed = Math.max(
      0,
      ...(targetSched?.courses.map((c) => c.endPeriod) ?? []),
    );
    if (maxUsed > result.periods.length) {
      Alert.alert(
        "当前课表包含更高节次的课程",
        `识别出 ${result.periods.length} 节作息，但当前课表有排到第 ${maxUsed} 节的课程。是否按末节时长自动顺延补齐至 ${maxUsed} 节后应用？`,
        [
          { text: "取消", style: "cancel" },
          {
            text: `补齐至 ${maxUsed} 节并应用`,
            onPress: () => {
              try {
                const extended = extendPeriodsToCount(result.periods, maxUsed);
                setPeriods(extended);
                ack(
                  `作息表已应用（共 ${extended.length} 节，其中末 ${extended.length - result.periods.length} 节已自动顺延补齐）`,
                );
              } catch (err) {
                Alert.alert(
                  "无法应用作息",
                  err instanceof Error ? err.message : "作息时间无效",
                );
              }
            },
          },
        ],
      );
      return;
    }
    try {
      setPeriods(result.periods);
      ack("作息表已应用，可在设置 → 课表与学期 → 作息时间表查看和编辑");
    } catch (error) {
      Alert.alert(
        "无法应用作息",
        error instanceof Error ? error.message : "作息时间无效",
      );
    }
  };

  const typeName = (id: string) =>
    gradeTypes.find((t) => t.id === id)?.name ?? "未分类";

  const meta = STATUS_META[status === "idle" ? "analyzing" : status];
  const titleLabel = label || "AI 智能导入";

  const goto = (path: "/import" | "/grades") => {
    clear();
    if (pathname !== path) router.push(path);
  };

  // 给课表行编辑器提供安全的作息与总周数上下文
  const editorSchedule = React.useMemo(() => {
    if (result?.type !== "schedule") return undefined;
    const base = activeSchedule ?? result.schedule;
    const maxCoursePeriod = Math.max(
      base.periods.length,
      ...result.schedule.courses.map((c) => c.endPeriod),
    );
    return {
      ...base,
      totalWeeks,
      periods: extendPeriodsToCount(base.periods, maxCoursePeriod),
    };
  }, [result, activeSchedule, totalWeeks]);

  return (
    <View className="flex-1 items-center justify-center px-6">
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
        style={{ width: "100%", maxWidth: 390 }}
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
                  accessibilityLabel="收起为悬浮球"
                  onPress={() => setExpanded(false)}
                  className="h-8 w-8 items-center justify-center rounded-full bg-white/20 dark:bg-white/[0.07]"
                >
                  <Ionicons name="remove" size={16} color="#94A3B8" />
                </Pressable>
              ) : (
                <Pressable
                  accessibilityLabel="关闭弹窗"
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

            {/* 失败页重试条 */}
            {retry ? (
              <View className="mt-2.5 gap-2 rounded-2xl bg-amber-500/10 px-3.5 py-2.5">
                <Text className="text-[11.5px] text-amber-800 dark:text-amber-200">
                  原批次第 {retry.pages.join("、")} 张未识别成功。
                  {result ? "已识别的结果会保留。" : ""}
                </Text>
                <Pressable
                  accessibilityRole="button"
                  onPress={() => void retry.run()}
                  className="self-start rounded-xl bg-sky-600 px-3 py-2"
                >
                  <Text className="text-xs font-bold text-white">
                    只重试失败图片
                  </Text>
                </Pressable>
              </View>
            ) : null}

            {/* 课表预览 */}
            {result?.type === "schedule" ? (
              <View className="mt-2.5 rounded-2xl bg-white/20 px-3.5 py-2.5 dark:bg-white/[0.05]">
                <View className="flex-row items-center justify-between">
                  <Text className="text-[11px] font-semibold text-slate-700 dark:text-slate-200">
                    课表适用周数
                  </Text>
                  <View className="flex-row items-center gap-2">
                    <Pressable
                      hitSlop={4}
                      onPress={() => setWeekSel(allWeeks)}
                    >
                      <Text className="text-[10px] font-semibold text-slate-500 dark:text-slate-400">
                        全选
                      </Text>
                    </Pressable>
                    <Pressable
                      hitSlop={4}
                      onPress={() =>
                        setWeekSel(allWeeks.filter((w) => w % 2 === 1))
                      }
                    >
                      <Text className="text-[10px] font-semibold text-slate-500 dark:text-slate-400">
                        单周
                      </Text>
                    </Pressable>
                    <Pressable
                      hitSlop={4}
                      onPress={() =>
                        setWeekSel(allWeeks.filter((w) => w % 2 === 0))
                      }
                    >
                      <Text className="text-[10px] font-semibold text-slate-500 dark:text-slate-400">
                        双周
                      </Text>
                    </Pressable>
                    <Pressable hitSlop={4} onPress={() => setWeekSel(null)}>
                      <Text className="text-[10px] font-semibold text-sky-500 dark:text-sky-300">
                        沿用识别
                      </Text>
                    </Pressable>
                  </View>
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
                    : `已选 ${applyWeeks.length} 周（第 ${weeksLabel(applyWeeks)} 周），将统一覆盖全部课程`}
                </Text>

                <ScrollView className="mt-2 max-h-[240px]" nestedScrollEnabled>
                  {result.schedule.courses.map((c, i) => (
                    <View
                      key={`${c.id || c.name}-${i}`}
                      className="min-h-10 flex-row items-center gap-2 border-b border-white/10 py-1 dark:border-white/[0.05]"
                    >
                      <Pressable
                        accessibilityRole="button"
                        accessibilityLabel={`修正课程 ${c.name}`}
                        onPress={() => setEditing(i)}
                        className="flex-1 flex-row items-center gap-2 py-0.5"
                      >
                        <Text className="flex-1 text-[11px] leading-4 text-slate-600 dark:text-slate-300">
                          {c.name}
                          {c.teacher ? `（${c.teacher}）` : ""} · 周{c.weekday}{" "}
                          第{c.startPeriod}–{c.endPeriod}节 · 第
                          {weeksLabel(c.weeks)}周
                          {result.sources?.[i]?.pages.length
                            ? ` · 图 ${result.sources[i].pages.join("、")}`
                            : ""}
                        </Text>
                        <Text className="text-[11px] font-semibold text-sky-600 dark:text-sky-300">
                          修正
                        </Text>
                      </Pressable>
                      <Pressable
                        accessibilityRole="button"
                        accessibilityLabel={`移除识别课程 ${c.name}`}
                        hitSlop={6}
                        onPress={() =>
                          useImportTask.getState().removeCourse(result, i)
                        }
                        className="h-7 w-7 items-center justify-center rounded-full bg-rose-500/10"
                      >
                        <Ionicons
                          name="trash-outline"
                          size={13}
                          color="#F43F5E"
                        />
                      </Pressable>
                    </View>
                  ))}
                  {!result.schedule.courses.length ? (
                    <Text className="py-3 text-center text-[11px] text-slate-400">
                      已移除全部识别课程，可点击下方放弃并重新识别
                    </Text>
                  ) : null}
                </ScrollView>
                <Text className="mt-1 text-[10px] text-slate-400">
                  共 {result.schedule.courses.length} 条上课记录
                </Text>
              </View>
            ) : null}

            {/* 作息表预览（支持逐行修正与删除误识别行） */}
            {result?.type === "periods" ? (
              <View className="mt-2.5 rounded-2xl bg-white/20 px-3.5 py-2.5 dark:bg-white/[0.05]">
                <ScrollView className="max-h-[220px]" nestedScrollEnabled>
                  {result.periods.map((p, i) => (
                    <View
                      key={`${p.index}-${p.startTime}-${i}`}
                      className="min-h-9 flex-row items-center gap-2 border-b border-white/10 py-1 dark:border-white/[0.05]"
                    >
                      <Pressable
                        accessibilityRole="button"
                        accessibilityLabel={`修正第 ${p.index} 节`}
                        onPress={() => setEditing(i)}
                        className="flex-1 flex-row items-center justify-between py-0.5"
                      >
                        <Text className="text-[11px] text-slate-600 dark:text-slate-300">
                          {p.index}. {p.label} · {p.startTime}–{p.endTime}
                        </Text>
                        <Text className="text-[11px] font-semibold text-sky-600 dark:text-sky-300">
                          修正
                        </Text>
                      </Pressable>
                      <Pressable
                        accessibilityRole="button"
                        accessibilityLabel={`移除第 ${p.index} 节`}
                        hitSlop={6}
                        onPress={() =>
                          useImportTask.getState().removePeriod(result, i)
                        }
                        className="h-7 w-7 items-center justify-center rounded-full bg-rose-500/10"
                      >
                        <Ionicons
                          name="trash-outline"
                          size={13}
                          color="#F43F5E"
                        />
                      </Pressable>
                    </View>
                  ))}
                  {!result.periods.length ? (
                    <Text className="py-3 text-center text-[11px] text-slate-400">
                      已移除全部节次，请放弃后重新识别
                    </Text>
                  ) : null}
                </ScrollView>
                <Text className="mt-1 text-[10px] text-slate-400">
                  共 {result.periods.length} 节 · 点击行可修正时间，右侧可删多余行
                </Text>
              </View>
            ) : null}

            {/* 成绩预览（支持切换归属学年、逐行改学期/类型、单条删除与重复提醒） */}
            {result?.type === "grades" ? (
              <View className="mt-2.5 rounded-2xl bg-white/20 px-3.5 py-2.5 dark:bg-white/[0.05]">
                {/* 归属学年快速切换 */}
                <View className="mb-2 flex-row items-center">
                  <Text className="mr-2 text-[10px] font-semibold text-slate-500 dark:text-slate-400">
                    归入学年
                  </Text>
                  <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    contentContainerStyle={{ gap: 6 }}
                    className="flex-1"
                  >
                    {gradeYears.map((y) => {
                      const on = y.id === gradeTargetYearId;
                      return (
                        <Pressable
                          key={y.id}
                          onPress={() =>
                            useImportTask
                              .getState()
                              .setGradeTargetYear(result, y.id)
                          }
                          className={`rounded-full px-2.5 py-1 ${
                            on
                              ? "bg-sky-500/85"
                              : "bg-white/25 dark:bg-white/[0.08]"
                          }`}
                        >
                          <Text
                            className={`text-[10px] font-semibold ${
                              on
                                ? "text-white"
                                : "text-slate-600 dark:text-slate-300"
                            }`}
                          >
                            {y.name}
                          </Text>
                        </Pressable>
                      );
                    })}
                  </ScrollView>
                </View>

                {duplicateGradeCount > 0 ? (
                  <View className="mb-2 rounded-xl bg-amber-500/15 px-2.5 py-1.5">
                    <Text className="text-[10px] font-semibold text-amber-700 dark:text-amber-200">
                      检测到 {duplicateGradeCount} 条与该学年已有成绩同名，点导入时可选择跳过或覆盖
                    </Text>
                  </View>
                ) : null}

                <View className="flex-row items-center pb-1">
                  <Text className="flex-1 text-[10px] font-semibold text-slate-400 dark:text-slate-500">
                    课程
                  </Text>
                  <Text className="w-10 text-right text-[10px] font-semibold text-slate-400 dark:text-slate-500">
                    学分
                  </Text>
                  <Text className="w-11 text-right text-[10px] font-semibold text-slate-400 dark:text-slate-500">
                    分数
                  </Text>
                  <Text className="w-11 text-right text-[10px] font-semibold text-slate-400 dark:text-slate-500">
                    绩点
                  </Text>
                  <View className="w-14" />
                </View>

                <ScrollView className="max-h-[220px]" nestedScrollEnabled>
                  {result.grades.map((g, i) => {
                    const isDup = existingGradeKeys.has(
                      gradeDuplicateKey(gradeTargetYearId, g.semester, g.name),
                    );
                    return (
                      <View
                        key={`${g.name}-${i}`}
                        className="min-h-10 flex-row items-center border-b border-white/10 py-1 dark:border-white/[0.05]"
                      >
                        <Pressable
                          accessibilityRole="button"
                          accessibilityLabel={`修正成绩 ${g.name}`}
                          onPress={() => setEditing(i)}
                          className="flex-1 flex-row items-center"
                        >
                          <View className="flex-1 pr-1">
                            <Text
                              numberOfLines={1}
                              className="text-[10.5px] font-semibold text-slate-700 dark:text-slate-200"
                            >
                              {g.name}
                              {isDup ? " [已存在]" : ""}
                            </Text>
                            <Text
                              numberOfLines={1}
                              className="text-[9px] text-slate-400 dark:text-slate-500"
                            >
                              {semesterLabel(g.semester)} · {typeName(g.type)}
                              {result.sources?.[i]?.pages.length
                                ? ` · 图 ${result.sources[i].pages.join("、")}`
                                : ""}
                            </Text>
                          </View>
                          <Text className="w-10 text-right text-[10.5px] text-slate-500 dark:text-slate-400">
                            {g.credit != null ? g.credit : "待补"}
                          </Text>
                          <Text className="w-11 text-right text-[10.5px] text-slate-500 dark:text-slate-400">
                            {g.score || "--"}
                          </Text>
                          <Text className="w-11 text-right text-[10.5px] font-semibold text-sky-500 dark:text-sky-300">
                            {formatCourseGpa(g.gpa)}
                          </Text>
                          <Text className="ml-1.5 text-[10.5px] font-semibold text-sky-600 dark:text-sky-300">
                            改
                          </Text>
                        </Pressable>
                        <Pressable
                          accessibilityRole="button"
                          accessibilityLabel={`移除识别成绩 ${g.name}`}
                          hitSlop={6}
                          onPress={() =>
                            useImportTask.getState().removeGrade(result, i)
                          }
                          className="ml-1.5 h-6 w-6 items-center justify-center rounded-full bg-rose-500/10"
                        >
                          <Ionicons
                            name="trash-outline"
                            size={12}
                            color="#F43F5E"
                          />
                        </Pressable>
                      </View>
                    );
                  })}
                  {!result.grades.length ? (
                    <Text className="py-3 text-center text-[11px] text-slate-400">
                      已移除全部识别成绩，可点击下方放弃
                    </Text>
                  ) : null}
                </ScrollView>
                <Text className="mt-1 text-[10px] text-slate-400">
                  共 {result.grades.length} 条成绩 · 点行可改分数、学期与类型
                </Text>
              </View>
            ) : null}

            {/* 底部操作 */}
            <View className="mt-4 flex-row gap-x-2.5">
              {status === "analyzing" ? (
                <>
                  <Pressable
                    onPress={cancel}
                    className="items-center rounded-2xl border border-rose-400/35 bg-rose-500/10 px-4 py-2.5"
                  >
                    <Text className="text-[12px] font-semibold text-rose-600 dark:text-rose-300">
                      取消识别
                    </Text>
                  </Pressable>
                  <Pressable
                    onPress={() => setExpanded(false)}
                    className="flex-1 items-center rounded-2xl border border-white/20 bg-white/15 py-2.5 dark:border-white/10 dark:bg-white/[0.05]"
                  >
                    <Text className="text-[12px] font-semibold text-slate-600 dark:text-slate-300">
                      收起，后台分析
                    </Text>
                  </Pressable>
                </>
              ) : result?.type === "schedule" ? (
                pick === "choose" ? (
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
                          时间、周数自动对齐，保留现有课程与作息
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
                      onPress={() => setPick("replaceConfirm")}
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
                          清空现有课程后导入（保留自定义作息）
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
                ) : pick === "replaceConfirm" ? (
                  <View className="flex-1 gap-y-2.5">
                    <View className="rounded-2xl border border-rose-500/40 bg-rose-500/12 px-3.5 py-2.5">
                      <Text className="text-[11.5px] font-bold text-rose-600 dark:text-rose-300">
                        确认覆盖当前课表？
                      </Text>
                      <Text className="mt-1 text-[10.5px] leading-4 text-rose-700/90 dark:text-rose-200/90">
                        将清空当前课表现有的 {currentCourseCount}{" "}
                        条课程记录（含手动调课记录），并用本次识别的{" "}
                        {result.schedule.courses.length}{" "}
                        条记录替换。当前作息时间表会保留。
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
                        onPress={applyReplace}
                        className="flex-1 items-center rounded-2xl bg-rose-600 py-2.5"
                      >
                        <Text className="text-[12px] font-bold text-white">
                          确认覆盖
                        </Text>
                      </Pressable>
                    </View>
                  </View>
                ) : pick === "mergeConfirm" && mergePreview ? (
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
                      disabled={!result.schedule.courses.length}
                      onPress={() => {
                        if (!result.schedule.courses.length) return;
                        if (hasCourses) {
                          setPick("choose");
                          return;
                        }
                        importSchedule(withWeeks(result.schedule));
                        ack(
                          "已导入当前课表（保留现有作息），可在首页查看；开学/放假日期可在「设置」中调整",
                        );
                      }}
                      className={`flex-1 items-center rounded-2xl bg-sky-500/85 py-2.5 ${!result.schedule.courses.length ? "opacity-40" : ""}`}
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
                    disabled={!result.periods.length}
                    onPress={handleApplyPeriods}
                    className={`flex-1 items-center rounded-2xl bg-violet-500/85 py-2.5 ${!result.periods.length ? "opacity-40" : ""}`}
                  >
                    <Text className="text-[12px] font-bold text-white">
                      应用作息表
                    </Text>
                  </Pressable>
                </>
              ) : result?.type === "grades" ? (
                pick === "gradeDupConfirm" ? (
                  <View className="flex-1 gap-y-2">
                    <Text className="text-[11px] font-semibold text-amber-600 dark:text-amber-300">
                      目标学年已有 {duplicateGradeCount} 门同名同期的成绩，请选择处理方式：
                    </Text>
                    <Pressable
                      onPress={() => commitGrades("skipDuplicates")}
                      className="items-center rounded-2xl bg-sky-500/85 py-2.5"
                    >
                      <Text className="text-[12px] font-bold text-white">
                        跳过重复（仅导入新增）
                      </Text>
                    </Pressable>
                    <Pressable
                      onPress={() => commitGrades("overwriteDuplicates")}
                      className="items-center rounded-2xl border border-amber-400/45 bg-amber-500/15 py-2.5"
                    >
                      <Text className="text-[12px] font-semibold text-amber-700 dark:text-amber-200">
                        覆盖更新已有记录
                      </Text>
                    </Pressable>
                    <View className="flex-row gap-x-2">
                      <Pressable
                        onPress={() => commitGrades("append")}
                        className="flex-1 items-center rounded-2xl border border-white/20 bg-white/15 py-2 dark:border-white/10 dark:bg-white/[0.05]"
                      >
                        <Text className="text-[11px] font-semibold text-slate-600 dark:text-slate-300">
                          全部保留（含重修）
                        </Text>
                      </Pressable>
                      <Pressable
                        onPress={() => setPick("none")}
                        className="items-center rounded-2xl px-4 py-2"
                      >
                        <Text className="text-[11px] text-slate-400">返回</Text>
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
                      disabled={!result.grades.length}
                      onPress={handleImportGradesPress}
                      className={`flex-1 items-center rounded-2xl bg-sky-500/85 py-2.5 ${!result.grades.length ? "opacity-40" : ""}`}
                    >
                      <Text className="text-[12px] font-bold text-white">
                        导入 {result.grades.length} 条成绩
                      </Text>
                    </Pressable>
                  </>
                )
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
                可收起为悬浮球后台继续，或随时点击左侧取消识别
              </Text>
            ) : null}
          </View>
        </GlassContainer>
      </Animated.View>

      {editing != null &&
      result?.type === "schedule" &&
      editorSchedule &&
      result.schedule.courses[editing] ? (
        <ImportRowEditor
          pages={result.sources?.[editing]?.pages}
          onClose={() => setEditing(null)}
          target={{
            type: "course",
            schedule: editorSchedule,
            course: result.schedule.courses[editing],
            save: (course) =>
              useImportTask.getState().editCourse(result, editing, course),
          }}
        />
      ) : null}
      {editing != null &&
      result?.type === "grades" &&
      result.grades[editing] ? (
        <ImportRowEditor
          pages={result.sources?.[editing]?.pages}
          onClose={() => setEditing(null)}
          target={{
            type: "grade",
            grade: result.grades[editing],
            save: (grade) =>
              useImportTask.getState().editGrade(result, editing, grade),
          }}
        />
      ) : null}
      {editing != null &&
      result?.type === "periods" &&
      result.periods[editing] ? (
        <ImportRowEditor
          onClose={() => setEditing(null)}
          target={{
            type: "period",
            period: result.periods[editing],
            save: (period) =>
              useImportTask.getState().editPeriod(result, editing, period),
          }}
        />
      ) : null}
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

  const x = useSharedValue(edgeX);
  const y = useSharedValue(edgeY);
  const scale = useSharedValue(1);
  const entryX = useSharedValue((width - BALL_SIZE) / 2 - edgeX);
  const entryY = useSharedValue((height - BALL_SIZE) / 2 - edgeY);

  React.useEffect(() => {
    entryX.value = withSpring(0, PRESS_SPRING);
    entryY.value = withSpring(0, PRESS_SPRING);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const ring = useSharedValue(progress);
  React.useEffect(() => {
    ring.value = withTiming(progress, { duration: 450 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [progress]);

  const pan = Gesture.Pan()
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
      <Animated.View
        entering={FadeIn.springify().damping(15).stiffness(150)}
        style={{
          position: "absolute",
          width: BALL_SIZE,
          height: BALL_SIZE,
        }}
      >
        <Animated.View style={ballStyle}>
          <GlassContainer
            radius={BALL_SIZE / 2}
            borderOpacity={0.22}
            style={{ width: BALL_SIZE, height: BALL_SIZE }}
          >
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
