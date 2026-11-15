'use strict';
// Rules of the shadows against the five Shadow Cave plans (no browser).
//   node scripts/acts/probe/mech/shadow-freeze.unit.cjs
const F = require('./_fake.cjs');
for (let f = 1; f <= 5; f++) {
  let w = F.world('shadowCave', f, 'shadow-freeze'); const P = w.plan, pr = P.mechanic.params, sh = P.mechanic.shadows;
  const st = () => w.ctx.state;
  w.setSoles(24, 24);
  // 1. the beat, and the prowl: one cell every shadowStepDimTicks while dim, frozen while the crystals shine
  let dim = 0, shine = 0, okMove = true, last = null, movedInShine = 0, cellsInDim = 0; const per = (pr.dimTicks + pr.shineTicks) * 185;
  for (let t = 0; t < per; t += 5) { w.frame(null, 5); const s0 = st().shadows[0], c = [s0.cx, s0.cy];
    if (st().dim) dim += 5; else shine += 5;
    if (last && (c[0] !== last[0] || c[1] !== last[1])) { if (st().dim) cellsInDim++; else movedInShine++; if (Math.abs(c[0] - last[0]) + Math.abs(c[1] - last[1]) !== 1) okMove = false; }
    last = c; }
  F.check(`f${f}: dim ${pr.dimTicks} ticks, shine ${pr.shineTicks} ticks; a shadow moves ${pr.dimTicks / pr.shadowStepDimTicks} cells per dim phase along its track and none while frozen`,
    Math.abs(dim - pr.dimTicks * 185) <= 10 && Math.abs(shine - pr.shineTicks * 185) <= 10 && okMove && movedInShine === 0 && Math.abs(cellsInDim - Math.min(pr.dimTicks / pr.shadowStepDimTicks, 99)) <= 1 && st().shadows.every(s => s.track.some(c => c[0] === s.cx && c[1] === s.cy)),
    { dim, shine, cellsInDim, movedInShine });
  // 2. the careful way past every shadow: along the side row of its run while it is frozen
  let okPass = true; const log = [];
  for (const s of sh) {
    const xs = s.track.map(c => c[0]), ys = s.track.map(c => c[1]), hz = ys[0] === ys[ys.length - 1];
    const a = hz ? [Math.min(...xs) - 2, ys[0] + 1] : [xs[0] + 1, Math.min(...ys) - 2], b = hz ? [Math.max(...xs) + 2, ys[0] + 1] : [xs[0] + 1, Math.max(...ys) + 2];
    if (!w.free((a[0] + .5) * 48, (a[1] + .5) * 48) || !w.free((b[0] + .5) * 48, (b[1] + .5) * 48)) { log.push([s.id, 'skip', a, b]); continue; }
    w.setSoles((a[0] + .5) * 48, (a[1] + .5) * 48); let n = 0;
    while (!st().dim && n++ < 9000) w.frame(null, 8); n = 0; while (st().dim && n++ < 9000) w.frame(null, 8);   // the moment the crystals light
    const b0 = w.battles.length; let fr = 0;
    for (; fr < 3000; fr++) { const [sx, sy] = w.soles(), dx = (b[0] + .5) * 48 - sx, dy = (b[1] + .5) * 48 - sy, d = Math.hypot(dx, dy); if (d < 4) break; w.frame({ x: dx / d, y: dy / d, m: 1 }, 16); }
    log.push([s.id, a, b, (fr * 16 / 1000).toFixed(1) + 's', w.battles.length - b0]);
    if (w.battles.length !== b0) okPass = false;
  }
  F.check(`f${f}: walking the side row of each run while the crystals shine (${(pr.shineTicks * .185).toFixed(1)} s) starts no battle`, okPass, log);
  // 3. caught while it prowls: within one cell
  const s0 = sh[0]; let n = 0; w.setSoles(24, 24);
  while (st().dim && n++ < 9000) w.frame(null, 8); n = 0; while (!st().dim && n++ < 9000) w.frame(null, 8);      // dim has just begun
  const live = st().shadows.find(s => s.id === s0.id); w.setSoles((live.cx + .5) * 48, (live.cy + 1 + .5) * 48);  // right beside it
  const b1 = w.battles.length; for (let i = 0; i < 120; i++) w.frame(null, 16);
  F.check(`f${f}: beside a prowling shadow she is caught: a 'shadow' battle, and that shadow is gone`, w.battles.length === b1 + 1 && w.battles[b1] === 'shadow' && !st().shadows.some(s => s.id === s0.id) && w.flags[w.ctx.flagKey('shadow' + s0.id + '.gone')] === true && w.msgs.length > 0, { battles: w.battles, msgs: w.msgs.slice(-1) });
  w.reload(); F.check(`f${f}: the beaten shadow stays gone after a reload from the flags`, !st().shadows.some(s => s.id === s0.id) && st().shadows.length === sh.length - 1);
  // 4. frozen: beside it is safe, its own cell is not
  if (sh.length > 1) { const s1 = sh[1]; n = 0; w.setSoles(24, 24);
    while (!st().dim && n++ < 9000) w.frame(null, 8); n = 0; while (st().dim && n++ < 9000) w.frame(null, 8);
    const lv = st().shadows.find(s => s.id === s1.id), b2 = w.battles.length; w.setSoles((lv.cx + .5) * 48, (lv.cy + 1 + .5) * 48); for (let i = 0; i < 20; i++) w.frame(null, 16);
    const safe = w.battles.length === b2; w.setSoles((lv.cx + .5) * 48, (lv.cy + .5) * 48); for (let i = 0; i < 60; i++) w.frame(null, 16);
    F.check(`f${f}: beside a frozen shadow is safe; walking into it is a battle`, safe && w.battles.length === b2 + 1, { safe, battles: w.battles.length - b2 }); }
}
F.done('shadow-freeze.unit');
