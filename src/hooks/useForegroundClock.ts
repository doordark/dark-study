import { useFocusEffect } from "expo-router";
import { useCallback, useState } from "react";
import { AppState } from "react-native";

/** Refresh immediately on return; hidden screens and background apps do no polling. */
export function useForegroundClock(intervalMs = 30_000) {
  const [now, setNow] = useState(() => new Date());
  useFocusEffect(useCallback(() => {
    let timer: ReturnType<typeof setInterval> | undefined;
    const stop = () => { clearInterval(timer); timer = undefined; };
    const resume = () => {
      stop();
      if (AppState.currentState && AppState.currentState !== "active") return;
      setNow(new Date());
      timer = setInterval(() => setNow(new Date()), intervalMs);
    };
    const sub = AppState.addEventListener("change", (state) => {
      if (state === "active") resume(); else stop();
    });
    resume();
    return () => { stop(); sub.remove(); };
  }, [intervalMs]));
  return now;
}
