'use strict';
// Static soft-lock check for the slide-ice floors (Frozen Lake): from the floor's arrival, take EVERY slide a child might
// take (any direction, any order: wrong pushes included) and check that from every place she can come to rest the stairs
// / boss can still be reached. Uses the module's own slide rule (scripts/acts/probe/mech/slide-ice.solve.cjs).
//   node scripts/auto/feel/softlock_static.cjs   -> JSON on stdout
const fs = require('fs'), path = require('path');
const { solve, D4 } = require('../../acts/probe/mech/slide-ice.solve.cjs');
const PLANS = process.env.FEEL_PLANS || path.join(__dirname, 'data/plans');
const out = [];
for (let f = 1; f <= 9; f++) {
  const fn = path.join(PLANS, `frozenLake-f${f}.json`); if (!fs.existsSync(fn)) continue;
  const P = JSON.parse(fs.readFileSync(fn, 'utf8')), W = P.width, H = P.height;
  const solid = new Set(P.assets.filter(a => /^(chest|save|sign|boss)$/.test(a.kind)).map(a => a.x + ',' + a.y));
  const ch = (x, y) => (P.rows[y] && P.rows[y][x]) || '#', ice = (x, y) => ch(x, y) === '~' && !solid.has(x + ',' + y), snow = (x, y) => ch(x, y) === '.' && !solid.has(x + ',' + y);
  const run = (x, y, d) => { const [dx, dy] = D4[d]; let n = 0; for (;;) { const nx = x + dx, ny = y + dy; if (ice(nx, ny)) { x = nx; y = ny; n++; continue; } if (snow(nx, ny)) return [nx, ny]; return n ? [x, y] : null; } };
  const goalA = P.assets.find(a => a.kind === 'stairsNext') || P.assets.find(a => a.kind === 'boss');
  const goal = [P.route[P.route.length - 2][0], P.route[P.route.length - 2][1]], start = P.route[1];
  // every resting place reachable: snow cells by walking, ice cells by sliding
  const seen = new Set([start.join()]), q = [start];
  while (q.length) { const [x, y] = q.shift(); const nxt = [];
    if (snow(x, y)) { for (const [dx, dy] of D4) { if (snow(x + dx, y + dy)) nxt.push([x + dx, y + dy]); if (ice(x + dx, y + dy)) { const r = run(x + dx, y + dy, D4.findIndex(v => v[0] === dx && v[1] === dy)); if (r) nxt.push(r); } } }
    else for (let d = 0; d < 4; d++) { const r = run(x, y, d); if (r) nxt.push(r); }
    for (const c of nxt) if (!seen.has(c.join())) { seen.add(c.join()); q.push(c); } }
  const stuck = []; let iceRests = 0;
  for (const k of seen) { const c = k.split(',').map(Number); if (!ice(c[0], c[1])) continue; iceRests++;
    if (!solve(P, c, goal)) stuck.push(c); }
  out.push({ floor: f, goal: [goalA.kind, goalA.x, goalA.y], restingPlaces: seen.size, iceRests, softLocks: stuck.length, stuck: stuck.slice(0, 10) });
}
console.log(JSON.stringify(out, null, 1));
