import { Ionicons } from "@expo/vector-icons";
import * as Network from "expo-network";
import { router } from "expo-router";
import React, { useMemo, useState } from "react";
import { Alert, Pressable, ScrollView, Text, View } from "react-native";
import Animated, { FadeInDown } from "react-native-reanimated";

import { Backdrop } from "@/components/Backdrop";
import { GlassContainer } from "@/components/GlassContainer";
import {
  GradeEditorPanel,
  GradeRuleEditor,
} from "@/components/GradeEditorPanel";
import {
  pickImageFromCamera,
  pickImageFromLibrary,
  pickTextDocument,
} from "@/services/fileImport";
import { recognizeGrades } from "@/services/ai";
import {
  recognizeGradesFromTextOffline,
  recognizeGradesOffline,
} from "@/services/offlineImport";
import { useImportTask } from "@/store/useImportTask";
import { useSettings } from "@/store/useSettings";
import { useStore } from "@/store/useStore";
import type {
  GradeRecord,
  GradeRule,
  GradeScoreType,
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
type Source =
  | { imageBase64: string; mimeType: string; uri: string }
  | { text: string };

type Tab = "all" | SemesterKind;

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
  const gradeTypes = useStore((s) => s.gradeTypes);
  const gradeRules = useStore((s) => s.gradeRules);
  const activeGradeRuleId = useStore((s) => s.activeGradeRuleId);
  const activeGradeSemester = useStore((s) => s.activeGradeSemester);
  const setActiveGradeRule = useStore((s) => s.setActiveGradeRule);
  const setActiveGradeSemester = useStore((s) => s.setActiveGradeSemester);
  const addGrade = useStore((s) => s.addGrade);
  const updateGrade = useStore((s) => s.updateGrade);
  const removeGrade = useStore((s) => s.removeGrade);
  const addGradeRule = useStore((s) => s.addGradeRule);
  const updateGradeRule = useStore((s) => s.updateGradeRule);
  const removeGradeRule = useStore((s) => s.removeGradeRule);
  const apiKey = useSettings((s) => s.apiKey);

  const [tab, setTab] = useState<Tab>(activeGradeSemester);
  const [editorVisible, setEditorVisible] = useState(false);
  const [editingGrade, setEditingGrade] = useState<GradeRecord | undefined>();
  const [ruleVisible, setRuleVisible] = useState(false);
  const [editingRule, setEditingRule] = useState<GradeRule | undefined>();

  const activeRule =
    gradeRules.find((r) => r.id === activeGradeRuleId) ?? gradeRules[0];

  const scopedGrades = useMemo(
    () =>
      tab === "all" ? grades : grades.filter((g) => g.semester === tab),
    [grades, tab],
  );
  const stats = useMemo(
    () => calcGradeStats(activeRule, scopedGrades),
    [activeRule, scopedGrades],
  );

  const typeName = (id: string) =>
    gradeTypes.find((t) => t.id === id)?.name ?? "未分类";

  const switchTab = (next: Tab) => {
    setTab(next);
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

  const submitGrade = (data: Omit<GradeRecord, "id"> & { id?: string }) => {
    if (data.id) {
      const { id, ...rest } = data;
      updateGrade(id, rest);
    } else {
      addGrade(data);
    }
    setEditorVisible(false);
  };

  const toggleCourse = (grade: GradeRecord) => {
    if (!activeRule) return;
    if (activeRule.excludedTypes.includes(grade.type)) {
      Alert.alert(
        "该类型已排除",
        `「${typeName(grade.type)}」已在计算规则中排除，可在「编辑规则」里恢复`,
      );
      return;
    }
    const excluded = activeRule.excludedCourseIds.includes(grade.id);
    updateGradeRule(activeRule.id, {
      excludedCourseIds: excluded
        ? activeRule.excludedCourseIds.filter((id) => id !== grade.id)
        : [...activeRule.excludedCourseIds, grade.id],
    });
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
      } else {
        const img =
          from === "image"
            ? await pickImageFromLibrary()
            : await pickImageFromCamera();
        source = img
          ? { imageBase64: img.base64, mimeType: img.mimeType, uri: img.uri }
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

    const fallbackSemester: SemesterKind =
      tab === "all" ? activeGradeSemester : tab;
    if (tab !== "all") setActiveGradeSemester(tab);

    task.open("grades", from === "text" ? "文档" : "照片");
    try {
      const online = await isOnline();
      const useAI = online && !!apiKey;
      const src = source;
      const runOffline = async (): Promise<Omit<GradeRecord, "id">[]> => {
        task.setPhase(
          "text" in src
            ? "离线模式：正在解析成绩表格…"
            : "离线模式：正在识别成绩单文字…",
          45,
        );
        return "text" in src
          ? recognizeGradesFromTextOffline(src.text, fallbackSemester)
          : await recognizeGradesOffline(src.uri, fallbackSemester);
      };

      let recognized: Omit<GradeRecord, "id">[];
      if (useAI) {
        try {
          task.setPhase("AI 正在识别课程成绩…", 38);
          recognized = await recognizeGrades(
            "text" in src ? { text: src.text } : src,
            apiKey,
            fallbackSemester,
          );
        } catch (aiError) {
          // 云端超时/失败时自动降级到本地，避免一直转圈
          task.setPhase("AI 识别未完成，正在切换本地离线识别…", 58);
          try {
            recognized = await runOffline();
          } catch {
            throw aiError;
          }
        }
      } else {
        recognized = await runOffline();
      }

      if (!recognized.length) {
        task.fail("未识别到有效成绩，请更换图片或补充表格后重试");
        return;
      }
      task.complete(
        { type: "grades", grades: recognized },
        `${useAI ? "识别完成" : "离线识别完成"}：共 ${recognized.length} 条成绩，请确认后导入`,
      );
    } catch (e) {
      task.fail(e instanceof Error ? e.message : "识别失败，请重试");
    }
  };

  const tabLabel = tab === "all" ? "总成绩" : semesterLabel(tab);
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
              成绩单识别 · 学期分页 · 学分加权绩点统计
            </Text>
          </Animated.View>

          {/* 学期分页 */}
          <Animated.View entering={FadeInDown.delay(50).springify()}>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              className="mt-4"
              contentContainerStyle={{ gap: 8, paddingRight: 8 }}
            >
              {[{ key: "all" as Tab, label: "总成绩" }, ...GRADE_SEMESTERS.map((s) => ({ key: s.kind as Tab, label: s.label }))].map(
                (item) => {
                  const on = tab === item.key;
                  return (
                    <Pressable
                      key={item.key}
                      onPress={() => switchTab(item.key)}
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
                        {item.label}
                      </Text>
                    </Pressable>
                  );
                },
              )}
            </ScrollView>
          </Animated.View>

          {/* 统计卡 */}
          <Animated.View entering={FadeInDown.delay(90).springify()}>
            <GlassContainer radius={28} intensity={48} borderOpacity={0.24} style={{ marginTop: 14 }}>
              <View className="px-5 py-4">
                <View className="flex-row items-center justify-between">
                  <Text className="text-[12px] font-semibold text-slate-500 dark:text-slate-400">
                    {tabLabel} · 学分加权平均绩点
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

                <View className="mt-1 flex-row items-end">
                  <Text className="text-[42px] font-extrabold text-slate-800 dark:text-white">
                    {formatGpa(stats.value)}
                  </Text>
                  <Text className="mb-2 ml-2 text-[11px] text-slate-400 dark:text-slate-500">
                    平均绩点
                  </Text>
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

          {/* 总成绩：各学期概览 */}
          {tab === "all" ? (
            <Animated.View entering={FadeInDown.delay(120).springify()} className="mt-3">
              <GlassContainer radius={24} intensity={42} borderOpacity={0.22}>
                <View className="px-4 py-3.5">
                  <Text className="mb-1 text-[12px] font-semibold text-slate-700 dark:text-slate-200">
                    各学期绩点
                  </Text>
                  {GRADE_SEMESTERS.map((s) => {
                    const list = grades.filter((g) => g.semester === s.kind);
                    const itemStats = calcGradeStats(activeRule, list);
                    return (
                      <Pressable
                        key={s.kind}
                        onPress={() => switchTab(s.kind)}
                        className="flex-row items-center border-t border-white/20 py-2.5 dark:border-white/[0.06]"
                      >
                        <Text className="flex-1 text-[12px] text-slate-600 dark:text-slate-300">
                          {s.label}
                        </Text>
                        <Text className="mr-3 text-[10.5px] text-slate-400 dark:text-slate-500">
                          {itemStats.count} 门 · {itemStats.credits} 学分
                        </Text>
                        <Text className="w-10 text-right text-[13px] font-bold text-sky-500 dark:text-sky-300">
                          {formatGpa(itemStats.value)}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
              </GlassContainer>
            </Animated.View>
          ) : null}

          {/* 导入 */}
          <Animated.View entering={FadeInDown.delay(150).springify()} className="mt-3">
            <GlassContainer radius={24} intensity={42} borderOpacity={0.22}>
              <View className="px-4 py-4">
                <Text className="text-[14px] font-bold text-slate-800 dark:text-white">
                  导入成绩
                </Text>
                <Text className="mt-0.5 text-[11px] leading-4 text-slate-500 dark:text-slate-400">
                  拍照、相册或表格文件。联网且有 API Key 时走 AI，否则自动本地离线识别
                </Text>
                <View className="mt-3 flex-row gap-x-2.5">
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
                      onPress={() => startGradeTask(it.key)}
                      className="flex-1 items-center rounded-2xl border border-white/25 bg-white/25 py-3 dark:border-white/10 dark:bg-white/[0.06]"
                    >
                      <Ionicons name={it.icon} size={18} color="#38BDF8" />
                      <Text className="mt-1 text-[11px] font-semibold text-slate-600 dark:text-slate-300">
                        {it.label}
                      </Text>
                    </Pressable>
                  ))}
                </View>
                <Pressable
                  onPress={openCreate}
                  className="mt-2.5 flex-row items-center justify-center rounded-2xl bg-sky-500/85 py-2.5"
                >
                  <Ionicons name="add" size={16} color="#fff" />
                  <Text className="ml-1 text-[12px] font-bold text-white">
                    手动添加成绩
                  </Text>
                </Pressable>
              </View>
            </GlassContainer>
          </Animated.View>

          {/* 成绩列表 */}
          <Animated.View entering={FadeInDown.delay(190).springify()} className="mt-3">
            <GlassContainer radius={24} intensity={42} borderOpacity={0.22}>
              <View className="px-4 py-4">
                <View className="flex-row items-center justify-between">
                  <Text className="text-[14px] font-bold text-slate-800 dark:text-white">
                    {tab === "all" ? "全部成绩" : `${tabLabel}成绩`}
                  </Text>
                  <Text className="text-[10.5px] text-slate-400 dark:text-slate-500">
                    {scopedGrades.length} 门
                  </Text>
                </View>

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
                      const excludedByType =
                        activeRule?.excludedTypes.includes(g.type) ?? false;
                      const included =
                        activeRule != null
                          ? isGradeIncluded(activeRule, g)
                          : true;
                      return (
                        <View
                          key={g.id}
                          className="flex-row items-center border-t border-white/20 py-3 dark:border-white/[0.06]"
                        >
                          <Pressable
                            onPress={() => toggleCourse(g)}
                            hitSlop={8}
                            className={`mr-2.5 ${excludedByType ? "opacity-35" : ""}`}
                          >
                            <Ionicons
                              name={included ? "checkbox" : "square-outline"}
                              size={18}
                              color={included ? "#38BDF8" : "#94A3B8"}
                            />
                          </Pressable>
                          <Pressable
                            onPress={() => openEdit(g)}
                            className="flex-1"
                          >
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
                              {typeName(g.type)} · {g.credit} 学分 ·{" "}
                              {SCORE_TYPE_HINT[g.scoreType]}
                              {tab === "all" ? ` · ${semesterLabel(g.semester)}` : ""}
                            </Text>
                          </Pressable>
                          <View className="ml-2 items-end">
                            <Text className="text-[16px] font-bold text-slate-700 dark:text-slate-200">
                              {g.score || "--"}
                            </Text>
                            <Text className="text-[10px] font-semibold text-sky-500 dark:text-sky-300">
                              {formatCourseGpa(g.gpa)} 绩点
                            </Text>
                          </View>
                        </View>
                      );
                    })}
                  </View>
                )}
              </View>
            </GlassContainer>
          </Animated.View>
        </ScrollView>
      </Backdrop>

      {editorVisible ? (
        <GradeEditorPanel
          visible
          grade={editingGrade}
          defaultSemester={tab === "all" ? activeGradeSemester : tab}
          onClose={() => setEditorVisible(false)}
          onSave={submitGrade}
          onDelete={removeGrade}
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
    </View>
  );
}
