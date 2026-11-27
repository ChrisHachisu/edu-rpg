'use strict';
// Smoke test of the in-page fight driver: a few real fights on the New Game record.
const fs = require('fs'), path = require('path');
process.env.PROBE_URL = process.env.PROBE_URL || 'http://127.0.0.1:5500/'; process.env.PROBE_OUT = '/home/user/work/honest/probe-out';
const L = require('../../acts/probe/lib.cjs');
const INPAGE = fs.readFileSync(path.join(__dirname, 'inpage.js'), 'utf8');
(async () => {
  const grade = process.argv[2] || 'g1', list = (process.argv[3] || 'slime,slime,wolf,wolf,bat,mushroom').split(',');
  const st = JSON.parse(fs.readFileSync(path.join(__dirname, 'newgame', grade + '.json'), 'utf8'));
  const o = await L.launch(); const page = o.page;
  try {
    await L.bootSave(page, { version: 4, timestamp: Date.now(), player: { ...st, position: { mapId: 'overworld', x: 69, y: 256, floor: 1 } }, playtime: 0, quizStats: {} }, { settle: 1500 });
    await page.evaluate(() => { delete window.__GAME_STATE__.encounterManager.onStep; });
    await page.evaluate(INPAGE);
    await page.evaluate(c => window.__HON.init(c), { seed: 42, profile: { g1: { p: 0.7, t: 6 }, g3: { p: 0.8, t: 4 }, g6: { p: 0.9, t: 3 } }[grade] });
    console.log('zone at Greenhollow door', await page.evaluate(() => [window.__GAME_STATE__.getOverworldZone(69, 256), window.__GAME_STATE__.getOverworldZone(60, 340), window.__GAME_STATE__.getOverworldZone(39, 345), window.__GAME_STATE__.getOverworldZone(133, 348), window.__GAME_STATE__.getOverworldZone(209, 321), window.__GAME_STATE__.getOverworldZone(200, 99), window.__GAME_STATE__.getOverworldZone(257, 43), window.__GAME_STATE__.getOverworldZone(118, 37)]));
    for (const m of list) { const t = Date.now(); const f = await page.evaluate(m => window.__HON.fight(m, 'whispering-woods'), m); console.log(JSON.stringify(f), Date.now() - t, 'ms'); if (f.res === 'loss') await page.evaluate(() => window.__HON.defeatRule()); }
    console.log(JSON.stringify(await page.evaluate(() => window.__HON.status())));
    console.log('errors', JSON.stringify(o.errors.slice(0, 5)));
  } finally { await o.browser.close(); }
})().catch(e => { console.error('FATAL', e); process.exit(1); });
