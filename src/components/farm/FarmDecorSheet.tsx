import Ionicons from '@expo/vector-icons/Ionicons';
import { Pressable, ScrollView, View } from 'react-native';
import { FARM_DECORS, type DecorId, type FarmDecorState } from '@/utils/farmDecor';
import { FarmPropSprite, FarmUiIcon } from './CropSprite';
import { FarmNPCSheet } from './FarmNPCSheet';
import { FarmButton, FarmParchmentCard, FarmSlotFrame, FarmText } from './FarmSkin';

export function FarmDecorSheet({
  visible,
  onClose,
  decor,
  coins,
  onBuy,
  onTogglePlace,
  maxHeight,
}: {
  visible: boolean;
  onClose: () => void;
  decor: FarmDecorState;
  coins: number;
  onBuy: (id: DecorId) => void;
  onTogglePlace: (id: DecorId) => void;
  maxHeight: number;
}) {
  return (
    <FarmNPCSheet visible={visible} onClose={onClose}>
      <View style={{ borderTopLeftRadius: 24, borderTopRightRadius: 24, backgroundColor: '#FFF9EF', overflow: 'hidden', flexShrink: 1 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', padding: 14, paddingBottom: 8, gap: 9 }}>
          <FarmSlotFrame size={40} rarity={4} selected>
            <FarmPropSprite name="windmill" size={28} />
          </FarmSlotFrame>
          <View style={{ flex: 1 }}>
            <FarmText variant="title" style={{ color: '#533B24', fontSize: 16, fontWeight: '800' }}>
              庭院轻装扮工坊
            </FarmText>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 2 }}>
              <FarmUiIcon name="coin" size={13} />
              <FarmText style={{ color: '#8A6329', fontSize: 11, fontWeight: '700' }}>{coins} 金币</FarmText>
              <FarmText style={{ color: '#857056', fontSize: 10.5 }}>· 已摆放 {decor.placed.length}/{FARM_DECORS.length} 件</FarmText>
            </View>
          </View>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="关闭庭院装扮工坊"
            onPress={onClose}
            style={{ width: 28, height: 28, borderRadius: 8, alignItems: 'center', justifyContent: 'center', backgroundColor: '#F3E6D0', borderWidth: 1, borderColor: '#DFCCA9' }}
          >
            <Ionicons name="close" size={16} color="#8B7254" />
          </Pressable>
        </View>

        <ScrollView style={{ maxHeight: Math.max(260, maxHeight + 48) }} contentContainerStyle={{ paddingHorizontal: 14, paddingBottom: 20, gap: 10 }} showsVerticalScrollIndicator={false}>
          <FarmText style={{ color: '#7D684E', fontSize: 11.5, lineHeight: 18 }}>
            买下的装扮会直接出现在农场实景地图里（入夜后灯串、灯笼与篝火还会泛起暖光）；新摆出后，家人们路过时会自动点评并写进《农场日报》！
          </FarmText>

          {FARM_DECORS.map(item => {
            const owned = decor.owned.includes(item.id);
            const placed = decor.placed.includes(item.id);
            const canAfford = coins >= item.price;
            return (
              <FarmParchmentCard key={item.id} tone={placed ? 'sage' : 'warm'} style={{ gap: 9 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 11 }}>
                  <FarmSlotFrame size={56} rarity={placed ? 4 : owned ? 2 : 1} selected={placed}>
                    <FarmPropSprite name={item.prop} size={42} />
                  </FarmSlotFrame>
                  <View style={{ flex: 1, gap: 3 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                      <FarmText style={{ color: '#4E3823', fontSize: 13.5, fontWeight: '800' }}>{item.label}</FarmText>
                      {item.glowsAtNight ? (
                        <View style={{ paddingHorizontal: 6, paddingVertical: 1, borderRadius: 99, backgroundColor: '#F4E1BC' }}>
                          <FarmText style={{ color: '#8A5A1E', fontSize: 9, fontWeight: '700' }}>夜间暖光</FarmText>
                        </View>
                      ) : null}
                    </View>
                    <FarmText style={{ color: '#6E5941', fontSize: 11.5, lineHeight: 17 }}>{item.desc}</FarmText>
                  </View>
                </View>

                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                    <FarmUiIcon name="coin" size={14} />
                    <FarmText style={{ color: '#8A6329', fontSize: 12, fontWeight: '800' }}>
                      {owned ? (placed ? '已摆放在院子里' : '已拥有（收纳中）') : `${item.price} 金币`}
                    </FarmText>
                  </View>
                  {owned ? (
                    <FarmButton
                      label={placed ? '暂时收起' : '摆进院子'}
                      tone={placed ? 'paper' : 'sage'}
                      onPress={() => onTogglePlace(item.id)}
                      style={{ minHeight: 36, paddingVertical: 6 }}
                    />
                  ) : (
                    <FarmButton
                      label={canAfford ? `购买并摆放` : `金币不足`}
                      tone="sage"
                      disabled={!canAfford}
                      onPress={() => onBuy(item.id)}
                      style={{ minHeight: 36, paddingVertical: 6 }}
                    />
                  )}
                </View>
              </FarmParchmentCard>
            );
          })}
        </ScrollView>
      </View>
    </FarmNPCSheet>
  );
}
