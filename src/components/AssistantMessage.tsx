import Ionicons from "@expo/vector-icons/Ionicons";
import { memo } from "react";
import { Image, Linking, Pressable, Text, View } from "react-native";
import Animated from "react-native-reanimated";
import { ChatImage } from "./ChatImage";
import { WhaleAvatar } from "./WhaleAvatar";
import { WHALE_STICKERS } from "@/constants/whaleStickers";
import type { WhaleStickerId } from "@/constants/whaleStickers";
import type { ChatMessage, ScheduleAction } from "@/types";

export const AssistantMessage = memo(function AssistantMessage({ message: m, whale, selectMode, checked, onSelect, onPreview, onApply }: {
  message: ChatMessage; whale: boolean; selectMode: boolean; checked: boolean;
  onSelect: (id: string, long: boolean) => void;
  onPreview: (uri: string) => void;
  onApply: (actions: ScheduleAction[]) => void;
}) {
  const isUser = m.role === "user";

  const rowGesture = {
    delayLongPress: 280,
    onLongPress: () => onSelect(m.id, true),
    onPress: () => onSelect(m.id, false),
  };
  const checkDot = selectMode ? (
    <View className="mr-1.5 self-center">
      <Ionicons
        name={
          checked ? "checkmark-circle" : "ellipse-outline"
        }
        size={19}
        color={checked ? "#0EA5E9" : "#94A3B8"}
      />
    </View>
  ) : null;
  // 表情包消息：只有图，没有气泡
  if (m.sticker) {
    return (
      <Pressable key={m.id} {...rowGesture}>
        <Animated.View

          className="flex-row justify-start"
        >
          {checkDot}
          {whale ? (
            <View className="mr-2.5 self-end">
              <WhaleAvatar size={44} active={false} />
            </View>
          ) : null}
          <Image
            source={
              WHALE_STICKERS[m.sticker as WhaleStickerId]
            }
            resizeMode="contain"
            style={{ width: 126, height: 126 }}
          />
        </Animated.View>
      </Pressable>
    );
  }
  return (
    <Pressable key={m.id} {...rowGesture}>
      <Animated.View

        className={`flex-row ${isUser ? "justify-end" : "justify-start"}`}
      >
        {!isUser ? checkDot : null}
        {!isUser && whale ? (
          <View className="mr-2.5 self-end">
            <WhaleAvatar size={44} active={false} />
          </View>
        ) : null}
        <View
          className={`max-w-[78%] overflow-hidden rounded-[22px] px-4 py-3 ${isUser
            ? "rounded-br-md bg-sky-600/85"
            : whale
              ? "rounded-bl-md border border-sky-200/70 bg-white/80 dark:border-sky-300/25 dark:bg-sky-400/15"
              : "rounded-bl-md border border-white/20 bg-white/35 dark:border-white/10 dark:bg-white/[0.08]"
            }`}
        >
          {whale ? (
            <Image
              pointerEvents="none"
              source={require("../../assets/stickers/bubble.png")}
              resizeMode="contain"
              style={{
                position: "absolute",
                width: 38,
                height: 38,
                right: -4,
                top: -6,
                opacity: isUser ? 0.13 : 0.18,
              }}
            />
          ) : null}
          <Text
            className={`text-[13px] leading-[21px] ${isUser
              ? "text-white"
              : whale
                ? "text-sky-900 dark:text-sky-100"
                : "text-slate-700 dark:text-slate-200"
              }`}
          >
            {m.content}
          </Text>

          {m.imageUri ? (
            <Pressable
              onPress={() => onPreview(m.imageUri!)}
              className="mt-2"
            >
              <ChatImage
                uri={m.imageUri}
                aspectRatio={m.imageAspect ?? 1}
              />
            </Pressable>
          ) : null}

          {m.sources?.length ? (
            <View className="mt-2">
              <Text className="text-[9px] font-semibold tracking-wide text-sky-600/80 dark:text-sky-300/80">
                资料来源
              </Text>
              {m.sources.map((s) => (
                <Pressable
                  key={s.url}
                  onPress={() =>
                    Linking.openURL(s.url).catch(() => { })
                  }
                >
                  <Text
                    numberOfLines={1}
                    className="mt-0.5 text-[9.5px] text-slate-500 underline dark:text-slate-400"
                  >
                    {s.title}
                  </Text>
                </Pressable>
              ))}
            </View>
          ) : null}

          {m.actions?.length ? (
            <Pressable
              onPress={() => onApply(m.actions!)}
              className="mt-2.5 flex-row items-center self-start rounded-full bg-emerald-400/85 px-3.5 py-1.5"
            >
              <Ionicons
                name="checkmark-circle"
                size={13}
                color="#fff"
              />
              <Text className="ml-1 text-[11px] font-bold text-white">
                {m.actions.length > 1
                  ? `预览 ${m.actions.length} 项操作`
                  : m.actions[0].type === "add"
                    ? "预览添加课程"
                    : m.actions[0].type === "remove"
                      ? "预览删除课程"
                      : m.actions[0].type === "update"
                        ? "预览课程修改"
                        : m.actions[0].type === "create_schedule"
                          ? "预览新建课表"
                          : m.actions[0].type === "merge_schedule"
                            ? "预览合并课表"
                            : "预览新增待办"}
              </Text>
            </Pressable>
          ) : null}
        </View>
        {isUser ? checkDot : null}
      </Animated.View>
    </Pressable>
  );
});
