'use strict';
// Act 1 dungeons must not change when authored Acts 2-5 dungeons join their code path.
// The same seeded saves on the unmodified build (BASE_URL) and on this one (PROBE_URL):
//   SPOTS  a save inside four Act 1 dungeon floors, continued from the title. The field (clear of
//          HUD and stick) must be pixel-identical, hero included, and so must the floor's size,
//          her cell and the dungeon layer in use.
//   ENTRY  the real way in: a save on the overworld in front of the mouth, a walk into it, then the
//          same comparison where she lands.
//   PUSH   from each spot the stick is held in four directions until she is stopped by a wall (or
//          a door fires); she must be stopped in the same place (base against base is the noise).
//   NODE_PATH=/opt/node-tools/node_modules BASE_URL=http://127.0.0.1:5191/ PROBE_URL=http://127.0.0.1:5190/ \
//     PROBE_OUT=<dir> node scripts/acts/probe/act1_dungeon_identity.cjs
const fs = require('fs'), path = require('path');
const L = require('./lib.cjs');
const BASE = process.env.BASE_URL || 'http://127.0.0.1:5191/';
const floors = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../../../public/act1-dungeon-floors.json'), 'utf8')).floors;
const spotNear = (key, kind) => { const fl = floors[key], a = fl.assets.find(x => x.kind === kind);
  for (const [dx, dy] of [[0, 1], [0, 2], [1, 0], [-1, 0], [1, 1], [-1, 1], [0, -1]]) { const x = a.x + dx, y = a.y + dy; if (fl.rows[y] && fl.rows[y][x] === '.' && !fl.assets.some(b => b.x === x && b.y === y)) return [x, y]; }
  throw new Error('no spot ' + key + ' ' + kind); };
const SPOTS = [['sunkenCellar', 1, 'mouth'], ['sunkenCellar', 3, 'boss'], ['coastalReef', 2, 'chest'], ['mistyGrotto', 1, 'save']];
const CLIP = { x: 0, y: 250, width: 390, height: 330 };
const info = page => page.evaluate(() => { const w = window.__PHASER_GAME__.scene.getScene('WorldMapScene'); return { map: w.currentMapId, floor: w.currentFloor || 1, x: w.heroTileX, y: w.heroTileY, w: w.mapData[0].length, h: w.mapData.length, hx: Math.round(w.hero.x), hy: Math.round(w.hero.y), style: window.__HD2D_STYLE__ }; });
async function run(url, tag) {
  const { browser, page, errors } = await L.launch(); const out = { spots: {}, push: {}, entry: null, errors: 0 };
  for (const [map, floor, kind] of SPOTS) { const key = `${map}-f${floor}`, [x, y] = spotNear(key, kind);
    await L.bootSave(page, L.save({ mapId: map, floor, x, y }), { url, settle: 5000 });
    await page.evaluate(() => { window.__PHASER_GAME__.scene.getScene('WorldMapScene').hero.setFrame(0); });
    await page.waitForTimeout(600);
    out.spots[key] = { info: await info(page), shot: await page.screenshot({ clip: CLIP }) };
    fs.writeFileSync(path.join(L.OUT, `a1d-${tag}-${key}.png`), await page.screenshot());
    const ends = [], home = out.spots[key].info;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {          // into the wall and held there: where she is stopped, not how fast she got there
      await page.evaluate(h => { const w = window.__PHASER_GAME__.scene.getScene('WorldMapScene'); w.hero.x = h.hx; w.hero.y = h.hy; w.heroTileX = h.x; w.heroTileY = h.y; }, home);
      await L.stick(page, dx, dy, 2600); await page.waitForTimeout(250); const i = await info(page); ends.push(i.map === home.map && i.floor === home.floor ? [i.hx, i.hy] : [i.map, i.floor]);
      if (i.map !== home.map || i.floor !== home.floor) break; }
    out.push[key] = ends; }
  // the real way in
  await L.bootSave(page, L.save({ x: 80, y: 262 }), { url, settle: 3000 });
  const lm = await page.evaluate(() => { const wm = window.__ACT1_WORLD_MAP__, l = wm && wm.landmarks && wm.landmarks.find(a => a.mapId === 'sunkenCellar'); return l ? { at: [l.at.x, l.at.y], exit: [l.exit.x, l.exit.y] } : null; });
  if (lm) { await L.bootSave(page, L.save({ x: lm.exit[0], y: lm.exit[1] }), { url, settle: 4000 });
    const r = await L.walkCells(page, [lm.at], { maxMs: 25000 }); await page.waitForTimeout(4500);
    await page.evaluate(() => { window.__PHASER_GAME__.scene.getScene('WorldMapScene').hero.setFrame(9); }); await page.waitForTimeout(500);
    out.entry = { r: r.why, info: await info(page), shot: await page.screenshot({ clip: CLIP }) };
    fs.writeFileSync(path.join(L.OUT, `a1d-${tag}-entry.png`), await page.screenshot()); }
  out.errors = errors.length; await browser.close(); return out;
}
(async () => {
  const a = await run(BASE, 'base'), a2 = await run(BASE, 'base2'), b = await run(L.URL_, 'new');
  const rows = []; let fail = 0;
  const cmp = (name, x, y, z) => { const same = JSON.stringify(x.info) === JSON.stringify(z.info), px = L.pngDiff(x.shot, z.shot), noise = L.pngDiff(x.shot, y.shot);
    const ok = same && px <= noise; if (!ok) fail++; rows.push({ name, ok, info: z.info, baseInfo: same ? undefined : x.info, pixelsDiffer: px, baseAgainstBase: noise }); console.log(`[${ok ? 'PASS' : 'FAIL'}] ${name}: pixels differing ${px} (base/base ${noise}), state ${same ? 'same' : 'DIFFERENT ' + JSON.stringify(x.info) + ' vs ' + JSON.stringify(z.info)}`); };
  for (const k of Object.keys(a.spots)) cmp('spot ' + k, a.spots[k], a2.spots[k], b.spots[k]);
  if (a.entry && b.entry) cmp('real entry sunkenCellar', a.entry, a2.entry, b.entry); else { fail++; console.log('[FAIL] real entry: no landmark'); }
  const far = (p, q) => p.length !== q.length ? 1e9 : Math.max(0, ...p.map((v, i) => typeof v[0] === 'string' || typeof q[i][0] === 'string' ? (JSON.stringify(v) === JSON.stringify(q[i]) ? 0 : 1e9) : Math.hypot(v[0] - q[i][0], v[1] - q[i][1])));
  for (const k of Object.keys(a.push)) { const d = far(a.push[k], b.push[k]), noise = far(a.push[k], a2.push[k]); const ok = d <= Math.max(4, 2 * noise); if (!ok) fail++;
    rows.push({ name: 'push ' + k, ok, px: d, baseAgainstBase: noise, base: a.push[k], now: b.push[k] }); console.log(`[${ok ? 'PASS' : 'FAIL'}] push ${k}: she is stopped within ${d.toFixed(1)} px of the base (base/base ${noise.toFixed(1)})`); }
  if (b.errors > a.errors) { fail++; console.log(`[FAIL] errors: ${b.errors} against base ${a.errors}`); }
  fs.writeFileSync(path.join(L.OUT, 'act1_dungeon_identity.json'), JSON.stringify(rows, null, 1));
  console.log(`act1_dungeon_identity: ${rows.length} checks, ${fail} FAIL`); process.exit(fail ? 1 : 0);
})();
