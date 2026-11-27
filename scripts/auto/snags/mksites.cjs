'use strict';
// Builds scripts/auto/snags/sites.json for scripts/auto/checks/snags.cjs from the browser confirmation of the census
// (confirm.cjs run on the build BEFORE the fix): only lips that stopped her dead in the browser there, and whose control
// walk beside them passed (so the mover, not a mechanic, was moving her), are kept: two of each size where there are.
//   SNAG_MASKS=<masks dir> SNAG_A1_CENSUS=<census dir with the Act 1 floors> node scripts/auto/snags/mksites.cjs <dir with base-<floor>.json> scripts/auto/snags/sites.json
const fs = require('fs'), path = require('path'), cp = require('child_process');
const dir = process.argv[2], out = process.argv[3];
const DV = { E: [1, 0], W: [-1, 0], S: [0, 1], N: [0, -1] };
const sites = { made: 'day 4 track S, from the browser confirmation on the build before the fix (game files at 7b7b6ab plus the sound commit)', floors: {}, robot: [] };
const files = fs.readdirSync(dir).filter(f => /^base-.*\.json$/.test(f)).sort();
for (const f of files) {
  const r = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'))[0]; if (!r || !r.walks) continue;
  const lips = [], per = {};
  for (let i = 0; i < r.walks.length; i++) { const w = r.walks[i]; if (!/^lip/.test(w.cls) || w.kind !== 'dead' || w.why !== 'time') continue;
    const c = r.walks[i + 1]; if (!c || !/^control/.test(c.cls) || c.kind !== 'pass') continue;
    const cls = w.cls.replace('lip ', ''); per[cls] = (per[cls] || 0) + 1; if (per[cls] > 2) continue;
    const [ux, uy] = DV[w.d], back = (w.contact[0] + 0.5 - w.start[0]) * ux + (w.contact[1] + 0.5 - w.start[1]) * uy;
    lips.push({ cls, d: w.d, start: w.start, need: Math.round(back + 14), k48: w.k48, deadAt: w.end }); }
  if (lips.length) sites.floors[r.key] = { lips };
}
const keys = Object.keys(sites.floors);
for (const k of ['demonCastle-f4', 'demonCastle-f6']) if (!sites.floors[k]) sites.floors[k] = { lips: [] };
const walls = JSON.parse(cp.execFileSync('node', [path.join(__dirname, 'walls.cjs'), ...Object.keys(sites.floors)], { maxBuffer: 1 << 26 }).toString());
for (const k of Object.keys(sites.floors)) sites.floors[k].walls = (walls[k] || []).slice(0, 2);
for (const k of ['shadowCave-f3', 'emberMines-f3', 'desertTomb-f2', 'obsidianCavern-f4']) if (sites.floors[k]) sites.floors[k].chest = true;
sites.floors['demonCastle-f4'].pit = true;
// the story robot's logged stuck spots of day 3 (soles). With steady frames a push east from three of them is a dead stop
// on the build before the fix (spot.cjs, day 4); from the first she stops at the next lip, 69 px on (need: px she must make).
sites.robot = [
  { key: 'demonCastle-f3', at: [3003.762441297102, 471.34078513513515], d: 'E', need: 100, from: 'story3/mech-demonCastle.try1.log' },
  { key: 'demonCastle-f3', at: [3081, 466], d: 'E', from: 'feel/day3/DOOR-LIPS.md' },
  { key: 'demonCastle-f6', at: [3627, 319], d: 'E', from: 'feel/day3/DOOR-LIPS.md' },
  { key: 'sunkenTempleDungeon-f4', at: [1697.386455736691, 179.99871965726572], d: 'E', from: 'story2/mech-sunkenTempleDungeon.log' }];
// ---- Act 1 (the mover's own glide, dq-tiles.js a1mSnagBend): one floor of each of the four dungeons. Lips are taken
// from the model's census of those floors (SNAG_A1_CENSUS: the folder census.cjs wrote them to), two of each size: with
// the game clock stepped steadily the model and the browser agree to 0.1 px a frame (cmp.cjs, day 4), and the check
// itself shows them dead on a build without the fix.
const A1_FLOORS = ['whisperingWoodsCave-f1', 'sunkenCellar-f2', 'mistyGrotto-f3', 'coastalReef-f2'];
const A1_CEN = process.env.SNAG_A1_CENSUS;
if (A1_CEN) {
  const S = require('./snaglib.cjs'); sites.act1 = { floors: {} };
  for (const key of A1_FLOORS) {
    const cen = JSON.parse(fs.readFileSync(path.join(A1_CEN, key + '.json'), 'utf8')), m = S.build(key), fl = S.A1[key];
    const objs = (fl.assets || []).map(a => [a.x * 48 + 24, a.y * 48 + 24]), farObj = (x, y) => objs.every(o => Math.hypot(o[0] - x, o[1] - y) > 110);
    const picks = [], far = e => picks.every(p => Math.hypot(p.stop[0] - e.stop[0], p.stop[1] - e.stop[1]) > 60);
    const ev = cen.eventList.filter(e => e.nDead === e.tried && !e.prop && e.k48 !== null && farObj(e.stop[0], e.stop[1]));
    for (const [cls, fn] of [['1-3', e => e.k48 <= 3], ['4-10', e => e.k48 >= 4 && e.k48 <= 10], ['11-24', e => e.k48 >= 11 && e.k48 <= 24]]) {
      const pool = ev.filter(fn); let c = 0;
      for (let i = 0; i < pool.length && c < 2; i++) { const e = pool[Math.floor((i * 7919 + 13) % pool.length)]; if (!far(e)) continue;
        const [ux, uy] = DV[e.d], cx = ux ? e.at : e.line, cy = ux ? e.line : e.at;
        let back = 0; while (back < 20 && S.free(m, cx - (back + 1) * ux + 0.5, cy - (back + 1) * uy + 0.5)) back++;
        if (back < 8) continue;
        picks.push({ cls, d: e.d, start: [cx - back * ux + 0.5, cy - back * uy + 0.5], need: back + 14, k48: e.k48, stop: e.stop }); c++; } }
    // the cell her sprite centre is saved on: plain floor nearest the first lip's start
    const p0 = picks[0].start, c0 = [Math.floor(p0[0] / 48), Math.floor((p0[1] - 31) / 48)]; let seed = null, bd = 1e9;
    for (let y = 1; y < fl.height - 1; y++) for (let x = 1; x < fl.width - 1; x++) { if (fl.rows[y].charAt(x) === '#' || (fl.assets || []).some(a => Math.abs(a.x - x) <= 1 && Math.abs(a.y - y) <= 1)) continue;
      const d = Math.hypot(x - c0[0], y - c0[1]); if (d < bd) { bd = d; seed = [x, y]; } }
    const w = JSON.parse(cp.execFileSync('node', [path.join(__dirname, 'walls.cjs'), key], { maxBuffer: 1 << 26 }).toString())[key] || [];
    sites.act1.floors[key] = { seed, lips: picks, walls: w.slice(0, 2), chests: (fl.assets || []).filter(a => a.kind === 'chest').map(a => [a.x, a.y]) };
  }
}
fs.writeFileSync(out, JSON.stringify(sites, null, 1));
if (sites.act1) console.log('Act 1:', Object.keys(sites.act1.floors).map(k => k + ' ' + sites.act1.floors[k].lips.length + ' lips ' + sites.act1.floors[k].walls.length + ' walls').join(', '));
console.log(Object.keys(sites.floors).length, 'floors', Object.values(sites.floors).reduce((a, f) => a + f.lips.length, 0), 'lips', Object.values(sites.floors).reduce((a, f) => a + f.walls.length, 0), 'walls');
