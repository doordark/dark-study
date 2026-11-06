import { FARM_BODY_FONT, FarmText as Text } from './FarmSkin';
import { useState } from 'react';
import { Image, Modal, Pressable, ScrollView, Switch, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { FARM_TOPICS, MODE_NAMES, PRESETS, RESIDENT_IDS, RESIDENTS, SETTING_RANGES, SHORT_TALK_MAX, normalizeLifeUsage, type NumericLifeSetting, type ResidentId, type LifeMode } from '@/utils/farmLife';
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
  const step = field === 'rounds' || field === 'dailyLimit' || field === 'aiMinutes' ? 1 : field === 'conversationCooldown' ? 10 : 5;
  return <View style={{ flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', columnGap: 12, rowGap: 6, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: '#ECE0D3' }}>
    <View style={{ flexGrow: 1, flexShrink: 1, flexBasis: 120 }}>
      <Text style={{ color: ink, fontSize: 14, fontWeight: '600' }}>{label}</Text>
      <Text style={{ color: muted, fontSize: 12, marginTop: 3 }}>{min}～{max}</Text>
    </View>
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
      <Button stepper label="−" accessibilityLabel={'减少' + label} onPress={() => onChange(Math.max(min, value - step))} />
      <TextInput accessibilityLabel={label} keyboardType="number-pad" value={draft}
        maxLength={4} onChangeText={setDraft}
        onEndEditing={({ nativeEvent }) => {
          const next = nativeEvent.text.trim() ? Number(nativeEvent.text) : NaN;
          const normalized = Number.isFinite(next) ? Math.max(min, Math.min(max, Math.round(next))) : value;
          setDraft(String(normalized));
          onChange(normalized);
        }}
        style={{
          width: 62, minHeight: 44, borderRadius: 10, borderWidth: 1,
          borderColor: '#E1D5C6', backgroundColor: '#FFFDF7',
          fontFamily: FARM_BODY_FONT, color: ink, textAlign: 'center',
          fontSize: 16, fontVariant: ['tabular-nums'],
        }}
      />
      <Button stepper label="+" accessibilityLabel={'增加' + label} onPress={() => onChange(Math.min(max, value + step))} />
    </View>
  </View>;
}
const LABELS: Record<NumericLifeSetting, string> = {
  activitySeconds: '走动间隔（秒）',
  encounterChance: '偶遇聊天概率（%）',
  conversationCooldown: '聊天冷却（秒）',
  rounds: '对话轮数（每人发言一次算一轮）',
  aiRatio: '联网对话比例（%）',
  aiMinutes: 'AI 最短间隔（分钟）',
  dailyLimit: '每日 AI 请求上限',
  nightActivity: '夜间活跃程度（%）'
};
const COLORS = ['#5E7D45', '#A65D78', '#527C9F', '#9B7437', '#87639B', '#85763F'];
export function FarmLifeLayer({
  scale,
  controller,
  panelOpen,
  onClosePanel,
  onTalk,
  hasApiKey,
  at
}: {
  scale: number;
  controller: FarmResidentsController;
  panelOpen: boolean;
  onClosePanel: () => void;
  onTalk: (who: ResidentId, position: {
    x: number;
    y: number;
  }) => void;
  hasApiKey: boolean;
  at: number;
}) {
  const insets = useSafeAreaInsets();
  const [advanced, setAdvanced] = useState(false);
  const [filter, setFilter] = useState<'all' | 'encounter' | 'ai' | 'command'>('all');
  const [person, setPerson] = useState<ResidentId | 'all'>('all');
  const [count, setCount] = useState(20);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const {
    settings,
    history
  } = controller;
  const usage = normalizeLifeUsage(controller.usage, at);
  const records = history.filter(c => (person === 'all' || c.participants.includes(person)) && (filter === 'all' || filter === 'ai' && c.online || filter === 'encounter' && c.source === 'encounter' || filter === 'command' && c.source === 'player_command')).slice().reverse();
  return <>
    {controller.residents.map(resident => <FarmResident key={resident.id} resident={resident} scale={scale} active={controller.awake && (controller.autonomous || Boolean(resident.task) || resident.conversationSize > 0)} reducedMotion={controller.reducedMotion} onTalk={onTalk} />)}
    <Modal visible={panelOpen} transparent statusBarTranslucent navigationBarTranslucent animationType="slide" onRequestClose={onClosePanel}>
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
            <View style={{
              flexDirection: 'row',
              flexWrap: 'wrap',
              gap: 8
            }}>{(Object.keys(PRESETS) as Exclude<LifeMode, 'custom'>[]).map(mode => <Button key={mode} label={MODE_NAMES[mode]} selected={settings.mode === mode} onPress={() => controller.applyPreset(mode)} />)}</View>
            <Text style={{
              color: muted,
              fontSize: 12,
              lineHeight: 20
            }}>居民在路上自然偶遇，不会被定时召集。日常生活默认使用本地对白；开启联网或选择 AI 小镇后，只有部分偶遇会请求 AI。</Text>
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
            }}>今日 AI：{usage.count}/{settings.dailyLimit} 次 · 最短间隔 {settings.aiMinutes} 分钟 · 比例 {settings.aiRatio}%{!hasApiKey ? '\n未配置 Key，当前全部使用本地对白。' : ''}</Text>
            <Text style={{
              color: muted,
              fontSize: 11,
              lineHeight: 18
            }}>居民之间只分享兴趣话题的类别，比如钓鱼或唱歌。开启 AI 居民对话后，联网也只带这些类别与居民对白，一对一原文和私密彩蛋留在个人聊天。长谈可在高级设置调到 30 轮；自然结束模式由居民决定何时收尾，最多 30 轮。AI 长谈按段请求，每段占一次额度，额度不足或联网失败时接着用本地对白。</Text>
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
            }}>{([['all', '全部'], ['encounter', '偶遇'], ['ai', 'AI'], ['command', '我的命令']] as const).map(([key, label]) => <Button key={key} label={label} selected={filter === key} onPress={() => {
                setFilter(key);
                setCount(20);
              }} />)}</View>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{
              gap: 6
            }}><Button label="全部人物" selected={person === 'all'} onPress={() => setPerson('all')} />{RESIDENT_IDS.map(id => <Button key={id} label={RESIDENTS[id].name} selected={person === id} onPress={() => setPerson(id)} />)}</ScrollView>
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
                })} · {record.source === 'player_command' ? '我的命令' : record.source === 'encounter' ? '偶遇' : record.activity === 'project' ? '自主行动 · 小目标' : record.activity === 'rest' ? '自主行动 · 休息' : record.discussion?.kind === 'followup' ? '接着讨论' : '旧本地记录'} · {record.online ? 'AI' : '本地'}{record.endedAt === null ? ' · 进行中' : ''}{record.sharedTopic ? ' · 聊到客人：' + FARM_TOPICS[record.sharedTopic.topic].label : ''}{record.discussion?.kind === 'debate' ? ' · 有不同意见' : record.participants.length > 2 ? ' · 多人讨论' : ''}</Text>
              {record.discussion?.question ? <Text style={{ color: muted, fontSize: 12 }}>{record.discussion.question}</Text> : null}
              {!record.lines.length ? <Text style={{
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
              {record.lines.length > 8 ? <Button label={expandedId === record.id ? "收起对白" : `展开全部 ${record.lines.length} 句`} onPress={() => setExpandedId(expandedId === record.id ? null : record.id)} /> : null}
            </View>)}
            {records.length > count ? <Button label="再显示 20 条" onPress={() => setCount(count + 20)} /> : null}
          </ScrollView>
        </View>
      </View>
    </Modal>
  </>;
}
