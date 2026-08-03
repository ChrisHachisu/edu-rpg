import {
  deriveMinimapModel,
  deriveReachableLandmarkIds,
  deriveWalkability,
  pointKey,
  semanticMapSnapshot,
  validateSemanticMap,
} from './semanticMap.js';
import {
  ACT1_LANDMARK_IDS,
  ACT1_LANDMARK_RENDER_RECIPES,
} from './act1LandmarkRenderRecipes.js';
import { buildStarterOverworld } from './starterOverworld.js';

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

const first = buildStarterOverworld(42);
const second = buildStarterOverworld(42);
const otherSeed = buildStarterOverworld(43);
const expectedLandmarks = [
  'greenhollow',
  'millbrook',
  'portSapphire',
  'mistyGrotto',
  'crystalCave',
  'sunkenCellar',
  'whisperingWoodsCave',
  'coastalReef',
];
const expectedRoutes = [
  'greenhollow-to-sunken-cellar',
  'greenhollow-to-whispering-woods-cave',
  'greenhollow-to-millbrook',
  'millbrook-to-port-sapphire',
  'port-sapphire-to-coastal-reef',
  'port-sapphire-to-darkfang',
  'port-sapphire-to-crystal-cave',
];
const expectedRouteEnds = [
  ['greenhollow-to-sunken-cellar', '5,20', '2,21'],
  ['greenhollow-to-whispering-woods-cave', '5,20', '7,10'],
  ['greenhollow-to-millbrook', '5,20', '10,16'],
  ['millbrook-to-port-sapphire', '10,16', '19,14'],
  ['port-sapphire-to-coastal-reef', '19,14', '25,19'],
  ['port-sapphire-to-darkfang', '19,14', '16,8'],
  ['port-sapphire-to-crystal-cave', '19,14', '25,4'],
];

assert(semanticMapSnapshot(first) === semanticMapSnapshot(second), 'fixed seed must be deterministic');
assert(semanticMapSnapshot(first) !== semanticMapSnapshot(otherSeed), 'different seeds must affect semantic terrain');
assert(first.id === 'overworld-act1-slice' && first.revision === 3, 'Act 1 topology must use the new map revision');
assert(
  first.landmarks.map(landmark => landmark.id).join(',') === expectedLandmarks.join(','),
  'Act 1 landmarks must preserve the approved guided order and optional branches',
);
assert(
  first.routes.map(route => route.id).join(',') === expectedRoutes.join(','),
  'Act 1 routes must match the approved Braided Pilgrim Trail graph',
);
for (const [routeId, expectedStart, expectedEnd] of expectedRouteEnds) {
  const route = first.routes.find(candidate => candidate.id === routeId);
  assert(route, `missing approved route ${routeId}`);
  assert(
    pointKey(route.cells[0]) === expectedStart
      && pointKey(route.cells[route.cells.length - 1]) === expectedEnd,
    `${routeId} must retain its approved endpoint relationship`,
  );
}

const validation = validateSemanticMap(first);
assert(validation.length === 0, `Act 1 semantic map must validate: ${validation.join('; ')}`);
assert(first.specials.length === 0, 'natural landmark thresholds must not require transition specials');
assert(
  ACT1_LANDMARK_IDS.join(',') === expectedLandmarks.join(','),
  'natural landmark recipes must cover the exact Act 1 landmark catalog',
);
assert(Object.isFrozen(ACT1_LANDMARK_RENDER_RECIPES), 'the natural landmark recipe catalog must be frozen');
for (const landmarkId of ACT1_LANDMARK_IDS) {
  const recipe = ACT1_LANDMARK_RENDER_RECIPES[landmarkId];
  assert(recipe.environment.length > 0 && recipe.assembly.length > 0, `${landmarkId} must have a terrain assembly recipe`);
  assert(Object.isFrozen(recipe), `${landmarkId} terrain assembly recipe must be frozen`);
}

const walkable = deriveWalkability(first);
assert(walkable[20][5], 'Greenhollow route approach must be walkable');
assert(!walkable[0][0], 'water boundary must be blocked');
assert(first.terrain[4][23] === 'mountain' && !walkable[4][23], 'Crystal ridge must remain blocked');
assert(first.terrain[19][23] === 'water' && !walkable[19][23], 'coastal water must remain blocked');

const forest = first.terrain.flatMap((row, y) => row.map((terrain, x) => ({ terrain, x, y })))
  .find(cell => cell.terrain === 'forest');
assert(forest && !walkable[forest.y][forest.x], 'forest must be derived as blocked terrain');

const minimap = deriveMinimapModel(first);
assert(
  minimap.markers.map(marker => marker.id).join(',') === expectedLandmarks.join(','),
  'minimap must derive every approved Act 1 landmark marker',
);
for (const route of first.routes) {
  for (const routeCell of route.cells) {
    assert(
      minimap.cells[routeCell.y][routeCell.x].route,
      `minimap must include every cell from ${route.id}`,
    );
  }
}

assert(first.progressionGates.length === 1, 'Act 1 must contain exactly one semantic progression gate');
assert(
  first.progressionGates[0].id === 'crystal-cave-seal'
    && first.progressionGates[0].requiredFlag === 'boss.giantToad.defeated',
  'Crystal Cave must retain the shipped Giant Toad story gate',
);

const beforeGate = deriveReachableLandmarkIds(first, 'greenhollow', {});
assert(beforeGate.has('greenhollow'), 'the starting landmark must be reachable before the gate opens');
for (const landmarkId of expectedLandmarks.filter(id => id !== 'crystalCave')) {
  assert(beforeGate.has(landmarkId), `${landmarkId} must remain reachable before the Crystal gate opens`);
}
assert(!beforeGate.has('crystalCave'), 'Crystal Cave must be unreachable before the Giant Toad flag');
assert(
  !deriveReachableLandmarkIds(first, 'greenhollow', { 'boss.giantToad.defeated': false }).has('crystalCave'),
  'an explicit false flag must not open Crystal Cave',
);
assert(
  deriveReachableLandmarkIds(first, 'missing-landmark', {}).size === 0,
  'an unknown start landmark must not produce reachable results',
);

const afterGate = deriveReachableLandmarkIds(first, 'greenhollow', {
  'boss.giantToad.defeated': true,
});
assert(afterGate.has('crystalCave'), 'Crystal Cave must be reachable after the exact-true Giant Toad flag');

const inheritedTrueState = Object.create({ 'boss.giantToad.defeated': true }) as Record<string, boolean>;
assert(
  !deriveReachableLandmarkIds(first, 'greenhollow', inheritedTrueState).has('crystalCave'),
  'an inherited true flag must not open Crystal Cave',
);

const invalid = buildStarterOverworld(42);
const blockedRouteCell = invalid.routes[0].cells[1];
invalid.terrain[blockedRouteCell.y][blockedRouteCell.x] = 'forest';
const invalidErrors = validateSemanticMap(invalid);
assert(
  invalidErrors.some(error => error.includes(`blocked terrain at ${pointKey(blockedRouteCell)}`)),
  'validator must reject a route that crosses blocked forest',
);

const blockedLandmark = buildStarterOverworld(42);
const blockedLandmarkAt = blockedLandmark.landmarks[0].at;
blockedLandmark.terrain[blockedLandmarkAt.y][blockedLandmarkAt.x] = 'forest';
assert(
  validateSemanticMap(blockedLandmark).some(error => error.includes('threshold is blocked')),
  'validator must reject a landmark threshold on blocked terrain',
);

const detachedLandmark = buildStarterOverworld(42);
detachedLandmark.landmarks[0].at = { x: 3, y: 20 };
detachedLandmark.terrain[20][3] = 'ground';
assert(
  validateSemanticMap(detachedLandmark).some(error => error.includes('not cardinally adjacent')),
  'validator must reject a landmark threshold detached from its approach',
);

const duplicateLandmarkThreshold = buildStarterOverworld(42);
duplicateLandmarkThreshold.landmarks[1].at = { ...duplicateLandmarkThreshold.landmarks[0].at };
assert(
  validateSemanticMap(duplicateLandmarkThreshold).some(error => error.includes('duplicates landmark threshold')),
  'validator must reject duplicate landmark threshold cells',
);

const fractional = buildStarterOverworld(42);
fractional.routes[0].cells[1] = { x: 5.5, y: 20 };
assert(
  validateSemanticMap(fractional).some(error => error.includes('out of bounds')),
  'validator must reject non-integer semantic cells without throwing',
);

const fractionalDimensions = buildStarterOverworld(42);
fractionalDimensions.width = 20.5;
assert(
  validateSemanticMap(fractionalDimensions).some(error => error.includes('positive integers')),
  'validator must reject non-integer dimensions',
);

const fractionalArrival = buildStarterOverworld(42);
fractionalArrival.landmarks[0].transition!.arrival.x = 8.5;
assert(
  validateSemanticMap(fractionalArrival).some(error => error.includes('transition arrival')),
  'validator must reject non-integer transition arrivals',
);

const irrelevantGate = buildStarterOverworld(42);
irrelevantGate.progressionGates.push({
  id: 'off-path-gate',
  at: { x: 1, y: 1 },
  requiredFlag: 'boss.giantToad.defeated',
});
assert(
  validateSemanticMap(irrelevantGate).some(error => error.includes('is not on a route or clearing')),
  'validator must reject a gate that cannot affect semantic reachability',
);

const emptyGateFlag = buildStarterOverworld(42);
emptyGateFlag.progressionGates[0].requiredFlag = '';
assert(
  validateSemanticMap(emptyGateFlag).some(error => error.includes('required flag is empty')),
  'validator must reject a progression gate without a story flag',
);

const deadEndGate = buildStarterOverworld(42);
deadEndGate.progressionGates.push({
  id: 'dead-end-gate',
  at: { x: 4, y: 20 },
  requiredFlag: 'boss.giantToad.defeated',
});
assert(
  validateSemanticMap(deadEndGate).some(error => error.includes('does not gate any landmark')),
  'validator must reject a gate that does not change landmark reachability',
);

const bypassedGate = buildStarterOverworld(42);
for (const point of [{ x: 24, y: 7 }, { x: 24, y: 6 }]) {
  bypassedGate.terrain[point.y][point.x] = 'ground';
  bypassedGate.clearings.push(point);
}
assert(
  validateSemanticMap(bypassedGate).some(error => error.includes('does not gate any landmark')),
  'validator must reject a gate with a semantic-path bypass',
);

console.log('MAP ENGINE TEST PASS: Act 1 topology, determinism, collision, natural landmark thresholds, progression gates, and minimap derivation');
