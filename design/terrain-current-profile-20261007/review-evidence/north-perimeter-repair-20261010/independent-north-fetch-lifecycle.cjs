#!/usr/bin/env node
// Reviewer-owned VM probe of the shipped DQ fetch/createImageBitmap branch.
// The public source is read-only; in-memory exports expose internal functions to this test.
const fs = require('fs');
const vm = require('vm');
const srcPath = '/Users/chris/.codex/workspaces/edu-rpg-forward-20261007/public/dq-tiles.js';
let src = fs.readFileSync(srcPath, 'utf8');
const marker = 'window.__DQ_TILES__=';
if (!src.includes(marker)) throw new Error('DQ export marker missing');
src = src.replace(marker,
  'window.__DQ_NORTH_TEST__={A1A:A1A,A1A_FOREST:A1A_FOREST,rects:a1aRects,hide:a1aHideSprites,' +
  'release:a1aReleaseChunks,dropAll:a1aDropAllGpu,texFor:a1aTexFor,place:a1aPlaceSprites};\n  ' + marker);
let now = 100000;
const realNow = Date.now;
Date.now = () => now;
let fetchAttempts = 0, fallbackAttempts = 0, bitmapCloses = 0, pendingDecode = null;
const bitmaps = [];
function makeBitmap(attempt) {
  const bitmap = { width: 284, height: 300, attempt, closed: false,
    close() { this.closed = true; bitmapCloses++; } };
  bitmaps.push(bitmap);
  return bitmap;
}
function fetchStub() {
  fetchAttempts++;
  const attempt = fetchAttempts;
  if (attempt === 1) return Promise.reject(new Error('injected transient fetch failure'));
  return Promise.resolve({ ok: true, blob: () => Promise.resolve({ attempt }) });
}
function createImageBitmapStub(blob) {
  if (blob.attempt === 2) return new Promise(resolve => { pendingDecode = () => resolve(makeBitmap(2)); });
  return Promise.resolve(makeBitmap(blob.attempt));
}
function ImageStub() { this.width = 284; this.height = 300; }
Object.defineProperty(ImageStub.prototype, 'src', {
  set(value) {
    this._src = value;
    if (!value || !value.endsWith('/north.png')) return;
    fallbackAttempts++;
    setTimeout(() => { if (this.onerror) this.onerror(); }, 0);
  }, get() { return this._src; }
});
const window = { __DQ_DEBUG__: false, addEventListener() {}, fetch: fetchStub,
  createImageBitmap: createImageBitmapStub };
const document = { createElement: () => ({ getContext: () => null, width: 0, height: 0 }), querySelector: () => null };
function XhrStub() { this.timeout = 0; this.status = 0; }
XhrStub.prototype.open = function() {}; XhrStub.prototype.send = function() {}; XhrStub.prototype.abort = function() {};
const sandbox = { window, document, Image: ImageStub, console, setInterval: () => 0, clearInterval: () => {},
  requestAnimationFrame: () => 0, setTimeout, clearTimeout, XMLHttpRequest: XhrStub,
  fetch: fetchStub, createImageBitmap: createImageBitmapStub,
  Math, Date, Object, Array, Float32Array, Uint8Array, Uint16Array, Uint32Array, Int32Array,
  JSON, Promise, performance: { now: () => 0 } };
sandbox.globalThis = sandbox;
vm.createContext(sandbox); vm.runInContext(src, sandbox);
const T = window.__DQ_NORTH_TEST__;
if (!T) throw new Error('north test hooks not exposed');
const checks = [];
function check(name, pass, detail = '') {
  checks.push({ name, pass: !!pass, detail });
  console.log(`  ${pass ? 'PASS' : 'FAIL'} ${name}${detail ? ` — ${detail}` : ''}`);
}
const tick = () => new Promise(resolve => setTimeout(resolve, 10));
(async () => {
  try {
    const chunk = { id: 'north-top', x: 0, y: 0, width: 256, height: 256, north: 'north.png' };
    T.A1A.S = 1;
    T.A1A.manifest = { semanticBounds: [0, 0, 255, 255], northSupport: {
      schema: 'north-cliff-overhang-v1', heightPixels: 600, pixelsPerCell: 32 }, chunks: [chunk] };
    T.A1A_FOREST.mode = false;
    let rects = T.rects(0, -1, 1, 1);
    await tick();
    let rec = T.A1A.chunks['north-top'];
    check('north-only visible window requests chunk without base intersection',
      T.A1A.win.includes('north-top') && rects.length === 0,
      JSON.stringify({ fetchAttempts, fallbackAttempts, fail: rec && rec.ld.fail.north }));
    check('primary fetch rejection falls back and records one bounded failure',
      fetchAttempts === 1 && fallbackAttempts === 1 && rec.ld.fail.north === 1);

    now += 1201;
    rects = T.rects(0, -1, 1, 1);
    await tick();
    rec = T.A1A.chunks['north-top'];
    check('backoff retry reaches deferred createImageBitmap decode',
      fetchAttempts === 2 && typeof pendingDecode === 'function' && rec.ld.pend.north === true);

    // Evict exactly while decode is pending. When it resolves, the real stale-job path must close
    // the bitmap instead of attaching it to an obsolete chunk record.
    T.A1A.win = [];
    T.release({ currentMapId: 'greenhollow' });
    check('departure evicts the pending north record', !T.A1A.chunks['north-top']);
    pendingDecode();
    await tick();
    check('late decoded bitmap is disposed after residency eviction',
      bitmapCloses === 1 && bitmaps[0].closed && !rec.north,
      JSON.stringify({ bitmapCloses, oldRecordHasImage: !!rec.north }));

    // Return to the same outside-only window. A new record retries on the primary branch and
    // a fresh bitmap lands; the original failed/evicted request is never reused.
    T.A1A.released = false;
    rects = T.rects(0, -1, 1, 1);
    await tick();
    rects = T.rects(0, -1, 1, 1);
    const reentered = T.A1A.chunks['north-top'];
    check('re-entry loads fresh primary-branch bitmap into new residency',
      fetchAttempts === 3 && fallbackAttempts === 1 && reentered && reentered.north === bitmaps[1] &&
      rects.length === 1 && rects[0].northOnly,
      JSON.stringify({ fetchAttempts, fallbackAttempts, landed: !!(reentered && reentered.north), rects: rects.length }));

    // Create and hide the actual layer sprite, then exercise the renderer's GPU drop on a
    // real leave-map cleanup path while retaining the decoded source in the resident record.
    let destroyed = 0, visible = false, removed = 0, created = 0;
    const keys = new Set(), texture = { setFilter() {} };
    const scene = { currentMapId: 'overworld', currentFloor: 1, cameras: { main: { zoom: 1 } },
      textures: { exists(k) { return keys.has(k); }, remove(k) { removed++; keys.delete(k); },
        addImage(k) { keys.add(k); return texture; }, get() { return texture; } },
      add: { image() { created++; visible = true; return { visible: true, scene, texture,
        setOrigin() { return this; }, setDepth() { return this; }, setScale() { return this; },
        setAlpha() { return this; }, setPosition() { return this; },
        setVisible(v) { visible = this.visible = v; return this; },
        destroy() { destroyed++; this.scene = null; } }; } } };
    T.A1A.spriteScene = scene;
    T.texFor(scene, chunk, reentered, 'north');
    T.place(scene, rects);
    check('north-only placement creates a visible sprite', created === 1 && visible);
    T.hide();
    check('leave-map hide hides north sprite', !visible);
    T.A1A.win = ['north-top'];
    scene.currentMapId = 'greenhollow';
    T.release(scene);
    T.dropAll(); // actual non-overworld teardown after a1aReleaseChunks
    check('leave-map GPU teardown destroys sprite/texture but keeps resident decoded north image',
      destroyed === 1 && removed === 1 && !T.A1A.imgs['a1a_north_north-top'] &&
      !T.A1A.tex['a1a_north_north-top'] && T.A1A.chunks['north-top'].north === bitmaps[1] &&
      !bitmaps[1].closed,
      JSON.stringify({ destroyed, removed, cached: !!T.A1A.chunks['north-top'].north, bitmapCloses }));
  } catch (err) {
    checks.push({ name: 'harness completed', pass: false, detail: String(err && err.stack || err) });
    console.error(err && err.stack || err);
  } finally {
    Date.now = realNow;
    console.log(checks.every(c => c.pass) ? '\nALL FETCH-BRANCH CHECKS PASSED' : '\nFETCH-BRANCH CHECKS FAILED');
    process.exitCode = checks.every(c => c.pass) ? 0 : 1;
  }
})();
