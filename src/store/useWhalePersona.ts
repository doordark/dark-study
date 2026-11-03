import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { DEFAULT_WHALE_PERSONA, normalizeWhalePersona, type WhalePersona } from "@/utils/whalePersona";
import { migratingStorage } from "@/utils/storage";

export const useWhalePersona = create<{
  persona: WhalePersona;
  hydrated: boolean;
  save: (persona: WhalePersona) => void;
}>()(
  persist(
    (set) => ({
      persona: normalizeWhalePersona(DEFAULT_WHALE_PERSONA),
      hydrated: false,
      save: (persona) => set({ persona: normalizeWhalePersona(persona) }),
    }),
    {
      name: "dark-study-whale-persona",
      storage: createJSONStorage(() => migratingStorage("dark-study-whale-persona")),
      partialize: (s) => ({ persona: s.persona }),
      merge: (saved, current) => ({ ...current, persona: normalizeWhalePersona((saved as { persona?: WhalePersona } | undefined)?.persona) }),
      onRehydrateStorage: () => () => useWhalePersona.setState({ hydrated: true }),
    },
  ),
);
