'use strict';
// Overworld static cross-check: dump the live overworld mapData (after the Acts 2-5 runtime wrote
// its plates) and compare it with the manifest's `reach` raster (cells whose standing point the
// world gate calls free; Acts 2-5 index). Reports reach=1 cells whose tile is water (2) or
// mountain (4), and door tiles (6,7,8,9,10,12,15,16,19) with no reach=1 neighbour (unreachable door).
// Then, for each suspicious cell, walks there (seeded save beside it) and asks the game itself
// (__DQ_TILES__.checkOverworldSpawn at the cell centre) whether she may stand there.
//   node scripts/auto/explore/ow_static.cjs      -> /home/user/work/explore/ow-static.json
const fs = require('fs'), path = require('path');
const X = require('./xlib.cjs'), L = X.L;
const acts = JSON.parse(fs.readFileSync(path.join(X.ROOT, 'public/acts-hifi/manifest.json'), 'utf8'));
const reach = acts.reach.rows.map(r => { const row = []; for (const seg of r.split(',')) { const [v, n] = seg.split(':').map(Number); for (let i = 0; i < n; i++) row.push(v); } return row; });
const actOf = (x, y) => { for (const a of acts.acts) { const [x0, y0, x1, y1] = a.bounds; if (x >= x0 && x <= x1 && y >= y0 && y <= y1) return a.act; } return 1; };
(async () => {
  const S = await X.launchX(), page = S.page;
  await X.boot(page, L.save({ x: 200, y: 300, flags: L.allFlags() }));
  const md = await page.evaluate(() => window.__PHASER_GAME__.scene.getScene('WorldMapScene').mapData.map(r => Array.from(r)));
  const H = md.length, W = md[0].length, out = { size: [W, H], water: [], mountain: [], doorsNoReach: [] };
  const DOOR = new Set([6, 7, 8, 9, 10, 12, 15, 16, 19]);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const t = md[y][x], r = reach[y] && reach[y][x];
    if (actOf(x, y) === 1) continue;                       // the raster speaks for Acts 2-5 only
    if (r === 1 && t === 2) out.water.push([x, y]);
    if (r === 1 && t === 4) out.mountain.push([x, y]);
    if (DOOR.has(t)) { let any = false; for (const [dx, dy] of [[0, 1], [0, -1], [1, 0], [-1, 0]]) if (reach[y + dy] && reach[y + dy][x + dx] === 1) any = true; if (!any) out.doorsNoReach.push([x, y, t]); }
  }
  console.log('water reach cells', out.water.length, 'mountain reach cells', out.mountain.length, 'doors w/o reach', JSON.stringify(out.doorsNoReach));
  // ask the game itself on a sample of the water cells: seed beside the cell, read the spawn check at its centre
  const sample = out.water.filter((_, i) => i % Math.max(1, Math.floor(out.water.length / 12)) === 0).slice(0, 12);
  out.checked = [];
  for (const [x, y] of sample) {
    await X.boot(page, L.save({ x, y, flags: L.allFlags() }));
    const r = await page.evaluate(([x, y]) => { const w = window.__PHASER_GAME__.scene.getScene('WorldMapScene'), sp = window.__DQ_TILES__.overworldSpace;
      const c = window.__DQ_TILES__.checkOverworldSpawn(w, sp.toPhysical(x * 48 + 24), sp.toPhysical(y * 48 + 24)); return { c, hero: [w.heroTileX, w.heroTileY] }; }, [x, y]);
    const f = path.basename(await X.jpeg(page, path.join(X.OUTX, 'shots/ow'), `water-${x}-${y}`));
    out.checked.push({ cell: [x, y], ...r, shot: f }); console.log('water', x, y, JSON.stringify(r));
  }
  fs.writeFileSync(path.join(X.OUTX, 'ow-static.json'), JSON.stringify(out));
  await S.browser.close();
})();
