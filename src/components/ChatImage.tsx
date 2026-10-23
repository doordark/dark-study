import { useState } from "react";
import {
  ActivityIndicator,
  Image,
  StyleSheet,
  Text,
  View,
} from "react-native";

/**
 * 聊天里的生成图：加载中转圈，失败给一句可爱兜底，
 * 尺寸固定，避免图片加载时气泡跳动。
 */
export function ChatImage({
  uri,
  aspectRatio = 1,
}: {
  uri: string;
  aspectRatio?: number;
}) {
  const [status, setStatus] = useState<"loading" | "ok" | "error">("loading");

  return (
    <View
      style={{ width: 208, aspectRatio, borderRadius: 16, overflow: "hidden" }}
      className="items-center justify-center bg-sky-400/15"
    >
      {status !== "error" ? (
        <Image
          source={{ uri }}
          style={StyleSheet.absoluteFill}
          resizeMode="cover"
          onLoad={() => setStatus("ok")}
          onError={() => setStatus("error")}
        />
      ) : (
        <Text className="px-4 text-center text-[10.5px] leading-4 text-sky-700 dark:text-sky-200">
          画布被海浪卷走了…大爹再让我画一次吧
        </Text>
      )}
      {status === "loading" ? (
        <ActivityIndicator size="small" color="#38BDF8" />
      ) : null}
    </View>
  );
}
