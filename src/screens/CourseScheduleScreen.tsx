import { Ionicons } from "@expo/vector-icons";
import React, { useMemo, useState } from "react";
import {
  Modal,
  Pressable,
  ScrollView,
  Text,
  View,
  useWindowDimensions,
  type StyleProp,
  type ViewStyle,
} from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, {
  Easing,
  FadeInDown,
  FadeOutDown,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from "react-native-reanimated";

import { ActionBar, type ActionItem } from "@/components/ActionBar";
import { Backdrop } from "@/components/Backdrop";
import { CourseCard, EmptySlotCard } from "@/components/CourseCard";
import { CourseEditorPanel } from "@/components/CourseEditorPanel";
import {
  GlassContainer,
  GlassTargetProvider,
} from "@/components/GlassContainer";
import { NightSky } from "@/components/NightSky";
import { WhaleAvatar } from "@/components/WhaleAvatar";
import { WeekGrid } from "@/components/WeekGrid";
import { GravityBadge, GravityCard } from "@/components/ZeroG";
import { WEEKDAY_LABELS } from "@/constants/palette";
import { useActiveSchedule, useStore } from "@/store/useStore";
import { useWhaleMemory } from "@/store/useWhaleMemory";
import { useWhalePet } from "@/store/useWhalePet";
import type { Course } from "@/types";
import { selectHaptic, thumpHaptic } from "@/utils/haptics";
import {
  findConflicts,
  getDateInfo,
  isCourseActive,
  formatClock,
  addDays,
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

export function CourseScheduleScreen({
  onImport,
  onAssistant,
  onGrades,
  onSettings,
  onFarm,
  style,
}: CourseScheduleScreenProps) {
  const schedule = useActiveSchedule();
  const schedules = useStore((s) => s.schedules);
  const activeScheduleId = useStore((s) => s.activeScheduleId);
  const setActiveSchedule = useStore((s) => s.setActiveSchedule);
  const addCourse = useStore((s) => s.addCourse);
  const updateCourse = useStore((s) => s.updateCourse);
  const removeCourse = useStore((s) => s.removeCourse);
  const removeCourseOnce = useStore((s) => s.removeCourseOnce);

  const dateInfo = useMemo(
    () => getDateInfo(schedule.startDate),
    [schedule.startDate],
  );

  const [weekIndex, setWeekIndex] = useState(dateInfo.weekIndex);
  const [weekday, setWeekday] = useState(dateInfo.weekday);
  const [mode, setMode] = useState<ViewMode>("day");

  const [editorOpen, setEditorOpen] = useState(false);
  const [editing, setEditing] = useState<Course | undefined>(undefined);
  const [editorToken, setEditorToken] = useState(0);
  const [switcherOpen, setSwitcherOpen] = useState(false);
  const [now, setNow] = useState(() => new Date());
  const [nightOpen, setNightOpen] = useState(false);

  // 第二个彩蛋：同样是静默触发，不给任何提示
  const [gravityToken, setGravityToken] = useState(0);
  const [gravityOff, setGravityOff] = useState(false);
  const gravityTimer = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleWeekTitleLongPress = () => {
    thumpHaptic();
    setGravityToken((t) => t + 1);
    setGravityOff(true);
    if (gravityTimer.current) clearTimeout(gravityTimer.current);
    gravityTimer.current = setTimeout(() => setGravityOff(false), 2400);
  };

  // 彩蛋入口：静默累计点击，不做任何显式提示
  const [secretCharge, setSecretCharge] = useState(0);
  const tapsRef = React.useRef<number[]>([]);
  const chargeTimer = React.useRef<ReturnType<typeof setTimeout> | null>(null);

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
      tapsRef.current = [];
      setSecretCharge(0);
      thumpHaptic();
      setNightOpen(true);
    }
  };

  React.useEffect(
    () => () => {
      if (chargeTimer.current) clearTimeout(chargeTimer.current);
      if (gravityTimer.current) clearTimeout(gravityTimer.current);
    },
    [],
  );

  // 每 30 秒刷新一次时钟，保持「进行中」状态准确
  React.useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(t);
  }, []);

  const totalWeeks = Math.max(1, schedule.totalWeeks ?? 18);
  const activeWeek = Math.min(Math.max(weekIndex, 1), totalWeeks);

  /**
   * 左上角日期跟随浏览的周次与星期，而不是固定显示今天。
   * 周视图固定用该周周一；日视图用选中的星期。
   */
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

  // 冲突检测：同天、节次重叠、且当前周同时上课的课程互相标记
  const conflicts = useMemo(
    () => findConflicts(schedule.courses, activeWeek),
    [schedule.courses, activeWeek],
  );

  const dayCourses = useMemo(
    () =>
      schedule.courses
        .filter((c) => c.weekday === weekday && c.weeks.includes(activeWeek))
        .sort((a, b) => a.startPeriod - b.startPeriod),
    [schedule.courses, weekday, activeWeek],
  );

  /* ---------------- 日视图：左右滑动切换星期 ---------------- */
  const { width: winW, height: winH } = useWindowDimensions();
  const liftDistance = Math.round(Math.min(winH * 0.07, 64));
  const dayTx = useSharedValue(0);
  const prevWeekdayRef = React.useRef(weekday);

  // 星期变化（滑动/点选）后新内容从对应侧滑入：缓动进入，不做回弹
  React.useEffect(() => {
    if (prevWeekdayRef.current === weekday) return;
    const dir = weekday > prevWeekdayRef.current ? 1 : -1;
    prevWeekdayRef.current = weekday;
    dayTx.value = dir * winW;
    dayTx.value = withTiming(0, {
      duration: 210,
      easing: Easing.out(Easing.cubic),
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [weekday]);

  const dayGesture = React.useMemo(
    () =>
      Gesture.Pan()
        // 横向明显移动才激活，纵向滑动交还给列表滚动
        .activeOffsetX([-20, 20])
        .failOffsetY([-12, 12])
        .onUpdate((e) => {
          let t = e.translationX;
          // 边界阻尼：周一继续右滑 / 周日继续左滑产生阻力
          if ((weekday === 1 && t > 0) || (weekday === 7 && t < 0)) t *= 0.25;
          dayTx.value = t;
        })
        .onEnd((e) => {
          const dir = e.translationX < 0 ? 1 : -1;
          const next = weekday + dir;
          const go =
            (Math.abs(e.translationX) > 60 || Math.abs(e.velocityX) > 500) &&
            next >= 1 &&
            next <= 7;
          if (go) {
            // 旧内容滑出后切换星期，effect 再把新内容滑入
            dayTx.value = withTiming(-dir * winW, { duration: 180 }, (fin) => {
              if (fin) runOnJS(setWeekday)(next);
            });
          } else {
            dayTx.value = withSpring(0, {
              damping: 26,
              stiffness: 240,
              mass: 1,
            });
          }
        }),
    [weekday, winW, dayTx],
  );

  const daySlideStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: dayTx.value }],
  }));

  const handleSave = (draft: Omit<Course, "id"> & { id?: string }) => {
    if (draft.id) {
      const { id, ...patch } = draft;
      updateCourse(id, patch);
    } else {
      addCourse(draft);
    }
    setEditorOpen(false);
    setEditing(undefined);
  };

  // 大肥鱼在场（人格形态或在屏幕边上趴着），中间主按钮的图标换成她的头像
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
      iconNode: whaleMode ? <WhaleAvatar size={44} /> : undefined,
    },
    { key: "grades", icon: "school", label: "成绩", onPress: onGrades },
    { key: "settings", icon: "options", label: "设置", onPress: onSettings },
  ];

  function openCreate() {
    setEditing(undefined);
    setEditorToken((t) => t + 1);
    setEditorOpen(true);
  }

  function openEdit(course: Course) {
    setEditing(course);
    setEditorToken((t) => t + 1);
    setEditorOpen(true);
  }

  return (
    <View className="flex-1" style={style}>
      <Backdrop>
        {/* ---------- 顶部：日期 + 周次 + 视图切换 ---------- */}
        <View className="px-5 pb-0.5 pt-1">
          <Animated.View entering={FadeInDown.springify()}>
            <View className="flex-row items-center justify-between">
              <View className="flex-1">
                {/* 课表名称：点按快捷切换课表 */}
                <Pressable
                  onPress={() => setSwitcherOpen(true)}
                  className="flex-row items-center self-start rounded-full py-0.5 pr-1.5"
                >
                  <Text className="text-[10px] font-semibold tracking-widest text-sky-500/80 dark:text-sky-300/80">
                    {schedule.name}
                  </Text>
                  <Ionicons
                    name="chevron-down"
                    size={11}
                    color="#7DD3FC"
                    style={{ marginLeft: 2 }}
                  />
                </Pressable>
                <Pressable
                  onLongPress={handleWeekTitleLongPress}
                  delayLongPress={800}
                >
                  <Text className="text-[24px] font-extrabold leading-7 text-slate-800 dark:text-white">
                    第 {activeWeek} 周
                    <Text className="ml-2 text-[11px] font-medium text-slate-400 dark:text-slate-500">
                      {" "}
                      {viewDateLabel} · {viewWeekdayLabel}
                    </Text>
                  </Text>
                </Pressable>
              </View>
              <View className="flex-row items-center gap-x-2">
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

        {/* ---------- 周次横向选择 ---------- */}
        <Animated.View
          entering={FadeInDown.delay(80).springify()}
          className="pt-1.5"
        >
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ paddingHorizontal: 20, gap: 6 }}
          >
            {Array.from({ length: totalWeeks }, (_, i) => i + 1).map((w) => {
              const isNow = w === dateInfo.weekIndex;
              const isSel = w === activeWeek;
              return (
                <Pressable key={w} onPress={() => setWeekIndex(w)}>
                  <View
                    className={`h-8 min-w-[32px] items-center justify-center rounded-full border px-2 ${
                      isSel
                        ? "border-sky-400/70 bg-sky-400/85"
                        : isNow
                          ? "border-sky-400/50 bg-white/25 dark:bg-white/[0.06]"
                          : "border-white/15 bg-white/20 dark:border-white/[0.06] dark:bg-white/[0.04]"
                    }`}
                  >
                    <Text
                      className={`text-[12px] font-bold ${
                        isSel
                          ? "text-white"
                          : isNow
                            ? "text-sky-500 dark:text-sky-300"
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

        {/* ---------- 星期选择（仅日视图：周视图由网格自带星期表头，避免冗余） ---------- */}
        {mode === "day" ? (
          <Animated.View entering={FadeInDown.delay(140).springify()}>
            <View className="mt-1.5 px-4">
              <GlassContainer radius={16} intensity={42} borderOpacity={0.2}>
                <View className="flex-row p-1">
                  {WEEKDAY_LABELS.map((label, i) => {
                    const day = i + 1;
                    const isToday = day === dateInfo.weekday;
                    const isSel = day === weekday;
                    return (
                      <Pressable
                        key={label}
                        onPress={() => setWeekday(day)}
                        className="flex-1"
                      >
                        <View
                          className={`items-center rounded-[11px] border py-1.5 ${
                            isSel
                              ? "border-white/35 bg-white/30 dark:border-white/15 dark:bg-white/[0.12]"
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
            /* 左右滑动切换星期：横向拖动手势，纵向滑动交还列表 */
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
                    <Animated.View entering={FadeInDown.springify()}>
                      <GlassContainer
                        radius={22}
                        intensity={40}
                        borderOpacity={0.2}
                      >
                        <View className="items-center px-6 py-8">
                          <View className="h-12 w-12 items-center justify-center rounded-[18px] bg-white/15 dark:bg-white/[0.06]">
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
                            className="mt-3 rounded-full bg-sky-400/85 px-5 py-2"
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
                      {dayCourses.map((course, i) => (
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
                            // 仅当浏览的就是「本周 + 今天」时才按真实时钟判定进行中，
                            // 避免翻看其他周/其他天时误标多门「进行中」
                            active={
                              activeWeek === dateInfo.weekIndex &&
                              weekday === dateInfo.weekday &&
                              isCourseActive(
                                course,
                                schedule.periods,
                                dateInfo.weekIndex,
                                dateInfo.weekday,
                                now,
                              )
                            }
                            onPress={(c) => openEdit(c)}
                            onLongPress={(c) => openEdit(c)}
                          />
                        </GravityCard>
                      ))}

                      {/* 空闲时段提示 */}
                      <Animated.View
                        entering={FadeInDown.delay(
                          dayCourses.length * 70,
                        ).springify()}
                      >
                        <EmptySlotCard label="今天没有其他安排了" />
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
                weekIndex={activeWeek}
                weekCount={totalWeeks}
                selectedWeekday={weekday}
                conflicts={conflicts}
                onPickDay={setWeekday}
                onPickCourse={(c) => openEdit(c)}
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

      {/* ---------- 隐藏的失重时刻 ---------- */}
      {gravityOff ? <GravityBadge key={gravityToken} /> : null}

      {/* ---------- 课表快捷切换 ---------- */}
      <Modal
        visible={switcherOpen}
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
              entering={FadeInDown.springify()}
              exiting={FadeOutDown}
            >
              <GlassContainer
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
                      className="h-8 w-8 items-center justify-center rounded-full bg-white/20 dark:bg-white/10"
                    >
                      <Ionicons name="close" size={16} color="#94A3B8" />
                    </Pressable>
                  </View>

                  {schedules.map((item) => {
                    const isActive = item.id === activeScheduleId;
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
                            : "border-white/20 bg-white/15 dark:border-white/10 dark:bg-white/[0.05]"
                        }`}
                      >
                        <View className="flex-1">
                          <Text className="text-[13px] font-bold text-slate-800 dark:text-white">
                            {item.name}
                          </Text>
                          <Text className="mt-0.5 text-[10px] text-slate-500 dark:text-slate-400">
                            {item.courses.length} 门课 · 共 {item.totalWeeks} 周
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

                  <Pressable
                    onPress={() => {
                      setSwitcherOpen(false);
                      onSettings();
                    }}
                    className="mt-1 items-center rounded-2xl border border-white/20 bg-white/15 py-2.5 dark:border-white/10 dark:bg-white/[0.05]"
                  >
                    <Text className="text-[12px] font-semibold text-sky-600 dark:text-sky-300">
                      管理课程表（新建 / 重命名 / 删除）
                    </Text>
                  </Pressable>
                </View>
              </GlassContainer>
            </Animated.View>
          </View>
        </GlassTargetProvider>
      </Modal>

      {/* ---------- 课程编辑面板 ---------- */}
      <CourseEditorPanel
        key={editorToken}
        visible={editorOpen}
        periods={schedule.periods}
        totalWeeks={totalWeeks}
        course={editing}
        occurrenceCount={
          editing
            ? schedule.courses.filter(
                (c) =>
                  c.name === editing.name &&
                  c.teacher === editing.teacher &&
                  c.classroom === editing.classroom,
              ).length
            : 1
        }
        onClose={() => {
          setEditorOpen(false);
          setEditing(undefined);
        }}
        onSave={handleSave}
        onDelete={(id, scope) => {
          if (scope === "once") removeCourseOnce(id);
          else removeCourse(id);
          setEditorOpen(false);
          setEditing(undefined);
        }}
      />

      {/* ---------- 隐藏的夜空 ---------- */}
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
