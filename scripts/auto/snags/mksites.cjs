'use strict';
// Builds scripts/auto/snags/sites.json for scripts/auto/checks/snags.cjs from the browser confirmation of the census
// (confirm.cjs run on the build BEFORE the fix): only lips that stopped her dead in the browser there, and whose control
// walk beside them passed (so the mover, not a mechanic, was moving her), are kept: two of each size where there are.
//   SNAG_MASKS=<masks dir> node scripts/auto/snags/mksites.cjs <dir with base-<floor>.json> scripts/auto/snags/sites.json
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
fs.writeFileSync(out, JSON.stringify(sites, null, 1));
console.log(Object.keys(sites.floors).length, 'floors', Object.values(sites.floors).reduce((a, f) => a + f.lips.length, 0), 'lips', Object.values(sites.floors).reduce((a, f) => a + f.walls.length, 0), 'walls');
