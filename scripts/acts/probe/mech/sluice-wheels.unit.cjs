'use strict';
// Rules of the sluice wheels against the Oasis Depths plans (no browser).
//   node scripts/acts/probe/mech/sluice-wheels.unit.cjs
// 1. the plans still give the planning page's own numbers (independent solver, sluice-wheels.solve.cjs);
// 2. on each floor the module, driven like a player in the fake engine, does exactly what the plan says:
//    flooded/dry at the start, every turn toggles exactly that wheel's channels, the solver's turn order
//    reaches the treasure and then the stairs (boss), a reload in the middle keeps everything;
// 3. guards: no turn floods her, the "too deep" line, the mimic, the re-entry reset (and no reset when
//    the state is consistent), EN/JA/kanji tables in step.
const F = require('./_fake.cjs'), SV = require('./sluice-wheels.solve.cjs');
const C = c => [(c[0] + .5) * 48, (c[1] + .5) * 48];
const ID = 'oasisDepths';
const seqDone = w => { for (let i = 0; i < 900 && (w.ctx.state.seq || w.ctx.state.mimicPending); i++) w.frame(null, 16); return !w.ctx.state.seq; };
const chanState = (w) => w.plan.mechanic.channels.map(c => !w.free(...C([(c.rect[0] + c.rect[2]) >> 1, (c.rect[1] + c.rect[3]) >> 1])));   // true = flooded (blocked)
const expect = (P, mask) => P.mechanic.channels.map(c => c.floodedAtStart !== !!((mask >> (c.wheel - 1)) & 1));
const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const mask = (w) => w.mod._debug.maskOf(w.ctx);

for (let f = 1; f <= 5; f++) {
  const r = SV.report(f), pg = SV.PAGE[f];
  F.check(`f${f}: the plan gives the page's numbers (stairs ${pg.stairs} turn(s), treasure ${pg.treasure}, ${pg.states} wheel states) and 0 soft-locks`,
    r.stairsTurns === pg.stairs && eq(r.treasureTurns, pg.treasure === null ? [] : [pg.treasure]) && r.states === pg.states && r.softLocks === 0, { r: { ...r, Md: undefined } });

  let w = F.world(ID, f, 'sluice-wheels'); const P = w.plan, Md = r.Md;
  w.setSoles(...C(Md.arrival)); w.idle(500);
  F.check(`f${f}: start state as planned (flooded: ${expect(P, 0).map((v, i) => v ? i : null).filter(v => v !== null).join(',') || 'none'}); wheels solid; no reset at the arrival`,
    eq(chanState(w), expect(P, 0)) && Md.wheels.every(q => !w.free(...C([q.x, q.y]))) && !w.ctx.state.didReset && w.ctx.state.reach === true);

  // play: the treasure first (if any), then the way on; reload (Save -> Continue) after the first turn
  const doTurns = (seq, tag) => { for (const t of seq) { const W = Md.wheels.find(q => q.id === t.wheel), before = mask(w);
      if (w.walkTo(...t.from) !== true) return F.check(`${tag}: walk to ${t.from} beside wheel ${t.wheel}`, false, { at: w.soles() });
      w.pushAt(W.x, W.y, 12); const v = w.tap(); const ok1 = v === 'Turn wheel' && seqDone(w);
      const m = mask(w);
      if (!F.check(`${tag}: wheel ${t.wheel} turned from ${t.from}: exactly its channels (${W.channels}) toggle`, ok1 && m === (before ^ (1 << (t.wheel - 1))) && eq(chanState(w), expect(P, m)), { v, before, m, st: chanState(w) })) return false;
      if (!w.didReload) { w.didReload = true; const s0 = w.soles(); w.reload(); w.idle(500);
        F.check(`f${f}: reload after the first turn (Save -> Continue): wheel flags, water and walk state kept, no reset`, mask(w) === m && eq(chanState(w), expect(P, m)) && !w.ctx.state.didReset && w.ctx.state.reach === true, { m, s0 }); } }
    return true; };
  for (const ch of Md.chests) {
    const s = w.soles(), from = [Math.floor(s[0] / 48), Math.floor(s[1] / 48)], p = SV.plan01(Md, from, mask(w), ch);
    if (!p) { F.check(`f${f}: chest ${ch} reachable`, false); continue; }
    if (doTurns(p.seq, `f${f} chest ${ch}`)) F.check(`f${f}: the chest at ${ch} reached after ${p.turns} turn(s)`, w.walkTo(...p.cell) === true);
  }
  { const s = w.soles(), from = [Math.floor(s[0] / 48), Math.floor(s[1] / 48)], p = SV.plan01(Md, from, mask(w), Md.goal);
    if (p && doTurns(p.seq, `f${f} way on`)) F.check(`f${f}: beside the ${f < 5 ? 'stairs down' : 'boss'} at ${Md.goal} after ${p.turns} more turn(s)`, w.walkTo(...p.cell) === true);
    else F.check(`f${f}: way on reachable`, false, { from, m: mask(w) }); }

  // the guard: a turn never floods the walkway under her (put her in the first dry channel, ask its wheel)
  w = F.world(ID, f, 'sluice-wheels'); const dry = P.mechanic.channels.find(c => !c.floodedAtStart);
  if (dry) { const W = w.ctx.state.wheels.find(q => q.id === dry.wheel), mid = [(dry.rect[0] + dry.rect[2]) >> 1, (dry.rect[1] + dry.rect[3]) >> 1];
    w.setSoles(...C(mid)); w.ctx.state.checked = true; w.idle(50); const m0 = mask(w); w.mod._turn(w.ctx, W); w.idle(50);
    F.check(`f${f}: standing in dry channel ${dry.id}, its wheel will not turn ("${w.msgs.slice(-1)[0]}")`, mask(w) === m0 && /Climb out/.test(w.msgs.slice(-1)[0] || '')); }
  // "too deep": leaning into flooded water says so, once
  const wet = P.mechanic.channels.find(c => c.floodedAtStart);
  if (wet) { w = F.world(ID, f, 'sluice-wheels'); w.ctx.state.checked = true; const M = w.mod._debug.M;
    const horiz = wet.rect[0] > 0 && P.rows[wet.rect[1]][wet.rect[0] - 1] !== '#';
    const bank = horiz ? [wet.rect[0] - 1, (wet.rect[1] + wet.rect[3]) >> 1] : [(wet.rect[0] + wet.rect[2]) >> 1, wet.rect[1] - 1];
    const ok0 = true; w.setSoles(...C(bank));
    for (let i = 0; i < 160; i++) w.frame(horiz ? { x: 1, y: 0, m: 1 } : { x: 0, y: 1, m: 1 });
    const s = w.soles(), edge = horiz ? wet.rect[0] * 48 - s[0] : wet.rect[1] * 48 - s[1];
    F.check(`f${f}: she stops ${edge.toFixed(1)} px short of flooded channel ${wet.id} and is told it is too deep`, ok0 && edge >= M - 0.01 && edge < M + 6 && w.msgs.filter(m => /too deep/.test(m)).length === 1, { edge, msgs: w.msgs }); }
}
// the mimics: the line, one Mimic battle, the flag; afterwards an open, empty chest she can walk over
for (const f of [2, 3]) {
  const w = F.world(ID, f, 'sluice-wheels'), mi = w.plan.assets.find(a => a.kind === 'mimic'); w.setSoles(...C(f === 3 ? [18, 4] : SV.model(w.plan).arrival)); w.idle(500);   // floor 3's mimic stands in the middle room
  const solid = !w.free(...C([mi.x, mi.y]));
  const v = w.use(mi.x, mi.y); seqDone(w); w.idle(400);
  F.check(`f${f}: the mimic at ${mi.x},${mi.y} is solid; leaning on it / "Open" (${v === null ? 'sprung by the bump' : v}) springs it: treasure.mimic, one 'mimic' battle, flag d2.${ID}.f${f}.mimic.${mi.x}.${mi.y}`,
    solid && (v === 'Open' || v === null) && w.msgs.includes('treasure.mimic') && w.battles.length === 1 && w.battles[0] === 'mimic' && w.flags[`d2.${ID}.f${f}.mimic.${mi.x}.${mi.y}`] === true && w.free(...C([mi.x, mi.y])), { v, msgs: w.msgs, battles: w.battles });
  w.reload(); w.idle(100); F.check(`f${f}: after a reload the mimic stays sprung (no prompt, no battle)`, w.ctx.state.mimics[0].sprung && w.battles.length === 1);
}
// re-entry: floor 2 left with the island's wheel turned (a lost battle), entered again by the stairs above
{ const Md = SV.model(SV.plan(2));
  let w = F.world(ID, 2, 'sluice-wheels', { flags: { [`d2.${ID}.f2.wheel1`]: true } }); w.setSoles(...C(Md.arrival)); w.idle(3000);
  F.check('f2 re-entry with the wheel turned, on the start bank (stranded): the wheels go back to the start, a line says so, the way on opens',
    w.ctx.state.didReset === true && !w.flags[`d2.${ID}.f2.wheel1`] && w.msgs.some(m => /sluice gates clank/.test(m)) && eq(chanState(w), expect(w.plan, 0)) && !!SV.plan01(Md, Md.arrival, 0, Md.goal));
  w = F.world(ID, 2, 'sluice-wheels', { flags: { [`d2.${ID}.f2.wheel1`]: true } }); w.setSoles(...C([32, 5])); w.idle(1500);
  F.check('f2 arrival from below with the wheel turned (consistent): nothing is reset', !w.ctx.state.didReset && w.flags[`d2.${ID}.f2.wheel1`] === true && w.ctx.state.reach === true); }
// tables
{ const w = F.world(ID, 1, 'sluice-wheels'), T = w.mod._debug.STR, ks = Object.keys(T.en);
  F.check('strings: en / ja / jaKanji carry the same keys, none empty', ['ja', 'jaKanji'].every(l => eq(Object.keys(T[l]).sort(), ks.slice().sort()) && ks.every(k => T[l][k])), ks); }
F.done('sluice-wheels.unit');
