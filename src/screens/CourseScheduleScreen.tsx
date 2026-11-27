import { useLocalSearchParams } from "expo-router";
import { useColorScheme } from "nativewind";
import React, {
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { Alert, View, type StyleProp, type ViewStyle } from "react-native";

import { ActionBar, type ActionItem } from "@/components/ActionBar";
import type { AfterHoursKind } from "@/components/AfterHours";
import { Backdrop } from "@/components/Backdrop";
import {
  LazyAfterHours,
  LazyCourseEditorPanel,
  LazyCourseSearchStatsModal,
  LazyCourseStudyModal,
  LazyCourseTaskSheet,
  LazyHolidayShiftModal,
  LazyNightSky,
  LazyPeerCompareModal,
  LazyScheduleExportModal,
} from "@/components/schedule/lazyScheduleModals";
import {
  ScheduleDayView,
  type ScheduleDayState,
} from "@/components/schedule/ScheduleDayView";
import {
  ScheduleHeader,
  type HolidayUndoNotice,
  type ScheduleViewMode,
} from "@/components/schedule/ScheduleHeader";
import { ScheduleQuickCourseModal } from "@/components/schedule/ScheduleQuickCourseModal";
import { ScheduleSwitcherModal } from "@/components/schedule/ScheduleSwitcherModal";
import { WeekGrid } from "@/components/WeekGrid";
import { WhaleAvatar } from "@/components/WhaleAvatar";
import { GravityBadge } from "@/components/ZeroG";
import { WEEKDAY_LABELS } from "@/constants/palette";
import { useForegroundClock } from "@/hooks/useForegroundClock";
import { playSfx, playStarScaleNote } from "@/services/soundEffects";
import { useDataSession } from "@/store/useDataSession";
import { useSettings } from "@/store/useSettings";
import { useActiveSchedule, useStore } from "@/store/useStore";
import { useStudyProgress } from "@/store/useStudyProgress";
import { useWhaleMemory } from "@/store/useWhaleMemory";
import { useWhalePet } from "@/store/useWhalePet";
import type { Course } from "@/types";
import { selectHaptic, thumpHaptic } from "@/utils/haptics";
import {
  addDays,
  findConflicts,
  formatClock,
  getDateInfo,
  getSemesterStatus,
  mondayOf,
  parseIsoDate,
} from "@/utils/time";

export interface CourseScheduleScreenProps {
  /** 打开 AI 识图导入 */
  onImport: () => void;
  /** 打开课程表助手 */
  onAssistant: () => void;
  /** 打开成绩 */
  onGrades: () => void;
  /** 打开设置 */
  onSettings: () => void;
  /** 通往doordoor农场的小径（隐藏） */
  onFarm?: () => void;
  /** 外部控制的主题层容器样式 */
  style?: StyleProp<ViewStyle>;
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
  const courseTasks = useStore((s) => s.courseTasks);
  const activeScheduleId = useStore((s) => s.activeScheduleId);
  const addCourse = useStore((s) => s.addCourse);
  const updateCourse = useStore((s) => s.updateCourse);
  const removeCourse = useStore((s) => s.removeCourse);
  const removeCourseOnce = useStore((s) => s.removeCourseOnce);
  const replaceActiveCourses = useStore((s) => s.replaceActiveCourses);
  const { colorScheme } = useColorScheme();
  const isDark = colorScheme !== "light";

  // 持久化的课表展示偏好
  const defaultScheduleView = useSettings((s) => s.defaultScheduleView);
  const setDefaultScheduleView = useSettings((s) => s.setDefaultScheduleView);
  const showWeekend = useSettings((s) => s.showWeekend);
  const showOtherWeeks = useSettings((s) => s.showOtherWeeks);
  const compactWeekGrid = useSettings((s) => s.compactWeekGrid);

  // 将前台 30s 心跳量化为分钟粒度，避免同分钟内重复触发子组件重渲染
  const now = useForegroundClock();
  const minuteNowMs = Math.floor(now.getTime() / 60_000) * 60_000;
  const minuteDate = useMemo(() => new Date(minuteNowMs), [minuteNowMs]);
  const clockText = formatClock(minuteDate);

  const dateInfo = useMemo(
    () => getDateInfo(schedule.startDate, minuteDate),
    [schedule.startDate, minuteDate],
  );
  const semesterStatus = useMemo(
    () => getSemesterStatus(schedule, minuteDate),
    [schedule, minuteDate],
  );

  const [weekIndex, setWeekIndex] = useState(semesterStatus.clampedWeek);
  const [dayState, setDayState] = useState<ScheduleDayState>(() => ({
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
  const mode: ScheduleViewMode = defaultScheduleView;
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
  const [taskSheetOpen, setTaskSheetOpen] = useState(false);
  const [taskSheetCourse, setTaskSheetCourse] = useState<Course | null>(null);
  const [taskSheetCreate, setTaskSheetCreate] = useState(false);
  const [taskSheetToken, setTaskSheetToken] = useState(0);
  const [holidayOpen, setHolidayOpen] = useState(false);
  const [holidayUndo, setHolidayUndo] = useState<HolidayUndoNotice | null>(
    null,
  );
  const [searchStatsOpen, setSearchStatsOpen] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const [studyModalOpen, setStudyModalOpen] = useState(false);
  const [studyCourse, setStudyCourse] = useState<Course | null>(null);
  const [studyInitialTab, setStudyInitialTab] = useState<
    "focus" | "attendance"
  >("focus");
  const [peerCompareOpen, setPeerCompareOpen] = useState(false);
  const [nightOpen, setNightOpen] = useState(false);
  const [afterHours, setAfterHours] = useState<AfterHoursKind | null>(null);

  const dataRevision = useDataSession((s) => s.revision);

  // 桌面小组件单课深链（dark-study://?courseId=...&week=...）：每个参数值仅自动定位并弹一次
  const deepLinkParams = useLocalSearchParams<{
    courseId?: string;
    week?: string;
  }>();
  const rawLinkCourseId = Array.isArray(deepLinkParams.courseId)
    ? deepLinkParams.courseId[0]
    : deepLinkParams.courseId;
  const rawLinkWeek = Array.isArray(deepLinkParams.week)
    ? deepLinkParams.week[0]
    : deepLinkParams.week;
  const handledDeepLinkRef = useRef<string | null>(null);
  useEffect(() => {
    const courseId = rawLinkCourseId?.trim() ?? "";
    const weekStr = rawLinkWeek?.trim() ?? "";
    if (!courseId && !weekStr) return;
    const token = `${courseId}|${weekStr}`;
    if (handledDeepLinkRef.current === token) return;

    const parsedWeek = weekStr ? Number.parseInt(weekStr, 10) : Number.NaN;
    const validWeek =
      Number.isInteger(parsedWeek) &&
      parsedWeek >= 1 &&
      parsedWeek <= totalWeeks
        ? parsedWeek
        : null;

    if (courseId) {
      const matched = schedule.courses.find((c) => c.id === courseId);
      if (!matched && !useStore.persist.hasHydrated()) return;
      const timer = setTimeout(() => {
        if (handledDeepLinkRef.current === token) return;
        handledDeepLinkRef.current = token;
        if (!matched) {
          if (validWeek !== null) setWeekIndex(validWeek);
          return;
        }
        if (validWeek !== null) {
          setWeekIndex(validWeek);
        } else if (matched.weeks.length) {
          setWeekIndex(Math.min(Math.max(matched.weeks[0], 1), totalWeeks));
        }
        setWeekday(matched.weekday);
        setQuickCourse(matched);
      }, 0);
      return () => clearTimeout(timer);
    }

    const timer = setTimeout(() => {
      if (handledDeepLinkRef.current === token) return;
      handledDeepLinkRef.current = token;
      if (validWeek !== null) setWeekIndex(validWeek);
    }, 0);
    return () => clearTimeout(timer);
  }, [rawLinkCourseId, rawLinkWeek, schedule.courses, setWeekday, totalWeeks]);

  // 勾掉作业/复习/考试时自动掉落doordoor农场奖励（过滤备份恢复与重复勾选）
  const prevTasksMapRef = useRef<Map<string, boolean> | null>(null);
  const prevRevisionRef = useRef(dataRevision);
  const rewardedTaskIdsRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    if (
      useDataSession.getState().restoring ||
      prevRevisionRef.current !== dataRevision
    ) {
      prevRevisionRef.current = dataRevision;
      prevTasksMapRef.current = new Map(
        courseTasks.map((t) => [t.id, Boolean(t.completedAt)]),
      );
      return;
    }
    const prevMap = prevTasksMapRef.current;
    if (prevMap) {
      for (const task of courseTasks) {
        const wasDone = prevMap.get(task.id);
        const isDone = Boolean(task.completedAt);
        if (
          wasDone === false &&
          isDone &&
          !rewardedTaskIdsRef.current.has(task.id)
        ) {
          rewardedTaskIdsRef.current.add(task.id);
          useStudyProgress.getState().queueTaskReward(task.type, task.title);
        }
      }
    }
    prevTasksMapRef.current = new Map(
      courseTasks.map((t) => [t.id, Boolean(t.completedAt)]),
    );
  }, [courseTasks, dataRevision]);

  const openStudyModal = useCallback(
    (
      targetCourse: Course | null = null,
      tab: "focus" | "attendance" = "focus",
    ) => {
      selectHaptic();
      setStudyCourse(targetCourse);
      setStudyInitialTab(tab);
      setStudyModalOpen(true);
    },
    [],
  );

  // 第二个彩蛋：静默触发
  const [gravityToken, setGravityToken] = useState(0);
  const [gravityOff, setGravityOff] = useState(false);
  const gravityTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleWeekTitleLongPress = useCallback(() => {
    thumpHaptic();
    playSfx("zero_g", { volume: 0.72, ignoreCooldown: true });
    setGravityToken((t) => t + 1);
    setGravityOff(true);
    if (gravityTimer.current) clearTimeout(gravityTimer.current);
    gravityTimer.current = setTimeout(() => setGravityOff(false), 2400);
  }, []);

  // 彩蛋入口：静默累计点击
  const [secretCharge, setSecretCharge] = useState(0);
  const tapsRef = useRef<number[]>([]);
  const chargeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleClockTap = useCallback(() => {
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
  }, []);

  useEffect(
    () => () => {
      if (chargeTimer.current) clearTimeout(chargeTimer.current);
      if (gravityTimer.current) clearTimeout(gravityTimer.current);
    },
    [],
  );

  const currentRealWeek =
    semesterStatus.phase === "active" ? dateInfo.weekIndex : null;
  const isCurrentRealWeek =
    currentRealWeek !== null && activeWeek === currentRealWeek;
  const isViewingRealToday =
    isCurrentRealWeek && weekday === dateInfo.weekday;
  const showBackToToday =
    activeWeek !== semesterStatus.clampedWeek ||
    (mode === "day" && weekday !== dateInfo.weekday);

  const jumpToToday = useCallback(() => {
    selectHaptic();
    setWeekIndex(semesterStatus.clampedWeek);
    setWeekday(dateInfo.weekday);
  }, [semesterStatus.clampedWeek, dateInfo.weekday, setWeekday]);

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

  const taskCountByCourseId = useMemo(() => {
    const map = new Map<string, number>();
    const pending = courseTasks.filter((t) => !t.completedAt && t.course);
    if (!pending.length) return map;
    for (const c of schedule.courses) {
      let count = 0;
      for (const t of pending) {
        if (
          t.course?.scheduleId === schedule.id &&
          (t.course.courseId === c.id || t.course.courseName === c.name)
        ) {
          count += 1;
        }
      }
      if (count > 0) map.set(c.id, count);
    }
    return map;
  }, [courseTasks, schedule.courses, schedule.id]);

  const openTaskSheet = useCallback(
    (presetCourse?: Course | null, createDirectly = false) => {
      selectHaptic();
      setTaskSheetCourse(presetCourse ?? null);
      setTaskSheetCreate(createDirectly);
      setTaskSheetToken((t) => t + 1);
      setTaskSheetOpen(true);
    },
    [],
  );

  const handleApplyHolidayShift = useCallback(
    (nextCourses: Course[], summary: string) => {
      const prevCourses = schedule.courses.map((c) => ({
        ...c,
        weeks: [...c.weeks],
      }));
      replaceActiveCourses(nextCourses);
      setHolidayUndo({
        scheduleId: schedule.id,
        prevCourses,
        summary,
      });
      setHolidayOpen(false);
    },
    [replaceActiveCourses, schedule.courses, schedule.id],
  );

  const handleUndoHolidayShift = useCallback(() => {
    if (!holidayUndo) return;
    if (holidayUndo.scheduleId !== activeScheduleId) {
      setHolidayUndo(null);
      Alert.alert("已切换课表", "当前课表已切换，无法直接撤销上次调休。");
      return;
    }
    selectHaptic();
    replaceActiveCourses(holidayUndo.prevCourses);
    setHolidayUndo(null);
  }, [activeScheduleId, holidayUndo, replaceActiveCourses]);

  // 真实今天的课程数（不随用户翻看的周/日变化），供夜空感知课业松紧
  const realTodayCourseCount = useMemo(() => {
    if (semesterStatus.phase !== "active") return 0;
    return schedule.courses.filter(
      (c) =>
        c.weekday === dateInfo.weekday &&
        c.weeks.includes(dateInfo.weekIndex),
    ).length;
  }, [
    semesterStatus.phase,
    schedule.courses,
    dateInfo.weekday,
    dateInfo.weekIndex,
  ]);

  const goToDay = useCallback(
    (day: number, week: number | undefined, dir: number) => {
      if (week !== undefined) setWeekIndex(week);
      setDayState({ weekday: day, dir });
    },
    [],
  );

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

  const handleSave = useCallback(
    (draft: Omit<Course, "id"> & { id?: string }, targetWeeks?: number[]) => {
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
    },
    [addCourse, updateCourse],
  );

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
    { key: "import", icon: "sparkles", label: "导入", onPress: onImport },
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
        <ScheduleHeader
          schedule={schedule}
          activeScheduleId={activeScheduleId}
          activeWeek={activeWeek}
          totalWeeks={totalWeeks}
          currentRealWeek={currentRealWeek}
          viewDateLabel={viewDateLabel}
          viewWeekdayLabel={viewWeekdayLabel}
          semesterBadge={semesterBadge}
          showBackToToday={showBackToToday}
          mode={mode}
          clockText={clockText}
          secretCharge={secretCharge}
          isDark={isDark}
          studyModalOpen={studyModalOpen}
          holidayUndo={holidayUndo}
          nowMs={minuteNowMs}
          onOpenSwitcher={() => setSwitcherOpen(true)}
          onAfterHoursPlatform={() => setAfterHours("platform")}
          onAfterHoursPermission={() => setAfterHours("permission")}
          onWeekTitleLongPress={handleWeekTitleLongPress}
          onJumpToToday={jumpToToday}
          onChangeMode={setMode}
          onClockTap={handleClockTap}
          onSelectWeek={setWeekIndex}
          onUndoHolidayShift={handleUndoHolidayShift}
          onDismissHolidayUndo={() => setHolidayUndo(null)}
          onOpenTaskSheet={() => openTaskSheet()}
          onOpenStudyModal={openStudyModal}
          onOpenPeerCompare={() => setPeerCompareOpen(true)}
          onOpenSearchStats={() => setSearchStatsOpen(true)}
          onOpenHolidayShift={() => setHolidayOpen(true)}
          onOpenExport={() => setExportOpen(true)}
        />

        {mode === "day" ? (
          <ScheduleDayView
            dayState={dayState}
            activeWeek={activeWeek}
            totalWeeks={totalWeeks}
            isCurrentRealWeek={isCurrentRealWeek}
            todayWeekIndex={dateInfo.weekIndex}
            todayWeekday={dateInfo.weekday}
            todayNow={isViewingRealToday ? minuteDate : null}
            courses={schedule.courses}
            periods={schedule.periods}
            conflicts={conflicts}
            taskCountByCourseId={taskCountByCourseId}
            gravityToken={gravityToken}
            onSelectWeekday={setWeekday}
            onGoToDay={goToDay}
            onAfterHoursCoffee={() => setAfterHours("coffee")}
            onCreateCourse={() => openCreate()}
            onEditCourse={(c) => openEdit(c)}
            onQuickActions={openQuickActions}
          />
        ) : (
          <View className="mt-2 flex-1 px-2">
            <WeekGrid
              courses={schedule.courses}
              periods={schedule.periods}
              startDate={schedule.startDate}
              weekIndex={activeWeek}
              weekCount={totalWeeks}
              selectedWeekday={weekday}
              todayWeek={currentRealWeek ?? undefined}
              todayWeekday={dateInfo.weekday}
              now={minuteDate}
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

        <View className="absolute bottom-0 left-0 right-0">
          <ActionBar items={actions} />
        </View>
      </Backdrop>

      {gravityOff ? <GravityBadge key={gravityToken} /> : null}

      {quickCourse ? (
        <ScheduleQuickCourseModal
          course={quickCourse}
          schedule={schedule}
          onClose={() => setQuickCourse(null)}
          onOpenStudy={openStudyModal}
          onOpenExceptionEdit={(c) => openEdit(c, true)}
          onDuplicateCourse={openCreate}
          onOpenAddTask={(c) => openTaskSheet(c, true)}
          onOpenFullEdit={(c) => openEdit(c, false)}
        />
      ) : null}

      {switcherOpen ? (
        <ScheduleSwitcherModal onClose={() => setSwitcherOpen(false)} />
      ) : null}

      {editorOpen ? (
        <Suspense fallback={null}>
          <LazyCourseEditorPanel
            key={editorToken}
            visible
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
        </Suspense>
      ) : null}

      {taskSheetOpen ? (
        <Suspense fallback={null}>
          <LazyCourseTaskSheet
            key={taskSheetToken}
            visible
            schedule={schedule}
            initialCourse={taskSheetCourse}
            initialCreate={taskSheetCreate}
            onClose={() => {
              setTaskSheetOpen(false);
              setTaskSheetCourse(null);
              setTaskSheetCreate(false);
            }}
          />
        </Suspense>
      ) : null}

      {holidayOpen ? (
        <Suspense fallback={null}>
          <LazyHolidayShiftModal
            visible
            schedule={schedule}
            onClose={() => setHolidayOpen(false)}
            onApplyCourses={handleApplyHolidayShift}
          />
        </Suspense>
      ) : null}

      {searchStatsOpen ? (
        <Suspense fallback={null}>
          <LazyCourseSearchStatsModal
            visible
            schedule={schedule}
            currentWeek={activeWeek}
            onClose={() => setSearchStatsOpen(false)}
            onSelectCourse={(course, targetWeek) => {
              setSearchStatsOpen(false);
              if (targetWeek && targetWeek >= 1 && targetWeek <= totalWeeks) {
                setWeekIndex(targetWeek);
              } else if (course.weeks.length) {
                setWeekIndex(
                  Math.min(Math.max(course.weeks[0], 1), totalWeeks),
                );
              }
              setWeekday(course.weekday);
              setQuickCourse(course);
            }}
          />
        </Suspense>
      ) : null}

      {exportOpen ? (
        <Suspense fallback={null}>
          <LazyScheduleExportModal
            visible
            schedule={schedule}
            currentWeek={activeWeek}
            isDark={isDark}
            onClose={() => setExportOpen(false)}
          />
        </Suspense>
      ) : null}

      {studyModalOpen ? (
        <Suspense fallback={null}>
          <LazyCourseStudyModal
            visible
            course={studyCourse}
            schedule={schedule}
            isDark={isDark}
            initialTab={studyInitialTab}
            onVisitFarm={onFarm}
            onClose={() => {
              setStudyModalOpen(false);
              setStudyCourse(null);
            }}
          />
        </Suspense>
      ) : null}

      {peerCompareOpen ? (
        <Suspense fallback={null}>
          <LazyPeerCompareModal
            visible
            schedule={schedule}
            currentWeek={activeWeek}
            isDark={isDark}
            onClose={() => setPeerCompareOpen(false)}
          />
        </Suspense>
      ) : null}

      {afterHours ? (
        <Suspense fallback={null}>
          <LazyAfterHours
            kind={afterHours}
            onClose={() => setAfterHours(null)}
          />
        </Suspense>
      ) : null}

      {nightOpen ? (
        <Suspense fallback={null}>
          <LazyNightSky
            onClose={() => setNightOpen(false)}
            onEnterFarm={() => onFarm?.()}
            courseNames={schedule.courses.map((c) => c.name)}
            todayCourseCount={realTodayCourseCount}
          />
        </Suspense>
      ) : null}
    </View>
  );
}
