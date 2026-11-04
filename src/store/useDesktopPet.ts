import { create } from "zustand";
import { acknowledgeDesktopImpact, emptyDesktopPetStatus, getDesktopPetStatus, type DesktopPetStatus } from "@/services/desktopPet";
import { useWhaleMemory } from "@/store/useWhaleMemory";

export const useDesktopPet = create<DesktopPetStatus & { refresh: () => Promise<void> }>((set) => ({
  ...emptyDesktopPetStatus,
  refresh: async () => {
    const status = await getDesktopPetStatus();
    set(status);
    // Import the last desktop bump once when JS resumes. No AI call or quota use.
    if (status.lastImpactAt && status.lastImpactText && useWhaleMemory.getState().hydrated) {
      const id = `desktop-impact-${status.lastImpactAt}`;
      const memory = useWhaleMemory.getState();
      if (!memory.petMessages.some((m) => m.id === id)) memory.setPetMessages((prev) => [...prev, {
        id, role: "assistant", content: status.lastImpactText, timestamp: status.lastImpactAt,
      }]);
      await acknowledgeDesktopImpact(status.lastImpactAt);
    }
  },
}));
