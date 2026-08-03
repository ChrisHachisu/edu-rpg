import fs from 'node:fs';
import {
  constrainCorridorMovement,
  facingForVector,
  isInsideCorridors,
  projectPolylineProgress,
} from '../design/review/overworld-art-blueprint/act-by-act/act1/runtime-v2/path-corridor.js';

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function samePoint(left, right) {
  return left.x === right.x && left.y === right.y;
}

function distance(from, to) {
  return Math.hypot(to.x - from.x, to.y - from.y);
}

const manifest = JSON.parse(fs.readFileSync(new URL(
  '../design/review/overworld-art-blueprint/act-by-act/act1/runtime-v2/act1-final-art-geometry-r26/runtime/manifest.json',
  import.meta.url,
), 'utf8'));
const constraints = manifest.pathConstraints;
const expectedRoutes = [
  ['greenhollow-to-sunken-cellar', 'greenhollow', 'sunkenCellar', { x: 60, y: 341 }, { x: 45, y: 349 }, 24],
  ['greenhollow-to-whispering-woods-cave', 'greenhollow', 'whisperingWoodsCave', { x: 60, y: 341 }, { x: 80, y: 311 }, 51],
  ['greenhollow-to-millbrook', 'greenhollow', 'millbrook', { x: 60, y: 341 }, { x: 100, y: 321 }, 61],
  ['millbrook-to-port-sapphire', 'millbrook', 'portSapphire', { x: 100, y: 321 }, { x: 130, y: 291 }, 61],
  ['port-sapphire-to-coastal-reef', 'portSapphire', 'coastalReef', { x: 130, y: 291 }, { x: 140, y: 349 }, 75],
  ['port-sapphire-to-darkfang', 'portSapphire', 'mistyGrotto', { x: 130, y: 291 }, { x: 120, y: 261 }, 41],
  ['port-sapphire-to-crystal-cave', 'portSapphire', 'crystalCave', { x: 130, y: 291 }, { x: 148, y: 294 }, 22],
];

assert(manifest.revision === 11 && constraints.revision === 2, 'full-world path revisions must be explicit');
assert(manifest.designLocks.collisionOwner === 'r26-polygon-authority', 'collision must remain R26 geometry-owned');
assert(manifest.designLocks.cameraWorldWidth === 208, 'camera width lock must remain 208 world pixels');
assert(manifest.designLocks.heroWorldHeight === 36, 'hero draw-height lock must remain 36 world pixels');
assert(constraints.movementSpeed === 52, 'movement speed must remain 52 world pixels per second');
assert(constraints.actorFootRadius === 4 && constraints.maxSubstep === 2, 'foot radius and substep locks moved');
assert(JSON.stringify(constraints.corridors.map(route => route.id)) === JSON.stringify(expectedRoutes.map(route => route[0])),
  'seven production route IDs/order changed');

for (const [index, expected] of expectedRoutes.entries()) {
  const [id, fromLandmarkId, toLandmarkId, spineStart, spineEnd, spineLength] = expected;
  const corridor = constraints.corridors[index];
  assert(corridor.id === id, `${id} order changed`);
  assert(corridor.fromLandmarkId === fromLandmarkId && corridor.toLandmarkId === toLandmarkId,
    `${id} landmark ownership changed`);
  assert(corridor.semanticSpineCells.length === spineLength, `${id} semantic spine length changed`);
  assert(samePoint(corridor.semanticSpineCells[0], spineStart), `${id} approach start moved`);
  assert(samePoint(corridor.semanticSpineCells.at(-1), spineEnd), `${id} approach end moved`);
  assert(corridor.semanticCells.length === spineLength + 2, `${id} threshold extensions missing`);
  assert(samePoint(corridor.semanticCells[0], corridor.thresholdExtensions.from), `${id} start threshold mismatch`);
  assert(samePoint(corridor.semanticCells.at(-1), corridor.thresholdExtensions.to), `${id} end threshold mismatch`);
  assert(corridor.commitPoints.length === corridor.semanticCells.length, `${id} commit count mismatch`);
  assert(corridor.semanticCommitPoints.length === corridor.semanticSpineCells.length,
    `${id} production spine commit count mismatch`);
  assert(new Set(corridor.points.map(point => point.halfWidth)).size >= 2, `${id} needs variable width`);
  assert(corridor.points.every(point => point.halfWidth > constraints.actorFootRadius), `${id} pinches the actor footprint`);
  assert(corridor.blockerProbes.map(probe => probe.id).join(',') === 'from-landmark,route-edge,to-landmark',
    `${id} blocker probes incomplete`);

  for (const control of corridor.artControls) {
    const semanticIndex = corridor.semanticCells.findIndex(cell => (
      cell.x === control.cell[0] && cell.y === control.cell[1]
    ));
    assert(semanticIndex >= 0, `${id} art control left its semantic route`);
    assert(samePoint(corridor.commitPoints[semanticIndex], { x: control.art[0], y: control.art[1] }),
      `${id} art control lost its exact commit`);
  }
  for (const point of corridor.points) {
    assert(isInsideCorridors(point, [corridor], constraints.actorFootRadius), `${id} center point is blocked`);
  }
  for (const point of corridor.commitPoints) {
    assert(isInsideCorridors(point, [corridor], constraints.actorFootRadius), `${id} commit point is blocked`);
  }
  for (const probe of corridor.blockerProbes) {
    const requested = { x: probe.direction.x * 200, y: probe.direction.y * 200 };
    const constrained = constrainCorridorMovement(
      probe.start, requested, [corridor], constraints.actorFootRadius, constraints.maxSubstep,
    );
    assert(distance(probe.start, constrained) < 40, `${id}/${probe.id} tunneled through a blocker`);
    assert(isInsideCorridors(constrained, [corridor], constraints.actorFootRadius), `${id}/${probe.id} escaped geometry`);
  }
}

const landmarkAnchors = new Map();
for (const corridor of constraints.corridors) {
  for (const [landmarkId, point] of [
    [corridor.fromLandmarkId, corridor.points[0]],
    [corridor.toLandmarkId, corridor.points.at(-1)],
  ]) {
    if (landmarkAnchors.has(landmarkId)) {
      assert(samePoint(landmarkAnchors.get(landmarkId), point), `${landmarkId} shared route anchor split`);
    } else landmarkAnchors.set(landmarkId, point);
  }
}
assert(landmarkAnchors.size === 8, 'the route graph must retain eight landmark anchors');
for (const zone of constraints.exclusionZones) {
  for (const [x, y] of zone.probes) {
    assert(!isInsideCorridors({ x, y }, constraints.corridors, constraints.actorFootRadius),
      `${zone.id} probe became traversable`);
  }
}

const straight = [{ id: 'straight', points: [
  { x: 0, y: 0, halfWidth: 10 },
  { x: 100, y: 0, halfWidth: 10 },
] }];
const axial = constrainCorridorMovement({ x: 50, y: 0 }, { x: 5, y: 0 }, straight, 4, 2);
const diagonalVector = 5 / Math.sqrt(2);
const diagonal = constrainCorridorMovement(
  { x: 50, y: 0 }, { x: diagonalVector, y: diagonalVector }, straight, 4, 2,
);
assert(Math.abs(distance({ x: 50, y: 0 }, axial) - distance({ x: 50, y: 0 }, diagonal)) < 1e-9,
  'normalized diagonal and axial steering speeds differ');
const slid = constrainCorridorMovement({ x: 50, y: 0 }, { x: 12, y: 12 }, straight, 4, 2);
assert(slid.x > 60 && Math.abs(slid.y - 6) < 1e-6, 'diagonal pressure must slide along a boundary');
const clamped = constrainCorridorMovement({ x: 98, y: 0 }, { x: 20, y: 0 }, straight, 4, 1);
assert(clamped.x <= 106 + 1e-6, 'substeps must prevent tunneling beyond an endpoint capsule');

for (const [vector, fallback, facing] of [
  [{ x: 0, y: 1 }, 'left', 'down'],
  [{ x: -1, y: 0 }, 'down', 'left'],
  [{ x: 0, y: -1 }, 'right', 'up'],
  [{ x: 1, y: 0 }, 'up', 'right'],
  [{ x: 1, y: 1 }, 'down', 'down'],
  [{ x: 1, y: 0.9 }, 'up', 'down'],
  [{ x: 1, y: 0.7 }, 'up', 'right'],
]) assert(facingForVector(vector, fallback) === facing, `stable cardinal facing ${facing} failed`);

const crystal = constraints.corridors.find(corridor => corridor.id === 'port-sapphire-to-crystal-cave');
const gate = constraints.gates.find(candidate => candidate.id === 'crystal-cave-seal');
assert(gate.routeId === crystal.id && gate.semanticCell.join(',') === '148,293', 'Crystal seal ownership moved');
const gateStart = crystal.points[9];
const gateDelta = { x: crystal.points.at(-1).x - gateStart.x, y: crystal.points.at(-1).y - gateStart.y };
const closedGate = constrainCorridorMovement(
  gateStart, gateDelta, [crystal], constraints.actorFootRadius, constraints.maxSubstep, [gate.blocker],
);
const openGate = constrainCorridorMovement(
  gateStart, gateDelta, [crystal], constraints.actorFootRadius, constraints.maxSubstep,
);
assert(distance(closedGate, crystal.points.at(-1)) > distance(openGate, crystal.points.at(-1)) + 40,
  'closed Crystal seal did not geometrically block traversal');

const progressLine = [{ x: 0, y: 0 }, { x: 5, y: 0 }, { x: 10, y: 0 }];
assert(Math.abs(projectPolylineProgress({ x: 7.5, y: 3 }, progressLine) - 1.5) < 1e-9,
  'semantic progress must follow the closest continuous route segment');

console.log('ACT 1 PATH CORRIDOR TEST PASS: seven routes, variable widths, cardinal facing, blockers, seal, sliding, clamp, no tunneling');
