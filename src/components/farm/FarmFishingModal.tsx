import Ionicons from '@expo/vector-icons/Ionicons';
import { useEffect, useRef, useState } from 'react';
import { Modal, Pressable, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { playSfx } from '@/services/soundEffects';
import type { FarmPeriod } from '@/utils/farmTime';
import {
  DRIFT_BOTTLES,
  FISH_KINDS,
  FISH_META,
  rollFishingCatch,
  type CatchOutcome,
  type FishKind,
  type FishingBook,
} from '@/utils/farmFishing';
import { FarmDishSprite, FarmPropSprite, FarmUiIcon } from './CropSprite';
import { FarmPersonSprite } from './FarmPersonSprite';
import { FarmButton, FarmParchmentCard, FarmSlotFrame, FarmText } from './FarmSkin';

export function FarmFishingModal({
  visible,
  onClose,
  period,
  weigangNearby,
  book,
  onCatch,
  onSellFish,
  onCookFishSoup,
}: {
  visible: boolean;
  onClose: () => void;
  period: FarmPeriod;
  weigangNearby: boolean;
  book: FishingBook;
  onCatch: (outcome: CatchOutcome) => void;
  onSellFish: (fish: FishKind) => void;
  onCookFishSoup: () => void;
}) {
  const insets = useSafeAreaInsets();
  const [tab, setTab] = useState<'cast' | 'book'>('cast');
  const [phase, setPhase] = useState<'idle' | 'waiting' | 'bite' | 'caught' | 'missed'>('idle');
  const [marker, setMarker] = useState(50);
  const [lastOutcome, setLastOutcome] = useState<CatchOutcome | null>(null);
  const waitTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const biteTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const barTimer = useRef<ReturnType<typeof setInterval> | null>(null);

  const clearAllTimers = () => {
    if (waitTimer.current) clearTimeout(waitTimer.current);
    if (biteTimer.current) clearTimeout(biteTimer.current);
    if (barTimer.current) clearInterval(barTimer.current);
    waitTimer.current = null;
    biteTimer.current = null;
    barTimer.current = null;
  };

  useEffect(() => {
    if (!visible) {
      clearAllTimers();
    }
    return clearAllTimers;
  }, [visible]);

  const handleClose = () => {
    clearAllTimers();
    setPhase('idle');
    setLastOutcome(null);
    onClose();
  };

  const castLine = () => {
    clearAllTimers();
    setLastOutcome(null);
    setPhase('waiting');
    const delayMs = 1200 + Math.floor(Math.random() * 1400);
    waitTimer.current = setTimeout(() => {
      setPhase('bite');
      playSfx('fish_bite', { ignoreCooldown: true, volume: 0.72 });
      let pos = 18;
      let dir = 1;
      setMarker(pos);
      barTimer.current = setInterval(() => {
        pos += dir * 6.5;
        if (pos >= 92) { pos = 92; dir = -1; }
        if (pos <= 8) { pos = 8; dir = 1; }
        setMarker(pos);
      }, 45);
      biteTimer.current = setTimeout(() => {
        clearAllTimers();
        setPhase('missed');
      }, 2400);
    }, delayMs);
  };

  const pullRod = () => {
    if (phase !== 'bite') return;
    clearAllTimers();
    const inSweetSpot = marker >= 26 && marker <= 74;
    if (!inSweetSpot) {
      setPhase('missed');
      return;
    }
    const outcome = rollFishingCatch({ period, weigangNearby, book });
    setLastOutcome(outcome);
    onCatch(outcome);
    setPhase('caught');
    playSfx(outcome.kind === 'bottle' ? 'star_constellation' : 'fish_catch', { volume: 0.76 });
  };

  const canCookSoup = (book.fishStock.crucian ?? 0) >= 1 || (book.fishStock.koi ?? 0) >= 1;

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={handleClose} statusBarTranslucent>
      <View style={{ flex: 1, backgroundColor: 'rgba(15, 25, 30, 0.76)', justifyContent: 'center', padding: 16, paddingTop: insets.top + 16, paddingBottom: insets.bottom + 16 }}>
        <View style={{ maxHeight: '90%', borderRadius: 22, backgroundColor: '#FFF9EF', borderWidth: 1.5, borderColor: '#CFAF82', overflow: 'hidden' }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', padding: 14, paddingBottom: 8, gap: 9 }}>
            <FarmSlotFrame size={40} rarity={2}>
              <FarmPropSprite name="rod" size={28} />
            </FarmSlotFrame>
            <View style={{ flex: 1 }}>
              <FarmText variant="title" style={{ color: '#4B3A26', fontSize: 16.5, fontWeight: '800' }}>
                池塘垂钓 · 漂流瓶图鉴
              </FarmText>
              <FarmText style={{ color: '#7D6A52', fontSize: 10.5, marginTop: 2 }}>
                已垂钓 {book.totalCasts} 次 · 收集漂流瓶 {book.bottles.length}/{DRIFT_BOTTLES.length}
              </FarmText>
            </View>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="关闭池塘钓鱼"
              onPress={handleClose}
              style={{ width: 30, height: 30, borderRadius: 8, alignItems: 'center', justifyContent: 'center', backgroundColor: '#F3E6D0', borderWidth: 1, borderColor: '#DFCCA9' }}
            >
              <Ionicons name="close" size={16} color="#8B7254" />
            </Pressable>
          </View>

          <View style={{ flexDirection: 'row', gap: 6, paddingHorizontal: 14, paddingBottom: 10 }}>
            {([['cast', '甩竿钓鱼'], ['book', '鱼篓与漂流瓶']] as const).map(([k, lbl]) => {
              const active = tab === k;
              return (
                <Pressable
                  key={k}
                  onPress={() => {
                    if (k === 'book' && (phase === 'waiting' || phase === 'bite')) {
                      clearAllTimers();
                      setPhase('idle');
                    }
                    setTab(k);
                  }}
                  style={{
                    flex: 1,
                    paddingVertical: 8,
                    borderRadius: 11,
                    alignItems: 'center',
                    backgroundColor: active ? '#DCE7C7' : '#F4EAD8',
                    borderWidth: 1.2,
                    borderColor: active ? '#91A872' : '#DECBB0',
                  }}
                >
                  <FarmText style={{ color: active ? '#384D26' : '#7B664C', fontSize: 11.5, fontWeight: '800' }}>{lbl}</FarmText>
                </Pressable>
              );
            })}
          </View>

          <ScrollView contentContainerStyle={{ paddingHorizontal: 14, paddingBottom: 18, gap: 12 }} showsVerticalScrollIndicator={false}>
            {tab === 'cast' ? (
              <>
                {weigangNearby ? (
                  <FarmParchmentCard tone="sage" style={{ flexDirection: 'row', alignItems: 'center', gap: 9, padding: 9 }}>
                    <FarmSlotFrame size={38} rarity={4} selected>
                      <FarmPersonSprite who="weigang" size={25} active={false} centered />
                    </FarmSlotFrame>
                    <FarmText style={{ flex: 1, color: '#3E542D', fontSize: 11.5, lineHeight: 17, fontWeight: '700' }}>
                      唯刚就在池塘边伴钓！锦鲤、月光鱼与漂流瓶上钩概率大幅提升！
                    </FarmText>
                  </FarmParchmentCard>
                ) : null}

                {/* 像素池塘水面互动区 */}
                <View
                  style={{
                    height: 186,
                    borderRadius: 16,
                    backgroundColor: period === 'night' ? '#253D52' : period === 'evening' ? '#49657B' : '#5E98AD',
                    borderWidth: 2,
                    borderColor: '#A88A60',
                    alignItems: 'center',
                    justifyContent: 'center',
                    padding: 14,
                    gap: 10,
                  }}
                >
                  {phase === 'idle' ? (
                    <>
                      <FarmPropSprite name="rod" size={54} />
                      <FarmText style={{ color: '#FFF8EA', fontSize: 13, fontWeight: '700', textAlign: 'center' }}>
                        {period === 'evening' || period === 'night'
                          ? '晚风轻拂水面，此时最容易钓起发光的「月光鱼」…'
                          : '水面波光粼粼，点下方甩竿看看今天能遇见什么惊喜'}
                      </FarmText>
                    </>
                  ) : null}

                  {phase === 'waiting' ? (
                    <>
                      <View style={{ width: 46, height: 46, borderRadius: 23, borderWidth: 2, borderColor: 'rgba(255,248,230,0.45)', alignItems: 'center', justifyContent: 'center' }}>
                        <View style={{ width: 14, height: 14, borderRadius: 7, backgroundColor: '#E55B4B', borderWidth: 2, borderColor: '#FFFDF7' }} />
                      </View>
                      <FarmText style={{ color: '#FFF8EA', fontSize: 13.5, fontWeight: '800' }}>
                        浮漂轻晃中……静心等鱼咬钩
                      </FarmText>
                    </>
                  ) : null}

                  {phase === 'bite' ? (
                    <View style={{ width: '100%', alignItems: 'center', gap: 10 }}>
                      <FarmText style={{ color: '#FFE89E', fontSize: 16, fontWeight: '800' }}>
                        浮漂沉下去啦！指针进绿区立刻扬竿！
                      </FarmText>
                      <View style={{ width: '100%', height: 22, borderRadius: 11, backgroundColor: '#1E3140', borderWidth: 1.5, borderColor: '#F3DFB4', overflow: 'hidden', justifyContent: 'center' }}>
                        <View style={{ position: 'absolute', left: '26%', width: '48%', top: 0, bottom: 0, backgroundColor: 'rgba(139, 195, 92, 0.55)' }} />
                        <View style={{ position: 'absolute', left: `${marker}%`, marginLeft: -5, width: 10, top: 2, bottom: 2, borderRadius: 4, backgroundColor: '#FFE17D', borderWidth: 1, borderColor: '#5B3A18' }} />
                      </View>
                    </View>
                  ) : null}

                  {phase === 'missed' ? (
                    <>
                      <FarmText style={{ color: '#FFE6C4', fontSize: 14.5, fontWeight: '800' }}>
                        差一点点，鱼儿摆摆尾巴游走啦！
                      </FarmText>
                      <FarmText style={{ color: '#DCE9EE', fontSize: 11.5 }}>
                        唯刚说：别急，沉住气等浮漂沉稳再甩一竿。
                      </FarmText>
                    </>
                  ) : null}

                  {phase === 'caught' && lastOutcome ? (
                    <View style={{ alignItems: 'center', gap: 6 }}>
                      <FarmSlotFrame size={60} rarity={lastOutcome.kind === 'bottle' ? 3 : lastOutcome.fish === 'moonfish' ? 5 : lastOutcome.fish === 'koi' ? 4 : 2} selected>
                        {lastOutcome.kind === 'bottle' ? (
                          <FarmPropSprite name="bottle" size={44} />
                        ) : (
                          <FarmDishSprite kind={lastOutcome.fish} size={46} />
                        )}
                      </FarmSlotFrame>
                      <FarmText style={{ color: '#FFF7DF', fontSize: 15, fontWeight: '800' }}>
                        {lastOutcome.kind === 'bottle'
                          ? `捞起漂流瓶：「${lastOutcome.bottle.title}」`
                          : `钓起了 ${FISH_META[lastOutcome.fish].label}！`}
                      </FarmText>
                    </View>
                  ) : null}
                </View>

                {phase === 'caught' && lastOutcome?.kind === 'bottle' ? (
                  <FarmParchmentCard tone="warm" style={{ gap: 5 }}>
                    <FarmText style={{ color: '#5A3E24', fontSize: 12.5, fontWeight: '800' }}>
                      漂流瓶纸条 · {lastOutcome.bottle.author}（+{lastOutcome.bottle.bonusCoins} dark币）
                    </FarmText>
                    <FarmText style={{ color: '#614B34', fontSize: 12, lineHeight: 19 }}>
                      “{lastOutcome.bottle.text}”
                    </FarmText>
                  </FarmParchmentCard>
                ) : null}

                {phase === 'bite' ? (
                  <FarmButton label="立刻扬竿起鱼！" tone="rose" onPress={pullRod} />
                ) : (
                  <FarmButton
                    label={phase === 'waiting' ? '静候咬钩中…' : '甩竿下钩'}
                    tone="sage"
                    disabled={phase === 'waiting'}
                    onPress={castLine}
                  />
                )}
              </>
            ) : (
              <>
                <FarmParchmentCard style={{ gap: 10 }}>
                  <FarmText style={{ color: '#553D26', fontSize: 13, fontWeight: '800' }}>鱼篓与池塘图鉴</FarmText>
                  {FISH_KINDS.map(kind => {
                    const meta = FISH_META[kind];
                    const stock = book.fishStock[kind] ?? 0;
                    const total = book.caughtCounts[kind] ?? 0;
                    return (
                      <View key={kind} style={{ flexDirection: 'row', alignItems: 'center', gap: 9 }}>
                        <FarmSlotFrame size={46} rarity={kind === 'moonfish' ? 5 : kind === 'koi' ? 4 : 2} selected={stock > 0}>
                          <FarmDishSprite kind={kind} size={34} />
                        </FarmSlotFrame>
                        <View style={{ flex: 1, gap: 2 }}>
                          <FarmText style={{ color: '#4E3823', fontSize: 12.5, fontWeight: '800' }}>
                            {meta.label} · {meta.rarity}（鱼篓 {stock} / 累计 {total}）
                          </FarmText>
                          <FarmText style={{ color: '#7D684E', fontSize: 10.5, lineHeight: 15 }}>{meta.desc}</FarmText>
                        </View>
                        <Pressable
                          disabled={stock <= 0}
                          onPress={() => onSellFish(kind)}
                          style={{
                            flexDirection: 'row',
                            alignItems: 'center',
                            gap: 3,
                            paddingHorizontal: 9,
                            paddingVertical: 6,
                            borderRadius: 99,
                            backgroundColor: stock > 0 ? '#E4ECD4' : '#EAE3D6',
                            borderWidth: 1,
                            borderColor: stock > 0 ? '#B5C89A' : '#DDD2C0',
                          }}
                        >
                          <FarmUiIcon name="coin" size={12} />
                          <FarmText style={{ color: stock > 0 ? '#425830' : '#9B8E7B', fontSize: 10.5, fontWeight: '700' }}>
                            卖 +{stock * meta.sell}
                          </FarmText>
                        </Pressable>
                      </View>
                    );
                  })}
                  <View style={{ borderTopWidth: 1, borderTopColor: '#E3D2B9', paddingTop: 10, flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                    <FarmSlotFrame size={46} rarity={4} selected={canCookSoup}>
                      <FarmDishSprite kind="fish_soup" size={34} />
                    </FarmSlotFrame>
                    <View style={{ flex: 1 }}>
                      <FarmText style={{ color: '#533B25', fontSize: 12.5, fontWeight: '800' }}>顾的鲜鱼豆腐汤</FarmText>
                      <FarmText style={{ color: '#806A51', fontSize: 10.5 }}>用 1 条银鲫或锦鲤现炖，香气飘满院子（+64 dark币 · 全员好感 +1）</FarmText>
                    </View>
                    <FarmButton label="炖一锅" tone="sage" disabled={!canCookSoup} onPress={onCookFishSoup} style={{ minWidth: 74, minHeight: 36, paddingVertical: 5 }} />
                  </View>
                </FarmParchmentCard>

                <View style={{ gap: 7 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
                    <FarmPropSprite name="bottle" size={18} />
                    <FarmText variant="label" style={{ color: '#6E563B', fontSize: 12 }}>
                      已收集漂流瓶纸条（{book.bottles.length}/{DRIFT_BOTTLES.length}）
                    </FarmText>
                  </View>
                  {book.bottles.length === 0 ? (
                    <FarmText style={{ color: '#8A755B', fontSize: 11.5 }}>
                      还没捞到漂流瓶呢，多去池塘甩几竿试试手气吧！
                    </FarmText>
                  ) : (
                    DRIFT_BOTTLES.filter(b => book.bottles.includes(b.id)).map(b => (
                      <FarmParchmentCard key={b.id} tone="warm" style={{ gap: 4, padding: 10 }}>
                        <FarmText style={{ color: '#533B25', fontSize: 12, fontWeight: '800' }}>
                          {b.title} · {b.author}
                        </FarmText>
                        <FarmText style={{ color: '#69533B', fontSize: 11.5, lineHeight: 17 }}>“{b.text}”</FarmText>
                      </FarmParchmentCard>
                    ))
                  )}
                </View>
              </>
            )}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}
