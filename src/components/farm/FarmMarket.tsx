import { useEffect, useRef, useState, type ReactNode } from 'react';
import { AppState, Image, Modal, Pressable, ScrollView, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AtlasSprite } from '@/components/AtlasSprite';
import { AnimatedAtlas } from '@/components/AnimatedAtlas';
import { vendorChat } from '@/services/farmVendorChat';
import { recordFarmChatTurn, type ResidentMemory } from '@/utils/farmMemory';
import { EXTRA_NAMES, QUALITY, qualityOf, vendorAvailable, VENDOR_NAMES, VENDORS, type BagStack, type Vendor, type VendorPriceDeal } from '@/utils/farmMarket';
import { FarmButton, FarmText } from './FarmSkin';
import { CropSprite } from './CropSprite';
import { FarmPersonSprite } from './FarmPersonSprite';
import Animated, { cancelAnimation, Easing, useAnimatedStyle, useAnimatedReaction, useSharedValue, withSequence, withTiming } from 'react-native-reanimated';
import { MARKET_SCENES } from './sceneTextures';
import { FarmRain } from './FarmRain';
import { farmPressPoint } from '@/utils/farmPressPoint';
import { farmTime } from '@/utils/farmTime';
import { FarmChatConversation } from './FarmChatConversation';
import { vendorCanTrade } from '@/utils/farmMarket';
import { FarmNPCSheet } from './FarmNPCSheet';
import { FarmTabButton } from './FarmTabButton';
import { CROP_ART } from './sprites';

const eventTime = () => Date.now();
const ITEMS = require('../../../assets/images/farm-market-items.png');
const PEOPLE = require('../../../assets/images/farm-market-vendors-idle-alpha-v6.png');

const BAG_SLOT_SKIN = require('../../../assets/images/farm-bag-slots-v6.png');
const GEAR = require('../../../assets/images/farm-market-gear.png');
const positions = [{ x: 52, y: 127 }, { x: 151, y: 127 }, { x: 46, y: 239 }, { x: 155, y: 239 }] as const;

export function MarketIcon({ index, size = 28 }: { index: number; size?: number }) {
  return <AtlasSprite source={ITEMS} columns={4} rows={3} column={index % 4} row={Math.floor(index / 4)} width={size} />;
}
export function GearIcon({ tier, can = false, size = 28 }: { tier: number; can?: boolean; size?: number }) {
  return tier > 0
    ? <AtlasSprite source={GEAR} columns={5} rows={2} column={tier - 1} row={can ? 1 : 0} width={size} />
    : <MarketIcon index={can ? 2 : 0} size={size} />;
}

export function FarmBag({ visible, close, title, detail, capacity, stacks, selected, onPick, bagTier, canTier, actions }: {
  visible: boolean; close: () => void; title: string; detail: string; capacity: number; stacks: BagStack[]; selected: string | null;
  onPick: (stack: BagStack) => void;
  bagTier: number; canTier: number;
  actions?: ReactNode;
}) {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const [gridWidth, setGridWidth] = useState(0);
  const cellSize = Math.max(1, ((gridWidth || width - 60) - 18) / 4);
  const itemSize = Math.max(16, Math.min(26, cellSize * .30));
  const labelSize = cellSize < 70 ? 8 : 9;
  const cells = Array.from({ length: Math.max(capacity, stacks.length) }, (_, i) => stacks[i]);
  return <Modal visible={visible} animationType="fade" transparent onRequestClose={close}>
    <View style={{ flex: 1, paddingTop: insets.top + 18, paddingBottom: insets.bottom + 18, paddingHorizontal: 16, justifyContent: 'center', backgroundColor: '#2A201990' }}>
      <View style={{ backgroundColor: '#F8EBD4', borderRadius: 20, padding: 14, maxHeight: '92%', gap: 10 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <GearIcon tier={bagTier} /><FarmText variant="title" style={{ flex: 1 }}>{title}</FarmText>
          <FarmButton label="关闭" onPress={close} />
        </View>
        <FarmText>{stacks.length}/{capacity} 格 · 每格最多 64 件</FarmText>
        {detail ? <FarmText>{detail}</FarmText> : null}
        {stacks.length > capacity ? <FarmText>旧存档物品已保留，请先消耗或出售一些。</FarmText> : null}
        <ScrollView onLayout={event => setGridWidth(event.nativeEvent.layout.width)} contentContainerStyle={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
          {cells.map((item, i) => {
            if (!item) return <View key={i} style={{ width: cellSize, height: cellSize }}><AtlasSprite source={BAG_SLOT_SKIN} columns={6} rows={2} column={0} row={0} width={cellSize} /></View>;
            const quality = item.kind ? Math.min(4, qualityOf(item.kind) + (item.type === 'premium' ? 1 : 0)) : 0;
            const label = item.kind ? CROP_ART[item.kind].label + (item.type === 'seed' ? '种子' : '') : item.extra ? EXTRA_NAMES[item.extra] : item.type === 'hoe' ? '锄头' : item.type === 'compost' ? '有机肥' : '水壶';
            return <Pressable key={item.id} accessibilityRole="button" accessibilityLabel={`${label}，${QUALITY[quality].label}，${item.count} 个`}
              accessibilityState={{ selected: selected === item.id }} onPress={() => onPick(item)} style={{ width: cellSize, height: cellSize, alignItems: 'center', justifyContent: 'center', padding: cellSize * .09, overflow: 'hidden' }}>
              <View pointerEvents="none" style={{ position: 'absolute', left: 0, top: 0 }}><AtlasSprite source={BAG_SLOT_SKIN} columns={6} rows={2} column={quality + 1} row={selected === item.id ? 1 : 0} width={cellSize} /></View>
              {item.kind && item.type !== 'seed' ? <CropSprite kind={item.kind} size={itemSize} />
                : item.type === 'can' ? <GearIcon tier={canTier} can size={itemSize} />
                : <MarketIcon index={item.kind ? 7 : item.type === 'hoe' ? 3 : item.extra === 'repellent' ? 4 : item.extra === 'growth' || item.type === 'compost' ? 5 : 6} size={itemSize} />}
              <FarmText numberOfLines={2} style={{ textAlign: 'center', fontSize: labelSize, lineHeight: labelSize + 2, maxWidth: '100%' }}>{label}</FarmText>
              <FarmText style={{ fontSize: labelSize, lineHeight: labelSize + 2 }}>×{item.count}</FarmText>
            </Pressable>;
          })}
        </ScrollView>
        {actions}
      </View>
    </View>
  </Modal>;
}

export function FarmMarket({ visible, onClose, at, paused = false, vendorMemories, onMemory, apiKey, webSearch, renderShop, priceDeals, onDiscount }: {
  visible: boolean; onClose: () => void; coins: number; vendorMemories: Record<Vendor, ResidentMemory>;
  at: number; paused?: boolean;
  onMemory: (vendor: Vendor, memory: ResidentMemory) => void; apiKey: string; webSearch: boolean;
  priceDeals: Partial<Record<Vendor, VendorPriceDeal>>;
  onDiscount: (vendor: Vendor, percent: number) => string;
  renderShop: (vendor: Vendor, section: "trade" | "requests" | "sell" | "guide" | "craft") => ReactNode;
}) {
  const [section, setSection] = useState<'chat' | 'trade' | 'requests' | 'sell' | 'guide' | 'craft'>('trade');
  const [vendor, setVendor] = useState<Vendor | null>(null);
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const [pendingMessage, setPendingMessage] = useState<{ id: string; text: string } | null>(null);
  const request = useRef<AbortController | null>(null);
  const { width, height } = useWindowDimensions();
  const mapWidth = width, scale = width / 200;
  const x = useSharedValue(100), y = useSharedValue(295);
  const facing = useSharedValue(1);
  useAnimatedReaction(() => x.get(), (current, previous) => {
    if (previous !== null && Math.abs(current - previous) > .001) facing.set(current > previous ? 1 : -1);
  });
  const facingStyle = useAnimatedStyle(() => ({ transform: [{ scaleX: facing.get() }] }));
  const [walking, setWalking] = useState(false);
  if (paused && walking) setWalking(false);
  const arrival = useRef<ReturnType<typeof setTimeout> | null>(null);
  const playerStyle = useAnimatedStyle(() => ({ transform: [{ translateX: (x.get() - 10) * scale }, { translateY: (y.get() - 25) * scale }] }));
  const travel = (target: { x: number; y: number }, finish?: () => void) => {
    if (paused || !Number.isFinite(target.x) || !Number.isFinite(target.y)) return;
    if (arrival.current) clearTimeout(arrival.current);
    cancelAnimation(x); cancelAnimation(y);
    const start = Number.isFinite(x.get()) && Number.isFinite(y.get()) ? { x: x.get(), y: y.get() } : { x: 100, y: 295 };
    x.set(start.x); y.set(start.y);
    const route = start.y > 185 && target.y < 150 ? [{ x: 130, y: 200 }, { x: 130, y: 135 }, target]
      : start.y < 150 && target.y > 185 ? [{ x: 130, y: 135 }, { x: 130, y: 200 }, target] : [target];
    let previous = start, duration = 0;
    const steps = route.map(point => { const ms = Math.max(100, Math.hypot(point.x - previous.x, point.y - previous.y) * 18); previous = point; duration += ms; return { point, ms }; });
    setWalking(true);
    x.set(withSequence(...steps.map(step => withTiming(step.point.x, { duration: step.ms, easing: Easing.linear }))));
    y.set(withSequence(...steps.map(step => withTiming(step.point.y, { duration: step.ms, easing: Easing.linear }))));
    arrival.current = setTimeout(() => { setWalking(false); finish?.(); }, duration);
  };
  useEffect(() => () => { if (arrival.current) clearTimeout(arrival.current); cancelAnimation(x); cancelAnimation(y); }, [x, y]);
  useEffect(() => {
    if (paused) {
      if (arrival.current) clearTimeout(arrival.current);
      cancelAnimation(x); cancelAnimation(y);
    }
  }, [paused, x, y]);
  const lighting = farmTime(at, 0, at);
  // Reset selection when an hourly stock change removes the traveling shop.
  // Adjust local state during render so no extra effect-driven render is needed.
  if ((!visible || vendor !== null && !vendorAvailable(vendor, at)) && (vendor !== null || busy || draft !== '')) {
    setVendor(null); setBusy(false); setDraft('');
  }
  useEffect(() => {
    const subscription = AppState.addEventListener('change', state => {
      if (state !== 'active') {
        request.current?.abort(); request.current = null; setBusy(false); setPendingMessage(null);
        if (arrival.current) clearTimeout(arrival.current);
        cancelAnimation(x); cancelAnimation(y); setWalking(false);
      }
    });
    return () => { subscription.remove(); request.current?.abort(); };
  }, [x, y]);
  useEffect(() => {
    if (!visible || !vendor) {
      request.current?.abort(); request.current = null;
    }
  }, [visible, vendor]);
  const leaveShop = () => {
    request.current?.abort(); request.current = null;
    setBusy(false); setPendingMessage(null); setDraft(''); setVendor(null);
  };
  const back = () => { if (vendor) leaveShop(); else onClose(); };
  const send = async (raw = draft) => {
    const text = raw.trim();
    if (!visible || !vendor || !vendorAvailable(vendor, eventTime()) || !text || request.current) return;
    const controller = new AbortController();
    request.current = controller;
    const memory = vendorMemories[vendor];
    setDraft(''); setBusy(true); setPendingMessage({ id: String(eventTime()), text });
    let result;
    try {
      result = await vendorChat({ vendor, text, memory, apiKey, webSearch, signal: controller.signal, deal: priceDeals[vendor], at: eventTime() });
    } catch { return; }
    if (request.current !== controller) return;
    request.current = null; setBusy(false); setPendingMessage(null);
    if (!controller.signal.aborted) {
      const reply = result.discountPercent !== undefined ? result.reaction === 'insult' || result.reaction === 'teasing' ? '这句话让我不舒服，我现在不给优惠。' : onDiscount(vendor, result.discountPercent) : result.reply;
      onMemory(vendor, recordFarmChatTurn(memory, { id: String(eventTime()), player: text, reply, ...(result.unavailable ? { unavailable: true as const } : {}) }, result.reaction, vendor));
    }
  };
  const memory = vendor ? vendorMemories[vendor] : null;
  return <View style={{ position: 'absolute', inset: 0, backgroundColor: '#F5EDD8', zIndex: 2000 }}>
    <ScrollView showsVerticalScrollIndicator={false} bounces={false}>
      <View style={{ width: mapWidth, height: scale * 330 }}>
        <Image source={MARKET_SCENES[lighting.sceneVariant]} resizeMode="cover" style={{ position: 'absolute', width: '100%', height: '100%' }} />
        <Pressable accessibilityLabel="集市道路" style={{ position: 'absolute', inset: 0 }} onPress={e => { const point = farmPressPoint(e, scale); if (point) travel({ x: Math.max(75, Math.min(130, point.x)), y: Math.max(125, Math.min(310, point.y)) }); }} />
        {VENDORS.map((id, index) => vendorAvailable(id, at) ? <Pressable key={id} accessibilityRole="button" accessibilityLabel={VENDOR_NAMES[id]} onPress={() => travel({ x: positions[index].x + (index % 2 ? -15 : 15), y: positions[index].y + 3 }, () => { setSection('trade'); setVendor(id); })}
          style={{ position: 'absolute', left: (positions[index].x - 11) * scale, top: (positions[index].y - 28) * scale, width: 22 * scale }}>
          <AnimatedAtlas source={PEOPLE} columns={8} rows={4} frames={Array.from({ length: 8 }, (_, frame) => index * 8 + frame)} holds={[1100, 180, 100, 160, 240, 220, 250, 400]} width={22 * scale} height={22 * scale * 4 / 3} active={visible && !vendor && !paused} />
        </Pressable> : null)}
        <Animated.View pointerEvents="none" style={[{ position: 'absolute', left: 0, top: 0 }, playerStyle]}><Animated.View style={facingStyle}><FarmPersonSprite who="hero" size={20 * scale} activity={walking ? 'walk' : 'idle'} active={visible && !vendor && !paused} /></Animated.View></Animated.View>
        <Pressable accessibilityRole="button" accessibilityLabel="走出集市返回农场" onPress={() => travel({ x: 100, y: 316 }, onClose)} style={{ position: 'absolute', bottom: 0, left: 0, width: mapWidth, height: 25 * scale }} />
        <FarmRain width={mapWidth} height={330 * scale} active={visible && !vendor && !paused && lighting.weather === 'rain'} />
      </View>
    </ScrollView>
    <FarmNPCSheet visible={Boolean(vendor && memory)} onClose={back}>
      <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingTop: 12, paddingBottom: 10, gap: 10 }}>
        {vendor ? <View style={{ width: 42, height: 54, alignItems: 'center', justifyContent: 'center', backgroundColor: '#F5ECD8', borderRadius: 8 }}><AtlasSprite source={PEOPLE} columns={8} rows={4} column={0} row={VENDORS.indexOf(vendor)} width={36} height={48} /></View> : null}
        <View style={{ flex: 1 }}><View style={{ flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 5 }}>
          <FarmText variant="title" style={{ fontSize: 14 }}>{vendor ? VENDOR_NAMES[vendor] : ''}</FarmText>
          <FarmText style={{ fontSize: 10, color: '#8A785E' }}>{memory?.mood ?? '平静'} · 好感 {memory?.affinity ?? 0}/100</FarmText>
        </View></View>
        <Pressable accessibilityLabel="关闭人物面板" onPress={back} hitSlop={8} style={{ width: 28, height: 28, alignItems: 'center', justifyContent: 'center', backgroundColor: '#F5ECD8' }}><FarmText style={{ fontSize: 20 }}>×</FarmText></Pressable>
      </View>
      {vendor && memory ? <>
        <View style={{ paddingHorizontal: 12, paddingBottom: 6 }}><View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
          {([['trade', vendor === 'smith' ? '升级维修' : '购买'], ['requests', '委托'], ...(vendor === 'farmer' ? [['sell', '出售'], ['craft', '工坊'], ['guide', '图鉴']] : []), ['chat', '对话']] as [typeof section, string][]).map(([id, label]) => <FarmTabButton key={id} label={label} selected={section === id} onPress={() => setSection(id)} />)}
        </View></View>
        {section !== 'chat' ? <ScrollView key={vendor + section} style={{ flexGrow: 0, flexShrink: 1, maxHeight: Math.min(420, height * .48) }} keyboardShouldPersistTaps="handled" automaticallyAdjustKeyboardInsets contentContainerStyle={{ padding: 12, gap: 10 }}>

          {section === 'trade' && vendor !== 'smith' ? <FarmText>商品每小时刷新 · {60 - new Date(at).getMinutes()} 分钟后更新</FarmText> : null}
          {!vendorCanTrade(memory) ? <FarmText>店主暂停交易，可以先和对方说说话。</FarmText> : renderShop(vendor, section)}
        </ScrollView> : null}
        {section === 'chat' ? <>
          <FarmChatConversation messages={[
            ...memory.turns.flatMap(turn => [{ id: turn.id + '-user', role: 'user' as const, text: turn.player }, { id: turn.id + '-reply', role: 'assistant' as const, text: turn.reply }]),
            ...(pendingMessage ? [{ id: pendingMessage.id + '-pending', role: 'user' as const, text: pendingMessage.text }] : []),
          ]} busy={busy} value={draft} onChange={setDraft} onSend={() => void send()} placeholder="" maxHeight={Math.max(150, Math.min(258, height * .32))} />
        </> : null}
      </> : null}
    </FarmNPCSheet>
  </View>;
}
