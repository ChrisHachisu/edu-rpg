'use strict';
// Frozen Lake, sliding ice, played like a player: from the overworld mouth, each floor's lake is
// crossed by the fewest slides the module's own rule allows (slide-ice.solve.cjs), every slide is
// one push of the stick and must end exactly where the rule says; Save -> Continue while she
// rests on the ice in the middle of floor 2; the stairs; the boss; the way out.
//   NODE_PATH=/opt/node-tools/node_modules PROBE_URL=http://127.0.0.1:5202/ PROBE_OUT=<dir> \
//     flock /home/user/work/e2/heavy.lock.$((RANDOM%2)) node scripts/acts/probe/mech/slide-ice.cjs
const fs = require('fs'), path = require('path');
const { Run } = require('./_a-lib.cjs'), { solve, D4 } = require('./slide-ice.solve.cjs');
const PLANS = process.env.D2_PLANS || '/home/user/work/plans/out';
const ID = 'frozenLake', BOSS = process.env.A_BOSS || 'frostWyrm';
const plan = f => JSON.parse(fs.readFileSync(path.join(PLANS, `${ID}-f${f}.json`), 'utf8'));

(async () => {
  const P1 = plan(1), bossId = (plan(P1.totalFloors).assets.find(a => a.kind === 'boss') || {}).id || BOSS;
  const R = new Run(ID, { bossId, name: 'slide-ice' });
  try {
    if (!(await R.start())) throw new Error('could not enter');
    const page = R.page; let saved = false;
    for (let f = 1; f <= P1.totalFloors; f++) {
      const P = plan(f), ice = []; P.rows.forEach((r, y) => r.split('').forEach((c, x) => { if (c === '~') ice.push(x + ',' + y); }));
      let s = await R.st();
      if (!R.rec(`f${f}: on the authored floor with the slide-ice module`, s.map === ID && s.floor === f && s.w === P.width && s.d2.mechanic === 'slide-ice' && s.d2.module, s)) break;
      await R.shot(`f${f}-arrive`);
      const cell = async () => { const t = await R.st(); return [Math.floor(t.sx / 48), Math.floor(t.sy / 48)]; };
      const boss = P.assets.find(a => a.kind === 'boss'), stairs = P.assets.find(a => a.kind === 'stairsNext');
      const goal = stairs ? [stairs.x, stairs.y] : D4.map(d => [boss.x + d[0], boss.y + d[1]]).find(c => P.rows[c[1]][c[0]] === '.');
      const walkFree = await R.ev(([g, av]) => !!window.__A.plan({ cell: g, grow: 0 }, { avoid: av }), [goal, ice]);
      R.rec(`f${f}: the far shore cannot be reached on snow alone (the ice is in the way)`, walkFree === false);
      let moves = solve(P, await cell(), goal), n = 0, ok = !!moves, shotIce = false;
      R.rec(`f${f}: a crossing exists from where she arrives (${moves ? moves.length : '-'} pushes; the plan says ${P.tests.solver.slidesToExit} slides)`, !!moves, moves && moves.map(m => m.from + '>' + 'DLRU'[m.d] + '>' + m.to));
      while (ok && moves.length) { const m = moves.shift(); n++;
        const here = await cell(), onIce = P.rows[here[1]][here[0]] === '~';
        if (!onIce) { const g = await R.go({ cell: m.from, grow: -10 }, { avoid: ice }); if (!g.ok) { ok = R.rec(`f${f}: walk on the snow to ${m.from}`, false, g); break; } }
        const st0 = await R.ev(() => window.__A.mstate().slides);
        await R.ev(([dx, dy]) => window.__A.push(dx, dy, 2500, () => { const st = window.__A.mstate(); return !!st.slide; }), D4[m.d]);
        if (!shotIce && (await R.ev(() => !!window.__A.mstate().slide))) { shotIce = true; await page.waitForTimeout(120); await R.shot(`f${f}-sliding`); }
        await page.waitForFunction(() => !window.__A.mstate().slide, { timeout: 15000 }).catch(() => {}); await page.waitForTimeout(250);
        const at = await cell(), st1 = await R.ev(() => window.__A.mstate().slides);
        const good = at[0] === m.to[0] && at[1] === m.to[1] && st1 - st0 >= (Math.abs(m.to[0] - m.from[0]) + Math.abs(m.to[1] - m.from[1]) <= 1 ? 0 : 1);   // one cell on (snow, or ice with a rock right behind it) is a step, not a slide
        if (!good) { ok = R.rec(`f${f}: push ${n} (${'DLRU'[m.d]} from ${m.from}) ends on ${m.to}`, false, { at, slides: st1 - st0 }); break; }
        if (f >= 2 && !saved && !m.snow && moves.length && Math.abs(m.to[0] - m.from[0]) + Math.abs(m.to[1] - m.from[1]) > 1) { saved = true;      // resting against a rock out on the ice, part way across
          await R.shot(`f${f}-on-the-ice`); const rc = await R.saveContinue(), a2 = await cell(), s2 = await R.st();
          R.rec(`f${f}: Save -> Continue while she rests on the ice puts her back on the same ice cell, still able to slide`, rc.ok && s2.floor === f && a2[0] === at[0] && a2[1] === at[1], { saved: rc.saved.pos, at: a2, was: at });
          await R.shot(`f${f}-resumed`); moves = solve(P, a2, goal) || []; }
      }
      if (!ok) break;
      R.rec(`f${f}: the lake is crossed in ${n} pushes, each ending where the rule says`, true);
      await R.shot(`f${f}-across`);
      if (stairs) { if (!(await R.stairs(stairs, f + 1, { avoid: ice }))) break; }
      else if (await R.boss(boss, f, { avoid: ice })) await R.exitByBossCell(boss);
    }
  } catch (e) { R.rec('probe crashed', false, String(e && e.stack || e).slice(0, 600)); await R.shot('crash').catch(() => {}); }
  process.exit((await R.finish()) ? 1 : 0);
})();
