import {
  Landmark,
  Point,
  SemanticMap,
  Terrain,
  pointKey,
} from './semanticMap.js';
import {
  ACT1_RUNTIME_SNAPSHOT_BOUNDS,
  ACT1_RUNTIME_SNAPSHOT_ROWS,
  ACT1_RUNTIME_SNAPSHOT_WORLD_SIZE,
} from './generated/act1RuntimeSnapshot.js';

export const ACT1_OVERWORLD_CANONICAL_SEED = 42;
export const ACT1_OVERWORLD_WIDTH = ACT1_RUNTIME_SNAPSHOT_WORLD_SIZE[0];
export const ACT1_OVERWORLD_HEIGHT = ACT1_RUNTIME_SNAPSHOT_WORLD_SIZE[1];
export const ACT1_SOURCE_BOUNDS = ACT1_RUNTIME_SNAPSHOT_BOUNDS;

export type Act1SurfaceClass = 'water' | 'meadow' | 'trail' | 'forest' | 'mountain';

export interface Act1SurfaceMetrics {
  sourceLandCells: number;
  sourceWaterCells: number;
  sourceFootprintMismatchCells: number;
  approvedWaterOverrideCells: number;
  unapprovedWaterMismatchCells: number;
  sourceWaterPreservedOutsideApprovedOverrides: boolean;
  counts: Record<Act1SurfaceClass, number>;
  nonWaterPercentages: Record<Exclude<Act1SurfaceClass, 'water'>, number>;
}

export interface Act1OverworldReconstruction {
  map: SemanticMap;
  surfaces: Act1SurfaceClass[][];
  metrics: Act1SurfaceMetrics;
  navigableChannels: Act1NavigableChannel[];
  bridgeCrossings: Act1BridgeCrossing[];
}

interface RouteSpec {
  id: string;
  waypoints: readonly Point[];
}

export interface Act1NavigableChannel {
  id: 'port-sapphire-harbor-channel';
  cells: Point[];
}

export interface Act1BridgeCrossing {
  id: 'greenhollow-millbrook-bridge' | 'port-sapphire-coastal-reef-bridge';
  deck: Point[];
  waterUnderBridge: Point[];
}

interface ScoredPoint {
  point: Point;
  score: number;
}

const GREENHOLLOW_APPROACH = { x: 60, y: 341 };
const SUNKEN_CELLAR_APPROACH = { x: 45, y: 349 };
const WHISPERING_WOODS_APPROACH = { x: 80, y: 311 };
const MILLBROOK_APPROACH = { x: 100, y: 321 };
const PORT_SAPPHIRE_APPROACH = { x: 130, y: 291 };
const COASTAL_REEF_APPROACH = { x: 140, y: 349 };
const DARKFANG_APPROACH = { x: 120, y: 261 };
const CRYSTAL_CAVE_APPROACH = { x: 148, y: 294 };
const CRYSTAL_GATE = { x: 148, y: 293 };

export const ACT1_V3_LOCKED_DESIGN_SHA256 = '7f4b0b9be8633a1a16946cf90b7794f306d7b268d4ecb54381998a1fc55774fd';
export const ACT1_GREENHOLLOW_MILLBROOK_BRIDGE_DECK = [
  { x: 97, y: 335 },
  { x: 98, y: 335 },
  { x: 99, y: 335 },
] as const;
export const ACT1_PORT_REEF_BRIDGE_DECK = [{ x: 140, y: 345 }] as const;
export const ACT1_MILLBROOK_SOUTHEAST_FOREST_BLOCK = {
  minX: 102,
  minY: 323,
  maxX: 139,
  maxY: 344,
} as const;

const ACT1_PORT_HARBOR_WATER_KEYS = buildPortHarborWaterKeys();
const ACT1_NAVIGABLE_HARBOR_KEYS = new Set([
  ...ACT1_PORT_HARBOR_WATER_KEYS,
  ...ACT1_PORT_REEF_BRIDGE_DECK.map(pointKey),
]);
const ACT1_BRIDGE_DECK_KEYS = new Set([
  ...ACT1_GREENHOLLOW_MILLBROOK_BRIDGE_DECK.map(pointKey),
  ...ACT1_PORT_REEF_BRIDGE_DECK.map(pointKey),
]);

const ROUTE_SPECS: readonly RouteSpec[] = [
  {
    id: 'greenhollow-to-sunken-cellar',
    waypoints: [GREENHOLLOW_APPROACH, SUNKEN_CELLAR_APPROACH],
  },
  {
    id: 'greenhollow-to-whispering-woods-cave',
    waypoints: [GREENHOLLOW_APPROACH, WHISPERING_WOODS_APPROACH],
  },
  {
    id: 'greenhollow-to-millbrook',
    waypoints: [
      GREENHOLLOW_APPROACH,
      { x: 80, y: 341 },
      { x: 80, y: 335 },
      { x: 100, y: 335 },
      MILLBROOK_APPROACH,
    ],
  },
  {
    id: 'millbrook-to-port-sapphire',
    waypoints: [MILLBROOK_APPROACH, PORT_SAPPHIRE_APPROACH],
  },
  {
    id: 'port-sapphire-to-coastal-reef',
    waypoints: [
      PORT_SAPPHIRE_APPROACH,
      { x: 142, y: 291 },
      { x: 142, y: 310 },
      { x: 143, y: 325 },
      { x: 142, y: 338 },
      { x: 140, y: 338 },
      COASTAL_REEF_APPROACH,
    ],
  },
  {
    id: 'port-sapphire-to-darkfang',
    waypoints: [PORT_SAPPHIRE_APPROACH, DARKFANG_APPROACH],
  },
  {
    id: 'port-sapphire-to-crystal-cave',
    waypoints: [PORT_SAPPHIRE_APPROACH, CRYSTAL_CAVE_APPROACH],
  },
] as const;

const LANDMARKS: readonly Landmark[] = [
  {
    id: 'greenhollow',
    kind: 'town',
    at: { x: 60, y: 340 },
    approach: GREENHOLLOW_APPROACH,
    transition: { targetMapId: 'greenhollow', arrival: { x: 8, y: 14 } },
  },
  {
    id: 'millbrook',
    kind: 'town',
    at: { x: 100, y: 320 },
    approach: MILLBROOK_APPROACH,
    transition: { targetMapId: 'millbrook', arrival: { x: 8, y: 14 } },
  },
  {
    id: 'portSapphire',
    kind: 'town',
    at: { x: 130, y: 290 },
    approach: PORT_SAPPHIRE_APPROACH,
    transition: { targetMapId: 'portSapphire', arrival: { x: 8, y: 14 } },
  },
  {
    id: 'mistyGrotto',
    kind: 'dungeon',
    at: { x: 120, y: 260 },
    approach: DARKFANG_APPROACH,
    transition: { targetMapId: 'mistyGrotto', arrival: { x: 50, y: 1 }, floor: 1 },
  },
  {
    id: 'crystalCave',
    kind: 'dungeon',
    at: { x: 148, y: 295 },
    approach: CRYSTAL_CAVE_APPROACH,
    transition: { targetMapId: 'crystalCave', arrival: { x: 50, y: 99 }, floor: 1 },
  },
  {
    id: 'sunkenCellar',
    kind: 'dungeon',
    at: { x: 45, y: 350 },
    approach: SUNKEN_CELLAR_APPROACH,
    transition: { targetMapId: 'sunkenCellar', arrival: { x: 50, y: 1 }, floor: 1 },
  },
  {
    id: 'whisperingWoodsCave',
    kind: 'dungeon',
    at: { x: 80, y: 310 },
    approach: WHISPERING_WOODS_APPROACH,
    transition: { targetMapId: 'whisperingWoodsCave', arrival: { x: 50, y: 1 }, floor: 1 },
  },
  {
    id: 'coastalReef',
    kind: 'dungeon',
    at: { x: 140, y: 350 },
    approach: COASTAL_REEF_APPROACH,
    transition: { targetMapId: 'coastalReef', arrival: { x: 50, y: 1 }, floor: 1 },
  },
] as const;

/**
 * Builds the fixed-coordinate Act 1 reconstruction. Semantic terrain owns
 * collision/topology; `surfaces` is the renderer-facing material plan.
 */
export function buildAct1OverworldReconstruction(
  seed = ACT1_OVERWORLD_CANONICAL_SEED,
): Act1OverworldReconstruction {
  if (!Number.isInteger(seed)) throw new Error('Act 1 reconstruction seed must be an integer');

  const routes = ROUTE_SPECS.map(spec => ({
    id: spec.id,
    cells: cardinalPolyline(spec.waypoints),
  }));
  const sourceLand = sourceLandPoints();
  const surfaces = filledGrid<Act1SurfaceClass>('water');
  const routeKeys = new Set(routes.flatMap(route => route.cells.map(pointKey)));
  const thresholdKeys = new Set(LANDMARKS.flatMap(landmark => [
    pointKey(landmark.at),
    pointKey(landmark.approach),
  ]));
  const forcedTrail = new Set([...routeKeys, ...thresholdKeys]);
  const forcedMountain = crystalBarrierKeys(sourceLand, forcedTrail);
  const protectedOldGrowth = protectedOldGrowthKeys(sourceLand, forcedTrail);

  const nonWaterCount = sourceLand.length;
  const trailTarget = Math.round(nonWaterCount * 0.08);
  const mountainTarget = Math.round(nonWaterCount * 0.13);
  const meadowTarget = Math.round(nonWaterCount * 0.32);
  const trailDistance = distanceField(routes.flatMap(route => route.cells));
  const waterDistance = distanceField(sourceWaterPoints());

  const trailKeys = selectConnectedSurfaceKeys(
    sourceLand,
    trailTarget,
    forcedTrail,
    new Set([...forcedMountain, ...protectedOldGrowth]),
    point => trailScore(point, trailDistance[point.y][point.x], seed),
  );
  const mountainKeys = selectSurfaceKeys(
    sourceLand,
    mountainTarget,
    forcedMountain,
    new Set([...trailKeys, ...protectedOldGrowth]),
    point => mountainScore(point, waterDistance[point.y][point.x], seed),
  );
  const meadowKeys = selectConnectedExpansionKeys(
    sourceLand,
    meadowTarget,
    trailKeys,
    new Set([...trailKeys, ...mountainKeys, ...protectedOldGrowth]),
    point => meadowScore(point, seed),
  );

  for (const point of sourceLand) {
    const key = pointKey(point);
    surfaces[point.y][point.x] = trailKeys.has(key)
      ? 'trail'
      : mountainKeys.has(key)
        ? 'mountain'
        : meadowKeys.has(key)
          ? 'meadow'
          : 'forest';
  }

  const terrain = surfaces.map(row => row.map(surfaceToTerrain));
  const map: SemanticMap = {
    id: 'overworld-act1-slice',
    kind: 'overworld',
    revision: 5,
    seed,
    width: ACT1_OVERWORLD_WIDTH,
    height: ACT1_OVERWORLD_HEIGHT,
    terrain,
    routes,
    clearings: [],
    landmarks: LANDMARKS.map(cloneLandmark),
    specials: [],
    progressionGates: [{
      id: 'crystal-cave-seal',
      at: { ...CRYSTAL_GATE },
      requiredFlag: 'boss.giantToad.defeated',
    }],
  };

  return {
    map,
    surfaces,
    metrics: measureAct1SurfacePlan(surfaces),
    navigableChannels: [{
      id: 'port-sapphire-harbor-channel',
      cells: [...ACT1_NAVIGABLE_HARBOR_KEYS].map(keyToPoint),
    }],
    bridgeCrossings: [{
      id: 'greenhollow-millbrook-bridge',
      deck: ACT1_GREENHOLLOW_MILLBROOK_BRIDGE_DECK.map(point => ({ ...point })),
      waterUnderBridge: ACT1_GREENHOLLOW_MILLBROOK_BRIDGE_DECK.map(point => ({ ...point })),
    }, {
      id: 'port-sapphire-coastal-reef-bridge',
      deck: ACT1_PORT_REEF_BRIDGE_DECK.map(point => ({ ...point })),
      waterUnderBridge: ACT1_PORT_REEF_BRIDGE_DECK.map(point => ({ ...point })),
    }],
  };
}

export function buildAct1Overworld(seed = ACT1_OVERWORLD_CANONICAL_SEED): SemanticMap {
  return buildAct1OverworldReconstruction(seed).map;
}

export function measureAct1SurfacePlan(surfaces: Act1SurfaceClass[][]): Act1SurfaceMetrics {
  if (surfaces.length !== ACT1_OVERWORLD_HEIGHT
    || surfaces.some(row => row.length !== ACT1_OVERWORLD_WIDTH)) {
    throw new Error('Act 1 surface dimensions must match the 320x400 overworld');
  }

  const counts: Record<Act1SurfaceClass, number> = {
    water: 0,
    meadow: 0,
    trail: 0,
    forest: 0,
    mountain: 0,
  };
  for (const row of surfaces) {
    for (const surface of row) counts[surface] += 1;
  }

  let sourceLandCells = 0;
  let sourceWaterCells = 0;
  let sourceFootprintMismatchCells = 0;
  let approvedWaterOverrideCells = 0;
  let unapprovedWaterMismatchCells = 0;
  const [minX, minY, maxX, maxY] = ACT1_SOURCE_BOUNDS;
  for (let y = minY; y <= maxY; y += 1) {
    for (let x = minX; x <= maxX; x += 1) {
      const sourceWater = isAct1RuntimeSourceWater({ x, y });
      if (sourceWater) sourceWaterCells += 1;
      else sourceLandCells += 1;
      if ((surfaces[y][x] === 'water') !== sourceWater) {
        sourceFootprintMismatchCells += 1;
        if (isApprovedAct1WaterOverride({ x, y })) approvedWaterOverrideCells += 1;
        else unapprovedWaterMismatchCells += 1;
      }
    }
  }

  const nonWaterCells = counts.meadow + counts.trail + counts.forest + counts.mountain;
  return {
    sourceLandCells,
    sourceWaterCells,
    sourceFootprintMismatchCells,
    approvedWaterOverrideCells,
    unapprovedWaterMismatchCells,
    sourceWaterPreservedOutsideApprovedOverrides: unapprovedWaterMismatchCells === 0,
    counts,
    nonWaterPercentages: {
      meadow: counts.meadow / nonWaterCells,
      trail: counts.trail / nonWaterCells,
      forest: counts.forest / nonWaterCells,
      mountain: counts.mountain / nonWaterCells,
    },
  };
}

export function isAct1RuntimeSourceWater(point: Point): boolean {
  const [minX, minY, maxX, maxY] = ACT1_SOURCE_BOUNDS;
  if (point.x < minX || point.x > maxX || point.y < minY || point.y > maxY) return true;
  return ACT1_RUNTIME_SNAPSHOT_ROWS[point.y - minY][point.x - minX] === '2';
}

export function isApprovedAct1WaterOverride(point: Point): boolean {
  const key = pointKey(point);
  return ACT1_PORT_HARBOR_WATER_KEYS.has(key) || ACT1_BRIDGE_DECK_KEYS.has(key);
}

function sourceTile(point: Point): string {
  const [minX, minY] = ACT1_SOURCE_BOUNDS;
  return ACT1_RUNTIME_SNAPSHOT_ROWS[point.y - minY][point.x - minX];
}

function sourceLandPoints(): Point[] {
  const points: Point[] = [];
  const [minX, minY, maxX, maxY] = ACT1_SOURCE_BOUNDS;
  for (let y = minY; y <= maxY; y += 1) {
    for (let x = minX; x <= maxX; x += 1) {
      const point = { x, y };
      const key = pointKey(point);
      if (ACT1_BRIDGE_DECK_KEYS.has(key)
        || (!isAct1RuntimeSourceWater(point) && !ACT1_PORT_HARBOR_WATER_KEYS.has(key))) {
        points.push(point);
      }
    }
  }
  return points;
}

function sourceWaterPoints(): Point[] {
  const points: Point[] = [];
  const [minX, minY, maxX, maxY] = ACT1_SOURCE_BOUNDS;
  for (let y = minY; y <= maxY; y += 1) {
    for (let x = minX; x <= maxX; x += 1) {
      const point = { x, y };
      if (isAct1RuntimeSourceWater(point)
        || ACT1_NAVIGABLE_HARBOR_KEYS.has(pointKey(point))
        || ACT1_GREENHOLLOW_MILLBROOK_BRIDGE_DECK.some(deck => pointKey(deck) === pointKey(point))) {
        points.push(point);
      }
    }
  }
  return points;
}

function crystalBarrierKeys(sourceLand: Point[], passage: ReadonlySet<string>): Set<string> {
  const keys = new Set<string>();
  for (const point of sourceLand) {
    if (point.x < 142 || point.x > 154 || point.y < 286 || point.y > 302) continue;
    const key = pointKey(point);
    if (!passage.has(key)) keys.add(key);
  }
  return keys;
}

function selectConnectedSurfaceKeys(
  land: Point[],
  targetCount: number,
  required: ReadonlySet<string>,
  excluded: ReadonlySet<string>,
  score: (point: Point) => number,
): Set<string> {
  const landByKey = new Map(land.map(point => [pointKey(point), point]));
  const selected = new Set([...required].filter(key => landByKey.has(key) && !excluded.has(key)));
  if (selected.size !== required.size) throw new Error('required trail cells must be inside the preserved land footprint');
  if (selected.size > targetCount) throw new Error(`surface quota ${targetCount} is smaller than ${selected.size} required cells`);

  const frontier = new ScoredPointMaxHeap();
  const queued = new Set<string>();
  const addFrontier = (point: Point): void => {
    for (const neighbor of cardinalNeighbors(point)) {
      const key = pointKey(neighbor);
      const landPoint = landByKey.get(key);
      if (landPoint && !selected.has(key) && !excluded.has(key) && !queued.has(key)) {
        queued.add(key);
        frontier.push({ point: landPoint, score: score(landPoint) });
      }
    }
  };
  for (const key of selected) addFrontier(landByKey.get(key)!);

  while (selected.size < targetCount) {
    const best = nextUnselectedFrontierPoint(frontier, queued, selected, excluded);
    if (!best) throw new Error(`could not fill connected surface quota ${targetCount}`);
    const key = pointKey(best);
    selected.add(key);
    addFrontier(best);
  }
  return selected;
}

function selectConnectedExpansionKeys(
  land: Point[],
  targetCount: number,
  connectedSeeds: ReadonlySet<string>,
  excluded: ReadonlySet<string>,
  score: (point: Point) => number,
): Set<string> {
  const landByKey = new Map(land.map(point => [pointKey(point), point]));
  const connected = new Set([...connectedSeeds].filter(key => landByKey.has(key)));
  if (connected.size !== connectedSeeds.size) {
    throw new Error('connected surface seeds must be inside the preserved land footprint');
  }

  const selected = new Set<string>();
  const frontier = new ScoredPointMaxHeap();
  const queued = new Set<string>();
  const addFrontier = (point: Point): void => {
    for (const neighbor of cardinalNeighbors(point)) {
      const key = pointKey(neighbor);
      const landPoint = landByKey.get(key);
      if (landPoint && !connected.has(key) && !excluded.has(key) && !queued.has(key)) {
        queued.add(key);
        frontier.push({ point: landPoint, score: score(landPoint) });
      }
    }
  };
  for (const key of connected) addFrontier(landByKey.get(key)!);

  while (selected.size < targetCount) {
    const best = nextUnselectedFrontierPoint(frontier, queued, connected, excluded);
    if (!best) throw new Error(`could not fill connected surface expansion quota ${targetCount}`);
    const key = pointKey(best);
    connected.add(key);
    selected.add(key);
    addFrontier(best);
  }
  return selected;
}

function nextUnselectedFrontierPoint(
  frontier: ScoredPointMaxHeap,
  queued: Set<string>,
  selected: ReadonlySet<string>,
  excluded: ReadonlySet<string>,
): Point | undefined {
  while (frontier.size > 0) {
    const candidate = frontier.pop()!;
    const key = pointKey(candidate.point);
    queued.delete(key);
    if (!selected.has(key) && !excluded.has(key)) return candidate.point;
  }
  return undefined;
}

class ScoredPointMaxHeap {
  private readonly items: ScoredPoint[] = [];

  get size(): number {
    return this.items.length;
  }

  push(item: ScoredPoint): void {
    this.items.push(item);
    let index = this.items.length - 1;
    while (index > 0) {
      const parent = Math.floor((index - 1) / 2);
      if (!hasHigherPriority(this.items[index], this.items[parent])) break;
      [this.items[index], this.items[parent]] = [this.items[parent], this.items[index]];
      index = parent;
    }
  }

  pop(): ScoredPoint | undefined {
    const first = this.items[0];
    const last = this.items.pop();
    if (!first || !last || this.items.length === 0) return first;
    this.items[0] = last;

    let index = 0;
    while (true) {
      const left = index * 2 + 1;
      const right = left + 1;
      let best = index;
      if (left < this.items.length && hasHigherPriority(this.items[left], this.items[best])) best = left;
      if (right < this.items.length && hasHigherPriority(this.items[right], this.items[best])) best = right;
      if (best === index) break;
      [this.items[index], this.items[best]] = [this.items[best], this.items[index]];
      index = best;
    }
    return first;
  }
}

function hasHigherPriority(left: ScoredPoint, right: ScoredPoint): boolean {
  return left.score > right.score
    || (left.score === right.score && (
      left.point.y < right.point.y
      || (left.point.y === right.point.y && left.point.x < right.point.x)
    ));
}

function protectedOldGrowthKeys(sourceLand: Point[], passage: ReadonlySet<string>): Set<string> {
  const groves = [
    { center: { x: 53, y: 334 }, radiusX: 6, radiusY: 8 },
    { center: { x: 69, y: 345 }, radiusX: 4, radiusY: 5 },
    { center: { x: 91, y: 316 }, radiusX: 5, radiusY: 7 },
    { center: { x: 104, y: 314 }, radiusX: 5, radiusY: 6 },
  ];
  const keys = new Set<string>();
  for (const point of sourceLand) {
    const key = pointKey(point);
    if (passage.has(key)) continue;
    if (point.x >= ACT1_MILLBROOK_SOUTHEAST_FOREST_BLOCK.minX
      && point.x <= ACT1_MILLBROOK_SOUTHEAST_FOREST_BLOCK.maxX
      && point.y >= ACT1_MILLBROOK_SOUTHEAST_FOREST_BLOCK.minY
      && point.y <= ACT1_MILLBROOK_SOUTHEAST_FOREST_BLOCK.maxY) {
      keys.add(key);
      continue;
    }
    if (groves.some(grove => radialInfluence(
      point,
      grove.center,
      grove.radiusX,
      grove.radiusY,
    ) > 0)) keys.add(key);
  }
  return keys;
}

function selectSurfaceKeys(
  land: Point[],
  targetCount: number,
  required: ReadonlySet<string>,
  excluded: ReadonlySet<string>,
  score: (point: Point) => number,
): Set<string> {
  const selected = new Set([...required].filter(key => !excluded.has(key)));
  if (selected.size > targetCount) {
    throw new Error(`surface quota ${targetCount} is smaller than ${selected.size} required cells`);
  }

  const candidates = land
    .filter(point => {
      const key = pointKey(point);
      return !selected.has(key) && !excluded.has(key);
    })
    .map(point => ({ point, score: score(point) }))
    .sort((left, right) => (
      right.score - left.score
      || left.point.y - right.point.y
      || left.point.x - right.point.x
    ));

  for (const candidate of candidates.slice(0, targetCount - selected.size)) {
    selected.add(pointKey(candidate.point));
  }
  if (selected.size !== targetCount) throw new Error(`could not fill surface quota ${targetCount}`);
  return selected;
}

function trailScore(point: Point, distance: number, seed: number): number {
  const retainedRoadBonus = sourceTile(point) === '1' ? 22 : 0;
  return 120 - distance * 24 + retainedRoadBonus + organicNoise(point.x, point.y, seed) * 12;
}

function mountainScore(point: Point, waterDistance: number, seed: number): number {
  const crystalRidge = radialInfluence(point, { x: 149, y: 294 }, 33, 25) * 92;
  const northernCliff = radialInfluence(point, { x: 116, y: 245 }, 50, 26) * 38;
  const coastalRock = Math.max(0, 5 - waterDistance) * (4 + organicNoise(point.x, point.y, seed + 101) * 9);
  return crystalRidge + northernCliff + coastalRock + organicNoise(point.x, point.y, seed + 211) * 18;
}

function meadowScore(point: Point, seed: number): number {
  const greenhollow = radialInfluence(point, { x: 61, y: 337 }, 40, 29) * 96;
  const millbrook = radialInfluence(point, { x: 99, y: 323 }, 32, 25) * 78;
  const port = radialInfluence(point, { x: 129, y: 307 }, 28, 25) * 68;
  const southernCountry = radialInfluence(point, { x: 92, y: 365 }, 57, 26) * 72;
  const sunkenCoast = radialInfluence(point, { x: 45, y: 351 }, 24, 17) * 42;
  const reefCountry = radialInfluence(point, { x: 137, y: 350 }, 20, 24) * 46;
  const openCountry = Math.max(
    greenhollow,
    millbrook,
    port,
    southernCountry,
    sunkenCoast,
    reefCountry,
  );
  const whisperingEnclosure = radialInfluence(point, { x: 80, y: 310 }, 19, 17) * 64;
  const darkfangEnclosure = radialInfluence(point, { x: 120, y: 260 }, 23, 21) * 82;
  const crystalEnclosure = radialInfluence(point, { x: 148, y: 295 }, 25, 23) * 92;
  const irregularEdge = organicNoise(point.x, point.y, seed + 307) * 25
    + Math.sin(point.x * 0.19 + point.y * 0.11) * 7;
  return openCountry - whisperingEnclosure - darkfangEnclosure - crystalEnclosure + irregularEdge;
}

function radialInfluence(point: Point, center: Point, radiusX: number, radiusY: number): number {
  const dx = (point.x - center.x) / radiusX;
  const dy = (point.y - center.y) / radiusY;
  return Math.max(0, 1 - dx * dx - dy * dy);
}

function organicNoise(x: number, y: number, seed: number): number {
  const coarse = hashNoise(Math.floor(x / 5), Math.floor(y / 5), seed);
  const medium = hashNoise(Math.floor(x / 2), Math.floor(y / 2), seed + 17);
  const fine = hashNoise(x, y, seed + 43);
  return coarse * 0.58 + medium * 0.29 + fine * 0.13;
}

function hashNoise(x: number, y: number, seed: number): number {
  let value = Math.imul(x ^ seed, 0x45d9f3b) ^ Math.imul(y + seed, 0x119de1f3);
  value ^= value >>> 16;
  value = Math.imul(value, 0x45d9f3b);
  value ^= value >>> 16;
  return (value >>> 0) / 0xffffffff;
}

function distanceField(sources: Point[]): number[][] {
  const distances = filledGrid<number>(Number.POSITIVE_INFINITY);
  const queue: Point[] = [];
  for (const source of sources) {
    if (distances[source.y][source.x] === 0) continue;
    distances[source.y][source.x] = 0;
    queue.push(source);
  }

  for (let index = 0; index < queue.length; index += 1) {
    const current = queue[index];
    const distance = distances[current.y][current.x] + 1;
    for (const next of cardinalNeighbors(current)) {
      if (next.x < 0 || next.x >= ACT1_OVERWORLD_WIDTH
        || next.y < 0 || next.y >= ACT1_OVERWORLD_HEIGHT
        || distances[next.y][next.x] <= distance) continue;
      distances[next.y][next.x] = distance;
      queue.push(next);
    }
  }
  return distances;
}

function cardinalPath(from: Point, to: Point): Point[] {
  const cells: Point[] = [{ ...from }];
  let { x, y } = from;
  while (x !== to.x) {
    x += Math.sign(to.x - x);
    cells.push({ x, y });
  }
  while (y !== to.y) {
    y += Math.sign(to.y - y);
    cells.push({ x, y });
  }
  return cells;
}

function cardinalPolyline(waypoints: readonly Point[]): Point[] {
  if (waypoints.length < 2) throw new Error('route polyline must contain at least two waypoints');
  const cells: Point[] = [];
  for (let index = 1; index < waypoints.length; index += 1) {
    const segment = cardinalPath(waypoints[index - 1], waypoints[index]);
    cells.push(...(index === 1 ? segment : segment.slice(1)));
  }
  return cells;
}

function buildPortHarborWaterKeys(): Set<string> {
  const keys = new Set<string>();
  for (let y = 293; y <= 305; y += 1) {
    for (let x = 133; x <= 139; x += 1) {
      const dx = (x - 136) / 3;
      const dy = (y - 299) / 6;
      if (dx * dx + dy * dy <= 1) keys.add(pointKey({ x, y }));
    }
  }

  const channelCenter = cardinalPolyline([
    { x: 137, y: 304 },
    { x: 137, y: 320 },
    { x: 138, y: 334 },
    { x: 139, y: 345 },
    { x: 140, y: 345 },
    { x: 142, y: 345 },
  ]);
  for (const point of channelCenter) {
    if (pointKey(point) === pointKey(ACT1_PORT_REEF_BRIDGE_DECK[0])) continue;
    keys.add(pointKey(point));
    if (point.y < 345) keys.add(pointKey({ x: point.x - 1, y: point.y }));
  }
  return keys;
}

function keyToPoint(key: string): Point {
  const [x, y] = key.split(',').map(Number);
  return { x, y };
}

function cardinalNeighbors(point: Point): Point[] {
  return [
    { x: point.x + 1, y: point.y },
    { x: point.x - 1, y: point.y },
    { x: point.x, y: point.y + 1 },
    { x: point.x, y: point.y - 1 },
  ];
}

function surfaceToTerrain(surface: Act1SurfaceClass): Terrain {
  if (surface === 'meadow' || surface === 'trail') return 'ground';
  return surface;
}

function cloneLandmark(landmark: Landmark): Landmark {
  return {
    ...landmark,
    at: { ...landmark.at },
    approach: { ...landmark.approach },
    transition: landmark.transition
      ? {
          ...landmark.transition,
          arrival: { ...landmark.transition.arrival },
        }
      : undefined,
  };
}

function filledGrid<T>(value: T): T[][] {
  return Array.from({ length: ACT1_OVERWORLD_HEIGHT }, () => (
    Array.from({ length: ACT1_OVERWORLD_WIDTH }, () => value)
  ));
}
