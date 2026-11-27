'use strict';
// Builds scripts/auto/snags/sites-s2.json for the three safety lines of scripts/auto/checks/snags.cjs (track S2).
// Everything is chosen in the static model (snaglib.cjs + fixsim.cjs), with the FIRST glide (SNAG_OLD: a copy of
// snag-slide.js as it was before track S2, git 922b3d9..ff5dc1e) and the current one side by side:
//   flat   : 40 pushes square into a flat face (no opening within 30 px either side, the mover alone ends within 3 px
//            sideways of where it began), 8 per act; in each act up to 3 are places where the first glide carried her
//            more than 30 px along the face ("offender"), plus the review's two named places;
//   hazard : the Demon Barracks 1F pillar and 30 more places where a bent frame of the first glide carried her into a
//            trigger zone her own push never reaches (hazlib.cjs): guard light, shadow reach, storm cells, glyph plates,
//            ice, a trip wire, exit mouths and stairs;
//   bound  : 200 near-wall pushes per act, on the floors the check seeds anyway: per act 12 are the first glide's
//            widest carries on those floors (allowance level over 48 px), the rest are the sampler's next random pushes.
// A push is left out when any of its walks (mover alone, first glide, current glide) comes within 90 px of stairs, an
// exit, a chest, a sign, a crystal, the boss or a solid mechanic object: those would end the walk with a message or a
// floor change in the browser (the hazard list keeps its exits: they are the point there).
//   SNAG_MASKS=<dir> SNAG_OLD=<old snag-slide.js> node scripts/auto/snags/mksites2.cjs [out.json]
const fs = require('fs'), path = require('path');
const S = require('./snaglib.cjs'), Fx = require('./fixsim.cjs'), HZ = require('./hazlib.cjs');
const OLD = Fx.make(process.env.SNAG_OLD), NEW = Fx;
const SITES = JSON.parse(fs.readFileSync(path.join(__dirname, 'sites.json'), 'utf8'));
const out = process.argv[2] || path.join(__dirname, 'sites-s2.json');
const BOUND = 28, REFILL = 0.5, FRB = 45;
const actOf = key => { const d = S.MAN.dungeons[key.replace(/-f\d+$/, '')]; return d ? d.act : 1; };
const FLOORS = {}; for (const k of Object.keys(SITES.floors).concat(Object.keys(SITES.act1.floors))) (FLOORS[actOf(k)] = FLOORS[actOf(k)] || []).push(k);
const ms = {}, M = key => ms[key] || (ms[key] = S.build(key));
const rng = seed0 => { let seed = seed0; return () => { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; };
const r2 = v => Math.round(v * 100) / 100;
function level(tr, p0, ux, uy) { let lv = 0, top = 0, prev = [p0.x, p0.y]; for (const q of tr) { const dx = q[0] - prev[0], dy = q[1] - prev[1], adv = dx * ux + dy * uy, lat = -dx * uy + dy * ux; prev = q; if (q[2]) { lv += Math.abs(lat); if (lv > top) top = lv; } else if (adv > 0) lv = Math.max(0, lv - REFILL * adv); } return top; }
function things(m) { const fl = m.fl, o = []; for (const a of fl.assets || []) o.push([a.x * 48 + 24, a.y * 48 + 24]); for (const q of fl.mech || []) { const sz = q.size || 1; if (!q.walkable || /door|iceBlock|stopCrystal|block|trough|turntable|mimic/.test(q.kind)) for (let b = 0; b < sz; b++) for (let a = 0; a < sz; a++) o.push([(q.x + a) * 48 + 24, (q.y + b) * 48 + 24]); } return o; }
const clear = (objs, trs, p0) => { for (const o of objs) { if (Math.hypot(o[0] - p0.x, o[1] - p0.y) < 90 || Math.hypot(o[0] - p0.x, o[1] - (p0.y - 31)) < 90) return false; for (const tr of trs) for (const q of tr) if (Math.hypot(o[0] - q[0], o[1] - q[1]) < 90 || Math.hypot(o[0] - q[0], o[1] - (q[1] - 31)) < 90) return false; } return true; };
const nearWall = (m, rnd) => { for (let g = 0; g < 1e6; g++) { const x = 2 + Math.floor(rnd() * (m.W - 4)), y = 2 + Math.floor(rnd() * (m.H - 4)); if (!S.free(m, x + 0.5, y + 0.5)) continue; if (m.dist[y * m.W + x] > (12 + 4 + 8) * 3) continue; const p0 = { x: r2(x + rnd()), y: r2(y + rnd()) }; if (S.free(m, p0.x, p0.y)) return p0; } return null; };
const res = { made: 'day 4 track S2, scripts/auto/snags/mksites2.cjs (static model; first glide = the module before track S2)', bound: BOUND, refill: REFILL, flat: [], hazard: [], pushes: {} };
// SECTIONS=bound,flat,hazard (default all): the others are kept from the file already there
const SEC = (process.env.SECTIONS || 'bound,flat,hazard').split(','), prevFile = fs.existsSync(out) ? JSON.parse(fs.readFileSync(out, 'utf8')) : null;
if (prevFile) { if (!SEC.includes('bound')) res.pushes = prevFile.pushes; if (!SEC.includes('flat')) res.flat = prevFile.flat; if (!SEC.includes('hazard')) res.hazard = prevFile.hazard; }

// ---- bound: 200 per act -------------------------------------------------------------------------------------------
for (const act of (SEC.includes('bound') ? Object.keys(FLOORS).sort() : [])) { const keys = FLOORS[act].sort(), list = [], per = Math.ceil(200 / keys.length), offPer = Math.ceil(12 / keys.length); let offs = 0;
  for (const key of keys) { const m = M(key), objs = things(m), rnd = rng(7000 + act * 131 + keys.indexOf(key)); const pool = [], offenders = [];
    for (let i = 0; i < 6000 && (pool.length < per || offenders.length < offPer * 3); i++) { const p0 = nearWall(m, rnd); if (!p0) break;
      const deg = Math.floor(rnd() * 16) * 22.5 + (rnd() < 0.3 ? r2((rnd() - 0.5) * 17) : 0), a = deg * Math.PI / 180, ux = Math.cos(a), uy = Math.sin(a);
      const fo = OLD.walk(m, p0, ux, uy, FRB, { trace: 'exact' }), fn = NEW.walk(m, p0, ux, uy, FRB, { trace: 'exact' }), b = HZ.beforeTrace(m, p0, ux, uy, FRB, 1);
      if (!clear(objs, [fo.trace, fn.trace, b], p0)) continue;
      const lo = level(fo.trace, p0, ux, uy), ln = level(fn.trace, p0, ux, uy), e = { key, start: [p0.x, p0.y], deg, first: Math.round(lo * 10) / 10, now: Math.round(ln * 10) / 10 };
      if (lo > 48) offenders.push(e); else if (pool.length < per) pool.push(e); }
    offenders.sort((a, b) => b.first - a.first); const take = offenders.slice(0, offPer); offs += take.length;
    for (const e of take) { e.offender = true; list.push(e); } for (const e of pool.slice(0, per - take.length)) list.push(e); }
  res.pushes[act] = list.slice(0, 200); console.error('bound act', act, keys.length, 'floors', res.pushes[act].length, 'pushes,', res.pushes[act].filter(e => e.offender).length, 'offenders, worst now', Math.max(...res.pushes[act].map(e => e.now))); }

// ---- flat: 8 per act ----------------------------------------------------------------------------------------------
const DIRS = [['E', 1, 0], ['S', 0, 1], ['W', -1, 0], ['N', 0, -1]];
function flatAt(m, b, ux, uy) { const lx = -uy, ly = ux; for (const s of [1, -1]) for (let k = 0; k <= 30; k++) { const px = b.x + s * k * lx, py = b.y + s * k * ly; if (!S.free(m, px, py)) break; if (S.free(m, px + ux * 5, py + uy * 5)) return false; } return true; }
function flatSite(m, key, p0, d, ux, uy, mag, objs, why) {
  const b = S.walk(m, p0, ux, uy, 180, { mag }), fo = OLD.walk(m, p0, ux, uy, 180, { mag, trace: 'exact' }), fn = NEW.walk(m, p0, ux, uy, 180, { mag, trace: 'exact' });
  const side = Math.abs((b.x - p0.x) * -uy + (b.y - p0.y) * ux), along = (b.x - p0.x) * ux + (b.y - p0.y) * uy;
  const ok = b.dead && side <= 3 && along >= 4 && along <= 40 && flatAt(m, b, ux, uy) && fn.bent === 0 && Math.hypot(fn.x - b.x, fn.y - b.y) < 0.01;
  if (!why && (!ok || !clear(objs, [fo.trace, fn.trace, [[b.x, b.y]]], p0))) return null;
  const oldSide = Math.abs((fo.x - p0.x) * -uy + (fo.y - p0.y) * ux);
  return { key, start: [p0.x, p0.y], d, m: mag, stop: [r2(b.x), r2(b.y)], side: r2(side), firstGlideSide: Math.round(oldSide * 10) / 10, firstGlideBent: fo.bent, kind: why || (oldSide > 30 ? 'offender' : 'plain'), modelNow: { bent: fn.bent, end: [r2(fn.x), r2(fn.y)] } };
}
const NAMED = [['scorchedRuins-f3', 2309.6, 779.7, 'E', 0.56], ['demonCastle-f9', 174, 2233.6, 'W', 1]];
for (const [key, x, y, d, mag] of (SEC.includes('flat') ? NAMED : [])) { const dv = DIRS.find(q => q[0] === d); res.flat.push(flatSite(M(key), key, { x, y }, d, dv[1], dv[2], mag, [], 'named')); }
for (const act of (SEC.includes('flat') ? Object.keys(FLOORS).sort() : [])) { const keys = FLOORS[act].sort(), offs = [], plain = [], want = 8 - res.flat.filter(e => actOf(e.key) == act).length;
  for (let round = 0; round < 3 && (offs.length < 3 || plain.length < want); round++) for (const key of keys) { const m = M(key), objs = things(m), rnd = rng(9100 + act * 17 + keys.indexOf(key) + round * 1000);
    for (let i = 0; i < 2500; i++) { const p0 = nearWall(m, rnd); if (!p0) break; const dv = DIRS[Math.floor(rnd() * 4)];
      const e = flatSite(m, key, p0, dv[0], dv[1], dv[2], 1, objs, null); if (!e) continue;
      const far = l => l.every(q => q.key !== e.key || Math.hypot(q.start[0] - e.start[0], q.start[1] - e.start[1]) > 60);
      if (e.kind === 'offender') { if (offs.length < 3 && far(offs) && offs.filter(q => q.key === key).length < 2) offs.push(e); } else if (plain.filter(q => q.key === key).length < Math.ceil(want / keys.length) && far(plain)) plain.push(e); } }
  const take = offs.slice(0, 3).concat(plain).slice(0, want); for (const e of take) res.flat.push(e);
  console.error('flat act', act, take.length, 'sites,', take.filter(e => e.kind === 'offender').length, 'offenders'); }

// ---- hazard: the pillar and 30 more --------------------------------------------------------------------------------
const HF = { guardlight: ['demonBarracks-f1', 'demonBarracks-f4'], shadow: ['shadowCave-f3'], strike: ['stormreachSpire-f2'], plate: ['desertTomb-f2'], ice: ['frozenLake-f2'], wire: ['banditHideout-f5', 'banditHideout-f3'], way: ['frostfallCavern-f1', 'shadowCave-f3', 'banditHideout-f3', 'desertTomb-f2', 'demonBarracks-f4', 'stormreachSpire-f2', 'frozenLake-f2'] };
const WANT = { guardlight: 6, shadow: 5, strike: 5, plate: 5, ice: 4, wire: 3, way: 4 };
// what would end a walk early in the browser: a chest, sign, crystal or boss she bumps (a message); for the zones that are not exits, also stairs and mouths
const stoppers = (m, kind) => (m.fl.assets || []).filter(a => kind === 'way' ? !/^(stairs|mouth)/.test(a.kind) : true).map(a => [a.x * 48 + 24, a.y * 48 + 24]);
const awayFrom = (objs, tr) => objs.every(o => tr.every(q => Math.hypot(o[0] - q[0], o[1] - q[1]) > 44 && Math.hypot(o[0] - q[0], o[1] - (q[1] - 31)) > 44));
function hazTry(m, key, kind, H, p0, deg, got, pillar) {
  const a = deg * Math.PI / 180, ux = Math.cos(a), uy = Math.sin(a);
  const fo = OLD.walk(m, p0, ux, uy, 70, { trace: 'exact' }); if (!fo.bent) return false;
  const b = HZ.beforeTrace(m, p0, ux, uy, 70, 1), en = HZ.newEntries(H, fo, b, p0, ux, uy, 72); if (!en.length) return false;
  const e = en[0], fn = NEW.walk(m, p0, ux, uy, 70, { trace: 'exact' });
  if (fn.trace.some(q => e.h.test(q[0], q[1]))) return false;               // (the current glide stays out of it in the model: so does every walk of the property test)
  if (pillar && Math.floor(e.enter[0] / 48) !== 43) return false;
  if (got.some(q => q.key === key && Math.hypot(q.start[0] - p0.x, q.start[1] - p0.y) < 24)) return false;
  if (!awayFrom(stoppers(m, kind), fo.trace.slice(0, e.at + 1).concat(b.slice(0, e.at + 12)).concat([[p0.x, p0.y]]))) return false;
  got.push({ key, kind, zone: e.h.label, start: [p0.x, p0.y], deg, frames: Math.min(70, e.at + 12), shape: e.h.shape, firstGlide: { frame: e.at, from: e.from.map(r2), enter: e.enter.map(r2) }, pillar: pillar || undefined }); return true;
}
for (const kind of (SEC.includes('hazard') ? Object.keys(HF) : [])) { const got = [];
  for (const key of HF[kind]) { if (got.length >= WANT[kind]) break; const m = M(key), H = HZ.hazards(key, m.fl).filter(h => h.kind === kind); if (!H.length) continue;
    if (kind === 'guardlight' && key === 'demonBarracks-f1') {              // the review's pillar case first: cells (41-42, 7-8), north into its south face near its east end
      let done = false; for (let y = 446; y <= 470 && !done; y += 2) for (let x = 2063.5; x >= 2040 && !done; x -= 1) { const p0 = { x, y: y + 0.5 }; if (S.free(m, p0.x, p0.y)) done = hazTry(m, key, kind, H, p0, 270, got, true); } }
    const pts = []; for (const h of H) for (const n of h.nears) pts.push(n); const rnd = rng(31337 + key.length * 7 + kind.length); let perFloor = 0;
    const cap = kind === 'guardlight' ? 3 : (kind === 'way' ? 1 : (kind === 'wire' ? 2 : 99));
    for (let i = 0; i < 1500000 && got.length < WANT[kind] && perFloor < cap; i++) {
      const c = pts[Math.floor(rnd() * pts.length)], x = Math.floor(c[0] + (rnd() - 0.5) * 200), y = Math.floor(c[1] + (rnd() - 0.5) * 200);
      if (x < 2 || y < 2 || x >= m.W - 2 || y >= m.H - 2 || !S.free(m, x + 0.5, y + 0.5) || m.dist[y * m.W + x] > 84) continue;
      const p0 = { x: r2(x + rnd()), y: r2(y + rnd()) }; if (!S.free(m, p0.x, p0.y)) continue;
      if (hazTry(m, key, kind, H, p0, Math.floor(rnd() * 16) * 22.5, got, false)) perFloor++; } }
  // top up from the hazard model's own hit list for the first glide (HAZ_LIST: the lines haz.cjs printed with SNAG_FIX=<first glide> SHOW=3000), full stick only
  if (got.length < WANT[kind] && process.env.HAZ_LIST) { const perKey = {};
    for (const line of fs.readFileSync(process.env.HAZ_LIST, 'utf8').split('\n')) { if (got.length >= WANT[kind]) break; if (line.charAt(0) !== '{' || line.indexOf('"p0"') < 0) continue;
      let c; try { c = JSON.parse(line); } catch (e) { continue; } if (c.mag !== 1 || c.h.split(':')[0] !== kind || (c.deg * 2) % 45 !== 0 || got.some(q => q.key === c.key) && kind === 'way') continue;
      if ((perKey[c.key] || 0) >= 2) continue; const m = M(c.key), H = HZ.hazards(c.key, m.fl).filter(h => h.kind === kind);
      if (hazTry(m, c.key, kind, H, { x: c.p0[0], y: c.p0[1] }, c.deg, got, false)) perKey[c.key] = (perKey[c.key] || 0) + 1; } }
  for (const g of got) res.hazard.push(g); console.error('hazard', kind, got.length, 'of', WANT[kind], got.map(g => g.key + (g.pillar ? '(pillar)' : '')).join(' ')); }
// an Act 1 floor the check does not seed already: the plain cell nearest its first place, for the save
res.seeds = {}; for (const e of res.flat.concat(res.hazard)) { if (!S.A1[e.key] || SITES.act1.floors[e.key] || res.seeds[e.key]) continue; const fl = S.A1[e.key], c0 = [Math.floor(e.start[0] / 48), Math.floor((e.start[1] - 31) / 48)]; let bd = 1e9;
  for (let y = 1; y < fl.height - 1; y++) for (let x = 1; x < fl.width - 1; x++) { if (fl.rows[y].charAt(x) !== '.' || (fl.assets || []).some(a => Math.abs(a.x - x) <= 1 && Math.abs(a.y - y) <= 1)) continue; const d = Math.hypot(x - c0[0], y - c0[1]); if (d < bd) { bd = d; res.seeds[e.key] = [x, y]; } } }
fs.writeFileSync(out, JSON.stringify(res));
console.error('written', out, 'flat', res.flat.length, 'hazard', res.hazard.length, 'pushes', Object.values(res.pushes).reduce((a, l) => a + l.length, 0));
