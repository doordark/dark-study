import Ionicons from "@expo/vector-icons/Ionicons";
import React, { useMemo, useState } from "react";
import {
  Modal,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from "react-native";

import { coursePalette, WEEKDAY_LABELS } from "@/constants/palette";
import { useStudyProgress } from "@/store/useStudyProgress";
import type { Course, Schedule } from "@/types";
import { selectHaptic, tapHaptic } from "@/utils/haptics";
import {
  computeScheduleStats,
  searchScheduleCourses,
} from "@/utils/scheduleExport";
import {
  buildStudyReviewSummary,
  getAttendanceRiskCourses,
} from "@/utils/studyProgress";
import {
  countDistinctCourses,
  formatWeeksCompact,
  getCourseTime,
} from "@/utils/time";

export interface CourseSearchStatsModalProps {
  visible: boolean;
  onClose: () => void;
  schedule: Schedule;
  currentWeek: number;
  onSelectCourse: (course: Course, targetWeek?: number) => void;
}

type ModalTab = "search" | "stats" | "review";

const TOP_COURSE_BAR_COLORS = [
  "#0EA5E9",
  "#8B5CF6",
  "#10B981",
  "#F59E0B",
  "#F43F5E",
  "#06B6D4",
] as const;

export function CourseSearchStatsModal({
  visible,
  onClose,
  schedule,
  currentWeek,
  onSelectCourse,
}: CourseSearchStatsModalProps) {
  const [tab, setTab] = useState<ModalTab>("search");
  const [query, setQuery] = useState("");
  const [onlyCurrentWeek, setOnlyCurrentWeek] = useState(false);

  const focusLogs = useStudyProgress((s) => s.focusLogs);
  const attendanceByCourse = useStudyProgress((s) => s.attendanceByCourse);
  const customAbsenceLimits = useStudyProgress((s) => s.customAbsenceLimits);

  const studyReview = useMemo(
    () => buildStudyReviewSummary(focusLogs, attendanceByCourse),
    [focusLogs, attendanceByCourse],
  );

  const attendanceRisks = useMemo(
    () =>
      getAttendanceRiskCourses(
        schedule,
        attendanceByCourse,
        customAbsenceLimits,
      ),
    [schedule, attendanceByCourse, customAbsenceLimits],
  );

  const maxDailyFocusMinutes = useMemo(
    () => Math.max(15, ...studyReview.dailyLast7.map((d) => d.minutes)),
    [studyReview.dailyLast7],
  );

  const searchResults = useMemo(() => {
    const matched = searchScheduleCourses(schedule, query);
    if (!onlyCurrentWeek) return matched;
    return matched.filter((c) => c.weeks.includes(currentWeek));
  }, [schedule, query, onlyCurrentWeek, currentWeek]);

  const distinctResultCount = useMemo(
    () => countDistinctCourses(searchResults),
    [searchResults],
  );

  const stats = useMemo(() => computeScheduleStats(schedule), [schedule]);

  const maxWeekdayHours = useMemo(
    () => Math.max(0.5, ...stats.weeklyHoursByWeekday),
    [stats.weeklyHoursByWeekday],
  );

  const maxWeekSessions = useMemo(
    () => Math.max(1, ...stats.sessionsPerWeek),
    [stats.sessionsPerWeek],
  );

  const courseBreakdown = useMemo(() => {
    const totalWeeks = Math.max(1, schedule.totalWeeks || 18);
    const map = new Map<
      string,
      {
        name: string;
        teacher: string;
        color: Course["color"];
        credits: number;
        totalPeriods: number;
        totalSessions: number;
        sampleCourse: Course;
      }
    >();

    for (const c of schedule.courses) {
      const name = c.name.trim();
      if (!name) continue;
      const key = `${name}|${(c.teacher ?? "").trim()}`;
      const validWeeks = [...new Set(c.weeks)].filter(
        (w) => Number.isInteger(w) && w >= 1 && w <= totalWeeks,
      );
      const periodsPerSession = Math.max(1, c.endPeriod - c.startPeriod + 1);
      const addedPeriods = validWeeks.length * periodsPerSession;
      const creditVal =
        typeof c.credits === "number" && Number.isFinite(c.credits) && c.credits > 0
          ? c.credits
          : 0;
      const prev = map.get(key);
      if (prev) {
        prev.totalPeriods += addedPeriods;
        prev.totalSessions += validWeeks.length;
        if (creditVal > prev.credits) prev.credits = creditVal;
      } else {
        map.set(key, {
          name,
          teacher: c.teacher,
          color: c.color,
          credits: creditVal,
          totalPeriods: addedPeriods,
          totalSessions: validWeeks.length,
          sampleCourse: c,
        });
      }
    }

    return [...map.values()].sort(
      (a, b) => b.totalPeriods - a.totalPeriods || b.credits - a.credits,
    );
  }, [schedule]);

  const handleSelectCourse = (course: Course) => {
    tapHaptic();
    const targetWeek = course.weeks.includes(currentWeek)
      ? currentWeek
      : course.weeks[0];
    onSelectCourse(course, targetWeek);
    onClose();
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <View className="flex-1 justify-end bg-black/55 sm:justify-center sm:px-5">
        <View className="max-h-[90%] min-h-[70%] rounded-t-3xl border border-slate-200/80 bg-white pb-5 pt-4 dark:border-white/10 dark:bg-slate-900 sm:rounded-3xl">
          {/* 顶栏 */}
          <View className="flex-row items-center justify-between px-5 pb-3">
            <View className="flex-1 pr-3">
              <Text className="text-[17px] font-bold text-slate-900 dark:text-white">
                课程搜索与学期统计
              </Text>
              <Text className="mt-0.5 text-[11.5px] text-slate-500 dark:text-slate-400">
                {schedule.name} · 共 {stats.uniqueCourseCount} 门课
              </Text>
            </View>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="关闭"
              onPress={onClose}
              className="h-8 w-8 items-center justify-center rounded-full bg-slate-100 dark:bg-slate-800"
            >
              <Ionicons name="close" size={17} color="#94A3B8" />
            </Pressable>
          </View>

          {/* 顶部分段 Tab */}
          <View className="mx-5 mb-3 flex-row rounded-2xl bg-slate-100 p-1 dark:bg-slate-800/80">
            {(
              [
                ["search", "搜索课程", "search-outline"],
                ["stats", "学期统计", "bar-chart-outline"],
                ["review", "学习复盘", "flame-outline"],
              ] as const
            ).map(([key, label, icon]) => {
              const active = tab === key;
              return (
                <Pressable
                  key={key}
                  onPress={() => {
                    selectHaptic();
                    setTab(key);
                  }}
                  className={`flex-1 flex-row items-center justify-center gap-1 rounded-xl py-2 ${
                    active ? "bg-white dark:bg-slate-700" : ""
                  }`}
                >
                  <Ionicons
                    name={icon}
                    size={13.5}
                    color={
                      active
                        ? key === "review"
                          ? "#10B981"
                          : "#0284C7"
                        : "#94A3B8"
                    }
                  />
                  <Text
                    className={`text-[12px] font-bold ${
                      active
                        ? key === "review"
                          ? "text-emerald-700 dark:text-emerald-300"
                          : "text-sky-700 dark:text-sky-300"
                        : "text-slate-500 dark:text-slate-400"
                    }`}
                  >
                    {label}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          {tab === "search" ? (
            <View className="flex-1 px-5">
              {/* 搜索输入框 */}
              <View className="flex-row items-center rounded-2xl border border-slate-200 bg-slate-50 px-3.5 py-2 dark:border-white/10 dark:bg-slate-800/80">
                <Ionicons name="search" size={16} color="#94A3B8" />
                <TextInput
                  value={query}
                  onChangeText={setQuery}
                  placeholder="搜索课程名、教师、教室或备注…"
                  placeholderTextColor="#94A3B8"
                  returnKeyType="search"
                  className="ml-2 flex-1 py-0.5 text-[13px] text-slate-900 dark:text-white"
                />
                {query.length > 0 ? (
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="清空搜索"
                    onPress={() => setQuery("")}
                    className="p-1"
                  >
                    <Ionicons name="close-circle" size={16} color="#94A3B8" />
                  </Pressable>
                ) : null}
              </View>

              {/* 快捷筛选 + 结果计数 */}
              <View className="mt-2.5 mb-2 flex-row items-center justify-between">
                <View className="flex-row gap-1.5">
                  <Pressable
                    onPress={() => {
                      selectHaptic();
                      setOnlyCurrentWeek(false);
                    }}
                    className={`rounded-full px-2.5 py-1 ${
                      !onlyCurrentWeek
                        ? "bg-sky-500/15"
                        : "bg-slate-100 dark:bg-slate-800"
                    }`}
                  >
                    <Text
                      className={`text-[11px] font-semibold ${
                        !onlyCurrentWeek
                          ? "text-sky-700 dark:text-sky-300"
                          : "text-slate-500 dark:text-slate-400"
                      }`}
                    >
                      整学期
                    </Text>
                  </Pressable>
                  <Pressable
                    onPress={() => {
                      selectHaptic();
                      setOnlyCurrentWeek(true);
                    }}
                    className={`rounded-full px-2.5 py-1 ${
                      onlyCurrentWeek
                        ? "bg-sky-500/15"
                        : "bg-slate-100 dark:bg-slate-800"
                    }`}
                  >
                    <Text
                      className={`text-[11px] font-semibold ${
                        onlyCurrentWeek
                          ? "text-sky-700 dark:text-sky-300"
                          : "text-slate-500 dark:text-slate-400"
                      }`}
                    >
                      仅第 {currentWeek} 周
                    </Text>
                  </Pressable>
                </View>
                <Text className="text-[11px] text-slate-500 dark:text-slate-400">
                  {distinctResultCount} 门课 · {searchResults.length} 条排课
                </Text>
              </View>

              {/* 课程结果列表 */}
              <ScrollView
                showsVerticalScrollIndicator={false}
                contentContainerStyle={{ gap: 8, paddingBottom: 16 }}
              >
                {searchResults.length === 0 ? (
                  <View className="items-center py-12">
                    <Ionicons name="search-outline" size={32} color="#94A3B8" />
                    <Text className="mt-2 text-[13px] font-semibold text-slate-600 dark:text-slate-300">
                      未找到匹配的课程
                    </Text>
                    <Text className="mt-1 text-[11.5px] text-slate-400">
                      试试输入课程关键词、教师姓名或教学楼名称
                    </Text>
                  </View>
                ) : (
                  searchResults.map((course) => {
                    const palette = coursePalette[course.color] ?? coursePalette.sky;
                    const time = getCourseTime(
                      schedule.periods,
                      course.startPeriod,
                      course.endPeriod,
                      course,
                    );
                    const inThisWeek = course.weeks.includes(currentWeek);
                    const weeksLabel = formatWeeksCompact(course.weeks);

                    return (
                      <Pressable
                        key={course.id}
                        onPress={() => handleSelectCourse(course)}
                        className="flex-row items-center rounded-2xl border border-slate-200/75 bg-slate-50/90 px-3.5 py-3 active:opacity-80 dark:border-white/10 dark:bg-slate-800/70"
                      >
                        <View
                          className="mr-3 h-11 w-1 rounded-full"
                          style={{ backgroundColor: palette.solid }}
                        />
                        <View className="flex-1">
                          <View className="flex-row items-center gap-1.5">
                            <Text
                              numberOfLines={1}
                              className="flex-1 text-[14px] font-bold text-slate-800 dark:text-white"
                            >
                              {course.name}
                            </Text>
                            {typeof course.credits === "number" && course.credits > 0 ? (
                              <View className="rounded-md bg-violet-500/15 px-1.5 py-0.5">
                                <Text className="text-[10px] font-bold text-violet-600 dark:text-violet-300">
                                  {course.credits} 学分
                                </Text>
                              </View>
                            ) : null}
                            {inThisWeek ? (
                              <View className="rounded-md bg-sky-500/15 px-1.5 py-0.5">
                                <Text className="text-[10px] font-bold text-sky-600 dark:text-sky-300">
                                  本周
                                </Text>
                              </View>
                            ) : null}
                          </View>

                          <Text
                            numberOfLines={1}
                            className="mt-1 text-[11.5px] font-medium text-slate-600 dark:text-slate-300"
                          >
                            {WEEKDAY_LABELS[course.weekday - 1] ?? `周${course.weekday}`}{" "}
                            {time.startTime}–{time.endTime} · 第{course.startPeriod}
                            {course.endPeriod !== course.startPeriod
                              ? `–${course.endPeriod}`
                              : ""}
                            节{weeksLabel ? ` · ${weeksLabel}` : ""}
                          </Text>

                          <Text
                            numberOfLines={1}
                            className="mt-0.5 text-[11px] text-slate-500 dark:text-slate-400"
                          >
                            {[
                              course.classroom?.trim(),
                              course.teacher?.trim(),
                              course.note?.trim(),
                            ]
                              .filter(Boolean)
                              .join(" · ") || "轻点跳转到对应周次查看"}
                          </Text>
                        </View>
                        <Ionicons
                          name="chevron-forward"
                          size={16}
                          color="#94A3B8"
                        />
                      </Pressable>
                    );
                  })
                )}
              </ScrollView>
            </View>
          ) : tab === "stats" ? (
            <ScrollView
              className="flex-1 px-5"
              showsVerticalScrollIndicator={false}
              contentContainerStyle={{ gap: 12, paddingBottom: 16 }}
            >
              {/* 学习复盘速览入口 */}
              <Pressable
                onPress={() => {
                  selectHaptic();
                  setTab("review");
                }}
                accessibilityRole="button"
                className="flex-row items-center justify-between rounded-2xl border border-emerald-400/35 bg-emerald-500/10 px-3.5 py-2.5 dark:border-emerald-400/20 dark:bg-emerald-500/12"
              >
                <View className="min-w-0 flex-1 pr-2">
                  <Text className="text-[12px] font-bold text-emerald-700 dark:text-emerald-300">
                    学习复盘速览
                  </Text>
                  <Text
                    numberOfLines={1}
                    className="mt-0.5 text-[11px] text-emerald-700/80 dark:text-emerald-300/80"
                  >
                    累计专注 {studyReview.totalFocusMinutes} 分钟 · 连续{" "}
                    {studyReview.streakDays} 天 · 出勤率{" "}
                    {studyReview.attendance.attendanceRate !== null
                      ? `${Math.round(studyReview.attendance.attendanceRate * 100)}%`
                      : "--"}
                  </Text>
                </View>
                <View className="shrink-0 flex-row items-center">
                  <Text className="text-[11px] font-bold text-emerald-600 dark:text-emerald-300">
                    看详情
                  </Text>
                  <Ionicons
                    name="chevron-forward"
                    size={13}
                    color="#10B981"
                  />
                </View>
              </Pressable>

              {/* 核心指标四宫格 */}
              <View className="flex-row flex-wrap gap-2.5">
                <View className="min-w-[46%] flex-1 rounded-2xl border border-slate-200/80 bg-slate-50/90 p-3.5 dark:border-white/10 dark:bg-slate-800/70">
                  <Text className="text-[11px] font-medium text-slate-500 dark:text-slate-400">
                    去重课程门数
                  </Text>
                  <Text className="mt-1 text-[22px] font-extrabold text-sky-600 dark:text-sky-300">
                    {stats.uniqueCourseCount}
                    <Text className="text-[12px] font-semibold"> 门</Text>
                  </Text>
                  <Text className="mt-0.5 text-[10.5px] text-slate-400">
                    共 {stats.slotCount} 条排课时段
                  </Text>
                </View>

                <View className="min-w-[46%] flex-1 rounded-2xl border border-slate-200/80 bg-slate-50/90 p-3.5 dark:border-white/10 dark:bg-slate-800/70">
                  <Text className="text-[11px] font-medium text-slate-500 dark:text-slate-400">
                    本学期总学分
                  </Text>
                  <Text className="mt-1 text-[22px] font-extrabold text-violet-600 dark:text-violet-300">
                    {stats.totalCredits}
                    <Text className="text-[12px] font-semibold"> 分</Text>
                  </Text>
                  <Text className="mt-0.5 text-[10.5px] text-slate-400">
                    按课程去重汇总
                  </Text>
                </View>

                <View className="min-w-[46%] flex-1 rounded-2xl border border-slate-200/80 bg-slate-50/90 p-3.5 dark:border-white/10 dark:bg-slate-800/70">
                  <Text className="text-[11px] font-medium text-slate-500 dark:text-slate-400">
                    学期总学时
                  </Text>
                  <Text className="mt-1 text-[22px] font-extrabold text-emerald-600 dark:text-emerald-300">
                    {stats.totalClassHours}
                    <Text className="text-[12px] font-semibold"> 节</Text>
                  </Text>
                  <Text className="mt-0.5 text-[10.5px] text-slate-400">
                    约 {stats.totalClockHours} 小时课堂
                  </Text>
                </View>

                <View className="min-w-[46%] flex-1 rounded-2xl border border-slate-200/80 bg-slate-50/90 p-3.5 dark:border-white/10 dark:bg-slate-800/70">
                  <Text className="text-[11px] font-medium text-slate-500 dark:text-slate-400">
                    总上课次数
                  </Text>
                  <Text className="mt-1 text-[22px] font-extrabold text-amber-600 dark:text-amber-300">
                    {stats.totalSessions}
                    <Text className="text-[12px] font-semibold"> 次</Text>
                  </Text>
                  <Text className="mt-0.5 text-[10.5px] text-slate-400">
                    {stats.busiestWeekday
                      ? `最忙：${WEEKDAY_LABELS[stats.busiestWeekday - 1]}`
                      : "暂无排课"}
                  </Text>
                </View>
              </View>

              {/* 星期负荷柱状图 */}
              <View className="rounded-2xl border border-slate-200/80 bg-slate-50/90 p-4 dark:border-white/10 dark:bg-slate-800/70">
                <View className="flex-row items-center justify-between">
                  <Text className="text-[13px] font-bold text-slate-800 dark:text-white">
                    每日负荷分布（周均小时）
                  </Text>
                  {stats.busiestWeekday ? (
                    <View className="rounded-full bg-sky-500/15 px-2 py-0.5">
                      <Text className="text-[10px] font-bold text-sky-700 dark:text-sky-300">
                        最忙 {WEEKDAY_LABELS[stats.busiestWeekday - 1]}
                      </Text>
                    </View>
                  ) : null}
                </View>

                <View className="mt-4 h-36 flex-row items-end justify-between gap-2 px-1">
                  {stats.weeklyHoursByWeekday.map((hours, idx) => {
                    const isBusiest = stats.busiestWeekday === idx + 1 && hours > 0;
                    const ratio = hours > 0 ? Math.max(0.08, hours / maxWeekdayHours) : 0;
                    const barHeight = Math.round(ratio * 88);
                    return (
                      <View key={idx} className="flex-1 items-center">
                        <Text className="mb-1 text-[9.5px] font-semibold text-slate-500 dark:text-slate-400">
                          {hours > 0 ? `${hours}h` : "-"}
                        </Text>
                        <View className="h-[88px] w-full items-center justify-end">
                          <View
                            style={{
                              height: Math.max(4, barHeight),
                              width: "68%",
                              borderRadius: 8,
                              backgroundColor: isBusiest
                                ? "#38BDF8"
                                : hours > 0
                                  ? "rgba(56,189,248,0.45)"
                                  : "rgba(148,163,184,0.22)",
                            }}
                          />
                        </View>
                        <Text
                          className={`mt-1.5 text-[10.5px] font-semibold ${
                            isBusiest
                              ? "text-sky-600 dark:text-sky-300"
                              : "text-slate-500 dark:text-slate-400"
                          }`}
                        >
                          {WEEKDAY_LABELS[idx].replace("周", "")}
                        </Text>
                      </View>
                    );
                  })}
                </View>
              </View>

              {/* 各教学周课次曲线 */}
              <View className="rounded-2xl border border-slate-200/80 bg-slate-50/90 p-4 dark:border-white/10 dark:bg-slate-800/70">
                <View className="flex-row items-center justify-between">
                  <Text className="text-[13px] font-bold text-slate-800 dark:text-white">
                    各教学周课次走势
                  </Text>
                  <Text className="text-[10.5px] text-slate-500 dark:text-slate-400">
                    第 {currentWeek} 周：{stats.sessionsPerWeek[currentWeek - 1] ?? 0} 次课
                  </Text>
                </View>

                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  className="mt-3"
                  contentContainerStyle={{ gap: 6, alignItems: "flex-end", paddingVertical: 4 }}
                >
                  {stats.sessionsPerWeek.map((count, idx) => {
                    const weekNum = idx + 1;
                    const isCurrent = weekNum === currentWeek;
                    const h = count > 0 ? Math.max(8, Math.round((count / maxWeekSessions) * 56)) : 4;
                    return (
                      <View key={weekNum} className="w-7 items-center">
                        <Text className="mb-1 text-[9px] text-slate-400">
                          {count > 0 ? count : ""}
                        </Text>
                        <View
                          style={{
                            height: h,
                            width: 14,
                            borderRadius: 6,
                            backgroundColor: isCurrent
                              ? "#A78BFA"
                              : count > 0
                                ? "rgba(167,139,250,0.42)"
                                : "rgba(148,163,184,0.2)",
                          }}
                        />
                        <Text
                          className={`mt-1 text-[9.5px] font-semibold ${
                            isCurrent
                              ? "text-violet-600 dark:text-violet-300"
                              : "text-slate-400"
                          }`}
                        >
                          {weekNum}
                        </Text>
                      </View>
                    );
                  })}
                </ScrollView>
              </View>

              {/* 课程学时明细 */}
              {courseBreakdown.length > 0 ? (
                <View className="rounded-2xl border border-slate-200/80 bg-slate-50/90 p-4 dark:border-white/10 dark:bg-slate-800/70">
                  <Text className="mb-2.5 text-[13px] font-bold text-slate-800 dark:text-white">
                    课程学时与学分明细
                  </Text>
                  <View className="gap-2">
                    {courseBreakdown.map((item) => {
                      const palette = coursePalette[item.color] ?? coursePalette.sky;
                      return (
                        <Pressable
                          key={`${item.name}-${item.teacher}`}
                          onPress={() => handleSelectCourse(item.sampleCourse)}
                          className="flex-row items-center rounded-xl bg-white/90 px-3 py-2 dark:bg-slate-900/70"
                        >
                          <View
                            className="mr-2.5 h-2.5 w-2.5 rounded-full"
                            style={{ backgroundColor: palette.solid }}
                          />
                          <View className="flex-1">
                            <Text
                              numberOfLines={1}
                              className="text-[12.5px] font-semibold text-slate-800 dark:text-slate-100"
                            >
                              {item.name}
                            </Text>
                            {item.teacher ? (
                              <Text className="text-[10.5px] text-slate-400">
                                {item.teacher}
                              </Text>
                            ) : null}
                          </View>
                          <Text className="text-[11px] font-semibold text-slate-600 dark:text-slate-300">
                            {item.totalPeriods} 节
                            {item.credits > 0 ? ` · ${item.credits} 分` : ""}
                          </Text>
                        </Pressable>
                      );
                    })}
                  </View>
                </View>
              ) : null}
            </ScrollView>
          ) : (
            /* ---------------- Tab 3: 学期学习复盘仪表盘 ---------------- */
            <ScrollView
              className="flex-1 px-5"
              showsVerticalScrollIndicator={false}
              contentContainerStyle={{ gap: 12, paddingBottom: 16 }}
            >
              {/* 核心复盘四宫格 */}
              <View className="flex-row flex-wrap gap-2.5">
                <View className="min-w-[46%] flex-1 rounded-2xl border border-slate-200/80 bg-slate-50/90 p-3.5 dark:border-white/10 dark:bg-slate-800/70">
                  <Text className="text-[11px] font-medium text-slate-500 dark:text-slate-400">
                    累计专注时长
                  </Text>
                  <Text className="mt-1 text-[22px] font-extrabold text-sky-600 dark:text-sky-300">
                    {studyReview.totalFocusMinutes}
                    <Text className="text-[12px] font-semibold"> 分</Text>
                  </Text>
                  <Text className="mt-0.5 text-[10.5px] text-slate-400">
                    约 {(studyReview.totalFocusMinutes / 60).toFixed(1)} 小时 ·{" "}
                    {studyReview.totalFocusSessions} 次番茄
                  </Text>
                </View>

                <View className="min-w-[46%] flex-1 rounded-2xl border border-slate-200/80 bg-slate-50/90 p-3.5 dark:border-white/10 dark:bg-slate-800/70">
                  <Text className="text-[11px] font-medium text-slate-500 dark:text-slate-400">
                    连续学习天数
                  </Text>
                  <Text className="mt-1 text-[22px] font-extrabold text-amber-600 dark:text-amber-300">
                    {studyReview.streakDays}
                    <Text className="text-[12px] font-semibold"> 天</Text>
                  </Text>
                  <Text className="mt-0.5 text-[10.5px] text-slate-400">
                    近 7 天活跃 {studyReview.activeDaysLast7} / 7 天
                  </Text>
                </View>

                <View className="min-w-[46%] flex-1 rounded-2xl border border-slate-200/80 bg-slate-50/90 p-3.5 dark:border-white/10 dark:bg-slate-800/70">
                  <Text className="text-[11px] font-medium text-slate-500 dark:text-slate-400">
                    近 7 天专注
                  </Text>
                  <Text className="mt-1 text-[22px] font-extrabold text-violet-600 dark:text-violet-300">
                    {studyReview.last7DaysMinutes}
                    <Text className="text-[12px] font-semibold"> 分</Text>
                  </Text>
                  <Text className="mt-0.5 text-[10.5px] text-slate-400">
                    今日专注 {studyReview.todayFocusMinutes} 分钟
                  </Text>
                </View>

                <View className="min-w-[46%] flex-1 rounded-2xl border border-slate-200/80 bg-slate-50/90 p-3.5 dark:border-white/10 dark:bg-slate-800/70">
                  <Text className="text-[11px] font-medium text-slate-500 dark:text-slate-400">
                    综合出勤率
                  </Text>
                  <Text className="mt-1 text-[22px] font-extrabold text-emerald-600 dark:text-emerald-300">
                    {studyReview.attendance.attendanceRate !== null
                      ? Math.round(studyReview.attendance.attendanceRate * 100)
                      : "--"}
                    {studyReview.attendance.attendanceRate !== null ? (
                      <Text className="text-[12px] font-semibold">%</Text>
                    ) : null}
                  </Text>
                  <Text className="mt-0.5 text-[10.5px] text-slate-400">
                    已记录 {studyReview.attendance.totalRecords} 次 ·{" "}
                    {studyReview.attendance.trackedCourses} 门课
                  </Text>
                </View>
              </View>

              {/* 近 7 天专注柱状图 */}
              <View className="rounded-2xl border border-slate-200/80 bg-slate-50/90 p-4 dark:border-white/10 dark:bg-slate-800/70">
                <View className="flex-row items-center justify-between">
                  <Text className="text-[13px] font-bold text-slate-800 dark:text-white">
                    近 7 天专注节奏（分钟）
                  </Text>
                  <Text className="text-[10.5px] text-slate-500 dark:text-slate-400">
                    共 {studyReview.last7DaysMinutes} 分钟
                  </Text>
                </View>

                <View className="mt-4 h-36 flex-row items-end justify-between gap-2 px-1">
                  {studyReview.dailyLast7.map((bucket) => {
                    const ratio =
                      bucket.minutes > 0
                        ? Math.max(0.1, bucket.minutes / maxDailyFocusMinutes)
                        : 0;
                    const barHeight = Math.round(ratio * 84);
                    return (
                      <View key={bucket.dateIso} className="flex-1 items-center">
                        <Text className="mb-1 text-[9.5px] font-semibold text-slate-500 dark:text-slate-400">
                          {bucket.minutes > 0 ? `${bucket.minutes}m` : "-"}
                        </Text>
                        <View className="h-[84px] w-full items-center justify-end">
                          <View
                            style={{
                              height: Math.max(4, barHeight),
                              width: "66%",
                              borderRadius: 8,
                              backgroundColor: bucket.isToday
                                ? "#10B981"
                                : bucket.minutes > 0
                                  ? "rgba(16,185,129,0.48)"
                                  : "rgba(148,163,184,0.22)",
                            }}
                          />
                        </View>
                        <Text
                          className={`mt-1.5 text-[10.5px] font-semibold ${
                            bucket.isToday
                              ? "text-emerald-600 dark:text-emerald-300"
                              : "text-slate-500 dark:text-slate-400"
                          }`}
                        >
                          {bucket.shortWeekday}
                        </Text>
                      </View>
                    );
                  })}
                </View>
              </View>

              {/* 专注学科排行分布条 */}
              <View className="rounded-2xl border border-slate-200/80 bg-slate-50/90 p-4 dark:border-white/10 dark:bg-slate-800/70">
                <View className="mb-2.5 flex-row items-center justify-between">
                  <Text className="text-[13px] font-bold text-slate-800 dark:text-white">
                    专注学科排行分布
                  </Text>
                  <Text className="text-[10.5px] text-slate-500 dark:text-slate-400">
                    共 {studyReview.topCourses.length} 门学科
                  </Text>
                </View>

                {studyReview.topCourses.length === 0 ? (
                  <View className="items-center py-6">
                    <Ionicons name="timer-outline" size={26} color="#94A3B8" />
                    <Text className="mt-2 text-[12.5px] font-semibold text-slate-600 dark:text-slate-300">
                      还没有专注记录
                    </Text>
                    <Text className="mt-0.5 text-[11px] text-slate-400">
                      在课表页点「专注 / 考勤」开启第一个番茄钟吧
                    </Text>
                  </View>
                ) : (
                  <View className="gap-3">
                    {studyReview.topCourses.slice(0, 6).map((item, idx) => {
                      const barColor =
                        TOP_COURSE_BAR_COLORS[idx % TOP_COURSE_BAR_COLORS.length];
                      const pct = Math.round(item.ratio * 100);
                      return (
                        <View key={item.courseKey}>
                          <View className="mb-1 flex-row items-center justify-between">
                            <View className="min-w-0 flex-1 flex-row items-center pr-2">
                              <View
                                className="mr-2 h-2.5 w-2.5 rounded-full"
                                style={{ backgroundColor: barColor }}
                              />
                              <Text
                                numberOfLines={1}
                                className="flex-1 text-[12.5px] font-bold text-slate-800 dark:text-slate-100"
                              >
                                {item.courseName}
                              </Text>
                            </View>
                            <Text className="shrink-0 text-[11px] font-semibold text-slate-600 dark:text-slate-300">
                              {item.minutes} 分钟 · {item.sessions} 次 ({pct}%)
                            </Text>
                          </View>
                          <View className="h-2 w-full overflow-hidden rounded-full bg-slate-200/80 dark:bg-white/10">
                            <View
                              className="h-full rounded-full"
                              style={{
                                width: `${Math.max(4, pct)}%`,
                                backgroundColor: barColor,
                              }}
                            />
                          </View>
                        </View>
                      );
                    })}
                  </View>
                )}
              </View>

              {/* 总体考勤汇总 */}
              <View className="rounded-2xl border border-slate-200/80 bg-slate-50/90 p-4 dark:border-white/10 dark:bg-slate-800/70">
                <View className="flex-row items-center justify-between">
                  <Text className="text-[13px] font-bold text-slate-800 dark:text-white">
                    学期考勤总览
                  </Text>
                  <Text className="text-[10.5px] text-slate-500 dark:text-slate-400">
                    {studyReview.attendance.trackedCourses} 门课有打卡
                  </Text>
                </View>

                {studyReview.attendance.totalRecords === 0 ? (
                  <Text className="mt-2 text-[11.5px] text-slate-500 dark:text-slate-400">
                    暂无考勤打卡记录，可在课程快捷菜单或「专注 / 考勤」中一键签到。
                  </Text>
                ) : (
                  <>
                    {/* 三色占比条 */}
                    <View className="mt-3 h-3 w-full flex-row overflow-hidden rounded-full bg-slate-200/80 dark:bg-white/10">
                      {studyReview.attendance.present > 0 ? (
                        <View
                          style={{
                            flex: studyReview.attendance.present,
                            backgroundColor: "#10B981",
                          }}
                        />
                      ) : null}
                      {studyReview.attendance.leave > 0 ? (
                        <View
                          style={{
                            flex: studyReview.attendance.leave,
                            backgroundColor: "#F59E0B",
                          }}
                        />
                      ) : null}
                      {studyReview.attendance.absent > 0 ? (
                        <View
                          style={{
                            flex: studyReview.attendance.absent,
                            backgroundColor: "#F43F5E",
                          }}
                        />
                      ) : null}
                    </View>

                    <View className="mt-3 flex-row gap-2">
                      <View className="flex-1 items-center rounded-xl bg-emerald-500/12 py-2">
                        <Text className="text-[15px] font-extrabold text-emerald-700 dark:text-emerald-300">
                          {studyReview.attendance.present}
                        </Text>
                        <Text className="text-[10px] font-semibold text-emerald-700/80 dark:text-emerald-300/80">
                          出勤
                        </Text>
                      </View>
                      <View className="flex-1 items-center rounded-xl bg-amber-500/12 py-2">
                        <Text className="text-[15px] font-extrabold text-amber-700 dark:text-amber-300">
                          {studyReview.attendance.leave}
                        </Text>
                        <Text className="text-[10px] font-semibold text-amber-700/80 dark:text-amber-300/80">
                          请假
                        </Text>
                      </View>
                      <View className="flex-1 items-center rounded-xl bg-rose-500/12 py-2">
                        <Text className="text-[15px] font-extrabold text-rose-700 dark:text-rose-300">
                          {studyReview.attendance.absent}
                        </Text>
                        <Text className="text-[10px] font-semibold text-rose-700/80 dark:text-rose-300/80">
                          缺勤
                        </Text>
                      </View>
                    </View>

                    {attendanceRisks.length > 0 ? (
                      <View className="mt-3 gap-1.5">
                        <Text className="text-[11px] font-bold text-rose-600 dark:text-rose-300">
                          缺勤预警学科（{attendanceRisks.length}）
                        </Text>
                        {attendanceRisks.map((item) => (
                          <View
                            key={item.courseKey}
                            className="flex-row items-center justify-between rounded-xl bg-white/90 px-3 py-2 dark:bg-slate-900/70"
                          >
                            <Text
                              numberOfLines={1}
                              className="flex-1 pr-2 text-[12px] font-semibold text-slate-800 dark:text-slate-100"
                            >
                              {item.courseName}
                            </Text>
                            <View
                              className={`rounded-full px-2 py-0.5 ${
                                item.summary.riskLevel === "danger"
                                  ? "bg-rose-500/20"
                                  : "bg-amber-500/20"
                              }`}
                            >
                              <Text
                                className={`text-[10px] font-bold ${
                                  item.summary.riskLevel === "danger"
                                    ? "text-rose-700 dark:text-rose-300"
                                    : "text-amber-700 dark:text-amber-300"
                                }`}
                              >
                                缺勤 {item.summary.absent} / 红线{" "}
                                {item.summary.redline}
                              </Text>
                            </View>
                          </View>
                        ))}
                      </View>
                    ) : null}
                  </>
                )}
              </View>
            </ScrollView>
          )}
        </View>
      </View>
    </Modal>
  );
}
