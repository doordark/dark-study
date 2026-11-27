export interface TapSequenceState {
  count: number;
  lastAt: number;
}

export interface TapSequenceOptions {
  targetCount?: number;
  windowMs?: number;
}

export interface TapSequenceResult {
  next: TapSequenceState;
  triggered: boolean;
  progress: number;
}

export const INITIAL_TAP_SEQUENCE: TapSequenceState = {
  count: 0,
  lastAt: 0,
};

/**
 * Pure rolling-window tap sequence gate.
 * Resets cleanly when elapsed time exceeds windowMs or clock moves backward.
 */
export function advanceTapSequence(
  state: TapSequenceState,
  nowMs: number,
  options: TapSequenceOptions = {},
): TapSequenceResult {
  const target = Math.max(
    1,
    Math.floor(Number.isFinite(options.targetCount) ? (options.targetCount as number) : 5),
  );
  const windowMs = Math.max(
    200,
    Math.floor(Number.isFinite(options.windowMs) ? (options.windowMs as number) : 2400),
  );
  const safeNow = Number.isFinite(nowMs) ? nowMs : 0;
  const elapsed = safeNow - state.lastAt;
  const withinWindow = state.count > 0 && elapsed >= 0 && elapsed <= windowMs;
  const nextCount = withinWindow ? state.count + 1 : 1;

  if (nextCount >= target) {
    return {
      next: { count: 0, lastAt: 0 },
      triggered: true,
      progress: 1,
    };
  }

  return {
    next: { count: nextCount, lastAt: safeNow },
    triggered: false,
    progress: nextCount / target,
  };
}

/* -------------------------------------------------------------------------- */
/*  Chime Sequencer & Melody Engine                                           */
/* -------------------------------------------------------------------------- */

export interface ChimeNoteMeta {
  index: number;
  solfege: string;
  numeral: string;
  pitch: string;
  color: string;
  glow: string;
}

export const CHIME_NOTES: readonly ChimeNoteMeta[] = [
  { index: 0, solfege: "Do", numeral: "1", pitch: "C", color: "#7DD3FC", glow: "rgba(125,211,252,0.34)" },
  { index: 1, solfege: "Re", numeral: "2", pitch: "D", color: "#93C5FD", glow: "rgba(147,197,253,0.34)" },
  { index: 2, solfege: "Mi", numeral: "3", pitch: "E", color: "#A5B4FC", glow: "rgba(165,180,252,0.34)" },
  { index: 3, solfege: "Fa", numeral: "4", pitch: "F", color: "#C4B5FD", glow: "rgba(196,181,253,0.34)" },
  { index: 4, solfege: "Sol", numeral: "5", pitch: "G", color: "#FDE68A", glow: "rgba(253,230,138,0.36)" },
  { index: 5, solfege: "La", numeral: "6", pitch: "A", color: "#FDBA74", glow: "rgba(253,186,116,0.34)" },
  { index: 6, solfege: "Si", numeral: "7", pitch: "B", color: "#F9A8D4", glow: "rgba(249,168,212,0.34)" },
] as const;

export interface ChimePreset {
  id: string;
  title: string;
  subtitle: string;
  tempoMs: number;
  steps: readonly (number | null)[];
}

export const CHIME_PRESETS: readonly ChimePreset[] = [
  {
    id: "bell",
    title: "晚风下课铃",
    subtitle: "走廊暮色里的慢半拍钟声",
    tempoMs: 430,
    steps: [2, 0, 1, 4, null, 4, 1, 2, 0, null],
  },
  {
    id: "twinkle",
    title: "夜半小星星",
    subtitle: "亮在教学楼屋檐上的旧旋律",
    tempoMs: 360,
    steps: [0, 0, 4, 4, 5, 5, 4, null, 3, 3, 2, 2, 1, 1, 0, null],
  },
  {
    id: "snow",
    title: "图书馆初雪",
    subtitle: "翻页声与窗外微光的轻和弦",
    tempoMs: 420,
    steps: [4, 2, 3, 4, 6, 5, 4, null, 2, 3, 4, 2, 1, 0, null],
  },
] as const;

export interface MelodyDiscovery {
  id: string;
  title: string;
  keepsake: string;
  pattern: readonly number[];
}

export const MELODY_DISCOVERIES: readonly MelodyDiscovery[] = [
  {
    id: "starlight_scale",
    title: "一整串银河音阶",
    keepsake: "一步一步慢慢往上走的日子，连起来原来是一首很亮的歌。",
    pattern: [0, 1, 2, 3, 4, 5, 6],
  },
  {
    id: "lullaby_star",
    title: "窗台上的小星星",
    keepsake: "就算今夜云层很厚，你心里藏着的那一点光也一直亮着。",
    pattern: [0, 0, 4, 4, 5, 5, 4],
  },
  {
    id: "campus_chime",
    title: "旧教学楼的黄昏钟",
    keepsake: "风吹过走廊尽头时，所有没写完的题都可以先放一放。",
    pattern: [2, 0, 1, 4],
  },
] as const;

export function clampNoteIndex(note: number): number {
  if (!Number.isFinite(note)) return 0;
  return Math.max(0, Math.min(CHIME_NOTES.length - 1, Math.floor(note)));
}

export function appendNoteHistory(
  history: readonly number[],
  note: number,
  maxLen = 12,
): number[] {
  const cap = Math.max(1, Math.floor(maxLen));
  const next = [...history, clampNoteIndex(note)];
  return next.length > cap ? next.slice(next.length - cap) : next;
}

export function appendTapeNote(
  tape: readonly number[],
  note: number,
  maxSlots = 8,
): number[] {
  return appendNoteHistory(tape, note, maxSlots);
}

/**
 * Matches the trailing suffix of played notes against curated melodies.
 * Longer patterns are checked first so richer matches win cleanly.
 */
export function matchChimeDiscovery(
  history: readonly number[],
): MelodyDiscovery | null {
  if (!history.length) return null;
  const ordered = [...MELODY_DISCOVERIES].sort(
    (a, b) => b.pattern.length - a.pattern.length,
  );
  for (const item of ordered) {
    const len = item.pattern.length;
    if (history.length < len) continue;
    let matched = true;
    const offset = history.length - len;
    for (let i = 0; i < len; i++) {
      if (history[offset + i] !== item.pattern[i]) {
        matched = false;
        break;
      }
    }
    if (matched) return item;
  }
  return null;
}

export function stepCursor(cursor: number, length: number): number {
  if (!Number.isFinite(length) || length <= 0) return 0;
  const safeCursor = Number.isFinite(cursor) ? Math.floor(cursor) : 0;
  const len = Math.floor(length);
  return ((safeCursor + 1) % len + len) % len;
}

/* -------------------------------------------------------------------------- */
/*  Firefly Jar & Guided Breath Engine                                        */
/* -------------------------------------------------------------------------- */

export interface FireflyOrb {
  id: number;
  /** Normalized horizontal coordinate inside jar (0.20 .. 0.80) */
  x: number;
  /** Normalized vertical coordinate inside jar (0.28 .. 0.82) */
  y: number;
  radius: number;
  tint: string;
}

export const MAX_FIREFLIES = 12;
const FIREFLY_TINTS = ["#FDE68A", "#FCD34D", "#BAE6FD", "#A7F3D0", "#FED7AA"] as const;

function clampUnit(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return (min + max) / 2;
  return Math.max(min, Math.min(max, value));
}

export function createInitialFireflies(count = 3): FireflyOrb[] {
  const safeCount = Math.max(0, Math.min(MAX_FIREFLIES, Math.floor(count)));
  let list: FireflyOrb[] = [];
  for (let i = 0; i < safeCount; i++) {
    list = spawnFirefly(list);
  }
  return list;
}

export function spawnFirefly(
  existing: readonly FireflyOrb[],
  tapNorm?: { x: number; y: number },
): FireflyOrb[] {
  if (existing.length >= MAX_FIREFLIES) {
    return [...existing];
  }
  const nextId =
    existing.length > 0 ? Math.max(...existing.map((f) => f.id)) + 1 : 1;
  const idx = existing.length;

  let x: number;
  let y: number;
  if (
    tapNorm &&
    Number.isFinite(tapNorm.x) &&
    Number.isFinite(tapNorm.y)
  ) {
    x = clampUnit(tapNorm.x, 0.22, 0.78);
    y = clampUnit(tapNorm.y, 0.30, 0.80);
  } else {
    // Golden-angle spiral inside jar bounds so orbs stay organically spaced.
    const angle = idx * 2.399963229728653;
    const spread = 0.09 + ((idx + 1) / (MAX_FIREFLIES + 1)) * 0.19;
    x = clampUnit(0.5 + Math.cos(angle) * spread, 0.22, 0.78);
    y = clampUnit(0.56 + Math.sin(angle) * spread * 1.05, 0.30, 0.80);
  }

  const radius = 3.2 + (idx % 3) * 1.1;
  const tint = FIREFLY_TINTS[idx % FIREFLY_TINTS.length];
  return [...existing, { id: nextId, x, y, radius, tint }];
}

export function computeJarWarmth(count: number): number {
  if (!Number.isFinite(count) || count <= 0) return 0;
  return Math.min(1, Math.max(0, count / MAX_FIREFLIES));
}

export type BreathStage = "inhale" | "hold" | "exhale";

export interface BreathSnapshot {
  stage: BreathStage;
  label: string;
  hint: string;
  stageProgress: number;
  haloScale: number;
  completedCycles: number;
}

export const BREATH_INHALE_MS = 4000;
export const BREATH_HOLD_MS = 2000;
export const BREATH_EXHALE_MS = 6000;
export const BREATH_CYCLE_MS =
  BREATH_INHALE_MS + BREATH_HOLD_MS + BREATH_EXHALE_MS;

export function computeBreathPhase(elapsedMs: number): BreathSnapshot {
  const safeMs = Number.isFinite(elapsedMs) && elapsedMs > 0 ? elapsedMs : 0;
  const completedCycles = Math.floor(safeMs / BREATH_CYCLE_MS);
  const inCycle = safeMs % BREATH_CYCLE_MS;

  if (inCycle < BREATH_INHALE_MS) {
    const p = inCycle / BREATH_INHALE_MS;
    const eased = 0.5 - 0.5 * Math.cos(p * Math.PI);
    return {
      stage: "inhale",
      label: "缓缓吸气",
      hint: "把窗外的微风悄悄吸进来",
      stageProgress: p,
      haloScale: 0.78 + eased * 0.4,
      completedCycles,
    };
  }

  if (inCycle < BREATH_INHALE_MS + BREATH_HOLD_MS) {
    const p = (inCycle - BREATH_INHALE_MS) / BREATH_HOLD_MS;
    return {
      stage: "hold",
      label: "轻轻停驻",
      hint: "肩膀可以放低一点点",
      stageProgress: p,
      haloScale: 1.18,
      completedCycles,
    };
  }

  const p = (inCycle - BREATH_INHALE_MS - BREATH_HOLD_MS) / BREATH_EXHALE_MS;
  const eased = 0.5 - 0.5 * Math.cos(p * Math.PI);
  return {
    stage: "exhale",
    label: "慢慢呼出",
    hint: "把今天多余的紧绷交还给夜色",
    stageProgress: p,
    haloScale: 1.18 - eased * 0.4,
    completedCycles,
  };
}

export const IDLE_KEEPSAKES: readonly string[] = [
  "这段空白不是浪费，是给生活特意留出来的页边距。",
  "风经过没课的傍晚，顺手把你皱着的眉头熨平了。",
  "不用每时每刻都在赶路，停下来发会儿呆也算认真生活。",
  "教学楼的灯一盏盏熄掉时，别忘了给自己留一盏暖的。",
  "今天已经做得够好了，剩下的事交给明早清醒的太阳。",
  "瓶子里装的不是萤火，是你悄悄攒下的好心情。",
] as const;

export function pickIdleKeepsake(index: number): string {
  const safe = Number.isFinite(index) ? Math.floor(index) : 0;
  const len = IDLE_KEEPSAKES.length;
  return IDLE_KEEPSAKES[((safe % len) + len) % len];
}

/* -------------------------------------------------------------------------- */
/*  Astrolabe Fortune Cylinder Engine                                         */
/* -------------------------------------------------------------------------- */

export interface CampusFortune {
  id: string;
  numberLabel: string;
  tier: string;
  title: string;
  poem: readonly [string, string];
  suitable: string;
  avoid: string;
  luckyToken: string;
}

export const CAMPUS_FORTUNES: readonly CampusFortune[] = [
  {
    id: "lamp-margin",
    numberLabel: "第壹签",
    tier: "顺遂吉",
    title: "灯火留白",
    poem: ["晚风拂过自习桌，未解难题忽明朗。", "行至水穷慢抬头，星光早已在肩旁。"],
    suitable: "先吃一顿热乎饭再继续",
    avoid: "在深夜拿自己和别人比进度",
    luckyToken: "图书馆靠窗的光斑",
  },
  {
    id: "slow-bloom",
    numberLabel: "第贰签",
    tier: "灵感上上",
    title: "慢慢开花",
    poem: ["纸页沙沙藏伏笔，百日微功不负人。", "莫问花期早或晚，自有清风来叩门。"],
    suitable: "把大目标拆成二十分钟小事",
    avoid: "还没开始就先责怪自己",
    luckyToken: "一支顺手的好写黑笔",
  },
  {
    id: "easy-breeze",
    numberLabel: "第叁签",
    tier: "松弛中吉",
    title: "风物长宜",
    poem: ["课间云朵慢慢走，操场橘色落日圆。", "偶有风波皆小事，心安之处即晴天。"],
    suitable: "下楼散步十分钟吹吹风",
    avoid: "一口气刷太多焦虑帖子",
    luckyToken: "傍晚天边的一抹橘粉",
  },
  {
    id: "star-current",
    numberLabel: "第肆签",
    tier: "星光大吉",
    title: "星河顺流",
    poem: ["昨夜笔尖留墨韵，今朝落纸正从容。", "心有定盘不怕远，一程微光一程风。"],
    suitable: "顺着直觉完成最想做的一件事",
    avoid: "反复回头怀疑已做好的决定",
    luckyToken: "温热刚好的半杯清水",
  },
  {
    id: "deep-water",
    numberLabel: "第伍签",
    tier: "从容上吉",
    title: "静水深流",
    poem: ["看似平常一页书，悄然添作脚下桥。", "所有认真度过的夜，都在远方为你亮灯。"],
    suitable: "合上手机早睡半小时",
    avoid: "把一次起伏当成整段结局",
    luckyToken: "晒过太阳的柔软被角",
  },
  {
    id: "dawn-clear",
    numberLabel: "第陆签",
    tier: "破晓上上",
    title: "晴日可期",
    poem: ["云开林梢雀声起，满纸星辰入梦来。", "但行好事莫问路，惊喜常在转角开。"],
    suitable: "夸一夸最近努力撑过来的自己",
    avoid: "吝啬给自己一点小奖励",
    luckyToken: "刚好赶上的那班绿灯",
  },
  {
    id: "warm-letter",
    numberLabel: "第柒签",
    tier: "微风小吉",
    title: "纸短情长",
    poem: ["草稿纸边画小鱼，疲惫时分亦有趣。", "慢火炖出好滋味，好事多半晚几拍。"],
    suitable: "和喜欢的朋友发一句废话",
    avoid: "把所有压力都一个人扛着",
    luckyToken: "口袋里留着的一颗软糖",
  },
  {
    id: "steady-anchor",
    numberLabel: "第捌签",
    tier: "安稳吉",
    title: "灯火可亲",
    poem: ["一盏台灯照书卷，半窗月色伴清茶。", "不必事事求满分，平平安安已是佳。"],
    suitable: "听一首老歌然后伸个懒腰",
    avoid: "忘记今天其实也值得开心",
    luckyToken: "刚泡开的一缕热茶香气",
  },
] as const;

export const FORTUNE_SEALS = ["逢考必稳", "自在如风", "灯火可亲"] as const;
export const SHAKE_TARGET = 3;

export function advanceShakeCount(
  current: number,
  target = SHAKE_TARGET,
): { count: number; revealed: boolean; progress: number } {
  const safeTarget = Math.max(1, Math.floor(Number.isFinite(target) ? target : SHAKE_TARGET));
  const safeCurrent = Number.isFinite(current) && current > 0 ? Math.floor(current) : 0;
  const next = Math.min(safeTarget, safeCurrent + 1);
  return {
    count: next,
    revealed: next >= safeTarget,
    progress: next / safeTarget,
  };
}

export function pickCampusFortune(
  seed: number,
  excludeId?: string,
): CampusFortune {
  const len = CAMPUS_FORTUNES.length;
  const safeSeed = Number.isFinite(seed) ? Math.abs(Math.floor(seed)) : 0;
  // Simple deterministic mix
  const mixed = (safeSeed * 2654435761) >>> 0;
  let idx = mixed % len;
  if (excludeId && CAMPUS_FORTUNES[idx].id === excludeId && len > 1) {
    idx = (idx + 1) % len;
  }
  return CAMPUS_FORTUNES[idx];
}

export function nextSealIndex(current: number | null): number {
  const len = FORTUNE_SEALS.length;
  if (current === null || !Number.isFinite(current)) return 0;
  return (((Math.floor(current) + 1) % len) + len) % len;
}

export function resolveJourneyWhisper(stats?: {
  earnedCredits?: number;
  termCount?: number;
}): string {
  const credits =
    stats && Number.isFinite(stats.earnedCredits) ? (stats.earnedCredits as number) : 0;
  const terms =
    stats && Number.isFinite(stats.termCount) ? (stats.termCount as number) : 0;

  if (credits <= 0 && terms <= 0) {
    return "故事才刚翻开扉页，按自己的节奏慢慢写就好。";
  }
  if (credits < 45) {
    return "已经攒下最初的一捧星火，走过的每一节课都算数。";
  }
  if (credits < 105) {
    return "走到半程的风景最耐看，忙完这阵记得抬头看看云。";
  }
  return "你已经走了很远很远的路，前方的天色正在慢慢变亮。";
}
