import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

import type { ChatMessage } from "@/types";
import { migratingStorage } from "@/utils/storage";

/** 记忆上限：超出后丢掉最早的对话，避免存档无限膨胀 */
const MAX_MESSAGES = 200;

const cap = (list: ChatMessage[]) =>
  list.length > MAX_MESSAGES ? list.slice(list.length - MAX_MESSAGES) : list;

interface WhaleMemoryState {
  /** 是否处于大肥鱼人格（召唤过一次且没被收回） */
  active: boolean;
  /** 当前这段对话 */
  messages: ChatMessage[];
  /** 收回人格后归档的记忆，下次召唤时接着聊 */
  memory: ChatMessage[];
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
      active: false,
      messages: [],
      memory: [],
      setActive: (on) => set({ active: on }),
      setMessages: (next) =>
        set((s) => ({
          messages: cap(
            typeof next === "function" ? next(s.messages) : next,
          ),
        })),
      archive: () =>
        set((s) =>
          // 收回人格时把这段对话存成记忆（重进时原样接回来，不会重复堆叠）
          s.messages.length
            ? { memory: cap(s.messages), messages: [] }
            : { messages: [] },
        ),
      restore: () => {
        const { messages, memory } = get();
        if (messages.length || !memory.length) return;
        set({ messages: cap(memory) });
      },
      removeMessages: (ids) => {
        if (!ids.length) return;
        const drop = new Set(ids);
        set((s) => ({
          messages: s.messages.filter((m) => !drop.has(m.id)),
          memory: s.memory.filter((m) => !drop.has(m.id)),
        }));
      },
      clearMemory: () => set({ messages: [], memory: [] }),
    }),
    {
      name: "dark-study-whale-memory",
      storage: createJSONStorage(() => migratingStorage("courseflow-whale")),
      partialize: (s) => ({
        active: s.active,
        messages: s.messages,
        memory: s.memory,
      }),
    },
  ),
);
