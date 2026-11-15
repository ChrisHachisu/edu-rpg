'use strict';
// Sunken Temple, the maze hunter, played like a player: in by the portal isle's mouth; the plan's
// straight route through every maze (the guardian wakes after the first few halls and follows at
// its slower pace: on the straight route it never reaches her), the stairs, the Sword Wraith, the
// way out. Also: waiting for the guardian in a hall on floor 1 (the rule, a battle, and it goes
// home to sleep), and Save -> Continue with the guardian awake and on her trail.
//   NODE_PATH=/opt/node-tools/node_modules PROBE_URL=http://127.0.0.1:5260/ PROBE_OUT=<dir> \
//     flock /home/user/work/e2/heavy.lock.$((RANDOM%2)) node scripts/acts/probe/mech/maze-hunter.cjs
const { Run, plan } = require('./_b-lib.cjs');
const ID = 'sunkenTempleDungeon', BOSS = 'swordWraith', FLOORS = 6;

const EXTRA = `(() => { const B = window.__B;
  window.__BM = {
    hunter: () => { const S = B.mstate(), h = S.h, s = B.state(), M = S.M, hc = B.logic().cellOfPx(M, s.sx, s.sy);
      return { awake: !!h.awake, walked: h.walked, at: h.at.slice(), home: M.home.slice(), px: [Math.round(h.x), Math.round(h.y)], dist: Math.round(Math.hypot(h.x - s.sx, h.y - s.sy)),
        hall: hc, safe: !!M.safe[hc.join(',')], wakes: S.wakes || 0, caught: S.battles || 0, busy: !!S.busy, ratio: M.ratio, wake: M.wake }; },
    // walk on until the guardian is awake and she stands in a hall that is not a safe one, then wait for it
    wait: async ms => { const S = B.mstate(); await B.waitFor(() => !!S.busy || B.state().battle || B.state().msg, ms); return window.__BM.hunter(); } };
})()`;

(async () => {
  const R = new Run(ID, { bossId: BOSS, name: 'maze-hunter', extra: EXTRA });
  try {
    if (!(await R.start())) throw new Error('could not enter');
    const page = R.page;
    const hunter = () => R.ev(() => window.__BM.hunter());
    // walk to a goal; a message box (the guardian wakes) is read and closed; a battle is fought. Returns counts.
    const walk = async (goal, opts = {}) => { const out = { msgs: [], battles: 0, g: null }; let snags = 0;
      for (let k = 0; k < 12; k++) { const g = await R.go(goal, opts); out.g = g;
        if (g.why === 'stuck' && snags++ < 2) { out.snags = snags; continue; }   // a corner snag of the probe's walker: plan again from where she stands
        if (g.why === 'message') { out.msgs.push(await R.ev(() => window.__B.msgs().slice(-1)[0] || null)); if (opts.shotOnMsg) await R.shot(opts.shotOnMsg); await R.dismiss(); continue; }
        if (g.why === 'scene') { const fr = await R.fight(); out.battles++; out.fr = fr; await page.waitForTimeout(1200); await R.pilot(); await R.dismiss(); continue; }
        break; }
      return out; };
    const near = (p, q) => Math.abs(p[0] - q[0]) + Math.abs(p[1] - q[1]) <= 1;   // the saved hall, or the next one on her trail (it does not wait for the probe)
    let resumed = false;
    for (let f = 1; f <= FLOORS; f++) {
      const P = plan(ID, f), route = P.route; let s = await R.st();
      if (!R.rec(`f${f}: on the authored floor with the maze-hunter module`, s.map === ID && s.floor === f && s.w === P.width && s.h === P.height && s.d2.mechanic === 'maze-hunter' && s.d2.module, s)) break;
      await R.shot(`f${f}-arrive`);
      const h0 = await hunter();
      R.rec(`f${f}: the guardian sleeps in its room until she has walked ${h0.wake} halls`, h0.awake === false && h0.at.join() === h0.home.join(), h0);
      const goalA = f < FLOORS ? P.assets.find(a => a.kind === 'stairsNext') : P.assets.find(a => a.kind === 'boss');
      if (f === 1) {                                                            // wait for it: the rule, the battle, home asleep
        const mid = route[Math.min(route.length - 3, 5 * (h0.wake + 1) + 2)];    // a few halls in, past the wake
        const w1 = await walk({ cell: mid, grow: 0 }, { shotOnMsg: 'f1-guardian-wakes' }); const h1 = await hunter();
        R.rec('f1: after the third hall the guardian wakes and the rule is told in a box', h1.awake === true && h1.wakes === 1 && w1.msgs.length === 1 && /guardian|wakes|eyes/i.test(w1.msgs[0] || ''), { h1, msgs: w1.msgs });
        await R.ev(() => window.__B.clearMsgs());
        const t0 = Date.now(); let h2 = h1;
        for (let k = 0; k < 60 && !(h2.busy || (await R.st()).battle); k++) { h2 = await R.ev(() => window.__BM.wait(1500)); if (k === 3) await R.shot('f1-guardian-coming'); }
        await R.shot('f1-caught'); const said = await R.ev(() => window.__B.msgs().slice(-1)[0] || null);
        const fr = await R.fight(); await page.waitForTimeout(1500); await R.pilot(); await R.dismiss(); await page.waitForTimeout(300);
        const h3 = await hunter(), fl = await R.ev(() => window.__B.d2flags());
        R.rec('f1: standing in a hall until it reaches her starts a battle; afterwards the guardian is back in its room, asleep',
          fr.entered && fr.won && /guardian|caught/i.test(said || '') && h3.awake === false && h3.at.join() === h3.home.join() && !fl[`d2.${ID}.f1.hunter`], { waitedMs: Date.now() - t0, said, fr, h3 });
        await R.shot('f1-guardian-home');
      }
      if (f === 2) {                                                            // Save -> Continue with the guardian awake
        let at = Math.min(route.length - 3, 5 * (h0.wake + 2) + 2), b = null;      // a few halls in; on again if it caught her on the way and sleeps
        for (let k = 0; k < 5; k++) { await walk({ cell: route[at], grow: 0 }); b = { h: await hunter(), s: await R.st() }; if (b.h.awake) break; at = Math.min(route.length - 3, at + 5); }
        const rc = await R.saveContinue(); const a = { h: await hunter(), s: await R.st() }; resumed = true;
        R.rec('f2: Save -> Continue mid-chase keeps the guardian awake and on her trail from the hall it had reached, and her cell',
          rc.ok && b.h.awake && a.h.awake === true && typeof rc.saved.d2[`d2.${ID}.f2.hunter`] === 'string' && rc.saved.d2[`d2.${ID}.f2.hunter`].indexOf('1|') === 0 && near(a.h.at, rc.saved.d2[`d2.${ID}.f2.hunter`].split('|')[1].split(',').map(Number)) && Math.abs(a.s.cx - b.s.cx) <= 1 && Math.abs(a.s.cy - b.s.cy) <= 1,
          { flag: rc.saved.d2[`d2.${ID}.f2.hunter`], before: b.h, after: a.h, at: [a.s.cx, a.s.cy], was: [b.s.cx, b.s.cy] });
        await R.shot('f2-resumed');
      }
      const goal = f < FLOORS ? { beside: [goalA.x, goalA.y], reach: 40 } : { beside: [goalA.x, goalA.y], reach: 60 };
      const w = await walk(goal, { shotOnMsg: f > 1 ? `f${f}-guardian-wakes` : null }); const h4 = await hunter();
      if (!R.rec(`f${f}: the straight route is walked with no battle (the guardian moves ${h4.ratio} of her pace)`, w.g.ok && w.battles === 0 && (f === 1 || f === 2 || w.msgs.length === 1), { g: w.g, battles: w.battles, msgs: w.msgs.length, hunter: h4 })) break;
      await R.shot(`f${f}-through`);
      if (f < FLOORS) { if (!(await R.stairs(goalA, f + 1))) break; }
      else {
        // The Sword Wraith turns 90% of every blow back on her unless she carries the Holy Amulet, which the
        // golden chest on this floor holds: a player opens it first, so the probe does too.
        const gold = P.assets.find(a => a.kind === 'chest' && a.loot === 'holyAmulet');
        if (gold) { const has = () => R.ev(() => window.__GAME_STATE__.player.hasItem('holyAmulet'));
          let t = null; if (!(await has())) { for (let k = 0; k < 3 && !(await has()); k++) { t = await R.use(gold.x, gold.y, null); await page.waitForTimeout(500); await R.dismiss(); } }
          R.rec(`f${f}: the golden chest gives the Holy Amulet (the Sword Wraith's ward against its reflection)`, await has(), { tapped: t, chest: [gold.x, gold.y] }); }
        if (await R.boss(goalA, f)) await R.exitByBossCell(goalA); }
    }
  } catch (e) { R.rec('probe crashed', false, String(e && e.stack || e).slice(0, 600)); await R.shot('crash').catch(() => {}); }
  process.exit((await R.finish()) ? 1 : 0);
})();
