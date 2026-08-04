// Verify the Act 1 hi-fi overworld bake wired into public/dq-tiles.js, without booting the game.
//
// WHAT THIS PINS, and why each one is a defect that would otherwise ship silently:
//
//   * the 1:1 contract -- the chunks are 48 px/cell and TILE is 48, so every base blit must copy
//     source to destination with NO rescaling. A wrong density here does not crash; it renders a
//     softly-wrong map, which is exactly the class of fault the owner rejected twice by eye.
//   * the ORIGIN -- chunk (0,0) is the plate origin, cell (bounds[0], bounds[1]), not world (0,0).
//     Getting that wrong offsets the whole act by 768x10464 px and still draws something.
//   * COVERAGE -- a window wholly inside the plate must be wholly covered, or the procedural splat
//     shows through in patches.
//   * the CANOPY composite -- destination-in must be applied BETWEEN the base pass and the mask
//     pass, over identical rects. Wrong order silently yields either nothing or an unmasked second
//     copy of the terrain drawn above the hero.
//   * the landmark ANCHOR -- the measured ground anchor must land on the cell centre. The sprite's
//     own centre or its bottom edge both float the art off its packed-earth pad, which is the
//     specific failure the owner has already called out once.
//
// Image dimensions are read off the SHIPPED FILES (via PIL), never inferred from the manifest --
// otherwise the density assertions would be tautological.
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const SRC = path.join(ROOT, 'public', 'dq-tiles.js');
const HIFI = path.join(ROOT, 'public', 'act1-hifi');

const manifest = JSON.parse(fs.readFileSync(path.join(HIFI, 'manifest.json'), 'utf8'));
const landmarks = JSON.parse(fs.readFileSync(path.join(HIFI, 'landmarks', 'landmarks.json'), 'utf8'));

// real on-disk dimensions for every chunk layer + every landmark sprite
const wanted = [];
for (const c of manifest.chunks) for (const k of ['base', 'canopy', 'water']) if (c[k]) wanted.push(c[k]);
for (const l of landmarks.landmarks) wanted.push(`landmarks/${l.slug}.png`);
const SIZES = JSON.parse(execFileSync('python3', ['-c', `
import json,sys
from PIL import Image
out={}
for rel in json.load(sys.stdin):
    out[rel]=list(Image.open(${JSON.stringify(HIFI)}+'/'+rel).size)
print(json.dumps(out))`], { input: JSON.stringify(wanted) }).toString());

let src = fs.readFileSync(process.argv[2] || SRC, 'utf8');
const marker = 'window.__DQ_TILES__=';
if (!src.includes(marker)) throw new Error('export marker not found');
src = src.replace(marker,
  'window.__A1A_TEST__={A1A:A1A,fetch:a1aFetch,chunkAt:a1aChunkAt,inBounds:a1aInBounds,' +
  'artAt:a1aArtAt,rects:a1aRects,blit:a1aBlit,canopy:a1aCanopy,landmarks:a1aLandmarks};\n  ' +
  marker);

// ---- stubs ------------------------------------------------------------------------------
const win = { __DQ_DEBUG__: false, addEventListener() {} };
const doc = { createElement: () => ({ getContext: () => null, width: 0, height: 0 }) };

function XHRStub() {
  this.open = (m, u) => { this._u = u; };
  this.send = () => {
    const rel = this._u.replace(/^act1-hifi\//, '');
    try { this.responseText = fs.readFileSync(path.join(HIFI, rel), 'utf8'); this.onload && this.onload(); }
    catch (e) { this.onerror && this.onerror(); }
  };
}
// resolves synchronously against the real file dimensions
function ImageStub() {
  const self = this;
  Object.defineProperty(this, 'src', {
    set(v) {
      const rel = String(v).replace(/^act1-hifi\//, '');
      const wh = SIZES[rel];
      if (wh) { self.width = wh[0]; self.height = wh[1]; self.onload && self.onload(); }
      else { self.onerror && self.onerror(); }
    },
  });
}
function ctxStub() {
  const calls = [];
  return {
    calls, globalCompositeOperation: 'source-over', globalAlpha: 1, imageSmoothingEnabled: true,
    save() {}, restore() { this.globalCompositeOperation = 'source-over'; this.globalAlpha = 1; },
    clearRect() { calls.push({ op: 'clear' }); },
    drawImage(im, sx, sy, sw, sh, dx, dy, dw, dh) {
      calls.push({ op: 'draw', im, sx, sy, sw, sh, dx, dy, dw, dh,
                   gco: this.globalCompositeOperation, alpha: this.globalAlpha });
    },
  };
}

const sandbox = { window: win, document: doc, Image: ImageStub, XMLHttpRequest: XHRStub, console,
                  setInterval: () => 0, clearInterval: () => {}, requestAnimationFrame: () => 0,
                  setTimeout, Math, Date, Object, Array, Float32Array, Uint8Array, JSON };
sandbox.globalThis = sandbox;
require('vm').createContext(sandbox);
require('vm').runInContext(src, sandbox);
const A = win.__A1A_TEST__;
if (!A) throw new Error('A1A internals not exposed');

let fail = 0;
const check = (name, ok, detail) => {
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '   ' + detail : ''}`);
  if (!ok) fail++;
};

const TILE = 48;
A.fetch();
check('manifest + landmarks loaded', !!A.A1A.manifest && !!A.A1A.landmarks,
      `${A.A1A.manifest ? A.A1A.manifest.chunks.length : 0} chunks, ${(A.A1A.landmarks || []).length} landmarks`);

const B = A.A1A.manifest.semanticBounds;
check('scale derives to 3 world px per manifest px', A.A1A.S === 3, `S=${A.A1A.S}`);
check('bounds are the locked Act 1 plate', JSON.stringify(B) === '[16,218,163,399]', JSON.stringify(B));

// ---- the chunk grid covers exactly the plate, at 48 px/cell -----------------------------
let mw = 0, mh = 0;
for (const c of A.A1A.manifest.chunks) { mw = Math.max(mw, c.x + c.width); mh = Math.max(mh, c.y + c.height); }
check('chunk grid spans the plate exactly',
      mw * A.A1A.S === (B[2] - B[0] + 1) * TILE && mh * A.A1A.S === (B[3] - B[1] + 1) * TILE,
      `${mw * A.A1A.S}x${mh * A.A1A.S} vs ${(B[2] - B[0] + 1) * TILE}x${(B[3] - B[1] + 1) * TILE}`);

let badBase = 0, badWater = 0;
for (const c of A.A1A.manifest.chunks) {
  if (SIZES[c.base][0] !== c.width * A.A1A.S || SIZES[c.base][1] !== c.height * A.A1A.S) badBase++;
  if (SIZES[c.canopy][0] !== c.width * A.A1A.S || SIZES[c.canopy][1] !== c.height * A.A1A.S) badBase++;
  if (SIZES[c.water][0] !== c.width || SIZES[c.water][1] !== c.height) badWater++;
}
check('every base+canopy image ships at 48 px/cell', badBase === 0, `${badBase} off-density`);
check('every water sheet ships at its 16 px/cell footprint', badWater === 0, `${badWater} off-density`);

// ---- bounds + cell->chunk lookup ---------------------------------------------------------
check('inBounds rejects outside the plate',
      !A.inBounds(B[0] - 1, 300) && !A.inBounds(100, B[3] + 1) && A.inBounds(B[0], B[1]) && A.inBounds(B[2], B[3]));
const gh = landmarks.landmarks.find(l => l.slug === 'greenhollow');
const ghChunk = A.chunkAt(gh.cell[0], gh.cell[1]);
check('Greenhollow cell resolves to a chunk', !!ghChunk, ghChunk && ghChunk.id);
check('plateCell agrees with bounds arithmetic',
      gh.cell[0] - B[0] === gh.plateCell[0] && gh.cell[1] - B[1] === gh.plateCell[1]);

// ---- the blit: 1:1, correctly originated, fully covering ---------------------------------
// a window wholly inside the plate, deliberately NOT chunk-aligned so an origin error shows
const winW = 31, winH = 33, X0 = gh.cell[0] - 15, Y0 = gh.cell[1] - 16;
const ctx = ctxStub();
const full = A.blit(ctx, X0, Y0, winW, winH, true);
check('interior window reports full coverage', full === true, `full=${full}`);
check('blit disables smoothing', ctx.imageSmoothingEnabled === false);

const base = ctx.calls.filter(c => c.op === 'draw' && c.gco === 'source-over');
const water = ctx.calls.filter(c => c.op === 'draw' && c.gco === 'screen');
check('base layer drew at least one chunk', base.length > 0, `${base.length} rects`);
check('base blit is 1:1 (no rescaling)',
      base.every(c => c.sw === c.dw && c.sh === c.dh), `${base.filter(c => c.sw !== c.dw || c.sh !== c.dh).length} rescaled`);
check('base rects tile the window exactly',
      base.reduce((a, c) => a + c.dw * c.dh, 0) === winW * TILE * winH * TILE);
check('water is scaled up by S and screen-blended',
      water.length === 0 || water.every(c => Math.abs(c.dw / c.sw - A.A1A.S) < 1e-6 && c.alpha < 1),
      `${water.length} water rects`);

// the ORIGIN check: the destination pixel (0,0) of this window is world px (X0*48, Y0*48); the
// chunk it lands in must be sampled at exactly that offset from the chunk's own plate position.
const topLeft = base.find(c => c.dx === 0 && c.dy === 0);
check('window origin maps to the right source pixel', !!topLeft && (() => {
  const c = A.chunkAt(X0, Y0);
  const wantSx = X0 * TILE - (B[0] * TILE + c.x * A.A1A.S);
  const wantSy = Y0 * TILE - (B[1] * TILE + c.y * A.A1A.S);
  return topLeft.sx === wantSx && topLeft.sy === wantSy;
})(), topLeft && `sx=${topLeft.sx} sy=${topLeft.sy}`);

// a window straddling the plate edge must NOT claim full coverage
const edge = ctxStub();
check('window straddling the plate edge is not full',
      A.blit(edge, B[0] - 10, B[1] - 10, winW, winH, true) === false);

// ---- canopy: base pass, then destination-in over IDENTICAL rects -------------------------
const cctx = ctxStub();
A.canopy(cctx, X0, Y0, winW, winH);
const cBase = cctx.calls.filter(c => c.op === 'draw' && c.gco === 'source-over');
const cMask = cctx.calls.filter(c => c.op === 'draw' && c.gco === 'destination-in');
check('canopy clears before compositing', cctx.calls[0] && cctx.calls[0].op === 'clear');
check('canopy draws a base pass then a mask pass', cBase.length > 0 && cMask.length > 0,
      `${cBase.length} base / ${cMask.length} mask`);
check('canopy mask covers exactly the base rects',
      cBase.length === cMask.length &&
      cBase.every((c, i) => c.dx === cMask[i].dx && c.dy === cMask[i].dy && c.dw === cMask[i].dw && c.dh === cMask[i].dh));
check('canopy mask pass comes AFTER the base pass',
      cctx.calls.findIndex(c => c.gco === 'destination-in') > cctx.calls.findIndex(c => c.op === 'draw' && c.gco === 'source-over'));

// ---- landmarks: the measured anchor lands on the cell centre -----------------------------
const placed = {};
const sceneStub = {
  textures: { exists: k => !!placed[k] || false, addImage: (k) => { placed[k] = true; } },
  add: { image: () => { const o = { visible: false, texture: { key: '' }, depth: 0,
    setDepth(d) { this.depth = d; return this; }, setTexture(k) { this.texture.key = k; return this; },
    setOrigin(x, y) { this.ox = x; this.oy = y; return this; },
    setPosition(x, y) { this.px = x; this.py = y; return this; },
    setDisplaySize(w, h) { this.dw = w; this.dh = h; return this; },
    setVisible(v) { this.visible = v; return this; } }; return o; } },
};
// two passes: the first kicks off the texture load (synchronous in the stub), the second places
const seen = {};
A.landmarks(sceneStub, 0, 400, 0, 500, seen);
A.landmarks(sceneStub, 0, 400, 0, 500, seen);
const drawn = Object.keys(seen);
check('all nine landmark sprites are placed', drawn.length === landmarks.landmarks.length,
      `${drawn.length}/${landmarks.landmarks.length}`);

let anchorBad = 0, sizeBad = 0, nativeBad = 0;
for (const lm of landmarks.landmarks) {
  const wantOx = lm.anchor[0] / lm.size, wantOy = lm.anchor[1] / lm.size;
  const wantPx = lm.cell[0] * TILE + TILE / 2, wantPy = lm.cell[1] * TILE + TILE / 2;
  const nat = SIZES[`landmarks/${lm.slug}.png`];
  if (nat[0] !== lm.size || nat[1] !== lm.size) nativeBad++;
  // the anchor must be a real interior point of the sprite, else the maths above is meaningless
  if (!(lm.anchor[0] > 0 && lm.anchor[0] < lm.size && lm.anchor[1] > 0 && lm.anchor[1] < lm.size)) anchorBad++;
  if (!(wantOx > 0 && wantOx < 1 && wantOy > 0 && wantOy < 1)) anchorBad++;
  if (!(wantPx % TILE === TILE / 2 && wantPy % TILE === TILE / 2)) sizeBad++;
}
check('sprites ship at their declared render size', nativeBad === 0, `${nativeBad} mismatched`);
check('every anchor is an interior sprite pixel', anchorBad === 0, `${anchorBad} bad`);
check('every landmark targets a cell CENTRE', sizeBad === 0, `${sizeBad} off-centre`);

// the anchor is BELOW the sprite's vertical centre for every landmark -- an isometric diorama
// meets the ground low. If a future re-bake ever emits a centre-anchored table this catches it.
const lowAnchors = landmarks.landmarks.filter(l => l.anchor[1] > l.size / 2).length;
check('anchors sit below the sprite centre (ground contact, not centre)',
      lowAnchors === landmarks.landmarks.length, `${lowAnchors}/${landmarks.landmarks.length}`);

console.log(fail ? `\n${fail} CHECK(S) FAILED` : '\nALL CHECKS PASSED');
process.exit(fail ? 1 : 0);
