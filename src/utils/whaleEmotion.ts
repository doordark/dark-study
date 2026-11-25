import type { WhalePersona } from "@/utils/whalePersona";

/**
 * 大肥鱼动态情绪状态机（PAD 三维情绪模型）与羁绊成长体系。
 *
 * - pleasure (-100..100)：愉悦度（开心 / 委屈难过）
 * - arousal  (-100..100)：活跃度（元气兴奋 / 困倦平静）
 * - dominance(-100..100)：掌控与傲娇感（得意爱逗 / 乖巧撒娇）
 *
 * 情绪会按真实流逝时间平滑回归由人设滑条决定的基线，
 * 既能让好心情/小委屈自然延续几轮，又不会永久卡死在极端状态。
 */
export interface WhaleEmotion {
  pleasure: number;
  arousal: number;
  dominance: number;
  /** 最近一次显著情绪变化的简短原因（最多 48 字） */
  reason: string;
  updatedAt: number;
}

export interface WhaleEmotionDelta {
  pleasure?: number;
  arousal?: number;
  dominance?: number;
  reason?: string;
}

export interface WhaleBondProfile {
  /** 累计互动天数（按自然日去重计数） */
  daysActive: number;
  /** 最近一次计入活跃的自然日（YYYY-MM-DD） */
  lastActiveDay: string;
  /** 累计有效聊天轮数 */
  chatTurns: number;
  /** 累计互动次数（摸头 / 喂饭 / 抛球 / 桌面互动） */
  interactions: number;
  /** 羁绊经验分（由天数、聊天、互动、养护 bond 共同驱动） */
  xp: number;
}

export interface WhaleBondStage {
  level: 1 | 2 | 3 | 4 | 5;
  title: string;
  minXp: number;
  nextXp: number | null;
  progress: number;
  guidance: string;
}

const HOUR = 3_600_000;
const clampSigned = (value: number) =>
  Math.max(-100, Math.min(100, Math.round(value * 10) / 10));

export function localDayKey(now = Date.now()): string {
  const d = new Date(now);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function emotionBaseline(persona?: WhalePersona): {
  pleasure: number;
  arousal: number;
  dominance: number;
} {
  if (!persona) return { pleasure: 24, arousal: 12, dominance: 6 };
  const t = persona.traits;
  return {
    pleasure: clampSigned(12 + (t.warmth - 50) * 0.28 + (t.affection - 50) * 0.16),
    arousal: clampSigned(4 + (t.playfulness - 50) * 0.45),
    dominance: clampSigned((t.tsundere - 50) * 0.45 - (t.affection - 50) * 0.15),
  };
}

export function createInitialEmotion(persona?: WhalePersona, now = Date.now()): WhaleEmotion {
  const base = emotionBaseline(persona);
  return { ...base, reason: "", updatedAt: now };
}

export function normalizeWhaleEmotion(raw?: Partial<WhaleEmotion>, persona?: WhalePersona): WhaleEmotion {
  const base = emotionBaseline(persona);
  const num = (value: unknown, fallback: number) =>
    typeof value === "number" && Number.isFinite(value) ? clampSigned(value) : fallback;
  return {
    pleasure: num(raw?.pleasure, base.pleasure),
    arousal: num(raw?.arousal, base.arousal),
    dominance: num(raw?.dominance, base.dominance),
    reason: typeof raw?.reason === "string" ? raw.reason.trim().slice(0, 48) : "",
    updatedAt: typeof raw?.updatedAt === "number" && Number.isFinite(raw.updatedAt) && raw.updatedAt > 0
      ? Math.round(raw.updatedAt)
      : Date.now(),
  };
}

/**
 * 按真实流逝时间将情绪平滑衰减回基线（半衰期约 3.5 小时），
 * 超过 6 小时后清除过时的短期原因说明。
 */
export function decayWhaleEmotion(
  current: WhaleEmotion,
  now: number,
  persona?: WhalePersona,
): WhaleEmotion {
  const elapsedHours = Math.min(Math.max((now - current.updatedAt) / HOUR, 0), 24 * 14);
  if (elapsedHours < 0.02) return current;
  const base = emotionBaseline(persona);
  const retain = Math.pow(0.5, elapsedHours / 3.5);
  return {
    pleasure: clampSigned(base.pleasure + (current.pleasure - base.pleasure) * retain),
    arousal: clampSigned(base.arousal + (current.arousal - base.arousal) * retain),
    dominance: clampSigned(base.dominance + (current.dominance - base.dominance) * retain),
    reason: elapsedHours > 6 ? "" : current.reason,
    updatedAt: now,
  };
}

/** 施加一次情绪脉冲（来自摸头、喂饭、撞边或模型解析的对话情绪变化） */
export function applyEmotionDelta(
  current: WhaleEmotion,
  delta: WhaleEmotionDelta,
  now = Date.now(),
  persona?: WhalePersona,
): WhaleEmotion {
  const decayed = decayWhaleEmotion(current, now, persona);
  const step = (value: unknown, limit = 38) =>
    typeof value === "number" && Number.isFinite(value)
      ? Math.max(-limit, Math.min(limit, value))
      : 0;
  const dp = step(delta.pleasure);
  const da = step(delta.arousal);
  const dd = step(delta.dominance);
  const cleanReason = typeof delta.reason === "string" ? delta.reason.trim().slice(0, 48) : "";
  return {
    pleasure: clampSigned(decayed.pleasure + dp),
    arousal: clampSigned(decayed.arousal + da),
    dominance: clampSigned(decayed.dominance + dd),
    reason: cleanReason || decayed.reason,
    updatedAt: now,
  };
}

export interface EmotionDescriptor {
  id: "ecstatic" | "cozy" | "playful" | "tsun" | "pouty" | "sleepy" | "anxious" | "calm";
  label: string;
  hint: string;
  color: string;
}

/** 将连续 PAD 坐标映射为可读情绪标签与语气提示 */
export function describeWhaleEmotion(emotion: WhaleEmotion): EmotionDescriptor {
  const { pleasure: p, arousal: a, dominance: d } = emotion;
  if (p >= 52 && a >= 32) {
    return { id: "ecstatic", label: "元气满满", hint: "心情特别好、很有精神，说话轻快明朗", color: "#38BDF8" };
  }
  if (p >= 38 && a < 20) {
    return { id: "cozy", label: "软乎乎", hint: "感到安心惬意，语气柔软放松", color: "#60A5FA" };
  }
  if (p >= 18 && d >= 28) {
    return { id: "tsun", label: "小得意", hint: "有点得意爱逗你，但心里挺开心", color: "#A78BFA" };
  }
  if (p >= 16 && a >= 24) {
    return { id: "playful", label: "俏皮雀跃", hint: "跃跃欲试想和你互动玩闹", color: "#34D399" };
  }
  if (p <= -28 && a <= -10) {
    return { id: "pouty", label: "有点委屈", hint: "心里有点闷闷的或委屈，盼着被温柔哄一哄", color: "#F472B6" };
  }
  if (p <= -20 && a > 12) {
    return { id: "anxious", label: "炸毛小郁闷", hint: "有点气鼓鼓或紧张，语气带点小情绪，但很快能哄好", color: "#FB923C" };
  }
  if (a <= -30) {
    return { id: "sleepy", label: "迷糊犯困", hint: "有点犯困想打盹，说话慢悠悠的", color: "#818CF8" };
  }
  return { id: "calm", label: "安稳陪伴", hint: "情绪平稳自在，安静陪在旁边", color: "#7DD3FC" };
}

export function createInitialBondProfile(now = Date.now()): WhaleBondProfile {
  return {
    daysActive: 1,
    lastActiveDay: localDayKey(now),
    chatTurns: 0,
    interactions: 0,
    xp: 0,
  };
}

export function normalizeBondProfile(raw?: Partial<WhaleBondProfile>, now = Date.now()): WhaleBondProfile {
  const nonNeg = (value: unknown, fallback: number) =>
    typeof value === "number" && Number.isFinite(value) && value >= 0 ? Math.round(value) : fallback;
  return {
    daysActive: Math.max(1, nonNeg(raw?.daysActive, 1)),
    lastActiveDay: typeof raw?.lastActiveDay === "string" && /^\d{4}-\d{2}-\d{2}$/.test(raw.lastActiveDay)
      ? raw.lastActiveDay
      : localDayKey(now),
    chatTurns: nonNeg(raw?.chatTurns, 0),
    interactions: nonNeg(raw?.interactions, 0),
    xp: nonNeg(raw?.xp, 0),
  };
}

export function recordBondActivity(
  profile: WhaleBondProfile,
  kind: "chat" | "interaction" | "reflection",
  now = Date.now(),
): WhaleBondProfile {
  const today = localDayKey(now);
  const isNewDay = profile.lastActiveDay !== today;
  const gain = kind === "chat" ? 6 : kind === "reflection" ? 12 : 3;
  return {
    daysActive: profile.daysActive + (isNewDay ? 1 : 0),
    lastActiveDay: today,
    chatTurns: profile.chatTurns + (kind === "chat" ? 1 : 0),
    interactions: profile.interactions + (kind === "interaction" ? 1 : 0),
    xp: Math.min(99_999, profile.xp + gain + (isNewDay ? 15 : 0)),
  };
}

const BOND_STAGES: readonly Omit<WhaleBondStage, "progress">[] = [
  {
    level: 1,
    title: "初遇微光",
    minXp: 0,
    nextXp: 80,
    guidance: "彼此还在熟悉阶段，保持礼貌自然与好奇，慢慢记住用户的习惯。",
  },
  {
    level: 2,
    title: "熟络陪伴",
    minXp: 80,
    nextXp: 240,
    guidance: "已经比较熟络，可以自然接续聊过的事、轻轻打趣并关心作息。",
  },
  {
    level: 3,
    title: "默契搭子",
    minXp: 240,
    nextXp: 560,
    guidance: "很有默契，能听懂言外之意，主动想起用户的偏好、课业节奏和共同梗。",
  },
  {
    level: 4,
    title: "心有灵犀",
    minXp: 560,
    nextXp: 1100,
    guidance: "相处深厚自然，不必客套，敏锐察觉情绪低落或疲惫，用最对味的方式陪伴。",
  },
  {
    level: 5,
    title: "灵魂家人",
    minXp: 1100,
    nextXp: null,
    guidance: "彼此完全信赖，像长久陪伴的贴心家人/挚友，细节里处处藏着懂你。",
  },
];

export function resolveBondStage(
  profile: WhaleBondProfile,
  careBond = 40,
  factsCount = 0,
): WhaleBondStage {
  const effectiveXp = Math.max(
    0,
    Math.round(profile.xp + Math.max(0, careBond - 40) * 2 + factsCount * 4),
  );
  let stage = BOND_STAGES[0];
  for (const item of BOND_STAGES) {
    if (effectiveXp >= item.minXp) stage = item;
  }
  const progress = stage.nextXp === null
    ? 1
    : Math.max(0, Math.min(1, (effectiveXp - stage.minXp) / Math.max(1, stage.nextXp - stage.minXp)));
  return { ...stage, progress };
}

export function buildWhaleEmotionPrompt(
  emotion: WhaleEmotion,
  bond: WhaleBondStage,
  profile: WhaleBondProfile,
  care?: { fullness: number; mood: number; bond: number },
  lastSeenGapMinutes?: number,
): string {
  const desc = describeWhaleEmotion(emotion);
  const gapHint =
    typeof lastSeenGapMinutes === "number" && lastSeenGapMinutes >= 360
      ? lastSeenGapMinutes >= 24 * 60
        ? `距离上次互动已过了约 ${Math.round(lastSeenGapMinutes / (24 * 60))} 天，重逢时可以自然带一点想念或关心近况。`
        : `距离上次互动已过了约 ${Math.round(lastSeenGapMinutes / 60)} 小时。`
      : "";
  const careBits: string[] = [];
  if (care) {
    if (care.fullness < 25) careBits.push("现在肚子很饿，有点馋白米饭");
    else if (care.fullness > 90) careBits.push("刚吃得饱饱的，很满足");
    if (care.mood < 30) careBits.push("有一阵没被陪着玩，有点小委屈");
  }
  return `【内在情绪与羁绊状态（自然体现在语气中，绝不生硬报数值或等级名）】
- 当前心境：${desc.label}（${desc.hint}${emotion.reason ? `；最近因为：${emotion.reason}` : ""}）
- 相处默契：Lv.${bond.level}（已陪伴 ${profile.daysActive} 天，累计 ${profile.chatTurns} 轮对话）— ${bond.guidance}${careBits.length ? `\n- 身体状态：${careBits.join("；")}` : ""}${gapHint ? `\n- 时间感：${gapHint}` : ""}
- 原则：情绪与默契只用来让回应更有血肉和延续性，不能覆盖用户的性格滑条或已建立的身份关系；用户严肃求助或倾诉难过时优先共情与可靠陪伴。`;
}
