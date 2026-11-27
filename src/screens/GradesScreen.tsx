import { router } from "expo-router";
import React, { Suspense, useCallback, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Platform,
  View,
  type ListRenderItemInfo,
} from "react-native";
import Animated, { FadeInDown } from "react-native-reanimated";

import { Backdrop } from "@/components/Backdrop";
import { GlassContainer } from "@/components/GlassContainer";
import { GradeRowCard } from "@/components/grades/GradeRowCard";
import {
  GradeBatchActionBar,
  GradeListEmptyCard,
  GradesHeaderSection,
  GraduationCollapsedCard,
  type FilterKey,
  type GradeOverviewRow,
  type SemTab,
  type SortKey,
} from "@/components/grades/GradesHeaderSection";
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
  GradeYear,
  SemesterKind,
} from "@/types";
import {
  calcGradeStats,
  computeGraduationProgress,
  getGpaScaleMeta,
  getRetakePolicyMeta,
  GRADE_SEMESTERS,
  isGradeIncluded,
  resolveEffectiveGrades,
  resolveRetakePolicy,
  semesterLabel,
} from "@/utils/grades";

const LazyGradeEditorPanel = React.lazy(() =>
  import("@/components/GradeEditorPanel").then((m) => ({
    default: m.GradeEditorPanel,
  })),
);
const LazyGradeRuleEditor = React.lazy(() =>
  import("@/components/GradeEditorPanel").then((m) => ({
    default: m.GradeRuleEditor,
  })),
);
const LazyGradeYearEditor = React.lazy(() =>
  import("@/components/GradeEditorPanel").then((m) => ({
    default: m.GradeYearEditor,
  })),
);
const LazyGradeAnalyticsCard = React.lazy(() =>
  import("@/components/GradeAnalyticsCard").then((m) => ({
    default: m.GradeAnalyticsCard,
  })),
);
const LazyGradeProjection = React.lazy(() =>
  import("@/components/GradeProjection").then((m) => ({
    default: m.GradeProjection,
  })),
);
const LazyPasteImportModal = React.lazy(() =>
  import("@/components/PasteImportModal").then((m) => ({
    default: m.PasteImportModal,
  })),
);
const LazyGraduationProgressCard = React.lazy(() =>
  import("@/components/GraduationProgressCard").then((m) => ({
    default: m.GraduationProgressCard,
  })),
);
const LazyScheduleGradeImportModal = React.lazy(
  () => import("@/components/grades/ScheduleGradeImportModal"),
);
const LazyGpaScalePickerModal = React.lazy(() =>
  import("@/components/grades/GradePickersModal").then((m) => ({
    default: m.GpaScalePickerModal,
  })),
);
const LazyGradeImportSheetModal = React.lazy(() =>
  import("@/components/grades/GradePickersModal").then((m) => ({
    default: m.GradeImportSheetModal,
  })),
);

function CardSuspenseFallback() {
  return (
    <GlassContainer radius={24} intensity={42} borderOpacity={0.22}>
      <View className="items-center justify-center py-6">
        <ActivityIndicator size="small" color="#38BDF8" />
      </View>
    </GlassContainer>
  );
}

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
  const graduationCreditTargets = useSettings(
    (s) => s.graduationCreditTargets,
  );
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
  const [graduationOpen, setGraduationOpen] = useState(false);
  const [scheduleImportOpen, setScheduleImportOpen] = useState(false);

  const [searchQuery, setSearchQuery] = useState("");
  const [sortBy, setSortBy] = useState<SortKey>("default");
  const [filterKey, setFilterKey] = useState<FilterKey>("all");

  const [importYearOverride, setImportYearOverride] = useState<string | null>(
    null,
  );
  const [importSemOverride, setImportSemOverride] =
    useState<SemesterKind | null>(null);

  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  const activeRule =
    gradeRules.find((r) => r.id === activeGradeRuleId) ?? gradeRules[0];
  const scaleMeta = getGpaScaleMeta(gpaScale);

  const currentYear = gradeYears.find((y) => y.id === yearScope);
  const semScope: SemTab = currentYear ? semTab : "all";

  const yearNameById = useMemo(
    () => new Map(gradeYears.map((y) => [y.id, y.name])),
    [gradeYears],
  );
  const typeNameById = useMemo(
    () => new Map(gradeTypes.map((t) => [t.id, t.name])),
    [gradeTypes],
  );

  const yearName = (id: string) => yearNameById.get(id) ?? "未分学年";
  const typeName = (id: string) => typeNameById.get(id) ?? "未分类";

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

  const graduationSummary = useMemo(() => {
    if (graduationOpen) return null;
    const baseRule = activeRule
      ? { ...activeRule, excludedTypes: [], excludedCourseIds: [] }
      : undefined;
    return computeGraduationProgress(
      grades,
      gradeTypes,
      graduationCreditTargets,
      baseRule,
      gradeYears,
    );
  }, [
    graduationOpen,
    grades,
    gradeTypes,
    graduationCreditTargets,
    activeRule,
    gradeYears,
  ]);

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

  const defaultTargetYearId =
    currentYear?.id ??
    (gradeYears.some((y) => y.id === activeGradeYearId)
      ? activeGradeYearId
      : (gradeYears[0]?.id ?? ""));
  const defaultSemester: SemesterKind =
    semScope === "all" ? activeGradeSemester : semScope;
  const scheduleImportDefaultSemester: SemesterKind =
    semScope === "all" ? (activeSchedule.kind ?? defaultSemester) : semScope;

  const importYearId =
    importYearOverride && gradeYears.some((y) => y.id === importYearOverride)
      ? importYearOverride
      : defaultTargetYearId;
  const importSemester = importSemOverride ?? defaultSemester;
  const importYearName = yearName(importYearId);

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

  const openScheduleImport = () => {
    setImportSheet(false);
    setScheduleImportOpen(true);
  };

  const openCreate = () => {
    setEditingGrade(undefined);
    setEditorVisible(true);
  };

  const openEdit = useCallback((grade: GradeRecord) => {
    setEditingGrade(grade);
    setEditorVisible(true);
  }, []);

  const openYear = (year?: GradeYear) => {
    setEditingYear(year);
    setYearVisible(true);
  };

  const openRuleEditor = (rule?: GradeRule) => {
    setEditingRule(rule);
    setRuleVisible(true);
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
  const selectedGrades = useMemo(
    () => scopedGrades.filter((g) => selectedSet.has(g.id)),
    [scopedGrades, selectedSet],
  );
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

  const toggleSelect = useCallback(
    (id: string) =>
      setSelectedIds((prev) =>
        prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
      ),
    [],
  );

  const handleLongPressSelect = useCallback((id: string) => {
    setSelectMode(true);
    setSelectedIds((prev) => (prev.includes(id) ? prev : [...prev, id]));
  }, []);

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

  const overviewRows: GradeOverviewRow[] = currentYear
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

  const keyExtractor = useCallback((item: GradeRecord) => item.id, []);

  const renderGradeItem = useCallback(
    ({ item: g }: ListRenderItemInfo<GradeRecord>) => {
      const ruleIncluded =
        activeRule != null ? isGradeIncluded(activeRule, g) : true;
      const isOverridden =
        ruleIncluded && effectiveScope.overriddenIds.has(g.id);
      const included = ruleIncluded && !isOverridden;
      const termLabel = !currentYear
        ? `${yearNameById.get(g.yearId) ?? "未分学年"} · ${semesterLabel(g.semester)}`
        : semScope === "all"
          ? semesterLabel(g.semester)
          : null;

      return (
        <GradeRowCard
          grade={g}
          typeLabel={typeNameById.get(g.type) ?? "未分类"}
          termLabel={termLabel}
          included={included}
          isOverridden={isOverridden}
          selectMode={selectMode}
          selected={selectedSet.has(g.id)}
          onPressEdit={openEdit}
          onToggleSelect={toggleSelect}
          onLongPressSelect={handleLongPressSelect}
        />
      );
    },
    [
      activeRule,
      effectiveScope,
      currentYear,
      semScope,
      yearNameById,
      typeNameById,
      selectMode,
      selectedSet,
      openEdit,
      toggleSelect,
      handleLongPressSelect,
    ],
  );

  const analyticsSlot = analyticsOpen ? (
    <Animated.View entering={FadeInDown.springify()} className="mt-3">
      <Suspense fallback={<CardSuspenseFallback />}>
        <LazyGradeAnalyticsCard
          grades={grades}
          gradeYears={gradeYears}
          gradeTypes={gradeTypes}
          rule={activeRule}
          scale={gpaScale}
          onCollapse={() => setAnalyticsOpen(false)}
        />
      </Suspense>
    </Animated.View>
  ) : null;

  const graduationSlot = (
    <Animated.View
      entering={FadeInDown.delay(105).springify()}
      className="mt-3"
    >
      {graduationOpen ? (
        <Suspense fallback={<CardSuspenseFallback />}>
          <LazyGraduationProgressCard
            grades={grades}
            gradeTypes={gradeTypes}
            rule={activeRule}
            gradeYears={gradeYears}
            defaultExpanded
          />
        </Suspense>
      ) : (
        <GraduationCollapsedCard
          summary={graduationSummary}
          onExpand={() => setGraduationOpen(true)}
        />
      )}
    </Animated.View>
  );

  const listHeader = (
    <GradesHeaderSection
      scaleShortLabel={scaleMeta.shortLabel}
      scaleMaxGpa={scaleMeta.maxGpa}
      onBack={() => router.back()}
      onOpenScalePicker={() => setScalePickerOpen(true)}
      gradeYears={gradeYears}
      yearScope={yearScope}
      currentYear={currentYear}
      semTab={semTab}
      semScope={semScope}
      scopeLabel={scopeLabel}
      onSwitchYear={switchYear}
      onSwitchSem={switchSem}
      onOpenYear={openYear}
      stats={stats}
      gradeRules={gradeRules}
      activeRule={activeRule}
      ruleName={ruleName}
      ruleHint={ruleHint}
      analyticsOpen={analyticsOpen}
      onSelectRule={setActiveGradeRule}
      onEditRule={openRuleEditor}
      onOpenProjection={() => setProjectionOpen(true)}
      onOpenImportSheet={openImportSheet}
      onToggleAnalytics={() => setAnalyticsOpen((v) => !v)}
      onOpenScheduleImport={openScheduleImport}
      analyticsSlot={analyticsSlot}
      graduationSlot={graduationSlot}
      overviewTitle={overviewTitle}
      overviewRows={overviewRows}
      scopedCount={scopedGrades.length}
      gradeTypes={gradeTypes}
      sortBy={sortBy}
      onCycleSort={cycleSort}
      selectMode={selectMode}
      onToggleSelectMode={toggleSelectMode}
      selectedCount={selectedIds.length}
      allSelected={allSelected}
      onToggleSelectAll={toggleSelectAll}
      searchQuery={searchQuery}
      onChangeSearchQuery={setSearchQuery}
      filterKey={filterKey}
      onChangeFilterKey={setFilterKey}
    />
  );

  const listEmpty = (
    <GradeListEmptyCard
      hasScopedGrades={scopedGrades.length > 0}
      hasActiveFilter={filterKey !== "all" || Boolean(searchQuery)}
      onClearFilter={() => {
        setFilterKey("all");
        setSearchQuery("");
      }}
    />
  );

  const listFooter = <View className="h-2" />;

  return (
    <View className="flex-1">
      <Backdrop>
        <FlatList
          data={visibleGrades}
          keyExtractor={keyExtractor}
          renderItem={renderGradeItem}
          ListHeaderComponent={listHeader}
          ListEmptyComponent={listEmpty}
          ListFooterComponent={listFooter}
          initialNumToRender={12}
          maxToRenderPerBatch={10}
          windowSize={5}
          removeClippedSubviews={Platform.OS === "android"}
          contentContainerStyle={{
            paddingHorizontal: 20,
            paddingBottom: selectMode ? 110 : 40,
          }}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        />

        {/* 勾选模式底部悬浮操作条：课程很多时无需滑到底 */}
        {selectMode ? (
          <GradeBatchActionBar
            canClearSemester={semScope !== "all"}
            selectedCount={selectedIds.length}
            selectedAllExcluded={selectedAllExcluded}
            onClearSemester={clearSemester}
            onToggleInclusion={toggleSelectedInclusion}
            onDeleteSelected={deleteSelected}
          />
        ) : null}
      </Backdrop>

      {editorVisible ? (
        <Suspense fallback={null}>
          <LazyGradeEditorPanel
            visible
            grade={editingGrade}
            defaultYearId={defaultTargetYearId}
            defaultSemester={defaultSemester}
            onClose={() => setEditorVisible(false)}
            onSave={submitGrade}
            onDelete={removeGrade}
          />
        </Suspense>
      ) : null}

      {yearVisible ? (
        <Suspense fallback={null}>
          <LazyGradeYearEditor
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
        </Suspense>
      ) : null}

      {ruleVisible ? (
        <Suspense fallback={null}>
          <LazyGradeRuleEditor
            visible
            rule={editingRule}
            canDelete={gradeRules.length > 1}
            onClose={() => setRuleVisible(false)}
            onSave={saveRule}
            onDelete={() => {
              if (editingRule) removeGradeRule(editingRule.id);
            }}
          />
        </Suspense>
      ) : null}

      {scalePickerOpen ? (
        <Suspense fallback={null}>
          <LazyGpaScalePickerModal
            gpaScale={gpaScale}
            onSelect={handleSelectScale}
            onClose={() => setScalePickerOpen(false)}
          />
        </Suspense>
      ) : null}

      {importSheet ? (
        <Suspense fallback={null}>
          <LazyGradeImportSheetModal
            gradeYears={gradeYears}
            importYearId={importYearId}
            importSemester={importSemester}
            onSelectYear={setImportYearOverride}
            onSelectSemester={setImportSemOverride}
            onStartImport={startGradeImport}
            onOpenScheduleImport={openScheduleImport}
            onOpenCreate={() => {
              setImportSheet(false);
              openCreate();
            }}
            onClose={() => setImportSheet(false)}
          />
        </Suspense>
      ) : null}

      {pasteOpen ? (
        <Suspense fallback={null}>
          <LazyPasteImportModal
            visible
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
        </Suspense>
      ) : null}

      {projectionOpen ? (
        <Suspense fallback={null}>
          <LazyGradeProjection
            grades={scopedGrades}
            types={gradeTypes}
            rule={activeRule}
            scope={scopeLabel}
            onClose={() => setProjectionOpen(false)}
          />
        </Suspense>
      ) : null}

      {scheduleImportOpen ? (
        <Suspense fallback={null}>
          <LazyScheduleGradeImportModal
            defaultYearId={defaultTargetYearId}
            defaultSemester={scheduleImportDefaultSemester}
            onClose={() => setScheduleImportOpen(false)}
          />
        </Suspense>
      ) : null}
    </View>
  );
}
