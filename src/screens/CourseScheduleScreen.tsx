import Ionicons from "@expo/vector-icons/Ionicons";
import { router } from "expo-router";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Alert,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  Text,
  View,
  useWindowDimensions,
  type ScrollViewInstance,
  type StyleProp,
  type ViewStyle,
} from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, {
  Easing,
  FadeIn,
  FadeInDown,
  FadeOut,
  runOnJS,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withSpring,
  withTiming,
} from "react-native-reanimated";

import { ActionBar, type ActionItem } from "@/components/ActionBar";
import { AfterHours, type AfterHoursKind } from "@/components/AfterHours";
import { Backdrop } from "@/components/Backdrop";
import { CourseCard, EmptySlotCard } from "@/components/CourseCard";
import { CourseEditorPanel } from "@/components/CourseEditorPanel";
import {
  GlassContainer,
  GlassTargetProvider,
} from "@/components/GlassContainer";
import { NightSky } from "@/components/NightSky";
import { WeekGrid } from "@/components/WeekGrid";
import { WhaleAvatar } from "@/components/WhaleAvatar";
import { GravityBadge, GravityCard } from "@/components/ZeroG";
import { WEEKDAY_LABELS } from "@/constants/palette";
import { useForegroundClock } from "@/hooks/useForegroundClock";
import {
  undoSchedulePreview,
  useLastScheduleChange,
  type ScheduleChange,
} from "@/services/assistantSchedule";
import {
  openCourseAlarm,
  openCourseCalendar,
} from "@/services/systemCourseReminders";
import { useSettings } from "@/store/useSettings";
import { useActiveSchedule, useStore } from "@/store/useStore";
import { useWhaleMemory } from "@/store/useWhaleMemory";
import { useWhalePet } from "@/store/useWhalePet";
import type { Course } from "@/types";
import { upcomingWidgetCourses } from "@/utils/courseWidget";
import { selectHaptic, thumpHaptic } from "@/utils/haptics";
import { playSfx, playStarScaleNote } from "@/services/soundEffects";
import {
  addDays,
  countDistinctCourses,
  findConflicts,
  formatClock,
  getCourseTime,
  getDateInfo,
  getSemesterStatus,
  isCourseActive,
  isCourseFinished,
  mondayOf,
  parseIsoDate,
} from "@/utils/time";

type ViewMode = "day" | "week";

export interface CourseScheduleScreenProps {
  /** 打开 AI 识图导入 */
  onImport: () => void;
  /** 打开课程表助手 */
  onAssistant: () => void;
  /** 打开成绩 */
  onGrades: () => void;
  /** 打开设置 */
  onSettings: () => void;
  /** 通往星露坡的小径（隐藏） */
  onFarm?: () => void;
  /** 外部控制的主题层容器样式 */
  style?: StyleProp<ViewStyle>;
}

function formatMinutesDelta(mins: number): string {
  if (mins >= 60) {
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    return m ? `${h}时${m}分` : `${h}小时`;
  }
  return `${mins}分`;
}

export function CourseScheduleScreen({
  onImport,
  onAssistant,
  onGrades,
  onSettings,
  onFarm,
  style,
}: CourseScheduleScreenProps) {
  const schedule = useActiveSchedule();
  const lastChange = useLastScheduleChange((s) => s.change);
  const lastChangeLabel = useLastScheduleChange((s) => s.label);
  const [undoChoice, setUndoChoice] = useState<ScheduleChange | null>(null);
  const [undoFailed, setUndoFailed] = useState<ScheduleChange | null>(null);
  const schedules = useStore((s) => s.schedules);
  const activeScheduleId = useStore((s) => s.activeScheduleId);
  const setActiveSchedule = useStore((s) => s.setActiveSchedule);
  const addCourse = useStore((s) => s.addCourse);
  const updateCourse = useStore((s) => s.updateCourse);
  const removeCourse = useStore((s) => s.removeCourse);
  const removeCourseOnce = useStore((s) => s.removeCourseOnce);

  // 持久化的课表展示偏好
  const defaultScheduleView = useSettings((s) => s.defaultScheduleView);
  const setDefaultScheduleView = useSettings((s) => s.setDefaultScheduleView);
  const showWeekend = useSettings((s) => s.showWeekend);
  const showOtherWeeks = useSettings((s) => s.showOtherWeeks);
  const compactWeekGrid = useSettings((s) => s.compactWeekGrid);
  const reminderMinutes = useSettings((s) => s.reminderMinutes);
  const reducedMotion = useReducedMotion();

  const now = useForegroundClock();
  const dateInfo = useMemo(
    () => getDateInfo(schedule.startDate, now),
    [schedule.startDate, now],
  );
  const semesterStatus = useMemo(
    () => getSemesterStatus(schedule, now),
    [schedule, now],
  );

  const [weekIndex, setWeekIndex] = useState(semesterStatus.clampedWeek);
  const [dayState, setDayState] = useState(() => ({
    weekday: dateInfo.weekday,
    dir: 0,
  }));
  const weekday = dayState.weekday;
  const setWeekday = useCallback((nextDay: number) => {
    setDayState((prev) => ({
      weekday: nextDay,
      dir: nextDay === prev.weekday ? 0 : nextDay > prev.weekday ? 1 : -1,
    }));
  }, []);
  // 直接以持久化的 defaultScheduleView 作为单一事实来源，冷启动水合与设置页修改即时同步
  const mode: ViewMode = defaultScheduleView;
  const setMode = setDefaultScheduleView;

  const totalWeeks = semesterStatus.totalWeeks;
  const activeWeek = Math.min(Math.max(weekIndex, 1), totalWeeks);

  // 跨零点自动推进：若用户原本停留在昨天的真实日期，跨入新一天后自动跟进
  const prevTodayRef = useRef({
    iso: semesterStatus.todayIso,
    week: semesterStatus.clampedWeek,
    day: dateInfo.weekday,
  });
  useEffect(() => {
    const prev = prevTodayRef.current;
    if (prev.iso !== semesterStatus.todayIso) {
      if (activeWeek === prev.week && weekday === prev.day) {
        setWeekIndex(semesterStatus.clampedWeek);
        setWeekday(dateInfo.weekday);
      }
      prevTodayRef.current = {
        iso: semesterStatus.todayIso,
        week: semesterStatus.clampedWeek,
        day: dateInfo.weekday,
      };
    }
  }, [
    activeWeek,
    dateInfo.weekday,
    semesterStatus.clampedWeek,
    semesterStatus.todayIso,
    setWeekday,
    weekday,
  ]);

  const [editorOpen, setEditorOpen] = useState(false);
  const [editing, setEditing] = useState<Course | undefined>(undefined);
  const [editorInitialDraft, setEditorInitialDraft] = useState<
    Partial<Omit<Course, "id">> | undefined
  >(undefined);
  const [editorInitialException, setEditorInitialException] = useState(false);
  const [editorToken, setEditorToken] = useState(0);
  const [quickCourse, setQuickCourse] = useState<Course | null>(null);
  const [switcherOpen, setSwitcherOpen] = useState(false);
  const [nightOpen, setNightOpen] = useState(false);
  const [afterHours, setAfterHours] = useState<AfterHoursKind | null>(null);

  // 第二个彩蛋：静默触发
  const [gravityToken, setGravityToken] = useState(0);
  const [gravityOff, setGravityOff] = useState(false);
  const gravityTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleWeekTitleLongPress = () => {
    thumpHaptic();
    playSfx("zero_g", { volume: 0.72, ignoreCooldown: true });
    setGravityToken((t) => t + 1);
    setGravityOff(true);
    if (gravityTimer.current) clearTimeout(gravityTimer.current);
    gravityTimer.current = setTimeout(() => setGravityOff(false), 2400);
  };

  // 彩蛋入口：静默累计点击
  const [secretCharge, setSecretCharge] = useState(0);
  const tapsRef = useRef<number[]>([]);
  const chargeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleClockTap = () => {
    const t = Date.now();
    tapsRef.current = tapsRef.current.filter((item) => t - item < 5000);
    tapsRef.current.push(t);
    const count = tapsRef.current.length;
    setSecretCharge(Math.min(count, 7));
    selectHaptic();
    if (chargeTimer.current) clearTimeout(chargeTimer.current);
    chargeTimer.current = setTimeout(() => {
      tapsRef.current = [];
      setSecretCharge(0);
    }, 3000);
    if (count >= 7) {
      if (chargeTimer.current) clearTimeout(chargeTimer.current);
      tapsRef.current = [];
      setSecretCharge(0);
      thumpHaptic();
      playSfx("star_constellation", { volume: 0.72, ignoreCooldown: true });
      setNightOpen(true);
    } else {
      playStarScaleNote(count - 1, {
        volume: 0.62,
      });
    }
  };

  useEffect(
    () => () => {
      if (chargeTimer.current) clearTimeout(chargeTimer.current);
      if (gravityTimer.current) clearTimeout(gravityTimer.current);
    },
    [],
  );

  const isCurrentRealWeek =
    semesterStatus.phase === "active" && activeWeek === dateInfo.weekIndex;
  const isViewingRealToday =
    isCurrentRealWeek && weekday === dateInfo.weekday;
  const showBackToToday =
    activeWeek !== semesterStatus.clampedWeek ||
    (mode === "day" && weekday !== dateInfo.weekday);

  const jumpToToday = () => {
    selectHaptic();
    setWeekIndex(semesterStatus.clampedWeek);
    setWeekday(dateInfo.weekday);
  };

  /** 横向周次条自动滚到当前选中周居中 */
  const { width: winW, height: winH } = useWindowDimensions();
  const weekScrollRef = useRef<ScrollViewInstance>(null);
  useEffect(() => {
    // 每颗周次胶囊约 32px + 6px 间距 = 38px，左右内边距 20px
    const x = Math.max(0, (activeWeek - 1) * 38 + 20 - winW / 2 + 16);
    const id = setTimeout(() => {
      weekScrollRef.current?.scrollTo({ x, animated: !reducedMotion });
    }, 40);
    return () => clearTimeout(id);
  }, [activeWeek, winW, reducedMotion]);

  const viewDay = mode === "week" ? 1 : weekday;
  const viewDate = useMemo(
    () =>
      addDays(
        mondayOf(parseIsoDate(schedule.startDate)),
        (activeWeek - 1) * 7 + (viewDay - 1),
      ),
    [schedule.startDate, activeWeek, viewDay],
  );
  const viewDateLabel = `${viewDate.getMonth() + 1}月${viewDate.getDate()}日`;
  const viewWeekdayLabel = WEEKDAY_LABELS[viewDay - 1];

  // 冲突检测：同天、时间重叠、且当前周同时上课的课程互相标记
  const conflicts = useMemo(
    () => findConflicts(schedule.courses, activeWeek, schedule.periods),
    [schedule.courses, activeWeek, schedule.periods],
  );

  // 日视图课程按真实开始分钟稳定排序（同节次不同精确时间顺序明确）
  const dayCourses = useMemo(
    () =>
      schedule.courses
        .filter((c) => c.weekday === weekday && c.weeks.includes(activeWeek))
        .sort((a, b) => {
          const ta = getCourseTime(schedule.periods, a.startPeriod, a.endPeriod, a);
          const tb = getCourseTime(schedule.periods, b.startPeriod, b.endPeriod, b);
          return (
            ta.startMinutes - tb.startMinutes ||
            ta.endMinutes - tb.endMinutes ||
            a.startPeriod - b.startPeriod
          );
        }),
    [schedule.courses, schedule.periods, weekday, activeWeek],
  );

  /* ---------------- 日视图：左右滑动切换星期 ---------------- */
  const liftDistance = Math.round(Math.min(winH * 0.07, 64));
  const dayTx = useSharedValue(0);
  const winWRef = useRef(winW);
  useEffect(() => {
    winWRef.current = winW;
  }, [winW]);

  const goToDay = useCallback(
    (day: number, week: number | undefined, dir: number) => {
      if (week !== undefined) setWeekIndex(week);
      setDayState({ weekday: day, dir });
    },
    [],
  );

  const dayGesture = useMemo(
    () =>
      Gesture.Pan()
        .activeOffsetX([-20, 20])
        .failOffsetY([-12, 12])
        .onUpdate((e) => {
          let t = e.translationX;
          const atStart = weekday === 1 && activeWeek <= 1;
          const atEnd = weekday === 7 && activeWeek >= totalWeeks;
          if ((atStart && t > 0) || (atEnd && t < 0)) t *= 0.25;
          dayTx.set(t);
        })
        .onEnd((e, success) => {
          if (!success) {
            dayTx.set(
              withSpring(0, { damping: 26, stiffness: 240, mass: 1 }),
            );
            return;
          }
          const fast = Math.abs(e.velocityX) > 500;
          const dir = fast
            ? e.velocityX < 0
              ? 1
              : -1
            : e.translationX < 0
              ? 1
              : -1;
          const next = weekday + dir;
          let target = 0;
          let targetWeek: number | undefined;
          if (next >= 1 && next <= 7) {
            target = next;
          } else if (next === 8 && activeWeek < totalWeeks) {
            target = 1;
            targetWeek = activeWeek + 1;
          } else if (next === 0 && activeWeek > 1) {
            target = 7;
            targetWeek = activeWeek - 1;
          }
          const go = (Math.abs(e.translationX) > 60 || fast) && target > 0;
          if (go) {
            if (reducedMotion) {
              dayTx.set(0);
              runOnJS(goToDay)(target, targetWeek, dir);
            } else {
              dayTx.set(
                withTiming(-dir * winW, { duration: 170 }, (fin) => {
                  if (fin) runOnJS(goToDay)(target, targetWeek, dir);
                }),
              );
            }
          } else {
            dayTx.set(
              withSpring(0, {
                damping: 26,
                stiffness: 240,
                mass: 1,
              }),
            );
          }
        }),
    [weekday, activeWeek, totalWeeks, winW, dayTx, goToDay, reducedMotion],
  );

  useEffect(() => {
    if (mode !== "day" || dayState.dir === 0 || reducedMotion) {
      dayTx.set(0);
      return;
    }
    dayTx.set(dayState.dir * winWRef.current);
    dayTx.set(
      withTiming(0, {
        duration: 200,
        easing: Easing.out(Easing.cubic),
      }),
    );
  }, [dayState, mode, reducedMotion, dayTx]);

  const daySlideStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: dayTx.value }],
  }));

  const openCreate = useCallback(
    (initial?: Partial<Omit<Course, "id">>) => {
      setEditing(undefined);
      setEditorInitialException(false);
      setEditorInitialDraft({
        weekday,
        ...initial,
      });
      setEditorToken((t) => t + 1);
      setEditorOpen(true);
    },
    [weekday],
  );

  const openEdit = useCallback((course: Course, exception = false) => {
    setEditing(course);
    setEditorInitialDraft(undefined);
    setEditorInitialException(exception);
    setEditorToken((t) => t + 1);
    setEditorOpen(true);
  }, []);

  const openQuickActions = useCallback((course: Course) => {
    selectHaptic();
    setQuickCourse(course);
  }, []);

  const handleSave = (
    draft: Omit<Course, "id"> & { id?: string },
    targetWeeks?: number[],
  ) => {
    try {
      if (draft.id) {
        const { id, ...patch } = draft;
        updateCourse(id, patch, targetWeeks);
      } else {
        addCourse(draft);
      }
      setEditorOpen(false);
      setEditing(undefined);
    } catch (error) {
      Alert.alert(
        "保存失败",
        error instanceof Error ? error.message : "课程数据无效",
      );
    }
  };

  /** 快速将某门课的下一次上课推送到系统闹钟或系统日历（Android） */
  const pushQuickSystemReminder = async (
    course: Course,
    kind: "alarm" | "calendar",
  ) => {
    setQuickCourse(null);
    const nextOcc = upcomingWidgetCourses(
      { ...schedule, courses: [course] },
      new Date(),
    ).find((occ) => occ.start > Date.now());
    if (!nextOcc) {
      Alert.alert("暂无待上课时", "这门课本学期已没有后续上课安排。");
      return;
    }
    try {
      if (kind === "alarm") {
        await openCourseAlarm(nextOcc, reminderMinutes);
      } else {
        await openCourseCalendar(nextOcc, reminderMinutes);
      }
    } catch (error) {
      Alert.alert(
        kind === "alarm" ? "无法设置系统闹钟" : "无法打开系统日历",
        error instanceof Error ? error.message : "请检查系统应用与权限后重试",
      );
    }
  };

  const whaleActive = useWhaleMemory((s) => s.active);
  const petVisible = useWhalePet((s) => s.visible);
  const whaleMode = whaleActive || petVisible;

  const actions: ActionItem[] = [
    {
      key: "add",
      icon: "add-circle-outline",
      label: "添加",
      onPress: () => openCreate(),
    },
    {
      key: "import",
      icon: "sparkles",
      label: "导入",
      onPress: onImport,
    },
    {
      key: "assistant",
      icon: "chatbubble-ellipses",
      label: "助手",
      primary: true,
      onPress: onAssistant,
      iconNode: whaleMode ? <WhaleAvatar size={44} variant="dock" /> : undefined,
    },
    { key: "grades", icon: "school", label: "成绩", onPress: onGrades },
    { key: "settings", icon: "options", label: "设置", onPress: onSettings },
  ];

  const nowMinutes = now.getHours() * 60 + now.getMinutes();

  const semesterBadge =
    semesterStatus.phase === "before"
      ? semesterStatus.daysUntilStart > 0
        ? `距开学 ${semesterStatus.daysUntilStart} 天`
        : "即将开学"
      : semesterStatus.phase === "after"
        ? "已放假"
        : "";

  return (
    <View className="flex-1" style={style}>
      <Backdrop>
        {/* ---------- 顶部：日期 + 周次 + 回今天 + 视图切换 ---------- */}
        <View className="px-5 pb-0.5 pt-1">
          {lastChange ? (
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
                        if (!undoSchedulePreview(lastChange))
                          setUndoFailed(lastChange);
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
                    onPress={() => setSwitcherOpen(true)}
                    onLongPress={() => setAfterHours("platform")}
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
                  onLongPress={handleWeekTitleLongPress}
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
                      onPress={jumpToToday}
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
                        onPress={() => setMode(key)}
                        onLongPress={() => setAfterHours("permission")}
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
                  borderOpacity={0.2 + secretCharge * 0.015}
                >
                  <Pressable
                    onPress={handleClockTap}
                    className="flex-row items-center px-2.5 py-1.5"
                  >
                    <Ionicons
                      name="time-outline"
                      size={12}
                      color={secretCharge >= 4 ? "#7DD3FC" : "#38BDF8"}
                    />
                    <Text
                      numberOfLines={1}
                      className={`ml-1 text-[11px] font-semibold ${
                        secretCharge >= 4
                          ? "text-sky-500 dark:text-sky-300"
                          : "text-slate-600 dark:text-slate-300"
                      }`}
                    >
                      {formatClock(now)}
                    </Text>
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
              const isNow =
                semesterStatus.phase === "active" && w === dateInfo.weekIndex;
              const isSel = w === activeWeek;
              return (
                <Pressable key={w} onPress={() => setWeekIndex(w)}>
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

        {/* ---------- 星期选择（仅日视图） ---------- */}
        {mode === "day" ? (
          <Animated.View
            entering={
              reducedMotion
                ? undefined
                : FadeInDown.delay(90)
                    .duration(220)
                    .easing(Easing.out(Easing.cubic))
            }
          >
            <View className="mt-1.5 px-4">
              <GlassContainer radius={16} intensity={42} borderOpacity={0.2}>
                <View className="flex-row p-1">
                  {WEEKDAY_LABELS.map((label, i) => {
                    const day = i + 1;
                    // 仅在「处于本学期且正在浏览真实本周」时点亮今日指示圆点
                    const isToday = isCurrentRealWeek && day === dateInfo.weekday;
                    const isSel = day === weekday;
                    return (
                      <Pressable
                        key={label}
                        onPress={() => setWeekday(day)}
                        onLongPress={
                          day === 7 ? () => setAfterHours("coffee") : undefined
                        }
                        delayLongPress={1200}
                        className="flex-1"
                      >
                        <View
                          className={`items-center rounded-[11px] border py-1.5 ${
                            isSel
                              ? "border-white/35 bg-white/35 dark:border-white/15 dark:bg-white/[0.12]"
                              : "border-transparent"
                          }`}
                        >
                          <Text
                            className={`text-[11.5px] font-semibold ${
                              isSel
                                ? "text-sky-600 dark:text-sky-300"
                                : "text-slate-500 dark:text-slate-400"
                            }`}
                          >
                            {label}
                          </Text>
                          <View
                            className={`mt-0.5 h-1 w-1 rounded-full ${
                              isToday ? "bg-sky-400" : "bg-transparent"
                            }`}
                          />
                        </View>
                      </Pressable>
                    );
                  })}
                </View>
              </GlassContainer>
            </View>
          </Animated.View>
        ) : null}

        {/* ---------- 内容 ---------- */}
        <View className="mt-2 flex-1">
          {mode === "day" ? (
            <GestureDetector gesture={dayGesture}>
              <Animated.View style={[{ flex: 1 }, daySlideStyle]}>
                <ScrollView
                  className="flex-1"
                  contentContainerStyle={{
                    paddingHorizontal: 16,
                    paddingBottom: 96,
                  }}
                  showsVerticalScrollIndicator={false}
                >
                  {dayCourses.length === 0 ? (
                    <Animated.View
                      entering={
                        reducedMotion
                          ? undefined
                          : FadeInDown.duration(220).easing(
                              Easing.out(Easing.cubic),
                            )
                      }
                    >
                      <GlassContainer
                        radius={22}
                        intensity={40}
                        borderOpacity={0.2}
                      >
                        <View className="items-center px-6 py-8">
                          <View className="h-12 w-12 items-center justify-center rounded-[18px] bg-white/20 dark:bg-white/[0.06]">
                            <Ionicons
                              name="cafe-outline"
                              size={22}
                              color="#64748B"
                            />
                          </View>
                          <Text className="mt-2.5 text-[14px] font-bold text-slate-700 dark:text-slate-200">
                            这一天没有课
                          </Text>
                          <Text className="mt-1 text-center text-[11.5px] text-slate-500 dark:text-slate-400">
                            放松一下，或者用 AI 助手规划自习
                          </Text>
                          <Pressable
                            onPress={() => openCreate()}
                            className="mt-3 rounded-full bg-sky-500 px-5 py-2"
                          >
                            <Text className="text-[12px] font-semibold text-white">
                              添加课程
                            </Text>
                          </Pressable>
                        </View>
                      </GlassContainer>
                    </Animated.View>
                  ) : (
                    <View className="gap-y-2">
                      {dayCourses.map((course, i) => {
                        const courseActive =
                          isViewingRealToday &&
                          isCourseActive(
                            course,
                            schedule.periods,
                            dateInfo.weekIndex,
                            dateInfo.weekday,
                            now,
                          );
                        const courseFinished =
                          isViewingRealToday &&
                          !courseActive &&
                          isCourseFinished(
                            course,
                            schedule.periods,
                            dateInfo.weekIndex,
                            dateInfo.weekday,
                            now,
                          );
                        let countdownLabel: string | undefined;
                        if (isViewingRealToday) {
                          const ct = getCourseTime(
                            schedule.periods,
                            course.startPeriod,
                            course.endPeriod,
                            course,
                          );
                          if (courseActive && ct.endMinutes > nowMinutes) {
                            countdownLabel = `剩 ${formatMinutesDelta(
                              ct.endMinutes - nowMinutes,
                            )}`;
                          } else if (
                            !courseFinished &&
                            ct.startMinutes > nowMinutes &&
                            ct.startMinutes - nowMinutes <= 120
                          ) {
                            countdownLabel = `${formatMinutesDelta(
                              ct.startMinutes - nowMinutes,
                            )}后`;
                          }
                        }

                        return (
                          <GravityCard
                            key={course.id}
                            token={gravityToken}
                            index={i}
                            lift={liftDistance}
                          >
                            <CourseCard
                              course={course}
                              periods={schedule.periods}
                              index={i}
                              conflict={conflicts.has(course.id)}
                              conflictWith={conflicts.get(course.id)}
                              active={courseActive}
                              finished={courseFinished}
                              countdownLabel={countdownLabel}
                              onPress={openEdit}
                              onLongPress={openQuickActions}
                            />
                          </GravityCard>
                        );
                      })}

                      <Animated.View
                        entering={
                          reducedMotion
                            ? undefined
                            : FadeInDown.delay(
                                Math.min(dayCourses.length, 6) * 42,
                              ).duration(220)
                        }
                      >
                        <EmptySlotCard
                          label={
                            isViewingRealToday
                              ? "今天没有其他安排了 · 长按卡片可快捷调课"
                              : "这一天没有其他安排了 · 长按卡片可快捷调课"
                          }
                        />
                      </Animated.View>
                    </View>
                  )}
                </ScrollView>
              </Animated.View>
            </GestureDetector>
          ) : (
            <View className="flex-1 px-2">
              <WeekGrid
                courses={schedule.courses}
                periods={schedule.periods}
                startDate={schedule.startDate}
                weekIndex={activeWeek}
                weekCount={totalWeeks}
                selectedWeekday={weekday}
                todayWeek={
                  semesterStatus.phase === "active"
                    ? dateInfo.weekIndex
                    : undefined
                }
                todayWeekday={dateInfo.weekday}
                now={now}
                showWeekend={showWeekend}
                showOtherWeeks={showOtherWeeks}
                compact={compactWeekGrid}
                conflicts={conflicts}
                onPickDay={(day) => {
                  if (day === weekday) setMode("day");
                  else setWeekday(day);
                }}
                onPickCourse={(c) => openEdit(c)}
                onLongPressCourse={(c) => openQuickActions(c)}
                onPickEmptySlot={(day, period) =>
                  openCreate({
                    weekday: day,
                    startPeriod: period,
                    endPeriod: Math.min(
                      period + 1,
                      schedule.periods[schedule.periods.length - 1]?.index ??
                        period,
                    ),
                  })
                }
                onWeekChange={setWeekIndex}
              />
            </View>
          )}
        </View>

        {/* ---------- 底部悬浮玻璃胶囊 Action Bar ---------- */}
        <View className="absolute bottom-0 left-0 right-0">
          <ActionBar items={actions} />
        </View>
      </Backdrop>

      {gravityOff ? <GravityBadge key={gravityToken} /> : null}

      {/* ---------- 长按课程快捷菜单（仅打开时挂载，零空闲内存） ---------- */}
      {quickCourse ? (
        <Modal
          visible
          transparent
          animationType="fade"
          onRequestClose={() => setQuickCourse(null)}
        >
          <GlassTargetProvider>
            <View className="flex-1 justify-end bg-black/45">
              <Pressable
                className="flex-1"
                onPress={() => setQuickCourse(null)}
              />
              <Animated.View
                entering={
                  reducedMotion
                    ? undefined
                    : FadeInDown.duration(200).easing(Easing.out(Easing.cubic))
                }
              >
                <GlassContainer
                  variant="sheet"
                  radius={30}
                  borderOpacity={0.3}
                  style={{ paddingBottom: 24 }}
                >
                  <View className="px-5 pt-5">
                    <View className="mb-3 flex-row items-center justify-between">
                      <View className="flex-1 pr-3">
                        <Text
                          numberOfLines={1}
                          className="text-[16px] font-bold text-slate-800 dark:text-white"
                        >
                          {quickCourse.name}
                        </Text>
                        <Text className="mt-0.5 text-[11px] text-slate-500 dark:text-slate-400">
                          {WEEKDAY_LABELS[quickCourse.weekday - 1]} · 第
                          {quickCourse.startPeriod}
                          {quickCourse.endPeriod !== quickCourse.startPeriod
                            ? `–${quickCourse.endPeriod}`
                            : ""}
                          节
                          {quickCourse.classroom
                            ? ` · ${quickCourse.classroom}`
                            : ""}
                        </Text>
                      </View>
                      <Pressable
                        onPress={() => setQuickCourse(null)}
                        className="h-8 w-8 items-center justify-center rounded-full bg-slate-400/15 dark:bg-white/10"
                      >
                        <Ionicons name="close" size={16} color="#64748B" />
                      </Pressable>
                    </View>

                    <View className="gap-y-2">
                      <Pressable
                        onPress={() => {
                          const target = quickCourse;
                          setQuickCourse(null);
                          openEdit(target, true);
                        }}
                        className="flex-row items-center rounded-2xl border border-slate-300/30 bg-white/30 px-4 py-3 dark:border-white/10 dark:bg-white/[0.06]"
                      >
                        <Ionicons
                          name="swap-horizontal"
                          size={17}
                          color="#0EA5E9"
                        />
                        <Text className="ml-3 text-[13.5px] font-semibold text-slate-800 dark:text-slate-100">
                          临时调课 / 停课 / 补课
                        </Text>
                      </Pressable>

                      <Pressable
                        onPress={() => {
                          const target = quickCourse;
                          setQuickCourse(null);
                          openCreate({
                            name: target.name,
                            teacher: target.teacher,
                            classroom: target.classroom,
                            color: target.color,
                            weeks: [...target.weeks],
                            credits: target.credits,
                            note: target.note,
                            weekday: target.weekday,
                            startPeriod: target.startPeriod,
                            endPeriod: target.endPeriod,
                            startTime: target.startTime,
                            endTime: target.endTime,
                          });
                        }}
                        className="flex-row items-center rounded-2xl border border-slate-300/30 bg-white/30 px-4 py-3 dark:border-white/10 dark:bg-white/[0.06]"
                      >
                        <Ionicons
                          name="copy-outline"
                          size={17}
                          color="#8B5CF6"
                        />
                        <Text className="ml-3 text-[13.5px] font-semibold text-slate-800 dark:text-slate-100">
                          复制到其他时段
                        </Text>
                      </Pressable>

                      {Platform.OS === "android" ? (
                        <View className="flex-row gap-2">
                          <Pressable
                            onPress={() =>
                              void pushQuickSystemReminder(quickCourse, "alarm")
                            }
                            className="flex-1 flex-row items-center justify-center rounded-2xl border border-slate-300/30 bg-white/30 py-3 dark:border-white/10 dark:bg-white/[0.06]"
                          >
                            <Ionicons
                              name="alarm-outline"
                              size={16}
                              color="#F59E0B"
                            />
                            <Text className="ml-1.5 text-[12.5px] font-semibold text-slate-800 dark:text-slate-100">
                              加手机闹钟
                            </Text>
                          </Pressable>
                          <Pressable
                            onPress={() =>
                              void pushQuickSystemReminder(
                                quickCourse,
                                "calendar",
                              )
                            }
                            className="flex-1 flex-row items-center justify-center rounded-2xl border border-slate-300/30 bg-white/30 py-3 dark:border-white/10 dark:bg-white/[0.06]"
                          >
                            <Ionicons
                              name="calendar-outline"
                              size={16}
                              color="#10B981"
                            />
                            <Text className="ml-1.5 text-[12.5px] font-semibold text-slate-800 dark:text-slate-100">
                              加系统日历
                            </Text>
                          </Pressable>
                        </View>
                      ) : null}

                      <Pressable
                        onPress={() => {
                          const target = quickCourse;
                          setQuickCourse(null);
                          openEdit(target, false);
                        }}
                        className="flex-row items-center rounded-2xl border border-slate-300/30 bg-white/30 px-4 py-3 dark:border-white/10 dark:bg-white/[0.06]"
                      >
                        <Ionicons
                          name="create-outline"
                          size={17}
                          color="#64748B"
                        />
                        <Text className="ml-3 text-[13.5px] font-semibold text-slate-800 dark:text-slate-100">
                          编辑完整信息 / 删除
                        </Text>
                      </Pressable>
                    </View>
                  </View>
                </GlassContainer>
              </Animated.View>
            </View>
          </GlassTargetProvider>
        </Modal>
      ) : null}

      {/* ---------- 课表快捷切换 ---------- */}
      {switcherOpen ? (
        <Modal
          visible
          transparent
          animationType="fade"
          onRequestClose={() => setSwitcherOpen(false)}
        >
          <GlassTargetProvider>
            <View className="flex-1 justify-end bg-black/45">
              <Pressable
                className="flex-1"
                onPress={() => setSwitcherOpen(false)}
              />
              <Animated.View
                entering={
                  reducedMotion
                    ? undefined
                    : FadeInDown.duration(200).easing(Easing.out(Easing.cubic))
                }
              >
                <GlassContainer
                  variant="sheet"
                  radius={32}
                  borderOpacity={0.3}
                  style={{ paddingBottom: 24 }}
                >
                  <View className="px-5 pt-5">
                    <View className="mb-3 flex-row items-center justify-between">
                      <Text className="text-[17px] font-bold text-slate-800 dark:text-white">
                        切换课程表
                      </Text>
                      <Pressable
                        onPress={() => setSwitcherOpen(false)}
                        className="h-8 w-8 items-center justify-center rounded-full bg-slate-400/15 dark:bg-white/10"
                      >
                        <Ionicons name="close" size={16} color="#64748B" />
                      </Pressable>
                    </View>

                    <ScrollView
                      style={{ maxHeight: winH * 0.45 }}
                      showsVerticalScrollIndicator={false}
                    >
                      {schedules.map((item) => {
                        const isActive = item.id === activeScheduleId;
                        const distinctCount = countDistinctCourses(item.courses);
                        return (
                          <Pressable
                            key={item.id}
                            onPress={() => {
                              setActiveSchedule(item.id);
                              setSwitcherOpen(false);
                            }}
                            className={`mb-2 flex-row items-center rounded-2xl border px-3.5 py-2.5 ${
                              isActive
                                ? "border-sky-400/60 bg-sky-400/15"
                                : "border-slate-300/30 bg-white/25 dark:border-white/10 dark:bg-white/[0.05]"
                            }`}
                          >
                            <View className="flex-1">
                              <Text className="text-[13px] font-bold text-slate-800 dark:text-white">
                                {item.name}
                              </Text>
                              <Text className="mt-0.5 text-[10.5px] text-slate-500 dark:text-slate-400">
                                {distinctCount} 门课
                                {item.courses.length !== distinctCount
                                  ? `（${item.courses.length} 条安排）`
                                  : ""}{" "}
                                · 共 {item.totalWeeks} 周
                              </Text>
                            </View>
                            {isActive ? (
                              <Ionicons
                                name="checkmark-circle"
                                size={18}
                                color="#38BDF8"
                              />
                            ) : null}
                          </Pressable>
                        );
                      })}
                    </ScrollView>

                    <Pressable
                      onPress={() => {
                        setSwitcherOpen(false);
                        router.push("/settings/schedule");
                      }}
                      className="mt-2 items-center rounded-2xl border border-slate-300/35 bg-white/25 py-2.5 dark:border-white/10 dark:bg-white/[0.05]"
                    >
                      <Text className="text-[12px] font-semibold text-sky-600 dark:text-sky-300">
                        管理课程表（新建 / 复制 / 重命名 / 删除）
                      </Text>
                    </Pressable>
                  </View>
                </GlassContainer>
              </Animated.View>
            </View>
          </GlassTargetProvider>
        </Modal>
      ) : null}

      {/* ---------- 课程编辑面板 ---------- */}
      <CourseEditorPanel
        key={editorToken}
        visible={editorOpen}
        periods={schedule.periods}
        currentWeek={activeWeek}
        totalWeeks={totalWeeks}
        course={editing}
        initialDraft={editorInitialDraft}
        initialException={editorInitialException}
        exceptionSchedule={schedule}
        onClose={() => {
          setEditorOpen(false);
          setEditing(undefined);
        }}
        onSave={handleSave}
        onDelete={(id, confirmedSchedule, targetWeeks, recordOnly) => {
          const state = useStore.getState();
          const current = state.schedules.find(
            (item) => item.id === state.activeScheduleId,
          );
          if (
            current !== confirmedSchedule ||
            !editing ||
            !current.courses.includes(editing)
          ) {
            throw new Error("课表已更新，请重新打开课程并核对删除范围。");
          }
          if (targetWeeks) removeCourseOnce(id, targetWeeks);
          else if (recordOnly) removeCourseOnce(id);
          else removeCourse(id);
          setEditorOpen(false);
          setEditing(undefined);
        }}
      />

      {/* ---------- 隐藏的夜空 ---------- */}
      {afterHours ? (
        <AfterHours kind={afterHours} onClose={() => setAfterHours(null)} />
      ) : null}
      {nightOpen ? (
        <NightSky
          onClose={() => setNightOpen(false)}
          onEnterFarm={() => onFarm?.()}
          courseNames={schedule.courses.map((c) => c.name)}
        />
      ) : null}
    </View>
  );
}
