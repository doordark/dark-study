import { AppState } from 'react-native';
const listeners = new Set<() => void>();
const read = () => !AppState.currentState || AppState.currentState === 'active';
let foreground = read();
let subscription: ReturnType<typeof AppState.addEventListener> | undefined;
export const foregroundStore = {
  getSnapshot: () => listeners.size ? foreground : read(),
  getServerSnapshot: () => true,
  subscribe(listener: () => void) {
    if (!listeners.size) {
      foreground = read();
      subscription = AppState.addEventListener('change', state => {
        const next = state === 'active';
        if (foreground === next) return;
        foreground = next; [...listeners].forEach(notify => notify());
      });
    }
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
      if (!listeners.size) { subscription?.remove(); subscription = undefined; }
    };
  },
};
