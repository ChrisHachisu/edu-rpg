export type RetainedGuard =
  | { kind: 'none' }
  | { kind: 'truthy-story-key'; storyKey: string }
  | { kind: 'quest-membership'; questId: string; membership: 'active-or-completed' }
  | { kind: 'all'; guards: RetainedGuard[] };

export interface RetainedTransitionBehavior {
  id: string;
  targetMapId: string;
  requestedFloor?: number;
  effectiveFloor: number;
  floorBehavior: 'default-1' | 'explicit';
  guardOwner: 'retained.performTransition';
  guard: RetainedGuard;
  requestedArrivalBehavior?: 'requested';
  retainedDungeonArrivalCorrection?: 'unverified';
}

export interface RetainedBehaviorManifest {
  schemaVersion: 1;
  retainedRoutingId: 'overworld';
  semanticDataId: 'overworld-act1-slice';
  transitions: RetainedTransitionBehavior[];
  eventOwners: {
    tileCenterCommitted: 'retained.onStep';
    interactionRequested: 'retained.interact';
    transitionRequested: 'retained.performTransition';
    encounterResolution: 'retained-runtime';
  };
  save: {
    owner: 'retained-runtime';
    version: 4;
    storageKeys: ['edu-rpg-save', 'edu-rpg-autosave'];
    fields: ['mapId', 'x', 'y', 'floor'];
    mapRevisionProvenance: 'absent';
    preMigrationSnapshot: 'required-unimplemented';
  };
  rollback: {
    selectorRoutingId: 'overworld';
    legacyScene: 'WorldMapScene';
    failureScope: 'this-map-only';
    status: 'required-unimplemented';
  };
  adapterGaps: [
    'encounter-zone',
    'interaction-target',
    'transition-outcome',
    'routing-id-bridge',
    'map-revision-provenance',
    'pre-migration-snapshot',
    'hud-compatibility',
    'retained-scene-state-sync',
    'selective-runtime-router',
  ];
}

const noGuard = (): RetainedGuard => ({ kind: 'none' });
const dungeonArrival = { retainedDungeonArrivalCorrection: 'unverified' as const };

export const ACT1_OVERWORLD_RETAINED_BEHAVIOR: RetainedBehaviorManifest = {
  schemaVersion: 1,
  retainedRoutingId: 'overworld',
  semanticDataId: 'overworld-act1-slice',
  transitions: [
    {
      id: 'overworld-to-greenhollow',
      targetMapId: 'greenhollow',
      effectiveFloor: 1,
      floorBehavior: 'default-1',
      guardOwner: 'retained.performTransition',
      guard: noGuard(),
      requestedArrivalBehavior: 'requested',
    },
    {
      id: 'overworld-to-millbrook',
      targetMapId: 'millbrook',
      effectiveFloor: 1,
      floorBehavior: 'default-1',
      guardOwner: 'retained.performTransition',
      guard: noGuard(),
      requestedArrivalBehavior: 'requested',
    },
    {
      id: 'overworld-to-port-sapphire',
      targetMapId: 'portSapphire',
      effectiveFloor: 1,
      floorBehavior: 'default-1',
      guardOwner: 'retained.performTransition',
      guard: noGuard(),
      requestedArrivalBehavior: 'requested',
    },
    {
      id: 'overworld-to-darkfang',
      targetMapId: 'mistyGrotto',
      effectiveFloor: 1,
      floorBehavior: 'default-1',
      guardOwner: 'retained.performTransition',
      guard: noGuard(),
      ...dungeonArrival,
    },
    {
      id: 'overworld-to-crystal-cave-floor-1',
      targetMapId: 'crystalCave',
      effectiveFloor: 1,
      floorBehavior: 'default-1',
      guardOwner: 'retained.performTransition',
      guard: { kind: 'truthy-story-key', storyKey: 'boss.giantToad.defeated' },
      ...dungeonArrival,
    },
    {
      id: 'overworld-to-crystal-cave-floor-5',
      targetMapId: 'crystalCave',
      requestedFloor: 5,
      effectiveFloor: 5,
      floorBehavior: 'explicit',
      guardOwner: 'retained.performTransition',
      guard: {
        kind: 'all',
        guards: [
          { kind: 'truthy-story-key', storyKey: 'boss.giantToad.defeated' },
          { kind: 'truthy-story-key', storyKey: 'boss.serpent.defeated' },
        ],
      },
      ...dungeonArrival,
    },
    {
      id: 'overworld-to-sunken-cellar',
      targetMapId: 'sunkenCellar',
      effectiveFloor: 1,
      floorBehavior: 'default-1',
      guardOwner: 'retained.performTransition',
      guard: noGuard(),
      ...dungeonArrival,
    },
    {
      id: 'overworld-to-whispering-woods-cave',
      targetMapId: 'whisperingWoodsCave',
      effectiveFloor: 1,
      floorBehavior: 'default-1',
      guardOwner: 'retained.performTransition',
      guard: { kind: 'quest-membership', questId: 'owlsLesson', membership: 'active-or-completed' },
      ...dungeonArrival,
    },
    {
      id: 'overworld-to-coastal-reef',
      targetMapId: 'coastalReef',
      effectiveFloor: 1,
      floorBehavior: 'default-1',
      guardOwner: 'retained.performTransition',
      guard: { kind: 'quest-membership', questId: 'drakeCargo', membership: 'active-or-completed' },
      ...dungeonArrival,
    },
  ],
  eventOwners: {
    tileCenterCommitted: 'retained.onStep',
    interactionRequested: 'retained.interact',
    transitionRequested: 'retained.performTransition',
    encounterResolution: 'retained-runtime',
  },
  save: {
    owner: 'retained-runtime',
    version: 4,
    storageKeys: ['edu-rpg-save', 'edu-rpg-autosave'],
    fields: ['mapId', 'x', 'y', 'floor'],
    mapRevisionProvenance: 'absent',
    preMigrationSnapshot: 'required-unimplemented',
  },
  rollback: {
    selectorRoutingId: 'overworld',
    legacyScene: 'WorldMapScene',
    failureScope: 'this-map-only',
    status: 'required-unimplemented',
  },
  adapterGaps: [
    'encounter-zone',
    'interaction-target',
    'transition-outcome',
    'routing-id-bridge',
    'map-revision-provenance',
    'pre-migration-snapshot',
    'hud-compatibility',
    'retained-scene-state-sync',
    'selective-runtime-router',
  ],
};

const LOCKED_TRANSITION_FACTS = Object.freeze(
  ACT1_OVERWORLD_RETAINED_BEHAVIOR.transitions.map(transitionFact),
);

const FORBIDDEN_KEYS = new Set([
  'arrival',
  'approach',
  'at',
  'cells',
  'clearings',
  'coordinates',
  'corridors',
  'fromX',
  'fromY',
  'height',
  'landmarks',
  'layout',
  'layouts',
  'progressionGates',
  'requiredFlag',
  'rooms',
  'routes',
  'seed',
  'specials',
  'terrain',
  'tiles',
  'toX',
  'toY',
  'topology',
  'width',
  'x',
  'y',
]);

const ROOT_KEYS = new Set([
  'schemaVersion',
  'retainedRoutingId',
  'semanticDataId',
  'transitions',
  'eventOwners',
  'save',
  'rollback',
  'adapterGaps',
]);
const TRANSITION_KEYS = new Set([
  'id',
  'targetMapId',
  'requestedFloor',
  'effectiveFloor',
  'floorBehavior',
  'guardOwner',
  'guard',
  'requestedArrivalBehavior',
  'retainedDungeonArrivalCorrection',
]);
const EVENT_OWNER_KEYS = new Set([
  'tileCenterCommitted',
  'interactionRequested',
  'transitionRequested',
  'encounterResolution',
]);
const SAVE_KEYS = new Set([
  'owner',
  'version',
  'storageKeys',
  'fields',
  'mapRevisionProvenance',
  'preMigrationSnapshot',
]);
const ROLLBACK_KEYS = new Set([
  'selectorRoutingId',
  'legacyScene',
  'failureScope',
  'status',
]);
const TOWN_TARGETS = new Set(['greenhollow', 'millbrook', 'portSapphire']);
const DUNGEON_TARGETS = new Set([
  'mistyGrotto',
  'crystalCave',
  'sunkenCellar',
  'whisperingWoodsCave',
  'coastalReef',
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function findForbiddenKeys(
  value: unknown,
  errors: string[],
  path = 'manifest',
  seen = new WeakSet<object>(),
): void {
  if (typeof value !== 'object' || value === null || seen.has(value)) return;
  seen.add(value);

  for (const [key, child] of Object.entries(value)) {
    const childPath = `${path}.${key}`;
    if (FORBIDDEN_KEYS.has(key)) errors.push(`forbidden key ${key} at ${childPath}`);
    findForbiddenKeys(child, errors, childPath, seen);
  }
}

function validateClosedKeys(
  value: Record<string, unknown>,
  allowed: ReadonlySet<string>,
  path: string,
  errors: string[],
): void {
  for (const key of Object.keys(value)) {
    if (!allowed.has(key)) errors.push(`${path}.${key} is not allowed`);
  }
}

function guardFact(value: unknown): string {
  if (!isRecord(value)) return 'invalid';
  if (value.kind === 'none') return 'none';
  if (value.kind === 'truthy-story-key') return `story:${String(value.storyKey)}`;
  if (value.kind === 'quest-membership') {
    return `quest:${String(value.questId)}:${String(value.membership)}`;
  }
  if (value.kind === 'all' && Array.isArray(value.guards)) {
    return `all(${value.guards.map(guardFact).join('&')})`;
  }
  return `invalid:${String(value.kind)}`;
}

function transitionFact(value: unknown): string {
  if (!isRecord(value)) return 'invalid';
  const requestedFloor = Object.prototype.hasOwnProperty.call(value, 'requestedFloor')
    ? String(value.requestedFloor)
    : 'omitted';
  return [
    value.id,
    value.targetMapId,
    requestedFloor,
    value.effectiveFloor,
    value.floorBehavior,
    value.guardOwner,
    guardFact(value.guard),
    value.requestedArrivalBehavior ?? 'omitted',
    value.retainedDungeonArrivalCorrection ?? 'omitted',
  ].join('|');
}

function validateGuard(value: unknown, path: string, errors: string[]): void {
  if (!isRecord(value)) {
    errors.push(`${path} must be a retained guard`);
    return;
  }

  switch (value.kind) {
    case 'none':
      validateClosedKeys(value, new Set(['kind']), path, errors);
      return;
    case 'truthy-story-key':
      validateClosedKeys(value, new Set(['kind', 'storyKey']), path, errors);
      if (typeof value.storyKey !== 'string' || !value.storyKey.trim()) {
        errors.push(`${path}.storyKey must be nonblank`);
      }
      return;
    case 'quest-membership':
      validateClosedKeys(value, new Set(['kind', 'questId', 'membership']), path, errors);
      if (typeof value.questId !== 'string' || !value.questId.trim()) {
        errors.push(`${path}.questId must be nonblank`);
      }
      if (value.membership !== 'active-or-completed') {
        errors.push(`${path}.membership must be active-or-completed`);
      }
      return;
    case 'all':
      validateClosedKeys(value, new Set(['kind', 'guards']), path, errors);
      if (!Array.isArray(value.guards) || value.guards.length === 0) {
        errors.push(`${path}.guards must be a nonempty array`);
        return;
      }
      value.guards.forEach((guard, index) => validateGuard(guard, `${path}.guards.${index}`, errors));
      return;
    default:
      validateClosedKeys(value, new Set(['kind']), path, errors);
      errors.push(`${path}.kind is invalid`);
  }
}

function validateExactStrings(value: unknown, expected: readonly string[], label: string, errors: string[]): void {
  if (!Array.isArray(value)
    || value.length !== expected.length
    || value.some((entry, index) => entry !== expected[index])) {
    errors.push(`${label} must equal ${expected.join(',')}`);
  }
}

function validateTransition(value: unknown, index: number, errors: string[]): string | undefined {
  const path = `transitions.${index}`;
  if (!isRecord(value)) {
    errors.push(`${path} must be an object`);
    return undefined;
  }
  validateClosedKeys(value, TRANSITION_KEYS, path, errors);

  if (typeof value.id !== 'string' || !value.id.trim()) errors.push(`${path}.id must be nonblank`);
  if (typeof value.targetMapId !== 'string' || !value.targetMapId.trim()) {
    errors.push(`${path}.targetMapId must be nonblank`);
  }
  if (!Number.isInteger(value.effectiveFloor) || Number(value.effectiveFloor) <= 0) {
    errors.push(`${path}.effectiveFloor must be a positive integer`);
  }
  if (value.floorBehavior === 'default-1') {
    if (value.effectiveFloor !== 1) errors.push(`${path}.effectiveFloor must be 1 for default-1`);
    if (Object.prototype.hasOwnProperty.call(value, 'requestedFloor')) {
      errors.push(`${path}.requestedFloor must be omitted for default-1`);
    }
  } else if (value.floorBehavior === 'explicit') {
    if (!Number.isInteger(value.requestedFloor) || Number(value.requestedFloor) <= 0) {
      errors.push(`${path}.requestedFloor must be a positive explicit integer`);
    }
    if (value.requestedFloor !== value.effectiveFloor) {
      errors.push(`${path}.requestedFloor must equal effectiveFloor`);
    }
  } else {
    errors.push(`${path}.floorBehavior is invalid`);
  }
  if (value.guardOwner !== 'retained.performTransition') {
    errors.push(`${path}.guardOwner must be retained.performTransition`);
  }
  validateGuard(value.guard, `${path}.guard`, errors);

  if (Object.prototype.hasOwnProperty.call(value, 'requestedArrivalBehavior')
    && value.requestedArrivalBehavior !== 'requested') {
    errors.push(`${path}.requestedArrivalBehavior must be requested`);
  }
  if (Object.prototype.hasOwnProperty.call(value, 'retainedDungeonArrivalCorrection')
    && value.retainedDungeonArrivalCorrection !== 'unverified') {
    errors.push(`${path}.retainedDungeonArrivalCorrection must be unverified`);
  }
  if (TOWN_TARGETS.has(String(value.targetMapId))) {
    if (value.requestedArrivalBehavior !== 'requested') {
      errors.push(`${path}.requestedArrivalBehavior is required for towns`);
    }
    if (Object.prototype.hasOwnProperty.call(value, 'retainedDungeonArrivalCorrection')) {
      errors.push(`${path}.retainedDungeonArrivalCorrection must be omitted for towns`);
    }
  }
  if (DUNGEON_TARGETS.has(String(value.targetMapId))) {
    if (value.retainedDungeonArrivalCorrection !== 'unverified') {
      errors.push(`${path}.retainedDungeonArrivalCorrection is required for dungeons`);
    }
    if (Object.prototype.hasOwnProperty.call(value, 'requestedArrivalBehavior')) {
      errors.push(`${path}.requestedArrivalBehavior must be omitted for dungeons`);
    }
  }

  return typeof value.id === 'string' ? value.id : undefined;
}

export function validateRetainedBehaviorManifest(value: unknown): string[] {
  const errors: string[] = [];
  findForbiddenKeys(value, errors);

  if (!isRecord(value)) return [...errors, 'manifest must be an object'];
  validateClosedKeys(value, ROOT_KEYS, 'manifest', errors);
  if (value.schemaVersion !== 1) errors.push('schemaVersion must be 1');
  if (value.retainedRoutingId !== 'overworld') errors.push('retainedRoutingId must be overworld');
  if (value.semanticDataId !== 'overworld-act1-slice') {
    errors.push('semanticDataId must be overworld-act1-slice');
  }

  if (!Array.isArray(value.transitions)) {
    errors.push('transitions must be an array');
  } else {
    const ids = new Set<string>();
    if (value.transitions.length === 0) errors.push('transitions must not be empty');
    value.transitions.forEach((transition, index) => {
      const id = validateTransition(transition, index, errors);
      if (!id) return;
      if (ids.has(id)) errors.push(`duplicate transition id ${id}`);
      ids.add(id);
    });
    const facts = value.transitions.map(transitionFact);
    if (facts.length !== LOCKED_TRANSITION_FACTS.length
      || facts.some((fact, index) => fact !== LOCKED_TRANSITION_FACTS[index])) {
      errors.push('transitions must match the locked nine-entry census');
    }
  }

  const expectedEventOwners = {
    tileCenterCommitted: 'retained.onStep',
    interactionRequested: 'retained.interact',
    transitionRequested: 'retained.performTransition',
    encounterResolution: 'retained-runtime',
  } as const;
  if (!isRecord(value.eventOwners)) {
    errors.push('eventOwners must be an object');
  } else {
    validateClosedKeys(value.eventOwners, EVENT_OWNER_KEYS, 'eventOwners', errors);
    for (const [key, expected] of Object.entries(expectedEventOwners)) {
      if (value.eventOwners[key] !== expected) errors.push(`${key} owner must be ${expected}`);
    }
  }

  if (!isRecord(value.save)) {
    errors.push('save must be an object');
  } else {
    validateClosedKeys(value.save, SAVE_KEYS, 'save', errors);
    if (value.save.owner !== 'retained-runtime') errors.push('save owner must be retained-runtime');
    if (value.save.version !== 4) errors.push('save version must be 4');
    validateExactStrings(value.save.storageKeys, ['edu-rpg-save', 'edu-rpg-autosave'], 'save storageKeys', errors);
    validateExactStrings(value.save.fields, ['mapId', 'x', 'y', 'floor'], 'save fields', errors);
    if (value.save.mapRevisionProvenance !== 'absent') {
      errors.push('mapRevisionProvenance must be absent');
    }
    if (value.save.preMigrationSnapshot !== 'required-unimplemented') {
      errors.push('preMigrationSnapshot must be required-unimplemented');
    }
  }

  if (!isRecord(value.rollback)) {
    errors.push('rollback must be an object');
  } else {
    validateClosedKeys(value.rollback, ROLLBACK_KEYS, 'rollback', errors);
    if (value.rollback.selectorRoutingId !== value.retainedRoutingId) {
      errors.push('selectorRoutingId must equal retainedRoutingId');
    }
    if (value.rollback.legacyScene !== 'WorldMapScene') errors.push('legacyScene must be WorldMapScene');
    if (value.rollback.failureScope !== 'this-map-only') errors.push('failureScope must be this-map-only');
    if (value.rollback.status !== 'required-unimplemented') {
      errors.push('rollback status must be required-unimplemented');
    }
  }

  validateExactStrings(value.adapterGaps, [
    'encounter-zone',
    'interaction-target',
    'transition-outcome',
    'routing-id-bridge',
    'map-revision-provenance',
    'pre-migration-snapshot',
    'hud-compatibility',
    'retained-scene-state-sync',
    'selective-runtime-router',
  ], 'adapterGaps', errors);

  return errors;
}
