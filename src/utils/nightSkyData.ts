import AsyncStorage from "@react-native-async-storage/async-storage";
import type { NightSkyQuote } from "@/constants/nightSkyQuotes";

export interface StarSpot {
  x: number;
  y: number;
  s: number;
}

export interface ConstellationDef {
  id: string;
  name: string;
  subtitle: string;
  motto: string;
  spots: readonly StarSpot[];
  /** 标准星象连线（星点下标对），确保无论拾取顺序如何都能呈现真实星图 */
  edges: readonly (readonly [number, number])[];
}

export const TOTAL_STARS = 7;

export const LEGACY_VISIT_KEY = "dark-study-night-visits";
export const NIGHT_CHRONICLE_KEY = "dark-study-night-chronicle";
export const NIGHT_FAVORITES_KEY = "dark-study-night-favorites";
export const NIGHT_WISHES_KEY = "dark-study-night-wishes";
export const STAR_DEW_BLESSING_KEY = "dark-study-night-stardew-blessing";
export const STAR_DEW_COOLDOWN_KEY = "dark-study-night-stardew-blessing-date";
export const MAX_FAVORITE_QUOTES = 40;
export const MAX_NIGHT_WISHES = 30;
const MAX_WISH_TEXT_LENGTH = 36;
const DEFAULT_ECHO_MIN_AGE_MS = 12 * 3600 * 1000;
const STAR_DEW_EVENT_TTL_MS = 6 * 3600 * 1000;

/**
 * 六组手工校准的七星星象图谱：
 * 所有坐标严格位于安全天区（x ∈ [0.14, 0.84], y ∈ [0.10, 0.88]），
 * 两两星距 ≥ 0.15，避开顶部标题、月亮、猫头鹰枝桠与底部星笺卡片。
 */
export const NIGHT_CONSTELLATIONS: readonly ConstellationDef[] = [
  {
    id: "big-dipper",
    name: "北斗七星",
    subtitle: "玉衡引路",
    motto: "斗柄所指，皆是归途。",
    spots: [
      { x: 0.14, y: 0.24, s: 25 },
      { x: 0.28, y: 0.14, s: 26 },
      { x: 0.43, y: 0.22, s: 27 },
      { x: 0.56, y: 0.38, s: 23 },
      { x: 0.54, y: 0.72, s: 24 },
      { x: 0.77, y: 0.84, s: 26 },
      { x: 0.84, y: 0.48, s: 28 },
    ],
    edges: [
      [0, 1],
      [1, 2],
      [2, 3],
      [3, 4],
      [4, 5],
      [5, 6],
      [6, 3],
    ],
  },
  {
    id: "cassiopeia",
    name: "仙后织梦",
    subtitle: "霜林星冕",
    motto: "穿过长夜的折线，总通向黎明。",
    spots: [
      { x: 0.14, y: 0.34, s: 25 },
      { x: 0.28, y: 0.72, s: 26 },
      { x: 0.45, y: 0.42, s: 28 },
      { x: 0.62, y: 0.76, s: 25 },
      { x: 0.8, y: 0.38, s: 26 },
      { x: 0.48, y: 0.1, s: 24 },
      { x: 0.24, y: 0.12, s: 22 },
    ],
    edges: [
      [0, 1],
      [1, 2],
      [2, 3],
      [3, 4],
      [2, 5],
      [5, 6],
    ],
  },
  {
    id: "cygnus",
    name: "天鹅渡河",
    subtitle: "银河展翼",
    motto: "沿着星河振翅，风会托住你。",
    spots: [
      { x: 0.22, y: 0.14, s: 28 },
      { x: 0.48, y: 0.42, s: 27 },
      { x: 0.78, y: 0.8, s: 25 },
      { x: 0.64, y: 0.22, s: 24 },
      { x: 0.84, y: 0.12, s: 23 },
      { x: 0.31, y: 0.64, s: 24 },
      { x: 0.14, y: 0.86, s: 23 },
    ],
    edges: [
      [0, 1],
      [1, 2],
      [4, 3],
      [3, 1],
      [1, 5],
      [5, 6],
    ],
  },
  {
    id: "lyra",
    name: "天琴夜曲",
    subtitle: "琴弦微光",
    motto: "把未说出口的心事，拨成晚风。",
    spots: [
      { x: 0.32, y: 0.12, s: 28 },
      { x: 0.16, y: 0.3, s: 22 },
      { x: 0.46, y: 0.34, s: 24 },
      { x: 0.7, y: 0.3, s: 23 },
      { x: 0.78, y: 0.68, s: 25 },
      { x: 0.52, y: 0.78, s: 26 },
      { x: 0.34, y: 0.88, s: 23 },
    ],
    edges: [
      [1, 0],
      [0, 2],
      [2, 3],
      [3, 4],
      [4, 5],
      [5, 2],
      [5, 6],
    ],
  },
  {
    id: "ursa-minor",
    name: "小熊归途",
    subtitle: "北极锚点",
    motto: "哪怕雾气弥漫，也有一颗星不动。",
    spots: [
      { x: 0.76, y: 0.1, s: 28 },
      { x: 0.58, y: 0.2, s: 23 },
      { x: 0.44, y: 0.38, s: 23 },
      { x: 0.42, y: 0.62, s: 24 },
      { x: 0.2, y: 0.56, s: 25 },
      { x: 0.16, y: 0.84, s: 26 },
      { x: 0.38, y: 0.88, s: 27 },
    ],
    edges: [
      [0, 1],
      [1, 2],
      [2, 3],
      [3, 4],
      [4, 5],
      [5, 6],
      [6, 3],
    ],
  },
  {
    id: "orion",
    name: "猎户守望",
    subtitle: "冬夜灯塔",
    motto: "站在群山尽头，为你留一盏灯。",
    spots: [
      { x: 0.24, y: 0.12, s: 28 },
      { x: 0.72, y: 0.18, s: 25 },
      { x: 0.35, y: 0.52, s: 24 },
      { x: 0.5, y: 0.48, s: 26 },
      { x: 0.65, y: 0.44, s: 24 },
      { x: 0.26, y: 0.88, s: 25 },
      { x: 0.76, y: 0.84, s: 28 },
    ],
    edges: [
      [0, 1],
      [0, 2],
      [1, 4],
      [2, 3],
      [3, 4],
      [2, 5],
      [4, 6],
      [5, 6],
    ],
  },
];

const CONSTELLATION_ID_SET = new Set(NIGHT_CONSTELLATIONS.map((c) => c.id));

export function pickInitialConstellationIndex(
  visits: number,
  unlockedIds: readonly string[],
  lastConstellationId?: string,
): number {
  if (visits <= 1 && unlockedIds.length === 0) return 0;
  // 优先展示尚未点亮的星象，其次按夜航次数平滑轮换并避开上次同一星象
  const unlockedSet = new Set(unlockedIds);
  const firstUnseen = NIGHT_CONSTELLATIONS.findIndex(
    (item) => !unlockedSet.has(item.id) && item.id !== lastConstellationId,
  );
  if (firstUnseen >= 0) return firstUnseen;
  const candidate = Math.max(0, visits - 1) % NIGHT_CONSTELLATIONS.length;
  if (NIGHT_CONSTELLATIONS[candidate].id === lastConstellationId) {
    return (candidate + 1) % NIGHT_CONSTELLATIONS.length;
  }
  return candidate;
}

export function pickNextConstellationIndex(
  currentIndex: number,
  unlockedIds: readonly string[],
): number {
  const count = NIGHT_CONSTELLATIONS.length;
  const unlockedSet = new Set(unlockedIds);
  for (let offset = 1; offset < count; offset++) {
    const idx = (currentIndex + offset) % count;
    if (!unlockedSet.has(NIGHT_CONSTELLATIONS[idx].id)) return idx;
  }
  return (currentIndex + 1) % count;
}

/* -------------------------------------------------------------------------- */
/*  真实月相天文计算                                                            */
/* -------------------------------------------------------------------------- */

const SYNODIC_MONTH_DAYS = 29.530588853;
const NEW_MOON_EPOCH_MS = Date.UTC(2024, 3, 8, 18, 21);

export const MOON_PHASE_NAMES = [
  "新月",
  "娥眉月",
  "上弦月",
  "盈凸月",
  "满月",
  "亏凸月",
  "下弦月",
  "残月",
] as const;

const MOON_PHASE_NOTES = [
  "晦朔之间，群星最亮",
  "弯月如钩，挂住晚风",
  "月色初盈，步履从容",
  "清辉渐满，好事将近",
  "月满清辉，宜许长愿",
  "银辉微敛，夜色温柔",
  "半轮明月，照见归途",
  "残月淡悬，黎明不远",
] as const;

export interface MoonPhaseInfo {
  index: number;
  name: string;
  ageDays: number;
  /** 真实照度 0..1 */
  illumination: number;
  /** 用于大气光晕的保底亮度，确保新月也有银蓝地照微光 */
  haloStrength: number;
  note: string;
}

export function getMoonPhaseInfo(date: Date = new Date()): MoonPhaseInfo {
  const localNoon = new Date(
    date.getFullYear(),
    date.getMonth(),
    date.getDate(),
    12,
  );
  const rawCycles =
    (localNoon.getTime() - NEW_MOON_EPOCH_MS) /
    (SYNODIC_MONTH_DAYS * 86400000);
  const cycleProgress = rawCycles - Math.floor(rawCycles);
  const index = Math.round(cycleProgress * 8) % 8;
  const ageDays = Math.round(cycleProgress * SYNODIC_MONTH_DAYS * 10) / 10;
  const illumination = Math.max(
    0,
    Math.min(1, (1 - Math.cos(cycleProgress * Math.PI * 2)) / 2),
  );
  const haloStrength = Math.max(0.24, illumination);

  return {
    index,
    name: MOON_PHASE_NAMES[index],
    ageDays,
    illumination,
    haloStrength,
    note: MOON_PHASE_NOTES[index],
  };
}

/* -------------------------------------------------------------------------- */
/*  课程流星池与猫头鹰语境台词                                                  */
/* -------------------------------------------------------------------------- */

export function buildMeteorCoursePool(
  courseNames: readonly string[],
  rng?: () => number,
): string[] {
  const seen = new Set<string>();
  const unique: string[] = [];
  for (const raw of courseNames) {
    const trimmed = raw.trim();
    if (!trimmed) continue;
    const key = trimmed.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(trimmed.slice(0, 12));
  }
  if (rng && unique.length > 1) {
    for (let i = unique.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      const tmp = unique[i];
      unique[i] = unique[j];
      unique[j] = tmp;
    }
  }
  return unique;
}

export const WISH_METEOR_LINES = [
  "流星听见了，悄悄帮你记下。",
  "一颗金色星愿，正沿着银河寄出。",
  "晚风会替你把这句心愿带去明天。",
  "抬头许下的光，总会在某天回响。",
] as const;

export function getOwlDialogue(options: {
  hour: number;
  visits: number;
  owlPathUnlocked: boolean;
  constellationName: string;
  todayCourseCount?: number;
  sleepy?: boolean;
}): readonly string[] {
  const {
    hour,
    visits,
    owlPathUnlocked,
    constellationName,
    todayCourseCount,
    sleepy,
  } = options;
  const lateNight = hour >= 0 && hour < 5;
  const isSleepy = Boolean(sleepy);
  const heavyDay =
    typeof todayCourseCount === "number" &&
    Number.isFinite(todayCourseCount) &&
    todayCourseCount >= 4;
  const safeCount = heavyDay ? Math.floor(todayCourseCount) : 0;

  if (!owlPathUnlocked) {
    return [
      isSleepy
        ? "哈欠……夜深了还没睡呀，我一边打盹一边陪你看一会儿星星吧。"
        : lateNight
          ? "嘘——夜深了还没睡呀，先陪我看一会儿星星吧。"
          : "嘘——夜还长，先陪我看一会儿星星吧。",
      `你刚刚点亮的「${constellationName}」，我都记着呢。`,
      heavyDay
        ? `听说今天排了 ${safeCount} 节课，辛苦啦，在这里把疲惫放一放吧。`
        : "风里有翻书的声音，你听见了吗？",
      isSleepy
        ? "这么晚别硬撑啦，想去一个更安静暖和的地方歇歇吗？"
        : "想不想去一个更安静的地方？",
      "那就跟紧我，小径就在前面。",
    ];
  }

  return [
    isSleepy
      ? `哈欠……第 ${visits} 次夜航了，这么晚还在守夜呀，记得早点睡哦。`
      : lateNight
        ? `第 ${visits} 次夜航了，这么晚也要记得早点歇歇呀。`
        : `老朋友，欢迎第 ${visits} 次回到这片夜空。`,
    `今晚的「${constellationName}」很亮，试着按 1-1-5-5-6-6-5 轻点星点会有惊喜哦。`,
    heavyDay
      ? `今天上了 ${safeCount} 节课一定累坏了，doordoor农场的灯正为你留着。`
      : isSleepy
        ? "我眼皮都快打架了，不过doordoor农场的灯还亮着，随时可以过去坐坐。"
        : "doordoor农场的灯还为你留着，随时都可以再过去坐坐。",
    "要现在出发吗？跟紧我的翅膀，走吧。",
  ];
}

/* -------------------------------------------------------------------------- */
/*  隐藏旋律与夜空秘境徽章                                                      */
/* -------------------------------------------------------------------------- */

export type SecretBadgeId =
  | "star-musician"
  | "blood-moon"
  | "wish-keeper"
  | "whale-watcher";

export const SECRET_BADGES: Record<
  SecretBadgeId,
  { label: string; hint: string }
> = {
  "star-musician": {
    label: "星弦乐师",
    hint: "用点亮的星点弹奏一段隐藏旋律",
  },
  "blood-moon": {
    label: "血月守望",
    hint: "连续轻点七次夜空中的月亮",
  },
  "wish-keeper": {
    label: "星愿信使",
    hint: "向夜空放飞一颗星愿胶囊",
  },
  "whale-watcher": {
    label: "星海见鲸",
    hint: "与巡游银河的大肥鱼打声招呼",
  },
};

const SECRET_BADGE_ID_SET = new Set<SecretBadgeId>(
  Object.keys(SECRET_BADGES) as SecretBadgeId[],
);

export type SecretMelodyId = "twinkle" | "maj7";

export interface SecretMelodyMatch {
  id: SecretMelodyId;
  title: string;
  badgeId: SecretBadgeId;
  message: string;
}

const TWINKLE_PATTERN: readonly number[] = [0, 0, 4, 4, 5, 5, 4];
const MAJ7_PATTERN: readonly number[] = [0, 2, 4, 6];

function endsWithPattern(
  notes: readonly number[],
  pattern: readonly number[],
): boolean {
  const offset = notes.length - pattern.length;
  if (offset < 0) return false;
  for (let i = 0; i < pattern.length; i++) {
    if (notes[offset + i] !== pattern[i]) return false;
  }
  return true;
}

export function matchSecretMelody(
  recentNotes: readonly number[],
): SecretMelodyMatch | null {
  if (endsWithPattern(recentNotes, TWINKLE_PATTERN)) {
    return {
      id: "twinkle",
      title: "小星星 · 银河流星雨",
      badgeId: "star-musician",
      message: "✦ 小星星旋律唤来了银河流星雨！解锁「星弦乐师」",
    };
  }
  if (endsWithPattern(recentNotes, MAJ7_PATTERN)) {
    return {
      id: "maj7",
      title: "星弦大七和弦 · 流萤旋舞",
      badgeId: "star-musician",
      message: "✦ 星弦大七和弦唤起流萤旋舞！解锁「星弦乐师」",
    };
  }
  return null;
}

/* -------------------------------------------------------------------------- */
/*  夜航志与收藏星笺持久化（纯解析 + AsyncStorage 封装）                        */
/* -------------------------------------------------------------------------- */

export interface NightSkyChronicle {
  visits: number;
  totalStarsCollected: number;
  unlockedConstellations: string[];
  owlPathUnlocked: boolean;
  lastConstellationId?: string;
  secretBadges: SecretBadgeId[];
  wishesSent: number;
  meteorsTapped: number;
}

export const DEFAULT_NIGHT_CHRONICLE: NightSkyChronicle = {
  visits: 0,
  totalStarsCollected: 0,
  unlockedConstellations: [],
  owlPathUnlocked: false,
  secretBadges: [],
  wishesSent: 0,
  meteorsTapped: 0,
};

function toNonNegativeInt(value: unknown): number {
  const num = Number(value);
  return Number.isFinite(num) && num > 0 ? Math.floor(num) : 0;
}

function createEmptyChronicle(visits = 0): NightSkyChronicle {
  return {
    visits,
    totalStarsCollected: 0,
    unlockedConstellations: [],
    owlPathUnlocked: false,
    secretBadges: [],
    wishesSent: 0,
    meteorsTapped: 0,
  };
}

export function parseNightChronicle(
  rawChronicle: string | null,
  rawLegacyVisits?: string | null,
): NightSkyChronicle {
  const legacyVisits = toNonNegativeInt(rawLegacyVisits);
  if (!rawChronicle) {
    return createEmptyChronicle(legacyVisits);
  }
  try {
    const parsed = JSON.parse(rawChronicle) as Partial<NightSkyChronicle>;
    if (!parsed || typeof parsed !== "object") {
      return createEmptyChronicle(legacyVisits);
    }
    const visits = Math.max(legacyVisits, toNonNegativeInt(parsed.visits));
    const totalStarsCollected = toNonNegativeInt(parsed.totalStarsCollected);
    const unlockedConstellations = Array.isArray(parsed.unlockedConstellations)
      ? Array.from(
          new Set(
            parsed.unlockedConstellations.filter(
              (id): id is string =>
                typeof id === "string" && CONSTELLATION_ID_SET.has(id),
            ),
          ),
        )
      : [];
    const lastConstellationId =
      typeof parsed.lastConstellationId === "string" &&
      CONSTELLATION_ID_SET.has(parsed.lastConstellationId)
        ? parsed.lastConstellationId
        : undefined;
    const secretBadges = Array.isArray(parsed.secretBadges)
      ? Array.from(
          new Set(
            parsed.secretBadges.filter(
              (id): id is SecretBadgeId =>
                typeof id === "string" &&
                SECRET_BADGE_ID_SET.has(id as SecretBadgeId),
            ),
          ),
        )
      : [];

    return {
      visits,
      totalStarsCollected,
      unlockedConstellations,
      owlPathUnlocked: Boolean(parsed.owlPathUnlocked),
      lastConstellationId,
      secretBadges,
      wishesSent: toNonNegativeInt(parsed.wishesSent),
      meteorsTapped: toNonNegativeInt(parsed.meteorsTapped),
    };
  } catch {
    return createEmptyChronicle(legacyVisits);
  }
}

export function recordNightVisit(
  chronicle: NightSkyChronicle,
): NightSkyChronicle {
  return {
    ...chronicle,
    visits: Math.max(0, chronicle.visits) + 1,
  };
}

export function unlockConstellationInChronicle(
  chronicle: NightSkyChronicle,
  constellationId: string,
  starsEarned = TOTAL_STARS,
): NightSkyChronicle {
  const nextUnlocked =
    CONSTELLATION_ID_SET.has(constellationId) &&
    !chronicle.unlockedConstellations.includes(constellationId)
      ? [...chronicle.unlockedConstellations, constellationId]
      : chronicle.unlockedConstellations;
  return {
    ...chronicle,
    totalStarsCollected:
      chronicle.totalStarsCollected + toNonNegativeInt(starsEarned),
    unlockedConstellations: nextUnlocked,
    lastConstellationId: CONSTELLATION_ID_SET.has(constellationId)
      ? constellationId
      : chronicle.lastConstellationId,
  };
}

export function unlockSecretBadgeInChronicle(
  chronicle: NightSkyChronicle,
  badgeId: SecretBadgeId,
): NightSkyChronicle {
  if (!SECRET_BADGE_ID_SET.has(badgeId)) return chronicle;
  const existing = Array.isArray(chronicle.secretBadges)
    ? chronicle.secretBadges
    : [];
  if (existing.includes(badgeId)) return chronicle;
  return {
    ...chronicle,
    secretBadges: [...existing, badgeId],
  };
}

export async function loadAndBumpNightChronicle(): Promise<NightSkyChronicle> {
  try {
    const [rawChronicle, rawLegacy] = await Promise.all([
      AsyncStorage.getItem(NIGHT_CHRONICLE_KEY),
      AsyncStorage.getItem(LEGACY_VISIT_KEY),
    ]);
    const current = parseNightChronicle(rawChronicle, rawLegacy);
    const next = recordNightVisit(current);
    await saveNightChronicle(next);
    return next;
  } catch {
    return createEmptyChronicle(1);
  }
}

export async function saveNightChronicle(
  chronicle: NightSkyChronicle,
): Promise<void> {
  try {
    await Promise.all([
      AsyncStorage.setItem(NIGHT_CHRONICLE_KEY, JSON.stringify(chronicle)),
      AsyncStorage.setItem(LEGACY_VISIT_KEY, String(chronicle.visits)),
    ]);
  } catch {
    // 持久化失败不影响星空正常体验
  }
}

/* -------------------------------------------------------------------------- */
/*  收藏星笺存储                                                               */
/* -------------------------------------------------------------------------- */

const VALID_CATEGORIES = new Set(["book", "film", "anime", "essay", "online"]);

export function parseFavoriteQuotes(raw: string | null): NightSkyQuote[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    const seen = new Set<string>();
    const out: NightSkyQuote[] = [];
    for (const item of parsed) {
      if (!item || typeof item !== "object") continue;
      const q = item as Partial<NightSkyQuote>;
      if (
        typeof q.id !== "string" ||
        !q.id.trim() ||
        typeof q.text !== "string" ||
        !q.text.trim() ||
        typeof q.work !== "string" ||
        typeof q.category !== "string" ||
        !VALID_CATEGORIES.has(q.category)
      ) {
        continue;
      }
      if (seen.has(q.id)) continue;
      seen.add(q.id);
      out.push({
        id: q.id,
        text: q.text,
        work: q.work,
        author: typeof q.author === "string" && q.author.trim() ? q.author.trim() : undefined,
        category: q.category as NightSkyQuote["category"],
      });
      if (out.length >= MAX_FAVORITE_QUOTES) break;
    }
    return out;
  } catch {
    return [];
  }
}

export function toggleFavoriteQuote(
  list: readonly NightSkyQuote[],
  quote: NightSkyQuote,
): { next: NightSkyQuote[]; saved: boolean } {
  const exists = list.some((item) => item.id === quote.id);
  if (exists) {
    return {
      next: list.filter((item) => item.id !== quote.id),
      saved: false,
    };
  }
  return {
    next: [quote, ...list].slice(0, MAX_FAVORITE_QUOTES),
    saved: true,
  };
}

export async function loadFavoriteQuotes(): Promise<NightSkyQuote[]> {
  try {
    const raw = await AsyncStorage.getItem(NIGHT_FAVORITES_KEY);
    return parseFavoriteQuotes(raw);
  } catch {
    return [];
  }
}

export async function saveFavoriteQuotes(
  quotes: readonly NightSkyQuote[],
): Promise<void> {
  try {
    await AsyncStorage.setItem(
      NIGHT_FAVORITES_KEY,
      JSON.stringify(quotes.slice(0, MAX_FAVORITE_QUOTES)),
    );
  } catch {
    // 忽略本地写入异常
  }
}

/* -------------------------------------------------------------------------- */
/*  星愿胶囊（有界持久化 + 隔夜回响）                                           */
/* -------------------------------------------------------------------------- */

export interface NightSkyWish {
  id: string;
  text: string;
  createdAt: number;
  constellationName: string;
  echoedAt?: number;
}

let wishIdSeq = 0;

function clampWishText(raw: string, maxLen = MAX_WISH_TEXT_LENGTH): string {
  const cleaned = raw.replace(/[\r\n]+/g, " ").trim();
  if (!cleaned) return "";
  if (cleaned.length <= maxLen) return cleaned;
  let sliced = cleaned.slice(0, maxLen);
  const lastCode = sliced.charCodeAt(sliced.length - 1);
  if (lastCode >= 0xd800 && lastCode <= 0xdbff) {
    sliced = sliced.slice(0, -1);
  }
  return sliced.trim();
}

export function parseNightWishes(raw: string | null): NightSkyWish[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    const seen = new Set<string>();
    const out: NightSkyWish[] = [];
    for (const item of parsed) {
      if (!item || typeof item !== "object") continue;
      const w = item as Partial<NightSkyWish>;
      if (typeof w.id !== "string") continue;
      const id = w.id.trim().slice(0, 48);
      if (!id || seen.has(id)) continue;
      if (typeof w.text !== "string") continue;
      const text = clampWishText(w.text);
      if (!text) continue;
      if (
        typeof w.createdAt !== "number" ||
        !Number.isFinite(w.createdAt) ||
        w.createdAt <= 0
      ) {
        continue;
      }
      if (typeof w.constellationName !== "string") continue;
      const constellationName = w.constellationName.trim().slice(0, 24);
      if (!constellationName) continue;
      const echoedAt =
        typeof w.echoedAt === "number" &&
        Number.isFinite(w.echoedAt) &&
        w.echoedAt > 0
          ? w.echoedAt
          : undefined;
      seen.add(id);
      const entry: NightSkyWish = {
        id,
        text,
        createdAt: w.createdAt,
        constellationName,
      };
      if (echoedAt !== undefined) {
        entry.echoedAt = echoedAt;
      }
      out.push(entry);
      if (out.length >= MAX_NIGHT_WISHES) break;
    }
    return out;
  } catch {
    return [];
  }
}

export function addNightWish(
  list: readonly NightSkyWish[],
  text: string,
  constellationName: string,
  now: number = Date.now(),
): NightSkyWish[] {
  const cleaned = clampWishText(text);
  if (!cleaned) {
    return list.slice(0, MAX_NIGHT_WISHES);
  }
  const safeNow = Number.isFinite(now) && now > 0 ? Math.floor(now) : Date.now();
  const safeConstellation = constellationName.trim().slice(0, 24) || "夜空";
  wishIdSeq = (wishIdSeq + 1) % 1_000_000;
  const entry: NightSkyWish = {
    id: `wish-${safeNow}-${wishIdSeq}`,
    text: cleaned,
    createdAt: safeNow,
    constellationName: safeConstellation,
  };
  return [entry, ...list].slice(0, MAX_NIGHT_WISHES);
}

export function pickEchoWish(
  list: readonly NightSkyWish[],
  now: number = Date.now(),
  minAgeMs: number = DEFAULT_ECHO_MIN_AGE_MS,
): NightSkyWish | null {
  const safeNow = Number.isFinite(now) ? now : Date.now();
  const safeMinAge =
    Number.isFinite(minAgeMs) && minAgeMs >= 0
      ? minAgeMs
      : DEFAULT_ECHO_MIN_AGE_MS;
  let oldest: NightSkyWish | null = null;
  for (let i = 0; i < list.length; i++) {
    const wish = list[i];
    if (wish.echoedAt !== undefined) continue;
    if (!Number.isFinite(wish.createdAt)) continue;
    if (safeNow - wish.createdAt < safeMinAge) continue;
    if (!oldest || wish.createdAt < oldest.createdAt) {
      oldest = wish;
    }
  }
  return oldest;
}

export function markWishEchoed(
  list: readonly NightSkyWish[],
  id: string,
  now: number = Date.now(),
): NightSkyWish[] {
  const safeNow = Number.isFinite(now) && now > 0 ? Math.floor(now) : Date.now();
  const bounded = list.slice(0, MAX_NIGHT_WISHES);
  let changed = false;
  const next = bounded.map((item) => {
    if (item.id !== id) return item;
    changed = true;
    return { ...item, echoedAt: safeNow };
  });
  return changed ? next : bounded;
}

export async function loadNightWishes(): Promise<NightSkyWish[]> {
  try {
    const raw = await AsyncStorage.getItem(NIGHT_WISHES_KEY);
    return parseNightWishes(raw);
  } catch {
    return [];
  }
}

export async function saveNightWishes(
  wishes: readonly NightSkyWish[],
): Promise<void> {
  try {
    await AsyncStorage.setItem(
      NIGHT_WISHES_KEY,
      JSON.stringify(wishes.slice(0, MAX_NIGHT_WISHES)),
    );
  } catch {
    // 忽略本地写入异常
  }
}

/* -------------------------------------------------------------------------- */
/*  天象日历与深夜守夜                                                          */
/* -------------------------------------------------------------------------- */

export interface CelestialEvent {
  id:
    | "perseids"
    | "geminids"
    | "summer-solstice"
    | "winter-solstice"
    | "new-year"
    | "full-moon"
    | "late-watch"
    | "calm";
  badge: string;
  subtitle: string;
  meteorRateBoost: boolean;
  sleepyOwl: boolean;
  auroraPrimary: string;
  auroraSecondary: string;
}

export function getCelestialEvent(
  date: Date = new Date(),
  moon?: MoonPhaseInfo,
): CelestialEvent {
  const month = date.getMonth() + 1;
  const day = date.getDate();
  const hour = date.getHours();
  const sleepyOwl = hour >= 2 && hour < 5;
  const resolvedMoon = moon ?? getMoonPhaseInfo(date);

  if (month === 8 && day >= 11 && day <= 15) {
    return {
      id: "perseids",
      badge: "英仙座流星雨",
      subtitle: "夏夜流星极盛，许下的愿更容易被听见",
      meteorRateBoost: true,
      sleepyOwl,
      auroraPrimary: "#34D399",
      auroraSecondary: "#38BDF8",
    };
  }
  if (month === 12 && day >= 12 && day <= 16) {
    return {
      id: "geminids",
      badge: "双子座流星雨",
      subtitle: "冬夜银河如瀑，冷空气让星光格外清澈",
      meteorRateBoost: true,
      sleepyOwl,
      auroraPrimary: "#60A5FA",
      auroraSecondary: "#FBBF24",
    };
  }
  if ((month === 12 && day === 31) || (month === 1 && day === 1)) {
    return {
      id: "new-year",
      badge: "跨年星夜",
      subtitle: "旧年微光落幕，新岁星河正启程",
      meteorRateBoost: true,
      sleepyOwl,
      auroraPrimary: "#FBBF24",
      auroraSecondary: "#C084FC",
    };
  }
  if (month === 6 && day >= 20 && day <= 22) {
    return {
      id: "summer-solstice",
      badge: "夏至短夜",
      subtitle: "一年中最短的夜，夏风正吹过银河",
      meteorRateBoost: false,
      sleepyOwl,
      auroraPrimary: "#2DD4BF",
      auroraSecondary: "#60A5FA",
    };
  }
  if (month === 12 && day >= 20 && day <= 23) {
    return {
      id: "winter-solstice",
      badge: "冬至长夜",
      subtitle: "最长的黑夜里，每一盏星灯都更温暖",
      meteorRateBoost: false,
      sleepyOwl,
      auroraPrimary: "#818CF8",
      auroraSecondary: "#38BDF8",
    };
  }
  if (resolvedMoon.index === 4) {
    return {
      id: "full-moon",
      badge: "满月之夜",
      subtitle: "清辉倾洒doordoor农场，今夜宜许长愿",
      meteorRateBoost: false,
      sleepyOwl,
      auroraPrimary: "#E0F2FE",
      auroraSecondary: "#A78BFA",
    };
  }
  if (sleepyOwl) {
    return {
      id: "late-watch",
      badge: "深夜守夜",
      subtitle: "凌晨微凉，猫头鹰陪你再看一会儿星星",
      meteorRateBoost: false,
      sleepyOwl: true,
      auroraPrimary: "#6366F1",
      auroraSecondary: "#38BDF8",
    };
  }
  return {
    id: "calm",
    badge: "",
    subtitle: "夜风轻缓，群星静静闪烁",
    meteorRateBoost: false,
    sleepyOwl: false,
    auroraPrimary: "#38BDF8",
    auroraSecondary: "#C084FC",
  };
}

/* -------------------------------------------------------------------------- */
/*  课程流星拍碎彩蛋、课表压力共情、星海鲸语                                     */
/* -------------------------------------------------------------------------- */

const COURSE_METEOR_POP_TEMPLATES: readonly ((
  course: string,
  constellation: string,
) => string)[] = [
  (c, k) => `《${c}》已暂时寄存在${k}，今晚先不复习啦！`,
  (c, k) => `接住一颗《${c}》流星！烦恼已折成纸鹤飞向${k}。`,
  (c, k) => `《${c}》被收进${k}星光保管箱，明早再还给你～`,
  (c, k) => `咻——《${c}》化作星尘洒在${k}，学分 +1（心理版）！`,
  (c, k) => `${k}替你接住了《${c}》，现在只需要安心吹晚风。`,
];

let meteorPopCursor = 0;

export function formatCourseMeteorPop(
  courseName: string,
  constellationName: string,
  seed?: number,
): string {
  const cleanCourse =
    courseName.replace(/^[《<「]+|[》>」]+$/g, "").trim().slice(0, 16) ||
    "今日课程";
  const cleanConstellation = constellationName.trim().slice(0, 16) || "星空";
  let idx: number;
  if (typeof seed === "number" && Number.isFinite(seed)) {
    idx = Math.abs(Math.floor(seed)) % COURSE_METEOR_POP_TEMPLATES.length;
  } else {
    idx = meteorPopCursor % COURSE_METEOR_POP_TEMPLATES.length;
    meteorPopCursor = (meteorPopCursor + 1) % COURSE_METEOR_POP_TEMPLATES.length;
  }
  return COURSE_METEOR_POP_TEMPLATES[idx](cleanCourse, cleanConstellation);
}

export function getScheduleMoodNote(todayCourseCount?: number): string | null {
  if (
    todayCourseCount === undefined ||
    !Number.isFinite(todayCourseCount) ||
    todayCourseCount < 0
  ) {
    return null;
  }
  const count = Math.floor(todayCourseCount);
  if (count >= 4) {
    return `今天排了 ${count} 节课辛苦啦，把疲惫交给晚风与星光吧。`;
  }
  if (count === 0) {
    return "今天没有课，适合慢悠悠地数星星发一会儿呆。";
  }
  return null;
}

const WHALE_SKY_TSUN_TEMPLATES: readonly ((
  whaleName: string,
  userName: string,
  constellation: string,
) => string)[] = [
  (w, u, c) =>
    `哼，${w}才不是特地穿过「${c}」来看${u}的，只是这片星海刚好顺路。`,
  (w, u, c) =>
    `喂，${u}！盯「${c}」看那么久不准揉眼睛，${w}勉强帮你挡会儿风。`,
  (w, u, c) =>
    `别误会，${w}路过「${c}」怀里抱着的小星星才不是给${u}摘的……好吧，借你看三秒！`,
  (w, u, c) =>
    `夜深了${u}还不去睡，${w}只好在「${c}」旁边多巡逻一圈咯。`,
  (w, u, c) =>
    `切，谁要听${u}夸可爱了！${w}绕着「${c}」游一圈，尾巴溅起的星屑都比这亮。`,
  (w, u, c) =>
    `哼哼，如果${u}今晚把「${c}」点亮了，${w}就破例再游回来一次。`,
  (w, u, c) =>
    `${u}少在「${c}」底下发呆啦，银河风这么凉，${w}把星光抱紧点分你一点就是了。`,
];

const WHALE_SKY_HAPPY_TEMPLATES: readonly ((
  whaleName: string,
  userName: string,
  constellation: string,
) => string)[] = [
  (w, u, c) =>
    `${w}顺着银河游过「${c}」，把怀里最亮的小星星轻轻捧给${u}～`,
  (w, u, c) =>
    `晚上好呀${u}！${w}今晚在「${c}」旁边数到了好多温柔的星屑。`,
  (w, u, c) =>
    `哇，被${u}发现啦！${w}正带着「${c}」的晚风一起慢悠悠飘呢。`,
  (w, u, c) =>
    `如果学习累了的话，${u}就靠着「${c}」歇一会儿，${w}在星海陪着你。`,
  (w, u, c) =>
    `${w}偷偷把「${c}」的一抹星辉藏进了裙摆，见到${u}再拿出来亮一亮✦`,
  (w, u, c) =>
    `沿着「${c}」游了一整圈，${w}还是觉得遇到${u}的时候星星眨眼最开心啦！`,
  (w, u, c) =>
    `晚风软软的，${w}和「${c}」都会一直守着认真发光的${u}哦。`,
];

export function buildWhaleSkyLine(options: {
  whaleName?: string;
  userName?: string;
  tsundere?: number;
  constellationName: string;
  tapCount?: number;
}): { text: string; mood: "happy" | "tsun" } {
  const whaleName = options.whaleName?.trim().slice(0, 12) || "大肥鱼";
  const userName = options.userName?.trim().slice(0, 12) || "你";
  const constellation = options.constellationName.trim().slice(0, 16) || "星空";
  const tsundere =
    typeof options.tsundere === "number" && Number.isFinite(options.tsundere)
      ? options.tsundere
      : 50;
  const mood: "happy" | "tsun" = tsundere >= 60 ? "tsun" : "happy";
  const bank =
    mood === "tsun" ? WHALE_SKY_TSUN_TEMPLATES : WHALE_SKY_HAPPY_TEMPLATES;
  const idx =
    typeof options.tapCount === "number" && Number.isFinite(options.tapCount)
      ? Math.abs(Math.floor(options.tapCount)) % bank.length
      : 0;

  return {
    mood,
    text: bank[idx](whaleName, userName, constellation),
  };
}

/* -------------------------------------------------------------------------- */
/*  星空 ↔ doordoor农场 双向赐福桥                                              */
/* -------------------------------------------------------------------------- */

export interface StarDewBlessing {
  constellationId: string;
  constellationName: string;
  constellationSubtitle: string;
  createdAt: number;
  dateIso: string;
}

function formatLocalDateIso(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function parseStarDewBlessing(raw: string | null): StarDewBlessing | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<StarDewBlessing>;
    if (!parsed || typeof parsed !== "object") return null;
    const constellationId =
      typeof parsed.constellationId === "string"
        ? parsed.constellationId.trim().slice(0, 32)
        : "";
    const constellationName =
      typeof parsed.constellationName === "string"
        ? parsed.constellationName.trim().slice(0, 24)
        : "";
    const constellationSubtitle =
      typeof parsed.constellationSubtitle === "string"
        ? parsed.constellationSubtitle.trim().slice(0, 24)
        : "";
    const dateIso =
      typeof parsed.dateIso === "string" ? parsed.dateIso.trim().slice(0, 16) : "";
    if (
      !constellationId ||
      !constellationName ||
      !constellationSubtitle ||
      !dateIso ||
      typeof parsed.createdAt !== "number" ||
      !Number.isFinite(parsed.createdAt) ||
      parsed.createdAt <= 0
    ) {
      return null;
    }
    return {
      constellationId,
      constellationName,
      constellationSubtitle,
      createdAt: parsed.createdAt,
      dateIso,
    };
  } catch {
    return null;
  }
}

export async function writeStarDewBlessing(
  constellation: Pick<ConstellationDef, "id" | "name" | "subtitle">,
  now: Date = new Date(),
): Promise<void> {
  const payload: StarDewBlessing = {
    constellationId: constellation.id,
    constellationName: constellation.name,
    constellationSubtitle: constellation.subtitle,
    createdAt: now.getTime(),
    dateIso: formatLocalDateIso(now),
  };
  try {
    await AsyncStorage.setItem(STAR_DEW_BLESSING_KEY, JSON.stringify(payload));
  } catch {
    // 忽略本地写入异常
  }
}

export async function consumeStarDewBlessing(
  now: Date = new Date(),
): Promise<{ blessing: StarDewBlessing; canWaterToday: boolean } | null> {
  try {
    const [rawBlessing, lastWaterDate] = await Promise.all([
      AsyncStorage.getItem(STAR_DEW_BLESSING_KEY),
      AsyncStorage.getItem(STAR_DEW_COOLDOWN_KEY),
    ]);
    if (!rawBlessing) return null;
    await AsyncStorage.removeItem(STAR_DEW_BLESSING_KEY);
    const blessing = parseStarDewBlessing(rawBlessing);
    if (!blessing) return null;
    const todayIso = formatLocalDateIso(now);
    const canWaterToday = lastWaterDate !== todayIso;
    if (canWaterToday) {
      await AsyncStorage.setItem(STAR_DEW_COOLDOWN_KEY, todayIso);
    }
    return { blessing, canWaterToday };
  } catch {
    return null;
  }
}

export function buildStarDewTownEvent(
  blessing: StarDewBlessing,
  at: number,
): {
  id: string;
  title: string;
  detail: string;
  kind: "rumor";
  knownBy: ("gu" | "door" | "xiaoba" | "yujie")[];
  hotspot: "plaza";
  createdAt: number;
  expiresAt: number;
} {
  const safeAt = Number.isFinite(at) ? at : Date.now();
  return {
    id: `stardew-blessing-${blessing.constellationId}-${safeAt}`,
    title: `星露垂落 · ${blessing.constellationName}`,
    detail: `夜空中刚刚点亮了「${blessing.constellationName}」（${blessing.constellationSubtitle}），一层清凉的星露轻轻落在了doordoor农场的田埂上。`,
    kind: "rumor",
    knownBy: ["gu", "door", "xiaoba", "yujie"],
    hotspot: "plaza",
    createdAt: safeAt,
    expiresAt: safeAt + STAR_DEW_EVENT_TTL_MS,
  };
}
