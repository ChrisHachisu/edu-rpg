#!/usr/bin/env node
//
// Behavioural test for the GENERATED Act-1 override, run against a stub scene that mimics the
// shipped bundle: the same canMove() blocked set, the same checkTransition() contract (called with
// the DESTINATION cell, matched to the nearest frozen connection within Manhattan 3), and the same
// frozen connection table. Everything asserted here is asserted about the artefact the game loads,
// not about the generator that wrote it.
//
// The layout under test is the OWNER'S: every coordinate in OWNER_DOORS comes from
// owner-terrain.json acts.1.landmarks, not from the bundle's table.

import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const assert = (condition, message) => { if (!condition) throw new Error(message); };
const source = readFileSync(new URL('../public/act1-world-map.js', import.meta.url), 'utf8');
const window = { __GAME_STATE__: { player: { state: { storyFlags: {} } } } };
vm.runInNewContext(source, { window, Error, Math, parseInt, Object, JSON });
const runtime = window.__ACT1_WORLD_MAP__;
assert(runtime?.revision === 6, 'runtime override revision must be 6');

// The owner's placement. If owner-terrain.json moves, this is what has to move with it.
const OWNER_DOORS = {
  greenhollow: { x: 69, y: 255, tile: 6 },
  millbrook: { x: 39, y: 344, tile: 6 },
  portSapphire: { x: 133, y: 349, tile: 6 },
  sunkenCellar: { x: 30, y: 274, tile: 7 },
  whisperingWoodsCave: { x: 101, y: 231, tile: 7 },
  coastalReef: { x: 144, y: 372, tile: 7 },
  mistyGrotto: { x: 91, y: 378, tile: 7 },
  crystalCave: { x: 149, y: 278, tile: 15 },
};
// The generated layout the bundle is still frozen at, and which the override has to supersede.
const SHIPPED_DOORS = {
  greenhollow: { x: 60, y: 340, toX: 8, toY: 14, backX: 60, backY: 341 },
  millbrook: { x: 100, y: 320, toX: 8, toY: 14, backX: 100, backY: 321 },
  portSapphire: { x: 130, y: 290, toX: 8, toY: 14, backX: 130, backY: 291 },
  sunkenCellar: { x: 45, y: 350, toX: 50, toY: 1, backX: 45, backY: 351 },
  whisperingWoodsCave: { x: 80, y: 310, toX: 50, toY: 1, backX: 80, backY: 311 },
  coastalReef: { x: 140, y: 350, toX: 50, toY: 1, backX: 140, backY: 351 },
  mistyGrotto: { x: 120, y: 260, toX: 50, toY: 1, backX: 120, backY: 261 },
  crystalCave: { x: 148, y: 295, toX: 50, toY: 99, backX: 148, backY: 296 },
};

// ---------------------------------------------------------------------------------------------
// A stand-in for the shipped WorldMapScene, faithful on the contracts that matter here.

const OVERWORLD_BLOCKED = new Set([2, 4, 6, 7, 8, 9, 10, 11, 12, 14, 15, 16, 19, 20, 21]);
const TRIGGERS = new Set([6, 7, 8, 9, 10, 12, 15, 16, 19]);
const CONNECTIONS = Object.entries(SHIPPED_DOORS).map(([mapId, c]) => ({
  targetMap: mapId, fromX: c.x, fromY: c.y, toX: c.toX, toY: c.toY,
}));

function blankMap(fill = 0) {
  return Array.from({ length: 400 }, () => Array.from({ length: 320 }, () => fill));
}

function makeScene(mapData, heroTileX = 69, heroTileY = 256) {
  return {
    currentMapId: 'overworld',
    mapData,
    tileGrid: [[{ displayWidth: 48 }]],
    heroTileX,
    heroTileY,
    hero: { x: 0, y: 0 },
    transitionCooldown: 0,
    compassTarget: null,
    canMove(x, y) {
      const tile = this.mapData[y]?.[x];
      return tile !== undefined && !OVERWORLD_BLOCKED.has(tile);
    },
    // Mirrors the bundle: an overworld door fires on the tile code, then matches the NEAREST
    // frozen connection and only accepts it within Manhattan 3. Inside a destination map, the
    // way back is that map's own single connection.
    checkTransition(x, y) {
      if (this.transitionCooldown > 0) { this.transitionCooldown -= 1; return null; }
      if (this.currentMapId === 'overworld') {
        const tile = this.mapData[y]?.[x];
        if (tile === undefined || !TRIGGERS.has(tile)) return null;
        let best = null;
        let bestD = Infinity;
        for (const connection of CONNECTIONS) {
          const d = Math.abs(connection.fromX - x) + Math.abs(connection.fromY - y);
          if (d < bestD) { bestD = d; best = connection; }
        }
        return best && bestD <= 3 ? { targetMap: best.targetMap, toX: best.toX, toY: best.toY } : null;
      }
      const back = SHIPPED_DOORS[this.currentMapId];
      return back ? { targetMap: 'overworld', toX: back.backX, toY: back.backY } : null;
    },
    getCompassTarget() { return this.compassTarget; },
    updatePositionCalls: 0,
    updateCameraCalls: 0,
    minimapCalls: 0,
    updatePosition() { this.updatePositionCalls += 1; },
    updateCamera() { this.updateCameraCalls += 1; },
    renderMinimap() { this.minimapCalls += 1; },
  };
}

// Hand the override a scene the way the real host does, so armWrappers() finds it.
function present(scene) {
  window.__PHASER_GAME__ = { scene: { getScene: name => (name === 'WorldMapScene' ? scene : null) } };
  runtime.armWrappers();
  delete window.__PHASER_GAME__;
  return scene;
}

// ---------------------------------------------------------------------------------------------
// The plate

const map = blankMap();
map[100][200] = 3;
const scene = makeScene(map);
assert(runtime.apply(scene), 'first Act 1 apply must mutate the overworld plate');
assert(!runtime.apply(scene), 'second Act 1 apply on the same map must be idempotent');
present(scene);
assert(map[100][200] === 3, 'outside-Act-1 cells must remain byte-identical');
assert(scene.canMove(200, 100), 'legacy forest outside Act 1 must retain its original movement behavior');

const [minX, minY, maxX, maxY] = runtime.bounds;
const insideAct1 = (x, y) => x >= minX && x <= maxX && y >= minY && y <= maxY;
// The override blocks forest on top of the base game's set, so "walkable" here is what the player
// can actually stand on.
const walkable = (x, y) => map[y][x] !== 3 && !OVERWORLD_BLOCKED.has(map[y][x]);

// The doors stand where the owner put them, carry a trigger tile, and block.
assert(runtime.landmarks.length === Object.keys(OWNER_DOORS).length,
  `override must carry ${Object.keys(OWNER_DOORS).length} landmarks, has ${runtime.landmarks.length}`);
for (const [mapId, door] of Object.entries(OWNER_DOORS)) {
  assert(map[door.y][door.x] === door.tile,
    `${mapId} door must be tile ${door.tile} at ${door.x},${door.y}, found ${map[door.y][door.x]}`);
  assert(!scene.canMove(door.x, door.y), `${mapId} door must block movement`);
}
// ...and the generated layout's doors are gone, so the bundle's own matcher can never fire there.
for (const [mapId, old] of Object.entries(SHIPPED_DOORS)) {
  assert(map[old.y][old.x] < 5,
    `stale ${mapId} door still stamped at ${old.x},${old.y} (tile ${map[old.y][old.x]})`);
}

// Forest and water both land, and both block. A plate that lost the paint would trip this.
let forestCells = 0;
let waterCells = 0;
let roadCells = 0;
let bridgeCells = 0;
let walkableTotal = 0;
for (let y = minY; y <= maxY; y += 1) {
  for (let x = minX; x <= maxX; x += 1) {
    const tile = map[y][x];
    if (tile === 3) { forestCells += 1; assert(!scene.canMove(x, y), `forest walkable at ${x},${y}`); }
    if (tile === 2) { waterCells += 1; assert(!scene.canMove(x, y), `water walkable at ${x},${y}`); }
    if (tile === 1) roadCells += 1;
    if (tile === 5) bridgeCells += 1;
    if (walkable(x, y)) walkableTotal += 1;
  }
}
assert(forestCells > 0 && waterCells > 0, 'plate has no forest or no water -- the paint did not land');
assert(walkableTotal > 0, 'the Act 1 plate has no walkable cell at all');

// Act 1 is roadless by design (roadless base 2026-07-19, ADR-0069) and the owner painted no
// rivers, so there is nothing to bridge either.
assert(roadCells === 0, `Act 1 must be roadless, found ${roadCells} road cells`);
assert(bridgeCells === 0, `the owner's paint has no rivers, found ${bridgeCells} bridge cells`);
assert(runtime.bridgeDecks.length === 0, 'BRIDGE_DECKS must be empty');
assert(runtime.forestBlock === null, 'FOREST_BLOCK must be null -- the old-growth block is gone');

// One walkable region, every door on it. Written so that an empty flood fails rather than passes.
const start = runtime.landmarks[0].exit;
assert(walkable(start.x, start.y), 'the first landmark exit is not walkable');
const seen = new Set([`${start.x},${start.y}`]);
const stack = [start.x, start.y];
while (stack.length) {
  const y = stack.pop();
  const x = stack.pop();
  for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
    const nx = x + dx;
    const ny = y + dy;
    if (!insideAct1(nx, ny) || seen.has(`${nx},${ny}`) || !walkable(nx, ny)) continue;
    seen.add(`${nx},${ny}`);
    stack.push(nx, ny);
  }
}
assert(seen.size > 0, 'walkable flood is EMPTY');
assert(seen.size === walkableTotal, `walkable area is split: ${seen.size} of ${walkableTotal}`);
const stranded = runtime.landmarks
  .filter(landmark => !seen.has(`${landmark.exit.x},${landmark.exit.y}`))
  .map(landmark => landmark.mapId);
assert(stranded.length === 0, `landmarks unreachable from ${runtime.landmarks[0].mapId}: ${stranded}`);

// No walkable cell on the boundary: nothing new leaks into the neighbouring acts.
const leaks = [];
for (let x = minX; x <= maxX; x += 1) {
  if (walkable(x, minY)) leaks.push(`${x},${minY}`);
  if (walkable(x, maxY)) leaks.push(`${x},${maxY}`);
}
for (let y = minY; y <= maxY; y += 1) {
  if (walkable(minX, y)) leaks.push(`${minX},${y}`);
  if (walkable(maxX, y)) leaks.push(`${maxX},${y}`);
}
assert(leaks.length === 0, `Act 1 boundary is walkable at ${leaks.join(' ')}`);

// ---------------------------------------------------------------------------------------------
// Transitions -- the piece without which the plate alone would brick three destinations

assert(scene.__act1TransitionWrapped, 'checkTransition must be wrapped');

// Every owner door fires and lands the hero where the bundle expects inside that map.
for (const [mapId, door] of Object.entries(OWNER_DOORS)) {
  const transition = scene.checkTransition(door.x, door.y);
  assert(transition, `${mapId} door at ${door.x},${door.y} does not fire a transition`);
  assert(transition.targetMap === mapId, `${mapId} door fires ${transition.targetMap} instead`);
  assert(transition.toX === SHIPPED_DOORS[mapId].toX && transition.toY === SHIPPED_DOORS[mapId].toY,
    `${mapId} arrival cell drifted to ${transition.toX},${transition.toY}`);
}
// Proof the wrapper is what did it: unwrapped, the frozen table cannot reach any of these cells.
{
  const bare = makeScene(map);
  for (const [mapId, door] of Object.entries(OWNER_DOORS)) {
    assert(bare.checkTransition(door.x, door.y) === null,
      `${mapId} fires unwrapped -- this test's stub no longer matches the bundle`);
  }
}
assert(scene.checkTransition(69, 256) === null, 'open ground must not fire a transition');

// The cooldown contract survives the wrapper.
scene.transitionCooldown = 2;
assert(scene.checkTransition(69, 255) === null, 'a door must not fire while the cooldown is running');
assert(scene.transitionCooldown === 1, 'the wrapper must decrement the transition cooldown');
scene.transitionCooldown = 0;

// Coming back out: every destination lands on its owner-side exit, walkable, and not on the
// frozen coordinate the bundle would otherwise hand back.
for (const landmark of runtime.landmarks) {
  const inner = present(makeScene(map));
  inner.currentMapId = landmark.mapId;
  assert(inner.__act1TransitionWrapped, `${landmark.mapId} scene was not wrapped`);
  const back = inner.checkTransition(0, 0);
  assert(back && back.targetMap === 'overworld', `${landmark.mapId} must exit to the overworld`);
  assert(back.toX === landmark.exit.x && back.toY === landmark.exit.y,
    `${landmark.mapId} exits to ${back.toX},${back.toY}, expected ${landmark.exit.x},${landmark.exit.y}`);
  assert(walkable(back.toX, back.toY), `${landmark.mapId} exit cell is not walkable`);
  const frozen = SHIPPED_DOORS[landmark.mapId];
  assert(back.toX !== frozen.backX || back.toY !== frozen.backY,
    `${landmark.mapId} still exits at the frozen coordinate ${frozen.backX},${frozen.backY}`);
}

// Crystal Cave's OTHER mouth is the Act-2 side at 172,306. It falls outside the Act-1 rectangle,
// which is precisely the condition the exit remap tests, so it is never rewritten.
assert(!insideAct1(172, 306), 'the Act-2 side of Crystal Cave must lie outside the Act-1 bounds');
{
  const inner = present(makeScene(map));
  inner.currentMapId = 'ironkeep';
  assert(inner.checkTransition(0, 0) === null,
    'a map with no Act-1 exit must be left entirely alone');
}

// ---------------------------------------------------------------------------------------------
// Compass

{
  const inner = present(makeScene(map));
  inner.compassTarget = { mapId: 'mistyGrotto', ox: 120, oy: 260, type: 'dungeon' };
  const aimed = inner.getCompassTarget();
  assert(aimed.ox === OWNER_DOORS.mistyGrotto.x && aimed.oy === OWNER_DOORS.mistyGrotto.y,
    `compass aims at ${aimed.ox},${aimed.oy}, expected ${OWNER_DOORS.mistyGrotto.x},${OWNER_DOORS.mistyGrotto.y}`);
  assert(aimed.type === 'dungeon', 'compass target must keep its other fields');
  assert(inner.compassTarget.ox === 120, 'the compass wrapper must not mutate the bundle table');
  inner.compassTarget = { mapId: 'ironkeep', ox: 200, oy: 320, type: 'town' };
  const untouched = inner.getCompassTarget();
  assert(untouched.ox === 200 && untouched.oy === 320, 'non-Act-1 compass targets must be untouched');
  inner.compassTarget = null;
  assert(inner.getCompassTarget() === null, 'a null compass target must stay null');
}

// ---------------------------------------------------------------------------------------------
// The Crystal seal, and relocating saves written against the old layout

assert(runtime.gate.requiredFlag === 'boss.giantToad.defeated', 'Crystal gate flag must be preserved');
assert(runtime.gate.closedSide.length > 0, 'Crystal gate must seal at least one cell');
assert(runtime.gate.at.x === OWNER_DOORS.crystalCave.x && runtime.gate.at.y === OWNER_DOORS.crystalCave.y,
  'Crystal gate must sit on the owner-placed door');
// The door blocks either way -- it is a door, not a wall; the actual lock is performTransition()
// refusing `crystalCave` without the flag, which this override does not touch.
assert(!scene.canMove(OWNER_DOORS.crystalCave.x, OWNER_DOORS.crystalCave.y),
  'Crystal door must block before the Giant Toad flag');
window.__GAME_STATE__.player.state.storyFlags['boss.giantToad.defeated'] = true;
assert(!scene.canMove(OWNER_DOORS.crystalCave.x, OWNER_DOORS.crystalCave.y),
  'Crystal door must still block after the flag');
assert(scene.checkTransition(OWNER_DOORS.crystalCave.x, OWNER_DOORS.crystalCave.y)?.targetMap === 'crystalCave',
  'Crystal door must fire its transition');
delete window.__GAME_STATE__.player.state.storyFlags['boss.giantToad.defeated'];

assert(scene.minimapCalls === 0, 'DQ integration must remain the sole minimap-redraw owner');

// A save stranded on what the paint turned into terrain must relocate onto walkable ground.
const relocationMap = blankMap();
const relocationScene = makeScene(
  relocationMap, SHIPPED_DOORS.mistyGrotto.x, SHIPPED_DOORS.mistyGrotto.y);
assert(runtime.apply(relocationScene), 'new overworld map identity must receive the Act 1 plate');
present(relocationScene);
assert(relocationScene.heroTileX !== SHIPPED_DOORS.mistyGrotto.x
  || relocationScene.heroTileY !== SHIPPED_DOORS.mistyGrotto.y, 'blocked old save must relocate');
assert(relocationScene.canMove(relocationScene.heroTileX, relocationScene.heroTileY),
  'relocated save must land on a walkable cell');
assert(relocationMap[relocationScene.heroTileY][relocationScene.heroTileX] !== 3,
  'relocated save must not land inside forest');
assert(relocationScene.updatePositionCalls === 1 && relocationScene.updateCameraCalls === 1,
  'relocation must sync retained position and camera');
assert(runtime.state.relocation?.from.x === SHIPPED_DOORS.mistyGrotto.x,
  'relocation evidence must retain the invalid source coordinate');

// Every relocation candidate has to be somewhere the hero can legally stand.
for (const candidate of [relocationScene.heroTileX, relocationScene.heroTileY]) {
  assert(Number.isInteger(candidate), 'relocation must produce integer cells');
}

// A save already on walkable ground is left alone.
const keptMap = blankMap();
const keptScene = makeScene(keptMap, 69, 256);
assert(runtime.apply(keptScene), 'third map identity must receive the plate');
present(keptScene);
assert(keptScene.heroTileX === 69 && keptScene.heroTileY === 256,
  'a save already on walkable ground must not be moved');

// ---------------------------------------------------------------------------------------------
// Re-entry. Leaving a town gives the overworld a NEW mapData array under the SAME map id and
// dimensions, which is exactly the key the reskin pass guards on -- so it never calls apply()
// again. Caught in-game on 2026-08-03: every Act-1 door reverted to the base generator's after a
// single town round trip. The override has to reinstate itself off the movement path.
{
  const reentryMap = blankMap();
  const reentryScene = makeScene(reentryMap, 69, 256);
  assert(runtime.apply(reentryScene), 'a fresh map identity must receive the plate');
  present(reentryScene);
  assert(reentryMap[255][69] === 6, 'Greenhollow door must be stamped before the round trip');

  // The town round trip, modelled exactly: same scene object, brand new mapData, nobody calls
  // apply(). The very next movement decision must find the doors back.
  const afterTown = blankMap();
  reentryScene.mapData = afterTown;
  assert(afterTown[255][69] === 0, 'the fresh overworld array starts without the plate');
  reentryScene.canMove(69, 256);
  assert(afterTown[255][69] === 6,
    'the first canMove after re-entry must reinstate the plate (doors were silently lost)');
  assert(runtime.state.appliedMap === afterTown, 'the override must adopt the new map array');
  for (const [mapId, door] of Object.entries(OWNER_DOORS)) {
    assert(afterTown[door.y][door.x] === door.tile, `${mapId} door missing after re-entry`);
  }
  reentryScene.transitionCooldown = 0;
  assert(reentryScene.checkTransition(69, 255)?.targetMap === 'greenhollow',
    'doors must fire again after re-entry');

  // And a same-array mutation -- the reskin pass consolidates mountains in place after apply() --
  // is repaired by the deep sweep without disturbing the hero.
  const repairsBefore = runtime.state.repairs;
  afterTown[256][70] = 4;
  afterTown[255][69] = 0;
  present(reentryScene);
  assert(runtime.state.repairs === repairsBefore + 1, 'the deep sweep must record one repair');
  assert(afterTown[256][70] === 0 && afterTown[255][69] === 6, 'the deep sweep must restore the plate');
  assert(reentryScene.heroTileX === 69 && reentryScene.heroTileY === 256,
    'repairing the plate must not move the hero');
  present(reentryScene);
  assert(runtime.state.repairs === repairsBefore + 1, 'an intact plate must not be rewritten');
}

console.log(`ACT 1 RUNTIME OVERRIDE TEST PASS: revision ${runtime.revision};`
  + ` ${runtime.landmarks.length} owner-placed doors, all firing;`
  + ` ${walkableTotal} walkable cells in one region; plate ${runtime.plateSha256}`);
