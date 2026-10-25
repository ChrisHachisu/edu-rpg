'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { test } = require('node:test');

const source = fs.readFileSync(path.join(__dirname, '../public/dq-tiles.js'), 'utf8');
function extractFunction(name) {
  const start = source.indexOf(`function ${name}(`);
  assert.notEqual(start, -1, `missing production function ${name}`);
  const end = source.indexOf('\n  }\n', start);
  assert.notEqual(end, -1, `missing production function terminator ${name}`);
  return source.slice(start, end + '\n  }'.length);
}
function runtime(bounds = [16, 218, 163, 399]) {
  const context = { N: 48, bounds, owns: true, spriteMode: true };
  context.a1aPlateBounds = () => context.bounds;
  context.a1aPlateOwns = () => context.owns;
  context.a1aSpriteMode = () => context.spriteMode;
  const code = [
    extractFunction('a1aPlateWindow'),
    extractFunction('a1aPlateWindowRect'),
    extractFunction('a1aLegacyPlateClip'),
    extractFunction('a1aClearLegacyPlate'),
    '({ a1aPlateWindow, a1aPlateWindowRect, a1aLegacyPlateClip, a1aClearLegacyPlate })',
  ].join('\n');
  return { ...vm.runInNewContext(code, context), context };
}
function pixelCanvas(width, height) {
  const data = new Uint8Array(width * height).fill(1);
  const clearCalls = [];
  return {
    data, clearCalls,
    clearRect(x, y, w, h) {
      clearCalls.push({ x, y, width: w, height: h });
      for (let py = 0; py < height; py++) for (let px = 0; px < width; px++) {
        if (px + 0.5 >= x && py + 0.5 >= y && px + 0.5 < x + w && py + 0.5 < y + h) data[py * width + px] = 0;
      }
    },
  };
}

test('partial windows clear only the exact inclusive plate intersection', () => {
  const f = runtime();
  const clip = f.a1aLegacyPlateClip({}, 10, 210, 20, 20);
  assert.deepEqual(JSON.parse(JSON.stringify(clip)), { x: 288, y: 384, width: 672, height: 576 });
  const canvas = pixelCanvas(20 * 48, 20 * 48);
  assert.equal(f.a1aClearLegacyPlate(canvas, clip), true);
  assert.deepEqual(JSON.parse(JSON.stringify(canvas.clearCalls)), [JSON.parse(JSON.stringify(clip))]);
  for (let y = 0; y < 20 * 48; y++) for (let x = 0; x < 20 * 48; x++) {
    const inside = x >= 288 && x < 960 && y >= 384 && y < 960;
    assert.equal(canvas.data[y * 20 * 48 + x], inside ? 0 : 1, `pixel ${x},${y}`);
  }
});

test('full-plate windows have a full-window clip rectangle', () => {
  const f = runtime();
  assert.equal(f.a1aPlateWindow(16, 218, 40, 38), true);
  const rect = f.a1aLegacyPlateClip({}, 16, 218, 40, 38);
  assert.deepEqual(JSON.parse(JSON.stringify(rect)), { x: 0, y: 0, width: 1920, height: 1824 });
});

test('windows outside the plate do not produce a clear rectangle', () => {
  const f = runtime();
  for (const args of [[0, 218, 15, 10], [164, 218, 4, 4], [16, 400, 10, 2], [16, 0, 10, 218]]) {
    assert.equal(f.a1aLegacyPlateClip({}, ...args), null, JSON.stringify(args));
  }
  const canvas = pixelCanvas(64, 64);
  assert.equal(f.a1aClearLegacyPlate(canvas, null), false);
  assert.deepEqual(canvas.clearCalls, []);
  assert.ok(canvas.data.every(x => x === 1));
});

test('plate edges are half-open and exact contact clears nothing', () => {
  const f = runtime();
  assert.equal(f.a1aLegacyPlateClip({}, 15, 217, 1, 1), null);
  assert.deepEqual(JSON.parse(JSON.stringify(f.a1aLegacyPlateClip({}, 15, 217, 2, 2))),
    { x: 48, y: 48, width: 48, height: 48 });
  assert.deepEqual(JSON.parse(JSON.stringify(f.a1aLegacyPlateClip({}, 163, 218, 1, 1))),
    { x: 0, y: 0, width: 48, height: 48 });
  assert.equal(f.a1aLegacyPlateClip({}, 164, 218, 1, 1), null);
});

test('fractional window origins retain exact subcell offsets', () => {
  const f = runtime();
  assert.deepEqual(JSON.parse(JSON.stringify(f.a1aLegacyPlateClip({}, 15.5, 217.25, 2.25, 2))),
    { x: 24, y: 36, width: 84, height: 60 });
});

test('legacy and unowned fallback do not receive plate clipping', () => {
  const f = runtime();
  f.context.spriteMode = false;
  assert.equal(f.a1aLegacyPlateClip({}, 15, 217, 2, 2), null);
  f.context.spriteMode = true; f.context.owns = false;
  assert.equal(f.a1aLegacyPlateClip({}, 15, 217, 2, 2), null);
  f.context.owns = true; f.context.bounds = null;
  assert.equal(f.a1aLegacyPlateClip({}, 15, 217, 2, 2), null);
});

test('leave and re-enter recomputes the same clip without stale window state', () => {
  const f = runtime();
  const first = f.a1aLegacyPlateClip({}, 15, 217, 2, 2);
  assert.ok(first);
  assert.equal(f.a1aLegacyPlateClip({}, 0, 0, 12, 12), null);
  const again = f.a1aLegacyPlateClip({}, 15, 217, 2, 2);
  assert.deepEqual(JSON.parse(JSON.stringify(again)), JSON.parse(JSON.stringify(first)));
});

function baseGeometry(alphaBearing, edge, seamBleed, scaleX, scaleY, texW, texH, x, y) {
  const code = `${extractFunction('a1aBaseDrawGeometry')}\na1aBaseDrawGeometry(${JSON.stringify(alphaBearing)},${JSON.stringify(edge)},${seamBleed},${scaleX},${scaleY},${texW},${texH},${x},${y})`;
  return vm.runInNewContext(code);
}

test('alpha-bearing base keeps authored edges while opaque neighbors retain seam overdraw', () => {
  assert.deepEqual(JSON.parse(JSON.stringify(baseGeometry(true,
    { left: 1, right: 1, top: 1, bottom: 1 }, 0.5, 0.2, 0.2, 512, 512, 100, 200))),
    { x: 100, y: 200, scaleX: 0.2, scaleY: 0.2 });
  assert.deepEqual(JSON.parse(JSON.stringify(baseGeometry(false,
    { left: 1, right: 1, top: 0, bottom: 0 }, 0.5, 0.2, 0.2, 512, 512, 100, 200))),
    { x: 99.5, y: 200, scaleX: 0.201953125, scaleY: 0.2 });
  assert.deepEqual(JSON.parse(JSON.stringify(baseGeometry(false,
    { left: 0, right: 0, top: 0, bottom: 0 }, 0.5, 0.2, 0.2, 512, 512, 100, 200))),
    { x: 100, y: 200, scaleX: 0.2, scaleY: 0.2 });
});

function underpaintMaskHarness() {
  const canvases = [];
  const ctx = { calls: [], save() {}, restore() {}, clearRect() {}, drawImage() {}, fillRect(x, y, width, height) { this.calls.push({ x, y, width, height }); } };
  const canvas = { width: 0, height: 0, getContext() { return ctx; } };
  const context = {
    A1A: { manifest: { chunks: [
      { id: 'c1', x: 0, y: 0, width: 2, height: 2 },
      { id: 'c2', x: 2, y: 0, width: 1, height: 2 },
    ] } },
    document: { createElement(name) { assert.equal(name, 'canvas'); canvases.push(canvas); return canvas; } },
  };
  const textures = new Map();
  const scene = {
    textures: {
      exists(key) { return textures.has(key); },
      get(key) { return textures.get(key); },
      addCanvas(key, value) {
        const texture = { key, canvas: value, refreshed: 0, setFilter() {}, refresh() { this.refreshed++; } };
        textures.set(key, texture); return texture;
      },
      remove(key) { textures.delete(key); },
    },
    add: {},
  };
  const sprite = { scene, texture: { key: 'a1a_underpaint' }, setTexture(key) { this.texture = textures.get(key) || { key }; return this; } };
  const up = { spec: { pixelWidth: 12, pixelHeight: 12 }, image: { width: 12, height: 12 }, maskCanvas: null,
    maskTexture: null, maskScene: null, maskKey: null, sprite };
  const code = [extractFunction('a1aUnderpaintBaseKeys'), extractFunction('a1aForestMaskRects'),
    extractFunction('a1aUnderpaintBaseMaskDispose'), extractFunction('a1aUnderpaintBaseMask'),
    '({a1aUnderpaintBaseKeys,a1aUnderpaintBaseMask})'].join('\n');
  return { ...vm.runInNewContext(code, context), scene, up, ctx, textures, canvases, canvas };
}

test('base fallback mask follows only live successful base residency and restores on eviction', () => {
  const h = underpaintMaskHarness();
  const initialLive = { a1a_base_c1: true, a1a_water_c1: true, a1a_base_c2: false };
  assert.deepEqual(Array.from(h.a1aUnderpaintBaseKeys(initialLive)), ['c1']);
  assert.equal(h.a1aUnderpaintBaseMask(h.scene, h.up, initialLive), true);
  assert.deepEqual(JSON.parse(JSON.stringify(h.ctx.calls)), [{ x: 0, y: 0, width: 8, height: 12 }]);
  const firstTexture = h.up.maskTexture;
  assert.equal(h.up.sprite.texture.key, 'a1a_underpaint_mask');

  // A stable residency set reuses its existing CanvasTexture without redrawing or uploading.
  assert.equal(h.a1aUnderpaintBaseMask(h.scene, h.up, initialLive), true);
  assert.equal(h.ctx.calls.length, 1);
  assert.equal(h.up.maskTexture, firstTexture);

  // Missing/evicted chunks stop masking; a later successful retry recreates the same bounded hole.
  assert.equal(h.a1aUnderpaintBaseMask(h.scene, h.up, {}), true);
  assert.equal(h.up.sprite.texture.key, 'a1a_underpaint');
  assert.equal(h.textures.has('a1a_underpaint_mask'), false);
  assert.equal(h.a1aUnderpaintBaseMask(h.scene, h.up, { a1a_base_c1: true }), true);
  assert.equal(h.up.sprite.texture.key, 'a1a_underpaint_mask');
  assert.deepEqual(JSON.parse(JSON.stringify(h.ctx.calls[1])), { x: 0, y: 0, width: 8, height: 12 });
});

test('mask construction failure fails open to complete coarse fallback', () => {
  const h = underpaintMaskHarness();
  h.canvas.getContext = () => null;
  assert.equal(h.a1aUnderpaintBaseMask(h.scene, h.up, { a1a_base_c1: true }), false);
  assert.equal(h.up.sprite.texture.key, 'a1a_underpaint');
  assert.equal(h.textures.has('a1a_underpaint_mask'), false);
});

test('base alpha probe scans each compact source image once and caches the result', () => {
  const reads = [];
  const fakeCtx = {
    clearRect() {}, drawImage() {},
    getImageData(x, y, width, height) {
      reads.push({ x, y, width, height });
      const data = new Uint8Array(width * height * 4); data.fill(255);
      if (this.src && this.src.transparentAt && x <= this.src.transparentAt.x
          && x + width > this.src.transparentAt.x && y <= this.src.transparentAt.y
          && y + height > this.src.transparentAt.y) data[3] = 0;
      return { data };
    },
  };
  const context = {
    A1A_BASE_SEAM_CACHE: null,
    A1A: { baseAlpha: {}, alphaProbe: null, manifest: { chunks: [
      { id: 'left', x: 0, y: 0, width: 1, height: 1 }, { id: 'right', x: 1, y: 0, width: 1, height: 1 },
    ] } },
    document: { createElement() { return { width: 0, height: 0, getContext() { return fakeCtx; } }; } },
  };
  const code = [extractFunction('a1aBaseSeamData'), extractFunction('a1aBaseHasAlpha'),
    '({a1aBaseHasAlpha})'].join('\n');
  const f = vm.runInNewContext(code, context);
  // The only neighbor is on the right, so this authored transparent pixel at the top-center is
  // outside every seam strip. The full-source classifier must still preserve exact geometry.
  const source = { width: 20, height: 20, transparentAt: { x: 8, y: 10 } };
  fakeCtx.src = source;
  const c = context.A1A.manifest.chunks[0];
  assert.equal(f.a1aBaseHasAlpha(c, source), true);
  assert.deepEqual(reads, [{ x: 0, y: 0, width: 20, height: 20 }]);
  assert.equal(f.a1aBaseHasAlpha(c, source), true);
  assert.equal(reads.length, 1, 'cached probe must not read again');
  const opaqueChunk = context.A1A.manifest.chunks[1];
  fakeCtx.src = { width: 20, height: 20 };
  assert.equal(f.a1aBaseHasAlpha(opaqueChunk, fakeCtx.src), false);
  assert.equal(reads.length, 2, 'each unique source receives one complete alpha scan');
  assert.equal(f.a1aBaseHasAlpha(opaqueChunk, fakeCtx.src), false);
  assert.equal(reads.length, 2, 'opaque classification is cached too');
});

function waterBackingHarness(bounds = [10, 20, 11, 22]) {
  const counters = { waterSamples: [], materialSamples: [], refreshes: 0, clears: 0, created: [], destroyed: [] };
  const context = {
    N: 48, OW_TILE: 33.6, NEAREST: 0,
    A1A_PLATE_WATER_PPC: 48, A1A_PLATE_WATER_CHUNK_CELLS: 16,
    MAT: { ready: true },
    A1A_WATER_R2: { identity: '', status: 'absent' },
    A1A: { manifest: { northSupport: { schema: 'north-cliff-overhang-v1', prefixMask: { northWorldY: 20, bandCells: 2 } } } },
    window: {},
    terrainState: null,
    a1aPlateOwns: scene => !!scene.owner,
    a1aSpriteMode: () => true,
    a1aPlateBounds: () => bounds,
    a1aWaterR2Spec: () => null,
    a1aWaterR2Pixels: () => null,
    waterField(map, wx, wy) { counters.waterSamples.push([wx, wy]); return map.waterField; },
    matShade(name, wx, wy, mult) {
      counters.materialSamples.push([name, wx, wy, mult]);
      return [Math.floor((wx % 251 + 251) % 251), Math.floor((wy % 241 + 241) % 241), 88];
    },
    bankOver(color) { return color; },
    beachyAt() { return 0.5; },
    waterColor(wx, wy, W) { return [Math.floor(wx % 251), Math.floor(wy % 241), Math.floor(W * 100)]; },
  };
  const code = [extractFunction('a1aPlateWaterBounds'), extractFunction('a1aPlateWaterSegments'),
    extractFunction('a1aPlateWaterBackingColor'), extractFunction('a1aDrawPlateWaterBacking'),
    extractFunction('a1aDropPlateWaterBacking'), extractFunction('a1aPlateWaterBackingUpdate'),
    '({a1aPlateWaterBounds,a1aPlateWaterSegments,a1aPlateWaterBackingColor,a1aDrawPlateWaterBacking,a1aDropPlateWaterBacking,a1aPlateWaterBackingUpdate})'].join('\n');
  const f = vm.runInNewContext(code, context);
  const textures = new Map();
  const scene = {
    owner: true,
    textures: {
      exists(key) { return textures.has(key); },
      remove(key) { textures.delete(key); counters.destroyed.push(key); },
      createCanvas(key, width, height) {
        counters.created.push({ key, width, height });
        const texture = {
          key, width, height, context: {
            createImageData(w, h) { return { width: w, height: h, data: new Uint8ClampedArray(w * h * 4) }; },
            putImageData(img) { texture.pixels = img.data; },
          },
          refresh() { counters.refreshes++; }, setFilter() {},
        };
        textures.set(key, texture); return texture;
      },
    },
    add: { image(x, y, key) {
      const image = { x, y, key, scene, visible: true,
        setOrigin() { return this; }, setDepth(v) { this.depth = v; return this; },
        setScale(v) { this.scale = v; return this; }, setPosition(a, b) { this.x = a; this.y = b; return this; },
        setVisible(v) { this.visible = v; return this; }, destroy() { counters.destroyed.push(key); this.scene = null; },
        texture: { setFilter() {} },
      };
      return image;
    } },
  };
  context.terrainState = { scene, winW: 4, winH: 4, waterSegments: {} };
  return { ...f, context, counters, scene, textures, state: context.terrainState };
}

test('north-band backing samples exact analytic world-pixel phase and writes only its bounded strip', () => {
  const h = waterBackingHarness([10, 20, 11, 22]);
  const map = { waterField: 0.2 };
  const ctx = {
    createImageData(width, height) { return { width, height, data: new Uint8ClampedArray(width * height * 4) }; },
    putImageData(img) { this.img = img; },
  };
  const strip = h.a1aPlateWaterBounds();
  assert.deepEqual(Array.from(strip), [10, 20, 11, 21], 'height comes from the manifest prefix-band contract');
  assert.equal(h.a1aDrawPlateWaterBacking(ctx, map, strip, 48), true);
  assert.equal(ctx.img.width, 96);
  assert.equal(ctx.img.height, 96);
  assert.equal(ctx.img.data.length, 96 * 96 * 4);
  assert.equal(h.counters.waterSamples.length, 96 * 96);
  assert.ok(h.counters.materialSamples.every(sample => sample[0] === 'water'), 'never samples analytic land/rock');
  assert.deepEqual(Array.from(ctx.img.data.slice(0, 4)), [229, 237, 88, 255]);
  assert.deepEqual(JSON.parse(JSON.stringify(h.counters.materialSamples[0])), ['water', 480.5, 960.5, 1]);
  // One raster pixel corresponds to one analytic world pixel; camera movement cannot shift phase.
  const sampleAtWorld = ([wx, wy]) => h.a1aPlateWaterBackingColor(map, wx, wy);
  assert.deepEqual(Array.from(sampleAtWorld([480.5, 960.5])), [229, 237, 88]);
  assert.deepEqual(Array.from(sampleAtWorld([480.5, 960.5])), Array.from(sampleAtWorld([480.5, 960.5])));
});

test('neighboring 16-cell water segments share exact analytic pixels across a chunk seam', () => {
  const h = waterBackingHarness();
  const map = { waterField: 0.7 };
  const draw = bounds => {
    const ctx = { createImageData(width, height) { return { width, height, data: new Uint8ClampedArray(width * height * 4) }; },
      putImageData(img) { this.img = img; } };
    assert.equal(h.a1aDrawPlateWaterBacking(ctx, map, bounds, 48), true);
    return ctx.img;
  };
  const left = draw([10, 20, 16, 21]), right = draw([16, 20, 31, 21]);
  const worldX = 16 * 48 + 7, worldY = 20 * 48 + 19;
  const leftIndex = ((worldY - 20 * 48) * left.width + (worldX - 10 * 48)) * 4;
  const rightIndex = ((worldY - 20 * 48) * right.width + (worldX - 16 * 48)) * 4;
  assert.deepEqual(Array.from(left.data.slice(leftIndex, leftIndex + 4)),
    Array.from(right.data.slice(rightIndex, rightIndex + 4)));
});

test('only visible 16-cell band segments are resident and fractional camera movement is a cache hit', () => {
  const h = waterBackingHarness([10, 20, 45, 22]);
  const map = { waterField: 0.8 };
  const topView = { x: 16 * 33.6 + 0.25, y: 20 * 33.6, width: 10 * 33.6, height: 8 * 33.6 };
  assert.equal(h.a1aPlateWaterBackingUpdate(h.scene, map, topView, false), true);
  assert.deepEqual(Object.keys(h.state.waterSegments), ['c16']);
  const rec = h.state.waterSegments.c16, image = rec.image, texture = rec.ct;
  assert.ok(image.visible);
  assert.equal(image.depth, 0.6);
  assert.equal(image.x, 16 * 33.6);
  assert.equal(image.y, 20 * 33.6);
  assert.equal(image.scale, 33.6 / 48);
  assert.equal(texture.width, 16 * 48);
  assert.equal(texture.height, 2 * 48);
  assert.equal(h.counters.refreshes, 1);

  const seamView = { x: 30 * 33.6, y: 20 * 33.6, width: 10 * 33.6, height: 8 * 33.6 };
  assert.equal(h.a1aPlateWaterBackingUpdate(h.scene, map, seamView, false), true);
  assert.deepEqual(Object.keys(h.state.waterSegments).sort(), ['c16', 'c32']);
  const refreshes = h.counters.refreshes;
  assert.equal(h.a1aPlateWaterBackingUpdate(h.scene, map, { ...seamView, x: seamView.x + 0.5 }, false), true);
  assert.equal(h.counters.refreshes, refreshes, 'subcell camera motion never rerasterizes world-aligned samples');
  assert.equal(h.counters.created.every(c => c.width <= 16 * 48 && c.height === 2 * 48), true);

  assert.equal(h.a1aPlateWaterBackingUpdate(h.scene, map,
    { x: 30 * 33.6, y: 22 * 33.6, width: 5 * 33.6, height: 4 * 33.6 }, false), false);
  assert.deepEqual(Object.keys(h.state.waterSegments), [], 'outside the north band releases resident segments');
  assert.ok(h.counters.destroyed.length >= 2);
  assert.equal(h.a1aPlateWaterBackingUpdate(h.scene, map,
    { x: 2 * 33.6, y: 20 * 33.6, width: 5 * 33.6, height: 4 * 33.6 }, false), false);

  // Missing, loading and evicted base layers continue to reveal the same backing through the fallback.
  h.a1aPlateWaterBackingUpdate(h.scene, map, topView, false);
  const liveImage = h.state.waterSegments.c16.image;
  assert.equal(liveImage.depth < 0.7, true, 'water remains below the coarse underpaint fallback');
  const mask = underpaintMaskHarness();
  assert.equal(mask.a1aUnderpaintBaseMask(mask.scene, mask.up, {}), true);
  assert.equal(mask.up.sprite.texture.key, 'a1a_underpaint');
  assert.equal(liveImage.visible, true);
  assert.equal(mask.a1aUnderpaintBaseMask(mask.scene, mask.up, { a1a_base_c1: true }), true);
  assert.equal(mask.up.sprite.texture.key, 'a1a_underpaint_mask');
  assert.equal(liveImage.visible, true);
  assert.equal(mask.a1aUnderpaintBaseMask(mask.scene, mask.up, {}), true);
  assert.equal(mask.up.sprite.texture.key, 'a1a_underpaint');
  assert.equal(liveImage.visible, true);
});

test('missing or malformed manifest support disables the optional water backing', () => {
  const h = waterBackingHarness([10, 20, 11, 22]);
  assert.deepEqual(Array.from(h.a1aPlateWaterBounds()), [10, 20, 11, 21]);
  h.context.A1A.manifest.northSupport.prefixMask.bandCells = 0;
  assert.equal(h.a1aPlateWaterBounds(), null);
  h.context.A1A.manifest.northSupport.prefixMask.bandCells = 4;
  assert.equal(h.a1aPlateWaterBounds(), null, 'support band cannot exceed plate height');
  h.context.A1A.manifest.northSupport.prefixMask.bandCells = 1;
  h.context.A1A.manifest.northSupport.prefixMask.northWorldY = 19;
  assert.equal(h.a1aPlateWaterBounds(), null, 'north anchor must match plate top');
  h.context.A1A.manifest.northSupport = null;
  assert.equal(h.a1aPlateWaterBounds(), null, 'legacy/missing manifest leaves established fallback untouched');
});

test('material, water controls, and map changes invalidate only active cached segments', () => {
  const h = waterBackingHarness([10, 20, 11, 22]);
  const map = { waterField: 0.2 };
  const reentryMap = { waterField: 0.4 };
  const view = { x: 10 * 33.6, y: 20 * 33.6, width: 1, height: 1 };
  h.a1aPlateWaterBackingUpdate(h.scene, map, view, false);
  assert.equal(h.counters.refreshes, 1);
  h.context.MAT.ready = false;
  h.a1aPlateWaterBackingUpdate(h.scene, map, view, false);
  assert.equal(h.counters.refreshes, 2, 'material fallback changes backing once');
  h.context.window.__DQ_WIGGLE__ = 0.3;
  h.a1aPlateWaterBackingUpdate(h.scene, map, view, false);
  assert.equal(h.counters.refreshes, 3, 'water field control change redraws once');
  h.a1aPlateWaterBackingUpdate(h.scene, reentryMap, view, false);
  assert.equal(h.counters.refreshes, 4, 'map re-entry rebinds the cached world field');
  h.a1aPlateWaterBackingUpdate(h.scene, reentryMap, view, false);
  assert.equal(h.counters.refreshes, 4, 'stable frame performs no rerasterization');
  h.scene.owner = false;
  assert.equal(h.a1aPlateWaterBackingUpdate(h.scene, reentryMap, view, false), false);
  assert.deepEqual(Object.keys(h.state.waterSegments), [], 'unowned/legacy scene removes the plate-only layer');
});

test('a failed first raster removes its sprite and texture so a later retry can recover', () => {
  const h = waterBackingHarness([10, 20, 11, 22]);
  const map = { waterField: 0.2 }, view = { x: 10 * 33.6, y: 20 * 33.6, width: 2 * 33.6, height: 2 * 33.6 };
  const sample = h.context.waterField;
  h.context.waterField = () => { throw new Error('temporary raster failure'); };
  assert.equal(h.a1aPlateWaterBackingUpdate(h.scene, map, view, false), false);
  assert.deepEqual(Object.keys(h.state.waterSegments), []);
  assert.deepEqual(Array.from(h.textures.keys()), []);
  assert.ok(h.counters.destroyed.includes('dqplatewater_c10'));
  h.context.waterField = sample;
  assert.equal(h.a1aPlateWaterBackingUpdate(h.scene, map, view, false), true);
  assert.deepEqual(Object.keys(h.state.waterSegments), ['c10']);
  assert.ok(h.state.waterSegments.c10.image.visible);
});

test('palette fallback continues water without drawing land when water materials are unavailable', () => {
  const h = waterBackingHarness([10, 20, 10, 20]);
  h.context.MAT.ready = false;
  const color = h.a1aPlateWaterBackingColor({ waterField: 0.1 }, 480, 960);
  assert.deepEqual(Array.from(color), [229, 237, 50]);
  assert.equal(h.counters.materialSamples.length, 0);
});
