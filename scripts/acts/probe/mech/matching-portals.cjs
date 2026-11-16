'use strict';
// Twilight Realm, matching portals, played like a player: in by the portal isle's mouth; on every
// floor the plan's hops in order (she walks onto the pad of that colour on her island and stands on
// its twin), the stairs, the Celestial Guardian, the way out. Also: the twin shining while she is
// near a pad, stepping off and on again to go back (two-way, re-armed), and Save -> Continue
// standing on the pad she has just arrived on (it stays asleep: no hop on load).
//   NODE_PATH=/opt/node-tools/node_modules PROBE_URL=http://127.0.0.1:5260/ PROBE_OUT=<dir> \
//     flock /home/user/work/e2/heavy.lock.$((RANDOM%2)) node scripts/acts/probe/mech/matching-portals.cjs
const { Run, plan } = require('./_b-lib.cjs');
const ID = 'twilightDungeon', BOSS = 'celestialGuardian', FLOORS = 6;

const EXTRA = `(() => { const B = window.__B;
  const pads = () => B.mstate().pads;
  const away = (sx, sy) => { const S = B.mstate(); return S.pads.some(p => p !== S.asleep && Math.hypot(p.px - sx, p.py - sy) < 34); };
  window.__BM = {
    info: () => { const S = B.mstate(), s = B.state(); return { hops: S.hops, asleep: S.asleep ? [S.asleep.x, S.asleep.y] : null, last: S.last || null, at: [Math.round(s.sx), Math.round(s.sy)], cell: [s.cx, s.cy],
      shine: S.pads.filter(p => p.shine).map(p => [p.x, p.y]) }; },
    // which pad of this colour can she walk to from here (without treading on another pad)?
    pad: colour => { for (const p of pads()) { if (p.colour !== colour) continue; if (B.plan({ soles: [p.px, p.py], r: 9 }, { avoidFn: (x, y) => Math.hypot(p.px - x, p.py - y) >= 34 && away(x, y) })) return { x: p.x, y: p.y, px: p.px, py: p.py, twin: [p.twin.x, p.twin.y] }; } return null; },
    near: p => B.go({ soles: [p.px, p.py], r: 100 }, { avoidFn: (x, y) => away(x, y) || Math.hypot(p.px - x, p.py - y) < 60 }),
    onto: async p => { const S = B.mstate(), n0 = S.hops; const g = await B.go({ soles: [p.px, p.py], r: 9 }, { avoidFn: (x, y) => Math.hypot(p.px - x, p.py - y) >= 34 && away(x, y), until: () => S.hops > n0 });
      await B.wait(350); return { g: g.why, hopped: S.hops - n0 }; },
    off: async () => { const S = B.mstate(), a = S.asleep; if (!a) return true;       // step off the pad she stands on, any free way
      for (const d of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { await B.push(d[0], d[1], 500, () => !S.asleep); if (!S.asleep) return true; } return !S.asleep; },
    walk: goal => B.go(goal, { avoidFn: away }), reach: goal => !!B.plan(goal, { avoidFn: away }) };
})()`;

(async () => {
  const R = new Run(ID, { bossId: BOSS, name: 'matching-portals', extra: EXTRA });
  try {
    if (!(await R.start())) throw new Error('could not enter');
    const page = R.page;
    const info = () => R.ev(() => window.__BM.info());
    let resumed = false;
    for (let f = 1; f <= FLOORS; f++) {
      const P = plan(ID, f), hops = P.tests.solver.plan; let s = await R.st();
      if (!R.rec(`f${f}: on the authored floor with the matching-portals module`, s.map === ID && s.floor === f && s.w === P.width && s.h === P.height && s.d2.mechanic === 'matching-portals' && s.d2.module, s)) break;
      await R.shot(`f${f}-arrive`);
      const goalA = f < FLOORS ? P.assets.find(a => a.kind === 'stairsNext') : P.assets.find(a => a.kind === 'boss');
      const goal = f < FLOORS ? { centre: [goalA.x, goalA.y] } : { beside: [goalA.x, goalA.y], reach: 60 };
      R.rec(`f${f}: the way on is on another island: it cannot be walked to`, (await R.ev(g => window.__BM.reach(g), goal)) === false);
      let ok = true;
      for (let k = 0; k < hops.length && ok; k++) {
        const p = await R.ev(c => window.__BM.pad(c), hops[k]);
        if (!R.rec(`f${f} hop ${k + 1}: a ${hops[k]} pad stands on her island`, !!p, p)) { ok = false; break; }
        if (k === 0) { await R.ev(p => window.__BM.near(p), p); await page.waitForTimeout(250); const i0 = await info(); await R.shot(`f${f}-near-${hops[k]}`);
          R.rec(`f${f}: near the ${hops[k]} pad its twin shines`, i0.shine.some(c => c[0] === p.twin[0] && c[1] === p.twin[1]), i0); }
        const h = await R.ev(p => window.__BM.onto(p), p), i1 = await info(); await R.shot(`f${f}-hop-${k + 1}-${hops[k]}`);
        ok = R.rec(`f${f} hop ${k + 1}: stepping on the ${hops[k]} pad puts her on its twin, which sleeps until she steps off`,
          h.hopped === 1 && i1.cell[0] === p.twin[0] && i1.cell[1] === p.twin[1] && i1.asleep && i1.asleep[0] === p.twin[0] && i1.asleep[1] === p.twin[1], { h, i1, pad: p });
        if (!ok) break;
        if (f === 1 && k === 0) {                                               // two-way and re-armed: off, on again, back; then forward again
          const off = await R.ev(() => window.__BM.off()), tw = { px: p.twin[0] * 48 + 24, py: p.twin[1] * 48 + 24 };
          const hb = await R.ev(p => window.__BM.onto(p), tw), i2 = await info();
          R.rec('f1: stepping off the twin and on again takes her back (two-way, re-armed by stepping off)', off === true && hb.hopped === 1 && i2.cell[0] === p.x && i2.cell[1] === p.y, { off, hb, i2 });
          await R.ev(() => window.__BM.off()); const hf = await R.ev(p => window.__BM.onto(p), p), i3 = await info();
          ok = R.rec('f1: and forward again the same way', hf.hopped === 1 && i3.cell[0] === p.twin[0] && i3.cell[1] === p.twin[1], { hf, i3 });
        }
        if (f === 2 && k === 0 && !resumed) { resumed = true;                   // on the pad she has just arrived on
          const b = { i: await info(), s: await R.st() }; const rc = await R.saveContinue(); await page.waitForTimeout(800); const a = { i: await info(), s: await R.st() };
          R.rec('f2: Save -> Continue standing on the arrival pad leaves her there: it sleeps, no hop on load',
            rc.ok && a.s.floor === 2 && a.i.hops === 0 && a.i.asleep && a.i.asleep[0] === p.twin[0] && a.i.asleep[1] === p.twin[1] && Math.abs(a.s.cx - b.s.cx) <= 1 && Math.abs(a.s.cy - b.s.cy) <= 1,
            { after: a.i, at: [a.s.cx, a.s.cy], was: [b.s.cx, b.s.cy] });
          await R.shot('f2-resumed'); }
      }
      if (!ok) break;
      if (!R.rec(`f${f}: after ${hops.length} hop(s) the way on can be walked`, (await R.ev(g => window.__BM.reach(g), goal)) === true, hops)) break;
      const opts = { avoidFn: null };
      if (f < FLOORS) { await R.ev(g => window.__BM.walk({ beside: g, reach: 40 }), [goalA.x, goalA.y]); if (!(await R.stairs(goalA, f + 1))) break; }
      else { await R.ev(g => window.__BM.walk({ beside: g, reach: 60 }), [goalA.x, goalA.y]); if (await R.boss(goalA, f)) await R.exitByBossCell(goalA); }
      void opts;
    }
  } catch (e) { R.rec('probe crashed', false, String(e && e.stack || e).slice(0, 600)); await R.shot('crash').catch(() => {}); }
  process.exit((await R.finish()) ? 1 : 0);
})();
