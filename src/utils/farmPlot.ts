import { CROP_META, type CropKind } from "./farmEconomy";
import { farmPlotGrowth as plotGrowth } from "./farmWatering";
export interface PlotState {
  crop: CropKind | null;
  /** 上次结算时累计的生长毫秒 */
  growMs: number;
  /** 上次结算的时间戳（虚拟时间） */
  lastSync: number;
  /** 湿润截止时间（虚拟时间） */
  wetUntil: number;
  fertilized?: boolean;
  plantedSeason?: number;
  harvests?: number;
  pestCleared?: boolean;
  pestProne?: boolean;
}

export function plotStage(p: PlotState, now: number) {
  if (!p.crop) return 0;
  const ratio = plotGrowth(p, now) / CROP_META[p.crop].growMs;
  return ratio >= 1 ? 2 : ratio >= 0.45 ? 1 : 0;
}

export function isWet(p: PlotState, now: number) {
  return p.crop !== null && now < p.wetUntil;
}

