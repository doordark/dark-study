export const RESIDENT_IDS = ["door", "gu", "xiaoba", "yujie", "weigang", "chicken"] as const;
export type ResidentId = typeof RESIDENT_IDS[number];
export const RESIDENTS: Record<ResidentId, {
  name: string;
  row: number;
  persona: string;
}> = {
  door: {
    name: "door",
    row: 0,
    persona: "温和嘴硬的开发者，会照料家人，想休息却总惦记代码；和顾是伴侣"
  },
  gu: {
    name: "顾",
    row: 1,
    persona: "细腻俏皮，懂植物也懂家人的情绪；会温柔打趣door并提醒他休息"
  },
  xiaoba: {
    name: "小八",
    row: 2,
    persona: "door和顾的长子，稳重但也会撒娇，习惯先照顾弟弟"
  },
  yujie: {
    name: "玉洁",
    row: 3,
    persona: "次子，活泼嘴贫爱吃，喜欢开玩笑但绝不恶意伤人"
  },
  weigang: {
    name: "唯纲",
    row: 4,
    persona: "幼子，戴紫色魔法帽，认真又天真，坚信照顾植物就是魔法"
  },
  chicken: {
    name: "坤坤",
    row: 5,
    persona: "圆滚滚的小鸡，胆小黏人，爱虫子和晒太阳；短句，偶尔咕一声"
  }
};
export const isResidentId = (value: unknown): value is ResidentId => RESIDENT_IDS.includes(value as ResidentId);
export type LifeMode = 'quiet' | 'normal' | 'lively' | 'aiTown' | 'custom';
export interface LifeSettings {
  version: 3;
  mode: LifeMode;
  roaming: boolean;
  chatter: boolean;
  online: boolean;
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
export const SETTING_RANGES = {
  activitySeconds: [4, 60],
  encounterChance: [0, 100],
  conversationCooldown: [20, 600],
  rounds: [2, 6],
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
  for (const key of ['roaming', 'chatter', 'online'] as const) if (typeof v[key] === 'boolean') base[key] = v[key];
  for (const key of Object.keys(SETTING_RANGES) as NumericLifeSetting[]) base[key] = number(v[key], base[key], SETTING_RANGES[key][0], SETTING_RANGES[key][1]);
  // Old intervals described forced chat; migrate to a personal encounter cooldown.
  if (v.version !== 3 && typeof v.interval === 'number') base.conversationCooldown = number(v.interval, 90, 20, 600);
  const preset = typeof v.mode === 'string' && v.mode in PRESETS ? v.mode as Exclude<LifeMode, 'custom'> : null;
  base.mode = preset && (Object.keys(base) as (keyof LifeSettings)[]).every(k => k === 'mode' || base[k] === PRESETS[preset][k]) ? preset : Object.keys(v).length ? 'custom' : 'normal';
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
export interface ResidentConversation {
  id: string;
  participants: ResidentId[];
  startedAt: number;
  endedAt: number | null;
  source: 'encounter' | 'scheduled/local' | 'player_command';
  online: boolean;
  lines: ResidentLine[];
}
export function readLifeReply(raw: string, pair: readonly ResidentId[], rounds = 1): Omit<ResidentLine, 'at'>[] | null {
  try {
    const v = object(JSON.parse(raw));
    if (!Array.isArray(v.lines) || v.lines.length !== rounds * 2) return null;
    if (!v.lines.every((raw, i) => {
      const l = object(raw);
      return l.speaker === pair[i % 2] && typeof l.text === 'string' && l.text.trim().length > 0 && l.text.length <= 44;
    })) return null;
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
      const lines = v.lines.map(object).filter(l => isResidentId(l.speaker) && participants.includes(l.speaker) && typeof l.text === 'string' && l.text.length <= 160).slice(0, 12).map(l => ({
        speaker: l.speaker as ResidentId,
        text: (l.text as string).trim(),
        at: number(l.at, 0, 0, Number.MAX_SAFE_INTEGER)
      }));
      if (participants.length && participants.length <= 2 && lines.length) result.push({
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
const VOICES: Record<ResidentId, readonly [string, string][]> = {
  door: [['这排种子发芽了，今天可以少改一点代码。', '那我先把水壶放好，再陪你歇一会。'], ['我在门口留了盏灯，晚点回家也看得见。', '你们回来就好，饭可以一起慢慢吃。'], ['总盯着进度条，反而忘了看看天。', '走吧，到池边听听水声。'], ["屋檐的水滴停了，看来天气要放晴。", "那我们趁天好，把门口的衣服收一收。"], ["锄头靠在架子上，用完就不用到处找。", "工具各归各位，明天又能轻松一点。"], ["小广场的长椅修好了，谁先来坐？", "别客气，今天我们都可以当个闲人。"]],
  gu: [['叶片精神了，看来今天喝够了水。', '别只顾着苗苗，你也要喝点水。'], ['晾好的衣服有太阳的味道。', '今晚早点回屋，我给大家留了点心。'], ['你看，风把云吹成了小兔子。', '我们在长椅上坐一会儿吧。'], ["风有一点凉，我把窗户留了条缝。", "等太阳回来，院子里又会暖起来。"], ["这束小花放在桌边正合适。", "你愿意帮忙，我就已经很开心啦。"], ["今天不用赶路，大家都在这里。", "那就一起坐坐，慢慢讲今天的小事。"]],
  xiaoba: [['菜篮我来拿，空出手就不怕踩到苗。', '弟弟们有我看着，你放心休息。'], ['回家之前记得把工具收好。', '大家都平安回来了，我就放心啦。'], ['偶尔什么也不做，也不算偷懒。', '那我陪你站一会儿，听听树叶。'], ["天上的云变厚了，我去看看晾衣绳。", "收好了就能安心等天晴。"], ["弟弟们的小铲子，我也放回架子上了。", "我记着位置，下次用的时候叫我。"], ["今天想找个地方安静坐一坐。", "有家人在旁边，不说话也很舒服。"]],
  yujie: [['我只是闻闻蓝莓，这回真的没有偷吃。', '成熟了记得叫我，我负责认真品尝！'], ['我从屋里闻到饭香了。', '要不我们比比谁先把碗筷摆好？'], ['池里的小鱼会不会也在等晚饭？', '我保证今天不拿面包喂它们。'], ["要是下雨，我就在屋里听雨。", "我连点心都准备好了，当然不着急。"], ["篮子终于空了，我这次一口都没偷吃。", "记得夸夸我，这可需要很大毅力！"], ["广场那边的位置还空着呢。", "我带上故事来，你们可别先散场。"]],
  weigang: [['我给种子施了耐心魔法。', '秘诀就是浇水以后，不要一直挖开看。'], ['屋里的灯是回家的魔法标记。', '帽子摘下来之前，我要先说晚安。'], ['今天的风像会隐身的小精灵。', '嘘，我们别吓走它们。'], ["云在排队，一定是在练习下雨魔法。", "等它们练完，我们再出去看看彩虹。"], ["我把小木杖和农具放在一起了。", "下次要施法时，我一定记得先取水壶。"], ["我今天的魔法，是让大家笑一下。", "那它已经成功了，我还想再试一次。"]],
  chicken: [['咕！这块土松松的，好想打个滚。', '咕，放心，我不会啄刚种下的苗。'], ['咕咕，鸡窝的稻草还是热乎乎的。', '咕！本队长准备回窝啦。'], ['咕？池边有小虫子在跳。', '咕，我慢慢找，你慢慢看。'], ["咕，风把羽毛吹得圆圆的。", "咕咕，我去背风的地方等你。"], ["咕！稻草铺好了，工具也摆好了。", "咕，本队长宣布，今天巡田结束！"], ["咕？长椅下面也给我留个位子。", "咕咕，有你们在，我就不怕啦。"]]
};
export const LOCAL_SCENES: {
  pair: [ResidentId, ResidentId];
  lines: [string, string];
}[] = RESIDENT_IDS.flatMap((a, i) => RESIDENT_IDS.slice(i + 1).flatMap(b => VOICES[a].map((voice, index) => ({
  pair: [a, b] as [ResidentId, ResidentId],
  lines: [voice[0], VOICES[b][index][1]] as [string, string]
}))));
export function localConversation(pair: readonly [ResidentId, ResidentId], rounds: number, variant: number): Omit<ResidentLine, 'at'>[] {
  return Array.from({
    length: rounds
  }, (_, round) => {
    const i = (Math.abs(variant) + round) % VOICES[pair[0]].length;
    return [{
      speaker: pair[0],
      text: VOICES[pair[0]][i][0]
    }, {
      speaker: pair[1],
      text: VOICES[pair[1]][i][1]
    }];
  }).flat();
}
