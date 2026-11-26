import { useEffect, useRef, useState, type ReactNode } from 'react';
import { LinearGradient } from 'expo-linear-gradient';
import { AppState, Image, Modal, Pressable, ScrollView, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AtlasSprite } from '@/components/AtlasSprite';
import { AnimatedAtlas } from '@/components/AnimatedAtlas';
import { vendorChat } from '@/services/farmVendorChat';
import { recordFarmChatTurn, type ResidentMemory } from '@/utils/farmMemory';
import { applyPlayerMemoryUpdates } from '@/utils/farmPersonaMemory';
import { EXTRA_NAMES, QUALITY, qualityOf, vendorAvailable, VENDOR_NAMES, VENDORS, type BagStack, type Vendor, type VendorPriceDeal } from '@/utils/farmMarket';
import { FarmButton, FarmText } from './FarmSkin';
import { CropSprite } from './CropSprite';
import { FarmPersonSprite } from './FarmPersonSprite';
import Animated, { cancelAnimation, Easing, useAnimatedStyle, useAnimatedReaction, useSharedValue, withSequence, withTiming } from 'react-native-reanimated';
import { MARKET_SCENES } from './sceneTextures';
import { FarmRain } from './FarmRain';
import { farmPressPoint } from '@/utils/farmPressPoint';
import { farmTime, type FarmPeriod } from '@/utils/farmTime';
import type { FarmWeather } from '@/utils/farmTown';
import { FarmChatConversation } from './FarmChatConversation';
import { vendorCanTrade } from '@/utils/farmMarket';
import { FarmNPCSheet } from './FarmNPCSheet';
import { FarmNPCHeader, FarmSegmentTabs, FarmTopicChips } from './FarmNPCHeader';
import { CROP_ART } from './sprites';
import { MARKET_PEOPLE } from './marketAssets';
import { useSettings } from '@/store/useSettings';
import { renderQuality } from '@/utils/renderQuality';

const eventTime = () => Date.now();
const ITEMS = require('../../../assets/images/farm-market-items.png');
const PEOPLE = MARKET_PEOPLE;
const VENDOR_FRAMES = VENDORS.map((_, row) => Array.from({ length: 8 }, (_, frame) => row * 8 + frame));
const VENDOR_HOLDS = [1100, 180, 100, 160, 240, 220, 250, 400];

const BAG_SLOT_SKIN = require('../../../assets/images/farm-bag-slots-v6.png');
const GEAR = require('../../../assets/images/farm-market-gear.png');
const positions = [{ x: 52, y: 127 }, { x: 151, y: 127 }, { x: 46, y: 239 }, { x: 155, y: 239 }] as const;
const VENDOR_TAGLINES: Record<Vendor, string> = {
  smith: '炉火不熄的老铁匠，修锄头、升级水壶都找他',
  farmer: '种了一辈子地的禾姨，收菜、出种子、开工坊',
  chemist: '瓶瓶罐罐里装着驱虫水与生长剂',
  traveler: '背着货箱走南闯北，总有稀奇小玩意',
};
const VENDOR_TOPICS: Record<Vendor, readonly string[]> = {
  smith: ['我的工具该升级了吗？', '能便宜点吗？'],
  farmer: ['今天收什么菜？', '有什么好种子推荐？', '能便宜点吗？'],
  chemist: ['驱虫水怎么用？', '有什么新药剂？', '能便宜点吗？'],
  traveler: ['今天有什么好货？', '路上见到什么新鲜事？', '能便宜点吗？'],
};

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

export function FarmMarket({ visible, onClose, at, paused = false, initialOrders = false, vendorMemories, onMemory, apiKey, webSearch, renderShop, priceDeals, onDiscount, weather, rainbow, period }: {
  visible: boolean; onClose: () => void; coins: number; vendorMemories: Record<Vendor, ResidentMemory>;
  at: number; paused?: boolean; initialOrders?: boolean;
  onMemory: (vendor: Vendor, memory: ResidentMemory) => void; apiKey: string; webSearch: boolean;
  priceDeals: Partial<Record<Vendor, VendorPriceDeal>>;
  onDiscount: (vendor: Vendor, percent: number) => string;
  renderShop: (vendor: Vendor, section: "trade" | "requests" | "sell" | "guide" | "craft") => ReactNode;
  weather?: FarmWeather;
  rainbow?: boolean;
  period?: FarmPeriod;
}) {
  const quality = useSettings(s => s.renderQuality);
  const [section, setSection] = useState<'chat' | 'trade' | 'requests' | 'sell' | 'guide' | 'craft'>(initialOrders ? 'requests' : 'trade');
  const [vendor, setVendor] = useState<Vendor | null>(() => initialOrders && vendorAvailable('farmer', at) ? 'farmer' : null);
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const [pendingMessage, setPendingMessage] = useState<{ id: string; text: string } | null>(null);
  const request = useRef<AbortController | null>(null);
  const [terrainReady, setTerrainReady] = useState(false);
  const [castReady, setCastReady] = useState(false);
  const [animationReady, setAnimationReady] = useState(false);
  useEffect(() => {
    if (!visible || paused || !terrainReady) return;
    // Present the background before mounting sprites, then start their clocks.
    const cast = setTimeout(() => setCastReady(true), 80);
    const animation = setTimeout(() => setAnimationReady(true), 320);
    return () => { clearTimeout(cast); clearTimeout(animation); };
  }, [visible, paused, terrainReady]);
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
  const liveWeather: FarmWeather = weather ?? lighting.weather;
  const livePeriod: FarmPeriod = period ?? lighting.period;
  const liveRainbow = rainbow ?? lighting.rainbow;
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
      result = await vendorChat({
        vendor,
        text,
        memory,
        apiKey,
        webSearch,
        signal: controller.signal,
        deal: priceDeals[vendor],
        at: eventTime(),
        weather: liveWeather,
        rainbow: liveRainbow,
        period: livePeriod,
      });
    } catch { return; }
    if (request.current !== controller) return;
    request.current = null; setBusy(false); setPendingMessage(null);
    if (!controller.signal.aborted) {
      const nowAt = eventTime();
      const reply = result.discountPercent !== undefined ? result.reaction === 'insult' || result.reaction === 'teasing' ? '这句话让我不舒服，我现在不给优惠。' : onDiscount(vendor, result.discountPercent) : result.reply;
      let nextMem = recordFarmChatTurn(memory, { id: String(nowAt), player: text, reply, ...(result.unavailable ? { unavailable: true as const } : {}) }, result.reaction, vendor);
      if (!result.unavailable) {
        nextMem = applyPlayerMemoryUpdates(nextMem, result.memoryUpdates, text, nowAt, result.episode);
      }
      onMemory(vendor, nextMem);
    }
  };
  const memory = vendor ? vendorMemories[vendor] : null;
  return <View style={{ position: 'absolute', inset: 0, backgroundColor: '#1E2A1A', zIndex: 2000 }}>
    {/* 地图下方（Dock 背后）的延展：把场景底边镜像向下翻转 + 柔化压暗，和农场一样始终有贴图垫底 */}
    <View pointerEvents="none" style={{ position: 'absolute', left: 0, right: 0, top: scale * 330, height: Math.max(0, height - scale * 330 + 40), overflow: 'hidden' }}>
      <Image source={MARKET_SCENES[lighting.sceneVariant]} resizeMode="cover" fadeDuration={0} blurRadius={3}
        style={{ position: 'absolute', left: 0, top: 0, width: mapWidth, height: scale * 330, transform: [{ scaleY: -1 }] }} />
      <LinearGradient colors={['rgba(20, 28, 16, 0.18)', 'rgba(20, 28, 16, 0.62)']} style={{ position: 'absolute', inset: 0 }} />
    </View>
    <ScrollView showsVerticalScrollIndicator={false} bounces={false}>
      <View style={{ width: mapWidth, height: scale * 330 }}>
        <Image source={MARKET_SCENES[lighting.sceneVariant]} resizeMode="cover" fadeDuration={0}
          onLoad={() => setTerrainReady(true)} onError={() => setTerrainReady(true)}
          style={{ position: 'absolute', width: '100%', height: '100%' }} />
        <Pressable accessibilityLabel="集市道路" style={{ position: 'absolute', inset: 0 }} onPress={e => { const point = farmPressPoint(e, scale); if (point) travel({ x: Math.max(75, Math.min(130, point.x)), y: Math.max(125, Math.min(310, point.y)) }); }} />
        {castReady ? VENDORS.map((id, index) => vendorAvailable(id, at) ? <Pressable key={id} accessibilityRole="button" accessibilityLabel={VENDOR_NAMES[id]} onPress={() => travel({ x: positions[index].x + (index % 2 ? -15 : 15), y: positions[index].y + 3 }, () => { setSection('trade'); setVendor(id); })}
          style={{ position: 'absolute', left: (positions[index].x - 11) * scale, top: (positions[index].y - 28) * scale, width: 22 * scale }}>
          <AnimatedAtlas source={PEOPLE} columns={8} rows={4} frames={VENDOR_FRAMES[index]} holds={VENDOR_HOLDS} width={22 * scale} height={22 * scale * 4 / 3} active={renderQuality(quality).idleAnimation && animationReady && visible && !vendor && !paused} />
        </Pressable> : null) : null}
        {castReady ? <Animated.View pointerEvents="none" style={[{ position: 'absolute', left: 0, top: 0 }, playerStyle]}><Animated.View style={facingStyle}><FarmPersonSprite who="hero" size={20 * scale} activity={walking ? 'walk' : 'idle'} active={animationReady && visible && !vendor && !paused} /></Animated.View></Animated.View> : null}
        <Pressable accessibilityRole="button" accessibilityLabel="走出集市返回农场" onPress={() => travel({ x: 100, y: 316 }, onClose)} style={{ position: 'absolute', bottom: 0, left: 0, width: mapWidth, height: 25 * scale }} />
        <FarmRain width={mapWidth} height={330 * scale} night={lighting.night} active={animationReady && visible && !vendor && !paused && liveWeather === 'rain'} />
      </View>
    </ScrollView>
    <FarmNPCSheet visible={Boolean(vendor && memory)} onClose={back}>
      <FarmNPCHeader
        portrait={vendor ? <AtlasSprite source={PEOPLE} columns={8} rows={4} column={0} row={VENDORS.indexOf(vendor)} width={36} height={48} /> : null}
        name={vendor ? VENDOR_NAMES[vendor] : ''}
        meta={`${memory?.mood ?? '平静'} · 好感 ${memory?.affinity ?? 0}/100`}
        subtitle={vendor ? VENDOR_TAGLINES[vendor] : undefined}
        badges={liveWeather === 'rain' ? [{ label: '雨中守摊', tone: 'rain' }] : liveRainbow ? [{ label: '摊前看彩虹', tone: 'rainbow' }] : []}
        onClose={back}
      />
      {vendor && memory ? <>
        <FarmSegmentTabs
          items={[['trade', vendor === 'smith' ? '升级维修' : '购买'], ['requests', '委托'], ...(vendor === 'farmer' ? [['sell', '出售'], ['craft', '工坊'], ['guide', '图鉴']] as const : []), ['chat', '对话']] as readonly (readonly [typeof section, string])[]}
          value={section}
          onChange={setSection}
        />
        {section !== 'chat' ? <ScrollView key={vendor + section} style={{ flexGrow: 0, flexShrink: 1, maxHeight: Math.min(420, height * .48) }} keyboardShouldPersistTaps="handled" automaticallyAdjustKeyboardInsets contentContainerStyle={{ padding: 12, gap: 10 }}>

          {section === 'trade' && vendor !== 'smith' ? <FarmText>商品每小时刷新 · {60 - new Date(at).getMinutes()} 分钟后更新</FarmText> : null}
          {!vendorCanTrade(memory) ? <FarmText>店主暂停交易，可以先和对方说说话。</FarmText> : renderShop(vendor, section)}
        </ScrollView> : null}
        {section === 'chat' ? <>
          <FarmTopicChips
            topics={[...VENDOR_TOPICS[vendor], liveWeather === 'rain' ? '下雨天还出摊呀？' : liveRainbow ? '看见彩虹了吗？' : '最近生意怎么样？']}
            disabled={busy}
            onPick={topic => void send(topic)}
          />
          <FarmChatConversation messages={[
            ...memory.turns.flatMap(turn => [{ id: turn.id + '-user', role: 'user' as const, text: turn.player }, { id: turn.id + '-reply', role: 'assistant' as const, text: turn.reply }]),
            ...(pendingMessage ? [{ id: pendingMessage.id + '-pending', role: 'user' as const, text: pendingMessage.text }] : []),
          ]} busy={busy} value={draft} onChange={setDraft} onSend={() => void send()} placeholder={`和${VENDOR_NAMES[vendor].split('·').pop()}聊聊，或试着砍砍价…`} maxHeight={Math.max(150, Math.min(258, height * .32))} />
        </> : null}
      </> : null}
    </FarmNPCSheet>
  </View>;
}
