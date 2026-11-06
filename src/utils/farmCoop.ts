export const COOP_SUPPLIES = {
  bedding: { label: '柔软稻草垫', price: 45, comfort: 20 },
  perch: { label: '木栖架', price: 95, comfort: 30 },
  feeder: { label: '谷物食水器', price: 160, comfort: 50 },
} as const;
export type CoopSupply = keyof typeof COOP_SUPPLIES;
export const coopComfort = (items: Partial<Record<CoopSupply, boolean>>) => (Object.keys(COOP_SUPPLIES) as CoopSupply[]).reduce((sum, id) => sum + (items[id] ? COOP_SUPPLIES[id].comfort : 0), 0);
/** One stable roll per minute; reopening never rerolls the same opportunity. */
export function chickenCanHelp(comfort: number, now: number, lastHelp: number, night: boolean) {
  if (night || comfort <= 0 || now - lastHelp < 180_000) return false;
  const minute = Math.floor(now / 60_000);
  const hash = Math.imul(minute ^ 0x75ad231, 0x45d9f3b);
  return ((hash ^ (hash >>> 16)) >>> 0) % 1000 < Math.min(120, comfort * 1.2);
}
