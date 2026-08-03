export type MapKind = 'overworld' | 'town' | 'dungeon';

export type Terrain = 'ground' | 'forest' | 'water' | 'mountain' | 'structure';

export interface Point {
  x: number;
  y: number;
}

export interface Route {
  id: string;
  cells: Point[];
}

export interface Landmark {
  id: string;
  kind: 'town' | 'dungeon' | 'portal' | 'sign';
  at: Point;
  approach: Point;
  transition?: {
    targetMapId: string;
    arrival: Point;
    floor?: number;
  };
}

export interface SpecialPlacement {
  id: string;
  kind: 'gate' | 'sign' | 'save';
  at: Point;
  collision: 'passable' | 'blocked';
}

export interface ProgressionGate {
  id: string;
  at: Point;
  requiredFlag: string;
}

export type ProgressionState = Readonly<Record<string, boolean>>;

export interface SemanticMap {
  id: string;
  kind: MapKind;
  revision: number;
  seed: number;
  width: number;
  height: number;
  terrain: Terrain[][];
  routes: Route[];
  clearings: Point[];
  landmarks: Landmark[];
  specials: SpecialPlacement[];
  progressionGates: ProgressionGate[];
}

export interface MinimapModel {
  width: number;
  height: number;
  cells: { terrain: Terrain; route: boolean }[][];
  markers: { id: string; kind: Landmark['kind']; at: Point }[];
}

const BLOCKED_TERRAIN = new Set<Terrain>(['forest', 'water', 'mountain', 'structure']);

export function pointKey(point: Point): string {
  return `${point.x},${point.y}`;
}

export function isInside(map: SemanticMap, point: Point): boolean {
  return Number.isInteger(point.x) && Number.isInteger(point.y)
    && point.x >= 0 && point.x < map.width && point.y >= 0 && point.y < map.height;
}

export function deriveWalkability(map: SemanticMap): boolean[][] {
  const specialRules = new Map(map.specials.map(special => [pointKey(special.at), special.collision]));

  return map.terrain.map((row, y) => row.map((terrain, x) => {
    const rule = specialRules.get(pointKey({ x, y }));
    if (rule === 'blocked') return false;
    if (rule === 'passable') return !BLOCKED_TERRAIN.has(terrain);
    return !BLOCKED_TERRAIN.has(terrain);
  }));
}

export function deriveMinimapModel(map: SemanticMap): MinimapModel {
  const routeCells = new Set(map.routes.flatMap(route => route.cells.map(pointKey)));

  return {
    width: map.width,
    height: map.height,
    cells: map.terrain.map((row, y) => row.map((terrain, x) => ({
      terrain,
      route: routeCells.has(pointKey({ x, y })),
    }))),
    markers: map.landmarks.map(landmark => ({
      id: landmark.id,
      kind: landmark.kind,
      at: { ...landmark.at },
    })),
  };
}

export function deriveReachableLandmarkIds(
  map: SemanticMap,
  startLandmarkId: string,
  state: ProgressionState,
): Set<string> {
  const start = map.landmarks.find(landmark => landmark.id === startLandmarkId);
  if (!start) return new Set();

  const semanticPath = new Set([
    ...map.routes.flatMap(route => route.cells.map(pointKey)),
    ...map.clearings.map(pointKey),
  ]);
  const closedGates = new Set(
    map.progressionGates
      .filter(gate => (
        !Object.prototype.hasOwnProperty.call(state, gate.requiredFlag)
        || state[gate.requiredFlag] !== true
      ))
      .map(gate => pointKey(gate.at)),
  );
  const reached = floodSemanticPath(start.approach, semanticPath, closedGates);

  return new Set(
    map.landmarks
      .filter(landmark => reached.has(pointKey(landmark.approach)))
      .map(landmark => landmark.id),
  );
}

export function semanticMapSnapshot(map: SemanticMap): string {
  return JSON.stringify(map);
}

export function validateSemanticMap(map: SemanticMap): string[] {
  const errors: string[] = [];

  if (!Number.isInteger(map.width) || !Number.isInteger(map.height) || map.width <= 0 || map.height <= 0) {
    errors.push('map dimensions must be positive integers');
  }
  if (!Number.isInteger(map.revision) || map.revision <= 0) errors.push('map revision must be a positive integer');
  if (!Number.isInteger(map.seed)) errors.push('map seed must be an integer');
  if (map.terrain.length !== map.height || map.terrain.some(row => row.length !== map.width)) {
    errors.push('terrain dimensions must match map dimensions');
    return errors;
  }

  const walkable = deriveWalkability(map);
  const semanticPath = new Set<string>();
  const routeIds = new Set<string>();

  for (const route of map.routes) {
    if (routeIds.has(route.id)) errors.push(`duplicate route id ${route.id}`);
    routeIds.add(route.id);

    for (let index = 0; index < route.cells.length; index += 1) {
      const cell = route.cells[index];
      if (!isInside(map, cell)) {
        errors.push(`route ${route.id} is out of bounds at ${pointKey(cell)}`);
        continue;
      }
      if (!walkable[cell.y][cell.x]) errors.push(`route ${route.id} crosses blocked terrain at ${pointKey(cell)}`);
      semanticPath.add(pointKey(cell));

      const previous = route.cells[index - 1];
      if (previous && Math.abs(previous.x - cell.x) + Math.abs(previous.y - cell.y) !== 1) {
        errors.push(`route ${route.id} is not cardinally contiguous at ${pointKey(cell)}`);
      }
    }
  }

  for (const clearing of map.clearings) {
    if (!isInside(map, clearing)) {
      errors.push(`clearing is out of bounds at ${pointKey(clearing)}`);
      continue;
    }
    if (!walkable[clearing.y][clearing.x]) errors.push(`clearing is blocked at ${pointKey(clearing)}`);
    semanticPath.add(pointKey(clearing));
  }

  const landmarkIds = new Set<string>();
  const landmarkCells = new Set<string>();
  for (const landmark of map.landmarks) {
    if (landmarkIds.has(landmark.id)) errors.push(`duplicate landmark id ${landmark.id}`);
    landmarkIds.add(landmark.id);

    const landmarkCell = pointKey(landmark.at);
    if (landmarkCells.has(landmarkCell)) {
      errors.push(`landmark ${landmark.id} duplicates landmark threshold at ${landmarkCell}`);
    }
    landmarkCells.add(landmarkCell);

    if (!isInside(map, landmark.at)) {
      errors.push(`landmark ${landmark.id} is out of bounds`);
    } else if (!walkable[landmark.at.y][landmark.at.x]) {
      errors.push(`landmark ${landmark.id} threshold is blocked`);
    }
    if (!isInside(map, landmark.approach)) {
      errors.push(`landmark ${landmark.id} approach is out of bounds`);
      continue;
    }
    if (isInside(map, landmark.at)
      && Math.abs(landmark.at.x - landmark.approach.x)
        + Math.abs(landmark.at.y - landmark.approach.y) !== 1) {
      errors.push(`landmark ${landmark.id} threshold is not cardinally adjacent to its approach`);
    }
    if (!walkable[landmark.approach.y][landmark.approach.x]) {
      errors.push(`landmark ${landmark.id} approach is blocked`);
    }
    if (!semanticPath.has(pointKey(landmark.approach))) {
      errors.push(`landmark ${landmark.id} approach is not on a route or clearing`);
    }
    if (landmark.transition) {
      if (!landmark.transition.targetMapId) errors.push(`landmark ${landmark.id} transition target is empty`);
      if (!isNonNegativeIntegerPoint(landmark.transition.arrival)) {
        errors.push(`landmark ${landmark.id} transition arrival must use non-negative integer cells`);
      }
      if (landmark.transition.floor !== undefined
        && (!Number.isInteger(landmark.transition.floor) || landmark.transition.floor <= 0)) {
        errors.push(`landmark ${landmark.id} transition floor must be a positive integer`);
      }
    }
  }

  const specialIds = new Set<string>();
  for (const special of map.specials) {
    if (specialIds.has(special.id)) errors.push(`duplicate special id ${special.id}`);
    specialIds.add(special.id);

    if (!isInside(map, special.at)) {
      errors.push(`special ${special.id} is out of bounds`);
      continue;
    }
    if (special.collision === 'passable' && BLOCKED_TERRAIN.has(map.terrain[special.at.y][special.at.x])) {
      errors.push(`special ${special.id} cannot make blocked terrain passable`);
    }
  }

  const start = map.landmarks[0]?.approach;
  const fullyReached = start && isInside(map, start) && semanticPath.has(pointKey(start))
    ? floodSemanticPath(start, semanticPath)
    : new Set<string>();
  const progressionGateIds = new Set<string>();
  for (const gate of map.progressionGates) {
    if (progressionGateIds.has(gate.id)) errors.push(`duplicate progression gate id ${gate.id}`);
    progressionGateIds.add(gate.id);

    if (!gate.requiredFlag.trim()) errors.push(`progression gate ${gate.id} required flag is empty`);
    if (!isInside(map, gate.at)) {
      errors.push(`progression gate ${gate.id} is out of bounds`);
      continue;
    }
    const gateKey = pointKey(gate.at);
    if (!semanticPath.has(gateKey)) {
      errors.push(`progression gate ${gate.id} is not on a route or clearing`);
      continue;
    }
    const reachedWithGateClosed = start
      ? floodSemanticPath(start, semanticPath, new Set([gateKey]))
      : new Set<string>();
    if (!map.landmarks.slice(1).some(landmark => (
      fullyReached.has(pointKey(landmark.approach))
      && !reachedWithGateClosed.has(pointKey(landmark.approach))
    ))) {
      errors.push(`progression gate ${gate.id} does not gate any landmark`);
    }
  }

  if (start && isInside(map, start) && semanticPath.has(pointKey(start))) {
    for (const landmark of map.landmarks.slice(1)) {
      if (!fullyReached.has(pointKey(landmark.approach))) {
        errors.push(`landmark ${landmark.id} is disconnected from ${map.landmarks[0].id}`);
      }
    }
  }

  return errors;
}

function isNonNegativeIntegerPoint(point: Point): boolean {
  return Number.isInteger(point.x) && Number.isInteger(point.y) && point.x >= 0 && point.y >= 0;
}

function floodSemanticPath(start: Point, path: Set<string>, blocked = new Set<string>()): Set<string> {
  const startKey = pointKey(start);
  if (!path.has(startKey) || blocked.has(startKey)) return new Set();

  const reached = new Set([startKey]);
  const queue = [start];

  for (let index = 0; index < queue.length; index += 1) {
    const current = queue[index];
    for (const next of [
      { x: current.x + 1, y: current.y },
      { x: current.x - 1, y: current.y },
      { x: current.x, y: current.y + 1 },
      { x: current.x, y: current.y - 1 },
    ]) {
      const key = pointKey(next);
      if (path.has(key) && !blocked.has(key) && !reached.has(key)) {
        reached.add(key);
        queue.push(next);
      }
    }
  }

  return reached;
}
