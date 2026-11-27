import Ionicons from "@expo/vector-icons/Ionicons";
import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  Pressable,
  ScrollView,
  Text,
  View,
  useWindowDimensions,
  type ScrollViewInstance,
} from "react-native";
import Animated, {
  Easing,
  FadeIn,
  FadeInDown,
  FadeOut,
  useReducedMotion,
} from "react-native-reanimated";

import { FocusMiniBanner } from "@/components/FocusMiniBanner";
import { GlassContainer } from "@/components/GlassContainer";
import {
  undoSchedulePreview,
  useLastScheduleChange,
  type ScheduleChange,
} from "@/services/assistantSchedule";
import { useStore } from "@/store/useStore";
import {
  useStudyProgress,
  type FocusSessionCompletion,
} from "@/store/useStudyProgress";
import type { Course, Schedule } from "@/types";
import {
  TASK_TYPES,
  formatTaskCountdown,
  getUpcomingTasks,
} from "@/utils/courseTasks";
import { selectHaptic } from "@/utils/haptics";
import {
  courseIdentityKey,
  getAttendanceRiskCourses,
} from "@/utils/studyProgress";

export type ScheduleViewMode = "day" | "week";

export interface HolidayUndoNotice {
  scheduleId: string;
  prevCourses: Course[];
  summary: string;
}

export interface ScheduleHeaderProps {
  schedule: Schedule;
  activeScheduleId: string;
  activeWeek: number;
  totalWeeks: number;
  currentRealWeek: number | null;
  viewDateLabel: string;
  viewWeekdayLabel: string;
  semesterBadge: string;
  showBackToToday: boolean;
  mode: ScheduleViewMode;
  clockText: string;
  secretCharge: number;
  isDark: boolean;
  studyModalOpen: boolean;
  holidayUndo: HolidayUndoNotice | null;
  nowMs: number;
  onOpenSwitcher: () => void;
  onAfterHoursPlatform: () => void;
  onAfterHoursPermission: () => void;
  onWeekTitleLongPress: () => void;
  onJumpToToday: () => void;
  onChangeMode: (mode: ScheduleViewMode) => void;
  onClockTap: () => void;
  onSelectWeek: (week: number) => void;
  onUndoHolidayShift: () => void;
  onDismissHolidayUndo: () => void;
  onOpenTaskSheet: () => void;
  onOpenStudyModal: (
    targetCourse: Course | null,
    tab: "focus" | "attendance",
  ) => void;
  onOpenPeerCompare: () => void;
  onOpenSearchStats: () => void;
  onOpenHolidayShift: () => void;
  onOpenExport: () => void;
}

const AssistantUndoBanner = React.memo(function AssistantUndoBanner() {
  const lastChange = useLastScheduleChange((s) => s.change);
  const lastChangeLabel = useLastScheduleChange((s) => s.label);
  const [undoChoice, setUndoChoice] = useState<ScheduleChange | null>(null);
  const [undoFailed, setUndoFailed] = useState<ScheduleChange | null>(null);

  if (!lastChange) return null;

  return (
    <View className="mb-2 rounded-xl bg-sky-500/12 px-3 py-1.5">
      <View className="flex-row items-center gap-2">
        <Text
          className="flex-1 text-xs text-slate-700 dark:text-slate-200"
          numberOfLines={2}
        >
          {lastChangeLabel}
        </Text>
        {undoChoice === lastChange ? (
          <>
            <Pressable
              accessibilityRole="button"
              onPress={() => setUndoChoice(null)}
              className="px-2 py-2"
            >
              <Text className="text-xs text-slate-600 dark:text-slate-300">
                取消
              </Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              onPress={() => {
                setUndoChoice(null);
                if (!undoSchedulePreview(lastChange)) setUndoFailed(lastChange);
              }}
              className="px-2 py-2"
            >
              <Text className="text-xs font-semibold text-sky-700 dark:text-sky-300">
                确认撤销
              </Text>
            </Pressable>
          </>
        ) : undoFailed !== lastChange ? (
          <Pressable
            accessibilityRole="button"
            onPress={() => setUndoChoice(lastChange)}
            className="px-2 py-2"
          >
            <Text className="text-xs font-semibold text-sky-700 dark:text-sky-300">
              撤销上次变更
            </Text>
          </Pressable>
        ) : null}
      </View>
      {undoFailed === lastChange ? (
        <Text
          accessibilityLiveRegion="polite"
          className="pb-1 text-xs text-amber-700 dark:text-amber-300"
        >
          相关课表已有后续编辑，已保留当前内容。
        </Text>
      ) : null}
    </View>
  );
});

const StudyToolsPill = React.memo(function StudyToolsPill({
  schedule,
  onPress,
}: {
  schedule: Schedule;
  onPress: () => void;
}) {
  const attendanceByCourse = useStudyProgress((s) => s.attendanceByCourse);
  const customAbsenceLimits = useStudyProgress((s) => s.customAbsenceLimits);
  const activeFocusSession = useStudyProgress((s) => s.activeFocusSession);

  const attendanceRiskCount = useMemo(
    () =>
      getAttendanceRiskCourses(
        schedule,
        attendanceByCourse,
        customAbsenceLimits,
      ).length,
    [schedule, attendanceByCourse, customAbsenceLimits],
  );

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      className="flex-row items-center rounded-full border border-white/25 bg-white/30 px-2.5 py-1 dark:border-white/10 dark:bg-white/[0.06]"
    >
      <Ionicons name="timer-outline" size={12} color="#10B981" />
      <Text className="ml-1 text-[11px] font-semibold text-slate-700 dark:text-slate-200">
        专注 / 考勤
      </Text>
      {activeFocusSession ? (
        <View
          className={`ml-1 h-2 w-2 rounded-full ${
            activeFocusSession.running
              ? activeFocusSession.mode === "break"
                ? "bg-emerald-500"
                : "bg-sky-500"
              : "bg-amber-400"
          }`}
        />
      ) : null}
      {attendanceRiskCount > 0 ? (
        <View className="ml-1 rounded-full bg-rose-500/85 px-1.5 py-[1px]">
          <Text className="text-[9.5px] font-bold text-white">
            {attendanceRiskCount}
          </Text>
        </View>
      ) : null}
    </Pressable>
  );
});

const ScheduleFocusBanners = React.memo(function ScheduleFocusBanners({
  courses,
  isDark,
  studyModalOpen,
  onOpenStudyModal,
}: {
  courses: Course[];
  isDark: boolean;
  studyModalOpen: boolean;
  onOpenStudyModal: (
    targetCourse: Course | null,
    tab: "focus" | "attendance",
  ) => void;
}) {
  const activeFocusSession = useStudyProgress((s) => s.activeFocusSession);
  const [focusDoneNotice, setFocusDoneNotice] =
    useState<FocusSessionCompletion | null>(null);

  return (
    <>
      {activeFocusSession && !studyModalOpen ? (
        <FocusMiniBanner
          isDark={isDark}
          onOpenModal={() => {
            const matched =
              courses.find(
                (c) => courseIdentityKey(c) === activeFocusSession.courseKey,
              ) ?? null;
            onOpenStudyModal(matched, "focus");
          }}
          onSessionFinished={(completion) => {
            setFocusDoneNotice(completion);
          }}
        />
      ) : null}

      {focusDoneNotice && !activeFocusSession && !studyModalOpen ? (
        <View className="px-4 pt-1.5">
          <GlassContainer radius={16} intensity={40} borderOpacity={0.25}>
            <View className="flex-row items-center px-3 py-2">
              <Ionicons
                name={
                  focusDoneNotice.mode === "break"
                    ? "cafe-outline"
                    : "sparkles"
                }
                size={14}
                color="#10B981"
              />
              <Pressable
                onPress={() => {
                  const matched =
                    courses.find(
                      (c) =>
                        courseIdentityKey(c) === focusDoneNotice.courseKey,
                    ) ?? null;
                  setFocusDoneNotice(null);
                  onOpenStudyModal(matched, "focus");
                }}
                className="mx-2 min-w-0 flex-1"
              >
                <Text
                  numberOfLines={1}
                  className="text-[11.5px] font-bold text-emerald-700 dark:text-emerald-300"
                >
                  {focusDoneNotice.mode === "break"
                    ? `短休结束 · 准备回到「${focusDoneNotice.courseName}」`
                    : `「${focusDoneNotice.courseName}」专注完成 · +${focusDoneNotice.reward?.coins ?? 0} dark币`}
                </Text>
              </Pressable>
              <Pressable
                onPress={() => setFocusDoneNotice(null)}
                accessibilityRole="button"
                accessibilityLabel="关闭专注完成提示"
                hitSlop={8}
                className="p-1"
              >
                <Ionicons name="close" size={13} color="#94A3B8" />
              </Pressable>
            </View>
          </GlassContainer>
        </View>
      ) : null}
    </>
  );
});

export const ScheduleHeader = React.memo(function ScheduleHeader({
  schedule,
  activeScheduleId,
  activeWeek,
  totalWeeks,
  currentRealWeek,
  viewDateLabel,
  viewWeekdayLabel,
  semesterBadge,
  showBackToToday,
  mode,
  clockText,
  secretCharge,
  isDark,
  studyModalOpen,
  holidayUndo,
  nowMs,
  onOpenSwitcher,
  onAfterHoursPlatform,
  onAfterHoursPermission,
  onWeekTitleLongPress,
  onJumpToToday,
  onChangeMode,
  onClockTap,
  onSelectWeek,
  onUndoHolidayShift,
  onDismissHolidayUndo,
  onOpenTaskSheet,
  onOpenStudyModal,
  onOpenPeerCompare,
  onOpenSearchStats,
  onOpenHolidayShift,
  onOpenExport,
}: ScheduleHeaderProps) {
  const reducedMotion = useReducedMotion();
  const { width: winW } = useWindowDimensions();
  const weekScrollRef = useRef<ScrollViewInstance>(null);
  const [taskBannerCollapsed, setTaskBannerCollapsed] = useState(false);
  const courseTasks = useStore((s) => s.courseTasks);

  const upcomingTasks = useMemo(
    () => getUpcomingTasks(courseTasks, nowMs, 5),
    [courseTasks, nowMs],
  );
  const pendingTaskCount = useMemo(
    () => courseTasks.reduce((n, t) => n + (t.completedAt ? 0 : 1), 0),
    [courseTasks],
  );

  /** 横向周次条自动滚到当前选中周居中 */
  useEffect(() => {
    // 每颗周次胶囊约 32px + 6px 间距 = 38px，左右内边距 20px
    const x = Math.max(0, (activeWeek - 1) * 38 + 20 - winW / 2 + 16);
    const id = setTimeout(() => {
      weekScrollRef.current?.scrollTo({ x, animated: !reducedMotion });
    }, 40);
    return () => clearTimeout(id);
  }, [activeWeek, winW, reducedMotion]);

  const topTask = upcomingTasks.length > 0 ? upcomingTasks[0] : null;
  const topCountdown = topTask ? formatTaskCountdown(topTask.dueAt, nowMs) : null;

  return (
    <>
      {/* ---------- 顶部：日期 + 周次 + 回今天 + 视图切换 ---------- */}
      <View className="px-5 pb-0.5 pt-1">
        <AssistantUndoBanner />

        {holidayUndo && holidayUndo.scheduleId === activeScheduleId ? (
          <View className="mb-2 flex-row items-center gap-2 rounded-xl border border-amber-400/35 bg-amber-500/12 px-3 py-1.5">
            <Ionicons name="swap-horizontal" size={14} color="#F59E0B" />
            <Text
              className="flex-1 text-xs text-slate-700 dark:text-slate-200"
              numberOfLines={2}
            >
              {holidayUndo.summary}
            </Text>
            <Pressable
              accessibilityRole="button"
              onPress={onUndoHolidayShift}
              className="rounded-lg bg-amber-500/20 px-2.5 py-1"
            >
              <Text className="text-xs font-bold text-amber-700 dark:text-amber-300">
                撤销
              </Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="关闭提示"
              onPress={onDismissHolidayUndo}
              hitSlop={6}
              className="p-1"
            >
              <Ionicons name="close" size={14} color="#94A3B8" />
            </Pressable>
          </View>
        ) : null}

        <Animated.View
          entering={
            reducedMotion
              ? undefined
              : FadeInDown.duration(220).easing(Easing.out(Easing.cubic))
          }
        >
          <View className="flex-row items-center justify-between">
            <View className="min-w-0 flex-1 pr-2">
              {/* 课表名称 + 学期外状态标签 */}
              <View className="flex-row items-center gap-x-2">
                <Pressable
                  onPress={onOpenSwitcher}
                  onLongPress={onAfterHoursPlatform}
                  delayLongPress={1600}
                  className="flex-row items-center self-start rounded-full py-0.5 pr-1.5"
                  style={{ flexShrink: 1 }}
                >
                  <Text
                    numberOfLines={1}
                    className="text-[10.5px] font-semibold tracking-wider text-sky-600/90 dark:text-sky-300/85"
                    style={{ flexShrink: 1 }}
                  >
                    {schedule.name}
                  </Text>
                  <Ionicons
                    name="chevron-down"
                    size={11}
                    color="#38BDF8"
                    style={{ marginLeft: 2, flexShrink: 0 }}
                  />
                </Pressable>
                {semesterBadge ? (
                  <View className="shrink-0 rounded-full bg-amber-400/20 px-2 py-0.5">
                    <Text
                      numberOfLines={1}
                      className="text-[9.5px] font-bold text-amber-700 dark:text-amber-300"
                    >
                      {semesterBadge}
                    </Text>
                  </View>
                ) : null}
              </View>

              <Pressable
                onLongPress={onWeekTitleLongPress}
                delayLongPress={800}
                style={{ width: "100%" }}
              >
                <Text
                  numberOfLines={1}
                  adjustsFontSizeToFit
                  minimumFontScale={0.85}
                  className="text-[23px] font-extrabold leading-[27px] text-slate-800 dark:text-white"
                >
                  第 {activeWeek} 周
                </Text>
                <Text
                  numberOfLines={1}
                  adjustsFontSizeToFit
                  minimumFontScale={0.85}
                  className="mt-0.5 text-[11.5px] font-medium leading-[15px] text-slate-500 dark:text-slate-400"
                >
                  {viewDateLabel} {viewWeekdayLabel}
                </Text>
              </Pressable>
            </View>

            <View className="shrink-0 flex-row items-center gap-x-1.5">
              {/* 偏离今天/本周时出现「回今天」一键复位胶囊 */}
              {showBackToToday ? (
                <Animated.View
                  entering={reducedMotion ? undefined : FadeIn.duration(160)}
                  exiting={reducedMotion ? undefined : FadeOut.duration(140)}
                >
                  <Pressable
                    onPress={onJumpToToday}
                    accessibilityRole="button"
                    accessibilityLabel="回到今天"
                    className="rounded-[12px] border border-sky-400/45 bg-sky-500/20 px-2.5 py-1.5"
                  >
                    <Text
                      numberOfLines={1}
                      className="text-[11px] font-bold text-sky-700 dark:text-sky-300"
                    >
                      今
                    </Text>
                  </Pressable>
                </Animated.View>
              ) : null}

              {/* 视图切换 */}
              <GlassContainer radius={13} intensity={42} borderOpacity={0.2}>
                <View className="flex-row p-0.5">
                  {(
                    [
                      ["day", "today"],
                      ["week", "grid"],
                    ] as const
                  ).map(([key, icon]) => (
                    <Pressable
                      key={key}
                      onPress={() => onChangeMode(key)}
                      onLongPress={onAfterHoursPermission}
                      delayLongPress={1400}
                      accessibilityRole="button"
                      accessibilityLabel={key === "day" ? "日视图" : "周视图"}
                      className={`h-7 w-8 items-center justify-center rounded-[10px] ${
                        mode === key ? "bg-sky-400/85" : ""
                      }`}
                    >
                      <Ionicons
                        name={icon}
                        size={14}
                        color={mode === key ? "#FFFFFF" : "#94A3B8"}
                      />
                    </Pressable>
                  ))}
                </View>
              </GlassContainer>

              {/* 时钟 */}
              <GlassContainer
                radius={13}
                intensity={42}
                borderOpacity={0.2 + secretCharge * 0.045}
              >
                <Pressable
                  onPress={onClockTap}
                  className="flex-row items-center px-2.5 py-1.5"
                  style={
                    secretCharge > 0
                      ? {
                          backgroundColor: `rgba(56,189,248,${0.04 + secretCharge * 0.025})`,
                        }
                      : undefined
                  }
                >
                  <Ionicons
                    name={secretCharge >= 5 ? "sparkles" : "time-outline"}
                    size={12}
                    color={secretCharge >= 3 ? "#7DD3FC" : "#38BDF8"}
                  />
                  <Text
                    numberOfLines={1}
                    className={`ml-1 text-[11px] font-semibold ${
                      secretCharge >= 3
                        ? "text-sky-500 dark:text-sky-300"
                        : "text-slate-600 dark:text-slate-300"
                    }`}
                  >
                    {clockText}
                  </Text>
                  {secretCharge > 0 ? (
                    <View
                      pointerEvents="none"
                      style={{
                        position: "absolute",
                        left: 8,
                        right: 8,
                        bottom: 2,
                        flexDirection: "row",
                        justifyContent: "center",
                        gap: 3,
                      }}
                    >
                      {Array.from({ length: Math.min(secretCharge, 6) }).map(
                        (_, idx) => (
                          <View
                            key={idx}
                            style={{
                              width: 2.5,
                              height: 2.5,
                              borderRadius: 2,
                              backgroundColor:
                                idx >= 4
                                  ? "rgba(253,230,138,0.9)"
                                  : "rgba(125,211,252,0.85)",
                            }}
                          />
                        ),
                      )}
                    </View>
                  ) : null}
                </Pressable>
              </GlassContainer>
            </View>
          </View>
        </Animated.View>
      </View>

      {/* ---------- 周次横向选择（自动滚至当前周居中） ---------- */}
      <Animated.View
        entering={
          reducedMotion
            ? undefined
            : FadeInDown.delay(50).duration(220).easing(Easing.out(Easing.cubic))
        }
        className="pt-1.5"
      >
        <ScrollView
          ref={weekScrollRef}
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ paddingHorizontal: 20, gap: 6 }}
        >
          {Array.from({ length: totalWeeks }, (_, i) => i + 1).map((w) => {
            const isNow = currentRealWeek !== null && w === currentRealWeek;
            const isSel = w === activeWeek;
            return (
              <Pressable key={w} onPress={() => onSelectWeek(w)}>
                <View
                  className={`h-8 min-w-[32px] items-center justify-center rounded-full border px-2 ${
                    isSel
                      ? "border-sky-400/70 bg-sky-400/85"
                      : isNow
                        ? "border-sky-400/55 bg-white/30 dark:bg-white/[0.08]"
                        : "border-white/15 bg-white/20 dark:border-white/[0.06] dark:bg-white/[0.04]"
                  }`}
                >
                  <Text
                    className={`text-[12px] font-bold ${
                      isSel
                        ? "text-white"
                        : isNow
                          ? "text-sky-600 dark:text-sky-300"
                          : "text-slate-500 dark:text-slate-400"
                    }`}
                  >
                    {w}
                  </Text>
                </View>
              </Pressable>
            );
          })}
        </ScrollView>
      </Animated.View>

      {/* ---------- 快捷工具胶囊条（待办 / 专注 / 对比 / 搜索统计 / 调休 / 导出壁纸） ---------- */}
      <View className="pt-1.5">
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ paddingHorizontal: 16, gap: 6 }}
        >
          <Pressable
            onPress={onOpenTaskSheet}
            accessibilityRole="button"
            className="flex-row items-center rounded-full border border-white/25 bg-white/30 px-2.5 py-1 dark:border-white/10 dark:bg-white/[0.06]"
          >
            <Ionicons name="checkbox-outline" size={12} color="#F43F5E" />
            <Text className="ml-1 text-[11px] font-semibold text-slate-700 dark:text-slate-200">
              待办/考试
            </Text>
            {pendingTaskCount > 0 ? (
              <View className="ml-1 rounded-full bg-rose-500/85 px-1.5 py-[1px]">
                <Text className="text-[9.5px] font-bold text-white">
                  {pendingTaskCount}
                </Text>
              </View>
            ) : null}
          </Pressable>

          <StudyToolsPill
            schedule={schedule}
            onPress={() => onOpenStudyModal(null, "focus")}
          />

          <Pressable
            onPress={() => {
              selectHaptic();
              onOpenPeerCompare();
            }}
            accessibilityRole="button"
            className="flex-row items-center rounded-full border border-white/25 bg-white/30 px-2.5 py-1 dark:border-white/10 dark:bg-white/[0.06]"
          >
            <Ionicons name="people-outline" size={12} color="#06B6D4" />
            <Text className="ml-1 text-[11px] font-semibold text-slate-700 dark:text-slate-200">
              空课对比
            </Text>
          </Pressable>

          <Pressable
            onPress={() => {
              selectHaptic();
              onOpenSearchStats();
            }}
            accessibilityRole="button"
            className="flex-row items-center rounded-full border border-white/25 bg-white/30 px-2.5 py-1 dark:border-white/10 dark:bg-white/[0.06]"
          >
            <Ionicons name="search-outline" size={12} color="#38BDF8" />
            <Text className="ml-1 text-[11px] font-semibold text-slate-700 dark:text-slate-200">
              搜索与统计
            </Text>
          </Pressable>

          <Pressable
            onPress={() => {
              selectHaptic();
              onOpenHolidayShift();
            }}
            accessibilityRole="button"
            className="flex-row items-center rounded-full border border-white/25 bg-white/30 px-2.5 py-1 dark:border-white/10 dark:bg-white/[0.06]"
          >
            <Ionicons
              name="swap-horizontal-outline"
              size={12}
              color="#F59E0B"
            />
            <Text className="ml-1 text-[11px] font-semibold text-slate-700 dark:text-slate-200">
              节假日调休
            </Text>
          </Pressable>

          <Pressable
            onPress={() => {
              selectHaptic();
              onOpenExport();
            }}
            accessibilityRole="button"
            className="flex-row items-center rounded-full border border-white/25 bg-white/30 px-2.5 py-1 dark:border-white/10 dark:bg-white/[0.06]"
          >
            <Ionicons name="share-outline" size={12} color="#8B5CF6" />
            <Text className="ml-1 text-[11px] font-semibold text-slate-700 dark:text-slate-200">
              导出与壁纸
            </Text>
          </Pressable>
        </ScrollView>
      </View>

      {/* ---------- 番茄专注 / 短休迷你悬浮条（关闭学习弹窗后仍持续计时） ---------- */}
      <ScheduleFocusBanners
        courses={schedule.courses}
        isDark={isDark}
        studyModalOpen={studyModalOpen}
        onOpenStudyModal={onOpenStudyModal}
      />

      {/* ---------- 考试 / DDL 倒计时条（有未完成任务时显示，可折叠） ---------- */}
      {topTask && topCountdown ? (
        <View className="px-4 pt-1.5">
          {taskBannerCollapsed ? (
            <Pressable
              onPress={() => {
                selectHaptic();
                setTaskBannerCollapsed(false);
              }}
              className="flex-row items-center justify-between self-start rounded-full border border-white/25 bg-white/30 px-3 py-1 dark:border-white/10 dark:bg-white/[0.06]"
            >
              <Ionicons name="alarm-outline" size={11.5} color="#F43F5E" />
              <Text className="ml-1 text-[10.5px] font-semibold text-slate-600 dark:text-slate-300">
                倒计时 · {upcomingTasks.length} 项待办
              </Text>
              <Ionicons
                name="chevron-down"
                size={11}
                color="#94A3B8"
                style={{ marginLeft: 4 }}
              />
            </Pressable>
          ) : (
            <GlassContainer radius={16} intensity={40} borderOpacity={0.22}>
              <View className="flex-row items-center px-3 py-2">
                <Pressable
                  onPress={onOpenTaskSheet}
                  className="min-w-0 flex-1 flex-row items-center"
                >
                  <View
                    className={`mr-2 rounded-md border px-1.5 py-0.5 ${
                      topTask.type === "exam"
                        ? "border-rose-400/45 bg-rose-500/15"
                        : topTask.type === "review"
                          ? "border-violet-400/45 bg-violet-500/15"
                          : "border-sky-400/45 bg-sky-500/15"
                    }`}
                  >
                    <Text
                      className={`text-[9.5px] font-bold ${
                        topTask.type === "exam"
                          ? "text-rose-700 dark:text-rose-300"
                          : topTask.type === "review"
                            ? "text-violet-700 dark:text-violet-300"
                            : "text-sky-700 dark:text-sky-300"
                      }`}
                    >
                      {TASK_TYPES[topTask.type]}
                    </Text>
                  </View>
                  <Text
                    numberOfLines={1}
                    className="flex-1 text-[12px] font-bold text-slate-800 dark:text-slate-100"
                  >
                    {topTask.title}
                    {topTask.location ? ` · ${topTask.location}` : ""}
                  </Text>
                  <View
                    className={`ml-2 shrink-0 rounded-full border px-2 py-0.5 ${
                      topCountdown.overdue
                        ? "border-rose-500/45 bg-rose-500/20"
                        : topCountdown.urgent
                          ? "border-amber-400/45 bg-amber-500/20"
                          : "border-sky-400/35 bg-sky-500/15"
                    }`}
                  >
                    <Text
                      className={`text-[10px] font-bold ${
                        topCountdown.overdue
                          ? "text-rose-700 dark:text-rose-300"
                          : topCountdown.urgent
                            ? "text-amber-700 dark:text-amber-300"
                            : "text-sky-700 dark:text-sky-300"
                      }`}
                    >
                      {topCountdown.label}
                    </Text>
                  </View>
                  {upcomingTasks.length > 1 ? (
                    <Text className="ml-1.5 text-[10px] font-semibold text-slate-400 dark:text-slate-500">
                      +{upcomingTasks.length - 1}
                    </Text>
                  ) : null}
                </Pressable>
                <Pressable
                  onPress={() => {
                    selectHaptic();
                    setTaskBannerCollapsed(true);
                  }}
                  accessibilityRole="button"
                  accessibilityLabel="折叠倒计时条"
                  hitSlop={8}
                  className="ml-1.5 p-1"
                >
                  <Ionicons name="chevron-up" size={13} color="#94A3B8" />
                </Pressable>
              </View>
            </GlassContainer>
          )}
        </View>
      ) : null}
    </>
  );
});
