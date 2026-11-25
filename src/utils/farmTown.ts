import type { WaypointId } from '@/constants/farmMap';
import { farmChat, FarmChatError } from '@/services/farmChat';
import { CROP_KINDS, CROP_LABELS, marketRate, SEASON_NAMES } from './farmEconomy';
import { RESIDENTS, RESIDENT_IDS, isResidentId, type ResidentConversation, type ResidentId } from './farmLife';
import type { FarmMemories } from './farmMemory';
import { isSensitiveFarmText } from './farmPersonaMemory';
import { realDate } from './farmProgress';
import { restoreDailyWishes, type ResidentWish } from './farmSocial';
import { restoreFocusStats, type FarmFocusStats } from './farmFocus';
import { restorePostcards, type FarmPostcard } from './farmFestivals';
import { restoreFishingBook, type FishingBook } from './farmFishing';
import { restoreStoryProgress, type FarmStoryProgress } from './farmStories';
import { getDecorMeta, restoreDecorState, type FarmDecorState } from './farmDecor';
import {
  isFarmSleepDeprived,
  pickSleepDeprivedThought,
  restoreVisitorState,
  type FarmVisitorState,
} from './farmVisitors';
import type { NightSoloEvent } from './farmSleep';
import { restoreRandomEventState, type FarmRandomEventState } from './farmRandomEvents';

export type FarmPeriod = 'morning' | 'noon' | 'evening' | 'night';
export type FarmWeather = 'clear' | 'rain';
export type ResidentDuty = 'water' | 'repair' | 'harvest' | 'fish' | 'bugs';

export const RESIDENT_DUTIES: Record<ResidentDuty, { label: string; short: string; description: string }> = {
  water: { label: '照料浇水', short: '盯浇水', description: '田地干了会主动打水并帮浇 2 块地' },
  repair: { label: '养护水壶', short: '修水壶', description: '水壶生锈时会主动擦洗除锈' },
  harvest: { label: '巡田帮收', short: '帮收菜', description: '作物成熟较多时会顺手帮忙采收' },
  fish: { label: '池边钓鱼', short: '去钓鱼', description: '去池塘钓鱼并偶尔带回小惊喜或堆肥' },
  bugs: { label: '巡田捉虫', short: '抓虫子', description: '高舒适度下巡田抓虫并攒出有机肥' },
};

export const DEFAULT_DUTY_AFFINITY: Record<ResidentId, ResidentDuty> = {
  gu: 'water',
  door: 'repair',
  xiaoba: 'harvest',
  yujie: 'harvest',
  weigang: 'fish',
  chicken: 'bugs',
};

export interface ScheduleSlot {
  waypoint: WaypointId;
  activity: string;
  thought: string;
}

export interface TownEvent {
  id: string;
  title: string;
  detail: string;
  kind: 'director' | 'rumor';
  /** 已经听闻这件事的居民 ID 列表（实现 Smallville 式传闻级联扩散） */
  knownBy: ResidentId[];
  /** 可选聚会地标（如广场音乐会会让听闻者更爱往广场聚） */
  hotspot?: WaypointId;
  createdAt: number;
  expiresAt: number;
}

export interface HelperLogEntry {
  id: string;
  actor: ResidentId;
  duty: ResidentDuty;
  summary: string;
  at: number;
}

export interface FarmGazette {
  day: number;
  season: string;
  headline: string;
  subhead: string;
  stories: string[];
  marketTip: string;
  aiPolished?: boolean;
  generatedAt: number;
}

export interface FarmTownState {
  duties: Partial<Record<ResidentId, ResidentDuty>>;
  events: TownEvent[];
  helperLog: HelperLogEntry[];
  gazette?: FarmGazette;
  /** 每日动态居民心愿便签 */
  wishes?: ResidentWish[];
  /** 今日给每位居民送礼次数（用于每日好感加成上限） */
  giftCounts?: { date: string; counts: Partial<Record<ResidentId, number>> };
  /** 是否开启与 dark-study 课表/作息的本地温柔联动（默认开启） */
  studyLinkEnabled?: boolean;
  /** 模块 A：农场自习伴读统计与家人鼓励签 */
  focus?: FarmFocusStats;
  /** 模块 B：节庆与篝火茶话会纪念明信片 */
  postcards?: FarmPostcard[];
  /** 模块 C：池塘钓鱼与漂流瓶图鉴 */
  fishing?: FishingBook;
  /** 模块 D：家庭个人支线进度与纪念相册 */
  stories?: FarmStoryProgress;
  /** 模块 E：庭院轻装扮拥有与摆放状态 */
  decor?: FarmDecorState;
  /** 大学室友与大肥鱼访客及夜晚恐怖徐睡阴彩蛋状态 */
  visitors?: FarmVisitorState;
  /** 农场随机互动事件状态 */
  randomEvents?: FarmRandomEventState;
  /** 今夜已帮哪些家人悄悄盖好被子（每日每人一次情感奖励） */
  tuckedIn?: { day: number; ids: ResidentId[] };
  /** 农场访客大肥鱼是否同步课表大肥鱼的人设与记忆（默认开启） */
  whaleSyncEnabled?: boolean;
  /** 是否开启农场随机奇遇事件弹窗提示（默认开启） */
  randomEventsEnabled?: boolean;
  /** 是否在地图上展示人物像素情绪动作贴图（默认开启） */
  emotionSpritesEnabled?: boolean;
}

export interface FarmNeedsSnapshot {
  dryPlots: number;
  ripePlots: number;
  water: number;
  waterCap: number;
  canRust: number;
  coopComfort: number;
  period: FarmPeriod;
  weather: FarmWeather;
  rainbow: boolean;
  day: number;
  season: number;
}

export const DIRECTOR_EVENT_PRESETS: { title: string; detail: string; hotspot: WaypointId }[] = [
  { title: '今晚广场篝火音乐会', detail: '大家打算晚上在广场办一场家庭小音乐会，想推玉洁当主唱。', hotspot: 'plaza' },
  { title: '池塘惊现发光金鱼', detail: '听说池塘深水处游来了一条会反光的金鱼，唯刚正摩拳擦掌。', hotspot: 'pond' },
  { title: '集市来了稀有种子商队', detail: '传闻集市小铺今天新到了一批特别甜的种子，大家都在议论种什么好。', hotspot: 'marketDoor' },
  { title: '全家厨艺比拼夜', detail: '顾提议今晚全家一起下厨，每人认领一道菜比比手艺。', hotspot: 'houseDoor' },
  { title: '雨后院子茶话会', detail: '难得清闲，打算在长椅和广场边泡一壶热茶聊聊天。', hotspot: 'pondBench' },
];

const DUTY_LIST: ResidentDuty[] = ['water', 'repair', 'harvest', 'fish', 'bugs'];
const VALID_HOTSPOTS = new Set<WaypointId>([
  'houseDoor', 'housePath', 'farmLeft', 'farmTop', 'farmNorthEast', 'farmCenter',
  'farmBottom', 'farmSouthEast', 'farmRight', 'coop', 'market', 'marketDoor',
  'plazaNorth', 'plaza', 'pondBench', 'pond', 'pondWest', 'pondSouth', 'gate',
]);

export function emptyTownState(): FarmTownState {
  return {
    duties: { gu: 'water', door: 'repair', weigang: 'fish', chicken: 'bugs' },
    events: [],
    helperLog: [],
  };
}

export function restoreTownState(raw: unknown, level = 1, at = 0): FarmTownState {
  const base = emptyTownState();
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return base;
  const v = raw as Record<string, unknown>;

  if (v.duties && typeof v.duties === 'object' && !Array.isArray(v.duties)) {
    const duties: Partial<Record<ResidentId, ResidentDuty>> = {};
    for (const id of RESIDENT_IDS) {
      const duty = (v.duties as Record<string, unknown>)[id];
      if (typeof duty === 'string' && DUTY_LIST.includes(duty as ResidentDuty)) {
        duties[id] = duty as ResidentDuty;
      }
    }
    base.duties = duties;
  }

  if (Array.isArray(v.events)) {
    base.events = v.events.slice(-12).flatMap(entry => {
      if (!entry || typeof entry !== 'object' || Array.isArray(entry)) return [];
      const item = entry as Record<string, unknown>;
      const id = typeof item.id === 'string' && item.id ? item.id.slice(0, 80) : '';
      const title = typeof item.title === 'string' ? item.title.trim().slice(0, 48) : '';
      const detail = typeof item.detail === 'string' ? item.detail.trim().slice(0, 140) : '';
      const kind = item.kind === 'director' || item.kind === 'rumor' ? item.kind : 'rumor';
      const knownBy = Array.isArray(item.knownBy) ? [...new Set(item.knownBy.filter(isResidentId))] : [];
      const hotspot = typeof item.hotspot === 'string' && VALID_HOTSPOTS.has(item.hotspot as WaypointId)
        ? item.hotspot as WaypointId
        : undefined;
      const createdAt = typeof item.createdAt === 'number' && Number.isFinite(item.createdAt) ? item.createdAt : 0;
      const expiresAt = typeof item.expiresAt === 'number' && Number.isFinite(item.expiresAt) ? item.expiresAt : 0;
      if (!id || !title || !detail || isSensitiveFarmText(`${title} ${detail}`)) return [];
      return [{ id, title, detail, kind, knownBy, ...(hotspot ? { hotspot } : {}), createdAt, expiresAt }];
    });
  }

  if (Array.isArray(v.helperLog)) {
    base.helperLog = v.helperLog.slice(-16).flatMap(entry => {
      if (!entry || typeof entry !== 'object' || Array.isArray(entry)) return [];
      const item = entry as Record<string, unknown>;
      const id = typeof item.id === 'string' && item.id ? item.id.slice(0, 80) : '';
      const actor = item.actor;
      const duty = item.duty;
      const summary = typeof item.summary === 'string' ? item.summary.trim().slice(0, 120) : '';
      const at = typeof item.at === 'number' && Number.isFinite(item.at) ? item.at : 0;
      if (!id || !isResidentId(actor) || !DUTY_LIST.includes(duty as ResidentDuty) || !summary) return [];
      return [{ id, actor, duty: duty as ResidentDuty, summary, at }];
    });
  }

  if (v.gazette && typeof v.gazette === 'object' && !Array.isArray(v.gazette)) {
    const g = v.gazette as Record<string, unknown>;
    const day = typeof g.day === 'number' && Number.isFinite(g.day) ? Math.max(1, Math.round(g.day)) : 0;
    const season = typeof g.season === 'string' ? g.season.slice(0, 8) : '';
    const headline = typeof g.headline === 'string' ? g.headline.trim().slice(0, 60) : '';
    const subhead = typeof g.subhead === 'string' ? g.subhead.trim().slice(0, 110) : '';
    const stories = Array.isArray(g.stories)
      ? g.stories.filter((s): s is string => typeof s === 'string' && s.trim().length > 0).map(s => s.trim().slice(0, 120)).slice(0, 5)
      : [];
    const marketTip = typeof g.marketTip === 'string' ? g.marketTip.trim().slice(0, 100) : '';
    const generatedAt = typeof g.generatedAt === 'number' && Number.isFinite(g.generatedAt) ? g.generatedAt : 0;
    if (day && headline && stories.length) {
      base.gazette = {
        day,
        season: season || '春',
        headline,
        subhead,
        stories,
        marketTip,
        ...(g.aiPolished === true ? { aiPolished: true } : {}),
        generatedAt,
      };
    }
  }

  if (typeof v.studyLinkEnabled === 'boolean') {
    base.studyLinkEnabled = v.studyLinkEnabled;
  }

  if (at > 0 && Array.isArray(v.wishes)) {
    base.wishes = restoreDailyWishes(v.wishes, level, at);
  }

  if (v.giftCounts && typeof v.giftCounts === 'object' && !Array.isArray(v.giftCounts)) {
    const gc = v.giftCounts as Record<string, unknown>;
    const today = at > 0 ? realDate(at) : typeof gc.date === 'string' ? gc.date : '';
    if (typeof gc.date === 'string' && gc.date === today && gc.counts && typeof gc.counts === 'object') {
      const counts: Partial<Record<ResidentId, number>> = {};
      for (const id of RESIDENT_IDS) {
        const n = (gc.counts as Record<string, unknown>)[id];
        if (typeof n === 'number' && Number.isFinite(n) && n > 0) {
          counts[id] = Math.min(20, Math.round(n));
        }
      }
      base.giftCounts = { date: today, counts };
    }
  }

  if (v.focus && typeof v.focus === 'object') {
    base.focus = restoreFocusStats(v.focus);
  }
  if (Array.isArray(v.postcards) && v.postcards.length > 0) {
    base.postcards = restorePostcards(v.postcards);
  }
  if (v.fishing && typeof v.fishing === 'object') {
    base.fishing = restoreFishingBook(v.fishing);
  }
  if (v.stories && typeof v.stories === 'object') {
    base.stories = restoreStoryProgress(v.stories);
  }
  if (v.decor && typeof v.decor === 'object') {
    base.decor = restoreDecorState(v.decor);
  }
  if (v.visitors && typeof v.visitors === 'object') {
    base.visitors = restoreVisitorState(v.visitors);
  }
  if (v.randomEvents && typeof v.randomEvents === 'object') {
    base.randomEvents = restoreRandomEventState(v.randomEvents);
  }
  if (v.tuckedIn && typeof v.tuckedIn === 'object' && !Array.isArray(v.tuckedIn)) {
    const ti = v.tuckedIn as Record<string, unknown>;
    const tDay = typeof ti.day === 'number' && Number.isFinite(ti.day) ? Math.max(0, Math.round(ti.day)) : 0;
    const tIds = Array.isArray(ti.ids) ? [...new Set(ti.ids.filter(isResidentId))] : [];
    if (tDay > 0 && tIds.length > 0) base.tuckedIn = { day: tDay, ids: tIds };
  }
  if (typeof v.whaleSyncEnabled === 'boolean') base.whaleSyncEnabled = v.whaleSyncEnabled;
  if (typeof v.randomEventsEnabled === 'boolean') base.randomEventsEnabled = v.randomEventsEnabled;
  if (typeof v.emotionSpritesEnabled === 'boolean') base.emotionSpritesEnabled = v.emotionSpritesEnabled;

  return base;
}

const DAILY_ROUTINES: Record<ResidentId, Record<FarmPeriod, ScheduleSlot>> = {
  door: {
    morning: { waypoint: 'houseDoor', activity: '屋前喝茶整理今天的代码思路', thought: '早上思路最清，先把最核心的小模块写顺。' },
    noon: { waypoint: 'pondBench', activity: '长椅边看书晒太阳', thought: '坐池边吹会儿风，比一直盯屏幕管用。' },
    evening: { waypoint: 'farmLeft', activity: '田边转转看看作物长势', thought: '顺路看看水壶生没生锈，别等用时才卡手。' },
    night: { waypoint: 'houseDoor', activity: '回屋门前收尾，防着顾来催睡', thought: '再看两行就合电脑……可别又被顾抓现行。' },
  },
  gu: {
    morning: { waypoint: 'farmCenter', activity: '巡视菜地照料新苗', thought: '清晨露水刚好，看看哪块土先干透了。' },
    noon: { waypoint: 'houseDoor', activity: '回屋准备午饭和热汤', thought: '午饭煲点热汤吧，三个孩子跑一上午准饿。' },
    evening: { waypoint: 'plaza', activity: '院子广场散步透气', thought: '傍晚风软乎乎的，喊大家出来坐会儿真好。' },
    night: { waypoint: 'houseDoor', activity: '在屋里留盏灯等晚归的人', thought: '汤温在锅里了，door 可别又熬太晚。' },
  },
  xiaoba: {
    morning: { waypoint: 'plaza', activity: '在广场走走醒醒神', thought: '今天的院子很安静，适合想一条新关卡路线。' },
    noon: { waypoint: 'pondBench', activity: '长椅上构思隐藏地图岔路', thought: '主路留灯、岔路留脚印……这样应该不会迷路。' },
    evening: { waypoint: 'farmLeft', activity: '去田边看看弟弟们和菜苗', thought: '顺手把篮子和铲子收好，省得明天满院子找。' },
    night: { waypoint: 'houseDoor', activity: '回屋安静画几笔草图', thought: '天黑了，回屋把刚才那个点子记下来。' },
  },
  yujie: {
    morning: { waypoint: 'marketDoor', activity: '集市口晃悠顺便瞅瞅点心', thought: '今天集市不知道有没有刚出炉的蓝莓小点心。' },
    noon: { waypoint: 'plaza', activity: '在广场哼两句汪苏泷的副歌', thought: '刚才那句换气顺多了，待会儿谁路过唱给谁听。' },
    evening: { waypoint: 'pond', activity: '去池边看唯刚有没有又空军', thought: '去池塘瞅瞅唯刚，要是又空军我就笑他两句再请吃饼。' },
    night: { waypoint: 'houseDoor', activity: '回屋追两章小说', thought: '这本小说主角总算开窍了，今晚多看一章就睡。' },
  },
  weigang: {
    morning: { waypoint: 'pond', activity: '清晨池塘最佳钓位守漂', thought: '早晨水面静，浮漂动一下就能看清。' },
    noon: { waypoint: 'pondBench', activity: '长椅边用石子推演数学题', thought: '这道递推题画个图试试，说不定有更短的解法。' },
    evening: { waypoint: 'pondWest', activity: '换个钓位记录不同水深上鱼率', thought: '西边水深一点，同样等十分钟看看和早上差多少。' },
    night: { waypoint: 'houseDoor', activity: '收好本命鱼竿回屋看仙侠', thought: '今晚池边风凉了，回屋再看两页破阵篇。' },
  },
  chicken: {
    morning: { waypoint: 'coop', activity: '鸡窝门口等顾撒一把香米', thought: '咕，太阳出来啦，今天的米粒一定很香！' },
    noon: { waypoint: 'farmRight', activity: '田边晒太阳听叶子找虫子', thought: '咕咕，数到二再啄，小虫子就跑不掉啦！' },
    evening: { waypoint: 'plaza', activity: '广场跟着家人脚步遛弯', thought: '咕，听见大家走路的声音，坤坤心里最踏实。' },
    night: { waypoint: 'coop', activity: '钻回软乎乎的稻草窝眯觉', thought: '咕……窝里暖暖的，坤坤要收起翅膀睡觉啦。' },
  },
};

export const PERIOD_LABELS: Record<FarmPeriod, string> = {
  morning: '早上',
  noon: '中午',
  evening: '傍晚',
  night: '深夜',
};

export interface FarmWeatherSummary {
  label: string;
  tag?: string;
  promptText: string;
}

/** 统一描述农场当下的实时天气与时段，供所有 NPC、访客与各类对话共享读取。 */
export function describeFarmWeather(
  weather: FarmWeather,
  rainbow: boolean,
  period: FarmPeriod,
): FarmWeatherSummary {
  if (rainbow) {
    return {
      label: '雨后彩虹',
      tag: '看彩虹',
      promptText: '刚下完一场雨，此刻天边挂着一道绚丽的彩虹，空气格外清新湿润',
    };
  }
  if (weather === 'rain') {
    return period === 'night'
      ? {
          label: '细雨夜',
          tag: '雨夜听雨',
          promptText: '现在是雨夜，外面正下着淅淅沥沥的小雨，屋檐滴水声清晰',
        }
      : {
          label: '细雨绵绵',
          tag: '躲雨中',
          promptText: '此刻外面正在下雨（细雨绵绵，雨水滋润农田，大家大多躲在屋檐、集市棚下或树荫边避雨）',
        };
  }
  if (period === 'morning') {
    return { label: '清晨晴朗', promptText: '清晨阳光柔和微风清凉，露水刚散，天气晴朗舒适' };
  }
  if (period === 'noon') {
    return { label: '晴朗暖阳', promptText: '正午阳光明媚暖融融的，微风拂过菜地，天气很好' };
  }
  if (period === 'evening') {
    return { label: '傍晚晚霞', promptText: '傍晚天色染上暖橘色晚霞，微风舒服，天气晴朗' };
  }
  return { label: '晴朗星空', promptText: '夜空晴朗清澈，月光和星星都很清楚，晚风微凉' };
}

export interface ResidentWeatherStatus {
  /** 地图名牌上的天气状态短标（晴朗常规时段不强行打标，雨天/彩虹清晰展示） */
  badge?: string;
  badgeKind?: 'rain' | 'rainbow';
  activity: string;
  chatNote: string;
  shelterWaypoint?: WaypointId;
}

/** 根据当下真实天气、彩虹与时段返回每位居民的具体状态（昼夜通用）。 */
export function residentWeatherStatus(
  id: ResidentId,
  weather: FarmWeather,
  rainbow: boolean,
  period: FarmPeriod,
): ResidentWeatherStatus {
  if (rainbow) {
    return {
      badge: '看彩虹',
      badgeKind: 'rainbow',
      shelterWaypoint: id === 'weigang' || id === 'door' ? 'pondBench' : 'plaza',
      activity: '雨后院子里看彩虹',
      chatNote:
        id === 'chicken'
          ? '天上挂着彩虹，兴奋得在院子里拍翅膀'
          : id === 'yujie'
            ? '刚停雨出了彩虹，心情大好正想在广场多看两眼顺便哼首歌'
            : '雨停放晴出了彩虹，正站在院子里欣赏这道好兆头',
    };
  }
  if (weather === 'rain') {
    if (period === 'night') {
      return {
        badge: '听雨中',
        badgeKind: 'rain',
        shelterWaypoint: id === 'chicken' ? 'coop' : 'houseDoor',
        activity: '雨夜在屋檐下听雨',
        chatNote: '外面正下着夜雨，屋檐下听着滴水声觉得格外安静',
      };
    }
    if (id === 'chicken') {
      return {
        badge: '窝里躲雨',
        badgeKind: 'rain',
        shelterWaypoint: 'coop',
        activity: '回小窝躲雨听雨滴',
        chatNote: '外面下雨怕淋湿羽毛，正缩在小鸡窝里躲雨',
      };
    }
    if (id === 'weigang') {
      return {
        badge: '雨中观鱼',
        badgeKind: 'rain',
        shelterWaypoint: 'pondBench',
        activity: '在树荫边避雨顺便观水面',
        chatNote: '正在下雨，但下雨天鱼反而爱冒泡，正躲在池边树荫下观察水面',
      };
    }
    if (id === 'yujie') {
      return {
        badge: '棚下听雨',
        badgeKind: 'rain',
        shelterWaypoint: 'marketDoor',
        activity: '在集市屋檐下听雨躲雨',
        chatNote: '躲在集市棚下避雨，顺便听雨滴打在屋檐上的节奏',
      };
    }
    return {
      badge: '檐下避雨',
      badgeKind: 'rain',
      shelterWaypoint: 'houseDoor',
      activity: '在小屋屋檐下躲雨聊家常',
      chatNote:
        id === 'gu'
          ? '正在小屋屋檐下躲雨，既高兴省得提水浇地又有点担心风把嫩苗吹歪'
          : id === 'door'
            ? '趁下雨天慢下来，在小屋屋檐下避雨喝热茶看雨'
            : '躲在屋檐下看着雨水顺着瓦片滴落，难得清闲',
    };
  }
  const slot = DAILY_ROUTINES[id][period];
  return {
    activity: slot.activity,
    chatNote: `此刻天气${describeFarmWeather(weather, false, period).label}，你正在${slot.activity}`,
  };
}

/** 获取居民在当前时段、天气、彩虹与活跃小镇事件下的实时作息目标。 */
export function residentCurrentSchedule(
  id: ResidentId,
  period: FarmPeriod,
  weather: FarmWeather,
  rainbow: boolean,
  activeEvents: readonly TownEvent[] = [],
): ScheduleSlot {
  if (rainbow) {
    return {
      waypoint: id === 'weigang' || id === 'door' ? 'pondBench' : 'plaza',
      activity: '雨后院子里看彩虹',
      thought: id === 'chicken' ? '咕咕！天上挂着彩色的桥，大家快看！' : '雨一停居然出了彩虹，难得的好运气。',
    };
  }
  if (weather === 'rain' && period !== 'night') {
    const ws = residentWeatherStatus(id, weather, false, period);
    const rainThought: Record<ResidentId, string> = {
      chicken: '咕……下雨啦，躲回小窝里就不怕淋湿羽毛。',
      weigang: '下雨天鱼反而爱冒泡，等雨小点再去甩一竿。',
      yujie: '雨滴打屋檐的节奏还挺好听，刚好在集市棚下躲会儿雨。',
      gu: '下雨省得浇水了，就是怕风大把嫩苗吹歪，先在屋檐下看着。',
      door: '下雨天在屋檐下发会儿呆喝口热茶，节奏慢下来真舒服。',
      xiaoba: '雨声挺安静的，在屋檐下躲会儿雨顺便构思新地图。',
    };
    return {
      waypoint: ws.shelterWaypoint ?? 'houseDoor',
      activity: ws.activity,
      thought: rainThought[id],
    };
  }

  // If this resident knows about an active town event with a hotspot during daytime/evening, bias toward it
  if (period !== 'night') {
    const knownHot = activeEvents.find(ev => ev.hotspot && ev.knownBy.includes(id));
    if (knownHot && knownHot.hotspot) {
      return {
        waypoint: knownHot.hotspot,
        activity: `惦记着「${knownHot.title}」`,
        thought: id === 'chicken'
          ? `咕！听说有「${knownHot.title}」，坤坤也要去凑热闹！`
          : `大家都在传「${knownHot.title}」，先过去瞧瞧动静。`,
      };
    }
  }

  return DAILY_ROUTINES[id][period];
}

/** 生成贴合当下农场实况、天气、传闻或人格记忆的内心思考泡泡（💭）。 */
export function pickResidentThought(
  id: ResidentId,
  needs: FarmNeedsSnapshot | undefined,
  activeEvents: readonly TownEvent[],
  memoryEpisodes: readonly { text: string; privacy: string }[] | undefined,
  roll: number,
  options?: { sleepDeprived?: boolean; soloEvent?: NightSoloEvent | null },
): string {
  const period = needs?.period ?? 'noon';
  const weather = needs?.weather ?? 'clear';
  const rainbow = needs?.rainbow === true;
  if (options?.soloEvent && options.soloEvent.resident === id && period === 'night') {
    return options.soloEvent.thought;
  }
  if (options?.sleepDeprived && roll < 0.48) {
    return pickSleepDeprivedThought(id, roll * 7.3);
  }
  const slot = residentCurrentSchedule(id, period, weather, rainbow, activeEvents);

  if (rainbow) return slot.thought;
  if (weather === 'rain' && period !== 'night' && roll < 0.65) {
    return slot.thought;
  }

  const knownEvent = activeEvents.find(ev => ev.knownBy.includes(id));
  if (knownEvent && roll < 0.35) {
    return id === 'chicken'
      ? `咕，大家都在说「${knownEvent.title}」呢！`
      : `还在琢磨「${knownEvent.title}」的事，等会儿跟家里人商量下。`;
  }

  if (needs) {
    if (id === 'gu' && needs.dryPlots > 0 && roll < 0.55) {
      return `西边有 ${needs.dryPlots} 块土干了，得找空去提水浇一浇。`;
    }
    if (id === 'door' && needs.canRust >= 25 && roll < 0.55) {
      return '水壶好像有点起锈了，待会儿顺手拿油布擦一擦。';
    }
    if ((id === 'xiaoba' || id === 'yujie') && needs.ripePlots > 0 && roll < 0.5) {
      return id === 'yujie'
        ? `地里有 ${needs.ripePlots} 株熟啦，好想先偷偷尝一口……`
        : `田里有 ${needs.ripePlots} 株熟透了，有空顺手帮着收一下。`;
    }
  }

  const publicEpisodes = (memoryEpisodes ?? []).filter(ep => ep.privacy === 'public');
  if (publicEpisodes.length && roll >= 0.72) {
    const picked = publicEpisodes[publicEpisodes.length - 1];
    const snippet = picked.text.length > 34 ? picked.text.slice(0, 34) + '…' : picked.text;
    return id === 'chicken' ? `咕，坤坤还记得：${snippet}` : `刚想起前不久的事：${snippet}`;
  }

  return slot.thought;
}

/** 识别聊天里委任/取消长期分工的自然指令（如「顾以后帮我盯着浇水」「不用帮我浇水了」）。 */
export function detectDutyCommand(
  text: string,
  who: ResidentId,
): { duty: ResidentDuty | null; reply: string } | null {
  const clean = text.trim();
  if (/^(?:如果|假如|要是|他说|她说|[“「"'])/.test(clean)) return null;

  if (/(?:以后|平时|之后)?(?:不用|别|不要|取消|停止).{0,6}(?:帮我|盯着|负责|自动).{0,8}(?:浇水|修水壶|养护|收菜|收获|钓鱼|抓虫|干活)/.test(clean)) {
    return {
      duty: null,
      reply: who === 'chicken'
        ? '咕，好呀，那坤坤平时就在院子里安心晒太阳陪你。'
        : '行，那这项日常分工先取消，有需要随时再喊我。',
    };
  }

  const standingCue = /(?:以后|平时|每天|有空就|长期|一直|负责|帮我盯着|帮我管着|自动帮)/.test(clean);
  if (!standingCue) return null;

  if (/浇水|浇地|照料田|看田/.test(clean)) {
    return {
      duty: 'water',
      reply: who === 'gu'
        ? '放心吧，以后地里土一干我就顺手提水去浇，不会让苗渴着。'
        : `好，以后田地干了我就主动帮着照料浇水。`,
    };
  }
  if (/修水壶|除锈|擦水壶|养护水壶/.test(clean)) {
    return {
      duty: 'repair',
      reply: who === 'door'
        ? '没问题，以后水壶一起锈我就顺手保养清理，保证顺手好用。'
        : '行，以后水壶生锈我来帮你擦洗除锈。',
    };
  }
  if (/收菜|收获|摘菜|采收/.test(clean)) {
    return {
      duty: 'harvest',
      reply: '包在我身上，以后地里作物熟了我有空就顺手帮你收进仓库。',
    };
  }
  if (/钓鱼|守漂/.test(clean)) {
    return {
      duty: 'fish',
      reply: who === 'weigang'
        ? '嗯……好呀，我本来就爱在池边守漂，钓到好东西都给你带回来。'
        : '行，以后有空我就去池边甩两竿，看看能不能带点惊喜回来。',
    };
  }
  if (/抓虫|捉虫/.test(clean)) {
    return {
      duty: 'bugs',
      reply: who === 'chicken'
        ? '咕咕！抓虫子交给我，坤坤一定把菜地巡得干干净净！'
        : '好，以后有空我去田边盯着抓虫攒肥料。',
    };
  }
  return null;
}

/** 识别玩家在 1v1 闲聊里抛出的可传播公共消息（如办聚会、集市打折等），种下小镇传闻。 */
export function detectSeedRumorFromChat(
  text: string,
  who: ResidentId,
  at: number,
): TownEvent | null {
  const clean = text.trim();
  if (clean.length < 6 || clean.length > 100) return null;
  if (isSensitiveFarmText(clean)) return null;
  if (/^(?:帮我|替我|请|麻烦|你去|去找|问|转告|带话|传话|质问|取消|算了)/.test(clean)) return null;

  const isParty = /聚会|派对|音乐会|篝火|茶话会|庆祝|野餐|比赛/.test(clean);
  const isNews = /听说|打折|特价|新到|发现|居然|来了个|举办|打算今晚|明天准备/.test(clean);
  if (!isParty && !isNews) return null;

  const hotspot: WaypointId = /池塘|钓鱼|鱼/.test(clean)
    ? 'pond'
    : /集市|小铺|打折|种子/.test(clean)
      ? 'marketDoor'
      : /做饭|吃饭|晚饭|屋/.test(clean)
        ? 'houseDoor'
        : 'plaza';
  const title = clean.length > 18 ? clean.slice(0, 17) + '…' : clean;
  return {
    id: `rumor-${at}-${who}`,
    title,
    detail: `客人和${RESIDENTS[who].name}聊起：「${clean}」`,
    kind: 'rumor',
    knownBy: [who],
    hotspot,
    createdAt: at,
    expiresAt: at + 18 * 3600_000,
  };
}

/** 两人偶遇聊完后，自动把其中一方知晓的活跃传闻/事件扩散给所有在场参与者（信息级联）。 */
export function propagateTownEvents(
  events: readonly TownEvent[],
  participants: readonly ResidentId[],
  at: number,
): { events: TownEvent[]; diffused: TownEvent[] } {
  const active = events.filter(ev => ev.expiresAt > at);
  const diffused: TownEvent[] = [];
  const next = active.map(ev => {
    const knowsAny = participants.some(id => ev.knownBy.includes(id));
    const missing = participants.filter(id => !ev.knownBy.includes(id));
    if (!knowsAny || !missing.length) return ev;
    const updated: TownEvent = { ...ev, knownBy: [...ev.knownBy, ...missing] };
    diffused.push(updated);
    return updated;
  });
  return { events: next, diffused };
}

/** 判断某位居民此刻是否能基于长期分工自动执行一次农场互助行动。 */
export function pickAutonomousDutyAction(
  id: ResidentId,
  duty: ResidentDuty | undefined,
  needs: FarmNeedsSnapshot | undefined,
  affinity: number,
): { duty: ResidentDuty; waypoint: WaypointId; bubble: string } | null {
  if (!duty || !needs || needs.period === 'night') return null;
  if (duty === 'water') {
    if (needs.dryPlots <= 0) return null;
    if (needs.water <= 0) {
      return { duty: 'water', waypoint: 'pond', bubble: '地干了但水壶空着，我先去池塘打点水。' };
    }
    return { duty: 'water', waypoint: 'farmCenter', bubble: '看田里土干了，我顺手去帮忙浇点水。' };
  }
  if (duty === 'repair') {
    if (needs.canRust < 22) return null;
    return { duty: 'repair', waypoint: 'houseDoor', bubble: '水壶有点生锈，我顺手去擦洗保养一下。' };
  }
  if (duty === 'harvest') {
    if (needs.ripePlots < 2) return null;
    return { duty: 'harvest', waypoint: 'farmCenter', bubble: '地里有菜熟透啦，我顺手帮着收一收。' };
  }
  if (duty === 'fish') {
    if (needs.weather === 'rain' && id !== 'weigang') return null;
    return {
      duty: 'fish',
      waypoint: 'pond',
      bubble: id === 'weigang' ? '趁水温合适，我去池边甩两竿试试手气。' : '去池塘钓会儿鱼，说不定能带点收获回来。',
    };
  }
  if (duty === 'bugs') {
    if (id === 'chicken' && needs.coopComfort < 40 && affinity < 20) return null;
    return {
      duty: 'bugs',
      waypoint: 'farmRight',
      bubble: id === 'chicken' ? '咕咕！坤坤去田边巡逻抓虫子攒肥料啦！' : '去田边转转看看有没有小虫子。',
    };
  }
  return null;
}

/** 本地自动编撰《doordoor 农场日报》（零额外 API 费用），汇总昨日对话、互助、天气、行情与传闻。 */
export function compileFarmGazette(options: {
  day: number;
  seasonIndex: number;
  weather: FarmWeather;
  rainbow: boolean;
  history: readonly ResidentConversation[];
  town: FarmTownState;
  memories: FarmMemories;
  studyNote?: string;
  at: number;
}): FarmGazette {
  const { day, seasonIndex, weather, rainbow, history, town, studyNote, at } = options;
  const season = SEASON_NAMES[seasonIndex % 4] ?? '春';
  const stories: string[] = [];

  if (studyNote) {
    stories.push(`【暖心专栏】${studyNote}`);
  }

  const sleepDeprived = isFarmSleepDeprived(town.visitors, day);
  if (sleepDeprived) {
    stories.push(
      '【睡眠警报】昨夜黑暗邪恶形态的徐睡阴裹被子扛电脑来农场疯狂打瓦大喊“A大五个”，全员睡眠不足顶着黑眼圈吐槽不断，顾一早熬了安神热汤！',
    );
  }

  const activeEvents = town.events.filter(ev => ev.expiresAt > at);
  const topEvent = activeEvents[activeEvents.length - 1];
  if (topEvent) {
    stories.push(
      `【小镇热议】「${topEvent.title}」正在院子里传开（已有 ${topEvent.knownBy.length}/${RESIDENT_IDS.length} 位家人知晓）：${topEvent.detail}`,
    );
  }

  const recentHelper = town.helperLog.slice(-2).reverse();
  for (const deed of recentHelper) {
    stories.push(`【农场互助】${RESIDENTS[deed.actor].name}${deed.summary}`);
  }

  if (town.decor?.placed.length && stories.length < 4) {
    const latestDecor = getDecorMeta(town.decor.placed[town.decor.placed.length - 1]);
    stories.push(`【院子新风景】新摆出的「${latestDecor.label}」成了大家最爱路过停步的角落。`);
  }

  const recentTalks = history
    .filter(c => c.endedAt !== null && c.participants.length >= 2 && c.lines.length >= 2)
    .slice(-3)
    .reverse();
  for (const talk of recentTalks) {
    if (stories.length >= 4) break;
    const names = talk.participants.map(id => RESIDENTS[id].name).join('、');
    const first = talk.lines[0]?.text.slice(0, 28) ?? '';
    if (talk.discussion?.kind === 'request') {
      stories.push(`【跑腿传话】${names}碰面聊了客人托付的事：${(talk.requestOutcome ?? first).slice(0, 46)}`);
    } else if (talk.discussion?.kind === 'debate') {
      stories.push(`【院子小拌嘴】${names}争论得挺起劲，从「${first}」一路聊到各自留步。`);
    } else if (talk.participants.length >= 3) {
      stories.push(`【多人聚聊】${names}围在广场热热闹闹聊了一通：「${first}…」`);
    } else {
      stories.push(`【偶遇闲谈】${names}在路边撞见，顺口聊起了「${first}…」`);
    }
  }

  if (!stories.length) {
    stories.push(
      weather === 'rain'
        ? '细雨落进院子，家人们大多在屋檐下躲雨喝热汤，田里的土湿润润的。'
        : '阳光正好，一家人各自在院子里忙着小目标，池塘边隐约能听见浮漂轻点水面的声音。',
    );
  }

  const hotCrops = CROP_KINDS.filter(kind => marketRate(kind, at) > 1.05).slice(0, 3);
  const marketTip = hotCrops.length
    ? `集市今日行情看涨：${hotCrops.map(k => CROP_LABELS[k]).join('、')}收购价上浮 15%，适合出货！`
    : '今日集市行情平稳，手头的当季作物和厨房料理都可以放心按需出货。';

  const headline = rainbow
    ? `第 ${day} 天 · 雨后天晴现彩虹，全家齐聚院子抬头看`
    : topEvent
      ? `第 ${day} 天 · ${topEvent.title}`
      : recentHelper.length
        ? `第 ${day} 天 · ${RESIDENTS[recentHelper[0].actor].name}主动搭把手，院子暖融融`
        : weather === 'rain'
          ? `第 ${day} 天 · ${season}雨润农田，屋檐下听雨喝热汤`
          : `第 ${day} 天 · ${season}日好风吹过 doordoor 农场`;

  const subhead = `${season}天 · ${rainbow ? '雨后彩虹' : weather === 'rain' ? '细雨绵绵' : '晴朗微风'} · 全家共 ${RESIDENT_IDS.length} 位居民活跃中`;

  return {
    day,
    season,
    headline,
    subhead,
    stories: stories.slice(0, 4),
    marketTip,
    generatedAt: at,
  };
}

/** 可选：玩家手动点击「AI 润色今日报纸」时，仅消耗 1 次请求生成更有文采和幽默感的《doordoor 农场日报》。 */
export async function polishGazetteWithAI(
  draft: FarmGazette,
  apiKey: string,
  signal: AbortSignal,
): Promise<FarmGazette> {
  if (!apiKey) throw new FarmChatError('未配置 API Key');
  const raw = await farmChat(
    [
      {
        role: 'system',
        content:
          '你是像素农场《doordoor农场日报》的幽默主编。基于提供的真实农场今日事实，用轻松温暖、带点小报趣味的中文重写标题和简讯，严禁编造未发生的事件、人物或私事。严格输出 JSON：{"headline":"不超过26字主标题","subhead":"不超过40字副标题","stories":["简讯1","简讯2","简讯3"]}，每条简讯不超过85字，保留原有事实准确性。',
      },
      {
        role: 'user',
        content: JSON.stringify({
          day: draft.day,
          season: draft.season,
          headline: draft.headline,
          stories: draft.stories,
          marketTip: draft.marketTip,
        }),
      },
    ],
    apiKey,
    { signal, priority: 'interactive', timeoutMs: 16000, maxTokens: 480, retries: 1 },
  );
  const parsed = JSON.parse(raw);
  if (
    !parsed ||
    typeof parsed !== 'object' ||
    typeof parsed.headline !== 'string' ||
    !parsed.headline.trim() ||
    !Array.isArray(parsed.stories) ||
    !parsed.stories.length
  ) {
    throw new FarmChatError('报纸格式不完整');
  }
  const stories = parsed.stories
    .filter((s: unknown): s is string => typeof s === 'string' && s.trim().length > 0)
    .map((s: string) => s.trim().slice(0, 110))
    .slice(0, 4);
  if (!stories.length) throw new FarmChatError('报纸内容为空');
  return {
    ...draft,
    headline: parsed.headline.trim().slice(0, 56),
    subhead: typeof parsed.subhead === 'string' && parsed.subhead.trim() ? parsed.subhead.trim().slice(0, 100) : draft.subhead,
    stories,
    aiPolished: true,
    generatedAt: Date.now(),
  };
}
