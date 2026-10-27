import { Ionicons } from "@expo/vector-icons";
import * as Network from "expo-network";
import { router } from "expo-router";
import React, { useMemo, useState } from "react";
import { Alert, Modal, Pressable, ScrollView, Text, View } from "react-native";
import Animated, { FadeInDown } from "react-native-reanimated";

import { Backdrop } from "@/components/Backdrop";
import { GlassContainer } from "@/components/GlassContainer";
import {
  GradeEditorPanel,
  GradeRuleEditor,
  GradeYearEditor,
} from "@/components/GradeEditorPanel";
import {
  pickImagesFromLibrary,
  pickImageFromCamera,
  pickTextDocument,
} from "@/services/fileImport";
import { recognizeGrades, recognizeGradesBatch } from "@/services/ai";
import { recognizeGradesFromTextOffline } from "@/services/offlineImport";
import { useImportTask } from "@/store/useImportTask";
import { useSettings } from "@/store/useSettings";
import { useStore } from "@/store/useStore";
import type {
  GradeDraft,
  GradeRecord,
  GradeRule,
  GradeScoreType,
  GradeYear,
  SemesterKind,
} from "@/types";
import {
  calcGradeStats,
  formatCourseGpa,
  formatGpa,
  GRADE_SEMESTERS,
  isGradeIncluded,
  semesterLabel,
} from "@/utils/grades";

type From = "image" | "camera" | "text";
type ImageSource = { imageBase64: string; mimeType: string; uri: string };
/** 相册可多选：images 至少一张；表格文件仍是单份 */
type Source = { images: ImageSource[] } | { text: string };

/** "all" = 该范围下的汇总页，SemesterKind = 单个学期 */
type SemTab = "all" | SemesterKind;

async function isOnline(): Promise<boolean> {
  try {
    const state = await Network.getNetworkStateAsync();
    return !!state.isConnected && state.isInternetReachable !== false;
  } catch {
    return true;
  }
}

const SCORE_TYPE_HINT: Record<GradeScoreType, string> = {
  numeric: "百分制",
  letter: "等级制",
  text: "文字等级",
};

export function GradesScreen() {
  const grades = useStore((s) => s.grades);
  const gradeYears = useStore((s) => s.gradeYears);
  const activeGradeYearId = useStore((s) => s.activeGradeYearId);
  const gradeTypes = useStore((s) => s.gradeTypes);
  const gradeRules = useStore((s) => s.gradeRules);
  const activeGradeRuleId = useStore((s) => s.activeGradeRuleId);
  const activeGradeSemester = useStore((s) => s.activeGradeSemester);
  const setActiveGradeRule = useStore((s) => s.setActiveGradeRule);
  const setActiveGradeSemester = useStore((s) => s.setActiveGradeSemester);
  const setActiveGradeYear = useStore((s) => s.setActiveGradeYear);
  const addGradeYear = useStore((s) => s.addGradeYear);
  const updateGradeYear = useStore((s) => s.updateGradeYear);
  const removeGradeYear = useStore((s) => s.removeGradeYear);
  const addGrade = useStore((s) => s.addGrade);
  const updateGrade = useStore((s) => s.updateGrade);
  const removeGrade = useStore((s) => s.removeGrade);
  const removeGrades = useStore((s) => s.removeGrades);
  const addGradeRule = useStore((s) => s.addGradeRule);
  const updateGradeRule = useStore((s) => s.updateGradeRule);
  const removeGradeRule = useStore((s) => s.removeGradeRule);
  const apiKey = useSettings((s) => s.apiKey);

  /** "all" = 全部学年总成绩，其余为某个学年 id */
  const [yearScope, setYearScope] = useState<string>("all");
  const [semTab, setSemTab] = useState<SemTab>("all");
  const [editorVisible, setEditorVisible] = useState(false);
  const [editingGrade, setEditingGrade] = useState<GradeRecord | undefined>();
  const [ruleVisible, setRuleVisible] = useState(false);
  const [editingRule, setEditingRule] = useState<GradeRule | undefined>();
  const [yearVisible, setYearVisible] = useState(false);
  const [editingYear, setEditingYear] = useState<GradeYear | undefined>();
  const [importSheet, setImportSheet] = useState(false);
  /** 勾选编辑模式：默认不显示勾选框，进入后才显示 */
  const [selectMode, setSelectMode] = useState(false);
  /** 勾选模式下选中的成绩 id：用于批量删除 / 调整计入规则 */
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  /** 长按进入勾选模式后，松手不再触发普通点击 */
  const longPressed = React.useRef(false);

  const activeRule =
    gradeRules.find((r) => r.id === activeGradeRuleId) ?? gradeRules[0];

  const currentYear = gradeYears.find((y) => y.id === yearScope);
  /** 全部学年视图下没有学期维度，只展示总成绩 */
  const semScope: SemTab = currentYear ? semTab : "all";

  const scopedGrades = useMemo(
    () =>
      grades.filter(
        (g) =>
          (!currentYear || g.yearId === currentYear.id) &&
          (semScope === "all" || g.semester === semScope),
      ),
    [grades, currentYear, semScope],
  );
  const stats = useMemo(
    () => calcGradeStats(activeRule, scopedGrades),
    [activeRule, scopedGrades],
  );

  const yearName = (id: string) =>
    gradeYears.find((y) => y.id === id)?.name ?? "未分学年";
  const typeName = (id: string) =>
    gradeTypes.find((t) => t.id === id)?.name ?? "未分类";

  /** 新成绩 / 识别结果归入的学年 */
  const targetYearId =
    currentYear?.id ??
    (gradeYears.some((y) => y.id === activeGradeYearId)
      ? activeGradeYearId
      : (gradeYears[0]?.id ?? ""));
  const targetYearName = yearName(targetYearId);
  const defaultSemester: SemesterKind =
    semScope === "all" ? activeGradeSemester : semScope;

  const switchYear = (id: string) => {
    setYearScope(id);
    setSemTab("all");
    setSelectMode(false);
    setSelectedIds([]);
    if (id !== "all") setActiveGradeYear(id);
  };

  const switchSem = (next: SemTab) => {
    setSemTab(next);
    setSelectMode(false);
    setSelectedIds([]);
    if (next !== "all") setActiveGradeSemester(next);
  };

  const openCreate = () => {
    setEditingGrade(undefined);
    setEditorVisible(true);
  };

  const openEdit = (grade: GradeRecord) => {
    setEditingGrade(grade);
    setEditorVisible(true);
  };

  const openYear = (year?: GradeYear) => {
    setEditingYear(year);
    setYearVisible(true);
  };

  const submitGrade = (data: Omit<GradeRecord, "id"> & { id?: string }) => {
    if (data.id) {
      const { id, ...rest } = data;
      updateGrade(id, rest);
    } else {
      addGrade(data);
    }
    setEditorVisible(false);
  };

  const saveYear = (name: string) => {
    if (editingYear) {
      updateGradeYear(editingYear.id, name);
    } else {
      switchYear(addGradeYear(name));
    }
    setYearVisible(false);
  };

  const deleteYear = () => {
    if (!editingYear) return;
    removeGradeYear(editingYear.id);
    if (yearScope === editingYear.id) setYearScope("all");
  };

  const selectedSet = useMemo(() => new Set(selectedIds), [selectedIds]);
  const allSelected =
    scopedGrades.length > 0 && selectedIds.length === scopedGrades.length;
  const selectedGrades = scopedGrades.filter((g) => selectedSet.has(g.id));
  const selectedAllExcluded =
    activeRule != null &&
    selectedGrades.length > 0 &&
    selectedGrades.every((g) => activeRule.excludedCourseIds.includes(g.id));

  const toggleSelectMode = () => {
    setSelectedIds([]);
    setSelectMode((v) => !v);
  };

  const toggleSelect = (id: string) =>
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );

  const toggleSelectAll = () =>
    setSelectedIds(allSelected ? [] : scopedGrades.map((g) => g.id));

  /** 勾选课程批量排除 / 恢复计入当前计算规则 */
  const toggleSelectedInclusion = () => {
    if (!activeRule || !selectedGrades.length) return;
    const adjustable = selectedGrades.filter(
      (g) => !activeRule.excludedTypes.includes(g.type),
    );
    if (!adjustable.length) {
      Alert.alert(
        "这些课程已按类型排除",
        "可在「编辑规则」里调整不计入的课程类型",
      );
      return;
    }
    const adjustableIds = new Set(adjustable.map((g) => g.id));
    const allOff = adjustable.every((g) =>
      activeRule.excludedCourseIds.includes(g.id),
    );
    updateGradeRule(activeRule.id, {
      excludedCourseIds: allOff
        ? activeRule.excludedCourseIds.filter((id) => !adjustableIds.has(id))
        : [...new Set([...activeRule.excludedCourseIds, ...adjustableIds])],
    });
  };

  /** 删除勾选的成绩（二次确认） */
  const deleteSelected = () => {
    if (!selectedIds.length) return;
    Alert.alert(
      "删除所选成绩",
      `将删除 ${selectedIds.length} 门成绩，删除后不可恢复。`,
      [
        { text: "取消", style: "cancel" },
        {
          text: "删除",
          style: "destructive",
          onPress: () => {
            removeGrades(selectedIds);
            setSelectedIds([]);
            setSelectMode(false);
          },
        },
      ],
    );
  };

  /** 一键清空当前学年下的这个学期（二次确认） */
  const clearSemester = () => {
    if (!currentYear || semScope === "all") return;
    const ids = scopedGrades.map((g) => g.id);
    if (!ids.length) return;
    Alert.alert(
      "清空本学期成绩",
      `将删除「${currentYear.name} · ${semesterLabel(semScope)}」的全部 ${ids.length} 门成绩，此操作不可恢复。`,
      [
        { text: "取消", style: "cancel" },
        {
          text: "清空",
          style: "destructive",
          onPress: () => {
            removeGrades(ids);
            setSelectedIds([]);
            setSelectMode(false);
          },
        },
      ],
    );
  };

  const saveRule = (data: {
    name: string;
    excludedTypes: string[];
    clearManual: boolean;
  }) => {
    if (editingRule) {
      updateGradeRule(editingRule.id, {
        name: data.name,
        excludedTypes: data.excludedTypes,
        ...(data.clearManual ? { excludedCourseIds: [] } : {}),
      });
    } else {
      const id = addGradeRule(data.name);
      updateGradeRule(id, { excludedTypes: data.excludedTypes });
    }
    setRuleVisible(false);
  };

  const startGradeTask = async (from: From) => {
    const task = useImportTask.getState();
    if (task.status === "analyzing") {
      task.setExpanded(true);
      return;
    }

    let source: Source | null = null;
    try {
      if (from === "text") {
        const doc = await pickTextDocument();
        source = doc ? { text: doc.text } : null;
      } else if (from === "image") {
        const imgs = await pickImagesFromLibrary();
        source = imgs.length
          ? {
              images: imgs.map((i) => ({
                imageBase64: i.base64,
                mimeType: i.mimeType,
                uri: i.uri,
              })),
            }
          : null;
      } else {
        const img = await pickImageFromCamera();
        source = img
          ? {
              images: [
                {
                  imageBase64: img.base64,
                  mimeType: img.mimeType,
                  uri: img.uri,
                },
              ],
            }
          : null;
      }
    } catch (e) {
      Alert.alert(
        "读取素材失败",
        e instanceof Error ? e.message : "请重试",
      );
      return;
    }
    if (!source) return;

    // 导入前先把当前学年 / 学期设为归属，识别结果统一落到这个学年
    setActiveGradeYear(targetYearId);
    if (semScope !== "all") setActiveGradeSemester(semScope);

    const count = "images" in source ? source.images.length : 0;
    task.open(
      "grades",
      from === "text" ? "文档" : count > 1 ? `${count} 张照片` : "照片",
    );
    try {
      const online = await isOnline();
      const useAI = online && !!apiKey;
      let recognized: GradeDraft[];
      let skipped = 0;

      if ("text" in source) {
        const runOfflineText = (): GradeDraft[] => {
          task.setPhase("离线模式：正在解析成绩表格…", 45);
          return recognizeGradesFromTextOffline(
            source.text,
            defaultSemester,
          );
        };
        if (useAI) {
          try {
            task.setPhase("AI 正在识别课程成绩…", 38);
            recognized = await recognizeGrades(
              { text: source.text },
              apiKey,
              defaultSemester,
            );
          } catch (aiError) {
            // 云端超时/失败时自动降级到本地，避免一直转圈
            task.setPhase("AI 识别未完成，正在切换本地离线识别…", 58);
            try {
              recognized = runOfflineText();
            } catch {
              throw aiError;
            }
          }
        } else {
          recognized = runOfflineText();
        }
      } else {
        const result = await recognizeGradesBatch(
          source.images,
          apiKey,
          defaultSemester,
          {
            useAI,
            onProgress: (cur, total) =>
              task.setPhase(
                useAI
                  ? `AI 正在识别第 ${cur}/${total} 张成绩单…`
                  : `离线模式：正在识别第 ${cur}/${total} 张…`,
                Math.round(18 + ((cur - 1) / total) * 62),
              ),
          },
        );
        recognized = result.grades;
        skipped = result.skipped;
      }

      if (!recognized.length) {
        task.fail("未识别到有效成绩，请更换图片或补充表格后重试");
        return;
      }
      const skipNote = skipped ? `（已跳过 ${skipped} 张无法识别的图片）` : "";
      task.complete(
        { type: "grades", grades: recognized, yearId: targetYearId },
        `${useAI ? "识别完成" : "离线识别完成"}：共 ${recognized.length} 条成绩${skipNote}，将导入到「${targetYearName}」，请确认`,
      );
    } catch (e) {
      task.fail(e instanceof Error ? e.message : "识别失败，请重试");
    }
  };

  const scopeLabel = currentYear
    ? semScope === "all"
      ? `${currentYear.name} · 学年总成绩`
      : `${currentYear.name} · ${semesterLabel(semScope)}`
    : "全部学年总成绩";
  const ruleName = activeRule?.name ?? "默认规则";
  const ruleHint =
    activeRule == null
      ? "全部课程计入"
      : [
          activeRule.excludedTypes.length
            ? `已排除 ${activeRule.excludedTypes
                .map((id) => typeName(id))
                .join("、")}`
            : null,
          activeRule.excludedCourseIds.length
            ? `手动排除 ${activeRule.excludedCourseIds.length} 门`
            : null,
        ]
          .filter(Boolean)
          .join(" · ") || "全部课程计入";

  /** 总览行：全部学年 -> 各学年；指定学年 -> 各学期 */
  const overviewRows: { key: string; label: string; stats: ReturnType<typeof calcGradeStats>; onPress: () => void }[] =
    currentYear
      ? GRADE_SEMESTERS.map((s) => ({
          key: s.kind,
          label: s.label,
          stats: calcGradeStats(
            activeRule,
            grades.filter(
              (g) => g.yearId === currentYear.id && g.semester === s.kind,
            ),
          ),
          onPress: () => switchSem(s.kind),
        }))
      : gradeYears.map((y) => ({
          key: y.id,
          label: y.name,
          stats: calcGradeStats(
            activeRule,
            grades.filter((g) => g.yearId === y.id),
          ),
          onPress: () => switchYear(y.id),
        }));

  const overviewTitle = currentYear ? "各学期绩点" : "各学年绩点";

  return (
    <View className="flex-1">
      <Backdrop>
        <ScrollView
          contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 40 }}
          showsVerticalScrollIndicator={false}
        >
          {/* 头部 */}
          <Animated.View entering={FadeInDown.springify()} className="pt-4">
            <Pressable
              onPress={() => router.back()}
              className="mb-3 h-9 w-9 items-center justify-center rounded-full bg-white/20 dark:bg-white/[0.07]"
            >
              <Ionicons name="chevron-back" size={18} color="#94A3B8" />
            </Pressable>
            <Text className="text-[24px] font-extrabold text-slate-800 dark:text-white">
              成绩
            </Text>
            <Text className="mt-1 text-[12px] text-slate-500 dark:text-slate-400">
              学年分组 · 上 / 下 / 短学期 · 学分加权绩点统计
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
                onPress={() => switchYear("all")}
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
                    onPress={() => switchYear(y.id)}
                    onLongPress={() => openYear(y)}
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
                onPress={() => openYear(undefined)}
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

          {/* 学期切换：选中某个学年后出现 */}
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
                      onPress={() => switchSem(item.key)}
                      className={`flex-1 items-center rounded-xl border py-2 ${
                        on
                          ? "border-sky-400/70 bg-sky-400/80"
                          : "border-white/30 bg-white/25 dark:border-white/10 dark:bg-white/[0.06]"
                      }`}
                    >
                      <Text
                        className={`text-[11px] font-bold ${
                          on
                            ? "text-white"
                            : "text-slate-600 dark:text-slate-300"
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
            <GlassContainer radius={28} intensity={48} borderOpacity={0.24} style={{ marginTop: 14 }}>
              <View className="px-5 py-4">
                <View className="flex-row items-center justify-between">
                  <Text className="max-w-[70%] text-[12px] font-semibold text-slate-500 dark:text-slate-400">
                    {scopeLabel} · 学分加权平均绩点
                  </Text>
                  <Pressable
                    onPress={() => {
                      setEditingRule(activeRule);
                      setRuleVisible(true);
                    }}
                    className="flex-row items-center rounded-full bg-white/25 px-2.5 py-1 dark:bg-white/[0.07]"
                  >
                    <Ionicons name="options-outline" size={12} color="#38BDF8" />
                    <Text className="ml-1 text-[10.5px] font-semibold text-sky-500 dark:text-sky-300">
                      编辑规则
                    </Text>
                  </Pressable>
                </View>

                <View className="mt-1 flex-row items-end justify-between">
                  <View className="flex-row items-end">
                    <Text className="text-[42px] font-extrabold text-slate-800 dark:text-white">
                      {formatGpa(stats.value)}
                    </Text>
                    <Text className="mb-2 ml-2 text-[11px] text-slate-400 dark:text-slate-500">
                      平均绩点
                    </Text>
                  </View>
                  <Pressable
                    onPress={() => setImportSheet(true)}
                    className="mb-1.5 flex-row items-center rounded-full bg-sky-500/15 px-3 py-1.5"
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

                <View className="mt-1 flex-row flex-wrap gap-x-4 gap-y-1">
                  <Text className="text-[11px] text-slate-500 dark:text-slate-400">
                    计入 {stats.count} 门
                  </Text>
                  <Text className="text-[11px] text-slate-500 dark:text-slate-400">
                    总学分 {stats.credits}
                  </Text>
                  <Text className="text-[11px] text-slate-500 dark:text-slate-400">
                    课程 {stats.total} 门
                  </Text>
                </View>
                {stats.missing > 0 ? (
                  <Text className="mt-1.5 text-[10px] text-amber-500 dark:text-amber-300">
                    有 {stats.missing} 门缺少有效绩点，未计入统计
                  </Text>
                ) : null}
                {stats.missingCredit > 0 ? (
                  <Text className="mt-1 text-[10px] text-amber-500 dark:text-amber-300">
                    有 {stats.missingCredit} 门缺学分，暂未计入加权绩点，点开课程可补填
                  </Text>
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
                          onPress={() => setActiveGradeRule(r.id)}
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
                      onPress={() => {
                        setEditingRule(undefined);
                        setRuleVisible(true);
                      }}
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
              </View>
            </GlassContainer>
          </Animated.View>

          {/* 总览：仅学年总成绩 / 全部学年时显示；具体学期下不占版面 */}
          {semScope === "all" ? (
            <Animated.View entering={FadeInDown.delay(120).springify()} className="mt-3">
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
                        {row.stats.count} 门 ·{" "}
                        {row.stats.credits > 0
                          ? `${row.stats.credits} 学分`
                          : "学分待补"}
                      </Text>
                      <Text className="w-10 text-right text-[13px] font-bold text-sky-500 dark:text-sky-300">
                        {formatGpa(row.stats.value)}
                      </Text>
                    </Pressable>
                  ))
                )}
              </View>
            </GlassContainer>
            </Animated.View>
          ) : null}

          {/* 成绩列表 */}
          <Animated.View entering={FadeInDown.delay(190).springify()} className="mt-3">
            <GlassContainer radius={24} intensity={42} borderOpacity={0.22}>
              <View className="px-4 py-4">
                <View className="flex-row items-center justify-between">
                  <Text className="text-[14px] font-bold text-slate-800 dark:text-white">
                    {scopeLabel}
                  </Text>
                  <View className="flex-row items-center">
                    <Text className="mr-2 text-[10.5px] text-slate-400 dark:text-slate-500">
                      {scopedGrades.length} 门
                    </Text>
                    <Pressable
                      onPress={toggleSelectMode}
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
                {selectMode ? (
                  <View className="mt-1.5 flex-row items-center">
                    <Text className="flex-1 text-[9.5px] text-slate-400 dark:text-slate-500">
                      已选 {selectedIds.length} 门 · 可批量删除或调整计入规则
                    </Text>
                    <Pressable onPress={toggleSelectAll} hitSlop={8}>
                      <Text className="text-[9.5px] font-semibold text-sky-500 dark:text-sky-300">
                        {allSelected ? "取消全选" : "全选"}
                      </Text>
                    </Pressable>
                  </View>
                ) : null}

                {scopedGrades.length === 0 ? (
                  <View className="items-center py-8">
                    <Ionicons name="document-text-outline" size={28} color="#94A3B8" />
                    <Text className="mt-2 text-[12px] text-slate-400 dark:text-slate-500">
                      还没有成绩，先导入或手动添加
                    </Text>
                  </View>
                ) : (
                  <View className="mt-1">
                    {scopedGrades.map((g) => {
                      const included =
                        activeRule != null
                          ? isGradeIncluded(activeRule, g)
                          : true;
                      const meta = [
                        typeName(g.type),
                        g.credit != null ? `${g.credit} 学分` : "学分待补",
                        SCORE_TYPE_HINT[g.scoreType],
                        !currentYear
                          ? `${yearName(g.yearId)} · ${semesterLabel(g.semester)}`
                          : semScope === "all"
                            ? semesterLabel(g.semester)
                            : null,
                      ]
                        .filter(Boolean)
                        .join(" · ");
                      return (
                        <View
                          key={g.id}
                          className="flex-row items-center border-t border-white/20 py-3 dark:border-white/[0.06]"
                        >
                          {selectMode ? (
                            <Pressable
                              onPress={() => toggleSelect(g.id)}
                              hitSlop={8}
                              className="mr-2.5"
                            >
                              <Ionicons
                                name={
                                  selectedSet.has(g.id)
                                    ? "checkbox"
                                    : "square-outline"
                                }
                                size={18}
                                color={
                                  selectedSet.has(g.id) ? "#38BDF8" : "#94A3B8"
                                }
                              />
                            </Pressable>
                          ) : null}
                          <Pressable
                            onPressIn={() => {
                              longPressed.current = false;
                            }}
                            onPress={() => {
                              if (longPressed.current) return;
                              if (selectMode) toggleSelect(g.id);
                              else openEdit(g);
                            }}
                            onLongPress={() => {
                              longPressed.current = true;
                              setSelectMode(true);
                              setSelectedIds((prev) =>
                                prev.includes(g.id) ? prev : [...prev, g.id],
                              );
                            }}
                            delayLongPress={320}
                            className="flex-1 flex-row items-center"
                          >
                            <View className="flex-1">
                              <Text
                                numberOfLines={1}
                                className={`text-[13px] font-semibold ${
                                  included
                                    ? "text-slate-800 dark:text-white"
                                    : "text-slate-400 dark:text-slate-500"
                                }`}
                              >
                                {g.name}
                              </Text>
                              <Text className="mt-0.5 text-[10.5px] text-slate-400 dark:text-slate-500">
                                {meta}
                              </Text>
                            </View>
                            <View className="ml-2 items-end">
                              <Text className="text-[16px] font-bold text-slate-700 dark:text-slate-200">
                                {g.score || "--"}
                              </Text>
                              <Text className="text-[10px] font-semibold text-sky-500 dark:text-sky-300">
                                {formatCourseGpa(g.gpa)} 绩点
                              </Text>
                            </View>
                          </Pressable>
                        </View>
                      );
                    })}
                  </View>
                )}

                {selectMode ? (
                  <View className="mt-3.5 flex-row gap-2.5">
                    {semScope !== "all" ? (
                      <Pressable
                        onPress={clearSemester}
                        hitSlop={12}
                        className="flex-1 items-center rounded-2xl border border-red-400/40 bg-red-50/80 py-2.5 dark:border-red-500/20 dark:bg-red-950/25"
                      >
                        <Text className="text-[11px] font-semibold text-red-600 dark:text-red-300">
                          清空本学期
                        </Text>
                      </Pressable>
                    ) : null}
                    <Pressable
                      onPress={toggleSelectedInclusion}
                      hitSlop={12}
                      disabled={!selectedIds.length}
                      className={`flex-1 items-center rounded-2xl border border-white/30 py-2.5 ${
                        !selectedIds.length
                          ? "bg-white/10 dark:bg-white/[0.04]"
                          : "bg-white/25 dark:bg-white/[0.07]"
                      }`}
                    >
                      <Text
                        className={`text-[11px] font-semibold ${
                          !selectedIds.length
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
                      onPress={deleteSelected}
                      hitSlop={12}
                      disabled={!selectedIds.length}
                      className={`flex-1 items-center rounded-2xl bg-red-500/85 py-2.5 ${
                        !selectedIds.length ? "opacity-45" : ""
                      }`}
                    >
                      <Text className="text-[11px] font-bold text-white">
                        删除选中
                      </Text>
                    </Pressable>
                  </View>
                ) : null}
              </View>
            </GlassContainer>
          </Animated.View>
        </ScrollView>
      </Backdrop>

      {editorVisible ? (
        <GradeEditorPanel
          visible
          grade={editingGrade}
          defaultYearId={targetYearId}
          defaultSemester={defaultSemester}
          onClose={() => setEditorVisible(false)}
          onSave={submitGrade}
          onDelete={removeGrade}
        />
      ) : null}

      {yearVisible ? (
        <GradeYearEditor
          visible
          year={editingYear}
          canDelete={gradeYears.length > 1}
          gradeCount={
            editingYear
              ? grades.filter((g) => g.yearId === editingYear.id).length
              : 0
          }
          onClose={() => setYearVisible(false)}
          onSave={saveYear}
          onDelete={deleteYear}
        />
      ) : null}

      {ruleVisible ? (
        <GradeRuleEditor
          visible
          rule={editingRule}
          canDelete={gradeRules.length > 1}
          onClose={() => setRuleVisible(false)}
          onSave={saveRule}
          onDelete={() => {
            if (editingRule) removeGradeRule(editingRule.id);
          }}
        />
      ) : null}

      {/* 导入成绩：从统计卡旁的按钮弹出上传方式 */}
      <Modal
        visible={importSheet}
        transparent
        animationType="fade"
        onRequestClose={() => setImportSheet(false)}
      >
        <View className="flex-1 justify-end bg-black/45">
          <Pressable className="flex-1" onPress={() => setImportSheet(false)} />
          <Animated.View entering={FadeInDown.springify()}>
            <GlassContainer
              radius={32}
              intensity={62}
              borderOpacity={0.3}
              style={{ paddingBottom: 22 }}
            >
              <View className="px-5 pt-5">
                <View className="flex-row items-center justify-between">
                  <Text className="text-[17px] font-bold text-slate-800 dark:text-white">
                    导入成绩
                  </Text>
                  <Pressable
                    onPress={() => setImportSheet(false)}
                    className="h-8 w-8 items-center justify-center rounded-full bg-white/25 dark:bg-white/[0.08]"
                  >
                    <Ionicons name="close" size={16} color="#94A3B8" />
                  </Pressable>
                </View>
                <Text className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">
                  归入 {targetYearName} · 拍照、相册（可多选 9
                  张）或表格文件。联网且有 API Key 时走 AI，否则自动本地离线识别
                </Text>

                <View className="mt-4 flex-row gap-x-2.5">
                  {[
                    {
                      key: "image" as From,
                      icon: "images" as const,
                      label: "相册",
                    },
                    {
                      key: "camera" as From,
                      icon: "camera" as const,
                      label: "拍照",
                    },
                    {
                      key: "text" as From,
                      icon: "document-text" as const,
                      label: "表格",
                    },
                  ].map((it) => (
                    <Pressable
                      key={it.key}
                      onPress={() => {
                        setImportSheet(false);
                        void startGradeTask(it.key);
                      }}
                      className="flex-1 items-center rounded-2xl border border-white/25 bg-white/25 py-3.5 dark:border-white/10 dark:bg-white/[0.06]"
                    >
                      <Ionicons name={it.icon} size={19} color="#38BDF8" />
                      <Text className="mt-1.5 text-[11.5px] font-semibold text-slate-600 dark:text-slate-300">
                        {it.label}
                      </Text>
                    </Pressable>
                  ))}
                </View>

                <Pressable
                  onPress={() => {
                    setImportSheet(false);
                    openCreate();
                  }}
                  className="mt-3 flex-row items-center justify-center rounded-2xl border border-sky-400/40 py-2.5"
                >
                  <Ionicons name="add" size={16} color="#38BDF8" />
                  <Text className="ml-1 text-[12px] font-bold text-sky-500 dark:text-sky-300">
                    手动添加成绩
                  </Text>
                </Pressable>
              </View>
            </GlassContainer>
          </Animated.View>
        </View>
      </Modal>
    </View>
  );
}
