'use strict';
// Iron Mine, mine carts, played like a player: from the overworld mouth, every floor's own
// solution (the plan's solver line: pull a lever, ride a cart), the stairs, the Ore Colossus,
// the way out. Also a wrong ride on floor 1 (the switch still on its siding) and back, and
// Save -> Continue in the middle of floor 3's two-switch puzzle.
//   NODE_PATH=/opt/node-tools/node_modules PROBE_URL=http://127.0.0.1:5202/ PROBE_OUT=<dir> \
//     flock /home/user/work/e2/heavy.lock.$((RANDOM%2)) node scripts/acts/probe/mech/mine-carts.cjs
const fs = require('fs'), path = require('path');
const { Run, L } = require('./_a-lib.cjs');
const PLANS = process.env.D2_PLANS || '/home/user/work/plans/out';
const ID = 'ironMine', BOSS = 'oreColossus';
const plan = f => JSON.parse(fs.readFileSync(path.join(PLANS, `${ID}-f${f}.json`), 'utf8'));

(async () => {
  const R = new Run(ID, { bossId: BOSS, name: 'mine-carts' });
  try {
    if (!(await R.start())) throw new Error('could not enter');
    const page = R.page;
    const carts = () => R.ev(() => window.__A.mstate().carts.map(c => ({ id: c.id, at: c.at, x: c.x, y: c.y })));
    const riding = () => R.ev(() => !!window.__A.mstate().ride);
    const ride = async (n, want, f) => {                                     // cart number n (1-based) to the stop `want`
      const c = (await carts())[n - 1]; const v = await R.use(c.x, c.y, 'Ride cart');
      if (v) { await page.waitForTimeout(250); if (await riding()) await R.shot(`f${f}-riding-to-${want}`); }
      await page.waitForFunction(() => !window.__A.mstate().ride, { timeout: 30000 }).catch(() => {}); await page.waitForTimeout(350);
      const c2 = (await carts())[n - 1], s = await R.st(), fl = await R.ev(() => window.__A.flags());
      const beside = Math.abs(Math.floor(s.sx / 48) - c2.x) + Math.abs(Math.floor(s.sy / 48) - c2.y) === 1;
      return R.rec(`f${f}: "Ride cart" carries her to stop ${want}; the cart parks there and she steps off beside it`, v === 'Ride cart' && c2.at === want && beside && !!fl[`d2.${ID}.f${f}.cart${c2.id}.at.${want}`], { v, cart: c2, soles: [s.sx, s.sy] });
    };
    const lever = async (name, f) => { const P = plan(f), lv = P.assets.find(a => a.kind === 'lever' && a.junction === name);
      const before = await R.ev(k => !!window.__A.flags()[k], `d2.${ID}.f${f}.sw.${name}`);
      const v = await R.use(lv.x, lv.y, 'Pull lever'); await page.waitForTimeout(300);
      const after = await R.ev(k => !!window.__A.flags()[k], `d2.${ID}.f${f}.sw.${name}`);
      return R.rec(`f${f}: "Pull lever" flips junction ${name}`, v === 'Pull lever' && after !== before, { v, before, after }); };
    let resumed = false;
    for (let f = 1; f <= 4; f++) {
      const P = plan(f); let s = await R.st();
      if (!R.rec(`f${f}: on the authored floor with the mine-carts module`, s.map === ID && s.floor === f && s.w === P.width && s.h === P.height && s.d2.mechanic === 'mine-carts' && s.d2.module, s)) break;
      await R.shot(`f${f}-arrive`);
      if (f === 1) {                                                         // the wrong ride first: the switch starts on the west siding
        const goal = P.assets.find(a => a.kind === 'stairsNext');
        const g0 = await R.ev(g => !!window.__A.plan({ centre: g }), [goal.x, goal.y]);
        R.rec('f1: the stairs cannot be reached on foot (they need the cart)', g0 === false);
        await ride(1, 'W', 1); await R.shot('f1-west-siding');
        await ride(1, 'E', 1);
      }
      let ok = true;
      for (const step of P.tests.solver.plan) { let m;
        if ((m = /^lever (\w+)$/.exec(step))) ok = await lever(m[1], f);
        else if ((m = /^ride cart (\d+) to (\w+)$/.exec(step))) ok = await ride(+m[1], m[2], f);
        if (!ok) break;
        if (f === 3 && step === 'lever K' && !resumed) { resumed = true;      // mid-puzzle: both levers pulled, the cart on the middle ledge
          const before = { carts: await carts(), s: await R.st(), fl: await R.ev(() => Object.keys(window.__A.flags()).filter(k => k.indexOf('d2.ironMine') === 0).sort()) };
          const rc = await R.saveContinue(); const after = { carts: await carts(), s: await R.st(), fl: await R.ev(() => Object.keys(window.__A.flags()).filter(k => k.indexOf('d2.ironMine') === 0).sort()) };
          R.rec('f3: Save -> Continue mid-puzzle restores the cart, both switches and her cell',
            rc.ok && after.s.floor === 3 && JSON.stringify(after.carts) === JSON.stringify(before.carts) && JSON.stringify(after.fl) === JSON.stringify(before.fl) && Math.abs(after.s.x - before.s.x) <= 1 && Math.abs(after.s.y - before.s.y) <= 1,
            { saved: rc.saved, carts: after.carts, flags: after.fl, at: [after.s.x, after.s.y], was: [before.s.x, before.s.y] });
          await R.shot('f3-resumed'); }
      }
      if (!ok) break;
      await R.shot(`f${f}-solved`);
      if (f < 4) { if (!(await R.stairs(P.assets.find(a => a.kind === 'stairsNext'), f + 1))) break; }
      else { const b = P.assets.find(a => a.kind === 'boss'); if (await R.boss(b, f)) await R.exitByBossCell(b); }
    }
  } catch (e) { R.rec('probe crashed', false, String(e && e.stack || e).slice(0, 600)); await R.shot('crash').catch(() => {}); }
  process.exit((await R.finish()) ? 1 : 0);
})();
