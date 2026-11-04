import type { FarmPoint } from '@/constants/farmMap';
import { farmSegmentClear, safeFarmPoint } from './farmNavigation';

const distance = (a: FarmPoint, b: FarmPoint) => Math.hypot(a.x - b.x, a.y - b.y);
const usable = (p: FarmPoint) => distance(p, safeFarmPoint(p)) < .1;

/** Reserve feet positions as well as destinations, so arrivals spread around a landmark. */
export function freeResidentSpot(anchor: FarmPoint, occupied: FarmPoint[], gap = 23): FarmPoint | null {
  for (const radius of [0, 16, 27, 39]) for (let i = 0; i < (radius ? 12 : 1); i++) {
    const angle = i * Math.PI / 6;
    const p = { x: anchor.x + Math.cos(angle) * radius, y: anchor.y + Math.sin(angle) * radius };
    if (usable(p) && farmSegmentClear(anchor, p) && occupied.every(o => distance(p, o) >= gap)) return p;
  }
  return null;
}

/** Short, visible approaches; never teleport a pair to a shared meeting point. */
export function conversationSpots(a: FarmPoint, b: FarmPoint, occupied: FarmPoint[]): [FarmPoint, FarmPoint] | null {
  const center = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
  for (const [dx, dy] of [[0, 0], [0, -18], [0, 18], [-18, 0], [18, 0], [0, 32], [0, -32]]) {
    for (const [sx, sy] of [[17, 0], [14, 14], [0, 19], [14, -14]]) {
      let p = { x: center.x + dx - sx, y: center.y + dy - sy };
      let q = { x: center.x + dx + sx, y: center.y + dy + sy };
      if (distance(a, p) + distance(b, q) > distance(a, q) + distance(b, p)) [p, q] = [q, p];
      if ([p, q].every(usable) && farmSegmentClear(a, p) && farmSegmentClear(b, q) &&
        occupied.every(o => distance(p, o) >= 23 && distance(q, o) >= 23)) return [p, q];
    }
  }
  return null;
}

export interface SpeechRect { left: number; top: number; width: number; height: number }
/** Newest cards win; cards that cannot fit without overlap stay in the conversation log. */
export function placeFarmSpeech(anchor: FarmPoint, width: number, height: number, cardWidth: number, cardHeight: number, used: SpeechRect[]): SpeechRect | null {
  for (const [dx, dy] of [[-cardWidth / 2, -cardHeight - 36], [-cardWidth / 2, 12], [-cardWidth - 18, -cardHeight / 2], [18, -cardHeight / 2], [-cardWidth / 2, -cardHeight * 2 - 44], [-cardWidth / 2, cardHeight + 20], [-cardWidth / 2, cardHeight * 2 + 28]]) {
    const r = { left: Math.max(6, Math.min(width - cardWidth - 6, anchor.x + dx)), top: Math.max(6, Math.min(height - cardHeight - 6, anchor.y + dy)), width: cardWidth, height: cardHeight };
    if (used.every(o => r.left + r.width + 6 <= o.left || o.left + o.width + 6 <= r.left || r.top + r.height + 6 <= o.top || o.top + o.height + 6 <= r.top)) return r;
  }
  return null;
}
