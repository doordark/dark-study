import { Ionicons } from "@expo/vector-icons";
import * as Network from "expo-network";
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
  recognizeGrades,
  recognizePeriods,
  recognizeScheduleFromImage,
  recognizeScheduleFromText,
} from "@/services/ai";
import {
  recognizeGradesFromTextOffline,
  recognizeGradesOffline,
  recognizeScheduleFromTextOffline,
  recognizeScheduleOffline,
} from "@/services/offlineImport";
import { useImportTask, type TaskKind } from "@/store/useImportTask";
import { useSettings } from "@/store/useSettings";
import { useActiveSchedule, useStore } from "@/store/useStore";
import { toIsoDate } from "@/utils/time";
import type { GradeRecord } from "@/types";

type From = "image" | "camera" | "text";
type Source =
  | { imageBase64: string; mimeType: string; uri: string }
  | { text: string };

/** 网络可用性：连不上或不可达都按离线处理 */
async function isOnline(): Promise<boolean> {
  try {
    const state = await Network.getNetworkStateAsync();
    return !!state.isConnected && state.isInternetReachable !== false;
  } catch {
    return true;
  }
}

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
  const activeSchedule = useActiveSchedule();
  const activeGradeSemester = useStore((s) => s.activeGradeSemester);

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
    return img
      ? { imageBase64: img.base64, mimeType: img.mimeType, uri: img.uri }
      : null;
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

  /**
   * 课程表识别：联网且已配置 Key 时走云端视觉模型（准确率更高），
   * 否则自动切换设备端离线识别（ML Kit OCR + 规则解析），不联网也能导入。
   */
  const onSchedule = (from: From) =>
    startTask("schedule", from, async (source) => {
      const task = useImportTask.getState();
      const online = await isOnline();
      const useAI = online && !!apiKey;

      let schedule;
      // 当前课表的开学日期 / 总周数：让模型把图片里的具体日期换算成周次
      const ctx = {
        startDate: activeSchedule.startDate,
        totalWeeks: activeSchedule.totalWeeks,
        today: toIsoDate(new Date()),
      };
      if (useAI) {
        schedule =
          "text" in source
            ? await recognizeScheduleFromText(source.text, apiKey, ctx)
            : await recognizeScheduleFromImage(
                source.imageBase64,
                apiKey,
                source.mimeType,
                ctx,
              );
      } else {
        task.setPhase(
          "text" in source
            ? "离线模式：正在按规则解析文本…"
            : "离线模式：正在本地识别图片文字…",
          40,
        );
        schedule =
          "text" in source
            ? recognizeScheduleFromTextOffline(source.text)
            : await recognizeScheduleOffline(source.uri);
      }

      if (!schedule.courses.length) {
        task.fail("未识别到有效课程，请更换图片或补充文字说明后重试");
        return;
      }
      task.complete(
        { type: "schedule", schedule },
        `${useAI ? "AI 识别" : "离线识别"}完成：共 ${schedule.courses.length} 门课程，请确认后导入`,
      );
    });

  const onPeriods = (from: From) =>
    startTask("periods", from, async (source) => {
      const task = useImportTask.getState();
      if (!apiKey) {
        task.fail(
          "作息表识别暂只支持在线模式，请先在「设置」填写 DeepSeek API Key",
        );
        return;
      }
      const periods = await recognizePeriods(source, apiKey);
      if (!periods.length) {
        task.fail("未识别到有效作息节次，请确认素材是作息表后重试");
        return;
      }
      task.complete(
        { type: "periods", periods },
        `作息表识别完成：${periods.length} 个节次，请确认后应用`,
      );
    });

  /** 成绩识别：联网且有 Key 走 AI，否则自动切换设备端离线识别（OCR / 表格规则） */
  const onGrades = (from: From) =>
    startTask("grades", from, async (source) => {
      const task = useImportTask.getState();
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
          ? recognizeGradesFromTextOffline(src.text, activeGradeSemester)
          : await recognizeGradesOffline(src.uri, activeGradeSemester);
      };

      let grades: Omit<GradeRecord, "id">[];
      if (useAI) {
        try {
          task.setPhase("AI 正在识别课程成绩…", 38);
          grades = await recognizeGrades(
            "text" in src ? { text: src.text } : src,
            apiKey,
            activeGradeSemester,
          );
        } catch (aiError) {
          // 云端超时/失败时自动降级到本地，避免一直转圈
          task.setPhase("AI 识别未完成，正在切换本地离线识别…", 58);
          try {
            grades = await runOffline();
          } catch {
            throw aiError;
          }
        }
      } else {
        grades = await runOffline();
      }

      if (!grades.length) {
        task.fail("未识别到有效成绩，请更换图片或补充表格后重试");
        return;
      }
      task.complete(
        { type: "grades", grades },
        `${useAI ? "识别完成" : "离线识别完成"}：共 ${grades.length} 条成绩，请确认后导入`,
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
              上传课表 / 成绩单图片或文件，识别后可确认再导入
            </Text>
            <View className="mt-2.5 flex-row items-center rounded-2xl border border-white/25 bg-white/35 px-3.5 py-2.5 dark:border-white/10 dark:bg-white/[0.05]">
              <Ionicons name="information-circle" size={14} color="#94A3B8" />
              <Text className="ml-1.5 flex-1 text-[11px] leading-4 text-slate-600 dark:text-slate-300">
                每个模块都支持「相册识图 / 拍照识别 /
                文档导入」三种方式。联网且有 API Key 时走 AI；断网或无 Key
                时自动切换本地离线识别
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

          {/* 成绩识别 */}
          <Animated.View
            entering={FadeInDown.delay(180).springify()}
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
                      成绩识别
                    </Text>
                    <Text className="text-[11px] text-slate-500 dark:text-slate-400">
                      教务截图 / 成绩单照片 / 表格，自动录入分数、学分与绩点
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
