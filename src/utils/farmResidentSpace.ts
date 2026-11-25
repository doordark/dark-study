import type { FarmPoint } from '@/constants/farmMap';
import { farmSegmentClear, safeFarmPoint, waypointFarmRoute } from './farmNavigation';

const distance = (a: FarmPoint, b: FarmPoint) => Math.hypot(a.x - b.x, a.y - b.y);
const usable = (p: FarmPoint) => distance(p, safeFarmPoint(p)) < 0.1;

/** Reserve feet positions as well as destinations, so arrivals spread naturally around a landmark. */
export function freeResidentSpot(anchor: FarmPoint, occupied: FarmPoint[], gap = 23, preferToward?: FarmPoint): FarmPoint | null {
  for (const radius of [0, 16, 26, 36, 46]) {
    const count = radius === 0 ? 1 : radius <= 26 ? 12 : 16;
    const candidates: FarmPoint[] = [];
    for (let i = 0; i < count; i++) {
      const angle = i * (Math.PI * 2) / count;
      const p = { x: anchor.x + Math.cos(angle) * radius, y: anchor.y + Math.sin(angle) * radius };
      if (usable(p) && farmSegmentClear(anchor, p) && occupied.every(o => distance(p, o) >= gap)) {
        candidates.push(p);
      }
    }
    if (candidates.length) {
      if (preferToward) {
        candidates.sort((a, b) => distance(a, preferToward) - distance(b, preferToward));
      }
      return candidates[0];
    }
  }
  return null;
}

/** 找人转述/对话时的智能靠近站位：避免撞障碍或与其他人重叠，优先选择来向一侧的清晰面对面点位。 */
export function approachSpotForTarget(actorPos: FarmPoint, targetPos: FarmPoint, occupied: FarmPoint[]): FarmPoint | null {
  const radii = [16, 19, 21, 14];
  const candidates: { point: FarmPoint; score: number }[] = [];
  for (const radius of radii) {
    for (let i = 0; i < 12; i++) {
      const angle = i * (Math.PI / 6);
      const p = { x: targetPos.x + Math.cos(angle) * radius, y: targetPos.y + Math.sin(angle) * radius };
      if (!usable(p)) continue;
      if (!farmSegmentClear(targetPos, p)) continue;
      if (occupied.some(o => distance(p, o) < 18)) continue;
      // Prefer horizontally facing positions (cleaner 2.5D side-by-side visuals) and closer to actor
      const verticalPenalty = Math.abs(p.y - targetPos.y) * 0.45;
      const score = distance(actorPos, p) + verticalPenalty + Math.abs(radius - 17) * 1.5;
      candidates.push({ point: p, score });
    }
  }
  candidates.sort((a, b) => a.score - b.score);
  return candidates[0]?.point ?? null;
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

/** 3~6 人围坐讨论的自然环状站位：保证脚下互不重叠且全部可达、不穿障碍。 */
export function gatheringSpots(
  anchor: FarmPoint,
  origins: readonly FarmPoint[],
  occupied: FarmPoint[],
): FarmPoint[] | null {
  const count = origins.length;
  const slots: FarmPoint[] = [];
  const gap = count >= 5 ? 19 : 22;
  const baseRadius = count <= 3 ? 17 : count === 4 ? 21 : 25;

  for (let i = 0; i < count; i++) {
    const angle = (i / count) * Math.PI * 2 - Math.PI / 2;
    const ideal = {
      x: anchor.x + Math.cos(angle) * baseRadius,
      y: anchor.y + Math.sin(angle) * (baseRadius * 0.8),
    };
    const taken = [...occupied, ...slots];
    let picked: FarmPoint | null = null;
    if (usable(ideal) && farmSegmentClear(anchor, ideal) && taken.every(o => distance(ideal, o) >= gap)) {
      picked = ideal;
    } else {
      picked = freeResidentSpot(anchor, taken, gap, origins[i]);
    }
    if (!picked) return null;
    if (!farmSegmentClear(origins[i], picked) && !waypointFarmRoute(origins[i], picked).length) {
      return null;
    }
    slots.push(picked);
  }
  return slots;
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

export interface SpeechBubbleActorBox {
  id: string;
  /** 屏幕像素下的脚底中心坐标 */
  footX: number;
  footY: number;
  /** 人物视觉包围盒（屏幕像素） */
  left: number;
  top: number;
  width: number;
  height: number;
}

export interface SpeechBubbleInput {
  id: string;
  speakerId: string;
  /** 屏幕像素下的说话人头顶中心位置 */
  anchorX: number;
  anchorY: number;
  /** 脚底 Y，用于在顶部贴边翻转到下方时定位 */
  footY: number;
  text: string;
  priority: number;
}

export interface PlacedSpeechBubble {
  id: string;
  left: number;
  top: number;
  width: number;
  height: number;
  /** 箭头朝向：气泡在人上方时箭头朝下(bottom)，在人下方时箭头朝上(top)，在左侧时朝右(right)，在右侧时朝左(left) */
  tail: 'bottom' | 'top' | 'left' | 'right';
  /** 箭头沿该边相对气泡左上角的像素偏移 */
  tailOffset: number;
}

function rectsOverlapArea(a: SpeechRect, b: SpeechRect, pad = 0): number {
  const ox = Math.max(0, Math.min(a.left + a.width + pad, b.left + b.width + pad) - Math.max(a.left - pad, b.left - pad));
  const oy = Math.max(0, Math.min(a.top + a.height + pad, b.top + b.height + pad) - Math.max(a.top - pad, b.top - pad));
  return ox * oy;
}

function estimateBubbleHeight(text: string, cardWidth: number): number {
  // Title line ~19px + vertical padding 16px + 19px per body line
  const innerWidth = Math.max(80, cardWidth - 24);
  let units = 0;
  for (const ch of text) {
    units += /[\u0000-\u00ff]/.test(ch) ? 0.56 : 1;
  }
  const charsPerLine = Math.max(8, Math.floor(innerWidth / 12.8));
  const lines = Math.max(1, Math.min(7, Math.ceil(units / charsPerLine)));
  return 38 + lines * 18.5;
}

/**
 * 全局防重叠、防越界、防遮挡人物的气泡智能排版器：
 * - 严格保证所有可见气泡之间 0 重叠（含 6px 间距）且严格在地图视口安全区内；
 * - 当说话人靠近地图顶部时自动翻转到人物下方；
 * - 综合惩罚遮挡说话人本人及其他在场人物/名牌的面积，优先挑最清爽的空隙。
 */
export function layoutFarmSpeechBubbles(
  items: readonly SpeechBubbleInput[],
  bounds: { width: number; height: number; topSafe?: number; bottomSafe?: number },
  actors: readonly SpeechBubbleActorBox[],
  cardWidth: number,
): PlacedSpeechBubble[] {
  if (!items.length || bounds.width < 120 || bounds.height < 120) return [];
  const margin = 6;
  const topSafe = Math.max(margin, bounds.topSafe ?? 8);
  const bottomSafe = Math.max(margin, bounds.bottomSafe ?? 8);
  const maxWidth = Math.min(cardWidth, Math.max(120, bounds.width - margin * 2));
  const sorted = [...items].sort((a, b) => b.priority - a.priority);
  const placed: PlacedSpeechBubble[] = [];
  const usedRects: SpeechRect[] = [];

  for (const item of sorted) {
    const height = estimateBubbleHeight(item.text, maxWidth);
    const speakerBox = actors.find(a => a.id === item.speakerId);
    const spriteHalfW = speakerBox ? speakerBox.width / 2 : 14;
    const minTop = topSafe;
    const maxTop = Math.max(minTop, bounds.height - bottomSafe - height);
    const clampX = (raw: number) => Math.max(margin, Math.min(bounds.width - maxWidth - margin, raw));
    const clampY = (raw: number) => Math.max(minTop, Math.min(maxTop, raw));

    const candidates: { left: number; top: number; tail: PlacedSpeechBubble['tail']; baseCost: number }[] = [
      // 1. 正上方（首选）
      { left: clampX(item.anchorX - maxWidth / 2), top: item.anchorY - height - 10, tail: 'bottom', baseCost: 0 },
      // 2. 左上方 / 右上方微移（避开旁边紧贴的聊天搭档）
      { left: clampX(item.anchorX - maxWidth * 0.82), top: item.anchorY - height - 10, tail: 'bottom', baseCost: 14 },
      { left: clampX(item.anchorX - maxWidth * 0.18), top: item.anchorY - height - 10, tail: 'bottom', baseCost: 14 },
      // 3. 左侧 / 右侧（头顶挤满或贴顶时非常自然）
      { left: item.anchorX - spriteHalfW - maxWidth - 10, top: clampY(item.anchorY - height * 0.55), tail: 'right', baseCost: 24 },
      { left: item.anchorX + spriteHalfW + 10, top: clampY(item.anchorY - height * 0.55), tail: 'left', baseCost: 24 },
      { left: item.anchorX + spriteHalfW + 10, top: minTop, tail: 'left', baseCost: 28 },
      { left: item.anchorX - spriteHalfW - maxWidth - 10, top: minTop, tail: 'right', baseCost: 28 },
      // 4. 正下方 / 左下 / 右下（靠地图顶部小屋/上田时自动翻转到底部，绝不截断）
      { left: clampX(item.anchorX - maxWidth / 2), top: item.footY + 8, tail: 'top', baseCost: 32 },
      { left: clampX(item.anchorX - maxWidth * 0.82), top: item.footY + 8, tail: 'top', baseCost: 40 },
      { left: clampX(item.anchorX - maxWidth * 0.18), top: item.footY + 8, tail: 'top', baseCost: 40 },
      // 5. 更高上方（双层错落，用于多人紧挨同时有气泡）
      { left: clampX(item.anchorX - maxWidth / 2), top: item.anchorY - height * 2 - 22, tail: 'bottom', baseCost: 58 },
      { left: clampX(item.anchorX - maxWidth / 2), top: item.footY + height + 18, tail: 'top', baseCost: 68 },
    ];

    let best: { rect: SpeechRect; tail: PlacedSpeechBubble['tail']; cost: number } | null = null;
    for (const cand of candidates) {
      // Strictly inside viewport bounds (do not silently crush a side candidate onto the speaker)
      if (cand.left < margin || cand.left + maxWidth > bounds.width - margin) continue;
      if (cand.top < minTop || cand.top + height > bounds.height - bottomSafe) continue;

      const rect: SpeechRect = { left: cand.left, top: cand.top, width: maxWidth, height };
      // Hard rule: ZERO overlap with already-placed bubbles (with 6px visual gap)
      if (usedRects.some(other => rectsOverlapArea(rect, other, 3) > 0)) continue;

      let cost = cand.baseCost;
      // Strongly avoid covering the speaker's own body/nameplate
      if (speakerBox) {
        const selfOverlap = rectsOverlapArea(rect, speakerBox, 2);
        cost += selfOverlap * 0.45;
      }
      // Avoid covering other residents or player heads/nameplates
      for (const actor of actors) {
        if (actor.id === item.speakerId) continue;
        const overlap = rectsOverlapArea(rect, actor, 1);
        if (overlap > 0) cost += 22 + overlap * 0.08;
      }
      // Mild preference for staying close to speaker anchor
      const centerX = rect.left + rect.width / 2;
      const centerY = rect.top + rect.height / 2;
      cost += Math.hypot(centerX - item.anchorX, centerY - item.anchorY) * 0.08;

      if (!best || cost < best.cost) {
        best = { rect, tail: cand.tail, cost };
      }
    }

    // Last-resort clamped fallback if the scene is extraordinarily dense (still guarantees no bubble overlap)
    if (!best) {
      const fallback = placeFarmSpeech({ x: item.anchorX, y: item.anchorY }, bounds.width, bounds.height, maxWidth, height, usedRects);
      if (fallback) {
        const clampedTop = clampY(fallback.top);
        const rect: SpeechRect = { left: fallback.left, top: clampedTop, width: maxWidth, height };
        const clearOfSelf = !speakerBox || rectsOverlapArea(rect, speakerBox, 0) < speakerBox.width * speakerBox.height * 0.25;
        if (clearOfSelf && usedRects.every(other => rectsOverlapArea(rect, other, 2) === 0)) {
          const tail: PlacedSpeechBubble['tail'] =
            rect.left >= item.anchorX + 4 ? 'left'
              : rect.left + rect.width <= item.anchorX - 4 ? 'right'
                : clampedTop >= item.anchorY ? 'top' : 'bottom';
          best = { rect, tail, cost: 200 };
        }
      }
    }

    if (best) {
      usedRects.push(best.rect);
      const tailOffset = best.tail === 'bottom' || best.tail === 'top'
        ? Math.max(16, Math.min(maxWidth - 16, item.anchorX - best.rect.left))
        : Math.max(14, Math.min(best.rect.height - 14, item.anchorY - best.rect.top));
      placed.push({
        id: item.id,
        left: best.rect.left,
        top: best.rect.top,
        width: best.rect.width,
        height: best.rect.height,
        tail: best.tail,
        tailOffset,
      });
    }
  }

  return placed;
}
