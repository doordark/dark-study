import { create } from "zustand";
import { persist } from "zustand/middleware";
import {
  DEFAULT_WHALE_PERSONA,
  getWhaleAgentConfig,
  normalizeWhalePersona,
  type WhaleAgentConfig,
  type WhalePersona,
} from "@/utils/whalePersona";
import { coordinatedJSONStorage } from "@/utils/storage";

export const useWhalePersona = create<{
  persona: WhalePersona;
  hydrated: boolean;
  save: (persona: WhalePersona) => void;
  updatePersona: (patch: Partial<WhalePersona>) => void;
  updateAgent: (patch: Partial<WhaleAgentConfig>) => void;
}>()(
  persist(
    (set) => ({
      persona: normalizeWhalePersona(DEFAULT_WHALE_PERSONA),
      hydrated: false,
      save: (persona) => set({ persona: normalizeWhalePersona(persona) }),
      updatePersona: (patch) =>
        set((state) => ({
          persona: normalizeWhalePersona({ ...state.persona, ...patch }),
        })),
      updateAgent: (patch) =>
        set((state) => {
          const cur = getWhaleAgentConfig(state.persona);
          return {
            persona: normalizeWhalePersona({
              ...state.persona,
              agent: {
                ...cur,
                ...patch,
                skills: { ...cur.skills, ...(patch.skills ?? {}) },
              },
            }),
          };
        }),
    }),
    {
      name: "dark-study-whale-persona",
      storage: coordinatedJSONStorage("dark-study-whale-persona"),
      partialize: (s) => ({ persona: s.persona }),
      merge: (saved, current) => ({
        ...current,
        persona: normalizeWhalePersona(
          (saved as { persona?: WhalePersona } | undefined)?.persona,
        ),
      }),
      onRehydrateStorage: () => () => useWhalePersona.setState({ hydrated: true }),
    },
  ),
);
