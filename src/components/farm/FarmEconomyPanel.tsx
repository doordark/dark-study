import { FarmButton, FarmIllustration, FarmParchmentCard, FarmSlotFrame, FarmText as Text } from './FarmSkin';
import { useState } from 'react';
import { View } from 'react-native';
import { CROP_KINDS, CROP_META, RECIPES, SEASON_NAMES, dailyOrder, craft, irrigationCost, wetDuration, marketRate, restoreEconomy, stockCount, stockValue, unitPrice, type CropKind, type Economy, type Recipe } from '@/utils/farmEconomy';
import { CROP_ART } from './sprites';
import { CropSprite, FarmDishSprite, FarmToolSprite, FarmUiIcon } from './CropSprite';

function Button({ label, onPress, disabled = false }: { label: string; onPress: () => void; disabled?: boolean }) {
  return <FarmButton label={label} onPress={onPress} disabled={disabled} tone="sage" />;
}
const ink = '#59432E';
const muted = '#8A785E';
export function FarmEconomyPanel({ mode, economy, coins, level, season, at, onSell, onOrder, onCraft, onKitchen, onRescue, onIrrigation }: {
  mode?: "stock" | "orders" | "kitchen" | "guide";
  economy: Economy; coins: number; level: number; season: number; at: number;
  onSell: (kind: CropKind) => void; onOrder: (kind: CropKind) => void; onCraft: (recipe: Recipe) => void; onKitchen: () => void; onRescue: () => void; onIrrigation: () => void;
}) {
  const [localTab, setTab] = useState<'stock' | 'orders' | 'kitchen' | 'guide'>('stock');
  const tab = mode ?? localTab;
  const current = restoreEconomy(economy, at);
  const total = CROP_KINDS.reduce((n, k) => n + stockCount(current.inventory[k]), 0);
  return <FarmParchmentCard style={{ gap: 12, padding: 14 }}>
    {!mode ? <FarmIllustration theme="market" /> : null}
    <Text variant="title" style={{ color: '#926B35', fontWeight: '800', fontSize: 16 }}>{mode ? ({ stock: "出售收成", orders: "采购委托", kitchen: "加工工坊", guide: "作物图鉴" }[mode]) : `丰收集市 · ${SEASON_NAMES[season]}季`}</Text>
    <Text style={{ color: muted, fontSize: 12, lineHeight: 19 }}>收获先入仓，再选择出售、交订单或加工。当季播种每次多收 1 份；施肥收获为优质品，市价 +30%。</Text>
    {!mode ? <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>{([['stock', `仓库 ${total}`], ['orders', '订单'], ['kitchen', '工坊'], ['guide', '图鉴']] as const).map(([key, label]) => <Button key={key} label={`${tab === key ? '● ' : ''}${label}`} onPress={() => setTab(key)} />)}</View> : null}
    {tab === 'stock' && <>
      <Text style={{ color: muted, fontSize: 11 }}>每小时更新行情。出售会卖出该作物全部库存，请先留好委托与食材。</Text>
      {total === 0 && <Text style={{ color: ink }}>仓库还空着，先种一块田吧。</Text>}
      {CROP_KINDS.filter(k => stockCount(current.inventory[k]) > 0).map(k => <View key={k} style={{ flexDirection: 'row', alignItems: 'center', gap: 9 }}>
        <FarmSlotFrame size={44} rarity={current.inventory[k].premium > 0 ? 4 : 1}>
          <CropSprite kind={k} size={30} />
        </FarmSlotFrame>
        <View style={{ flex: 1 }}>
          <Text style={{ color: ink, fontWeight: '700' }}>{CROP_ART[k].label} ×{stockCount(current.inventory[k])}</Text>
          <Text style={{ color: muted, fontSize: 11 }}>优质 {current.inventory[k].premium} · 今日 {Math.round(marketRate(k, at) * 100)}% · 单价 {unitPrice(k, false, at)}</Text>
        </View>
        <Button label={`出售 +${stockValue(k, current.inventory[k], at)}`} onPress={() => onSell(k)} />
      </View>)}
      <Button label="申请起步种子（每日限一次，仅限资金与物资耗尽）" onPress={onRescue} />
    </>}
    {tab === 'orders' && <>
      <Text style={{ color: muted, fontSize: 11 }}>每种作物每天一单，按现实日期刷新。交付消耗库存，优先使用普通品，奖励不受行情影响。</Text>
      {CROP_KINDS.filter(k => CROP_META[k].level <= level).map(k => {
        const order = dailyOrder(k, at); const claimed = current.orders.claimed.includes(k); const count = stockCount(current.inventory[k]);
        const ready = !claimed && count >= order.quantity;
        return <View key={k} style={{ flexDirection: 'row', alignItems: 'center', gap: 9, paddingVertical: 4 }}>
          <FarmSlotFrame size={42} rarity={ready ? 4 : 1} selected={ready}>
            <CropSprite kind={k} size={28} />
          </FarmSlotFrame>
          <View style={{ flex: 1 }}>
            <Text style={{ color: ink, fontWeight: '700' }}>{CROP_ART[k].label}采购单</Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 3, flexWrap: 'wrap' }}>
              <Text style={{ color: ready ? '#4B6935' : muted, fontSize: 11, fontWeight: ready ? '700' : '400' }}>{count}/{order.quantity} 份 ·</Text>
              <FarmUiIcon name="coin" size={13} />
              <Text style={{ color: '#8A6329', fontSize: 11, fontWeight: '700' }}>{order.reward}</Text>
              <FarmToolSprite kind="compost" size={14} />
              <Text style={{ color: muted, fontSize: 11 }}>+1</Text>
            </View>
          </View>
          <Button label={claimed ? '已交付' : '交付'} disabled={!ready} onPress={() => onOrder(k)} />
        </View>;
      })}
    </>}
    {tab === 'kitchen' && <>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        <FarmSlotFrame size={44} rarity={2}>
          <FarmToolSprite kind="water" size={30} />
        </FarmSlotFrame>
        <View style={{ flex: 1 }}>
          <Text style={{ color: ink, fontWeight: '700' }}>土壤保水 · {current.irrigation}/3 级</Text>
          <Text style={{ color: muted, fontSize: 11.5, marginTop: 2 }}>浇水后湿润 {wetDuration(current.irrigation) / 60000} 分钟（每级 +15 分钟）</Text>
        </View>
      </View>
      {current.irrigation < 3 ? <Button label={`改良 · Lv.${current.irrigation + 2} · ${irrigationCost(current.irrigation)} 金币`} disabled={level < current.irrigation + 2 || coins < irrigationCost(current.irrigation)} onPress={onIrrigation} /> : <Text style={{ color: '#926B35' }}>保水改良已完成</Text>}
      <Text style={{ color: ink, fontWeight: '800', marginTop: 4 }}>农场厨房 · 手作料理</Text>
      <Text style={{ color: muted, fontSize: 12 }}>投入食材和加工费，制成料理可直接出售，也可在聊天里现做送给家人。</Text>
      {!current.kitchen ? <Button label="建造厨房 · Lv.3 · 280 金币" disabled={level < 3 || coins < 280} onPress={onKitchen} /> : RECIPES.map(recipe => {
        const canCraft = Boolean(craft(current.inventory, recipe, coins));
        return <View key={recipe.id} style={{ gap: 8, borderTopWidth: 1, borderColor: '#DECBA9', paddingTop: 10 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <FarmSlotFrame size={48} rarity={canCraft ? 4 : 1} selected={canCraft}>
              <FarmDishSprite kind={recipe.id} size={36} />
            </FarmSlotFrame>
            <View style={{ flex: 1, gap: 3 }}>
              <Text style={{ color: ink, fontWeight: '800', fontSize: 13.5 }}>{recipe.label}</Text>
              <View style={{ flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 5 }}>
                {(Object.entries(recipe.inputs) as [CropKind, number][]).map(([k, n]) => (
                  <View key={k} style={{ flexDirection: 'row', alignItems: 'center', gap: 2, paddingHorizontal: 5, paddingVertical: 2, borderRadius: 6, backgroundColor: '#EFE4D0' }}>
                    <CropSprite kind={k} size={15} />
                    <Text style={{ color: '#634E36', fontSize: 10.5 }}>{CROP_ART[k].label}×{n}</Text>
                  </View>
                ))}
                <Text style={{ color: muted, fontSize: 10.5 }}>加工费 {recipe.fee}</Text>
              </View>
            </View>
          </View>
          <Button label={`制作并出售 ${recipe.sell} · 净赚 +${recipe.sell - recipe.fee}`} disabled={!canCraft} onPress={() => onCraft(recipe)} />
        </View>;
      })}
    </>}
    {tab === 'guide' && CROP_KINDS.map(k => {
      const meta = CROP_META[k];
      return <View key={k} style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        <FarmSlotFrame size={44} rarity={level >= meta.level ? 1 : 0}>
          <CropSprite kind={k} size={30} />
        </FarmSlotFrame>
        <View style={{ flex: 1 }}><Text style={{ color: level >= meta.level ? ink : muted, fontWeight: '700' }}>{CROP_ART[k].label} · Lv.{meta.level} · {meta.growMs / 60000} 分钟</Text><Text style={{ color: muted, fontSize: 11, lineHeight: 18 }}>当季 {meta.seasons.map(s => SEASON_NAMES[s]).join('/')} · 基础产量 {meta.yield} · 共收 {meta.rounds} 轮{meta.rounds > 1 ? '，后续半时长' : ''}</Text></View>
      </View>;
    })}
  </FarmParchmentCard>;
}
