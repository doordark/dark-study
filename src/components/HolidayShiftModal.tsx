import Ionicons from "@expo/vector-icons/Ionicons";
import React, { useMemo, useState } from "react";
import {
  Modal,
  Pressable,
  ScrollView,
  Text,
  View,
} from "react-native";

import { coursePalette, WEEKDAY_LABELS } from "@/constants/palette";
import type { Course, Schedule } from "@/types";
import { selectHaptic, successHaptic, tapHaptic, warnHaptic } from "@/utils/haptics";
import {
  dateToWeekAndWeekday,
  getCoursesOnDate,
  planHolidayCancelDay,
  planHolidayMoveDay,
  planHolidaySwapDays,
  weekAndWeekdayToDate,
} from "@/utils/holidayShift";
import {
  formatDateLabel,
  getCourseTime,
  getDateInfo,
  getSemesterStatus,
  parseIsoDate,
} from "@/utils/time";

export interface HolidayShiftModalProps {
  visible: boolean;
  onClose: () => void;
  schedule: Schedule;
  onApplyCourses: (nextCourses: Course[], summary: string) => void;
}

type ShiftMode = "cancel" | "move" | "swap";

interface DaySlot {
  week: number;
  weekday: number;
}

const MODE_OPTIONS: { key: ShiftMode; title: string; subtitle: string; icon: keyof typeof Ionicons.glyphMap }[] = [
  { key: "cancel", title: "整日放假", subtitle: "停课一天", icon: "sunny-outline" },
  { key: "move", title: "调休补课", subtitle: "A日移到B日", icon: "arrow-forward-outline" },
  { key: "swap", title: "两日互换", subtitle: "A/B互换", icon: "swap-horizontal-outline" },
];

function shortMonthDay(iso: string): string {
  const d = parseIsoDate(iso);
  if (!Number.isFinite(d.getTime())) return "--";
  return `${d.getMonth() + 1}/${d.getDate()}`;
}

function DayPickerCard({
  label,
  accent,
  schedule,
  totalWeeks,
  slot,
  onChange,
  courseCount,
}: {
  label: string;
  accent: string;
  schedule: Schedule;
  totalWeeks: number;
  slot: DaySlot;
  onChange: (next: DaySlot) => void;
  courseCount: number;
}) {
  const iso = useMemo(
    () => weekAndWeekdayToDate(schedule, slot.week, slot.weekday),
    [schedule, slot.week, slot.weekday],
  );
  const validPos = useMemo(
    () => dateToWeekAndWeekday(schedule, iso),
    [schedule, iso],
  );
  const weekDayDates = useMemo(
    () =>
      WEEKDAY_LABELS.map((_, idx) =>
        weekAndWeekdayToDate(schedule, slot.week, idx + 1),
      ),
    [schedule, slot.week],
  );

  const stepWeek = (delta: number) => {
    const nextWeek = Math.min(totalWeeks, Math.max(1, slot.week + delta));
    if (nextWeek !== slot.week) {
      selectHaptic();
      onChange({ ...slot, week: nextWeek });
    }
  };

  return (
    <View className="rounded-2xl border border-slate-200/80 bg-slate-50/90 p-3.5 dark:border-white/10 dark:bg-slate-800/70">
      <View className="flex-row items-center justify-between">
        <View className="flex-row items-center gap-2">
          <View
            className="h-2.5 w-2.5 rounded-full"
            style={{ backgroundColor: accent }}
          />
          <Text className="text-[13px] font-bold text-slate-800 dark:text-slate-100">
            {label}
          </Text>
        </View>
        <View className="rounded-full bg-slate-200/80 px-2.5 py-0.5 dark:bg-white/10">
          <Text className="text-[10.5px] font-semibold text-slate-600 dark:text-slate-300">
            {courseCount > 0 ? `当天 ${courseCount} 门课` : "当天无课"}
          </Text>
        </View>
      </View>

      {/* 周次步进 */}
      <View className="mt-2.5 flex-row items-center justify-between rounded-xl bg-white/90 px-2.5 py-1.5 dark:bg-slate-900/75">
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="上一周"
          disabled={slot.week <= 1}
          onPress={() => stepWeek(-1)}
          className={`h-7 w-7 items-center justify-center rounded-lg bg-slate-100 dark:bg-slate-800 ${
            slot.week <= 1 ? "opacity-35" : ""
          }`}
        >
          <Ionicons name="chevron-back" size={15} color="#64748B" />
        </Pressable>
        <View className="items-center">
          <Text className="text-[12.5px] font-bold text-slate-800 dark:text-white">
            第 {slot.week} 周 · {WEEKDAY_LABELS[slot.weekday - 1]}
          </Text>
          <Text className="text-[10.5px] text-slate-500 dark:text-slate-400">
            {formatDateLabel(iso)}（{iso}）
          </Text>
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="下一周"
          disabled={slot.week >= totalWeeks}
          onPress={() => stepWeek(1)}
          className={`h-7 w-7 items-center justify-center rounded-lg bg-slate-100 dark:bg-slate-800 ${
            slot.week >= totalWeeks ? "opacity-35" : ""
          }`}
        >
          <Ionicons name="chevron-forward" size={15} color="#64748B" />
        </Pressable>
      </View>

      {/* 星期快捷选择 */}
      <View className="mt-2 flex-row gap-1">
        {WEEKDAY_LABELS.map((dayLabel, idx) => {
          const day = idx + 1;
          const active = slot.weekday === day;
          const dayIso = weekDayDates[idx];
          const inRange = Boolean(dateToWeekAndWeekday(schedule, dayIso));
          return (
            <Pressable
              key={day}
              disabled={!inRange}
              onPress={() => {
                selectHaptic();
                onChange({ ...slot, weekday: day });
              }}
              className={`flex-1 items-center rounded-xl py-1.5 ${
                active
                  ? "bg-sky-600"
                  : "bg-white/80 dark:bg-slate-900/60"
              } ${!inRange ? "opacity-30" : ""}`}
            >
              <Text
                className={`text-[10.5px] font-bold ${
                  active ? "text-white" : "text-slate-700 dark:text-slate-200"
                }`}
              >
                {dayLabel.replace("周", "")}
              </Text>
              <Text
                className={`mt-0.5 text-[8.5px] ${
                  active ? "text-sky-100" : "text-slate-400 dark:text-slate-500"
                }`}
              >
                {shortMonthDay(dayIso)}
              </Text>
            </Pressable>
          );
        })}
      </View>

      {!validPos ? (
        <Text className="mt-2 text-[11px] font-medium text-rose-500">
          该日期超出本学期范围（{schedule.startDate} ~ {schedule.endDate}）
        </Text>
      ) : null}
    </View>
  );
}

function PreviewCourseRow({
  course,
  schedule,
  tag,
  tagTone = "sky",
}: {
  course: Course;
  schedule: Schedule;
  tag: string;
  tagTone?: "sky" | "rose" | "amber" | "emerald";
}) {
  const palette = coursePalette[course.color] ?? coursePalette.sky;
  const time = getCourseTime(
    schedule.periods,
    course.startPeriod,
    course.endPeriod,
    course,
  );
  const tagClass =
    tagTone === "rose"
      ? "bg-rose-500/15 text-rose-600 dark:text-rose-300"
      : tagTone === "amber"
        ? "bg-amber-500/15 text-amber-700 dark:text-amber-300"
        : tagTone === "emerald"
          ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300"
          : "bg-sky-500/15 text-sky-700 dark:text-sky-300";

  return (
    <View className="flex-row items-center rounded-xl bg-white/90 px-3 py-2 dark:bg-slate-900/75">
      <View
        className="mr-2.5 h-7 w-1 rounded-full"
        style={{ backgroundColor: palette.solid }}
      />
      <View className="flex-1">
        <Text
          numberOfLines={1}
          className="text-[12.5px] font-semibold text-slate-800 dark:text-slate-100"
        >
          {course.name}
        </Text>
        <Text
          numberOfLines={1}
          className="mt-0.5 text-[10.5px] text-slate-500 dark:text-slate-400"
        >
          {time.startTime}–{time.endTime} · 第{course.startPeriod}
          {course.endPeriod !== course.startPeriod
            ? `–${course.endPeriod}`
            : ""}
          节{course.classroom ? ` · ${course.classroom}` : ""}
        </Text>
      </View>
      <View className={`ml-2 rounded-lg px-2 py-0.5 ${tagClass.split(" ")[0]}`}>
        <Text className={`text-[10px] font-semibold ${tagClass.split(" ").slice(1).join(" ")}`}>
          {tag}
        </Text>
      </View>
    </View>
  );
}

export function HolidayShiftModal({
  visible,
  onClose,
  schedule,
  onApplyCourses,
}: HolidayShiftModalProps) {
  const totalWeeks = Math.max(1, schedule.totalWeeks || 18);
  const defaultSlot = useMemo<DaySlot>(() => {
    const status = getSemesterStatus(schedule);
    const info = getDateInfo(schedule.startDate);
    return {
      week: status.clampedWeek,
      weekday: Math.min(7, Math.max(1, info.weekday)),
    };
  }, [schedule]);

  const [mode, setMode] = useState<ShiftMode>("move");
  const [slotA, setSlotA] = useState<DaySlot>(defaultSlot);
  const [slotB, setSlotB] = useState<DaySlot>(() => ({
    week: defaultSlot.week,
    weekday: defaultSlot.weekday === 7 ? 6 : 7,
  }));
  const [replaceTargetDay, setReplaceTargetDay] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");

  const clampedSlotA = useMemo<DaySlot>(
    () => ({
      week: Math.min(totalWeeks, Math.max(1, slotA.week)),
      weekday: Math.min(7, Math.max(1, slotA.weekday)),
    }),
    [slotA, totalWeeks],
  );
  const clampedSlotB = useMemo<DaySlot>(
    () => ({
      week: Math.min(totalWeeks, Math.max(1, slotB.week)),
      weekday: Math.min(7, Math.max(1, slotB.weekday)),
    }),
    [slotB, totalWeeks],
  );

  const dateAIso = useMemo(
    () => weekAndWeekdayToDate(schedule, clampedSlotA.week, clampedSlotA.weekday),
    [schedule, clampedSlotA],
  );
  const dateBIso = useMemo(
    () => weekAndWeekdayToDate(schedule, clampedSlotB.week, clampedSlotB.weekday),
    [schedule, clampedSlotB],
  );

  const validA = useMemo(
    () => Boolean(dateToWeekAndWeekday(schedule, dateAIso)),
    [schedule, dateAIso],
  );
  const validB = useMemo(
    () => Boolean(dateToWeekAndWeekday(schedule, dateBIso)),
    [schedule, dateBIso],
  );
  const sameDay = dateAIso === dateBIso;

  const coursesA = useMemo(
    () => getCoursesOnDate(schedule, dateAIso),
    [schedule, dateAIso],
  );
  const coursesB = useMemo(
    () => getCoursesOnDate(schedule, dateBIso),
    [schedule, dateBIso],
  );

  const canApply = useMemo(() => {
    if (!validA) return false;
    if (mode === "cancel") return coursesA.length > 0;
    if (!validB || sameDay) return false;
    if (mode === "move") {
      return coursesA.length > 0 || (replaceTargetDay && coursesB.length > 0);
    }
    return coursesA.length > 0 || coursesB.length > 0;
  }, [validA, validB, sameDay, mode, coursesA.length, coursesB.length, replaceTargetDay]);

  const handleApply = () => {
    setErrorMsg("");
    try {
      if (mode === "cancel") {
        const res = planHolidayCancelDay(schedule, dateAIso);
        successHaptic();
        onApplyCourses(res.courses, res.summary);
        onClose();
        return;
      }
      if (mode === "move") {
        const res = planHolidayMoveDay(schedule, dateAIso, dateBIso, {
          replaceTargetDay,
        });
        successHaptic();
        onApplyCourses(res.courses, res.summary);
        onClose();
        return;
      }
      const res = planHolidaySwapDays(schedule, dateAIso, dateBIso);
      successHaptic();
      onApplyCourses(res.courses, res.summary);
      onClose();
    } catch (error) {
      warnHaptic();
      setErrorMsg(error instanceof Error ? error.message : "调休执行失败，请重试");
    }
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <View className="flex-1 justify-end bg-black/55 sm:justify-center sm:px-5">
        <View className="max-h-[90%] rounded-t-3xl border border-slate-200/80 bg-white pb-5 pt-4 dark:border-white/10 dark:bg-slate-900 sm:rounded-3xl">
          {/* 顶栏 */}
          <View className="flex-row items-center justify-between px-5 pb-3">
            <View className="flex-1 pr-3">
              <Text className="text-[17px] font-bold text-slate-900 dark:text-white">
                法定节假日调休 / 停课
              </Text>
              <Text className="mt-0.5 text-[11.5px] text-slate-500 dark:text-slate-400">
                仅调整所选日期单次课程，其余周次完全不受影响
              </Text>
            </View>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="关闭"
              onPress={onClose}
              className="h-8 w-8 items-center justify-center rounded-full bg-slate-100 dark:bg-slate-800"
            >
              <Ionicons name="close" size={17} color="#94A3B8" />
            </Pressable>
          </View>

          {/* 模式切换 */}
          <View className="mx-5 mb-3 flex-row gap-2">
            {MODE_OPTIONS.map((item) => {
              const active = mode === item.key;
              return (
                <Pressable
                  key={item.key}
                  onPress={() => {
                    tapHaptic();
                    setErrorMsg("");
                    setMode(item.key);
                  }}
                  className={`flex-1 items-center rounded-2xl border px-2 py-2.5 ${
                    active
                      ? "border-sky-500/70 bg-sky-500/15"
                      : "border-slate-200/80 bg-slate-50 dark:border-white/10 dark:bg-slate-800/60"
                  }`}
                >
                  <Ionicons
                    name={item.icon}
                    size={16}
                    color={active ? "#0284C7" : "#94A3B8"}
                  />
                  <Text
                    className={`mt-1 text-[12px] font-bold ${
                      active
                        ? "text-sky-700 dark:text-sky-300"
                        : "text-slate-700 dark:text-slate-200"
                    }`}
                  >
                    {item.title}
                  </Text>
                  <Text className="mt-0.5 text-[9.5px] text-slate-400 dark:text-slate-500">
                    {item.subtitle}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          <ScrollView
            className="px-5"
            showsVerticalScrollIndicator={false}
            contentContainerStyle={{ gap: 12, paddingBottom: 8 }}
          >
            {/* 日期 A */}
            <DayPickerCard
              label={
                mode === "cancel"
                  ? "选择放假停课日期"
                  : mode === "move"
                    ? "原上课日期（A日 · 移出课程）"
                    : "日期 A"
              }
              accent={mode === "cancel" ? "#FB7185" : "#38BDF8"}
              schedule={schedule}
              totalWeeks={totalWeeks}
              slot={clampedSlotA}
              onChange={(next) => {
                setErrorMsg("");
                setSlotA(next);
              }}
              courseCount={coursesA.length}
            />

            {/* 方向切换条 + 日期 B */}
            {mode !== "cancel" ? (
              <>
                <View className="flex-row items-center justify-center gap-3">
                  <View className="h-px flex-1 bg-slate-200 dark:bg-white/10" />
                  <Pressable
                    accessibilityRole="button"
                    onPress={() => {
                      tapHaptic();
                      setSlotA(clampedSlotB);
                      setSlotB(clampedSlotA);
                    }}
                    className="flex-row items-center gap-1 rounded-full border border-slate-200 bg-slate-50 px-3 py-1 dark:border-white/10 dark:bg-slate-800"
                  >
                    <Ionicons
                      name={mode === "move" ? "arrow-down" : "swap-vertical"}
                      size={13}
                      color="#38BDF8"
                    />
                    <Text className="text-[11px] font-semibold text-slate-600 dark:text-slate-300">
                      {mode === "move" ? "对调 A / B" : "互换 A / B"}
                    </Text>
                  </Pressable>
                  <View className="h-px flex-1 bg-slate-200 dark:bg-white/10" />
                </View>

                <DayPickerCard
                  label={
                    mode === "move"
                      ? "目标补课日期（B日 · 移入课程）"
                      : "日期 B"
                  }
                  accent="#A78BFA"
                  schedule={schedule}
                  totalWeeks={totalWeeks}
                  slot={clampedSlotB}
                  onChange={(next) => {
                    setErrorMsg("");
                    setSlotB(next);
                  }}
                  courseCount={coursesB.length}
                />
              </>
            ) : null}

            {/* 移动模式：是否覆盖目标日 */}
            {mode === "move" ? (
              <Pressable
                accessibilityRole="switch"
                accessibilityState={{ checked: replaceTargetDay }}
                onPress={() => {
                  selectHaptic();
                  setReplaceTargetDay((v) => !v);
                }}
                className="flex-row items-center justify-between rounded-2xl border border-slate-200/80 bg-slate-50/90 px-3.5 py-3 dark:border-white/10 dark:bg-slate-800/70"
              >
                <View className="flex-1 pr-3">
                  <Text className="text-[12.5px] font-semibold text-slate-800 dark:text-slate-100">
                    覆盖目标日原有课程
                  </Text>
                  <Text className="mt-0.5 text-[10.5px] text-slate-500 dark:text-slate-400">
                    {replaceTargetDay
                      ? "开启：将清空目标补课日原有课程，仅保留调入的课程"
                      : "关闭：保留目标日原有课程，调入的课程与之并存"}
                  </Text>
                </View>
                <View
                  className={`h-6 w-11 justify-center rounded-full px-0.5 ${
                    replaceTargetDay
                      ? "items-end bg-sky-600"
                      : "items-start bg-slate-300 dark:bg-slate-600"
                  }`}
                >
                  <View className="h-5 w-5 rounded-full bg-white" />
                </View>
              </Pressable>
            ) : null}

            {/* 实时预览区 */}
            <View className="rounded-2xl border border-slate-200/80 bg-slate-50/80 p-3.5 dark:border-white/10 dark:bg-slate-800/50">
              <Text className="text-[12.5px] font-bold text-slate-800 dark:text-slate-100">
                变更预览
              </Text>

              {mode !== "cancel" && sameDay ? (
                <Text className="mt-2 text-[11.5px] text-amber-600 dark:text-amber-300">
                  日期 A 与日期 B 相同，请选择两个不同的日期。
                </Text>
              ) : mode === "cancel" ? (
                coursesA.length === 0 ? (
                  <Text className="mt-2 text-[11.5px] text-slate-500 dark:text-slate-400">
                    {formatDateLabel(dateAIso)} 当天没有排课，无需停课操作。
                  </Text>
                ) : (
                  <View className="mt-2 gap-2">
                    <Text className="text-[11px] text-slate-500 dark:text-slate-400">
                      将取消以下 {coursesA.length} 门课在 {formatDateLabel(dateAIso)} 的上课安排：
                    </Text>
                    {coursesA.map((c) => (
                      <PreviewCourseRow
                        key={c.id}
                        course={c}
                        schedule={schedule}
                        tag={c.weeks.length > 1 ? `保留其余 ${c.weeks.length - 1} 周` : "仅此一周将移除"}
                        tagTone="rose"
                      />
                    ))}
                  </View>
                )
              ) : mode === "move" ? (
                <View className="mt-2 gap-2">
                  {coursesA.length === 0 ? (
                    <Text className="text-[11.5px] text-slate-500 dark:text-slate-400">
                      原上课日（{formatDateLabel(dateAIso)}）当天无课。
                    </Text>
                  ) : (
                    <>
                      <Text className="text-[11px] text-slate-500 dark:text-slate-400">
                        将以下 {coursesA.length} 门课从 {formatDateLabel(dateAIso)} 移至{" "}
                        {formatDateLabel(dateBIso)}：
                      </Text>
                      {coursesA.map((c) => (
                        <PreviewCourseRow
                          key={c.id}
                          course={c}
                          schedule={schedule}
                          tag={`移至第${clampedSlotB.week}周${WEEKDAY_LABELS[clampedSlotB.weekday - 1]}`}
                          tagTone="sky"
                        />
                      ))}
                    </>
                  )}
                  {coursesB.length > 0 ? (
                    <View className="mt-1 gap-1.5">
                      <Text
                        className={`text-[11px] font-medium ${
                          replaceTargetDay
                            ? "text-rose-600 dark:text-rose-300"
                            : "text-amber-600 dark:text-amber-300"
                        }`}
                      >
                        {replaceTargetDay
                          ? `目标日原有 ${coursesB.length} 门课将被清空：`
                          : `目标日原有 ${coursesB.length} 门课将保留并存：`}
                      </Text>
                      {coursesB.map((c) => (
                        <PreviewCourseRow
                          key={`b-${c.id}`}
                          course={c}
                          schedule={schedule}
                          tag={replaceTargetDay ? "当日清空" : "保留并存"}
                          tagTone={replaceTargetDay ? "rose" : "amber"}
                        />
                      ))}
                    </View>
                  ) : null}
                </View>
              ) : (
                <View className="mt-2 gap-2">
                  {coursesA.length === 0 && coursesB.length === 0 ? (
                    <Text className="text-[11.5px] text-slate-500 dark:text-slate-400">
                      这两天均无课程安排。
                    </Text>
                  ) : (
                    <>
                      <Text className="text-[11px] text-slate-500 dark:text-slate-400">
                        {formatDateLabel(dateAIso)}（{coursesA.length} 门） ⇄{" "}
                        {formatDateLabel(dateBIso)}（{coursesB.length} 门）
                      </Text>
                      {coursesA.map((c) => (
                        <PreviewCourseRow
                          key={`sa-${c.id}`}
                          course={c}
                          schedule={schedule}
                          tag={`→ 第${clampedSlotB.week}周${WEEKDAY_LABELS[clampedSlotB.weekday - 1]}`}
                          tagTone="sky"
                        />
                      ))}
                      {coursesB.map((c) => (
                        <PreviewCourseRow
                          key={`sb-${c.id}`}
                          course={c}
                          schedule={schedule}
                          tag={`→ 第${clampedSlotA.week}周${WEEKDAY_LABELS[clampedSlotA.weekday - 1]}`}
                          tagTone="emerald"
                        />
                      ))}
                    </>
                  )}
                </View>
              )}
            </View>

            {errorMsg ? (
              <Text className="text-[12px] font-medium text-rose-500">
                {errorMsg}
              </Text>
            ) : null}
          </ScrollView>

          {/* 底部按钮 */}
          <View className="mt-3 flex-row items-center justify-end gap-2.5 px-5 pt-2">
            <Pressable
              accessibilityRole="button"
              onPress={onClose}
              className="rounded-xl bg-slate-100 px-4 py-2.5 dark:bg-slate-800"
            >
              <Text className="text-[13px] font-semibold text-slate-600 dark:text-slate-300">
                取消
              </Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              disabled={!canApply}
              onPress={handleApply}
              className={`rounded-xl px-5 py-2.5 ${
                mode === "cancel" ? "bg-rose-600" : "bg-sky-600"
              } ${!canApply ? "opacity-40" : ""}`}
            >
              <Text className="text-[13px] font-bold text-white">
                {mode === "cancel"
                  ? "确认整日停课"
                  : mode === "move"
                    ? "确认调休补课"
                    : "确认互换课表"}
              </Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}
