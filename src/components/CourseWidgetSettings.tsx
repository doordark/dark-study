import { useEffect, useMemo, useState } from "react";
import { useForegroundClock } from "@/hooks/useForegroundClock";
import { Alert, AppState, Platform, Pressable, Text, View } from "react-native";
import { GlassContainer } from "@/components/GlassContainer";
import { courseWidgetsAvailable, getCourseWidgetStatus, openWidgetPermissions, pinCourseWidget, syncCourseWidgets, type WidgetStatus } from "@/services/courseWidget";
import { useActiveSchedule } from "@/store/useStore";
import { useWidgetSettings } from "@/store/useWidgetSettings";
import { upcomingWidgetCourses, widgetDayLabel, WIDGET_SHAPES } from "@/utils/courseWidget";

export function CourseWidgetSettings() {
  const schedule = useActiveSchedule();
  const shape = useWidgetSettings((s) => s.shape);
  const theme = useWidgetSettings((s) => s.theme);
  const count = useWidgetSettings((s) => s.count);
  const setShape = useWidgetSettings((s) => s.setShape);
  const setTheme = useWidgetSettings((s) => s.setTheme);
  const setCount = useWidgetSettings((s) => s.setCount);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<WidgetStatus | null>(null);
  const [message, setMessage] = useState("");
  useEffect(() => {
    let active = true;
    const refresh = () => { void getCourseWidgetStatus().then((value) => { if (active) setStatus(value); }).catch(() => {}); };
    refresh();
    const sub = AppState.addEventListener("change", (state) => { if (state === "active") refresh(); });
    return () => { active = false; sub.remove(); };
  }, []);
  const help = () => Alert.alert("澎湃 OS 添加说明", "长按桌面 → 添加小组件，查找「安卓小组件」（有些版本在搜索页面或底部）→ dark-study。\n\n若应用内添加无反应：打开应用权限设置，检查「桌面快捷方式」或「创建桌面快捷方式」权限（以手机显示的选项为准），允许后返回重试。", [
    { text: "知道了" }, { text: "打开权限设置", onPress: () => { void openWidgetPermissions().catch(() => Alert.alert("无法打开", "请从系统设置 → 应用管理 → dark-study 打开权限设置。")); } },
  ]);
  const now = useForegroundClock();
  const selected = WIDGET_SHAPES.find((s) => s.key === shape) ?? WIDGET_SHAPES[0];
  const courses = useMemo(() => upcomingWidgetCourses(schedule, now), [schedule, now]);
  const visible = courses.slice(0, Math.min(count, selected.capacity));
  const dark = theme === "dark";
  const ink = dark ? "#F1F5F9" : "#172554";
  const muted = dark ? "#A5B4CF" : "#536783";
  const add = async () => {
    setBusy(true);
    setMessage("正在检查系统中的小组件…");
    try {
      const before = await getCourseWidgetStatus();
      setStatus(before);
      if (before && before.registered !== 3) {
        setMessage(`系统仅识别 ${before.registered}/3 种小组件。请覆盖安装包含原生组件的完整新版 APK，再打开应用。`);
        return;
      }
      await syncCourseWidgets(schedule, count, theme);
      if (!await pinCourseWidget(shape)) {
        setMessage("当前桌面不支持应用内添加，请使用安卓小组件列表。"); help(); return;
      }
      setMessage("请求已发送，请在桌面确认添加。正在检查添加结果…");
      if (before) {
        for (let i = 0; i < 8; i++) {
          await new Promise((resolve) => setTimeout(resolve, 1000));
          const after = await getCourseWidgetStatus();
          setStatus(after);
          if (after && after.installed > before.installed) { setMessage("已检测到新添加的小组件，可以返回桌面查看。"); return; }
        }
      }
      setMessage("尚未检测到新增组件。若没有出现系统确认，请查看下方澎湃 OS 添加说明；也可在桌面继续确认。");
    } catch (error) { setMessage(`添加未完成：${error instanceof Error ? error.message : "请检查系统权限后重试"}`); }
    finally { setBusy(false); }
  };
  return (
    <View style={{ marginBottom: 14 }}>
      <GlassContainer radius={24} intensity={42} borderOpacity={0.22}>
        <View className="px-4 py-4">
          <Text className="text-[14px] font-bold text-slate-800 dark:text-white">桌面课表小组件</Text>
          <Text className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">显示正在上和接下来的课程 · 跟随当前课表</Text>
          {Platform.OS === "android" && <>
            <Text className="mt-2 text-[11px] text-slate-500 dark:text-slate-400">{status ? `系统识别 ${status.registered}/3 种 · 已添加 ${status.installed} 个` : "安装最新完整 APK 后可检查系统注册状态"}</Text>
            {!!message && <Text accessibilityLiveRegion="polite" className="mt-2 text-[12px] text-sky-700 dark:text-sky-200">{message}</Text>}
            <Pressable onPress={help} accessibilityRole="button" className="mt-2 rounded-xl bg-sky-400/20 px-3 py-3"><Text className="text-[12px] font-bold text-sky-700 dark:text-sky-200">澎湃 OS：找不到组件 / 添加无反应</Text></Pressable>
          </>}
          <View className="mt-3 flex-row gap-2">{WIDGET_SHAPES.map((item) => (
            <Pressable key={item.key} onPress={() => setShape(item.key)} accessibilityRole="radio" accessibilityState={{ selected: shape === item.key }} className={`flex-1 items-center rounded-xl py-3 ${shape === item.key ? "bg-sky-400/25" : "bg-slate-400/10"}`}>
              <View style={{ width: item.key === "square" ? 22 : 34, height: item.key === "rectangle" ? 15 : 22, borderWidth: 1.5, borderColor: shape === item.key ? "#38BDF8" : "#94A3B8", borderRadius: 5, marginBottom: 6 }} />
              <Text className="text-[12px] font-semibold text-slate-700 dark:text-slate-200">{item.label}</Text>
              <Text className="mt-1 text-[10px] text-slate-500 dark:text-slate-400">{item.size}</Text>
            </Pressable>
          ))}</View>
          <Text className="mt-4 text-[12px] font-semibold text-slate-700 dark:text-slate-200">最多显示几门课</Text>
          <View className="mt-2 flex-row gap-2">{[1, 2, 3, 4, 5].map((n) => (
            <Pressable key={n} onPress={() => setCount(n)} accessibilityRole="radio" accessibilityState={{ selected: count === n }} accessibilityLabel={`${n} 门课`} className={`flex-1 items-center rounded-xl py-2 ${count === n ? "bg-sky-400/25" : "bg-slate-400/10"}`}><Text className="text-[12px] text-slate-700 dark:text-slate-200">{n}</Text></Pressable>
          ))}</View>
          <View className="mt-3 flex-row gap-2">{(["dark", "light"] as const).map((value) => (
            <Pressable key={value} onPress={() => setTheme(value)} accessibilityRole="radio" accessibilityState={{ selected: theme === value }} className={`rounded-xl px-4 py-2 ${theme === value ? "bg-sky-400/25" : "bg-slate-400/10"}`}><Text className="text-[12px] text-slate-700 dark:text-slate-200">{value === "dark" ? "深色" : "浅色"}</Text></Pressable>
          ))}</View>
          <View style={{ width: shape === "square" ? 170 : "100%", minHeight: shape === "large" ? 280 : 166, alignSelf: "center", marginTop: 16, padding: 14, borderRadius: 22, backgroundColor: dark ? "#111D32" : "#EDF5FF", borderWidth: 1, borderColor: dark ? "#2C405C" : "#CCDDEE" }}>
            <Text style={{ color: dark ? "#7DD3FC" : "#0369A1", fontSize: 10, fontWeight: "700", letterSpacing: 1 }}>DARK STUDY</Text>
            <Text numberOfLines={1} style={{ color: ink, fontSize: 13, fontWeight: "700", marginTop: 4 }}>{schedule.name}</Text>
            {visible.length ? visible.map((course) => (
              <View key={course.id} style={{ marginTop: 11, borderLeftWidth: 2, borderLeftColor: "#38BDF8", paddingLeft: 8 }}>
                <Text numberOfLines={1} style={{ color: ink, fontSize: 13, fontWeight: "700" }}>{course.name}</Text>
                <Text numberOfLines={1} style={{ color: muted, fontSize: 10, marginTop: 3 }}>{course.start <= now.getTime() ? "上课中" : widgetDayLabel(course.start, now)} · {course.time}</Text>
                <Text numberOfLines={1} style={{ color: muted, fontSize: 10, marginTop: 2 }}>{course.classroom || "教室待定"}</Text>
              </View>
            )) : <Text style={{ color: muted, fontSize: 12, lineHeight: 20, marginTop: 18 }}>{schedule.courses.length ? "本学期暂无后续课程\n享受自由时间吧" : "还没有课程\n先导入或添加课表吧"}</Text>}
          </View>
          <Text className="mt-2 text-[11px] text-slate-500 dark:text-slate-400">预览 · 小尺寸最多显示 2 门，大卡片最多 5 门；实际格数和可见数量随桌面尺寸调整。配色和数量会应用到已添加的小组件。</Text>
          {Platform.OS === "android" && courseWidgetsAvailable ? (
            <Pressable disabled={busy} onPress={() => { void add(); }} accessibilityRole="button" className="mt-3 items-center rounded-2xl bg-sky-400/25 py-3"><Text className="text-[13px] font-bold text-sky-700 dark:text-sky-200">{busy ? "正在请求添加…" : `添加${selected.label}到桌面`}</Text></Pressable>
          ) : <Text className="mt-3 text-[11px] text-slate-500 dark:text-slate-400">{Platform.OS === "android" ? "安装包含此功能的新版 APK 后即可添加；Expo Go 不支持桌面小组件。" : "桌面小组件目前支持 Android，以上可预览样式。"}</Text>}
          <Text className="mt-2 text-[11px] text-slate-500 dark:text-slate-400">也可长按桌面 → 小组件 → Dark Study 添加。长按组件可调整大小，点击组件打开课表。后台刷新可能受手机省电策略影响。</Text>
        </View>
      </GlassContainer>
    </View>
  );
}
