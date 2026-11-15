'use strict';
// Fewest slides from a start cell to a goal on a Frozen Lake plan, by the module's own rule
// (public/acts-dungeons/modules/slide-ice.js). Used by the unit test and the probe.
// Returns [{from:[x,y] (the cell she pushes from: snow beside the ice, or the ice cell she rests on), d:heroDir, to:[x,y], snow}] or null.
const D4 = [[0, 1], [-1, 0], [1, 0], [0, -1]];
function solve(plan, start, goalCell, solidExtra = []) {
  const W = plan.width, H = plan.height, solid = new Set(plan.assets.filter(a => /^(chest|save|sign|boss)$/.test(a.kind)).map(a => a.x + ',' + a.y).concat(solidExtra));
  const ch = (x, y) => (plan.rows[y] && plan.rows[y][x]) || '#';
  const ice = (x, y) => ch(x, y) === '~' && !solid.has(x + ',' + y), snow = (x, y) => ch(x, y) === '.' && !solid.has(x + ',' + y);
  const run = (x, y, d) => { const [dx, dy] = D4[d]; let n = 0; for (;;) { const nx = x + dx, ny = y + dy; if (ice(nx, ny)) { x = nx; y = ny; n++; continue; } if (snow(nx, ny)) return { x: nx, y: ny, n: n + 1, snow: true }; return { x, y, n, snow: false }; } };
  // snow components
  const comp = new Map(); let nc = 0; const cells = [];
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (snow(x, y) && !comp.has(x + ',' + y)) { const q = [[x, y]]; comp.set(x + ',' + y, nc); cells[nc] = [];
    while (q.length) { const [a, b] = q.pop(); cells[nc].push([a, b]); for (const [dx, dy] of D4) { const k = (a + dx) + ',' + (b + dy); if (snow(a + dx, b + dy) && !comp.has(k)) { comp.set(k, nc); q.push([a + dx, b + dy]); } } } nc++; }
  const node = (x, y) => snow(x, y) ? 's' + comp.get(x + ',' + y) : 'i' + x + ',' + y;
  const goal = node(goalCell[0], goalCell[1]), s0 = node(start[0], start[1]);
  const prev = new Map([[s0, null]]), q = [s0];
  while (q.length) { const n = q.shift(); if (n === goal) break;
    const moves = [];
    if (n[0] === 's') { for (const [x, y] of cells[+n.slice(1)]) for (let d = 0; d < 4; d++) { const ix = x + D4[d][0], iy = y + D4[d][1]; if (!ice(ix, iy)) continue; const r = run(ix, iy, d); moves.push({ from: [x, y], d, to: [r.x, r.y], snow: r.snow }); } }
    else { const [x, y] = n.slice(1).split(',').map(Number); for (let d = 0; d < 4; d++) { const r = run(x, y, d); if (r.n > 0) moves.push({ from: [x, y], d, to: [r.x, r.y], snow: r.snow }); } }
    for (const m of moves) { const k = node(m.to[0], m.to[1]); if (!prev.has(k)) { prev.set(k, { n, m }); q.push(k); } } }
  if (!prev.has(goal)) return null;
  const out = []; let k = goal; while (prev.get(k)) { out.push(prev.get(k).m); k = prev.get(k).n; } return out.reverse();
}
module.exports = { solve, D4 };
