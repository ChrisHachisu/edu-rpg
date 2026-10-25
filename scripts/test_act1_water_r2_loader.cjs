'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { test } = require('node:test');

const source = fs.readFileSync(path.join(__dirname, '../public/dq-tiles.js'), 'utf8');
const loaderStart = source.indexOf('  var A1A_WATER_R2=');
const loaderEnd = source.indexOf('  function a1aWaterR2Texture(', loaderStart);
assert.notEqual(loaderStart, -1, 'missing water-r2 loader state');
assert.notEqual(loaderEnd, -1, 'missing water-r2 loader terminator');
const loader = source.slice(loaderStart, loaderEnd);
const textureStart = loaderEnd;
const textureEnd = source.indexOf('\n  }', textureStart);
assert.notEqual(textureEnd, -1, 'missing water-r2 texture helper terminator');
const texture = source.slice(textureStart, textureEnd + '\n  }'.length);
function body(name) {
  const start = source.indexOf(`  function ${name}(`);
  assert.notEqual(start, -1, `missing ${name}`);
  const end = source.indexOf('\n  }', start);
  assert.notEqual(end, -1, `missing ${name} terminator`);
  return source.slice(start, end + '\n  }'.length);
}
const backing = `${body('a1aPlateWaterBackingColor')}\n${body('a1aDrawPlateWaterBacking')}`;
const plateBacking = `${body('a1aPlateWaterBounds')}\n${body('a1aPlateWaterSegments')}\n${body('a1aPlateWaterBackingUpdate')}`;
const canvasBlit = body('a1aBlit');

function harness() {
  let now = 100;
  class FakeDate { static now() { return now; } }
  class FakeImage {
    static instances = [];
    constructor() { this.width = 4; this.height = 4; this.naturalWidth = 4; this.naturalHeight = 4; FakeImage.instances.push(this); }
    set src(value) { this.url = value; }
  }
  const spec = { schema: 'act1-water-r2-global-phase-v1', pixelsPerCell: 32,
    sourceTexelsPerCell: 96, blend: 'normal alpha composite', assetPath: 'materials/water.png',
    assetSha256: 'a'.repeat(64), assetDimensionsPx: [4, 4] };
  const context = {
    A1A: { manifest: { waterTreatment: spec }, dirty: false }, Image: FakeImage, Date: FakeDate,
    document: { createElement: () => ({ width: 0, height: 0, getContext: () => ({
      drawImage() {}, getImageData: (_x, _y, w, h) => {
        const data = new Uint8ClampedArray(w * h * 4);
        for (let i = 0; i < w * h; i++) data.set([201, 99, 15, 255], i * 4);
        return { data };
      },
    }) }) },
    N: 48, NEAREST: 1, MAT: { ready: false }, waterField: () => 0.5,
    waterColor: () => [17, 23, 29],
  };
  vm.runInNewContext(`${loader}\n${texture}\n${backing}\n${plateBacking}\nglobalThis.api={pixels:a1aWaterR2Pixels,state:()=>A1A_WATER_R2,texture:a1aWaterR2Texture,draw:a1aDrawPlateWaterBacking,update:a1aPlateWaterBackingUpdate};`, context);
  return { context, api: context.api, Image: FakeImage, spec, setNow: value => { now = value; } };
}

test('delayed water-r2 load remains pending and becomes ready after onload', () => {
  const h = harness();
  assert.equal(h.api.pixels(), null);
  assert.equal(h.api.state().status, 'loading');
  assert.equal(h.Image.instances.length, 1, 'pending requests are not duplicated');
  const image = h.Image.instances[0];
  image.onload();
  const loaded = h.api.pixels();
  assert.equal(loaded.status, 'ready');
  assert.equal(loaded.pixels.length, 4 * 4 * 4);
  assert.equal(h.context.A1A.dirty, true);
});

test('failed load retries at bounded delays and analytic backing remains drawable', () => {
  const h = harness();
  assert.equal(h.api.pixels(), null);
  h.Image.instances[0].onerror();
  assert.equal(h.api.state().status, 'error');
  const pixels = new Uint8ClampedArray(4 * 4 * 4);
  const canvas = { createImageData: (w, height) => ({ data: new Uint8ClampedArray(w * height * 4) }),
    putImageData(image) { this.image = image; } };
  assert.equal(h.api.draw(canvas, [], [0, 0, 0, 0], 6), true, 'manifest opt-in falls back to analytic water while the asset is unavailable');
  assert.deepEqual(Array.from(canvas.image.data.slice(0, 4)), [17, 23, 29, 255]);
  assert.equal(h.Image.instances.length, 1, 'backing fallback does not spin retries');
  h.setNow(1100); h.api.pixels(); assert.equal(h.Image.instances.length, 2);
  h.Image.instances[1].onerror();
  h.setNow(3100); h.api.pixels(); assert.equal(h.Image.instances.length, 3);
  h.Image.instances[2].onerror();
  h.setNow(100000); assert.equal(h.api.pixels(), null);
  assert.equal(h.Image.instances.length, 3, 'retry count is capped after three total requests');
  assert.equal(h.api.state().status, 'error');
});

test('production plate caller falls back at 32ppc then redraws from r2 pixels after load', () => {
  const h = harness();
  h.context.A1A.manifest.northSupport = { schema: 'north-cliff-overhang-v1',
    prefixMask: { northWorldY: 0, bandCells: 1 } };
  h.context.OW_TILE = 48; h.context.A1A_PLATE_WATER_PPC = 32; h.context.A1A_PLATE_WATER_CHUNK_CELLS = 16;
  h.context.window = {};
  h.context.terrainState = { waterSegments: {} };
  h.context.a1aPlateBounds = () => [0, 0, 0, 0];
  h.context.a1aPlateOwns = () => true;
  h.context.a1aSpriteMode = () => true;
  const imageState = { scene: null, visible: true, setOrigin() { return this; }, setDepth() { return this; },
    setScale() { return this; }, setPosition() { return this; }, setVisible() { this.visible = true; return this; },
    destroy() {} };
  const textures = new Map();
  const scene = {
    textures: {
      exists: key => textures.has(key), remove: key => textures.delete(key),
      createCanvas(key, width, height) {
        const canvas = { width, height, data: null, setFilter() { return this; },
          context: { createImageData: (w, h) => ({ data: new Uint8ClampedArray(w * h * 4) }),
            putImageData(imageData) { canvas.data = imageData.data.slice(); } }, refresh() {} };
        textures.set(key, canvas); return canvas;
      },
    },
    add: { image() { imageState.scene = scene; imageState.texture = { setFilter() {} }; return imageState; } },
  };
  const view = { x: 0, y: 0, width: 48, height: 48 };
  assert.equal(h.api.update(scene, [], view, false), true);
  const rec = h.context.terrainState.waterSegments.c0;
  assert.deepEqual(Array.from(rec.ct.data.slice(0, 4)), [17, 23, 29, 255], 'pending request uses analytic 32ppc backing');
  assert.match(rec.rasterKey, /analytic-loading$/);
  h.Image.instances[0].onload();
  h.api.update(scene, [], view, false);
  assert.deepEqual(Array.from(rec.ct.data.slice(0, 4)), [201, 99, 15, 255], 'ready event rerasterizes from r2 pixels');
  assert.match(rec.rasterKey, /ready$/);
});

test('late old-identity callback cannot replace the current asset request', () => {
  const h = harness();
  assert.equal(h.api.pixels(), null);
  const old = h.Image.instances[0];
  h.context.A1A.manifest.waterTreatment = { ...h.spec, assetPath: 'materials/water-next.png', assetSha256: 'b'.repeat(64) };
  assert.equal(h.api.pixels(), null);
  const current = h.Image.instances[1];
  old.onload();
  assert.equal(h.api.state().status, 'loading');
  assert.equal(h.api.state().url, 'act1-hifi/materials/water-next.png');
  current.onload();
  assert.equal(h.api.pixels().status, 'ready');
  assert.equal(h.api.state().identity, `act1-hifi/materials/water-next.png|${'b'.repeat(64)}`);
});

test('asset identity replacement uses a new Phaser texture and retires the old texture', () => {
  const h = harness();
  const textures = new Map();
  const scene = { textures: {
    exists: key => textures.has(key),
    addImage(key, image) { textures.set(key, { image, setFilter() {} }); },
    get: key => textures.get(key),
    remove: key => textures.delete(key),
  } };
  h.api.pixels(); h.Image.instances[0].onload();
  const oldKey = h.api.texture(scene);
  assert.equal(oldKey, `dqwater-r2-${'a'.repeat(16)}`);
  h.context.A1A.manifest.waterTreatment = { ...h.spec, assetPath: 'materials/water-next.png', assetSha256: 'b'.repeat(64) };
  h.api.pixels(); h.Image.instances[1].onload();
  const newKey = h.api.texture(scene);
  assert.equal(newKey, `dqwater-r2-${'b'.repeat(16)}`);
  assert.equal(textures.has(oldKey), false);
  assert.equal(textures.has(newKey), true);
});

test('canvas fallback uses sprite-equivalent r2 blending and retains legacy glint blending', () => {
  function drawWaterBlend(waterTreatment) {
    const draws = [];
    const manifest = waterTreatment ? { waterTreatment } : {};
    const r = { rec: { base: { name: 'base' }, water: { name: 'water' } },
      c: { width: 1 }, sx: 0, sy: 0, w: 1, h: 1, dx: 0, dy: 0 };
    const rects = [r]; rects.full = true;
    const context = {
      A1A: { manifest, S: 1 },
      a1aRects: () => rects, a1aSpriteMode: () => false,
      a1aWaterR2Spec() {
        const w = manifest.waterTreatment;
        return w && w.schema === 'act1-water-r2-global-phase-v1'
          && w.pixelsPerCell === 32 && w.sourceTexelsPerCell === 96
          && w.blend === 'normal alpha composite' ? w : null;
      },
      a1aDrawLayer(ctx, image) {
        draws.push({ layer: image.name, composite: ctx.globalCompositeOperation || 'source-over',
          alpha: ctx.globalAlpha === undefined ? 1 : ctx.globalAlpha });
      },
      a1aDrawNorthLayer() {}, TILE: 1,
    };
    vm.runInNewContext(`${canvasBlit}\nglobalThis.blit=a1aBlit;`, context);
    const ctx = { save() {}, restore() {}, clearRect() {} };
    assert.equal(context.blit(ctx, 0, 0, 1, 1, false), true);
    return draws.find(draw => draw.layer === 'water');
  }

  const r2 = { schema: 'act1-water-r2-global-phase-v1', pixelsPerCell: 32,
    sourceTexelsPerCell: 96, blend: 'normal alpha composite' };
  assert.deepEqual(drawWaterBlend(r2), { layer: 'water', composite: 'source-over', alpha: 1 });
  assert.deepEqual(drawWaterBlend(null), { layer: 'water', composite: 'screen', alpha: 0.28 });
});
