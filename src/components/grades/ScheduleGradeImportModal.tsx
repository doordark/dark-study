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
  View,
} from "react-native";
import Animated, { FadeInDown } from "react-native-reanimated";

import { GlassContainer } from "@/components/GlassContainer";
import { useSettings } from "@/store/useSettings";
import { useActiveSchedule, useStore } from "@/store/useStore";
import type { GradeRecord, SemesterKind } from "@/types";
import {
  buildScheduleGradeCandidates,
  deriveGpa,
  detectScoreType,
  GRADE_SEMESTERS,
  gradeDuplicateKey,
  normalizeGradeCourseName,
  semesterLabel,
} from "@/utils/grades";

export interface ScheduleGradeImportModalProps {
  defaultYearId: string;
  defaultSemester: SemesterKind;
  onClose: () => void;
}

export function ScheduleGradeImportModal({
  defaultYearId,
  defaultSemester,
  onClose,
}: ScheduleGradeImportModalProps) {
  const activeSchedule = useActiveSchedule();
  const grades = useStore((s) => s.grades);
  const gradeYears = useStore((s) => s.gradeYears);
  const gradeTypes = useStore((s) => s.gradeTypes);
  const setActiveGradeYear = useStore((s) => s.setActiveGradeYear);
  const setActiveGradeSemester = useStore((s) => s.setActiveGradeSemester);
  const gpaScale = useSettings((s) => s.gpaScale);

  const [scheduleYearId, setScheduleYearId] = useState<string>(defaultYearId);
  const [scheduleSemester, setScheduleSemester] =
    useState<SemesterKind>(defaultSemester);
  const [scheduleTypeId, setScheduleTypeId] = useState<string>(
    () => gradeTypes[0]?.id ?? "required",
  );
  const [scheduleOverwrite, setScheduleOverwrite] = useState(false);
  const [scheduleSelection, setScheduleSelection] = useState<
    Record<string, boolean>
  >({});
  const [scheduleScores, setScheduleScores] = useState<Record<string, string>>(
    {},
  );
  const [scheduleRowTypes, setScheduleRowTypes] = useState<
    Record<string, string>
  >({});

  const yearName = (id: string) =>
    gradeYears.find((y) => y.id === id)?.name ?? "未分学年";
  const typeName = (id: string) =>
    gradeTypes.find((t) => t.id === id)?.name ?? "未分类";

  const effectiveScheduleYearId =
    scheduleYearId && gradeYears.some((y) => y.id === scheduleYearId)
      ? scheduleYearId
      : defaultYearId;
  const effectiveScheduleTypeId =
    scheduleTypeId && gradeTypes.some((t) => t.id === scheduleTypeId)
      ? scheduleTypeId
      : (gradeTypes[0]?.id ?? "required");

  const scheduleCandidates = useMemo(
    () =>
      buildScheduleGradeCandidates(
        activeSchedule,
        grades,
        effectiveScheduleYearId,
        scheduleSemester,
        effectiveScheduleTypeId,
      ),
    [
      activeSchedule,
      grades,
      effectiveScheduleYearId,
      scheduleSemester,
      effectiveScheduleTypeId,
    ],
  );

  const isCandidateSelected = (name: string, alreadyExists: boolean) => {
    const key = normalizeGradeCourseName(name);
    return scheduleSelection[key] ?? !alreadyExists;
  };

  const selectedScheduleCandidates = scheduleCandidates.filter((c) =>
    isCandidateSelected(c.name, c.alreadyExists),
  );
  const selectedExistingCount = selectedScheduleCandidates.filter(
    (c) => c.alreadyExists,
  ).length;
  const allCandidatesSelected =
    scheduleCandidates.length > 0 &&
    selectedScheduleCandidates.length === scheduleCandidates.length;

  const toggleScheduleCandidate = (name: string, alreadyExists: boolean) => {
    const key = normalizeGradeCourseName(name);
    setScheduleSelection((prev) => {
      const current = prev[key] ?? !alreadyExists;
      return { ...prev, [key]: !current };
    });
  };

  const toggleAllScheduleCandidates = () => {
    const nextValue = !allCandidatesSelected;
    const nextMap: Record<string, boolean> = {};
    for (const c of scheduleCandidates) {
      nextMap[normalizeGradeCourseName(c.name)] = nextValue;
    }
    setScheduleSelection(nextMap);
  };

  const cycleCandidateType = (name: string) => {
    if (gradeTypes.length <= 1) return;
    const key = normalizeGradeCourseName(name);
    setScheduleRowTypes((prev) => {
      const current = prev[key] ?? effectiveScheduleTypeId;
      const idx = gradeTypes.findIndex((t) => t.id === current);
      const next = gradeTypes[(idx + 1) % gradeTypes.length];
      return { ...prev, [key]: next.id };
    });
  };

  const submitScheduleImport = () => {
    if (!effectiveScheduleYearId) {
      Alert.alert("请先创建学年", "先点击上方「+ 学年」创建归属学年。");
      return;
    }
    if (!selectedScheduleCandidates.length) {
      Alert.alert("请选择课程", "至少勾选一门课表课程后再导入。");
      return;
    }

    const existingByKey = new Map(
      grades.map((g) => [gradeDuplicateKey(g.yearId, g.semester, g.name), g]),
    );

    const items: Omit<GradeRecord, "id">[] = [];
    for (const candidate of selectedScheduleCandidates) {
      const key = normalizeGradeCourseName(candidate.name);
      const rawScore = (scheduleScores[key] ?? "").trim();
      const rowType = scheduleRowTypes[key] ?? effectiveScheduleTypeId;

      if (!rawScore) {
        const existing =
          candidate.alreadyExists && scheduleOverwrite
            ? existingByKey.get(
                gradeDuplicateKey(
                  effectiveScheduleYearId,
                  scheduleSemester,
                  candidate.name,
                ),
              )
            : undefined;
        items.push({
          name: candidate.name,
          credit: candidate.credit,
          scoreType: existing?.scoreType ?? "numeric",
          score: existing?.score ?? "",
          gpa: existing?.gpa ?? null,
          yearId: effectiveScheduleYearId,
          semester: scheduleSemester,
          type: rowType,
        });
        continue;
      }

      const scoreType = detectScoreType(rawScore);
      if (scoreType === "numeric") {
        const num = Number(rawScore);
        if (!Number.isFinite(num) || num < 0 || num > 100) {
          Alert.alert(
            "分数格式不正确",
            `「${candidate.name}」的百分制分数需在 0 ~ 100 之间，或留空待填。`,
          );
          return;
        }
      }
      const gpa = deriveGpa(scoreType, rawScore, gpaScale);
      items.push({
        name: candidate.name,
        credit: candidate.credit,
        scoreType,
        score: rawScore,
        gpa,
        yearId: effectiveScheduleYearId,
        semester: scheduleSemester,
        type: rowType,
      });
    }

    const mode = scheduleOverwrite ? "overwriteDuplicates" : "skipDuplicates";
    const result = useStore.getState().upsertGrades(items, mode);
    onClose();
    setActiveGradeYear(effectiveScheduleYearId);
    setActiveGradeSemester(scheduleSemester);
    const summaryParts = [
      result.added > 0 ? `新增 ${result.added} 门` : null,
      result.updated > 0 ? `更新 ${result.updated} 门` : null,
      result.skipped > 0 ? `跳过已有 ${result.skipped} 门` : null,
    ].filter(Boolean);
    Alert.alert(
      "课表结课导入完成",
      `已归入「${yearName(effectiveScheduleYearId)} · ${semesterLabel(scheduleSemester)}」${
        summaryParts.length ? `（${summaryParts.join("，")}）` : ""
      }。留空分数的课程可随时点击补录。`,
    );
  };

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        className="flex-1 justify-end bg-black/45"
      >
        <Pressable className="flex-1" onPress={onClose} />
        <Animated.View entering={FadeInDown.springify()}>
          <GlassContainer
            variant="sheet"
            radius={32}
            intensity={62}
            borderOpacity={0.3}
            style={{ maxHeight: "88%", paddingBottom: 20 }}
          >
            <View className="px-5 pt-5">
              <View className="flex-row items-center justify-between">
                <View className="flex-1 pr-2">
                  <Text className="text-[17px] font-bold text-slate-800 dark:text-white">
                    从课表一键结课导入
                  </Text>
                  <Text className="mt-0.5 text-[11px] text-slate-500 dark:text-slate-400">
                    来源课表：{activeSchedule.name} · 自动合并多时段同名课程
                  </Text>
                </View>
                <Pressable
                  onPress={onClose}
                  className="h-8 w-8 items-center justify-center rounded-full bg-white/25 dark:bg-white/[0.08]"
                >
                  <Ionicons name="close" size={16} color="#94A3B8" />
                </Pressable>
              </View>

              {/* 目标学年 / 学期 / 默认类型 */}
              <View className="mt-3 gap-2">
                <View className="flex-row items-center">
                  <Text className="mr-2 text-[10.5px] font-semibold text-slate-500 dark:text-slate-400">
                    归入学年
                  </Text>
                  <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    contentContainerStyle={{ gap: 6 }}
                    className="flex-1"
                  >
                    {gradeYears.map((y) => {
                      const on = y.id === effectiveScheduleYearId;
                      return (
                        <Pressable
                          key={y.id}
                          onPress={() => setScheduleYearId(y.id)}
                          className={`rounded-full px-3 py-1 ${
                            on
                              ? "bg-sky-500/85"
                              : "bg-white/25 dark:bg-white/[0.08]"
                          }`}
                        >
                          <Text
                            className={`text-[10.5px] font-semibold ${
                              on
                                ? "text-white"
                                : "text-slate-600 dark:text-slate-300"
                            }`}
                          >
                            {y.name}
                          </Text>
                        </Pressable>
                      );
                    })}
                  </ScrollView>
                </View>

                <View className="flex-row items-center">
                  <Text className="mr-2 text-[10.5px] font-semibold text-slate-500 dark:text-slate-400">
                    归入学期
                  </Text>
                  <View className="flex-1 flex-row gap-1.5">
                    {GRADE_SEMESTERS.map((s) => {
                      const on = s.kind === scheduleSemester;
                      return (
                        <Pressable
                          key={s.kind}
                          onPress={() => setScheduleSemester(s.kind)}
                          className={`flex-1 items-center rounded-xl py-1.5 ${
                            on
                              ? "bg-sky-500/85"
                              : "bg-white/25 dark:bg-white/[0.08]"
                          }`}
                        >
                          <Text
                            className={`text-[10.5px] font-semibold ${
                              on
                                ? "text-white"
                                : "text-slate-600 dark:text-slate-300"
                            }`}
                          >
                            {s.label}
                          </Text>
                        </Pressable>
                      );
                    })}
                  </View>
                </View>

                <View className="flex-row items-center">
                  <Text className="mr-2 text-[10.5px] font-semibold text-slate-500 dark:text-slate-400">
                    默认类型
                  </Text>
                  <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    contentContainerStyle={{ gap: 6 }}
                    className="flex-1"
                  >
                    {gradeTypes.map((t) => {
                      const on = t.id === effectiveScheduleTypeId;
                      return (
                        <Pressable
                          key={t.id}
                          onPress={() => setScheduleTypeId(t.id)}
                          className={`rounded-full px-3 py-1 ${
                            on
                              ? "bg-violet-500/85"
                              : "bg-white/25 dark:bg-white/[0.08]"
                          }`}
                        >
                          <Text
                            className={`text-[10.5px] font-semibold ${
                              on
                                ? "text-white"
                                : "text-slate-600 dark:text-slate-300"
                            }`}
                          >
                            {t.name}
                          </Text>
                        </Pressable>
                      );
                    })}
                  </ScrollView>
                </View>
              </View>

              {/* 全选 / 去重模式栏 */}
              {scheduleCandidates.length > 0 ? (
                <View className="mt-3 flex-row items-center justify-between">
                  <Text className="text-[10.5px] text-slate-500 dark:text-slate-400">
                    共 {scheduleCandidates.length} 门课 · 已选{" "}
                    {selectedScheduleCandidates.length} 门
                  </Text>
                  <View className="flex-row items-center gap-2">
                    {selectedExistingCount > 0 ? (
                      <Pressable
                        onPress={() => setScheduleOverwrite((v) => !v)}
                        className={`rounded-full px-2.5 py-1 ${
                          scheduleOverwrite
                            ? "bg-amber-500/20"
                            : "bg-white/25 dark:bg-white/[0.08]"
                        }`}
                      >
                        <Text
                          className={`text-[10px] font-semibold ${
                            scheduleOverwrite
                              ? "text-amber-600 dark:text-amber-300"
                              : "text-slate-500 dark:text-slate-400"
                          }`}
                        >
                          已有：{scheduleOverwrite ? "覆盖更新" : "自动跳过"}
                        </Text>
                      </Pressable>
                    ) : null}
                    <Pressable
                      onPress={toggleAllScheduleCandidates}
                      hitSlop={6}
                    >
                      <Text className="text-[10.5px] font-semibold text-sky-600 dark:text-sky-300">
                        {allCandidatesSelected ? "取消全选" : "全选"}
                      </Text>
                    </Pressable>
                  </View>
                </View>
              ) : null}

              {/* 候选课程列表 */}
              {scheduleCandidates.length === 0 ? (
                <View className="my-6 items-center rounded-2xl border border-dashed border-slate-400/25 px-4 py-6">
                  <Ionicons
                    name="calendar-clear-outline"
                    size={24}
                    color="#94A3B8"
                  />
                  <Text className="mt-2 text-center text-[11.5px] text-slate-400 dark:text-slate-500">
                    当前课表「{activeSchedule.name}」暂无课程，先在首页导入或添加课程即可一键结课
                  </Text>
                </View>
              ) : (
                <ScrollView
                  style={{ maxHeight: 300 }}
                  className="mt-2"
                  contentContainerStyle={{ gap: 8, paddingBottom: 4 }}
                  keyboardShouldPersistTaps="handled"
                >
                  {scheduleCandidates.map((candidate) => {
                    const key = normalizeGradeCourseName(candidate.name);
                    const checked = isCandidateSelected(
                      candidate.name,
                      candidate.alreadyExists,
                    );
                    const scoreVal = scheduleScores[key] ?? "";
                    const rowTypeId =
                      scheduleRowTypes[key] ?? effectiveScheduleTypeId;
                    return (
                      <View
                        key={key}
                        className={`rounded-2xl border px-3 py-2.5 ${
                          checked
                            ? "border-sky-400/45 bg-sky-400/10"
                            : "border-white/25 bg-white/20 dark:border-white/[0.08] dark:bg-white/[0.04]"
                        }`}
                      >
                        <View className="flex-row items-center gap-2">
                          <Pressable
                            accessibilityRole="checkbox"
                            accessibilityState={{ checked }}
                            accessibilityLabel={`勾选 ${candidate.name}`}
                            onPress={() =>
                              toggleScheduleCandidate(
                                candidate.name,
                                candidate.alreadyExists,
                              )
                            }
                            hitSlop={6}
                            className="py-1 pr-0.5"
                          >
                            <Ionicons
                              name={checked ? "checkbox" : "square-outline"}
                              size={18}
                              color={checked ? "#38BDF8" : "#94A3B8"}
                            />
                          </Pressable>
                          <View className="flex-1">
                            <Pressable
                              onPress={() =>
                                toggleScheduleCandidate(
                                  candidate.name,
                                  candidate.alreadyExists,
                                )
                              }
                              className="flex-row items-center gap-1.5"
                            >
                              <Text
                                numberOfLines={1}
                                className="flex-shrink text-[12.5px] font-semibold text-slate-800 dark:text-white"
                              >
                                {candidate.name}
                              </Text>
                              {candidate.alreadyExists ? (
                                <View className="rounded-full bg-amber-400/20 px-1.5 py-0.5">
                                  <Text className="text-[9px] font-bold text-amber-600 dark:text-amber-300">
                                    本学期已有
                                  </Text>
                                </View>
                              ) : null}
                            </Pressable>
                            <View className="mt-0.5 flex-row items-center gap-2">
                              <Text className="text-[10px] text-slate-500 dark:text-slate-400">
                                {candidate.credit != null
                                  ? `${candidate.credit} 学分`
                                  : "学分待补"}
                              </Text>
                              <Pressable
                                accessibilityRole="button"
                                accessibilityLabel={`切换 ${candidate.name} 课程类型`}
                                onPress={() =>
                                  cycleCandidateType(candidate.name)
                                }
                                hitSlop={6}
                                className="rounded-md bg-white/30 px-1.5 py-0.5 dark:bg-white/[0.08]"
                              >
                                <Text className="text-[9.5px] font-semibold text-violet-600 dark:text-violet-300">
                                  {typeName(rowTypeId)}
                                </Text>
                              </Pressable>
                            </View>
                          </View>

                          <TextInput
                            accessibilityLabel={`${candidate.name} 快捷分数`}
                            value={scoreVal}
                            onChangeText={(text) =>
                              setScheduleScores((prev) => ({
                                ...prev,
                                [key]: text,
                              }))
                            }
                            placeholder="待填/85/A"
                            placeholderTextColor="#94A3B8"
                            maxLength={12}
                            className="w-24 rounded-xl border border-white/30 bg-white/55 px-2.5 py-1.5 text-right text-[12px] font-semibold text-slate-800 dark:border-white/10 dark:bg-white/[0.08] dark:text-white"
                          />
                        </View>
                      </View>
                    );
                  })}
                </ScrollView>
              )}

              <Text className="mt-2 text-[10px] text-slate-400 dark:text-slate-500">
                留空分数会以「待填」导入，不计入绩点与已获学分；点击紫色标签可切换单科类型
              </Text>

              <View className="mt-3 flex-row gap-2">
                <Pressable
                  accessibilityRole="button"
                  onPress={onClose}
                  className="flex-1 items-center rounded-2xl border border-white/30 bg-white/20 py-2.5 dark:border-white/10 dark:bg-white/[0.06]"
                >
                  <Text className="text-[12.5px] font-semibold text-slate-600 dark:text-slate-300">
                    取消
                  </Text>
                </Pressable>
                <Pressable
                  accessibilityRole="button"
                  disabled={!selectedScheduleCandidates.length}
                  onPress={submitScheduleImport}
                  className={`flex-[2] items-center rounded-2xl bg-sky-500/90 py-2.5 ${
                    !selectedScheduleCandidates.length ? "opacity-45" : ""
                  }`}
                >
                  <Text className="text-[12.5px] font-bold text-white">
                    导入 {selectedScheduleCandidates.length} 门课程
                  </Text>
                </Pressable>
              </View>
            </View>
          </GlassContainer>
        </Animated.View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

export default ScheduleGradeImportModal;
