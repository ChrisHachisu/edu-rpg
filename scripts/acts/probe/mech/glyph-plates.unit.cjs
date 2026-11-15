'use strict';
// Rules of the glyph plates against the Desert Tomb plans (no browser).
//   node scripts/acts/probe/mech/glyph-plates.unit.cjs
const fs = require('fs'), F = require('./_fake.cjs');
const floors = fs.readdirSync(F.PLANS).filter(n => /^desertTomb-f\d+\.json$/.test(n)).map(n => +n.match(/f(\d+)/)[1]).sort((a, b) => a - b);
const C = (c) => [(c[0] + .5) * 48, (c[1] + .5) * 48];
for (const f of floors) {
  let w = F.world('desertTomb', f, 'glyph-plates'); const rooms = w.plan.mechanic.rooms || [];
  if (!rooms.length) { F.check(`f${f}: no plate room on this floor, the module loads and idles`, (w.idle(200), true)); continue; }
  const dbg = w.mod._debug;
  const to = (x, y, max = 4000) => { for (let i = 0; i < max; i++) { const [sx, sy] = w.soles(), d = Math.hypot(x - sx, y - sy); if (d < 3) return true; const b = w.soles(); w.frame({ x: (x - sx) / d, y: (y - sy) / d, m: 1 }, 16); const a = w.soles(); if (Math.hypot(a[0] - b[0], a[1] - b[1]) < 0.01) return false; } return false; };
  for (const R of rooms) {
    const B = dbg.build(R), key = c => c.join(','), mid = k => { const p = B.plates[k]; return [(p.x0 + p.x1) / 2, (p.y0 + p.y1) / 2]; };
    const V = () => w.ctx.state.rooms.find(v => v.R.room === R.room), tag = `f${f} ${R.room} (${R.grid}x${R.grid}, ${R.path.length} steps)`;
    const entry = C(B.entry), doorShut = () => R.door.every(c => !w.free(...C(c)));
    // 0. the plan is what the module assumes: orthogonal path, order = glyphs along it, first plate beside the entry strip
    const orth = R.path.every((c, i) => !i || Math.abs(c[0] - R.path[i - 1][0]) + Math.abs(c[1] - R.path[i - 1][1]) === 1);
    F.check(`${tag}: path is orthogonal and spells the order`, orth && R.path.every((c, i) => R.glyphs[key(c)] === R.order[i]));
    // 1. the tablet: a Read prompt, the order in the message, the flag
    const tab = w.plan.assets.find(a => a.kind === 'tablet' && a.room === R.room); const nb = [[0, 1], [0, -1], [1, 0], [-1, 0]].map(d => [tab.x + d[0], tab.y + d[1]]).find(c => w.free(...C(c))); w.setSoles(...C(nb)); w.pushAt(tab.x, tab.y, 20); const verb = w.tap();
    F.check(`${tag}: the tablet is solid, reads "${verb}", names the order and sets the read flag`, verb === 'Read' && !w.free(...C([tab.x, tab.y])) && R.order.every(n => w.msgs[w.msgs.length - 1].toLowerCase().includes(n)) && w.flags[`d2.desertTomb.f${f}.room${R.room}.read`] === true);
    // 2. the door is shut; the seams between plates are safe
    w.setSoles(...entry); w.idle(50);
    const p0 = B.plates[key(R.path[0])]; let seamOk = doorShut();
    const b0 = w.battles.length;
    for (const k of Object.keys(B.plates)) { const p = B.plates[k]; for (const [x, y] of [[p.x0 + 4, p.y0 + 4], [p.x1 - 4, p.y0 + 60], [p.x0 + 70, p.y1 - 4]]) { w.setSoles(x, y); w.idle(40); } }
    seamOk = seamOk && w.battles.length === b0 && V().n === 0;
    F.check(`${tag}: door shut; standing on the seams (within ${dbg.SEAM} px of a plate edge) lights nothing and costs nothing`, seamOk);
    // 3. a wrong plate: battle with the guardian, plates dark, back at the room door
    w.setSoles(...entry); to(...mid(key(R.path[0]))); const lit1 = V().n;
    const wrong = Object.keys(B.plates).find(k => k !== key(R.path[0]) && k !== key(R.path[1] || [-1, -1])
      && Math.abs(+k.split(',')[0] - R.path[0][0]) + Math.abs(+k.split(',')[1] - R.path[0][1]) === 1) || Object.keys(B.plates).find(k => R.path.findIndex(c => key(c) === k) !== 0 && key(R.path[1] || []) !== k);
    const b1 = w.battles.length; to(...mid(wrong), 600); w.idle(700);
    const s1 = w.soles();
    F.check(`${tag}: first plate lights; wrong plate ${wrong} (${R.glyphs[wrong]}) -> one '${w.battles[b1]}' battle, plates dark, she is back on the entry strip`,
      lit1 === 1 && w.battles.length === b1 + 1 && w.battles[b1] === 'mummy' && V().n === 0 && Math.hypot(s1[0] - entry[0], s1[1] - entry[1]) < 2 && doorShut(), { lit1, n: V().n, s1, entry });
    // 4. half way, then a reload from the flags (Save -> Continue), a lit plate is safe to walk back over
    const half = Math.max(1, Math.floor(R.path.length / 2));
    w.setSoles(...entry); w.idle(600); for (let i = 0; i < half; i++) to(...mid(key(R.path[i])));
    const nHalf = V().n; w.reload(); const b2 = w.battles.length;
    if (half > 1) to(...mid(key(R.path[half - 2]))), to(...mid(key(R.path[half - 1])));
    F.check(`${tag}: ${half} plate(s) lit survive a reload; walking back over lit plates is safe`, nHalf === half && V().n === half && w.battles.length === b2 && doorShut());
    // 5. the rest of the order: the door opens and stays open, every plate is safe afterwards
    for (let i = half; i < R.path.length; i++) to(...mid(key(R.path[i])));
    const solved = V().n === R.path.length && R.door.every(c => w.free(...C(c)));
    for (const k of Object.keys(B.plates)) { w.setSoles(...mid(k)); w.idle(40); }
    w.reload();
    F.check(`${tag}: the whole order lights every glyph, the door opens (stays open after reload), all plates are safe, ${w.battles.length - b2} battle(s) on the right path`,
      solved && w.battles.length === b2 && V().n === R.path.length && R.door.every(c => w.free(...C(c))) && w.msgs.some(m => /door grinds open/.test(m)));
  }
}
F.done('glyph-plates.unit');
