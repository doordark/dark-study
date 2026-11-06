import { CROP_KINDS, CROP_META, type CropKind, type Inventory } from './farmEconomy';
import { PERSONALITIES } from './farmPersonality';
import type { CoopSupply } from './farmCoop';
import { finiteCount } from './farmProgress';

export const BAG_TIERS = ['皮革', '铜制', '铁制', '金制', '钻石', 'doordoor合金'] as const;
export const CAN_TIERS = ['木水壶', ...BAG_TIERS.slice(1)] as const;
export const BAG_SLOTS = [8, 12, 18, 24, 32, 48];
export const UPGRADE_PRICES = [100, 260, 650, 1600, 4200];
export const STACK_LIMIT = 64;
export const QUALITY = [
  { label: '普通', color: '#FFFFFF' }, { label: '稀有', color: '#78B9FF' },
  { label: '史诗', color: '#C9A3F8' }, { label: '传说', color: '#F7CC67' },
  { label: 'doordoor珍藏', color: '#FFFFFF' },
] as const;
export const qualityOf = (kind: CropKind) => Math.min(4, Math.max(0, CROP_META[kind].level - 1));
export const EXTRAS = ['repellent', 'growth', 'charm'] as const;
export type Extra = typeof EXTRAS[number];
export const EXTRA_NAMES = { repellent: '杀虫剂', growth: '催熟剂', charm: '铜铃纪念品' };
export const VENDORS = ['smith', 'farmer', 'chemist', 'traveler'] as const;
export type Vendor = typeof VENDORS[number];
export const VENDOR_NAMES = { smith: '铁匠·阿锻', farmer: '农民·禾姨', chemist: '药剂师·小芮', traveler: '旅行商人·洛游' };
export const VENDOR_PERSONAS = {
  smith: '务实直爽，珍视自己的手艺，不接无礼的客人。',
  farmer: '爽快但很会算账，聊到种地容易打开话匣子。',
  chemist: '谨慎细致，说话温和，讨厌别人不把用药当回事。',
  traveler: '好奇健谈，喜欢讲路上的见闻，对恶意玩笑会冷脸。',
};
export interface FarmGear {
  priceDeals: Partial<Record<Vendor, VendorPriceDeal>>;
  coop: Partial<Record<CoopSupply, boolean>>; lastChickenHelp: number;
  bag: number; bagWear: number; hoe: number; rust: number;
  extras: Record<Extra, number>;
  stockWindow: number; purchased: Record<string, number>;
  requests: Partial<Record<Vendor, { day: string; delivered: boolean }>>;
}
export function restoreGear(raw?: unknown): FarmGear {
  const v = (raw && typeof raw === 'object' ? raw : {}) as Partial<FarmGear>;
  const purchased = Object.fromEntries(Object.entries(v.purchased && typeof v.purchased === 'object' ? v.purchased : {}).slice(0, 40).map(([k, n]) => [k, finiteCount(n, 64)]));
  const requests: FarmGear['requests'] = {};
  const priceDeals: FarmGear['priceDeals'] = {};
  for (const vendor of VENDORS) {
    const deal = v.priceDeals?.[vendor];
    if (deal && Number.isFinite(deal.discountPercent) && Number.isFinite(deal.until)) priceDeals[vendor] = { discountPercent: Math.max(0, Math.min(15, Math.round(deal.discountPercent))), until: Math.max(0, deal.until) };
    const request = v.requests?.[vendor];
    if (typeof request?.day === 'string') requests[vendor] = { day: request.day, delivered: request.delivered === true };
  }
  return { priceDeals, coop: { bedding: v.coop?.bedding === true, perch: v.coop?.perch === true, feeder: v.coop?.feeder === true }, lastChickenHelp: finiteCount(v.lastChickenHelp, Number.MAX_SAFE_INTEGER), bag: finiteCount(v.bag, 5), bagWear: finiteCount(v.bagWear, 100),
    hoe: v.hoe === undefined ? 40 : finiteCount(v.hoe, 40), rust: finiteCount(v.rust, 100),
    extras: { repellent: finiteCount(v.extras?.repellent), growth: finiteCount(v.extras?.growth), charm: finiteCount(v.extras?.charm) },
    stockWindow: finiteCount(v.stockWindow, Number.MAX_SAFE_INTEGER), purchased, requests };
}
export interface BagStack {
  id: string;
  count: number;
  kind?: CropKind;
  extra?: Extra;
  type: 'seed' | 'crop' | 'premium' | 'extra' | 'hoe' | 'can' | 'compost';
}
export function bagStacks(seeds: Record<CropKind, number>, crops: Inventory, extras: FarmGear['extras'], compost = 0): BagStack[] {
  const stacks: BagStack[] = [{ id: 'hoe', type: 'hoe', count: 1 }, { id: 'can', type: 'can', count: 1 }];
  const add = (item: Omit<BagStack, 'id' | 'count'>, count: number) => {
    for (let offset = 0; offset < count; offset += STACK_LIMIT) {
      stacks.push({ ...item, id: `${item.type}:${item.kind ?? item.extra}:${offset}`, count: Math.min(STACK_LIMIT, count - offset) });
    }
  };
  for (const kind of CROP_KINDS) {
    add({ type: 'seed', kind }, seeds[kind]);
    add({ type: 'crop', kind }, crops[kind].normal);
    add({ type: 'premium', kind }, crops[kind].premium);
  }
  for (const extra of EXTRAS) add({ type: 'extra', extra }, extras[extra]);
  add({ type: 'compost' }, compost);
  return stacks;
}
export const marketWindow = (at: number) => Math.floor(at / 3_600_000);
function roll(window: number, salt: number) {
  const mixed = Math.imul(window ^ Math.imul(salt, 0x9e3779b9), 0x45d9f3b);
  return (Math.imul(mixed ^ (mixed >>> 16), 0x45d9f3b) >>> 0) / 0x100000000;
}
/** Stable for the current stock window, including after reopening the market. */
export const vendorAvailable = (vendor: Vendor, at: number) => vendor !== 'traveler' || roll(marketWindow(at), 97) < .65;
export interface Offer { id: string; crop?: CropKind; extra?: Extra; price: number; stock: number }
export function marketOffers(vendor: Vendor, at: number): Offer[] {
  const window = marketWindow(at);
  if (vendor === 'smith' || !vendorAvailable(vendor, at)) return [];
  const seed = (crop: CropKind, salt: number): Offer => ({
    id: crop, crop, price: Math.max(1, Math.round(CROP_META[crop].price * (.85 + roll(window, salt + 30) * .35))),
    stock: 1 + Math.floor(roll(window, salt + 17) * (vendor === 'farmer' ? 12 : 4)),
  });
  if (vendor === 'chemist') return EXTRAS.slice(0, 2).map((extra, i) => ({ id: extra, extra, price: [22, 48][i], stock: 3 + Math.floor(roll(window, i + 21) * 5) }));
  const selection = CROP_KINDS.filter(k => vendor === 'farmer' ? qualityOf(k) < 3 : qualityOf(k) >= 2);
  const shuffled = selection.map((crop, i) => ({ crop, key: roll(window, i + (vendor === 'farmer' ? 1 : 60)) })).sort((a, b) => a.key - b.key);
  const crops = vendor === 'farmer' ? ['radish' as const, ...shuffled.map(k => k.crop).filter(k => k !== 'radish').slice(0, 3)] : shuffled.slice(0, 2).map(k => k.crop);
  const offers = crops.map((crop, i) => seed(crop, i));
  if (vendor === 'traveler' && roll(window, 41) < .65) offers.push({ id: 'charm', extra: 'charm', price: 75, stock: 1 });
  return offers;
}
export const canCapacity = (tier: number) => 3 + tier * 3;
export const pestAt = (progress: number, needed: number, cleared: boolean | undefined) => !cleared && progress >= needed * .45;

/** Angry vendors refuse business; displeased vendors charge their personality markup. */
export const vendorCanTrade = (memory: { mood?: string }) => memory.mood !== "生气";

export interface VendorPriceDeal { discountPercent: number; until: number }
export function vendorDiscountLimit(vendor: Vendor, memory: { mood?: string; affinity: number }) {
  if (!vendorCanTrade(memory) || memory.mood === '不悦') return 0;
  return Math.min(15, 3 + Math.floor(Math.max(0, Math.min(100, memory.affinity)) / 10) + Math.round(PERSONALITIES[vendor].discount * 10) + (memory.mood === '开心' ? 2 : 0));
}
export function negotiateVendorDeal(vendor: Vendor, memory: { mood?: string; affinity: number }, discountPercent: number, at: number): VendorPriceDeal | null {
  if (!Number.isFinite(discountPercent) || discountPercent < 0 || !vendorDiscountLimit(vendor, memory)) return null;
  return { discountPercent: Math.min(vendorDiscountLimit(vendor, memory), Math.round(discountPercent)), until: (marketWindow(at) + 1) * 3_600_000 };
}
export function vendorQuotedPrice(vendor: Vendor, base: number, memory: { mood?: string; affinity: number }, at: number, deal?: VendorPriceDeal) {
  const p = PERSONALITIES[vendor];
  // Displeasure overrides discounts; neutral/happy relationships earn gradual discounts.
  const relationship = Math.max(0, Math.min(100, memory.affinity)) / 100;
  const daily = Math.floor(at / 86_400_000);
  const offer = (Math.imul(daily + VENDORS.indexOf(vendor) * 41, 0x45d9f3b) >>> 0) % 4 / 100;
  const agreed = deal && deal.until > at ? Math.max(0, Math.min(deal.discountPercent, vendorDiscountLimit(vendor, memory))) / 100 : 0;
  const factor = memory.mood === '不悦' ? 1 + p.markup : 1 - Math.min(.25, relationship * p.discount + (memory.mood === '开心' ? .04 : 0) + offer * relationship + agreed);
  return Math.max(1, Math.round(base * factor));
}
