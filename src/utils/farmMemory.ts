import { PERSONALITIES } from './farmPersonality';
import { restoreAssignment, type FarmAssignment } from './farmAssignment';
import {
  applyFarmEmotionDelta,
  describeFarmEmotion,
  normalizeFarmEmotion,
  socialReactionEmotionDelta,
  type FarmEmotionDelta,
  type FarmEmotionState,
} from './farmEmotion';
import { FARM_TOPICS, RESIDENTS, RESIDENT_IDS, type FarmTopicId, type ResidentConversation, type ResidentId, type SharedFarmTopic } from './farmLife';
import {
  isVerbalGiftClaim,
  restorePersonaMemoryFields,
  type FarmMemoryEpisode,
  type PeerImpression,
  type PlayerFact,
} from './farmPersonaMemory';

export const CONTINUE_FARM_CHAT = '接着上次聊';
export const NPC_CHAT_UNAVAILABLE = '现在不方便聊天，稍后再来找我吧。';
const MAX_TURNS = 24;
const MAX_AFFINITY = 100;
export const SOCIAL_REACTIONS = ['neutral', 'warm', 'teasing', 'insult', 'apology'] as const;
export type SocialReaction = typeof SOCIAL_REACTIONS[number];
export const SOCIAL_MOODS = { warm: '开心', teasing: '不悦', insult: '生气', apology: '缓和' } as const;
type SocialMood = typeof SOCIAL_MOODS[keyof typeof SOCIAL_MOODS];

const REPLY_JSON_KEYS = [
  'reply',
  'response',
  'text',
  'content',
  'message',
  'answer',
  'dialogue',
  'speech',
  'output',
] as const;

/** 解码截断/未闭合 JSON 字符串里的转义序列，遇到合法 JSON 结束边界停止。 */
function decodePartialJsonString(fragment: string): string {
  let out = '';
  for (let i = 0; i < fragment.length; i += 1) {
    const ch = fragment[i];
    if (ch === '\\') {
      if (i + 1 >= fragment.length) break; // 尾部被截断的孤立反斜杠
      const next = fragment[i + 1];
      if (next === '"' || next === '\\' || next === '/') {
        out += next;
        i += 1;
      } else if (next === 'n') {
        out += '\n';
        i += 1;
      } else if (next === 'r') {
        out += '\r';
        i += 1;
      } else if (next === 't') {
        out += '\t';
        i += 1;
      } else if (next === 'b') {
        out += '\b';
        i += 1;
      } else if (next === 'f') {
        out += '\f';
        i += 1;
      } else if (next === 'u') {
        const hex = fragment.slice(i + 2, i + 6);
        if (/^[0-9a-fA-F]{4}$/.test(hex)) {
          out += String.fromCharCode(parseInt(hex, 16));
          i += 5;
        } else {
          break; // 截断的 \uXXXX
        }
      } else {
        out += next;
        i += 1;
      }
      continue;
    }
    if (ch === '"') {
      const rest = fragment.slice(i + 1);
      // 只有后面紧跟 JSON 结尾/闭合括号/下一键值对时才视为字符串结束，容忍模型偶发未转义中文内引号
      if (/^\s*(?:$|}|\]|,\s*"[a-zA-Z0-9_-]+"\s*:)/.test(rest)) {
        break;
      }
    }
    out += ch;
  }
  return out;
}

function extractReplyFromJsonValue(parsed: unknown): { matched: boolean; value: string } {
  if (typeof parsed === 'string') {
    return { matched: true, value: parsed.trim() };
  }
  if (Array.isArray(parsed)) {
    for (const item of parsed) {
      const hit = extractReplyFromJsonValue(item);
      if (hit.matched && hit.value) return hit;
    }
    return { matched: false, value: '' };
  }
  if (parsed && typeof parsed === 'object') {
    const obj = parsed as Record<string, unknown>;
    for (const key of REPLY_JSON_KEYS) {
      if (typeof obj[key] === 'string') {
        return { matched: true, value: obj[key].trim() };
      }
    }
    const stringEntries = Object.values(obj).filter((v): v is string => typeof v === 'string' && v.trim().length > 0);
    if (stringEntries.length === 1) {
      return { matched: true, value: stringEntries[0].trim() };
    }
  }
  return { matched: false, value: '' };
}

/**
 * 健壮清洗模型回复或历史记录里的脏 JSON 外壳：
 * - 完整 JSON：`{"response":"..."}` / `{"reply":"..."}` / `{"text":"..."}` / 嵌套 JSON 字符串
 * - Markdown 代码块：```` ```json\n{"response":"..."}\n``` ````（含未闭合围栏）
 * - 截断 JSON：`{"response":"有一点吧...` 或 `...妈妈现在想干嘛？"}` 或 `...","emotion":"happy"}`
 * 普通中文对白（含正常引号/括号）原样保留。
 */
export function unwrapFarmReplyText(raw: string): string {
  if (typeof raw !== 'string') return '';
  let text = raw.trim();
  if (!text) return '';

  for (let pass = 0; pass < 4; pass += 1) {
    const before = text;

    // 1. 剥离完整或未闭合的 markdown 代码围栏
    const fencedFull = /^```(?:jsonc?|txt|text)?\s*\r?\n?([\s\S]*?)\r?\n?```$/i.exec(text);
    if (fencedFull) {
      text = fencedFull[1].trim();
    } else {
      const fencedOpen = /^```(?:jsonc?|txt|text)?\s*\r?\n([\s\S]+)$/i.exec(text);
      if (fencedOpen) {
        text = fencedOpen[1].replace(/\r?\n?```\s*$/, '').trim();
      } else if (/\r?\n```\s*$/.test(text)) {
        text = text.replace(/\r?\n```\s*$/, '').trim();
      }
    }

    // 2. 剥离紧贴 JSON 对象前的 "json:" / "JSON\n" 标签
    text = text.replace(/^(?:json|JSON)\s*[:：]?\s*(?=\{)/, '').trim();
    if (!text) return '';

    // 3. 尝试标准 JSON.parse 解包
    if (text.startsWith('{') || text.startsWith('[') || (text.startsWith('"') && text.endsWith('"'))) {
      try {
        const parsed = JSON.parse(text);
        const extracted = extractReplyFromJsonValue(parsed);
        if (extracted.matched) {
          text = extracted.value;
          if (!text) return '';
          if (text !== before) continue;
        }
      } catch {
        // 落入下方的截断 JSON 容错解包
      }
    }

    // 4. 处理开头完整但尾部被截断的 JSON 对象，如 `{"response":"有一点吧，不过不是什么大事`
    const openKeyJson = /^\{\s*"(?:reply|response|text|content|message|answer|dialogue|speech|output)"\s*:\s*"([\s\S]*)$/i.exec(text);
    if (openKeyJson) {
      const decoded = decodePartialJsonString(openKeyJson[1]).trim();
      text = decoded;
      if (!text) return '';
      if (text !== before) continue;
    }

    // 5. 处理缺少左花括号但残留 JSON 键前缀的情况，如 `"response":"有一点吧...`
    const bareKeyPrefix = /^"?(?:reply|response|text|content|message)"\s*:\s*"([\s\S]*)$/i.exec(text);
    if (bareKeyPrefix) {
      const decoded = decodePartialJsonString(bareKeyPrefix[1]).trim();
      text = decoded;
      if (!text) return '';
      if (text !== before) continue;
    }

    // 6. 处理尾部残留的截断 JSON 后缀，如 `...","emotion":"happy"}` 或 `...妈妈现在想干嘛？"}`
    const trailingFields = /"\s*,\s*"(?:emotion|mood|reaction|action|memoryUpdates|episode|tone|confidence|thinking|reason|reply|response|text|content|message)"\s*:[\s\S]*$/i;
    if (trailingFields.test(text)) {
      text = text.replace(trailingFields, '').trim();
      if (text !== before) continue;
    }
    if (!text.includes('{') && /\\?"\s*\}+\s*$/.test(text)) {
      text = text.replace(/\\?"\s*\}+\s*$/, '').trim();
      if (text !== before) continue;
    }

    if (text === before) break;
  }

  return text.trim();
}

export interface FarmVerifiedGiftPayload {
  itemId?: string;
  itemLabel: string;
  quantity?: number;
  kind?: 'crop' | 'dish' | 'wish';
  recipientName?: string;
  tier?: 'loved' | 'liked' | 'normal';
  affinityDelta?: number;
  rewardLabel?: string;
  inventoryConsumed?: boolean;
}

export interface FarmChatTurn {
  id: string;
  player: string;
  reply: string;
  unavailable?: true;
  gift?: FarmVerifiedGiftPayload;
}
export interface ResidentMemory {
  affinity: number;
  turns: FarmChatTurn[];
  mood?: SocialMood;
  /** 4 维连续情绪数值（愉悦/精力/平和/社交，向后兼容旧版存档） */
  emotion?: FarmEmotionState;
  assignment?: FarmAssignment;
  /** 长期人格记忆流（Smallville 三因子检索，向后兼容 v4 存档） */
  episodes?: FarmMemoryEpisode[];
  /** 对玩家的长期结构化认知（带原话佐证，防编造） */
  playerFacts?: PlayerFact[];
  /** 对其他家人的动态关系印象 */
  peerImpressions?: Partial<Record<ResidentId, PeerImpression>>;
  /** 阶段性高阶反思 */
  reflections?: string[];
}
export type FarmMemories = Record<ResidentId, ResidentMemory>;

function object(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function restoreGiftPayload(raw: unknown): FarmVerifiedGiftPayload | undefined {
  const item = object(raw);
  const itemLabel = typeof item.itemLabel === 'string' ? item.itemLabel.trim().slice(0, 32) : '';
  if (!itemLabel) return undefined;
  const kind = item.kind === 'crop' || item.kind === 'dish' || item.kind === 'wish' ? item.kind : undefined;
  const tier = item.tier === 'loved' || item.tier === 'liked' || item.tier === 'normal' ? item.tier : undefined;
  return {
    itemLabel,
    ...(typeof item.itemId === 'string' && item.itemId.trim() ? { itemId: item.itemId.trim().slice(0, 32) } : {}),
    ...(typeof item.quantity === 'number' && Number.isFinite(item.quantity) ? { quantity: Math.max(1, Math.round(item.quantity)) } : {}),
    ...(kind ? { kind } : {}),
    ...(typeof item.recipientName === 'string' && item.recipientName.trim() ? { recipientName: item.recipientName.trim().slice(0, 24) } : {}),
    ...(tier ? { tier } : {}),
    ...(typeof item.affinityDelta === 'number' && Number.isFinite(item.affinityDelta) ? { affinityDelta: Math.round(item.affinityDelta) } : {}),
    ...(typeof item.rewardLabel === 'string' && item.rewardLabel.trim() ? { rewardLabel: item.rewardLabel.trim().slice(0, 40) } : {}),
    ...(item.inventoryConsumed === true ? { inventoryConsumed: true } : {}),
  };
}

export function restoreFarmMemories(raw?: unknown): FarmMemories {
  const value = object(raw);
  const now = Date.now();
  return Object.fromEntries(RESIDENT_IDS.map(id => {
    const record = object(value[id]);
    const turns = Array.isArray(record.turns) ? record.turns.slice(-MAX_TURNS).flatMap(entry => {
      const { id, player, reply, unavailable, gift } = object(entry);
      const cleanPlayer = typeof player === 'string' ? player.trim().slice(0, 200) : '';
      const cleanReply = typeof reply === 'string' ? unwrapFarmReplyText(reply).slice(0, 240) : '';
      const restoredGift = restoreGiftPayload(gift);
      return typeof id === 'string' && id && cleanPlayer && cleanReply
        ? [{
            id: id.slice(0, 100),
            player: cleanPlayer,
            reply: cleanReply,
            ...(unavailable === true ? { unavailable: true as const } : {}),
            ...(restoredGift ? { gift: restoredGift } : {}),
          }]
        : [];
    }) : [];
    const affinity = typeof record.affinity === 'number' && Number.isFinite(record.affinity)
      ? Math.min(MAX_AFFINITY, Math.max(0, Math.round(record.affinity))) : 0;
    const mood = Object.values(SOCIAL_MOODS).find(item => item === record.mood);
    const emotion = record.emotion && typeof record.emotion === 'object' && !Array.isArray(record.emotion)
      ? normalizeFarmEmotion(record.emotion, id, mood, now)
      : undefined;
    const assignment = restoreAssignment(record.assignment);
    const persona = restorePersonaMemoryFields(record);
    return [id, { turns, affinity, ...(emotion ? { emotion } : {}), ...(mood ? { mood } : {}), ...(assignment ? { assignment } : {}), ...persona }];
  })) as FarmMemories;
}

/** 快捷读取并兜底居民的 4 维情绪数值 */
export function getResidentEmotion(memory: ResidentMemory | undefined, id: ResidentId, now = Date.now()): FarmEmotionState {
  return normalizeFarmEmotion(memory?.emotion, id, memory?.mood, now);
}

/** 对单个居民的记忆施加一次情绪数值变动，并同步兼容旧 mood 字段 */
export function shiftResidentMemoryEmotion(
  memory: ResidentMemory,
  id: ResidentId,
  delta: FarmEmotionDelta,
  now = Date.now(),
): ResidentMemory {
  const current = getResidentEmotion(memory, id, now);
  const nextEmotion = applyFarmEmotionDelta(current, id, delta, now);
  const desc = describeFarmEmotion(nextEmotion);
  return {
    ...memory,
    emotion: nextEmotion,
    ...(desc.legacyMood ? { mood: desc.legacyMood } : {}),
  };
}

export const affinityLabel = (affinity: number) => affinity >= 60 ? '亲近' : affinity >= 24 ? '熟络' : affinity >= 10 ? '渐熟' : '初识';

const normalized = (value: string) => value.normalize('NFKC').toLowerCase().replace(/[\p{P}\p{S}\s]/gu, '');

export function localSocialReaction(text: string): SocialReaction {
  const line = text.normalize('NFKC').trim();
  if (/^(?:[“「"'‘]|如果|假如|有人|他说|她说|你觉得|什么意思)/.test(line) || /(?:是什么意思|怎么理解|这个词)[？?]?$/.test(line)) return 'neutral';
  if (/^滚[！!。\s]*$/.test(line)) return 'insult';
  if (/(?:你(?:就是|真是|是个|这个|个)?|^)(?:傻[逼比叉]|废物|蠢货|白痴|智障)|^(?:滚蛋|滚开|去死)|你妈的/i.test(line)) return 'insult';
  if (/^(?:儿子(?:[，,！!。\s]|$)|乖儿子|(?:你是|你就是|你个)(?:我的)?儿子|叫(?:我爸爸|爸爸|爹))/.test(line)) return 'teasing';
  if (/^(?:对不起|抱歉|我道歉|刚才是我不对)/.test(line)) return 'apology';
  if (/^(?:谢谢你|多亏你|辛苦你了|你做得真好)/.test(line)) return 'warm';
  return 'neutral';
}

export function recordFarmChatTurn(memory: ResidentMemory, turn: FarmChatTurn, reaction: SocialReaction = localSocialReaction(turn.player), personalityId?: string): ResidentMemory {
  const cleanReply = unwrapFarmReplyText(turn.reply) || turn.reply.trim();
  const sanitizedTurn: FarmChatTurn = cleanReply === turn.reply ? turn : { ...turn, reply: cleanReply };
  const topic = normalized(sanitizedTurn.player);
  if (!topic || memory.turns.some(previous => previous.id === sanitizedTurn.id)) return memory;
  if (sanitizedTurn.unavailable) return { ...memory, turns: [...memory.turns, sanitizedTurn].slice(-MAX_TURNS) };
  const continuing = isFarmChatContinuation(sanitizedTurn.player);
  if (continuing && !memory.turns.some(previous => !isFarmChatContinuation(previous.player))) return memory;
  const last = memory.turns.at(-1);
  const turns = continuing && last && isFarmChatContinuation(last.player) ? memory.turns.slice(0, -1) : memory.turns;
  const repeated = continuing || memory.turns.some(previous => !previous.unavailable && normalized(previous.player) === topic);
  const upset = memory.mood === '生气' || memory.mood === '不悦';
  const p = personalityId ? PERSONALITIES[personalityId] : undefined;
  // 口头画饼送礼防白嫖好感：普通文字聊天声称“送你一个萝卜”但没有系统 gift 凭证时，严禁触发 warm/兴趣好感加成
  const verbalGiftOnly = !sanitizedTurn.gift && isVerbalGiftClaim(sanitizedTurn.player);
  const effectiveReaction: SocialReaction = verbalGiftOnly && reaction === 'warm' ? 'neutral' : reaction;
  const interested = !verbalGiftOnly && Boolean(p?.interests.some(topic => sanitizedTurn.player.includes(topic)) && sanitizedTurn.player.length >= 6);
  const delta = effectiveReaction === 'insult' ? -(p?.insultLoss ?? 8) : effectiveReaction === 'teasing' ? -(p?.teaseLoss ?? 4)
    : repeated ? 0 : effectiveReaction === 'apology' && upset ? (p?.apologyGain ?? 1) : effectiveReaction === 'warm' && !upset ? (p?.warmGain ?? 2) : effectiveReaction === 'neutral' && !upset && interested ? 1 : 0;
  const mood = effectiveReaction === 'neutral' || effectiveReaction === 'warm' && upset ? memory.mood : SOCIAL_MOODS[effectiveReaction];
  const actorId: ResidentId = (personalityId && (RESIDENT_IDS as readonly string[]).includes(personalityId) ? personalityId : 'door') as ResidentId;
  const baseEmotion = normalizeFarmEmotion(memory.emotion, actorId, memory.mood);
  const nextEmotion = applyFarmEmotionDelta(
    baseEmotion,
    actorId,
    socialReactionEmotionDelta(effectiveReaction, interested),
  );
  return {
    affinity: Math.min(MAX_AFFINITY, Math.max(0, memory.affinity + delta)),
    ...(memory.assignment ? { assignment: memory.assignment } : {}),
    ...(mood ? { mood } : {}),
    emotion: nextEmotion,
    ...(memory.episodes?.length ? { episodes: memory.episodes } : {}),
    ...(memory.playerFacts?.length ? { playerFacts: memory.playerFacts } : {}),
    ...(memory.peerImpressions && Object.keys(memory.peerImpressions).length ? { peerImpressions: memory.peerImpressions } : {}),
    ...(memory.reflections?.length ? { reflections: memory.reflections } : {}),
    turns: [...turns, sanitizedTurn].slice(-MAX_TURNS),
  };
}

export function isFarmChatContinuation(text: string): boolean {
  return /^(?:(?:接着|继续)(?:聊(?:聊)?)?(?:上次|之前|刚才)(?:的?话题)?(?:聊(?:聊)?)?|(?:还)?记得(?:我们)?(?:上次|之前|刚才)(?:聊|说)(?:过)?(?:的|了)?(?:什么|吗)?)$/.test(normalized(text));
}

function topicTerms(text: string): Set<string> {
  const value = text.normalize('NFKC').toLowerCase();
  const terms = new Set(value.match(/[a-z0-9]{2,}/g) ?? []);
  for (const run of value.match(/\p{Script=Han}+/gu) ?? []) {
    for (let index = 0; index < run.length - 1; index += 1) {
      const term = run.slice(index, index + 2);
      if (!/^(?:你们|我们|这个|那个|之前|上次|刚才|喜欢|什么|怎么|可以|知道|觉得|想要|最近|今天|一下|说说|聊聊)$/.test(term)) terms.add(term);
    }
  }
  return terms;
}

export function relevantFarmTurns(memory: ResidentMemory, text: string): FarmChatTurn[] {
  const topics = memory.turns.filter(turn => !turn.unavailable && !isFarmChatContinuation(turn.player));
  if (isFarmChatContinuation(text)) return topics.slice(-1);
  const terms = topicTerms(text);
  return topics.map(turn => ({
    turn,
    score: [...topicTerms(turn.player)].filter(term => terms.has(term)).length * 2 +
      [...topicTerms(turn.reply)].filter(term => terms.has(term)).length,
  })).reverse().filter(entry => entry.score > 0).sort((a, b) => b.score - a.score).slice(0, 2).map(entry => entry.turn);
}

export function farmChatContext(memory: ResidentMemory, text: string): FarmChatTurn[] {
  const included = new Set([...memory.turns.filter(turn => !turn.unavailable).slice(-4), ...relevantFarmTurns(memory, text)]);
  return memory.turns.filter(turn => !turn.unavailable && included.has(turn));
}

const RECALL_PROMPTS: Record<ResidentId, string> = {
  door: '你现在有什么新想法？我们可以顺着往下聊。',
  gu: '你慢慢说，我给你倒杯茶。',
  xiaoba: '我还记得。你想从哪儿接着说？',
  yujie: '这话题我可还记得。说吧，后来呢？',
  weigang: '嗯，我还记得一点。我们接着聊吧？',
  chicken: '咕，我记得！我蹲在这儿听。',
};

export function offlineFarmRecall(who: ResidentId, memory: ResidentMemory, text: string): string | null {
  const previous = relevantFarmTurns(memory, text)[0];
  if (!previous) return isFarmChatContinuation(text) ? '我们还没留下什么话题。今天你想聊点什么？' : null;
  const snippet = previous.player.length > 36 ? previous.player.slice(0, 36) + '…' : previous.player;
  return `上次你说「${snippet}」。${RECALL_PROMPTS[who]}`;
}

const TOPIC_TERMS: Record<FarmTopicId, RegExp> = {
  games: /游戏|关卡|联机|像素地图/,
  fishing: /钓鱼|钓位|浮漂|鱼竿|鱼线/,
  music: /唱歌|音乐|练歌|汪苏泷|副歌/,
  books: /小说|仙侠|故事|写作/,
  math: /数学|解题|几何|方程|递推/,
  tech: /电脑|编程|程序|代码|人工智能/,
  garden: /种菜|养花|播种|浇水|种蓝莓|花盆/,
  pets: /宠物|小动物|养猫|养狗|鸡窝|坤坤/,
};

export function publicFarmTopic(text: string): FarmTopicId | undefined {
  if (/阿[绿綠]|私事|秘密|保密|(?:别|不要|不许).{0,8}(?:说|提|告诉)|隐私|前任|分手|密码|住址|电话|生病|诊断/.test(text)) return;
  return (Object.keys(TOPIC_TERMS) as FarmTopicId[]).find(topic => TOPIC_TERMS[topic].test(text));
}

export function residentPublicTopics(memories: FarmMemories) {
  return Object.fromEntries(RESIDENT_IDS.map(id => {
    const topics = new Set<FarmTopicId>();
    for (const turn of memories[id].turns.slice().reverse()) {
      if (turn.unavailable) continue;
      const topic = publicFarmTopic(turn.player);
      if (topic) topics.add(topic);
      if (topics.size >= 3) break;
    }
    return [id, [...topics]];
  })) as Record<ResidentId, FarmTopicId[]>;
}

export function heardFarmTopic(history: readonly ResidentConversation[], who: ResidentId, text: string): SharedFarmTopic | undefined {
  const topic = publicFarmTopic(text);
  if (!topic) return;
  return history.findLast(record => record.sharedTopic?.topic === topic &&
    record.sharedTopic.from !== who && record.participants.includes(who))?.sharedTopic;
}

export function familyTopicRecall(shared: SharedFarmTopic): string {
  return `${RESIDENTS[shared.from].name}提过，你们聊到过${FARM_TOPICS[shared.topic].label}。`;
}
