import Ionicons from "@expo/vector-icons/Ionicons";
import { router, useLocalSearchParams } from "expo-router";
import React, { useEffect, useRef, useState } from "react";
import {
  Alert,
  Platform,
  Pressable,
  ScrollView,
  Share,
  Text,
  View,
  type ScrollViewInstance,
} from "react-native";
import Animated, { FadeInDown } from "react-native-reanimated";

import { Backdrop } from "@/components/Backdrop";
import { GlassContainer } from "@/components/GlassContainer";
import { PasteImportModal } from "@/components/PasteImportModal";
import {
  runTextImportTask,
  startMediaImport,
  type ImportFrom,
} from "@/services/importRunner";
import type { TaskKind } from "@/store/useImportTask";
import { useStore } from "@/store/useStore";
import { EDU_EXTRACT_SNIPPET } from "@/utils/eduAdapters";
import { GRADE_SEMESTERS, semesterLabel } from "@/utils/grades";

/** 统一导入方式行：相册识图 / 拍照识别 / 文档导入 / 粘贴文本，三个模块一致 */
function MethodRow({ onPick }: { onPick: (from: ImportFrom) => void }) {
  const items = [
    { key: "image" as const, icon: "image" as const, label: "相册识图" },
    { key: "camera" as const, icon: "camera" as const, label: "拍照识别" },
    { key: "text" as const, icon: "document-text" as const, label: "文档导入" },
    {
      key: "paste" as const,
      icon: "clipboard-outline" as const,
      label: "粘贴文本",
    },
  ];
  return (
    <View className="mt-3.5 flex-row gap-x-2">
      {items.map((it) => (
        <Pressable
          key={it.key}
          onPress={() => onPick(it.key)}
          className="flex-1 items-center rounded-2xl border border-white/25 bg-white/25 py-3 dark:border-white/10 dark:bg-white/[0.06]"
        >
          <Ionicons name={it.icon} size={17} color="#38BDF8" />
          <Text className="mt-1 text-[10.5px] font-semibold text-slate-600 dark:text-slate-300">
            {it.label}
          </Text>
        </Pressable>
      ))}
    </View>
  );
}

export function ImportScreen() {
  const params = useLocalSearchParams<{ focus?: string }>();
  const focusTarget =
    params.focus === "periods" ||
    params.focus === "schedule" ||
    params.focus === "grades"
      ? params.focus
      : undefined;

  const gradeYears = useStore((s) => s.gradeYears);
  const activeGradeYearId = useStore((s) => s.activeGradeYearId);
  const activeGradeSemester = useStore((s) => s.activeGradeSemester);
  const setActiveGradeYear = useStore((s) => s.setActiveGradeYear);
  const setActiveGradeSemester = useStore((s) => s.setActiveGradeSemester);

  const [pasteKind, setPasteKind] = useState<TaskKind | null>(null);
  const [eduGuideOpen, setEduGuideOpen] = useState(false);
  const [snippetCopied, setSnippetCopied] = useState(false);
  const copyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const scrollRef = useRef<ScrollViewInstance>(null);
  const [periodsY, setPeriodsY] = useState<number | null>(null);
  const [gradesY, setGradesY] = useState<number | null>(null);

  useEffect(() => {
    return () => {
      if (copyTimerRef.current) clearTimeout(copyTimerRef.current);
    };
  }, []);

  const handleCopyEduSnippet = async () => {
    try {
      if (
        Platform.OS === "web" &&
        typeof navigator !== "undefined" &&
        navigator.clipboard?.writeText
      ) {
        await navigator.clipboard.writeText(EDU_EXTRACT_SNIPPET);
        setSnippetCopied(true);
        if (copyTimerRef.current) clearTimeout(copyTimerRef.current);
        copyTimerRef.current = setTimeout(() => setSnippetCopied(false), 2000);
        return;
      }
      const res = await Share.share({
        title: "Dark Study 教务只读提取脚本",
        message: EDU_EXTRACT_SNIPPET,
      });
      if (res.action !== Share.dismissedAction) {
        setSnippetCopied(true);
        if (copyTimerRef.current) clearTimeout(copyTimerRef.current);
        copyTimerRef.current = setTimeout(() => setSnippetCopied(false), 2000);
      }
    } catch {
      Alert.alert(
        "提示",
        "可长按下方脚本框全选复制，在电脑浏览器打开教务页面后粘贴到控制台运行",
      );
    }
  };

  useEffect(() => {
    if (focusTarget === "periods" && periodsY != null) {
      scrollRef.current?.scrollTo({
        y: Math.max(0, periodsY - 24),
        animated: true,
      });
    } else if (focusTarget === "grades" && gradesY != null) {
      scrollRef.current?.scrollTo({
        y: Math.max(0, gradesY - 24),
        animated: true,
      });
    }
  }, [focusTarget, periodsY, gradesY]);

  const currentYearName =
    gradeYears.find((y) => y.id === activeGradeYearId)?.name ??
    gradeYears[0]?.name ??
    "默认学年";

  const handlePick = (kind: TaskKind, from: ImportFrom) => {
    if (from === "paste") {
      setPasteKind(kind);
      return;
    }
    void startMediaImport(
      kind,
      from,
      kind === "grades"
        ? {
            yearId: activeGradeYearId,
            yearName: currentYearName,
            semester: activeGradeSemester,
          }
        : undefined,
    );
  };

  return (
    <View className="flex-1">
      <Backdrop>
        <ScrollView
          ref={scrollRef}
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
              上传课表 / 作息表 / 成绩单图片、表格或粘贴文字，确认修正后再入库
            </Text>
            <View className="mt-2.5 flex-row items-center rounded-2xl border border-white/25 bg-white/35 px-3.5 py-2.5 dark:border-white/10 dark:bg-white/[0.05]">
              <Ionicons name="information-circle" size={14} color="#94A3B8" />
              <Text className="ml-1.5 flex-1 text-[11px] leading-4 text-slate-600 dark:text-slate-300">
                全部模块均支持「相册（多选）/ 拍照 / 文档（pdf、xls、xlsx、csv、ics、html、json、txt）/ 粘贴文本（WakeUp、新正方、强智直导）」。联网且有 API Key 优先走 AI，断网或无 Key 自动切换本地离线识别
              </Text>
            </View>
          </Animated.View>

          {/* 课程表识别 */}
          <Animated.View entering={FadeInDown.delay(60).springify()}>
            <GlassContainer
              radius={24}
              intensity={42}
              borderOpacity={focusTarget === "schedule" ? 0.5 : 0.22}
            >
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
                      支持教务截图、PDF / XLS / XLSX / ICS 日历、WakeUp 与正方·强智直导（默认保留当前作息）
                    </Text>
                  </View>
                </View>

                <MethodRow onPick={(from) => handlePick("schedule", from)} />
              </View>
            </GlassContainer>
          </Animated.View>

          {/* 作息表识别 */}
          <Animated.View
            entering={FadeInDown.delay(120).springify()}
            onLayout={(e) => setPeriodsY(e.nativeEvent.layout.y)}
            className="mt-3.5"
          >
            <GlassContainer
              radius={24}
              intensity={42}
              borderOpacity={focusTarget === "periods" ? 0.55 : 0.22}
            >
              <View
                className={`px-4 py-4 ${
                  focusTarget === "periods"
                    ? "rounded-[24px] border border-violet-400/50"
                    : ""
                }`}
              >
                <View className="flex-row items-center">
                  <View className="h-9 w-9 items-center justify-center rounded-[13px] bg-violet-400/25">
                    <Ionicons name="time" size={17} color="#A78BFA" />
                  </View>
                  <View className="ml-2.5 flex-1">
                    <View className="flex-row items-center gap-1.5">
                      <Text className="text-[15px] font-bold text-slate-800 dark:text-white">
                        作息表识别
                      </Text>
                      {focusTarget === "periods" ? (
                        <View className="rounded-full bg-violet-500/20 px-2 py-0.5">
                          <Text className="text-[9.5px] font-bold text-violet-600 dark:text-violet-300">
                            推荐入口
                          </Text>
                        </View>
                      ) : null}
                    </View>
                    <Text className="text-[11px] text-slate-500 dark:text-slate-400">
                      识别节次与起止时间，支持离线解析与预览逐行修正、删除误识别项
                    </Text>
                  </View>
                </View>
                <MethodRow onPick={(from) => handlePick("periods", from)} />
              </View>
            </GlassContainer>
          </Animated.View>

          {/* 成绩识别 */}
          <Animated.View
            entering={FadeInDown.delay(180).springify()}
            onLayout={(e) => setGradesY(e.nativeEvent.layout.y)}
            className="mt-3.5"
          >
            <GlassContainer
              radius={24}
              intensity={42}
              borderOpacity={focusTarget === "grades" ? 0.5 : 0.22}
            >
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
                      教务截图 / PDF 成绩单 / XLS·XLSX 表格 / 教务 JSON，自动匹配类型与防重
                    </Text>
                  </View>
                </View>

                {/* 显式展示与快速切换成绩归属学年/默认学期 */}
                <View className="mt-3 gap-1.5 rounded-2xl bg-white/20 px-3 py-2 dark:bg-white/[0.04]">
                  <View className="flex-row items-center">
                    <Text className="mr-2 text-[10px] font-semibold text-slate-500 dark:text-slate-400">
                      归入学年
                    </Text>
                    <ScrollView
                      horizontal
                      showsHorizontalScrollIndicator={false}
                      contentContainerStyle={{ gap: 5 }}
                      className="flex-1"
                    >
                      {gradeYears.map((y) => {
                        const on = y.id === activeGradeYearId;
                        return (
                          <Pressable
                            key={y.id}
                            onPress={() => setActiveGradeYear(y.id)}
                            className={`rounded-full px-2.5 py-0.5 ${
                              on
                                ? "bg-sky-500/85"
                                : "bg-white/30 dark:bg-white/[0.08]"
                            }`}
                          >
                            <Text
                              className={`text-[10px] font-semibold ${
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
                    <Text className="mr-2 text-[10px] font-semibold text-slate-500 dark:text-slate-400">
                      默认学期
                    </Text>
                    <View className="flex-1 flex-row gap-1.5">
                      {GRADE_SEMESTERS.map((s) => {
                        const on = s.kind === activeGradeSemester;
                        return (
                          <Pressable
                            key={s.kind}
                            onPress={() => setActiveGradeSemester(s.kind)}
                            className={`flex-1 items-center rounded-lg py-0.5 ${
                              on
                                ? "bg-sky-500/85"
                                : "bg-white/30 dark:bg-white/[0.08]"
                            }`}
                          >
                            <Text
                              className={`text-[10px] font-semibold ${
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

                <MethodRow onPick={(from) => handlePick("grades", from)} />
              </View>
            </GlassContainer>
          </Animated.View>

          {/* 教务系统 / WakeUp 快速直导说明（折叠卡） */}
          <Animated.View
            entering={FadeInDown.delay(240).springify()}
            className="mt-3.5"
          >
            <GlassContainer radius={24} intensity={38} borderOpacity={0.2}>
              <View className="px-4 py-3.5">
                <Pressable
                  onPress={() => setEduGuideOpen((v) => !v)}
                  className="flex-row items-center justify-between"
                >
                  <View className="flex-1 flex-row items-center">
                    <View className="h-8 w-8 items-center justify-center rounded-[11px] bg-emerald-400/20">
                      <Ionicons name="school-outline" size={16} color="#10B981" />
                    </View>
                    <View className="ml-2.5 flex-1">
                      <Text className="text-[13.5px] font-bold text-slate-800 dark:text-white">
                        教务系统 / WakeUp 快速直导说明
                      </Text>
                      <Text className="text-[10.5px] text-slate-500 dark:text-slate-400">
                        支持 .pdf / .xls / .xlsx / .ics / WakeUp / 新正方 / 强智
                      </Text>
                    </View>
                  </View>
                  <Ionicons
                    name={eduGuideOpen ? "chevron-up" : "chevron-down"}
                    size={16}
                    color="#94A3B8"
                  />
                </Pressable>

                {eduGuideOpen ? (
                  <View className="mt-3 gap-2.5 border-t border-white/20 pt-3 dark:border-white/10">
                    <View className="flex-row flex-wrap gap-1.5">
                      {[
                        ".pdf 成绩单/课表",
                        ".xls / .xlsx",
                        ".ics 日历",
                        "WakeUp 导出",
                        "新正方 JSON",
                        "强智 / 青果 HTML",
                      ].map((tag) => (
                        <View
                          key={tag}
                          className="rounded-full border border-emerald-400/25 bg-emerald-500/10 px-2.5 py-0.5"
                        >
                          <Text className="text-[10px] font-semibold text-emerald-700 dark:text-emerald-300">
                            {tag}
                          </Text>
                        </View>
                      ))}
                    </View>

                    <Text className="text-[11px] leading-[17px] text-slate-600 dark:text-slate-300">
                      • 教务导出的 .pdf / .xls（含伪装 HTML、XML 及旧版二进制）/ .xlsx / .ics 直接点「文档导入」。{"\n"}
                      • WakeUp 5 行分享数据、新正方接口 JSON 或强智课表 HTML 直接点「粘贴文本」离线直导。{"\n"}
                      • 电脑浏览器打开正方 / 强智 / 青果页面后，按 F12 粘贴运行下方只读脚本，将复制结果粘回 App 即可。
                    </Text>

                    <View className="rounded-2xl border border-white/25 bg-slate-900/5 p-2.5 dark:border-white/10 dark:bg-black/30">
                      <Text
                        selectable
                        numberOfLines={3}
                        className="font-mono text-[10px] leading-4 text-slate-600 dark:text-slate-300"
                      >
                        {EDU_EXTRACT_SNIPPET}
                      </Text>
                    </View>

                    <View className="flex-row items-center justify-between gap-2">
                      <Text className="flex-1 text-[10px] text-slate-500 dark:text-slate-400">
                        纯只读脚本：仅读取当前页表格，不联网、不读取账号密码
                      </Text>
                      <Pressable
                        onPress={() => {
                          void handleCopyEduSnippet();
                        }}
                        className="flex-row items-center gap-1 rounded-xl bg-emerald-500/85 px-3 py-1.5"
                      >
                        <Ionicons
                          name={snippetCopied ? "checkmark" : "copy-outline"}
                          size={13}
                          color="#FFFFFF"
                        />
                        <Text className="text-[11px] font-bold text-white">
                          {snippetCopied
                            ? "已复制"
                            : Platform.OS === "web"
                              ? "复制脚本"
                              : "复制 / 发电脑"}
                        </Text>
                      </Pressable>
                    </View>
                  </View>
                ) : null}
              </View>
            </GlassContainer>
          </Animated.View>
        </ScrollView>
      </Backdrop>

      {pasteKind ? (
        <PasteImportModal
          visible
          kind={pasteKind}
          subtitle={
            pasteKind === "grades"
              ? `将归入「${currentYearName} · ${semesterLabel(activeGradeSemester)}」（文本内若含学期会自动识别）`
              : undefined
          }
          onClose={() => setPasteKind(null)}
          onSubmit={(text) => {
            const target = pasteKind;
            setPasteKind(null);
            void runTextImportTask(target, text, {
              sourceLabel: "粘贴文本",
              ...(target === "grades"
                ? {
                    yearId: activeGradeYearId,
                    yearName: currentYearName,
                    semester: activeGradeSemester,
                  }
                : {}),
            });
          }}
        />
      ) : null}
    </View>
  );
}
