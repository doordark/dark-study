/** All coordinates use logical pixels. Points used for movement are FOOT positions. */
export interface FarmPoint { x: number; y: number }
export interface FarmRect extends FarmPoint { w: number; h: number }
export const SCENE_SIZE = { width: 200, height: 330 } as const;
/** Fit the four zones above the persistent controls on short portrait phones. */
export function farmSceneViewport(width: number, height: number, topInset = 0, bottomInset = 0) {
  const controls = 264; // Two compact HUD rows plus the seed/action tray.
  const sceneWidth = Math.min(width, 520, Math.max(200, (height - topInset - bottomInset - controls) * SCENE_SIZE.width / SCENE_SIZE.height));
  const scale = sceneWidth / SCENE_SIZE.width;
  return { width: sceneWidth, height: SCENE_SIZE.height * scale, scale };
}
export const WALK_BOUNDS: FarmRect = { x: 3, y: 82, w: 194, h: 237 };
export const HOUSE = { x: 8, y: 63, w: 78, h: 74, footY: 135, door: { x: 48, y: 138 } } as const;
export const POND = { x: 118, y: 254, w: 80, h: 49, footY: 302, approach: { x: 139, y: 261 } } as const;
export const COOP = { x: 162, y: 141, w: 36, h: 42, footY: 179, approach: { x: 161, y: 181 } } as const;
export const MARKET = { x: 7, y: 180, w: 56, h: 42, footY: 219, approach: { x: 56, y: 224 } } as const;
export const PLAZA = { x: 64, y: 226, w: 66, h: 41, center: { x: 95, y: 247 } } as const;
export const BENCH = { x: 100, y: 220, w: 24, h: 20, footY: 238, approach: { x: 114, y: 244 } } as const;
export const TREE = { x: 0, y: 231, w: 59, h: 76, footY: 302 } as const;
export const PLOTS = Array.from({ length: 16 }, (_, id) => ({
  id, x: 86 + (id % 4) * 17.5, y: 137 + Math.floor(id / 4) * 16.5, w: 15.5, h: 14.5,
}));
export const PLOT_BOUNDS: FarmRect = { x: 85, y: 136, w: 70, h: 65 };
export const PLAYER_START: FarmPoint = { x: 70, y: 151 };

export const WAYPOINTS = {
  houseDoor: { x: 48, y: 139, neighbors: ['housePath'] },
  housePath: { x: 66, y: 150, neighbors: ['houseDoor', 'farmLeft', 'market'] },
  farmLeft: { x: 68, y: 169, neighbors: ['housePath', 'market', 'farmBottom'] },
  farmTop: { x: 116, y: 131, neighbors: ['farmNorthEast'] },
  farmNorthEast: { x: 161, y: 131, neighbors: ['farmTop', 'farmRight'] },
  farmCenter: { x: 116, y: 211, neighbors: ['farmBottom', 'farmSouthEast', 'plazaNorth'] },
  farmBottom: { x: 84, y: 207, neighbors: ['farmLeft', 'farmCenter', 'plaza', 'market'] },
  farmSouthEast: { x: 161, y: 211, neighbors: ['farmCenter', 'farmRight'] },
  farmRight: { x: 161, y: 170, neighbors: ['farmNorthEast', 'farmSouthEast', 'coop'] },
  coop: { x: 161, y: 181, neighbors: ['farmRight'] },
  market: { x: 62, y: 201, neighbors: ['housePath', 'farmLeft', 'farmBottom', 'marketDoor'] },
  marketDoor: { x: 56, y: 224, neighbors: ['market', 'plaza'] },
  plazaNorth: { x: 91, y: 226, neighbors: ['farmCenter', 'plaza'] },
  plaza: { x: 95, y: 247, neighbors: ['farmBottom', 'plazaNorth', 'marketDoor', 'pondBench', 'pond', 'gate'] },
  pondBench: { x: 114, y: 244, neighbors: ['plaza', 'pond'] },
  pond: { x: 139, y: 261, neighbors: ['plaza', 'pondBench', 'pondWest'] },
  pondWest: { x: 120, y: 266, neighbors: ['pond', 'pondSouth'] },
  pondSouth: { x: 110, y: 307, neighbors: ['pondWest', 'gate'] },
  gate: { x: 97, y: 316, neighbors: ['plaza', 'pondSouth'] },
} as const;
export type WaypointId = keyof typeof WAYPOINTS;

/** A few short secondary paths complete the network from the art reference. */
export const EXTRA_PATHS: { width: number; points: FarmPoint[] }[] = [
  { width: 3.5, points: [{ x: 91, y: 226 }, { x: 104, y: 219 }, { x: 116, y: 211 }, { x: 160, y: 207 }, { x: 161, y: 170 }, { x: 168, y: 170 }] },
  { width: 3, points: [{ x: 86, y: 131 }, { x: 116, y: 131 }, { x: 161, y: 131 }, { x: 161, y: 170 }] },
];
/** Collision footprints, not image bounds: a roof/canopy may overhang a person. */
export const BLOCKERS: (FarmRect & { id: string })[] = [
  { id: 'house', x: 13, y: 100, w: 69, h: 34 },
  { id: 'plots', ...PLOT_BOUNDS },
  { id: 'pond', x: 126, y: 267, w: 67, h: 31 },
  { id: 'coop', x: 167, y: 150, w: 29, h: 25 },
  { id: 'market', x: 10, y: 196, w: 42, h: 22 },
  { id: 'tree-trunk', x: 19, y: 280, w: 13, h: 23 },
  { id: 'bench', x: 102, y: 232, w: 20, h: 6 },
  { id: 'tool-rack', x: 124, y: 112, w: 21, h: 15 },
  { id: 'hay', x: 148, y: 114, w: 15, h: 13 },
  { id: 'woodpile', x: 3, y: 112, w: 17, h: 20 },
];
export const INTERACTION_ZONES = {
  house: { x: HOUSE.x, y: HOUSE.y, w: HOUSE.w, h: HOUSE.h },
  pond: { x: 120, y: 263, w: 78, h: 39 },
  market: { x: MARKET.x, y: MARKET.y, w: MARKET.w, h: MARKET.h },
  coop: { x: COOP.x, y: COOP.y, w: COOP.w, h: COOP.h },
};
/** Placement compatibility only. Personalities, timers and chat policies live elsewhere. */
export const RESIDENT_PLACEMENTS = {
  door: { home: { x: 48, y: 149 }, roam: ['houseDoor', 'housePath', 'market'] },
  gu: { home: { x: 78, y: 166 }, roam: ['housePath', 'farmLeft', 'farmBottom'] },
  xiaoba: { home: { x: 62, y: 227 }, roam: ['marketDoor', 'plaza', 'pondBench'] },
  yujie: { home: { x: 87, y: 243 }, roam: ['marketDoor', 'plaza', 'farmCenter'] },
  weigang: { home: { x: 151, y: 250 }, roam: ['pondBench', 'pond', 'farmCenter'] },
  chicken: { home: { x: 178, y: 188 }, roam: ['coop', 'farmRight'] },
} as const;
export function plotApproach(index: number): FarmPoint {
  const plot = PLOTS[index];
  return index % 4 < 2 ? { x: 79, y: plot.y + plot.h } : { x: 161, y: plot.y + plot.h };
}
export const HOUSE_ROOM = { width: 240, height: 180, bed: { x: 164, y: 68, w: 60, h: 102 } } as const;
