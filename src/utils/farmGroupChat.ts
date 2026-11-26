import { farmChat, FarmChatError } from '@/services/farmChat';
import {
  extractJsonObjectText,
  FARM_REAL_GIFT_BOUNDARY,
  speakerAliasesFor,
  unwrapModelReplyText,
} from './farmReplyClean';
import { FARM_FAMILY_CONTEXT, RESIDENTS, isResidentId, type ResidentConversation, type ResidentId } from './farmLife';
import { FARM_NATURAL_VOICE_RULES, PERSONALITIES, pairDynamicContext } from './farmPersonality';
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
import { detectOpenAddressivity, resolveAddressedMember } from './farmDiscussion';

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
  door: /door|爸爸|老爸|孩他爸|(?<![a-zA-Z])爸(?=[，,。！？!？\s你呢呀啊嘛说看快来]|$)/i,
  gu: /妈妈|老妈|孩他妈|顾(?![着不上虑忌问全大客])|妈(?=[，,。！？!？\s你呢呀啊嘛说看快来]|$)/,
  xiaoba: /小八|大哥|老大|大儿子/,
  yujie: /玉洁|二哥|老二|二儿子|校草/,
  weigang: /唯刚|伟刚|伟纲|唯纲|小弟|三弟|老三|老幺|小儿子/,
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
 * 动态自然发言调度（融合 SillyTavern Natural Order + Addressivity 话轮指派）：
 * 被上文追问/点名优先 > 记忆关联 & 真相关话题 > 角色自然活跃度 > 防刷屏轮换。
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

  // If banterOnly (empty text) and the last message in transcript was an open question/challenge to an NPC, route to that NPC first!
  let openTargetFromHistory: ResidentId | undefined;
  if (!text.trim() && recentMessages.length > 0) {
    const lastMsg = recentMessages[recentMessages.length - 1];
    const prevMsg = recentMessages.length >= 2 ? recentMessages[recentMessages.length - 2] : undefined;
    if (lastMsg.speaker !== 'player') {
      const addr = detectOpenAddressivity(lastMsg.text, lastMsg.speaker, unique, prevMsg?.speaker);
      if (addr.isOpen && addr.addressee && unique.includes(addr.addressee)) {
        openTargetFromHistory = addr.addressee;
      }
    } else {
      const fromPlayer = resolveAddressedMember(lastMsg.text, 'player', unique);
      if (fromPlayer) openTargetFromHistory = fromPlayer;
    }
  }

  const recentSpeakers = recentMessages.slice(-3).filter(m => m.speaker !== 'player').map(m => m.speaker as ResidentId);
  const lastSpeaker = recentSpeakers.at(-1);

  const scored = unique.map(id => {
    const p = PERSONALITIES[id];
    const mem = memories[id];
    let score = (p?.talkativeness ?? 0.5) * 1.35;

    const mentionPos = mentioned.indexOf(id);
    if (mentionPos >= 0) {
      score += 4.8 - mentionPos * 0.4;
    } else if (openTargetFromHistory === id) {
      score += 4.5;
    }

    if (text.trim()) {
      // Only gently boost when the player genuinely talks about that topic
      if (p?.interests.some(word => word.length >= 2 && text.includes(word))) score += 0.9;
      const recalled = retrievePersonaMemories(mem, text, ['player', ...unique.filter(m => m !== id)], at, {
        includePrivate: false,
        limit: 2,
      });
      if (recalled.length) score += 0.85;
    }

    if (mem?.mood === '开心') score += 0.25;
    if ((mem?.mood === '生气' || mem?.mood === '不悦') && mentionPos < 0 && openTargetFromHistory !== id) score -= 0.2;

    // Anti-monopoly decay: avoid the exact same person dominating unless directly addressed
    if (id === lastSpeaker && mentionPos < 0 && openTargetFromHistory !== id) score -= 0.9;
    else if (recentSpeakers.includes(id) && mentionPos < 0 && openTargetFromHistory !== id) score -= 0.35;

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
    const parsed = JSON.parse(extractJsonObjectText(raw));
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
    if (!Array.isArray(parsed.lines) || !parsed.lines.length || parsed.lines.length > 8) return null;
    const lines: GroupReplyLine[] = [];
    for (let i = 0; i < parsed.lines.length; i++) {
      const item = parsed.lines[i];
      if (!item || typeof item !== 'object' || Array.isArray(item)) return null;
      const speaker = item.speaker;
      if (!isResidentId(speaker) || !members.includes(speaker) || typeof item.text !== 'string') return null;
      const cleanedText = unwrapModelReplyText(item.text, {
        speakerNames: [...speakerAliasesFor(speaker), RESIDENTS[speaker].name],
      });
      if (!cleanedText || cleanedText.length > 180) return null;
      if (lines.length > 0 && lines[lines.length - 1].speaker === speaker) return null;
      const mood = typeof item.mood === 'string' && item.mood.trim() ? item.mood.trim().slice(0, 12) : undefined;
      lines.push({ speaker, text: cleanedText, ...(mood ? { mood } : {}) });
    }
    if (!lines.length) return null;
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
      `性格：${RESIDENTS[id].persona} 说话风格：${p.speechStyle} 禁忌：${p.antiPatterns} ` +
      `与客人好感：${mem.affinity}/100，心情：${mem.mood ?? '平静'}。` +
      (brief ? `\n  相关记忆：${brief.replace(/\n/g, ' | ')}` : '');
  }).join('\n');

  const mentioned = mentionedGroupMembers(text, members);
  const targetLines = members.length <= 2 ? '3～4' : '3～5';
  const responderHint = responders.map(id => RESIDENTS[id].name).join('、');
  const transcript = recentMessages.slice(-14).map(m =>
    `${m.speaker === 'player' ? '客人' : RESIDENTS[m.speaker].name}：${unwrapModelReplyText(m.text) || m.text}`,
  ).join('\n');

  // Check if recentMessages ended on an unanswered NPC question when player clicked "让家人们自己聊两句"
  let pendingHistoryPrompt = '';
  if (banterOnly && recentMessages.length > 0) {
    const lastMsg = recentMessages[recentMessages.length - 1];
    const prevMsg = recentMessages.length >= 2 ? recentMessages[recentMessages.length - 2] : undefined;
    if (lastMsg.speaker !== 'player') {
      const openCheck = detectOpenAddressivity(lastMsg.text, lastMsg.speaker, members, prevMsg?.speaker);
      if (openCheck.isOpen) {
        const targetWho = openCheck.addressee && members.includes(openCheck.addressee)
          ? RESIDENTS[openCheck.addressee].name
          : '在场家人';
        pendingHistoryPrompt = `注意：上一句${RESIDENTS[lastMsg.speaker].name}刚抛出了追问「${lastMsg.text}」，第一句必须先由${targetWho}直接回应把话接住，绝不能晾在一边！`;
      }
    }
  }

  const periodNow: FarmPeriod = scene.period ?? (scene.night ? 'night' : 'noon');
  const weatherInfo = describeFarmWeather(scene.weather ?? 'clear', scene.rainbow === true, periodNow);
  const system = `你是像素农场「doordoor农场」家庭微信群/院子茶桌的多角色活人对话导演。请写出像真正中国一家人围坐唠嗑、互相接梗拌嘴一样的鲜活口语对话！
${FARM_FAMILY_CONTEXT}
${pairDynamicContext(members)}
${FARM_NATURAL_VOICE_RULES}
${FARM_REAL_GIFT_BOUNDARY}
当前在场成员（只能由以下 ID 发言）：${members.join('、')}。不在场的家人此刻听不到，不要替不在场的人发言。
${profiles}
当前环境（仅自然相关时顺嘴带过，勿每轮播报）：第 ${scene.day} 天（${scene.season} · ${PERIOD_LABELS[periodNow]}），${weatherInfo.label}（${weatherInfo.promptText}），田里 ${scene.growing} 株在长、${scene.ripe} 株可收。${studyBrief ? `\n现实学习轻感知（自然关心即可，勿说教）：${studyBrief}` : ''}${sleepDeprivedNote ? `\n昨夜全员突发状况：${sleepDeprivedNote}` : ''}

群聊导演铁律：
1. 【玩家话头绝对优先】客人刚说话时，第 1 条回复必须正面直击客人这句话的真实意思、语气与潜台词（比如客人调侃“我在说你们乐乐/你们真逗”是在笑话你们好笑，要直接反应过来接梗、吐槽或反呛，绝不能无视客人自顾自聊旧话题，更严禁“前半句应付客人+后半句硬拐去聊浮漂/地图岔路”的缝合怪！）。
2. 【有问必有答，绝不问完断片】如果在场家人 A 在对话中向在场家人 B 发问、质询、对质或点名（如“那骂人的话呢？”“唯刚你说清楚”），必须在紧接着的下一句安排 B 本人直接回应，并把话自然落脚收住，严禁把未回答的质问留在最后一句戛然而止！
3. 【鲜明活人声线】玉洁嘴快毒舌又护短、唯刚实在直白被冤枉会急着辩解（严禁“嗯……”开头、严禁硬扯钓鱼浮漂）、小八简练冷幽默（严禁硬扯游戏地图）、顾俏皮爽利（严禁居委会审讯腔）、door 随和风趣、坤坤短句带“咕”爱起哄。
4. 本轮优先发言参考：${responderHint}${mentioned.length ? `（客人刚点名了 ${mentioned.map(id => RESIDENTS[id].name).join('、')}，请优先接话）` : ''}。
5. 共写 ${targetLines} 句，相邻两句不能同一人说，每句长短错落（可短至五六个字吐槽，也可二三十字解释，上限 160 字），不加外层引号、不写角色名前缀、不写括号旁白。
6. 私密边界：不泄露未提起的私人往事（如小八的私事）。
7. 严格输出 JSON：{"lines":[{"speaker":"成员ID","text":"鲜活口语发言","mood":"可选，如好笑/嘴硬/叫冤/吐槽/护短/开心/无语"}],"reaction":"neutral|warm|teasing|insult|apology","memory":{"summary":"一句话记下这轮值得记住的事，最多80字","importance":1到10整数,"impressions":{"说话人id->对象id":"可选新印象"}}}。普通闲聊或口头画饼省略 memory 且 reaction 填 neutral。`;

  const user = banterOnly
    ? (transcript
      ? `群聊近期记录：\n${transcript}\n\n（客人这会儿没插话。${pendingHistoryPrompt || '请让在场家人顺着当前气氛自然唠 2～4 句日常闲嗑，可以互相拆台、打趣或聊点生活小事，最后自然落脚收口，别强扯个人爱好。'}）`
      : '一家人刚凑在院子茶桌旁，客人还没开口，请轻松自然聊 2～3 句家常开场（别硬扯钓鱼或做地图）。')
    : (transcript
      ? `群聊近期记录：\n${transcript}\n\n客人刚刚说：${text}\n（请紧扣客人刚说的这句话直接回应互动，别拐回旧话题，且最后一句要自然落脚收口！）`
      : `客人刚刚在家庭群聊说：${text}\n（请紧扣客人这句话直接回应互动，像真实家人群一样自然接招！）`);

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
  const hasTopic = PERSONALITIES[speaker]?.interests.some(w => w.length >= 2 && text.includes(w));

  if (!prev) {
    // Playful slang / "乐乐/乐子/搞笑/小丑/逗" awareness even offline!
    if (/乐乐|乐子|好笑|逗死|小丑|傻乐/.test(text)) {
      const witty: Record<ResidentId, string> = {
        door: '哟，合着搁这儿看我们一家子热闹呢？你也太损了哈哈！',
        gu: '噗，好哇你，跑咱家院子里看乐子来了是吧？',
        xiaoba: '听出来了，这是在拿我们打趣呢。',
        yujie: '嘿！说谁乐子呢？我看你才是最会起哄的那个！',
        weigang: '喂！我就说听着不对劲，敢情你是在笑话我们啊！',
        chicken: '咕咕！坤坤听懂啦，客人在笑话咱们呢，不服气！',
      };
      return { speaker, text: witty[speaker], mood: '吐槽' };
    }
    if (recalled && text.trim()) {
      const hint = recalled.text.slice(0, 32);
      const opener: Record<ResidentId, string> = {
        door: `你这一提我倒想起来了（${hint}），正好一块唠唠。`,
        gu: `听你这么说我也想起前阵子那茬了（${hint}），今天咋又想起来啦？`,
        xiaoba: `这事我有印象，你接着往下说。`,
        yujie: `哟，这茬我可记着呢，快展开说说后续！`,
        weigang: `哎这事我记得！你今天是有啥新想法吗？`,
        chicken: `咕！这件事坤坤也记在小脑袋里呢，快接着说！`,
      };
      return { speaker, text: opener[speaker], mood: '认真' };
    }
    if (hasTopic) {
      const excited: Record<ResidentId, string> = {
        door: '哟，这话题算是聊对人了，快说说你的想法？',
        gu: '巧了，我刚还在琢磨这事呢，咱们一块合计合计！',
        xiaoba: '这个挺有意思的，展开讲讲看。',
        yujie: '哎，聊这个我可就不困了啊，听我先说两句！',
        weigang: '哦？说到这个我还真挺感兴趣，你具体咋想的？',
        chicken: '咕咕！坤坤扑腾一下小翅膀，这个我也想掺和！',
      };
      return { speaker, text: excited[speaker], mood: '开心' };
    }
    const opener: Record<ResidentId, string> = {
      door: text.trim() ? '哈哈这话说得有意思，大伙儿一块接两句呗。' : '难得大伙儿都在院子里，今天手头都歇下来了吧？',
      gu: text.trim() ? '来来来，茶刚泡好，咱们顺着这话好好唠唠！' : '锅里汤还温着呢，正好凑一桌歇口气聊会儿闲天。',
      xiaoba: text.trim() ? '我听着呢，这话确实挺有看头。' : '院子里风挺凉快，凑一块待会儿挺舒服。',
      yujie: text.trim() ? '哟，来新活儿了？让我听听是怎么个事儿！' : '好家伙，全员齐聚啊，谁先起个有意思的话头？',
      weigang: text.trim() ? '哎我在呢！这事咱们一块说说呗。' : '院子里比屋里热闹多了，我也搬个小板凳凑过来！',
      chicken: text.trim() ? '咕！坤坤也挤到小板凳旁边竖起耳朵听啦！' : '咕咕，大家都在这儿，坤坤最爱凑热闹啦！',
    };
    return { speaker, text: opener[speaker], mood: '平静' };
  }

  // Follow-up banter reacting naturally to the previous speaker
  if (/乐乐|乐子|好笑|逗死|小丑|傻乐/.test(text)) {
    const clapbacks: Record<ResidentId, string> = {
      door: `哈哈${prevName}别急，人家开个玩笑，咱大大方方接住就是了。`,
      gu: `就是，${prevName}你看客人笑得多欢，待会儿罚他多帮咱浇两垄地！`,
      xiaoba: `${prevName}别上套，他就是故意逗咱们看反应的。`,
      yujie: `${prevName}你反应也太慢了，人家明显在拿咱寻开心呢！`,
      weigang: `就是嘛！亏我还当真琢磨了半秒，差点又被绕进去了！`,
      chicken: `咕咕！${prevName}说得对，罚客人给坤坤抓把米赔罪！`,
    };
    return { speaker, text: clapbacks[speaker], mood: '起哄' };
  }

  const followups: Record<ResidentId, string[]> = {
    door: [`${prevName}这话实在，咱顺着往下合计就行。`, `哈哈，听你们斗嘴比喝茶还提神。`],
    gu: [`${prevName}说得在理，客人也别客气，有啥想聊的尽管说！`, `你一言我一语的，院子里一下就有热乎劲儿了。`],
    xiaoba: [`我赞成${prevName}说的，简单直接最靠谱。`, `确实，刚才那句说到点子上了。`],
    yujie: [`得了吧${prevName}，就你会装稳重，依我看直接痛快点更好！`, `行吧，这回算${prevName}抢先一步说中了，我先不抬杠。`],
    weigang: [`我也跟${prevName}想一块去了，刚差点就脱口而出了！`, `哈哈${prevName}这话说得太实在了，我举双手赞成。`],
    chicken: [`咕！${prevName}说得对，不过待会儿别忘了给坤坤留口吃的！`, `咕咕，你们聊得这么热闹，坤坤在旁边直点头！`],
  };
  const bank = followups[speaker];
  return { speaker, text: bank[Math.floor(at / 1000) % bank.length], mood: '热闹' };
}

function offlineContinuationForOpenQuestion(
  responder: ResidentId,
  asker: ResidentId,
  questionText: string,
): GroupReplyLine {
  const callAsker = (responder === 'xiaoba' || responder === 'yujie' || responder === 'weigang') && asker === 'gu'
    ? '妈'
    : (responder === 'xiaoba' || responder === 'yujie' || responder === 'weigang') && asker === 'door'
      ? '爸'
      : responder !== 'chicken' && responder === 'weigang' && asker === 'xiaoba'
        ? '哥'
        : responder !== 'chicken' && responder === 'weigang' && asker === 'yujie'
          ? '二哥'
          : RESIDENTS[asker].name;

  if (/骂|欺负|冤枉|误会|谁说|有人说/.test(questionText)) {
    const defense: Record<ResidentId, string> = {
      weigang: `冤枉啊${callAsker}！我连人家是谁都没影儿呢，哪来的骂人一说，肯定是误会了！`,
      yujie: `喂喂${callAsker}，我平时嘴贫归嘴贫，真骂人的缺德事我可没干过啊！`,
      xiaoba: `${callAsker}放心，我没骂过人，八成是哪句话传岔了。`,
      gu: `哎哟${callAsker}，我好端端骂人干啥呀，准是哪儿弄拧巴了！`,
      door: `哈哈${callAsker}，我这脾气你还不知道？肯定是传话传出乌龙了。`,
      chicken: `咕咕！${callAsker}明察，坤坤只会咕咕叫，才不会骂人呢！`,
    };
    return { speaker: responder, text: defense[responder], mood: '叫冤' };
  }

  const generic: Record<ResidentId, string> = {
    weigang: `放心吧${callAsker}，这事我心里有数，妥妥的没问题！`,
    yujie: `包在我身上吧${callAsker}，这点小事还能难倒我？`,
    xiaoba: `放心吧${callAsker}，我都记着呢，稳稳当当的。`,
    gu: `放心好啦${callAsker}，这事交给我准安排得明明白白！`,
    door: `哈哈没问题${callAsker}，这事包顺顺当当落停。`,
    chicken: `咕咕！${callAsker}放心，坤坤全都听明白啦！`,
  };
  return { speaker: responder, text: generic[responder], mood: '认真' };
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

  if (!banterOnly && reaction === 'teasing') {
    const lead = responders[0] ?? members[0];
    const backup = responders[1];
    const teaseLead: Record<ResidentId, string> = {
      door: '哟，跑我院子里占便宜讨乐子来了？胆子不小啊哈哈！',
      gu: '噗，少在这儿没大没小耍贫嘴啊，当大伙儿听不出来呢！',
      xiaoba: '少贫嘴，这套占便宜的招数在我们这儿可不好使。',
      yujie: '哟呵，算盘珠子都蹦我脸上了，想占便宜门儿都没有！',
      weigang: '喂！别拿我们寻开心啊，我都听出来你在逗我们玩了！',
      chicken: '咕咕！坤坤都听出你在占便宜啦，不许耍赖！',
    };
    const teaseBackup: Record<ResidentId, string> = {
      door: '就是，换个实在点的话题唠，别光搁这儿贫。',
      gu: '听见没，家里几个小的可都精着呢，糊弄不过去哈哈！',
      xiaoba: '嗯，正常聊天随时欢迎，别乱认辈分就行。',
      yujie: '听见没？再贫嘴我让坤坤去追着啄你鞋带啊！',
      weigang: '对呀，好好唠嗑多有意思，别光拿我们打趣嘛！',
      chicken: '咕！对，再逗大家坤坤就要扑腾翅膀抗议啦！',
    };
    const lines: GroupReplyLine[] = [
      { speaker: lead, text: teaseLead[lead], mood: '吐槽' },
      ...(backup && backup !== lead ? [{ speaker: backup, text: teaseBackup[backup], mood: '起哄' }] : []),
    ];
    return { lines, reaction, online: false };
  }

  if (!banterOnly && reaction === 'insult') {
    const lead = responders[0] ?? members[0];
    const backup = responders[1];
    const insultLead: Record<ResidentId, string> = {
      door: '哎，这话可就太冲了啊，跑家里来撒气我们可不奉陪。',
      gu: '怎么一上来火气这么大呀？有事说事，别张嘴就伤人。',
      xiaoba: '把话收一收吧，冲着家里人撒火算怎么回事。',
      yujie: '嘿，吃枪药了是吧？跑咱家院子骂骂咧咧，谁惯着你啊！',
      weigang: '喂！好端端的干嘛骂人啊，我们又没招你惹你！',
      chicken: '咕！干嘛这么凶，坤坤都要躲回窝里去啦！',
    };
    const insultBackup: Record<ResidentId, string> = {
      door: '消消火好好说话，不然这天可没法往下聊了。',
      gu: '就是，大伙儿好心招待你，别拿坏脾气冲自家人。',
      xiaoba: '嗯，想好好聊我们随时听，骂人就算了。',
      yujie: '少冲我家里人嚷嚷啊，好好说话听见没！',
      weigang: '就是嘛，有话好好说不行吗，干嘛上来就凶人。',
      chicken: '咕咕！不许凶家里人！',
    };
    const lines: GroupReplyLine[] = [
      { speaker: lead, text: insultLead[lead], mood: '不悦' },
      ...(backup && backup !== lead ? [{ speaker: backup, text: insultBackup[backup], mood: '护短' }] : []),
    ];
    return { lines, reaction, online: false };
  }

  // If banterOnly and last message in recentMessages was an open question, answer it first offline too!
  if (banterOnly && recentMessages.length > 0) {
    const lastMsg = recentMessages[recentMessages.length - 1];
    const prevMsg = recentMessages.length >= 2 ? recentMessages[recentMessages.length - 2] : undefined;
    if (lastMsg.speaker !== 'player') {
      const addr = detectOpenAddressivity(lastMsg.text, lastMsg.speaker, members, prevMsg?.speaker);
      if (addr.isOpen) {
        const responder = addr.addressee && members.includes(addr.addressee) ? addr.addressee : responders[0];
        if (responder && responder !== lastMsg.speaker) {
          const first = offlineContinuationForOpenQuestion(responder, lastMsg.speaker, lastMsg.text);
          const closer = lastMsg.speaker;
          const closeLine: GroupReplyLine = {
            speaker: closer,
            text: closer === 'chicken' ? '咕！听你这么说坤坤就放心啦！' : `行，听你这么说清楚我心里就踏实了，翻篇翻篇！`,
            mood: '松口气',
          };
          return { lines: [first, closeLine], reaction: 'neutral', online: false };
        }
      }
    }
  }

  const lines: GroupReplyLine[] = [];
  for (const speaker of responders) {
    lines.push(offlineLineFor(speaker, text, lines.at(-1), memories, at + lines.length * 1000));
  }
  return { lines, reaction, online: false };
}

/**
 * 将庭院自主/委托对话记录导入群聊面板：
 * 同时合并 `record.pendingLines`（已生成但因打开弹窗尚未逐条冒泡完的后续对白），
 * 彻底防止像图11那样点进群聊时把后半截回答直接腰斩截断！
 */
export function seedGroupMessagesFromRecord(record: ResidentConversation): FarmGroupMessage[] {
  const baseAt = record.lines.at(-1)?.at ?? record.startedAt;
  const pending = (record.pendingLines ?? [])
    .filter(line => isResidentId(line.speaker) && record.participants.includes(line.speaker) && line.text.trim().length > 0)
    .map((line, idx) => ({
      speaker: line.speaker,
      text: unwrapModelReplyText(line.text, { speakerNames: speakerAliasesFor(line.speaker) }) || line.text.trim(),
      at: baseAt + idx + 1,
    }));
  const combined = [
    ...record.lines.map(line => ({
      speaker: line.speaker,
      text: unwrapModelReplyText(line.text, { speakerNames: speakerAliasesFor(line.speaker) }) || line.text.trim(),
      at: line.at,
    })),
    ...pending,
  ].slice(-14);

  return combined.map((line, i) => ({
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
        const rawText = typeof item.text === 'string' ? item.text.trim() : '';
        const text = (speaker && speaker !== 'player'
          ? unwrapModelReplyText(rawText, { speakerNames: speakerAliasesFor(speaker) })
          : rawText
        ).slice(0, 220);
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
  const withoutAt = clean
    .replace(new RegExp(`^@?(?:${RESIDENTS[actor].name}|${actor}|爸爸|老爸|爸|妈妈|老妈|妈|大哥|二哥|小弟|老三|伟刚|伟纲|唯纲)[，,：:\\s]*`, 'i'), '')
    .trim();
  if (!withoutAt) return null;
  const action = localNpcCommand(withoutAt, actor);
  if (!action || action.type === 'discuss') return null;
  if (action.type === 'talk_to' && members.includes(action.target) && !action.purpose) return null;
  return { actor, action };
}

function normalizeLineKey(text: string): string {
  return text.normalize('NFKC').toLowerCase().replace(/[\s\p{P}\p{S}]/gu, '');
}

/**
 * Conversation Director: 群聊多轮对话导演引擎。
 * 1. 放开在线自由度：玩家的调侃/吐槽/热梗直接交由在线模型按活人人设接招回怼，不再机械拦截成说教模板；
 * 2. 话轮开放性检测（Open Addressivity）：每次模型返回后自动检测末句是否向在场家人抛出了追问、质询、对质或点名；
 * 3. 动态多轮路由（2~5 轮直至自然收口）：一旦检测到悬而未决的提问（如图11顾追问唯刚“那骂人的话呢？”），自动路由给被问家人续答并自然落脚，绝不问完戛然而止；
 * 4. 反重复与安全护栏：跟踪句首指纹与全句相似度防车轱辘话，严格保证相邻发言人不重复、总行数与总耗时有界。
 */
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
  /** 可选增量回调：每完成一轮导演续话即可流式通知外部 UI */
  onRoundLines?: (lines: GroupReplyLine[], round: number) => void;
}): Promise<GroupTurnResult> {
  const {
    text,
    members,
    memories,
    recentMessages,
    scene,
    studyBrief,
    sleepDeprivedNote,
    apiKey,
    signal,
    at,
    banterOnly = false,
    onRoundLines,
  } = options;
  const cleanText = banterOnly ? '' : text.trim();
  const localReaction = banterOnly ? 'neutral' : localSocialReaction(cleanText);

  // Never leak private secrets like 阿绿 in group chat
  if (!banterOnly && isSensitiveFarmText(cleanText) && /阿[绿綠]/.test(cleanText)) {
    const lead = members.includes('xiaoba') ? 'xiaoba' : members[0];
    const lines: GroupReplyLine[] = [{
      speaker: lead,
      text: lead === 'xiaoba' ? '大伙儿都在群里呢，我个人的私事就先不在这儿聊了。' : '那是人家小八自己的私事，咱们就不在群里起哄打听啦。',
      mood: '平静',
    }];
    onRoundLines?.(lines, 0);
    return { lines, reaction: 'neutral', online: false };
  }

  if (!apiKey) {
    const offline = offlineGroupChatReply(cleanText, members, memories, recentMessages, at, banterOnly);
    onRoundLines?.(offline.lines, 0);
    return { ...offline, hint: '未配置 API Key，本轮使用本地群聊' };
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

  const turnStartedAt = Date.now();
  const DIRECTOR_TIME_BUDGET_MS = 26000;

  try {
    const raw = await farmChat(messages, apiKey, {
      signal,
      priority: 'interactive',
      timeoutMs: 18000,
      maxTokens: 850,
      temperature: 0.96,
      retries: 1,
      validate: candidate => parseGroupChatReply(candidate, members) !== null,
    });
    const parsed = parseGroupChatReply(raw, members);
    if (!parsed) throw new FarmChatError('群聊回复格式不完整');

    const allLines: GroupReplyLine[] = [...parsed.lines];
    onRoundLines?.(parsed.lines, 0);

    let lastMemory = parsed.memory;
    const effectiveReaction: SocialReaction =
      !banterOnly && parsed.reaction === 'neutral' && (localReaction === 'insult' || localReaction === 'teasing')
        ? localReaction
        : parsed.reaction;

    // === Multi-Turn Conversation Director ===
    const MAX_CONTINUATIONS = 3;
    const LINE_CAP = 10;
    const recentStarts = new Set<string>();
    const seenNormalized = new Set<string>();

    for (const line of allLines) {
      const start = normalizeLineKey(line.text).slice(0, 6);
      const norm = normalizeLineKey(line.text);
      if (start.length >= 3) recentStarts.add(start);
      if (norm) seenNormalized.add(norm);
    }

    for (let round = 0; round < MAX_CONTINUATIONS; round++) {
      if (signal.aborted) break;
      if (allLines.length >= LINE_CAP) break;

      const lastLine = allLines[allLines.length - 1];
      if (!lastLine) break;
      const prevSpeaker: ResidentId | 'player' | undefined =
        allLines.length >= 2
          ? allLines[allLines.length - 2].speaker
          : !banterOnly && cleanText
            ? 'player'
            : recentMessages.at(-1)?.speaker;

      const addressivity = detectOpenAddressivity(lastLine.text, lastLine.speaker, members, prevSpeaker);
      if (!addressivity.isOpen) break;

      const otherMembers = members.filter(id => id !== lastLine.speaker);
      if (!otherMembers.length) break;

      const targetResponderId =
        addressivity.addressee && otherMembers.includes(addressivity.addressee)
          ? addressivity.addressee
          : selectGroupResponders(lastLine.text, otherMembers, memories, [], at + allLines.length * 1000, 1)[0];

      if (!targetResponderId) break;

      const elapsed = Date.now() - turnStartedAt;
      const remainingBudget = DIRECTOR_TIME_BUDGET_MS - elapsed;
      if (remainingBudget < 2500) {
        // Out of wall-clock budget while a direct question is still hanging — close cleanly in character!
        const fallbackLine = offlineContinuationForOpenQuestion(targetResponderId, lastLine.speaker, lastLine.text);
        allLines.push(fallbackLine);
        onRoundLines?.([fallbackLine], round + 1);
        break;
      }

      const isFinalContinuation = round === MAX_CONTINUATIONS - 1 || allLines.length >= LINE_CAP - 2;
      const askerName = RESIDENTS[lastLine.speaker].name;
      const targetName = RESIDENTS[targetResponderId].name;
      const continuationTranscript = [
        ...recentMessages.slice(-8).map(m =>
          `${m.speaker === 'player' ? '客人' : RESIDENTS[m.speaker].name}：${unwrapModelReplyText(m.text) || m.text}`,
        ),
        ...(cleanText && !banterOnly ? [`客人：${cleanText}`] : []),
        ...allLines.map(l => `${RESIDENTS[l.speaker].name}：${l.text}`),
      ].join('\n');

      const avoidPrefixes = [...recentStarts].slice(-6).join('、');
      const landingInstruction = isFinalContinuation
        ? `请让${targetName}正面把话答透，并让在场家人顺势用 1 句自然收口落脚（共 1～2 句，最后一句必须是痛快自然的陈述/感叹收尾，绝对不要再抛新的问句或悬念！）。`
        : `请先由${targetName}直接正面回应${askerName}刚才的话（可辩解、吐槽、说实话或回怼），如有必要另一位在场家人可顺势接 1 句把话聊透落脚（共 1～3 句；若已经说清楚就直接自然收口，不必强行再提问）。`;

      const continuationUser = `群聊当前上下文：\n${continuationTranscript}\n\n【导演续轮指令】刚才最后一句，${askerName}对着${targetName}追问/喊话了：「${lastLine.text}」\n${landingInstruction}\n第一句 speaker 必须是 "${targetResponderId}"（${targetName}）；严禁复读前文说过的意思或相近句首（避开：${avoidPrefixes || '嗯……'}），严禁硬扯钓鱼浮漂或地图。`;

      const continuationMessages = buildGroupChatMessages({
        text: '',
        members,
        responders: [targetResponderId, ...members.filter(id => id !== targetResponderId)],
        memories,
        recentMessages: [],
        scene,
        studyBrief,
        sleepDeprivedNote,
        at: at + (round + 1) * 1000,
        banterOnly: true,
      });
      continuationMessages[continuationMessages.length - 1] = { role: 'user', content: continuationUser };

      try {
        const contRaw = await farmChat(continuationMessages, apiKey, {
          signal,
          priority: 'interactive',
          timeoutMs: Math.min(13000, remainingBudget),
          maxTokens: 460,
          temperature: 0.92,
          retries: 0,
          validate: candidate => parseGroupChatReply(candidate, members) !== null,
        });
        const contParsed = parseGroupChatReply(contRaw, members);
        if (!contParsed || !contParsed.lines.length) {
          const fallbackLine = offlineContinuationForOpenQuestion(targetResponderId, lastLine.speaker, lastLine.text);
          allLines.push(fallbackLine);
          onRoundLines?.([fallbackLine], round + 1);
          break;
        }

        const acceptedRoundLines: GroupReplyLine[] = [];
        for (const line of contParsed.lines) {
          if (allLines.length >= LINE_CAP) break;
          // Enforce strict speaker alternation across round boundary AND after any filtered line
          if (allLines[allLines.length - 1]?.speaker === line.speaker) continue;
          const norm = normalizeLineKey(line.text);
          if (!norm || seenNormalized.has(norm)) continue;
          const start = norm.slice(0, 6);
          if (start.length >= 4 && recentStarts.has(start)) continue;
          // Reject near-duplicate substring echo
          const isEcho = [...seenNormalized].some(prev =>
            prev.length >= 8 && norm.length >= 8 && (prev.includes(norm) || norm.includes(prev)),
          );
          if (isEcho) continue;

          allLines.push(line);
          acceptedRoundLines.push(line);
          seenNormalized.add(norm);
          if (start.length >= 3) recentStarts.add(start);
        }

        if (!acceptedRoundLines.length) {
          const fallbackLine = offlineContinuationForOpenQuestion(targetResponderId, lastLine.speaker, lastLine.text);
          if (allLines[allLines.length - 1]?.speaker !== fallbackLine.speaker) {
            allLines.push(fallbackLine);
            onRoundLines?.([fallbackLine], round + 1);
          }
          break;
        }

        onRoundLines?.(acceptedRoundLines, round + 1);

        if (
          contParsed.memory &&
          (!lastMemory || (contParsed.memory.importance ?? 5) > (lastMemory.importance ?? 5))
        ) {
          lastMemory = contParsed.memory;
        }
      } catch (contErr) {
        if (signal.aborted || !(contErr instanceof FarmChatError)) throw contErr;
        // Network hiccup during continuation: ensure we STILL don't leave an open question hanging!
        const fallbackLine = offlineContinuationForOpenQuestion(targetResponderId, lastLine.speaker, lastLine.text);
        if (allLines[allLines.length - 1]?.speaker !== fallbackLine.speaker) {
          allLines.push(fallbackLine);
          onRoundLines?.([fallbackLine], round + 1);
        }
        break;
      }
    }

    // Final safety guarantee: if after MAX_CONTINUATIONS the very last line STILL somehow ended on an open question to a peer, append a crisp landing line!
    if (allLines.length > 0 && allLines.length < LINE_CAP + 1) {
      const tail = allLines[allLines.length - 1];
      const prev = allLines.length >= 2 ? allLines[allLines.length - 2].speaker : undefined;
      const tailCheck = detectOpenAddressivity(tail.text, tail.speaker, members, prev);
      if (tailCheck.isOpen) {
        const responder =
          tailCheck.addressee && members.includes(tailCheck.addressee) && tailCheck.addressee !== tail.speaker
            ? tailCheck.addressee
            : members.find(id => id !== tail.speaker);
        if (responder) {
          const closure = offlineContinuationForOpenQuestion(responder, tail.speaker, tail.text);
          allLines.push(closure);
          onRoundLines?.([closure], MAX_CONTINUATIONS + 1);
        }
      }
    }

    return {
      lines: allLines,
      reaction: effectiveReaction,
      ...(lastMemory ? { memory: lastMemory } : {}),
      online: true,
    };
  } catch (error) {
    if (signal.aborted) throw error;
    const reason = error instanceof FarmChatError ? error.message : '网络暂不可用';
    const offline = offlineGroupChatReply(cleanText, members, memories, recentMessages, at, banterOnly);
    onRoundLines?.(offline.lines, 0);
    return {
      ...offline,
      hint: `${reason}，本轮使用本地群聊`,
    };
  }
}
