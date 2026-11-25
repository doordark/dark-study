import { farmChat, FarmChatError } from '@/services/farmChat';
import { FARM_FAMILY_CONTEXT, RESIDENTS, isResidentId, type ResidentConversation, type ResidentId } from './farmLife';
import { PERSONALITIES, pairDynamicContext } from './farmPersonality';
import { SOCIAL_REACTIONS, localSocialReaction, type FarmMemories, type SocialReaction } from './farmMemory';
import { localNpcCommand, type NpcAction } from './farmActions';
import {
  formatPersonaMemoryBlock,
  isSensitiveFarmText,
  readConversationMemoryNote,
  retrievePersonaMemories,
  type NpcConversationMemoryNote,
} from './farmPersonaMemory';
import { describeFarmWeather, PERIOD_LABELS, type FarmPeriod, type FarmWeather } from './farmTown';

export interface FarmGroupMessage {
  id: string;
  speaker: 'player' | ResidentId;
  text: string;
  mood?: string;
  at: number;
}

export interface GroupReplyLine {
  speaker: ResidentId;
  text: string;
  mood?: string;
}

export interface GroupTurnResult {
  lines: GroupReplyLine[];
  reaction: SocialReaction;
  memory?: NpcConversationMemoryNote;
  online: boolean;
  hint?: string;
}

const MEMBER_MENTION_PATTERNS: Record<ResidentId, RegExp> = {
  door: /door|爸爸|老爸|(?<![a-zA-Z])爸(?=[，,。！？!\s你呢呀啊嘛]|$)/i,
  gu: /妈妈|老妈|顾|妈(?=[，,。！？!\s你呢呀啊嘛]|$)/,
  xiaoba: /小八|大哥|老大/,
  yujie: /玉洁|二哥|校草/,
  weigang: /唯刚|伟刚|伟纲|唯纲|小弟|钓鱼佬/,
  chicken: /坤坤|小鸡|鸡窝/,
};

export function mentionedGroupMembers(text: string, members: readonly ResidentId[]): ResidentId[] {
  if (!text.trim()) return [];
  const hits: { id: ResidentId; index: number }[] = [];
  for (const id of members) {
    const match = MEMBER_MENTION_PATTERNS[id].exec(text);
    if (match) hits.push({ id, index: match.index });
  }
  return hits.sort((a, b) => a.index - b.index).map(h => h.id);
}

/**
 * 参考 SillyTavern Natural Order & mitnichiter/llmcr 的动态自然发言调度：
 * 点名优先 > 话题兴趣 & 人格记忆关联 > 角色话痨度 > 防刷屏衰减。
 */
export function selectGroupResponders(
  text: string,
  members: readonly ResidentId[],
  memories: FarmMemories,
  recentMessages: readonly FarmGroupMessage[],
  at: number,
  maxResponders?: number,
): ResidentId[] {
  const unique = [...new Set(members)];
  if (!unique.length) return [];
  const targetCount = Math.min(unique.length, maxResponders ?? (unique.length <= 2 ? unique.length : 3));
  const mentioned = mentionedGroupMembers(text, unique);
  const recentSpeakers = recentMessages.slice(-3).filter(m => m.speaker !== 'player').map(m => m.speaker as ResidentId);
  const lastSpeaker = recentSpeakers.at(-1);

  const scored = unique.map(id => {
    const p = PERSONALITIES[id];
    const mem = memories[id];
    let score = (p?.talkativeness ?? 0.5) * 1.4;

    const mentionPos = mentioned.indexOf(id);
    if (mentionPos >= 0) {
      score += 4.5 - mentionPos * 0.4;
    }

    if (text.trim()) {
      if (p?.interests.some(word => text.includes(word))) score += 1.5;
      const recalled = retrievePersonaMemories(mem, text, ['player', ...unique.filter(m => m !== id)], at, {
        includePrivate: false,
        limit: 2,
      });
      if (recalled.length) score += 0.9;
    }

    if (mem?.mood === '开心') score += 0.35;
    if ((mem?.mood === '生气' || mem?.mood === '不悦') && mentionPos < 0) score -= 0.3;

    // Anti-monopoly decay: avoid the exact same person dominating every single turn
    if (id === lastSpeaker && mentionPos < 0) score -= 0.85;
    else if (recentSpeakers.includes(id) && mentionPos < 0) score -= 0.35;

    // Gentle deterministic tie-breaker based on time & resident index so banter rotates naturally
    const jitter = ((Math.floor(at / 1000) + unique.indexOf(id) * 7) % 11) * 0.03;
    return { id, score: score + jitter };
  });

  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, targetCount).map(item => item.id);
}

export function parseGroupChatReply(raw: string, members: readonly ResidentId[]): {
  lines: GroupReplyLine[];
  reaction: SocialReaction;
  memory?: NpcConversationMemoryNote;
} | null {
  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
    if (!Array.isArray(parsed.lines) || !parsed.lines.length || parsed.lines.length > 6) return null;
    const lines: GroupReplyLine[] = [];
    for (let i = 0; i < parsed.lines.length; i++) {
      const item = parsed.lines[i];
      if (!item || typeof item !== 'object' || Array.isArray(item)) return null;
      const speaker = item.speaker;
      const text = typeof item.text === 'string' ? item.text.trim() : '';
      if (!isResidentId(speaker) || !members.includes(speaker) || !text || text.length > 180) return null;
      if (i > 0 && lines[i - 1].speaker === speaker) return null;
      const mood = typeof item.mood === 'string' && item.mood.trim() ? item.mood.trim().slice(0, 12) : undefined;
      lines.push({ speaker, text, ...(mood ? { mood } : {}) });
    }
    const reaction: SocialReaction = SOCIAL_REACTIONS.includes(parsed.reaction) ? parsed.reaction : 'neutral';
    const memory = parsed.memory ? readConversationMemoryNote(parsed.memory) : undefined;
    return { lines, reaction, ...(memory ? { memory } : {}) };
  } catch {
    return null;
  }
}

export function buildGroupChatMessages(options: {
  text: string;
  members: readonly ResidentId[];
  responders: readonly ResidentId[];
  memories: FarmMemories;
  recentMessages: readonly FarmGroupMessage[];
  scene: {
    day: number;
    season: string;
    growing: number;
    ripe: number;
    night: boolean;
    weather?: FarmWeather;
    rainbow?: boolean;
    period?: FarmPeriod;
  };
  studyBrief?: string;
  sleepDeprivedNote?: string;
  at: number;
  banterOnly?: boolean;
}) {
  const { text, members, responders, memories, recentMessages, scene, studyBrief, sleepDeprivedNote, at, banterOnly } = options;
  const profiles = members.map(id => {
    const p = PERSONALITIES[id];
    const mem = memories[id];
    const brief = formatPersonaMemoryBlock(id, mem, {
      query: text || recentMessages.slice(-3).map(m => m.text).join(' '),
      peers: ['player', ...members.filter(m => m !== id)],
      at,
      includePrivate: false,
      includePlayerTurns: false,
      maxEpisodes: 3,
    });
    return `【${RESIDENTS[id].name}（id:${id}，${RESIDENTS[id].identity}）】` +
      `性格：${RESIDENTS[id].persona} 说话风格：${p.speechStyle} 避免：${p.antiPatterns} ` +
      `与客人好感：${mem.affinity}/100，当前心情：${mem.mood ?? '平静'}。` +
      (brief ? `\n  记忆：${brief.replace(/\n/g, ' | ')}` : '');
  }).join('\n');

  const mentioned = mentionedGroupMembers(text, members);
  const targetLines = members.length <= 2 ? '2～3' : '2～5';
  const responderHint = responders.map(id => RESIDENTS[id].name).join('、');
  const transcript = recentMessages.slice(-14).map(m =>
    `${m.speaker === 'player' ? '客人' : RESIDENTS[m.speaker].name}：${m.text}`,
  ).join('\n');

  const periodNow: FarmPeriod = scene.period ?? (scene.night ? 'night' : 'noon');
  const weatherInfo = describeFarmWeather(scene.weather ?? 'clear', scene.rainbow === true, periodNow);
  const system = `你是像素农场「doordoor农场」家庭群聊的多角色对话导演，用鲜活自然的中文口语写出一家人真实接话与拌嘴的场景。
${FARM_FAMILY_CONTEXT}
${pairDynamicContext(members)}
当前在场成员（只能由以下 ID 发言）：${members.join('、')}。不在场的家人此刻听不到这段聊天，不要替不在场的人发言。
${profiles}
当前农场：第 ${scene.day} 天（${scene.season}，${PERIOD_LABELS[periodNow]}），实时天气：${weatherInfo.label}（${weatherInfo.promptText}），田里 ${scene.growing} 株在长，${scene.ripe} 株可收。${studyBrief ? `\n现实学习节奏轻感知（自然关怀即可，切勿说教）：${studyBrief}` : ''}${sleepDeprivedNote ? `\n昨夜全员突发事件：${sleepDeprivedNote}` : ''}

群聊核心规则：
1. 像真的一家人围坐聊天：先由最相关/被点名的人接住话头，其他人顺着刚说出的细节插嘴、吐槽、补刀、打趣或唱反调；严禁轮流念稿、严禁心理咨询师式端水、严禁每轮总结升华。
2. 声线必须鲜明区分：玉洁嘴快毒舌又护短、唯刚慢热爱分析、小八话少稳重、顾暖心俏皮、door 从容爱打比方、坤坤短句带“咕”且听懂人话。
3. 本轮建议主要发言成员：${responderHint}${mentioned.length ? `（客人刚点名了 ${mentioned.map(id => RESIDENTS[id].name).join('、')}，请优先回应）` : ''}。
4. 共写 ${targetLines} 句，不能连续两句同一人说，每句 8～110 字（上限 180 字），不加引号和旁白。
5. 私密边界：不泄露未提起的私人往事（如小八的私事）；若客人冒犯某人，当事人与护短的家人应按性格立住边界。
6. 严格输出 JSON：{"lines":[{"speaker":"成员ID","text":"口语发言","mood":"可选，如开心/吐槽/认真/害羞/不悦"}],"reaction":"neutral|warm|teasing|insult|apology","memory":{"summary":"一句话记下这轮群聊最值得记住的事，最多80字","importance":1到10整数,"impressions":{"说话人id->对象id":"可选，对另一位在场家人的新印象"}}}。普通闲聊可省略 memory。`;

  const user = banterOnly
    ? (transcript
      ? `群聊近期记录：\n${transcript}\n\n（客人暂时没插话，请让在场家人顺着上面的话题自然再聊 2～4 句，可以互相打趣、追问或抛出小脑洞。）`
      : '一家人刚聚在院子里，客人还没开口，请自然聊 2～3 句开场。')
    : (transcript
      ? `群聊近期记录：\n${transcript}\n\n客人刚刚说：${text}`
      : `客人刚刚在家庭群聊说：${text}`);

  return [
    { role: 'system' as const, content: system },
    { role: 'user' as const, content: user },
  ];
}

function offlineLineFor(
  speaker: ResidentId,
  text: string,
  prev: GroupReplyLine | undefined,
  memories: FarmMemories,
  at: number,
): GroupReplyLine {
  const recalled = retrievePersonaMemories(memories[speaker], text, ['player'], at, { includePrivate: false, limit: 1 })[0];
  const prevName = prev ? RESIDENTS[prev.speaker].name : '';
  const hasTopic = PERSONALITIES[speaker]?.interests.some(w => text.includes(w));

  if (!prev) {
    if (recalled && text.trim()) {
      const hint = recalled.text.slice(0, 32);
      const opener: Record<ResidentId, string> = {
        door: `你这一提我倒想起前阵子的事了（${hint}），正好一块聊聊。`,
        gu: `听你这么说我也想起之前那回（${hint}），今天怎么又惦记上了？`,
        xiaoba: `嗯，我记得类似的事，你继续说，我们在听。`,
        yujie: `哟，这话题熟悉啊，上次是不是刚聊过类似的？展开讲讲呗。`,
        weigang: `嗯……这个我有点印象，你具体是怎么想的呀？`,
        chicken: `咕！这个词坤坤听着耳熟，快再多说两句！`,
      };
      return { speaker, text: opener[speaker], mood: '认真' };
    }
    if (hasTopic) {
      const excited: Record<ResidentId, string> = {
        door: '这个话题正好撞我枪口上了，聊聊看你的思路？',
        gu: '说到这个我可有精神了，家里正好也能顺手试一试。',
        xiaoba: '这个挺有意思的，我也一直在琢磨。',
        yujie: '哎，这个我最有发言权了，听我先说两句！',
        weigang: '嗯……聊到这个的话，我前两天刚好仔细琢磨过。',
        chicken: '咕咕！坤坤举起小翅膀，这个我也懂一点点！',
      };
      return { speaker, text: excited[speaker], mood: '开心' };
    }
    const opener: Record<ResidentId, string> = {
      door: text.trim() ? '这事听着挺有意思，大伙儿一块出出主意吧。' : '难得一家人都在，今天大伙儿手头都忙得差不多了吧？',
      gu: text.trim() ? '来来来，坐下慢慢说，我也听听大家怎么看。' : '锅里汤还温着呢，正好凑一块儿歇口气聊聊天。',
      xiaoba: text.trim() ? '我先听着，有想法了就插一句。' : '风挺舒服的，难得院子里这么清净。',
      yujie: text.trim() ? '让我来听听，今天又是啥新鲜事儿？' : '好家伙，全员到齐啊，今天谁先起个话头？',
      weigang: text.trim() ? '嗯……我在听呢，大家先说。' : '嗯，池边风有点大，我也过来和大家坐一会儿。',
      chicken: text.trim() ? '咕！坤坤也挤进小板凳旁边听着呢！' : '咕咕，大家都在这里，坤坤最喜欢热闹啦！',
    };
    return { speaker, text: opener[speaker], mood: '平静' };
  }

  // Follow-up banter reacting to the previous speaker
  const followups: Record<ResidentId, string[]> = {
    door: [`${prevName}说得在理，不过真要落到实处还得留点余地。`, `哈哈，你们先聊，我顺手把刚才那个点记心里了。`],
    gu: [`${prevName}别光顾着说，也听听客人真正想要什么呀。`, `听你们你一言我一语的，院子里一下子热闹起来了。`],
    xiaoba: [`嗯，我同意${prevName}一半，剩下一半还可以换个角度试。`, `说起来，刚才那点确实挺值得多想一下。`],
    yujie: [`切，${prevName}这话说得也太稳妥了吧，就不能整点有意思的？`, `行吧，这回算${prevName}说中了，我先不抬杠。`],
    weigang: [`嗯……顺着${prevName}的话想，我觉得换个条件可能结果不一样。`, `那个……我也是这么想的，只是刚才没抢上话。`],
    chicken: [`咕！${prevName}说得对，不过待会儿别忘了给坤坤留把米！`, `咕咕，你们聊得这么起劲，坤坤听得一愣一愣的！`],
  };
  const bank = followups[speaker];
  return { speaker, text: bank[Math.floor(at / 1000) % bank.length], mood: '热闹' };
}

export function offlineGroupChatReply(
  text: string,
  members: readonly ResidentId[],
  memories: FarmMemories,
  recentMessages: readonly FarmGroupMessage[],
  at: number,
  banterOnly = false,
): GroupTurnResult {
  const reaction = banterOnly ? 'neutral' : localSocialReaction(text);
  const responders = selectGroupResponders(text, members, memories, recentMessages, at, members.length <= 2 ? 2 : 3);

  if (!banterOnly && (reaction === 'insult' || reaction === 'teasing')) {
    const lead = responders[0] ?? members[0];
    const backup = responders[1];
    const lines: GroupReplyLine[] = [
      {
        speaker: lead,
        text: lead === 'chicken' ? '咕……这么说话坤坤要躲到大家后面去了。' : '这话有点过了吧，在家里聊天还是互相尊重些。',
        mood: '不悦',
      },
      ...(backup ? [{
        speaker: backup,
        text: backup === 'yujie' ? '就是，好好聊天行不行，别上来就呛人。' : backup === 'gu' ? '大家本来高高兴兴聚一起的，有话咱们好好说。' : '先冷静一下吧，好好说话我们才接着聊。',
        mood: '护短',
      }] : []),
    ];
    return { lines, reaction, online: false };
  }

  const lines: GroupReplyLine[] = [];
  for (const speaker of responders) {
    lines.push(offlineLineFor(speaker, text, lines.at(-1), memories, at + lines.length * 1000));
  }
  return { lines, reaction, online: false };
}

export function seedGroupMessagesFromRecord(record: ResidentConversation): FarmGroupMessage[] {
  return record.lines.slice(-12).map((line, i) => ({
    id: `seed-${record.id}-${i}`,
    speaker: line.speaker,
    text: line.text,
    at: line.at,
  }));
}

export interface PersistedGroupChat {
  members: ResidentId[];
  messages: FarmGroupMessage[];
}

export function restoreGroupChatState(raw: unknown): PersistedGroupChat {
  const defaults: PersistedGroupChat = { members: ['door', 'gu', 'xiaoba', 'yujie'], messages: [] };
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return defaults;
  const obj = raw as Record<string, unknown>;
  const members = Array.isArray(obj.members)
    ? [...new Set(obj.members.filter(isResidentId))].slice(0, 6)
    : [];
  const messages: FarmGroupMessage[] = Array.isArray(obj.messages)
    ? obj.messages.slice(-30).flatMap(entry => {
        if (!entry || typeof entry !== 'object' || Array.isArray(entry)) return [];
        const item = entry as Record<string, unknown>;
        const id = typeof item.id === 'string' && item.id ? item.id.slice(0, 100) : '';
        const speaker = item.speaker === 'player' || isResidentId(item.speaker) ? item.speaker : null;
        const text = typeof item.text === 'string' ? item.text.trim().slice(0, 220) : '';
        const at = typeof item.at === 'number' && Number.isFinite(item.at) ? Math.max(0, Math.round(item.at)) : 0;
        const mood = typeof item.mood === 'string' && item.mood.trim() ? item.mood.trim().slice(0, 12) : undefined;
        return id && speaker && text ? [{ id, speaker, text, ...(mood ? { mood } : {}), at }] : [];
      })
    : [];
  return {
    members: members.length >= 2 ? members : defaults.members,
    messages,
  };
}

/** 识别群聊里对某位在场成员的显式派活/找人转述指令（如「@顾 帮我浇下水」「@小八 去问问唯刚今晚几点回」）。 */
export function extractGroupAction(
  text: string,
  members: readonly ResidentId[],
): { actor: ResidentId; action: NpcAction } | null {
  const clean = text.trim();
  if (!clean) return null;
  const mentioned = mentionedGroupMembers(clean, members);
  if (!mentioned.length) return null;
  const actor = mentioned[0];
  // Strip leading @name / name address prefix so localNpcCommand parses the pure command cleanly
  const withoutAt = clean
    .replace(new RegExp(`^@?(?:${RESIDENTS[actor].name}|${actor}|爸爸|老爸|爸|妈妈|老妈|妈|大哥|二哥|小弟|伟刚|伟纲|唯纲)[，,：:\\s]*`, 'i'), '')
    .trim();
  if (!withoutAt) return null;
  const action = localNpcCommand(withoutAt, actor);
  if (!action || action.type === 'discuss') return null;
  // In group chat, only allow talk_to if targeting someone NOT already in the group (or explicit relay with purpose)
  if (action.type === 'talk_to' && members.includes(action.target) && !action.purpose) return null;
  return { actor, action };
}

export async function runFarmGroupTurn(options: {
  text: string;
  members: readonly ResidentId[];
  memories: FarmMemories;
  recentMessages: readonly FarmGroupMessage[];
  scene: {
    day: number;
    season: string;
    growing: number;
    ripe: number;
    night: boolean;
    weather?: FarmWeather;
    rainbow?: boolean;
    period?: FarmPeriod;
  };
  studyBrief?: string;
  sleepDeprivedNote?: string;
  apiKey: string;
  signal: AbortSignal;
  at: number;
  banterOnly?: boolean;
}): Promise<GroupTurnResult> {
  const { text, members, memories, recentMessages, scene, studyBrief, sleepDeprivedNote, apiKey, signal, at, banterOnly = false } = options;
  const cleanText = banterOnly ? '' : text.trim();
  const localReaction = banterOnly ? 'neutral' : localSocialReaction(cleanText);

  if (!banterOnly && (localReaction === 'insult' || localReaction === 'teasing')) {
    return { ...offlineGroupChatReply(cleanText, members, memories, recentMessages, at, false), hint: '已触发边界保护' };
  }

  // Never leak private secrets like 阿绿 in group chat
  if (!banterOnly && isSensitiveFarmText(cleanText) && /阿[绿綠]/.test(cleanText)) {
    const lead = members.includes('xiaoba') ? 'xiaoba' : members[0];
    const lines: GroupReplyLine[] = [{
      speaker: lead,
      text: lead === 'xiaoba' ? '人这么多，私事就先别在群里聊了。' : '别人的私事，大家就别在群里打听啦。',
      mood: '平静',
    }];
    return { lines, reaction: 'neutral', online: false };
  }

  if (!apiKey) {
    return { ...offlineGroupChatReply(cleanText, members, memories, recentMessages, at, banterOnly), hint: '未配置 API Key，本轮使用本地群聊' };
  }

  const responders = selectGroupResponders(cleanText, members, memories, recentMessages, at);
  const messages = buildGroupChatMessages({
    text: cleanText,
    members,
    responders,
    memories,
    recentMessages,
    scene,
    studyBrief,
    sleepDeprivedNote,
    at,
    banterOnly,
  });

  try {
    const raw = await farmChat(messages, apiKey, {
      signal,
      priority: 'interactive',
      timeoutMs: 20000,
      maxTokens: 900,
      retries: 1,
      validate: candidate => parseGroupChatReply(candidate, members) !== null,
    });
    const parsed = parseGroupChatReply(raw, members);
    if (!parsed) throw new FarmChatError('群聊回复格式不完整');
    return { ...parsed, online: true };
  } catch (error) {
    if (signal.aborted) throw error;
    const reason = error instanceof FarmChatError ? error.message : '网络暂不可用';
    return {
      ...offlineGroupChatReply(cleanText, members, memories, recentMessages, at, banterOnly),
      hint: `${reason}，本轮使用本地群聊`,
    };
  }
}
