import Ionicons from "@expo/vector-icons/Ionicons";
import { LinearGradient } from "expo-linear-gradient";
import {
  useEffect,
  useState,
  type ComponentRef,
  type ReactNode,
  type RefObject,
} from "react";
import {
  Image,
  Keyboard,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
} from "react-native";
import Animated, {
  Easing,
  FadeInDown,
  FadeOut,
  cancelAnimation,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withTiming,
} from "react-native-reanimated";

import { FarmPropSprite, FarmUiIcon } from "@/components/farm/CropSprite";
import { FarmChatConversation } from "@/components/farm/FarmChatConversation";
import { FarmEconomyPanel } from "@/components/farm/FarmEconomyPanel";
import { FarmEmotionMeter } from "@/components/farm/FarmEmotionMeter";
import { FarmGiftBar } from "@/components/farm/FarmGiftBar";
import { MarketIcon } from "@/components/farm/FarmMarket";
import { FarmMemoryBook } from "@/components/farm/FarmMemoryBook";
import {
  FarmHeaderAction,
  FarmNPCHeader,
  type FarmNPCBadge,
} from "@/components/farm/FarmNPCHeader";
import { FarmNPCSheet } from "@/components/farm/FarmNPCSheet";
import { FarmPersonSprite } from "@/components/farm/FarmPersonSprite";
import {
  FarmButton,
  FarmPortraitFrame,
  FarmSettingsButtonFrame,
  FarmText as Text,
} from "@/components/farm/FarmSkin";
import {
  TALK_TOPICS,
  type FarmChatMsg,
  type Speaker,
} from "@/components/farm/farmScreenConstants";
import { farmScreenStyles as st } from "@/components/farm/farmScreenStyles";
import { FARM_SCENES, type SceneVariant } from "@/components/farm/sceneTextures";
import { CROP_ART, type CropKind } from "@/components/farm/sprites";
import { POND } from "@/constants/farmMap";
import { useAnimationActive } from "@/hooks/useAnimationActive";
import { COOP_SUPPLIES, coopComfort, type CoopSupply } from "@/utils/farmCoop";
import { FARM_DECORS, type DecorId } from "@/utils/farmDecor";
import {
  CROP_META,
  irrigationCost,
  stockCount,
  type Economy,
  type Recipe,
} from "@/utils/farmEconomy";
import { describeFarmEmotion, isNpcRefusingChat } from "@/utils/farmEmotion";
import {
  RESIDENTS,
  type ResidentConversation,
  type ResidentId,
} from "@/utils/farmLife";
import {
  BAG_TIERS,
  CAN_TIERS,
  EXTRA_NAMES,
  QUALITY,
  UPGRADE_PRICES,
  VENDOR_NAMES,
  VENDORS,
  marketOffers,
  offerLevel,
  offerRemaining,
  qualityOf,
  rareOffer,
  type BagStack,
  type FarmGear,
  type Offer,
  type Vendor,
} from "@/utils/farmMarket";
import {
  CONTINUE_FARM_CHAT,
  getResidentEmotion,
  type ResidentMemory,
} from "@/utils/farmMemory";
import {
  DAILY_GOALS,
  realDate,
  restoreJournal,
  type FarmActivity,
  type FarmJournal,
} from "@/utils/farmProgress";
import type { FarmRandomEventDef } from "@/utils/farmRandomEvents";
import type { ResidentWish } from "@/utils/farmSocial";
import {
  residentCurrentSchedule,
  residentWeatherStatus,
  type FarmPeriod,
  type FarmWeather,
  type TownEvent,
} from "@/utils/farmTown";

/* -------------------------------------------------------------------------- */
/*  场景环境粒子、铭牌与池塘操作胶囊                                           */
/* -------------------------------------------------------------------------- */

export function Mote({
  x,
  y,
  dur,
  delay,
  size,
  scale,
  active,
}: {
  x: number;
  y: number;
  dur: number;
  delay: number;
  size: number;
  scale: number;
  active: boolean;
}) {
  const v = useSharedValue(0);
  const awake = useAnimationActive(active);

  useEffect(() => {
    if (!awake) return;
    v.value = withDelay(
      delay,
      withRepeat(
        withTiming(1, { duration: dur, easing: Easing.inOut(Easing.sin) }),
        -1,
        true,
      ),
    );
    return () => cancelAnimation(v);
  }, [v, dur, delay, awake]);

  const style = useAnimatedStyle(() => ({
    opacity: 0.16 + v.value * 0.38,
    transform: [
      { translateY: -v.value * 5 * scale },
      { translateX: v.value * 2 * scale },
    ],
  }));

  return (
    <Animated.View
      pointerEvents="none"
      style={[
        {
          position: "absolute",
          left: x * scale,
          top: y * scale,
          width: size * scale,
          height: size * scale,
          backgroundColor: "#FFF6C9",
        },
        style,
      ]}
    />
  );
}

/** NPC 头顶的小铭牌，提示这里可以对话 */
export function NameTag({
  label,
  accent,
  scale,
  hit,
  center = 8,
}: {
  label: string;
  accent: string;
  scale: number;
  hit: boolean;
  /** 名牌对准精灵中心的横向单位（默认按 16 宽精灵） */
  center?: number;
}) {
  return (
    <View
      pointerEvents="none"
      style={[st.nameTagWrap, { left: center * scale - 17 }]}
    >
      <View
        style={[
          st.nameTagDot,
          { backgroundColor: hit ? accent : "#8FA08F" },
        ]}
      />
      <Text
        style={[
          st.nameTagText,
          { color: hit ? "#F6EEDC" : "rgba(246,238,220,0.7)" },
        ]}
      >
        {label}
      </Text>
    </View>
  );
}

/** 池塘畔统一风格的实景磨砂胶囊按钮（打水 / 钓鱼共用同一规格，避免与站立 NPC 冲突） */
export function PondActionPill({
  label,
  badge,
  accessibilityLabel,
  icon,
  iconBg,
  accentBorder,
  badgeColor = "#E6EEDB",
  highlightDotColor,
  muted = false,
  onPress,
}: {
  label: string;
  badge?: string;
  accessibilityLabel: string;
  icon: ReactNode;
  iconBg: string;
  accentBorder: string;
  badgeColor?: string;
  highlightDotColor?: string;
  muted?: boolean;
  onPress: () => void;
}) {
  const [pressed, setPressed] = useState(false);

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      onPress={onPress}
      onPressIn={() => setPressed(true)}
      onPressOut={() => setPressed(false)}
      hitSlop={6}
      android_ripple={{ color: "rgba(255, 248, 232, 0.2)" }}
      style={[
        st.pondPill,
        { borderColor: accentBorder },
        pressed && st.pondPillPressed,
      ]}
    >
      <View style={[st.pondPillIcon, { backgroundColor: iconBg }]}>{icon}</View>
      <Text
        numberOfLines={1}
        style={[
          st.pondPillLabel,
          { color: muted ? "rgba(232, 240, 232, 0.82)" : "#FAF2DF" },
        ]}
      >
        {label}
      </Text>
      {badge ? (
        <Text
          numberOfLines={1}
          style={[st.pondPillBadge, { color: badgeColor }]}
        >
          {badge}
        </Text>
      ) : null}
      {highlightDotColor ? (
        <View
          style={[st.pondPillDot, { backgroundColor: highlightDotColor }]}
        />
      ) : null}
    </Pressable>
  );
}

/* -------------------------------------------------------------------------- */
/*  农场顶部状态栏                                                             */
/* -------------------------------------------------------------------------- */

export function FarmHeaderBar({
  insetTop,
  shopOpen,
  level,
  day,
  seasonName,
  clock,
  periodLabel,
  coins,
  sfxOn,
  lifeOpen,
  hasUnreadReports,
  onLayoutHeight,
  onBack,
  onToggleSfx,
  onOpenSettings,
}: {
  insetTop: number;
  shopOpen: boolean;
  level: number;
  day: number;
  seasonName: string;
  clock: string;
  periodLabel: string;
  coins: number;
  sfxOn: boolean;
  lifeOpen: boolean;
  hasUnreadReports: boolean;
  onLayoutHeight: (height: number) => void;
  onBack: () => void;
  onToggleSfx: () => void;
  onOpenSettings: () => void;
}) {
  return (
    <View
      onLayout={({ nativeEvent }) => {
        onLayoutHeight(Math.round(nativeEvent.layout.height));
      }}
      style={[st.headerContainer, { paddingTop: insetTop + 6 }]}
    >
      <View style={st.headerRow}>
        <FarmButton
          onPress={onBack}
          tone="paper"
          variant="icon"
          style={st.headerBackBtn}
        >
          <Ionicons name="chevron-back" size={18} color="#76583B" />
        </FarmButton>
        <View style={st.headerTitleBlock}>
          <View style={st.headerTitleRow}>
            <Text variant="title" numberOfLines={1} style={st.headerTitleText}>
              {shopOpen ? "dark 集市" : "doordoor 农场"}
            </Text>
            <View style={st.headerLevelBadge}>
              <Text style={st.headerLevelText}>Lv.{level}</Text>
            </View>
          </View>
          <Text
            numberOfLines={1}
            adjustsFontSizeToFit
            minimumFontScale={0.8}
            style={st.headerSubtitleText}
          >
            {`第 ${day} 天 · ${seasonName} · ${clock} ${periodLabel}`}
          </Text>
        </View>
        <View style={st.headerActions}>
          <View accessibilityLabel={"dark币 " + coins} style={st.coinPill}>
            <FarmUiIcon name="coin" size={15} />
            <Text style={st.coinText}>{coins}</Text>
          </View>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={sfxOn ? "关闭互动音效" : "开启互动音效"}
            onPress={onToggleSfx}
            style={[st.sfxBtn, sfxOn ? st.sfxBtnOn : st.sfxBtnOff]}
          >
            <Ionicons
              name={sfxOn ? "volume-high" : "volume-mute"}
              size={15}
              color={sfxOn ? "#7E561E" : "#9C8B71"}
            />
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="农场设置与记录"
            onPress={onOpenSettings}
            style={st.settingsBtnWrap}
          >
            {({ pressed }) => (
              <>
                <FarmSettingsButtonFrame size={38} active={lifeOpen} pressed={pressed} />
                {hasUnreadReports ? <View style={st.unreadDot} /> : null}
              </>
            )}
          </Pressable>
        </View>
      </View>
    </View>
  );
}

/* -------------------------------------------------------------------------- */
/*  庭院装扮摆件、池塘操作栏、南侧延展草坡与地图浮层                             */
/* -------------------------------------------------------------------------- */

export function FarmDecorOverlay({
  placed,
  scale,
  night,
  period,
  onOpenFestival,
  onShowToast,
}: {
  placed: readonly DecorId[];
  scale: number;
  night: boolean;
  period: FarmPeriod;
  onOpenFestival: () => void;
  onShowToast: (text: string) => void;
}) {
  return (
    <>
      {placed.map((decorId) => {
        const item = FARM_DECORS.find((d) => d.id === decorId);
        if (!item) return null;
        const isWarmGlow = item.glowsAtNight && (night || period === "evening");
        return (
          <Pressable
            key={`decor-${decorId}`}
            accessibilityRole="button"
            accessibilityLabel={item.label}
            onPress={() => {
              if (decorId === "campfire_ring") {
                onOpenFestival();
              } else {
                onShowToast(`${item.label} · ${item.desc}`);
              }
            }}
            style={{
              position: "absolute",
              left: (item.x - item.size / 2) * scale,
              top: (item.y - item.size) * scale,
              width: item.size * scale,
              height: item.size * scale,
              zIndex: Math.max(4, Math.round(item.y)),
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            {isWarmGlow ? (
              <View
                pointerEvents="none"
                style={[
                  st.decorGlow,
                  {
                    width: item.size * 1.45 * scale,
                    height: item.size * 1.45 * scale,
                  },
                ]}
              />
            ) : null}
            <FarmPropSprite name={item.prop} size={item.size * scale} />
          </Pressable>
        );
      })}
    </>
  );
}

export function FarmPondActionBar({
  scale,
  rust,
  water,
  waterCap,
  pondNeedsWater,
  weigangAtPond,
  pondFishingBonus,
  period,
  onFetchWater,
  onOpenFishing,
}: {
  scale: number;
  rust: number;
  water: number;
  waterCap: number;
  pondNeedsWater: boolean;
  weigangAtPond: boolean;
  pondFishingBonus: boolean;
  period: FarmPeriod;
  onFetchWater: () => void;
  onOpenFishing: () => void;
}) {
  return (
    <View
      pointerEvents="box-none"
      style={[
        st.pondBarWrap,
        {
          right: Math.max(8, Math.round(4 * scale)),
          top: (POND.footY - 6) * scale,
        },
      ]}
    >
      <PondActionPill
        label="打水"
        badge={rust >= 100 ? "已锈" : pondNeedsWater ? `${water}/${waterCap}` : "满"}
        accessibilityLabel={
          rust >= 100
            ? "水壶已生锈，点此提示除锈"
            : `在池塘打水，当前水量 ${water}/${waterCap}`
        }
        icon={
          <Ionicons
            name="water"
            size={11.5}
            color={rust >= 100 ? "#F5AE84" : pondNeedsWater ? "#7ADBFF" : "#92C8DC"}
          />
        }
        iconBg={
          rust >= 100
            ? "rgba(224, 118, 76, 0.28)"
            : pondNeedsWater
              ? "rgba(74, 184, 226, 0.30)"
              : "rgba(96, 168, 196, 0.22)"
        }
        accentBorder={
          rust >= 100
            ? "rgba(232, 138, 96, 0.84)"
            : pondNeedsWater
              ? "rgba(104, 208, 244, 0.88)"
              : "rgba(222, 212, 186, 0.44)"
        }
        badgeColor={
          rust >= 100
            ? "#F8B992"
            : pondNeedsWater
              ? "#B4ECFF"
              : "rgba(198, 222, 212, 0.86)"
        }
        highlightDotColor={pondNeedsWater ? "#70DCFF" : undefined}
        muted={rust < 100 && !pondNeedsWater}
        onPress={onFetchWater}
      />
      <PondActionPill
        label="钓鱼"
        badge={
          weigangAtPond
            ? "加成"
            : period === "evening" || period === "night"
              ? "月鱼"
              : undefined
        }
        accessibilityLabel="在池塘边钓鱼"
        icon={<FarmPropSprite name="rod" size={14} />}
        iconBg={
          pondFishingBonus
            ? "rgba(244, 198, 96, 0.30)"
            : "rgba(214, 194, 146, 0.22)"
        }
        accentBorder={
          pondFishingBonus
            ? "rgba(240, 200, 108, 0.86)"
            : "rgba(226, 210, 174, 0.54)"
        }
        badgeColor="#FBE098"
        highlightDotColor={pondFishingBonus ? "#F7CE68" : undefined}
        onPress={onOpenFishing}
      />
    </View>
  );
}

export function FarmRandomEventBanner({
  event,
  onOpen,
}: {
  event: FarmRandomEventDef;
  onOpen: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`农场奇遇：${event.title}`}
      onPress={onOpen}
      style={st.randomEventBanner}
    >
      <Ionicons name="sparkles" size={14} color="#B57516" />
      <Text style={st.randomEventText}>
        {event.badge} · {event.title}
      </Text>
      <View style={st.randomEventCta}>
        <Text style={st.randomEventCtaText}>参与</Text>
      </View>
    </Pressable>
  );
}

export function FarmBottomSkirt({
  sceneW,
  bottomSkirtH,
  skirtTileH,
  skirtImageH,
  skirtTileCount,
  night,
  sceneVariant,
  onGoToMarket,
}: {
  sceneW: number;
  bottomSkirtH: number;
  skirtTileH: number;
  skirtImageH: number;
  skirtTileCount: number;
  night: boolean;
  sceneVariant: SceneVariant;
  onGoToMarket: () => void;
}) {
  if (bottomSkirtH <= 0) return null;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="沿南侧小路前往dark集市"
      onPress={onGoToMarket}
      style={{
        width: sceneW,
        height: bottomSkirtH,
        overflow: "hidden",
        backgroundColor: night ? "#122134" : "#3E5D38",
      }}
    >
      {Array.from({ length: skirtTileCount }, (_, idx) => (
        <View
          key={idx}
          pointerEvents="none"
          style={{
            width: sceneW,
            height: skirtTileH,
            overflow: "hidden",
          }}
        >
          <Image
            source={FARM_SCENES[sceneVariant]}
            resizeMode="cover"
            fadeDuration={0}
            style={
              idx % 2 === 0
                ? {
                    position: "absolute",
                    top: 0,
                    width: sceneW,
                    height: skirtImageH,
                    transform: [{ scaleY: -1 }],
                  }
                : {
                    position: "absolute",
                    top: -(skirtImageH - skirtTileH),
                    width: sceneW,
                    height: skirtImageH,
                  }
            }
          />
        </View>
      ))}
      <LinearGradient
        pointerEvents="none"
        colors={
          night
            ? ["rgba(8, 16, 28, 0)", "rgba(8, 16, 28, 0.34)"]
            : ["rgba(18, 28, 14, 0)", "rgba(18, 28, 14, 0.24)"]
        }
        style={StyleSheet.absoluteFill}
      />
    </Pressable>
  );
}

export function FarmMapOverlays({
  toast,
  sceneW,
  hudOverlayH,
  showHorrorBanner,
  onOpenHorror,
  followedId,
  showFollowBar,
  period,
  weather,
  rainbow,
  activeEvents,
  onTalkFollowed,
  onStopFollow,
}: {
  toast: { id: number; text: string } | null;
  sceneW: number;
  hudOverlayH: number;
  showHorrorBanner: boolean;
  onOpenHorror: () => void;
  followedId: ResidentId | null;
  showFollowBar: boolean;
  period: FarmPeriod;
  weather: FarmWeather;
  rainbow: boolean;
  activeEvents: readonly TownEvent[];
  onTalkFollowed: (who: ResidentId) => void;
  onStopFollow: () => void;
}) {
  return (
    <>
      {toast ? (
        <Animated.View
          key={toast.id}
          entering={FadeInDown.springify()}
          exiting={FadeOut.duration(160)}
          pointerEvents="none"
          style={[
            st.toastWrap,
            { bottom: hudOverlayH + (followedId ? 68 : 10) },
          ]}
        >
          <View style={[st.toastPill, { maxWidth: sceneW - 24 }]}>
            <Text style={st.toastText}>{toast.text}</Text>
          </View>
        </Animated.View>
      ) : null}

      {showHorrorBanner ? (
        <>
          <View pointerEvents="none" style={st.horrorVignette} />
          <Pressable
            accessibilityRole="button"
            onPress={onOpenHorror}
            style={st.horrorBanner}
          >
            <Text style={st.horrorBannerText}>
              ⚠ 恐怖徐睡阴正在院子疯狂打瓦吵全员睡觉！点此赶人 ›
            </Text>
          </Pressable>
        </>
      ) : null}

      {followedId && showFollowBar ? (
        <View style={[st.followBar, { bottom: hudOverlayH + 8 }]}>
          <FarmPortraitFrame size={42}>
            <FarmPersonSprite who={followedId} size={24} active centered />
          </FarmPortraitFrame>
          <View style={st.followInfo}>
            <View style={st.followTitleRow}>
              <FarmUiIcon name="camera" size={14} />
              <Text style={st.followTitle}>
                正在跟拍 {RESIDENTS[followedId].name}
              </Text>
            </View>
            <Text numberOfLines={1} style={st.followActivity}>
              {
                residentCurrentSchedule(
                  followedId,
                  period,
                  weather,
                  rainbow,
                  activeEvents,
                ).activity
              }
            </Text>
          </View>
          <Pressable
            accessibilityRole="button"
            onPress={() => onTalkFollowed(followedId)}
            style={st.followTalkBtn}
          >
            <Text style={st.followTalkText}>聊聊</Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            onPress={onStopFollow}
            style={st.followExitBtn}
          >
            <Text style={st.followExitText}>退出</Text>
          </Pressable>
        </View>
      ) : null}
    </>
  );
}

/* -------------------------------------------------------------------------- */
/*  集市摊位内容面板（由 FarmMarket renderShop 回调渲染）                       */
/* -------------------------------------------------------------------------- */

export function FarmShopSectionContent({
  vendor,
  section,
  journal,
  now,
  gear,
  canUpgrade,
  bagCap,
  economy,
  coins,
  level,
  season,
  seeds,
  stacks,
  compost,
  vendorPrice,
  onSmithService,
  onImproveIrrigation,
  onBuyCoopSupply,
  onBuyOffer,
  onResolveRequest,
  onClaimGoal,
  onSelectCompost,
  onSellStock,
  onDeliverOrder,
  onMakeRecipe,
  onBuildKitchen,
  onRescueSeeds,
}: {
  vendor: Vendor;
  section: "trade" | "requests" | "sell" | "guide" | "craft";
  journal: FarmJournal;
  now: number;
  gear: FarmGear;
  canUpgrade: number;
  bagCap: number;
  economy: Economy;
  coins: number;
  level: number;
  season: number;
  seeds: Record<CropKind, number>;
  stacks: readonly BagStack[];
  compost: number;
  vendorPrice: (vendor: Vendor, price: number) => number;
  onSmithService: (
    service: "bag" | "can" | "bagRepair" | "canRepair" | "hoe",
  ) => void;
  onImproveIrrigation: (vendor: Vendor) => void;
  onBuyCoopSupply: (id: CoopSupply) => void;
  onBuyOffer: (vendor: Vendor, offer: Offer) => void;
  onResolveRequest: (params: {
    vendor: Vendor;
    date: string;
    requestCrop: "radish" | "wheat" | "carrot";
    amount: number;
    reward: number;
    request: FarmGear["requests"][Vendor];
  }) => void;
  onClaimGoal: (vendor: Vendor, goal: FarmActivity) => void;
  onSelectCompost: (vendor: Vendor) => void;
  onSellStock: (kind: CropKind) => void;
  onDeliverOrder: (kind: CropKind) => void;
  onMakeRecipe: (recipe: Recipe) => void;
  onBuildKitchen: () => void;
  onRescueSeeds: () => void;
}) {
  const goal: FarmActivity | null =
    vendor === "farmer"
      ? "plant"
      : vendor === "chemist"
        ? "water"
        : vendor === "traveler"
          ? "harvest"
          : null;
  const daily = restoreJournal(journal, now);
  const date = realDate(now);
  const requestIndex =
    (new Date(now).getDate() + VENDORS.indexOf(vendor)) % 3;
  const requestCrop = (["radish", "wheat", "carrot"] as const)[requestIndex];
  const amount = 2 + requestIndex;
  const reward = Math.round(CROP_META[requestCrop].sell * amount * 1.65);
  const request =
    gear.requests[vendor]?.day === date ? gear.requests[vendor] : undefined;
  const services = [
    {
      id: "bag",
      label: "升级至" + (BAG_TIERS[gear.bag + 1] ?? ""),
      price: UPGRADE_PRICES[gear.bag],
    },
    {
      id: "can",
      label: "升级水壶至" + (CAN_TIERS[canUpgrade + 1] ?? ""),
      price: UPGRADE_PRICES[canUpgrade],
    },
    { id: "bagRepair", label: "维修背包", price: gear.bagWear },
    { id: "canRepair", label: "水壶除锈", price: gear.rust },
    { id: "hoe", label: "修理锄头", price: 40 - gear.hoe },
  ] as const;

  return (
    <>
      {vendor === "smith" && section === "trade" ? (
        <>
          <Text>
            {BAG_TIERS[gear.bag]}背包 · {bagCap} 格 · 磨损 {gear.bagWear}%
          </Text>
          <Text>
            {CAN_TIERS[canUpgrade]} · 锈蚀 {gear.rust}% · 锄头耐久 {gear.hoe}
            /40
          </Text>
          {services
            .filter((item) => item.price)
            .map((item) => (
              <FarmButton
                key={item.id}
                label={
                  item.label +
                  " · " +
                  vendorPrice(vendor, item.price) +
                  " dark币"
                }
                disabled={coins < vendorPrice(vendor, item.price)}
                onPress={() => onSmithService(item.id)}
              />
            ))}
          {economy.irrigation < 3 ? (
            <FarmButton
              label={
                "保水改良 · " + irrigationCost(economy.irrigation) + " dark币"
              }
              onPress={() => onImproveIrrigation("smith")}
            />
          ) : null}
        </>
      ) : null}
      {vendor === "farmer" && section === "trade" ? (
        <View style={st.shopSectionGroup}>
          <Text variant="label">
            鸡窝用品 · 舒适度 {coopComfort(gear.coop)}/100
          </Text>
          {(Object.keys(COOP_SUPPLIES) as CoopSupply[]).map((id) => (
            <View key={id} style={st.shopRow}>
              <View style={st.shopRowBody}>
                <Text>{COOP_SUPPLIES[id].label}</Text>
                <Text style={st.shopSubText}>
                  舒适度 +{COOP_SUPPLIES[id].comfort}
                </Text>
              </View>
              <FarmButton
                label={
                  gear.coop[id]
                    ? "已安装"
                    : vendorPrice(vendor, COOP_SUPPLIES[id].price) + " dark币"
                }
                disabled={
                  Boolean(gear.coop[id]) ||
                  coins < vendorPrice(vendor, COOP_SUPPLIES[id].price)
                }
                onPress={() => onBuyCoopSupply(id)}
              />
            </View>
          ))}
        </View>
      ) : null}
      {vendor === "traveler" && section === "trade" ? (
        <Text>稀有到货按现实日期更新；传说与珍藏每日合计限购1份。</Text>
      ) : null}
      {section === "trade" &&
        marketOffers(vendor, now).map((offer) => {
          const left = offerRemaining(offer, vendor, gear, now);
          const name = offer.crop
            ? CROP_ART[offer.crop].label + "种子"
            : EXTRA_NAMES[offer.extra!];
          const price = vendorPrice(vendor, offer.price);
          const needsSlot = offer.crop
            ? seeds[offer.crop] % 64 === 0
            : gear.extras[offer.extra!] % 64 === 0;
          return (
            <View key={offer.id} style={st.shopRow}>
              <MarketIcon
                index={
                  offer.crop
                    ? 7
                    : offer.extra === "repellent"
                      ? 4
                      : offer.extra === "growth"
                        ? 5
                        : 6
                }
              />
              <View style={st.shopRowBody}>
                <Text>
                  {name} · 剩 {left}
                </Text>
                {offer.crop ? (
                  <Text>
                    {QUALITY[qualityOf(offer.crop)].label} · Lv.
                    {CROP_META[offer.crop].level} 可播种
                    {rareOffer(offer)
                      ? " · Lv." +
                        offerLevel(offer) +
                        " 可购买 · 稀有商品每日共限购1份"
                      : ""}
                  </Text>
                ) : null}
              </View>
              <FarmButton
                label={
                  level < offerLevel(offer)
                    ? "Lv." + offerLevel(offer) + " 解锁"
                    : left
                      ? price + " dark币 · 买 1"
                      : "售罄"
                }
                disabled={
                  !left ||
                  level < offerLevel(offer) ||
                  coins < price ||
                  gear.bagWear >= 100 ||
                  stacks.length > bagCap ||
                  (needsSlot && stacks.length >= bagCap)
                }
                onPress={() => onBuyOffer(vendor, offer)}
              />
            </View>
          );
        })}
      {section === "requests" ? (
        <View style={st.shopRequestCard}>
          <Text variant="label">{VENDOR_NAMES[vendor]}的委托</Text>
          <Text>
            收购 {CROP_ART[requestCrop].label} ×{amount} · 报酬 {reward} dark币
          </Text>
          <FarmButton
            label={request?.delivered ? "已交付" : request ? "交付" : "接取"}
            disabled={
              request?.delivered ||
              (Boolean(request) &&
                stockCount(economy.inventory[requestCrop]) < amount)
            }
            onPress={() =>
              onResolveRequest({
                vendor,
                date,
                requestCrop,
                amount,
                reward,
                request,
              })
            }
          />
        </View>
      ) : null}
      {goal && section === "requests" ? (
        <FarmButton
          label={
            DAILY_GOALS[goal].label +
            " · " +
            daily.counts[goal] +
            "/" +
            DAILY_GOALS[goal].target +
            (daily.claimed.includes(goal) ? " · 已领取" : " · 领奖")
          }
          disabled={
            daily.claimed.includes(goal) ||
            daily.counts[goal] < DAILY_GOALS[goal].target
          }
          onPress={() => onClaimGoal(vendor, goal)}
        />
      ) : null}
      {vendor === "chemist" && section === "trade" && compost > 0 ? (
        <FarmButton
          label={"选择有机肥 · 剩余 " + compost}
          onPress={() => onSelectCompost(vendor)}
        />
      ) : null}
      {vendor === "farmer" && section !== "trade" ? (
        <FarmEconomyPanel
          mode={
            section === "sell"
              ? "stock"
              : section === "requests"
                ? "orders"
                : section === "craft"
                  ? "kitchen"
                  : "guide"
          }
          economy={economy}
          coins={coins}
          level={level}
          season={season}
          at={now}
          onSell={onSellStock}
          onOrder={onDeliverOrder}
          onCraft={onMakeRecipe}
          onKitchen={onBuildKitchen}
          onRescue={onRescueSeeds}
          onIrrigation={() => onImproveIrrigation(vendor)}
        />
      ) : null}
    </>
  );
}

/* -------------------------------------------------------------------------- */
/*  居民一对一聊天与送礼/记忆抽屉                                               */
/* -------------------------------------------------------------------------- */

export function FarmPersonalChatSheet({
  speaker,
  speakerName,
  speakerMood,
  chatMemory,
  weather,
  rainbow,
  period,
  now,
  chatOffline,
  giftBarOpen,
  memoryBookOpen,
  dailyWishes,
  chatBusy,
  canContinueChat,
  chatMaxH,
  economy,
  coins,
  followUp,
  messages,
  draft,
  chatHint,
  chatInputRef,
  onClose,
  onToggleGiftBar,
  onToggleMemoryBook,
  onOpenGroupWithSpeaker,
  onInsertDiscussionPrompt,
  onSendTopic,
  onDeleteFact,
  onDeleteEpisode,
  onGiveCrop,
  onGiveDish,
  onFulfillWish,
  onChangeDraft,
  onSendDraft,
}: {
  speaker: Speaker | null;
  speakerName: string;
  speakerMood: string;
  chatMemory: ResidentMemory;
  weather: FarmWeather;
  rainbow: boolean;
  period: FarmPeriod;
  now: number;
  chatOffline: boolean;
  giftBarOpen: boolean;
  memoryBookOpen: boolean;
  dailyWishes: readonly ResidentWish[];
  chatBusy: boolean;
  canContinueChat: boolean;
  chatMaxH: number;
  economy: Economy;
  coins: number;
  followUp: ResidentConversation | null;
  messages: FarmChatMsg[];
  draft: string;
  chatHint: string;
  chatInputRef: RefObject<ComponentRef<typeof TextInput> | null>;
  onClose: () => void;
  onToggleGiftBar: () => void;
  onToggleMemoryBook: () => void;
  onOpenGroupWithSpeaker: (who: Speaker) => void;
  onInsertDiscussionPrompt: () => void;
  onSendTopic: (topic: string) => void;
  onDeleteFact: (who: Speaker, key: string) => void;
  onDeleteEpisode: (who: Speaker, id: string) => void;
  onGiveCrop: (who: ResidentId, crop: CropKind) => void;
  onGiveDish: (who: ResidentId, recipe: Recipe) => void;
  onFulfillWish: (wish: ResidentWish) => void;
  onChangeDraft: (text: string) => void;
  onSendDraft: () => void;
}) {
  const memoryCount =
    (chatMemory.playerFacts?.length ?? 0) + (chatMemory.episodes?.length ?? 0);

  return (
    <FarmNPCSheet visible={speaker !== null} onClose={onClose}>
      <View style={st.personalChatSurface}>
        <FarmNPCHeader
          portrait={
            <FarmPersonSprite
              who={speaker ?? "gu"}
              emotionPose={
                speaker
                  ? describeFarmEmotion(
                      getResidentEmotion(chatMemory, speaker, now),
                    ).pose
                  : "neutral"
              }
              size={30}
              centered
            />
          }
          name={speakerName}
          meta={`${speakerMood} · 好感 ${chatMemory.affinity}/100`}
          badges={(() => {
            const status = speaker
              ? residentWeatherStatus(speaker, weather, rainbow, period)
              : null;
            const list: FarmNPCBadge[] = [];
            if (status?.badge) {
              list.push({
                label: status.badge,
                tone: status.badgeKind === "rainbow" ? "rainbow" : "rain",
              });
            }
            list.push({
              label: chatOffline ? "本地台词" : "在线",
              tone: chatOffline ? "muted" : "online",
            });
            return list;
          })()}
          actions={
            <>
              <FarmHeaderAction
                icon={<FarmUiIcon name="gift" size={14} />}
                tone="amber"
                active={giftBarOpen}
                accessibilityLabel={giftBarOpen ? "收起送礼栏" : "给居民送礼"}
                label={
                  giftBarOpen
                    ? "收礼盒"
                    : dailyWishes.some(
                          (w) => w.resident === (speaker ?? "gu") && !w.fulfilled,
                        )
                      ? "送礼·心愿"
                      : "送礼"
                }
                onPress={() => {
                  Keyboard.dismiss();
                  onToggleGiftBar();
                }}
              />
              <FarmHeaderAction
                icon={<FarmUiIcon name="memory" size={14} />}
                tone="sage"
                active={memoryBookOpen}
                accessibilityLabel={memoryBookOpen ? "返回聊天" : "查看人格记忆本"}
                label={
                  memoryBookOpen
                    ? "回聊天"
                    : `记忆${memoryCount > 0 ? `(${memoryCount})` : ""}`
                }
                onPress={() => {
                  Keyboard.dismiss();
                  onToggleMemoryBook();
                }}
              />
            </>
          }
          onClose={() => {
            onClose();
            Keyboard.dismiss();
          }}
        />

        {/* 居民四维数值情绪状态条 */}
        {speaker ? (
          <View style={st.emotionMeterWrap}>
            <FarmEmotionMeter
              emotion={getResidentEmotion(chatMemory, speaker, now)}
            />
          </View>
        ) : null}

        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={st.topicStripContent}
        >
          <Pressable
            accessibilityRole="button"
            disabled={chatBusy}
            onPress={() => onOpenGroupWithSpeaker(speaker ?? "gu")}
            style={st.groupTopicChip}
          >
            <Text style={st.groupTopicText}>拉人一起群聊</Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            disabled={chatBusy}
            onPress={() => {
              onInsertDiscussionPrompt();
              chatInputRef.current?.focus();
            }}
            style={st.discussTopicChip}
          >
            <Text style={st.discussTopicText}>请家人一起讨论</Text>
          </Pressable>
          {(canContinueChat
            ? [
                CONTINUE_FARM_CHAT,
                "最近在忙什么？",
                ...TALK_TOPICS[speaker ?? "gu"],
              ]
            : ["最近在忙什么？", ...TALK_TOPICS[speaker ?? "gu"]]
          ).map((topic) => (
            <Pressable
              key={topic}
              disabled={chatBusy}
              onPress={() => onSendTopic(topic)}
              style={[st.talkTopicChip, { opacity: chatBusy ? 0.45 : 1 }]}
            >
              <Text style={st.talkTopicText}>{topic}</Text>
            </Pressable>
          ))}
        </ScrollView>

        {memoryBookOpen ? (
          <FarmMemoryBook
            who={speaker ?? "gu"}
            memory={chatMemory}
            maxHeight={Math.max(200, chatMaxH + 46)}
            onDeleteFact={(key) => onDeleteFact(speaker ?? "gu", key)}
            onDeleteEpisode={(id) => onDeleteEpisode(speaker ?? "gu", id)}
          />
        ) : (
          <>
            {giftBarOpen && speaker ? (
              <FarmGiftBar
                who={speaker}
                economy={economy}
                coins={coins}
                wish={dailyWishes.find(
                  (w) => w.resident === speaker && !w.fulfilled,
                )}
                onGiveCrop={(crop) => onGiveCrop(speaker, crop)}
                onGiveDish={(recipe) => onGiveDish(speaker, recipe)}
                onFulfillWish={onFulfillWish}
              />
            ) : null}
            {followUp ? (
              <Text style={st.followUpPrompt}>
                接着问{RESIDENTS[followUp.participants[1]].name}：
                {followUp.discussion?.question}
              </Text>
            ) : null}
            <FarmChatConversation
              messages={messages}
              busy={chatBusy}
              value={draft}
              onChange={onChangeDraft}
              onSend={onSendDraft}
              placeholder={
                speaker &&
                isNpcRefusingChat(
                  getResidentEmotion(chatMemory, speaker, now),
                  now,
                )
                  ? `${speakerName}正在拒绝沟通，输入一句真诚道歉或点上方送礼破冰…`
                  : followUp
                    ? "补充线索或输入新的追问…"
                    : `和${speakerName}聊天，或请他打水、浇地、带话…`
              }
              maxHeight={chatMaxH}
              inputRef={chatInputRef}
              hint={chatHint || (chatOffline ? "本轮使用本地对白" : undefined)}
            />
          </>
        )}
      </View>
    </FarmNPCSheet>
  );
}
