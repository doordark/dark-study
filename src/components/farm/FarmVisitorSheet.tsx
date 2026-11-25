import Ionicons from '@expo/vector-icons/Ionicons';
import { useState } from 'react';
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
  type FarmEmotionState,
} from '@/utils/farmEmotion';
import {
  resolveVisitorDisplayProfile,
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
  onClose: () => void;
  maxHeight: number;
  weather?: FarmWeather;
  rainbow?: boolean;
  emotion?: FarmEmotionState;
  whaleSync?: WhaleVisitorSyncContext;
}) {
  const [giftOpen, setGiftOpen] = useState(false);
  const currentId: VisitorId = who ?? 'huboqi';
  const profile = resolveVisitorDisplayProfile(currentId, whaleSync);
  const isHorror = currentId === 'dark_xushuiyin';
  const isDafeiyu = currentId === 'dafeiyu';
  const weatherBehavior = visitorWeatherBehavior(currentId, weather, rainbow, whaleSync);
  const emotionPose = emotion ? describeFarmEmotion(emotion).pose : 'neutral';

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
      )
    : [];

  return (
    <FarmNPCSheet
      visible={visible && who !== null}
      onClose={() => {
        setGiftOpen(false);
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
            </FarmText>
          </View>

          {!isHorror ? (
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
          ) : null}

          <Pressable
            accessibilityRole="button"
            accessibilityLabel="关闭访客互动"
            onPress={() => {
              setGiftOpen(false);
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

            {/* 访客送礼托盘 */}
            {giftOpen ? (
              <FarmParchmentCard tone="warm" style={{ marginHorizontal: 14, marginBottom: 8, padding: 10, gap: 7 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
                  <FarmUiIcon name="gift" size={15} />
                  <FarmText style={{ color: '#63492D', fontSize: 11, fontWeight: '800' }}>
                    招待来串门的{profile.name}（金框 ★ 为对方最爱）
                  </FarmText>
                </View>
                {!availableCrops.length && !craftableDishes.length ? (
                  <FarmText style={{ color: '#8C775D', fontSize: 11 }}>仓库里暂时还没有可招待的收获作物。</FarmText>
                ) : (
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
                    {craftableDishes.map(recipe => {
                      const loved = profile.lovedGifts.includes(recipe.id);
                      return (
                        <Pressable key={recipe.id} onPress={() => onGiveDish(currentId as NormalVisitorId, recipe)} style={{ width: 64, alignItems: 'center', gap: 2 }}>
                          <FarmSlotFrame size={46} rarity={loved ? 4 : 3} selected={loved}>
                            <FarmDishSprite kind={recipe.id} size={32} />
                          </FarmSlotFrame>
                          <FarmText numberOfLines={1} style={{ color: '#584027', fontSize: 10, fontWeight: '700' }}>
                            {loved ? '★' : ''}{recipe.label}
                          </FarmText>
                        </Pressable>
                      );
                    })}
                    {availableCrops.map(crop => {
                      const loved = profile.lovedGifts.includes(crop);
                      return (
                        <Pressable key={crop} onPress={() => onGiveCrop(currentId as NormalVisitorId, crop)} style={{ width: 58, alignItems: 'center', gap: 2 }}>
                          <FarmSlotFrame size={46} rarity={loved ? 4 : 1} selected={loved}>
                            <CropSprite kind={crop} size={30} />
                          </FarmSlotFrame>
                          <FarmText numberOfLines={1} style={{ color: '#584027', fontSize: 10 }}>
                            {loved ? '★' : ''}{CROP_LABELS[crop]}×{stockCount(economy.inventory[crop])}
                          </FarmText>
                        </Pressable>
                      );
                    })}
                  </ScrollView>
                )}
              </FarmParchmentCard>
            ) : null}
          </>
        )}

        <FarmChatConversation
          messages={messages}
          busy={busy}
          value={draft}
          onChange={onChangeDraft}
          onSend={() => onSend()}
          placeholder={isHorror ? '当面吐槽恐怖徐睡阴，或提外国洋妞试试…' : `和来串门的${profile.name}聊聊天…`}
          maxHeight={isHorror ? Math.max(120, maxHeight - 130) : maxHeight}
          hint={hint}
        />
      </View>
    </FarmNPCSheet>
  );
}
