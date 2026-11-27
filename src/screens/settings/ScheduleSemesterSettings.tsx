import Ionicons from "@expo/vector-icons/Ionicons";
import DateTimePicker, {
  DateTimePickerAndroid,
} from "@react-native-community/datetimepicker";
import React, { useState } from "react";
import {
  Alert,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  Text,
  TextInput,
  View,
} from "react-native";
import Animated from "react-native-reanimated";

import {
  GlassContainer,
  GlassTargetProvider,
} from "@/components/GlassContainer";
import { PeriodSettings } from "@/components/PeriodSettings";
import { useForegroundClock } from "@/hooks/useForegroundClock";
import { useSettings } from "@/store/useSettings";
import { useActiveSchedule, useStore } from "@/store/useStore";
import type { Schedule } from "@/types";
import {
  addDays,
  countDistinctCourses,
  formatDateLabel,
  getSemesterStatus,
  mondayOf,
  parseIsoDate,
  toIsoDate,
} from "@/utils/time";

import { DateRow, ToggleRow, useCardEnter } from "./SettingsShared";

export function ScheduleSemesterSettings() {
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

export default ScheduleSemesterSettings;
