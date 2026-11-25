import type { WaypointId } from '@/constants/farmMap';
import type { FarmEmotionDelta } from './farmEmotion';
import type { ResidentId } from './farmLife';
import type { FarmPeriod, FarmWeather } from './farmTown';
import type { VisitorId } from './farmVisitors';

export interface FarmRandomEventChoice {
  id: string;
  label: string;
  tone: 'sage' | 'amber' | 'paper';
  outcomeText: string;
  coins?: number;
  compost?: number;
  waterRefill?: number;
  growthBoostMinutes?: number;
  affinityDelta?: number;
  emotionDelta: FarmEmotionDelta;
  rumorTitle?: string;
  rumorDetail?: string;
}

export interface FarmRandomEventDef {
  id: string;
  title: string;
  summary: string;
  badge: string;
  weather: 'clear' | 'rain' | 'rainbow' | 'any';
  timeOfDay: 'day' | 'night' | 'any';
  hotspot: WaypointId;
  participants: ResidentId[];
  /** 若当前正好该访客在场，可提升出现权重并触发联动彩蛋 */
  preferredVisitor?: VisitorId;
  choices: [FarmRandomEventChoice, FarmRandomEventChoice, ...FarmRandomEventChoice[]];
}

export interface FarmRandomEventState {
  activeEventId: string | null;
  activeTriggeredAt: number;
  lastResolvedAt: number;
  recentIds: string[];
  resolvedCount: number;
}

export const FARM_RANDOM_EVENTS: readonly FarmRandomEventDef[] = [
  // ── 晴天 / 微风事件 ──
  {
    id: 'golden_butterflies',
    title: '金翼蝴蝶群掠过菜田',
    summary: '成群金色小蝴蝶顺着微风落在新芽上，顾笑着喊大家来看这难得的春光。',
    badge: '晴日奇遇',
    weather: 'clear',
    timeOfDay: 'day',
    hotspot: 'farmCenter',
    participants: ['gu', 'xiaoba'],
    choices: [
      {
        id: 'pollinate',
        label: '轻手引导蝴蝶授粉',
        tone: 'sage',
        outcomeText: '蝴蝶绕着菜畦飞了一大圈，整片田地的作物都悄悄多长了一截！',
        growthBoostMinutes: 25,
        affinityDelta: 3,
        emotionDelta: { joy: 14, calm: 8, energy: 4, reason: '一起静静看金蝴蝶为菜田授粉' },
        rumorTitle: '金蝴蝶群光顾菜田',
        rumorDetail: '成群金翼蝴蝶帮菜田授了粉，顾说今年收成一定特别甜。',
      },
      {
        id: 'sketch',
        label: '陪小八速写蝶群',
        tone: 'paper',
        outcomeText: '小八迅速记下蝴蝶飞舞的轨迹画进了地图草稿，送了你一袋有机肥致谢。',
        compost: 1,
        affinityDelta: 4,
        emotionDelta: { joy: 12, social: 10, calm: 6, reason: '有人陪着记录菜田里的金蝴蝶' },
      },
    ],
  },
  {
    id: 'kunkun_treasure',
    title: '坤坤在草垛刨出亮晶晶的小包',
    summary: '坤坤咯咯叫着刨地，居然从鸡窝旁刨出一个系着麻绳的小布袋！',
    badge: '宠物惊喜',
    weather: 'clear',
    timeOfDay: 'day',
    hotspot: 'coop',
    participants: ['chicken', 'door'],
    choices: [
      {
        id: 'reward_kunkun',
        label: '摸头夸坤坤并打开布袋',
        tone: 'amber',
        outcomeText: '布袋里装着 24 枚亮晶晶的旧金币和 1 份堆肥，坤坤得意地转了两圈！',
        coins: 24,
        compost: 1,
        affinityDelta: 4,
        emotionDelta: { joy: 18, energy: 10, social: 8, reason: '刨出宝藏被大伙儿狠狠夸奖啦' },
        rumorTitle: '坤坤化身寻宝鸡王',
        rumorDetail: '坤坤在鸡窝旁刨出旧钱袋，正骄傲地逢人就炫耀。',
      },
      {
        id: 'share_grain',
        label: '把布袋里的好东西分给全家',
        tone: 'sage',
        outcomeText: 'door 乐呵呵收下草图笔记，顺手塞给你 18 金币当茶水费，大家笑成一团。',
        coins: 18,
        affinityDelta: 5,
        emotionDelta: { joy: 15, calm: 8, social: 12, reason: '和全家一起分享坤坤挖出的惊喜' },
      },
    ],
  },
  {
    id: 'yujie_street_concert',
    title: '玉洁在广场试唱新副歌',
    summary: '午后阳光正好，玉洁戴着半边耳机在广场轻声试唱汪苏泷的新歌，引来家人驻足。',
    badge: '广场欢歌',
    weather: 'clear',
    timeOfDay: 'day',
    hotspot: 'plaza',
    participants: ['yujie', 'gu', 'xiaoba'],
    choices: [
      {
        id: 'clap_encore',
        label: '带头鼓掌喊安可',
        tone: 'amber',
        outcomeText: '玉洁嘴上说“别起哄啦”，耳尖却红了，状态拉满又加唱了一段超稳高音！',
        coins: 15,
        affinityDelta: 5,
        emotionDelta: { joy: 18, social: 14, energy: 10, reason: '在广场唱歌收到热烈掌声和安可' },
        rumorTitle: '玉洁广场午后微型音乐会',
        rumorDetail: '玉洁一首副歌惊艳全场，连鸡窝边的坤坤都跟着拍翅膀。',
      },
      {
        id: 'pour_tea',
        label: '递上温花茶润润嗓',
        tone: 'sage',
        outcomeText: '玉洁接过热茶软下语气道谢，还顺手帮你灌满了水壶。',
        waterRefill: 6,
        affinityDelta: 4,
        emotionDelta: { joy: 14, calm: 10, social: 8, reason: '唱完歌立刻收到贴心的润嗓花茶' },
      },
    ],
  },
  {
    id: 'weigang_golden_koi',
    title: '池塘深处闪过一条发光锦鲤',
    summary: '唯刚猛地压低声音招手——池水里游过一条鳞片反光的超级大锦鲤！',
    badge: '池畔奇观',
    weather: 'clear',
    timeOfDay: 'day',
    hotspot: 'pond',
    participants: ['weigang', 'door'],
    choices: [
      {
        id: 'quiet_watch',
        label: '屏息陪唯刚记下鱼群规律',
        tone: 'sage',
        outcomeText: '唯刚兴奋地在小本本上推算出咬钩周期，慷慨分你 2 份高级鱼肥和 20 金币！',
        coins: 20,
        compost: 2,
        affinityDelta: 5,
        emotionDelta: { joy: 20, energy: 10, calm: 6, reason: '观测到罕见发光锦鲤并记下规律' },
        rumorTitle: '池塘惊现发光大锦鲤',
        rumorDetail: '唯刚在池边亲眼见到发光锦鲤，正准备写一篇钓位分析。',
      },
      {
        id: 'toss_bait',
        label: '一起撒把麦香饵料',
        tone: 'amber',
        outcomeText: '锦鲤跃出水面溅起亮闪闪的水花，整片农场的运气仿佛都跟着变旺了！',
        coins: 28,
        affinityDelta: 3,
        emotionDelta: { joy: 15, social: 8, reason: '发光锦鲤跃出水面溅起好运水花' },
      },
    ],
  },
  {
    id: 'door_sprinkler_hack',
    title: 'door 鼓捣出竹筒迷你滴灌器',
    summary: 'door 拿着几节竹筒和麻绳在田边比划，宣称要给菜地做个省力小发明。',
    badge: '极客农场',
    weather: 'clear',
    timeOfDay: 'day',
    hotspot: 'farmLeft',
    participants: ['door', 'gu'],
    choices: [
      {
        id: 'test_it',
        label: '一起试水调试竹筒',
        tone: 'sage',
        outcomeText: '清凉池水顺着竹筒均匀流进土里！水壶满格且全田加速成长 20 分钟。',
        waterRefill: 12,
        growthBoostMinutes: 20,
        affinityDelta: 4,
        emotionDelta: { joy: 16, energy: 8, social: 10, reason: '迷你竹筒滴灌器一次调试成功' },
        rumorTitle: 'door 造出农场竹筒滴灌器',
        rumorDetail: 'door 的手工小发明居然一次就成功，顾也忍不住夸他手巧。',
      },
      {
        id: 'cheer_tea',
        label: '叫上顾一起验收点评',
        tone: 'paper',
        outcomeText: '顾一边擦汗一边夸奖，door 难得有点害羞地挠头，送你 22 金币买新种子。',
        coins: 22,
        affinityDelta: 4,
        emotionDelta: { joy: 14, calm: 10, social: 10, reason: '小发明得到了顾和客人的双倍认可' },
      },
    ],
  },
  {
    id: 'xiaoba_secret_note',
    title: '篱笆下发现小八藏的寻宝纸条',
    summary: '木篱笆缝里夹着一张手绘像素小地图，上面画着三个可爱箭头。',
    badge: '藏宝彩蛋',
    weather: 'clear',
    timeOfDay: 'any',
    hotspot: 'marketDoor',
    participants: ['xiaoba', 'yujie'],
    choices: [
      {
        id: 'follow_map',
        label: '按图索骥去长椅下找',
        tone: 'amber',
        outcomeText: '你在长椅石砖旁找到了 25 金币和一张小八画的笑脸贴纸！',
        coins: 25,
        affinityDelta: 5,
        emotionDelta: { joy: 18, social: 14, calm: 6, reason: '藏好的手绘寻宝彩蛋真的被人发现啦' },
      },
      {
        id: 'draw_reply',
        label: '在背面画个彩蛋回信',
        tone: 'paper',
        outcomeText: '小八看到回画嘴角扬起大大的弧度，悄悄放了 2 份有机肥在田头。',
        compost: 2,
        affinityDelta: 5,
        emotionDelta: { joy: 16, calm: 10, social: 12, reason: '收到客人用心画的寻宝回信' },
      },
    ],
  },

  // ── 雨天专属事件 ──
  {
    id: 'rain_ginger_soup',
    title: '屋檐下的暖胃姜枣热汤局',
    summary: '细雨淅淅沥沥打在瓦片上，顾熬了一大锅热腾腾的姜枣萝卜汤招呼大家避雨。',
    badge: '雨日暖心',
    weather: 'rain',
    timeOfDay: 'any',
    hotspot: 'houseDoor',
    participants: ['gu', 'door', 'weigang'],
    choices: [
      {
        id: 'drink_together',
        label: '端一碗坐在屋檐下听雨',
        tone: 'sage',
        outcomeText: '热汤下肚浑身暖和，全家在屋檐下聊得热火朝天，精力与好感齐刷刷上涨！',
        affinityDelta: 5,
        emotionDelta: { joy: 15, energy: 14, calm: 14, social: 12, reason: '下雨天在屋檐下喝到热腾腾的姜汤' },
        rumorTitle: '雨天屋檐姜汤茶话会',
        rumorDetail: '顾熬的雨天热汤香飘半个院子，大伙儿围在门口都不舍得走。',
      },
      {
        id: 'help_serve',
        label: '帮顾给躲雨的鸡窝也送点热食',
        tone: 'amber',
        outcomeText: '坤坤感动得咕咕直叫，顾笑眯眯塞给你 20 金币和 1 份堆肥。',
        coins: 20,
        compost: 1,
        affinityDelta: 4,
        emotionDelta: { joy: 16, calm: 10, social: 10, reason: '雨天一起照顾好了院子里的每一个成员' },
      },
    ],
  },
  {
    id: 'rain_mushrooms',
    title: '湿润树根冒出一丛鲜白蘑菇',
    summary: '一场细雨过后，院子大树脚下圆滚滚地冒出了好多雪白可爱的小蘑菇！',
    badge: '雨润丰收',
    weather: 'rain',
    timeOfDay: 'day',
    hotspot: 'pondBench',
    participants: ['gu', 'chicken'],
    choices: [
      {
        id: 'harvest_mushrooms',
        label: '提篮采摘做鲜菇汤',
        tone: 'amber',
        outcomeText: '采了满满一篮鲜蘑菇，卖掉多余的赚了 26 金币，顺手攒出 1 份菌肥！',
        coins: 26,
        compost: 1,
        affinityDelta: 3,
        emotionDelta: { joy: 14, energy: 6, reason: '雨天意外收获满满一篮嫩白蘑菇' },
      },
      {
        id: 'make_compost',
        label: '留一部分滋养菜田土壤',
        tone: 'sage',
        outcomeText: '雨水和菌落让土地格外肥沃，菜田作物齐齐加速成长 30 分钟！',
        growthBoostMinutes: 30,
        compost: 1,
        affinityDelta: 3,
        emotionDelta: { joy: 12, calm: 10, reason: '雨后菌肥让菜苗喝足了养分' },
      },
    ],
  },
  {
    id: 'rain_pond_bubbles',
    title: '雨滴敲出池塘鱼群大活跃',
    summary: '细雨给池水溶入了满满氧气，水面到处是小鱼吐泡泡的涟漪，唯刚眼睛都亮了。',
    badge: '雨中观鱼',
    weather: 'rain',
    timeOfDay: 'day',
    hotspot: 'pond',
    participants: ['weigang', 'xiaoba'],
    choices: [
      {
        id: 'shelter_fish',
        label: '撑伞陪唯刚树荫下观漂',
        tone: 'sage',
        outcomeText: '两人在雨声里默契拉上一尾肥鲤鱼，换了 24 金币，心情平静又满足！',
        coins: 24,
        affinityDelta: 5,
        emotionDelta: { joy: 16, calm: 14, social: 10, reason: '有人撑伞陪自己在雨天看鱼漂' },
      },
      {
        id: 'collect_rainwater',
        label: '趁机把水壶接满清甜雨水',
        tone: 'paper',
        outcomeText: '雨水清凉又养苗，水壶瞬间满格，田里的作物也多长了一截。',
        waterRefill: 12,
        growthBoostMinutes: 15,
        affinityDelta: 2,
        emotionDelta: { joy: 10, calm: 8, reason: '接了满满一壶清甜的雨水' },
      },
    ],
  },
  {
    id: 'rain_canopy_repair',
    title: '集市雨棚角有点漏水啦',
    summary: '雨势忽大，集市摊口的布棚一角积了水往下滴答，玉洁和 door 正找木棍撑起。',
    badge: '雨中协力',
    weather: 'rain',
    timeOfDay: 'any',
    hotspot: 'marketDoor',
    participants: ['door', 'yujie'],
    choices: [
      {
        id: 'fix_together',
        label: '搭把手拉紧绳扣',
        tone: 'sage',
        outcomeText: '三人合力把雨棚修得稳稳当当，集市摊主感激地送了 30 金币谢礼！',
        coins: 30,
        affinityDelta: 5,
        emotionDelta: { joy: 14, energy: -4, calm: 12, social: 12, reason: '雨中合力修好雨棚超有成就感' },
        rumorTitle: '雨中抢修集市雨棚成功',
        rumorDetail: 'door、玉洁和客人冒雨修好了漏水雨棚，摊主们直夸靠谱。',
      },
      {
        id: 'hand_towels',
        label: '递上干毛巾和热茶',
        tone: 'paper',
        outcomeText: '玉洁擦干眼镜嘴硬说“才没淋湿”，心里却暖乎乎的。',
        coins: 16,
        affinityDelta: 4,
        emotionDelta: { joy: 14, calm: 12, social: 10, reason: '淋雨后立刻收到干毛巾，心里暖暖的' },
      },
    ],
  },
  {
    id: 'dafeiyu_rain_splash',
    title: '大肥鱼在雨地里开心踩水花',
    summary: '别人都在屋檐下躲雨，蓝发鲸鱼小女仆却甩着尾巴在院子水洼里欢快地接雨滴！',
    badge: '鲸鱼雨戏',
    weather: 'rain',
    timeOfDay: 'any',
    hotspot: 'plaza',
    participants: ['gu', 'chicken'],
    preferredVisitor: 'dafeiyu',
    choices: [
      {
        id: 'splash_together',
        label: '陪她一起踩水花玩闹',
        tone: 'amber',
        outcomeText: '水花四溅笑声不断！鲸鱼尾开心得直摇，还把雨后的好运分给了整片农场。',
        coins: 22,
        growthBoostMinutes: 20,
        affinityDelta: 5,
        emotionDelta: { joy: 22, energy: 12, social: 14, reason: '在雨天水洼里一起踩水花玩疯啦' },
        rumorTitle: '院子里的雨中踩水花派对',
        rumorDetail: '下雨天院子里笑声比晴天还大，蓝发鲸鱼姑娘把大家都逗乐了。',
      },
      {
        id: 'warm_rice_treat',
        label: '端碗热腾腾的白米饭迎她进檐',
        tone: 'sage',
        outcomeText: '热米饭香气瞬间俘获鲸鱼娘，她一边干饭一边把水壶帮你灌得满满当当！',
        waterRefill: 12,
        compost: 1,
        affinityDelta: 6,
        emotionDelta: { joy: 20, calm: 12, energy: 14, reason: '雨天吃到了香喷喷的热白米饭' },
      },
    ],
  },

  // ── 雨后彩虹事件 ──
  {
    id: 'rainbow_wish',
    title: '天边挂起澄澈双彩虹',
    summary: '阵雨刚停，一道亮晶晶的双彩虹横跨农场木屋与池塘，所有家人都跑出屋檐仰望！',
    badge: '彩虹奇景',
    weather: 'rainbow',
    timeOfDay: 'day',
    hotspot: 'plaza',
    participants: ['door', 'gu', 'xiaoba', 'yujie', 'weigang'],
    choices: [
      {
        id: 'family_photo',
        label: '定格全家彩虹大合照',
        tone: 'amber',
        outcomeText: '快门咔嚓一声留住最亮眼的笑容，全家心情大涨，还收获 35 枚纪念金币！',
        coins: 35,
        affinityDelta: 6,
        emotionDelta: { joy: 24, energy: 12, calm: 14, social: 18, reason: '在双彩虹下拍到了超温馨的全家福' },
        rumorTitle: '双彩虹下的农场全家福',
        rumorDetail: '全家人在双彩虹下拍了一张珍贵合影，准备挂进小屋相框里。',
      },
      {
        id: 'rainbow_dew',
        label: '收集叶片上的彩虹露珠浇田',
        tone: 'sage',
        outcomeText: '晶莹露珠洒满农田，所有作物瞬间吸饱灵气加速成长 45 分钟！',
        growthBoostMinutes: 45,
        waterRefill: 12,
        affinityDelta: 4,
        emotionDelta: { joy: 18, calm: 12, reason: '用彩虹露珠滋润了整片菜田' },
      },
    ],
  },
  {
    id: 'rainbow_tea_party',
    title: '彩虹下的池畔茶点分享',
    summary: '雨后空气清甜，顾把刚出炉的麦香小饼端到长椅上，招呼大家趁着彩虹还在吃点心。',
    badge: '雨后茶歇',
    weather: 'rainbow',
    timeOfDay: 'day',
    hotspot: 'pondBench',
    participants: ['gu', 'yujie', 'weigang'],
    choices: [
      {
        id: 'join_tea',
        label: '坐下喝茶聊今天的新鲜事',
        tone: 'sage',
        outcomeText: '一口热茶一口甜点，大家把白天的疲惫一扫而空，还攒出 2 份精致肥料！',
        compost: 2,
        affinityDelta: 5,
        emotionDelta: { joy: 18, energy: 12, calm: 16, social: 14, reason: '在彩虹下享受了惬意的下午茶' },
      },
      {
        id: 'pack_snacks',
        label: '打包一份留给晚归的家人',
        tone: 'paper',
        outcomeText: '顾直夸你细心，顺手多塞了 24 金币给你在集市挑好种子。',
        coins: 24,
        affinityDelta: 5,
        emotionDelta: { joy: 16, calm: 14, social: 12, reason: '贴心地给全家都留了雨后茶点' },
      },
    ],
  },

  // ── 夜晚专属事件 ──
  {
    id: 'night_fireflies',
    title: '池塘芦苇丛升起漫天萤火虫',
    summary: '夜风轻拂，点点暖黄色的萤火虫从池畔芦苇间飘起，把整个院子映得像童话世界。',
    badge: '夏夜流萤',
    weather: 'clear',
    timeOfDay: 'night',
    hotspot: 'pond',
    participants: ['weigang', 'xiaoba'],
    choices: [
      {
        id: 'watch_fireflies',
        label: '静静欣赏萤火虫飞舞',
        tone: 'sage',
        outcomeText: '星光与流萤倒映在水面上，夜晚的疲惫与 emo 瞬间被治愈得干干净净！',
        affinityDelta: 5,
        emotionDelta: { joy: 18, calm: 20, energy: 6, social: 8, reason: '夜里在池塘边看见了漫天萤火虫' },
        rumorTitle: '池塘夏夜萤火虫奇景',
        rumorDetail: '昨晚池塘边飘起了成片萤火虫，唯刚和小八看得都忘了时间。',
      },
      {
        id: 'lantern_walk',
        label: '提一盏小灯绕菜田散步',
        tone: 'amber',
        outcomeText: '借着温柔灯光顺便照看了夜苗，作物加快成长 25 分钟并捡到 18 金币。',
        coins: 18,
        growthBoostMinutes: 25,
        affinityDelta: 4,
        emotionDelta: { joy: 14, calm: 14, reason: '伴着萤火虫微光夜巡菜田' },
      },
    ],
  },
  {
    id: 'night_meteor_wish',
    title: '一颗亮流星划过小屋屋顶',
    summary: '清朗的夜空突然划过一道银金色流星尾迹，院子里还没睡的人不约而同抬头许愿。',
    badge: '流星许愿',
    weather: 'clear',
    timeOfDay: 'night',
    hotspot: 'plaza',
    participants: ['door', 'gu', 'yujie'],
    choices: [
      {
        id: 'wish_harvest',
        label: '许愿全家安康、作物丰收',
        tone: 'amber',
        outcomeText: '微风仿佛听见了心愿，次日田里的作物长势大好，全员情绪暖融融！',
        growthBoostMinutes: 35,
        affinityDelta: 5,
        emotionDelta: { joy: 20, calm: 16, social: 10, reason: '在院子里一起对着流星许了愿' },
        rumorTitle: '农场夜空划过金色流星',
        rumorDetail: '昨晚屋顶上空划过一颗超亮的流星，听说许的愿特别灵验。',
      },
      {
        id: 'wish_lucky',
        label: '许愿明天集市好运爆棚',
        tone: 'sage',
        outcomeText: '流星余光洒在门廊上，你在石阶旁意外摸到 30 枚幸运金币！',
        coins: 30,
        affinityDelta: 4,
        emotionDelta: { joy: 16, energy: 8, reason: '对着流星许愿收获满满好运' },
      },
    ],
  },
  {
    id: 'night_couple_porch',
    title: 'door 与 顾 门廊低声夜话',
    summary: '睡前两人披着外套站在木屋门廊吹风，聊着三个孩子的趣事和明天的菜园计划。',
    badge: '温馨夜话',
    weather: 'any',
    timeOfDay: 'night',
    hotspot: 'houseDoor',
    participants: ['door', 'gu'],
    choices: [
      {
        id: 'bring_warm_milk',
        label: '端两杯热牛奶陪他们聊会儿',
        tone: 'sage',
        outcomeText: '顾笑着接过杯子，door 拍拍你肩膀把攒的 2 份有机肥送给你，随后两人牵手回主卧休息。',
        compost: 2,
        affinityDelta: 6,
        emotionDelta: { joy: 18, calm: 18, social: 14, reason: '睡前和家人喝热牛奶聊了许多暖心话' },
      },
      {
        id: 'quiet_goodnight',
        label: '轻声道句晚安不打扰二人世界',
        tone: 'paper',
        outcomeText: '顾温柔回你一句“你也早点睡呀”，门廊灯火让人心里格外踏实。',
        coins: 16,
        affinityDelta: 4,
        emotionDelta: { joy: 14, calm: 16, reason: '一句轻柔晚安让夜色更加温馨' },
      },
    ],
  },
];

export function emptyRandomEventState(): FarmRandomEventState {
  return {
    activeEventId: null,
    activeTriggeredAt: 0,
    lastResolvedAt: 0,
    recentIds: [],
    resolvedCount: 0,
  };
}

export function restoreRandomEventState(raw: unknown): FarmRandomEventState {
  const base = emptyRandomEventState();
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return base;
  const o = raw as Record<string, unknown>;
  const validIds = new Set(FARM_RANDOM_EVENTS.map(e => e.id));
  const activeEventId =
    typeof o.activeEventId === 'string' && validIds.has(o.activeEventId) ? o.activeEventId : null;
  const recentIds = Array.isArray(o.recentIds)
    ? o.recentIds.filter((id): id is string => typeof id === 'string' && validIds.has(id)).slice(-8)
    : [];
  const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) && v >= 0 ? Math.round(v) : 0);
  return {
    activeEventId,
    activeTriggeredAt: num(o.activeTriggeredAt),
    lastResolvedAt: num(o.lastResolvedAt),
    recentIds,
    resolvedCount: num(o.resolvedCount),
  };
}

export function getRandomEventById(id: string | null | undefined): FarmRandomEventDef | null {
  if (!id) return null;
  return FARM_RANDOM_EVENTS.find(e => e.id === id) ?? null;
}

/** 冷却 3 分钟后按当前天气、昼夜与在场访客挑出一条不重复的农场随机事件 */
export function pickFarmRandomEvent(options: {
  state: FarmRandomEventState;
  weather: FarmWeather;
  rainbow: boolean;
  period: FarmPeriod;
  activeVisitor?: VisitorId | null;
  at: number;
  roll?: number;
  force?: boolean;
}): FarmRandomEventDef | null {
  const { state, weather, rainbow, period, activeVisitor, at, roll = Math.random(), force = false } = options;
  if (!force) {
    if (state.activeEventId && at - state.activeTriggeredAt < 10 * 60_000) return null;
    if (state.lastResolvedAt > 0 && at - state.lastResolvedAt < 3 * 60_000) return null;
  }
  const isNight = period === 'night';
  const currentWeather = rainbow ? 'rainbow' : weather;

  const eligible = FARM_RANDOM_EVENTS.filter(ev => {
    const weatherOk = ev.weather === 'any' || ev.weather === currentWeather || (rainbow && ev.weather === 'clear');
    const timeOk = ev.timeOfDay === 'any' || (isNight ? ev.timeOfDay === 'night' : ev.timeOfDay === 'day');
    return weatherOk && timeOk;
  });
  if (!eligible.length) return null;

  const recentSet = new Set(state.recentIds.slice(-5));
  const fresh = eligible.filter(ev => !recentSet.has(ev.id));
  const basePool = fresh.length ? fresh : eligible;

  // 加权：精准匹配当前特殊天气（彩虹/雨天）或当前在场访客彩蛋的事件优先度更高
  const weighted: FarmRandomEventDef[] = [];
  for (const ev of basePool) {
    weighted.push(ev);
    if (ev.weather === currentWeather && currentWeather !== 'clear') weighted.push(ev);
    if (ev.preferredVisitor && ev.preferredVisitor === activeVisitor) {
      weighted.push(ev, ev);
    }
  }
  const index = Math.floor(Math.max(0, Math.min(0.999999, roll)) * weighted.length);
  return weighted[index] ?? basePool[0];
}
