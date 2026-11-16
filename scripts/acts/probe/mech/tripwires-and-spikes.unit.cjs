'use strict';
// Rules of the trip wires and spike patches against the Bandit Hideout plans (no browser).
//   node scripts/acts/probe/mech/tripwires-and-spikes.unit.cjs
const fs = require('fs'), F = require('./_fake.cjs');
const floors = fs.readdirSync(F.PLANS).filter(n => /^banditHideout-f\d+\.json$/.test(n)).map(n => +n.match(/f(\d+)/)[1]).sort((a, b) => a - b);
const C = (c) => [(c[0] + .5) * 48, (c[1] + .5) * 48];
for (const f of floors) {
  const mk = () => F.world('banditHideout', f, 'tripwires-and-spikes');
  let w = mk(); const M = w.plan.mechanic, wires = M.wires || [], patches = M.spikePatches || [], key = n => `d2.banditHideout.f${f}.${n}`;
  const to = (W, x, y, max = 3000) => { for (let i = 0; i < max; i++) { const [sx, sy] = W.soles(), d = Math.hypot(x - sx, y - sy); if (d < 3) return true; const b = W.soles(); W.frame({ x: (x - sx) / d, y: (y - sy) / d, m: 1 }, 16); const a = W.soles(); if (Math.hypot(a[0] - b[0], a[1] - b[1]) < 0.01) return false; } return false; };
  const sides = (wr) => { const xs = wr.cells.map(c => c[0]), ys = wr.cells.map(c => c[1]), vert = xs.every(x => x === xs[0]), m = wr.cells[wr.cells.length >> 1];
    return vert ? { a: n => [m[0] - n, m[1]], b: n => [m[0] + n, m[1]] } : { a: n => [m[0], m[1] - n], b: n => [m[0], m[1] + n] }; };
  // 1. cut: no prompt 3 tiles away, "Cut trip wire" within 2, the cut wire is safe to cross and stays cut
  let okCut = true; const log = [];
  for (const wr of wires) { const s = sides(wr);
    w.setSoles(...C(s.a(3))); w.idle(400); const far = w.prompt();
    w.setSoles(C(s.a(2))[0] + (s.a(2)[0] < s.a(1)[0] ? 20 : 0), C(s.a(2))[1] + (s.a(2)[1] < s.a(1)[1] ? 20 : 0)); w.idle(50); const verb = w.tap();
    const b0 = w.battles.length; w.idle(100); to(w, ...C(s.b(2))); w.idle(200);
    const ok = !far && verb === 'Cut trip wire' && w.flags[key(`wire${wr.id}.cut`)] === true && w.battles.length === b0;
    log.push([wr.id, !!far, verb, w.battles.length - b0]); if (!ok) okCut = false; }
  w.reload(); for (const wr of wires) { const s = sides(wr); w.setSoles(...C(s.a(1))); w.idle(400); if (w.prompt()) okCut = false; }
  F.check(`f${f}: ${wires.length} wire(s): no prompt at 3 tiles, "Cut trip wire" within 2, a cut wire is crossed without a battle and stays cut after a reload`, okCut, log);
  // 2. tripped: one ambush battle with a bandit, the wire is spent
  w = mk(); let okTrip = true; const tl = [];
  for (const wr of wires) { const s = sides(wr); w.setSoles(...C(s.a(2))); w.idle(400);
    const b0 = w.battles.length; to(w, ...C(s.b(2))); w.idle(700); const n1 = w.battles.length - b0, who = w.battles[b0];
    to(w, ...C(s.a(2))); w.idle(700); const n2 = w.battles.length - b0;
    tl.push([wr.id, who, n1, n2]); if (!(n1 === 1 && n2 === 1 && /bandit|bruiser|knifeSneak/.test(who) && w.flags[key(`wire${wr.id}.spent`)] === true)) okTrip = false; }
  F.check(`f${f}: walking through a live wire = exactly one bandit ambush, the wire is spent (crossing back is free)`, okTrip, tl);
  // 3. spikes: a small hit, thrown back two tiles the way she came, the patch stays up
  w = mk(); let okSp = true; const sl = []
  for (let i = 0; i < patches.length; i++) { const cs = patches[i], x0 = Math.min(...cs.map(c => c[0])), x1 = Math.max(...cs.map(c => c[0])), y0 = Math.min(...cs.map(c => c[1])), y1 = Math.max(...cs.map(c => c[1]));
    const tries = [[[x0 - 3, y0], [1, 0]], [[x1 + 3, y0], [-1, 0]], [[x0, y0 - 3], [0, 1]], [[x0, y1 + 3], [0, -1]]];
    const clear = ([c, d]) => [0, 1, 2].every(k => { const q = [c[0] + d[0] * k, c[1] + d[1] * k]; return w.free(...C(q)) && !patches.some((p, j) => j !== i && p.some(z => z[0] === q[0] && z[1] === q[1])) && !wires.some(wr => wr.cells.some(z => z[0] === q[0] && z[1] === q[1])); });
    const t = tries.find(clear); if (!t) { sl.push([i, 'no clear approach']); continue; }
    const [c, d] = t; w.setSoles(...C(c)); w.idle(400); const st = w.ctx.state, h0 = st.hits || 0;
    for (let n = 0; n < 200 && (st.hits || 0) === h0; n++) { w.frame({ x: d[0], y: d[1], m: 1 }, 16); }
    w.idle(500); const [sx, sy] = w.soles(), edge = d[0] > 0 ? x0 * 48 - sx : d[0] < 0 ? sx - (x1 + 1) * 48 : d[1] > 0 ? y0 * 48 - sy : sy - (y1 + 1) * 48;
    const ok = (st.hits || 0) === h0 + 1 && edge >= 88 && edge <= 100 && w.flags[key(`spike${i}.sprung`)] === true && st.patches[i].up;
    sl.push([i, d, 'back ' + edge.toFixed(0) + ' px from the patch']); if (!ok) okSp = false; }
  w.reload(); const stillUp = patches.every((p, i) => !w.flags[key(`spike${i}.sprung`)] || w.ctx.state.patches[i].up);
  F.check(`f${f}: ${patches.length} spike patch(es): one hit each, thrown back ~2 tiles (96 px) from the patch, the spikes stay up after a reload`, okSp && stillUp, sl);
}
F.done('tripwires-and-spikes.unit');
