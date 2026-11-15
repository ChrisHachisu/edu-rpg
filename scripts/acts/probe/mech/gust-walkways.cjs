'use strict';
// Storm Nest, gust walkways, played like a player: from the overworld mouth up the tower, every
// lane crossed in its lull (she waits at the edge for the gust to pass, then walks), one
// deliberate fall on floor 1 (back at the door) and one on floor 2 (lands on the floor below and
// climbs again), Save -> Continue half way up floor 3, the Storm Harpy, the way out.
//   NODE_PATH=/opt/node-tools/node_modules PROBE_URL=http://127.0.0.1:5202/ PROBE_OUT=<dir> \
//     flock /home/user/work/e2/heavy.lock.$((RANDOM%2)) node scripts/acts/probe/mech/gust-walkways.cjs
const fs = require('fs'), path = require('path');
const { Run } = require('./_a-lib.cjs');
const PLANS = process.env.D2_PLANS || '/home/user/work/plans/out';
const ID = 'stormNest';
const plan = f => JSON.parse(fs.readFileSync(path.join(PLANS, `${ID}-f${f}.json`), 'utf8'));
// in-page: walk a planned path, but stop at the edge of every lane and cross only in a lull long enough
const GUST = `(() => { const A = window.__A, T = 48;
  const lull = (L, need) => { const t = A.mstate().t / 185, pos = ((t - L.phase) % L.period + L.period) % L.period; return pos >= L.active + 0.5 && (L.period - pos) * 185 >= need; };
  window.__GUST = { lanes: () => A.mstate().lanes.map(L => ({ id: L.id, state: L.state, cells: L.cells, dir: L.dir })),
    async go(goal, opts = {}) { const st = A.mstate(), f = A.fdy(), p = A.plan(goal, opts); if (!p) return { ok: false, why: 'no-path' };
      const laneOf = pt => st.cell[Math.floor(pt[0] / T) + ',' + Math.floor((pt[1] + f) / T)] || null; let i = 0, crossed = 0; const falls0 = st.falls || 0;
      while (i < p.length) { let j = i; while (j < p.length && !laneOf(p[j])) j++;
        if (j > i + 1) { const r = await A.drive(p.slice(i, j - 1), { tol: 5 }); if (!r.ok || r.why !== 'arrived') return Object.assign(r, { seg: 'calm', crossed }); }
        if (j >= p.length) { const r = await A.drive(p.slice(Math.max(i, j - 1)), { tol: 5 }); return Object.assign(r, { crossed }); }
        let k = j; const Ls = new Set(); while (k < p.length && laneOf(p[k])) { Ls.add(laneOf(p[k])); k++; }
        const need = (k - j + 3) * 12 / 260 * 1000 * 1.4 + 600, t0 = performance.now();
        while (![...Ls].every(L => lull(L, need))) { if (performance.now() - t0 > 30000) return { ok: false, why: 'no-lull', crossed }; await A.wait(50); }
        const r = await A.drive(p.slice(Math.max(i, j - 1), Math.min(p.length, k + 1)), { tol: 6 }); crossed += Ls.size;
        if (!r.ok || r.why !== 'arrived' || (A.mstate().falls || 0) !== falls0 || A.mstate().blown) return Object.assign(r, { ok: false, seg: 'lane', crossed, blown: !!A.mstate().blown });
        i = Math.min(p.length, k + 1); }
      return { ok: true, why: 'arrived', crossed }; } }; })()`;

(async () => {
  const P1 = plan(1), N = P1.totalFloors, bossAsset = plan(N).assets.find(a => a.kind === 'boss');
  const R = new Run(ID, { bossId: bossAsset.id, name: 'gust-walkways' });
  try {
    if (!(await R.start())) throw new Error('could not enter');
    const page = R.page, inject = () => R.ev(GUST), cell = async () => { const t = await R.st(); return [Math.floor(t.sx / 48), Math.floor(t.sy / 48), t.floor]; };
    const ggo = (goal, opts) => R.ev(([g, o]) => window.__GUST.go(g, o), [goal, opts || {}]);
    // stand on a lane cell until the gust takes her; returns {msg, at}
    const fall = async (f) => { const P = plan(f); await inject();
      const lane = P.zones.find(z => z.kind === 'gustLane'), c = lane.cells[Math.floor(lane.cells.length / 2) % lane.cells.length];
      let g = null; for (const c2 of [c].concat(lane.cells)) { g = await ggo({ cell: c2, grow: -8 }); if (g.ok) break; if (g.why !== 'no-path') break; }
      await R.ev(() => window.__A.clearMsgs());
      const hit = await page.waitForFunction(() => { const s = window.__A.mstate(); return s && s.blown; }, { timeout: 15000 }).then(() => true).catch(() => false);
      if (hit) { await page.waitForTimeout(180); await R.shot(`f${f}-blown-off`); }
      await page.waitForFunction(() => { const w = window.__PHASER_GAME__.scene.getScene('WorldMapScene'); return w.showingMessage && window.__A.msgs().length > 0; }, { timeout: 20000 }).catch(() => {});
      await page.waitForTimeout(500); await R.pilot(); await inject(); const msg = await R.ev(() => window.__A.msgs().slice(-1)[0] || null); const at = await cell();
      await R.shot(`f${f}-landed`); await R.dismiss(); await page.waitForTimeout(400);
      return { hit, msg, at, g, lands: P.mechanic.fallLandings }; };
    let fell1 = false, fell2 = false, saved = false;
    for (let f = 1; f <= N; f++) {
      const P = plan(f); let s = await R.st(); await inject();
      if (!R.rec(`f${f}: on the authored floor with the gust-walkways module`, s.map === ID && s.floor === f && s.w === P.width && s.d2.mechanic === 'gust-walkways' && s.d2.module, s)) break;
      await R.shot(`f${f}-arrive`);
      if (f === 1 && !fell1) { fell1 = true; const r = await fall(1);
        R.rec('f1: standing on the walkway when the window gusts blows her off; she comes to back at the door, on this floor', r.hit && r.at[2] === 1 && r.lands.some(l => l.landsAt[0] === r.at[0] && l.landsAt[1] === r.at[1]) && /swept you off/.test(r.msg || ''), { msg: r.msg, at: r.at, g: r.g }); }
      if (f === 2 && !fell2) { fell2 = true; const r = await fall(2); await R.settle();
        R.rec('f2: blown off higher up she lands on the floor below, on the plan\'s landing', r.hit && r.at[2] === 1 && r.lands.some(l => l.landsOnFloor === 1 && l.landsAt[0] === r.at[0] && l.landsAt[1] === r.at[1]) && /floor below/.test(r.msg || ''), { msg: r.msg, at: r.at });
        f = 0; continue; }                                                     // climb floor 1 again
      const stairs = P.assets.find(a => a.kind === 'stairsNext'), target = stairs || bossAsset;
      if (f === 3 && !saved) { saved = true; const sv = P.assets.find(a => a.kind === 'save');
        const g0 = await ggo({ beside: [sv.x, sv.y], reach: 40 }); const before = await cell(); const rc = await R.saveContinue(); await inject(); const after = await cell(), ms = await R.ev(() => { const m = window.__A.mstate(); return { lanes: m.lanes.length, t: m.t }; });
        R.rec('f3: Save -> Continue part way up restores her floor and cell, the gusts are running again', rc.ok && g0.ok && after[2] === 3 && Math.abs(after[0] - before[0]) <= 1 && Math.abs(after[1] - before[1]) <= 1 && ms.lanes === P.zones.filter(z => z.kind === 'gustLane').length && ms.t > 0, { g0, before, after, ms });
        await R.shot('f3-resumed'); }
      const falls0 = await R.ev(() => window.__A.mstate().falls || 0);
      const t0 = Date.now(); const g = await ggo({ beside: [target.x, target.y], reach: 40 }); const falls1 = await R.ev(() => window.__A.mstate().falls || 0);
      if (!R.rec(`f${f}: she crosses ${g.crossed} lane(s) dry by waiting for each lull (${((Date.now() - t0) / 1000).toFixed(1)} s to the ${stairs ? 'stairs' : 'boss'})`, g.ok && falls1 === falls0, g)) { await R.shot(`f${f}-fail`); break; }
      await R.shot(`f${f}-across`);
      if (stairs) { if (!(await R.stairs(stairs, f + 1))) break; }
      else if (await R.boss(bossAsset, f)) await R.exitByBossCell(bossAsset);
    }
  } catch (e) { R.rec('probe crashed', false, String(e && e.stack || e).slice(0, 600)); await R.shot('crash').catch(() => {}); }
  process.exit((await R.finish()) ? 1 : 0);
})();
