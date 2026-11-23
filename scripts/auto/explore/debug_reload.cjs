'use strict';
// What does the page show after an in-game reload? Boot a save (slot table seeded), optionally
// hide/show, reload, and every 5 s for 40 s print the active scenes, the cover phase and the
// overlay buttons; screenshots in shots/debug/reload-*.jpg.
//   node scripts/auto/explore/debug_reload.cjs [mapId x y floor] [nohide]
const X = require('./xlib.cjs'), L = X.L, path = require('path');
(async () => {
  const a = process.argv.slice(2), [mapId, x, y, f] = a.length >= 3 ? a : ['overworld', 80, 262, 1];
  const S = await X.launchX(), page = S.page;
  await X.boot(page, L.save({ mapId, x: +x, y: +y, floor: +(f || 1), flags: L.allFlags() }), { slots: true });
  if (!a.includes('nohide')) { await X.hide(page, true); await page.waitForTimeout(800); await X.hide(page, false); }
  console.log('LS', JSON.stringify(await page.evaluate(() => Object.keys(localStorage).map(k => k + ':' + String(localStorage.getItem(k)).length))));
  await page.reload({ waitUntil: 'load' });
  for (let i = 0; i < 8; i++) {
    await page.waitForTimeout(5000);
    const s = await page.evaluate(() => { const g = window.__PHASER_GAME__, k = window.__QOK_COVER__;
      return { scenes: g ? g.scene.getScenes(true).map(s => s.scene.key) : null, cover: k ? k.phase() : null,
        acts: [...document.querySelectorAll('[data-act]')].filter(e => e.offsetParent).map(e => e.getAttribute('data-act')).slice(0, 12), text: (document.getElementById('qok-ui') || document.body).innerText.slice(0, 200) }; }).catch(e => ({ err: String(e) }));
    console.log(i, JSON.stringify(s));
    if (i % 3 === 0) await X.jpeg(page, path.join(X.OUTX, 'shots/debug'), 'reload-' + i);
  }
  console.log('ERRORS', JSON.stringify(S.errors.slice(0, 6)));
  await S.browser.close();
})();
