import { Point } from './semanticMap.js';

export type CardinalDirection = 'up' | 'down' | 'left' | 'right';

export interface MovementState {
  cell: Point;
  target: Point | null;
  progress: number;
  facing: CardinalDirection;
  bufferedDirection: CardinalDirection | null;
}

export interface MovementResult {
  state: MovementState;
  committedCells: Point[];
}

export type CanEnterCell = (from: Point, to: Point) => boolean;

const DIRECTION_DELTAS: Record<CardinalDirection, Point> = {
  up: { x: 0, y: -1 },
  down: { x: 0, y: 1 },
  left: { x: -1, y: 0 },
  right: { x: 1, y: 0 },
};

export function createMovementState(cell: Point, facing: CardinalDirection = 'down'): MovementState {
  return {
    cell: { ...cell },
    target: null,
    progress: 0,
    facing,
    bufferedDirection: null,
  };
}

export function bufferDirection(state: MovementState, direction: CardinalDirection): MovementState {
  return { ...state, bufferedDirection: direction };
}

export function movementPosition(state: MovementState): Point {
  if (!state.target) return { ...state.cell };
  return {
    x: state.cell.x + (state.target.x - state.cell.x) * state.progress,
    y: state.cell.y + (state.target.y - state.cell.y) * state.progress,
  };
}

export function advanceMovement(
  initial: MovementState,
  distance: number,
  canEnter: CanEnterCell,
): MovementResult {
  if (!Number.isFinite(distance) || distance < 0) {
    throw new Error('movement distance must be a finite non-negative number');
  }

  let state: MovementState = {
    ...initial,
    cell: { ...initial.cell },
    target: initial.target ? { ...initial.target } : null,
  };
  const committedCells: Point[] = [];
  let remaining = distance;

  while (remaining > 0) {
    if (!state.target) {
      const direction = state.bufferedDirection;
      if (!direction) break;

      const delta = DIRECTION_DELTAS[direction];
      const target = { x: state.cell.x + delta.x, y: state.cell.y + delta.y };
      state = { ...state, facing: direction, bufferedDirection: null };
      if (!canEnter(state.cell, target)) break;
      state = { ...state, target, progress: 0 };
    }

    const distanceToCenter = 1 - state.progress;
    if (remaining < distanceToCenter) {
      state = { ...state, progress: state.progress + remaining };
      break;
    }

    remaining -= distanceToCenter;
    const cell = state.target!;
    committedCells.push({ ...cell });
    state = { ...state, cell, target: null, progress: 0 };
  }

  return { state, committedCells };
}
