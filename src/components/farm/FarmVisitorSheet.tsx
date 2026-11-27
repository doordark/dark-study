import Ionicons from '@expo/vector-icons/Ionicons';
import { useMemo, useState } from 'react';
import { Keyboard, Pressable, ScrollView, View } from 'react-native';
import {
  CROP_KINDS,
  CROP_LABELS,
  RECIPES,
  stockCount,
  type CropKind,
  type Economy,
  type Recipe,
} from '@/utils/farmEconomy';
import {
  describeFarmEmotion,
  isNpcRefusingChat,
  type FarmEmotionState,
} from '@/utils/farmEmotion';
import {
  resolveVisitorDisplayProfile,
  sanitizeVisitorMessages,
  visitorWeatherBehavior,
  type HorrorBanishMethod,
  type NormalVisitorId,
  type VisitorId,
  type VisitorMemory,
  type WhaleVisitorSyncContext,
} from '@/utils/farmVisitors';
import type { FarmWeather } from '@/utils/farmTown';
import { CropSprite, FarmDishSprite, FarmUiIcon } from './CropSprite';
import { FarmChatConversation, type FarmChatMessage } from './FarmChatConversation';
import { FarmEmotionMeter } from './FarmEmotionMeter';
import { FarmNPCSheet } from './FarmNPCSheet';
import { FarmButton, FarmParchmentCard, FarmSlotFrame, FarmText } from './FarmSkin';
import { FarmVisitorSprite } from './FarmVisitorSprite';

export function FarmVisitorSheet({
  visible,
  who,
  record,
  messages,
  busy,
  online,
  hint,
  draft,
  onChangeDraft,
  onSend,
  economy,
  coins,
  onGiveCrop,
  onGiveDish,
  onBanishHorror,
  onDismissVisitor,
  stayHint,
  onClose,
  maxHeight,
  weather = 'clear',
  rainbow = false,
  emotion,
  whaleSync,
}: {
  visible: boolean;
  who: VisitorId | null;
  record?: VisitorMemory;
  messages: FarmChatMessage[];
  busy: boolean;
  online: boolean;
  hint?: string;
  draft: string;
  onChangeDraft: (text: string) => void;
  onSend: (text?: string) => void;
  economy: Economy;
  coins: number;
  onGiveCrop: (who: NormalVisitorId, crop: CropKind) => void;
  onGiveDish: (who: NormalVisitorId, recipe: Recipe) => void;
  onBanishHorror: (method: HorrorBanishMethod) => void;
  onDismissVisitor?: () => void;
  stayHint?: string;
  onClose: () => void;
  maxHeight: number;
  weather?: FarmWeather;
  rainbow?: boolean;
  emotion?: FarmEmotionState;
  whaleSync?: WhaleVisitorSyncContext;
}) {
  const [giftOpen, setGiftOpen] = useState(false);
  const [selectedGiftKey, setSelectedGiftKey] = useState<string | null>(null);
  const [lastVisitorGift, setLastVisitorGift] = useState<{ who: VisitorId; label: string } | null>(null);
  const currentId: VisitorId = who ?? 'huboqi';
  const profile = resolveVisitorDisplayProfile(currentId, whaleSync);
  const isHorror = currentId === 'dark_xushuiyin';
  const isDafeiyu = currentId === 'dafeiyu';
  const weatherBehavior = visitorWeatherBehavior(currentId, weather, rainbow, whaleSync);
  const emotionPose = emotion ? describeFarmEmotion(emotion).pose : 'neutral';
  const cleanedMessages = useMemo(() => sanitizeVisitorMessages(messages), [messages]);

  const availableCrops = !isHorror
    ? CROP_KINDS.filter(k => stockCount(economy.inventory[k]) > 0).sort((a, b) => {
        const la = profile.lovedGifts.includes(a) ? 0 : 1;
        const lb = profile.lovedGifts.includes(b) ? 0 : 1;
        return la - lb;
      })
    : [];
  const craftableDishes = !isHorror && economy.kitchen
    ? RECIPES.filter(r =>
        coins >= r.fee &&
        (Object.entries(r.inputs) as [CropKind, number][]).every(([k, n]) => stockCount(economy.inventory[k]) >= n),
      ).sort((a, b) => {
        const la = profile.lovedGifts.includes(a.id) ? 0 : 1;
        const lb = profile.lovedGifts.includes(b.id) ? 0 : 1;
        return la - lb;
      })
    : [];

  const giftOptions: ({ key: string; kind: 'dish'; recipe: Recipe; loved: boolean } | { key: string; kind: 'crop'; crop: CropKind; loved: boolean })[] = [
    ...craftableDishes.map(recipe => ({
      key: `dish:${recipe.id}`,
      kind: 'dish' as const,
      recipe,
      loved: profile.lovedGifts.includes(recipe.id),
    })),
    ...availableCrops.map(crop => ({
      key: `crop:${crop}`,
      kind: 'crop' as const,
      crop,
      loved: profile.lovedGifts.includes(crop),
    })),
  ];
  const activeGift = giftOptions.find(opt => opt.key === selectedGiftKey) ?? giftOptions[0] ?? null;
  const recentVisitorReceipt = lastVisitorGift && lastVisitorGift.who === currentId ? lastVisitorGift.label : null;

  const handleConfirmVisitorGift = () => {
    if (isHorror || !activeGift) return;
    if (activeGift.kind === 'dish') {
      onGiveDish(currentId as NormalVisitorId, activeGift.recipe);
      setLastVisitorGift({ who: currentId, label: `${activeGift.recipe.label}（现做）` });
    } else {
      onGiveCrop(currentId as NormalVisitorId, activeGift.crop);
      setLastVisitorGift({ who: currentId, label: `${CROP_LABELS[activeGift.crop]} ×1` });
    }
  };

  return (
    <FarmNPCSheet
      visible={visible && who !== null}
      onClose={() => {
        setGiftOpen(false);
        setLastVisitorGift(null);
        Keyboard.dismiss();
        onClose();
      }}
    >
      <View
        style={{
          borderTopLeftRadius: 24,
          borderTopRightRadius: 24,
          backgroundColor: isHorror ? '#201329' : '#FFF9EF',
          flexShrink: 1,
          overflow: 'hidden',
          borderTopWidth: isHorror ? 2 : 0,
          borderColor: '#C43D69',
        }}
      >
        {/* 顶栏 */}
        <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingTop: 12, paddingBottom: 8, gap: 10 }}>
          <FarmSlotFrame size={50} rarity={isHorror ? 3 : isDafeiyu ? 4 : 2} selected={isHorror}>
            <FarmVisitorSprite
              who={currentId}
              activity={isHorror ? 'talk' : 'idle'}
              emotionPose={isHorror ? 'neutral' : emotionPose}
              size={34}
              active
              centered
            />
          </FarmSlotFrame>
          <View style={{ flex: 1 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
              <FarmText variant="title" style={{ color: isHorror ? '#FFB7CE' : '#533B24', fontSize: 15, fontWeight: '800' }}>
                {profile.name}
              </FarmText>
              {!isHorror && record ? (
                <FarmText style={{ color: '#7D6A52', fontSize: 10.5 }}>
                  好感 {record.affinity}/100
                </FarmText>
              ) : null}
              <View
                style={{
                  paddingHorizontal: 6,
                  paddingVertical: 1.5,
                  borderRadius: 99,
                  backgroundColor: isHorror ? 'rgba(196,61,105,0.28)' : online ? 'rgba(143,209,79,0.16)' : '#F1E5CC',
                }}
              >
                <FarmText style={{ color: isHorror ? '#FF90B3' : online ? '#5F7749' : '#8A785E', fontSize: 8.5, fontWeight: '700' }}>
                  {isHorror ? '深夜高危闹觉' : online ? '在线访客' : '本地台词'}
                </FarmText>
              </View>
              {weatherBehavior.badge && (!isHorror || weather === 'rain') ? (
                <View
                  style={{
                    paddingHorizontal: 6,
                    paddingVertical: 1.5,
                    borderRadius: 99,
                    backgroundColor: isHorror
                      ? 'rgba(72,149,218,0.24)'
                      : rainbow
                        ? '#FDF0D1'
                        : '#E1EEF9',
                  }}
                >
                  <FarmText
                    style={{
                      color: isHorror ? '#9FD3FF' : rainbow ? '#9C6219' : '#2F638C',
                      fontSize: 8.5,
                      fontWeight: '700',
                    }}
                  >
                    {weatherBehavior.badge}
                  </FarmText>
                </View>
              ) : null}
              {isDafeiyu && whaleSync?.enabled !== false ? (
                <View
                  style={{
                    paddingHorizontal: 6,
                    paddingVertical: 1.5,
                    borderRadius: 99,
                    backgroundColor: '#E1F2FF',
                    borderWidth: 1,
                    borderColor: '#98CDF6',
                  }}
                >
                  <FarmText style={{ color: '#2167A0', fontSize: 8.5, fontWeight: '800' }}>
                    已同步课表人设与记忆
                  </FarmText>
                </View>
              ) : null}
            </View>
            <FarmText style={{ color: isHorror ? '#BCA2C9' : '#857056', fontSize: 10.5, marginTop: 2 }}>
              {profile.title}
              {!isHorror && stayHint ? ` · ${stayHint}` : ''}
            </FarmText>
          </View>

          {!isHorror ? (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <Pressable
                accessibilityRole="button"
                onPress={() => {
                  Keyboard.dismiss();
                  setGiftOpen(p => !p);
                }}
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 4,
                  paddingHorizontal: 9,
                  height: 28,
                  borderRadius: 99,
                  backgroundColor: giftOpen ? '#F8E6CC' : '#F4EAD7',
                  borderWidth: 1,
                  borderColor: giftOpen ? '#D59D53' : '#DFCFAF',
                }}
              >
                <FarmUiIcon name="gift" size={14} />
                <FarmText style={{ color: '#7D5224', fontSize: 10.5, fontWeight: '700' }}>
                  {giftOpen ? '收礼盒' : '送礼'}
                </FarmText>
              </Pressable>
              {onDismissVisitor ? (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="礼貌送别访客"
                  onPress={() => {
                    setGiftOpen(false);
                    setLastVisitorGift(null);
                    Keyboard.dismiss();
                    onDismissVisitor();
                  }}
                  style={{
                    paddingHorizontal: 8,
                    height: 28,
                    borderRadius: 99,
                    alignItems: 'center',
                    justifyContent: 'center',
                    backgroundColor: '#F3E8D4',
                    borderWidth: 1,
                    borderColor: '#DCC8A7',
                  }}
                >
                  <FarmText style={{ color: '#7B5F3E', fontSize: 10.5, fontWeight: '700' }}>
                    送别
                  </FarmText>
                </Pressable>
              ) : null}
            </View>
          ) : null}

          <Pressable
            accessibilityRole="button"
            accessibilityLabel="关闭访客互动"
            onPress={() => {
              setGiftOpen(false);
              setLastVisitorGift(null);
              Keyboard.dismiss();
              onClose();
            }}
            style={{
              width: 28,
              height: 28,
              borderRadius: 8,
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: isHorror ? '#382147' : '#F3E6D0',
            }}
          >
            <Ionicons name="close" size={16} color={isHorror ? '#E5B8D0' : '#8B7254'} />
          </Pressable>
        </View>

        {/* 四维数值化情绪条 */}
        {!isHorror && emotion ? (
          <View style={{ paddingHorizontal: 14, paddingBottom: 8 }}>
            <FarmEmotionMeter emotion={emotion} compact />
          </View>
        ) : null}

        {/* 恐怖徐睡阴专属：3 个爆笑驱逐选项（含洋妞介绍 / 骗他洋妞约玩 / 拔网线） */}
        {isHorror ? (
          <View style={{ paddingHorizontal: 14, paddingBottom: 8, gap: 7 }}>
            <View
              style={{
                padding: 10,
                borderRadius: 12,
                backgroundColor: 'rgba(130, 32, 76, 0.25)',
                borderWidth: 1,
                borderColor: 'rgba(214, 79, 125, 0.45)',
                gap: 7,
              }}
            >
              <FarmText style={{ color: '#FFD3E1', fontSize: 11.5, lineHeight: 17, fontWeight: '700' }}>
                恐怖徐睡阴正裹着黄白条纹被子、头朝下用大小手疯狂打瓦吵全农场睡觉！怎么把他赶走？
              </FarmText>
              <View style={{ gap: 6 }}>
                <FarmButton
                  label="介绍给他一位外国洋妞认识（秒杀劝退 +35币）"
                  tone="rose"
                  onPress={() => onBanishHorror('introduce_foreign_girl')}
                  style={{ minHeight: 38, paddingVertical: 6 }}
                />
                <FarmButton
                  label="骗他有外国洋妞在集市口约他去玩（调虎离山 +35币）"
                  tone="paper"
                  onPress={() => onBanishHorror('trick_foreign_girl')}
                  style={{ minHeight: 38, paddingVertical: 6 }}
                />
                <FarmButton
                  label="狠心拔掉网线 & 合上电脑（物理断网 +35币）"
                  tone="blue"
                  onPress={() => onBanishHorror('unplug')}
                  style={{ minHeight: 38, paddingVertical: 6 }}
                />
              </View>
            </View>
          </View>
        ) : (
          <>
            {/* 常规访客快捷话题 */}
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
              contentContainerStyle={{ gap: 6, paddingHorizontal: 14, paddingBottom: 8 }}
            >
              {profile.topics.map(topic => (
                <Pressable
                  key={topic}
                  disabled={busy}
                  onPress={() => onSend(topic)}
                  style={{
                    paddingHorizontal: 10,
                    paddingVertical: 5.5,
                    borderRadius: 99,
                    backgroundColor: '#F4EAD7',
                    borderWidth: 1,
                    borderColor: '#DECBA9',
                    opacity: busy ? 0.5 : 1,
                  }}
                >
                  <FarmText style={{ color: '#654F36', fontSize: 10.5 }}>{topic}</FarmText>
                </Pressable>
              ))}
            </ScrollView>

            {/* 访客真实送礼托盘 */}
            {giftOpen ? (
              <FarmParchmentCard tone="warm" style={{ marginHorizontal: 14, marginBottom: 8, padding: 10, gap: 8 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 6, flexWrap: 'wrap' }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
                    <FarmUiIcon name="gift" size={15} />
                    <FarmText style={{ color: '#63492D', fontSize: 11, fontWeight: '800' }}>
                      背包真实招待 · 给{profile.name}
                    </FarmText>
                  </View>
                  <View
                    style={{
                      paddingHorizontal: 7,
                      paddingVertical: 1.5,
                      borderRadius: 99,
                      backgroundColor: '#EAF0DD',
                      borderWidth: 1,
                      borderColor: '#C5D5AA',
                    }}
                  >
                    <FarmText style={{ color: '#4A6332', fontSize: 9, fontWeight: '700' }}>
                      扣减背包库存
                    </FarmText>
                  </View>
                </View>

                {!giftOptions.length ? (
                  <FarmText style={{ color: '#8C775D', fontSize: 11, lineHeight: 16 }}>
                    仓库里暂时还没有可招待的收获作物。聊天里嘴上说说不算真招待，先去田里收几株吧！
                  </FarmText>
                ) : (
                  <>
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 7, paddingVertical: 2 }}>
                      {craftableDishes.map(recipe => {
                        const key = `dish:${recipe.id}`;
                        const loved = profile.lovedGifts.includes(recipe.id);
                        const selected = activeGift?.key === key;
                        return (
                          <Pressable
                            key={key}
                            accessibilityRole="button"
                            onPress={() => {
                              setSelectedGiftKey(key);
                              setLastVisitorGift(null);
                            }}
                            style={{
                              width: 68,
                              alignItems: 'center',
                              gap: 2,
                              paddingVertical: 4,
                              paddingHorizontal: 3,
                              borderRadius: 11,
                              backgroundColor: selected ? '#FFF8E8' : 'transparent',
                              borderWidth: 1.2,
                              borderColor: selected ? '#D28E36' : 'transparent',
                            }}
                          >
                            <FarmSlotFrame size={46} rarity={loved ? 4 : 3} selected={selected || loved}>
                              <FarmDishSprite kind={recipe.id} size={32} />
                            </FarmSlotFrame>
                            <FarmText numberOfLines={1} style={{ color: '#584027', fontSize: 10, fontWeight: selected || loved ? '800' : '700' }}>
                              {loved ? '★' : ''}{recipe.label}
                            </FarmText>
                            <FarmText style={{ color: '#8A6A42', fontSize: 8.5 }}>现做 {recipe.fee}币</FarmText>
                          </Pressable>
                        );
                      })}
                      {availableCrops.map(crop => {
                        const key = `crop:${crop}`;
                        const count = stockCount(economy.inventory[crop]);
                        const loved = profile.lovedGifts.includes(crop);
                        const selected = activeGift?.key === key;
                        return (
                          <Pressable
                            key={key}
                            accessibilityRole="button"
                            onPress={() => {
                              setSelectedGiftKey(key);
                              setLastVisitorGift(null);
                            }}
                            style={{
                              width: 62,
                              alignItems: 'center',
                              gap: 2,
                              paddingVertical: 4,
                              paddingHorizontal: 3,
                              borderRadius: 11,
                              backgroundColor: selected ? '#FFF8E8' : 'transparent',
                              borderWidth: 1.2,
                              borderColor: selected ? '#D28E36' : 'transparent',
                            }}
                          >
                            <FarmSlotFrame size={46} rarity={loved ? 4 : 1} selected={selected || loved}>
                              <CropSprite kind={crop} size={30} />
                            </FarmSlotFrame>
                            <FarmText numberOfLines={1} style={{ color: '#584027', fontSize: 10, fontWeight: selected || loved ? '800' : '600' }}>
                              {loved ? '★' : ''}{CROP_LABELS[crop]}
                            </FarmText>
                            <FarmText style={{ color: '#8A755B', fontSize: 8.5 }}>余 ×{count}</FarmText>
                          </Pressable>
                        );
                      })}
                    </ScrollView>

                    {activeGift ? (
                      <View
                        style={{
                          flexDirection: 'row',
                          alignItems: 'center',
                          gap: 8,
                          padding: 7.5,
                          borderRadius: 11,
                          backgroundColor: '#FCF5E6',
                          borderWidth: 1,
                          borderColor: '#E1C598',
                        }}
                      >
                        <View style={{ flex: 1, gap: 2 }}>
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5, flexWrap: 'wrap' }}>
                            <FarmText style={{ color: '#533B22', fontSize: 11, fontWeight: '800' }}>
                              {activeGift.kind === 'dish' ? activeGift.recipe.label : CROP_LABELS[activeGift.crop]}
                            </FarmText>
                            <View
                              style={{
                                paddingHorizontal: 5,
                                paddingVertical: 1,
                                borderRadius: 99,
                                backgroundColor: activeGift.loved ? '#FBE5BE' : '#EFE3CE',
                              }}
                            >
                              <FarmText style={{ color: activeGift.loved ? '#995712' : '#755B3D', fontSize: 8.5, fontWeight: '800' }}>
                                {activeGift.loved ? '★ 最爱 · +7好感' : '心意 · +3好感'}
                              </FarmText>
                            </View>
                          </View>
                          <FarmText style={{ color: '#7D6344', fontSize: 9.5 }} numberOfLines={1}>
                            {activeGift.kind === 'dish'
                              ? `消耗 ${(Object.entries(activeGift.recipe.inputs) as [CropKind, number][]).map(([k, n]) => `${CROP_LABELS[k]}×${n}`).join(' + ')} + ${activeGift.recipe.fee}币`
                              : (() => {
                                  const cur = stockCount(economy.inventory[activeGift.crop]);
                                  return `扣除背包 ${CROP_LABELS[activeGift.crop]} ×1（余 ${cur} → ${Math.max(0, cur - 1)}）`;
                                })()}
                          </FarmText>
                        </View>
                        <Pressable
                          accessibilityRole="button"
                          accessibilityLabel={`招待${profile.name}真实礼物`}
                          onPress={handleConfirmVisitorGift}
                          style={{
                            flexDirection: 'row',
                            alignItems: 'center',
                            gap: 4,
                            paddingHorizontal: 10,
                            paddingVertical: 7,
                            borderRadius: 99,
                            backgroundColor: '#C57B2B',
                            borderWidth: 1,
                            borderColor: '#A7631C',
                          }}
                        >
                          <Ionicons name="gift-outline" size={12.5} color="#FFFDF7" />
                          <FarmText style={{ color: '#FFFDF7', fontSize: 10.5, fontWeight: '800' }}>
                            递出招待
                          </FarmText>
                        </Pressable>
                      </View>
                    ) : null}
                  </>
                )}

                {recentVisitorReceipt ? (
                  <View
                    style={{
                      flexDirection: 'row',
                      alignItems: 'center',
                      gap: 5,
                      paddingHorizontal: 8,
                      paddingVertical: 4.5,
                      borderRadius: 8,
                      backgroundColor: '#E9F2DC',
                      borderWidth: 1,
                      borderColor: '#C1D5A3',
                    }}
                  >
                    <Ionicons name="checkmark-circle" size={12.5} color="#4F7332" />
                    <FarmText style={{ color: '#455F2E', fontSize: 9.5, fontWeight: '700', flex: 1 }}>
                      已从背包扣减并招待{profile.name}「{recentVisitorReceipt}」
                    </FarmText>
                  </View>
                ) : null}
              </FarmParchmentCard>
            ) : null}
          </>
        )}

        <FarmChatConversation
          messages={cleanedMessages}
          busy={busy}
          value={draft}
          onChange={onChangeDraft}
          onSend={() => onSend()}
          placeholder={
            isHorror
              ? '当面吐槽恐怖徐睡阴，或提外国洋妞试试…'
              : isNpcRefusingChat(emotion)
                ? `${profile.name}正在拒绝沟通，输入一句真诚道歉或点右上角送礼破冰…`
                : `和来串门的${profile.name}聊聊天…`
          }
          maxHeight={isHorror ? Math.max(120, maxHeight - 130) : maxHeight}
          hint={hint}
        />
      </View>
    </FarmNPCSheet>
  );
}
