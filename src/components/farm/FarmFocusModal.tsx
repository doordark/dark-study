import Ionicons from '@expo/vector-icons/Ionicons';
import { useEffect, useRef, useState } from 'react';
import { Modal, Pressable, ScrollView, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { playSfx } from '@/services/soundEffects';
import { RESIDENTS, RESIDENT_IDS, type ResidentId } from '@/utils/farmLife';
import {
  COMPANION_STUDY_ACTIVITY,
  FOCUS_PRESETS,
  formatCompanionSummary,
  type FarmFocusStats,
  type FocusDurationMin,
  type FocusNote,
} from '@/utils/farmFocus';
import { FarmPropSprite, FarmToolSprite, FarmUiIcon } from './CropSprite';
import { FarmPersonSprite } from './FarmPersonSprite';
import { FARM_BODY_FONT, FarmButton, FarmIllustration, FarmParchmentCard, FarmSlotFrame, FarmText } from './FarmSkin';

function formatTimer(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  const m = Math.floor(s / 60);
  const rem = s % 60;
  return `${String(m).padStart(2, '0')}:${String(rem).padStart(2, '0')}`;
}

export function FarmFocusModal({
  visible,
  onClose,
  stats,
  onComplete,
}: {
  visible: boolean;
  onClose: () => void;
  stats: FarmFocusStats;
  onComplete: (minutes: number, companions: ResidentId[], topic: string) => FocusNote;
}) {
  const insets = useSafeAreaInsets();
  const [preset, setPreset] = useState<FocusDurationMin>(25);
  const [companions, setCompanions] = useState<ResidentId[]>(['door', 'gu']);
  const [topic, setTopic] = useState('');
  const [phase, setPhase] = useState<'setup' | 'running' | 'done'>('setup');
  const [remainingSec, setRemainingSec] = useState(25 * 60);
  const [elapsedSec, setElapsedSec] = useState(0);
  const [settledNote, setSettledNote] = useState<FocusNote | null>(null);
  const startedAtRef = useRef(0);
  const onCompleteRef = useRef(onComplete);
  useEffect(() => {
    onCompleteRef.current = onComplete;
  });
  const totalSec = preset * 60;

  useEffect(() => {
    if (!visible || phase !== 'running') return;
    const timer = setInterval(() => {
      const elapsed = Math.floor((Date.now() - startedAtRef.current) / 1000);
      const left = Math.max(0, totalSec - elapsed);
      setElapsedSec(elapsed);
      setRemainingSec(left);
      if (left <= 0) {
        clearInterval(timer);
        const note = onCompleteRef.current(preset, companions, topic);
        setSettledNote(note);
        setPhase('done');
        playSfx('farm_level_up', { volume: 0.74 });
      }
    }, 500);
    return () => clearInterval(timer);
  }, [visible, phase, preset, totalSec, companions, topic]);

  const toggleCompanion = (id: ResidentId) => {
    setCompanions(prev => {
      if (prev.includes(id)) {
        return prev.length <= 1 ? prev : prev.filter(x => x !== id);
      }
      return [...prev.slice(-1), id];
    });
  };

  const startSession = () => {
    startedAtRef.current = Date.now();
    setElapsedSec(0);
    setRemainingSec(preset * 60);
    setSettledNote(null);
    setPhase('running');
    playSfx('farm_event', { volume: 0.68 });
  };

  const finishEarly = () => {
    const mins = Math.max(5, Math.round(elapsedSec / 60));
    const note = onComplete(mins, companions, topic);
    setSettledNote(note);
    setPhase('done');
    playSfx('farm_level_up', { volume: 0.72 });
  };

  const handleClose = () => {
    setPhase('setup');
    setSettledNote(null);
    onClose();
  };

  const activePreset = FOCUS_PRESETS.find(p => p.minutes === preset) ?? FOCUS_PRESETS[1];
  const progressRatio = totalSec > 0 ? Math.min(1, elapsedSec / totalSec) : 0;

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={handleClose} statusBarTranslucent>
      <View style={{ flex: 1, backgroundColor: 'rgba(26, 20, 14, 0.72)', justifyContent: 'center', padding: 16, paddingTop: insets.top + 16, paddingBottom: insets.bottom + 16 }}>
        <View style={{ maxHeight: '90%', borderRadius: 22, backgroundColor: '#FFF9EF', borderWidth: 1.5, borderColor: '#D6BE95', overflow: 'hidden' }}>
          <ScrollView contentContainerStyle={{ padding: 16, gap: 12 }} showsVerticalScrollIndicator={false}>
            <FarmIllustration theme="journal" />

            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 9 }}>
              <FarmSlotFrame size={40} rarity={2}>
                <FarmPropSprite name="focus" size={28} />
              </FarmSlotFrame>
              <View style={{ flex: 1 }}>
                <FarmText variant="title" style={{ color: '#533B24', fontSize: 17, fontWeight: '800' }}>
                  农场自习伴读钟
                </FarmText>
                <FarmText style={{ color: '#867157', fontSize: 11, marginTop: 2 }}>
                  累计伴读 {stats.totalSessions} 次 · {stats.totalMinutes} 分钟 · 连续 {stats.streakDays} 天
                </FarmText>
              </View>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="关闭自习伴读钟"
                onPress={handleClose}
                style={{ width: 30, height: 30, borderRadius: 8, alignItems: 'center', justifyContent: 'center', backgroundColor: '#F3E6D0', borderWidth: 1, borderColor: '#DFCCA9' }}
              >
                <Ionicons name="close" size={16} color="#8B7254" />
              </Pressable>
            </View>

            {phase === 'setup' ? (
              <>
                <FarmParchmentCard tone="warm" style={{ gap: 8 }}>
                  <FarmText style={{ color: '#5D442B', fontSize: 12.5, fontWeight: '800' }}>1. 选择本轮专注时长</FarmText>
                  <View style={{ flexDirection: 'row', gap: 7 }}>
                    {FOCUS_PRESETS.map(item => {
                      const active = preset === item.minutes;
                      return (
                        <Pressable
                          key={item.minutes}
                          onPress={() => setPreset(item.minutes)}
                          style={{
                            flex: 1,
                            paddingVertical: 9,
                            paddingHorizontal: 6,
                            borderRadius: 12,
                            alignItems: 'center',
                            backgroundColor: active ? '#DCE7C7' : '#FFFBF3',
                            borderWidth: 1.2,
                            borderColor: active ? '#8FA86D' : '#E0CEB3',
                          }}
                        >
                          <FarmText style={{ color: active ? '#384D26' : '#5E4730', fontSize: 14, fontWeight: '800' }}>
                            {item.minutes} 分
                          </FarmText>
                          <FarmText style={{ color: '#7F6A50', fontSize: 9.5, marginTop: 2 }}>
                            +{item.coins}币 · 促长{item.growthBoostMin}分
                          </FarmText>
                        </Pressable>
                      );
                    })}
                  </View>
                  <TextInput
                    value={topic}
                    onChangeText={setTopic}
                    placeholder="本轮想专注做什么？（可选，如：背一单元单词 / 刷算法题）"
                    placeholderTextColor="#A19077"
                    maxLength={32}
                    style={{
                      fontFamily: FARM_BODY_FONT,
                      backgroundColor: '#FFFDF8',
                      borderRadius: 10,
                      borderWidth: 1,
                      borderColor: '#DFCEB4',
                      paddingHorizontal: 10,
                      paddingVertical: 8,
                      color: '#59432E',
                      fontSize: 12.5,
                    }}
                  />
                </FarmParchmentCard>

                <FarmParchmentCard style={{ gap: 8 }}>
                  <FarmText style={{ color: '#5D442B', fontSize: 12.5, fontWeight: '800' }}>
                    2. 邀请 1～2 位家人安静陪读（已选：{formatCompanionSummary(companions)}）
                  </FarmText>
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, justifyContent: 'space-between' }}>
                    {RESIDENT_IDS.map(id => {
                      const active = companions.includes(id);
                      return (
                        <Pressable
                          key={id}
                          onPress={() => toggleCompanion(id)}
                          style={{
                            width: '31%',
                            alignItems: 'center',
                            paddingVertical: 7,
                            borderRadius: 12,
                            backgroundColor: active ? '#E9F0DA' : '#F6ECDC',
                            borderWidth: 1.2,
                            borderColor: active ? '#93AB71' : '#E3D3BC',
                            gap: 4,
                          }}
                        >
                          <FarmSlotFrame size={42} rarity={active ? 4 : 1} selected={active}>
                            <FarmPersonSprite who={id} size={27} active={false} centered />
                          </FarmSlotFrame>
                          <FarmText style={{ color: '#523C27', fontSize: 11, fontWeight: active ? '800' : '600' }}>
                            {RESIDENTS[id].name}
                          </FarmText>
                        </Pressable>
                      );
                    })}
                  </View>
                </FarmParchmentCard>

                <FarmButton
                  label={`开始 ${preset} 分钟伴读（奖励 ${activePreset.coins} 金币 + 加速作物生长）`}
                  tone="sage"
                  onPress={startSession}
                />

                {stats.notes.length > 0 ? (
                  <View style={{ gap: 6 }}>
                    <FarmText variant="label" style={{ color: '#6E563B', fontSize: 12 }}>
                      最近收到的家人伴读鼓励签
                    </FarmText>
                    {stats.notes.slice(-3).reverse().map(n => (
                      <FarmParchmentCard key={n.id} tone="sage" style={{ gap: 4, padding: 10 }}>
                        <FarmText style={{ color: '#455932', fontSize: 11, fontWeight: '800' }}>
                          {n.date} · {n.minutes} 分钟 · {formatCompanionSummary(n.companions)} 陪读
                        </FarmText>
                        <FarmText style={{ color: '#533F2B', fontSize: 12, lineHeight: 18 }}>
                          “{n.message}”
                        </FarmText>
                      </FarmParchmentCard>
                    ))}
                  </View>
                ) : null}
              </>
            ) : null}

            {phase === 'running' ? (
              <FarmParchmentCard tone="warm" style={{ alignItems: 'center', gap: 12, paddingVertical: 18 }}>
                <FarmText style={{ color: '#7D664B', fontSize: 12, fontWeight: '700' }}>
                  {topic.trim() ? `正在专注：${topic.trim()}` : '安静伴读进行中 · 作物正跟着悄悄长大'}
                </FarmText>
                <FarmText variant="title" style={{ color: '#48311C', fontSize: 44, fontWeight: '800', letterSpacing: 2 }}>
                  {formatTimer(remainingSec)}
                </FarmText>
                <View style={{ width: '100%', height: 8, borderRadius: 4, backgroundColor: '#E8DAC2', overflow: 'hidden' }}>
                  <View style={{ height: 8, width: `${Math.round(progressRatio * 100)}%`, backgroundColor: '#6F8E4E' }} />
                </View>

                <View style={{ width: '100%', gap: 8, marginTop: 4 }}>
                  {companions.map(id => (
                    <View key={id} style={{ flexDirection: 'row', alignItems: 'center', gap: 9, padding: 8, borderRadius: 12, backgroundColor: '#FFF9EE', borderWidth: 1, borderColor: '#E5D5BC' }}>
                      <FarmSlotFrame size={42} rarity={4}>
                        <FarmPersonSprite who={id} size={28} active centered />
                      </FarmSlotFrame>
                      <View style={{ flex: 1 }}>
                        <FarmText style={{ color: '#4E3823', fontSize: 12.5, fontWeight: '800' }}>
                          {RESIDENTS[id].name} 正在陪读
                        </FarmText>
                        <FarmText style={{ color: '#7C674E', fontSize: 11, marginTop: 2 }}>
                          {COMPANION_STUDY_ACTIVITY[id]}
                        </FarmText>
                      </View>
                    </View>
                  ))}
                </View>

                <View style={{ flexDirection: 'row', gap: 8, width: '100%', marginTop: 6 }}>
                  <View style={{ flex: 1 }}>
                    <FarmButton label="放弃返回" tone="paper" onPress={() => setPhase('setup')} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <FarmButton
                      label={elapsedSec >= 60 ? '提前完成并结算' : '满 1 分钟可提前结算'}
                      tone="sage"
                      disabled={elapsedSec < 60}
                      onPress={finishEarly}
                    />
                  </View>
                </View>
              </FarmParchmentCard>
            ) : null}

            {phase === 'done' && settledNote ? (
              <FarmParchmentCard tone="sage" style={{ alignItems: 'center', gap: 10, paddingVertical: 16 }}>
                <FarmSlotFrame size={56} rarity={5} selected>
                  <FarmPersonSprite who={settledNote.companions[0]} size={36} active centered />
                </FarmSlotFrame>
                <FarmText variant="title" style={{ color: '#3E532B', fontSize: 17, fontWeight: '800' }}>
                  本轮伴读完成！
                </FarmText>
                <FarmText style={{ color: '#533F2B', fontSize: 13, lineHeight: 20, textAlign: 'center' }}>
                  “{settledNote.message}”
                </FarmText>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 99, backgroundColor: '#FFF9EC', borderWidth: 1, borderColor: '#D6C3A4' }}>
                  <FarmUiIcon name="coin" size={16} />
                  <FarmText style={{ color: '#8A6329', fontSize: 12, fontWeight: '800' }}>已入账金币</FarmText>
                  <FarmToolSprite kind="compost" size={16} />
                  <FarmText style={{ color: '#4B6935', fontSize: 12, fontWeight: '800' }}>作物加速 & 已写入记忆本</FarmText>
                </View>
                <FarmButton label="收好鼓励签，回农场看看" tone="sage" onPress={handleClose} style={{ width: '100%' }} />
              </FarmParchmentCard>
            ) : null}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}
