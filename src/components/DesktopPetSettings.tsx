import Ionicons from "@expo/vector-icons/Ionicons";
import { LinearGradient } from "expo-linear-gradient";
import { useColorScheme } from "nativewind";
import { useEffect, useMemo, useRef, useState } from "react";
import { AppState, Platform, Pressable, Switch, Text, View } from "react-native";
import { useReducedMotion } from "react-native-reanimated";
import { GlassContainer } from "@/components/GlassContainer";
import { PetAnimation, type PetAnimationKind } from "@/components/PetAnimation";
import { useAnimationActive } from "@/hooks/useAnimationActive";
import { buildDesktopPetPayload } from "@/hooks/useDesktopPetSync";
import {
  desktopPetAvailable,
  desktopPetSupportsPanel,
  getDesktopPetStatus,
  openDesktopPetAppSettings,
  openDesktopPetPanel,
  requestDesktopPetBatteryWhitelist,
  requestDesktopPetPermission,
  startDesktopPet,
  stopDesktopPet,
} from "@/services/desktopPet";
import {
  useDesktopPet,
  type DesktopPanelTheme,
  type DesktopTapAction,
} from "@/store/useDesktopPet";
import { useActiveSchedule } from "@/store/useStore";
import { useWhaleMemory } from "@/store/useWhaleMemory";
import { useWhalePersona } from "@/store/useWhalePersona";
import { useWhalePet } from "@/store/useWhalePet";
import { tapHaptic } from "@/utils/haptics";
import { findUpcomingCourse } from "@/utils/whaleBehavior";
import { describeWhaleEmotion } from "@/utils/whaleEmotion";

const SCALE_OPTIONS = [
  { label: "小巧", hint: "85%", value: 0.85 },
  { label: "标准", hint: "100%", value: 1.0 },
  { label: "偏大", hint: "120%", value: 1.2 },
] as const;

const OPACITY_OPTIONS = [
  { label: "轻透", hint: "65%", value: 0.65 },
  { label: "柔和", hint: "82%", value: 0.82 },
  { label: "清晰", hint: "100%", value: 1.0 },
] as const;

const PANEL_THEME_OPTIONS: readonly { key: DesktopPanelTheme; label: string; icon: keyof typeof Ionicons.glyphMap }[] = [
  { key: "auto", label: "跟随系统", icon: "contrast-outline" },
  { key: "dark", label: "深海玻璃", icon: "moon-outline" },
  { key: "light", label: "冰晶浅色", icon: "sunny-outline" },
];

const TAP_ACTION_OPTIONS: readonly {
  key: DesktopTapAction;
  label: string;
  desc: string;
  icon: keyof typeof Ionicons.glyphMap;
}[] = [
  {
    key: "interact",
    label: "摸头 / 戳戳互动",
    desc: "单击摸头或戳肚，双击 / 长按开互动卡片",
    icon: "heart-outline",
  },
  {
    key: "panel",
    label: "单击直开互动卡片",
    desc: "单手轻点立刻展开玻璃菜单，适合频繁喂饭查课表",
    icon: "sparkles-outline",
  },
];

const GESTURE_TIPS: readonly {
  icon: keyof typeof Ionicons.glyphMap;
  tint: string;
  title: string;
  desc: string;
}[] = [
  { icon: "happy-outline", tint: "#F472B6", title: "分区触控", desc: "点头部温柔蹭蹭，戳身体傲娇回应" },
  { icon: "grid-outline", tint: "#38BDF8", title: "玻璃互动卡片", desc: "喂团子、换动作、查课表、快速聊两句" },
  { icon: "hand-left-outline", tint: "#F59E0B", title: "物理拖拽抛掷", desc: "拎起悬空晃脚，猛晃会晕乎乎" },
  { icon: "moon-outline", tint: "#818CF8", title: "贴边安静休息", desc: "不挡屏幕内容，轻点随时唤醒" },
];

function oemKeepAliveTip(manufacturer: string): string {
  const m = manufacturer.toLowerCase();
  if (/xiaomi|redmi|poco/.test(m)) {
    return "检测到小米 / HyperOS：建议在应用详情开启「自启动」、省电策略设为「无限制」，并在多任务界面下拉锁定 Dark Study。";
  }
  if (/oppo|oneplus|realme/.test(m)) {
    return "检测到 OPPO / ColorOS：建议开启「允许后台运行 / 自启动」，并在最近任务卡片右上角点击锁定应用。";
  }
  if (/vivo|iqoo/.test(m)) {
    return "检测到 vivo / OriginOS：建议在电池设置中允许「后台高耗电」，并在多任务界面下拉锁定应用。";
  }
  if (/huawei|honor/.test(m)) {
    return "检测到华为 / 荣耀：建议在「应用启动管理」中关闭自动管理，手动勾选允许后台活动。";
  }
  return "为避免系统清理后台桌宠，建议允许忽略电池优化，并在多任务界面锁定 Dark Study。";
}

export function DesktopPetSettings() {
  const { colorScheme } = useColorScheme();
  const systemDark = colorScheme !== "light";

  const running = useDesktopPet((s) => s.running);
  const visible = useDesktopPet((s) => s.visible);
  const permission = useDesktopPet((s) => s.permission);
  const ghostMode = useDesktopPet((s) => s.ghostMode);
  const edgeRest = useDesktopPet((s) => s.edgeRest);
  const batteryIgnored = useDesktopPet((s) => s.batteryIgnored);
  const manufacturer = useDesktopPet((s) => s.manufacturer);
  const autoFollow = useDesktopPet((s) => s.autoFollowBackground);
  const overlayMode = useDesktopPet((s) => s.overlayMode);
  const petScale = useDesktopPet((s) => s.petScale);
  const petOpacity = useDesktopPet((s) => s.petOpacity);
  const panelTheme = useDesktopPet((s) => s.panelTheme);
  const tapAction = useDesktopPet((s) => s.tapAction);
  const showBubbles = useDesktopPet((s) => s.showBubbles);

  const setAutoFollow = useDesktopPet((s) => s.setAutoFollowBackground);
  const setOverlayMode = useDesktopPet((s) => s.setOverlayMode);
  const setPetScale = useDesktopPet((s) => s.setPetScale);
  const setPetOpacity = useDesktopPet((s) => s.setPetOpacity);
  const setPanelTheme = useDesktopPet((s) => s.setPanelTheme);
  const setTapAction = useDesktopPet((s) => s.setTapAction);
  const setShowBubbles = useDesktopPet((s) => s.setShowBubbles);
  const toggleGhostMode = useDesktopPet((s) => s.toggleGhostMode);
  const toggleEdgeRest = useDesktopPet((s) => s.toggleEdgeRest);
  const refresh = useDesktopPet((s) => s.refresh);

  const showInAppPet = useWhalePet((s) => s.show);
  const care = useWhalePet((s) => s.care);
  const personaName = useWhalePersona((s) => s.persona.name);
  const emotion = useWhaleMemory((s) => s.emotion);
  const schedule = useActiveSchedule();

  const reduced = useReducedMotion();
  const animationActive = useAnimationActive();
  const pendingPermission = useRef<"always" | "auto" | "grant" | null>(null);
  const previewTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [previewClip, setPreviewClip] = useState<PetAnimationKind>("idle");
  const [previewBubble, setPreviewBubble] = useState("点我体验全新液态玻璃互动面板～");

  const emotionDesc = useMemo(() => describeWhaleEmotion(emotion), [emotion]);
  const upcomingCourse = useMemo(() => findUpcomingCourse(schedule, new Date(), 240), [schedule]);

  const previewDark = panelTheme === "dark" || (panelTheme === "auto" && systemDark);

  useEffect(() => {
    void refresh().catch(() => {});
  }, [refresh]);

  useEffect(() => {
    return () => {
      if (previewTimerRef.current) clearTimeout(previewTimerRef.current);
    };
  }, []);

  useEffect(() => {
    const sub = AppState.addEventListener("change", (state) => {
      if (state !== "active") return;
      if (!pendingPermission.current) {
        void refresh().catch(() => {});
        return;
      }
      const mode = pendingPermission.current;
      pendingPermission.current = null;
      void (async () => {
        try {
          const status = await getDesktopPetStatus();
          if (!status.permission) {
            setNotice("还没有悬浮窗权限，允许后才能在手机桌面陪你。");
            return;
          }
          if (mode === "grant") {
            await refresh();
            setNotice("悬浮窗权限已就绪！现在可以随时召唤大肥鱼去桌面了。");
            return;
          }
          if (mode === "always") {
            setOverlayMode("always");
            await startDesktopPet(buildDesktopPetPayload(reduced, false));
            await refresh();
            setNotice("大肥鱼已经常驻到桌面啦！按 Home 键即可体验全新液态玻璃互动卡片。");
          } else {
            setAutoFollow(true);
            setOverlayMode("auto");
            showInAppPet();
            await startDesktopPet(buildDesktopPetPayload(reduced, true));
            await refresh();
            setNotice("后台自动随行已就绪！切到桌面或其他应用时，她会无缝接力出来陪你。");
          }
        } catch (error) {
          setNotice(error instanceof Error ? error.message : "桌宠未能启动，请重试。");
        } finally {
          setBusy(false);
        }
      })();
    });
    return () => sub.remove();
  }, [refresh, reduced, setAutoFollow, setOverlayMode, showInAppPet]);

  const triggerPreviewAction = (clip: PetAnimationKind, text: string, duration = 2200) => {
    tapHaptic();
    if (previewTimerRef.current) clearTimeout(previewTimerRef.current);
    setPreviewClip(clip);
    setPreviewBubble(text);
    previewTimerRef.current = setTimeout(() => {
      setPreviewClip("idle");
    }, duration);
  };

  const requestPermissionOnly = async () => {
    if (!desktopPetAvailable) return;
    setBusy(true);
    setNotice("");
    try {
      pendingPermission.current = "grant";
      await requestDesktopPetPermission();
      setNotice("请在系统页面开启「显示在其他应用上层」，开启后返回这里。");
    } catch (error) {
      pendingPermission.current = null;
      setBusy(false);
      setNotice(error instanceof Error ? error.message : "无法打开权限页面，请前往系统设置手动开启。");
    }
  };

  const toggleAlwaysDesktop = async () => {
    tapHaptic();
    setBusy(true);
    setNotice("");
    try {
      if (running && (overlayMode === "always" || visible)) {
        setOverlayMode("auto");
        await stopDesktopPet();
        await refresh();
        setNotice("桌面常驻桌宠已收回。");
      } else {
        const status = await getDesktopPetStatus();
        if (!status.permission) {
          pendingPermission.current = "always";
          await requestDesktopPetPermission();
          setNotice("请允许「显示在其他应用上层」，然后返回本软件。");
          return;
        }
        setOverlayMode("always");
        await startDesktopPet(buildDesktopPetPayload(reduced, false));
        await refresh();
        setNotice("大肥鱼已经常驻到桌面啦！双击或长按可展开液态玻璃互动卡片。");
      }
    } catch (error) {
      pendingPermission.current = null;
      setNotice(error instanceof Error ? error.message : "操作失败，请重试。");
    } finally {
      if (!pendingPermission.current) setBusy(false);
    }
  };

  const handleAutoFollowToggle = async (next: boolean) => {
    tapHaptic();
    setNotice("");
    if (!next) {
      setAutoFollow(false);
      if (overlayMode === "auto" && running) {
        await stopDesktopPet().catch(() => {});
        await refresh().catch(() => {});
      }
      setNotice("已关闭后台自动随行。");
      return;
    }
    if (!desktopPetAvailable) {
      setAutoFollow(true);
      return;
    }
    const status = await getDesktopPetStatus();
    if (!status.permission) {
      setBusy(true);
      pendingPermission.current = "auto";
      await requestDesktopPetPermission();
      setNotice("开启后台自动随行需要悬浮窗权限，允许后返回即可生效。");
      return;
    }
    setAutoFollow(true);
    setOverlayMode("auto");
    showInAppPet();
    await startDesktopPet(buildDesktopPetPayload(reduced, true)).catch(() => {});
    await refresh().catch(() => {});
    setNotice("后台自动随行已开启！退到桌面或其他软件时，大肥鱼会自动出来陪你。");
  };

  const isAlwaysActive = running && (overlayMode === "always" || visible);

  const statusMeta = useMemo(() => {
    if (!desktopPetAvailable) {
      return { label: Platform.OS === "android" ? "待更新原生包" : "仅应用内支持", dot: "#94A3B8" };
    }
    if (!permission) return { label: "待授予悬浮权限", dot: "#F59E0B" };
    if (running && ghostMode) return { label: "防误触穿透中", dot: "#A78BFA" };
    if (running && edgeRest) return { label: "贴边安静休息中", dot: "#818CF8" };
    if (running && visible) return { label: "桌面陪伴运行中", dot: "#34D399" };
    if (running) return { label: "后台随行待命中", dot: "#38BDF8" };
    return { label: "未在桌面运行", dot: "#94A3B8" };
  }, [permission, running, visible, ghostMode, edgeRest]);

  const previewPetWidth = Math.round(76 * petScale);
  const previewPetHeight = Math.round(previewPetWidth * 1.33);

  return (
    <View className="gap-4">
      {/* 1. 实时互动预览舞台 + 一键召唤主卡 */}
      <GlassContainer radius={24}>
        <View className="p-4">
          <View className="flex-row items-center justify-between">
            <View className="flex-1 pr-2">
              <Text className="text-[16px] font-extrabold text-slate-800 dark:text-white">
                桌面悬浮大肥鱼
              </Text>
              <Text className="mt-0.5 text-[11px] text-slate-500 dark:text-slate-400">
                液态玻璃悬浮互动卡片 · 贴边自适应展开
              </Text>
            </View>
            <View className="flex-row items-center rounded-full border border-sky-400/30 bg-sky-400/10 px-2.5 py-1">
              <View
                style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: statusMeta.dot }}
                className="mr-1.5"
              />
              <Text className="text-[10.5px] font-bold text-slate-700 dark:text-sky-100">
                {statusMeta.label}
              </Text>
            </View>
          </View>

          {/* 沉浸式桌面效果实时预览舞台 */}
          <View className="mt-3.5 overflow-hidden rounded-[22px] border border-sky-300/30">
            <LinearGradient
              colors={
                previewDark
                  ? ["#0A172D", "#122647", "#14213D"]
                  : ["#DDF0FF", "#EEF6FF", "#E5EDFF"]
              }
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={{ padding: 14 }}
            >
              {/* 模拟悬浮互动玻璃卡片预览 */}
              <View
                style={{
                  borderRadius: 18,
                  padding: 11,
                  backgroundColor: previewDark ? "rgba(13, 28, 54, 0.86)" : "rgba(255, 255, 255, 0.88)",
                  borderWidth: 1,
                  borderColor: previewDark ? "rgba(125, 211, 252, 0.36)" : "rgba(56, 189, 248, 0.36)",
                }}
              >
                <View className="flex-row items-center justify-between">
                  <View className="flex-row items-center">
                    <Text
                      style={{ color: previewDark ? "#F8FAFC" : "#0F172A" }}
                      className="text-[12.5px] font-extrabold"
                    >
                      {personaName}
                    </Text>
                    <View
                      style={{
                        backgroundColor: previewDark ? "rgba(56,189,248,0.18)" : "rgba(14,165,233,0.12)",
                      }}
                      className="ml-2 rounded-full px-2 py-0.5"
                    >
                      <Text
                        style={{ color: previewDark ? "#BAE6FD" : "#0369A1" }}
                        className="text-[9.5px] font-bold"
                      >
                        ● {emotionDesc.label}
                      </Text>
                    </View>
                  </View>
                  <Text
                    style={{ color: previewDark ? "#94A3B8" : "#64748B" }}
                    className="text-[9.5px] font-semibold"
                  >
                    饱食 {Math.round(care.fullness)} · 心情 {Math.round(care.mood)}
                  </Text>
                </View>

                {upcomingCourse ? (
                  <View
                    style={{
                      backgroundColor: previewDark ? "rgba(56,189,248,0.16)" : "rgba(14,165,233,0.11)",
                      borderColor: previewDark ? "rgba(125,211,252,0.32)" : "rgba(56,189,248,0.32)",
                    }}
                    className="mt-2 flex-row items-center justify-between rounded-xl border px-2.5 py-1.5"
                  >
                    <Text
                      numberOfLines={1}
                      style={{ color: previewDark ? "#E0F2FE" : "#0C4A6E" }}
                      className="flex-1 text-[10px] font-bold"
                    >
                      下一节 · {upcomingCourse.name} · {upcomingCourse.minutesUntil}分钟后
                    </Text>
                    <Text style={{ color: previewDark ? "#7DD3FC" : "#0284C7" }} className="ml-2 text-[10px] font-bold">
                      课表 ›
                    </Text>
                  </View>
                ) : null}

                {/* 互动试玩快捷胶囊 */}
                <View className="mt-2.5 flex-row gap-1.5">
                  {([
                    { label: "喂团子", icon: "fast-food-outline" as const, clip: "eat" as const, line: "嗷呜——白饭团子最好吃啦！" },
                    { label: "摸摸头", icon: "heart-outline" as const, clip: "cuddle" as const, line: "嘿嘿…手好暖，再摸一小会儿～" },
                    { label: "跳支舞", icon: "musical-notes-outline" as const, clip: "dance" as const, line: "♪ 扭一扭～今天也要加油呀！" },
                    { label: "贴边探头", icon: "moon-outline" as const, clip: "peek" as const, line: "我靠边歇会儿，不挡你屏幕哦～" },
                  ]).map((item) => (
                    <Pressable
                      key={item.label}
                      accessibilityRole="button"
                      onPress={() => triggerPreviewAction(item.clip, item.line)}
                      style={{
                        backgroundColor: previewDark ? "rgba(255,255,255,0.08)" : "rgba(255,255,255,0.92)",
                        borderColor: previewDark ? "rgba(125,211,252,0.22)" : "rgba(56,189,248,0.24)",
                      }}
                      className="flex-1 items-center rounded-xl border py-1.5"
                    >
                      <Ionicons name={item.icon} size={13} color={previewDark ? "#7DD3FC" : "#0284C7"} />
                      <Text
                        style={{ color: previewDark ? "#E2E8F0" : "#1E293B" }}
                        className="mt-0.5 text-[9.5px] font-bold"
                      >
                        {item.label}
                      </Text>
                    </Pressable>
                  ))}
                </View>
              </View>

              {/* 实时比例 & 透明度角色舞台 + 气泡预览 */}
              <View className="mt-3 flex-row items-center justify-between px-1">
                <View className="flex-1 pr-3">
                  {showBubbles ? (
                    <View
                      style={{
                        backgroundColor: previewDark ? "rgba(12, 27, 52, 0.9)" : "rgba(255, 255, 255, 0.94)",
                        borderColor: previewDark ? "rgba(125, 211, 252, 0.4)" : "rgba(56, 189, 248, 0.38)",
                      }}
                      className="rounded-2xl border px-3 py-2"
                    >
                      <View className="flex-row items-center">
                        <View className="mr-1.5 h-1.5 w-1.5 rounded-full bg-sky-400" />
                        <Text
                          style={{ color: previewDark ? "#E2E8F0" : "#1E293B" }}
                          className="flex-1 text-[11px] leading-4"
                        >
                          {previewBubble}
                        </Text>
                      </View>
                    </View>
                  ) : (
                    <Text
                      style={{ color: previewDark ? "#94A3B8" : "#64748B" }}
                      className="text-[11px] leading-4"
                    >
                      自主气泡已静音（主动喂饭/摸头时仍会回应）
                    </Text>
                  )}
                  <Text
                    style={{ color: previewDark ? "#7DD3FC" : "#0369A1" }}
                    className="mt-2 text-[10px] font-semibold"
                  >
                    当前预览：体型 {Math.round(petScale * 100)}% · 透明度 {Math.round(petOpacity * 100)}%
                  </Text>
                </View>

                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="点击预览大肥鱼互动反应"
                  onPress={() =>
                    triggerPreviewAction(
                      previewClip === "cuddle" ? "happy" : "cuddle",
                      tapAction === "panel" ? "单击就能直接展开互动卡片啦～" : "嘿嘿，摸头好舒服呀～",
                    )
                  }
                  style={{ opacity: petOpacity, minWidth: 94, minHeight: 112 }}
                  className="items-center justify-center"
                >
                  <PetAnimation
                    kind={previewClip}
                    width={previewPetWidth}
                    height={previewPetHeight}
                    active={animationActive}
                  />
                </Pressable>
              </View>
            </LinearGradient>
          </View>

          {!desktopPetAvailable ? (
            <View className="mt-3 flex-row items-start rounded-2xl border border-amber-400/30 bg-amber-400/10 p-3">
              <Ionicons name="information-circle-outline" size={16} color="#F59E0B" style={{ marginTop: 1 }} />
              <Text className="ml-2 flex-1 text-[11.5px] leading-5 text-amber-700 dark:text-amber-200">
                {Platform.OS === "android"
                  ? "当前安装包尚未包含升级后的原生桌面悬浮模块，请安装重新构建的新 APK（Expo Go 不支持应用外悬浮）。"
                  : "应用外悬浮桌宠目前支持 Android 手机；网页与 iOS 保留完整的软件内互动桌宠。"}
              </Text>
            </View>
          ) : null}

          {/* 主召唤按钮 + 运行时快捷控制 */}
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={isAlwaysActive ? "收回桌面桌宠" : "召唤到桌面陪你"}
            disabled={busy || !desktopPetAvailable}
            onPress={() => void toggleAlwaysDesktop()}
            className="mt-4 overflow-hidden rounded-2xl"
          >
            <LinearGradient
              colors={
                busy || !desktopPetAvailable
                  ? ["#94A3B8", "#64748B"]
                  : isAlwaysActive
                    ? ["#475569", "#334155"]
                    : ["#0EA5E9", "#2563EB"]
              }
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={{
                minHeight: 48,
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "center",
                paddingHorizontal: 16,
              }}
            >
              <Ionicons
                name={isAlwaysActive ? "close-circle-outline" : "sparkles"}
                size={16}
                color="#FFFFFF"
              />
              <Text className="ml-2 text-[13.5px] font-extrabold text-white">
                {busy ? "正在处理…" : isAlwaysActive ? "收回桌面桌宠" : "立刻常驻到桌面"}
              </Text>
            </LinearGradient>
          </Pressable>

          {/* 运行时三项快捷胶囊：展开互动卡 / 贴边休息 / 防误触穿透 */}
          {desktopPetAvailable && running ? (
            <View className="mt-2.5 flex-row gap-2">
              {desktopPetSupportsPanel ? (
                <Pressable
                  accessibilityRole="button"
                  onPress={() => {
                    tapHaptic();
                    void openDesktopPetPanel().catch(() => {});
                  }}
                  className="min-h-10 flex-1 flex-row items-center justify-center rounded-xl border border-sky-400/35 bg-sky-400/12 px-2"
                >
                  <Ionicons name="apps-outline" size={14} color="#38BDF8" />
                  <Text className="ml-1.5 text-[11.5px] font-bold text-sky-700 dark:text-sky-200">
                    呼出互动卡
                  </Text>
                </Pressable>
              ) : null}
              <Pressable
                accessibilityRole="button"
                onPress={() => {
                  tapHaptic();
                  void toggleEdgeRest(!edgeRest).catch(() => {});
                }}
                className={`min-h-10 flex-1 flex-row items-center justify-center rounded-xl border px-2 ${
                  edgeRest
                    ? "border-indigo-400/55 bg-indigo-400/20"
                    : "border-slate-300/30 bg-white/20 dark:bg-white/[0.04]"
                }`}
              >
                <Ionicons name={edgeRest ? "sunny-outline" : "moon-outline"} size={14} color={edgeRest ? "#818CF8" : "#94A3B8"} />
                <Text className="ml-1.5 text-[11.5px] font-bold text-slate-700 dark:text-slate-200">
                  {edgeRest ? "唤醒她" : "贴边休息"}
                </Text>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                onPress={() => {
                  tapHaptic();
                  void toggleGhostMode(!ghostMode).catch(() => {});
                }}
                className={`min-h-10 flex-1 flex-row items-center justify-center rounded-xl border px-2 ${
                  ghostMode
                    ? "border-violet-400/55 bg-violet-400/20"
                    : "border-slate-300/30 bg-white/20 dark:bg-white/[0.04]"
                }`}
              >
                <Ionicons name="eye-off-outline" size={14} color={ghostMode ? "#A78BFA" : "#94A3B8"} />
                <Text className="ml-1.5 text-[11.5px] font-bold text-slate-700 dark:text-slate-200">
                  {ghostMode ? "恢复触控" : "防误触"}
                </Text>
              </Pressable>
            </View>
          ) : null}

          {notice ? (
            <View className="mt-3 flex-row items-start rounded-2xl bg-sky-400/12 px-3 py-2.5">
              <Ionicons name="sparkles-outline" size={14} color="#38BDF8" style={{ marginTop: 2 }} />
              <Text
                accessibilityLiveRegion="polite"
                className="ml-2 flex-1 text-[11.5px] leading-5 text-sky-700 dark:text-sky-200"
              >
                {notice}
              </Text>
            </View>
          ) : null}
        </View>
      </GlassContainer>

      {/* 2. 外观尺寸、透明度与液态玻璃主题 */}
      <GlassContainer radius={24}>
        <View className="p-4">
          <View className="flex-row items-center">
            <Ionicons name="color-palette-outline" size={17} color="#38BDF8" />
            <Text className="ml-2 text-[15px] font-bold text-slate-800 dark:text-white">
              外观与玻璃质感
            </Text>
          </View>
          <Text className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">
            调整后实时同步到桌面悬浮大肥鱼，无需重启服务
          </Text>

          {/* 体型大小 */}
          <Text className="mt-3.5 text-[12px] font-semibold text-slate-600 dark:text-slate-300">
            桌面体型尺寸
          </Text>
          <View className="mt-2 flex-row gap-2">
            {SCALE_OPTIONS.map((opt) => {
              const active = Math.abs(petScale - opt.value) < 0.05;
              return (
                <Pressable
                  key={opt.label}
                  accessibilityRole="button"
                  accessibilityState={{ selected: active }}
                  onPress={() => {
                    tapHaptic();
                    setPetScale(opt.value);
                  }}
                  className={`min-h-12 flex-1 items-center justify-center rounded-2xl border py-1.5 ${
                    active
                      ? "border-sky-400/70 bg-sky-400/20"
                      : "border-slate-300/25 bg-white/15 dark:bg-white/[0.03]"
                  }`}
                >
                  <Text
                    className={`text-[12.5px] font-bold ${
                      active ? "text-sky-600 dark:text-sky-300" : "text-slate-700 dark:text-slate-200"
                    }`}
                  >
                    {opt.label}
                  </Text>
                  <Text className="mt-0.5 text-[10px] text-slate-500 dark:text-slate-400">
                    {opt.hint}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          {/* 本体透明度 */}
          <Text className="mt-4 text-[12px] font-semibold text-slate-600 dark:text-slate-300">
            桌宠透明度（兼顾阅读与打游戏不遮挡）
          </Text>
          <View className="mt-2 flex-row gap-2">
            {OPACITY_OPTIONS.map((opt) => {
              const active = Math.abs(petOpacity - opt.value) < 0.05;
              return (
                <Pressable
                  key={opt.label}
                  accessibilityRole="button"
                  accessibilityState={{ selected: active }}
                  onPress={() => {
                    tapHaptic();
                    setPetOpacity(opt.value);
                  }}
                  className={`min-h-12 flex-1 items-center justify-center rounded-2xl border py-1.5 ${
                    active
                      ? "border-sky-400/70 bg-sky-400/20"
                      : "border-slate-300/25 bg-white/15 dark:bg-white/[0.03]"
                  }`}
                >
                  <Text
                    className={`text-[12.5px] font-bold ${
                      active ? "text-sky-600 dark:text-sky-300" : "text-slate-700 dark:text-slate-200"
                    }`}
                  >
                    {opt.label}
                  </Text>
                  <Text className="mt-0.5 text-[10px] text-slate-500 dark:text-slate-400">
                    {opt.hint}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          {/* 互动卡片主题 */}
          <Text className="mt-4 text-[12px] font-semibold text-slate-600 dark:text-slate-300">
            互动面板与气泡主题
          </Text>
          <View className="mt-2 flex-row gap-2">
            {PANEL_THEME_OPTIONS.map((opt) => {
              const active = panelTheme === opt.key;
              return (
                <Pressable
                  key={opt.key}
                  accessibilityRole="button"
                  accessibilityState={{ selected: active }}
                  onPress={() => {
                    tapHaptic();
                    setPanelTheme(opt.key);
                  }}
                  className={`min-h-11 flex-1 flex-row items-center justify-center rounded-2xl border px-2 ${
                    active
                      ? "border-sky-400/70 bg-sky-400/20"
                      : "border-slate-300/25 bg-white/15 dark:bg-white/[0.03]"
                  }`}
                >
                  <Ionicons
                    name={opt.icon}
                    size={14}
                    color={active ? "#38BDF8" : "#94A3B8"}
                  />
                  <Text
                    className={`ml-1.5 text-[11.5px] font-bold ${
                      active ? "text-sky-600 dark:text-sky-300" : "text-slate-700 dark:text-slate-200"
                    }`}
                  >
                    {opt.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </View>
      </GlassContainer>

      {/* 3. 互动偏好与手势指南 */}
      <GlassContainer radius={24}>
        <View className="p-4">
          <View className="flex-row items-center">
            <Ionicons name="hand-right-outline" size={17} color="#38BDF8" />
            <Text className="ml-2 text-[15px] font-bold text-slate-800 dark:text-white">
              互动偏好与手势
            </Text>
          </View>

          {/* 切后台自动随行 */}
          <View className="mt-3.5 flex-row items-center justify-between rounded-2xl bg-sky-400/10 px-3.5 py-3">
            <View className="flex-1 pr-3">
              <Text className="text-[13px] font-bold text-slate-800 dark:text-white">
                切后台自动出现在桌面
              </Text>
              <Text className="mt-0.5 text-[11px] leading-4 text-slate-500 dark:text-slate-400">
                在软件内叫出桌宠后，按 Home 键或切应用 0ms 无缝接力到桌面；待命时自动释放贴图内存
              </Text>
            </View>
            <Switch
              accessibilityLabel="切后台自动出现在桌面"
              value={autoFollow}
              disabled={busy || !desktopPetAvailable}
              onValueChange={(v) => void handleAutoFollowToggle(v)}
              trackColor={{ true: "#38BDF8", false: "#64748B" }}
            />
          </View>

          {/* 自主冒泡对话 */}
          <View className="mt-2.5 flex-row items-center justify-between rounded-2xl bg-white/20 px-3.5 py-3 dark:bg-white/[0.04]">
            <View className="flex-1 pr-3">
              <Text className="text-[13px] font-bold text-slate-800 dark:text-white">
                自主冒泡对话与闲聊
              </Text>
              <Text className="mt-0.5 text-[11px] leading-4 text-slate-500 dark:text-slate-400">
                关闭后更安静专注，但课前倒计时与你主动摸头/喂饭仍会温柔回应
              </Text>
            </View>
            <Switch
              accessibilityLabel="自主冒泡对话与闲聊"
              value={showBubbles}
              onValueChange={(v) => {
                tapHaptic();
                setShowBubbles(v);
              }}
              trackColor={{ true: "#38BDF8", false: "#64748B" }}
            />
          </View>

          {/* 单击手势偏好 */}
          <Text className="mt-4 text-[12px] font-semibold text-slate-600 dark:text-slate-300">
            单击桌宠触发方式
          </Text>
          <View className="mt-2 gap-2">
            {TAP_ACTION_OPTIONS.map((opt) => {
              const active = tapAction === opt.key;
              return (
                <Pressable
                  key={opt.key}
                  accessibilityRole="button"
                  accessibilityState={{ selected: active }}
                  onPress={() => {
                    tapHaptic();
                    setTapAction(opt.key);
                  }}
                  className={`flex-row items-center rounded-2xl border px-3.5 py-2.5 ${
                    active
                      ? "border-sky-400/65 bg-sky-400/15"
                      : "border-slate-300/25 bg-white/15 dark:bg-white/[0.03]"
                  }`}
                >
                  <View
                    className={`h-8 w-8 items-center justify-center rounded-xl ${
                      active ? "bg-sky-400/25" : "bg-slate-400/15"
                    }`}
                  >
                    <Ionicons name={opt.icon} size={16} color={active ? "#38BDF8" : "#94A3B8"} />
                  </View>
                  <View className="ml-3 flex-1">
                    <Text
                      className={`text-[12.5px] font-bold ${
                        active ? "text-sky-700 dark:text-sky-200" : "text-slate-700 dark:text-slate-200"
                      }`}
                    >
                      {opt.label}
                    </Text>
                    <Text className="mt-0.5 text-[10.5px] leading-4 text-slate-500 dark:text-slate-400">
                      {opt.desc}
                    </Text>
                  </View>
                  <Ionicons
                    name={active ? "checkmark-circle" : "ellipse-outline"}
                    size={18}
                    color={active ? "#38BDF8" : "#94A3B8"}
                  />
                </Pressable>
              );
            })}
          </View>

          {/* 手势速查 2×2 卡片 */}
          <View className="mt-4 flex-row flex-wrap gap-2">
            {GESTURE_TIPS.map((tip) => (
              <View
                key={tip.title}
                className="min-w-[46%] flex-1 rounded-2xl bg-white/20 p-2.5 dark:bg-white/[0.04]"
              >
                <View className="flex-row items-center">
                  <Ionicons name={tip.icon} size={14} color={tip.tint} />
                  <Text className="ml-1.5 text-[11.5px] font-bold text-slate-700 dark:text-slate-200">
                    {tip.title}
                  </Text>
                </View>
                <Text className="mt-1 text-[10px] leading-4 text-slate-500 dark:text-slate-400">
                  {tip.desc}
                </Text>
              </View>
            ))}
          </View>
        </View>
      </GlassContainer>

      {/* 4. 权限与后台保活引导卡片（Android） */}
      {Platform.OS === "android" && desktopPetAvailable ? (
        <GlassContainer radius={24}>
          <View className="p-4">
            <View className="flex-row items-center">
              <Ionicons name="shield-checkmark-outline" size={17} color="#38BDF8" />
              <Text className="ml-2 text-[15px] font-bold text-slate-800 dark:text-white">
                权限与防系统清理
              </Text>
            </View>

            {/* 权限状态条目 1：悬浮窗 */}
            <View className="mt-3 flex-row items-center justify-between rounded-2xl bg-white/20 px-3 py-2.5 dark:bg-white/[0.04]">
              <View className="flex-1 pr-2">
                <Text className="text-[12.5px] font-bold text-slate-800 dark:text-white">
                  显示在其他应用上层
                </Text>
                <Text className="mt-0.5 text-[10.5px] text-slate-500 dark:text-slate-400">
                  {permission ? "已授权 · 可自由悬浮于桌面和其他软件上方" : "必须开启才能在桌面看到大肥鱼"}
                </Text>
              </View>
              {permission ? (
                <View className="flex-row items-center rounded-full bg-emerald-400/15 px-2.5 py-1">
                  <Ionicons name="checkmark-circle" size={13} color="#10B981" />
                  <Text className="ml-1 text-[10.5px] font-bold text-emerald-600 dark:text-emerald-300">
                    已就绪
                  </Text>
                </View>
              ) : (
                <Pressable
                  accessibilityRole="button"
                  onPress={() => void requestPermissionOnly()}
                  className="rounded-xl bg-sky-500 px-3 py-1.5"
                >
                  <Text className="text-[11px] font-bold text-white">去开启</Text>
                </Pressable>
              )}
            </View>

            {/* 权限状态条目 2：电池优化白名单 */}
            <View className="mt-2 flex-row items-center justify-between rounded-2xl bg-white/20 px-3 py-2.5 dark:bg-white/[0.04]">
              <View className="flex-1 pr-2">
                <Text className="text-[12.5px] font-bold text-slate-800 dark:text-white">
                  忽略电池优化（后台保活）
                </Text>
                <Text className="mt-0.5 text-[10.5px] text-slate-500 dark:text-slate-400">
                  {batteryIgnored ? "已放行 · 切后台不易被系统误杀" : "建议放行，防止锁屏或切应用后桌宠被回收"}
                </Text>
              </View>
              {batteryIgnored ? (
                <View className="flex-row items-center rounded-full bg-emerald-400/15 px-2.5 py-1">
                  <Ionicons name="checkmark-circle" size={13} color="#10B981" />
                  <Text className="ml-1 text-[10.5px] font-bold text-emerald-600 dark:text-emerald-300">
                    已放行
                  </Text>
                </View>
              ) : (
                <Pressable
                  accessibilityRole="button"
                  onPress={() => {
                    tapHaptic();
                    void requestDesktopPetBatteryWhitelist().catch(() => {});
                  }}
                  className="rounded-xl bg-amber-500 px-3 py-1.5"
                >
                  <Text className="text-[11px] font-bold text-white">去放行</Text>
                </Pressable>
              )}
            </View>

            <Text className="mt-3 text-[11px] leading-5 text-slate-600 dark:text-slate-300">
              {oemKeepAliveTip(manufacturer)}
            </Text>

            <Pressable
              accessibilityRole="button"
              onPress={() => {
                tapHaptic();
                void openDesktopPetAppSettings().catch(() => {});
              }}
              className="mt-3 min-h-10 flex-row items-center justify-center rounded-xl border border-sky-400/35 bg-white/20 px-3 dark:bg-white/[0.04]"
            >
              <Ionicons name="settings-outline" size={14} color="#38BDF8" />
              <Text className="ml-1.5 text-[12px] font-semibold text-sky-700 dark:text-sky-200">
                打开系统应用详情（配置自启动与省电策略）
              </Text>
            </Pressable>
          </View>
        </GlassContainer>
      ) : null}
    </View>
  );
}
