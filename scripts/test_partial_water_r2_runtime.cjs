'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { test } = require('node:test');

const source = fs.readFileSync(path.join(__dirname, '../public/dq-tiles.js'), 'utf8');
function extractFunction(name) {
  const start = source.indexOf(`  function ${name}(`);
  assert.notEqual(start, -1, `missing production function ${name}`);
  const end = source.indexOf('\n  }', start);
  assert.notEqual(end, -1, `missing production function terminator ${name}`);
  return source.slice(start, end + '\n  }'.length);
}

const R2 = [72, 143, 211, 255];
const ANALYTIC_WATER = [20, 36, 52, 255];
const GRASS = [35, 120, 45, 255];
const ROUTE = [160, 105, 50, 255];

function canvas(width, height, counters) {
  const ctx = {
    width, height, imageSmoothingEnabled: false, fillStyle: '#000000', image: null,
    createImageData(w, h) { return { width: w, height: h, data: new Uint8ClampedArray(w * h * 4) }; },
    putImageData(image) { this.image = image; },
    drawImage(_image, x, y, w, h) { this.fillRect(x, y, w || 48, h || 48); },
    clearRect(x, y, w, h) {
      counters.clears++;
      counters.clearRects.push({ x, y, width: w, height: h });
      if (!this.image) return;
      const x0 = Math.max(0, Math.floor(x)), y0 = Math.max(0, Math.floor(y));
      const x1 = Math.min(width, Math.ceil(x + w)), y1 = Math.min(height, Math.ceil(y + h));
      for (let py = y0; py < y1; py++) for (let px = x0; px < x1; px++) {
        const i = (py * width + px) * 4;
        this.image.data.fill(0, i, i + 4);
      }
    },
    fillRect(x, y, w, h) {
      const m = /^#([0-9a-f]{6})$/i.exec(this.fillStyle);
      const rgb = m ? [parseInt(m[1].slice(0, 2), 16), parseInt(m[1].slice(2, 4), 16), parseInt(m[1].slice(4, 6), 16)] : [0, 0, 0];
      if (!this.image) return;
      for (let py = Math.max(0, Math.floor(y)); py < Math.min(height, Math.ceil(y + h)); py++)
        for (let px = Math.max(0, Math.floor(x)); px < Math.min(width, Math.ceil(x + w)); px++) {
          const i = (py * width + px) * 4;
          this.image.data.set([...rgb, 255], i);
        }
    },
  };
  return ctx;
}

function makeHarness({ biome = false, route = false } = {}) {
  const counters = { refreshes: 0, clears: 0, clearRects: [], waterSamples: 0, seaCreates: [] };
  const water = { identity: 'act1-hifi/materials/act1-water-r2.png|' + 'a'.repeat(64), status: 'loading', attempts: 1,
    registered: false, key: 'dqwater-r2-' + 'a'.repeat(16) };
  const bounds = [0, 218, 0, 219];
  const testMap = {
    length: 230,
    0: [0, 0],
    cell(tx, ty) {
      if (ty === 217 && tx === 0 && biome) return 13;
      if (ty === 217 && tx === 1 && route) return 5;
      if (ty === 217 && tx === 1 && biome) return 2;
      return 0;
    },
    waterAt(wx, wy) {
      counters.waterSamples++;
      const localX = wx % 96;
      const localY = Math.floor(wy / 48) % 460;
      if (biome && localY === 217 && localX >= 24) return 0.2;
      if (localY === 217 && route && localX >= 48 && localX < 52) return 0.8;
      if (localY === 217 && localX < 48) return 0.8;
      return 0.2;
    },
  };
  const textures = new Map();
  const textureExists = key => textures.has(key);
  const scene = {
    currentMapId: 'overworld', mapData: testMap,
    cameras: { main: { width: 67.2, height: 67.2, worldView: { x: 0, y: 217 * 33.6, width: 67.2, height: 67.2 } } },
    textures: {
      exists: textureExists,
      get: key => textures.get(key),
      remove: key => textures.delete(key),
      createCanvas(key, width, height) {
        const ctx = canvas(width, height, counters);
        const tex = { key, width, height, context: ctx, setFilter() {}, refresh() {} };
        textures.set(key, tex);
        return tex;
      },
    },
    add: {
      tileSprite(_x, _y, _w, _h, key) {
        counters.seaCreates.push(key);
        const image = { scene, key, visible: true, texture: { setFilter() {} },
          setOrigin() { return this; }, setScrollFactor() { return this; }, setDepth(v) { this.depth = v; return this; },
          setSize() { return this; }, setDisplaySize() { return this; }, setTileScale(x, y) { this.tileScale = [x, y]; return this; },
          setTilePosition(x, y) { this.tilePosition = [x, y]; return this; },
          setVisible(v) { this.visible = v; return this; }, destroy() { this.scene = null; } };
        return image;
      },
      image(_x, _y, key) {
        return { scene, key, visible: true, texture: { setFilter() {} }, setOrigin() { return this; },
          setScrollFactor() { return this; }, setDepth(v) { this.depth = v; return this; },
          setSize() { return this; }, setDisplaySize() { return this; }, setVisible(v) { this.visible = v; return this; },
          destroy() { this.scene = null; } };
      },
    },
  };
  const terrainCtx = canvas(96, 96, counters);
  const terrainState = { scene, winW: 2, winH: 2, ct: { context: terrainCtx, refresh() { counters.refreshes++; } },
    image: { scene, setPosition() { return this; }, setVisible(v) { this.visible = v; return this; } },
    cimg: { visible: false, setVisible(v) { this.visible = v; return this; } },
    lastWin: '0_217', lastWaterKey: '', lastFull: false };
  const A1A = { lastRects: [], lastFull: false, lastFull: false, dirty: false, drew: false,
    baseAlpha: {}, imgs: {}, tex: {}, underpaint: {}, manifest: {} };
  const context = {
    N: 48, OW_TILE: 33.6, MARGIN: 0, SC: 1, NEAREST: 1, A1A_SEA: '#123456',
    A1A, A1A_WATER_R2: water, OW_BIOME_FILL: { 13: 4038205, 14: 1728026, 17: 14214382, 18: 15255664, 21: 15761408 },
    MAT: { ready: false }, COST: { splat: 0 }, terrainState, seaState: null,
    window: {}, _winSites: [], OW_LANDMARK: {}, P: { foam: [1, 2, 3] },
    a1aPlateBounds: () => bounds, a1aPlateOwns: () => true, a1aSpriteMode: () => true,
    a1aWaterR2Texture: () => water.status === 'ready' && water.registered ? water.key : null,
    a1aPlateWaterBackingUpdate() {}, a1aUnderpaintRequired: () => false, a1aUnderpaintPlace() {},
    a1aPlaceSprites() {}, a1aRects: () => [], a1aCanopy: () => false,
    costTime: (_name, callback) => callback(), windowStart: (v, _win, _dim, tile) => Math.floor(v / tile),
    a1aBlit: () => false, a1aGlLost: () => false, a1aUnderpaintRequiredForView: () => false,
    a1aDrawableOpaqueBaseRects: () => [], a1aOpaqueBaseSpans: () => [], a1aOpaqueSkipEnd: x => x,
    dqFieldCachePrepare() {}, dqFieldCacheWater: (map, wx, wy) => map.waterAt(wx, wy), dqFieldCacheMountain: () => -1,
    waterField: (map, wx, wy) => map.waterAt(wx, wy), et: (map, tx, ty) => map.cell(tx, ty),
    isSpecial: () => false, isOwRoad: (map, tx, ty) => route && ty === 217 && tx === 1,
    waterColor: () => ANALYTIC_WATER.slice(0, 3), gshade: () => GRASS.slice(0, 3),
    vnoise: () => 0, sitesFor: () => [], bankOver: color => color, siteOver: color => color,
    beachyAt: () => 0.5, rgb: color => '#' + color.map(v => v.toString(16).padStart(2, '0')).join(''),
    drawRoadTile(ctx) { ctx.fillStyle = '#a06932'; ctx.fillRect(48, 0, 48, 4); },
    bridgeRails(ctx) { ctx.fillStyle = '#704020'; ctx.fillRect(48, 4, 2, 8); },
    grassSpeckle() {},
  };
  if (water.registered) textures.set(water.key, { setFilter() {} });
  const names = ['setData', 'setDataBlock', 'a1aPlateWindow', 'a1aPlateWindowRect', 'a1aLegacyPlateClip',
    'a1aClearLegacyPlate', 'a1aSea', 'paintBiomeFills', 'drawTerrain', 'updateTerrain'];
  const code = names.map(extractFunction).join('\n') + '\nglobalThis.api={drawTerrain,updateTerrain};';
  vm.runInNewContext(code, context);
  return { api: context.api, context, counters, terrainState, scene, water, textures, bounds, pixel(x, y) {
    const d = terrainCtx.image.data, i = (y * 96 + x) * 4;
    return Array.from(d.slice(i, i + 4));
  }, terrainCtx };
}

test('production partial-window redraw reveals R2 only over true water and rerasterizes same-window readiness/identity changes', () => {
  const h = makeHarness({ route: true });
  h.api.updateTerrain(h.scene, false);
  const pendingRefreshes = h.counters.refreshes;
  assert.deepEqual(h.pixel(12, 12), ANALYTIC_WATER, 'pending texture retains analytic water fallback');
  assert.deepEqual(h.pixel(60, 12), GRASS, 'dry land remains the analytic land color');
  assert.deepEqual(h.pixel(48, 1), ROUTE, 'road is drawn over the water underlay');
  assert.equal(h.terrainState.lastWaterKey.includes('|loading|'), true);

  h.water.status = 'ready'; h.water.registered = true;
  h.textures.set(h.water.key, { setFilter() {} });
  h.api.updateTerrain(h.scene, false);
  assert.equal(h.counters.refreshes, pendingRefreshes + 1, 'ready transition redraws a stationary snapped window');
  assert.deepEqual(h.pixel(12, 12), [0, 0, 0, 0], 'wet outside-plate canvas becomes transparent to the active R2 TileSprite');
  assert.equal(h.context.seaState.key, h.water.key, 'the registered R2 TileSprite is the exposed layer');
  assert.equal(h.context.seaState.img.depth, 0.5);
  assert.deepEqual(Array.from(h.context.seaState.img.tileScale), [33.6 / 96, 33.6 / 96]);
  assert.deepEqual(Array.from(h.context.seaState.img.tilePosition), [0, 217 * 33.6 / (33.6 / 96)]);
  assert.deepEqual(h.pixel(60, 12), GRASS, 'R2 does not clear land-side pixels');
  assert.deepEqual(h.pixel(48, 1), ROUTE, 'road redraw remains above transparent water');
  assert.deepEqual(h.pixel(48, 5), [112, 64, 32, 255], 'bridge rail redraw remains above transparent water');

  const readyRefreshes = h.counters.refreshes;
  h.water.identity = 'act1-hifi/materials/water-next.png|' + 'b'.repeat(64);
  h.water.status = 'loading'; h.water.registered = false;
  h.api.updateTerrain(h.scene, false);
  assert.equal(h.counters.refreshes, readyRefreshes + 1, 'asset identity change invalidates same-window transparency');
  assert.deepEqual(h.pixel(12, 12), ANALYTIC_WATER, 'analytic water returns while the replacement identity is pending');

  h.water.status = 'ready'; h.water.registered = true;
  h.textures.set(h.water.key, { setFilter() {} });
  h.api.updateTerrain(h.scene, false);
  const activeRefreshes = h.counters.refreshes;
  h.water.registered = false;
  h.api.updateTerrain(h.scene, false);
  assert.equal(h.counters.refreshes, activeRefreshes + 1, 'loss of the registered texture invalidates the same-window R2 underlay');
  assert.deepEqual(h.pixel(12, 12), ANALYTIC_WATER, 'analytic water is restored when the matching TileSprite cannot be registered');
});

test('production biome fill clears only wet runs, preserves dry substrate, and bounds clear operations by rows', () => {
  const h = makeHarness({ biome: true });
  h.water.status = 'ready'; h.water.registered = true;
  h.textures.set(h.water.key, { setFilter() {} });
  h.api.updateTerrain(h.scene, false);
  assert.deepEqual(h.pixel(8, 12), [0, 0, 0, 0], 'wet pixels in opaque biome-fill tiles expose R2 too');
  assert.deepEqual(h.pixel(40, 12).slice(3), [255], 'dry biome-fill substrate remains opaque');
  const biomeClears = h.counters.clearRects.filter(r => r.y < 48 && r.height === 4);
  assert.ok(biomeClears.length > 0 && biomeClears.length <= 12,
    `wet clearing is coalesced into row runs, got ${biomeClears.length} calls`);
  assert.equal(h.counters.waterSamples, 576 + 144, 'uses existing renderer/biome sampling loops, with no extra field sweep');
});

test('non-R2 or non-plate windows retain the legacy analytic water fallback', () => {
  const h = makeHarness();
  h.api.updateTerrain(h.scene, false);
  assert.deepEqual(h.pixel(12, 12), ANALYTIC_WATER, 'missing R2 texture keeps the established analytic fallback');
  h.water.status = 'ready'; h.water.registered = true;
  h.textures.set(h.water.key, { setFilter() {} });
  h.scene.cameras.main.worldView.x = 164 * 33.6;
  h.terrainState.lastWin = '';
  h.api.updateTerrain(h.scene, true);
  assert.deepEqual(h.pixel(12, 12), ANALYTIC_WATER, 'a window without plate intersection does not use the plate sea override');
});
