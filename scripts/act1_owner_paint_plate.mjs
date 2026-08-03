#!/usr/bin/env node
//
// The Act-1 overworld COLLISION plate, built from the OWNER'S PAINTED TERRAIN.
//
// Owner, 2026-08-02: "please redo the collision setting based on what i created (my paint).
// this shouldn't even be a question."
//
// Provenance. Until now `public/act1-world-map.js` was generated (15 Jul) from
// `buildAct1OverworldReconstruction()` + a snapshot of the already-shipped runtime -- i.e. from
// the GENERATED semantic map the owner rejected on 29 Jul. The art pipeline moved to the paint on
// 30 Jul; the collision never did, so what the player sees and what the player can walk on had
// drifted to 53.1% agreement. This module is the missing wire.
//
// The terrain composite here is BYTE-FOR-BYTE the same rule `scripts/build_owner_semantic_maps.py`
// uses to paint `act1-owner-semantic.png`, which is what the shipped material art was rendered
// from. That is deliberate and is the whole point: collision == art by construction, not by
// inspection. The two inputs are
//
//   owner-terrain.json  acts.1.terrainRows   the owner's hand-painted classes ('.', 'F', 'M')
//   land-mask.npy                            where the continent is land at all; !land => sea
//
// The owner painted NO water and NO road cells in Act 1 -- every 'W'/'R' branch below exists only
// so the mapping stays total. Act 1 is roadless BY DESIGN (roadless base 2026-07-19, ADR-0069);
// do not re-add roads.
//
// Tile codes are the base game's overworld vocabulary, read out of the shipped bundle:
//   canMove() blocks {2,4,6,7,8,9,10,11,12,14,15,16,19,20,21}; the Act-1 wrapper also blocks 3.
//   checkTransition() fires on {6,7,8,9,10,12,15,16,19} -- so a landmark tile is a DOOR: it is
//   unwalkable, and stepping INTO it triggers the transition.

import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const OWNER_TERRAIN = resolve(
  ROOT, 'design/continent-terrain-class-method/owner-terrain/owner-terrain.json');
const LAND_MASK = resolve(
  ROOT, 'design/review/overworld-art-blueprint/continent/continent-macro-g3/land-mask.npy');

export const WORLD_WIDTH = 320;
export const WORLD_HEIGHT = 400;

// Paint class -> base-game overworld tile. Sea (from the land mask) is 2, same as painted water.
const TILE_BY_PAINT = { '.': 0, F: 3, M: 4, W: 2, R: 1 };

// Base-game canMove() overworld branch, plus the Act-1 wrapper's extra block on 3 (forest).
const OVERWORLD_BLOCKED = new Set(
  [2, 3, 4, 6, 7, 8, 9, 10, 11, 12, 14, 15, 16, 19, 20, 21]);

// The eight Act-1 landmarks that have an implemented destination map, with the tile code the base
// game's checkTransition() recognises and the arrival cell inside that map. `enter` is lifted
// verbatim from the bundle's `Xt.overworld.connections`; only the OVERWORLD side moves.
//
// "Darkfang" is in the owner's landmark roster but is NOT here: it was placed for the first time
// on 30 Jul (owner-terrain.json _edits) and has no map in the shipped game. It stays open ground
// until a destination exists -- stamping a door with nothing behind it would soft-lock the player.
const LANDMARKS = [
  { mapId: 'greenhollow', ownerKey: 'Greenhollow', tile: 6, enter: { toX: 8, toY: 14 } },
  { mapId: 'millbrook', ownerKey: 'Millbrook', tile: 6, enter: { toX: 8, toY: 14 } },
  { mapId: 'portSapphire', ownerKey: 'Port Sapphire', tile: 6, enter: { toX: 8, toY: 14 } },
  { mapId: 'sunkenCellar', ownerKey: 'Sunken Cellar', tile: 7, enter: { toX: 50, toY: 1 } },
  { mapId: 'whisperingWoodsCave', ownerKey: 'Whispering Woods', tile: 7, enter: { toX: 50, toY: 1 } },
  { mapId: 'coastalReef', ownerKey: 'Coastal Reef', tile: 7, enter: { toX: 50, toY: 1 } },
  { mapId: 'mistyGrotto', ownerKey: 'Misty Grotto', tile: 7, enter: { toX: 50, toY: 1 } },
  { mapId: 'crystalCave', ownerKey: 'Crystal Cave', tile: 15, enter: { toX: 50, toY: 99 } },
];

// The base game drops the hero one cell SOUTH of each door on the way out. Keep that reading where
// the paint allows it and fall back deterministically otherwise -- Port Sapphire's door is on the
// water at the head of its inlet and Coastal Reef's is on the shoreline, so both are entered and
// left from the north.
const EXIT_PREFERENCE = [[0, 1], [0, -1], [1, 0], [-1, 0]];

const CRYSTAL_GATE_FLAG = 'boss.giantToad.defeated';

const assert = (condition, message) => { if (!condition) throw new Error(`act1 owner plate: ${message}`); };
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');

function readLandMask() {
  const buffer = readFileSync(LAND_MASK);
  const header = buffer.subarray(0, 128).toString('latin1');
  assert(header.startsWith('\x93NUMPY'), 'land-mask.npy is not a NumPy array');
  assert(header.includes("'descr': '|b1'"), 'land-mask.npy must be boolean');
  assert(header.includes(`'shape': (${WORLD_HEIGHT}, ${WORLD_WIDTH})`), 'land-mask.npy shape must be (400, 320)');
  assert(header.includes("'fortran_order': False"), 'land-mask.npy must be C-ordered');
  const data = buffer.subarray(128);
  assert(data.length === WORLD_WIDTH * WORLD_HEIGHT, 'land-mask.npy payload is the wrong length');
  return (x, y) => data[y * WORLD_WIDTH + x] !== 0;
}

// ---------------------------------------------------------------------------------------------
// The plate

export function buildAct1OwnerPaintPlate() {
  const ownerTerrainBytes = readFileSync(OWNER_TERRAIN);
  const owner = JSON.parse(ownerTerrainBytes.toString('utf8'));
  const act = owner.acts['1'];
  const [minX, minY, maxX, maxY] = act.bounds;
  const width = maxX - minX + 1;
  const height = maxY - minY + 1;
  const paint = act.terrainRows;
  assert(paint.length === height, 'terrainRows height does not match bounds');
  assert(paint.every(row => row.length === width), 'terrainRows width does not match bounds');
  const isLand = readLandMask();

  // 1. Terrain composite -- the owner's classes on land, sea everywhere the continent is not land.
  const tiles = [];
  for (let y = 0; y < height; y += 1) {
    const row = new Array(width);
    for (let x = 0; x < width; x += 1) {
      if (!isLand(minX + x, minY + y)) { row[x] = 2; continue; }
      const paintClass = paint[y][x];
      const tile = TILE_BY_PAINT[paintClass];
      assert(tile !== undefined, `unknown paint class ${JSON.stringify(paintClass)} at ${minX + x},${minY + y}`);
      row[x] = tile;
    }
    tiles.push(row);
  }

  const inside = (x, y) => x >= minX && x <= maxX && y >= minY && y <= maxY;
  const tileAt = (x, y) => tiles[y - minY][x - minX];
  const walkable = (x, y) => inside(x, y) && !OVERWORLD_BLOCKED.has(tileAt(x, y));

  // 2. Landmark doors at the owner's placement, with a walkable arrival cell for the way back.
  const placed = [];
  for (const landmark of LANDMARKS) {
    const cell = act.landmarks[landmark.ownerKey];
    assert(Array.isArray(cell) && cell.length === 2,
      `owner-terrain.json has no placement for ${landmark.ownerKey}`);
    const [x, y] = cell;
    assert(inside(x, y), `${landmark.ownerKey} at ${x},${y} is outside the Act 1 bounds`);
    const approaches = EXIT_PREFERENCE
      .map(([dx, dy]) => ({ x: x + dx, y: y + dy }))
      .filter(point => walkable(point.x, point.y));
    // The loud empty case. A door with no approach is a destination the player can never reach,
    // and the previous pass printed a green "all reachable" while silently skipping exactly these.
    assert(approaches.length > 0,
      `${landmark.ownerKey} (${landmark.mapId}) at ${x},${y} has NO walkable neighbour -- unenterable`);
    placed.push({ ...landmark, at: { x, y }, approaches, exit: approaches[0] });
  }
  assert(placed.length === LANDMARKS.length, 'not every Act 1 landmark was placed');

  for (const landmark of placed) tiles[landmark.at.y - minY][landmark.at.x - minX] = landmark.tile;
  for (const landmark of placed) {
    assert(tileAt(landmark.at.x, landmark.at.y) === landmark.tile,
      `${landmark.mapId} door tile did not survive stamping (landmarks overlap?)`);
    assert(walkable(landmark.exit.x, landmark.exit.y),
      `${landmark.mapId} exit cell ${landmark.exit.x},${landmark.exit.y} is not walkable after stamping`);
  }

  // 3. Rows, in the base-36 encoding the runtime override parses.
  const bytes = [];
  const rows = tiles.map(row => {
    let encoded = '';
    for (const tile of row) {
      assert(Number.isInteger(tile) && tile >= 0 && tile < 36, `invalid runtime tile ${tile}`);
      bytes.push(tile);
      encoded += tile.toString(36);
    }
    return encoded;
  });

  // 4. Relocation candidates. `relocateIfNeeded` walks SAFE looking for the nearest unblocked cell
  //    for a hero whose saved position the new plate turned into terrain, so this has to cover the
  //    walkable region rather than just name the landmarks: a save stranded mid-map should surface
  //    nearby, not at whichever door happens to be closest in Manhattan distance.
  const SAFE_STRIDE = 8;
  const safeKeys = new Set();
  const safeCandidates = [];
  const pushSafe = point => {
    const key = `${point.x},${point.y}`;
    if (safeKeys.has(key)) return;
    safeKeys.add(key);
    safeCandidates.push({ x: point.x, y: point.y });
  };
  for (const landmark of placed) for (const approach of landmark.approaches) pushSafe(approach);
  for (let y = minY; y <= maxY; y += 1) {
    if ((y - minY) % SAFE_STRIDE !== 0) continue;
    for (let x = minX; x <= maxX; x += 1) {
      if ((x - minX) % SAFE_STRIDE !== 0) continue;
      if (walkable(x, y)) pushSafe({ x, y });
    }
  }
  safeCandidates.sort((left, right) => left.y - right.y || left.x - right.x);
  assert(safeCandidates.length > 0, 'no relocation candidates -- SAFE would be empty');

  // 5. The Crystal Cave seal. Under the generated map the flag gated a three-cell land bridge that
  //    was the only way east; under the owner's paint Crystal Cave stands in an open pocket on the
  //    WEST side of the range and the mountains seal the border on their own (verified: the Act-1
  //    rectangle has zero walkable perimeter cells). So the seal is the door itself, and the real
  //    lock stays where it always was -- performTransition() refuses `crystalCave` without the
  //    flag and shows dungeon.crystalCave.locked, which this plate does not touch.
  const crystal = placed.find(landmark => landmark.mapId === 'crystalCave');
  const gate = {
    at: { ...crystal.at },
    requiredFlag: CRYSTAL_GATE_FLAG,
    closedSide: [{ ...crystal.at }],
  };

  // 6. Harbour water: the sea body the owner's inlet cuts up to Port Sapphire's door. Metadata for
  //    the art/review tooling -- nothing in the runtime reads it -- but it must describe the paint
  //    rather than the topology the paint replaced.
  const port = placed.find(landmark => landmark.mapId === 'portSapphire');
  const harborCells = floodWater(tiles, minX, minY, width, height, port.at, 24);

  // 7. Provenance over the actual inputs. `ACT1_V3_LOCKED_DESIGN_SHA256` locked the GENERATED
  //    design and stops meaning anything the moment the terrain source changes, so it is replaced
  //    here by a hash of the owner's paint plus the land mask that carves the sea out of it.
  const sourceSha256 = sha256(Buffer.concat([
    Buffer.from(JSON.stringify(act)),
    readFileSync(LAND_MASK),
  ]));

  const plate = {
    bounds: [minX, minY, maxX, maxY],
    rows,
    tiles,
    landmarks: placed,
    safeCandidates,
    gate,
    harborCells,
    // The owner's paint has no rivers and no roads, so Act 1 has nothing to bridge and no
    // old-growth block to describe. Both keys stay in the artefact and are honestly empty.
    bridgeDecks: [],
    forestBlock: null,
    plateSha256: sha256(Buffer.from(bytes)),
    sourceSha256,
  };

  validatePlate(plate);
  return plate;
}

function floodWater(tiles, minX, minY, width, height, origin, radius) {
  const seen = new Set();
  const cells = [];
  const stack = [];
  const push = (x, y) => {
    if (x < minX || y < minY || x >= minX + width || y >= minY + height) return;
    if (Math.abs(x - origin.x) > radius || Math.abs(y - origin.y) > radius) return;
    const key = `${x},${y}`;
    if (seen.has(key)) return;
    if (tiles[y - minY][x - minX] !== 2) return;
    seen.add(key);
    cells.push({ x, y });
    stack.push(x, y);
  };
  for (const [dx, dy] of [[0, 1], [0, -1], [1, 0], [-1, 0]]) push(origin.x + dx, origin.y + dy);
  while (stack.length) {
    const y = stack.pop();
    const x = stack.pop();
    push(x + 1, y); push(x - 1, y); push(x, y + 1); push(x, y - 1);
  }
  cells.sort((left, right) => left.y - right.y || left.x - right.x);
  return cells;
}

// ---------------------------------------------------------------------------------------------
// Validation. Every assertion below is written so that an EMPTY input trips it: a check that
// iterates a list is preceded by a check that the list is not empty. The 2026-08-02 pass reported
// "all reachable" from a loop over a set that had silently dropped the three landmarks with no
// approach at all, so "it printed green" is not evidence of anything on its own.

export function validatePlate(plate) {
  const [minX, minY, maxX, maxY] = plate.bounds;
  const { tiles, landmarks } = plate;
  const inside = (x, y) => x >= minX && x <= maxX && y >= minY && y <= maxY;
  const tileAt = (x, y) => tiles[y - minY][x - minX];
  const walkable = (x, y) => inside(x, y) && !OVERWORLD_BLOCKED.has(tileAt(x, y));

  assert(landmarks.length === LANDMARKS.length,
    `expected ${LANDMARKS.length} landmarks, found ${landmarks.length}`);
  assert(plate.rows.length === maxY - minY + 1, 'row count does not match bounds');
  assert(plate.rows.every(row => row.length === maxX - minX + 1), 'row width does not match bounds');

  // Every door is stamped, blocked, transition-triggering, and has a walkable way in.
  const TRIGGERS = new Set([6, 7, 8, 9, 10, 12, 15, 16, 19]);
  for (const landmark of landmarks) {
    const tile = tileAt(landmark.at.x, landmark.at.y);
    assert(tile === landmark.tile, `${landmark.mapId} door is tile ${tile}, expected ${landmark.tile}`);
    assert(TRIGGERS.has(tile), `${landmark.mapId} tile ${tile} does not trigger checkTransition`);
    assert(OVERWORLD_BLOCKED.has(tile), `${landmark.mapId} tile ${tile} is walkable -- doors must block`);
    assert(landmark.approaches.length > 0, `${landmark.mapId} has no approach cells`);
    for (const approach of landmark.approaches) {
      assert(walkable(approach.x, approach.y),
        `${landmark.mapId} approach ${approach.x},${approach.y} is not walkable`);
    }
    assert(walkable(landmark.exit.x, landmark.exit.y),
      `${landmark.mapId} exit ${landmark.exit.x},${landmark.exit.y} is not walkable`);
  }

  // One walkable region, and every door opens onto it. BFS from the FIRST landmark's exit, then
  // require that every other landmark has at least one approach inside the region reached.
  const region = floodWalkable(plate, landmarks[0].exit);
  assert(region.size > 0, 'walkable flood from the first landmark exit is EMPTY');
  const unreachable = [];
  for (const landmark of landmarks) {
    const reached = landmark.approaches.filter(point => region.has(`${point.x},${point.y}`));
    if (reached.length === 0) unreachable.push(`${landmark.mapId} (${landmark.at.x},${landmark.at.y})`);
  }
  assert(unreachable.length === 0,
    `landmarks NOT reachable from ${landmarks[0].mapId}: ${unreachable.join(', ')}`);

  // Total walkable area must all be one piece, so nothing the player can reach is a dead pocket.
  let walkableCount = 0;
  for (let y = minY; y <= maxY; y += 1) {
    for (let x = minX; x <= maxX; x += 1) if (walkable(x, y)) walkableCount += 1;
  }
  assert(walkableCount > 0, 'the Act 1 plate has NO walkable cell at all');
  assert(region.size === walkableCount,
    `walkable area is split: ${region.size} reachable of ${walkableCount} walkable cells`);

  // The plate must not open a way out of the Act-1 rectangle that the old plate sealed. Everything
  // outside the bounds is the untouched base map, and Act 2 is meant to be entered through
  // Crystal Cave -- a walkable perimeter cell would be a hole straight into it.
  const perimeter = [];
  for (let x = minX; x <= maxX; x += 1) perimeter.push([x, minY], [x, maxY]);
  for (let y = minY + 1; y < maxY; y += 1) perimeter.push([minX, y], [maxX, y]);
  assert(perimeter.length > 0, 'perimeter scan produced no cells');
  const leaks = perimeter.filter(([x, y]) => walkable(x, y)).map(([x, y]) => `${x},${y}`);
  assert(leaks.length === 0, `Act 1 boundary is walkable at ${leaks.join(' ')} -- new leak out of the act`);

  // Relocation must always have somewhere to land, including with the Crystal seal closed.
  assert(plate.safeCandidates.length > 0, 'SAFE is empty');
  const sealed = new Set(plate.gate.closedSide.map(point => `${point.x},${point.y}`));
  const usableSafe = plate.safeCandidates.filter(
    point => walkable(point.x, point.y) && !sealed.has(`${point.x},${point.y}`));
  assert(usableSafe.length > 0, 'every SAFE candidate is blocked or behind the closed gate');
  assert(usableSafe.length === plate.safeCandidates.length,
    'SAFE contains candidates that are blocked or sealed');

  return {
    walkableCells: walkableCount,
    regionCells: region.size,
    safeCells: plate.safeCandidates.length,
    landmarks: landmarks.length,
  };
}

function floodWalkable(plate, start) {
  const [minX, minY, maxX, maxY] = plate.bounds;
  const { tiles } = plate;
  const walkable = (x, y) => x >= minX && x <= maxX && y >= minY && y <= maxY
    && !OVERWORLD_BLOCKED.has(tiles[y - minY][x - minX]);
  const seen = new Set();
  if (!walkable(start.x, start.y)) return seen;
  const stack = [start.x, start.y];
  seen.add(`${start.x},${start.y}`);
  while (stack.length) {
    const y = stack.pop();
    const x = stack.pop();
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx;
      const ny = y + dy;
      const key = `${nx},${ny}`;
      if (seen.has(key) || !walkable(nx, ny)) continue;
      seen.add(key);
      stack.push(nx, ny);
    }
  }
  return seen;
}

export { LANDMARKS, OVERWORLD_BLOCKED };

if (import.meta.url === `file://${process.argv[1]}`) {
  const plate = buildAct1OwnerPaintPlate();
  const stats = validatePlate(plate);
  console.log(`ACT 1 OWNER PAINT PLATE: ${stats.walkableCells} walkable cells in ${stats.regionCells}-cell`
    + ` single region; ${stats.landmarks} landmarks; ${stats.safeCells} relocation candidates`);
  console.log(`  plate ${plate.plateSha256}`);
  console.log(`  source ${plate.sourceSha256}`);
  for (const landmark of plate.landmarks) {
    console.log(`  ${landmark.mapId.padEnd(20)} door ${landmark.at.x},${landmark.at.y}`
      + ` tile ${landmark.tile}  exit ${landmark.exit.x},${landmark.exit.y}`
      + `  approaches ${landmark.approaches.length}`);
  }
}
