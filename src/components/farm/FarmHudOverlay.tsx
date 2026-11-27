import { FarmReturnSummary } from "@/components/farm/FarmReturnSummary";
import {
  FarmHeaderBar,
  FarmMapOverlays,
  FarmShopSectionContent,
} from "@/components/farm/FarmSceneHelpers";
import { eventTime } from "@/components/farm/farmScreenConstants";
import type { CropKind } from "@/components/farm/sprites";
import { playSfx } from "@/services/soundEffects";
import type { CoopSupply } from "@/utils/farmCoop";
import { consume, type Economy, type Recipe } from "@/utils/farmEconomy";
import type { ResidentId } from "@/utils/farmLife";
import type { BagStack, FarmGear, Offer, Vendor } from "@/utils/farmMarket";
import {
  claimGoal,
  realDate,
  type FarmActivity,
  type FarmJournal,
} from "@/utils/farmProgress";
import type { FarmPeriod, FarmWeather, TownEvent } from "@/utils/farmTown";

export interface FarmTopHudProps {
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
}

export function FarmTopHud({
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
}: FarmTopHudProps) {
  return (
    <FarmHeaderBar
      insetTop={insetTop}
      shopOpen={shopOpen}
      level={level}
      day={day}
      seasonName={seasonName}
      clock={clock}
      periodLabel={periodLabel}
      coins={coins}
      sfxOn={sfxOn}
      lifeOpen={lifeOpen}
      hasUnreadReports={hasUnreadReports}
      onLayoutHeight={onLayoutHeight}
      onBack={onBack}
      onToggleSfx={() => {
        const next = !sfxOn;
        onToggleSfx();
        if (next) {
          playSfx("farm_harvest", {
            ignoreCooldown: true,
            bypassToggle: true,
            volume: 0.65,
          });
        }
      }}
      onOpenSettings={onOpenSettings}
    />
  );
}

export interface FarmMapHudProps {
  recap: { mature: number[]; orders: CropKind[]; reports: number } | null;
  recapHidden: boolean;
  recapManuallyOpen: boolean;
  onRecapVisibleChange: (visible: boolean) => void;
  onCloseRecap: () => void;
  onScrollToCrop: (index: number) => void;
  onOpenOrders: () => void;
  onOpenReports: () => void;
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
  activeEvents: TownEvent[];
  onTalkFollowed: (who: ResidentId) => void;
  onStopFollow: () => void;
}

export function FarmMapHud({
  recap,
  recapHidden,
  recapManuallyOpen,
  onRecapVisibleChange,
  onCloseRecap,
  onScrollToCrop,
  onOpenOrders,
  onOpenReports,
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
}: FarmMapHudProps) {
  return (
    <>
      {recap ? (
        <FarmReturnSummary
          items={recap}
          hidden={recapHidden}
          manuallyOpen={recapManuallyOpen}
          onVisibleChange={onRecapVisibleChange}
          onClose={onCloseRecap}
          onCrops={onScrollToCrop}
          onOrders={onOpenOrders}
          onReports={onOpenReports}
        />
      ) : null}

      <FarmMapOverlays
        toast={toast}
        sceneW={sceneW}
        hudOverlayH={hudOverlayH}
        showHorrorBanner={showHorrorBanner}
        onOpenHorror={onOpenHorror}
        followedId={followedId}
        showFollowBar={showFollowBar}
        period={period}
        weather={weather}
        rainbow={rainbow}
        activeEvents={activeEvents}
        onTalkFollowed={onTalkFollowed}
        onStopFollow={onStopFollow}
      />
    </>
  );
}

export interface FarmShopSectionHostProps {
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
  stacks: BagStack[];
  compost: number;
  vendorPrice: (vendor: Vendor, price: number) => number;
  beginVendorAction: (vendor: Vendor) => boolean;
  onSmithService: (
    service: "bag" | "can" | "bagRepair" | "canRepair" | "hoe",
  ) => void;
  onImproveIrrigation: (vendor?: Vendor) => void;
  onBuyCoopSupply: (id: CoopSupply) => void;
  onBuyOffer: (vendor: Vendor, offer: Offer) => void;
  onUpdateEconomy: (updater: (prev: Economy) => Economy) => void;
  onAddCoins: (delta: number) => void;
  onUpdateGear: (updater: (prev: FarmGear) => FarmGear) => void;
  onUpdateJournal: (next: FarmJournal) => void;
  onSelectCompostFromShop: () => void;
  onSellStock: (kind: CropKind) => void;
  onDeliverOrder: (kind: CropKind) => void;
  onMakeRecipe: (recipe: Recipe) => void;
  onBuildKitchen: () => void;
  onRescueSeeds: () => void;
}

export function FarmShopSectionHost({
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
  beginVendorAction,
  onSmithService,
  onImproveIrrigation,
  onBuyCoopSupply,
  onBuyOffer,
  onUpdateEconomy,
  onAddCoins,
  onUpdateGear,
  onUpdateJournal,
  onSelectCompostFromShop,
  onSellStock,
  onDeliverOrder,
  onMakeRecipe,
  onBuildKitchen,
  onRescueSeeds,
}: FarmShopSectionHostProps) {
  return (
    <FarmShopSectionContent
      vendor={vendor}
      section={section}
      journal={journal}
      now={now}
      gear={gear}
      canUpgrade={canUpgrade}
      bagCap={bagCap}
      economy={economy}
      coins={coins}
      level={level}
      season={season}
      seeds={seeds}
      stacks={stacks}
      compost={compost}
      vendorPrice={vendorPrice}
      onSmithService={onSmithService}
      onImproveIrrigation={onImproveIrrigation}
      onBuyCoopSupply={onBuyCoopSupply}
      onBuyOffer={onBuyOffer}
      onResolveRequest={({
        vendor: targetVendor,
        date,
        requestCrop,
        amount,
        reward,
        request,
      }) => {
        if (
          !beginVendorAction(targetVendor) ||
          realDate(eventTime()) !== date ||
          request?.delivered
        )
          return;
        if (request) {
          const rest = consume(economy.inventory[requestCrop], amount);
          if (!rest) return;
          onUpdateEconomy((e) => ({
            ...e,
            inventory: { ...e.inventory, [requestCrop]: rest },
          }));
          onAddCoins(reward);
        }
        onUpdateGear((g) => ({
          ...g,
          requests: {
            ...g.requests,
            [targetVendor]: { day: date, delivered: Boolean(request) },
          },
        }));
      }}
      onClaimGoal={(targetVendor, goal: FarmActivity) => {
        if (!beginVendorAction(targetVendor)) return;
        const result = claimGoal(journal, goal, eventTime());
        onUpdateJournal(result.journal);
        if (result.reward) {
          onAddCoins(result.reward);
          playSfx("farm_level_up", { volume: 0.74 });
        }
      }}
      onSelectCompost={(targetVendor) => {
        if (!beginVendorAction(targetVendor)) return;
        onSelectCompostFromShop();
      }}
      onSellStock={onSellStock}
      onDeliverOrder={onDeliverOrder}
      onMakeRecipe={onMakeRecipe}
      onBuildKitchen={onBuildKitchen}
      onRescueSeeds={onRescueSeeds}
    />
  );
}
