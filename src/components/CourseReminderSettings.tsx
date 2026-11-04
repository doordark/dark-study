import * as Notifications from "expo-notifications";
import { useCallback, useEffect, useState } from "react";
import { Alert, AppState, Linking, Platform, Pressable, Text, View } from "react-native";
import { GlassContainer } from "@/components/GlassContainer";
import { prepareReminderChannel } from "@/services/courseReminders";
import { useSettings } from "@/store/useSettings";

export function CourseReminderSettings() {
  const enabled = useSettings((s) => s.reminderEnabled);
  const minutes = useSettings((s) => s.reminderMinutes);
  const count = useSettings((s) => s.reminderCount);
  const setReminder = useSettings((s) => s.setReminder);
  const [permission, setPermission] = useState(false);
  const [exact, setExact] = useState(false);
  const refresh = useCallback(async () => {
    if (Platform.OS !== "android") return;
    try {
      const p = await Notifications.getPermissionsAsync();
      setPermission(p.granted);
      setExact((await Notifications.getExactAlarmPermissionsAsync()).granted);
    } catch (error) { console.warn("无法读取课程提醒权限", error); }
  }, []);
  useEffect(() => {
    const timer = setTimeout(() => { void refresh(); }, 0);
    const sub = AppState.addEventListener("change", (state) => { if (state === "active") void refresh(); });
    return () => { clearTimeout(timer); sub.remove(); };
  }, [refresh]);
  const enable = async () => {
    if (enabled) { setReminder({ reminderEnabled: false }); return; }
    try {
      await prepareReminderChannel();
      let p = await Notifications.getPermissionsAsync();
      if (!p.granted && p.canAskAgain) p = await Notifications.requestPermissionsAsync();
      if (!p.granted) {
        Alert.alert("需要通知权限", "请在系统设置中允许 Dark Study 发送通知。", [
          { text: "取消", style: "cancel" }, { text: "打开设置", onPress: () => { void Linking.openSettings(); } },
        ]);
        return;
      }
      setReminder({ reminderEnabled: true });
      await refresh();
    } catch { Alert.alert("无法开启提醒", "请检查系统通知权限后重试。"); }
  };
  const askExact = async () => {
    try { await Notifications.requestExactAlarmPermissionsAsync(); await refresh(); }
    catch { Alert.alert("无法打开设置", "请在系统设置中允许闹钟和提醒。"); }
  };
  if (Platform.OS !== "android") return null;
  return (
    <View style={{ marginBottom: 14 }}>
      <GlassContainer radius={24} intensity={42} borderOpacity={0.22}>
        <View className="px-4 py-4">
          <View className="flex-row items-center justify-between">
            <View className="flex-1"><Text className="text-[14px] font-bold text-slate-800 dark:text-white">上课提醒</Text>
              <Text className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">根据当前课表在上课前发送通知</Text></View>
            <Pressable onPress={() => { void enable(); }} accessibilityRole="switch" accessibilityState={{ checked: enabled }} className="rounded-xl bg-sky-400/20 px-3 py-2">
              <Text className="font-bold text-sky-600 dark:text-sky-300">{enabled ? "已开启" : "开启"}</Text>
            </Pressable>
          </View>
          {enabled && <>
            <Text className="mt-4 text-[12px] font-semibold text-slate-700 dark:text-slate-200">首次提前多久</Text>
            <View className="mt-2 flex-row flex-wrap gap-2">{[5, 10, 15, 30, 60].map((n) => <Pressable key={n} onPress={() => setReminder({ reminderMinutes: n })} className={`rounded-xl px-3 py-2 ${minutes === n ? "bg-sky-400/30" : "bg-slate-400/10"}`}><Text className="text-[12px] text-slate-700 dark:text-slate-200">{n} 分钟</Text></Pressable>)}</View>
            <Text className="mt-4 text-[12px] font-semibold text-slate-700 dark:text-slate-200">提醒次数</Text>
            <View className="mt-2 flex-row gap-2">{[1, 2, 3].map((n) => <Pressable key={n} onPress={() => setReminder({ reminderCount: n })} className={`rounded-xl px-4 py-2 ${count === n ? "bg-sky-400/30" : "bg-slate-400/10"}`}><Text className="text-[12px] text-slate-700 dark:text-slate-200">{n} 次</Text></Pressable>)}</View>
            <Text className="mt-2 text-[11px] text-slate-500 dark:text-slate-400">多次提醒会从首次提醒到上课前均匀分布。</Text>
            {!permission && <Pressable onPress={() => { void Linking.openSettings(); }}><Text className="mt-3 text-[11px] text-amber-600 dark:text-amber-300">通知权限已关闭，点击前往系统设置</Text></Pressable>}
            {!exact && <Pressable onPress={() => { void askExact(); }}><Text className="mt-3 text-[11px] text-amber-600 dark:text-amber-300">允许「闹钟和提醒」可提高准时性，点击设置</Text></Pressable>}
            <Text className="mt-2 text-[11px] text-slate-500 dark:text-slate-400">大量课程会优先安排近期提醒，定期打开应用可补充后续提醒。弹窗、声音及后台运行受系统设置和省电策略影响。</Text>
          </>}
        </View>
      </GlassContainer>
    </View>
  );
}
