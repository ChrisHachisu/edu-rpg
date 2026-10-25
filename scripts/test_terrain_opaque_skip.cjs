'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { test } = require('node:test');

const source = fs.readFileSync(path.join(__dirname, '../public/dq-tiles.js'), 'utf8');
const start = source.indexOf('function a1aOpaqueBaseSpans(');
assert.notEqual(start, -1, 'missing production interval helper');
const end = source.indexOf('\n  }', start);
assert.notEqual(end, -1, 'missing production interval helper terminator');
const helper = source.slice(start, end + '\n  }'.length);
const spansFor = (rects, alpha, py, width) => vm.runInNewContext(`${helper}\na1aOpaqueBaseSpans(rects,alpha,py,width)`, { rects, alpha, py, width });
const jumpStart = source.indexOf('function a1aOpaqueSkipEnd(');
assert.notEqual(jumpStart, -1, 'missing production sample-grid helper');
const jumpEnd = source.indexOf('\n  }', jumpStart);
assert.notEqual(jumpEnd, -1, 'missing production sample-grid helper terminator');
const skipEnd = source.slice(jumpStart, jumpEnd + '\n  }'.length);
const drawableStart = source.indexOf('function a1aDrawableOpaqueBaseRects(');
assert.notEqual(drawableStart, -1, 'missing production drawable-base guard');
const drawableEnd = source.indexOf('\n  }', drawableStart);
assert.notEqual(drawableEnd, -1, 'missing production drawable-base guard terminator');
const drawableGuard = source.slice(drawableStart, drawableEnd + '\n  }'.length);
const drawableFor = (args) => vm.runInNewContext(`${drawableGuard}\na1aDrawableOpaqueBaseRects(scene,rects,alpha,sprites,texState,textures,glLost,underpaint,required)`, args);
const rect = (id, dx, dy, w, h, base = true, northOnly = false) => ({ c: { id }, rec: { base: base ? {} : null }, dx, dy, w, h, northOnly });

test('uncovered rows and windows retain all fallback work', () => {
  assert.deepEqual(JSON.parse(JSON.stringify(spansFor([], {}, 0, 20))), []);
  assert.deepEqual(JSON.parse(JSON.stringify(spansFor([rect('a', 2, 4, 6, 3)], { a: false }, 3, 20))), []);
  assert.deepEqual(JSON.parse(JSON.stringify(spansFor([rect('a', 2, 0, 6, 3)], { a: false }, 1, 20))),
    [{ x0: 2, x1: 8 }]);
});

test('only loaded, explicitly opaque base textures suppress samples', () => {
  const rects = [rect('opaque', 2, 0, 4, 2), rect('alpha', 8, 0, 4, 2), rect('unknown', 14, 0, 4, 2), rect('missing', 20, 0, 4, 2, false), rect('north', 26, 0, 4, 2, true, true)];
  const spans = spansFor(rects, { opaque: false, alpha: true }, 0, 40);
  assert.deepEqual(JSON.parse(JSON.stringify(spans)), [{ x0: 2, x1: 6 }]);
});

test('overlap merges and negative/off-window intervals clip to the row bounds', () => {
  const rects = [rect('left', -5, 0, 9, 3), rect('middle', 2, 0, 8, 3), rect('right', 14, 0, 20, 3)];
  const spans = spansFor(rects, { left: false, middle: false, right: false }, 1, 24);
  assert.deepEqual(JSON.parse(JSON.stringify(spans)), [{ x0: 0, x1: 10 }, { x0: 14, x1: 24 }]);
});

test('window offset rows use half-open vertical coverage', () => {
  const rects = [rect('a', 10, -2, 5, 4), rect('b', 2, 5, 5, 2)];
  const alpha = { a: false, b: false };
  assert.deepEqual(JSON.parse(JSON.stringify(spansFor(rects, alpha, 1, 30))), [{ x0: 10, x1: 15 }]);
  assert.deepEqual(JSON.parse(JSON.stringify(spansFor(rects, alpha, 2, 30))), []);
  assert.deepEqual(JSON.parse(JSON.stringify(spansFor(rects, alpha, 5, 30))), [{ x0: 2, x1: 7 }]);
});

test('fractional clip edges advance past every covered sample without looping', () => {
  const lastCoveredSample = vm.runInNewContext(`${skipEnd}\na1aOpaqueSkipEnd(4.5,4)`);
  assert.equal(lastCoveredSample, 4);
  const visited = [];
  for (let px = 0, guard = 0; px < 12 && guard < 8; px += 4, guard++) {
    if (px >= 0 && px < 4.5) { px = lastCoveredSample; continue; }
    visited.push(px);
  }
  assert.deepEqual(visited, [8]);
});

test('opaque coverage requires a current scene sprite and registered texture', () => {
  const scene = {};
  const textures = { exists: (key) => key === 'a1a_base_live' };
  const liveSprite = { visible: true, scene, texture: { key: 'a1a_base_live' } };
  const args = { scene, rects: [rect('live', 0, 0, 8, 8)], alpha: { live: false },
    sprites: { a1a_base_live: liveSprite }, texState: { a1a_base_live: 1 }, textures,
    glLost: false, underpaint: {}, required: false };
  assert.equal(drawableFor(args).length, 1);
  assert.equal(drawableFor({ ...args, sprites: {} }).length, 0, 'queued texture without a sprite retains fallback');
  assert.equal(drawableFor({ ...args, texState: {} }).length, 0, 'evicted texture retains fallback');
  assert.equal(drawableFor({ ...args, textures: { exists: () => false } }).length, 0, 'removed texture retains fallback');
  assert.equal(drawableFor({ ...args, sprites: { a1a_base_live: { ...liveSprite, visible: false } } }).length, 1,
    'existing same-scene image will be made visible by the immediately following placement pass');
  assert.equal(drawableFor({ ...args, glLost: true }).length, 0, 'lost context retains fallback');
});

test('substrate coverage skips only with a ready matching cached mask', () => {
  const scene = {}, sprite = { visible: true, scene, texture: { key: 'a1a_base_live' } };
  const underpaint = { spec: {}, image: {}, status: 'ready', scene, sprite: { visible: true },
    maskScene: scene, maskKey: 'live', maskTexture: {} };
  const args = { scene, rects: [rect('live', 0, 0, 8, 8)], alpha: { live: false },
    sprites: { a1a_base_live: sprite }, texState: { a1a_base_live: 1 },
    textures: { exists: (key) => key === 'a1a_base_live' || key === 'a1a_underpaint_mask' },
    glLost: false, underpaint, required: true };
  assert.equal(drawableFor(args).length, 1);
  assert.equal(drawableFor({ ...args, underpaint: { ...underpaint, maskKey: 'stale' } }).length, 0,
    'mask rebuild or recovery keeps fallback until the exact live-base mask is known');
  assert.equal(drawableFor({ ...args, underpaint: { ...underpaint, status: 'loading' } }).length, 0,
    'unready required substrate keeps fallback');
});
