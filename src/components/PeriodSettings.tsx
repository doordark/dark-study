import Ionicons from "@expo/vector-icons/Ionicons";
import { router } from "expo-router";
import { useState } from "react";
import {
  Alert,
  Platform,
  Pressable,
  Text,
  TextInput,
  View,
} from "react-native";

import { GlassContainer } from "@/components/GlassContainer";
import { DEFAULT_PERIODS } from "@/constants/sample";
import { useActiveSchedule, useStore } from "@/store/useStore";
import type { Period } from "@/types";
import { normalizeClockInput, timeToMinutes } from "@/utils/time";

function minsToClock(total: number): string {
  const clamped = Math.max(0, Math.min(23 * 60 + 59, total));
  return `${String(Math.floor(clamped / 60)).padStart(2, "0")}:${String(
    clamped % 60,
  ).padStart(2, "0")}`;
}

function buildReindexed(list: Period[]): Period[] {
  return list.map((p, idx) => ({
    ...p,
    index: idx + 1,
    label: /^第\d+节$/.test(p.label.trim()) ? `第${idx + 1}节` : p.label,
  }));
}

/** 常见高校作息一键模板，避免手工逐条填起止时间 */
const PERIOD_PRESETS: { label: string; periods: Period[] }[] = [
  { label: "标准 12 节 (08:00起)", periods: DEFAULT_PERIODS },
  {
    label: "12 节 (08:30起)",
    periods: DEFAULT_PERIODS.map((p) => {
      const shift = p.index <= 4 ? 30 : 0;
      return {
        ...p,
        startTime: minsToClock(timeToMinutes(p.startTime) + shift),
        endTime: minsToClock(timeToMinutes(p.endTime) + shift),
      };
    }),
  },
  {
    label: "50分制 10 节",
    periods: [
      { index: 1, label: "第1节", startTime: "08:00", endTime: "08:50" },
      { index: 2, label: "第2节", startTime: "09:00", endTime: "09:50" },
      { index: 3, label: "第3节", startTime: "10:10", endTime: "11:00" },
      { index: 4, label: "第4节", startTime: "11:10", endTime: "12:00" },
      { index: 5, label: "第5节", startTime: "14:00", endTime: "14:50" },
      { index: 6, label: "第6节", startTime: "15:00", endTime: "15:50" },
      { index: 7, label: "第7节", startTime: "16:10", endTime: "17:00" },
      { index: 8, label: "第8节", startTime: "17:10", endTime: "18:00" },
      { index: 9, label: "第9节", startTime: "19:00", endTime: "19:50" },
      { index: 10, label: "第10节", startTime: "20:00", endTime: "20:50" },
    ],
  },
  {
    label: "11 节 (08:00起)",
    periods: DEFAULT_PERIODS.slice(0, 11),
  },
  {
    label: "13 节 (含午间课)",
    periods: [
      ...DEFAULT_PERIODS.slice(0, 4),
      { index: 5, label: "午间节", startTime: "12:30", endTime: "13:15" },
      ...DEFAULT_PERIODS.slice(4).map((p, idx) => ({
        ...p,
        index: idx + 6,
        label: `第${idx + 6}节`,
      })),
    ],
  },
  {
    label: "14 节 (长作息)",
    periods: [
      ...DEFAULT_PERIODS.slice(0, 4),
      { index: 5, label: "第5节", startTime: "12:10", endTime: "12:55" },
      { index: 6, label: "第6节", startTime: "13:05", endTime: "13:50" },
      ...DEFAULT_PERIODS.slice(4).map((p, idx) => ({
        ...p,
        index: idx + 7,
        label: `第${idx + 7}节`,
      })),
    ],
  },
];

export function PeriodSettings() {
  const schedule = useActiveSchedule();
  return (
    <PeriodEditor
      key={`${schedule.id}:${JSON.stringify(schedule.periods)}`}
      scheduleId={schedule.id}
      periods={schedule.periods}
    />
  );
}

function PeriodEditor({
  scheduleId,
  periods,
}: {
  scheduleId: string;
  periods: Period[];
}) {
  const schedulesCount = useStore((s) => s.schedules.length);
  const [expanded, setExpanded] = useState(false);
  const [draft, setDraft] = useState(() => periods.map((p) => ({ ...p })));
  const [editing, setEditing] = useState(false);

  const update = (
    i: number,
    key: "label" | "startTime" | "endTime",
    value: string,
  ) =>
    setDraft((prev) =>
      prev.map((p, j) => (j === i ? { ...p, [key]: value } : p)),
    );

  /** 在指定索引后插入一节，按相邻时长自动估算时间 */
  const insertAfter = (afterIndex: number) => {
    setDraft((prev) => {
      const ref = prev[afterIndex];
      const next = prev[afterIndex + 1];
      let startTime = "08:00";
      let endTime = "08:45";
      if (
        ref &&
        /^\d{1,2}:\d{2}$/.test(normalizeClockInput(ref.startTime)) &&
        /^\d{1,2}:\d{2}$/.test(normalizeClockInput(ref.endTime))
      ) {
        const s = timeToMinutes(normalizeClockInput(ref.startTime));
        const e = timeToMinutes(normalizeClockInput(ref.endTime));
        const duration = Math.max(30, Math.min(90, e - s || 45));
        let candidateStart = Math.min(23 * 60, e + 10);
        let candidateEnd = Math.min(23 * 60 + 55, candidateStart + duration);
        if (
          next &&
          /^\d{1,2}:\d{2}$/.test(normalizeClockInput(next.startTime))
        ) {
          const nextStart = timeToMinutes(normalizeClockInput(next.startTime));
          if (nextStart - e >= 20) {
            candidateStart = e + 5;
            candidateEnd = Math.min(candidateStart + duration, nextStart - 5);
          }
        }
        startTime = minsToClock(candidateStart);
        endTime = minsToClock(Math.max(candidateStart + 5, candidateEnd));
      }
      const copy = [...prev];
      copy.splice(afterIndex + 1, 0, {
        index: afterIndex + 2,
        label: `第${afterIndex + 2}节`,
        startTime,
        endTime,
      });
      return buildReindexed(copy);
    });
  };

  /** 删除任意指定节次并重新连续编号 */
  const removeAt = (index: number) => {
    if (draft.length <= 1) return;
    setDraft((prev) => buildReindexed(prev.filter((_, i) => i !== index)));
  };

  /** 批量平移全部节次的起止时间（例如学校统一提前/推迟 10 分钟） */
  const shiftAll = (deltaMinutes: number) => {
    setDraft((prev) =>
      prev.map((p) => {
        const sNorm = normalizeClockInput(p.startTime);
        const eNorm = normalizeClockInput(p.endTime);
        if (!/^\d{2}:\d{2}$/.test(sNorm) || !/^\d{2}:\d{2}$/.test(eNorm)) {
          return p;
        }
        const s = timeToMinutes(sNorm) + deltaMinutes;
        const e = timeToMinutes(eNorm) + deltaMinutes;
        if (s < 0 || e > 23 * 60 + 59) return p;
        return {
          ...p,
          startTime: minsToClock(s),
          endTime: minsToClock(e),
        };
      }),
    );
  };

  const syncAllSchedules = () => {
    Alert.alert(
      "同步作息到全部课表？",
      "将当前课表的作息时间应用到其余所有课表。若某份课表的课程节次超出当前节数，该课表会自动跳过并提示。",
      [
        { text: "取消", style: "cancel" },
        {
          text: "同步",
          onPress: () => {
            const res = useStore.getState().applyPeriodsToAllSchedules();
            const lines = [`已同步 ${res.updated} 份课表`];
            if (res.skipped.length) {
              lines.push(
                `跳过 ${res.skipped.length} 份：\n${res.skipped.join("\n")}`,
              );
            }
            Alert.alert("同步结果", lines.join("\n\n"));
          },
        },
      ],
    );
  };

  const summaryRange =
    periods.length > 0
      ? `${periods[0].startTime} – ${periods[periods.length - 1].endTime}`
      : "未配置";

  const clockKeyboard =
    Platform.OS === "ios" ? "numbers-and-punctuation" : "default";

  return (
    <View style={{ marginBottom: 14 }}>
      <GlassContainer radius={24} intensity={42} borderOpacity={0.22}>
        <View className="px-4 py-4">
          <Pressable
            accessibilityRole="button"
            onPress={() => setExpanded((v) => !v)}
            className="flex-row items-center justify-between"
          >
            <View className="flex-1 pr-2">
              <Text className="text-[14px] font-bold text-slate-800 dark:text-white">
                作息时间表
              </Text>
              <Text className="mt-0.5 text-[11px] text-slate-500 dark:text-slate-400">
                共 {periods.length} 节 · {summaryRange}（点击
                {expanded ? "收起" : "展开查看 / 编辑"}）
              </Text>
            </View>
            <Ionicons
              name={expanded ? "chevron-up" : "chevron-down"}
              size={16}
              color="#94A3B8"
            />
          </Pressable>

          {expanded ? (
            <View className="mt-3">
              <Text className="mb-3 text-xs leading-4 text-slate-500 dark:text-slate-400">
                修改后课表、助手、小组件与上课提醒同步更新；单独设置了精确时间的调课会保留该时间。
              </Text>

              {editing ? (
                <View className="mb-3 gap-2.5">
                  <View>
                    <Text className="mb-1.5 text-[11px] font-semibold text-slate-500 dark:text-slate-400">
                      一键套用常见作息模板
                    </Text>
                    <View className="flex-row flex-wrap gap-1.5">
                      {PERIOD_PRESETS.map((preset) => (
                        <Pressable
                          key={preset.label}
                          onPress={() =>
                            setDraft(preset.periods.map((p) => ({ ...p })))
                          }
                          className="rounded-lg border border-slate-300/35 bg-white/30 px-2.5 py-1.5 dark:border-white/10 dark:bg-white/[0.06]"
                        >
                          <Text className="text-[11px] font-semibold text-slate-700 dark:text-slate-200">
                            {preset.label}
                          </Text>
                        </Pressable>
                      ))}
                    </View>
                  </View>

                  <View>
                    <Text className="mb-1.5 text-[11px] font-semibold text-slate-500 dark:text-slate-400">
                      整表时间快速平移
                    </Text>
                    <View className="flex-row flex-wrap gap-1.5">
                      {[-30, -10, -5, 5, 10, 30].map((delta) => (
                        <Pressable
                          key={delta}
                          onPress={() => shiftAll(delta)}
                          className="rounded-lg bg-sky-500/12 px-2.5 py-1.5"
                        >
                          <Text className="text-[10.5px] font-semibold text-sky-700 dark:text-sky-300">
                            {delta > 0 ? `+${delta}分` : `${delta}分`}
                          </Text>
                        </Pressable>
                      ))}
                    </View>
                  </View>
                </View>
              ) : null}

              {(editing ? draft : periods).map((p, i) => (
                <View
                  key={`${p.index}-${i}`}
                  className="mb-2 flex-row items-center gap-1.5"
                >
                  <Text className="w-5 text-center text-xs font-semibold text-slate-400">
                    {p.index}
                  </Text>
                  {editing ? (
                    <>
                      <TextInput
                        accessibilityLabel={`第${p.index}节名称`}
                        value={p.label}
                        onChangeText={(v) => update(i, "label", v)}
                        className="flex-1 rounded-xl border border-slate-300/30 bg-white/40 px-2 py-2 text-xs text-slate-800 dark:border-white/10 dark:bg-white/[0.06] dark:text-white"
                      />
                      <TextInput
                        accessibilityLabel={`第${p.index}节开始时间`}
                        value={p.startTime}
                        onChangeText={(v) => update(i, "startTime", v)}
                        placeholder="08:00"
                        placeholderTextColor="#94A3B8"
                        keyboardType={clockKeyboard}
                        maxLength={5}
                        className="w-[66px] rounded-xl border border-slate-300/30 bg-white/40 px-1.5 py-2 text-center text-xs text-slate-800 dark:border-white/10 dark:bg-white/[0.06] dark:text-white"
                      />
                      <TextInput
                        accessibilityLabel={`第${p.index}节结束时间`}
                        value={p.endTime}
                        onChangeText={(v) => update(i, "endTime", v)}
                        placeholder="08:45"
                        placeholderTextColor="#94A3B8"
                        keyboardType={clockKeyboard}
                        maxLength={5}
                        className="w-[66px] rounded-xl border border-slate-300/30 bg-white/40 px-1.5 py-2 text-center text-xs text-slate-800 dark:border-white/10 dark:bg-white/[0.06] dark:text-white"
                      />
                      <Pressable
                        accessibilityLabel={`在第${p.index}节后插入一节`}
                        hitSlop={4}
                        onPress={() => insertAfter(i)}
                        className="h-7 w-7 items-center justify-center rounded-full bg-sky-500/15"
                      >
                        <Ionicons name="add" size={14} color="#38BDF8" />
                      </Pressable>
                      {draft.length > 1 ? (
                        <Pressable
                          accessibilityLabel={`删除第${p.index}节`}
                          hitSlop={4}
                          onPress={() => removeAt(i)}
                          className="h-7 w-7 items-center justify-center rounded-full bg-rose-500/12"
                        >
                          <Ionicons name="trash-outline" size={12} color="#F43F5E" />
                        </Pressable>
                      ) : null}
                    </>
                  ) : (
                    <View className="flex-1 flex-row items-center justify-between rounded-xl bg-white/20 px-3 py-2 dark:bg-white/[0.04]">
                      <Text className="text-xs font-semibold text-slate-700 dark:text-slate-200">
                        {p.label}
                      </Text>
                      <Text className="text-xs text-slate-500 dark:text-slate-400">
                        {p.startTime} – {p.endTime}
                      </Text>
                    </View>
                  )}
                </View>
              ))}

              {editing ? (
                <View className="mb-3 flex-row gap-4">
                  <Pressable onPress={() => insertAfter(draft.length - 1)}>
                    <Text className="py-2 text-xs font-semibold text-sky-600 dark:text-sky-300">
                      + 末尾添加节次（自动顺延）
                    </Text>
                  </Pressable>
                </View>
              ) : null}

              <View className="mt-1 flex-row flex-wrap gap-2.5">
                <Pressable
                  onPress={() => {
                    if (!editing) {
                      setEditing(true);
                      return;
                    }
                    try {
                      if (useStore.getState().activeScheduleId !== scheduleId) {
                        throw new Error("课表已切换，请重新编辑");
                      }
                      const normalized = draft.map((p, idx) => ({
                        ...p,
                        index: idx + 1,
                        label: p.label.trim() || `第${idx + 1}节`,
                        startTime: normalizeClockInput(p.startTime),
                        endTime: normalizeClockInput(p.endTime),
                      }));
                      useStore.getState().setPeriods(normalized);
                      setEditing(false);
                      Alert.alert("作息已保存");
                    } catch (error) {
                      Alert.alert(
                        "无法保存作息",
                        error instanceof Error ? error.message : "作息时间无效",
                      );
                    }
                  }}
                  className="rounded-xl bg-sky-500/20 px-3.5 py-2.5"
                >
                  <Text className="text-xs font-bold text-sky-700 dark:text-sky-300">
                    {editing ? "保存作息" : "编辑作息"}
                  </Text>
                </Pressable>
                {editing ? (
                  <Pressable
                    onPress={() => {
                      setDraft(periods.map((p) => ({ ...p })));
                      setEditing(false);
                    }}
                    className="px-3 py-2.5"
                  >
                    <Text className="text-xs text-slate-500 dark:text-slate-400">
                      取消
                    </Text>
                  </Pressable>
                ) : (
                  <>
                    <Pressable
                      onPress={() =>
                        router.push({
                          pathname: "/import",
                          params: { focus: "periods" },
                        })
                      }
                      className="rounded-xl bg-violet-500/18 px-3.5 py-2.5"
                    >
                      <Text className="text-xs font-bold text-violet-700 dark:text-violet-300">
                        导入作息表
                      </Text>
                    </Pressable>
                    {schedulesCount > 1 ? (
                      <Pressable
                        onPress={syncAllSchedules}
                        className="rounded-xl bg-slate-400/15 px-3.5 py-2.5"
                      >
                        <Text className="text-xs font-semibold text-slate-700 dark:text-slate-200">
                          同步到全部课表
                        </Text>
                      </Pressable>
                    ) : null}
                  </>
                )}
              </View>
            </View>
          ) : null}
        </View>
      </GlassContainer>
    </View>
  );
}
