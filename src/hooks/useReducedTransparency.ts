import { useSyncExternalStore } from "react";
import { AccessibilityInfo, Platform } from "react-native";

// One native listener for all glass surfaces, including native modal windows.
let reduced = false;
let cleanup: (() => void) | undefined;
const listeners = new Set<() => void>();

function subscribe(listener: () => void) {
  if (Platform.OS !== "ios") return () => {};
  listeners.add(listener);
  if (listeners.size === 1) {
    let active = true;
    let receivedEvent = false;
    const update = (value: boolean) => {
      if (!active || reduced === value) return;
      reduced = value;
      listeners.forEach((notify) => notify());
    };
    const subscription = AccessibilityInfo.addEventListener("reduceTransparencyChanged", (value) => {
      receivedEvent = true;
      update(value);
    });
    void AccessibilityInfo.isReduceTransparencyEnabled().then((value) => {
      if (!receivedEvent) update(value);
    }).catch(() => {});
    cleanup = () => { active = false; subscription.remove(); };
  }
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0) {
      cleanup?.();
      cleanup = undefined;
    }
  };
}

export function useReducedTransparency() {
  return useSyncExternalStore(subscribe, () => reduced, () => false);
}
