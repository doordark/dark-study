import { Ionicons } from "@expo/vector-icons";
import React from "react";
import { ActivityIndicator, Pressable, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useColorScheme } from "nativewind";

export interface ChatInputBarProps {
  value: string;
  onChangeText: (text: string) => void;
  onSend: () => void;
  busy?: boolean;
  placeholder?: string;
  /** 覆盖底部安全区（键盘弹出时由页面传入，避免重复留白） */
  bottomInset?: number;
}

/**
 * 极简聊天输入框：没有底板、描边、投影，只有输入框本体和发送按钮，
 * 直接浮在页面背景上方。
 */
export function ChatInputBar({
  value,
  onChangeText,
  onSend,
  busy = false,
  placeholder = "例如：把周四的课和周五的换一下…",
  bottomInset,
}: ChatInputBarProps) {
  const { colorScheme } = useColorScheme();
  const isDark = colorScheme !== "light";
  const insets = useSafeAreaInsets();

  const canSend = value.trim().length > 0 && !busy;
  const padBottom = bottomInset ?? Math.max(insets.bottom, 10);

  return (
    <View
      style={{
        paddingHorizontal: 20,
        paddingTop: 10,
        paddingBottom: padBottom,
        flexDirection: "row",
        alignItems: "center",
      }}
    >
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={
          isDark ? "rgba(148,163,184,0.6)" : "rgba(100,116,139,0.55)"
        }
        onSubmitEditing={onSend}
        returnKeyType="send"
        editable={!busy}
        style={{
          flex: 1,
          paddingVertical: 8,
          paddingRight: 10,
          fontSize: 13.5,
          color: isDark ? "#E2E8F0" : "#1E293B",
        }}
      />

      <Pressable
        onPress={onSend}
        disabled={!canSend}
        hitSlop={8}
        style={{
          width: 32,
          height: 32,
          borderRadius: 16,
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: canSend ? "#38BDF8" : "transparent",
        }}
      >
        {busy ? (
          <ActivityIndicator size="small" color="#94A3B8" />
        ) : (
          <Ionicons
            name="arrow-up"
            size={18}
            color={canSend ? "#FFFFFF" : isDark ? "#475569" : "#94A3B8"}
          />
        )}
      </Pressable>
    </View>
  );
}
