'use strict';
// Honest player, day 4: try a boss setting without touching the game. Fights one boss from the balance-doors.json hero of a profile.
//   NODE_PATH=... PROBE_URL=... node scripts/auto/honest/tune.cjs <profile> <boss> '<json: the boss entry for window.__QOK_BALANCE__.table.bosses, or "-" for the table as shipped>' [tries] [reference|savvy]
// The entry replaces the boss's whole row in the page's table for this process only (same as sampler.cjs --over). Prints one row.
const fs = require('fs'), path = require('path'), S = require('./sampler.cjs');
const [profile, boss, over, tries, policy] = process.argv.slice(2);
const fx = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'checks', 'balance-doors.json'), 'utf8'));
const set = policy === 'savvy' ? fx.savvyDoors[profile] : fx.doors[profile], d = { ...set[boss] };
if (process.env.TUNE_DOOR) { const r = JSON.parse(fs.readFileSync(process.env.TUNE_DOOR, 'utf8')); d.record = { state: r.state, quizStats: r.quizStats || {} }; d.from = process.env.TUNE_DOOR; }   // a hero from another run: <runs>/<run>/door-<boss>.json
(async () => {
  const rows = await S.sample({ profile, doors: [{ boss, zone: d.zone, record: d.record, from: d.from, tries: +(tries || 100) }], policy: policy || 'reference', over: over && over !== '-' ? { [boss]: JSON.parse(over) } : null, seed: +(process.env.BALANCE_SEED || 20261127) });
  const r = rows[0], w = (k, n) => { const p = k / n, z = 1.96, dd = 1 + z * z / n, c = (p + z * z / (2 * n)) / dd, h = z * Math.sqrt(p * (1 - p) / n + z * z / (4 * n * n)) / dd; return `${Math.round((c - h) * 100)}-${Math.round((c + h) * 100)}`; };
  console.log(`${profile} ${policy || 'reference'} ${boss} L${r.level} ${over || '-'} | wins ${r.wins}/${r.n} ${Math.round(r.wins / r.n * 100)}% (95% ${w(r.wins, r.n)}) | rounds ${r.roundsMedian} | ${Math.round(r.secMedian)} s | items ${r.itemsMedian} | worst hit ${Math.round(r.worstPct * 100)}% | boss ${r.mhp}/${r.matk}/${r.mdef}`);
})().catch(e => { console.error(e); process.exit(1); });
