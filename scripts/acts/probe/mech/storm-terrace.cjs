'use strict';
// Stormreach Spire, storm terraces, played like a player: in by the portal isle's mouth; every
// open terrace crossed between the strikes (the probe's planner reads the module's own strike
// beat a few ticks ahead; she waits on the roofed ledges and on tiles whose turn has just passed),
// the stairs up, the Storm Sentinel, the way out. Also: standing on a glowing tile until it is
// struck (small damage, knocked back a tile, the rule told once and a floating number after that),
// and Save -> Continue out on a terrace.
//   NODE_PATH=/opt/node-tools/node_modules PROBE_URL=http://127.0.0.1:5260/ PROBE_OUT=<dir> \
//     flock /home/user/work/e2/heavy.lock.$((RANDOM%2)) node scripts/acts/probe/mech/storm-terrace.cjs
const { Run, plan } = require('./_b-lib.cjs');
const ID = 'stormreachSpire', BOSS = 'stormSentinel', FLOORS = 6;

const EXTRA = `(() => { const B = window.__B, D = window.__QOK_DNG2__;
  const env = (goals, blind) => { const c = B.ctx(), S = c.state, lg = c.mod.logic, M = S.M, f = B.fdy(), g = new Set(goals.map(x => x.join(',')));
    return { period: M.period, tick: () => c.state.tick, walk: (x, y) => D.free(x * 48 + 24, y * 48 + 24 - f),
      safe: (x, y, t) => blind || !lg.striking(M, lg.groupAt(M, x, y), t), goal: (x, y) => g.has(x + ',' + y) }; };
  const group = () => { const c = B.ctx(), s = B.state(); return c.mod.logic.groupAt(c.state.M, s.cx, s.cy); };
  window.__BM = { env, group,
    cross: (goals, opts) => B.timedGo(env(goals, false), opts || {}),
    struck: () => B.mstate().struck || 0,
    // walk (blind) onto terrace cell c and stand there until the bolt comes
    stand: async c => { const S = B.mstate(), n0 = S.struck || 0, hp0 = B.state().hp;
      const g = await B.timedGo(env([c], true), { until: () => (S.struck || 0) > n0, maxMs: 30000 }); const at = B.state();
      await B.waitFor(() => (S.struck || 0) > n0, 12000); await B.wait(350);
      const s = B.state(); return { g: g.why, grp: group(), struck: (S.struck || 0) - n0, lost: hp0 - s.hp, max: s.maxHp, stood: [at.sx, at.sy], now: [s.sx, s.sy], moved: Math.round(Math.hypot(s.sx - at.sx, s.sy - at.sy)), msg: s.msg, said: B.msgs().slice(-1)[0] || null }; } };
})()`;

(async () => {
  const R = new Run(ID, { bossId: BOSS, name: 'storm-terrace', extra: EXTRA });
  try {
    if (!(await R.start())) throw new Error('could not enter');
    const page = R.page;
    for (let f = 1; f <= FLOORS; f++) {
      const P = plan(ID, f), route = P.route, rows = P.mechanic.strikeGroups; let s = await R.st();
      if (!R.rec(`f${f}: on the authored floor with the storm-terrace module`, s.map === ID && s.floor === f && s.w === P.width && s.h === P.height && s.d2.mechanic === 'storm-terrace' && s.d2.module, s)) break;
      await R.shot(`f${f}-arrive`);
      const isT = c => { const ch = (rows[c[1]] || '').charCodeAt(c[0]) - 48; return ch >= 0 && ch < P.mechanic.params.groups; };
      const firstT = route.findIndex(isT), lastGoal = [await R.ev(r => window.__B.standCell(r), route)];
      if (f === 1) {                                                            // struck twice: the rule in a box, then a floating number
        const c = route[firstT + 1] && isT(route[firstT + 1]) ? route[firstT + 1] : route[firstT];
        await R.ev(() => window.__B.clearMsgs());
        const m1 = await R.ev(c => window.__BM.stand(c), c); await R.shot('f1-struck'); await R.dismiss();
        R.rec('f1: a bolt on her tile costs a tenth of her HP, knocks her back about a tile and tells the rule in a box',
          m1.struck === 1 && m1.lost > 0 && m1.lost <= Math.ceil(m1.max * 0.1) && m1.moved >= 24 && m1.moved <= 80 && m1.msg === true && /lightning|bolt|struck|glow/i.test(m1.said || ''), m1);
        const m2 = await R.ev(c => window.__BM.stand(c), c); await R.shot('f1-struck-again');
        R.rec('f1: the second bolt shows no box, only the damage and the knock-back', m2.struck === 1 && m2.lost > 0 && m2.msg === false, m2);
        await R.dismiss();
      }
      if (f === 2) {                                                            // Save -> Continue out on the terrace
        let k = firstT; while (k + 1 < route.length - 2 && !(isT(route[k]) && isT(route[k + 1]) && isT(route[k + 2]) && k >= firstT + 3)) k++;
        const g1 = await R.ev(c => window.__BM.cross([c]), route[k]); const before = await R.st(), t0 = await R.ev(() => window.__B.mstate().tick);
        const rc = await R.saveContinue(); const after = await R.st(), clk0 = await R.ev(() => window.__B.mstate().clk0), savedClk = rc.saved.d2[`d2.${ID}.f2.clk`];
        R.rec('f2: Save -> Continue out on a terrace puts her back on her tile with the storm\'s beat where it was',
          g1.ok && rc.ok && after.floor === 2 && Math.abs(after.cx - before.cx) <= 1 && Math.abs(after.cy - before.cy) <= 1 && typeof savedClk === 'number' && Math.abs(clk0 - savedClk) <= 300 && Math.abs(savedClk / (P.mechanic.params.periodSec * 1000 / P.mechanic.params.periodTicks) - t0) < 3,
          { g1, was: [before.cx, before.cy], at: [after.cx, after.cy], savedClk, clk0, tickAtSave: t0 });
        await R.shot('f2-resumed');
      }
      const hp0 = (await R.st()).hp, n0 = await R.ev(() => window.__BM.struck());
      const run = R.ev(g => window.__BM.cross(g), lastGoal);
      const g = await R.watch(run, [{ tag: `f${f}-on-the-terrace`, when: () => window.__BM.group() >= 0 }]);
      s = await R.st(); const n1 = await R.ev(() => window.__BM.struck());
      if (!R.rec(`f${f}: the terraces are crossed between the strikes without a hit (${P.tests.terraceTilesOnRoute} terrace tiles on the route)`, g.ok && g.why === 'arrived' && s.hp === hp0 && n1 === n0, { g, hp: [hp0, s.hp], struck: n1 - n0 })) break;
      await R.shot(`f${f}-across`);
      if (f < FLOORS) { if (!(await R.stairs(P.assets.find(a => a.kind === 'stairsNext'), f + 1))) break; }
      else { const b = P.assets.find(a => a.kind === 'boss'); if (await R.boss(b, f)) await R.exitByBossCell(b); }
    }
  } catch (e) { R.rec('probe crashed', false, String(e && e.stack || e).slice(0, 600)); await R.shot('crash').catch(() => {}); }
  process.exit((await R.finish()) ? 1 : 0);
})();
