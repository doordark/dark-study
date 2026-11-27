import Ionicons from "@expo/vector-icons/Ionicons";
import { useColorScheme } from "nativewind";
import React, { useId, useMemo, useState } from "react";
import { Pressable, ScrollView, Text, TextInput, View } from "react-native";
import Svg, {
  Circle,
  Defs,
  Line,
  LinearGradient,
  Path,
  Polyline,
  Stop,
  Text as SvgText,
} from "react-native-svg";

import { GlassContainer } from "@/components/GlassContainer";
import type {
  GpaScaleId,
  GradeRecord,
  GradeRule,
  GradeType,
  GradeYear,
} from "@/types";
import {
  buildCreditDistribution,
  buildTermGpaTrend,
  formatGpa,
  formatWeightedScore,
  getGpaScaleMeta,
  semesterLabel,
} from "@/utils/grades";

const BUCKET_COLORS = [
  "#38BDF8",
  "#A78BFA",
  "#34D399",
  "#FBBF24",
  "#FB7185",
  "#22D3EE",
] as const;

const TARGET_PRESETS = [120, 140, 160, 180] as const;

export interface GradeAnalyticsCardProps {
  grades: GradeRecord[];
  gradeYears: GradeYear[];
  gradeTypes: GradeType[];
  rule?: GradeRule;
  scale: GpaScaleId;
  onCollapse?: () => void;
}

function shortenAxisLabel(label: string): string {
  return label.length > 7 ? `${label.slice(0, 6)}…` : label;
}

function buildYTicks(maxGpa: number): number[] {
  if (Math.abs(maxGpa - 4.0) < 1e-6) return [0, 1, 2, 3, 4];
  if (Math.abs(maxGpa - 4.3) < 1e-6) return [0, 1.5, 3, 4.3];
  return [0, 1.5, 3, 4, 5];
}

export function GradeAnalyticsCard({
  grades,
  gradeYears,
  gradeTypes,
  rule,
  scale,
  onCollapse,
}: GradeAnalyticsCardProps) {
  const { colorScheme } = useColorScheme();
  const isDark = colorScheme !== "light";
  const gradId = `gpa-area-${useId().replace(/[^\w-]/g, "")}`;

  const [chartWidth, setChartWidth] = useState(280);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [targetCredits, setTargetCredits] = useState(160);
  const [editingTarget, setEditingTarget] = useState(false);
  const [targetInput, setTargetInput] = useState("160");
  const [applyRuleToAudit, setApplyRuleToAudit] = useState(false);

  const scaleMeta = getGpaScaleMeta(scale);
  const maxGpa = scaleMeta.maxGpa || 5;

  const trend = useMemo(
    () => buildTermGpaTrend(grades, gradeYears, rule),
    [grades, gradeYears, rule],
  );

  const ruleHasExclusions = Boolean(
    rule &&
      (rule.excludedTypes.length > 0 || rule.excludedCourseIds.length > 0),
  );
  const effectiveAuditRule =
    ruleHasExclusions && applyRuleToAudit ? rule : undefined;

  const distribution = useMemo(
    () => buildCreditDistribution(grades, gradeTypes, effectiveAuditRule),
    [grades, gradeTypes, effectiveAuditRule],
  );

  const selectedIndex = useMemo(() => {
    if (!trend.length) return -1;
    if (selectedKey) {
      const idx = trend.findIndex((item) => item.key === selectedKey);
      if (idx >= 0) return idx;
    }
    return trend.length - 1;
  }, [trend, selectedKey]);

  const selectedPoint = selectedIndex >= 0 ? trend[selectedIndex] : null;
  const previousPoint = selectedIndex > 0 ? trend[selectedIndex - 1] : null;
  const termDelta =
    selectedPoint && previousPoint ? selectedPoint.gpa - previousPoint.gpa : null;

  // SVG 布局参数
  const chartHeight = 152;
  const padLeft = 32;
  const padRight = 18;
  const padTop = 18;
  const padBottom = 26;
  const plotW = Math.max(80, chartWidth - padLeft - padRight);
  const plotH = chartHeight - padTop - padBottom;
  const baselineY = padTop + plotH;
  const yTicks = buildYTicks(maxGpa);

  const yOf = (gpa: number) => {
    const clamped = Math.max(0, Math.min(maxGpa, gpa));
    return padTop + plotH * (1 - clamped / maxGpa);
  };

  const coords = trend.map((pt, idx) => ({
    point: pt,
    x:
      trend.length <= 1
        ? padLeft + plotW / 2
        : padLeft + (plotW * idx) / (trend.length - 1),
    y: yOf(pt.gpa),
  }));

  const polylinePoints = coords
    .map((c) => `${c.x.toFixed(1)},${c.y.toFixed(1)}`)
    .join(" ");

  const areaPath =
    coords.length >= 2
      ? [
          `M ${coords[0].x.toFixed(1)} ${baselineY.toFixed(1)}`,
          ...coords.map((c) => `L ${c.x.toFixed(1)} ${c.y.toFixed(1)}`),
          `L ${coords[coords.length - 1].x.toFixed(1)} ${baselineY.toFixed(1)}`,
          "Z",
        ].join(" ")
      : "";

  const labelStep = trend.length > 5 ? Math.ceil(trend.length / 4) : 1;

  const accentStroke = isDark ? "#38BDF8" : "#0284C7";
  const gridStroke = isDark
    ? "rgba(148,163,184,0.18)"
    : "rgba(100,116,139,0.20)";
  const axisLabelColor = isDark ? "#94A3B8" : "#64748B";
  const dotInnerBg = isDark ? "#0F172A" : "#FFFFFF";

  const completionRatio =
    targetCredits > 0
      ? Math.min(1, distribution.totalEarnedCredits / targetCredits)
      : 0;
  const completionPct =
    targetCredits > 0
      ? (distribution.totalEarnedCredits / targetCredits) * 100
      : 0;
  const targetReached =
    targetCredits > 0 && distribution.totalEarnedCredits >= targetCredits;

  const commitTargetCredits = (raw: string) => {
    const parsed = Number(raw.trim());
    if (Number.isFinite(parsed) && parsed > 0) {
      const clamped = Math.min(400, Math.max(10, Math.round(parsed * 10) / 10));
      setTargetCredits(clamped);
      setTargetInput(String(clamped));
    } else {
      setTargetInput(String(targetCredits));
    }
    setEditingTarget(false);
  };

  const adjustTargetBy = (delta: number) => {
    const next = Math.min(400, Math.max(10, Math.round(targetCredits + delta)));
    setTargetCredits(next);
    setTargetInput(String(next));
  };

  return (
    <GlassContainer
      radius={24}
      intensity={44}
      borderOpacity={0.22}
      style={{ marginTop: 12 }}
    >
      <View className="px-4 py-4">
        {/* 顶栏 */}
        <View className="flex-row items-center justify-between">
          <View className="flex-row items-center">
            <Ionicons name="stats-chart" size={14} color="#38BDF8" />
            <Text className="ml-1.5 text-[13.5px] font-bold text-slate-800 dark:text-white">
              趋势与学分统计
            </Text>
          </View>
          {onCollapse ? (
            <Pressable
              accessibilityRole="button"
              onPress={onCollapse}
              hitSlop={8}
              className="flex-row items-center rounded-full bg-white/25 px-2.5 py-1 dark:bg-white/[0.07]"
            >
              <Text className="text-[10px] font-semibold text-slate-500 dark:text-slate-300">
                收起
              </Text>
              <Ionicons
                name="chevron-up"
                size={12}
                color="#94A3B8"
                style={{ marginLeft: 2 }}
              />
            </Pressable>
          ) : null}
        </View>

        {/* Section A: 各学期 GPA 趋势图 */}
        <View className="mt-3">
          <View className="flex-row items-center justify-between">
            <Text className="text-[11.5px] font-semibold text-slate-700 dark:text-slate-200">
              各学期 GPA 趋势
            </Text>
            <Text className="text-[10px] text-slate-400 dark:text-slate-500">
              {rule?.name ?? "默认规则"} · 满绩 {scaleMeta.maxGpa}
            </Text>
          </View>

          {trend.length === 0 ? (
            <View className="mt-2.5 items-center rounded-2xl border border-dashed border-slate-400/25 py-6 px-4">
              <Ionicons name="analytics-outline" size={22} color="#94A3B8" />
              <Text className="mt-1.5 text-center text-[11px] text-slate-400 dark:text-slate-500">
                暂无可绘制的学期绩点数据，录入含学分与有效绩点的成绩后自动生成趋势图
              </Text>
            </View>
          ) : (
            <View className="mt-2">
              <View
                onLayout={(e) => {
                  const w = Math.floor(e.nativeEvent.layout.width);
                  if (w > 40 && Math.abs(w - chartWidth) >= 2) {
                    setChartWidth(w);
                  }
                }}
                className="rounded-2xl border border-white/25 bg-white/20 py-1 dark:border-white/[0.08] dark:bg-white/[0.04]"
              >
                <Svg width={chartWidth} height={chartHeight}>
                  <Defs>
                    <LinearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
                      <Stop
                        offset="0"
                        stopColor="#38BDF8"
                        stopOpacity={isDark ? 0.28 : 0.2}
                      />
                      <Stop offset="1" stopColor="#38BDF8" stopOpacity={0.01} />
                    </LinearGradient>
                  </Defs>

                  {/* 水平刻度线 + 纵轴文字 */}
                  {yTicks.map((tick) => {
                    const y = yOf(tick);
                    return (
                      <React.Fragment key={tick}>
                        <Line
                          x1={padLeft}
                          y1={y}
                          x2={padLeft + plotW}
                          y2={y}
                          stroke={gridStroke}
                          strokeWidth={1}
                          strokeDasharray={tick === 0 ? undefined : "3 3"}
                        />
                        <SvgText
                          x={padLeft - 6}
                          y={y + 3.5}
                          fontSize={9.5}
                          fill={axisLabelColor}
                          textAnchor="end"
                        >
                          {tick.toFixed(1)}
                        </SvgText>
                      </React.Fragment>
                    );
                  })}

                  {/* 单学期参考虚线 / 多学期面积与折线 */}
                  {coords.length === 1 ? (
                    <Line
                      x1={padLeft}
                      y1={coords[0].y}
                      x2={padLeft + plotW}
                      y2={coords[0].y}
                      stroke={accentStroke}
                      strokeOpacity={0.35}
                      strokeWidth={1.5}
                      strokeDasharray="4 4"
                    />
                  ) : (
                    <>
                      <Path d={areaPath} fill={`url(#${gradId})`} />
                      <Polyline
                        points={polylinePoints}
                        fill="none"
                        stroke={accentStroke}
                        strokeWidth={2.4}
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </>
                  )}

                  {/* 选中点垂直指示线 */}
                  {selectedIndex >= 0 && coords[selectedIndex] ? (
                    <Line
                      x1={coords[selectedIndex].x}
                      y1={coords[selectedIndex].y}
                      x2={coords[selectedIndex].x}
                      y2={baselineY}
                      stroke={accentStroke}
                      strokeOpacity={0.35}
                      strokeWidth={1}
                      strokeDasharray="2 3"
                    />
                  ) : null}

                  {/* 数据节点与 X 轴标签 */}
                  {coords.map((c, idx) => {
                    const active = idx === selectedIndex;
                    const showLabel =
                      trend.length <= 5 ||
                      idx === 0 ||
                      idx === trend.length - 1 ||
                      (idx % labelStep === 0 &&
                        trend.length - 1 - idx >=
                          Math.max(1, Math.floor(labelStep / 2)));
                    return (
                      <React.Fragment key={c.point.key}>
                        {active ? (
                          <>
                            <Circle
                              cx={c.x}
                              cy={c.y}
                              r={9}
                              fill={accentStroke}
                              fillOpacity={0.18}
                            />
                            <SvgText
                              x={c.x}
                              y={Math.max(11, c.y - 10)}
                              fontSize={10}
                              fontWeight="700"
                              fill={accentStroke}
                              textAnchor="middle"
                            >
                              {formatGpa(c.point.gpa)}
                            </SvgText>
                          </>
                        ) : null}
                        <Circle
                          cx={c.x}
                          cy={c.y}
                          r={active ? 5 : 3.8}
                          fill={active ? accentStroke : dotInnerBg}
                          stroke={active ? dotInnerBg : accentStroke}
                          strokeWidth={2}
                        />
                        {/* 放大点击热区 */}
                        <Circle
                          cx={c.x}
                          cy={c.y}
                          r={14}
                          fill="transparent"
                          onPress={() => setSelectedKey(c.point.key)}
                        />
                        {showLabel ? (
                          <SvgText
                            x={c.x}
                            y={chartHeight - 7}
                            fontSize={9.5}
                            fontWeight={active ? "700" : "400"}
                            fill={active ? accentStroke : axisLabelColor}
                            textAnchor="middle"
                          >
                            {shortenAxisLabel(c.point.label)}
                          </SvgText>
                        ) : null}
                      </React.Fragment>
                    );
                  })}
                </Svg>
              </View>

              {trend.length === 1 ? (
                <Text className="mt-1.5 text-[10px] text-slate-400 dark:text-slate-500">
                  当前仅有 1 个有效学期，继续录入后续学期成绩即可形成变化曲线
                </Text>
              ) : null}

              {/* 学期切换 Chips */}
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                className="mt-2"
                contentContainerStyle={{ gap: 6 }}
              >
                {trend.map((pt, idx) => {
                  const active = idx === selectedIndex;
                  return (
                    <Pressable
                      key={pt.key}
                      accessibilityRole="button"
                      onPress={() => setSelectedKey(pt.key)}
                      className={`rounded-full border px-2.5 py-1 ${
                        active
                          ? "border-sky-400/70 bg-sky-500/85"
                          : "border-white/25 bg-white/25 dark:border-white/10 dark:bg-white/[0.06]"
                      }`}
                    >
                      <Text
                        className={`text-[10px] font-semibold ${
                          active
                            ? "text-white"
                            : "text-slate-600 dark:text-slate-300"
                        }`}
                      >
                        {pt.label} · {formatGpa(pt.gpa)}
                      </Text>
                    </Pressable>
                  );
                })}
              </ScrollView>

              {/* 选中学期详情栏 */}
              {selectedPoint ? (
                <View className="mt-2 flex-row items-center justify-between rounded-xl bg-sky-500/10 px-3 py-2">
                  <View className="flex-1 pr-2">
                    <View className="flex-row items-center gap-1.5">
                      <Text
                        numberOfLines={1}
                        className="text-[11.5px] font-bold text-slate-800 dark:text-white"
                      >
                        {selectedPoint.yearName} ·{" "}
                        {semesterLabel(selectedPoint.semester)}
                      </Text>
                      {termDelta !== null ? (
                        <Text
                          className={`text-[10px] font-bold ${
                            termDelta >= 0
                              ? "text-emerald-600 dark:text-emerald-300"
                              : "text-amber-600 dark:text-amber-300"
                          }`}
                        >
                          {termDelta >= 0 ? "+" : ""}
                          {termDelta.toFixed(2)}
                        </Text>
                      ) : null}
                    </View>
                    <Text className="mt-0.5 text-[10px] text-slate-500 dark:text-slate-400">
                      均分 {formatWeightedScore(selectedPoint.weightedScore)} ·{" "}
                      {selectedPoint.credits} 学分 · {selectedPoint.courseCount}{" "}
                      门计入
                    </Text>
                  </View>
                  <View className="items-end">
                    <Text className="text-[16px] font-extrabold text-sky-600 dark:text-sky-300">
                      {formatGpa(selectedPoint.gpa)}
                    </Text>
                    <Text className="text-[9.5px] text-slate-400 dark:text-slate-500">
                      学期绩点
                    </Text>
                  </View>
                </View>
              ) : null}
            </View>
          )}
        </View>

        {/* 分隔线 */}
        <View className="my-3.5 h-[1px] bg-white/25 dark:bg-white/[0.08]" />

        {/* Section B: 学分结构与毕业审计 */}
        <View>
          <View className="flex-row items-center justify-between gap-2">
            <View className="flex-row items-center gap-1.5">
              <Text className="text-[11.5px] font-semibold text-slate-700 dark:text-slate-200">
                学分结构与毕业审计
              </Text>
              {ruleHasExclusions ? (
                <Pressable
                  accessibilityRole="button"
                  onPress={() => setApplyRuleToAudit((v) => !v)}
                  className="rounded-full bg-white/25 px-2 py-0.5 dark:bg-white/[0.08]"
                >
                  <Text className="text-[9.5px] font-semibold text-sky-600 dark:text-sky-300">
                    {applyRuleToAudit ? "仅规则计入" : "含全部类型"}
                  </Text>
                </Pressable>
              ) : null}
            </View>
            <Pressable
              accessibilityRole="button"
              onPress={() => {
                setTargetInput(String(targetCredits));
                setEditingTarget((v) => !v);
              }}
              className="flex-row items-center rounded-full bg-sky-400/15 px-2.5 py-1"
            >
              <Ionicons name="flag-outline" size={11} color="#38BDF8" />
              <Text className="ml-1 text-[10px] font-semibold text-sky-600 dark:text-sky-300">
                目标 {targetCredits} 学分
              </Text>
            </Pressable>
          </View>

          {/* 快捷调整目标毕业学分 */}
          {editingTarget ? (
            <View className="mt-2 rounded-2xl border border-sky-400/30 bg-sky-400/10 p-2.5">
              <View className="flex-row items-center gap-1.5">
                <Pressable
                  accessibilityRole="button"
                  onPress={() => adjustTargetBy(-10)}
                  className="rounded-lg bg-white/40 px-2.5 py-1.5 dark:bg-white/10"
                >
                  <Text className="text-[11px] font-bold text-slate-700 dark:text-slate-200">
                    -10
                  </Text>
                </Pressable>
                <TextInput
                  accessibilityLabel="目标毕业学分"
                  value={targetInput}
                  onChangeText={setTargetInput}
                  keyboardType="decimal-pad"
                  maxLength={5}
                  placeholder="160"
                  placeholderTextColor="#94A3B8"
                  onSubmitEditing={() => commitTargetCredits(targetInput)}
                  className="flex-1 rounded-lg bg-white/60 px-2.5 py-1 text-center text-[12.5px] font-bold text-slate-800 dark:bg-white/10 dark:text-white"
                />
                <Pressable
                  accessibilityRole="button"
                  onPress={() => adjustTargetBy(10)}
                  className="rounded-lg bg-white/40 px-2.5 py-1.5 dark:bg-white/10"
                >
                  <Text className="text-[11px] font-bold text-slate-700 dark:text-slate-200">
                    +10
                  </Text>
                </Pressable>
                <Pressable
                  accessibilityRole="button"
                  onPress={() => commitTargetCredits(targetInput)}
                  className="rounded-lg bg-sky-500 px-3 py-1.5"
                >
                  <Text className="text-[11px] font-bold text-white">确定</Text>
                </Pressable>
              </View>
              <View className="mt-2 flex-row items-center gap-1.5">
                <Text className="text-[10px] text-slate-500 dark:text-slate-400">
                  常用：
                </Text>
                {TARGET_PRESETS.map((preset) => (
                  <Pressable
                    key={preset}
                    onPress={() => {
                      setTargetCredits(preset);
                      setTargetInput(String(preset));
                      setEditingTarget(false);
                    }}
                    className={`rounded-full px-2 py-0.5 ${
                      targetCredits === preset
                        ? "bg-sky-500/85"
                        : "bg-white/35 dark:bg-white/10"
                    }`}
                  >
                    <Text
                      className={`text-[10px] font-semibold ${
                        targetCredits === preset
                          ? "text-white"
                          : "text-slate-600 dark:text-slate-300"
                      }`}
                    >
                      {preset}
                    </Text>
                  </Pressable>
                ))}
              </View>
            </View>
          ) : null}

          {/* 总毕业进度条 */}
          <View className="mt-2.5 rounded-2xl border border-white/25 bg-white/20 p-3 dark:border-white/[0.08] dark:bg-white/[0.04]">
            <View className="flex-row items-baseline justify-between">
              <View className="flex-row items-baseline gap-1">
                <Text className="text-[18px] font-extrabold text-slate-800 dark:text-white">
                  {distribution.totalEarnedCredits}
                </Text>
                <Text className="text-[11px] text-slate-500 dark:text-slate-400">
                  / {targetCredits} 已获学分
                </Text>
              </View>
              <View className="flex-row items-center gap-1.5">
                {targetReached ? (
                  <View className="rounded-full bg-emerald-500/15 px-2 py-0.5">
                    <Text className="text-[9.5px] font-bold text-emerald-600 dark:text-emerald-300">
                      已达标
                    </Text>
                  </View>
                ) : null}
                <Text className="text-[12px] font-bold text-sky-600 dark:text-sky-300">
                  {completionPct.toFixed(1)}%
                </Text>
              </View>
            </View>

            <View className="mt-2 h-2.5 overflow-hidden rounded-full bg-slate-400/20 dark:bg-white/10">
              <View
                style={{
                  width: `${Math.round(completionRatio * 100)}%`,
                  backgroundColor: targetReached ? "#10B981" : "#38BDF8",
                }}
                className="h-full rounded-full"
              />
            </View>

            <Text className="mt-1.5 text-[10px] text-slate-400 dark:text-slate-500">
              {targetReached
                ? distribution.totalEarnedCredits > targetCredits
                  ? `已超出毕业目标 ${(distribution.totalEarnedCredits - targetCredits).toFixed(1)} 学分 · 含合格/通过制课程`
                  : "已达成毕业目标学分 · 含合格/通过制课程"
                : `距离毕业目标还差 ${Math.max(0, Math.round((targetCredits - distribution.totalEarnedCredits) * 100) / 100)} 学分 · 含合格/通过制课程`}
            </Text>
          </View>

          {/* 各课程类型水平进度条 */}
          {distribution.courseCount === 0 ? (
            <Text className="mt-2.5 text-center text-[11px] text-slate-400 dark:text-slate-500">
              暂无课程成绩，添加后自动统计各课程类型学分占比
            </Text>
          ) : (
            <View className="mt-2.5 gap-2.5">
              {distribution.buckets.map((bucket, idx) => {
                const color = BUCKET_COLORS[idx % BUCKET_COLORS.length];
                const pct = Math.round(bucket.share * 100);
                const barWidth =
                  bucket.earnedCredits > 0 ? Math.max(4, pct) : 0;
                return (
                  <View key={bucket.typeId}>
                    <View className="flex-row items-center justify-between">
                      <View className="flex-row items-center gap-1.5">
                        <View
                          style={{ backgroundColor: color }}
                          className="h-2 w-2 rounded-full"
                        />
                        <Text className="text-[11.5px] font-semibold text-slate-700 dark:text-slate-200">
                          {bucket.typeName}
                        </Text>
                        <Text className="text-[10px] text-slate-400 dark:text-slate-500">
                          {bucket.courseCount} 门
                        </Text>
                      </View>
                      <Text className="text-[11px] font-semibold text-slate-600 dark:text-slate-300">
                        {bucket.earnedCredits} 学分
                        {bucket.totalCredits > bucket.earnedCredits
                          ? ` / 修 ${bucket.totalCredits}`
                          : ""}{" "}
                        · {pct}%
                      </Text>
                    </View>
                    <View className="mt-1 h-2 overflow-hidden rounded-full bg-slate-400/15 dark:bg-white/[0.08]">
                      <View
                        style={{
                          width: `${barWidth}%`,
                          backgroundColor: color,
                        }}
                        className="h-full rounded-full"
                      />
                    </View>
                  </View>
                );
              })}
            </View>
          )}
        </View>
      </View>
    </GlassContainer>
  );
}
