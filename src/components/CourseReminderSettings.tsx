import * as Notifications from "expo-notifications";
import { useCallback, useEffect, useRef, useState } from "react";
import { Alert, AppState, Linking, Platform, Pressable, Text, View } from "react-native";

import { GlassContainer } from "@/components/GlassContainer";
import { SystemCourseReminders } from "@/components/SystemCourseReminders";
import {
  getCourseReminderSummary,
  prepareReminderChannel,
  sendTestCourseReminder,
  type CourseReminderSummary,
} from "@/services/courseReminders";
import { useSettings } from "@/store/useSettings";
import { useActiveSchedule } from "@/store/useStore";

export function CourseReminderSettings() {
  const schedule = useActiveSchedule();
  const enabled = useSettings((s) => s.reminderEnabled);
  const minutes = useSettings((s) => s.reminderMinutes);
  const count = useSettings((s) => s.reminderCount);
  const setReminder = useSettings((s) => s.setReminder);
  const [permission, setPermission] = useState(false);
  const [exact, setExact] = useState(false);
  const [summary, setSummary] = useState<CourseReminderSummary | null>(null);
  const [testing, setTesting] = useState(false);
  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const refresh = useCallback(async () => {
    if (Platform.OS === "web") return;
    try {
      const p = await Notifications.getPermissionsAsync();
      if (!mountedRef.current) return;
      setPermission(p.granted);
      if (Platform.OS === "android") {
        const ex = await Notifications.getExactAlarmPermissionsAsync();
        if (!mountedRef.current) return;
        setExact(ex.granted);
      }
      const nextSummary = await getCourseReminderSummary(schedule, minutes, count);
      if (!mountedRef.current) return;
      setSummary(nextSummary);
    } catch (error) {
      console.warn("无法读取课程提醒权限", error);
    }
  }, [count, minutes, schedule]);

  useEffect(() => {
    const timer = setTimeout(() => {
      void refresh();
    }, 350);
    const sub = AppState.addEventListener("change", (state) => {
      if (state === "active") void refresh();
    });
    return () => {
      clearTimeout(timer);
      sub.remove();
    };
  }, [refresh, enabled]);

  const enable = async () => {
    if (enabled) {
      setReminder({ reminderEnabled: false });
      return;
    }
    try {
      await prepareReminderChannel();
      let p = await Notifications.getPermissionsAsync();
      if (!p.granted && p.canAskAgain) p = await Notifications.requestPermissionsAsync();
      if (!p.granted) {
        Alert.alert("需要通知权限", "请在系统设置中允许 Dark Study 发送通知。", [
          { text: "取消", style: "cancel" },
          {
            text: "打开设置",
            onPress: () => {
              void Linking.openSettings();
            },
          },
        ]);
        return;
      }
      setReminder({ reminderEnabled: true });
      await refresh();
    } catch {
      Alert.alert("无法开启提醒", "请检查系统通知权限后重试。");
    }
  };

  const askExact = async () => {
    try {
      await Notifications.requestExactAlarmPermissionsAsync();
      await refresh();
    } catch {
      Alert.alert("无法打开设置", "请在系统设置中允许闹钟和提醒。");
    }
  };

  const handleTest = async () => {
    if (testing) return;
    setTesting(true);
    try {
      await sendTestCourseReminder(minutes);
      Alert.alert("测试提醒已发送", "约 2 秒后弹出系统通知，请检查横幅、铃声与振动。");
    } catch (error) {
      Alert.alert(
        "发送失败",
        error instanceof Error ? error.message : "请检查系统通知权限后重试。",
      );
    } finally {
      setTesting(false);
    }
  };

  if (Platform.OS === "web") return null;

  const coverageLabel = summary?.lastDate
    ? `${summary.lastDate.getMonth() + 1}月${summary.lastDate.getDate()}日`
    : "";

  return (
    <View style={{ marginBottom: 14 }}>
      <GlassContainer radius={24} intensity={42} borderOpacity={0.22}>
        <View className="px-4 py-4">
          <View className="flex-row items-center justify-between">
            <View className="flex-1 pr-2">
              <Text className="text-[14px] font-bold text-slate-800 dark:text-white">
                上课提醒
              </Text>
              <Text className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">
                根据当前课表在上课前发送本地通知
              </Text>
            </View>
            <Pressable
              onPress={() => {
                void enable();
              }}
              accessibilityRole="switch"
              accessibilityState={{ checked: enabled }}
              className={`rounded-xl px-3.5 py-2 ${
                enabled ? "bg-sky-500/25" : "bg-slate-400/15"
              }`}
            >
              <Text
                className={`text-xs font-bold ${
                  enabled
                    ? "text-sky-700 dark:text-sky-300"
                    : "text-slate-700 dark:text-slate-200"
                }`}
              >
                {enabled ? "已开启" : "开启"}
              </Text>
            </Pressable>
          </View>

          {/* 提前提醒分钟数抽到上方共用：关闭应用内通知时也能单独给「手机闹钟/日程」调提前量 */}
          <Text className="mt-4 text-[12px] font-semibold text-slate-700 dark:text-slate-200">
            提前提醒时间（应用内通知与手机闹钟/日程共用）
          </Text>
          <View className="mt-2 flex-row flex-wrap gap-2">
            {[5, 10, 15, 30, 60].map((n) => {
              const sel = minutes === n;
              return (
                <Pressable
                  key={n}
                  onPress={() => setReminder({ reminderMinutes: n })}
                  className={`rounded-xl border px-3 py-2 ${
                    sel
                      ? "border-sky-500/70 bg-sky-500/20"
                      : "border-transparent bg-slate-400/10"
                  }`}
                >
                  <Text
                    className={`text-[12px] font-semibold ${
                      sel
                        ? "text-sky-700 dark:text-sky-300"
                        : "text-slate-700 dark:text-slate-200"
                    }`}
                  >
                    {n} 分钟
                  </Text>
                </Pressable>
              );
            })}
          </View>

          {enabled ? (
            <>
              <Text className="mt-4 text-[12px] font-semibold text-slate-700 dark:text-slate-200">
                单节课提醒次数
              </Text>
              <View className="mt-2 flex-row gap-2">
                {[1, 2, 3].map((n) => {
                  const sel = count === n;
                  return (
                    <Pressable
                      key={n}
                      onPress={() => setReminder({ reminderCount: n })}
                      className={`rounded-xl border px-4 py-2 ${
                        sel
                          ? "border-sky-500/70 bg-sky-500/20"
                          : "border-transparent bg-slate-400/10"
                      }`}
                    >
                      <Text
                        className={`text-[12px] font-semibold ${
                          sel
                            ? "text-sky-700 dark:text-sky-300"
                            : "text-slate-700 dark:text-slate-200"
                        }`}
                      >
                        {n} 次
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
              <Text className="mt-2 text-[11px] text-slate-500 dark:text-slate-400">
                多次提醒会从首次提醒到上课前均匀分布。
              </Text>

              {/* 排程状态与一键测试 */}
              <View className="mt-3 flex-row items-center justify-between rounded-2xl bg-white/25 px-3.5 py-2.5 dark:bg-white/[0.05]">
                <View className="flex-1 pr-2">
                  <Text className="text-[11.5px] font-semibold text-slate-700 dark:text-slate-200">
                    {summary
                      ? summary.scheduledCount > 0
                        ? `已排程 ${summary.scheduledCount} 条提醒${coverageLabel ? ` · 覆盖至 ${coverageLabel}` : ""}`
                        : "当前暂无待触发的上课提醒"
                      : "正在检查排程状态…"}
                  </Text>
                  {summary?.capped ? (
                    <Text className="mt-0.5 text-[10px] text-amber-700 dark:text-amber-300">
                      受系统单应用通知队列上限限制，后续课程会在下次打开应用时自动续排
                    </Text>
                  ) : null}
                </View>
                <Pressable
                  disabled={testing}
                  onPress={() => void handleTest()}
                  className="rounded-xl bg-sky-500/20 px-3 py-1.5"
                >
                  <Text className="text-[11px] font-bold text-sky-700 dark:text-sky-300">
                    {testing ? "发送中…" : "测试通知"}
                  </Text>
                </Pressable>
              </View>

              {!permission ? (
                <Pressable
                  onPress={() => {
                    void Linking.openSettings();
                  }}
                >
                  <Text className="mt-3 text-[11px] font-semibold text-amber-700 dark:text-amber-300">
                    通知权限已关闭，点击前往系统设置
                  </Text>
                </Pressable>
              ) : null}
              {Platform.OS === "android" && !exact ? (
                <Pressable
                  onPress={() => {
                    void askExact();
                  }}
                >
                  <Text className="mt-2.5 text-[11px] font-semibold text-amber-700 dark:text-amber-300">
                    允许「闹钟和提醒」可提高准时性，点击设置
                  </Text>
                </Pressable>
              ) : null}
              <Text className="mt-2 text-[11px] text-slate-500 dark:text-slate-400">
                弹窗、声音及后台准时性受系统通知渠道与省电策略影响。
              </Text>
            </>
          ) : null}

          {Platform.OS === "android" ? <SystemCourseReminders /> : null}
        </View>
      </GlassContainer>
    </View>
  );
}
