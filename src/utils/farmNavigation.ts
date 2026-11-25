import { BLOCKERS, WALK_BOUNDS, WAYPOINTS, type FarmPoint, type FarmRect, type WaypointId } from '@/constants/farmMap';

const MARGIN = 2;
const expand = (b: FarmRect): FarmRect => ({
  x: b.x - MARGIN,
  y: b.y - MARGIN,
  w: b.w + MARGIN * 2,
  h: b.h + MARGIN * 2,
});
const obstacles = BLOCKERS.map(expand);
const inside = (p: FarmPoint, b: FarmRect) => p.x > b.x && p.x < b.x + b.w && p.y > b.y && p.y < b.y + b.h;
const inWorld = (p: FarmPoint) =>
  p.x >= WALK_BOUNDS.x && p.x <= WALK_BOUNDS.x + WALK_BOUNDS.w &&
  p.y >= WALK_BOUNDS.y && p.y <= WALK_BOUNDS.y + WALK_BOUNDS.h;
const distance = (a: FarmPoint, b: FarmPoint) => Math.hypot(a.x - b.x, a.y - b.y);

export function safeFarmPoint(point: FarmPoint): FarmPoint {
  const p = {
    x: Math.max(WALK_BOUNDS.x, Math.min(WALK_BOUNDS.x + WALK_BOUNDS.w, point.x)),
    y: Math.max(WALK_BOUNDS.y, Math.min(WALK_BOUNDS.y + WALK_BOUNDS.h, point.y)),
  };
  for (let pass = 0; pass < obstacles.length; pass++) {
    const blocked = obstacles.find(b => inside(p, b));
    if (!blocked) return p;
    const exits = [
      { x: blocked.x - 0.2, y: p.y },
      { x: blocked.x + blocked.w + 0.2, y: p.y },
      { x: p.x, y: blocked.y - 0.2 },
      { x: p.x, y: blocked.y + blocked.h + 0.2 },
    ];
    exits.sort((a, b) => distance(a, p) - distance(b, p));
    Object.assign(p, exits.find(v => inWorld(v) && !obstacles.some(b => inside(v, b))) ?? exits.find(inWorld) ?? p);
  }
  return p;
}

/** Slab intersection with the OPEN interior; touching a collision boundary is safe. */
function crosses(a: FarmPoint, b: FarmPoint, box: FarmRect): boolean {
  let low = 0;
  let high = 1;
  for (const axis of ['x', 'y'] as const) {
    const min = box[axis] + 0.001;
    const max = box[axis] + (axis === 'x' ? box.w : box.h) - 0.001;
    const delta = b[axis] - a[axis];
    if (Math.abs(delta) < 0.00001) {
      if (a[axis] <= min || a[axis] >= max) return false;
    } else {
      const t1 = (min - a[axis]) / delta;
      const t2 = (max - a[axis]) / delta;
      low = Math.max(low, Math.min(t1, t2));
      high = Math.min(high, Math.max(t1, t2));
      if (low > high) return false;
    }
  }
  return high > 0 && low < 1;
}

export const farmSegmentClear = (a: FarmPoint, b: FarmPoint) => !obstacles.some(box => crosses(a, b, box));

export function nearestFarmWaypoint(point: FarmPoint): WaypointId {
  return (Object.keys(WAYPOINTS) as WaypointId[])
    .filter(id => farmSegmentClear(point, WAYPOINTS[id]))
    .sort((a, b) => distance(point, WAYPOINTS[a]) - distance(point, WAYPOINTS[b]))[0] ?? 'plaza';
}

/** 视线拉直平滑（String-Pulling）：在严格不穿障碍的前提下消去折返与冗余拐点。 */
export function smoothFarmRoute(start: FarmPoint, points: readonly FarmPoint[]): FarmPoint[] {
  const cleaned: FarmPoint[] = [];
  let prev = start;
  for (const pt of points) {
    if (distance(prev, pt) >= 0.1) {
      cleaned.push(pt);
      prev = pt;
    }
  }
  if (cleaned.length <= 1) return cleaned;
  const result: FarmPoint[] = [];
  let anchor = start;
  let index = 0;
  while (index < cleaned.length) {
    let furthest = index;
    for (let j = cleaned.length - 1; j > index; j--) {
      if (farmSegmentClear(anchor, cleaned[j])) {
        furthest = j;
        break;
      }
    }
    const next = cleaned[furthest];
    result.push(next);
    anchor = next;
    index = furthest + 1;
  }
  return result;
}

/** 按真实欧氏距离加权 Dijkstra 寻路 + 视线拉直平滑，消除“之”字绕路与折返。 */
export function waypointFarmRoute(from: FarmPoint, to: FarmPoint): FarmPoint[] {
  const start = safeFarmPoint(from);
  const end = safeFarmPoint(to);
  if (distance(start, end) < 0.1) return [];
  if (distance(start, end) < 34 && farmSegmentClear(start, end)) return [end];

  const allIds = Object.keys(WAYPOINTS) as WaypointId[];
  const clearFromStart = allIds
    .filter(id => farmSegmentClear(start, WAYPOINTS[id]))
    .sort((a, b) => distance(start, WAYPOINTS[a]) - distance(start, WAYPOINTS[b]))
    .slice(0, 3);
  const clearToEnd = new Set(
    allIds
      .filter(id => farmSegmentClear(WAYPOINTS[id], end))
      .sort((a, b) => distance(WAYPOINTS[a], end) - distance(WAYPOINTS[b], end))
      .slice(0, 3),
  );
  if (!clearFromStart.length || !clearToEnd.size) return planFarmRoute(start, end);

  const costs = new Map<WaypointId, number>();
  const previous = new Map<WaypointId, WaypointId | null>();
  const visited = new Set<WaypointId>();
  for (const id of clearFromStart) {
    costs.set(id, distance(start, WAYPOINTS[id]));
    previous.set(id, null);
  }

  let bestEnd: WaypointId | null = null;
  let bestTotal = Infinity;

  while (visited.size < allIds.length) {
    let current: WaypointId | null = null;
    let currentCost = Infinity;
    for (const [id, cost] of costs) {
      if (!visited.has(id) && cost < currentCost) {
        current = id;
        currentCost = cost;
      }
    }
    if (!current || currentCost >= bestTotal) break;
    visited.add(current);

    if (clearToEnd.has(current)) {
      const total = currentCost + distance(WAYPOINTS[current], end);
      if (total < bestTotal) {
        bestTotal = total;
        bestEnd = current;
      }
    }

    for (const next of WAYPOINTS[current].neighbors) {
      if (visited.has(next)) continue;
      const nextCost = currentCost + distance(WAYPOINTS[current], WAYPOINTS[next]);
      if (nextCost < (costs.get(next) ?? Infinity)) {
        costs.set(next, nextCost);
        previous.set(next, current);
      }
    }
  }

  if (!bestEnd) return planFarmRoute(start, end);
  const ids: WaypointId[] = [];
  let cursor: WaypointId | null = bestEnd;
  while (cursor) {
    ids.unshift(cursor);
    cursor = previous.get(cursor) ?? null;
  }
  const raw = [...ids.map(id => ({ x: WAYPOINTS[id].x, y: WAYPOINTS[id].y })), end];
  let last = start;
  for (const point of raw) {
    if (distance(last, point) >= 0.1 && !farmSegmentClear(last, point)) {
      return planFarmRoute(start, end);
    }
    last = point;
  }
  return smoothFarmRoute(start, raw);
}

/** Tiny visibility graph, evaluated only on a click/wander event; no tile A* or frame work. */
export function planFarmRoute(from: FarmPoint, to: FarmPoint): FarmPoint[] {
  const start = safeFarmPoint(from);
  const end = safeFarmPoint(to);
  if (distance(start, end) < 0.1) return [];
  if (farmSegmentClear(start, end)) return [end];
  const corners = obstacles.flatMap(b => [
    { x: b.x - 0.2, y: b.y - 0.2 },
    { x: b.x + b.w + 0.2, y: b.y - 0.2 },
    { x: b.x - 0.2, y: b.y + b.h + 0.2 },
    { x: b.x + b.w + 0.2, y: b.y + b.h + 0.2 },
  ]);
  const nodes = [start, end, ...Object.values(WAYPOINTS), ...corners].filter(
    (p, i) =>
      i < 2 ||
      (!obstacles.some(b => inside(p, b)) &&
        p.x >= WALK_BOUNDS.x && p.x <= WALK_BOUNDS.x + WALK_BOUNDS.w &&
        p.y >= WALK_BOUNDS.y && p.y <= WALK_BOUNDS.y + WALK_BOUNDS.h),
  );
  const costs = nodes.map(() => Infinity);
  const previous = nodes.map(() => -1);
  const seen = new Set<number>();
  costs[0] = 0;
  while (seen.size < nodes.length) {
    let current = -1;
    for (let i = 0; i < nodes.length; i++) {
      if (!seen.has(i) && (current < 0 || costs[i] < costs[current])) current = i;
    }
    if (current < 0 || !Number.isFinite(costs[current])) break;
    if (current === 1) {
      const route: FarmPoint[] = [];
      let step = 1;
      while (step > 0) {
        route.unshift({ x: nodes[step].x, y: nodes[step].y });
        step = previous[step];
      }
      return smoothFarmRoute(start, route);
    }
    seen.add(current);
    for (let j = 0; j < nodes.length; j++) {
      if (seen.has(j) || !farmSegmentClear(nodes[current], nodes[j])) continue;
      const next = costs[current] + distance(nodes[current], nodes[j]);
      if (next < costs[j]) {
        costs[j] = next;
        previous[j] = current;
      }
    }
  }
  return []; // Stay put if enclosed; never fall back to a wall-crossing straight line.
}
