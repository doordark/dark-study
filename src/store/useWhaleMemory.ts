import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

import type { ChatMessage } from "@/types";
import { migratingStorage } from "@/utils/storage";
import { MAX_WHALE_FACTS, mergeWhaleFacts, type WhaleFact, type WhaleHistoryMessage } from "@/utils/whaleMemory";
import { uid } from "@/utils/id";

/** 记忆上限：超出后丢掉最早的对话，避免存档无限膨胀 */
const MAX_MESSAGES = 200;

const cap = (list: ChatMessage[]) =>
  list.length > MAX_MESSAGES ? list.slice(list.length - MAX_MESSAGES) : list;

interface WhaleMemoryState {
  hydrated: boolean;
  /** 是否处于大肥鱼人格（召唤过一次且没被收回） */
  active: boolean;
  /** 当前这段对话 */
  messages: ChatMessage[];
  /** 收回人格后归档的记忆，下次召唤时接着聊 */
  memory: ChatMessage[];
  petMessages: ChatMessage[];
  facts: WhaleFact[];
  autoMemory: boolean;
  /** 遗忘后阻止正在进行的请求把旧内容写回来。 */
  epoch: number;
  revision: number;
  setPetMessages: (next: ChatMessage[] | ((prev: ChatMessage[]) => ChatMessage[])) => void;
  setAutoMemory: (on: boolean) => void;
  saveFact: (text: string, id?: string) => void;
  removeFact: (id: string) => void;
  learn: (updates: unknown, message: WhaleHistoryMessage | undefined, revision: number, startedAt: number) => void;
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

export const useWhaleMemory = create<WhaleMemoryState>()(
  persist(
    (set, get) => ({
      hydrated: false,
      active: false,
      messages: [],
      memory: [],
      petMessages: [],
      facts: [],
      autoMemory: true,
      epoch: 0,
      revision: 0,
      setPetMessages: (next) => set((s) => ({
        petMessages: cap(typeof next === "function" ? next(s.petMessages) : next),
      })),
      setAutoMemory: (on) => set((s) => ({ autoMemory: on, revision: s.revision + 1 })),
      saveFact: (text, id) => set((s) => {
        const clean = text.trim().slice(0, 180);
        if (!clean || (!id && s.facts.length >= MAX_WHALE_FACTS)) return s;
        const previous = s.facts.find((f) => f.id === id);
        if (id && !previous) return s;
        const fact: WhaleFact = { id: previous?.id ?? uid(), key: previous?.key ?? `manual-${uid()}`, text: clean, source: "manual", sourceMessageId: previous?.sourceMessageId, updatedAt: Date.now() };
        return { facts: previous ? s.facts.map((f) => f.id === id ? fact : f) : [...s.facts, fact], revision: s.revision + 1 };
      }),
      removeFact: (id) => {
        const sourceId = get().facts.find((f) => f.id === id)?.sourceMessageId;
        if (sourceId) get().removeMessages([sourceId]);
        set((s) => ({ facts: s.facts.filter((f) => f.id !== id), revision: s.revision + 1, epoch: s.epoch + 1 }));
      },
      learn: (updates, message, revision, startedAt) => set((s) => {
        if (!s.autoMemory || s.revision !== revision) return s;
        // 没有来源消息的请求（如临时快速改课）不应创建长期事实。
        if (!message?.id || ![...s.messages, ...s.memory, ...s.petMessages].some((m) => m.id === message.id && m.role === "user")) return s;
        return { facts: mergeWhaleFacts(s.facts, updates, message, startedAt) };
      }),
      setActive: (on) => set({ active: on }),
      setMessages: (next) =>
        set((s) => ({
          messages: cap(
            typeof next === "function" ? next(s.messages) : next,
          ),
        })),
      archive: () => {
        // 退场动画还没收完就又把她叫回来了：这段对话还在继续，别归档把它抹掉
        if (get().active) return;
        set((s) =>
          // 收回人格时把这段对话存成记忆（重进时原样接回来，不会重复堆叠）
          s.messages.length
            ? { memory: cap(s.messages), messages: [] }
            : { messages: [] },
        );
      },
      restore: () => {
        const { messages, memory } = get();
        if (!memory.length) return;
        // 把记住的那段对话接回最前面：不管召唤时列表里已经有几句，
        // 都能看到上次聊的内容，而不是被一句开场白顶掉
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
          epoch: s.epoch + 1,
          revision: s.revision + 1,
        }));
      },
      clearMemory: () => set((s) => ({ messages: [], memory: [], petMessages: [], facts: [], epoch: s.epoch + 1, revision: s.revision + 1 })),
    }),
    {
      name: "dark-study-whale-memory",
      storage: createJSONStorage(() => migratingStorage("courseflow-whale")),
      onRehydrateStorage: () => () => useWhaleMemory.setState({ hydrated: true }),
      partialize: (s) => ({
        active: s.active,
        messages: s.messages,
        memory: s.memory,
        petMessages: s.petMessages,
        facts: s.facts,
        autoMemory: s.autoMemory,
      }),
    },
  ),
);
