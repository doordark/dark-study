import { CROP_LABELS, RECIPES, type CropKind, type Recipe } from './farmEconomy';
import { RESIDENTS, RESIDENT_IDS, type ResidentId } from './farmLife';
import { realDate } from './farmProgress';
import type { ResidentMemory } from './farmMemory';
import { appendEpisode } from './farmPersonaMemory';
import type { TownEvent } from './farmTown';

export type GiftItemId = CropKind | Recipe['id'];
export type GiftTier = 'loved' | 'liked' | 'normal';

export interface GiftPreference {
  loved: GiftItemId[];
  liked: GiftItemId[];
}

export const GIFT_PREFERENCES: Record<ResidentId, GiftPreference> = {
  door: {
    loved: ['star', 'moonroot', 'bread', 'soup'],
    liked: ['tomato', 'grape', 'carrot', 'pie'],
  },
  gu: {
    loved: ['soup', 'jam', 'dewberry', 'sunmelon'],
    liked: ['carrot', 'tomato', 'berry', 'pumpkin'],
  },
  xiaoba: {
    loved: ['pie', 'sunmelon', 'corn', 'bread'],
    liked: ['pumpkin', 'grape', 'radish', 'jam'],
  },
  yujie: {
    loved: ['berry', 'jam', 'dewberry', 'grape'],
    liked: ['sunmelon', 'pie', 'bread', 'tomato'],
  },
  weigang: {
    loved: ['pie', 'radish', 'moonroot', 'soup'],
    liked: ['wheat', 'corn', 'carrot', 'bread'],
  },
  chicken: {
    loved: ['wheat', 'corn', 'bread', 'berry'],
    liked: ['radish', 'carrot', 'dewberry', 'pumpkin'],
  },
};

export function giftLabel(item: GiftItemId): string {
  if (item in CROP_LABELS) return CROP_LABELS[item as CropKind];
  return RECIPES.find(r => r.id === item)?.label ?? item;
}

export function giftTierFor(who: ResidentId, item: GiftItemId): GiftTier {
  const pref = GIFT_PREFERENCES[who];
  if (pref.loved.includes(item)) return 'loved';
  if (pref.liked.includes(item)) return 'liked';
  return 'normal';
}

export interface GiftReward {
  kind: 'coins' | 'compost' | 'seed';
  amount: number;
  crop?: CropKind;
  label: string;
}

export interface GiftOutcome {
  tier: GiftTier;
  reply: string;
  affinityDelta: number;
  nextMemory: ResidentMemory;
  reward?: GiftReward;
  rumor?: TownEvent;
  countsToday: number;
}

const DAILY_GIFT_GAIN_CAP = 2;

function pickReturnGift(who: ResidentId, at: number): GiftReward {
  const roll = Math.abs(Math.floor(at / 1000)) % 3;
  if (who === 'gu') return { kind: 'seed', crop: 'berry', amount: 1, label: '1 粒蓝莓种子' };
  if (who === 'door') return { kind: 'coins', amount: 16, label: '16 金币零花' };
  if (who === 'weigang') return roll === 0 ? { kind: 'compost', amount: 1, label: '1 份水草有机肥' } : { kind: 'coins', amount: 14, label: '14 金币' };
  if (who === 'chicken') return { kind: 'compost', amount: 1, label: '1 份捉虫有机肥' };
  if (who === 'yujie') return { kind: 'seed', crop: 'tomato', amount: 1, label: '1 粒番茄种子' };
  return { kind: 'seed', crop: 'corn', amount: 1, label: '1 粒玉米种子' };
}

function giftReactionLine(who: ResidentId, label: string, tier: GiftTier, wasAngry: boolean, rewardLabel?: string): string {
  const tail = rewardLabel ? ` 这个${rewardLabel}顺手给你留着！` : '';
  if (wasAngry) {
    return ({
      door: `……谢谢你的${label}。我还在缓情绪，不过领你这份心意。`,
      gu: `哼，拿${label}哄我呀？好吧，气消了一半，下次好好说话。`,
      xiaoba: `……收下了，${label}挺不错的。刚才的事算翻篇一点吧。`,
      yujie: `切，送个${label}就想收买我？……算了，看在你亲自拿来的份上，少生点气。`,
      weigang: `嗯……谢谢你送的${label}，我心里好受多了。`,
      chicken: `咕……闻到${label}这么香，坤坤原谅你一半啦。`,
    } as Record<ResidentId, string>)[who];
  }
  if (tier === 'loved') {
    return ({
      door: `居然是${label}！写代码熬思绪时最合胃口了，太懂我了。${tail}`,
      gu: `哇，新鲜的${label}！正想着拿它给家里添道拿手菜呢，谢谢你呀。${tail}`,
      xiaoba: `这正是我最喜欢的${label}，收好了。等我画完新地图第一个请你试。${tail}`,
      yujie: `天哪竟然是${label}！润完嗓子感觉今天高音都能多冲两句，算你有眼光！${tail}`,
      weigang: `嗯……是我最喜欢的${label}！带去池边守漂正好，真的很谢谢你。${tail}`,
      chicken: `咕咕咕！是最香的${label}！坤坤高兴得转了两圈！${tail}`,
    } as Record<ResidentId, string>)[who];
  }
  if (tier === 'liked') {
    return ({
      door: `${label}看着品相真好，谢谢你惦记着我。`,
      gu: `好水灵的${label}，留着晚饭一块儿做给大伙儿尝。`,
      xiaoba: `谢谢，${label}我挺喜欢的，放桌边慢慢吃。`,
      yujie: `哟，带了${label}来呀，勉强给你打个高分，谢啦！`,
      weigang: `谢谢你的${label}，我会好好收着的。`,
      chicken: `咕！${label}闻起来很不错，坤坤喜欢！`,
    } as Record<ResidentId, string>)[who];
  }
  return ({
    door: `谢谢你的${label}，这份心意我收下啦。`,
    gu: `你还专门带了${label}来，客气啦，快坐下喝口茶。`,
    xiaoba: `嗯，收到了，谢谢你想着我。`,
    yujie: `行吧，虽然不是我头号心头好，但${label}我也收下啦，谢了。`,
    weigang: `嗯……谢谢你送我${label}，辛苦种出来的吧。`,
    chicken: `咕，谢谢客人给坤坤带${label}！`,
  } as Record<ResidentId, string>)[who];
}

/** 计算送礼后的情感变化、人格记忆沉淀、回礼与喜事传闻。 */
export function evaluateResidentGift(
  who: ResidentId,
  item: GiftItemId,
  memory: ResidentMemory,
  giftedTodayCount: number,
  at: number,
): GiftOutcome {
  const tier = giftTierFor(who, item);
  const label = giftLabel(item);
  const wasAngry = memory.mood === '生气' || memory.mood === '不悦';
  const underCap = giftedTodayCount < DAILY_GIFT_GAIN_CAP;
  const rawGain = wasAngry ? 2 : tier === 'loved' ? 6 : tier === 'liked' ? 3 : 2;
  const affinityDelta = underCap ? rawGain : 0;
  const reward = !wasAngry && tier === 'loved' && underCap ? pickReturnGift(who, at) : undefined;
  const reply = giftReactionLine(who, label, tier, wasAngry, reward?.label);
  const nextMood: ResidentMemory['mood'] = wasAngry ? '缓和' : '开心';

  let nextMemory: ResidentMemory = {
    ...memory,
    affinity: Math.min(100, Math.max(0, memory.affinity + affinityDelta)),
    mood: nextMood,
  };
  nextMemory = appendEpisode(nextMemory, {
    id: `gift-${at}-${who}-${item}`,
    kind: 'chat',
    text: `客人专门送了我${label}，${tier === 'loved' ? '正好是我最喜欢的，特别开心' : '心里挺暖的'}。`,
    actors: ['player'],
    tags: [label, '送礼', '心意'],
    importance: tier === 'loved' ? 8 : 6,
    emotion: wasAngry ? '缓和' : '开心',
    privacy: 'public',
    at,
  });

  const rumor: TownEvent | undefined = tier === 'loved' && !wasAngry && underCap
    ? {
        id: `gift-rumor-${at}-${who}`,
        title: `${RESIDENTS[who].name}收到最爱的${label}`,
        detail: `客人刚把${label}送给了${RESIDENTS[who].name}，他高兴得逢人就想夸两句。`,
        kind: 'rumor',
        knownBy: [who],
        hotspot: 'plaza',
        createdAt: at,
        expiresAt: at + 12 * 3600_000,
      }
    : undefined;

  return {
    tier,
    reply,
    affinityDelta,
    nextMemory,
    ...(reward ? { reward } : {}),
    ...(rumor ? { rumor } : {}),
    countsToday: giftedTodayCount + 1,
  };
}

export interface ResidentWish {
  id: string;
  date: string;
  resident: ResidentId;
  crop: CropKind;
  quantity: number;
  reason: string;
  rewardCoins: number;
  fulfilled: boolean;
}

const WISH_TEMPLATES: Record<ResidentId, { crop: CropKind; quantity: number; reason: string; rewardCoins: number }[]> = {
  door: [
    { crop: 'wheat', quantity: 2, reason: '想烤两条麦香面包配深夜写代码时的热茶', rewardCoins: 34 },
    { crop: 'tomato', quantity: 2, reason: '打算给顾打下手熬一锅番茄浓汤', rewardCoins: 56 },
    { crop: 'radish', quantity: 2, reason: '想试试顾教的清炖萝卜汤', rewardCoins: 36 },
  ],
  gu: [
    { crop: 'carrot', quantity: 2, reason: '今晚煲田园浓汤正好缺两根脆胡萝卜', rewardCoins: 68 },
    { crop: 'berry', quantity: 2, reason: '想趁新鲜熬一罐莓果果酱给孩子们抹面包', rewardCoins: 48 },
    { crop: 'radish', quantity: 2, reason: '天气转凉，想炖一锅热乎萝卜汤', rewardCoins: 36 },
  ],
  xiaoba: [
    { crop: 'corn', quantity: 2, reason: '画新地图容易饿，想烤两根玉米当夜宵', rewardCoins: 72 },
    { crop: 'wheat', quantity: 2, reason: '想自己试着烤点小点心分给弟弟', rewardCoins: 34 },
    { crop: 'carrot', quantity: 2, reason: '给家里厨房补点新鲜胡萝卜', rewardCoins: 68 },
  ],
  yujie: [
    { crop: 'berry', quantity: 2, reason: '练汪苏泷的副歌有点干嗓子，想吃两颗甜蓝莓润润喉', rewardCoins: 50 },
    { crop: 'tomato', quantity: 2, reason: '想做盘糖拌番茄边看小说边吃', rewardCoins: 56 },
    { crop: 'wheat', quantity: 2, reason: '惦记着麦香面包，凑点小麦给厨房', rewardCoins: 36 },
  ],
  weigang: [
    { crop: 'radish', quantity: 2, reason: '池边守漂风大，想带点萝卜汤暖暖手', rewardCoins: 38 },
    { crop: 'wheat', quantity: 2, reason: '想揉点麦香小饵料试试新钓位', rewardCoins: 34 },
    { crop: 'corn', quantity: 2, reason: '听说甜玉米颗粒钓大鱼特别灵', rewardCoins: 72 },
  ],
  chicken: [
    { crop: 'wheat', quantity: 2, reason: '咕！想在鸡窝旁边藏两把最香的小麦粒', rewardCoins: 32 },
    { crop: 'radish', quantity: 1, reason: '咕，想啄两口脆脆的小萝卜叶子', rewardCoins: 24 },
    { crop: 'corn', quantity: 1, reason: '咕咕！金灿灿的玉米粒看着太诱人啦', rewardCoins: 42 },
  ],
};

/** 每日根据真实日期与农场等级生成 3 条不重复的居民个人心愿便签。 */
export function generateDailyWishes(level: number, at: number): ResidentWish[] {
  const date = realDate(at);
  const seed = [...date].reduce((acc, ch) => (acc * 31 + ch.charCodeAt(0)) >>> 0, 17);
  const pickedResidents: ResidentId[] = [];
  for (let i = 0; i < RESIDENT_IDS.length && pickedResidents.length < 3; i++) {
    const id = RESIDENT_IDS[(seed + i * 2) % RESIDENT_IDS.length];
    if (!pickedResidents.includes(id)) pickedResidents.push(id);
  }
  const unlockedCrops = new Set<CropKind>(
    level >= 3
      ? ['radish', 'wheat', 'carrot', 'berry', 'tomato', 'corn']
      : level >= 2
        ? ['radish', 'wheat', 'carrot', 'berry']
        : ['radish', 'wheat'],
  );

  return pickedResidents.map((resident, idx) => {
    const pool = WISH_TEMPLATES[resident];
    const eligible = pool.filter(w => unlockedCrops.has(w.crop));
    const list = eligible.length ? eligible : pool.filter(w => w.crop === 'wheat' || w.crop === 'radish');
    const chosen = list[(seed + idx) % list.length] ?? pool[0];
    return {
      id: `wish-${date}-${resident}`,
      date,
      resident,
      crop: chosen.crop,
      quantity: chosen.quantity,
      reason: chosen.reason,
      rewardCoins: chosen.rewardCoins,
      fulfilled: false,
    };
  });
}

export function restoreDailyWishes(raw: unknown, level: number, at: number): ResidentWish[] {
  const date = realDate(at);
  if (!Array.isArray(raw)) return generateDailyWishes(level, at);
  const valid: ResidentWish[] = raw.slice(0, 4).flatMap(entry => {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) return [];
    const item = entry as Record<string, unknown>;
    if (item.date !== date) return [];
    const id = typeof item.id === 'string' && item.id ? item.id.slice(0, 80) : '';
    const resident = item.resident;
    const crop = item.crop;
    const quantity = typeof item.quantity === 'number' && Number.isFinite(item.quantity) ? Math.max(1, Math.min(5, Math.round(item.quantity))) : 0;
    const reason = typeof item.reason === 'string' ? item.reason.trim().slice(0, 100) : '';
    const rewardCoins = typeof item.rewardCoins === 'number' && Number.isFinite(item.rewardCoins) ? Math.max(10, Math.min(300, Math.round(item.rewardCoins))) : 30;
    if (!id || !RESIDENT_IDS.includes(resident as ResidentId) || typeof crop !== 'string' || !(crop in CROP_LABELS) || !quantity || !reason) return [];
    return [{ id, date, resident: resident as ResidentId, crop: crop as CropKind, quantity, reason, rewardCoins, fulfilled: item.fulfilled === true }];
  });
  return valid.length ? valid : generateDailyWishes(level, at);
}
