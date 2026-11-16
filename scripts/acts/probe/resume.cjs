'use strict';
// Build 97 regression: an Act 1 save resumes where it was saved, through the REAL Continue path
// (the five-slot title: Start, Slot 1, Auto save / Last save), not through TitleScene.confirmTitle.
//   NODE_PATH=/opt/node-tools/node_modules PROBE_OUT=<dir> [BASE_URL=http://127.0.0.1:5181/] \
//     [THROTTLE=<cpu rate>] [SLOW_CHUNKS=<ms>] [SLOW_UNDERPAINT=<ms>] node scripts/acts/probe/resume.cjs [caseId ...]
// CASES     the overworld beside Greenhollow; inside each Act 1 town, once as the auto save a
//           walk-in leaves (the bundle's interior cell 8,14) and once as a save-point save (the
//           town's own cell); inside three Act 1 dungeons; and a pre-slot install that only has the
//           bundle's single `edu-rpg-save`. No record carries the `acts.geo2` flag, as none did
//           before this runtime shipped.
//           LATER: a save inside an Acts 2-5 town (one per act, and hosted Cinderwatch), written by
//           this runtime, so it carries `acts.geo2`. Not compared with BASE_URL: build 96 has no
//           such town. The cover must wait for that town's own plate, not lift on the bundle's map.
// PASS      she is on the map the record names, at the record's cell (a town: the town overlay is up
//           on that town's plate; a save-point save: at the saved town cell), the loading cover
//           lifted without ever showing its failure screen, and no page error. With BASE_URL the
//           same case is run on that build first and map, cell and town cell must be equal.
// THROTTLE  Emulation.setCPUThrottlingRate: the same checks on a starved main thread.
// SLOW_CHUNKS  every Act 1 chunk file takes this long (ms). Past 15000 the old loader cancelled and
//           restarted each one for ever; the ground must still arrive (`groundMs`).
// SLOW_UNDERPAINT  the Act 1 underpaint plate takes this long (ms). The cover waits on it on the
//           overworld: the old cover put its failure screen up at 20 s whatever was still arriving.
const fs = require('fs'), path = require('path');
const L = require('./lib.cjs');
const BASE = process.env.BASE_URL || '', THROTTLE = +process.env.THROTTLE || 0, SLOW = +process.env.SLOW_CHUNKS || 0, SLOWU = +process.env.SLOW_UNDERPAINT || 0;
const FR = '#act1-hifi-preserved-root iframe';
const CASES = [
  { id: 'overworld', pos: { mapId: 'overworld', x: 69, y: 257 } },
  { id: 'town-greenhollow-auto', pos: { mapId: 'greenhollow', x: 8, y: 14 } },
  { id: 'town-millbrook-auto', pos: { mapId: 'millbrook', x: 8, y: 14 } },
  { id: 'town-portSapphire-auto', pos: { mapId: 'portSapphire', x: 8, y: 14 } },
  { id: 'town-greenhollow-saved', pos: { mapId: 'greenhollow', x: 31.05, y: 47.68 }, kind: 'save', cell: [31.05, 47.68] },
  { id: 'town-millbrook-saved', pos: { mapId: 'millbrook', x: 24.25, y: 50.37 }, kind: 'save', cell: [24.25, 50.37] },
  { id: 'town-portSapphire-saved', pos: { mapId: 'portSapphire', x: 26.49, y: 15.35 }, kind: 'save', cell: [26.49, 15.35] },
  { id: 'dungeon-sunkenCellar', pos: { mapId: 'sunkenCellar', x: 20, y: 25 } },
  { id: 'dungeon-mistyGrotto', pos: { mapId: 'mistyGrotto', x: 40, y: 26 } },
  { id: 'dungeon-crystalCave', pos: { mapId: 'crystalCave', x: 76, y: 31 } },
  { id: 'single-save-town', pos: { mapId: 'greenhollow', x: 8, y: 14 }, single: true },
  { id: 'single-save-overworld', pos: { mapId: 'overworld', x: 133, y: 347 }, single: true },
  { id: 'later-town-ironkeep', pos: { mapId: 'ironkeep', x: 8, y: 14 }, later: 'ironkeep' },
  { id: 'later-town-oasisHaven', pos: { mapId: 'oasisHaven', x: 8, y: 14 }, later: 'oasisHaven' },
  { id: 'later-town-embersRest', pos: { mapId: 'embersRest', x: 8, y: 14 }, later: 'embersRest' },
  { id: 'later-town-cinderwatch', pos: { mapId: 'embersRest', x: 8, y: 14 }, later: 'cinderwatch', flags: { 'acts.town.cinderwatch': true } },
  { id: 'later-town-lastBastion', pos: { mapId: 'lastBastion', x: 8, y: 14 }, later: 'lastBastion' },
];
function record(c) {
  const s = L.save({ mapId: c.pos.mapId, x: c.pos.x, y: c.pos.y, flags: { 'boss.giantToad.defeated': true, 'boss.serpent.defeated': true, 'boss.stormHarpy.defeated': true,
    'act1.townOpened.greenhollow': true, 'act1.townOpened.millbrook': true, 'act1.townOpened.portSapphire': true } });
  if (c.later) Object.assign(s.player.storyFlags, L.allFlags(), c.flags || {}); else delete s.player.storyFlags['acts.geo2'];
  Object.assign(s.player, { level: 12, hp: 180, maxHp: 180, atk: 60, def: 40, spd: 30 });
  return s;
}
const state = page => page.evaluate(sel => {
  const g = window.__PHASER_GAME__, w = g && g.scene.getScene('WorldMapScene'), c = window.__QOK_COVER__, dq = window.__DQ_TILES__, sp = dq && dq.overworldSpace;
  const f = document.querySelector(sel), t = f && f.contentWindow && f.contentWindow.__ACT1_TOWN__; let tp = null; try { tp = t.position(); } catch (e) {}
  const root = document.getElementById('act1-hifi-preserved-root'), ow = w && w.currentMapId === 'overworld';
  let cov = null; try { cov = ow && window.__A1_VISIBLE_BASE_COVERAGE__ ? window.__A1_VISIBLE_BASE_COVERAGE__(w) : null; } catch (e) {}
  let m = null; try { m = window.__QOK_MULTIACT__ ? window.__QOK_MULTIACT__.status() : null; } catch (e) {}
  return { phase: c && c.phase(), map: w && w.currentMapId, floor: w && w.currentFloor, x: w && w.heroTileX, y: w && w.heroTileY,
    cx: ow && sp && w.hero ? +(sp.toCanonical(w.hero.x) / 48).toFixed(2) : null, cy: ow && sp && w.hero ? +(sp.toCanonical(w.hero.y) / 48).toFixed(2) : null,
    town: t && t.town ? { art: t.town.id, ready: root && root.dataset.ready, cell: tp ? [+(tp.x / t.town.worldPxPerCell).toFixed(2), +(tp.y / t.town.worldPxPerCell).toFixed(2)] : null } : null,
    ground: cov ? !!cov.ready : null, relocated: m ? m.stats.relocated : null, asked: m ? (m.asked || []).filter(Boolean).length : null };
}, FR);
async function run(url, c) {
  const { browser, ctx, page, errors } = await L.launch();
  ctx.setDefaultTimeout(THROTTLE ? 600000 : 120000);
  const out = { failureScreens: 0, delayed: 0 };
  try {
    const slow = (part, ms) => ctx.route(u => u.href.includes(part), async route => { out.delayed++; await new Promise(r => setTimeout(r, ms)); try { await route.continue(); } catch (e) {} });
    if (SLOW) await slow('act1-hifi/chunks/', SLOW);
    if (SLOWU) await slow('act1-hifi/underpaint/act1-plate', SLOWU);
    await page.goto(url, { waitUntil: 'domcontentloaded' });
    await page.evaluate(([raw, c]) => { localStorage.clear();
      if (c.single) { localStorage.setItem('edu-rpg-save', raw); return; }                       // before save slots existed
      localStorage.setItem('qok-slots-v1', '1'); localStorage.setItem('qok-active-slot', '1');
      localStorage.setItem('qok-slot-1-' + (c.kind === 'save' ? 'save' : 'auto'), raw); }, [JSON.stringify(record(c)), c]);
    if (THROTTLE) { const cdp = await ctx.newCDPSession(page); await cdp.send('Emulation.setCPUThrottlingRate', { rate: THROTTLE }); }
    await page.reload({ waitUntil: 'load' });
    await page.waitForSelector('[data-act="titleSlots"]', { state: 'visible' });
    await page.waitForFunction(() => { const k = window.__QOK_COVER__; return k && k.phase() === 'waiting'; });
    await page.waitForTimeout(300);
    await page.click('[data-act="titleSlots"]');
    await page.click('[data-act="slotPick"][data-i="1"]');
    const sel = '[data-act="slotLoad"]';                                                        // the slot holds one record: its only button
    await page.waitForSelector(sel, { state: 'visible' });
    out.record = (await page.textContent(sel)).replace(/\s+/g, ' ').slice(0, 60);
    const t0 = Date.now(), limit = (THROTTLE ? 20000 * THROTTLE : 60000) + 4 * SLOW + 4 * SLOWU;
    await page.click(sel);
    let s = null, activeAt = null;
    while (Date.now() - t0 < limit) {
      s = await state(page);
      if (s.phase === 'error') {                                   // Retry is never pressed: the screen must not appear at all
        if (!out.failureScreens++) { out.failureMs = Date.now() - t0; await L.shot(page, 'resume-' + c.id + '-failure'); }
        if (Date.now() - t0 > out.failureMs + 20000) break;
        await page.waitForTimeout(1000);
      }
      if (s.phase === 'active' && activeAt === null) activeAt = Date.now() - t0;
      if (activeAt !== null && s.map === 'overworld' && s.ground && out.groundMs === undefined) out.groundMs = Date.now() - t0;
      if (activeAt !== null && Date.now() - t0 > activeAt + 3000 && (s.map !== 'overworld' || !SLOW || s.ground)) break;
      await page.waitForTimeout(200);
    }
    Object.assign(out, s, { activeMs: activeAt });
    out.shot = path.basename(await L.shot(page, 'resume-' + c.id + (url === BASE ? '-base' : '')));
  } catch (e) { out.error = String(e).slice(0, 300); }
  out.errors = errors.slice(0, 5);
  await browser.close();
  return out;
}
const near = (a, b, tol) => Array.isArray(a) && Array.isArray(b) && Math.abs(a[0] - b[0]) <= tol && Math.abs(a[1] - b[1]) <= tol;
(async () => {
  const only = process.argv.slice(2), rows = [];
  for (const c of CASES) {
    if (only.length && !only.includes(c.id)) continue;
    const base = BASE && !c.later ? await run(BASE, c) : null, r = await run(L.URL_, c);
    const town = c.pos.mapId !== 'overworld' && !c.pos.mapId.match(/^(sunkenCellar|mistyGrotto|crystalCave)$/), art = c.later || c.pos.mapId;
    const where = r.map === c.pos.mapId && Math.abs(r.x - c.pos.x) < 0.01 && Math.abs(r.y - c.pos.y) < 0.01
      && (!town || (r.town && r.town.art === art && r.town.ready === 'true' && (!c.cell || near(r.town.cell, c.cell, 0.1))))
      && (c.pos.mapId !== 'overworld' || (Math.abs(r.cx - c.pos.x - 0.5) < 0.2 && Math.abs(r.cy - c.pos.y - 0.5) < 0.2 && r.relocated === 0));
    const same = !base || (base.map === r.map && base.x === r.x && base.y === r.y && JSON.stringify(base.town && base.town.cell) === JSON.stringify(r.town && r.town.cell));
    const row = { case: c.id, saved: c.pos, record: r.record, at: { map: r.map, floor: r.floor, x: r.x, y: r.y, town: r.town && r.town.cell }, activeMs: r.activeMs, groundMs: r.groundMs,
      failureScreens: r.failureScreens, failureMs: r.failureMs, base: base && { map: base.map, x: base.x, y: base.y, town: base.town && base.town.cell, activeMs: base.activeMs, failureScreens: base.failureScreens },
      resumedWhereSaved: !!where, sameAsBase: same, actsAsked: r.asked, errors: r.errors.length, error: r.error, shot: r.shot };
    row.pass = !!(where && same && r.activeMs !== null && r.failureScreens === 0 && !r.errors.length && !r.error && (!SLOW || c.pos.mapId !== 'overworld' || r.groundMs !== undefined));
    rows.push(row); console.log(JSON.stringify(row));
  }
  fs.writeFileSync(path.join(L.OUT, 'resume' + (THROTTLE ? '-thr' + THROTTLE : '') + (SLOW ? '-slow' + SLOW : '') + (SLOWU ? '-slowu' + SLOWU : '') + '.json'), JSON.stringify({ throttle: THROTTLE, slowChunksMs: SLOW, slowUnderpaintMs: SLOWU, base: BASE || null, rows }, null, 1));
  console.log('RESUME', rows.filter(r => r.pass).length + '/' + rows.length, JSON.stringify({ throttle: THROTTLE, slowChunksMs: SLOW, slowUnderpaintMs: SLOWU, base: !!BASE }));
})().catch(e => { console.error('CRASH', e); process.exit(1); });
