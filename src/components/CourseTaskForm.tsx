import { useEffect, useRef, useState } from "react";
import { Platform, Pressable, Text, TextInput, View } from "react-native";
import { requestCourseTaskPermission } from "@/services/courseReminders";
import { useStore } from "@/store/useStore";
import { TASK_REMINDERS, TASK_TYPES, taskDueTime, type CourseTask, type CourseTaskLink, type CourseTaskType, type TaskReminder } from "@/utils/courseTasks";
import { addDays, formatClock, toIsoDate } from "@/utils/time";

const inputStyle = "min-h-11 rounded-xl bg-slate-100 px-3 text-sm text-slate-900 dark:bg-slate-800 dark:text-white";
const labelStyle = "text-xs font-semibold text-slate-600 dark:text-slate-300";
const reminders: Record<TaskReminder, string> = { 0: "不提醒", 15: "提前 15 分钟", 60: "提前 1 小时", 1440: "提前 1 天" };

export function CourseTaskForm({ task, course, now, onClose, onDone }: {
  task?: CourseTask;
  course?: CourseTaskLink;
  now: Date;
  onClose: () => void;
  onDone: () => void;
}) {
  const [title, setTitle] = useState(task?.title ?? "");
  const [type, setType] = useState<CourseTaskType>(task?.type ?? "homework");
  const [day, setDay] = useState(() => toIsoDate(task ? new Date(task.dueAt) : now));
  const [time, setTime] = useState(() => task ? formatClock(new Date(task.dueAt)) : "23:59");
  const [reminder, setReminder] = useState<TaskReminder>(task?.reminder ?? 0);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const inFlight = useRef(false);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);
  const link = task?.course ?? course;
  const save = async () => {
    if (inFlight.current) return;
    const dueAt = taskDueTime(day.trim(), time.trim());
    if (!title.trim()) { setError("请输入待办标题。"); return; }
    if (dueAt === null) { setError("请填写有效日期和时间，例如 2026-11-18、18:30。"); return; }
    const timeChanged = task?.dueAt !== dueAt || task?.reminder !== reminder;
    if (reminder && task?.completedAt === undefined && timeChanged && dueAt - reminder * 60000 <= Date.now()) {
      setError("提醒时间已过，请调整截止时间或选择不提醒。");
      return;
    }
    inFlight.current = true;
    setSaving(true);
    setError("");
    try {
      if (Platform.OS !== "web" && reminder && task?.completedAt === undefined && timeChanged && !(await requestCourseTaskPermission())) {
        if (mounted.current) setError("系统未允许通知。可先选择「不提醒」保存，或在系统设置允许后重试。");
        return;
      }
      if (mounted.current) {
        useStore.getState().saveCourseTask({ title, type, dueAt, reminder, course: link }, task?.id);
        onDone();
      }
    } catch (cause) {
      if (mounted.current) setError(cause instanceof Error ? cause.message : "保存失败，请重试。");
    } finally {
      inFlight.current = false;
      if (mounted.current) setSaving(false);
    }
  };

  const choiceStyle = (selected: boolean) => selected ? "rounded-xl bg-sky-400/25 px-3 py-2" : "rounded-xl bg-slate-400/10 px-3 py-2";
  return <View className="gap-3">
    <Text accessibilityRole="header" className="text-lg font-bold text-slate-900 dark:text-white">{task ? "编辑待办" : "添加待办"}</Text>
    {link ? <Text className={labelStyle}>关联课程 · {link.courseName}</Text> : null}
    <TextInput accessibilityLabel="待办标题" placeholder="例如：交数据结构作业" placeholderTextColor="#64748B"
      maxLength={120} value={title} onChangeText={setTitle} className={inputStyle} />
    <View className="flex-row gap-2">
      {(Object.keys(TASK_TYPES) as CourseTaskType[]).map(value => <Pressable key={value} accessibilityRole="radio" accessibilityState={{ checked: type === value }}
        onPress={() => setType(value)} className={choiceStyle(type === value)}>
        <Text className={labelStyle}>{TASK_TYPES[value]}</Text>
      </Pressable>)}
    </View>
    <Text className={labelStyle}>截止时间</Text>
    <View className="flex-row gap-2">
      <TextInput accessibilityLabel="截止日期" placeholder="YYYY-MM-DD" placeholderTextColor="#64748B" value={day} maxLength={10}
        onChangeText={setDay} className={`${inputStyle} flex-1`} />
      <TextInput accessibilityLabel="截止时刻" placeholder="HH:mm" placeholderTextColor="#64748B" value={time} maxLength={5}
        onChangeText={setTime} className={`${inputStyle} w-24`} />
    </View>
    <View className="flex-row gap-2">
      {[0, 1].map(days => <Pressable key={days} accessibilityRole="button" onPress={() => setDay(toIsoDate(addDays(now, days)))} className={choiceStyle(false)}>
        <Text className={labelStyle}>{days ? "明天" : "今天"}</Text>
      </Pressable>)}
    </View>
    <Text className={labelStyle}>到期提醒</Text>
    {Platform.OS === "web" ? <Text className={labelStyle}>到期通知由手机端发送。</Text> : null}
    <View className="flex-row flex-wrap gap-2">
      {TASK_REMINDERS.map(value => <Pressable key={value} accessibilityRole="radio" accessibilityState={{ checked: reminder === value }}
        onPress={() => setReminder(value)} className={choiceStyle(reminder === value)}>
        <Text className={labelStyle}>{reminders[value]}</Text>
      </Pressable>)}
    </View>
    {error ? <Text accessibilityLiveRegion="polite" className="text-sm text-rose-600 dark:text-rose-300">{error}</Text> : null}
    {deleting ? <Text className="text-sm text-rose-600 dark:text-rose-300">删除后会同时取消这条待办的到期提醒。</Text> : null}
    <View className="flex-row flex-wrap justify-end gap-2">
      {task ? <Pressable accessibilityRole="button" disabled={saving} onPress={() => {
        if (!deleting) { setDeleting(true); return; }
        useStore.getState().removeCourseTask(task.id);
        onDone();
      }} className={choiceStyle(false)}><Text className="font-semibold text-rose-600 dark:text-rose-300">{deleting ? "确认删除" : "删除"}</Text></Pressable> : null}
      <Pressable accessibilityRole="button" disabled={saving} onPress={onClose} className={choiceStyle(false)}>
        <Text className={labelStyle}>取消</Text>
      </Pressable>
      <Pressable accessibilityRole="button" disabled={saving} onPress={() => void save()} className="rounded-xl bg-sky-600 px-4 py-2">
        <Text className="font-bold text-white">{saving ? "保存中…" : "保存待办"}</Text>
      </Pressable>
    </View>
  </View>;
}
