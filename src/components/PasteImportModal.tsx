import Ionicons from "@expo/vector-icons/Ionicons";
import React, { useState } from "react";
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  Text,
  TextInput,
  View,
} from "react-native";

import type { TaskKind } from "@/store/useImportTask";

const PLACEHOLDERS: Record<TaskKind, string> = {
  schedule:
    "粘贴教务系统课表文本、群通知或表格内容，例如：\n高等数学 周一 1-2节 教一101 张老师 1-16周\n大学英语 周三 3-4节 外语楼202 1-16周(单)",
  periods:
    "粘贴学校作息时间表或通知文字，例如：\n第1节 08:00-08:45\n第2节 08:55-09:40\n第3节 10:00-10:45",
  grades:
    "粘贴教务系统成绩页复制的文本或表格行，例如：\n高等数学 5 92 4.2 必修\n大学英语 2 优秀 选修",
};

const TITLES: Record<TaskKind, string> = {
  schedule: "粘贴课表文本",
  periods: "粘贴作息表文本",
  grades: "粘贴成绩文本",
};

export function PasteImportModal({
  visible,
  kind,
  subtitle,
  onClose,
  onSubmit,
}: {
  visible: boolean;
  kind: TaskKind;
  subtitle?: string;
  onClose: () => void;
  onSubmit: (text: string) => void;
}) {
  const [text, setText] = useState("");

  const handleConfirm = () => {
    const trimmed = text.trim();
    if (!trimmed) return;
    setText("");
    onClose();
    onSubmit(trimmed);
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        className="flex-1 justify-center bg-black/50 px-5"
      >
        <View className="rounded-3xl bg-white p-5 dark:bg-slate-900">
          <View className="flex-row items-center justify-between">
            <Text className="text-[16px] font-bold text-slate-900 dark:text-white">
              {TITLES[kind]}
            </Text>
            <Pressable
              onPress={onClose}
              className="h-8 w-8 items-center justify-center rounded-full bg-slate-100 dark:bg-slate-800"
            >
              <Ionicons name="close" size={16} color="#94A3B8" />
            </Pressable>
          </View>
          {subtitle ? (
            <Text className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">
              {subtitle}
            </Text>
          ) : null}

          <TextInput
            value={text}
            onChangeText={setText}
            multiline
            textAlignVertical="top"
            placeholder={PLACEHOLDERS[kind]}
            placeholderTextColor="#94A3B8"
            className="mt-3 min-h-[160px] max-h-[280px] rounded-2xl border border-slate-200 bg-slate-50 p-3.5 text-[12.5px] leading-5 text-slate-800 dark:border-white/10 dark:bg-slate-800/80 dark:text-slate-100"
          />

          <View className="mt-4 flex-row items-center justify-between">
            {text.length > 0 ? (
              <Pressable onPress={() => setText("")} className="px-2 py-2">
                <Text className="text-xs text-slate-400">清空</Text>
              </Pressable>
            ) : (
              <Text className="text-[10.5px] text-slate-400">
                联网走 AI，断网自动切换离线解析
              </Text>
            )}
            <View className="flex-row gap-2">
              <Pressable
                onPress={onClose}
                className="rounded-xl px-3.5 py-2"
              >
                <Text className="text-xs font-semibold text-slate-600 dark:text-slate-300">
                  取消
                </Text>
              </Pressable>
              <Pressable
                disabled={!text.trim()}
                onPress={handleConfirm}
                className={`rounded-xl bg-sky-600 px-4 py-2 ${!text.trim() ? "opacity-45" : ""}`}
              >
                <Text className="text-xs font-bold text-white">开始识别</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}
