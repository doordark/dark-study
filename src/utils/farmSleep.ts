import type { WaypointId } from '@/constants/farmMap';
import { RESIDENTS, type ResidentId } from './farmLife';
import type { FarmWeather } from './farmTown';

/** 会在夜晚回小屋房间睡觉的 5 位人类家庭成员（坤坤回鸡窝打盹，不占小屋床位）。 */
export const INDOOR_SLEEPERS: readonly ResidentId[] = ['door', 'gu', 'xiaoba', 'yujie', 'weigang'];
export type IndoorSleeperId = Exclude<ResidentId, 'chicken'>;

export type FarmRoomId = 'master' | 'xiaoba' | 'yujie' | 'weigang';

export interface FarmRoomBedSlot {
  resident: IndoorSleeperId;
  /** 房间 240×180 逻辑坐标系下睡姿贴图中心点 */
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface FarmRoomMeta {
  id: FarmRoomId;
  name: string;
  shortName: string;
  subtitle: string;
  accent: string;
  bedType: 'double' | 'single';
  occupants: readonly IndoorSleeperId[];
  /** 房间 240×180 逻辑坐标系下的床铺点击区（主卧可点击睡觉，兄弟房可参观或午休） */
  bedRect: { x: number; y: number; w: number; h: number };
  /** 睡姿精灵摆放槽位（主卧双人床左右并排各一格） */
  sleepSlots: readonly FarmRoomBedSlot[];
  /** 书桌伴读入口是否存在 */
  hasDeskFocus: boolean;
  dayFlavor: string;
  nightFlavor: string;
}

export const FARM_ROOM_IDS: readonly FarmRoomId[] = ['master', 'xiaoba', 'yujie', 'weigang'];

export const FARM_ROOMS: Record<FarmRoomId, FarmRoomMeta> = {
  master: {
    id: 'master',
    name: '主卧 · door & 顾',
    shortName: '主卧(双人床)',
    subtitle: '宽敞的双人木床与写代码的小书桌，door 与 顾 晚上同睡在这张大床上',
    accent: '#667F50',
    bedType: 'double',
    occupants: ['door', 'gu'],
    bedRect: { x: 162, y: 66, w: 72, h: 104 },
    sleepSlots: [
      { resident: 'door', x: 166, y: 74, w: 32, h: 42 },
      { resident: 'gu', x: 198, y: 74, w: 32, h: 42 },
    ],
    hasDeskFocus: true,
    dayFlavor: '阳光斜斜照在双人床和电脑书桌上，窗外山坡绿意盎然',
    nightFlavor: '台灯晕开温柔暖光，door 和 顾 晚上并排睡在双人床上',
  },
  xiaoba: {
    id: 'xiaoba',
    name: '小八的房间',
    shortName: '小八房',
    subtitle: '墙上挂着手绘山谷地图，桌边摆着复古像素主机与草图卷轴',
    accent: '#527C9F',
    bedType: 'single',
    occupants: ['xiaoba'],
    bedRect: { x: 166, y: 66, w: 60, h: 102 },
    sleepSlots: [{ resident: 'xiaoba', x: 175, y: 74, w: 42, h: 46 }],
    hasDeskFocus: true,
    dayFlavor: '书桌上摊着刚画一半的新关卡草图，仙人掌晒得正精神',
    nightFlavor: '小台灯暗了下来，格纹被子里传来安稳匀称的呼吸声',
  },
  yujie: {
    id: 'yujie',
    name: '玉洁的房间',
    shortName: '玉洁房',
    subtitle: '木吉他斜靠在窗边，书桌摆着耳机架、黑胶唱片与最爱的小说',
    accent: '#87639B',
    bedType: 'single',
    occupants: ['yujie'],
    bedRect: { x: 166, y: 66, w: 60, h: 102 },
    sleepSlots: [{ resident: 'yujie', x: 175, y: 74, w: 42, h: 46 }],
    hasDeskFocus: false,
    dayFlavor: '午后微风吹动窗帘，木吉他和耳机在阳光里格外精致',
    nightFlavor: '摘下眼镜的校草难得乖巧，正窝在薰衣草菱格被里做美梦',
  },
  weigang: {
    id: 'weigang',
    name: '唯刚的房间',
    shortName: '唯刚房',
    subtitle: '墙上并排挂着鱼竿和紫色尖帽，床头小鱼缸里的小金鱼悠闲吐泡',
    accent: '#3F867D',
    bedType: 'single',
    occupants: ['weigang'],
    bedRect: { x: 166, y: 66, w: 60, h: 102 },
    sleepSlots: [{ resident: 'weigang', x: 175, y: 74, w: 42, h: 46 }],
    hasDeskFocus: true,
    dayFlavor: '桌上有算盘、数学演算纸与仙侠小说，床头金鱼转着圈游',
    nightFlavor: '鱼缸泛着淡淡柔光，青绿被窝里的钓鱼佬梦里都在守漂',
  },
};

export function roomForResident(who: IndoorSleeperId): FarmRoomId {
  if (who === 'door' || who === 'gu') return 'master';
  return who;
}

export type NightEventCategory =
  | 'midnight_snack'
  | 'hobby'
  | 'stargazing'
  | 'care'
  | 'mischief'
  | 'emo';

export interface NightSoloEvent {
  resident: ResidentId;
  category: NightEventCategory;
  badge: string;
  waypoint: WaypointId;
  thought: string;
  comfortPrompt: string;
  /** 是否适合雨夜（屋檐/集市棚下等） */
  rainSafe?: boolean;
}

type ResidentEventEntry = Omit<NightSoloEvent, 'resident'>;

const NIGHT_SOLO_POOL: Record<IndoorSleeperId, ResidentEventEntry[]> = {
  door: [
    {
      category: 'hobby',
      badge: '灵感爆棚',
      waypoint: 'houseDoor',
      thought: '刚躺下突然想通一个绝妙的农场小游戏算法，偷偷溜出来借屋檐灯光记下来！',
      comfortPrompt: '大半夜站在屋门口写写画画，又想到什么新点子啦？',
      rainSafe: true,
    },
    {
      category: 'midnight_snack',
      badge: '偷啃宵夜',
      waypoint: 'houseDoor',
      thought: '摸黑端了半块南瓜派蹲在门前吃，得竖起耳朵防着顾半夜抓包……',
      comfortPrompt: '被我抓到了！半夜蹲在门口偷吃什么好东西呢？',
      rainSafe: true,
    },
    {
      category: 'mischief',
      badge: '躲顾熬夜',
      waypoint: 'pondBench',
      thought: '眼看要被顾催着关电脑，干脆战略转移到长椅上假装夜风散步，机智！',
      comfortPrompt: '哈哈，你是不是为了躲顾查岗才溜到长椅上的？',
    },
    {
      category: 'care',
      badge: '偷擦水壶',
      waypoint: 'farmLeft',
      thought: '白天忘了给水壶除锈，半夜良心发现溜出来悄悄拿油布打磨一下。',
      comfortPrompt: '这么晚还在帮着保养水壶呀，辛苦啦！',
    },
    {
      category: 'emo',
      badge: '夜深怀旧',
      waypoint: 'plaza',
      thought: '夜风吹着突然想起大学宿舍里波奇、睡阴和冰骑闹腾的日子，既吵又让人怀念。',
      comfortPrompt: '看你一个人在院子吹风笑，是不是想起大学室友了？',
    },
  ],
  gu: [
    {
      category: 'care',
      badge: '夜查菜苗',
      waypoint: 'farmCenter',
      thought: '担心夜里起风把刚发芽的嫩苗吹歪，披上外套出来巡了一圈才放心。',
      comfortPrompt: '这么晚还在田边照看小苗呀，别着凉了！',
    },
    {
      category: 'midnight_snack',
      badge: '试熬宵夜',
      waypoint: 'houseDoor',
      thought: '突然琢磨出一道暖胃萝卜甜汤的新火候，顺手多盛一碗留给晚睡的你。',
      comfortPrompt: '门口好香呀，顾大晚上又在厨房研究什么好吃的啦？',
      rainSafe: true,
    },
    {
      category: 'stargazing',
      badge: '院中赏月',
      waypoint: 'plaza',
      thought: '今晚月亮又圆又亮，忍不住站院子里多看两眼，把白天忙乱的心也晒透了。',
      comfortPrompt: '今晚月色确实真好看，陪你一起看一会儿吧！',
    },
    {
      category: 'care',
      badge: '留灯等归',
      waypoint: 'houseDoor',
      thought: '听见院子里还有动静，披件外套出来看看你忙完没，锅里花茶还热着呢。',
      comfortPrompt: '顾怎么还没睡呀，是不是在等我？',
      rainSafe: true,
    },
    {
      category: 'emo',
      badge: '惦记全家',
      waypoint: 'houseDoor',
      thought: '夜深静下来总忍不住操心三个孩子和你的作息，出来吹会儿夜风舒口气。',
      comfortPrompt: '顾别操心太多啦，大家都好好的，你也早点歇会儿吧。',
      rainSafe: true,
    },
  ],
  xiaoba: [
    {
      category: 'hobby',
      badge: '夜绘地图',
      waypoint: 'plaza',
      thought: '趁院子没人打扰，借着微弱灯光补画一份《doordoor 农场夜景路线图》。',
      comfortPrompt: '这么晚还在画夜景地图呀，让我也看看画到哪块啦？',
    },
    {
      category: 'care',
      badge: '悄悄巡院',
      waypoint: 'marketDoor',
      thought: '睡前习惯绕院子和集市口检查一遍门闩与鸡窝，确认安稳才好踏实睡。',
      comfortPrompt: '大哥真靠谱，大半夜还在巡查院子安全呀。',
      rainSafe: true,
    },
    {
      category: 'mischief',
      badge: '藏小惊喜',
      waypoint: 'marketDoor',
      thought: '在木篱笆旁悄悄藏了张手绘捷径小纸条，打算明天早上让你自己发现。',
      comfortPrompt: '看你神神秘秘的，是不是在院子里藏什么小惊喜呢？',
      rainSafe: true,
    },
    {
      category: 'stargazing',
      badge: '独自看月',
      waypoint: 'pondBench',
      thought: '睡不着，一个人坐长椅吹吹夜风，看看月光照在草坡和池水上。',
      comfortPrompt: '这么晚还在外面吹风看月亮，陪你安静坐会儿？',
    },
    {
      category: 'emo',
      badge: '静夜放空',
      waypoint: 'pondBench',
      thought: '白天话少懒得解释的事，晚上一个人坐着听听风声，慢慢也就想通了。',
      comfortPrompt: '看你一个人坐长椅发呆，有什么心事可以跟我说说。',
    },
  ],
  yujie: [
    {
      category: 'hobby',
      badge: '月下练歌',
      waypoint: 'plaza',
      thought: '趁大伙儿都睡着了，在广场小声练两句汪苏泷的副歌转音，这回肯定超稳！',
      comfortPrompt: '哈哈被我听见啦！大半夜在广场开个人演唱会呢？',
    },
    {
      category: 'midnight_snack',
      badge: '偷吃夜宵',
      waypoint: 'marketDoor',
      thought: '偷偷摸出下午藏在集市屋檐下的甜蓝莓和面包渣，千万别被妈抓现行！',
      comfortPrompt: '好家伙，大晚上躲屋檐下偷吃蓝莓，分我两颗我就保密！',
      rainSafe: true,
    },
    {
      category: 'mischief',
      badge: '偷追热番',
      waypoint: 'houseDoor',
      thought: '屋里怕笑出声吵醒大哥和唯刚，溜出来戴耳机追最新一集搞笑番憋笑憋到抖！',
      comfortPrompt: '什么番这么好笑，大半夜躲屋檐下偷偷憋笑？',
      rainSafe: true,
    },
    {
      category: 'stargazing',
      badge: '夜拍大片',
      waypoint: 'plaza',
      thought: '今晚院子星光配灯火简直绝了，摆个帅气姿势练练镜头感，改天让冰骑帮拍！',
      comfortPrompt: '校草大晚上还在研究夜景构图呀，够讲究的！',
    },
    {
      category: 'emo',
      badge: '深夜emo',
      waypoint: 'plaza',
      thought: '戴着耳机在院子里循环慢歌，莫名其妙进入三分钟文艺青年的深夜 emo……',
      comfortPrompt: '看你大晚上一个人在院子里 emo，怎么啦？',
    },
  ],
  weigang: [
    {
      category: 'hobby',
      badge: '夜钓守漂',
      waypoint: 'pond',
      thought: '听说月光鱼只有深夜才会浮近水面，我悄悄拿根鱼竿在池边再守十分钟！',
      comfortPrompt: '哇，大晚上偷偷在池边蹲月光鱼呀，咬钩了没？',
    },
    {
      category: 'care',
      badge: '给鱼投食',
      waypoint: 'pond',
      thought: '躺床上突然想起傍晚忘了撒麦香鱼饵，悄悄跑来池塘边给小鱼加顿夜宵。',
      comfortPrompt: '你也太细心啦，半夜还专门跑来喂池塘里的鱼。',
    },
    {
      category: 'mischief',
      badge: '夜观天象',
      waypoint: 'pondBench',
      thought: '对照今晚的风向、湿气和水面涟漪认真推演——明天出彩虹的概率大概有六成！',
      comfortPrompt: '大晚上化身农场气象台啦？算出来明天晴天还是下雨？',
      rainSafe: true,
    },
    {
      category: 'stargazing',
      badge: '听虫看星',
      waypoint: 'pondBench',
      thought: '夜里草丛里的虫鸣声特别有节奏，数着池面晃悠的星光感觉整个人都松快了。',
      comfortPrompt: '池边夜风和虫鸣确实很治愈，我也来坐一会儿。',
    },
    {
      category: 'emo',
      badge: '深夜失眠',
      waypoint: 'pond',
      thought: '嗯……翻来覆去睡不着，出来听会儿池塘水声，心里静多了。',
      comfortPrompt: '这么晚还在池塘边发呆，是失眠了吗？',
    },
  ],
};

export const SLEEPING_DREAMS: Record<IndoorSleeperId, string> = {
  door: '呼……这个 bug 明天再改……顾别抢被角……呼……',
  gu: '嗯……明早给孩子们熬南瓜粥……door 盖好被子……',
  xiaoba: '……地图南边再画一棵树……藏个隐藏宝箱……',
  yujie: '哼……副歌高音我最稳……全场欢呼……zzZ',
  weigang: '嗯……浮漂动了……大锦鲤别跑……本命法宝收竿……',
};

export const TUCK_IN_REACTIONS: Record<IndoorSleeperId, string> = {
  door: '你帮 door 掖了掖双人床的被角，他迷糊嘟囔了句“谢啦，明天一起修菜地”又沉沉睡去。',
  gu: '你替顾轻拉好被子，她眉眼弯弯地往枕头里蹭了蹭，连梦里都透着温柔。',
  xiaoba: '你替小八把格纹被拉齐，他眉头一下子舒展开来，呼吸变得更匀称了。',
  yujie: '你轻轻把空调被盖过玉洁肩膀，他小声哼了半句旋律翻了个身，睡得更香了。',
  weigang: '你帮唯刚掖好青绿被子，顺手瞄了眼床头吐泡泡的小金鱼，屋里静谧又安心。',
};

export const WAKE_UP_LINES: Record<IndoorSleeperId, string> = {
  door: '唔……被你叫醒啦？嘘，别吵醒旁边的顾，我披件外套出去院子里陪你聊两句。',
  gu: '呀，这么晚你还没歇着呀？我轻手轻脚起来不吵 door，给你倒杯温水去院子里坐会儿。',
  xiaoba: '……嗯？有事吗？好，我醒了，这就从房间出来找你。',
  yujie: '喂！大半夜把本校草从被窝里拽起来干嘛呀……行吧看在你的面子上，戴上眼镜出去陪你唠五块钱的！',
  weigang: '嗯……哈欠……醒了醒了，我还以为大锦鲤咬钩了呢，咱们出去走两步聊吧。',
};

/** 夜晚 19:00–23:59 或 00:00–05:59 判断是否进入深度熟睡阶段（深睡叫醒会有轻微起床气） */
export function isDeepSleepHour(hour: number): boolean {
  return hour >= 23 || hour < 5;
}

/**
 * 确定性计算今夜的「深夜不回屋随机事件」：
 * 约 75% 的夜晚会有 1 位家人因各种有趣缘由留在院子里，其余家人在各自房间安稳睡觉；
 * 雨夜会自动筛选屋檐/棚下的避雨事件。
 */
export function resolveNightSoloEvent(
  day: number,
  night: boolean,
  weather: FarmWeather = 'clear',
): NightSoloEvent | null {
  if (!night) return null;
  const hash = (day * 2654435761) >>> 0;
  if (hash % 8 >= 6) return null;
  const candidates: IndoorSleeperId[] = ['yujie', 'xiaoba', 'weigang', 'door', 'gu'];
  const who = candidates[hash % candidates.length];
  const fullPool = NIGHT_SOLO_POOL[who];
  const eligible = weather === 'rain' ? fullPool.filter(e => e.rainSafe) : fullPool;
  const pool = eligible.length ? eligible : fullPool;
  const pickIdx = ((hash >>> 5) + day * 3) % pool.length;
  return {
    resident: who,
    ...pool[pickIdx],
  };
}

/** 计算此刻正在小屋房间里睡觉的居民列表（剔除随机在外活动的人与被玩家叫醒的人）。 */
export function computeSleepingResidents(options: {
  night: boolean;
  day: number;
  wokenIds: readonly ResidentId[];
  weather?: FarmWeather;
  /** 若提供当前小时，19:00–20:59 为陆续回屋时段，21:00 后全面入睡 */
  hour?: number;
}): {
  sleeping: IndoorSleeperId[];
  soloEvent: NightSoloEvent | null;
} {
  const { night, day, wokenIds, weather = 'clear', hour } = options;
  if (!night) return { sleeping: [], soloEvent: null };
  const soloEvent = resolveNightSoloEvent(day, night, weather);
  const wokenSet = new Set(wokenIds);
  const sleeping = (INDOOR_SLEEPERS as readonly IndoorSleeperId[]).filter(id => {
    if (wokenSet.has(id)) return false;
    if (soloEvent && soloEvent.resident === id) return false;
    // 19 点傍晚入夜初期：唯刚与顾先回屋准备，20 点后全员陆续上床（不提供 hour 时默认全员入睡以兼容既有测试）
    if (typeof hour === 'number' && hour === 19) {
      return id === 'weigang' || id === 'gu';
    }
    return true;
  });
  return { sleeping, soloEvent };
}

/** 按房间分组返回当前在各房间熟睡的家人 */
export function sleepersByRoom(sleeping: readonly IndoorSleeperId[]): Record<FarmRoomId, IndoorSleeperId[]> {
  const map: Record<FarmRoomId, IndoorSleeperId[]> = {
    master: [],
    xiaoba: [],
    yujie: [],
    weigang: [],
  };
  for (const id of sleeping) {
    map[roomForResident(id)].push(id);
  }
  return map;
}

export function allNightEventPoolCount(): number {
  return Object.values(NIGHT_SOLO_POOL).reduce((sum, list) => sum + list.length, 0);
}

export function residentSleepLabel(who: ResidentId): string {
  return `${RESIDENTS[who].name}正在熟睡`;
}

export interface PlayerSleepOutcome {
  mode: 'nap' | 'full';
  jumpMs: number;
  nextDay: number;
  summary: string;
}

/** 计算玩家在床铺休息（小憩 3 小时 或 睡到次日 07:00）的时间推进与晨间结算 */
export function resolvePlayerSleep(options: {
  mode: 'nap' | 'full';
  currentGrowthNow: number;
  epoch: number;
  wakeHour?: number;
  sleepDeprived?: boolean;
}): PlayerSleepOutcome {
  const { mode, currentGrowthNow, epoch, wakeHour = 7, sleepDeprived = false } = options;
  const MINUTE = 60_000;
  const DAY = 24 * 60 * MINUTE;
  if (mode === 'nap') {
    const jumpMs = 3 * 60 * MINUTE;
    const nextDay = Math.max(1, Math.floor((currentGrowthNow + jumpMs - epoch) / DAY) + 1);
    return {
      mode,
      jumpMs,
      nextDay,
      summary: `小憩 3 小时 · 作物悄悄长了一截，大伙儿精神也缓过来了`,
    };
  }
  const d = new Date(currentGrowthNow);
  const target = new Date(currentGrowthNow);
  if (d.getHours() >= wakeHour) target.setDate(target.getDate() + 1);
  target.setHours(wakeHour, 0, 0, 0);
  const jumpMs = Math.max(MINUTE, target.getTime() - currentGrowthNow);
  const nextDay = Math.max(1, Math.floor((currentGrowthNow + jumpMs - epoch) / DAY) + 1);
  return {
    mode,
    jumpMs,
    nextDay,
    summary: sleepDeprived
      ? `第 ${nextDay} 天 · 折腾一夜总算天亮了，作物长高了些，全家还有点犯困`
      : `第 ${nextDay} 天 · 一夜好眠！作物悄悄长高，全员元气满满迎来新一天`,
  };
}
