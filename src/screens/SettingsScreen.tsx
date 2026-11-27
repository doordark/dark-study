import Ionicons from "@expo/vector-icons/Ionicons";
import DateTimePicker, {
  DateTimePickerAndroid,
} from "@react-native-community/datetimepicker";
import { Link, router } from "expo-router";
import { colorScheme } from "nativewind";
import React, { useEffect, useRef, useState, type ReactNode } from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
  KeyboardAvoidingView,
  Linking,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  Switch,
  Text,
  TextInput,
  View,
} from "react-native";
import Animated, {
  Easing,
  FadeInDown,
  useReducedMotion,
} from "react-native-reanimated";

import { Backdrop } from "@/components/Backdrop";
import { BackupSettings } from "@/components/BackupSettings";
import { CourseReminderSettings } from "@/components/CourseReminderSettings";
import { CourseWidgetSettings } from "@/components/CourseWidgetSettings";
import {
  GlassContainer,
  GlassTargetProvider,
} from "@/components/GlassContainer";
import { GlassMaterialPreview } from "@/components/GlassMaterialPreview";
import { PerformanceSettings } from "@/components/PerformanceSettings";
import { PeriodSettings } from "@/components/PeriodSettings";
import {
  AI_PROVIDER_PRESETS,
  getAiProviderPreset,
  normalizeBaseUrl,
  resolveAiRuntimeConfig,
  type AiProviderId,
} from "@/constants/aiProviders";
import {
  BACKGROUND_PRESETS,
  type BackgroundEffect,
  type BackgroundTint,
} from "@/constants/backgrounds";
import { useForegroundClock } from "@/hooks/useForegroundClock";
import { ensureReminderPermission } from "@/services/courseReminders";
import { testDeepSeekConnection } from "@/services/deepseek";
import { pickImageForBackground } from "@/services/fileImport";
import {
  currentVersion,
  formatBytes,
  isAndroid,
  openInstallPermissionSettings,
} from "@/services/updater";
import { useSettings, type CardMaterial } from "@/store/useSettings";
import { useActiveSchedule, useStore } from "@/store/useStore";
import { useUpdateTask } from "@/store/useUpdateTask";
import { useWhaleMemory } from "@/store/useWhaleMemory";
import { useWhalePersona } from "@/store/useWhalePersona";
import type { Schedule } from "@/types";
import {
  addDays,
  countDistinctCourses,
  countPeriodSlots,
  formatDateLabel,
  getDateInfo,
  getSemesterStatus,
  mondayOf,
  parseIsoDate,
  toIsoDate,
} from "@/utils/time";

const APPEARANCES = [
  { key: "system", label: "跟随系统", icon: "phone-portrait" },
  { key: "light", label: "浅色", icon: "sunny" },
  { key: "dark", label: "深色", icon: "moon" },
] as const;

const MATERIALS = [
  { key: "glass", label: "液态玻璃", hint: "通透折射与镜面反光" },
  { key: "frosted", label: "柔雾玻璃", hint: "奶润柔光磨砂质感" },
  { key: "clear", label: "清透", hint: "零模糊纯净透色" },
  { key: "flat", label: "扁平", hint: "简洁清晰" },
] as const;

const MATERIAL_LABELS: Record<CardMaterial, string> = {
  glass: "液态玻璃",
  frosted: "柔雾玻璃",
  clear: "清透",
  flat: "扁平",
};

const BG_TINTS = Object.entries(BACKGROUND_PRESETS) as [
  BackgroundTint,
  (typeof BACKGROUND_PRESETS)[BackgroundTint],
][];

const BG_EFFECTS: { key: BackgroundEffect; label: string; hint: string }[] = [
  { key: "aurora", label: "极光柔光", hint: "柔和径向光场" },
  { key: "plain", label: "纯净渐变", hint: "安静极简底色" },
];

const BG_DIM_LEVELS = [
  { value: 0, label: "原图" },
  { value: 0.18, label: "轻柔" },
  { value: 0.35, label: "适中" },
  { value: 0.52, label: "深邃" },
] as const;

function useCardEnter(delayMs = 0) {
  const reduced = useReducedMotion();
  if (reduced) return undefined;
  return FadeInDown.delay(delayMs).duration(220).easing(Easing.out(Easing.cubic));
}

function DateRow({
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

function ToggleRow({
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

/** 「检查更新」卡片：GitHub Releases 发现新版本 → 下载 APK → 调起安装器覆盖安装 */
function UpdateCard() {
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

function PrimaryBtn({
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

function AppearanceSettings() {
  const enter0 = useCardEnter(0);
  const enter1 = useCardEnter(50);
  const enter2 = useCardEnter(100);
  const appearance = useSettings((s) => s.appearance);
  const material = useSettings((s) => s.material);
  const setMaterial = useSettings((s) => s.setMaterial);
  const backgroundImage = useSettings((s) => s.backgroundImage);
  const setBackgroundImage = useSettings((s) => s.setBackgroundImage);
  const backgroundDim = useSettings((s) => s.backgroundDim);
  const setBackgroundDim = useSettings((s) => s.setBackgroundDim);
  const backgroundTint = useSettings((s) => s.backgroundTint);
  const setBackgroundTint = useSettings((s) => s.setBackgroundTint);
  const backgroundEffect = useSettings((s) => s.backgroundEffect);
  const setBackgroundEffect = useSettings((s) => s.setBackgroundEffect);
  const setAppearance = useSettings((s) => s.setAppearance);

  const applyAppearance = (a: typeof appearance) => {
    setAppearance(a);
    colorScheme.set(a);
  };

  return (
    <>
      {/* 外观 */}
      <Animated.View entering={enter0}>
        <GlassContainer radius={24} intensity={42} borderOpacity={0.22}>
          <View className="px-4 py-4">
            <Text className="mb-3 text-[14px] font-bold text-slate-800 dark:text-white">
              外观
            </Text>
            <View className="flex-row gap-x-2.5">
              {APPEARANCES.map((a) => {
                const on = appearance === a.key;
                return (
                  <Pressable
                    key={a.key}
                    onPress={() => applyAppearance(a.key)}
                    className={`flex-1 items-center rounded-2xl border py-3 ${
                      on
                        ? "border-sky-500/75 bg-sky-500/20"
                        : "border-slate-300/30 bg-white/25 dark:border-white/15 dark:bg-white/[0.06]"
                    }`}
                  >
                    <Ionicons
                      name={a.icon}
                      size={18}
                      color={on ? "#0EA5E9" : "#94A3B8"}
                    />
                    <Text
                      className={`mt-1 text-[11px] font-semibold ${
                        on
                          ? "text-sky-700 dark:text-sky-300"
                          : "text-slate-600 dark:text-slate-400"
                      }`}
                    >
                      {a.label}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </View>
        </GlassContainer>
      </Animated.View>

      {/* 材质 */}
      <Animated.View entering={enter1} style={{ marginTop: 14 }}>
        <GlassContainer radius={24} intensity={42} borderOpacity={0.22}>
          <View className="px-4 py-4">
            <Text className="mb-1 text-[14px] font-bold text-slate-800 dark:text-white">
              材质
            </Text>
            <Text className="mb-3 text-[11px] leading-4 text-slate-500 dark:text-slate-400">
              液态玻璃带真实模糊与边缘微折射；柔雾玻璃呈现奶润柔光磨砂；清透无模糊更轻盈通透；扁平简洁清晰。
            </Text>
            <View className="flex-row flex-wrap justify-between gap-y-3">
              {MATERIALS.map((m) => (
                <Pressable
                  key={m.key}
                  onPress={() => setMaterial(m.key)}
                  accessibilityRole="radio"
                  accessibilityLabel={`${m.label}，${m.hint}`}
                  accessibilityState={{ checked: material === m.key }}
                  style={{ width: "48%" }}
                >
                  <View
                    className={`rounded-[20px] border-2 p-0.5 ${
                      material === m.key
                        ? "border-sky-500 dark:border-sky-400"
                        : "border-transparent"
                    }`}
                  >
                    <GlassMaterialPreview material={m.key} />
                  </View>
                  <Text
                    className={`mt-1.5 text-center text-[12px] font-semibold ${
                      material === m.key
                        ? "text-sky-700 dark:text-sky-300"
                        : "text-slate-700 dark:text-slate-300"
                    }`}
                  >
                    {m.label}
                  </Text>
                </Pressable>
              ))}
            </View>
          </View>
        </GlassContainer>
      </Animated.View>

      {/* 背景色调、光效与自定义背景图 */}
      <Animated.View entering={enter2} style={{ marginTop: 14 }}>
        <GlassContainer radius={24} intensity={42} borderOpacity={0.22}>
          <View className="px-4 py-4">
            <Text className="mb-1 text-[14px] font-bold text-slate-800 dark:text-white">
              背景氛围与壁纸
            </Text>
            <Text className="mb-3 text-[11px] text-slate-500 dark:text-slate-400">
              可自由切换 6 套主题色调与柔光光效，或上传自定义背景图
            </Text>

            {/* 6 套背景色调 */}
            <Text className="mb-2 text-[11.5px] font-semibold text-slate-600 dark:text-slate-300">
              默认背景色调
            </Text>
            <View className="mb-3 flex-row flex-wrap gap-2">
              {BG_TINTS.map(([key, preset]) => {
                const on = backgroundTint === key;
                return (
                  <Pressable
                    key={key}
                    accessibilityRole="radio"
                    accessibilityState={{ checked: on }}
                    onPress={() => setBackgroundTint(key)}
                    style={{ width: "31%" }}
                    className={`flex-row items-center rounded-xl border px-2.5 py-2 ${
                      on
                        ? "border-sky-500/75 bg-sky-500/18"
                        : "border-slate-300/30 bg-white/25 dark:border-white/10 dark:bg-white/[0.05]"
                    }`}
                  >
                    <View
                      style={{
                        width: 14,
                        height: 14,
                        borderRadius: 7,
                        backgroundColor: `rgb(${preset.glowRgb[0]})`,
                      }}
                    />
                    <Text
                      numberOfLines={1}
                      className={`ml-2 flex-1 text-[11px] font-semibold ${
                        on
                          ? "text-sky-700 dark:text-sky-300"
                          : "text-slate-700 dark:text-slate-200"
                      }`}
                    >
                      {preset.label}
                    </Text>
                  </Pressable>
                );
              })}
            </View>

            {/* 光效 */}
            <Text className="mb-2 text-[11.5px] font-semibold text-slate-600 dark:text-slate-300">
              背景光效
            </Text>
            <View className="mb-4 flex-row gap-2.5">
              {BG_EFFECTS.map((eff) => {
                const on = backgroundEffect === eff.key;
                return (
                  <Pressable
                    key={eff.key}
                    accessibilityRole="radio"
                    accessibilityState={{ checked: on }}
                    onPress={() => setBackgroundEffect(eff.key)}
                    className={`flex-1 rounded-xl border px-3 py-2 ${
                      on
                        ? "border-sky-500/75 bg-sky-500/18"
                        : "border-slate-300/30 bg-white/25 dark:border-white/10 dark:bg-white/[0.05]"
                    }`}
                  >
                    <Text
                      className={`text-[12px] font-semibold ${
                        on
                          ? "text-sky-700 dark:text-sky-300"
                          : "text-slate-700 dark:text-slate-200"
                      }`}
                    >
                      {eff.label}
                    </Text>
                    <Text className="mt-0.5 text-[10px] text-slate-500 dark:text-slate-400">
                      {eff.hint}
                    </Text>
                  </Pressable>
                );
              })}
            </View>

            {/* 自定义背景图 */}
            <Text className="mb-2 text-[11.5px] font-semibold text-slate-600 dark:text-slate-300">
              自定义背景图
            </Text>
            <View className="flex-row items-center gap-x-3">
              <View className="h-16 w-24 overflow-hidden rounded-2xl border border-slate-300/35 dark:border-white/10">
                {backgroundImage ? (
                  <Image
                    source={{ uri: backgroundImage }}
                    style={{ width: "100%", height: "100%" }}
                    resizeMode="cover"
                  />
                ) : (
                  <View className="flex-1 items-center justify-center bg-white/25 dark:bg-white/[0.05]">
                    <Ionicons name="image-outline" size={18} color="#94A3B8" />
                  </View>
                )}
              </View>
              <View className="flex-1 gap-y-2">
                <Pressable
                  onPress={async () => {
                    try {
                      const img = await pickImageForBackground();
                      if (img) setBackgroundImage(img.uri);
                    } catch {
                      Alert.alert("无法读取图片", "请检查相册权限后重试。");
                    }
                  }}
                  className="items-center rounded-2xl bg-sky-500 py-2.5"
                >
                  <Text className="text-[12px] font-bold text-white">
                    {backgroundImage ? "更换背景图" : "上传背景图"}
                  </Text>
                </Pressable>
                {backgroundImage ? (
                  <Pressable
                    onPress={() => setBackgroundImage(null)}
                    className="items-center rounded-2xl border border-slate-300/35 bg-white/25 py-2 dark:border-white/10 dark:bg-white/[0.05]"
                  >
                    <Text className="text-[11px] font-semibold text-slate-600 dark:text-slate-300">
                      恢复默认渐变
                    </Text>
                  </Pressable>
                ) : null}
              </View>
            </View>

            {backgroundImage ? (
              <View className="mt-3">
                <Text className="mb-1.5 text-[11px] font-semibold text-slate-600 dark:text-slate-300">
                  壁纸遮罩浓度（提升课表文字清晰度）
                </Text>
                <View className="flex-row gap-2">
                  {BG_DIM_LEVELS.map((lvl) => {
                    const on = Math.abs(backgroundDim - lvl.value) < 0.05;
                    return (
                      <Pressable
                        key={lvl.label}
                        accessibilityRole="radio"
                        accessibilityState={{ checked: on }}
                        onPress={() => setBackgroundDim(lvl.value)}
                        className={`flex-1 items-center rounded-xl border py-2 ${
                          on
                            ? "border-sky-500/75 bg-sky-500/20"
                            : "border-slate-300/30 bg-white/25 dark:border-white/10 dark:bg-white/[0.05]"
                        }`}
                      >
                        <Text
                          className={`text-[11px] font-semibold ${
                            on
                              ? "text-sky-700 dark:text-sky-300"
                              : "text-slate-600 dark:text-slate-300"
                          }`}
                        >
                          {lvl.label}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
              </View>
            ) : null}

            <Text className="mt-2.5 text-[10.5px] text-slate-500 dark:text-slate-400">
              当前卡片材质为「{MATERIAL_LABELS[material] ?? "扁平"}」，背景会铺满整个应用界面。
            </Text>
          </View>
        </GlassContainer>
      </Animated.View>
    </>
  );
}

function ScheduleSettings() {
  const enter0 = useCardEnter(0);
  const enter1 = useCardEnter(50);
  const enter2 = useCardEnter(100);
  const schedule = useActiveSchedule();
  const schedules = useStore((s) => s.schedules);
  const activeScheduleId = useStore((s) => s.activeScheduleId);
  const setActiveSchedule = useStore((s) => s.setActiveSchedule);
  const addSchedule = useStore((s) => s.addSchedule);
  const duplicateSchedule = useStore((s) => s.duplicateSchedule);
  const clearActiveCourses = useStore((s) => s.clearActiveCourses);
  const removeSchedule = useStore((s) => s.removeSchedule);
  const updateScheduleMeta = useStore((s) => s.updateScheduleMeta);
  const mergeSchedule = useStore((s) => s.mergeSchedule);

  const defaultScheduleView = useSettings((s) => s.defaultScheduleView);
  const setDefaultScheduleView = useSettings((s) => s.setDefaultScheduleView);
  const showWeekend = useSettings((s) => s.showWeekend);
  const setShowWeekend = useSettings((s) => s.setShowWeekend);
  const showOtherWeeks = useSettings((s) => s.showOtherWeeks);
  const setShowOtherWeeks = useSettings((s) => s.setShowOtherWeeks);
  const compactWeekGrid = useSettings((s) => s.compactWeekGrid);
  const setCompactWeekGrid = useSettings((s) => s.setCompactWeekGrid);

  const now = useForegroundClock();
  const status = getSemesterStatus(schedule, now);

  /* ---------------- 学期日期 & 总周数 & 校准当前周 ---------------- */
  const [iosPicker, setIosPicker] = useState<"start" | "end" | null>(null);

  const commitDate = (which: "start" | "end", d: Date) =>
    updateScheduleMeta(
      schedule.id,
      which === "start"
        ? { startDate: toIsoDate(d) }
        : { endDate: toIsoDate(d) },
    );

  const setTotalWeeksQuick = (weeks: number) => {
    const safe = Math.max(1, Math.min(30, weeks));
    const start = mondayOf(parseIsoDate(schedule.startDate));
    const end = addDays(start, safe * 7 - 1);
    updateScheduleMeta(schedule.id, { endDate: toIsoDate(end) });
  };

  /** 根据用户声明「本周是第 N 周」反推开学周一，同时保持当前总周数不变 */
  const calibrateCurrentWeek = (targetWeek: number) => {
    const clamped = Math.max(1, Math.min(status.totalWeeks, targetWeek));
    const thisMonday = mondayOf(now);
    const nextStart = addDays(thisMonday, -(clamped - 1) * 7);
    const nextEnd = addDays(nextStart, status.totalWeeks * 7 - 1);
    updateScheduleMeta(schedule.id, {
      startDate: toIsoDate(nextStart),
      endDate: toIsoDate(nextEnd),
    });
  };

  const openDate = (which: "start" | "end") => {
    if (Platform.OS === "web") {
      Alert.alert(
        "请在移动端修改日期",
        "网页预览不支持系统日期弹窗，可用下方「学期总周数」或「校准当前周次」快捷调整。",
      );
      return;
    }
    const current = parseIsoDate(
      which === "start" ? schedule.startDate : schedule.endDate,
    );
    if (Platform.OS === "android") {
      DateTimePickerAndroid.open({
        value: current,
        mode: "date",
        onValueChange: (_e, d) => {
          if (d) commitDate(which, d);
        },
      });
    } else {
      setIosPicker(which);
    }
  };

  /* ---------------- 课表命名（新建 / 重命名） ---------------- */
  const [nameModal, setNameModal] = useState<{
    mode: "create" | "rename";
    id?: string;
  } | null>(null);
  const [nameInput, setNameInput] = useState("");

  const openCreate = () => {
    setNameInput("");
    setNameModal({ mode: "create" });
  };
  const openRename = (item: Schedule) => {
    setNameInput(item.name);
    setNameModal({ mode: "rename", id: item.id });
  };
  const submitName = () => {
    const name = nameInput.trim();
    if (!name || !nameModal) return;
    if (nameModal.mode === "create") {
      addSchedule(name);
    } else if (nameModal.id) {
      updateScheduleMeta(nameModal.id, { name });
    }
    setNameModal(null);
  };

  const confirmDelete = (item: Schedule) => {
    const distinct = countDistinctCourses(item.courses);
    Alert.alert(
      "删除课表",
      `确定删除「${item.name}」及其 ${distinct} 门课程？此操作不可撤销。`,
      [
        { text: "取消", style: "cancel" },
        {
          text: "删除",
          style: "destructive",
          onPress: () => removeSchedule(item.id),
        },
      ],
    );
  };

  const confirmClearCurrentCourses = () => {
    if (!schedule.courses.length) {
      Alert.alert("当前课表已为空");
      return;
    }
    const distinct = countDistinctCourses(schedule.courses);
    Alert.alert(
      "清空当前课表课程？",
      `将清空「${schedule.name}」中的 ${distinct} 门课程（共 ${schedule.courses.length} 条记录），保留作息时间、学期日期以及其他课表和成绩。此操作不可撤销。`,
      [
        { text: "取消", style: "cancel" },
        {
          text: "确认清空",
          style: "destructive",
          onPress: () => clearActiveCourses(),
        },
      ],
    );
  };

  const confirmMerge = (item: Schedule) => {
    const target = schedules.find((s) => s.id === activeScheduleId);
    const distinct = countDistinctCourses(item.courses);
    Alert.alert(
      "合并课程表",
      `把「${item.name}」的 ${distinct} 门课并入当前课表「${target?.name ?? ""}」？\n\n时间节次与周数会按两份课表的作息和开学日期自动换算，时间冲突的课程会在课表中以琥珀色标出。`,
      [
        { text: "取消", style: "cancel" },
        {
          text: "合并",
          onPress: () => {
            const report = mergeSchedule(item.id);
            const lines = [
              `已并入 ${report.added} 条课程记录` +
                (report.skipped
                  ? `，跳过 ${report.skipped} 条（时间或周数无法对应）`
                  : ""),
            ];
            if (report.conflicts.length) {
              lines.push(`⚠ 时间冲突：\n${report.conflicts.join("\n")}`);
              lines.push("冲突课程已在课表中以琥珀色标出");
            } else {
              lines.push("无时间冲突");
            }
            Alert.alert("合并完成", lines.join("\n\n"));
          },
        },
      ],
    );
  };

  const statusText =
    status.phase === "before"
      ? `尚未开学（距开学还有 ${status.daysUntilStart} 天）· 共 ${status.totalWeeks} 周`
      : status.phase === "after"
        ? `本学期已放假 · 共 ${status.totalWeeks} 周`
        : `当前第 ${status.clampedWeek} 周 · 本学期共 ${status.totalWeeks} 周`;

  return (
    <>
      {/* 课表显示偏好 */}
      <Animated.View entering={enter0} style={{ marginBottom: 14 }}>
        <GlassContainer radius={24} intensity={42} borderOpacity={0.22}>
          <View className="px-4 py-4">
            <Text className="mb-1 text-[14px] font-bold text-slate-800 dark:text-white">
              课表显示偏好
            </Text>
            <Text className="mb-3 text-[10.5px] text-slate-500 dark:text-slate-400">
              实时作用于首页日视图与周视图
            </Text>

            <Text className="mb-1.5 text-[11.5px] font-semibold text-slate-600 dark:text-slate-300">
              默认视图（首页切换也会自动记住）
            </Text>
            <View className="mb-2 flex-row gap-2">
              {(
                [
                  ["day", "日视图 · 专注今日"],
                  ["week", "周视图 · 全局网格"],
                ] as const
              ).map(([key, label]) => {
                const on = defaultScheduleView === key;
                return (
                  <Pressable
                    key={key}
                    accessibilityRole="radio"
                    accessibilityState={{ checked: on }}
                    onPress={() => setDefaultScheduleView(key)}
                    className={`flex-1 items-center rounded-xl border py-2.5 ${
                      on
                        ? "border-sky-500/75 bg-sky-500/20"
                        : "border-slate-300/30 bg-white/25 dark:border-white/10 dark:bg-white/[0.05]"
                    }`}
                  >
                    <Text
                      className={`text-[11.5px] font-semibold ${
                        on
                          ? "text-sky-700 dark:text-sky-300"
                          : "text-slate-600 dark:text-slate-300"
                      }`}
                    >
                      {label}
                    </Text>
                  </Pressable>
                );
              })}
            </View>

            <ToggleRow
              label="周视图显示周末"
              hint="关闭后仅显示周一至周五（5 列更宽敞）"
              value={showWeekend}
              onValueChange={setShowWeekend}
            />
            <ToggleRow
              label="周视图显示非本周课程"
              hint="以半透明虚线标出其他周次的课，方便排课避重"
              value={showOtherWeeks}
              onValueChange={setShowOtherWeeks}
            />
            <ToggleRow
              label="紧凑周视图网格"
              hint="每节等高排布并折叠午休/晚饭大段空白，一屏看全天"
              value={compactWeekGrid}
              onValueChange={setCompactWeekGrid}
            />
          </View>
        </GlassContainer>
      </Animated.View>

      {/* 折叠式作息时间表 */}
      <PeriodSettings />

      {/* 学期时间 */}
      <Animated.View entering={enter1}>
        <GlassContainer radius={24} intensity={42} borderOpacity={0.22}>
          <View className="px-4 py-4">
            <Text className="mb-1 text-[14px] font-bold text-slate-800 dark:text-white">
              学期时间
            </Text>
            <Text className="mb-3 text-[10.5px] text-slate-500 dark:text-slate-400">
              作用于「{schedule.name}」：开学日期决定当前第几周，放假日期决定总周数
            </Text>

            <DateRow
              label="开学日期"
              hint="第 1 周自动从所选日期所在周的周一开始"
              value={formatDateLabel(schedule.startDate)}
              onPress={() => openDate("start")}
            />
            <DateRow
              label="放假日期"
              hint="课程结束（课表到此为止）"
              value={formatDateLabel(schedule.endDate)}
              onPress={() => openDate("end")}
            />

            {/* 总周数快选 */}
            <View className="mt-1 flex-row items-center justify-between">
              <Text className="text-[11.5px] font-semibold text-slate-600 dark:text-slate-300">
                学期总周数
              </Text>
              <View className="flex-row items-center gap-1.5">
                {[16, 18, 20].map((w) => {
                  const on = schedule.totalWeeks === w;
                  return (
                    <Pressable
                      key={w}
                      onPress={() => setTotalWeeksQuick(w)}
                      className={`rounded-lg border px-2.5 py-1 ${
                        on
                          ? "border-sky-500/75 bg-sky-500/20"
                          : "border-slate-300/30 bg-white/25 dark:border-white/10 dark:bg-white/[0.05]"
                      }`}
                    >
                      <Text
                        className={`text-[11px] font-semibold ${
                          on
                            ? "text-sky-700 dark:text-sky-300"
                            : "text-slate-600 dark:text-slate-300"
                        }`}
                      >
                        {w}周
                      </Text>
                    </Pressable>
                  );
                })}
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="减少1周"
                  onPress={() => setTotalWeeksQuick(schedule.totalWeeks - 1)}
                  className="h-7 w-7 items-center justify-center rounded-lg bg-slate-400/15"
                >
                  <Text className="font-bold text-slate-700 dark:text-slate-200">−</Text>
                </Pressable>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="增加1周"
                  onPress={() => setTotalWeeksQuick(schedule.totalWeeks + 1)}
                  className="h-7 w-7 items-center justify-center rounded-lg bg-slate-400/15"
                >
                  <Text className="font-bold text-slate-700 dark:text-slate-200">+</Text>
                </Pressable>
              </View>
            </View>

            {/* 按当前第几周反推开学日 */}
            <View className="mt-2.5 flex-row items-center justify-between">
              <Text className="text-[11.5px] font-semibold text-slate-600 dark:text-slate-300">
                校准「本周是第几周」
              </Text>
              {status.phase === "active" ? (
                <View className="flex-row items-center gap-2">
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="当前周次减1"
                    disabled={status.clampedWeek <= 1}
                    onPress={() => calibrateCurrentWeek(status.clampedWeek - 1)}
                    className={`h-7 w-7 items-center justify-center rounded-lg bg-slate-400/15 ${status.clampedWeek <= 1 ? "opacity-35" : ""}`}
                  >
                    <Text className="font-bold text-slate-700 dark:text-slate-200">−</Text>
                  </Pressable>
                  <Text className="min-w-[54px] text-center text-[12px] font-bold text-sky-600 dark:text-sky-300">
                    第 {status.clampedWeek} 周
                  </Text>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="当前周次加1"
                    disabled={status.clampedWeek >= status.totalWeeks}
                    onPress={() => calibrateCurrentWeek(status.clampedWeek + 1)}
                    className={`h-7 w-7 items-center justify-center rounded-lg bg-slate-400/15 ${status.clampedWeek >= status.totalWeeks ? "opacity-35" : ""}`}
                  >
                    <Text className="font-bold text-slate-700 dark:text-slate-200">+</Text>
                  </Pressable>
                </View>
              ) : (
                <Pressable
                  accessibilityRole="button"
                  onPress={() => calibrateCurrentWeek(1)}
                  className="rounded-lg border border-sky-500/45 bg-sky-500/15 px-2.5 py-1"
                >
                  <Text className="text-[11px] font-semibold text-sky-700 dark:text-sky-300">
                    设本周为第 1 周
                  </Text>
                </Pressable>
              )}
            </View>

            <View className="mt-3 rounded-2xl bg-white/25 px-3.5 py-2.5 dark:bg-white/[0.05]">
              <Text className="text-[11.5px] text-slate-600 dark:text-slate-300">
                {statusText}
              </Text>
            </View>
          </View>
        </GlassContainer>
      </Animated.View>

      {/* 课程表管理 */}
      <Animated.View entering={enter2} style={{ marginTop: 14 }}>
        <GlassContainer radius={24} intensity={42} borderOpacity={0.22}>
          <View className="px-4 py-4">
            <Text className="mb-1 text-[14px] font-bold text-slate-800 dark:text-white">
              课程表管理
            </Text>
            <Text className="mb-3 text-[10.5px] text-slate-500 dark:text-slate-400">
              点按切换课表；支持复制、合并、重命名或删除
            </Text>

            {schedules.map((item) => {
              const isActive = item.id === activeScheduleId;
              const distinct = countDistinctCourses(item.courses);
              return (
                <Pressable
                  key={item.id}
                  onPress={() => setActiveSchedule(item.id)}
                  className={`mb-2 flex-row items-center rounded-2xl border px-3.5 py-2.5 ${
                    isActive
                      ? "border-sky-400/60 bg-sky-400/15"
                      : "border-slate-300/30 bg-white/25 dark:border-white/10 dark:bg-white/[0.05]"
                  }`}
                >
                  <View className="flex-1 pr-2">
                    <Text className="text-[13px] font-bold text-slate-800 dark:text-white">
                      {item.name}
                    </Text>
                    <Text className="mt-0.5 text-[10px] text-slate-500 dark:text-slate-400">
                      {distinct} 门课 · {formatDateLabel(item.startDate)} 起 · 共{" "}
                      {item.totalWeeks} 周
                    </Text>
                  </View>

                  {!isActive ? (
                    <Pressable
                      accessibilityLabel={`合并课表 ${item.name}`}
                      onPress={(e) => {
                        e.stopPropagation();
                        confirmMerge(item);
                      }}
                      className="h-8 w-8 items-center justify-center rounded-full bg-white/25 dark:bg-white/[0.07]"
                    >
                      <Ionicons
                        name="git-merge-outline"
                        size={13}
                        color="#0EA5E9"
                      />
                    </Pressable>
                  ) : null}
                  <Pressable
                    accessibilityLabel={`复制课表 ${item.name}`}
                    onPress={(e) => {
                      e.stopPropagation();
                      duplicateSchedule(item.id);
                    }}
                    className="ml-1.5 h-8 w-8 items-center justify-center rounded-full bg-white/25 dark:bg-white/[0.07]"
                  >
                    <Ionicons name="copy-outline" size={13} color="#64748B" />
                  </Pressable>
                  <Pressable
                    accessibilityLabel={`重命名课表 ${item.name}`}
                    onPress={(e) => {
                      e.stopPropagation();
                      openRename(item);
                    }}
                    className="ml-1.5 h-8 w-8 items-center justify-center rounded-full bg-white/25 dark:bg-white/[0.07]"
                  >
                    <Ionicons name="pencil" size={13} color="#64748B" />
                  </Pressable>
                  {schedules.length > 1 ? (
                    <Pressable
                      accessibilityLabel={`删除课表 ${item.name}`}
                      onPress={(e) => {
                        e.stopPropagation();
                        confirmDelete(item);
                      }}
                      className="ml-1.5 h-8 w-8 items-center justify-center rounded-full bg-white/25 dark:bg-white/[0.07]"
                    >
                      <Ionicons
                        name="trash-outline"
                        size={13}
                        color="#EF4444"
                      />
                    </Pressable>
                  ) : null}
                  {isActive ? (
                    <Ionicons
                      name="checkmark-circle"
                      size={18}
                      color="#38BDF8"
                      style={{ marginLeft: 6 }}
                    />
                  ) : null}
                </Pressable>
              );
            })}

            <Pressable
              onPress={openCreate}
              className="mt-1 items-center rounded-2xl border border-slate-300/35 bg-white/25 py-2.5 dark:border-white/10 dark:bg-white/[0.05]"
            >
              <Text className="text-[12px] font-semibold text-sky-600 dark:text-sky-300">
                + 新建课程表
              </Text>
            </Pressable>

            <Pressable
              onPress={confirmClearCurrentCourses}
              className="mt-2.5 items-center rounded-2xl border border-rose-500/35 bg-rose-500/10 py-2.5"
            >
              <Text className="text-[12px] font-semibold text-rose-600 dark:text-rose-300">
                清空当前课表课程（保留作息与成绩）
              </Text>
            </Pressable>
          </View>
        </GlassContainer>
      </Animated.View>

      {/* iOS 日期选择：显式点完成关闭，避免滚轮滚动途中自动收起 */}
      {iosPicker ? (
        <View className="mt-3 rounded-2xl border border-slate-300/30 bg-white/40 p-3 dark:border-white/10 dark:bg-white/[0.06]">
          <DateTimePicker
            value={parseIsoDate(
              iosPicker === "start" ? schedule.startDate : schedule.endDate,
            )}
            mode="date"
            onValueChange={(_e, d) => {
              if (d) commitDate(iosPicker, d);
            }}
            onDismiss={() => setIosPicker(null)}
          />
          <Pressable
            onPress={() => setIosPicker(null)}
            className="mt-2 items-center rounded-xl bg-sky-500/20 py-2"
          >
            <Text className="text-xs font-bold text-sky-700 dark:text-sky-300">
              完成
            </Text>
          </Pressable>
        </View>
      ) : null}

      {/* 课表命名（新建 / 重命名）：补全 KeyboardAvoidingView */}
      {nameModal !== null ? (
        <Modal
          visible
          transparent
          animationType="fade"
          onRequestClose={() => setNameModal(null)}
        >
          <GlassTargetProvider>
            <KeyboardAvoidingView
              behavior={Platform.OS === "ios" ? "padding" : "height"}
              className="flex-1 justify-end bg-black/45"
            >
              <Pressable
                className="flex-1"
                onPress={() => setNameModal(null)}
              />
              <Animated.View entering={enter0}>
                <GlassContainer
                  variant="sheet"
                  radius={32}
                  borderOpacity={0.3}
                  style={{ paddingBottom: 24 }}
                >
                  <View className="px-5 pt-5">
                    <View className="mb-4 flex-row items-center justify-between">
                      <Text className="text-[17px] font-bold text-slate-800 dark:text-white">
                        {nameModal.mode === "create" ? "新建课程表" : "重命名"}
                      </Text>
                      <Pressable
                        onPress={() => setNameModal(null)}
                        className="h-8 w-8 items-center justify-center rounded-full bg-slate-400/15 dark:bg-white/10"
                      >
                        <Ionicons name="close" size={16} color="#64748B" />
                      </Pressable>
                    </View>

                    <Text className="mb-1.5 text-[11px] font-semibold text-slate-500 dark:text-slate-400">
                      课表名称
                    </Text>
                    <TextInput
                      value={nameInput}
                      onChangeText={setNameInput}
                      placeholder="如：大二下"
                      placeholderTextColor="rgba(148,163,184,0.7)"
                      autoFocus
                      className="rounded-2xl border border-slate-300/35 bg-white/50 px-3.5 py-2.5 text-[14px] text-slate-800 dark:border-white/10 dark:bg-white/[0.07] dark:text-slate-100"
                    />

                    <Pressable
                      onPress={submitName}
                      className="mt-4 items-center rounded-2xl bg-sky-500 py-2.5"
                    >
                      <Text className="text-[12.5px] font-bold text-white">
                        {nameModal.mode === "create" ? "创建" : "保存"}
                      </Text>
                    </Pressable>

                    <Text className="mt-2.5 text-[10px] text-slate-400 dark:text-slate-500">
                      新课表会沿用当前作息时间，开学 / 放假日期可在「学期时间」中调整
                    </Text>
                  </View>
                </GlassContainer>
              </Animated.View>
            </KeyboardAvoidingView>
          </GlassTargetProvider>
        </Modal>
      ) : null}
    </>
  );
}

function AiSettings() {
  const enter0 = useCardEnter(0);
  const enter1 = useCardEnter(60);
  const enter2 = useCardEnter(110);
  const personaName = useWhalePersona((s) => s.persona.name);
  const whaleActive = useWhaleMemory((s) => s.active);
  const apiKey = useSettings((s) => s.apiKey);
  const setApiKey = useSettings((s) => s.setApiKey);
  const aiProvider = useSettings((s) => s.aiProvider);
  const aiBaseUrl = useSettings((s) => s.aiBaseUrl);
  const aiTextModel = useSettings((s) => s.aiTextModel);
  const aiVisionModel = useSettings((s) => s.aiVisionModel);
  const setAiProvider = useSettings((s) => s.setAiProvider);
  const setAiBaseUrl = useSettings((s) => s.setAiBaseUrl);
  const setAiTextModel = useSettings((s) => s.setAiTextModel);
  const setAiVisionModel = useSettings((s) => s.setAiVisionModel);
  const whalePhrase = useSettings((s) => s.whalePhrase);
  const setWhalePhrase = useSettings((s) => s.setWhalePhrase);

  const activePreset = getAiProviderPreset(aiProvider);
  const runtimeConfig = resolveAiRuntimeConfig({
    aiProvider,
    aiBaseUrl,
    aiTextModel,
    aiVisionModel,
  });

  const [draft, setDraft] = useState<string | null>(null);
  const editing = draft ?? apiKey;
  const [keyOpen, setKeyOpen] = useState(false);
  const [reveal, setReveal] = useState(false);
  const [saved, setSaved] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; text: string } | null>(null);
  const testAbortRef = useRef<AbortController | null>(null);
  const testGenRef = useRef(0);
  const [phraseDraft, setPhraseDraft] = useState<string | null>(null);
  const [phraseSaved, setPhraseSaved] = useState(false);

  const [advancedOpen, setAdvancedOpen] = useState(
    () =>
      aiProvider === "custom" ||
      Boolean(aiBaseUrl || aiTextModel || aiVisionModel),
  );
  const [baseUrlDraft, setBaseUrlDraft] = useState<string | null>(null);
  const [textModelDraft, setTextModelDraft] = useState<string | null>(null);
  const [visionModelDraft, setVisionModelDraft] = useState<string | null>(null);
  const [endpointNotice, setEndpointNotice] = useState<{
    ok: boolean;
    text: string;
  } | null>(null);

  const currentBaseUrlInput = baseUrlDraft ?? aiBaseUrl;
  const currentTextModelInput = textModelDraft ?? aiTextModel;
  const currentVisionModelInput = visionModelDraft ?? aiVisionModel;
  const hasCustomOverrides = Boolean(
    currentBaseUrlInput.trim() ||
      currentTextModelInput.trim() ||
      currentVisionModelInput.trim(),
  );

  const cancelTest = () => {
    testGenRef.current += 1;
    testAbortRef.current?.abort();
    testAbortRef.current = null;
    setTesting(false);
  };

  useEffect(() => () => {
    testAbortRef.current?.abort();
  }, []);

  const selectProvider = (nextId: AiProviderId) => {
    if (nextId === aiProvider) {
      if (nextId === "custom") setAdvancedOpen(true);
      return;
    }
    cancelTest();
    setTestResult(null);
    setEndpointNotice(null);
    setAiProvider(nextId);
    setAiBaseUrl("");
    setAiTextModel("");
    setAiVisionModel("");
    setBaseUrlDraft(null);
    setTextModelDraft(null);
    setVisionModelDraft(null);
    if (nextId === "custom") setAdvancedOpen(true);
  };

  const resetProviderDefaults = () => {
    cancelTest();
    setTestResult(null);
    setAiBaseUrl("");
    setAiTextModel("");
    setAiVisionModel("");
    setBaseUrlDraft(null);
    setTextModelDraft(null);
    setVisionModelDraft(null);
    setEndpointNotice({
      ok: true,
      text: `已恢复「${activePreset.label}」默认接口与模型`,
    });
  };

  const saveEndpointConfig = () => {
    const rawUrl = currentBaseUrlInput.trim();
    if (rawUrl && !normalizeBaseUrl(rawUrl)) {
      setEndpointNotice({
        ok: false,
        text: "接口地址无效，请输入以 http:// 或 https:// 开头的完整地址",
      });
      return;
    }
    setAiBaseUrl(rawUrl);
    setAiTextModel(currentTextModelInput);
    setAiVisionModel(currentVisionModelInput);
    setBaseUrlDraft(null);
    setTextModelDraft(null);
    setVisionModelDraft(null);
    setEndpointNotice({
      ok: true,
      text: "已保存接口与模型配置",
    });
  };

  const canTestConnection =
    !testing &&
    Boolean(runtimeConfig.baseUrl) &&
    (!activePreset.requiresApiKey || Boolean(editing.trim()));

  const runTest = async () => {
    cancelTest();
    const gen = testGenRef.current;
    const controller = new AbortController();
    testAbortRef.current = controller;
    setTesting(true);
    setTestResult(null);
    try {
      const res = await testDeepSeekConnection(editing, controller.signal);
      if (testGenRef.current !== gen) return;
      setTestResult({
        ok: true,
        text: `连接成功（${res.latencyMs}ms${res.modelCount ? ` · 可用模型 ${res.modelCount} 个` : ""}）`,
      });
    } catch (error) {
      if (testGenRef.current !== gen) return;
      setTestResult({
        ok: false,
        text: error instanceof Error ? error.message : "连接失败，请检查密钥与网络",
      });
    } finally {
      if (testGenRef.current === gen) {
        testAbortRef.current = null;
        setTesting(false);
      }
    }
  };

  const closeKeyModal = () => {
    cancelTest();
    setKeyOpen(false);
  };

  const currentPhraseInput = phraseDraft ?? whalePhrase;
  const keyStatusSummary = !activePreset.requiresApiKey
    ? apiKey
      ? "免密钥直连 · 已填可选密钥"
      : "免密钥本地直连（可测试连通性）"
    : apiKey
      ? "已配置密钥（可测试连通性）"
      : "点击配置 API Key";

  return (
    <>
      <Animated.View entering={enter0}>
        <GlassContainer radius={24} intensity={42} borderOpacity={0.22}>
          <Pressable
            accessibilityRole="button"
            onPress={() => {
              cancelTest();
              setDraft(apiKey);
              setSaved(false);
              setReveal(false);
              setTestResult(null);
              setKeyOpen(true);
            }}
            className="min-h-20 flex-row items-center px-4 py-4"
          >
            <View className="mr-3 h-11 w-11 items-center justify-center rounded-2xl bg-sky-400/20">
              <Ionicons name="key-outline" size={22} color="#38BDF8" />
            </View>
            <View className="flex-1">
              <Text className="text-[14px] font-bold text-slate-800 dark:text-white">
                AI 连接
              </Text>
              <Text
                numberOfLines={1}
                className="mt-1 text-[11px] text-slate-500 dark:text-slate-400"
              >
                {activePreset.label} · {keyStatusSummary}
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={17} color="#94A3B8" />
          </Pressable>

          <View className="border-t border-slate-300/25 px-4 pb-4 pt-3 dark:border-white/10">
            <Text className="mb-2 text-[11.5px] font-semibold text-slate-600 dark:text-slate-300">
              服务商预设
            </Text>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={{ gap: 8 }}
            >
              {AI_PROVIDER_PRESETS.map((preset) => {
                const selected = aiProvider === preset.id;
                return (
                  <Pressable
                    key={preset.id}
                    accessibilityRole="radio"
                    accessibilityState={{ checked: selected }}
                    onPress={() => selectProvider(preset.id)}
                    className={`rounded-xl border px-3 py-1.5 ${
                      selected
                        ? "border-sky-500/75 bg-sky-500/20"
                        : "border-slate-300/30 bg-white/25 dark:border-white/10 dark:bg-white/[0.05]"
                    }`}
                  >
                    <Text
                      className={`text-[11.5px] font-semibold ${
                        selected
                          ? "text-sky-700 dark:text-sky-300"
                          : "text-slate-600 dark:text-slate-300"
                      }`}
                    >
                      {preset.label}
                    </Text>
                  </Pressable>
                );
              })}
            </ScrollView>

            <Text className="mt-2 text-[10.5px] leading-4 text-slate-500 dark:text-slate-400">
              {activePreset.hint}
              {!activePreset.supportsDeepSeekServerTools
                ? " · 联网搜索自动走通用通道"
                : ""}
            </Text>

            <View className="mt-3 flex-row items-center justify-between">
              <Pressable
                accessibilityRole="button"
                onPress={() => setAdvancedOpen((v) => !v)}
                className="flex-row items-center gap-1.5 py-1"
              >
                <Text className="text-[11.5px] font-semibold text-slate-700 dark:text-slate-200">
                  接口与模型配置
                </Text>
                <Text className="text-[10.5px] text-slate-500 dark:text-slate-400">
                  {runtimeConfig.textModel || "待填写"}
                </Text>
                <Ionicons
                  name={advancedOpen ? "chevron-up" : "chevron-down"}
                  size={14}
                  color="#94A3B8"
                />
              </Pressable>

              {hasCustomOverrides ? (
                <Pressable
                  accessibilityRole="button"
                  onPress={resetProviderDefaults}
                  className="rounded-lg border border-slate-300/35 bg-white/25 px-2.5 py-1 dark:border-white/10 dark:bg-white/[0.05]"
                >
                  <Text className="text-[10.5px] font-semibold text-sky-600 dark:text-sky-300">
                    恢复默认
                  </Text>
                </Pressable>
              ) : null}
            </View>

            {advancedOpen ? (
              <View className="mt-2.5 gap-y-2.5">
                <View>
                  <Text className="mb-1 text-[11px] font-semibold text-slate-600 dark:text-slate-300">
                    Base URL
                  </Text>
                  <TextInput
                    accessibilityLabel="AI Base URL"
                    value={currentBaseUrlInput}
                    onChangeText={(v) => {
                      setBaseUrlDraft(v);
                      setEndpointNotice(null);
                    }}
                    placeholder={
                      activePreset.baseUrl || "https://your-gateway.example.com/v1"
                    }
                    placeholderTextColor="#94A3B8"
                    autoCapitalize="none"
                    autoCorrect={false}
                    className="rounded-xl border border-slate-300/35 bg-white/40 px-3 py-2 text-[12.5px] text-slate-800 dark:border-white/10 dark:bg-white/[0.06] dark:text-slate-100"
                  />
                </View>

                <View>
                  <Text className="mb-1 text-[11px] font-semibold text-slate-600 dark:text-slate-300">
                    文本模型（Text Model）
                  </Text>
                  <TextInput
                    accessibilityLabel="文本模型"
                    value={currentTextModelInput}
                    onChangeText={(v) => {
                      setTextModelDraft(v);
                      setEndpointNotice(null);
                    }}
                    placeholder={
                      activePreset.defaultTextModel ||
                      "如 deepseek-flash / gemini-3.8-flash / qwen3.8-flash"
                    }
                    placeholderTextColor="#94A3B8"
                    autoCapitalize="none"
                    autoCorrect={false}
                    className="rounded-xl border border-slate-300/35 bg-white/40 px-3 py-2 text-[12.5px] text-slate-800 dark:border-white/10 dark:bg-white/[0.06] dark:text-slate-100"
                  />
                </View>

                <View>
                  <Text className="mb-1 text-[11px] font-semibold text-slate-600 dark:text-slate-300">
                    视觉模型（Vision Model）
                  </Text>
                  <TextInput
                    accessibilityLabel="视觉模型"
                    value={currentVisionModelInput}
                    onChangeText={(v) => {
                      setVisionModelDraft(v);
                      setEndpointNotice(null);
                    }}
                    placeholder={
                      activePreset.defaultVisionModel || "留空则复用文本模型"
                    }
                    placeholderTextColor="#94A3B8"
                    autoCapitalize="none"
                    autoCorrect={false}
                    className="rounded-xl border border-slate-300/35 bg-white/40 px-3 py-2 text-[12.5px] text-slate-800 dark:border-white/10 dark:bg-white/[0.06] dark:text-slate-100"
                  />
                </View>

                <View className="flex-row gap-2 pt-0.5">
                  <Pressable
                    accessibilityRole="button"
                    onPress={resetProviderDefaults}
                    className="flex-1 items-center rounded-xl border border-slate-300/35 bg-white/25 py-2 dark:border-white/10 dark:bg-white/[0.05]"
                  >
                    <Text className="text-[11.5px] font-semibold text-slate-600 dark:text-slate-300">
                      恢复默认
                    </Text>
                  </Pressable>
                  <Pressable
                    accessibilityRole="button"
                    onPress={saveEndpointConfig}
                    className="flex-1 items-center rounded-xl bg-sky-500 py-2"
                  >
                    <Text className="text-[11.5px] font-bold text-white">
                      保存接口与模型
                    </Text>
                  </Pressable>
                </View>

                {endpointNotice ? (
                  <Text
                    className={`text-[11px] font-semibold ${
                      endpointNotice.ok
                        ? "text-emerald-600 dark:text-emerald-300"
                        : "text-rose-600 dark:text-rose-300"
                    }`}
                  >
                    {endpointNotice.text}
                  </Text>
                ) : null}
              </View>
            ) : null}
          </View>
        </GlassContainer>
      </Animated.View>

      {keyOpen ? (
        <Modal
          visible
          transparent
          animationType="fade"
          onRequestClose={closeKeyModal}
        >
          <KeyboardAvoidingView
            behavior={Platform.OS === "ios" ? "padding" : "height"}
            className="flex-1 justify-center bg-black/55 px-5"
          >
            <View
              accessibilityViewIsModal
              className="max-h-[85%] w-full max-w-lg self-center overflow-hidden rounded-[28px] bg-slate-50 dark:bg-slate-900"
            >
              <ScrollView
                keyboardShouldPersistTaps="handled"
                contentContainerStyle={{ padding: 24 }}
              >
                <View className="flex-row items-center justify-between">
                  <View className="h-12 w-12 items-center justify-center rounded-2xl bg-sky-400/15">
                    <Ionicons name="sparkles-outline" size={25} color="#38BDF8" />
                  </View>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="关闭 AI 连接设置"
                    onPress={closeKeyModal}
                    className="h-11 w-11 items-center justify-center rounded-full bg-slate-200/60 dark:bg-white/10"
                  >
                    <Ionicons name="close" size={22} color="#64748B" />
                  </Pressable>
                </View>
                <Text className="mt-5 text-[23px] font-bold text-slate-800 dark:text-white">
                  连接你的 AI
                </Text>
                <Text className="mt-2 text-[13px] leading-6 text-slate-500 dark:text-slate-400">
                  当前服务商：{activePreset.label}（{runtimeConfig.baseUrl || "未设置接口地址"}）。
                </Text>
                <Text className="mb-2 mt-6 text-[12px] font-semibold text-slate-600 dark:text-slate-300">
                  {activePreset.label} API Key{activePreset.requiresApiKey ? "" : "（可选）"}
                </Text>
                <View className="flex-row items-center rounded-2xl border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-800">
                  <TextInput
                    accessibilityLabel={`${activePreset.label} API Key`}
                    value={editing}
                    onChangeText={(v) => {
                      cancelTest();
                      setDraft(v);
                      setSaved(false);
                      setTestResult(null);
                    }}
                    placeholder={
                      !activePreset.requiresApiKey
                        ? "本地服务可留空"
                        : activePreset.id === "gemini"
                          ? "输入或粘贴 AIza…（Google AI Studio Key）"
                          : activePreset.id === "openrouter"
                            ? "输入或粘贴 sk-or-…"
                            : "输入或粘贴 sk-…"
                    }
                    placeholderTextColor="#94A3B8"
                    autoCapitalize="none"
                    autoCorrect={false}
                    secureTextEntry={!reveal}
                    className="min-h-14 flex-1 px-4 py-3 text-[14px] text-slate-800 dark:text-slate-100"
                  />
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={reveal ? "隐藏密钥" : "显示密钥"}
                    onPress={() => setReveal(!reveal)}
                    className="h-12 w-12 items-center justify-center"
                  >
                    <Ionicons
                      name={reveal ? "eye-off-outline" : "eye-outline"}
                      size={21}
                      color="#94A3B8"
                    />
                  </Pressable>
                </View>
                <Text className="mt-3 text-[11px] leading-5 text-slate-500 dark:text-slate-400">
                  密钥仅保存在本机系统安全存储中，调用时发送至所选服务商。可点击下方「测试连接」零消耗验证连通性。
                </Text>

                {testResult ? (
                  <View
                    className={`mt-3 rounded-2xl px-3.5 py-2.5 ${
                      testResult.ok ? "bg-emerald-500/15" : "bg-rose-500/15"
                    }`}
                  >
                    <Text
                      accessibilityLiveRegion="polite"
                      className={`text-[12px] font-semibold ${
                        testResult.ok
                          ? "text-emerald-700 dark:text-emerald-300"
                          : "text-rose-600 dark:text-rose-300"
                      }`}
                    >
                      {testResult.text}
                    </Text>
                  </View>
                ) : null}

                <View className="mt-5 flex-row gap-2.5">
                  <Pressable
                    accessibilityRole="button"
                    disabled={!canTestConnection}
                    onPress={() => void runTest()}
                    className={`min-h-12 flex-1 items-center justify-center rounded-2xl border border-sky-500/50 bg-sky-500/12 ${
                      !canTestConnection ? "opacity-40" : ""
                    }`}
                  >
                    <Text className="text-[13.5px] font-bold text-sky-700 dark:text-sky-300">
                      {testing ? "测试中…" : "测试连接"}
                    </Text>
                  </Pressable>
                  <Pressable
                    accessibilityRole="button"
                    onPress={() => {
                      setApiKey(editing);
                      setDraft(editing.trim());
                      setSaved(true);
                      setReveal(false);
                    }}
                    className="min-h-12 flex-1 items-center justify-center rounded-2xl bg-sky-500"
                  >
                    <Text className="text-[14px] font-bold text-white">
                      保存配置
                    </Text>
                  </Pressable>
                </View>

                <Text
                  accessibilityLiveRegion="polite"
                  className="mt-3 text-center text-[12px] text-slate-500 dark:text-slate-400"
                >
                  {saved
                    ? editing.trim()
                      ? "已保存，下次请求使用新密钥"
                      : "已清除密钥"
                    : "关闭窗口会放弃未保存的修改"}
                </Text>
              </ScrollView>
            </View>
          </KeyboardAvoidingView>
        </Modal>
      ) : null}

      <Animated.View entering={enter1} style={{ marginTop: 14 }}>
        <GlassContainer radius={24} intensity={42} borderOpacity={0.22}>
          <Pressable
            accessibilityRole="button"
            onPress={() => router.push("/whale-settings")}
            className="min-h-20 flex-row items-center px-4 py-4"
          >
            <View className="mr-3 h-11 w-11 items-center justify-center rounded-2xl bg-sky-400/20">
              <Ionicons name="options" size={22} color="#38BDF8" />
            </View>
            <View className="flex-1">
              <Text className="text-[14px] font-bold text-slate-800 dark:text-white">
                {personaName} · Agent 人设与记忆
              </Text>
              <Text className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">
                配置社区大肥鱼提示词、DeepSeek 官方联网搜索、思考深度、成绩感知、临时指令与记忆
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={17} color="#94A3B8" />
          </Pressable>
        </GlassContainer>
      </Animated.View>

      {whaleActive ? (
        <Animated.View entering={enter2} style={{ marginTop: 14 }}>
          <GlassContainer radius={24} intensity={42} borderOpacity={0.22}>
            <View className="px-4 py-4">
              <Text className="text-[14px] font-bold text-slate-800 dark:text-white">
                召唤口令
              </Text>
              <Text className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">
                在助手对话中发送该口令可快速唤出 {personaName}（2～12 个字）
              </Text>
              <View className="mt-3 flex-row items-center gap-2">
                <TextInput
                  accessibilityLabel="召唤口令"
                  value={currentPhraseInput}
                  onChangeText={(v) => {
                    setPhraseDraft(v);
                    setPhraseSaved(false);
                  }}
                  maxLength={12}
                  placeholder="2～12 个字"
                  placeholderTextColor="#94A3B8"
                  className="flex-1 rounded-xl border border-slate-300/35 bg-white/40 px-3 py-2 text-[13px] text-slate-800 dark:border-white/10 dark:bg-white/[0.06] dark:text-slate-100"
                />
                <Pressable
                  onPress={() => {
                    const cleaned = currentPhraseInput.replace(/[\s「」"“”'']/g, "").slice(0, 12);
                    if (cleaned.length < 2) {
                      Alert.alert("口令太短", "请至少输入 2 个有效字符。");
                      return;
                    }
                    setWhalePhrase(cleaned);
                    setPhraseDraft(null);
                    setPhraseSaved(true);
                  }}
                  className="rounded-xl bg-sky-500 px-3.5 py-2.5"
                >
                  <Text className="text-xs font-bold text-white">保存</Text>
                </Pressable>
              </View>
              {phraseSaved ? (
                <Text className="mt-1.5 text-[11px] text-emerald-600 dark:text-emerald-300">
                  已更新召唤口令为「{whalePhrase}」
                </Text>
              ) : null}
            </View>
          </GlassContainer>
        </Animated.View>
      ) : null}
    </>
  );
}

function ReminderAndWidgetSettings() {
  const enter0 = useCardEnter(0);
  const enter1 = useCardEnter(50);
  const enter2 = useCardEnter(100);
  const liveClassNotification = useSettings((s) => s.liveClassNotification);
  const setLiveClassNotification = useSettings((s) => s.setLiveClassNotification);
  const requestingLivePermRef = useRef(false);

  const toggleLiveClassNotification = async (next: boolean) => {
    if (!next) {
      setLiveClassNotification(false);
      return;
    }
    if (Platform.OS !== "web") {
      if (requestingLivePermRef.current) return;
      requestingLivePermRef.current = true;
      try {
        const granted = await ensureReminderPermission();
        if (!granted) {
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
      } catch {
        Alert.alert("无法开启通知", "请检查系统通知权限后重试。");
        return;
      } finally {
        requestingLivePermRef.current = false;
      }
    }
    setLiveClassNotification(true);
  };

  return (
    <>
      <Animated.View entering={enter0}>
        <CourseReminderSettings />
      </Animated.View>
      <Animated.View entering={enter1} style={{ marginBottom: 14 }}>
        <GlassContainer radius={24} intensity={42} borderOpacity={0.22}>
          <View className="px-4 py-3">
            <ToggleRow
              label="常驻上课进度通知"
              hint="课前准备与上课期间在通知栏实时展示当前课程剩余时间与进度"
              value={liveClassNotification}
              onValueChange={(v) => {
                void toggleLiveClassNotification(v);
              }}
            />
          </View>
        </GlassContainer>
      </Animated.View>
      <Animated.View entering={enter2}>
        <CourseWidgetSettings />
      </Animated.View>
    </>
  );
}

/** 顶部概览：统一使用 getSemesterStatus 与去重门数/真实节数 */
function SettingsOverview() {
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

/** 按高频使用顺序排列：核心课表与提醒置顶，低频备份与性能诊断靠后 */
const SETTINGS_GROUPS = [
  {
    id: "schedule",
    title: "课表与学期",
    description: "显示偏好、作息时间、学期日期与多课表",
    icon: "calendar-outline",
    Content: ScheduleSettings,
  },
  {
    id: "reminders",
    title: "提醒与小组件",
    description: "上课提醒、手机闹钟/日程与桌面小组件",
    icon: "notifications-outline",
    Content: ReminderAndWidgetSettings,
  },
  {
    id: "appearance",
    title: "外观与背景",
    description: "深浅色、材质、6 套背景色调与自定义壁纸",
    icon: "color-palette-outline",
    Content: AppearanceSettings,
  },
  {
    id: "ai",
    title: "AI 与桌宠",
    description: "多服务商连接测试、模型配置、人设与记忆",
    icon: "sparkles-outline",
    Content: AiSettings,
  },
  {
    id: "backup",
    title: "备份与恢复",
    description: "导入导出备份与重置全部数据",
    icon: "save-outline",
    Content: BackupSettings,
  },
  {
    id: "performance",
    title: "性能与诊断",
    description: "画面表现、保存状态与请求耗时",
    icon: "speedometer-outline",
    Content: PerformanceSettings,
  },
] as const;

function SettingsPage({
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

export function SettingsScreen() {
  const enterList = useCardEnter(50);
  return (
    <SettingsPage
      title="设置"
      onBack={() => (router.canGoBack() ? router.back() : router.replace("/"))}
    >
      <SettingsOverview />
      <Animated.View entering={enterList} style={{ marginTop: 14 }}>
        <GlassContainer radius={24} intensity={42} borderOpacity={0.22}>
          {SETTINGS_GROUPS.map((group, index) => (
            <Link
              key={group.id}
              href={{
                pathname: "/settings/[category]",
                params: { category: group.id },
              }}
              asChild
            >
              <Pressable
                className="min-h-[70px] flex-row items-center gap-3 px-4 py-2.5 active:bg-sky-400/15"
                style={
                  index > 0
                    ? {
                        borderTopWidth: 1,
                        borderTopColor: "rgba(148,163,184,0.2)",
                      }
                    : undefined
                }
              >
                <View className="h-10 w-10 items-center justify-center rounded-[14px] bg-sky-400/20">
                  <Ionicons name={group.icon} size={19} color="#0EA5E9" />
                </View>
                <View className="flex-1">
                  <Text className="text-[15px] font-bold text-slate-800 dark:text-white">
                    {group.title}
                  </Text>
                  <Text className="mt-0.5 text-[12px] text-slate-600 dark:text-slate-400">
                    {group.description}
                  </Text>
                </View>
                <Ionicons name="chevron-forward" size={16} color="#94A3B8" />
              </Pressable>
            </Link>
          ))}
        </GlassContainer>
      </Animated.View>
      <UpdateCard />
      <Text className="mt-5 text-center text-[11px] text-slate-500 dark:text-slate-400">
        Dark Study v{currentVersion()}
      </Text>
    </SettingsPage>
  );
}

export function SettingsCategoryScreen({ category }: { category: string }) {
  const group = SETTINGS_GROUPS.find((item) => item.id === category);
  const Content = group?.Content;

  return (
    <SettingsPage
      title={group?.title ?? "设置"}
      onBack={() =>
        router.canGoBack() ? router.back() : router.replace("/settings")
      }
    >
      {Content ? (
        <Content />
      ) : (
        <Link
          href="/settings"
          replace
          className="py-3 text-sky-700 dark:text-sky-300"
        >
          返回设置
        </Link>
      )}
    </SettingsPage>
  );
}
