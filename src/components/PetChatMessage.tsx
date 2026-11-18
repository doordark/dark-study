import { memo } from "react";
import { Pressable, Text, View } from "react-native";
import { ChatImage } from "./ChatImage";
import type { ChatMessage } from "@/types";
export const PetChatMessage = memo(function PetChatMessage({ message: m, isDark, onApply }: {
  message: ChatMessage; isDark: boolean; onApply: (id: string) => void;
}) {
  return (
    <View
      key={m.id}
      style={{
        alignItems: m.role === "user" ? "flex-end" : "flex-start",
      }}
    >
      {m.imageUri ? (
        <View style={{ marginBottom: 6 }}>
          <ChatImage uri={m.imageUri} aspectRatio={m.imageAspect} />
        </View>
      ) : null}
      <View
        style={{
          maxWidth: "92%",
          borderRadius: 16,
          borderBottomRightRadius: m.role === "user" ? 5 : 16,
          borderBottomLeftRadius: m.role === "user" ? 16 : 5,
          paddingHorizontal: 11,
          paddingVertical: 8,
          backgroundColor:
            m.role === "user"
              ? "rgba(56,189,248,0.82)"
              : isDark
                ? "rgba(125,211,252,0.14)"
                : "rgba(14,165,233,0.1)",
        }}
      >
        <Text
          style={{
            fontSize: 11.5,
            lineHeight: 17,
            color:
              m.role === "user"
                ? "#FFFFFF"
                : isDark
                  ? "#E4F2FF"
                  : "#0F172A",
          }}
        >
          {m.content}
        </Text>
        {m.actions?.length ? (
          <Pressable
            onPress={() => onApply(m.id)}
            style={{
              marginTop: 6,
              alignSelf: "flex-start",
              borderRadius: 999,
              paddingHorizontal: 9,
              paddingVertical: 4,
              backgroundColor: "rgba(52,211,153,0.9)",
            }}
          >
            <Text style={{ fontSize: 10, color: "#062B23" }}>
              预览课表变更 · {m.actions.length} 项
            </Text>
          </Pressable>
        ) : null}
      </View>
    </View>
  );
});
