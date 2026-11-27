import Ionicons from "@expo/vector-icons/Ionicons";
import React, { useMemo } from "react";
import { Alert, Modal, Platform, Pressable, Text, View } from "react-native";
import Animated, {
  Easing,
  FadeInDown,
  useReducedMotion,
} from "react-native-reanimated";

import {
  GlassContainer,
  GlassTargetProvider,
} from "@/components/GlassContainer";
import { WEEKDAY_LABELS } from "@/constants/palette";
import {
  openCourseAlarm,
  openCourseCalendar,
} from "@/services/systemCourseReminders";
import { useSettings } from "@/store/useSettings";
import { useStudyProgress } from "@/store/useStudyProgress";
import type { Course, Schedule } from "@/types";
import { upcomingWidgetCourses } from "@/utils/courseWidget";
import {
  computeAttendanceSummary,
  courseIdentityKey,
  getCourseSlotsByKey,
} from "@/utils/studyProgress";

export interface ScheduleQuickCourseModalProps {
  course: Course;
  schedule: Schedule;
  onClose: () => void;
  onOpenStudy: (course: Course, tab: "focus" | "attendance") => void;
  onOpenExceptionEdit: (course: Course) => void;
  onDuplicateCourse: (draft: Partial<Omit<Course, "id">>) => void;
  onOpenAddTask: (course: Course) => void;
  onOpenFullEdit: (course: Course) => void;
}

export function ScheduleQuickCourseModal({
  course,
  schedule,
  onClose,
  onOpenStudy,
  onOpenExceptionEdit,
  onDuplicateCourse,
  onOpenAddTask,
  onOpenFullEdit,
}: ScheduleQuickCourseModalProps) {
  const reducedMotion = useReducedMotion();
  const attendanceByCourse = useStudyProgress((s) => s.attendanceByCourse);
  const customAbsenceLimits = useStudyProgress((s) => s.customAbsenceLimits);

  const attendance = useMemo(() => {
    const key = courseIdentityKey(course);
    const slots = getCourseSlotsByKey(schedule, key);
    return computeAttendanceSummary(
      slots.length ? slots : course,
      attendanceByCourse[key],
      customAbsenceLimits[key],
    );
  }, [course, schedule, attendanceByCourse, customAbsenceLimits]);

  /** 快速将某门课的下一次上课推送到系统闹钟或系统日历（Android） */
  const pushSystemReminder = async (kind: "alarm" | "calendar") => {
    onClose();
    const nextOcc = upcomingWidgetCourses(
      { ...schedule, courses: [course] },
      new Date(),
    ).find((occ) => occ.start > Date.now());
    if (!nextOcc) {
      Alert.alert("暂无待上课时", "这门课本学期已没有后续上课安排。");
      return;
    }
    const reminderMinutes = useSettings.getState().reminderMinutes;
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

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <GlassTargetProvider>
        <View className="flex-1 justify-end bg-black/45">
          <Pressable className="flex-1" onPress={onClose} />
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
                    <View className="flex-row items-center gap-2">
                      <Text
                        numberOfLines={1}
                        className="shrink text-[16px] font-bold text-slate-800 dark:text-white"
                      >
                        {course.name}
                      </Text>
                      {attendance.riskLevel !== "safe" ? (
                        <View
                          className={`shrink-0 rounded-full border px-2 py-0.5 ${
                            attendance.riskLevel === "danger"
                              ? "border-rose-500/45 bg-rose-500/18"
                              : "border-amber-400/45 bg-amber-500/18"
                          }`}
                        >
                          <Text
                            className={`text-[9.5px] font-bold ${
                              attendance.riskLevel === "danger"
                                ? "text-rose-700 dark:text-rose-300"
                                : "text-amber-700 dark:text-amber-300"
                            }`}
                          >
                            {attendance.riskLevel === "danger"
                              ? `缺勤红线 ${attendance.absent}/${attendance.redline}`
                              : "缺勤预警 · 剩1次"}
                          </Text>
                        </View>
                      ) : null}
                    </View>
                    <Text className="mt-0.5 text-[11px] text-slate-500 dark:text-slate-400">
                      {WEEKDAY_LABELS[course.weekday - 1]} · 第
                      {course.startPeriod}
                      {course.endPeriod !== course.startPeriod
                        ? `–${course.endPeriod}`
                        : ""}
                      节{course.classroom ? ` · ${course.classroom}` : ""}
                    </Text>
                  </View>
                  <Pressable
                    onPress={onClose}
                    className="h-8 w-8 items-center justify-center rounded-full bg-slate-400/15 dark:bg-white/10"
                  >
                    <Ionicons name="close" size={16} color="#64748B" />
                  </Pressable>
                </View>

                <View className="gap-y-2">
                  <Pressable
                    onPress={() => {
                      const preferAttendance = attendance.riskLevel !== "safe";
                      onClose();
                      onOpenStudy(
                        course,
                        preferAttendance ? "attendance" : "focus",
                      );
                    }}
                    className="flex-row items-center justify-between rounded-2xl border border-emerald-400/35 bg-emerald-500/10 px-4 py-3 dark:border-emerald-400/25 dark:bg-emerald-500/12"
                  >
                    <View className="flex-row items-center">
                      <Ionicons
                        name="timer-outline"
                        size={17}
                        color="#10B981"
                      />
                      <Text className="ml-3 text-[13.5px] font-semibold text-slate-800 dark:text-slate-100">
                        学科专注 / 考勤打卡
                      </Text>
                    </View>
                    {attendance.riskLevel !== "safe" ? (
                      <Text
                        className={`text-[11px] font-bold ${
                          attendance.riskLevel === "danger"
                            ? "text-rose-600 dark:text-rose-300"
                            : "text-amber-600 dark:text-amber-300"
                        }`}
                      >
                        {attendance.riskLevel === "danger"
                          ? "已触红线"
                          : "注意考勤"}
                      </Text>
                    ) : null}
                  </Pressable>

                  <Pressable
                    onPress={() => {
                      onClose();
                      onOpenExceptionEdit(course);
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
                      onClose();
                      onDuplicateCourse({
                        name: course.name,
                        teacher: course.teacher,
                        classroom: course.classroom,
                        color: course.color,
                        weeks: [...course.weeks],
                        credits: course.credits,
                        note: course.note,
                        weekday: course.weekday,
                        startPeriod: course.startPeriod,
                        endPeriod: course.endPeriod,
                        startTime: course.startTime,
                        endTime: course.endTime,
                      });
                    }}
                    className="flex-row items-center rounded-2xl border border-slate-300/30 bg-white/30 px-4 py-3 dark:border-white/10 dark:bg-white/[0.06]"
                  >
                    <Ionicons name="copy-outline" size={17} color="#8B5CF6" />
                    <Text className="ml-3 text-[13.5px] font-semibold text-slate-800 dark:text-slate-100">
                      复制到其他时段
                    </Text>
                  </Pressable>

                  {Platform.OS === "android" ? (
                    <View className="flex-row gap-2">
                      <Pressable
                        onPress={() => void pushSystemReminder("alarm")}
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
                        onPress={() => void pushSystemReminder("calendar")}
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
                      onClose();
                      onOpenAddTask(course);
                    }}
                    className="flex-row items-center rounded-2xl border border-slate-300/30 bg-white/30 px-4 py-3 dark:border-white/10 dark:bg-white/[0.06]"
                  >
                    <Ionicons
                      name="checkbox-outline"
                      size={17}
                      color="#F43F5E"
                    />
                    <Text className="ml-3 text-[13.5px] font-semibold text-slate-800 dark:text-slate-100">
                      添加作业 / 考试
                    </Text>
                  </Pressable>

                  <Pressable
                    onPress={() => {
                      onClose();
                      onOpenFullEdit(course);
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
  );
}
