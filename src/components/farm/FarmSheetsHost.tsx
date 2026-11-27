import {
  Suspense,
  lazy,
  type ComponentRef,
  type Dispatch,
  type RefObject,
  type SetStateAction,
} from "react";
import { TextInput, View } from "react-native";

import { FarmButton } from "@/components/farm/FarmSkin";
import {
  eventTime,
  type FarmChatMsg,
  type Speaker,
} from "@/components/farm/farmScreenConstants";
import { farmScreenStyles as st } from "@/components/farm/farmScreenStyles";
import type { CropKind } from "@/components/farm/sprites";
import type { FarmPersistence } from "@/components/farm/useFarmPersistence";
import { DISCUSSION_PROMPT } from "@/utils/farmActions";
import {
  RESIDENTS,
  RESIDENT_IDS,
  type ResidentConversation,
  type ResidentId,
} from "@/utils/farmLife";
import { BAG_TIERS } from "@/utils/farmMarket";
import { isFarmChatContinuation } from "@/utils/farmMemory";
import {
  removeMemoryEpisode,
  removePlayerFact,
} from "@/utils/farmPersonaMemory";
import type { IndoorSleeperId, NightSoloEvent } from "@/utils/farmSleep";
import { compileFarmGazette } from "@/utils/farmTown";
import {
  dismissActiveVisitor,
  emptyVisitorState,
  formatVisitorStayHint,
  inviteVisitorToFarm,
  resolveVisitorDisplayProfile,
  resolveVisitorEmotion,
  visitorFarewellLine,
  type VisitorId,
} from "@/utils/farmVisitors";

/* -------------------------------------------------------------------------- */
/*  全量农场弹窗 / 抽屉懒加载定义（未打开时绝不挂载，亦不提前求值模块）         */
/* -------------------------------------------------------------------------- */

export const LazyFarmMarket = lazy(() =>
  import("./FarmMarket").then((m) => ({ default: m.FarmMarket })),
);
const LazyFarmBag = lazy(() =>
  import("./FarmMarket").then((m) => ({ default: m.FarmBag })),
);
const LazyFarmPersonalChatSheet = lazy(() =>
  import("./FarmSceneHelpers").then((m) => ({
    default: m.FarmPersonalChatSheet,
  })),
);
const LazyFarmGroupChatSheet = lazy(() =>
  import("./FarmGroupChatSheet").then((m) => ({
    default: m.FarmGroupChatSheet,
  })),
);
const LazyFarmTownBoard = lazy(() =>
  import("./FarmTownBoard").then((m) => ({ default: m.FarmTownBoard })),
);
const LazyFarmVisitorSheet = lazy(() =>
  import("./FarmVisitorSheet").then((m) => ({ default: m.FarmVisitorSheet })),
);
const LazyFarmFocusModal = lazy(() =>
  import("./FarmFocusModal").then((m) => ({ default: m.FarmFocusModal })),
);
const LazyFarmFestivalSheet = lazy(() =>
  import("./FarmFestivalSheet").then((m) => ({
    default: m.FarmFestivalSheet,
  })),
);
const LazyFarmFishingModal = lazy(() =>
  import("./FarmFishingModal").then((m) => ({ default: m.FarmFishingModal })),
);
const LazyFarmStoryAlbumSheet = lazy(() =>
  import("./FarmStoryAlbumSheet").then((m) => ({
    default: m.FarmStoryAlbumSheet,
  })),
);
const LazyFarmDecorSheet = lazy(() =>
  import("./FarmDecorSheet").then((m) => ({ default: m.FarmDecorSheet })),
);
const LazyHouseInterior = lazy(() =>
  import("./HouseInterior").then((m) => ({ default: m.HouseInterior })),
);
const LazyFarmRandomEventModal = lazy(() =>
  import("./FarmRandomEventModal").then((m) => ({
    default: m.FarmRandomEventModal,
  })),
);
const LazyBugGame = lazy(() =>
  import("./BugGame").then((m) => ({ default: m.BugGame })),
);

export interface FarmSheetsHostProps {
  farm: FarmPersistence;
  now: number;
  selected: CropKind | null;
  chatMaxH: number;
  apiKey: string;
  residentHistory: ResidentConversation[];
  getResidentPosition: (who: ResidentId) => { x: number; y: number } | undefined;
  getResidentMood: (who: ResidentId) => string | undefined;
  showToast: (text: string, durationMs?: number) => void;
  weigangAtPond: boolean;
  sleepingResidents: IndoorSleeperId[];
  nightSoloEvent: NightSoloEvent | null;

  /* Bag */
  bagOpen: boolean;
  bagDetail: string;
  inspectCan: boolean;
  onCloseBag: () => void;

  /* Personal Chat */
  speaker: Speaker | null;
  chatOffline: boolean;
  giftBarOpen: boolean;
  memoryBookOpen: boolean;
  chatBusy: boolean;
  followUp: ResidentConversation | null;
  threads: Record<Speaker, FarmChatMsg[]>;
  draft: string;
  chatHint: string;
  chatInputRef: RefObject<ComponentRef<typeof TextInput> | null>;
  onClosePersonalChat: () => void;
  onToggleGiftBar: () => void;
  onToggleMemoryBook: () => void;
  onOpenGroupChat: (
    members?: readonly ResidentId[],
    seedRecord?: ResidentConversation,
  ) => void;
  onChangeDraft: Dispatch<SetStateAction<string>>;
  onSendChat: (raw: string, followUpRecord?: ResidentConversation) => Promise<void>;

  /* Group Chat */
  groupOpen: boolean;
  groupBusy: boolean;
  groupDraft: string;
  onChangeGroupDraft: (text: string) => void;
  groupOnline: boolean;
  groupHint: string;
  groupTypingLabel: string;
  onCloseGroupChat: () => void;
  onExecuteGroupTurn: (banterOnly: boolean) => Promise<void>;
  onClearGroupChat: () => void;

  /* Town Board */
  townOpen: boolean;
  setTownOpen: Dispatch<SetStateAction<boolean>>;
  gazettePolishing: boolean;
  gazetteError: string;
  setGazetteError: Dispatch<SetStateAction<string>>;
  onCloseTownBoard: () => void;
  onPolishGazette: () => void;
  followedId: ResidentId | null;
  setFollowedId: Dispatch<SetStateAction<ResidentId | null>>;
  onMarkManualDismissedSlot: (slotKey: string) => void;
  onTalkResident: (who: Speaker, pos?: { x: number; y: number }) => void;
  onOpenFocus: () => void;
  onOpenFestival: () => void;
  onOpenFishing: () => void;
  onOpenStories: () => void;
  onOpenDecor: () => void;
  onOpenHouse: () => void;
  onOpenRandomEventModal: () => void;
  onTalkVisitor: (who: VisitorId) => void;

  /* Visitor Sheet */
  visitorSpeaker: VisitorId | null;
  visitorThreads: Record<VisitorId, FarmChatMsg[]>;
  visitorBusy: boolean;
  visitorOnline: boolean;
  visitorHint: string;
  visitorDraft: string;
  onChangeVisitorDraft: (text: string) => void;
  onSendVisitorChat: (override?: string) => Promise<void>;
  onCloseVisitorChat: () => void;

  /* Modals */
  focusOpen: boolean;
  onCloseFocus: () => void;
  festivalOpen: boolean;
  onCloseFestival: () => void;
  fishingOpen: boolean;
  onCloseFishing: () => void;
  storiesOpen: boolean;
  onCloseStories: () => void;
  decorOpen: boolean;
  onCloseDecor: () => void;
  houseOpen: boolean;
  onCloseHouse: () => void;
  randomEventModalOpen: boolean;
  onDismissRandomEvent: () => void;
  gameOpen: boolean;
  gameToken: number;
  onCloseGame: () => void;
}

export function FarmSheetsHost({
  farm,
  now,
  selected,
  chatMaxH,
  apiKey,
  residentHistory,
  getResidentPosition,
  getResidentMood,
  showToast,
  weigangAtPond,
  sleepingResidents,
  nightSoloEvent,
  bagOpen,
  bagDetail,
  inspectCan,
  onCloseBag,
  speaker,
  chatOffline,
  giftBarOpen,
  memoryBookOpen,
  chatBusy,
  followUp,
  threads,
  draft,
  chatHint,
  chatInputRef,
  onClosePersonalChat,
  onToggleGiftBar,
  onToggleMemoryBook,
  onOpenGroupChat,
  onChangeDraft,
  onSendChat,
  groupOpen,
  groupBusy,
  groupDraft,
  onChangeGroupDraft,
  groupOnline,
  groupHint,
  groupTypingLabel,
  onCloseGroupChat,
  onExecuteGroupTurn,
  onClearGroupChat,
  townOpen,
  setTownOpen,
  gazettePolishing,
  gazetteError,
  setGazetteError,
  onCloseTownBoard,
  onPolishGazette,
  followedId,
  setFollowedId,
  onMarkManualDismissedSlot,
  onTalkResident,
  onOpenFocus,
  onOpenFestival,
  onOpenFishing,
  onOpenStories,
  onOpenDecor,
  onOpenHouse,
  onOpenRandomEventModal,
  onTalkVisitor,
  visitorSpeaker,
  visitorThreads,
  visitorBusy,
  visitorOnline,
  visitorHint,
  visitorDraft,
  onChangeVisitorDraft,
  onSendVisitorChat,
  onCloseVisitorChat,
  focusOpen,
  onCloseFocus,
  festivalOpen,
  onCloseFestival,
  fishingOpen,
  onCloseFishing,
  storiesOpen,
  onCloseStories,
  decorOpen,
  onCloseDecor,
  houseOpen,
  onCloseHouse,
  randomEventModalOpen,
  onDismissRandomEvent,
  gameOpen,
  gameToken,
  onCloseGame,
}: FarmSheetsHostProps) {
  return (
    <Suspense fallback={null}>
      {bagOpen ? (
        <LazyFarmBag
          visible
          close={onCloseBag}
          title={BAG_TIERS[farm.gear.bag] + "背包"}
          detail={bagDetail}
          bagTier={farm.gear.bag}
          canTier={farm.canUpgrade}
          capacity={farm.bagCap}
          stacks={farm.stacks}
          selected={selected ? "seed:" + selected + ":0" : null}
          onPick={farm.pickStack}
          actions={
            <View style={st.bagActionsRow}>
              <FarmButton label="收取成熟作物" onPress={farm.bulkHarvest} />
              {inspectCan ? (
                <FarmButton label="给田地浇水" onPress={farm.bulkWater} />
              ) : null}
            </View>
          }
        />
      ) : null}

      {speaker !== null
        ? (() => {
            const chatMemory = farm.memories[speaker];
            const speakerMood =
              chatMemory.mood ?? getResidentMood(speaker) ?? "平静";
            const canContinueChat = chatMemory.turns.some(
              (turn) => !isFarmChatContinuation(turn.player),
            );
            return (
              <LazyFarmPersonalChatSheet
                speaker={speaker}
                speakerName={RESIDENTS[speaker].name}
                speakerMood={speakerMood}
                chatMemory={chatMemory}
                weather={farm.weather}
                rainbow={farm.rainbow}
                period={farm.period}
                now={now}
                chatOffline={chatOffline}
                giftBarOpen={giftBarOpen}
                memoryBookOpen={memoryBookOpen}
                dailyWishes={farm.dailyWishes}
                chatBusy={chatBusy}
                canContinueChat={canContinueChat}
                chatMaxH={chatMaxH}
                economy={farm.economy}
                coins={farm.coins}
                followUp={followUp}
                messages={threads[speaker]}
                draft={draft}
                chatHint={chatHint}
                chatInputRef={chatInputRef}
                onClose={onClosePersonalChat}
                onToggleGiftBar={onToggleGiftBar}
                onToggleMemoryBook={onToggleMemoryBook}
                onOpenGroupWithSpeaker={(whoNow) => {
                  const companions = RESIDENT_IDS.filter(
                    (id) => id !== whoNow,
                  ).slice(0, 2);
                  onOpenGroupChat([whoNow, ...companions]);
                }}
                onInsertDiscussionPrompt={() => {
                  onChangeDraft((previous) =>
                    previous.startsWith(DISCUSSION_PROMPT)
                      ? previous
                      : DISCUSSION_PROMPT + previous,
                  );
                }}
                onSendTopic={(topic) => {
                  void onSendChat(topic);
                }}
                onDeleteFact={(targetWho, key) => {
                  farm.setMemories((prev) => ({
                    ...prev,
                    [targetWho]: removePlayerFact(prev[targetWho], key),
                  }));
                }}
                onDeleteEpisode={(targetWho, id) => {
                  farm.setMemories((prev) => ({
                    ...prev,
                    [targetWho]: removeMemoryEpisode(prev[targetWho], id),
                  }));
                }}
                onGiveCrop={farm.handleGiveCrop}
                onGiveDish={farm.handleGiveDish}
                onFulfillWish={farm.handleFulfillWish}
                onChangeDraft={onChangeDraft}
                onSendDraft={() => {
                  void onSendChat(draft, followUp ?? undefined);
                }}
              />
            );
          })()
        : null}

      {groupOpen ? (
        <LazyFarmGroupChatSheet
          visible
          onClose={onCloseGroupChat}
          members={farm.groupMembers}
          onChangeMembers={farm.setGroupMembers}
          messages={farm.groupMessages}
          busy={groupBusy}
          value={groupDraft}
          onChange={onChangeGroupDraft}
          onSend={() => {
            void onExecuteGroupTurn(false);
          }}
          onBanter={() => {
            void onExecuteGroupTurn(true);
          }}
          onClear={onClearGroupChat}
          online={groupOnline}
          hint={groupHint || undefined}
          typingLabel={groupTypingLabel || undefined}
          maxHeight={chatMaxH}
        />
      ) : null}

      {townOpen ? (
        <LazyFarmTownBoard
          visible
          onClose={onCloseTownBoard}
          town={farm.town}
          gazette={
            farm.town.gazette?.day === farm.day
              ? farm.town.gazette
              : compileFarmGazette({
                  day: farm.day,
                  seasonIndex: farm.season,
                  weather: farm.weather,
                  rainbow: farm.rainbow,
                  history: residentHistory,
                  town: farm.town,
                  memories: farm.memories,
                  studyNote: farm.studyContext.gazetteNote || undefined,
                  at: now,
                })
          }
          needs={farm.farmNeeds}
          memories={farm.memories}
          economy={farm.economy}
          wishes={farm.dailyWishes}
          studyContext={farm.studyContext}
          followedId={followedId}
          at={now}
          hasApiKey={Boolean(apiKey)}
          polishing={gazettePolishing}
          polishError={gazetteError || undefined}
          onRefreshGazette={() => {
            setGazetteError("");
            const fresh = compileFarmGazette({
              day: farm.day,
              seasonIndex: farm.season,
              weather: farm.weather,
              rainbow: farm.rainbow,
              history: residentHistory,
              town: farm.town,
              memories: farm.memories,
              studyNote: farm.studyContext.gazetteNote || undefined,
              at: eventTime(),
            });
            farm.setTown((prev) => ({ ...prev, gazette: fresh }));
          }}
          onPolishGazette={onPolishGazette}
          onDropEvent={(title, detail, mode, hotspot) => {
            const at = eventTime();
            const starter =
              RESIDENT_IDS[Math.floor(Math.random() * RESIDENT_IDS.length)];
            const knownBy = mode === "broadcast" ? [...RESIDENT_IDS] : [starter];
            const nextEvent = {
              id: `event-${at}`,
              title,
              detail,
              kind: "director" as const,
              knownBy,
              hotspot,
              createdAt: at,
              expiresAt: at + 24 * 3600_000,
            };
            farm.setTown((prev) => ({
              ...prev,
              events: [
                ...prev.events.filter((ev) => ev.expiresAt > at),
                nextEvent,
              ].slice(-12),
            }));
            showToast(
              mode === "broadcast"
                ? `全镇广播：「${title}」已传遍全家！`
                : `已悄悄告诉${RESIDENTS[starter].name}，等他们碰面慢慢传开…`,
            );
          }}
          onDeleteEvent={(id) => {
            farm.setTown((prev) => ({
              ...prev,
              events: prev.events.filter((ev) => ev.id !== id),
            }));
          }}
          onSetDuty={(who, duty) => {
            farm.setTown((prev) => {
              const nextDuties = { ...prev.duties };
              if (duty) nextDuties[who] = duty;
              else delete nextDuties[who];
              return { ...prev, duties: nextDuties };
            });
          }}
          onToggleStudyLink={(enabled) => {
            farm.setTown((prev) => ({ ...prev, studyLinkEnabled: enabled }));
            showToast(
              enabled ? "已开启课表节奏温柔联动" : "已关闭课表节奏联动",
            );
          }}
          onFulfillWish={farm.handleFulfillWish}
          onFollowResident={(who) => {
            setFollowedId((prev) => {
              const next = prev === who ? null : who;
              showToast(
                next
                  ? `开始跟拍 ${RESIDENTS[next].name}，可随时点击下方退出`
                  : "已退出跟拍视角",
              );
              return next;
            });
            setTownOpen(false);
          }}
          onTalkResident={(who) => {
            setTownOpen(false);
            onTalkResident(who, getResidentPosition(who));
          }}
          onOpenFocus={() => {
            setTownOpen(false);
            onOpenFocus();
          }}
          onOpenFestival={() => {
            setTownOpen(false);
            onOpenFestival();
          }}
          onOpenFishing={() => {
            setTownOpen(false);
            onOpenFishing();
          }}
          onOpenStories={() => {
            setTownOpen(false);
            onOpenStories();
          }}
          onOpenDecor={() => {
            setTownOpen(false);
            onOpenDecor();
          }}
          storyBadgeCount={farm.storyBadgeCount}
          visitorState={farm.visitorState}
          activeVisitor={farm.activeNormalVisitor}
          activeVisit={farm.activeVisitorVisit}
          whaleSync={farm.whaleSync}
          activeRandomEvent={farm.activeRandomEvent}
          onTriggerRandomEvent={() => farm.handleTriggerRandomEvent(true)}
          onOpenRandomEvent={() => {
            setTownOpen(false);
            onOpenRandomEventModal();
          }}
          sleepingResidents={sleepingResidents}
          nightSoloEvent={nightSoloEvent}
          onInviteVisitor={(who) => {
            const at = eventTime();
            if (farm.activeVisitorVisit)
              onMarkManualDismissedSlot(farm.activeVisitorVisit.slotKey);
            const displayProfile = resolveVisitorDisplayProfile(
              who,
              farm.whaleSync,
            );
            farm.setTown((prev) => ({
              ...prev,
              visitors: inviteVisitorToFarm(
                prev.visitors ?? emptyVisitorState(),
                who,
                at,
              ),
            }));
            setTownOpen(false);
            showToast(
              who === "dafeiyu"
                ? `已邀请「${displayProfile.name}」从课表来农场串门 45 分钟啦！`
                : `已邀请 door 的室友「${displayProfile.name}」来农场串门 45 分钟啦！`,
            );
          }}
          onTalkVisitor={(who) => {
            setTownOpen(false);
            onTalkVisitor(who);
          }}
          onDismissVisitor={() => {
            const res = dismissActiveVisitor(farm.visitorState, now);
            if (!res.departed) return;
            if (farm.activeVisitorVisit)
              onMarkManualDismissedSlot(farm.activeVisitorVisit.slotKey);
            farm.setTown((prev) => ({
              ...prev,
              visitors: dismissActiveVisitor(
                prev.visitors ?? emptyVisitorState(),
                now,
              ).nextState,
            }));
            if (visitorSpeaker === res.departed) onCloseVisitorChat();
            setTownOpen(false);
            showToast(visitorFarewellLine(res.departed, farm.whaleSync));
          }}
          onToggleHorror={(enabled) => {
            farm.setTown((prev) => ({
              ...prev,
              visitors: {
                ...(prev.visitors ?? emptyVisitorState()),
                horrorEnabled: enabled,
                ...(enabled ? {} : { horrorActive: false }),
              },
            }));
            showToast(
              enabled
                ? "已开启深夜「恐怖徐睡阴」恐怖彩蛋"
                : "已关闭深夜恐怖徐睡阴彩蛋",
            );
          }}
          onSummonHorror={() => {
            if (farm.visitorState.horrorActive) {
              setTownOpen(false);
              onTalkVisitor("dark_xushuiyin");
            } else {
              farm.summonHorrorVisitor();
            }
          }}
          onOpenHouseWake={() => {
            setTownOpen(false);
            onOpenHouse();
          }}
          maxHeight={chatMaxH}
        />
      ) : null}

      {visitorSpeaker !== null ? (
        <LazyFarmVisitorSheet
          visible
          who={visitorSpeaker}
          record={
            visitorSpeaker !== "dark_xushuiyin"
              ? farm.visitorState.records[visitorSpeaker]
              : undefined
          }
          messages={visitorThreads[visitorSpeaker]}
          busy={visitorBusy}
          online={visitorOnline}
          hint={visitorHint || undefined}
          draft={visitorDraft}
          onChangeDraft={onChangeVisitorDraft}
          onSend={(override) => {
            void onSendVisitorChat(override);
          }}
          economy={farm.economy}
          coins={farm.coins}
          onGiveCrop={farm.handleVisitorGiveCrop}
          onGiveDish={farm.handleVisitorGiveDish}
          onBanishHorror={farm.handleBanishHorror}
          onDismissVisitor={
            farm.activeVisitorVisit &&
            visitorSpeaker === farm.activeVisitorVisit.who
              ? () => {
                  const res = dismissActiveVisitor(farm.visitorState, now);
                  if (!res.departed) {
                    onCloseVisitorChat();
                    return;
                  }
                  onMarkManualDismissedSlot(farm.activeVisitorVisit!.slotKey);
                  farm.setTown((prev) => ({
                    ...prev,
                    visitors: dismissActiveVisitor(
                      prev.visitors ?? emptyVisitorState(),
                      now,
                    ).nextState,
                  }));
                  onCloseVisitorChat();
                  showToast(visitorFarewellLine(res.departed, farm.whaleSync));
                }
              : undefined
          }
          stayHint={
            farm.activeVisitorVisit &&
            visitorSpeaker === farm.activeVisitorVisit.who
              ? formatVisitorStayHint(farm.activeVisitorVisit)
              : undefined
          }
          onClose={onCloseVisitorChat}
          maxHeight={chatMaxH}
          weather={farm.weather}
          rainbow={farm.rainbow}
          whaleSync={farm.whaleSync}
          emotion={resolveVisitorEmotion(
            visitorSpeaker,
            farm.visitorState,
            farm.whaleSync,
            now,
          )}
        />
      ) : null}

      {focusOpen ? (
        <LazyFarmFocusModal
          visible
          onClose={onCloseFocus}
          stats={farm.focusStats}
          onComplete={farm.handleCompleteFocus}
        />
      ) : null}

      {festivalOpen ? (
        <LazyFarmFestivalSheet
          visible
          onClose={onCloseFestival}
          festival={farm.activeFestival}
          economy={farm.economy}
          coins={farm.coins}
          postcards={farm.postcards}
          onHost={farm.handleHostFestival}
          maxHeight={chatMaxH}
        />
      ) : null}

      {fishingOpen ? (
        <LazyFarmFishingModal
          visible
          onClose={onCloseFishing}
          period={farm.period}
          weigangNearby={weigangAtPond}
          book={farm.fishingBook}
          onCatch={farm.handleFishingCatch}
          onSellFish={farm.handleSellFish}
          onCookFishSoup={farm.handleCookFishSoup}
        />
      ) : null}

      {storiesOpen ? (
        <LazyFarmStoryAlbumSheet
          visible
          onClose={onCloseStories}
          progress={farm.storyProgress}
          memories={farm.memories}
          onClaimChapter={farm.handleClaimStoryChapter}
          maxHeight={chatMaxH}
        />
      ) : null}

      {decorOpen ? (
        <LazyFarmDecorSheet
          visible
          onClose={onCloseDecor}
          decor={farm.decorState}
          coins={farm.coins}
          onBuy={farm.handleBuyDecor}
          onTogglePlace={farm.handleToggleDecor}
          maxHeight={chatMaxH}
        />
      ) : null}

      {houseOpen ? (
        <LazyHouseInterior
          visible
          night={farm.night}
          day={farm.day}
          clock={farm.clock}
          hour={new Date(now).getHours()}
          sleepingResidents={sleepingResidents}
          tuckedInIds={farm.tuckedIdsToday}
          sleepDeprived={farm.sleepDeprived}
          onClose={onCloseHouse}
          onSleep={farm.doSleep}
          onWakeResident={farm.handleWakeResident}
          onTuckInResident={farm.handleTuckInResident}
          onOpenFocus={() => {
            onCloseHouse();
            onOpenFocus();
          }}
        />
      ) : null}

      {randomEventModalOpen && farm.activeRandomEvent !== null ? (
        <LazyFarmRandomEventModal
          visible
          event={farm.activeRandomEvent}
          onSelect={farm.handleResolveRandomEvent}
          onDismiss={onDismissRandomEvent}
        />
      ) : null}

      {gameOpen ? (
        <LazyBugGame
          key={gameToken}
          visible
          onClose={onCloseGame}
          onFinish={farm.finishBugGame}
        />
      ) : null}
    </Suspense>
  );
}
