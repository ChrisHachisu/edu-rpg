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
const REPS = +process.env.PUSH_REPS || 3;                  // pushes per direction and run (the glide along a curved wall is timing noise)
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
    let fired = false;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) for (let rep = 0; rep < REPS && !fired; rep++) {   // into the wall and held there: where she is stopped, not how fast she got there
      await page.evaluate(h => { const w = window.__PHASER_GAME__.scene.getScene('WorldMapScene'); w.hero.x = h.hx; w.hero.y = h.hy; w.heroTileX = h.x; w.heroTileY = h.y; }, home);
      await page.evaluate(async ([dx, dy]) => { const w = window.__PHASER_GAME__.scene.getScene('WorldMapScene'), m0 = w.currentMapId, f0 = w.currentFloor, t0 = performance.now(); let still = 0, lx = w.hero.x, ly = w.hero.y;
        try { while (performance.now() - t0 < 9000 && still < 40 && w.currentMapId === m0 && w.currentFloor === f0) {      // held until she has come to rest, not for a fixed time
          window.__DQ_STICK__ = { x: dx, y: dy, m: 1 }; await new Promise(r => requestAnimationFrame(r));
          still = (Math.abs(w.hero.x - lx) + Math.abs(w.hero.y - ly) < 0.02) ? still + 1 : 0; lx = w.hero.x; ly = w.hero.y; } } finally { window.__DQ_STICK__ = { x: 0, y: 0, m: 0 }; } }, [dx, dy]);
      await page.waitForTimeout(250); const i = await info(page); const e = i.map === home.map && i.floor === home.floor ? [i.hx, i.hy] : [i.map, i.floor];
      (ends[ends.length - 1] && ends[ends.length - 1].dir === dx + ',' + dy ? ends[ends.length - 1] : (ends[ends.length] = Object.assign([], { dir: dx + ',' + dy }))).push(e);
      if (i.map !== home.map || i.floor !== home.floor) fired = true; }
    if (ends.length && typeof ends[ends.length - 1][0][0] === 'string') { /* a door fired: the walk stops here, as before */ }
    out.push[key] = ends.map(d => d.slice()); }
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
  // Per direction, every push of this build is compared with every push of the base (two base runs, REPS
  // pushes each). Held into a straight wall she stops within a few px of the same place (frame timing
  // moves the last step by up to ~5 px), so the tolerance there is 8 px, a sixth of a tile: a moved wall
  // is a whole collision cell or more. Held along a curved wall she glides, and where the glide ends depends on frame timing: the base
  // shows that by scattering its own stops, and a stop of this build inside that scatter is the base's
  // behaviour. A door that fires must fire on both.
  const dist = (u, v) => typeof u[0] === 'string' || typeof v[0] === 'string' ? (JSON.stringify(u) === JSON.stringify(v) ? 0 : 1e9) : Math.hypot(u[0] - v[0], u[1] - v[1]);
  for (const k of Object.keys(a.push)) {
    const dirs = []; let ok = a.push[k].length === b.push[k].length && a2.push[k].length === b.push[k].length;
    for (let i = 0; ok && i < b.push[k].length; i++) {
      const base = [...a.push[k][i], ...a2.push[k][i]], now = b.push[k][i];
      const spread = Math.max(0, ...base.map(u => Math.max(...base.map(v => dist(u, v)))).filter(x => x < 1e9));
      const off = Math.max(...now.map(u => Math.min(...base.map(v => dist(u, v)))));
      const dOk = off <= Math.max(8, spread); dirs.push({ off: +off.toFixed(1), spread: +spread.toFixed(1), ok: dOk }); if (!dOk) ok = false; }
    if (!ok) fail++;
    rows.push({ name: 'push ' + k, ok, dirs, base: a.push[k], base2: a2.push[k], now: b.push[k] });
    console.log(`[${ok ? 'PASS' : 'FAIL'}] push ${k}: per direction, her stops lie within the base's own scatter (${dirs.map(d => d.off + '/' + Math.max(8, d.spread)).join(', ')} px)`); }
  if (b.errors > a.errors) { fail++; console.log(`[FAIL] errors: ${b.errors} against base ${a.errors}`); }
  fs.writeFileSync(path.join(L.OUT, 'act1_dungeon_identity.json'), JSON.stringify(rows, null, 1));
  console.log(`act1_dungeon_identity: ${rows.length} checks, ${fail} FAIL`); process.exit(fail ? 1 : 0);
})();
