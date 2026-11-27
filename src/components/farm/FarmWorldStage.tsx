import {
  Suspense,
  type ComponentRef,
  type ReactNode,
  type RefObject,
} from "react";
import { Image, Pressable, ScrollView, View, type ViewStyle } from "react-native";
import Animated, { type AnimatedStyle } from "react-native-reanimated";

import { FarmCropLayer } from "@/components/farm/FarmCropLayer";
import { FarmLifeLayer } from "@/components/farm/FarmLifeLayer";
import { FarmPersonSprite } from "@/components/farm/FarmPersonSprite";
import { FarmRain } from "@/components/farm/FarmRain";
import {
  FarmBottomSkirt,
  FarmDecorOverlay,
  FarmPondActionBar,
  FarmRandomEventBanner,
  Mote,
  NameTag,
} from "@/components/farm/FarmSceneHelpers";
import { LazyFarmMarket } from "@/components/farm/FarmSheetsHost";
import { FarmVisitorActor } from "@/components/farm/FarmVisitorActor";
import {
  MOTES,
  VENDOR_MEMORY_KEYS,
  plotPos,
  type Speaker,
} from "@/components/farm/farmScreenConstants";
import { farmScreenStyles as st } from "@/components/farm/farmScreenStyles";
import { getFarmSceneTexture } from "@/components/farm/sceneTextures";
import type { FarmPersistence } from "@/components/farm/useFarmPersistence";
import { COOP, HOUSE, INTERACTION_ZONES, MARKET, POND } from "@/constants/farmMap";
import type { useFarmResidents } from "@/hooks/useFarmResidents";
import { playSfx } from "@/services/soundEffects";
import { coopComfort } from "@/utils/farmCoop";
import { describeFarmEmotion } from "@/utils/farmEmotion";
import {
  RESIDENT_IDS,
  type ResidentConversation,
  type ResidentId,
} from "@/utils/farmLife";
import type { Vendor } from "@/utils/farmMarket";
import { farmPressPoint } from "@/utils/farmPressPoint";
import type { IndoorSleeperId, NightSoloEvent } from "@/utils/farmSleep";
import { resolveVisitorEmotion, type VisitorId } from "@/utils/farmVisitors";
import { renderQuality, type RenderQuality } from "@/utils/renderQuality";

export interface FarmWorldStageProps {
  farm: FarmPersistence;
  sceneW: number;
  sceneH: number;
  sceneFrameStyle: { width: number; height: number };
  scale: number;
  bottomSkirtH: number;
  skirtTileH: number;
  skirtImageH: number;
  skirtTileCount: number;
  farmScrollRef: RefObject<ComponentRef<typeof ScrollView> | null>;
  onMapHeightChange: (height: number) => void;
  onTerrainPainted: () => void;
  focused: boolean;
  quality: RenderQuality;
  now: number;
  decorReady: boolean;
  folkReady: boolean;
  shopOpen: boolean;
  marketOrders: boolean;
  bagOpen: boolean;
  lifeOpen: boolean;
  houseOpen: boolean;
  gameOpen: boolean;
  groupOpen: boolean;
  townOpen: boolean;
  focusOpen: boolean;
  festivalOpen: boolean;
  fishingOpen: boolean;
  storiesOpen: boolean;
  decorOpen: boolean;
  randomEventModalOpen: boolean;
  speaker: Speaker | null;
  visitorSpeaker: VisitorId | null;
  apiKey: string;
  farmWebSearch: boolean;
  onCloseShop: () => void;
  renderShop: (
    vendor: Vendor,
    section: "trade" | "requests" | "sell" | "guide" | "craft",
  ) => ReactNode;
  pondNeedsWater: boolean;
  weigangAtPond: boolean;
  pondFishingBonus: boolean;
  onOpenBugGame: (index: number) => void;
  onEnterHouse: () => void;
  onGoToMarket: (showOrders?: boolean) => void;
  onOpenFishing: () => void;
  onOpenFestival: () => void;
  onShowToast: (text: string, durationMs?: number) => void;
  playerAnchor: { x: number; y: number };
  playerMoving: boolean;
  playerStyle: AnimatedStyle<ViewStyle>;
  playerFacingStyle: AnimatedStyle<ViewStyle>;
  heroEmotionPose: "neutral" | "happy";
  walkRipple: { id: number; x: number; y: number } | null;
  onMoveTo: (
    x: number,
    y: number,
    opts?: { showRipple?: boolean; faceTowardX?: number },
  ) => number;
  residents: ReturnType<typeof useFarmResidents>;
  lifeInitialTab: "life" | "ai" | "logs";
  lifeReportsOnly: boolean;
  unreadReportIds: Set<string>;
  recapVisible: boolean;
  followedId: ResidentId | null;
  sleepingResidents: IndoorSleeperId[];
  nightSoloEvent: NightSoloEvent | null;
  interruptedRequests: ResidentConversation[];
  onOpenRecapFromLife: () => void;
  onCloseLifePanel: () => void;
  onTalkResident: (who: Speaker, position?: { x: number; y: number }) => void;
  onJoinGroup: (
    members?: readonly ResidentId[],
    record?: ResidentConversation,
  ) => void;
  onSetDraft: (text: string) => void;
  onResumeRequest: (record: ResidentConversation) => void;
  onFollowUp: (record: ResidentConversation) => void;
  onOpenVisitorTalk: (
    who: VisitorId,
    position?: { x: number; y: number },
  ) => void;
  onOpenRandomEventModal: () => void;
  mapOverlay: ReactNode;
}

export function FarmWorldStage({
  farm,
  sceneW,
  sceneH,
  sceneFrameStyle,
  scale,
  bottomSkirtH,
  skirtTileH,
  skirtImageH,
  skirtTileCount,
  farmScrollRef,
  onMapHeightChange,
  onTerrainPainted,
  focused,
  quality,
  now,
  decorReady,
  folkReady,
  shopOpen,
  marketOrders,
  bagOpen,
  lifeOpen,
  houseOpen,
  gameOpen,
  groupOpen,
  townOpen,
  focusOpen,
  festivalOpen,
  fishingOpen,
  storiesOpen,
  decorOpen,
  randomEventModalOpen,
  speaker,
  visitorSpeaker,
  apiKey,
  farmWebSearch,
  onCloseShop,
  renderShop,
  pondNeedsWater,
  weigangAtPond,
  pondFishingBonus,
  onOpenBugGame,
  onEnterHouse,
  onGoToMarket,
  onOpenFishing,
  onOpenFestival,
  onShowToast,
  playerAnchor,
  playerMoving,
  playerStyle,
  playerFacingStyle,
  heroEmotionPose,
  walkRipple,
  onMoveTo,
  residents,
  lifeInitialTab,
  lifeReportsOnly,
  unreadReportIds,
  recapVisible,
  followedId,
  sleepingResidents,
  nightSoloEvent,
  interruptedRequests,
  onOpenRecapFromLife,
  onCloseLifePanel,
  onTalkResident,
  onJoinGroup,
  onSetDraft,
  onResumeRequest,
  onFollowUp,
  onOpenVisitorTalk,
  onOpenRandomEventModal,
  mapOverlay,
}: FarmWorldStageProps) {
  const visitorActive =
    focused &&
    !shopOpen &&
    !houseOpen &&
    !gameOpen &&
    !bagOpen &&
    !groupOpen &&
    !focusOpen &&
    !festivalOpen &&
    !fishingOpen &&
    !storiesOpen &&
    !decorOpen &&
    visitorSpeaker === null;

  return (
    <View
      onLayout={({ nativeEvent }) => onMapHeightChange(nativeEvent.layout.height)}
      style={[
        st.mapContainer,
        { backgroundColor: farm.night ? "#122134" : "#3E5D38" },
      ]}
    >
      {shopOpen && focused ? (
        <Suspense fallback={null}>
          <LazyFarmMarket
            visible
            initialOrders={marketOrders}
            onClose={onCloseShop}
            coins={farm.coins}
            paused={bagOpen || lifeOpen || !focused}
            at={now}
            apiKey={apiKey}
            webSearch={farmWebSearch}
            priceDeals={farm.gear.priceDeals}
            onDiscount={farm.agreeVendorDiscount}
            vendorMemories={{
              smith: farm.vendorMemories[VENDOR_MEMORY_KEYS.smith],
              farmer: farm.vendorMemories[VENDOR_MEMORY_KEYS.farmer],
              chemist: farm.vendorMemories[VENDOR_MEMORY_KEYS.chemist],
              traveler: farm.vendorMemories[VENDOR_MEMORY_KEYS.traveler],
            }}
            weather={farm.weather}
            rainbow={farm.rainbow}
            period={farm.period}
            onMemory={farm.updateVendorMemory}
            renderShop={renderShop}
          />
        </Suspense>
      ) : null}

      <ScrollView
        ref={farmScrollRef}
        style={{ display: shopOpen ? "none" : "flex" }}
        showsVerticalScrollIndicator={false}
        bounces={false}
        keyboardShouldPersistTaps="handled"
      >
        <View style={{ width: sceneW }}>
          <View style={sceneFrameStyle}>
            <Image
              pointerEvents="none"
              source={getFarmSceneTexture(farm.sceneVariant)}
              style={sceneFrameStyle}
              resizeMode="cover"
              fadeDuration={0}
              onLoadEnd={onTerrainPainted}
            />
            <FarmCropLayer
              plots={farm.plots}
              scale={scale}
              timeShift={farm.timeShift}
              active={focused && !shopOpen}
              onBug={onOpenBugGame}
            />

            {decorReady
              ? MOTES.slice(0, renderQuality(quality).particles).map((m) => (
                  <Mote
                    key={m.id}
                    x={m.x}
                    y={m.y}
                    dur={m.dur}
                    delay={m.delay}
                    size={m.size}
                    scale={scale}
                    active={focused && !shopOpen && !houseOpen && !gameOpen}
                  />
                ))
              : null}

            <Pressable
              style={{
                position: "absolute",
                left: 0,
                top: 0,
                right: 0,
                bottom: 0,
              }}
              onPress={(e) => {
                const point = farmPressPoint(e, scale);
                if (!point) return;
                if (point.y >= 310) onGoToMarket();
                else onMoveTo(point.x, point.y, { showRipple: true });
              }}
            />

            <Pressable
              onPress={onEnterHouse}
              accessibilityRole="button"
              accessibilityLabel="进屋"
              style={{
                position: "absolute",
                left: INTERACTION_ZONES.house.x * scale,
                top: INTERACTION_ZONES.house.y * scale,
                width: INTERACTION_ZONES.house.w * scale,
                height: INTERACTION_ZONES.house.h * scale,
                zIndex: HOUSE.footY,
              }}
            />

            {farm.plots.map((_, i) => {
              const pos = plotPos(i);
              return (
                <Pressable
                  key={i}
                  onPress={() => farm.actOnPlot(i)}
                  hitSlop={1}
                  accessibilityRole="button"
                  accessibilityLabel={`第 ${i + 1} 块田地`}
                  style={{
                    position: "absolute",
                    left: pos.x * scale,
                    top: pos.y * scale,
                    width: pos.w * scale,
                    height: pos.h * scale,
                    zIndex: 210,
                  }}
                />
              );
            })}

            <Pressable
              accessibilityRole="button"
              accessibilityLabel="前往dark集市"
              onPress={() => onGoToMarket()}
              style={{
                position: "absolute",
                left: 0,
                bottom: 0,
                width: sceneW,
                height: 20 * scale,
                zIndex: 400,
              }}
            />

            <Pressable
              onPress={farm.fetchWater}
              accessibilityRole="button"
              accessibilityLabel="在水池打水"
              style={{
                position: "absolute",
                left: INTERACTION_ZONES.pond.x * scale,
                top: INTERACTION_ZONES.pond.y * scale,
                width: INTERACTION_ZONES.pond.w * scale,
                height: INTERACTION_ZONES.pond.h * scale,
                borderRadius: (POND.w * scale) / 2,
                zIndex: POND.footY + 2,
              }}
            />

            <Pressable
              accessibilityRole="button"
              accessibilityLabel="农场旧摊位"
              onPress={() =>
                onShowToast("商贩都在doordoor集市，从农场下方入口过去")
              }
              style={{
                position: "absolute",
                left: MARKET.x * scale,
                top: MARKET.y * scale,
                width: MARKET.w * scale,
                height: MARKET.h * scale,
                zIndex: MARKET.footY,
              }}
            />
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="鸡窝"
              onPress={() => {
                playSfx("farm_chicken", { volume: 0.72 });
                onMoveTo(COOP.approach.x, COOP.approach.y);
                onShowToast(
                  `坤坤的小窝 · 舒适度 ${coopComfort(farm.gear.coop)}/100`,
                );
              }}
              style={{
                position: "absolute",
                left: COOP.x * scale,
                top: COOP.y * scale,
                width: COOP.w * scale,
                height: COOP.h * scale,
                zIndex: COOP.footY,
              }}
            />

            <FarmDecorOverlay
              placed={farm.decorState.placed}
              scale={scale}
              night={farm.night}
              period={farm.period}
              onOpenFestival={onOpenFestival}
              onShowToast={onShowToast}
            />

            <FarmPondActionBar
              scale={scale}
              rust={farm.gear.rust}
              water={farm.water}
              waterCap={farm.waterCap}
              pondNeedsWater={pondNeedsWater}
              weigangAtPond={weigangAtPond}
              pondFishingBonus={pondFishingBonus}
              period={farm.period}
              onFetchWater={farm.fetchWater}
              onOpenFishing={onOpenFishing}
            />

            {walkRipple ? (
              <View
                key={walkRipple.id}
                pointerEvents="none"
                style={[
                  st.walkRipple,
                  {
                    left: (walkRipple.x - 6) * scale,
                    top: (walkRipple.y - 3) * scale,
                    width: 12 * scale,
                    height: 6 * scale,
                    zIndex: Math.max(2, Math.round(walkRipple.y) - 1),
                  },
                ]}
              />
            ) : null}

            {folkReady ? (
              <FarmLifeLayer
                scale={scale}
                controller={residents}
                hasApiKey={Boolean(apiKey)}
                at={now}
                panelOpen={lifeOpen}
                initialTab={lifeInitialTab}
                reportsOnly={lifeReportsOnly}
                unreadReportIds={unreadReportIds}
                onReadReport={(id) =>
                  farm.setRecapReadIds((previous) =>
                    previous.includes(id)
                      ? previous
                      : [...previous, id].slice(-100),
                  )
                }
                onOpenRecap={onOpenRecapFromLife}
                onClosePanel={onCloseLifePanel}
                onTalk={onTalkResident}
                playerPosition={playerAnchor}
                followedId={followedId}
                sleepingResidents={sleepingResidents}
                sleepDeprived={farm.sleepDeprived}
                nightSoloEvent={nightSoloEvent}
                memories={farm.memories}
                whaleSyncEnabled={farm.whaleSyncEnabled}
                onToggleWhaleSync={(enabled) => {
                  farm.setTown((prev) => ({
                    ...prev,
                    whaleSyncEnabled: enabled,
                  }));
                  onShowToast(
                    enabled
                      ? "大肥鱼访客已同步课表人设与记忆"
                      : "已关闭大肥鱼课表人设同步",
                  );
                }}
                randomEventsEnabled={farm.randomEventsEnabled}
                onToggleRandomEvents={(enabled) => {
                  farm.setTown((prev) => ({
                    ...prev,
                    randomEventsEnabled: enabled,
                  }));
                  onShowToast(
                    enabled
                      ? "已开启农场随机奇遇事件"
                      : "已关闭农场随机奇遇自动触发",
                  );
                }}
                emotionSpritesEnabled={farm.emotionSpritesEnabled}
                onToggleEmotionSprites={(enabled) => {
                  farm.setTown((prev) => ({
                    ...prev,
                    emotionSpritesEnabled: enabled,
                  }));
                  onShowToast(
                    enabled
                      ? "已开启人物像素情绪动作贴图"
                      : "已关闭人物情绪动作贴图",
                  );
                }}
                weather={farm.weather}
                rainbow={farm.rainbow}
                period={farm.period}
                topBlockedHeight={recapVisible ? 132 : 0}
                onJoinGroup={(record) => onJoinGroup(record.participants, record)}
                onPressBubble={(resident) => {
                  if (resident.bubble?.kind === "thought" && resident.bubble.text) {
                    const thoughtSnippet = resident.bubble.text.slice(0, 26);
                    onTalkResident(resident.id, resident.logicalPosition);
                    onSetDraft(`刚看你在想「${thoughtSnippet}」，跟我聊聊？`);
                    return;
                  }
                  if (resident.conversationSize >= 2) {
                    const active = [...residents.history]
                      .reverse()
                      .find(
                        (rec) =>
                          rec.endedAt === null &&
                          rec.participants.includes(resident.id) &&
                          rec.participants.length >= 2,
                      );
                    if (active) {
                      onJoinGroup(active.participants, active);
                      return;
                    }
                    const fallbackMembers = resident.conversationPartner
                      ? [resident.id, resident.conversationPartner]
                      : [
                          resident.id,
                          ...RESIDENT_IDS.filter((id) => id !== resident.id).slice(
                            0,
                            2,
                          ),
                        ];
                    onJoinGroup(fallbackMembers);
                    return;
                  }
                  onTalkResident(resident.id, resident.logicalPosition);
                }}
                interruptedRequests={interruptedRequests}
                onResumeRequest={onResumeRequest}
                onFollowUp={(record) => {
                  if (!farm.loaded || farm.loadFailed) return;
                  onFollowUp(record);
                }}
              />
            ) : null}

            {folkReady &&
            farm.activeNormalVisitor &&
            !farm.visitorState.horrorActive
              ? (() => {
                  const vEm = resolveVisitorEmotion(
                    farm.activeNormalVisitor,
                    farm.visitorState,
                    farm.whaleSync,
                    now,
                  );
                  const vDesc = describeFarmEmotion(vEm);
                  return (
                    <FarmVisitorActor
                      who={farm.activeNormalVisitor}
                      scale={scale}
                      weather={farm.weather}
                      rainbow={farm.rainbow}
                      whaleSync={farm.whaleSync}
                      emotionPose={
                        farm.emotionSpritesEnabled ? vDesc.pose : "neutral"
                      }
                      emotionBadge={
                        farm.emotionSpritesEnabled && vDesc.pose !== "neutral"
                          ? vDesc.badge
                          : undefined
                      }
                      active={visitorActive && !randomEventModalOpen}
                      onPress={onOpenVisitorTalk}
                    />
                  );
                })()
              : null}

            {folkReady && farm.visitorState.horrorActive ? (
              <FarmVisitorActor
                who="dark_xushuiyin"
                scale={scale}
                weather={farm.weather}
                rainbow={farm.rainbow}
                active={visitorActive}
                onPress={onOpenVisitorTalk}
              />
            ) : null}

            <Animated.View
              pointerEvents="none"
              style={[st.playerRoot, playerStyle]}
            >
              <NameTag
                label="你"
                accent="#9E7338"
                scale={scale}
                hit
                center={7}
              />
              <View
                style={[
                  st.playerShadow,
                  {
                    left: 2 * scale,
                    top: 19 * scale,
                    width: 10 * scale,
                    height: 2 * scale,
                  },
                ]}
              />
              <Animated.View style={playerFacingStyle}>
                <FarmPersonSprite
                  who="hero"
                  activity={playerMoving ? "walk" : "idle"}
                  emotionPose={
                    farm.emotionSpritesEnabled ? heroEmotionPose : "neutral"
                  }
                  size={20 * scale}
                  active={focused && !shopOpen}
                  walkSpeed={1000 / 18}
                />
              </Animated.View>
            </Animated.View>

            {farm.activeRandomEvent && !randomEventModalOpen ? (
              <FarmRandomEventBanner
                event={farm.activeRandomEvent}
                onOpen={onOpenRandomEventModal}
              />
            ) : null}
          </View>

          <FarmBottomSkirt
            sceneW={sceneW}
            bottomSkirtH={bottomSkirtH}
            skirtTileH={skirtTileH}
            skirtImageH={skirtImageH}
            skirtTileCount={skirtTileCount}
            night={farm.night}
            sceneVariant={farm.sceneVariant}
            onGoToMarket={() => onGoToMarket()}
          />

          <FarmRain
            width={sceneW}
            height={sceneH + bottomSkirtH}
            night={farm.night}
            active={
              focused &&
              !shopOpen &&
              !speaker &&
              !groupOpen &&
              !townOpen &&
              !bagOpen &&
              !lifeOpen &&
              !houseOpen &&
              !gameOpen &&
              farm.weather === "rain"
            }
          />
        </View>
      </ScrollView>

      {mapOverlay}
    </View>
  );
}
