#!/usr/bin/env node
// Exercises the shipped DQ loader/residency functions in a small VM. Internals are exposed only
// in the in-memory source string; public/dq-tiles.js remains byte-for-byte untouched.
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const srcPath = path.join(__dirname, '..', 'public', 'dq-tiles.js');
let src = fs.readFileSync(process.argv[2] || srcPath, 'utf8');
const marker = 'window.__DQ_TILES__=';
if (!src.includes(marker)) throw new Error('DQ export marker missing');
src = src.replace(marker,
  'window.__DQ_NORTH_TEST__={A1A:A1A,A1A_FOREST:A1A_FOREST,rects:a1aRects,chunkRec:a1aChunkRec,' +
  'hide:a1aHideSprites,release:a1aReleaseChunks,northHeight:a1aNorthHeight,drop:a1aDropChunkGpu,' +
  'texFor:a1aTexFor,place:a1aPlaceSprites};\n  ' + marker);

let now = 100000;
const realNow = Date.now;
Date.now = () => now;
let northAttempts = 0, fetchAttempts = 0, bitmapAttempts = 0;
function ImageStub() { this.width = 284; this.height = 300; }
Object.defineProperty(ImageStub.prototype, 'src', {
  set(value) {
    this._src = value;
    if (!value || !value.endsWith('/north.png')) return;
    northAttempts++;
    const attempt = northAttempts;
    setTimeout(() => {
      if (attempt === 1) { if (this.onerror) this.onerror(); }
      else if (this.onload) this.onload();
    }, 0);
  },
  get() { return this._src; },
});

function fetchStub() {
  fetchAttempts++;
  if (fetchAttempts === 1) return Promise.reject(new Error('transient fetch failure'));
  return Promise.resolve({ ok: true, blob: () => Promise.resolve({}) });
}
function bitmapStub() { bitmapAttempts++; return Promise.resolve({ width: 284, height: 300, close() {} }); }
const window = { __DQ_DEBUG__: false, addEventListener() {}, fetch: fetchStub, createImageBitmap: bitmapStub };
const document = { createElement: () => ({ getContext: () => null, width: 0, height: 0 }),
  querySelector: () => null };
function XhrStub() { this.timeout = 0; this.status = 0; }
XhrStub.prototype.open = function() {};
XhrStub.prototype.send = function() {};
XhrStub.prototype.abort = function() {};
const sandbox = { window, document, Image: ImageStub, console, setInterval: () => 0,
  clearInterval: () => {}, requestAnimationFrame: () => 0, setTimeout, clearTimeout,
  XMLHttpRequest: XhrStub,
  fetch: fetchStub, createImageBitmap: bitmapStub,
  Math, Date, Object, Array, Float32Array, Uint8Array, Uint16Array, Uint32Array, Int32Array,
  JSON, Promise, performance: { now: () => 0 } };
sandbox.globalThis = sandbox;
vm.createContext(sandbox);
vm.runInContext(src, sandbox);
const T = window.__DQ_NORTH_TEST__;
if (!T) throw new Error('north test hooks not exposed');

const checks = [];
function check(name, condition, detail = '') {
  checks.push({ name, pass: !!condition, detail });
  console.log(`  ${condition ? 'PASS' : 'FAIL'} ${name}${detail ? ` — ${detail}` : ''}`);
}
function loadState(rec) { const ld = rec && rec.ld; return ld && { pend: ld.pend, fail: ld.fail, next: ld.next }; }
const tick = () => new Promise(resolve => setTimeout(resolve, 10));

(async () => {
  try {
    const chunk = { id: 'north-top', x: 0, y: 0, width: 256, height: 256, north: 'north.png' };
    T.A1A.S = 1;
    T.A1A.manifest = { semanticBounds: [0, 0, 255, 255],
      northSupport: { schema: 'north-cliff-overhang-v1', heightPixels: 600, pixelsPerCell: 32 },
      chunks: [chunk] };
    T.A1A_FOREST.mode = false;

    // An outside-only north window still intersects/requests the owning chunk, without claiming
    // any base pixels are visible.
    let rects = T.rects(0, -1, 1, 1);
    await tick();
    check('outside-only window retains north chunk in residency window',
      T.A1A.win.includes('north-top') && rects && rects.length === 0,
      JSON.stringify({ attempts: northAttempts, win: T.A1A.win, ld: loadState(T.A1A.chunks['north-top']) }));
    check('first north request fails through actual bounded loader',
      fetchAttempts === 1 && northAttempts === 1 && T.A1A.chunks['north-top'].ld.fail.north === 1,
      JSON.stringify({ fetches: fetchAttempts, fallbackImages: northAttempts, ld: loadState(T.A1A.chunks['north-top']) }));

    // Let the actual linear backoff expire, then rebuild the same outside-only window.
    now += 1201;
    rects = T.rects(0, -1, 1, 1);
    await tick();
    const rec = T.A1A.chunks['north-top'];
    check('bounded retry lands north image',
      fetchAttempts === 2 && bitmapAttempts === 1 && northAttempts === 1 &&
      !!(rec && rec.north && rec.north.width === 284) && rec.ld.fail.north === 0,
      JSON.stringify({ fetches: fetchAttempts, bitmaps: bitmapAttempts, fallbackImages: northAttempts,
        ld: loadState(rec), image: !!(rec && rec.north) }));
    rects = T.rects(0, -1, 1, 1);
    check('re-entry sees north support exactly once',
      rects && rects.length === 1 && rects[0].northOnly && rects[0].rec === rec &&
      fetchAttempts === 2 && bitmapAttempts === 1);

    // Seed the corresponding actual north sprite/texture registry entry, then use the shipped
    // hide/release functions on departure. The decoded image is kept by release for cheap re-entry.
    let destroyed = 0, visible = true, removed = 0, created = 0;
    const textureKeys = new Set();
    const texture = { setFilter() {} };
    const scene = { currentMapId: 'overworld', currentFloor: 1,
      cameras: { main: { zoom: 1 } },
      textures: { exists(k) { return textureKeys.has(k); }, remove(k) { removed++; textureKeys.delete(k); },
        addImage(k) { textureKeys.add(k); return texture; }, get() { return texture; } },
      add: { image() { created++; visible = true; const sprite = { visible: true, scene, texture,
        setOrigin() { return this; }, setDepth() { return this; }, setScale() { return this; },
        setAlpha() { return this; }, setPosition() { return this; },
        setVisible(v) { visible = this.visible = v; return this; },
        destroy() { destroyed++; this.scene = null; } }; return sprite; } } };
    T.A1A.spriteScene = scene;
    T.texFor(scene, chunk, rec, 'north');
    T.place(scene, rects);
    check('actual sprite placement creates visible north sprite', created === 1 && visible);
    T.A1A.win = [];
    T.hide();
    check('leaving overworld hides north sprite', !visible);
    scene.currentMapId = 'greenhollow';
    T.release(scene);
    check('departure evicts north record and releases sprite and GPU texture',
      destroyed === 1 && removed === 1 && !T.A1A.imgs['a1a_north_north-top'] &&
      !T.A1A.tex['a1a_north_north-top'] && !T.A1A.chunks['north-top']);

    // Re-entry creates a fresh resident record and exactly one new north request.
    T.A1A.released = false;
    T.A1A.win = [];
    rects = T.rects(0, -1, 1, 1);
    await tick();
    rects = T.rects(0, -1, 1, 1);
    const reentered = T.A1A.chunks['north-top'];
    scene.currentMapId = 'overworld';
    T.texFor(scene, chunk, reentered, 'north');
    T.place(scene, rects);
    check('re-entry recreates the north layer once',
      fetchAttempts === 3 && bitmapAttempts === 2 && northAttempts === 1 && reentered && reentered.north && rects && rects.length === 1 && rects[0].northOnly &&
      created === 2 && visible,
      JSON.stringify({ fetches: fetchAttempts, bitmaps: bitmapAttempts, fallbackImages: northAttempts, creates: created, rects: rects && rects.map(r => ({northOnly:r.northOnly, id:r.c.id})),
        reentered: !!reentered, loaded: !!(reentered && reentered.north), released: T.A1A.released }));
  } catch (err) {
    checks.push({ name: 'harness completed', pass: false, detail: String(err && err.stack || err) });
    console.error(err && err.stack || err);
  } finally {
    Date.now = realNow;
    console.log(checks.every(c => c.pass) ? '\nALL NORTH RUNTIME CHECKS PASSED' : '\nNORTH RUNTIME CHECKS FAILED');
    process.exitCode = checks.every(c => c.pass) ? 0 : 1;
  }
})();
