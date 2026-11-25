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
import { giftTierFor, type ResidentWish } from '@/utils/farmSocial';
import { CropSprite, FarmDishSprite, FarmToolSprite, FarmUiIcon } from './CropSprite';
import { FarmParchmentCard, FarmSlotFrame, FarmText } from './FarmSkin';

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
      })
    : [];

  const canFulfill = wish && !wish.fulfilled && stockCount(economy.inventory[wish.crop]) >= wish.quantity;

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
          <FarmSlotFrame size={38} rarity={canFulfill ? 4 : 1} selected={Boolean(canFulfill)}>
            <CropSprite kind={wish.crop} size={25} />
          </FarmSlotFrame>
          <View style={{ flex: 1 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
              <FarmUiIcon name="wish" size={14} />
              <FarmText style={{ color: '#425731', fontSize: 11.5, fontWeight: '800' }}>
                今日心愿：{wish.quantity} 份{CROP_LABELS[wish.crop]}
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
            disabled={!canFulfill}
            onPress={() => onFulfillWish(wish)}
            style={{
              paddingHorizontal: 10,
              paddingVertical: 6,
              borderRadius: 99,
              backgroundColor: canFulfill ? '#7D995A' : '#DCE2D0',
            }}
          >
            <FarmText style={{ color: canFulfill ? '#FFFDF7' : '#8A967D', fontSize: 10.5, fontWeight: '700' }}>
              {canFulfill ? '实现心愿' : `缺${CROP_LABELS[wish.crop]}`}
            </FarmText>
          </Pressable>
        </View>
      ) : null}

      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
        <FarmUiIcon name="gift" size={16} />
        <FarmText style={{ color: '#6A4E31', fontSize: 11.5, fontWeight: '800' }}>
          挑一份心意送给{RESIDENTS[who].name}（金框 ★ 为对方最爱）
        </FarmText>
      </View>

      {!availableCrops.length && !craftableDishes.length ? (
        <FarmText style={{ color: '#947F65', fontSize: 11 }}>
          仓库里还没有可送的收获作物。先去田里收几株吧！
        </FarmText>
      ) : (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingVertical: 2 }}>
          {craftableDishes.map(recipe => {
            const loved = giftTierFor(who, recipe.id) === 'loved';
            return (
              <Pressable
                key={`dish-${recipe.id}`}
                onPress={() => onGiveDish(recipe)}
                style={{ width: 68, alignItems: 'center', gap: 3 }}
              >
                <View style={{ position: 'relative' }}>
                  <FarmSlotFrame size={50} rarity={loved ? 4 : 3} selected={loved}>
                    <FarmDishSprite kind={recipe.id} size={36} />
                  </FarmSlotFrame>
                  {loved ? (
                    <View style={{ position: 'absolute', top: -3, right: -3, backgroundColor: '#D58C35', borderRadius: 99, paddingHorizontal: 4, paddingVertical: 0.5 }}>
                      <FarmText style={{ color: '#FFFDF7', fontSize: 8.5, fontWeight: '800' }}>★</FarmText>
                    </View>
                  ) : null}
                </View>
                <FarmText numberOfLines={1} style={{ color: '#5A4125', fontSize: 10, fontWeight: '700' }}>
                  {recipe.label}
                </FarmText>
                <FarmText style={{ color: '#8A6A42', fontSize: 9 }}>现做 {recipe.fee}币</FarmText>
              </Pressable>
            );
          })}
          {availableCrops.map(crop => {
            const count = stockCount(economy.inventory[crop]);
            const tier = giftTierFor(who, crop);
            const loved = tier === 'loved';
            return (
              <Pressable
                key={`crop-${crop}`}
                onPress={() => onGiveCrop(crop)}
                style={{ width: 62, alignItems: 'center', gap: 3 }}
              >
                <View style={{ position: 'relative' }}>
                  <FarmSlotFrame size={50} rarity={loved ? 4 : tier === 'liked' ? 2 : 1} selected={loved}>
                    <CropSprite kind={crop} size={32} />
                  </FarmSlotFrame>
                  {loved ? (
                    <View style={{ position: 'absolute', top: -3, right: -3, backgroundColor: '#D58C35', borderRadius: 99, paddingHorizontal: 4, paddingVertical: 0.5 }}>
                      <FarmText style={{ color: '#FFFDF7', fontSize: 8.5, fontWeight: '800' }}>★</FarmText>
                    </View>
                  ) : null}
                </View>
                <FarmText numberOfLines={1} style={{ color: '#5A4125', fontSize: 10, fontWeight: loved ? '800' : '600' }}>
                  {CROP_LABELS[crop]}
                </FarmText>
                <FarmText style={{ color: '#8A755B', fontSize: 9 }}>余 ×{count}</FarmText>
              </Pressable>
            );
          })}
        </ScrollView>
      )}
    </FarmParchmentCard>
  );
}
