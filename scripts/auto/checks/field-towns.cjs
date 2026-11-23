'use strict';
// Towns in the running game (census 2026-11-23 findings m2, M16, m3 and the Port Sapphire exit nit).
// Every town is entered the census way: a save seeded on the overworld door's exit cell, Continue,
// a real walk into the door; people and spots are then reached with the playthrough town walker.
//   m2   arrival framing: at most 4% of the screen between the plate and the tab bar is black void
//        (unfixed: 8-15%), she stands clear of the tab bar, and at Port Sapphire (north gate) she is
//        not up against the HUD panels (her feet at least 200 CSS px from the top).
//   M16  after walking up to a person, the hero's feet are at least 20 world px from theirs when she
//        is below them, or 13 px when beside them (unfixed: 11 px, the sprites stacked).
//   m3   Port Sapphire: walking up to the wise woman offers "Talk to ..." and the talk key opens her
//        words, not the save; the save point by the well still offers Save.
//   nit  leaving Port Sapphire puts her on the overworld clear of the town's icon (unfixed: on it).
// FIELD_OUT/town-<id>-<what>-<port>.png are the frames.
//   node scripts/auto/checks/field-towns.cjs [townId ...]   (default greenhollow ironkeep portSapphire)
const fs = require('fs'), path = require('path');
const F = require('./field-lib.cjs');
const ptsrc = fs.readFileSync(path.join(F.ROOT, 'scripts/acts/probe/playthrough/ptlib.cjs'), 'utf8');
const HELP = ptsrc.slice(ptsrc.indexOf('const HELP = () => {') + 'const HELP = '.length, ptsrc.indexOf('\nclass Session'));
const A1 = (() => { const src = fs.readFileSync(path.join(F.ROOT, 'public/act1-world-map.js'), 'utf8'), m = /var LANDMARKS = (\[.*?\]);/.exec(src);
  return JSON.parse(m[1]).map(l => ({ id: l.mapId, at: [l.at.x, l.at.y], exit: [l.exit.x, l.exit.y], tile: l.tile })); })();
const ACTS = JSON.parse(fs.readFileSync(path.join(F.ROOT, 'public/acts-hifi/manifest.json'), 'utf8')).landmarks.map(l => ({ id: l.virtual || l.mapId, at: l.at, exit: l.exit, tile: l.tile }));
const DOORS = A1.concat(ACTS).filter(l => l.tile === 6);
const TALK = { greenhollow: 'elder', ironkeep: 'blacksmith', portSapphire: 'wisewoman', millbrook: 'sage', frostwatch: 'frostElder', oasisHaven: 'oasisElder' };
const port = new URL(F.URL_).port;
const inject = page => page.evaluate(`(${HELP.trim().replace(/;\s*$/, '')})()`);
const T = page => page.evaluate(() => window.__PTH.town());
async function townDismiss(page) {
  for (let i = 0; i < 24; i++) {
    const m = await page.evaluate(() => { const w = window.__PHASER_GAME__.scene.getScene('WorldMapScene'); const f = document.querySelector('#act1-hifi-preserved-root iframe');
      const d = f && f.contentWindow.document.querySelector('#dialogue'); return !!(w && w.showingMessage) || !!(d && d.dataset.open === 'true'); }).catch(() => false);
    if (!m) return; if (i % 2) await page.keyboard.press('z'); else await page.evaluate(() => window.__PTH.pressTalk()); await page.waitForTimeout(350);
  }
}
// framing of the town view: hero on screen (CSS px), tab bar top, black rows between plate and tab bar
async function framing(page, file) {
  const s = await page.evaluate(() => { const f = document.querySelector('#act1-hifi-preserved-root iframe'), t = f.contentWindow.__ACT1_TOWN__, p = t.position(), c = t.camera;
    const tabs = document.getElementById('fieldTabs'), r = tabs && tabs.getBoundingClientRect();
    return { heroY: (p.y - c.y) * c.zoom, heroX: (p.x - c.x) * c.zoom, tabTop: r && r.height > 0 ? r.top : innerHeight, H: innerHeight, W: innerWidth }; });
  const img = await F.grab(page, file), k = img.w / s.W;
  let black = 0, rows = 0;
  for (let y = Math.round(s.H * 0.3 * k); y < Math.round(s.tabTop * k) - 2; y++) {        // the lower 70% of the view, down to the tab bar
    let dark = 0, n = 0; for (let x = 0; x < img.w; x += 3) { const q = F.px(img, x, y); if (q[0] + q[1] + q[2] < 36) dark++; n++; }
    rows++; if (dark / n >= 0.6) black++;                                               // the joystick ring may cross a void row
  }
  s.voidPct = +(100 * black / (s.H * k)).toFixed(1);
  return s;
}
(async () => {
  const want = process.argv.slice(2).length ? process.argv.slice(2) : ['greenhollow', 'ironkeep', 'portSapphire'];
  const { browser, page } = await F.L.launch({ dpr: +(process.env.FIELD_DPR || 1) });
  for (const id of want) {
    const d = DOORS.find(l => l.id === id); if (!d) { F.ok(false, `${id}: no door`); continue; }
    try {
      const s = F.L.save({ mapId: 'overworld', x: d.exit[0], y: d.exit[1], flags: { ...F.L.allFlags(), ...F.ALLB }, inventory: F.INV, completedQuests: F.QUESTS });
      s.player.name = 'Mika';
      await F.L.bootSave(page, s);
      const w = await F.L.walkCells(page, [d.at], { maxMs: 25000 });
      await page.waitForFunction(() => { const f = document.querySelector('#act1-hifi-preserved-root iframe'); return !!(f && f.contentWindow && f.contentWindow.__ACT1_TOWN__); }, { timeout: 40000 }).catch(() => {});
      await page.waitForTimeout(3500); await inject(page);
      const t = await T(page);
      if (!F.ok(t && t.id === id, `${id}: entered by walking into the door`, `walk ${w.why}, town ${t && t.id}`)) continue;
      // ---- m2: arrival framing (before anything is dismissed: this is the first view)
      const fr = await framing(page, path.join(F.OUT, `town-${id}-entry-${port}.png`));
      F.info(`${id} arrival framing`, JSON.stringify(fr));
      F.ok(fr.voidPct <= 4, `${id}: arrival view is filled by the town (no void band above the tab bar)`, `${fr.voidPct}% of the screen is black void`);
      F.ok(fr.heroY <= fr.tabTop - 100 && fr.heroY >= 200, `${id}: she arrives clear of the tab bar and of the HUD panels`, `feet at ${Math.round(fr.heroY)} CSS px, tab bar at ${Math.round(fr.tabTop)}`);
      await townDismiss(page);
      if (id === 'portSapphire') {                                       // m3: the save point by the well
        const sp = await page.evaluate(() => { const f = document.querySelector('#act1-hifi-preserved-root iframe'); return f.contentWindow.__ACT1_TOWN__.town.savePoint; });
        const r = await page.evaluate(([x, y]) => window.__PTH.walkToCell(x, y, 0.6), sp); await page.waitForTimeout(600);
        const p2 = await page.evaluate(() => { const f = document.querySelector('#act1-hifi-preserved-root iframe'), e = f.contentWindow.document.querySelector('#prompt'); return e && e.dataset.show === 'true' ? e.textContent : null; });
        F.ok(p2 === 'Save' || /セーブ/.test(p2 || ''), 'portSapphire: the save point still offers Save', `walk ${r.why}, prompt "${p2}"`);
        await townDismiss(page);
      }
      // ---- M16 / m3: walk up to a person
      const who = TALK[id] || (t.npcs.find(n => !/healer|shopkeeper/.test(n.id)) || t.npcs[0]).id;
      // a child walks straight up to them from below: stand 2.2 cells under their feet, then push up
      const t0 = await T(page), n0 = t0.npcs.find(q => q.id === who);
      let g = await page.evaluate(([x, y]) => window.__PTH.walkToCell(x, y, 0.35), [n0.x / t0.c, n0.y / t0.c + 2.2]);
      if (g.ok) { await page.evaluate(() => window.__PTH.setKeys(['ArrowUp'])); await page.waitForTimeout(300); await page.evaluate(() => window.__PTH.setKeys([])); }
      else g = await page.evaluate(n => window.__PTH.walkToNpc(n), who);
      await page.waitForTimeout(500);
      const t2 = await T(page), n = t2.npcs.find(q => q.id === who), dx = t2.x - n.x, dy = t2.y - n.y;
      const prompt = await page.evaluate(() => { const f = document.querySelector('#act1-hifi-preserved-root iframe'), e = f.contentWindow.document.querySelector('#prompt'); return e && e.dataset.show === 'true' ? e.textContent : null; });
      await page.screenshot({ path: path.join(F.OUT, `town-${id}-npc-${who}-${port}.png`) });
      const beside = (dy > 0 && Math.hypot(dx, dy) >= 20) || (Math.abs(dx) >= 13);
      F.ok(beside, `${id}: walking up to ${who}, she stops beside them, not on them`, `walk ${g.why}; her feet ${dx.toFixed(1)},${dy.toFixed(1)} world px from theirs`);
      F.ok(prompt && !/^Save$|^Shop$/.test(prompt), `${id}: the prompt next to ${who} offers the talk`, `prompt "${prompt}"`);
      await page.evaluate(() => window.__PTH.clear()); await page.evaluate(() => window.__PTH.pressTalk()); await page.waitForTimeout(1500);
      const said = await page.evaluate(() => { const f = document.querySelector('#act1-hifi-preserved-root iframe'), dl = f.contentWindow.document.querySelector('#dialogue');
        const w = window.__PHASER_GAME__.scene.getScene('WorldMapScene');
        return { log: window.__PTH.log().map(m => m.t.slice(0, 80)), box: dl && dl.dataset.open === 'true' ? dl.textContent.slice(0, 80) : null, msg: w && w.showingMessage && w.messageText ? String(w.messageText.text).slice(0, 80) : null }; });
      const saved = [...said.log, said.box || '', said.msg || ''].some(x => /saved|セーブ/i.test(x));
      F.ok((said.log.length || said.box || said.msg) && !saved, `${id}: the talk key next to ${who} opens their words`, JSON.stringify(said).slice(0, 220));
      await townDismiss(page);
      if (id === 'portSapphire') {
        // ---- nit: the walk out through the north gate
        const ex = await page.evaluate(() => { const f = document.querySelector('#act1-hifi-preserved-root iframe'); return f.contentWindow.__ACT1_TOWN__.town.exit.cell; });
        await townDismiss(page);
        const xw = await page.evaluate(([x, y]) => window.__PTH.walkToCell(x, y + 0.8, 0.6), ex);
        const xs = await page.evaluate(() => { const w = window.__PHASER_GAME__.scene.getScene('WorldMapScene'); const t = window.__PTH.town(); return { msg: !!w.showingMessage, at: t && [+t.cx.toFixed(1), +t.cy.toFixed(1)], pd: document.body.dataset.parentDialogue || null }; });
        await page.evaluate(() => window.__PTH.setKeys(['ArrowUp'])); await page.waitForTimeout(2500); await page.evaluate(() => window.__PTH.setKeys([]));
        await page.waitForFunction(() => { const w = window.__PHASER_GAME__.scene.getScene('WorldMapScene'); return w && w.currentMapId === 'overworld' && !document.querySelector('#act1-hifi-preserved-root:not([hidden]) iframe'); }, { timeout: 20000 }).catch(() => {});
        await page.waitForTimeout(2500);
        const o = await page.evaluate(() => { const w = window.__PHASER_GAME__.scene.getScene('WorldMapScene'); let icon = null;
          const walk = list => { for (const c of list) { if (c.list) walk(c.list); if (c.texture && /port-sapphire/.test(c.texture.key) && c.getBounds) { const b = c.getBounds(); icon = [b.x, b.y, b.width, b.height]; } } };
          walk(w.children.list); const hb = w.hero.getBounds();
          return { map: w.currentMapId, cell: [w.heroTileX, w.heroTileY], feet: hb.bottom, icon }; });
        await page.screenshot({ path: path.join(F.OUT, `ow-gate-portSapphire-${port}.png`) });
        F.ok(o.map === 'overworld' && o.icon && o.feet < o.icon[1] + 12, 'portSapphire: walking out puts her on the overworld clear of the town icon', JSON.stringify({ ...o, walk: xw.why, before: xs }));
      }
    } catch (e) { F.ok(false, `${id}: town check ran`, String(e).slice(0, 220)); }
  }
  await browser.close();
  F.done('field-towns');
})().catch(e => { console.error('CRASH', e); process.exit(1); });
