import { approachSpotForTarget, conversationSpots, freeResidentSpot, gatheringSpots } from './farmResidentSpace';
import { RESIDENT_PLACEMENTS, WAYPOINTS, type FarmPoint, type WaypointId } from '@/constants/farmMap';
import { farmSegmentClear, nearestFarmWaypoint, safeFarmPoint, waypointFarmRoute } from './farmNavigation';
import { DEFAULT_LIFE, LONG_TALK_MAX, RESIDENTS, RESIDENT_IDS, TALK_BATCH_ROUNDS, lifeDate, localConversation, normalizeLifeSettings, sharedTopicExchange, type FarmTopicId, type SharedFarmTopic, type LifeSettings, type ResidentId, type ResidentConversation, type ResidentLine } from './farmLife';
import { validateNpcAction, type NpcAction, type FarmLocation } from './farmActions';
import { discussionBatchFits, discussionLines, requestBatchOnTopic, type FarmDiscussion, type ResidentMood } from './farmDiscussion';
import { publicFarmTopic } from './farmMemory';
import { ambientConversation } from './farmAmbientTalk';
import { RESIDENT_PROJECTS, readResidentIntent, type ResidentIntent } from './farmAgency';
import { formatRequestReport, readRequestReport, type RequestReport } from './farmRequestReport';
import { readConversationMemoryNote, type NpcConversationMemoryNote } from './farmPersonaMemory';
import {
  pickAutonomousDutyAction,
  pickResidentThought,
  residentCurrentSchedule,
  type FarmNeedsSnapshot,
  type FarmWeather,
  type ResidentDuty,
  type TownEvent,
} from './farmTown';
import { pickNearbyDecorComment, type DecorId } from './farmDecor';
import type { NightSoloEvent } from './farmSleep';
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
  discussion?: FarmDiscussion;
  checkpoint?: ResidentConversation;
  activity?: 'project' | 'rest';
  autoDuty?: ResidentDuty;
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
  conversationSize: number;
  mood: ResidentMood;
  moodUntil: number;
  lastInteractionAt: number;
  lastConversationAt: number;
  nextDecisionAt: number;
  motion: ResidentMotion | null;
  face: 1 | -1;
  bubble: {
    text: string;
    until: number;
    createdAt?: number;
    kind?: 'speech' | 'thought';
  } | null;
  currentActivity?: string;
  destination: FarmPoint | null;
}
export interface AutoWorkEvent {
  id: string;
  actor: ResidentId;
  duty: ResidentDuty;
  at: number;
}
export type ResidentEffect = {
  type: 'work';
  id: string;
  actor: ResidentId;
  action: NpcAction;
} | {
  type: 'conversation';
  id: string;
  pair: ResidentId[];
  discussion?: FarmDiscussion;
  moods: ResidentMood[];
  rounds: number;
  source: ResidentConversation['source'];
  natural: boolean;
  finalBatch: boolean;
  sharedTopic?: SharedFarmTopic;
  opening?: string;
  townEvent?: { title: string; detail: string; teller?: ResidentId };
};
export interface ResidentMemoryEvent {
  record: ResidentConversation;
  aiMemory?: NpcConversationMemoryNote;
  at: number;
}
interface PlayingConversation {
  record: ResidentConversation;
  planned: Omit<ResidentLine, 'at'>[];
  index: number;
  nextAt: number;
  waiting: boolean;
  deadline: number;
  arranging: boolean;
  network: boolean;
  batchEnd: number;
  natural: boolean;
  sharedTopic?: SharedFarmTopic;
  next?: ResidentIntent;
  requestReport?: RequestReport;
  aiMemory?: NpcConversationMemoryNote;
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
const WALK_SPEEDS: Record<ResidentId, number> = {
  door: 21,
  gu: 21.5,
  xiaoba: 21.5,
  yujie: 23.5,
  weigang: 22.5,
  chicken: 16.5,
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
  private placedDecor: DecorId[] = [];
  private sleepingResidents = new Set<ResidentId>();
  private sleepDeprived = false;
  private nightSoloEvent: NightSoloEvent | null = null;
  private lastWeatherKey = '';
  private currentWeather: FarmWeather = 'clear';
  private currentRainbow = false;
  historyRevision = 0;
  private conversations = new Map<string, PlayingConversation>();
  private activities = new Map<ResidentId, { type: 'project' | 'rest'; at: number }>();
  private projectDays = new Map<ResidentId, string>();
  private followups = new Map<ResidentId, { target: ResidentId; discussion: FarmDiscussion; at: number }>();
  private publicTopics: Partial<Record<ResidentId, FarmTopicId[]>> = {};
  private pairs = new Map<string, number>();
  private effects: ResidentEffect[] = [];
  private memoryEvents: ResidentMemoryEvent[] = [];
  private autoWorkEvents: AutoWorkEvent[] = [];
  private townDuties: Partial<Record<ResidentId, ResidentDuty>> = {};
  private townEvents: TownEvent[] = [];
  private residentAffinities: Partial<Record<ResidentId, number>> = {};
  private residentEpisodes: Partial<Record<ResidentId, { text: string; privacy: string }[]>> = {};
  private lastAutoWorkAt = new Map<ResidentId, number>();
  private lastThoughtAt = new Map<ResidentId, number>();
  private sequence = 0;
  private encounterAt = 0;
  private night = false;
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
        conversationSize: 0,
        mood: '平静',
        moodUntil: 0,
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
  setPublicTopics(topics: Record<ResidentId, FarmTopicId[]>) {
    this.publicTopics = topics;
  }
  setTownContext(context: {
    duties?: Partial<Record<ResidentId, ResidentDuty>>;
    events?: TownEvent[];
    affinities?: Partial<Record<ResidentId, number>>;
    episodes?: Partial<Record<ResidentId, { text: string; privacy: string }[]>>;
    placedDecor?: DecorId[];
    sleepingResidents?: readonly ResidentId[];
    sleepDeprived?: boolean;
    nightSoloEvent?: NightSoloEvent | null;
  }) {
    if (context.duties) this.townDuties = context.duties;
    if (context.events) this.townEvents = context.events;
    if (context.affinities) this.residentAffinities = context.affinities;
    if (context.episodes) this.residentEpisodes = context.episodes;
    if (context.placedDecor) this.placedDecor = context.placedDecor;
    if (context.sleepingResidents !== undefined) this.sleepingResidents = new Set(context.sleepingResidents);
    if (context.sleepDeprived !== undefined) this.sleepDeprived = context.sleepDeprived;
    if (context.nightSoloEvent !== undefined) this.nightSoloEvent = context.nightSoloEvent;
  }
  drainAutoWorkEvents() {
    const events = this.autoWorkEvents;
    this.autoWorkEvents = [];
    return events;
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
  drainMemoryEvents() {
    const events = this.memoryEvents;
    this.memoryEvents = [];
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
    for (const record of history) {
      if (record.activity === 'project' && record.endedAt !== null && record.participants.length === 1) {
        this.projectDays.set(record.participants[0], lifeDate(record.endedAt));
      }
    }
    this.historyRevision++;
    for (const c of history) for (const id of c.participants) this.residents[id].lastConversationAt = Math.max(this.residents[id].lastConversationAt, c.endedAt ?? c.startedAt);
  }
  suspendAutonomy(at: number) {
    this.advancePositions(at);
    for (const r of Object.values(this.residents)) if (r.task?.activity) this.cancelTask(r, at);
    for (const c of [...this.conversations.values()]) if (c.record.source !== 'player_command') this.finishConversation(c.record.id, at);
    for (const r of Object.values(this.residents)) if (r.task?.discussion?.kind === 'followup') this.cancelTask(r, at);
    for (const r of Object.values(this.residents)) if (!r.task) {
      r.motion = null;
      r.targetWaypoint = null;
      r.state = 'idle';
      r.nextDecisionAt = at + 3000;
    }
  }
  /**
   * 玩家点开与某位居民 1v1 聊天：只暂停该居民自身，不粗暴打断远处其他家人的闲聊；
   * 并让该居民立即转头面向玩家。
   */
  interact(who: ResidentId, at: number, playerX?: number) {
    this.advancePositions(at);
    const r = this.residents[who];
    r.lastInteractionAt = at;
    if (r.task?.activity || r.task?.discussion?.kind === 'followup') {
      this.cancelTask(r, at);
    }
    const activeConv = [...this.conversations.values()].find(
      c => c.record.source !== 'player_command' && c.record.participants.includes(who),
    );
    if (activeConv) {
      this.finishConversation(activeConv.record.id, at);
    }
    if (!r.task) {
      r.motion = null;
      r.targetWaypoint = null;
      r.destination = null;
      r.state = 'idle';
      r.nextDecisionAt = at + 4000;
    }
    if (typeof playerX === 'number' && Number.isFinite(playerX)) {
      r.face = playerX >= r.logicalPosition.x ? 1 : -1;
    }
  }
  fallbackPending(at: number) {
    for (const c of this.conversations.values()) {
      if (!c.network && !c.waiting) continue;
      this.continueConversationLocally(c);
      c.record.localReason = '联网或自主聊天已关闭';
      this.historyRevision++;
      if (c.waiting) {
        c.waiting = false;
        c.nextAt = at + 200;
      }
    }
  }
  configure(settings: LifeSettings, at: number) {
    this.settings = normalizeLifeSettings(settings);
    if (!this.settings.roaming) {
      this.activities.clear();
      for (const resident of Object.values(this.residents)) if (resident.task?.activity) this.cancelTask(resident, at);
    }
    if (!this.settings.chatter) {
      this.followups.clear();
      for (const c of [...this.conversations.values()]) if (c.record.source !== 'player_command') this.finishConversation(c.record.id, at);
      for (const resident of Object.values(this.residents)) if (resident.task?.discussion?.kind === 'followup') this.cancelTask(resident, at);
    }
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
  private move(r: ResidentModel, to: FarmPoint, at: number, state: ResidentState = 'walking', direct = false) {
    if (!direct && !r.conversationPartner) {
      const others = Object.values(this.residents).filter(o => o.id !== r.id);
      const spot = freeResidentSpot(
        safeFarmPoint(to),
        others.flatMap(o => [o.logicalPosition, ...(o.destination ? [o.destination] : [])]),
        23,
        r.logicalPosition,
      );
      if (!spot) {
        if (r.task) { this.cancelTask(r, at); this.bubble(r, '这里有点挤，等空些再去吧。', at); }
        r.nextDecisionAt = at + 4000; return;
      }
      to = spot;
    }
    const points = direct && farmSegmentClear(r.logicalPosition, to) ? [to] : waypointFarmRoute(r.logicalPosition, to);
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
    const baseSpeed = WALK_SPEEDS[r.id] ?? 22;
    const speed = state === 'wandering' ? baseSpeed * 0.92 : r.task ? baseSpeed * 1.15 : baseSpeed;
    r.motion = {
      id: ++this.sequence,
      from: {
        ...r.logicalPosition
      },
      points,
      startedAt: at,
      speed
    };
  }
  private arrive(r: ResidentModel, at: number) {
    r.motion = null;
    r.destination = null;
    if (r.targetWaypoint) r.currentWaypoint = r.targetWaypoint;
    r.targetWaypoint = null;
    if (r.conversationPartner) { r.state = 'talking'; return; }
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
  private yieldUntil = new Map<ResidentId, number>();
  private advancePositions(at: number) {
    const actors = Object.values(this.residents);
    for (const r of actors) if (r.motion) {
      const step = motionPosition(r.motion, at);
      r.logicalPosition = step.position;
      if (step.done) this.arrive(r, at);
    }
    // Look ahead along two horizons (450ms & 900ms) with lateral sidestepping to prevent head-on crowding.
    for (const r of actors) if (r.motion && !r.conversationPartner && at >= (this.yieldUntil.get(r.id) ?? 0)) {
      const aheadNear = motionPosition(r.motion, at + 450).position;
      const aheadFar = motionPosition(r.motion, at + 900).position;
      const other = actors.find(o => {
        if (o.id === r.id || o.conversationPartner === r.id) return false;
        const oNear = o.motion ? motionPosition(o.motion, at + 450).position : o.logicalPosition;
        const oFar = o.motion ? motionPosition(o.motion, at + 900).position : o.logicalPosition;
        const close = distance(aheadNear, oNear) < 17 || distance(aheadFar, oFar) < 15;
        if (!close) return false;
        return !o.motion || (!r.task && !!o.task) || (!!r.task === !!o.task && actors.indexOf(o) < actors.indexOf(r));
      });
      if (other) {
        this.yieldUntil.set(r.id, at + 2200);
        const dx = aheadFar.x - r.logicalPosition.x;
        const dy = aheadFar.y - r.logicalPosition.y;
        const len = Math.hypot(dx, dy) || 1;
        // Prefer stepping laterally perpendicular to travel direction, away from the blocking resident
        const perpA = { x: aheadNear.x - (dy / len) * 14, y: aheadNear.y + (dx / len) * 14 };
        const perpB = { x: aheadNear.x + (dy / len) * 14, y: aheadNear.y - (dx / len) * 14 };
        const preferSide = distance(perpA, other.logicalPosition) >= distance(perpB, other.logicalPosition) ? perpA : perpB;
        const side = freeResidentSpot(aheadNear, actors.filter(o => o !== r).map(o => o.logicalPosition), 20, preferSide);
        const destination = r.destination;
        if (side && farmSegmentClear(r.logicalPosition, side) && distance(side, r.logicalPosition) > 3 && destination) {
          const rest = waypointFarmRoute(side, destination);
          if (rest.length) {
            r.motion = { ...r.motion, id: ++this.sequence, from: { ...r.logicalPosition }, points: [side, ...rest], startedAt: at };
            continue;
          }
        }
        const rest = remainingResidentMotion(r.motion, at);
        r.motion = { ...r.motion, id: ++this.sequence, from: rest.start, points: rest.steps.map(s => s.point), startedAt: at + 550 };
      }
    }
  }
  private recordInterruptedRequest(r: ResidentModel, at: number) {
    if (r.task?.discussion?.kind !== 'request' || r.task.phase === 'reserved' || r.task.phase === 'conversation') return;
    this.history = [...this.history, {
      id: r.task.id + '-interrupted', taskId: r.task.id, participants: [r.id, ...(r.task.action.type === 'talk_to' ? [r.task.action.target] : [])],
      discussion: r.task.discussion, startedAt: r.task.createdAt, endedAt: at, source: 'player_command' as const,
      online: r.task.checkpoint?.online ?? false, lines: r.task.checkpoint?.lines ?? [],
      ...(r.task.checkpoint ? { resumedFrom: r.task.checkpoint.id } : {}),
      requestOutcome: r.task.checkpoint?.lines.length
        ? '续办途中中断了，之前问到的内容还在，可以稍后继续。'
        : '这次带话途中中断了，还没有问到对方，不能当作已经办好。',
      requestStatus: 'interrupted' as const,
    }].slice(-40);
    this.historyRevision++;
  }
  private cancelTask(r: ResidentModel, at: number) {
    if (r.conversationPartner) {
      const partner = this.residents[r.conversationPartner];
      const conversation = [...this.conversations.values()].find(c => c.record.participants.includes(r.id));
      if (conversation) this.finishConversation(conversation.record.id, at);
      else if (r.task && partner.task?.id === r.task.id) {
        this.recordInterruptedRequest(partner, at);
        partner.task = null;
        partner.conversationPartner = null;
        partner.conversationSize = 0;
        partner.state = 'idle';
        partner.motion = null;
      }
    }
    this.recordInterruptedRequest(r, at);
    r.task = null;
    r.conversationPartner = null;
    r.conversationSize = 0;
    r.motion = null;
    r.state = 'idle';
    r.targetWaypoint = null;
    r.destination = null;
  }
  private bubble(r: ResidentModel, text: string, at: number, kind: 'speech' | 'thought' = 'speech') {
    r.bubble = {
      text: text.slice(0, 120),
      until: at + (kind === 'thought' ? 5400 : Math.max(4800, Math.min(8200, text.length * 90 + 1800))),
      createdAt: at,
      ...(kind === 'thought' ? { kind: 'thought' as const } : {}),
    };
  }
  cancelCommand(who: ResidentId, id: string, at: number) {
    if (this.residents[who].task?.id !== id) return false;
    this.cancelTask(this.residents[who], at);
    return true;
  }
  command(who: ResidentId, raw: unknown, at: number, checkpoint?: ResidentConversation): {
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
    if (checkpoint) {
      const valid = action.type === 'talk_to' && checkpoint.requestStatus === 'interrupted' &&
        checkpoint.participants[0] === who && checkpoint.participants[1] === action.target &&
        checkpoint.discussion?.kind === 'request' && checkpoint.discussion.question === action.purpose;
      if (!valid) return { ok: false, message: '这条委托缺少续办信息。' };
      if (r.task?.discussion?.kind === 'request') return { ok: false, message: '我正在办另一项委托，等这项办完再继续吧。' };
      if (this.history.some(record => record.resumedFrom === checkpoint.id)) return { ok: false, message: '这条委托已续办，请查看更新的记录。' };
    }
    if (action.type === 'discuss') {
      if (action.guests.includes(who)) return { ok: false, message: '主持讨论的人已经在名单里了。' };
      const topic = publicFarmTopic(action.question);
      const free = (id: ResidentId) => id !== who && !this.residents[id].task && !this.residents[id].conversationPartner;
      const guests = action.guests.length ? action.guests : this.discussionGuests(topic).filter(free).slice(0, 2);
      if (r.task || r.conversationPartner || !guests.length || !guests.every(free)) return { ok: false, message: '要一起讨论的人正在忙，等他们有空再试。' };
      const id = this.startConversation([who, ...guests], 'player_command', at, { kind: 'discussion', topic, question: action.question }, true);
      return id ? { ok: true, message: '我叫上家人去广场。你可以来旁听，聊完后也能在居民生活记录里看对白。', id }
        : { ok: false, message: '现在去广场的路不太好走，等一会儿再召集大家吧。' };
    }
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
      ...(action.type === 'talk_to' && action.purpose ? {
        discussion: { kind: 'request' as const, question: action.purpose, ...(action.intent ? { intent: action.intent } : {}) },
      } : {}),
      ...(checkpoint ? { checkpoint } : {}),
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
      const others = Object.values(this.residents)
        .filter(o => o.id !== who && o.id !== target.id)
        .flatMap(o => [o.logicalPosition, ...(o.destination ? [o.destination] : [])]);
      const approach = approachSpotForTarget(r.logicalPosition, target.logicalPosition, others) ?? safeFarmPoint({
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
  private discussionGuests(topic?: FarmTopicId): ResidentId[] {
    const expert: Record<FarmTopicId, ResidentId> = { games: 'xiaoba', fishing: 'weigang', music: 'yujie', books: 'yujie',
      math: 'weigang', tech: 'door', garden: 'gu', pets: 'chicken' };
    const preferred = topic ? expert[topic] : 'door';
    return [preferred, ...RESIDENT_IDS.filter(id => id !== preferred)];
  }
  private startConversation(participants: ResidentId[], source: ResidentConversation['source'], at: number, discussion?: FarmDiscussion, gather = false, automaticLocalReason?: string) {
    const [first, second] = participants;
    const pair: [ResidentId, ResidentId] = [first, second];
    const a = this.residents[first], b = this.residents[second];
    const occupied = Object.values(this.residents).filter(r => !participants.includes(r.id))
      .flatMap(r => [r.logicalPosition, ...(r.destination ? [r.destination] : [])]);
    let slots: FarmPoint[] | null = null;
    if (gather) {
      slots = gatheringSpots(WAYPOINTS.plaza, participants.map(pid => this.residents[pid].logicalPosition), occupied);
    } else if (participants.length === 2) {
      slots = conversationSpots(a.logicalPosition, b.logicalPosition, occupied);
    } else {
      const base = conversationSpots(a.logicalPosition, b.logicalPosition, occupied);
      if (base) {
        const extraSlots: FarmPoint[] = [...base];
        for (const pid of participants.slice(2)) {
          const anchor = safeFarmPoint({ x: (base[0].x + base[1].x) / 2, y: (base[0].y + base[1].y) / 2 });
          const spot = freeResidentSpot(anchor, [...occupied, ...extraSlots], participants.length >= 5 ? 19 : 22, this.residents[pid].logicalPosition);
          const origin = this.residents[pid].logicalPosition;
          if (!spot || (!farmSegmentClear(origin, spot) && !waypointFarmRoute(origin, spot).length)) break;
          extraSlots.push(spot);
        }
        slots = extraSlots;
      }
    }
    if (!slots || slots.length !== participants.length) {
      if (source !== 'encounter' && !gather) { this.cancelTask(a, at); this.bubble(a, '这里有点挤，换个空些的地方聊吧。', at); }
      return null;
    }
    const id = `conversation-${at}-${++this.sequence}`;
    const requested = discussion?.kind === 'request';
    const checkpoint = requested ? a.task?.checkpoint : undefined;
    const prefix: ResidentLine[] = [];
    for (const line of checkpoint?.lines ?? []) {
      if (prefix.length >= 24 || line.speaker !== pair[prefix.length % 2] || line.text === '这次带话还没有完成。') break;
      prefix.push(line);
    }
    const commissioned = discussion?.kind === 'discussion' && !!discussion.question;
    const natural = !requested && !commissioned && participants.length === 2 && this.settings.longTalks && this.settings.naturalTalks;
    const rounds = requested ? 3 : participants.length >= 3 ? (participants.length >= 5 ? 2 : 3) : natural ? LONG_TALK_MAX : Math.max(discussion?.kind === 'debate' ? 3 : 2, this.settings.rounds);
    const candidates = this.settings.shareTopics && participants.length === 2 && !discussion ? pair.flatMap(from => (this.publicTopics[from] ?? []).map(topic => ({ from, topic }))) : [];
    const candidate = candidates.find(({ from, topic }) => !this.history.some(record =>
      record.participants.includes(pair[0]) && record.participants.includes(pair[1]) &&
      record.sharedTopic?.from === from && record.sharedTopic.topic === topic
    ));
    const sharedTopic = candidate && this.random() < 0.35 ? candidate : undefined;
    const opener = sharedTopic ? sharedTopicExchange(pair, sharedTopic) : [];
    const pairHistory = this.history.filter(record => pair.every(id => record.participants.includes(id)));
    const local = discussion ? discussionLines(participants, discussion, pairHistory.length) : [];
    const reflective = !discussion && !opener.length && first === 'xiaoba' && !pairHistory.slice(-3).some(record => record.lines[0]?.text.includes('提不起劲')) && (a.mood === '低落' || a.mood === '平静' && this.random() < 0.25);
    if (reflective) { a.mood = '低落'; a.moodUntil = at + 90000; }
    const moodLines: Omit<ResidentLine, 'at'>[] = reflective ? [
      { speaker: first, text: '我今天有点提不起劲。能陪我坐一小会儿吗？' },
      { speaker: second, text: second === 'chicken' ? '咕，我就蹲你旁边。' : '好。我陪着你。你想说话的时候再说。' },
    ] : [];
    const optedIn = this.settings.online && (source === 'player_command' || this.settings.aiRatio >= 100 || this.settings.aiRatio > 0 && this.random() * 100 < this.settings.aiRatio);
    const network = optedIn && !automaticLocalReason;
    // Check if an active town rumor/event can organically spread in this encounter
    const activeTownEvent = source === 'encounter' && !discussion
      ? this.townEvents.find(ev => ev.expiresAt > at && participants.some(pid => ev.knownBy.includes(pid)) && participants.some(pid => !ev.knownBy.includes(pid)))
        ?? this.townEvents.find(ev => ev.expiresAt > at && participants.every(pid => ev.knownBy.includes(pid)) && this.random() < 0.4)
      : undefined;
    const rumorTeller = activeTownEvent ? participants.find(pid => activeTownEvent.knownBy.includes(pid)) : undefined;
    const rumorLines: Omit<ResidentLine, 'at'>[] = activeTownEvent && rumorTeller && participants.length === 2
      ? (() => {
          const listener = participants.find(pid => pid !== rumorTeller)!;
          const tellerPrefix = rumorTeller === 'chicken' ? '咕！' : '';
          const listenerPrefix = listener === 'chicken' ? '咕咕！' : '';
          return [
            { speaker: rumorTeller, text: `${tellerPrefix}你听说了吗？${activeTownEvent.title}！` },
            { speaker: listener, text: `${listenerPrefix}真的假的？快跟我说说怎么回事！` },
            { speaker: rumorTeller, text: `${tellerPrefix}${activeTownEvent.detail}` },
            { speaker: listener, text: `${listenerPrefix}这事可有意思了，待会儿遇到别人我也跟他们提一句。` },
          ];
        })()
      : [];
    const ambient = source === 'encounter' && participants.length === 2 && !discussion && !opener.length && !moodLines.length && !rumorLines.length
      ? ambientConversation(pair, this.history, a.currentWaypoint + ' ' + b.currentWaypoint, this.night, this.random(), this.currentWeather, this.currentRainbow) : [];
    const resumed = prefix.length > 0;
    const heardAnswer = prefix.some(line => line.speaker === second);
    const planned = resumed
      ? [...prefix, ...(network
        ? Array.from({ length: 2 }, (_, i) => ({ speaker: pair[(prefix.length + i) % 2], text: '' }))
        : heardAnswer ? [] : local.slice(prefix.length))]
      : commissioned || requested ? local
      : (rumorLines.length ? rumorLines : opener.length ? opener : moodLines.length ? moodLines : local.length ? local : ambient.length ? ambient : localConversation(pair, rounds, pairHistory.length)).slice(0, rounds * participants.length);
    if (network && !commissioned && !requested && planned.length < rounds * participants.length) {
      // Reserve streaming capacity only; these slots are never used as local dialogue.
      while (planned.length < rounds * participants.length) planned.push({ speaker: participants[planned.length % participants.length], text: "" });
    }
    const record: ResidentConversation = {
      id,
      participants,
      ...(discussion ? { discussion } : {}),
      ...(requested && a.task ? { taskId: a.task.id } : {}),
      ...(checkpoint ? { resumedFrom: checkpoint.id } : {}),
      startedAt: at,
      endedAt: null,
      source,
      online: resumed && checkpoint?.online === true,
      ...(network ? { aiPending: true } : {}),
      ...(!network ? { localReason: !this.settings.online ? '居民联网对话已关闭'
        : optedIn ? automaticLocalReason : this.settings.aiRatio === 0 ? '自动闲聊联网比例为 0%' : '本次未命中自动闲聊联网比例' } : {}),
      lines: prefix
    };
    const conversation: PlayingConversation = {
      record,
      planned,
      index: prefix.length,
      nextAt: at + 500,
      waiting: false,
      deadline: 0,
      arranging: true,
      network,
      // Online dialogue must start with a request, even if the local fallback
      // consists of just one mood exchange or a short shared-topic opener.
      batchEnd: network ? 0 : opener.length + moodLines.length,
      natural,
      sharedTopic,
    };
    this.conversations.set(id, conversation);
    this.history = [...this.history, record].slice(-40);
    this.historyRevision++;
    for (const [index, resident] of participants.entries()) {
      const r = this.residents[resident], other = this.residents[participants[(index + 1) % participants.length]];
      if (discussion) {
        r.mood = discussion.kind === 'debate' && index < 2 ? '不服气' : '好奇';
        r.moodUntil = at + 90000;
      }
      r.motion = null;
      r.targetWaypoint = null;
      r.state = 'talking';
      r.conversationPartner = other.id;
      r.conversationSize = participants.length;
      r.face = other.logicalPosition.x >= r.logicalPosition.x ? 1 : -1;
      r.lastConversationAt = at;
      if (r.task) r.task = {
        ...r.task,
        phase: 'conversation'
      };
    }
    participants.forEach((resident, index) => this.move(this.residents[resident], slots[index], at, 'walking', true));
    this.pairs.set(pairKey(...pair), at);
    if (network && !conversation.batchEnd) this.requestConversationBatch(conversation, at);
    return id;
  }
  private closeLocalTalk(pair: readonly ResidentId[], lines: Omit<ResidentLine, 'at'>[]) {
    lines.splice(-2, 2,
      { speaker: pair[0], text: pair[0] === 'chicken' ? '咕，聊了好久，我想回窝歇一会儿。' : '不知不觉聊了好久。咱们下次接着聊？' },
      { speaker: pair[1], text: pair[1] === 'chicken' ? '咕，好！我先回去晒晒翅膀。' : '好呀。下回见面再慢慢说。' });
  }
  private continueConversationLocally(c: PlayingConversation) {
    c.network = false;
    delete c.record.aiPending;
    if (c.record.discussion?.kind === 'request') {
      if (c.record.resumedFrom && c.record.lines.some(line => line.speaker === c.record.participants[1])) {
        c.planned.splice(c.index);
        return;
      }
      const local = discussionLines(c.record.participants, c.record.discussion);
      c.planned.splice(c.index, c.planned.length - c.index, ...local.slice(c.index));
      return;
    }
    if (c.record.lines.length) {
      // Preserve the conversation already spoken; never splice in an unrelated scene.
      c.planned.splice(c.index);
    } else {
      c.planned = c.planned.filter(line => line.text.trim());
    }
  }

  private requestConversationBatch(c: PlayingConversation, at: number) {
    const speakers = c.record.participants.length;
    // A commissioned meeting requests one complete discussion even when its offline answer is brief.
    const remaining = c.record.discussion?.kind === 'discussion' && c.record.discussion.question
      ? (speakers >= 5 ? 2 : 3) : (c.planned.length - c.index) / speakers;
    const rounds = Math.min(TALK_BATCH_ROUNDS, remaining);
    c.batchEnd = c.index + rounds * speakers;
    c.waiting = true;
    c.record.aiPending = true;
    this.historyRevision++;
    c.deadline = at + 26000;
    const pair = speakers === 2 && c.index % 2 ? [c.record.participants[1], c.record.participants[0]] : c.record.participants;
    const activeEvent = c.record.source === 'encounter' && !c.record.discussion
      ? this.townEvents.find(ev => ev.expiresAt > at && c.record.participants.some(pid => ev.knownBy.includes(pid)))
      : undefined;
    this.effects.push({
      type: 'conversation',
      id: c.record.id,
      pair,
      discussion: c.record.discussion,
      moods: pair.map(id => this.residents[id].mood),
      rounds,
      source: c.record.source,
      natural: c.natural,
      finalBatch: rounds === remaining,
      sharedTopic: c.sharedTopic,
      opening: c.record.source === 'encounter' && !c.record.discussion ? c.planned.slice(0, 2).map(line => RESIDENTS[line.speaker].name + '：' + line.text).join('\n') : undefined,
      ...(activeEvent ? { townEvent: { title: activeEvent.title, detail: activeEvent.detail, teller: c.record.participants.find(pid => activeEvent.knownBy.includes(pid)) } } : {}),
    });
  }
  supplyConversation(id: string, lines: Omit<ResidentLine, 'at'>[] | null, online: boolean, at: number, done = false, next?: ResidentIntent, localReason?: string, report?: unknown, aiMemory?: unknown) {
    const c = this.conversations.get(id);
    if (!c || !c.waiting) return false;
    const expected = c.batchEnd - c.index;
    const automaticShort = c.record.source !== 'player_command' && !c.natural && !!lines && lines.length < expected;
    const ending = automaticShort || c.natural && done || c.record.discussion?.kind === 'discussion' && !!c.record.discussion.question;
    const speakers = c.record.participants.length;
    const minLines = automaticShort ? speakers : Math.min(2 * speakers, expected);
    const flexibleMulti = speakers >= 3 && online;
    const repeatedOpening = lines && c.index === 0 && c.record.source === 'encounter' && this.history.filter(record => record.id !== id && c.record.participants.every(who => record.participants.includes(who))).slice(-3).some(record => record.lines[0]?.text === lines[0]?.text);
    const repeatedCheckpoint = c.record.resumedFrom && lines?.some(line => c.record.lines.some(previous => previous.speaker === line.speaker && previous.text === line.text));
    const question = c.record.discussion?.kind === 'discussion' ? c.record.discussion.question : undefined;
    const lengthOk = !!lines && (
      lines.length === expected ||
      (flexibleMulti && lines.length >= minLines && lines.length <= expected) ||
      (ending && lines.length >= minLines && lines.length < expected && lines.length % speakers === 0)
    );
    const minPerSpeaker = question ? (speakers >= 4 ? 1 : 2) : 1;
    if (lines && lengthOk && !repeatedOpening && !repeatedCheckpoint &&
        (!question || discussionBatchFits(question, lines)) &&
        (c.record.discussion?.kind !== 'request' || requestBatchOnTopic(c.record.discussion.question ?? '', [...c.record.lines, ...lines], c.record.participants[1], c.record.discussion.intent)) &&
        lines.every((line, index) => (flexibleMulti
          ? c.record.participants.includes(line.speaker) && (index === 0 || lines[index - 1].speaker !== line.speaker)
          : line.speaker === c.record.participants[(c.index + index) % speakers]) && line.text.trim() && line.text.length <= 240) &&
        c.record.participants.every(pid => lines.filter(line => line.speaker === pid).length >= minPerSpeaker)) {
      c.planned.splice(c.index, ending || flexibleMulti ? c.planned.length - c.index : expected, ...lines);
      c.record.online ||= online;
      if (online && c.record.discussion?.kind === 'request' && c.batchEnd >= c.planned.length) {
        c.requestReport = readRequestReport(report, [...c.record.lines, ...lines]);
      }
      if (online && aiMemory) {
        c.aiMemory = readConversationMemoryNote(aiMemory);
      }
      delete c.record.localReason;
      if (online && c.record.source === 'encounter' && (ending || c.batchEnd >= c.planned.length)) {
        c.next = readResidentIntent(next, c.record.participants);
      }
    } else {
      c.record.localReason = localReason ?? 'AI 回复格式或内容不符合本轮对话要求';
      this.continueConversationLocally(c);
    }
    c.waiting = false;
    delete c.record.aiPending;
    this.historyRevision++;
    c.nextAt = at + 200;
    return true;
  }
  private finishConversation(id: string, at: number, completed = false) {
    const c = this.conversations.get(id);
    if (!c) return;
    c.record.endedAt = at;
    if (c.record.aiPending) c.record.localReason = '对话在 AI 回复前被暂停或中断';
    delete c.record.aiPending;
    if (c.record.discussion?.kind === 'request') {
      const [actor, target] = c.record.participants;
      if (completed) {
        const report = formatRequestReport(actor, target, c.record.discussion.question ?? '',
          c.record.lines, c.record.online, c.requestReport, c.record.discussion.intent);
        c.record.requestOutcome = report.text;
        c.record.requestStatus = report.needsDetails ? 'unanswered' : 'answered';
      } else {
        c.record.requestOutcome = '刚才的带话还没完成，等下次问到答复，我再来告诉你。';
        c.record.requestStatus = 'interrupted';
      }
      this.bubble(this.residents[actor], c.record.requestOutcome, at);
    }
    if (completed && c.record.lines.length >= 2) {
      this.memoryEvents.push({
        record: { ...c.record, participants: [...c.record.participants], lines: c.record.lines.map(l => ({ ...l })) },
        ...(c.aiMemory ? { aiMemory: c.aiMemory } : {}),
        at,
      });
    }
    this.historyRevision++;
    for (const [idx, who] of c.record.participants.entries()) {
      const r = this.residents[who];
      r.conversationPartner = null;
      r.conversationSize = 0;
      r.targetWaypoint = null;
      r.destination = null;
      if (completed && c.record.discussion) {
        r.mood = c.record.discussion.kind === 'request' ? '平静' : c.record.discussion.kind === 'debate' ? '松了口气' : '开心';
        r.moodUntil = at + 60000;
      }
      r.state = 'idle';
      r.motion = null;
      r.lastConversationAt = at;
      // Stagger post-chat dispersion so multi-party gatherings naturally drift apart instead of clumping
      r.nextDecisionAt = c.record.participants.length >= 3
        ? at + 2200 + idx * 1400
        : at + 3000 + this.random() * 5000;
      if (r.task?.phase === 'conversation') r.task = null;
    }
    const participants = c.record.participants;
    for (const [index, first] of participants.entries()) for (const second of participants.slice(index + 1)) this.pairs.set(pairKey(first, second), at);
    this.conversations.delete(id);
    const intent = completed ? c.next : undefined;
    if (intent?.type === 'ask' && this.settings.chatter) {
      this.followups.set(intent.actor, { target: intent.target, at: at + 6500,
        discussion: { kind: 'followup', topic: intent.topic, relayedBy: participants.find(id => id !== intent.actor) } });
      return;
    }
    if (intent && intent.type !== 'ask' && this.settings.roaming) {
      this.activities.set(intent.actor, { type: intent.type, at: at + 6500 });
      return;
    }
    const topic = c.record.discussion?.topic ?? c.record.sharedTopic?.topic;
    if (completed && topic && c.record.source === 'encounter' && this.random() < 0.55) {
      const actor = participants.find(id => id !== 'chicken') ?? participants[0];
      const target = this.discussionGuests(topic).find(id => !participants.includes(id));
      if (target) this.followups.set(actor, { target, at: at + 6500,
        discussion: { kind: 'followup', topic, relayedBy: participants.find(id => id !== actor) } });
    }
  }
  canCompleteWork(id: string, actor: ResidentId) {
    return this.pausedAt === null && this.residents[actor].task?.id === id && this.residents[actor].task?.phase === 'awaiting';
  }
  completeWork(id: string, actor: ResidentId, message: string, at: number) {
    if (!this.canCompleteWork(id, actor)) return false;
    const r = this.residents[actor];
    const startedAt = r.task?.createdAt ?? at;
    const activity = r.task?.activity;
    if (activity === 'project') {
      this.projectDays.set(actor, lifeDate(at));
      message = RESIDENT_PROJECTS[actor].result;
      r.mood = '开心';
      r.moodUntil = at + 60000;
    }
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
      source: activity ? 'scheduled/local' as const : 'player_command' as const,
      ...(activity ? { activity } : {}),
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
  private doActivity(r: ResidentModel, type: 'project' | 'rest', at: number) {
    if (type === 'project' && this.projectDays.get(r.id) === lifeDate(at)) return false;
    const project = RESIDENT_PROJECTS[r.id];
    const result = this.command(r.id, type === 'project' ? { type: 'visit', target: project.location } : { type: 'rest' }, at);
    const task = r.task;
    if (!result.ok || !task) return false;
    task.activity = type;
    this.bubble(r, type === 'project' ? '我想' + project.activity + '。' : '我先歇一会儿，等会再忙。', at);
    return true;
  }
  private doAutoDuty(r: ResidentModel, duty: ResidentDuty, waypoint: WaypointId, bubbleText: string, at: number) {
    const locationMap: Partial<Record<WaypointId, FarmLocation>> = {
      pond: 'pond',
      farmCenter: 'farm',
      farmRight: 'farm',
      farmLeft: 'farm',
      houseDoor: 'house',
      coop: 'coop',
      plaza: 'plaza',
      pondBench: 'bench',
      marketDoor: 'market',
    };
    const loc = locationMap[waypoint] ?? 'farm';
    const result = this.command(r.id, { type: 'visit', target: loc }, at);
    const task = r.task;
    if (!result.ok || !task) return false;
    task.autoDuty = duty;
    task.workUntil = 0;
    this.lastAutoWorkAt.set(r.id, at);
    this.bubble(r, bubbleText, at);
    return true;
  }
  private chooseDestination(r: ResidentModel, night: boolean, farmNeeds?: FarmNeedsSnapshot, at = 0): WaypointId {
    const activeEvents = this.townEvents.filter(ev => ev.expiresAt > at);
    const scheduled = farmNeeds
      ? residentCurrentSchedule(r.id, farmNeeds.period, farmNeeds.weather, farmNeeds.rainbow, activeEvents)
      : null;
    if (scheduled) {
      r.currentActivity = scheduled.activity;
    }
    const choices = (Object.keys(WAYPOINTS) as WaypointId[]).filter(id => id !== r.currentWaypoint);
    const weights = choices.map(id => {
      const pref = PREFERENCES[r.id].includes(id) ? 5 : 1;
      const scheduleBoost = scheduled && scheduled.waypoint === id ? 14 : 1;
      const nightBoost = night && (id === 'houseDoor' || r.id === 'chicken' && id === 'coop') ? 5 : 1;
      return pref * scheduleBoost * nightBoost / (1 + distance(r.logicalPosition, WAYPOINTS[id]) / 80);
    });
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
    reducedMotion = false,
    automaticNetworkBlock,
    busyResident = null,
    farmNeeds,
  }: {
    autonomous?: boolean;
    night?: boolean;
    reducedMotion?: boolean;
    automaticNetworkBlock?: { reason: string; wait: boolean };
    busyResident?: ResidentId | null;
    farmNeeds?: FarmNeedsSnapshot;
  } = {}) {
    if (this.pausedAt !== null) return;
    this.night = night;
    this.advancePositions(at);
    for (const c of [...this.conversations.values()]) {
      if (c.arranging) {
        if (c.record.participants.some(id => this.residents[id].motion)) continue;
        c.arranging = false;
        c.nextAt = Math.max(c.nextAt, at + 300);
        const group = c.record.participants.map(id => this.residents[id]);
        const cx = group.reduce((sum, item) => sum + item.logicalPosition.x, 0) / group.length;
        for (const member of group) {
          member.state = 'talking';
          member.face = cx >= member.logicalPosition.x ? 1 : -1;
        }
        if (group.length === 2) {
          group[0].face = group[1].logicalPosition.x >= group[0].logicalPosition.x ? 1 : -1;
          group[1].face = group[0].face === 1 ? -1 : 1;
        }
      }
      if (c.waiting) {
        if (at >= c.deadline) {
          c.waiting = false;
          c.record.localReason = 'AI 回复超时';
          this.continueConversationLocally(c);
          this.historyRevision++;
          c.nextAt = at;
        } else continue;
      }
      if (at < c.nextAt) continue;
      if (c.index >= c.planned.length) {
        this.finishConversation(c.record.id, at, true);
        continue;
      }
      if (c.network && c.index === c.batchEnd) {
        this.requestConversationBatch(c, at);
        continue;
      }
      // Local residents reconsider at chapter breaks. Online residents signal their own ending.
      if (c.natural && !c.network && (c.index === 18 || c.index === 38)) {
        const stopChance = (c.index === 18 ? 0.45 : 0.75) + (night ? 0.15 : 0) - (c.sharedTopic ? 0.1 : 0);
        if (this.random() < stopChance) {
          c.planned.length = c.index + 2;
          this.closeLocalTalk(c.record.participants, c.planned);
        }
      }
      const line = {
        ...c.planned[c.index++],
        at
      };
      c.record.lines.push(line);
      if (c.sharedTopic && c.index === 2) c.record.sharedTopic = c.sharedTopic;
      this.historyRevision++;
      for (const id of c.record.participants) {
        const listener = this.residents[id];
        listener.bubble = null;
        if (id !== line.speaker) listener.face = this.residents[line.speaker].logicalPosition.x >= listener.logicalPosition.x ? 1 : -1;
      }
      this.bubble(this.residents[line.speaker], line.text, at);
      c.nextAt = at + Math.max(2200, line.text.length * 95);
    }
    if (farmNeeds) {
      const prevWeather = this.currentWeather;
      const prevRainbow = this.currentRainbow;
      const weatherKey = `${farmNeeds.weather}-${farmNeeds.rainbow ? 'rb' : 'no'}`;
      const weatherChanged = this.lastWeatherKey !== '' && this.lastWeatherKey !== weatherKey;
      this.lastWeatherKey = weatherKey;
      this.currentWeather = farmNeeds.weather;
      this.currentRainbow = farmNeeds.rainbow;
      const enteredWeather = farmNeeds.weather === 'rain' || farmNeeds.rainbow;
      const clearedFromRain = !enteredWeather && prevWeather === 'rain';
      const rainbowEnded = !enteredWeather && !clearedFromRain && prevRainbow;
      if (weatherChanged && (enteredWeather || clearedFromRain || rainbowEnded) && !night) {
        const activeEvents = this.townEvents.filter(ev => ev.expiresAt > at);
        let reactedCount = 0;
        const maxBubbles = enteredWeather ? 2 : clearedFromRain ? 1 : 0;
        for (const r of Object.values(this.residents)) {
          if (this.sleepingResidents.has(r.id) || r.id === busyResident || r.task || r.conversationPartner) continue;
          const slot = residentCurrentSchedule(r.id, farmNeeds.period, farmNeeds.weather, farmNeeds.rainbow, activeEvents);
          r.currentActivity = slot.activity;
          if (farmNeeds.rainbow) {
            r.mood = '开心';
            r.moodUntil = at + 180_000;
          }
          const dest = WAYPOINTS[slot.waypoint];
          if (distance(r.logicalPosition, dest) > 12) {
            this.move(r, dest, at, 'wandering');
          }
          if (!r.bubble && reactedCount < maxBubbles) {
            reactedCount++;
            this.lastThoughtAt.set(r.id, at);
            const clearLine = r.id === 'chicken'
              ? '咕咕！雨停啦，出去抖抖羽毛晒太阳！'
              : '雨停放晴了，空气里都是青草香，出去走走！';
            this.bubble(r, enteredWeather ? slot.thought : clearLine, at, 'thought');
          }
        }
      }
    }
    for (const r of Object.values(this.residents)) {
      if (r.moodUntil && r.moodUntil <= at) { r.mood = '平静'; r.moodUntil = 0; }
      if (r.bubble && r.bubble.until <= at) r.bubble = null;
      const task = r.task;
      if (task) {
        if (task.phase !== 'conversation' && at >= task.expiresAt) {
          this.cancelTask(r, at);
          this.bubble(r, '这次没能完成，稍后再试吧。', at);
          continue;
        }
        if (task.action.type === 'talk_to' && task.phase !== 'reserved' && task.phase !== 'conversation' && !r.motion) {
          const target = this.residents[task.action.target];
          if (target.task?.id === task.id && distance(r.logicalPosition, target.logicalPosition) < 24 && farmSegmentClear(r.logicalPosition, target.logicalPosition)) {
            const automatic = !!task.discussion && task.discussion.kind !== 'request';
            // Never keep two residents locked along a route for a long AI cooldown.
            if (automatic && this.settings.online && this.settings.aiRatio >= 100 && automaticNetworkBlock?.wait) {
              this.cancelTask(r, at);
              continue;
            }
            this.startConversation([r.id, target.id], automatic ? 'scheduled/local' : 'player_command', at, task.discussion, false, automatic ? automaticNetworkBlock?.reason : undefined);
          } else {
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
          if (task.autoDuty) {
            this.autoWorkEvents.push({ id: task.id, actor: r.id, duty: task.autoDuty, at });
          } else if (task.action.type === 'fetch_water' || task.action.type === 'water_crops') this.effects.push({
            type: 'work',
            id: task.id,
            actor: r.id,
            action: task.action
          }); else this.completeWork(task.id, r.id, task.action.type === 'go_home' ? '到家了，我在这里歇一会。' : task.action.type === 'rest' ? '休息好了，继续慢慢来。' : '已经到了，这里真舒服。', at);
        }
        continue;
      }
      if (!autonomous || r.conversationPartner || r.id === busyResident) continue;
      const activity = this.activities.get(r.id);
      if (activity && at >= activity.at) {
        this.activities.delete(r.id);
        if (at - activity.at <= 45000 && this.settings.roaming && !reducedMotion && this.doActivity(r, activity.type, at)) continue;
      }
      if (!this.settings.roaming && r.motion) {
        r.motion = null;
        r.targetWaypoint = null;
        r.state = 'idle';
      }
      if (this.settings.roaming && !reducedMotion && !r.motion && at >= r.nextDecisionAt) {
        r.nextDecisionAt = at + this.settings.activitySeconds * 1000;
        if (farmNeeds) {
          if (this.sleepingResidents.has(r.id)) continue;
          const activeEvents = this.townEvents.filter(ev => ev.expiresAt > at);
          r.currentActivity = residentCurrentSchedule(r.id, farmNeeds.period, farmNeeds.weather, farmNeeds.rainbow, activeEvents).activity;
          // Autonomous AI Farm helper duty execution (bounded per-resident cooldown)
          const duty = this.townDuties[r.id];
          const lastAuto = this.lastAutoWorkAt.get(r.id) ?? 0;
          if (duty && at - lastAuto >= 95_000 && this.random() < 0.42) {
            const plan = pickAutonomousDutyAction(r.id, duty, farmNeeds, this.residentAffinities[r.id] ?? 0);
            if (plan && this.doAutoDuty(r, plan.duty, plan.waypoint, plan.bubble, at)) continue;
          }
          // Gentle occasional thought bubble reflecting schedule, weather, rainbow, sleep deprivation, solo emo or decor
          const lastThought = this.lastThoughtAt.get(r.id) ?? 0;
          if (!r.bubble && at - lastThought >= 32_000 && this.random() < 0.28) {
            const decorNote = this.placedDecor.length && this.random() < 0.45
              ? pickNearbyDecorComment(r.id, r.logicalPosition, this.placedDecor)
              : null;
            const thought =
              decorNote?.text ??
              pickResidentThought(r.id, farmNeeds, activeEvents, this.residentEpisodes[r.id], this.random(), {
                sleepDeprived: this.sleepDeprived,
                soloEvent: this.nightSoloEvent,
              });
            if (thought) {
              this.lastThoughtAt.set(r.id, at);
              this.bubble(r, thought, at, 'thought');
            }
          }
        }
        if (this.sleepingResidents.has(r.id)) continue;
        if (night && this.nightSoloEvent?.resident === r.id) {
          const spot = WAYPOINTS[this.nightSoloEvent.waypoint];
          if (distance(r.logicalPosition, spot) > 12) {
            this.move(r, spot, at, 'wandering');
          }
          continue;
        }
        if (!night && this.projectDays.get(r.id) !== lifeDate(at) && this.random() < 0.2 && this.doActivity(r, 'project', at)) continue;
        if (!night || this.random() * 100 < this.settings.nightActivity) this.move(r, WAYPOINTS[this.chooseDestination(r, night, farmNeeds, at)], at, 'wandering');
      }
    }
    if (!autonomous || !this.settings.chatter || at - this.encounterAt < 2000) return;
    const waitingForAutomatic = () => [...this.conversations.values()].some(c => c.waiting && c.record.source !== 'player_command');
    const fullRatio = this.settings.online && this.settings.aiRatio >= 100;
    if (fullRatio && (automaticNetworkBlock?.wait || (!automaticNetworkBlock && waitingForAutomatic()))) return;
    this.encounterAt = at;
    for (const [actor, followup] of this.followups) {
      if (at < followup.at) continue;
      if (at - followup.at > 45000) { this.followups.delete(actor); continue; }
      const a = this.residents[actor], b = this.residents[followup.target];
      if (a.task || b.task || a.conversationPartner || b.conversationPartner) continue;
      if (a.id === busyResident || b.id === busyResident) continue;
      this.followups.delete(actor);
      const result = this.command(actor, { type: 'talk_to', target: b.id }, at);
      if (result.ok) {
        const task = this.residents[actor].task;
        if (task) {
          task.discussion = followup.discussion;
          this.bubble(a, '我想再听听' + RESIDENTS[b.id].name + '怎么看。', at);
        }
      }
    }
    for (let i = 0; i < RESIDENT_IDS.length; i++) for (let j = i + 1; j < RESIDENT_IDS.length; j++) {
      if (fullRatio && !automaticNetworkBlock && waitingForAutomatic()) return;
      const a = this.residents[RESIDENT_IDS[i]],
        b = this.residents[RESIDENT_IDS[j]];
      if (this.sleepingResidents.has(a.id) || this.sleepingResidents.has(b.id)) continue;
      if (a.task || b.task || a.conversationPartner || b.conversationPartner) continue;
      if (a.id === busyResident || b.id === busyResident) continue;
      if (at - Math.max(a.lastInteractionAt, b.lastInteractionAt) < 10000) continue;
      if (at - Math.max(a.lastConversationAt, b.lastConversationAt, this.pairs.get(pairKey(a.id, b.id)) ?? 0) < this.settings.conversationCooldown * 1000) continue;
      if (distance(a.logicalPosition, b.logicalPosition) > 22 || !farmSegmentClear(a.logicalPosition, b.logicalPosition)) continue;
      if (this.random() * 100 >= this.settings.encounterChance * (night ? this.settings.nightActivity / 100 : 1)) continue;
      const roll = this.random();
      const interests: Record<ResidentId, FarmTopicId[]> = { door: ['tech', 'books', 'music'], gu: ['garden', 'pets', 'music'], xiaoba: ['games', 'books', 'tech'], yujie: ['music', 'books', 'games'], weigang: ['fishing', 'math', 'books'], chicken: ['pets', 'garden'] };
      const recentTopics = this.history.filter(record => record.participants.includes(a.id) && record.participants.includes(b.id)).slice(-2).map(record => record.discussion?.topic ?? record.sharedTopic?.topic);
      const topics = [...(this.settings.shareTopics ? [...(this.publicTopics[a.id] ?? []), ...(this.publicTopics[b.id] ?? [])] : []), ...interests[a.id], ...interests[b.id]];
      const fresh = topics.filter(topic => !recentTopics.includes(topic));
      const pool = fresh.length ? fresh : topics;
      const topic = pool[Math.floor(this.random() * pool.length) % pool.length];
      const guest = roll >= 0.12 && roll < 0.32 ? Object.values(this.residents).find(r =>
        r.id !== a.id && r.id !== b.id && r.id !== busyResident && !this.sleepingResidents.has(r.id) && !r.task && !r.conversationPartner && at - r.lastConversationAt >= this.settings.conversationCooldown * 1000 &&
        distance(a.logicalPosition, r.logicalPosition) >= 18 && distance(a.logicalPosition, r.logicalPosition) < 48 && farmSegmentClear(a.logicalPosition, r.logicalPosition)
      ) : undefined;
      if (guest && this.startConversation([a.id, b.id, guest.id], 'encounter', at, { kind: 'discussion', topic }, false, automaticNetworkBlock?.reason)) continue;
      this.startConversation([a.id, b.id], 'encounter', at, roll >= 0.68 && roll < 0.86 ? { kind: 'debate', topic } : undefined, false, automaticNetworkBlock?.reason);
    }
  }
}
