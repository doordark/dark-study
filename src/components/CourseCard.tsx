import { useEffect } from "react";
import { Text, View } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, {
  FadeInDown,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withSpring,
  withTiming,
} from "react-native-reanimated";

import { GlassContainer } from "@/components/GlassContainer";
import { coursePalette } from "@/constants/palette";
import type { Course, Period } from "@/types";
import { getCourseTime } from "@/utils/time";

export interface CourseCardProps {
  course: Course;
  periods: Period[];
  /** 当前正在进行中（带呼吸光效 + 胶囊标签） */
  active?: boolean;
  /** 本卡片在列表中的序号，用于交错弹入 */
  index?: number;
  onPress?: (course: Course) => void;
  onLongPress?: (course: Course) => void;
}

/** 澎湃 OS 风格弹簧按压：跟手缩放到 0.95 */
const PRESS_SPRING = { damping: 15, stiffness: 150, mass: 0.6 };

export function CourseCard({
  course,
  periods,
  active = false,
  index = 0,
  onPress,
  onLongPress,
}: CourseCardProps) {
  const palette = coursePalette[course.color];
  const time = getCourseTime(periods, course.startPeriod, course.endPeriod);

  /* ---------------- 按压跟手缩放（UI 线程弹簧） ---------------- */
  const scale = useSharedValue(1);

  const tap = Gesture.Tap()
    .onBegin(() => {
      scale.value = withSpring(0.95, PRESS_SPRING);
    })
    .onFinalize(() => {
      scale.value = withSpring(1, PRESS_SPRING);
    })
    .onEnd(() => {
      if (onPress) runOnJS(onPress)(course);
    });

  const longPress = Gesture.LongPress()
    .minDuration(350)
    .onBegin(() => {
      scale.value = withSpring(0.95, PRESS_SPRING);
    })
    .onFinalize(() => {
      scale.value = withSpring(1, PRESS_SPRING);
    })
    .onStart(() => {
      if (onLongPress) runOnJS(onLongPress)(course);
    });

  const gesture = Gesture.Race(longPress, tap);

  const pressStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  /* ---------------- 进行中呼吸光效 ---------------- */
  const glow = useSharedValue(0);
  useEffect(() => {
    if (active) {
      glow.value = withRepeat(
        withSequence(
          withTiming(1, { duration: 1400 }),
          withTiming(0.35, { duration: 1400 }),
        ),
        -1,
        true,
      );
    } else {
      glow.value = withTiming(0, { duration: 300 });
    }
    return () => {
      glow.value = 0;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active]);

  const glowStyle = useAnimatedStyle(() => ({
    opacity: glow.value,
  }));

  return (
    <Animated.View
      entering={FadeInDown.delay(index * 70).springify()}
      style={pressStyle}
    >
      <GestureDetector gesture={gesture}>
        <View>
          <GlassContainer
            radius={24}
            borderOpacity={active ? 0 : 0.16}
            style={
              active
                ? { backgroundColor: palette.solid, borderColor: "transparent" }
                : { opacity: 0.94 }
            }
          >
            <View className="relative px-4 py-3.5">
              {/* 进行中 胶囊标签 */}
              {active ? (
                <View className="absolute right-10 top-10 flex-row items-center rounded-full border border-white/40 bg-white/25 px-2.5 py-1">
                  <View className="mr-1.5 h-1.5 w-1.5 rounded-full bg-white" />
                  <Text className="text-[10px] font-semibold tracking-wide text-white">
                    进行中
                  </Text>
                </View>
              ) : null}

              {/* 课程名 */}
              <Text
                numberOfLines={2}
                className={`pr-12 text-[15px] font-bold leading-5 ${
                  active ? "text-white" : "text-slate-800 dark:text-slate-100"
                }`}
              >
                {course.name}
              </Text>

              {/* 时间 */}
              <Text
                className={`mt-1.5 text-[11px] font-medium ${
                  active
                    ? "text-white/85"
                    : "text-slate-500 dark:text-slate-400"
                }`}
              >
                {time.startTime}–{time.endTime}
              </Text>

              {/* 教师 / 教室 */}
              <View className="mt-1 gap-y-0.5">
                <Text
                  numberOfLines={1}
                  className={`text-[11px] ${
                    active
                      ? "text-white/85"
                      : "text-slate-500 dark:text-slate-400"
                  }`}
                >
                  {course.teacher}
                </Text>
                <View className="flex-row items-center">
                  <View
                    className={`mr-1 h-1.5 w-1.5 rounded-full ${
                      active ? "bg-white/85" : palette.bar
                    }`}
                  />
                  <Text
                    numberOfLines={1}
                    className={`flex-1 text-[11px] font-medium ${
                      active ? "text-white/95" : palette.text
                    }`}
                  >
                    {course.classroom}
                  </Text>
                </View>
              </View>
            </View>
          </GlassContainer>

          {/* 呼吸光晕（覆盖在卡片上层的描边，靠 opacity 呼吸）：
              不用 Android elevation 阴影 —— 转场/缩放动画时会被光栅化成
              实心灰块，且会强制抬升 z 层级盖住卡片内容 */}
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
                  borderWidth: 2,
                  borderColor: "#FFFFFF",
                },
                glowStyle,
              ]}
            />
          ) : null}
        </View>
      </GestureDetector>
    </Animated.View>
  );
}

/** 极简占位卡片（空闲时段） */
export function EmptySlotCard({ label }: { label: string }) {
  return (
    <View className="items-center justify-center rounded-[24px] border border-dashed border-slate-300/60 bg-white/25 px-3 py-4 dark:border-slate-600/50 dark:bg-white/[0.03]">
      <Text className="text-[10px] text-slate-400 dark:text-slate-500">
        {label}
      </Text>
    </View>
  );
}
