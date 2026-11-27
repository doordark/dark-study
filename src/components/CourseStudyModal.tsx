import Ionicons from "@expo/vector-icons/Ionicons";
import { router } from "expo-router";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Modal,
  Pressable,
  ScrollView,
  Text,
  useWindowDimensions,
  View,
} from "react-native";
import Animated, {
  Easing,
  FadeInDown,
  useReducedMotion,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import {
  GlassContainer,
  GlassTargetProvider,
} from "@/components/GlassContainer";
import { WhaleAvatar } from "@/components/WhaleAvatar";
import { useStudyProgress } from "@/store/useStudyProgress";
import type { Course, Schedule } from "@/types";
import {
  selectHaptic,
  successHaptic,
  tapHaptic,
  warnHaptic,
} from "@/utils/haptics";
import {
  FOCUS_PRESET_MINUTES,
  buildFarmRewardForFocus,
  computeAttendanceSummary,
  courseIdentityKey,
  getCourseFocusMinutes,
  getCourseSlotsByKey,
  getTodayFocusMinutes,
  listDistinctScheduleCourses,
  type AttendanceRecord,
  type AttendanceStatus,
  type PendingFarmReward,
} from "@/utils/studyProgress";
import { toIsoDate } from "@/utils/time";

export interface CourseStudyModalProps {
  visible: boolean;
  onClose: () => void;
  course: Course | null;
  schedule: Schedule;
  isDark: boolean;
  initialTab?: "focus" | "attendance";
  onVisitFarm?: () => void;
}

type StudyTab = "focus" | "attendance";

const STATUS_META: Record<
  AttendanceStatus,
  {
    label: string;
    shortLabel: string;
    icon: keyof typeof Ionicons.glyphMap;
    color: string;
    badgeClass: string;
    textClass: string;
  }
> = {
  present: {
    label: "出勤 ✓",
    shortLabel: "出勤",
    icon: "checkmark-circle",
    color: "#10B981",
    badgeClass: "border-emerald-400/40 bg-emerald-500/15",
    textClass: "text-emerald-700 dark:text-emerald-300",
  },
  leave: {
    label: "请假",
    shortLabel: "请假",
    icon: "document-text-outline",
    color: "#F59E0B",
    badgeClass: "border-amber-400/40 bg-amber-500/15",
    textClass: "text-amber-700 dark:text-amber-300",
  },
  absent: {
    label: "缺勤",
    shortLabel: "缺勤",
    icon: "close-circle",
    color: "#F43F5E",
    badgeClass: "border-rose-400/40 bg-rose-500/15",
    textClass: "text-rose-700 dark:text-rose-300",
  },
};

function formatCountdown(totalSec: number): string {
  const safe = Math.max(0, Math.floor(totalSec));
  const mins = Math.floor(safe / 60);
  const secs = safe % 60;
  return `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
}

export function CourseStudyModal(props: CourseStudyModalProps) {
  if (!props.visible) return null;
  return <CourseStudyModalBody {...props} />;
}

function CourseStudyModalBody({
  onClose,
  course,
  schedule,
  isDark,
  initialTab = "focus",
  onVisitFarm,
}: CourseStudyModalProps) {
  const attendanceByCourse = useStudyProgress((s) => s.attendanceByCourse);
  const customAbsenceLimits = useStudyProgress((s) => s.customAbsenceLimits);
  const focusLogs = useStudyProgress((s) => s.focusLogs);
  const pendingFarmRewards = useStudyProgress((s) => s.pendingFarmRewards);
  const recordAttendance = useStudyProgress((s) => s.recordAttendance);
  const removeAttendanceRecord = useStudyProgress(
    (s) => s.removeAttendanceRecord,
  );
  const setCustomAbsenceLimit = useStudyProgress(
    (s) => s.setCustomAbsenceLimit,
  );
  const recordCourseFocus = useStudyProgress((s) => s.recordCourseFocus);

  const { height: winH } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const reducedMotion = useReducedMotion();

  const distinctCourses = useMemo(
    () => listDistinctScheduleCourses(schedule),
    [schedule],
  );

  const initialKey = useMemo(() => {
    if (course) return courseIdentityKey(course);
    return distinctCourses[0]?.courseKey ?? "free-study::";
  }, [course, distinctCourses]);

  const [tab, setTab] = useState<StudyTab>(initialTab);
  const [manualKey, setManualKey] = useState<string | null>(null);
  const selectedKey = manualKey ?? initialKey;

  const activeEntry = useMemo(() => {
    const matched = distinctCourses.find((item) => item.courseKey === selectedKey);
    if (matched) return matched;
    if (course && courseIdentityKey(course) === selectedKey) {
      return {
        courseKey: selectedKey,
        course,
        slots: getCourseSlotsByKey(schedule, selectedKey).length
          ? getCourseSlotsByKey(schedule, selectedKey)
          : [course],
      };
    }
    return distinctCourses[0] ?? null;
  }, [course, distinctCourses, schedule, selectedKey]);

  const activeCourseKey = activeEntry?.courseKey ?? "free-study::";
  const activeCourseName = activeEntry?.course.name ?? "自由自习";
  const activeCourseSlots = useMemo(
    () => activeEntry?.slots ?? [],
    [activeEntry],
  );

  /* ---------------- Tab 1: 学科番茄专注 ---------------- */
  const [presetMin, setPresetMin] = useState<number>(25);
  const [remainingSec, setRemainingSec] = useState<number>(25 * 60);
  const [running, setRunning] = useState(false);
  const [hasStarted, setHasStarted] = useState(false);
  const [celebration, setCelebration] = useState<PendingFarmReward | null>(null);
  const endAtRef = useRef<number | null>(null);
  const completedRef = useRef(false);

  const courseFocusMinutes = useMemo(
    () => getCourseFocusMinutes(focusLogs, activeCourseKey),
    [focusLogs, activeCourseKey],
  );
  const todayFocusMinutes = useMemo(
    () => getTodayFocusMinutes(focusLogs),
    [focusLogs],
  );
  const previewReward = useMemo(
    () => buildFarmRewardForFocus(presetMin, activeCourseName),
    [presetMin, activeCourseName],
  );

  const settleFocus = useCallback(
    (minutes: number) => {
      if (completedRef.current) return;
      completedRef.current = true;
      const { reward } = recordCourseFocus(
        activeEntry?.course ?? activeCourseKey,
        minutes,
        { courseName: activeCourseName },
      );
      successHaptic();
      setRunning(false);
      setHasStarted(false);
      endAtRef.current = null;
      setRemainingSec(presetMin * 60);
      setCelebration(reward);
    },
    [activeCourseKey, activeCourseName, activeEntry, presetMin, recordCourseFocus],
  );

  useEffect(() => {
    if (!running) return;
    const timer = setInterval(() => {
      const targetEnd = endAtRef.current;
      if (!targetEnd) return;
      const nextSec = Math.max(0, Math.ceil((targetEnd - Date.now()) / 1000));
      setRemainingSec(nextSec);
      if (nextSec <= 0) {
        clearInterval(timer);
        settleFocus(presetMin);
      }
    }, 500);
    return () => clearInterval(timer);
  }, [running, presetMin, settleFocus]);

  const handleSelectPreset = (minutes: number) => {
    if (running) return;
    selectHaptic();
    completedRef.current = false;
    setPresetMin(minutes);
    setRemainingSec(minutes * 60);
    setHasStarted(false);
    setCelebration(null);
    endAtRef.current = null;
  };

  const handleToggleRun = () => {
    tapHaptic();
    setCelebration(null);
    if (running) {
      if (endAtRef.current) {
        const left = Math.max(
          1,
          Math.ceil((endAtRef.current - Date.now()) / 1000),
        );
        setRemainingSec(left);
      }
      endAtRef.current = null;
      setRunning(false);
    } else {
      completedRef.current = false;
      const baseSec = remainingSec > 0 ? remainingSec : presetMin * 60;
      endAtRef.current = Date.now() + baseSec * 1000;
      setHasStarted(true);
      setRunning(true);
    }
  };

  const handleResetTimer = () => {
    selectHaptic();
    completedRef.current = false;
    endAtRef.current = null;
    setRunning(false);
    setHasStarted(false);
    setRemainingSec(presetMin * 60);
    setCelebration(null);
  };

  const handleFinishEarly = () => {
    const totalSec = presetMin * 60;
    const currentLeft =
      running && endAtRef.current
        ? Math.max(0, Math.ceil((endAtRef.current - Date.now()) / 1000))
        : remainingSec;
    const elapsedSec = Math.max(0, totalSec - currentLeft);
    const settledMinutes = Math.max(1, Math.round(elapsedSec / 60));
    settleFocus(settledMinutes);
  };

  const totalSec = Math.max(1, presetMin * 60);
  const progressRatio = Math.min(1, Math.max(0, (totalSec - remainingSec) / totalSec));

  /* ---------------- Tab 2: 考勤与缺勤预警 ---------------- */
  const records: AttendanceRecord[] = useMemo(
    () => attendanceByCourse[activeCourseKey] ?? [],
    [attendanceByCourse, activeCourseKey],
  );
  const customLimit = customAbsenceLimits[activeCourseKey];
  const attendanceSummary = useMemo(
    () => computeAttendanceSummary(activeCourseSlots, records, customLimit),
    [activeCourseSlots, records, customLimit],
  );
  const defaultRedline = useMemo(
    () => computeAttendanceSummary(activeCourseSlots, [], undefined).redline,
    [activeCourseSlots],
  );

  const todayIso = toIsoDate(new Date());
  const redlineRatio = Math.min(
    1,
    attendanceSummary.redline > 0
      ? attendanceSummary.absent / attendanceSummary.redline
      : 0,
  );

  const handleCheckIn = (status: AttendanceStatus) => {
    if (status === "absent") {
      warnHaptic();
    } else {
      successHaptic();
    }
    recordAttendance(activeEntry?.course ?? activeCourseKey, status, {
      courseName: activeCourseName,
      dateIso: todayIso,
    });
  };

  const handleStepRedline = (delta: number) => {
    selectHaptic();
    const next = Math.max(1, Math.min(60, attendanceSummary.redline + delta));
    setCustomAbsenceLimit(activeCourseKey, next);
  };

  const handleVisitFarm = () => {
    tapHaptic();
    onClose();
    if (onVisitFarm) {
      onVisitFarm();
    } else {
      router.push("/farm");
    }
  };

  const sheetH = Math.max(420, Math.min(Math.round(winH * 0.86), winH - 32));
  const bottomSafePad = Math.max(insets.bottom, 16) + 12;

  return (
    <Modal
      visible
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <GlassTargetProvider>
        <View className="flex-1 justify-end bg-black/45">
          <Pressable className="flex-1" onPress={onClose} />
          <Animated.View
            entering={
              reducedMotion
                ? undefined
                : FadeInDown.duration(220).easing(Easing.out(Easing.cubic))
            }
          >
            <GlassContainer
              variant="sheet"
              radius={32}
              borderOpacity={0.3}
              style={{ height: sheetH, paddingBottom: bottomSafePad }}
            >
              {/* 顶部标题栏 */}
              <View className="flex-row items-center justify-between px-5 pb-2.5 pt-5">
                <View className="min-w-0 flex-1 pr-3">
                  <Text
                    numberOfLines={1}
                    className="text-[17px] font-bold text-slate-800 dark:text-white"
                  >
                    学习闭环 · 专注与考勤
                  </Text>
                  <Text
                    numberOfLines={1}
                    className="mt-0.5 text-[11px] text-slate-500 dark:text-slate-400"
                  >
                    今日专注 {todayFocusMinutes} 分钟 · 农场奖励箱待领{" "}
                    {pendingFarmRewards.length} 份
                  </Text>
                </View>
                <Pressable
                  onPress={onClose}
                  accessibilityRole="button"
                  accessibilityLabel="关闭"
                  className="h-8 w-8 items-center justify-center rounded-full bg-slate-400/15 dark:bg-white/10"
                >
                  <Ionicons
                    name="close"
                    size={16}
                    color={isDark ? "#CBD5E1" : "#64748B"}
                  />
                </Pressable>
              </View>

              {/* 双 Tab 切换 */}
              <View className="px-5 pb-2.5">
                <View className="flex-row rounded-2xl border border-slate-300/35 bg-white/30 p-1 dark:border-white/10 dark:bg-white/[0.05]">
                  {(
                    [
                      ["focus", "学科番茄专注", "timer-outline"],
                      ["attendance", "考勤与缺勤预警", "shield-checkmark-outline"],
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
                        accessibilityRole="tab"
                        accessibilityState={{ selected: active }}
                        className={`flex-1 flex-row items-center justify-center rounded-xl py-2 ${
                          active
                            ? "bg-sky-500/90"
                            : "bg-transparent"
                        }`}
                      >
                        <Ionicons
                          name={icon}
                          size={14}
                          color={
                            active
                              ? "#FFFFFF"
                              : isDark
                                ? "#94A3B8"
                                : "#64748B"
                          }
                        />
                        <Text
                          className={`ml-1.5 text-[12px] font-bold ${
                            active
                              ? "text-white"
                              : "text-slate-600 dark:text-slate-300"
                          }`}
                        >
                          {label}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
              </View>

              {/* 学科快捷选择条 */}
              {distinctCourses.length > 0 ? (
                <View className="pb-2.5">
                  <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    contentContainerStyle={{ paddingHorizontal: 20, gap: 6 }}
                  >
                    {distinctCourses.map((item) => {
                      const isSel = item.courseKey === activeCourseKey;
                      const itemSummary = computeAttendanceSummary(
                        item.slots,
                        attendanceByCourse[item.courseKey],
                        customAbsenceLimits[item.courseKey],
                      );
                      return (
                        <Pressable
                          key={item.courseKey}
                          disabled={running}
                          onPress={() => {
                            selectHaptic();
                            setManualKey(item.courseKey);
                            setCelebration(null);
                          }}
                          className={`flex-row items-center rounded-full border px-3 py-1.5 ${
                            isSel
                              ? "border-sky-400/75 bg-sky-500/20"
                              : "border-slate-300/35 bg-white/30 dark:border-white/10 dark:bg-white/[0.05]"
                          } ${running && !isSel ? "opacity-45" : ""}`}
                        >
                          <Text
                            numberOfLines={1}
                            className={`max-w-[140px] text-[11.5px] font-semibold ${
                              isSel
                                ? "text-sky-700 dark:text-sky-300"
                                : "text-slate-600 dark:text-slate-300"
                            }`}
                          >
                            {item.course.name}
                          </Text>
                          {itemSummary.riskLevel !== "safe" ? (
                            <View
                              className={`ml-1.5 h-2 w-2 rounded-full ${
                                itemSummary.riskLevel === "danger"
                                  ? "bg-rose-500"
                                  : "bg-amber-400"
                              }`}
                            />
                          ) : null}
                        </Pressable>
                      );
                    })}
                  </ScrollView>
                </View>
              ) : null}

              <ScrollView
                className="flex-1 px-5"
                showsVerticalScrollIndicator={false}
                contentContainerStyle={{ paddingBottom: 24 }}
              >
                {tab === "focus" ? (
                  <View className="gap-y-3">
                    {/* 当前学科与累计专注卡片 */}
                    <View className="rounded-2xl border border-slate-300/35 bg-white/35 p-4 dark:border-white/10 dark:bg-white/[0.06]">
                      <View className="flex-row items-center justify-between">
                        <View className="min-w-0 flex-1 pr-2">
                          <Text
                            numberOfLines={1}
                            className="text-[15px] font-extrabold text-slate-800 dark:text-white"
                          >
                            {activeCourseName}
                          </Text>
                          <Text className="mt-0.5 text-[11px] text-slate-500 dark:text-slate-400">
                            {activeEntry?.course.teacher
                              ? `${activeEntry.course.teacher} · `
                              : ""}
                            本学科累计专注 {courseFocusMinutes} 分钟
                          </Text>
                        </View>
                        <View className="rounded-full border border-amber-400/40 bg-amber-500/15 px-2.5 py-1">
                          <Text className="text-[10.5px] font-bold text-amber-700 dark:text-amber-300">
                            预计 +{previewReward.coins} 金币
                          </Text>
                        </View>
                      </View>

                      {/* 倒计时主盘 */}
                      <View className="mt-4 items-center py-2">
                        <Text
                          className="text-[46px] font-black tracking-widest text-slate-800 dark:text-white"
                          style={{ fontVariant: ["tabular-nums"] }}
                        >
                          {formatCountdown(remainingSec)}
                        </Text>
                        <Text className="mt-1 text-[11.5px] font-medium text-slate-500 dark:text-slate-400">
                          {running
                            ? "专注进行中 · 完成后自动奖励星露坡金币与作物加速"
                            : hasStarted
                              ? "已暂停 · 可继续专注或提前结算已学时长"
                              : `选择番茄时长，完成 ${presetMin} 分钟可获 +${previewReward.coins} 星露坡金币`}
                        </Text>

                        {/* 进度条 */}
                        <View className="mt-3.5 h-2.5 w-full overflow-hidden rounded-full bg-slate-300/40 dark:bg-white/10">
                          <View
                            className="h-full rounded-full bg-sky-500"
                            style={{ width: `${Math.round(progressRatio * 100)}%` }}
                          />
                        </View>
                      </View>

                      {/* 15 / 25 / 45 预设档位 */}
                      <View className="mt-3 flex-row gap-2">
                        {FOCUS_PRESET_MINUTES.map((mins) => {
                          const selected = presetMin === mins;
                          const est = buildFarmRewardForFocus(mins, activeCourseName);
                          return (
                            <Pressable
                              key={mins}
                              disabled={running}
                              onPress={() => handleSelectPreset(mins)}
                              className={`flex-1 items-center rounded-xl border py-2 ${
                                selected
                                  ? "border-sky-400/75 bg-sky-500/20"
                                  : "border-slate-300/30 bg-white/30 dark:border-white/10 dark:bg-white/[0.04]"
                              } ${running && !selected ? "opacity-40" : ""}`}
                            >
                              <Text
                                className={`text-[13px] font-bold ${
                                  selected
                                    ? "text-sky-700 dark:text-sky-300"
                                    : "text-slate-700 dark:text-slate-200"
                                }`}
                              >
                                {mins} 分钟
                              </Text>
                              <Text className="mt-0.5 text-[10px] text-slate-500 dark:text-slate-400">
                                +{est.coins} 币 · +{est.growthBoostMin}m
                              </Text>
                            </Pressable>
                          );
                        })}
                      </View>

                      {/* 计时控制按钮 */}
                      <View className="mt-4 flex-row gap-2">
                        <Pressable
                          onPress={handleToggleRun}
                          accessibilityRole="button"
                          className={`flex-1 flex-row items-center justify-center rounded-2xl py-3 ${
                            running ? "bg-amber-500" : "bg-sky-500"
                          }`}
                        >
                          <Ionicons
                            name={running ? "pause" : "play"}
                            size={16}
                            color="#FFFFFF"
                          />
                          <Text className="ml-1.5 text-[13.5px] font-bold text-white">
                            {running
                              ? "暂停"
                              : hasStarted
                                ? "继续专注"
                                : "开始专注"}
                          </Text>
                        </Pressable>

                        {hasStarted ? (
                          <>
                            <Pressable
                              onPress={handleFinishEarly}
                              accessibilityRole="button"
                              className="flex-row items-center justify-center rounded-2xl border border-emerald-400/50 bg-emerald-500/15 px-3.5 py-3"
                            >
                              <Ionicons
                                name="checkmark-done"
                                size={16}
                                color="#10B981"
                              />
                              <Text className="ml-1 text-[12.5px] font-bold text-emerald-700 dark:text-emerald-300">
                                提前结算
                              </Text>
                            </Pressable>
                            <Pressable
                              onPress={handleResetTimer}
                              accessibilityRole="button"
                              accessibilityLabel="重置计时"
                              className="items-center justify-center rounded-2xl border border-slate-300/35 bg-white/30 px-3.5 py-3 dark:border-white/10 dark:bg-white/[0.06]"
                            >
                              <Ionicons
                                name="refresh"
                                size={16}
                                color={isDark ? "#CBD5E1" : "#64748B"}
                              />
                            </Pressable>
                          </>
                        ) : null}
                      </View>
                    </View>

                    {/* 专注完成庆祝卡片 */}
                    {celebration ? (
                      <View className="rounded-2xl border border-emerald-400/50 bg-emerald-500/15 p-4">
                        <View className="flex-row items-center">
                          <View className="h-10 w-10 items-center justify-center rounded-2xl bg-emerald-500/20">
                            <Ionicons name="sparkles" size={20} color="#10B981" />
                          </View>
                          <View className="ml-3 flex-1">
                            <Text className="text-[14px] font-extrabold text-emerald-800 dark:text-emerald-200">
                              +{celebration.coins} 星露坡金币 · 已存入农场奖励箱！
                            </Text>
                            <Text className="mt-0.5 text-[11px] text-emerald-700/85 dark:text-emerald-300/85">
                              {celebration.title} · 作物加速 +
                              {celebration.growthBoostMin} 分钟
                            </Text>
                          </View>
                        </View>
                        <View className="mt-3 flex-row gap-2">
                          <Pressable
                            onPress={handleVisitFarm}
                            accessibilityRole="button"
                            className="flex-1 items-center rounded-xl bg-emerald-600 py-2.5"
                          >
                            <Text className="text-[12.5px] font-bold text-white">
                              去星露坡领奖励
                            </Text>
                          </Pressable>
                          <Pressable
                            onPress={() => {
                              selectHaptic();
                              setCelebration(null);
                            }}
                            accessibilityRole="button"
                            className="items-center rounded-xl border border-emerald-500/35 bg-white/40 px-4 py-2.5 dark:bg-white/10"
                          >
                            <Text className="text-[12.5px] font-semibold text-emerald-800 dark:text-emerald-200">
                              继续学习
                            </Text>
                          </Pressable>
                        </View>
                      </View>
                    ) : null}

                    {/* 奖励联动说明 */}
                    <View className="rounded-2xl border border-slate-300/25 bg-white/20 px-4 py-3 dark:border-white/[0.08] dark:bg-white/[0.04]">
                      <View className="flex-row items-center justify-between">
                        <View className="flex-1 pr-3">
                          <Text className="text-[12px] font-bold text-slate-700 dark:text-slate-200">
                            学习奖励闭环
                          </Text>
                          <Text className="mt-0.5 text-[11px] text-slate-500 dark:text-slate-400">
                            完成番茄专注、勾掉作业/复习/考试均会自动掉落星露坡金币，进入农场时自动结算到账。
                          </Text>
                        </View>
                        {pendingFarmRewards.length > 0 ? (
                          <Pressable
                            onPress={handleVisitFarm}
                            className="shrink-0 rounded-full bg-amber-500/20 px-3 py-1.5"
                          >
                            <Text className="text-[11px] font-bold text-amber-700 dark:text-amber-300">
                              去领取 ({pendingFarmRewards.length})
                            </Text>
                          </Pressable>
                        ) : null}
                      </View>
                    </View>
                  </View>
                ) : (
                  /* ---------------- Tab 2: 考勤与缺勤预警 ---------------- */
                  <View className="gap-y-3">
                    {/* 高风险大肥鱼警报横幅 */}
                    {attendanceSummary.riskLevel !== "safe" ? (
                      <View
                        className={`flex-row items-center rounded-2xl border p-3.5 ${
                          attendanceSummary.riskLevel === "danger"
                            ? "border-rose-500/50 bg-rose-500/15"
                            : "border-amber-400/50 bg-amber-500/15"
                        }`}
                      >
                        <WhaleAvatar size={38} variant="dock" />
                        <View className="ml-3 flex-1">
                          <Text
                            className={`text-[12.5px] font-extrabold ${
                              attendanceSummary.riskLevel === "danger"
                                ? "text-rose-700 dark:text-rose-300"
                                : "text-amber-800 dark:text-amber-200"
                            }`}
                          >
                            {attendanceSummary.riskLevel === "danger"
                              ? "大肥鱼紧急警报 · 已触发考勤红线！"
                              : "大肥鱼考勤提醒 · 即将触及红线"}
                          </Text>
                          <Text
                            className={`mt-0.5 text-[11px] leading-4 ${
                              attendanceSummary.riskLevel === "danger"
                                ? "text-rose-700/90 dark:text-rose-200/90"
                                : "text-amber-800/85 dark:text-amber-200/85"
                            }`}
                          >
                            {attendanceSummary.riskLevel === "danger"
                              ? `「${activeCourseName}」已缺勤 ${attendanceSummary.absent} 次（红线 ${attendanceSummary.redline} 次），可能影响平时分或考试资格，下次务必到课并及时与老师沟通！`
                              : `「${activeCourseName}」已缺勤 ${attendanceSummary.absent} 次，距离红线（${attendanceSummary.redline} 次）仅剩 1 次余量，千万别再漏签啦！`}
                          </Text>
                        </View>
                      </View>
                    ) : null}

                    {/* 红线进度卡片 + 可调步进器 */}
                    <View className="rounded-2xl border border-slate-300/35 bg-white/35 p-4 dark:border-white/10 dark:bg-white/[0.06]">
                      <View className="flex-row items-center justify-between">
                        <View className="min-w-0 flex-1 pr-2">
                          <Text
                            numberOfLines={1}
                            className="text-[15px] font-extrabold text-slate-800 dark:text-white"
                          >
                            {activeCourseName}
                          </Text>
                          <Text className="mt-0.5 text-[11px] text-slate-500 dark:text-slate-400">
                            出勤 {attendanceSummary.present} · 请假{" "}
                            {attendanceSummary.leave} · 预计总课次{" "}
                            {attendanceSummary.totalExpected}
                          </Text>
                        </View>
                        <View
                          className={`rounded-full border px-2.5 py-1 ${
                            attendanceSummary.riskLevel === "danger"
                              ? "border-rose-500/45 bg-rose-500/18"
                              : attendanceSummary.riskLevel === "warn"
                                ? "border-amber-400/45 bg-amber-500/18"
                                : "border-emerald-400/40 bg-emerald-500/15"
                          }`}
                        >
                          <Text
                            className={`text-[10.5px] font-bold ${
                              attendanceSummary.riskLevel === "danger"
                                ? "text-rose-700 dark:text-rose-300"
                                : attendanceSummary.riskLevel === "warn"
                                  ? "text-amber-700 dark:text-amber-300"
                                  : "text-emerald-700 dark:text-emerald-300"
                            }`}
                          >
                            {attendanceSummary.riskLevel === "danger"
                              ? "已触红线"
                              : attendanceSummary.riskLevel === "warn"
                                ? "剩余 1 次"
                                : `还可缺 ${attendanceSummary.remainingBeforeRedline} 次`}
                          </Text>
                        </View>
                      </View>

                      <View className="mt-3 flex-row items-baseline justify-between">
                        <Text className="text-[13px] font-bold text-slate-800 dark:text-slate-100">
                          已缺勤 {attendanceSummary.absent} / 红线{" "}
                          {attendanceSummary.redline} 次
                        </Text>
                        <Text className="text-[10.5px] text-slate-500 dark:text-slate-400">
                          默认 1/3 规则：{defaultRedline} 次
                        </Text>
                      </View>

                      <View className="mt-2 h-2.5 w-full overflow-hidden rounded-full bg-slate-300/40 dark:bg-white/10">
                        <View
                          className={`h-full rounded-full ${
                            attendanceSummary.riskLevel === "danger"
                              ? "bg-rose-500"
                              : attendanceSummary.riskLevel === "warn"
                                ? "bg-amber-400"
                                : "bg-emerald-500"
                          }`}
                          style={{ width: `${Math.round(redlineRatio * 100)}%` }}
                        />
                      </View>

                      {/* 红线 ±1 步进器 */}
                      <View className="mt-3.5 flex-row items-center justify-between rounded-xl border border-slate-300/25 bg-white/35 px-3 py-2 dark:border-white/[0.08] dark:bg-white/[0.04]">
                        <View>
                          <Text className="text-[12px] font-semibold text-slate-700 dark:text-slate-200">
                            自定义缺勤红线
                          </Text>
                          <Text className="text-[10px] text-slate-500 dark:text-slate-400">
                            按老师要求手动调整上限
                          </Text>
                        </View>
                        <View className="flex-row items-center gap-2">
                          {customLimit !== undefined ? (
                            <Pressable
                              onPress={() => {
                                selectHaptic();
                                setCustomAbsenceLimit(activeCourseKey, null);
                              }}
                              className="rounded-lg bg-slate-400/15 px-2 py-1 dark:bg-white/10"
                            >
                              <Text className="text-[10px] font-semibold text-slate-600 dark:text-slate-300">
                                恢复默认
                              </Text>
                            </Pressable>
                          ) : null}
                          <Pressable
                            onPress={() => handleStepRedline(-1)}
                            disabled={attendanceSummary.redline <= 1}
                            accessibilityRole="button"
                            accessibilityLabel="减少缺勤红线"
                            className={`h-7 w-7 items-center justify-center rounded-lg bg-slate-400/15 dark:bg-white/10 ${
                              attendanceSummary.redline <= 1 ? "opacity-35" : ""
                            }`}
                          >
                            <Ionicons
                              name="remove"
                              size={15}
                              color={isDark ? "#E2E8F0" : "#334155"}
                            />
                          </Pressable>
                          <Text className="min-w-[26px] text-center text-[13px] font-bold text-slate-800 dark:text-white">
                            {attendanceSummary.redline}
                          </Text>
                          <Pressable
                            onPress={() => handleStepRedline(1)}
                            accessibilityRole="button"
                            accessibilityLabel="增加缺勤红线"
                            className="h-7 w-7 items-center justify-center rounded-lg bg-slate-400/15 dark:bg-white/10"
                          >
                            <Ionicons
                              name="add"
                              size={15}
                              color={isDark ? "#E2E8F0" : "#334155"}
                            />
                          </Pressable>
                        </View>
                      </View>
                    </View>

                    {/* 今日一键打卡按钮 */}
                    <View className="rounded-2xl border border-slate-300/35 bg-white/35 p-3.5 dark:border-white/10 dark:bg-white/[0.06]">
                      <Text className="mb-2.5 text-[12px] font-bold text-slate-700 dark:text-slate-200">
                        今日打卡（{todayIso}）
                      </Text>
                      <View className="flex-row gap-2">
                        {(["present", "leave", "absent"] as const).map(
                          (status) => {
                            const meta = STATUS_META[status];
                            return (
                              <Pressable
                                key={status}
                                onPress={() => handleCheckIn(status)}
                                accessibilityRole="button"
                                className={`flex-1 flex-row items-center justify-center rounded-xl border py-2.5 ${meta.badgeClass}`}
                              >
                                <Ionicons
                                  name={meta.icon}
                                  size={15}
                                  color={meta.color}
                                />
                                <Text
                                  className={`ml-1 text-[12.5px] font-bold ${meta.textClass}`}
                                >
                                  {meta.label}
                                </Text>
                              </Pressable>
                            );
                          },
                        )}
                      </View>
                    </View>

                    {/* 近期打卡记录 */}
                    <View className="rounded-2xl border border-slate-300/35 bg-white/30 p-3.5 dark:border-white/10 dark:bg-white/[0.05]">
                      <Text className="mb-2 text-[12px] font-bold text-slate-700 dark:text-slate-200">
                        近期打卡记录（{records.length}）
                      </Text>
                      {records.length === 0 ? (
                        <View className="items-center py-5">
                          <Ionicons
                            name="calendar-outline"
                            size={22}
                            color="#94A3B8"
                          />
                          <Text className="mt-1.5 text-[11.5px] text-slate-500 dark:text-slate-400">
                            还没有这门课的打卡记录，点上方按钮即可一键记录
                          </Text>
                        </View>
                      ) : (
                        <View className="gap-y-2">
                          {records.slice(0, 30).map((rec) => {
                            const meta = STATUS_META[rec.status];
                            return (
                              <View
                                key={rec.id}
                                className="flex-row items-center justify-between rounded-xl border border-slate-300/25 bg-white/40 px-3 py-2 dark:border-white/[0.08] dark:bg-white/[0.04]"
                              >
                                <View className="flex-row items-center">
                                  <View
                                    className={`rounded-md border px-2 py-0.5 ${meta.badgeClass}`}
                                  >
                                    <Text
                                      className={`text-[10.5px] font-bold ${meta.textClass}`}
                                    >
                                      {meta.shortLabel}
                                    </Text>
                                  </View>
                                  <Text className="ml-2.5 text-[12px] font-semibold text-slate-700 dark:text-slate-200">
                                    {rec.dateIso}
                                  </Text>
                                  {rec.note ? (
                                    <Text
                                      numberOfLines={1}
                                      className="ml-2 max-w-[120px] text-[11px] text-slate-500 dark:text-slate-400"
                                    >
                                      {rec.note}
                                    </Text>
                                  ) : null}
                                </View>
                                <Pressable
                                  onPress={() => {
                                    selectHaptic();
                                    removeAttendanceRecord(
                                      activeCourseKey,
                                      rec.id,
                                    );
                                  }}
                                  accessibilityRole="button"
                                  accessibilityLabel={`删除 ${rec.dateIso} 记录`}
                                  hitSlop={8}
                                  className="h-7 w-7 items-center justify-center rounded-full bg-slate-400/10 dark:bg-white/[0.06]"
                                >
                                  <Ionicons
                                    name="trash-outline"
                                    size={13.5}
                                    color="#94A3B8"
                                  />
                                </Pressable>
                              </View>
                            );
                          })}
                        </View>
                      )}
                    </View>
                  </View>
                )}
              </ScrollView>
            </GlassContainer>
          </Animated.View>
        </View>
      </GlassTargetProvider>
    </Modal>
  );
}
