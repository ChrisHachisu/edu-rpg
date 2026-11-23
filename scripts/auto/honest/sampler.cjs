'use strict';
// Honest player, boss sampler: fight bosses N times each from stored "door" records (the hero exactly as an
// honest playthrough brought her to that boss), with the reference policy. Used for tuning and by
// scripts/auto/checks/balance.cjs.
//   NODE_PATH=/opt/node-tools/node_modules PROBE_URL=http://127.0.0.1:5504/ node scripts/auto/honest/sampler.cjs \
//       --dir /home/user/work/honest/tune1 --runs g1-r1,g3-r1,g6-r1 [--bosses demonKing,mosswarden] [--tries 20] \
//       [--over '{"demonKing":{"hp":1500}}'] [--balance 0] [--policy savvy] [--seed n] [--out file.json]
// --over replaces whole boss entries (null removes one) in the page's balance table (window.__QOK_BALANCE__.table.bosses) for this process only.
// --balance 0 sets localStorage['qok-balance']='0' (the shipped numbers).
const fs = require('fs'), path = require('path');
process.env.PROBE_URL = process.env.PROBE_URL || 'http://127.0.0.1:5500/';
process.env.PROBE_OUT = process.env.PROBE_OUT || '/home/user/work/honest/probe-out';
const PROFILES = { g1: { grade: '1', p: 0.70, t: 6, sd: 0.35 }, g3: { grade: '3', p: 0.80, t: 4, sd: 0.35 }, g6: { grade: '6', p: 0.90, t: 3, sd: 0.35 } };
const POLICIES = { reference: { healAt: 0.35, fleeAt: 0.2, bossHealAt: 0, defendCharge: false }, savvy: { healAt: 0.35, fleeAt: 0.2, bossHealAt: 0.5, defendCharge: true } };
const median = a => { if (!a.length) return null; const s = a.slice().sort((x, y) => x - y), m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
const mean = a => a.length ? a.reduce((x, y) => x + y, 0) / a.length : null;

// doors: [{ boss, zone, record: { state, quizStats }, from, tries? }]   ->   rows, one per door
async function sample({ profile, doors, tries = 20, over = null, balanceOff = false, policy = 'reference', seed = 20261123, log = null }) {
  const L = require('../../acts/probe/lib.cjs');
  const INPAGE = fs.readFileSync(path.join(__dirname, 'inpage.js'), 'utf8');
  const prof = PROFILES[profile]; if (!prof) throw new Error('profile ' + profile);
  const o = await L.launch(); const page = o.page, rows = [];
  try {
    const first = doors[0].record;
    await L.bootSave(page, { version: 4, timestamp: Date.now(), player: { ...first.state, position: { mapId: 'overworld', x: 69, y: 256, floor: 1 } }, playtime: 0, quizStats: first.quizStats || {} },
      { settle: 1500, extra: balanceOff ? { 'qok-balance': '0' } : {} });
    await page.evaluate(() => { try { delete window.__GAME_STATE__.encounterManager.onStep; } catch (e) {} });
    await page.evaluate(INPAGE);
    const info = await page.evaluate(ov => { const B = window.__QOK_BALANCE__; if (B && ov) for (const k of Object.keys(ov)) { if (ov[k] === null) delete B.table.bosses[k]; else B.table.bosses[k] = ov[k]; }
      return { balance: !!B, on: B ? B.on() : false, version: B ? B.table.version : null }; }, over);
    for (const d of doors) {
      await page.evaluate(a => { window.__HON.init({ seed: a.seed, profile: a.prof, policy: a.pol }); window.__HON.restore(JSON.stringify({ s: a.rec.state, stats: a.rec.quizStats || {} })); },
        { seed: seed + rows.length, prof, pol: POLICIES[policy], rec: d.record });
      const at = await page.evaluate(() => window.__HON.status());
      const tm = await page.evaluate(a => { const m0 = window.__HON.monster(a[0]), B = window.__QOK_BALANCE__, m = B ? B.tuned(m0, a[1]) : m0; return { baseAtk: m.baseAtk, bossAbilities: m.bossAbilities || [] }; }, [d.boss, prof.grade]);
      const worst = worstHit(tm, prof.grade, at.def);
      const nTry = d.tries == null ? tries : d.tries;
      const b = nTry > 0 ? await page.evaluate(a => window.__HON.bossTrials(a[0], a[1], a[2]), [d.boss, d.zone, nTry]) : { tries: [] };
      const T = b.tries, wins = T.filter(t => t.res === 'win'), loss = T.filter(t => t.res === 'loss');
      const row = { profile, boss: d.boss, from: d.from || null, level: at.level, maxHp: at.maxHp, atk: at.atk, def: at.def, hpIn: at.hp, heals: at.heals, n: T.length, wins: wins.length,
        worst, worstPct: worst / at.maxHp, mhp: T[0] ? T[0].mhp : null, matk: T[0] ? T[0].matk : null, mdef: T[0] ? T[0].mdef : null, roundsMedian: median(T.map(t => t.rounds || 0)), roundsMedianWins: median(wins.map(t => t.rounds || 0)), secMedian: median(T.map(t => t.sec || 0)),
        itemsMedian: median(T.map(t => t.items || 0)), itemsMean: mean(T.map(t => t.items || 0)), itemsMax: Math.max(...T.map(t => t.items || 0)), maxHit: Math.max(...T.map(t => t.maxHit || 0)),
        maxHitPct: Math.max(...T.map(t => (t.maxHit || 0) / t.maxHp)), hpLeftWins: mean(wins.map(t => t.hpEnd / t.maxHp)), bossLeftLoss: mean(loss.map(t => t.mhpEnd / t.mhp)), stuck: T.filter(t => t.res === 'stuck').length, balance: info };
      rows.push(row); if (log) log(row);
    }
  } finally { await o.browser.close(); }
  return rows;
}
// the worst hit the boss can land on this hero (wrong defence answer, top damage roll, rage and charge together): the engine's formula
function worstHit(mon, grade, def) {
  const g = ['k', '1', '2'].includes(grade) ? 0.85 : ['5', '6'].includes(grade) ? 1.3 : 1, ab = mon.bossAbilities || [], rage = ab.find(a => a.type === 'rage'), ch = ab.find(a => a.type === 'charge');
  let A = Math.round(mon.baseAtk * g); if (rage) A = Math.floor(A * (rage.atkMultiplier == null ? 1.5 : rage.atkMultiplier)); if (ch) A = Math.floor(A * (ch.chargeMultiplier == null ? 2 : ch.chargeMultiplier));
  return Math.floor(Math.max(Math.ceil(A * 0.25), A - Math.floor(def / 2)) * 1.15);
}
module.exports = { sample, PROFILES, POLICIES, median, mean, worstHit };

if (require.main === module) {
  const arg = (k, d) => { const i = process.argv.indexOf('--' + k); return i > 0 ? process.argv[i + 1] : d; };
  const DIR = arg('dir', '/home/user/work/honest/runs'), RUNS = arg('runs', 'g1-r1,g3-r1,g6-r1').split(','), ONLY = arg('bosses', '') ? arg('bosses', '').split(',') : null;
  const W = require('./world.cjs').build(), over = arg('over', '') ? JSON.parse(arg('over')) : null, out = [];
  (async () => {
    for (const run of RUNS) {
      const doors = [];
      for (const s of W.stops) { const id = s.t === 'isle' ? s.dungeon : s.id, D = W.dungeons[id]; if (!D || !D.bossId || (s.t !== 'dungeon' && s.t !== 'isle')) continue; if (ONLY && !ONLY.includes(D.bossId)) continue;
        const f = path.join(DIR, run, 'door-' + D.bossId + '.json'); if (fs.existsSync(f)) doors.push({ boss: D.bossId, zone: D.zone, record: JSON.parse(fs.readFileSync(f, 'utf8')), from: run }); }
      if (!doors.length) { console.log('no door records for', run); continue; }
      const rows = await sample({ profile: run.slice(0, 2), doors, tries: +arg('tries', 20), over, balanceOff: arg('balance', '1') === '0', policy: arg('policy', 'reference'), seed: +arg('seed', 20261123) + out.length * 101,
        log: r => console.log(`${r.from} ${r.boss.padEnd(19)} L${r.level} hp${r.maxHp} def${r.def} heals${r.heals} | boss ${r.mhp}/${r.matk}/${r.mdef} | wins ${String(r.wins).padStart(2)}/${r.n} | rounds med ${r.roundsMedian} | sec med ${Math.round(r.secMedian)} | items med ${r.itemsMedian} max ${r.itemsMax} | max hit ${Math.round(r.maxHitPct * 100)}% worst ${Math.round(r.worstPct * 100)}%${r.stuck ? ' STUCK ' + r.stuck : ''}`) });
      out.push(...rows);
    }
    if (arg('out', '')) fs.writeFileSync(arg('out'), JSON.stringify(out, null, 1));
  })().catch(e => { console.error('ERR', e && e.stack || e); process.exit(1); });
}
