import { FARM_TOPICS, RESIDENTS, isResidentId, type FarmTopicId, type ResidentConversation, type ResidentId } from './farmLife';
import type { ResidentMemory } from './farmMemory';
import { formatPersonaMemoryBlock } from './farmPersonaMemory';

export const RESIDENT_PROJECTS = {
  door: { goal: '有空给家里鼓捣个省事的小点子', tension: '偶尔太较真，容易忘了先歇会儿。', location: 'bench', activity: '在长椅上吹吹风理理思路', result: '吹完风想通了，先把最顺手的那步弄好就行。' },
  gu: { goal: '把院子打理得既省力又漂亮', tension: '啥都爱操心，偶尔也想偷会儿懒。', location: 'farm', activity: '去田边转一圈看看苗的长势', result: '田边看完了，长势挺好，回头轻松不少。' },
  xiaoba: { goal: '攒点有意思的小脑洞慢慢折腾', tension: '平时话少，不太好意思主动显摆。', location: 'plaza', activity: '去广场透透气顺便想想点子', result: '在广场溜达了一圈，心里大概有谱了。' },
  yujie: { goal: '找机会露一手让家里人夸两句', tension: '有点傲娇，嘴上说无所谓其实挺在意评价。', location: 'bench', activity: '找个清静角落哼两句顺顺心情', result: '哼完舒服多了，改天心情好再露一手。' },
  weigang: { goal: '在院子里逛逛放松下顺便找点乐子', tension: '生人面前微慢热，熟了其实挺实在话多。', location: 'pond', activity: '去池边吹吹风发会儿呆', result: '池边风挺凉快的，发完呆整个人松快不少。' },
  chicken: { goal: '在院子里找块最暖和的晒太阳宝地', tension: '既爱凑热闹，又怕突然的大动静。', location: 'coop', activity: '回小窝附近听听家里人的动静', result: '咕，这里听得见大家说话，晒太阳最安心啦！' },
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
      notes.add('最近抽空做过自己的日常小事：' + RESIDENT_PROJECTS[actor].activity + '。');
    } else {
      const topic = record.discussion?.topic ?? record.sharedTopic?.topic;
      const peers = record.participants.filter(id => id !== actor).map(id => RESIDENTS[id].name).join('、');
      if (topic && peers) notes.add('曾和' + peers + '聊过' + FARM_TOPICS[topic].label + '。');
    }
  }
  return [...notes];
}

/** 融合人格记忆流、同伴印象与近期日常经历，供对话与群聊使用。 */
export function residentRichContext(
  actor: ResidentId,
  memory: ResidentMemory | undefined,
  history: readonly ResidentConversation[],
  options: { query: string; peers: readonly string[]; at: number; includePrivate: boolean; includePlayerTurns?: boolean; maxEpisodes?: number },
): string {
  const parts: string[] = [];
  if (memory) {
    const block = formatPersonaMemoryBlock(actor, memory, options);
    if (block) parts.push(block);
  }
  const reflections = residentReflections(history, actor);
  if (reflections.length && !parts.some(p => p.includes('相关记忆片段'))) {
    parts.push('近期日常：' + reflections.join(''));
  }
  return parts.join('\n');
}
