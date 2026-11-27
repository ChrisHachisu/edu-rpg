'use strict';
// Seed one save and Continue; print where she actually is, the console, a screenshot, and whether
// she can move in 8 directions. For checking a single census/fuzz oddity.
//   node scripts/auto/explore/debug_seed.cjs <mapId> <x> <y> [floor] [noflags]
const X = require('./xlib.cjs'), L = X.L, path = require('path');
(async () => {
  const [mapId, x, y, f, nf] = process.argv.slice(2); const S = await X.launchX(), page = S.page;
  await X.boot(page, L.save({ mapId, x: +x, y: +y, floor: +(f || 1), flags: nf ? {} : L.allFlags() }));
  const st = await page.evaluate(() => { const w = window.__PHASER_GAME__.scene.getScene('WorldMapScene'); return { map: w.currentMapId, floor: w.currentFloor, tile: [w.heroTileX, w.heroTileY], hero: [w.hero.x, w.hero.y], free: window.__XP__.free(w.hero.x, w.hero.y), msg: !!w.showingMessage, text: w.messageText && w.messageText.text }; });
  console.log('STATE', JSON.stringify(st));
  const moves = [];
  for (let a = 0; a < 8; a++) { const p0 = await L.pos(page); await L.stick(page, Math.cos(a * Math.PI / 4), Math.sin(a * Math.PI / 4), 500); const p1 = await L.pos(page); moves.push(Math.round(Math.hypot(p1.hx - p0.hx, p1.hy - p0.hy))); }
  console.log('MOVES', JSON.stringify(moves));
  console.log('SHOT', await X.jpeg(page, path.join(X.OUTX, 'shots/debug'), `${mapId}-f${f || 1}-${x}-${y}`));
  console.log('CONSOLE', JSON.stringify(S.consoleAll.filter(l => !/Failed to load|DevTools/.test(l)).slice(-25)));
  console.log('ERRORS', JSON.stringify(S.errors));
  await S.browser.close();
})();
