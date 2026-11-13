'use strict';
// Every Acts 2-5 town: seeded on its exit cell, a real walk into the door, the hi-fi town opens on
// its own plate with the hero at the gate (walk-in spawn), a real key walk out through the gate,
// and the hero stands on the exit cell again.
//   NODE_PATH=/opt/node-tools/node_modules PROBE_OUT=<dir> node scripts/acts/probe/towns.cjs [townId ...]
const fs = require('fs'), path = require('path');
const L = require('./lib.cjs');
const FR = '#act1-hifi-preserved-root iframe';
(async () => {
  const only = process.argv.slice(2);
  const { browser, page, errors } = await L.launch();
  const rows = [];
  const town = () => page.evaluate(() => {
    const w = window.__PHASER_GAME__.scene.getScene('WorldMapScene'), root = document.getElementById('act1-hifi-preserved-root');
    const fr = root ? root.querySelector('iframe') : null, t = fr && fr.contentWindow && fr.contentWindow.__ACT1_TOWN__;
    let p = null; try { p = t.position(); } catch (e) {}
    return { map: w && w.currentMapId, art: t && t.town ? t.town.id : null, start: t && t.town ? t.town.startCell : null,
      cell: t && t.town && p ? [p.x / t.town.worldPxPerCell, p.y / t.town.worldPxPerCell] : null, ready: root ? root.dataset.ready : null,
      virtual: window.__QOK_MULTIACT__ ? window.__QOK_MULTIACT__.status().virtual : null };
  });
  await L.bootSave(page, L.save({ x: 80, y: 262, flags: L.allFlags() }));
  const doors = await page.evaluate(() => window.__QOK_MULTIACT__.index().landmarks.filter(d => d.tile === 6));
  for (const d of doors) {
    const id = d.virtual || d.mapId;
    if (only.length && !only.includes(id)) continue;
    const row = { town: id, engineMap: d.mapId, door: d.at, exit: d.exit };
    try {
      await L.bootSave(page, L.save({ x: d.exit[0], y: d.exit[1], flags: L.allFlags() }));
      const p0 = await L.pos(page);
      row.seeded = [p0.x, p0.y];
      const walk = await L.walkCells(page, [d.at], { maxMs: 25000 });
      await page.waitForFunction(() => { const root = document.getElementById('act1-hifi-preserved-root'); const fr = root && root.querySelector('iframe'); return !!(fr && fr.contentWindow && fr.contentWindow.__ACT1_TOWN__); }, { timeout: 30000 }).catch(() => {});
      await page.waitForTimeout(3500);
      const t = await town();
      row.entered = t.map === d.mapId && t.art === id; row.inTown = t; row.walk = walk.why;
      row.hudName = await page.evaluate(() => { const w = window.__PHASER_GAME__.scene.getScene('WorldMapScene'); return w.floorText && w.floorText.text; });
      row.walkIn = !!(t.cell && t.start && Math.hypot(t.cell[0] - t.start[0], t.cell[1] - t.start[1]) < 1.5);
      row.shotIn = path.basename(await L.shot(page, 'town-' + id + '-in'));
      if (row.entered) {
        let gone = false;
        for (const key of d.gate === 'north' ? ['ArrowUp', 'ArrowDown'] : ['ArrowDown', 'ArrowUp']) {
          if (gone) break;
          await page.evaluate(sel => { const f = document.querySelector(sel); if (f) f.contentWindow.focus(); }, FR);
          await page.keyboard.down(key); const dl = Date.now() + 15000;
          while (Date.now() < dl) { await page.waitForTimeout(250); gone = await page.evaluate(sel => { const f = document.querySelector(sel); return !(f && f.contentWindow && f.contentWindow.__ACT1_TOWN__); }, FR); if (gone) break; }
          await page.keyboard.up(key);
        }
        await page.waitForTimeout(3000);
        const p = await L.pos(page);
        row.out = { map: p.map, x: p.x, y: p.y, cx: p.cx && +p.cx.toFixed(2), cy: p.cy && +p.cy.toFixed(2) };
        row.exitOnCell = gone && p.map === 'overworld' && p.x === d.exit[0] && p.y === d.exit[1]
          && Math.abs(p.cx - d.exit[0] - 0.5) < 0.2 && Math.abs(p.cy - d.exit[1] - 0.5) < 0.2;
        row.shotOut = path.basename(await L.shot(page, 'town-' + id + '-out'));
        const m = await L.multi(page); row.stats = m && { exits: m.stats.exits, relocated: m.stats.relocated, virtual: m.virtual };
      }
    } catch (e) { row.error = String(e).slice(0, 300); }
    row.pass = !!(row.entered && row.walkIn && row.exitOnCell);
    rows.push(row); console.log(JSON.stringify(row));
  }
  fs.writeFileSync(path.join(L.OUT, 'towns.json'), JSON.stringify({ rows, errors: errors.slice(0, 20) }, null, 1));
  console.log('TOWNS', rows.filter(r => r.pass).length + '/' + rows.length, 'errors', errors.length, JSON.stringify(errors.slice(0, 4)));
  await browser.close();
})().catch(e => { console.error('CRASH', e); process.exit(1); });
