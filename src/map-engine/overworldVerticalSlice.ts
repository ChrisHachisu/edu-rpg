import { MapEvent } from './retainedMapEvents.js';
import {
  Point,
  SemanticMap,
  Terrain,
  deriveWalkability,
  isInside,
  pointKey,
} from './semanticMap.js';

export interface CellRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface ChunkRenderCell {
  at: Point;
  terrain: Terrain;
  route: boolean;
  clearing: boolean;
  landmarkIds: string[];
}

export interface ChunkRenderModel {
  id: string;
  bounds: CellRect;
  cells: ChunkRenderCell[];
}

export type TransitionRequestedEvent = Extract<MapEvent, { type: 'transition-requested' }>;

export function deriveChunkRenderModels(map: SemanticMap, chunkSize: number): ChunkRenderModel[] {
  if (!Number.isInteger(chunkSize) || chunkSize <= 0) {
    throw new Error('chunk size must be a positive integer');
  }

  const routeCells = new Set(map.routes.flatMap(route => route.cells.map(pointKey)));
  const clearingCells = new Set(map.clearings.map(pointKey));
  const landmarkIdsByCell = new Map<string, string[]>();
  for (const landmark of map.landmarks) {
    const key = pointKey(landmark.at);
    landmarkIdsByCell.set(key, [...(landmarkIdsByCell.get(key) ?? []), landmark.id]);
  }

  const chunks: ChunkRenderModel[] = [];
  for (let y = 0; y < map.height; y += chunkSize) {
    for (let x = 0; x < map.width; x += chunkSize) {
      const bounds = {
        x,
        y,
        width: Math.min(chunkSize, map.width - x),
        height: Math.min(chunkSize, map.height - y),
      };
      const cells: ChunkRenderCell[] = [];

      for (let cellY = y; cellY < y + bounds.height; cellY += 1) {
        for (let cellX = x; cellX < x + bounds.width; cellX += 1) {
          const at = { x: cellX, y: cellY };
          const key = pointKey(at);
          cells.push({
            at,
            terrain: map.terrain[cellY][cellX],
            route: routeCells.has(key),
            clearing: clearingCells.has(key),
            landmarkIds: [...(landmarkIdsByCell.get(key) ?? [])],
          });
        }
      }

      chunks.push({ id: `${x / chunkSize},${y / chunkSize}`, bounds, cells });
    }
  }

  return chunks;
}

export function deriveCameraWindow(map: SemanticMap, focus: Point, viewport: Pick<CellRect, 'width' | 'height'>): CellRect {
  if (![focus.x, focus.y].every(Number.isFinite)) {
    throw new Error('camera focus must be finite');
  }
  if (![map.width, map.height, viewport.width, viewport.height].every(value => Number.isFinite(value) && value > 0)) {
    throw new Error('camera dimensions must be finite and positive');
  }

  const width = Math.min(map.width, viewport.width);
  const height = Math.min(map.height, viewport.height);
  return {
    x: Math.min(Math.max(focus.x - width / 2, 0), map.width - width),
    y: Math.min(Math.max(focus.y - height / 2, 0), map.height - height),
    width,
    height,
  };
}

export function cullChunkRenderModels(
  chunks: readonly ChunkRenderModel[],
  camera: CellRect,
): ChunkRenderModel[] {
  if (camera.width <= 0 || camera.height <= 0) return [];

  return chunks.filter(chunk => (
    chunk.bounds.x < camera.x + camera.width
    && chunk.bounds.x + chunk.bounds.width > camera.x
    && chunk.bounds.y < camera.y + camera.height
    && chunk.bounds.y + chunk.bounds.height > camera.y
  ));
}

export function transitionEventAt(map: SemanticMap, at: Point): TransitionRequestedEvent | null {
  if (!isInside(map, at)) throw new Error('transition cell must be an in-bounds integer point');

  const transition = map.landmarks.find(landmark => (
    landmark.at.x === at.x && landmark.at.y === at.y && landmark.transition
  ))?.transition;
  if (!transition) return null;

  return {
    type: 'transition-requested',
    targetMapId: transition.targetMapId,
    arrival: { ...transition.arrival },
    ...(transition.floor === undefined ? {} : { floor: transition.floor }),
  };
}

export function relocateOverworldPosition(
  map: SemanticMap,
  saved: Point,
  sameAreaCandidates: readonly Point[],
): Point {
  if (!Number.isInteger(saved.x) || !Number.isInteger(saved.y)) {
    throw new Error('saved position must use integer coordinates');
  }

  const semanticCells = new Set([
    ...map.routes.flatMap(route => route.cells.map(pointKey)),
    ...map.clearings.map(pointKey),
    ...map.landmarks.map(landmark => pointKey(landmark.approach)),
  ]);
  const walkable = deriveWalkability(map);
  const candidates = sameAreaCandidates.filter(candidate => (
    isInside(map, candidate)
    && walkable[candidate.y][candidate.x]
    && semanticCells.has(pointKey(candidate))
  ));

  candidates.sort((left, right) => (
    manhattanDistance(left, saved) - manhattanDistance(right, saved)
    || left.y - right.y
    || left.x - right.x
  ));
  if (!candidates[0]) throw new Error('no safe same-area relocation candidate');
  return { ...candidates[0] };
}

function manhattanDistance(left: Point, right: Point): number {
  return Math.abs(left.x - right.x) + Math.abs(left.y - right.y);
}
