import Ionicons from "@expo/vector-icons/Ionicons";
import React, { useEffect, useMemo, useRef } from "react";
import {
  Pressable,
  ScrollView,
  Text,
  View,
  useWindowDimensions,
} from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, {
  Easing,
  FadeInDown,
  runOnJS,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withSpring,
  withTiming,
} from "react-native-reanimated";

import { CourseCard, EmptySlotCard } from "@/components/CourseCard";
import { GlassContainer } from "@/components/GlassContainer";
import { GravityCard } from "@/components/ZeroG";
import { WEEKDAY_LABELS } from "@/constants/palette";
import type { Course, Period } from "@/types";
import { getCourseTime, isCourseActive, isCourseFinished } from "@/utils/time";

export interface ScheduleDayState {
  weekday: number;
  dir: number;
}

export interface ScheduleDayViewProps {
  dayState: ScheduleDayState;
  activeWeek: number;
  totalWeeks: number;
  isCurrentRealWeek: boolean;
  todayWeekIndex: number;
  todayWeekday: number;
  /** 仅当正在查看真实今天时传入当前时间，其他日期传 null 以避免无意义重渲染 */
  todayNow: Date | null;
  courses: Course[];
  periods: Period[];
  conflicts: Map<string, string[]>;
  taskCountByCourseId: Map<string, number>;
  gravityToken: number;
  onSelectWeekday: (day: number) => void;
  onGoToDay: (day: number, week: number | undefined, dir: number) => void;
  onAfterHoursCoffee: () => void;
  onCreateCourse: () => void;
  onEditCourse: (course: Course) => void;
  onQuickActions: (course: Course) => void;
}

function formatMinutesDelta(mins: number): string {
  if (mins >= 60) {
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    return m ? `${h}时${m}分` : `${h}小时`;
  }
  return `${mins}分`;
}

export const ScheduleDayView = React.memo(function ScheduleDayView({
  dayState,
  activeWeek,
  totalWeeks,
  isCurrentRealWeek,
  todayWeekIndex,
  todayWeekday,
  todayNow,
  courses,
  periods,
  conflicts,
  taskCountByCourseId,
  gravityToken,
  onSelectWeekday,
  onGoToDay,
  onAfterHoursCoffee,
  onCreateCourse,
  onEditCourse,
  onQuickActions,
}: ScheduleDayViewProps) {
  const reducedMotion = useReducedMotion();
  const { width: winW, height: winH } = useWindowDimensions();
  const weekday = dayState.weekday;
  const isViewingRealToday = todayNow !== null;
  const nowMinutes = todayNow
    ? todayNow.getHours() * 60 + todayNow.getMinutes()
    : 0;

  // 日视图课程按真实开始分钟稳定排序（同节次不同精确时间顺序明确）
  const dayCourses = useMemo(
    () =>
      courses
        .filter((c) => c.weekday === weekday && c.weeks.includes(activeWeek))
        .sort((a, b) => {
          const ta = getCourseTime(periods, a.startPeriod, a.endPeriod, a);
          const tb = getCourseTime(periods, b.startPeriod, b.endPeriod, b);
          return (
            ta.startMinutes - tb.startMinutes ||
            ta.endMinutes - tb.endMinutes ||
            a.startPeriod - b.startPeriod
          );
        }),
    [courses, periods, weekday, activeWeek],
  );

  /* ---------------- 日视图：左右滑动切换星期 ---------------- */
  const liftDistance = Math.round(Math.min(winH * 0.07, 64));
  const dayTx = useSharedValue(0);
  const winWRef = useRef(winW);
  useEffect(() => {
    winWRef.current = winW;
  }, [winW]);

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
              runOnJS(onGoToDay)(target, targetWeek, dir);
            } else {
              dayTx.set(
                withTiming(-dir * winW, { duration: 170 }, (fin) => {
                  if (fin) runOnJS(onGoToDay)(target, targetWeek, dir);
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
    [weekday, activeWeek, totalWeeks, winW, dayTx, onGoToDay, reducedMotion],
  );

  useEffect(() => {
    if (dayState.dir === 0 || reducedMotion) {
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
  }, [dayState, reducedMotion, dayTx]);

  const daySlideStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: dayTx.value }],
  }));

  return (
    <>
      {/* ---------- 星期选择（仅日视图） ---------- */}
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
                const isToday = isCurrentRealWeek && day === todayWeekday;
                const isSel = day === weekday;
                return (
                  <Pressable
                    key={label}
                    onPress={() => onSelectWeekday(day)}
                    onLongPress={day === 7 ? onAfterHoursCoffee : undefined}
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

      {/* ---------- 日课表卡片流 ---------- */}
      <View className="mt-2 flex-1">
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
                        onPress={onCreateCourse}
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
                      todayNow !== null &&
                      isCourseActive(
                        course,
                        periods,
                        todayWeekIndex,
                        todayWeekday,
                        todayNow,
                      );
                    const courseFinished =
                      todayNow !== null &&
                      !courseActive &&
                      isCourseFinished(
                        course,
                        periods,
                        todayWeekIndex,
                        todayWeekday,
                        todayNow,
                      );
                    let countdownLabel: string | undefined;
                    if (todayNow !== null) {
                      const ct = getCourseTime(
                        periods,
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
                          periods={periods}
                          index={i}
                          conflict={conflicts.has(course.id)}
                          conflictWith={conflicts.get(course.id)}
                          active={courseActive}
                          finished={courseFinished}
                          countdownLabel={countdownLabel}
                          taskBadgeCount={taskCountByCourseId.get(course.id)}
                          onPress={onEditCourse}
                          onLongPress={onQuickActions}
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
      </View>
    </>
  );
});
