import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { CROP_KINDS, CROP_META, RECIPES, SEASON_NAMES, dailyOrder, craft, irrigationCost, wetDuration, marketRate, restoreEconomy, stockCount, stockValue, unitPrice, type CropKind, type Economy, type Recipe } from '@/utils/farmEconomy';
import { CROP_ART } from './sprites';
import { CropSprite } from './CropSprite';

function Button({ label, onPress, disabled = false }: { label: string; onPress: () => void; disabled?: boolean }) {
  return <Pressable accessibilityRole="button" disabled={disabled} onPress={onPress} style={{ minHeight: 44, paddingHorizontal: 12, justifyContent: 'center', borderRadius: 12, backgroundColor: disabled ? '#304233' : '#D6B96D' }}><Text style={{ color: disabled ? '#99AC98' : '#253020', fontWeight: '700', fontSize: 12 }}>{label}</Text></Pressable>;
}
const ink = '#F6EEDC';
const muted = '#A8B8A5';
export function FarmEconomyPanel({ economy, coins, level, season, at, onSell, onOrder, onCraft, onKitchen, onRescue, onIrrigation }: {
  economy: Economy; coins: number; level: number; season: number; at: number;
  onSell: (kind: CropKind) => void; onOrder: (kind: CropKind) => void; onCraft: (recipe: Recipe) => void; onKitchen: () => void; onRescue: () => void; onIrrigation: () => void;
}) {
  const [tab, setTab] = useState<'stock' | 'orders' | 'kitchen' | 'guide'>('stock');
  const current = restoreEconomy(economy, at);
  const total = CROP_KINDS.reduce((n, k) => n + stockCount(current.inventory[k]), 0);
  return <View style={{ gap: 12, padding: 14, borderRadius: 18, backgroundColor: '#1D3023', borderWidth: 1, borderColor: '#45513A' }}>
    <Text style={{ color: '#E9CC85', fontWeight: '800', fontSize: 16 }}>丰收集市 · {SEASON_NAMES[season]}季</Text>
    <Text style={{ color: muted, fontSize: 12, lineHeight: 19 }}>收获先入仓，再选择出售、交订单或加工。当季播种每次多收 1 份；施肥收获为优质品，市价 +30%。</Text>
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>{([['stock', `仓库 ${total}`], ['orders', '订单'], ['kitchen', '工坊'], ['guide', '图鉴']] as const).map(([key, label]) => <Button key={key} label={`${tab === key ? '● ' : ''}${label}`} onPress={() => setTab(key)} />)}</View>
    {tab === 'stock' && <>
      <Text style={{ color: muted, fontSize: 11 }}>每日行情 85% / 100% / 115%，按现实日期刷新。出售会卖出该作物全部库存，请先留好订单与食材。</Text>
      {total === 0 && <Text style={{ color: ink }}>仓库还空着，先种一块田吧。</Text>}
      {CROP_KINDS.filter(k => stockCount(current.inventory[k]) > 0).map(k => <View key={k} style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <CropSprite kind={k} size={32} /><View style={{ flex: 1 }}><Text style={{ color: ink }}>{CROP_ART[k].label} ×{stockCount(current.inventory[k])}</Text><Text style={{ color: muted, fontSize: 11 }}>优质 {current.inventory[k].premium} · 今日 {Math.round(marketRate(k, at) * 100)}% · 普通单价 {unitPrice(k, false, at)}</Text></View>
        <Button label={`出售 +${stockValue(k, current.inventory[k], at)}`} onPress={() => onSell(k)} />
      </View>)}
      <Button label="申请起步种子（每日限一次，仅限资金与物资耗尽）" onPress={onRescue} />
    </>}
    {tab === 'orders' && <>
      <Text style={{ color: muted, fontSize: 11 }}>每种作物每天一单，按现实日期刷新。交付消耗库存，优先使用普通品，奖励不受行情影响。</Text>
      {CROP_KINDS.filter(k => CROP_META[k].level <= level).map(k => {
        const order = dailyOrder(k, at); const claimed = current.orders.claimed.includes(k); const count = stockCount(current.inventory[k]);
        return <View key={k} style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}><View style={{ flex: 1 }}><Text style={{ color: ink }}>{CROP_ART[k].label}采购单</Text><Text style={{ color: muted, fontSize: 11, marginTop: 4 }}>{count}/{order.quantity} 份 · 报酬 {order.reward} 金币 + 1 肥料</Text></View><Button label={claimed ? '已交付' : '交付'} disabled={claimed || count < order.quantity} onPress={() => onOrder(k)} /></View>;
      })}
    </>}
    {tab === 'kitchen' && <>
      <Text style={{ color: ink, fontWeight: '700' }}>土壤保水 · {current.irrigation}/3 级</Text>
      <Text style={{ color: muted, fontSize: 12 }}>浇水后湿润 {wetDuration(current.irrigation) / 60000} 分钟。每级增加 15 分钟，适合长周期作物，下次浇水生效。</Text>
      {current.irrigation < 3 ? <Button label={`改良 · Lv.${current.irrigation + 2} · ${irrigationCost(current.irrigation)} 金币`} disabled={level < current.irrigation + 2 || coins < irrigationCost(current.irrigation)} onPress={onIrrigation} /> : <Text style={{ color: '#E9CC85' }}>保水改良已完成</Text>}
      <Text style={{ color: ink, fontWeight: '700' }}>农场厨房</Text>
      <Text style={{ color: muted, fontSize: 12 }}>投入食材和加工费，制成料理直接出售。优先消耗普通品，优质作物也可直接卖出。</Text>
      {!current.kitchen ? <Button label="建造厨房 · Lv.3 · 280 金币" disabled={level < 3 || coins < 280} onPress={onKitchen} /> : RECIPES.map(recipe => <View key={recipe.id} style={{ gap: 6, borderTopWidth: 1, borderColor: '#3A4C38', paddingTop: 10 }}><Text style={{ color: ink, fontWeight: '700' }}>{recipe.label}</Text><Text style={{ color: muted, fontSize: 11 }}>{Object.entries(recipe.inputs).map(([k, n]) => `${CROP_ART[k as CropKind].label} ×${n}`).join(' + ')} · 加工费 {recipe.fee}</Text><Button label={`制作并出售 ${recipe.sell} · 扣费后 +${recipe.sell - recipe.fee}`} disabled={!craft(current.inventory, recipe, coins)} onPress={() => onCraft(recipe)} /></View>)}
    </>}
    {tab === 'guide' && CROP_KINDS.map(k => {
      const meta = CROP_META[k];
      return <View key={k} style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}><CropSprite kind={k} size={34} /><View style={{ flex: 1 }}><Text style={{ color: level >= meta.level ? ink : muted }}>{CROP_ART[k].label} · Lv.{meta.level} · {meta.growMs / 60000} 分钟</Text><Text style={{ color: muted, fontSize: 11, lineHeight: 18 }}>当季 {meta.seasons.map(s => SEASON_NAMES[s]).join('/')} · 基础产量 {meta.yield} · 共收 {meta.rounds} 轮{meta.rounds > 1 ? '，后续半时长' : ''}</Text></View></View>;
    })}
  </View>;
}
