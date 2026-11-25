import DateTimePicker, {
  DateTimePickerAndroid,
} from "@react-native-community/datetimepicker";
import { useState } from "react";
import { Platform, Pressable, ScrollView, Text, TextInput, View } from "react-native";

import { useSettings } from "@/store/useSettings";
import { useStore } from "@/store/useStore";
import { commitCourseException } from "@/services/assistantSchedule";
import type { Course, Schedule } from "@/types";
import { occurrenceDate, planCourseException, type CourseException } from "@/utils/courseEditing";
import { uid } from "@/utils/id";
import { formatDateLabel, parseIsoDate, toIsoDate } from "@/utils/time";

const labels = { move: "只改这一次", cancel: "本次停课", extra: "加一节补课" } as const;
const textStyle = "text-sm text-slate-700 dark:text-slate-200";
const fieldStyle = "min-h-11 rounded-xl border border-slate-300/30 bg-white/40 px-3 text-sm text-slate-900 dark:border-white/10 dark:bg-white/[0.06] dark:text-white";
const pillBtn = (selected = false) =>
  `min-h-10 justify-center rounded-xl border px-3 ${
    selected
      ? "border-sky-500/70 bg-sky-500/20"
      : "border-slate-300/30 bg-slate-400/10 dark:border-white/10"
  }`;

export function CourseExceptionForm({ course, schedule, currentWeek, onClose, onDone }: {
  course: Course; schedule: Schedule; currentWeek: number; onClose: () => void; onDone: () => void;
}) {
  const [kind, setKind] = useState<CourseException["type"]>("move");
  const [week, setWeek] = useState(course.weeks.includes(currentWeek) ? currentWeek : course.weeks[0]);
  const [date, setDate] = useState(() => occurrenceDate(schedule, week, course.weekday));
  const [startPeriod, setStartPeriod] = useState(course.startPeriod);
  const [endPeriod, setEndPeriod] = useState(course.endPeriod);
  const [classroom, setClassroom] = useState(course.classroom);
  const [iosDateOpen, setIosDateOpen] = useState(false);
  const [preview, setPreview] = useState<ReturnType<typeof planCourseException> | null>(null);
  const [error, setError] = useState("");
  const reminder = useSettings(state => state.reminderEnabled);
  const minutes = useSettings(state => state.reminderMinutes);
  const count = useSettings(state => state.reminderCount);
  const periodOptions = schedule.periods.map((p) => p.index);

  const openDatePicker = () => {
    const parsed = parseIsoDate(date);
    const current = Number.isFinite(parsed.getTime()) ? parsed : new Date();
    if (Platform.OS === "android") {
      DateTimePickerAndroid.open({
        value: current,
        mode: "date",
        onValueChange: (_e, selected) => {
          if (selected) {
            setDate(toIsoDate(selected));
            setError("");
          }
        },
      });
    } else if (Platform.OS === "ios") {
      setIosDateOpen(true);
    }
  };

  function submit() {
    const state = useStore.getState();
    if (state.activeScheduleId !== schedule.id || state.schedules.find(row => row.id === schedule.id) !== (preview?.base ?? schedule)) {
      setError("课表已更新，请退出并重新打开这门课。");
      return;
    }
    if (preview) {
      const action = kind === "move" ? "临时调课" : kind === "cancel" ? "本次停课" : "添加补课";
      if (!commitCourseException(preview, `${action} · ${course.name}`)) {
        setError("课表已更新，请退出并重新打开这门课。");
        return;
      }
      onDone();
      return;
    }
    try {
      const change = kind === "cancel" ? { type: kind, week } as const
        : { type: kind, week, date: date.trim(), startPeriod, endPeriod, classroom };
      setPreview(planCourseException(schedule, course, change, uid()));
      setError("");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "请核对课程日期和节次。");
    }
  }

  return (
    <View className="gap-3 pb-4">
      <Text accessibilityRole="header" className="text-lg font-bold text-slate-900 dark:text-white">
        临时课程调整
      </Text>
      <Text className="text-xs font-semibold text-slate-500 dark:text-slate-400">
        {course.name}
      </Text>
      {preview ? (
        <View className="gap-2 rounded-2xl border border-slate-300/30 bg-white/30 p-3.5 dark:border-white/10 dark:bg-white/[0.05]">
          {kind !== "extra" ? (
            <Text className={textStyle}>
              {kind === "cancel" ? "停课" : "原安排"} · {preview.beforeDate} {preview.beforeTime.startTime}–{preview.beforeTime.endTime}
            </Text>
          ) : null}
          {preview.after ? (
            <Text className="text-sm font-semibold text-sky-700 dark:text-sky-300">
              新安排 · {preview.after.date} {preview.after.time.startTime}–{preview.after.time.endTime}
              {classroom.trim() ? ` · ${classroom.trim()}` : ""}
            </Text>
          ) : null}
          {preview.conflicts.length ? (
            <Text className="text-xs font-semibold text-amber-700 dark:text-amber-300">
              ⚠ 新时间与 {preview.conflicts.join("、")} 冲突
            </Text>
          ) : null}
          <Text className="text-xs text-slate-500 dark:text-slate-400">
            {reminder
              ? `${kind === "extra" ? "" : "撤掉原上课提醒"}${kind === "move" ? "，" : ""}${preview.after ? `按新时间提前 ${minutes} 分钟开始提醒，共 ${Math.min(count, minutes)} 次` : ""}。已过去的时间不再提醒。`
              : "应用内上课提醒目前关闭。"}
          </Text>
        </View>
      ) : (
        <>
          <View className="flex-row flex-wrap gap-2">
            {(Object.keys(labels) as CourseException["type"][]).map(value => (
              <Pressable
                key={value}
                accessibilityRole="radio"
                accessibilityState={{ checked: value === kind }}
                onPress={() => { setKind(value); setError(""); }}
                className={pillBtn(value === kind)}
              >
                <Text className={`text-xs font-semibold ${value === kind ? "text-sky-700 dark:text-sky-300" : "text-slate-600 dark:text-slate-300"}`}>
                  {labels[value]}
                </Text>
              </Pressable>
            ))}
          </View>

          {kind !== "extra" ? (
            <>
              <Text className="text-xs font-semibold text-slate-500 dark:text-slate-400">
                选中要调整的那一次
              </Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} keyboardShouldPersistTaps="handled" contentContainerStyle={{ gap: 8 }}>
                {course.weeks.map(value => {
                  const sel = value === week;
                  return (
                    <Pressable
                      key={value}
                      accessibilityRole="radio"
                      accessibilityState={{ checked: sel }}
                      className={pillBtn(sel)}
                      onPress={() => {
                        setWeek(value);
                        setDate(occurrenceDate(schedule, value, course.weekday));
                      }}
                    >
                      <Text className={`text-xs font-semibold ${sel ? "text-sky-700 dark:text-sky-300" : "text-slate-600 dark:text-slate-300"}`}>
                        第 {value} 周 · {occurrenceDate(schedule, value, course.weekday).slice(5)}
                      </Text>
                    </Pressable>
                  );
                })}
              </ScrollView>
            </>
          ) : null}

          {kind !== "cancel" ? (
            <>
              <Text className="text-xs font-semibold text-slate-500 dark:text-slate-400">
                新上课日期
              </Text>
              {Platform.OS === "web" ? (
                <TextInput
                  accessibilityLabel="新上课日期"
                  placeholder="YYYY-MM-DD"
                  placeholderTextColor="#94A3B8"
                  value={date}
                  onChangeText={setDate}
                  maxLength={10}
                  className={fieldStyle}
                />
              ) : (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="选择新上课日期"
                  onPress={openDatePicker}
                  className="min-h-11 flex-row items-center justify-between rounded-xl border border-slate-300/30 bg-white/40 px-3.5 dark:border-white/10 dark:bg-white/[0.06]"
                >
                  <Text className="text-sm font-semibold text-slate-800 dark:text-slate-100">
                    {/^\d{4}-\d{2}-\d{2}$/.test(date) ? formatDateLabel(date) : date || "选择日期"}
                  </Text>
                  <Text className="text-xs font-semibold text-sky-600 dark:text-sky-300">
                    修改日期
                  </Text>
                </Pressable>
              )}

              {iosDateOpen ? (
                <View className="rounded-2xl border border-slate-300/30 bg-white/35 p-2 dark:border-white/10 dark:bg-white/[0.06]">
                  <DateTimePicker
                    value={Number.isFinite(parseIsoDate(date).getTime()) ? parseIsoDate(date) : new Date()}
                    mode="date"
                    onValueChange={(_e, selected) => {
                      if (selected) setDate(toIsoDate(selected));
                    }}
                    onDismiss={() => setIosDateOpen(false)}
                  />
                  <Pressable
                    onPress={() => setIosDateOpen(false)}
                    className="mt-1 items-center rounded-xl bg-sky-500/20 py-2"
                  >
                    <Text className="text-xs font-bold text-sky-700 dark:text-sky-300">完成</Text>
                  </Pressable>
                </View>
              ) : null}

              <View className="flex-row gap-3">
                <View className="flex-1">
                  <Text className="mb-1.5 text-xs font-semibold text-slate-500 dark:text-slate-400">
                    开始节次 · 第{startPeriod}节
                  </Text>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} keyboardShouldPersistTaps="handled">
                    <View className="flex-row gap-1.5">
                      {periodOptions.map((p) => {
                        const sel = startPeriod === p;
                        return (
                          <Pressable
                            key={p}
                            onPress={() => {
                              setStartPeriod(p);
                              if (endPeriod < p) setEndPeriod(p);
                            }}
                            className={`h-8 w-8 items-center justify-center rounded-lg border ${
                              sel ? "border-sky-500/70 bg-sky-500/20" : "border-slate-300/30 bg-white/25 dark:border-white/10 dark:bg-white/[0.06]"
                            }`}
                          >
                            <Text className={`text-xs font-semibold ${sel ? "text-sky-700 dark:text-sky-300" : "text-slate-600 dark:text-slate-400"}`}>
                              {p}
                            </Text>
                          </Pressable>
                        );
                      })}
                    </View>
                  </ScrollView>
                </View>
                <View className="flex-1">
                  <Text className="mb-1.5 text-xs font-semibold text-slate-500 dark:text-slate-400">
                    结束节次 · 第{endPeriod}节
                  </Text>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} keyboardShouldPersistTaps="handled">
                    <View className="flex-row gap-1.5">
                      {periodOptions.map((p) => {
                        const sel = endPeriod === p;
                        const disabled = p < startPeriod;
                        return (
                          <Pressable
                            key={p}
                            disabled={disabled}
                            onPress={() => setEndPeriod(p)}
                            className={`h-8 w-8 items-center justify-center rounded-lg border ${
                              sel ? "border-sky-500/70 bg-sky-500/20" : "border-slate-300/30 bg-white/25 dark:border-white/10 dark:bg-white/[0.06]"
                            } ${disabled ? "opacity-30" : ""}`}
                          >
                            <Text className={`text-xs font-semibold ${sel ? "text-sky-700 dark:text-sky-300" : "text-slate-600 dark:text-slate-400"}`}>
                              {p}
                            </Text>
                          </Pressable>
                        );
                      })}
                    </View>
                  </ScrollView>
                </View>
              </View>

              <Text className="text-xs font-semibold text-slate-500 dark:text-slate-400">
                新教室（可留空）
              </Text>
              <TextInput
                accessibilityLabel="新教室"
                placeholder="教室（可留空）"
                placeholderTextColor="#94A3B8"
                value={classroom}
                onChangeText={setClassroom}
                className={fieldStyle}
              />
            </>
          ) : null}
        </>
      )}
      {error ? (
        <Text accessibilityLiveRegion="polite" className="text-xs font-semibold text-rose-600 dark:text-rose-300">
          {error}
        </Text>
      ) : null}
      <View className="mt-1 flex-row justify-end gap-2">
        <Pressable
          accessibilityRole="button"
          onPress={preview ? () => { setPreview(null); setError(""); } : onClose}
          className={pillBtn()}
        >
          <Text className={textStyle}>{preview ? "返回修改" : "返回课程"}</Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          onPress={submit}
          className="min-h-10 justify-center rounded-xl bg-sky-600 px-4"
        >
          <Text className="font-bold text-white">{preview ? "确认调整" : "预览变更"}</Text>
        </Pressable>
      </View>
    </View>
  );
}
