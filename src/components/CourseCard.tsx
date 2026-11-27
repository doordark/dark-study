import Ionicons from "@expo/vector-icons/Ionicons";
import { LinearGradient } from "expo-linear-gradient";
import React, { useEffect, useMemo } from "react";
import { Text, View } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, {
  cancelAnimation,
  Easing,
  FadeInDown,
  runOnJS,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withSequence,
  withSpring,
  withTiming,
} from "react-native-reanimated";

import { GlassContainer } from "@/components/GlassContainer";
import { coursePalette } from "@/constants/palette";
import { useAnimationActive } from "@/hooks/useAnimationActive";
import { useSettings } from "@/store/useSettings";
import type { Course, Period } from "@/types";
import { renderQuality } from "@/utils/renderQuality";
import { formatWeeksCompact, getCourseTime } from "@/utils/time";

export interface CourseCardProps {
  course: Course;
  periods: Period[];
  /** 当前正在进行中（带呼吸光效 + 胶囊标签） */
  active?: boolean;
  /** 今日该课程是否已结束（轻度弱化视觉层级） */
  finished?: boolean;
  /** 进行中剩余时间或即将上课倒计时文案 */
  countdownLabel?: string;
  /** 与其他课程时间冲突（显示琥珀色警示徽标） */
  conflict?: boolean;
  /** 与之冲突的具体课程名列表 */
  conflictWith?: string[];
  /** 本卡片在列表中的序号，用于交错弹入 */
  index?: number;
  /** 关联到该课程的未完成作业/考试数量（缺省或 0 时不显示） */
  taskBadgeCount?: number;
  onPress?: (course: Course) => void;
  onLongPress?: (course: Course) => void;
}

/** 澎湃 OS 风格微弹按压：跟手缩放到 0.965，松手干净回位 */
const PRESS_SPRING = { damping: 18, stiffness: 220, mass: 0.65 };

export const CourseCard = React.memo(function CourseCard({
  course,
  periods,
  active = false,
  finished = false,
  countdownLabel,
  conflict = false,
  conflictWith,
  index = 0,
  taskBadgeCount,
  onPress,
  onLongPress,
}: CourseCardProps) {
  const palette = coursePalette[course.color] ?? coursePalette.sky;
  const translucent = useSettings(
    (s) => s.material === "glass" || s.material === "clear",
  );
  const quality = useSettings((s) => s.renderQuality);
  const reducedMotion = useReducedMotion();
  const animActive = useAnimationActive(active);
  const solidActive = active && !translucent;
  const dimmed = finished && !active;

  const time = useMemo(
    () => getCourseTime(periods, course.startPeriod, course.endPeriod, course),
    [periods, course],
  );
  const periodLabel =
    course.startPeriod === course.endPeriod
      ? `第${course.startPeriod}节`
      : `第${course.startPeriod}–${course.endPeriod}节`;
  const weeksSummary = useMemo(
    () => formatWeeksCompact(course.weeks),
    [course.weeks],
  );
  const conflictText = useMemo(() => {
    if (!conflict && !conflictWith?.length) return "";
    if (conflictWith?.length) {
      const names = [...new Set(conflictWith)].slice(0, 2).join("、");
      return `与 ${names} 冲突`;
    }
    return "时间冲突";
  }, [conflict, conflictWith]);

  /* ---------------- 按压跟手缩放（UI 线程弹簧） ---------------- */
  const scale = useSharedValue(1);

  const gesture = useMemo(() => {
    const tap = Gesture.Tap()
      .onBegin(() => {
        scale.value = withSpring(0.965, PRESS_SPRING);
      })
      .onFinalize(() => {
        scale.value = withSpring(1, PRESS_SPRING);
      })
      .onEnd((_e, success) => {
        if (success && onPress) runOnJS(onPress)(course);
      });

    if (!onLongPress) return tap;

    const longPress = Gesture.LongPress()
      .minDuration(360)
      .onBegin(() => {
        scale.value = withSpring(0.965, PRESS_SPRING);
      })
      .onFinalize(() => {
        scale.value = withSpring(1, PRESS_SPRING);
      })
      .onStart(() => {
        runOnJS(onLongPress)(course);
      });

    return Gesture.Race(longPress, tap);
  }, [course, onLongPress, onPress, scale]);

  const pressStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  /* ---------------- 进行中呼吸光效（后台/流畅画质/减少动态自动停表） ---------------- */
  const glow = useSharedValue(0);
  const allowPulse = active && animActive && !reducedMotion && renderQuality(quality).idleAnimation;
  useEffect(() => {
    if (allowPulse) {
      glow.value = 0.32;
      glow.value = withRepeat(
        withSequence(
          withTiming(1, { duration: 1500, easing: Easing.inOut(Easing.sin) }),
          withTiming(0.32, { duration: 1500, easing: Easing.inOut(Easing.sin) }),
        ),
        -1,
        true,
      );
    } else if (active) {
      cancelAnimation(glow);
      glow.value = 0.7;
    } else {
      cancelAnimation(glow);
      glow.value = 0;
    }
    return () => {
      cancelAnimation(glow);
      glow.value = 0;
    };
  }, [active, allowPulse, glow]);

  const glowStyle = useAnimatedStyle(() => ({
    opacity: glow.value,
  }));

  const statusPill = active
    ? countdownLabel || "进行中"
    : dimmed
      ? "已结束"
      : countdownLabel || "";

  const entering = reducedMotion
    ? undefined
    : FadeInDown.delay(Math.min(index, 6) * 42)
        .duration(240)
        .easing(Easing.out(Easing.cubic));

  return (
    /* 入场动画、按压缩放与完成弱化透明度分层，避免 FadeInDown 覆写 opacity 或 transform */
    <Animated.View entering={entering}>
      <View style={dimmed ? { opacity: 0.62 } : undefined}>
      <Animated.View style={pressStyle}>
        <GestureDetector gesture={gesture}>
          <View>
            <GlassContainer
              radius={24}
              borderOpacity={active ? (translucent ? 0.28 : 0) : 0.2}
              style={
                solidActive
                  ? {
                      backgroundColor: palette.solid,
                      borderColor: "transparent",
                    }
                  : undefined
              }
            >
              {translucent ? (
                <LinearGradient
                  pointerEvents="none"
                  colors={[
                    `${palette.solid}${active ? "22" : "0A"}`,
                    `${palette.solid}00`,
                  ]}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 0.85 }}
                  style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0 }}
                />
              ) : null}
              {!solidActive ? (
                <View
                  pointerEvents="none"
                  style={{
                    position: "absolute",
                    left: 0,
                    top: 18,
                    bottom: 18,
                    width: 3.5,
                    borderRadius: 2,
                    backgroundColor: palette.solid,
                    opacity: active ? 0.95 : dimmed ? 0.35 : 0.72,
                  }}
                />
              ) : null}

              <View className="relative px-4 py-3.5">
                {/* 状态胶囊：进行中 / 倒计时 / 已结束 */}
                {statusPill ? (
                  <View
                    className={`absolute right-3.5 top-3.5 flex-row items-center rounded-full border px-2.5 py-1 ${
                      active
                        ? translucent
                          ? "border-white/95 bg-white/88"
                          : "border-white/25 bg-white/18"
                        : dimmed
                          ? "border-slate-300/30 bg-slate-400/15 dark:border-white/10 dark:bg-white/[0.06]"
                          : translucent
                            ? "border-white/75 bg-white/55 dark:border-white/20 dark:bg-white/15"
                            : "border-sky-400/35 bg-sky-400/15"
                    }`}
                  >
                    {active ? (
                      <View
                        className="mr-1.5 h-1.5 w-1.5 rounded-full"
                        style={{ backgroundColor: translucent ? palette.solid : "#FFFFFF" }}
                      />
                    ) : null}
                    <Text
                      className={`text-[10px] font-semibold tracking-wide ${
                        solidActive
                          ? "text-white"
                          : active
                            ? translucent
                              ? "text-slate-800"
                              : "text-slate-700 dark:text-slate-100"
                            : dimmed
                              ? "text-slate-500 dark:text-slate-400"
                              : "text-sky-700 dark:text-sky-300"
                      }`}
                    >
                      {statusPill}
                    </Text>
                  </View>
                ) : null}

                {/* 课程名：不设 lineHeight 避免 Android 提前截断 */}
                <Text
                  numberOfLines={2}
                  className={`text-[15.5px] font-bold ${statusPill ? "pr-20" : ""} ${
                    solidActive ? "text-white" : "text-slate-800 dark:text-slate-100"
                  }`}
                >
                  {course.name}
                </Text>

                {/* 时间 + 节次 + 周次 */}
                <View className="mt-1.5 flex-row flex-wrap items-center gap-x-2 gap-y-1">
                  <Text
                    className={`text-[11.5px] font-semibold ${
                      solidActive
                        ? "text-white/90"
                        : "text-slate-600 dark:text-slate-300"
                    }`}
                  >
                    {time.startTime}–{time.endTime}
                  </Text>
                  <View
                    className={`rounded-md px-1.5 py-0.5 ${
                      solidActive
                        ? "bg-white/20"
                        : "bg-slate-400/15 dark:bg-white/[0.07]"
                    }`}
                  >
                    <Text
                      className={`text-[9.5px] font-semibold ${
                        solidActive
                          ? "text-white/95"
                          : "text-slate-600 dark:text-slate-300"
                      }`}
                    >
                      {periodLabel}
                    </Text>
                  </View>
                  {weeksSummary ? (
                    <Text
                      className={`text-[10px] ${
                        solidActive
                          ? "text-white/75"
                          : "text-slate-400 dark:text-slate-500"
                      }`}
                    >
                      {weeksSummary}
                    </Text>
                  ) : null}
                  {taskBadgeCount && taskBadgeCount > 0 ? (
                    <View
                      className={`flex-row items-center rounded-full border px-1.5 py-0.5 ${
                        solidActive
                          ? "border-white/30 bg-white/20"
                          : "border-rose-400/40 bg-rose-500/12 dark:border-rose-400/35 dark:bg-rose-400/15"
                      }`}
                    >
                      <View
                        className="mr-1 h-1.5 w-1.5 rounded-full"
                        style={{ backgroundColor: solidActive ? "#FFFFFF" : "#F43F5E" }}
                      />
                      <Text
                        className={`text-[9.5px] font-bold ${
                          solidActive
                            ? "text-white"
                            : "text-rose-600 dark:text-rose-300"
                        }`}
                      >
                        {taskBadgeCount}项待办
                      </Text>
                    </View>
                  ) : null}
                </View>

                {/* 冲突提示（直接展示具体冲突课程名） */}
                {conflictText ? (
                  <View className="mt-1.5 self-start flex-row items-center rounded-full border border-amber-400/50 bg-amber-400/20 px-2 py-0.5">
                    <Ionicons name="warning" size={10} color="#F59E0B" />
                    <Text
                      numberOfLines={1}
                      className="ml-1 text-[10px] font-bold text-amber-700 dark:text-amber-300"
                    >
                      {conflictText}
                    </Text>
                  </View>
                ) : null}

                {/* 教室 / 教师 */}
                <View className="mt-2 flex-row items-center gap-x-3">
                  {course.classroom ? (
                    <View className="flex-1 flex-row items-center">
                      <View
                        className={`mr-1.5 h-1.5 w-1.5 rounded-full ${
                          solidActive ? "bg-white/90" : palette.bar
                        }`}
                      />
                      <Text
                        numberOfLines={1}
                        className={`flex-1 text-[11.5px] font-medium ${
                          solidActive
                            ? "text-white/95"
                            : "text-slate-700 dark:text-slate-200"
                        }`}
                      >
                        {course.classroom}
                      </Text>
                    </View>
                  ) : null}
                  {course.teacher ? (
                    <View className="flex-row items-center">
                      <Ionicons
                        name="person-outline"
                        size={11}
                        color={solidActive ? "rgba(255,255,255,0.85)" : "#94A3B8"}
                      />
                      <Text
                        numberOfLines={1}
                        className={`ml-1 text-[11px] ${
                          solidActive
                            ? "text-white/85"
                            : "text-slate-500 dark:text-slate-400"
                        }`}
                      >
                        {course.teacher}
                      </Text>
                    </View>
                  ) : null}
                </View>

                {/* 课程备注（若有） */}
                {course.note?.trim() ? (
                  <View className="mt-1.5 flex-row items-center">
                    <Ionicons
                      name="document-text-outline"
                      size={10.5}
                      color={solidActive ? "rgba(255,255,255,0.8)" : "#94A3B8"}
                    />
                    <Text
                      numberOfLines={1}
                      className={`ml-1 flex-1 text-[10.5px] ${
                        solidActive
                          ? "text-white/80"
                          : "text-slate-500 dark:text-slate-400"
                      }`}
                    >
                      {course.note.trim()}
                    </Text>
                  </View>
                ) : null}
              </View>
            </GlassContainer>

            {/* 呼吸光晕描边：不用 Android elevation，避免缩放光栅化灰块 */}
            {active ? (
              <Animated.View
                pointerEvents="none"
                style={[
                  {
                    position: "absolute",
                    top: 0,
                    bottom: 0,
                    left: 0,
                    right: 0,
                    borderRadius: 24,
                    borderWidth: 1.2,
                    borderColor: translucent ? `${palette.solid}88` : "#FFFFFF",
                  },
                  glowStyle,
                ]}
              />
            ) : null}
          </View>
        </GestureDetector>
      </Animated.View>
      </View>
    </Animated.View>
  );
});

/** 极简占位卡片（空闲时段） */
export const EmptySlotCard = React.memo(function EmptySlotCard({ label }: { label: string }) {
  return (
    <View className="items-center justify-center rounded-[24px] border border-dashed border-slate-300/60 bg-white/25 px-3 py-4 dark:border-slate-600/50 dark:bg-white/[0.03]">
      <Text className="text-[10.5px] text-slate-400 dark:text-slate-500">
        {label}
      </Text>
    </View>
  );
});
