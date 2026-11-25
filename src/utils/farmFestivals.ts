import { SEASON_NAMES } from './farmEconomy';
import { RESIDENTS, RESIDENT_IDS, type ResidentId } from './farmLife';
import type { FarmMemories } from './farmMemory';
import { appendEpisode } from './farmPersonaMemory';
import type { FarmPeriod } from './farmTime';
import type { TownEvent } from './farmTown';

export type FestivalKind = 'harvest' | 'rainbow' | 'friday_chill' | 'custom_campfire';

export interface ActiveFestival {
  kind: FestivalKind;
  title: string;
  subtitle: string;
  seasonLabel: string;
}

export interface FiresideLine {
  speaker: ResidentId;
  text: string;
}

export interface FarmPostcard {
  id: string;
  day: number;
  season: string;
  title: string;
  dishServed?: string;
  highlights: FiresideLine[];
  at: number;
}

/** 根据农场天数、雨后彩虹或现实周五傍晚自动检测当前可开启的节庆主题。 */
export function detectAvailableFestival(options: {
  day: number;
  seasonIndex: number;
  rainbow: boolean;
  period: FarmPeriod;
  at: number;
}): ActiveFestival {
  const { day, seasonIndex, rainbow, period, at } = options;
  const seasonLabel = SEASON_NAMES[seasonIndex % 4] ?? '春';
  const weekday = new Date(at).getDay();

  if (rainbow) {
    return {
      kind: 'rainbow',
      title: '雨后彩虹院子茶话会',
      subtitle: '趁天边彩虹未散，一家人围到广场分享刚摘的鲜果和近况',
      seasonLabel,
    };
  }
  if (day > 0 && day % 7 === 0) {
    return {
      kind: 'harvest',
      title: `${seasonLabel}季丰收篝火节`,
      subtitle: `第 ${day} 天庆典！点亮广场篝火，回味这一周留在心里的瞬间`,
      seasonLabel,
    };
  }
  if (weekday === 5 && (period === 'evening' || period === 'night')) {
    return {
      kind: 'friday_chill',
      title: '周五晚间星光篝火夜',
      subtitle: '现实里忙完一周啦，来院子烤火听玉洁哼歌、喝碗顾熬的热汤',
      seasonLabel,
    };
  }
  return {
    kind: 'custom_campfire',
    title: 'doordoor 家庭篝火茶话会',
    subtitle: '随时喊齐 6 位家人围坐广场篝火旁，聊聊记忆本里最暖的往事',
    seasonLabel,
  };
}

/** 读取每位居民真实的人格记忆本，编排一轮 4～6 句高温度围炉夜话并生成可收藏明信片。 */
export function hostCampfireGathering(options: {
  festival: ActiveFestival;
  day: number;
  memories: FarmMemories;
  dishLabel?: string;
  at: number;
}): {
  postcard: FarmPostcard;
  nextMemories: FarmMemories;
  townEvent: TownEvent;
  affinityBoost: number;
} {
  const { festival, day, memories, dishLabel, at } = options;
  const dishNote = dishLabel ? `刚端上来的${dishLabel}香气四溢，` : '炉火噼啪作响，茶壶正冒着白气，';
  const highlights: FiresideLine[] = [];

  for (const id of RESIDENT_IDS) {
    const mem = memories[id];
    const pubEp = [...(mem.episodes ?? [])].reverse().find(ep => ep.privacy === 'public');
    const refl = mem.reflections?.at(-1);

    let text = '';
    if (id === 'door') {
      text = pubEp
        ? `${dishNote}说起最近最记挂的，还是「${pubEp.text.slice(0, 32)}」。一家人能这样围坐真好。`
        : `${dishNote}看着火光忽然觉得，咱们这座小农场比写什么大项目都让人踏实。`;
    } else if (id === 'gu') {
      text = dishLabel
        ? `看大家吃着${dishLabel}眼睛都亮了，我心里比什么都满足，不够锅里还温着呢！`
        : refl
          ? `${refl.slice(0, 42)}——今晚别惦记地里的活啦，都好好歇一会儿。`
          : '难得全员到齐坐一块儿，趁热把这壶花茶分完，明早醒来精神足足的。';
    } else if (id === 'xiaoba') {
      text = pubEp
        ? `嗯……前阵子「${pubEp.text.slice(0, 28)}」我一直记在心里。今晚这篝火我也画进新地图角落里。`
        : '篝火把院子照得挺暖的，我刚把今晚的座位顺序偷偷记进手账了。';
    } else if (id === 'yujie') {
      text = dishLabel
        ? `哇塞，有${dishLabel}配篝火！行，今晚我豁出去清唱一段汪苏泷给全场助兴，不许笑场啊！`
        : '这氛围绝了呀！来来来，谁先起个头，待会儿我给大家唱两句暖场！';
    } else if (id === 'weigang') {
      text = pubEp
        ? `嗯……其实我一直记得「${pubEp.text.slice(0, 28)}」。池边风大，坐篝火边听大家聊天真舒服。`
        : '火光映在池塘水面上晃晃悠悠的，感觉今晚连鱼都在听咱们说话呢。';
    } else {
      text = dishLabel
        ? `咕咕咕！${dishLabel}太香啦，坤坤也要分一小口，大家在一起最开心！`
        : '咕咕！火堆暖烘烘的，坤坤拍着小翅膀祝全家每天都大丰收！';
    }
    highlights.push({ speaker: id, text });
  }

  const affinityBoost = dishLabel ? 5 : 3;
  let nextMemories = { ...memories };
  for (const id of RESIDENT_IDS) {
    const cur = nextMemories[id];
    nextMemories = {
      ...nextMemories,
      [id]: appendEpisode(
        {
          ...cur,
          affinity: Math.min(100, cur.affinity + affinityBoost),
          mood: '开心',
        },
        {
          id: `campfire-${at}-${id}`,
          kind: 'group',
          text: `全家围在广场举办了「${festival.title}」${dishLabel ? `，一起享用了${dishLabel}` : ''}，篝火暖得心里发亮。`,
          actors: ['player', ...RESIDENT_IDS.filter(other => other !== id)],
          tags: ['篝火', '聚会', festival.seasonLabel],
          importance: 8,
          emotion: '幸福',
          privacy: 'public',
          at,
        },
      ),
    };
  }

  const postcard: FarmPostcard = {
    id: `postcard-${at}`,
    day,
    season: festival.seasonLabel,
    title: festival.title,
    ...(dishLabel ? { dishServed: dishLabel } : {}),
    highlights,
    at,
  };

  const townEvent: TownEvent = {
    id: `festival-${at}`,
    title: festival.title,
    detail: dishLabel
      ? `全家围坐广场点亮篝火，一起品尝了${dishLabel}，玉洁还即兴哼了几句歌。`
      : '全家围坐广场点亮篝火聊到兴起，欢声笑语传遍了整个果园。',
    kind: 'director',
    knownBy: [...RESIDENT_IDS],
    hotspot: 'plaza',
    createdAt: at,
    expiresAt: at + 18 * 3600_000,
  };

  return { postcard, nextMemories, townEvent, affinityBoost };
}

export function restorePostcards(raw: unknown): FarmPostcard[] {
  if (!Array.isArray(raw)) return [];
  return raw.slice(-16).flatMap(entry => {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) return [];
    const p = entry as Record<string, unknown>;
    const id = typeof p.id === 'string' && p.id ? p.id.slice(0, 60) : '';
    const day = typeof p.day === 'number' && Number.isFinite(p.day) ? Math.max(1, Math.round(p.day)) : 1;
    const season = typeof p.season === 'string' ? p.season.slice(0, 8) : '春';
    const title = typeof p.title === 'string' ? p.title.slice(0, 50) : '';
    const dishServed = typeof p.dishServed === 'string' && p.dishServed ? p.dishServed.slice(0, 24) : undefined;
    const at = typeof p.at === 'number' && Number.isFinite(p.at) ? Math.max(0, Math.round(p.at)) : 0;
    const highlights: FiresideLine[] = Array.isArray(p.highlights)
      ? p.highlights.slice(0, 6).flatMap(h => {
          if (!h || typeof h !== 'object' || Array.isArray(h)) return [];
          const row = h as Record<string, unknown>;
          const speaker = row.speaker;
          const text = typeof row.text === 'string' ? row.text.trim().slice(0, 140) : '';
          return RESIDENT_IDS.includes(speaker as ResidentId) && text
            ? [{ speaker: speaker as ResidentId, text }]
            : [];
        })
      : [];
    return id && title && highlights.length
      ? [{ id, day, season, title, ...(dishServed ? { dishServed } : {}), highlights, at }]
      : [];
  });
}

export function festivalParticipantNames(): string {
  return RESIDENT_IDS.map(id => RESIDENTS[id].name).join('、');
}
