import AsyncStorage from '@react-native-async-storage/async-storage';
import { createCoalescedWriter, areWritesSuspended } from './coalescedWriter';
type Operation = { type: 'json'; value: unknown } | { type: 'text'; value: string } | { type: 'remove'; keys: string[] };
const writers = new Map<string, ReturnType<typeof createCoalescedWriter<Operation>>>();
const listeners = new Set<() => void>();
const errors = new Set<string>();
let snapshot: readonly string[] = [];
const changed = () => { snapshot = [...errors]; listeners.forEach(listener => listener()); };
function writerFor(key: string, delayMs = 0) {
  let writer = writers.get(key);
  if (!writer) {
    writer = createCoalescedWriter<Operation>(async operation => {
      if (operation.type === 'remove') for (const name of operation.keys) await AsyncStorage.removeItem(name);
      else await AsyncStorage.setItem(key, operation.type === 'json' ? JSON.stringify(operation.value) : operation.value);
    }, delayMs);
    writer.subscribe(error => {
      const hadError = errors.has(key);
      if (error) errors.add(key); else errors.delete(key);
      if (hadError !== errors.has(key)) changed();
    });
    writers.set(key, writer);
  }
  return writer;
}
function enqueue(key: string, operation: Operation): Promise<void> {
  // Hydration callbacks and late async completions cannot overwrite a restore.
  if (areWritesSuspended()) return Promise.resolve();
  const writer = writerFor(key);
  writer.schedule(operation);
  // Coalesce synchronous updates and updates arriving during an active write.
  const saved = Promise.resolve().then(() => writer.flush());
  // Zustand actions do not await persistence; expose errors without unhandled rejections.
  void saved.catch(() => {});
  return saved;
}
export const setStoredJSON = (key: string, value: unknown) => enqueue(key, { type: 'json', value });
export const setStoredText = (key: string, value: string) => enqueue(key, { type: 'text', value });
export const removeStoredKeys = (key: string, keys: string[]) => enqueue(key, { type: 'remove', keys });
/** A scene can debounce a large save without owning a separate, disposable queue. */
export function deferredJSONWriter<T>(key: string, delayMs = 500) {
  const writer = writerFor(key, delayMs);
  return {
    schedule(value: T) { if (!areWritesSuspended()) writer.schedule({ type: 'json', value }); },
    flush: writer.flush,
    subscribe: writer.subscribe,
  };
}
export async function getStoredText(key: string) {
  await writers.get(key)?.flush();
  return AsyncStorage.getItem(key);
}
export const storageHealth = {
  getSnapshot: () => snapshot,
  subscribe(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; },
};
