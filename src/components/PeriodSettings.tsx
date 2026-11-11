import { useState } from "react";
import { Alert, Pressable, Text, TextInput, View } from "react-native";
import { router } from "expo-router";
import { GlassContainer } from "@/components/GlassContainer";
import { useActiveSchedule, useStore } from "@/store/useStore";
import type { Period } from "@/types";

export function PeriodSettings() {
  const schedule = useActiveSchedule();
  return <PeriodEditor key={`${schedule.id}:${JSON.stringify(schedule.periods)}`} scheduleId={schedule.id} periods={schedule.periods} />;
}
function PeriodEditor({ scheduleId, periods }: { scheduleId: string; periods: Period[] }) {
  const [draft, setDraft] = useState(() => periods.map(p => ({ ...p })));
  const [editing, setEditing] = useState(false);
  const update = (i: number, key: "label" | "startTime" | "endTime", value: string) => setDraft(prev => prev.map((p,j) => j === i ? { ...p, [key]: value } : p));
  return <View className="my-3"><GlassContainer radius={24} intensity={42} borderOpacity={0.22}><View className="p-4">
    <Text className="text-sm font-bold text-slate-800 dark:text-white">作息时间表</Text>
    <Text className="my-2 text-xs text-slate-500 dark:text-slate-400">当前课表的节次与起止时间；修改后课表、助手、小组件与上课提醒一起更新。单独设置精确时间的调课会保留该时间。</Text>
    {(editing ? draft : periods).map((p,i) => <View key={p.index} className="mb-2 flex-row items-center gap-2">
      <Text className="text-xs text-slate-500">{p.index}</Text>
      {editing ? <>
        <TextInput accessibilityLabel={`第${p.index}节名称`} value={p.label} onChangeText={v => update(i,"label",v)} className="flex-1 rounded-lg bg-slate-400/10 p-2 text-slate-800 dark:text-white" />
        <TextInput accessibilityLabel={`第${p.index}节开始时间`} value={p.startTime} onChangeText={v => update(i,"startTime",v)} placeholder="08:00" maxLength={5} className="w-20 rounded-lg bg-slate-400/10 p-2 text-slate-800 dark:text-white" />
        <TextInput accessibilityLabel={`第${p.index}节结束时间`} value={p.endTime} onChangeText={v => update(i,"endTime",v)} placeholder="08:45" maxLength={5} className="w-20 rounded-lg bg-slate-400/10 p-2 text-slate-800 dark:text-white" />
      </> : <Text className="flex-1 text-sm text-slate-700 dark:text-slate-200">{p.label}　{p.startTime} – {p.endTime}</Text>}
    </View>)}
    {editing && <View className="mb-2 flex-row gap-3">
      <Pressable onPress={() => setDraft(prev => [...prev, { index: prev.length+1, label: `第${prev.length+1}节`, startTime: "", endTime: "" }])}><Text className="py-2 text-sky-600 dark:text-sky-300">添加节次</Text></Pressable>
      <Pressable onPress={() => setDraft(prev => prev.slice(0,-1))}><Text className="py-2 text-rose-500">删除末节</Text></Pressable>
    </View>}
    <View className="flex-row flex-wrap gap-3">
      <Pressable onPress={() => {
        if (!editing) { setEditing(true); return; }
        try {
          if (useStore.getState().activeScheduleId !== scheduleId) throw new Error("课表已切换，请重新编辑");
          useStore.getState().setPeriods(draft);
          setEditing(false);
          Alert.alert("作息已保存");
        } catch(error) { Alert.alert("无法保存作息", error instanceof Error ? error.message : "作息时间无效"); }
      }} className="rounded-xl bg-sky-400/20 p-3"><Text className="text-sky-600 dark:text-sky-300">{editing ? "保存作息" : "编辑作息"}</Text></Pressable>
      {editing && <Pressable onPress={() => { setDraft(periods.map(p => ({ ...p }))); setEditing(false); }} className="p-3"><Text className="text-slate-500">取消</Text></Pressable>}
      {!editing && <Pressable onPress={() => router.push("/import")} className="rounded-xl bg-violet-400/20 p-3"><Text className="text-violet-600 dark:text-violet-300">导入作息表</Text></Pressable>}
    </View>
  </View></GlassContainer></View>;
}
