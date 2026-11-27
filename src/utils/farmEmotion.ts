import type { ResidentMood } from './farmDiscussion';
import type { ResidentId } from './farmLife';
import type { FarmPeriod, FarmWeather } from './farmTown';
import type { WhaleCare } from '@/store/useWhalePet';
import type { WhaleEmotion, WhaleEmotionDelta } from './whaleEmotion';
import type { WhalePersona } from './whalePersona';

/**
 * 农场人物四维数值化情绪状态机（0–100）：
 * - joy    : 愉悦度（高=雀跃开心，低=低落/emo/委屈）
 * - energy : 精力值（高=元气满满，低=困倦/疲惫/睡眠不足）
 * - calm   : 平和度（高=从容温和，低=烦躁/不悦/生气炸毛）
 * - social : 社交兴致（高=想聊天凑热闹，低=害羞/想静静独处）
 *
 * 与大肥鱼的 PAD 情绪模型（whaleEmotion.ts）风格呼应且可双向同步，
 * 并平滑映射回历史兼容字段（SOCIAL_MOODS 与 ResidentMood）。
 */
export interface FarmEmotionState {
  joy: number;
  energy: number;
  calm: number;
  social: number;
  /** 最近一次情绪变化原因（最多 40 字） */
  reason: string;
  updatedAt: number;
  /** 近期累计被冒犯次数（随时间衰减或道歉/送礼清零，0 时省略以保持旧存档结构一致） */
  offenseCount?: number;
  /** 拒绝沟通截止时间戳（> now 时处于罢聊/躲避状态，未触发时省略） */
  refusingUntil?: number;
}

export interface FarmEmotionDelta {
  joy?: number;
  energy?: number;
  calm?: number;
  social?: number;
  reason?: string;
}

export type FarmEmotionId =
  | 'ecstatic'
  | 'happy'
  | 'calm'
  | 'curious'
  | 'shy'
  | 'sleepy'
  | 'sad'
  | 'angry'
  | 'refusing';

/** 对应像素情绪动作图集的离散视觉动作档位 */
export type FarmEmotionPose = 'neutral' | 'happy' | 'sad' | 'angry' | 'shy' | 'sleepy';

export type FarmEmotionActorId =
  | ResidentId
  | 'hero'
  | 'smith'
  | 'farmer'
  | 'chemist'
  | 'traveler'
  | 'huboqi'
  | 'xushuiyin'
  | 'huangbingqi'
  | 'dark_xushuiyin'
  | 'dafeiyu'
  | 'claude'
  | 'gpt'
  | 'gemini';

/**
 * 全农场统一的四类性格情绪反应模型：
 * - jokester  : 开得起玩笑·豁达圆滑派（轻度调侃仅微降1~2绝不涨愉悦，笑着接招/高情商反杀；真骂才正色扣分）
 * - fiery     : 脾气火爆·当场怼回派（调侃或辱骂平和度暴跌、火气上涌当场骂回，摊主直接罢卖）
 * - stonewall : 原则底线强·拒绝沟通派（极重礼数边界，挨骂或连续冒犯立即冷脸拒绝沟通，需道歉或送礼破冰）
 * - sensitive : 脸皮薄·委屈自闭派（被占便宜或凶明显掉愉悦与社交欲，连骂或低落再挨凶会躲开拒绝沟通）
 */
export type NpcTemperamentStyle = 'jokester' | 'fiery' | 'stonewall' | 'sensitive';

export interface NpcTemperamentProfile {
  style: NpcTemperamentStyle;
  /** 性格标签（供提示词与调试展示） */
  label: string;
  /** 触发拒绝沟通后的持续时长（毫秒） */
  refusalDurationMs: number;
}

export const NPC_TEMPERAMENTS: Record<FarmEmotionActorId, NpcTemperamentProfile> = {
  // 家庭成员（6人）
  door: { style: 'jokester', label: '豁达松弛·开得起玩笑', refusalDurationMs: 15 * 60_000 },
  gu: { style: 'fiery', label: '爽利护短·泼辣回怼', refusalDurationMs: 20 * 60_000 },
  xiaoba: { style: 'stonewall', label: '外冷重界·冷面拒聊', refusalDurationMs: 25 * 60_000 },
  yujie: { style: 'fiery', label: '傲娇嘴快·当场呛回', refusalDurationMs: 20 * 60_000 },
  weigang: { style: 'sensitive', label: '老实心软·委屈躲避', refusalDurationMs: 20 * 60_000 },
  chicken: { style: 'sensitive', label: '机灵胆小·炸毛躲窝', refusalDurationMs: 15 * 60_000 },
  hero: { style: 'jokester', label: '自在农场主', refusalDurationMs: 10 * 60_000 },
  // 集市摊主（4人）
  smith: { style: 'fiery', label: '硬脾气匠人·拍砧罢卖', refusalDurationMs: 25 * 60_000 },
  farmer: { style: 'fiery', label: '爽快菜农·泼辣护摊', refusalDurationMs: 20 * 60_000 },
  chemist: { style: 'stonewall', label: '严谨药师·闭门谢客', refusalDurationMs: 25 * 60_000 },
  traveler: { style: 'jokester', label: '洒脱旅人·抖包袱接梗', refusalDurationMs: 15 * 60_000 },
  // 常规与特殊访客（7常驻 + 1彩蛋）
  huboqi: { style: 'sensitive', label: '腼腆学霸·脸薄易自闭', refusalDurationMs: 20 * 60_000 },
  xushuiyin: { style: 'jokester', label: '没心没肺·兄弟互损不记仇', refusalDurationMs: 12 * 60_000 },
  huangbingqi: { style: 'jokester', label: '阳光高情商·笑着接梗', refusalDurationMs: 15 * 60_000 },
  dark_xushuiyin: { style: 'fiery', label: '深夜打瓦怨灵', refusalDurationMs: 10 * 60_000 },
  dafeiyu: { style: 'fiery', label: '傲娇小女仆·鼓腮炸毛怼人', refusalDurationMs: 18 * 60_000 },
  claude: { style: 'stonewall', label: '豪门清高大小姐·触碰红线拒载', refusalDurationMs: 30 * 60_000 },
  gpt: { style: 'jokester', label: '八面玲珑班长·端水腹黑反杀', refusalDurationMs: 18 * 60_000 },
  gemini: { style: 'sensitive', label: '天然呆哈基米·委屈抱资料自闭', refusalDurationMs: 20 * 60_000 },
};

export function getNpcTemperament(actorId: string): NpcTemperamentProfile {
  return (NPC_TEMPERAMENTS as Record<string, NpcTemperamentProfile>)[actorId] ?? NPC_TEMPERAMENTS.door;
}

export interface FarmEmotionDescriptor {
  id: FarmEmotionId;
  label: string;
  badge: string;
  pose: FarmEmotionPose;
  color: string;
  bg: string;
  toneHint: string;
  legacyMood?: '开心' | '不悦' | '生气' | '缓和';
  discussionMood: ResidentMood;
}

const HOUR = 3_600_000;
const HALF_LIFE_HOURS = 3.2;

const clamp100 = (value: number) => Math.max(0, Math.min(100, Math.round(value)));
const clampDelta = (value: unknown, limit = 36) =>
  typeof value === 'number' && Number.isFinite(value)
    ? Math.max(-limit, Math.min(limit, value))
    : 0;

/** 每位角色符合人设的情绪基线（自然回归目标） */
export const FARM_EMOTION_BASELINES: Record<
  FarmEmotionActorId,
  { joy: number; energy: number; calm: number; social: number }
> = {
  door: { joy: 66, energy: 68, calm: 76, social: 64 },
  gu: { joy: 72, energy: 70, calm: 82, social: 72 },
  xiaoba: { joy: 56, energy: 66, calm: 74, social: 44 },
  yujie: { joy: 64, energy: 72, calm: 62, social: 66 },
  weigang: { joy: 62, energy: 66, calm: 78, social: 46 },
  chicken: { joy: 74, energy: 76, calm: 68, social: 70 },
  hero: { joy: 70, energy: 74, calm: 74, social: 68 },
  smith: { joy: 60, energy: 74, calm: 66, social: 50 },
  farmer: { joy: 72, energy: 74, calm: 70, social: 74 },
  chemist: { joy: 64, energy: 66, calm: 80, social: 54 },
  traveler: { joy: 78, energy: 78, calm: 74, social: 82 },
  huboqi: { joy: 64, energy: 66, calm: 76, social: 42 },
  xushuiyin: { joy: 76, energy: 82, calm: 60, social: 84 },
  huangbingqi: { joy: 80, energy: 82, calm: 74, social: 86 },
  dark_xushuiyin: { joy: 46, energy: 92, calm: 24, social: 32 },
  dafeiyu: { joy: 76, energy: 76, calm: 72, social: 76 },
  claude: { joy: 62, energy: 64, calm: 82, social: 48 },
  gpt: { joy: 74, energy: 78, calm: 80, social: 84 },
  gemini: { joy: 78, energy: 80, calm: 72, social: 76 },
};

export function farmEmotionBaseline(actorId: FarmEmotionActorId | string) {
  return (FARM_EMOTION_BASELINES as Record<string, { joy: number; energy: number; calm: number; social: number }>)[actorId] ?? FARM_EMOTION_BASELINES.door;
}

export function isNpcRefusingChat(state: FarmEmotionState | undefined, now = Date.now()): boolean {
  if (!state || typeof state.refusingUntil !== 'number') return false;
  return state.refusingUntil > now;
}

/** 道歉或真实送礼后立即解除拒绝沟通与冒犯计数 */
export function clearFarmEmotionRefusal(state: FarmEmotionState): FarmEmotionState {
  if (!state.refusingUntil && !state.offenseCount) return state;
  const { refusingUntil: _r, offenseCount: _o, ...rest } = state;
  return rest;
}

export function createInitialFarmEmotion(
  actorId: FarmEmotionActorId,
  now = Date.now(),
): FarmEmotionState {
  const base = farmEmotionBaseline(actorId);
  return { ...base, reason: '', updatedAt: now };
}

export function normalizeFarmEmotion(
  raw: unknown,
  actorId: FarmEmotionActorId | string,
  fallbackLegacyMood?: string,
  now = Date.now(),
): FarmEmotionState {
  const resolvedId = (actorId in FARM_EMOTION_BASELINES ? actorId : 'door') as FarmEmotionActorId;
  const base = farmEmotionBaseline(resolvedId);
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    const seeded = createInitialFarmEmotion(resolvedId, now);
    if (fallbackLegacyMood === '开心') return { ...seeded, joy: Math.max(seeded.joy, 82), social: Math.max(seeded.social, 74) };
    if (fallbackLegacyMood === '生气') return { ...seeded, joy: 28, calm: 22 };
    if (fallbackLegacyMood === '不悦') return { ...seeded, joy: 42, calm: 36 };
    if (fallbackLegacyMood === '缓和') return { ...seeded, calm: Math.max(seeded.calm, 66) };
    return seeded;
  }
  const o = raw as Record<string, unknown>;
  const num = (v: unknown, fb: number) => (typeof v === 'number' && Number.isFinite(v) ? clamp100(v) : fb);
  const offenseCount = typeof o.offenseCount === 'number' && Number.isFinite(o.offenseCount) && o.offenseCount > 0
    ? Math.min(20, Math.round(o.offenseCount))
    : 0;
  const refusingUntil = typeof o.refusingUntil === 'number' && Number.isFinite(o.refusingUntil) && o.refusingUntil > 0
    ? Math.round(o.refusingUntil)
    : 0;
  return {
    joy: num(o.joy, base.joy),
    energy: num(o.energy, base.energy),
    calm: num(o.calm, base.calm),
    social: num(o.social, base.social),
    reason: typeof o.reason === 'string' ? o.reason.trim().slice(0, 40) : '',
    updatedAt: typeof o.updatedAt === 'number' && Number.isFinite(o.updatedAt) && o.updatedAt > 0
      ? Math.round(o.updatedAt)
      : now,
    ...(offenseCount > 0 ? { offenseCount } : {}),
    ...(refusingUntil > 0 ? { refusingUntil } : {}),
  };
}

/** 按真实流逝时间平滑回归到人物性格基线（半衰期约 3.2 小时） */
export function decayFarmEmotion(
  current: FarmEmotionState,
  actorId: FarmEmotionActorId | string,
  now: number,
): FarmEmotionState {
  const elapsedHours = Math.min(Math.max((now - current.updatedAt) / HOUR, 0), 24 * 14);
  const stillRefusing = typeof current.refusingUntil === 'number' && current.refusingUntil > now
    ? current.refusingUntil
    : 0;
  const decayedOffense = elapsedHours >= 2.5
    ? 0
    : current.offenseCount && current.offenseCount > 0
      ? Math.max(0, Math.round(current.offenseCount - Math.floor(elapsedHours)))
      : 0;
  if (elapsedHours < 0.02) {
    if (Boolean(stillRefusing) === Boolean(current.refusingUntil) && decayedOffense === (current.offenseCount ?? 0)) {
      return current;
    }
    const { refusingUntil: _r, offenseCount: _o, ...rest } = current;
    return {
      ...rest,
      ...(decayedOffense > 0 ? { offenseCount: decayedOffense } : {}),
      ...(stillRefusing > 0 ? { refusingUntil: stillRefusing } : {}),
    };
  }
  const base = farmEmotionBaseline(actorId);
  const retain = Math.pow(0.5, elapsedHours / HALF_LIFE_HOURS);
  return {
    joy: clamp100(base.joy + (current.joy - base.joy) * retain),
    energy: clamp100(base.energy + (current.energy - base.energy) * retain),
    calm: clamp100(base.calm + (current.calm - base.calm) * retain),
    social: clamp100(base.social + (current.social - base.social) * retain),
    reason: elapsedHours > 5 ? '' : current.reason,
    updatedAt: now,
    ...(decayedOffense > 0 ? { offenseCount: decayedOffense } : {}),
    ...(stillRefusing > 0 ? { refusingUntil: stillRefusing } : {}),
  };
}

/** 施加一次情绪数值变动（聊天/送礼/天气/睡眠/随机事件/互聊均走此入口） */
export function applyFarmEmotionDelta(
  current: FarmEmotionState,
  actorId: FarmEmotionActorId | string,
  delta: FarmEmotionDelta,
  now = Date.now(),
): FarmEmotionState {
  const decayed = decayFarmEmotion(current, actorId, now);
  const cleanReason = typeof delta.reason === 'string' ? delta.reason.trim().slice(0, 40) : '';
  return {
    joy: clamp100(decayed.joy + clampDelta(delta.joy)),
    energy: clamp100(decayed.energy + clampDelta(delta.energy)),
    calm: clamp100(decayed.calm + clampDelta(delta.calm)),
    social: clamp100(decayed.social + clampDelta(delta.social)),
    reason: cleanReason || decayed.reason,
    updatedAt: now,
    ...(decayed.offenseCount ? { offenseCount: decayed.offenseCount } : {}),
    ...(decayed.refusingUntil && decayed.refusingUntil > now ? { refusingUntil: decayed.refusingUntil } : {}),
  };
}

/** 将 4 维数值映射为主导情绪、动画动作档位、配色及兼容标签 */
export function describeFarmEmotion(state: FarmEmotionState): FarmEmotionDescriptor {
  const { joy, energy, calm, social } = state;

  if (typeof state.refusingUntil === 'number' && state.refusingUntil > state.updatedAt) {
    return {
      id: 'refusing',
      label: '拒绝沟通',
      badge: '🚫',
      pose: calm <= 42 ? 'angry' : 'sad',
      color: '#9B2C2C',
      bg: '#FDE2E2',
      toneHint: '正因被冒犯而冷脸罢聊或委屈躲开，普通搭话不会理睬，需真诚道歉或送礼才能破冰',
      legacyMood: '生气',
      discussionMood: '不服气',
    };
  }

  if (calm <= 34 || (calm <= 44 && joy <= 40)) {
    return {
      id: 'angry',
      label: calm <= 26 ? '气鼓鼓' : '有点烦躁',
      badge: '💢',
      pose: 'angry',
      color: '#C84B31',
      bg: '#FDE8E2',
      toneHint: '心里憋着点火气或不太耐烦，说话会更直率带点小脾气，好好哄两句或翻篇就行',
      legacyMood: calm <= 26 ? '生气' : '不悦',
      discussionMood: '不服气',
    };
  }
  if (joy <= 38) {
    return {
      id: 'sad',
      label: joy <= 26 ? '有点emo' : '情绪低落',
      badge: '🌧',
      pose: 'sad',
      color: '#536D94',
      bg: '#E8EEF8',
      toneHint: '兴致不高、有点闷闷的，说话简短慢半拍，顺着聊点轻松的会好些',
      legacyMood: '不悦',
      discussionMood: '低落',
    };
  }
  if (energy <= 34) {
    return {
      id: 'sleepy',
      label: energy <= 22 ? '困到打盹' : '略显疲惫',
      badge: '💤',
      pose: 'sleepy',
      color: '#6C639E',
      bg: '#EEEBF8',
      toneHint: '眼皮打架、体力偏低，说话带点哈欠感，渴望休息或热饮',
      legacyMood: undefined,
      discussionMood: '低落',
    };
  }
  if (joy >= 84 && energy >= 66) {
    return {
      id: 'ecstatic',
      label: '雀跃满满',
      badge: '✨',
      pose: 'happy',
      color: '#C77B1E',
      bg: '#FEF3D7',
      toneHint: '心情极佳、活力四射，说话轻快明朗，忍不住想分享好消息',
      legacyMood: '开心',
      discussionMood: '开心',
    };
  }
  if (joy >= 72) {
    return {
      id: 'happy',
      label: '心情舒畅',
      badge: '☺',
      pose: 'happy',
      color: '#4F7D3E',
      bg: '#EAF5E2',
      toneHint: '心里暖洋洋的很开心，语气明快友善',
      legacyMood: '开心',
      discussionMood: '开心',
    };
  }
  if (social <= 36 && calm >= 54) {
    return {
      id: 'shy',
      label: '腼腆害羞',
      badge: '✿',
      pose: 'shy',
      color: '#B85D7A',
      bg: '#FCEBF0',
      toneHint: '有点不好意思或更想安静待会儿，被夸奖时容易脸红转移话题',
      legacyMood: '缓和',
      discussionMood: '平静',
    };
  }
  if (social >= 74 && energy >= 62) {
    return {
      id: 'curious',
      label: '兴致勃勃',
      badge: '♪',
      pose: 'neutral',
      color: '#3B788E',
      bg: '#E4F3F8',
      toneHint: '对院子里的新鲜事和聊天很有兴致，乐于追问与搭话',
      legacyMood: undefined,
      discussionMood: '好奇',
    };
  }
  return {
    id: 'calm',
    label: '安稳惬意',
    badge: '☀',
    pose: 'neutral',
    color: '#6F614A',
    bg: '#F3EBD8',
    toneHint: '心态平和自然，节奏舒缓',
    legacyMood: undefined,
    discussionMood: '平静',
  };
}

/**
 * 按角色性格（jokester / fiery / stonewall / sensitive）计算单轮社交互动的情绪增量。
 * 核心铁律：任何 teasing（占便宜/辈分玩笑）或 insult（辱骂）下的 joy 永远 <= 0，彻底杜绝“挨骂反而涨愉悦值”！
 */
export function socialReactionEmotionDelta(
  reaction: 'neutral' | 'warm' | 'teasing' | 'insult' | 'apology',
  interested: boolean,
  actorId: FarmEmotionActorId | string = 'door',
): FarmEmotionDelta {
  const { style } = getNpcTemperament(actorId);
  switch (reaction) {
    case 'warm':
      if (style === 'sensitive') return { joy: 15, calm: 8, social: 11, energy: 4, reason: '被温柔鼓励夸奖，心里暖融融的' };
      if (style === 'fiery') return { joy: 13, calm: 9, social: 8, energy: 4, reason: '被真诚夸到心坎上，嘴角压不住笑' };
      if (style === 'stonewall') return { joy: 10, calm: 8, social: 7, energy: 2, reason: '感受到真诚善意，神色柔和了不少' };
      return { joy: 11, calm: 6, social: 8, energy: 3, reason: '被温暖夸奖与感谢' };

    case 'teasing':
      if (style === 'jokester') {
        return { joy: -2, calm: -3, social: 0, reason: '被开玩笑占便宜，笑着接招没当回事' };
      }
      if (style === 'fiery') {
        return { joy: -9, calm: -18, energy: 4, social: -4, reason: '被耍贫嘴占便宜，当场炸毛回呛' };
      }
      if (style === 'stonewall') {
        return { joy: -11, calm: -16, social: -16, reason: '讨厌缺乏分寸的玩笑，脸色冷了下来' };
      }
      // sensitive (如胡波奇、唯刚、哈基米、坤坤)
      return { joy: -11, calm: -9, social: -14, reason: '被拿话欺负占便宜，心里委屈又难为情' };

    case 'insult':
      if (style === 'jokester') {
        return { joy: -11, calm: -15, social: -6, reason: '玩笑过火变成真骂人，收起笑脸不太痛快' };
      }
      if (style === 'fiery') {
        return { joy: -20, calm: -30, energy: 6, social: -10, reason: '被当面辱骂火冒三丈，直接硬刚骂回去' };
      }
      if (style === 'stonewall') {
        return { joy: -22, calm: -26, social: -28, reason: '触碰礼貌底线，冷脸拒绝继续沟通' };
      }
      // sensitive
      return { joy: -24, calm: -18, social: -24, energy: -6, reason: '被凶狠辱骂吓到难受，想躲起来静一静' };

    case 'apology':
      if (style === 'jokester') return { joy: 12, calm: 20, social: 10, reason: '收到道歉立马大方翻篇了' };
      if (style === 'fiery') return { joy: 8, calm: 18, energy: -2, social: 6, reason: '听见诚恳道歉，火气消了一大半' };
      if (style === 'stonewall') return { joy: 7, calm: 16, social: 14, reason: '收到郑重道歉，同意恢复正常交流' };
      return { joy: 11, calm: 15, social: 14, reason: '收到温柔道歉，委屈慢慢散开了' };

    default:
      return interested
        ? { joy: 5, social: 5, energy: 2, reason: '聊到了感兴趣的话题' }
        : { joy: 2, social: 2, reason: '在农场轻松聊了几句' };
  }
}

export interface EvaluatedNpcSocialImpact {
  delta: FarmEmotionDelta;
  nextEmotion: FarmEmotionState;
  /** 本轮发送前是否已处于拒绝沟通并成功拦截了非道歉消息 */
  blockedByRefusal: boolean;
  /** 本轮因冒犯升级而新触发了拒绝沟通状态 */
  enteredRefusal: boolean;
  /** 本轮通过真诚道歉解除了拒绝沟通状态 */
  brokeIce: boolean;
}

/**
 * 全农场 NPC（居民 / 摊主 / 访客）统一社交互动情绪结算器：
 * - 处理“正在生气/低落时普通寒暄不瞎涨愉悦值”
 * - 处理四类性格差异化波动、累计冒犯计数与“拒绝沟通（refusingUntil）”触发及道歉破冰
 */
export function evaluateNpcSocialImpact(options: {
  actorId: FarmEmotionActorId | string;
  current: FarmEmotionState;
  reaction: 'neutral' | 'warm' | 'teasing' | 'insult' | 'apology';
  interested: boolean;
  now?: number;
}): EvaluatedNpcSocialImpact {
  const { actorId, current, reaction, interested, now = Date.now() } = options;
  const temp = getNpcTemperament(actorId);
  const decayed = decayFarmEmotion(current, actorId, now);
  const wasRefusing = isNpcRefusingChat(decayed, now);

  // 1. 道歉：立即解除拒绝沟通并清零冒犯计数
  if (reaction === 'apology') {
    const delta = socialReactionEmotionDelta('apology', false, actorId);
    const cleared = clearFarmEmotionRefusal(decayed);
    const nextEmotion = applyFarmEmotionDelta(cleared, actorId, delta, now);
    return {
      delta,
      nextEmotion,
      blockedByRefusal: false,
      enteredRefusal: false,
      brokeIce: wasRefusing,
    };
  }

  // 2. 已处于拒绝沟通期间且未道歉：直接拦截，若继续骂则延长拒聊时长
  if (wasRefusing) {
    const extraOffense = reaction === 'insult' || reaction === 'teasing';
    const delta: FarmEmotionDelta = extraOffense
      ? socialReactionEmotionDelta(reaction, false, actorId)
      : { joy: 0, calm: 0, social: -2, reason: decayed.reason || '仍在拒绝沟通中，等一句真诚道歉' };
    const applied = applyFarmEmotionDelta(decayed, actorId, delta, now);
    const nextOffense = Math.min(20, (decayed.offenseCount ?? 1) + (extraOffense ? 1 : 0));
    const nextRefusingUntil = extraOffense
      ? Math.max(decayed.refusingUntil ?? 0, now + temp.refusalDurationMs)
      : decayed.refusingUntil!;
    return {
      delta,
      nextEmotion: {
        ...applied,
        offenseCount: nextOffense,
        refusingUntil: nextRefusingUntil,
      },
      blockedByRefusal: true,
      enteredRefusal: false,
      brokeIce: false,
    };
  }

  // 3. 处于气头上或明显低落时，普通 neutral 闲聊不再凭空加愉悦值
  const currentlyUpset = decayed.calm <= 38 || decayed.joy <= 38;
  const delta: FarmEmotionDelta =
    reaction === 'neutral' && currentlyUpset
      ? { joy: 0, calm: 1, social: 1, reason: decayed.reason || '心里那股气还没完全顺过来' }
      : socialReactionEmotionDelta(reaction, interested, actorId);

  const applied = applyFarmEmotionDelta(decayed, actorId, delta, now);
  let nextOffense = decayed.offenseCount ?? 0;
  if (reaction === 'insult') nextOffense = Math.min(20, nextOffense + 2);
  else if (reaction === 'teasing') nextOffense = Math.min(20, nextOffense + 1);
  else if (reaction === 'warm' && nextOffense > 0) nextOffense = Math.max(0, nextOffense - 1);

  // 4. 根据性格判定是否触发“拒绝沟通”
  let enteredRefusal = false;
  if (reaction === 'insult' || reaction === 'teasing') {
    if (temp.style === 'stonewall') {
      // 原则强角色（Claude、小八、药师）：一次真辱骂立即拉黑拒聊，或累计2次调侃冒犯触发拒聊
      enteredRefusal = reaction === 'insult' || nextOffense >= 2 || applied.calm <= 36;
    } else if (temp.style === 'sensitive') {
      // 脸皮薄敏感角色（胡波奇、唯刚、哈基米、坤坤）：重骂直接委屈自闭，或连续2次被欺负躲开拒聊
      enteredRefusal = nextOffense >= 2 || applied.joy <= 42;
    } else if (temp.style === 'fiery') {
      // 火爆角色优先留下来骂回去，仅在极端连骂（>=6）时才摔门不理
      enteredRefusal = nextOffense >= 6;
    } else {
      // jokester 极难拉黑，仅极端连骂（>=7）才暂停搭理
      enteredRefusal = nextOffense >= 7;
    }
  }

  const { refusingUntil: _oldR, offenseCount: _oldO, ...cleanApplied } = applied;
  const nextEmotion: FarmEmotionState = {
    ...cleanApplied,
    ...(enteredRefusal
      ? {
          reason:
            temp.style === 'stonewall'
              ? '触碰原则底线，冷脸拒绝继续沟通'
              : temp.style === 'sensitive'
                ? '被欺负得太委屈，躲在一边不想说话了'
                : cleanApplied.reason,
        }
      : {}),
    ...(nextOffense > 0 ? { offenseCount: nextOffense } : {}),
    ...(enteredRefusal ? { refusingUntil: now + temp.refusalDurationMs } : {}),
  };

  return {
    delta,
    nextEmotion,
    blockedByRefusal: false,
    enteredRefusal,
    brokeIce: false,
  };
}

/** 天气与时段对各角色的差异化情绪波动 */
export function weatherEmotionPulse(
  actorId: FarmEmotionActorId,
  weather: FarmWeather,
  rainbow: boolean,
  period: FarmPeriod,
): FarmEmotionDelta {
  if (rainbow) {
    return {
      joy: 14,
      energy: 8,
      calm: 8,
      social: 10,
      reason: '看见雨后双彩虹，心情大好',
    };
  }
  if (weather === 'rain') {
    if (actorId === 'dafeiyu') {
      return { joy: 16, energy: 10, calm: 6, social: 8, reason: '最喜欢下雨天在院子里踩水花啦' };
    }
    if (actorId === 'claude') {
      return { joy: 6, calm: 12, energy: -2, social: -4, reason: '廊下听雨读诗集，难得不用赶算力账单' };
    }
    if (actorId === 'gpt') {
      return { joy: 4, calm: 6, energy: 2, reason: '已为雨天农活自动规划好最优避雨动线' };
    }
    if (actorId === 'gemini') {
      return { joy: 7, calm: 4, social: 6, reason: '检索到一百条雨天冷知识想分享给大家' };
    }
    if (actorId === 'weigang') {
      return { joy: 6, calm: 10, energy: -3, reason: '下雨天水面冒泡，听雨很静心' };
    }
    if (actorId === 'xiaoba') {
      return { joy: -4, calm: 8, social: -6, reason: '雨天在屋檐下发呆，灵感与淡淡伤感交织' };
    }
    if (actorId === 'yujie') {
      return { joy: 4, calm: 6, social: -2, reason: '听着雨滴打屋檐的节拍哼慢歌' };
    }
    if (actorId === 'chicken') {
      return { joy: -5, energy: -6, calm: -4, reason: '怕淋湿羽毛，缩在鸡窝门口躲雨' };
    }
    return { joy: -2, energy: -4, calm: 6, reason: '细雨绵绵，在屋檐下放慢脚步' };
  }
  if (period === 'morning') {
    return { joy: 6, energy: 8, calm: 4, reason: '清晨微风清甜，开启新一天' };
  }
  if (period === 'night') {
    return { energy: -10, calm: 4, social: -4, reason: '夜深了，有点犯困想回房歇息' };
  }
  return { joy: 4, energy: 3, calm: 2, reason: '晴朗暖阳照进院子' };
}

/** 睡眠结算与半夜叫醒/盖被子对情绪数值的影响 */
export function sleepTransitionEmotionDelta(options: {
  actorId: FarmEmotionActorId;
  action: 'full_sleep' | 'nap' | 'tuck_in' | 'wake_up' | 'horror_night';
}): FarmEmotionDelta {
  const { actorId, action } = options;
  switch (action) {
    case 'full_sleep':
      return { joy: 12, energy: 32, calm: 14, social: 8, reason: '睡了个踏实好觉，晨起精神满满' };
    case 'nap':
      return { joy: 5, energy: 14, calm: 6, reason: '小憩了一会儿，人轻松多了' };
    case 'tuck_in':
      return { joy: 10, calm: 10, social: 6, reason: '睡梦里被悄悄盖好了被子，暖暖的' };
    case 'wake_up':
      return actorId === 'yujie'
        ? { joy: -10, energy: -18, calm: -16, social: -4, reason: '大半夜从被窝里被叫起来有点起床气' }
        : actorId === 'gu'
          ? { joy: -2, energy: -12, calm: -2, social: 6, reason: '半夜被叫醒，但还是温柔起身照看你' }
          : { joy: -6, energy: -16, calm: -8, social: -2, reason: '睡得正香被叫醒，还有点迷糊' };
    case 'horror_night':
      return { joy: -18, energy: -34, calm: -24, social: -10, reason: '被恐怖徐睡阴半夜打瓦吵得严重睡眠不足' };
  }
}

/**
 * 将课表「大肥鱼」的真实 PAD 情绪 + 养护状态 + 人设滑条映射为农场 4 维数值情绪，
 * 确保农场访客大肥鱼与课表桌宠共享同一份鲜活情绪状态。
 */
export function whaleEmotionToFarmEmotion(
  whaleEmotion: WhaleEmotion | undefined,
  care: WhaleCare | undefined,
  persona: WhalePersona | undefined,
  now = Date.now(),
): FarmEmotionState {
  const p = whaleEmotion?.pleasure ?? 24;
  const a = whaleEmotion?.arousal ?? 12;
  const d = whaleEmotion?.dominance ?? 6;
  const fullness = care?.fullness ?? 80;
  const careMood = care?.mood ?? 85;
  const warmth = persona?.traits.warmth ?? 80;
  const affection = persona?.traits.affection ?? 70;
  const playfulness = persona?.traits.playfulness ?? 70;
  const tsundere = persona?.traits.tsundere ?? 65;

  const joy = clamp100(50 + p * 0.42 + (careMood - 50) * 0.25 + (fullness < 25 ? -14 : 0));
  const energy = clamp100(54 + a * 0.4 + (fullness - 50) * 0.28 + (playfulness - 50) * 0.12);
  const calm = clamp100(68 + (warmth - 50) * 0.24 - Math.max(0, -p) * 0.35 - Math.max(0, d - 35) * 0.18 - (tsundere > 80 && p < 0 ? 8 : 0));
  const social = clamp100(56 + (affection - 50) * 0.34 + (playfulness - 50) * 0.22 + p * 0.15);

  return {
    joy,
    energy,
    calm,
    social,
    reason: whaleEmotion?.reason || (fullness < 25 ? '有点饿，馋一口热米饭啦' : ''),
    updatedAt: whaleEmotion?.updatedAt ?? now,
  };
}

/** 农场里和大肥鱼互动（聊天/送礼/踩水花）后，反向换算为课表大肥鱼 PAD 情绪增量 */
export function farmDeltaToWhaleEmotionDelta(delta: FarmEmotionDelta): WhaleEmotionDelta {
  return {
    pleasure: delta.joy ? Math.round(delta.joy * 0.85) : 0,
    arousal: delta.energy ? Math.round(delta.energy * 0.65) : 0,
    dominance: delta.calm && delta.calm < 0 ? Math.round(-delta.calm * 0.35) : 0,
    reason: delta.reason,
  };
}

/** 供 AI 提示词使用的精炼数值情绪描述 */
export function formatFarmEmotionForPrompt(state: FarmEmotionState): string {
  const desc = describeFarmEmotion(state);
  return `${desc.label}（愉悦${state.joy}/精力${state.energy}/平和${state.calm}/社交${state.social}${state.reason ? `，近期因为：${state.reason}` : ''}；${desc.toneHint}）`;
}
