import Ionicons from "@expo/vector-icons/Ionicons";
import React, { type ReactNode } from "react";
import { Pressable, ScrollView, Text, TextInput, View } from "react-native";
import Animated, { FadeInDown } from "react-native-reanimated";

import { GlassContainer } from "@/components/GlassContainer";
import type { GradeRule, GradeType, GradeYear, SemesterKind } from "@/types";
import {
  calcGradeStats,
  computeGraduationProgress,
  formatGpa,
  formatWeightedScore,
  GRADE_SEMESTERS,
} from "@/utils/grades";

/** "all" = 该范围下的汇总页，SemesterKind = 单个学期 */
export type SemTab = "all" | SemesterKind;
export type SortKey = "default" | "gpa" | "score" | "credit";
export type FilterKey =
  | "all"
  | "missingCredit"
  | "missingGpa"
  | "excluded"
  | string;

const SORT_LABELS: Record<SortKey, string> = {
  default: "默认排序",
  gpa: "按绩点↓",
  score: "按分数↓",
  credit: "按学分↓",
};

export interface GradeOverviewRow {
  key: string;
  label: string;
  stats: ReturnType<typeof calcGradeStats>;
  onPress: () => void;
}

export interface GradesHeaderSectionProps {
  scaleShortLabel: string;
  scaleMaxGpa: number;
  onBack: () => void;
  onOpenScalePicker: () => void;
  gradeYears: GradeYear[];
  yearScope: string;
  currentYear?: GradeYear;
  semTab: SemTab;
  semScope: SemTab;
  scopeLabel: string;
  onSwitchYear: (id: string) => void;
  onSwitchSem: (next: SemTab) => void;
  onOpenYear: (year?: GradeYear) => void;
  stats: ReturnType<typeof calcGradeStats>;
  gradeRules: GradeRule[];
  activeRule?: GradeRule;
  ruleName: string;
  ruleHint: string;
  analyticsOpen: boolean;
  onSelectRule: (id: string) => void;
  onEditRule: (rule?: GradeRule) => void;
  onOpenProjection: () => void;
  onOpenImportSheet: () => void;
  onToggleAnalytics: () => void;
  onOpenScheduleImport: () => void;
  analyticsSlot: ReactNode;
  graduationSlot: ReactNode;
  overviewTitle: string;
  overviewRows: GradeOverviewRow[];
  scopedCount: number;
  gradeTypes: GradeType[];
  sortBy: SortKey;
  onCycleSort: () => void;
  selectMode: boolean;
  onToggleSelectMode: () => void;
  selectedCount: number;
  allSelected: boolean;
  onToggleSelectAll: () => void;
  searchQuery: string;
  onChangeSearchQuery: (q: string) => void;
  filterKey: FilterKey;
  onChangeFilterKey: (key: FilterKey) => void;
}

export function GradesHeaderSection({
  scaleShortLabel,
  scaleMaxGpa,
  onBack,
  onOpenScalePicker,
  gradeYears,
  yearScope,
  currentYear,
  semTab,
  semScope,
  scopeLabel,
  onSwitchYear,
  onSwitchSem,
  onOpenYear,
  stats,
  gradeRules,
  activeRule,
  ruleName,
  ruleHint,
  analyticsOpen,
  onSelectRule,
  onEditRule,
  onOpenProjection,
  onOpenImportSheet,
  onToggleAnalytics,
  onOpenScheduleImport,
  analyticsSlot,
  graduationSlot,
  overviewTitle,
  overviewRows,
  scopedCount,
  gradeTypes,
  sortBy,
  onCycleSort,
  selectMode,
  onToggleSelectMode,
  selectedCount,
  allSelected,
  onToggleSelectAll,
  searchQuery,
  onChangeSearchQuery,
  filterKey,
  onChangeFilterKey,
}: GradesHeaderSectionProps) {
  return (
    <View>
      {/* 头部 */}
      <Animated.View entering={FadeInDown.springify()} className="pt-4">
        <Pressable
          onPress={onBack}
          className="mb-3 h-9 w-9 items-center justify-center rounded-full bg-white/20 dark:bg-white/[0.07]"
        >
          <Ionicons name="chevron-back" size={18} color="#94A3B8" />
        </Pressable>
        <View className="flex-row items-center justify-between">
          <Text className="text-[24px] font-extrabold text-slate-800 dark:text-white">
            成绩
          </Text>
          <Pressable
            onPress={onOpenScalePicker}
            className="flex-row items-center rounded-full border border-sky-400/35 bg-sky-400/12 px-3 py-1.5"
          >
            <Ionicons
              name="swap-horizontal-outline"
              size={12}
              color="#38BDF8"
            />
            <Text className="ml-1 text-[11px] font-semibold text-sky-600 dark:text-sky-300">
              {scaleShortLabel}
            </Text>
          </Pressable>
        </View>
        <Text className="mt-1 text-[12px] text-slate-500 dark:text-slate-400">
          学年分组 · 上 / 下 / 短学期 · 学分加权绩点与均分统计
        </Text>
      </Animated.View>

      {/* 学年切换 */}
      <Animated.View entering={FadeInDown.delay(50).springify()}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          className="mt-4"
          contentContainerStyle={{ gap: 8, paddingRight: 8 }}
        >
          <Pressable
            onPress={() => onSwitchYear("all")}
            className={`rounded-full border px-4 py-2 ${
              yearScope === "all"
                ? "border-sky-400/70 bg-sky-400/80"
                : "border-white/30 bg-white/25 dark:border-white/10 dark:bg-white/[0.06]"
            }`}
          >
            <Text
              className={`text-[12px] font-bold ${
                yearScope === "all"
                  ? "text-white"
                  : "text-slate-600 dark:text-slate-300"
              }`}
            >
              全部学年
            </Text>
          </Pressable>

          {gradeYears.map((y) => {
            const on = yearScope === y.id;
            return (
              <Pressable
                key={y.id}
                onPress={() => onSwitchYear(y.id)}
                onLongPress={() => onOpenYear(y)}
                delayLongPress={320}
                className={`rounded-full border px-4 py-2 ${
                  on
                    ? "border-sky-400/70 bg-sky-400/80"
                    : "border-white/30 bg-white/25 dark:border-white/10 dark:bg-white/[0.06]"
                }`}
              >
                <Text
                  className={`text-[12px] font-bold ${
                    on ? "text-white" : "text-slate-600 dark:text-slate-300"
                  }`}
                >
                  {y.name}
                </Text>
              </Pressable>
            );
          })}

          <Pressable
            onPress={() => onOpenYear(undefined)}
            className="flex-row items-center rounded-full border border-dashed border-sky-400/60 px-3.5 py-2"
          >
            <Ionicons name="add" size={13} color="#38BDF8" />
            <Text className="ml-0.5 text-[12px] font-bold text-sky-500 dark:text-sky-300">
              学年
            </Text>
          </Pressable>
        </ScrollView>
        <Text className="mt-1.5 text-[9.5px] text-slate-400 dark:text-slate-500">
          长按学年可重命名或删除（删除会一并移除该学年的成绩）
        </Text>
      </Animated.View>

      {/* 学期切换 */}
      {currentYear ? (
        <Animated.View entering={FadeInDown.delay(70).springify()}>
          <View className="mt-3 flex-row gap-x-2">
            {[
              { key: "all" as SemTab, label: "学年总成绩" },
              ...GRADE_SEMESTERS.map((s) => ({
                key: s.kind as SemTab,
                label: s.label,
              })),
            ].map((item) => {
              const on = semTab === item.key;
              return (
                <Pressable
                  key={item.key}
                  onPress={() => onSwitchSem(item.key)}
                  className={`flex-1 items-center rounded-xl border py-2 ${
                    on
                      ? "border-sky-400/70 bg-sky-400/80"
                      : "border-white/30 bg-white/25 dark:border-white/10 dark:bg-white/[0.06]"
                  }`}
                >
                  <Text
                    className={`text-[11px] font-bold ${
                      on ? "text-white" : "text-slate-600 dark:text-slate-300"
                    }`}
                  >
                    {item.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </Animated.View>
      ) : null}

      {/* 统计卡 */}
      <Animated.View entering={FadeInDown.delay(90).springify()}>
        <GlassContainer
          radius={28}
          intensity={48}
          borderOpacity={0.24}
          style={{ marginTop: 14 }}
        >
          <View className="px-5 py-4">
            <View className="flex-row items-center justify-between gap-2">
              <Text className="flex-1 text-[12px] font-semibold text-slate-500 dark:text-slate-400">
                {scopeLabel}
              </Text>
              <View className="flex-row gap-1.5">
                <Pressable
                  accessibilityRole="button"
                  onPress={onOpenProjection}
                  className="rounded-full bg-sky-400/15 px-2.5 py-1"
                >
                  <Text className="text-[10.5px] font-semibold text-sky-600 dark:text-sky-300">
                    绩点试算
                  </Text>
                </Pressable>
                <Pressable
                  onPress={() => onEditRule(activeRule)}
                  className="flex-row items-center rounded-full bg-white/25 px-2.5 py-1 dark:bg-white/[0.07]"
                >
                  <Ionicons name="options-outline" size={12} color="#38BDF8" />
                  <Text className="ml-1 text-[10.5px] font-semibold text-sky-500 dark:text-sky-300">
                    编辑规则
                  </Text>
                </Pressable>
              </View>
            </View>

            <View className="mt-1.5 flex-row items-end justify-between">
              <View className="flex-row items-end gap-x-5">
                <View>
                  <Text className="text-[40px] font-extrabold leading-[44px] text-slate-800 dark:text-white">
                    {formatGpa(stats.value)}
                  </Text>
                  <Text className="mt-0.5 text-[10.5px] text-slate-400 dark:text-slate-500">
                    加权绩点（满绩 {scaleMaxGpa}）
                  </Text>
                </View>
                <View className="pb-0.5">
                  <Text className="text-[22px] font-bold text-slate-700 dark:text-slate-200">
                    {formatWeightedScore(stats.weightedScore)}
                  </Text>
                  <Text className="text-[10px] text-slate-400 dark:text-slate-500">
                    加权均分
                  </Text>
                </View>
              </View>
              <Pressable
                onPress={onOpenImportSheet}
                className="mb-1 flex-row items-center rounded-full bg-sky-500/15 px-3 py-1.5"
              >
                <Ionicons
                  name="cloud-upload-outline"
                  size={13}
                  color="#38BDF8"
                />
                <Text className="ml-1 text-[11px] font-bold text-sky-500 dark:text-sky-300">
                  导入成绩
                </Text>
              </Pressable>
            </View>

            <View className="mt-2.5 flex-row flex-wrap gap-x-3.5 gap-y-1">
              <Text className="text-[11px] text-slate-500 dark:text-slate-400">
                计入 {stats.count} 门
              </Text>
              <Text className="text-[11px] text-slate-500 dark:text-slate-400">
                计入学分 {stats.credits}
              </Text>
              {stats.earnedCredits > stats.credits ? (
                <Text className="text-[11px] text-slate-500 dark:text-slate-400">
                  已获总学分 {stats.earnedCredits}
                </Text>
              ) : null}
              {stats.overriddenCount > 0 ? (
                <Text className="text-[11px] font-semibold text-amber-600 dark:text-amber-300">
                  重修覆盖 {stats.overriddenCount} 条
                </Text>
              ) : null}
              <Text className="text-[11px] text-slate-500 dark:text-slate-400">
                共 {stats.total} 门
              </Text>
            </View>

            {stats.missing > 0 ? (
              <Pressable
                onPress={() =>
                  onChangeFilterKey(
                    filterKey === "missingGpa" ? "all" : "missingGpa",
                  )
                }
                className="mt-1.5 self-start rounded-lg bg-amber-400/15 px-2 py-1"
              >
                <Text className="text-[10px] font-semibold text-amber-600 dark:text-amber-300">
                  有 {stats.missing} 门缺少有效绩点，点击筛选查看 →
                </Text>
              </Pressable>
            ) : null}
            {stats.missingCredit > 0 ? (
              <Pressable
                onPress={() =>
                  onChangeFilterKey(
                    filterKey === "missingCredit" ? "all" : "missingCredit",
                  )
                }
                className="mt-1 self-start rounded-lg bg-amber-400/15 px-2 py-1"
              >
                <Text className="text-[10px] font-semibold text-amber-600 dark:text-amber-300">
                  有 {stats.missingCredit} 门缺学分待补，点击一键筛选 →
                </Text>
              </Pressable>
            ) : null}

            {/* 计算规则切换 */}
            <View className="mt-3.5 flex-row items-center">
              <Text className="mr-2 text-[10.5px] font-semibold text-slate-400 dark:text-slate-500">
                规则
              </Text>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={{ gap: 6, paddingRight: 4 }}
                className="flex-1"
              >
                {gradeRules.map((r) => {
                  const on = r.id === activeRule?.id;
                  return (
                    <Pressable
                      key={r.id}
                      onPress={() => onSelectRule(r.id)}
                      className={`rounded-full border px-3 py-1 ${
                        on
                          ? "border-violet-400/70 bg-violet-400/80"
                          : "border-white/25 bg-white/20 dark:border-white/10 dark:bg-white/[0.05]"
                      }`}
                    >
                      <Text
                        className={`text-[10.5px] font-semibold ${
                          on
                            ? "text-white"
                            : "text-slate-500 dark:text-slate-400"
                        }`}
                      >
                        {r.name}
                      </Text>
                    </Pressable>
                  );
                })}
                <Pressable
                  onPress={() => onEditRule(undefined)}
                  className="rounded-full border border-dashed border-sky-400/60 px-3 py-1"
                >
                  <Text className="text-[10.5px] font-semibold text-sky-500 dark:text-sky-300">
                    + 新建
                  </Text>
                </Pressable>
              </ScrollView>
            </View>
            <Text className="mt-2 text-[9.5px] text-slate-400 dark:text-slate-500">
              当前：{ruleName} · {ruleHint}
            </Text>

            {/* 快捷分析与课表结课导入入口 */}
            <View className="mt-3 flex-row gap-2">
              <Pressable
                accessibilityRole="button"
                onPress={onToggleAnalytics}
                className={`flex-1 flex-row items-center justify-center rounded-xl border py-2 ${
                  analyticsOpen
                    ? "border-sky-400/70 bg-sky-500/85"
                    : "border-white/25 bg-white/25 dark:border-white/10 dark:bg-white/[0.06]"
                }`}
              >
                <Ionicons
                  name="stats-chart-outline"
                  size={13}
                  color={analyticsOpen ? "#FFFFFF" : "#38BDF8"}
                />
                <Text
                  className={`ml-1.5 text-[11px] font-semibold ${
                    analyticsOpen
                      ? "text-white"
                      : "text-slate-700 dark:text-slate-200"
                  }`}
                >
                  趋势与学分统计
                </Text>
                <Ionicons
                  name={analyticsOpen ? "chevron-up" : "chevron-down"}
                  size={12}
                  color={analyticsOpen ? "#FFFFFF" : "#94A3B8"}
                  style={{ marginLeft: 3 }}
                />
              </Pressable>
              <Pressable
                accessibilityRole="button"
                onPress={onOpenScheduleImport}
                className="flex-1 flex-row items-center justify-center rounded-xl border border-sky-400/35 bg-sky-400/12 py-2"
              >
                <Ionicons name="calendar-outline" size={13} color="#38BDF8" />
                <Text className="ml-1.5 text-[11px] font-semibold text-sky-600 dark:text-sky-300">
                  从课表结课导入
                </Text>
              </Pressable>
            </View>
          </View>
        </GlassContainer>
      </Animated.View>

      {analyticsSlot}
      {graduationSlot}

      {/* 总览 */}
      {semScope === "all" ? (
        <Animated.View
          entering={FadeInDown.delay(120).springify()}
          className="mt-3"
        >
          <GlassContainer radius={24} intensity={42} borderOpacity={0.22}>
            <View className="px-4 py-3.5">
              <Text className="mb-1 text-[12px] font-semibold text-slate-700 dark:text-slate-200">
                {overviewTitle}
              </Text>
              {overviewRows.length === 0 ? (
                <Text className="py-3 text-[11px] text-slate-400 dark:text-slate-500">
                  还没有学年，点上方「+ 学年」新建一个
                </Text>
              ) : (
                overviewRows.map((row) => (
                  <Pressable
                    key={row.key}
                    onPress={row.onPress}
                    className="flex-row items-center border-t border-white/20 py-2.5 dark:border-white/[0.06]"
                  >
                    <Text className="flex-1 text-[12px] text-slate-600 dark:text-slate-300">
                      {row.label}
                    </Text>
                    <Text className="mr-3 text-[10.5px] text-slate-400 dark:text-slate-500">
                      {row.stats.total === 0
                        ? "暂无成绩"
                        : row.stats.credits > 0
                          ? `${row.stats.count} 门 · ${row.stats.credits} 学分`
                          : `${row.stats.total} 门 · 学分待补`}
                    </Text>
                    <Text className="w-12 text-right text-[13px] font-bold text-sky-500 dark:text-sky-300">
                      {formatGpa(row.stats.value)}
                    </Text>
                  </Pressable>
                ))
              )}
            </View>
          </GlassContainer>
        </Animated.View>
      ) : null}

      {/* 成绩列表头与搜索筛选工具栏 */}
      <Animated.View
        entering={FadeInDown.delay(190).springify()}
        className="mb-2.5 mt-3"
      >
        <GlassContainer radius={24} intensity={42} borderOpacity={0.22}>
          <View className="px-4 py-3.5">
            <View className="flex-row items-center justify-between">
              <Text className="text-[14px] font-bold text-slate-800 dark:text-white">
                {scopeLabel}
              </Text>
              <View className="flex-row items-center gap-1.5">
                <Pressable
                  onPress={onCycleSort}
                  className="rounded-full bg-white/25 px-2.5 py-1 dark:bg-white/[0.07]"
                >
                  <Text className="text-[10px] font-semibold text-slate-600 dark:text-slate-300">
                    {SORT_LABELS[sortBy]}
                  </Text>
                </Pressable>
                <Pressable
                  onPress={onToggleSelectMode}
                  className={`rounded-full px-2.5 py-1 ${
                    selectMode
                      ? "bg-sky-400/80"
                      : "bg-white/25 dark:bg-white/[0.07]"
                  }`}
                >
                  <Text
                    className={`text-[10px] font-semibold ${
                      selectMode
                        ? "text-white"
                        : "text-sky-500 dark:text-sky-300"
                    }`}
                  >
                    {selectMode ? "完成" : "勾选"}
                  </Text>
                </Pressable>
              </View>
            </View>

            {/* 搜索与快捷筛选（有成绩时展示） */}
            {scopedCount > 0 ? (
              <View className="mt-2.5">
                <View className="flex-row items-center rounded-xl border border-white/25 bg-white/30 px-2.5 py-1.5 dark:border-white/10 dark:bg-white/[0.06]">
                  <Ionicons name="search" size={13} color="#94A3B8" />
                  <TextInput
                    value={searchQuery}
                    onChangeText={onChangeSearchQuery}
                    placeholder="搜索课程名…"
                    placeholderTextColor="#94A3B8"
                    className="ml-1.5 flex-1 py-0 text-[12px] text-slate-800 dark:text-slate-100"
                  />
                  {searchQuery ? (
                    <Pressable
                      onPress={() => onChangeSearchQuery("")}
                      hitSlop={8}
                    >
                      <Ionicons name="close-circle" size={14} color="#94A3B8" />
                    </Pressable>
                  ) : null}
                </View>
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  className="mt-2"
                  contentContainerStyle={{ gap: 6 }}
                >
                  {[
                    { key: "all", label: `全部 (${scopedCount})` },
                    ...(stats.missingCredit > 0
                      ? [
                          {
                            key: "missingCredit",
                            label: `缺学分 (${stats.missingCredit})`,
                          },
                        ]
                      : []),
                    ...(stats.missing > 0
                      ? [
                          {
                            key: "missingGpa",
                            label: `缺绩点 (${stats.missing})`,
                          },
                        ]
                      : []),
                    { key: "excluded", label: "未计入" },
                    ...gradeTypes.map((t) => ({
                      key: t.id,
                      label: t.name,
                    })),
                  ].map((chip) => {
                    const on = filterKey === chip.key;
                    return (
                      <Pressable
                        key={chip.key}
                        onPress={() => onChangeFilterKey(chip.key)}
                        className={`rounded-full px-2.5 py-1 ${
                          on
                            ? "bg-sky-500/85"
                            : "bg-white/25 dark:bg-white/[0.06]"
                        }`}
                      >
                        <Text
                          className={`text-[10px] font-semibold ${
                            on
                              ? "text-white"
                              : "text-slate-600 dark:text-slate-300"
                          }`}
                        >
                          {chip.label}
                        </Text>
                      </Pressable>
                    );
                  })}
                </ScrollView>
              </View>
            ) : null}

            {selectMode ? (
              <View className="mt-2 flex-row items-center">
                <Text className="flex-1 text-[9.5px] text-slate-400 dark:text-slate-500">
                  已选 {selectedCount} 门 · 底部悬浮栏可批量操作
                </Text>
                <Pressable onPress={onToggleSelectAll} hitSlop={8}>
                  <Text className="text-[9.5px] font-semibold text-sky-500 dark:text-sky-300">
                    {allSelected ? "取消全选" : "全选当前列表"}
                  </Text>
                </Pressable>
              </View>
            ) : null}
          </View>
        </GlassContainer>
      </Animated.View>
    </View>
  );
}

export function GraduationCollapsedCard({
  summary,
  onExpand,
}: {
  summary: ReturnType<typeof computeGraduationProgress> | null;
  onExpand: () => void;
}) {
  const pct =
    summary && summary.totalTargetCredits > 0
      ? (summary.totalEarnedCredits / summary.totalTargetCredits) * 100
      : 0;
  const reached = Boolean(
    summary &&
      summary.totalTargetCredits > 0 &&
      summary.totalEarnedCredits >= summary.totalTargetCredits,
  );
  const subtitle = summary
    ? summary.totalTargetCredits > 0
      ? reached
        ? `已修 ${summary.totalEarnedCredits} / ${summary.totalTargetCredits} 学分 · 已达标`
        : `已修 ${summary.totalEarnedCredits} / ${summary.totalTargetCredits} 学分 · ${pct.toFixed(1)}%`
      : `已获 ${summary.totalEarnedCredits} 学分 · 尚未配置毕业目标`
    : "";

  return (
    <GlassContainer radius={24} intensity={42} borderOpacity={0.22}>
      <View className="px-4 py-3.5">
        <View className="flex-row items-center justify-between gap-2">
          <Pressable
            accessibilityRole="button"
            accessibilityState={{ expanded: false }}
            onPress={onExpand}
            className="flex-1 flex-row items-center"
          >
            <View className="mr-2.5 h-8 w-8 items-center justify-center rounded-xl bg-emerald-400/15">
              <Ionicons name="school-outline" size={16} color="#34D399" />
            </View>
            <View className="flex-1">
              <View className="flex-row items-center gap-1.5">
                <Text className="text-[13px] font-bold text-slate-800 dark:text-white">
                  毕业学分进度
                </Text>
                {reached ? (
                  <View className="rounded-full bg-emerald-500/15 px-1.5 py-0.5">
                    <Text className="text-[9px] font-bold text-emerald-600 dark:text-emerald-300">
                      已达标
                    </Text>
                  </View>
                ) : null}
              </View>
              <Text
                numberOfLines={1}
                className="mt-0.5 text-[10.5px] text-slate-500 dark:text-slate-400"
              >
                {subtitle}
              </Text>
            </View>
          </Pressable>

          <View className="flex-row items-center gap-1.5">
            <Pressable
              accessibilityRole="button"
              onPress={onExpand}
              hitSlop={6}
              className="flex-row items-center rounded-full bg-sky-400/15 px-2.5 py-1"
            >
              <Ionicons name="flag-outline" size={11} color="#38BDF8" />
              <Text className="ml-1 text-[10px] font-semibold text-sky-600 dark:text-sky-300">
                {summary?.hasTargets ? "改目标" : "设目标"}
              </Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="展开毕业学分进度"
              onPress={onExpand}
              hitSlop={6}
              className="h-7 w-7 items-center justify-center rounded-full bg-white/25 dark:bg-white/[0.07]"
            >
              <Ionicons name="chevron-down" size={14} color="#94A3B8" />
            </Pressable>
          </View>
        </View>

        {summary && summary.totalTargetCredits > 0 ? (
          <Pressable onPress={onExpand} className="mt-2.5">
            <View className="h-1.5 overflow-hidden rounded-full bg-slate-400/20 dark:bg-white/10">
              <View
                style={{
                  width: `${Math.round(summary.overallRatio * 100)}%`,
                  backgroundColor: reached ? "#10B981" : "#38BDF8",
                }}
                className="h-full rounded-full"
              />
            </View>
          </Pressable>
        ) : null}
      </View>
    </GlassContainer>
  );
}

export function GradeListEmptyCard({
  hasScopedGrades,
  hasActiveFilter,
  onClearFilter,
}: {
  hasScopedGrades: boolean;
  hasActiveFilter: boolean;
  onClearFilter: () => void;
}) {
  return (
    <GlassContainer radius={24} intensity={42} borderOpacity={0.22}>
      <View className="items-center px-4 py-8">
        <Ionicons name="document-text-outline" size={28} color="#94A3B8" />
        <Text className="mt-2 text-[12px] text-slate-400 dark:text-slate-500">
          {!hasScopedGrades
            ? "还没有成绩，先导入或手动添加"
            : "当前筛选条件下没有匹配的成绩"}
        </Text>
        {hasScopedGrades && hasActiveFilter ? (
          <Pressable
            onPress={onClearFilter}
            className="mt-2 rounded-full bg-sky-500/15 px-3 py-1"
          >
            <Text className="text-[11px] font-semibold text-sky-600 dark:text-sky-300">
              清除筛选
            </Text>
          </Pressable>
        ) : null}
      </View>
    </GlassContainer>
  );
}

export function GradeBatchActionBar({
  canClearSemester,
  selectedCount,
  selectedAllExcluded,
  onClearSemester,
  onToggleInclusion,
  onDeleteSelected,
}: {
  canClearSemester: boolean;
  selectedCount: number;
  selectedAllExcluded: boolean;
  onClearSemester: () => void;
  onToggleInclusion: () => void;
  onDeleteSelected: () => void;
}) {
  return (
    <View className="absolute bottom-4 left-5 right-5">
      <GlassContainer radius={22} intensity={68} borderOpacity={0.28}>
        <View className="flex-row items-center gap-2 px-3 py-2.5">
          {canClearSemester ? (
            <Pressable
              onPress={onClearSemester}
              className="items-center rounded-xl border border-red-400/40 bg-red-50/80 px-3 py-2.5 dark:border-red-500/25 dark:bg-red-950/35"
            >
              <Text className="text-[11px] font-semibold text-red-600 dark:text-red-300">
                清空学期
              </Text>
            </Pressable>
          ) : null}
          <Pressable
            onPress={onToggleInclusion}
            disabled={!selectedCount}
            className={`flex-1 items-center rounded-xl border border-white/30 py-2.5 ${
              !selectedCount
                ? "bg-white/10 dark:bg-white/[0.04]"
                : "bg-white/30 dark:bg-white/[0.08]"
            }`}
          >
            <Text
              className={`text-[11px] font-semibold ${
                !selectedCount
                  ? "text-slate-400 dark:text-slate-500"
                  : selectedAllExcluded
                    ? "text-violet-500 dark:text-violet-300"
                    : "text-sky-600 dark:text-sky-300"
              }`}
            >
              {selectedAllExcluded ? "恢复计入" : "不计入成绩"}
            </Text>
          </Pressable>
          <Pressable
            onPress={onDeleteSelected}
            disabled={!selectedCount}
            className={`flex-1 items-center rounded-xl bg-red-500/85 py-2.5 ${
              !selectedCount ? "opacity-45" : ""
            }`}
          >
            <Text className="text-[11px] font-bold text-white">
              删除 ({selectedCount})
            </Text>
          </Pressable>
        </View>
      </GlassContainer>
    </View>
  );
}
