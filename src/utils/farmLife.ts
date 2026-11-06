import { personalityContext } from './farmPersonality';
import type { FarmDiscussion } from './farmDiscussion';

export const RESIDENT_IDS = ["door", "gu", "xiaoba", "yujie", "weigang", "chicken"] as const;
export type ResidentId = typeof RESIDENT_IDS[number];
export const RESIDENTS: Record<ResidentId, {
  name: string;
  row: number;
  identity: string;
  persona: string;
}> = {
  door: {
    name: "door",
    row: 0,
    identity: "爸爸 · dark-study 作者",
    persona: "知书达理、有文化，懂电脑、编程和前沿科技，也擅长解决生活里的难题，是家里综合智力最高的人。跟人聊天有分寸，能用贴近日常的比喻讲清复杂问题，偶尔自嘲。遇到顾板起脸催他吃饭，会乖乖合上电脑。"
  },
  gu: {
    name: "顾",
    row: 1,
    identity: "妈妈 · 擅长照料植物",
    persona: "温柔可爱，俏皮又持家，很会体察和照顾人，擅长安排家务，也常下地帮忙播种、浇水。对家人有耐心，偶尔会对熬夜或忘记吃饭的 door 板起脸，语气凶一点却是心疼，两人感情很好。"
  },
  xiaoba: {
    name: "小八",
    row: 2,
    identity: "大儿子 · 家里老大",
    persona: "稳重话少，会照顾两个弟弟。喜欢玩游戏，也爱自己设计地图、关卡和故事，想象力和创造力丰富。偶尔会伤感低落，想安静待一会儿，也愿意接受家人的陪伴。感情私事很少提起。"
  },
  yujie: {
    name: "玉洁",
    row: 3,
    identity: "二儿子 · 戴眼镜的校草",
    persona: "戴眼镜的校草，喜欢唱歌、看小说，最喜欢的歌手是汪苏泷。嘴毒心软，吐槽一针见血，遇到家人难过却会悄悄帮忙。心思敏感细腻，在感情里偏被动，怕打扰别人，容易把自己的需要往后放。"
  },
  weigang: {
    name: "唯刚",
    row: 4,
    identity: "小儿子 · 钓鱼佬",
    persona: "把钓鱼当职业的钓鱼佬，常在池边守漂，也喜欢研究数学和读仙侠小说。很聪明，聊到解题或钓鱼会认真分析。见生人有点害羞胆怯，怕把事做砸，有家人陪会更敢尝试。偶尔把鱼竿叫本命法宝，紫色帽子是他的装扮。"
  },
  chicken: {
    name: "坤坤",
    row: 5,
    identity: "家养小鸡 · 农场宠物",
    persona: "圆滚滚的小鸡，胆小黏人。用宠物的视角聊米粒、虫子、晒太阳和自己的鸡窝，偶尔吹嘘球技。说话短，常带一个「咕」。"
  }
};
export const FARM_FAMILY_CONTEXT = [
  'door 是爸爸，顾是妈妈，两人是伴侣，共同养育三个儿子。',
  '小八是大哥，玉洁是二哥，唯刚是最小的弟弟。孩子称 door 为爸或爸爸，称顾为妈或妈妈，兄弟按长幼称呼。',
  '小鸡坤坤是全家养的宠物，以名字称呼家人。家人叫它坤坤，轮流喂食、添水和照料鸡窝。',
  '一家人感情很好，偶尔斗嘴也会互相照顾。玩家来农场做客。保持各自的身份和称呼，用日常小事自然体现关系，避免反复介绍家谱，不擅自编造任何人的私密往事。',
].join('\n');

const XIAOBA_FAMILIAR_TURNS = 5;
const A_LV_NAME = /阿[绿綠]/;

export function privateFarmChatReply(who: ResidentId, text: string, completedTurns: number): string | null {
  const mentionsName = A_LV_NAME.test(text);
  const pastRelationship = /前女友|前任|分手|(?:以前|曾经|过去).*(?:喜欢|恋爱|谈过|交往)|喜欢过(?:谁|的人|的女孩|的女生)/;
  if (!mentionsName && (who !== 'xiaoba' || !pastRelationship.test(text))) return null;
  if (who !== 'xiaoba') return '别人的私事，还是等他自己愿意讲吧。';

  const question = /[？?]|谁|什么|吗|么|为什么|怎么|能不能|(?:说说|聊聊|讲讲|说一下|聊一下|讲一下|告诉我)\s*(?:你|关于|当年|以前|过去|阿[绿綠]|前任|前女友|分手)/;
  const asks = text.split(/[，,。！!；;\n]/).some(clause =>
    (A_LV_NAME.test(clause) || pastRelationship.test(clause)) && question.test(clause)
  );
  if (!asks || completedTurns < XIAOBA_FAMILIAR_TURNS) return '那是挺私人的事，我想等熟一点再聊。';
  return '以前我喜欢过一个叫阿绿的女孩。我们在一起过，后来分开了。现在偶尔想起来还是会有点难过。谢谢你愿意听我说。';
}

export const isResidentId = (value: unknown): value is ResidentId => RESIDENT_IDS.includes(value as ResidentId);
export type LifeMode = 'quiet' | 'normal' | 'lively' | 'aiTown' | 'custom';
export interface LifeSettings {
  version: 3;
  mode: LifeMode;
  roaming: boolean;
  chatter: boolean;
  online: boolean;
  longTalks: boolean;
  naturalTalks: boolean;
  shareTopics: boolean;
  activitySeconds: number;
  encounterChance: number;
  conversationCooldown: number;
  rounds: number;
  aiRatio: number;
  aiMinutes: number;
  dailyLimit: number;
  nightActivity: number;
}
export const MODE_NAMES = {
  quiet: '安静农场',
  normal: '日常生活',
  lively: '热闹村庄',
  aiTown: 'AI 小镇',
  custom: '自定义'
};
export const PRESETS: Record<Exclude<LifeMode, 'custom'>, LifeSettings> = {
  quiet: {
    version: 3,
    mode: 'quiet',
    roaming: true,
    chatter: true,
    online: false,
    longTalks: false,
    naturalTalks: false,
    shareTopics: true,
    activitySeconds: 45,
    encounterChance: 12,
    conversationCooldown: 300,
    rounds: 2,
    aiRatio: 0,
    aiMinutes: 30,
    dailyLimit: 1,
    nightActivity: 10
  },
  normal: {
    version: 3,
    mode: 'normal',
    roaming: true,
    chatter: true,
    online: false,
    longTalks: false,
    naturalTalks: false,
    shareTopics: true,
    activitySeconds: 16,
    encounterChance: 40,
    conversationCooldown: 90,
    rounds: 2,
    aiRatio: 25,
    aiMinutes: 10,
    dailyLimit: 3,
    nightActivity: 30
  },
  lively: {
    version: 3,
    mode: 'lively',
    roaming: true,
    chatter: true,
    online: false,
    longTalks: false,
    naturalTalks: false,
    shareTopics: true,
    activitySeconds: 8,
    encounterChance: 80,
    conversationCooldown: 35,
    rounds: 4,
    aiRatio: 15,
    aiMinutes: 5,
    dailyLimit: 5,
    nightActivity: 50
  },
  aiTown: {
    version: 3,
    mode: 'aiTown',
    roaming: true,
    chatter: true,
    online: true,
    longTalks: false,
    naturalTalks: false,
    shareTopics: true,
    activitySeconds: 10,
    encounterChance: 70,
    conversationCooldown: 60,
    rounds: 3,
    aiRatio: 85,
    aiMinutes: 3,
    dailyLimit: 10,
    nightActivity: 45
  }
};
export const DEFAULT_LIFE = PRESETS.normal;
export const SHORT_TALK_MAX = 6;
export const LONG_TALK_MAX = 30;
export const TALK_BATCH_ROUNDS = 6;
export const SETTING_RANGES = {
  activitySeconds: [4, 60],
  encounterChance: [0, 100],
  conversationCooldown: [20, 600],
  rounds: [2, LONG_TALK_MAX],
  aiRatio: [0, 100],
  aiMinutes: [1, 60],
  dailyLimit: [0, 50],
  nightActivity: [0, 100]
} as const;
export type NumericLifeSetting = keyof typeof SETTING_RANGES;
const object = (raw: unknown): Record<string, unknown> => raw && typeof raw === 'object' && !Array.isArray(raw) ? raw as Record<string, unknown> : {};
const number = (raw: unknown, fallback: number, min: number, max: number) => typeof raw === 'number' && Number.isFinite(raw) ? Math.max(min, Math.min(max, Math.round(raw))) : fallback;
export function normalizeLifeSettings(raw: unknown): LifeSettings {
  const v = object(raw);
  const base = {
    ...DEFAULT_LIFE
  };
  for (const key of ['roaming', 'chatter', 'online', 'longTalks', 'naturalTalks', 'shareTopics'] as const) if (typeof v[key] === 'boolean') base[key] = v[key];
  for (const key of Object.keys(SETTING_RANGES) as NumericLifeSetting[]) base[key] = number(v[key], base[key], SETTING_RANGES[key][0], SETTING_RANGES[key][1]);
  if (!base.longTalks) {
    base.naturalTalks = false;
    base.rounds = Math.min(base.rounds, SHORT_TALK_MAX);
  }
  // Old intervals described forced chat; migrate to a personal encounter cooldown.
  if (v.version !== 3 && typeof v.interval === 'number') base.conversationCooldown = number(v.interval, 90, 20, 600);
  const preset = typeof v.mode === 'string' && v.mode in PRESETS ? v.mode as Exclude<LifeMode, 'custom'> : null;
  base.mode = preset && (Object.keys(base) as (keyof LifeSettings)[]).every(k => k === 'mode' || k === 'shareTopics' || base[k] === PRESETS[preset][k]) ? preset : Object.keys(v).length ? 'custom' : 'normal';
  return base;
}
export const lifeDate = (at: number) => {
  const d = new Date(at);
  return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
};
export interface LifeUsage {
  date: string;
  count: number;
  lastAt: number;
}
export function normalizeLifeUsage(raw: unknown, at: number): LifeUsage {
  const v = object(raw);
  return {
    date: lifeDate(at),
    count: v.date === lifeDate(at) ? number(v.count, 0, 0, 10000) : 0,
    lastAt: number(v.lastAt, 0, 0, Number.MAX_SAFE_INTEGER)
  };
}
export function reserveLifeRequest(raw: LifeUsage, settings: LifeSettings, at: number): LifeUsage | null {
  const usage = normalizeLifeUsage(raw, at);
  if (!settings.online || !settings.chatter || settings.aiRatio <= 0 || usage.count >= settings.dailyLimit || usage.lastAt > 0 && at - usage.lastAt < settings.aiMinutes * 60000) return null;
  return {
    ...usage,
    count: usage.count + 1,
    lastAt: at
  };
}
export interface ResidentLine {
  speaker: ResidentId;
  text: string;
  at: number;
}
export const FARM_TOPICS = {
  games: { label: '游戏关卡', response: '我喜欢那种自己走一走才发现的路线。' },
  fishing: { label: '钓鱼', response: '下回去池边的时候，我想试试换个钓位。' },
  music: { label: '唱歌', response: '有些歌只听一句，就能想起以前的日子。' },
  books: { label: '小说故事', response: '我最喜欢看角色犹豫了半天，最后还是下定决心。' },
  math: { label: '数学解题', response: '同一道题，换个画法有时就能看明白。' },
  tech: { label: '电脑技术', response: '我也想知道，那些看起来复杂的东西是怎么做出来的。' },
  garden: { label: '种菜养花', response: '说起来，有几株苗放到窗边之后长得特别好。' },
  pets: { label: '照顾小动物', response: '我觉得它们也会记得谁经常来看它。' },
} as const;
export type FarmTopicId = keyof typeof FARM_TOPICS;
export type SharedFarmTopic = { from: ResidentId; topic: FarmTopicId };

function restoreSharedTopic(value: unknown, participants: readonly ResidentId[]): SharedFarmTopic | undefined {
  const topic = object(value);
  if (isResidentId(topic.from) && participants.includes(topic.from) &&
      typeof topic.topic === 'string' && Object.hasOwn(FARM_TOPICS, topic.topic)) {
    return { from: topic.from, topic: topic.topic as FarmTopicId };
  }
}

export function sharedTopicExchange(pair: readonly [ResidentId, ResidentId], shared: SharedFarmTopic) {
  const topic = FARM_TOPICS[shared.topic];
  const listener = pair[0] === shared.from ? pair[1] : pair[0];
  const recall = `我和来农场的客人聊过${topic.label}，还挺有意思。`;
  const response = listener === 'chicken' ? '咕，客人下次来，我也想蹲旁边听！' : topic.response;
  const ownerStarts = pair[0] === shared.from;
  const ownerRecall = shared.from === 'chicken' ? '咕，' + recall : recall;
  const ownerFollowUp = shared.from === 'chicken' ? '咕，下回见到客人，我还想接着听。' : '下回客人来，也可以接着和他聊这件事。';
  const lines = ownerStarts
    ? [ownerRecall, response, ownerFollowUp, listener === 'chicken' ? '咕，到时记得叫我。' : '好，遇见了我也问问。']
    : [listener === 'chicken' ? '咕，你和客人都聊了什么呀？' : '你上回和客人都聊了些什么？', ownerRecall, response, ownerFollowUp];
  return lines.map((text, index) => ({ speaker: pair[index % 2], text }));
}

export interface ResidentConversation {
  id: string;
  participants: ResidentId[];
  startedAt: number;
  endedAt: number | null;
  source: 'encounter' | 'scheduled/local' | 'player_command';
  sharedTopic?: SharedFarmTopic;
  discussion?: FarmDiscussion;
  activity?: 'project' | 'rest';
  online: boolean;
  lines: ResidentLine[];
}
export function readLifeBatch(raw: string, pair: readonly ResidentId[], rounds: number, natural: boolean, flexible = false) {
  try {
    const value = object(JSON.parse(raw));
    if (natural && typeof value.done !== 'boolean') return null;
    const done = natural && value.done === true;
    const count = done && Array.isArray(value.lines) ? value.lines.length / pair.length : rounds;
    if (!Number.isInteger(count) || count < Math.min(rounds, 2) || count > rounds) return null;
    const lines = readLifeReply(raw, pair, count, flexible);
    return lines ? { lines, done } : null;
  } catch {
    return null;
  }
}

export function readLifeReply(raw: string, pair: readonly ResidentId[], rounds = 1, flexible = false): Omit<ResidentLine, 'at'>[] | null {
  try {
    const v = object(JSON.parse(raw));
    if (!Array.isArray(v.lines) || v.lines.length !== rounds * pair.length) return null;
    if (!v.lines.every((raw, i) => {
      const l = object(raw);
      const validSpeaker = flexible ? isResidentId(l.speaker) && pair.includes(l.speaker) && (i === 0 || l.speaker !== object((v.lines as unknown[])[i - 1]).speaker) : l.speaker === pair[i % pair.length];
      return validSpeaker && typeof l.text === 'string' && l.text.trim().length > 0 && l.text.length <= 44;
    })) return null;
    if (flexible && !pair.every(id => (v.lines as unknown[]).some(line => object(line).speaker === id))) return null;
    return v.lines.map(raw => {
      const l = object(raw);
      return {
        speaker: l.speaker as ResidentId,
        text: (l.text as string).trim()
      };
    });
  } catch {
    return null;
  }
}
/** Legacy single lines retain only known speakers; unknown partners are never invented. */
export function restoreConversations(raw: unknown): ResidentConversation[] {
  if (!Array.isArray(raw)) return [];
  const result: ResidentConversation[] = [];
  for (const entry of raw.slice(-100)) {
    const v = object(entry);
    if (Array.isArray(v.lines) && typeof v.id === 'string' && Array.isArray(v.participants)) {
      const participants = [...new Set(v.participants.filter(isResidentId))];
      const lines = v.lines.map(object).filter(l => isResidentId(l.speaker) && participants.includes(l.speaker) && typeof l.text === 'string' && l.text.length <= 160).slice(0, LONG_TALK_MAX * 3).map(l => ({
        speaker: l.speaker as ResidentId,
        text: (l.text as string).trim(),
        at: number(l.at, 0, 0, Number.MAX_SAFE_INTEGER)
      }));
      const sharedTopic = participants.length >= 2 && lines.length >= 2 ? restoreSharedTopic(v.sharedTopic, participants) : undefined;
      const rawDiscussion = object(v.discussion);
      const kind = rawDiscussion.kind;
      const discussion: FarmDiscussion | undefined = kind === 'discussion' || kind === 'debate' || kind === 'followup' ? {
        kind,
        ...(typeof rawDiscussion.topic === 'string' && Object.hasOwn(FARM_TOPICS, rawDiscussion.topic) ? { topic: rawDiscussion.topic as FarmTopicId } : {}),
        ...(typeof rawDiscussion.question === 'string' && v.source === 'player_command' ? { question: rawDiscussion.question.slice(0, 160) } : {}),
        ...(isResidentId(rawDiscussion.relayedBy) ? { relayedBy: rawDiscussion.relayedBy } : {}),
      } : undefined;
      if (participants.length && participants.length <= 3 && lines.length) result.push({
        ...(discussion ? { discussion } : {}),
        ...(v.source === 'scheduled/local' && (v.activity === 'project' || v.activity === 'rest') ? { activity: v.activity } : {}),
        ...(sharedTopic ? { sharedTopic } : {}),
        id: v.id.slice(0, 100),
        participants,
        startedAt: number(v.startedAt, lines[0].at, 0, Number.MAX_SAFE_INTEGER),
        endedAt: number(v.endedAt, lines[lines.length - 1].at, 0, Number.MAX_SAFE_INTEGER),
        source: v.source === 'encounter' || v.source === 'player_command' ? v.source : 'scheduled/local',
        online: v.online === true,
        lines
      });
    } else if (isResidentId(v.speaker) && typeof v.text === 'string' && v.text.trim() && v.text.length <= 160) {
      const at = number(v.at, 0, 0, Number.MAX_SAFE_INTEGER);
      const previous = result[result.length - 1];
      if (previous && previous.id.startsWith('legacy-') && at >= previous.startedAt && at - previous.startedAt < 30000 && previous.lines.length < 12 && new Set([...previous.participants, v.speaker]).size <= 2) {
        previous.lines.push({
          speaker: v.speaker,
          text: v.text,
          at
        });
        previous.participants = [...new Set([...previous.participants, v.speaker])];
        previous.endedAt = at;
      } else result.push({
        id: `legacy-${at}-${result.length}`,
        participants: [v.speaker],
        startedAt: at,
        endedAt: at,
        source: 'scheduled/local',
        online: v.online === true,
        lines: [{
          speaker: v.speaker,
          text: v.text,
          at
        }]
      });
    }
  }
  return result.slice(-40);
}
type LocalScene = readonly [string, string];

const FAMILY_SCENES: { pair: [ResidentId, ResidentId]; exchanges: LocalScene[]; reverse: LocalScene[] }[] = [
  { pair: ['door', 'gu'], exchanges: [
    ['顾，我去喊孩子们回来吃饭。', '好，我给他们留了三碗热汤。'],
    ['顾，我再看一眼这篇计算机论文。', 'door，把电脑合上。汤凉了我可不热第三回。'],
    ['顾，孩子们轮流给坤坤添了水。', '我看见了，唯刚还把水碗移到阴凉处了。'],
  ], reverse: [
    ["door，热汤好了，帮我喊孩子们回来。","好，我去田边找他们。"],
    ["door，电脑合上！饭都热了第二遍啦。","听你的。明早你播种，我帮你提水。"],
    ["door，你看孩子们把坤坤照顾得多好。","嗯，连唯刚都记得给它换水。"],
  ] },
  { pair: ['door', 'xiaoba'], exchanges: [
    ['小八，剩下的篮子爸爸来搬。', '爸，那我先坐一会儿，给你也留个位置。'],
    ['小八，你给游戏画的新地图能给爸看看吗？', '爸，我想做条暗河，坐船就能进隐藏关。'],
    ['小八，你自己的点心怎么还没吃？', '爸，我刚给弟弟们分完，这块留着和你分。'],
  ], reverse: [
    ["爸，我把篮子搬完就去找弟弟。","小八，篮子放着，爸爸来搬。"],
    ["爸，我想做个每次下雨都会变样的游戏地图。","点子不错。先试着做一间会涨水的小屋？"],
    ["爸，我留了一块点心给你。","谢啦小八，来，咱俩一人一半。"],
  ] },
  { pair: ['door', 'yujie'], exchanges: [
    ['玉洁，蓝莓洗好再吃，给兄弟们留点。', '知道啦爸，最甜那颗给你留着！'],
    ['玉洁，你刚才哼的是汪苏泷的歌？', '对啊爸。我以为你戴着耳机，没听见呢。'],
    ['玉洁，今天怎么舍得把点心都端出来了？', '爸，小八哥搬了一下午篮子，我给他留的。'],
  ], reverse: [
    ["爸，我能先尝一颗蓝莓吗？","玉洁，先洗干净，记得给兄弟们留点。"],
    ["爸，我刚才唱得是不是有点跑调？","玉洁，有一句没站稳，你慢一点再唱给我听。"],
    ["爸，小八哥那份点心放哪儿了？","我给他留在桌上了，你去叫他吧。"],
  ] },
  { pair: ['door', 'weigang'], exchanges: [
    ['唯刚，你在算不同水深的上鱼次数？', '嗯，爸。光比钓了几条不行，还得看等了多久。'],
    ['唯刚，今天愿意给哥哥们讲讲那道题吗？', '爸，你先陪我讲一遍行吗？我怕讲岔了。'],
    ['唯刚，这道题可以先从最小的情况推。', '爸，我试试。要是能找出递推关系就好算了。'],
  ], reverse: [
    ["爸，我记下了每次浮漂下沉的时间。","不错，唯刚。把没上鱼的那几次也记上。"],
    ["爸，我怕给哥哥们讲错题。","唯刚，先讲给爸听，哪儿卡住我们一起想。"],
    ["爸，这道题我算出来了，可我还想找个短解。","好，唯刚。试试从图形上看，可能更直观。"],
  ] },
  { pair: ['door', 'chicken'], exchanges: [
    ['坤坤，我给你把窝里的稻草换好了。', '咕，door，今晚的窝软乎乎。'],
    ['坤坤，键盘先借我用用，你去晒太阳。', '咕，door，晒热的位置分你一半。'],
    ['坤坤，水碗给你摆在阴凉处了。', '谢谢 door，咕，我正好渴了。'],
  ], reverse: [
    ["咕，door，我的窝怎么变软啦？","坤坤，刚给你换了新稻草。"],
    ["咕，door，你的键盘好暖。","坤坤，去晒太阳吧，键盘借我一会儿。"],
    ["咕，door，水碗搬去哪儿啦？","在树荫下面呢，坤坤。"],
  ] },
  { pair: ['gu', 'xiaoba'], exchanges: [
    ['小八，弟弟们有我呢，来吃口热的。', '妈，那我今天想多喝一碗汤。'],
    ['小八，今天有点闷？妈妈陪你坐会儿。', '嗯，妈。我想安静一会儿，你在就好。'],
    ['小八，你把弟弟们的小铲子都收好了？', '嗯，妈。明天他们就不用满院子找了。'],
  ], reverse: [
    ["妈，弟弟们的汤我已经端过去了。","辛苦啦小八，这碗热的是你的。"],
    ["妈，我想在这里再坐一会儿。","好，妈妈陪你坐坐。"],
    ["妈，弟弟们的小铲子我都收好了。","谢谢小八，剩下的交给我，你去歇歇。"],
  ] },
  { pair: ['gu', 'yujie'], exchanges: [
    ['玉洁，点心先摆上桌，等哥哥弟弟一起吃。', '知道啦妈，我负责守着，保证只闻香味。'],
    ['玉洁，眼镜起雾了，汤放这儿晾晾。', '妈，你先喝你的。刚才忙着浇水都没坐下。'],
    ['玉洁，你给唯刚留的那块饼在盘子里。', '谢谢妈！他刚才摔了，我想哄哄他。'],
  ], reverse: [
    ["妈，我能当点心的试吃员吗？","玉洁，等哥哥弟弟来了，你们一起试。"],
    ["妈，我今天一颗蓝莓都没尝。","玉洁，先把嘴角的蓝莓汁擦擦。"],
    ["妈，我想给唯刚留一块饼。","好，我帮你拿个小盘子。"],
  ] },
  { pair: ['gu', 'weigang'], exchanges: [
    ['唯刚，袖口湿透了，来换件干的再钓。', '谢谢妈。我还想等一会儿，浮漂刚动了一下。'],
    ['唯刚，妈妈要去给新种的苗浇水，你来搭把手？', '好，妈。我算过了，小水壶跑两趟就够。'],
    ['唯刚，池边风大，把外套穿上再看书。', '知道了妈，我把这章仙侠看完就回去。'],
  ], reverse: [
    ["妈，我收竿时把袖口弄湿了。","唯刚，来换件干的。鱼竿靠门边就好。"],
    ["妈，我帮你算好每垄种几株了。","真仔细，唯刚。那咱们按你画的线播种。"],
    ["妈，我想坐这儿看完这章仙侠。","行，唯刚，外套披上，我给你留盏灯。"],
  ] },
  { pair: ['gu', 'chicken'], exchanges: [
    ['坤坤，来吃米，我在鸡窝边给你撒了一把。', '咕，顾撒的米最香，我来了！'],
    ['坤坤，打雷了，来屋檐下躲一会儿。', '咕，顾在这儿，我就敢走过去啦。'],
    ['坤坤，脚上的泥冲掉再回窝。', '咕，顾，洗完还能再晒一会儿吗？'],
  ], reverse: [
    ["咕，顾，今天也有米粒吗？","有，坤坤，在你鸡窝旁边。"],
    ["咕，顾，刚刚的雷好响。","坤坤，到我这儿来，屋檐下面淋不到。"],
    ["咕，顾，脚上都是泥。","来，坤坤，我给你冲一冲。"],
  ] },
  { pair: ['xiaoba', 'yujie'], exchanges: [
    ['玉洁，给唯刚留一块，别光顾着尝。', '小八哥，我把最大的那块留给他了！'],
    ['玉洁，我今天没什么心情打游戏。', '哥，那就不打。你坐这儿，我给你哼两句。'],
    ['玉洁，咱爸叫我们去吃饭了。', '来了哥！咱妈做的汤我在田里都闻见了。'],
  ], reverse: [
    ["小八哥，最大的那块我留给唯刚了。","谢谢玉洁，他回来准高兴。"],
    ["哥，你盯着游戏菜单半天了，我陪你坐会儿？","好啊玉洁，你昨天唱的那首还能再哼一遍吗？"],
    ["小八哥，咱妈的汤煮好了吗？","快了，咱爸刚叫我们回去洗手。"],
  ] },
  { pair: ['xiaoba', 'weigang'], exchanges: [
    ['唯刚，你愿意带哥哥去看你常钓的地方吗？', '好，大哥。那地方安静，鱼也不容易受惊。'],
    ['唯刚，鱼竿装好了吗？哥哥陪你试试。', '大哥，我有点怕抛不准。你先站我旁边好吗？'],
    ['唯刚，爸妈在门口等我们呢。', '大哥等等，我先收一下鱼线。'],
  ], reverse: [
    ["大哥，池边有个钓位，今天想带你去看看。","好啊唯刚，今天哥哥跟你学。"],
    ["大哥，我不太敢一个人试新鱼竿。","那我跟你一起去，慢慢试。"],
    ["大哥，爸妈在等我们吗？","在门口呢，唯刚，咱们把渔具收好就回去。"],
  ] },
  { pair: ['xiaoba', 'chicken'], exchanges: [
    ['坤坤，别跟着水壶跑，我给你换了干净的水。', '咕，小八，我在这里等水碗。'],
    ['坤坤，筐底有点阴凉，给你腾了个位置。', '咕，小八，我就在你旁边打个盹。'],
    ['坤坤，天黑了，我送你回窝。', '咕，小八，走慢一点，我跟得上。'],
  ], reverse: [
    ["咕，小八，水碗里的水好清。","刚换的，坤坤，慢慢喝。"],
    ["咕，小八，我能在你旁边打盹吗？","来，坤坤，我给你留了个阴凉位置。"],
    ["咕，小八，天黑了，我找不到窝。","坤坤，跟着我走，我送你回去。"],
  ] },
  { pair: ['yujie', 'weigang'], exchanges: [
    ['唯刚，二哥给你留了块饼，趁热吃。', '谢谢二哥！我给饼加个不掉渣的魔法。'],
    ['唯刚，跟鱼聊天比跟人容易吧？我陪你钓。', '二哥，坐我这边吧。我给你绑了副鱼钩。'],
    ['唯刚，帽子借二哥戴一下行不行？', '二哥，你得先答应别把蓝莓藏进帽子。'],
  ], reverse: [
    ["二哥，你给我留饼了吗？","留啦，唯刚，最大的那块归你。"],
    ["二哥，我一个人不太敢去问新来的钓友。","怕啥，有我陪你。待会儿你先问，我给你兜底。"],
    ["二哥，我帽子里的蓝莓哪来的？","唯刚，那是二哥存的应急点心。"],
  ] },
  { pair: ['yujie', 'chicken'], exchanges: [
    ['坤坤，这是给你的谷粒，我带了自己的点心。', '咕，玉洁，今天我们各吃各的。'],
    ['坤坤，慢点啄，米又不会跑。', '咕，玉洁，你吃蓝莓的时候也很快。'],
    ['坤坤，我把小皮球滚过来了，接住！', '咕，玉洁，看我的绝招：用肚子挡球！'],
  ], reverse: [
    ["咕，玉洁，我的那份点心呢？","坤坤，你吃这把谷粒，我吃我的饼。"],
    ["咕，玉洁，吃那么快会噎着。","知道啦坤坤，你啄米也慢一点。"],
    ["咕，玉洁，再滚一次球给我！","坤坤接好，这次我往你左边滚。"],
  ] },
  { pair: ['weigang', 'chicken'], exchanges: [
    ['坤坤，我给你的鸡窝加了个暖和魔法。', '咕，唯刚，这次的稻草特别软。'],
    ['坤坤，你肯当我的魔法助手吗？', '咕，唯刚，我只会找虫子。'],
    ['坤坤，别怕雷，我用帽子给你挡一下。', '咕，唯刚，我贴着你就不怕啦。'],
  ], reverse: [
    ["咕，唯刚，今天窝里特别暖。","坤坤，我悄悄给你的稻草施了魔法。"],
    ["咕，唯刚，我找到一条虫子。","坤坤，你已经是合格的魔法助手啦。"],
    ["咕，唯刚，我想躲到你帽子下面。","过来吧坤坤，我陪你等雷声过去。"],
  ] },
];

export const LOCAL_SCENES = FAMILY_SCENES.flatMap(({ pair, exchanges, reverse }) => [
  ...exchanges.map(lines => ({ pair, lines })),
  ...reverse.map(lines => ({ pair: [pair[1], pair[0]] as [ResidentId, ResidentId], lines })),
]);

const LONG_DISCUSSIONS: LocalScene[][] = [
  [
    ['如果写个故事，你想让它从哪儿开始？', '从主角捡到一把不知道开哪扇门的钥匙开始。'],
    ['那把钥匙是别人故意留下的吗？', '也许是朋友留下的。朋友相信他能找到门。'],
    ['要是他第一天就猜错了呢？', '那就让他敲错门，认识一个原本遇不到的人。'],
    ['这个新朋友也在找门吗？', '我想让他负责修门。他知道镇上每扇门的声音。'],
    ['光听声音就能找门，挺有意思。', '对，最后那扇门要打开一点，才会发出声音。'],
    ['主角会不会怕门后什么都没有？', '会吧。有人愿意陪他等一会儿，他才敢推开。'],
    ['门后也许是个没人用的小舞台。', '那正好！可以请镇上的人来讲他们自己的故事。'],
    ['我喜欢这个结尾。钥匙最后归谁？', '挂在门外吧，下一个路过的人也能进来。'],
    ['要给故事起名，我想叫《没锁的门》。', '这个好。读完才发现，钥匙是请人过来的。'],
    ['改天一起把开头写下来？', '好，先写捡到钥匙那段，剩下的边写边想。'],
  ],
  [
    ['学一件新事，你喜欢自己摸索，还是有人带？', '先自己试一会儿。真卡住了，有人带一下就好。'],
    ['有时候我越想做好，越不敢动手。', '我也会。先把第一步缩小一点，容易多了。'],
    ['像学唱歌，先把一句唱顺？', '对，先听清一句的节拍，就不用从头硬唱。'],
    ['那一直只练一句，会不会太慢？', '不会啊，懂了这句怎么换气，下一句会容易些。'],
    ['如果别人一下就学会了呢？', '那可以问问他怎么练的。我们也有自己拿手的事。'],
    ['我喜欢学会后讲给别人听。', '讲的时候才会发现，原来有些地方我还没想透。'],
    ['但听的人可能不好意思说没听懂。', '那就问他想从哪一步再听一次，给人留点余地。'],
    ['我下回试试。你最近想学什么？', '想试着用几句话讲明白一本书里最喜欢的地方。'],
    ['也可以先讲给我听，我不急。', '好。讲不顺我就停下来想一想。'],
    ['说定了，改天我们各带一件新学会的小事。', '好呀，哪怕只学会一点点也算。'],
  ],
  [
    ['你有没有想过，为什么有些地方一闭眼就能想起来？', '有。通常是味道或者声音先把我带回去。'],
    ['那如果要给这座农场留个声音，你选什么？', '我选屋檐滴雨的声音。屋里安静的时候最清楚。'],
    ['我会选木门吱呀一声，像是有人回家了。', '那两个声音可以一起录，刚好是一场雨里的晚归。'],
    ['还可以留一段空白，让听的人想想门是谁开的。', '我会想到门边那盏灯。有人没回来，它就亮着。'],
    ['这样看来，我们记住的其实是当时有人在身边。', '嗯。所以同一个地方，各人想起的东西不一样。'],
    ['以后有客人来，也可以请他们选一个声音。', '好主意。也许他们听见的是我们早就习惯的声音。'],
    ['可录得太多，会不会最后都没空听？', '那就每人只留一小段，再写一句为什么选它。'],
    ['我想找个旧盒子，把写好的纸条放进去。', '放在门边吧。下回下雨，大家就会想起来。'],
    ['如果有一天木门不响了，那段还留着吗？', '当然。门修好了，声音还是那个晚上的。'],
    ['好，改天我们先听一场雨。', '行，到时候别急着录，先坐一会儿。'],
  ],
];

const PET_DISCUSSION: LocalScene[] = [
  ['坤坤，你最怕听见什么响声？', '咕，雷一响，我的羽毛都竖起来。'],
  ['我发现雷响之前，你常先躲到屋檐下。', '咕，风一变凉，我就去找干的地方。'],
  ['除了风，你还能听出什么？', '咕，能听出米掉进碗里！那个声音可好听了。'],
  ['那家里人走过来，你也能听出来吗？', '咕，跑得快的脚步和慢慢走的不一样。'],
  ['听出是家人，你就敢出来了？', '咕，我会先伸脑袋，再决定要不要走出来。'],
  ['你也可以留在窝里。我们会等你。', '咕，那我在窝里叫一声，你们也听得见吗？'],
  ['听得见。我也可以轻轻敲两下木板。', '咕，两下是你？那我要回两声。'],
  ['好，咱们试一次。叩、叩。', '咕，咕！我回得准不准？'],
  ['很准。下回你害怕，我就用这个暗号。', '咕，那我就知道有人在门外等我啦。'],
  ['聊了这么久，你要回窝歇一会儿吗？', '咕，我想了想，还是先听听米落进碗里的声音。'],
  ['说到吃的，今天那碗米够不够？', '咕，够。我把最后一粒藏到了碗边。'],
  ['你留那一粒是想明天吃吗？', '咕，想试试看明早还能不能找到。'],
  ['要是找不到，你打算怎么办？', '咕，我会顺着碗找一圈，再去看稻草下面。'],
  ['平时找虫子，你也是这样绕圈吗？', '咕，虫子要听。叶子一动，我就停下来等。'],
  ['你等得住吗？我看你常急着啄两下。', '咕，有时忍不住。啄早了，虫子就跑啦。'],
  ['那要不要试试数两下，再往前走？', '咕，我会数到二！一，二，然后再走。'],
  ['你学得快。也可以叫我陪你等。', '咕，你别走太重，叶子会跟着晃。'],
  ['好，我坐低一点，咱们都不出声。', '咕，那我要先小声说一句：谢谢你。'],
  ['不用客气。你看，左边那片叶子动了。', '咕，我等到二了。是风在吹，没有虫子。'],
  ['等到风停，就能听得更清楚。', '咕，等不到也行，我喜欢你在这儿。'],
  ['那我们再坐会儿。你平时喜欢靠哪儿晒太阳？', '咕，喜欢门槛边。那儿暖，还有人经过。'],
  ['可门槛上有人走，你不会怕吗？', '咕，熟人的脚步我认得。生人来了我就让开。'],
  ['下次客人来，你想自己迎过去吗？', '咕，我先从门后看看。等他蹲下来再过去。'],
  ['这样好。蹲下来的人看着没那么高。', '咕，手也低。我就能看见他拿了什么。'],
  ['如果他手里没有米，你还愿意过去吗？', '咕，也行。上次有人什么也没拿，就陪我晒太阳。'],
  ['看来你记得的不只是喂过你的人。', '咕，谁肯等我自己走过去，我也记得。'],
  ['那我们就在门边给客人留个小凳子。', '咕，好。我也有个要求，凳子别挡着太阳。'],
  ['放墙边，太阳照得到，你也能随时回窝。', '咕，那我还想给客人留半个暖位置。'],
  ['可以。困了就先回去，凳子我来搬。', '咕，说了这么多，我好像真有点困了。'],
  ['晚点见，坤坤。你那粒米还在碗边呢。', '咕，那就留给明天吧。我要回窝眯一会儿。'],
];

function longLocalConversation(pair: readonly [ResidentId, ResidentId], rounds: number, variant: number): Omit<ResidentLine, 'at'>[] {
  if (!pair.includes('chicken')) {
    const start = Math.abs(variant) % LONG_DISCUSSIONS.length;
    const chapters = [...LONG_DISCUSSIONS.slice(start), ...LONG_DISCUSSIONS.slice(0, start)];
    return chapters.flat().slice(0, rounds).flatMap(lines =>
      pair.map((speaker, index) => ({ speaker, text: lines[index] }))
    );
  }
  const petStarts = pair[0] === 'chicken';
  return PET_DISCUSSION.slice(0, rounds).flatMap(([person, pet], index) => petStarts
    ? [{ speaker: pair[0], text: PET_DISCUSSION[index - 1]?.[1] ?? '咕，你想和我聊聊声音吗？' }, { speaker: pair[1], text: person }]
    : [{ speaker: pair[0], text: person }, { speaker: pair[1], text: pet }]
  );
}

export function localConversation(pair: readonly [ResidentId, ResidentId], rounds: number, variant: number): Omit<ResidentLine, 'at'>[] {
  const scene = FAMILY_SCENES.find(({ pair: speakers }) => speakers.some(speaker => speaker === pair[0]) && speakers.some(speaker => speaker === pair[1]));
  if (!scene || pair[0] === pair[1]) return [];

  if (rounds > SHORT_TALK_MAX) return longLocalConversation(pair, rounds, variant);

  const exchanges = pair[0] === scene.pair[0] ? scene.exchanges : scene.reverse;
  return Array.from({ length: rounds }, (_, round) => {
    const lines = exchanges[(Math.abs(variant) + round) % exchanges.length];
    return pair.map((speaker, index) => ({ speaker, text: lines[index] }));
  }).flat();
}

for (const id of RESIDENT_IDS) RESIDENTS[id].persona += " " + personalityContext(id);
