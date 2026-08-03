import type { CardinalDirection } from './movementController.js';
import type { Point } from './semanticMap.js';

export interface RetainedPosition {
  /** Retained routing identity, distinct from the semantic data ID. */
  readonly mapId: string;
  readonly x: number;
  readonly y: number;
  readonly floor: number;
}

export interface RetainedSceneState {
  readonly position: RetainedPosition;
  readonly facing: CardinalDirection;
}

export interface RetainedInteractionTarget {
  /** Opaque ID interpreted only by the retained behavior layer. */
  readonly behaviorId: string;
  readonly at: Readonly<Point>;
}

export interface RetainedTransitionTarget {
  readonly targetMap: string;
  readonly toX: number;
  readonly toY: number;
  /** Omission is meaningful and must not be normalized to a default floor. */
  readonly toFloor?: number;
}

export interface RetainedStepRequest {
  readonly state: RetainedSceneState;
  readonly encounterZoneId: string | null;
}

export interface RetainedInteractionRequest {
  readonly state: RetainedSceneState;
  readonly target: RetainedInteractionTarget;
}

export interface RetainedTransitionRequest {
  readonly state: RetainedSceneState;
  readonly target: RetainedTransitionTarget;
}

export type RetainedTransitionOutcome =
  | { readonly status: 'blocked' }
  | { readonly status: 'completed'; readonly state: RetainedSceneState }
  | { readonly status: 'failed'; readonly fallbackState: RetainedSceneState };

export interface RetainedMapPort {
  step(request: RetainedStepRequest): void;
  interact(request: RetainedInteractionRequest): void;
  transition(request: RetainedTransitionRequest): Promise<RetainedTransitionOutcome>;
}

export interface SelectiveMapRoute {
  readonly retainedRoutingId: string;
  readonly semanticDataId: string;
}

export type MapEntryDecision =
  | {
      readonly runtime: 'selective';
      readonly semanticDataId: string;
      readonly state: RetainedSceneState;
    }
  | {
      readonly runtime: 'legacy';
      readonly scene: 'WorldMapScene';
      readonly state: RetainedSceneState;
      readonly disableRoutingId?: string;
    };

export interface RetainedCompatibilityFacts {
  readonly encounterZoneId: string | null;
  readonly interactionTarget: RetainedInteractionTarget | null;
  readonly transitionOutcome: RetainedTransitionOutcome | null;
}

export interface RetainedCompatibilitySnapshot extends RetainedCompatibilityFacts {
  readonly state: RetainedSceneState;
}

export function selectMapEntry(
  state: RetainedSceneState,
  enabledRoutes: readonly SelectiveMapRoute[],
): MapEntryDecision {
  const frozenState = freezeRetainedSceneState(state);
  assertSelectiveMapRoutes(enabledRoutes);
  const route = enabledRoutes.find(
    candidate => candidate.retainedRoutingId === frozenState.position.mapId,
  );

  if (route) {
    return Object.freeze({
      runtime: 'selective',
      semanticDataId: route.semanticDataId,
      state: frozenState,
    });
  }
  return Object.freeze({ runtime: 'legacy', scene: 'WorldMapScene', state: frozenState });
}

export function routeAfterRetainedTransition(
  source: RetainedSceneState,
  outcome: RetainedTransitionOutcome,
  enabledRoutes: readonly SelectiveMapRoute[],
): MapEntryDecision | null {
  assertRetainedSceneState(source);
  assertSelectiveMapRoutes(enabledRoutes);

  if (outcome.status === 'blocked') return null;
  if (outcome.status === 'failed') {
    const fallbackState = freezeRetainedSceneState(outcome.fallbackState);
    if (fallbackState.position.mapId !== source.position.mapId) {
      throw new Error('failed retained transition must fall back to its source map');
    }
    return Object.freeze({
      runtime: 'legacy',
      scene: 'WorldMapScene',
      state: fallbackState,
      disableRoutingId: source.position.mapId,
    });
  }
  return selectMapEntry(outcome.state, enabledRoutes);
}

export function syncRetainedCompatibilitySnapshot(
  state: RetainedSceneState,
  facts: Readonly<RetainedCompatibilityFacts>,
): RetainedCompatibilitySnapshot {
  if (facts.encounterZoneId !== null && facts.encounterZoneId.trim().length === 0) {
    throw new Error('retained encounter zone ID must not be blank');
  }
  const frozenState = freezeRetainedSceneState(state);
  const interactionTarget = facts.interactionTarget
    ? freezeInteractionTarget(facts.interactionTarget)
    : null;
  const transitionOutcome = facts.transitionOutcome
    ? freezeTransitionOutcome(facts.transitionOutcome)
    : null;

  return Object.freeze({
    state: frozenState,
    encounterZoneId: facts.encounterZoneId,
    interactionTarget,
    transitionOutcome,
  });
}

function assertRetainedSceneState(state: RetainedSceneState): void {
  const { mapId, x, y, floor } = state.position;
  if (mapId.trim().length === 0) throw new Error('retained map ID must not be empty');
  if (![x, y, floor].every(Number.isInteger) || floor <= 0) {
    throw new Error('retained position must use integer cells and a positive integer floor');
  }
}

function assertSelectiveMapRoutes(routes: readonly SelectiveMapRoute[]): void {
  const retainedRoutingIds = new Set<string>();
  for (const route of routes) {
    if (route.retainedRoutingId.trim().length === 0 || route.semanticDataId.trim().length === 0) {
      throw new Error('selective map route IDs must not be blank');
    }
    if (retainedRoutingIds.has(route.retainedRoutingId)) {
      throw new Error(`duplicate retained routing ID ${route.retainedRoutingId}`);
    }
    retainedRoutingIds.add(route.retainedRoutingId);
  }
}

function freezeRetainedSceneState(state: RetainedSceneState): RetainedSceneState {
  assertRetainedSceneState(state);
  return Object.freeze({
    position: Object.freeze({ ...state.position }),
    facing: state.facing,
  });
}

function freezeInteractionTarget(target: RetainedInteractionTarget): RetainedInteractionTarget {
  if (target.behaviorId.trim().length === 0) {
    throw new Error('retained interaction behavior ID must not be empty');
  }
  if (![target.at.x, target.at.y].every(Number.isInteger)) {
    throw new Error('retained interaction target must use integer cells');
  }
  return Object.freeze({
    behaviorId: target.behaviorId,
    at: Object.freeze({ ...target.at }),
  });
}

function freezeTransitionOutcome(outcome: RetainedTransitionOutcome): RetainedTransitionOutcome {
  if (outcome.status === 'blocked') return Object.freeze({ status: 'blocked' });
  if (outcome.status === 'completed') {
    return Object.freeze({ status: 'completed', state: freezeRetainedSceneState(outcome.state) });
  }
  return Object.freeze({
    status: 'failed',
    fallbackState: freezeRetainedSceneState(outcome.fallbackState),
  });
}
