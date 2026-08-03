// Verify the terrain maths ported into public/dq-tiles.js, without needing the game to boot.
// The preview has a pre-existing boot failure (act1-hifi adapter timeout, reproduced with the
// ORIGINAL dq-tiles.js and no materials), so browser verification is unavailable. These are the
// new pure functions, so they can be exercised directly.
const fs = require('fs');
const path = require('path');

const SRC = path.join(__dirname, '..', 'public', 'dq-tiles.js');
let src = fs.readFileSync(process.argv[2] || SRC, 'utf8');

// expose the internals for testing WITHOUT touching the shipped file
const marker = 'window.__DQ_TILES__=';
if (!src.includes(marker)) throw new Error('export marker not found');
src = src.replace(marker,
  'window.__DQ_TEST__={vnoise:vnoise,ridgedAt:ridgedAt,beachyAt:beachyAt,bankOver:bankOver,' +
  'siteOver:siteOver,sitesFor:sitesFor,matPx:matPx,MAT:MAT,setWin:function(a){_winSites=a;}};\n  ' +
  marker);

const win = { __DQ_DEBUG__: false, addEventListener() {} };
const doc = { createElement: () => ({ getContext: () => null, width: 0, height: 0 }) };
function ImageStub() { setTimeout(() => this.onerror && this.onerror(), 0); }
const sandbox = { window: win, document: doc, Image: ImageStub, console,
                  setInterval: () => 0, clearInterval: () => {}, requestAnimationFrame: () => 0,
                  setTimeout, Math, Date, Object, Array, Float32Array, Uint8Array, JSON };
sandbox.globalThis = sandbox;
require('vm').createContext(sandbox);
require('vm').runInContext(src, sandbox);
const T = win.__DQ_TEST__;
if (!T) throw new Error('internals not exposed');

let fail = 0;
const check = (name, ok, detail) => {
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '   ' + detail : ''}`);
  if (!ok) fail++;
};

// ---- ridged height field --------------------------------------------------------------
let lo = 9, hi = -9, nan = 0;
for (let y = 0; y < 4000; y += 37) for (let x = 0; x < 4000; x += 41) {
  const v = T.ridgedAt(x, y);
  if (!Number.isFinite(v)) nan++;
  if (v < lo) lo = v; if (v > hi) hi = v;
}
check('ridgedAt finite everywhere', nan === 0, `${nan} non-finite`);
check('ridgedAt in [0,1]', lo >= 0 && hi <= 1.001, `range ${lo.toFixed(3)}..${hi.toFixed(3)}`);
check('ridgedAt actually varies', hi - lo > 0.35, `spread ${(hi - lo).toFixed(3)}`);

// crests: a ridged field must be SKEWED toward its high end, unlike plain value noise which is
// symmetric about 0.5. That skew is the whole point -- it is what makes ridgelines.
let vals = [];
for (let y = 0; y < 3000; y += 29) for (let x = 0; x < 3000; x += 31) vals.push(T.ridgedAt(x, y));
vals.sort((a, b) => a - b);
const med = vals[vals.length >> 1];
const mean = vals.reduce((a, b) => a + b, 0) / vals.length;
check('ridgedAt is crest-skewed (median > mean)', med > mean,
      `median ${med.toFixed(3)} mean ${mean.toFixed(3)}`);

// ---- shore character ------------------------------------------------------------------
let b0 = 9, b1 = -9, bn = 0, beachyFrac = 0, n = 0;
for (let y = 0; y < 6000; y += 53) for (let x = 0; x < 6000; x += 59) {
  const v = T.beachyAt(x, y);
  if (!Number.isFinite(v)) bn++;
  if (v < b0) b0 = v; if (v > b1) b1 = v;
  beachyFrac += v; n++;
}
check('beachyAt finite', bn === 0);
check('beachyAt in [0,1]', b0 >= 0 && b1 <= 1, `range ${b0.toFixed(2)}..${b1.toFixed(2)}`);
check('beachyAt gives BOTH shore kinds', b0 < 0.05 && b1 > 0.95,
      `mean ${(beachyFrac / n).toFixed(2)} -> mix of beach and vegetated`);

// ---- bank -----------------------------------------------------------------------------
let bad = 0, changedBeach = 0, changedVeg = 0;
for (let W = 0.0; W <= 0.7; W += 0.01) {
  for (const beachy of [0, 1]) {
    const c = [100, 110, 40];
    const before = c.slice();
    const out = T.bankOver(c, 1234, 5678, W, 0.25, beachy);
    for (const v of out) if (!Number.isFinite(v) || v < 0 || v > 255) bad++;
    const d = Math.abs(out[0] - before[0]) + Math.abs(out[1] - before[1]);
    if (beachy === 1) changedBeach += d; else changedVeg += d;
  }
}
check('bankOver stays in range', bad === 0, `${bad} out-of-range channels`);
check('bankOver: beach stretches get much more sand than vegetated ones',
      changedBeach > changedVeg * 3, `beach ${changedBeach.toFixed(0)} vs veg ${changedVeg.toFixed(0)}`);

// ---- landmark sites -------------------------------------------------------------------
// synthetic map: a village (6) in grass, a cave (7) buried in mountain (4)
const H = 40, Wd = 40;
const map = Array.from({ length: H }, () => new Array(Wd).fill(0));
map[10][10] = 6;
for (let y = 24; y < 34; y++) for (let x = 24; x < 34; x++) map[y][x] = 4;
map[29][29] = 7;
const sites = T.sitesFor(map);
check('sitesFor finds both landmarks', sites.length === 2, `found ${sites.length}`);
const village = sites.find(s => s.r === 130), cave = sites.find(s => s.r === 90);
check('town gets the larger clearing', !!village && !!cave);
check('cave in a range takes the ROCK site tone', !!cave && cave.t[0] === 104 && cave.t[2] === 86,
      cave ? `tone ${cave.t}` : 'missing');
check('village on grass takes packed EARTH', !!village && village.t[0] === 128,
      village ? `tone ${village.t}` : 'missing');

T.setWin(sites);
let sbad = 0, painted = 0;
for (let y = 0; y < 2000; y += 13) for (let x = 0; x < 2000; x += 17) {
  const c = [100, 110, 40];
  const out = T.siteOver(c, x, y, 0.2);
  for (const v of out) if (!Number.isFinite(v) || v < 0 || v > 255) sbad++;
  if (Math.abs(out[0] - 100) > 2) painted++;
}
check('siteOver stays in range', sbad === 0, `${sbad} out-of-range`);
check('siteOver actually paints near a landmark', painted > 0, `${painted} sampled px affected`);
// a site must never be painted over water
let overWater = 0;
for (let y = 0; y < 2000; y += 13) for (let x = 0; x < 2000; x += 17) {
  const c = [10, 34, 55];
  const out = T.siteOver(c, x, y, 0.8);
  if (out[0] !== 10 || out[1] !== 34 || out[2] !== 55) overWater++;
}
check('siteOver never paints over water', overWater === 0, `${overWater} water px touched`);

console.log(fail === 0 ? '\nALL CHECKS PASSED' : `\n${fail} CHECK(S) FAILED`);
process.exit(fail === 0 ? 0 : 1);
