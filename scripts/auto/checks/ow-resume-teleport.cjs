'use strict';
// Overworld resume teleport check (fixer F4, autoloop 2026-11-23; explorer defect X01).
//
// The defect: acts-runtime.js REPAIRs ("relocate") any overworld position whose cell the index's
// `reach` raster does not mark, by moving her to the nearest door exit of the act. Her cell is taken
// from the sprite CENTRE, but she stands (collides) at her SOLES about 0.9 cell lower: on a north
// shore, or one row north of a wall/edge, her centre is over a reach-0 cell while her soles stand on
// reachable ground. Two moments judge that cell:
//   continue  Continue from a save whose cell is such a centre cell (the auto save stores the centre
//             cell): she was thrown to a door exit, e.g. (301,111) -> the Desert Tomb exit (270,113).
//   live      Any act's plate landing later (the far acts stream in seconds after Continue) while she
//             walks with her centre over such a cell: one frame, 31 cells, and on into the Tomb.
// The check seeds each sample cell, Continues for real, and fails if she ends more than 2 cells
// from where she stood, or if she cannot take a step there. The live case holds the far acts'
// collision packs, walks her north onto the X01 shore, then lets the packs land.
//
//   NODE_PATH=/opt/node-tools/node_modules PROBE_URL=http://127.0.0.1:5506/ node scripts/auto/checks/ow-resume-teleport.cjs [live] [continue]
//
// Output: [PASS]/[FAIL]/[INFO] lines, one summary line, exit 1 on any FAIL. OWTP_OUT (default
// <tmp>/qok-owtp): screenshots. One Chromium; the run stops itself before ~8 minutes.
const fs = require('fs'), path = require('path'), os = require('os');
const OUT = process.env.OWTP_OUT || path.join(os.tmpdir(), 'qok-owtp');
fs.mkdirSync(OUT, { recursive: true });
process.env.PROBE_OUT = process.env.PROBE_OUT || OUT;
const F = require('./field-lib.cjs'), L = F.L;
const T0 = Date.now(), BUDGET = 465000;
let pass = 0, fail = 0;
const ok = (c, name, d) => { if (c) pass++; else fail++; console.log(`[${c ? 'PASS' : 'FAIL'}] ${name}${d ? ' -- ' + d : ''}`); return !!c; };
const info = (name, d) => console.log(`[INFO] ${name}${d ? ' -- ' + d : ''}`);
const done = () => { console.log(`ow-resume-teleport: ${pass + fail} checks, ${fail} FAIL -- ${fail ? 'FAIL' : pass ? 'PASS' : 'FAIL (nothing checked)'} against ${L.URL_}`); process.exit(fail || !pass ? 1 : 0); };
setTimeout(() => { console.log('[FAIL] ran out of time'); fail++; done(); }, BUDGET + 30000).unref();

// Resume cells: centre over a reach-0 cell, soles on the reach-1 cell below, beside a door
// (scripts: the index's reach raster, cells within 3 of a door exit; X01's own cell first).
const SAMPLES = [
  [301, 111, 'X01: Act 3 desert north tip (the explorer\'s shore)'],
  [269, 111, 'Act 3: beside the Desert Tomb mouth'],
  [272, 117, 'Act 4: beside the Obsidian Cavern mouth'],
  [285, 33, 'Act 4: beside the Ember Mines mouth'],
  [84, 30, 'Act 5: beside the Demon Castle gate'],
  [265, 357, 'Act 2: beside the Frozen Lake mouth'],
];
const seedSave = (x, y) => L.save({ mapId: 'overworld', x, y, flags: { ...L.allFlags(), ...F.ALLB }, inventory: F.INV, completedQuests: F.QUESTS });
const here = page => page.evaluate(() => { const w = window.__PHASER_GAME__.scene.getScene('WorldMapScene'), sp = window.__DQ_TILES__.overworldSpace, M = window.__QOK_MULTIACT__;
  const s = M ? M.status() : null;
  return { map: w.currentMapId, tile: [w.heroTileX, w.heroTileY], c: w.currentMapId === 'overworld' ? [sp.toCanonical(w.hero.x) / 48, sp.toCanonical(w.hero.y) / 48].map(v => +v.toFixed(2)) : null,
    ready: s && s.ready, relocated: s && s.stats.relocated, from: s && s.stats.relocatedFrom, to: s && s.stats.relocatedTo, kept: s && s.stats.soleKept || 0 }; });
const allReady = page => page.waitForFunction(() => { const M = window.__QOK_MULTIACT__, s = M && M.status(); return s && [2, 3, 4, 5].every(a => s.ready[a] === 1 || s.pending[a] === 0); }, { timeout: 90000 }).then(() => true, () => false);
// one push in each direction until she moves: she must not be stuck where Continue left her
const canStep = async page => { for (const [dx, dy] of [[0, 1], [1, 0], [-1, 0], [0, -1]]) { await F.dismiss(page, 12); const a = await here(page); await L.stick(page, dx, dy, 450); const b = await here(page);
  if (b.map !== 'overworld' || Math.hypot(b.c[0] - a.c[0], b.c[1] - a.c[1]) > 0.15) return [dx, dy]; } return null; };

async function continueCase(S, [x, y, name]) {
  const page = S.page;
  await L.bootSave(page, seedSave(x, y), { settle: 1500 });
  await L.noEncounters(page); await F.dismiss(page, 12);
  const rdy = await allReady(page); await page.waitForTimeout(1500);       // every act's plate in: every chance to relocate has passed
  const h = await here(page), d = h.c ? Math.hypot(h.c[0] - (x + 0.5), h.c[1] - (y + 0.5)) : 99;
  await L.shot(page, `continue-${x}-${y}`);
  ok(h.map === 'overworld' && d <= 2 && !h.relocated, `continue ${x},${y} (${name}): she stays where she was saved (no repair of a cell she stands on)`, JSON.stringify({ at: h.c, tile: h.tile, relocated: h.relocated, to: h.to, soleKept: h.kept, actsReady: rdy }));
  if (h.map === 'overworld' && d <= 2) { const st = await canStep(page); ok(!!st, `continue ${x},${y}: she can walk off that spot`, st ? 'stepped ' + st : 'stuck in all four directions'); }
}

async function liveCase(S) {
  // X01's live trigger: the far acts' collision packs are held, so their plates land while she stands on the shore
  const page = S.page; let hold = true; const held = [];
  await S.ctx.route(/act[245]-hifi\/.*collision\.bin/, r => { if (!hold) return r.continue(); held.push(r); });
  await L.bootSave(page, seedSave(301, 112), { settle: 1500 });
  await L.noEncounters(page); await F.dismiss(page, 12);
  await page.waitForFunction(() => { const s = window.__QOK_MULTIACT__.status(); return s.ready[3] === 1; }, { timeout: 90000 }).catch(() => {});
  await page.waitForTimeout(800);
  const a = await here(page);
  await F.dismiss(page, 12); await L.stick(page, 0, -1, 1500);                                          // north onto the shore: her centre goes over the first sea row
  const b = await here(page);
  const reach0 = await page.evaluate(t => window.__QOK_MULTIACT__.reach(t[0], t[1]), b.tile);
  info('live: before the far packs land', JSON.stringify({ start: a.c, shore: b.c, tile: b.tile, reachOfTile: reach0, held: held.length, ready: b.ready }));
  if (reach0 !== 0 || !held.length) { info('live: precondition not met (her centre over a reach-0 cell while a far pack is held), so this run cannot provoke the X01 jump: not counted'); hold = false; for (const r of held) await r.continue().catch(() => {}); return; }
  hold = false; for (const r of held) await r.continue().catch(() => {});
  await allReady(page); await page.waitForTimeout(2500);
  const c = await here(page), d = c.c ? Math.hypot(c.c[0] - b.c[0], c.c[1] - b.c[1]) : 99;
  await L.shot(page, 'live-301-112-after');
  ok(held.length > 0 && c.map === 'overworld' && d <= 1, 'live: the far acts\' plates land while she stands on the X01 shore and she does not move', JSON.stringify({ shore: b.c, after: c.c, map: c.map, relocated: c.relocated, to: c.to, soleKept: c.kept, held: held.length }));
}

(async () => {
  const want = process.argv.slice(2); const doLive = !want.length || want.includes('live'), doCont = !want.length || want.includes('continue');
  if (doLive) {
    const S = await L.launch();
    try { await liveCase(S); } catch (e) { ok(false, 'live case ran', String(e && e.message || e).slice(0, 300)); }
    await S.browser.close();
  }
  if (doCont) {
    const S = await L.launch();
    for (const smp of SAMPLES) {
      if (Date.now() - T0 > BUDGET - 70000) { info(`continue ${smp[0]},${smp[1]}: skipped, out of time`); continue; }
      try { await continueCase(S, smp); } catch (e) { ok(false, `continue ${smp[0]},${smp[1]} ran`, String(e && e.message || e).slice(0, 300)); }
    }
    await S.browser.close();
  }
  done();
})();
