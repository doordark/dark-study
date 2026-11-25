import { RESIDENTS, type ResidentId } from './farmLife';
import type { TownEvent } from './farmTown';

export type DecorId =
  | 'string_lights'
  | 'windmill'
  | 'pond_lantern'
  | 'campfire_ring';

export interface FarmDecorItem {
  id: DecorId;
  label: string;
  price: number;
  desc: string;
  /** 地图虚拟坐标（200×330），避开农田与通行路径 */
  x: number;
  y: number;
  /** 显示尺寸（逻辑像素） */
  size: number;
  /** 是否在夜间自带微弱暖光晕 */
  glowsAtNight: boolean;
  /** 对应 FarmPropSprite 名称 */
  prop: 'lights' | 'windmill' | 'lantern' | 'campfire';
  /** 各家人路过或首次看到时的专属评价 */
  comments: Record<ResidentId, string>;
}

export const FARM_DECORS: readonly FarmDecorItem[] = [
  {
    id: 'string_lights',
    label: '庭院暖光串灯',
    price: 140,
    desc: '挂在院子中央草坡上的琥珀色串灯，傍晚亮起时整个院子都温柔起来。',
    x: 78,
    y: 214,
    size: 22,
    glowsAtNight: true,
    prop: 'lights',
    comments: {
      door: '这串暖光灯挂上后，晚上散步都不用摸黑看路了，品味真不错！',
      gu: '呀，院子里亮起暖黄小串灯，感觉每天晚上都像过节一样温馨。',
      xiaoba: '光影打在石板路上挺好看的，我记进手绘地图的夜景版里。',
      yujie: '哇塞这氛围灯一开，我在广场练歌直接自带演唱会打光！',
      weigang: '嗯……暖黄的光照到池塘那边，晚上水面显得更安静了。',
      chicken: '咕咕！亮晶晶的小圆灯像好多颗挂在半空的星星果！',
    },
  },
  {
    id: 'windmill',
    label: '田边木风车',
    price: 190,
    desc: '竖在农田东北角草坡上的手作布帆小风车，有风拂过时显得格外有生气。',
    x: 168,
    y: 118,
    size: 26,
    glowsAtNight: false,
    prop: 'windmill',
    comments: {
      door: '田边多座小风车，风一吹就转，站在屋门口看着就解压。',
      gu: '风车转起来，连菜地上的空气都觉得更清甜了呢。',
      xiaoba: '有了风车当制高点，整个农场的地标轮廓一下立体了不少。',
      yujie: '可以啊，这小风车一摆，咱 doordoor 农场瞬间变童话小镇了！',
      weigang: '看风车扇叶转得快慢，刚好能顺便判断今天池边风向呢。',
      chicken: '咕！风车呼呼转，坤坤站在底下感觉自己也能飞起来啦！',
    },
  },
  {
    id: 'pond_lantern',
    label: '池塘纸灯笼',
    price: 160,
    desc: '立在池塘西北岸的木架纸灯笼，入夜后在水面映出一圈温柔金波。',
    x: 126,
    y: 249,
    size: 22,
    glowsAtNight: true,
    prop: 'lantern',
    comments: {
      door: '池塘边挂盏纸灯笼，倒影晃在水面上，意境拉满了。',
      gu: '唯刚晚上爱在池边发呆，有了这盏暖灯笼我也就放心多啦。',
      xiaoba: '暖灯映水面，确实是全院子最适合安静待一会儿的角落。',
      yujie: '哇，池塘边点上纸灯笼也太出片了吧，回头帮我在这儿拍一张！',
      weigang: '嗯……谢谢你在池边放了灯笼，晚上看浮漂和月光鱼都清楚多了。',
      chicken: '咕咕，纸灯笼暖暖的，小虫子都被吸引到池塘边开会去了！',
    },
  },
  {
    id: 'campfire_ring',
    label: '石砌篝火台',
    price: 220,
    desc: '铺在广场边的温暖石圈篝火，随时点亮全家围炉聊天的核心氛围。',
    x: 84,
    y: 248,
    size: 21,
    glowsAtNight: true,
    prop: 'campfire',
    comments: {
      door: '广场有了正经石砌篝火台，以后每周都能随时拉全家围坐聊通宵。',
      gu: '火堆稳稳当当的，晚上还能顺手烤两根玉米和麦香面包给大伙儿吃！',
      xiaoba: '火光很暖，一家人坐成一圈说话的感觉真不错。',
      yujie: '太棒了！有了专属篝火舞台，下次家庭音乐会排面直接拉满！',
      weigang: '嗯……在池边吹完晚风，走两步就能到火堆旁烤暖手，真好。',
      chicken: '咕咕咕！火堆暖烘烘的，坤坤要离它两步远，小心别烤焦羽毛！',
    },
  },
];

export interface FarmDecorState {
  owned: DecorId[];
  placed: DecorId[];
  /** 已触发过居民评论并写入日报的装饰，防止重复刷屏 */
  announced: DecorId[];
}

export function emptyDecorState(): FarmDecorState {
  return { owned: [], placed: [], announced: [] };
}

export const DECOR_IDS: readonly DecorId[] = FARM_DECORS.map(d => d.id);

export function getDecorMeta(id: DecorId): FarmDecorItem {
  return FARM_DECORS.find(d => d.id === id) ?? FARM_DECORS[0];
}

export function buildDecorAnnouncementEvent(
  id: DecorId,
  firstNoticer: ResidentId,
  at: number,
): TownEvent {
  const item = getDecorMeta(id);
  return {
    id: `decor-${id}-${at}`,
    title: `院子添了新装扮：${item.label}`,
    detail: `${RESIDENTS[firstNoticer].name}路过时眼前一亮：「${item.comments[firstNoticer]}」`,
    kind: 'rumor',
    knownBy: [firstNoticer],
    hotspot: id === 'pond_lantern' ? 'pond' : id === 'windmill' ? 'farmRight' : 'plaza',
    createdAt: at,
    expiresAt: at + 24 * 3600_000,
  };
}

export function pickNearbyDecorComment(
  who: ResidentId,
  pos: { x: number; y: number },
  placed: readonly DecorId[],
): { decor: FarmDecorItem; text: string } | null {
  for (const id of placed) {
    const item = getDecorMeta(id);
    if (Math.hypot(pos.x - item.x, pos.y - item.y) <= 28) {
      return { decor: item, text: item.comments[who] };
    }
  }
  return null;
}

export function restoreDecorState(raw: unknown): FarmDecorState {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return emptyDecorState();
  const obj = raw as Record<string, unknown>;
  const valid = new Set<string>(DECOR_IDS);
  const pickList = (val: unknown): DecorId[] =>
    Array.isArray(val)
      ? [...new Set(val.filter((x): x is DecorId => typeof x === 'string' && valid.has(x)))]
      : [];
  const owned = pickList(obj.owned);
  const placed = pickList(obj.placed).filter(id => owned.includes(id));
  const announced = pickList(obj.announced).filter(id => owned.includes(id));
  return { owned, placed, announced };
}
