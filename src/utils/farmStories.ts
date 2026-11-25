import { RESIDENTS, RESIDENT_IDS, type ResidentId } from './farmLife';
import type { FarmMemories } from './farmMemory';
import { appendEpisode } from './farmPersonaMemory';

export interface StoryChapter {
  act: 1 | 2 | 3 | 4 | 5;
  title: string;
  reqAffinity: number;
  reqEpisodes: number;
  summary: string;
  quote: string;
  rewardCoins: number;
  rewardCompost: number;
}

export interface AlbumSnapshot {
  id: string;
  resident: ResidentId;
  act: number;
  title: string;
  quote: string;
  day: number;
  at: number;
}

export interface FarmStoryProgress {
  /** 每位家人当前已解锁并领取到的最高幕数（0..5） */
  acts: Partial<Record<ResidentId, number>>;
  album: AlbumSnapshot[];
}

export function emptyStoryProgress(): FarmStoryProgress {
  return { acts: {}, album: [] };
}

export const RESIDENT_STORIES: Record<ResidentId, StoryChapter[]> = {
  door: [
    { act: 1, title: '第一盏深夜台灯', reqAffinity: 12, reqEpisodes: 1, summary: 'door 在小屋桌角画下了农场小游戏的初版框架，邀你当头号体验官。', quote: '程序和庄稼一样，急不得，慢慢调总能跑出最舒服的手感。', rewardCoins: 30, rewardCompost: 0 },
    { act: 2, title: '双人试玩夜', reqAffinity: 28, reqEpisodes: 3, summary: '和你聊完好几回，door 悄悄把你的建议写进了小游戏的隐藏彩蛋里。', quote: '这个小彩蛋就留给每天来院子串门的你，别人可未必找得到。', rewardCoins: 45, rewardCompost: 1 },
    { act: 3, title: '修旧水壶的默契', reqAffinity: 45, reqEpisodes: 5, summary: 'door 边给水壶打磨除锈边和你复盘生活节奏，俩人像认识很久的老友。', quote: '有空就来歇口气，咱们家大门永远为你留着灯。', rewardCoins: 65, rewardCompost: 1 },
    { act: 4, title: '果园星光引擎', reqAffinity: 65, reqEpisodes: 8, summary: 'door 把一家人走过的路和聊过的天串成了一张暖烘烘的小镇年鉴。', quote: '回头看才发现，最珍贵的不是代码，是这院子里每天都在发生的小事。', rewardCoins: 85, rewardCompost: 1 },
    { act: 5, title: '永恒的 doordoor 乐园', reqAffinity: 85, reqEpisodes: 12, summary: 'door 把整座农场最温暖的角落做成纪念徽章，郑重交到你手里。', quote: '谢谢你陪着我们一家人，让这座小农场真的活成了理想里的样子。', rewardCoins: 120, rewardCompost: 2 },
  ],
  gu: [
    { act: 1, title: '第一碗热腾腾的汤', reqAffinity: 12, reqEpisodes: 1, summary: '顾见你忙着种地，悄悄在厨房多留了一碗加了嫩叶的蔬菜热汤。', quote: '地里的菜跑不了，人先喝口热的暖暖胃要紧呀。', rewardCoins: 30, rewardCompost: 0 },
    { act: 2, title: '果酱小罐的秘密', reqAffinity: 28, reqEpisodes: 3, summary: '顾教你分辨刚熟透的浆果，两个人熬出了满院子都闻得到的莓果香。', quote: '甜度刚好不腻口，早上抹面包配牛奶能开心一整天呢。', rewardCoins: 45, rewardCompost: 1 },
    { act: 3, title: '四季家味笔记', reqAffinity: 45, reqEpisodes: 5, summary: '顾把春夏秋冬的拿手菜抄在牛皮纸本上，扉页写着给你的留言。', quote: '不管外面风大雨大，回来总有一口合胃口的热饭等着你。', rewardCoins: 65, rewardCompost: 1 },
    { act: 4, title: '全家的长桌晚宴', reqAffinity: 65, reqEpisodes: 8, summary: '顾张罗起一整桌丰收大餐，把你按在主座第一个动筷。', quote: '看大家围在一起叽叽喳喳抢菜吃，这就是我最想要的幸福啦。', rewardCoins: 85, rewardCompost: 1 },
    { act: 5, title: '传家手账与温暖灯火', reqAffinity: 85, reqEpisodes: 12, summary: '顾把满满一本《doordoor 家味小册》送给了你，留作永远的家人信物。', quote: '以后随时推门进来，你早就是我们家里少不了的那一位啦。', rewardCoins: 120, rewardCompost: 2 },
  ],
  xiaoba: [
    { act: 1, title: '草图上的小路', reqAffinity: 12, reqEpisodes: 1, summary: '小八沉默地递给你一张手绘地图，上面标出了浇水最省脚程的走法。', quote: '顺手画的，拿去用吧，能少绕两步路。', rewardCoins: 30, rewardCompost: 0 },
    { act: 2, title: '屋檐下的安静默契', reqAffinity: 28, reqEpisodes: 3, summary: '不用太多寒暄，小八和你并肩坐在长椅上看风吹麦浪，心里格外踏实。', quote: '跟你待一块儿不累，话不用多也能懂。', rewardCoins: 45, rewardCompost: 1 },
    { act: 3, title: '兄弟间的守护', reqAffinity: 45, reqEpisodes: 5, summary: '小八把给弟弟们准备的小工具和你的那份一并码得整整齐齐。', quote: '玉洁嘴快、唯刚慢热，有你常来陪他们聊天，我放心多了。', rewardCoins: 65, rewardCompost: 1 },
    { act: 4, title: '果园全景手绘卷', reqAffinity: 65, reqEpisodes: 8, summary: '小八历时多日画完整座农场的全景图，连你最常站的那块菜地都画进去了。', quote: '你也是这片院子的风景，落笔的时候自然就画上了。', rewardCoins: 85, rewardCompost: 1 },
    { act: 5, title: '藏在心底的信任', reqAffinity: 85, reqEpisodes: 12, summary: '向来话少的大哥难得认真道了谢，把最珍视的画笔和地图复印本赠予你。', quote: '谢谢你一直尊重我的边界，也一直把这里当成真正的家。', rewardCoins: 120, rewardCompost: 2 },
  ],
  yujie: [
    { act: 1, title: '试音小插曲', reqAffinity: 12, reqEpisodes: 1, summary: '玉洁练歌被你撞见，嘴上说着不许偷听，眼睛却亮晶晶等你夸奖。', quote: '咳，刚那句高音其实还没热身呢！你觉得怎么样，客观给个满分呗？', rewardCoins: 30, rewardCompost: 0 },
    { act: 2, title: '拌嘴搭档上线', reqAffinity: 28, reqEpisodes: 3, summary: '每次来农场玉洁都第一个冲过来接梗吐槽，却总记得给你留最甜的蓝莓。', quote: '别误会啊，这蓝莓是顺手多摘的，怕放坏才分你一半的！', rewardCoins: 45, rewardCompost: 1 },
    { act: 3, title: '院子微型演唱会', reqAffinity: 45, reqEpisodes: 5, summary: '傍晚广场上玉洁拉你当头排VIP观众，一口气唱完最拿手的副歌。', quote: '全场唯一特等座留给你，记得鼓掌大声点儿！', rewardCoins: 65, rewardCompost: 1 },
    { act: 4, title: '嘴硬心软的护短', reqAffinity: 65, reqEpisodes: 8, summary: '听说你现实里课业忙，玉洁嘴上催你摸鱼，手里却早帮你把熟菜全收进了仓库。', quote: '累了就来找本校草唠嗑解压，包治百病，不收咨询费！', rewardCoins: 85, rewardCompost: 1 },
    { act: 5, title: '写给院子的专属新歌', reqAffinity: 85, reqEpisodes: 12, summary: '玉洁把农场四季和你来访的点滴写进了新词里，在星光下第一个唱给你听。', quote: '这首歌只属于 doordoor 农场，也属于最好的朋友——你！', rewardCoins: 120, rewardCompost: 2 },
  ],
  weigang: [
    { act: 1, title: '池边的一张小板凳', reqAffinity: 12, reqEpisodes: 1, summary: '唯刚在池塘边默默多放了一张小板凳，等你什么时候想发呆就坐过来。', quote: '嗯……池边风挺凉快的，你要是不忙，也可以坐这儿看会儿水面。', rewardCoins: 30, rewardCompost: 0 },
    { act: 2, title: '浮漂的小秘密', reqAffinity: 28, reqEpisodes: 3, summary: '唯刚认真给你讲了半小时水温、风向与浮漂微颤的区别，说完有点不好意思。', quote: '是不是讲太细了……不过你听得好认真，我挺开心的。', rewardCoins: 45, rewardCompost: 1 },
    { act: 3, title: '双人守漂幸运日', reqAffinity: 45, reqEpisodes: 5, summary: '和你并肩甩竿居然连中锦鲤，唯刚笑得比平时亮了好几度。', quote: '原来两个人在池边一起等鱼，连等待本身都变成一件很幸福的事。', rewardCoins: 65, rewardCompost: 1 },
    { act: 4, title: '月光下的池塘笔记', reqAffinity: 65, reqEpisodes: 8, summary: '唯刚把积攒多年的水情记录和画着月光鱼的书签送给了你。', quote: '慢慢来没关系的，不管钓鱼还是学习，沉住气总会等到咬钩那一刻。', rewardCoins: 85, rewardCompost: 1 },
    { act: 5, title: '最信赖的池畔挚友', reqAffinity: 85, reqEpisodes: 12, summary: '慢热的唯刚彻底敞开心扉，把你当成可以分享一切安静心事的知己。', quote: '谢谢你愿意放慢脚步听我说完每一句话，这对我来说特别重要。', rewardCoins: 120, rewardCompost: 2 },
  ],
  chicken: [
    { act: 1, title: '第一颗香小麦', reqAffinity: 12, reqEpisodes: 1, summary: '坤坤把你认成了最会投喂的好伙伴，每天巡田都要绕着你脚边转半圈。', quote: '咕咕！主人的口袋里一定藏着全农场最香的小麦粒！', rewardCoins: 30, rewardCompost: 0 },
    { act: 2, title: '捉虫小能手勋章', reqAffinity: 28, reqEpisodes: 3, summary: '坤坤神气活现地叼着抓虫成果来邀功，为你攒下满满一盆有机肥。', quote: '咕！有坤坤在，一颗菜叶都不会被坏虫子啃掉！', rewardCoins: 45, rewardCompost: 1 },
    { act: 3, title: '暖绒冠军鸡窝', reqAffinity: 45, reqEpisodes: 5, summary: '坤坤把小窝铺得松松软软，还特意在门口留了一块给你放水壶的空位。', quote: '咕咕，下雨天来坤坤屋檐下躲雨呀，这里最暖和啦！', rewardCoins: 65, rewardCompost: 1 },
    { act: 4, title: '全院子最响亮的早安', reqAffinity: 65, reqEpisodes: 8, summary: '每天清晨坤坤准时在广场唤醒全家，成为 doordoor 农场无可替代的小吉祥物。', quote: '咕——太阳晒屁股啦！今天也要元气满满地收获大丰收！', rewardCoins: 85, rewardCompost: 1 },
    { act: 5, title: '荣誉巡逻大队长', reqAffinity: 85, reqEpisodes: 12, summary: '全家人给坤坤颁了金麦穗小领结，坤坤骄傲地扑腾着翅膀第一个奔向你！', quote: '咕咕咕！坤坤永远守护 doordoor 农场，也永远守护最喜欢的主人！', rewardCoins: 120, rewardCompost: 2 },
  ],
};

/** 检查某位居民下一幕个人支线是否已满足解锁条件。 */
export function nextUnlockableChapter(
  who: ResidentId,
  progress: FarmStoryProgress,
  memories: FarmMemories,
): StoryChapter | null {
  const doneAct = progress.acts[who] ?? 0;
  if (doneAct >= 5) return null;
  const chapter = RESIDENT_STORIES[who][doneAct];
  if (!chapter) return null;
  const mem = memories[who];
  const epCount = (mem.episodes?.length ?? 0) + Math.floor(mem.turns.length / 2);
  if (mem.affinity >= chapter.reqAffinity && epCount >= chapter.reqEpisodes) {
    return chapter;
  }
  return null;
}

export function claimStoryChapter(options: {
  who: ResidentId;
  progress: FarmStoryProgress;
  memories: FarmMemories;
  day: number;
  at: number;
}): {
  chapter: StoryChapter;
  snapshot: AlbumSnapshot;
  nextProgress: FarmStoryProgress;
  nextMemories: FarmMemories;
} | null {
  const { who, progress, memories, day, at } = options;
  const chapter = nextUnlockableChapter(who, progress, memories);
  if (!chapter) return null;

  const snapshot: AlbumSnapshot = {
    id: `album-${who}-${chapter.act}-${at}`,
    resident: who,
    act: chapter.act,
    title: chapter.title,
    quote: chapter.quote,
    day,
    at,
  };

  const cur = memories[who];
  const nextMemories: FarmMemories = {
    ...memories,
    [who]: appendEpisode(
      { ...cur, mood: '开心' },
      {
        id: `story-${who}-${chapter.act}-${at}`,
        kind: 'reflection',
        text: `和客人一起迎来了特别瞬间「${chapter.title}」：${chapter.summary}`,
        actors: ['player'],
        tags: ['回忆', '相册', RESIDENTS[who].name],
        importance: 9,
        emotion: '珍贵',
        privacy: 'public',
        at,
      },
    ),
  };

  return {
    chapter,
    snapshot,
    nextProgress: {
      acts: { ...progress.acts, [who]: chapter.act },
      album: [...progress.album, snapshot].slice(-36),
    },
    nextMemories,
  };
}

export function restoreStoryProgress(raw: unknown): FarmStoryProgress {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return emptyStoryProgress();
  const obj = raw as Record<string, unknown>;
  const acts: Partial<Record<ResidentId, number>> = {};
  if (obj.acts && typeof obj.acts === 'object' && !Array.isArray(obj.acts)) {
    for (const id of RESIDENT_IDS) {
      const val = (obj.acts as Record<string, unknown>)[id];
      if (typeof val === 'number' && Number.isFinite(val)) {
        const clamped = Math.max(0, Math.min(5, Math.round(val)));
        if (clamped > 0) acts[id] = clamped;
      }
    }
  }
  const album: AlbumSnapshot[] = Array.isArray(obj.album)
    ? obj.album.slice(-36).flatMap(entry => {
        if (!entry || typeof entry !== 'object' || Array.isArray(entry)) return [];
        const a = entry as Record<string, unknown>;
        const id = typeof a.id === 'string' && a.id ? a.id.slice(0, 64) : '';
        const resident = a.resident;
        const act = typeof a.act === 'number' && Number.isFinite(a.act) ? Math.max(1, Math.min(5, Math.round(a.act))) : 0;
        const title = typeof a.title === 'string' ? a.title.slice(0, 40) : '';
        const quote = typeof a.quote === 'string' ? a.quote.slice(0, 120) : '';
        const day = typeof a.day === 'number' && Number.isFinite(a.day) ? Math.max(1, Math.round(a.day)) : 1;
        const at = typeof a.at === 'number' && Number.isFinite(a.at) ? Math.max(0, Math.round(a.at)) : 0;
        return id && RESIDENT_IDS.includes(resident as ResidentId) && act && title && quote
          ? [{ id, resident: resident as ResidentId, act, title, quote, day, at }]
          : [];
      })
    : [];
  return { acts, album };
}
