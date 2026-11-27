import { RESIDENTS, RESIDENT_IDS, type ResidentId } from './farmLife';
import { realDate } from './farmProgress';
import type { FarmMemories } from './farmMemory';
import { appendEpisode } from './farmPersonaMemory';

export type FocusDurationMin = 15 | 25 | 45;

export const FOCUS_PRESETS: { minutes: FocusDurationMin; label: string; coins: number; growthBoostMin: number }[] = [
  { minutes: 15, label: '15 分钟小憩专注', coins: 22, growthBoostMin: 18 },
  { minutes: 25, label: '25 分钟番茄自习', coins: 40, growthBoostMin: 35 },
  { minutes: 45, label: '45 分钟深度沉浸', coins: 78, growthBoostMin: 70 },
];

export interface FocusNote {
  id: string;
  date: string;
  minutes: number;
  companions: ResidentId[];
  topic: string;
  message: string;
  at: number;
}

export interface FarmFocusStats {
  totalSessions: number;
  totalMinutes: number;
  streakDays: number;
  lastDate: string;
  notes: FocusNote[];
}

export function emptyFocusStats(): FarmFocusStats {
  return {
    totalSessions: 0,
    totalMinutes: 0,
    streakDays: 0,
    lastDate: '',
    notes: [],
  };
}

export const COMPANION_STUDY_ACTIVITY: Record<ResidentId, string> = {
  door: '坐在旁边安静写小游戏代码，偶尔冲你点点头',
  gu: '在桌角温着一杯热花茶，轻手轻脚不打扰你',
  xiaoba: '摊开草图本在旁边画新地图，陪你一起静心',
  yujie: '戴着降噪耳机安静听歌打拍子，难得没拌嘴',
  weigang: '在窗边翻着池塘笔记，陪你稳稳把节奏守住',
  chicken: '咕……蜷在书桌脚边打了个小盹，给你暖暖气氛',
};

function encouragementLine(who: ResidentId, minutes: number, topic: string): string {
  const subject = topic.trim() ? `刚啃完「${topic.trim().slice(0, 18)}」` : `稳稳专注了 ${minutes} 分钟`;
  const lines: Record<ResidentId, string> = {
    door: `${subject}，节奏稳得很！代码和功课都一样，慢慢垒起来就成了，歇两分钟喝口水吧。`,
    gu: `${subject}辛苦啦！我刚把热汤和点心留好了，先抬头看看院子里的绿苗松松眼睛呀。`,
    xiaoba: `${subject}，挺厉害的。我也刚画完一小块地图，咱们算是各自推进了一步。`,
    yujie: `哟，真能坐得住啊，${subject}！这波专注力我给满分，待会儿赏你听我新练的副歌。`,
    weigang: `嗯……${subject}，就像在池边守漂一样沉得住气。辛苦了，慢慢放松一下肩膀吧。`,
    chicken: `咕咕！主人${subject}太棒啦！坤坤在桌角一直乖乖守着你，快去收菜奖励自己吧！`,
  };
  return lines[who];
}

export interface FocusSettlement {
  nextStats: FarmFocusStats;
  nextMemories: FarmMemories;
  note: FocusNote;
  rewardCoins: number;
  rewardCompost: number;
  growthBoostMs: number;
}

/** 结算一次农场自习伴读，发放dark币/有机肥/作物生长加速，并写入陪读家人的人格记忆。 */
export function settleFocusSession(options: {
  stats: FarmFocusStats;
  memories: FarmMemories;
  minutes: number;
  companions: readonly ResidentId[];
  topic: string;
  at: number;
}): FocusSettlement {
  const { stats, memories, topic, at } = options;
  const minutes = Math.max(5, Math.min(120, Math.round(options.minutes)));
  const activeCompanions = [...new Set(options.companions.filter(id => RESIDENT_IDS.includes(id)))].slice(0, 2);
  const picked: ResidentId[] = activeCompanions.length ? activeCompanions : ['gu'];
  const lead = picked[0];

  const preset = FOCUS_PRESETS.find(p => p.minutes === minutes);
  const rewardCoins = preset ? preset.coins : Math.max(12, Math.round(minutes * 1.6));
  const growthBoostMin = preset ? preset.growthBoostMin : Math.max(10, Math.round(minutes * 1.4));
  const rewardCompost = minutes >= 25 ? 1 : 0;

  const date = realDate(at);
  const prevDate = stats.lastDate;
  const yesterday = realDate(at - 86_400_000);
  const streakDays =
    prevDate === date
      ? Math.max(1, stats.streakDays)
      : prevDate === yesterday
        ? stats.streakDays + 1
        : 1;

  const note: FocusNote = {
    id: `focus-${at}`,
    date,
    minutes,
    companions: picked,
    topic: topic.trim().slice(0, 32),
    message: encouragementLine(lead, minutes, topic),
    at,
  };

  let nextMemories = { ...memories };
  for (const id of picked) {
    const cur = nextMemories[id];
    nextMemories = {
      ...nextMemories,
      [id]: appendEpisode(
        {
          ...cur,
          affinity: Math.min(100, cur.affinity + (minutes >= 25 ? 4 : 2)),
          mood: '开心',
        },
        {
          id: `focus-ep-${at}-${id}`,
          kind: 'chat',
          text: `我陪着客人在农场认真自习了 ${minutes} 分钟${note.topic ? `（${note.topic}）` : ''}，安静又有力量。`,
          actors: ['player'],
          tags: ['自习', '伴读', '努力'],
          importance: minutes >= 25 ? 7 : 5,
          emotion: '温暖',
          privacy: 'public',
          at,
        },
      ),
    };
  }

  return {
    nextStats: {
      totalSessions: stats.totalSessions + 1,
      totalMinutes: stats.totalMinutes + minutes,
      streakDays,
      lastDate: date,
      notes: [...stats.notes, note].slice(-20),
    },
    nextMemories,
    note,
    rewardCoins,
    rewardCompost,
    growthBoostMs: growthBoostMin * 60_000,
  };
}

export function restoreFocusStats(raw: unknown): FarmFocusStats {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return emptyFocusStats();
  const obj = raw as Record<string, unknown>;
  const notes: FocusNote[] = Array.isArray(obj.notes)
    ? obj.notes.slice(-20).flatMap(item => {
        if (!item || typeof item !== 'object' || Array.isArray(item)) return [];
        const n = item as Record<string, unknown>;
        const id = typeof n.id === 'string' && n.id ? n.id.slice(0, 60) : '';
        const date = typeof n.date === 'string' ? n.date.slice(0, 20) : '';
        const minutes = typeof n.minutes === 'number' && Number.isFinite(n.minutes) ? Math.max(1, Math.min(180, Math.round(n.minutes))) : 0;
        const companions = Array.isArray(n.companions)
          ? [...new Set(n.companions.filter((c): c is ResidentId => RESIDENT_IDS.includes(c as ResidentId)))].slice(0, 2)
          : [];
        const topic = typeof n.topic === 'string' ? n.topic.slice(0, 32) : '';
        const message = typeof n.message === 'string' ? n.message.slice(0, 140) : '';
        const at = typeof n.at === 'number' && Number.isFinite(n.at) ? Math.max(0, Math.round(n.at)) : 0;
        return id && minutes && companions.length && message ? [{ id, date, minutes, companions, topic, message, at }] : [];
      })
    : [];
  return {
    totalSessions: typeof obj.totalSessions === 'number' && Number.isFinite(obj.totalSessions) ? Math.max(0, Math.round(obj.totalSessions)) : 0,
    totalMinutes: typeof obj.totalMinutes === 'number' && Number.isFinite(obj.totalMinutes) ? Math.max(0, Math.round(obj.totalMinutes)) : 0,
    streakDays: typeof obj.streakDays === 'number' && Number.isFinite(obj.streakDays) ? Math.max(0, Math.round(obj.streakDays)) : 0,
    lastDate: typeof obj.lastDate === 'string' ? obj.lastDate.slice(0, 20) : '',
    notes,
  };
}

export function formatCompanionSummary(companions: readonly ResidentId[]): string {
  return companions.map(id => RESIDENTS[id].name).join(' & ');
}
