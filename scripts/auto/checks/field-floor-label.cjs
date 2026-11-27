'use strict';
// m1 (census 2026-11-23): the HUD floor label must count the floors in the order they run.
// Caves and mines descend: B1F, B2F, ... B<n>F. Towers and the castle climb: 1F, 2F, ...
// The unfixed bundle counted back up past the middle floor of any dungeon with two exits
// (Shadow Cave and Magma Tunnels 4F/5F read B2F/B1F; Volcanic Forge 5F-7F read B3F/B2F/B1F).
// Fix: public/dq-tiles.js a2dWrapHud / a2dFloorLabel.
// Each floor: a save seeded at the floor's landing cell, Continue (census path), then the label the
// player sees (ui-overhaul's #qfh-floor chip, which copies the bundle's floorText).
//   NODE_PATH=/opt/node-tools/node_modules PROBE_URL=http://127.0.0.1:5503/ node scripts/auto/checks/field-floor-label.cjs [id:floor ...]
const F = require('./field-lib.cjs');
const TOWERS = { stormNest: 1, stormreachSpire: 1, demonCastle: 1 };
// every far-half floor of the three two-exit dungeons, plus one floor of each kind as a control
const DEFAULT = ['shadowCave:4', 'shadowCave:5', 'magmaTunnels:4', 'magmaTunnels:5', 'volcanicForge:5', 'volcanicForge:6', 'volcanicForge:7',
  'ironMine:1', 'stormNest:3', 'stormreachSpire:2', 'demonCastle:9', 'frozenLake:5'];
(async () => {
  const want = process.argv.slice(2).length ? process.argv.slice(2) : DEFAULT;
  const { browser, page } = await F.L.launch({ dpr: 1 });
  for (const w of want) {
    const [id, fs] = w.split(':'), n = +fs, fl = F.floorOf(id, n);
    if (!fl) { F.ok(false, `${id} ${n}F label`, 'no such authored floor'); continue; }
    const land = F.landing(fl);
    try {
      const p = await F.seedDungeon(page, id, n, land);
      const got = await page.evaluate(() => { const e = document.getElementById('qfh-floor'); const w = window.__PHASER_GAME__.scene.getScene('WorldMapScene');
        return { chip: e && e.style.display !== 'none' ? e.textContent : null, ft: w.floorText && w.floorText.text }; });
      const label = got.chip || got.ft || '';
      const m = /\s(B?)(\d+)F$/.exec(label), want = (TOWERS[id] ? '' : 'B') + n + 'F';
      F.ok(p.map === id && p.floor === n && m && (m[1] + m[2] + 'F') === want, `${id} floor ${n} reads ${want}`, `label "${label}" (at ${p.map} ${p.floor}F)`);
    } catch (e) { F.ok(false, `${id} floor ${n} label`, String(e).slice(0, 200)); }
  }
  await browser.close();
  F.done('field-floor-label');
})().catch(e => { console.error('CRASH', e); process.exit(1); });
