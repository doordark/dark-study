import type Ionicons from "@expo/vector-icons/Ionicons";
import { StyleSheet } from "react-native";

import type { PetAnimationKind } from "@/components/PetAnimation";
import { useWhalePersona } from "@/store/useWhalePersona";
import type { WhaleCare } from "@/store/useWhalePet";
import type {
  AssistantAction,
  ChatMessage,
  PetActionKind,
  ScheduleAction,
  WhaleAction,
} from "@/types";
import { uid } from "@/utils/id";
import { renderPersonaText } from "@/utils/whalePersona";

export type PetFrame = PetAnimationKind;
export type PetMsg = ChatMessage;

export interface PanelAnchor {
  left: number;
  top: number;
  above: boolean;
  originOffsetX: number;
  pointerLeft: number;
}

export const BASE_SIZE = 84;
/** 立绘高宽比（素材是竖构图 192:256） */
export const RATIO = 1.35;
export const EDGE = 10;
/** 底部操作栏预留：桌宠落地时停在胶囊栏上方，不挡按钮 */
export const FLOOR_RESERVE = 72;
export const PANEL_SPRING = { damping: 19, stiffness: 275, mass: 0.78 };

export const IDLE_DELAY_MIN = 6_500;
export const IDLE_DELAY_MAX = 12_500;
export const SLEEP_AFTER = 125_000;
/** 甩出去的判定门槛（px/s），低于它就是轻轻放下 */
export const THROW_DEAD_ZONE = 480;
export const MAX_THROW_SPEED = 3600;

/** 各动作随口说的话 */
export const ACTION_LINES: Record<PetActionKind, string> = {
  dance: "♪ 扭一扭～{{user}}看好了！",
  spin: "转圈圈——晕了晕了…",
  eat: "团子！嗷呜——好吃！",
  study: "我陪你写，不吵你。",
  sleep: "那我也眯一小会儿…",
  jump: "嘿咻！",
  wave: "{{user}}～我在这儿呢",
  cuddle: "嘿嘿…蹭蹭{{user}}～",
};

/** 浮层去重整合后的快捷互动胶囊（零重复，按高频互动排序） */
export interface PetQuickActionDef {
  id: "feed" | "pat" | "dance" | "study" | "spin" | "wave";
  label: string;
  hungryLabel?: string;
  icon: keyof typeof Ionicons.glyphMap;
  accent: string;
}

export const PET_QUICK_ACTIONS: readonly PetQuickActionDef[] = [
  { id: "feed", label: "抛团子", hungryLabel: "抛白饭", icon: "restaurant-outline", accent: "#F59E0B" },
  { id: "pat", label: "摸摸头", icon: "heart-outline", accent: "#EC4899" },
  { id: "dance", label: "跳支舞", icon: "musical-notes-outline", accent: "#0EA5E9" },
  { id: "study", label: "陪我学习", icon: "book-outline", accent: "#6366F1" },
  { id: "spin", label: "转个圈", icon: "refresh-outline", accent: "#10B981" },
  { id: "wave", label: "打个招呼", icon: "hand-left-outline", accent: "#38BDF8" },
];

/** 本地动作口令：无 Key 时零延迟直接播 */
export const LOCAL_ACTIONS: { re: RegExp; action: PetActionKind; reply: string }[] = [
  { re: /转(个)?圈|旋转|转一转|spin/i, action: "spin", reply: "看好啦，转圈圈～" },
  {
    re: /跳舞|扭一扭|扭两下|来一段|dance/i,
    action: "dance",
    reply: "嘿嘿，那我扭两下，别笑我。",
  },
  { re: /吃|饭|团子|饿|零食/, action: "eat", reply: "团子我可不客气啦！" },
  {
    re: /学习|写作业|陪你(写|学)|一起学/,
    action: "study",
    reply: "好，我坐这儿陪你，不吵你。",
  },
  { re: /睡|困|晚安|休息/, action: "sleep", reply: "那我也眯一会儿…你也别熬太晚。" },
  { re: /蹦|跳一下|跳跳/, action: "jump", reply: "嘿咻！" },
  { re: /打招呼|招手|^hi$|^hello$/i, action: "wave", reply: "{{user}}～我在这儿呢" },
  { re: /摸摸|摸头|蹭蹭|贴贴|抱抱/, action: "cuddle", reply: "嘿嘿…再蹭一小会儿～" },
];

export const SCHEDULE_TYPES = new Set([
  "add",
  "remove",
  "update",
  "create_schedule",
  "merge_schedule",
  "add_task",
]);

export const isScheduleAction = (a: AssistantAction): a is ScheduleAction =>
  SCHEDULE_TYPES.has(a.type);

export const isWhaleAction = (a: AssistantAction): a is WhaleAction =>
  !SCHEDULE_TYPES.has(a.type);

export const rand = () => Math.random();
export const randBetween = (min: number, max: number) =>
  min + Math.random() * (max - min);
export const nowMs = () => Date.now();
export const clampNumber = (v: number, min: number, max: number) =>
  Math.min(Math.max(v, min), max);

export const petMsg = (role: PetMsg["role"], text: string): PetMsg => ({
  id: uid(),
  role,
  content: role === "assistant" ? renderPersonaText(text, useWhalePersona.getState().persona) : text,
  timestamp: Date.now(),
});

/**
 * 清洗并柔化桌宠对话中的括号前缀：
 * 1. 彻底剔除生硬冗余的系统碰撞前缀（如 "(刚才撞到了屏幕下边框)"），兼容已持久化旧消息；
 * 2. 将温和神态描写（如 "（尾巴晃了晃）"）提炼为轻盈微标签，不再硬塞进正文。
 */
export function parsePetBubbleText(raw: string): { stageNote: string | null; body: string } {
  const trimmed = raw.trim();
  const withoutBump = trimmed.replace(/^[（(]\s*刚才撞到了屏幕[^）)]*[）)]\s*/u, "");
  const stageMatch = withoutBump.match(/^[（(]([^）)]{1,18})[）)]\s*(.+)$/su);
  if (stageMatch) {
    return {
      stageNote: stageMatch[1].trim(),
      body: stageMatch[2].trim(),
    };
  }
  return {
    stageNote: null,
    body: withoutBump || trimmed,
  };
}

/** 气泡太长就分页，一页一页说完，避免糊成一大坨 */
export function splitPages(text: string): string[] {
  const clean = text.trim();
  if (clean.length <= 36) return [clean];
  const out: string[] = [];
  for (let i = 0; i < clean.length; i += 32) out.push(clean.slice(i, i + 32));
  return out;
}

export function careHint(care: WhaleCare): string {
  const lines = [
    `饱食度 ${Math.round(care.fullness)}/100`,
    `心情 ${Math.round(care.mood)}/100`,
    `好感 ${Math.round(care.bond)}/100`,
  ];
  if (care.fullness < 25) lines.push("她现在很饿，说话会没力气");
  if (care.mood < 30) lines.push("她有点委屈，因为很久没人陪了");
  return lines.join("，");
}

export function computePanelAnchor(params: {
  px: number;
  py: number;
  petSize: number;
  petHeight: number;
  panelW: number;
  panelH: number;
  width: number;
  height: number;
  insetTop: number;
  insetBottom: number;
}): PanelAnchor {
  const { px, py, petSize, petHeight, panelW, panelH, width, height, insetTop, insetBottom } = params;
  const petCenterX = px + petSize / 2;
  const left = clampNumber(petCenterX - panelW / 2, 12, width - panelW - 12);
  const aboveTop = py - panelH - 12;
  const above = aboveTop > insetTop + 8;
  const top = above
    ? aboveTop
    : clampNumber(py + petHeight + 12, insetTop + 8, height - panelH - insetBottom - 10);
  const originOffsetX = clampNumber(petCenterX - (left + panelW / 2), -panelW * 0.36, panelW * 0.36);
  const pointerLeft = clampNumber(petCenterX - left - 7, 24, panelW - 38);
  return { left, top, above, originOffsetX, pointerLeft };
}

export const whalePetStyles = StyleSheet.create({
  snackPill: {
    position: "absolute",
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: "rgba(255,255,255,0.96)",
    borderWidth: 1.5,
    borderColor: "#38BDF8",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 19,
    boxShadow: [
      { offsetX: 0, offsetY: 3, blurRadius: 8, color: "rgba(56,189,248,0.28)" },
    ],
  },
  snackEmoji: {
    fontSize: 13.5,
  },
  petContainer: {
    position: "absolute",
    left: 0,
    top: 0,
    zIndex: 27,
  },
  needBadge: {
    position: "absolute",
    top: -6,
    right: 0,
    width: 19,
    height: 19,
    borderRadius: 9.5,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1.5,
    borderColor: "rgba(255,255,255,0.78)",
    zIndex: 4,
  },
  floatingBubble: {
    position: "absolute",
    width: 204,
    borderRadius: 16,
    borderCurve: "continuous",
    overflow: "hidden",
    paddingHorizontal: 11,
    paddingVertical: 8,
    borderWidth: 1,
    zIndex: 7,
  },
  floatingBubbleText: {
    fontSize: 11,
    lineHeight: 16.5,
  },
  petShadow: {
    position: "absolute",
    bottom: 2,
    height: 6,
    borderRadius: 99,
    backgroundColor: "rgba(0,0,0,0.8)",
  },
  scrim: {
    zIndex: 25,
  },
  popoverOuter: {
    position: "absolute",
    zIndex: 30,
  },
  pointerClip: {
    position: "absolute",
    width: 20,
    height: 8,
    overflow: "hidden",
  },
  pointerDiamond: {
    position: "absolute",
    left: 4,
    width: 12,
    height: 12,
    borderRadius: 2.5,
    transform: [{ rotate: "45deg" }],
  },
  popoverCard: {
    borderRadius: 26,
    borderCurve: "continuous",
    paddingTop: 13,
    paddingBottom: 4,
    overflow: "hidden",
    borderWidth: 1,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 13,
  },
  avatarFrame: {
    width: 40,
    height: 40,
    borderRadius: 15,
    borderCurve: "continuous",
    marginRight: 9,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
    borderWidth: 1.2,
  },
  headerInfo: {
    flex: 1,
    minWidth: 0,
    marginRight: 8,
  },
  headerName: {
    fontSize: 14.5,
    fontWeight: "800",
  },
  moodRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4.5,
    marginTop: 2.5,
  },
  moodDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  moodLabel: {
    fontSize: 10.5,
    fontWeight: "600",
  },
  headerControls: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    flexShrink: 0,
  },
  desktopPill: {
    height: 30,
    paddingHorizontal: 10,
    borderRadius: 15,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
    borderWidth: 1,
  },
  desktopPillText: {
    fontSize: 10,
    fontWeight: "700",
  },
  roundIconBtn: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 0.75,
  },
  careRow: {
    flexDirection: "row",
    gap: 7,
    paddingHorizontal: 12,
    paddingTop: 10,
  },
  careCard: {
    flex: 1,
    minWidth: 0,
    borderRadius: 12,
    borderCurve: "continuous",
    paddingHorizontal: 8,
    paddingVertical: 6.5,
    borderWidth: 1,
  },
  careCardHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 4,
  },
  careLabelGroup: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
  },
  careLabel: {
    fontSize: 9.5,
    fontWeight: "600",
  },
  careValue: {
    fontSize: 10,
    fontWeight: "800",
  },
  careTrack: {
    height: 4,
    borderRadius: 99,
    overflow: "hidden",
  },
  careFill: {
    height: "100%",
    borderRadius: 99,
  },
  chatListBox: {
    marginTop: 10,
    marginHorizontal: 12,
    borderRadius: 18,
    borderCurve: "continuous",
    borderWidth: 1,
  },
  chatListContent: {
    paddingHorizontal: 10,
    paddingVertical: 10,
  },
  emptyBox: {
    alignItems: "center",
    paddingVertical: 18,
  },
  emptyText: {
    fontSize: 11,
    fontWeight: "600",
  },
  busyWrap: {
    alignItems: "flex-start",
    paddingBottom: 4,
  },
  busyPill: {
    borderRadius: 14,
    borderBottomLeftRadius: 4,
    paddingHorizontal: 11,
    paddingVertical: 6,
    borderWidth: 1,
  },
  busyText: {
    fontSize: 10.5,
    fontWeight: "600",
  },
  quickBar: {
    flexDirection: "row",
    alignItems: "center",
    paddingLeft: 12,
    paddingRight: 12,
    paddingTop: 9,
    paddingBottom: 2,
    flexShrink: 0,
  },
  quickScroll: {
    flex: 1,
    flexGrow: 0,
    flexShrink: 1,
  },
  quickScrollContent: {
    gap: 6,
    paddingRight: 6,
    alignItems: "center",
  },
  quickPill: {
    height: 31,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 4.5,
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 10.5,
  },
  quickPillText: {
    fontSize: 10.5,
    fontWeight: "700",
  },
  quickDivider: {
    width: 1,
    height: 16,
    marginHorizontal: 6,
  },
  dismissPill: {
    flexShrink: 0,
    height: 31,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 10,
  },
  dismissPillText: {
    fontSize: 10.5,
    fontWeight: "700",
  },
});
