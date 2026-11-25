import Ionicons from '@expo/vector-icons/Ionicons';
import { useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { playSfx } from '@/services/soundEffects';
import { RECIPES, stockCount, type CropKind, type Economy, type Recipe } from '@/utils/farmEconomy';
import { RESIDENTS, RESIDENT_IDS } from '@/utils/farmLife';
import type { ActiveFestival, FarmPostcard } from '@/utils/farmFestivals';
import { FarmDishSprite, FarmPropSprite, FarmUiIcon } from './CropSprite';
import { FarmNPCSheet } from './FarmNPCSheet';
import { FarmPersonSprite } from './FarmPersonSprite';
import { FarmButton, FarmIllustration, FarmParchmentCard, FarmSlotFrame, FarmText } from './FarmSkin';

export function FarmFestivalSheet({
  visible,
  onClose,
  festival,
  economy,
  coins,
  postcards,
  onHost,
  maxHeight,
}: {
  visible: boolean;
  onClose: () => void;
  festival: ActiveFestival;
  economy: Economy;
  coins: number;
  postcards: FarmPostcard[];
  onHost: (recipe?: Recipe) => FarmPostcard | null;
  maxHeight: number;
}) {
  const [selectedRecipe, setSelectedRecipe] = useState<Recipe | null>(null);
  const [latestCard, setLatestCard] = useState<FarmPostcard | null>(null);

  const craftableDishes = economy.kitchen
    ? RECIPES.filter(recipe => {
        if (coins < recipe.fee) return false;
        return (Object.entries(recipe.inputs) as [CropKind, number][]).every(
          ([crop, need]) => stockCount(economy.inventory[crop]) >= need,
        );
      })
    : [];

  const handleHost = () => {
    const card = onHost(selectedRecipe ?? undefined);
    if (card) {
      playSfx('farm_festival', { volume: 0.76 });
      setLatestCard(card);
      setSelectedRecipe(null);
    }
  };

  return (
    <FarmNPCSheet visible={visible} onClose={onClose}>
      <View style={{ borderTopLeftRadius: 24, borderTopRightRadius: 24, backgroundColor: '#FFF9EF', overflow: 'hidden', flexShrink: 1 }}>
        <View style={{ paddingHorizontal: 14, paddingTop: 10 }}>
          <FarmIllustration theme="group" />
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingTop: 8, paddingBottom: 8, gap: 9 }}>
          <FarmSlotFrame size={40} rarity={4} selected>
            <FarmPropSprite name="campfire" size={28} />
          </FarmSlotFrame>
          <View style={{ flex: 1 }}>
            <FarmText variant="title" style={{ color: '#593A22', fontSize: 16, fontWeight: '800' }}>
              {festival.title}
            </FarmText>
            <FarmText style={{ color: '#8A7359', fontSize: 10.5, marginTop: 2 }}>
              {festival.subtitle}
            </FarmText>
          </View>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="关闭篝火节庆"
            onPress={onClose}
            style={{ width: 28, height: 28, borderRadius: 8, alignItems: 'center', justifyContent: 'center', backgroundColor: '#F3E6D0', borderWidth: 1, borderColor: '#DFCCA9' }}
          >
            <Ionicons name="close" size={16} color="#8B7254" />
          </Pressable>
        </View>

        <ScrollView style={{ maxHeight: Math.max(260, maxHeight + 48) }} contentContainerStyle={{ paddingHorizontal: 14, paddingBottom: 20, gap: 12 }} showsVerticalScrollIndicator={false}>
          <FarmParchmentCard tone="warm" style={{ gap: 10 }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-around', alignItems: 'center', paddingVertical: 4 }}>
              {RESIDENT_IDS.map(id => (
                <View key={id} style={{ alignItems: 'center', gap: 3 }}>
                  <FarmSlotFrame size={40} rarity={4}>
                    <FarmPersonSprite who={id} size={26} active={false} centered />
                  </FarmSlotFrame>
                  <FarmText style={{ color: '#5C442B', fontSize: 9.5, fontWeight: '700' }}>{RESIDENTS[id].name}</FarmText>
                </View>
              ))}
            </View>

            <FarmText style={{ color: '#785E43', fontSize: 11.5, lineHeight: 17 }}>
              可选一道现做厨房料理端上篝火桌（全员好感 +5，不选也可直接围炉喝花茶全员好感 +3）：
            </FarmText>

            {craftableDishes.length > 0 ? (
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
                {craftableDishes.map(recipe => {
                  const active = selectedRecipe?.id === recipe.id;
                  return (
                    <Pressable
                      key={recipe.id}
                      onPress={() => setSelectedRecipe(prev => (prev?.id === recipe.id ? null : recipe))}
                      style={{
                        flexDirection: 'row',
                        alignItems: 'center',
                        gap: 6,
                        padding: 6,
                        paddingRight: 10,
                        borderRadius: 12,
                        backgroundColor: active ? '#DCE7C7' : '#FFFBF2',
                        borderWidth: 1.2,
                        borderColor: active ? '#8AA665' : '#E0CEB3',
                      }}
                    >
                      <FarmSlotFrame size={34} rarity={active ? 4 : 1} selected={active}>
                        <FarmDishSprite kind={recipe.id} size={24} />
                      </FarmSlotFrame>
                      <View>
                        <FarmText style={{ color: '#523C27', fontSize: 11.5, fontWeight: '800' }}>{recipe.label}</FarmText>
                        <FarmText style={{ color: '#8A7359', fontSize: 9.5 }}>加工费 {recipe.fee} 币</FarmText>
                      </View>
                    </Pressable>
                  );
                })}
              </ScrollView>
            ) : (
              <FarmText style={{ color: '#947F65', fontSize: 11 }}>
                {economy.kitchen ? '手头材料暂不够现做大餐，先泡一壶热花茶开场吧！' : '解锁厨房后，聚会还能端上热腾腾的手作大餐！'}
              </FarmText>
            )}

            <FarmButton
              label={selectedRecipe ? `端上${selectedRecipe.label} · 点亮广场篝火` : '点亮广场篝火 · 开启围炉夜话'}
              tone="sage"
              onPress={handleHost}
            />
          </FarmParchmentCard>

          {latestCard ? (
            <FarmParchmentCard tone="sage" style={{ gap: 8 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, borderBottomWidth: 1, borderBottomColor: '#C5D5AA', paddingBottom: 6 }}>
                <FarmUiIcon name="wish" size={16} />
                <FarmText style={{ flex: 1, color: '#3E532B', fontSize: 13.5, fontWeight: '800' }}>
                  新鲜出炉纪念明信片 · 第 {latestCard.day} 天
                </FarmText>
              </View>
              {latestCard.highlights.map(line => (
                <View key={line.speaker} style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 7 }}>
                  <FarmSlotFrame size={30} rarity={1}>
                    <FarmPersonSprite who={line.speaker} size={20} active={false} centered />
                  </FarmSlotFrame>
                  <FarmText style={{ flex: 1, color: '#4A3927', fontSize: 12, lineHeight: 18 }}>
                    <FarmText style={{ fontWeight: '800', color: '#5A3E24' }}>{RESIDENTS[line.speaker].name}：</FarmText>
                    {line.text}
                  </FarmText>
                </View>
              ))}
            </FarmParchmentCard>
          ) : null}

          {postcards.length > 0 ? (
            <View style={{ gap: 8 }}>
              <FarmText variant="label" style={{ color: '#6E563B', fontSize: 12 }}>
                已收藏的家庭聚会明信片（{postcards.length}）
              </FarmText>
              {postcards.slice(-4).reverse().map(card => (
                <FarmParchmentCard key={card.id} style={{ gap: 5, padding: 11 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                    <FarmText style={{ color: '#533B25', fontSize: 12.5, fontWeight: '800' }}>{card.title}</FarmText>
                    <FarmText style={{ color: '#8A7359', fontSize: 10 }}>
                      第 {card.day} 天 · {card.season}季{card.dishServed ? ` · ${card.dishServed}` : ''}
                    </FarmText>
                  </View>
                  {card.highlights.slice(0, 3).map(line => (
                    <FarmText key={`${card.id}-${line.speaker}`} style={{ color: '#66513A', fontSize: 11.5, lineHeight: 17 }}>
                      • {RESIDENTS[line.speaker].name}：{line.text}
                    </FarmText>
                  ))}
                </FarmParchmentCard>
              ))}
            </View>
          ) : null}
        </ScrollView>
      </View>
    </FarmNPCSheet>
  );
}
