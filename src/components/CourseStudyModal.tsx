import Ionicons from "@expo/vector-icons/Ionicons";
import { router } from "expo-router";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AppState,
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
import {
  cancelFocusCompletionNotification,
  scheduleFocusCompletionNotification,
} from "@/services/courseReminders";
import { playSfx, type SfxId } from "@/services/soundEffects";
import {
  useStudyProgress,
  type FocusSessionCompletion,
} from "@/store/useStudyProgress";
import type { Course, Schedule } from "@/types";
import {
  selectHaptic,
  successHaptic,
  tapHaptic,
  warnHaptic,
} from "@/utils/haptics";
import {
  FOCUS_PRESET_MINUTES,
  SHORT_BREAK_MINUTES,
  buildFarmRewardForFocus,
  computeAttendanceSummary,
  computeFocusRemainingSec,
  courseIdentityKey,
  formatFocusCountdown,
  getCourseFocusMinutes,
  getCourseSlotsByKey,
  getTodayFocusMinutes,
  listDistinctScheduleCourses,
  type ActiveFocusSession,
  type AttendanceRecord,
  type AttendanceStatus,
  type FocusSessionMode,
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

const AMBIENT_CHIME_NOTES: readonly SfxId[] = [
  "star_note_1",
  "star_note_3",
  "star_note_5",
  "star_note_6",
];
const AMBIENT_CHIME_INTERVAL_MS = 45_000;

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
  const activeFocusSession = useStudyProgress((s) => s.activeFocusSession);
  const recordAttendance = useStudyProgress((s) => s.recordAttendance);
  const removeAttendanceRecord = useStudyProgress(
    (s) => s.removeAttendanceRecord,
  );
  const setCustomAbsenceLimit = useStudyProgress(
    (s) => s.setCustomAbsenceLimit,
  );
  const startFocusSession = useStudyProgress((s) => s.startFocusSession);
  const pauseFocusSession = useStudyProgress((s) => s.pauseFocusSession);
  const resumeFocusSession = useStudyProgress((s) => s.resumeFocusSession);
  const tickOrSyncFocusSession = useStudyProgress(
    (s) => s.tickOrSyncFocusSession,
  );
  const completeActiveFocusSession = useStudyProgress(
    (s) => s.completeActiveFocusSession,
  );
  const clearFocusSession = useStudyProgress((s) => s.clearFocusSession);
  const setFocusAmbient = useStudyProgress((s) => s.setFocusAmbient);
  const setFocusNotificationId = useStudyProgress(
    (s) => s.setFocusNotificationId,
  );

  const { height: winH } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const reducedMotion = useReducedMotion();

  const distinctCourses = useMemo(
    () => listDistinctScheduleCourses(schedule),
    [schedule],
  );

  const activeSessionCourseKey = activeFocusSession?.courseKey ?? null;
  const initialKey = useMemo(() => {
    if (course) return courseIdentityKey(course);
    if (activeSessionCourseKey) return activeSessionCourseKey;
    return distinctCourses[0]?.courseKey ?? "free-study::";
  }, [activeSessionCourseKey, course, distinctCourses]);

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

  /* ---------------- Tab 1: 学科番茄专注（持久化状态） ---------------- */
  const [draftMode, setDraftMode] = useState<FocusSessionMode>("focus");
  const [presetMin, setPresetMin] = useState<number>(25);
  const [draftAmbientOn, setDraftAmbientOn] = useState<boolean>(false);
  const [celebration, setCelebration] = useState<FocusSessionCompletion | null>(
    null,
  );
  const [clockNow, setClockNow] = useState<number>(() => Date.now());
  const ambientNoteIndexRef = useRef(0);

  const sessionMode: FocusSessionMode = activeFocusSession
    ? activeFocusSession.mode
    : draftMode;
  const running = activeFocusSession?.running ?? false;
  const hasStarted = Boolean(activeFocusSession);
  const ambientOn = activeFocusSession
    ? activeFocusSession.ambientOn
    : draftAmbientOn;
  const focusCourseKey = activeFocusSession
    ? activeFocusSession.courseKey
    : activeCourseKey;
  const focusCourseName = activeFocusSession
    ? activeFocusSession.courseName
    : activeCourseName;

  const totalSec = activeFocusSession
    ? Math.max(1, activeFocusSession.totalSec)
    : Math.max(
        1,
        (draftMode === "break" ? SHORT_BREAK_MINUTES : presetMin) * 60,
      );
  const remainingSec = activeFocusSession
    ? computeFocusRemainingSec(activeFocusSession, clockNow)
    : totalSec;
  const progressRatio = Math.min(
    1,
    Math.max(0, (totalSec - remainingSec) / totalSec),
  );

  const courseFocusMinutes = useMemo(
    () => getCourseFocusMinutes(focusLogs, focusCourseKey),
    [focusLogs, focusCourseKey],
  );
  const todayFocusMinutes = useMemo(
    () => getTodayFocusMinutes(focusLogs),
    [focusLogs],
  );
  const previewMinutes =
    activeFocusSession && activeFocusSession.mode === "focus"
      ? Math.max(1, Math.round(activeFocusSession.totalSec / 60))
      : presetMin;
  const previewReward = useMemo(
    () => buildFarmRewardForFocus(previewMinutes, focusCourseName),
    [previewMinutes, focusCourseName],
  );

  const scheduleForSession = useCallback(
    async (session: ActiveFocusSession, prevNotifId?: string | null) => {
      if (prevNotifId) {
        await cancelFocusCompletionNotification(prevNotifId);
      }
      if (!session.running || !session.endAt) return;
      const mins = Math.max(1, Math.round(session.totalSec / 60));
      const title =
        session.mode === "break"
          ? "短休结束 · 准备回到学习"
          : `${session.courseName} 专注完成`;
      const body =
        session.mode === "break"
          ? `${mins} 分钟短休已结束，回来开启下一轮番茄钟吧！`
          : `已完成 ${mins} 分钟专注，doordoor农场 dark币 已存入奖励箱！`;
      const notifId = await scheduleFocusCompletionNotification(
        session.endAt,
        title,
        body,
      );
      if (!notifId) return;
      const latest = useStudyProgress.getState().activeFocusSession;
      if (latest && latest.id === session.id && latest.running) {
        setFocusNotificationId(session.id, notifId);
      } else {
        await cancelFocusCompletionNotification(notifId);
      }
    },
    [setFocusNotificationId],
  );

  const settleActiveSession = useCallback(
    (early = false) => {
      const current = useStudyProgress.getState().activeFocusSession;
      if (!current) return;
      const prevNotifId = current.notificationId;
      const result = completeActiveFocusSession({ early });
      if (!result) return;
      void cancelFocusCompletionNotification(prevNotifId);
      successHaptic();
      playSfx(
        result.mode === "break" ? "whale_ui_ripple" : "star_constellation",
        {
          volume: result.mode === "break" ? 0.45 : 0.56,
          ignoreCooldown: true,
          bypassToggle: true,
        },
      );
      setCelebration(result);
    },
    [completeActiveFocusSession],
  );

  const activeSessionId = activeFocusSession?.id ?? null;

  useEffect(() => {
    if (!activeSessionId) return;
    const syncOnce = () => {
      const now = Date.now();
      setClockNow(now);
      const synced = tickOrSyncFocusSession(now);
      if (synced.completed) {
        settleActiveSession(false);
      }
    };
    const initTimer = setTimeout(syncOnce, 0);
    const interval = running ? setInterval(syncOnce, 500) : null;
    const sub = AppState.addEventListener("change", (state) => {
      if (state === "active") syncOnce();
    });
    return () => {
      clearTimeout(initTimer);
      if (interval) clearInterval(interval);
      sub.remove();
    };
  }, [activeSessionId, running, settleActiveSession, tickOrSyncFocusSession]);

  // 轻音伴读：专注/短休运行期间每 45 秒播放柔和星铃提示音，停止或卸载时自动清理
  useEffect(() => {
    if (!running || !ambientOn) return;
    const timer = setInterval(() => {
      const note =
        AMBIENT_CHIME_NOTES[
          ambientNoteIndexRef.current % AMBIENT_CHIME_NOTES.length
        ];
      ambientNoteIndexRef.current += 1;
      playSfx(note, {
        volume: 0.2,
        ignoreCooldown: true,
        bypassToggle: true,
      });
    }, AMBIENT_CHIME_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [running, ambientOn]);

  const handleSelectMode = (nextMode: FocusSessionMode) => {
    if (hasStarted) return;
    selectHaptic();
    setDraftMode(nextMode);
    setCelebration(null);
  };

  const handleSelectPreset = (minutes: number) => {
    if (hasStarted) return;
    selectHaptic();
    setDraftMode("focus");
    setPresetMin(minutes);
    setCelebration(null);
  };

  const handleToggleAmbient = () => {
    selectHaptic();
    const next = !ambientOn;
    setDraftAmbientOn(next);
    if (activeFocusSession) {
      setFocusAmbient(next);
    }
    if (next) {
      playSfx("star_note_3", {
        volume: 0.26,
        ignoreCooldown: true,
        bypassToggle: true,
      });
    }
  };

  const handleToggleRun = () => {
    tapHaptic();
    setCelebration(null);
    if (activeFocusSession) {
      if (activeFocusSession.running) {
        const prevNotifId = activeFocusSession.notificationId;
        pauseFocusSession();
        void cancelFocusCompletionNotification(prevNotifId);
      } else {
        const resumed = resumeFocusSession();
        if (resumed) {
          setClockNow(Date.now());
          void scheduleForSession(resumed);
        }
      }
      return;
    }

    const durationMinutes =
      draftMode === "break" ? SHORT_BREAK_MINUTES : presetMin;
    const started = startFocusSession({
      mode: draftMode,
      course: activeEntry?.course ?? activeCourseKey,
      courseName: activeCourseName,
      durationMinutes,
      ambientOn: draftAmbientOn,
    });
    setClockNow(started.startedAt);
    if (started.ambientOn) {
      playSfx("star_note_1", {
        volume: 0.24,
        ignoreCooldown: true,
        bypassToggle: true,
      });
    }
    void scheduleForSession(started);
  };

  const handleStartShortBreak = () => {
    tapHaptic();
    const prev = clearFocusSession();
    setCelebration(null);
    setDraftMode("break");
    const started = startFocusSession({
      mode: "break",
      course: activeEntry?.course ?? activeCourseKey,
      courseName: activeCourseName,
      durationMinutes: SHORT_BREAK_MINUTES,
      ambientOn: draftAmbientOn,
    });
    setClockNow(started.startedAt);
    void scheduleForSession(started, prev?.notificationId);
  };

  const handleResetTimer = () => {
    selectHaptic();
    const prev = clearFocusSession();
    void cancelFocusCompletionNotification(prev?.notificationId);
    setCelebration(null);
  };

  const handleFinishEarly = () => {
    settleActiveSession(true);
  };

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
                      const isSel =
                        tab === "focus" && activeFocusSession
                          ? item.courseKey === focusCourseKey
                          : item.courseKey === activeCourseKey;
                      const lockedByFocus = tab === "focus" && hasStarted;
                      const itemSummary = computeAttendanceSummary(
                        item.slots,
                        attendanceByCourse[item.courseKey],
                        customAbsenceLimits[item.courseKey],
                      );
                      return (
                        <Pressable
                          key={item.courseKey}
                          disabled={lockedByFocus}
                          onPress={() => {
                            selectHaptic();
                            setManualKey(item.courseKey);
                            setCelebration(null);
                          }}
                          className={`flex-row items-center rounded-full border px-3 py-1.5 ${
                            isSel
                              ? "border-sky-400/75 bg-sky-500/20"
                              : "border-slate-300/35 bg-white/30 dark:border-white/10 dark:bg-white/[0.05]"
                          } ${lockedByFocus && !isSel ? "opacity-45" : ""}`}
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
                          <View className="flex-row items-center gap-1.5">
                            <Text
                              numberOfLines={1}
                              className="shrink text-[15px] font-extrabold text-slate-800 dark:text-white"
                            >
                              {focusCourseName}
                            </Text>
                            {hasStarted ? (
                              <View
                                className={`shrink-0 rounded-full px-2 py-0.5 ${
                                  running
                                    ? sessionMode === "break"
                                      ? "bg-emerald-500/20"
                                      : "bg-sky-500/20"
                                    : "bg-amber-500/20"
                                }`}
                              >
                                <Text
                                  className={`text-[9.5px] font-bold ${
                                    running
                                      ? sessionMode === "break"
                                        ? "text-emerald-700 dark:text-emerald-300"
                                        : "text-sky-700 dark:text-sky-300"
                                      : "text-amber-700 dark:text-amber-300"
                                  }`}
                                >
                                  {running
                                    ? sessionMode === "break"
                                      ? "短休中"
                                      : "专注中"
                                    : "已暂停"}
                                </Text>
                              </View>
                            ) : null}
                          </View>
                          <Text className="mt-0.5 text-[11px] text-slate-500 dark:text-slate-400">
                            {!activeFocusSession && activeEntry?.course.teacher
                              ? `${activeEntry.course.teacher} · `
                              : ""}
                            本学科累计专注 {courseFocusMinutes} 分钟
                          </Text>
                        </View>
                        {sessionMode === "focus" ? (
                          <View className="rounded-full border border-amber-400/40 bg-amber-500/15 px-2.5 py-1">
                            <Text className="text-[10.5px] font-bold text-amber-700 dark:text-amber-300">
                              预计 +{previewReward.coins} dark币
                            </Text>
                          </View>
                        ) : (
                          <View className="rounded-full border border-emerald-400/40 bg-emerald-500/15 px-2.5 py-1">
                            <Text className="text-[10.5px] font-bold text-emerald-700 dark:text-emerald-300">
                              放松充能
                            </Text>
                          </View>
                        )}
                      </View>

                      {/* 模式切换（专注 / 5分钟短休） + 轻音伴读开关 */}
                      <View className="mt-3 flex-row items-center justify-between gap-2">
                        <View className="flex-1 flex-row rounded-xl border border-slate-300/30 bg-white/30 p-0.5 dark:border-white/10 dark:bg-white/[0.04]">
                          {(
                            [
                              ["focus", "专注番茄", "flame-outline"],
                              ["break", "5分钟短休", "cafe-outline"],
                            ] as const
                          ).map(([modeKey, label, icon]) => {
                            const active = sessionMode === modeKey;
                            return (
                              <Pressable
                                key={modeKey}
                                disabled={hasStarted}
                                onPress={() => handleSelectMode(modeKey)}
                                className={`flex-1 flex-row items-center justify-center rounded-lg py-1.5 ${
                                  active
                                    ? modeKey === "break"
                                      ? "bg-emerald-500/90"
                                      : "bg-sky-500/90"
                                    : "bg-transparent"
                                } ${hasStarted && !active ? "opacity-40" : ""}`}
                              >
                                <Ionicons
                                  name={icon}
                                  size={12}
                                  color={
                                    active
                                      ? "#FFFFFF"
                                      : isDark
                                        ? "#94A3B8"
                                        : "#64748B"
                                  }
                                />
                                <Text
                                  className={`ml-1 text-[11px] font-bold ${
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

                        <Pressable
                          onPress={handleToggleAmbient}
                          accessibilityRole="switch"
                          accessibilityState={{ checked: ambientOn }}
                          accessibilityLabel="轻音伴读开关"
                          className={`flex-row items-center rounded-xl border px-2.5 py-1.5 ${
                            ambientOn
                              ? "border-violet-400/60 bg-violet-500/20"
                              : "border-slate-300/30 bg-white/30 dark:border-white/10 dark:bg-white/[0.04]"
                          }`}
                        >
                          <Ionicons
                            name={
                              ambientOn
                                ? "musical-notes"
                                : "volume-mute-outline"
                            }
                            size={13}
                            color={
                              ambientOn
                                ? isDark
                                  ? "#C4B5FD"
                                  : "#7C3AED"
                                : isDark
                                  ? "#94A3B8"
                                  : "#64748B"
                            }
                          />
                          <Text
                            className={`ml-1 text-[10.5px] font-semibold ${
                              ambientOn
                                ? "text-violet-700 dark:text-violet-300"
                                : "text-slate-500 dark:text-slate-400"
                            }`}
                          >
                            {ambientOn ? "轻音开" : "轻音关"}
                          </Text>
                        </Pressable>
                      </View>

                      {/* 倒计时主盘 */}
                      <View className="mt-4 items-center py-2">
                        <Text
                          className="text-[46px] font-black tracking-widest text-slate-800 dark:text-white"
                          style={{ fontVariant: ["tabular-nums"] }}
                        >
                          {formatFocusCountdown(remainingSec)}
                        </Text>
                        <Text className="mt-1 text-center text-[11.5px] font-medium text-slate-500 dark:text-slate-400">
                          {sessionMode === "break"
                            ? running
                              ? "短休进行中 · 关闭弹窗也会继续计时并在结束时提醒"
                              : hasStarted
                                ? "短休已暂停 · 可继续休息或提前结束"
                                : "5 分钟短休 · 眺望远方、舒展肩颈再投入下一轮"
                            : running
                              ? "专注进行中 · 关闭弹窗或切后台仍精准计时，完成即得 dark币"
                              : hasStarted
                                ? "已暂停 · 关闭弹窗会保留进度，可继续专注或提前结算"
                                : `选择番茄时长，完成 ${presetMin} 分钟可获 +${previewReward.coins} dark币`}
                        </Text>

                        {/* 进度条 */}
                        <View className="mt-3.5 h-2.5 w-full overflow-hidden rounded-full bg-slate-300/40 dark:bg-white/10">
                          <View
                            className={`h-full rounded-full ${
                              sessionMode === "break"
                                ? "bg-emerald-500"
                                : "bg-sky-500"
                            }`}
                            style={{ width: `${Math.round(progressRatio * 100)}%` }}
                          />
                        </View>
                      </View>

                      {/* 15 / 25 / 45 预设档位（仅专注模式显示） */}
                      {sessionMode === "focus" ? (
                        <View className="mt-3 flex-row gap-2">
                          {FOCUS_PRESET_MINUTES.map((mins) => {
                            const selected =
                              (activeFocusSession
                                ? Math.round(activeFocusSession.totalSec / 60)
                                : presetMin) === mins;
                            const est = buildFarmRewardForFocus(
                              mins,
                              focusCourseName,
                            );
                            return (
                              <Pressable
                                key={mins}
                                disabled={hasStarted}
                                onPress={() => handleSelectPreset(mins)}
                                className={`flex-1 items-center rounded-xl border py-2 ${
                                  selected
                                    ? "border-sky-400/75 bg-sky-500/20"
                                    : "border-slate-300/30 bg-white/30 dark:border-white/10 dark:bg-white/[0.04]"
                                } ${hasStarted && !selected ? "opacity-40" : ""}`}
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
                                  +{est.coins} dark币 · +{est.growthBoostMin}m
                                </Text>
                              </Pressable>
                            );
                          })}
                        </View>
                      ) : null}

                      {/* 计时控制按钮 */}
                      <View className="mt-4 flex-row gap-2">
                        <Pressable
                          onPress={handleToggleRun}
                          accessibilityRole="button"
                          className={`flex-1 flex-row items-center justify-center rounded-2xl py-3 ${
                            running
                              ? "bg-amber-500"
                              : sessionMode === "break"
                                ? "bg-emerald-500"
                                : "bg-sky-500"
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
                                ? sessionMode === "break"
                                  ? "继续短休"
                                  : "继续专注"
                                : sessionMode === "break"
                                  ? "开始 5 分钟短休"
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
                                {sessionMode === "break" ? "结束短休" : "提前结算"}
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

                    {/* 专注 / 短休完成庆祝卡片 */}
                    {celebration ? (
                      <View className="rounded-2xl border border-emerald-400/50 bg-emerald-500/15 p-4">
                        {celebration.mode === "focus" && celebration.reward ? (
                          <>
                            <View className="flex-row items-center">
                              <View className="h-10 w-10 items-center justify-center rounded-2xl bg-emerald-500/20">
                                <Ionicons
                                  name="sparkles"
                                  size={20}
                                  color="#10B981"
                                />
                              </View>
                              <View className="ml-3 flex-1">
                                <Text className="text-[14px] font-extrabold text-emerald-800 dark:text-emerald-200">
                                  +{celebration.reward.coins} dark币 · 已存入农场奖励箱！
                                </Text>
                                <Text className="mt-0.5 text-[11px] text-emerald-700/85 dark:text-emerald-300/85">
                                  {celebration.reward.title} · 作物加速 +
                                  {celebration.reward.growthBoostMin} 分钟
                                </Text>
                              </View>
                            </View>
                            <View className="mt-3 flex-row gap-2">
                              <Pressable
                                onPress={handleStartShortBreak}
                                accessibilityRole="button"
                                className="flex-1 flex-row items-center justify-center rounded-xl bg-teal-600 py-2.5"
                              >
                                <Ionicons
                                  name="cafe-outline"
                                  size={14}
                                  color="#FFFFFF"
                                />
                                <Text className="ml-1 text-[12px] font-bold text-white">
                                  5分钟短休
                                </Text>
                              </Pressable>
                              <Pressable
                                onPress={handleVisitFarm}
                                accessibilityRole="button"
                                className="flex-1 items-center justify-center rounded-xl bg-emerald-600 py-2.5"
                              >
                                <Text className="text-[12px] font-bold text-white">
                                  去doordoor农场领奖
                                </Text>
                              </Pressable>
                              <Pressable
                                onPress={() => {
                                  selectHaptic();
                                  setCelebration(null);
                                }}
                                accessibilityRole="button"
                                className="items-center justify-center rounded-xl border border-emerald-500/35 bg-white/40 px-3 py-2.5 dark:bg-white/10"
                              >
                                <Text className="text-[12px] font-semibold text-emerald-800 dark:text-emerald-200">
                                  继续
                                </Text>
                              </Pressable>
                            </View>
                          </>
                        ) : (
                          <>
                            <View className="flex-row items-center">
                              <View className="h-10 w-10 items-center justify-center rounded-2xl bg-teal-500/20">
                                <Ionicons
                                  name="cafe-outline"
                                  size={20}
                                  color="#14B8A6"
                                />
                              </View>
                              <View className="ml-3 flex-1">
                                <Text className="text-[14px] font-extrabold text-emerald-800 dark:text-emerald-200">
                                  短休完成 · 精力已充能！
                                </Text>
                                <Text className="mt-0.5 text-[11px] text-emerald-700/85 dark:text-emerald-300/85">
                                  已放松 {celebration.minutes} 分钟，准备开启下一轮「
                                  {celebration.courseName}」专注吧
                                </Text>
                              </View>
                            </View>
                            <View className="mt-3 flex-row gap-2">
                              <Pressable
                                onPress={() => {
                                  selectHaptic();
                                  setDraftMode("focus");
                                  setCelebration(null);
                                }}
                                accessibilityRole="button"
                                className="flex-1 items-center rounded-xl bg-sky-500 py-2.5"
                              >
                                <Text className="text-[12.5px] font-bold text-white">
                                  回到番茄专注
                                </Text>
                              </Pressable>
                            </View>
                          </>
                        )}
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
                            完成番茄专注、勾掉作业/复习/考试均会自动掉落 dark币，进入doordoor农场时自动结算到账。
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
