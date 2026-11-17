const writers = new Set<{ flush: () => Promise<void> }>();
let suspended = false;
export const areWritesSuspended = () => suspended;
export async function withPendingWritesSuspended<T>(action: () => Promise<T>) {
  if (suspended) throw new Error('数据恢复正在进行');
  suspended = true;
  try { await flushPendingWrites(); return await action(); }
  finally { suspended = false; }
}

/** One active write and one latest pending value; serialize only when writing. */
export function createCoalescedWriter<T>(write: (value: T) => Promise<void>, delayMs = 500) {
  let pending: { value: T } | undefined;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let running: Promise<void> | undefined;
  let lastError: unknown;
  const listeners = new Set<(error: unknown) => void>();
  const flush = (): Promise<void> => {
    clearTimeout(timer); timer = undefined;
    if (!running) running = (async () => {
      while (pending) {
        const next = pending; pending = undefined;
        try { await write(next.value); lastError = undefined; listeners.forEach(listener => listener(undefined)); }
        catch (error) { pending ??= next; lastError = error; listeners.forEach(listener => listener(error)); throw error; }
      }
    })().finally(() => { running = undefined; });
    // A new value can arrive between the drain loop and promise cleanup.
    // A flush barrier must also drain that value before a restore starts.
    return running.then(() => pending ? flush() : undefined);
  };
  const writer = {
    schedule(value: T) {
      if (suspended) return;
      writers.add(writer);
      pending = { value };
      clearTimeout(timer);
      timer = setTimeout(() => { void flush().catch(() => {}); }, delayMs);
    },
    flush,
    subscribe(listener: (error: unknown) => void) { listeners.add(listener); return () => { listeners.delete(listener); }; },
    get error() { return lastError; },
    dispose() { clearTimeout(timer); writers.delete(writer); },
  };
  return writer;
}

export async function flushPendingWrites() {
  const results = await Promise.allSettled([...writers].map(writer => writer.flush()));
  const failed = results.find((result): result is PromiseRejectedResult => result.status === 'rejected');
  if (failed) throw failed.reason;
}
