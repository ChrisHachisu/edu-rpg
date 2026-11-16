'use strict';
// Magma Tunnels, crust bridges, played like a player: in by the overworld mouth, every floor's
// crossings taken on the beat (she waits on the bank until the crust has time to carry her, the
// probe's planner looks ahead through the module's own beat), the stairs, the Lava Wyrm, the way
// out. Also: standing on a crossing as it melts (small damage, back on the bank she came from, the
// rule told once and a floating number after that), and Save -> Continue between two crossings.
//   NODE_PATH=/opt/node-tools/node_modules PROBE_URL=http://127.0.0.1:5260/ PROBE_OUT=<dir> \
//     flock /home/user/work/e2/heavy.lock.$((RANDOM%2)) node scripts/acts/probe/mech/crust-bridges.cjs
const { Run, plan } = require('./_b-lib.cjs');
const ID = 'magmaTunnels', BOSS = 'lavaWyrm', FLOORS = 5;

// in-page helpers of this probe
const EXTRA = `(() => { const B = window.__B, D = window.__QOK_DNG2__;
  const cells = () => { const m = new Map(); B.mstate().L.forEach(L => L.b.cells.forEach(c => m.set(c[0] + ',' + c[1], L.b))); return m; };
  const env = goals => { const c = B.ctx(), lg = c.mod.logic, cb = cells(), f = B.fdy(), g = new Set(goals.map(x => x.join(',')));
    return { period: c.state.period, tick: () => c.state.tick, walk: (x, y) => cb.has(x + ',' + y) || D.free(x * 48 + 24, y * 48 + 24 - f),
      safe: (x, y, t) => { const b = cb.get(x + ',' + y); return !b || lg.phaseOf(b, t) !== 'molten'; }, goal: (x, y) => g.has(x + ',' + y) }; };
  const onBridge = () => { const s = B.state(), b = cells().get(s.cx + ',' + s.cy); return b ? b.id : -1; };
  window.__BM = { env, onBridge,
    cross: (goals, opts) => B.timedGo(env(goals), opts || {}),
    phase: id => { const c = B.ctx(), L = c.state.L.find(l => l.b.id === id); return c.mod.logic.phaseOf(L.b, c.state.tick); },
    // stand on crossing id as it melts: step on with two ticks of crust left, stop in the middle, wait
    melt: async (id, towards) => { const c = B.ctx(), S = c.state, L = S.L.find(l => l.b.id === id), b = L.b, n0 = S.caught || 0, hp0 = B.state().hp, from = B.state();
      await B.waitFor(() => { const u = ((Math.floor(S.tick) - b.phase) % b.period + b.period) % b.period; return u === b.crust - 3; }, 15000);
      await B.push(towards[0], towards[1], 1500, () => window.__BM.onBridge() === id);
      await B.push(towards[0], towards[1], 120);
      const on = window.__BM.onBridge(), ph = window.__BM.phase(id);
      await B.waitFor(() => (S.caught || 0) > n0, 4000); await B.wait(250);
      const s = B.state(); return { on, ph, caught: (S.caught || 0) - n0, lost: hp0 - s.hp, max: s.maxHp, from: [from.cx, from.cy], back: [s.cx, s.cy], msg: s.msg, said: B.msgs().slice(-1)[0] || null }; } };
})()`;

(async () => {
  const R = new Run(ID, { bossId: BOSS, name: 'crust-bridges', extra: EXTRA });
  try {
    if (!(await R.start())) throw new Error('could not enter');
    const page = R.page;
    for (let f = 1; f <= FLOORS; f++) {
      const P = plan(ID, f), route = P.route, bridges = P.mechanic.bridges; let s = await R.st();
      if (!R.rec(`f${f}: on the authored floor with the crust-bridges module`, s.map === ID && s.floor === f && s.w === P.width && s.h === P.height && s.d2.mechanic === 'crust-bridges' && s.d2.module, s)) break;
      await R.shot(`f${f}-arrive`);
      const bcell = new Map(); bridges.forEach(b => b.cells.forEach(c => bcell.set(c.join(','), b.id)));
      const firstOn = route.findIndex(c => bcell.has(c.join(',')));              // the route's first step onto a crossing
      const lastGoal = [await R.ev(r => window.__B.standCell(r), route)];
      if (f === 1) {                                                              // the melt: twice (the rule in a box once, then a floating number)
        const bank = route[firstOn - 1], dir = [route[firstOn][0] - bank[0], route[firstOn][1] - bank[1]], id = bcell.get(route[firstOn].join(','));
        const g0 = await R.ev(c => window.__BM.cross([c]), bank);
        const m1 = await R.ev(([id, d]) => window.__BM.melt(id, d), [id, dir]); await R.shot('f1-melted-under-her'); await R.dismiss();
        R.rec('f1: a crossing that melts under her costs a tenth of her HP, puts her back on the bank she came from and tells the rule in a box',
          g0.ok && m1.on === id && m1.caught === 1 && m1.lost > 0 && m1.lost <= Math.ceil(m1.max * 0.1) && m1.back[0] === m1.from[0] && m1.back[1] === m1.from[1] && m1.msg === true && /crust|bank/i.test(m1.said || ''), m1);
        await R.ev(c => window.__BM.cross([c]), bank);
        const m2 = await R.ev(([id, d]) => window.__BM.melt(id, d), [id, dir]); await R.shot('f1-melted-again');
        R.rec('f1: the second time there is no box, only the damage and the walk back', m2.caught === 1 && m2.lost > 0 && m2.msg === false && m2.back[0] === m2.from[0] && m2.back[1] === m2.from[1], m2);
        await R.dismiss();
      }
      if (f === 2) {                                                              // Save -> Continue between the first and the second crossing
        let k = firstOn; while (bcell.has(route[k].join(','))) k++;
        const mid = route[Math.min(k + 2, route.length - 2)];
        const g1 = await R.ev(c => window.__BM.cross([c]), mid); const before = await R.st(), t0 = await R.ev(() => window.__B.mstate().tick);
        const rc = await R.saveContinue(); const after = await R.st(), clk0 = await R.ev(() => window.__B.mstate().clk0);
        const savedClk = rc.saved.d2[`d2.${ID}.f2.clk`];
        R.rec('f2: Save -> Continue between two crossings puts her back on her cell with the beat where it was',
          g1.ok && g1.hurt === 0 && rc.ok && after.floor === 2 && Math.abs(after.cx - before.cx) <= 1 && Math.abs(after.cy - before.cy) <= 1 && typeof savedClk === 'number' && Math.abs(clk0 - savedClk) <= 300 && Math.abs(savedClk / 185 - t0) < 3,
          { g1, was: [before.cx, before.cy], at: [after.cx, after.cy], savedClk, clk0, tickAtSave: t0 });
        await R.shot('f2-resumed');
      }
      const hp0 = (await R.st()).hp;
      const run = R.ev(g => window.__BM.cross(g), lastGoal);
      const g = await R.watch(run, [{ tag: `f${f}-on-the-crust`, when: () => window.__BM.onBridge() >= 0 && window.__BM.phase(window.__BM.onBridge()) === 'crust' },
        { tag: `f${f}-waiting-on-the-bank`, when: () => { const S = window.__B.mstate(); return S.L.some(l => window.__BM.phase(l.b.id) === 'molten') && !window.__B.state().moving && window.__BM.onBridge() < 0; } }]);
      s = await R.st();
      if (!R.rec(`f${f}: every crossing on the way is taken on the beat without a burn (${P.tests.solver.crossingsOnRoute} on the route)`, g.ok && g.why === 'arrived' && s.hp === hp0, { g, hp: [hp0, s.hp] })) break;
      await R.shot(`f${f}-across`);
      if (f < FLOORS) { if (!(await R.stairs(P.assets.find(a => a.kind === 'stairsNext'), f + 1))) break; }
      else { const b = P.assets.find(a => a.kind === 'boss'); if (await R.boss(b, f)) await R.exitByBossCell(b); }
    }
  } catch (e) { R.rec('probe crashed', false, String(e && e.stack || e).slice(0, 600)); await R.shot('crash').catch(() => {}); }
  process.exit((await R.finish()) ? 1 : 0);
})();
