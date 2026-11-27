'use strict';
// Property test, hazards (track S2): random near-wall pushes started within 130 px of every trigger zone of every floor
// (hazlib.cjs). A HIT is a bent frame that carries her into a zone her own push would not have entered (hazlib.newEntries,
// the reviewer's rule, zone within 72 px straight ahead excepted). Must be 0 on every floor.
//   SNAG_MASKS=<dir> [SNAG_FIX=<module copy>] [PER=3000] [FR=90] [DT=ms] node scripts/auto/snags/haz.cjs [floor ...]
const S = require('./snaglib.cjs'), Fx = require('./fixsim.cjs'), HZ = require('./hazlib.cjs');
let seed = 987654; const rnd = () => { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
const keys = process.argv.slice(2).length ? process.argv.slice(2) : Object.keys(S.MAN.floors).concat(Object.keys(S.A1).filter(k => !/^crystalCave/.test(k)));
const PER = +(process.env.PER || 3000), FR = +(process.env.FR || 90), DT = +(process.env.DT || 0), AHEAD = +(process.env.AHEAD || 72);
const tot = { floors: 0, walks: 0, bentWalks: 0, hits: {}, floorsWith: {}, refusedBent: 0, mispredicted: 0 }, examples = [];
for (const key of keys) {
  let m; try { m = S.build(key); } catch (e) { console.log('skip', key, String(e).slice(0, 80)); continue; }
  const H = HZ.hazards(key, m.fl); if (!H.length) continue;
  const pts = []; for (const h of H) for (const n of h.nears) pts.push(n);
  tot.floors++; let n = 0, guard = 0;
  while (n < PER && guard++ < PER * 400) {
    const c = pts[Math.floor(rnd() * pts.length)], x = Math.floor(c[0] + (rnd() - 0.5) * 2 * 130), y = Math.floor(c[1] + (rnd() - 0.5) * 2 * 130);
    if (x < 2 || y < 2 || x >= m.W - 2 || y >= m.H - 2) continue;
    if (!S.free(m, x + 0.5, y + 0.5)) continue;
    const d = m.dist[y * m.W + x]; if (d > (12 + 4 + 8) * 3) continue;
    const a = Math.floor(rnd() * 16) * Math.PI / 8 + (rnd() < 0.3 ? (rnd() - 0.5) * 0.3 : 0), ux = Math.cos(a), uy = Math.sin(a), mag = rnd() < 0.25 ? 0.3 + rnd() * 0.7 : 1;
    const p0 = { x: x + rnd(), y: y + rnd() }; if (!S.free(m, p0.x, p0.y)) continue;
    n++; tot.walks++;
    const f = Fx.walk(m, p0, ux, uy, FR, { mag, trace: 'exact', dt: DT || undefined }); tot.refusedBent += f.refusedBent; tot.mispredicted += f.mispredicted;
    if (!f.bent) continue; tot.bentWalks++;
    const b = HZ.beforeTrace(m, p0, ux, uy, FR, mag);
    for (const e of HZ.newEntries(H, f, b, p0, ux, uy, AHEAD)) { const kind = e.h.kind; tot.hits[kind] = (tot.hits[kind] || 0) + 1; (tot.floorsWith[kind] = tot.floorsWith[kind] || new Set()).add(key);
      if (examples.length < 3000) examples.push({ key, h: e.h.label, p0: [+p0.x.toFixed(2), +p0.y.toFixed(2)], deg: +(a * 180 / Math.PI).toFixed(2), mag: +mag.toFixed(2), at: e.at, from: e.from.map(v => +v.toFixed(1)), enter: e.enter.map(v => +v.toFixed(1)) }); }
  }
}
const fw = {}; for (const k in tot.floorsWith) fw[k] = [...tot.floorsWith[k]].length;
let hits = 0; for (const k in tot.hits) hits += tot.hits[k];
console.log(JSON.stringify({ floorsWithZones: tot.floors, walks: tot.walks, bentWalks: tot.bentWalks, hits, byKind: tot.hits, floorsByKind: fw, bentSubstepsRefused: tot.refusedBent, bentFramesNotAsPlanned: tot.mispredicted }));
const seen = {}; for (const e of examples) { seen[e.h.split(':')[0]] = (seen[e.h.split(':')[0]] || 0) + 1; if (seen[e.h.split(':')[0]] <= (+process.env.SHOW || 6)) console.log(JSON.stringify(e)); }
process.exit(hits ? 1 : 0);
