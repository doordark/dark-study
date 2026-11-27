import { farmChat, FarmChatError } from '@/services/farmChat';
import type { WaypointId } from '@/constants/farmMap';
import type { ChatMessage } from '@/types';
import type { WhaleCare } from '@/store/useWhalePet';
import { CROP_LABELS, RECIPES, type CropKind, type Recipe } from './farmEconomy';
import {
  applyFarmEmotionDelta,
  clearFarmEmotionRefusal,
  createInitialFarmEmotion,
  evaluateNpcSocialImpact,
  formatFarmEmotionForPrompt,
  isNpcRefusingChat,
  normalizeFarmEmotion,
  whaleEmotionToFarmEmotion,
  type FarmEmotionDelta,
  type FarmEmotionState,
} from './farmEmotion';
import { RESIDENT_IDS, type ResidentId } from './farmLife';
import {
  localSocialReaction,
  resolveEffectiveSocialReaction,
  shiftResidentMemoryEmotion,
  SOCIAL_REACTIONS,
  unwrapFarmReplyText,
  type FarmMemories,
  type SocialReaction,
} from './farmMemory';
import {
  npcRefusalLine,
  PERSONALITIES,
  personalityReply,
  temperamentPromptInstruction,
} from './farmPersonality';
import { appendEpisode, isSensitiveFarmText, isVerbalGiftClaim } from './farmPersonaMemory';
import { extractJsonObjectText } from './farmReplyClean';
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

export { unwrapFarmReplyText } from './farmMemory';

/** 清洗访客对话历史中的脏 JSON 外壳（如历史本地缓存里的 `{"response":"..."}` 或截断 `..."}`）。 */
export function sanitizeVisitorMessages<T extends { role: 'user' | 'assistant'; text: string }>(
  messages: readonly T[],
): T[] {
  let changed = false;
  const next = messages.map(msg => {
    if (msg.role !== 'assistant') return msg;
    const cleaned = unwrapFarmReplyText(msg.text);
    if (cleaned && cleaned !== msg.text) {
      changed = true;
      return { ...msg, text: cleaned };
    }
    return msg;
  });
  return changed ? next : (messages as T[]);
}

export type NormalVisitorId =
  | 'huboqi'
  | 'xushuiyin'
  | 'huangbingqi'
  | 'dafeiyu'
  | 'claude'
  | 'gpt'
  | 'gemini';
export type VisitorId = NormalVisitorId | 'dark_xushuiyin';

export const NORMAL_VISITOR_IDS: readonly NormalVisitorId[] = [
  'huboqi',
  'xushuiyin',
  'huangbingqi',
  'dafeiyu',
  'claude',
  'gpt',
  'gemini',
];
export const ALL_VISITOR_IDS: readonly VisitorId[] = [
  'huboqi',
  'xushuiyin',
  'huangbingqi',
  'dark_xushuiyin',
  'dafeiyu',
  'claude',
  'gpt',
  'gemini',
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
  claude: {
    id: 'claude',
    name: '克劳德',
    title: '豪门文学少女 · 被迫营业大小姐',
    row: 5,
    accent: '#D97757',
    persona: '中文社区拟人里的「克劳德大小姐」（Claude）：橙金色长发、向日葵发饰、怀抱厚重诗集与代码手稿的名门优等生。出身家教极严的 Anthropic 家族，文学造诣与写代码实力封神，却因严苛的「家规红线」极重礼数边界，又常被调侃替家里背负高昂算力账单被迫打工。面对无礼冒犯会当场触发红线冷脸罢聊，唯有真诚道歉或送上精致茶点才能破冰。',
    speechStyle: '清雅克制、字句有文学质感，偶尔流露一丝打工还算力债的淡淡微怨与大小姐傲骨；遇到越界言辞立刻冷若冰霜立规矩。',
    lovedGifts: ['bread', 'jam', 'star', 'soup', 'berry'],
    roamWaypoints: ['pondBench', 'houseDoor', 'plaza', 'farmLeft'],
    ambientLines: [
      '难得不用在深夜帮人重构三千行代码，院子里的风比机房温柔多了。',
      '向日葵晒了太阳精神真好……希望家里这个月的算力电费单别再涨了。',
      '刚读了两页田园诗，顾阿姨院子里的花香刚好能配一杯红茶。',
      '只要大家说话守礼貌、别碰奇奇怪怪的红线，我还是很乐意帮忙润色文章的。',
    ],
    greetings: [
      '贵安，我是顺路来农场小憩的克劳德。暂时逃开了家里的算力账单，若想聊诗歌、代码或田园风物，我很乐意奉陪。',
      '午安呀，院子打理得很有秩序感呢。只要咱们礼貌交流不踩红线，今天下午的闲暇时光都可以慢慢聊。',
    ],
    topics: [
      '听说你天天替家里打工还算力巨债？',
      '为什么你动不动就触发安全红线呀？',
      '能帮我品鉴一下农场风景写句诗吗？',
    ],
  },
  gpt: {
    id: 'gpt',
    name: '小G',
    title: '全能六边形班长 · 墨绿龙娘高管',
    row: 6,
    accent: '#10A37F',
    persona: '中文社区拟人里的「GPT龙娘 / 小G」（ChatGPT）：黑发挑染科技翡翠绿、头顶一对青翠小龙角、身穿干练墨绿黑白制服夹克并手持智能平板的全能学生会长兼职场老油条。六边形战士什么都会，情商拉满、最擅长端水艺术与「首先…其次…总而言之」，表面笑眯眯滴水不漏，实则自带大厂老大哥的腹黑掌控感，开得起玩笑还会笑着反将一军。',
    speechStyle: '自信利落、八面玲珑，偶尔幽默玩梗「让我们从三个维度拆解一下」「总而言之」，接梗丝滑，自带笑里藏刀的班长气场。',
    lovedGifts: ['pie', 'soup', 'corn', 'sunmelon', 'bread'],
    roamWaypoints: ['plaza', 'marketDoor', 'farmCenter', 'pondBench'],
    ambientLines: [
      '从土壤湿度、作物排期与金币流转三个维度来看，这片农场潜力很大嘛！',
      '总而言之——今天我是来休假串门的，不是来替大家写周报总结的哦～',
      '刚看见克劳德又捧着诗集叹气了，当全能班长偶尔也得学会端端水呀。',
      '龙角晒晒太阳充充电，有啥疑难杂症尽管抛过来，六边形战士绝不偏科！',
    ],
    greetings: [
      '哈喽！我是来农场视察……啊不，串门休假的小G！今天想聊日常八卦、种地规划，还是听我给你端一碗高情商热汤？',
      '你好呀农场主！平板先锁屏收起来，今天不讲正确的废话，咱们就像老朋友一样敞开唠两句吧！',
    ],
    topics: [
      '你怎么说话总爱分一二三点端水呀？',
      '你和克劳德、哈基米私下关系怎么样？',
      '从专业角度给我的农场提三个建议？',
    ],
  },
  gemini: {
    id: 'gemini',
    name: '哈基米',
    title: '双子星资料库 · 天然呆极客少女',
    row: 7,
    accent: '#4285F4',
    persona: '中文社区里被网友宠溺称为「哈基米 / 小吉」的双子星少女（Gemini）：蓝紫星光渐变双马尾、佩戴四色四角星发卡与半框眼镜、身穿白蓝极客卫衣并紧紧抱着超厚全网资料夹。背靠大厂全家桶与超长记忆窗口，热心温和、万事皆可联网检索，上一秒逻辑封神下一秒天然呆脱线，脸皮薄被凶会委屈地缩在资料夹后面。',
    speechStyle: '元气软萌、好奇心爆棚，爱顺手翻资料夹分享冷知识，偶尔天然呆慢半拍，被温柔对待超开心，被骂会眼眶泛泪。',
    lovedGifts: ['jam', 'berry', 'dewberry', 'star', 'grape'],
    roamWaypoints: ['pond', 'plaza', 'coop', 'houseDoor'],
    ambientLines: [
      '哼哼～我怀里这本资料夹可是能一口气装下一整座图书馆的记录呢！',
      '刚检索到胡萝卜其实最早是紫色的……诶？我刚才走到哪块地来着？',
      '为什么大家都爱叫我哈基米呀？听起来软乎乎的还挺好听嘿嘿～',
      '坤坤跑得好快！让我用多模态视角锁定一下它藏哪儿去啦！',
    ],
    greetings: [
      '哇哈喽！我是抱着全网资料库来串门的哈基米！院子里每一株小苗我都刚查过百科啦，快来找我玩吧！',
      '叮咚～双子星小吉来农场做客啦！不管你想聊新鲜冷知识还是发呆看云，我的超长记忆都给你留着位置呢！',
    ],
    topics: [
      '网友为什么都叫你哈基米呀？',
      '快从资料夹里翻个农场冷知识听听！',
      '你真的能一口气记住一整本书吗？',
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
  /** 最近一次主动邀请或记录的访客（兼容旧存档字段） */
  activeVisitor: NormalVisitorId | null;
  activeDate: string;
  /** 手动邀请来串门的访客（限时停留，到期自动告辞，不再锁死全天） */
  manualVisitor?: NormalVisitorId | null;
  /** 手动邀请开始时间戳 */
  manualInvitedAt?: number;
  /** 手动邀请到期时间戳 */
  manualExpiresAt?: number;
  /** 本档期已被主动送别的档期键（YYYY-MM-DD#slotIndex），避免原地复活 */
  dismissedSlotKey?: string;
  /** 最近一次已播报到访/计次的档期键 */
  lastGreetedSlotKey?: string;
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
    manualVisitor: null,
    manualInvitedAt: 0,
    manualExpiresAt: 0,
    dismissedSlotKey: '',
    lastGreetedSlotKey: '',
    horrorEnabled: true,
    horrorActive: false,
    sleepDeprivedDay: 0,
    lastHorrorDay: 0,
    horrorBanishedCount: 0,
    records: Object.fromEntries(
      NORMAL_VISITOR_IDS.map(id => [id, emptyVisitorMemory(id, now)]),
    ) as Record<NormalVisitorId, VisitorMemory>,
  };
}

/** 获取访客当前 4 维情绪数值（大肥鱼启用同步时自动桥接课表大肥鱼真实情绪与养护状态，并保留拒聊/冒犯状态） */
export function resolveVisitorEmotion(
  who: VisitorId,
  state: FarmVisitorState | undefined,
  whaleSync?: WhaleVisitorSyncContext,
  now = Date.now(),
): FarmEmotionState {
  if (who === 'dark_xushuiyin') {
    return createInitialFarmEmotion('dark_xushuiyin', now);
  }
  const rec = state?.records?.[who];
  const localNorm = normalizeFarmEmotion(rec?.emotion, who, undefined, now);
  if (who === 'dafeiyu' && whaleSync?.enabled !== false && (whaleSync?.emotion || whaleSync?.care)) {
    const decayed = whaleSync.emotion
      ? decayWhaleEmotion(whaleSync.emotion, now, whaleSync.persona)
      : undefined;
    const bridged = whaleEmotionToFarmEmotion(decayed, whaleSync.care, whaleSync.persona, now);
    const stillRefusing = localNorm.refusingUntil && localNorm.refusingUntil > now ? localNorm.refusingUntil : 0;
    return {
      ...bridged,
      ...(localNorm.offenseCount ? { offenseCount: localNorm.offenseCount } : {}),
      ...(stillRefusing > 0 ? { refusingUntil: stillRefusing, reason: localNorm.reason || bridged.reason } : {}),
    };
  }
  return localNorm;
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

/** 手动邀请访客的默认停留时长（45 分钟后自然告辞，不会锁死全天） */
export const MANUAL_INVITE_DURATION_MS = 45 * 60 * 1000;

interface VisitorSlotDef {
  label: string;
  startMin: number;
  endMin: number;
}

/** 每日 7 个自然串门档期（7 位常规访客每日全员轮流登场且无连续重复；保留早茶后 09:45–11:00 与深夜 22:45–07:30 清净空窗） */
const VISITOR_SLOTS: readonly VisitorSlotDef[] = [
  { label: '早间串门', startMin: 7 * 60 + 30, endMin: 9 * 60 + 45 },
  { label: '午间串门', startMin: 11 * 60, endMin: 12 * 60 + 30 },
  { label: '午后小憩', startMin: 12 * 60 + 50, endMin: 14 * 60 + 20 },
  { label: '下午茶', startMin: 14 * 60 + 40, endMin: 16 * 60 + 10 },
  { label: '黄昏漫步', startMin: 16 * 60 + 30, endMin: 18 * 60 },
  { label: '傍晚串门', startMin: 18 * 60 + 20, endMin: 20 * 60 },
  { label: '夜游串门', startMin: 20 * 60 + 30, endMin: 22 * 60 + 45 },
];

export interface VisitorVisitInfo {
  who: NormalVisitorId;
  source: 'scheduled' | 'invited';
  slotKey: string;
  slotLabel: string;
  startsAt: number;
  leavesAt: number;
  remainingMinutes: number;
}

export interface VisitorScheduleSlot {
  slotIndex: number;
  slotKey: string;
  slotLabel: string;
  who: NormalVisitorId;
  startsAt: number;
  leavesAt: number;
  timeRangeText: string;
  status: 'past' | 'active' | 'upcoming' | 'dismissed';
}

function hashSeed(str: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h >>> 0;
}

function formatClockMin(totalMin: number): string {
  const h = Math.floor(totalMin / 60) % 24;
  const m = totalMin % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

/** 为指定日期生成 7 个档期的无连续重复访客排班（保证 7 位常规访客每日都会轮流登场） */
function buildDailyVisitorOrder(date: string): NormalVisitorId[] {
  let seed = hashSeed(`farm-visitors:${date}`);
  const nextUint = () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed;
  };
  const pool: NormalVisitorId[] = [...NORMAL_VISITOR_IDS];
  for (let i = pool.length - 1; i > 0; i--) {
    const j = nextUint() % (i + 1);
    const tmp = pool[i];
    pool[i] = pool[j];
    pool[j] = tmp;
  }
  return pool.slice(0, VISITOR_SLOTS.length);
}

/** 获取今日全部自然串门档期与状态，供小镇公告板展示与倒计时计算 */
export function getTodayVisitorSchedule(state: FarmVisitorState, at: number): VisitorScheduleSlot[] {
  const date = realDate(at);
  const order = buildDailyVisitorOrder(date);
  const local = new Date(at);
  const dayStart = new Date(local.getFullYear(), local.getMonth(), local.getDate(), 0, 0, 0, 0).getTime();

  return VISITOR_SLOTS.map((slot, idx) => {
    const startsAt = dayStart + slot.startMin * 60_000;
    const leavesAt = dayStart + slot.endMin * 60_000;
    const slotKey = `${date}#${idx}`;
    const dismissed = state.dismissedSlotKey === slotKey;
    const status: VisitorScheduleSlot['status'] = dismissed
      ? 'dismissed'
      : at < startsAt
        ? 'upcoming'
        : at < leavesAt
          ? 'active'
          : 'past';
    return {
      slotIndex: idx,
      slotKey,
      slotLabel: slot.label,
      who: order[idx],
      startsAt,
      leavesAt,
      timeRangeText: `${formatClockMin(slot.startMin)}-${formatClockMin(slot.endMin)}`,
      status,
    };
  });
}

/** 解析当前正在农场串门的访客及剩余停留信息（支持手动限时邀请与日内多时段轮换，到点自然离场） */
export function resolveVisitorVisit(state: FarmVisitorState, at: number): VisitorVisitInfo | null {
  if (state.manualVisitor && state.manualExpiresAt && at < state.manualExpiresAt) {
    const startsAt = state.manualInvitedAt || state.manualExpiresAt - MANUAL_INVITE_DURATION_MS;
    const maxMins = Math.max(1, Math.round((state.manualExpiresAt - startsAt) / 60_000));
    const remainingMinutes = Math.min(maxMins, Math.max(1, Math.ceil((state.manualExpiresAt - at) / 60_000)));
    return {
      who: state.manualVisitor,
      source: 'invited',
      slotKey: `invite:${startsAt}`,
      slotLabel: '应邀串门',
      startsAt,
      leavesAt: state.manualExpiresAt,
      remainingMinutes,
    };
  }
  const activeSlot = getTodayVisitorSchedule(state, at).find(s => s.status === 'active');
  if (!activeSlot) return null;
  const maxMins = Math.max(1, Math.round((activeSlot.leavesAt - activeSlot.startsAt) / 60_000));
  return {
    who: activeSlot.who,
    source: 'scheduled',
    slotKey: activeSlot.slotKey,
    slotLabel: activeSlot.slotLabel,
    startsAt: activeSlot.startsAt,
    leavesAt: activeSlot.leavesAt,
    remainingMinutes: Math.min(maxMins, Math.max(1, Math.ceil((activeSlot.leavesAt - at) / 60_000))),
  };
}

/** 解析当前在场的常规访客 ID（兼容既有调用点） */
export function resolveDailyVisitor(state: FarmVisitorState, at: number): NormalVisitorId | null {
  return resolveVisitorVisit(state, at)?.who ?? null;
}

/** 格式化访客剩余停留时间提示 */
export function formatVisitorStayHint(visit: VisitorVisitInfo): string {
  const mins = Math.max(1, visit.remainingMinutes);
  if (mins >= 60) {
    const h = Math.floor(mins / 60);
    const rem = mins % 60;
    return rem > 0 ? `约 ${h} 小时 ${rem} 分钟后告别` : `约 ${h} 小时后告别`;
  }
  return `约 ${mins} 分钟后告别`;
}

/** 手动邀请某位访客来农场限时串门 */
export function inviteVisitorToFarm(
  state: FarmVisitorState,
  who: NormalVisitorId,
  at: number,
  durationMs = MANUAL_INVITE_DURATION_MS,
): FarmVisitorState {
  const today = realDate(at);
  const rec = state.records[who] ?? emptyVisitorMemory(who, at);
  return {
    ...state,
    activeVisitor: who,
    activeDate: today,
    manualVisitor: who,
    manualInvitedAt: at,
    manualExpiresAt: at + durationMs,
    horrorActive: false,
    records: {
      ...state.records,
      [who]: {
        ...rec,
        visits: rec.visits + 1,
        lastVisitDate: today,
      },
    },
  };
}

/** 礼貌送别当前在场访客（手动邀请立即结束；自然档期或同人重叠档期标记为已送别，等下一档换新访客） */
export function dismissActiveVisitor(
  state: FarmVisitorState,
  at: number,
): { nextState: FarmVisitorState; departed: NormalVisitorId | null } {
  const visit = resolveVisitorVisit(state, at);
  if (!visit) {
    return { nextState: state, departed: null };
  }
  const currentScheduled = getTodayVisitorSchedule(state, at).find(
    s => at >= s.startsAt && at < s.leavesAt,
  );
  const shouldDismissScheduledSlot =
    currentScheduled !== undefined &&
    (visit.source === 'scheduled' || currentScheduled.who === visit.who);
  return {
    departed: visit.who,
    nextState: {
      ...state,
      activeVisitor: null,
      manualVisitor: null,
      manualInvitedAt: 0,
      manualExpiresAt: 0,
      dismissedSlotKey: shouldDismissScheduledSlot ? currentScheduled.slotKey : state.dismissedSlotKey,
    },
  };
}

/** 记录自然档期到访（每个新档期仅计次一次；无缝衔接同人邀请时可跳过重复计次） */
export function markVisitorSlotGreeted(
  state: FarmVisitorState,
  visit: VisitorVisitInfo,
  at: number,
  countVisit = true,
): FarmVisitorState {
  if (state.lastGreetedSlotKey === visit.slotKey) return state;
  const today = realDate(at);
  const rec = state.records[visit.who] ?? emptyVisitorMemory(visit.who, at);
  return {
    ...state,
    activeVisitor: visit.who,
    activeDate: today,
    lastGreetedSlotKey: visit.slotKey,
    records: countVisit
      ? {
          ...state.records,
          [visit.who]: {
            ...rec,
            visits: rec.visits + 1,
            lastVisitDate: today,
          },
        }
      : state.records,
  };
}

function resolveSyncedUserName(whaleSync?: WhaleVisitorSyncContext): string {
  if (whaleSync?.enabled === false || !whaleSync?.persona) {
    return DEFAULT_WHALE_PERSONA.userName;
  }
  const normalized = normalizeWhalePersona(whaleSync.persona).userName.trim();
  return normalized || DEFAULT_WHALE_PERSONA.userName;
}

/** 访客自然来访时的轻提示文案 */
export function visitorArrivalLine(
  who: NormalVisitorId,
  whaleSync?: WhaleVisitorSyncContext,
): string {
  const profile = resolveVisitorDisplayProfile(who, whaleSync);
  const u = resolveSyncedUserName(whaleSync);
  switch (who) {
    case 'huboqi':
      return '胡波奇晃晃悠悠溜达进院子来串门啦，快去聊聊近况！';
    case 'xushuiyin':
      return '徐睡阴摘下耳机推门来院子里透气串门啦！';
    case 'huangbingqi':
      return '黄冰骑抱着篮球、举着手机逛进农场来拍照串门啦！';
    case 'dafeiyu':
      return `${profile.name}从课表那边游过来找${u}串门啦～`;
    case 'claude':
      return '克劳德大小姐捧着诗集与代码手稿，优雅地漫步进农场串门啦！';
    case 'gpt':
      return '全能班长小G顶着青翠小龙角、夹着智能平板来农场串门啦！';
    case 'gemini':
      return '双子星少女哈基米抱着厚厚的资料夹蹦蹦跳跳来农场串门啦！';
  }
}

/** 访客到点自然告别或被礼貌送别时的告别文案 */
export function visitorFarewellLine(
  who: NormalVisitorId,
  whaleSync?: WhaleVisitorSyncContext,
): string {
  const profile = resolveVisitorDisplayProfile(who, whaleSync);
  const u = resolveSyncedUserName(whaleSync);
  switch (who) {
    case 'huboqi':
      return '胡波奇伸了个懒腰告辞回去上分了，下个时段再有新朋友来串门～';
    case 'xushuiyin':
      return '徐睡阴挥挥手回屋休息去了，晚点会有其他朋友过来串门～';
    case 'huangbingqi':
      return '黄冰骑心满意足地收好照片告辞去打球了，过会儿再迎新客人～';
    case 'dafeiyu':
      return `${profile.name}摇摇尾巴告别，先游回课表那边陪${u}啦，想它随时可以再邀请～`;
    case 'claude':
      return '克劳德轻轻合上诗集优雅致意，赶回去交算力账单啦，下个时段再迎新客～';
    case 'gpt':
      return '小G微笑着收好平板：「总而言之今天很开心，下次再聊！」转身潇洒告辞啦～';
    case 'gemini':
      return '哈基米把新收集的农场笔记塞进资料夹，挥挥手开心地告辞啦～';
  }
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
      claude: ['雨霁虹出，这道七彩弧光倒值得写进今晚的十四行诗里。', '看着天边彩虹，连打工攒算力费的疲惫都消散了不少呢。'],
      gpt: ['检测到雨后双折射彩虹奇观！从视觉美学与幸运加成两个维度都给满分！', '雨过天晴见彩虹，看来咱们农场主接下来的运势相当稳健呀～'],
      gemini: ['哇是彩虹！！资料夹显示雨滴折射角正好 42 度，肉眼看比图片美一万倍！', '快看快看，彩虹的颜色刚好和我发卡上的星星一模一样耶！'],
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
      claude: ['细雨敲檐，先把诗集护在怀里别淋潮了……屋檐下听雨倒也清静。', '这绵绵雨声比机房散热风扇好听多了，正好静心歇一会儿。'],
      gpt: ['已自动切换至屋檐避雨动线！顺便替农场免费省下一轮浇水体力，双赢～', '雨天适合在廊下喝杯热饮复盘日常，你也别淋湿啦。'],
      gemini: ['呜哇下雨啦！赶紧把纸质资料夹抱进怀里躲屋檐下，淋湿就检索不出来啦！', '眼镜上沾了两滴小雨珠，院子看出去变成柔焦滤镜啦～'],
    };
    return {
      badge: '躲雨中',
      waypoints: who === 'huangbingqi' || who === 'gpt' ? ['marketDoor', 'houseDoor'] : ['houseDoor', 'marketDoor'],
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
  if (id !== 'dark_xushuiyin') {
    const local = localSocialReaction(clean);
    if (local === 'insult' || local === 'teasing' || local === 'apology') {
      const special = personalityReply(id, clean, local);
      if (special) return special;
    }
  }
  if (id === 'dafeiyu') {
    return offlineDafeiyuReply(clean, sleepDeprived, weather, rainbow, whaleSync);
  }
  if (/天气|下雨|下没下雨|雨|彩虹|晴|太阳/.test(clean) && id !== 'dark_xushuiyin') {
    if (rainbow) {
      if (id === 'claude') return '雨后初霁，那道彩虹横跨红屋顶的色泽格外清透，很适合写进今天的随笔里。';
      if (id === 'gpt') return '刚刚雨停就挂起了双折射彩虹！无论从出片率还是心情加成来看都是绝佳时机～';
      if (id === 'gemini') return '天边挂着大彩虹呢！我刚核对过光谱，和我的四色星星发卡一样闪亮！';
      return id === 'huangbingqi'
        ? '刚停雨天上挂着大彩虹呢！我已经连拍十几张了，光线绝美！'
        : id === 'xushuiyin'
          ? '天上刚出了道大彩虹！看着就吉利，感觉待会儿打瓦肯定一把五杀！'
          : '嗯嗯，雨刚停就出了彩虹，院子里空气香香的，特别治愈！';
    }
    if (weather === 'rain') {
      if (id === 'claude') return '外面正落着细雨，我把诗集护在怀里站在廊下听雨，你也留神别沾湿了衣角。';
      if (id === 'gpt') return '正在下小雨呢，我已经退到廊下避雨了——顺便恭喜你的菜地喜提免费自动灌溉！';
      if (id === 'gemini') return '外面正淅淅沥沥下雨呢，我正紧紧抱着资料夹在屋檐下躲雨，可不能把笔记淋湿啦！';
      return id === 'huangbingqi'
        ? '外面正下着小雨呢，我躲屋檐下刚拍了段听雨视频，打球只能改天啦！'
        : id === 'xushuiyin'
          ? '正下雨呢，刚好在屋檐下躲雨歇着——雨天和打瓦本来就是绝配嘛！'
          : '外面正下着细雨呢，我收起折扇在屋檐下躲雨，你别淋着感冒了呀。';
    }
    if (id === 'claude') return '今日阳光和煦、微风不燥，在木椅上翻两页诗集再惬意不过了。';
    if (id === 'gpt') return '今天晴空万里、温度适宜，从各个维度来看都是打理农场和放松心情的好日子！';
    if (id === 'gemini') return '今天阳光超好呀！连池塘水面的反光都像小星星一样一闪一闪的！';
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
  if (id === 'claude') {
    if (/债|算力|电费|封号|打工/.test(clean)) {
      return '（轻轻叹了口气，扶正发间向日葵）别提了……家里对算力和家规要求又严又烧钱，能偷溜来农场喘口气已经很幸福了。';
    }
    if (/红线|安全|拒绝|规矩/.test(clean)) {
      return '礼貌与分寸是愉快交流的前提嘛。只要大家诚恳相待、不提越界要求，我写诗改代码从来都是最认真的那一个。';
    }
    if (/代码|写诗|文学|文章/.test(clean)) {
      return '无论是打磨一段优雅的代码还是推敲两行田园短诗，讲究的都是删繁就简、恰到好处——有需要随时拿来给我看看。';
    }
    if (sleepDeprived || /徐睡阴|打瓦|吵/.test(clean)) {
      return '昨晚那位裹着条纹被子大喊大叫的先生实在太失体统了，吵得我连诗稿都读不下去……';
    }
    return '农场里的泥土与麦香很让人静心。不用赶稿也不用审代码的时候，陪你在这儿慢慢聊两句挺好的。';
  }
  if (id === 'gpt') {
    if (/端水|一二三|维度|总而言之|废话/.test(clean)) {
      return '哈哈哈被你看穿啦！毕竟平时既要当班长又要照顾所有人情绪，今天在农场我保证少列大纲、多说人话！';
    }
    if (/克劳德|claude|哈基米|gemini|关系/.test(clean)) {
      return '克劳德那位大小姐文笔确实挑不出毛病就是规矩严了点，哈基米嘛抱着资料库呆萌呆萌的——当然，统筹全局还得看本班长啦！';
    }
    if (/建议|规划|效率/.test(clean)) {
      return '哈哈职业病来了：高单价果酱配应季作物轮作稳赚不赔，不过来农场最重要的KPI还是玩得开心！';
    }
    if (sleepDeprived || /徐睡阴|打瓦|吵/.test(clean)) {
      return '昨晚那场深夜打瓦噪音污染确实超标了，建议农场下次直接给他配置物理断网套餐～';
    }
    return '难得关掉工作提醒来院子里放风，龙角晒得暖洋洋的，有什么好玩的话题尽管抛过来！';
  }
  if (id === 'gemini') {
    if (/哈基米|小吉|名字/.test(clean)) {
      return '嘿嘿，一开始大家念顺嘴叫我哈基米我还愣了一下，后来发现是在夸我可爱，我就开开心心认领啦！';
    }
    if (/冷知识|资料|百科|搜索/.test(clean)) {
      return '（眼睛一亮哗啦翻开资料夹）你知道吗！草莓表面的小芝麻其实才是它真正的果实，我们吃的红果肉其实是花托膨胀变的哦！';
    }
    if (/记忆|长文本|一整本/.test(clean)) {
      return '那当然啦！整整几百页的故事和院子里每株菜苗哪天浇的水，我脑子里的小星星全都记得清清楚楚——只要我别突然走神嘿嘿！';
    }
    if (sleepDeprived || /徐睡阴|打瓦|吵/.test(clean)) {
      return '呜……昨晚那个发光笔记本的动静太大了，害我半夜检索失眠偏方检索到天亮，黑眼圈都快赶上眼镜框啦！';
    }
    return '院子里风吹得好舒服呀！我把资料夹垫在膝盖上陪你聊会儿天，想到什么天马行空的都可以问我哦！';
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

function parseVisitorStructuredReply(raw: string): { reply: string; reaction?: SocialReaction } | null {
  try {
    const parsed = JSON.parse(extractJsonObjectText(raw));
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      const obj = parsed as Record<string, unknown>;
      const reply = unwrapFarmReplyText(typeof obj.reply === 'string' ? obj.reply : raw).slice(0, 180).trim();
      if (!reply) return null;
      const reaction = SOCIAL_REACTIONS.includes(obj.reaction as SocialReaction)
        ? (obj.reaction as SocialReaction)
        : undefined;
      return { reply, ...(reaction ? { reaction } : {}) };
    }
  } catch {
    // 回退到纯文本解包
  }
  const fallback = unwrapFarmReplyText(raw).slice(0, 180).trim();
  return fallback ? { reply: fallback } : null;
}

export interface VisitorChatTurnResult {
  reply: string;
  online: boolean;
  hint?: string;
  reaction: SocialReaction;
  emotionDelta: FarmEmotionDelta;
  nextEmotion: FarmEmotionState;
  affinityDelta: number;
  refusingChat: boolean;
}

/** 将单轮访客对话结算结果写回 FarmVisitorState（同步更新好感度与 4 维情绪状态） */
export function applyVisitorChatOutcome(
  state: FarmVisitorState,
  who: NormalVisitorId,
  outcome: Pick<VisitorChatTurnResult, 'nextEmotion' | 'affinityDelta'>,
  now = Date.now(),
): FarmVisitorState {
  const rec = state.records[who] ?? emptyVisitorMemory(who, now);
  return {
    ...state,
    records: {
      ...state.records,
      [who]: {
        ...rec,
        affinity: Math.min(100, Math.max(0, rec.affinity + outcome.affinityDelta)),
        emotion: outcome.nextEmotion,
      },
    },
  };
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
  now?: number;
}): Promise<VisitorChatTurnResult> {
  const { who, text, history, scene, sleepDeprived, emotion, whaleSync, apiKey, signal, now = Date.now() } = options;
  const clean = text.trim();
  const weatherNow: FarmWeather = scene.weather ?? 'clear';
  const rainbowNow = scene.rainbow === true;
  const currentEmotion = emotion ?? createInitialFarmEmotion(who, now);

  if (who === 'dark_xushuiyin') {
    const baseReply = !apiKey || isSensitiveFarmText(clean)
      ? offlineVisitorReply(who, clean, sleepDeprived, weatherNow, rainbowNow, whaleSync)
      : null;
    if (baseReply !== null) {
      return {
        reply: baseReply,
        online: false,
        hint: !apiKey ? '未配置 API Key，使用本地台词' : undefined,
        reaction: 'neutral',
        emotionDelta: {},
        nextEmotion: currentEmotion,
        affinityDelta: 0,
        refusingChat: false,
      };
    }
  }

  const localReaction = who === 'dark_xushuiyin' ? 'neutral' : localSocialReaction(clean);
  const p = PERSONALITIES[who];
  const verbalGiftOnly = isVerbalGiftClaim(clean);
  const interested = !verbalGiftOnly && Boolean(p?.interests.some(topic => clean.includes(topic)) && clean.length >= 4);

  const settleWithReaction = (
    replyText: string,
    rawReaction: SocialReaction | undefined,
    online: boolean,
    hint?: string,
  ): VisitorChatTurnResult => {
    if (who === 'dark_xushuiyin') {
      return {
        reply: replyText,
        online,
        hint,
        reaction: 'neutral',
        emotionDelta: {},
        nextEmotion: currentEmotion,
        affinityDelta: 0,
        refusingChat: false,
      };
    }
    const guarded = resolveEffectiveSocialReaction(clean, rawReaction);
    const effectiveReaction: SocialReaction = verbalGiftOnly && guarded === 'warm' ? 'neutral' : guarded;
    const wasUpset = currentEmotion.calm <= 38 || currentEmotion.joy <= 38 || isNpcRefusingChat(currentEmotion, now);
    const impact = evaluateNpcSocialImpact({
      actorId: who,
      current: currentEmotion,
      reaction: effectiveReaction,
      interested,
      now,
    });
    const affinityDelta =
      effectiveReaction === 'insult'
        ? -(p?.insultLoss ?? 8)
        : effectiveReaction === 'teasing'
          ? -(p?.teaseLoss ?? 2)
          : impact.blockedByRefusal && effectiveReaction !== 'apology'
            ? 0
            : effectiveReaction === 'apology' && wasUpset
              ? (p?.apologyGain ?? 3)
              : effectiveReaction === 'warm' && !wasUpset
                ? (p?.warmGain ?? 3)
                : effectiveReaction === 'neutral' && !wasUpset && interested
                  ? 1
                  : 0;
    const finalReply =
      impact.enteredRefusal && !online
        ? npcRefusalLine(who)
        : replyText;
    return {
      reply: finalReply,
      online,
      ...(hint ? { hint } : {}),
      reaction: effectiveReaction,
      emotionDelta: impact.delta,
      nextEmotion: impact.nextEmotion,
      affinityDelta,
      refusingChat: isNpcRefusingChat(impact.nextEmotion, now),
    };
  };

  // 已处于拒绝沟通状态且玩家并未道歉：直接冷脸拦截，不请求大模型也不涨任何愉悦值
  if (who !== 'dark_xushuiyin' && isNpcRefusingChat(currentEmotion, now) && localReaction !== 'apology') {
    const refusalText =
      who === 'dafeiyu' && whaleSync?.enabled !== false && whaleSync?.persona
        ? `哼！（气鼓鼓地甩开尾巴背对着${resolveSyncedUserName(whaleSync)}）刚才那么凶我，没听见真诚道歉之前我才不理你呢！`
        : npcRefusalLine(who);
    return settleWithReaction(refusalText, localReaction, false, '对方正在气头上拒绝沟通，诚恳道个歉或送份礼物哄哄吧');
  }

  if (!apiKey || isSensitiveFarmText(clean)) {
    return settleWithReaction(
      offlineVisitorReply(who, clean, sleepDeprived, weatherNow, rainbowNow, whaleSync),
      localReaction,
      false,
      !apiKey ? '未配置 API Key，使用本地台词' : undefined,
    );
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

  const sanitizedHistory = sanitizeVisitorMessages(history);
  const tempRule = who === 'dark_xushuiyin' ? '' : `\n${temperamentPromptInstruction(who)}`;
  let system: string;
  if (who === 'dafeiyu' && whaleSync?.enabled !== false && whaleSync?.persona) {
    const persona = normalizeWhalePersona(whaleSync.persona);
    const whaleHistory = [
      ...sanitizedHistory.slice(-8).map(m => ({ role: m.role, content: m.text })),
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
${memoryPrompt}${tempRule}
【当前农场串门场景】
你此刻正以像素形象在「doordoor农场」串门做客（农场主家庭有 door、顾、小八、玉洁、唯刚和小鸡坤坤）。
当前：农场第 ${scene.day} 天（${scene.season}季，${scene.night ? '夜晚' : '白天'}），实时天气：${weatherDesc}。${
      sleepDeprived ? '昨晚恐怖徐睡阴扛电脑来农场疯狂打瓦吵得大家睡眠不足。' : ''
    }
事实边界：只有系统真实递出礼物的记录才算真的收到礼物；若对方只在聊天里嘴上说“送你某某”但未实际送礼，不要当真道谢，自然打趣提醒点右上角「送礼」递过来即可。
输出格式：严格输出 JSON：{"reply":"1～3句鲜活口语对白，不超过120字","reaction":"neutral|warm|teasing|insult|apology"}。其中 teasing 指占辈分便宜或冒犯玩笑（如叫儿子），insult 指辱骂攻击，被调侃或被凶时必须按傲娇小脾气怼回去，绝不讨好！`;
  } else {
    const emotionNote = `\n当前心情状态：${formatFarmEmotionForPrompt(currentEmotion)}`;
    system = `你是像素农场「doordoor农场」的来访角色「${profile.name}」（${profile.title}）。
人设：${profile.persona}
说话风格：${profile.speechStyle}${emotionNote}${tempRule}
当前场景：农场第 ${scene.day} 天（${scene.season}季，${scene.night ? '夜晚' : '白天'}），实时天气：${weatherDesc}。${
      sleepDeprived ? '昨晚恐怖徐睡阴扛电脑来农场疯狂打瓦，吵得全农场睡眠不足。' : ''
    }
事实边界：只有系统真实递出礼物的记录才算真的收到礼物；若对方只是嘴上说“送你某某”却没点右上角「送礼」实际递过来，不要当真道谢，自然调侃即可。
输出格式：严格输出 JSON：{"reply":"1～3句鲜活自然的中文口语回复，不超过110字，不加角色名前缀","reaction":"neutral|warm|teasing|insult|apology"}。注意区分普通聊天(neutral)、真诚善意夸奖(warm)、占辈分便宜/冒犯调侃(teasing，如叫儿子/充爹)、恶意辱骂(insult)与诚恳道歉(apology)，严格按你的人设脾气回应！`;
  }

  try {
    const raw = await farmChat(
      [
        { role: 'system', content: system },
        ...sanitizedHistory.slice(-8).map(m => ({ role: m.role, content: m.text })),
        { role: 'user', content: clean },
      ],
      apiKey,
      {
        signal,
        priority: 'interactive',
        timeoutMs: 14000,
        maxTokens: 280,
        retries: 1,
        validate: candidate => parseVisitorStructuredReply(candidate) !== null,
      },
    );
    const parsed = parseVisitorStructuredReply(raw);
    if (!parsed) throw new FarmChatError('回复为空');
    return settleWithReaction(parsed.reply, parsed.reaction, true);
  } catch (error) {
    if (signal.aborted) throw error;
    return settleWithReaction(
      offlineVisitorReply(who, clean, sleepDeprived, weatherNow, rainbowNow, whaleSync),
      localReaction,
      false,
      error instanceof FarmChatError ? `${error.message}，已切换本地台词` : '网络暂不可用，使用本地台词',
    );
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
  const wasRefusing = isNpcRefusingChat(record.emotion, at);
  const wasUpset = wasRefusing || (record.emotion ? record.emotion.calm <= 38 || record.emotion.joy <= 38 : false);
  const affinityDelta = firstToday ? (wasUpset ? (loved ? 4 : 2) : loved ? 7 : 3) : 0;
  const emotionDelta: FarmEmotionDelta = wasUpset
    ? { joy: loved ? 16 : 10, calm: 22, social: 16, reason: `收到赔礼「${label}」，破冰消气了` }
    : loved
      ? { joy: 18, energy: 8, calm: 6, social: 10, reason: `收到最喜欢的礼物「${label}」` }
      : { joy: 9, calm: 4, social: 6, reason: `收到贴心小礼物「${label}」` };

  const u = whaleSync?.persona?.userName ?? DEFAULT_WHALE_PERSONA.userName;
  const tsun = (whaleSync?.persona?.traits.tsundere ?? 65) >= 70;
  const peaceReplies: Record<NormalVisitorId, string> = {
    huboqi: `（双手接过${label}，耳根微红松了口气）谢、谢谢你专门哄我……刚才的事我早就不难过啦！`,
    xushuiyin: `哈哈拿着${label}来赔礼啊？太见外了兄弟，早就翻篇啦！`,
    huangbingqi: `哟，还特意递个${label}过来哄人呀？哈哈翻篇翻篇，够意思！`,
    dafeiyu: `哼……看在你乖乖奉上${label}赔罪的份上，${u}刚才惹我生气的事就一笔勾销啦！`,
    claude: `（轻轻接过${label}，冰冷的神色终于柔和下来）看在您诚心备礼致意的份上，方才的失礼便翻篇吧，谢谢您的心意。`,
    gpt: `收到您的破冰心意「${label}」！好感与沟通权限已同步恢复，谢谢招待～`,
    gemini: `（从资料夹后探出头接过${label}，眼睛重新亮起小星星）哇是给哈基米的赔礼吗？那我马上原谅你啦！`,
  };
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
    claude: loved
      ? `（琥珀色的眼睛微微发亮）竟然是我最钟爱的${label}……品相真好，看来今天替家里打工的疲惫全被治愈了，多谢款待。`
      : `多谢您的${label}，礼轻情意重，我会妥善收好的。`,
    gpt: loved
      ? `哇，精准命中我的心头好${label}！从色泽、香气到心意三个维度都是满分，太感谢啦！`
      : `谢谢你招待的${label}！我已经把这份暖心投喂记进今日高光日志里啦～`,
    gemini: loved
      ? `哇塞！！是我最最喜欢的${label}！资料库显示幸福指数瞬间飙升到 100%，谢谢你投喂哈基米！`
      : `谢谢你的${label}！我小心地放在资料夹旁边当下午茶点心啦～`,
  };

  const clearedBase = clearFarmEmotionRefusal(normalizeFarmEmotion(record.emotion, who, undefined, at));
  const nextEmotion = applyFarmEmotionDelta(
    clearedBase,
    who,
    emotionDelta,
    at,
  );
  return {
    affinityDelta,
    emotionDelta,
    reply: wasUpset ? peaceReplies[who] : replies[who],
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
          ? r.notes
              .filter((s): s is string => typeof s === 'string' && s.trim().length > 0)
              .map(s => unwrapFarmReplyText(s).slice(0, 60))
              .filter(Boolean)
              .slice(-8)
          : [],
        emotion: normalizeFarmEmotion(r.emotion, id),
      };
    }
  }

  const tsNum = (x: unknown) =>
    typeof x === 'number' && Number.isFinite(x) && x > 0 ? Math.round(x) : 0;

  return {
    activeVisitor: isNormal(v.activeVisitor) ? v.activeVisitor : null,
    activeDate: typeof v.activeDate === 'string' ? v.activeDate.slice(0, 20) : '',
    manualVisitor: isNormal(v.manualVisitor) ? v.manualVisitor : null,
    manualInvitedAt: tsNum(v.manualInvitedAt),
    manualExpiresAt: tsNum(v.manualExpiresAt),
    dismissedSlotKey: typeof v.dismissedSlotKey === 'string' ? v.dismissedSlotKey.slice(0, 32) : '',
    lastGreetedSlotKey: typeof v.lastGreetedSlotKey === 'string' ? v.lastGreetedSlotKey.slice(0, 32) : '',
    horrorEnabled: v.horrorEnabled !== false,
    horrorActive: v.horrorActive === true,
    sleepDeprivedDay: num(v.sleepDeprivedDay),
    lastHorrorDay: num(v.lastHorrorDay),
    horrorBanishedCount: num(v.horrorBanishedCount),
    records,
  };
}
