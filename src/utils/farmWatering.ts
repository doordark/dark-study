import { CROP_META, type CropKind } from './farmEconomy';
export interface WaterablePlot {
  crop: CropKind | null;
  growMs: number;
  lastSync: number;
  wetUntil: number;
}
export function farmPlotGrowth(p: WaterablePlot, now: number): number {
  if (!p.crop) return 0;
  if (now <= p.lastSync) return p.growMs;
  const wetEnd = Math.max(p.lastSync, p.wetUntil);
  const wet = Math.max(0, Math.min(now, wetEnd) - p.lastSync);
  return p.growMs + wet + Math.max(0, now - wetEnd) * 0.35;
}
/** All player/NPC watering spends the same finite shared water supply. */
export function waterFarmPlots<T extends WaterablePlot>(plots: readonly T[], water: number, at: number, wetMs: number, allowed?: readonly number[]) {
  const capacity = Number.isFinite(water) ? Math.max(0, Math.floor(water)) : 0;
  const ids = plots.map((p, i) => p.crop && (!allowed || allowed.includes(i)) && p.wetUntil <= at && farmPlotGrowth(p, at) < CROP_META[p.crop].growMs ? i : -1).filter(i => i >= 0).slice(0, capacity);
  return {
    plots: plots.map((p, i) => ids.includes(i) ? {
      ...p,
      growMs: farmPlotGrowth(p, at),
      lastSync: at,
      wetUntil: at + Math.max(0, wetMs)
    } : p),
    water: capacity - ids.length,
    ids
  };
}
