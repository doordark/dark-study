import Ionicons from "@expo/vector-icons/Ionicons";
import { LinearGradient } from "expo-linear-gradient";
import { memo, useState, type ReactNode } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import type { CropKind } from "@/utils/farmEconomy";
import { EXTRA_NAMES } from "@/utils/farmMarket";
import type { FarmPeriod, FarmWeather } from "@/utils/farmTown";
import { CropSprite, FarmPropSprite, FarmToolSprite, FarmUiIcon } from "./CropSprite";
import { GearIcon } from "./FarmMarket";
import { FarmFunctionIcon, FarmSlotFrame, FarmText as Text } from "./FarmSkin";
import { CROP_ART } from "./sprites";

export interface FarmBottomDockProps {
  insetsBottom: number;
  minHeight?: number;
  shopOpen: boolean;
  weather: FarmWeather;
  rainbow: boolean;
  period: FarmPeriod;
  ripe: number;
  dryPlots: number;
  growing: number;
  water: number;
  waterCap: number;
  canRust: number;
  selectedSeed: CropKind | null;
  selectedSeedCount: number;
  fertilizing: boolean;
  compost: number;
  supply: "repellent" | "growth" | null;
  supplyCount: number;
  bagTier: number;
  deliverableOrderCount: number;
  townBadgeCount: number;
  storyBadgeCount: number;
  horrorActive: boolean;
  activeRandomEventTitle?: string;
  activeVisitorName?: string;
  saveBanner?: string | null;
  townOpen: boolean;
  groupOpen: boolean;
  bagOpen: boolean;
  focusOpen: boolean;
  onClearTool: () => void;
  onMarketPress: () => void;
  onTownPress: () => void;
  onGroupPress: () => void;
  onBagPress: () => void;
  onFocusPress: () => void;
  onBulkHarvest: () => void;
  onBulkWater: () => void;
  onFetchWater: () => void;
  onOpenHorror: () => void;
  onOpenRandomEvent: () => void;
  onOpenVisitor: () => void;
  onEnterHouse: () => void;
  onOpenFishing: () => void;
  onOpenStories: () => void;
  onOpenDecor: () => void;
  onOpenLogs: () => void;
}

/** 悬浮底部 HUD 预计总占位高度（用于 FarmScreen 避让提示条与跟拍卡片） */
export function farmBottomDockHeight(insetsBottom: number) {
  return 102 + Math.max(insetsBottom, 8);
}

interface DockTileProps {
  label: string;
  accessibilityLabel: string;
  rarity: 0 | 1 | 2 | 3 | 4 | 5;
  active?: boolean;
  badgeCount?: number;
  badgeDot?: boolean;
  badgeColor?: string;
  icon: ReactNode;
  onPress: () => void;
}

function DockTile({
  label,
  accessibilityLabel,
  rarity,
  active = false,
  badgeCount = 0,
  badgeDot = false,
  badgeColor = "#C85A3F",
  icon,
  onPress,
}: DockTileProps) {
  const [pressed, setPressed] = useState(false);

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ selected: active }}
      onPress={onPress}
      onPressIn={() => setPressed(true)}
      onPressOut={() => setPressed(false)}
      android_ripple={{ color: "rgba(160, 134, 96, 0.18)" }}
      style={[
        styles.tile,
        active && styles.tileActive,
        pressed && styles.tilePressed,
      ]}
    >
      <View style={styles.tileIconWrap}>
        <FarmSlotFrame size={30} rarity={rarity} selected={active}>
          {icon}
        </FarmSlotFrame>
        {badgeCount > 0 ? (
          <View style={[styles.badgePill, { backgroundColor: badgeColor }]}>
            <Text style={styles.badgeText}>{badgeCount > 9 ? "9+" : badgeCount}</Text>
          </View>
        ) : badgeDot ? (
          <View style={[styles.badgeDot, { backgroundColor: badgeColor }]} />
        ) : null}
      </View>
      <Text numberOfLines={1} style={[styles.tileLabel, active && styles.tileLabelActive]}>
        {label}
      </Text>
    </Pressable>
  );
}

export const FarmBottomDock = memo(function FarmBottomDock({
  insetsBottom,
  shopOpen,
  weather,
  rainbow,
  period,
  ripe,
  dryPlots,
  growing,
  water,
  waterCap,
  canRust,
  selectedSeed,
  selectedSeedCount,
  fertilizing,
  compost,
  supply,
  supplyCount,
  bagTier,
  deliverableOrderCount,
  townBadgeCount,
  horrorActive,
  activeRandomEventTitle,
  activeVisitorName,
  saveBanner,
  townOpen,
  groupOpen,
  bagOpen,
  focusOpen,
  onClearTool,
  onMarketPress,
  onTownPress,
  onGroupPress,
  onBagPress,
  onFocusPress,
  onBulkHarvest,
  onBulkWater,
  onFetchWater,
  onOpenHorror,
  onOpenRandomEvent,
  onOpenVisitor,
  onEnterHouse,
}: FarmBottomDockProps) {
  const [statusPressed, setStatusPressed] = useState(false);
  const [smartPressed, setSmartPressed] = useState(false);

  const hasToolActive = Boolean(selectedSeed || fertilizing || supply);
  const bottomPad = Math.max(insetsBottom, 8) + 2;

  const weatherMeta = rainbow
    ? { icon: "sunny" as const, color: "#B87514", label: "彩虹" }
    : weather === "rain"
      ? { icon: "rainy" as const, color: "#346B96", label: "细雨" }
      : period === "night"
        ? { icon: "moon" as const, color: "#4D578F", label: "晴夜" }
        : period === "evening"
          ? { icon: "partly-sunny" as const, color: "#B56226", label: "暮色" }
          : { icon: "sunny" as const, color: "#BA7D1A", label: "晴朗" };

  const fieldStatus =
    ripe > 0
      ? { text: `${ripe} 株可收`, color: "#426326" }
      : dryPlots > 0
        ? { text: `${dryPlots} 块待浇`, color: "#985518" }
        : growing > 0
          ? { text: `${growing} 株生长中`, color: "#5D4931" }
          : { text: "空地待播", color: "#766249" };

  const smartAction: {
    label: string;
    icon: keyof typeof Ionicons.glyphMap;
    bg: string;
    border: string;
    textColor: string;
    onPress: () => void;
  } = shopOpen
    ? {
        label: "回农场",
        icon: "arrow-back",
        bg: "rgba(225, 238, 200, 0.92)",
        border: "rgba(136, 166, 102, 0.88)",
        textColor: "#385021",
        onPress: onMarketPress,
      }
    : horrorActive
      ? {
          label: "赶徐睡阴",
          icon: "warning",
          bg: "rgba(250, 214, 224, 0.94)",
          border: "rgba(201, 82, 118, 0.88)",
          textColor: "#8A1D42",
          onPress: onOpenHorror,
        }
      : activeRandomEventTitle
        ? {
            label: "去奇遇",
            icon: "sparkles",
            bg: "rgba(253, 236, 194, 0.93)",
            border: "rgba(212, 161, 73, 0.88)",
            textColor: "#6B4310",
            onPress: onOpenRandomEvent,
          }
        : ripe > 0
          ? {
              label: `一键收(${ripe})`,
              icon: "leaf",
              bg: "rgba(225, 238, 198, 0.92)",
              border: "rgba(138, 168, 99, 0.88)",
              textColor: "#395222",
              onPress: onBulkHarvest,
            }
          : dryPlots > 0 && water > 0 && canRust < 100
            ? {
                label: "一键浇水",
                icon: "water",
                bg: "rgba(218, 239, 248, 0.92)",
                border: "rgba(122, 174, 201, 0.88)",
                textColor: "#25536B",
                onPress: onBulkWater,
              }
            : water <= 0 && canRust < 100
              ? {
                  label: "去打水",
                  icon: "water-outline",
                  bg: "rgba(218, 239, 248, 0.92)",
                  border: "rgba(122, 174, 201, 0.88)",
                  textColor: "#25536B",
                  onPress: onFetchWater,
                }
              : activeVisitorName
                ? {
                    label: `找${activeVisitorName.slice(0, 3)}`,
                    icon: "chatbubble-ellipses-outline",
                    bg: "rgba(250, 234, 208, 0.92)",
                    border: "rgba(210, 168, 110, 0.88)",
                    textColor: "#6A431B",
                    onPress: onOpenVisitor,
                  }
                : water < waterCap && canRust < 100
                  ? {
                      label: "灌满水壶",
                      icon: "water-outline",
                      bg: "rgba(218, 239, 248, 0.92)",
                      border: "rgba(122, 174, 201, 0.88)",
                      textColor: "#25536B",
                      onPress: onFetchWater,
                    }
                  : {
                      label: "进小屋",
                      icon: "home-outline",
                      bg: "rgba(247, 233, 209, 0.92)",
                      border: "rgba(206, 174, 126, 0.88)",
                      textColor: "#5E4326",
                      onPress: onEnterHouse,
                    };

  const waterColor = canRust >= 100 ? "#A45338" : water > 0 ? "#2E6687" : "#8D7255";

  const smartStyle = {
    backgroundColor: smartAction.bg,
    borderColor: smartAction.border,
  };

  return (
    <View pointerEvents="box-none" style={styles.overlayRoot}>
      <LinearGradient
        pointerEvents="none"
        colors={["rgba(16, 24, 14, 0)", "rgba(16, 24, 14, 0.26)"]}
        style={[styles.bottomScrim, { height: 86 + bottomPad }]}
      />

      <View pointerEvents="box-none" style={[styles.inner, { paddingBottom: bottomPad }]}>
        {saveBanner ? (
          <View style={styles.errorBanner}>
            <Ionicons name="alert-circle" size={14} color="#A04B35" />
            <Text numberOfLines={1} style={styles.errorText}>
              {saveBanner}
            </Text>
          </View>
        ) : null}

        {/* 一整块纸质面板：上层内嵌状态条 + 渐隐分隔线 + 下层 5 入口，形状/描边/投影完全统一 */}
        <View style={styles.panel}>
          <View pointerEvents="none" style={styles.panelRim} />

          <View style={styles.statusRow}>
            {hasToolActive && !shopOpen ? (
              <View style={styles.statusMain}>
                <View style={[styles.leadBadge, styles.leadBadgeTool]}>
                  {selectedSeed ? (
                    <CropSprite kind={selectedSeed} stage={2} size={15} />
                  ) : (
                    <FarmToolSprite kind={fertilizing ? "compost" : "seed"} size={15} />
                  )}
                </View>
                <Text numberOfLines={1} style={styles.toolStatusText}>
                  {selectedSeed
                    ? `播种：${CROP_ART[selectedSeed].label} ×${selectedSeedCount}`
                    : fertilizing
                      ? `施肥模式 · 剩 ${compost}`
                      : `${EXTRA_NAMES[supply!]} · 剩 ${supplyCount}`}
                </Text>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="取消当前手持工具"
                  onPress={onClearTool}
                  hitSlop={6}
                  style={styles.clearToolBtn}
                >
                  <Ionicons name="close" size={11} color="#5B6B47" />
                  <Text numberOfLines={1} style={styles.clearToolText}>
                    取消
                  </Text>
                </Pressable>
              </View>
            ) : shopOpen ? (
              <View style={styles.statusMain}>
                <View style={[styles.leadBadge, styles.leadBadgeMarket]}>
                  <Ionicons name="storefront" size={12} color="#9A6420" />
                </View>
                <Text numberOfLines={1} style={styles.marketTitle}>
                  dark 集市
                </Text>
                <Text numberOfLines={1} style={styles.marketHintText}>
                  点商贩交易、交订单或议价
                </Text>
              </View>
            ) : (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="查看农情或快捷打水"
                onPress={() => {
                  if (canRust >= 100) {
                    onMarketPress();
                  } else if (water <= 0) {
                    onFetchWater();
                  } else if (dryPlots > 0) {
                    onBulkWater();
                  } else {
                    onBagPress();
                  }
                }}
                onPressIn={() => setStatusPressed(true)}
                onPressOut={() => setStatusPressed(false)}
                style={[styles.statusMain, statusPressed && styles.capsulePressed]}
              >
                <View style={[styles.leadBadge, { backgroundColor: `${weatherMeta.color}1F` }]}>
                  <Ionicons name={weatherMeta.icon} size={12} color={weatherMeta.color} />
                </View>
                <Text numberOfLines={1} style={[styles.weatherText, { color: weatherMeta.color }]}>
                  {weatherMeta.label}
                </Text>
                <View style={styles.sep} />
                <Text numberOfLines={1} style={[styles.fieldText, { color: fieldStatus.color }]}>
                  {fieldStatus.text}
                </Text>
                <View style={styles.waterPill}>
                  <Ionicons name="water" size={10} color={waterColor} />
                  <Text numberOfLines={1} style={[styles.waterText, { color: waterColor }]}>
                    {canRust >= 100 ? "已锈" : `${water}/${waterCap}`}
                  </Text>
                </View>
              </Pressable>
            )}

            <Pressable
              accessibilityRole="button"
              accessibilityLabel={smartAction.label}
              onPress={smartAction.onPress}
              onPressIn={() => setSmartPressed(true)}
              onPressOut={() => setSmartPressed(false)}
              style={[styles.smartBtn, smartStyle, smartPressed && styles.tilePressed]}
            >
              <Ionicons name={smartAction.icon} size={12} color={smartAction.textColor} />
              <Text numberOfLines={1} style={[styles.smartBtnText, { color: smartAction.textColor }]}>
                {smartAction.label}
              </Text>
            </Pressable>
          </View>

          <LinearGradient
            pointerEvents="none"
            start={{ x: 0, y: 0.5 }}
            end={{ x: 1, y: 0.5 }}
            colors={["rgba(196, 168, 124, 0)", "rgba(196, 168, 124, 0.55)", "rgba(196, 168, 124, 0)"]}
            style={styles.divider}
          />

          <View style={styles.dockRow}>
            <DockTile
              label={shopOpen ? "集市中" : "集市"}
              accessibilityLabel={shopOpen ? "返回农场" : "前往dark集市"}
              rarity={4}
              active={shopOpen}
              badgeCount={!shopOpen ? deliverableOrderCount : 0}
              badgeColor="#C57A25"
              icon={<FarmFunctionIcon name="market" size={20} />}
              onPress={onMarketPress}
            />
            <DockTile
              label="小镇"
              accessibilityLabel="打开AI小镇公告板与农场日报"
              rarity={townBadgeCount > 0 ? 4 : 1}
              active={townOpen}
              badgeDot={townBadgeCount > 0}
              badgeColor="#C85A3F"
              icon={<FarmUiIcon name="gazette" size={20} />}
              onPress={onTownPress}
            />
            <DockTile
              label="群聊"
              accessibilityLabel="打开家庭群聊"
              rarity={2}
              active={groupOpen}
              icon={<FarmUiIcon name="groupChat" size={20} />}
              onPress={onGroupPress}
            />
            <DockTile
              label="背包"
              accessibilityLabel="打开背包"
              rarity={0}
              active={bagOpen}
              badgeDot={hasToolActive}
              badgeColor="#5D7D45"
              icon={<GearIcon tier={bagTier} size={21} />}
              onPress={onBagPress}
            />
            <DockTile
              label="伴读"
              accessibilityLabel="打开农场自习伴读钟"
              rarity={3}
              active={focusOpen}
              icon={<FarmPropSprite name="focus" size={20} />}
              onPress={onFocusPress}
            />
          </View>
        </View>
      </View>
    </View>
  );
});

const PANEL_BORDER = "rgba(208, 182, 140, 0.9)";

const styles = StyleSheet.create({
  overlayRoot: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 15,
  },
  bottomScrim: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
  },
  inner: {
    width: "100%",
    paddingHorizontal: 10,
    paddingTop: 4,
    gap: 6,
  },
  errorBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 11,
    paddingVertical: 5,
    borderRadius: 999,
    backgroundColor: "rgba(248, 227, 218, 0.94)",
    borderWidth: 1,
    borderColor: "rgba(223, 178, 159, 0.9)",
  },
  errorText: {
    flex: 1,
    color: "#9A432E",
    fontSize: 11,
    fontWeight: "700",
  },
  panel: {
    width: "100%",
    paddingHorizontal: 6,
    paddingTop: 6,
    paddingBottom: 5,
    borderRadius: 22,
    borderCurve: "continuous",
    backgroundColor: "rgba(255, 249, 238, 0.93)",
    borderWidth: 1,
    borderColor: PANEL_BORDER,
    shadowColor: "#24190D",
    shadowOpacity: 0.22,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 8,
  },
  panelRim: {
    position: "absolute",
    left: 1,
    right: 1,
    top: 1,
    bottom: 1,
    borderRadius: 21,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.65)",
  },
  statusRow: {
    height: 30,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingLeft: 4,
  },
  statusMain: {
    flex: 1,
    minWidth: 0,
    height: 30,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  capsulePressed: {
    opacity: 0.7,
  },
  leadBadge: {
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  leadBadgeTool: {
    backgroundColor: "rgba(150, 182, 112, 0.22)",
  },
  leadBadgeMarket: {
    backgroundColor: "rgba(214, 160, 82, 0.2)",
  },
  weatherText: {
    fontSize: 11.5,
    lineHeight: 15,
    fontWeight: "800",
    flexShrink: 0,
  },
  sep: {
    width: 1,
    height: 11,
    borderRadius: 1,
    backgroundColor: "rgba(170, 146, 110, 0.45)",
    flexShrink: 0,
  },
  fieldText: {
    flex: 1,
    minWidth: 0,
    fontSize: 11.5,
    lineHeight: 15,
    fontWeight: "700",
  },
  waterPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 2,
    flexShrink: 0,
    paddingHorizontal: 6,
    height: 18,
    borderRadius: 9,
    backgroundColor: "rgba(120, 160, 190, 0.12)",
  },
  waterText: {
    fontSize: 10.5,
    lineHeight: 13,
    fontWeight: "800",
    fontVariant: ["tabular-nums"],
  },
  marketTitle: {
    flexShrink: 0,
    fontSize: 12,
    lineHeight: 15,
    fontWeight: "800",
    color: "#7A4F1C",
  },
  marketHintText: {
    flex: 1,
    minWidth: 0,
    fontSize: 11,
    lineHeight: 14,
    fontWeight: "600",
    color: "#94784F",
  },
  toolStatusText: {
    flex: 1,
    minWidth: 0,
    fontSize: 11.5,
    lineHeight: 15,
    fontWeight: "800",
    color: "#3F562A",
  },
  clearToolBtn: {
    flexShrink: 0,
    flexDirection: "row",
    alignItems: "center",
    gap: 2,
    paddingHorizontal: 7,
    height: 20,
    borderRadius: 10,
    backgroundColor: "rgba(150, 182, 112, 0.2)",
  },
  clearToolText: {
    fontSize: 10,
    lineHeight: 13,
    fontWeight: "800",
    color: "#3A5126",
  },
  smartBtn: {
    height: 26,
    paddingHorizontal: 10,
    borderRadius: 13,
    borderWidth: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
    flexShrink: 0,
  },
  smartBtnText: {
    fontSize: 11,
    lineHeight: 14,
    fontWeight: "800",
  },
  divider: {
    height: 1,
    marginTop: 4,
    marginBottom: 3,
    marginHorizontal: 10,
  },
  dockRow: {
    width: "100%",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 4,
  },
  tile: {
    flex: 1,
    minWidth: 0,
    minHeight: 50,
    paddingVertical: 4,
    paddingHorizontal: 2,
    borderRadius: 15,
    borderCurve: "continuous",
    alignItems: "center",
    justifyContent: "center",
    gap: 2,
    borderWidth: 1,
    borderColor: "transparent",
  },
  tileActive: {
    backgroundColor: "rgba(226, 236, 204, 0.95)",
    borderColor: "rgba(150, 176, 112, 0.55)",
  },
  tilePressed: {
    transform: [{ scale: 0.96 }],
    opacity: 0.88,
  },
  tileIconWrap: {
    position: "relative",
    alignItems: "center",
    justifyContent: "center",
  },
  tileLabel: {
    fontSize: 10.5,
    lineHeight: 13,
    fontWeight: "700",
    color: "#523D27",
    textAlign: "center",
  },
  tileLabelActive: {
    color: "#364E22",
    fontWeight: "800",
  },
  badgeDot: {
    position: "absolute",
    top: -1,
    right: -2,
    width: 8,
    height: 8,
    borderRadius: 4,
    borderWidth: 1.2,
    borderColor: "#FFF9EE",
  },
  badgePill: {
    position: "absolute",
    top: -3,
    right: -6,
    minWidth: 15,
    height: 15,
    paddingHorizontal: 3,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1.2,
    borderColor: "#FFF9EE",
  },
  badgeText: {
    color: "#FFFDF7",
    fontSize: 8.5,
    fontWeight: "800",
  },
});
