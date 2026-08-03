import {
  advanceMovement,
  bufferDirection,
  createMovementState,
  movementPosition,
} from './movementController.js';
import {
  RetainedMapCalls,
  dispatchRetainedMapEvent,
} from './retainedMapEvents.js';
import {
  ACT1_OVERWORLD_RETAINED_BEHAVIOR,
  validateRetainedBehaviorManifest,
} from './retainedBehaviorManifest.js';
import {
  routeAfterRetainedTransition,
  selectMapEntry,
  syncRetainedCompatibilitySnapshot,
} from './retainedAdapterContract.js';
import { planOverworldReentry } from './reentryEligibilityPlanner.js';
import {
  Point,
  Terrain,
  deriveMinimapModel,
  deriveWalkability,
  isInside,
  pointKey,
} from './semanticMap.js';
import { buildStarterOverworld } from './starterOverworld.js';
import { shouldUseSelectiveMapEngine } from './mapEngineFeatureFlag.js';
import {
  cullChunkRenderModels,
  deriveCameraWindow,
  deriveChunkRenderModels,
  relocateOverworldPosition,
  transitionEventAt,
} from './overworldVerticalSlice.js';

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function assertThrows(action: () => unknown, message: string): void {
  let threw = false;
  try {
    action();
  } catch {
    threw = true;
  }
  assert(threw, message);
}

function mutableClone(value: unknown): any {
  return JSON.parse(JSON.stringify(value));
}

function assertManifestError(candidate: unknown, fragment: string, message: string): void {
  const errors = validateRetainedBehaviorManifest(candidate);
  assert(errors.some((error: string) => error.includes(fragment)), `${message}: ${errors.join('; ')}`);
}

type ExpectedRetainedGuard =
  | { kind: 'none' }
  | { kind: 'truthy-story-key'; storyKey: string }
  | { kind: 'quest-membership'; questId: string }
  | { kind: 'all'; guards: ExpectedRetainedGuard[] };

interface ExpectedRetainedTransition {
  id: string;
  targetMapId: string;
  requestedFloor?: number;
  effectiveFloor: number;
  floorBehavior: 'default-1' | 'explicit';
  guardOwner: string;
  guard: ExpectedRetainedGuard;
  requestedArrivalBehavior?: string;
  retainedDungeonArrivalCorrection?: string;
}

interface ExpectedChunkRenderModel {
  id: string;
  bounds: { x: number; y: number; width: number; height: number };
  cells: {
    at: Point;
    terrain: Terrain;
    route: boolean;
    clearing: boolean;
    landmarkIds: string[];
  }[];
}

let movement = bufferDirection(createMovementState({ x: 2, y: 2 }), 'right');
let result = advanceMovement(movement, 0.4, () => true);
let position = movementPosition(result.state);

assert(pointKey(result.state.cell) === '2,2', 'fractional motion must not commit the next semantic cell early');
assert(pointKey(result.state.target!) === '3,2', 'right input must target the cardinal neighbor');
assert(position.x === 2.4 && position.y === 2, 'render position must interpolate continuously between tile centers');
assert(result.committedCells.length === 0, 'fractional motion must not emit a tile-center commit');

movement = bufferDirection(result.state, 'up');
result = advanceMovement(movement, 0.8, () => true);
position = movementPosition(result.state);

assert(
  result.committedCells.map(pointKey).join(',') === '3,2',
  'reaching a center must emit exactly one semantic commit',
);
assert(pointKey(result.state.cell) === '3,2', 'the committed cell must advance at the tile center');
assert(pointKey(result.state.target!) === '3,1', 'buffered input must turn at the next tile center');
assert(
  Math.abs(position.x - 3) < 1e-9 && Math.abs(position.y - 1.8) < 1e-9,
  'unused travel distance must continue along the buffered turn',
);

const latestInput = advanceMovement(
  bufferDirection(bufferDirection(createMovementState({ x: 4, y: 4 }), 'left'), 'down'),
  1,
  () => true,
);
assert(pointKey(latestInput.state.cell) === '4,5', 'the latest buffered cardinal input must win');

const blocked = advanceMovement(
  bufferDirection(createMovementState({ x: 1, y: 1 }), 'left'),
  1,
  () => false,
);
assert(pointKey(blocked.state.cell) === '1,1', 'collision must keep the committed semantic cell unchanged');
assert(blocked.state.target === null && blocked.state.bufferedDirection === null, 'blocked input must be consumed at the center');
assert(blocked.committedCells.length === 0, 'blocked movement must not emit a semantic commit');

let rejectedNegativeDistance = false;
try {
  advanceMovement(createMovementState({ x: 0, y: 0 }), -0.1, () => true);
} catch {
  rejectedNegativeDistance = true;
}
assert(rejectedNegativeDistance, 'movement must reject negative travel distance');

const retainedCalls: string[] = [];
const transitions: Parameters<RetainedMapCalls['performTransition']>[0][] = [];
const retained: RetainedMapCalls = {
  onStep: () => retainedCalls.push('step'),
  interact: () => retainedCalls.push('interact'),
  performTransition: target => {
    retainedCalls.push('transition');
    transitions.push(target);
  },
};

dispatchRetainedMapEvent({ type: 'tile-center-committed', at: { x: 3, y: 2 } }, retained);
dispatchRetainedMapEvent({ type: 'interaction-requested' }, retained);
dispatchRetainedMapEvent({
  type: 'transition-requested',
  targetMapId: 'mistyGrotto',
  arrival: { x: 50, y: 1 },
  floor: 2,
}, retained);

assert(retainedCalls.join(',') === 'step,interact,transition', 'each map event must call only its retained owner');
assert(
  JSON.stringify(transitions[0]) === JSON.stringify({
    targetMap: 'mistyGrotto',
    toX: 50,
    toY: 1,
    toFloor: 2,
  }),
  'semantic transitions must translate to the shipped performTransition shape',
);

dispatchRetainedMapEvent({
  type: 'transition-requested',
  targetMapId: 'greenhollow',
  arrival: { x: 8, y: 14 },
}, retained);
assert(
  !Object.prototype.hasOwnProperty.call(transitions[1], 'toFloor'),
  'an unspecified semantic floor must remain unspecified for retained transition handling',
);

const retainedSceneState = {
  position: { mapId: 'overworld', x: 6, y: 20, floor: 1 },
  facing: 'right' as const,
};
const steppedCompatibility = syncRetainedCompatibilitySnapshot(retainedSceneState, {
  encounterZoneId: 'greenhollow-route',
  interactionTarget: { behaviorId: 'greenhollow-entry', at: { x: 4, y: 20 } },
  transitionOutcome: null,
});
assert(
  steppedCompatibility.encounterZoneId === 'greenhollow-route'
    && steppedCompatibility.state.position.mapId === 'overworld'
    && steppedCompatibility.state.position.x === 6
    && steppedCompatibility.state.facing === 'right'
    && steppedCompatibility.interactionTarget?.behaviorId === 'greenhollow-entry'
    && pointKey(steppedCompatibility.interactionTarget.at) === '4,20',
  'step sync must preserve retained scene state, encounter zone, and semantic interaction target',
);
assert(
  steppedCompatibility.state !== retainedSceneState
    && steppedCompatibility.state.position !== retainedSceneState.position
    && Object.isFrozen(steppedCompatibility)
    && Object.isFrozen(steppedCompatibility.state)
    && Object.isFrozen(steppedCompatibility.state.position)
    && Object.isFrozen(steppedCompatibility.interactionTarget)
    && Object.isFrozen(steppedCompatibility.interactionTarget?.at),
  'compatibility sync must return a deeply frozen clone',
);
retainedSceneState.position.x = 99;
assert(steppedCompatibility.state.position.x === 6, 'source mutation must not change the compatibility snapshot');
assertThrows(
  () => syncRetainedCompatibilitySnapshot({
    position: { mapId: 'overworld', x: 5.5, y: 20, floor: 1 },
    facing: 'right',
  }, {
    encounterZoneId: null,
    interactionTarget: null,
    transitionOutcome: null,
  }),
  'retained compatibility sync must reject fractional scene positions',
);
assertThrows(
  () => syncRetainedCompatibilitySnapshot({
    position: { mapId: 'overworld', x: 6, y: 20, floor: 1 },
    facing: 'right',
  }, {
    encounterZoneId: ' ',
    interactionTarget: null,
    transitionOutcome: null,
  }),
  'retained compatibility sync must reject a blank encounter-zone ID',
);
assert(
  syncRetainedCompatibilitySnapshot({
    position: { mapId: 'overworld', x: 6, y: 20, floor: 1 },
    facing: 'right',
  }, {
    encounterZoneId: null,
    interactionTarget: null,
    transitionOutcome: null,
  }).encounterZoneId === null,
  'a null encounter-zone ID must remain a valid explicit absence',
);

const sourceState = {
  position: { mapId: 'overworld', x: 6, y: 20, floor: 1 },
  facing: 'right' as const,
};
const completedState = {
  position: { mapId: 'greenhollow', x: 8, y: 14, floor: 1 },
  facing: 'down' as const,
};
const blockedOutcome = { status: 'blocked' as const };
const completedOutcome = { status: 'completed' as const, state: completedState };
const failedOutcome = { status: 'failed' as const, fallbackState: sourceState };
for (const transitionOutcome of [blockedOutcome, completedOutcome, failedOutcome]) {
  const compatibility = syncRetainedCompatibilitySnapshot(sourceState, {
    encounterZoneId: null,
    interactionTarget: null,
    transitionOutcome,
  });
  assert(
    compatibility.transitionOutcome?.status === transitionOutcome.status
      && Object.isFrozen(compatibility.transitionOutcome),
    `${transitionOutcome.status} transition outcome must be preserved as a frozen compatibility fact`,
  );
}

const adapterRoutes = [
  { retainedRoutingId: 'overworld', semanticDataId: 'overworld-act1-slice' },
  { retainedRoutingId: 'greenhollow', semanticDataId: 'greenhollow-semantic' },
] as const;
assertThrows(
  () => selectMapEntry(sourceState, [
    { retainedRoutingId: '', semanticDataId: 'overworld-act1-slice' },
  ]),
  'map entry must reject a blank retained routing ID in the route table',
);
assertThrows(
  () => selectMapEntry(sourceState, [
    { retainedRoutingId: 'overworld', semanticDataId: ' ' },
  ]),
  'map entry must reject a blank semantic data ID in the route table',
);
assertThrows(
  () => selectMapEntry(sourceState, [
    { retainedRoutingId: 'overworld', semanticDataId: 'overworld-act1-slice' },
    { retainedRoutingId: 'overworld', semanticDataId: 'overworld-v2' },
  ]),
  'map entry must reject duplicate retained routing IDs',
);
assert(
  JSON.stringify(selectMapEntry(sourceState, adapterRoutes)) === JSON.stringify({
    runtime: 'selective',
    semanticDataId: 'overworld-act1-slice',
    state: sourceState,
  }),
  'map entry must translate an exact retained routing ID to its enabled semantic data ID',
);
for (const mapId of ['millbrook', 'overworld-act1-slice', 'overworld-extra']) {
  const exactState = { ...sourceState, position: { ...sourceState.position, mapId } };
  assert(
    JSON.stringify(selectMapEntry(exactState, adapterRoutes)) === JSON.stringify({
      runtime: 'legacy',
      scene: 'WorldMapScene',
      state: exactState,
    }),
    `${mapId} must use exact retained-routing-ID legacy map entry`,
  );
}

for (const entryState of [
  { position: { mapId: 'overworld', x: 6, y: 20, floor: 1 }, facing: 'right' as const },
  { position: { mapId: 'millbrook', x: 8, y: 14, floor: 1 }, facing: 'down' as const },
]) {
  const entry = selectMapEntry(entryState, adapterRoutes);
  assert(
    entry.state !== entryState
      && entry.state.position !== entryState.position
      && Object.isFrozen(entry.state)
      && Object.isFrozen(entry.state.position),
    `${entry.runtime} map entry must return a deeply frozen state clone`,
  );
  const expectedX = entry.state.position.x;
  entryState.position.x = 99;
  assert(entry.state.position.x === expectedX, `${entry.runtime} entry must ignore later source mutation`);
}

assert(
  routeAfterRetainedTransition(sourceState, blockedOutcome, adapterRoutes) === null,
  'a blocked retained transition must not route away from the current map',
);
assert(
  JSON.stringify(routeAfterRetainedTransition(sourceState, completedOutcome, adapterRoutes))
  === JSON.stringify({
    runtime: 'selective',
    semanticDataId: 'greenhollow-semantic',
    state: completedState,
  }),
  'a completed retained transition must enter an enabled exact semantic map',
);
assert(
  JSON.stringify(routeAfterRetainedTransition(sourceState, completedOutcome, [adapterRoutes[0]]))
  === JSON.stringify({ runtime: 'legacy', scene: 'WorldMapScene', state: completedState }),
  'a completed retained transition must use legacy when its exact semantic map is disabled',
);
const adapterRouteSnapshot = adapterRoutes.map(route => ({ ...route }));
assert(
  JSON.stringify(routeAfterRetainedTransition(sourceState, failedOutcome, adapterRoutes))
    === JSON.stringify({
      runtime: 'legacy',
      scene: 'WorldMapScene',
      state: sourceState,
      disableRoutingId: 'overworld',
    })
    && JSON.stringify(adapterRoutes) === JSON.stringify(adapterRouteSnapshot),
  'a failed transition must immutably disable only the source routing ID and re-enter its legacy map',
);
assertThrows(
  () => routeAfterRetainedTransition(sourceState, {
    status: 'failed',
    fallbackState: completedState,
  }, adapterRoutes),
  'a failed transition must reject a fallback state from a different retained map',
);

const behavior = ACT1_OVERWORLD_RETAINED_BEHAVIOR;
const censusTransitions = behavior.transitions as unknown as ExpectedRetainedTransition[];
assert(behavior.schemaVersion === 1, 'the retained behavior census must use schema version 1');
assert(
  behavior.retainedRoutingId === 'overworld'
    && behavior.semanticDataId === 'overworld-act1-slice',
  'the census must distinguish retained routing identity from semantic data identity',
);

const emptyTransitions = mutableClone(behavior);
emptyTransitions.transitions = [];
assertManifestError(emptyTransitions, 'transitions', 'validator must reject an empty transition census');

const expectedTransitionTargets = [
  'greenhollow:1',
  'millbrook:1',
  'portSapphire:1',
  'mistyGrotto:1',
  'crystalCave:1',
  'crystalCave:5',
  'sunkenCellar:1',
  'whisperingWoodsCave:1',
  'coastalReef:1',
].sort();
assert(
  censusTransitions.length === 9
    && new Set(censusTransitions.map(transition => transition.id)).size === 9
    && censusTransitions
      .map((transition: ExpectedRetainedTransition) => `${transition.targetMapId}:${transition.effectiveFloor}`)
      .sort()
      .join(',') === expectedTransitionTargets.join(','),
  'the census must contain exactly the nine retained Act 1 transition identities',
);
assert(
  censusTransitions.every(transition => (
    transition.guardOwner === 'retained.performTransition'
    && Number.isInteger(transition.effectiveFloor)
    && transition.effectiveFloor > 0
  )),
  'every transition must retain guard ownership and a positive effective floor',
);

const transitionTo = (targetMapId: string, effectiveFloor = 1) => (
  censusTransitions.find(transition => (
    transition.targetMapId === targetMapId && transition.effectiveFloor === effectiveFloor
  ))
);
const floor1Transitions = censusTransitions.filter(transition => transition.effectiveFloor === 1);
assert(
  floor1Transitions.length === 8
    && floor1Transitions.every(transition => (
      transition.floorBehavior === 'default-1' && transition.requestedFloor === undefined
    )),
  'floor-1 transitions must preserve omitted requested floors as default-1 behavior',
);
const explicitFloor5 = transitionTo('crystalCave', 5);
assert(
  explicitFloor5?.floorBehavior === 'explicit'
    && explicitFloor5.requestedFloor === 5
    && explicitFloor5.effectiveFloor === 5,
  'Crystal Cave floor 5 must preserve an explicit requested and effective floor',
);
for (const targetMapId of ['greenhollow', 'millbrook', 'portSapphire', 'mistyGrotto', 'sunkenCellar']) {
  assert(transitionTo(targetMapId)?.guard.kind === 'none', `${targetMapId} must remain unguarded`);
}

const crystalFloor1 = transitionTo('crystalCave', 1);
assert(
  crystalFloor1
    && crystalFloor1.guard.kind === 'truthy-story-key'
    && crystalFloor1.guard.storyKey === 'boss.giantToad.defeated',
  'Crystal Cave floor 1 must retain the Giant Toad truthy-story guard',
);
const crystalFloor5 = transitionTo('crystalCave', 5);
assert(
  crystalFloor5
    && crystalFloor5.guard.kind === 'all'
    && crystalFloor5.guard.guards.map((guard: ExpectedRetainedGuard) => (
      guard.kind === 'truthy-story-key' ? guard.storyKey : ''
    )).join(',') === 'boss.giantToad.defeated,boss.serpent.defeated',
  'Crystal Cave floor 5 must retain both truthy-story guards',
);
const whispering = transitionTo('whisperingWoodsCave');
assert(
  whispering
    && whispering.guard.kind === 'quest-membership'
    && whispering.guard.questId === 'owlsLesson',
  'Whispering Woods Cave must retain the owlsLesson membership guard',
);
const coastal = transitionTo('coastalReef');
assert(
  coastal
    && coastal.guard.kind === 'quest-membership'
    && coastal.guard.questId === 'drakeCargo',
  'Coastal Reef must retain the drakeCargo membership guard',
);

for (const targetMapId of ['greenhollow', 'millbrook', 'portSapphire']) {
  const town = transitionTo(targetMapId);
  assert(
    town?.requestedArrivalBehavior === 'requested'
      && town.retainedDungeonArrivalCorrection === undefined,
    `${targetMapId} must preserve requested town arrival behavior`,
  );
}
for (const targetMapId of [
  'mistyGrotto',
  'crystalCave',
  'sunkenCellar',
  'whisperingWoodsCave',
  'coastalReef',
]) {
  for (const dungeon of censusTransitions.filter(transition => transition.targetMapId === targetMapId)) {
    assert(
      dungeon.retainedDungeonArrivalCorrection === 'unverified',
      `${targetMapId} must mark retained dungeon arrival correction unverified`,
    );
  }
}

assert(
  behavior.eventOwners.tileCenterCommitted === 'retained.onStep'
    && behavior.eventOwners.interactionRequested === 'retained.interact'
    && behavior.eventOwners.transitionRequested === 'retained.performTransition'
    && behavior.eventOwners.encounterResolution === 'retained-runtime',
  'the census must preserve exact retained event ownership',
);
assert(
  behavior.save.owner === 'retained-runtime'
    && behavior.save.version === 4
    && behavior.save.storageKeys.join(',') === 'edu-rpg-save,edu-rpg-autosave'
    && behavior.save.fields.join(',') === 'mapId,x,y,floor'
    && behavior.save.mapRevisionProvenance === 'absent'
    && behavior.save.preMigrationSnapshot === 'required-unimplemented',
  'the census must preserve retained save identity and expose missing migration provenance',
);
assert(
  behavior.rollback.selectorRoutingId === 'overworld'
    && behavior.rollback.legacyScene === 'WorldMapScene'
    && behavior.rollback.failureScope === 'this-map-only'
    && behavior.rollback.status === 'required-unimplemented',
  'rollback must select the retained overworld route and remain explicitly unimplemented',
);
assert(
  behavior.adapterGaps.join(',') === [
    'encounter-zone',
    'interaction-target',
    'transition-outcome',
    'routing-id-bridge',
    'map-revision-provenance',
    'pre-migration-snapshot',
    'hud-compatibility',
    'retained-scene-state-sync',
    'selective-runtime-router',
  ].join(','),
  'the census must inventory every unresolved adapter boundary',
);
assert(
  shouldUseSelectiveMapEngine(behavior.retainedRoutingId, ['overworld'])
    && !shouldUseSelectiveMapEngine(behavior.semanticDataId, ['overworld']),
  'feature-flag selection must use the retained routing ID, not the semantic data ID',
);

assert(
  validateRetainedBehaviorManifest(behavior).length === 0,
  'the locked Act 1 retained behavior manifest must validate',
);

const duplicateTransition = mutableClone(behavior);
duplicateTransition.transitions[1].id = duplicateTransition.transitions[0].id;
assertManifestError(duplicateTransition, 'duplicate transition id', 'validator must reject duplicate transition IDs');

const nonpositiveFloor = mutableClone(behavior);
nonpositiveFloor.transitions[0].effectiveFloor = 0;
assertManifestError(nonpositiveFloor, 'effectiveFloor', 'validator must reject nonpositive effective floors');

const blankStoryGuard = mutableClone(behavior);
blankStoryGuard.transitions.find((transition: any) => (
  transition.targetMapId === 'crystalCave' && transition.effectiveFloor === 1
)).guard.storyKey = ' ';
assertManifestError(blankStoryGuard, 'storyKey', 'validator must reject blank retained story keys');

const blankQuestGuard = mutableClone(behavior);
blankQuestGuard.transitions.find((transition: any) => (
  transition.targetMapId === 'whisperingWoodsCave'
)).guard.questId = '';
assertManifestError(blankQuestGuard, 'questId', 'validator must reject blank retained quest IDs');

for (const forbiddenKey of ['arrival', 'routes', 'cells']) {
  const leakedGeography = mutableClone(behavior);
  leakedGeography[forbiddenKey] = [];
  assertManifestError(
    leakedGeography,
    forbiddenKey,
    `validator must reject leaked semantic geography field ${forbiddenKey}`,
  );
}

const leakedRequiredFlag = mutableClone(behavior);
leakedRequiredFlag.transitions[0].requiredFlag = 'quest.optional';
assertManifestError(
  leakedRequiredFlag,
  'requiredFlag',
  'validator must keep optional retained guards out of semantic progression data',
);
const leakedProgressionGates = mutableClone(behavior);
leakedProgressionGates.progressionGates = [];
assertManifestError(
  leakedProgressionGates,
  'progressionGates',
  'validator must reject semantic progression gates in the behavior census',
);

const wrongGuardOwner = mutableClone(behavior);
wrongGuardOwner.transitions[0].guardOwner = 'map-engine';
assertManifestError(wrongGuardOwner, 'guardOwner', 'validator must reject map-owned retained guards');

const wrongEventOwner = mutableClone(behavior);
wrongEventOwner.eventOwners.interactionRequested = 'map-engine';
assertManifestError(wrongEventOwner, 'interactionRequested', 'validator must reject wrong event ownership');

const wrongSaveFields = mutableClone(behavior);
wrongSaveFields.save.fields = ['mapId', 'x', 'y'];
assertManifestError(wrongSaveFields, 'save fields', 'validator must reject incomplete retained save fields');

const wrongRollbackSelector = mutableClone(behavior);
wrongRollbackSelector.rollback.selectorRoutingId = behavior.semanticDataId;
assertManifestError(
  wrongRollbackSelector,
  'selectorRoutingId',
  'validator must reject rollback keyed by semantic data identity',
);

const inventedGreenhollowGuard = mutableClone(behavior);
inventedGreenhollowGuard.transitions.find((transition: any) => (
  transition.targetMapId === 'greenhollow'
)).guard = { kind: 'truthy-story-key', storyKey: 'story.invented' };
assertManifestError(
  inventedGreenhollowGuard,
  '',
  'validator must reject invented guards that differ from the locked transition census',
);

const unknownRootField = mutableClone(behavior);
unknownRootField.runtimeWired = false;
assertManifestError(unknownRootField, 'runtimeWired', 'validator must reject unknown root fields');

const unknownRollbackField = mutableClone(behavior);
unknownRollbackField.rollback.implemented = false;
assertManifestError(
  unknownRollbackField,
  'implemented',
  'validator must reject unknown nested rollback fields',
);

const wrongTownArrivalBehavior = mutableClone(behavior);
wrongTownArrivalBehavior.transitions.find((transition: any) => (
  transition.targetMapId === 'greenhollow'
)).requestedArrivalBehavior = 'semantic-rewrite';
assertManifestError(
  wrongTownArrivalBehavior,
  'requestedArrivalBehavior',
  'validator must reject invalid requested town arrival behavior',
);

const wrongDungeonArrivalCorrection = mutableClone(behavior);
wrongDungeonArrivalCorrection.transitions.find((transition: any) => (
  transition.targetMapId === 'mistyGrotto'
)).retainedDungeonArrivalCorrection = 'assumed-correct';
assertManifestError(
  wrongDungeonArrivalCorrection,
  'retainedDungeonArrivalCorrection',
  'validator must reject invented dungeon arrival correction status',
);

const overworld = buildStarterOverworld(42);
const retainedOverworldState = {
  position: { mapId: 'overworld', x: 4, y: 20, floor: 1 },
  facing: 'down',
} as const;
const eligibleReentryInput = {
  savedState: retainedOverworldState,
  route: { retainedRoutingId: 'overworld', semanticDataId: 'overworld-act1-slice' },
  revision: { status: 'verified', legacyRevisionId: 'legacy-v1', rebuiltRevision: 3 },
  snapshot: { status: 'verified', snapshotId: 'snapshot-act1-before-rebuild' },
  candidates: { status: 'verified', candidates: [{ x: 5, y: 20 }] },
  map: overworld,
} as const;

const nonOverworldState = {
  position: { mapId: 'millbrook', x: 8, y: 14, floor: 1 },
  facing: 'left',
} as const;
const retainedDelegation = planOverworldReentry({
  ...eligibleReentryInput,
  savedState: nonOverworldState,
  route: { retainedRoutingId: 'millbrook', semanticDataId: 'millbrook-semantic' },
});
assert(
  retainedDelegation.kind === 'retained-fallback'
    && retainedDelegation.entry.runtime === 'legacy'
    && retainedDelegation.entry.scene === 'WorldMapScene'
    && JSON.stringify(retainedDelegation.entry.state) === JSON.stringify(nonOverworldState)
    && retainedDelegation.blockers.includes('saved-map-not-overworld'),
  'non-overworld re-entry must delegate to the retained scene with unchanged position',
);

const shippedBlockersInput = {
  ...eligibleReentryInput,
  revision: { status: 'absent' as const },
  snapshot: { status: 'required-unimplemented' as const },
};
const shippedBlockersSnapshot = JSON.stringify(shippedBlockersInput);
const shippedBlockers = planOverworldReentry(shippedBlockersInput);
assert(
  shippedBlockers.kind === 'retained-fallback'
    && shippedBlockers.entry.runtime === 'legacy'
    && shippedBlockers.entry.scene === 'WorldMapScene'
    && JSON.stringify(shippedBlockers.entry.state) === JSON.stringify(retainedOverworldState)
    && shippedBlockers.blockers.includes('legacy-revision-provenance-absent')
    && shippedBlockers.blockers.includes('pre-migration-snapshot-unavailable')
    && JSON.stringify(shippedBlockersInput) === shippedBlockersSnapshot,
  'absent shipped revision and unimplemented snapshot must block re-entry without mutation',
);

for (const { input, blocker } of [
  {
    input: {
      ...eligibleReentryInput,
      route: { retainedRoutingId: 'overworld-v2' as const, semanticDataId: 'overworld-act1-slice' },
    },
    blocker: 'routing-id-mismatch' as const,
  },
  {
    input: { ...eligibleReentryInput, candidates: { status: 'missing' as const } },
    blocker: 'same-area-candidate-provenance-missing' as const,
  },
  {
    input: {
      ...eligibleReentryInput,
      candidates: { status: 'verified' as const, candidates: [] },
    },
    blocker: 'no-safe-same-area-candidate' as const,
  },
  {
    input: {
      ...eligibleReentryInput,
      candidates: { status: 'verified' as const, candidates: [{ x: 0, y: 0 }] },
    },
    blocker: 'no-safe-same-area-candidate' as const,
  },
]) {
  const inputSnapshot = JSON.stringify(input);
  const plan = planOverworldReentry(input);
  assert(
    plan.kind === 'retained-fallback'
      && plan.entry.runtime === 'legacy'
      && plan.entry.scene === 'WorldMapScene'
      && JSON.stringify(plan.entry.state) === JSON.stringify(retainedOverworldState)
      && plan.blockers.includes(blocker)
      && JSON.stringify(input) === inputSnapshot,
    `${blocker} must preserve the retained WorldMapScene position without mutation`,
  );
}

const eligibleInputSnapshot = JSON.stringify(eligibleReentryInput);
const eligibleReentry = planOverworldReentry(eligibleReentryInput);
assert(
  eligibleReentry.kind === 'selective-candidate'
    && eligibleReentry.entry.runtime === 'selective'
    && eligibleReentry.entry.semanticDataId === 'overworld-act1-slice'
    && JSON.stringify(eligibleReentry.entry.state) === JSON.stringify({
      position: { mapId: 'overworld', x: 5, y: 20, floor: 1 },
      facing: 'down',
    })
    && JSON.stringify(eligibleReentryInput) === eligibleInputSnapshot,
  'only an all-gates-pass plan may relocate to a selective overworld candidate without mutation',
);
for (const plan of [retainedDelegation, shippedBlockers, eligibleReentry]) {
  assert(
    Object.isFrozen(plan)
      && Object.isFrozen(plan.entry)
      && Object.isFrozen(plan.entry.state)
      && Object.isFrozen(plan.entry.state.position)
      && Object.isFrozen(plan.blockers),
    `${plan.kind} must deeply freeze the plan, entry, retained state, position, and blockers`,
  );
}

const chunks: ExpectedChunkRenderModel[] = deriveChunkRenderModels(overworld, 8);
const chunkCells = chunks.flatMap(chunk => chunk.cells);
const chunkCellKeys = new Set(chunkCells.map(cell => pointKey(cell.at)));

assert(chunks.length === 12, '30x24 terrain must produce twelve 8-cell chunks');
assert(
  chunks[0].id === '0,0' && chunks[chunks.length - 1].id === '3,2',
  'chunk IDs must use deterministic row-major column,row coordinates',
);
assert(
  chunkCells.length === 720 && chunkCellKeys.size === 720,
  'chunk rendering must cover every semantic cell exactly once',
);
assert(
  chunks.filter(chunk => chunk.bounds.x === 24).length === 3
    && chunks.filter(chunk => chunk.bounds.x === 24).every(chunk => chunk.bounds.width === 6),
  'the final chunk column must clip to the map width',
);

const minimap = deriveMinimapModel(overworld);
const clearingKeys = new Set(overworld.clearings.map(pointKey));
for (const cell of chunkCells) {
  const minimapCell = minimap.cells[cell.at.y][cell.at.x];
  assert(
    cell.terrain === minimapCell.terrain && cell.route === minimapCell.route,
    `world chunks and minimap must agree at ${pointKey(cell.at)}`,
  );
  assert(
    cell.clearing === clearingKeys.has(pointKey(cell.at)),
    `chunk clearing data must derive from semantics at ${pointKey(cell.at)}`,
  );
}
const chunkMarkers = chunkCells.flatMap(cell => (
  cell.landmarkIds.map(id => `${id}@${pointKey(cell.at)}`)
)).sort();
const minimapMarkers = minimap.markers.map(marker => `${marker.id}@${pointKey(marker.at)}`).sort();
assert(
  chunkMarkers.join(',') === minimapMarkers.join(','),
  'world chunks and minimap must derive the same landmark markers',
);
assertThrows(
  () => deriveChunkRenderModels(overworld, 0),
  'chunk rendering must reject a non-positive chunk size',
);

const cameraMovement = advanceMovement(
  bufferDirection(createMovementState({ x: 10, y: 10 }), 'right'),
  0.25,
  () => true,
);
const cameraFocus = movementPosition(cameraMovement.state);
const cameraWindow = deriveCameraWindow(overworld, cameraFocus, { width: 10, height: 8 });
assert(
  cameraWindow.x === 5.25 && cameraWindow.y === 6
    && cameraWindow.width === 10 && cameraWindow.height === 8,
  'camera window must follow fractional render position in cell units',
);
const edgeWindow = deriveCameraWindow(overworld, { x: -100, y: 100 }, { width: 10, height: 8 });
assert(
  edgeWindow.x === 0 && edgeWindow.y === 16,
  'camera window must clamp to the map edges',
);
assertThrows(
  () => deriveCameraWindow(overworld, cameraFocus, { width: 0, height: 8 }),
  'camera window must reject an invalid viewport',
);

const boundaryChunks = cullChunkRenderModels(chunks, { x: 8, y: 0, width: 8, height: 8 });
assert(
  boundaryChunks.length === 1
    && boundaryChunks[0].bounds.x === 8 && boundaryChunks[0].bounds.y === 0,
  'half-open culling must exclude chunks that only touch the camera boundary',
);

const walkability = deriveWalkability(overworld);
const canEnter = (_from: { x: number; y: number }, to: { x: number; y: number }): boolean => (
  isInside(overworld, to) && walkability[to.y][to.x]
);
const routeMove = advanceMovement(
  bufferDirection(createMovementState({ x: 5, y: 20 }), 'right'),
  1,
  canEnter,
);
assert(
  routeMove.committedCells.map(pointKey).join(',') === '6,20',
  'walkability-backed movement must commit a connected route cell',
);

const cardinalNeighbors = [
  { direction: 'up' as const, dx: 0, dy: -1 },
  { direction: 'down' as const, dx: 0, dy: 1 },
  { direction: 'left' as const, dx: -1, dy: 0 },
  { direction: 'right' as const, dx: 1, dy: 0 },
];
const routeCells = overworld.routes.flatMap(route => route.cells);
const forestEdge = routeCells.flatMap(from => cardinalNeighbors.map(neighbor => ({ from, ...neighbor })))
  .find(edge => overworld.terrain[edge.from.y + edge.dy]?.[edge.from.x + edge.dx] === 'forest');
assert(forestEdge, 'seed-42 route must expose a focused blocked-forest edge');
const forestMove = advanceMovement(
  bufferDirection(createMovementState(forestEdge.from), forestEdge.direction),
  1,
  canEnter,
);
assert(
  pointKey(forestMove.state.cell) === pointKey(forestEdge.from)
    && forestMove.committedCells.length === 0,
  'blocked forest must deny movement without a semantic commit',
);
const outOfBoundsMove = advanceMovement(
  bufferDirection(createMovementState({ x: 0, y: 0 }), 'left'),
  1,
  canEnter,
);
assert(
  pointKey(outOfBoundsMove.state.cell) === '0,0' && outOfBoundsMove.committedCells.length === 0,
  'walkability-backed movement must deny an out-of-bounds target',
);

const darkfangEvent = transitionEventAt(overworld, { x: 15, y: 8 });
assert(
  darkfangEvent
    && darkfangEvent.targetMapId === 'mistyGrotto'
    && pointKey(darkfangEvent.arrival) === '50,1'
    && darkfangEvent.floor === 1,
  'Darkfang landmark must resolve its retained mistyGrotto transition event',
);
for (const landmark of overworld.landmarks) {
  const transition = landmark.transition;
  assert(transition, `${landmark.id} must retain a transition payload`);
  const event = transitionEventAt(overworld, landmark.at);
  assert(
    event
      && event.targetMapId === transition.targetMapId
      && pointKey(event.arrival) === pointKey(transition.arrival)
      && event.floor === transition.floor,
    `${landmark.id} terrain threshold must resolve its retained transition without a special marker`,
  );
}
dispatchRetainedMapEvent(darkfangEvent, retained);
assert(
  JSON.stringify(transitions[transitions.length - 1]) === JSON.stringify({
    targetMap: 'mistyGrotto',
    toX: 50,
    toY: 1,
    toFloor: 1,
  }),
  'the landmark event must preserve the retained transition payload',
);
assert(
  transitionEventAt(overworld, { x: 5, y: 20 }) === null,
  'an ordinary route cell must not request a transition',
);
assertThrows(
  () => transitionEventAt(overworld, { x: -1, y: 8 }),
  'transition lookup must reject an invalid semantic cell',
);

assert(
  pointKey(relocateOverworldPosition(overworld, { x: 4, y: 20 }, [
    { x: 5, y: 20 },
    { x: 7, y: 20 },
  ])) === '5,20',
  'save relocation must choose the nearest same-area safe candidate',
);
assert(
  pointKey(relocateOverworldPosition(overworld, { x: 8, y: 14 }, [
    { x: 8, y: 15 },
    { x: 7, y: 14 },
  ])) === '7,14',
  'save relocation ties must use row-major y ordering',
);
assert(
  pointKey(relocateOverworldPosition(overworld, { x: 8, y: 20 }, [
    { x: 9, y: 20 },
    { x: 7, y: 20 },
  ])) === '7,20',
  'save relocation ties on one row must use row-major x ordering',
);
assertThrows(
  () => relocateOverworldPosition(overworld, { x: 8.5, y: 20 }, [{ x: 7, y: 20 }]),
  'save relocation must reject a non-integer saved point',
);
assertThrows(
  () => relocateOverworldPosition(overworld, { x: 8, y: 20 }, []),
  'save relocation must reject an empty same-area candidate set',
);
assertThrows(
  () => relocateOverworldPosition(overworld, { x: 8, y: 20 }, [
    { x: 0, y: 0 },
    { x: 23, y: 4 },
  ]),
  'save relocation must reject a candidate set without a safe semantic cell',
);

assert(
  !shouldUseSelectiveMapEngine('overworld-act1-slice', []),
  'an empty allowlist must keep the selective map engine disabled',
);
const overworldOnly = ['overworld-act1-slice'] as const;
assert(
  shouldUseSelectiveMapEngine('overworld-act1-slice', overworldOnly),
  'an exact allowlisted map ID must enable the selective map engine',
);
assert(
  !shouldUseSelectiveMapEngine('millbrook', overworldOnly)
    && !shouldUseSelectiveMapEngine('mistyGrotto', overworldOnly),
  'sibling town and dungeon maps must remain disabled',
);

const enabledSiblings = ['millbrook', 'mistyGrotto'];
const enabledSnapshot = enabledSiblings.join(',');
assert(
  shouldUseSelectiveMapEngine('millbrook', enabledSiblings)
    && shouldUseSelectiveMapEngine('mistyGrotto', enabledSiblings),
  'each exact sibling ID must be enabled before rollback',
);
const afterFailedMapRemoval = enabledSiblings.filter(mapId => mapId !== 'mistyGrotto');
assert(
  shouldUseSelectiveMapEngine('millbrook', afterFailedMapRemoval)
    && !shouldUseSelectiveMapEngine('mistyGrotto', afterFailedMapRemoval),
  'removing a failed map must disable only that map',
);
assert(enabledSiblings.join(',') === enabledSnapshot, 'feature-flag reads must not mutate the allowlist');
assert(
  !shouldUseSelectiveMapEngine('unknown', overworldOnly)
    && !shouldUseSelectiveMapEngine('Overworld-Act1-Slice', overworldOnly)
    && !shouldUseSelectiveMapEngine('overworld-act1', overworldOnly)
    && !shouldUseSelectiveMapEngine('overworld-act1-slice-extra', overworldOnly),
  'feature-flag matching must reject unknown, case-different, and prefix-related IDs',
);

console.log('MAP ENGINE SHELL TEST PASS: movement, retained census/adapter, re-entry planning, chunks, camera, culling, minimap, save relocation, and feature flags');
