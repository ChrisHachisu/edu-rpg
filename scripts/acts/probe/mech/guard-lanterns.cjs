'use strict';
// Demon Barracks, guards and lanterns, played like a player: in by the overworld mouth; through
// every guard hall in the dark (the probe's planner reads the lantern light a few beats ahead
// through the module's own patrol, and she waits behind the pillars as a careful player does), the
// stairs, War General Malachar, the way out. Also: walking into the light on floor 2 (the rule, a
// battle, and that guard is gone for good), and Save -> Continue right after it.
//   NODE_PATH=/opt/node-tools/node_modules PROBE_URL=http://127.0.0.1:5260/ PROBE_OUT=<dir> \
//     flock /home/user/work/e2/heavy.lock.$((RANDOM%2)) node scripts/acts/probe/mech/guard-lanterns.cjs
const { Run, plan } = require('./_b-lib.cjs');
const ID = 'demonBarracks', BOSS = 'warGeneralMalachar', FLOORS = 6;

const EXTRA = `(() => { const B = window.__B, D = window.__QOK_DNG2__;
  const env = (goals, blind) => { const c = B.ctx(), S = c.state, lg = c.mod.logic, f = B.fdy(), g = new Set(goals.map(x => x.join(',')));
    return { period: S.M.period, tick: () => c.state.tick, walk: (x, y) => D.free(x * 48 + 24, y * 48 + 24 - f),
      safe: (x, y, t) => blind || lg.seenBy(c, S.M, t, x, y).length === 0, goal: (x, y) => g.has(x + ',' + y) }; };
  window.__BM = { env,
    sneak: (goals, opts) => B.timedGo(env(goals, false), opts || {}),
    blunder: goals => B.timedGo(env(goals, true), { until: () => !!B.mstate().busy || B.state().battle, maxMs: 60000 }),
    guards: () => B.mstate().M.guards.map(g => ({ id: g.id, gone: !!g.gone })),
    lit: () => { const c = B.ctx(), S = c.state, s = B.state(); return c.mod.logic.seenBy(c, S.M, S.tick, s.cx, s.cy).length; },
    inHall: r => { const s = B.state(); return s.cx >= r[0] && s.cx <= r[2] && s.cy >= r[1] && s.cy <= r[3]; },
    near: () => { const S = B.mstate(), M = S.M, s = B.state(), t = ((Math.floor(S.tick) % M.period) + M.period) % M.period; let d = 99;   // cells to the nearest live guard
      M.guards.forEach(g => { if (!g.gone) d = Math.min(d, Math.max(Math.abs(g.seq[t][0] - s.cx), Math.abs(g.seq[t][1] - s.cy))); }); return d; },
    battles: () => B.mstate().battles || 0 };
})()`;

(async () => {
  const R = new Run(ID, { bossId: BOSS, name: 'guard-lanterns', extra: EXTRA });
  try {
    if (!(await R.start())) throw new Error('could not enter');
    const page = R.page;
    for (let f = 1; f <= FLOORS; f++) {
      const P = plan(ID, f), route = P.route, halls = P.mechanic.halls; let s = await R.st();
      if (!R.rec(`f${f}: on the authored floor with the guard-lanterns module`, s.map === ID && s.floor === f && s.w === P.width && s.h === P.height && s.d2.mechanic === 'guard-lanterns' && s.d2.module, s)) break;
      await R.shot(`f${f}-arrive`);
      const onRoute = halls.find(h => route.some(c => c[0] >= h.rect[0] && c[0] <= h.rect[2] && c[1] >= h.rect[1] && c[1] <= h.rect[3]));
      const lastGoal = [await R.ev(r => window.__B.standCell(r), route)];
      if (f === 2) {                                                            // into the light: the rule, the battle, the guard gone
        const r = onRoute.rect, mid = [(r[0] + r[2]) >> 1, (r[1] + r[3]) >> 1], g0 = await R.ev(() => window.__BM.guards());
        await R.ev(() => window.__B.clearMsgs());
        const b = await R.ev(m => window.__BM.blunder([-1, 0, 1].flatMap(dx => [-1, 0, 1].map(dy => [m[0] + dx, m[1] + dy]))), mid); await R.shot('f2-seen');
        const said = await R.ev(() => window.__B.msgs().slice(-1)[0] || null);
        const fr = await R.fight(); await page.waitForTimeout(1500); await R.pilot(); await R.dismiss(); await page.waitForTimeout(400);
        const g1 = await R.ev(() => window.__BM.guards()), gone = g1.filter(g => g.gone).map(g => g.id), fl = await R.ev(() => window.__B.d2flags());
        s = await R.st();
        R.rec('f2: walking into a lantern\'s light tells the rule and starts a battle; won, that guard is gone (flag gone.<id>)',
          (b.why === 'until' || b.why === 'message') && /light|seen|guard/i.test(said || '') && fr.entered && fr.won && gone.length >= 1 && gone.every(id => fl[`d2.${ID}.f2.gone.${id}`]) && s.field && s.map === ID,
          { b, said, fr, was: g0, now: g1 });
        await R.shot('f2-guard-gone');
        const rc = await R.saveContinue(), g2 = await R.ev(() => window.__BM.guards()), a = await R.st(), clk0 = await R.ev(() => window.__B.mstate().clk0);
        R.rec('f2: Save -> Continue keeps that guard gone, the others on their beat and her cell',
          rc.ok && a.floor === 2 && JSON.stringify(g2) === JSON.stringify(g1) && Math.abs(clk0 - rc.saved.d2[`d2.${ID}.f2.clk`]) <= 300 && Math.abs(a.cx - s.cx) <= 1 && Math.abs(a.cy - s.cy) <= 1,
          { guards: g2, clk0, savedClk: rc.saved.d2[`d2.${ID}.f2.clk`], at: [a.cx, a.cy], was: [s.cx, s.cy] });
        await R.shot('f2-resumed');
      }
      const n0 = await R.ev(() => window.__BM.battles());
      const run = R.ev(g => window.__BM.sneak(g), lastGoal);
      const g = await R.watch(run, onRoute ? [{ tag: `f${f}-in-the-hall-in-the-dark`, when: `window.__BM.inHall(${JSON.stringify(onRoute.rect)}) && window.__BM.lit() === 0` },
        { tag: `f${f}-a-guard-close-by`, when: () => window.__BM.near() <= 4 && window.__BM.lit() === 0 }] : []);
      s = await R.st(); const n1 = await R.ev(() => window.__BM.battles());
      if (!R.rec(`f${f}: the guard hall is crossed unseen (${P.tests.guards} guard(s) on the floor, no battle)`, g.ok && g.why === 'arrived' && n1 === n0 && s.field, { g, battles: n1 - n0 })) break;
      await R.shot(`f${f}-through`);
      if (f < FLOORS) { if (!(await R.stairs(P.assets.find(a => a.kind === 'stairsNext'), f + 1))) break; }
      else { const b = P.assets.find(a => a.kind === 'boss'); if (await R.boss(b, f)) await R.exitByBossCell(b); }
    }
  } catch (e) { R.rec('probe crashed', false, String(e && e.stack || e).slice(0, 600)); await R.shot('crash').catch(() => {}); }
  process.exit((await R.finish()) ? 1 : 0);
})();
