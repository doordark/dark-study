import { useWhaleMemory } from "@/store/useWhaleMemory";
import { useWhalePersona } from "@/store/useWhalePersona";
import { buildWhalePersonaPrompt, normalizeWhaleHistory } from "@/utils/whalePersona";
import { buildWhaleMemoryPrompt, WHALE_MEMORY_INSTRUCTIONS, type WhaleHistoryMessage } from "@/utils/whaleMemory";

/** 每次请求读取最新保存的人设；两种聊天入口共享事实和旧对话。 */
export function createWhaleContext(history: WhaleHistoryMessage[], extract = true) {
  const state = useWhaleMemory.getState();
  const persona = useWhalePersona.getState().persona;
  const startedAt = Date.now();
  const logs = [...new Map([...state.memory, ...state.messages, ...state.petMessages].map((m) => [m.id, m])).values()]
    .sort((a, b) => a.timestamp - b.timestamp);
  const latest = history.filter((m) => m.role === "user").at(-1);
  return {
    prompt: `${buildWhalePersonaPrompt(persona)}\n${buildWhaleMemoryPrompt(state.facts, normalizeWhaleHistory(logs, persona), history)}${extract && state.autoMemory ? WHALE_MEMORY_INSTRUCTIONS : "\n不要生成 memoryUpdates。"}`,
    history: normalizeWhaleHistory(history, persona),
    remember: (updates: unknown) => {
      if (extract) useWhaleMemory.getState().learn(updates, latest, state.revision, startedAt);
    },
  };
}
