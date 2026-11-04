import { useEffect } from "react";
import { AppState } from "react-native";
import { desktopPetAvailable, subscribeDesktopPet } from "@/services/desktopPet";
import { useDesktopPet } from "@/store/useDesktopPet";
import { useWhaleMemory } from "@/store/useWhaleMemory";

/** Native foreground service owns the overlay even when this React tree is stopped. */
export function useDesktopPetSync() {
  const refresh = useDesktopPet((s) => s.refresh);
  const hydrated = useWhaleMemory((s) => s.hydrated);
  useEffect(() => {
    if (!desktopPetAvailable) return;
    const sync = () => { void refresh().catch(() => {}); };
    sync();
    const off = subscribeDesktopPet(sync);
    const state = AppState.addEventListener("change", (next) => { if (next === "active") sync(); });
    return () => { off(); state.remove(); };
  }, [refresh, hydrated]);
}
