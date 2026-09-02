#!/usr/bin/env node
/* verify_title_overwrite_confirm.cjs -- "New Game" with a save on the device must ASK before it
 * erases anything. Found by the 2026-09-02 playthrough census: the frozen bundle has no overwrite
 * confirm (src/scenes/TitleScene.ts has one; dist/assets/index-*.js carries no title.overwrite key),
 * so New Game went straight to character creation. Drives the real DOM title (ui-overhaul.js) in
 * the phone context and asserts on what the screen shows.
 *   node scripts/verify_title_overwrite_confirm.cjs [url]      (default http://127.0.0.1:5179/)
 * Refutation: against a pre-fix dist it FAILS at check 1 (no confirm card, mode already 'create'). */
const path = require('path');
let chromium; try { ({ chromium } = require('playwright-core')); } catch (e) {
  ({ chromium } = require(path.join(__dirname, '..', '.eduharness', 'node_modules', 'playwright-core'))); }
const URL_ = process.argv[2] || 'http://127.0.0.1:5179/';
const SAVE = { version: 4, timestamp: 1754500000000, player: { name: 'Perf', heroColor: 'gray', level: 5, exp: 0, expToNext: 100, hp: 40, maxHp: 40, atk: 15, def: 5, spd: 6, equipment: { weapon: null, armor: null, shield: null, helmet: null, accessory: null }, inventory: [{ itemId: 'herb', quantity: 3 }], gold: 200, position: { mapId: 'overworld', x: 69, y: 256, floor: 1 }, storyFlags: {}, activeQuests: [], completedQuests: [], questProgress: {}, timerEnabled: true, quizDifficulty: '3', locale: 'en', soundEnabled: false, masterVolume: 0, kanjiMode: false }, playtime: 0, quizStats: {} };
let fails = 0;
const check = (name, ok, detail) => { console.log((ok ? 'PASS ' : 'FAIL ') + name + (detail ? '  -- ' + detail : '')); if (!ok) fails++; };
(async () => {
  const browser = await chromium.launch({ headless: true, channel: 'chrome', args: ['--mute-audio'] });
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, hasTouch: true, isMobile: true });
  const page = await ctx.newPage();
  await page.addInitScript(() => { window.Capacitor = { isNativePlatform: () => true }; });
  for (const locale of ['en', 'ja']) {
    await page.goto(URL_, { waitUntil: 'domcontentloaded', timeout: 120000 });
    await page.evaluate((s) => localStorage.setItem('edu-rpg-save', JSON.stringify(s)), { ...SAVE, player: { ...SAVE.player, locale } });
    await page.reload({ waitUntil: 'load', timeout: 120000 });
    await page.waitForFunction(() => !!window.__PHASER_GAME__, { timeout: 120000 });
    await page.evaluate(() => { const g = window.__PHASER_GAME__; if (g.scene.isActive('BootScene')) { g.scene.start('TitleScene'); g.scene.stop('BootScene'); } });
    await page.waitForFunction(() => { const g = window.__PHASER_GAME__, t = g && g.scene.getScene('TitleScene'); return t && g.scene.isActive('TitleScene') && t.menuItems && t.menuItems.length > 0; }, { timeout: 120000 });
    await page.waitForFunction(() => { const c = window.__QOK_COVER__; return !c || c.phase() !== 'boot'; }, { timeout: 60000 }).catch(() => {});
    await page.waitForSelector('[data-act="titleNew"]', { timeout: 60000 });
    const mode0 = await page.evaluate(() => window.__PHASER_GAME__.scene.getScene('TitleScene').mode);
    await page.tap('[data-act="titleNew"]');
    await page.waitForTimeout(600);
    const st1 = await page.evaluate(() => ({ conf: !!document.querySelector('.shopconf [data-act="titleNewConfirm"]'), mode: window.__PHASER_GAME__.scene.getScene('TitleScene').mode, text: (document.querySelector('.shopconf .scene-h') || {}).textContent || '' }));
    check(locale + ': New Game with a save shows the confirm card and stays on the title', st1.conf && st1.mode === mode0, JSON.stringify(st1));
    if (st1.conf) {
      await page.screenshot({ path: `/private/tmp/claude-501/perf/shots/title-overwrite-${locale}.png` });
      await page.tap('[data-act="titleNewCancel"].btn');
      await page.waitForTimeout(400);
      const st2 = await page.evaluate(() => ({ conf: !!document.querySelector('.shopconf'), mode: window.__PHASER_GAME__.scene.getScene('TitleScene').mode, newBtn: !!document.querySelector('[data-act="titleNew"]') }));
      check(locale + ': Cancel closes the card and keeps the title with New Game still offered', !st2.conf && st2.mode === mode0 && st2.newBtn, JSON.stringify(st2));
      await page.tap('[data-act="titleNew"]'); await page.waitForTimeout(400);
      await page.tap('[data-act="titleNewConfirm"]');
      await page.waitForFunction(() => window.__PHASER_GAME__.scene.getScene('TitleScene').mode !== 'title', { timeout: 20000 }).catch(() => {});
      const st3 = await page.evaluate(() => ({ mode: window.__PHASER_GAME__.scene.getScene('TitleScene').mode, conf: !!document.querySelector('.shopconf') }));
      check(locale + ': Start over proceeds to character creation', st3.mode !== mode0 && !st3.conf, JSON.stringify(st3));
    }
    // Keyboard path: the frozen TitleScene confirms on Enter/Space/Z on its own keydown. With a save and
    // New Game selected, Enter must open the card (not erase), Escape must close it.
    await page.goto(URL_, { waitUntil: 'domcontentloaded', timeout: 120000 });
    await page.evaluate((s) => localStorage.setItem('edu-rpg-save', JSON.stringify(s)), { ...SAVE, player: { ...SAVE.player, locale } });
    await page.reload({ waitUntil: 'load', timeout: 120000 });
    await page.waitForFunction(() => !!window.__PHASER_GAME__, { timeout: 120000 });
    await page.evaluate(() => { const g = window.__PHASER_GAME__; if (g.scene.isActive('BootScene')) { g.scene.start('TitleScene'); g.scene.stop('BootScene'); } });
    await page.waitForSelector('[data-act="titleNew"]', { timeout: 120000 });
    await page.waitForFunction(() => { const c = window.__QOK_COVER__; return !c || c.phase() !== 'boot'; }, { timeout: 60000 }).catch(() => {});
    await page.evaluate(() => { const t = window.__PHASER_GAME__.scene.getScene('TitleScene'); const i = t.menuItems.findIndex((m) => m.getData && m.getData('action') === 'new'); t.selectedIndex = i; if (t.updateSelection) t.updateSelection(); });
    const km0 = await page.evaluate(() => window.__PHASER_GAME__.scene.getScene('TitleScene').mode);
    await page.keyboard.press('Enter'); await page.waitForTimeout(500);
    const k1 = await page.evaluate(() => ({ conf: !!document.querySelector('.shopconf [data-act="titleNewConfirm"]'), mode: window.__PHASER_GAME__.scene.getScene('TitleScene').mode }));
    check(locale + ': keyboard Enter on New Game with a save opens the card instead of erasing', k1.conf && k1.mode === km0, JSON.stringify(k1));
    await page.keyboard.press('Escape'); await page.waitForTimeout(400);
    const k2 = await page.evaluate(() => ({ conf: !!document.querySelector('.shopconf'), mode: window.__PHASER_GAME__.scene.getScene('TitleScene').mode }));
    check(locale + ': Escape closes the card and keeps the title', !k2.conf && k2.mode === km0, JSON.stringify(k2));
  }
  // No save: New Game must NOT ask.
  await page.goto(URL_, { waitUntil: 'domcontentloaded', timeout: 120000 });
  await page.evaluate(() => localStorage.removeItem('edu-rpg-save'));
  await page.reload({ waitUntil: 'load', timeout: 120000 });
  await page.waitForFunction(() => !!window.__PHASER_GAME__, { timeout: 120000 });
  await page.evaluate(() => { const g = window.__PHASER_GAME__; if (g.scene.isActive('BootScene')) { g.scene.start('TitleScene'); g.scene.stop('BootScene'); } });
  await page.waitForSelector('[data-act="titleNew"]', { timeout: 120000 });
  await page.waitForFunction(() => { const c = window.__QOK_COVER__; return !c || c.phase() !== 'boot'; }, { timeout: 60000 }).catch(() => {});
  const m0 = await page.evaluate(() => window.__PHASER_GAME__.scene.getScene('TitleScene').mode);
  await page.tap('[data-act="titleNew"]');
  await page.waitForFunction((m) => window.__PHASER_GAME__.scene.getScene('TitleScene').mode !== m, m0, { timeout: 20000 }).catch(() => {});
  const st4 = await page.evaluate(() => ({ mode: window.__PHASER_GAME__.scene.getScene('TitleScene').mode, conf: !!document.querySelector('.shopconf') }));
  check('no save: New Game goes straight on without a confirm', st4.mode !== m0 && !st4.conf, JSON.stringify(st4));
  await browser.close();
  console.log(fails ? `TITLE OVERWRITE CONFIRM: ${fails} FAIL` : 'TITLE OVERWRITE CONFIRM: ALL PASS');
  process.exit(fails ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(2); });
