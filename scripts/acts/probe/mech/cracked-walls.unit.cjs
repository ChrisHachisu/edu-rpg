'use strict';
// Rules of the cracked walls against the Scorched Ruins plans (no browser).
//   node scripts/acts/probe/mech/cracked-walls.unit.cjs
const fs = require('fs'), F = require('./_fake.cjs');
const floors = fs.readdirSync(F.PLANS).filter(n => /^scorchedRuins-f\d+\.json$/.test(n)).map(n => +n.match(/f(\d+)/)[1]).sort((a, b) => a - b);
const C = (c) => [(c[0] + .5) * 48, (c[1] + .5) * 48];
for (const f of floors) {
  const mk = (o) => F.world('scorchedRuins', f, 'cracked-walls', o);
  let w = mk(); const secrets = w.plan.mechanic.secrets || [], key = n => `d2.scorchedRuins.f${f}.${n}`;
  const lean = (W, d, ms) => { for (let t = 0; t < ms; t += 16) W.frame({ x: d[0], y: d[1], m: 1 }, 16); };
  for (const S of secrets) {
    const mid = S.crack[1], d = [Math.sign(mid[0] - S.front[0]), Math.sign(mid[1] - S.front[1])], behind = [mid[0] + d[0], mid[1] + d[1]], tag = `f${f} secret ${S.id}${S.needs ? ' (needs ' + S.needs + ')' : ''}`;
    const boss = S.needs === 'boss defeated';
    if (boss) { w = mk(); w.setSoles(...C(S.front)); lean(w, d, 1500);
      F.check(`${tag}: with the boss alive the crack does not give (one line says so)`, !w.flags[key(`secret${S.id}.open`)] && S.crack.every(c => !w.free(...C(c))) && w.msgs.length === 1 && /will not give/.test(w.msgs[0]), w.msgs);
      w = mk({ bossDown: true }); }
    // 1. the wall is shut; leaning on the wall beside the cracked stretch does nothing
    const shut = S.crack.every(c => !w.free(...C(c)));
    const off = [S.front[0] + (d[0] ? 0 : 3), S.front[1] + (d[1] ? 0 : 3)]; let beside = 'n/a';
    if (w.free(...C(off))) { w.setSoles(...C(off)); lean(w, d, 900); beside = !w.flags[key(`secret${S.id}.open`)]; }
    // 2. walking into the crack opens it after a short lean, and she can walk through
    w.setSoles(...C(S.front)); let ms = 0; while (!w.flags[key(`secret${S.id}.open`)] && ms < 3000) { w.frame({ x: d[0], y: d[1], m: 1 }, 16); ms += 16; }
    const opened = w.flags[key(`secret${S.id}.open`)] === true, said = w.msgs.some(m => /hidden room/.test(m));
    lean(w, d, 1200); const [sx, sy] = w.soles(), through = Math.floor(sx / 48) === behind[0] + d[0] * 0 && Math.floor(sy / 48) === behind[1] || (d[0] ? (sx - C(mid)[0]) * d[0] > 30 : (sy - C(mid)[1]) * d[1] > 30);
    w.reload(); const stays = S.crack.every(c => w.free(...C(c))) && w.ctx.state.secrets.find(s => s.id === S.id).open;
    F.check(`${tag}: shut at first; the wall beside it holds (${beside}); leaning on the crack opens it after ${ms} ms; she walks through; it stays open after a reload`,
      shut && beside !== false && opened && said && through && stays && ms >= 200 && ms <= 900, { shut, beside, opened, said, through, stays, ms, soles: [sx | 0, sy | 0] });
  }
  // hints: one per secret, on the floor, with a prompt when she stands on it
  const hints = w.plan.assets.filter(a => a.kind === 'hint'); let okH = hints.length === secrets.length; const hl = [];
  for (const h of hints) { w.setSoles(...C([h.x, h.y])); w.idle(50); const m0 = w.msgs.length, v = w.tap(); hl.push([h.type, v, (w.msgs[m0] || '').slice(0, 40)]);
    if (v !== (h.type === 'sign' ? 'Read' : 'Look') || !w.msgs[m0] || /^ruins\./.test(w.msgs[m0])) okH = false; }
  F.check(`f${f}: ${hints.length} floor hint(s), each with its own line`, okH, hl);
}
F.done('cracked-walls.unit');
