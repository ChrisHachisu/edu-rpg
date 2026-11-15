'use strict';
// Unit tests of the MECH-B mechanic modules against every floor's plan JSON (no browser).
//   node scripts/acts/probe/mech/_b-unit.cjs [mechanic-id ...]      exit 1 on any FAIL
const fs = require('fs'), path = require('path');
const U = require('./_b-unit-lib.cjs');
let pass = 0, fail = 0;
const ok = (name, cond, note) => { if (cond) pass++; else { fail++; console.log(`[FAIL] ${name}${note !== undefined ? ' -- ' + (typeof note === 'string' ? note : JSON.stringify(note)).slice(0, 500) : ''}`); } return !!cond; };
const T = {};

// ---- kit: the string table --------------------------------------------------------------------
T['kit'] = () => {
  const H = U.load('crust-bridges'), S = H.kit.STR;
  const kanji = /[一-鿿]/, kana = /[぀-ヿ]/;
  for (const k in S) {
    const r = S[k];
    ok(`string ${k}: en, ja, jaKanji all present`, !!(r.en && r.ja && r.jaKanji), r);
    ok(`string ${k}: ja is kana only`, !kanji.test(r.ja), r.ja);
    ok(`string ${k}: en has no kana`, !kana.test(r.en) && !kanji.test(r.en));
    const vars = s => (s.match(/\{\w+\}/g) || []).sort().join();
    ok(`string ${k}: same placeholders in all three`, vars(r.en) === vars(r.ja) && vars(r.en) === vars(r.jaKanji));
    ok(`string ${k}: same number of lines in ja and jaKanji`, r.ja.split('\n').length === r.jaKanji.split('\n').length);
  }
  H.state.locale = 'ja'; ok('text(): kana by default in Japanese', H.kit.text('d2.forge.verb.turn') === 'まわす');
  H.state.kanjiMode = true; ok('text(): kanji in kanji mode', H.kit.text('d2.forge.verb.turn') === '回す');
  H.state.locale = 'en'; ok('text(): placeholder filled', H.kit.text('d2.hp.lost', { n: 7 }) === '-7 HP');
  const c = H.ctxFor('magmaTunnels-f1'); H.kit.quiet(H.scene);
  ok('quiet(): the bundle hunter, portals and wind are off', !H.scene.mazeHunterEnabled && !H.scene.shadowPortalEnabled && !H.scene.windTowerEnabled && H.scene.portalPairs.length === 0);
  H.state.hp = 100; const d = H.kit.hurt(c, 0.1); ok('hurt(): a tenth of full HP', d === 10 && H.state.hp === 90);
  H.state.hp = 3; H.kit.hurt(c, 0.1); ok('hurt(): never below 1 HP', H.state.hp === 1);
  let t = H.kit.clock(c, 0, 32, 185); ok('clock starts at 0', t === 0);
  for (let i = 0; i < 100; i++) t = H.kit.clock(c, 37, 32, 185);
  ok('clock advances in plan ticks', Math.abs(t - 20) < 0.01, t);
  const c2 = H.ctxFor('magmaTunnels-f1'); ok('clock phase survives a new visit (flag)', Math.abs(H.kit.clock(c2, 0, 32, 185) - 20) < 0.01);
};

// ---- crust-bridges ------------------------------------------------------------------------------
T['crust-bridges'] = () => {
  for (const fid of U.floorsOf('magmaTunnels')) {
    const H = U.load('crust-bridges'), c = H.ctxFor(fid), M = H.mod, P = c.mechanic.params, bs = c.mechanic.bridges;
    M.load(c); const L = M.logic.layout(c);
    ok(`${fid}: every bridge laid out`, L.length === bs.length && L.length > 0);
    for (const l of L) {
      const b = l.b; let crust = 0, warn = 0, molten = 0;
      for (let t = 0; t < b.period; t++) { const p = M.logic.phaseOf(b, t); if (p === 'crust') crust++; else if (p === 'warn') warn++; else molten++;
        if ((p === 'molten') !== (((t - b.phase) % b.period + b.period) % b.period >= b.crust)) fail++; }
      ok(`${fid} bridge ${b.id}: crust/warn/molten ticks as planned`, crust + warn === b.crust && warn === b.warn && molten === b.period - b.crust, { crust, warn, molten });
      ok(`${fid} bridge ${b.id}: both banks are floor`, l.ends.every(e => U.WALK.includes(c.terrain(Math.floor(e[0] / 48), Math.floor(e[1] / 48)))), l.ends);
      // walk the middle line bank to bank at every tick: open exactly while not molten
      const mid = b.cells[Math.floor(b.cells.length / 2)];
      for (let t = 0; t < b.period; t++) {
        c.state.clk = t * c.state.ms + 1; H.standCell(c, mid[0] + 40, mid[1] + 40); M.tick(c, 0);
        const fr = M.free(c, mid[0] * 48 + 24, mid[1] * 48 + 24, mid[0], mid[1]), want = M.logic.phaseOf(b, t) !== 'molten';
        if (fr !== want) { ok(`${fid} bridge ${b.id}: free() follows the beat at tick ${t}`, false, { fr, want }); break; }
      }
      // the rim of the strip is never open; the bank reach is open only while crusted
      const side = l.horiz ? [l.px[0] + 24, l.px[1] + 3] : [l.px[0] + 3, l.px[1] + 24];
      c.state.clk = (b.phase % b.period) * c.state.ms + 1; M.tick(c, 0);
      ok(`${fid} bridge ${b.id}: rim closed while crusted`, M.free(c, side[0], side[1]) === false);
      const reach = l.horiz ? [l.px[0] - 10, (l.px[1] + l.px[3]) / 2] : [(l.px[0] + l.px[2]) / 2, l.px[1] - 10];
      ok(`${fid} bridge ${b.id}: bank reach open while crusted`, M.free(c, reach[0], reach[1]) === true);
      c.state.clk = ((b.phase + b.crust) % b.period) * c.state.ms + 1; M.tick(c, 0);
      ok(`${fid} bridge ${b.id}: bank reach left to the mask while molten`, M.free(c, reach[0], reach[1]) === undefined);
    }
    // caught: stand on the bank, walk on while crusted, stay until it melts
    const l = L[0], b = l.b, bank = l.ends[0], mid = [(l.px[0] + l.px[2]) / 2, (l.px[1] + l.px[3]) / 2];
    c.state.clk = (b.phase % b.period) * c.state.ms + 1; H.stand(c, bank[0], bank[1]); M.tick(c, 0);
    H.stand(c, mid[0], mid[1]); M.tick(c, 0); const hp0 = H.state.hp;
    ok(`${fid}: standing on crust costs nothing`, H.state.hp === hp0 && H.said.length === 0);
    ok(`${fid}: no encounter roll on a crossing`, M.step(c, 0, 0, 0, 0) === false);
    c.state.clk = ((b.phase + b.crust) % b.period) * c.state.ms + 1; M.tick(c, 0);
    const s = H.kit.soles(c);
    ok(`${fid}: caught when it melts -> small damage and back on the bank she came from`, H.state.hp === hp0 - 10 && Math.abs(s.x - bank[0]) < 1 && Math.abs(s.y - bank[1]) < 1 && H.said.length === 1, { hp: H.state.hp, s, bank });
    H.stand(c, mid[0], mid[1]); M.tick(c, 0);
    ok(`${fid}: second burn is a float text, not another message box`, H.said.length === 1 && H.state.hp === hp0 - 20);
    ok(`${fid}: clock phase is in the flags`, typeof H.state.storyFlags[c.flagKey('clk')] === 'number');
  }
};


// ---- lava-channels ------------------------------------------------------------------------------
T['lava-channels'] = () => {
  let mirrored = 0, hallsN = 0;
  for (const fid of U.floorsOf('volcanicForge')) {
    const H = U.load('lava-channels'), c = H.ctxFor(fid), M = H.mod, Lg = M.logic;
    M.load(c); const S = c.state, md = S.M;
    ok(`${fid}: every plan hall modelled`, md.order.length === c.mechanic.halls.length && md.order.length > 0);
    for (const hp of c.mechanic.halls) {
      const h = md.halls[hp.hall]; hallsN++;
      ok(`${fid} ${hp.hall}: tiles, turntables, molds, lever and furnace as planned`, h.list.length === hp.tiles.length && h.turn.length === hp.turntables && h.molds.length === hp.molds.length && !!h.lever && !!h.furnace && !!h.source, { tiles: h.list.length, turn: h.turn.length });
      ok(`${fid} ${hp.hall}: the lever stands on floor, the furnace in the wall above the first trough`, c.terrain(h.lever.x, h.lever.y) === '.' && c.terrain(h.furnace.x, h.furnace.y) === '#' && h.source.y === h.furnace.y + 1);
      const f0 = Lg.flow(h);
      ok(`${fid} ${hp.hall}: as found, the iron does not reach the exit mold`, !f0.molds.some(m => m.mold.id === 'exit'));
      const mask = l => l.reduce((a, d) => a | (1 << 'NESW'.indexOf(d)), 0);
      // the plan's solved rotation: turnsClockwise in the hall's own frame (a mirrored hall turns the other way round on screen)
      const need = [t => t.asset.turnsClockwise, t => (4 - t.asset.turnsClockwise) % 4].map(fn => h.turn.every(t => { const r = t.rot; t.rot = fn(t); const k = Lg.openOf(t) === mask(t.asset.solvedOpen); t.rot = r; return k; }));
      ok(`${fid} ${hp.hall}: the plan's solved openings are reachable by clockwise taps`, need[0] || need[1], h.turn.map(t => [t.asset.open, t.asset.solvedOpen, t.asset.turnsClockwise]));
      if (!need[0]) mirrored++;
      const ex = Lg.solve(h, ['exit']), ids = h.molds.map(m => m.id), all = Lg.solve(h, ids);
      ok(`${fid} ${hp.hall}: exit mold solvable, every mold solvable`, !!ex && !!all && ex.taps >= 1, { ex, all });
      if (need[0]) ok(`${fid} ${hp.hall}: fewest taps equal the plan's turnsToExit`, ex.taps === hp.turnsToExit, { mine: ex.taps, plan: hp.turnsToExit });
      // play it: walk onto each turntable of the plan, tap Turn, then the lever
      const mold = h.molds.find(m => m.id === 'exit'), zc = [(mold.zone[0] + mold.zone[2]) / 2, (mold.zone[1] + mold.zone[3]) / 2];
      ok(`${fid} ${hp.hall}: the mold is not walkable before the pour`, M.free(c, zc[0], zc[1]) === undefined);
      H.stand(c, h.lever.x * 48 + 24 + 40, h.lever.y * 48 + 24);
      let it = M.interact(c, H.hero.x, H.hero.y + 31, null);
      ok(`${fid} ${hp.hall}: beside the lever the pill says Pull`, !!it && it.verb === 'Pull', it && it.verb);
      it.act(); for (let i = 0; i < 400; i++) M.tick(c, 16);
      ok(`${fid} ${hp.hall}: a pour before the turntables are set leaves the exit mold empty: no bridge, no flag, no penalty`, !mold.cast && !H.state.storyFlags[c.flagKey('mold.' + h.id + '.exit')] && c.state.anim === null && H.state.hp === 100);
      ok(`${fid} ${hp.hall}: ... and says so (pooled, or the treasure mold it did reach)`, (f0.molds.length ? /bridge/ : /pools/).test(H.said[H.said.length - 1]), H.said.slice(-1));
      for (const st of all.plan) { const t = h.turn[st.i];
        H.stand(c, (t.x + 1) * 48, (t.y + 1) * 48);
        for (let k = 0; k < st.taps; k++) { it = M.interact(c, H.hero.x, H.hero.y + 31, null); if (!it || it.verb !== 'Turn') { ok(`${fid} ${hp.hall}: on a turntable the pill says Turn`, false, it); break; } it.act(); H.flushTweens(); } }
      ok(`${fid} ${hp.hall}: lever is solid`, M.free(c, h.lever.x * 48 + 24, h.lever.y * 48 + 24) === false);
      H.stand(c, h.lever.x * 48 + 24, h.lever.y * 48 + 24 + 44); it = M.interact(c, H.hero.x, H.hero.y + 31, null); it.act();
      ok(`${fid} ${hp.hall}: no turning during a pour`, M.interact(c, H.hero.x, H.hero.y + 31, null) === undefined);
      for (let i = 0; i < 400; i++) M.tick(c, 16);
      ok(`${fid} ${hp.hall}: joined troughs fill every mold: bridges cast, flags set, walkable`, h.molds.every(m => m.cast && H.state.storyFlags[c.flagKey('mold.' + h.id + '.' + m.id)] === true) && M.free(c, zc[0], zc[1]) === true && /bridge/.test(H.said[H.said.length - 1]), H.said);
      ok(`${fid} ${hp.hall}: the bridge's rim stays closed to the mask`, M.free(c, mold.horiz ? zc[0] : mold.px[0] + 3, mold.horiz ? mold.px[1] + 3 : zc[1]) === undefined);
    }
    // Save -> Continue: a new visit reads rotations and bridges back from the flags
    const c2 = H.ctxFor(fid); M.load(c2);
    ok(`${fid}: rotations and bridges survive a new visit`, c2.state.M.order.every(k => { const a = c2.state.M.halls[k], b = md.halls[k]; return a.turn.every((t, i) => t.rot === b.turn[i].rot) && a.molds.every(m => m.cast); }));
    const anyHall = c2.state.M.halls[c2.state.M.order[0]];
    H.stand(c2, anyHall.lever.x * 48 + 24 + 40, anyHall.lever.y * 48 + 24); M.interact(c2, H.hero.x, H.hero.y + 31, null).act(); for (let i = 0; i < 400; i++) M.tick(c2, 16);
    ok(`${fid}: pouring again into cast bridges changes nothing`, /already/.test(H.said[H.said.length - 1]));
  }
  console.log(`  lava-channels: ${hallsN} halls, ${mirrored} mirrored (clockwise on screen = the plan's counter-clockwise)`);
};

// ---- RUN ----
const want = process.argv.slice(2), names = want.length ? want : Object.keys(T);
for (const n of names) { const f0 = fail, p0 = pass; try { T[n](); } catch (e) { fail++; console.log(`[FAIL] ${n}: threw ${e && e.stack || e}`); }
  console.log(`${n}: ${pass - p0} pass, ${fail - f0} fail`); }
console.log(`_b-unit: ${pass} checks passed, ${fail} FAIL`);
process.exit(fail ? 1 : 0);
module.exports = { T, ok };
