export type RetainedLaterGateGuard =
  | { readonly kind: 'truthy-story-key'; readonly storyKey: string }
  | { readonly kind: 'positive-inventory-item'; readonly itemId: string }
  | { readonly kind: 'any'; readonly guards: readonly RetainedLaterGateGuard[] };

export interface RetainedLaterGateEntry {
  readonly traversal: 'act-forward' | 'act-reverse';
  readonly connectionOrdinal: 'first' | 'last';
  readonly requestedFloor?: number;
  readonly effectiveFloor: number;
  readonly floorBehavior: 'default-1' | 'explicit';
  readonly requestedArrivalHalf: 'upper' | 'lower';
}

export interface RetainedLaterGateGuardCheck {
  readonly applies: 'always' | 'requested-floor-above-1';
  readonly guard: RetainedLaterGateGuard;
  readonly blockedMessageKey: string;
}

export interface RetainedLaterGateBehavior {
  readonly mapId: 'shadowCave' | 'magmaTunnels' | 'volcanicForge';
  readonly guardOwner: 'retained.performTransition';
  readonly forwardEntry: RetainedLaterGateEntry;
  readonly reverseEntry: RetainedLaterGateEntry;
  readonly entryGuardChecks: readonly RetainedLaterGateGuardCheck[];
  readonly exitBehavior: {
    readonly floor1EntranceTile: 'first-connection-to-overworld';
    readonly floorAbove1EntranceTile: 'floor-up';
    readonly terminalExitTile: 'last-connection-to-overworld';
  };
  readonly dungeonArrival: {
    readonly requestedPositionOwner: 'retained-connection-payload';
    readonly correctionOwner: 'retained.findDungeonEntrance';
    readonly selection: 'requested-y-half-selects-topmost-or-bottommost-entry-tile';
    readonly fallback: 'theme-center-after-dead-tile6-compatibility-scan';
    readonly exactCorrectedCell: 'runtime-generated-unverified';
  };
}

export interface RetainedLaterGateManifest {
  readonly schemaVersion: 1;
  readonly retainedRoutingId: 'overworld';
  readonly designStatus: 'shipped-compatibility-baseline-owner-unreviewed';
  readonly gates: readonly RetainedLaterGateBehavior[];
  readonly rollback: {
    readonly owner: 'retained.performTransition';
    readonly guardBlock: 'reset-moving-and-return-before-transition-mutation';
    readonly catchBehavior: 'log-error-reset-moving-and-destroy-overlay';
    readonly sceneStateRestore: 'absent';
    readonly selectiveFallbackStatus: 'required-unimplemented';
  };
}

const dungeonExitBehavior = {
  floor1EntranceTile: 'first-connection-to-overworld',
  floorAbove1EntranceTile: 'floor-up',
  terminalExitTile: 'last-connection-to-overworld',
} as const;

const dungeonArrival = {
  requestedPositionOwner: 'retained-connection-payload',
  correctionOwner: 'retained.findDungeonEntrance',
  selection: 'requested-y-half-selects-topmost-or-bottommost-entry-tile',
  fallback: 'theme-center-after-dead-tile6-compatibility-scan',
  exactCorrectedCell: 'runtime-generated-unverified',
} as const;

export const LATER_GATE_RETAINED_BEHAVIOR: RetainedLaterGateManifest = {
  schemaVersion: 1,
  retainedRoutingId: 'overworld',
  designStatus: 'shipped-compatibility-baseline-owner-unreviewed',
  gates: [
    {
      mapId: 'shadowCave',
      guardOwner: 'retained.performTransition',
      forwardEntry: {
        traversal: 'act-forward',
        connectionOrdinal: 'first',
        effectiveFloor: 1,
        floorBehavior: 'default-1',
        requestedArrivalHalf: 'upper',
      },
      reverseEntry: {
        traversal: 'act-reverse',
        connectionOrdinal: 'last',
        requestedFloor: 5,
        effectiveFloor: 5,
        floorBehavior: 'explicit',
        requestedArrivalHalf: 'lower',
      },
      entryGuardChecks: [
        {
          applies: 'always',
          guard: {
            kind: 'any',
            guards: [
              { kind: 'truthy-story-key', storyKey: 'boss.stormHarpy.defeated' },
              { kind: 'truthy-story-key', storyKey: 'boss.dragon.defeated' },
            ],
          },
          blockedMessageKey: 'dungeon.shadowCave.locked',
        },
        {
          applies: 'requested-floor-above-1',
          guard: { kind: 'truthy-story-key', storyKey: 'boss.dragon.defeated' },
          blockedMessageKey: 'dungeon.gateBlocked',
        },
      ],
      exitBehavior: dungeonExitBehavior,
      dungeonArrival,
    },
    {
      mapId: 'magmaTunnels',
      guardOwner: 'retained.performTransition',
      forwardEntry: {
        traversal: 'act-forward',
        connectionOrdinal: 'first',
        effectiveFloor: 1,
        floorBehavior: 'default-1',
        requestedArrivalHalf: 'upper',
      },
      reverseEntry: {
        traversal: 'act-reverse',
        connectionOrdinal: 'last',
        requestedFloor: 5,
        effectiveFloor: 5,
        floorBehavior: 'explicit',
        requestedArrivalHalf: 'upper',
      },
      entryGuardChecks: [
        {
          applies: 'always',
          guard: {
            kind: 'any',
            guards: [
              { kind: 'positive-inventory-item', itemId: 'flameCloak' },
              { kind: 'truthy-story-key', storyKey: 'boss.lavaWyrm.defeated' },
            ],
          },
          blockedMessageKey: 'overworld.magmaBlocked',
        },
        {
          applies: 'requested-floor-above-1',
          guard: { kind: 'truthy-story-key', storyKey: 'boss.lavaWyrm.defeated' },
          blockedMessageKey: 'dungeon.gateBlocked',
        },
      ],
      exitBehavior: dungeonExitBehavior,
      dungeonArrival,
    },
    {
      mapId: 'volcanicForge',
      guardOwner: 'retained.performTransition',
      forwardEntry: {
        traversal: 'act-forward',
        connectionOrdinal: 'first',
        effectiveFloor: 1,
        floorBehavior: 'default-1',
        requestedArrivalHalf: 'upper',
      },
      reverseEntry: {
        traversal: 'act-reverse',
        connectionOrdinal: 'last',
        requestedFloor: 7,
        effectiveFloor: 7,
        floorBehavior: 'explicit',
        requestedArrivalHalf: 'lower',
      },
      entryGuardChecks: [
        {
          applies: 'always',
          guard: {
            kind: 'any',
            guards: [
              { kind: 'truthy-story-key', storyKey: 'boss.sandGolem.defeated' },
              { kind: 'truthy-story-key', storyKey: 'boss.flameTitan.defeated' },
            ],
          },
          blockedMessageKey: 'dungeon.volcanicForge.locked',
        },
        {
          applies: 'requested-floor-above-1',
          guard: { kind: 'truthy-story-key', storyKey: 'boss.flameTitan.defeated' },
          blockedMessageKey: 'dungeon.gateBlocked',
        },
      ],
      exitBehavior: dungeonExitBehavior,
      dungeonArrival,
    },
  ],
  rollback: {
    owner: 'retained.performTransition',
    guardBlock: 'reset-moving-and-return-before-transition-mutation',
    catchBehavior: 'log-error-reset-moving-and-destroy-overlay',
    sceneStateRestore: 'absent',
    selectiveFallbackStatus: 'required-unimplemented',
  },
};

const LOCKED_SHIPPED_CENSUS = JSON.stringify(LATER_GATE_RETAINED_BEHAVIOR);

export function validateRetainedLaterGateBehavior(value: unknown): string[] {
  try {
    return JSON.stringify(value) === LOCKED_SHIPPED_CENSUS
      ? []
      : ['later-gate behavior must match the locked shipped census'];
  } catch {
    return ['later-gate behavior must match the locked shipped census'];
  }
}
