import Ionicons from '@expo/vector-icons/Ionicons';
import { useState } from 'react';
import { Pressable, ScrollView, Switch, TextInput, View } from 'react-native';
import { CROP_LABELS, stockCount, type Economy } from '@/utils/farmEconomy';
import { RESIDENTS, RESIDENT_IDS, type ResidentId } from '@/utils/farmLife';
import { getResidentEmotion, type FarmMemories } from '@/utils/farmMemory';
import { describeFarmEmotion } from '@/utils/farmEmotion';
import type { FarmRandomEventDef } from '@/utils/farmRandomEvents';
import { FarmEmotionMeter } from './FarmEmotionMeter';
import type { ResidentWish } from '@/utils/farmSocial';
import type { FarmStudyContext } from '@/utils/farmStudyLink';
import {
  DIRECTOR_EVENT_PRESETS,
  RESIDENT_DUTIES,
  residentCurrentSchedule,
  type FarmGazette,
  type FarmNeedsSnapshot,
  type FarmTownState,
  type ResidentDuty,
} from '@/utils/farmTown';
import { CropSprite, FarmPropSprite, FarmToolSprite, FarmUiIcon } from './CropSprite';
import { FarmNPCSheet } from './FarmNPCSheet';
import { FarmPersonSprite } from './FarmPersonSprite';
import { FarmVisitorSprite } from './FarmVisitorSprite';
import { FarmRelationGraph } from './FarmRelationGraph';
import { FARM_BODY_FONT, FarmButton, FarmIllustration, FarmParchmentCard, FarmSlotFrame, FarmText } from './FarmSkin';
import {
  formatVisitorStayHint,
  getTodayVisitorSchedule,
  NORMAL_VISITOR_IDS,
  isFarmSleepDeprived,
  resolveVisitorDisplayProfile,
  resolveVisitorEmotion,
  resolveVisitorVisit,
  type FarmVisitorState,
  type NormalVisitorId,
  type VisitorVisitInfo,
  type WhaleVisitorSyncContext,
} from '@/utils/farmVisitors';
import type { NightSoloEvent } from '@/utils/farmSleep';

type BoardTab = 'gazette' | 'relations' | 'events' | 'routines' | 'visitors';

const DUTY_KEYS: (ResidentDuty | null)[] = [null, 'water', 'repair', 'harvest', 'fish', 'bugs'];

export function FarmTownBoard({
  visible,
  onClose,
  town,
  gazette,
  needs,
  memories,
  economy,
  wishes,
  studyContext,
  followedId,
  at,
  hasApiKey,
  polishing,
  polishError,
  onRefreshGazette,
  onPolishGazette,
  onDropEvent,
  onDeleteEvent,
  onSetDuty,
  onToggleStudyLink,
  onFulfillWish,
  onFollowResident,
  onTalkResident,
  onOpenFocus,
  onOpenFestival,
  onOpenFishing,
  onOpenStories,
  onOpenDecor,
  storyBadgeCount = 0,
  visitorState,
  activeVisitor,
  activeVisit,
  whaleSync,
  activeRandomEvent,
  onTriggerRandomEvent,
  onOpenRandomEvent,
  sleepingResidents = [],
  nightSoloEvent,
  onInviteVisitor,
  onTalkVisitor,
  onDismissVisitor,
  onToggleHorror,
  onSummonHorror,
  onOpenHouseWake,
  maxHeight,
}: {
  visible: boolean;
  onClose: () => void;
  town: FarmTownState;
  gazette: FarmGazette;
  needs: FarmNeedsSnapshot;
  memories: FarmMemories;
  economy: Economy;
  wishes: ResidentWish[];
  studyContext: FarmStudyContext;
  followedId: ResidentId | null;
  at: number;
  hasApiKey: boolean;
  polishing: boolean;
  polishError?: string;
  onRefreshGazette: () => void;
  onPolishGazette: () => void;
  onDropEvent: (title: string, detail: string, mode: 'rumor' | 'broadcast', hotspot?: 'plaza' | 'pond' | 'marketDoor' | 'houseDoor' | 'pondBench') => void;
  onDeleteEvent: (id: string) => void;
  onSetDuty: (who: ResidentId, duty: ResidentDuty | null) => void;
  onToggleStudyLink: (enabled: boolean) => void;
  onFulfillWish: (wish: ResidentWish) => void;
  onFollowResident: (who: ResidentId) => void;
  onTalkResident: (who: ResidentId) => void;
  onOpenFocus?: () => void;
  onOpenFestival?: () => void;
  onOpenFishing?: () => void;
  onOpenStories?: () => void;
  onOpenDecor?: () => void;
  storyBadgeCount?: number;
  visitorState?: FarmVisitorState;
  activeVisitor?: NormalVisitorId | null;
  activeVisit?: VisitorVisitInfo | null;
  whaleSync?: WhaleVisitorSyncContext;
  activeRandomEvent?: FarmRandomEventDef | null;
  onTriggerRandomEvent?: () => void;
  onOpenRandomEvent?: () => void;
  sleepingResidents?: readonly ResidentId[];
  nightSoloEvent?: NightSoloEvent | null;
  onInviteVisitor?: (who: NormalVisitorId) => void;
  onTalkVisitor?: (who: NormalVisitorId) => void;
  onDismissVisitor?: () => void;
  onToggleHorror?: (enabled: boolean) => void;
  onSummonHorror?: () => void;
  onOpenHouseWake?: () => void;
  maxHeight: number;
}) {
  const [tab, setTab] = useState<BoardTab>('gazette');
  const [eventTitle, setEventTitle] = useState('');
  const [eventDetail, setEventDetail] = useState('');
  const [selectedHotspot, setSelectedHotspot] = useState<'plaza' | 'pond' | 'marketDoor' | 'houseDoor' | 'pondBench'>('plaza');
  const activeEvents = town.events.filter(ev => ev.expiresAt > at);

  const submitCustomEvent = (mode: 'rumor' | 'broadcast') => {
    const title = eventTitle.trim();
    if (!title) return;
    const detail = eventDetail.trim() || `农场里刚传出新动静：${title}，家人们可以聊聊或一起准备。`;
    onDropEvent(title.slice(0, 40), detail.slice(0, 120), mode, selectedHotspot);
    setEventTitle('');
    setEventDetail('');
  };

  return (
    <FarmNPCSheet visible={visible} onClose={onClose}>
      <View
        style={{
          borderTopLeftRadius: 24,
          borderTopRightRadius: 24,
          backgroundColor: '#FFF9EF',
          flexShrink: 1,
          overflow: 'hidden',
        }}
      >
        <View style={{ paddingHorizontal: 14, paddingTop: 10 }}>
          <FarmIllustration theme="town" />
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingTop: 8, paddingBottom: 6, gap: 8 }}>
          <FarmSlotFrame size={36} rarity={4}>
            <FarmUiIcon name="gazette" size={22} />
          </FarmSlotFrame>
          <View style={{ flex: 1 }}>
            <FarmText variant="title" style={{ color: '#59432E', fontSize: 16, fontWeight: '800' }}>
              AI 小镇公告板
            </FarmText>
            <FarmText style={{ color: '#8A785E', fontSize: 10.5, marginTop: 1 }}>
              第 {needs.day} 天 · {needs.rainbow ? '雨后彩虹' : needs.weather === 'rain' ? '细雨绵绵' : '微风晴朗'} · {activeEvents.length} 条流传事件
            </FarmText>
          </View>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="关闭AI小镇公告板"
            onPress={onClose}
            hitSlop={8}
            style={{ width: 28, height: 28, borderRadius: 8, alignItems: 'center', justifyContent: 'center', backgroundColor: '#F3E6D0', borderWidth: 1, borderColor: '#DFCCA9' }}
          >
            <Ionicons name="close" size={16} color="#8B7254" />
          </Pressable>
        </View>

        {/* 小镇特色玩法快捷像素卡片栏（模块 A~E） */}
        {(onOpenFocus || onOpenFestival || onOpenFishing || onOpenStories || onOpenDecor) ? (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ gap: 7, paddingHorizontal: 14, paddingBottom: 8 }}
          >
            {onOpenFocus ? (
              <Pressable
                onPress={onOpenFocus}
                style={{ flexDirection: 'row', alignItems: 'center', gap: 5, paddingLeft: 4, paddingRight: 10, paddingVertical: 4, borderRadius: 12, backgroundColor: '#F6EADB', borderWidth: 1, borderColor: '#DEC49D' }}
              >
                <FarmSlotFrame size={28} rarity={2}><FarmPropSprite name="focus" size={20} /></FarmSlotFrame>
                <FarmText style={{ color: '#543E27', fontSize: 11, fontWeight: '800' }}>伴读钟</FarmText>
              </Pressable>
            ) : null}
            {onOpenFestival ? (
              <Pressable
                onPress={onOpenFestival}
                style={{ flexDirection: 'row', alignItems: 'center', gap: 5, paddingLeft: 4, paddingRight: 10, paddingVertical: 4, borderRadius: 12, backgroundColor: '#F8EAD7', borderWidth: 1, borderColor: '#DFBF95' }}
              >
                <FarmSlotFrame size={28} rarity={4}><FarmPropSprite name="campfire" size={20} /></FarmSlotFrame>
                <FarmText style={{ color: '#6E421F', fontSize: 11, fontWeight: '800' }}>篝火节庆</FarmText>
              </Pressable>
            ) : null}
            {onOpenFishing ? (
              <Pressable
                onPress={onOpenFishing}
                style={{ flexDirection: 'row', alignItems: 'center', gap: 5, paddingLeft: 4, paddingRight: 10, paddingVertical: 4, borderRadius: 12, backgroundColor: '#EAF2EE', borderWidth: 1, borderColor: '#B8D0C6' }}
              >
                <FarmSlotFrame size={28} rarity={2}><FarmPropSprite name="rod" size={20} /></FarmSlotFrame>
                <FarmText style={{ color: '#395C53', fontSize: 11, fontWeight: '800' }}>池塘钓鱼</FarmText>
              </Pressable>
            ) : null}
            {onOpenStories ? (
              <Pressable
                onPress={onOpenStories}
                style={{ flexDirection: 'row', alignItems: 'center', gap: 5, paddingLeft: 4, paddingRight: 10, paddingVertical: 4, borderRadius: 12, backgroundColor: '#F6E8DE', borderWidth: 1, borderColor: '#DEBEA8' }}
              >
                <FarmSlotFrame size={28} rarity={storyBadgeCount > 0 ? 5 : 3} selected={storyBadgeCount > 0}>
                  <FarmPropSprite name="album" size={20} />
                </FarmSlotFrame>
                <FarmText style={{ color: '#694331', fontSize: 11, fontWeight: '800' }}>
                  支线相册{storyBadgeCount > 0 ? `(${storyBadgeCount})` : ''}
                </FarmText>
              </Pressable>
            ) : null}
            {onOpenDecor ? (
              <Pressable
                onPress={onOpenDecor}
                style={{ flexDirection: 'row', alignItems: 'center', gap: 5, paddingLeft: 4, paddingRight: 10, paddingVertical: 4, borderRadius: 12, backgroundColor: '#EEF2E1', borderWidth: 1, borderColor: '#C2D2A5' }}
              >
                <FarmSlotFrame size={28} rarity={4}><FarmPropSprite name="windmill" size={20} /></FarmSlotFrame>
                <FarmText style={{ color: '#455A31', fontSize: 11, fontWeight: '800' }}>庭院装扮</FarmText>
              </Pressable>
            ) : null}
          </ScrollView>
        ) : null}

        <View style={{ flexDirection: 'row', gap: 4, paddingHorizontal: 14, paddingBottom: 10 }}>
          {([
            ['gazette', '日报'],
            ['relations', `心愿${wishes.some(w => !w.fulfilled) ? `(${wishes.filter(w => !w.fulfilled).length})` : ''}`],
            ['visitors', visitorState?.horrorActive ? '访客!' : '访客'],
            ['events', `传闻${activeEvents.length ? `(${activeEvents.length})` : ''}`],
            ['routines', '作息'],
          ] as [BoardTab, string][]).map(([key, label]) => {
            const active = tab === key;
            return (
              <Pressable
                key={key}
                accessibilityRole="button"
                accessibilityState={{ selected: active }}
                onPress={() => setTab(key)}
                style={{
                  flex: 1,
                  paddingVertical: 8,
                  borderRadius: 11,
                  alignItems: 'center',
                  backgroundColor: active ? '#DCE7C7' : '#F4EAD8',
                  borderWidth: 1.2,
                  borderBottomWidth: active ? 2.4 : 1.5,
                  borderColor: active ? '#91A872' : '#DECBB0',
                }}
              >
                <FarmText style={{ color: active ? '#394D28' : '#7B664C', fontSize: 11, fontWeight: active ? '800' : '600' }}>
                  {label}
                </FarmText>
              </Pressable>
            );
          })}
        </View>

        <ScrollView
          style={{ maxHeight: Math.max(230, maxHeight + 22) }}
          contentContainerStyle={{ paddingHorizontal: 14, paddingBottom: 20, gap: 12 }}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {tab === 'gazette' ? (
            <>
              <FarmParchmentCard style={{ padding: 14, gap: 8 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderBottomWidth: 2, borderBottomColor: '#D6BE99', paddingBottom: 7 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    <FarmUiIcon name="gazette" size={18} />
                    <FarmText variant="title" style={{ color: '#5A412A', fontSize: 14.5, fontWeight: '800' }}>
                      《doordoor 农场日报》
                    </FarmText>
                  </View>
                  <View style={{ paddingHorizontal: 7, paddingVertical: 2, borderRadius: 99, backgroundColor: gazette.aiPolished ? '#E2EBD0' : '#EFE3CD' }}>
                    <FarmText style={{ color: gazette.aiPolished ? '#455D30' : '#8A7459', fontSize: 9.5, fontWeight: '700' }}>
                      {gazette.aiPolished ? 'AI 主编润色' : '实时速报'}
                    </FarmText>
                  </View>
                </View>

                <FarmText style={{ color: '#45311E', fontSize: 15.5, fontWeight: '800', lineHeight: 22 }}>
                  {gazette.headline}
                </FarmText>
                <FarmText style={{ color: '#846E53', fontSize: 11 }}>
                  {gazette.subhead}
                </FarmText>

                <View style={{ gap: 7, marginTop: 4 }}>
                  {gazette.stories.map((story, idx) => (
                    <View key={`story-${idx}`} style={{ flexDirection: 'row', gap: 7, alignItems: 'flex-start' }}>
                      <FarmText style={{ color: '#6E854E', fontSize: 12, fontWeight: '800' }}>◆</FarmText>
                      <FarmText style={{ flex: 1, color: '#533F2B', fontSize: 12.5, lineHeight: 19 }}>{story}</FarmText>
                    </View>
                  ))}
                </View>

                <View style={{ marginTop: 4, padding: 9, borderRadius: 10, backgroundColor: '#EDF2E1', borderWidth: 1, borderColor: '#CBD8B5', flexDirection: 'row', alignItems: 'center', gap: 7 }}>
                  <FarmUiIcon name="coin" size={17} />
                  <FarmText style={{ flex: 1, color: '#485B36', fontSize: 11.5, lineHeight: 17 }}>
                    {gazette.marketTip}
                  </FarmText>
                </View>
              </FarmParchmentCard>

              <View style={{ flexDirection: 'row', gap: 8 }}>
                <View style={{ flex: 1 }}>
                  <FarmButton label="刷新实时简报" tone="paper" onPress={onRefreshGazette} />
                </View>
                <View style={{ flex: 1 }}>
                  <FarmButton
                    label={polishing ? '主编润色中…' : hasApiKey ? 'AI 润色头条' : '配置 Key 可润色'}
                    tone="sage"
                    disabled={!hasApiKey || polishing}
                    onPress={onPolishGazette}
                  />
                </View>
              </View>
              {polishError ? <FarmText style={{ color: '#A05B45', fontSize: 11 }}>{polishError}</FarmText> : null}
            </>
          ) : null}

          {tab === 'relations' ? (
            <>
              <FarmRelationGraph
                memories={memories}
                followedId={followedId}
                onFollow={onFollowResident}
                onTalk={onTalkResident}
              />

              <View style={{ gap: 7 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
                  <FarmUiIcon name="wish" size={16} />
                  <FarmText variant="label" style={{ color: '#6E563B', fontSize: 12 }}>
                    今日家人心愿便签
                  </FarmText>
                </View>
                {wishes.map(wish => {
                  const held = stockCount(economy.inventory[wish.crop]);
                  const ready = !wish.fulfilled && held >= wish.quantity;
                  return (
                    <FarmParchmentCard
                      key={wish.id}
                      tone={wish.fulfilled ? 'cream' : ready ? 'sage' : 'warm'}
                      style={{
                        flexDirection: 'row',
                        alignItems: 'center',
                        gap: 8,
                        padding: 9,
                        opacity: wish.fulfilled ? 0.72 : 1,
                      }}
                    >
                      <FarmSlotFrame size={38} rarity={1}>
                        <FarmPersonSprite who={wish.resident} size={24} active={false} centered />
                      </FarmSlotFrame>
                      <FarmSlotFrame size={36} rarity={ready ? 4 : 1} selected={ready}>
                        <CropSprite kind={wish.crop} size={24} />
                      </FarmSlotFrame>
                      <View style={{ flex: 1, gap: 2 }}>
                        <FarmText style={{ color: '#513B26', fontSize: 12, fontWeight: '800' }}>
                          {RESIDENTS[wish.resident].name} · {wish.quantity} 份{CROP_LABELS[wish.crop]}
                        </FarmText>
                        <FarmText style={{ color: '#7C674E', fontSize: 10.5, lineHeight: 15 }} numberOfLines={2}>
                          {wish.reason}
                        </FarmText>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, flexWrap: 'wrap' }}>
                          <FarmUiIcon name="coin" size={12} />
                          <FarmText style={{ color: '#8A6329', fontSize: 10, fontWeight: '700' }}>{wish.rewardCoins}</FarmText>
                          <FarmToolSprite kind="compost" size={12} />
                          <FarmText style={{ color: '#5D7043', fontSize: 10, fontWeight: '700' }}>+1 · +8好感</FarmText>
                          {!wish.fulfilled ? (
                            <FarmText style={{ color: ready ? '#4B6935' : '#967F62', fontSize: 10 }}>
                              · 库存 {held}/{wish.quantity}
                            </FarmText>
                          ) : null}
                        </View>
                      </View>
                      <Pressable
                        disabled={!ready}
                        onPress={() => onFulfillWish(wish)}
                        style={{
                          paddingHorizontal: 10,
                          paddingVertical: 7,
                          borderRadius: 99,
                          backgroundColor: wish.fulfilled ? '#E2DDD3' : ready ? '#7D995A' : '#EAE3D5',
                        }}
                      >
                        <FarmText style={{ color: wish.fulfilled ? '#8A7E6E' : ready ? '#FFFDF7' : '#968773', fontSize: 10.5, fontWeight: '700' }}>
                          {wish.fulfilled ? '已实现' : ready ? '送去' : '待收'}
                        </FarmText>
                      </Pressable>
                    </FarmParchmentCard>
                  );
                })}
              </View>

              <FarmParchmentCard tone="warm" style={{ gap: 6 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                  <FarmSlotFrame size={38} rarity={2}>
                    <FarmPropSprite name="focus" size={24} />
                  </FarmSlotFrame>
                  <View style={{ flex: 1 }}>
                    <FarmText style={{ color: '#533E29', fontSize: 13, fontWeight: '800' }}>
                      dark-study 课表温柔联动
                    </FarmText>
                    <FarmText style={{ color: '#846F55', fontSize: 10.5, marginTop: 2 }}>
                      仅在本地感知今日课数与深夜时段，绝不上传课程或成绩明细
                    </FarmText>
                  </View>
                  <Switch
                    accessibilityLabel="课表温柔联动"
                    value={town.studyLinkEnabled !== false}
                    onValueChange={onToggleStudyLink}
                    trackColor={{ false: '#DED3C7', true: '#B8C79F' }}
                    thumbColor={town.studyLinkEnabled !== false ? '#667F50' : '#FFF8EF'}
                  />
                </View>
                {studyContext.enabled && studyContext.gazetteNote ? (
                  <FarmText style={{ color: '#5B6D46', fontSize: 11.5, lineHeight: 17 }}>
                    当前感知：{studyContext.gazetteNote}
                  </FarmText>
                ) : null}
              </FarmParchmentCard>
            </>
          ) : null}

          {tab === 'events' ? (
            <>
              {(activeRandomEvent || onTriggerRandomEvent) ? (
                <FarmParchmentCard tone="sage" style={{ gap: 8, padding: 11 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                    <View style={{ flex: 1 }}>
                      <FarmText style={{ color: '#3E552B', fontSize: 13, fontWeight: '800' }}>
                        {activeRandomEvent ? `✨ 正在发生的奇遇：${activeRandomEvent.title}` : '✨ 农场随机天气奇遇'}
                      </FarmText>
                      <FarmText style={{ color: '#5C6F47', fontSize: 11, marginTop: 2, lineHeight: 16 }}>
                        {activeRandomEvent
                          ? activeRandomEvent.summary
                          : '按晴天、细雨、彩虹与夜晚动态生成互动奇遇，抉择会影响收益与家人四维情绪。'}
                      </FarmText>
                    </View>
                  </View>
                  <View style={{ flexDirection: 'row', gap: 8 }}>
                    {activeRandomEvent && onOpenRandomEvent ? (
                      <FarmButton label="立刻前往参与" tone="sage" onPress={onOpenRandomEvent} style={{ flex: 1, minHeight: 36 }} />
                    ) : null}
                    {onTriggerRandomEvent ? (
                      <FarmButton
                        label={activeRandomEvent ? '换一条奇遇' : '立即触发一条当下奇遇'}
                        tone="paper"
                        onPress={onTriggerRandomEvent}
                        style={{ flex: 1, minHeight: 36 }}
                      />
                    ) : null}
                  </View>
                </FarmParchmentCard>
              ) : null}

              <FarmParchmentCard tone="warm" style={{ gap: 8 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <FarmUiIcon name="wish" size={16} />
                  <FarmText style={{ color: '#59432E', fontSize: 13, fontWeight: '800' }}>
                    导演模式：向小镇投放新鲜事 / 活动
                  </FarmText>
                </View>
                <FarmText style={{ color: '#846F55', fontSize: 11, lineHeight: 17 }}>
                  「悄悄放风」只先告诉 1 位家人，看他们在偶遇聊天里口口相传；「全镇广播」让全员立刻知晓并朝地标聚拢。
                </FarmText>
                <TextInput
                  value={eventTitle}
                  onChangeText={setEventTitle}
                  placeholder="事件标题，如：今晚广场家庭音乐会"
                  placeholderTextColor="#A19077"
                  maxLength={40}
                  style={{
                    fontFamily: FARM_BODY_FONT,
                    backgroundColor: '#FFFDF8',
                    borderRadius: 10,
                    borderWidth: 1,
                    borderColor: '#E0D1BC',
                    paddingHorizontal: 10,
                    paddingVertical: 8,
                    color: '#59432E',
                    fontSize: 12.5,
                  }}
                />
                <TextInput
                  value={eventDetail}
                  onChangeText={setEventDetail}
                  placeholder="补充细节（可选），如：想推玉洁当主唱，唯刚当观众"
                  placeholderTextColor="#A19077"
                  maxLength={120}
                  style={{
                    fontFamily: FARM_BODY_FONT,
                    backgroundColor: '#FFFDF8',
                    borderRadius: 10,
                    borderWidth: 1,
                    borderColor: '#E0D1BC',
                    paddingHorizontal: 10,
                    paddingVertical: 8,
                    color: '#59432E',
                    fontSize: 12,
                  }}
                />
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
                  {([
                    ['plaza', '广场'],
                    ['pond', '池塘'],
                    ['pondBench', '长椅'],
                    ['houseDoor', '小屋'],
                    ['marketDoor', '集市口'],
                  ] as const).map(([spot, label]) => (
                    <Pressable
                      key={spot}
                      onPress={() => setSelectedHotspot(spot)}
                      style={{
                        paddingHorizontal: 9,
                        paddingVertical: 4,
                        borderRadius: 99,
                        backgroundColor: selectedHotspot === spot ? '#DCE6CA' : '#EFE5D5',
                        borderWidth: 1,
                        borderColor: selectedHotspot === spot ? '#A1B484' : '#DFD0BC',
                      }}
                    >
                      <FarmText style={{ color: selectedHotspot === spot ? '#425631' : '#79644C', fontSize: 10.5 }}>
                        地标：{label}
                      </FarmText>
                    </Pressable>
                  ))}
                </View>
                <View style={{ flexDirection: 'row', gap: 8 }}>
                  <View style={{ flex: 1 }}>
                    <FarmButton label="悄悄放风（1人）" tone="paper" disabled={!eventTitle.trim()} onPress={() => submitCustomEvent('rumor')} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <FarmButton label="全镇广播" tone="sage" disabled={!eventTitle.trim()} onPress={() => submitCustomEvent('broadcast')} />
                  </View>
                </View>
              </FarmParchmentCard>

              <View style={{ gap: 6 }}>
                <FarmText variant="label" style={{ color: '#6E563B', fontSize: 12 }}>
                  一键投放热门事件（悄悄放风）
                </FarmText>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
                  {DIRECTOR_EVENT_PRESETS.map(preset => (
                    <Pressable
                      key={preset.title}
                      onPress={() => onDropEvent(preset.title, preset.detail, 'rumor', preset.hotspot as 'plaza' | 'pond' | 'marketDoor' | 'houseDoor' | 'pondBench')}
                      style={{ paddingHorizontal: 10, paddingVertical: 6, borderRadius: 99, backgroundColor: '#F3E9D8', borderWidth: 1, borderColor: '#DFCEB6' }}
                    >
                      <FarmText style={{ color: '#5F4931', fontSize: 11 }}>{preset.title}</FarmText>
                    </Pressable>
                  ))}
                </View>
              </View>

              <View style={{ gap: 8 }}>
                <FarmText variant="label" style={{ color: '#6E563B', fontSize: 12 }}>
                  小镇正在流传（{activeEvents.length}）
                </FarmText>
                {!activeEvents.length ? (
                  <FarmText style={{ color: '#8B775E', fontSize: 12 }}>
                    眼下风平浪静。投一个事件，或者在聊天里跟某位家人说起今晚办聚会，看消息怎么在院子里传开！
                  </FarmText>
                ) : (
                  activeEvents.slice().reverse().map(ev => (
                    <FarmParchmentCard key={ev.id} style={{ gap: 6 }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                        <FarmText style={{ flex: 1, color: '#523C27', fontSize: 13, fontWeight: '800' }}>
                          {ev.title}
                        </FarmText>
                        <Pressable
                          accessibilityLabel="移除事件"
                          hitSlop={8}
                          onPress={() => onDeleteEvent(ev.id)}
                          style={{ width: 22, height: 22, borderRadius: 11, alignItems: 'center', justifyContent: 'center', backgroundColor: '#EFE3D1' }}
                        >
                          <Ionicons name="close" size={12} color="#8D7559" />
                        </Pressable>
                      </View>
                      <FarmText style={{ color: '#6A553E', fontSize: 11.5, lineHeight: 17 }}>{ev.detail}</FarmText>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 2 }}>
                        {RESIDENT_IDS.map(rid => {
                          const knows = ev.knownBy.includes(rid);
                          return (
                            <View key={rid} style={{ opacity: knows ? 1 : 0.28 }}>
                              <FarmSlotFrame size={26} rarity={knows ? 4 : 1}>
                                <FarmPersonSprite who={rid} size={17} active={false} centered />
                              </FarmSlotFrame>
                            </View>
                          );
                        })}
                        <FarmText style={{ flex: 1, textAlign: 'right', color: '#5D7343', fontSize: 10.5, fontWeight: '700' }}>
                          {ev.knownBy.length}/{RESIDENT_IDS.length} 已知晓
                        </FarmText>
                      </View>
                      <View style={{ height: 5, borderRadius: 3, backgroundColor: '#E6DAC6', overflow: 'hidden' }}>
                        <View style={{ height: 5, width: `${Math.round((ev.knownBy.length / RESIDENT_IDS.length) * 100)}%`, backgroundColor: '#7A9957' }} />
                      </View>
                    </FarmParchmentCard>
                  ))
                )}
              </View>
            </>
          ) : null}

          {tab === 'routines' ? (
            <>
              <FarmText style={{ color: '#846F55', fontSize: 11.5, lineHeight: 18 }}>
                居民会按晨/午/傍晚/夜与天气自动安排日常活动，也可以为他们委任长期分工，田干、水壶生锈或作物成熟时会自动搭把手。
              </FarmText>
              {RESIDENT_IDS.map(id => {
                const slot = residentCurrentSchedule(id, needs.period, needs.weather, needs.rainbow, activeEvents);
                const duty = town.duties[id] ?? null;
                const mem = memories[id];
                const emotion = getResidentEmotion(mem, id, at);
                const emDesc = describeFarmEmotion(emotion);
                return (
                  <FarmParchmentCard key={id} tone="warm" style={{ gap: 7, padding: 10 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 9 }}>
                      <FarmSlotFrame size={42} rarity={followedId === id ? 4 : 1} selected={followedId === id}>
                        <FarmPersonSprite who={id} emotionPose={emDesc.pose} size={28} active={false} centered />
                      </FarmSlotFrame>
                      <View style={{ flex: 1, gap: 2 }}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                          <FarmText style={{ color: '#523C27', fontSize: 13.5, fontWeight: '800' }}>
                            {RESIDENTS[id].name}
                          </FarmText>
                          <FarmText style={{ color: '#8A755B', fontSize: 10 }}>
                            好感 {mem.affinity}
                          </FarmText>
                        </View>
                        <FarmText style={{ color: '#69543D', fontSize: 11.5 }}>
                          此刻安排：{slot.activity}
                        </FarmText>
                      </View>
                      <Pressable
                        onPress={() => onFollowResident(id)}
                        style={{
                          flexDirection: 'row',
                          alignItems: 'center',
                          gap: 3,
                          paddingHorizontal: 8,
                          paddingVertical: 5,
                          borderRadius: 99,
                          backgroundColor: followedId === id ? '#F2DFC0' : '#EFE5D3',
                          borderWidth: 1,
                          borderColor: followedId === id ? '#D09446' : '#D9C8AF',
                        }}
                      >
                        <FarmUiIcon name="camera" size={13} />
                        <FarmText style={{ color: '#6E4C24', fontSize: 10.5, fontWeight: '700' }}>
                          {followedId === id ? '停拍' : '跟拍'}
                        </FarmText>
                      </Pressable>
                      <Pressable
                        onPress={() => onTalkResident(id)}
                        style={{ paddingHorizontal: 10, paddingVertical: 5, borderRadius: 99, backgroundColor: '#E4ECD4', borderWidth: 1, borderColor: '#B8C79F' }}
                      >
                        <FarmText style={{ color: '#455B32', fontSize: 10.5, fontWeight: '700' }}>聊聊</FarmText>
                      </Pressable>
                    </View>
                    <FarmEmotionMeter emotion={emotion} compact />
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 5 }}>
                      {DUTY_KEYS.map(key => {
                        const selected = duty === key;
                        return (
                          <Pressable
                            key={String(key)}
                            onPress={() => onSetDuty(id, key)}
                            style={{
                              paddingHorizontal: 9,
                              paddingVertical: 4,
                              borderRadius: 99,
                              backgroundColor: selected ? '#DCE7C7' : '#EFE5D5',
                              borderWidth: 1,
                              borderColor: selected ? '#9CB27C' : '#E0D2BD',
                            }}
                          >
                            <FarmText style={{ color: selected ? '#3E532D' : '#7B664C', fontSize: 10.5, fontWeight: selected ? '700' : '500' }}>
                              {key ? RESIDENT_DUTIES[key].short : '自由活动'}
                            </FarmText>
                          </Pressable>
                        );
                      })}
                    </ScrollView>
                  </FarmParchmentCard>
                );
              })}

              {town.helperLog.length > 0 ? (
                <View style={{ gap: 6, marginTop: 4 }}>
                  <FarmText variant="label" style={{ color: '#6E563B', fontSize: 12 }}>
                    最近 AI 自主帮干活记录（{town.helperLog.length}）
                  </FarmText>
                  {town.helperLog.slice(-6).reverse().map(entry => (
                    <FarmParchmentCard key={entry.id} tone="sage" style={{ paddingHorizontal: 10, paddingVertical: 7 }}>
                      <FarmText style={{ color: '#445732', fontSize: 11.5, lineHeight: 17 }}>
                        {RESIDENTS[entry.actor].name}：{entry.summary}
                      </FarmText>
                    </FarmParchmentCard>
                  ))}
                </View>
              ) : null}
            </>
          ) : null}

          {tab === 'visitors' && visitorState ? (
            <>
              {/* 夜间睡觉状态与独处 emo 速览 */}
              {needs.period === 'night' ? (
                <FarmParchmentCard tone="warm" style={{ gap: 7 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                    <FarmText style={{ color: '#533B25', fontSize: 13, fontWeight: '800' }}>
                      今夜农场睡眠实况
                    </FarmText>
                    {sleepingResidents.length > 0 && onOpenHouseWake ? (
                      <Pressable
                        onPress={onOpenHouseWake}
                        style={{ paddingHorizontal: 10, paddingVertical: 4, borderRadius: 99, backgroundColor: '#E4ECD4', borderWidth: 1, borderColor: '#B5C89A' }}
                      >
                        <FarmText style={{ color: '#425830', fontSize: 10.5, fontWeight: '700' }}>进小屋叫醒</FarmText>
                      </Pressable>
                    ) : null}
                  </View>
                  <FarmText style={{ color: '#786248', fontSize: 11.5, lineHeight: 17 }}>
                    {sleepingResidents.length > 0
                      ? `正在小屋熟睡：${sleepingResidents.map(id => RESIDENTS[id].name).join('、')}。`
                      : '今晚大家都醒着在院子里陪你呢。'}
                    {nightSoloEvent
                      ? `\n今夜院子奇遇：${RESIDENTS[nightSoloEvent.resident].name} 没回屋，正在外面「${nightSoloEvent.badge}」——快去院子里找他聊聊！`
                      : ''}
                  </FarmText>
                </FarmParchmentCard>
              ) : null}

              {/* 4 位常驻串门访客（日内多时段轮换到访、到点自然告辞，也可随时邀请或送别） */}
              <FarmText variant="label" style={{ color: '#6E563B', fontSize: 12 }}>
                农场串门访客（按时段轮流串门 · 到点自然告别，也可随时邀请或送别）
              </FarmText>
              {(() => {
                const liveVisit = activeVisit ?? resolveVisitorVisit(visitorState, at);
                const todaySlots = getTodayVisitorSchedule(visitorState, at);
                return NORMAL_VISITOR_IDS.map(vid => {
                  const profile = resolveVisitorDisplayProfile(vid, whaleSync);
                  const rec = visitorState.records[vid];
                  const isHere = activeVisitor === vid;
                  const vEmotion = resolveVisitorEmotion(vid, visitorState, whaleSync, at);
                  const vDesc = describeFarmEmotion(vEmotion);
                  const activePausedSlot = !isHere ? todaySlots.find(s => s.who === vid && s.status === 'active') : undefined;
                  const nextSlot = todaySlots.find(s => s.who === vid && s.status === 'upcoming');
                  const pastSlot = todaySlots.find(s => s.who === vid && (s.status === 'past' || s.status === 'dismissed'));
                  const scheduleSubtext = isHere && liveVisit
                    ? `${liveVisit.slotLabel} · ${formatVisitorStayHint(liveVisit)}`
                    : activePausedSlot
                      ? `本时段串门档期（${activePausedSlot.timeRangeText} · 邀约结束后继续来访）`
                      : nextSlot
                        ? `预计今日 ${nextSlot.timeRangeText} 来串门`
                        : pastSlot
                          ? `今日已来串过门（${pastSlot.timeRangeText}）`
                          : '可随时邀来限时串门 45 分钟';
                  return (
                    <FarmParchmentCard key={vid} tone={isHere ? 'sage' : 'warm'} style={{ gap: 8, padding: 10 }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                        <FarmSlotFrame size={48} rarity={vid === 'dafeiyu' ? 4 : isHere ? 4 : 2} selected={isHere}>
                          <FarmVisitorSprite who={vid} emotionPose={vDesc.pose} size={32} active={false} centered />
                        </FarmSlotFrame>
                        <View style={{ flex: 1, gap: 2 }}>
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                            <FarmText style={{ color: '#4F3924', fontSize: 13.5, fontWeight: '800' }}>
                              {profile.name}
                            </FarmText>
                            <FarmText style={{ color: '#7D684E', fontSize: 10 }}>
                              好感 {rec?.affinity ?? 18}/100{isHere ? ' · 正在院子里' : ''}
                            </FarmText>
                          </View>
                          <FarmText style={{ color: '#6E5840', fontSize: 11, lineHeight: 16 }} numberOfLines={2}>
                            {profile.title}
                          </FarmText>
                          <FarmText style={{ color: isHere ? '#496B2F' : '#8E785D', fontSize: 10, fontWeight: isHere ? '700' : '500' }}>
                            {scheduleSubtext}
                          </FarmText>
                        </View>
                        {isHere ? (
                          <View style={{ gap: 5, alignItems: 'flex-end' }}>
                            {onTalkVisitor ? (
                              <Pressable
                                onPress={() => onTalkVisitor(vid)}
                                style={{ paddingHorizontal: 10, paddingVertical: 5, borderRadius: 99, backgroundColor: '#7B9657' }}
                              >
                                <FarmText style={{ color: '#FFFDF7', fontSize: 10.5, fontWeight: '800' }}>去聊聊</FarmText>
                              </Pressable>
                            ) : null}
                            {onDismissVisitor ? (
                              <Pressable
                                onPress={onDismissVisitor}
                                style={{ paddingHorizontal: 10, paddingVertical: 4, borderRadius: 99, backgroundColor: '#F2E5CF', borderWidth: 1, borderColor: '#D8C2A2' }}
                              >
                                <FarmText style={{ color: '#7A5D3B', fontSize: 10, fontWeight: '700' }}>送别</FarmText>
                              </Pressable>
                            ) : null}
                          </View>
                        ) : onInviteVisitor ? (
                          <Pressable
                            onPress={() => onInviteVisitor(vid)}
                            style={{ paddingHorizontal: 10, paddingVertical: 6, borderRadius: 99, backgroundColor: '#EFE4CE', borderWidth: 1, borderColor: '#D6C2A3' }}
                          >
                            <FarmText style={{ color: '#61482D', fontSize: 10.5, fontWeight: '700' }}>邀来串门</FarmText>
                          </Pressable>
                        ) : null}
                      </View>
                      <FarmEmotionMeter emotion={vEmotion} compact />
                    </FarmParchmentCard>
                  );
                });
              })()}

              {/* 深夜恐怖徐睡阴彩蛋控制台 */}
              <View
                style={{
                  padding: 12,
                  borderRadius: 14,
                  backgroundColor: '#2B1B36',
                  borderWidth: 1.5,
                  borderColor: '#A9416B',
                  gap: 9,
                }}
              >
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                  <FarmSlotFrame size={48} rarity={3} selected={visitorState.horrorActive}>
                    <FarmVisitorSprite who="dark_xushuiyin" activity="idle" size={32} active={false} centered />
                  </FarmSlotFrame>
                  <View style={{ flex: 1 }}>
                    <FarmText style={{ color: '#FFBBD0', fontSize: 13.5, fontWeight: '800' }}>
                      深夜恐怖彩蛋 · 恐怖徐睡阴
                    </FarmText>
                    <FarmText style={{ color: '#C6B0D4', fontSize: 10.5, marginTop: 2, lineHeight: 15 }}>
                      夜晚有概率头朝下裹被子扛电脑来农场疯狂打瓦吵翻全员，导致次日全农场睡眠不足（已成功劝退 {visitorState.horrorBanishedCount} 次）
                    </FarmText>
                  </View>
                  {onToggleHorror ? (
                    <Switch
                      accessibilityLabel="开启恐怖徐睡阴彩蛋"
                      value={visitorState.horrorEnabled}
                      onValueChange={onToggleHorror}
                      trackColor={{ false: '#524063', true: '#C43D69' }}
                      thumbColor={visitorState.horrorEnabled ? '#FFD4E2' : '#D5C7DF'}
                    />
                  ) : null}
                </View>

                {isFarmSleepDeprived(visitorState, needs.day) ? (
                  <FarmText style={{ color: '#FFD6A5', fontSize: 11, fontWeight: '700' }}>
                    ⚠ 当前全农场正处于「昨夜被吵到睡眠不足」状态，快去找家人们听听他们吐槽！
                  </FarmText>
                ) : null}

                {onSummonHorror ? (
                  <FarmButton
                    label={visitorState.horrorActive ? '恐怖徐睡阴正在院子里闹觉（去处理！）' : '立刻召唤恐怖徐睡阴（彩蛋试玩）'}
                    tone="rose"
                    onPress={onSummonHorror}
                  />
                ) : null}
              </View>
            </>
          ) : null}
        </ScrollView>
      </View>
    </FarmNPCSheet>
  );
}
