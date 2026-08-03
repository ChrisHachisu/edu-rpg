import {
  LATER_GATE_RETAINED_BEHAVIOR,
  validateRetainedLaterGateBehavior,
} from './retainedLaterGateBehavior.js';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function mutableClone(value: unknown): any {
  return JSON.parse(JSON.stringify(value));
}

const bundle = readFileSync('dist/assets/index-BhoGQRaA.js', 'utf8');
assert(
  createHash('sha256').update(bundle).digest('hex')
    === 'a56026574b42168985b353e4cee824562716af83f92d03f408df04eac9127381',
  'the later-gate census test must use the preserved bundle',
);
const evidenceNear = (needle: string, radius = 900): string => {
  const index = bundle.indexOf(needle);
  assert(index >= 0, `missing shipped evidence ${needle}`);
  return bundle.slice(index, index + radius);
};
const shadowEvidence = evidenceNear('targetMap: "shadowCave"');
const magmaEvidence = evidenceNear('targetMap: "magmaTunnels"');
const forgeEvidence = evidenceNear('targetMap: "volcanicForge"');
assert(
  /fromY:\s*234[\s\S]*targetMap:\s*"shadowCave"[\s\S]*fromY:\s*198[\s\S]*toFloor:\s*5/.test(shadowEvidence),
  'bundle evidence must retain Shadow first/default and last/floor-5 connections',
);
assert(
  /fromY:\s*93[\s\S]*targetMap:\s*"magmaTunnels"[\s\S]*fromY:\s*81[\s\S]*toFloor:\s*5/.test(magmaEvidence),
  'bundle evidence must retain Magma first/default and last/floor-5 connections',
);
assert(
  /fromX:\s*172[\s\S]*targetMap:\s*"volcanicForge"[\s\S]*fromX:\s*148[\s\S]*toFloor:\s*7/.test(forgeEvidence),
  'bundle evidence must retain Forge first/default and last/floor-7 connections',
);
const guardEvidence = evidenceNear('x.targetMap === "shadowCave"', 2200);
for (const fact of [
  'boss.stormHarpy.defeated', 'boss.dragon.defeated',
  'boss.sandGolem.defeated', 'boss.flameTitan.defeated',
  'flameCloak', 'boss.lavaWyrm.defeated', 'dungeon.gateBlocked',
]) {
  assert(guardEvidence.includes(fact), `bundle guard evidence must contain ${fact}`);
}
assert(
  !guardEvidence.slice(guardEvidence.indexOf('x.targetMap === "magmaTunnels"'),
    guardEvidence.indexOf('x.targetMap === "demonCastle"')).includes('boss.sandGolem.defeated'),
  'shipped Magma guard must not regress to the stale Sand Golem source guard',
);

const behavior = LATER_GATE_RETAINED_BEHAVIOR;
assert(
  behavior.designStatus === 'shipped-compatibility-baseline-owner-unreviewed'
    && behavior.gates.map(gate => gate.mapId).join(',') === 'shadowCave,magmaTunnels,volcanicForge',
  'the census must contain exactly the three shipped later-gate dungeons',
);

const shadow = behavior.gates[0];
assert(
  shadow.forwardEntry.requestedFloor === undefined
    && shadow.forwardEntry.effectiveFloor === 1
    && shadow.forwardEntry.requestedArrivalHalf === 'upper'
    && shadow.reverseEntry.requestedFloor === 5
    && shadow.reverseEntry.effectiveFloor === 5
    && shadow.reverseEntry.requestedArrivalHalf === 'lower',
  'Shadow Cave must retain default floor 1 forward and explicit floor 5 reverse entry',
);
assert(
  JSON.stringify(shadow.entryGuardChecks) === JSON.stringify([
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
  ]),
  'Shadow Cave must retain the Storm Harpy/Dragon compatibility and final-floor guards',
);

const magma = behavior.gates[1];
assert(
  magma.forwardEntry.requestedFloor === undefined
    && magma.forwardEntry.effectiveFloor === 1
    && magma.forwardEntry.requestedArrivalHalf === 'upper'
    && magma.reverseEntry.requestedFloor === 5
    && magma.reverseEntry.effectiveFloor === 5
    && magma.reverseEntry.requestedArrivalHalf === 'upper',
  'Magma Tunnels must retain default floor 1 forward and explicit floor 5 reverse entry',
);
assert(
  JSON.stringify(magma.entryGuardChecks) === JSON.stringify([
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
  ]),
  'Magma Tunnels must retain the shipped Flame Cloak quantity/Lava Wyrm guards',
);

const forge = behavior.gates[2];
assert(
  forge.forwardEntry.requestedFloor === undefined
    && forge.forwardEntry.effectiveFloor === 1
    && forge.forwardEntry.requestedArrivalHalf === 'upper'
    && forge.reverseEntry.requestedFloor === 7
    && forge.reverseEntry.effectiveFloor === 7
    && forge.reverseEntry.requestedArrivalHalf === 'lower',
  'Volcanic Forge must retain default floor 1 forward and explicit floor 7 reverse entry',
);
assert(
  JSON.stringify(forge.entryGuardChecks) === JSON.stringify([
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
  ]),
  'Volcanic Forge must retain the Sand Golem/Flame Titan compatibility and final-floor guards',
);

for (const gate of behavior.gates) {
  assert(
    gate.guardOwner === 'retained.performTransition'
      && gate.forwardEntry.traversal === 'act-forward'
      && gate.forwardEntry.connectionOrdinal === 'first'
      && gate.forwardEntry.floorBehavior === 'default-1'
      && gate.reverseEntry.traversal === 'act-reverse'
      && gate.reverseEntry.connectionOrdinal === 'last'
      && gate.reverseEntry.floorBehavior === 'explicit',
    `${gate.mapId} must preserve first-connection forward and last-connection reverse entry`,
  );
  assert(
    gate.exitBehavior.floor1EntranceTile === 'first-connection-to-overworld'
      && gate.exitBehavior.floorAbove1EntranceTile === 'floor-up'
      && gate.exitBehavior.terminalExitTile === 'last-connection-to-overworld',
    `${gate.mapId} must preserve floor-sensitive entrance and terminal reverse exit behavior`,
  );
  assert(
    gate.dungeonArrival.requestedPositionOwner === 'retained-connection-payload'
      && gate.dungeonArrival.correctionOwner === 'retained.findDungeonEntrance'
      && gate.dungeonArrival.selection === 'requested-y-half-selects-topmost-or-bottommost-entry-tile'
      && gate.dungeonArrival.fallback === 'theme-center-after-dead-tile6-compatibility-scan'
      && gate.dungeonArrival.exactCorrectedCell === 'runtime-generated-unverified',
    `${gate.mapId} must retain arrival correction without inventing a generated cell`,
  );
}

assert(
  behavior.rollback.owner === 'retained.performTransition'
    && behavior.rollback.guardBlock === 'reset-moving-and-return-before-transition-mutation'
    && behavior.rollback.catchBehavior === 'log-error-reset-moving-and-destroy-overlay'
    && behavior.rollback.sceneStateRestore === 'absent'
    && behavior.rollback.selectiveFallbackStatus === 'required-unimplemented',
  'later gates must record shipped non-atomic failure and the unimplemented selective fallback',
);
assert(
  validateRetainedLaterGateBehavior(behavior).length === 0,
  'the locked shipped later-gate census must validate',
);

const staleMagmaGuard = mutableClone(behavior);
staleMagmaGuard.gates[1].entryGuardChecks[0].guard.guards[0] = {
  kind: 'truthy-story-key',
  storyKey: 'boss.sandGolem.defeated',
};
assert(
  validateRetainedLaterGateBehavior(staleMagmaGuard).some(error => error.includes('locked shipped census')),
  'the validator must reject the stale source-only Magma Tunnels guard',
);

const inventedArrival = mutableClone(behavior);
inventedArrival.gates[0].dungeonArrival.exactCorrectedCell = { x: 50, y: 1 };
assert(
  validateRetainedLaterGateBehavior(inventedArrival).some(error => error.includes('locked shipped census')),
  'the validator must reject an invented generated dungeon arrival cell',
);

const missingReverseEntry = mutableClone(behavior);
delete missingReverseEntry.gates[2].reverseEntry;
assert(
  validateRetainedLaterGateBehavior(missingReverseEntry).some(error => error.includes('locked shipped census')),
  'the validator must reject missing reverse traversal',
);

console.log('RETAINED LATER GATE TEST PASS: entry, exit, floor, flags, reverse traversal, arrival, and rollback');
