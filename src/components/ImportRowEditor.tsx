import { useState } from "react";
import { KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { normalizeCoursePatch } from "@/utils/courseEditing";
import { detectScoreType, normalizeGradeInput } from "@/utils/grades";
import type { Course, GradeDraft, Schedule } from "@/types";

type Target =
  | { type: "course"; course: Course; schedule: Schedule; save: (course: Course) => boolean }
  | { type: "grade"; grade: GradeDraft; save: (grade: GradeDraft) => boolean };

function parseWeeks(input: string, maximum: number): number[] {
  const weeks = new Set<number>();
  for (const part of input.trim().split(/[,，、\s]+/)) {
    const match = /^(\d+)(?:[-–](\d+))?$/.exec(part);
    const start = Number(match?.[1]);
    const end = Number(match?.[2] ?? start);
    if (!match || start < 1 || start > end || end > maximum) throw new Error(`周次请输入 1–${maximum} 范围内的数字或区间，例如 1-8,10。`);
    for (let week = start; week <= end; week++) weeks.add(week);
  }
  return [...weeks].sort((a, b) => a - b);
}

function initialFields(target: Target) {
  if (target.type === "course") {
    const { course } = target;
    return [
      { label: "课程名称", value: course.name },
      { label: "星期（1 到 7）", value: String(course.weekday), keyboard: "number-pad" },
      { label: "起始节次", value: String(course.startPeriod), keyboard: "number-pad" },
      { label: "结束节次", value: String(course.endPeriod), keyboard: "number-pad" },
      { label: "上课周次（例如 1-8,10）", value: course.weeks.join(",") },
      { label: "教室", value: course.classroom },
      { label: "学分", value: String(course.credits ?? ""), keyboard: "decimal-pad" },
    ] as const;
  }
  const { grade } = target;
  return [
    { label: "课程名称", value: grade.name },
    { label: "学分", value: String(grade.credit ?? ""), keyboard: "decimal-pad" },
    { label: "成绩（例如 87、A、优秀）", value: grade.score },
    { label: "绩点（0 到 5，可留空）", value: String(grade.gpa ?? ""), keyboard: "decimal-pad" },
  ] as const;
}

function credits(text: string) {
  if (!text) return undefined;
  const value = Number(text);
  if (!Number.isFinite(value) || value <= 0) throw new Error("学分应为大于 0 的数字，也可以留空。");
  return value;
}

export function ImportRowEditor({ target, pages, onClose }: { target: Target; pages?: number[]; onClose: () => void }) {
  const fields = initialFields(target);
  const [values, setValues] = useState<string[]>(() => fields.map(field => field.value));
  const [error, setError] = useState("");
  const save = () => {
    try {
      const [name, ...rest] = values.map(value => value.trim());
      let saved: boolean;
      if (target.type === "course") {
        const [weekday, start, end, weeks, classroom, credit] = rest;
        const { course, schedule } = target;
        const periodPatch = Number(start) === course.startPeriod && Number(end) === course.endPeriod
          ? {} : { startPeriod: Number(start), endPeriod: Number(end) };
        const patch = normalizeCoursePatch(course, { name, weekday: Number(weekday), classroom,
          weeks: parseWeeks(weeks, schedule.totalWeeks), credits: credits(credit), ...periodPatch }, schedule);
        saved = target.save({ ...course, ...patch });
      } else {
        const [credit, score, gpa] = rest;
        const scoreType = score === target.grade.score ? target.grade.scoreType : detectScoreType(score);
        if (score && scoreType === "numeric" && (!Number.isFinite(Number(score)) || Number(score) < 0 || Number(score) > 100)) throw new Error("百分制成绩应在 0 到 100 之间。");
        if (gpa && (!Number.isFinite(Number(gpa)) || Number(gpa) < 0 || Number(gpa) > 5)) throw new Error("绩点应在 0 到 5 之间。");
        const oldGpa = String(target.grade.gpa ?? "");
        const draft = normalizeGradeInput({ ...target.grade, name, credit: credits(credit), score, scoreType,
          gpa: score !== target.grade.score && gpa === oldGpa ? undefined : gpa });
        if (!draft) throw new Error("请填写课程名称，以及成绩或绩点。");
        saved = target.save({ ...target.grade, ...draft, type: target.grade.type });
      }
      if (saved) onClose();
      else setError("导入预览已更新，请关闭后重新打开这条记录。");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "请核对输入后再试。");
    }
  };

  return <Modal visible transparent animationType="fade" onRequestClose={onClose}>
    <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} className="flex-1 justify-center bg-black/50 px-5">
      <View className="max-h-[88%] gap-3 rounded-3xl bg-white p-5 dark:bg-slate-900">
        <Text accessibilityRole="header" className="text-lg font-bold text-slate-900 dark:text-white">修正识别结果</Text>
        {pages?.length ? <Text className="text-xs text-slate-500 dark:text-slate-400">来源：第 {pages.join("、")} 张图片</Text> : null}
        <ScrollView style={{ flexGrow: 0, flexShrink: 1 }} keyboardShouldPersistTaps="handled">
          {fields.map((field, index) => <View className="mb-3 gap-1" key={field.label}>
            <Text className="text-xs text-slate-600 dark:text-slate-300">{field.label}</Text>
            <TextInput accessibilityLabel={field.label} value={values[index]} keyboardType={"keyboard" in field ? field.keyboard : "default"}
              onChangeText={value => setValues(previous => previous.map((old, i) => index === i ? value : old))}
              className="min-h-11 rounded-xl bg-slate-100 px-3 text-slate-900 dark:bg-slate-800 dark:text-white" />
          </View>)}
        </ScrollView>
        {error ? <Text accessibilityLiveRegion="polite" className="text-rose-600 dark:text-rose-300">{error}</Text> : null}
        <View className="flex-row justify-end gap-4">
          <Pressable accessibilityRole="button" className="rounded-xl px-4 py-2" onPress={onClose}><Text className="text-slate-700 dark:text-slate-200">取消</Text></Pressable>
          <Pressable accessibilityRole="button" className="rounded-xl bg-sky-600 px-4 py-2" onPress={save}><Text className="font-semibold text-white">保存到预览</Text></Pressable>
        </View>
      </View>
    </KeyboardAvoidingView>
  </Modal>;
}
