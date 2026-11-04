import palette from "./widgetPalette.json";

/** 桌面小组件主题色（与 plugins/withCourseWidgets.js 共用同一份 JSON） */
export type WidgetAccent =
  | "default"
  | "black"
  | "white"
  | "green"
  | "yellow"
  | "red"
  | "blue"
  | "orange"
  | "indigo"
  | "purple"
  | "pink"
  | "cyan"
  | "teal"
  | "navy"
  | "gray";

export interface WidgetAccentPalette {
  key: WidgetAccent;
  label: string;
  /** 色板主色，用于设置页色块与预览 */
  color: string;
  bgDark: string;
  borderDark: string;
  brandDark: string;
  bgLight: string;
  borderLight: string;
  brandLight: string;
  /** 色块上的文字颜色 */
  textDark: string;
}

export const WIDGET_ACCENTS = palette as WidgetAccentPalette[];

export function widgetAccent(key: string | undefined): WidgetAccentPalette {
  return WIDGET_ACCENTS.find((item) => item.key === key) ?? WIDGET_ACCENTS[0];
}
