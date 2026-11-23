'use strict';
// Calibration: how many encounter rolls (EncounterManager.onStep calls) does REAL walking make per cell?
// The harness assumes one roll per cell entered (dq-tiles.js calls scene.onStep() when the hero's cell changes).
const fs = require('fs'), path = require('path');
process.env.PROBE_URL = process.env.PROBE_URL || 'http://127.0.0.1:5500/'; process.env.PROBE_OUT = '/home/user/work/honest/probe-out';
const L = require('../../acts/probe/lib.cjs');
(async () => {
  const st = JSON.parse(fs.readFileSync(path.join(__dirname, 'newgame', 'g3.json'), 'utf8'));
  const o = await L.launch(); const page = o.page;
  try {
    await L.bootSave(page, { version: 4, timestamp: Date.now(), player: { ...st, position: { mapId: 'overworld', x: 69, y: 256, floor: 1 } }, playtime: 0, quizStats: {} }, { settle: 2500 });
    await page.evaluate(() => { const em = window.__GAME_STATE__.encounterManager; window.__CAL = { n: 0, zones: {}, dungeon: [] }; em.onStep = function (z) { window.__CAL.n++; window.__CAL.zones[z] = (window.__CAL.zones[z] || 0) + 1; window.__CAL.dungeon.push(this.isDungeon); return null; }; });
    const p0 = await L.pos(page);
    const legs = [[[69, 262]], [[75, 262]], [[75, 268], [81, 268]]]; const rows = [];
    for (const cells of legs) { const a = await L.pos(page), n0 = await page.evaluate(() => window.__CAL.n); const r = await L.walkCells(page, cells, { maxMs: 25000 }); await page.waitForTimeout(300); const b = await L.pos(page), n1 = await page.evaluate(() => window.__CAL.n);
      rows.push({ from: [a.x, a.y], to: [b.x, b.y], manhattan: Math.abs(a.x - b.x) + Math.abs(a.y - b.y), rolls: n1 - n0, walk: r.why }); }
    console.log(JSON.stringify({ start: [p0.x, p0.y], rows, cal: await page.evaluate(() => ({ n: window.__CAL.n, zones: window.__CAL.zones, anyDungeon: window.__CAL.dungeon.some(Boolean) })) }, null, 1));
    console.log('errors', JSON.stringify(o.errors.slice(0, 3)));
  } finally { await o.browser.close(); }
})().catch(e => { console.error('FATAL', e); process.exit(1); });
