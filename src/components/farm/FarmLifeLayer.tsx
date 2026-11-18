import { FARM_BODY_FONT, FarmText as Text } from './FarmSkin';
import { memo, useState, useSyncExternalStore } from 'react';
import { useSettings } from '@/store/useSettings';
import { Image, Modal, Pressable, ScrollView, Switch, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AUTOMATIC_LIFE_INTERVAL_REASON, FARM_TOPICS, MODE_NAMES, PRESETS, RESIDENT_IDS, RESIDENTS, SETTING_RANGES, SHORT_TALK_MAX, getNextAutomaticLifeRequest, lifeRequestBlockReason, normalizeLifeUsage, type NumericLifeSetting, type ResidentConversation, type ResidentId, type LifeMode } from '@/utils/farmLife';
import type { FarmResidentsController } from '@/hooks/useFarmResidents';
import { FarmResident } from './FarmResident';
const ink = '#59432E',
  muted = '#8A785E';
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
  return <Pressable
    accessibilityRole="button"
    accessibilityLabel={accessibilityLabel ?? label}
    accessibilityState={{ selected }}
    onPress={onPress}
    android_ripple={{ color: '#87916A30' }}
    style={{
      minHeight: 44, minWidth: 44, paddingHorizontal: stepper ? 0 : 13,
      justifyContent: 'center', alignItems: 'center', overflow: 'hidden',
      borderRadius: stepper ? 10 : 22, borderWidth: 1,
      borderColor: selected ? '#A7AF89' : '#E1D5C6',
      backgroundColor: selected ? '#DFE7CE' : '#F5EBE0',
    }}
  >
    <Text style={{ fontSize: stepper ? 20 : 13, fontWeight: '700', textAlign: 'center' }}>{label}</Text>
  </Pressable>;
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
  return <View style={{ flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', columnGap: 12, rowGap: 6, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: '#ECE0D3' }}>
    <View style={{ flexGrow: 1, flexShrink: 1, flexBasis: 120 }}>
      <Text style={{ color: ink, fontSize: 14, fontWeight: '600' }}>{label}</Text>
      <Text style={{ color: muted, fontSize: 12, marginTop: 3 }}>{min}～{max}</Text>
    </View>
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
      <Button stepper label="−" accessibilityLabel={'减少' + label} onPress={() => onChange(Math.max(min, value - step))} />
      <TextInput accessibilityLabel={label} keyboardType="number-pad" value={draft}
        maxLength={4} onChangeText={setDraft}
        onEndEditing={({ nativeEvent }) => commit(nativeEvent.text ?? draft)}
        onSubmitEditing={({ nativeEvent }) => commit(nativeEvent.text ?? draft)}
        style={{
          width: 62, minHeight: 44, borderRadius: 10, borderWidth: 1,
          borderColor: '#E1D5C6', backgroundColor: '#FFFDF7',
          fontFamily: FARM_BODY_FONT, color: ink, textAlign: 'center',
          fontSize: 16, fontVariant: ['tabular-nums'],
        }}
      />
      <Button stepper label="+" accessibilityLabel={'增加' + label} onPress={() => onChange(Math.min(max, value + step))} />
      {draft !== String(value) ? <Button label="应用" accessibilityLabel={'应用' + label} onPress={() => commit(draft)} />
        : field === 'aiRatio' && value < 100 ? <Button label="100%" accessibilityLabel="自动闲聊联网比例设为百分之百" onPress={() => onChange(100)} /> : null}
    </View>
  </View>;
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
const FarmResidentActors = memo(function FarmResidentActors({ getResidents, subscribeResidents, scale, awake, autonomous, reducedMotion, onTalk }: {
  getResidents: FarmResidentsController['getResidents'];
  subscribeResidents: FarmResidentsController['subscribeResidents'];
  scale: number; awake: boolean; autonomous: boolean; reducedMotion: boolean;
  onTalk: (who: ResidentId, position: { x: number; y: number }) => void;
}) {
  const residents = useSyncExternalStore(subscribeResidents, getResidents, getResidents);
  return <>{residents.map(resident => <FarmResident key={resident.id} resident={resident} scale={scale}
    active={awake && (autonomous || Boolean(resident.task) || resident.conversationSize > 0)}
    reducedMotion={reducedMotion} onTalk={onTalk} />)}</>;
});
export function FarmLifeLayer({
  scale,
  controller,
  panelOpen,
  reportsOnly = false,
  unreadReportIds,
  onReadReport,
  onOpenRecap,
  onClosePanel,
  onTalk,
  onFollowUp,
  onResumeRequest,
  interruptedRequests,
  hasApiKey,
  at
}: {
  scale: number;
  controller: FarmResidentsController;
  panelOpen: boolean;
  reportsOnly?: boolean;
  unreadReportIds: ReadonlySet<string>;
  onReadReport: (id: string) => void;
  onOpenRecap: () => void;
  onClosePanel: () => void;
  onTalk: (who: ResidentId, position: {
    x: number;
    y: number;
  }) => void;
  hasApiKey: boolean;
  onFollowUp: (record: ResidentConversation) => void;
  onResumeRequest: (record: ResidentConversation) => void;
  interruptedRequests: ResidentConversation[];
  at: number;
}) {
  const insets = useSafeAreaInsets();
  const farmWebSearch = useSettings(s => s.farmWebSearch);
  const setFarmWebSearch = useSettings(s => s.setFarmWebSearch);
  const [advanced, setAdvanced] = useState(false);
  const [filter, setFilter] = useState<'all' | 'encounter' | 'ai' | 'command' | 'request'>('all');
  const [person, setPerson] = useState<ResidentId | 'all'>('all');
  const [count, setCount] = useState(20);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const {
    settings,
    history
  } = controller;
  const usage = normalizeLifeUsage(controller.usage, at);
  const aiStatus = !hasApiKey ? '未配置 API Key' : lifeRequestBlockReason(usage, settings, at);
  const waitMinutes = Math.max(1, Math.ceil((getNextAutomaticLifeRequest(usage, settings) - at) / 60000));
  const automaticAIStatus = aiStatus === AUTOMATIC_LIFE_INTERVAL_REASON
    ? `约 ${waitMinutes} 分钟后可发起新的联网闲聊`
    : aiStatus || '下一次符合条件的偶遇可联网';
  const continued = panelOpen ? new Set([...history, ...interruptedRequests].map(record => record.resumedFrom)) : undefined;
  const records = panelOpen ? [...history, ...interruptedRequests].filter(c => reportsOnly ? c.discussion?.kind === 'request' :
    (person === 'all' || c.participants.includes(person)) && (filter === 'all' || filter === 'ai' && c.online || filter === 'encounter' && c.source === 'encounter' || filter === 'command' && c.source === 'player_command' || filter === 'request' && c.discussion?.kind === 'request')).sort((a, b) => b.startedAt - a.startedAt) : [];
  return <>
    <FarmResidentActors getResidents={controller.getResidents} subscribeResidents={controller.subscribeResidents}
      scale={scale} awake={controller.awake} autonomous={controller.autonomous} reducedMotion={controller.reducedMotion} onTalk={onTalk} />
    {panelOpen ? <Modal visible transparent statusBarTranslucent navigationBarTranslucent animationType="slide" onRequestClose={onClosePanel}>
      <View style={{
        flex: 1,
        justifyContent: 'flex-end',
        backgroundColor: 'rgba(0,0,0,.55)'
      }}><Pressable accessibilityLabel="关闭农场设置" onPress={onClosePanel} style={{
          position: 'absolute',
          width: '100%',
          height: '100%'
        }} />
        <View style={{
          maxHeight: '92%',
          backgroundColor: '#FFF8EF',
          borderTopLeftRadius: 24,
          borderTopRightRadius: 24,
          overflow: 'hidden'
        }}>
          <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{
            paddingHorizontal: 18,
            paddingTop: 14,
            paddingBottom: insets.bottom + 22,
            gap: 14
          }}>
            {reportsOnly ? <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
              <Text variant="title" style={{ color: ink, fontSize: 22 }}>居民委托汇报</Text>
              <Button label="收起" onPress={onClosePanel} />
            </View> : <>
            <Image source={require("../../../assets/images/farm-residents-orchard.png")} resizeMode="cover" fadeDuration={0} style={{ width: "100%", height: 80, borderRadius: 14 }} />
            <View style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: 8
            }}><View style={{
                flex: 1
              }}><Text variant="title" style={{
                  color: ink,
                  fontFamily: FARM_BODY_FONT,
                  fontSize: 22,
                  fontWeight: '800'
                }}>农场设置</Text><Text style={{
                  color: muted,
                  fontSize: 12,
                  marginTop: 5
                }}>当前：{MODE_NAMES[settings.mode]} · 与“我的聊天”分别保存</Text></View><Button label="收起" onPress={onClosePanel} /></View>
            <View style={{ alignSelf: 'flex-start' }}>
              <Button label="归来小结" onPress={onOpenRecap} />
            </View>
            <View style={{
              flexDirection: 'row',
              flexWrap: 'wrap',
              gap: 8
            }}>{(Object.keys(PRESETS) as Exclude<LifeMode, 'custom'>[]).map(mode => <Button key={mode} label={MODE_NAMES[mode]} selected={settings.mode === mode} onPress={() => controller.applyPreset(mode)} />)}</View>
            <Text style={{
              color: muted,
              fontSize: 12,
              lineHeight: 20
            }}>居民在路上自然偶遇，不会被定时召集。日常生活默认使用本地对白；开启联网或选择 AI 小镇后，只有部分偶遇会请求 AI。{'\n\n为什么配置了 Key 还显示“本地”？\n农场共用设置里的 DeepSeek API Key，但保存密钥不会自动开启联网。请在这里开启 AI 居民对话，并检查自动闲聊联网比例、请求间隔和每日额度。'}</Text>
            <View style={{ padding: 13, borderRadius: 14, backgroundColor: '#F0E8DA' }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                <Text style={{ flex: 1, color: ink, fontSize: 14, fontWeight: '700' }}>居民联网搜索</Text>
                <Switch accessibilityLabel="居民联网搜索" value={farmWebSearch} onValueChange={setFarmWebSearch}
                  trackColor={{ false: '#DED3C7', true: '#B8C79F' }} thumbColor={farmWebSearch ? '#667F50' : '#FFF8EF'} />
              </View>
              <Text style={{ color: muted, fontSize: 12, lineHeight: 19, marginTop: 5 }}>明确请居民查资料时，将搜索词发送给搜索引擎。与居民自动 AI 对话分别控制。{hasApiKey ? '' : '请先在设置 → AI 与桌宠中配置共用的 DeepSeek API Key。'}</Text>
            </View>
            {(['roaming', 'chatter', 'online', 'longTalks', 'naturalTalks', 'shareTopics'] as const).map((key, i) => <View key={key} style={{
              flexDirection: 'row',
              justifyContent: 'space-between',
              alignItems: 'center'
            }}><Text style={{
                color: ink,
                fontSize: 14
              }}>{['自主散步', '偶遇聊天', '允许 AI 居民对话', '允许居民长谈', '聊到自然结束', '和家人分享玩家话题'][i]}</Text><Switch disabled={!controller.ready || key === 'naturalTalks' && !settings.longTalks} trackColor={{ false: "#DED3C7", true: "#B8C79F" }} thumbColor={settings[key] ? "#667F50" : "#FFF8EF"} value={settings[key]} onValueChange={value => controller.updateSettings({
                [key]: value,
                ...(key === 'longTalks' && value ? { rounds: Math.max(8, settings.rounds) } : {}),
              })} /></View>)}
            <Text style={{
              color: '#6F7A50',
              fontSize: 12,
              lineHeight: 19
            }}>今日 AI：{usage.count}/{settings.dailyLimit} 次 · 主动委托已用 {usage.commandCount ?? 0} 次{'\n'}每日优先为主动委托保留 {Math.min(settings.commandReserve, settings.dailyLimit)} 次 · 自动闲聊间隔 {settings.aiMinutes} 分钟 · 比例 {settings.aiRatio}%{'\n'}自动联网：{automaticAIStatus}</Text>
            {settings.online && settings.aiRatio === 100 ? <Text style={{ color: muted, fontSize: 11, lineHeight: 18 }}>
              100% 时，间隔未到会等下一次偶遇。每日额度用完、只剩委托预留，或联网请求失败时，居民仍可使用本地对白。
            </Text> : null}
            <Text style={{
              color: muted,
              fontSize: 11,
              lineHeight: 18
            }}>居民之间只分享兴趣话题的类别，比如钓鱼或唱歌。开启 AI 居民对话后，联网也只带这些类别与居民对白，一对一原文和私密彩蛋留在个人聊天。长谈可在高级设置调到 30 轮；自然结束模式由居民决定何时收尾，最多 30 轮。AI 长谈按段请求，每段占一次额度；续聊不受新对话间隔限制。额度不足或联网失败时，尚未开始的对话使用本地对白，已经开始的对话保留记录并结束。</Text>
            <Button label={advanced ? '收起高级设置' : '高级自定义'} onPress={() => setAdvanced(!advanced)} />
            {advanced ? (Object.keys(SETTING_RANGES) as NumericLifeSetting[]).filter(field => field !== 'rounds' || !settings.naturalTalks).map(field => <NumberSetting key={`${field}-${settings[field]}`} field={field} label={LABELS[field]} maxRounds={settings.longTalks ? SETTING_RANGES.rounds[1] : SHORT_TALK_MAX} value={settings[field]} onChange={value => controller.updateSettings({
              [field]: value
            })} />) : null}
            <Text style={{
              color: muted,
              fontSize: 11,
              lineHeight: 18
            }}>改动高级参数会切换到自定义模式。打开面板、切到后台时暂停生活；返回后从当前进度继续，不补演离线对话。</Text>
            {controller.notice ? <Text style={{
              color: '#926B35',
              fontSize: 12,
              lineHeight: 18
            }}>{controller.notice}</Text> : null}
            <Text style={{
              color: ink,
              fontSize: 16,
              fontWeight: '700'
            }}>最近 40 次交流</Text>
            <View style={{
              flexDirection: 'row',
              flexWrap: 'wrap',
              gap: 6
            }}>{([['all', '全部'], ['encounter', '偶遇'], ['ai', 'AI'], ['command', '我的命令'], ['request', '委托']] as const).map(([key, label]) => <Button key={key} label={label} selected={filter === key} onPress={() => {
                setFilter(key);
                setCount(20);
              }} />)}</View>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{
              gap: 6
            }}><Button label="全部人物" selected={person === 'all'} onPress={() => setPerson('all')} />{RESIDENT_IDS.map(id => <Button key={id} label={RESIDENTS[id].name} selected={person === id} onPress={() => setPerson(id)} />)}</ScrollView>
            </>}
            {!records.length ? <Text style={{
              color: muted,
              fontSize: 13,
              lineHeight: 20
            }}>还没有这类交流。让居民在农场逛一会儿，或在“我的聊天”里请他们帮忙。</Text> : records.slice(0, count).map(record => <View key={record.id} style={{
              padding: 14,
              borderRadius: 14,
              backgroundColor: '#F7EDE1',
              gap: 10,
              borderWidth: 1,
              borderColor: '#E7D8C8'
            }}>
              <Text style={{
                color: '#8C6C3E',
                fontSize: 14,
                fontWeight: '700'
              }}>{record.participants.map(id => RESIDENTS[id].name).join(' ↔ ')}</Text>
              <Text style={{
                color: muted,
                fontSize: 11
              }}>{new Date(record.startedAt).toLocaleTimeString([], {
                  hour: '2-digit',
                  minute: '2-digit'
                })} · {record.source === 'player_command' ? '我的命令' : record.source === 'encounter' ? '偶遇' : record.activity === 'project' ? '自主行动 · 小目标' : record.activity === 'rest' ? '自主行动 · 休息' : record.discussion?.kind === 'followup' ? '接着讨论' : '旧本地记录'} · {record.aiPending ? 'AI 请求中' : record.online ? 'AI' : '本地'}{record.endedAt === null ? ' · 进行中' : ''}{record.sharedTopic ? ' · 聊到客人：' + FARM_TOPICS[record.sharedTopic.topic].label : ''}{record.discussion?.kind === 'debate' ? ' · 有不同意见' : record.participants.length > 2 ? ' · 多人讨论' : ''}</Text>
              {record.localReason ? <Text style={{ color: muted, fontSize: 12 }}>{record.localReason}{record.online ? '，已保留 AI 对话' : '，使用本地对白'}</Text> : null}
              {record.discussion?.question ? <Text style={{ color: muted, fontSize: 12 }}>{record.discussion.question}</Text> : null}
              {record.requestOutcome && unreadReportIds.has(record.id) ? <View style={{ alignSelf: 'flex-start' }}>
                <Button label="查看汇报 · 未读" onPress={() => onReadReport(record.id)} />
              </View> : record.requestOutcome ? <View style={{ gap: 6 }}>
                <Text style={{ color: ink, fontWeight: '700' }}>{record.requestStatus === 'answered' ? '已答复' : record.requestStatus === 'unanswered' ? '待补充' : record.requestStatus === 'interrupted' ? '已中断' : '委托汇报'}</Text>
                <Text style={{ color: ink, lineHeight: 20 }}>{record.requestOutcome}</Text>
                {record.participants.length === 2 && record.discussion?.question && !continued?.has(record.id)
                  ? record.requestStatus === 'interrupted'
                    ? <Button label="继续上次委托" onPress={() => onResumeRequest(record)} />
                    : <Button label="接着问" onPress={() => onFollowUp(record)} />
                  : null}
              </View> : null}
              {(reportsOnly || filter === 'request') && record.lines.length > 0 && expandedId !== record.id ? null : !record.lines.length ? <Text style={{
                color: muted,
                fontSize: 12
              }}>{record.endedAt === null ? '正在想一句招呼…' : '这次交流已结束，还没来得及开口。'}</Text> : (expandedId === record.id ? record.lines : record.lines.slice(0, 8)).map((line, index) => <View key={`${line.at}-${index}`} style={{
                paddingLeft: 9,
                borderLeftWidth: 2,
                borderColor: COLORS[RESIDENTS[line.speaker].row],
                gap: 4
              }}><Text style={{
                  color: COLORS[RESIDENTS[line.speaker].row],
                  fontSize: 11,
                  fontWeight: '700'
                }}>{RESIDENTS[line.speaker].name}</Text><Text style={{
                  color: ink,
                  fontSize: 13,
                  lineHeight: 20
                }}>{line.text}</Text></View>)}
              {record.lines.length > 8 || (reportsOnly || filter === 'request') && record.lines.length > 0 ? <Button label={expandedId === record.id ? "收起对白" : `展开全部 ${record.lines.length} 句`} onPress={() => setExpandedId(expandedId === record.id ? null : record.id)} /> : null}
            </View>)}
            {records.length > count ? <Button label="再显示 20 条" onPress={() => setCount(count + 20)} /> : null}
          </ScrollView>
        </View>
      </View>
    </Modal> : null}
  </>;
}
