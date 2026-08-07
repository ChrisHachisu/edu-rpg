#!/usr/bin/env node
/* Bake the Act 1 overworld walkable distance field.
 *
 * WHY THIS EXISTS
 *   dq-tiles.js derives overworld collision from the SAME continuous fields drawTerrain paints
 *   with, so the blocker sits on the painted coastline instead of the tile lattice. Correct, and
 *   measured at 434-492 ms per rebuild on device (mean ~470 ms, six samples, two launches) against
 *   a 40 ms budget -- one frozen half-second every 2.2 s of walking. Split by phase in Node:
 *   the per-pixel waterField/mountainField evaluation is ~87% of it and the chamfer the rest, so
 *   a cheaper mask alone could not have reached budget either.
 *
 *   The dungeons never had this problem because they READ a baked artefact (`<floor>-walk.png`)
 *   instead of evaluating a field. This is the overworld's version of that artefact, and it goes
 *   one step further: it bakes the CHAMFER DISTANCE too, so the runtime's remaining work is a
 *   memcpy rather than two sweeps.
 *
 * WHAT IS BAKED
 *   Exactly what owmBuild() computes, evaluated once here instead of ~450 times a playthrough:
 *     b = waterField >= 0.50 || mountainField >= 0.50, minus bridge decks (tile 5)
 *     dist = chamfer-3-4 distance from every open pixel to the nearest b, in THIRDS of a pixel
 *   clamped to 255. 255 is chosen, not convenient: a1mFree's largest requirement is
 *   A1M_FOOT*A1M_CH + A1M_LEAN*A1M_CH = 48 thirds, so every value at or above 49 is already
 *   indistinguishable to the collider, and the clamp is set five times higher than that so
 *   a1mUnstick's "pick the candidate farthest from water" ranking keeps its ordering everywhere
 *   inside its 288 px search except deep inland -- where today's window chamfer already saturates
 *   at INF whenever the window holds no water at all.
 *
 *   SPARSE BY CELL, because half the plate is open sea and a third is inland. Each 48x48 map cell
 *   is one block, tagged FAR (every pixel at the clamp), BLOCKED (every pixel 0) or explicit.
 *   3,864 of 45,288 cells need explicit bytes; the other 41,424 are two sentinels in an index.
 *   That is 8.9 MB instead of the 104 MB a dense plate would be, and it is what makes the runtime
 *   assembly a fill/copy per cell rather than per pixel.
 *
 *   NOT A PNG, deliberately. Every other baked mask here is one, but they are all thresholded at
 *   >127 and so are immune to whatever a canvas does to their pixels on the way through. This
 *   carries EXACT distances, and `drawImage` + `getImageData` is not a documented byte-preserving
 *   path on iOS (colour management, premultiplication). A raw buffer read with XMLHttpRequest --
 *   the same transport act1-hifi/manifest.json and act1-dungeon-floors.json already use -- has no
 *   such question, and costs no decode at all.
 *
 * THE PLATE
 *   ACT1_BOUNDS grown by 40 cells and clipped to the map. 40 is derived, not picked: the render
 *   window is [X0, X0+winW) with X0 = 12*floor((floor(camX/48)-12)/12) and winW = ceil(vw/48)+24,
 *   so relative to the hero's cell it spans at most [-ceil(vw/96)-23, +vw/96+13]. At vw = 1366
 *   (the widest iPad viewport this ships to) that is [-38, +28]. Cells outside the plate carry a
 *   third sentinel and the runtime falls back to the analytic build for that window rather than
 *   guessing -- fallback-safe, like every other layer in dq-tiles.js.
 *
 * PROVENANCE
 *   The bake is a function of (the frozen bundle's terrain generator, dq-tiles.js's consolidator,
 *   dq-tiles.js's field functions). All three are read here from the shipped files and hashed into
 *   the header, so `--check` catches a .bin left behind by a change to any of them without paying
 *   the 13 s recompute. dq-tiles.js's own sha is deliberately NOT pinned here: this script edits
 *   nothing and must keep working across every future edit to that file that does not touch a
 *   field.
 *
 *   bake_act1_overworld_walk.mjs             rebake public/act1-overworld-walk.bin
 *   bake_act1_overworld_walk.mjs --check     verify the .bin's provenance, write nothing
 *   bake_act1_overworld_walk.mjs --verify    rebuild the field and diff it against owmBuild()
 */

import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const OUTPUT = resolve(ROOT, 'public/act1-overworld-walk.bin');
const BUNDLE_PATH = resolve(ROOT, 'dist/assets/index-BhoGQRaA.js');
const DQ_PATH = resolve(ROOT, 'public/dq-tiles.js');

const BUNDLE_SHA256 = 'a56026574b42168985b353e4cee824562716af83f92d03f408df04eac9127381';
const FINAL_MAP_SHA256 = '2d82e050b51095280b74395db8656aed52ae919206385827502265f6e0a65202';
const MAP_WIDTH = 320, MAP_HEIGHT = 400;
const ACT1_START = [60, 341];
const ACT1_BOUNDS = [16, 218, 163, 399];

const TILE = 48;                 // world px per cell, dq-tiles.js's N
const FAR = 255;                 // the clamp, in chamfer thirds (see header)
const PLATE_PAD = 40;            // cells (see THE PLATE)
const GUARD = 4;                 // extra cells chamfered but not emitted, so plate blocks are exact
const HEADER = 64;
const SENT_FAR = 0xFFFF, SENT_BLOCKED = 0xFFFE, SENT_UNBAKED = 0xFFFD;
const MAGIC = 0x574F3141;        // 'A1OW' little-endian
const VERSION = 1;

const sha256 = value => createHash('sha256').update(value).digest('hex');
const assert = (condition, message) => { if (!condition) throw new Error(message); };

/* ---- the shipped source, sliced rather than re-implemented ----------------------------------
   Re-typing waterField here would be a SECOND sampler that can drift from the one that paints the
   coastline, which is the exact failure this whole feature exists to remove. So the functions are
   lifted verbatim out of public/dq-tiles.js by name and evaluated. They are all plain top-level
   functions inside that file's IIFE, so a brace scan from `\n  function NAME(` is unambiguous. */
function sliceFunction(source, name) {
  const start = source.indexOf(`\n  function ${name}(`);
  assert(start >= 0, `dq-tiles.js has no function ${name}`);
  let depth = 0, i = source.indexOf('{', start);
  assert(i >= 0, `function ${name} has no body`);
  for (let end = i; end < source.length; end += 1) {
    const c = source[end];
    if (c === '{') depth += 1;
    else if (c === '}') { depth -= 1; if (depth === 0) return source.slice(start + 1, end + 1); }
  }
  throw new Error(`unbalanced braces in ${name}`);
}
const FIELD_FUNCTIONS = ['_h', 'vnoise', 'et', 'fieldAt', 'waterField', 'mountainField',
  'buildMutedWater'];

function extractRawTerrain(bundle) {
  const helper = bundle.indexOf('function Js(n)');
  const generator = bundle.indexOf('function Ep(n, x) {');
  const path = bundle.indexOf('\nfunction ', generator + 20);
  const afterPath = bundle.indexOf('\nfunction ', path + 20);
  assert(helper >= 0 && generator >= 0 && path >= 0 && afterPath >= 0, 'bundle generator slices missing');
  const code = bundle.slice(helper, generator) + bundle.slice(generator, path) + bundle.slice(path, afterPath);
  return Function(`"use strict"; const Gr=[]; ${code}; return Ep(${MAP_WIDTH},${MAP_HEIGHT});`)();
}
function extractConsolidator(dq) {
  const start = dq.indexOf('var MIN_KEEP=6');
  const end = dq.indexOf('function inRM(', start);
  assert(start >= 0 && end > start, 'dq consolidator slice missing');
  return Function('window', `${dq.slice(start, end)}; return consolidateMapData;`)({});
}

/* The map the runtime actually holds: the frozen bundle's generator, then dq-tiles.js's
   consolidateMapData, which MUTATES tile 4 into the cluster shape mountainField reads. Pinned to
   FINAL_MAP_SHA256 for the same reason the snapshot extractor pins it -- a bake against a
   different map is a picture of terrain that is not there. */
function buildFinalMap(bundle, dq) {
  assert(sha256(bundle) === BUNDLE_SHA256, 'bundle hash mismatch');
  const raw = extractRawTerrain(bundle.toString('utf8'));
  const map = raw.map(row => row.slice());
  const stats = extractConsolidator(dq.toString('utf8'))({
    mapData: map, heroTileX: ACT1_START[0], heroTileY: ACT1_START[1],
  });
  assert(stats.safe, 'Act 1 dq safety gate failed');
  assert(map.length === MAP_HEIGHT && map.every(r => r.length === MAP_WIDTH), 'map dimensions');
  const bytes = Buffer.from(map.flat());
  assert(sha256(bytes) === FINAL_MAP_SHA256, 'final map hash mismatch');
  return { map, bytes };
}

// The runtime's identity check on the map it is handed. FNV-1a/32 rather than sha256 because the
// runtime has no synchronous crypto and this has to be cheap enough to run on every map swap.
function fnv1a32(bytes) {
  let h = 0x811c9dc5;
  for (let i = 0; i < bytes.length; i += 1) { h ^= bytes[i]; h = Math.imul(h, 0x01000193) >>> 0; }
  return h >>> 0;
}

function fieldSource(dq) {
  return FIELD_FUNCTIONS.map(name => sliceFunction(dq, name)).join('\n');
}
function provenance(dq, mapBytes) {
  return sha256(Buffer.concat([
    Buffer.from(BUNDLE_SHA256, 'hex'), mapBytes, Buffer.from(fieldSource(dq), 'utf8'),
    Buffer.from(`${TILE}|${FAR}|${PLATE_PAD}|${GUARD}|${VERSION}`, 'utf8'),
  ]));
}

// waterField/mountainField bound to this map, with dq-tiles.js's own MUTED small-lake suppression
// in force (et() consults it, and reskin() installs it before any field is ever sampled).
function fieldsFor(dq, map) {
  const src = fieldSource(dq);
  const make = new Function('window', 'map', 'N', `
    ${src}
    var MUTED_W = map[0].length;
    var MUTED = buildMutedWater(map, 12);
    return { et: et, waterField: waterField, mountainField: mountainField, muted: MUTED.size };
  `);
  return make({}, map, TILE);
}

function plateBounds() {
  return {
    x0: Math.max(0, ACT1_BOUNDS[0] - PLATE_PAD), y0: Math.max(0, ACT1_BOUNDS[1] - PLATE_PAD),
    x1: Math.min(MAP_WIDTH - 1, ACT1_BOUNDS[2] + PLATE_PAD),
    y1: Math.min(MAP_HEIGHT - 1, ACT1_BOUNDS[3] + PLATE_PAD),
  };
}

/* The field and the chamfer, over the plate grown by GUARD cells. GUARD exists so that every
   pixel of every EMITTED block sees its true nearest blocker: 4 cells is 192 px, well past the
   255-third (85 px) clamp, so a blocker just outside the computed region can never change an
   emitted value. */
function buildPlateDistance(fields, map) {
  const p = plateBounds();
  const gx0 = Math.max(0, p.x0 - GUARD), gy0 = Math.max(0, p.y0 - GUARD);
  const gx1 = Math.min(MAP_WIDTH - 1, p.x1 + GUARD), gy1 = Math.min(MAP_HEIGHT - 1, p.y1 + GUARD);
  const W = (gx1 - gx0 + 1) * TILE, H = (gy1 - gy0 + 1) * TILE;
  const dist = new Uint16Array(W * H), INF = 60000;
  const { et, waterField, mountainField } = fields;
  for (let y = 0; y < H; y += 1) {
    const wy = gy0 * TILE + y, row = y * W, ty = (wy / TILE) | 0;
    for (let x = 0; x < W; x += 1) {
      const wx = gx0 * TILE + x;
      let b = 0;
      if (waterField(map, wx, wy) >= 0.50) b = 1;
      if (!b && mountainField(map, wx, wy) >= 0.50) b = 1;
      if (b && et(map, (wx / TILE) | 0, ty) === 5) b = 0;
      dist[row + x] = b ? 0 : INF;
    }
  }
  for (let y = 0; y < H; y += 1) {
    const r = y * W;
    for (let x = 0; x < W; x += 1) {
      const i = r + x; let v = dist[i]; if (!v) continue;
      if (y > 0) {
        if (dist[i - W] + 3 < v) v = dist[i - W] + 3;
        if (x > 0 && dist[i - W - 1] + 4 < v) v = dist[i - W - 1] + 4;
        if (x < W - 1 && dist[i - W + 1] + 4 < v) v = dist[i - W + 1] + 4;
      }
      if (x > 0 && dist[i - 1] + 3 < v) v = dist[i - 1] + 3;
      dist[i] = v;
    }
  }
  for (let y = H - 1; y >= 0; y -= 1) {
    const r = y * W;
    for (let x = W - 1; x >= 0; x -= 1) {
      const i = r + x; let v = dist[i]; if (!v) continue;
      if (y < H - 1) {
        if (dist[i + W] + 3 < v) v = dist[i + W] + 3;
        if (x < W - 1 && dist[i + W + 1] + 4 < v) v = dist[i + W + 1] + 4;
        if (x > 0 && dist[i + W - 1] + 4 < v) v = dist[i + W - 1] + 4;
      }
      if (x < W - 1 && dist[i + 1] + 3 < v) v = dist[i + 1] + 3;
      dist[i] = v;
    }
  }
  return { dist, W, H, gx0, gy0, plate: p };
}

function bake(bundle, dq) {
  const { map, bytes } = buildFinalMap(bundle, dq);
  const fields = fieldsFor(dq, map);
  const { dist, W, gx0, gy0, plate } = buildPlateDistance(fields, map);

  const index = new Uint16Array(MAP_WIDTH * MAP_HEIGHT).fill(SENT_UNBAKED);
  const blocks = [];
  const cell = new Uint8Array(TILE * TILE);
  for (let cy = plate.y0; cy <= plate.y1; cy += 1) {
    for (let cx = plate.x0; cx <= plate.x1; cx += 1) {
      const oy = (cy - gy0) * TILE, ox = (cx - gx0) * TILE;
      let allFar = true, allZero = true;
      for (let y = 0; y < TILE; y += 1) {
        const r = (oy + y) * W + ox;
        for (let x = 0; x < TILE; x += 1) {
          const v = dist[r + x], c = v > FAR ? FAR : v;
          cell[y * TILE + x] = c;
          if (c < FAR) allFar = false;
          if (c !== 0) allZero = false;
        }
      }
      const at = cy * MAP_WIDTH + cx;
      if (allZero) index[at] = SENT_BLOCKED;
      else if (allFar) index[at] = SENT_FAR;
      else { assert(blocks.length < SENT_UNBAKED, 'too many explicit blocks for a u16 index');
             index[at] = blocks.length; blocks.push(Uint8Array.from(cell)); }
    }
  }

  const out = Buffer.alloc(HEADER + index.byteLength + blocks.length * TILE * TILE);
  out.writeUInt32LE(MAGIC, 0);
  out.writeUInt16LE(VERSION, 4);
  out.writeUInt16LE(TILE, 6);
  out.writeUInt16LE(MAP_WIDTH, 8);
  out.writeUInt16LE(MAP_HEIGHT, 10);
  out.writeUInt16LE(FAR, 12);
  out.writeUInt16LE(0, 14);
  out.writeUInt32LE(blocks.length, 16);
  out.writeUInt32LE(fnv1a32(bytes), 20);
  Buffer.from(provenance(dq, bytes), 'hex').copy(out, 32);
  // Written explicitly little-endian. The runtime maps the index straight through as a
  // Uint16Array view, which is host-endian -- true on every platform this ships to (arm64/x64),
  // and stated here rather than assumed silently.
  for (let i = 0; i < index.length; i += 1) out.writeUInt16LE(index[i], HEADER + i * 2);
  let at = HEADER + index.byteLength;
  for (const b of blocks) { out.set(b, at); at += b.length; }

  return { buffer: out, blocks: blocks.length, map, fields, dist, W, gx0, gy0, plate, index };
}

/* ---- the verification that matters ----------------------------------------------------------
   Not "does it load" but "does the collider see the same numbers". owmBuild() is re-implemented
   here from dq-tiles.js's own source the same way the fields are, run over real windows, and
   compared against what the runtime will assemble out of the .bin. The two agree exactly wherever
   the clamp is not in play, which is every value a1mFree, a1mNeed and a1mSlide can act on. */
/* The READER is dq-tiles.js's own, sliced out like the fields, so this compares the code that
   will actually run against the code it replaces -- not two re-implementations agreeing with each
   other. That mistake is exactly how a baked artefact drifts from its consumer. */
function runtimeReader(dq) {
  const body = ['owmBakeParse', 'owmAssemble'].map(n => sliceFunction(dq, n)).join('\n');
  return new Function('window', 'N', 'OWM_UNBAKED', 'OWM_BLOCKED', 'OWM_FARCELL', 'owmTileBlock', `
    ${body}
    return { parse: owmBakeParse, assemble: owmAssemble };
  `)({}, TILE, SENT_UNBAKED, SENT_BLOCKED, SENT_FAR, () => ({}));
}
function parse(buffer) {
  assert(buffer.readUInt32LE(0) === MAGIC && buffer.readUInt16LE(4) === VERSION, 'bad header');
  return { nBlocks: buffer.readUInt32LE(16), far: buffer.readUInt16LE(12),
           mapHash: buffer.readUInt32LE(20), provenance: buffer.subarray(32, 64).toString('hex') };
}
function owmBuildReference(dq, map, fields, X0, Y0, winW, winH) {
  const body = `${sliceFunction(dq, 'owmPresence')}\n${sliceFunction(dq, 'owmBuild')}`;
  const fn = new Function('window', 'map', 'N', 'et', 'waterField', 'mountainField', 'owmTileBlock', `
    ${body}
    return owmBuild;
  `)({}, map, TILE, fields.et, fields.waterField, fields.mountainField, () => ({}));
  return fn(map, X0, Y0, winW, winH);
}
function verify(dq, baked) {
  const reader = runtimeReader(dq);
  const ab = baked.buffer.buffer.slice(baked.buffer.byteOffset, baked.buffer.byteOffset + baked.buffer.length);
  const view = reader.parse(ab);
  assert(view, 'dq-tiles.js owmBakeParse refused the freshly baked .bin');
  assert(view.far === FAR && view.mapW === MAP_WIDTH && view.mapH === MAP_HEIGHT, 'parsed header mismatch');
  const windows = [];
  for (const [tx, ty, label] of [[91, 276, 'headland WORLD(91,276)'], [60, 341, 'ACT1_START'],
    [80, 300, 'mid'], [40, 240, 'nw'], [120, 360, 'se'], [100, 250, 'ne'], [30, 380, 'sw']]) {
    const winW = Math.ceil(402 / TILE) + 24, winH = Math.ceil(702 / TILE) + 24;
    const cx = Math.floor((tx * TILE + 24 - 201) / TILE) - 12, cy = Math.floor((ty * TILE + 24 - 351) / TILE) - 12;
    const X0 = Math.max(0, Math.min(MAP_WIDTH - winW, Math.floor(cx / 12) * 12));
    const Y0 = Math.max(0, Math.min(MAP_HEIGHT - winH, Math.floor(cy / 12) * 12));
    windows.push({ label, X0, Y0, winW, winH });
  }
  let worst = 0, checked = 0;
  for (const w of windows) {
    const got = reader.assemble(view, w.X0, w.Y0, w.winW, w.winH);
    assert(got, `${w.label}: window not covered by the plate`);
    assert(got.ox === w.X0 * TILE && got.oy === w.Y0 * TILE && got.W === w.winW * TILE,
      `${w.label}: assembled window geometry disagrees with the request`);
    const want = owmBuildReference(dq, baked.map, baked.fields, w.X0, w.Y0, w.winW, w.winH);
    let diff = 0, observable = 0, deepest = -1;
    const cw = w.winW * TILE, ch = w.winH * TILE;
    for (let i = 0; i < got.dist.length; i += 1) {
      const a = got.dist[i], b = Math.min(want.dist[i], FAR);
      if (a === b) continue;
      diff += 1;
      if (a >= 64 && b >= 64) continue;                 // both far past anything the collider reads
      observable += 1;
      const y = (i / cw) | 0, x = i - y * cw;
      const depth = Math.min(x, y, cw - 1 - x, ch - 1 - y);
      if (depth > deepest) deepest = depth;
    }
    checked += got.dist.length;
    worst = Math.max(worst, deepest);
    console.log(`  ${w.label.padEnd(24)} X0=${String(w.X0).padStart(3)} Y0=${String(w.Y0).padStart(3)} `
      + `diffs=${diff} observable=${observable} deepest=${deepest < 0 ? 'n/a' : deepest + ' px from the window rim'}`);
  }
  /* WHY THIS BOUND AND NOT ZERO. owmBuild chamfers the window in ISOLATION, so a pixel near the
     window rim is told the nearest water is far away when in truth it is just outside the frame.
     The bake has no frame and reports the true distance, so the two differ in a thin band along
     the rim -- and there the bake is the CORRECT one. It cannot reach the collider: the window
     geometry puts the hero at least 232 px inside the nearest rim (the right rim at the worst of
     the 12 alignments; 370/777/927 px for bottom/left/top), a1mFree refuses any point outside
     [1, W-2], and a1mUnstick searches 288 px. RIM_SAFE is set well under that minimum clearance,
     so anything deeper than it is a real disagreement and fails. */
  const RIM_SAFE = 64;
  assert(worst < RIM_SAFE, `baked field disagrees with owmBuild ${worst} px inside the window rim, `
    + `past the ${RIM_SAFE} px the rim band is allowed`);
  console.log(`VERIFY PASS: ${checked} px compared across ${windows.length} windows; every `
    + `disagreement the collider could read lies within ${worst} px of the window rim, which is `
    + `${RIM_SAFE}+ px outside anything a1mFree or a1mUnstick can reach`);
}

const args = process.argv.slice(2);
const mode = args[0] || '--bake';
assert(args.length <= 1 && ['--bake', '--check', '--verify'].includes(mode),
  'usage: bake_act1_overworld_walk.mjs [--bake|--check|--verify]');

const bundle = readFileSync(BUNDLE_PATH);
const dq = readFileSync(DQ_PATH, 'utf8');

if (mode === '--check') {
  // Cheap: rebuild the INPUTS' digest, not the 108 M px field.
  const { bytes } = buildFinalMap(bundle, dq);
  const want = provenance(dq, bytes);
  const have = parse(readFileSync(OUTPUT));
  assert(have.provenance === want, 'act1-overworld-walk.bin is stale -- rerun bake_act1_overworld_walk.mjs');
  assert(have.mapHash === fnv1a32(bytes), 'baked map hash mismatch');
  console.log(`ACT 1 OVERWORLD WALK CHECK PASS: ${have.nBlocks} blocks, far=${have.far}, `
    + `provenance ${have.provenance.slice(0, 16)}`);
} else {
  const baked = bake(bundle, dq);
  if (mode === '--verify') { verify(dq, baked); }
  else {
    writeFileSync(OUTPUT, baked.buffer);
    console.log(`ACT 1 OVERWORLD WALK WRITTEN: ${baked.buffer.length} B, ${baked.blocks} explicit `
      + `blocks of ${(baked.plate.x1 - baked.plate.x0 + 1) * (baked.plate.y1 - baked.plate.y0 + 1)}, `
      + `plate [${baked.plate.x0},${baked.plate.y0}]..[${baked.plate.x1},${baked.plate.y1}]`);
  }
}
