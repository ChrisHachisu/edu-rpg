'use strict';
// Phone screenshots of the testers' Jump menu (EN, kana, kanji) and two landings, as JPEG.
//   NODE_PATH=/opt/node-tools/node_modules PROBE_URL=http://127.0.0.1:5505/ node scripts/auto/jump/shots.cjs <outDir>
const fs = require('fs'), path = require('path'), os = require('os');
process.env.PROBE_OUT = process.env.PROBE_OUT || path.join(os.tmpdir(), 'qok-jump-shots');
const L = require('../../acts/probe/lib.cjs');
const DATA = JSON.parse(fs.readFileSync(path.join(__dirname, '../../../public/acts-hifi/jump-points.json'), 'utf8'));
const OUT = process.argv[2] || path.join(os.tmpdir(), 'qok-jump-shots');
fs.mkdirSync(OUT, { recursive: true });
const snap = (page, n) => page.screenshot({ path: path.join(OUT, n + '.jpg'), type: 'jpeg', quality: 85 });
async function tap(page, sel) { const l = page.locator(sel).first(); await l.waitFor({ state: 'visible', timeout: 15000 }); await l.scrollIntoViewIfNeeded(); await l.tap(); await page.waitForTimeout(700); }
async function settings(page) { await page.evaluate(() => { try { window.__GAME_STATE__.encounterManager.onStep = () => null; } catch (e) {} }); await tap(page, '#fieldTabs [data-fi="3"]'); await page.waitForSelector('#qok-ui [data-act="jumpOpen"]', { timeout: 10000 }); await page.waitForTimeout(500); }
async function landed(page, map) {
  await page.waitForFunction(m => { const g = window.__PHASER_GAME__, w = g.scene.getScene('WorldMapScene'), c = window.__QOK_COVER__; return w && g.scene.isActive('WorldMapScene') && w.currentMapId === m && (!c || c.phase() === 'active'); }, map, { timeout: 60000 });
  await page.waitForTimeout(4000);
}
(async () => {
  const o = await L.launch({ dpr: 2 }); const page = o.page;
  try {
    for (const [tag, locale, kanji] of [['en', 'en', false], ['ja-kana', 'ja', false], ['ja-kanji', 'ja', true]]) {
      const s = L.save({ mapId: 'overworld', x: 69, y: 256, locale, kanjiMode: kanji }); s.player.name = tag === 'en' ? 'Chris' : 'クリス'; s.player.level = 7;
      await L.bootSave(page, s, { settle: 1500 });
      await settings(page); await snap(page, `${tag}-1-settings`);
      await tap(page, '#qok-ui [data-act="jumpOpen"]'); await page.waitForSelector('#qok-ui [data-act="jumpAct"]', { timeout: 15000 }); await snap(page, `${tag}-2-acts`);
      await tap(page, '#qok-ui [data-act="jumpAct"][data-i="1"]'); await snap(page, `${tag}-3-act2`);
      // Storm Nest is the third place of Act 2 (town, dungeon, dungeon)
      const i = DATA.acts[1].places.findIndex(p => p.id === 'stormNest');
      await tap(page, `#qok-ui [data-act="jumpPlace"][data-i="${i}"]`); await snap(page, `${tag}-4-stormnest`);
      if (tag === 'en') { await tap(page, '#qok-ui [data-act="jumpPoint"][data-i="3"]'); await landed(page, 'stormNest'); await snap(page, 'en-5-landed-stormnest-3f'); }
      if (tag === 'ja-kanji') {
        await tap(page, '#qok-ui [data-act="jumpBack"]'); await tap(page, '#qok-ui [data-act="jumpBack"]');
        await tap(page, '#qok-ui [data-act="jumpAct"][data-i="3"]'); await snap(page, `${tag}-5-act4`);
        const c = DATA.acts[3].places.findIndex(p => p.id === 'cinderwatch');
        await tap(page, `#qok-ui [data-act="jumpPlace"][data-i="${c}"]`); await landed(page, 'embersRest'); await snap(page, `${tag}-6-landed-cinderwatch`);
      }
    }
    console.log('errors', JSON.stringify(o.errors.filter(e => !/favicon|audio/i.test(e.m)).slice(0, 5)));
  } finally { await o.browser.close(); }
})().catch(e => { console.error(e); process.exit(1); });
