import { RESIDENT_PLACEMENTS, WAYPOINTS, type FarmPoint, type WaypointId } from '@/constants/farmMap';
import { farmSegmentClear, nearestFarmWaypoint, safeFarmPoint, waypointFarmRoute } from './farmNavigation';
import { DEFAULT_LIFE, RESIDENT_IDS, localConversation, normalizeLifeSettings, type LifeSettings, type ResidentId, type ResidentConversation, type ResidentLine } from './farmLife';
import { validateNpcAction, type NpcAction, type FarmLocation } from './farmActions';
export type ResidentState = 'idle' | 'wandering' | 'walking' | 'talking' | 'working' | 'going_home';
export interface ResidentMotion {
  id: number;
  from: FarmPoint;
  points: FarmPoint[];
  startedAt: number;
  speed: number;
}
export interface ResidentTask {
  id: string;
  action: NpcAction;
  createdAt: number;
  expiresAt: number;
  phase: 'walking' | 'working' | 'awaiting' | 'reserved' | 'conversation';
  workUntil: number;
}
export interface ResidentModel {
  id: ResidentId;
  logicalPosition: FarmPoint;
  currentWaypoint: WaypointId;
  targetWaypoint: WaypointId | null;
  state: ResidentState;
  task: ResidentTask | null;
  conversationPartner: ResidentId | null;
  lastInteractionAt: number;
  lastConversationAt: number;
  nextDecisionAt: number;
  motion: ResidentMotion | null;
  face: 1 | -1;
  bubble: {
    text: string;
    until: number;
  } | null;
  destination: FarmPoint | null;
}
export type ResidentEffect = {
  type: 'work';
  id: string;
  actor: ResidentId;
  action: NpcAction;
} | {
  type: 'conversation';
  id: string;
  pair: [ResidentId, ResidentId];
  rounds: number;
  source: ResidentConversation['source'];
};
interface PlayingConversation {
  record: ResidentConversation;
  planned: Omit<ResidentLine, 'at'>[];
  index: number;
  nextAt: number;
  waiting: boolean;
  deadline: number;
}
export const LOCATION_WAYPOINTS: Record<FarmLocation, WaypointId> = {
  pond: 'pond',
  farm: 'farmCenter',
  plaza: 'plaza',
  house: 'houseDoor',
  coop: 'coop',
  bench: 'pondBench',
  market: 'marketDoor'
};
const PREFERENCES: Record<ResidentId, WaypointId[]> = {
  gu: ['farmLeft', 'farmCenter', 'pond', 'houseDoor', 'plaza'],
  door: ['houseDoor', 'farmLeft', 'pondBench', 'marketDoor'],
  chicken: ['coop', 'farmRight', 'farmCenter', 'plaza'],
  xiaoba: ['plaza', 'pondBench', 'farmLeft', 'houseDoor'],
  yujie: ['marketDoor', 'plaza', 'pond', 'farmBottom'],
  weigang: ['plaza', 'pond', 'farmCenter', 'pondBench']
};
const distance = (a: FarmPoint, b: FarmPoint) => Math.hypot(a.x - b.x, a.y - b.y);
const pairKey = (a: ResidentId, b: ResidentId) => [a, b].sort().join(':');
export function motionPosition(m: ResidentMotion, at: number): {
  position: FarmPoint;
  done: boolean;
} {
  let remaining = Math.max(0, at - m.startedAt) / 1000 * m.speed;
  let previous = m.from;
  for (const point of m.points) {
    const length = distance(previous, point);
    if (remaining < length) return {
      position: {
        x: previous.x + (point.x - previous.x) * remaining / length,
        y: previous.y + (point.y - previous.y) * remaining / length
      },
      done: false
    };
    remaining -= length;
    previous = point;
  }
  return {
    position: {
      ...previous
    },
    done: true
  };
}
export function remainingResidentMotion(m: ResidentMotion, at: number) {
  let remaining = Math.max(0, at - m.startedAt) / 1000 * m.speed;
  let previous = m.from;
  for (let i = 0; i < m.points.length; i++) {
    const point = m.points[i],
      length = distance(previous, point);
    if (remaining < length) {
      const start = motionPosition(m, at).position;
      let cursor = start;
      return {
        start,
        steps: m.points.slice(i).map(p => {
          const duration = distance(cursor, p) / m.speed * 1000;
          cursor = p;
          return {
            point: p,
            duration
          };
        })
      };
    }
    remaining -= length;
    previous = point;
  }
  return {
    start: previous,
    steps: []
  };
}
/** Pure, centrally owned simulation. All timestamps are real foreground time. */
export class FarmResidentEngine {
  residents: Record<ResidentId, ResidentModel>;
  history: ResidentConversation[] = [];
  historyRevision = 0;
  private conversations = new Map<string, PlayingConversation>();
  private pairs = new Map<string, number>();
  private effects: ResidentEffect[] = [];
  private sequence = 0;
  private encounterAt = 0;
  private pausedAt: number | null = null;
  settings: LifeSettings = {
    ...DEFAULT_LIFE
  };
  constructor(at: number, private random: () => number = Math.random) {
    this.residents = Object.fromEntries(RESIDENT_IDS.map(id => {
      const p = {
        ...RESIDENT_PLACEMENTS[id].home
      };
      return [id, {
        id,
        logicalPosition: p,
        currentWaypoint: nearestFarmWaypoint(p),
        targetWaypoint: null,
        state: 'idle',
        task: null,
        conversationPartner: null,
        lastInteractionAt: 0,
        lastConversationAt: 0,
        nextDecisionAt: at + 1500 + this.random() * 5000,
        motion: null,
        face: 1,
        bubble: null,
        destination: null
      }];
    })) as Record<ResidentId, ResidentModel>;
  }
  snapshot() {
    return RESIDENT_IDS.map(id => ({
      ...this.residents[id],
      logicalPosition: {
        ...this.residents[id].logicalPosition
      },
      task: this.residents[id].task ? {
        ...this.residents[id].task!
      } : null
    }));
  }
  drainEffects() {
    const events = this.effects;
    this.effects = [];
    return events;
  }
  getConversation(id: string) {
    return this.conversations.get(id)?.record;
  }
  takeHistory() {
    return this.history.map(c => ({
      ...c,
      participants: [...c.participants],
      lines: c.lines.map(l => ({
        ...l
      }))
    })).slice(-40);
  }
  restoreHistory(history: ResidentConversation[]) {
    this.history = history;
    this.historyRevision++;
    for (const c of history) for (const id of c.participants) this.residents[id].lastConversationAt = Math.max(this.residents[id].lastConversationAt, c.endedAt ?? c.startedAt);
  }
  suspendAutonomy(at: number) {
    this.advancePositions(at);
    for (const c of [...this.conversations.values()]) if (c.record.source !== 'player_command') this.finishConversation(c.record.id, at);
    for (const r of Object.values(this.residents)) if (!r.task) {
      r.motion = null;
      r.targetWaypoint = null;
      r.state = 'idle';
      r.nextDecisionAt = at + 3000;
    }
  }
  interact(who: ResidentId, at: number) {
    this.residents[who].lastInteractionAt = at;
    this.suspendAutonomy(at);
  }
  fallbackPending(at: number) {
    for (const c of this.conversations.values()) if (c.waiting) {
      c.waiting = false;
      c.nextAt = at + 200;
    }
  }
  configure(settings: LifeSettings, at: number) {
    this.settings = normalizeLifeSettings(settings);
    if (!this.settings.chatter) for (const c of [...this.conversations.values()]) if (c.record.source !== 'player_command') this.finishConversation(c.record.id, at);
  }
  pause(paused: boolean, at: number) {
    if (paused && this.pausedAt === null) {
      this.advancePositions(at);
      this.pausedAt = at;
      for (const c of [...this.conversations.values()]) this.finishConversation(c.record.id, at);
      for (const r of Object.values(this.residents)) r.motion = null;
      this.effects = [];
    } else if (!paused && this.pausedAt !== null) {
      const elapsed = Math.max(0, at - this.pausedAt);
      this.pausedAt = null;
      this.encounterAt = at;
      for (const r of Object.values(this.residents)) {
        r.nextDecisionAt = at + 1500 + this.random() * 3000;
        if (r.task) {
          r.task = {
            ...r.task,
            expiresAt: r.task.expiresAt + elapsed,
            workUntil: r.task.workUntil + elapsed
          };
          if (r.task.phase === 'walking' && r.destination) this.move(r, r.destination, at, r.state);
        }
      }
    }
  }
  private move(r: ResidentModel, to: FarmPoint, at: number, state: ResidentState = 'walking') {
    const points = waypointFarmRoute(r.logicalPosition, to);
    r.destination = safeFarmPoint(to);
    r.targetWaypoint = nearestFarmWaypoint(safeFarmPoint(to));
    if (!points.length) {
      if (distance(r.logicalPosition, safeFarmPoint(to)) > .1) {
        this.cancelTask(r, at);
        r.nextDecisionAt = at + 5000;
        this.bubble(r, '这边暂时走不过去，换条路再试吧。', at);
        return;
      }
      r.motion = null;
      this.arrive(r, at);
      return;
    }
    r.face = points[0].x >= r.logicalPosition.x ? 1 : -1;
    r.state = state;
    r.motion = {
      id: ++this.sequence,
      from: {
        ...r.logicalPosition
      },
      points,
      startedAt: at,
      speed: r.id === 'chicken' ? 17 : 22
    };
  }
  private arrive(r: ResidentModel, at: number) {
    r.motion = null;
    r.destination = null;
    if (r.targetWaypoint) r.currentWaypoint = r.targetWaypoint;
    r.targetWaypoint = null;
    if (r.task && r.task.action.type !== 'talk_to') {
      r.task = {
        ...r.task,
        phase: 'working',
        workUntil: at + (r.task.action.type === 'visit' ? 6000 : r.task.action.type === 'rest' || r.task.action.type === 'go_home' ? 8000 : 1600)
      };
      r.state = 'working';
    } else {
      r.state = 'idle';
      r.nextDecisionAt = at + this.settings.activitySeconds * 1000;
    }
  }
  private advancePositions(at: number) {
    for (const r of Object.values(this.residents)) if (r.motion) {
      const step = motionPosition(r.motion, at);
      r.logicalPosition = step.position;
      if (step.done) this.arrive(r, at);
    }
  }
  private cancelTask(r: ResidentModel, at: number) {
    if (r.conversationPartner) {
      const partner = this.residents[r.conversationPartner];
      const conversation = [...this.conversations.values()].find(c => c.record.participants.includes(r.id));
      if (conversation) this.finishConversation(conversation.record.id, at);
      if (partner.task?.id === r.task?.id) {
        partner.task = null;
        partner.conversationPartner = null;
        partner.state = 'idle';
        partner.motion = null;
      }
    }
    r.task = null;
    r.conversationPartner = null;
    r.motion = null;
    r.state = 'idle';
    r.targetWaypoint = null;
    r.destination = null;
  }
  private bubble(r: ResidentModel, text: string, at: number) {
    r.bubble = {
      text: text.slice(0, 80),
      until: at + 5000
    };
  }
  command(who: ResidentId, raw: unknown, at: number): {
    ok: boolean;
    message: string;
    id?: string;
  } {
    const action = validateNpcAction(raw);
    if (!action) return {
      ok: false,
      message: '这件事暂时还不会做。'
    };
    if (this.pausedAt !== null) return {
      ok: false,
      message: '先回到农场，再安排这件事吧。'
    };
    const r = this.residents[who];
    this.advancePositions(at);
    if (action.type === 'talk_to') {
      if (action.target === who) return {
        ok: false,
        message: '不能让自己去找自己聊天。'
      };
      const target = this.residents[action.target];
      if (target.task) return {
        ok: false,
        message: '他正在忙另一项任务，等结束后再试吧。'
      };
      if (target.conversationPartner) this.cancelTask(target, at);
    }
    this.cancelTask(r, at);
    const id = `command-${at}-${++this.sequence}`;
    r.task = {
      id,
      action,
      createdAt: at,
      expiresAt: at + 90000,
      phase: 'walking',
      workUntil: 0
    };
    r.lastInteractionAt = at;
    if (action.type === 'talk_to') {
      const target = this.residents[action.target];
      this.advancePositions(at);
      target.motion = null;
      target.state = 'idle';
      target.targetWaypoint = null;
      target.conversationPartner = who;
      target.task = {
        ...r.task,
        action: {
          type: 'talk_to',
          target: who
        },
        phase: 'reserved'
      };
      r.conversationPartner = target.id;
      const approach = safeFarmPoint({
        x: target.logicalPosition.x + (target.logicalPosition.x > 100 ? -16 : 16),
        y: target.logicalPosition.y
      });
      this.move(r, approach, at);
    } else if (action.type === 'rest') {
      r.task = {
        ...r.task,
        phase: 'working',
        workUntil: at + 8000
      };
      r.state = 'working';
    } else {
      const destination: WaypointId = action.type === 'fetch_water' ? 'pond' : action.type === 'water_crops' ? 'farmCenter' : action.type === 'go_home' ? who === 'chicken' ? 'coop' : 'houseDoor' : action.type === 'visit' ? LOCATION_WAYPOINTS[action.target] : 'plaza';
      this.move(r, WAYPOINTS[destination], at, action.type === 'go_home' ? 'going_home' : 'walking');
    }
    if (!r.task) return { ok: false, message: '这边暂时走不过去，换个地方再试吧。' };
    this.bubble(r, '好，交给我。', at);
    return {
      ok: true,
      message: '任务已安排，会先走到对应地点。',
      id
    };
  }
  private startConversation(pair: [ResidentId, ResidentId], source: ResidentConversation['source'], at: number) {
    const id = `conversation-${at}-${++this.sequence}`;
    const planned = localConversation(pair, this.settings.rounds, this.sequence);
    const record: ResidentConversation = {
      id,
      participants: pair,
      startedAt: at,
      endedAt: null,
      source,
      online: false,
      lines: []
    };
    const waiting = this.settings.online && this.settings.aiRatio > 0 && this.random() * 100 < this.settings.aiRatio;
    this.conversations.set(id, {
      record,
      planned,
      index: 0,
      nextAt: at + 500,
      waiting,
      deadline: at + 15000
    });
    this.history = [...this.history, record].slice(-40);
    this.historyRevision++;
    const [a, b] = pair.map(p => this.residents[p]);
    for (const [r, other] of [[a, b], [b, a]]) {
      r.motion = null;
      r.targetWaypoint = null;
      r.state = 'talking';
      r.conversationPartner = other.id;
      r.face = other.logicalPosition.x >= r.logicalPosition.x ? 1 : -1;
      r.lastConversationAt = at;
      if (r.task) r.task = {
        ...r.task,
        phase: 'conversation'
      };
    }
    this.pairs.set(pairKey(...pair), at);
    if (waiting) this.effects.push({
      type: 'conversation',
      id,
      pair,
      rounds: this.settings.rounds,
      source
    });
    return id;
  }
  supplyConversation(id: string, lines: Omit<ResidentLine, 'at'>[] | null, online: boolean, at: number) {
    const c = this.conversations.get(id);
    if (!c || !c.waiting) return false;
    if (lines && lines.length === c.planned.length && lines.every((l, i) => l.speaker === c.record.participants[i % 2] && l.text.trim() && l.text.length <= 44)) {
      c.planned = lines;
      c.record.online = online;
    }
    c.waiting = false;
    c.nextAt = at + 200;
    return true;
  }
  private finishConversation(id: string, at: number) {
    const c = this.conversations.get(id);
    if (!c) return;
    c.record.endedAt = at;
    this.historyRevision++;
    for (const who of c.record.participants) {
      const r = this.residents[who];
      r.conversationPartner = null;
      r.state = 'idle';
      r.motion = null;
      r.lastConversationAt = at;
      r.nextDecisionAt = at + 3000 + this.random() * 5000;
      if (r.task?.phase === 'conversation') r.task = null;
    }
    this.pairs.set(pairKey(c.record.participants[0], c.record.participants[1]), at);
    this.conversations.delete(id);
  }
  canCompleteWork(id: string, actor: ResidentId) {
    return this.pausedAt === null && this.residents[actor].task?.id === id && this.residents[actor].task?.phase === 'awaiting';
  }
  completeWork(id: string, actor: ResidentId, message: string, at: number) {
    if (!this.canCompleteWork(id, actor)) return false;
    const r = this.residents[actor];
    const startedAt = r.task?.createdAt ?? at;
    r.task = null;
    r.state = 'idle';
    r.nextDecisionAt = at + 5000;
    r.lastInteractionAt = at;
    this.bubble(r, message, at);
    this.history = [...this.history, {
      id,
      participants: [actor],
      startedAt,
      endedAt: at,
      source: 'player_command' as const,
      online: false,
      lines: [{
        speaker: actor,
        text: message.slice(0, 80),
        at
      }]
    }].slice(-40);
    this.historyRevision++;
    return true;
  }
  private chooseDestination(r: ResidentModel, night: boolean): WaypointId {
    const choices = (Object.keys(WAYPOINTS) as WaypointId[]).filter(id => id !== r.currentWaypoint);
    const weights = choices.map(id => (PREFERENCES[r.id].includes(id) ? 5 : 1) * (night && (id === 'houseDoor' || r.id === 'chicken' && id === 'coop') ? 5 : 1) / (1 + distance(r.logicalPosition, WAYPOINTS[id]) / 80));
    let choice = this.random() * weights.reduce((a, b) => a + b, 0);
    for (let i = 0; i < choices.length; i++) {
      choice -= weights[i];
      if (choice <= 0) return choices[i];
    }
    return choices[0];
  }
  tick(at: number, {
    autonomous = true,
    night = false,
    reducedMotion = false
  }: {
    autonomous?: boolean;
    night?: boolean;
    reducedMotion?: boolean;
  } = {}) {
    if (this.pausedAt !== null) return;
    this.advancePositions(at);
    for (const c of [...this.conversations.values()]) {
      if (c.waiting) {
        if (at >= c.deadline) {
          c.waiting = false;
          c.nextAt = at;
        } else continue;
      }
      if (at < c.nextAt) continue;
      if (c.index >= c.planned.length) {
        this.finishConversation(c.record.id, at);
        continue;
      }
      const line = {
        ...c.planned[c.index++],
        at
      };
      c.record.lines.push(line);
      this.historyRevision++;
      this.bubble(this.residents[line.speaker], line.text, at);
      c.nextAt = at + Math.max(2200, line.text.length * 95);
    }
    for (const r of Object.values(this.residents)) {
      if (r.bubble && r.bubble.until <= at) r.bubble = null;
      const task = r.task;
      if (task) {
        if (at >= task.expiresAt) {
          this.cancelTask(r, at);
          this.bubble(r, '这次没能完成，稍后再试吧。', at);
          continue;
        }
        if (task.action.type === 'talk_to' && task.phase !== 'reserved' && task.phase !== 'conversation' && !r.motion) {
          const target = this.residents[task.action.target];
          if (target.task?.id === task.id && distance(r.logicalPosition, target.logicalPosition) < 24 && farmSegmentClear(r.logicalPosition, target.logicalPosition)) this.startConversation([r.id, target.id], 'player_command', at);else {
            this.cancelTask(r, at);
            this.bubble(r, '现在靠近不了他，换个地方再试吧。', at);
          }
          continue;
        }
        if (task.phase === 'working' && at >= task.workUntil) {
          r.task = {
            ...task,
            phase: 'awaiting'
          };
          if (task.action.type === 'fetch_water' || task.action.type === 'water_crops') this.effects.push({
            type: 'work',
            id: task.id,
            actor: r.id,
            action: task.action
          });else this.completeWork(task.id, r.id, task.action.type === 'go_home' ? '到家了，我在这里歇一会。' : task.action.type === 'rest' ? '休息好了，继续慢慢来。' : '已经到了，这里真舒服。', at);
        }
        continue;
      }
      if (!autonomous || r.conversationPartner) continue;
      if (!this.settings.roaming && r.motion) {
        r.motion = null;
        r.targetWaypoint = null;
        r.state = 'idle';
      }
      if (this.settings.roaming && !reducedMotion && !r.motion && at >= r.nextDecisionAt) {
        r.nextDecisionAt = at + this.settings.activitySeconds * 1000;
        if (!night || this.random() * 100 < this.settings.nightActivity) this.move(r, WAYPOINTS[this.chooseDestination(r, night)], at, 'wandering');
      }
    }
    if (!autonomous || !this.settings.chatter || at - this.encounterAt < 2000) return;
    this.encounterAt = at;
    for (let i = 0; i < RESIDENT_IDS.length; i++) for (let j = i + 1; j < RESIDENT_IDS.length; j++) {
      const a = this.residents[RESIDENT_IDS[i]],
        b = this.residents[RESIDENT_IDS[j]];
      if (a.task || b.task || a.conversationPartner || b.conversationPartner) continue;
      if (at - Math.max(a.lastInteractionAt, b.lastInteractionAt) < 10000) continue;
      if (at - Math.max(a.lastConversationAt, b.lastConversationAt, this.pairs.get(pairKey(a.id, b.id)) ?? 0) < this.settings.conversationCooldown * 1000) continue;
      if (distance(a.logicalPosition, b.logicalPosition) > 22 || !farmSegmentClear(a.logicalPosition, b.logicalPosition)) continue;
      if (this.random() * 100 >= this.settings.encounterChance * (night ? this.settings.nightActivity / 100 : 1)) continue;
      this.startConversation([a.id, b.id], 'encounter', at);
    }
  }
}
