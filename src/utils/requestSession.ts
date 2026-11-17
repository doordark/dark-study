export interface RequestTicket { signal: AbortSignal; isCurrent: () => boolean }
/** Keep late callbacks harmless even when a transport ignores cancellation. */
export function createRequestSession() {
  let current: (RequestTicket & { controller: AbortController }) | undefined;
  let pending = false;
  const timers = new Set<ReturnType<typeof setTimeout>>();
  const cancel = () => {
    current?.controller.abort(); current = undefined; pending = false;
    timers.forEach(clearTimeout); timers.clear();
  };
  return {
    cancel,
    get pending() { return pending; },
    begin(waiting = true): RequestTicket {
      cancel();
      const controller = new AbortController();
      const ticket = { controller, signal: controller.signal, isCurrent: () => current === ticket && !controller.signal.aborted };
      current = ticket; pending = waiting;
      return ticket;
    },
    finish(ticket: RequestTicket) {
      if (!ticket.isCurrent()) return false;
      pending = false; return true;
    },
    defer(ticket: RequestTicket, callback: () => void, ms: number) {
      if (!ticket.isCurrent()) return;
      const timer = setTimeout(() => { timers.delete(timer); if (ticket.isCurrent()) callback(); }, ms);
      timers.add(timer);
    },
  };
}
