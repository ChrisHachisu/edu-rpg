'use strict';
// Real path: a save on floor 1 of a dungeon (at the given cell), walk to the stairs down (tile 9)
// with the stick over the game's own free() (xlib GOTO), repeat `depth` times; on each new floor
// walk a few steps, hide/show the page (ui-overhaul's auto save), reload, Continue through the
// five-slot title, and compare map/floor/cell. Shots in shots/verify/.
//   node scripts/auto/explore/verify_descend_resume.cjs <dungeonId> <x> <y> [depth=2]
const X = require('./xlib.cjs'), L = X.L, path = require('path');
(async () => {
  const [id, x, y, dep] = process.argv.slice(2), depth = +(dep || 2);
  const S = await X.launchX(), page = S.page, out = { id, steps: [] };
  try {
    await X.boot(page, L.save({ mapId: id, x: +x, y: +y, floor: 1, flags: L.allFlags() }), { slots: true });
    for (let d = 0; d < depth; d++) {
      const here = await X.where(page);
      const dn = await page.evaluate(() => { const md = window.__PHASER_GAME__.scene.getScene('WorldMapScene').mapData; for (let y = 0; y < md.length; y++) for (let x = 0; x < md[0].length; x++) if (md[y][x] === 9) return [x, y]; return null; });
      if (!dn) { out.steps.push({ here, why: 'no stairs down' }); break; }
      const g = await page.evaluate(X.GOTO, { goal: dn });
      await page.waitForTimeout(2500); await L.noEncounters(page);
      const arrived = await X.where(page);
      // a few steps away from the stairs, then the auto save
      for (const [a, b] of [[0, 1], [1, 0], [-1, 0]]) await L.stick(page, a, b, 350);
      const before = await X.where(page);
      await X.hide(page, true); await page.waitForTimeout(800); await X.hide(page, false); await page.waitForTimeout(500);
      const recs = await page.evaluate(() => { const o = {}; for (const k of Object.keys(localStorage)) { if (!/save|resume|slot-\d/.test(k)) continue; try { const v = JSON.parse(localStorage.getItem(k)); const p = (v.player || v.data && v.data.player || {}).position || v.position || null; o[k] = p || Object.keys(v).slice(0, 6); } catch (e) { o[k] = String(localStorage.getItem(k)).slice(0, 80); } } return o; });
      console.log('RECORDS', JSON.stringify(recs));
      const labels = await X.reloadContinue(page);
      const after = await X.where(page);
      const shot = path.basename(await X.jpeg(page, path.join(X.OUTX, 'shots/verify'), `${id}-descend${d + 1}-resumed`));
      const ok = after.map === before.map && after.floor === before.floor && Math.abs(after.cell[0] - before.cell[0]) + Math.abs(after.cell[1] - before.cell[1]) <= 1;
      out.steps.push({ from: here, stairs: dn, goto: g, arrived, before, labels, after, ok, shot });
      console.log(`[${ok ? 'PASS' : 'FAIL'}] ${id}: descend ${d + 1} (f${here.floor} -> f${arrived.floor}), save, reload, Continue -- before ${JSON.stringify(before)} after ${JSON.stringify(after)} labels ${JSON.stringify(labels)}`);
    }
  } catch (e) { out.error = String(e && e.stack || e).slice(0, 400); console.log('ERROR', out.error); }
  out.errors = S.errors.slice(0, 5); X.append('verify-descend.jsonl', out);
  await S.browser.close();
})();
