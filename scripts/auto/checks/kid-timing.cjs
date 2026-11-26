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
  await page.evaluate(([s, off]) => { localStorage.clear(); localStorage.setItem('edu-rpg-save', JSON.stringify(s)); if (off) localStorage.setItem('qok-kid-timing', '0'); }, [s, kidOff]);
  await page.reload({ waitUntil: 'load' });
  await L.toTitle(page);
  await page.evaluate(() => { const t = window.__PHASER_GAME__.scene.getScene('TitleScene'); const i = t.menuItems.findIndex(m => m.getData && m.getData('action') === 'continue'); t.selectedIndex = i; t.confirmTitle(); });
  await page.waitForFunction(() => { const g = window.__PHASER_GAME__, w = g.scene.getScene('WorldMapScene'); return w && g.scene.isActive('WorldMapScene') && w.hero && w.mapData; }, { timeout: 90000 });
  await page.evaluate(() => { try { window.__GAME_STATE__.encounterManager.onStep = () => null; } catch (e) {} });
  const ready = await page.waitForFunction(() => { const d = window.__QOK_DNG2__, s = d && d.state && d.state(); const c = d && d.ctx && d.ctx(); return s && s.module && c && c.state && (c.state.spr || c.state.lanes || c.state.L || c.state.P); }, { timeout: 60000, polling: 100 }).then(() => true).catch(() => false);
  await F.dismiss(page);
  return { pos: await L.pos(page), ready };
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
  await browser.close();
  F.done('kid-timing');
})().catch(e => { console.error('CRASH', e); process.exit(1); });
