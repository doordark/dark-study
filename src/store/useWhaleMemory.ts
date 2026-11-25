import { create } from "zustand";
import { persist } from "zustand/middleware";

import type { ChatMessage } from "@/types";
import { coordinatedJSONStorage } from "@/utils/storage";
import {
  MAX_WHALE_EPISODES,
  MAX_WHALE_FACTS,
  MAX_WHALE_OPEN_LOOPS,
  MAX_WHALE_REFLECTIONS,
  inferFactCategory,
  mergeWhaleEpisode,
  mergeWhaleFacts,
  mergeWhaleOpenLoops,
  type WhaleEpisode,
  type WhaleFact,
  type WhaleHistoryMessage,
  type WhaleOpenLoop,
  type WhaleReflection,
} from "@/utils/whaleMemory";
import {
  applyEmotionDelta,
  createInitialBondProfile,
  createInitialEmotion,
  decayWhaleEmotion,
  normalizeBondProfile,
  normalizeWhaleEmotion,
  recordBondActivity,
  type WhaleBondProfile,
  type WhaleEmotion,
  type WhaleEmotionDelta,
} from "@/utils/whaleEmotion";
import { uid } from "@/utils/id";

/** 记忆上限：超出后丢掉最早的对话，避免存档与内存无限膨胀 */
const MAX_MESSAGES = 200;

const cap = (list: ChatMessage[]) =>
  list.length > MAX_MESSAGES ? list.slice(list.length - MAX_MESSAGES) : list;

export interface WhaleCognitiveUpdate {
  memoryUpdates?: unknown;
  episode?: unknown;
  openLoop?: unknown;
  moodShift?: unknown;
}

interface WhaleMemoryState {
  hydrated: boolean;
  /** 是否处于大肥鱼人格（召唤过一次且没被收回） */
  active: boolean;
  /** 当前这段对话 */
  messages: ChatMessage[];
  /** 收回人格后归档的记忆，下次召唤时接着聊 */
  memory: ChatMessage[];
  petMessages: ChatMessage[];
  /** L2 核心语义事实（最多 100 条） */
  facts: WhaleFact[];
  /** L3 重要情景回忆（最多 50 条） */
  episodes: WhaleEpisode[];
  /** L3 未来约定与牵挂（最多 20 条） */
  openLoops: WhaleOpenLoop[];
  /** L4 反思洞察与共同默契（最多 24 条） */
  reflections: WhaleReflection[];
  /** 动态 PAD 情绪状态 */
  emotion: WhaleEmotion;
  /** 陪伴天数与羁绊成长档案 */
  bond: WhaleBondProfile;
  autoMemory: boolean;
  /** 是否在对话积累到一定轮数后自动异步整理回忆与反思 */
  autoReflect: boolean;
  turnsSinceReflect: number;
  lastReflectedAt: number;
  lastInteractionAt: number;
  /** 遗忘后阻止正在进行的请求把旧内容写回来。 */
  epoch: number;
  revision: number;
  setPetMessages: (next: ChatMessage[] | ((prev: ChatMessage[]) => ChatMessage[])) => void;
  setAutoMemory: (on: boolean) => void;
  setAutoReflect: (on: boolean) => void;
  saveFact: (text: string, id?: string) => void;
  removeFact: (id: string) => void;
  removeEpisode: (id: string) => void;
  removeOpenLoop: (id: string) => void;
  resolveOpenLoop: (id: string) => void;
  removeReflection: (id: string) => void;
  applyMood: (delta: WhaleEmotionDelta, now?: number) => void;
  bumpBond: (kind: "chat" | "interaction" | "reflection", now?: number) => void;
  learn: (updates: unknown, message: WhaleHistoryMessage | undefined, revision: number, startedAt: number) => void;
  learnCognitive: (payload: WhaleCognitiveUpdate, message: WhaleHistoryMessage | undefined, revision: number, startedAt: number) => void;
  applyReflection: (
    result: { reflections: WhaleReflection[]; prunedFactIds?: string[]; resolvedLoopIds?: string[] },
    epoch: number,
    revision: number,
    now: number,
  ) => void;
  setActive: (on: boolean) => void;
  setMessages: (
    next: ChatMessage[] | ((prev: ChatMessage[]) => ChatMessage[]),
  ) => void;
  /** 收回人格：把这次聊的内容存进记忆，界面上先清空 */
  archive: () => void;
  /** 召唤时把之前存的记忆接回来 */
  restore: () => void;
  /** 长按选择性删除：同时从当前对话与记忆里移除 */
  removeMessages: (ids: string[]) => void;
  /** 彻底遗忘：清空当前对话与记忆 */
  clearMemory: () => void;
}

function parseMoodShift(raw: unknown): WhaleEmotionDelta | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? Math.max(-25, Math.min(25, v)) : 0);
  const pleasure = num(o.pleasure);
  const arousal = num(o.arousal);
  const dominance = num(o.dominance);
  const reason = typeof o.reason === "string" ? o.reason.trim().slice(0, 48) : "";
  if (!pleasure && !arousal && !dominance && !reason) return null;
  return { pleasure, arousal, dominance, reason };
}

export const useWhaleMemory = create<WhaleMemoryState>()(
  persist(
    (set, get) => ({
      hydrated: false,
      active: false,
      messages: [],
      memory: [],
      petMessages: [],
      facts: [],
      episodes: [],
      openLoops: [],
      reflections: [],
      emotion: createInitialEmotion(),
      bond: createInitialBondProfile(),
      autoMemory: true,
      autoReflect: true,
      turnsSinceReflect: 0,
      lastReflectedAt: 0,
      lastInteractionAt: 0,
      epoch: 0,
      revision: 0,
      setPetMessages: (next) =>
        set((s) => ({
          petMessages: cap(typeof next === "function" ? next(s.petMessages) : next),
        })),
      setAutoMemory: (on) => set((s) => ({ autoMemory: on, revision: s.revision + 1 })),
      setAutoReflect: (on) => set({ autoReflect: on }),
      saveFact: (text, id) =>
        set((s) => {
          const clean = text.trim().slice(0, 180);
          if (!clean || (!id && s.facts.length >= MAX_WHALE_FACTS)) return s;
          const previous = s.facts.find((f) => f.id === id);
          if (id && !previous) return s;
          const key = previous?.key ?? `manual-${uid()}`;
          const fact: WhaleFact = {
            id: previous?.id ?? uid(),
            key,
            text: clean,
            category: previous?.category ?? inferFactCategory(key, clean),
            importance: previous?.importance ?? 8,
            accessCount: previous?.accessCount ?? 1,
            source: "manual",
            sourceMessageId: previous?.sourceMessageId,
            updatedAt: Date.now(),
          };
          return {
            facts: previous ? s.facts.map((f) => (f.id === id ? fact : f)) : [...s.facts, fact],
            revision: s.revision + 1,
          };
        }),
      removeFact: (id) => {
        const sourceId = get().facts.find((f) => f.id === id)?.sourceMessageId;
        if (sourceId) get().removeMessages([sourceId]);
        set((s) => ({
          facts: s.facts.filter((f) => f.id !== id),
          revision: s.revision + 1,
          epoch: s.epoch + 1,
        }));
      },
      removeEpisode: (id) =>
        set((s) => ({
          episodes: s.episodes.filter((e) => e.id !== id),
          revision: s.revision + 1,
        })),
      removeOpenLoop: (id) =>
        set((s) => ({
          openLoops: s.openLoops.filter((l) => l.id !== id),
          revision: s.revision + 1,
        })),
      resolveOpenLoop: (id) =>
        set((s) => ({
          openLoops: s.openLoops.map((l) => (l.id === id ? { ...l, resolvedAt: Date.now() } : l)),
          revision: s.revision + 1,
        })),
      removeReflection: (id) =>
        set((s) => ({
          reflections: s.reflections.filter((r) => r.id !== id),
          revision: s.revision + 1,
        })),
      applyMood: (delta, now = Date.now()) =>
        set((s) => ({
          emotion: applyEmotionDelta(s.emotion, delta, now),
          lastInteractionAt: now,
        })),
      bumpBond: (kind, now = Date.now()) =>
        set((s) => ({
          bond: recordBondActivity(s.bond, kind, now),
          lastInteractionAt: now,
        })),
      learn: (updates, message, revision, startedAt) =>
        get().learnCognitive({ memoryUpdates: updates }, message, revision, startedAt),
      learnCognitive: (payload, message, revision, startedAt) =>
        set((s) => {
          if (s.revision !== revision) return s;
          const now = Math.max(startedAt, Date.now());
          const moodDelta = parseMoodShift(payload.moodShift);
          const nextEmotion = moodDelta
            ? applyEmotionDelta(s.emotion, moodDelta, now)
            : decayWhaleEmotion(s.emotion, now);
          const hasValidSource =
            !!message?.id &&
            [...s.messages, ...s.memory, ...s.petMessages].some(
              (m) => m.id === message.id && m.role === "user",
            );
          const nextBond = recordBondActivity(s.bond, "chat", now);
          if (!s.autoMemory || !hasValidSource) {
            return {
              emotion: nextEmotion,
              bond: nextBond,
              lastInteractionAt: now,
            };
          }
          return {
            facts: mergeWhaleFacts(s.facts, payload.memoryUpdates, message, startedAt),
            episodes: mergeWhaleEpisode(s.episodes, payload.episode, message, startedAt),
            openLoops: mergeWhaleOpenLoops(s.openLoops, payload.openLoop, message, startedAt),
            emotion: nextEmotion,
            bond: nextBond,
            turnsSinceReflect: s.turnsSinceReflect + 1,
            lastInteractionAt: now,
          };
        }),
      applyReflection: (result, epoch, revision, now) =>
        set((s) => {
          if (s.epoch !== epoch || s.revision !== revision) return s;
          const pruned = new Set(result.prunedFactIds ?? []);
          const resolved = new Set(result.resolvedLoopIds ?? []);
          const nextFacts = pruned.size
            ? s.facts.filter((f) => f.source === "manual" || !pruned.has(f.id))
            : s.facts;
          const nextLoops = resolved.size
            ? s.openLoops.map((l) => (resolved.has(l.id) && !l.resolvedAt ? { ...l, resolvedAt: now } : l))
            : s.openLoops;
          // 按文本去重追加新反思，并严格限制上限
          const existing = [...s.reflections];
          for (const item of result.reflections) {
            const dup = existing.findIndex(
              (r) => r.kind === item.kind && r.text.trim() === item.text.trim(),
            );
            if (dup >= 0) existing[dup] = { ...existing[dup], importance: Math.max(existing[dup].importance, item.importance), updatedAt: now };
            else existing.push(item);
          }
          const nextReflections = existing
            .sort((a, b) => b.importance - a.importance || b.updatedAt - a.updatedAt)
            .slice(0, MAX_WHALE_REFLECTIONS);
          return {
            facts: nextFacts,
            openLoops: nextLoops,
            reflections: nextReflections,
            turnsSinceReflect: 0,
            lastReflectedAt: now,
            bond: recordBondActivity(s.bond, "reflection", now),
          };
        }),
      setActive: (on) => set({ active: on }),
      setMessages: (next) =>
        set((s) => ({
          messages: cap(typeof next === "function" ? next(s.messages) : next),
        })),
      archive: () => {
        if (get().active) return;
        set((s) =>
          s.messages.length ? { memory: cap(s.messages), messages: [] } : { messages: [] },
        );
      },
      restore: () => {
        const { messages, memory } = get();
        if (!memory.length) return;
        const seen = new Set(messages.map((m) => m.id));
        set({
          messages: cap([...memory.filter((m) => !seen.has(m.id)), ...messages]),
          memory: [],
        });
      },
      removeMessages: (ids) => {
        if (!ids.length) return;
        const drop = new Set(ids);
        set((s) => ({
          messages: s.messages.filter((m) => !drop.has(m.id)),
          memory: s.memory.filter((m) => !drop.has(m.id)),
          petMessages: s.petMessages.filter((m) => !drop.has(m.id)),
          facts: s.facts.filter((f) => !f.sourceMessageId || !drop.has(f.sourceMessageId)),
          episodes: s.episodes.filter((e) => !e.sourceMessageId || !drop.has(e.sourceMessageId)),
          openLoops: s.openLoops.filter((l) => !l.sourceMessageId || !drop.has(l.sourceMessageId)),
          epoch: s.epoch + 1,
          revision: s.revision + 1,
        }));
      },
      clearMemory: () =>
        set((s) => ({
          messages: [],
          memory: [],
          petMessages: [],
          facts: [],
          episodes: [],
          openLoops: [],
          reflections: [],
          emotion: createInitialEmotion(),
          bond: createInitialBondProfile(),
          turnsSinceReflect: 0,
          lastReflectedAt: 0,
          epoch: s.epoch + 1,
          revision: s.revision + 1,
        })),
    }),
    {
      name: "dark-study-whale-memory",
      storage: coordinatedJSONStorage("courseflow-whale"),
      merge: (saved, current) => {
        const raw = (saved ?? {}) as Partial<WhaleMemoryState>;
        return {
          ...current,
          ...raw,
          messages: Array.isArray(raw.messages) ? cap(raw.messages) : current.messages,
          memory: Array.isArray(raw.memory) ? cap(raw.memory) : current.memory,
          petMessages: Array.isArray(raw.petMessages) ? cap(raw.petMessages) : current.petMessages,
          facts: Array.isArray(raw.facts) ? raw.facts.slice(-MAX_WHALE_FACTS) : current.facts,
          episodes: Array.isArray(raw.episodes) ? raw.episodes.slice(-MAX_WHALE_EPISODES) : current.episodes,
          openLoops: Array.isArray(raw.openLoops) ? raw.openLoops.slice(-MAX_WHALE_OPEN_LOOPS) : current.openLoops,
          reflections: Array.isArray(raw.reflections) ? raw.reflections.slice(-MAX_WHALE_REFLECTIONS) : current.reflections,
          emotion: normalizeWhaleEmotion(raw.emotion),
          bond: normalizeBondProfile(raw.bond),
          autoMemory: typeof raw.autoMemory === "boolean" ? raw.autoMemory : current.autoMemory,
          autoReflect: typeof raw.autoReflect === "boolean" ? raw.autoReflect : current.autoReflect,
          turnsSinceReflect: typeof raw.turnsSinceReflect === "number" && Number.isFinite(raw.turnsSinceReflect) ? Math.max(0, Math.round(raw.turnsSinceReflect)) : 0,
          lastReflectedAt: typeof raw.lastReflectedAt === "number" && Number.isFinite(raw.lastReflectedAt) ? raw.lastReflectedAt : 0,
          lastInteractionAt: typeof raw.lastInteractionAt === "number" && Number.isFinite(raw.lastInteractionAt) ? raw.lastInteractionAt : 0,
        };
      },
      onRehydrateStorage: () => () => useWhaleMemory.setState({ hydrated: true }),
      partialize: (s) => ({
        active: s.active,
        messages: s.messages,
        memory: s.memory,
        petMessages: s.petMessages,
        facts: s.facts,
        episodes: s.episodes,
        openLoops: s.openLoops,
        reflections: s.reflections,
        emotion: s.emotion,
        bond: s.bond,
        autoMemory: s.autoMemory,
        autoReflect: s.autoReflect,
        turnsSinceReflect: s.turnsSinceReflect,
        lastReflectedAt: s.lastReflectedAt,
        lastInteractionAt: s.lastInteractionAt,
      }),
    },
  ),
);
