'use strict';
// Exploration: real New Game for a grade through the phone's own title path; dump the game's own start record.
const fs = require('fs');
process.env.PROBE_URL = process.env.PROBE_URL || 'http://127.0.0.1:5500/';
process.env.PROBE_OUT = process.env.PROBE_OUT || '/home/user/work/honest/probe-out';
const L = require('../../acts/probe/lib.cjs');
(async () => {
  const grade = process.argv[2] || '1';
  const o = await L.launch(); const page = o.page;
  try {
    await page.goto(L.URL_, { waitUntil: 'domcontentloaded' }); await page.evaluate(() => localStorage.clear()); await page.reload({ waitUntil: 'load' });
    await L.toTitle(page);
    await page.waitForSelector('[data-act="titleSlots"], [data-act="titleNew"]', { state: 'visible', timeout: 60000 });
    if (await page.locator('[data-act="titleSlots"]').count()) { await page.click('[data-act="titleSlots"]'); await page.click('[data-act="slotPick"][data-i="1"]'); }
    else await page.locator('[data-act="titleNew"]').click();
    await page.waitForSelector('[data-act="introStart"]', { timeout: 20000 });
    const name = page.locator('#qok-name'); if (await name.count()) await name.fill('Mika');
    const grades = await page.evaluate(() => { const ts = window.__PHASER_GAME__.scene.getScene('TitleScene'); return { opts: ts.difficultyOptions, idx: ts.difficultyIndex, chips: [...document.querySelectorAll('[data-act="introGrade"]')].map(e => e.getAttribute('data-i') + ':' + e.textContent.trim()) }; });
    console.log('grades', JSON.stringify(grades));
    const gi = grades.opts.indexOf(grade);
    // The grade wheel is a drag picker; a synthetic tap on a row did not move it in this harness (2026-11-23), so the
    // row is set on the scene and Start is confirmed in the same task (the bundle reads difficultyIndex on Start).
    await page.evaluate(i => { const ts = window.__PHASER_GAME__.scene.getScene('TitleScene'); ts.difficultyIndex = i; ts.createRow = 'start'; ts.confirmCreate(); }, gi);
    await page.waitForFunction(() => window.__PHASER_GAME__ && window.__PHASER_GAME__.scene.isActive('WorldMapScene'), { timeout: 60000 });
    await page.waitForTimeout(3000);
    const st = await page.evaluate(() => { const gs = window.__GAME_STATE__; return { state: gs.player.state, tot: [gs.player.totalAtk, gs.player.totalDef, gs.player.totalMaxHp], encMult: gs.encounterManager.encounterRateMultiplier, qd: gs.quizManager.difficulty, globals: Object.keys(window).filter(k => k.startsWith('__')), qok: Object.keys(window.__QOK || {}), multi: Object.keys(window.__QOK_MULTIACT__ || {}) }; });
    console.log(JSON.stringify(st, null, 1));
    fs.writeFileSync(process.env.NEWGAME_OUT || `/home/user/work/honest/newgame-g${grade}.json`, JSON.stringify(st.state));
    console.log('errors', JSON.stringify(o.errors.slice(0, 5)));
  } finally { await o.browser.close(); }
})().catch(e => { console.error('FATAL', e); process.exit(1); });
