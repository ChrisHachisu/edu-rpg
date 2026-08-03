import {
  selectMapEntry,
  type MapEntryDecision,
  type RetainedSceneState,
  type SelectiveMapRoute,
} from './retainedAdapterContract.js';
import { relocateOverworldPosition } from './overworldVerticalSlice.js';
import type { Point, SemanticMap } from './semanticMap.js';

export type ReentryBlocker =
  | 'saved-map-not-overworld'
  | 'routing-id-mismatch'
  | 'legacy-revision-provenance-absent'
  | 'pre-migration-snapshot-unavailable'
  | 'same-area-candidate-provenance-missing'
  | 'no-safe-same-area-candidate';

export type LegacyRevisionEvidence =
  | { readonly status: 'absent' }
  | {
      readonly status: 'verified';
      readonly legacyRevisionId: string;
      readonly rebuiltRevision: number;
    };

export type SnapshotEvidence =
  | { readonly status: 'required-unimplemented' }
  | { readonly status: 'verified'; readonly snapshotId: string };

export type CandidateEvidence =
  | { readonly status: 'missing' }
  | {
      /** Upstream guarantees these belong to the saved progression area. */
      readonly status: 'verified';
      readonly candidates: readonly Point[];
    };

export interface OverworldReentryInput {
  readonly map: SemanticMap;
  readonly savedState: RetainedSceneState;
  readonly route: SelectiveMapRoute;
  readonly revision: LegacyRevisionEvidence;
  readonly snapshot: SnapshotEvidence;
  readonly candidates: CandidateEvidence;
}

type LegacyEntry = Extract<MapEntryDecision, { runtime: 'legacy' }>;
type SelectiveEntry = Extract<MapEntryDecision, { runtime: 'selective' }>;

export type OverworldReentryPlan =
  | {
      readonly kind: 'retained-fallback';
      readonly blockers: readonly ReentryBlocker[];
      readonly entry: LegacyEntry;
    }
  | {
      /** Candidate only; no save write, scene dispatch, or migration commit occurred. */
      readonly kind: 'selective-candidate';
      readonly blockers: readonly [];
      readonly entry: SelectiveEntry;
    };

export function planOverworldReentry(input: OverworldReentryInput): OverworldReentryPlan {
  const fallbackEntry = selectMapEntry(input.savedState, []);
  if (fallbackEntry.runtime !== 'legacy') throw new Error('empty route table must select legacy entry');

  if (fallbackEntry.state.position.mapId !== 'overworld') {
    return retainedFallback(fallbackEntry, ['saved-map-not-overworld']);
  }

  if (input.route.retainedRoutingId !== 'overworld'
    || input.route.retainedRoutingId !== fallbackEntry.state.position.mapId
    || input.route.semanticDataId !== input.map.id
    || input.map.kind !== 'overworld') {
    return retainedFallback(fallbackEntry, ['routing-id-mismatch']);
  }

  const prerequisiteBlockers: ReentryBlocker[] = [];
  if (input.revision.status === 'absent') {
    prerequisiteBlockers.push('legacy-revision-provenance-absent');
  } else {
    validateRevisionEvidence(input.revision, input.map);
  }
  if (input.snapshot.status === 'required-unimplemented') {
    prerequisiteBlockers.push('pre-migration-snapshot-unavailable');
  } else if (input.snapshot.snapshotId.trim().length === 0) {
    throw new Error('verified pre-migration snapshot ID must not be blank');
  }
  if (prerequisiteBlockers.length > 0) {
    return retainedFallback(fallbackEntry, prerequisiteBlockers);
  }

  if (input.candidates.status === 'missing') {
    return retainedFallback(fallbackEntry, ['same-area-candidate-provenance-missing']);
  }

  let relocated: Point;
  try {
    relocated = relocateOverworldPosition(
      input.map,
      fallbackEntry.state.position,
      input.candidates.candidates,
    );
  } catch (error) {
    if (error instanceof Error && error.message === 'no safe same-area relocation candidate') {
      return retainedFallback(fallbackEntry, ['no-safe-same-area-candidate']);
    }
    throw error;
  }

  const candidateState: RetainedSceneState = {
    position: {
      mapId: fallbackEntry.state.position.mapId,
      x: relocated.x,
      y: relocated.y,
      floor: fallbackEntry.state.position.floor,
    },
    facing: fallbackEntry.state.facing,
  };
  const candidateEntry = selectMapEntry(candidateState, [input.route]);
  if (candidateEntry.runtime !== 'selective') {
    throw new Error('eligible overworld re-entry must select its exact semantic route');
  }

  return Object.freeze({
    kind: 'selective-candidate',
    blockers: Object.freeze([]) as readonly [],
    entry: candidateEntry,
  });
}

function retainedFallback(
  entry: LegacyEntry,
  blockers: readonly ReentryBlocker[],
): Extract<OverworldReentryPlan, { kind: 'retained-fallback' }> {
  return Object.freeze({
    kind: 'retained-fallback',
    blockers: Object.freeze([...blockers]),
    entry,
  });
}

function validateRevisionEvidence(
  evidence: Extract<LegacyRevisionEvidence, { status: 'verified' }>,
  map: SemanticMap,
): void {
  const legacyRevisionId = evidence.legacyRevisionId.trim();
  if (legacyRevisionId.length === 0) {
    throw new Error('verified legacy revision ID must not be blank');
  }
  if (!Number.isInteger(evidence.rebuiltRevision) || evidence.rebuiltRevision <= 0) {
    throw new Error('verified rebuilt revision must be a positive integer');
  }
  if (evidence.rebuiltRevision !== map.revision) {
    throw new Error('verified rebuilt revision must equal the semantic map revision');
  }
  if (legacyRevisionId === String(evidence.rebuiltRevision)) {
    throw new Error('legacy revision ID must not reuse the rebuilt revision token');
  }
}
