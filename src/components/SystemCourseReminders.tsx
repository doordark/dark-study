import { useMemo, useRef, useState } from "react";
import { Alert, Pressable, ScrollView, Text, View } from "react-native";

import { useForegroundClock } from "@/hooks/useForegroundClock";
import {
  canImportAlarm,
  clearCourseCalendar,
  importCourseAlarms,
  importCourseCalendar,
} from "@/services/systemCourseReminders";
import { useSettings } from "@/store/useSettings";
import { useActiveSchedule } from "@/store/useStore";
import { upcomingWidgetCourses } from "@/utils/courseWidget";
import { addDays, toIsoDate } from "@/utils/time";

type FilterKind = "all" | "today" | "week" | "alarm";

export function SystemCourseReminders() {
  const schedule = useActiveSchedule();
  const minutes = useSettings((s) => s.reminderMinutes);
  return (
    <CourseSelection
      key={schedule?.id ?? "empty"}
      schedule={schedule}
      minutes={minutes}
    />
  );
}

function CourseSelection({
  schedule,
  minutes,
}: {
  schedule: ReturnType<typeof useActiveSchedule>;
  minutes: number;
}) {
  const [expanded, setExpanded] = useState(false);
  const [filter, setFilter] = useState<FilterKind>("week");
  const [busy, setBusy] = useState(false);
  const lock = useRef(false);
  const [selected, setSelected] = useState<string[]>([]);
  const now = useForegroundClock(30000);

  const allCourses = useMemo(
    () =>
      expanded
        ? upcomingWidgetCourses(schedule, now).filter(
            (c) => c.start > now.getTime(),
          )
        : [],
    [expanded, schedule, now],
  );

  const todayIso = toIsoDate(now);
  const weekCutoff = addDays(now, 7).getTime();

  const courses = useMemo(() => {
    if (filter === "all") return allCourses;
    if (filter === "today") {
      return allCourses.filter((c) => toIsoDate(new Date(c.start)) === todayIso);
    }
    if (filter === "week") {
      return allCourses.filter((c) => c.start <= weekCutoff);
    }
    return allCourses.filter((c) => canImportAlarm(c, minutes, now.getTime()));
  }, [allCourses, filter, minutes, now, todayIso, weekCutoff]);

  const distinctNames = useMemo(
    () => [...new Set(allCourses.map((c) => c.name))],
    [allCourses],
  );

  const selectedIds = useMemo(() => new Set(selected), [selected]);
  const picked = allCourses.filter((c) => selectedIds.has(c.id));
  const alarmCount = picked.filter((c) =>
    canImportAlarm(c, minutes, now.getTime()),
  ).length;

  const toggleCourseName = (name: string) => {
    const ids = allCourses.filter((c) => c.name === name).map((c) => c.id);
    const allIn = ids.every((id) => selectedIds.has(id));
    setSelected((prev) =>
      allIn
        ? prev.filter((id) => !ids.includes(id))
        : [...new Set([...prev, ...ids])],
    );
  };

  const run = async (kind: "alarm" | "calendar" | "both") => {
    if (lock.current || !picked.length || !schedule) return;
    lock.current = true;
    setBusy(true);
    try {
      const messages: string[] = [];
      const kinds: ("alarm" | "calendar")[] =
        kind === "both" ? ["calendar", "alarm"] : [kind];
      for (const target of kinds) {
        try {
          const result = await (target === "alarm"
            ? importCourseAlarms(picked, minutes)
            : importCourseCalendar(picked, minutes, schedule.id));
          messages.push(
            `${target === "alarm" ? "闹钟已提交" : "日程已写入或更新"} ${result.completed} 项，跳过 ${result.skipped} 项，失败 ${result.failures.length} 项。${result.failures.length ? `\n${result.failures.slice(0, 3).join("\n")}` : ""}`,
          );
        } catch (error) {
          messages.push(
            `${target === "alarm" ? "闹钟" : "日程"}导入失败：${error instanceof Error ? error.message : "无法访问系统提醒"}`,
          );
        }
      }
      messages.push(
        "日程保存在系统日历「Dark Study 课程」中，同天调课重新导入会自动原地更新；请在系统时钟核对闹钟开关。",
      );
      Alert.alert("课程导入结果", messages.join("\n\n"));
    } finally {
      lock.current = false;
      setBusy(false);
    }
  };

  const confirmClearCalendar = () => {
    if (lock.current || !schedule) return;
    Alert.alert(
      "清空系统日历中的当前课表？",
      `将删除系统日历「Dark Study 课程」中由「${schedule.name}」导入的全部历史日程，不影响其他日历或系统闹钟。`,
      [
        { text: "取消", style: "cancel" },
        {
          text: "确认清空",
          style: "destructive",
          onPress: () => {
            lock.current = true;
            setBusy(true);
            void clearCourseCalendar(schedule.id)
              .then((removed) => {
                Alert.alert(
                  "清理完成",
                  removed > 0
                    ? `已移除 ${removed} 条旧课程日程。`
                    : "系统日历中没有找到当前课表的导入记录。",
                );
              })
              .catch((error) => {
                Alert.alert(
                  "清理失败",
                  error instanceof Error ? error.message : "无法访问系统日历",
                );
              })
              .finally(() => {
                lock.current = false;
                setBusy(false);
              });
          },
        },
      ],
    );
  };

  return (
    <View className="mt-4 border-t border-slate-300/25 pt-3 dark:border-white/10">
      <Pressable disabled={busy} onPress={() => setExpanded((v) => !v)}>
        <Text className="py-1 text-xs font-bold text-sky-600 dark:text-sky-300">
          {expanded ? "收起手机闹钟 / 系统日历导入" : "添加到手机闹钟 / 系统日历 ▾"}
        </Text>
      </Pressable>

      {expanded ? (
        <View className="mt-2">
          <Text className="mb-2.5 text-xs leading-4 text-slate-500 dark:text-slate-400">
            按上方提前 {minutes} 分钟设置导入。闹钟支持未来 24 小时内的课程；系统日程可导入整学期并在同天调课后原地更新。
          </Text>

          {/* 范围筛选胶囊 */}
          <View className="mb-2 flex-row flex-wrap gap-1.5">
            {(
              [
                ["today", "今天"],
                ["week", "未来7天"],
                ["alarm", "可设闹钟"],
                ["all", `全部 (${allCourses.length})`],
              ] as const
            ).map(([key, label]) => {
              const on = filter === key;
              return (
                <Pressable
                  key={key}
                  disabled={busy}
                  onPress={() => setFilter(key)}
                  className={`rounded-lg border px-2.5 py-1.5 ${
                    on
                      ? "border-sky-500/70 bg-sky-500/20"
                      : "border-transparent bg-slate-400/10"
                  }`}
                >
                  <Text
                    className={`text-[11px] font-semibold ${
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

          {/* 按课程名快捷勾选整门课 */}
          {distinctNames.length > 0 ? (
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              className="mb-2"
              contentContainerStyle={{ gap: 6 }}
            >
              {distinctNames.map((name) => {
                const ids = allCourses
                  .filter((c) => c.name === name)
                  .map((c) => c.id);
                const allIn = ids.length > 0 && ids.every((id) => selectedIds.has(id));
                return (
                  <Pressable
                    key={name}
                    disabled={busy}
                    onPress={() => toggleCourseName(name)}
                    className={`rounded-full border px-2.5 py-1 ${
                      allIn
                        ? "border-sky-500/70 bg-sky-500/20"
                        : "border-slate-300/30 bg-white/25 dark:border-white/10 dark:bg-white/[0.05]"
                    }`}
                  >
                    <Text
                      className={`text-[10.5px] font-semibold ${
                        allIn
                          ? "text-sky-700 dark:text-sky-300"
                          : "text-slate-600 dark:text-slate-300"
                      }`}
                    >
                      {allIn ? "✓ " : "+ "}
                      {name}
                    </Text>
                  </Pressable>
                );
              })}
            </ScrollView>
          ) : null}

          <View className="mb-2 flex-row flex-wrap items-center gap-4">
            <Pressable
              disabled={busy}
              onPress={() => {
                const visibleIds = courses.map((c) => c.id);
                const allVisibleSelected =
                  visibleIds.length > 0 &&
                  visibleIds.every((id) => selectedIds.has(id));
                setSelected((prev) =>
                  allVisibleSelected
                    ? prev.filter((id) => !visibleIds.includes(id))
                    : [...new Set([...prev, ...visibleIds])],
                );
              }}
            >
              <Text className="py-1 text-xs font-semibold text-sky-600 dark:text-sky-300">
                {courses.length > 0 &&
                courses.every((c) => selectedIds.has(c.id))
                  ? "取消勾选当前列表"
                  : "全选当前列表"}
              </Text>
            </Pressable>
            {selected.length > 0 ? (
              <Pressable disabled={busy} onPress={() => setSelected([])}>
                <Text className="py-1 text-xs text-slate-500 dark:text-slate-400">
                  清空已选
                </Text>
              </Pressable>
            ) : null}
          </View>

          <Text className="mb-2 text-xs text-slate-500 dark:text-slate-400">
            总已选 {picked.length} / {allCourses.length} 次上课 · 可设闹钟{" "}
            {alarmCount} 次
          </Text>

          {!courses.length ? (
            <Text className="py-2 text-xs text-slate-500">
              当前筛选条件下没有待上课程
            </Text>
          ) : null}

          <ScrollView style={{ maxHeight: 280 }} nestedScrollEnabled>
            {courses.map((c) => (
              <Pressable
                key={c.id}
                disabled={busy}
                accessibilityRole="checkbox"
                accessibilityState={{
                  checked: selectedIds.has(c.id),
                  disabled: busy,
                }}
                onPress={() =>
                  setSelected((prev) =>
                    prev.includes(c.id)
                      ? prev.filter((id) => id !== c.id)
                      : [...prev, c.id],
                  )
                }
                className={`mb-2 rounded-xl p-3 ${
                  selectedIds.has(c.id) ? "bg-sky-400/20" : "bg-slate-400/10"
                }`}
              >
                <Text className="text-xs font-semibold text-slate-700 dark:text-slate-200">
                  {selectedIds.has(c.id) ? "☑" : "□"} {c.name}
                </Text>
                <Text className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">
                  {new Date(c.start).toLocaleDateString()} · {c.time}
                  {c.classroom ? ` · ${c.classroom}` : ""}
                </Text>
                <Text className="mt-0.5 text-[10.5px] text-slate-500 dark:text-slate-400">
                  {canImportAlarm(c, minutes, now.getTime())
                    ? "可导入闹钟与日程"
                    : "仅可导入日程"}
                </Text>
              </Pressable>
            ))}
          </ScrollView>

          <View className="mt-2.5 flex-row flex-wrap gap-2">
            <Pressable
              disabled={busy || !picked.length}
              onPress={() => void run("both")}
              className={`rounded-xl bg-sky-600 px-3.5 py-2.5 ${
                busy || !picked.length ? "opacity-40" : ""
              }`}
            >
              <Text className="text-xs font-semibold text-white">
                {busy ? "正在处理…" : "导入闹钟 + 日程"}
              </Text>
            </Pressable>
            <Pressable
              disabled={busy || !alarmCount}
              onPress={() => void run("alarm")}
              className={`rounded-xl bg-sky-500 px-3.5 py-2.5 ${
                busy || !alarmCount ? "opacity-40" : ""
              }`}
            >
              <Text className="text-xs font-semibold text-white">
                {busy ? "正在处理…" : `仅闹钟（${alarmCount}）`}
              </Text>
            </Pressable>
            <Pressable
              disabled={busy || !picked.length}
              onPress={() => void run("calendar")}
              className={`rounded-xl bg-sky-500 px-3.5 py-2.5 ${
                busy || !picked.length ? "opacity-40" : ""
              }`}
            >
              <Text className="text-xs font-semibold text-white">
                {busy ? "正在处理…" : `仅日程（${picked.length}）`}
              </Text>
            </Pressable>
            <Pressable
              disabled={busy}
              onPress={confirmClearCalendar}
              className={`rounded-xl border border-rose-500/35 bg-rose-500/10 px-3.5 py-2.5 ${
                busy ? "opacity-40" : ""
              }`}
            >
              <Text className="text-xs font-semibold text-rose-600 dark:text-rose-300">
                清空日历快照
              </Text>
            </Pressable>
          </View>
        </View>
      ) : null}
    </View>
  );
}
