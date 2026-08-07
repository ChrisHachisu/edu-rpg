#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';

const ROOT = process.cwd();
const BUNDLE_SHA = 'a56026574b42168985b353e4cee824562716af83f92d03f408df04eac9127381';
const DQ_SHA = 'f0414cf7a12fcd08a045ac79dc0b99d74dca5c2195d79ec0e57eaf53573040a1';
const RAW_SHA = '97f0b936946695b5ce2eb073df4b9905e680942b299a5f87f1bf5c0544b96723';
const WINDOWS = {
  crystal: { bounds: [144, 288, 176, 312], sha: '25b0434154cb357118ed75a46f2404622e24f1ff4ac333eea326999fb246fb08' },
  shadow: { bounds: [252, 192, 268, 240], sha: 'a30e4704a9c6c3fd7b34db090fec88f572fd4390292f243ac7b376c614aced9b' },
  volcanic: { bounds: [144, 103, 176, 117], sha: '5587934e6882ce4ffc5ca99229e61527f57f5ad3343c6c6e412bb74ad7ee6f08' },
};
/* THE ACT 5 HASH MOVED ON 2026-08-07, and only that one. Tile 3 (tree) joined OW_BLOCK so the
   hero would stop walking through forests, and OW_BLOCK is also what owReach floods with -- so
   the "reachable before" set that the orphan gate compares against got smaller everywhere. From
   the act1, act2 and act3-4 starts that changed nothing at all (0 cells; only the reported
   reachable counts move, which is the definitional change). From the act5 start it shrank the
   before-set from 14,131 to 10,511 cells, and a fill can only be reverted for cutting a corridor
   that was reachable BEFORE -- so 40 fewer reverts survive (157 -> 117) and 52 cells settle
   differently: 50 more grass/tree cells consolidate into the massifs they were embedded in
   (0->4 x21, 3->4 x29) and 2 go the other way.

   Why this is a re-pin and not a regression: both safety gates still pass, all 53 reachable
   landmarks are preserved with none lost and none gained, and none of the three invariant
   corridor windows below is touched (every changed cell lies in x18-106, y80-120). The shipped
   Act 1 map -- the one the owner plate, the baked collision field and the minimap are all built
   on -- is the act1/act2 hash, and it is byte-identical to what it was. */
const STARTS = [
  { at: [60, 341], component: 'act1', sha: '2d82e050b51095280b74395db8656aed52ae919206385827502265f6e0a65202' },
  { at: [200, 321], component: 'act2', sha: '2d82e050b51095280b74395db8656aed52ae919206385827502265f6e0a65202' },
  { at: [260, 197], component: 'act3-4', sha: '678650a6bb3851523debb130edd25064c2777a07b03d7058800f1a4ac4e35d57' },
  { at: [100, 151], component: 'act5', sha: '59d03760f2080ac538eb801eb5351be18f12f9d681673fc832af51190262e85a' },
];

const sha = value => createHash('sha256').update(value).digest('hex');
const assert = (condition, message) => { if (!condition) throw new Error(message); };

function extractRawTerrain(bundle) {
  const helper = bundle.indexOf('function Js(n)');
  const generator = bundle.indexOf('function Ep(n, x) {');
  const path = bundle.indexOf('\nfunction ', generator + 20);
  const afterPath = bundle.indexOf('\nfunction ', path + 20);
  assert(helper >= 0 && generator >= 0 && path >= 0 && afterPath >= 0, 'bundle generator slices missing');
  const code = bundle.slice(helper, generator) + bundle.slice(generator, path) + bundle.slice(path, afterPath);
  return Function(`"use strict"; const Gr=[]; ${code}; return Ep(320,400);`)();
}

function extractConsolidator(dq) {
  const start = dq.indexOf('var MIN_KEEP=6');
  const end = dq.indexOf('function inRM(', start);
  assert(start >= 0 && end > start, 'dq consolidator slice missing');
  return Function('window', `${dq.slice(start, end)}; return consolidateMapData;`)({});
}

function windowSnapshot(map, bounds) {
  const [minX, minY, maxX, maxY] = bounds;
  const bytes = [];
  const rows = [];
  for (let y = minY; y <= maxY; y += 1) {
    let row = '';
    for (let x = minX; x <= maxX; x += 1) {
      bytes.push(map[y][x]);
      row += map[y][x].toString(36);
    }
    rows.push(row);
  }
  return { sha256: sha(Buffer.from(bytes)), rows };
}

const bundleBytes = readFileSync(`${ROOT}/dist/assets/index-BhoGQRaA.js`);
const publicDq = readFileSync(`${ROOT}/public/dq-tiles.js`);
const distDq = readFileSync(`${ROOT}/dist/dq-tiles.js`);
assert(sha(bundleBytes) === BUNDLE_SHA, 'bundle hash mismatch');
assert(publicDq.equals(distDq), 'public/dist dq-tiles twins differ');
assert(sha(publicDq) === DQ_SHA, 'dq-tiles hash mismatch');

const raw = extractRawTerrain(bundleBytes.toString('utf8'));
assert(sha(Buffer.from(raw.flat())) === RAW_SHA, 'pre-override generator hash mismatch');
const results = [];
for (const start of STARTS) {
  const map = raw.map(row => row.slice());
  const stats = extractConsolidator(publicDq.toString('utf8'))({
    mapData: map,
    heroTileX: start.at[0],
    heroTileY: start.at[1],
  });
  const finalSha = sha(Buffer.from(map.flat()));
  assert(finalSha === start.sha, `${start.component} final hash mismatch`);
  assert(stats.safe, `${start.component} dq safety gate failed`);
  const windows = Object.fromEntries(Object.entries(WINDOWS).map(([name, expected]) => {
    const snapshot = windowSnapshot(map, expected.bounds);
    assert(snapshot.sha256 === expected.sha, `${start.component} ${name} window mismatch`);
    return [name, snapshot];
  }));
  results.push({ start, finalSha, stats, windows });
}

assert(new Set(results.map(result => result.finalSha)).size === 3,
  'final map must remain explicitly state-dependent rather than canonicalized');
if (process.argv.includes('--check')) {
  console.log('SHIPPED OVERWORLD DQ REPLAY PASS: state-dependent whole maps and invariant final corridor windows');
} else {
  console.log(JSON.stringify({ status: 'PASS', dqSha256: DQ_SHA, results }, null, 2));
}
