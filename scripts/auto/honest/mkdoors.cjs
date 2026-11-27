'use strict';
// Honest player: build the fixture of scripts/auto/checks/balance.cjs from one honest playthrough per profile.
//   HONEST_PROFILES=gk,g2,g4,g5 node scripts/auto/honest/mkdoors.cjs <runsDir> [rep, default 1]
// Takes door-<boss>.json (the hero exactly as she reached each boss) from <runsDir>/<profile>-r<rep> (reference policy)
// and, for the Demon King, <runsDir>/<profile>-savvy-r<rep> (careful policy). Profiles default to g1,g3,g6 (the file's day 1 set).
// rep = a number, or 'median': per boss, the run whose hero level at that door is the median over the runs (ties: the weaker hero, then the lower rep),
// so one lucky or unlucky walk does not decide the check. Existing entries for other profiles are kept: the file is merged, never rebuilt from nothing.
const fs = require('fs'), path = require('path');
const DIR = process.argv[2], REP = process.argv[3] || '1';
if (!DIR) { console.error('usage: mkdoors.cjs <runsDir> [rep]'); process.exit(1); }
const dst = path.join(__dirname, '..', 'checks', 'balance-doors.json');
function pickDoor(p, mid, boss) {
  const dirs = REP === 'median' ? fs.readdirSync(DIR).filter(d => new RegExp(`^${p}-${mid}r\\d+$`).test(d)).sort() : [`${p}-${mid}r${REP}`];
  const c = dirs.map(d => ({ from: d, f: path.join(DIR, d, `door-${boss}.json`) })).filter(x => fs.existsSync(x.f)).map(x => ({ from: x.from, r: JSON.parse(fs.readFileSync(x.f, 'utf8')) }));
  if (!c.length) return null; c.sort((a, b) => a.r.state.level - b.r.state.level || a.r.state.maxHp - b.r.state.maxHp || (a.from < b.from ? -1 : 1)); return c[(c.length - 1) >> 1];
}
const W = require('./world.cjs').build(), out = fs.existsSync(dst) ? JSON.parse(fs.readFileSync(dst, 'utf8')) : { doors: {}, savvyDoors: {} };
out.savvyDoors = out.savvyDoors || {}; out.sources = out.sources || {};
for (const p of (process.env.HONEST_PROFILES || 'g1,g3,g6').split(',')) {
  out.doors[p] = {};
  for (const s of W.stops) { const id = s.t === 'isle' ? s.dungeon : s.id, D = W.dungeons[id]; if (!D || !D.bossId || (s.t !== 'dungeon' && s.t !== 'isle')) continue;
    const pick = pickDoor(p, '', D.bossId); if (!pick) { console.error('missing door', p, D.bossId); process.exitCode = 1; continue; }
    out.doors[p][D.bossId] = { zone: D.zone, from: pick.from, record: { state: pick.r.state, quizStats: pick.r.quizStats || {} } }; }
  const sp = pickDoor(p, 'savvy-', 'demonKing');
  if (sp) out.savvyDoors[p] = { demonKing: { zone: out.doors[p].demonKing ? out.doors[p].demonKing.zone : 'demon-castle', from: sp.from, record: { state: sp.r.state, quizStats: sp.r.quizStats || {} } } };
  else console.error('no careful door for', p);
  out.sources[p] = `honest playthroughs ${p}-r${REP === 'median' ? '* (median-level hero per door)' : REP} (HONEST_KEYPAD=${process.env.HONEST_KEYPAD || 'same'}), made ${new Date().toISOString().slice(0, 10)}`;
  console.log(p, Object.keys(out.doors[p]).length, 'bosses', out.savvyDoors[p] ? '+ careful door' : '');
}
fs.writeFileSync(dst, JSON.stringify(out));
console.log('wrote', dst, fs.statSync(dst).size, 'bytes');
