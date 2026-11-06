import { finiteCount, realDate } from './farmProgress';

export const CROP_KINDS = ['radish', 'wheat', 'carrot', 'berry', 'tomato', 'corn', 'pumpkin', 'grape', 'star', 'moonroot', 'dewberry', 'sunmelon'] as const;
export type CropKind = typeof CROP_KINDS[number];
export const SEASON_NAMES = ['春', '夏', '秋', '冬'];
const minute = 60_000;
export const CROP_META: Record<CropKind, { price: number; sell: number; growMs: number; level: number; seasons: number[]; yield: number; rounds: number }> = {
  radish: { price: 8, sell: 13, growMs: 4 * minute, level: 1, seasons: [0, 3], yield: 1, rounds: 1 },
  wheat: { price: 12, sell: 10, growMs: 7 * minute, level: 1, seasons: [0, 2], yield: 2, rounds: 1 },
  carrot: { price: 18, sell: 28, growMs: 12 * minute, level: 2, seasons: [0, 2], yield: 1, rounds: 1 },
  berry: { price: 38, sell: 17, growMs: 18 * minute, level: 2, seasons: [0, 1], yield: 1, rounds: 3 },
  tomato: { price: 48, sell: 21, growMs: 24 * minute, level: 3, seasons: [1], yield: 1, rounds: 3 },
  corn: { price: 42, sell: 29, growMs: 30 * minute, level: 3, seasons: [1, 2], yield: 2, rounds: 1 },
  pumpkin: { price: 68, sell: 98, growMs: 48 * minute, level: 4, seasons: [2], yield: 1, rounds: 1 },
  grape: { price: 94, sell: 43, growMs: 60 * minute, level: 4, seasons: [2], yield: 1, rounds: 3 },
  moonroot: { price: 24, sell: 36, growMs: 15 * minute, level: 2, seasons: [3], yield: 1, rounds: 1 },
  dewberry: { price: 58, sell: 85, growMs: 38 * minute, level: 3, seasons: [0, 1], yield: 1, rounds: 1 },
  sunmelon: { price: 110, sell: 158, growMs: 72 * minute, level: 4, seasons: [1], yield: 1, rounds: 1 },
  star: { price: 120, sell: 172, growMs: 90 * minute, level: 5, seasons: [3], yield: 1, rounds: 1 },
};
export const isCropKind = (value: unknown): value is CropKind => CROP_KINDS.includes(value as CropKind);
export const cropRecord = (value = 0): Record<CropKind, number> => Object.fromEntries(CROP_KINDS.map(k => [k, value])) as Record<CropKind, number>;
export function restoreSeeds(raw: unknown) {
  const seeds = cropRecord();
  if (raw && typeof raw === 'object') for (const k of CROP_KINDS) seeds[k] = finiteCount((raw as Record<string, unknown>)[k]);
  return seeds;
}
export interface Stock { normal: number; premium: number }
export type Inventory = Record<CropKind, Stock>;
export function restoreInventory(raw?: unknown): Inventory {
  const source = raw && typeof raw === 'object' ? raw as Record<string, Partial<Stock>> : {};
  return Object.fromEntries(CROP_KINDS.map(k => [k, { normal: finiteCount(source[k]?.normal), premium: finiteCount(source[k]?.premium) }])) as Inventory;
}
export interface Economy { inventory: Inventory; orders: { date: string; claimed: string[] }; kitchen: boolean; irrigation: number; rescueDate: string }
export function restoreEconomy(raw: unknown, at: number): Economy {
  const v = (raw && typeof raw === 'object' ? raw : {}) as Partial<Economy>;
  return { inventory: restoreInventory(v.inventory), kitchen: v.kitchen === true, irrigation: finiteCount(v.irrigation, 3), rescueDate: typeof v.rescueDate === 'string' ? v.rescueDate : '', orders: { date: realDate(at), claimed: v.orders?.date === realDate(at) && Array.isArray(v.orders.claimed) ? [...new Set(v.orders.claimed.filter(isCropKind))] : [] } };
}
export const irrigationCost = (upgrade: number) => [180, 420, 780][finiteCount(upgrade, 3)] ?? 0;
export const wetDuration = (upgrade: number) => (30 + finiteCount(upgrade, 3) * 15) * minute;
// Versioned migration resets money once. Future loads preserve the earned balance.
export const migrateCoins = (version: unknown, coins: unknown) => version === 4 ? finiteCount(coins) : 120;
export function marketRate(kind: CropKind, at: number): number {
  const date = String(Math.floor(at / 3_600_000));
  const hash = [...date].reduce((n, c) => (n * 31 + c.charCodeAt(0)) >>> 0, 7);
  return [0.85, 1, 1.15][(hash + CROP_KINDS.indexOf(kind) * 7) % 3];
}
export const unitPrice = (kind: CropKind, premium: boolean, at: number) => Math.max(1, Math.round(CROP_META[kind].sell * marketRate(kind, at) * (premium ? 1.3 : 1)));
export const stockCount = (s: Stock) => s.normal + s.premium;
export const stockValue = (kind: CropKind, s: Stock, at: number) => s.normal * unitPrice(kind, false, at) + s.premium * unitPrice(kind, true, at);
export function consume(stock: Stock, count: number): Stock | null {
  if (!Number.isInteger(count) || count <= 0 || stockCount(stock) < count) return null;
  const normal = Math.min(stock.normal, count);
  return { normal: stock.normal - normal, premium: stock.premium - (count - normal) };
}
export function dailyOrder(kind: CropKind, at: number) {
  const quantity = 2 + ((new Date(at).getDate() + CROP_KINDS.indexOf(kind)) % 3);
  return { quantity, reward: Math.round(CROP_META[kind].sell * quantity * 1.45) };
}
export function completeOrder(raw: Economy, kind: CropKind, level: number, at: number): { economy: Economy; reward: number } | null {
  const current = restoreEconomy(raw, at);
  if (level < CROP_META[kind].level || current.orders.claimed.includes(kind)) return null;
  const order = dailyOrder(kind, at);
  const rest = consume(current.inventory[kind], order.quantity);
  if (!rest) return null;
  return { economy: { ...current, inventory: { ...current.inventory, [kind]: rest }, orders: { ...current.orders, claimed: [...current.orders.claimed, kind] } }, reward: order.reward };
}
export const RECIPES = [
  { id: 'bread', label: '麦香面包', inputs: { wheat: 3 }, fee: 6, sell: 48 },
  { id: 'jam', label: '莓果果酱', inputs: { berry: 3 }, fee: 10, sell: 82 },
  { id: 'soup', label: '田园浓汤', inputs: { carrot: 1, tomato: 2 }, fee: 12, sell: 108 },
  { id: 'pie', label: '南瓜派', inputs: { pumpkin: 1, wheat: 2 }, fee: 20, sell: 178 },
] as const;
export type Recipe = typeof RECIPES[number];
export function craft(inventory: Inventory, recipe: Recipe, coins: number): Inventory | null {
  if (coins < recipe.fee) return null;
  const next = { ...inventory };
  for (const [kind, count] of Object.entries(recipe.inputs) as [CropKind, number][]) {
    const rest = consume(next[kind], count);
    if (!rest) return null;
    next[kind] = rest;
  }
  return next;
}
export function harvestResult(kind: CropKind, fertilized: boolean, plantedSeason: number, harvests = 0) {
  const meta = CROP_META[kind];
  return { quantity: meta.yield + (meta.seasons.includes(plantedSeason) ? 1 : 0), premium: fertilized, regrow: harvests + 1 < meta.rounds };
}
