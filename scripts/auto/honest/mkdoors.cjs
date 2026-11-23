'use strict';
// Honest player: build the fixture of scripts/auto/checks/balance.cjs from one honest playthrough per profile.
//   node scripts/auto/honest/mkdoors.cjs <runsDir> [rep, default 1]
// Takes door-<boss>.json (the hero exactly as she reached each boss) from <runsDir>/g1-r<rep>, g3-r<rep>, g6-r<rep>.
const fs = require('fs'), path = require('path');
const DIR = process.argv[2], REP = process.argv[3] || '1';
if (!DIR) { console.error('usage: mkdoors.cjs <runsDir> [rep]'); process.exit(1); }
const W = require('./world.cjs').build(), out = { made: new Date().toISOString().slice(0, 10), source: `honest playthroughs r${REP} (reference policy) on the build with the balance table`, doors: {} };
for (const p of ['g1', 'g3', 'g6']) {
  out.doors[p] = {};
  for (const s of W.stops) { const id = s.t === 'isle' ? s.dungeon : s.id, D = W.dungeons[id]; if (!D || !D.bossId || (s.t !== 'dungeon' && s.t !== 'isle')) continue;
    const f = path.join(DIR, `${p}-r${REP}`, `door-${D.bossId}.json`); if (!fs.existsSync(f)) { console.error('missing', f); process.exitCode = 1; continue; }
    const r = JSON.parse(fs.readFileSync(f, 'utf8')); out.doors[p][D.bossId] = { zone: D.zone, from: `${p}-r${REP}`, record: { state: r.state, quizStats: r.quizStats || {} } }; }
  console.log(p, Object.keys(out.doors[p]).length, 'bosses');
}
const dst = path.join(__dirname, '..', 'checks', 'balance-doors.json');
fs.writeFileSync(dst, JSON.stringify(out));
console.log('wrote', dst, fs.statSync(dst).size, 'bytes');
