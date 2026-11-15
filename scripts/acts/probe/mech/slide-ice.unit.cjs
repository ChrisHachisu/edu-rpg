'use strict';
// Rules of the slide ice against the five Frozen Lake plans (no browser): the fewest slides from
// the arrival to the stairs / boss must be the plan's own `tests.solver.slidesToExit`, and the
// module must play that line (stick pushes only) and stop exactly where the solver says.
//   node scripts/acts/probe/mech/slide-ice.unit.cjs
const F = require('./_fake.cjs'), { solve, D4 } = require('./slide-ice.solve.cjs');
for (let f = 1; f <= 5; f++) {
  const w = F.world('frozenLake', f, 'slide-ice'), P = w.plan;
  const startA = P.assets.find(a => a.kind === (f === 1 ? 'mouth' : 'stairsPrev')), goalA = P.assets.find(a => a.kind === 'stairsNext' || a.kind === 'boss');
  const around = (a) => [[0, 1], [0, -1], [1, 0], [-1, 0], [1, 1], [-1, -1], [1, -1], [-1, 1], [0, -2], [0, 2], [2, 0], [-2, 0]].map(([dx, dy]) => [a.x + dx, a.y + dy]).find(([x, y]) => P.rows[y] && P.rows[y][x] === '.' && !P.assets.some(b => b.x === x && b.y === y));
  const start = around(startA), goal = around(goalA);
  const sol = solve(P, start, goal);
  // the plan counts a one-cell step from the ice onto the snow beside it as a step, not a slide
  const real = sol ? sol.filter(m => !(P.rows[m.from[1]][m.from[0]] === '~' && m.snow && Math.abs(m.to[0] - m.from[0]) + Math.abs(m.to[1] - m.from[1]) === 1)).length : -1, want = P.tests.solver.slidesToExit;
  F.check(`f${f}: fewest slides to the ${goalA.kind} is the plan's slidesToExit (${want})`, !!sol && real <= want && want <= sol.length, sol && sol.map(m => `${m.from}>${'SWEN'[m.d]}>${m.to}`).join(' '));
  if (f === 1) { const r = w.mod._debug.run(w.ctx, 28, 12, 3); F.check('f1: the proposed fifth rock (28,9) stops a slide', P.rows[9][28] === 'o' && r.x === 28 && r.y === 10, r); }
  if (!sol) continue;
  w.setSoles((start[0] + .5) * 48, (start[1] + .5) * 48);
  let ok = true; const log = [];
  for (const m of sol) {
    const [sx, sy] = w.soles(), cx = Math.floor(sx / 48), cy = Math.floor(sy / 48);
    if (P.rows[cy][cx] !== '~') { if (w.walkTo(m.from[0], m.from[1]) !== true) { ok = false; log.push(['walk', m.from]); break; } }   // on snow: walk to the edge cell
    else if (cx !== m.from[0] || cy !== m.from[1]) { ok = false; log.push(['rest', [cx, cy], m.from]); break; }
    const [dx, dy] = D4[m.d]; let n = 0;
    do { w.frame({ x: dx, y: dy, m: 1 }); n++; } while (n < 40 && !w.ctx.state.slide);          // push until the slide takes her
    while (w.ctx.state.slide && n++ < 3000) w.frame({ x: dx, y: dy, m: 1 });                    // stick still held: must not run on
    const [ex, ey] = w.soles(), at = [Math.floor(ex / 48), Math.floor(ey / 48)]; log.push([m.from, 'SWEN'[m.d], at]);
    if (at[0] !== m.to[0] || at[1] !== m.to[1]) { ok = false; break; }
    w.frame(null); w.frame(null);
  }
  F.check(`f${f}: the module plays that line and stops where the solver says`, ok, log);
  F.check(`f${f}: she ends on the snow by the ${goalA.kind}`, ok && w.walkTo(goal[0], goal[1]) === true);
}
F.done('slide-ice.unit');
