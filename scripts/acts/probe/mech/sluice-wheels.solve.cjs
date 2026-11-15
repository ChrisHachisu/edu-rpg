'use strict';
// Oasis Depths solver over the plan JSON, independent of the module (same rule as
// plans/dungeons/oasisDepths_recover.py): 4-neighbour walking over '.' and dry channel cells;
// wheels, chests, mimics, stairs and the boss are solid; a wheel is turned from a cell beside it and
// toggles every channel it works. Used by sluice-wheels.unit.cjs (rules) and sluice-wheels.cjs (the
// turn order the browser probe plays).
const fs = require('fs'), path = require('path');
const PLANS = process.env.D2_PLANS || '/home/user/work/plans/out';
const plan = f => JSON.parse(fs.readFileSync(path.join(PLANS, `oasisDepths-f${f}.json`), 'utf8'));
const N4 = [[1, 0], [-1, 0], [0, 1], [0, -1]];
// The planning page's own numbers (the recovery script's PAGE table).
const PAGE = { 1: { stairs: 1, treasure: 0, states: 2 }, 2: { stairs: 1, treasure: 1, states: 2 }, 3: { stairs: 3, treasure: 1, states: 5 },
  4: { stairs: 4, treasure: 4, states: 12 }, 5: { stairs: 1, treasure: null, states: 2 } };

function model(P) {
  const rows = P.rows, H = rows.length, W = rows[0].length, solid = new Set(), chanAt = new Map();
  for (const a of P.assets) if (['wheel', 'chest', 'mimic', 'boss', 'stairsNext', 'stairsPrev'].includes(a.kind)) solid.add(a.x + ',' + a.y);
  for (const c of P.mechanic.channels) for (let y = c.rect[1]; y <= c.rect[3]; y++) for (let x = c.rect[0]; x <= c.rect[2]; x++) chanAt.set(x + ',' + y, c);
  const wheels = P.mechanic.wheels.map(w => ({ id: w.id, x: w.at[0], y: w.at[1], channels: w.channels }));
  const open = (x, y, m) => { if (x < 0 || y < 0 || x >= W || y >= H || solid.has(x + ',' + y)) return false; const c = chanAt.get(x + ',' + y);
    if (c) return !(c.floodedAtStart !== !!((m >> (c.wheel - 1)) & 1)); return rows[y][x] === '.'; };
  const goalA = P.assets.find(a => a.kind === 'stairsNext' || a.kind === 'boss');
  const chests = P.assets.filter(a => a.kind === 'chest');
  let arrival = P.mechanic.arrival.slice();
  if (P.floor > 1) { const s = arrival; for (const [dx, dy] of [[0, 1], [-1, 0], [1, 0], [0, -1]]) if (rows[s[1] + dy][s[0] + dx] === '.') { arrival = [s[0] + dx, s[1] + dy]; break; } }
  return { P, rows, W, H, open, wheels, goal: [goalA.x, goalA.y], chests: chests.map(c => [c.x, c.y]), arrival, chanAt };
}
const beside = (p, g) => Math.abs(p[0] - g[0]) + Math.abs(p[1] - g[1]) === 1;
// 0-1 BFS (walk = 0, turn = 1) from (cell, mask): fewest turns to stand beside `goal`; returns {turns, seq:[{wheel, from:[x,y]}], mask, cell}
function plan01(Md, start, m0, goal) {
  const key = (x, y, m) => `${x},${y},${m}`, dist = new Map(), prev = new Map(), dq = [[start[0], start[1], m0]];
  dist.set(key(...start, m0), 0); prev.set(key(...start, m0), null);
  while (dq.length) {
    const [x, y, m] = dq.shift(), d = dist.get(key(x, y, m));
    if (beside([x, y], goal)) {
      const seq = []; let k = key(x, y, m);
      while (prev.get(k)) { const p = prev.get(k); if (p.turn) seq.unshift({ wheel: p.turn, from: p.from }); k = p.k; }
      return { turns: d, seq, mask: m, cell: [x, y] };
    }
    for (const [dx, dy] of N4) { const nx = x + dx, ny = y + dy;
      if (Md.open(nx, ny, m)) { const k = key(nx, ny, m); if (!dist.has(k) || dist.get(k) > d) { dist.set(k, d); prev.set(k, { k: key(x, y, m) }); dq.unshift([nx, ny, m]); } }
      for (const w of Md.wheels) if (w.x === nx && w.y === ny) { const nm = m ^ (1 << (w.id - 1)), k = key(x, y, nm);
        if (!dist.has(k) || dist.get(k) > d + 1) { dist.set(k, d + 1); prev.set(k, { k: key(x, y, m), turn: w.id, from: [x, y] }); dq.push([x, y, nm]); } } }
  }
  return null;
}
// every (cell, mask) reachable from the arrival in the start state
function reachable(Md, start = Md.arrival, m0 = 0) {
  const seen = new Set([`${start[0]},${start[1]},${m0}`]), q = [[start[0], start[1], m0]];
  for (let h = 0; h < q.length; h++) { const [x, y, m] = q[h];
    for (const [dx, dy] of N4) { const nx = x + dx, ny = y + dy;
      if (Md.open(nx, ny, m) && !seen.has(`${nx},${ny},${m}`)) { seen.add(`${nx},${ny},${m}`); q.push([nx, ny, m]); }
      for (const w of Md.wheels) if (w.x === nx && w.y === ny) { const nm = m ^ (1 << (w.id - 1)); if (!seen.has(`${x},${y},${nm}`)) { seen.add(`${x},${y},${nm}`); q.push([x, y, nm]); } } } }
  return [...seen].map(s => s.split(',').map(Number));
}
function regionId(Md, c, m) { const s = new Set([c.join()]), q = [c]; let lo = c.join();
  for (let h = 0; h < q.length; h++) { const [x, y] = q[h]; for (const [dx, dy] of N4) { const n = [x + dx, y + dy]; if (Md.open(n[0], n[1], m) && !s.has(n.join())) { s.add(n.join()); q.push(n); if (n.join() < lo) lo = n.join(); } } }
  return lo; }
function report(f) {
  const Md = model(plan(f)), all = reachable(Md);
  const states = new Set(all.map(([x, y, m]) => `${m}|${regionId(Md, [x, y], m)}`)).size;
  const soft = all.filter(([x, y, m]) => !plan01(Md, [x, y], m, Md.goal)).length;
  const masks = [...new Set(all.map(s => s[2]))].sort((a, b) => a - b);
  const entry = f === 1 ? (() => { const mo = Md.P.assets.find(a => a.kind === 'mouth'); return [mo.x, mo.y - 1]; })() : Md.arrival;
  const strand = masks.filter(m => !plan01(Md, entry, m, Md.goal));
  const g = plan01(Md, Md.arrival, 0, Md.goal), t = Md.chests.map(c => plan01(Md, Md.arrival, 0, c));
  return { Md, states, softLocks: soft, stairsTurns: g && g.turns, treasureTurns: t.map(x => x && x.turns), masks, strandAtEntry: strand, goalSeq: g && g.seq, entry };
}
module.exports = { plan, model, plan01, reachable, report, PAGE, beside };
if (require.main === module) for (let f = 1; f <= 5; f++) { const r = report(f); delete r.Md; console.log('f' + f, JSON.stringify(r), 'page', JSON.stringify(PAGE[f])); }
