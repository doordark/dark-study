import { useWhalePersona } from "@/store/useWhalePersona";
import Ionicons from "@expo/vector-icons/Ionicons";
import DateTimePicker, {
  DateTimePickerAndroid,
} from "@react-native-community/datetimepicker";
import { Link, router } from "expo-router";
import { colorScheme } from "nativewind";
import React, { useState, type ReactNode } from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from "react-native";
import Animated, { FadeInDown, FadeOutDown } from "react-native-reanimated";

import { PeriodSettings } from "@/components/PeriodSettings";
import { CourseReminderSettings } from "@/components/CourseReminderSettings";
import { CourseWidgetSettings } from "@/components/CourseWidgetSettings";
import { Backdrop } from "@/components/Backdrop";
import {
  GlassContainer,
  GlassTargetProvider,
} from "@/components/GlassContainer";
import { GlassMaterialPreview } from "@/components/GlassMaterialPreview";
import { pickImageForBackground } from "@/services/fileImport";
import {
  currentVersion,
  formatBytes,
  isAndroid,
  openInstallPermissionSettings,
} from "@/services/updater";
import { useSettings } from "@/store/useSettings";
import { useUpdateTask } from "@/store/useUpdateTask";
import { useActiveSchedule, useStore } from "@/store/useStore";
import type { Schedule } from "@/types";
import {
  formatDateLabel,
  getDateInfo,
  parseIsoDate,
  toIsoDate,
} from "@/utils/time";

const APPEARANCES = [
  { key: "system", label: "跟随系统", icon: "phone-portrait" },
  { key: "light", label: "浅色", icon: "sunny" },
  { key: "dark", label: "深色", icon: "moon" },
] as const;

/** 卡片材质：扁平 / 柔光玻璃 */
const MATERIALS = [
  { key: "glass", label: "柔光玻璃", hint: "透出背景纹理" },
  { key: "flat", label: "扁平", hint: "简洁清晰" },
] as const;

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
      className="mb-2 flex-row items-center rounded-2xl border border-white/20 bg-white/15 px-3.5 py-2.5 dark:border-white/10 dark:bg-white/[0.05]"
    >
      <View className="flex-1">
        <Text className="text-[12px] font-semibold text-slate-700 dark:text-slate-200">
          {label}
        </Text>
        <Text className="mt-0.5 text-[10px] text-slate-400 dark:text-slate-500">
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

/** 「检查更新」卡片：GitHub Releases 发现新版本 → 下载 APK → 调起安装器覆盖安装 */
function UpdateCard() {
  const phase = useUpdateTask((s) => s.phase);
  const info = useUpdateTask((s) => s.info);
  const progress = useUpdateTask((s) => s.progress);
  const message = useUpdateTask((s) => s.message);
  const check = useUpdateTask((s) => s.check);
  const download = useUpdateTask((s) => s.download);
  const cancelDownload = useUpdateTask((s) => s.cancelDownload);
  const install = useUpdateTask((s) => s.install);

  const version = currentVersion();

  /* 非 Android 端仅作展示（网页 / iOS 无 APK 安装通道） */
  if (!isAndroid()) {
    return (
      <Animated.View
        entering={FadeInDown.delay(420).springify()}
        style={{ marginTop: 14 }}
      >
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
    <Animated.View
      entering={FadeInDown.delay(420).springify()}
      style={{ marginTop: 14 }}
    >
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
                检查是否有新版本，下载后覆盖安装，课程与设置数据自动保留
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
                  <Text className="text-[11px] font-semibold text-rose-400">
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
                <Text className="text-[11.5px] text-rose-500 dark:text-rose-300">
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

/** 更新卡片的主按钮 */
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
      className="mt-3 items-center rounded-2xl bg-sky-500/85 py-2.5"
    >
      <Text className="text-[12px] font-bold text-white">{label}</Text>
    </Pressable>
  );
}

function AppearanceSettings() {
  const appearance = useSettings((s) => s.appearance);
  const material = useSettings((s) => s.material);
  const setMaterial = useSettings((s) => s.setMaterial);
  const backgroundImage = useSettings((s) => s.backgroundImage);
  const setBackgroundImage = useSettings((s) => s.setBackgroundImage);
  const setAppearance = useSettings((s) => s.setAppearance);

  const applyAppearance = (a: typeof appearance) => {
    setAppearance(a);
    colorScheme.set(a);
  };

  return (
    <>
      {/* 外观 */}
      <Animated.View entering={FadeInDown.springify()}>
        <GlassContainer radius={24} intensity={42} borderOpacity={0.22}>
          <View className="px-4 py-4">
            <Text className="mb-3 text-[14px] font-bold text-slate-800 dark:text-white">
              外观
            </Text>
            <View className="flex-row gap-x-2.5">
              {APPEARANCES.map((a) => (
                <Pressable
                  key={a.key}
                  onPress={() => applyAppearance(a.key)}
                  className={`flex-1 items-center rounded-2xl border py-3 ${
                    appearance === a.key
                      ? "border-sky-400/70 bg-sky-400/25"
                      : "border-white/15 bg-white/[0.06]"
                  }`}
                >
                  <Ionicons
                    name={a.icon}
                    size={18}
                    color={appearance === a.key ? "#38BDF8" : "#94A3B8"}
                  />
                  <Text
                    className={`mt-1 text-[11px] font-semibold ${
                      appearance === a.key
                        ? "text-sky-300"
                        : "text-slate-500 dark:text-slate-400"
                    }`}
                  >
                    {a.label}
                  </Text>
                </Pressable>
              ))}
            </View>
          </View>
        </GlassContainer>
      </Animated.View>

      {/* 材质 */}
      <Animated.View
        entering={FadeInDown.delay(420).springify()}
        style={{ marginTop: 14 }}
      >
        <GlassContainer radius={24} intensity={42} borderOpacity={0.22}>
          <View className="px-4 py-4">
            <Text className="mb-1 text-[14px] font-bold text-slate-800 dark:text-white">
              材质
            </Text>
            <Text className="mb-3 text-[11px] leading-4 text-slate-500 dark:text-slate-400">
              柔光玻璃保留底下的纹理，沿边缘透出一圈细光。
            </Text>
            <View className="flex-row gap-x-2.5">
              {MATERIALS.map((m) => (
                <Pressable
                  key={m.key}
                  onPress={() => setMaterial(m.key)}
                  accessibilityRole="radio"
                  accessibilityLabel={`${m.label}，${m.hint}`}
                  accessibilityState={{ checked: material === m.key }}
                  className="flex-1"
                >
                  <View className={`rounded-[20px] border-2 p-0.5 ${
                    material === m.key ? "border-sky-500 dark:border-sky-400" : "border-transparent"
                  }`}>
                    <GlassMaterialPreview material={m.key} />
                  </View>
                  <Text className={`mt-1.5 text-center text-[12px] font-semibold ${
                    material === m.key ? "text-sky-700 dark:text-sky-300" : "text-slate-700 dark:text-slate-300"
                  }`}>
                    {m.label}
                  </Text>
                </Pressable>
              ))}
            </View>
          </View>
        </GlassContainer>
      </Animated.View>

      {/* 背景 */}
      <Animated.View
        entering={FadeInDown.delay(420).springify()}
        style={{ marginTop: 14 }}
      >
        <GlassContainer radius={24} intensity={42} borderOpacity={0.22}>
          <View className="px-4 py-4">
            <Text className="mb-3 text-[14px] font-bold text-slate-800 dark:text-white">
              背景
            </Text>
            <View className="flex-row items-center gap-x-3">
              <View className="h-16 w-24 overflow-hidden rounded-2xl border border-white/25 dark:border-white/10">
                {backgroundImage ? (
                  <Image
                    source={{ uri: backgroundImage }}
                    style={{ width: "100%", height: "100%" }}
                    resizeMode="cover"
                  />
                ) : (
                  <View className="flex-1 items-center justify-center bg-white/20 dark:bg-white/[0.05]">
                    <Ionicons
                      name="image-outline"
                      size={18}
                      color="#94A3B8"
                    />
                  </View>
                )}
              </View>
              <View className="flex-1 gap-y-2">
                <Pressable
                  onPress={async () => {
                    const img = await pickImageForBackground();
                    if (img) setBackgroundImage(img.uri);
                  }}
                  className="items-center rounded-2xl bg-sky-500/85 py-2.5"
                >
                  <Text className="text-[12px] font-bold text-white">
                    {backgroundImage ? "更换背景图" : "上传背景图"}
                  </Text>
                </Pressable>
                <Pressable
                  onPress={() => setBackgroundImage(null)}
                  className="items-center rounded-2xl border border-white/20 bg-white/15 py-2"
                >
                  <Text className="text-[11px] font-semibold text-slate-500 dark:text-slate-400">
                    恢复默认渐变
                  </Text>
                </Pressable>
              </View>
            </View>
            <Text className="mt-2.5 text-[10px] text-slate-400">
              背景图会铺满整个应用界面，扁平卡片将叠加其上
            </Text>
          </View>
        </GlassContainer>
      </Animated.View>
    </>
  );
}

function ScheduleSettings() {
  const schedule = useActiveSchedule();
  const schedules = useStore((s) => s.schedules);
  const activeScheduleId = useStore((s) => s.activeScheduleId);
  const setActiveSchedule = useStore((s) => s.setActiveSchedule);
  const addSchedule = useStore((s) => s.addSchedule);
  const removeSchedule = useStore((s) => s.removeSchedule);
  const updateScheduleMeta = useStore((s) => s.updateScheduleMeta);
  const mergeSchedule = useStore((s) => s.mergeSchedule);

  /* ---------------- 学期日期 ---------------- */
  const [iosPicker, setIosPicker] = useState<"start" | "end" | null>(null);
  const weekIndex = Math.max(1, getDateInfo(schedule.startDate).weekIndex);

  const commitDate = (which: "start" | "end", d: Date) =>
    updateScheduleMeta(
      schedule.id,
      which === "start"
        ? { startDate: toIsoDate(d) }
        : { endDate: toIsoDate(d) },
    );

  const openDate = (which: "start" | "end") => {
    const current = parseIsoDate(
      which === "start" ? schedule.startDate : schedule.endDate,
    );
    if (Platform.OS === "android") {
      // Android 推荐命令式 API：直接弹出系统日期对话框
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
    Alert.alert(
      "删除课表",
      `确定删除「${item.name}」及其 ${item.courses.length} 门课程？此操作不可撤销。`,
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

  /** 把某份课表合并进当前课表（时间节次与周数自动换算） */
  const confirmMerge = (item: Schedule) => {
    const target = schedules.find((s) => s.id === activeScheduleId);
    Alert.alert(
      "合并课程表",
      `把「${item.name}」的 ${item.courses.length} 门课并入当前课表「${target?.name ?? ""}」？\n\n时间节次与周数会按两份课表的作息和开学日期自动换算，时间冲突的课程会在课表中以琥珀色标出。`,
      [
        { text: "取消", style: "cancel" },
        {
          text: "合并",
          onPress: () => {
            const report = mergeSchedule(item.id);
            const lines = [
              `已并入 ${report.added} 门课` +
                (report.skipped
                  ? `，跳过 ${report.skipped} 门（时间或周数无法对应）`
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

  return (
    <>
      <PeriodSettings />
      {/* 学期时间 */}
      <Animated.View entering={FadeInDown.springify()}>
        <GlassContainer radius={24} intensity={42} borderOpacity={0.22}>
          <View className="px-4 py-4">
            <Text className="mb-1 text-[14px] font-bold text-slate-800 dark:text-white">
              学期时间
            </Text>
            <Text className="mb-3 text-[10.5px] text-slate-500 dark:text-slate-400">
              作用于「{schedule.name}
              」：开学日期决定当前第几周，放假日期决定课表总周数
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

            <View className="rounded-2xl bg-white/20 px-3.5 py-2.5 dark:bg-white/[0.05]">
              <Text className="text-[11.5px] text-slate-600 dark:text-slate-300">
                当前第 {weekIndex} 周 · 本学期共 {schedule.totalWeeks} 周
              </Text>
            </View>
          </View>
        </GlassContainer>
      </Animated.View>

      {/* 课程表管理 */}
      <Animated.View
        entering={FadeInDown.delay(420).springify()}
        style={{ marginTop: 14 }}
      >
        <GlassContainer radius={24} intensity={42} borderOpacity={0.22}>
          <View className="px-4 py-4">
            <Text className="mb-1 text-[14px] font-bold text-slate-800 dark:text-white">
              课程表
            </Text>
            <Text className="mb-3 text-[10.5px] text-slate-500 dark:text-slate-400">
              可为每个学期建立一份课表，点按任意一行即可切换；其他课表可一键合并进当前课表
            </Text>

            {schedules.map((item) => {
              const isActive = item.id === activeScheduleId;
              return (
                <Pressable
                  key={item.id}
                  onPress={() => setActiveSchedule(item.id)}
                  className={`mb-2 flex-row items-center rounded-2xl border px-3.5 py-2.5 ${
                    isActive
                      ? "border-sky-400/60 bg-sky-400/15"
                      : "border-white/20 bg-white/15 dark:border-white/10 dark:bg-white/[0.05]"
                  }`}
                >
                  <View className="flex-1">
                    <Text className="text-[13px] font-bold text-slate-800 dark:text-white">
                      {item.name}
                    </Text>
                    <Text className="mt-0.5 text-[10px] text-slate-500 dark:text-slate-400">
                      {item.courses.length} 门课 ·{" "}
                      {formatDateLabel(item.startDate)} 起 · 共{" "}
                      {item.totalWeeks} 周
                    </Text>
                  </View>

                  {!isActive ? (
                    <Pressable
                      onPress={() => confirmMerge(item)}
                      className="h-8 w-8 items-center justify-center rounded-full bg-white/20 dark:bg-white/[0.07]"
                    >
                      <Ionicons
                        name="git-merge-outline"
                        size={13}
                        color="#38BDF8"
                      />
                    </Pressable>
                  ) : null}
                  <Pressable
                    onPress={() => openRename(item)}
                    className="ml-2 h-8 w-8 items-center justify-center rounded-full bg-white/20 dark:bg-white/[0.07]"
                  >
                    <Ionicons name="pencil" size={13} color="#94A3B8" />
                  </Pressable>
                  {schedules.length > 1 ? (
                    <Pressable
                      onPress={() => confirmDelete(item)}
                      className="ml-2 h-8 w-8 items-center justify-center rounded-full bg-white/20 dark:bg-white/[0.07]"
                    >
                      <Ionicons
                        name="trash-outline"
                        size={13}
                        color="#F87171"
                      />
                    </Pressable>
                  ) : null}
                  {isActive ? (
                    <Ionicons
                      name="checkmark-circle"
                      size={18}
                      color="#38BDF8"
                      style={{ marginLeft: 8 }}
                    />
                  ) : null}
                </Pressable>
              );
            })}

            <Pressable
              onPress={openCreate}
              className="mt-1 items-center rounded-2xl border border-white/20 bg-white/15 py-2.5 dark:border-white/10 dark:bg-white/[0.05]"
            >
              <Text className="text-[12px] font-semibold text-sky-600 dark:text-sky-300">
                + 新建课程表
              </Text>
            </Pressable>
          </View>
        </GlassContainer>
      </Animated.View>
      <DataSettings />
      {/* iOS 日期选择 */}
      {iosPicker ? (
        <DateTimePicker
          value={parseIsoDate(
            iosPicker === "start" ? schedule.startDate : schedule.endDate,
          )}
          mode="date"
          onValueChange={(_e, d) => {
            if (d) commitDate(iosPicker, d);
            setIosPicker(null);
          }}
          onDismiss={() => setIosPicker(null)}
        />
      ) : null}

      {/* 课表命名（新建 / 重命名） */}
      <Modal
        visible={nameModal !== null}
        transparent
        animationType="fade"
        onRequestClose={() => setNameModal(null)}
      >
        <GlassTargetProvider>
          <View className="flex-1 justify-end bg-black/45">
            <Pressable
              className="flex-1"
              onPress={() => setNameModal(null)}
            />
            <Animated.View
              entering={FadeInDown.springify()}
              exiting={FadeOutDown}
            >
              <GlassContainer
                radius={32}
                borderOpacity={0.3}
                style={{ paddingBottom: 24 }}
              >
                <View className="px-5 pt-5">
                  <View className="mb-4 flex-row items-center justify-between">
                    <Text className="text-[17px] font-bold text-slate-800 dark:text-white">
                      {nameModal?.mode === "create" ? "新建课程表" : "重命名"}
                    </Text>
                    <Pressable
                      onPress={() => setNameModal(null)}
                      className="h-8 w-8 items-center justify-center rounded-full bg-white/20 dark:bg-white/10"
                    >
                      <Ionicons name="close" size={16} color="#94A3B8" />
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
                    className="rounded-2xl border border-white/25 bg-white/40 px-3.5 py-2.5 text-[14px] text-slate-800 dark:border-white/10 dark:bg-white/[0.07] dark:text-slate-100"
                  />

                  <Pressable
                    onPress={submitName}
                    className="mt-4 items-center rounded-2xl bg-sky-500/85 py-2.5"
                  >
                    <Text className="text-[12.5px] font-bold text-white">
                      {nameModal?.mode === "create" ? "创建" : "保存"}
                    </Text>
                  </Pressable>

                  <Text className="mt-2.5 text-[10px] text-slate-400 dark:text-slate-500">
                    新课表会沿用当前作息时间，开学 /
                    放假日期可在「学期时间」中调整
                  </Text>
                </View>
              </GlassContainer>
            </Animated.View>
          </View>
        </GlassTargetProvider>
      </Modal>
    </>
  );
}

function AiSettings() {
  const personaName = useWhalePersona((s) => s.persona.name);
  const apiKey = useSettings((s) => s.apiKey);
  const setApiKey = useSettings((s) => s.setApiKey);
  const farmWebSearch = useSettings((s) => s.farmWebSearch);
  const setFarmWebSearch = useSettings((s) => s.setFarmWebSearch);
  const [draft, setDraft] = useState<string | null>(null);
  const editing = draft ?? apiKey;
  const [saved, setSaved] = useState(false);

  return (
    <>
      <Pressable accessibilityRole="switch" accessibilityState={{ checked: farmWebSearch }}
        onPress={() => setFarmWebSearch(!farmWebSearch)}>
        <GlassContainer radius={20} intensity={42} borderOpacity={0.22}>
          <View className="px-4 py-3">
            <Text className="font-bold text-slate-800 dark:text-white">农场居民联网搜索 · {farmWebSearch ? "开启" : "关闭"}</Text>
            <Text className="text-xs text-slate-500 dark:text-slate-400">明确请居民查资料时，将搜索词发送给搜索引擎。需要配置 DeepSeek API Key。</Text>
          </View>
        </GlassContainer>
      </Pressable>
      {/* DeepSeek Key */}
      <Animated.View entering={FadeInDown.springify()}>
        <GlassContainer radius={24} intensity={42} borderOpacity={0.22}>
          <View className="px-4 py-4">
            <View className="mb-3 flex-row items-center">
              <View className="h-9 w-9 items-center justify-center rounded-[13px] bg-sky-400/25">
                <Ionicons name="key" size={16} color="#38BDF8" />
              </View>
              <View className="ml-2.5 flex-1">
                <Text className="text-[14px] font-bold text-slate-800 dark:text-white">
                  DeepSeek API Key
                </Text>
                <Text className="text-[10.5px] text-slate-500 dark:text-slate-400">
                  用于课表识图、AI 助手与成绩识别
                </Text>
              </View>
            </View>

            <TextInput
              value={editing}
              onChangeText={(v) => {
                setDraft(v);
                setSaved(false);
              }}
              placeholder="sk-..."
              placeholderTextColor="rgba(148,163,184,0.7)"
              autoCapitalize="none"
              autoCorrect={false}
              secureTextEntry
              className="rounded-2xl border border-white/25 bg-white/35 px-3.5 py-2.5 text-[12.5px] text-slate-800 dark:border-white/10 dark:bg-white/[0.05] dark:text-slate-100"
            />

            <Pressable
              onPress={() => {
                setApiKey(editing);
                setDraft(null);
                setSaved(true);
              }}
              className="mt-2.5 items-center rounded-2xl bg-sky-500/85 py-2.5"
            >
              <Text className="text-[12px] font-bold text-white">
                保存 Key
              </Text>
            </Pressable>

            {saved ? (
              <Text className="mt-2 text-[11px] text-emerald-300">
                你的小助手已获取大脑
              </Text>
            ) : null}

            <View className="mt-3 rounded-2xl border border-amber-300/30 bg-amber-400/12 px-3.5 py-2.5 dark:border-amber-400/30 dark:bg-amber-500/12">
              <Text className="text-[10px] leading-4 text-amber-700 dark:text-amber-200">
                安全提示：生产环境请将 API Key
                放在自有服务端中转，不要硬编码进客户端。
              </Text>
            </View>
          </View>
        </GlassContainer>
      </Animated.View>

      <Animated.View entering={FadeInDown.delay(420).springify()} style={{ marginTop: 14 }}>
        <GlassContainer radius={24} intensity={42} borderOpacity={0.22}>
          <Pressable accessibilityRole="button" onPress={() => router.push("/whale-settings")} className="min-h-20 flex-row items-center px-4 py-4">
            <View className="mr-3 h-11 w-11 items-center justify-center rounded-2xl bg-sky-400/20"><Ionicons name="options" size={22} color="#38BDF8" /></View>
            <View className="flex-1"><Text className="text-[14px] font-bold text-slate-800 dark:text-white">{personaName} · 人设与记忆</Text><Text className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">拖动性格滑条、改写人设，整理她记住的事</Text></View>
            <Ionicons name="chevron-forward" size={17} color="#94A3B8" />
          </Pressable>
        </GlassContainer>
      </Animated.View>
    </>
  );
}

function DataSettings() {
  const schedule = useActiveSchedule();
  const schedules = useStore((s) => s.schedules);
  const grades = useStore((s) => s.grades);
  const resetToSample = useStore((s) => s.resetToSample);

  return (
    <>
      {/* 数据 */}
      <Animated.View entering={FadeInDown.delay(420).springify()} style={{ marginTop: 14 }}>
        <GlassContainer radius={24} intensity={42} borderOpacity={0.22}>
          <View className="px-4 py-4">
            <Text className="mb-3 text-[14px] font-bold text-slate-800 dark:text-white">
              数据
            </Text>
            <View className="rounded-2xl bg-white/20 px-3.5 py-3 dark:bg-white/[0.05]">
              <Text className="text-[11.5px] text-slate-600 dark:text-slate-300">
                当前课表：{schedule.name} · {schedule.courses.length} 门课
                （共 {schedules.length} 份）
              </Text>
              <Text className="mt-1 text-[11.5px] text-slate-600 dark:text-slate-300">
                成绩记录：{grades.length} 条
              </Text>
            </View>

            <Pressable
              onPress={resetToSample}
              className="mt-3 items-center rounded-2xl border border-rose-400/40 bg-rose-400/15 py-3"
            >
              <Text className="text-[12.5px] font-semibold text-rose-300">
                重置为示例数据
              </Text>
            </Pressable>

          </View>
        </GlassContainer>
      </Animated.View>
    </>
  );
}

function ReminderAndWidgetSettings() {
  return (
    <>
      <Animated.View entering={FadeInDown.springify()}>
        <CourseReminderSettings />
      </Animated.View>
      <Animated.View entering={FadeInDown.delay(420).springify()}>
        <CourseWidgetSettings />
      </Animated.View>
    </>
  );
}

/** 顶部概览：当前学期、周次与进度，顺带把课程 / 成绩数据摊开 */
function SettingsOverview() {
  const schedule = useActiveSchedule();
  const grades = useStore((s) => s.grades);
  const info = getDateInfo(schedule.startDate);
  const totalWeeks = Math.max(1, schedule.totalWeeks);
  const week = Math.min(totalWeeks, Math.max(1, info.weekIndex));
  const todayCourses = schedule.courses.filter(
    (course) => course.weekday === info.weekday && course.weeks.includes(week),
  ).length;
  const progress = Math.min(1, week / totalWeeks);

  return (
    <Animated.View entering={FadeInDown.springify()}>
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
                开学于 {formatDateLabel(schedule.startDate)}
              </Text>
            </View>
            <View className="items-end">
              <Text className="text-[17px] font-extrabold text-slate-800 dark:text-white">
                第 {week} 周
              </Text>
              <Text className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">
                {info.dateLabel} · 共 {totalWeeks} 周
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

          <View className="mt-4 flex-row items-center rounded-2xl bg-white/20 py-2.5 dark:bg-white/[0.05]">
            <OverviewStat label="课程" value={String(schedule.courses.length)} unit=" 门" />
            <View className="h-7 w-px bg-slate-400/25 dark:bg-white/10" />
            <OverviewStat label="今日" value={String(todayCourses)} unit=" 节" />
            <View className="h-7 w-px bg-slate-400/25 dark:bg-white/10" />
            <OverviewStat label="成绩" value={String(grades.length)} unit=" 条" />
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

const SETTINGS_GROUPS = [
  {
    id: "schedule",
    title: "课表与学期",
    description: "切换课表、学期日期与数据管理",
    icon: "calendar-outline",
    Content: ScheduleSettings,
  },
  {
    id: "reminders",
    title: "提醒与小组件",
    description: "上课提醒、桌面课表小组件",
    icon: "notifications-outline",
    Content: ReminderAndWidgetSettings,
  },
  {
    id: "appearance",
    title: "外观与背景",
    description: "深浅色、卡片材质、背景图",
    icon: "color-palette-outline",
    Content: AppearanceSettings,
  },
  {
    id: "ai",
    title: "AI 与桌宠",
    description: "DeepSeek API Key、人设与记忆",
    icon: "sparkles-outline",
    Content: AiSettings,
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
        <Text accessibilityRole="header" className="flex-1 text-2xl font-extrabold text-slate-800 dark:text-white">
          {title}
        </Text>
      </View>
      <ScrollView
        className="flex-1"
        contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 6, paddingBottom: 40 }}
        keyboardShouldPersistTaps="handled"
      >
        {children}
      </ScrollView>
    </Backdrop>
  );
}

export function SettingsScreen() {
  return (
    <SettingsPage
      title="设置"
      onBack={() => router.canGoBack() ? router.back() : router.replace("/")}
    >
      <SettingsOverview />
      <Animated.View
        entering={FadeInDown.delay(80).springify()}
        style={{ marginTop: 14 }}
      >
        <GlassContainer radius={24} intensity={42} borderOpacity={0.22}>
          {SETTINGS_GROUPS.map((group, index) => (
            <Link
              key={group.id}
              href={{ pathname: "/settings/[category]", params: { category: group.id } }}
              asChild
            >
              <Pressable
                className="min-h-[70px] flex-row items-center gap-3 px-4 py-2.5 active:bg-sky-400/15"
                style={index > 0 ? { borderTopWidth: 1, borderTopColor: "rgba(148,163,184,0.2)" } : undefined}
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
      onBack={() => router.canGoBack() ? router.back() : router.replace("/settings")}
    >
      {Content ? <Content /> : (
        <Link href="/settings" replace className="py-3 text-sky-700 dark:text-sky-300">
          返回设置
        </Link>
      )}
    </SettingsPage>
  );
}
