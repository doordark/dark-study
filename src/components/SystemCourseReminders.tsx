import { useState } from "react";
import { Alert, Pressable, ScrollView, Text, View } from "react-native";
import { useActiveSchedule } from "@/store/useStore";
import { useSettings } from "@/store/useSettings";
import { upcomingWidgetCourses } from "@/utils/courseWidget";
import { openCourseAlarm, openCourseCalendar } from "@/services/systemCourseReminders";

export function SystemCourseReminders() {
  const schedule = useActiveSchedule();
  const minutes = useSettings(s => s.reminderMinutes);
  const [expanded, setExpanded] = useState(false);
  const [busy, setBusy] = useState(false);
  const courses = expanded ? upcomingWidgetCourses(schedule).slice(0,30) : [];
  return <View className="mt-3">
    <Pressable onPress={() => setExpanded(v => !v)}><Text className="py-2 font-semibold text-sky-600 dark:text-sky-300">{expanded ? "收起" : "添加到手机闹钟 / 日程"}</Text></Pressable>
    {expanded && <>
      <Text className="mb-2 text-xs text-slate-500 dark:text-slate-400">选择一次上课，在系统界面确认保存。闹钟提前 {minutes} 分钟，仅支持未来 24 小时；日程支持指定日期。已保存的系统记录需在调课后手动更新。</Text>
      {!courses.length && <Text className="text-xs text-slate-500">当前课表没有待上课程</Text>}
      <ScrollView style={{ maxHeight: 320 }} nestedScrollEnabled>{courses.map(c => <View key={c.id} className="mb-3 rounded-xl bg-slate-400/10 p-3">
        <Text className="font-semibold text-slate-700 dark:text-slate-200">{c.name}</Text>
        <Text className="my-1 text-xs text-slate-500 dark:text-slate-400">{new Date(c.start).toLocaleDateString()} · {c.time} · {c.classroom}</Text>
        <View className="flex-row gap-5">{(["alarm","calendar"] as const).map(kind => <Pressable key={kind} disabled={busy} onPress={async () => {
          setBusy(true);
          try { await (kind === "alarm" ? openCourseAlarm(c,minutes) : openCourseCalendar(c,minutes)); }
          catch(error) { Alert.alert("无法打开系统提醒", error instanceof Error ? error.message : "未找到支持此操作的时钟或日历应用"); }
          finally { setBusy(false); }
        }}><Text className="py-2 text-sky-600 dark:text-sky-300">{kind === "alarm" ? "设置闹钟" : "添加日程"}</Text></Pressable>)}</View>
      </View>)}</ScrollView>
    </>}
  </View>;
}
