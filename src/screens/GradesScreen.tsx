import Ionicons from "@expo/vector-icons/Ionicons";
import { router } from "expo-router";
import React, { useMemo, useRef, useState } from "react";
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

import { Backdrop } from "@/components/Backdrop";
import { GlassContainer } from "@/components/GlassContainer";
import { GradeAnalyticsCard } from "@/components/GradeAnalyticsCard";
import {
  GradeEditorPanel,
  GradeRuleEditor,
  GradeYearEditor,
} from "@/components/GradeEditorPanel";
import { GradeProjection } from "@/components/GradeProjection";
import { GraduationProgressCard } from "@/components/GraduationProgressCard";
import { PasteImportModal } from "@/components/PasteImportModal";
import {
  runTextImportTask,
  startMediaImport,
  type ImportFrom,
} from "@/services/importRunner";
import { useSettings } from "@/store/useSettings";
import { useActiveSchedule, useStore } from "@/store/useStore";
import type {
  GpaScaleId,
  GradeRecord,
  GradeRetakePolicy,
  GradeRule,
  GradeScoreType,
  GradeYear,
  SemesterKind,
} from "@/types";
import {
  buildScheduleGradeCandidates,
  calcGradeStats,
  deriveGpa,
  detectScoreType,
  formatCourseGpa,
  formatGpa,
  formatWeightedScore,
  getGpaScaleMeta,
  getRetakePolicyMeta,
  GPA_SCALES,
  GRADE_SEMESTERS,
  gradeDuplicateKey,
  isGradeIncluded,
  normalizeGradeCourseName,
  resolveEffectiveGrades,
  resolveRetakePolicy,
  semesterLabel,
} from "@/utils/grades";

/** "all" = 该范围下的汇总页，SemesterKind = 单个学期 */
type SemTab = "all" | SemesterKind;
type SortKey = "default" | "gpa" | "score" | "credit";
type FilterKey = "all" | "missingCredit" | "missingGpa" | "excluded" | string;

const SCORE_TYPE_HINT: Record<GradeScoreType, string> = {
  numeric: "百分制",
  letter: "等级制",
  text: "文字等级",
};

const SORT_LABELS: Record<SortKey, string> = {
  default: "默认排序",
  gpa: "按绩点↓",
  score: "按分数↓",
  credit: "按学分↓",
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
  const recalculateGradesGpa = useStore((s) => s.recalculateGradesGpa);
  const addGradeRule = useStore((s) => s.addGradeRule);
  const updateGradeRule = useStore((s) => s.updateGradeRule);
  const removeGradeRule = useStore((s) => s.removeGradeRule);
  const gpaScale = useSettings((s) => s.gpaScale);
  const setGpaScale = useSettings((s) => s.setGpaScale);
  const activeSchedule = useActiveSchedule();

  const [yearScope, setYearScope] = useState<string>("all");
  const [semTab, setSemTab] = useState<SemTab>("all");
  const [editorVisible, setEditorVisible] = useState(false);
  const [editingGrade, setEditingGrade] = useState<GradeRecord | undefined>();
  const [ruleVisible, setRuleVisible] = useState(false);
  const [editingRule, setEditingRule] = useState<GradeRule | undefined>();
  const [yearVisible, setYearVisible] = useState(false);
  const [editingYear, setEditingYear] = useState<GradeYear | undefined>();
  const [importSheet, setImportSheet] = useState(false);
  const [pasteOpen, setPasteOpen] = useState(false);
  const [scalePickerOpen, setScalePickerOpen] = useState(false);
  const [projectionOpen, setProjectionOpen] = useState(false);
  const [analyticsOpen, setAnalyticsOpen] = useState(false);

  /** 从课表一键结课导入弹窗状态 */
  const [scheduleImportOpen, setScheduleImportOpen] = useState(false);
  const [scheduleYearId, setScheduleYearId] = useState<string>("");
  const [scheduleSemester, setScheduleSemester] =
    useState<SemesterKind>("fall");
  const [scheduleTypeId, setScheduleTypeId] = useState<string>("required");
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

  /** 搜索、排序与快捷筛选 */
  const [searchQuery, setSearchQuery] = useState("");
  const [sortBy, setSortBy] = useState<SortKey>("default");
  const [filterKey, setFilterKey] = useState<FilterKey>("all");

  /** 导入面板内用户可自由选择的目标学年和默认学期 */
  const [importYearOverride, setImportYearOverride] = useState<string | null>(
    null,
  );
  const [importSemOverride, setImportSemOverride] =
    useState<SemesterKind | null>(null);

  /** 勾选编辑模式 */
  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const longPressed = useRef(false);

  const activeRule =
    gradeRules.find((r) => r.id === activeGradeRuleId) ?? gradeRules[0];
  const scaleMeta = getGpaScaleMeta(gpaScale);

  const currentYear = gradeYears.find((y) => y.id === yearScope);
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

  const effectiveScope = useMemo(
    () => resolveEffectiveGrades(activeRule, scopedGrades, gradeYears),
    [activeRule, scopedGrades, gradeYears],
  );

  const stats = useMemo(
    () => calcGradeStats(activeRule, scopedGrades, gradeYears),
    [activeRule, scopedGrades, gradeYears],
  );

  const visibleGrades = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    const filtered = scopedGrades.filter((g) => {
      if (q && !g.name.toLowerCase().includes(q)) return false;
      if (filterKey === "all") return true;
      if (filterKey === "missingCredit") {
        return g.credit == null || g.credit <= 0;
      }
      if (filterKey === "missingGpa") {
        return g.gpa == null || !Number.isFinite(g.gpa);
      }
      if (filterKey === "excluded") {
        return (
          (activeRule != null && !isGradeIncluded(activeRule, g)) ||
          effectiveScope.overriddenIds.has(g.id)
        );
      }
      return g.type === filterKey;
    });

    if (sortBy === "default") return filtered;
    const copy = [...filtered];
    copy.sort((a, b) => {
      if (sortBy === "gpa") return (b.gpa ?? -1) - (a.gpa ?? -1);
      if (sortBy === "credit") return (b.credit ?? -1) - (a.credit ?? -1);
      const sa =
        a.scoreType === "numeric" && a.score.trim() ? Number(a.score) : -1;
      const sb =
        b.scoreType === "numeric" && b.score.trim() ? Number(b.score) : -1;
      if (sb !== sa) return sb - sa;
      return (b.gpa ?? -1) - (a.gpa ?? -1);
    });
    return copy;
  }, [
    scopedGrades,
    searchQuery,
    filterKey,
    sortBy,
    activeRule,
    effectiveScope,
  ]);

  const yearName = (id: string) =>
    gradeYears.find((y) => y.id === id)?.name ?? "未分学年";
  const typeName = (id: string) =>
    gradeTypes.find((t) => t.id === id)?.name ?? "未分类";

  const defaultTargetYearId =
    currentYear?.id ??
    (gradeYears.some((y) => y.id === activeGradeYearId)
      ? activeGradeYearId
      : (gradeYears[0]?.id ?? ""));
  const defaultSemester: SemesterKind =
    semScope === "all" ? activeGradeSemester : semScope;

  const importYearId =
    importYearOverride && gradeYears.some((y) => y.id === importYearOverride)
      ? importYearOverride
      : defaultTargetYearId;
  const importSemester = importSemOverride ?? defaultSemester;
  const importYearName = yearName(importYearId);

  const effectiveScheduleYearId =
    scheduleYearId && gradeYears.some((y) => y.id === scheduleYearId)
      ? scheduleYearId
      : defaultTargetYearId;
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

  const openScheduleImport = () => {
    setImportSheet(false);
    setScheduleYearId(defaultTargetYearId);
    setScheduleSemester(
      semScope === "all" ? (activeSchedule.kind ?? defaultSemester) : semScope,
    );
    setScheduleTypeId(gradeTypes[0]?.id ?? "required");
    setScheduleOverwrite(false);
    setScheduleSelection({});
    setScheduleScores({});
    setScheduleRowTypes({});
    setScheduleImportOpen(true);
  };

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
    setScheduleImportOpen(false);
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

  const openImportSheet = () => {
    setImportYearOverride(defaultTargetYearId);
    setImportSemOverride(defaultSemester);
    setImportSheet(true);
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

  const handleSelectScale = (next: GpaScaleId) => {
    setScalePickerOpen(false);
    if (next === gpaScale) return;
    setGpaScale(next);
    const meta = getGpaScaleMeta(next);
    if (!grades.length) return;
    Alert.alert(
      `已切换为「${meta.label}」`,
      "是否按新绩点制重新换算现有成绩的绩点？（仅重算有原始分数的课程）",
      [
        { text: "保持原绩点", style: "cancel" },
        {
          text: "立即重算",
          onPress: () => {
            const count = recalculateGradesGpa(next);
            Alert.alert(
              "重算完成",
              count > 0
                ? `已按「${meta.label}」更新 ${count} 门课程的绩点。`
                : "所有成绩的绩点均已与新制式一致。",
            );
          },
        },
      ],
    );
  };

  const selectedSet = useMemo(() => new Set(selectedIds), [selectedIds]);
  const allSelected =
    visibleGrades.length > 0 &&
    visibleGrades.every((g) => selectedSet.has(g.id));
  const selectedGrades = scopedGrades.filter((g) => selectedSet.has(g.id));
  const adjustableSelected = useMemo(
    () =>
      activeRule
        ? selectedGrades.filter(
            (g) => !activeRule.excludedTypes.includes(g.type),
          )
        : [],
    [activeRule, selectedGrades],
  );
  // 与 toggleSelectedInclusion 严格对齐，避免按钮文案与实际操作相反
  const selectedAllExcluded =
    activeRule != null &&
    adjustableSelected.length > 0 &&
    adjustableSelected.every((g) =>
      activeRule.excludedCourseIds.includes(g.id),
    );

  const toggleSelectMode = () => {
    setSelectedIds([]);
    setSelectMode((v) => !v);
  };

  const toggleSelect = (id: string) =>
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );

  const toggleSelectAll = () =>
    setSelectedIds(allSelected ? [] : visibleGrades.map((g) => g.id));

  const toggleSelectedInclusion = () => {
    if (!activeRule || !selectedGrades.length) return;
    if (!adjustableSelected.length) {
      Alert.alert(
        "这些课程已按类型排除",
        "可在「编辑规则」里调整不计入的课程类型",
      );
      return;
    }
    const adjustableIds = new Set(adjustableSelected.map((g) => g.id));
    updateGradeRule(activeRule.id, {
      excludedCourseIds: selectedAllExcluded
        ? activeRule.excludedCourseIds.filter((id) => !adjustableIds.has(id))
        : [...new Set([...activeRule.excludedCourseIds, ...adjustableIds])],
    });
  };

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
    retakePolicy: GradeRetakePolicy;
    clearManual: boolean;
  }) => {
    if (editingRule) {
      updateGradeRule(editingRule.id, {
        name: data.name,
        excludedTypes: data.excludedTypes,
        retakePolicy: data.retakePolicy,
        ...(data.clearManual ? { excludedCourseIds: [] } : {}),
      });
    } else {
      const id = addGradeRule(data.name);
      updateGradeRule(id, {
        excludedTypes: data.excludedTypes,
        retakePolicy: data.retakePolicy,
      });
    }
    setRuleVisible(false);
  };

  const startGradeImport = (from: ImportFrom) => {
    setImportSheet(false);
    setActiveGradeYear(importYearId);
    setActiveGradeSemester(importSemester);
    if (from === "paste") {
      setPasteOpen(true);
      return;
    }
    void startMediaImport("grades", from, {
      yearId: importYearId,
      yearName: importYearName,
      semester: importSemester,
    });
  };

  const cycleSort = () => {
    const order: SortKey[] = ["default", "gpa", "score", "credit"];
    setSortBy(order[(order.indexOf(sortBy) + 1) % order.length]);
  };

  const scopeLabel = currentYear
    ? semScope === "all"
      ? `${currentYear.name} · 学年总成绩`
      : `${currentYear.name} · ${semesterLabel(semScope)}`
    : "全部学年总成绩";
  const ruleName = activeRule?.name ?? "默认规则";
  const activeRetakePolicy = resolveRetakePolicy(activeRule?.retakePolicy);
  const activeRetakeMeta = getRetakePolicyMeta(activeRetakePolicy);
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
          activeRetakePolicy !== "all"
            ? `${activeRetakeMeta.shortLabel}${
                stats.overriddenCount > 0
                  ? `（覆盖 ${stats.overriddenCount} 条）`
                  : ""
              }`
            : null,
        ]
          .filter(Boolean)
          .join(" · ") || "全部课程计入";

  const overviewRows: {
    key: string;
    label: string;
    stats: ReturnType<typeof calcGradeStats>;
    onPress: () => void;
  }[] = currentYear
    ? GRADE_SEMESTERS.map((s) => ({
        key: s.kind,
        label: s.label,
        stats: calcGradeStats(
          activeRule,
          grades.filter(
            (g) => g.yearId === currentYear.id && g.semester === s.kind,
          ),
          gradeYears,
        ),
        onPress: () => switchSem(s.kind),
      }))
    : gradeYears.map((y) => ({
        key: y.id,
        label: y.name,
        stats: calcGradeStats(
          activeRule,
          grades.filter((g) => g.yearId === y.id),
          gradeYears,
        ),
        onPress: () => switchYear(y.id),
      }));

  const overviewTitle = currentYear ? "各学期绩点" : "各学年绩点";

  return (
    <View className="flex-1">
      <Backdrop>
        <ScrollView
          contentContainerStyle={{
            paddingHorizontal: 20,
            paddingBottom: selectMode ? 110 : 40,
          }}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {/* 头部 */}
          <Animated.View entering={FadeInDown.springify()} className="pt-4">
            <Pressable
              onPress={() => router.back()}
              className="mb-3 h-9 w-9 items-center justify-center rounded-full bg-white/20 dark:bg-white/[0.07]"
            >
              <Ionicons name="chevron-back" size={18} color="#94A3B8" />
            </Pressable>
            <View className="flex-row items-center justify-between">
              <Text className="text-[24px] font-extrabold text-slate-800 dark:text-white">
                成绩
              </Text>
              <Pressable
                onPress={() => setScalePickerOpen(true)}
                className="flex-row items-center rounded-full border border-sky-400/35 bg-sky-400/12 px-3 py-1.5"
              >
                <Ionicons
                  name="swap-horizontal-outline"
                  size={12}
                  color="#38BDF8"
                />
                <Text className="ml-1 text-[11px] font-semibold text-sky-600 dark:text-sky-300">
                  {scaleMeta.shortLabel}
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
                      onPress={() => setProjectionOpen(true)}
                      className="rounded-full bg-sky-400/15 px-2.5 py-1"
                    >
                      <Text className="text-[10.5px] font-semibold text-sky-600 dark:text-sky-300">
                        绩点试算
                      </Text>
                    </Pressable>
                    <Pressable
                      onPress={() => {
                        setEditingRule(activeRule);
                        setRuleVisible(true);
                      }}
                      className="flex-row items-center rounded-full bg-white/25 px-2.5 py-1 dark:bg-white/[0.07]"
                    >
                      <Ionicons
                        name="options-outline"
                        size={12}
                        color="#38BDF8"
                      />
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
                        加权绩点（满绩 {scaleMeta.maxGpa}）
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
                    onPress={openImportSheet}
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
                      setFilterKey((prev) =>
                        prev === "missingGpa" ? "all" : "missingGpa",
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
                      setFilterKey((prev) =>
                        prev === "missingCredit" ? "all" : "missingCredit",
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

                {/* 快捷分析与课表结课导入入口 */}
                <View className="mt-3 flex-row gap-2">
                  <Pressable
                    accessibilityRole="button"
                    onPress={() => setAnalyticsOpen((v) => !v)}
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
                    onPress={openScheduleImport}
                    className="flex-1 flex-row items-center justify-center rounded-xl border border-sky-400/35 bg-sky-400/12 py-2"
                  >
                    <Ionicons
                      name="calendar-outline"
                      size={13}
                      color="#38BDF8"
                    />
                    <Text className="ml-1.5 text-[11px] font-semibold text-sky-600 dark:text-sky-300">
                      从课表结课导入
                    </Text>
                  </Pressable>
                </View>
              </View>
            </GlassContainer>
          </Animated.View>

          {/* 趋势图与学分审计（可折叠） */}
          {analyticsOpen ? (
            <Animated.View entering={FadeInDown.springify()}>
              <GradeAnalyticsCard
                grades={grades}
                gradeYears={gradeYears}
                gradeTypes={gradeTypes}
                rule={activeRule}
                scale={gpaScale}
                onCollapse={() => setAnalyticsOpen(false)}
              />
            </Animated.View>
          ) : null}

          {/* 毕业学分进度追踪（可折叠） */}
          <Animated.View
            entering={FadeInDown.delay(105).springify()}
            className="mt-3"
          >
            <GraduationProgressCard
              grades={grades}
              gradeTypes={gradeTypes}
              rule={activeRule}
              gradeYears={gradeYears}
            />
          </Animated.View>

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

          {/* 成绩列表 */}
          <Animated.View
            entering={FadeInDown.delay(190).springify()}
            className="mt-3"
          >
            <GlassContainer radius={24} intensity={42} borderOpacity={0.22}>
              <View className="px-4 py-4">
                <View className="flex-row items-center justify-between">
                  <Text className="text-[14px] font-bold text-slate-800 dark:text-white">
                    {scopeLabel}
                  </Text>
                  <View className="flex-row items-center gap-1.5">
                    <Pressable
                      onPress={cycleSort}
                      className="rounded-full bg-white/25 px-2.5 py-1 dark:bg-white/[0.07]"
                    >
                      <Text className="text-[10px] font-semibold text-slate-600 dark:text-slate-300">
                        {SORT_LABELS[sortBy]}
                      </Text>
                    </Pressable>
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

                {/* 搜索与快捷筛选（有成绩时展示） */}
                {scopedGrades.length > 0 ? (
                  <View className="mt-2.5">
                    <View className="flex-row items-center rounded-xl border border-white/25 bg-white/30 px-2.5 py-1.5 dark:border-white/10 dark:bg-white/[0.06]">
                      <Ionicons name="search" size={13} color="#94A3B8" />
                      <TextInput
                        value={searchQuery}
                        onChangeText={setSearchQuery}
                        placeholder="搜索课程名…"
                        placeholderTextColor="#94A3B8"
                        className="ml-1.5 flex-1 py-0 text-[12px] text-slate-800 dark:text-slate-100"
                      />
                      {searchQuery ? (
                        <Pressable
                          onPress={() => setSearchQuery("")}
                          hitSlop={8}
                        >
                          <Ionicons
                            name="close-circle"
                            size={14}
                            color="#94A3B8"
                          />
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
                        { key: "all", label: `全部 (${scopedGrades.length})` },
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
                            onPress={() => setFilterKey(chip.key)}
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
                      已选 {selectedIds.length} 门 · 底部悬浮栏可批量操作
                    </Text>
                    <Pressable onPress={toggleSelectAll} hitSlop={8}>
                      <Text className="text-[9.5px] font-semibold text-sky-500 dark:text-sky-300">
                        {allSelected ? "取消全选" : "全选当前列表"}
                      </Text>
                    </Pressable>
                  </View>
                ) : null}

                {visibleGrades.length === 0 ? (
                  <View className="items-center py-8">
                    <Ionicons
                      name="document-text-outline"
                      size={28}
                      color="#94A3B8"
                    />
                    <Text className="mt-2 text-[12px] text-slate-400 dark:text-slate-500">
                      {scopedGrades.length === 0
                        ? "还没有成绩，先导入或手动添加"
                        : "当前筛选条件下没有匹配的成绩"}
                    </Text>
                    {scopedGrades.length > 0 &&
                    (filterKey !== "all" || searchQuery) ? (
                      <Pressable
                        onPress={() => {
                          setFilterKey("all");
                          setSearchQuery("");
                        }}
                        className="mt-2 rounded-full bg-sky-500/15 px-3 py-1"
                      >
                        <Text className="text-[11px] font-semibold text-sky-600 dark:text-sky-300">
                          清除筛选
                        </Text>
                      </Pressable>
                    ) : null}
                  </View>
                ) : (
                  <View className="mt-2">
                    {visibleGrades.map((g) => {
                      const ruleIncluded =
                        activeRule != null
                          ? isGradeIncluded(activeRule, g)
                          : true;
                      const isOverridden =
                        ruleIncluded && effectiveScope.overriddenIds.has(g.id);
                      const included = ruleIncluded && !isOverridden;
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
                              <View className="flex-row items-center gap-1.5">
                                <Text
                                  numberOfLines={1}
                                  className={`flex-shrink text-[13px] font-semibold ${
                                    included
                                      ? "text-slate-800 dark:text-white"
                                      : "text-slate-400 dark:text-slate-500"
                                  }`}
                                >
                                  {g.name}
                                </Text>
                                {isOverridden ? (
                                  <View className="rounded-full border border-amber-400/35 bg-amber-400/15 px-1.5 py-0.5">
                                    <Text className="text-[9px] font-bold text-amber-600 dark:text-amber-300">
                                      重修已覆盖
                                    </Text>
                                  </View>
                                ) : null}
                              </View>
                              <Text className="mt-0.5 text-[10.5px] text-slate-400 dark:text-slate-500">
                                {meta}
                              </Text>
                            </View>
                            <View
                              className={`ml-2 items-end ${
                                included ? "" : "opacity-55"
                              }`}
                            >
                              <Text
                                className={`text-[16px] font-bold ${
                                  g.score
                                    ? "text-slate-700 dark:text-slate-200"
                                    : "text-amber-500 dark:text-amber-300"
                                }`}
                              >
                                {g.score || "待填"}
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
              </View>
            </GlassContainer>
          </Animated.View>
        </ScrollView>

        {/* 勾选模式底部悬浮操作条：课程很多时无需滑到底 */}
        {selectMode ? (
          <View className="absolute bottom-4 left-5 right-5">
            <GlassContainer radius={22} intensity={68} borderOpacity={0.28}>
              <View className="flex-row items-center gap-2 px-3 py-2.5">
                {semScope !== "all" ? (
                  <Pressable
                    onPress={clearSemester}
                    className="items-center rounded-xl border border-red-400/40 bg-red-50/80 px-3 py-2.5 dark:border-red-500/25 dark:bg-red-950/35"
                  >
                    <Text className="text-[11px] font-semibold text-red-600 dark:text-red-300">
                      清空学期
                    </Text>
                  </Pressable>
                ) : null}
                <Pressable
                  onPress={toggleSelectedInclusion}
                  disabled={!selectedIds.length}
                  className={`flex-1 items-center rounded-xl border border-white/30 py-2.5 ${
                    !selectedIds.length
                      ? "bg-white/10 dark:bg-white/[0.04]"
                      : "bg-white/30 dark:bg-white/[0.08]"
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
                  disabled={!selectedIds.length}
                  className={`flex-1 items-center rounded-xl bg-red-500/85 py-2.5 ${
                    !selectedIds.length ? "opacity-45" : ""
                  }`}
                >
                  <Text className="text-[11px] font-bold text-white">
                    删除 ({selectedIds.length})
                  </Text>
                </Pressable>
              </View>
            </GlassContainer>
          </View>
        ) : null}
      </Backdrop>

      {editorVisible ? (
        <GradeEditorPanel
          visible
          grade={editingGrade}
          defaultYearId={defaultTargetYearId}
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

      {/* 绩点换算制式选择 */}
      <Modal
        visible={scalePickerOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setScalePickerOpen(false)}
      >
        <View className="flex-1 justify-end bg-black/45">
          <Pressable
            className="flex-1"
            onPress={() => setScalePickerOpen(false)}
          />
          <Animated.View entering={FadeInDown.springify()}>
            <GlassContainer
              variant="sheet"
              radius={32}
              intensity={62}
              borderOpacity={0.3}
              style={{ paddingBottom: 24 }}
            >
              <View className="px-5 pt-5">
                <View className="flex-row items-center justify-between">
                  <Text className="text-[17px] font-bold text-slate-800 dark:text-white">
                    选择学校绩点制式
                  </Text>
                  <Pressable
                    onPress={() => setScalePickerOpen(false)}
                    className="h-8 w-8 items-center justify-center rounded-full bg-white/25 dark:bg-white/[0.08]"
                  >
                    <Ionicons name="close" size={16} color="#94A3B8" />
                  </Pressable>
                </View>
                <Text className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">
                  影响手动录入换算、识别缺绩点补全以及绩点目标试算反推
                </Text>
                <View className="mt-3 gap-2">
                  {GPA_SCALES.map((item) => {
                    const on = item.id === gpaScale;
                    return (
                      <Pressable
                        key={item.id}
                        onPress={() => handleSelectScale(item.id)}
                        className={`rounded-2xl border px-3.5 py-2.5 ${
                          on
                            ? "border-sky-400/70 bg-sky-400/18"
                            : "border-white/25 bg-white/25 dark:border-white/10 dark:bg-white/[0.06]"
                        }`}
                      >
                        <View className="flex-row items-center justify-between">
                          <Text className="text-[13px] font-bold text-slate-800 dark:text-white">
                            {item.label}
                          </Text>
                          {on ? (
                            <Ionicons
                              name="checkmark-circle"
                              size={16}
                              color="#38BDF8"
                            />
                          ) : null}
                        </View>
                        <Text className="mt-0.5 text-[10.5px] text-slate-500 dark:text-slate-400">
                          {item.summary}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
              </View>
            </GlassContainer>
          </Animated.View>
        </View>
      </Modal>

      {/* 导入成绩面板：支持自由选择目标学年/学期 + 相册/拍照/文档/粘贴 */}
      <Modal
        visible={importSheet}
        transparent
        animationType="fade"
        onRequestClose={() => setImportSheet(false)}
      >
        <View className="flex-1 justify-end bg-black/45">
          <Pressable
            className="flex-1"
            onPress={() => setImportSheet(false)}
          />
          <Animated.View entering={FadeInDown.springify()}>
            <GlassContainer
              variant="sheet"
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
                  支持照片（多选 9 张）、Excel(.xlsx)/CSV/HTML 文档或直接粘贴文本
                </Text>

                {/* 目标学年与默认学期选择 */}
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
                        const on = y.id === importYearId;
                        return (
                          <Pressable
                            key={y.id}
                            onPress={() => setImportYearOverride(y.id)}
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
                      默认学期
                    </Text>
                    <View className="flex-1 flex-row gap-1.5">
                      {GRADE_SEMESTERS.map((s) => {
                        const on = s.kind === importSemester;
                        return (
                          <Pressable
                            key={s.kind}
                            onPress={() => setImportSemOverride(s.kind)}
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
                </View>

                <View className="mt-4 flex-row gap-x-2">
                  {[
                    {
                      key: "image" as ImportFrom,
                      icon: "images" as const,
                      label: "相册",
                    },
                    {
                      key: "camera" as ImportFrom,
                      icon: "camera" as const,
                      label: "拍照",
                    },
                    {
                      key: "text" as ImportFrom,
                      icon: "document-text" as const,
                      label: "表格/文档",
                    },
                    {
                      key: "paste" as ImportFrom,
                      icon: "clipboard-outline" as const,
                      label: "粘贴文本",
                    },
                  ].map((it) => (
                    <Pressable
                      key={it.key}
                      onPress={() => startGradeImport(it.key)}
                      className="flex-1 items-center rounded-2xl border border-white/25 bg-white/25 py-3 dark:border-white/10 dark:bg-white/[0.06]"
                    >
                      <Ionicons name={it.icon} size={18} color="#38BDF8" />
                      <Text className="mt-1 text-[10.5px] font-semibold text-slate-600 dark:text-slate-300">
                        {it.label}
                      </Text>
                    </Pressable>
                  ))}
                </View>

                <Pressable
                  onPress={openScheduleImport}
                  className="mt-3 flex-row items-center justify-center rounded-2xl border border-sky-400/45 bg-sky-400/12 py-2.5"
                >
                  <Ionicons
                    name="calendar-outline"
                    size={15}
                    color="#38BDF8"
                  />
                  <Text className="ml-1.5 text-[12px] font-bold text-sky-600 dark:text-sky-300">
                    从当前课表一键结课导入
                  </Text>
                </Pressable>

                <Pressable
                  onPress={() => {
                    setImportSheet(false);
                    openCreate();
                  }}
                  className="mt-2.5 flex-row items-center justify-center rounded-2xl border border-sky-400/40 py-2.5"
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

      <PasteImportModal
        visible={pasteOpen}
        kind="grades"
        subtitle={`将归入「${importYearName} · ${semesterLabel(importSemester)}」（若文本自带学期会优先使用）`}
        onClose={() => setPasteOpen(false)}
        onSubmit={(text) =>
          void runTextImportTask("grades", text, {
            sourceLabel: "粘贴文本",
            yearId: importYearId,
            yearName: importYearName,
            semester: importSemester,
          })
        }
      />

      {projectionOpen ? (
        <GradeProjection
          grades={scopedGrades}
          types={gradeTypes}
          rule={activeRule}
          scope={scopeLabel}
          onClose={() => setProjectionOpen(false)}
        />
      ) : null}

      {/* 从课表一键结课导入 */}
      <Modal
        visible={scheduleImportOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setScheduleImportOpen(false)}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : undefined}
          className="flex-1 justify-end bg-black/45"
        >
          <Pressable
            className="flex-1"
            onPress={() => setScheduleImportOpen(false)}
          />
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
                    onPress={() => setScheduleImportOpen(false)}
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
                  <View className="my-6 items-center rounded-2xl border border-dashed border-slate-400/25 py-6 px-4">
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
                    onPress={() => setScheduleImportOpen(false)}
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
    </View>
  );
}
