import { PERSONALITIES } from './farmPersonality';
import { FARM_TOPICS, RESIDENTS, RESIDENT_IDS, type FarmTopicId, type ResidentConversation, type ResidentId, type SharedFarmTopic } from './farmLife';

export const CONTINUE_FARM_CHAT = '接着上次聊';
const MAX_TURNS = 24;
const MAX_AFFINITY = 100;
export const SOCIAL_REACTIONS = ['neutral', 'warm', 'teasing', 'insult', 'apology'] as const;
export type SocialReaction = typeof SOCIAL_REACTIONS[number];
export const SOCIAL_MOODS = { warm: '开心', teasing: '不悦', insult: '生气', apology: '缓和' } as const;
type SocialMood = typeof SOCIAL_MOODS[keyof typeof SOCIAL_MOODS];

interface FarmChatTurn {
  id: string;
  player: string;
  reply: string;
}
export interface ResidentMemory {
  affinity: number;
  turns: FarmChatTurn[];
  mood?: SocialMood;
}
export type FarmMemories = Record<ResidentId, ResidentMemory>;

function object(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

export function restoreFarmMemories(raw?: unknown): FarmMemories {
  const value = object(raw);
  return Object.fromEntries(RESIDENT_IDS.map(id => {
    const record = object(value[id]);
    const turns = Array.isArray(record.turns) ? record.turns.slice(-MAX_TURNS).flatMap(entry => {
      const { id, player, reply } = object(entry);
      return typeof id === 'string' && id && typeof player === 'string' && player.trim() && typeof reply === 'string' && reply.trim()
        ? [{ id: id.slice(0, 100), player: player.trim().slice(0, 200), reply: reply.trim().slice(0, 240) }]
        : [];
    }) : [];
    const affinity = typeof record.affinity === 'number' && Number.isFinite(record.affinity)
      ? Math.min(MAX_AFFINITY, Math.max(0, Math.round(record.affinity))) : 0;
    const mood = Object.values(SOCIAL_MOODS).find(item => item === record.mood);
    return [id, { turns, affinity, ...(mood ? { mood } : {}) }];
  })) as FarmMemories;
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
  const topic = normalized(turn.player);
  if (!topic || memory.turns.some(previous => previous.id === turn.id)) return memory;
  const continuing = isFarmChatContinuation(turn.player);
  if (continuing && !memory.turns.some(previous => !isFarmChatContinuation(previous.player))) return memory;
  const last = memory.turns.at(-1);
  const turns = continuing && last && isFarmChatContinuation(last.player) ? memory.turns.slice(0, -1) : memory.turns;
  const repeated = continuing || memory.turns.some(previous => normalized(previous.player) === topic);
  const upset = memory.mood === '生气' || memory.mood === '不悦';
  const p = personalityId ? PERSONALITIES[personalityId] : undefined;
  const interested = p?.interests.some(topic => turn.player.includes(topic)) && turn.player.length >= 6;
  const delta = reaction === 'insult' ? -(p?.insultLoss ?? 8) : reaction === 'teasing' ? -(p?.teaseLoss ?? 4)
    : repeated ? 0 : reaction === 'apology' && upset ? (p?.apologyGain ?? 1) : reaction === 'warm' && !upset ? (p?.warmGain ?? 2) : reaction === 'neutral' && !upset && interested ? 1 : 0;
  const mood = reaction === 'neutral' || reaction === 'warm' && upset ? memory.mood : SOCIAL_MOODS[reaction];
  return {
    affinity: Math.min(MAX_AFFINITY, Math.max(0, memory.affinity + delta)),
    ...(mood ? { mood } : {}),
    turns: [...turns, turn].slice(-MAX_TURNS),
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
  const topics = memory.turns.filter(turn => !isFarmChatContinuation(turn.player));
  if (isFarmChatContinuation(text)) return topics.slice(-1);
  const terms = topicTerms(text);
  return topics.map(turn => ({
    turn,
    score: [...topicTerms(turn.player)].filter(term => terms.has(term)).length * 2 +
      [...topicTerms(turn.reply)].filter(term => terms.has(term)).length,
  })).reverse().filter(entry => entry.score > 0).sort((a, b) => b.score - a.score).slice(0, 2).map(entry => entry.turn);
}

export function farmChatContext(memory: ResidentMemory, text: string): FarmChatTurn[] {
  const included = new Set([...memory.turns.slice(-4), ...relevantFarmTurns(memory, text)]);
  return memory.turns.filter(turn => included.has(turn));
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
