#!/usr/bin/env node

import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { copyFile, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { EXPECTED_STATIC_INDEX_SHA, staticIndexFrom } from './build_static_index.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const RUNTIME = path.join(
  ROOT,
  'design/review/overworld-art-blueprint/act-by-act/act1/runtime-v2',
);
const R26_RUNTIME = path.join(RUNTIME, 'act1-final-art-geometry-r26/runtime');
const TARGETS = [path.join(ROOT, 'public/act1-hifi'), path.join(ROOT, 'dist/act1-hifi')];
const EXPECTED_MANIFEST_SHA = 'cb3865ba5f51d27dc025594df6a487dc97728f76dbecb98bebf172e75dd4def8';
// Re-pinned 2026-08-06. This had drifted to a sha the repo could no longer produce: the shipped
// shell moved from the 4-way d-pad to the analog stick, but only dist/index.html was edited --
// and dist/ is gitignored, so the shipped shell had no tracked source at all. The root
// index.html here still carried the d-pad, `npm run promote:act1-r26` would have thrown on this
// assert, and any HUD edit to dist/index.html was invisible to git and would have been lost the
// next time a worktree seeded its dist by copying someone else's. Root index.html has been
// brought back into line -- it now differs from dist/index.html by exactly the seven rewrites
// and nothing else -- so the shell is reproducible again.
//
// 2026-08-07: the seven rewrites and EXPECTED_STATIC_INDEX_SHA moved to
// scripts/build_static_index.mjs and are imported above. This script was the only thing that knew
// how to derive the shell, but nothing ran it -- `npm run promote:act1-r26` is SUPERSEDED and
// exits 1 -- so a fresh worktree still had no way to produce dist/index.html and seeded it by
// copying a sibling. That is how three vintages ended up in circulation. Extracting the transform
// lets scripts/build-dist.sh and the ship gate use it without running this cutover, and keeps ONE
// definition of the shell rather than a second copy that would drift from this one.
const EXPECTED_DQ_SHA = 'fcd746d1be14cc1958b4ae710a75e36c0ee2a5ae141a82e63272ba7169cd688b';
const EXPECTED_ACT1_MAP_SHA = '7a1037634692a88c4b6cdf09642f25e4375098de452cb7b4a15808cd4c96fef7';

const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
const manifestBytes = await readFile(path.join(R26_RUNTIME, 'manifest.json'));
assert.equal(sha256(manifestBytes), EXPECTED_MANIFEST_SHA, 'locked manifest bytes changed');
const manifest = JSON.parse(manifestBytes);
assert.equal(manifest.revision, 11, 'locked manifest revision changed');
assert.equal(manifest.detailRegions.length, 0, 'R26 must not export stale detail overlays');

const files = [
  [{ root: RUNTIME, relative: 'index.html' }, 'runtime.html'],
  [{ root: R26_RUNTIME, relative: 'manifest.json' }, 'manifest.json'],
  [{ root: R26_RUNTIME, relative: 'walkable-regions-r26.json' }, 'walkable-regions-v1.json'],
  [{ root: RUNTIME, relative: 'walkable-polygons.js' }, 'walkable-polygons.js'],
  [{ root: RUNTIME, relative: 'walkable-route-state.js' }, 'walkable-route-state.js'],
  [{ root: RUNTIME, relative: 'path-corridor.js' }, 'path-corridor.js'],
  [{ root: RUNTIME, relative: 'hero-g3/hero-act1-female-walk-8x3-64-g3.png' },
    'hero-g3/hero-act1-female-walk-8x3-64-g3.png'],
];
for (const chunk of manifest.chunks) {
  for (const key of ['base', 'water', 'occlusion']) {
    files.push([{ root: R26_RUNTIME, relative: chunk[key] }, chunk[key]]);
  }
}

async function filesUnder(root, prefix = '') {
  const found = [];
  for (const entry of await readdir(root, { withFileTypes: true })) {
    const relative = path.join(prefix, entry.name);
    if (entry.isDirectory()) found.push(...await filesUnder(path.join(root, entry.name), relative));
    else if (entry.isFile()) found.push(relative);
  }
  return found;
}

const expectedTargets = new Set([...files.map(([, target]) => target), 'adapter.js']);
for (const targetRoot of TARGETS) {
  await mkdir(targetRoot, { recursive: true });
  for (const relative of await filesUnder(targetRoot)) {
    if (!expectedTargets.has(relative)) await rm(path.join(targetRoot, relative));
  }
}

let copiedBytes = 0;
for (const [sourceEntry, targetRelative] of files) {
  assert(!sourceEntry.relative.startsWith('..'), `runtime asset escapes source: ${sourceEntry.relative}`);
  const source = path.join(sourceEntry.root, sourceEntry.relative);
  const sourceBytes = await readFile(source);
  copiedBytes += sourceBytes.byteLength;
  for (const targetRoot of TARGETS) {
    const target = path.join(targetRoot, targetRelative);
    await mkdir(path.dirname(target), { recursive: true });
    await copyFile(source, target);
    assert.equal(sha256(await readFile(target)), sha256(sourceBytes), `copy drift: ${targetRelative}`);
  }
}

const adapterSource = path.join(ROOT, 'public/act1-hifi/adapter.js');
const adapterTarget = path.join(ROOT, 'dist/act1-hifi/adapter.js');
await copyFile(adapterSource, adapterTarget);
assert.equal(sha256(await readFile(adapterTarget)), sha256(await readFile(adapterSource)));

const authoredIndex = (await readFile(path.join(ROOT, 'index.html'), 'utf8'));
const staticIndex = staticIndexFrom(authoredIndex);
assert.equal(sha256(staticIndex), EXPECTED_STATIC_INDEX_SHA, 'static shell identity changed');
await writeFile(path.join(ROOT, 'dist/index.html'), staticIndex);
for (const [relative, expectedSha] of [
  ['dq-tiles.js', EXPECTED_DQ_SHA],
  ['act1-world-map.js', EXPECTED_ACT1_MAP_SHA],
]) {
  const source = path.join(ROOT, 'public', relative);
  assert.equal(sha256(await readFile(source)), expectedSha, `${relative} identity changed`);
  await copyFile(source, path.join(ROOT, 'dist', relative));
}

console.log(JSON.stringify({
  manifestRevision: manifest.revision,
  manifestSha256: EXPECTED_MANIFEST_SHA,
  runtimeFiles: files.length,
  bytesPerTarget: copiedBytes,
  targets: TARGETS.map(target => path.relative(ROOT, target)),
}, null, 2));
