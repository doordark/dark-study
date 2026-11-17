export type RequestPriority = 'interactive' | 'background';
export interface RequestOptions { signal?: AbortSignal; priority?: RequestPriority; label?: string; waitMs?: number }
interface RequestRecord { label: string; priority: RequestPriority; waitMs: number; durationMs: number; outcome: 'success' | 'failed' | 'cancelled' }
export function requestCancelled() { const error = new Error('请求已取消'); error.name = 'AbortError'; return error; }

/** Reserve one lane for foreground actions; queued foreground work goes first. */
export function createRequestCoordinator(limit = 2) {
  type Job = { priority: RequestPriority; start: () => void; cancel: (error: Error) => void };
  const queue: Job[] = [], listeners = new Set<() => void>();
  const controllers = new Set<AbortController>();
  let active = 0, background = 0;
  let paused = false;
  let snapshot = { active: 0, queued: 0, background: 0, recent: [] as RequestRecord[] };
  const notify = () => {
    snapshot = { ...snapshot, active, queued: queue.length, background };
    listeners.forEach(listener => listener());
  };
  const drain = () => {
    while (active < limit) {
      const index = queue.findIndex(job => job.priority === 'interactive');
      const next = index >= 0 ? index : queue.findIndex(job => job.priority === 'background' && background < Math.max(1, limit - 1));
      if (next < 0) break;
      queue.splice(next, 1)[0].start();
    }
    notify();
  };
  return {
    getSnapshot: () => snapshot,
    subscribe(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; },
    cancelAll() { [...controllers].forEach(controller => controller.abort()); },
    setPaused(value: boolean) { paused = value; if (paused) [...controllers].forEach(controller => controller.abort()); },
    run<T>(task: (signal: AbortSignal) => Promise<T>, options: RequestOptions = {}): Promise<T> {
      if (paused) return Promise.reject(requestCancelled());
      if (options.signal?.aborted) return Promise.reject(requestCancelled());
      const controller = new AbortController();
      controllers.add(controller);
      const priority = options.priority ?? 'interactive', queuedAt = Date.now();
      return new Promise<T>((resolve, reject) => {
        let started = false;
        let timer: ReturnType<typeof setTimeout> | undefined;
        const cleanup = () => { clearTimeout(timer); options.signal?.removeEventListener('abort', externalAbort); controller.signal.removeEventListener('abort', abort); controllers.delete(controller); };
        const record = (outcome: RequestRecord['outcome'], startedAt: number) => {
          snapshot = { ...snapshot, recent: [{ label: options.label ?? 'AI', priority, waitMs: startedAt - queuedAt, durationMs: Date.now() - startedAt, outcome }, ...snapshot.recent].slice(0, 20) };
        };
        const job: Job = {
          priority,
          cancel(error) {
            if (started) return;
            const index = queue.indexOf(job); if (index >= 0) queue.splice(index, 1);
            cleanup(); record(error.name === 'AbortError' ? 'cancelled' : 'failed', Date.now()); reject(error); drain();
          },
          start() {
            started = true; clearTimeout(timer); controller.signal.removeEventListener('abort', abort);
            active++; if (priority === 'background') background++;
            const startedAt = Date.now();
            Promise.resolve().then(() => {
              if (controller.signal.aborted) throw requestCancelled();
              return task(controller.signal);
            }).then(value => {
              if (controller.signal.aborted) { record('cancelled', startedAt); reject(requestCancelled()); }
              else { record('success', startedAt); resolve(value); }
            }, error => {
              record(controller.signal.aborted || error?.name === 'AbortError' ? 'cancelled' : 'failed', startedAt); reject(error);
            }).finally(() => { cleanup(); active--; if (priority === 'background') background--; drain(); });
          },
        };
        const abort = () => job.cancel(requestCancelled());
        const externalAbort = () => controller.abort();
        options.signal?.addEventListener('abort', externalAbort, { once: true });
        controller.signal.addEventListener('abort', abort, { once: true });
        queue.push(job);
        timer = setTimeout(() => job.cancel(new Error(priority === 'background' ? '主动请求优先，后台对话本轮暂停' : '请求排队超时，请稍后重试')), options.waitMs ?? (priority === 'background' ? 2000 : 30000));
        drain();
      });
    },
  };
}

export const aiRequests = createRequestCoordinator();
export const runAIRequest = aiRequests.run;
