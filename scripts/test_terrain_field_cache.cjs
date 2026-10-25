'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { test } = require('node:test');

const source = fs.readFileSync(path.join(__dirname, '../public/dq-tiles.js'), 'utf8');
const start = source.indexOf('var __DQ_FIELD_CACHE_VERSION__=');
assert.notEqual(start, -1, 'missing bounded terrain field cache');
const end = source.indexOf('\n  function pathField(', start);
assert.notEqual(end, -1, 'missing terrain field cache terminator');
const helper = source.slice(start, end);

function cacheHarness({ width = 320, height = 400, map } = {}) {
  const rows = map || Array.from({ length: height }, (_, y) =>
    Array.from({ length: width }, (_, x) => ((x * 13 + y * 7) % 5 === 0 ? 2 : ((x + y) % 7 === 0 ? 4 : 0))));
  const calls = { water: 0, mountain: 0 };
  const context = {
    window: {}, MUTED: null, MUTED_W: 0, N: 48,
    waterField(m, x, y) {
      calls.water++;
      const tx = Math.floor(x / 48), ty = Math.floor(y / 48);
      const tile = m[ty]?.[tx] ?? 0;
      const muted = tile === 2 && context.MUTED?.has(ty * context.MUTED_W + tx);
      const wiggle = typeof context.window.__DQ_WIGGLE__ === 'number' ? context.window.__DQ_WIGGLE__ : 0.26;
      return (muted ? 0 : tile === 2 ? 0.75 : 0.1) + wiggle * 0.001 + x * 1e-8 + y * 1e-10;
    },
    mountainField(m, x, y) {
      calls.mountain++;
      const tile = m[Math.floor(y / 48)]?.[Math.floor(x / 48)] ?? 0;
      return (tile === 4 ? 0.8 : 0.2) + x * 1e-8 + y * 1e-10;
    },
  };
  vm.runInNewContext(`${helper}\nglobalThis.api={prepare:dqFieldCachePrepare,water:dqFieldCacheWater,mountain:dqFieldCacheMountain,bytes:dqFieldCacheBytes,cache:__DQ_FIELD_CACHE__};`, context);
  return { context, api: context.api, calls, map: rows };
}

test('overlapping sample-4 windows reuse exact world-coordinate fields', () => {
  const h = cacheHarness();
  h.api.prepare(h.map, 4, 0, 0, 36, 49);
  const water = h.api.water(h.map, 600, 300, 4);
  const mountain = h.api.mountain(h.map, 600, 300, 4);
  const before = { ...h.calls };
  h.api.prepare(h.map, 4, 12, 0, 36, 49);
  assert.equal(h.api.water(h.map, 600, 300, 4), water);
  assert.equal(h.api.mountain(h.map, 600, 300, 4), mountain);
  assert.deepEqual(h.calls, before, 'overlap hits do not re-run either field');
  assert.equal(h.api.cache.windows.length, 2);
});

test('in-place tile edits and same-array dimension changes invalidate the snapshot', () => {
  const h = cacheHarness({ width: 80, height: 60 });
  h.api.prepare(h.map, 4, 0, 0, 36, 49);
  h.api.water(h.map, 240, 240, 4);
  const firstCalls = h.calls.water;
  h.map[5][5] = h.map[5][5] === 2 ? 0 : 2;
  h.api.prepare(h.map, 4, 0, 0, 36, 49);
  h.api.water(h.map, 240, 240, 4);
  assert.equal(h.calls.water, firstCalls + 1, 'edited map gets a cold field value');
  h.map.forEach(row => row.push(0));
  h.api.prepare(h.map, 4, 0, 0, 36, 49);
  assert.equal(h.api.cache.w, 81, 'same-array width change is noticed');
  h.map.push(Array(81).fill(0));
  h.api.prepare(h.map, 4, 0, 0, 36, 49);
  assert.equal(h.api.cache.h, 61, 'same-array height change is noticed');
});

test('ragged maps bypass cache and keep direct field fallback', () => {
  const h = cacheHarness({ width: 80, height: 60 });
  h.api.prepare(h.map, 4, 0, 0, 36, 49);
  h.map[3].pop();
  h.api.prepare(h.map, 4, 0, 0, 36, 49);
  assert.equal(h.api.cache.active, null);
  const before = h.calls.water;
  assert.equal(typeof h.api.water(h.map, 12, 12, 4), 'number');
  assert.equal(h.calls.water, before + 1);
  assert.equal(h.api.cache.windows.length, 0);
});

test('sample strides other than four bypass cached fields without discarding valid windows', () => {
  const h = cacheHarness({ width: 80, height: 60 });
  h.api.prepare(h.map, 4, 0, 0, 36, 49);
  h.api.water(h.map, 12, 12, 4);
  const windows = h.api.cache.windows.length, before = h.calls.water;
  h.api.prepare(h.map, 1, 0, 0, 36, 49);
  assert.equal(h.api.cache.active, null);
  assert.equal(h.api.cache.windows.length, windows);
  h.api.water(h.map, 12, 12, 1);
  assert.equal(h.calls.water, before + 1);
});

test('negative origins and nonaligned world coordinates cannot alias cached samples', () => {
  const h = cacheHarness({ width: 80, height: 60 });
  h.api.prepare(h.map, 4, -1, -1, 36, 49);
  const before = h.calls.water;
  const aligned = h.api.water(h.map, -44, -44, 4);
  assert.equal(h.api.water(h.map, -44, -44, 4), aligned);
  assert.equal(h.calls.water, before + 1, 'aligned negative sample is cached');
  h.api.water(h.map, -43, -44, 4);
  assert.equal(h.calls.water, before + 2, 'nonaligned coordinate falls back directly');
});

test('MUTED in-place edits, same-content replacement, and wiggle changes invalidate fields', () => {
  const h = cacheHarness({ width: 80, height: 60 });
  h.context.MUTED = new Set(); h.context.MUTED_W = 80;
  const waterCell = h.map.flatMap((row, y) => row.map((v, x) => v === 2 ? y * 80 + x : -1)).find(v => v >= 0);
  const x = (waterCell % 80) * 48, y = Math.floor(waterCell / 80) * 48;
  h.api.prepare(h.map, 4, 0, 0, 36, 49);
  const wet = h.api.water(h.map, x, y, 4), before = h.calls.water;
  h.context.MUTED.add(waterCell);
  h.api.prepare(h.map, 4, 0, 0, 36, 49);
  const muted = h.api.water(h.map, x, y, 4);
  assert.equal(h.calls.water, before + 1);
  assert.notEqual(muted, wet, 'in-place MUTED edit changes field input');
  h.context.MUTED = new Set([waterCell]);
  h.api.prepare(h.map, 4, 0, 0, 36, 49);
  const afterReplace = h.calls.water;
  h.api.water(h.map, x, y, 4);
  assert.equal(h.calls.water, afterReplace + 1, 'same-content Set replacement invalidates by identity');
  h.context.window.__DQ_WIGGLE__ = 0.31;
  h.api.prepare(h.map, 4, 0, 0, 36, 49);
  const afterWiggle = h.calls.water;
  h.api.water(h.map, x, y, 4);
  assert.equal(h.calls.water, afterWiggle + 1, 'wiggle config change invalidates water values');
});

test('two-window storage stays under 10 MiB and evicts the oldest window', () => {
  const h = cacheHarness();
  h.api.prepare(h.map, 4, 0, 0, 36, 49);
  h.api.water(h.map, 4, 4, 4);
  h.api.prepare(h.map, 4, 12, 0, 36, 49);
  h.api.water(h.map, 580, 4, 4);
  h.api.prepare(h.map, 4, 24, 0, 36, 49);
  assert.equal(h.api.cache.windows.length, 2);
  assert.ok(h.api.bytes() <= 10 * 1024 * 1024);
  assert.deepEqual(Array.from(h.api.cache.windows, w => w.x), [24 * 48, 12 * 48]);
});
