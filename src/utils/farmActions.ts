import { isResidentId, RESIDENTS, RESIDENT_IDS, type ResidentId } from './farmLife';
import { SOCIAL_REACTIONS, type SocialReaction } from './farmMemory';
export const FARM_LOCATIONS = ['pond', 'farm', 'plaza', 'house', 'coop', 'bench', 'market'] as const;
export type FarmLocation = typeof FARM_LOCATIONS[number];
export type FarmDiscussionAction = { type: 'discuss'; question: string; guests: ResidentId[] };
export type NpcAction = FarmDiscussionAction | {
  type: 'fetch_water' | 'water_crops' | 'rest' | 'go_home';
} | {
  type: 'talk_to';
  target: ResidentId;
  purpose?: string;
} | {
  type: 'visit';
  target: FarmLocation;
};
export function validateNpcAction(raw: unknown): NpcAction | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const v = raw as Record<string, unknown>;
  if (v.type === 'discuss' && Object.keys(v).every(k => ['type', 'question', 'guests'].includes(k)) &&
      typeof v.question === 'string' && v.question.trim().length >= 2 && v.question.length <= 160 &&
      Array.isArray(v.guests) && v.guests.length <= 2 && v.guests.every(isResidentId) && new Set(v.guests).size === v.guests.length) {
    return { type: 'discuss', question: v.question.trim(), guests: v.guests };
  }
  if (v.type === 'talk_to' && isResidentId(v.target) && Object.keys(v).every(k => ['type', 'target', 'purpose'].includes(k)) &&
      (v.purpose === undefined || typeof v.purpose === 'string' && v.purpose.trim().length >= 2 && v.purpose.length <= 160)) return {
    type: 'talk_to', target: v.target, ...(typeof v.purpose === 'string' ? { purpose: v.purpose.trim() } : {}),
  };
  if (Object.keys(v).some(k => !['type', 'target'].includes(k))) return null;
  if (['fetch_water', 'water_crops', 'rest', 'go_home'].includes(v.type as string) && Object.keys(v).length === 1) return {
    type: v.type as 'fetch_water' | 'water_crops' | 'rest' | 'go_home'
  };
  if (v.type === 'talk_to' && isResidentId(v.target)) return {
    type: 'talk_to',
    target: v.target
  };
  if (v.type === 'visit' && FARM_LOCATIONS.includes(v.target as FarmLocation)) return {
    type: 'visit',
    target: v.target as FarmLocation
  };
  return null;
}
export function parseNpcReply(raw: string, social = false): {
  reply: string;
  action: NpcAction | null;
  reaction?: SocialReaction;
} | null {
  try {
    const v = JSON.parse(raw);
    if (!v || typeof v !== 'object' || Array.isArray(v) || Object.keys(v).some(k => !['reply', 'action', ...(social ? ['reaction'] : [])].includes(k)) || typeof v.reply !== 'string' || !v.reply.trim() || v.reply.length > 240 || !('action' in v)) return null;
    if (v.reaction !== undefined && !SOCIAL_REACTIONS.includes(v.reaction)) return null;
    const reaction = v.reaction === undefined ? {} : { reaction: v.reaction as SocialReaction };
    if (v.action === null || v.action?.type === 'none' && Object.keys(v.action).length === 1) return {
      reply: v.reply.trim(),
      action: null,
      ...reaction,
    };
    const action = validateNpcAction(v.action);
    return action ? {
      reply: v.reply.trim(),
      action,
      ...reaction,
    } : null;
  } catch {
    return null;
  }
}
export const DISCUSSION_PROMPT = '请家人一起讨论：';
const mentionsResident = (text: string, id: ResidentId) => text.includes(RESIDENTS[id].name) || (id === 'weigang' && /唯纲|伟刚|伟纲/.test(text));

/** Keep the player's actual instruction, never a model-invented reason. */
export function bindTalkPurpose(action: NpcAction, text: string, previous: readonly { player: string }[] = []): NpcAction {
  if (action.type !== 'talk_to') return action;
  if (/(?:聊聊天|聊聊|聊天|说说话)[吧呀啊。！!\s]*$/.test(text) && !/关于|有关|这件事|为什么|怎么|几点|什么时候|骂|欺负|问|转告|告诉/.test(text)) return { type: 'talk_to', target: action.target };
  const prior = previous.at(-1)?.player;
  const needsContext = !/骂|欺负/.test(text) && /质问|这件事|刚才|为什么|问清|[他她]/.test(text);
  const context = needsContext && prior ? prior.slice(0, 60) + '；' : '';
  return { type: 'talk_to', target: action.target, purpose: context ? context.slice(0, 40) + text.slice(-120) : text.slice(-160) };
}

export function playerTalkCommand(text: string, who: ResidentId, previous: readonly { player: string }[] = []): NpcAction | null {
  const direct = localNpcCommand(text, who);
  if (direct) return bindTalkPurpose(direct, text, previous);
  // Resolve "go ask him about it" only from an unambiguous, recent player statement.
  if (!/^(?:请|麻烦|帮我|你|替我|去|能不能)/.test(text) || !/(?:(?:质问|问问|问清|转告|告诉|带话|劝|安慰)(?:一下)?[他她]|找[他她].{0,8}(?:问|聊|说))/.test(text) || /不要|不用|别|不需要|如果|假如/.test(text)) return null;
  const prior = previous.at(-1)?.player ?? '';
  const targets = RESIDENT_IDS.filter(id => id !== who && mentionsResident(prior, id));
  return targets.length === 1 ? bindTalkPurpose({ type: 'talk_to', target: targets[0] }, text, previous) : null;
}

/** An invitation must be explicit, and guest names only count in the invitation. */
export function playerDiscussionCommand(text: string, who: ResidentId): FarmDiscussionAction | null {
  const invitation = /^(?:(?:请|麻烦|帮我|你能不能|能不能|你可以|可以)\s*)*(?:把|找|喊|叫|约|邀请|让|请)[^：:\n]{0,24}?(?:一起|过来|来)[^：:\n]{0,12}?(?:讨论|分析|想想|聊聊|商量)/.exec(text)?.[0];
  if (!invitation || /不要|不用|别|不需要|假如|如果/.test(invitation)) return null;
  const question = text.slice(invitation.length).replace(/^(?:一下)?[：:，,\s]*/, '').trim();
  if (/^(?:这件事|这个问题|一下|吧)[。！？?!]?$/.test(question)) return null;
  const guests = RESIDENT_IDS.filter(id => id !== who &&
    (id === 'gu' ? /顾(?:和|跟|、|，|一起|过来|来|也|$)/.test(invitation) : mentionsResident(invitation, id)));
  const action = validateNpcAction({ type: 'discuss', question, guests });
  return action?.type === 'discuss' ? action : null;
}
/** Explicit local commands only. Never run this on malformed model output. */
export function localNpcCommand(text: string, who: ResidentId): NpcAction | null {
  if (/^(?:如果|假如|要是|他说|她说|[“「"'])/.test(text.trim()) || /(?:不要|不用|别|不需要)(?:你|帮我|去|找|让|叫|替我|质问|问|告诉|转告|打|浇|回|休息)/.test(text)) return null;
  const discussion = playerDiscussionCommand(text, who);
  if (discussion) return discussion;
  if (/怎么|如何|如果|假如|要是|会.*吗/.test(text) && !/帮|请|麻烦|(?:你|替我|去).*(?:问|质问|转告|告诉)/.test(text)) return null;
  // A request ABOUT watering is a conversation, not an instruction to water.
  if (/找.*聊|和.*聊|跟.*说|(?:去|帮我|请|麻烦|让|替我).*(?:问|质问|询问|转告|告诉|带话|传话|解释|劝|安慰)|(?:质问|转告|告诉|问问|询问)/.test(text)) {
    const clause = text.match(/(?:去找|去问|去质问|帮我问|替我问|问问|问一下|质问|询问|转告|告诉|找|跟|和)(.*)/)?.[1] ?? text;
    const target = RESIDENT_IDS.filter(id => id !== who && (mentionsResident(clause, id) || clause.includes(id))).sort((a, b) => {
      const position = (id: ResidentId) => Math.min(...[RESIDENTS[id].name, id, ...(id === 'weigang' ? ['伟刚', '伟纲', '唯纲'] : [])].map(name => clause.indexOf(name)).filter(index => index >= 0));
      return position(a) - position(b);
    })[0];
    if (target) return bindTalkPurpose({ type: 'talk_to', target }, text);
  }
  if (/打[点些一壶]*水|取水|装[点些满]*水/.test(text)) return {
    type: 'fetch_water'
  };
  if (/浇[一下点些水地菜苗田]|帮.*浇/.test(text)) return {
    type: 'water_crops'
  };
  if (/回家|回屋|回小屋|回鸡窝/.test(text)) return {
    type: 'go_home'
  };
  if (/休息|歇[会一]/.test(text)) return {
    type: 'rest'
  };
  if (/去|到|逛|看看/.test(text)) {
    for (const [word, target] of [['池塘', 'pond'], ['池边', 'pond'], ['田边', 'farm'], ['农田', 'farm'], ['广场', 'plaza'], ['小屋', 'house'], ['鸡窝', 'coop'], ['长椅', 'bench'], ['小铺', 'market'], ['集市', 'market']] as const) if (text.includes(word)) return {
      type: 'visit',
      target
    };
  }
  return null;
}
const BASE_NPC_ACTION_SCHEMA = '严格 JSON：{"reply":"自然的中文回答，最多100字","action":null}。明确要求做事时 action 只能是 {"type":"fetch_water"}、{"type":"water_crops"}、{"type":"talk_to","target":"door|gu|xiaoba|yujie|weigang|chicken中的一个"}、{"type":"visit","target":"pond|farm|plaza|house|coop|bench|market中的一个"}、{"type":"rest"}、{"type":"go_home"}。普通聊天或提问 action=null；不要把引用、否定或假设当作命令。不能修改金币、库存、种子、奖励或升级，不能保证任务必然成功，游戏会校验并执行。不得增加其他字段。';

export const NPC_ACTION_SCHEMA = BASE_NPC_ACTION_SCHEMA + ' 找人询问时talk_to必须额外带purpose字符串，最多160字，准确总结玩家明确交代的问题并消解代词，不能编造新目的。如果目标或问题不明，action=null并追问缺少的信息。纯闲聊可以不带purpose。';
