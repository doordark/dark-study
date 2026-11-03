import { isResidentId, RESIDENTS, RESIDENT_IDS, type ResidentId } from './farmLife';
export const FARM_LOCATIONS = ['pond', 'farm', 'plaza', 'house', 'coop', 'bench', 'market'] as const;
export type FarmLocation = typeof FARM_LOCATIONS[number];
export type NpcAction = {
  type: 'fetch_water' | 'water_crops' | 'rest' | 'go_home';
} | {
  type: 'talk_to';
  target: ResidentId;
} | {
  type: 'visit';
  target: FarmLocation;
};
export function validateNpcAction(raw: unknown): NpcAction | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const v = raw as Record<string, unknown>;
  if (Object.keys(v).some(k => !['type', 'target'].includes(k))) return null;
  if (['fetch_water', 'water_crops', 'rest', 'go_home'].includes(v.type as string) && Object.keys(v).length === 1) return {
    type: v.type as 'fetch_water' | 'water_crops' | 'rest' | 'go_home'
  };
  if (v.type === 'talk_to' && isResidentId(v.target)) return {
    type: 'talk_to',
    target: v.target
  };
  if (v.type === 'visit' && FARM_LOCATIONS.includes(v.target as FarmLocation)) return {
    type: 'visit',
    target: v.target as FarmLocation
  };
  return null;
}
export function parseNpcReply(raw: string): {
  reply: string;
  action: NpcAction | null;
} | null {
  try {
    const v = JSON.parse(raw);
    if (!v || typeof v !== 'object' || Array.isArray(v) || Object.keys(v).some(k => !['reply', 'action'].includes(k)) || typeof v.reply !== 'string' || !v.reply.trim() || v.reply.length > 240 || !('action' in v)) return null;
    if (v.action === null || v.action?.type === 'none' && Object.keys(v.action).length === 1) return {
      reply: v.reply.trim(),
      action: null
    };
    const action = validateNpcAction(v.action);
    return action ? {
      reply: v.reply.trim(),
      action
    } : null;
  } catch {
    return null;
  }
}
/** Explicit local commands only. Never run this on malformed model output. */
export function localNpcCommand(text: string, who: ResidentId): NpcAction | null {
  if (/不要|不用|别|不需要/.test(text)) return null;
  if (/怎么|如何|如果|假如|要是|会.*吗/.test(text) && !/帮|请|麻烦/.test(text)) return null;
  if (/打[点些一壶]*水|取水|装[点些满]*水/.test(text)) return {
    type: 'fetch_water'
  };
  if (/浇[一下点些水地菜苗田]|帮.*浇/.test(text)) return {
    type: 'water_crops'
  };
  if (/找.*聊|和.*聊|跟.*说/.test(text)) {
    const target = RESIDENT_IDS.find(id => id !== who && (text.includes(RESIDENTS[id].name) || text.includes(id)));
    if (target) return {
      type: 'talk_to',
      target
    };
  }
  if (/回家|回屋|回小屋|回鸡窝/.test(text)) return {
    type: 'go_home'
  };
  if (/休息|歇[会一]/.test(text)) return {
    type: 'rest'
  };
  if (/去|到|逛|看看/.test(text)) {
    for (const [word, target] of [['池塘', 'pond'], ['池边', 'pond'], ['田边', 'farm'], ['农田', 'farm'], ['广场', 'plaza'], ['小屋', 'house'], ['鸡窝', 'coop'], ['长椅', 'bench'], ['小铺', 'market'], ['集市', 'market']] as const) if (text.includes(word)) return {
      type: 'visit',
      target
    };
  }
  return null;
}
export const NPC_ACTION_SCHEMA = '严格 JSON：{"reply":"自然的中文回答，最多100字","action":null}。明确要求做事时 action 只能是 {"type":"fetch_water"}、{"type":"water_crops"}、{"type":"talk_to","target":"door|gu|xiaoba|yujie|weigang|chicken中的一个"}、{"type":"visit","target":"pond|farm|plaza|house|coop|bench|market中的一个"}、{"type":"rest"}、{"type":"go_home"}。普通聊天或提问 action=null；不要把引用、否定或假设当作命令。不能修改金币、库存、种子、奖励或升级，不能保证任务必然成功，游戏会校验并执行。不得增加其他字段。';
