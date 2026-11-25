import { FARM_BODY_FONT, FarmIllustration, FarmSlotFrame, FarmText as Text } from './FarmSkin';
import { memo, useState, useSyncExternalStore } from 'react';
import { useSettings } from '@/store/useSettings';
import { Modal, Pressable, ScrollView, Switch, TextInput, View } from 'react-native';
import { FarmPersonSprite } from './FarmPersonSprite';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AUTOMATIC_LIFE_INTERVAL_REASON, FARM_TOPICS, MODE_NAMES, PRESETS, RESIDENT_IDS, RESIDENTS, SETTING_RANGES, SHORT_TALK_MAX, getNextAutomaticLifeRequest, lifeRequestBlockReason, normalizeLifeUsage, type NumericLifeSetting, type ResidentConversation, type ResidentId, type LifeMode } from '@/utils/farmLife';
import { describeFarmEmotion, type FarmEmotionPose } from '@/utils/farmEmotion';
import { getResidentEmotion, type FarmMemories } from '@/utils/farmMemory';
import type { FarmResidentsController } from '@/hooks/useFarmResidents';
import { FarmResident } from './FarmResident';
import { FarmSpeechOverlay } from './FarmSpeechLayer';
import type { FarmPoint } from '@/constants/farmMap';
import type { NightSoloEvent } from '@/utils/farmSleep';
import { residentWeatherStatus, type FarmPeriod, type FarmWeather } from '@/utils/farmTown';

const ink = '#59432E';
const muted = '#8A785E';

function Button({
  label,
  onPress,
  selected = false,
  stepper = false,
  accessibilityLabel
}: {
  label: string;
  onPress: () => void;
  selected?: boolean;
  stepper?: boolean;
  accessibilityLabel?: string;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityState={{ selected }}
      onPress={onPress}
      android_ripple={{ color: '#87916A30' }}
      style={{
        minHeight: 40,
        minWidth: 40,
        paddingHorizontal: stepper ? 0 : 12,
        justifyContent: 'center',
        alignItems: 'center',
        overflow: 'hidden',
        borderRadius: stepper ? 10 : 18,
        borderWidth: 1,
        borderColor: selected ? '#96A979' : '#E1D5C6',
        backgroundColor: selected ? '#DCE7CA' : '#F5EBE0',
      }}
    >
      <Text style={{ fontSize: stepper ? 19 : 12.5, fontWeight: '700', textAlign: 'center', color: selected ? '#3E542B' : ink }}>
        {label}
      </Text>
    </Pressable>
  );
}

function SettingSwitchRow({
  title,
  hint,
  value,
  disabled = false,
  onChange,
  last = false,
}: {
  title: string;
  hint: string;
  value: boolean;
  disabled?: boolean;
  onChange: (next: boolean) => void;
  last?: boolean;
}) {
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
        paddingVertical: 9,
        borderBottomWidth: last ? 0 : 1,
        borderBottomColor: '#EAE0D2',
        opacity: disabled ? 0.52 : 1,
      }}
    >
      <View style={{ flex: 1 }}>
        <Text style={{ color: ink, fontSize: 13.5, fontWeight: '700' }}>{title}</Text>
        <Text style={{ color: muted, fontSize: 11, lineHeight: 16, marginTop: 2 }}>{hint}</Text>
      </View>
      <Switch
        accessibilityLabel={title}
        disabled={disabled}
        value={value}
        onValueChange={onChange}
        trackColor={{ false: '#DED3C7', true: '#B8C79F' }}
        thumbColor={value ? '#667F50' : '#FFF8EF'}
      />
    </View>
  );
}

function NumberSetting({
  label,
  value,
  field,
  maxRounds,
  onChange
}: {
  label: string;
  value: number;
  field: NumericLifeSetting;
  maxRounds: number;
  onChange: (n: number) => void;
}) {
  const [draft, setDraft] = useState(String(value));
  const [min, ceiling] = SETTING_RANGES[field];
  const max = field === 'rounds' ? maxRounds : ceiling;
  const step = field === 'rounds' || field === 'dailyLimit' || field === 'aiMinutes' || field === 'commandReserve' ? 1 : field === 'conversationCooldown' ? 10 : 5;
  const commit = (text: string) => {
    const parsed = /^\d+$/.test(text.trim()) ? Number(text) : NaN;
    const normalized = Number.isFinite(parsed) ? Math.max(min, Math.min(max, parsed)) : value;
    setDraft(String(normalized));
    if (normalized !== value) onChange(normalized);
  };
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', columnGap: 10, rowGap: 6, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: '#ECE0D3' }}>
      <View style={{ flexGrow: 1, flexShrink: 1, flexBasis: 120 }}>
        <Text style={{ color: ink, fontSize: 13, fontWeight: '700' }}>{label}</Text>
        <Text style={{ color: muted, fontSize: 11, marginTop: 2 }}>范围 {min}～{max}</Text>
      </View>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
        <Button stepper label="−" accessibilityLabel={'减少' + label} onPress={() => onChange(Math.max(min, value - step))} />
        <TextInput
          accessibilityLabel={label}
          keyboardType="number-pad"
          value={draft}
          maxLength={4}
          onChangeText={setDraft}
          onEndEditing={({ nativeEvent }) => commit(nativeEvent.text ?? draft)}
          onSubmitEditing={({ nativeEvent }) => commit(nativeEvent.text ?? draft)}
          style={{
            width: 56,
            minHeight: 40,
            borderRadius: 10,
            borderWidth: 1,
            borderColor: '#E1D5C6',
            backgroundColor: '#FFFDF7',
            fontFamily: FARM_BODY_FONT,
            color: ink,
            textAlign: 'center',
            fontSize: 15,
            fontVariant: ['tabular-nums'],
          }}
        />
        <Button stepper label="+" accessibilityLabel={'增加' + label} onPress={() => onChange(Math.min(max, value + step))} />
        {draft !== String(value) ? (
          <Button label="应用" accessibilityLabel={'应用' + label} onPress={() => commit(draft)} />
        ) : field === 'aiRatio' && value < 100 ? (
          <Button label="100%" accessibilityLabel="自动闲聊联网比例设为百分之百" onPress={() => onChange(100)} />
        ) : null}
      </View>
    </View>
  );
}

const LABELS: Record<NumericLifeSetting, string> = {
  activitySeconds: '走动间隔（秒）',
  encounterChance: '偶遇聊天概率（%）',
  conversationCooldown: '聊天冷却（秒）',
  rounds: '对话轮数（每人发言一次算一轮）',
  aiRatio: '自动闲聊联网比例（%）',
  aiMinutes: '自动闲聊 AI 间隔（分钟）',
  dailyLimit: '每日 AI 请求上限',
  commandReserve: '每日为主动委托预留',
  nightActivity: '夜间活跃程度（%）'
};
const COLORS = ['#5E7D45', '#A65D78', '#527C9F', '#9B7437', '#87639B', '#85763F'];

const FarmResidentActors = memo(function FarmResidentActors({
  getResidents,
  subscribeResidents,
  scale,
  awake,
  autonomous,
  reducedMotion,
  playerPosition,
  topBlockedHeight,
  followedId,
  sleepingResidents,
  sleepDeprived,
  nightSoloEvent,
  memories,
  emotionSpritesEnabled = true,
  weather = 'clear',
  rainbow = false,
  period = 'noon',
  onTalk,
  onPressBubble,
}: {
  getResidents: FarmResidentsController['getResidents'];
  subscribeResidents: FarmResidentsController['subscribeResidents'];
  scale: number;
  awake: boolean;
  autonomous: boolean;
  reducedMotion: boolean;
  playerPosition?: FarmPoint;
  topBlockedHeight?: number;
  followedId?: ResidentId | null;
  sleepingResidents?: readonly ResidentId[];
  sleepDeprived?: boolean;
  nightSoloEvent?: NightSoloEvent | null;
  memories?: FarmMemories;
  emotionSpritesEnabled?: boolean;
  weather?: FarmWeather;
  rainbow?: boolean;
  period?: FarmPeriod;
  onTalk: (who: ResidentId, position: { x: number; y: number }) => void;
  onPressBubble?: (resident: ReturnType<FarmResidentsController['getResidents']>[number]) => void;
}) {
  const residents = useSyncExternalStore(subscribeResidents, getResidents, getResidents);
  const sleepingSet = new Set(sleepingResidents ?? []);
  const visibleResidents = residents.filter(r => !sleepingSet.has(r.id));
  return (
    <>
      {visibleResidents.map(resident => {
        const em = memories ? getResidentEmotion(memories[resident.id], resident.id) : null;
        const desc = em ? describeFarmEmotion(em) : null;
        const pose: FarmEmotionPose = emotionSpritesEnabled && desc ? desc.pose : 'neutral';
        const weatherStatus = residentWeatherStatus(resident.id, weather, rainbow, period);
        return (
          <FarmResident
            key={resident.id}
            resident={resident}
            scale={scale}
            active={awake && (autonomous || Boolean(resident.task) || resident.conversationSize > 0)}
            reducedMotion={reducedMotion}
            followed={followedId === resident.id}
            sleepDeprived={Boolean(sleepDeprived)}
            soloBadge={nightSoloEvent?.resident === resident.id ? nightSoloEvent.badge : undefined}
            weatherBadge={weatherStatus.badge}
            weatherBadgeKind={weatherStatus.badgeKind}
            emotionPose={pose}
            emotionBadge={emotionSpritesEnabled && desc && desc.pose !== 'neutral' ? desc.badge : undefined}
            onTalk={onTalk}
          />
        );
      })}
      <FarmSpeechOverlay
        residents={visibleResidents}
        scale={scale}
        playerPosition={playerPosition}
        topBlockedHeight={topBlockedHeight}
        onPressBubble={onPressBubble}
      />
    </>
  );
});

type SettingsTab = 'life' | 'ai' | 'logs';

export function FarmLifeLayer({
  scale,
  controller,
  panelOpen,
  initialTab = 'life',
  reportsOnly = false,
  unreadReportIds,
  onReadReport,
  onOpenRecap,
  onClosePanel,
  onTalk,
  onFollowUp,
  onResumeRequest,
  onJoinGroup,
  onPressBubble,
  playerPosition,
  topBlockedHeight,
  followedId,
  sleepingResidents,
  sleepDeprived,
  nightSoloEvent,
  memories,
  whaleSyncEnabled = true,
  onToggleWhaleSync,
  randomEventsEnabled = true,
  onToggleRandomEvents,
  emotionSpritesEnabled = true,
  onToggleEmotionSprites,
  weather = 'clear',
  rainbow = false,
  period = 'noon',
  interruptedRequests,
  hasApiKey,
  at
}: {
  scale: number;
  controller: FarmResidentsController;
  panelOpen: boolean;
  initialTab?: SettingsTab;
  reportsOnly?: boolean;
  unreadReportIds: ReadonlySet<string>;
  onReadReport: (id: string) => void;
  onOpenRecap: () => void;
  onClosePanel: () => void;
  onTalk: (who: ResidentId, position: { x: number; y: number }) => void;
  hasApiKey: boolean;
  onFollowUp: (record: ResidentConversation) => void;
  onResumeRequest: (record: ResidentConversation) => void;
  onJoinGroup?: (record: ResidentConversation) => void;
  onPressBubble?: (resident: ReturnType<FarmResidentsController['getResidents']>[number]) => void;
  playerPosition?: FarmPoint;
  topBlockedHeight?: number;
  followedId?: ResidentId | null;
  sleepingResidents?: readonly ResidentId[];
  sleepDeprived?: boolean;
  nightSoloEvent?: NightSoloEvent | null;
  memories?: FarmMemories;
  whaleSyncEnabled?: boolean;
  onToggleWhaleSync?: (v: boolean) => void;
  randomEventsEnabled?: boolean;
  onToggleRandomEvents?: (v: boolean) => void;
  emotionSpritesEnabled?: boolean;
  onToggleEmotionSprites?: (v: boolean) => void;
  weather?: FarmWeather;
  rainbow?: boolean;
  period?: FarmPeriod;
  interruptedRequests: ResidentConversation[];
  at: number;
}) {
  const insets = useSafeAreaInsets();
  const farmWebSearch = useSettings(s => s.farmWebSearch);
  const setFarmWebSearch = useSettings(s => s.setFarmWebSearch);
  const [tabOverride, setTabOverride] = useState<{ open: boolean; initial: SettingsTab; tab: SettingsTab } | null>(null);
  const settingsTab: SettingsTab =
    tabOverride && tabOverride.open === panelOpen && tabOverride.initial === initialTab
      ? tabOverride.tab
      : initialTab;
  const setSettingsTab = (tab: SettingsTab) => setTabOverride({ open: panelOpen, initial: initialTab, tab });
  const [advanced, setAdvanced] = useState(false);
  const [filter, setFilter] = useState<'all' | 'encounter' | 'ai' | 'command' | 'request'>('all');
  const [person, setPerson] = useState<ResidentId | 'all'>('all');
  const [count, setCount] = useState(20);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const { settings, history } = controller;
  const usage = normalizeLifeUsage(controller.usage, at);
  const aiStatus = !hasApiKey ? '未配置 API Key' : lifeRequestBlockReason(usage, settings, at);
  const waitMinutes = Math.max(1, Math.ceil((getNextAutomaticLifeRequest(usage, settings) - at) / 60000));
  const automaticAIStatus = aiStatus === AUTOMATIC_LIFE_INTERVAL_REASON
    ? `约 ${waitMinutes} 分钟后可发起新的联网闲聊`
    : aiStatus || '下一次符合条件的偶遇可联网';
  const continued = panelOpen ? new Set([...history, ...interruptedRequests].map(record => record.resumedFrom)) : undefined;
  const records = panelOpen
    ? [...history, ...interruptedRequests]
        .filter(c =>
          reportsOnly
            ? c.discussion?.kind === 'request'
            : (person === 'all' || c.participants.includes(person)) &&
              (filter === 'all' ||
                (filter === 'ai' && c.online) ||
                (filter === 'encounter' && c.source === 'encounter') ||
                (filter === 'command' && c.source === 'player_command') ||
                (filter === 'request' && c.discussion?.kind === 'request')),
        )
        .sort((a, b) => b.startedAt - a.startedAt)
    : [];

  const quotaPct = Math.min(100, Math.round((usage.count / Math.max(1, settings.dailyLimit)) * 100));

  return (
    <>
      <FarmResidentActors
        getResidents={controller.getResidents}
        subscribeResidents={controller.subscribeResidents}
        scale={scale}
        awake={controller.awake}
        autonomous={controller.autonomous}
        reducedMotion={controller.reducedMotion}
        playerPosition={playerPosition}
        topBlockedHeight={topBlockedHeight}
        followedId={followedId}
        sleepingResidents={sleepingResidents}
        sleepDeprived={sleepDeprived}
        nightSoloEvent={nightSoloEvent}
        memories={memories}
        emotionSpritesEnabled={emotionSpritesEnabled}
        weather={weather}
        rainbow={rainbow}
        period={period}
        onTalk={onTalk}
        onPressBubble={onPressBubble}
      />

      {panelOpen ? (
        <Modal visible transparent statusBarTranslucent navigationBarTranslucent animationType="slide" onRequestClose={onClosePanel}>
          <View style={{ flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,.55)' }}>
            <Pressable accessibilityLabel="关闭农场设置" onPress={onClosePanel} style={{ position: 'absolute', width: '100%', height: '100%' }} />
            <View style={{ maxHeight: '90%', backgroundColor: '#FFF8EF', borderTopLeftRadius: 24, borderTopRightRadius: 24, overflow: 'hidden' }}>
              {/* 顶部固定标题与三页签栏 */}
              <View style={{ paddingHorizontal: 18, paddingTop: 14, paddingBottom: 10, borderBottomWidth: 1, borderBottomColor: '#EDE1D0', gap: 10 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <View style={{ flex: 1 }}>
                    <Text variant="title" style={{ color: ink, fontFamily: FARM_BODY_FONT, fontSize: 19, fontWeight: '800' }}>
                      {reportsOnly ? '居民委托汇报' : '农场设置与记录'}
                    </Text>
                    {!reportsOnly ? (
                      <Text style={{ color: muted, fontSize: 11.5, marginTop: 2 }}>
                        当前预设：{MODE_NAMES[settings.mode]} · 今日 AI {usage.count}/{settings.dailyLimit}
                      </Text>
                    ) : null}
                  </View>
                  {!reportsOnly ? <Button label="归来小结" onPress={onOpenRecap} /> : null}
                  <Button label="收起" onPress={onClosePanel} />
                </View>

                {!reportsOnly ? (
                  <View style={{ flexDirection: 'row', backgroundColor: '#F1E7D8', borderRadius: 14, padding: 3, gap: 4 }}>
                    {([
                      ['life', '生活与联动'],
                      ['ai', 'AI 与联网'],
                      ['logs', `交流记录(${history.length})`],
                    ] as const).map(([key, label]) => {
                      const active = settingsTab === key;
                      return (
                        <Pressable
                          key={key}
                          accessibilityRole="tab"
                          accessibilityState={{ selected: active }}
                          onPress={() => setSettingsTab(key)}
                          style={{
                            flex: 1,
                            minHeight: 36,
                            borderRadius: 11,
                            alignItems: 'center',
                            justifyContent: 'center',
                            backgroundColor: active ? '#FFFDF8' : 'transparent',
                            borderWidth: active ? 1 : 0,
                            borderColor: '#DFD0B8',
                          }}
                        >
                          <Text style={{ fontSize: 12, fontWeight: active ? '800' : '600', color: active ? '#4F663A' : muted }}>
                            {label}
                          </Text>
                        </Pressable>
                      );
                    })}
                  </View>
                ) : null}
              </View>

              <ScrollView
                keyboardShouldPersistTaps="handled"
                contentContainerStyle={{
                  paddingHorizontal: 18,
                  paddingTop: 14,
                  paddingBottom: insets.bottom + 24,
                  gap: 13,
                }}
              >
                {!reportsOnly && settingsTab === 'life' ? (
                  <>
                    <FarmIllustration theme="orchard" />

                    {/* 活跃度预设卡片 */}
                    <View style={{ padding: 13, borderRadius: 16, backgroundColor: '#F5EDE0', borderWidth: 1, borderColor: '#E5D7C2', gap: 9 }}>
                      <Text style={{ color: ink, fontSize: 14, fontWeight: '800' }}>农场生活节奏预设</Text>
                      <Text style={{ color: muted, fontSize: 11.5, lineHeight: 17 }}>
                        一键切换居民散步、偶遇聊天与 AI 联网频率，也可以在下方细调。
                      </Text>
                      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 7 }}>
                        {(Object.keys(PRESETS) as Exclude<LifeMode, 'custom'>[]).map(mode => (
                          <Button key={mode} label={MODE_NAMES[mode]} selected={settings.mode === mode} onPress={() => controller.applyPreset(mode)} />
                        ))}
                      </View>
                    </View>

                    {/* 居民行为卡片 */}
                    <View style={{ paddingHorizontal: 14, paddingVertical: 6, borderRadius: 16, backgroundColor: '#F7EFE2', borderWidth: 1, borderColor: '#E5D7C2' }}>
                      <Text style={{ color: '#786246', fontSize: 11.5, fontWeight: '800', paddingTop: 6, paddingBottom: 2 }}>
                        居民自主生活
                      </Text>
                      <SettingSwitchRow
                        title="自主散步与天气避雨"
                        hint="居民按晨午晚、晴雨彩虹与小镇事件在院子里走动"
                        value={settings.roaming}
                        disabled={!controller.ready}
                        onChange={value => controller.updateSettings({ roaming: value })}
                      />
                      <SettingSwitchRow
                        title="偶遇自然聊天"
                        hint="两位居民在路上相遇时自动开启本地或 AI 对话"
                        value={settings.chatter}
                        disabled={!controller.ready}
                        onChange={value => controller.updateSettings({ chatter: value })}
                      />
                      <SettingSwitchRow
                        title="和家人分享玩家话题"
                        hint="只分享钓鱼/唱歌等兴趣类别，绝不泄露私密原话"
                        value={settings.shareTopics}
                        disabled={!controller.ready}
                        onChange={value => controller.updateSettings({ shareTopics: value })}
                        last
                      />
                    </View>

                    {/* 联动与表现卡片 */}
                    <View style={{ paddingHorizontal: 14, paddingVertical: 6, borderRadius: 16, backgroundColor: '#F2F5EC', borderWidth: 1, borderColor: '#D2DEC3' }}>
                      <Text style={{ color: '#4B6336', fontSize: 11.5, fontWeight: '800', paddingTop: 6, paddingBottom: 2 }}>
                        彩蛋联动与视觉表现
                      </Text>
                      {onToggleWhaleSync ? (
                        <SettingSwitchRow
                          title="大肥鱼同步课表人设与记忆"
                          hint="农场访客大肥鱼实时沿用你在课表里设定的名字、称呼、滑条与记忆"
                          value={whaleSyncEnabled}
                          onChange={onToggleWhaleSync}
                        />
                      ) : null}
                      {onToggleRandomEvents ? (
                        <SettingSwitchRow
                          title="农场随机奇遇事件"
                          hint="按晴天、细雨、彩虹与夜色自动触发可抉择的互动事件"
                          value={randomEventsEnabled}
                          onChange={onToggleRandomEvents}
                        />
                      ) : null}
                      {onToggleEmotionSprites ? (
                        <SettingSwitchRow
                          title="人物像素情绪动作贴图"
                          hint="按四维情绪数值流畅播放开心、低落、生气、害羞、犯困动作"
                          value={emotionSpritesEnabled}
                          onChange={onToggleEmotionSprites}
                          last
                        />
                      ) : null}
                    </View>
                  </>
                ) : null}

                {!reportsOnly && settingsTab === 'ai' ? (
                  <>
                    {/* 今日额度状态卡片 */}
                    <View style={{ padding: 14, borderRadius: 16, backgroundColor: '#F1F4EA', borderWidth: 1, borderColor: '#CED9BF', gap: 7 }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                        <Text style={{ color: '#435830', fontSize: 13.5, fontWeight: '800' }}>AI 居民对话额度</Text>
                        <Text style={{ color: '#5D7346', fontSize: 12, fontWeight: '800' }}>
                          {usage.count} / {settings.dailyLimit} 次
                        </Text>
                      </View>
                      <View style={{ height: 6, borderRadius: 99, backgroundColor: '#DDE6CE', overflow: 'hidden' }}>
                        <View style={{ width: `${Math.max(4, quotaPct)}%`, height: '100%', backgroundColor: '#769156' }} />
                      </View>
                      <Text style={{ color: '#5E6E4B', fontSize: 11.5, lineHeight: 17 }}>
                        自动联网状态：{automaticAIStatus}
                        {'\n'}主动委托已用 {usage.commandCount ?? 0} 次（每日优先预留 {Math.min(settings.commandReserve, settings.dailyLimit)} 次） · 自动闲聊间隔 {settings.aiMinutes} 分钟 · 比例 {settings.aiRatio}%
                      </Text>
                    </View>

                    {/* 联网与长谈开关卡片 */}
                    <View style={{ paddingHorizontal: 14, paddingVertical: 6, borderRadius: 16, backgroundColor: '#F7EFE2', borderWidth: 1, borderColor: '#E5D7C2' }}>
                      <SettingSwitchRow
                        title="允许 AI 居民对话"
                        hint={hasApiKey ? '开启后，符合间隔与额度的偶遇将调用 DeepSeek 生成鲜活对话' : '请先在主设置 → AI 与桌宠配置共用的 DeepSeek API Key'}
                        value={settings.online}
                        disabled={!controller.ready}
                        onChange={value => controller.updateSettings({ online: value })}
                      />
                      <SettingSwitchRow
                        title="居民联网搜索"
                        hint="明确请居民查资料时联网检索，与居民自动 AI 聊天分别控制"
                        value={farmWebSearch}
                        onChange={setFarmWebSearch}
                      />
                      <SettingSwitchRow
                        title="允许居民长谈"
                        hint="延长多人讨论或偶遇对白轮数，最高可在下方调至 30 轮"
                        value={settings.longTalks}
                        disabled={!controller.ready}
                        onChange={value => controller.updateSettings({
                          longTalks: value,
                          ...(value ? { rounds: Math.max(8, settings.rounds) } : {}),
                        })}
                      />
                      <SettingSwitchRow
                        title="聊到自然结束"
                        hint="开启长谈后，由居民根据话题节奏自然收尾（最多 30 轮）"
                        value={settings.naturalTalks}
                        disabled={!controller.ready || !settings.longTalks}
                        onChange={value => controller.updateSettings({ naturalTalks: value })}
                        last
                      />
                    </View>

                    {/* 高级参数折叠卡 */}
                    <View style={{ padding: 13, borderRadius: 16, backgroundColor: '#F5EDE0', borderWidth: 1, borderColor: '#E5D7C2', gap: 8 }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                        <View style={{ flex: 1 }}>
                          <Text style={{ color: ink, fontSize: 13.5, fontWeight: '800' }}>高级参数自定义</Text>
                          <Text style={{ color: muted, fontSize: 11, marginTop: 2 }}>
                            微调间隔、冷却、每日上限与夜间活跃度（会自动切至自定义模式）
                          </Text>
                        </View>
                        <Button label={advanced ? '收起' : '展开'} onPress={() => setAdvanced(!advanced)} />
                      </View>
                      {advanced
                        ? (Object.keys(SETTING_RANGES) as NumericLifeSetting[])
                            .filter(field => field !== 'rounds' || !settings.naturalTalks)
                            .map(field => (
                              <NumberSetting
                                key={`${field}-${settings[field]}`}
                                field={field}
                                label={LABELS[field]}
                                maxRounds={settings.longTalks ? SETTING_RANGES.rounds[1] : SHORT_TALK_MAX}
                                value={settings[field]}
                                onChange={value => controller.updateSettings({ [field]: value })}
                              />
                            ))
                        : null}
                    </View>

                    {controller.notice ? (
                      <Text style={{ color: '#926B35', fontSize: 12, lineHeight: 18 }}>{controller.notice}</Text>
                    ) : null}
                  </>
                ) : null}

                {reportsOnly || settingsTab === 'logs' ? (
                  <>
                    {!reportsOnly ? (
                      <View style={{ gap: 8 }}>
                        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
                          {([['all', '全部'], ['encounter', '偶遇'], ['ai', 'AI'], ['command', '我的命令'], ['request', '委托']] as const).map(([key, label]) => (
                            <Button
                              key={key}
                              label={label}
                              selected={filter === key}
                              onPress={() => {
                                setFilter(key);
                                setCount(20);
                              }}
                            />
                          ))}
                        </View>
                        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6 }}>
                          <Button label="全部人物" selected={person === 'all'} onPress={() => setPerson('all')} />
                          {RESIDENT_IDS.map(id => (
                            <Button key={id} label={RESIDENTS[id].name} selected={person === id} onPress={() => setPerson(id)} />
                          ))}
                        </ScrollView>
                      </View>
                    ) : null}

                    {!records.length ? (
                      <Text style={{ color: muted, fontSize: 13, lineHeight: 20, textAlign: 'center', paddingVertical: 20 }}>
                        还没有这类交流。让居民在农场逛一会儿，或在“我的聊天”里请他们帮忙。
                      </Text>
                    ) : (
                      records.slice(0, count).map(record => (
                        <View
                          key={record.id}
                          style={{
                            padding: 13,
                            borderRadius: 14,
                            backgroundColor: '#F7EDE1',
                            gap: 9,
                            borderWidth: 1,
                            borderColor: '#E7D8C8',
                          }}
                        >
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                            <View style={{ flexDirection: 'row', gap: 4 }}>
                              {record.participants.slice(0, 3).map(pid => (
                                <FarmSlotFrame key={pid} size={30} rarity={1}>
                                  <FarmPersonSprite who={pid} size={20} active={false} centered />
                                </FarmSlotFrame>
                              ))}
                            </View>
                            <Text style={{ flex: 1, color: '#8C6C3E', fontSize: 13.5, fontWeight: '700' }}>
                              {record.participants.map(id => RESIDENTS[id].name).join(' ↔ ')}
                            </Text>
                          </View>
                          <Text style={{ color: muted, fontSize: 11 }}>
                            {new Date(record.startedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} · {record.source === 'player_command' ? '我的命令' : record.source === 'encounter' ? '偶遇' : record.activity === 'project' ? '自主行动 · 小目标' : record.activity === 'rest' ? '自主行动 · 休息' : record.discussion?.kind === 'followup' ? '接着讨论' : '旧本地记录'} · {record.aiPending ? 'AI 请求中' : record.online ? 'AI' : '本地'}{record.endedAt === null ? ' · 进行中' : ''}{record.sharedTopic ? ' · 聊到客人：' + FARM_TOPICS[record.sharedTopic.topic].label : ''}{record.discussion?.kind === 'debate' ? ' · 有不同意见' : record.participants.length > 2 ? ' · 多人讨论' : ''}
                          </Text>
                          {record.localReason ? <Text style={{ color: muted, fontSize: 12 }}>{record.localReason}{record.online ? '，已保留 AI 对话' : '，使用本地对白'}</Text> : null}
                          {record.discussion?.question ? <Text style={{ color: muted, fontSize: 12 }}>{record.discussion.question}</Text> : null}
                          {record.requestOutcome && unreadReportIds.has(record.id) ? (
                            <View style={{ alignSelf: 'flex-start' }}>
                              <Button label="查看汇报 · 未读" onPress={() => onReadReport(record.id)} />
                            </View>
                          ) : record.requestOutcome ? (
                            <View style={{ gap: 6 }}>
                              <Text style={{ color: ink, fontWeight: '700' }}>
                                {record.requestStatus === 'answered' ? '已答复' : record.requestStatus === 'unanswered' ? '待补充' : record.requestStatus === 'interrupted' ? '已中断' : '委托汇报'}
                              </Text>
                              <Text style={{ color: ink, lineHeight: 20 }}>{record.requestOutcome}</Text>
                              {record.participants.length === 2 && record.discussion?.question && !continued?.has(record.id) ? (
                                record.requestStatus === 'interrupted' ? (
                                  <Button label="继续上次委托" onPress={() => onResumeRequest(record)} />
                                ) : (
                                  <Button label="接着问" onPress={() => onFollowUp(record)} />
                                )
                              ) : null}
                            </View>
                          ) : null}
                          {(reportsOnly || filter === 'request') && record.lines.length > 0 && expandedId !== record.id ? null : !record.lines.length ? (
                            <Text style={{ color: muted, fontSize: 12 }}>
                              {record.endedAt === null ? '正在想一句招呼…' : '这次交流已结束，还没来得及开口。'}
                            </Text>
                          ) : (
                            (expandedId === record.id ? record.lines : record.lines.slice(0, 8)).map((line, index) => (
                              <View
                                key={`${line.at}-${index}`}
                                style={{
                                  paddingLeft: 9,
                                  borderLeftWidth: 2,
                                  borderColor: COLORS[RESIDENTS[line.speaker].row],
                                  gap: 3,
                                }}
                              >
                                <Text style={{ color: COLORS[RESIDENTS[line.speaker].row], fontSize: 11, fontWeight: '700' }}>
                                  {RESIDENTS[line.speaker].name}
                                </Text>
                                <Text style={{ color: ink, fontSize: 13, lineHeight: 19 }}>{line.text}</Text>
                              </View>
                            ))
                          )}
                          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                            {record.lines.length > 8 || ((reportsOnly || filter === 'request') && record.lines.length > 0) ? (
                              <Button label={expandedId === record.id ? '收起原文' : `展开全部 (${record.lines.length}句)`} onPress={() => setExpandedId(expandedId === record.id ? null : record.id)} />
                            ) : null}
                            {onJoinGroup && record.participants.length >= 2 ? (
                              <Button label="加入这组群聊" onPress={() => { onClosePanel(); onJoinGroup(record); }} />
                            ) : null}
                          </View>
                        </View>
                      ))
                    )}
                    {records.length > count ? <Button label={`加载更多（剩余 ${records.length - count} 条）`} onPress={() => setCount(c => c + 20)} /> : null}
                  </>
                ) : null}
              </ScrollView>
            </View>
          </View>
        </Modal>
      ) : null}
    </>
  );
}
