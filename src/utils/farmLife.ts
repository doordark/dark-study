export const RESIDENT_IDS = ["door", "gu", "xiaoba", "yujie", "weigang", "chicken"] as const;
export type ResidentId = typeof RESIDENT_IDS[number];
export const RESIDENTS: Record<ResidentId, { name: string; row: number; persona: string; home: { x: number; y: number }; lane: { x: number; y: number; w: number; h: number } }> = {
  door: { name: "door", row: 0, persona: "温和嘴硬的开发者，会照料家人，想休息却总惦记代码；和顾是伴侣", home: { x: 22, y: 151 }, lane: { x: 8, y: 151, w: 30, h: 80 } },
  gu: { name: "顾", row: 1, persona: "细腻俏皮，懂植物也懂家人的情绪；会温柔打趣door并提醒他休息", home: { x: 146, y: 154 }, lane: { x: 146, y: 151, w: 26, h: 85 } },
  xiaoba: { name: "小八", row: 2, persona: "door和顾的长子，稳重但也会撒娇，习惯先照顾弟弟", home: { x: 10, y: 164 }, lane: { x: 5, y: 166, w: 31, h: 75 } },
  yujie: { name: "玉洁", row: 3, persona: "次子，活泼嘴贫爱吃，喜欢开玩笑但绝不恶意伤人", home: { x: 80, y: 222 }, lane: { x: 68, y: 226, w: 66, h: 15 } },
  weigang: { name: "唯纲", row: 4, persona: "幼子，戴紫色魔法帽，认真又天真，坚信照顾植物就是魔法", home: { x: 174, y: 234 }, lane: { x: 147, y: 223, w: 27, h: 18 } },
  chicken: { name: "坤坤", row: 5, persona: "圆滚滚的小鸡，胆小黏人，爱虫子和晒太阳；短句，偶尔咕一声", home: { x: 156, y: 196 }, lane: { x: 146, y: 182, w: 28, h: 56 } },
};
export interface LifeSettings { roaming: boolean; chatter: boolean; interval: number; online: boolean; aiMinutes: number; dailyLimit: number }
export const DEFAULT_LIFE: LifeSettings = { roaming: true, chatter: true, interval: 90, online: false, aiMinutes: 10, dailyLimit: 3 };
export interface LifeUsage { date: string; count: number; lastAt: number }
export interface LifeLine { speaker: ResidentId; text: string; at: number; online: boolean }
export const lifeDate = (at: number) => { const d = new Date(at); return `${d.getFullYear()}-${d.getMonth()+1}-${d.getDate()}`; };
export function normalizeLifeSettings(raw: Partial<LifeSettings> | null): LifeSettings {
  return {
    roaming: typeof raw?.roaming === "boolean" ? raw.roaming : true,
    chatter: typeof raw?.chatter === "boolean" ? raw.chatter : true,
    online: raw?.online === true,
    interval: [45,90,180].includes(raw?.interval ?? 0) ? raw!.interval! : 90,
    aiMinutes: [5,10,20].includes(raw?.aiMinutes ?? 0) ? raw!.aiMinutes! : 10,
    dailyLimit: [1,3,5].includes(raw?.dailyLimit ?? 0) ? raw!.dailyLimit! : 3,
  };
}
export function normalizeLifeUsage(raw: Partial<LifeUsage> | null, at: number): LifeUsage {
  return { date: lifeDate(at), count: raw?.date === lifeDate(at) && Number.isFinite(raw.count) ? Math.max(0, Math.floor(raw.count!)) : 0, lastAt: Number.isFinite(raw?.lastAt) ? Math.max(0, raw!.lastAt!) : 0 };
}
export function reserveLifeRequest(raw: LifeUsage, settings: LifeSettings, at: number): LifeUsage | null {
  const usage = normalizeLifeUsage(raw, at);
  if (!settings.online || !settings.chatter || usage.count >= settings.dailyLimit || (usage.lastAt > 0 && at - usage.lastAt < settings.aiMinutes * 60_000)) return null;
  return { ...usage, count: usage.count + 1, lastAt: at };
}
export function readLifeReply(raw: string, pair: readonly ResidentId[]): { speaker: ResidentId; text: string }[] | null {
  try {
    const value = JSON.parse(raw) as { lines?: { speaker?: unknown; text?: unknown }[] };
    if (!Array.isArray(value.lines) || value.lines.length !== 2) return null;
    const lines = value.lines;
    if (!lines.every((line, i) => line.speaker === pair[i] && typeof line.text === "string" && line.text.trim().length > 0 && line.text.length <= 44)) return null;
    return lines.map((line) => ({ speaker: line.speaker as ResidentId, text: (line.text as string).trim() }));
  } catch { return null; }
}
export const LOCAL_SCENES: { pair: [ResidentId, ResidentId]; lines: [string, string] }[] = [
  { pair: ["door", "gu"], lines: ["我保证，浇完这壶水就去休息。", "好呀，这次我替水壶监督你。"] },
  { pair: ["xiaoba", "yujie"], lines: ["篮子我拿着，你别一边走一边偷吃。", "我只是替全家检查蓝莓甜不甜！"] },
  { pair: ["weigang", "chicken"], lines: ["坤坤，陪我念一句让种子发芽的咒语。", "咕！咒语念完有虫子吃吗？"] },
  { pair: ["gu", "xiaoba"], lines: ["小八，今天也给自己留一点玩的时间。", "那我去池边看一会儿水，你们别太累。"] },
  { pair: ["door", "weigang"], lines: ["你的小魔法今天进展怎么样？", "进展很好！它需要阳光、水，还有一点耐心。"] },
  { pair: ["yujie", "chicken"], lines: ["坤坤，别跟着篮子啦，里面真的没有虫。", "咕……那我跟着你，万一有呢。"] },
  { pair: ["gu", "yujie"], lines: ["今天的果子要等大家一起尝哦。", "我记住了，我只闻闻，绝对不咬！"] },
  { pair: ["xiaoba", "weigang"], lines: ["帽子扶好，风又把它吹歪啦。", "这是魔法师的方向仪，不是吹歪。"] },
  { pair: ["door", "chicken"], lines: ["巡田辛苦了，小队长。", "咕！本队长申请加一把米！"] },
  { pair: ["gu", "weigang"], lines: ["一颗种子长大，也可以慢慢来。", "我知道，厉害的魔法都要等一会儿。"] },
];
