import AsyncStorage from '@react-native-async-storage/async-storage';
import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';
import { useReducedMotion } from 'react-native-reanimated';
import { farmChat } from '@/services/farmChat';
import { FarmResidentEngine, type ResidentEffect } from '@/utils/farmResidentAI';
import { DEFAULT_LIFE, PRESETS, RESIDENTS, normalizeLifeSettings, normalizeLifeUsage, readLifeReply, reserveLifeRequest, restoreConversations, type LifeMode, type LifeSettings, type ResidentConversation, type ResidentId } from '@/utils/farmLife';
import type { NpcAction } from '@/utils/farmActions';
const KEYS = {
  settings: 'dark-study-farm-life-settings',
  usage: 'dark-study-farm-life-budget',
  history: 'dark-study-farm-life-log'
};
const now = () => Date.now();
const parse = (value: string | null) => value ? JSON.parse(value) : null;
export interface FarmResidentsOptions {
  enabled: boolean;
  paused: boolean;
  autonomous: boolean;
  night: boolean;
  apiKey: string;
  onWork: (actor: ResidentId, action: NpcAction, id: string) => string;
}
/** One 500ms scheduler, no per-frame React state, no offline AI catch-up. */
export function useFarmResidents(options: FarmResidentsOptions) {
  const [engine] = useState(() => new FarmResidentEngine(now()));
  const [residents, setResidents] = useState(() => engine.snapshot());
  const [settings, setSettings] = useState<LifeSettings>({
    ...DEFAULT_LIFE
  });
  const [history, setHistory] = useState<ResidentConversation[]>([]);
  const [usage, setUsage] = useState(() => normalizeLifeUsage(null, now()));
  const [ready, setReady] = useState(false);
  const [foreground, setForeground] = useState(() => !AppState.currentState || AppState.currentState === 'active');
  const [notice, setNotice] = useState('');
  const reducedMotion = useReducedMotion();
  const blocked = useRef(false);
  const budget = useRef(usage);
  const requests = useRef(new Map<string, AbortController>());
  const writes = useRef(Promise.resolve());
  const revision = useRef(-1);
  const alive = useRef(true);
  const epoch = useRef(0);
  const awake = options.enabled && ready && foreground && !options.paused;
  const latest = useRef({
    ...options,
    settings,
    awake,
    reducedMotion
  });
  useEffect(() => {
    latest.current = {
      ...options,
      settings,
      awake,
      reducedMotion
    };
  });
  const persist = useCallback((key: string, value: unknown) => {
    const write = writes.current.catch(() => {}).then(() => AsyncStorage.setItem(key, JSON.stringify(value)));
    writes.current = write;
    return write;
  }, []);
  const abortAll = useCallback(() => {
    epoch.current++;
    requests.current.forEach(c => c.abort());
    requests.current.clear();
  }, []);
  const publish = useCallback(() => {
    setResidents(engine.snapshot());
    if (revision.current !== engine.historyRevision) {
      revision.current = engine.historyRevision;
      setHistory(engine.takeHistory());
    }
  }, [engine]);
  useEffect(() => {
    alive.current = true;
    let active = true;
    void Promise.all([AsyncStorage.getItem(KEYS.settings), AsyncStorage.getItem(KEYS.usage), AsyncStorage.getItem(KEYS.history)]).then(([prefs, rawUsage, rawHistory]) => {
      if (!active) return;
      try {
        setSettings(normalizeLifeSettings(parse(prefs)));
      } catch {
        setNotice('旧设置无法读取，已使用日常生活模式。');
      }
      try {
        const restored = normalizeLifeUsage(parse(rawUsage), now());
        budget.current = restored;
        setUsage(restored);
      } catch {
        blocked.current = true;
        setNotice('用量记录损坏，自动联网暂停，本地生活继续。');
      }
      try {
        engine.restoreHistory(restoreConversations(parse(rawHistory)));
        setHistory(engine.takeHistory());
        revision.current = engine.historyRevision;
      } catch {
        setNotice('旧生活记录无法读取，新的记录仍可保存。');
      }
    }).catch(() => {
      if (active) {
        blocked.current = true;
        setNotice('存储暂不可用，自动联网保持关闭。');
      }
    }).finally(() => {
      if (active) setReady(true);
    });
    return () => {
      active = false;
      alive.current = false;
      abortAll();
      engine.pause(true, now());
    };
  }, [engine, abortAll]);
  useEffect(() => {
    const sub = AppState.addEventListener('change', state => {
      const active = state === 'active';
      if (!active) {
        engine.pause(true, now());
        abortAll();
      }
      setForeground(active);
    });
    return () => sub.remove();
  }, [engine, abortAll]);
  useEffect(() => {
    engine.configure(settings, now());
    if (!settings.online || !settings.chatter) {
      abortAll();
      engine.fallbackPending(now());
    }
    if (ready) void persist(KEYS.settings, settings).catch(() => {
      if (alive.current) {
        blocked.current = true;
        setNotice('设置保存失败，自动联网已暂停。');
      }
    });
  }, [engine, settings, ready, persist, abortAll]);
  useEffect(() => {
    if (ready) void persist(KEYS.history, history).catch(() => {
      if (alive.current) setNotice('生活记录保存失败，本次记录暂存于当前会话。');
    });
  }, [history, ready, persist]);
  useEffect(() => {
    engine.pause(!awake, now());
    if (!awake) abortAll();
    if (!options.autonomous) {
      engine.suspendAutonomy(now());
      abortAll();
      engine.fallbackPending(now());
    }
    // Publish lifecycle changes once, even while the regular interval is stopped.
    const flush = setTimeout(publish, 0);
    return () => clearTimeout(flush);
  }, [awake, options.autonomous, engine, abortAll, publish]);
  const conversationRequest = useCallback(async (event: Extract<ResidentEffect, {
    type: 'conversation';
  }>) => {
    const current = latest.current;
    const token = epoch.current;
    if (!current.awake || !current.apiKey || blocked.current) {
      engine.supplyConversation(event.id, null, false, now());
      return;
    }
    const reserved = reserveLifeRequest(budget.current, current.settings, now());
    if (!reserved) {
      engine.supplyConversation(event.id, null, false, now());
      return;
    }
    budget.current = reserved;
    setUsage(reserved);
    const controller = new AbortController();
    requests.current.set(event.id, controller);
    try {
      // Reserve durably before the only HTTP attempt, including failures/cancellation.
      await persist(KEYS.usage, reserved);
      if (!alive.current || token !== epoch.current || controller.signal.aborted || !engine.getConversation(event.id) || !latest.current.awake) return;
      const [a, b] = event.pair;
      const raw = await farmChat([{
        role: 'system',
        content: `用中文写温暖自然的农场对话。${a}：${RESIDENTS[a].persona}。${b}：${RESIDENTS[b].persona}。当前${current.night ? '夜晚' : '白天'}。只输出严格JSON：{"lines":[{"speaker":"${a}","text":"一句话"},{"speaker":"${b}","text":"回应"}]}。必须交替发言，共${event.rounds * 2}句，每句不超过32字，围绕田地、家人或眼前风景。不要旁白，不追问用户，不给任何执行指令。`
      }, {
        role: 'user',
        content: '你们刚在农场碰面，开始这一段对话，然后结束。'
      }], current.apiKey, {
        signal: controller.signal,
        timeoutMs: 12000,
        maxTokens: Math.min(1024, 180 + event.rounds * 130)
      });
      if (token === epoch.current && alive.current) engine.supplyConversation(event.id, readLifeReply(raw, event.pair, event.rounds), true, now());
    } catch {
      if (!controller.signal.aborted && alive.current) {
        engine.supplyConversation(event.id, null, false, now());
        setNotice('这轮改用本地对白；失败的联网请求也计入今日额度。');
      }
    } finally {
      requests.current.delete(event.id);
    }
  }, [engine, persist]);
  useEffect(() => {
    if (!awake) return;
    const tick = () => {
      const current = latest.current;
      if (!current.awake) return;
      engine.tick(now(), {
        autonomous: current.autonomous,
        night: current.night,
        reducedMotion: current.reducedMotion
      });
      requests.current.forEach((request, id) => {
        if (!engine.getConversation(id)) {
          request.abort();
          requests.current.delete(id);
        }
      });
      for (const event of engine.drainEffects()) {
        if (event.type === 'conversation') {
          void conversationRequest(event);
          continue;
        }
        if (!engine.canCompleteWork(event.id, event.actor)) continue;
        let message: string;
        try {
          message = current.onWork(event.actor, event.action, event.id);
        } catch {
          message = '这次没能完成，稍后再试吧。';
        }
        engine.completeWork(event.id, event.actor, message, now());
      }
      publish();
    };
    const timer = setInterval(tick, 500);
    return () => clearInterval(timer);
  }, [engine, publish, conversationRequest, awake]);
  const command = useCallback((who: ResidentId, action: unknown) => {
    const result = engine.command(who, action, now());
    requests.current.forEach((request, id) => {
      if (!engine.getConversation(id)) {
        request.abort();
        requests.current.delete(id);
      }
    });
    publish();
    return result;
  }, [engine, publish]);
  const interact = useCallback((who: ResidentId) => {
    engine.interact(who, now());
    abortAll();
    publish();
  }, [engine, publish, abortAll]);
  const updateSettings = useCallback((patch: Partial<LifeSettings>) => setSettings(previous => normalizeLifeSettings({
    ...previous,
    ...patch,
    mode: 'custom'
  })), []);
  const applyPreset = useCallback((mode: Exclude<LifeMode, 'custom'>) => setSettings({
    ...PRESETS[mode]
  }), []);
  return {
    residents,
    settings,
    history,
    usage,
    notice,
    ready,
    awake,
    autonomous: options.autonomous,
    reducedMotion,
    command,
    interact,
    updateSettings,
    applyPreset
  };
}
export type FarmResidentsController = ReturnType<typeof useFarmResidents>;
