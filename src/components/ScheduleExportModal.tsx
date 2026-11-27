import Ionicons from "@expo/vector-icons/Ionicons";
import { LinearGradient } from "expo-linear-gradient";
import React, { useId, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Svg, { Circle, Defs, RadialGradient, Stop } from "react-native-svg";

import {
  BACKGROUND_PRESETS,
  type BackgroundTint,
} from "@/constants/backgrounds";
import { coursePalette, WEEKDAY_LABELS } from "@/constants/palette";
import type { Course, Schedule } from "@/types";
import { selectHaptic, successHaptic, tapHaptic, warnHaptic } from "@/utils/haptics";
import {
  computeScheduleStats,
  formatScheduleTextSummary,
  shareScheduleIcsFile,
} from "@/utils/scheduleExport";
import { addDays, mondayOf, parseIsoDate } from "@/utils/time";

export interface ScheduleExportModalProps {
  visible: boolean;
  onClose: () => void;
  schedule: Schedule;
  currentWeek: number;
  isDark: boolean;
}

type ExportTab = "export" | "wallpaper";
type TextScope = "week" | "all";

const TINT_ORDER: BackgroundTint[] = [
  "sky",
  "violet",
  "rose",
  "mint",
  "amber",
  "noir",
];

function formatWeekDateRange(schedule: Schedule, week: number): string {
  const startMonday = mondayOf(parseIsoDate(schedule.startDate));
  if (!Number.isFinite(startMonday.getTime())) return "";
  const weekMon = addDays(startMonday, (week - 1) * 7);
  const weekSun = addDays(weekMon, 6);
  const fmt = (d: Date) =>
    `${d.getMonth() + 1}.${String(d.getDate()).padStart(2, "0")}`;
  return `${fmt(weekMon)} – ${fmt(weekSun)}`;
}

function WallpaperPosterCard({
  schedule,
  week,
  tint,
  posterDark,
  showWeekend,
}: {
  schedule: Schedule;
  week: number;
  tint: BackgroundTint;
  posterDark: boolean;
  showWeekend: boolean;
}) {
  const uidPrefix = useId().replace(/[^\w-]/g, "");
  const preset = BACKGROUND_PRESETS[tint];
  const gradientColors = posterDark ? preset.glassDark : preset.glassLight;
  const glowRgb = posterDark ? preset.glassDarkGlowRgb : preset.glassLightGlowRgb;
  const dayCount = showWeekend ? 7 : 5;
  const days = useMemo(
    () => Array.from({ length: dayCount }, (_, i) => i + 1),
    [dayCount],
  );
  const periods = schedule.periods;
  const rowCount = Math.max(1, periods.length);
  const rowHeight = rowCount <= 8 ? 42 : rowCount <= 10 ? 36 : 31;
  const gridHeight = rowCount * rowHeight;

  const weekCourses = useMemo(
    () =>
      schedule.courses.filter(
        (c) => c.weeks.includes(week) && c.weekday >= 1 && c.weekday <= dayCount,
      ),
    [schedule.courses, week, dayCount],
  );

  const dayDateLabels = useMemo(() => {
    const startMonday = mondayOf(parseIsoDate(schedule.startDate));
    const weekStart = addDays(startMonday, (week - 1) * 7);
    return days.map((d) => {
      const date = addDays(weekStart, d - 1);
      return `${date.getMonth() + 1}/${date.getDate()}`;
    });
  }, [schedule.startDate, week, days]);

  const dateRange = useMemo(
    () => formatWeekDateRange(schedule, week),
    [schedule, week],
  );

  const inkPrimary = posterDark ? "#F8FAFC" : "#0F172A";
  const inkMuted = posterDark ? "rgba(226,232,240,0.68)" : "rgba(51,65,85,0.72)";
  const gridLine = posterDark
    ? "rgba(255,255,255,0.08)"
    : "rgba(15,23,42,0.08)";
  const surfaceBg = posterDark
    ? "rgba(15,23,42,0.44)"
    : "rgba(255,255,255,0.56)";
  const surfaceBorder = posterDark
    ? "rgba(255,255,255,0.14)"
    : "rgba(255,255,255,0.78)";

  return (
    <View
      style={{
        borderRadius: 28,
        overflow: "hidden",
        borderWidth: 1,
        borderColor: surfaceBorder,
      }}
    >
      <LinearGradient
        colors={[gradientColors[0], gradientColors[1], gradientColors[2]]}
        start={{ x: 0, y: 0 }}
        end={{ x: 0.9, y: 1 }}
        style={StyleSheet.absoluteFill}
      />

      {/* Aurora 柔光光斑层（SVG 径向渐变） */}
      <View pointerEvents="none" style={StyleSheet.absoluteFill}>
        <Svg width="100%" height="100%" viewBox="0 0 360 540" preserveAspectRatio="none">
          <Defs>
            <RadialGradient id={`posterGlow1-${uidPrefix}`} cx="18%" cy="14%" r="55%">
              <Stop offset="0%" stopColor={`rgb(${glowRgb[0]})`} stopOpacity={posterDark ? 0.36 : 0.42} />
              <Stop offset="100%" stopColor={`rgb(${glowRgb[0]})`} stopOpacity={0} />
            </RadialGradient>
            <RadialGradient id={`posterGlow2-${uidPrefix}`} cx="85%" cy="32%" r="52%">
              <Stop offset="0%" stopColor={`rgb(${glowRgb[1]})`} stopOpacity={posterDark ? 0.32 : 0.36} />
              <Stop offset="100%" stopColor={`rgb(${glowRgb[1]})`} stopOpacity={0} />
            </RadialGradient>
            <RadialGradient id={`posterGlow3-${uidPrefix}`} cx="50%" cy="90%" r="58%">
              <Stop offset="0%" stopColor={`rgb(${glowRgb[2]})`} stopOpacity={posterDark ? 0.26 : 0.3} />
              <Stop offset="100%" stopColor={`rgb(${glowRgb[2]})`} stopOpacity={0} />
            </RadialGradient>
          </Defs>
          <Circle cx="65" cy="75" r="200" fill={`url(#posterGlow1-${uidPrefix})`} />
          <Circle cx="305" cy="175" r="190" fill={`url(#posterGlow2-${uidPrefix})`} />
          <Circle cx="180" cy="485" r="210" fill={`url(#posterGlow3-${uidPrefix})`} />
        </Svg>
      </View>

      <View style={{ padding: 16 }}>
        {/* 海报页眉 */}
        <View className="flex-row items-end justify-between pb-3">
          <View className="flex-1 pr-2">
            <Text
              numberOfLines={1}
              style={{ color: inkMuted, fontSize: 10, fontWeight: "700", letterSpacing: 1.4 }}
            >
              DARK STUDY · TIMETABLE
            </Text>
            <Text
              numberOfLines={1}
              style={{ color: inkPrimary, fontSize: 19, fontWeight: "800", marginTop: 2 }}
            >
              {schedule.name}
            </Text>
          </View>
          <View
            style={{
              backgroundColor: surfaceBg,
              borderColor: surfaceBorder,
              borderWidth: 1,
              borderRadius: 14,
              paddingHorizontal: 10,
              paddingVertical: 5,
              alignItems: "flex-end",
            }}
          >
            <Text style={{ color: inkPrimary, fontSize: 12, fontWeight: "800" }}>
              第 {week} 周
            </Text>
            {dateRange ? (
              <Text style={{ color: inkMuted, fontSize: 9.5, fontWeight: "600" }}>
                {dateRange}
              </Text>
            ) : null}
          </View>
        </View>

        {/* 玻璃课表网格容器 */}
        <View
          style={{
            borderRadius: 20,
            backgroundColor: surfaceBg,
            borderWidth: 1,
            borderColor: surfaceBorder,
            overflow: "hidden",
          }}
        >
          {/* 表头 */}
          <View
            style={{
              flexDirection: "row",
              borderBottomWidth: 1,
              borderBottomColor: gridLine,
              paddingVertical: 6,
            }}
          >
            <View style={{ width: 26, alignItems: "center", justifyContent: "center" }}>
              <Text style={{ color: inkMuted, fontSize: 8.5, fontWeight: "700" }}>
                节
              </Text>
            </View>
            {days.map((day, idx) => (
              <View key={day} style={{ flex: 1, alignItems: "center" }}>
                <Text style={{ color: inkPrimary, fontSize: 10, fontWeight: "700" }}>
                  {WEEKDAY_LABELS[day - 1].replace("周", "")}
                </Text>
                <Text style={{ color: inkMuted, fontSize: 8, marginTop: 1 }}>
                  {dayDateLabels[idx]}
                </Text>
              </View>
            ))}
          </View>

          {/* 网格主体 */}
          <View style={{ height: gridHeight, flexDirection: "row" }}>
            {/* 左侧节次轴 */}
            <View style={{ width: 26, borderRightWidth: 1, borderRightColor: gridLine }}>
              {periods.map((p, idx) => (
                <View
                  key={p.index}
                  style={{
                    height: rowHeight,
                    alignItems: "center",
                    justifyContent: "center",
                    borderBottomWidth: idx < periods.length - 1 ? 1 : 0,
                    borderBottomColor: gridLine,
                  }}
                >
                  <Text style={{ color: inkPrimary, fontSize: 9, fontWeight: "700" }}>
                    {p.index}
                  </Text>
                  <Text style={{ color: inkMuted, fontSize: 6.5 }}>
                    {p.startTime}
                  </Text>
                </View>
              ))}
            </View>

            {/* 每日列 + 课程色块 */}
            <View style={{ flex: 1, flexDirection: "row" }}>
              {days.map((day, colIdx) => {
                const dayCourses: Course[] = weekCourses.filter(
                  (c) => c.weekday === day,
                );
                return (
                  <View
                    key={day}
                    style={{
                      flex: 1,
                      position: "relative",
                      borderRightWidth: colIdx < dayCount - 1 ? 1 : 0,
                      borderRightColor: gridLine,
                    }}
                  >
                    {periods.map((p, rIdx) => (
                      <View
                        key={p.index}
                        style={{
                          height: rowHeight,
                          borderBottomWidth: rIdx < periods.length - 1 ? 1 : 0,
                          borderBottomColor: gridLine,
                        }}
                      />
                    ))}

                    {dayCourses.map((course) => {
                      const palette =
                        coursePalette[course.color] ?? coursePalette.sky;
                      const startIdx = Math.max(
                        0,
                        periods.findIndex((p) => p.index === course.startPeriod),
                      );
                      const endIdxFound = periods.findIndex(
                        (p) => p.index === course.endPeriod,
                      );
                      const endIdx =
                        endIdxFound >= startIdx
                          ? endIdxFound
                          : Math.min(
                              periods.length - 1,
                              startIdx + Math.max(0, course.endPeriod - course.startPeriod),
                            );
                      const span = Math.max(1, endIdx - startIdx + 1);
                      const top = startIdx * rowHeight + 1.5;
                      const height = Math.max(18, span * rowHeight - 3);

                      return (
                        <View
                          key={course.id}
                          style={{
                            position: "absolute",
                            top,
                            left: 1.5,
                            right: 1.5,
                            height,
                            borderRadius: 8,
                            backgroundColor: posterDark
                              ? `${palette.solid}38`
                              : `${palette.solid}2E`,
                            borderLeftWidth: 2.5,
                            borderLeftColor: palette.solid,
                            paddingHorizontal: 3,
                            paddingVertical: 2,
                            overflow: "hidden",
                          }}
                        >
                          <Text
                            numberOfLines={span >= 3 ? 3 : 2}
                            style={{
                              color: inkPrimary,
                              fontSize: showWeekend ? 8.2 : 9.2,
                              fontWeight: "700",
                              lineHeight: showWeekend ? 10.5 : 12,
                            }}
                          >
                            {course.name}
                          </Text>
                          {course.classroom && height >= 36 ? (
                            <Text
                              numberOfLines={1}
                              style={{
                                color: inkMuted,
                                fontSize: showWeekend ? 7 : 7.8,
                                marginTop: 1,
                              }}
                            >
                              {course.classroom}
                            </Text>
                          ) : null}
                        </View>
                      );
                    })}
                  </View>
                );
              })}
            </View>
          </View>
        </View>

        {/* 海报页脚 */}
        <View className="mt-2.5 flex-row items-center justify-between px-1">
          <Text style={{ color: inkMuted, fontSize: 9.5, fontWeight: "600" }}>
            本周共 {weekCourses.length} 节次排课
          </Text>
          <Text style={{ color: inkMuted, fontSize: 9.5, fontWeight: "600" }}>
            {schedule.startDate} ~ {schedule.endDate}
          </Text>
        </View>
      </View>
    </View>
  );
}

export function ScheduleExportModal({
  visible,
  onClose,
  schedule,
  currentWeek,
  isDark,
}: ScheduleExportModalProps) {
  if (!visible) return null;
  return (
    <ScheduleExportModalInner
      onClose={onClose}
      schedule={schedule}
      currentWeek={currentWeek}
      isDark={isDark}
    />
  );
}

function ScheduleExportModalInner({
  onClose,
  schedule,
  currentWeek,
  isDark,
}: Omit<ScheduleExportModalProps, "visible">) {
  const insets = useSafeAreaInsets();
  const totalWeeks = Math.max(1, schedule.totalWeeks || 18);
  const [tab, setTab] = useState<ExportTab>("export");
  const [textScope, setTextScope] = useState<TextScope>("week");
  const [busy, setBusy] = useState(false);
  const [statusMsg, setStatusMsg] = useState("");
  const [posterWeek, setPosterWeek] = useState(currentWeek);
  const [posterTint, setPosterTint] = useState<BackgroundTint>("sky");
  const [posterDark, setPosterDark] = useState(isDark);
  const [showWeekend, setShowWeekend] = useState(true);
  const [cleanPreview, setCleanPreview] = useState(false);

  const clampedPosterWeek = Math.min(totalWeeks, Math.max(1, posterWeek));
  const stats = useMemo(() => computeScheduleStats(schedule), [schedule]);
  const textSummary = useMemo(
    () =>
      formatScheduleTextSummary(
        schedule,
        textScope === "week" ? currentWeek : undefined,
      ),
    [schedule, textScope, currentWeek],
  );

  const handleExportIcs = async () => {
    if (busy) return;
    setBusy(true);
    setStatusMsg("");
    try {
      const res = await shareScheduleIcsFile(schedule);
      successHaptic();
      setStatusMsg(
        `已生成标准 .ics 日历文件（共 ${res.eventCount} 条上课日程）并唤起系统分享。`,
      );
    } catch (error) {
      warnHaptic();
      setStatusMsg(
        error instanceof Error ? error.message : "导出 .ics 文件失败，请稍后重试。",
      );
    } finally {
      setBusy(false);
    }
  };

  const handleShareText = async () => {
    if (busy) return;
    setBusy(true);
    setStatusMsg("");
    try {
      await Share.share({
        title: `${schedule.name} 课表`,
        message: textSummary,
      });
      successHaptic();
      setStatusMsg("已打开系统分享面板，可转发给好友或存为备忘录。");
    } catch (error) {
      warnHaptic();
      setStatusMsg(
        error instanceof Error ? error.message : "分享纯文本课表失败。",
      );
    } finally {
      setBusy(false);
    }
  };

  const handleWebCopy = async () => {
    if (
      Platform.OS === "web" &&
      typeof navigator !== "undefined" &&
      navigator.clipboard?.writeText
    ) {
      try {
        await navigator.clipboard.writeText(textSummary);
        successHaptic();
        setStatusMsg("纯文本课表已复制到剪贴板。");
      } catch {
        setStatusMsg("复制失败，请手动选中下方文本复制。");
      }
    }
  };

  return (
    <Modal
      visible
      transparent
      animationType="fade"
      onRequestClose={() => {
        if (cleanPreview) setCleanPreview(false);
        else onClose();
      }}
    >
      {cleanPreview ? (
        <Pressable
          onPress={() => {
            tapHaptic();
            setCleanPreview(false);
          }}
          style={{
            flex: 1,
            backgroundColor: posterDark ? "#050814" : "#EDF3FC",
            paddingTop: Math.max(16, insets.top + 8),
            paddingBottom: Math.max(16, insets.bottom + 8),
            paddingHorizontal: 14,
            justifyContent: "center",
          }}
        >
          <ScrollView
            showsVerticalScrollIndicator={false}
            contentContainerStyle={{ flexGrow: 1, justifyContent: "center" }}
          >
            <WallpaperPosterCard
              schedule={schedule}
              week={clampedPosterWeek}
              tint={posterTint}
              posterDark={posterDark}
              showWeekend={showWeekend}
            />
          </ScrollView>
          <Text
            style={{
              textAlign: "center",
              marginTop: 10,
              fontSize: 10.5,
              color: posterDark
                ? "rgba(226,232,240,0.45)"
                : "rgba(51,65,85,0.45)",
            }}
          >
            系统截屏即可保存锁屏壁纸 · 轻点任意处返回
          </Text>
        </Pressable>
      ) : (
        <View className="flex-1 justify-end bg-black/55 sm:justify-center sm:px-5">
          <View className="max-h-[92%] rounded-t-3xl border border-slate-200/80 bg-white pb-5 pt-4 dark:border-white/10 dark:bg-slate-900 sm:rounded-3xl">
            {/* 顶栏 */}
            <View className="flex-row items-center justify-between px-5 pb-3">
              <View className="flex-1 pr-3">
                <Text className="text-[17px] font-bold text-slate-900 dark:text-white">
                  课表导出与壁纸卡
                </Text>
                <Text className="mt-0.5 text-[11.5px] text-slate-500 dark:text-slate-400">
                  支持 .ics 标准日历、纯文本分享及高清壁纸预览
                </Text>
              </View>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="关闭"
                onPress={onClose}
                className="h-8 w-8 items-center justify-center rounded-full bg-slate-100 dark:bg-slate-800"
              >
                <Ionicons name="close" size={17} color="#94A3B8" />
              </Pressable>
            </View>

            {/* 分段 Tab */}
            <View className="mx-5 mb-3 flex-row rounded-2xl bg-slate-100 p-1 dark:bg-slate-800/80">
              {(
                [
                  ["export", "日历与文本导出", "share-outline"],
                  ["wallpaper", "高清壁纸预览卡", "image-outline"],
                ] as const
              ).map(([key, label, icon]) => {
                const active = tab === key;
                return (
                  <Pressable
                    key={key}
                    onPress={() => {
                      selectHaptic();
                      setTab(key);
                    }}
                    className={`flex-1 flex-row items-center justify-center gap-1.5 rounded-xl py-2 ${
                      active ? "bg-white dark:bg-slate-700" : ""
                    }`}
                  >
                    <Ionicons
                      name={icon}
                      size={14}
                      color={active ? "#0284C7" : "#94A3B8"}
                    />
                    <Text
                      className={`text-[12.5px] font-bold ${
                        active
                          ? "text-sky-700 dark:text-sky-300"
                          : "text-slate-500 dark:text-slate-400"
                      }`}
                    >
                      {label}
                    </Text>
                  </Pressable>
                );
              })}
            </View>

            {tab === "export" ? (
              <ScrollView
                className="px-5"
                showsVerticalScrollIndicator={false}
                contentContainerStyle={{ gap: 12, paddingBottom: 12 }}
              >
                {/* 1. ICS 导出卡片 */}
                <View className="rounded-2xl border border-sky-500/25 bg-sky-500/[0.06] p-4 dark:bg-sky-400/[0.08]">
                  <View className="flex-row items-center gap-2">
                    <View className="h-9 w-9 items-center justify-center rounded-xl bg-sky-500/20">
                      <Ionicons name="calendar-outline" size={18} color="#0284C7" />
                    </View>
                    <View className="flex-1">
                      <Text className="text-[14px] font-bold text-slate-900 dark:text-white">
                        导出标准 .ics 日历文件
                      </Text>
                      <Text className="mt-0.5 text-[11px] text-slate-500 dark:text-slate-400">
                        兼容 iOS / Mac 日历、飞书、Outlook 与 Google Calendar
                      </Text>
                    </View>
                  </View>

                  <Text className="mt-2.5 text-[11.5px] leading-5 text-slate-600 dark:text-slate-300">
                    将本学期 {stats.uniqueCourseCount} 门课（共 {stats.totalSessions} 条有效日程）打包为 RFC 5545 标准日历文件（Asia/Shanghai 时区）。
                  </Text>

                  <Pressable
                    accessibilityRole="button"
                    disabled={busy}
                    onPress={() => void handleExportIcs()}
                    className={`mt-3 flex-row items-center justify-center gap-2 rounded-xl bg-sky-600 py-3 ${
                      busy ? "opacity-50" : ""
                    }`}
                  >
                    {busy ? (
                      <ActivityIndicator size="small" color="#FFFFFF" />
                    ) : (
                      <Ionicons name="download-outline" size={16} color="#FFFFFF" />
                    )}
                    <Text className="text-[13px] font-bold text-white">
                      {busy ? "正在生成 .ics…" : "一键导出并分享 .ics"}
                    </Text>
                  </Pressable>
                </View>

                {/* 2. 纯文本课表分享 */}
                <View className="rounded-2xl border border-slate-200/80 bg-slate-50/90 p-4 dark:border-white/10 dark:bg-slate-800/70">
                  <View className="flex-row items-center justify-between">
                    <Text className="text-[14px] font-bold text-slate-900 dark:text-white">
                      纯文本课表摘要
                    </Text>
                    <View className="flex-row rounded-lg bg-slate-200/80 p-0.5 dark:bg-slate-900/70">
                      {(
                        [
                          ["week", `第 ${currentWeek} 周`],
                          ["all", "整学期"],
                        ] as const
                      ).map(([scopeKey, label]) => {
                        const active = textScope === scopeKey;
                        return (
                          <Pressable
                            key={scopeKey}
                            onPress={() => {
                              selectHaptic();
                              setTextScope(scopeKey);
                            }}
                            className={`rounded-md px-2.5 py-1 ${
                              active ? "bg-white dark:bg-slate-700" : ""
                            }`}
                          >
                            <Text
                              className={`text-[11px] font-semibold ${
                                active
                                  ? "text-sky-700 dark:text-sky-300"
                                  : "text-slate-500 dark:text-slate-400"
                              }`}
                            >
                              {label}
                            </Text>
                          </Pressable>
                        );
                      })}
                    </View>
                  </View>

                  <View className="mt-2.5 max-h-48 rounded-xl border border-slate-200/80 bg-white p-3 dark:border-white/10 dark:bg-slate-900/80">
                    <ScrollView nestedScrollEnabled showsVerticalScrollIndicator>
                      <Text
                        selectable
                        className="text-[11.5px] leading-5 text-slate-700 dark:text-slate-200"
                      >
                        {textSummary}
                      </Text>
                    </ScrollView>
                  </View>

                  <View className="mt-3 flex-row gap-2">
                    <Pressable
                      accessibilityRole="button"
                      disabled={busy}
                      onPress={() => void handleShareText()}
                      className="flex-1 flex-row items-center justify-center gap-1.5 rounded-xl bg-slate-900 py-2.5 dark:bg-white"
                    >
                      <Ionicons
                        name="share-social-outline"
                        size={15}
                        color={isDark ? "#0F172A" : "#FFFFFF"}
                      />
                      <Text className="text-[12.5px] font-bold text-white dark:text-slate-900">
                        分享纯文本课表
                      </Text>
                    </Pressable>
                    {Platform.OS === "web" ? (
                      <Pressable
                        accessibilityRole="button"
                        onPress={() => void handleWebCopy()}
                        className="rounded-xl bg-slate-200 px-3.5 py-2.5 dark:bg-slate-700"
                      >
                        <Text className="text-[12.5px] font-semibold text-slate-700 dark:text-slate-100">
                          复制
                        </Text>
                      </Pressable>
                    ) : null}
                  </View>
                </View>

                {statusMsg ? (
                  <Text
                    accessibilityLiveRegion="polite"
                    className="px-1 text-[12px] font-medium text-sky-600 dark:text-sky-300"
                  >
                    {statusMsg}
                  </Text>
                ) : null}
              </ScrollView>
            ) : (
              <ScrollView
                className="px-5"
                showsVerticalScrollIndicator={false}
                contentContainerStyle={{ gap: 12, paddingBottom: 12 }}
              >
                {/* 壁纸配置控制栏 */}
                <View className="gap-2.5 rounded-2xl border border-slate-200/80 bg-slate-50/90 p-3 dark:border-white/10 dark:bg-slate-800/70">
                  <View className="flex-row items-center justify-between">
                    <View className="flex-row items-center gap-2">
                      <Pressable
                        disabled={clampedPosterWeek <= 1}
                        onPress={() => {
                          selectHaptic();
                          setPosterWeek((w) => Math.max(1, w - 1));
                        }}
                        className={`h-7 w-7 items-center justify-center rounded-lg bg-white dark:bg-slate-900 ${
                          clampedPosterWeek <= 1 ? "opacity-35" : ""
                        }`}
                      >
                        <Ionicons name="chevron-back" size={14} color="#64748B" />
                      </Pressable>
                      <Text className="text-[12.5px] font-bold text-slate-800 dark:text-white">
                        第 {clampedPosterWeek} 周
                      </Text>
                      <Pressable
                        disabled={clampedPosterWeek >= totalWeeks}
                        onPress={() => {
                          selectHaptic();
                          setPosterWeek((w) => Math.min(totalWeeks, w + 1));
                        }}
                        className={`h-7 w-7 items-center justify-center rounded-lg bg-white dark:bg-slate-900 ${
                          clampedPosterWeek >= totalWeeks ? "opacity-35" : ""
                        }`}
                      >
                        <Ionicons name="chevron-forward" size={14} color="#64748B" />
                      </Pressable>
                    </View>

                    <View className="flex-row gap-1.5">
                      <Pressable
                        onPress={() => {
                          selectHaptic();
                          setPosterDark((v) => !v);
                        }}
                        className="rounded-lg bg-white px-2.5 py-1 dark:bg-slate-900"
                      >
                        <Text className="text-[11px] font-semibold text-slate-700 dark:text-slate-200">
                          {posterDark ? "深色极光" : "浅色通透"}
                        </Text>
                      </Pressable>
                      <Pressable
                        onPress={() => {
                          selectHaptic();
                          setShowWeekend((v) => !v);
                        }}
                        className="rounded-lg bg-white px-2.5 py-1 dark:bg-slate-900"
                      >
                        <Text className="text-[11px] font-semibold text-slate-700 dark:text-slate-200">
                          {showWeekend ? "含周末" : "周一至五"}
                        </Text>
                      </Pressable>
                    </View>
                  </View>

                  {/* 色调选择 */}
                  <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    contentContainerStyle={{ gap: 6 }}
                  >
                    {TINT_ORDER.map((t) => {
                      const active = posterTint === t;
                      const preset = BACKGROUND_PRESETS[t];
                      return (
                        <Pressable
                          key={t}
                          onPress={() => {
                            selectHaptic();
                            setPosterTint(t);
                          }}
                          className={`flex-row items-center gap-1.5 rounded-full border px-2.5 py-1 ${
                            active
                              ? "border-sky-500 bg-sky-500/15"
                              : "border-slate-200 bg-white dark:border-white/10 dark:bg-slate-900"
                          }`}
                        >
                          <View
                            className="h-2.5 w-2.5 rounded-full"
                            style={{ backgroundColor: `rgb(${preset.glowRgb[0]})` }}
                          />
                          <Text
                            className={`text-[11px] font-semibold ${
                              active
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
                </View>

                {/* 壁纸海报预览 */}
                <WallpaperPosterCard
                  schedule={schedule}
                  week={clampedPosterWeek}
                  tint={posterTint}
                  posterDark={posterDark}
                  showWeekend={showWeekend}
                />

                {/* 纯净截屏模式按钮 */}
                <Pressable
                  accessibilityRole="button"
                  onPress={() => {
                    tapHaptic();
                    setCleanPreview(true);
                  }}
                  className="flex-row items-center justify-center gap-2 rounded-xl bg-sky-600 py-3"
                >
                  <Ionicons name="expand-outline" size={16} color="#FFFFFF" />
                  <Text className="text-[13px] font-bold text-white">
                    隐藏界面控件 · 全屏纯净预览（便于截屏存壁纸）
                  </Text>
                </Pressable>
              </ScrollView>
            )}
          </View>
        </View>
      )}
    </Modal>
  );
}
