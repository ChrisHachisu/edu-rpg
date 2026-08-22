#!/usr/bin/env node
//
// THE LANDMARK SPRITE IS THE BLOCKER. Act 1's single-entrance rule, derived from the art.
//
// Owner, 2026-08-18: "only one entrance for towns and dungeons (unless they connect acts or in
// other special circumstances) and the edge need to be blockers so the user cannot walk on top
// of it."
//
// WHAT WAS ACTUALLY WRONG. The single entrance already existed in the DATA -- every landmark owns
// exactly one door cell, and `act1_owner_paint_plate.mjs` stamps it. What never existed is the
// BLOCKER around it. A dungeon sprite is 144 px and a town sprite 192 px against a 48 px cell, so
// the drawn palisade, rooftops and rock spread three to four cells wide over ground the plate
// still calls plain grass (tile 0). The player walks over all of it and reaches the door from any
// side. That is "walk on top of it", and it is also four entrances, not one.
//
// -------------------------------------------------------------------------------------------
// THE THRESHOLD IS THE HERO'S BODY, NOT A COVERAGE PERCENTAGE
//
// The obvious rule -- "block a cell whose sprite coverage exceeds T" -- has no honest T. Measured
// over all nine sprites (171 touched cells), coverage is a smooth distribution with no plateau to
// cut at: sweeping T from 0.05 to 1.00 in 0.05 steps moves the blocked count 88 -> 14 with no step
// larger than 10. Any T is a guess, and the guess is load-bearing, because it decides which cells
// the player can stand on.
//
// So the rule is not about area at all. It asks the question the owner actually asked:
//
//     COULD THE HERO STAND FULLY ON TOP OF THE DRAWN ART HERE?
//
// which the runtime already answers for rock. `public/dq-tiles.js` line 3161: `A1M_FOOT=12` --
// "world px the hero's GROUND CONTACT POINT keeps clear of rock". Her ground contact is therefore
// a disc of radius 12 world px centred on her soles. A cell is blocked iff SOME position in it
// puts that whole disc inside the sprite's opaque silhouette -- i.e. iff the alpha mask, ERODED by
// that same 12 px disc, is non-empty anywhere in the cell.
//
// No free parameter: the 12 comes from the collider, and the disc is the hero's own footprint.
//
// AND IT IS NOT REPRODUCIBLE BY ANY COVERAGE THRESHOLD, which is the point. Measured across the
// nine sprites, the LOWEST coverage among cells this blocks is 0.08 (Greenhollow's west lobe) and
// the HIGHEST among cells it leaves open is 0.21 (Crystal Cave's south skirt). Those ranges
// OVERLAP, so no single T reproduces this set. The 8% cell is a solid corner of palisade wide
// enough to stand inside; the 21% cell is a thin drop-shadow skirt that is nowhere 24 px thick.
// Coverage cannot tell those apart. The hero's own body can.
//
// -------------------------------------------------------------------------------------------
// ONE ENTRANCE: THE GATEWAY CELL IS THE EXEMPTION
//
// The door cell itself is unwalkable by construction (tiles 6/7/15 are in OW_BLOCK) and fires
// `checkTransition` when the hero's step INTO it is refused -- `a1mDoor`, dq-tiles.js:3971. So she
// must be able to STAND on a cell orthogonally adjacent to the door, and exactly one such cell may
// stay open or the entrance is not single.
//
// That cell is the drawn gateway, and this is measured, not asserted. Greenhollow's palisade has
// one gap, with a cobbled road running south out of it; the gap spans sprite x 95..115, y 150..192,
// which lands on cell (69,256) -- precisely the cell this rule exempts. Millbrook's single gate gap
// lands on (39,345), likewise exempt. The hero stands IN the gateway, which is what a gateway is
// for, and every other cell of the town is stone.
//
// APPROACH PREFERENCE IS S, E, W, N -- AND NORTH BEING LAST IS THE COASTAL REEF FIX.
// `act1_owner_paint_plate.mjs` prefers S, N, E, W, which is a statement about the base game's
// exit convention rather than about the art. These sprites are 3/4 top-down dioramas: a mouth can
// be drawn on the front face (south) or a side face (east/west), and CANNOT be drawn on the north
// face at all -- it would be hidden behind the hill's own mass. So north is a last resort, not a
// second choice. That single reordering is what moves Coastal Reef, whose south is open sea, from
// a NORTH approach (the player walking down over the back of the cliff into rock) to an EAST one,
// which is where the drawn arch and its tidal spill already face. Nothing else moves: the other
// seven keep the side they already had.
//
// WHAT IS DELIBERATELY NOT TOUCHED
//   * crystalCave -- the act-connecting gate, and the "special circumstance" the owner's rule
//     exempts by name. Its cell, its art and its blockers are left exactly as they are.
//   * misty-grotto (91,378) -- a sprite with no door. dq-tiles.js:2250 withholds it from drawing
//     because its cell is plain grass, so there is no art there to walk on and nothing to block.
//
// THE BLOCKER TILE IS 21, and the choice is forced rather than aesthetic. It has to be in
// `OW_BLOCK` (so `scene.canMove` refuses it), out of `OW_PROP` (so it is not a second door, and so
// it never suppresses a landmark sprite -- a1aLandmarks:2255 draws only where the cell still
// carries an OW_PROP tile), out of `OWM_FIELD_OWNED={2,4,5}` (so it stays a clean cell-granular
// point test with no chamfer clearance to strangle the gateway, and so the baked walk field in
// `public/act1-overworld-walk.bin` is untouched -- its identity hash reads water/bridge/mountain
// membership only), and in this plate's own `OVERWORLD_BLOCKED`. Codes 13, 14 and 21 qualify; 13
// is absent from the plate's blocked set and 14 carries a1mFree's entrance-crystal special case,
// which leaves 21. Inside the Act 1 rectangle it is INVISIBLE: `drawTerrain` returns early on
// `a1aBlit` (dq-tiles.js:670) and the baked hi-fi chunks own every ground pixel, so the tile code
// there is collision and nothing else.

import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { inflateSync } from 'node:zlib';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const MANIFEST = resolve(ROOT, 'public/act1-hifi/landmarks/landmarks.json');
const SPRITE_DIR = resolve(ROOT, 'public/act1-hifi/landmarks');

// public/dq-tiles.js:3161 -- "world px the hero's GROUND CONTACT POINT keeps clear of rock".
export const HERO_FOOT_PX = 12;
// The alpha above which a sprite pixel counts as drawn structure rather than an antialiased rim.
// Half of full opacity: the same midpoint every other mask bake in this repo thresholds at.
export const ALPHA_SOLID = 128;
export const BLOCKER_TILE = 21;
// South, east, west, north. See the header: north is undrawable in this projection.
export const APPROACH_PREFERENCE = [[0, 1], [1, 0], [-1, 0], [0, -1]];
// Left exactly as it is: the act-connecting gate, and the owner's own named exemption.
export const EXEMPT_MAP_IDS = new Set(['crystalCave']);

// The plate's own blocked set (act1_owner_paint_plate.mjs OVERWORLD_BLOCKED), restated here
// rather than imported so this module stays free of a cycle with the plate it post-processes.
// `BLOCKER_TILE` must be a member of it, which is asserted at load below.
const BLOCKED = new Set([2, 3, 4, 6, 7, 8, 9, 10, 11, 12, 14, 15, 16, 19, 20, 21]);

const assert = (condition, message) => {
  if (!condition) throw new Error(`act1 landmark footprints: ${message}`);
};

assert(BLOCKED.has(BLOCKER_TILE), 'the blocker tile must be blocked by the plate itself');

// ---------------------------------------------------------------------------------------------
// A minimal PNG reader, so the footprint is derived from the SHIPPED sprite and nothing has to be
// baked, pinned or kept in step. These nine files are 8-bit RGBA, non-interlaced; anything else
// trips an assertion rather than being guessed at.

export function readPngAlpha(path) {
  const bytes = readFileSync(path);
  assert(bytes.length > 8 && bytes.readUInt32BE(0) === 0x89504e47, `${path} is not a PNG`);
  let offset = 8;
  let width = 0;
  let height = 0;
  const idat = [];
  while (offset + 8 <= bytes.length) {
    const length = bytes.readUInt32BE(offset);
    const type = bytes.toString('latin1', offset + 4, offset + 8);
    const body = bytes.subarray(offset + 8, offset + 8 + length);
    if (type === 'IHDR') {
      width = body.readUInt32BE(0);
      height = body.readUInt32BE(4);
      assert(body[8] === 8, `${path} must be 8 bits per channel`);
      assert(body[9] === 6, `${path} must be RGBA (colour type 6)`);
      assert(body[12] === 0, `${path} must not be interlaced`);
    } else if (type === 'IDAT') {
      idat.push(Buffer.from(body));
    } else if (type === 'IEND') {
      break;
    }
    offset += 12 + length;
  }
  assert(width > 0 && height > 0 && idat.length > 0, `${path} carried no image data`);

  const bpp = 4;
  const stride = width * bpp;
  const raw = inflateSync(Buffer.concat(idat));
  assert(raw.length === (stride + 1) * height, `${path} inflated to the wrong length`);
  const alpha = new Uint8Array(width * height);
  const line = Buffer.alloc(stride);
  const prev = Buffer.alloc(stride);
  for (let y = 0; y < height; y += 1) {
    const filter = raw[y * (stride + 1)];
    raw.copy(line, 0, y * (stride + 1) + 1, (y + 1) * (stride + 1));
    for (let i = 0; i < stride; i += 1) {
      const a = i >= bpp ? line[i - bpp] : 0;   // left
      const b = prev[i];                        // up
      const c = i >= bpp ? prev[i - bpp] : 0;   // upper-left
      let add = 0;
      if (filter === 1) add = a;
      else if (filter === 2) add = b;
      else if (filter === 3) add = (a + b) >> 1;
      else if (filter === 4) {
        const p = a + b - c;
        const pa = Math.abs(p - a);
        const pb = Math.abs(p - b);
        const pc = Math.abs(p - c);
        add = (pa <= pb && pa <= pc) ? a : (pb <= pc ? b : c);
      } else {
        assert(filter === 0, `${path} row ${y} has unknown filter ${filter}`);
      }
      line[i] = (line[i] + add) & 0xff;
    }
    for (let x = 0; x < width; x += 1) alpha[y * width + x] = line[x * bpp + 3];
    line.copy(prev);
  }
  return { width, height, alpha };
}

// ---------------------------------------------------------------------------------------------
// The footprint

function discOffsets(radius) {
  const offsets = [];
  for (let dy = -radius; dy <= radius; dy += 1) {
    for (let dx = -radius; dx <= radius; dx += 1) {
      if (dx * dx + dy * dy <= radius * radius) offsets.push([dx, dy]);
    }
  }
  return offsets;
}

/* The eroded mask: pixels where the hero's whole 12 px contact disc fits inside the drawn art. */
function erodeByHeroFoot(sprite) {
  const { width, height, alpha } = sprite;
  const solid = new Uint8Array(width * height);
  for (let i = 0; i < alpha.length; i += 1) solid[i] = alpha[i] >= ALPHA_SOLID ? 1 : 0;
  const offsets = discOffsets(HERO_FOOT_PX);
  const eroded = new Uint8Array(width * height);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if (!solid[y * width + x]) continue;
      let fits = true;
      for (let k = 0; k < offsets.length && fits; k += 1) {
        const nx = x + offsets[k][0];
        const ny = y + offsets[k][1];
        // Off-canvas is transparent, so a disc that leaves the sprite does not fit.
        if (nx < 0 || ny < 0 || nx >= width || ny >= height || !solid[ny * width + nx]) fits = false;
      }
      if (fits) eroded[y * width + x] = 1;
    }
  }
  return eroded;
}

export function loadLandmarkManifest() {
  const manifest = JSON.parse(readFileSync(MANIFEST, 'utf8'));
  assert(Array.isArray(manifest.landmarks) && manifest.landmarks.length > 0,
    'landmarks.json carries no landmarks');
  assert(manifest.worldPxPerCell > 0, 'landmarks.json has no worldPxPerCell');
  return manifest;
}

/* Every cell the sprite could hide the hero inside, as absolute world cells.
   Placement is a1aLandmarks' own (dq-tiles.js:2260): the `anchor` pixel lands on the cell centre. */
export function spriteFootprintCells(entry, worldPxPerCell) {
  const sprite = readPngAlpha(resolve(SPRITE_DIR, `${entry.slug}.png`));
  assert(sprite.width === entry.size && sprite.height === entry.size,
    `${entry.slug}.png is ${sprite.width}x${sprite.height}, manifest says ${entry.size}`);
  // A TOWN IS SOLID; A DUNGEON MOUTH IS EMBEDDED. These want different rules and using one for
  // both is what left Port Sapphire walkable.
  //
  // The hero-foot erosion below asks "could she stand fully on the drawn art here", which is
  // right for a cave mouth -- LANDMARK-SPRITE-CONTRACT wants those "naturally embedded in the
  // terrain", so the thin edges of the rock SHOULD stay walkable. Applied to a town it is far too
  // permissive, because a town sprite is mostly low detail -- jetties, boats, yard, a fence one
  // rail thick -- that never hides a 12 px foot disc. Measured on the regenerated sprites it
  // blocked 5 of 18 cells for Port Sapphire against 11 and 12 for the villages: the same kind of
  // object, wildly different results, and the owner walked over the harbour. His rule is the
  // blunt one: "the town asset in the overworld needs a hard blocker around the edges of the town"
  // and, earlier, "the edge need to be blockers so the user cannot walk on top of it."
  //
  // So a TOWN cell is blocked when at least a QUARTER of it is drawn town. That is a coverage
  // threshold, which this file argues against for the hero-standing question and rightly -- but
  // this is a different question. "Is this cell part of the town" has an honest answer at 25%:
  // it takes the drawn town including its fence and outermost buildings, and leaves the soft alpha
  // skirt -- the pad fading into terrain, which is ground and should stay walkable. Measured
  // across the three towns it blocks 12, 12 and 13 of 18, i.e. consistently, which the erosion
  // never did. Towns are the 192 px sprites; dungeon mouths and portals are 144.
  const TOWN_SIZE = 192;
  const TOWN_CELL_COVERAGE = 0.25;
  const originX = entry.cell[0] * worldPxPerCell + Math.floor(worldPxPerCell / 2) - entry.anchor[0];
  const originY = entry.cell[1] * worldPxPerCell + Math.floor(worldPxPerCell / 2) - entry.anchor[1];
  const cells = new Map();
  if (entry.size === TOWN_SIZE) {
    const counts = new Map();
    for (let y = 0; y < sprite.height; y += 1) {
      for (let x = 0; x < sprite.width; x += 1) {
        if (!sprite.alpha[y * sprite.width + x]) continue;
        const cx = Math.floor((originX + x) / worldPxPerCell);
        const cy = Math.floor((originY + y) / worldPxPerCell);
        const k = `${cx},${cy}`;
        counts.set(k, (counts.get(k) || 0) + 1);
      }
    }
    const need = worldPxPerCell * worldPxPerCell * TOWN_CELL_COVERAGE;
    for (const [k, n] of counts) {
      if (n < need) continue;
      const [cx, cy] = k.split(',').map(Number);
      cells.set(k, { x: cx, y: cy });
    }
    // UNION with the hero-foot rule, never instead of it. Coverage alone came out STRICTER than
    // the erosion on the two villages -- greenhollow 13 cells against 14, millbrook 12 against 13 --
    // so swapping one for the other made the towns LESS solid, which is the opposite of what was
    // asked. A cell is town if the hero could stand on the art there OR a quarter of it is drawn
    // town; both are reasons to block and neither is a reason to allow.
    const eroded0 = erodeByHeroFoot(sprite);
    for (let y = 0; y < sprite.height; y += 1) {
      for (let x = 0; x < sprite.width; x += 1) {
        if (!eroded0[y * sprite.width + x]) continue;
        const cx = Math.floor((originX + x) / worldPxPerCell);
        const cy = Math.floor((originY + y) / worldPxPerCell);
        cells.set(`${cx},${cy}`, { x: cx, y: cy });
      }
    }
    return [...cells.values()].sort((a, b) => a.y - b.y || a.x - b.x);
  }
  const eroded = erodeByHeroFoot(sprite);
  for (let y = 0; y < sprite.height; y += 1) {
    for (let x = 0; x < sprite.width; x += 1) {
      if (!eroded[y * sprite.width + x]) continue;
      const cx = Math.floor((originX + x) / worldPxPerCell);
      const cy = Math.floor((originY + y) / worldPxPerCell);
      cells.set(`${cx},${cy}`, { x: cx, y: cy });
    }
  }
  return [...cells.values()].sort((a, b) => a.y - b.y || a.x - b.x);
}

// ---------------------------------------------------------------------------------------------
// The post-pass over the owner's plate

/* Mutates `plate` in place: stamps the blockers, narrows every landmark to its single gateway
   cell, and re-derives the encoded rows, the relocation candidates and the plate hash so the
   artefact stays internally consistent. The caller re-runs validatePlate() over the result --
   this deliberately asserts nothing about connectivity itself, because that check already exists
   and having two of them is how they drift. */
export function applyLandmarkFootprints(plate) {
  const manifest = loadLandmarkManifest();
  const px = manifest.worldPxPerCell;
  const [minX, minY, maxX, maxY] = plate.bounds;
  const { tiles } = plate;
  const inside = (x, y) => x >= minX && x <= maxX && y >= minY && y <= maxY;
  const tileAt = (x, y) => tiles[y - minY][x - minX];
  const setTile = (x, y, value) => { tiles[y - minY][x - minX] = value; };
  const walkable = (x, y) => inside(x, y) && !BLOCKED.has(tileAt(x, y));

  const bySlugCell = new Map();
  for (const entry of manifest.landmarks) bySlugCell.set(`${entry.cell[0]},${entry.cell[1]}`, entry);

  const report = [];
  const stamped = [];
  for (const landmark of plate.landmarks) {
    const entry = bySlugCell.get(`${landmark.at.x},${landmark.at.y}`);
    assert(entry, `${landmark.mapId} door ${landmark.at.x},${landmark.at.y} has no sprite in `
      + 'landmarks.json -- the blocker cannot be derived from art that is not there');

    if (EXEMPT_MAP_IDS.has(landmark.mapId)) {
      report.push({ mapId: landmark.mapId, slug: entry.slug, skipped: 'owner-exempt act gate',
        blocked: 0, footprint: 0, gateway: { ...landmark.exit }, approach: null });
      continue;
    }

    const footprint = spriteFootprintCells(entry, px);
    assert(footprint.length > 0, `${entry.slug} eroded to nothing -- sprite alpha is too thin`);
    const inFootprint = new Set(footprint.map(cell => `${cell.x},${cell.y}`));
    assert(inFootprint.has(`${landmark.at.x},${landmark.at.y}`),
      `${landmark.mapId}'s own door cell is not inside its sprite footprint -- the manifest cell `
      + 'and the plate door have come apart');

    // The single gateway: the first preferred side that is walkable BEFORE any stamping, so the
    // choice is made against the owner's terrain rather than against this pass's own output.
    let gateway = null;
    let approach = null;
    for (const [dx, dy] of APPROACH_PREFERENCE) {
      const point = { x: landmark.at.x + dx, y: landmark.at.y + dy };
      if (!walkable(point.x, point.y)) continue;
      gateway = point;
      approach = dy === 1 ? 'S' : dy === -1 ? 'N' : dx === 1 ? 'E' : 'W';
      break;
    }
    assert(gateway, `${landmark.mapId} has no walkable side at all -- unenterable before blocking`);

    let blocked = 0;
    for (const cell of footprint) {
      if (!inside(cell.x, cell.y)) continue;
      if (cell.x === landmark.at.x && cell.y === landmark.at.y) continue;      // the door
      if (cell.x === gateway.x && cell.y === gateway.y) continue;             // the one entrance
      if (!walkable(cell.x, cell.y)) continue;   // already sea, forest, mountain or another door
      setTile(cell.x, cell.y, BLOCKER_TILE);
      stamped.push({ x: cell.x, y: cell.y });
      blocked += 1;
    }

    landmark.approaches = [{ ...gateway }];
    landmark.exit = { ...gateway };
    report.push({ mapId: landmark.mapId, slug: entry.slug, skipped: null,
      blocked, footprint: footprint.length, gateway: { ...gateway }, approach });
  }

  // Sprites with no door draw nothing (dq-tiles.js:2250 withholds them), so there is no art at
  // those cells to walk on. Recorded rather than silently dropped.
  const doorCells = new Set(plate.landmarks.map(l => `${l.at.x},${l.at.y}`));
  const undrawn = manifest.landmarks
    .filter(entry => !doorCells.has(`${entry.cell[0]},${entry.cell[1]}`))
    .map(entry => entry.slug);

  stamped.sort((left, right) => left.y - right.y || left.x - right.x);
  plate.landmarkBlockers = stamped;
  rebuildDerived(plate);
  return { landmarks: report, undrawn, blockerTile: BLOCKER_TILE, heroFootPx: HERO_FOOT_PX };
}

/* rows, safeCandidates and plateSha256 are all functions of `tiles`, so they are re-derived here
   by the same rules act1_owner_paint_plate.mjs used -- a stale one of these is exactly the class
   of bug the plate hash exists to catch. */
function rebuildDerived(plate) {
  const [minX, minY, maxX, maxY] = plate.bounds;
  const { tiles } = plate;
  const walkable = (x, y) => x >= minX && x <= maxX && y >= minY && y <= maxY
    && !BLOCKED.has(tiles[y - minY][x - minX]);

  const bytes = [];
  plate.rows = tiles.map(row => {
    let encoded = '';
    for (const tile of row) {
      assert(Number.isInteger(tile) && tile >= 0 && tile < 36, `invalid runtime tile ${tile}`);
      bytes.push(tile);
      encoded += tile.toString(36);
    }
    return encoded;
  });

  const SAFE_STRIDE = 8;
  const seen = new Set();
  const safeCandidates = [];
  const pushSafe = point => {
    const key = `${point.x},${point.y}`;
    if (seen.has(key)) return;
    seen.add(key);
    safeCandidates.push({ x: point.x, y: point.y });
  };
  for (const landmark of plate.landmarks) {
    for (const approach of landmark.approaches) if (walkable(approach.x, approach.y)) pushSafe(approach);
  }
  for (let y = minY; y <= maxY; y += 1) {
    if ((y - minY) % SAFE_STRIDE !== 0) continue;
    for (let x = minX; x <= maxX; x += 1) {
      if ((x - minX) % SAFE_STRIDE !== 0) continue;
      if (walkable(x, y)) pushSafe({ x, y });
    }
  }
  safeCandidates.sort((left, right) => left.y - right.y || left.x - right.x);
  assert(safeCandidates.length > 0, 'blocking emptied the relocation candidate set');
  plate.safeCandidates = safeCandidates;

  plate.plateSha256 = createHash('sha256').update(Buffer.from(bytes)).digest('hex');
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const manifest = loadLandmarkManifest();
  console.log(`ACT 1 LANDMARK FOOTPRINTS (hero contact disc r=${HERO_FOOT_PX} px, alpha>=${ALPHA_SOLID}):`);
  for (const entry of manifest.landmarks) {
    const cells = spriteFootprintCells(entry, manifest.worldPxPerCell);
    console.log(`  ${entry.slug.padEnd(18)} ${String(entry.size).padStart(3)}px cell `
      + `${entry.cell[0]},${entry.cell[1]}  ${String(cells.length).padStart(2)} cells  `
      + cells.map(c => `${c.x},${c.y}`).join(' '));
  }
}
