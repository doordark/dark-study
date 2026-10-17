import { Ionicons } from "@expo/vector-icons";
import DateTimePicker, {
  DateTimePickerAndroid,
} from "@react-native-community/datetimepicker";
import { router } from "expo-router";
import { colorScheme } from "nativewind";
import React, { useState } from "react";
import {
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

import { Backdrop } from "@/components/Backdrop";
import {
  GlassContainer,
  GlassTargetProvider,
} from "@/components/GlassContainer";
import { pickImageForBackground } from "@/services/fileImport";
import { useSettings } from "@/store/useSettings";
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

export function SettingsScreen() {
  const apiKey = useSettings((s) => s.apiKey);
  const setApiKey = useSettings((s) => s.setApiKey);
  const appearance = useSettings((s) => s.appearance);
  const backgroundImage = useSettings((s) => s.backgroundImage);
  const setBackgroundImage = useSettings((s) => s.setBackgroundImage);
  const setAppearance = useSettings((s) => s.setAppearance);

  const schedule = useActiveSchedule();
  const schedules = useStore((s) => s.schedules);
  const activeScheduleId = useStore((s) => s.activeScheduleId);
  const setActiveSchedule = useStore((s) => s.setActiveSchedule);
  const addSchedule = useStore((s) => s.addSchedule);
  const removeSchedule = useStore((s) => s.removeSchedule);
  const updateScheduleMeta = useStore((s) => s.updateScheduleMeta);
  const mergeSchedule = useStore((s) => s.mergeSchedule);
  const grades = useStore((s) => s.grades);
  const resetToSample = useStore((s) => s.resetToSample);

  const [editing, setEditing] = useState(apiKey);
  const [saved, setSaved] = useState(false);

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

  const applyAppearance = (a: typeof appearance) => {
    setAppearance(a);
    colorScheme.set(a);
  };

  return (
    <View className="flex-1">
      <Backdrop>
        <ScrollView
          contentContainerStyle={{
            paddingHorizontal: 20,
            paddingTop: 16,
            paddingBottom: 40,
          }}
          showsVerticalScrollIndicator={false}
        >
          <Animated.View entering={FadeInDown.springify()} className="mb-5">
            <Pressable
              onPress={() => router.back()}
              className="mb-3 h-9 w-9 items-center justify-center rounded-full bg-white/20 dark:bg-white/[0.07]"
            >
              <Ionicons name="chevron-back" size={18} color="#94A3B8" />
            </Pressable>
            <Text className="text-[24px] font-extrabold text-slate-800 dark:text-white">
              设置
            </Text>
            <Text className="mt-1 text-[12px] text-slate-500 dark:text-slate-400">
              外观、学期时间、课表管理与 AI 接入
            </Text>
          </Animated.View>

          {/* 外观 */}
          <Animated.View entering={FadeInDown.delay(60).springify()}>
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

          {/* 背景 */}
          <Animated.View
            entering={FadeInDown.delay(120).springify()}
            className="mt-3.5"
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

          {/* 学期时间 */}
          <Animated.View
            entering={FadeInDown.delay(180).springify()}
            className="mt-3.5"
          >
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
            entering={FadeInDown.delay(240).springify()}
            className="mt-3.5"
          >
            <GlassContainer radius={24} intensity={42} borderOpacity={0.22}>
              <View className="px-4 py-4">
                <Text className="mb-1 text-[14px] font-bold text-slate-800 dark:text-white">
                  课程表
                </Text>
                <Text className="mb-3 text-[10.5px] text-slate-500 dark:text-slate-400">
                  可为每个学期建立一份课表（如「大二下」），点按任意一行即可切换；其他课表可一键合并进当前课表
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

          {/* DeepSeek Key */}
          <Animated.View
            entering={FadeInDown.delay(300).springify()}
            className="mt-3.5"
          >
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
                      用于课表识图、助手与绩点规则识别
                    </Text>
                  </View>
                </View>

                <TextInput
                  value={editing}
                  onChangeText={(v) => {
                    setEditing(v);
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
                    已保存
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

          {/* 数据 */}
          <Animated.View
            entering={FadeInDown.delay(360).springify()}
            className="mt-3.5"
          >
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
                  onPress={() => {
                    resetToSample();
                    setEditing("");
                  }}
                  className="mt-3 items-center rounded-2xl border border-rose-400/40 bg-rose-400/15 py-3"
                >
                  <Text className="text-[12.5px] font-semibold text-rose-300">
                    重置为示例数据
                  </Text>
                </Pressable>
              </View>
            </GlassContainer>
          </Animated.View>

          <Text className="mt-6 text-center text-[10px] text-slate-400 dark:text-slate-500">
            CourseFlow · HyperOS 4 Design System
          </Text>
        </ScrollView>

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
      </Backdrop>
    </View>
  );
}
