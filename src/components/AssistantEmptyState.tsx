import Ionicons from "@expo/vector-icons/Ionicons";
import { LinearGradient } from "expo-linear-gradient";
import { Pressable, Text, View } from "react-native";
import Animated, {
  FadeInDown,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from "react-native-reanimated";

export interface AssistantSuggestion {
  tag: string;
  text: string;
  icon: keyof typeof Ionicons.glyphMap;
  color: string;
}

export const ASSISTANT_SUGGESTIONS: readonly AssistantSuggestion[] = [
  { tag: "调课", text: "把周三的体育课改到周五下午", icon: "swap-horizontal", color: "#3B82F6" },
  { tag: "新建", text: "新建一份叫「外教课」的课表", icon: "add-circle", color: "#10B981" },
  { tag: "删除", text: "帮我把周六的学术写作工作坊删掉", icon: "trash", color: "#F43F5E" },
  { tag: "查询", text: "这学期哪天的课最多？", icon: "stats-chart", color: "#8B5CF6" },
  { tag: "添加", text: "给周四加一门晚上 7 点的《人工智能导论》", icon: "time", color: "#F59E0B" },
];

interface SuggestionCardProps {
  item: AssistantSuggestion;
  isDark: boolean;
  wide: boolean;
  index: number;
  reducedMotion: boolean;
  onPress: () => void;
}

function SuggestionCard({ item, isDark, wide, index, reducedMotion, onPress }: SuggestionCardProps) {
  const scale = useSharedValue(1);
  const pressStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));

  return (
    <Animated.View
      entering={reducedMotion ? undefined : FadeInDown.delay(120 + index * 55).springify().damping(20)}
      style={[{ flexBasis: wide ? "100%" : "47%", flexGrow: 1, minWidth: 0 }, pressStyle]}
    >
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${item.tag}：${item.text}`}
        onPress={onPress}
        onPressIn={() => {
          scale.set(withSpring(0.96, { damping: 24, stiffness: 260 }));
        }}
        onPressOut={() => {
          scale.set(withSpring(1, { damping: 24, stiffness: 260 }));
        }}
        style={{
          flexDirection: wide ? "row" : "column",
          alignItems: wide ? "center" : "flex-start",
          gap: wide ? 11 : 9,
          minHeight: wide ? 0 : 104,
          paddingHorizontal: 13,
          paddingVertical: 12,
          borderRadius: 20,
          borderCurve: "continuous",
          borderWidth: 1,
          borderColor: isDark ? "rgba(255,255,255,0.09)" : "rgba(255,255,255,0.9)",
          backgroundColor: isDark ? "rgba(255,255,255,0.055)" : "rgba(255,255,255,0.74)",
          boxShadow: isDark
            ? undefined
            : [{ offsetX: 0, offsetY: 4, blurRadius: 14, color: "rgba(100,116,139,0.10)" }],
        }}
      >
        <View style={{ flexDirection: "row", alignItems: "center", gap: 7 }}>
          <View
            style={{
              width: 30,
              height: 30,
              borderRadius: 10,
              borderCurve: "continuous",
              alignItems: "center",
              justifyContent: "center",
              backgroundColor: `${item.color}${isDark ? "2E" : "1A"}`,
            }}
          >
            <Ionicons name={item.icon} size={15} color={item.color} />
          </View>
          {!wide ? (
            <Text style={{ fontSize: 11, fontWeight: "800", letterSpacing: 0.5, color: item.color }}>
              {item.tag}
            </Text>
          ) : null}
        </View>
        <View style={{ flex: wide ? 1 : undefined, minWidth: 0 }}>
          {wide ? (
            <Text style={{ fontSize: 11, fontWeight: "800", letterSpacing: 0.5, color: item.color, marginBottom: 2 }}>
              {item.tag}
            </Text>
          ) : null}
          <Text
            numberOfLines={2}
            style={{
              fontSize: 13,
              lineHeight: 19,
              fontWeight: "600",
              color: isDark ? "#E2E8F0" : "#1E293B",
            }}
          >
            {item.text}
          </Text>
        </View>
        {wide ? (
          <Ionicons name="arrow-forward" size={14} color={isDark ? "rgba(203,213,225,0.55)" : "rgba(100,116,139,0.6)"} />
        ) : null}
      </Pressable>
    </Animated.View>
  );
}

export interface AssistantEmptyStateProps {
  isDark: boolean;
  /** 键盘弹起时整体收拢到顶部，避免建议卡被挤出可视区 */
  compact: boolean;
  reducedMotion: boolean;
  onPick: (text: string) => void;
}

/** 课程表助手（非大肥鱼模式）空状态：顶部欢迎语 + 贴近输入框的分类建议卡片 */
export function AssistantEmptyState({ isDark, compact, reducedMotion, onPick }: AssistantEmptyStateProps) {
  const last = ASSISTANT_SUGGESTIONS.length - 1;
  const oddTail = ASSISTANT_SUGGESTIONS.length % 2 === 1;

  return (
    <View style={{ flex: 1, justifyContent: compact ? "flex-start" : "space-between", gap: 26, paddingTop: 14 }}>
      <Animated.View
        entering={reducedMotion ? undefined : FadeInDown.springify().damping(20)}
        style={{ paddingHorizontal: 4 }}
      >
        <LinearGradient
          colors={["#38BDF8", "#818CF8"]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={{
            width: 46,
            height: 46,
            borderRadius: 15,
            alignItems: "center",
            justifyContent: "center",
            boxShadow: [{ offsetX: 0, offsetY: 8, blurRadius: 18, color: "rgba(99,102,241,0.28)" }],
          }}
        >
          <Ionicons name="sparkles" size={22} color="#FFFFFF" />
        </LinearGradient>
        <Text
          style={{
            marginTop: 18,
            fontSize: 14,
            fontWeight: "600",
            color: isDark ? "#94A3B8" : "#64748B",
          }}
        >
          你好 👋
        </Text>
        <Text
          style={{
            marginTop: 4,
            fontSize: 25,
            lineHeight: 33,
            fontWeight: "800",
            letterSpacing: 0.2,
            color: isDark ? "#F1F5F9" : "#0F172A",
          }}
        >
          今天想怎么安排课表？
        </Text>
        <Text
          style={{
            marginTop: 6,
            fontSize: 13,
            lineHeight: 19,
            color: isDark ? "#94A3B8" : "#64748B",
          }}
        >
          一句话就能调课、查课、建课表，改完会先给你确认。
        </Text>
      </Animated.View>

      <View>
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-between",
            paddingHorizontal: 4,
            marginBottom: 10,
          }}
        >
          <View style={{ flexDirection: "row", alignItems: "center", gap: 5 }}>
            <Ionicons name="sparkles" size={12} color={isDark ? "#7DD3FC" : "#0EA5E9"} />
            <Text style={{ fontSize: 12.5, fontWeight: "800", color: isDark ? "#CBD5E1" : "#334155" }}>
              试试这样说
            </Text>
          </View>
          <Text style={{ fontSize: 11, color: isDark ? "#64748B" : "#94A3B8" }}>点一下直接发送</Text>
        </View>
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 9 }}>
          {ASSISTANT_SUGGESTIONS.map((item, index) => (
            <SuggestionCard
              key={item.text}
              item={item}
              index={index}
              isDark={isDark}
              wide={oddTail && index === last}
              reducedMotion={reducedMotion}
              onPress={() => onPick(item.text)}
            />
          ))}
        </View>
      </View>
    </View>
  );
}
