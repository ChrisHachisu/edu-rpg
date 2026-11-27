'use strict';
// Honest player, day 4: critical hits and timer timeouts per grade and act, side by side for the runs of different banks / switch settings.
//   HONEST_PROFILES=gk,g1,... node scripts/auto/honest/banks.cjs <label=runsDir> [<label=runsDir> ...] [--variant main|savvy] [--out file.md]
// "crit/attack" = critical hits per attack turn, "x1.2/attack" = fast (not critical) hits per attack turn, "timeout/answer" = answers that ran out of time,
// "answer s" = mean seconds per answer incl. the game's pauses. Random fights and boss tries are counted separately ("boss" columns). Needs run logs of run.cjs.
const fs = require('fs'), path = require('path');
const args = process.argv.slice(2).filter(a => a.includes('=') && !a.startsWith('--')), arg = (k, d) => { const i = process.argv.indexOf('--' + k); return i > 0 ? process.argv[i + 1] : d; };
const VAR = arg('variant', 'main'), OUT = arg('out', '');
const PROFILES = (process.env.HONEST_PROFILES || 'gk,g1,g2,g3,g4,g5,g6').split(',');
const pct = v => v == null || isNaN(v) ? '-' : (Math.round(v * 1000) / 10) + '%', r1 = v => v == null || isNaN(v) ? '-' : (Math.round(v * 10) / 10).toString();
const sum = a => a.reduce((x, y) => x + y, 0);
const NAME = p => p === 'gk' ? 'K' : p.slice(1);
function load(dir, p) {
  const out = [];
  for (const d of fs.existsSync(dir) ? fs.readdirSync(dir) : []) { const m = /^(g[k\d])(?:-([a-z]+))?-r(\d+)$/.exec(d); if (!m || m[1] !== p || (m[2] || 'main') !== VAR) continue;
    const f = path.join(dir, d, 'events.jsonl'); if (!fs.existsSync(f)) continue; let ck = null; try { ck = JSON.parse(fs.readFileSync(path.join(dir, d, 'ckpt.json'), 'utf8')); } catch (e) {}
    out.push({ rep: +m[3], done: !!(ck && ck.done), events: fs.readFileSync(f, 'utf8').split('\n').filter(Boolean).map(l => JSON.parse(l)) }); }
  return out;
}
function agg(runs, act) {   // act = 1..5 or 0 for all
  const rf = [], bf = [];
  for (const r of runs) for (const e of r.events) { if (e.optional || (act && e.act !== act)) continue;
    for (const l of [e.leg, e.isleLeg1, e.isleLeg2]) if (l) rf.push(...(l.fights || []));
    if (e.dungeon && e.dungeon.fights) rf.push(...e.dungeon.fights);
    if (e.dungeon && e.dungeon.boss) bf.push(...e.dungeon.boss.tries); }
  const f = a => ({ n: a.length, rounds: sum(a.map(x => x.rounds || 0)), crit: sum(a.map(x => x.crit || 0)), fast: sum(a.map(x => x.fast || 0)), q: sum(a.map(x => x.q || 0)), to: sum(a.map(x => x.to || 0)), sec: sum(a.map(x => x.sec || 0)), ok: sum(a.map(x => x.ok || 0)), eff: sum(a.map(x => x.eff || 0)), effn: sum(a.map(x => x.effn || 0)) });
  return { r: f(rf), b: f(bf) };
}
const labels = args.map(a => a.split('=')[0]), dirs = args.map(a => a.split('=')[1]);
let md = '', J = {};
for (const p of PROFILES) {
  const runs = dirs.map(d => load(d, p)); if (!runs.some(r => r.length)) continue; J[p] = {};
  md += `\n### ${p === 'gk' ? 'Kindergarten' : 'Grade ' + p.slice(1)} (${VAR}; runs per setting: ${labels.map((l, i) => `${l} ${runs[i].length}`).join(', ')})\n\n`;
  const head = ['act']; for (const l of labels) head.push(`${l} crit/attack`, `${l} x1.2/attack`, `${l} timeout/answer`, `${l} answer s`, `${l} think-model s`);
  md += `| ${head.join(' | ')} |\n|${head.map(() => '---').join('|')}|\n`;
  for (const act of [1, 2, 3, 4, 5, 0]) { const row = [act || 'all'];
    labels.forEach((l, i) => { const a = agg(runs[i], act).r, a2 = agg(runs[i], act).b; J[p][l + act] = { random: a, boss: a2 };
      row.push(pct(a.crit / a.rounds) + (a2.n ? ` (boss ${pct(a2.crit / a2.rounds)})` : ''), pct(a.fast / a.rounds), pct(a.to / a.q) + (a2.n ? ` (boss ${pct(a2.to / a2.q)})` : ''), r1(a.sec / Math.max(1, a.q)), a.effn ? r1(a.eff / a.effn) : '-'); });
    md += `| ${row.join(' | ')} |\n`; }
}
if (OUT) { fs.writeFileSync(OUT, md); fs.writeFileSync(OUT.replace(/\.md$/, '.json'), JSON.stringify(J)); } else process.stdout.write(md);
