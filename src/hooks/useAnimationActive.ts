import { useSyncExternalStore } from "react";
import { foregroundStore } from '@/utils/foreground';

/** Lifecycle state changes only; never used as a sprite frame clock. */
export function useAnimationActive(active = true) {
  const foreground = useSyncExternalStore(foregroundStore.subscribe, foregroundStore.getSnapshot, foregroundStore.getServerSnapshot);
  return active && foreground;
}
