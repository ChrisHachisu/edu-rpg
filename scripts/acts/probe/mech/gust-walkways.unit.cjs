'use strict';
// Rules of the gusts against the five Storm Nest plans (no browser): the cycle of every lane is
// the plan's (period / active / warn / phase, 185 ms a tick); standing in a lane while it blows
// ends on the plan's landing for that edge; a crossing begun as the gust dies is dry.
//   node scripts/acts/probe/mech/gust-walkways.unit.cjs
const F = require('./_fake.cjs');
for (let f = 1; f <= 5; f++) {
  const w = F.world('stormNest', f, 'gust-walkways'), P = w.plan, st = w.ctx.state, zones = P.zones.filter(z => z.kind === 'gustLane');
  // 1. the clock
  let okClock = st.lanes.length === zones.length; const seen = st.lanes.map(() => ({ gust: 0, warn: 0 }));
  const period = zones[0].period, frames = Math.round(period * 185 / 5);
  w.setSoles(24, 24);                                               // parked in a corner, off every lane
  for (let i = 0; i < frames; i++) { w.frame(null, 5); st.lanes.forEach((L, k) => { if (L.state === 'gust') seen[k].gust += 5; else if (L.state === 'warn') seen[k].warn += 5; }); }
  zones.forEach((z, k) => { if (Math.abs(seen[k].gust - z.active * 185) > 12 || Math.abs(seen[k].warn - z.warn * 185) > 12) okClock = false; });
  F.check(`f${f}: every lane gusts for 'active' ticks and warns for 'warn' ticks in each period`, okClock, seen.map((s, k) => [zones[k].id, s.gust, zones[k].active * 185, s.warn, zones[k].warn * 185]));
  // 2. caught in every lane, at each end of each walkway crossing
  let okFall = true; const log = [];
  for (const z of zones) for (const c of [z.cells[0], z.cells[z.cells.length - 1]]) {
    const L = st.lanes.find(l => l.id === z.id); let n = 0;
    w.setSoles(24, 24); while (L.state !== 'lull' && n++ < 5000) w.frame(null, 8);
    w.setSoles((c[0] + .5) * 48, (c[1] + .5) * 48); w.msgs.length = 0; w.moves.length = 0; n = 0;
    while (!st.blown && n++ < 5000) w.frame(null, 8);              // wait on the lane: the gust must take her
    n = 0; while (st.blown && st.blown.stage !== 'gone' && n++ < 3000) w.frame(null, 8);
    const [sx, sy] = w.soles(), at = [Math.floor(sx / 48), Math.floor(sy / 48)];
    const lands = P.mechanic.fallLandings.filter(l => l.lane === z.id);
    const hit = w.moves.length ? lands.find(l => l.landsOnFloor === w.moves[0].floor && l.landsAt[0] === w.moves[0].spot.x && l.landsAt[1] === w.moves[0].spot.y)
      : lands.find(l => l.landsOnFloor === f && l.landsAt[0] === at[0] && l.landsAt[1] === at[1]);
    log.push([z.id, c, w.moves.length ? ['floor', w.moves[0].floor, w.moves[0].spot.x, w.moves[0].spot.y] : at, !!hit]);
    if (!hit) okFall = false;
    if (st.blown) st.blown = null;                                 // (the fake has no floor change)
  }
  F.check(`f${f}: caught in a gust she is blown off and lands on one of the plan's landings for that lane`, okFall, log);
  // 3. crossing in the lull is dry: step onto the first lane the moment its gust ends, cross it
  const z = zones[0], L = st.lanes[0], hz = z.dir[0] !== 0, c0 = z.cells[0];
  const span = z.cells.filter(c => hz ? c[1] === c0[1] : c[0] === c0[0]), lo = Math.min(...span.map(c => hz ? c[0] : c[1])), hi = Math.max(...span.map(c => hz ? c[0] : c[1]));
  // a lane is crossed ACROSS the wind: walk along the walkway through the 3 lane cells
  const across = z.cells.filter(c => hz ? c[0] === c0[0] : c[1] === c0[1]), a0 = Math.min(...across.map(c => hz ? c[1] : c[0])), a1 = Math.max(...across.map(c => hz ? c[1] : c[0]));
  const from = hz ? [c0[0], a0 - 1] : [a0 - 1, c0[1]], to = hz ? [c0[0], a1 + 1] : [a1 + 1, c0[1]];
  w.setSoles((from[0] + .5) * 48, (from[1] + .5) * 48); let n = 0;
  while (!(L.state === 'gust') && n++ < 5000) w.frame(null, 8); n = 0; while (L.state === 'gust' && n++ < 5000) w.frame(null, 8);
  w.msgs.length = 0; const falls0 = st.falls || 0; let fr = 0;
  for (; fr < 2000; fr++) { const [sx, sy] = w.soles(), dx = (to[0] + .5) * 48 - sx, dy = (to[1] + .5) * 48 - sy, d = Math.hypot(dx, dy); if (d < 4 || st.blown) break; w.frame({ x: dx / d, y: dy / d, m: 1 }, 16); }
  F.check(`f${f}: a crossing begun as the gust dies is dry (${(fr * 16 / 1000).toFixed(1)} s to cross, lull ${((z.period - z.active) * .185).toFixed(1)} s)`, !st.blown && (st.falls || 0) === falls0, { from, to, frames: fr });
}
F.done('gust-walkways.unit');
