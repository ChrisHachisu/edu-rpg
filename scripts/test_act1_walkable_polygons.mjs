import crypto from 'node:crypto';
import fs from 'node:fs';
import {
  constrainWalkableMovement,
  isInsideWalkable,
  validateWalkableGeometry,
} from '../design/review/overworld-art-blueprint/act-by-act/act1/runtime-v2/walkable-polygons.js';
import { nearestCorridorConstraint } from '../design/review/overworld-art-blueprint/act-by-act/act1/runtime-v2/path-corridor.js';
import {
  projectRoute,
  selectActiveRoute,
  updateForcedAffinity,
} from '../design/review/overworld-art-blueprint/act-by-act/act1/runtime-v2/walkable-route-state.js';

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function sha256(path) {
  return crypto.createHash('sha256').update(fs.readFileSync(path)).digest('hex');
}

function point(raw) {
  return Array.isArray(raw) ? { x: raw[0], y: raw[1] } : raw;
}

function distance(from, to) {
  return Math.hypot(to.x - from.x, to.y - from.y);
}

const rootUrl = new URL('../', import.meta.url);
const runtimeUrl = new URL(
  '../design/review/overworld-art-blueprint/act-by-act/act1/runtime-v2/',
  import.meta.url,
);
const geometryUrl = new URL('walkable-regions-v1.json', runtimeUrl);
const manifestUrl = new URL('manifest.json', runtimeUrl);
const inventoryUrl = new URL(
  'walkable-regions-v1/evidence/collision-reference-inventory.json',
  runtimeUrl,
);
const geometry = JSON.parse(fs.readFileSync(geometryUrl, 'utf8'));
const manifest = JSON.parse(fs.readFileSync(manifestUrl, 'utf8'));
const inventory = JSON.parse(fs.readFileSync(inventoryUrl, 'utf8'));
const openGateIds = ['crystal-cave-seal'];

validateWalkableGeometry(geometry);
assert(geometry.schema === 'act1-walkable-regions-v1' && geometry.revision === 3,
  'walkable geometry schema/revision changed');
assert(geometry.actorFootRadius === 4 && geometry.maxSubstep === 2,
  'foot radius or collision substep changed');
assert(geometry.movement.movementSpeed === 52, 'movement speed changed');
assert(JSON.stringify(geometry.streamingAffinity) === JSON.stringify([{
  regionId: 'millbrook-outer-west-912-v1',
  routeId: 'millbrook-to-port-sapphire',
  drawMaxProgress: 5.4,
  preloadMaxProgress: 5.8,
  reason: "exhaustive preload sampling proved a five-detail overlap beyond this region's visible Millbrook contribution; the cutoff preserves the four-detail ceiling without changing accepted artifact bytes",
}, {
  regionId: 'crystal-approach-south-912-v1',
  routeId: 'millbrook-to-port-sapphire',
  preloadMinProgress: 8,
  drawMinProgress: 9,
  forcePreload: true,
  retainMargin: 256,
  reason: "manual Port departure retains the inbound route while the shared Darkfang-Crystal trunk is still visually indistinguishable; preload and draw the accepted shared-approach detail before branch ownership resolves",
}]), 'reviewed Millbrook-Port streaming affinity changed');
assert(geometry.regions.length === 18, 'expected the reviewed 18-region Act 1 union');
assert(geometry.landmarkAnchors.length === 8, 'expected eight retained landmark anchors');
assert(geometry.semanticRoutes.length === 7, 'expected seven retained semantic routes');
assert(JSON.stringify(geometry.semanticRoutes.map(route => route.id)) === JSON.stringify(
  manifest.pathConstraints.corridors.map(route => route.id),
), 'semantic route IDs/order diverged from manifest revision 10');
assert(manifest.revision === 10 && manifest.pathConstraints.revision === 2,
  'art-only manifest revision or retained path revision changed');
assert(JSON.stringify(geometry.provenance.manifest) === JSON.stringify({
  revision: 10,
  sha256: 'a36eebf18c651ee7749f2bcff7006e0ce5173b34dc2d3010767f0adbde0cef16',
}), 'walkable geometry must remain pinned to the approved landmark-art manifest provenance');
assert(sha256(new URL(geometry.provenance.collisionReference.path, runtimeUrl))
  === geometry.provenance.collisionReference.sha256,
'collision reference byte identity diverged from polygon provenance');
assert(sha256(inventoryUrl) === geometry.provenance.collisionReferenceInventory.sha256,
  'collision inventory byte identity diverged from polygon provenance');
for (const input of inventory.inputs) {
  const inputUrl = new URL(input.path, rootUrl);
  assert(sha256(inputUrl) === input.sha256, `accepted collision-reference input changed: ${input.path}`);
}

for (const probe of geometry.probes.walkable) {
  assert(isInsideWalkable(point(probe.point), geometry, { openGateIds }),
    `walkable probe rejected: ${probe.id}`);
}
for (const probe of geometry.probes.blocked) {
  assert(!isInsideWalkable(point(probe.point), geometry, { openGateIds }),
    `blocked ${probe.expected} probe admitted: ${probe.id}`);
}
for (const probe of geometry.probes.boundary) {
  assert(isInsideWalkable(point(probe.inside), geometry, { openGateIds }),
    `boundary inside probe rejected: ${probe.id}`);
  assert(!isInsideWalkable(point(probe.outside), geometry, { openGateIds }),
    `boundary outside probe admitted: ${probe.id}`);
}
for (const probe of geometry.probes.bridges) {
  for (const field of ['entryA', 'center', 'entryB']) {
    assert(isInsideWalkable(point(probe[field]), geometry, { openGateIds }),
      `bridge ${probe.id} rejected ${field}`);
  }
}

const independentWalkable = [
  [735, 1510], [640, 1600], [595, 1700],
  [625, 1835], [700, 1810], [650, 1760], [850, 1970], [620, 2160],
  [470, 2260], [470, 2440],
  [1010, 1910], [1060, 2000], [1290, 1900], [1380, 1830],
  [1650, 1660], [1840, 1400], [1825, 1500], [1840, 1665], [2114, 1840],
  [795, 1495], [805, 1422], [816, 1387],
  [690, 1810], [710, 1982], [810, 1972], [1050, 1960],
  [1280, 1935], [1360, 1870], [1530, 1735], [1835, 1635], [1870, 1315],
  [1505, 600], [1472, 552], [1455, 508],
  [1920, 1320], [2020, 1295], [2090, 1260], [2166, 1132],
  [2108, 1860], [2067, 1955], [2010, 2110], [1690, 2410],
  [1095, 1960], [1145, 1968], [1195, 1972],
  [1985, 2135], [1920, 2210], [1845, 2280],
  [2068, 1290], [2110, 1230],
];
for (const raw of independentWalkable) {
  assert(isInsideWalkable(point(raw), geometry, { openGateIds }),
    `independent native-art walkable probe rejected: ${raw}`);
}
const independentBlocked = [
  [1195, 1915], [1100, 2035], [1915, 2140], [1995, 2265], [345, 2390],
  [708, 1915],
  [2075, 1228], [2110, 1285],
  [1280, 1500], [1920, 1850], [1900, 2460], [100, 2500],
  [1300, 2150], [1450, 2250], [1550, 2350],
  [1050, 1200], [950, 1250], [1150, 1150], [1350, 1050], [1930, 1100], [2200, 900],
  [650, 1940], [1780, 1625], [1910, 1600], [2050, 1720],
  [1200, 1950], [1240, 1970],
  [1790, 1400], [1885, 1400], [1900, 1400],
  [1770, 1500], [1865, 1500], [1900, 1500],
  [1910, 1550], [1870, 1650], [2000, 1800],
  [2025, 1650], [2090, 1740],
  [1550, 700], [1678, 700], [1712, 1000], [1820, 1000],
  [2215, 1100], [2228, 1145],
  [500, 1900], [520, 2050], [840, 1850], [820, 2050],
];
for (const raw of independentBlocked) {
  assert(!isInsideWalkable(point(raw), geometry, { openGateIds }),
    `independent native-art blocked probe admitted: ${raw}`);
}

function bounds(region) {
  return region.outer.reduce((result, vertex) => ({
    minX: Math.min(result.minX, vertex.x),
    minY: Math.min(result.minY, vertex.y),
    maxX: Math.max(result.maxX, vertex.x),
    maxY: Math.max(result.maxY, vertex.y),
  }), { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity });
}

const byId = new Map(geometry.regions.map(region => [region.id, region]));
const checkedJoins = new Set();
for (const region of geometry.regions) {
  for (const targetId of region.joins || []) {
    const target = byId.get(targetId);
    assert(target, `${region.id} joins missing region ${targetId}`);
    const key = [region.id, targetId].sort().join('|');
    if (checkedJoins.has(key)) continue;
    checkedJoins.add(key);
    assert((target.joins || []).includes(region.id), `join is not reciprocal: ${key}`);
    const left = bounds(region), right = bounds(target);
    const leftData = { ...geometry, regions: [region], dynamicBlockers: [] };
    const rightData = { ...geometry, regions: [target], dynamicBlockers: [] };
    let overlap = false;
    for (let y = Math.ceil(Math.max(left.minY, right.minY));
      y <= Math.floor(Math.min(left.maxY, right.maxY)) && !overlap; y += 1) {
      for (let x = Math.ceil(Math.max(left.minX, right.minX));
        x <= Math.floor(Math.min(left.maxX, right.maxX)); x += 1) {
        if (isInsideWalkable({ x, y }, leftData) && isInsideWalkable({ x, y }, rightData)) {
          overlap = true;
          break;
        }
      }
    }
    assert(overlap, `joined regions lack shared eight-pixel-diameter actor clearance: ${key}`);
  }
}
assert(checkedJoins.size === geometry.regions.length - 2,
  'walkable-region join graph must retain two disconnected Port entrance components');

const anchorsById = new Map(geometry.landmarkAnchors.map(anchor => [anchor.id, point(anchor.point)]));
for (const route of geometry.semanticRoutes) {
  assert(Array.isArray(route.waypoints) && route.waypoints.length >= 2,
    `${route.id} needs painted-ground navigation waypoints`);
  const expectedStart = route.endpointContract?.from
    ? point(route.endpointContract.from)
    : anchorsById.get(route.from);
  const expectedEnd = route.endpointContract?.to
    ? point(route.endpointContract.to)
    : anchorsById.get(route.to);
  assert(expectedStart && expectedEnd, `${route.id} references an unknown landmark anchor`);
  assert(distance(route.waypoints[0], expectedStart) < 1e-9,
    `${route.id} navigation start moved from its retained anchor or exterior entrance`);
  assert(distance(route.waypoints.at(-1), expectedEnd) < 1e-9,
    `${route.id} navigation end moved from its retained anchor or exterior entrance`);
  for (const [index, waypoint] of route.waypoints.entries()) {
    assert(isInsideWalkable(waypoint, geometry, { openGateIds }),
      `${route.id} navigation waypoint ${index} left painted walkable ground`);
  }
  let currentWaypoint = { ...route.waypoints[0] };
  for (const target of route.waypoints.slice(1)) {
    currentWaypoint = constrainWalkableMovement(
      currentWaypoint,
      { x: target.x - currentWaypoint.x, y: target.y - currentWaypoint.y },
      geometry,
      { openGateIds },
    );
  }
  assert(distance(currentWaypoint, expectedEnd) < 0.01,
    `${route.id} painted-ground waypoint traversal did not reach its endpoint`);
}

const gateWaypoints = [
  { x: 2040, y: 1290 },
  { x: 2080, y: 1265 },
  { x: 2110, y: 1235 },
  { x: 2140, y: 1190 },
  { x: 2166, y: 1132 },
];
function followWaypoints(open) {
  let current = gateWaypoints[0];
  for (const target of gateWaypoints.slice(1)) {
    current = constrainWalkableMovement(
      current,
      { x: target.x - current.x, y: target.y - current.y },
      geometry,
      { openGateIds: open ? openGateIds : [] },
    );
  }
  return current;
}
const closedGateResult = followWaypoints(false);
const openGateResult = followWaypoints(true);
assert(distance(closedGateResult, gateWaypoints.at(-1)) > 100,
  'closed Crystal seal allowed traversal');
assert(distance(openGateResult, gateWaypoints.at(-1)) < 0.01,
  'open Crystal seal did not restore exact cave reachability');

const openField = {
  width: 120,
  height: 120,
  actorFootRadius: 4,
  maxSubstep: 2,
  regions: [{
    id: 'field', role: 'open',
    outer: [{ x: 10, y: 10 }, { x: 110, y: 10 }, { x: 110, y: 110 }, { x: 10, y: 110 }],
    holes: [[{ x: 45, y: 45 }, { x: 75, y: 45 }, { x: 75, y: 75 }, { x: 45, y: 75 }]],
  }],
  dynamicBlockers: [],
};
validateWalkableGeometry(openField);
const axial = constrainWalkableMovement({ x: 30, y: 30 }, { x: 10, y: 0 }, openField);
const diagonalComponent = 10 / Math.sqrt(2);
const diagonal = constrainWalkableMovement(
  { x: 30, y: 30 },
  { x: diagonalComponent, y: diagonalComponent },
  openField,
);
assert(Math.abs(distance({ x: 30, y: 30 }, axial) - distance({ x: 30, y: 30 }, diagonal)) < 1e-9,
  'normalized diagonal speed differs from axial speed');
assert(!isInsideWalkable({ x: 60, y: 60 }, openField), 'static hole became walkable');
const slid = constrainWalkableMovement({ x: 20, y: 20 }, { x: -20, y: 30 }, openField);
assert(slid.x >= 14 - 1e-5 && slid.y > 45 && isInsideWalkable(slid, openField),
  'diagonal boundary pressure did not slide naturally');

const overlappingWithObstacle = {
  width: 120,
  height: 120,
  actorFootRadius: 4,
  maxSubstep: 2,
  regions: [
    {
      id: 'left-field', role: 'open',
      outer: [{ x: 10, y: 10 }, { x: 80, y: 10 }, { x: 80, y: 110 }, { x: 10, y: 110 }],
      holes: [],
    },
    {
      id: 'right-field', role: 'open',
      outer: [{ x: 40, y: 10 }, { x: 110, y: 10 }, { x: 110, y: 110 }, { x: 40, y: 110 }],
      holes: [],
    },
  ],
  staticObstacles: [{
    id: 'overlap-building', kind: 'structure',
    polygon: [{ x: 50, y: 45 }, { x: 70, y: 45 }, { x: 70, y: 75 }, { x: 50, y: 75 }],
  }],
  dynamicBlockers: [],
};
validateWalkableGeometry(overlappingWithObstacle);
assert(!isInsideWalkable({ x: 60, y: 60 }, overlappingWithObstacle),
  'overlapping walkable regions re-admitted a global static obstacle');
assert(isInsideWalkable({ x: 40, y: 60 }, overlappingWithObstacle),
  'global static obstacle blocked unrelated open ground');

const routes = [
  { id: 'east', points: [{ x: 0, y: 0 }, { x: 100, y: 0 }] },
  { id: 'south', points: [{ x: 0, y: 0 }, { x: 0, y: 100 }] },
];
assert(selectActiveRoute({ x: 0, y: 0 }, { x: 0, y: 0 }, routes, 'east').routeId === 'east',
  'idle junction route ownership flickered');
assert(selectActiveRoute({ x: 0, y: 3 }, { x: 0, y: 1 }, routes, 'east').routeId === 'south',
  'directional junction route did not switch');
const routeProjection = projectRoute({ x: 25, y: 4 }, routes[0]);
assert(routeProjection.progress === 0.25 && routeProjection.distance2 === 16,
  'continuous semantic route projection changed');

const paintedSelectionRoutes = geometry.semanticRoutes.map(route => ({
  id: route.id,
  points: route.waypoints,
}));
for (const route of paintedSelectionRoutes) {
  for (let index = 1; index < route.points.length; index += 1) {
    const from = route.points[index - 1], to = route.points[index];
    const dx = to.x - from.x, dy = to.y - from.y;
    const segmentLength = Math.hypot(dx, dy);
    const steps = Math.ceil(segmentLength / geometry.maxSubstep);
    for (let step = 0; step <= steps; step += 1) {
      const t = step / steps;
      const position = { x: from.x + dx * t, y: from.y + dy * t };
      const selected = selectActiveRoute(
        position,
        { x: dx, y: dy },
        paintedSelectionRoutes,
        route.id,
      );
      assert(selected.routeId === route.id,
        `${route.id} semantic ownership switched on its painted route at ${position.x},${position.y}`);
    }
  }
}

const crystalPaintedRoute = paintedSelectionRoutes.find(
  route => route.id === 'port-sapphire-to-crystal-cave',
);
let branchOwner = 'millbrook-to-port-sapphire';
const branchHistory = [];
for (let index = 1; index < crystalPaintedRoute.points.length; index += 1) {
  const from = crystalPaintedRoute.points[index - 1], to = crystalPaintedRoute.points[index];
  const dx = to.x - from.x, dy = to.y - from.y;
  const steps = Math.ceil(Math.hypot(dx, dy) / geometry.maxSubstep);
  for (let step = 0; step <= steps; step += 1) {
    const t = step / steps;
    const selected = selectActiveRoute(
      { x: from.x + dx * t, y: from.y + dy * t },
      { x: dx, y: dy },
      paintedSelectionRoutes,
      branchOwner,
    );
    branchOwner = selected.routeId;
    branchHistory.push(branchOwner);
  }
}
assert(!branchHistory.includes('port-sapphire-to-darkfang'),
  'ambiguous shared Port trunk transiently selected the wrong Darkfang branch');
assert(branchOwner === 'port-sapphire-to-crystal-cave',
  'painted Crystal fork never resolved from inbound Millbrook ownership');

const forcedAffinityState = new Set();
const forcedAffinity = geometry.streamingAffinity.find(affinity => affinity.forcePreload);
const forcedAffinityKey = `${forcedAffinity.routeId}\u0000${forcedAffinity.regionId}`;
assert(updateForcedAffinity(forcedAffinityState, forcedAffinityKey, 8.2, forcedAffinity, false),
  'forced affinity did not trigger on the outbound Millbrook route');
assert(updateForcedAffinity(forcedAffinityState, forcedAffinityKey, 7.4, forcedAffinity, true),
  'forced affinity did not remain resident on the nearby shared Port trunk');
assert(!updateForcedAffinity(forcedAffinityState, forcedAffinityKey, 2.145, forcedAffinity, false),
  'forced affinity survived a reverse trip away from the Port retain area');
assert(!forcedAffinityState.has(forcedAffinityKey),
  'reversed forced affinity remained latched after leaving its retain area');

const corridorRejectedFreeRoam = independentWalkable.filter(raw => (
  nearestCorridorConstraint(point(raw), manifest.pathConstraints.corridors,
    manifest.pathConstraints.actorFootRadius).signedDistance > 2
));
assert(corridorRejectedFreeRoam.length >= 8,
  'independent probes no longer demonstrate meaningful freedom beyond legacy corridors');

let seed = 0x912512;
const random = () => {
  seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
  return seed / 0x100000000;
};
let current = point(geometry.probes.walkable[0].point);
for (let index = 0; index < 5000; index += 1) {
  const angle = random() * Math.PI * 2;
  const length = random() * 8;
  const next = constrainWalkableMovement(
    current,
    { x: Math.cos(angle) * length, y: Math.sin(angle) * length },
    geometry,
    { openGateIds },
  );
  assert(isInsideWalkable(next, geometry, { openGateIds }),
    `deterministic movement invariant escaped at sample ${index}`);
  current = next;
}

console.log(
  `ACT 1 WALKABLE POLYGON TEST PASS: ${geometry.regions.length} regions, `
  + `${checkedJoins.size} disk-safe joins, ${geometry.probes.walkable.length + independentWalkable.length} `
  + `walkable probes, ${geometry.probes.blocked.length + independentBlocked.length} blocked probes, `
  + `seven painted-ground routes, two bridges, Crystal gate, sliding, normalized speed, `
  + `dynamic route state, 5000-step invariant`,
);
