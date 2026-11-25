import { resolveTint, type BackgroundTint } from "@/constants/backgrounds";

export type GlassVariant = "surface" | "floating" | "sheet";

export interface GlassOpticalProfile {
  /** Normalized RGB [0..1] for glass body tint */
  tintRgb: [number, number, number];
  /** Glass body wash opacity for each optical depth */
  tintAlpha: Record<GlassVariant, number>;
  /** Normalized RGB [0..1] theme accent for bevel caustics & subtle edge tone */
  accentRgb: [number, number, number];
  /** Normalized RGB [0..1] specular surface & rim reflection color */
  reflectionRgb: [number, number, number];
  /** Vibrancy saturation boost (offsets blur dulling) */
  saturation: number;
  /** Adaptive shadow/luminance lift for readability without milky fog */
  luminanceLift: number;
  /** Specular reflection intensity multiplier */
  reflectionStrength: number;
  /** Prismatic edge dispersion intensity */
  dispersion: number;
  /** Outer grounding shadow color (RGBA CSS string) */
  shadowColor: string;
  /** Modal / non-blur fallback fill color */
  fallbackFill: string;
  /** CSS rgba strings for JS/iOS/Web fallback specular gradient & sheen */
  sheenColors: readonly [string, string, string];
  rimStops: readonly [string, string, string, string];
  /** Subtle outer contrast edge for light mode fallback */
  outerHairline: string;
}

interface ThemeGlassPair {
  light: GlassOpticalProfile;
  dark: GlassOpticalProfile;
}

export const GLASS_DEPTH = {
  surface: {
    blurRadius: 15,
    fallbackBlur: 32,
    refraction: 0.92,
    rimScale: 0.92,
    reflectionScale: 0.85,
    shadowOffsetY: 4,
    shadowBlur: 16,
  },
  floating: {
    blurRadius: 19,
    fallbackBlur: 38,
    refraction: 1.32,
    rimScale: 1.12,
    reflectionScale: 1.05,
    shadowOffsetY: 8,
    shadowBlur: 24,
  },
  sheet: {
    blurRadius: 23,
    fallbackBlur: 48,
    refraction: 0.55,
    rimScale: 0.82,
    reflectionScale: 0.65,
    shadowOffsetY: 6,
    shadowBlur: 22,
  },
} as const;

const GLASS_THEMES: Record<BackgroundTint, ThemeGlassPair> = {
  sky: {
    light: {
      tintRgb: [0.96, 0.985, 1.0],
      tintAlpha: { surface: 0.16, floating: 0.14, sheet: 0.56 },
      accentRgb: [0.22, 0.74, 0.97],
      reflectionRgb: [0.94, 0.985, 1.0],
      saturation: 1.44,
      luminanceLift: 0.22,
      reflectionStrength: 0.86,
      dispersion: 0.48,
      shadowColor: "rgba(30, 82, 138, 0.13)",
      fallbackFill: "rgba(242, 249, 255, 0.84)",
      sheenColors: ["rgba(255,255,255,0.44)", "rgba(232,246,255,0.10)", "rgba(255,255,255,0.03)"],
      rimStops: ["#FFFFFF", "#D8F1FF", "#B8DCF5", "#F3FBFF"],
      outerHairline: "rgba(56, 118, 178, 0.16)",
    },
    dark: {
      tintRgb: [0.09, 0.16, 0.28],
      tintAlpha: { surface: 0.16, floating: 0.18, sheet: 0.56 },
      accentRgb: [0.28, 0.78, 0.98],
      reflectionRgb: [0.88, 0.96, 1.0],
      saturation: 1.54,
      luminanceLift: 0.18,
      reflectionStrength: 0.84,
      dispersion: 0.52,
      shadowColor: "rgba(0, 6, 20, 0.34)",
      fallbackFill: "rgba(17, 27, 46, 0.86)",
      sheenColors: ["rgba(215,240,255,0.18)", "rgba(96,165,250,0.05)", "rgba(8,14,29,0.12)"],
      rimStops: ["#F5FCFF", "#A5DCFF", "#6B9EC4", "#E6F7FF"],
      outerHairline: "rgba(255, 255, 255, 0.10)",
    },
  },
  rose: {
    light: {
      tintRgb: [1.0, 0.965, 0.98],
      tintAlpha: { surface: 0.16, floating: 0.14, sheet: 0.56 },
      accentRgb: [0.96, 0.45, 0.71],
      reflectionRgb: [1.0, 0.955, 0.975],
      saturation: 1.46,
      luminanceLift: 0.22,
      reflectionStrength: 0.88,
      dispersion: 0.50,
      shadowColor: "rgba(148, 48, 92, 0.12)",
      fallbackFill: "rgba(255, 245, 249, 0.84)",
      sheenColors: ["rgba(255,255,255,0.46)", "rgba(255,232,242,0.11)", "rgba(255,248,252,0.03)"],
      rimStops: ["#FFFFFF", "#FFDCEB", "#F5BCD5", "#FFF4F9"],
      outerHairline: "rgba(176, 74, 122, 0.15)",
    },
    dark: {
      tintRgb: [0.22, 0.10, 0.18],
      tintAlpha: { surface: 0.17, floating: 0.19, sheet: 0.56 },
      accentRgb: [0.96, 0.48, 0.72],
      reflectionRgb: [1.0, 0.91, 0.95],
      saturation: 1.56,
      luminanceLift: 0.18,
      reflectionStrength: 0.85,
      dispersion: 0.54,
      shadowColor: "rgba(20, 4, 14, 0.36)",
      fallbackFill: "rgba(34, 18, 30, 0.86)",
      sheenColors: ["rgba(255,222,238,0.18)", "rgba(244,114,182,0.05)", "rgba(20,8,16,0.12)"],
      rimStops: ["#FFF6FA", "#FFC2DF", "#B87A98", "#FFEAF4"],
      outerHairline: "rgba(255, 240, 247, 0.10)",
    },
  },
  mint: {
    light: {
      tintRgb: [0.955, 0.995, 0.98],
      tintAlpha: { surface: 0.16, floating: 0.14, sheet: 0.56 },
      accentRgb: [0.20, 0.83, 0.60],
      reflectionRgb: [0.94, 1.0, 0.98],
      saturation: 1.44,
      luminanceLift: 0.22,
      reflectionStrength: 0.86,
      dispersion: 0.46,
      shadowColor: "rgba(20, 108, 82, 0.12)",
      fallbackFill: "rgba(241, 253, 248, 0.84)",
      sheenColors: ["rgba(255,255,255,0.45)", "rgba(222,250,240,0.11)", "rgba(244,255,250,0.03)"],
      rimStops: ["#FFFFFF", "#CEF7E6", "#A7DEC8", "#EEFFF8"],
      outerHairline: "rgba(38, 128, 98, 0.15)",
    },
    dark: {
      tintRgb: [0.06, 0.18, 0.15],
      tintAlpha: { surface: 0.16, floating: 0.18, sheet: 0.56 },
      accentRgb: [0.24, 0.85, 0.64],
      reflectionRgb: [0.88, 1.0, 0.96],
      saturation: 1.54,
      luminanceLift: 0.18,
      reflectionStrength: 0.84,
      dispersion: 0.50,
      shadowColor: "rgba(2, 16, 12, 0.36)",
      fallbackFill: "rgba(12, 29, 25, 0.86)",
      sheenColors: ["rgba(210,255,240,0.18)", "rgba(52,211,153,0.05)", "rgba(5,16,13,0.12)"],
      rimStops: ["#F2FFF9", "#A6F4D8", "#65A892", "#E4FFF4"],
      outerHairline: "rgba(235, 255, 248, 0.10)",
    },
  },
  amber: {
    light: {
      tintRgb: [1.0, 0.985, 0.945],
      tintAlpha: { surface: 0.15, floating: 0.13, sheet: 0.55 },
      accentRgb: [0.98, 0.73, 0.16],
      reflectionRgb: [1.0, 0.98, 0.92],
      saturation: 1.48,
      luminanceLift: 0.20,
      reflectionStrength: 0.90,
      dispersion: 0.50,
      shadowColor: "rgba(140, 92, 18, 0.14)",
      fallbackFill: "rgba(255, 250, 238, 0.84)",
      sheenColors: ["rgba(255,255,250,0.48)", "rgba(255,240,204,0.12)", "rgba(255,250,236,0.03)"],
      rimStops: ["#FFFFFF", "#FFF0C7", "#E8CE90", "#FFF9EA"],
      outerHairline: "rgba(162, 114, 38, 0.17)",
    },
    dark: {
      tintRgb: [0.22, 0.16, 0.07],
      tintAlpha: { surface: 0.16, floating: 0.18, sheet: 0.56 },
      accentRgb: [0.99, 0.76, 0.24],
      reflectionRgb: [1.0, 0.95, 0.86],
      saturation: 1.58,
      luminanceLift: 0.20,
      reflectionStrength: 0.88,
      dispersion: 0.54,
      shadowColor: "rgba(18, 12, 2, 0.36)",
      fallbackFill: "rgba(33, 25, 13, 0.86)",
      sheenColors: ["rgba(255,244,214,0.19)", "rgba(251,191,36,0.06)", "rgba(18,12,4,0.12)"],
      rimStops: ["#FFFDF5", "#FFE29A", "#B89A5A", "#FFF5D8"],
      outerHairline: "rgba(255, 246, 224, 0.11)",
    },
  },
  violet: {
    light: {
      tintRgb: [0.975, 0.965, 1.0],
      tintAlpha: { surface: 0.16, floating: 0.14, sheet: 0.56 },
      accentRgb: [0.65, 0.54, 0.98],
      reflectionRgb: [0.97, 0.955, 1.0],
      saturation: 1.46,
      luminanceLift: 0.22,
      reflectionStrength: 0.88,
      dispersion: 0.54,
      shadowColor: "rgba(86, 58, 152, 0.13)",
      fallbackFill: "rgba(247, 243, 255, 0.84)",
      sheenColors: ["rgba(255,255,255,0.46)", "rgba(235,226,255,0.12)", "rgba(248,244,255,0.03)"],
      rimStops: ["#FFFFFF", "#E4D9FF", "#C4B4EE", "#F6F1FF"],
      outerHairline: "rgba(108, 82, 174, 0.16)",
    },
    dark: {
      tintRgb: [0.15, 0.11, 0.26],
      tintAlpha: { surface: 0.17, floating: 0.19, sheet: 0.56 },
      accentRgb: [0.68, 0.58, 0.99],
      reflectionRgb: [0.94, 0.91, 1.0],
      saturation: 1.56,
      luminanceLift: 0.18,
      reflectionStrength: 0.85,
      dispersion: 0.56,
      shadowColor: "rgba(12, 6, 26, 0.36)",
      fallbackFill: "rgba(24, 18, 40, 0.86)",
      sheenColors: ["rgba(232,222,255,0.18)", "rgba(167,139,250,0.06)", "rgba(12,8,24,0.12)"],
      rimStops: ["#FBF8FF", "#D3C4FF", "#8C7AB8", "#F1EBFF"],
      outerHairline: "rgba(242, 236, 255, 0.10)",
    },
  },
  noir: {
    light: {
      tintRgb: [0.975, 0.98, 0.99],
      tintAlpha: { surface: 0.15, floating: 0.13, sheet: 0.58 },
      accentRgb: [0.56, 0.64, 0.74],
      reflectionRgb: [0.99, 0.995, 1.0],
      saturation: 1.24,
      luminanceLift: 0.20,
      reflectionStrength: 0.90,
      dispersion: 0.32,
      shadowColor: "rgba(30, 41, 59, 0.14)",
      fallbackFill: "rgba(246, 248, 251, 0.85)",
      sheenColors: ["rgba(255,255,255,0.48)", "rgba(226,232,240,0.11)", "rgba(248,250,252,0.03)"],
      rimStops: ["#FFFFFF", "#E2E8F0", "#CBD5E1", "#F8FAFC"],
      outerHairline: "rgba(71, 85, 105, 0.17)",
    },
    dark: {
      tintRgb: [0.11, 0.13, 0.17],
      tintAlpha: { surface: 0.18, floating: 0.20, sheet: 0.58 },
      accentRgb: [0.64, 0.72, 0.82],
      reflectionRgb: [0.95, 0.97, 1.0],
      saturation: 1.32,
      luminanceLift: 0.16,
      reflectionStrength: 0.86,
      dispersion: 0.36,
      shadowColor: "rgba(0, 0, 0, 0.40)",
      fallbackFill: "rgba(20, 23, 29, 0.88)",
      sheenColors: ["rgba(241,245,249,0.17)", "rgba(148,163,184,0.05)", "rgba(8,10,14,0.14)"],
      rimStops: ["#FFFFFF", "#CBD5E1", "#788799", "#F1F5F9"],
      outerHairline: "rgba(255, 255, 255, 0.11)",
    },
  },
};

/**
 * Resolves the optical glass profile for the active theme, appearance mode,
 * and whether a custom wallpaper image is active behind the glass.
 */
export function resolveGlassOpticalProfile(
  themeTint: unknown,
  isDark: boolean,
  hasWallpaper: boolean,
): GlassOpticalProfile {
  const key = resolveTint(themeTint);
  const base = isDark ? GLASS_THEMES[key].dark : GLASS_THEMES[key].light;
  if (!hasWallpaper) {
    return base;
  }
  // Custom wallpaper: slightly more neutral glass body + stronger vibrancy & clearer transmission
  // so the user's wallpaper colors shine cleanly like HyperOS Home / Control Center.
  return {
    ...base,
    tintAlpha: {
      surface: Math.max(0.08, base.tintAlpha.surface - 0.04),
      floating: Math.max(0.08, base.tintAlpha.floating - 0.03),
      sheet: Math.max(0.46, base.tintAlpha.sheet - 0.06),
    },
    saturation: Math.min(1.62, base.saturation + 0.08),
    luminanceLift: isDark ? base.luminanceLift : Math.min(0.32, base.luminanceLift + 0.06),
    reflectionStrength: Math.min(1.05, base.reflectionStrength + 0.06),
  };
}
