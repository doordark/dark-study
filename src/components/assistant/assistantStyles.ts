import type Ionicons from "@expo/vector-icons/Ionicons";
import { StyleSheet } from "react-native";

import type { ChatMessage } from "@/types";

export interface WhaleQuickItem {
  label: string;
  prompt: string;
  icon: keyof typeof Ionicons.glyphMap;
  tint: string;
}

export interface WhaleStarterCardDef {
  title: string;
  subtitle: string;
  prompt: string;
  icon: keyof typeof Ionicons.glyphMap;
  color: string;
}

/** 用户专属：大肥鱼的额外玩法快捷胶囊 */
export const WHALE_QUICK_ITEMS: readonly WhaleQuickItem[] = [
  { label: "出来陪我", prompt: "出来陪我", icon: "sparkles", tint: "#38BDF8" },
  { label: "今日运势", prompt: "帮我看看今日运势", icon: "planet-outline", tint: "#A78BFA" },
  { label: "夸夸我", prompt: "夸夸我", icon: "heart-outline", tint: "#F472B6" },
  { label: "今天吃什么", prompt: "今天吃什么", icon: "restaurant-outline", tint: "#FBBF24" },
  { label: "摸鱼一下", prompt: "摸鱼一下", icon: "cafe-outline", tint: "#34D399" },
  { label: "晚霞粉背景", prompt: "把背景换成晚霞粉", icon: "color-palette-outline", tint: "#FB7185" },
  { label: "薄荷绿背景", prompt: "让背景变成薄荷绿", icon: "leaf-outline", tint: "#2DD4BF" },
  { label: "搜 AI 新闻", prompt: "帮我搜一下最近有什么 AI 新闻", icon: "globe-outline", tint: "#60A5FA" },
  { label: "画吃白饭", prompt: "画一张你在吃白饭的样子", icon: "brush-outline", tint: "#C084FC" },
  { label: "先退下吧", prompt: "行了你先退下吧，我要好好学习了", icon: "moon-outline", tint: "#94A3B8" },
];

export const WHALE_STARTER_CARDS: readonly WhaleStarterCardDef[] = [
  {
    title: "召唤桌宠",
    subtitle: "到屏幕边陪你玩",
    prompt: "出来陪我",
    icon: "sparkles",
    color: "#38BDF8",
  },
  {
    title: "今日运势",
    subtitle: "看看今天的幸运色",
    prompt: "帮我看看今日运势",
    icon: "planet-outline",
    color: "#A78BFA",
  },
  {
    title: "夸夸充电",
    subtitle: "来点软乎乎鼓励",
    prompt: "夸夸我",
    icon: "heart",
    color: "#F472B6",
  },
  {
    title: "换个主题色",
    subtitle: "切换治愈晚霞粉",
    prompt: "把背景换成晚霞粉",
    icon: "color-palette-outline",
    color: "#FB923C",
  },
];

/** 想让她到屏幕边上陪着（桌宠）的说法；精确口令走本地，语义判断交给模型 */
export const PET_WORDS = /桌宠|出来陪我|出来陪|陪我玩|出来玩|跳出来|爬出来/;

/** 连点互动头像时的递进反应 */
export const AVATAR_TAPS = [
  "呀，被{{user}}轻轻点了一下～有什么事呀？",
  "别一直戳啦，会戳出小泡泡的…",
  "呜，我可是会记仇的（假装气鼓鼓）",
  "再戳？再戳我就直接跳到屏幕边陪你啦！",
  "嘿嘿…其实我也一直想贴在{{user}}旁边呢～",
] as const;

/** 除自定义口令外始终有效的通用召唤词 */
export const SUMMON_ALIASES = ["召唤大肥鱼", "大肥鱼出来", "肥鱼出来", "whaletest"] as const;
export const DISMISS_ALIASES = ["大爹走了", "退下吧", "变回课表助手"] as const;

export const POPOVER_SPRING = { damping: 18, stiffness: 270, mass: 0.78 };
export const PRESS_SPRING = { damping: 20, stiffness: 320, mass: 0.72 };

export const messageKey = (message: ChatMessage) => message.id;

export const normalizeCmd = (text: string) => text.trim().replace(/[!！。.~～]+$/, "");

export function formatMessageTime(ts?: number): string {
  if (!ts || !Number.isFinite(ts)) return "";
  const d = new Date(ts);
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  return `${hh}:${mm}`;
}

export function clampPct(value: number): number {
  return Math.min(100, Math.max(4, Math.round(value)));
}

export function getNoticePalette(type: "error" | "success", isDark: boolean) {
  if (type === "error") {
    return {
      borderColor: isDark ? "rgba(251,113,133,0.34)" : "rgba(244,63,94,0.32)",
      backgroundColor: isDark ? "rgba(244,63,94,0.16)" : "rgba(255,241,242,0.88)",
      iconName: "alert-circle-outline" as const,
      iconColor: isDark ? "#FDA4AF" : "#E11D48",
      textColor: isDark ? "#FFE4E6" : "#9F1239",
    };
  }
  return {
    borderColor: isDark ? "rgba(52,211,153,0.34)" : "rgba(16,185,129,0.32)",
    backgroundColor: isDark ? "rgba(16,185,129,0.16)" : "rgba(236,253,245,0.88)",
    iconName: "checkmark-circle-outline" as const,
    iconColor: isDark ? "#6EE7B7" : "#059669",
    textColor: isDark ? "#D1FAE5" : "#065F46",
  };
}

export const assistantStyles = StyleSheet.create({
  headerWrap: {
    paddingHorizontal: 14,
    paddingTop: 4,
    paddingBottom: 6,
    zIndex: 25,
  },
  headerGlass: {
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  backBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    marginRight: 10,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 0.75,
  },
  headerTitleCol: {
    flex: 1,
    minWidth: 0,
  },
  headerTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  headerTitle: {
    fontSize: 18.5,
    fontWeight: "800",
    letterSpacing: -0.2,
  },
  moodPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    borderRadius: 999,
    paddingHorizontal: 7.5,
    paddingVertical: 2.5,
    borderWidth: 0.75,
  },
  moodDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  moodText: {
    fontSize: 9.5,
    fontWeight: "700",
  },
  headerSubtitle: {
    marginTop: 2,
    fontSize: 10.5,
  },
  headerActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    flexShrink: 0,
  },
  headerCircleBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 0.75,
  },
  avatarBtnWrap: {
    position: "relative",
  },
  avatarHalo: {
    position: "absolute",
    inset: -3,
    borderRadius: 20,
    borderWidth: 1.5,
  },
  avatarBtn: {
    width: 46,
    height: 46,
    borderRadius: 17,
    borderCurve: "continuous",
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
    borderWidth: 1,
  },
  avatarCornerBadge: {
    position: "absolute",
    right: -2,
    bottom: -2,
    width: 16,
    height: 16,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1.5,
  },
  selectBarWrap: {
    paddingHorizontal: 16,
    marginBottom: 6,
  },
  selectBarGlass: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  selectBarLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  selectBarCount: {
    fontSize: 12,
    fontWeight: "700",
  },
  selectBarRight: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  selectDeleteBtn: {
    borderRadius: 999,
    paddingHorizontal: 11,
    paddingVertical: 4,
    backgroundColor: "rgba(244,63,94,0.16)",
    borderWidth: 0.75,
    borderColor: "rgba(251,113,133,0.4)",
  },
  selectDeleteText: {
    fontSize: 11,
    fontWeight: "700",
  },
  selectCancelText: {
    fontSize: 11.5,
    fontWeight: "600",
  },
  noticeBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    borderRadius: 16,
    borderCurve: "continuous",
    borderWidth: 1,
    paddingHorizontal: 13,
    paddingVertical: 10,
  },
  noticeText: {
    flex: 1,
    fontSize: 11.5,
    lineHeight: 17,
  },
  listContainer: {
    paddingHorizontal: 16,
  },
  listContent: {
    paddingTop: 12,
    paddingBottom: 18,
  },
  messageGap: {
    marginBottom: 14,
  },
  quickStripWrap: {
    paddingBottom: 4,
  },
  quickStripContent: {
    paddingHorizontal: 16,
    gap: 7,
  },
  popoverRoot: {
    zIndex: 40,
  },
  popoverCardWrap: {
    position: "absolute",
    top: 72,
    right: 14,
    zIndex: 42,
  },
  popoverCaretClip: {
    position: "absolute",
    top: -8,
    right: 22,
    width: 20,
    height: 8,
    overflow: "hidden",
  },
  popoverCaretDiamond: {
    position: "absolute",
    left: 4,
    top: 3,
    width: 12,
    height: 12,
    borderRadius: 2.5,
    transform: [{ rotate: "45deg" }],
    borderTopWidth: 1,
    borderLeftWidth: 1,
  },
  previewBackdrop: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(4,10,22,0.92)",
    paddingHorizontal: 18,
  },
  previewCloseBtn: {
    position: "absolute",
    top: 52,
    right: 20,
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.14)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.22)",
  },
  previewImage: {
    width: "100%",
    height: "74%",
    borderRadius: 20,
  },
  previewHint: {
    marginTop: 16,
    fontSize: 11.5,
    color: "rgba(226,232,240,0.68)",
  },
});
