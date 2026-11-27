import Ionicons from "@expo/vector-icons/Ionicons";
import React, { useRef } from "react";
import { Pressable, Text, View } from "react-native";

import type { GradeRecord, GradeScoreType } from "@/types";
import { formatCourseGpa } from "@/utils/grades";

const SCORE_TYPE_HINT: Record<GradeScoreType, string> = {
  numeric: "百分制",
  letter: "等级制",
  text: "文字等级",
};

export interface GradeRowCardProps {
  grade: GradeRecord;
  typeLabel: string;
  termLabel: string | null;
  included: boolean;
  isOverridden: boolean;
  selectMode: boolean;
  selected: boolean;
  onPressEdit: (grade: GradeRecord) => void;
  onToggleSelect: (id: string) => void;
  onLongPressSelect: (id: string) => void;
}

export const GradeRowCard = React.memo(function GradeRowCard({
  grade,
  typeLabel,
  termLabel,
  included,
  isOverridden,
  selectMode,
  selected,
  onPressEdit,
  onToggleSelect,
  onLongPressSelect,
}: GradeRowCardProps) {
  const longPressedRef = useRef(false);

  const meta = [
    typeLabel,
    grade.credit != null ? `${grade.credit} 学分` : "学分待补",
    SCORE_TYPE_HINT[grade.scoreType],
    termLabel,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <View
      className={`mb-2 flex-row items-center rounded-2xl border px-3.5 py-3 ${
        selectMode && selected
          ? "border-sky-400/55 bg-sky-400/12"
          : "border-white/30 bg-white/35 dark:border-white/10 dark:bg-white/[0.06]"
      }`}
    >
      {selectMode ? (
        <Pressable
          onPress={() => onToggleSelect(grade.id)}
          hitSlop={8}
          className="mr-2.5"
        >
          <Ionicons
            name={selected ? "checkbox" : "square-outline"}
            size={18}
            color={selected ? "#38BDF8" : "#94A3B8"}
          />
        </Pressable>
      ) : null}
      <Pressable
        onPressIn={() => {
          longPressedRef.current = false;
        }}
        onPress={() => {
          if (longPressedRef.current) return;
          if (selectMode) onToggleSelect(grade.id);
          else onPressEdit(grade);
        }}
        onLongPress={() => {
          longPressedRef.current = true;
          onLongPressSelect(grade.id);
        }}
        delayLongPress={320}
        className="flex-1 flex-row items-center"
      >
        <View className="flex-1">
          <View className="flex-row items-center gap-1.5">
            <Text
              numberOfLines={1}
              className={`flex-shrink text-[13px] font-semibold ${
                included
                  ? "text-slate-800 dark:text-white"
                  : "text-slate-400 dark:text-slate-500"
              }`}
            >
              {grade.name}
            </Text>
            {isOverridden ? (
              <View className="rounded-full border border-amber-400/35 bg-amber-400/15 px-1.5 py-0.5">
                <Text className="text-[9px] font-bold text-amber-600 dark:text-amber-300">
                  重修已覆盖
                </Text>
              </View>
            ) : null}
          </View>
          <Text className="mt-0.5 text-[10.5px] text-slate-400 dark:text-slate-500">
            {meta}
          </Text>
        </View>
        <View className={`ml-2 items-end ${included ? "" : "opacity-55"}`}>
          <Text
            className={`text-[16px] font-bold ${
              grade.score
                ? "text-slate-700 dark:text-slate-200"
                : "text-amber-500 dark:text-amber-300"
            }`}
          >
            {grade.score || "待填"}
          </Text>
          <Text className="text-[10px] font-semibold text-sky-500 dark:text-sky-300">
            {formatCourseGpa(grade.gpa)} 绩点
          </Text>
        </View>
      </Pressable>
    </View>
  );
});
