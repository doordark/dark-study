import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { LinearGradient } from "expo-linear-gradient";
import { useColorScheme } from "nativewind";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  AppState,
  Platform,
  Pressable,
  ScrollView,
  Text,
  View,
} from "react-native";

import { GlassContainer } from "@/components/GlassContainer";
import { coursePalette } from "@/constants/palette";
import { WIDGET_ACCENTS, widgetAccent } from "@/constants/widgetPalette";
import { useForegroundClock } from "@/hooks/useForegroundClock";
import {
  courseWidgetsAvailable,
  getCourseWidgetStatus,
  openWidgetPermissions,
  pinCourseWidget,
  syncCourseWidgets,
  type WidgetStatus,
} from "@/services/courseWidget";
import { useActiveSchedule } from "@/store/useStore";
import { useWidgetSettings } from "@/store/useWidgetSettings";
import {
  todayWidgetCourses,
  upcomingWidgetCourses,
  WIDGET_DISPLAY_MODES,
  WIDGET_SHAPES,
  WIDGET_SURFACE_STYLES,
  widgetAccentColors,
  widgetDayLabel,
  widgetMeta,
  type WidgetCourse,
  type WidgetDisplayMode,
  type WidgetShape,
  type WidgetSurfaceStyle,
} from "@/utils/courseWidget";

const THEME_OPTIONS = [
  { key: "system", label: "跟随系统", icon: "phone-portrait-outline" as const },
  { key: "dark", label: "深色", icon: "moon-outline" as const },
  { key: "light", label: "浅色", icon: "sunny-outline" as const },
] as const;

type PreviewLens = "live" | "demo" | "empty";

const LIGHT_BADGE_TEXT: Record<string, string> = {
  sky: "#0284C7",
  violet: "#7C3AED",
  emerald: "#059669",
  amber: "#B45309",
  rose: "#E11D48",
  cyan: "#0891B2",
};

function hapticTap() {
  if (Platform.OS === "web") return;
  void Haptics.selectionAsync().catch(() => {});
}

function buildDemoCourses(now: Date): WidgetCourse[] {
  const base = now.getTime();
  return [
    {
      id: "demo-1",
      name: "高等数学 (上)",
      classroom: "教三-201",
      teacher: "林教授",
      start: base - 18 * 60_000,
      end: base + 42 * 60_000,
      time: "08:00–09:45",
      color: "sky",
    },
    {
      id: "demo-2",
      name: "数据结构与算法",
      classroom: "信息楼 B305",
      teacher: "陈老师",
      start: base + 90 * 60_000,
      end: base + 195 * 60_000,
      time: "10:05–11:50",
      color: "violet",
    },
    {
      id: "demo-3",
      name: "大学物理实验",
      classroom: "实验楼 A402",
      teacher: "周老师",
      start: base + 270 * 60_000,
      end: base + 375 * 60_000,
      time: "14:00–15:45",
      color: "emerald",
    },
    {
      id: "demo-4",
      name: "计算机组成原理",
      classroom: "教一-108",
      teacher: "王教授",
      start: base + 24 * 60 * 60_000,
      end: base + 25.75 * 60 * 60_000,
      time: "08:00–09:45",
      color: "amber",
    },
  ];
}

function ShapeMiniDiagram({
  shapeKey,
  active,
  accentHex,
  uiDark,
}: {
  shapeKey: WidgetShape;
  active: boolean;
  accentHex: string;
  uiDark: boolean;
}) {
  const frameBg = active
    ? uiDark
      ? "rgba(56,189,248,0.16)"
      : "rgba(14,165,233,0.11)"
    : uiDark
      ? "rgba(255,255,255,0.06)"
      : "rgba(15,23,42,0.05)";
  const frameBorder = active
    ? accentHex
    : uiDark
      ? "rgba(148,163,184,0.3)"
      : "rgba(100,116,139,0.28)";
  const pillMuted = uiDark ? "rgba(226,232,240,0.24)" : "rgba(71,85,105,0.22)";
  const width = shapeKey === "square" ? 30 : 48;
  const height = shapeKey === "rectangle" ? 24 : 30;
  const bars = shapeKey === "large" ? 3 : 2;

  return (
    <View
      style={{
        width,
        height,
        borderRadius: 7,
        borderWidth: 1.5,
        borderColor: frameBorder,
        backgroundColor: frameBg,
        padding: 3.5,
        justifyContent: "space-between",
      }}
    >
      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
        <View
          style={{
            width: shapeKey === "square" ? 11 : 18,
            height: 2.5,
            borderRadius: 2,
            backgroundColor: active ? accentHex : pillMuted,
          }}
        />
        <View
          style={{
            width: 5,
            height: 2.5,
            borderRadius: 2,
            backgroundColor: pillMuted,
          }}
        />
      </View>
      <View style={{ gap: 2.2 }}>
        {Array.from({ length: bars }).map((_, idx) => (
          <View
            key={idx}
            style={{
              height: shapeKey === "large" ? 4.2 : 5,
              borderRadius: 2.5,
              backgroundColor:
                idx === 0
                  ? active
                    ? `${accentHex}55`
                    : pillMuted
                  : uiDark
                    ? "rgba(255,255,255,0.10)"
                    : "rgba(15,23,42,0.08)",
              flexDirection: "row",
              alignItems: "center",
              paddingHorizontal: 2,
            }}
          >
            <View
              style={{
                width: 2,
                height: "65%",
                borderRadius: 1,
                backgroundColor: idx === 0 ? accentHex : pillMuted,
              }}
            />
          </View>
        ))}
      </View>
    </View>
  );
}

export function CourseWidgetSettings() {
  const { colorScheme } = useColorScheme();
  const systemDark = colorScheme !== "light";
  const schedule = useActiveSchedule();
  const shape = useWidgetSettings((s) => s.shape);
  const theme = useWidgetSettings((s) => s.theme);
  const accent = useWidgetSettings((s) => s.accent);
  const style = useWidgetSettings((s) => s.style ?? "frosted");
  const mode = useWidgetSettings((s) => s.mode ?? "upcoming");
  const count = useWidgetSettings((s) => s.count);
  const setShape = useWidgetSettings((s) => s.setShape);
  const setTheme = useWidgetSettings((s) => s.setTheme);
  const setAccent = useWidgetSettings((s) => s.setAccent);
  const setStyle = useWidgetSettings((s) => s.setStyle);
  const setMode = useWidgetSettings((s) => s.setMode);
  const setCount = useWidgetSettings((s) => s.setCount);

  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<WidgetStatus | null>(null);
  const [message, setMessage] = useState<{ tone: "info" | "success" | "warn"; text: string } | null>(null);
  const [guideOpen, setGuideOpen] = useState(false);
  const [previewLens, setPreviewLens] = useState<PreviewLens>("live");
  const mountedRef = useRef(true);
  const pollTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const refreshStatus = useCallback(async () => {
    try {
      const value = await getCourseWidgetStatus();
      if (mountedRef.current) setStatus(value);
      return value;
    } catch {
      return null;
    }
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    const run = () => {
      void getCourseWidgetStatus()
        .then((value) => {
          if (mountedRef.current) setStatus(value);
        })
        .catch(() => {});
    };
    run();
    const sub = AppState.addEventListener("change", (state) => {
      if (state === "active") run();
    });
    return () => {
      mountedRef.current = false;
      if (pollTimerRef.current) {
        clearTimeout(pollTimerRef.current);
        pollTimerRef.current = null;
      }
      sub.remove();
    };
  }, []);

  const syncExtraNow = useCallback(
    (nextStyle: WidgetSurfaceStyle, nextMode: WidgetDisplayMode) => {
      void syncCourseWidgets(schedule, count, theme, accent, {
        style: nextStyle,
        mode: nextMode,
      }).catch(() => {});
    },
    [schedule, count, theme, accent],
  );

  const now = useForegroundClock();
  const selectedShape = WIDGET_SHAPES.find((s) => s.key === shape) ?? WIDGET_SHAPES[1];
  const selectedStyleMeta =
    WIDGET_SURFACE_STYLES.find((s) => s.key === style) ?? WIDGET_SURFACE_STYLES[0];
  const selectedAccentMeta = widgetAccent(accent);
  const widgetDark = theme === "dark" || (theme === "system" && systemDark);
  const colors = widgetAccentColors(accent, theme, systemDark, style);

  const upcoming = useMemo(() => upcomingWidgetCourses(schedule, now), [schedule, now]);
  const todayList = useMemo(() => todayWidgetCourses(upcoming, now), [upcoming, now]);
  const demoList = useMemo(() => buildDemoCourses(now), [now]);

  const effectivePreviewCourses = useMemo(() => {
    if (previewLens === "empty") return [];
    if (previewLens === "demo") return demoList.slice(0, Math.min(count, selectedShape.capacity));
    const source = mode === "today" ? todayList : upcoming;
    return source.slice(0, Math.min(count, selectedShape.capacity));
  }, [previewLens, demoList, mode, todayList, upcoming, count, selectedShape.capacity]);

  const compactCard = shape === "square";
  const fullMeta = useMemo(() => widgetMeta(schedule, now, false), [schedule, now]);
  const compactMeta = useMemo(() => widgetMeta(schedule, now, true), [schedule, now]);
  const metaParts = useMemo(() => {
    const raw = compactCard ? compactMeta : fullMeta;
    const pieces = raw.split(" ");
    const weekday = pieces.pop() ?? "";
    return { left: pieces.join(" "), weekday };
  }, [compactCard, compactMeta, fullMeta]);

  const nextHint = useMemo(() => {
    if (previewLens === "empty") {
      return "下节 · 明天 08:00 高等数学 (上)";
    }
    if (mode === "today" && upcoming.length > 0) {
      const next = upcoming[0];
      const startClock = next.time.split("–")[0] ?? next.time;
      return `下节 · ${widgetDayLabel(next.start, now)} ${startClock} ${next.name}`;
    }
    return null;
  }, [previewLens, mode, upcoming, now]);

  const timeString = useMemo(() => {
    const hh = String(now.getHours()).padStart(2, "0");
    const mm = String(now.getMinutes()).padStart(2, "0");
    return `${hh}:${mm}`;
  }, [now]);

  const handleOpenPermissions = () => {
    hapticTap();
    void openWidgetPermissions().catch(() =>
      Alert.alert("无法打开", "请从系统设置 → 应用管理 → Dark Study 手动打开权限设置。"),
    );
  };

  const handleAdd = async () => {
    hapticTap();
    setBusy(true);
    setMessage({ tone: "info", text: "正在同步课表并唤起系统添加弹窗…" });
    try {
      const before = await refreshStatus();
      if (before && before.registered !== 3) {
        setMessage({
          tone: "warn",
          text: `系统当前仅识别 ${before.registered}/3 种组件，请安装最新完整 APK 后重试。`,
        });
        setGuideOpen(true);
        return;
      }
      await syncCourseWidgets(schedule, count, theme, accent, { style, mode });
      const pinned = await pinCourseWidget(shape);
      if (!pinned) {
        setMessage({
          tone: "warn",
          text: "当前桌面未响应应用内一键添加，请展开下方指引在桌面「安卓小部件」中添加。",
        });
        setGuideOpen(true);
        return;
      }
      if (!mountedRef.current) return;
      setMessage({ tone: "info", text: "已向桌面发起添加请求，请在系统弹窗中确认…" });
      if (before) {
        for (let i = 0; i < 6; i++) {
          if (!mountedRef.current) return;
          await new Promise<void>((resolve) => {
            pollTimerRef.current = setTimeout(() => {
              pollTimerRef.current = null;
              resolve();
            }, 900);
          });
          if (!mountedRef.current) return;
          const after = await refreshStatus();
          if (!mountedRef.current) return;
          if (after && after.installed > before.installed) {
            setMessage({
              tone: "success",
              text: `已成功添加「${selectedShape.label}」，返回桌面即可查看！`,
            });
            return;
          }
        }
      }
      if (!mountedRef.current) return;
      setMessage({
        tone: "info",
        text: "若未弹出系统确认框，可在下方指引中打开「桌面快捷方式」权限，或直接长按桌面添加。",
      });
    } catch (error) {
      if (!mountedRef.current) return;
      setMessage({
        tone: "warn",
        text: `添加未完成：${error instanceof Error ? error.message : "请检查系统权限后重试"}`,
      });
      setGuideOpen(true);
    } finally {
      if (mountedRef.current) setBusy(false);
    }
  };

  const statusBadge = useMemo(() => {
    if (Platform.OS !== "android") {
      return { text: "仅限预览", bg: "rgba(148,163,184,0.16)", dot: "#94A3B8", ink: systemDark ? "#CBD5E1" : "#475569" };
    }
    if (!courseWidgetsAvailable) {
      return { text: "需安装 APK", bg: "rgba(245,158,11,0.16)", dot: "#F59E0B", ink: systemDark ? "#FCD34D" : "#B45309" };
    }
    if (!status) {
      return { text: "检测中", bg: "rgba(148,163,184,0.16)", dot: "#94A3B8", ink: systemDark ? "#CBD5E1" : "#475569" };
    }
    if (status.registered < 3) {
      return {
        text: `已识别 ${status.registered}/3`,
        bg: "rgba(245,158,11,0.16)",
        dot: "#F59E0B",
        ink: systemDark ? "#FCD34D" : "#B45309",
      };
    }
    if (status.installed > 0) {
      return {
        text: `桌面已放 ${status.installed} 个`,
        bg: "rgba(16,185,129,0.16)",
        dot: "#10B981",
        ink: systemDark ? "#6EE7B7" : "#047857",
      };
    }
    return {
      text: "3 款组件就绪",
      bg: "rgba(56,189,248,0.16)",
      dot: "#38BDF8",
      ink: systemDark ? "#7DD3FC" : "#0369A1",
    };
  }, [status, systemDark]);

  const stageGradient: readonly [string, string, string] = widgetDark
    ? ["#0D1829", "#182843", "#121C30"]
    : ["#9FB9C9", "#B9C6B8", "#9DB0BD"];

  const segBg = systemDark ? "rgba(255,255,255,0.06)" : "rgba(15,23,42,0.055)";
  const segActiveBg = systemDark ? "rgba(56,189,248,0.22)" : "#FFFFFF";
  const segActiveBorder = systemDark ? "rgba(125,211,252,0.45)" : "rgba(14,165,233,0.32)";

  return (
    <View style={{ marginBottom: 16 }}>
      <GlassContainer radius={26} intensity={42} borderOpacity={0.22}>
        <View className="px-4 py-4">
          {/* 顶部标题 + 状态胶囊 */}
          <View className="flex-row items-center justify-between gap-2">
            <View className="flex-1 flex-row items-center gap-2.5">
              <View
                style={{
                  width: 34,
                  height: 34,
                  borderRadius: 11,
                  alignItems: "center",
                  justifyContent: "center",
                  backgroundColor: `${selectedAccentMeta.color}22`,
                  borderWidth: 1,
                  borderColor: `${selectedAccentMeta.color}44`,
                }}
              >
                <Ionicons
                  name="grid-outline"
                  size={17}
                  color={systemDark ? selectedAccentMeta.brandDark : selectedAccentMeta.brandLight}
                />
              </View>
              <View className="flex-1">
                <Text className="text-[15px] font-bold text-slate-800 dark:text-white">
                  桌面课表小组件
                </Text>
                <Text className="mt-0.5 text-[11px] text-slate-500 dark:text-slate-400">
                  适配澎湃 OS 桌面与负一屏 · 自动随调课更新
                </Text>
              </View>
            </View>

            <Pressable
              onPress={() => {
                hapticTap();
                void refreshStatus();
              }}
              accessibilityRole="button"
              accessibilityLabel="刷新小组件状态"
              style={{
                flexDirection: "row",
                alignItems: "center",
                gap: 5,
                paddingHorizontal: 9,
                paddingVertical: 5,
                borderRadius: 999,
                backgroundColor: statusBadge.bg,
              }}
            >
              <View
                style={{
                  width: 6,
                  height: 6,
                  borderRadius: 3,
                  backgroundColor: statusBadge.dot,
                }}
              />
              <Text style={{ fontSize: 10.5, fontWeight: "700", color: statusBadge.ink }}>
                {statusBadge.text}
              </Text>
            </Pressable>
          </View>

          {/* 顶部实时预览舞台（模拟真实澎湃 OS 桌面/负一屏壁纸光影） */}
          <View
            style={{
              marginTop: 14,
              borderRadius: 22,
              overflow: "hidden",
              borderWidth: 1,
              borderColor: systemDark ? "rgba(255,255,255,0.10)" : "rgba(15,23,42,0.08)",
            }}
          >
            <LinearGradient
              colors={stageGradient}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={{ paddingHorizontal: 14, paddingTop: 10, paddingBottom: 12 }}
            >
              {/* 柔和背景光斑，还原负一屏/桌面高斯模糊壁纸氛围 */}
              <View
                pointerEvents="none"
                style={{
                  position: "absolute",
                  top: -28,
                  right: -20,
                  width: 120,
                  height: 120,
                  borderRadius: 60,
                  backgroundColor: `${selectedAccentMeta.color}30`,
                }}
              />
              <View
                pointerEvents="none"
                style={{
                  position: "absolute",
                  bottom: -36,
                  left: -18,
                  width: 110,
                  height: 110,
                  borderRadius: 55,
                  backgroundColor: widgetDark ? "rgba(129,140,248,0.20)" : "rgba(251,191,36,0.22)",
                }}
              />

              {/* 模拟顶部迷你状态栏 + 预览镜头切换 */}
              <View className="mb-3 flex-row items-center justify-between">
                <View className="flex-row items-center gap-1.5">
                  <Text
                    style={{
                      fontSize: 10.5,
                      fontWeight: "700",
                      color: "rgba(255,255,255,0.88)",
                      letterSpacing: 0.3,
                    }}
                  >
                    {timeString}
                  </Text>
                  <Text
                    style={{
                      fontSize: 9.5,
                      color: "rgba(255,255,255,0.68)",
                    }}
                  >
                    · {selectedShape.size} {selectedStyleMeta.label}
                  </Text>
                </View>

                <View
                  style={{
                    flexDirection: "row",
                    backgroundColor: "rgba(15,23,42,0.26)",
                    borderRadius: 999,
                    padding: 2,
                    gap: 2,
                  }}
                >
                  {(
                    [
                      { key: "live", label: "实时" },
                      { key: "demo", label: "样例" },
                      { key: "empty", label: "无课" },
                    ] as const
                  ).map((lens) => {
                    const active = previewLens === lens.key;
                    return (
                      <Pressable
                        key={lens.key}
                        onPress={() => {
                          hapticTap();
                          setPreviewLens(lens.key);
                        }}
                        style={{
                          paddingHorizontal: 8,
                          paddingVertical: 3,
                          borderRadius: 999,
                          backgroundColor: active ? "rgba(255,255,255,0.92)" : "transparent",
                        }}
                      >
                        <Text
                          style={{
                            fontSize: 9.5,
                            fontWeight: "700",
                            color: active ? "#0F172A" : "rgba(255,255,255,0.82)",
                          }}
                        >
                          {lens.label}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
              </View>

              {/* 真实比例卡片预览 */}
              <View
                style={{
                  width: shape === "square" ? 172 : "100%",
                  minHeight: shape === "large" ? 248 : 148,
                  alignSelf: "center",
                  borderRadius: 24,
                  overflow: "hidden",
                  borderWidth: 1,
                  borderColor: colors.border,
                  shadowColor: "#000000",
                  shadowOpacity: widgetDark ? 0.36 : 0.14,
                  shadowRadius: 14,
                  shadowOffset: { width: 0, height: 6 },
                }}
              >
                <LinearGradient
                  colors={[colors.background, colors.backgroundEnd]}
                  start={{ x: 0.5, y: 0 }}
                  end={{ x: 0.5, y: 1 }}
                  style={{
                    flex: 1,
                    paddingHorizontal: compactCard ? 12 : 15,
                    paddingVertical: compactCard ? 11 : 12,
                  }}
                >
                  {/* 单行清爽顶栏（与澎湃 OS 负一屏卡片同级排版） */}
                  <View
                    style={{
                      flexDirection: "row",
                      alignItems: "center",
                      marginBottom: 8,
                    }}
                  >
                    <Text
                      numberOfLines={1}
                      style={{
                        flex: 1,
                        color: colors.ink,
                        fontSize: compactCard ? 12 : 13.5,
                        fontWeight: "700",
                      }}
                    >
                      {schedule?.name?.trim() || "我的课表"}
                    </Text>
                    {!!metaParts.left ? (
                      <Text
                        numberOfLines={1}
                        style={{
                          marginLeft: 6,
                          color: colors.muted,
                          fontSize: compactCard ? 10 : 11,
                          fontWeight: "500",
                        }}
                      >
                        {metaParts.left}
                      </Text>
                    ) : null}
                    <Text
                      numberOfLines={1}
                      style={{
                        marginLeft: 4,
                        color: colors.weekdayHighlight,
                        fontSize: compactCard ? 10.5 : 11,
                        fontWeight: "700",
                      }}
                    >
                      {metaParts.weekday}
                    </Text>
                    <Text
                      style={{
                        marginLeft: 5,
                        color: colors.brand,
                        fontSize: 11.5,
                        fontWeight: "700",
                      }}
                    >
                      ↻
                    </Text>
                  </View>

                  {/* 课程列表 / 可爱空态 */}
                  {effectivePreviewCourses.length > 0 ? (
                    <View style={{ flex: 1, gap: 6, justifyContent: "center" }}>
                      {effectivePreviewCourses.map((course, idx) => {
                        const solid = (coursePalette[course.color] ?? coursePalette.sky).solid;
                        const ongoing = course.start <= now.getTime();
                        const isToday = widgetDayLabel(course.start, now) === "今天";
                        const highlightRow = idx === 0 && (ongoing || isToday);
                        const badgeText = ongoing
                          ? "上课中"
                          : idx === 0 && isToday
                            ? "下节课"
                            : widgetDayLabel(course.start, now);
                        const readableBadgeInk = widgetDark
                          ? solid
                          : (LIGHT_BADGE_TEXT[course.color] ?? solid);

                        return (
                          <View
                            key={course.id}
                            style={{
                              flexDirection: "row",
                              alignItems: "center",
                              borderRadius: 14,
                              paddingHorizontal: compactCard ? 7 : 9,
                              paddingVertical: compactCard ? 6 : 7,
                              backgroundColor: highlightRow
                                ? `${solid}${widgetDark ? "36" : "2B"}`
                                : `${solid}${widgetDark ? "22" : "1A"}`,
                              borderWidth: 1,
                              borderColor: highlightRow
                                ? `${solid}${widgetDark ? "88" : "73"}`
                                : `${solid}${widgetDark ? "38" : "30"}`,
                            }}
                          >
                            <View
                              style={{
                                width: compactCard ? 3 : 3.5,
                                alignSelf: "stretch",
                                marginVertical: 2,
                                borderRadius: 4,
                                backgroundColor: solid,
                              }}
                            />
                            <View style={{ flex: 1, paddingLeft: compactCard ? 6 : 8 }}>
                              <View style={{ flexDirection: "row", alignItems: "center" }}>
                                <Text
                                  numberOfLines={1}
                                  style={{
                                    flex: 1,
                                    color: colors.ink,
                                    fontSize: compactCard ? 11.5 : 12.5,
                                    fontWeight: "700",
                                  }}
                                >
                                  {course.name}
                                </Text>
                                {!compactCard ? (
                                  <View
                                    style={{
                                      marginLeft: 6,
                                      paddingHorizontal: 6,
                                      paddingVertical: 2,
                                      borderRadius: 8,
                                      backgroundColor: ongoing
                                        ? solid
                                        : `${solid}${widgetDark ? "30" : "24"}`,
                                    }}
                                  >
                                    <Text
                                      style={{
                                        fontSize: 9,
                                        fontWeight: "700",
                                        color: ongoing ? "#FFFFFF" : readableBadgeInk,
                                      }}
                                    >
                                      {badgeText}
                                    </Text>
                                  </View>
                                ) : null}
                              </View>

                              {compactCard ? (
                                <Text
                                  numberOfLines={1}
                                  style={{
                                    marginTop: 2.5,
                                    fontSize: 9.5,
                                    color: ongoing ? readableBadgeInk : colors.muted,
                                    fontWeight: ongoing ? "700" : "500",
                                  }}
                                >
                                  {ongoing
                                    ? `上课中 · ${course.classroom || "教室待定"}`
                                    : isToday
                                      ? `${course.time.split("–")[0] ?? course.time} · ${course.classroom || "教室待定"}`
                                      : `${badgeText} ${course.time.split("–")[0] ?? course.time}`}
                                </Text>
                              ) : (
                                <View
                                  style={{
                                    flexDirection: "row",
                                    alignItems: "center",
                                    marginTop: 3,
                                  }}
                                >
                                  <Text style={{ fontSize: 10, color: colors.muted }}>
                                    {course.time}
                                  </Text>
                                  <Text
                                    style={{
                                      marginHorizontal: 5,
                                      fontSize: 10,
                                      fontWeight: "700",
                                      color: solid,
                                    }}
                                  >
                                    ·
                                  </Text>
                                  <Text
                                    numberOfLines={1}
                                    style={{ flex: 1, fontSize: 10, color: colors.muted }}
                                  >
                                    {course.classroom || "教室待定"}
                                  </Text>
                                </View>
                              )}
                            </View>
                          </View>
                        );
                      })}
                    </View>
                  ) : (
                    <View
                      style={{
                        flex: 1,
                        alignItems: "center",
                        justifyContent: "center",
                        paddingVertical: 10,
                      }}
                    >
                      <Text
                        style={{
                          fontSize: compactCard ? 14 : 16.5,
                          color: colors.emptyKaomoji,
                          letterSpacing: 0.5,
                        }}
                      >
                        {previewLens === "live" && schedule.courses.length === 0
                          ? "(っ˘ω˘ς)"
                          : "(〃'▽'〃)"}
                      </Text>
                      <Text
                        style={{
                          marginTop: 6,
                          fontSize: 12,
                          fontWeight: "500",
                          color: colors.muted,
                          textAlign: "center",
                        }}
                      >
                        {previewLens === "live" && schedule.courses.length === 0
                          ? "还没有课程 · 先导入课表吧"
                          : "今天没有课啦"}
                      </Text>
                      {nextHint && !compactCard ? (
                        <View
                          style={{
                            marginTop: 7,
                            paddingHorizontal: 9,
                            paddingVertical: 3,
                            borderRadius: 10,
                            backgroundColor: widgetDark
                              ? "rgba(255,255,255,0.10)"
                              : "rgba(15,23,42,0.06)",
                          }}
                        >
                          <Text
                            numberOfLines={1}
                            style={{ fontSize: 10, color: colors.muted }}
                          >
                            {nextHint}
                          </Text>
                        </View>
                      ) : null}
                    </View>
                  )}
                </LinearGradient>
              </View>
            </LinearGradient>
          </View>

          {/* 尺寸选择（带缩略布局示意） */}
          <View className="mt-4">
            <View className="flex-row items-center justify-between">
              <Text className="text-[12px] font-semibold text-slate-700 dark:text-slate-200">
                卡片尺寸
              </Text>
              <Text className="text-[10.5px] text-slate-400 dark:text-slate-500">
                {selectedShape.desc}
              </Text>
            </View>
            <View className="mt-2 flex-row gap-2">
              {WIDGET_SHAPES.map((item) => {
                const active = shape === item.key;
                return (
                  <Pressable
                    key={item.key}
                    onPress={() => {
                      hapticTap();
                      setShape(item.key);
                    }}
                    accessibilityRole="radio"
                    accessibilityState={{ selected: active }}
                    style={{
                      flex: 1,
                      alignItems: "center",
                      borderRadius: 16,
                      paddingVertical: 10,
                      paddingHorizontal: 6,
                      borderWidth: 1.2,
                      borderColor: active
                        ? segActiveBorder
                        : systemDark
                          ? "rgba(255,255,255,0.06)"
                          : "rgba(15,23,42,0.06)",
                      backgroundColor: active ? segActiveBg : segBg,
                    }}
                  >
                    <ShapeMiniDiagram
                      shapeKey={item.key}
                      active={active}
                      accentHex={systemDark ? selectedAccentMeta.brandDark : selectedAccentMeta.brandLight}
                      uiDark={systemDark}
                    />
                    <Text
                      className={`mt-2 text-[12px] font-bold ${
                        active
                          ? "text-sky-700 dark:text-sky-200"
                          : "text-slate-700 dark:text-slate-200"
                      }`}
                    >
                      {item.label}
                    </Text>
                    <Text className="mt-0.5 text-[10px] text-slate-500 dark:text-slate-400">
                      {item.size}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </View>

          {/* 外观材质（清透玻璃 / 澎湃瓷卡 / 主题彩卡） */}
          <View className="mt-4">
            <View className="flex-row items-center justify-between">
              <Text className="text-[12px] font-semibold text-slate-700 dark:text-slate-200">
                卡片质感
              </Text>
              <Text className="text-[10.5px] text-slate-400 dark:text-slate-500">
                {selectedStyleMeta.desc}
              </Text>
            </View>
            <View
              style={{
                marginTop: 8,
                flexDirection: "row",
                padding: 3,
                borderRadius: 14,
                backgroundColor: segBg,
                gap: 3,
              }}
            >
              {WIDGET_SURFACE_STYLES.map((opt) => {
                const active = style === opt.key;
                return (
                  <Pressable
                    key={opt.key}
                    onPress={() => {
                      hapticTap();
                      setStyle(opt.key);
                      syncExtraNow(opt.key, mode);
                    }}
                    accessibilityRole="radio"
                    accessibilityState={{ selected: active }}
                    style={{
                      flex: 1,
                      alignItems: "center",
                      paddingVertical: 7.5,
                      borderRadius: 11,
                      backgroundColor: active ? segActiveBg : "transparent",
                      borderWidth: active ? 1 : 0,
                      borderColor: segActiveBorder,
                    }}
                  >
                    <Text
                      className={`text-[12px] font-semibold ${
                        active
                          ? "text-sky-700 dark:text-sky-200"
                          : "text-slate-600 dark:text-slate-300"
                      }`}
                    >
                      {opt.label}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </View>

          {/* 深浅外观 + 展示策略 */}
          <View className="mt-4 flex-row gap-2.5">
            <View style={{ flex: 1.25 }}>
              <Text className="text-[12px] font-semibold text-slate-700 dark:text-slate-200">
                深浅外观
              </Text>
              <View
                style={{
                  marginTop: 8,
                  flexDirection: "row",
                  padding: 3,
                  borderRadius: 14,
                  backgroundColor: segBg,
                  gap: 2,
                }}
              >
                {THEME_OPTIONS.map((opt) => {
                  const active = theme === opt.key;
                  return (
                    <Pressable
                      key={opt.key}
                      onPress={() => {
                        hapticTap();
                        setTheme(opt.key);
                      }}
                      accessibilityRole="radio"
                      accessibilityState={{ selected: active }}
                      style={{
                        flex: 1,
                        flexDirection: "row",
                        alignItems: "center",
                        justifyContent: "center",
                        gap: 3,
                        paddingVertical: 7,
                        borderRadius: 11,
                        backgroundColor: active ? segActiveBg : "transparent",
                        borderWidth: active ? 1 : 0,
                        borderColor: segActiveBorder,
                      }}
                    >
                      <Ionicons
                        name={opt.icon}
                        size={12}
                        color={
                          active
                            ? systemDark
                              ? "#BAE6FD"
                              : "#0369A1"
                            : systemDark
                              ? "#94A3B8"
                              : "#64748B"
                        }
                      />
                      <Text
                        className={`text-[11px] font-semibold ${
                          active
                            ? "text-sky-700 dark:text-sky-200"
                            : "text-slate-600 dark:text-slate-300"
                        }`}
                      >
                        {opt.key === "system" ? "自动" : opt.label}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            </View>

            <View style={{ flex: 1 }}>
              <Text className="text-[12px] font-semibold text-slate-700 dark:text-slate-200">
                课程范围
              </Text>
              <View
                style={{
                  marginTop: 8,
                  flexDirection: "row",
                  padding: 3,
                  borderRadius: 14,
                  backgroundColor: segBg,
                  gap: 2,
                }}
              >
                {WIDGET_DISPLAY_MODES.map((opt) => {
                  const active = mode === opt.key;
                  return (
                    <Pressable
                      key={opt.key}
                      onPress={() => {
                        hapticTap();
                        setMode(opt.key);
                        syncExtraNow(style, opt.key);
                      }}
                      accessibilityRole="radio"
                      accessibilityState={{ selected: active }}
                      style={{
                        flex: 1,
                        alignItems: "center",
                        justifyContent: "center",
                        paddingVertical: 7,
                        borderRadius: 11,
                        backgroundColor: active ? segActiveBg : "transparent",
                        borderWidth: active ? 1 : 0,
                        borderColor: segActiveBorder,
                      }}
                    >
                      <Text
                        className={`text-[11px] font-semibold ${
                          active
                            ? "text-sky-700 dark:text-sky-200"
                            : "text-slate-600 dark:text-slate-300"
                        }`}
                      >
                        {opt.label}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            </View>
          </View>

          {/* 主题色板（精致圆形玻璃珠横向滚动条） */}
          <View className="mt-4">
            <View className="flex-row items-center justify-between">
              <Text className="text-[12px] font-semibold text-slate-700 dark:text-slate-200">
                主题色调
              </Text>
              <View
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  gap: 5,
                  paddingHorizontal: 8,
                  paddingVertical: 2.5,
                  borderRadius: 999,
                  backgroundColor: `${selectedAccentMeta.color}20`,
                }}
              >
                <View
                  style={{
                    width: 7,
                    height: 7,
                    borderRadius: 3.5,
                    backgroundColor: selectedAccentMeta.color,
                  }}
                />
                <Text
                  style={{
                    fontSize: 10.5,
                    fontWeight: "700",
                    color: systemDark
                      ? selectedAccentMeta.brandDark
                      : selectedAccentMeta.brandLight,
                  }}
                >
                  {selectedAccentMeta.label}
                </Text>
              </View>
            </View>

            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={{ gap: 10, paddingTop: 10, paddingBottom: 4, paddingHorizontal: 2 }}
            >
              {WIDGET_ACCENTS.map((item) => {
                const active = accent === item.key;
                return (
                  <Pressable
                    key={item.key}
                    onPress={() => {
                      hapticTap();
                      setAccent(item.key);
                    }}
                    accessibilityRole="radio"
                    accessibilityState={{ selected: active }}
                    accessibilityLabel={item.label}
                    style={{ alignItems: "center", width: 44 }}
                  >
                    <View
                      style={{
                        width: 38,
                        height: 38,
                        borderRadius: 19,
                        padding: 2.5,
                        borderWidth: active ? 2 : 1,
                        borderColor: active
                          ? systemDark
                            ? "#FFFFFF"
                            : "#0F172A"
                          : "transparent",
                        alignItems: "center",
                        justifyContent: "center",
                      }}
                    >
                      <LinearGradient
                        colors={[item.color, item.brandLight]}
                        start={{ x: 0.15, y: 0.1 }}
                        end={{ x: 0.9, y: 0.95 }}
                        style={{
                          width: "100%",
                          height: "100%",
                          borderRadius: 16,
                          alignItems: "center",
                          justifyContent: "center",
                          borderWidth: item.key === "white" ? 1 : 0,
                          borderColor: "rgba(148,163,184,0.45)",
                        }}
                      >
                        {active ? (
                          <Ionicons name="checkmark" size={16} color={item.textDark} />
                        ) : null}
                      </LinearGradient>
                    </View>
                    <Text
                      numberOfLines={1}
                      className={`mt-1 text-[10px] ${
                        active
                          ? "font-bold text-slate-800 dark:text-white"
                          : "text-slate-500 dark:text-slate-400"
                      }`}
                    >
                      {item.label}
                    </Text>
                  </Pressable>
                );
              })}
            </ScrollView>
          </View>

          {/* 最多显示课程数 */}
          <View className="mt-3.5">
            <View className="flex-row items-center justify-between">
              <Text className="text-[12px] font-semibold text-slate-700 dark:text-slate-200">
                最多显示课程
              </Text>
              <Text className="text-[10.5px] text-slate-400 dark:text-slate-500">
                {count > selectedShape.capacity
                  ? `${selectedShape.label}默认展示 ${selectedShape.capacity} 门，拉高后可显 ${count} 门`
                  : `最多显示 ${count} 门 · 实时同步所有已添加组件`}
              </Text>
            </View>
            <View
              style={{
                marginTop: 8,
                flexDirection: "row",
                padding: 3,
                borderRadius: 14,
                backgroundColor: segBg,
                gap: 3,
              }}
            >
              {[1, 2, 3, 4, 5].map((n) => {
                const active = count === n;
                return (
                  <Pressable
                    key={n}
                    onPress={() => {
                      hapticTap();
                      setCount(n);
                    }}
                    accessibilityRole="radio"
                    accessibilityState={{ selected: active }}
                    accessibilityLabel={`${n} 门课`}
                    style={{
                      flex: 1,
                      alignItems: "center",
                      paddingVertical: 6.5,
                      borderRadius: 11,
                      backgroundColor: active ? segActiveBg : "transparent",
                      borderWidth: active ? 1 : 0,
                      borderColor: segActiveBorder,
                    }}
                  >
                    <Text
                      className={`text-[12px] font-bold ${
                        active
                          ? "text-sky-700 dark:text-sky-200"
                          : "text-slate-600 dark:text-slate-300"
                      }`}
                    >
                      {n}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </View>

          {/* 反馈提示条 */}
          {message ? (
            <View
              accessibilityLiveRegion="polite"
              style={{
                marginTop: 12,
                flexDirection: "row",
                alignItems: "center",
                gap: 8,
                borderRadius: 14,
                paddingHorizontal: 12,
                paddingVertical: 9,
                backgroundColor:
                  message.tone === "success"
                    ? "rgba(16,185,129,0.14)"
                    : message.tone === "warn"
                      ? "rgba(245,158,11,0.14)"
                      : "rgba(56,189,248,0.14)",
              }}
            >
              <Ionicons
                name={
                  message.tone === "success"
                    ? "checkmark-circle"
                    : message.tone === "warn"
                      ? "alert-circle"
                      : "information-circle"
                }
                size={16}
                color={
                  message.tone === "success"
                    ? "#10B981"
                    : message.tone === "warn"
                      ? "#F59E0B"
                      : "#38BDF8"
                }
              />
              <Text
                className="flex-1 text-[11.5px] leading-4 text-slate-700 dark:text-slate-200"
              >
                {message.text}
              </Text>
            </View>
          ) : null}

          {/* 主操作按钮 */}
          {Platform.OS === "android" && courseWidgetsAvailable ? (
            <Pressable
              disabled={busy}
              onPress={() => {
                void handleAdd();
              }}
              accessibilityRole="button"
              style={{
                marginTop: 14,
                borderRadius: 16,
                overflow: "hidden",
                opacity: busy ? 0.72 : 1,
              }}
            >
              <LinearGradient
                colors={
                  systemDark
                    ? ["#0284C7", "#2563EB"]
                    : ["#0EA5E9", "#2563EB"]
                }
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0.8 }}
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 8,
                  paddingVertical: 12.5,
                }}
              >
                {busy ? (
                  <ActivityIndicator size="small" color="#FFFFFF" />
                ) : (
                  <Ionicons name="add-circle-outline" size={18} color="#FFFFFF" />
                )}
                <Text style={{ fontSize: 13.5, fontWeight: "700", color: "#FFFFFF" }}>
                  {busy
                    ? "正在请求添加到桌面…"
                    : `一键添加「${selectedShape.label} ${selectedShape.size}」到桌面`}
                </Text>
              </LinearGradient>
            </Pressable>
          ) : (
            <View
              style={{
                marginTop: 14,
                borderRadius: 14,
                paddingHorizontal: 12,
                paddingVertical: 10,
                backgroundColor: segBg,
              }}
            >
              <Text className="text-[11.5px] leading-4 text-slate-500 dark:text-slate-400">
                {Platform.OS === "android"
                  ? "请安装包含原生组件的完整新版 APK 以添加桌面小组件；Expo Go 仅支持样式预览。"
                  : "桌面课表小组件目前支持 Android，上方可实时预览全部尺寸与配色。"}
              </Text>
            </View>
          )}

          {/* 可展开：澎湃 OS 桌面与负一屏添加指引 */}
          <View
            style={{
              marginTop: 12,
              borderRadius: 16,
              backgroundColor: segBg,
              borderWidth: 1,
              borderColor: systemDark ? "rgba(255,255,255,0.06)" : "rgba(15,23,42,0.06)",
              overflow: "hidden",
            }}
          >
            <Pressable
              onPress={() => {
                hapticTap();
                setGuideOpen((prev) => !prev);
              }}
              accessibilityRole="button"
              accessibilityState={{ expanded: guideOpen }}
              style={{
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "space-between",
                paddingHorizontal: 12,
                paddingVertical: 10.5,
              }}
            >
              <View className="flex-1 flex-row items-center gap-2">
                <Ionicons
                  name="compass-outline"
                  size={15}
                  color={systemDark ? "#7DD3FC" : "#0284C7"}
                />
                <Text className="text-[12px] font-semibold text-slate-700 dark:text-slate-200">
                  {status?.isHyperOs
                    ? `澎湃 OS${status.hyperOsVersion ? ` (${status.hyperOsVersion})` : ""} 桌面与负一屏添加指引`
                    : "桌面长按 & 澎湃 OS 负一屏添加指引"}
                </Text>
              </View>
              <Ionicons
                name={guideOpen ? "chevron-up" : "chevron-down"}
                size={15}
                color={systemDark ? "#94A3B8" : "#64748B"}
              />
            </Pressable>

            {guideOpen ? (
              <View
                style={{
                  paddingHorizontal: 12,
                  paddingBottom: 12,
                  paddingTop: 2,
                  gap: 9,
                }}
              >
                {[
                  {
                    step: "1",
                    title: "桌面直接添加（与其它第三方应用一致）",
                    body: "在桌面双指捏合或长按空白处 → 点击「添加小部件」→ 点击顶部搜索或下滑至底部「安卓小部件」→ 找到 Dark Study，即可预览并拖拽 2×2 / 4×2 / 4×4 卡片。",
                  },
                  {
                    step: "2",
                    title: "添加到澎湃 OS 负一屏（智能助理）",
                    body: "在负一屏点右上角「+」→ 搜索或进入「安卓小部件」查找 Dark Study；也可先放到桌面，再长按拖入负一屏。注：未上架小米应用商店的独立安装包不会出现在负一屏官方首屏推荐池，属系统分发机制限制。",
                  },
                  {
                    step: "3",
                    title: "更新后找不到或自动刷新受限",
                    body: "覆盖安装新版后若桌面缓存尚未刷新，请重启手机或卸载重装一次；如一键添加无弹窗或卡片不随时间刷新，请打开权限设置允许「桌面快捷方式」并将省电策略设为「无限制」。",
                  },
                ].map((item) => (
                  <View key={item.step} className="flex-row items-start gap-2.5">
                    <View
                      style={{
                        width: 18,
                        height: 18,
                        borderRadius: 9,
                        marginTop: 1,
                        alignItems: "center",
                        justifyContent: "center",
                        backgroundColor: systemDark
                          ? "rgba(56,189,248,0.22)"
                          : "rgba(14,165,233,0.16)",
                      }}
                    >
                      <Text
                        style={{
                          fontSize: 10,
                          fontWeight: "800",
                          color: systemDark ? "#7DD3FC" : "#0284C7",
                        }}
                      >
                        {item.step}
                      </Text>
                    </View>
                    <View className="flex-1">
                      <Text className="text-[11.5px] font-bold text-slate-700 dark:text-slate-200">
                        {item.title}
                      </Text>
                      <Text className="mt-0.5 text-[10.5px] leading-4 text-slate-500 dark:text-slate-400">
                        {item.body}
                      </Text>
                    </View>
                  </View>
                ))}

                {Platform.OS === "android" ? (
                  <View className="mt-1 flex-row gap-2">
                    <Pressable
                      onPress={() => {
                        hapticTap();
                        void refreshStatus().then((val) => {
                          if (val) {
                            setMessage({
                              tone: val.registered === 3 ? "success" : "warn",
                              text: `检测完成：系统已识别 ${val.registered}/3 种组件，当前已添加 ${val.installed} 个。`,
                            });
                          }
                        });
                      }}
                      accessibilityRole="button"
                      style={{
                        flex: 1,
                        flexDirection: "row",
                        alignItems: "center",
                        justifyContent: "center",
                        gap: 5,
                        borderRadius: 11,
                        paddingVertical: 8,
                        backgroundColor: systemDark
                          ? "rgba(255,255,255,0.08)"
                          : "rgba(255,255,255,0.85)",
                      }}
                    >
                      <Ionicons
                        name="refresh-outline"
                        size={13}
                        color={systemDark ? "#E2E8F0" : "#334155"}
                      />
                      <Text className="text-[11.5px] font-semibold text-slate-700 dark:text-slate-200">
                        重新检测状态
                      </Text>
                    </Pressable>

                    <Pressable
                      onPress={handleOpenPermissions}
                      accessibilityRole="button"
                      style={{
                        flex: 1,
                        flexDirection: "row",
                        alignItems: "center",
                        justifyContent: "center",
                        gap: 5,
                        borderRadius: 11,
                        paddingVertical: 8,
                        backgroundColor: systemDark
                          ? "rgba(56,189,248,0.20)"
                          : "rgba(14,165,233,0.14)",
                      }}
                    >
                      <Ionicons
                        name="shield-checkmark-outline"
                        size={13}
                        color={systemDark ? "#7DD3FC" : "#0284C7"}
                      />
                      <Text className="text-[11.5px] font-semibold text-sky-700 dark:text-sky-200">
                        打开权限设置
                      </Text>
                    </Pressable>
                  </View>
                ) : null}
              </View>
            ) : null}
          </View>
        </View>
      </GlassContainer>
    </View>
  );
}
