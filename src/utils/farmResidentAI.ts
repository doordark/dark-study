import { conversationSpots, freeResidentSpot } from './farmResidentSpace';
import { RESIDENT_PLACEMENTS, WAYPOINTS, type FarmPoint, type WaypointId } from '@/constants/farmMap';
import { farmSegmentClear, nearestFarmWaypoint, safeFarmPoint, waypointFarmRoute } from './farmNavigation';
import { DEFAULT_LIFE, LONG_TALK_MAX, RESIDENTS, RESIDENT_IDS, SHORT_TALK_MAX, TALK_BATCH_ROUNDS, lifeDate, localConversation, normalizeLifeSettings, sharedTopicExchange, type FarmTopicId, type SharedFarmTopic, type LifeSettings, type ResidentId, type ResidentConversation, type ResidentLine } from './farmLife';
import { validateNpcAction, type NpcAction, type FarmLocation } from './farmActions';
import { discussionLines, requestBatchOnTopic, type FarmDiscussion, type ResidentMood } from './farmDiscussion';
import { publicFarmTopic } from './farmMemory';
import { RESIDENT_PROJECTS, readResidentIntent, type ResidentIntent } from './farmAgency';
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
  activity?: 'project' | 'rest';
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
  pair: ResidentId[];
  discussion?: FarmDiscussion;
  moods: ResidentMood[];
  rounds: number;
  source: ResidentConversation['source'];
  natural: boolean;
  finalBatch: boolean;
  sharedTopic?: SharedFarmTopic;
};
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
  private activities = new Map<ResidentId, { type: 'project' | 'rest'; at: number }>();
  private projectDays = new Map<ResidentId, string>();
  private followups = new Map<ResidentId, { target: ResidentId; discussion: FarmDiscussion; at: number }>();
  private publicTopics: Partial<Record<ResidentId, FarmTopicId[]>> = {};
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
  interact(who: ResidentId, at: number) {
    this.residents[who].lastInteractionAt = at;
    this.suspendAutonomy(at);
  }
  fallbackPending(at: number) {
    for (const c of this.conversations.values()) {
      c.network = false;
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
      const spot = freeResidentSpot(safeFarmPoint(to), others.flatMap(o => [o.logicalPosition, ...(o.destination ? [o.destination] : [])]));
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
    // Look ahead once per scheduler tick. Task walkers get priority, then a stable ID order.
    for (const r of actors) if (r.motion && !r.conversationPartner && at >= (this.yieldUntil.get(r.id) ?? 0)) {
      const ahead = motionPosition(r.motion, at + 650).position;
      const other = actors.find(o => o.id !== r.id && o.conversationPartner !== r.id &&
        distance(ahead, o.motion ? motionPosition(o.motion, at + 650).position : o.logicalPosition) < 19 &&
        (!o.motion || (!r.task && !!o.task) || (!!r.task === !!o.task && actors.indexOf(o) < actors.indexOf(r))));
      if (other) {
        this.yieldUntil.set(r.id, at + 2500);
        const side = freeResidentSpot(ahead, actors.filter(o => o !== r).map(o => o.logicalPosition), 21);
        const destination = r.destination;
        if (side && farmSegmentClear(r.logicalPosition, side) && distance(side, r.logicalPosition) > 3 && destination) {
          const rest = waypointFarmRoute(side, destination);
          if (rest.length) r.motion = { ...r.motion, id: ++this.sequence, from: { ...r.logicalPosition }, points: [side, ...rest], startedAt: at };
        } else {
          const rest = remainingResidentMotion(r.motion, at);
          r.motion = { ...r.motion, id: ++this.sequence, from: rest.start, points: rest.steps.map(s => s.point), startedAt: at + 500 };
        }
      }
    }
  }
  private recordInterruptedRequest(r: ResidentModel, at: number) {
    if (r.task?.discussion?.kind !== 'request' || r.task.phase === 'reserved' || r.task.phase === 'conversation') return;
    this.history = [...this.history, {
      id: r.task.id + '-interrupted', participants: [r.id, ...(r.task.action.type === 'talk_to' ? [r.task.action.target] : [])],
      discussion: r.task.discussion, startedAt: r.task.createdAt, endedAt: at, source: 'player_command' as const,
      online: false, lines: [{ speaker: r.id, text: '这次带话还没有完成。', at }],
      requestOutcome: '这次带话途中中断了，还没有问到对方，不能当作已经办好。',
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
      ...(action.type === 'talk_to' && action.purpose ? { discussion: { kind: 'request' as const, question: action.purpose } } : {}),
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
  private discussionGuests(topic?: FarmTopicId): ResidentId[] {
    const expert: Record<FarmTopicId, ResidentId> = { games: 'xiaoba', fishing: 'weigang', music: 'yujie', books: 'yujie',
      math: 'weigang', tech: 'door', garden: 'gu', pets: 'chicken' };
    const preferred = topic ? expert[topic] : 'door';
    return [preferred, ...RESIDENT_IDS.filter(id => id !== preferred)];
  }
  private startConversation(participants: ResidentId[], source: ResidentConversation['source'], at: number, discussion?: FarmDiscussion, gather = false) {
    const [first, second] = participants;
    const pair: [ResidentId, ResidentId] = [first, second];
    const a = this.residents[first], b = this.residents[second];
    const occupied = Object.values(this.residents).filter(r => !participants.includes(r.id))
      .flatMap(r => [r.logicalPosition, ...(r.destination ? [r.destination] : [])]);
    const slots: FarmPoint[] | null = gather ? [] : conversationSpots(a.logicalPosition, b.logicalPosition, occupied);
    if (slots) for (const id of participants.slice(slots.length)) {
      const anchor = gather ? WAYPOINTS.plaza : safeFarmPoint({ x: (slots[0].x + slots[1].x) / 2, y: (slots[0].y + slots[1].y) / 2 });
      const spot = freeResidentSpot(anchor, [...occupied, ...slots]);
      const origin = this.residents[id].logicalPosition;
      if (!spot || (!farmSegmentClear(origin, spot) && !waypointFarmRoute(origin, spot).length)) break;
      slots.push(spot);
    }
    if (!slots || slots.length !== participants.length) {
      if (source !== 'encounter' && !gather) { this.cancelTask(a, at); this.bubble(a, '这里有点挤，换个空些的地方聊吧。', at); }
      return null;
    }
    const id = `conversation-${at}-${++this.sequence}`;
    const requested = discussion?.kind === 'request';
    const natural = !requested && participants.length === 2 && this.settings.longTalks && this.settings.naturalTalks;
    const rounds = requested ? 3 : participants.length === 3 ? 3 : natural ? LONG_TALK_MAX : Math.max(discussion?.kind === 'debate' ? 3 : 2, this.settings.rounds);
    const candidates = this.settings.shareTopics && participants.length === 2 && !discussion ? pair.flatMap(from => (this.publicTopics[from] ?? []).map(topic => ({ from, topic }))) : [];
    const candidate = candidates.find(({ from, topic }) => !this.history.some(record =>
      record.participants.includes(pair[0]) && record.participants.includes(pair[1]) &&
      record.sharedTopic?.from === from && record.sharedTopic.topic === topic
    ));
    const sharedTopic = candidate && this.random() < 0.35 ? candidate : undefined;
    const opener = sharedTopic ? sharedTopicExchange(pair, sharedTopic) : [];
    const local = discussion ? discussionLines(participants, discussion) : [];
    const reflective = !discussion && !opener.length && first === 'xiaoba' && (a.mood === '低落' || a.mood === '平静' && this.random() < 0.25);
    if (reflective) { a.mood = '低落'; a.moodUntil = at + 90000; }
    const moodLines: Omit<ResidentLine, 'at'>[] = reflective ? [
      { speaker: first, text: '我今天有点提不起劲。能陪我坐一小会儿吗？' },
      { speaker: second, text: second === 'chicken' ? '咕，我就蹲你旁边。' : '好。我陪着你。你想说话的时候再说。' },
    ] : [];
    const planned = [...opener, ...moodLines, ...local, ...(!requested && participants.length === 2 ? localConversation(pair, rounds, this.sequence) : [])].slice(0, rounds * participants.length);
    if (rounds > SHORT_TALK_MAX) this.closeLocalTalk(pair, planned);
    const record: ResidentConversation = {
      id,
      participants,
      ...(discussion ? { discussion } : {}),
      startedAt: at,
      endedAt: null,
      source,
      online: false,
      lines: []
    };
    const network = this.settings.online && this.settings.aiRatio > 0 && this.random() * 100 < this.settings.aiRatio;
    const conversation: PlayingConversation = {
      record,
      planned,
      index: 0,
      nextAt: at + 500,
      waiting: false,
      deadline: 0,
      arranging: true,
      network,
      batchEnd: requested ? 2 : opener.length + moodLines.length,
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
    if (c.record.discussion?.kind === 'request') return;
    if (c.record.online && c.record.participants.length === 2 && c.index < c.planned.length) {
      const pair = c.record.participants as [ResidentId, ResidentId];
      const rounds = (c.planned.length - c.index) / 2;
      const rest = localConversation(pair, rounds, this.sequence + 1);
      this.closeLocalTalk(pair, rest);
      c.planned.splice(c.index, rest.length, ...rest);
    }
  }
  private requestConversationBatch(c: PlayingConversation, at: number) {
    const speakers = c.record.participants.length;
    const remaining = (c.planned.length - c.index) / speakers;
    const rounds = Math.min(TALK_BATCH_ROUNDS, remaining);
    c.batchEnd = c.index + rounds * speakers;
    c.waiting = true;
    c.deadline = at + 15000;
    this.effects.push({
      type: 'conversation',
      id: c.record.id,
      pair: c.record.participants,
      discussion: c.record.discussion,
      moods: c.record.participants.map(id => this.residents[id].mood),
      rounds,
      source: c.record.source,
      natural: c.natural,
      finalBatch: rounds === remaining,
      sharedTopic: c.sharedTopic,
    });
  }
  supplyConversation(id: string, lines: Omit<ResidentLine, 'at'>[] | null, online: boolean, at: number, done = false, next?: ResidentIntent) {
    const c = this.conversations.get(id);
    if (!c || !c.waiting) return false;
    const expected = c.batchEnd - c.index;
    const ending = c.natural && done;
    const speakers = c.record.participants.length;
    if (lines && (c.record.discussion?.kind !== 'request' || requestBatchOnTopic(c.record.discussion.question ?? '', lines)) && (lines.length === expected || ending && lines.length >= Math.min(2 * speakers, expected) && lines.length < expected && lines.length % speakers === 0) &&
        lines.every((line, index) => (speakers === 3 && online
          ? c.record.participants.includes(line.speaker) && (index === 0 || lines[index - 1].speaker !== line.speaker)
          : line.speaker === c.record.participants[index % speakers]) && line.text.trim() && line.text.length <= 44) &&
        c.record.participants.every(id => lines.some(line => line.speaker === id))) {
      c.planned.splice(c.index, ending ? c.planned.length - c.index : expected, ...lines);
      c.record.online ||= online;
      if (online && c.record.source === 'encounter' && (ending || c.batchEnd === c.planned.length)) {
        c.next = readResidentIntent(next, c.record.participants);
      }
    } else {
      this.continueConversationLocally(c);
    }
    c.waiting = false;
    c.nextAt = at + 200;
    return true;
  }
  private finishConversation(id: string, at: number, completed = false) {
    const c = this.conversations.get(id);
    if (!c) return;
    c.record.endedAt = at;
    if (c.record.discussion?.kind === 'request') {
      const target = c.record.participants[1];
      const responses = c.record.lines.filter(line => line.speaker === target);
      const response = [...responses].reverse().find(line => !/请如实转达|不要替我编结论/.test(line.text)) ?? responses.at(-1);
      c.record.requestOutcome = completed && response
        ? `我已经找${RESIDENTS[target].name}问过「${c.record.discussion.question?.slice(0, 40)}」。对方最后说：「${response.text}」`
        : '刚才的带话还没完成，不能当作已经问清楚。';
      this.bubble(this.residents[c.record.participants[0]], c.record.requestOutcome, at);
    }
    this.historyRevision++;
    for (const who of c.record.participants) {
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
      r.nextDecisionAt = at + 3000 + this.random() * 5000;
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
      if (c.arranging) {
        if (c.record.participants.some(id => this.residents[id].motion)) continue;
        c.arranging = false;
        c.nextAt = Math.max(c.nextAt, at + 300);
        const [a, b] = c.record.participants.map(id => this.residents[id]);
        a.state = b.state = 'talking';
        a.face = b.logicalPosition.x >= a.logicalPosition.x ? 1 : -1;
        b.face = a.face === 1 ? -1 : 1;
      }
      if (c.waiting) {
        if (at >= c.deadline) {
          c.waiting = false;
          this.continueConversationLocally(c);
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
          if (target.task?.id === task.id && distance(r.logicalPosition, target.logicalPosition) < 24 && farmSegmentClear(r.logicalPosition, target.logicalPosition)) this.startConversation([r.id, target.id], task.discussion && task.discussion.kind !== 'request' ? 'scheduled/local' : 'player_command', at, task.discussion);else {
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
        if (!night && this.projectDays.get(r.id) !== lifeDate(at) && this.random() < 0.2 && this.doActivity(r, 'project', at)) continue;
        if (!night || this.random() * 100 < this.settings.nightActivity) this.move(r, WAYPOINTS[this.chooseDestination(r, night)], at, 'wandering');
      }
    }
    if (!autonomous || !this.settings.chatter || at - this.encounterAt < 2000) return;
    this.encounterAt = at;
    for (const [actor, followup] of this.followups) {
      if (at < followup.at) continue;
      if (at - followup.at > 45000) { this.followups.delete(actor); continue; }
      const a = this.residents[actor], b = this.residents[followup.target];
      if (a.task || b.task || a.conversationPartner || b.conversationPartner) continue;
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
      const a = this.residents[RESIDENT_IDS[i]],
        b = this.residents[RESIDENT_IDS[j]];
      if (a.task || b.task || a.conversationPartner || b.conversationPartner) continue;
      if (at - Math.max(a.lastInteractionAt, b.lastInteractionAt) < 10000) continue;
      if (at - Math.max(a.lastConversationAt, b.lastConversationAt, this.pairs.get(pairKey(a.id, b.id)) ?? 0) < this.settings.conversationCooldown * 1000) continue;
      if (distance(a.logicalPosition, b.logicalPosition) > 22 || !farmSegmentClear(a.logicalPosition, b.logicalPosition)) continue;
      if (this.random() * 100 >= this.settings.encounterChance * (night ? this.settings.nightActivity / 100 : 1)) continue;
      const roll = this.random();
      const topic = (this.settings.shareTopics ? this.publicTopics[a.id]?.[0] ?? this.publicTopics[b.id]?.[0] : undefined) ?? (a.id === 'door' ? 'tech' : a.id === 'gu' ? 'garden' : 'games');
      const guest = roll >= 0.12 && roll < 0.32 ? Object.values(this.residents).find(r =>
        r.id !== a.id && r.id !== b.id && !r.task && !r.conversationPartner && at - r.lastConversationAt >= this.settings.conversationCooldown * 1000 &&
        distance(a.logicalPosition, r.logicalPosition) >= 18 && distance(a.logicalPosition, r.logicalPosition) < 48 && farmSegmentClear(a.logicalPosition, r.logicalPosition)
      ) : undefined;
      if (guest && this.startConversation([a.id, b.id, guest.id], 'encounter', at, { kind: 'discussion', topic })) continue;
      this.startConversation([a.id, b.id], 'encounter', at, roll >= 0.68 && roll < 0.86 ? { kind: 'debate', topic } : undefined);
    }
  }
}
