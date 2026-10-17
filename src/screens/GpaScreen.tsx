import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import React, { useMemo, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from "react-native";
import Animated, { FadeInDown } from "react-native-reanimated";

import { Backdrop } from "@/components/Backdrop";
import { GlassContainer } from "@/components/GlassContainer";
import { recognizeGpaRules, recognizeGrades } from "@/services/ai";
import {
  pickImageFromCamera,
  pickImageFromLibrary,
  pickTextDocument,
} from "@/services/fileImport";
import { useSettings } from "@/store/useSettings";
import { useStore } from "@/store/useStore";
import type { GpaRule, GradeRecord } from "@/types";

/** 按规则把成绩换算为绩点 */
function scoreToGpa(rule: GpaRule, rec: GradeRecord): number | null {
  if (!rec.includedInGpa) return null;
  if (rec.score != null) {
    const band = rule.bands.find(
      (b) => rec.score! >= b.minScore && rec.score! <= b.maxScore,
    );
    return band?.gpa ?? null;
  }
  if (rec.grade) {
    const band = rule.bands.find(
      (b) => b.grade.toLowerCase() === rec.grade!.trim().toLowerCase(),
    );
    return band?.gpa ?? null;
  }
  return null;
}

function calcGpa(rule: GpaRule, grades: GradeRecord[]) {
  let creditSum = 0;
  let gpaSum = 0;
  let simpleSum = 0;
  let simpleCount = 0;

  for (const g of grades) {
    const gpa = scoreToGpa(rule, g);
    if (gpa == null) continue;
    if (rule.formula === "simple") {
      simpleSum += gpa;
      simpleCount += 1;
    } else {
      creditSum += g.credit;
      gpaSum += gpa * g.credit;
    }
  }

  const value =
    rule.formula === "simple"
      ? simpleCount
        ? simpleSum / simpleCount
        : null
      : creditSum
        ? gpaSum / creditSum
        : null;
  return { value, creditSum };
}

export function GpaScreen() {
  const grades = useStore((s) => s.grades);
  const gpaRules = useStore((s) => s.gpaRules);
  const addGrade = useStore((s) => s.addGrade);
  const removeGrade = useStore((s) => s.removeGrade);
  const addGpaRule = useStore((s) => s.addGpaRule);
  const removeGpaRule = useStore((s) => s.removeGpaRule);
  const apiKey = useSettings((s) => s.apiKey);

  const [ruleId, setRuleId] = useState(gpaRules[0]?.id ?? "");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  // 新增成绩表单
  const [name, setName] = useState("");
  const [credit, setCredit] = useState("");
  const [score, setScore] = useState("");
  const [type, setType] = useState<GradeRecord["type"]>("required");
  const [included, setIncluded] = useState(true);

  const activeRule = gpaRules.find((r) => r.id === ruleId) ?? gpaRules[0];
  const result = useMemo(
    () => (activeRule ? calcGpa(activeRule, grades) : null),
    [activeRule, grades],
  );

  const submit = () => {
    const c = Number(credit);
    const s = score.trim() === "" ? null : Number(score);
    if (!name.trim() || !Number.isFinite(c) || c <= 0) {
      setNotice("请填写课程名称和有效学分");
      return;
    }
    if (s != null && (!Number.isFinite(s) || s < 0 || s > 100)) {
      setNotice("百分制成绩应在 0–100 之间");
      return;
    }
    addGrade({
      name: name.trim(),
      credit: c,
      score: s,
      grade: null,
      semester: "当前学期",
      type,
      includedInGpa: included,
    });
    setName("");
    setCredit("");
    setScore("");
    setNotice("成绩已添加");
  };

  const importRules = async (from: "image" | "camera" | "text") => {
    if (!apiKey) {
      setNotice("请先在「设置」中填写 DeepSeek API Key");
      return;
    }
    setBusy(true);
    setNotice(null);
    try {
      let source: { imageBase64?: string; text?: string } | null = null;
      if (from === "text") {
        const doc = await pickTextDocument();
        if (!doc) return;
        source = { text: doc.text };
      } else {
        const img =
          from === "image"
            ? await pickImageFromLibrary()
            : await pickImageFromCamera();
        if (!img) return;
        source = { imageBase64: img.base64 };
      }
      const rules = await recognizeGpaRules(source, apiKey);
      rules.forEach((r) => {
        const { id: _id, ...rest } = r;
        addGpaRule(rest);
      });
      setNotice(`已导入 ${rules.length} 条换算规则`);
    } catch (e) {
      setNotice(e instanceof Error ? e.message : "识别失败");
    } finally {
      setBusy(false);
    }
  };

  /** 成绩单识别导入（相册 / 拍照 / 文本） */
  const importGrades = async (from: "image" | "camera" | "text") => {
    if (!apiKey) {
      setNotice("请先在「设置」中填写 DeepSeek API Key");
      return;
    }
    setBusy(true);
    setNotice(null);
    try {
      let source: {
        imageBase64?: string;
        text?: string;
        mimeType?: string;
      } | null = null;
      if (from === "text") {
        const doc = await pickTextDocument();
        if (!doc) return;
        source = { text: doc.text };
      } else {
        const img =
          from === "image"
            ? await pickImageFromLibrary()
            : await pickImageFromCamera();
        if (!img) return;
        source = { imageBase64: img.base64, mimeType: img.mimeType };
      }
      const grades = await recognizeGrades(source, apiKey);
      if (!grades.length) {
        setNotice("未识别到有效成绩，请更换图片或用文字描述");
        return;
      }
      grades.forEach((g) => {
        const { id: _id, ...rest } = g;
        addGrade(rest);
      });
      setNotice(`已导入 ${grades.length} 条成绩，可在下方成绩单查看`);
    } catch (e) {
      setNotice(e instanceof Error ? e.message : "识别失败");
    } finally {
      setBusy(false);
    }
  };

  return (
    <View className="flex-1">
      <Backdrop>
        <ScrollView
          contentContainerStyle={{
            paddingHorizontal: 20,
            paddingTop: 16,
            paddingBottom: 40,
          }}
          showsVerticalScrollIndicator={false}
        >
          {/* 头部 */}
          <Animated.View entering={FadeInDown.springify()} className="mb-4">
            <Pressable
              onPress={() => router.back()}
              className="mb-3 h-9 w-9 items-center justify-center rounded-full bg-white/20 dark:bg-white/[0.07]"
            >
              <Ionicons name="chevron-back" size={18} color="#94A3B8" />
            </Pressable>
            <Text className="text-[24px] font-extrabold text-slate-800 dark:text-white">
              绩点计算
            </Text>
            <Text className="mt-1 text-[12px] text-slate-500 dark:text-slate-400">
              保研绩点 / 成绩换算，规则支持上传识别
            </Text>
          </Animated.View>

          {/* 结果卡 */}
          <Animated.View entering={FadeInDown.delay(60).springify()}>
            <GlassContainer radius={28} intensity={52} borderOpacity={0.28}>
              <View className="items-center px-5 py-6">
                <Text className="text-[11px] font-semibold tracking-widest text-sky-500/80 dark:text-sky-300/80">
                  {activeRule?.name ?? "暂无规则"}
                </Text>
                <Text className="mt-1 text-[44px] font-extrabold leading-[52px] text-slate-800 dark:text-white">
                  {result?.value != null ? result.value.toFixed(3) : "--"}
                </Text>
                <Text className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">
                  已计入 {grades.filter((g) => g.includedInGpa).length} 门 ·
                  累计学分 {result?.creditSum ?? 0}
                </Text>

                {activeRule ? (
                  <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    className="mt-4"
                  >
                    <View className="flex-row gap-x-2">
                      {activeRule.bands.map((b) => (
                        <View
                          key={`${b.grade}-${b.minScore}`}
                          className="items-center rounded-2xl border border-white/20 bg-white/15 px-2.5 py-1.5 dark:border-white/10 dark:bg-white/[0.05]"
                        >
                          <Text className="text-[11px] font-bold text-slate-700 dark:text-slate-200">
                            {b.grade}
                          </Text>
                          <Text className="text-[9px] text-slate-500 dark:text-slate-400">
                            {b.minScore}–{b.maxScore}
                          </Text>
                          <Text className="text-[10px] font-semibold text-sky-500 dark:text-sky-300">
                            {b.gpa.toFixed(1)}
                          </Text>
                        </View>
                      ))}
                    </View>
                  </ScrollView>
                ) : null}
              </View>
            </GlassContainer>
          </Animated.View>

          {/* 规则切换 */}
          <Animated.View
            entering={FadeInDown.delay(120).springify()}
            className="mt-3.5"
          >
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              <View className="flex-row gap-x-2">
                {gpaRules.map((r) => (
                  <Pressable
                    key={r.id}
                    onPress={() => setRuleId(r.id)}
                    className={`flex-row items-center rounded-full border px-3.5 py-2 ${
                      r.id === activeRule?.id
                        ? "border-sky-400/70 bg-sky-400/80"
                        : "border-white/20 bg-white/25 dark:border-white/10 dark:bg-white/[0.05]"
                    }`}
                  >
                    <Text
                      className={`text-[11px] font-semibold ${
                        r.id === activeRule?.id
                          ? "text-white"
                          : "text-slate-600 dark:text-slate-300"
                      }`}
                    >
                      {r.name}
                    </Text>
                    {gpaRules.length > 1 ? (
                      <Pressable
                        onPress={() => removeGpaRule(r.id)}
                        className="ml-2"
                      >
                        <Ionicons name="close" size={12} color="#94A3B8" />
                      </Pressable>
                    ) : null}
                  </Pressable>
                ))}
                <Pressable
                  onPress={() => importRules("image")}
                  className="flex-row items-center rounded-full border border-emerald-400/50 bg-emerald-400/15 px-3.5 py-2"
                >
                  {busy ? (
                    <ActivityIndicator size="small" color="#34D399" />
                  ) : (
                    <>
                      <Ionicons name="cloud-upload" size={12} color="#34D399" />
                      <Text className="ml-1 text-[11px] font-semibold text-emerald-300">
                        识别规则
                      </Text>
                    </>
                  )}
                </Pressable>
                <Pressable
                  onPress={() => importRules("camera")}
                  className="flex-row items-center rounded-full border border-white/20 bg-white/25 px-3.5 py-2 dark:border-white/10 dark:bg-white/[0.05]"
                >
                  <Ionicons name="camera" size={12} color="#94A3B8" />
                  <Text className="ml-1 text-[11px] font-semibold text-slate-600 dark:text-slate-300">
                    拍规则
                  </Text>
                </Pressable>
                <Pressable
                  onPress={() => importRules("text")}
                  className="flex-row items-center rounded-full border border-white/20 bg-white/25 px-3.5 py-2 dark:border-white/10 dark:bg-white/[0.05]"
                >
                  <Ionicons name="document-text" size={12} color="#94A3B8" />
                  <Text className="ml-1 text-[11px] font-semibold text-slate-600 dark:text-slate-300">
                    文件规则
                  </Text>
                </Pressable>
              </View>
            </ScrollView>
          </Animated.View>

          {/* 成绩单识别导入 */}
          <Animated.View
            entering={FadeInDown.delay(150).springify()}
            className="mt-3.5"
          >
            <GlassContainer radius={24} intensity={42} borderOpacity={0.22}>
              <View className="px-4 py-4">
                <View className="flex-row items-center">
                  <View className="h-9 w-9 items-center justify-center rounded-[13px] bg-sky-400/25">
                    <Ionicons name="scan" size={17} color="#38BDF8" />
                  </View>
                  <View className="ml-2.5 flex-1">
                    <Text className="text-[15px] font-bold text-slate-800 dark:text-white">
                      成绩单识别
                    </Text>
                    <Text className="text-[11px] text-slate-500 dark:text-slate-400">
                      教务截图 / 成绩单照片，自动录入课程成绩
                    </Text>
                  </View>
                </View>
                <View className="mt-3.5 flex-row gap-x-2.5">
                  <Pressable
                    onPress={() => importGrades("image")}
                    className="flex-1 items-center rounded-2xl border border-white/25 bg-white/25 py-3 dark:border-white/10 dark:bg-white/[0.06]"
                  >
                    {busy ? (
                      <ActivityIndicator size="small" color="#38BDF8" />
                    ) : (
                      <>
                        <Ionicons name="image" size={18} color="#38BDF8" />
                        <Text className="mt-1 text-[11px] font-semibold text-slate-600 dark:text-slate-300">
                          相册识图
                        </Text>
                      </>
                    )}
                  </Pressable>
                  <Pressable
                    onPress={() => importGrades("camera")}
                    className="flex-1 items-center rounded-2xl border border-white/25 bg-white/25 py-3 dark:border-white/10 dark:bg-white/[0.06]"
                  >
                    <Ionicons name="camera" size={18} color="#38BDF8" />
                    <Text className="mt-1 text-[11px] font-semibold text-slate-600 dark:text-slate-300">
                      拍照识别
                    </Text>
                  </Pressable>
                  <Pressable
                    onPress={() => importGrades("text")}
                    className="flex-1 items-center rounded-2xl border border-white/25 bg-white/25 py-3 dark:border-white/10 dark:bg-white/[0.06]"
                  >
                    <Ionicons name="document-text" size={18} color="#38BDF8" />
                    <Text className="mt-1 text-[11px] font-semibold text-slate-600 dark:text-slate-300">
                      文档导入
                    </Text>
                  </Pressable>
                </View>
              </View>
            </GlassContainer>
          </Animated.View>

          {/* 添加成绩 */}
          <Animated.View
            entering={FadeInDown.delay(180).springify()}
            className="mt-3.5"
          >
            <GlassContainer radius={24} intensity={42} borderOpacity={0.22}>
              <View className="px-4 py-4">
                <Text className="mb-3 text-[14px] font-bold text-slate-800 dark:text-white">
                  添加成绩
                </Text>
                <TextInput
                  value={name}
                  onChangeText={setName}
                  placeholder="课程名称"
                  placeholderTextColor="rgba(148,163,184,0.7)"
                  className="mb-2.5 rounded-2xl border border-white/25 bg-white/35 px-3.5 py-2.5 text-[13px] text-slate-800 dark:border-white/10 dark:bg-white/[0.05] dark:text-slate-100"
                />
                <View className="flex-row gap-x-2.5">
                  <TextInput
                    value={credit}
                    onChangeText={setCredit}
                    placeholder="学分"
                    keyboardType="numeric"
                    placeholderTextColor="rgba(148,163,184,0.7)"
                    className="flex-1 rounded-2xl border border-white/25 bg-white/35 px-3.5 py-2.5 text-[13px] text-slate-800 dark:border-white/10 dark:bg-white/[0.05] dark:text-slate-100"
                  />
                  <TextInput
                    value={score}
                    onChangeText={setScore}
                    placeholder="百分制成绩"
                    keyboardType="numeric"
                    placeholderTextColor="rgba(148,163,184,0.7)"
                    className="flex-1 rounded-2xl border border-white/25 bg-white/35 px-3.5 py-2.5 text-[13px] text-slate-800 dark:border-white/10 dark:bg-white/[0.05] dark:text-slate-100"
                  />
                </View>

                <View className="mt-2.5 flex-row gap-x-2">
                  {(
                    [
                      ["required", "必修"],
                      ["elective", "选修"],
                      ["other", "其他"],
                    ] as const
                  ).map(([key, label]) => (
                    <Pressable
                      key={key}
                      onPress={() => setType(key)}
                      className={`flex-1 items-center rounded-xl border py-2 ${
                        type === key
                          ? "border-sky-400/70 bg-sky-400/25"
                          : "border-white/15 bg-white/[0.06]"
                      }`}
                    >
                      <Text
                        className={`text-[11px] font-semibold ${
                          type === key
                            ? "text-sky-300"
                            : "text-slate-500 dark:text-slate-400"
                        }`}
                      >
                        {label}
                      </Text>
                    </Pressable>
                  ))}
                  <Pressable
                    onPress={() => setIncluded((v) => !v)}
                    className="flex-row items-center rounded-xl border border-white/15 bg-white/[0.06] px-3 py-2"
                  >
                    <Ionicons
                      name={included ? "checkbox" : "square-outline"}
                      size={13}
                      color={included ? "#38BDF8" : "#94A3B8"}
                    />
                    <Text className="ml-1 text-[11px] font-semibold text-slate-500 dark:text-slate-400">
                      计入
                    </Text>
                  </Pressable>
                </View>

                <Pressable
                  onPress={submit}
                  className="mt-3 items-center rounded-2xl bg-sky-500/85 py-3"
                >
                  <Text className="text-[13px] font-bold text-white">添加</Text>
                </Pressable>

                {notice ? (
                  <Text className="mt-2 text-[11px] text-slate-600 dark:text-slate-300">
                    {notice}
                  </Text>
                ) : null}
              </View>
            </GlassContainer>
          </Animated.View>

          {/* 成绩列表 */}
          {grades.length > 0 ? (
            <Animated.View
              entering={FadeInDown.delay(240).springify()}
              className="mt-3.5"
            >
              <GlassContainer radius={24} intensity={40} borderOpacity={0.2}>
                <View className="px-4 py-4">
                  <Text className="mb-2 text-[14px] font-bold text-slate-800 dark:text-white">
                    成绩单（{grades.length}）
                  </Text>
                  {grades.map((g) => {
                    const gpa = activeRule ? scoreToGpa(activeRule, g) : null;
                    return (
                      <View
                        key={g.id}
                        className="flex-row items-center border-b border-white/10 py-2.5"
                      >
                        <View className="flex-1">
                          <Text
                            numberOfLines={1}
                            className="text-[12.5px] font-semibold text-slate-700 dark:text-slate-200"
                          >
                            {g.name}
                          </Text>
                          <Text className="text-[10px] text-slate-500 dark:text-slate-400">
                            {g.credit} 学分 ·{" "}
                            {g.score != null
                              ? `${g.score}分`
                              : (g.grade ?? "—")}{" "}
                            · {g.includedInGpa ? "计入" : "不计入"}
                          </Text>
                        </View>
                        <Text className="mr-3 text-[13px] font-bold text-sky-500 dark:text-sky-300">
                          {gpa != null ? gpa.toFixed(1) : "—"}
                        </Text>
                        <Pressable onPress={() => removeGrade(g.id)}>
                          <Ionicons
                            name="trash-outline"
                            size={15}
                            color="#94A3B8"
                          />
                        </Pressable>
                      </View>
                    );
                  })}
                </View>
              </GlassContainer>
            </Animated.View>
          ) : null}
        </ScrollView>
      </Backdrop>
    </View>
  );
}
