'use strict';
// Repro of one overworld/dungeon push: seed at a cell, hold the stick one way, log every frame where
// the sprite jumps > 30 px or the map changes, the tiles around the start, and screenshots before /
// at the first jump / after.
//   node scripts/auto/explore/repro_push.cjs <mapId> <x> <y> <dx> <dy> [ms=2500] [floor=1]
const X = require('./xlib.cjs'), L = X.L, path = require('path');
(async () => {
  const [mapId, x, y, dx, dy, ms, f] = process.argv.slice(2); const S = await X.launchX(), page = S.page;
  await X.boot(page, L.save({ mapId, x: +x, y: +y, floor: +(f || 1), flags: L.allFlags(), inventory: [{ itemId: 'flameCloak', quantity: 1 }, { itemId: 'windbreakerStone', quantity: 1 }] }));
  const tiles = await page.evaluate(([x, y]) => { const md = window.__PHASER_GAME__.scene.getScene('WorldMapScene').mapData, o = [];
    for (let j = y - 4; j <= y + 2; j++) o.push((md[j] || []).slice(x - 4, x + 5).join(',')); return o; }, [+x, +y]);
  console.log('TILES rows', +y - 4, '..', +y + 2, 'cols', +x - 4, '..', +x + 4, JSON.stringify(tiles));
  const tag = `${mapId}-${x}-${y}-${dx}_${dy}`;
  await X.jpeg(page, path.join(X.OUTX, 'shots/repro'), tag + '-0-before');
  const log = await page.evaluate(async ([dx, dy, ms]) => {
    const g = window.__PHASER_GAME__, w = g.scene.getScene('WorldMapScene'), sp = window.__DQ_TILES__.overworldSpace, out = []; let last = [w.hero.x, w.hero.y], m0 = w.currentMapId;
    const t0 = performance.now(); window.__DQ_STICK__ = { x: +dx, y: +dy, m: 1 };
    try { while (performance.now() - t0 < ms) { await new Promise(r => requestAnimationFrame(r));
      const p = [w.hero.x, w.hero.y], j = Math.hypot(p[0] - last[0], p[1] - last[1]);
      const cell = w.currentMapId === 'overworld' ? [sp.toCanonical(p[0]) / 48, sp.toCanonical(p[1]) / 48].map(v => +v.toFixed(2)) : [p[0] / 48, p[1] / 48].map(v => +v.toFixed(2));
      if (j > 30 || w.currentMapId !== m0) { out.push({ t: Math.round(performance.now() - t0), j: Math.round(j), from: last.map(Math.round), to: p.map(Math.round), cell, tile: [w.heroTileX, w.heroTileY], map: w.currentMapId, scenes: g.scene.getScenes(true).map(s => s.scene.key) }); m0 = w.currentMapId; if (out.length > 6) break; }
      last = p; } } finally { window.__DQ_STICK__ = { x: 0, y: 0, m: 0 }; }
    return { out, end: { map: w.currentMapId, tile: [w.heroTileX, w.heroTileY] } }; }, [dx, dy, +(ms || 2500)]);
  console.log('LOG', JSON.stringify(log));
  await X.jpeg(page, path.join(X.OUTX, 'shots/repro'), tag + '-1-after');
  console.log('ERRORS', JSON.stringify(S.errors.slice(0, 5)));
  await S.browser.close();
})();
