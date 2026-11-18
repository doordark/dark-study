import { useMemo, useState } from "react";
import { KeyboardAvoidingView, Modal, Pressable, ScrollView, Text, TextInput, View } from "react-native";
import type { GradeRecord, GradeRule, GradeType } from "@/types";
import { projectGrades, type ProjectionCourse } from "@/utils/gradeProjection";
import { formatGpa } from "@/utils/grades";

const field = "min-h-11 rounded-xl bg-slate-400/10 px-3 text-sm text-slate-900 dark:text-white";
const caption = "text-xs text-slate-600 dark:text-slate-300";
const button = "rounded-xl bg-sky-400/15 px-3 py-2";
const action = "text-xs font-semibold text-sky-700 dark:text-sky-300";

export function GradeProjection({ grades, rule, types, scope, onClose }: {
  grades: GradeRecord[]; rule?: GradeRule; types: GradeType[]; scope: string; onClose: () => void;
}) {
  const defaultType = types.find(item => !rule?.excludedTypes.includes(item.id))?.id ?? types[0]?.id ?? "required";
  const [courses, setCourses] = useState<ProjectionCourse[]>([{ id: 1, credit: "3", score: "", type: defaultType }]);
  const [solveFor, setSolveFor] = useState<number | null>(null);
  const [goal, setGoal] = useState("");
  const goalValue = goal.trim() ? Number(goal) : undefined;
  const validGoal = goalValue !== undefined && Number.isFinite(goalValue) && goalValue >= 0 && goalValue <= 5;
  const { actual, projection, prepared, requiredScore } = useMemo(
    () => projectGrades(grades, rule, courses, goalValue, solveFor), [grades, rule, courses, goalValue, solveFor],
  );
  const edit = (id: number, patch: Partial<Pick<ProjectionCourse, "credit" | "score" | "type">>) =>
    setCourses(previous => previous.map(course => course.id === id ? { ...course, ...patch } : course));
  const selectedIndex = courses.findIndex(course => course.id === solveFor);
  const delta = actual.value !== null && projection?.value != null ? projection.value - actual.value : null;
  const targetMet = validGoal && projection?.value != null && projection.value + 1e-10 >= goalValue;

  return <Modal visible transparent animationType="fade" onRequestClose={onClose}>
    <KeyboardAvoidingView behavior="padding" className="flex-1 items-center justify-center bg-black/50 px-5">
      <View className="max-h-[88%] w-full max-w-[560px] gap-3 rounded-3xl bg-white p-5 dark:bg-slate-900">
        <Text accessibilityRole="header" className="text-lg font-bold text-slate-900 dark:text-white">绩点目标试算</Text>
        <ScrollView style={{ flexShrink: 1, flexGrow: 0 }} keyboardShouldPersistTaps="handled">
          <View className="gap-3">
            <Text className={caption}>{scope} · {rule?.name ?? "默认规则"}</Text>
            <View className="gap-1"><Text className={caption}>目标绩点（可选）</Text><TextInput accessibilityLabel="目标绩点" placeholder="例如 3.50" placeholderTextColor="#64748B"
              value={goal} onChangeText={setGoal} keyboardType="decimal-pad" maxLength={5} className={field} /></View>
            {courses.map((course, index) => {
              const details = prepared[index];
              return <View key={course.id} className="gap-2 rounded-2xl border border-slate-400/20 p-3">
                <View className="flex-row items-center gap-2">
                  <Text className="flex-1 font-semibold text-slate-800 dark:text-white">课程 {index + 1}</Text>
                  {!details.excluded ? <Pressable accessibilityRole="radio" accessibilityState={{ checked: solveFor === course.id }}
                    onPress={() => setSolveFor(solveFor === course.id ? null : course.id)} className={button}>
                    <Text className={action}>{solveFor === course.id ? "✓ 反推这门" : "反推这门"}</Text>
                  </Pressable> : null}
                  {courses.length > 1 ? <Pressable accessibilityRole="button" accessibilityLabel={`移除试算课程 ${index + 1}`}
                    onPress={() => {
                      setCourses(previous => previous.filter(row => row.id !== course.id));
                      if (solveFor === course.id) setSolveFor(null);
                    }} className="rounded-xl px-2 py-2"><Text className={caption}>移除</Text></Pressable> : null}
                </View>
                <View className="flex-row gap-2">
                  <View className="flex-1 gap-1"><Text className={caption}>学分</Text><TextInput accessibilityLabel={`课程 ${index + 1} 学分`}
                    value={course.credit} onChangeText={credit => edit(course.id, { credit })} keyboardType="decimal-pad" maxLength={8} className={field} /></View>
                  <View className="flex-1 gap-1"><Text className={caption}>预计成绩</Text><TextInput accessibilityLabel={`课程 ${index + 1} 预计成绩`}
                    value={course.score} onChangeText={score => edit(course.id, { score })} placeholder="85 或 A" placeholderTextColor="#64748B" maxLength={12} className={field} /></View>
                </View>
                <View className="flex-row flex-wrap gap-2">{types.map(item =>
                  <Pressable key={item.id} accessibilityRole="radio" accessibilityState={{ checked: course.type === item.id }} onPress={() => edit(course.id, { type: item.id })}
                    className={`rounded-xl px-2.5 py-1.5 ${course.type === item.id ? "bg-sky-400/25" : "bg-slate-400/10"}`}>
                    <Text className={caption}>{item.name}</Text>
                  </Pressable>)}</View>
                {details.excluded ? <Text className={caption}>当前规则排除了这类课程。</Text> : !details.validCredit || (course.score.trim() && details.row.gpa === null)
                  ? <Text className="text-xs text-rose-600 dark:text-rose-300">请填写有效学分和成绩。</Text> : null}
              </View>;
            })}
            {courses.length < 20 ? <Pressable accessibilityRole="button" onPress={() => setCourses(previous =>
              [...previous, { id: Math.max(...previous.map(row => row.id)) + 1, credit: "3", score: "", type: defaultType }])}
              className={`${button} self-start`}><Text className={action}>＋ 添加试算课程</Text></Pressable> : null}
            <View className="gap-2 rounded-2xl bg-sky-400/10 p-3">
              <Text className="font-bold text-sky-800 dark:text-sky-200">当前 {formatGpa(actual.value)} → 预计 {formatGpa(projection?.value)}</Text>
              {delta !== null ? <Text className={caption}>预计变化 {delta >= 0 ? "+" : ""}{delta.toFixed(2)}</Text> : null}
              {validGoal && projection?.value != null ? <Text className={caption}>{targetMet ? "预计达到目标" : "预计未达到目标"}</Text> : null}
              {selectedIndex >= 0 ? <Text className="text-sm font-semibold text-sky-800 dark:text-sky-200">{requiredScore === null
                ? `课程 ${selectedIndex + 1} 即使拿 100 分也达不到目标。`
                : requiredScore !== undefined ? `课程 ${selectedIndex + 1} 至少需要 ${requiredScore} 分（百分制整数）。`
                  : "填写目标、这门课的学分和其他计入课程的预计成绩后，即可反推。"}</Text> : null}
              {goal.trim() && !validGoal ? <Text className="text-xs text-rose-600 dark:text-rose-300">目标绩点需在 0 到 5 之间。</Text> : null}
              {actual.missingCredit || actual.missing ? <Text className={caption}>缺学分或绩点的正式成绩沿用当前统计规则处理。</Text> : null}
            </View>
          </View>
        </ScrollView>
        <Pressable accessibilityRole="button" onPress={onClose} className="self-end rounded-xl bg-sky-600 px-4 py-2">
          <Text className="font-bold text-white">关闭试算</Text>
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  </Modal>;
}
