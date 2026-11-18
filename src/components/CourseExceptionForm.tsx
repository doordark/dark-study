import { useState } from "react";
import { Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { useSettings } from "@/store/useSettings";
import { useStore } from "@/store/useStore";
import { commitCourseException } from "@/services/assistantSchedule";
import type { Course, Schedule } from "@/types";
import { occurrenceDate, planCourseException, type CourseException } from "@/utils/courseEditing";
import { uid } from "@/utils/id";

const labels = { move: "只改这一次", cancel: "本次停课", extra: "加一节补课" } as const;
const textStyle = "text-sm text-slate-700 dark:text-slate-200";
const fieldStyle = "min-h-11 rounded-xl bg-slate-400/10 px-3 text-sm text-slate-900 dark:text-white";
const button = (selected = false) => `min-h-10 justify-center rounded-xl px-3 ${selected ? "bg-sky-400/25" : "bg-slate-400/10"}`;

export function CourseExceptionForm({ course, schedule, currentWeek, onClose, onDone }: {
  course: Course; schedule: Schedule; currentWeek: number; onClose: () => void; onDone: () => void;
}) {
  const [kind, setKind] = useState<CourseException["type"]>("move");
  const [week, setWeek] = useState(course.weeks.includes(currentWeek) ? currentWeek : course.weeks[0]);
  const [date, setDate] = useState(() => occurrenceDate(schedule, week, course.weekday));
  const [start, setStart] = useState(String(course.startPeriod));
  const [end, setEnd] = useState(String(course.endPeriod));
  const [classroom, setClassroom] = useState(course.classroom);
  const [preview, setPreview] = useState<ReturnType<typeof planCourseException> | null>(null);
  const [error, setError] = useState("");
  const reminder = useSettings(state => state.reminderEnabled);
  const minutes = useSettings(state => state.reminderMinutes);
  const count = useSettings(state => state.reminderCount);
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
        : { type: kind, week, date: date.trim(), startPeriod: Number(start), endPeriod: Number(end), classroom };
      setPreview(planCourseException(schedule, course, change, uid()));
      setError("");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "请核对课程日期和节次。");
    }
  }
  return <View className="gap-3 pb-4">
    <Text accessibilityRole="header" className="text-lg font-bold text-slate-900 dark:text-white">临时课程调整</Text>
    <Text className={textStyle}>{course.name}</Text>
    {preview ? <>
      {kind !== "extra" ? <Text className={textStyle}>{kind === "cancel" ? "停课" : "原安排"} · {preview.beforeDate} {preview.beforeTime.startTime}–{preview.beforeTime.endTime}</Text> : null}
      {preview.after ? <Text className={textStyle}>新安排 · {preview.after.date} {preview.after.time.startTime}–{preview.after.time.endTime}{classroom.trim() ? ` · ${classroom.trim()}` : ""}</Text> : null}
      {preview.conflicts.length ? <Text className="text-sm text-amber-700 dark:text-amber-300">新时间与 {preview.conflicts.join("、")} 冲突</Text> : null}
      <Text className={textStyle}>{reminder
        ? `${kind === "extra" ? "" : "撤掉原上课提醒"}${kind === "move" ? "，" : ""}${preview.after ? `按新时间提前 ${minutes} 分钟开始提醒，共 ${Math.min(count, minutes)} 次` : ""}。已过去的时间不再提醒。`
        : "应用内上课提醒目前关闭。"} </Text>
    </> : <>
      <View className="flex-row flex-wrap gap-2">{(Object.keys(labels) as CourseException["type"][]).map(value =>
        <Pressable key={value} accessibilityRole="radio" accessibilityState={{ checked: value === kind }} onPress={() => { setKind(value); setError(""); }} className={button(value === kind)}>
          <Text className={textStyle}>{labels[value]}</Text>
        </Pressable>)}</View>
      {kind !== "extra" ? <>
        <Text className={textStyle}>选中要调整的那一次</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} keyboardShouldPersistTaps="handled" contentContainerStyle={{ gap: 8 }}>
          {course.weeks.map(value => <Pressable key={value} accessibilityRole="radio" accessibilityState={{ checked: value === week }} className={button(value === week)} onPress={() => {
            setWeek(value);
            setDate(occurrenceDate(schedule, value, course.weekday));
          }}><Text className={textStyle}>第 {value} 周 · {occurrenceDate(schedule, value, course.weekday).slice(5)}</Text></Pressable>)}
        </ScrollView>
      </> : null}
      {kind !== "cancel" ? <>
        <Text className={textStyle}>新上课日期和节次</Text>
        <TextInput accessibilityLabel="新上课日期" placeholder="YYYY-MM-DD" value={date} onChangeText={setDate} maxLength={10} className={fieldStyle} />
        <View className="flex-row gap-2">
          <TextInput accessibilityLabel="起始节次" value={start} onChangeText={setStart} keyboardType="number-pad" className={`${fieldStyle} flex-1`} />
          <TextInput accessibilityLabel="结束节次" value={end} onChangeText={setEnd} keyboardType="number-pad" className={`${fieldStyle} flex-1`} />
        </View>
        <TextInput accessibilityLabel="新教室" placeholder="教室（可留空）" value={classroom} onChangeText={setClassroom} className={fieldStyle} />
      </> : null}
    </>}
    {error ? <Text accessibilityLiveRegion="polite" className="text-sm text-rose-600 dark:text-rose-300">{error}</Text> : null}
    <View className="flex-row justify-end gap-2">
      <Pressable accessibilityRole="button" onPress={preview ? () => { setPreview(null); setError(""); } : onClose} className={button()}>
        <Text className={textStyle}>{preview ? "返回修改" : "返回课程"}</Text>
      </Pressable>
      <Pressable accessibilityRole="button" onPress={submit} className="min-h-10 justify-center rounded-xl bg-sky-600 px-4">
        <Text className="font-bold text-white">{preview ? "确认调整" : "预览变更"}</Text>
      </Pressable>
    </View>
  </View>;
}
