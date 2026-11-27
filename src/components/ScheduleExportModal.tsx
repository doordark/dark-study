import Ionicons from "@expo/vector-icons/Ionicons";
import React, { useId, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  Share,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Svg, {
  Circle,
  ClipPath,
  Defs,
  G,
  Line,
  LinearGradient as SvgLinearGradient,
  RadialGradient,
  Rect,
  Stop,
  Text as SvgText,
} from "react-native-svg";

import {
  BACKGROUND_PRESETS,
  type BackgroundTint,
} from "@/constants/backgrounds";
import type { Schedule } from "@/types";
import { selectHaptic, successHaptic, tapHaptic, warnHaptic } from "@/utils/haptics";
import {
  computeScheduleStats,
  formatScheduleTextSummary,
  shareScheduleIcsFile,
} from "@/utils/scheduleExport";
import {
  buildScheduleWallpaperSvgMarkup,
  buildWallpaperFileName,
  computeScheduleWallpaperLayout,
  exportWallpaperPng,
  WALLPAPER_DEFAULT_HEIGHT,
  WALLPAPER_DEFAULT_WIDTH,
} from "@/utils/scheduleWallpaperExport";

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

function WallpaperPosterCard({
  schedule,
  week,
  tint,
  posterDark,
  showWeekend,
  svgRef,
}: {
  schedule: Schedule;
  week: number;
  tint: BackgroundTint;
  posterDark: boolean;
  showWeekend: boolean;
  svgRef?: React.RefObject<Svg | null>;
}) {
  const uidPrefix = useId().replace(/[^\w-]/g, "");
  const layout = useMemo(
    () =>
      computeScheduleWallpaperLayout({
        schedule,
        week,
        tint,
        posterDark,
        showWeekend,
        width: WALLPAPER_DEFAULT_WIDTH,
        height: WALLPAPER_DEFAULT_HEIGHT,
      }),
    [schedule, week, tint, posterDark, showWeekend],
  );

  const bgId = `wpBg-${uidPrefix}`;
  const glow1Id = `wpGlow1-${uidPrefix}`;
  const glow2Id = `wpGlow2-${uidPrefix}`;
  const glow3Id = `wpGlow3-${uidPrefix}`;
  const headerBaseY = layout.badge.y + 30;

  return (
    <View
      style={{
        width: "100%",
        aspectRatio: layout.width / layout.height,
        borderRadius: 28,
        overflow: "hidden",
        borderWidth: 1,
        borderColor: layout.surfaceBorder,
      }}
    >
      <Svg
        ref={svgRef}
        width="100%"
        height="100%"
        viewBox={`0 0 ${layout.width} ${layout.height}`}
      >
        <Defs>
          <SvgLinearGradient id={bgId} x1="0%" y1="0%" x2="90%" y2="100%">
            <Stop offset="0%" stopColor={layout.gradientColors[0]} />
            <Stop offset="50%" stopColor={layout.gradientColors[1]} />
            <Stop offset="100%" stopColor={layout.gradientColors[2]} />
          </SvgLinearGradient>
          <RadialGradient id={glow1Id} cx="18%" cy="14%" r="55%">
            <Stop
              offset="0%"
              stopColor={`rgb(${layout.glowRgb[0]})`}
              stopOpacity={layout.glowOpacities[0]}
            />
            <Stop
              offset="100%"
              stopColor={`rgb(${layout.glowRgb[0]})`}
              stopOpacity={0}
            />
          </RadialGradient>
          <RadialGradient id={glow2Id} cx="85%" cy="32%" r="52%">
            <Stop
              offset="0%"
              stopColor={`rgb(${layout.glowRgb[1]})`}
              stopOpacity={layout.glowOpacities[1]}
            />
            <Stop
              offset="100%"
              stopColor={`rgb(${layout.glowRgb[1]})`}
              stopOpacity={0}
            />
          </RadialGradient>
          <RadialGradient id={glow3Id} cx="50%" cy="90%" r="58%">
            <Stop
              offset="0%"
              stopColor={`rgb(${layout.glowRgb[2]})`}
              stopOpacity={layout.glowOpacities[2]}
            />
            <Stop
              offset="100%"
              stopColor={`rgb(${layout.glowRgb[2]})`}
              stopOpacity={0}
            />
          </RadialGradient>
          {layout.courses.map((course) => (
            <ClipPath key={course.clipId} id={`${course.clipId}-${uidPrefix}`}>
              <Rect
                x={course.x}
                y={course.y}
                width={course.width}
                height={course.height}
                rx={course.rx}
                ry={course.rx}
              />
            </ClipPath>
          ))}
        </Defs>

        {/* 背景渐变 + Aurora 柔光层 */}
        <Rect
          x={0}
          y={0}
          width={layout.width}
          height={layout.height}
          fill={`url(#${bgId})`}
        />
        <Circle
          cx={Math.round(layout.width * 0.18)}
          cy={Math.round(layout.height * 0.14)}
          r={Math.round(layout.width * 0.56)}
          fill={`url(#${glow1Id})`}
        />
        <Circle
          cx={Math.round(layout.width * 0.85)}
          cy={Math.round(layout.height * 0.32)}
          r={Math.round(layout.width * 0.52)}
          fill={`url(#${glow2Id})`}
        />
        <Circle
          cx={Math.round(layout.width * 0.5)}
          cy={Math.round(layout.height * 0.9)}
          r={Math.round(layout.width * 0.58)}
          fill={`url(#${glow3Id})`}
        />

        {/* 海报页眉 */}
        <SvgText
          x={layout.card.x}
          y={headerBaseY}
          fill={layout.inkMuted}
          fontSize={22}
          fontWeight="700"
          letterSpacing={3.5}
        >
          DARK STUDY · TIMETABLE
        </SvgText>
        <SvgText
          x={layout.card.x}
          y={headerBaseY + 62}
          fill={layout.inkPrimary}
          fontSize={48}
          fontWeight="800"
        >
          {layout.scheduleName}
        </SvgText>

        {/* 右上角周次徽章 */}
        <Rect
          x={layout.badge.x}
          y={layout.badge.y}
          width={layout.badge.width}
          height={layout.badge.height}
          rx={layout.badge.rx}
          ry={layout.badge.rx}
          fill={layout.surfaceBg}
          stroke={layout.surfaceBorder}
          strokeWidth={2}
        />
        <SvgText
          x={layout.badge.x + layout.badge.width - 26}
          y={layout.badge.y + 48}
          textAnchor="end"
          fill={layout.inkPrimary}
          fontSize={32}
          fontWeight="800"
        >
          {`第 ${layout.week} 周`}
        </SvgText>
        {layout.dateRange ? (
          <SvgText
            x={layout.badge.x + layout.badge.width - 26}
            y={layout.badge.y + 82}
            textAnchor="end"
            fill={layout.inkMuted}
            fontSize={22}
            fontWeight="600"
          >
            {layout.dateRange}
          </SvgText>
        ) : null}

        {/* 玻璃课表网格容器 */}
        <Rect
          x={layout.card.x}
          y={layout.card.y}
          width={layout.card.width}
          height={layout.card.height}
          rx={layout.card.rx}
          ry={layout.card.rx}
          fill={layout.surfaceBg}
          stroke={layout.surfaceBorder}
          strokeWidth={2.5}
        />
        <Line
          x1={layout.card.x}
          y1={layout.gridTopY}
          x2={layout.card.x + layout.card.width}
          y2={layout.gridTopY}
          stroke={layout.gridLine}
          strokeWidth={2}
        />
        <Line
          x1={layout.card.x + layout.axisWidth}
          y1={layout.card.y}
          x2={layout.card.x + layout.axisWidth}
          y2={layout.card.y + layout.card.height}
          stroke={layout.gridLine}
          strokeWidth={2}
        />
        <SvgText
          x={layout.card.x + layout.axisWidth / 2}
          y={layout.card.y + layout.headerRowHeight / 2 + 9}
          textAnchor="middle"
          fill={layout.inkMuted}
          fontSize={22}
          fontWeight="700"
        >
          节
        </SvgText>

        {/* 表头星期与列线 */}
        {layout.days.map((day, idx) => (
          <G key={day.weekday}>
            {idx > 0 ? (
              <Line
                x1={day.x}
                y1={layout.gridTopY}
                x2={day.x}
                y2={layout.card.y + layout.card.height}
                stroke={layout.gridLine}
                strokeWidth={1.5}
              />
            ) : null}
            <SvgText
              x={day.centerX}
              y={layout.card.y + 42}
              textAnchor="middle"
              fill={layout.inkPrimary}
              fontSize={27}
              fontWeight="800"
            >
              {day.shortLabel}
            </SvgText>
            {day.dateLabel ? (
              <SvgText
                x={day.centerX}
                y={layout.card.y + 74}
                textAnchor="middle"
                fill={layout.inkMuted}
                fontSize={20}
                fontWeight="600"
              >
                {day.dateLabel}
              </SvgText>
            ) : null}
          </G>
        ))}

        {/* 左侧节次与横线 */}
        {layout.periods.map((p, idx) => {
          const axisCx = layout.card.x + layout.axisWidth / 2;
          return (
            <G key={p.index}>
              {idx > 0 ? (
                <Line
                  x1={layout.card.x}
                  y1={p.y}
                  x2={layout.card.x + layout.card.width}
                  y2={p.y}
                  stroke={layout.gridLine}
                  strokeWidth={1.5}
                />
              ) : null}
              <SvgText
                x={axisCx}
                y={p.centerY - 4}
                textAnchor="middle"
                fill={layout.inkPrimary}
                fontSize={25}
                fontWeight="800"
              >
                {String(p.index)}
              </SvgText>
              <SvgText
                x={axisCx}
                y={p.centerY + 23}
                textAnchor="middle"
                fill={layout.inkMuted}
                fontSize={18}
                fontWeight="600"
              >
                {p.startTime}
              </SvgText>
            </G>
          );
        })}

        {/* 课程色块 */}
        {layout.courses.map((course) => {
          const textX = course.x + 17;
          const firstLineY = course.y + 12 + course.nameFontSize;
          const metaY =
            firstLineY + course.nameLines.length * course.nameLineHeight + 4;
          const teacherY = metaY + course.metaFontSize + 8;
          return (
            <G
              key={course.clipId}
              clipPath={`url(#${course.clipId}-${uidPrefix})`}
            >
              <Rect
                x={course.x}
                y={course.y}
                width={course.width}
                height={course.height}
                rx={course.rx}
                ry={course.rx}
                fill={course.accentColor}
                fillOpacity={course.fillOpacity}
                stroke={course.accentColor}
                strokeOpacity={course.strokeOpacity}
                strokeWidth={2}
              />
              <Rect
                x={course.x}
                y={course.y}
                width={8}
                height={course.height}
                fill={course.accentColor}
              />
              {course.nameLines.map((line, lineIdx) => (
                <SvgText
                  key={lineIdx}
                  x={textX}
                  y={firstLineY + lineIdx * course.nameLineHeight}
                  fill={layout.inkPrimary}
                  fontSize={course.nameFontSize}
                  fontWeight="700"
                >
                  {line}
                </SvgText>
              ))}
              {course.metaText ? (
                <SvgText
                  x={textX}
                  y={metaY}
                  fill={layout.inkMuted}
                  fontSize={course.metaFontSize}
                  fontWeight="600"
                >
                  {course.metaText}
                </SvgText>
              ) : null}
              {course.teacherText &&
              teacherY <= course.y + course.height - 8 ? (
                <SvgText
                  x={textX}
                  y={teacherY}
                  fill={layout.inkMuted}
                  fontSize={Math.max(16, course.metaFontSize - 2)}
                  fontWeight="500"
                >
                  {course.teacherText}
                </SvgText>
              ) : null}
            </G>
          );
        })}

        {/* 海报页脚 */}
        <SvgText
          x={layout.card.x + 8}
          y={layout.footerY}
          fill={layout.inkMuted}
          fontSize={24}
          fontWeight="600"
        >
          {layout.courseCountLabel}
        </SvgText>
        {layout.semesterRange ? (
          <SvgText
            x={layout.card.x + layout.card.width - 8}
            y={layout.footerY}
            textAnchor="end"
            fill={layout.inkMuted}
            fontSize={24}
            fontWeight="600"
          >
            {layout.semesterRange}
          </SvgText>
        ) : null}
      </Svg>
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
  const [wallpaperBusy, setWallpaperBusy] = useState(false);
  const [wallpaperMsg, setWallpaperMsg] = useState("");
  const posterSvgRef = useRef<Svg | null>(null);

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

  const handleExportWallpaperPng = async (
    androidAction: "share" | "save" = "share",
  ) => {
    if (wallpaperBusy) return;
    setWallpaperBusy(true);
    setWallpaperMsg("");
    try {
      const svgMarkup = buildScheduleWallpaperSvgMarkup({
        schedule,
        week: clampedPosterWeek,
        tint: posterTint,
        posterDark,
        showWeekend,
        width: WALLPAPER_DEFAULT_WIDTH,
        height: WALLPAPER_DEFAULT_HEIGHT,
      });
      const fileName = buildWallpaperFileName(
        schedule.name,
        clampedPosterWeek,
        "png",
      );
      const result = await exportWallpaperPng({
        svgRef: posterSvgRef,
        svgMarkup,
        fileName,
        width: WALLPAPER_DEFAULT_WIDTH,
        height: WALLPAPER_DEFAULT_HEIGHT,
        title: `${schedule.name} 第 ${clampedPosterWeek} 周壁纸`,
        androidAction,
      });
      if (result.canceled) {
        setWallpaperMsg("已取消保存高清壁纸。");
        return;
      }
      successHaptic();
      if (result.method === "download") {
        setWallpaperMsg(
          result.format === "png"
            ? `已下载高清壁纸 ${result.fileName}（1080×1920 PNG）。`
            : `已下载高清矢量壁纸 ${result.fileName}。`,
        );
      } else if (result.method === "saf") {
        setWallpaperMsg(`高清壁纸 ${result.fileName} 已保存到所选文件夹。`);
      } else if (result.method === "intent") {
        setWallpaperMsg(
          "已生成 1080×1920 高清 PNG 并打开系统图片面板，可直接设为壁纸或分享。",
        );
      } else {
        setWallpaperMsg(
          "已生成 1080×1920 高清 PNG 并唤起系统分享面板，可存储到相册或转发好友。",
        );
      }
    } catch (error) {
      warnHaptic();
      setWallpaperMsg(
        error instanceof Error
          ? error.message
          : "导出高清壁纸 PNG 失败，可使用下方全屏纯净预览截屏。",
      );
    } finally {
      setWallpaperBusy(false);
    }
  };

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

                {/* 壁纸海报预览（实时矢量画布，导出与所见 1:1 一致） */}
                <WallpaperPosterCard
                  schedule={schedule}
                  week={clampedPosterWeek}
                  tint={posterTint}
                  posterDark={posterDark}
                  showWeekend={showWeekend}
                  svgRef={posterSvgRef}
                />

                {/* 主按钮：一键保存 / 分享高清壁纸 PNG */}
                <View className="gap-2">
                  <View className="flex-row gap-2">
                    <Pressable
                      accessibilityRole="button"
                      disabled={wallpaperBusy}
                      onPress={() => void handleExportWallpaperPng("share")}
                      className={`flex-1 flex-row items-center justify-center gap-2 rounded-xl bg-sky-600 py-3 ${
                        wallpaperBusy ? "opacity-55" : ""
                      }`}
                    >
                      {wallpaperBusy ? (
                        <ActivityIndicator size="small" color="#FFFFFF" />
                      ) : (
                        <Ionicons
                          name="download-outline"
                          size={16}
                          color="#FFFFFF"
                        />
                      )}
                      <Text className="text-[13px] font-bold text-white">
                        {wallpaperBusy
                          ? "正在渲染高清 PNG…"
                          : "一键保存 / 分享高清壁纸 PNG"}
                      </Text>
                    </Pressable>
                    {Platform.OS === "android" ? (
                      <Pressable
                        accessibilityRole="button"
                        accessibilityLabel="保存壁纸 PNG 到本地目录"
                        disabled={wallpaperBusy}
                        onPress={() => void handleExportWallpaperPng("save")}
                        className={`flex-row items-center justify-center gap-1 rounded-xl border border-sky-500/40 bg-sky-500/12 px-3.5 py-3 ${
                          wallpaperBusy ? "opacity-55" : ""
                        }`}
                      >
                        <Ionicons
                          name="folder-outline"
                          size={15}
                          color="#0284C7"
                        />
                        <Text className="text-[12px] font-bold text-sky-700 dark:text-sky-300">
                          存目录
                        </Text>
                      </Pressable>
                    ) : null}
                  </View>

                  {/* 备选：全屏纯净截屏模式 */}
                  <Pressable
                    accessibilityRole="button"
                    disabled={wallpaperBusy}
                    onPress={() => {
                      tapHaptic();
                      setCleanPreview(true);
                    }}
                    className="flex-row items-center justify-center gap-1.5 rounded-xl border border-slate-200/80 bg-slate-100/80 py-2.5 dark:border-white/10 dark:bg-slate-800/80"
                  >
                    <Ionicons
                      name="expand-outline"
                      size={14}
                      color={isDark ? "#CBD5E1" : "#475569"}
                    />
                    <Text className="text-[12px] font-semibold text-slate-600 dark:text-slate-300">
                      全屏纯净预览（备选截屏模式）
                    </Text>
                  </Pressable>
                </View>

                {wallpaperMsg ? (
                  <Text
                    accessibilityLiveRegion="polite"
                    className="px-1 text-[12px] font-medium text-sky-600 dark:text-sky-300"
                  >
                    {wallpaperMsg}
                  </Text>
                ) : null}
              </ScrollView>
            )}
          </View>
        </View>
      )}
    </Modal>
  );
}
