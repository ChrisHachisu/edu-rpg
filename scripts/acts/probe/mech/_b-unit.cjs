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

// ---- RUN ----
const want = process.argv.slice(2), names = want.length ? want : Object.keys(T);
for (const n of names) { const f0 = fail, p0 = pass; try { T[n](); } catch (e) { fail++; console.log(`[FAIL] ${n}: threw ${e && e.stack || e}`); }
  console.log(`${n}: ${pass - p0} pass, ${fail - f0} fail`); }
console.log(`_b-unit: ${pass} checks passed, ${fail} FAIL`);
process.exit(fail ? 1 : 0);
module.exports = { T, ok };
