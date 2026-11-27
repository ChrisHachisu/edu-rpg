'use strict';
// Day 4 census, group 3 (overworld): a complete atlas of the land, in phone-sized views, so every coast, mountain
// edge, forest edge, river / lake, bridge, town icon, dungeon icon and act seam is on at least one image.
// One seeded boot; the hero is teleported cell by cell (hero position + camera) and the art streams in around her.
// The quest panel and the minimap (top left) are hidden so the terrain under them is visible; HP bar, compass, joystick stay.
// Each view is 11 x 22 cells (the screen shows about 11.6 x 23.3). The index text lists what the view contains.
//   node scripts/auto/census/overworld_atlas.cjs [act ...]     (default 1 2 3 4 5)
const C = require('./clib.cjs');
const { L } = C;
const STEP_X = 11, STEP_Y = 22, S = 33.6;
const BOUNDS = { 1: [0, 218, 160, 399] }; for (const a of C.acts.acts) BOUNDS[a.act] = a.bounds;
const actOf = (x, y) => { for (const a of [2, 3, 4, 5, 1]) { const b = BOUNDS[a]; if (x >= b[0] && x <= b[2] && y >= b[1] && y <= b[3]) return a; } return 0; };
const KIND = { 6: 'town', 7: 'dungeon mouth', 8: 'castle', 9: 'portal' };
(async () => {
  const acts = process.argv.slice(2).length ? process.argv.slice(2).map(Number) : [1, 2, 3, 4, 5];
  const { browser, page } = await C.open();
  await C.boot(page, { mapId: 'overworld', x: 209, y: 321 }); await page.waitForTimeout(1500);
  const grid = await page.evaluate(() => { const w = window.__PHASER_GAME__.scene.getScene('WorldMapScene'); return Array.from({ length: 400 }, (_, y) => Array.from(w.mapData[y])); });
  await page.addStyleTag({ content: '#qfh-map,#qfh-quest{visibility:hidden!important}' });
  const lm = C.LANDMARKS.map(l => ({ n: l.name || l.mapId, x: l.at[0], y: l.at[1], t: l.tile }));
  const tele = (tx, ty) => page.evaluate(([tx, ty, S]) => { const w = window.__PHASER_GAME__.scene.getScene('WorldMapScene'), c = w.cameras.main; w.hero.setPosition((tx + 0.5) * S, (ty + 0.5) * S); w.heroTileX = tx; w.heroTileY = ty;
    try { w.hero.body && w.hero.body.reset && w.hero.body.reset((tx + 0.5) * S, (ty + 0.5) * S); } catch (e) {} c.centerOn((tx + 0.5) * S, (ty + 0.5) * S); }, [tx, ty, S]);
  let n = 0;
  for (const act of acts) {
    const [x0, y0, x1, y1] = BOUNDS[act];
    // rows run north to south, columns west to east
    for (let ry = y0; ry <= y1; ry += STEP_Y) for (let cx = x0; cx <= x1; cx += STEP_X) {
      const vx0 = cx, vx1 = Math.min(cx + STEP_X - 1, x1), vy0 = ry, vy1 = Math.min(ry + STEP_Y - 1, y1);
      const cnt = {}; let tot = 0;
      for (let y = vy0; y <= vy1; y++) for (let x = vx0; x <= vx1; x++) { const t = grid[y] && grid[y][x]; if (t === undefined) continue; cnt[t] = (cnt[t] || 0) + 1; tot++; }
      if (!tot) continue;
      const pct = t => Math.round(100 * (cnt[t] || 0) / tot), water = pct(2);
      if (water >= 97) continue;                                  // open sea only
      // coast sides: which edges of the view hold water next to land
      const side = (a, b, c, d) => { let w = 0, l = 0; for (let y = a; y <= b; y++) for (let x = c; x <= d; x++) { const t = grid[y] && grid[y][x]; if (t === 2) w++; else if (t !== undefined) l++; } return w > 0 && l > 0; };
      const coast = [];
      const midX = (vx0 + vx1) >> 1, midY = (vy0 + vy1) >> 1;
      const quad = { NW: [vy0, midY, vx0, midX], NE: [vy0, midY, midX + 1, vx1], SW: [midY + 1, vy1, vx0, midX], SE: [midY + 1, vy1, midX + 1, vx1] };
      for (const [k, q] of Object.entries(quad)) { let w = 0, l = 0; for (let y = q[0]; y <= q[1]; y++) for (let x = q[2]; x <= q[3]; x++) { const t = grid[y] && grid[y][x]; if (t === 2) w++; else if (t !== undefined) l++; } if (w > 3 && l > 3) coast.push(k); }
      const inside = lm.filter(l => l.x >= vx0 - 1 && l.x <= vx1 + 1 && l.y >= vy0 - 1 && l.y <= vy1 + 1 && actOf(l.x, l.y) === act);
      const tags = [];
      if (coast.length) tags.push(`coast (${coast.join('+')})`); else if (water >= 3) tags.push('water');
      if (pct(4) >= 5) tags.push(`mountains ${pct(4)}%`); if (pct(3) >= 3) tags.push(`forest ${pct(3)}%`);
      const mtn = cnt[4] > 0 && cnt[0] > 0, forest = cnt[3] > 0 && cnt[0] > 0; if (mtn) tags.push('mountain/grass edge'); if (forest) tags.push('forest edge');
      if (inside.length) tags.push('icons: ' + inside.map(l => `${l.n} (${KIND[l.t] || 'tile ' + l.t})`).join(', '));
      const bx = Math.min(Math.max(Math.round((vx0 + vx1) / 2), 1), 318), by = Math.min(Math.max(Math.round((vy0 + vy1) / 2), 1), 398);
      await tele(bx, by); await page.waitForTimeout(n === 0 ? 3000 : 1400);
      const name = `ow-atlas-a${act}-y${String(vy0).padStart(3, '0')}-x${String(vx0).padStart(3, '0')}`;
      await C.snap(page, name, { area: 'overworld', act, place: `cells x${vx0}-${vx1}, y${vy0}-${vy1}`, shows: `act ${act} atlas view, cells x${vx0}-${vx1} y${vy0}-${vy1} (centre ${bx},${by}); terrain: grass ${pct(0)}% water ${water}% mountain ${pct(4)}% forest ${pct(3)}%; ${tags.join('; ') || 'plain land'}. Minimap and quest panel hidden, hero teleported to the centre`,
        how: 'atlas: hero + camera teleported to the view centre (no walk)' });
      n++;
    }
  }
  await browser.close();
})().catch(e => { console.error('CRASH', e); process.exit(1); });
