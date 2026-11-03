import { useEffect, useState } from "react";
import { AppState } from "react-native";

/** Lifecycle state changes only; never used as a sprite frame clock. */
export function useAnimationActive(active = true) {
  const [foreground, setForeground] = useState(() => !AppState.currentState || AppState.currentState === "active");
  useEffect(() => {
    const sub = AppState.addEventListener("change", (state) => setForeground(state === "active"));
    return () => sub.remove();
  }, []);
  return active && foreground;
}
