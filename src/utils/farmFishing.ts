import type { FarmPeriod } from './farmTime';

export type FishKind = 'crucian' | 'koi' | 'moonfish';

export interface FishMeta {
  id: FishKind;
  label: string;
  rarity: '普通' | '珍稀' | '传说';
  sell: number;
  desc: string;
}

export const FISH_KINDS: readonly FishKind[] = ['crucian', 'koi', 'moonfish'];

export const FISH_META: Record<FishKind, FishMeta> = {
  crucian: {
    id: 'crucian',
    label: '银鲫鱼',
    rarity: '普通',
    sell: 22,
    desc: '池塘里最常见的肥美银鲫，顾拿它煲鲜鱼豆腐汤最拿手。',
  },
  koi: {
    id: 'koi',
    label: '好运锦鲤',
    rarity: '珍稀',
    sell: 58,
    desc: '红白斑纹在阳光下闪闪发光，唯刚守了一整个下午都想见它一面。',
  },
  moonfish: {
    id: 'moonfish',
    label: '月光鱼',
    rarity: '传说',
    sell: 96,
    desc: '傍晚与深夜才浮近水面的淡蓝星光鱼，鱼鳍带着微弱月晕。',
  },
};

export interface DriftBottleNote {
  id: string;
  author: string;
  title: string;
  text: string;
  bonusCoins: number;
}

export const DRIFT_BOTTLES: readonly DriftBottleNote[] = [
  {
    id: 'bottle-1',
    author: '年轻时的 door',
    title: '第一行代码草稿',
    text: '如果将来真有一座能给家人遮风挡雨的小院子，门前一定要挖一方能映出月亮的小池塘。',
    bonusCoins: 24,
  },
  {
    id: 'bottle-2',
    author: '顾的厨房纸条',
    title: '浓汤秘方一角',
    text: '番茄要挑晒足日头的，胡萝卜切滚刀块慢煨十分钟，盛出来前撒一小撮刚摘的嫩叶。',
    bonusCoins: 22,
  },
  {
    id: 'bottle-3',
    author: '小八的折叠草图',
    title: '果园风向标',
    text: '西北角的风比池塘边柔和，以后如果画全景地图，把秋千和灯笼标在靠南的草坡最好看。',
    bonusCoins: 26,
  },
  {
    id: 'bottle-4',
    author: '玉洁的皱巴巴歌词',
    title: '副歌换气记号',
    text: '第二段主歌进副歌前少吸半口气会更松弛！谁要是捡到这张纸，记得别拿去笑我五音不全（我明明很准！）。',
    bonusCoins: 25,
  },
  {
    id: 'bottle-5',
    author: '唯刚的鱼情笔记',
    title: '雨前水位记录',
    text: '细雨刚停、水面泛起小涟漪那二十分钟，锦鲤最容易靠岸。浮漂轻点两下别急着扬竿，等第三下稳沉再提！',
    bonusCoins: 28,
  },
  {
    id: 'bottle-6',
    author: '坤坤爪印便签',
    title: '三个小脚印',
    text: '纸上印着三枚整齐的小鸡爪印，角落粘着两粒金黄的小麦壳——看来坤坤曾在这里秘密巡逻过。',
    bonusCoins: 20,
  },
  {
    id: 'bottle-7',
    author: '远方旅人',
    title: '给认真学习的你',
    text: '日子像种菜一样，浇过的水不会立刻开花，但每一份安静的积累都在泥土底下悄悄扎根。',
    bonusCoins: 30,
  },
  {
    id: 'bottle-8',
    author: '集市老船夫',
    title: '月光鱼的传说',
    text: '听说黄昏以后守在池边，偶尔能钓起泛着淡蓝微光的月光鱼，集市里出价高得很呢。',
    bonusCoins: 32,
  },
];

export interface FishingBook {
  fishStock: Record<FishKind, number>;
  caughtCounts: Record<FishKind, number>;
  bottles: string[];
  totalCasts: number;
}

export function emptyFishingBook(): FishingBook {
  return {
    fishStock: { crucian: 0, koi: 0, moonfish: 0 },
    caughtCounts: { crucian: 0, koi: 0, moonfish: 0 },
    bottles: [],
    totalCasts: 0,
  };
}

export type CatchOutcome =
  | { kind: 'fish'; fish: FishKind; luckyBonus: boolean; isNewRecord: boolean }
  | { kind: 'bottle'; bottle: DriftBottleNote; isNewBottle: boolean };

/** 按时段、唯刚池边伴钓双倍幸运与随机值决定本次甩竿渔获。 */
export function rollFishingCatch(options: {
  period: FarmPeriod;
  weigangNearby: boolean;
  book: FishingBook;
  roll?: number;
  bottleRoll?: number;
}): CatchOutcome {
  const { period, weigangNearby, book } = options;
  const r = options.roll ?? Math.random();
  const isMoonTime = period === 'evening' || period === 'night';

  const bottleChance = weigangNearby ? 0.24 : 0.16;
  const moonChance = (isMoonTime ? 0.20 : 0.06) * (weigangNearby ? 1.6 : 1);
  const koiChance = (weigangNearby ? 0.34 : 0.22);

  if (r < bottleChance) {
    const unseen = DRIFT_BOTTLES.filter(b => !book.bottles.includes(b.id));
    const pool = unseen.length ? unseen : DRIFT_BOTTLES;
    const idx = Math.floor((options.bottleRoll ?? Math.random()) * pool.length) % pool.length;
    const bottle = pool[idx];
    return { kind: 'bottle', bottle, isNewBottle: !book.bottles.includes(bottle.id) };
  }

  if (r < bottleChance + moonChance) {
    return { kind: 'fish', fish: 'moonfish', luckyBonus: weigangNearby, isNewRecord: book.caughtCounts.moonfish === 0 };
  }
  if (r < bottleChance + moonChance + koiChance) {
    return { kind: 'fish', fish: 'koi', luckyBonus: weigangNearby, isNewRecord: book.caughtCounts.koi === 0 };
  }
  return { kind: 'fish', fish: 'crucian', luckyBonus: weigangNearby, isNewRecord: book.caughtCounts.crucian === 0 };
}

export function applyFishingCatch(book: FishingBook, outcome: CatchOutcome): FishingBook {
  if (outcome.kind === 'bottle') {
    const bottles = book.bottles.includes(outcome.bottle.id)
      ? book.bottles
      : [...book.bottles, outcome.bottle.id];
    return {
      ...book,
      bottles,
      totalCasts: book.totalCasts + 1,
    };
  }
  const f = outcome.fish;
  return {
    ...book,
    fishStock: { ...book.fishStock, [f]: (book.fishStock[f] ?? 0) + 1 },
    caughtCounts: { ...book.caughtCounts, [f]: (book.caughtCounts[f] ?? 0) + 1 },
    totalCasts: book.totalCasts + 1,
  };
}

export function sellFishFromBook(book: FishingBook, fish: FishKind): { nextBook: FishingBook; earned: number; sold: number } {
  const count = book.fishStock[fish] ?? 0;
  if (count <= 0) return { nextBook: book, earned: 0, sold: 0 };
  return {
    nextBook: { ...book, fishStock: { ...book.fishStock, [fish]: 0 } },
    earned: count * FISH_META[fish].sell,
    sold: count,
  };
}

export function cookFishSoupFromBook(book: FishingBook): { nextBook: FishingBook; ok: boolean } {
  if ((book.fishStock.crucian ?? 0) >= 1) {
    return {
      ok: true,
      nextBook: { ...book, fishStock: { ...book.fishStock, crucian: book.fishStock.crucian - 1 } },
    };
  }
  if ((book.fishStock.koi ?? 0) >= 1) {
    return {
      ok: true,
      nextBook: { ...book, fishStock: { ...book.fishStock, koi: book.fishStock.koi - 1 } },
    };
  }
  return { ok: false, nextBook: book };
}

export function restoreFishingBook(raw: unknown): FishingBook {
  const base = emptyFishingBook();
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return base;
  const obj = raw as Record<string, unknown>;
  const stockSrc = (obj.fishStock && typeof obj.fishStock === 'object' ? obj.fishStock : {}) as Record<string, unknown>;
  const caughtSrc = (obj.caughtCounts && typeof obj.caughtCounts === 'object' ? obj.caughtCounts : {}) as Record<string, unknown>;
  const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? Math.max(0, Math.min(9999, Math.round(v))) : 0);
  const validBottleIds = new Set(DRIFT_BOTTLES.map(b => b.id));
  const bottles = Array.isArray(obj.bottles)
    ? [...new Set(obj.bottles.filter((id): id is string => typeof id === 'string' && validBottleIds.has(id)))]
    : [];
  return {
    fishStock: { crucian: num(stockSrc.crucian), koi: num(stockSrc.koi), moonfish: num(stockSrc.moonfish) },
    caughtCounts: { crucian: num(caughtSrc.crucian), koi: num(caughtSrc.koi), moonfish: num(caughtSrc.moonfish) },
    bottles,
    totalCasts: num(obj.totalCasts),
  };
}
