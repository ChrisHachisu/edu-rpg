import fs from 'node:fs';
import {
  constrainWalkableMovement,
  isInsideWalkable,
  validateWalkableGeometry,
} from '../walkable-polygons.js';

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function point(raw) {
  return Array.isArray(raw) ? { x: raw[0], y: raw[1] } : raw;
}

function distance(left, right) {
  return Math.hypot(right.x - left.x, right.y - left.y);
}

function bounds(region) {
  return region.outer.reduce((result, vertex) => ({
    minX: Math.min(result.minX, vertex.x), minY: Math.min(result.minY, vertex.y),
    maxX: Math.max(result.maxX, vertex.x), maxY: Math.max(result.maxY, vertex.y),
  }), { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity });
}

function orientation(a, b, c) {
  return (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
}

function onSegment(value, from, to) {
  const epsilon = 1e-7;
  return Math.abs(orientation(from, to, value)) <= epsilon
    && value.x >= Math.min(from.x, to.x) - epsilon && value.x <= Math.max(from.x, to.x) + epsilon
    && value.y >= Math.min(from.y, to.y) - epsilon && value.y <= Math.max(from.y, to.y) + epsilon;
}

function segmentsIntersect(a, b, c, d) {
  const epsilon = 1e-7;
  const abC = orientation(a, b, c);
  const abD = orientation(a, b, d);
  const cdA = orientation(c, d, a);
  const cdB = orientation(c, d, b);
  if (((abC > epsilon && abD < -epsilon) || (abC < -epsilon && abD > epsilon))
    && ((cdA > epsilon && cdB < -epsilon) || (cdA < -epsilon && cdB > epsilon))) return true;
  return (Math.abs(abC) <= epsilon && onSegment(c, a, b))
    || (Math.abs(abD) <= epsilon && onSegment(d, a, b))
    || (Math.abs(cdA) <= epsilon && onSegment(a, c, d))
    || (Math.abs(cdB) <= epsilon && onSegment(b, c, d));
}

function ringsIntersect(left, right) {
  for (let l = 0; l < left.length; l += 1) {
    for (let r = 0; r < right.length; r += 1) {
      if (segmentsIntersect(left[l], left[(l + 1) % left.length],
        right[r], right[(r + 1) % right.length])) return true;
    }
  }
  return false;
}

const geometry = JSON.parse(fs.readFileSync(new URL('polygon-authority.json', import.meta.url), 'utf8'));
const openGateIds = ['crystal-cave-seal'];
validateWalkableGeometry(geometry);

assert(geometry.schema === 'act1-art-fit-polygon-authority-v2' && geometry.revision === 2,
  'final authority schema/revision changed');
assert(geometry.status === 'design-only-owner-review-not-promoted', 'design pack was promoted');
assert(geometry.width === 2368 && geometry.height === 2912, 'native dimensions changed');
assert(geometry.actorFootRadius === 4 && geometry.maxSubstep === 2, 'movement clearance changed');
assert(geometry.regions.length === 25, 'region inventory changed');

const regions = new Map(geometry.regions.map(region => [region.id, region]));
const componentIds = geometry.components.map(component => component.id);
assert(JSON.stringify(componentIds) === JSON.stringify(['west', 'north', 'southeast']),
  'physical component inventory changed');

let safeJoins = 0;
const seen = new Set();
for (const region of geometry.regions) {
  for (const targetId of region.joins || []) {
    const target = regions.get(targetId);
    assert(target, `${region.id} joins missing ${targetId}`);
    assert(target.component === region.component, `${region.id}/${targetId} crosses components`);
    assert((target.joins || []).includes(region.id), `${region.id}/${targetId} is not reciprocal`);
    const key = [region.id, targetId].sort().join('|');
    if (seen.has(key)) continue;
    seen.add(key);
    const leftBounds = bounds(region);
    const rightBounds = bounds(target);
    const leftData = { ...geometry, regions: [region], dynamicBlockers: [] };
    const rightData = { ...geometry, regions: [target], dynamicBlockers: [] };
    let overlap = false;
    for (let y = Math.ceil(Math.max(leftBounds.minY, rightBounds.minY));
      y <= Math.floor(Math.min(leftBounds.maxY, rightBounds.maxY)) && !overlap; y += 1) {
      for (let x = Math.ceil(Math.max(leftBounds.minX, rightBounds.minX));
        x <= Math.floor(Math.min(leftBounds.maxX, rightBounds.maxX)); x += 1) {
        if (isInsideWalkable({ x, y }, leftData, { actorRadius: 4 })
          && isInsideWalkable({ x, y }, rightData, { actorRadius: 4 })) {
          overlap = true;
          break;
        }
      }
    }
    assert(overlap, `${key} lacks radius-four-safe overlap`);
    safeJoins += 1;
  }
}
assert(safeJoins === 22, `expected 22 safe joins, got ${safeJoins}`);

for (let left = 0; left < geometry.regions.length; left += 1) {
  for (let right = left + 1; right < geometry.regions.length; right += 1) {
    const a = geometry.regions[left];
    const b = geometry.regions[right];
    if (a.component === b.component) continue;
    assert(!ringsIntersect(a.outer, b.outer), `${a.id}/${b.id} merged physical components`);
  }
}

const exactAnchors = {
  greenhollow: [677, 1957], sunkenCellar: [370, 2495], whisperingWoodsCave: [816, 1387],
  millbrook: [1234, 1995], portSapphireWest: [1840, 1665], portSapphireNorth: [1835, 1635],
  portSapphireSoutheast: [2114, 1840], coastalReef: [1877, 2596], mistyGrotto: [1455, 508],
  crystalCave: [2166, 1132],
};
const anchors = new Map(geometry.landmarkAnchors.map(anchor => [anchor.id, point(anchor.point)]));
for (const [id, raw] of Object.entries(exactAnchors)) {
  assert(distance(anchors.get(id), point(raw)) < 1e-9, `${id} moved`);
  assert(isInsideWalkable(point(raw), geometry, { openGateIds }), `${id} is not walkable`);
}

const sunken = regions.get('sunken-entrance-throat');
assert(sunken.width === 11
  && JSON.stringify(sunken.centerline) === JSON.stringify([[411, 2548], [370, 2495]]),
  'Sunken exact throat changed');
assert(!isInsideWalkable({ x: 230, y: 2490 }, geometry, { openGateIds }), 'Sunken west arch opened');
assert(!isInsideWalkable({ x: 280, y: 2440 }, geometry, { openGateIds }), 'Sunken body opened');

const blocker = geometry.dynamicBlockers.find(item => item.id === 'crystal-cave-seal');
assert(JSON.stringify(blocker) === JSON.stringify({
  id: 'crystal-cave-seal',
  from: { x: 2078, y: 1248 }, to: { x: 2102, y: 1272 }, halfWidth: 1.5,
  requiredFlag: 'boss.giantToad.defeated', routeId: 'port-sapphire-to-crystal-cave',
  semanticCell: [148, 293], activation: 'blocked-unless-required-flag-true',
}), 'Crystal dynamic seal changed');

for (const probe of geometry.probes.blocked) {
  assert(!isInsideWalkable(point(probe.point), geometry, { openGateIds }),
    `blocked probe admitted: ${probe.id}`);
}

const expectedRoutes = [
  'greenhollow-to-sunken-cellar', 'greenhollow-to-whispering-woods-cave',
  'greenhollow-to-millbrook', 'millbrook-to-port-sapphire',
  'port-sapphire-to-coastal-reef', 'port-sapphire-to-darkfang',
  'port-sapphire-to-crystal-cave',
];
assert(JSON.stringify(geometry.semanticRoutes.map(route => route.id)) === JSON.stringify(expectedRoutes),
  'seven-route semantic graph changed');

for (const route of geometry.semanticRoutes) {
  const start = route.endpointContract?.from ? point(route.endpointContract.from) : anchors.get(route.from);
  const end = route.endpointContract?.to ? point(route.endpointContract.to) : anchors.get(route.to);
  assert(distance(route.waypoints[0], start) < 1e-9, `${route.id} start moved`);
  assert(distance(route.waypoints.at(-1), end) < 1e-9, `${route.id} end moved`);
  for (const regionId of route.requiredRegions) {
    assert(regions.has(regionId), `${route.id} requires missing region ${regionId}`);
  }
  for (let index = 0; index < route.waypoints.length - 1; index += 1) {
    const from = route.waypoints[index];
    const to = route.waypoints[index + 1];
    const steps = Math.ceil(distance(from, to) / geometry.maxSubstep);
    for (let step = 0; step <= steps; step += 1) {
      const t = step / steps;
      const sample = { x: from.x + (to.x - from.x) * t, y: from.y + (to.y - from.y) * t };
      assert(isInsideWalkable(sample, geometry, { openGateIds }),
        `${route.id} segment ${index} fails at substep ${step}/${steps}`);
    }
  }
  let current = { ...route.waypoints[0] };
  for (const target of route.waypoints.slice(1)) {
    current = constrainWalkableMovement(current,
      { x: target.x - current.x, y: target.y - current.y }, geometry, { openGateIds });
  }
  assert(distance(current, end) < 0.01, `${route.id} cannot traverse to endpoint`);
}

const crystal = geometry.semanticRoutes.find(route => route.id === 'port-sapphire-to-crystal-cave');
function traverseCrystal(open) {
  let current = { ...crystal.waypoints[0] };
  for (const target of crystal.waypoints.slice(1)) {
    current = constrainWalkableMovement(current,
      { x: target.x - current.x, y: target.y - current.y }, geometry,
      { openGateIds: open ? openGateIds : [] });
  }
  return current;
}
assert(distance(traverseCrystal(false), crystal.waypoints.at(-1)) > 50, 'closed Crystal seal leaked');
assert(distance(traverseCrystal(true), crystal.waypoints.at(-1)) < 0.01, 'open Crystal seal failed');

for (const hub of [
  { id: 'greenhollow-hub', center: { x: 677, y: 1957 }, start: { x: 677, y: 1847 }, delta: { x: 36, y: -28 } },
  { id: 'millbrook-hub', center: { x: 1234, y: 1995 }, start: { x: 1234, y: 1923 }, delta: { x: 30, y: -26 } },
  { id: 'north-fork', center: { x: 1900, y: 1280 }, start: { x: 1900, y: 1228 }, delta: { x: 24, y: -22 } },
]) {
  const hubGeometry = { ...geometry, regions: [regions.get(hub.id)], dynamicBlockers: [] };
  for (const delta of [{ x: 20, y: 0 }, { x: -20, y: 0 }, { x: 0, y: 20 }, { x: 0, y: -20 }]) {
    const moved = constrainWalkableMovement(hub.center, delta, hubGeometry);
    assert(distance(moved, { x: hub.center.x + delta.x, y: hub.center.y + delta.y }) < 0.01,
      `${hub.id} blocks representative free exploration`);
  }
  const requested = { x: hub.start.x + hub.delta.x, y: hub.start.y + hub.delta.y };
  assert(!isInsideWalkable(requested, hubGeometry), `${hub.id} slide target remained inside`);
  const slid = constrainWalkableMovement(hub.start, hub.delta, hubGeometry);
  assert(isInsideWalkable(slid, hubGeometry), `${hub.id} tangent slide left the hub`);
  assert(slid.x > hub.start.x + 8, `${hub.id} lost tangent motion`);
}

for (const pair of [['portSapphireWest', 'portSapphireNorth'], ['portSapphireWest', 'portSapphireSoutheast'], ['portSapphireNorth', 'portSapphireSoutheast']]) {
  const components = pair.map(id => geometry.landmarkAnchors.find(anchor => anchor.id === id).component);
  assert(components[0] !== components[1], `${pair.join('/')} merged components`);
}

console.log(`ACT 1 FINAL AUTHORITY PASS: 25 smooth regions, ${safeJoins} radius-safe joins, 7 routes, Coastal mouth 1877,2596`);
