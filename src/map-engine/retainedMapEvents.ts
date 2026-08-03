import { Point } from './semanticMap.js';

export type MapEvent =
  | { type: 'tile-center-committed'; at: Point }
  | { type: 'interaction-requested' }
  | {
      type: 'transition-requested';
      targetMapId: string;
      arrival: Point;
      floor?: number;
    };

export interface RetainedTransitionTarget {
  targetMap: string;
  toX: number;
  toY: number;
  toFloor?: number;
}

export interface RetainedMapCalls {
  onStep(): void;
  interact(): void;
  performTransition(target: RetainedTransitionTarget): void;
}

export function dispatchRetainedMapEvent(event: MapEvent, retained: RetainedMapCalls): void {
  if (event.type === 'tile-center-committed') {
    retained.onStep();
    return;
  }
  if (event.type === 'interaction-requested') {
    retained.interact();
    return;
  }

  // ponytail: retained performTransition stays authoritative for story and quest entry guards.
  retained.performTransition({
    targetMap: event.targetMapId,
    toX: event.arrival.x,
    toY: event.arrival.y,
    ...(event.floor === undefined ? {} : { toFloor: event.floor }),
  });
}
