import Ionicons from "@expo/vector-icons/Ionicons";
import React, { useMemo, useState } from "react";
import {
  Alert,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from "react-native";
import Animated, { FadeInDown, FadeOutDown } from "react-native-reanimated";

import {
  GlassContainer,
  GlassTargetProvider,
} from "@/components/GlassContainer";
import { useSettings } from "@/store/useSettings";
import type { GradeRecord, GradeRule, GradeType, GradeYear } from "@/types";
import {
  buildGraduationPresetTargets,
  computeGraduationProgress,
  GRADUATION_TOTAL_TARGET_KEY,
} from "@/utils/grades";

const CATEGORY_COLORS = [
  "#38BDF8",
  "#A78BFA",
  "#34D399",
  "#FBBF24",
  "#FB7185",
  "#22D3EE",
] as const;

const TOTAL_PRESETS = [120, 140, 150, 160, 180] as const;

export interface GraduationProgressCardProps {
  grades: GradeRecord[];
  gradeTypes: GradeType[];
  rule?: GradeRule;
  gradeYears?: GradeYear[];
  defaultExpanded?: boolean;
}

export function GraduationProgressCard({
  grades,
  gradeTypes,
  rule,
  gradeYears,
  defaultExpanded = false,
}: GraduationProgressCardProps) {
  const targets = useSettings((s) => s.graduationCreditTargets);
  const setGraduationCreditTargets = useSettings(
    (s) => s.setGraduationCreditTargets,
  );
  const { height: winH } = useWindowDimensions();
  const maxSheetH = Math.max(320, Math.round(winH * 0.82));

  const [expanded, setExpanded] = useState(defaultExpanded);
  const [applyRuleExclusions, setApplyRuleExclusions] = useState(false);
  const [editorOpen, setEditorOpen] = useState(false);
  const [draftInputs, setDraftInputs] = useState<Record<string, string>>({});
  const [draftTotalInput, setDraftTotalInput] = useState("");

  const ruleHasExclusions = Boolean(
    rule &&
      (rule.excludedTypes.length > 0 || rule.excludedCourseIds.length > 0),
  );

  const effectiveRule = useMemo<GradeRule | undefined>(() => {
    if (!rule) return undefined;
    if (ruleHasExclusions && applyRuleExclusions) return rule;
    return {
      ...rule,
      excludedTypes: [],
      excludedCourseIds: [],
    };
  }, [rule, ruleHasExclusions, applyRuleExclusions]);

  const progress = useMemo(
    () =>
      computeGraduationProgress(
        grades,
        gradeTypes,
        targets,
        effectiveRule,
        gradeYears,
      ),
    [grades, gradeTypes, targets, effectiveRule, gradeYears],
  );

  const overallPct =
    progress.totalTargetCredits > 0
      ? (progress.totalEarnedCredits / progress.totalTargetCredits) * 100
      : 0;
  const overallReached =
    progress.totalTargetCredits > 0 &&
    progress.totalEarnedCredits >= progress.totalTargetCredits;

  const openEditor = () => {
    const nextInputs: Record<string, string> = {};
    for (const t of gradeTypes) {
      const val = targets[t.id];
      nextInputs[t.id] = val != null && val > 0 ? String(val) : "";
    }
    const totalOverride = targets[GRADUATION_TOTAL_TARGET_KEY];
    setDraftInputs(nextInputs);
    setDraftTotalInput(
      totalOverride != null && totalOverride > 0 ? String(totalOverride) : "",
    );
    setEditorOpen(true);
  };

  const applyPresetToDraft = (presetTotal: number) => {
    const presetMap = buildGraduationPresetTargets(presetTotal, gradeTypes);
    const nextInputs: Record<string, string> = {};
    for (const t of gradeTypes) {
      const val = presetMap[t.id];
      nextInputs[t.id] = val != null && val > 0 ? String(val) : "";
    }
    setDraftInputs(nextInputs);
    setDraftTotalInput("");
  };

  const applyPresetImmediately = (presetTotal: number) => {
    const presetMap = buildGraduationPresetTargets(presetTotal, gradeTypes);
    setGraduationCreditTargets(presetMap);
    setExpanded(true);
  };

  const draftCategorySum = useMemo(() => {
    let sum = 0;
    for (const t of gradeTypes) {
      const raw = (draftInputs[t.id] ?? "").trim();
      if (!raw) continue;
      const n = Number(raw);
      if (Number.isFinite(n) && n > 0) sum += n;
    }
    return Math.round(sum * 100) / 100;
  }, [draftInputs, gradeTypes]);

  const saveTargets = () => {
    const nextTargets: Record<string, number> = {};
    for (const t of gradeTypes) {
      const raw = (draftInputs[t.id] ?? "").trim();
      if (!raw) continue;
      const parsed = Number(raw);
      if (!Number.isFinite(parsed) || parsed < 0 || parsed > 500) {
        Alert.alert(
          "目标学分格式不正确",
          `「${t.name}」目标学分需为 0 ~ 500 之间的数字，或留空。`,
        );
        return;
      }
      if (parsed > 0) {
        nextTargets[t.id] = Math.round(parsed * 100) / 100;
      }
    }

    const totalRaw = draftTotalInput.trim();
    if (totalRaw) {
      const parsedTotal = Number(totalRaw);
      if (!Number.isFinite(parsedTotal) || parsedTotal < 0 || parsedTotal > 500) {
        Alert.alert(
          "总目标学分格式不正确",
          "总毕业学分目标需为 0 ~ 500 之间的数字，或留空自动按各类求和。",
        );
        return;
      }
      if (parsedTotal > 0) {
        nextTargets[GRADUATION_TOTAL_TARGET_KEY] =
          Math.round(parsedTotal * 100) / 100;
      }
    }

    setGraduationCreditTargets(nextTargets);
    setEditorOpen(false);
    if (Object.keys(nextTargets).length > 0) {
      setExpanded(true);
    }
  };

  const clearAllTargets = () => {
    setGraduationCreditTargets({});
    setDraftInputs({});
    setDraftTotalInput("");
    setEditorOpen(false);
  };

  const headerSubtitle = progress.totalTargetCredits > 0
    ? overallReached
      ? `已修 ${progress.totalEarnedCredits} / ${progress.totalTargetCredits} 学分 · 已达标`
      : `已修 ${progress.totalEarnedCredits} / ${progress.totalTargetCredits} 学分 · ${overallPct.toFixed(1)}%`
    : `已获 ${progress.totalEarnedCredits} 学分 · 尚未配置毕业目标`;

  return (
    <>
      <GlassContainer radius={24} intensity={42} borderOpacity={0.22}>
        <View className="px-4 py-3.5">
          {/* 顶栏（可点击展开/收起） */}
          <View className="flex-row items-center justify-between gap-2">
            <Pressable
              accessibilityRole="button"
              accessibilityState={{ expanded }}
              onPress={() => setExpanded((v) => !v)}
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
                  {overallReached ? (
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
                  {headerSubtitle}
                </Text>
              </View>
            </Pressable>

            <View className="flex-row items-center gap-1.5">
              <Pressable
                accessibilityRole="button"
                onPress={openEditor}
                hitSlop={6}
                className="flex-row items-center rounded-full bg-sky-400/15 px-2.5 py-1"
              >
                <Ionicons name="flag-outline" size={11} color="#38BDF8" />
                <Text className="ml-1 text-[10px] font-semibold text-sky-600 dark:text-sky-300">
                  {progress.hasTargets ? "改目标" : "设目标"}
                </Text>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={expanded ? "收起毕业学分进度" : "展开毕业学分进度"}
                onPress={() => setExpanded((v) => !v)}
                hitSlop={6}
                className="h-7 w-7 items-center justify-center rounded-full bg-white/25 dark:bg-white/[0.07]"
              >
                <Ionicons
                  name={expanded ? "chevron-up" : "chevron-down"}
                  size={14}
                  color="#94A3B8"
                />
              </Pressable>
            </View>
          </View>

          {/* 折叠态迷你总进度条（已设目标时一眼可见） */}
          {!expanded && progress.totalTargetCredits > 0 ? (
            <Pressable onPress={() => setExpanded(true)} className="mt-2.5">
              <View className="h-1.5 overflow-hidden rounded-full bg-slate-400/20 dark:bg-white/10">
                <View
                  style={{
                    width: `${Math.round(progress.overallRatio * 100)}%`,
                    backgroundColor: overallReached ? "#10B981" : "#38BDF8",
                  }}
                  className="h-full rounded-full"
                />
              </View>
            </Pressable>
          ) : null}

          {/* 展开态详情 */}
          {expanded ? (
            <View className="mt-3">
              {/* 规则范围切换（仅在当前规则含排除项时展示） */}
              {ruleHasExclusions ? (
                <View className="mb-2.5 flex-row items-center justify-between">
                  <Text className="text-[10px] text-slate-400 dark:text-slate-500">
                    按全学年已通过课程统计（重修自动去重）
                  </Text>
                  <Pressable
                    accessibilityRole="button"
                    onPress={() => setApplyRuleExclusions((v) => !v)}
                    className="rounded-full bg-white/25 px-2 py-0.5 dark:bg-white/[0.08]"
                  >
                    <Text className="text-[9.5px] font-semibold text-sky-600 dark:text-sky-300">
                      {applyRuleExclusions ? "仅规则计入" : "含全部类型"}
                    </Text>
                  </Pressable>
                </View>
              ) : null}

              {/* 未设目标时的快捷引导 */}
              {!progress.hasTargets ? (
                <View className="rounded-2xl border border-dashed border-sky-400/35 bg-sky-400/[0.07] p-3">
                  <Text className="text-[11.5px] font-semibold text-slate-700 dark:text-slate-200">
                    快速启用毕业学分目标
                  </Text>
                  <Text className="mt-0.5 text-[10px] leading-4 text-slate-500 dark:text-slate-400">
                    选择常见总学分方案自动拆分各课程类型，或点击「设目标」按培养方案自由填写
                  </Text>
                  <View className="mt-2.5 flex-row flex-wrap gap-1.5">
                    {TOTAL_PRESETS.map((preset) => (
                      <Pressable
                        key={preset}
                        accessibilityRole="button"
                        onPress={() => applyPresetImmediately(preset)}
                        className="rounded-full border border-sky-400/40 bg-sky-500/15 px-2.5 py-1"
                      >
                        <Text className="text-[10.5px] font-semibold text-sky-600 dark:text-sky-300">
                          {preset} 学分
                        </Text>
                      </Pressable>
                    ))}
                  </View>
                </View>
              ) : (
                /* 总进度卡片 */
                <View className="rounded-2xl border border-white/25 bg-white/20 p-3 dark:border-white/[0.08] dark:bg-white/[0.04]">
                  <View className="flex-row items-baseline justify-between">
                    <View className="flex-row items-baseline gap-1">
                      <Text className="text-[20px] font-extrabold text-slate-800 dark:text-white">
                        {progress.totalEarnedCredits}
                      </Text>
                      <Text className="text-[11px] text-slate-500 dark:text-slate-400">
                        / {progress.totalTargetCredits} 总学分
                      </Text>
                    </View>
                    <Text
                      className={`text-[12.5px] font-bold ${
                        overallReached
                          ? "text-emerald-600 dark:text-emerald-300"
                          : "text-sky-600 dark:text-sky-300"
                      }`}
                    >
                      {overallPct.toFixed(1)}%
                    </Text>
                  </View>

                  <View className="mt-2 h-2.5 overflow-hidden rounded-full bg-slate-400/20 dark:bg-white/10">
                    <View
                      style={{
                        width: `${Math.round(progress.overallRatio * 100)}%`,
                        backgroundColor: overallReached ? "#10B981" : "#38BDF8",
                      }}
                      className="h-full rounded-full"
                    />
                  </View>

                  <Text className="mt-1.5 text-[10px] text-slate-400 dark:text-slate-500">
                    {overallReached
                      ? progress.totalEarnedCredits > progress.totalTargetCredits
                        ? `已超出毕业目标 ${(progress.totalEarnedCredits - progress.totalTargetCredits).toFixed(1)} 学分 · 共通过 ${progress.passedCourseCount} 门`
                        : `已达成毕业目标 · 共通过 ${progress.passedCourseCount} 门`
                      : `距离毕业还差 ${progress.overallRemainingCredits} 学分 · 共通过 ${progress.passedCourseCount} 门`}
                    {progress.dedupedRetakeCount > 0
                      ? ` · 已去重 ${progress.dedupedRetakeCount} 条重修`
                      : ""}
                  </Text>
                </View>
              )}

              {/* 各课程类型分类进度条 */}
              <View className="mt-3 gap-2.5">
                {progress.categories.map((cat, idx) => {
                  const color = CATEGORY_COLORS[idx % CATEGORY_COLORS.length];
                  const hasTarget = cat.targetCredits > 0;
                  const reached = hasTarget && cat.earnedCredits >= cat.targetCredits;
                  const pct = hasTarget ? Math.round(cat.ratio * 100) : 0;
                  const barWidth = hasTarget
                    ? cat.earnedCredits > 0
                      ? Math.max(4, pct)
                      : 0
                    : 0;

                  return (
                    <View key={cat.typeId}>
                      <View className="flex-row items-center justify-between gap-2">
                        <View className="flex-1 flex-row items-center gap-1.5">
                          <View
                            style={{ backgroundColor: color }}
                            className="h-2 w-2 rounded-full"
                          />
                          <Text
                            numberOfLines={1}
                            className="flex-shrink text-[11.5px] font-semibold text-slate-700 dark:text-slate-200"
                          >
                            {cat.typeName}
                          </Text>
                          <Text className="text-[10px] text-slate-400 dark:text-slate-500">
                            {cat.passedCourseCount} 门
                          </Text>
                        </View>

                        {hasTarget ? (
                          <View className="flex-row items-center gap-1.5">
                            <Text className="text-[11px] font-semibold text-slate-600 dark:text-slate-300">
                              {cat.earnedCredits} / {cat.targetCredits}
                            </Text>
                            <Text
                              className={`text-[10px] font-bold ${
                                reached
                                  ? "text-emerald-600 dark:text-emerald-300"
                                  : "text-slate-400 dark:text-slate-500"
                              }`}
                            >
                              {reached ? "已达标" : `差 ${cat.remainingCredits}`}
                            </Text>
                          </View>
                        ) : (
                          <Pressable onPress={openEditor} hitSlop={6}>
                            <Text className="text-[10.5px] text-slate-400 dark:text-slate-500">
                              已获 {cat.earnedCredits} 学分 · 未设目标
                            </Text>
                          </Pressable>
                        )}
                      </View>

                      <View className="mt-1 h-2 overflow-hidden rounded-full bg-slate-400/15 dark:bg-white/[0.08]">
                        {hasTarget ? (
                          <View
                            style={{
                              width: `${barWidth}%`,
                              backgroundColor: reached ? "#10B981" : color,
                            }}
                            className="h-full rounded-full"
                          />
                        ) : null}
                      </View>
                    </View>
                  );
                })}
              </View>
            </View>
          ) : null}
        </View>
      </GlassContainer>

      {/* 配置毕业学分目标弹窗 */}
      <Modal
        visible={editorOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setEditorOpen(false)}
      >
        <GlassTargetProvider>
          <View className="flex-1 justify-end bg-black/45">
            <Pressable
              className="flex-1"
              onPress={() => setEditorOpen(false)}
            />
            <KeyboardAvoidingView
              behavior={Platform.OS === "ios" ? "padding" : undefined}
            >
              <Animated.View
                entering={FadeInDown.springify()}
                exiting={FadeOutDown}
              >
                <GlassContainer
                  variant="sheet"
                  radius={32}
                  borderOpacity={0.3}
                  style={{ maxHeight: maxSheetH, paddingBottom: 20 }}
                >
                  <ScrollView
                    className="px-5 pt-5"
                    keyboardShouldPersistTaps="handled"
                  >
                    <View className="mb-3 flex-row items-center justify-between">
                      <View className="flex-1 pr-2">
                        <Text className="text-[17px] font-bold text-slate-800 dark:text-white">
                          配置毕业学分目标
                        </Text>
                        <Text className="mt-0.5 text-[11px] text-slate-500 dark:text-slate-400">
                          按培养方案设置各课程类型要求，已自动去重重修学分
                        </Text>
                      </View>
                      <Pressable
                        onPress={() => setEditorOpen(false)}
                        className="h-8 w-8 items-center justify-center rounded-full bg-white/25 dark:bg-white/[0.08]"
                      >
                        <Ionicons name="close" size={16} color="#94A3B8" />
                      </Pressable>
                    </View>

                    {/* 快捷方案预设 */}
                    <Text className="mb-1.5 text-[11px] font-semibold text-slate-500 dark:text-slate-400">
                      快捷总学分方案（一键填充分类参考值，可再微调）
                    </Text>
                    <View className="mb-4 flex-row flex-wrap gap-2">
                      {TOTAL_PRESETS.map((preset) => (
                        <Pressable
                          key={preset}
                          accessibilityRole="button"
                          onPress={() => applyPresetToDraft(preset)}
                          className="rounded-full border border-sky-400/40 bg-sky-400/12 px-3 py-1.5"
                        >
                          <Text className="text-[11px] font-semibold text-sky-600 dark:text-sky-300">
                            {preset} 学分
                          </Text>
                        </Pressable>
                      ))}
                    </View>

                    {/* 各类课程目标输入 */}
                    <Text className="mb-2 text-[11px] font-semibold text-slate-500 dark:text-slate-400">
                      各课程类型目标学分
                    </Text>
                    <View className="gap-2.5">
                      {gradeTypes.map((t, idx) => {
                        const color =
                          CATEGORY_COLORS[idx % CATEGORY_COLORS.length];
                        const cat = progress.categories.find(
                          (c) => c.typeId === t.id,
                        );
                        const val = draftInputs[t.id] ?? "";
                        return (
                          <View
                            key={t.id}
                            className="flex-row items-center rounded-2xl border border-white/25 bg-white/25 px-3.5 py-2.5 dark:border-white/10 dark:bg-white/[0.06]"
                          >
                            <View
                              style={{ backgroundColor: color }}
                              className="mr-2.5 h-2.5 w-2.5 rounded-full"
                            />
                            <View className="flex-1 pr-2">
                              <Text
                                numberOfLines={1}
                                className="text-[13px] font-semibold text-slate-800 dark:text-white"
                              >
                                {t.name}
                              </Text>
                              <Text className="text-[10px] text-slate-400 dark:text-slate-500">
                                当前已获 {cat?.earnedCredits ?? 0} 学分
                              </Text>
                            </View>
                            <TextInput
                              accessibilityLabel={`${t.name} 目标学分`}
                              value={val}
                              onChangeText={(text) =>
                                setDraftInputs((prev) => ({
                                  ...prev,
                                  [t.id]: text,
                                }))
                              }
                              keyboardType="decimal-pad"
                              maxLength={6}
                              placeholder="未设"
                              placeholderTextColor="rgba(148,163,184,0.7)"
                              className="w-20 rounded-xl border border-white/30 bg-white/60 px-2.5 py-1.5 text-right text-[13px] font-bold text-slate-800 dark:border-white/10 dark:bg-white/[0.08] dark:text-white"
                            />
                            <Text className="ml-1.5 text-[10.5px] text-slate-400 dark:text-slate-500">
                              学分
                            </Text>
                          </View>
                        );
                      })}
                    </View>

                    {/* 可选总目标覆写 */}
                    <View className="mt-4">
                      <Text className="mb-1.5 text-[11px] font-semibold text-slate-500 dark:text-slate-400">
                        总毕业学分目标（可选，留空自动按各类之和计算）
                      </Text>
                      <TextInput
                        accessibilityLabel="总毕业学分目标"
                        value={draftTotalInput}
                        onChangeText={setDraftTotalInput}
                        keyboardType="decimal-pad"
                        maxLength={6}
                        placeholder={
                          draftCategorySum > 0
                            ? `自动求和：${draftCategorySum} 学分`
                            : "如 160（也可仅填总目标）"
                        }
                        placeholderTextColor="rgba(148,163,184,0.7)"
                        className="rounded-2xl border border-white/30 bg-white/50 px-3.5 py-2.5 text-[13.5px] font-semibold text-slate-800 dark:border-white/10 dark:bg-white/[0.07] dark:text-slate-100"
                      />
                    </View>

                    <View className="mt-4 flex-row gap-2">
                      {progress.hasTargets ? (
                        <Pressable
                          accessibilityRole="button"
                          onPress={clearAllTargets}
                          className="items-center justify-center rounded-2xl border border-rose-400/35 bg-rose-400/10 px-3.5 py-3"
                        >
                          <Text className="text-[12px] font-semibold text-rose-500 dark:text-rose-300">
                            清空
                          </Text>
                        </Pressable>
                      ) : null}
                      <Pressable
                        accessibilityRole="button"
                        onPress={() => setEditorOpen(false)}
                        className="flex-1 items-center rounded-2xl border border-white/30 bg-white/20 py-3 dark:border-white/10 dark:bg-white/[0.06]"
                      >
                        <Text className="text-[12.5px] font-semibold text-slate-600 dark:text-slate-300">
                          取消
                        </Text>
                      </Pressable>
                      <Pressable
                        accessibilityRole="button"
                        onPress={saveTargets}
                        className="flex-[2] items-center rounded-2xl bg-sky-500/90 py-3"
                      >
                        <Text className="text-[13px] font-bold text-white">
                          保存毕业目标
                        </Text>
                      </Pressable>
                    </View>
                  </ScrollView>
                </GlassContainer>
              </Animated.View>
            </KeyboardAvoidingView>
          </View>
        </GlassTargetProvider>
      </Modal>
    </>
  );
}
