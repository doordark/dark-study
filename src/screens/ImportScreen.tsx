import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import React, { useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  Text,
  View,
} from "react-native";
import Animated, { FadeInDown } from "react-native-reanimated";

import { Backdrop } from "@/components/Backdrop";
import { GlassContainer } from "@/components/GlassContainer";
import {
  pickImageFromCamera,
  pickImageFromLibrary,
  pickTextDocument,
} from "@/services/fileImport";
import {
  recognizeGpaRules,
  recognizeGrades,
  recognizePeriods,
  recognizeScheduleFromImage,
  recognizeScheduleFromText,
} from "@/services/ai";
import { useSettings } from "@/store/useSettings";
import { useStore } from "@/store/useStore";
import type { Period, Schedule } from "@/types";

type Busy =
  | "schedule-image"
  | "schedule-text"
  | "periods"
  | "rules"
  | "grades"
  | null;
type From = "image" | "camera" | "text";

/** 统一导入方式行：相册识图 / 拍照识别 / 文档导入，四个模块一致 */
function MethodRow({
  busy,
  onPick,
}: {
  busy: boolean;
  onPick: (from: From) => void;
}) {
  const items = [
    { key: "image" as const, icon: "image" as const, label: "相册识图" },
    { key: "camera" as const, icon: "camera" as const, label: "拍照识别" },
    { key: "text" as const, icon: "document-text" as const, label: "文档导入" },
  ];
  return (
    <View className="mt-3.5 flex-row gap-x-2.5">
      {items.map((it) => (
        <Pressable
          key={it.key}
          onPress={() => onPick(it.key)}
          className="flex-1 items-center rounded-2xl border border-white/25 bg-white/25 py-3 dark:border-white/10 dark:bg-white/[0.06]"
        >
          {busy ? (
            <ActivityIndicator size="small" color="#38BDF8" />
          ) : (
            <>
              <Ionicons name={it.icon} size={18} color="#38BDF8" />
              <Text className="mt-1 text-[11px] font-semibold text-slate-600 dark:text-slate-300">
                {it.label}
              </Text>
            </>
          )}
        </Pressable>
      ))}
    </View>
  );
}

export function ImportScreen() {
  const apiKey = useSettings((s) => s.apiKey);
  const importSchedule = useStore((s) => s.importSchedule);
  const setPeriods = useStore((s) => s.setPeriods);
  const addGpaRule = useStore((s) => s.addGpaRule);
  const addGrade = useStore((s) => s.addGrade);

  const [busy, setBusy] = useState<Busy>(null);
  const [preview, setPreview] = useState<Schedule | null>(null);
  const [periodPreview, setPeriodPreview] = useState<Period[] | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const guard = () => {
    if (!apiKey) {
      setMessage("请先在「设置」中填写 DeepSeek API Key");
      return false;
    }
    return true;
  };

  const run = async (key: Exclude<Busy, null>, fn: () => Promise<void>) => {
    if (!guard()) return;
    setBusy(key);
    setMessage(null);
    try {
      await fn();
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "识别失败，请重试");
    } finally {
      setBusy(null);
    }
  };

  /** 统一取源：相册 / 拍照 / 文档三选一 */
  const pickSource = async (
    from: From,
  ): Promise<
    { imageBase64: string; mimeType: string } | { text: string } | null
  > => {
    if (from === "text") {
      const doc = await pickTextDocument();
      return doc ? { text: doc.text } : null;
    }
    const img =
      from === "image"
        ? await pickImageFromLibrary()
        : await pickImageFromCamera();
    return img ? { imageBase64: img.base64, mimeType: img.mimeType } : null;
  };

  /** 课程表识别：图片走视觉模型，文本走文本模型 */
  const onSchedule = async (from: From) => {
    await run("schedule-image", async () => {
      const source = await pickSource(from);
      if (!source) return;
      const schedule =
        "text" in source
          ? await recognizeScheduleFromText(source.text, apiKey)
          : await recognizeScheduleFromImage(
              source.imageBase64,
              apiKey,
              source.mimeType,
            );
      if (!schedule.courses.length) {
        setMessage("未识别到有效课程，请更换图片或补充文字说明后重试");
        return;
      }
      setPreview(schedule);
      setMessage(
        `识别完成：共 ${schedule.courses.length} 门课程，请确认后导入`,
      );
    });
  };

  const onPeriods = async (from: From) => {
    await run("periods", async () => {
      const source = await pickSource(from);
      if (!source) return;
      const periods = await recognizePeriods(source, apiKey);
      setPeriodPreview(periods);
      setMessage(`作息表识别完成：${periods.length} 个节次`);
    });
  };

  const onRules = async (from: From) => {
    await run("rules", async () => {
      const source = await pickSource(from);
      if (!source) return;
      const rules = await recognizeGpaRules(source, apiKey);
      if (!rules.length) {
        setMessage("未识别到换算规则，请更换图片或补充文字说明后重试");
        return;
      }
      rules.forEach((r) => {
        const { id: _id, ...rest } = r;
        addGpaRule(rest);
      });
      setMessage(`已导入 ${rules.length} 条绩点规则，可在「绩点」页查看`);
    });
  };

  /** 成绩单识别：识别课程成绩并批量写入 */
  const onGrades = async (from: From) => {
    await run("grades", async () => {
      const source = await pickSource(from);
      if (!source) return;
      const grades = await recognizeGrades(
        "text" in source ? { text: source.text } : source,
        apiKey,
      );
      if (!grades.length) {
        setMessage("未识别到有效成绩，请更换图片或补充文字说明后重试");
        return;
      }
      grades.forEach((g) => {
        const { id: _id, ...rest } = g;
        addGrade(rest);
      });
      setMessage(`已导入 ${grades.length} 条成绩，可在「绩点」页查看`);
    });
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
          <Animated.View entering={FadeInDown.springify()} className="mb-5">
            <Pressable
              onPress={() => router.back()}
              className="mb-3 h-9 w-9 items-center justify-center rounded-full bg-white/20 dark:bg-white/[0.07]"
            >
              <Ionicons name="chevron-back" size={18} color="#94A3B8" />
            </Pressable>
            <Text className="text-[24px] font-extrabold text-slate-800 dark:text-white">
              AI 智能导入
            </Text>
            <Text className="mt-1 text-[12px] text-slate-500 dark:text-slate-400">
              上传课表图片 / 文件，或拍照识别，一键生成可编辑课表
            </Text>
            <View className="mt-2.5 flex-row items-center rounded-2xl border border-white/25 bg-white/35 px-3.5 py-2.5 dark:border-white/10 dark:bg-white/[0.05]">
              <Ionicons name="information-circle" size={14} color="#94A3B8" />
              <Text className="ml-1.5 flex-1 text-[11px] leading-4 text-slate-600 dark:text-slate-300">
                每个模块都支持「相册识图 / 拍照识别 /
                文档导入」三种方式；文档支持 CSV、JSON、TXT 等文本格式
              </Text>
            </View>
          </Animated.View>

          {/* 课程表识别 */}
          <Animated.View entering={FadeInDown.delay(60).springify()}>
            <GlassContainer radius={24} intensity={42} borderOpacity={0.22}>
              <View className="px-4 py-4">
                <View className="flex-row items-center">
                  <View className="h-9 w-9 items-center justify-center rounded-[13px] bg-sky-400/25">
                    <Ionicons name="images" size={17} color="#38BDF8" />
                  </View>
                  <View className="ml-2.5 flex-1">
                    <Text className="text-[15px] font-bold text-slate-800 dark:text-white">
                      课程表识别
                    </Text>
                    <Text className="text-[11px] text-slate-500 dark:text-slate-400">
                      支持教务截图、手写课表、表格照片
                    </Text>
                  </View>
                </View>

                <MethodRow
                  busy={busy === "schedule-image"}
                  onPick={(f) => onSchedule(f)}
                />
              </View>
            </GlassContainer>
          </Animated.View>

          {/* 作息表识别 */}
          <Animated.View
            entering={FadeInDown.delay(120).springify()}
            className="mt-3.5"
          >
            <GlassContainer radius={24} intensity={42} borderOpacity={0.22}>
              <View className="px-4 py-4">
                <View className="flex-row items-center">
                  <View className="h-9 w-9 items-center justify-center rounded-[13px] bg-violet-400/25">
                    <Ionicons name="time" size={17} color="#A78BFA" />
                  </View>
                  <View className="ml-2.5 flex-1">
                    <Text className="text-[15px] font-bold text-slate-800 dark:text-white">
                      作息表识别
                    </Text>
                    <Text className="text-[11px] text-slate-500 dark:text-slate-400">
                      识别节次与起止时间，自动替换当前作息
                    </Text>
                  </View>
                </View>
                <MethodRow
                  busy={busy === "periods"}
                  onPick={(f) => onPeriods(f)}
                />

                {periodPreview?.length ? (
                  <View className="mt-3 rounded-2xl bg-white/25 px-3 py-2.5 dark:bg-white/[0.05]">
                    {periodPreview.slice(0, 4).map((p) => (
                      <Text
                        key={p.index}
                        className="text-[10.5px] text-slate-600 dark:text-slate-300"
                      >
                        {p.label} · {p.startTime}–{p.endTime}
                      </Text>
                    ))}
                    <Text className="mt-1 text-[10px] text-slate-400">
                      共 {periodPreview.length} 节…
                    </Text>
                    <Pressable
                      onPress={() => {
                        if (periodPreview) {
                          setPeriods(periodPreview);
                          setMessage("作息表已应用到当前课表");
                          setPeriodPreview(null);
                        }
                      }}
                      className="mt-2 items-center rounded-xl bg-violet-500/80 py-2"
                    >
                      <Text className="text-[11px] font-bold text-white">
                        应用作息表
                      </Text>
                    </Pressable>
                  </View>
                ) : null}
              </View>
            </GlassContainer>
          </Animated.View>

          {/* 绩点规则识别 */}
          <Animated.View
            entering={FadeInDown.delay(180).springify()}
            className="mt-3.5"
          >
            <GlassContainer radius={24} intensity={42} borderOpacity={0.22}>
              <View className="px-4 py-4">
                <View className="flex-row items-center">
                  <View className="h-9 w-9 items-center justify-center rounded-[13px] bg-emerald-400/25">
                    <Ionicons name="calculator" size={17} color="#34D399" />
                  </View>
                  <View className="ml-2.5 flex-1">
                    <Text className="text-[15px] font-bold text-slate-800 dark:text-white">
                      绩点规则识别
                    </Text>
                    <Text className="text-[11px] text-slate-500 dark:text-slate-400">
                      上传保研/出国绩点文件图片，自动解析换算档位
                    </Text>
                  </View>
                </View>
                <MethodRow busy={busy === "rules"} onPick={(f) => onRules(f)} />
              </View>
            </GlassContainer>
          </Animated.View>

          {/* 成绩单识别 */}
          <Animated.View
            entering={FadeInDown.delay(210).springify()}
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
                <MethodRow
                  busy={busy === "grades"}
                  onPick={(f) => onGrades(f)}
                />
              </View>
            </GlassContainer>
          </Animated.View>

          {/* 状态提示 */}
          {message ? (
            <Animated.View entering={FadeInDown.springify()} className="mt-4">
              <View className="rounded-2xl border border-sky-300/30 bg-sky-400/15 px-4 py-3 dark:border-sky-400/30 dark:bg-sky-500/15">
                <Text className="text-[11.5px] leading-4 text-sky-700 dark:text-sky-200">
                  {message}
                </Text>
              </View>
            </Animated.View>
          ) : null}

          {/* 识别结果预览 + 导入 */}
          {preview ? (
            <Animated.View entering={FadeInDown.springify()} className="mt-4">
              <GlassContainer radius={24} intensity={46} borderOpacity={0.24}>
                <View className="px-4 py-4">
                  <View className="flex-row items-center justify-between">
                    <Text className="text-[14px] font-bold text-slate-800 dark:text-white">
                      识别结果 · {preview.courses.length} 门课
                    </Text>
                    <Pressable onPress={() => setPreview(null)}>
                      <Ionicons name="close-circle" size={20} color="#94A3B8" />
                    </Pressable>
                  </View>
                  <ScrollView className="mt-2 max-h-[220px]">
                    {preview.courses.map((c, i) => (
                      <View
                        key={`${c.name}-${i}`}
                        className="flex-row items-center border-b border-white/10 py-2"
                      >
                        <View className="flex-1">
                          <Text
                            numberOfLines={1}
                            className="text-[12px] font-semibold text-slate-700 dark:text-slate-200"
                          >
                            {c.name}
                          </Text>
                          <Text className="text-[10px] text-slate-500 dark:text-slate-400">
                            周{c.weekday} · 第{c.startPeriod}–{c.endPeriod}节 ·{" "}
                            {c.classroom} · {c.teacher}
                          </Text>
                        </View>
                      </View>
                    ))}
                  </ScrollView>
                  <View className="mt-3 flex-row gap-x-2.5">
                    <Pressable
                      onPress={() => setPreview(null)}
                      className="flex-1 items-center rounded-2xl border border-white/20 bg-white/15 py-2.5"
                    >
                      <Text className="text-[12px] font-semibold text-slate-500 dark:text-slate-400">
                        放弃
                      </Text>
                    </Pressable>
                    <Pressable
                      onPress={() => {
                        if (preview) {
                          importSchedule(preview);
                          setMessage(
                            "已导入当前课表，可在首页查看；开学/放假日期可在「设置」中调整",
                          );
                          setPreview(null);
                          router.back();
                        }
                      }}
                      className="flex-1 items-center rounded-2xl bg-sky-500/85 py-2.5"
                    >
                      <Text className="text-[12px] font-bold text-white">
                        导入课表
                      </Text>
                    </Pressable>
                  </View>
                </View>
              </GlassContainer>
            </Animated.View>
          ) : null}
        </ScrollView>
      </Backdrop>
    </View>
  );
}
