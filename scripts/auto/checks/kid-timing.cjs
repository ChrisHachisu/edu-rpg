'use strict';
// Kid timing (day-2 pass, 2026-11-24; owner P9 "built for small hands and young readers", P6 "the
// world gives the cue"). For quiz grades K-2 the warning before a Stormreach Spire strike (the stone
// glow) and a Storm Nest gust (window glow + walkway pulse + slow wisps) lasts about 1.5 s, twice a
// grade-1 reaction; grades 3+ keep the plan's numbers; localStorage 'qok-kid-timing' = '0' restores
// the plan's timing for every grade. Fix: public/acts-dungeons/modules/{storm-terrace,gust-walkways}.js
// (shared helper window.__QOK_KIDTIME__).
// Day 3 (grades 3-4: warning >= 1.0 s and a 1.6 s calm stretch; grades 5-6: a 0.6 s calm stretch on the Spire, the plan elsewhere).
// For Stormreach Spire 1F and Storm Nest 5F, a save seeded on the floor (grade 1, grade 3, grade 1
// with the switch off), Continue, then:
//   * the live module state's warning length (ticks x tick ms) is >= 1.4 s at grade 1 and equals the
//     plan's value at grade 3 and with the switch off;
//   * the warning as drawn, timed in game time (the module's own clock, which stops while a box is
//     up): from the first frame the cue shows to the strike / gust, it lasts the whole warning
//     (within one frame plus 60 ms).
//   NODE_PATH=/opt/node-tools/node_modules PROBE_URL=http://127.0.0.1:5521/ node scripts/auto/checks/kid-timing.cjs
const fs = require('fs'), path = require('path');
const F = require('./field-lib.cjs');
const PLANS = path.join(F.ROOT, 'scripts/auto/feel/data/plans');
const plan = (id, n) => JSON.parse(fs.readFileSync(path.join(PLANS, `${id}-f${n}.json`), 'utf8'));
const L = F.L;

async function seed(page, id, n, grade, kidOff) {
  const fl = F.floorOf(id, n), xy = F.midCell(fl, F.landing(fl));
  const s = L.save({ mapId: id, floor: n, x: xy[0], y: xy[1], flags: { ...L.allFlags(), ...F.ALLB }, inventory: F.INV, completedQuests: F.QUESTS });
  s.player.name = 'Mika'; s.player.quizDifficulty = grade;
  await page.goto(F.URL_, { waitUntil: 'domcontentloaded' });
  await page.evaluate(([s, off]) => { localStorage.clear(); localStorage.setItem('edu-rpg-save', JSON.stringify(s)); if (off) localStorage.setItem('qok-kid-timing', off === true ? '0' : off); }, [s, kidOff]);   // true = '0' (the plan); a string = that switch value (day 4)
  await page.reload({ waitUntil: 'load' });
  await L.toTitle(page);
  await page.evaluate(() => { const t = window.__PHASER_GAME__.scene.getScene('TitleScene'); const i = t.menuItems.findIndex(m => m.getData && m.getData('action') === 'continue'); t.selectedIndex = i; t.confirmTitle(); });
  await page.waitForFunction(() => { const g = window.__PHASER_GAME__, w = g.scene.getScene('WorldMapScene'); return w && g.scene.isActive('WorldMapScene') && w.hero && w.mapData; }, { timeout: 90000 });
  await page.evaluate(() => { try { window.__GAME_STATE__.encounterManager.onStep = () => null; } catch (e) {} });
  const ready = await page.waitForFunction(() => { const d = window.__QOK_DNG2__, s = d && d.state && d.state(); const c = d && d.ctx && d.ctx(); return s && s.module && c && c.state && (c.state.spr || c.state.lanes || c.state.L || c.state.P); }, { timeout: 60000, polling: 100 }).then(() => true).catch(() => false);
  await F.dismiss(page);
  return { pos: await L.pos(page), ready };
}

// Day 4: the floor she stands on, read again for another grade or switch value without a new save: the module's own
// unload, its pictures destroyed, a fresh state, its own load (what the engine does on a floor change).
function reloadAs(page, grade, sw) {
  return page.evaluate(([grade, sw]) => { const c = window.__QOK_DNG2__.ctx();
    window.__GAME_STATE__.player.state.quizDifficulty = grade; if (sw === null) localStorage.removeItem('qok-kid-timing'); else localStorage.setItem('qok-kid-timing', sw);
    try { if (c.mod.unload) c.mod.unload(c); } catch (e) {}
    for (const o of c._owned.splice(0)) { try { o.destroy(); } catch (e) {} }
    const old = c.state; for (const k of Object.keys(old)) delete old[k];
    try { if (c.mod.load) c.mod.load(c); } catch (e) { return String(e); } return true; }, [grade, sw]);
}

// the module's warning: from state, then as drawn over one full warning, timed on the module clock
function measure(page, kind) {
  return page.evaluate(kind => new Promise(res => {
    const c = window.__QOK_DNG2__.ctx(), S = c.state, sc = c.scene, out = { grade: window.__GAME_STATE__.player.state.quizDifficulty };
    if (kind === 'storm') { const M = S.M; out.stateMs = Math.round(M.glow * S.ms); out.kid = !!M.kid; out.periodMs = Math.round(M.period * S.ms); out.ms = S.ms; out.calmMs = Math.round((M.gap - M.glow - M.strike) * S.ms); }
    else { const Ls = S.lanes; out.stateMs = Math.round(Math.min(...Ls.map(L => L.warn)) * 185); out.kid = !!S.kid; out.periodMs = Math.round(Ls[0].period * 185); out.gustShare = Math.max(...Ls.map(L => L.active / L.period)); }
    let prevClock = null, seenCalm = {}, start = {}, frames = 0, maxStep = 0; const t0 = Date.now();
    const clock = () => kind === 'storm' ? S.tick * S.ms : S.t;
    const per = () => kind === 'storm' ? S.M.period * S.ms : Infinity;
    function step() {
      frames++;
      const now = clock(); let d = prevClock === null ? 0 : now - prevClock; if (d < 0) d += per(); prevClock = now; if (d > maxStep) maxStep = d;
      const units = kind === 'storm' ? S.M.cells.map((_, g) => ({ id: g, cue: S.spr.glow[g].alpha > 0.06, hit: S.spr.hit[g].alpha > 0 }))
        : S.lanes.map(L => ({ id: L.id, cue: L.state === 'warn' && (!L.win || L.win.glow.fillAlpha > 0.05), hit: L.state === 'gust' }));
      for (const u of units) {
        if (start[u.id] !== undefined) start[u.id] += d;
        if (!u.cue && !u.hit) seenCalm[u.id] = true;
        if (u.cue && seenCalm[u.id] && start[u.id] === undefined) start[u.id] = 0;
        if (u.hit && start[u.id] !== undefined) { out.drawnMs = Math.round(start[u.id]); out.unit = u.id; out.maxStepMs = Math.round(maxStep); return finish(); }
        if (u.hit) delete start[u.id];
      }
      if (Date.now() - t0 > 25000) { out.timeout = true; return finish(); }
    }
    function finish() { sc.events.off('postupdate', step); res(out); }
    sc.events.on('postupdate', step);
  }), kind);
}

(async () => {
  const { browser, page } = await L.launch({ dpr: 1 });
  const floors = [
    { id: 'stormreachSpire', n: 1, kind: 'storm', name: 'Stormreach Spire 1F', planMs: p => { const m = p.mechanic.params; return m.glowTicks * Math.max(120, Math.min(260, m.periodSec * 1000 / m.periodTicks)); } },
    { id: 'stormNest', n: 5, kind: 'gust', name: 'Storm Nest 5F', planMs: p => Math.min(...p.zones.filter(z => z.kind === 'gustLane').map(z => z.warn)) * 185 },
  ];
  try {
    for (const fl of floors) {
      const planMs = Math.round(fl.planMs(plan(fl.id, fl.n)));
      const planCalm = fl.kind === 'storm' ? (() => { const m = plan(fl.id, fl.n).mechanic.params; return Math.round((Math.round(m.periodTicks / (m.groups || m.strikeGroups || 1)) - m.glowTicks - (m.strikeTicks || 2)) * Math.max(120, Math.min(260, m.periodSec * 1000 / m.periodTicks))); })() : null;
      for (const [grade, off, label] of [['1', false, 'grade 1'], ['3', false, 'grade 3'], ['6', false, 'grade 6'], ['3', true, "grade 3, qok-kid-timing='0'"], ['1', true, "grade 1, qok-kid-timing='0'"]]) {
        const s = await seed(page, fl.id, fl.n, grade, off);
        if (!F.ok(s.pos.map === fl.id && s.pos.floor === fl.n && s.ready, `${fl.name} reached (${label})`, `at ${s.pos.map} ${s.pos.floor}F`)) continue;
        const r = await measure(page, fl.kind);
        F.info(`${fl.name} ${label}`, JSON.stringify(r) + ` plan ${planMs} ms`);
        const tol = (r.maxStepMs || 17) + 60;
        if (!off && grade === '1') F.ok(r.stateMs >= 1400, `${fl.name} grade 1: warning >= 1.4 s in game time`, `${r.stateMs} ms (plan ${planMs} ms)`);
        else if (!off && grade === '3') F.ok(r.stateMs >= (fl.kind === 'gust' ? 900 : 950), `${fl.name} grade 3: warning >= ${fl.kind === 'gust' ? 0.9 : 0.95} s in game time (about twice a 0.5 s reaction)`, `${r.stateMs} ms (plan ${planMs} ms)`);
        else F.ok(Math.abs(r.stateMs - planMs) <= 1, `${fl.name} ${label}: warning equals the plan`, `${r.stateMs} ms vs plan ${planMs} ms`);
        // the calm stretch after a strike (Stormreach) and the share of the cycle a lane blows (Storm Nest)
        if (fl.kind === 'storm' && !off) {
          const need = grade === '1' ? 900 : grade === '3' ? 1500 : 550;
          F.ok(r.calmMs >= need, `${fl.name} ${label}: calm stretch after a strike >= ${need} ms`, `${r.calmMs} ms (plan ${planCalm} ms)`);
        }
        if (fl.kind === 'gust' && !off && (grade === '1' || grade === '3')) F.ok(r.gustShare <= (grade === "1" ? 1 / 6 : 1 / 5) + 0.005, `${fl.name} ${label}: a lane blows for at most 1/${grade === "1" ? 6 : 5} of its cycle`, `${(r.gustShare * 100).toFixed(1)}%`);
        if (fl.kind === 'gust' && grade === '6' && !off) F.ok(Math.abs(r.periodMs - Math.round(plan(fl.id, fl.n).zones.find(z => z.kind === 'gustLane').period * 185)) <= 1, `${fl.name} grade 6: cycle equals the plan`, `${r.periodMs} ms`);
        F.ok(!r.timeout && Math.abs(r.drawnMs - r.stateMs) <= tol, `${fl.name} ${label}: the cue is drawn for the whole warning`, `drawn ${r.drawnMs} ms vs ${r.stateMs} ms (tolerance ${tol} ms)`);
      }
    }
  } catch (e) { F.ok(false, 'kid-timing check ran', String(e).slice(0, 200)); }
  // Magma Tunnels (crust bridges: the cracks' glow before the crust melts)
  try {
    for (const fl of [{ id: 'magmaTunnels', n: 5, name: 'Magma Tunnels 5F', kind: 'magma' }, ]  /* Shadow Cave 3F flicker tried and dropped: no gain, see day-3 report */) {
      const p = plan(fl.id, fl.n);
      for (const [grade, off, label] of [['1', false, 'grade 1'], ['3', false, 'grade 3'], ['6', false, 'grade 6'], ['1', true, "grade 1, qok-kid-timing='0'"]]) {
        const s = await seed(page, fl.id, fl.n, grade, off);
        if (!F.ok(s.pos.map === fl.id && s.pos.floor === fl.n && s.ready, `${fl.name} reached (${label})`, `at ${s.pos.map} ${s.pos.floor}F`)) continue;
        await page.waitForTimeout(800);
        const r = await page.evaluate(kind => { const S = window.__QOK_DNG2__.ctx().state;
          return kind === 'magma' ? { warnMs: Math.round(Math.min(...S.L.map(L => L.b.warn)) * S.ms), crustMs: Math.round(Math.min(...S.L.map(L => L.b.crust)) * S.ms), moltenTicks: Math.min(...S.L.map(L => L.b.period - L.b.crust)), ms: S.ms } : { warnMs: S.fm }; }, fl.kind);
        const planMs = fl.kind === 'magma' ? Math.round(p.mechanic.params.warnTicks * r.ms) : 1000;
        F.info(`${fl.name} ${label}`, JSON.stringify(r) + ` plan ${planMs} ms`);
        if (!off && grade === '1') F.ok(r.warnMs >= 1400, `${fl.name} grade 1: warning >= 1.4 s`, `${r.warnMs} ms (plan ${planMs} ms)`);
        else if (!off && grade === '3') F.ok(r.warnMs >= 950, `${fl.name} grade 3: warning >= 0.95 s`, `${r.warnMs} ms (plan ${planMs} ms)`);
        else F.ok(Math.abs(r.warnMs - planMs) <= 1, `${fl.name} ${label}: warning equals the plan`, `${r.warnMs} ms vs plan ${planMs} ms`);
        if (fl.kind === 'magma') F.ok(r.moltenTicks === p.mechanic.params.periodTicks - p.mechanic.params.crustTicks, `${fl.name} ${label}: the molten stretch equals the plan's`, `${r.moltenTicks} ticks`);
      }
    }
  } catch (e) { F.ok(false, 'kid-timing magma/shadow checks ran', String(e).slice(0, 200)); }
  // ---- Day 4 (track KT, 2026-11-27) -------------------------------------------------------------------------------
  // (1) Every module that carries the helper carries the same one (whichever loads first defines it), read from the build.
  try {
    const srcs = await page.evaluate(async () => { const m = await (await fetch('acts-dungeons/manifest.json')).json(), out = {};
      for (const u of m.modules || []) { const t = await (await fetch(u)).text(), i = t.indexOf('window.__QOK_KIDTIME__ = {'); if (i < 0) continue; const j = t.indexOf('\n  });', i); out[u.split('/').pop()] = t.slice(i, j).replace(/\r/g, ''); }
      return out; });
    const names = Object.keys(srcs), same = names.every(k => srcs[k] === srcs[names[0]]);
    F.ok(names.length >= 3 && same, `the kid-timing helper is the same in the ${names.length} modules that carry it`, names.map(k => `${k} ${srcs[k].length} B`).join(', '));
  } catch (e) { F.ok(false, 'kid-timing helper copies read', String(e).slice(0, 200)); }
  // (2) Shadow Cave, every floor: the crystals' flicker (the cue that the light is about to change) lasts the age group's
  // warning and the shine lasts as much longer; the steady light, the dim stretch and the shadows' pace are the plan's.
  // One save a floor (grade 1); the other grades and the switch are read after the module's own unload and load.
  try {
    const TK = 185, shadowState = () => page.evaluate(() => { const S = window.__QOK_DNG2__.ctx().state; return { fm: S.fm || 1000, shine: S.P.shineTicks, dim: S.P.dimTicks, step: S.P.shadowStepDimTicks, kid: !!S.kid }; });
    for (let n = 1; n <= 5; n++) {
      const name = `Shadow Cave ${n}F`, p = plan('shadowCave', n).mechanic.params, s = await seed(page, 'shadowCave', n, '1', false);
      if (!F.ok(s.pos.map === 'shadowCave' && s.pos.floor === n && s.ready, `${name} reached`, `at ${s.pos.map} ${s.pos.floor}F`)) continue;
      for (const [grade, sw, label] of [['1', null, 'grade 1'], ['3', null, 'grade 3'], ['6', null, 'grade 6'], ['1', '0', "grade 1, qok-kid-timing='0'"]]) {
        if (!(grade === '1' && sw === null)) { const re = await reloadAs(page, grade, sw); if (!F.ok(re === true, `${name} ${label}: module loaded again`, String(re))) continue; }
        await page.waitForTimeout(250);
        const r = await shadowState(), steady = r.shine * TK - r.fm, planSteady = p.shineTicks * TK - 1000;
        F.info(`${name} ${label}`, JSON.stringify(r) + ` plan shine ${p.shineTicks} ticks, flicker 1000 ms`);
        if (sw === null && grade === '1') F.ok(r.fm >= 1400, `${name} grade 1: the crystals flicker >= 1.4 s before the light changes`, `${r.fm} ms (plan 1000 ms)`);
        else if (sw === null && grade === '3') F.ok(r.fm >= 1150, `${name} grade 3: the crystals flicker >= 1.15 s before the light changes`, `${r.fm} ms (plan 1000 ms)`);
        else F.ok(r.fm === 1000 && r.shine === p.shineTicks, `${name} ${label}: flicker and shine equal the plan`, `${r.fm} ms, ${r.shine} ticks (plan 1000 ms, ${p.shineTicks} ticks)`);
        F.ok(Math.abs(steady - planSteady) <= 1 && r.dim === p.dimTicks && r.step === p.shadowStepDimTicks, `${name} ${label}: the steady light, the dim stretch and the shadows' pace equal the plan's`, `steady ${steady} ms (plan ${planSteady} ms), dim ${r.dim} ticks, step ${r.step} ticks`);
      }
      if (n === 3) {   // the flicker as drawn (the crystals' glow), timed on the module's clock, lasts the whole warning
        await reloadAs(page, '1', null); await page.waitForTimeout(250);
        const d = await page.evaluate(() => new Promise(res => { const c = window.__QOK_DNG2__.ctx(), S = c.state, sc = c.scene, t0 = Date.now(); let steady = false, start = null, prev = null, maxStep = 0;
          function step() { const a = S.crystals[0].glow.alpha, d = prev === null ? 0 : S.t - prev; prev = S.t; if (d > maxStep) maxStep = d;
            if (!S.dim) { if (start === null) { if (a >= 0.999) steady = true; else if (steady) start = S.t; } }
            else { if (start !== null) return fin({ drawnMs: Math.round(S.t - start), fm: S.fm || 1000, maxStepMs: Math.round(maxStep) }); steady = false; }
            if (Date.now() - t0 > 30000) fin({ timeout: true, fm: S.fm || 1000 }); }
          function fin(o) { sc.events.off('postupdate', step); res(o); }
          sc.events.on('postupdate', step); }));
        const tol = (d.maxStepMs || 17) + 60;
        F.ok(!d.timeout && Math.abs(d.drawnMs - d.fm) <= tol, `${name} grade 1: the flicker is drawn for the whole warning`, `drawn ${d.drawnMs} ms vs ${d.fm} ms (tolerance ${tol} ms)`);
      }
    }
  } catch (e) { F.ok(false, 'kid-timing Shadow Cave checks ran', String(e).slice(0, 200)); }
  // (3) Stormreach Spire 3F (a narrow-band floor): the two options the owner has not ruled on, each behind its own value
  // of the switch and neither on unless asked for. 'b': a strike lasts one tick. 'a': a strike covers fewer bands at once
  // (every plan group is struck in two halves, so the period doubles); every terrace cell is still struck in its turn.
  try {
    const id = 'stormreachSpire', n = 3, name = 'Stormreach Spire 3F', pp = plan(id, n).mechanic.params;
    const read = () => page.evaluate(() => { const c = window.__QOK_DNG2__.ctx(), S = c.state, M = S.M, rows = c.mechanic.strikeGroups, G0 = (c.mechanic.params || {}).groups || 1;
      let planCells = 0, total = 0, halves = 0; for (const r of rows) for (let x = 0; x < r.length; x++) { const ch = r.charCodeAt(x) - 48; if (ch >= 0 && ch < G0) planCells++; }
      for (let g = 0; g < M.G; g++) for (const q of M.cells[g]) { total++; if (rows[q[1]].charCodeAt(q[0]) - 48 === g % G0) halves++; }
      return { opt: M.opt || '', G: M.G, glow: M.glow, strike: M.strike, gap: M.gap, period: M.period, pictures: S.spr ? S.spr.glow.length : 0, planCells, total, halves }; });
    const at = async (sw, label) => { const s = await seed(page, id, n, '1', sw); return F.ok(s.pos.map === id && s.pos.floor === n && s.ready, `${name} reached (${label})`, `at ${s.pos.map} ${s.pos.floor}F`); };
    let d = null;
    if (await at(false, 'grade 1')) { d = await read(); F.info(`${name} grade 1`, JSON.stringify(d));
      F.ok(d.opt === '' && d.G === pp.groups && d.strike === (pp.strikeTicks || 2), `${name} grade 1, switch not set: neither option plays`, `option '${d.opt}', ${d.G} groups, strike ${d.strike} ticks`); }
    if (d && await at('b', "grade 1, qok-kid-timing='b'")) { const b = await read(); F.info(`${name} grade 1 'b'`, JSON.stringify(b));
      F.ok(b.strike === 1 && b.glow === d.glow && b.gap === d.gap && b.G === d.G, `${name} grade 1, qok-kid-timing='b': a strike lasts one tick; glow, turn length and groups as without it`, `strike ${b.strike} tick(s), glow ${b.glow}, turn ${b.gap}, groups ${b.G} (without: ${d.strike}, ${d.glow}, ${d.gap}, ${d.G})`);
      const r = await measure(page, 'storm'), tol = (r.maxStepMs || 17) + 60;
      F.ok(!r.timeout && Math.abs(r.drawnMs - r.stateMs) <= tol, `${name} grade 1, qok-kid-timing='b': the cue is drawn for the whole warning`, `drawn ${r.drawnMs} ms vs ${r.stateMs} ms (tolerance ${tol} ms)`); }
    if (d && await at('a', "grade 1, qok-kid-timing='a'")) { const a = await read(); F.info(`${name} grade 1 'a'`, JSON.stringify(a));
      F.ok(a.G === 2 * d.G && a.period === 2 * d.period && a.glow === d.glow && a.strike === d.strike && a.gap === d.gap, `${name} grade 1, qok-kid-timing='a': every plan group is struck in two halves (twice the groups, twice the period; glow, strike and turn length as without it)`, `${a.G} groups, period ${a.period} ticks (without: ${d.G}, ${d.period})`);
      F.ok(a.total === a.planCells && a.halves === a.total && a.pictures === a.G, `${name} grade 1, qok-kid-timing='a': every terrace cell is still struck, in a half of its own plan group, and every half has its glow picture`, `${a.total} of ${a.planCells} cells, ${a.halves} in their own group, ${a.pictures} pictures`);
      const r = await measure(page, 'storm'), tol = (r.maxStepMs || 17) + 60;
      F.ok(!r.timeout && Math.abs(r.drawnMs - r.stateMs) <= tol, `${name} grade 1, qok-kid-timing='a': the cue is drawn for the whole warning`, `drawn ${r.drawnMs} ms vs ${r.stateMs} ms (tolerance ${tol} ms)`); }
    if (await at(true, "grade 1, qok-kid-timing='0'")) { const z = await read();
      F.ok(z.opt === '' && z.G === pp.groups && z.glow === pp.glowTicks && z.strike === (pp.strikeTicks || 2) && z.gap === pp.ticksBetweenGroups, `${name} grade 1, qok-kid-timing='0': the plan plays (no option)`, `${z.G} groups, glow ${z.glow}, strike ${z.strike}, turn ${z.gap} ticks`); }
  } catch (e) { F.ok(false, 'kid-timing Stormreach option checks ran', String(e).slice(0, 200)); }
  await browser.close();
  F.done('kid-timing');
})().catch(e => { console.error('CRASH', e); process.exit(1); });
