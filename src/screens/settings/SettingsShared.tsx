import Ionicons from "@expo/vector-icons/Ionicons";
import React, { type ReactNode } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  Switch,
  Text,
  View,
} from "react-native";
import Animated, {
  Easing,
  FadeInDown,
  useReducedMotion,
} from "react-native-reanimated";

import { Backdrop } from "@/components/Backdrop";
import { GlassContainer } from "@/components/GlassContainer";
import { useForegroundClock } from "@/hooks/useForegroundClock";
import {
  currentVersion,
  formatBytes,
  isAndroid,
  openInstallPermissionSettings,
} from "@/services/updater";
import { useActiveSchedule, useStore } from "@/store/useStore";
import { useUpdateTask } from "@/store/useUpdateTask";
import {
  countDistinctCourses,
  countPeriodSlots,
  formatDateLabel,
  getDateInfo,
  getSemesterStatus,
} from "@/utils/time";

export function useCardEnter(delayMs = 0) {
  const reduced = useReducedMotion();
  if (reduced) return undefined;
  return FadeInDown.delay(delayMs).duration(220).easing(Easing.out(Easing.cubic));
}

export function DateRow({
  label,
  hint,
  value,
  onPress,
}: {
  label: string;
  hint: string;
  value: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      className="mb-2 flex-row items-center rounded-2xl border border-slate-300/30 bg-white/25 px-3.5 py-2.5 dark:border-white/10 dark:bg-white/[0.05]"
    >
      <View className="flex-1">
        <Text className="text-[12px] font-semibold text-slate-700 dark:text-slate-200">
          {label}
        </Text>
        <Text className="mt-0.5 text-[10px] text-slate-500 dark:text-slate-400">
          {hint}
        </Text>
      </View>
      <Text className="text-[12.5px] font-bold text-sky-600 dark:text-sky-300">
        {value}
      </Text>
      <Ionicons
        name="chevron-forward"
        size={13}
        color="#94A3B8"
        style={{ marginLeft: 3 }}
      />
    </Pressable>
  );
}

export function ToggleRow({
  label,
  hint,
  value,
  onValueChange,
}: {
  label: string;
  hint: string;
  value: boolean;
  onValueChange: (v: boolean) => void;
}) {
  return (
    <View className="flex-row items-center justify-between py-2">
      <View className="flex-1 pr-3">
        <Text className="text-[12.5px] font-semibold text-slate-700 dark:text-slate-200">
          {label}
        </Text>
        <Text className="mt-0.5 text-[10.5px] text-slate-500 dark:text-slate-400">
          {hint}
        </Text>
      </View>
      <Switch
        accessibilityLabel={label}
        value={value}
        onValueChange={onValueChange}
        trackColor={{ true: "#38BDF8", false: "#94A3B8" }}
      />
    </View>
  );
}

export function PrimaryBtn({
  label,
  onPress,
}: {
  label: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      className="mt-3 items-center rounded-2xl bg-sky-500 py-2.5"
    >
      <Text className="text-[12px] font-bold text-white">{label}</Text>
    </Pressable>
  );
}

export function SettingsCategoryFallback({
  label = "正在加载设置…",
}: {
  label?: string;
}) {
  return (
    <GlassContainer radius={24} intensity={42} borderOpacity={0.22}>
      <View className="items-center justify-center px-4 py-8">
        <ActivityIndicator size="small" color="#38BDF8" />
        <Text className="mt-2.5 text-[11.5px] text-slate-500 dark:text-slate-400">
          {label}
        </Text>
      </View>
    </GlassContainer>
  );
}

/** 「检查更新」卡片：GitHub Releases 发现新版本 → 下载 APK → 调起安装器覆盖安装 */
export function UpdateCard() {
  const enter = useCardEnter(100);
  const phase = useUpdateTask((s) => s.phase);
  const info = useUpdateTask((s) => s.info);
  const progress = useUpdateTask((s) => s.progress);
  const message = useUpdateTask((s) => s.message);
  const check = useUpdateTask((s) => s.check);
  const download = useUpdateTask((s) => s.download);
  const cancelDownload = useUpdateTask((s) => s.cancelDownload);
  const install = useUpdateTask((s) => s.install);

  const version = currentVersion();

  if (!isAndroid()) {
    return (
      <Animated.View entering={enter} style={{ marginTop: 14 }}>
        <GlassContainer radius={24} intensity={42} borderOpacity={0.22}>
          <View className="px-4 py-4">
            <Text className="text-[14px] font-bold text-slate-800 dark:text-white">
              检查更新
            </Text>
            <Text className="mt-1 text-[10.5px] text-slate-500 dark:text-slate-400">
              当前版本 v{version} · 应用内更新仅支持 Android
            </Text>
          </View>
        </GlassContainer>
      </Animated.View>
    );
  }

  return (
    <Animated.View entering={enter} style={{ marginTop: 14 }}>
      <GlassContainer radius={24} intensity={42} borderOpacity={0.22}>
        <View className="px-4 py-4">
          <View className="mb-3 flex-row items-center">
            <View className="h-9 w-9 items-center justify-center rounded-[13px] bg-sky-400/25">
              <Ionicons
                name="cloud-download-outline"
                size={16}
                color="#38BDF8"
              />
            </View>
            <View className="ml-2.5 flex-1">
              <Text className="text-[14px] font-bold text-slate-800 dark:text-white">
                检查更新
              </Text>
              <Text className="text-[10.5px] text-slate-500 dark:text-slate-400">
                当前版本 v{version}
              </Text>
            </View>
          </View>

          {phase === "idle" ? (
            <>
              <Text className="mb-3 text-[11px] text-slate-500 dark:text-slate-400">
                自动择优选择最快线路检查与下载，覆盖安装后课程与设置数据自动保留
              </Text>
              <PrimaryBtn label="检查更新" onPress={check} />
            </>
          ) : null}

          {phase === "checking" ? (
            <View className="flex-row items-center rounded-2xl bg-white/20 px-3.5 py-3 dark:bg-white/[0.05]">
              <ActivityIndicator size="small" color="#38BDF8" />
              <Text className="ml-2.5 text-[12px] text-slate-600 dark:text-slate-300">
                正在检查新版本…
              </Text>
            </View>
          ) : null}

          {phase === "upToDate" ? (
            <View className="flex-row items-center rounded-2xl bg-emerald-400/15 px-3.5 py-3">
              <Ionicons name="checkmark-circle" size={16} color="#34D399" />
              <Text className="ml-2 flex-1 text-[12px] font-semibold text-emerald-600 dark:text-emerald-300">
                已是最新版本QwQ v{info?.version ?? version}
              </Text>
              <Pressable onPress={check} hitSlop={8}>
                <Text className="text-[11px] font-semibold text-sky-600 dark:text-sky-300">
                  再查一次
                </Text>
              </Pressable>
            </View>
          ) : null}

          {phase === "available" && info ? (
            <>
              <View className="rounded-2xl bg-white/20 px-3.5 py-3 dark:bg-white/[0.05]">
                <View className="flex-row items-center">
                  <Ionicons name="arrow-up-circle" size={15} color="#38BDF8" />
                  <Text className="ml-1.5 flex-1 text-[12.5px] font-bold text-slate-700 dark:text-slate-200">
                    发现新版本 v{info.version}
                    {info.apkSize ? ` · ${formatBytes(info.apkSize)}` : ""}
                  </Text>
                </View>
                {info.publishedAt ? (
                  <Text className="mt-1 text-[10px] text-slate-400 dark:text-slate-500">
                    发布于 {formatDateLabel(info.publishedAt.slice(0, 10))}
                  </Text>
                ) : null}
                {info.notes ? (
                  <View className="mt-2 rounded-xl border border-white/15 bg-white/15 px-2.5 py-2 dark:border-white/10 dark:bg-white/[0.04]">
                    <Text className="text-[10.5px] text-slate-500 dark:text-slate-400">
                      {info.notes}
                    </Text>
                  </View>
                ) : null}
              </View>
              {message ? (
                <Text className="mt-2 text-[10.5px] text-amber-600 dark:text-amber-300">
                  {message}
                </Text>
              ) : null}
              <PrimaryBtn
                label={`下载更新${info.apkSize ? `（${formatBytes(info.apkSize)}）` : ""}`}
                onPress={download}
              />
            </>
          ) : null}

          {phase === "downloading" ? (
            <>
              <View className="h-1.5 overflow-hidden rounded-full bg-sky-400/15">
                <View
                  className="h-full rounded-full bg-sky-400"
                  style={{
                    width: `${Math.max(2, Math.round(progress * 100))}%`,
                  }}
                />
              </View>
              <View className="mt-2 flex-row items-center justify-between">
                <Text className="text-[11px] text-slate-500 dark:text-slate-400">
                  下载中 {Math.round(progress * 100)}%
                </Text>
                <Pressable onPress={cancelDownload} hitSlop={8}>
                  <Text className="text-[11px] font-semibold text-rose-500">
                    取消
                  </Text>
                </Pressable>
              </View>
            </>
          ) : null}

          {phase === "downloaded" ? (
            <>
              <View className="flex-row items-center rounded-2xl bg-emerald-400/15 px-3.5 py-3">
                <Ionicons name="checkmark-circle" size={16} color="#34D399" />
                <Text className="ml-2 flex-1 text-[12px] font-semibold text-emerald-600 dark:text-emerald-300">
                  安装包准备就绪！
                </Text>
              </View>
              <PrimaryBtn label="立即安装" onPress={install} />
              <Text className="mt-2 text-[10px] text-slate-400 dark:text-slate-500">
                覆盖安装不会丢失数据；如无反应，请先在
                <Text
                  className="text-sky-500 dark:text-sky-300"
                  onPress={() => {
                    openInstallPermissionSettings().catch(() => {});
                  }}
                >
                  系统设置
                </Text>
                中允许本应用「安装未知应用」
              </Text>
            </>
          ) : null}

          {phase === "error" ? (
            <>
              <View className="rounded-2xl bg-rose-400/15 px-3.5 py-3">
                <Text className="text-[11.5px] text-rose-600 dark:text-rose-300">
                  {message || "检查更新失败，请检查网络后重试QAQ"}
                </Text>
              </View>
              <PrimaryBtn label="重试" onPress={check} />
            </>
          ) : null}
        </View>
      </GlassContainer>
    </Animated.View>
  );
}

function OverviewStat({
  label,
  value,
  unit,
}: {
  label: string;
  value: string;
  unit: string;
}) {
  return (
    <View className="flex-1 items-center">
      <Text className="text-[17px] font-extrabold text-slate-800 dark:text-white">
        {value}
        <Text className="text-[10px] font-semibold text-slate-500 dark:text-slate-400">
          {unit}
        </Text>
      </Text>
      <Text className="mt-0.5 text-[10px] text-slate-500 dark:text-slate-400">
        {label}
      </Text>
    </View>
  );
}

/** 顶部概览：统一使用 getSemesterStatus 与去重门数/真实节数 */
export function SettingsOverview() {
  const enter = useCardEnter(0);
  const schedule = useActiveSchedule();
  const grades = useStore((s) => s.grades);
  const now = useForegroundClock();
  const info = getDateInfo(schedule.startDate, now);
  const status = getSemesterStatus(schedule, now);
  const distinctCourseCount = countDistinctCourses(schedule.courses);
  const todayList =
    status.phase === "active"
      ? schedule.courses.filter(
          (course) =>
            course.weekday === info.weekday &&
            course.weeks.includes(status.clampedWeek),
        )
      : [];
  const todayPeriods = countPeriodSlots(todayList);
  const progress =
    status.phase === "before"
      ? 0
      : status.phase === "after"
        ? 1
        : Math.min(1, status.clampedWeek / status.totalWeeks);

  const rightTitle =
    status.phase === "before"
      ? "未开学"
      : status.phase === "after"
        ? "已放假"
        : `第 ${status.clampedWeek} 周`;

  return (
    <Animated.View entering={enter}>
      <GlassContainer radius={26} intensity={42} borderOpacity={0.22}>
        <View className="px-5 py-4">
          <View className="flex-row items-start">
            <View className="flex-1">
              <Text className="text-[10px] font-bold tracking-widest text-sky-600 dark:text-sky-300">
                CURRENT SEMESTER
              </Text>
              <Text className="mt-1.5 text-[22px] font-extrabold text-slate-800 dark:text-white">
                {schedule.name}
              </Text>
              <Text className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">
                {status.phase === "before"
                  ? `距开学还有 ${status.daysUntilStart} 天（${formatDateLabel(schedule.startDate)}）`
                  : `开学于 ${formatDateLabel(schedule.startDate)}`}
              </Text>
            </View>
            <View className="items-end">
              <Text className="text-[17px] font-extrabold text-slate-800 dark:text-white">
                {rightTitle}
              </Text>
              <Text className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">
                {info.dateLabel} · 共 {status.totalWeeks} 周
              </Text>
            </View>
          </View>

          <View className="mt-4 flex-row items-center">
            <View className="h-1.5 flex-1 overflow-hidden rounded-full bg-white/35 dark:bg-white/10">
              <View
                className="h-full rounded-full bg-sky-400"
                style={{ width: `${progress * 100}%` }}
              />
            </View>
            <Text className="ml-2.5 text-[10px] font-semibold text-slate-500 dark:text-slate-400">
              {Math.round(progress * 100)}%
            </Text>
          </View>

          <View className="mt-4 flex-row items-center rounded-2xl bg-white/25 py-2.5 dark:bg-white/[0.05]">
            <OverviewStat
              label="课程"
              value={String(distinctCourseCount)}
              unit=" 门"
            />
            <View className="h-7 w-px bg-slate-400/25 dark:bg-white/10" />
            <OverviewStat
              label="今日"
              value={String(todayPeriods)}
              unit=" 节"
            />
            <View className="h-7 w-px bg-slate-400/25 dark:bg-white/10" />
            <OverviewStat
              label="成绩"
              value={String(grades.length)}
              unit=" 条"
            />
          </View>
        </View>
      </GlassContainer>
    </Animated.View>
  );
}

export function SettingsPage({
  title,
  children,
  onBack,
}: {
  title: string;
  children: ReactNode;
  onBack: () => void;
}) {
  return (
    <Backdrop>
      <View className="flex-row items-center gap-3 px-5 pb-3 pt-2">
        <Pressable
          onPress={onBack}
          accessibilityRole="button"
          accessibilityLabel="返回"
          className="h-11 w-11 items-center justify-center rounded-full bg-white/40 dark:bg-white/10"
        >
          <Ionicons name="chevron-back" size={21} color="#64748B" />
        </Pressable>
        <Text
          accessibilityRole="header"
          className="flex-1 text-2xl font-extrabold text-slate-800 dark:text-white"
        >
          {title}
        </Text>
      </View>
      <ScrollView
        className="flex-1"
        contentContainerStyle={{
          paddingHorizontal: 20,
          paddingTop: 6,
          paddingBottom: 40,
        }}
        keyboardShouldPersistTaps="handled"
      >
        {children}
      </ScrollView>
    </Backdrop>
  );
}
