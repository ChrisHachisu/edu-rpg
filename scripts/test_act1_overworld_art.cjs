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
//   * the CANOPY composite -- `destination-in` is a WHOLE-CANVAS operator, so masking several
//     chunks onto one surface erases all but the last (and blanks the layer entirely when that
//     last mask is empty, as six of the thirty are). Identical rects are NOT sufficient; the
//     masking must be scoped per chunk. This shipped once -- ctxStub models the real semantics
//     so it cannot ship again.
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
// the canopy scratch surface is a real modelled canvas, so per-chunk compositing is exercised
const doc = { createElement: (tag) => {
  if (tag !== 'canvas') return { getContext: () => null, width: 0, height: 0 };
  const c = { width: 0, height: 0, _ctx: null };
  c.getContext = () => (c._ctx || (c._ctx = ctxStub()));
  return c;
} };

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
// A canvas 2D context that MODELS compositing coverage, not just records calls.
//
// This exists because a pure call-recorder cannot catch the bug this file is most needed for:
// `destination-in` is a WHOLE-CANVAS operator, so masking several chunks onto one surface erases
// all but the last, and every rect-equality assertion still passes. The model tracks which 48px
// cells hold content and applies the real semantics -- source-over adds inside the dst rect,
// destination-in keeps content inside the dst rect and CLEARS EVERYTHING OUTSIDE IT.
const G = 48;
function ctxStub() {
  const calls = [];
  const marks = new Set();
  const key = (x, y) => x + ',' + y;
  const eachCell = (x, y, w, h, fn) => {
    for (let cy = Math.floor(y / G) * G; cy < y + h; cy += G)
      for (let cx = Math.floor(x / G) * G; cx < x + w; cx += G) fn(cx, cy);
  };
  return {
    calls, marks, globalCompositeOperation: 'source-over', globalAlpha: 1, imageSmoothingEnabled: true,
    _stack: [],
    save() { this._stack.push([this.globalCompositeOperation, this.globalAlpha, this.imageSmoothingEnabled]); },
    restore() { const s = this._stack.pop();
      if (s) { this.globalCompositeOperation = s[0]; this.globalAlpha = s[1]; this.imageSmoothingEnabled = s[2]; } },
    clearRect(x, y, w, h) { calls.push({ op: 'clear', x, y, w, h });
      eachCell(x, y, w, h, (cx, cy) => marks.delete(key(cx, cy))); },
    drawImage(im, sx, sy, sw, sh, dx, dy, dw, dh) {
      calls.push({ op: 'draw', im, sx, sy, sw, sh, dx, dy, dw, dh,
                   gco: this.globalCompositeOperation, alpha: this.globalAlpha,
                   smooth: this.imageSmoothingEnabled });
      if (this.globalCompositeOperation === 'destination-in') {
        for (const k of [...marks]) {                       // the whole-canvas part
          const [cx, cy] = k.split(',').map(Number);
          if (!(cx >= dx && cx < dx + dw && cy >= dy && cy < dy + dh)) marks.delete(k);
        }
      } else {
        eachCell(dx, dy, dw, dh, (cx, cy) => marks.add(key(cx, cy)));
      }
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
// assert at DRAW time, not after: a1aBlit correctly save()/restore()s around the pass, so
// reading the flag afterwards tests the stub's restore(), not the renderer.
check('blit disables smoothing for every draw',
      ctx.calls.filter(c => c.op === 'draw').every(c => c.smooth === false),
      `${ctx.calls.filter(c => c.op === 'draw' && c.smooth !== false).length} smoothed draws`);

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

// ---- canopy: EVERY visible chunk must survive the masking, not just the last ---------------
// The regression this guards: `destination-in` on a shared surface erases every chunk but the
// last. Masking must therefore happen per chunk (on a scratch surface), exactly as
// public/act1-hifi/runtime.html's canopyFor() does it.
const cctx = ctxStub();
const drew = A.canopy(cctx, X0, Y0, winW, winH);
check('canopy reports that it drew', drew === true, `drew=${drew}`);
check('canopy clears the window before compositing',
      cctx.calls.some(c => c.op === 'clear' && c.w === winW * TILE && c.h === winH * TILE));

// destination-in must NOT be applied to the window surface itself
check('window surface is never masked directly (masking is scoped to the scratch surface)',
      !cctx.calls.some(c => c.op === 'draw' && c.gco === 'destination-in'));

// the load-bearing assertion: coverage retained under every visible chunk's rect
const rects = A.rects(X0, Y0, winW, winH).filter(r => r.rec.canopy);
let uncovered = 0;
for (const r of rects) {
  let any = false;
  for (let cy = r.dy; cy < r.dy + r.h && !any; cy += TILE)
    for (let cx = r.dx; cx < r.dx + r.w && !any; cx += TILE)
      if (cctx.marks.has(cx + ',' + cy)) any = true;
  if (!any) uncovered++;
}
check('every masked chunk retains its canopy (destination-in did not erase its neighbours)',
      rects.length > 1 && uncovered === 0, `${uncovered}/${rects.length} chunks erased`);

// ---- landmarks: assert what the CODE produced, against the real plate ---------------------
// The placed game objects are retained here, so deleting setOrigin/setPosition from dq-tiles.js
// fails these checks. (An earlier revision of this file computed the expectations and never
// compared them to anything the code did — it passed no matter what the renderer was doing.)
const plateRows = eval(fs.readFileSync(path.join(ROOT, 'public/act1-world-map.js'), 'utf8')
  .match(/var ROWS *= *(\[[\s\S]*?\]);/)[1]);
const map = [];                                            // a full-size mapData with the real plate written in
for (let y = 0; y < 400; y++) map.push(new Array(320).fill(0));
for (let y = 0; y < plateRows.length; y++)
  for (let x = 0; x < plateRows[y].length; x++)
    map[B[1] + y][B[0] + x] = parseInt(plateRows[y].charAt(x), 36);

const placedTex = {};
const objs = [];
const sceneStub = {
  textures: { exists: k => !!placedTex[k], addImage: (k) => { placedTex[k] = true; } },
  add: { image: () => { const o = { visible: false, texture: { key: '' }, depth: 0,
    setDepth(d) { this.depth = d; return this; }, setTexture(k) { this.texture.key = k; return this; },
    setOrigin(x, y) { this.ox = x; this.oy = y; return this; },
    setPosition(x, y) { this.px = x; this.py = y; return this; },
    setDisplaySize(w, h) { this.dw = w; this.dh = h; return this; },
    setVisible(v) { this.visible = v; return this; } };
    objs.push(o); return o; } },
};
const seen = {};
A.landmarks(sceneStub, map, 0, 320, 0, 400, seen);   // pass 1 starts the (synchronous) texture load
A.landmarks(sceneStub, map, 0, 320, 0, 400, seen);   // pass 2 places them
const bySlug = {};
for (const o of objs) if (o.texture.key) bySlug[o.texture.key.replace(/^a1alm_/, '')] = o;

// only landmarks standing on a real entrance tile may be drawn
const onEntrance = landmarks.landmarks.filter(l => map[l.cell[1]][l.cell[0]] !== 0);
const orphans = landmarks.landmarks.filter(l => map[l.cell[1]][l.cell[0]] === 0);
check('landmarks on a real entrance tile are all drawn',
      onEntrance.every(l => bySlug[l.slug]), `${onEntrance.length} entrances`);
check('a landmark with NO entrance tile is not drawn',
      orphans.length > 0 && orphans.every(l => !bySlug[l.slug]),
      orphans.map(l => `${l.slug}@${l.cell}`).join(' ') || 'none in table');

let originBad = 0, posBad = 0, sizeBad = 0;
for (const lm of onEntrance) {
  const o = bySlug[lm.slug]; if (!o) continue;
  if (Math.abs(o.ox - lm.anchor[0] / lm.size) > 1e-9 ||
      Math.abs(o.oy - lm.anchor[1] / lm.size) > 1e-9) originBad++;
  if (o.px !== lm.cell[0] * TILE + TILE / 2 || o.py !== lm.cell[1] * TILE + TILE / 2) posBad++;
  if (o.dw !== lm.size || o.dh !== lm.size) sizeBad++;
}
check('origin is the MEASURED anchor as a fraction of the sprite', originBad === 0, `${originBad} wrong`);
check('position is the CELL CENTRE', posBad === 0, `${posBad} wrong`);
check('display size is the declared render size', sizeBad === 0, `${sizeBad} wrong`);

// the anchor pixel must therefore land ON the cell centre -- the whole point of the rule
let floatBad = 0;
for (const lm of onEntrance) {
  const o = bySlug[lm.slug]; if (!o) continue;
  const anchorX = o.px - o.ox * o.dw + lm.anchor[0];       // sprite top-left + anchor offset
  const anchorY = o.py - o.oy * o.dh + lm.anchor[1];
  if (anchorX !== lm.cell[0] * TILE + TILE / 2 || anchorY !== lm.cell[1] * TILE + TILE / 2) floatBad++;
}
check('the anchor PIXEL lands exactly on the cell centre (art is not floating)',
      floatBad === 0, `${floatBad} floating`);

const nativeBad = landmarks.landmarks.filter(l => {
  const n = SIZES[`landmarks/${l.slug}.png`]; return n[0] !== l.size || n[1] !== l.size; }).length;
check('sprites ship at their declared render size', nativeBad === 0, `${nativeBad} mismatched`);

console.log(fail ? `\n${fail} CHECK(S) FAILED` : '\nALL CHECKS PASSED');
process.exit(fail ? 1 : 0);
