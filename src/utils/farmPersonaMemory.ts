import { RESIDENTS, RESIDENT_IDS, isResidentId, type ResidentConversation, type ResidentId } from './farmLife';
import type { FarmMemories, ResidentMemory } from './farmMemory';
import type { RelayIntent } from './farmAssignment';

export type MemoryEpisodeKind = 'chat' | 'npc_talk' | 'relay' | 'group' | 'reflection';
export type MemoryEpisodeSource = 'chat' | 'gift' | 'wish' | 'system';
export type MemoryPrivacy = 'public' | 'private';
export type PeerStance = 'warm' | 'close' | 'amused' | 'worried' | 'awkward' | 'neutral';

export interface FarmMemoryEpisode {
  id: string;
  kind: MemoryEpisodeKind;
  text: string;
  actors: string[];
  tags: string[];
  importance: number; // 1..10
  emotion?: string;
  privacy: MemoryPrivacy;
  at: number;
  /** 来源标记：仅 'gift' / 'wish' 属于系统背包扣减触发的真实送礼事件 */
  source?: MemoryEpisodeSource;
  /** 仅通过真实背包扣减送礼路径写入时为 true，彻底与口头聊天隔离 */
  verifiedGift?: boolean;
}

export interface PlayerFact {
  key: string;
  text: string;
  evidence: string;
  privacy: MemoryPrivacy;
  updatedAt: number;
  /** 来源标记：仅 'gift' / 'wish' 属于真实背包扣减触发的送礼事实 */
  source?: 'chat' | 'gift' | 'wish';
  /** 仅通过真实送礼系统 API 写入时为 true */
  verifiedGift?: boolean;
}

export interface PeerImpression {
  note: string;
  stance: PeerStance;
  updatedAt: number;
}

export interface PersonaMemoryFields {
  episodes?: FarmMemoryEpisode[];
  playerFacts?: PlayerFact[];
  peerImpressions?: Partial<Record<ResidentId, PeerImpression>>;
  reflections?: string[];
}

export const MAX_EPISODES = 40;
export const MAX_PLAYER_FACTS = 16;
export const MAX_REFLECTIONS = 6;
const EPISODE_KINDS = new Set<MemoryEpisodeKind>(['chat', 'npc_talk', 'relay', 'group', 'reflection']);
const EPISODE_SOURCES = new Set<MemoryEpisodeSource>(['chat', 'gift', 'wish', 'system']);
const PEER_STANCES = new Set<PeerStance>(['warm', 'close', 'amused', 'worried', 'awkward', 'neutral']);

const SENSITIVE_PATTERN = /阿[绿綠]|私事|秘密|保密|(?:别|不要|不许).{0,8}(?:说|提|告诉)|隐私|前任|前女友|分手|密码|住址|电话|生病|诊断|sk-[\w-]+|api\s*key|验证码|卡号|身份证|私钥|token\s*[:=]/i;
const CREDENTIAL_PATTERN = /sk-[\w-]+|密码|api\s*key|验证码|卡号|身份证|私钥|token\s*[:=]/i;
const STOP_BIGRAMS = /^(?:你们|我们|他们|她们|这个|那个|之前|上次|刚才|喜欢|什么|怎么|可以|知道|觉得|想要|最近|今天|一下|说说|聊聊|告诉|大家|一起|就是|还是|已经|因为|所以|然后|不过|其实)$/;

/** 非送礼语境下的「送」复合词（接送、发送、送回家等），检测口头画饼送礼前先剥离避免误伤 */
const BENIGN_SONG_COMPOUND_PATTERN = /(?:接送|发送|推送|配送|输送|送别|送行|护送|目送|欢送|送客|运送|报送|投送|传送|送审|送修|送医|送考|送达|送货|送(?:我|你|您|他|她|客人|玩家|小八|玉洁|唯刚|坤坤|顾|door|大肥鱼)?(?:回|去|到|上|下|出|进)(?:家|屋|房|校|学校|车站|门口|医院|机场|集市|地里|村口))/gi;

const FARM_GIFT_ITEM_WORDS = '(?:萝卜|胡萝卜|小麦|蓝莓|番茄|西红柿|玉米|南瓜|葡萄|星星果|月光萝卜|露珠莓|日辉蜜瓜|面包|麦香面包|果酱|莓果果酱|浓汤|田园浓汤|南瓜派|礼物|礼盒|心意|水果|点心|零食|蛋糕|奶茶|花|鲜花|吃的|好吃的|小礼物|菜|苹果|草莓|桃子|西瓜|糖|茶)';
const NPC_TARGET_WORDS = '(?:你|您|小八|玉洁|唯刚|坤坤|顾|door|大肥鱼|胡波奇|波奇|徐睡阴|睡阴|黄冰骑|冰骑|大家|大伙|你们|家人)';

const VERBAL_GIFT_CLAIM_PATTERNS: readonly RegExp[] = [
  new RegExp(`送(?:给|了|过)?${NPC_TARGET_WORDS}`, 'i'),
  new RegExp(`把.{1,16}送(?:给|了|过)?${NPC_TARGET_WORDS}`, 'i'),
  new RegExp(`送(?:了|过|给)?(?:一[个根份碗盘袋杯块条颗朵束盒瓶罐把]|两|几|点|些|这|那)?${FARM_GIFT_ITEM_WORDS}`, 'i'),
  new RegExp(`给${NPC_TARGET_WORDS}(?:买|带|拿|递|端|留|烤|煮|摘|准备|带去|带来|拿来|送来|送去)(?:了|过|好|个|份|根|颗|点|些)?`, 'i'),
  new RegExp(`给${NPC_TARGET_WORDS}(?:一[个根份碗盘袋杯块条颗朵束盒瓶罐把]|两|几|点|些)?${FARM_GIFT_ITEM_WORDS}`, 'i'),
  new RegExp(`(?:买|带|拿|烤|做|煮|摘|备)(?:了|好).{0,10}(?:给|送给?)${NPC_TARGET_WORDS}`, 'i'),
  /(?:这是|这个|拿去|收下).{0,8}(?:送给你|送你|给你的|礼物|礼盒|吃吧)/i,
  /请你吃|投喂(?:你|您)|送份?礼/i,
];

const GIFT_MEMORY_CLAIM_PATTERNS: readonly RegExp[] = [
  /(?:送过|送了|送给|赠送|赠与|赠过|赠了|送来|送礼|收礼|回礼|投喂)/i,
  new RegExp(`(?:收到|收下|拿了|接过).{0,10}(?:送|赠|礼物|礼盒|心意|${FARM_GIFT_ITEM_WORDS})`, 'i'),
  new RegExp(`(?:客人|玩家|对方|他|她|你).{0,10}(?:给了|给过|买了|买过|带了|带过|递了|递给|拿了|烤了|请.{0,4}吃).{0,14}(?:我|${NPC_TARGET_WORDS}|${FARM_GIFT_ITEM_WORDS})`, 'i'),
  /(?:礼物|礼盒)/i,
];

const GIFT_FACT_KEY_PATTERN = /^(?:送礼|送过|送了|送给|赠礼|赠送|礼物|礼盒|收礼|收到|投喂|回礼|请吃|买过|带过)/i;

function stripBenignSongCompounds(text: string): string {
  return text.normalize('NFKC').replace(BENIGN_SONG_COMPOUND_PATTERN, '');
}

/** 检测玩家普通聊天文本是否属于「口头画饼送礼」（如“送你一个萝卜 / 给你买了草莓”）。 */
export function isVerbalGiftClaim(text: string): boolean {
  const cleaned = stripBenignSongCompounds(text).trim();
  if (!cleaned) return false;
  return VERBAL_GIFT_CLAIM_PATTERNS.some(pattern => pattern.test(cleaned));
}

/** 检测记忆文本或 fact key 是否声称发生了送礼/收礼行为（未经过背包扣减校验时严禁入库）。 */
export function isGiftClaimMemoryText(text: string): boolean {
  const cleaned = stripBenignSongCompounds(text).trim();
  if (!cleaned) return false;
  if (isVerbalGiftClaim(cleaned)) return true;
  return GIFT_MEMORY_CLAIM_PATTERNS.some(pattern => pattern.test(cleaned));
}

/** 判断情景记忆是否由系统真实背包扣减送礼/心愿实现事件产生。 */
export function isVerifiedGiftEpisode(episode: Pick<FarmMemoryEpisode, 'id' | 'source' | 'verifiedGift'>): boolean {
  return (
    episode.verifiedGift === true ||
    episode.source === 'gift' ||
    episode.source === 'wish' ||
    episode.id.startsWith('gift-') ||
    episode.id.startsWith('wish-')
  );
}

/** 判断玩家事实是否由系统真实送礼 API 写入。 */
export function isVerifiedGiftFact(fact: Pick<PlayerFact, 'source' | 'verifiedGift'>): boolean {
  return fact.verifiedGift === true || fact.source === 'gift' || fact.source === 'wish';
}

/** 判断是否为未校验的假送礼玩家事实（如普通聊天误提取的“送过胡萝卜”）。 */
export function isUnverifiedGiftFact(fact: Pick<PlayerFact, 'key' | 'text' | 'evidence' | 'source' | 'verifiedGift'>): boolean {
  if (isVerifiedGiftFact(fact)) return false;
  const cleanedKey = stripBenignSongCompounds(fact.key).trim();
  if (GIFT_FACT_KEY_PATTERN.test(cleanedKey)) return true;
  return isGiftClaimMemoryText(`${fact.key} ${fact.text} ${fact.evidence}`);
}

/** 判断是否为未校验的假送礼情景记忆（如普通聊天误记的“客人送了小八一根胡萝卜”）。 */
export function isUnverifiedGiftEpisode(episode: Pick<FarmMemoryEpisode, 'id' | 'text' | 'source' | 'verifiedGift'>): boolean {
  if (isVerifiedGiftEpisode(episode)) return false;
  return isGiftClaimMemoryText(episode.text);
}

export function isSensitiveFarmText(text: string): boolean {
  return SENSITIVE_PATTERN.test(text);
}

const normKey = (text: string) => text.normalize('NFKC').toLowerCase().replace(/[\s\p{P}\p{S}]/gu, '');

export function extractMemoryTags(text: string): string[] {
  const value = text.normalize('NFKC').toLowerCase();
  const tags = new Set<string>(value.match(/[a-z0-9]{2,16}/g) ?? []);
  for (const run of value.match(/\p{Script=Han}+/gu) ?? []) {
    if (run.length === 1 && run === '顾') {
      tags.add('顾');
      continue;
    }
    for (let i = 0; i < run.length - 1 && tags.size < 16; i++) {
      const term = run.slice(i, i + 2);
      if (!STOP_BIGRAMS.test(term)) tags.add(term);
    }
  }
  return [...tags].slice(0, 14);
}

function asObj(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

export function restorePersonaMemoryFields(raw: unknown): PersonaMemoryFields {
  const record = asObj(raw);
  const out: PersonaMemoryFields = {};

  if (Array.isArray(record.episodes)) {
    const episodes: FarmMemoryEpisode[] = [];
    for (const entry of record.episodes.slice(-MAX_EPISODES)) {
      const item = asObj(entry);
      const kind = item.kind as MemoryEpisodeKind;
      const text = typeof item.text === 'string' ? item.text.trim().slice(0, 140) : '';
      const id = typeof item.id === 'string' ? item.id.slice(0, 100) : '';
      if (!id || !text || !EPISODE_KINDS.has(kind)) continue;
      const actors = Array.isArray(item.actors)
        ? [...new Set(item.actors.filter((a): a is string => typeof a === 'string' && (a === 'player' || isResidentId(a))))].slice(0, 8)
        : [];
      const tags = Array.isArray(item.tags)
        ? [...new Set(item.tags.filter((t): t is string => typeof t === 'string' && t.length > 0 && t.length <= 24))].slice(0, 14)
        : extractMemoryTags(text);
      const importance = typeof item.importance === 'number' && Number.isFinite(item.importance)
        ? Math.max(1, Math.min(10, Math.round(item.importance)))
        : 5;
      const privacy: MemoryPrivacy = item.privacy === 'private' || isSensitiveFarmText(text) ? 'private' : 'public';
      const at = typeof item.at === 'number' && Number.isFinite(item.at) ? Math.max(0, Math.round(item.at)) : 0;
      const emotion = typeof item.emotion === 'string' && item.emotion.trim() ? item.emotion.trim().slice(0, 16) : undefined;
      const rawSource = typeof item.source === 'string' && EPISODE_SOURCES.has(item.source as MemoryEpisodeSource)
        ? item.source as MemoryEpisodeSource
        : undefined;
      const inferredSource: MemoryEpisodeSource | undefined = rawSource
        ?? (id.startsWith('gift-') ? 'gift' : id.startsWith('wish-') ? 'wish' : undefined);
      const verifiedGift = item.verifiedGift === true || inferredSource === 'gift' || inferredSource === 'wish';
      // 自动清理历史普通聊天误写入的「口头画饼送礼」脏记忆，保留真实送礼/心愿记录
      if (!verifiedGift && isGiftClaimMemoryText(text)) continue;
      episodes.push({
        id,
        kind,
        text,
        actors,
        tags,
        importance,
        ...(emotion ? { emotion } : {}),
        ...(inferredSource ? { source: inferredSource } : {}),
        ...(verifiedGift ? { verifiedGift: true } : {}),
        privacy,
        at,
      });
    }
    if (episodes.length) out.episodes = episodes;
  }

  if (Array.isArray(record.playerFacts)) {
    const facts: PlayerFact[] = [];
    for (const entry of record.playerFacts.slice(-MAX_PLAYER_FACTS)) {
      const item = asObj(entry);
      const key = typeof item.key === 'string' ? normKey(item.key).slice(0, 32) : '';
      const text = typeof item.text === 'string' ? item.text.trim().slice(0, 110) : '';
      const evidence = typeof item.evidence === 'string' ? item.evidence.trim().slice(0, 110) : '';
      if (!key || !text || !evidence || CREDENTIAL_PATTERN.test(`${text} ${evidence}`)) continue;
      const source = item.source === 'gift' || item.source === 'wish' || item.source === 'chat'
        ? item.source
        : undefined;
      const verifiedGift = item.verifiedGift === true || source === 'gift' || source === 'wish';
      const candidate: PlayerFact = {
        key,
        text,
        evidence,
        privacy: item.privacy === 'private' || isSensitiveFarmText(`${text} ${evidence}`) ? 'private' : 'public',
        updatedAt: typeof item.updatedAt === 'number' && Number.isFinite(item.updatedAt) ? Math.max(0, Math.round(item.updatedAt)) : 0,
        ...(source ? { source } : {}),
        ...(verifiedGift ? { verifiedGift: true } : {}),
      };
      // 自动清理历史普通聊天误提取的「送过胡萝卜」等无背包校验脏事实
      if (isUnverifiedGiftFact(candidate)) continue;
      facts.push(candidate);
    }
    if (facts.length) out.playerFacts = facts;
  }

  const rawPeers = asObj(record.peerImpressions);
  const peers: Partial<Record<ResidentId, PeerImpression>> = {};
  let peerCount = 0;
  for (const id of RESIDENT_IDS) {
    const item = asObj(rawPeers[id]);
    const note = typeof item.note === 'string' ? item.note.trim().slice(0, 110) : '';
    const stance = PEER_STANCES.has(item.stance as PeerStance) ? item.stance as PeerStance : 'neutral';
    const updatedAt = typeof item.updatedAt === 'number' && Number.isFinite(item.updatedAt) ? Math.max(0, Math.round(item.updatedAt)) : 0;
    if (note && !isSensitiveFarmText(note)) {
      peers[id] = { note, stance, updatedAt };
      peerCount++;
    }
  }
  if (peerCount) out.peerImpressions = peers;

  if (Array.isArray(record.reflections)) {
    const reflections = [...new Set(record.reflections
      .filter((r): r is string => typeof r === 'string' && r.trim().length > 0)
      .map(r => r.trim().slice(0, 120))
      .filter(r => !isSensitiveFarmText(r)))].slice(-MAX_REFLECTIONS);
    if (reflections.length) out.reflections = reflections;
  }

  return out;
}

/** Smallville 风格三因子检索：Recency(0.35) + Importance(0.30) + Relevance(0.35) */
export function retrievePersonaMemories(
  memory: ResidentMemory,
  query: string,
  peers: readonly string[],
  at: number,
  options: { includePrivate?: boolean; limit?: number } = {},
): FarmMemoryEpisode[] {
  const episodes = memory.episodes ?? [];
  if (!episodes.length) return [];
  const includePrivate = options.includePrivate === true;
  const limit = Math.max(1, Math.min(10, options.limit ?? 5));
  const queryTags = new Set(extractMemoryTags(query));
  const peerSet = new Set(peers);

  const scored = episodes
    .filter(ep => includePrivate || ep.privacy === 'public')
    .map(ep => {
      const ageHours = Math.max(0, (at - ep.at) / 3600000);
      const recency = Math.exp(-ageHours / 24); // ~0.37 after 24h, stays meaningful across days
      const importance = Math.max(0.1, Math.min(1, ep.importance / 10));

      let overlap = 0;
      for (const tag of ep.tags) {
        if (queryTags.has(tag)) overlap += 1;
      }
      const textRelevance = queryTags.size > 0 ? Math.min(1, overlap / Math.min(4, queryTags.size)) : 0;
      const actorMatches = ep.actors.filter(a => peerSet.has(a)).length;
      const actorRelevance = peerSet.size > 0 ? Math.min(1, actorMatches / Math.min(2, peerSet.size)) : 0;
      const relevance = Math.min(1, textRelevance * 0.72 + actorRelevance * 0.45);
      const kindBonus = ep.kind === 'relay' ? 0.08 : ep.kind === 'reflection' ? 0.06 : 0;

      const score = 0.35 * recency + 0.30 * importance + 0.35 * relevance + kindBonus;
      return { ep, score };
    })
    .sort((a, b) => b.score - a.score || b.ep.at - a.ep.at);

  return scored.slice(0, limit).map(entry => entry.ep);
}

export function appendEpisode(memory: ResidentMemory, episode: FarmMemoryEpisode): ResidentMemory {
  const cleanText = episode.text.trim().slice(0, 140);
  if (!cleanText || CREDENTIAL_PATTERN.test(cleanText)) return memory;
  const inferredSource: MemoryEpisodeSource | undefined = episode.source
    ?? (episode.id.startsWith('gift-') ? 'gift' : episode.id.startsWith('wish-') ? 'wish' : undefined);
  const verifiedGift = episode.verifiedGift === true || inferredSource === 'gift' || inferredSource === 'wish';
  // 硬性铁律：非系统真实送礼事件严禁写入任何“送了/送过/收到礼物”情景记忆
  if (!verifiedGift && isGiftClaimMemoryText(cleanText)) return memory;
  const privacy: MemoryPrivacy = episode.privacy === 'private' || isSensitiveFarmText(cleanText) ? 'private' : 'public';
  const entry: FarmMemoryEpisode = {
    ...episode,
    text: cleanText,
    privacy,
    ...(inferredSource ? { source: inferredSource } : {}),
    ...(verifiedGift ? { verifiedGift: true } : {}),
    importance: Math.max(1, Math.min(10, Math.round(episode.importance))),
    tags: episode.tags.length ? episode.tags.slice(0, 14) : extractMemoryTags(cleanText),
  };

  const existing = memory.episodes ?? [];
  const norm = normKey(cleanText);
  // Deduplicate exact or near-identical recent episode
  const filtered = existing.filter(ep => ep.id !== entry.id && normKey(ep.text) !== norm);
  const combined = [...filtered, entry];

  let next = combined;
  if (combined.length > MAX_EPISODES) {
    // Keep highest utility (importance + recency), always keeping the newly added entry
    const newestAt = entry.at || Date.now();
    const sorted = combined.slice(0, -1).map(ep => {
      const ageHours = Math.max(0, (newestAt - ep.at) / 3600000);
      const keepScore = ep.importance * 0.65 + Math.exp(-ageHours / 36) * 3.5 + (ep.kind === 'reflection' ? 2 : 0);
      return { ep, keepScore };
    }).sort((a, b) => b.keepScore - a.keepScore);
    const keepIds = new Set(sorted.slice(0, MAX_EPISODES - 1).map(item => item.ep.id));
    next = [...combined.slice(0, -1).filter(ep => keepIds.has(ep.id)), entry];
  }

  return { ...memory, episodes: next };
}

/** 仅接受最新玩家原话能佐证的长期事实（借鉴 MemGPT + whaleMemory 防幻觉模式，且严禁将口头送礼当作真实送礼写入）。 */
export function applyPlayerMemoryUpdates(
  memory: ResidentMemory,
  updates: unknown,
  playerText: string,
  at: number,
  extraEpisode?: { text?: unknown; importance?: unknown; emotion?: unknown },
): ResidentMemory {
  let next = memory;
  const normalizedPlayer = playerText.normalize('NFKC');
  const verbalGiftOnly = isVerbalGiftClaim(normalizedPlayer);

  if (Array.isArray(updates) && normalizedPlayer.trim()) {
    const facts = [...(next.playerFacts ?? [])];
    let changed = false;
    let accepted = 0;
    for (const rawItem of updates.slice(0, 6)) {
      if (accepted >= 3) break;
      const item = asObj(rawItem);
      const rawKey = typeof item.key === 'string' ? normKey(item.key).slice(0, 32) : '';
      const text = typeof item.text === 'string' ? item.text.trim().slice(0, 110) : '';
      const evidence = typeof item.evidence === 'string' ? item.evidence.trim().slice(0, 110) : '';
      if (!rawKey || !text || evidence.length < 2) continue;
      if (!normalizedPlayer.includes(evidence.normalize('NFKC'))) continue;
      if (CREDENTIAL_PATTERN.test(`${text} ${evidence}`)) continue;
      // 硬性铁律：普通文字聊天严禁写入任何“送过XX/送礼/收到礼物”事实
      if (GIFT_FACT_KEY_PATTERN.test(stripBenignSongCompounds(rawKey))) continue;
      if (isGiftClaimMemoryText(`${rawKey} ${text} ${evidence}`)) continue;
      if (verbalGiftOnly && isGiftClaimMemoryText(evidence)) continue;
      const privacy: MemoryPrivacy = isSensitiveFarmText(`${playerText} ${text} ${evidence}`) ? 'private' : 'public';
      const idx = facts.findIndex(f => f.key === rawKey || normKey(f.text) === normKey(text));
      const fact: PlayerFact = { key: rawKey, text, evidence, privacy, source: 'chat', updatedAt: at };
      if (idx >= 0) facts[idx] = fact;
      else if (facts.length < MAX_PLAYER_FACTS) facts.push(fact);
      else {
        // Evict oldest
        facts.sort((a, b) => a.updatedAt - b.updatedAt);
        facts[0] = fact;
      }
      changed = true;
      accepted += 1;
    }
    if (changed) next = { ...next, playerFacts: facts };
  }

  if (extraEpisode && typeof extraEpisode.text === 'string' && extraEpisode.text.trim().length >= 4) {
    const summary = extraEpisode.text.trim().slice(0, 130);
    // 阻断任何普通聊天产生的假送礼回忆（含兜底 warm episode 复述口头送礼文案）
    const blockedGiftEpisode = isGiftClaimMemoryText(summary)
      || (verbalGiftOnly && /(?:友善|开心|暖心|贴心|大方|感谢|谢谢|心意)/.test(summary));
    if (!blockedGiftEpisode) {
      const importance = typeof extraEpisode.importance === 'number' && Number.isFinite(extraEpisode.importance)
        ? Math.max(1, Math.min(10, Math.round(extraEpisode.importance)))
        : 5;
      const emotion = typeof extraEpisode.emotion === 'string' && extraEpisode.emotion.trim() ? extraEpisode.emotion.trim().slice(0, 16) : undefined;
      next = appendEpisode(next, {
        id: `chat-ep-${at}-${Math.abs(normKey(summary).length)}`,
        kind: 'chat',
        source: 'chat',
        text: summary,
        actors: ['player'],
        tags: extractMemoryTags(`${playerText} ${summary}`),
        importance,
        ...(emotion ? { emotion } : {}),
        privacy: isSensitiveFarmText(`${playerText} ${summary}`) ? 'private' : 'public',
        at,
      });
    }
  }

  return next;
}

export interface VerifiedGiftMemoryInput {
  who?: ResidentId;
  itemId: string;
  itemLabel: string;
  quantity?: number;
  tier?: 'loved' | 'liked' | 'normal';
  wasAngry?: boolean;
  source?: 'gift' | 'wish';
  note?: string;
  at?: number;
  /** 是否同步写入带系统校验标记的「送过XX」长期事实，默认 true */
  recordFact?: boolean;
}

/** 唯一合法的「真实送礼记忆」写入通道：仅允许在真实扣减背包库存/金币后调用。 */
export function recordVerifiedGiftMemory(
  memory: ResidentMemory,
  input: VerifiedGiftMemoryInput,
): ResidentMemory {
  const at = typeof input.at === 'number' && Number.isFinite(input.at) ? Math.round(input.at) : Date.now();
  const label = input.itemLabel.trim().slice(0, 24);
  if (!label) return memory;
  const source: 'gift' | 'wish' = input.source === 'wish' ? 'wish' : 'gift';
  const quantity = Math.max(1, Math.round(input.quantity ?? 1));
  const recipientName = input.who ? RESIDENTS[input.who].name : '我';
  const qtyText = quantity > 1 ? ` ${quantity} 份` : '一份';
  const episodeText = input.note?.trim()
    ? input.note.trim().slice(0, 140)
    : source === 'wish'
      ? `客人帮我实现了今日心愿，从背包实际送来${qtyText}${label}，心里特别暖。`
      : `客人从背包实际送了我${qtyText}${label}，${input.tier === 'loved' ? '正好是我最喜欢的，特别开心' : '心里挺暖的'}。`;

  let next = appendEpisode(memory, {
    id: `${source}-${at}-${input.who ?? 'resident'}-${input.itemId}`,
    kind: 'chat',
    source,
    verifiedGift: true,
    text: episodeText,
    actors: ['player'],
    tags: source === 'wish' ? [label, '心愿', '真实送礼', '心意'] : [label, '送礼', '真实送礼', '心意'],
    importance: input.tier === 'loved' || source === 'wish' ? 8 : 6,
    emotion: input.wasAngry ? '缓和' : '开心',
    privacy: 'public',
    at,
  });

  if (input.recordFact !== false) {
    const key = normKey(`送过${label}`).slice(0, 32);
    const fact: PlayerFact = {
      key,
      text: `客人从背包实际送过${recipientName}${qtyText}${label}`,
      evidence: `[系统实送:${label}×${quantity}]`,
      privacy: 'public',
      source,
      verifiedGift: true,
      updatedAt: at,
    };
    const facts = [...(next.playerFacts ?? [])];
    const idx = facts.findIndex(f => f.key === key);
    if (idx >= 0) facts[idx] = fact;
    else if (facts.length < MAX_PLAYER_FACTS) facts.push(fact);
    else {
      facts.sort((a, b) => a.updatedAt - b.updatedAt);
      facts[0] = fact;
    }
    next = { ...next, playerFacts: facts };
  }

  return next;
}

/** 清理单个居民记忆本中未经过真实背包扣减校验的历史脏送礼记录（事实 + 情景回忆）。 */
export function purgeUnverifiedGiftMemories(memory: ResidentMemory): {
  memory: ResidentMemory;
  removedFacts: number;
  removedEpisodes: number;
} {
  const oldFacts = memory.playerFacts ?? [];
  const nextFacts = oldFacts.filter(fact => !isUnverifiedGiftFact(fact));
  const removedFacts = oldFacts.length - nextFacts.length;

  const oldEpisodes = memory.episodes ?? [];
  const nextEpisodes = oldEpisodes.filter(ep => !isUnverifiedGiftEpisode(ep));
  const removedEpisodes = oldEpisodes.length - nextEpisodes.length;

  if (!removedFacts && !removedEpisodes) {
    return { memory, removedFacts: 0, removedEpisodes: 0 };
  }

  const { playerFacts: _oldF, episodes: _oldE, ...rest } = memory;
  const cleaned: ResidentMemory = {
    ...rest,
    ...(nextFacts.length ? { playerFacts: nextFacts } : {}),
    ...(nextEpisodes.length ? { episodes: nextEpisodes } : {}),
  };
  return { memory: cleaned, removedFacts, removedEpisodes };
}

/** 批量清理全部农场居民记忆本中未经过背包扣减校验的假送礼脏记录。 */
export function purgeUnverifiedGiftMemoriesAll(memories: FarmMemories): {
  memories: FarmMemories;
  removedFacts: number;
  removedEpisodes: number;
} {
  let removedFacts = 0;
  let removedEpisodes = 0;
  let changed = false;
  const next: FarmMemories = { ...memories };
  for (const id of RESIDENT_IDS) {
    const res = purgeUnverifiedGiftMemories(memories[id]);
    if (res.removedFacts || res.removedEpisodes) {
      next[id] = res.memory;
      removedFacts += res.removedFacts;
      removedEpisodes += res.removedEpisodes;
      changed = true;
    }
  }
  return { memories: changed ? next : memories, removedFacts, removedEpisodes };
}

export function applyPeerImpressions(
  memories: FarmMemories,
  rawUpdates: unknown,
  participants: readonly ResidentId[],
  at: number,
): FarmMemories {
  const updates = asObj(rawUpdates);
  if (!Object.keys(updates).length) return memories;
  let next = memories;
  for (const [edge, rawValue] of Object.entries(updates).slice(0, 8)) {
    const match = /^([a-z]+)\s*(?:->|→|:)\s*([a-z]+)$/.exec(edge.trim());
    if (!match) continue;
    const [, from, to] = match;
    if (!isResidentId(from) || !isResidentId(to) || from === to) continue;
    if (!participants.includes(from) || !participants.includes(to)) continue;
    let note = '';
    let stance: PeerStance = 'neutral';
    if (typeof rawValue === 'string') {
      note = rawValue.trim().slice(0, 110);
    } else {
      const obj = asObj(rawValue);
      note = typeof obj.note === 'string' ? obj.note.trim().slice(0, 110) : '';
      if (PEER_STANCES.has(obj.stance as PeerStance)) stance = obj.stance as PeerStance;
    }
    if (!note || note.length < 3 || isSensitiveFarmText(note)) continue;
    if (next === memories) next = { ...memories };
    const targetMem = next[from];
    next[from] = {
      ...targetMem,
      peerImpressions: {
        ...(targetMem.peerImpressions ?? {}),
        [to]: { note, stance, updatedAt: at },
      },
    };
  }
  return next;
}

export function appendReflection(memory: ResidentMemory, note: string): ResidentMemory {
  const clean = note.trim().slice(0, 120);
  if (!clean || isSensitiveFarmText(clean) || isGiftClaimMemoryText(clean)) return memory;
  const existing = memory.reflections ?? [];
  const norm = normKey(clean);
  if (existing.some(item => normKey(item) === norm)) return memory;
  return { ...memory, reflections: [...existing, clean].slice(-MAX_REFLECTIONS) };
}

/** 离线或未提供 AI 记忆摘要时的轻量自动反思合成：每累积 6 条情景记忆提炼一次阶段印象。 */
export function maybeSynthesizeReflection(memory: ResidentMemory, actor: ResidentId, at: number): ResidentMemory {
  const episodes = (memory.episodes ?? []).filter(ep => ep.privacy === 'public');
  if (episodes.length < 4) return memory;
  const lastReflectionAt = episodes.filter(ep => ep.kind === 'reflection').at(-1)?.at ?? 0;
  const since = episodes.filter(ep => ep.kind !== 'reflection' && ep.at > lastReflectionAt);
  const weight = since.reduce((sum, ep) => sum + ep.importance, 0);
  if (weight < 24 && since.length < 5) return memory;

  const peerCounts = new Map<string, number>();
  for (const ep of since) {
    for (const other of ep.actors) {
      if (other !== actor) peerCounts.set(other, (peerCounts.get(other) ?? 0) + 1);
    }
  }
  const topPeer = [...peerCounts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
  const relayCount = since.filter(ep => ep.kind === 'relay').length;
  const groupCount = since.filter(ep => ep.kind === 'group').length;

  let reflection = '';
  if (relayCount >= 2) {
    reflection = '最近帮客人传了几次话，感觉自己越来越清楚大家心里在意什么。';
  } else if (groupCount >= 2) {
    reflection = '最近家里人常聚在一起热闹聊天，听大家各说各的看法挺有意思。';
  } else if (topPeer === 'player') {
    reflection = `最近和客人聊了好几回，感觉彼此熟悉了不少（好感 ${memory.affinity}/100）。`;
  } else if (topPeer && isResidentId(topPeer)) {
    reflection = `最近常和${RESIDENTS[topPeer].name}碰面聊天，彼此更有默契了。`;
  } else {
    return memory;
  }

  let next = appendReflection(memory, reflection);
  next = appendEpisode(next, {
    id: `refl-${actor}-${at}`,
    kind: 'reflection',
    text: reflection,
    actors: topPeer ? [topPeer] : [],
    tags: extractMemoryTags(reflection),
    importance: 7,
    privacy: 'public',
    at,
  });
  return next;
}

export interface NpcConversationMemoryNote {
  summary?: string;
  importance?: number;
  reflection?: string;
  impressions?: Record<string, unknown>;
}

export function readConversationMemoryNote(raw: unknown): NpcConversationMemoryNote | undefined {
  const obj = asObj(raw);
  const summary = typeof obj.summary === 'string' && obj.summary.trim().length >= 4
    ? obj.summary.trim().slice(0, 130)
    : undefined;
  const importance = typeof obj.importance === 'number' && Number.isFinite(obj.importance)
    ? Math.max(1, Math.min(10, Math.round(obj.importance)))
    : undefined;
  const reflection = typeof obj.reflection === 'string' && obj.reflection.trim().length >= 4
    ? obj.reflection.trim().slice(0, 120)
    : undefined;
  const impressions = obj.impressions && typeof obj.impressions === 'object' && !Array.isArray(obj.impressions)
    ? obj.impressions as Record<string, unknown>
    : undefined;
  if (!summary && !reflection && !impressions) return undefined;
  return { summary, importance, reflection, impressions };
}

/** NPC 自主互聊、多人现场讨论或转述结束后，向所有在场成员写入情景记忆与关系印象。 */
export function recordNpcConversationMemory(
  memories: FarmMemories,
  record: ResidentConversation,
  aiNote?: NpcConversationMemoryNote,
  at = record.endedAt ?? record.startedAt,
): FarmMemories {
  if (!record.lines.length || record.participants.length < 2) return memories;
  const isRelay = record.discussion?.kind === 'request';
  const participants = record.participants;
  let next: FarmMemories = { ...memories };

  if (isRelay) {
    const [actor, target] = participants;
    const question = record.discussion?.question ?? '';
    const outcome = record.requestOutcome ?? '';
    const intent: RelayIntent = record.discussion?.intent ?? 'ask';
    const sensitive = isSensitiveFarmText(`${question} ${outcome}`);
    const privacy: MemoryPrivacy = sensitive ? 'private' : 'public';
    const intentVerb = intent === 'convey' ? '转告' : intent === 'confront' ? '核实' : intent === 'invite' ? '邀约' : '打听';

    const actorSummary = aiNote?.summary && !isSensitiveFarmText(aiNote.summary)
      ? aiNote.summary
      : `替客人找${RESIDENTS[target].name}${intentVerb}了「${question.slice(0, 40)}」，${outcome ? outcome.slice(0, 60) : '已经聊过。'}`;
    const targetLastLine = record.lines.filter(l => l.speaker === target).at(-1)?.text ?? '';
    const targetSummary = `${RESIDENTS[actor].name}替客人来${intentVerb}「${question.slice(0, 40)}」${targetLastLine ? `，我回他说：${targetLastLine.slice(0, 50)}` : '。'}`;

    next[actor] = appendEpisode(next[actor], {
      id: `relay-actor-${record.id}`,
      kind: 'relay',
      text: actorSummary,
      actors: ['player', target],
      tags: extractMemoryTags(`${question} ${actorSummary}`),
      importance: aiNote?.importance ?? (intent === 'confront' ? 8 : 7),
      privacy,
      at,
    });
    next[target] = appendEpisode(next[target], {
      id: `relay-target-${record.id}`,
      kind: 'relay',
      text: targetSummary,
      actors: ['player', actor],
      tags: extractMemoryTags(`${question} ${targetLastLine}`),
      importance: aiNote?.importance ?? (intent === 'confront' ? 8 : 7),
      privacy,
      at,
    });
    if (aiNote?.impressions) {
      next = applyPeerImpressions(next, aiNote.impressions, participants, at);
    }
    next[actor] = maybeSynthesizeReflection(next[actor], actor, at);
    next[target] = maybeSynthesizeReflection(next[target], target, at);
    return next;
  }

  // Regular NPC-to-NPC or multi-party on-map discussion
  const names = participants.map(id => RESIDENTS[id].name).join('、');
  const firstLine = record.lines[0]?.text ?? '';
  const lastLine = record.lines.at(-1)?.text ?? '';
  const localSummary = record.discussion?.question
    ? `和${names}一起讨论了「${record.discussion.question.slice(0, 42)}」，最后聊到：${lastLine.slice(0, 45)}`
    : `和${names}聊了会儿天，从「${firstLine.slice(0, 28)}」聊到「${lastLine.slice(0, 36)}」`;
  const summary = aiNote?.summary && !isSensitiveFarmText(aiNote.summary) ? aiNote.summary : localSummary;
  const importance = aiNote?.importance ?? (participants.length >= 3 || record.discussion?.kind === 'debate' ? 6 : 4);
  const privacy: MemoryPrivacy = isSensitiveFarmText(summary) ? 'private' : 'public';

  for (const id of participants) {
    const others = participants.filter(other => other !== id);
    const peerNames = others.map(other => RESIDENTS[other].name).join('、');
    const text = aiNote?.summary && !isSensitiveFarmText(aiNote.summary)
      ? aiNote.summary
      : record.discussion?.question
        ? `和${peerNames}一起讨论「${record.discussion.question.slice(0, 40)}」，记住的是：${lastLine.slice(0, 48)}`
        : `和${peerNames}碰面聊了会儿：${firstLine.slice(0, 28)} → ${lastLine.slice(0, 38)}`;
    next[id] = appendEpisode(next[id], {
      id: `npc-${record.id}-${id}`,
      kind: participants.length >= 3 ? 'group' : 'npc_talk',
      text,
      actors: others,
      tags: extractMemoryTags(`${text} ${record.discussion?.question ?? ''}`),
      importance,
      privacy,
      at,
    });
    if (aiNote?.reflection && !isSensitiveFarmText(aiNote.reflection)) {
      next[id] = appendReflection(next[id], aiNote.reflection);
    }
    next[id] = maybeSynthesizeReflection(next[id], id, at);
  }
  if (aiNote?.impressions) {
    next = applyPeerImpressions(next, aiNote.impressions, participants, at);
  }
  return next;
}

/** 家庭多人聊天室：仅将本轮记忆写入在场成员（不在场的成员完全不知情，保持信息隔离）。 */
export function recordGroupChatMemory(
  memories: FarmMemories,
  members: readonly ResidentId[],
  playerText: string,
  replies: readonly { speaker: ResidentId; text: string }[],
  aiNote: NpcConversationMemoryNote | undefined,
  at: number,
): FarmMemories {
  if (!members.length || !replies.length) return memories;
  const sensitive = isSensitiveFarmText(playerText);
  const privacy: MemoryPrivacy = sensitive ? 'private' : 'public';
  const summary = aiNote?.summary && !isSensitiveFarmText(aiNote.summary) && !isGiftClaimMemoryText(aiNote.summary)
    ? aiNote.summary
    : playerText.trim()
      ? `家庭群聊里客人提到「${playerText.trim().slice(0, 36)}」，${RESIDENTS[replies[0].speaker].name}接话说：${replies[0].text.slice(0, 42)}`
      : `大家在家庭群聊接着聊了会儿：${RESIDENTS[replies[0].speaker].name}说「${replies[0].text.slice(0, 46)}」`;

  let next: FarmMemories = { ...memories };
  for (const id of members) {
    const others = ['player', ...members.filter(m => m !== id)];
    const ownLine = replies.find(r => r.speaker === id)?.text;
    const text = ownLine && !aiNote?.summary
      ? `${summary.slice(0, 75)}（我回：${ownLine.slice(0, 35)}）`
      : summary;
    next[id] = appendEpisode(next[id], {
      id: `grp-${at}-${id}`,
      kind: 'group',
      text,
      actors: others,
      tags: extractMemoryTags(`${playerText} ${replies.map(r => r.text).join(' ')}`),
      importance: aiNote?.importance ?? (playerText.trim() ? 6 : 4),
      privacy,
      at,
    });
    if (aiNote?.reflection && !isSensitiveFarmText(aiNote.reflection)) {
      next[id] = appendReflection(next[id], aiNote.reflection);
    }
    next[id] = maybeSynthesizeReflection(next[id], id, at);
  }
  if (aiNote?.impressions) {
    next = applyPeerImpressions(next, aiNote.impressions, members, at);
  }
  return next;
}

export function removePlayerFact(memory: ResidentMemory, key: string): ResidentMemory {
  if (!memory.playerFacts?.length) return memory;
  const nextFacts = memory.playerFacts.filter(f => f.key !== key);
  const { playerFacts: _ignored, ...rest } = memory;
  return nextFacts.length ? { ...rest, playerFacts: nextFacts } : rest;
}

export function removeMemoryEpisode(memory: ResidentMemory, id: string): ResidentMemory {
  if (!memory.episodes?.length) return memory;
  const nextEpisodes = memory.episodes.filter(ep => ep.id !== id);
  const { episodes: _ignored, ...rest } = memory;
  return nextEpisodes.length ? { ...rest, episodes: nextEpisodes } : rest;
}

/** 构造注入给 LLM 的人格记忆块：支持居民与集市商贩，按场景自动控制隐私边界与篇幅。 */
export function formatPersonaMemoryBlock(
  actor: string,
  memory: ResidentMemory,
  options: {
    query: string;
    peers: readonly string[];
    at: number;
    includePrivate: boolean;
    includePlayerTurns?: boolean;
    maxEpisodes?: number;
  },
): string {
  const sections: string[] = [];
  const facts = (memory.playerFacts ?? [])
    .filter(f => !isUnverifiedGiftFact(f) && (options.includePrivate || f.privacy === 'public'))
    .sort((a, b) => b.updatedAt - a.updatedAt)
    .slice(0, options.includePrivate ? 8 : 3);
  if (facts.length) {
    sections.push('对客人的长期了解：' + facts.map(f => `${isVerifiedGiftFact(f) ? '[真实送礼]' : ''}${f.key}=${f.text}`).join('；'));
  }

  const peerNotes: string[] = [];
  for (const peer of options.peers) {
    if (isResidentId(peer) && memory.peerImpressions?.[peer]) {
      peerNotes.push(`对${RESIDENTS[peer].name}：${memory.peerImpressions[peer]!.note}`);
    }
  }
  if (peerNotes.length) {
    sections.push('对在场家人的印象：' + peerNotes.join('；'));
  }

  const episodes = retrievePersonaMemories(memory, options.query, options.peers, options.at, {
    includePrivate: options.includePrivate,
    limit: options.maxEpisodes ?? 4,
  }).filter(ep => !isUnverifiedGiftEpisode(ep));
  if (episodes.length) {
    sections.push('相关记忆片段：' + episodes.map(ep => `${isVerifiedGiftEpisode(ep) ? '[真实送礼] ' : ''}${ep.text}`).join(' / '));
  }

  if (options.includePlayerTurns) {
    const safeTurns = memory.turns
      .filter(t => !t.unavailable && !isSensitiveFarmText(`${t.player} ${t.reply}`))
      .slice(-3);
    if (safeTurns.length) {
      sections.push(
        `我最近和客人的直接互动（好感${memory.affinity}/100，心情${memory.mood ?? '平静'}）：` +
        safeTurns.map(t => {
          const isRealGift = Boolean(t.gift);
          const verbalOnly = !isRealGift && isVerbalGiftClaim(t.player);
          const prefix = isRealGift ? '[真实送礼] 客人' : verbalOnly ? '客人嘴上说' : '客人';
          const suffix = verbalOnly ? '（未实际递出礼物）' : '';
          return `${prefix}「${t.player.slice(0, 32)}」${suffix}→ 我「${t.reply.slice(0, 36)}」`;
        }).join('；'),
      );
    } else if (memory.mood && memory.mood !== '缓和') {
      sections.push(`我对客人的当前状态：好感${memory.affinity}/100，心情${memory.mood}。`);
    }
  }

  const reflections = (memory.reflections ?? []).slice(-2);
  if (reflections.length) {
    sections.push('近期感受：' + reflections.join(' '));
  }

  return sections.join('\n');
}
