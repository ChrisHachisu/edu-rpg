'use strict';
// Property test, the hard sideways bound and the bent frame's plan (track S2): random near-wall pushes on every floor.
//   * ALLOWANCE: over each press, level = max(0, level - REFILL x her own un-bent advance along the push) on an un-bent
//     frame, level += her travel across the push on a bent frame; level must never pass BOUND (28 px; snag-slide.js).
//     Also reported: the reviewer's measure (sideways travel in one unbroken run of bent frames; over 30 px with less than a
//     quarter of it gained along the push was his "carry").
//   * PLAN: no bent substep refused by the mover, every bent frame ends exactly where the glide said it would.
//   * FLAT WALL: where the mover alone makes no way at all and no opening lies within 30 px either side (props.cjs's
//     "square into a wall"), the glide moves her 0 px.
//   SNAG_MASKS=<dir> [SNAG_FIX=<module copy>] [PER=1500] [FR=120] [DT=ms | DT=jitter] node scripts/auto/snags/safe.cjs [floor ...]
const S = require('./snaglib.cjs'), Fx = require('./fixsim.cjs');
let seed = 4242; const rnd = () => { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
const keys = process.argv.slice(2).length ? process.argv.slice(2) : Object.keys(S.MAN.floors).concat(Object.keys(S.A1).filter(k => !/^crystalCave/.test(k)));
const PER = +(process.env.PER || 1500), FR = +(process.env.FR || 120), BOUND = +(process.env.BOUND || 28), REFILL = +(process.env.REFILL || 0.5);
const DTS = [1000 / 60, 1000 / 30, 50, 1000 / 45, 120];
const T = { floors: 0, walks: 0, bentWalks: 0, bentFrames: 0, overBound: 0, maxLevel: 0, run30: 0, run48: 0, run96: 0, maxRun: 0, refusedBent: 0, notAsPlanned: 0, flatN: 0, flatMoved: 0, flatMax: 0 }, ex = [], perAct = {};
const actOf = key => { const id = key.replace(/-f\d+$/, ''); const d = S.MAN.dungeons && S.MAN.dungeons[id]; return d ? d.act : 1; };
for (const key of keys) { let m; try { m = S.build(key); } catch (e) { continue; }
  T.floors++; const A = perAct[actOf(key)] || (perAct[actOf(key)] = { walks: 0, overBound: 0, run30: 0, maxLevel: 0 }); let n = 0, guard = 0;
  while (n < PER && guard++ < 2e6) {
    const x = 2 + Math.floor(rnd() * (m.W - 4)), y = 2 + Math.floor(rnd() * (m.H - 4));
    if (!S.free(m, x + 0.5, y + 0.5)) continue; if (m.dist[y * m.W + x] > (12 + 4 + 8) * 3) continue;
    const a = Math.floor(rnd() * 16) * Math.PI / 8 + (rnd() < 0.3 ? (rnd() - 0.5) * 0.3 : 0), ux = Math.cos(a), uy = Math.sin(a), mag = rnd() < 0.25 ? 0.3 + rnd() * 0.7 : 1;
    const p0 = { x: x + rnd(), y: y + rnd() }; if (!S.free(m, p0.x, p0.y)) continue;
    const dt = process.env.DT === 'jitter' ? DTS[Math.floor(rnd() * DTS.length)] : (+process.env.DT || 1000 / 60);
    n++; T.walks++; A.walks++;
    const f = Fx.walk(m, p0, ux, uy, FR, { mag, trace: 'exact', dt }); T.refusedBent += f.refusedBent; T.notAsPlanned += f.mispredicted;
    if (f.bent) { T.bentWalks++; T.bentFrames += f.bent;
      let level = 0, top = 0, prev = [p0.x, p0.y], run = { lat: 0, fwd: 0 }, best = { lat: 0, fwd: 0 };
      for (const q of f.trace) { const dx = q[0] - prev[0], dy = q[1] - prev[1], adv = dx * ux + dy * uy, lat = -dx * uy + dy * ux; prev = q;
        if (q[2]) { level += Math.abs(lat); if (level > top) top = level; run.lat += lat; run.fwd += adv; if (Math.abs(run.lat) > Math.abs(best.lat)) best = { lat: run.lat, fwd: run.fwd }; }
        else { if (adv > 0) level = Math.max(0, level - REFILL * adv); run = { lat: 0, fwd: 0 }; } }
      if (top > T.maxLevel) T.maxLevel = top; if (top > A.maxLevel) A.maxLevel = top;
      if (top > BOUND + 1e-6) { T.overBound++; A.overBound++; if (ex.length < 4000) ex.push({ key, p0: [+p0.x.toFixed(2), +p0.y.toFixed(2)], deg: +(a * 180 / Math.PI).toFixed(2), mag: +mag.toFixed(2), level: +top.toFixed(1), run: +best.lat.toFixed(1) }); }
      const L = Math.abs(best.lat); if (L > T.maxRun) T.maxRun = L;
      if (L > 30 && best.fwd < 0.25 * L) { T.run30++; A.run30++; if (L > 48) T.run48++; if (L > 96) T.run96++; } }
    // square into a flat wall
    const b = { x: p0.x, y: p0.y, dead: false }; { let dd = 0; for (let i = 0; i < FR; i++) { if (S.frame(m, b, ux, uy, dt / 1000, { mag }) < 1e-6) { if (++dd >= 4) { b.dead = true; break; } } else dd = 0; } }   // the mover alone, same frame time
    if (b.dead && Math.hypot(b.x - p0.x, b.y - p0.y) < 3) { let open = false;
      const lines = [[ux, uy]]; if (Math.abs(ux) > 0.02 && Math.abs(uy) > 0.02) { lines.push([Math.sign(ux), 0]); lines.push([0, Math.sign(uy)]); }   // the push, and the axes a leaning stick may be walked along
      for (const [ex, ey] of lines) { const lx = -ey, ly = ex;
        for (const s of [1, -1]) for (let k = 0; k <= 30 && !open; k++) { const px = b.x + s * k * lx, py = b.y + s * k * ly; if (!S.free(m, px, py)) break; if (S.free(m, px + ex * 5, py + ey * 5)) open = true; } }
      if (!open) { T.flatN++; const mvd = Math.hypot(f.x - b.x, f.y - b.y); if (mvd > 0.5) { T.flatMoved++; if (process.env.SHOWFLAT) console.log('FLAT', key, JSON.stringify(p0), (a * 180 / Math.PI).toFixed(1), mag.toFixed(2), 'mover alone ends', b.x.toFixed(1), b.y.toFixed(1), 'with the glide', f.x.toFixed(1), f.y.toFixed(1), 'bent', f.bent); } if (mvd > T.flatMax) T.flatMax = mvd; } }
  }
}
for (const k of ['maxLevel', 'maxRun', 'flatMax']) T[k] = +T[k].toFixed(3);
console.log(JSON.stringify(T)); console.log('per act', JSON.stringify(perAct));
ex.sort((a, b) => b.level - a.level); if (process.env.DUMP) require('fs').writeFileSync(process.env.DUMP, JSON.stringify(ex)); for (const e of ex.slice(0, +(process.env.SHOW || 8))) console.log(JSON.stringify(e));
process.exit(T.overBound || T.refusedBent || T.notAsPlanned || T.flatMoved ? 1 : 0);
