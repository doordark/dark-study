import { FARM_TOPICS, RESIDENTS, isResidentId, type FarmTopicId, type ResidentConversation, type ResidentId } from './farmLife';

export const RESIDENT_PROJECTS = {
  door: { goal: '做一个家人都能上手的小工具', tension: '想把问题想透，却容易让家人等得太久。', location: 'bench', activity: '在长椅上把工具的第一步想清楚', result: '坐下来后，我想通了：先把最常用的一步做简单。' },
  gu: { goal: '试出忙起来也能照料的一小块菜地', tension: '想把家里照顾好，也希望大家主动搭把手。', location: 'farm', activity: '到田边看看哪一垄最方便照料', result: '田边看过了。我想先从最顺手的一垄试起。' },
  xiaoba: { goal: '给家人做一张有隐藏路线的游戏地图', tension: '想给别人看自己的点子，又怕好不容易做出来却没人想玩。', location: 'plaza', activity: '在广场比划游戏地图的两条入口', result: '我在广场比划了一下。入口近一点，岔路藏深一点。' },
  yujie: { goal: '把一首歌唱得敢让家里人听', tension: '很在意别人有没有听懂他的心意，又习惯先用玩笑遮过去。', location: 'bench', activity: '找个安静地方在心里过一遍副歌', result: '副歌我顺了一遍。先记住换气的地方，下次再唱给你们听。' },
  weigang: { goal: '弄明白池边不同位置该等多久再换竿', tension: '喜欢把事情算明白，但也想学会在没有把握时先试一次。', location: 'pond', activity: '去池边观察水面，挑两个以后可比较的钓位', result: '我在池边挑好了两个钓位。下回让两边等同样久。' },
  chicken: { goal: '找到一个能安心等家人回来的地方', tension: '好奇陌生声音，又怕离鸡窝太远。', location: 'coop', activity: '回小窝附近听一听家人的脚步', result: '咕，这里听得见家人走路，我待着就不慌啦。' },
} as const;

export type ResidentIntent =
  | { actor: ResidentId; type: 'project' | 'rest' }
  | { actor: ResidentId; type: 'ask'; target: ResidentId; topic: FarmTopicId };

export function readResidentIntent(raw: unknown, participants: readonly ResidentId[]): ResidentIntent | undefined {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return;
  const { actor, type, target, topic, ...extra } = raw as Record<string, unknown>;
  if (Object.keys(extra).length || !isResidentId(actor) || !participants.includes(actor)) return;
  if ((type === 'project' || type === 'rest') && target === undefined && topic === undefined) return { actor, type };
  if (type === 'ask' && isResidentId(target) && !participants.includes(target) &&
      typeof topic === 'string' && Object.hasOwn(FARM_TOPICS, topic)) return { actor, type, target, topic: topic as FarmTopicId };
}

export function readResidentBatchIntent(raw: string, participants: readonly ResidentId[]): ResidentIntent | undefined {
  try {
    return readResidentIntent(JSON.parse(raw)?.next, participants);
  } catch {
    return undefined;
  }
}

/** Facts only. The model never sees prior player questions or private transcripts here. */
export function residentReflections(history: readonly ResidentConversation[], actor: ResidentId): string[] {
  const notes = new Set<string>();
  for (let index = history.length - 1; index >= 0 && notes.size < 3; index--) {
    const record = history[index];
    if (record.source === 'player_command' || record.endedAt === null || !record.participants.includes(actor) || !record.lines.length) continue;
    if (record.activity === 'project') {
      notes.add('最近抽空做过自己的小目标：' + RESIDENT_PROJECTS[actor].activity + '。');
    } else {
      const topic = record.discussion?.topic ?? record.sharedTopic?.topic;
      const peers = record.participants.filter(id => id !== actor).map(id => RESIDENTS[id].name).join('、');
      if (topic && peers) notes.add('曾和' + peers + '聊过' + FARM_TOPICS[topic].label + '。');
    }
  }
  return [...notes];
}
