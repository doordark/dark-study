export type FarmActivity = "plant" | "water" | "harvest";
export interface FarmJournal {
  date: string;
  counts: Record<FarmActivity, number>;
  claimed: FarmActivity[];
}
export const DAILY_GOALS: Record<FarmActivity, { label: string; target: number; coins: number }> = {
  plant: { label: "播种 4 株作物", target: 4, coins: 18 },
  water: { label: "照料 4 块田地", target: 4, coins: 16 },
  harvest: { label: "收获 3 株作物", target: 3, coins: 30 },
};
export function realDate(at: number): string {
  const d = new Date(at);
  return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
}
export function emptyJournal(at: number): FarmJournal {
  return { date: realDate(at), counts: { plant: 0, water: 0, harvest: 0 }, claimed: [] };
}
export function finiteCount(value: unknown, cap = 1_000_000): number {
  return typeof value === "number" && Number.isFinite(value) ? Math.min(cap, Math.max(0, Math.floor(value))) : 0;
}
export function restoreJournal(raw: unknown, at: number): FarmJournal {
  const fresh = emptyJournal(at);
  if (!raw || typeof raw !== "object") return fresh;
  const v = raw as Partial<FarmJournal>;
  if (v.date !== fresh.date) return fresh;
  for (const kind of Object.keys(DAILY_GOALS) as FarmActivity[]) fresh.counts[kind] = finiteCount(v.counts?.[kind], DAILY_GOALS[kind].target);
  fresh.claimed = Array.isArray(v.claimed) ? [...new Set(v.claimed.filter((k) => k in DAILY_GOALS && fresh.counts[k] >= DAILY_GOALS[k].target))] : [];
  return fresh;
}
export function recordActivity(raw: FarmJournal, kind: FarmActivity, amount: number, at: number): FarmJournal {
  const journal = restoreJournal(raw, at);
  return { ...journal, counts: { ...journal.counts, [kind]: Math.min(DAILY_GOALS[kind].target, journal.counts[kind] + finiteCount(amount)) } };
}
export function claimGoal(raw: FarmJournal, kind: FarmActivity, at: number): { journal: FarmJournal; reward: number } {
  const journal = restoreJournal(raw, at);
  if (journal.claimed.includes(kind) || journal.counts[kind] < DAILY_GOALS[kind].target) return { journal, reward: 0 };
  return { journal: { ...journal, claimed: [...journal.claimed, kind] }, reward: DAILY_GOALS[kind].coins };
}
export const farmLevel = (harvested: number) => 1 + Math.floor(finiteCount(harvested) / 8);
export const waterCapacity = (upgrade: number) => 3 + finiteCount(upgrade, 3) * 3;
export const upgradeCost = (upgrade: number) => 90 + finiteCount(upgrade, 3) * 90;
export function compostReward(score: number): number { return Math.min(5, Math.floor(finiteCount(score) / 4)); }
export function qualityPrice(price: number, fertilized: boolean): number { return Math.round(price * (fertilized ? 1.15 : 1)); }
export function fertilizedGrowth(growth: number, required: number): number { return Math.min(required, Math.max(0, growth) + required * 0.25); }
export function remainingGrowthTime(remaining: number, wetRemaining: number): number {
  const wet = Math.min(Math.max(0, remaining), Math.max(0, wetRemaining));
  return wet + Math.max(0, remaining - wet) / 0.35;
}
