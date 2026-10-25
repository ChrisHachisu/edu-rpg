#!/usr/bin/env node

// Matte/alpha cleanup changes rendered landmark pixels, not the frozen collision footprint.
// The generator reads hash-pinned r1 collision sprites; this test proves its whole geometry output
// still matches the current live map and that the two cleaned r2 sprites are not its inputs.
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { buildAct1OwnerPaintPlate } from './act1_owner_paint_plate.mjs';
import {
  applyLandmarkFootprints,
  COLLISION_RUNTIME,
  COLLISION_SPRITE_SHA256,
  loadLandmarkManifest,
} from './act1_landmark_footprints.mjs';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const EXPECTED_LIVE_MAP_SHA256 =
  'fb466fc6dbe7e05ccbb209c70867cacf4f903d55837ea69ca716e81f7196c96f';
const assert = (condition, message) => {
  if (!condition) throw new Error(`Act 1 collision/art separation: ${message}`);
};
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');

const livePath = resolve(ROOT, 'public/act1-world-map.js');
const liveBytes = readFileSync(livePath);
assert(sha256(liveBytes) === EXPECTED_LIVE_MAP_SHA256,
  'current live map bytes changed; re-review collision authority before updating this pin');
const live = liveBytes.toString('utf8');
const capture = (pattern, label) => {
  const match = live.match(pattern);
  assert(match, `unable to read ${label} from current live map`);
  return match[1];
};
const bounds = JSON.parse(`[${capture(/var BOUNDS = \[([^\]]+)\];/, 'BOUNDS')}]`);
const rows = [...capture(/var ROWS = \[(.*?)\n  \];/s, 'ROWS').matchAll(/'([0-9a-z]+)'/g)]
  .map(match => match[1]);
const blockers = JSON.parse(capture(/var LANDMARK_BLOCKERS = (\[.*?\]);/, 'LANDMARK_BLOCKERS'));

const plate = buildAct1OwnerPaintPlate();
const footprintProof = applyLandmarkFootprints(plate);
loadLandmarkManifest(); // Executes the r1 runtime, landmark manifest, and all nine sprite hash guards.
assert(JSON.stringify(plate.bounds) === JSON.stringify(bounds), 'bounds differ from live map');
assert(JSON.stringify(plate.rows) === JSON.stringify(rows), 'full ROWS differ from live map');
assert(JSON.stringify(plate.landmarkBlockers) === JSON.stringify(blockers),
  'full landmark blocker list differs from live map');
assert(footprintProof.landmarks.length === 8, 'expected all eight shipped landmark footprints');

// These approved decorative fixes alter edge alpha but must not become geometry inputs.
for (const filename of ['sunken-cellar.png', 'millbrook.png']) {
  const visualBytes = readFileSync(resolve(ROOT, 'public/act1-hifi/landmarks', filename));
  const collisionBytes = readFileSync(resolve(COLLISION_RUNTIME, 'landmarks', filename));
  assert(sha256(collisionBytes) === COLLISION_SPRITE_SHA256[filename],
    `${filename} collision-only source pin does not match`);
  assert(sha256(visualBytes) !== sha256(collisionBytes),
    `${filename} no longer exercises the art/collision separation regression`);
}

console.log(`ACT 1 LANDMARK COLLISION AUTHORITY PASS: live map ${EXPECTED_LIVE_MAP_SHA256}; `
  + `${rows.length} rows and ${blockers.length} blocker cells reproduce exactly; `
  + 'decorative Sunken Cellar/Millbrook alpha is excluded from collision generation');
