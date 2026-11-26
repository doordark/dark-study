import Ionicons from '@expo/vector-icons/Ionicons';
import { useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import {
  CROP_KINDS,
  CROP_LABELS,
  RECIPES,
  stockCount,
  type CropKind,
  type Economy,
  type Recipe,
} from '@/utils/farmEconomy';
import { RESIDENTS, type ResidentId } from '@/utils/farmLife';
import { giftTierFor, type GiftTier, type ResidentWish } from '@/utils/farmSocial';
import { CropSprite, FarmDishSprite, FarmToolSprite, FarmUiIcon } from './CropSprite';
import { FarmParchmentCard, FarmSlotFrame, FarmText } from './FarmSkin';

type SelectedGift =
  | { kind: 'dish'; recipe: Recipe }
  | { kind: 'crop'; crop: CropKind };

const TIER_META: Record<GiftTier, { label: string; gain: string; bg: string; color: string }> = {
  loved: { label: '★ 最爱', gain: '+6好感', bg: '#FBE5BE', color: '#995712' },
  liked: { label: '♡ 喜欢', gain: '+3好感', bg: '#E4EED4', color: '#45612D' },
  normal: { label: '心意', gain: '+2好感', bg: '#EFE3CE', color: '#755B3D' },
};

function formatRecipeInputs(recipe: Recipe): string {
  return (Object.entries(recipe.inputs) as [CropKind, number][])
    .map(([crop, need]) => `${CROP_LABELS[crop]}×${need}`)
    .join(' + ');
}

export function FarmGiftBar({
  who,
  economy,
  coins,
  wish,
  onGiveCrop,
  onGiveDish,
  onFulfillWish,
}: {
  who: ResidentId;
  economy: Economy;
  coins: number;
  wish?: ResidentWish;
  onGiveCrop: (crop: CropKind) => void;
  onGiveDish: (recipe: Recipe) => void;
  onFulfillWish: (wish: ResidentWish) => void;
}) {
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [lastSent, setLastSent] = useState<{ who: ResidentId; label: string } | null>(null);

  const availableCrops = CROP_KINDS
    .filter(kind => stockCount(economy.inventory[kind]) > 0)
    .sort((a, b) => {
      const rank = { loved: 0, liked: 1, normal: 2 };
      return rank[giftTierFor(who, a)] - rank[giftTierFor(who, b)];
    });

  const craftableDishes = economy.kitchen
    ? RECIPES.filter(recipe => {
        if (coins < recipe.fee) return false;
        return (Object.entries(recipe.inputs) as [CropKind, number][]).every(
          ([crop, need]) => stockCount(economy.inventory[crop]) >= need,
        );
      }).sort((a, b) => {
        const rank = { loved: 0, liked: 1, normal: 2 };
        return rank[giftTierFor(who, a.id)] - rank[giftTierFor(who, b.id)];
      })
    : [];

  const allOptions: { key: string; item: SelectedGift; tier: GiftTier }[] = [
    ...craftableDishes.map(recipe => ({
      key: `dish:${recipe.id}`,
      item: { kind: 'dish' as const, recipe },
      tier: giftTierFor(who, recipe.id),
    })),
    ...availableCrops.map(crop => ({
      key: `crop:${crop}`,
      item: { kind: 'crop' as const, crop },
      tier: giftTierFor(who, crop),
    })),
  ];

  const activeOption = allOptions.find(opt => opt.key === selectedKey) ?? allOptions[0] ?? null;
  const wishStock = wish ? stockCount(economy.inventory[wish.crop]) : 0;
  const canFulfill = Boolean(wish && !wish.fulfilled && wishStock >= wish.quantity);
  const recentReceipt = lastSent && lastSent.who === who ? lastSent.label : null;

  const handleConfirmGive = () => {
    if (!activeOption) return;
    if (activeOption.item.kind === 'dish') {
      const recipe = activeOption.item.recipe;
      onGiveDish(recipe);
      setLastSent({ who, label: `${recipe.label}（现做）` });
    } else {
      const crop = activeOption.item.crop;
      onGiveCrop(crop);
      setLastSent({ who, label: `${CROP_LABELS[crop]} ×1` });
    }
  };

  return (
    <FarmParchmentCard
      tone="warm"
      style={{
        marginHorizontal: 14,
        marginBottom: 8,
        padding: 10,
        gap: 9,
      }}
    >
      {wish && !wish.fulfilled ? (
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: 8,
            padding: 8,
            borderRadius: 11,
            backgroundColor: '#EDF2E1',
            borderWidth: 1,
            borderColor: '#C4D4A8',
          }}
        >
          <FarmSlotFrame size={38} rarity={canFulfill ? 4 : 1} selected={canFulfill}>
            <CropSprite kind={wish.crop} size={25} />
          </FarmSlotFrame>
          <View style={{ flex: 1 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, flexWrap: 'wrap' }}>
              <FarmUiIcon name="wish" size={14} />
              <FarmText style={{ color: '#425731', fontSize: 11.5, fontWeight: '800' }}>
                今日心愿：{wish.quantity} 份{CROP_LABELS[wish.crop]}
              </FarmText>
              <FarmText style={{ color: '#61744F', fontSize: 9.5 }}>
                （背包余 ×{wishStock}）
              </FarmText>
            </View>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2, flexWrap: 'wrap' }}>
              <FarmText style={{ color: '#61744F', fontSize: 10 }} numberOfLines={1}>
                {wish.reason}
              </FarmText>
              <FarmUiIcon name="coin" size={11} />
              <FarmText style={{ color: '#8A6329', fontSize: 10, fontWeight: '700' }}>{wish.rewardCoins}</FarmText>
              <FarmToolSprite kind="compost" size={12} />
              <FarmText style={{ color: '#4B6935', fontSize: 10, fontWeight: '700' }}>+1 · +8好感</FarmText>
            </View>
          </View>
          <Pressable
            accessibilityRole="button"
            disabled={!canFulfill}
            onPress={() => {
              onFulfillWish(wish);
              setLastSent({ who, label: `心愿 ${CROP_LABELS[wish.crop]} ×${wish.quantity}` });
            }}
            style={{
              paddingHorizontal: 10,
              paddingVertical: 6.5,
              borderRadius: 99,
              backgroundColor: canFulfill ? '#6E8F49' : '#DCE2D0',
              borderWidth: 1,
              borderColor: canFulfill ? '#597738' : '#C9D2BA',
            }}
          >
            <FarmText style={{ color: canFulfill ? '#FFFDF7' : '#8A967D', fontSize: 10.5, fontWeight: '700' }}>
              {canFulfill ? '递出实现' : `缺${Math.max(1, wish.quantity - wishStock)}份`}
            </FarmText>
          </Pressable>
        </View>
      ) : null}

      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 6, flexWrap: 'wrap' }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
          <FarmUiIcon name="gift" size={16} />
          <FarmText style={{ color: '#6A4E31', fontSize: 11.5, fontWeight: '800' }}>
            背包真实送礼 · 给{RESIDENTS[who].name}
          </FarmText>
        </View>
        <View
          style={{
            paddingHorizontal: 7,
            paddingVertical: 2,
            borderRadius: 99,
            backgroundColor: '#EAF0DD',
            borderWidth: 1,
            borderColor: '#C5D5AA',
          }}
        >
          <FarmText style={{ color: '#4A6332', fontSize: 9.5, fontWeight: '700' }}>
            扣减库存 · 写入送礼记忆
          </FarmText>
        </View>
      </View>

      {!allOptions.length ? (
        <View
          style={{
            padding: 10,
            borderRadius: 10,
            backgroundColor: '#FBF4E5',
            borderWidth: 1,
            borderColor: '#E5D3B3',
          }}
        >
          <FarmText style={{ color: '#8A7358', fontSize: 11, lineHeight: 16 }}>
            背包里还没有可递出的收获作物或点心。聊天里嘴上说说不算真送礼哦，先去田里收几株再来送吧！
          </FarmText>
        </View>
      ) : (
        <>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 7, paddingVertical: 2 }}>
            {craftableDishes.map(recipe => {
              const key = `dish:${recipe.id}`;
              const tier = giftTierFor(who, recipe.id);
              const loved = tier === 'loved';
              const selected = activeOption?.key === key;
              return (
                <Pressable
                  key={key}
                  accessibilityRole="button"
                  accessibilityLabel={`选择现做${recipe.label}`}
                  onPress={() => {
                    setSelectedKey(key);
                    setLastSent(null);
                  }}
                  style={{
                    width: 72,
                    alignItems: 'center',
                    gap: 3,
                    paddingVertical: 5,
                    paddingHorizontal: 4,
                    borderRadius: 12,
                    backgroundColor: selected ? '#FFF8E8' : 'transparent',
                    borderWidth: 1.2,
                    borderColor: selected ? '#D28E36' : 'transparent',
                  }}
                >
                  <View style={{ position: 'relative' }}>
                    <FarmSlotFrame size={48} rarity={loved ? 4 : 3} selected={selected || loved}>
                      <FarmDishSprite kind={recipe.id} size={34} />
                    </FarmSlotFrame>
                    {loved ? (
                      <View style={{ position: 'absolute', top: -3, right: -3, backgroundColor: '#D58C35', borderRadius: 99, paddingHorizontal: 4, paddingVertical: 0.5 }}>
                        <FarmText style={{ color: '#FFFDF7', fontSize: 8.5, fontWeight: '800' }}>★</FarmText>
                      </View>
                    ) : null}
                  </View>
                  <FarmText numberOfLines={1} style={{ color: '#5A4125', fontSize: 10, fontWeight: selected || loved ? '800' : '700' }}>
                    {recipe.label}
                  </FarmText>
                  <FarmText style={{ color: '#8A6A42', fontSize: 9 }}>现做 {recipe.fee}币</FarmText>
                </Pressable>
              );
            })}
            {availableCrops.map(crop => {
              const key = `crop:${crop}`;
              const count = stockCount(economy.inventory[crop]);
              const tier = giftTierFor(who, crop);
              const loved = tier === 'loved';
              const selected = activeOption?.key === key;
              return (
                <Pressable
                  key={key}
                  accessibilityRole="button"
                  accessibilityLabel={`选择${CROP_LABELS[crop]}`}
                  onPress={() => {
                    setSelectedKey(key);
                    setLastSent(null);
                  }}
                  style={{
                    width: 66,
                    alignItems: 'center',
                    gap: 3,
                    paddingVertical: 5,
                    paddingHorizontal: 4,
                    borderRadius: 12,
                    backgroundColor: selected ? '#FFF8E8' : 'transparent',
                    borderWidth: 1.2,
                    borderColor: selected ? '#D28E36' : 'transparent',
                  }}
                >
                  <View style={{ position: 'relative' }}>
                    <FarmSlotFrame size={48} rarity={loved ? 4 : tier === 'liked' ? 2 : 1} selected={selected || loved}>
                      <CropSprite kind={crop} size={31} />
                    </FarmSlotFrame>
                    {loved ? (
                      <View style={{ position: 'absolute', top: -3, right: -3, backgroundColor: '#D58C35', borderRadius: 99, paddingHorizontal: 4, paddingVertical: 0.5 }}>
                        <FarmText style={{ color: '#FFFDF7', fontSize: 8.5, fontWeight: '800' }}>★</FarmText>
                      </View>
                    ) : null}
                  </View>
                  <FarmText numberOfLines={1} style={{ color: '#5A4125', fontSize: 10, fontWeight: selected || loved ? '800' : '600' }}>
                    {CROP_LABELS[crop]}
                  </FarmText>
                  <FarmText style={{ color: '#8A755B', fontSize: 9 }}>余 ×{count}</FarmText>
                </Pressable>
              );
            })}
          </ScrollView>

          {activeOption ? (
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: 8,
                padding: 8,
                borderRadius: 12,
                backgroundColor: '#FCF5E6',
                borderWidth: 1,
                borderColor: '#E1C598',
              }}
            >
              <FarmSlotFrame size={38} rarity={activeOption.tier === 'loved' ? 4 : 2} selected>
                {activeOption.item.kind === 'dish' ? (
                  <FarmDishSprite kind={activeOption.item.recipe.id} size={28} />
                ) : (
                  <CropSprite kind={activeOption.item.crop} size={25} />
                )}
              </FarmSlotFrame>
              <View style={{ flex: 1, gap: 2 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5, flexWrap: 'wrap' }}>
                  <FarmText style={{ color: '#533B22', fontSize: 11.5, fontWeight: '800' }}>
                    {activeOption.item.kind === 'dish'
                      ? activeOption.item.recipe.label
                      : CROP_LABELS[activeOption.item.crop]}
                  </FarmText>
                  <View
                    style={{
                      paddingHorizontal: 5,
                      paddingVertical: 1,
                      borderRadius: 99,
                      backgroundColor: TIER_META[activeOption.tier].bg,
                    }}
                  >
                    <FarmText style={{ color: TIER_META[activeOption.tier].color, fontSize: 9, fontWeight: '800' }}>
                      {TIER_META[activeOption.tier].label} · {TIER_META[activeOption.tier].gain}
                    </FarmText>
                  </View>
                </View>
                <FarmText style={{ color: '#7D6344', fontSize: 10 }} numberOfLines={1}>
                  {activeOption.item.kind === 'dish'
                    ? `消耗 ${formatRecipeInputs(activeOption.item.recipe)} + ${activeOption.item.recipe.fee}币`
                    : (() => {
                        const cur = stockCount(economy.inventory[activeOption.item.crop]);
                        return `扣除背包 ${CROP_LABELS[activeOption.item.crop]} ×1（余 ${cur} → ${Math.max(0, cur - 1)}）`;
                      })()}
                </FarmText>
              </View>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`向${RESIDENTS[who].name}递出真实礼物`}
                onPress={handleConfirmGive}
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 4,
                  paddingHorizontal: 11,
                  paddingVertical: 7.5,
                  borderRadius: 99,
                  backgroundColor: '#C57B2B',
                  borderWidth: 1,
                  borderColor: '#A7631C',
                }}
              >
                <Ionicons name="gift-outline" size={13} color="#FFFDF7" />
                <FarmText style={{ color: '#FFFDF7', fontSize: 11, fontWeight: '800' }}>
                  递出礼物
                </FarmText>
              </Pressable>
            </View>
          ) : null}
        </>
      )}

      {recentReceipt ? (
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: 5,
            paddingHorizontal: 8,
            paddingVertical: 5,
            borderRadius: 9,
            backgroundColor: '#E9F2DC',
            borderWidth: 1,
            borderColor: '#C1D5A3',
          }}
        >
          <Ionicons name="checkmark-circle" size={13} color="#4F7332" />
          <FarmText style={{ color: '#455F2E', fontSize: 10, fontWeight: '700', flex: 1 }}>
            已从背包扣减并递出「{recentReceipt}」，记入{RESIDENTS[who].name}真实送礼记录
          </FarmText>
        </View>
      ) : null}
    </FarmParchmentCard>
  );
}
