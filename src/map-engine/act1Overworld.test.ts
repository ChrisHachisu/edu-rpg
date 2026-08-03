import {
  ACT1_GREENHOLLOW_MILLBROOK_BRIDGE_DECK,
  ACT1_MILLBROOK_SOUTHEAST_FOREST_BLOCK,
  ACT1_OVERWORLD_HEIGHT,
  ACT1_OVERWORLD_WIDTH,
  ACT1_PORT_REEF_BRIDGE_DECK,
  ACT1_SOURCE_BOUNDS,
  Act1SurfaceClass,
  buildAct1OverworldReconstruction,
  isApprovedAct1WaterOverride,
  isAct1RuntimeSourceWater,
} from './act1Overworld.js';
import {
  Point,
  deriveReachableLandmarkIds,
  deriveWalkability,
  pointKey,
  semanticMapSnapshot,
  validateSemanticMap,
} from './semanticMap.js';
import { transitionEventAt } from './overworldVerticalSlice.js';

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

const first = buildAct1OverworldReconstruction(42);
const second = buildAct1OverworldReconstruction(42);
const map = first.map;

assert(semanticMapSnapshot(map) === semanticMapSnapshot(second.map), 'fixed seed semantic map must be deterministic');
assert(JSON.stringify(first.surfaces) === JSON.stringify(second.surfaces), 'fixed seed surface plan must be deterministic');
assert(map.width === 320 && map.height === 400, 'Act 1 must retain exact global 320x400 dimensions');
assert(ACT1_OVERWORLD_WIDTH === 320 && ACT1_OVERWORLD_HEIGHT === 400, 'exported world dimensions must be exact');
assert(map.terrain.length === 400 && map.terrain.every(row => row.length === 320), 'terrain must align to the full world');
assert(first.surfaces.length === 400 && first.surfaces.every(row => row.length === 320), 'surface plan must align to the full world');
assert(map.specials.length === 0, 'natural landmark entries must not use special portal assets');
assert(map.clearings.length === 0, 'renderer aprons must not create hidden semantic graph edges');

interface ExpectedLandmark {
  at: Point;
  approach: Point;
  targetMapId: string;
  arrival: Point;
  floor?: number;
}

const expectedLandmarks: Record<string, ExpectedLandmark> = {
  greenhollow: {
    at: { x: 60, y: 340 }, approach: { x: 60, y: 341 },
    targetMapId: 'greenhollow', arrival: { x: 8, y: 14 },
  },
  sunkenCellar: {
    at: { x: 45, y: 350 }, approach: { x: 45, y: 349 },
    targetMapId: 'sunkenCellar', arrival: { x: 50, y: 1 }, floor: 1,
  },
  whisperingWoodsCave: {
    at: { x: 80, y: 310 }, approach: { x: 80, y: 311 },
    targetMapId: 'whisperingWoodsCave', arrival: { x: 50, y: 1 }, floor: 1,
  },
  millbrook: {
    at: { x: 100, y: 320 }, approach: { x: 100, y: 321 },
    targetMapId: 'millbrook', arrival: { x: 8, y: 14 },
  },
  portSapphire: {
    at: { x: 130, y: 290 }, approach: { x: 130, y: 291 },
    targetMapId: 'portSapphire', arrival: { x: 8, y: 14 },
  },
  coastalReef: {
    at: { x: 140, y: 350 }, approach: { x: 140, y: 349 },
    targetMapId: 'coastalReef', arrival: { x: 50, y: 1 }, floor: 1,
  },
  mistyGrotto: {
    at: { x: 120, y: 260 }, approach: { x: 120, y: 261 },
    targetMapId: 'mistyGrotto', arrival: { x: 50, y: 1 }, floor: 1,
  },
  crystalCave: {
    at: { x: 148, y: 295 }, approach: { x: 148, y: 294 },
    targetMapId: 'crystalCave', arrival: { x: 50, y: 99 }, floor: 1,
  },
};
assert(map.landmarks.length === Object.keys(expectedLandmarks).length, 'Act 1 must retain exactly eight landmarks');
for (const landmark of map.landmarks) {
  const expected = expectedLandmarks[landmark.id];
  assert(expected, `unexpected landmark ${landmark.id}`);
  assert(pointKey(landmark.at) === pointKey(expected.at), `${landmark.id} threshold moved`);
  assert(pointKey(landmark.approach) === pointKey(expected.approach), `${landmark.id} approach moved`);
  assert(
    Math.abs(landmark.at.x - landmark.approach.x) + Math.abs(landmark.at.y - landmark.approach.y) === 1,
    `${landmark.id} natural threshold must be cardinally adjacent to its approach`,
  );
  assert(map.terrain[landmark.at.y][landmark.at.x] === 'ground', `${landmark.id} threshold must be terrain-integrated ground`);
  assert(map.terrain[landmark.approach.y][landmark.approach.x] === 'ground', `${landmark.id} approach must be ground`);
  assert(landmark.kind === 'town' || landmark.kind === 'dungeon', `${landmark.id} must not use a portal or sign landmark kind`);
  const transition = landmark.transition;
  assert(transition, `${landmark.id} must retain its transition payload`);
  assert(transition.targetMapId === expected.targetMapId, `${landmark.id} transition target changed`);
  assert(pointKey(transition.arrival) === pointKey(expected.arrival), `${landmark.id} transition arrival changed`);
  assert(transition.floor === expected.floor, `${landmark.id} transition floor changed`);
  const event = transitionEventAt(map, landmark.at);
  assert(event, `${landmark.id} natural threshold must resolve a transition event`);
  assert(event.targetMapId === expected.targetMapId, `${landmark.id} transition event target changed`);
  assert(pointKey(event.arrival) === pointKey(expected.arrival), `${landmark.id} transition event arrival changed`);
  assert(event.floor === expected.floor, `${landmark.id} transition event floor changed`);
}
assert(
  transitionEventAt(map, map.routes[0].cells[1]) === null,
  'ordinary route terrain must not resolve a landmark transition',
);

const expectedRoutes: [string, string, string][] = [
  ['greenhollow-to-sunken-cellar', '60,341', '45,349'],
  ['greenhollow-to-whispering-woods-cave', '60,341', '80,311'],
  ['greenhollow-to-millbrook', '60,341', '100,321'],
  ['millbrook-to-port-sapphire', '100,321', '130,291'],
  ['port-sapphire-to-coastal-reef', '130,291', '140,349'],
  ['port-sapphire-to-darkfang', '130,291', '120,261'],
  ['port-sapphire-to-crystal-cave', '130,291', '148,294'],
];
assert(map.routes.length === expectedRoutes.length, 'Act 1 must contain exactly seven semantic edges');
assert(map.routes.map(route => route.id).join(',') === expectedRoutes.map(route => route[0]).join(','), 'route order and IDs must be stable');
for (const [routeId, start, end] of expectedRoutes) {
  const route = map.routes.find(candidate => candidate.id === routeId);
  assert(route, `missing route ${routeId}`);
  assert(pointKey(route.cells[0]) === start && pointKey(route.cells[route.cells.length - 1]) === end, `${routeId} endpoints moved`);
  for (let index = 0; index < route.cells.length; index += 1) {
    const cell = route.cells[index];
    assert(map.terrain[cell.y][cell.x] === 'ground', `${routeId} crosses blocked semantic terrain at ${pointKey(cell)}`);
    assert(first.surfaces[cell.y][cell.x] === 'trail', `${routeId} lacks renderer trail material at ${pointKey(cell)}`);
    const previous = route.cells[index - 1];
    if (previous) {
      assert(Math.abs(previous.x - cell.x) + Math.abs(previous.y - cell.y) === 1, `${routeId} is not cardinally contiguous`);
    }
  }
}
const approvedApproaches = new Set(Object.values(expectedLandmarks).map(({ approach }) => pointKey(approach)));
for (const route of map.routes) {
  assert(approvedApproaches.has(pointKey(route.cells[0])), `${route.id} starts at a purposeless endpoint`);
  assert(approvedApproaches.has(pointKey(route.cells[route.cells.length - 1])), `${route.id} ends at a purposeless endpoint`);
}
const connectedTrail = floodSurface(first.surfaces, map.routes[0].cells[0], 'trail');
assert(
  connectedTrail.size === first.metrics.counts.trail,
  'every renderer trail/apron cell must connect to the approved route graph',
);
assert(!map.routes.some(route => route.id.includes('darkfang-to-crystal')), 'Darkfang-to-Crystal is not an approved edge');
assert(!map.routes.some(route => route.id.includes('whispering-to-darkfang')), 'Whispering-to-Darkfang is not an approved edge');

const greenhollowMillbrook = map.routes.find(route => route.id === 'greenhollow-to-millbrook')!;
for (const deck of ACT1_GREENHOLLOW_MILLBROOK_BRIDGE_DECK) {
  assert(greenhollowMillbrook.cells.some(cell => pointKey(cell) === pointKey(deck)), `Greenhollow-Millbrook route must use west bridge ${pointKey(deck)}`);
}
assert(
  !greenhollowMillbrook.cells.some(cell => (
    cell.x >= ACT1_MILLBROOK_SOUTHEAST_FOREST_BLOCK.minX
    && cell.x <= ACT1_MILLBROOK_SOUTHEAST_FOREST_BLOCK.maxX
    && cell.y >= ACT1_MILLBROOK_SOUTHEAST_FOREST_BLOCK.minY
    && cell.y <= ACT1_MILLBROOK_SOUTHEAST_FOREST_BLOCK.maxY
  )),
  'Greenhollow-Millbrook route must stay west of the southeast forest block',
);
const portReef = map.routes.find(route => route.id === 'port-sapphire-to-coastal-reef')!;
for (const deck of ACT1_PORT_REEF_BRIDGE_DECK) {
  assert(portReef.cells.some(cell => pointKey(cell) === pointKey(deck)), `Port-Reef route must use harbor bridge ${pointKey(deck)}`);
  assert(map.terrain[deck.y][deck.x] === 'ground', 'harbor bridge deck must be walkable ground');
}
for (let y = ACT1_MILLBROOK_SOUTHEAST_FOREST_BLOCK.minY; y <= ACT1_MILLBROOK_SOUTHEAST_FOREST_BLOCK.maxY; y += 1) {
  for (let x = ACT1_MILLBROOK_SOUTHEAST_FOREST_BLOCK.minX; x <= ACT1_MILLBROOK_SOUTHEAST_FOREST_BLOCK.maxX; x += 1) {
    assert(
      first.surfaces[y][x] === 'forest' || first.surfaces[y][x] === 'water',
      `Millbrook southeast shortcut must be blocked at ${x},${y}`,
    );
  }
}

const harborChannel = first.navigableChannels.find(channel => channel.id === 'port-sapphire-harbor-channel')!;
const harborWater = new Set(harborChannel.cells.map(pointKey));
const harborReached = floodKeys(harborWater, { x: 136, y: 299 });
assert(harborReached.has('142,345'), 'Port harbor channel must connect continuously to the open sea outlet');
assert(harborReached.has(pointKey(ACT1_PORT_REEF_BRIDGE_DECK[0])), 'navigable harbor water must pass under the Port-Reef bridge');

const validation = validateSemanticMap(map);
assert(validation.length === 0, `production Act 1 semantic map must validate: ${validation.join('; ')}`);

const [minX, minY, maxX, maxY] = ACT1_SOURCE_BOUNDS;
for (let y = minY; y <= maxY; y += 1) {
  for (let x = minX; x <= maxX; x += 1) {
    const sourceWater = isAct1RuntimeSourceWater({ x, y });
    const changed = (first.surfaces[y][x] === 'water') !== sourceWater;
    assert(!changed || isApprovedAct1WaterOverride({ x, y }), `water override allowlist mismatch at ${x},${y}`);
    if (harborWater.has(`${x},${y}`) && `${x},${y}` !== pointKey(ACT1_PORT_REEF_BRIDGE_DECK[0])) {
      assert(first.surfaces[y][x] === 'water', `harbor/channel cell must render water at ${x},${y}`);
    }
  }
}
assert(first.metrics.sourceWaterPreservedOutsideApprovedOverrides, 'water must remain preserved outside approved harbor and bridge cells');
assert(first.metrics.unapprovedWaterMismatchCells === 0, 'unapproved water mismatch count must be zero');
assert(first.metrics.sourceFootprintMismatchCells === first.metrics.approvedWaterOverrideCells, 'every water-mask change must be owner-approved');
assert(first.metrics.sourceFootprintMismatchCells > 0, 'approved harbor must change the frozen water mask');
assert(first.metrics.sourceLandCells === 15008, 'frozen runtime plate land count changed');
assert(first.metrics.sourceWaterCells === 11928, 'frozen runtime plate water count changed');

const percentages = first.metrics.nonWaterPercentages;
assert(percentages.meadow >= 0.28 && percentages.meadow <= 0.36, 'meadow share must remain in the approved 32% +/-4 band');
assert(percentages.trail >= 0.06 && percentages.trail <= 0.10, 'trail/apron share must remain in the approved 8% +/-2 band');
assert(percentages.forest >= 0.42 && percentages.forest <= 0.52, 'forest share must remain in the approved 47% +/-5 band');
assert(percentages.mountain >= 0.10 && percentages.mountain <= 0.16, 'mountain share must remain in the approved 13% +/-3 band');
assert(closeTo(percentages.meadow, 0.32, 0.0001), 'meadow quota should resolve to 32%');
assert(closeTo(percentages.trail, 0.08, 0.0001), 'trail quota should resolve to 8%');
assert(closeTo(percentages.mountain, 0.13, 0.0001), 'mountain quota should resolve to 13%');

assert(map.progressionGates.length === 1, 'Act 1 must have one explicit semantic gate');
const gate = map.progressionGates[0];
assert(pointKey(gate.at) === '148,293', 'Crystal gate must occupy the final one-cell approach');
assert(gate.requiredFlag === 'boss.giantToad.defeated', 'Crystal gate must use the retained Giant Toad story flag');
const beforeGate = deriveReachableLandmarkIds(map, 'greenhollow', {});
for (const landmarkId of Object.keys(expectedLandmarks).filter(id => id !== 'crystalCave')) {
  assert(beforeGate.has(landmarkId), `${landmarkId} must be semantically reachable before Crystal opens`);
}
assert(!beforeGate.has('crystalCave'), 'Crystal Cave must be semantically gated before the Giant Toad flag');
const afterGate = deriveReachableLandmarkIds(map, 'greenhollow', { 'boss.giantToad.defeated': true });
assert(afterGate.has('crystalCave'), 'Crystal Cave must be semantically reachable after the Giant Toad flag');

const walkable = deriveWalkability(map);
const allGroundKeys = new Set<string>();
for (let y = 0; y < map.height; y += 1) {
  for (let x = 0; x < map.width; x += 1) {
    if (map.terrain[y][x] === 'ground') allGroundKeys.add(`${x},${y}`);
  }
}
const allPhysicallyReached = floodWalkable(walkable, { x: 60, y: 341 });
assert(allGroundKeys.size > map.routes.flatMap(route => route.cells).length, 'ground connectivity test must include exploration country beyond routes');
assert(allPhysicallyReached.size === allGroundKeys.size, 'every meadow, trail, and natural threshold must share one physical component');
const bridgeClosedReached = floodWalkable(walkable, { x: 100, y: 321 }, ACT1_PORT_REEF_BRIDGE_DECK[0]);
assert(bridgeClosedReached.has('130,291'), 'Millbrook must still reach Port when the Reef bridge is removed');
assert(!bridgeClosedReached.has('140,349'), 'the Port-Reef bridge must be the only Millbrook-side land access to Coastal Reef');
const physicallyReached = floodWalkable(walkable, { x: 130, y: 291 }, gate.at);
assert(!physicallyReached.has('148,294'), 'Crystal approach must have no physical ground bypass around its closed gate');
assert(!physicallyReached.has('148,295'), 'Crystal threshold must have no physical ground bypass around its closed gate');
const closedGateIsolates = [...allGroundKeys]
  .filter(key => key !== pointKey(gate.at) && !physicallyReached.has(key))
  .sort();
assert(
  closedGateIsolates.join(',') === '148,294,148,295',
  `closed Crystal gate must isolate only the Crystal-side approach and threshold, got ${closedGateIsolates.join(' ')}`,
);
for (const point of [
  { x: 147, y: 294 },
  { x: 149, y: 294 },
  { x: 147, y: 295 },
  { x: 149, y: 295 },
  { x: 148, y: 296 },
]) {
  assert(!walkable[point.y][point.x], `Crystal shoulder must block local bypass cell ${pointKey(point)}`);
}

const greenhollowOpen = regionalOpenFraction(first.surfaces, { x: 61, y: 337 }, 18);
const millbrookOpen = regionalOpenFraction(first.surfaces, { x: 100, y: 322 }, 15);
const portOpen = regionalOpenFraction(first.surfaces, { x: 129, y: 307 }, 14);
const whisperingOpen = regionalOpenFraction(first.surfaces, { x: 80, y: 310 }, 12);
const darkfangOpen = regionalOpenFraction(first.surfaces, { x: 120, y: 260 }, 12);
assert(greenhollowOpen > millbrookOpen, 'Greenhollow must remain the largest-feeling open basin');
assert(greenhollowOpen > whisperingOpen + 0.15, 'Greenhollow must read materially more open than Whispering Woods');
assert(greenhollowOpen > darkfangOpen + 0.15, 'Greenhollow must read materially more open than Darkfang');
assert((millbrookOpen + portOpen) / 2 > (whisperingOpen + darkfangOpen) / 2 + 0.1, 'settlement country must be more open than enclosed dungeons');

for (const seed of [43, 777]) {
  const alternate = buildAct1OverworldReconstruction(seed);
  const alternateWalkable = deriveWalkability(alternate.map);
  const alternateGround = alternate.map.terrain.flat().filter(terrain => terrain === 'ground').length;
  assert(
    floodWalkable(alternateWalkable, { x: 60, y: 341 }).size === alternateGround,
    `seed ${seed} must keep all semantic ground in one physical component`,
  );
  assert(alternate.metrics.sourceWaterPreservedOutsideApprovedOverrides, `seed ${seed} must preserve water outside approved overrides`);
  assert(alternate.metrics.counts.meadow === first.metrics.counts.meadow, `seed ${seed} must preserve the meadow quota`);
  assert(alternate.metrics.counts.trail === first.metrics.counts.trail, `seed ${seed} must preserve the trail quota`);
  assert(alternate.metrics.counts.forest === first.metrics.counts.forest, `seed ${seed} must preserve the forest quota`);
  assert(alternate.metrics.counts.mountain === first.metrics.counts.mountain, `seed ${seed} must preserve the mountain quota`);
}

console.log(`ACT 1 OVERWORLD TEST PASS: ${first.metrics.sourceLandCells} source-land cells; meadow ${(percentages.meadow * 100).toFixed(2)}%; trail ${(percentages.trail * 100).toFixed(2)}%; forest ${(percentages.forest * 100).toFixed(2)}%; mountain ${(percentages.mountain * 100).toFixed(2)}%`);

function closeTo(actual: number, expected: number, tolerance: number): boolean {
  return Math.abs(actual - expected) <= tolerance;
}

function floodWalkable(walkable: boolean[][], start: Point, blocked?: Point): Set<string> {
  const blockedKey = blocked ? pointKey(blocked) : null;
  const reached = new Set([pointKey(start)]);
  const queue = [start];
  for (let index = 0; index < queue.length; index += 1) {
    const current = queue[index];
    for (const next of [
      { x: current.x + 1, y: current.y },
      { x: current.x - 1, y: current.y },
      { x: current.x, y: current.y + 1 },
      { x: current.x, y: current.y - 1 },
    ]) {
      const key = pointKey(next);
      if (next.x < 0 || next.x >= ACT1_OVERWORLD_WIDTH || next.y < 0 || next.y >= ACT1_OVERWORLD_HEIGHT
        || !walkable[next.y][next.x] || key === blockedKey || reached.has(key)) continue;
      reached.add(key);
      queue.push(next);
    }
  }
  return reached;
}

function floodSurface(
  surfaces: Act1SurfaceClass[][],
  start: Point,
  expectedSurface: Act1SurfaceClass,
): Set<string> {
  const reached = new Set([pointKey(start)]);
  const queue = [start];
  for (let index = 0; index < queue.length; index += 1) {
    const current = queue[index];
    for (const next of [
      { x: current.x + 1, y: current.y },
      { x: current.x - 1, y: current.y },
      { x: current.x, y: current.y + 1 },
      { x: current.x, y: current.y - 1 },
    ]) {
      const key = pointKey(next);
      if (surfaces[next.y]?.[next.x] !== expectedSurface || reached.has(key)) continue;
      reached.add(key);
      queue.push(next);
    }
  }
  return reached;
}

function floodKeys(cells: ReadonlySet<string>, start: Point): Set<string> {
  const reached = new Set<string>();
  const startKey = pointKey(start);
  if (!cells.has(startKey)) return reached;
  reached.add(startKey);
  const queue = [start];
  for (let index = 0; index < queue.length; index += 1) {
    const current = queue[index];
    for (const next of [
      { x: current.x + 1, y: current.y },
      { x: current.x - 1, y: current.y },
      { x: current.x, y: current.y + 1 },
      { x: current.x, y: current.y - 1 },
    ]) {
      const key = pointKey(next);
      if (!cells.has(key) || reached.has(key)) continue;
      reached.add(key);
      queue.push(next);
    }
  }
  return reached;
}

function regionalOpenFraction(surfaces: Act1SurfaceClass[][], center: Point, radius: number): number {
  let open = 0;
  let land = 0;
  for (let y = center.y - radius; y <= center.y + radius; y += 1) {
    for (let x = center.x - radius; x <= center.x + radius; x += 1) {
      if ((x - center.x) ** 2 + (y - center.y) ** 2 > radius ** 2) continue;
      const surface = surfaces[y]?.[x];
      if (!surface || surface === 'water') continue;
      land += 1;
      if (surface === 'meadow' || surface === 'trail') open += 1;
    }
  }
  return land === 0 ? 0 : open / land;
}
