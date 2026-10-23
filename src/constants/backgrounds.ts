/** 背景色调预设：由大爹通过对话让大肥鱼切换 */
export type BackgroundTint =
  | "sky"
  | "rose"
  | "mint"
  | "amber"
  | "violet"
  | "noir";

/** 背景光效：aurora = 三团柔光，plain = 纯色渐变 */
export type BackgroundEffect = "aurora" | "plain";

export interface BackgroundPreset {
  label: string;
  /** 深色模式的三段渐变 */
  dark: readonly [string, string, string];
  /** 浅色模式的三段渐变 */
  light: readonly [string, string, string];
  /** 三团柔光的 RGB（逗号分隔，透明度在 Backdrop 中按明暗模式计算） */
  glowRgb: readonly [string, string, string];
}

export const BACKGROUND_PRESETS: Record<BackgroundTint, BackgroundPreset> = {
  sky: {
    label: "天空蓝",
    dark: ["#0F172A", "#0B1122", "#090D16"],
    light: ["#EAF2FF", "#EEF4FF", "#F6F8FC"],
    glowRgb: ["56,189,248", "139,92,246", "34,211,238"],
  },
  rose: {
    label: "晚霞粉",
    dark: ["#1B0F1C", "#150B16", "#0D070F"],
    light: ["#FFF1F5", "#FDE7F0", "#FBF3F7"],
    glowRgb: ["244,114,182", "251,146,60", "217,70,239"],
  },
  mint: {
    label: "薄荷绿",
    dark: ["#0A1714", "#081310", "#050D0B"],
    light: ["#EAFBF4", "#E3F7EF", "#F2FBF7"],
    glowRgb: ["52,211,153", "34,211,238", "163,230,53"],
  },
  amber: {
    label: "琥珀暖光",
    dark: ["#1A140A", "#140F07", "#0D0904"],
    light: ["#FFF8EA", "#FDF1DD", "#FBF6EC"],
    glowRgb: ["251,191,36", "251,146,60", "253,224,71"],
  },
  violet: {
    label: "紫罗兰",
    dark: ["#150F22", "#100B1A", "#090610"],
    light: ["#F4EFFF", "#EDE6FF", "#F7F3FF"],
    glowRgb: ["167,139,250", "232,121,249", "99,102,241"],
  },
  noir: {
    label: "暗夜灰",
    dark: ["#0B0C0F", "#07080A", "#030405"],
    light: ["#F1F2F4", "#EBECEF", "#F7F8FA"],
    glowRgb: ["148,163,184", "100,116,139", "71,85,105"],
  },
};

export function resolveTint(value: unknown): BackgroundTint {
  return typeof value === "string" &&
    Object.prototype.hasOwnProperty.call(BACKGROUND_PRESETS, value)
    ? (value as BackgroundTint)
    : "sky";
}

export function resolveEffect(value: unknown): BackgroundEffect {
  return value === "plain" ? "plain" : "aurora";
}
