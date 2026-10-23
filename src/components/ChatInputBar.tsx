import { Ionicons } from "@expo/vector-icons";
import React, { useState } from "react";
import { ActivityIndicator, Pressable, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useColorScheme } from "nativewind";

export interface ChatInputBarProps {
  value: string;
  onChangeText: (text: string) => void;
  onSend: () => void;
  busy?: boolean;
  placeholder?: string;
  /** 鲸鱼模式：输入栏换成更软萌的天蓝色配色 */
  cute?: boolean;
  /** 覆盖底部安全区（键盘弹出时由页面传入，避免重复留白） */
  bottomInset?: number;
}

/**
 * 独立的聊天输入栏。
 * 实心表面 + 独立描边 + 与内容区之间的间距，让它作为独立控件悬浮在
 * 背景之上，而不是和上方卡片/背景糊成一片。
 */
export function ChatInputBar({
  value,
  onChangeText,
  onSend,
  busy = false,
  placeholder = "例如：把周四的课和周五的换一下…",
  cute = false,
  bottomInset,
}: ChatInputBarProps) {
  const { colorScheme } = useColorScheme();
  const isDark = colorScheme !== "light";
  const insets = useSafeAreaInsets();
  const [focused, setFocused] = useState(false);

  const canSend = value.trim().length > 0 && !busy;
  const padBottom = bottomInset ?? Math.max(insets.bottom, 10);

  return (
    <View
      style={{
        paddingHorizontal: 16,
        paddingTop: 10,
        paddingBottom: padBottom,
      }}
    >
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          borderRadius: 24,
          borderWidth: 1,
          borderColor: focused
            ? "rgba(56,189,248,0.85)"
            : cute
              ? isDark
                ? "rgba(56,189,248,0.4)"
                : "rgba(125,211,252,0.9)"
              : isDark
                ? "rgba(255,255,255,0.14)"
                : "rgba(186,230,253,0.95)",
          backgroundColor: cute
            ? isDark
              ? "#0F1E33"
              : "#F0F9FF"
            : isDark
              ? "#121A2B"
              : "#FFFFFF",
          paddingLeft: 14,
          paddingRight: 5,
          paddingVertical: 5,
          // 独立的浅投影把它从背景上「托」起来（Android 不用 elevation）
          shadowColor: "#0F172A",
          shadowOffset: { width: 0, height: 6 },
          shadowOpacity: isDark ? 0 : 0.1,
          shadowRadius: 16,
        }}
      >
        <TextInput
          value={value}
          onChangeText={onChangeText}
          placeholder={placeholder}
          placeholderTextColor={
            isDark ? "rgba(148,163,184,0.6)" : "rgba(100,116,139,0.55)"
          }
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          onSubmitEditing={onSend}
          returnKeyType="send"
          editable={!busy}
          style={{
            flex: 1,
            paddingVertical: 6,
            fontSize: 13.5,
            color: isDark ? "#E2E8F0" : "#1E293B",
          }}
        />

        <Pressable
          onPress={onSend}
          disabled={!canSend}
          hitSlop={6}
          style={{
            width: 34,
            height: 34,
            borderRadius: 17,
            alignItems: "center",
            justifyContent: "center",
            backgroundColor: canSend
              ? "#38BDF8"
              : isDark
                ? "rgba(255,255,255,0.08)"
                : "rgba(148,163,184,0.22)",
          }}
        >
          {busy ? (
            <ActivityIndicator size="small" color="#FFFFFF" />
          ) : (
            <Ionicons
              name="arrow-up"
              size={16}
              color={canSend ? "#FFFFFF" : isDark ? "#64748B" : "#94A3B8"}
            />
          )}
        </Pressable>
      </View>
    </View>
  );
}
