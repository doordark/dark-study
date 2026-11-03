import { useState } from 'react';
import { Modal, Pressable, ScrollView, Switch, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MODE_NAMES, PRESETS, RESIDENT_IDS, RESIDENTS, SETTING_RANGES, normalizeLifeUsage, type NumericLifeSetting, type ResidentId, type LifeMode } from '@/utils/farmLife';
import type { FarmResidentsController } from '@/hooks/useFarmResidents';
import { FarmResident } from './FarmResident';
const ink = '#F6EEDC',
  muted = '#ADBEA7';
function Button({
  label,
  onPress,
  selected = false
}: {
  label: string;
  onPress: () => void;
  selected?: boolean;
}) {
  return <Pressable accessibilityRole="button" accessibilityState={{
    selected
  }} onPress={onPress} style={{
    minHeight: 44,
    justifyContent: 'center',
    paddingHorizontal: 12,
    borderRadius: 10,
    backgroundColor: selected ? '#617B3F' : '#2B4030'
  }}><Text style={{
      color: ink,
      fontSize: 12,
      fontWeight: '600'
    }}>{label}</Text></Pressable>;
}
function NumberSetting({
  label,
  value,
  field,
  onChange
}: {
  label: string;
  value: number;
  field: NumericLifeSetting;
  onChange: (n: number) => void;
}) {
  const [draft, setDraft] = useState(String(value));
  const [min, max] = SETTING_RANGES[field];
  const step = field === 'rounds' || field === 'dailyLimit' || field === 'aiMinutes' ? 1 : field === 'conversationCooldown' ? 10 : 5;
  return <View style={{
    gap: 6
  }}><Text style={{
      color: muted,
      fontSize: 12
    }}>{label} · {min}～{max}</Text><View style={{
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8
    }}><Button label="−" onPress={() => onChange(Math.max(min, value - step))} /><TextInput accessibilityLabel={label} keyboardType="number-pad" value={draft} maxLength={4} onChangeText={setDraft} onEndEditing={() => onChange(Number.isFinite(Number(draft)) ? Math.max(min, Math.min(max, Math.round(Number(draft)))) : value)} style={{
        minHeight: 44,
        flex: 1,
        borderWidth: 1,
        borderColor: '#52664B',
        borderRadius: 9,
        paddingHorizontal: 12,
        color: ink,
        textAlign: 'center',
        fontSize: 15
      }} /><Button label="+" onPress={() => onChange(Math.min(max, value + step))} /></View></View>;
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
const COLORS = ['#B9DC9B', '#EDB6C9', '#A7C8EB', '#F0CD80', '#CBACE2', '#E7D9A5'];
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
  const {
    settings,
    history
  } = controller;
  const usage = normalizeLifeUsage(controller.usage, at);
  const records = history.filter(c => (person === 'all' || c.participants.includes(person)) && (filter === 'all' || filter === 'ai' && c.online || filter === 'encounter' && c.source === 'encounter' || filter === 'command' && c.source === 'player_command')).slice().reverse();
  return <>
    {controller.residents.map(resident => <FarmResident key={resident.id} resident={resident} scale={scale} active={controller.awake && (controller.autonomous || Boolean(resident.task))} reducedMotion={controller.reducedMotion} onTalk={onTalk} />)}
    <Modal visible={panelOpen} transparent animationType="slide" onRequestClose={onClosePanel}>
      <View style={{
        flex: 1,
        justifyContent: 'flex-end',
        backgroundColor: 'rgba(0,0,0,.55)'
      }}><Pressable accessibilityLabel="关闭居民生活" onPress={onClosePanel} style={{
          position: 'absolute',
          width: '100%',
          height: '100%'
        }} />
        <View style={{
          maxHeight: '92%',
          backgroundColor: '#14231A',
          borderTopLeftRadius: 24,
          borderTopRightRadius: 24
        }}>
          <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{
            padding: 18,
            paddingBottom: insets.bottom + 22,
            gap: 14
          }}>
            <View style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: 8
            }}><View style={{
                flex: 1
              }}><Text style={{
                  color: ink,
                  fontSize: 20,
                  fontWeight: '800'
                }}>居民生活记录</Text><Text style={{
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
              lineHeight: 19
            }}>居民在路上自然偶遇，不会被定时召集。日常生活默认使用本地对白；开启联网或选择 AI 小镇后，只有部分偶遇会请求 AI。</Text>
            {(['roaming', 'chatter', 'online'] as const).map((key, i) => <View key={key} style={{
              flexDirection: 'row',
              justifyContent: 'space-between',
              alignItems: 'center'
            }}><Text style={{
                color: ink,
                fontSize: 14
              }}>{['自主散步', '偶遇聊天', '允许 AI 居民对话'][i]}</Text><Switch disabled={!controller.ready} value={settings[key]} onValueChange={value => controller.updateSettings({
                [key]: value
              })} /></View>)}
            <Text style={{
              color: '#D0DCBB',
              fontSize: 12,
              lineHeight: 19
            }}>今日 AI：{usage.count}/{settings.dailyLimit} 次 · 最短间隔 {settings.aiMinutes} 分钟 · 比例 {settings.aiRatio}%{!hasApiKey ? '\n未配置 Key，当前全部使用本地对白。' : ''}</Text>
            <Text style={{
              color: muted,
              fontSize: 11,
              lineHeight: 18
            }}>失败和取消也计数，每次仅请求一次。自动请求不携带我的聊天历史。个人聊天由你主动发起，与这里的额度分开。</Text>
            <Button label={advanced ? '收起高级设置' : '高级自定义'} onPress={() => setAdvanced(!advanced)} />
            {advanced ? (Object.keys(SETTING_RANGES) as NumericLifeSetting[]).map(field => <NumberSetting key={`${field}-${settings[field]}`} field={field} label={LABELS[field]} value={settings[field]} onChange={value => controller.updateSettings({
              [field]: value
            })} />) : null}
            <Text style={{
              color: muted,
              fontSize: 11,
              lineHeight: 18
            }}>改动高级参数会切换到自定义模式。打开面板、切到后台时暂停生活；返回后从当前进度继续，不补演离线对话。</Text>
            {controller.notice ? <Text style={{
              color: '#E8C48B',
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
              backgroundColor: '#213528',
              gap: 10,
              borderWidth: 1,
              borderColor: '#3F573D'
            }}>
              <Text style={{
                color: '#EBD99F',
                fontSize: 14,
                fontWeight: '700'
              }}>{record.participants.map(id => RESIDENTS[id].name).join(' ↔ ')}</Text>
              <Text style={{
                color: muted,
                fontSize: 11
              }}>{new Date(record.startedAt).toLocaleTimeString([], {
                  hour: '2-digit',
                  minute: '2-digit'
                })} · {record.source === 'player_command' ? '我的命令' : record.source === 'encounter' ? '偶遇' : '旧本地记录'} · {record.online ? 'AI' : '本地'}{record.endedAt === null ? ' · 进行中' : ''}</Text>
              {!record.lines.length ? <Text style={{
                color: muted,
                fontSize: 12
              }}>{record.endedAt === null ? '正在想一句招呼…' : '这次交流已结束，还没来得及开口。'}</Text> : record.lines.map((line, index) => <View key={`${line.at}-${index}`} style={{
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
            </View>)}
            {records.length > count ? <Button label="再显示 20 条" onPress={() => setCount(count + 20)} /> : null}
          </ScrollView>
        </View>
      </View>
    </Modal>
  </>;
}
