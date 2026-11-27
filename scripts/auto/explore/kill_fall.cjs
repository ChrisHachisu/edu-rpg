'use strict';
// Kill the page while she is being blown off a Storm Nest walkway (day 4, track X). Uses the gust probe's own lane walker.
//   node scripts/auto/explore/kill_fall.cjs [+ms after blown]    PROBE_URL, D2_PLANS as the mech probes
const fs = require('fs'), path = require('path');
const { Run } = require('../../acts/probe/mech/_a-lib.cjs');
const D = require('./d4lib.cjs');
const PLANS = process.env.D2_PLANS || '/home/user/work/explore/e1/plans';
const plan = f => JSON.parse(fs.readFileSync(path.join(PLANS, `stormNest-f${f}.json`), 'utf8'));
const GUST = `(() => { const A = window.__A, T = 48;
  const lull = (L, need) => { const t = A.mstate().t / 185, pos = ((t - L.phase) % L.period + L.period) % L.period; return pos >= L.active + 0.5 && (L.period - pos) * 185 >= need; };
  window.__GUST = { lanes: () => A.mstate().lanes.map(L => ({ id: L.id, state: L.state, cells: L.cells, dir: L.dir })),
    async go(goal, opts = {}, again = 0, crossed0 = 0) { const st = A.mstate(), f = A.fdy(), p = A.plan(goal, opts); if (!p) return { ok: false, why: 'no-path' };
      const laneOf = pt => st.cell[Math.floor(pt[0] / T) + ',' + Math.floor((pt[1] + f) / T)] || null; let i = 0, crossed = crossed0; const falls0 = st.falls || 0;
      while (i < p.length) { let j = i; while (j < p.length && !laneOf(p[j])) j++;
        if (j > i + 1) { const r = await A.drive(p.slice(i, j - 1), { tol: 5 }); if (!r.ok || r.why !== 'arrived') {
          // a calm (lane-free) leg that snags on a corner a few px short: plan again from where she stands (twice at most)
          if (r.why === 'stuck' && again < 2) return this.go(goal, opts, again + 1, crossed);
          return Object.assign(r, { seg: 'calm', crossed }); } }
        if (j >= p.length) { const r = await A.drive(p.slice(Math.max(i, j - 1)), { tol: 5 }); return Object.assign(r, { crossed }); }
        let k = j; const Ls = new Set(); while (k < p.length && laneOf(p[k])) { Ls.add(laneOf(p[k])); k++; }
        const need = (k - j + 3) * 12 / 260 * 1000 * 1.4 + 600, t0 = performance.now();
        while (![...Ls].every(L => lull(L, need))) { if (performance.now() - t0 > 30000) return { ok: false, why: 'no-lull', crossed }; await A.wait(50); }
        const r = await A.drive(p.slice(Math.max(i, j - 1), Math.min(p.length, k + 1)), { tol: 6 }); crossed += Ls.size;
        if (!r.ok || r.why !== 'arrived' || (A.mstate().falls || 0) !== falls0 || A.mstate().blown) return Object.assign(r, { ok: false, seg: 'lane', crossed, blown: !!A.mstate().blown });
        i = Math.min(p.length, k + 1); }
      return { ok: true, why: 'arrived', crossed }; } }; })()`;

(async () => {
  const delays = (process.argv.slice(2).length ? process.argv.slice(2) : ['0', '600']).map(Number);
  const R = new Run('stormNest', { bossId: plan(plan(1).totalFloors).assets.find(a => a.kind === 'boss').id, name: 'kill-fall' });
  try {
    if (!(await R.start())) throw new Error('could not enter');
    const page = R.page;
    for (const d of delays) {
      await R.ev(GUST); const P = plan(1), lane = P.zones.find(z => z.kind === 'gustLane'), c = lane.cells[Math.floor(lane.cells.length / 2) % lane.cells.length];
      let g = null; for (const c2 of [c].concat(lane.cells)) { g = await R.ev(([g, o]) => window.__GUST.go(g, o), [{ cell: c2, grow: -8 }, {}]); if (g.ok) break; if (g.why !== 'no-path') break; }
      const hit = await page.waitForFunction(() => { const s = window.__A.mstate(); return s && s.blown; }, { timeout: 20000 }).then(() => true).catch(() => false);
      const pre = await D.dig(page); await page.waitForTimeout(d);
      await D.kill(page); const how = await D.afterKill(page, 0, 1);
      const post = await D.dig(page).catch(e => ({ error: String(e) })), mv = post.error ? null : await D.canMove(page);
      const ok = hit && !post.error && post.map === 'stormNest' && mv && mv.ok && !post.scenes.includes('BattleScene');
      console.log(`[${ok ? 'PASS' : hit ? 'FAIL' : 'UNVERIFIED'}] kill-fall: killed ${d} ms after being blown off (hit=${hit}): resumes sane`, JSON.stringify({ how, pre: pre.cell + '|f' + pre.floor, post: post.error || post.cell + '|f' + post.floor + '|' + post.map, mv }).slice(0, 500));
      if (!(await R.start())) break;
    }
  } catch (e) { console.log('[FAIL] kill-fall crashed', String(e && e.stack || e).slice(0, 500)); }
  process.exit(0);
})();
