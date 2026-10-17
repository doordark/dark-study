import React from "react";
import { ScrollView, Text, View } from "react-native";

import { coursePalette, WEEKDAY_LABELS } from "@/constants/palette";
import type { Course, Period } from "@/types";
import { getCourseTime, timeToMinutes } from "@/utils/time";

const AXIS_W = 50;
const COL_W = 66;
const totalWidth = AXIS_W + 7 * COL_W;
/** 每分钟像素高度：把真实时间线性映射到网格，保证时间轴与课程块对齐 */
const PPM = 1.05;

export interface WeekGridProps {
  courses: Course[];
  periods: Period[];
  weekIndex: number;
  selectedWeekday: number;
  /** 冲突检测结果：courseId -> 与之冲突的课程名 */
  conflicts?: Map<string, string[]>;
  onPickDay: (weekday: number) => void;
  onPickCourse: (course: Course) => void;
}

/**
 * 经典课表网格：左侧时间轴 + 7 个星期列。
 * 行高按真实时间比例（含课间），保证左侧时间标签与课程块竖向对齐。
 */
export function WeekGrid({
  courses,
  periods,
  weekIndex,
  selectedWeekday,
  conflicts,
  onPickDay,
  onPickCourse,
}: WeekGridProps) {
  // 真实时间 -> y 坐标
  const dayStart = timeToMinutes(periods[0]?.startTime ?? "08:00");
  const yOf = (time: string) => (timeToMinutes(time) - dayStart) * PPM;
  const gridHeight = yOf(periods[periods.length - 1]?.endTime ?? "22:30") + 4;

  // 当前周次下生效的课程
  const visible = courses.filter((c) => c.weeks.includes(weekIndex));

  return (
    /* 外层纵向滚动：网格整体高度超出屏幕时可以上下滚动，
       底部留出悬浮 Action Bar 的高度，避免最后几节课被遮挡 */
    <ScrollView
      showsVerticalScrollIndicator={false}
      contentContainerStyle={{ paddingBottom: 110 }}
    >
      <ScrollView horizontal showsHorizontalScrollIndicator={false}>
        <View style={{ width: totalWidth }}>
          {/* 星期表头 */}
          <View className="flex-row">
            <View style={{ width: AXIS_W }} />
            {WEEKDAY_LABELS.map((label, i) => {
              const day = i + 1;
              const isSel = day === selectedWeekday;
              return (
                <Text
                  key={label}
                  onPress={() => onPickDay(day)}
                  style={{ width: COL_W }}
                  className={`py-2 text-center text-[11px] font-semibold ${
                    isSel
                      ? "text-sky-500 dark:text-sky-300"
                      : "text-slate-500 dark:text-slate-400"
                  }`}
                >
                  {label}
                </Text>
              );
            })}
          </View>

          <View style={{ height: gridHeight }}>
            {/* 背景网格线 + 时间轴（按真实时间定位，与课程块对齐） */}
            {periods.map((p) => (
              <View
                key={p.index}
                pointerEvents="none"
                style={{
                  position: "absolute",
                  top: yOf(p.startTime),
                  left: 0,
                  right: 0,
                  height: Math.max(0, yOf(p.endTime) - yOf(p.startTime)),
                }}
                className="flex-row"
              >
                <View
                  style={{ width: AXIS_W }}
                  className="items-end justify-center pr-1.5"
                >
                  <Text className="text-[10px] font-bold text-slate-500 dark:text-slate-400">
                    {p.index}
                  </Text>
                  <Text className="text-[8px] text-slate-400 dark:text-slate-500">
                    {p.startTime}
                  </Text>
                </View>
                <View
                  style={{
                    width: 7 * COL_W,
                    height: "100%",
                    marginTop: 1,
                  }}
                  className="flex-row border-b border-slate-200/70 dark:border-white/[0.06]"
                >
                  {WEEKDAY_LABELS.map((wd) => (
                    <View
                      key={wd}
                      style={{ width: COL_W }}
                      className="border-r border-slate-200/70 dark:border-white/[0.06]"
                    />
                  ))}
                </View>
              </View>
            ))}

            {/* 课程块（按真实时间跨度定位） */}
            {visible.map((course) => {
              const palette = coursePalette[course.color];
              const isConflict = conflicts?.has(course.id) ?? false;
              const { startTime, endTime } = getCourseTime(
                periods,
                course.startPeriod,
                course.endPeriod,
              );
              const top = yOf(startTime) + 2;
              const height = Math.max(22, yOf(endTime) - yOf(startTime) - 5);
              return (
                <View
                  key={course.id}
                  onTouchEnd={() => onPickCourse(course)}
                  style={{
                    position: "absolute",
                    top,
                    left: AXIS_W + (course.weekday - 1) * COL_W + 3,
                    width: COL_W - 6,
                    height,
                    borderRadius: 12,
                    overflow: "hidden",
                    backgroundColor: palette.solid + "33",
                    borderLeftWidth: 3,
                    borderLeftColor: palette.solid,
                    // 冲突课程：琥珀色描边 + 警示角标
                    borderWidth: isConflict ? 1 : 0,
                    borderColor: "#F59E0B",
                  }}
                  className="px-1.5 py-1"
                >
                  <Text
                    numberOfLines={height > 60 ? 4 : 2}
                    className="text-[10px] font-bold leading-3.5 text-slate-800 dark:text-slate-100"
                  >
                    {course.name}
                  </Text>
                  {isConflict ? (
                    <Text
                      numberOfLines={1}
                      className="mt-0.5 text-[7.5px] font-bold text-amber-500"
                    >
                      ⚠ 时间冲突
                    </Text>
                  ) : height > 60 ? (
                    <Text
                      numberOfLines={1}
                      className="mt-0.5 text-[8px] text-slate-500 dark:text-slate-400"
                    >
                      {course.classroom}
                    </Text>
                  ) : null}
                </View>
              );
            })}
          </View>
        </View>
      </ScrollView>
    </ScrollView>
  );
}
