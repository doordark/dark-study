import Ionicons from "@expo/vector-icons/Ionicons";
import { LinearGradient } from "expo-linear-gradient";
import { memo, type ReactNode } from "react";
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
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ selected: active }}
      onPress={onPress}
      android_ripple={{ color: "#B9A58128" }}
      style={({ pressed }) => [
        styles.tile,
        active && styles.tileActive,
        pressed && styles.tilePressed,
      ]}
    >
      <View style={styles.tileIconWrap}>
        <FarmSlotFrame size={32} rarity={rarity} selected={active}>
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

interface SecondaryChipProps {
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  badgeDot?: boolean;
  onPress: () => void;
}

function SecondaryChip({ label, icon, badgeDot = false, onPress }: SecondaryChipProps) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      style={({ pressed }) => [styles.secondaryChip, pressed && styles.tilePressed]}
    >
      <Ionicons name={icon} size={13} color="#765B3C" />
      <Text numberOfLines={1} style={styles.secondaryChipText}>
        {label}
      </Text>
      {badgeDot ? <View style={styles.secondaryDot} /> : null}
    </Pressable>
  );
}

export const FarmBottomDock = memo(function FarmBottomDock({
  insetsBottom,
  minHeight = 0,
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
  storyBadgeCount,
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
  onOpenFishing,
  onOpenStories,
  onOpenDecor,
  onOpenLogs,
}: FarmBottomDockProps) {
  const hasToolActive = Boolean(selectedSeed || fertilizing || supply);
  const bottomPad = Math.max(insetsBottom, 10) + 4;
  // On extra-tall phones where natural space below the wooden fence is roomy (>= 174px),
  // expose a crisp secondary shortcut row instead of empty parchment margin.
  const showSecondaryRow = !shopOpen && minHeight >= 174;

  const weatherMeta = rainbow
    ? { icon: "sunny" as const, color: "#C6831B", label: "彩虹" }
    : weather === "rain"
      ? { icon: "rainy" as const, color: "#43779E", label: "细雨" }
      : period === "night"
        ? { icon: "moon" as const, color: "#586299", label: "晴夜" }
        : period === "evening"
          ? { icon: "partly-sunny" as const, color: "#BC6E34", label: "暮色" }
          : { icon: "sunny" as const, color: "#C48A25", label: "晴朗" };

  const fieldStatus =
    ripe > 0
      ? { text: `${ripe} 株可收`, color: "#4B6A2E" }
      : dryPlots > 0
        ? { text: `${dryPlots} 块待浇`, color: "#9E5E20" }
        : growing > 0
          ? { text: `${growing} 株生长中`, color: "#6A563C" }
          : { text: "空地待播", color: "#8C785E" };

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
        bg: "#E0EBC9",
        border: "#98B076",
        textColor: "#3D5526",
        onPress: onMarketPress,
      }
    : horrorActive
      ? {
          label: "赶徐睡阴",
          icon: "warning",
          bg: "#F8D7E0",
          border: "#C95276",
          textColor: "#8A1D42",
          onPress: onOpenHorror,
        }
      : activeRandomEventTitle
        ? {
            label: "去奇遇",
            icon: "sparkles",
            bg: "#FCEBC2",
            border: "#D4A149",
            textColor: "#6B4310",
            onPress: onOpenRandomEvent,
          }
        : ripe > 0
          ? {
              label: `一键收(${ripe})`,
              icon: "leaf",
              bg: "#E1EBC7",
              border: "#93AB6B",
              textColor: "#3D5526",
              onPress: onBulkHarvest,
            }
          : dryPlots > 0 && water > 0 && canRust < 100
            ? {
                label: "一键浇水",
                icon: "water",
                bg: "#DCEEF6",
                border: "#89B4C9",
                textColor: "#2C5970",
                onPress: onBulkWater,
              }
            : water <= 0 && canRust < 100
              ? {
                  label: "去打水",
                  icon: "water-outline",
                  bg: "#DCEEF6",
                  border: "#89B4C9",
                  textColor: "#2C5970",
                  onPress: onFetchWater,
                }
              : activeVisitorName
                ? {
                    label: `找${activeVisitorName.slice(0, 3)}`,
                    icon: "chatbubble-ellipses-outline",
                    bg: "#F8E8D0",
                    border: "#D6AE76",
                    textColor: "#6E4820",
                    onPress: onOpenVisitor,
                  }
                : water < waterCap && canRust < 100
                  ? {
                      label: "灌满水壶",
                      icon: "water-outline",
                      bg: "#DCEEF6",
                      border: "#89B4C9",
                      textColor: "#2C5970",
                      onPress: onFetchWater,
                    }
                  : {
                      label: "进小屋",
                      icon: "home-outline",
                      bg: "#F5E7CF",
                      border: "#D2B385",
                      textColor: "#624729",
                      onPress: onEnterHouse,
                    };

  return (
    <View style={[styles.outer, minHeight > 0 ? { minHeight } : null]}>
      <LinearGradient
        pointerEvents="none"
        colors={["#FAF2E2", "#F5EDD8", "#EFE3CA"]}
        style={StyleSheet.absoluteFill}
      />
      <View pointerEvents="none" style={styles.topHighlight} />

      <View style={[styles.inner, { paddingBottom: bottomPad }]}>
        {saveBanner ? (
          <View style={styles.errorBanner}>
            <Ionicons name="alert-circle" size={14} color="#A04B35" />
            <Text style={styles.errorText}>{saveBanner}</Text>
          </View>
        ) : null}

        {/* 第一层：实时天气/农情/手持工具状态胶囊 + 智能一键照料按钮 */}
        <View style={styles.statusRow}>
          {hasToolActive && !shopOpen ? (
            <View style={[styles.statusCapsule, styles.toolCapsule]}>
              {selectedSeed ? (
                <CropSprite kind={selectedSeed} stage={2} size={18} />
              ) : (
                <FarmToolSprite kind={fertilizing ? "compost" : "seed"} size={18} />
              )}
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
                <Text style={styles.clearToolText}>取消</Text>
              </Pressable>
            </View>
          ) : shopOpen ? (
            <View style={styles.statusCapsule}>
              <Ionicons name="storefront-outline" size={14} color="#8A5F26" />
              <Text numberOfLines={1} style={styles.marketHintText}>
                正在逛集市 · 点商贩交易、交订单或议价
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
              style={({ pressed }) => [styles.statusCapsule, pressed && styles.capsulePressed]}
            >
              <View style={styles.weatherChip}>
                <Ionicons name={weatherMeta.icon} size={13} color={weatherMeta.color} />
                <Text style={[styles.weatherText, { color: weatherMeta.color }]}>
                  {weatherMeta.label}
                </Text>
              </View>
              <Text style={styles.dot}>·</Text>
              <Text numberOfLines={1} style={[styles.fieldText, { color: fieldStatus.color }]}>
                {fieldStatus.text}
              </Text>
              <Text style={styles.dot}>·</Text>
              <View style={styles.waterPill}>
                <Ionicons
                  name="water"
                  size={11}
                  color={canRust >= 100 ? "#A45338" : water > 0 ? "#3A6E8C" : "#9A8064"}
                />
                <Text
                  style={[
                    styles.waterText,
                    {
                      color: canRust >= 100 ? "#A45338" : water > 0 ? "#3A6E8C" : "#9A8064",
                    },
                  ]}
                >
                  {canRust >= 100 ? "已锈" : `${water}/${waterCap}`}
                </Text>
              </View>
            </Pressable>
          )}

          <Pressable
            accessibilityRole="button"
            accessibilityLabel={smartAction.label}
            onPress={smartAction.onPress}
            style={({ pressed }) => [
              styles.smartBtn,
              {
                backgroundColor: smartAction.bg,
                borderColor: smartAction.border,
              },
              pressed && styles.tilePressed,
            ]}
          >
            <Ionicons name={smartAction.icon} size={13} color={smartAction.textColor} />
            <Text numberOfLines={1} style={[styles.smartBtnText, { color: smartAction.textColor }]}>
              {smartAction.label}
            </Text>
          </Pressable>
        </View>

        {/* 第二层：5 格核心功能快捷坞栏 */}
        <View style={styles.dockGrid}>
          <DockTile
            label={shopOpen ? "集市中" : "集市"}
            accessibilityLabel={shopOpen ? "返回农场" : "前往dark集市"}
            rarity={4}
            active={shopOpen}
            badgeCount={!shopOpen ? deliverableOrderCount : 0}
            badgeColor="#C57A25"
            icon={<FarmFunctionIcon name="market" size={22} />}
            onPress={onMarketPress}
          />
          <DockTile
            label="小镇"
            accessibilityLabel="打开AI小镇公告板与农场日报"
            rarity={townBadgeCount > 0 ? 4 : 1}
            active={townOpen}
            badgeDot={townBadgeCount > 0}
            badgeColor="#C85A3F"
            icon={<FarmUiIcon name="gazette" size={22} />}
            onPress={onTownPress}
          />
          <DockTile
            label="群聊"
            accessibilityLabel="打开家庭群聊"
            rarity={2}
            active={groupOpen}
            icon={<FarmUiIcon name="groupChat" size={22} />}
            onPress={onGroupPress}
          />
          <DockTile
            label="背包"
            accessibilityLabel="打开背包"
            rarity={0}
            active={bagOpen}
            badgeDot={hasToolActive}
            badgeColor="#5D7D45"
            icon={<GearIcon tier={bagTier} size={23} />}
            onPress={onBagPress}
          />
          <DockTile
            label="伴读"
            accessibilityLabel="打开农场自习伴读钟"
            rarity={3}
            active={focusOpen}
            icon={<FarmPropSprite name="focus" size={22} />}
            onPress={onFocusPress}
          />
        </View>

        {/* 第三层（仅超长屏自然余量充足时展开）：常用次级场景直达胶囊 */}
        {showSecondaryRow ? (
          <View style={styles.secondaryRow}>
            <SecondaryChip label="小屋" icon="home-outline" onPress={onEnterHouse} />
            <SecondaryChip label="钓鱼" icon="fish-outline" onPress={onOpenFishing} />
            <SecondaryChip
              label="相册"
              icon="book-outline"
              badgeDot={storyBadgeCount > 0}
              onPress={onOpenStories}
            />
            <SecondaryChip label="装扮" icon="color-palette-outline" onPress={onOpenDecor} />
            <SecondaryChip label="日志" icon="document-text-outline" onPress={onOpenLogs} />
          </View>
        ) : null}
      </View>
    </View>
  );
});

const styles = StyleSheet.create({
  outer: {
    backgroundColor: "#F5EDD8",
    borderTopWidth: 2,
    borderTopColor: "#CFAF80",
    shadowColor: "#3D2A15",
    shadowOpacity: 0.14,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: -2 },
    elevation: 6,
  },
  topHighlight: {
    height: 1,
    backgroundColor: "rgba(255, 251, 241, 0.85)",
  },
  inner: {
    flexGrow: 1,
    paddingHorizontal: 12,
    paddingTop: 8,
    gap: 8,
    justifyContent: "center",
  },
  errorBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 10,
    backgroundColor: "#F8E3DA",
    borderWidth: 1,
    borderColor: "#DFB29F",
  },
  errorText: {
    flex: 1,
    color: "#9A432E",
    fontSize: 11,
    fontWeight: "700",
  },
  statusRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  statusCapsule: {
    flex: 1,
    minWidth: 0,
    minHeight: 34,
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 12,
    backgroundColor: "#FFF9EE",
    borderWidth: 1,
    borderColor: "#DFCCA8",
  },
  toolCapsule: {
    backgroundColor: "#EFF4E2",
    borderColor: "#B3C598",
  },
  capsulePressed: {
    opacity: 0.88,
  },
  weatherChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    flexShrink: 0,
  },
  weatherText: {
    fontSize: 11,
    fontWeight: "800",
  },
  dot: {
    color: "#C4B193",
    fontSize: 11,
    fontWeight: "700",
  },
  fieldText: {
    flexShrink: 1,
    fontSize: 11,
    fontWeight: "700",
  },
  waterPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 2,
    marginLeft: "auto",
    flexShrink: 0,
  },
  waterText: {
    fontSize: 11,
    fontWeight: "800",
    fontVariant: ["tabular-nums"],
  },
  marketHintText: {
    flex: 1,
    fontSize: 11,
    fontWeight: "700",
    color: "#7C5A30",
  },
  toolStatusText: {
    flex: 1,
    fontSize: 11,
    fontWeight: "800",
    color: "#435A2D",
  },
  clearToolBtn: {
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 99,
    backgroundColor: "#DCE7C8",
    borderWidth: 1,
    borderColor: "#A9BE8A",
  },
  clearToolText: {
    fontSize: 10,
    fontWeight: "800",
    color: "#3F562A",
  },
  smartBtn: {
    minHeight: 34,
    paddingHorizontal: 11,
    borderRadius: 12,
    borderWidth: 1.2,
    borderBottomWidth: 2.2,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
    flexShrink: 0,
  },
  smartBtnText: {
    fontSize: 11.5,
    fontWeight: "800",
  },
  dockGrid: {
    flexDirection: "row",
    alignItems: "stretch",
    gap: 7,
  },
  tile: {
    flex: 1,
    minHeight: 58,
    paddingVertical: 5,
    paddingHorizontal: 2,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    gap: 3,
    backgroundColor: "#FFF9EE",
    borderWidth: 1.2,
    borderBottomWidth: 2.5,
    borderColor: "#DFCAA4",
  },
  tileActive: {
    backgroundColor: "#E8EFD8",
    borderColor: "#94AB72",
  },
  tilePressed: {
    transform: [{ scale: 0.96 }],
    opacity: 0.9,
  },
  tileIconWrap: {
    position: "relative",
    alignItems: "center",
    justifyContent: "center",
  },
  tileLabel: {
    fontSize: 11,
    fontWeight: "700",
    color: "#5C452D",
    textAlign: "center",
  },
  tileLabelActive: {
    color: "#3C5327",
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
  secondaryRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  secondaryChip: {
    flex: 1,
    minHeight: 28,
    paddingHorizontal: 6,
    paddingVertical: 4,
    borderRadius: 10,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 3,
    backgroundColor: "#FAF2E3",
    borderWidth: 1,
    borderColor: "#E0CEAE",
    position: "relative",
  },
  secondaryChipText: {
    fontSize: 10.5,
    fontWeight: "700",
    color: "#6B5237",
  },
  secondaryDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: "#C85A3F",
  },
});
