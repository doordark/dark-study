import Ionicons from "@expo/vector-icons/Ionicons";
import React from "react";
import { Modal, Pressable, ScrollView, Text, View } from "react-native";
import Animated, { FadeInDown } from "react-native-reanimated";

import { GlassContainer } from "@/components/GlassContainer";
import type { ImportFrom } from "@/services/importRunner";
import type { GpaScaleId, GradeYear, SemesterKind } from "@/types";
import { GPA_SCALES, GRADE_SEMESTERS } from "@/utils/grades";

export interface GpaScalePickerModalProps {
  gpaScale: GpaScaleId;
  onSelect: (next: GpaScaleId) => void;
  onClose: () => void;
}

export function GpaScalePickerModal({
  gpaScale,
  onSelect,
  onClose,
}: GpaScalePickerModalProps) {
  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <View className="flex-1 justify-end bg-black/45">
        <Pressable className="flex-1" onPress={onClose} />
        <Animated.View entering={FadeInDown.springify()}>
          <GlassContainer
            variant="sheet"
            radius={32}
            intensity={62}
            borderOpacity={0.3}
            style={{ paddingBottom: 24 }}
          >
            <View className="px-5 pt-5">
              <View className="flex-row items-center justify-between">
                <Text className="text-[17px] font-bold text-slate-800 dark:text-white">
                  选择学校绩点制式
                </Text>
                <Pressable
                  onPress={onClose}
                  className="h-8 w-8 items-center justify-center rounded-full bg-white/25 dark:bg-white/[0.08]"
                >
                  <Ionicons name="close" size={16} color="#94A3B8" />
                </Pressable>
              </View>
              <Text className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">
                影响手动录入换算、识别缺绩点补全以及绩点目标试算反推
              </Text>
              <View className="mt-3 gap-2">
                {GPA_SCALES.map((item) => {
                  const on = item.id === gpaScale;
                  return (
                    <Pressable
                      key={item.id}
                      onPress={() => onSelect(item.id)}
                      className={`rounded-2xl border px-3.5 py-2.5 ${
                        on
                          ? "border-sky-400/70 bg-sky-400/18"
                          : "border-white/25 bg-white/25 dark:border-white/10 dark:bg-white/[0.06]"
                      }`}
                    >
                      <View className="flex-row items-center justify-between">
                        <Text className="text-[13px] font-bold text-slate-800 dark:text-white">
                          {item.label}
                        </Text>
                        {on ? (
                          <Ionicons
                            name="checkmark-circle"
                            size={16}
                            color="#38BDF8"
                          />
                        ) : null}
                      </View>
                      <Text className="mt-0.5 text-[10.5px] text-slate-500 dark:text-slate-400">
                        {item.summary}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            </View>
          </GlassContainer>
        </Animated.View>
      </View>
    </Modal>
  );
}

export interface GradeImportSheetModalProps {
  gradeYears: GradeYear[];
  importYearId: string;
  importSemester: SemesterKind;
  onSelectYear: (yearId: string) => void;
  onSelectSemester: (semester: SemesterKind) => void;
  onStartImport: (from: ImportFrom) => void;
  onOpenScheduleImport: () => void;
  onOpenCreate: () => void;
  onClose: () => void;
}

export function GradeImportSheetModal({
  gradeYears,
  importYearId,
  importSemester,
  onSelectYear,
  onSelectSemester,
  onStartImport,
  onOpenScheduleImport,
  onOpenCreate,
  onClose,
}: GradeImportSheetModalProps) {
  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <View className="flex-1 justify-end bg-black/45">
        <Pressable className="flex-1" onPress={onClose} />
        <Animated.View entering={FadeInDown.springify()}>
          <GlassContainer
            variant="sheet"
            radius={32}
            intensity={62}
            borderOpacity={0.3}
            style={{ paddingBottom: 22 }}
          >
            <View className="px-5 pt-5">
              <View className="flex-row items-center justify-between">
                <Text className="text-[17px] font-bold text-slate-800 dark:text-white">
                  导入成绩
                </Text>
                <Pressable
                  onPress={onClose}
                  className="h-8 w-8 items-center justify-center rounded-full bg-white/25 dark:bg-white/[0.08]"
                >
                  <Ionicons name="close" size={16} color="#94A3B8" />
                </Pressable>
              </View>
              <Text className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">
                支持照片（多选 9 张）、Excel(.xlsx)/CSV/HTML 文档或直接粘贴文本
              </Text>

              {/* 目标学年与默认学期选择 */}
              <View className="mt-3 gap-2">
                <View className="flex-row items-center">
                  <Text className="mr-2 text-[10.5px] font-semibold text-slate-500 dark:text-slate-400">
                    归入学年
                  </Text>
                  <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    contentContainerStyle={{ gap: 6 }}
                    className="flex-1"
                  >
                    {gradeYears.map((y) => {
                      const on = y.id === importYearId;
                      return (
                        <Pressable
                          key={y.id}
                          onPress={() => onSelectYear(y.id)}
                          className={`rounded-full px-3 py-1 ${
                            on
                              ? "bg-sky-500/85"
                              : "bg-white/25 dark:bg-white/[0.08]"
                          }`}
                        >
                          <Text
                            className={`text-[10.5px] font-semibold ${
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
                  <Text className="mr-2 text-[10.5px] font-semibold text-slate-500 dark:text-slate-400">
                    默认学期
                  </Text>
                  <View className="flex-1 flex-row gap-1.5">
                    {GRADE_SEMESTERS.map((s) => {
                      const on = s.kind === importSemester;
                      return (
                        <Pressable
                          key={s.kind}
                          onPress={() => onSelectSemester(s.kind)}
                          className={`flex-1 items-center rounded-xl py-1.5 ${
                            on
                              ? "bg-sky-500/85"
                              : "bg-white/25 dark:bg-white/[0.08]"
                          }`}
                        >
                          <Text
                            className={`text-[10.5px] font-semibold ${
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

              <View className="mt-4 flex-row gap-x-2">
                {[
                  {
                    key: "image" as ImportFrom,
                    icon: "images" as const,
                    label: "相册",
                  },
                  {
                    key: "camera" as ImportFrom,
                    icon: "camera" as const,
                    label: "拍照",
                  },
                  {
                    key: "text" as ImportFrom,
                    icon: "document-text" as const,
                    label: "表格/文档",
                  },
                  {
                    key: "paste" as ImportFrom,
                    icon: "clipboard-outline" as const,
                    label: "粘贴文本",
                  },
                ].map((it) => (
                  <Pressable
                    key={it.key}
                    onPress={() => onStartImport(it.key)}
                    className="flex-1 items-center rounded-2xl border border-white/25 bg-white/25 py-3 dark:border-white/10 dark:bg-white/[0.06]"
                  >
                    <Ionicons name={it.icon} size={18} color="#38BDF8" />
                    <Text className="mt-1 text-[10.5px] font-semibold text-slate-600 dark:text-slate-300">
                      {it.label}
                    </Text>
                  </Pressable>
                ))}
              </View>

              <Pressable
                onPress={onOpenScheduleImport}
                className="mt-3 flex-row items-center justify-center rounded-2xl border border-sky-400/45 bg-sky-400/12 py-2.5"
              >
                <Ionicons name="calendar-outline" size={15} color="#38BDF8" />
                <Text className="ml-1.5 text-[12px] font-bold text-sky-600 dark:text-sky-300">
                  从当前课表一键结课导入
                </Text>
              </Pressable>

              <Pressable
                onPress={onOpenCreate}
                className="mt-2.5 flex-row items-center justify-center rounded-2xl border border-sky-400/40 py-2.5"
              >
                <Ionicons name="add" size={16} color="#38BDF8" />
                <Text className="ml-1 text-[12px] font-bold text-sky-500 dark:text-sky-300">
                  手动添加成绩
                </Text>
              </Pressable>
            </View>
          </GlassContainer>
        </Animated.View>
      </View>
    </Modal>
  );
}
