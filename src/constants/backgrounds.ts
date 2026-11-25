/** 背景色调预设：由大爹通过对话让大肥鱼切换 */
export type BackgroundTint =
  | "sky"
  | "rose"
  | "mint"
  | "amber"
  | "violet"
  | "noir";

/** 背景光效：aurora = 多层柔光光场，plain = 纯色渐变 */
export type BackgroundEffect = "aurora" | "plain";

export interface BackgroundPreset {
  label: string;
  /** 扁平材质：深色模式的三段渐变 */
  dark: readonly [string, string, string];
  /** 扁平材质：浅色模式的三段渐变 */
  light: readonly [string, string, string];
  /** 液态玻璃材质：更具色彩流动感与层次的深色三段渐变 */
  glassDark: readonly [string, string, string];
  /** 液态玻璃材质：明朗通透、带色温起伏的浅色三段渐变 */
  glassLight: readonly [string, string, string];
  /** 三团柔光的 RGB（逗号分隔，透明度在 Backdrop 中按明暗模式计算） */
  glowRgb: readonly [string, string, string];
  /** 液态玻璃浅色模式下柔和光斑的 RGB，让浅色玻璃也有明显的透色与折射过渡 */
  glassLightGlowRgb: readonly [string, string, string, string];
  /** 液态玻璃深色模式下浓郁光斑的 RGB，类似澎湃控制中心跨卡片泛彩质感 */
  glassDarkGlowRgb: readonly [string, string, string, string];
}

export const BACKGROUND_PRESETS: Record<BackgroundTint, BackgroundPreset> = {
  sky: {
    label: "天空蓝",
    dark: ["#0F172A", "#0B1122", "#090D16"],
    light: ["#EAF2FF", "#EEF4FF", "#F6F8FC"],
    glassDark: ["#122645", "#0E1C36", "#161B38"],
    glassLight: ["#CDE5FF", "#E4F1FF", "#D5E8FF"],
    glowRgb: ["56,189,248", "139,92,246", "34,211,238"],
    glassLightGlowRgb: ["56,189,248", "129,140,248", "34,211,238", "253,224,142"],
    glassDarkGlowRgb: ["56,189,248", "139,92,246", "20,184,166", "245,158,11"],
  },
  rose: {
    label: "晚霞粉",
    dark: ["#1B0F1C", "#150B16", "#0D070F"],
    light: ["#FFF1F5", "#FDE7F0", "#FBF3F7"],
    glassDark: ["#33152A", "#221024", "#1A1228"],
    glassLight: ["#FFD8E8", "#FFEBF2", "#FCE0D8"],
    glowRgb: ["244,114,182", "251,146,60", "217,70,239"],
    glassLightGlowRgb: ["244,114,182", "251,146,60", "192,132,252", "253,186,116"],
    glassDarkGlowRgb: ["244,114,182", "251,146,60", "192,132,252", "56,189,248"],
  },
  mint: {
    label: "薄荷绿",
    dark: ["#0A1714", "#081310", "#050D0B"],
    light: ["#EAFBF4", "#E3F7EF", "#F2FBF7"],
    glassDark: ["#0E2B25", "#0C211E", "#12242E"],
    glassLight: ["#C7F2E2", "#E4FAF2", "#D0EEF5"],
    glowRgb: ["52,211,153", "34,211,238", "163,230,53"],
    glassLightGlowRgb: ["52,211,153", "34,211,238", "163,230,53", "125,211,252"],
    glassDarkGlowRgb: ["52,211,153", "34,211,238", "163,230,53", "250,204,21"],
  },
  amber: {
    label: "琥珀暖光",
    dark: ["#1A140A", "#140F07", "#0D0904"],
    light: ["#FFF8EA", "#FDF1DD", "#FBF6EC"],
    glassDark: ["#33240D", "#221A10", "#17201C"],
    glassLight: ["#FDE8BE", "#FAF4E4", "#DCEBDD"],
    glowRgb: ["251,191,36", "251,146,60", "253,224,71"],
    glassLightGlowRgb: ["245,176,42", "251,146,60", "94,186,158", "253,224,71"],
    glassDarkGlowRgb: ["245,158,11", "234,88,12", "52,168,128", "250,204,21"],
  },
  violet: {
    label: "紫罗兰",
    dark: ["#150F22", "#100B1A", "#090610"],
    light: ["#F4EFFF", "#EDE6FF", "#F7F3FF"],
    glassDark: ["#241740", "#191230", "#141D38"],
    glassLight: ["#DFD3FF", "#F1EBFF", "#D8E6FF"],
    glowRgb: ["167,139,250", "232,121,249", "99,102,241"],
    glassLightGlowRgb: ["167,139,250", "232,121,249", "96,165,250", "244,114,182"],
    glassDarkGlowRgb: ["167,139,250", "232,121,249", "56,189,248", "244,114,182"],
  },
  noir: {
    label: "暗夜灰",
    dark: ["#0B0C0F", "#07080A", "#030405"],
    light: ["#F1F2F4", "#EBECEF", "#F7F8FA"],
    glassDark: ["#1B202A", "#141820", "#1C242D"],
    glassLight: ["#D7DFE9", "#ECEFF4", "#D8E0E8"],
    glowRgb: ["148,163,184", "100,116,139", "71,85,105"],
    glassLightGlowRgb: ["120,144,174", "168,184,204", "148,163,184", "203,213,225"],
    glassDarkGlowRgb: ["148,163,184", "96,125,158", "100,116,139", "180,196,214"],
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
