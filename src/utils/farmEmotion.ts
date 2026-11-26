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
  | 'angry';

/** 对应像素情绪动作图集的离散视觉动作档位 */
export type FarmEmotionPose = 'neutral' | 'happy' | 'sad' | 'angry' | 'shy' | 'sleepy';

export type FarmEmotionActorId =
  | ResidentId
  | 'hero'
  | 'huboqi'
  | 'xushuiyin'
  | 'huangbingqi'
  | 'dark_xushuiyin'
  | 'dafeiyu';

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
  huboqi: { joy: 64, energy: 66, calm: 76, social: 42 },
  xushuiyin: { joy: 76, energy: 82, calm: 60, social: 84 },
  huangbingqi: { joy: 80, energy: 82, calm: 74, social: 86 },
  dark_xushuiyin: { joy: 46, energy: 92, calm: 24, social: 32 },
  dafeiyu: { joy: 76, energy: 76, calm: 72, social: 76 },
};

export function farmEmotionBaseline(actorId: FarmEmotionActorId) {
  return FARM_EMOTION_BASELINES[actorId] ?? FARM_EMOTION_BASELINES.door;
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
  actorId: FarmEmotionActorId,
  fallbackLegacyMood?: string,
  now = Date.now(),
): FarmEmotionState {
  const base = farmEmotionBaseline(actorId);
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    const seeded = createInitialFarmEmotion(actorId, now);
    if (fallbackLegacyMood === '开心') return { ...seeded, joy: Math.max(seeded.joy, 82), social: Math.max(seeded.social, 74) };
    if (fallbackLegacyMood === '生气') return { ...seeded, joy: 28, calm: 22 };
    if (fallbackLegacyMood === '不悦') return { ...seeded, joy: 42, calm: 36 };
    if (fallbackLegacyMood === '缓和') return { ...seeded, calm: Math.max(seeded.calm, 66) };
    return seeded;
  }
  const o = raw as Record<string, unknown>;
  const num = (v: unknown, fb: number) => (typeof v === 'number' && Number.isFinite(v) ? clamp100(v) : fb);
  return {
    joy: num(o.joy, base.joy),
    energy: num(o.energy, base.energy),
    calm: num(o.calm, base.calm),
    social: num(o.social, base.social),
    reason: typeof o.reason === 'string' ? o.reason.trim().slice(0, 40) : '',
    updatedAt: typeof o.updatedAt === 'number' && Number.isFinite(o.updatedAt) && o.updatedAt > 0
      ? Math.round(o.updatedAt)
      : now,
  };
}

/** 按真实流逝时间平滑回归到人物性格基线（半衰期约 3.2 小时） */
export function decayFarmEmotion(
  current: FarmEmotionState,
  actorId: FarmEmotionActorId,
  now: number,
): FarmEmotionState {
  const elapsedHours = Math.min(Math.max((now - current.updatedAt) / HOUR, 0), 24 * 14);
  if (elapsedHours < 0.02) return current;
  const base = farmEmotionBaseline(actorId);
  const retain = Math.pow(0.5, elapsedHours / HALF_LIFE_HOURS);
  return {
    joy: clamp100(base.joy + (current.joy - base.joy) * retain),
    energy: clamp100(base.energy + (current.energy - base.energy) * retain),
    calm: clamp100(base.calm + (current.calm - base.calm) * retain),
    social: clamp100(base.social + (current.social - base.social) * retain),
    reason: elapsedHours > 5 ? '' : current.reason,
    updatedAt: now,
  };
}

/** 施加一次情绪数值变动（聊天/送礼/天气/睡眠/随机事件/互聊均走此入口） */
export function applyFarmEmotionDelta(
  current: FarmEmotionState,
  actorId: FarmEmotionActorId,
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
  };
}

/** 将 4 维数值映射为主导情绪、动画动作档位、配色及兼容标签 */
export function describeFarmEmotion(state: FarmEmotionState): FarmEmotionDescriptor {
  const { joy, energy, calm, social } = state;

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

/** 聊天反应对应的数值情绪变动 */
export function socialReactionEmotionDelta(
  reaction: 'neutral' | 'warm' | 'teasing' | 'insult' | 'apology',
  interested: boolean,
): FarmEmotionDelta {
  switch (reaction) {
    case 'warm':
      return { joy: 12, calm: 6, social: 8, energy: 3, reason: '被温暖夸奖与感谢' };
    case 'teasing':
      return { joy: -3, calm: -6, social: 0, reason: '被轻轻打趣调侃了一下' };
    case 'insult':
      return { joy: -18, calm: -24, social: -12, reason: '被凶了一句有点不爽' };
    case 'apology':
      return { joy: 10, calm: 18, social: 6, reason: '收到真诚道歉，心里缓和了' };
    default:
      return interested
        ? { joy: 6, social: 6, energy: 2, reason: '聊到了感兴趣的话题' }
        : { joy: 2, social: 3, reason: '和客人轻松聊了几句' };
  }
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
