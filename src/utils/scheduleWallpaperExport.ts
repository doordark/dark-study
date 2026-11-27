import { Platform, Share } from "react-native";

import {
  BACKGROUND_PRESETS,
  type BackgroundTint,
} from "@/constants/backgrounds";
import { coursePalette, WEEKDAY_LABELS } from "@/constants/palette";
import type { Course, Schedule } from "@/types";
import { addDays, mondayOf, parseIsoDate } from "@/utils/time";

export const WALLPAPER_DEFAULT_WIDTH = 1080;
export const WALLPAPER_DEFAULT_HEIGHT = 1920;

const ANDROID_FLAG_GRANT_READ_URI_PERMISSION = 1;
const TO_DATA_URL_TIMEOUT_MS = 12_000;

export interface WallpaperPosterConfig {
  schedule: Schedule;
  week: number;
  tint: BackgroundTint;
  posterDark: boolean;
  showWeekend: boolean;
  width?: number;
  height?: number;
}

export interface WallpaperDayColumn {
  weekday: number;
  shortLabel: string;
  dateLabel: string;
  x: number;
  width: number;
  centerX: number;
}

export interface WallpaperPeriodRow {
  index: number;
  startTime: string;
  endTime: string;
  y: number;
  height: number;
  centerY: number;
}

export interface WallpaperCourseBlock {
  id: string;
  clipId: string;
  x: number;
  y: number;
  width: number;
  height: number;
  rx: number;
  accentColor: string;
  fillOpacity: number;
  strokeOpacity: number;
  nameLines: string[];
  nameFontSize: number;
  nameLineHeight: number;
  metaText: string;
  metaFontSize: number;
  teacherText: string;
}

export interface WallpaperPosterLayout {
  width: number;
  height: number;
  week: number;
  posterDark: boolean;
  scheduleName: string;
  dateRange: string;
  semesterRange: string;
  courseCountLabel: string;
  gradientColors: readonly [string, string, string];
  glowRgb: readonly [string, string, string];
  glowOpacities: readonly [number, number, number];
  inkPrimary: string;
  inkMuted: string;
  gridLine: string;
  surfaceBg: string;
  surfaceBorder: string;
  card: { x: number; y: number; width: number; height: number; rx: number };
  badge: { x: number; y: number; width: number; height: number; rx: number };
  headerRowHeight: number;
  axisWidth: number;
  gridTopY: number;
  gridHeight: number;
  days: WallpaperDayColumn[];
  periods: WallpaperPeriodRow[];
  courses: WallpaperCourseBlock[];
  footerY: number;
}

export interface SvgExportRefLike {
  toDataURL?: (
    callback: (base64: string) => void,
    options?: { width?: number; height?: number },
  ) => void;
}

export interface ExportWallpaperPngOptions {
  svgRef?: { current: SvgExportRefLike | null } | null;
  svgMarkup: string;
  fileName: string;
  width?: number;
  height?: number;
  title?: string;
  /** Android 行为："share" 调起系统图片查看/设为壁纸/分享；"save" 通过 SAF 保存到用户所选目录 */
  androidAction?: "share" | "save";
}

export interface ExportWallpaperPngResult {
  uri: string;
  fileName: string;
  format: "png" | "svg";
  method: "download" | "share" | "intent" | "saf";
  canceled?: boolean;
}

function charVisualUnits(ch: string): number {
  const code = ch.charCodeAt(0);
  if (code <= 0x007f) {
    if ("ilI1.,:;'|! ".includes(ch)) return 0.36;
    if ("MW@#%&".includes(ch)) return 0.82;
    return 0.56;
  }
  return 1.0;
}

/** 按 CJK / ASCII 视觉宽度进行精确折行，避免 SVG 文本溢出课程卡片 */
export function wrapPosterText(
  raw: string,
  maxUnitsPerLine: number,
  maxLines: number,
): string[] {
  const text = raw.replace(/\s+/g, " ").trim();
  if (!text || maxLines <= 0 || maxUnitsPerLine <= 0) return [];

  const chars = Array.from(text);
  const lines: string[] = [];
  let current = "";
  let units = 0;

  for (let i = 0; i < chars.length; i++) {
    const ch = chars[i];
    const w = charVisualUnits(ch);
    if (units + w > maxUnitsPerLine && current.length > 0) {
      if (lines.length === maxLines - 1) {
        // 最后一行截断并追加省略号
        while (current.length > 1 && units + 0.85 > maxUnitsPerLine) {
          const popped = current.slice(-1);
          current = current.slice(0, -1);
          units -= charVisualUnits(popped);
        }
        lines.push(`${current.trimEnd()}…`);
        return lines;
      }
      lines.push(current.trimEnd());
      current = ch === " " ? "" : ch;
      units = ch === " " ? 0 : w;
    } else {
      current += ch;
      units += w;
    }
  }

  if (current.trim()) {
    lines.push(current.trim());
  }
  return lines.slice(0, maxLines);
}

export function escapeSvgXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

export function buildWallpaperFileName(
  scheduleName: string,
  week: number,
  ext: "png" | "svg" = "png",
): string {
  const safeBase =
    (scheduleName || "schedule")
      .trim()
      .replace(/[\\/:*?"<>|\s]+/g, "_")
      .slice(0, 40) || "schedule";
  const safeWeek = Math.max(1, Math.floor(Number(week) || 1));
  return `DarkStudy-${safeBase}-W${safeWeek}.${ext}`;
}

function formatWeekDateRange(schedule: Schedule, week: number): string {
  const startMonday = mondayOf(parseIsoDate(schedule.startDate));
  if (!Number.isFinite(startMonday.getTime())) return "";
  const weekMon = addDays(startMonday, (week - 1) * 7);
  const weekSun = addDays(weekMon, 6);
  const fmt = (d: Date) =>
    `${d.getMonth() + 1}.${String(d.getDate()).padStart(2, "0")}`;
  return `${fmt(weekMon)} – ${fmt(weekSun)}`;
}

/** 计算高清课表壁纸的全部矢量几何坐标、主题配色与折行文本 */
export function computeScheduleWallpaperLayout(
  config: WallpaperPosterConfig,
): WallpaperPosterLayout {
  const width = Math.max(
    540,
    Math.round(config.width ?? WALLPAPER_DEFAULT_WIDTH),
  );
  const height = Math.max(
    960,
    Math.round(config.height ?? WALLPAPER_DEFAULT_HEIGHT),
  );
  const { schedule, tint, posterDark, showWeekend } = config;
  const totalWeeks = Math.max(1, schedule.totalWeeks || 18);
  const week = Math.min(totalWeeks, Math.max(1, Math.floor(config.week || 1)));

  const preset = BACKGROUND_PRESETS[tint] ?? BACKGROUND_PRESETS.sky;
  const gradientColors = posterDark ? preset.glassDark : preset.glassLight;
  const glowSrc = posterDark ? preset.glassDarkGlowRgb : preset.glassLightGlowRgb;
  const glowRgb: readonly [string, string, string] = [
    glowSrc[0],
    glowSrc[1],
    glowSrc[2],
  ];
  const glowOpacities: readonly [number, number, number] = posterDark
    ? [0.36, 0.32, 0.26]
    : [0.42, 0.36, 0.3];

  const inkPrimary = posterDark ? "#F8FAFC" : "#0F172A";
  const inkMuted = posterDark
    ? "rgba(226,232,240,0.72)"
    : "rgba(51,65,85,0.74)";
  const gridLine = posterDark
    ? "rgba(255,255,255,0.10)"
    : "rgba(15,23,42,0.09)";
  const surfaceBg = posterDark
    ? "rgba(15,23,42,0.50)"
    : "rgba(255,255,255,0.66)";
  const surfaceBorder = posterDark
    ? "rgba(255,255,255,0.16)"
    : "rgba(255,255,255,0.84)";

  const padX = Math.round(width * 0.044);
  const headerTopY = Math.round(height * 0.045);
  const cardY = Math.round(height * 0.125);
  const footerReserve = Math.round(height * 0.056);
  const cardWidth = width - padX * 2;
  const cardHeight = height - cardY - footerReserve;
  const card = {
    x: padX,
    y: cardY,
    width: cardWidth,
    height: cardHeight,
    rx: 42,
  };

  const badgeWidth = 248;
  const badgeHeight = 104;
  const badge = {
    x: width - padX - badgeWidth,
    y: headerTopY + 4,
    width: badgeWidth,
    height: badgeHeight,
    rx: 28,
  };

  const headerRowHeight = 96;
  const axisWidth = 96;
  const gridTopY = card.y + headerRowHeight;
  const gridHeight = card.height - headerRowHeight;

  const dayCount = showWeekend ? 7 : 5;
  const colWidth = (card.width - axisWidth) / dayCount;
  const startMonday = mondayOf(parseIsoDate(schedule.startDate));
  const hasValidStart = Number.isFinite(startMonday.getTime());
  const weekStart = hasValidStart ? addDays(startMonday, (week - 1) * 7) : null;

  const days: WallpaperDayColumn[] = Array.from(
    { length: dayCount },
    (_, i) => {
      const weekday = i + 1;
      const x = card.x + axisWidth + i * colWidth;
      const date = weekStart ? addDays(weekStart, i) : null;
      return {
        weekday,
        shortLabel: (WEEKDAY_LABELS[i] ?? `周${weekday}`).replace("周", ""),
        dateLabel: date ? `${date.getMonth() + 1}/${date.getDate()}` : "",
        x,
        width: colWidth,
        centerX: x + colWidth / 2,
      };
    },
  );

  const rawPeriods = schedule.periods.length
    ? schedule.periods
    : [
        { index: 1, label: "第1节", startTime: "08:00", endTime: "08:45" },
        { index: 2, label: "第2节", startTime: "08:55", endTime: "09:40" },
      ];
  const rowHeight = gridHeight / rawPeriods.length;
  const periods: WallpaperPeriodRow[] = rawPeriods.map((p, idx) => {
    const y = gridTopY + idx * rowHeight;
    return {
      index: p.index,
      startTime: p.startTime,
      endTime: p.endTime,
      y,
      height: rowHeight,
      centerY: y + rowHeight / 2,
    };
  });

  const weekCourses: Course[] = schedule.courses.filter(
    (c) => c.weeks.includes(week) && c.weekday >= 1 && c.weekday <= dayCount,
  );

  const nameFontSize = showWeekend ? 23 : 27;
  const nameLineHeight = showWeekend ? 30 : 35;
  const metaFontSize = showWeekend ? 18 : 21;

  const courses: WallpaperCourseBlock[] = weekCourses.map((course, idx) => {
    const palette = coursePalette[course.color] ?? coursePalette.sky;
    const startIdx = Math.max(
      0,
      rawPeriods.findIndex((p) => p.index === course.startPeriod),
    );
    const endIdxFound = rawPeriods.findIndex(
      (p) => p.index === course.endPeriod,
    );
    const endIdx =
      endIdxFound >= startIdx
        ? endIdxFound
        : Math.min(
            rawPeriods.length - 1,
            startIdx + Math.max(0, course.endPeriod - course.startPeriod),
          );
    const span = Math.max(1, endIdx - startIdx + 1);

    const colX = card.x + axisWidth + (course.weekday - 1) * colWidth;
    const insetX = 6;
    const insetY = 5;
    const bx = colX + insetX;
    const by = gridTopY + startIdx * rowHeight + insetY;
    const bw = Math.max(40, colWidth - insetX * 2);
    const bh = Math.max(48, span * rowHeight - insetY * 2);

    const textAvailWidth = Math.max(24, bw - 26);
    const maxNameUnits = Math.max(2.2, textAvailWidth / nameFontSize);
    const maxMetaUnits = Math.max(2.5, textAvailWidth / metaFontSize);

    const hasClassroom = Boolean(course.classroom?.trim());
    const hasTeacher = Boolean(course.teacher?.trim());
    const reserveForMeta = hasClassroom && bh >= 112 ? 32 : 0;
    const reserveForTeacher = hasTeacher && bh >= 176 ? 26 : 0;
    const maxNameLines = Math.max(
      1,
      Math.min(
        span >= 3 ? 4 : 3,
        Math.floor(
          (bh - 20 - reserveForMeta - reserveForTeacher) / nameLineHeight,
        ),
      ),
    );

    const nameLines = wrapPosterText(course.name, maxNameUnits, maxNameLines);
    const metaText =
      reserveForMeta > 0
        ? (wrapPosterText(course.classroom.trim(), maxMetaUnits, 1)[0] ?? "")
        : "";
    const teacherText =
      reserveForTeacher > 0
        ? (wrapPosterText(course.teacher.trim(), maxMetaUnits, 1)[0] ?? "")
        : "";

    return {
      id: course.id || `course-${idx}`,
      clipId: `wp-clip-${idx}`,
      x: bx,
      y: by,
      width: bw,
      height: bh,
      rx: 18,
      accentColor: palette.solid,
      fillOpacity: posterDark ? 0.25 : 0.2,
      strokeOpacity: posterDark ? 0.36 : 0.3,
      nameLines,
      nameFontSize,
      nameLineHeight,
      metaText,
      metaFontSize,
      teacherText,
    };
  });

  const scheduleTitle =
    wrapPosterText(schedule.name?.trim() || "Dark Study 课表", 13.5, 1)[0] ??
    "Dark Study 课表";

  return {
    width,
    height,
    week,
    posterDark,
    scheduleName: scheduleTitle,
    dateRange: formatWeekDateRange(schedule, week),
    semesterRange:
      schedule.startDate && schedule.endDate
        ? `${schedule.startDate} ~ ${schedule.endDate}`
        : schedule.startDate || "",
    courseCountLabel: `本周共 ${weekCourses.length} 节次排课`,
    gradientColors,
    glowRgb,
    glowOpacities,
    inkPrimary,
    inkMuted,
    gridLine,
    surfaceBg,
    surfaceBorder,
    card,
    badge,
    headerRowHeight,
    axisWidth,
    gridTopY,
    gridHeight,
    days,
    periods,
    courses,
    footerY: card.y + card.height + 54,
  };
}

/** 生成独立完整的 W3C 标准 SVG 壁纸 XML（用于 Web 端 Canvas 栅格化 PNG 与单元测试） */
export function buildScheduleWallpaperSvgMarkup(
  config: WallpaperPosterConfig,
): string {
  const l = computeScheduleWallpaperLayout(config);
  const fontFamily =
    "-apple-system, BlinkMacSystemFont, 'PingFang SC', 'Hiragino Sans GB', 'Microsoft YaHei', 'Noto Sans CJK SC', sans-serif";

  const parts: string[] = [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${l.width}" height="${l.height}" viewBox="0 0 ${l.width} ${l.height}">`,
    "<defs>",
    `<linearGradient id="wp-bg" x1="0%" y1="0%" x2="90%" y2="100%">`,
    `<stop offset="0%" stop-color="${escapeSvgXml(l.gradientColors[0])}" />`,
    `<stop offset="50%" stop-color="${escapeSvgXml(l.gradientColors[1])}" />`,
    `<stop offset="100%" stop-color="${escapeSvgXml(l.gradientColors[2])}" />`,
    "</linearGradient>",
    `<radialGradient id="wp-glow1" cx="18%" cy="14%" r="55%">`,
    `<stop offset="0%" stop-color="rgb(${l.glowRgb[0]})" stop-opacity="${l.glowOpacities[0]}" />`,
    `<stop offset="100%" stop-color="rgb(${l.glowRgb[0]})" stop-opacity="0" />`,
    "</radialGradient>",
    `<radialGradient id="wp-glow2" cx="85%" cy="32%" r="52%">`,
    `<stop offset="0%" stop-color="rgb(${l.glowRgb[1]})" stop-opacity="${l.glowOpacities[1]}" />`,
    `<stop offset="100%" stop-color="rgb(${l.glowRgb[1]})" stop-opacity="0" />`,
    "</radialGradient>",
    `<radialGradient id="wp-glow3" cx="50%" cy="90%" r="58%">`,
    `<stop offset="0%" stop-color="rgb(${l.glowRgb[2]})" stop-opacity="${l.glowOpacities[2]}" />`,
    `<stop offset="100%" stop-color="rgb(${l.glowRgb[2]})" stop-opacity="0" />`,
    "</radialGradient>",
  ];

  for (const c of l.courses) {
    parts.push(
      `<clipPath id="${escapeSvgXml(c.clipId)}"><rect x="${c.x.toFixed(1)}" y="${c.y.toFixed(1)}" width="${c.width.toFixed(1)}" height="${c.height.toFixed(1)}" rx="${c.rx}" ry="${c.rx}" /></clipPath>`,
    );
  }

  parts.push("</defs>");

  // 背景渐变 + 三团极光光晕
  parts.push(
    `<rect x="0" y="0" width="${l.width}" height="${l.height}" fill="url(#wp-bg)" />`,
    `<circle cx="${Math.round(l.width * 0.18)}" cy="${Math.round(l.height * 0.14)}" r="${Math.round(l.width * 0.56)}" fill="url(#wp-glow1)" />`,
    `<circle cx="${Math.round(l.width * 0.85)}" cy="${Math.round(l.height * 0.32)}" r="${Math.round(l.width * 0.52)}" fill="url(#wp-glow2)" />`,
    `<circle cx="${Math.round(l.width * 0.5)}" cy="${Math.round(l.height * 0.9)}" r="${Math.round(l.width * 0.58)}" fill="url(#wp-glow3)" />`,
  );

  // 页眉
  const headerBaseY = l.badge.y + 30;
  parts.push(
    `<text x="${l.card.x}" y="${headerBaseY}" fill="${escapeSvgXml(l.inkMuted)}" font-family="${fontFamily}" font-size="22" font-weight="700" letter-spacing="3.5">DARK STUDY · TIMETABLE</text>`,
    `<text x="${l.card.x}" y="${headerBaseY + 62}" fill="${escapeSvgXml(l.inkPrimary)}" font-family="${fontFamily}" font-size="48" font-weight="800">${escapeSvgXml(l.scheduleName)}</text>`,
    `<rect x="${l.badge.x}" y="${l.badge.y}" width="${l.badge.width}" height="${l.badge.height}" rx="${l.badge.rx}" ry="${l.badge.rx}" fill="${escapeSvgXml(l.surfaceBg)}" stroke="${escapeSvgXml(l.surfaceBorder)}" stroke-width="2" />`,
    `<text x="${l.badge.x + l.badge.width - 26}" y="${l.badge.y + 48}" text-anchor="end" fill="${escapeSvgXml(l.inkPrimary)}" font-family="${fontFamily}" font-size="32" font-weight="800">第 ${l.week} 周</text>`,
  );
  if (l.dateRange) {
    parts.push(
      `<text x="${l.badge.x + l.badge.width - 26}" y="${l.badge.y + 82}" text-anchor="end" fill="${escapeSvgXml(l.inkMuted)}" font-family="${fontFamily}" font-size="22" font-weight="600">${escapeSvgXml(l.dateRange)}</text>`,
    );
  }

  // 玻璃课表卡片外壳
  parts.push(
    `<rect x="${l.card.x}" y="${l.card.y}" width="${l.card.width}" height="${l.card.height}" rx="${l.card.rx}" ry="${l.card.rx}" fill="${escapeSvgXml(l.surfaceBg)}" stroke="${escapeSvgXml(l.surfaceBorder)}" stroke-width="2.5" />`,
    `<line x1="${l.card.x}" y1="${l.gridTopY}" x2="${l.card.x + l.card.width}" y2="${l.gridTopY}" stroke="${escapeSvgXml(l.gridLine)}" stroke-width="2" />`,
    `<line x1="${l.card.x + l.axisWidth}" y1="${l.card.y}" x2="${l.card.x + l.axisWidth}" y2="${l.card.y + l.card.height}" stroke="${escapeSvgXml(l.gridLine)}" stroke-width="2" />`,
    `<text x="${l.card.x + l.axisWidth / 2}" y="${l.card.y + l.headerRowHeight / 2 + 9}" text-anchor="middle" fill="${escapeSvgXml(l.inkMuted)}" font-family="${fontFamily}" font-size="22" font-weight="700">节</text>`,
  );

  // 星期表头与列分割线
  for (let i = 0; i < l.days.length; i++) {
    const day = l.days[i];
    if (i > 0) {
      parts.push(
        `<line x1="${day.x.toFixed(1)}" y1="${l.gridTopY}" x2="${day.x.toFixed(1)}" y2="${l.card.y + l.card.height}" stroke="${escapeSvgXml(l.gridLine)}" stroke-width="1.5" />`,
      );
    }
    parts.push(
      `<text x="${day.centerX.toFixed(1)}" y="${l.card.y + 42}" text-anchor="middle" fill="${escapeSvgXml(l.inkPrimary)}" font-family="${fontFamily}" font-size="27" font-weight="800">${escapeSvgXml(day.shortLabel)}</text>`,
    );
    if (day.dateLabel) {
      parts.push(
        `<text x="${day.centerX.toFixed(1)}" y="${l.card.y + 74}" text-anchor="middle" fill="${escapeSvgXml(l.inkMuted)}" font-family="${fontFamily}" font-size="20" font-weight="600">${escapeSvgXml(day.dateLabel)}</text>`,
      );
    }
  }

  // 节次轴与行分割线
  for (let i = 0; i < l.periods.length; i++) {
    const p = l.periods[i];
    if (i > 0) {
      parts.push(
        `<line x1="${l.card.x}" y1="${p.y.toFixed(1)}" x2="${l.card.x + l.card.width}" y2="${p.y.toFixed(1)}" stroke="${escapeSvgXml(l.gridLine)}" stroke-width="1.5" />`,
      );
    }
    const axisCx = l.card.x + l.axisWidth / 2;
    parts.push(
      `<text x="${axisCx.toFixed(1)}" y="${(p.centerY - 4).toFixed(1)}" text-anchor="middle" fill="${escapeSvgXml(l.inkPrimary)}" font-family="${fontFamily}" font-size="25" font-weight="800">${p.index}</text>`,
      `<text x="${axisCx.toFixed(1)}" y="${(p.centerY + 23).toFixed(1)}" text-anchor="middle" fill="${escapeSvgXml(l.inkMuted)}" font-family="${fontFamily}" font-size="18" font-weight="600">${escapeSvgXml(p.startTime)}</text>`,
    );
  }

  // 课程色块
  for (const c of l.courses) {
    parts.push(
      `<g clip-path="url(#${escapeSvgXml(c.clipId)})">`,
      `<rect x="${c.x.toFixed(1)}" y="${c.y.toFixed(1)}" width="${c.width.toFixed(1)}" height="${c.height.toFixed(1)}" rx="${c.rx}" ry="${c.rx}" fill="${escapeSvgXml(c.accentColor)}" fill-opacity="${c.fillOpacity}" stroke="${escapeSvgXml(c.accentColor)}" stroke-opacity="${c.strokeOpacity}" stroke-width="2" />`,
      `<rect x="${c.x.toFixed(1)}" y="${c.y.toFixed(1)}" width="8" height="${c.height.toFixed(1)}" fill="${escapeSvgXml(c.accentColor)}" />`,
    );

    const textX = c.x + 17;
    let cursorY = c.y + 12 + c.nameFontSize;
    for (const line of c.nameLines) {
      parts.push(
        `<text x="${textX.toFixed(1)}" y="${cursorY.toFixed(1)}" fill="${escapeSvgXml(l.inkPrimary)}" font-family="${fontFamily}" font-size="${c.nameFontSize}" font-weight="700">${escapeSvgXml(line)}</text>`,
      );
      cursorY += c.nameLineHeight;
    }

    if (c.metaText) {
      cursorY += 4;
      parts.push(
        `<text x="${textX.toFixed(1)}" y="${cursorY.toFixed(1)}" fill="${escapeSvgXml(l.inkMuted)}" font-family="${fontFamily}" font-size="${c.metaFontSize}" font-weight="600">${escapeSvgXml(c.metaText)}</text>`,
      );
      cursorY += c.metaFontSize + 8;
    }

    if (c.teacherText && cursorY <= c.y + c.height - 8) {
      parts.push(
        `<text x="${textX.toFixed(1)}" y="${cursorY.toFixed(1)}" fill="${escapeSvgXml(l.inkMuted)}" font-family="${fontFamily}" font-size="${Math.max(16, c.metaFontSize - 2)}" font-weight="500">${escapeSvgXml(c.teacherText)}</text>`,
      );
    }

    parts.push("</g>");
  }

  // 页脚
  parts.push(
    `<text x="${l.card.x + 8}" y="${l.footerY}" fill="${escapeSvgXml(l.inkMuted)}" font-family="${fontFamily}" font-size="24" font-weight="600">${escapeSvgXml(l.courseCountLabel)}</text>`,
  );
  if (l.semesterRange) {
    parts.push(
      `<text x="${l.card.x + l.card.width - 8}" y="${l.footerY}" text-anchor="end" fill="${escapeSvgXml(l.inkMuted)}" font-family="${fontFamily}" font-size="24" font-weight="600">${escapeSvgXml(l.semesterRange)}</text>`,
    );
  }

  parts.push("</svg>");
  return parts.join("");
}

function captureSvgToPngBase64(
  svgInstance: SvgExportRefLike | null | undefined,
  width: number,
  height: number,
): Promise<string> {
  if (!svgInstance || typeof svgInstance.toDataURL !== "function") {
    return Promise.reject(new Error("壁纸画布尚未就绪，请稍候片刻重试"));
  }
  return new Promise<string>((resolve, reject) => {
    let settled = false;
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      reject(new Error("生成壁纸 PNG 超时，请重试或使用全屏纯净预览截屏"));
    }, TO_DATA_URL_TIMEOUT_MS);

    try {
      svgInstance.toDataURL!(
        (raw) => {
          if (settled) return;
          settled = true;
          clearTimeout(timer);
          const cleaned =
            typeof raw === "string"
              ? raw.replace(/^data:image\/png;base64,/i, "").replace(/\s+/g, "")
              : "";
          if (!cleaned) {
            reject(new Error("壁纸画布未能输出图像数据，请重试"));
            return;
          }
          resolve(cleaned);
        },
        { width, height },
      );
    } catch (error) {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      reject(
        error instanceof Error ? error : new Error("导出壁纸 PNG 失败，请重试"),
      );
    }
  });
}

function triggerWebBlobDownload(blob: Blob, fileName: string): string {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
  return url;
}

async function rasterizeSvgOnWeb(
  svgMarkup: string,
  width: number,
  height: number,
): Promise<Blob | null> {
  if (
    typeof document === "undefined" ||
    typeof Blob === "undefined" ||
    typeof URL === "undefined" ||
    typeof URL.createObjectURL !== "function" ||
    typeof Image === "undefined"
  ) {
    return null;
  }

  const svgBlob = new Blob([svgMarkup], {
    type: "image/svg+xml;charset=utf-8",
  });
  const svgUrl = URL.createObjectURL(svgBlob);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error("SVG 图像加载失败"));
      el.src = svgUrl;
    });
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    ctx.drawImage(img, 0, 0, width, height);
    return await new Promise<Blob | null>((resolve) => {
      if (typeof canvas.toBlob === "function") {
        canvas.toBlob((blob) => resolve(blob), "image/png");
      } else {
        resolve(null);
      }
    });
  } catch {
    return null;
  } finally {
    URL.revokeObjectURL(svgUrl);
  }
}

/**
 * 跨平台一键导出 / 分享高清课表壁纸 PNG：
 * - Web：将 SVG 通过 Image + Canvas 栅格化为 1080×1920 高清 PNG 下载（失败自动回退 .svg）
 * - iOS：调用 react-native-svg `toDataURL` 写入缓存 PNG 并拉起系统分享 / 存相册面板
 * - Android：调用 `toDataURL` 写入缓存 PNG，通过 contentUri 调起系统图片查看/分享/设为壁纸（或 SAF 直存本地目录）
 */
export async function exportWallpaperPng(
  options: ExportWallpaperPngOptions,
): Promise<ExportWallpaperPngResult> {
  const width = Math.max(
    540,
    Math.round(options.width ?? WALLPAPER_DEFAULT_WIDTH),
  );
  const height = Math.max(
    960,
    Math.round(options.height ?? WALLPAPER_DEFAULT_HEIGHT),
  );
  const pngFileName = options.fileName.toLowerCase().endsWith(".png")
    ? options.fileName
    : `${options.fileName.replace(/\.svg$/i, "")}.png`;
  const title = options.title || "Dark Study 课表壁纸";

  if (Platform.OS === "web") {
    const pngBlob = await rasterizeSvgOnWeb(options.svgMarkup, width, height);
    if (pngBlob) {
      const uri = triggerWebBlobDownload(pngBlob, pngFileName);
      return { uri, fileName: pngFileName, format: "png", method: "download" };
    }
    if (
      typeof Blob !== "undefined" &&
      typeof URL !== "undefined" &&
      typeof URL.createObjectURL === "function" &&
      typeof document !== "undefined"
    ) {
      const svgFileName = pngFileName.replace(/\.png$/i, ".svg");
      const svgBlob = new Blob([options.svgMarkup], {
        type: "image/svg+xml;charset=utf-8",
      });
      const uri = triggerWebBlobDownload(svgBlob, svgFileName);
      return { uri, fileName: svgFileName, format: "svg", method: "download" };
    }
    throw new Error("当前浏览器环境不支持导出壁纸文件");
  }

  const base64 = await captureSvgToPngBase64(
    options.svgRef?.current,
    width,
    height,
  );
  const { File, Paths } = await import("expo-file-system");
  const file = new File(Paths.cache, pngFileName);
  file.create({ overwrite: true });
  await file.write(base64, { encoding: "base64" });

  if (Platform.OS === "ios") {
    const res = await Share.share({ url: file.uri, title });
    return {
      uri: file.uri,
      fileName: pngFileName,
      format: "png",
      method: "share",
      canceled: res.action === Share.dismissedAction,
    };
  }

  const legacyFs = await import("expo-file-system/legacy");
  const saveViaSaf = async (): Promise<ExportWallpaperPngResult> => {
    const perm =
      await legacyFs.StorageAccessFramework.requestDirectoryPermissionsAsync();
    if (!perm.granted) {
      return {
        uri: file.uri,
        fileName: pngFileName,
        format: "png",
        method: "saf",
        canceled: true,
      };
    }
    const targetUri = await legacyFs.StorageAccessFramework.createFileAsync(
      perm.directoryUri,
      pngFileName,
      "image/png",
    );
    await legacyFs.StorageAccessFramework.writeAsStringAsync(
      targetUri,
      base64,
      { encoding: legacyFs.EncodingType.Base64 },
    );
    return {
      uri: targetUri,
      fileName: pngFileName,
      format: "png",
      method: "saf",
    };
  };

  if (options.androidAction === "save") {
    return saveViaSaf();
  }

  try {
    const contentUri = await legacyFs.getContentUriAsync(file.uri);
    const { startActivityAsync } = await import("expo-intent-launcher");
    await startActivityAsync("android.intent.action.VIEW", {
      data: contentUri,
      type: "image/png",
      flags: ANDROID_FLAG_GRANT_READ_URI_PERMISSION,
    });
    return {
      uri: contentUri,
      fileName: pngFileName,
      format: "png",
      method: "intent",
    };
  } catch {
    if (typeof file.preview === "function") {
      try {
        await file.preview({ mimeType: "image/png", title });
        return {
          uri: file.uri,
          fileName: pngFileName,
          format: "png",
          method: "intent",
        };
      } catch {
        // 回退至 SAF 选择目录保存
      }
    }
    return saveViaSaf();
  }
}
