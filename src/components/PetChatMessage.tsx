import Ionicons from "@expo/vector-icons/Ionicons";
import { LinearGradient } from "expo-linear-gradient";
import { memo } from "react";
import { Pressable, Text, View } from "react-native";

import { ChatImage } from "./ChatImage";
import type { ChatMessage } from "@/types";

export const PetChatMessage = memo(function PetChatMessage({
  message: m,
  isDark,
  onApply,
}: {
  message: ChatMessage;
  isDark: boolean;
  onApply: (id: string) => void;
}) {
  const isUser = m.role === "user";

  return (
    <View
      key={m.id}
      style={{
        alignItems: isUser ? "flex-end" : "flex-start",
      }}
    >
      {m.imageUri ? (
        <View
          style={{
            marginBottom: 6,
            borderRadius: 16,
            overflow: "hidden",
            borderWidth: 1,
            borderColor: isDark
              ? "rgba(186,230,253,0.22)"
              : "rgba(125,211,252,0.45)",
          }}
        >
          <ChatImage uri={m.imageUri} aspectRatio={m.imageAspect} />
        </View>
      ) : null}

      <View
        style={{
          maxWidth: "90%",
          borderRadius: 17,
          borderCurve: "continuous",
          borderBottomRightRadius: isUser ? 5 : 17,
          borderBottomLeftRadius: isUser ? 17 : 5,
          paddingHorizontal: 12,
          paddingVertical: 8.5,
          overflow: "hidden",
          backgroundColor: isUser
            ? "#0EA5E9"
            : isDark
              ? "rgba(30,52,84,0.68)"
              : "rgba(255,255,255,0.9)",
          borderWidth: 1,
          borderColor: isUser
            ? "rgba(255,255,255,0.24)"
            : isDark
              ? "rgba(186,230,253,0.2)"
              : "rgba(125,211,252,0.42)",
          boxShadow: [
            {
              offsetX: 0,
              offsetY: 2,
              blurRadius: 8,
              color: isUser
                ? "rgba(14,165,233,0.24)"
                : isDark
                  ? "rgba(2,8,20,0.28)"
                  : "rgba(30,82,138,0.08)",
            },
          ],
        }}
      >
        {isUser ? (
          <LinearGradient
            pointerEvents="none"
            colors={isDark ? ["#38BDF8", "#4F7DF3"] : ["#0EA5E9", "#3B82F6"]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={{ position: "absolute", inset: 0 }}
          />
        ) : (
          <LinearGradient
            pointerEvents="none"
            colors={
              isDark
                ? ["rgba(186,230,253,0.12)", "rgba(56,189,248,0.02)"]
                : ["rgba(255,255,255,0.72)", "rgba(224,242,254,0.16)"]
            }
            start={{ x: 0, y: 0 }}
            end={{ x: 0.9, y: 1 }}
            style={{ position: "absolute", inset: 0 }}
          />
        )}

        <Text
          style={{
            fontSize: 12,
            lineHeight: 18,
            letterSpacing: 0.1,
            color: isUser ? "#FFFFFF" : isDark ? "#EAF5FF" : "#0F2942",
          }}
        >
          {m.content}
        </Text>

        {m.actions?.length ? (
          <Pressable
            onPress={() => onApply(m.id)}
            style={({ pressed }) => ({
              marginTop: 7,
              alignSelf: "flex-start",
              flexDirection: "row",
              alignItems: "center",
              gap: 4,
              borderRadius: 999,
              paddingHorizontal: 10,
              paddingVertical: 4.5,
              backgroundColor: isDark
                ? "rgba(16,185,129,0.26)"
                : "rgba(16,185,129,0.16)",
              borderWidth: 1,
              borderColor: isDark
                ? "rgba(52,211,153,0.48)"
                : "rgba(16,185,129,0.38)",
              opacity: pressed ? 0.78 : 1,
              transform: [{ scale: pressed ? 0.97 : 1 }],
            })}
          >
            <Ionicons
              name="calendar-outline"
              size={11}
              color={isDark ? "#6EE7B7" : "#047857"}
            />
            <Text
              style={{
                fontSize: 10.5,
                fontWeight: "700",
                color: isDark ? "#A7F3D0" : "#065F46",
              }}
            >
              预览课表变更 · {m.actions.length} 项
            </Text>
          </Pressable>
        ) : null}
      </View>
    </View>
  );
});
