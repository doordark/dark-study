import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import React from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
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
import { useImportTask, type TaskKind } from "@/store/useImportTask";
import { useSettings } from "@/store/useSettings";
import { useStore } from "@/store/useStore";

type From = "image" | "camera" | "text";
type Source = { imageBase64: string; mimeType: string } | { text: string };

/** 统一导入方式行：相册识图 / 拍照识别 / 文档导入，四个模块一致 */
function MethodRow({ onPick }: { onPick: (from: From) => void }) {
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
          <Ionicons name={it.icon} size={18} color="#38BDF8" />
          <Text className="mt-1 text-[11px] font-semibold text-slate-600 dark:text-slate-300">
            {it.label}
          </Text>
        </Pressable>
      ))}
    </View>
  );
}

export function ImportScreen() {
  const apiKey = useSettings((s) => s.apiKey);
  const addGpaRule = useStore((s) => s.addGpaRule);
  const addGrade = useStore((s) => s.addGrade);

  /** 统一取源：相册 / 拍照 / 文档三选一，取消返回 null */
  const pickSource = async (from: From): Promise<Source | null> => {
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

  /**
   * 识别任务统一入口：
   * 选完素材即弹出全局进度弹窗，分析转后台（可收起为悬浮进度球），
   * 成功 / 失败都由全局弹窗明确反馈，不依赖停留在本页
   */
  const startTask = async (
    kind: TaskKind,
    from: From,
    analyze: (source: Source) => Promise<void>,
  ) => {
    const task = useImportTask.getState();
    if (!apiKey) {
      task.fail("请先在「设置」中填写 DeepSeek API Key，再使用 AI 导入");
      return;
    }
    // 已有分析进行中：把进度弹窗带回前台，不打断后台任务
    if (task.status === "analyzing") {
      task.setExpanded(true);
      return;
    }

    let source: Source | null = null;
    try {
      source = await pickSource(from);
    } catch (e) {
      useImportTask
        .getState()
        .fail(e instanceof Error ? e.message : "读取素材失败，请重试");
      return;
    }
    if (!source) return; // 用户取消选择

    useImportTask.getState().open(kind, from === "text" ? "文档" : "照片");
    try {
      await analyze(source);
    } catch (e) {
      useImportTask
        .getState()
        .fail(e instanceof Error ? e.message : "识别失败，请重试");
    }
  };

  /** 课程表识别：图片走视觉模型，文本走文本模型 */
  const onSchedule = (from: From) =>
    startTask("schedule", from, async (source) => {
      const schedule =
        "text" in source
          ? await recognizeScheduleFromText(source.text, apiKey)
          : await recognizeScheduleFromImage(
              source.imageBase64,
              apiKey,
              source.mimeType,
            );
      const task = useImportTask.getState();
      if (!schedule.courses.length) {
        task.fail("未识别到有效课程，请更换图片或补充文字说明后重试");
        return;
      }
      task.complete(
        { type: "schedule", schedule },
        `识别完成：共 ${schedule.courses.length} 门课程，请确认后导入`,
      );
    });

  const onPeriods = (from: From) =>
    startTask("periods", from, async (source) => {
      const periods = await recognizePeriods(source, apiKey);
      const task = useImportTask.getState();
      if (!periods.length) {
        task.fail("未识别到有效作息节次，请确认素材是作息表后重试");
        return;
      }
      task.complete(
        { type: "periods", periods },
        `作息表识别完成：${periods.length} 个节次，请确认后应用`,
      );
    });

  const onRules = (from: From) =>
    startTask("rules", from, async (source) => {
      const rules = await recognizeGpaRules(source, apiKey);
      const task = useImportTask.getState();
      if (!rules.length) {
        task.fail("未识别到换算规则，请更换图片或补充文字说明后重试");
        return;
      }
      rules.forEach((r) => {
        const { id: _id, ...rest } = r;
        addGpaRule(rest);
      });
      task.complete(
        { type: "count", count: rules.length },
        `已导入 ${rules.length} 条绩点规则，可在「绩点」页查看`,
      );
    });

  /** 成绩单识别：识别课程成绩并批量写入 */
  const onGrades = (from: From) =>
    startTask("grades", from, async (source) => {
      const grades = await recognizeGrades(
        "text" in source ? { text: source.text } : source,
        apiKey,
      );
      const task = useImportTask.getState();
      if (!grades.length) {
        task.fail("未识别到有效成绩，请更换图片或补充文字说明后重试");
        return;
      }
      grades.forEach((g) => {
        const { id: _id, ...rest } = g;
        addGrade(rest);
      });
      task.complete(
        { type: "count", count: grades.length },
        `已导入 ${grades.length} 条成绩，可在「绩点」页查看`,
      );
    });

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
                文档导入」三种方式；选择素材后会弹出分析进度弹窗，可收起为悬浮球后台分析
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

                <MethodRow onPick={onSchedule} />
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
                      识别节次与起止时间，确认后替换当前作息
                    </Text>
                  </View>
                </View>
                <MethodRow onPick={onPeriods} />
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
                <MethodRow onPick={onRules} />
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
                <MethodRow onPick={onGrades} />
              </View>
            </GlassContainer>
          </Animated.View>
        </ScrollView>
      </Backdrop>
    </View>
  );
}
