import { useMemo, useRef, useState } from "react";
import { Alert, Pressable, ScrollView, Text, View } from "react-native";
import { useActiveSchedule } from "@/store/useStore";
import { useSettings } from "@/store/useSettings";
import { upcomingWidgetCourses } from "@/utils/courseWidget";
import { canImportAlarm, importCourseAlarms, importCourseCalendar } from "@/services/systemCourseReminders";
import { useForegroundClock } from "@/hooks/useForegroundClock";

export function SystemCourseReminders() {
  const schedule = useActiveSchedule();
  const minutes = useSettings(s => s.reminderMinutes);
  return <CourseSelection key={schedule?.id ?? "empty"} schedule={schedule} minutes={minutes} />;
}

function CourseSelection({ schedule, minutes }: { schedule: ReturnType<typeof useActiveSchedule>; minutes: number }) {
  const [expanded, setExpanded] = useState(false);
  const [busy, setBusy] = useState(false);
  const lock = useRef(false);
  const [selected, setSelected] = useState<string[]>([]);
  const now = useForegroundClock(30000);
  const courses = useMemo(() => expanded ? upcomingWidgetCourses(schedule, now).filter(c => c.start > now.getTime()) : [], [expanded, schedule, now]);
  const selectedIds = useMemo(() => new Set(selected), [selected]);
  const picked = courses.filter(c => selectedIds.has(c.id));
  const alarmCount = picked.filter(c => canImportAlarm(c, minutes, now.getTime())).length;
  const run = async (kind: "alarm" | "calendar" | "both") => {
    if (lock.current || !picked.length || !schedule) return;
    lock.current = true;
    setBusy(true);
    try {
      const messages: string[] = [];
      const kinds: ("alarm" | "calendar")[] = kind === "both" ? ["calendar", "alarm"] : [kind];
      for (const target of kinds) {
        try {
          const result = await (target === "alarm" ? importCourseAlarms(picked, minutes) : importCourseCalendar(picked, minutes, schedule.id));
          messages.push(`${target === "alarm" ? "闹钟已提交" : "日程已写入或更新"} ${result.completed} 项，跳过 ${result.skipped} 项，失败 ${result.failures.length} 项。${result.failures.length ? `\n${result.failures.slice(0, 3).join("\n")}` : ""}`);
        } catch (error) {
          messages.push(`${target === "alarm" ? "闹钟" : "日程"}导入失败：${error instanceof Error ? error.message : "无法访问系统提醒"}`);
        }
      }
      messages.push("日程可在系统日历的「Dark Study 课程」中查看；请在系统时钟中检查闹钟是否已保存和开启。");
      Alert.alert("课程导入结果", messages.join("\n\n"));
    } finally { lock.current = false; setBusy(false); }
  };
  return <View className="mt-3">
    <Pressable disabled={busy} onPress={() => setExpanded(v => !v)}><Text className="py-2 font-semibold text-sky-600 dark:text-sky-300">{expanded ? "收起课程导入" : "添加到手机闹钟 / 日程"}</Text></Pressable>
    {expanded && <>
      <Text className="mb-2 text-xs text-slate-500 dark:text-slate-400">勾选要导入的上课安排，统一提前 {minutes} 分钟提醒。闹钟仅支持提醒时间在未来 24 小时内的课程；日程可导入本学期全部待上课程，重复导入会更新已有日程。调课或删课后，请检查系统记录。</Text>
      <View className="mb-2 flex-row flex-wrap gap-4">
        <Pressable disabled={busy} onPress={() => setSelected(picked.length === courses.length ? [] : courses.map(c => c.id))}><Text className="py-2 text-sky-600 dark:text-sky-300">{picked.length === courses.length && courses.length ? "取消全选" : "全选课程"}</Text></Pressable>
        <Pressable disabled={busy} onPress={() => setSelected(courses.filter(c => canImportAlarm(c, minutes, now.getTime())).map(c => c.id))}><Text className="py-2 text-sky-600 dark:text-sky-300">仅选可设闹钟课程</Text></Pressable>
      </View>
      <Text className="mb-2 text-xs text-slate-500 dark:text-slate-400">已选 {picked.length} / {courses.length} 次上课 · 可设闹钟 {alarmCount} 次</Text>
      {!courses.length && <Text className="text-xs text-slate-500">当前课表没有待上课程</Text>}
      <ScrollView style={{ maxHeight: 320 }} nestedScrollEnabled>{courses.map(c => <Pressable key={c.id} disabled={busy} accessibilityRole="checkbox" accessibilityState={{ checked: selectedIds.has(c.id), disabled: busy }}
        onPress={() => setSelected(prev => prev.includes(c.id) ? prev.filter(id => id !== c.id) : [...prev, c.id])}
        className={`mb-2 rounded-xl p-3 ${selectedIds.has(c.id) ? "bg-sky-400/20" : "bg-slate-400/10"}`}>
        <Text className="font-semibold text-slate-700 dark:text-slate-200">{selectedIds.has(c.id) ? "☑" : "□"} {c.name}</Text>
        <Text className="mt-1 text-xs text-slate-500 dark:text-slate-400">{new Date(c.start).toLocaleDateString()} · {c.time} · {c.classroom}</Text>
        <Text className="mt-1 text-xs text-slate-500 dark:text-slate-400">{canImportAlarm(c, minutes, now.getTime()) ? "可导入闹钟与日程" : "仅可导入日程"}</Text>
      </Pressable>)}</ScrollView>
      <View className="mt-2 flex-row flex-wrap gap-3">
        <Pressable disabled={busy || !picked.length} onPress={() => void run("both")} className={`rounded-xl bg-sky-600 px-4 py-3 ${busy || !picked.length ? "opacity-40" : ""}`}><Text className="font-semibold text-white">{busy ? "正在导入…" : "一键导入闹钟 + 日程"}</Text></Pressable>
        <Pressable disabled={busy || !alarmCount} onPress={() => void run("alarm")} className={`rounded-xl bg-sky-500 px-4 py-3 ${busy || !alarmCount ? "opacity-40" : ""}`}><Text className="font-semibold text-white">{busy ? "正在导入…" : `一键导入闹钟（${alarmCount}）`}</Text></Pressable>
        <Pressable disabled={busy || !picked.length} onPress={() => void run("calendar")} className={`rounded-xl bg-sky-500 px-4 py-3 ${busy || !picked.length ? "opacity-40" : ""}`}><Text className="font-semibold text-white">{busy ? "正在导入…" : `一键导入日程（${picked.length}）`}</Text></Pressable>
      </View>
    </>}
  </View>;
}
