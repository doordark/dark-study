import { Ionicons } from "@expo/vector-icons";
import React, {
  useEffect,
  useRef,
  useState,
} from "react";
import {
  Alert,
  Keyboard,
  KeyboardAvoidingView,
  Modal,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  useWindowDimensions,
  View,
  type ScrollViewInstance,
} from "react-native";
import Animated, { FadeInDown, FadeOutDown } from "react-native-reanimated";

import {
  GlassContainer,
  GlassTargetProvider,
} from "@/components/GlassContainer";
import type {
  GradeRecord,
  GradeRule,
  GradeScoreType,
  SemesterKind,
} from "@/types";
import {
  deriveGpa,
  GRADE_SEMESTERS,
} from "@/utils/grades";
import { useStore } from "@/store/useStore";

const SCORE_TYPE_LABEL: Record<GradeScoreType, string> = {
  numeric: "数字",
  letter: "字母",
  text: "文字",
};

const SCORE_PLACEHOLDER: Record<GradeScoreType, string> = {
  numeric: "如 87",
  letter: "如 A / B+",
  text: "如 优秀 / 及格",
};

function Field({
  label,
  value,
  placeholder,
  onChange,
  keyboardType,
}: {
  label: string;
  value: string;
  placeholder?: string;
  onChange: (v: string) => void;
  keyboardType?: "default" | "numeric";
}) {
  return (
    <View className="mb-3">
      <Text className="mb-1.5 text-[11px] font-semibold text-slate-500 dark:text-slate-400">
        {label}
      </Text>
      <TextInput
        value={value}
        onChangeText={onChange}
        placeholder={placeholder}
        placeholderTextColor="rgba(148,163,184,0.7)"
        keyboardType={keyboardType}
        className="rounded-2xl border border-white/30 bg-white/50 px-3.5 py-2.5 text-[14px] text-slate-800 dark:border-white/10 dark:bg-white/[0.07] dark:text-slate-100"
      />
    </View>
  );
}

function useSheetHeight(ratio: number) {
  const { height: winH } = useWindowDimensions();
  const [kbH, setKbH] = useState(0);
  useEffect(() => {
    const show = Keyboard.addListener("keyboardDidShow", (e) =>
      setKbH(e.endCoordinates.height),
    );
    const hide = Keyboard.addListener("keyboardDidHide", () => setKbH(0));
    return () => {
      show.remove();
      hide.remove();
    };
  }, []);
  return Math.max(300, Math.min(Math.round(winH * ratio), winH - kbH - 16));
}

export interface GradeEditorPanelProps {
  visible: boolean;
  /** 传入则为编辑，undefined 为新建 */
  grade?: GradeRecord;
  /** 新建时默认归入的学期 */
  defaultSemester: SemesterKind;
  onClose: () => void;
  onSave: (data: Omit<GradeRecord, "id"> & { id?: string }) => void;
  onDelete?: (id: string) => void;
}

export function GradeEditorPanel({
  visible,
  grade,
  defaultSemester,
  onClose,
  onSave,
  onDelete,
}: GradeEditorPanelProps) {
  const types = useStore((s) => s.gradeTypes);
  const addGradeType = useStore((s) => s.addGradeType);
  const sheetH = useSheetHeight(0.82);
  const scrollRef = useRef<ScrollViewInstance>(null);

  const [name, setName] = useState(grade?.name ?? "");
  const [credit, setCredit] = useState(grade ? String(grade.credit) : "");
  const [scoreType, setScoreType] = useState<GradeScoreType>(
    grade?.scoreType ?? "numeric",
  );
  const [score, setScore] = useState(grade?.score ?? "");
  const [gpa, setGpa] = useState(grade?.gpa != null ? String(grade.gpa) : "");
  const [gpaTouched, setGpaTouched] = useState(!!grade);
  const [type, setType] = useState(
    grade?.type ?? types[0]?.id ?? "required",
  );
  const [semester, setSemester] = useState<SemesterKind>(
    grade?.semester ?? defaultSemester,
  );
  const [addingType, setAddingType] = useState(false);
  const [newTypeName, setNewTypeName] = useState("");

  const fillGpa = (nextScoreType: GradeScoreType, nextScore: string) => {
    const derived = deriveGpa(nextScoreType, nextScore);
    setGpa(derived == null ? "" : String(derived));
    setGpaTouched(false);
  };

  const changeScore = (v: string) => {
    setScore(v);
    if (!gpaTouched) {
      const derived = deriveGpa(scoreType, v);
      setGpa(derived == null ? "" : String(derived));
    }
  };

  const changeScoreType = (next: GradeScoreType) => {
    setScoreType(next);
    if (!gpaTouched) {
      const derived = deriveGpa(next, score);
      setGpa(derived == null ? "" : String(derived));
    }
  };

  const addType = () => {
    const id = addGradeType(newTypeName);
    if (!id) return;
    setType(id);
    setNewTypeName("");
    setAddingType(false);
  };

  const submit = () => {
    const trimmedName = name.trim();
    if (!trimmedName) {
      Alert.alert("请填写课程名称");
      return;
    }
    const creditNum = Number(credit);
    if (!Number.isFinite(creditNum) || creditNum <= 0) {
      Alert.alert("请填写有效的学分", "学分需要是大于 0 的数字");
      return;
    }

    const trimmedScore = score.trim();
    if (scoreType === "numeric" && trimmedScore) {
      const n = Number(trimmedScore);
      if (!Number.isFinite(n) || n < 0 || n > 100) {
        Alert.alert("分数格式不正确", "百分制分数需要在 0 ~ 100 之间");
        return;
      }
    }

    let gpaNum: number | null = null;
    if (gpa.trim()) {
      gpaNum = Number(gpa);
      if (!Number.isFinite(gpaNum) || gpaNum < 0 || gpaNum > 5) {
        Alert.alert("绩点格式不正确", "绩点需要在 0 ~ 5 之间");
        return;
      }
    } else {
      gpaNum = deriveGpa(scoreType, trimmedScore);
    }

    if (!trimmedScore && gpaNum == null) {
      Alert.alert("请填写分数或绩点", "至少填写一项才能计入统计");
      return;
    }

    onSave({
      ...(grade ? { id: grade.id } : {}),
      name: trimmedName,
      credit: creditNum,
      scoreType,
      score: trimmedScore,
      gpa: gpaNum,
      semester,
      type,
    });
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <GlassTargetProvider>
        <View className="flex-1 justify-end bg-black/45">
          <Pressable className="flex-1" onPress={onClose} />
          <KeyboardAvoidingView behavior="padding">
            <Animated.View
              entering={FadeInDown.springify()}
              exiting={FadeOutDown}
            >
              <GlassContainer
                radius={32}
                intensity={62}
                borderOpacity={0.3}
                style={{ height: sheetH, paddingBottom: 16 }}
              >
                <ScrollView
                  ref={scrollRef}
                  style={{ flex: 1 }}
                  contentContainerStyle={{ paddingBottom: 4 }}
                  className="px-5 pt-5"
                  keyboardShouldPersistTaps="handled"
                >
                  <View className="mb-4 flex-row items-center justify-between">
                    <Text className="text-[17px] font-bold text-slate-800 dark:text-white">
                      {grade ? "编辑成绩" : "添加成绩"}
                    </Text>
                    <Pressable
                      onPress={onClose}
                      className="h-8 w-8 items-center justify-center rounded-full bg-white/25 dark:bg-white/[0.08]"
                    >
                      <Ionicons name="close" size={16} color="#94A3B8" />
                    </Pressable>
                  </View>

                  <Field label="课程名称" value={name} placeholder="如 高等数学" onChange={setName} />
                  <Field
                    label="学分"
                    value={credit}
                    placeholder="如 3"
                    onChange={setCredit}
                    keyboardType="numeric"
                  />

                  <Text className="mb-1.5 text-[11px] font-semibold text-slate-500 dark:text-slate-400">
                    分数类型
                  </Text>
                  <View className="mb-3 flex-row gap-x-2">
                    {(["numeric", "letter", "text"] as GradeScoreType[]).map(
                      (key) => {
                        const on = scoreType === key;
                        return (
                          <Pressable
                            key={key}
                            onPress={() => changeScoreType(key)}
                            className={`flex-1 items-center rounded-xl border py-2 ${
                              on
                                ? "border-sky-400/70 bg-sky-400/80"
                                : "border-white/30 bg-white/25 dark:border-white/10 dark:bg-white/[0.05]"
                            }`}
                          >
                            <Text
                              className={`text-[12px] font-semibold ${
                                on
                                  ? "text-white"
                                  : "text-slate-600 dark:text-slate-300"
                              }`}
                            >
                              {SCORE_TYPE_LABEL[key]}
                            </Text>
                          </Pressable>
                        );
                      },
                    )}
                  </View>

                  <Field
                    label="分数"
                    value={score}
                    placeholder={SCORE_PLACEHOLDER[scoreType]}
                    onChange={changeScore}
                    keyboardType={scoreType === "numeric" ? "numeric" : "default"}
                  />

                  <View className="mb-3">
                    <View className="mb-1.5 flex-row items-center justify-between">
                      <Text className="text-[11px] font-semibold text-slate-500 dark:text-slate-400">
                        绩点（0 ~ 5）
                      </Text>
                      <Pressable
                        onPress={() => fillGpa(scoreType, score)}
                        className="flex-row items-center"
                      >
                        <Ionicons name="calculator-outline" size={12} color="#38BDF8" />
                        <Text className="ml-1 text-[10.5px] font-semibold text-sky-500 dark:text-sky-300">
                          按分数换算
                        </Text>
                      </Pressable>
                    </View>
                    <TextInput
                      value={gpa}
                      onChangeText={(v) => {
                        setGpa(v);
                        setGpaTouched(true);
                      }}
                      placeholder="可手动修改"
                      placeholderTextColor="rgba(148,163,184,0.7)"
                      keyboardType="numeric"
                      className="rounded-2xl border border-white/30 bg-white/50 px-3.5 py-2.5 text-[14px] text-slate-800 dark:border-white/10 dark:bg-white/[0.07] dark:text-slate-100"
                    />
                    <Text className="mt-1 text-[10px] text-slate-400 dark:text-slate-500">
                      默认按常见 4.0 制档位换算，可手动修改；识别成绩单时优先使用原文绩点
                    </Text>
                  </View>

                  <Text className="mb-1.5 text-[11px] font-semibold text-slate-500 dark:text-slate-400">
                    课程类型
                  </Text>
                  <View className="mb-1 flex-row flex-wrap gap-2">
                    {types.map((t) => {
                      const on = type === t.id;
                      return (
                        <Pressable
                          key={t.id}
                          onPress={() => setType(t.id)}
                          className={`rounded-full border px-3 py-1.5 ${
                            on
                              ? "border-sky-400/70 bg-sky-400/80"
                              : "border-white/30 bg-white/25 dark:border-white/10 dark:bg-white/[0.05]"
                          }`}
                        >
                          <Text
                            className={`text-[11px] font-semibold ${
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
                    <Pressable
                      onPress={() => setAddingType((v) => !v)}
                      className="rounded-full border border-dashed border-sky-400/60 px-3 py-1.5"
                    >
                      <Text className="text-[11px] font-semibold text-sky-500 dark:text-sky-300">
                        + 类型
                      </Text>
                    </Pressable>
                  </View>
                  {addingType ? (
                    <View className="mb-2 mt-2 flex-row items-center gap-x-2">
                      <TextInput
                        value={newTypeName}
                        onChangeText={setNewTypeName}
                        placeholder="新类型名称，如 专业选修课"
                        placeholderTextColor="rgba(148,163,184,0.7)"
                        className="flex-1 rounded-xl border border-white/30 bg-white/50 px-3 py-2 text-[12.5px] text-slate-800 dark:border-white/10 dark:bg-white/[0.07] dark:text-slate-100"
                      />
                      <Pressable
                        onPress={addType}
                        className="rounded-xl bg-sky-500/85 px-3 py-2"
                      >
                        <Text className="text-[12px] font-bold text-white">添加</Text>
                      </Pressable>
                    </View>
                  ) : null}

                  <Text className="mb-1.5 mt-2 text-[11px] font-semibold text-slate-500 dark:text-slate-400">
                    学期
                  </Text>
                  <View className="mb-4 flex-row gap-x-2">
                    {GRADE_SEMESTERS.map((s) => {
                      const on = semester === s.kind;
                      return (
                        <Pressable
                          key={s.kind}
                          onPress={() => setSemester(s.kind)}
                          className={`flex-1 items-center rounded-xl border py-2 ${
                            on
                              ? "border-sky-400/70 bg-sky-400/80"
                              : "border-white/30 bg-white/25 dark:border-white/10 dark:bg-white/[0.05]"
                          }`}
                        >
                          <Text
                            className={`text-[12px] font-semibold ${
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

                  <Pressable
                    onPress={submit}
                    className="items-center rounded-2xl bg-sky-500/85 py-3"
                  >
                    <Text className="text-[13px] font-bold text-white">
                      保存成绩
                    </Text>
                  </Pressable>

                  {grade && onDelete ? (
                    <Pressable
                      onPress={() => {
                        onDelete(grade.id);
                        onClose();
                      }}
                      className="mt-2.5 items-center rounded-2xl border border-rose-400/40 bg-rose-400/10 py-2.5"
                    >
                      <Text className="text-[12px] font-semibold text-rose-500 dark:text-rose-300">
                        删除这门成绩
                      </Text>
                    </Pressable>
                  ) : null}
                </ScrollView>
              </GlassContainer>
            </Animated.View>
          </KeyboardAvoidingView>
        </View>
      </GlassTargetProvider>
    </Modal>
  );
}

/* -------------------------------------------------------------------------- */
/*  计算规则编辑                                                               */
/* -------------------------------------------------------------------------- */

export interface GradeRuleEditorProps {
  visible: boolean;
  /** undefined = 新建规则 */
  rule?: GradeRule;
  canDelete: boolean;
  onClose: () => void;
  onSave: (data: {
    name: string;
    excludedTypes: string[];
    clearManual: boolean;
  }) => void;
  onDelete?: () => void;
}

export function GradeRuleEditor({
  visible,
  rule,
  canDelete,
  onClose,
  onSave,
  onDelete,
}: GradeRuleEditorProps) {
  const types = useStore((s) => s.gradeTypes);
  const sheetH = useSheetHeight(0.66);
  const [name, setName] = useState(rule?.name ?? "");
  const [excludedTypes, setExcludedTypes] = useState<string[]>(
    rule?.excludedTypes ?? [],
  );
  const [clearManual, setClearManual] = useState(false);

  const toggleType = (id: string) =>
    setExcludedTypes((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );

  const submit = () => {
    const trimmed = name.trim();
    if (!trimmed) {
      Alert.alert("请给计算规则命名", "例如「综测绩点」「保研绩点」");
      return;
    }
    onSave({ name: trimmed, excludedTypes, clearManual });
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <GlassTargetProvider>
        <View className="flex-1 justify-end bg-black/45">
          <Pressable className="flex-1" onPress={onClose} />
          <KeyboardAvoidingView behavior="padding">
            <Animated.View
              entering={FadeInDown.springify()}
              exiting={FadeOutDown}
            >
              <GlassContainer
                radius={32}
                intensity={62}
                borderOpacity={0.3}
                style={{ height: sheetH, paddingBottom: 16 }}
              >
                <ScrollView
                  className="px-5 pt-5"
                  style={{ flex: 1 }}
                  keyboardShouldPersistTaps="handled"
                >
                  <View className="mb-4 flex-row items-center justify-between">
                    <Text className="text-[17px] font-bold text-slate-800 dark:text-white">
                      {rule ? "编辑计算规则" : "新建计算规则"}
                    </Text>
                    <Pressable
                      onPress={onClose}
                      className="h-8 w-8 items-center justify-center rounded-full bg-white/25 dark:bg-white/[0.08]"
                    >
                      <Ionicons name="close" size={16} color="#94A3B8" />
                    </Pressable>
                  </View>

                  <Field
                    label="规则名称"
                    value={name}
                    placeholder="如 保研绩点"
                    onChange={setName}
                  />

                  <View className="mb-1.5 flex-row items-center justify-between">
                    <Text className="text-[11px] font-semibold text-slate-500 dark:text-slate-400">
                      一键排除课程类型
                    </Text>
                    <Pressable
                      onPress={() => {
                        setExcludedTypes([]);
                        setClearManual(true);
                      }}
                    >
                      <Text className="text-[10.5px] font-semibold text-sky-500 dark:text-sky-300">
                        全部计入
                      </Text>
                    </Pressable>
                  </View>
                  <Text className="mb-2 text-[10px] leading-4 text-slate-400 dark:text-slate-500">
                    点按类型即可从统计中排除，例如一键去掉「通识选修课」
                  </Text>
                  <View className="mb-3 flex-row flex-wrap gap-2">
                    {types.map((t) => {
                      const excluded = excludedTypes.includes(t.id);
                      return (
                        <Pressable
                          key={t.id}
                          onPress={() => toggleType(t.id)}
                          className={`flex-row items-center rounded-full border px-3 py-1.5 ${
                            excluded
                              ? "border-rose-400/40 bg-rose-400/15"
                              : "border-emerald-400/50 bg-emerald-400/15"
                          }`}
                        >
                          <Ionicons
                            name={excluded ? "close-circle" : "checkmark-circle"}
                            size={12}
                            color={excluded ? "#FB7185" : "#34D399"}
                          />
                          <Text
                            className={`ml-1 text-[11px] font-semibold ${
                              excluded
                                ? "text-rose-500 dark:text-rose-300"
                                : "text-emerald-600 dark:text-emerald-300"
                            }`}
                          >
                            {t.name}
                          </Text>
                        </Pressable>
                      );
                    })}
                  </View>

                  {rule && rule.excludedCourseIds.length ? (
                    <Pressable
                      onPress={() => setClearManual((v) => !v)}
                      className="mb-3 flex-row items-center rounded-2xl border border-white/30 bg-white/25 px-3.5 py-2.5 dark:border-white/10 dark:bg-white/[0.05]"
                    >
                      <Ionicons
                        name={clearManual ? "checkbox" : "square-outline"}
                        size={16}
                        color="#38BDF8"
                      />
                      <Text className="ml-2 flex-1 text-[11px] text-slate-600 dark:text-slate-300">
                        恢复手动勾除的 {rule.excludedCourseIds.length} 门课程
                      </Text>
                    </Pressable>
                  ) : null}

                  <View className="mt-1 rounded-2xl bg-white/20 px-3.5 py-2.5 dark:bg-white/[0.05]">
                    <Text className="text-[10.5px] leading-4 text-slate-500 dark:text-slate-400">
                      统计方式：Σ(课程绩点 × 学分) ÷ Σ学分，只统计勾选且绩点有效的课程
                    </Text>
                  </View>

                  <Pressable
                    onPress={submit}
                    className="mt-4 items-center rounded-2xl bg-sky-500/85 py-3"
                  >
                    <Text className="text-[13px] font-bold text-white">
                      保存规则
                    </Text>
                  </Pressable>

                  {rule && canDelete && onDelete ? (
                    <Pressable
                      onPress={() => {
                        onDelete();
                        onClose();
                      }}
                      className="mt-2.5 items-center rounded-2xl border border-rose-400/40 bg-rose-400/10 py-2.5"
                    >
                      <Text className="text-[12px] font-semibold text-rose-500 dark:text-rose-300">
                        删除这条规则
                      </Text>
                    </Pressable>
                  ) : null}
                </ScrollView>
              </GlassContainer>
            </Animated.View>
          </KeyboardAvoidingView>
        </View>
      </GlassTargetProvider>
    </Modal>
  );
}
