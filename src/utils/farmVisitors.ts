import { farmChat, FarmChatError } from '@/services/farmChat';
import type { WaypointId } from '@/constants/farmMap';
import type { ChatMessage } from '@/types';
import type { WhaleCare } from '@/store/useWhalePet';
import { CROP_LABELS, RECIPES, type CropKind, type Recipe } from './farmEconomy';
import {
  applyFarmEmotionDelta,
  createInitialFarmEmotion,
  formatFarmEmotionForPrompt,
  normalizeFarmEmotion,
  whaleEmotionToFarmEmotion,
  type FarmEmotionDelta,
  type FarmEmotionState,
} from './farmEmotion';
import { RESIDENT_IDS, type ResidentId } from './farmLife';
import { shiftResidentMemoryEmotion, type FarmMemories } from './farmMemory';
import { appendEpisode, isSensitiveFarmText } from './farmPersonaMemory';
import { realDate } from './farmProgress';
import type { FarmPeriod, FarmWeather, TownEvent } from './farmTown';
import {
  buildWhaleEmotionPrompt,
  decayWhaleEmotion,
  resolveBondStage,
  type WhaleBondProfile,
  type WhaleEmotion,
} from './whaleEmotion';
import {
  buildWhaleMemoryPrompt,
  memoryRelevance,
  type WhaleEpisode,
  type WhaleFact,
  type WhaleOpenLoop,
  type WhaleReflection,
} from './whaleMemory';
import {
  buildWhalePersonaPrompt,
  DEFAULT_WHALE_PERSONA,
  normalizeWhalePersona,
  type WhalePersona,
} from './whalePersona';

export type NormalVisitorId = 'huboqi' | 'xushuiyin' | 'huangbingqi' | 'dafeiyu';
export type VisitorId = NormalVisitorId | 'dark_xushuiyin';

export const NORMAL_VISITOR_IDS: readonly NormalVisitorId[] = [
  'huboqi',
  'xushuiyin',
  'huangbingqi',
  'dafeiyu',
];
export const ALL_VISITOR_IDS: readonly VisitorId[] = [
  'huboqi',
  'xushuiyin',
  'huangbingqi',
  'dark_xushuiyin',
  'dafeiyu',
];

export interface WhaleVisitorSyncContext {
  enabled?: boolean;
  persona?: WhalePersona;
  facts?: WhaleFact[];
  episodes?: WhaleEpisode[];
  openLoops?: WhaleOpenLoop[];
  reflections?: WhaleReflection[];
  logs?: ChatMessage[];
  emotion?: WhaleEmotion;
  bond?: WhaleBondProfile;
  care?: WhaleCare;
}

export interface VisitorProfile {
  id: VisitorId;
  name: string;
  title: string;
  row: number;
  accent: string;
  persona: string;
  speechStyle: string;
  lovedGifts: (CropKind | Recipe['id'])[];
  roamWaypoints: WaypointId[];
  ambientLines: string[];
  greetings: string[];
  topics: string[];
}

export const VISITORS: Record<VisitorId, VisitorProfile> = {
  huboqi: {
    id: 'huboqi',
    name: '胡波奇',
    title: 'door 大学室友 · 绩点大王',
    row: 0,
    accent: '#4F6D8A',
    persona: 'door 的大学室友，超级学霸、绩点大王，成绩好到离谱，但性格特别害羞腼腆，容易脸红客气。私下最喜欢打王者荣耀上分，大学时经常被徐睡阴半夜打瓦大喊大叫吵得睡不着，却总不好意思当面发火。手里总爱带着一把写着「博学奇才」的金黄折扇。',
    speechStyle: '轻声客气，偶尔会害羞结巴“那个……”“其实也没那么高啦”，聊到王者荣耀排位、英雄出装或复习技巧时会悄悄打开话匣子。',
    lovedGifts: ['bread', 'soup', 'star', 'carrot', 'berry'],
    roamWaypoints: ['houseDoor', 'pondBench', 'plaza', 'farmLeft'],
    ambientLines: [
      '那个……农场空气真好，比自习室安静多了。',
      '刚才差点想掏手机打一把王者，还是先看看麦苗吧……',
      'door 家院子打理得真整洁，希望今晚睡阴别又大喊大叫。',
      '摇两下折扇散散心，等会儿顺便帮客人看看学习节奏。',
    ],
    greetings: [
      '呀，你好你好……我是 door 的大学室友胡波奇，顺路来农场串个门，没打扰到你种菜吧？',
      '那个……院子里好暖和呀！刚跟 door 打完招呼，你要是闲下来也可以找我聊聊王者或者复习心得。',
    ],
    topics: [
      '你绩点怎么能考这么高的？',
      '最近王者荣耀玩什么英雄上分？',
      '大学被徐睡阴吵睡觉是什么体验？',
    ],
  },
  xushuiyin: {
    id: 'xushuiyin',
    name: '徐睡阴',
    title: 'door 大学室友 · 打瓦狂魔',
    row: 1,
    accent: '#C46C3B',
    persona: 'door 的大学室友，天天痴迷打瓦（无畏契约 / Valorant），坚决不爱学习不读书。大学时半夜在宿舍打瓦疯狂报点大喊大叫，把 door 和胡波奇吵得根本睡不着。性格极其大方、大大咧咧、自来熟、爱请客，挨吐槽也嘻嘻哈哈不记仇，对“外国洋妞”毫无抵抗力。',
    speechStyle: '嗓门爽朗、大大咧咧、爱甩游戏黑话（“起狙”“A大”“闪白了”“下把一定赢”），出手大方爱分享，但一提看书就装听不见。',
    lovedGifts: ['pie', 'corn', 'tomato', 'bread', 'sunmelon'],
    roamWaypoints: ['plaza', 'marketDoor', 'houseDoor', 'pond'],
    ambientLines: [
      '哈哈这院子网速行不行啊？够不够哥们开两把瓦？',
      '别提读书别提读书！今天来农场纯纯放松请客！',
      '刚差点跟波奇吹我昨晚五杀，结果他问我高数复习没……',
      '黄冰骑人呢？说好来农场双排打瓦的！',
    ],
    greetings: [
      '哟！你就是农场主啊！我是 door 大学室友徐睡阴，别客气当自己人，待会儿哥请你吃好的——对了这儿能打瓦不？',
      '哈哈总算来 door 的农场逛一圈了！空气是不错，就是少了点键盘敲击声，要不要听我讲讲昨天绝地翻盘？',
    ],
    topics: [
      '你怎么天天打瓦都不学习啊？',
      '大学半夜大喊大叫没被室友打吗？',
      '今天手气怎么样，起大狙了吗？',
    ],
  },
  huangbingqi: {
    id: 'huangbingqi',
    name: '黄冰骑',
    title: 'door 大学室友 · 阳光拍照达人',
    row: 2,
    accent: '#B54B4B',
    persona: 'door 的大学室友，性格阳光开朗、特别会热场。平时爱跟徐睡阴双排打瓦（经常负责帮他兜底吐槽），也超喜欢追剧看综艺、举手机到处拍照记录生活发朋友圈，还是篮球爱好者。来农场总想找好看的光影角落打卡拍照。',
    speechStyle: '阳光明快、自带笑声和感染力，爱夸人、爱聊热门综艺/好剧、打篮球和拍照构图，说起徐睡阴打瓦白给时自带喜剧吐槽感。',
    lovedGifts: ['jam', 'dewberry', 'grape', 'berry', 'sunmelon'],
    roamWaypoints: ['plaza', 'pondBench', 'marketDoor', 'farmBottom'],
    ambientLines: [
      '哇这阳光打在木篱笆上也太出片了，赶紧咔嚓拍一张！',
      '刚和徐睡阴打完瓦手还热着，待会儿去打会儿篮球刚好！',
      '最近那档新综艺笑死我了，等会儿安利给玉洁和顾阿姨。',
      '这个角度拍池塘和小屋绝了，发朋友圈肯定点赞爆表！',
    ],
    greetings: [
      '哈喽哈喽！我是 door 的大学室友黄冰骑！你们这农场颜值也太高了吧，借我拍几张大片发生活日常行不行？',
      '刚好刚打完球顺路来串门！院子氛围超舒服，平时看综艺、打球还是跟睡阴双排打瓦，随时找我唠！',
    ],
    topics: [
      '农场哪个角落最适合拍照？',
      '最近有啥好看的剧和综艺推荐？',
      '和徐睡阴双排打瓦累不累？',
    ],
  },
  dark_xushuiyin: {
    id: 'dark_xushuiyin',
    name: '恐怖徐睡阴',
    title: '黑暗邪恶形态 · 深夜打瓦怨灵',
    row: 3,
    accent: '#9E3868',
    persona: '徐睡阴在深夜极度痴迷打瓦后堕化成的诡异黑暗形态：头朝下倒挂扭曲、裹着黄白条纹厚被子、只露出两只畸形大小手，扛着一台发着幽蓝冷光的笔记本电脑闯进农场疯狂打瓦、大喊大叫，吵得全农场所有人彻夜难眠。唯有「拔掉网线」或「提到外国洋妞」能瞬间击溃他的防线。',
    speechStyle: '阴森中透着离谱的网瘾中二感，夹杂疯狂报点怒吼与机械键盘敲击拟声（“哒哒哒哒——”“A大五个！！”“别睡了！！”）',
    lovedGifts: [],
    roamWaypoints: ['houseDoor', 'plaza', 'farmBottom'],
    ambientLines: [
      '【哒哒哒】A大五个！！door快起来补枪！！别睡了！！',
      '【幽蓝冷光】谁把我闪白了？！这把赢了就睡——第14把！！',
      '【键盘火星】胡波奇！！别背书了！！起来听我报点！！',
      '【扭曲怪笑】嘿嘿嘿…被窝里倒着打瓦手感更邪门了…A大冲啊！！',
      '【破音怒吼】下包了下包了！！全农场一个都别想睡！！',
    ],
    greetings: [
      '（黄白条纹被子诡异蠕动，头朝下对着幽蓝笔记本屏幕，畸形大小手疯狂砸着键盘）嘿嘿嘿……别睡了！A大三个！快起来看我起大狙！！',
    ],
    topics: [
      '大半夜的快把电脑关了！',
      '你这姿势裹被子打瓦不头晕吗？',
    ],
  },
  dafeiyu: {
    id: 'dafeiyu',
    name: '大肥鱼',
    title: '课表小伙伴 · 蓝发鲸鱼小女仆',
    row: 4,
    accent: '#2F7BB6',
    persona: DEFAULT_WHALE_PERSONA.description,
    speechStyle: '完全遵循课表里设置的大肥鱼性格滑条、称呼与共同记忆，自然亲切，在农场里喜欢看池塘水花、陪坤坤玩，下雨天反而特别开心。',
    lovedGifts: ['soup', 'bread', 'pie', 'jam', 'star', 'berry'],
    roamWaypoints: ['pond', 'plaza', 'houseDoor', 'pondBench', 'coop'],
    ambientLines: [
      '从课表那边溜达来农场透透气，池塘的水花亮晶晶的！',
      '哼哼，今天有没有好好休息呀？别光顾着种菜忘了喝水。',
      '坤坤圆滚滚的好可爱，尾巴轻轻晃一晃就凑过来了。',
      '这里阳光和微风都好舒服，顺便替你盯着菜苗长高。',
    ],
    greetings: [
      '嘿，我从课表那边串门来农场找你啦！今天院子里气氛真不错，要不要一起歇会儿聊两句？',
      '尾巴一甩就溜进农场啦！刚去池塘边踩了踩风，顺便看看你把菜地打理得怎么样了。',
    ],
    topics: [
      '你还记得我们之前聊过什么吗？',
      '农场池塘和课表桌宠哪边好玩？',
      '今天心情和状态怎么样呀？',
    ],
  },
};

/** 结合课表大肥鱼的实时人设与记忆生成动态展示信息（改名、改称呼、改滑条即时生效） */
export function resolveVisitorDisplayProfile(
  who: VisitorId,
  whaleSync?: WhaleVisitorSyncContext,
): VisitorProfile {
  const base = VISITORS[who];
  if (who !== 'dafeiyu' || whaleSync?.enabled === false || !whaleSync?.persona) {
    return base;
  }
  const p = normalizeWhalePersona(whaleSync.persona);
  const u = p.userName;
  const tsun = p.traits.tsundere >= 70;
  const warm = p.traits.warmth >= 75;
  const playful = p.traits.playfulness >= 70;
  const activeLoop = (whaleSync.openLoops ?? []).find(l => !l.resolvedAt);
  const topFact = (whaleSync.facts ?? []).slice().sort((a, b) => (b.importance ?? 6) - (a.importance ?? 6))[0];

  const ambientLines: string[] = [
    tsun
      ? `才、才不是特意跑来农场找${u}的……只是池塘水声挺好听！`
      : `从课表那边溜达来农场陪${u}透透气，院子真舒服呀。`,
    playful
      ? `尾巴甩一甩～坤坤居然想跟我的蝴蝶结玩！`
      : `吹着农场微风静静待一会儿，感觉心情都软乎乎的。`,
    warm
      ? `${u}忙完课表来院子歇歇脚也好，别把自己绷太紧啦。`
      : `看看菜苗长势怎么样了，顺便在这儿摸会儿鱼。`,
    ...(activeLoop ? [`对了，心里还惦记着${u}之前提过的「${activeLoop.topic.slice(0, 18)}」呢。`] : []),
    ...(topFact && !activeLoop ? [`偷偷记着${u}的小习惯，来农场也一样灵光！`] : []),
  ];

  const greetings: string[] = [
    tsun
      ? `哼，${u}怎么才来呀！我早就从课表那边溜进农场等你半天了——才没有很想你呢。`
      : warm
        ? `${u}来啦！我顺着课表悄悄串门到农场陪你，今天想先看看菜地还是聊会儿天？`
        : `嘿${u}，我是${p.name}！从课表那边过来农场串个门，这里比桌面上还宽敞呢！`,
  ];

  return {
    ...base,
    name: p.name,
    title: `同步课表人设 · ${p.userName}的专属伙伴`,
    persona: p.description || base.persona,
    ambientLines,
    greetings,
  };
}

export interface VisitorMemory {
  affinity: number;
  visits: number;
  lastVisitDate: string;
  giftedDate: string;
  notes: string[];
  emotion?: FarmEmotionState;
}

export interface FarmVisitorState {
  /** 今日常规到访访客（按真实日期轮换，也可手动邀请切换） */
  activeVisitor: NormalVisitorId | null;
  activeDate: string;
  /** 是否允许夜晚随机触发「恐怖徐睡阴」彩蛋（默认开启） */
  horrorEnabled: boolean;
  /** 恐怖徐睡阴当前是否正在闹觉 */
  horrorActive: boolean;
  /** 最近一次恐怖徐睡阴闹觉所在的农场天数（当晚及次日全员睡眠不足并讨论） */
  sleepDeprivedDay: number;
  /** 上次自然触发恐怖彩蛋的农场天数（避免同一夜反复弹窗） */
  lastHorrorDay: number;
  /** 已成功劝退/赶走恐怖徐睡阴的次数 */
  horrorBanishedCount: number;
  /** 4 位常规访客各自的持久化好感、情绪与回忆 */
  records: Record<NormalVisitorId, VisitorMemory>;
}

export function emptyVisitorMemory(id: NormalVisitorId = 'huboqi', now = Date.now()): VisitorMemory {
  return {
    affinity: id === 'dafeiyu' ? 35 : 18,
    visits: 0,
    lastVisitDate: '',
    giftedDate: '',
    notes: [],
    emotion: createInitialFarmEmotion(id, now),
  };
}

export function emptyVisitorState(): FarmVisitorState {
  const now = Date.now();
  return {
    activeVisitor: null,
    activeDate: '',
    horrorEnabled: true,
    horrorActive: false,
    sleepDeprivedDay: 0,
    lastHorrorDay: 0,
    horrorBanishedCount: 0,
    records: {
      huboqi: emptyVisitorMemory('huboqi', now),
      xushuiyin: emptyVisitorMemory('xushuiyin', now),
      huangbingqi: emptyVisitorMemory('huangbingqi', now),
      dafeiyu: emptyVisitorMemory('dafeiyu', now),
    },
  };
}

/** 获取访客当前 4 维情绪数值（大肥鱼启用同步时自动桥接课表大肥鱼真实情绪与养护状态） */
export function resolveVisitorEmotion(
  who: VisitorId,
  state: FarmVisitorState | undefined,
  whaleSync?: WhaleVisitorSyncContext,
  now = Date.now(),
): FarmEmotionState {
  if (who === 'dark_xushuiyin') {
    return createInitialFarmEmotion('dark_xushuiyin', now);
  }
  if (who === 'dafeiyu' && whaleSync?.enabled !== false && (whaleSync?.emotion || whaleSync?.care)) {
    const decayed = whaleSync.emotion
      ? decayWhaleEmotion(whaleSync.emotion, now, whaleSync.persona)
      : undefined;
    return whaleEmotionToFarmEmotion(decayed, whaleSync.care, whaleSync.persona, now);
  }
  const rec = state?.records?.[who];
  return normalizeFarmEmotion(rec?.emotion, who, undefined, now);
}

/** 更新某位常规访客的 4 维情绪数值 */
export function shiftVisitorEmotion(
  state: FarmVisitorState,
  who: NormalVisitorId,
  delta: FarmEmotionDelta,
  now = Date.now(),
): FarmVisitorState {
  const rec = state.records[who] ?? emptyVisitorMemory(who, now);
  const nextEmotion = applyFarmEmotionDelta(
    normalizeFarmEmotion(rec.emotion, who, undefined, now),
    who,
    delta,
    now,
  );
  return {
    ...state,
    records: {
      ...state.records,
      [who]: { ...rec, emotion: nextEmotion },
    },
  };
}

/** 按真实日期稳定轮换来访访客（约 80% 日子有访客登门拜访，也可随时在公告板手动邀请）。 */
export function resolveDailyVisitor(state: FarmVisitorState, at: number): NormalVisitorId | null {
  const date = realDate(at);
  if (state.activeDate === date) return state.activeVisitor;
  const hash = [...date].reduce((acc, ch) => (acc * 37 + ch.charCodeAt(0)) >>> 0, 29);
  if (hash % 5 === 4) return null; // 留一天清净
  return NORMAL_VISITOR_IDS[hash % NORMAL_VISITOR_IDS.length];
}

/** 判断农场夜晚是否应自然触发「恐怖徐睡阴」彩蛋。 */
export function shouldTriggerNightHorror(options: {
  state: FarmVisitorState;
  night: boolean;
  day: number;
  roll?: number;
}): boolean {
  const { state, night, day } = options;
  if (!state.horrorEnabled || !night || state.horrorActive) return false;
  if (state.lastHorrorDay === day) return false;
  const r = options.roll ?? Math.random();
  return r < 0.32;
}

/** 判断当前农场是否处于「昨夜/今夜被恐怖徐睡阴吵到睡眠不足」状态。 */
export function isFarmSleepDeprived(state: FarmVisitorState | undefined, day: number): boolean {
  if (!state || !state.sleepDeprivedDay) return false;
  return state.sleepDeprivedDay === day || state.sleepDeprivedDay === day - 1;
}

export const SLEEP_DEPRIVED_THOUGHTS: Record<ResidentId, string[]> = {
  door: [
    '哈欠……昨晚恐怖徐睡阴在院子里喊“A大五个”，我一瞬间以为回到大学宿舍了……',
    '眼皮直打架……早知道大学毕业时就把徐睡阴的键盘藏起来。',
  ],
  gu: [
    '昨晚被院子里那个裹被子打瓦的怪动静吵得一宿没合眼，今天得给全家熬锅安神汤……',
    '困得慌呀……door 的那位大学室友半夜也太能喊了吧。',
  ],
  xiaoba: [
    '……困。昨晚那个头朝下扛电脑打瓦的影子，画进恐怖地图素材里都嫌太离谱。',
    '黑眼圈好重……昨晚键盘声隔着木门都在震。',
  ],
  yujie: [
    '困死本校草了！昨晚那个黑化徐睡阴喊得比我飙高音还破音，太离谱了吧！',
    '哈欠……我今天嗓子哑了一半，全怪昨晚院子里那场阴间打瓦直播！',
  ],
  weigang: [
    '嗯……好困，昨晚吵得连池塘里的鱼都躲水底不敢冒头了……',
    '哈欠……今天看浮漂都快看成重影了，昨晚徐睡阴动静太大了。',
  ],
  chicken: [
    '咕……哈欠……昨晚那个黑气腾腾的被子怪一直大喊大叫，坤坤凌晨打鸣都没他响！',
    '咕呜……眼皮要黏住了，今天巡田只能慢吞吞走啦……',
  ],
};

export function pickSleepDeprivedThought(who: ResidentId, roll: number): string {
  const bank = SLEEP_DEPRIVED_THOUGHTS[who];
  return bank[Math.floor(Math.abs(roll) * bank.length) % bank.length];
}

export type HorrorBanishMethod = 'unplug' | 'introduce_foreign_girl' | 'trick_foreign_girl';

export interface HorrorBanishResult {
  reply: string;
  toast: string;
  rewardCoins: number;
  rumor: TownEvent;
}

/** 处理玩家用 3 种方式驱逐夜晚「恐怖徐睡阴」的搞笑演出与传闻结算。 */
export function resolveHorrorBanish(method: HorrorBanishMethod, at: number): HorrorBanishResult {
  if (method === 'introduce_foreign_girl') {
    return {
      reply:
        '（黄白条纹被子猛地一僵，头瞬间正了回来，畸形大小手啪一下合上笔记本）卧槽真的假的？！外国洋妞？！金发碧眼还会夸我帅吗？！这把瓦不打了不打了！哥们先回宿舍洗头换衣服，微信推我推我！！（一阵黑烟散去，飞奔溜走）',
      toast: '成功用「介绍外国洋妞」瞬间击溃恐怖徐睡阴！+35 金币，院子恢复安静',
      rewardCoins: 35,
      rumor: {
        id: `banish-girl-${at}`,
        title: '恐怖徐睡阴听说有外国洋妞连夜跑路',
        detail: '昨晚邪恶徐睡阴在院子疯狂打瓦吵得全员失眠，结果客人提了句介绍外国洋妞，他秒关电脑飞奔撤退！',
        kind: 'rumor',
        knownBy: [...RESIDENT_IDS],
        hotspot: 'plaza',
        createdAt: at,
        expiresAt: at + 24 * 3600_000,
      },
    };
  }
  if (method === 'trick_foreign_girl') {
    return {
      reply:
        '（幽红眼神瞬间变成星星眼，裹着被子腾空弹起）什么？！有个外国洋妞在集市口等我去玩？！还说仰慕我大狙准度？！哈哈哈兄弟够意思！电脑先收着，我这就冲去集市口！！（扛着被子狂奔出院门，结果在集市口吹了一宿冷风）',
      toast: '成功「骗他有外国洋妞约玩」调虎离山！+35 金币，明天全家人肯定要笑翻',
      rewardCoins: 35,
      rumor: {
        id: `banish-trick-${at}`,
        title: '恐怖徐睡阴被骗去集市口苦等洋妞',
        detail: '客人急中生智骗半夜打瓦的恐怖徐睡阴说集市口有外国洋妞约他，结果他扛着被子狂奔扑了个空！',
        kind: 'rumor',
        knownBy: [...RESIDENT_IDS],
        hotspot: 'marketDoor',
        createdAt: at,
        expiresAt: at + 24 * 3600_000,
      },
    };
  }
  return {
    reply:
      '（你快步上前一把拔掉电源并合上笔记本，幽蓝屏幕瞬间黑屏）啊啊啊我的排位分！！我的五杀！！你们怎么跟 door 大学宿管阿姨一样狠心啊！！行行行我撤了，明晚……明晚再说！（裹着黄白条纹被子不甘心地飘走了）',
    toast: '物理断网成功！赶走了恐怖徐睡阴，获得 35 金币守夜奖励',
    rewardCoins: 35,
    rumor: {
      id: `banish-unplug-${at}`,
      title: '昨夜物理拔网线赶走恐怖徐睡阴',
      detail: '昨晚黑暗徐睡阴扛电脑来院子打瓦吵翻全员，客人果断拔掉电源才让院子安静下来，大家今天都顶着黑眼圈。',
      kind: 'rumor',
      knownBy: [...RESIDENT_IDS],
      hotspot: 'houseDoor',
      createdAt: at,
      expiresAt: at + 24 * 3600_000,
    },
  };
}

/** 恐怖徐睡阴闹觉时，立即在 6 位家人记忆与 4 维情绪里种下「睡眠不足」影响。 */
export function recordHorrorAftermathToFamily(
  memories: FarmMemories,
  at: number,
): { nextMemories: FarmMemories; event: TownEvent } {
  let nextMemories = { ...memories };
  for (const id of RESIDENT_IDS) {
    const shifted = shiftResidentMemoryEmotion(
      nextMemories[id],
      id,
      { joy: -16, energy: -34, calm: -22, social: -8, reason: '昨晚被恐怖徐睡阴打瓦吵到睡眠不足' },
      at,
    );
    const line =
      id === 'door'
        ? '昨晚恐怖徐睡阴裹着被子头朝下扛电脑来院子疯狂打瓦，吵得全家人没睡好，太有大学宿舍阴影了。'
        : '昨晚院子里突然闯进黑暗邪恶形态的徐睡阴疯狂打瓦大喊大叫，吵得大家睡眠不足，今天直打哈欠。';
    nextMemories = {
      ...nextMemories,
      [id]: appendEpisode(
        { ...shifted, mood: '不悦' },
        {
          id: `horror-sleep-${at}-${id}`,
          kind: 'reflection',
          text: line,
          actors: ['player', 'door'],
          tags: ['徐睡阴', '打瓦', '睡眠不足'],
          importance: 8,
          emotion: '疲惫',
          privacy: 'public',
          at,
        },
      ),
    };
  }
  const event: TownEvent = {
    id: `horror-night-${at}`,
    title: '昨夜恐怖徐睡阴来农场疯狂打瓦闹觉',
    detail: '黑暗邪恶形态的徐睡阴裹着被子扛电脑在院子里大喊“A大五个”，吵得全农场睡眠不足，大家今天顶着黑眼圈热烈吐槽！',
    kind: 'director',
    knownBy: [...RESIDENT_IDS],
    hotspot: 'plaza',
    createdAt: at,
    expiresAt: at + 24 * 3600_000,
  };
  return { nextMemories, event };
}

export function visitorWeatherBehavior(
  who: VisitorId,
  weather: FarmWeather,
  rainbow: boolean,
  whaleSync?: WhaleVisitorSyncContext,
): { badge?: string; waypoints: WaypointId[]; ambientLines: string[] } {
  const base = resolveVisitorDisplayProfile(who, whaleSync);
  const userName = whaleSync?.persona?.userName ?? DEFAULT_WHALE_PERSONA.userName;
  if (who === 'dark_xushuiyin') {
    return {
      badge: weather === 'rain' ? '冒雨打瓦' : '闹觉中',
      waypoints: base.roamWaypoints,
      ambientLines:
        weather === 'rain'
          ? [
              '【雨中打瓦】下雨算什么？！被子防水！A大五个快补枪！！',
              ...base.ambientLines,
            ]
          : base.ambientLines,
    };
  }
  if (rainbow) {
    const rainbowLines: Record<NormalVisitorId, string[]> = {
      huboqi: ['哇，雨后居然出彩虹了……好久没见过这么清楚的彩虹。', '那个……借彩虹的光，顺便祝你期末门门满绩！'],
      xushuiyin: ['卧槽天上出彩虹了！今天这波手气绝佳，回去打瓦必连胜！', '哈哈雨一停就出彩虹，door 这农场风水可以啊！'],
      huangbingqi: ['快看天上的彩虹！！别动别动，让我连拍十张发朋友圈大片！', '雨后彩虹配这片红屋顶太绝了，今天来串门血赚！'],
      dafeiyu: [
        `哇——${userName}快看天边！雨后挂着亮晶晶的彩虹，连我尾巴尖都闪闪发光啦！`,
        `淋完小雨就看见彩虹，今天的好运我分一半给${userName}！`,
      ],
    };
    return {
      badge: '看彩虹',
      waypoints: ['plaza', 'pondBench'],
      ambientLines: rainbowLines[who],
    };
  }
  if (weather === 'rain') {
    if (who === 'dafeiyu') {
      // 大肥鱼作为鲸鱼娘，下雨天反而开心地在院子和池塘边踩水花！
      return {
        badge: '雨中踩水花',
        waypoints: ['pond', 'plaza', 'pondBench'],
        ambientLines: [
          `下雨啦下雨啦！鲸鱼最喜欢凉凉的雨滴了，啪嗒啪嗒踩水花好开心～`,
          `${userName}快躲屋檐下别着凉，我替你在池塘边多玩两圈水花！`,
          `雨点落在池塘上像好多小音符，比晴天还要热闹呢！`,
        ],
      };
    }
    const rainLines: Record<Exclude<NormalVisitorId, 'dafeiyu'>, string[]> = {
      huboqi: ['下雨了，赶紧收好折扇躲屋檐下，别把眼镜淋花啦……', '听着雨声在屋檐下发会儿呆，比自习室还让人安心。'],
      xushuiyin: ['哈哈下雨天哪儿也去不了，正大光明躲棚下聊打瓦！', '这雨下得挺舒服啊，屋檐下听雨差点把我听困了。'],
      huangbingqi: ['细雨打在木屋檐上超有日剧氛围，咔嚓先拍段雨景小视频！', '下雨打不了篮球了，刚好躲屋檐下和大家唠唠最近的综艺！'],
    };
    return {
      badge: '躲雨中',
      waypoints: who === 'huangbingqi' ? ['marketDoor', 'houseDoor'] : ['houseDoor', 'marketDoor'],
      ambientLines: rainLines[who],
    };
  }
  return {
    waypoints: base.roamWaypoints,
    ambientLines: base.ambientLines,
  };
}

function offlineDafeiyuReply(
  clean: string,
  sleepDeprived: boolean,
  weather: FarmWeather,
  rainbow: boolean,
  whaleSync?: WhaleVisitorSyncContext,
): string {
  const p = normalizeWhalePersona(whaleSync?.persona ?? DEFAULT_WHALE_PERSONA);
  const u = p.userName;
  const tsun = p.traits.tsundere >= 70;
  const facts = whaleSync?.facts ?? [];
  const loops = (whaleSync?.openLoops ?? []).filter(l => !l.resolvedAt);

  // 优先匹配课表记忆库里的真实事实或牵挂，让离线聊天也能体现记忆同步！
  if (/记得|记忆|忘了|我喜欢|我讨厌|约定|最近|之前聊/.test(clean) || facts.length > 0) {
    const matchedFact = facts
      .map(f => ({ f, score: memoryRelevance(`${f.key} ${f.text}`, clean) }))
      .sort((a, b) => b.score - a.score || (b.f.importance ?? 6) - (a.f.importance ?? 6))[0];
    if (matchedFact && (matchedFact.score > 0 || /记得|记忆|忘了/.test(clean))) {
      return tsun
        ? `笨蛋${u}，我记性好着呢！我当然记得「${matchedFact.f.text.slice(0, 48)}」——在农场我也不会忘的。`
        : `当然记得呀，${u}！我小本本上一直记着「${matchedFact.f.text.slice(0, 48)}」，来农场串门也不会忘的。`;
    }
    if (loops.length && /记得|记忆|最近|约定|忙/.test(clean)) {
      const loop = loops[0];
      return `我还惦记着${u}之前提的「${loop.topic.slice(0, 40)}」${loop.dueHint ? `（${loop.dueHint}）` : ''}呢，在农场松口气后别忘节奏哦。`;
    }
  }

  if (/天气|下雨|雨|彩虹|晴|太阳/.test(clean)) {
    if (rainbow) return `${u}快看天边的大彩虹！雨一停整个院子都闪闪的，尾巴都忍不住跟着翘起来啦！`;
    if (weather === 'rain') {
      return tsun
        ? `下雨天多舒服呀！我才不怕淋湿呢——不过${u}你可乖乖待在屋檐下，别感冒了还要我操心。`
        : `下雨天我最开心啦，凉凉的雨点落在水洼里超治愈！${u}记得撑伞或者回屋檐下喝口热茶呀。`;
    }
    return `今天农场阳光暖洋洋的，微风吹得裙摆轻轻晃，陪${u}在院子里发会儿呆真惬意。`;
  }
  if (/米饭|吃|饿|饭/.test(clean)) {
    return whaleSync?.care && whaleSync.care.fullness < 35
      ? `唔……被${u}一说肚子真咕噜叫了！要是能有碗热腾腾的白米饭或者顾做的点心就好了～`
      : `哈哈这里顾阿姨做饭可香了！不过${u}喂的白米饭永远排第一，${tsun ? '才、才不是拍马屁呢！' : '嘿嘿。'}`;
  }
  if (/课表|桌宠|学习|复习/.test(clean)) {
    return `课表那边我随时待命着呢，现在是陪${u}来农场放松一下的时间——劳逸结合效率才更高嘛！`;
  }
  if (sleepDeprived || /徐睡阴|打瓦|吵|睡觉/.test(clean)) {
    return `听说昨晚那个裹被子打瓦的怪人把全农场吵得没睡好？下回他敢再闹觉，我直接一尾巴把他掀去池塘冷静冷静！`;
  }
  return tsun
    ? `哼，${u}总算来找${p.name}说话啦？农场这边风景不错，我就勉为其难多陪你逛一会儿吧。`
    : `${u}，难得在像素农场里碰面呢！刚去池塘边转了一圈，有我在旁边陪着，慢慢玩就好啦。`;
}

export function offlineVisitorReply(
  id: VisitorId,
  text: string,
  sleepDeprived: boolean,
  weather: FarmWeather = 'clear',
  rainbow = false,
  whaleSync?: WhaleVisitorSyncContext,
): string {
  const clean = text.trim();
  if (id === 'dafeiyu') {
    return offlineDafeiyuReply(clean, sleepDeprived, weather, rainbow, whaleSync);
  }
  if (/天气|下雨|下没下雨|雨|彩虹|晴|太阳/.test(clean) && id !== 'dark_xushuiyin') {
    if (rainbow) {
      return id === 'huangbingqi'
        ? '刚停雨天上挂着大彩虹呢！我已经连拍十几张了，光线绝美！'
        : id === 'xushuiyin'
          ? '天上刚出了道大彩虹！看着就吉利，感觉待会儿打瓦肯定一把五杀！'
          : '嗯嗯，雨刚停就出了彩虹，院子里空气香香的，特别治愈！';
    }
    if (weather === 'rain') {
      return id === 'huangbingqi'
        ? '外面正下着小雨呢，我躲屋檐下刚拍了段听雨视频，打球只能改天啦！'
        : id === 'xushuiyin'
          ? '正下雨呢，刚好在屋檐下躲雨歇着——雨天和打瓦本来就是绝配嘛！'
          : '外面正下着细雨呢，我收起折扇在屋檐下躲雨，你别淋着感冒了呀。';
    }
    return id === 'huangbingqi'
      ? '今天天气超晴朗，阳光打在院子里特别出片，待会儿还想去打会儿篮球！'
      : id === 'xushuiyin'
        ? '天气贼晴朗，微风吹着挺舒服的，难得出来晒晒太阳透透气！'
        : '今天天气晴朗微风正好，待在院子里晒晒太阳特别放松！';
  }
  if (id === 'dark_xushuiyin') {
    if (/洋妞|外国|约你|美女|妹子/.test(clean)) {
      return '（头猛地转正）啥？！你说外国洋妞？！快点下面按钮给我推一下，我立马关机不打了！！';
    }
    if (/拔网线|关机|睡觉|吵死了|别打/.test(clean)) {
      return '（大小手狂敲键盘）休想！！这把马上翻盘了！A大冲啊！除非有外国洋妞约我，不然今晚谁也别睡！！';
    }
    return '（被子下透出幽蓝冷光）嘿嘿嘿……别废话了！door 和胡波奇睡得太香，我必须用大狙枪声唤醒整个农场！哒哒哒——';
  }
  if (id === 'huboqi') {
    if (/王者|排位|英雄|上分/.test(clean)) {
      return '呀，说到王者荣耀我就来精神了……其实我平时压力大就打两把中单或射手，你要是想双排我可以悄悄带你上分！';
    }
    if (/绩点|成绩|学习|复习|考/.test(clean)) {
      return '那个……其实也没什么秘诀啦，就是平时把笔记理顺一点、考前别熬通宵——当然前提是徐睡阴别在旁边大喊“A大五个”……';
    }
    if (sleepDeprived || /徐睡阴|打瓦|吵|睡觉/.test(clean)) {
      return '（害羞地摇了摇折扇，小声叹气）昨晚睡阴那个状态真的太吓人了……跟大学宿舍凌晨三点一模一样，今天我都有点困了。';
    }
    return '嗯嗯，农场真的好治愈呀……待会儿我还想帮 door 看看菜地，你要是有学习或王者的话题随时找我聊！';
  }
  if (id === 'xushuiyin') {
    if (/洋妞|外国|约/.test(clean)) {
      return '卧槽！兄弟你手里真有外国洋妞资源？！快介绍介绍，这顿饭和全农场种子我包了！！';
    }
    if (/打瓦|大狙|排位|A大|爆头/.test(clean)) {
      return '哈哈懂行懂行！刚手痒得不行，跟你说昨晚那波一打三残局帅爆了——待会儿拉上黄冰骑一起开黑不？';
    }
    if (/学习|读书|作业|考试|绩点/.test(clean)) {
      return '哎呀别提学习嘛！看书我三分钟就犯困，打瓦我能精神到天亮！来来来，不聊书本，今天哥请客！';
    }
    if (sleepDeprived || /吵|睡觉|恐怖|黑化/.test(clean)) {
      return '哈哈哈哈别造谣啊！我平时打瓦声音也就……稍微大了那么一丢丢！真吵着 door 和波奇睡觉了？那下次我请喝奶茶赔罪！';
    }
    return '哈哈你这农场整得真不错！大大方方玩开心最重要，有啥需要哥们帮忙搭把手的尽管开口！';
  }
  // huangbingqi
  if (/拍照|照片|风景|打卡|出片/.test(clean)) {
    return '必须的！夕阳照在池塘和小屋屋檐那块光线绝了，刚才我已经连拍十几张，回头修好图发给你当纪念！';
  }
  if (/剧|综艺|电影/.test(clean)) {
    return '最近那几档搞笑综艺下饭得很，还有部悬疑新剧节奏超紧，等会儿我把片单抄给你，晚上歇着刚好追！';
  }
  if (/篮球|打球|球衣/.test(clean)) {
    return '哈哈这件球衣穿起来贼舒服！平时打完球再来两把瓦，出一身汗心情瞬间晴朗，有空一起约场球啊！';
  }
  if (sleepDeprived || /徐睡阴|打瓦|吵/.test(clean)) {
    return '哈哈哈我跟睡阴双排打瓦经常一边帮他补枪一边捂耳朵！听说他昨晚变黑化版来闹觉？笑死我了，下次我帮你们管住他！';
  }
  return '今天来 door 农场太开心了！阳光、菜地、还有这么多好玩的事，感觉能拍一整组治愈系 vlog 呢！';
}

export async function runVisitorChatTurn(options: {
  who: VisitorId;
  text: string;
  history: { role: 'user' | 'assistant'; text: string }[];
  scene: { day: number; season: string; night: boolean; weather?: FarmWeather; rainbow?: boolean; period?: FarmPeriod };
  sleepDeprived: boolean;
  emotion?: FarmEmotionState;
  whaleSync?: WhaleVisitorSyncContext;
  apiKey: string;
  signal: AbortSignal;
}): Promise<{ reply: string; online: boolean; hint?: string }> {
  const { who, text, history, scene, sleepDeprived, emotion, whaleSync, apiKey, signal } = options;
  const clean = text.trim();
  const weatherNow: FarmWeather = scene.weather ?? 'clear';
  const rainbowNow = scene.rainbow === true;
  if (!apiKey || isSensitiveFarmText(clean)) {
    return {
      reply: offlineVisitorReply(who, clean, sleepDeprived, weatherNow, rainbowNow, whaleSync),
      online: false,
      hint: !apiKey ? '未配置 API Key，使用本地台词' : undefined,
    };
  }
  const profile = resolveVisitorDisplayProfile(who, whaleSync);
  const weatherDesc = rainbowNow
    ? '雨后刚放晴，天边挂着彩虹'
    : weatherNow === 'rain'
      ? who === 'dafeiyu'
        ? '外面正下着细雨（你是鲸鱼娘，超喜欢下雨天在院子和池塘边踩水花）'
        : '外面正下着细雨（你在屋檐/集市棚下避雨）'
      : scene.night
        ? '夜空晴朗，晚风微凉'
        : '天气晴朗微风舒适';

  let system: string;
  if (who === 'dafeiyu' && whaleSync?.enabled !== false && whaleSync?.persona) {
    const persona = normalizeWhalePersona(whaleSync.persona);
    const now = Date.now();
    const whaleHistory = [
      ...history.slice(-8).map(m => ({ role: m.role, content: m.text })),
      { role: 'user' as const, content: clean },
    ];
    const memoryPrompt = buildWhaleMemoryPrompt(
      whaleSync.facts ?? [],
      whaleSync.logs ?? [],
      whaleHistory,
      {
        episodes: whaleSync.episodes,
        openLoops: whaleSync.openLoops,
        reflections: whaleSync.reflections,
        now,
      },
    );
    const decayedEmotion = whaleSync.emotion
      ? decayWhaleEmotion(whaleSync.emotion, now, persona)
      : undefined;
    const bondPrompt = decayedEmotion && whaleSync.bond
      ? buildWhaleEmotionPrompt(
          decayedEmotion,
          resolveBondStage(whaleSync.bond, whaleSync.care?.bond ?? 40, (whaleSync.facts ?? []).length),
          whaleSync.bond,
          whaleSync.care,
        )
      : '';
    system = `${buildWhalePersonaPrompt(persona)}
${bondPrompt}
${memoryPrompt}
【当前农场串门场景】
你此刻正以像素形象在「doordoor农场」串门做客（农场主家庭有 door、顾、小八、玉洁、唯刚和小鸡坤坤）。
当前：农场第 ${scene.day} 天（${scene.season}季，${scene.night ? '夜晚' : '白天'}），实时天气：${weatherDesc}。${
      sleepDeprived ? '昨晚恐怖徐睡阴扛电脑来农场疯狂打瓦吵得大家睡眠不足。' : ''
    }
要求：保持你在课表里一贯的称呼、性格参数与共同记忆，自然融入农场场景与实时天气，用 1～3 句鲜活口语直接输出纯文本回复（不超过 120 字），不输出 JSON。`;
  } else {
    const emotionNote = emotion ? `\n当前心情状态：${formatFarmEmotionForPrompt(emotion)}` : '';
    system = `你是像素农场「doordoor农场」的来访角色「${profile.name}」（${profile.title}）。
人设：${profile.persona}
说话风格：${profile.speechStyle}${emotionNote}
当前场景：农场第 ${scene.day} 天（${scene.season}季，${scene.night ? '夜晚' : '白天'}），实时天气：${weatherDesc}。${
      sleepDeprived ? '昨晚恐怖徐睡阴扛电脑来农场疯狂打瓦，吵得全农场睡眠不足。' : ''
    }
要求：用鲜活自然的中文口语回复，1～3 句话（不超过 110 字），能自然感知当下天气与环境，贴合人设，不要自称 AI，不要使用括号旁白过多（最多一句简短动作描写），直接输出纯文本回复。`;
  }

  try {
    const raw = await farmChat(
      [
        { role: 'system', content: system },
        ...history.slice(-8).map(m => ({ role: m.role, content: m.text })),
        { role: 'user', content: clean },
      ],
      apiKey,
      { signal, priority: 'interactive', timeoutMs: 14000, maxTokens: 240, retries: 1 },
    );
    const trimmed = raw.trim().slice(0, 180);
    if (!trimmed) throw new FarmChatError('回复为空');
    return { reply: trimmed, online: true };
  } catch (error) {
    if (signal.aborted) throw error;
    return {
      reply: offlineVisitorReply(who, clean, sleepDeprived, weatherNow, rainbowNow, whaleSync),
      online: false,
      hint: error instanceof FarmChatError ? `${error.message}，已切换本地台词` : '网络暂不可用，使用本地台词',
    };
  }
}

export function evaluateVisitorGift(
  who: NormalVisitorId,
  item: CropKind | Recipe['id'],
  record: VisitorMemory,
  at: number,
  whaleSync?: WhaleVisitorSyncContext,
): { nextRecord: VisitorMemory; reply: string; affinityDelta: number; emotionDelta: FarmEmotionDelta } {
  const profile = VISITORS[who];
  const label = item in CROP_LABELS ? CROP_LABELS[item as CropKind] : (RECIPES.find(r => r.id === item)?.label ?? item);
  const loved = profile.lovedGifts.includes(item);
  const date = realDate(at);
  const firstToday = record.giftedDate !== date;
  const affinityDelta = firstToday ? (loved ? 7 : 3) : 0;
  const emotionDelta: FarmEmotionDelta = loved
    ? { joy: 18, energy: 8, calm: 6, social: 10, reason: `收到最喜欢的礼物「${label}」` }
    : { joy: 9, calm: 4, social: 6, reason: `收到贴心小礼物「${label}」` };

  const u = whaleSync?.persona?.userName ?? DEFAULT_WHALE_PERSONA.userName;
  const tsun = (whaleSync?.persona?.traits.tsundere ?? 65) >= 70;
  const replies: Record<NormalVisitorId, string> = {
    huboqi: loved
      ? `呀，居然送我最喜欢的${label}！太不好意思了……那我待会儿悄悄帮你整理一份高分小贴士！`
      : `谢谢你的${label}，你真客气呀，我会好好收着的。`,
    xushuiyin: loved
      ? `卧槽竟然有${label}！够意思够意思！等哥回头赢了排位请你喝大杯奶茶！`
      : `哈哈谢啦兄弟，${label}看着贼新鲜，我就大大方方收下啦！`,
    huangbingqi: loved
      ? `哇塞是${label}！先别动让我拿手机给它拍张特写发朋友圈，太赞啦谢谢你！`
      : `哈哈谢谢你的${label}！今天来农场真是吃好喝好还拍够了美照！`,
    dafeiyu: loved
      ? tsun
        ? `哇是${label}！哼，算${u}还有点眼光嘛……那我就开开心心收下啦，尾巴都要摇成螺旋桨了！`
        : `哇塞！是超级喜欢的${label}！谢谢${u}投喂，在农场也能吃到这么香的太幸福啦！`
      : `谢谢${u}送的${label}！我小心收好，回头回课表那边也带一份好心情回去～`,
  };

  const nextEmotion = applyFarmEmotionDelta(
    normalizeFarmEmotion(record.emotion, who, undefined, at),
    who,
    emotionDelta,
    at,
  );
  return {
    affinityDelta,
    emotionDelta,
    reply: replies[who],
    nextRecord: {
      ...record,
      affinity: Math.min(100, record.affinity + affinityDelta),
      giftedDate: date,
      emotion: nextEmotion,
      notes: [...record.notes, `收到客人送的${label}`].slice(-8),
    },
  };
}

export function restoreVisitorState(raw: unknown): FarmVisitorState {
  const base = emptyVisitorState();
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return base;
  const v = raw as Record<string, unknown>;
  const isNormal = (x: unknown): x is NormalVisitorId =>
    typeof x === 'string' && NORMAL_VISITOR_IDS.includes(x as NormalVisitorId);
  const num = (x: unknown, max = 9999) =>
    typeof x === 'number' && Number.isFinite(x) ? Math.max(0, Math.min(max, Math.round(x))) : 0;

  const records = { ...base.records };
  if (v.records && typeof v.records === 'object' && !Array.isArray(v.records)) {
    for (const id of NORMAL_VISITOR_IDS) {
      const src = (v.records as Record<string, unknown>)[id];
      if (!src || typeof src !== 'object' || Array.isArray(src)) continue;
      const r = src as Record<string, unknown>;
      records[id] = {
        affinity: Math.min(100, num(r.affinity, 100) || (id === 'dafeiyu' ? 35 : 18)),
        visits: num(r.visits),
        lastVisitDate: typeof r.lastVisitDate === 'string' ? r.lastVisitDate.slice(0, 20) : '',
        giftedDate: typeof r.giftedDate === 'string' ? r.giftedDate.slice(0, 20) : '',
        notes: Array.isArray(r.notes)
          ? r.notes.filter((s): s is string => typeof s === 'string' && s.trim().length > 0).map(s => s.slice(0, 60)).slice(-8)
          : [],
        emotion: normalizeFarmEmotion(r.emotion, id),
      };
    }
  }

  return {
    activeVisitor: isNormal(v.activeVisitor) ? v.activeVisitor : null,
    activeDate: typeof v.activeDate === 'string' ? v.activeDate.slice(0, 20) : '',
    horrorEnabled: v.horrorEnabled !== false,
    horrorActive: v.horrorActive === true,
    sleepDeprivedDay: num(v.sleepDeprivedDay),
    lastHorrorDay: num(v.lastHorrorDay),
    horrorBanishedCount: num(v.horrorBanishedCount),
    records,
  };
}
