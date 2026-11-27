'use strict';
// Honest player, day 4 B2: timeouts of the three independent children (childmodel.cjs) against the game's quiz timers, worked out
// from a corpus of real questions (corpus.cjs) with no browser. Nothing here is evidence about real children: the child times are assumptions.
//   node scripts/auto/honest/timers.cjs <corpus.json> [--json out.json] [--kinds]
// Game side (facts): timer = round(1.5 x round(max(5, round(base[grade] x tier)) x class)) on the keypad; class = the generated factor of the
// question's plan row (scripts/auto/honest/effort-ref.json, the game's own table), clamped to [1, cap]. cap "off" = qok-crit-class=0.
// The answer streak bonus (0 to 3 s) is left out: the shortest timer she can meet.
const fs = require('fs'), path = require('path');
const M = require('./childmodel.cjs'), { PROFILES, KEYPAD } = require('./profiles.cjs');
const E = JSON.parse(fs.readFileSync(path.join(__dirname, 'effort-ref.json'), 'utf8'));
const BASE = { k: 30, 1: 25, 2: 22, 3: 18, 4: 16, 5: 16, 6: 14 }, TIER = { weak: 1.5, normal: 1, strong: 0.85, midBoss: 0.9, boss: 0.85, lateBoss: 0.8, finalBoss: 0.75 };
const q20 = v => Math.round(v * 20) / 20;
const rawClass = (g, act, row) => { const r = E.rows[g] && E.rows[g][act] && E.rows[g][act][row]; return r ? Math.max(1, q20(r.mean / E.ref[g])) : 1; };
const timer = (g, tier, m, keypad = true) => { const s = Math.round(Math.max(5, Math.round(BASE[g] * TIER[tier])) * m); return keypad ? Math.round(s * 1.5) : s; };
function phi(z) { const t = 1 / (1 + 0.2316419 * Math.abs(z)), d = 0.3989423 * Math.exp(-z * z / 2); let p = d * t * (0.3193815 + t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274)))); return z > 0 ? 1 - p : p; }
// P(thinking + typing >= T): thinking log-normal around her median
function pTimeout(r, T, type) { const left = T - type; if (left <= 0) return 1; return 1 - phi((Math.log(left) - Math.log(r.median)) / r.sd); }
// seconds she spends on the question: her own time, or the whole timer when it runs out first. E[min(X, c)] for a log-normal X.
function spent(r, T, type) { const c = T - type; if (c <= 0) return T; const mu = Math.log(r.median), sd = r.sd; return type * phi((Math.log(c) - mu) / sd) + Math.exp(mu + sd * sd / 2) * phi((Math.log(c) - mu - sd * sd) / sd) + T * (1 - phi((Math.log(c) - mu) / sd)); }
const CAPS = { off: 1, 2: 2, 3: 3 };
function run(corpus, o = {}) {
  const out = {};
  for (const g of Object.keys(corpus.q)) { const prof = 'g' + g, kp = KEYPAD[prof];
    for (const child of Object.keys(M.CHILDREN)) for (const cap of Object.keys(CAPS)) for (const set of ['fight', 'demonKing']) {
      const key = [g, child, cap, set].join('|'), acc = { n: 0, to: 0, sec: 0, spent: 0, list: [], right: 0, acts: {}, kinds: {}, unknown: 0, worst: 0, limit: 0 };
      for (const [act, boss, row, en, ans] of corpus.q[g]) {
        if (set === 'fight' ? boss : !(boss && act === 5)) continue;
        const r = M.rate(en, g, child), m = Math.min(CAPS[cap], cap === 'off' ? 1 : rawClass(g, act, row)), T = timer(g, set === 'fight' ? 'strong' : 'finalBoss', m);
        const type = (kp.first + kp.key * String(ans).length) * r.typeMul, p = pTimeout(r, T, type);
        acc.n++; acc.to += p; acc.sec += r.median * Math.exp(r.sd * r.sd / 2) + type; acc.spent += spent(r, T, type); acc.list.push([r, T, type]); acc.right += M.pRight(PROFILES[prof].p, r); acc.limit += T; if (r.kind === 'unknown') acc.unknown++;
        const a = acc.acts[act] = acc.acts[act] || { n: 0, to: 0 }; a.n++; a.to += p;
        const k = acc.kinds[r.kind] = acc.kinds[r.kind] || { n: 0, to: 0, med: 0, T: 0, m: 0, act: {} }; k.n++; k.to += p; k.med += r.median + type; k.T += T; k.m += m; k.act[act] = 1;
      }
      // the factor every timer of this set would need for her to time out on under 5% of the answers (bisection on one common factor)
      { let lo = 1, hi = 12; const share = k => acc.list.reduce((x, [r, T, type]) => x + pTimeout(r, T * k, type), 0) / Math.max(1, acc.n);
        if (share(1) < 0.05) acc.need = 1; else { for (let i = 0; i < 30; i++) { const mid = (lo + hi) / 2; if (share(mid) < 0.05) hi = mid; else lo = mid; } acc.need = Math.round(hi * 20) / 20; } }
      delete acc.list; out[key] = acc; }
  }
  return out;
}
module.exports = { run, timer, rawClass, pTimeout, spent, BASE, TIER };
if (require.main === module) {
  const corpus = JSON.parse(fs.readFileSync(process.argv[2], 'utf8')), R = run(corpus), pc = v => (v * 100).toFixed(v < 0.0995 ? 1 : 0) + '%';
  const ji = process.argv.indexOf('--json'); if (ji > 0) fs.writeFileSync(process.argv[ji + 1], JSON.stringify(R));
  for (const set of ['fight', 'demonKing']) {
    console.log(`\n== ${set === 'fight' ? 'ordinary fights (strong monster: the shortest ordinary timer), all acts' : 'Demon King (final boss timer, Act 5 boss questions)'}: share of answers that time out ==`);
    console.log('grade | child  | class off | cap 2 (today) | cap 3 | worst act at cap 2 / cap 3 | mean answer s | right | unknown kinds');
    for (const g of ['k', '1', '2', '3', '4', '5', '6']) for (const child of ['slow', 'median', 'fast']) {
      const c = cap => R[[g, child, cap, set].join('|')], wa = cap => Math.max(...Object.values(c(cap).acts).map(a => a.to / a.n));
      console.log(`${g.padEnd(5)} | ${child.padEnd(6)} | ${pc(c('off').to / c('off').n).padStart(9)} | ${pc(c('2').to / c('2').n).padStart(13)} | ${pc(c('3').to / c('3').n).padStart(5)} | ${pc(wa('2')).padStart(6)} / ${pc(wa('3')).padStart(6)}           | ${(c('2').sec / c('2').n).toFixed(1).padStart(6)}        | ${pc(c('2').right / c('2').n)}  | ${c('2').unknown} | spent a question: off ${(c('off').spent / c('off').n).toFixed(1)} s, cap 2 ${(c('2').spent / c('2').n).toFixed(1)} s, cap 3 ${(c('3').spent / c('3').n).toFixed(1)} s | mean timer cap 2 ${(c('2').limit / c('2').n).toFixed(0)} s, cap 3 ${(c('3').limit / c('3').n).toFixed(0)} s | timers x${c('3').need} needed for under 5% (from cap 3)`); }
  }
  if (process.argv.includes('--kinds')) for (const g of ['k', '1', '2', '3', '4', '5', '6']) { console.log(`\n-- grade ${g}, SLOW child, ordinary fights: kinds by timeout share at cap 2 --`);
    const a = R[[g, 'slow', '2', 'fight'].join('|')], b = R[[g, 'slow', '3', 'fight'].join('|')], md = R[[g, 'median', '2', 'fight'].join('|')];
    for (const k of Object.keys(a.kinds).sort((x, y) => a.kinds[y].to / a.kinds[y].n - a.kinds[x].to / a.kinds[x].n).slice(0, 12)) { const A = a.kinds[k], Bk = b.kinds[k], Mk = md.kinds[k];
      console.log(`${k.padEnd(15)} acts ${Object.keys(A.act).join('')} share ${pc(A.n / a.n).padStart(5)} | slow median ${(A.med / A.n).toFixed(0).padStart(3)} s (median child ${(Mk.med / Mk.n).toFixed(0)} s) | timer cap2 ${(A.T / A.n).toFixed(0)} s -> timeouts ${pc(A.to / A.n)} | cap3 ${(Bk.T / Bk.n).toFixed(0)} s -> ${pc(Bk.to / Bk.n)} | class ${(Bk.m / Bk.n).toFixed(2)}`); } }
}
