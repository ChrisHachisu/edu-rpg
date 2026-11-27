'use strict';
// Property tests of the fix on the static model: random pushes from near-wall spots, 16 headings + analog magnitudes.
//   after must never be worse than before (progress along the push), must never walk far along a flat wall she pushes square into,
//   and every position is free by construction (the mover decides).
const S = require('./snaglib.cjs'), Fx = require('./fixsim.cjs');
const keys = process.argv.slice(2);
let seed = 12345; const rnd = () => { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
const tot = { n: 0, deadBefore: 0, deadAfter: 0, fixed: 0, regress: 0, worse: 0, better: 0, squareWalk: 0, squareN: 0, maxSquare: 0, bentWalks: 0 };
const worst = [], sq = [];
for (const key of keys) {
  const m = S.build(key), W = m.W, H = m.H; let n = 0, guard = 0;
  while (n < 4000 && guard++ < 2e6) {
    const x = 2 + Math.floor(rnd() * (W - 4)), y = 2 + Math.floor(rnd() * (H - 4));
    if (!S.free(m, x + 0.5, y + 0.5)) continue;
    const d = m.dist[y * W + x]; if (d > (12 + 4 + 8) * 3) continue;         // within ~8 px of the legal edge
    const a = Math.floor(rnd() * 16) * Math.PI / 8 + (rnd() < 0.3 ? (rnd() - 0.5) * 0.3 : 0), ux = Math.cos(a), uy = Math.sin(a), mag = rnd() < 0.25 ? 0.3 + rnd() * 0.7 : 1;
    const p0 = { x: x + rnd(), y: y + rnd() }; if (!S.free(m, p0.x, p0.y)) continue;
    n++; tot.n++;
    const b = S.walk(m, p0, ux, uy, 60, { mag }), f = Fx.walk(m, p0, ux, uy, 60, { mag });
    const pb = (b.x - p0.x) * ux + (b.y - p0.y) * uy, pf = (f.x - p0.x) * ux + (f.y - p0.y) * uy;
    if (b.dead) tot.deadBefore++; if (f.dead) tot.deadAfter++;
    if (b.dead && !f.dead) tot.fixed++; if (!b.dead && f.dead) tot.regress++;
    if (f.bent) tot.bentWalks++;
    if (pf < pb - 6) { tot.worse++; worst.push({ key, p0, a: Math.round(a * 180 / Math.PI), mag, pb, pf, b: [b.x, b.y, b.dead], f: [f.x, f.y, f.dead, f.bent] }); } else if (pf > pb + 6) tot.better++;
    // square into a wall: before made no progress at all in 60 frames and there is no opening within 24 px either side (8 px ahead)
    if (b.dead && Math.hypot(b.x - p0.x, b.y - p0.y) < 3) {
      let open = false; const lx = -uy, ly = ux;
      for (const s of [1, -1]) for (let k = 0; k <= 30 && !open; k++) { const px = p0.x + s * k * lx, py = p0.y + s * k * ly; if (!S.free(m, px, py)) break; if (S.free(m, px + ux * 5, py + uy * 5)) open = true; }
      if (!open) { tot.squareN++; const mvd = Math.hypot(f.x - p0.x, f.y - p0.y); if (mvd > 6) { tot.squareWalk++; sq.push({ key, p0: [Math.round(p0.x), Math.round(p0.y)], a: Math.round(a * 180 / Math.PI), mvd: Math.round(mvd), f: [Math.round(f.x), Math.round(f.y), f.dead, f.bent] }); } if (mvd > tot.maxSquare) tot.maxSquare = mvd; }
    }
  }
}
worst.sort((a, b) => (a.pf - a.pb) - (b.pf - b.pb));
console.log(JSON.stringify(tot)); for (const q of sq.slice(0, 20)) console.log('SQ', JSON.stringify(q));
for (const w of worst.slice(0, 12)) console.log(JSON.stringify(w));
