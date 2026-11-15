'use strict';
// Rules of the mine carts against the four Iron Mine plans (no browser). Plays each plan's own
// solver line ("lever J", "ride cart 1 to N", ...) and checks where every ride ends.
//   node scripts/acts/probe/mech/mine-carts.unit.cjs
const F = require('./_fake.cjs');
for (let f = 1; f <= 4; f++) {
  const w = F.world('ironMine', f, 'mine-carts'), N = w.ctx.state.N, plan = w.plan, net = plan.mechanic.network;
  F.check(`f${f}: every stop, junction and cart of the plan is found on the rails`,
    net.stops.every(s => N.stops[s]) && Object.keys(net.junctions).every(j => N.junc[j] && N.junc[j].stem >= 0 && N.junc[j].branches.every(b => N.junc[j].arm[b] !== undefined)) && N.carts.length === net.carts.length,
    { stops: Object.keys(N.stops), junc: Object.values(N.junc).map(j => [j.name, j.x, j.y, j.stem, j.arm]) });
  // start somewhere standable beside cart 1
  const c0 = w.ctx.state.carts[0];
  const beside = (c) => { for (const [dx, dy] of [[0, 1], [0, -1], [1, 0], [-1, 0]]) { const x = c.x + dx, y = c.y + dy; if (w.free((x + .5) * 48, (y + .5) * 48) && plan.rows[y][x] === '.') return [x, y]; } return null; };
  let b = beside(c0); w.setSoles((b[0] + .5) * 48, (b[1] + .5) * 48);
  let ok = true, log = [];
  for (const stepTxt of plan.tests.solver.plan) {
    let m;
    if ((m = /^lever (\w+)$/.exec(stepTxt))) { const L = N.junc[m[1]].lever; const v = w.use(L.x, L.y); log.push([stepTxt, v]); if (v !== 'Pull lever') { ok = false; break; } }
    else if ((m = /^ride cart (\d+) to (\w+)$/.exec(stepTxt))) { const c = w.ctx.state.carts[+m[1] - 1]; const v = w.use(c.x, c.y); let n = 0; while (w.ctx.state.ride && n++ < 4000) w.frame(null, 16);
      const [sx, sy] = w.soles(); log.push([stepTxt, v, c.at, n, [Math.floor(sx / 48), Math.floor(sy / 48)]]);
      if (v !== 'Ride cart' || c.at !== m[2] || !w.free(sx, sy)) { ok = false; break; } }
  }
  F.check(`f${f}: the plan's own solution plays (${plan.tests.solver.plan.join(', ')})`, ok, log);
  // after the solution the exit must be walkable from where she stands
  const goal = plan.assets.find(a => a.kind === 'stairsNext' || a.kind === 'boss');
  const near = [[0, 1], [0, -1], [1, 0], [-1, 0]].map(([dx, dy]) => [goal.x + dx, goal.y + dy]).find(([x, y]) => w.free((x + .5) * 48, (y + .5) * 48));
  F.check(`f${f}: then the ${goal.kind} is reached on foot`, near && w.walkTo(near[0], near[1]) === true, near);
  // persistence: reload the module from the flags only
  const before = w.ctx.state.carts.map(c => c.at), sw = Object.keys(N.junc).map(j => !!w.flags[w.ctx.flagKey('sw.' + j)]);
  w.reload();
  F.check(`f${f}: carts and switches come back from the flags`, JSON.stringify(w.ctx.state.carts.map(c => c.at)) === JSON.stringify(before) && Object.keys(N.junc).every((j, i) => !!w.flags[w.ctx.flagKey('sw.' + j)] === sw[i]), { before, flags: Object.keys(w.flags) });
  // a save made mid-ride: she is put down at the destination
  const c = w.ctx.state.carts[w.ctx.state.carts.length - 1]; w.use(c.x, c.y); for (let i = 0; i < 10; i++) w.frame(null, 16);
  const mid = !!w.ctx.state.ride; w.reload(); w.frame(null, 16); const [sx, sy] = w.soles(), c2 = w.ctx.state.carts[w.ctx.state.carts.length - 1];
  F.check(`f${f}: a save made mid-ride resumes beside the cart at its destination`, mid && Math.abs(Math.floor(sx / 48) - c2.x) + Math.abs(Math.floor(sy / 48) - c2.y) === 1 && w.free(sx, sy), { cart: [c2.at, c2.x, c2.y], soles: [sx, sy] });
}
F.done('mine-carts.unit');
