import Ionicons from "@expo/vector-icons/Ionicons";
import React from "react";
import { ActivityIndicator, Pressable, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useColorScheme } from "nativewind";
import { GlassContainer } from "@/components/GlassContainer";

export interface ChatInputBarProps {
  value: string;
  onChangeText: (text: string) => void;
  onSend: () => void;
  busy?: boolean;
  placeholder?: string;
  /** 覆盖底部安全区（键盘弹出时由页面传入，避免重复留白） */
  bottomInset?: number;
  whaleTheme?: boolean;
}

/**
 * 聊天输入胶囊：半透明表面 + 1px 发丝边，输入框与发送键都收在胶囊内，
 * 直接浮在页面背景上方，不再额外套底板。
 */
export function ChatInputBar({
  value,
  onChangeText,
  onSend,
  busy = false,
  placeholder = "例如：把周四的课和周五的换一下…",
  bottomInset,
  whaleTheme = false,
}: ChatInputBarProps) {
  const { colorScheme } = useColorScheme();
  const isDark = colorScheme !== "light";
  const insets = useSafeAreaInsets();

  const canSend = value.trim().length > 0 && !busy;
  const padBottom = bottomInset ?? Math.max(insets.bottom, 10);

  return (
    <View
      style={{
        paddingHorizontal: 16,
        paddingTop: 8,
        paddingBottom: padBottom,
        backgroundColor: whaleTheme ? (isDark ? "rgba(14,31,55,0.42)" : "rgba(229,241,255,0.60)") : undefined,
      }}
    >
      <GlassContainer
        radius={28}
        variant="floating"
        borderOpacity={0.2}
        style={{
          flexDirection: "row",
          alignItems: "center",
          minHeight: 46,
          paddingLeft: 16,
          paddingRight: 5,
          borderWidth: whaleTheme ? 1 : 0,
          borderColor: whaleTheme ? "rgba(140,190,225,0.48)" : "transparent",
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
            paddingVertical: 9,
            paddingRight: 8,
            fontSize: 13.5,
            color: isDark ? "#E2E8F0" : "#1E293B",
          }}
        />

        <Pressable
          onPress={onSend}
          disabled={!canSend}
          accessibilityRole="button"
          accessibilityLabel="发送消息"
          accessibilityState={{ disabled: !canSend, busy }}
          hitSlop={8}
          style={{
            width: 36,
            height: 36,
            borderRadius: 18,
            alignItems: "center",
            justifyContent: "center",
            backgroundColor: canSend
              ? (whaleTheme ? "#658BC4" : "#38BDF8")
              : isDark
                ? "rgba(255,255,255,0.07)"
                : "rgba(148,163,184,0.18)",
          }}
        >
          {busy ? (
            <ActivityIndicator size="small" color="#94A3B8" />
          ) : (
            <Ionicons
              name="arrow-up"
              size={18}
              color={canSend ? "#FFFFFF" : isDark ? "#64748B" : "#94A3B8"}
            />
          )}
        </Pressable>
      </GlassContainer>
    </View>
  );
}
