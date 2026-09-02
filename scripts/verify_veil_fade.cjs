#!/usr/bin/env node
/* verify_veil_fade.cjs -- the Act 1 loading veil (#a1a-loading-veil, dq-tiles.js) must LIFT with a
 * fade, not a display cut. Seen on the device video of a town exit 2026-09-02: black, then the dim
 * veil for ~1.5 s, then a one-frame pop to the overworld. Walks out of Greenhollow in the phone
 * context and samples the veil's computed opacity/display every animation frame from the swap until
 * the field is visible; PASS needs at least one sample with display:grid and 0 < opacity < 0.95
 * (the ramp) before display:none. On the build-70 dist the veil goes grid/1 -> none in one step.
 *   node scripts/verify_veil_fade.cjs [http://127.0.0.1:5179/] */
const path = require('path');
let chromium; try { ({ chromium } = require('playwright-core')); } catch (e) { ({ chromium } = require(path.join(__dirname, '..', '.eduharness', 'node_modules', 'playwright-core'))); }
const URL_ = process.argv[2] || 'http://127.0.0.1:5179/';
const SAVE = { version: 4, timestamp: 1754500000000, player: { name: 'Perf', heroColor: 'gray', level: 5, exp: 0, expToNext: 100, hp: 40, maxHp: 40, atk: 15, def: 5, spd: 6, equipment: { weapon: null, armor: null, shield: null, helmet: null, accessory: null }, inventory: [{ itemId: 'herb', quantity: 3 }], gold: 200, position: { mapId: 'overworld', x: 69, y: 256, floor: 1 }, storyFlags: { 'act1.townOpened.greenhollow': true }, activeQuests: [], completedQuests: [], questProgress: {}, timerEnabled: true, quizDifficulty: '3', locale: 'en', soundEnabled: false, masterVolume: 0, kanjiMode: false }, playtime: 0, quizStats: {} };
(async () => {
  const browser = await chromium.launch({ headless: true, channel: 'chrome', args: ['--enable-webgl', '--ignore-gpu-blocklist', '--mute-audio'] });
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, hasTouch: true, isMobile: true });
  const page = await ctx.newPage();
  await page.addInitScript(() => {
    window.Capacitor = { isNativePlatform: () => true };
    const KC = { ArrowUp: 38, ArrowDown: 40, ArrowLeft: 37, ArrowRight: 39 }; const VEC = { ArrowUp: [0, -1], ArrowDown: [0, 1], ArrowLeft: [-1, 0], ArrowRight: [1, 0] }; const held = {};
    function fire(type, key) { const ev = new KeyboardEvent(type, { key, code: key, bubbles: true }); Object.defineProperty(ev, 'keyCode', { get: () => KC[key] }); Object.defineProperty(ev, 'which', { get: () => KC[key] }); window.dispatchEvent(ev); }
    window.__perfSetDir = function (dir) { for (const k of Object.keys(KC)) { if (k === dir && !held[k]) { held[k] = 1; fire('keydown', k); } else if (k !== dir && held[k]) { delete held[k]; fire('keyup', k); } } window.__DQ_STICK__ = dir ? { x: VEC[dir][0], y: VEC[dir][1], m: 1 } : { x: 0, y: 0, m: 0 }; };
    // sample the veil every frame, always; the harness reads the slice it wants
    window.__veilLog = [];
    (function tick() { const v = document.getElementById('a1a-loading-veil'); if (v) { const cs = getComputedStyle(v); window.__veilLog.push([performance.now(), cs.display, cs.opacity]); } requestAnimationFrame(tick); })();
  });
  await page.goto(URL_, { waitUntil: 'domcontentloaded', timeout: 120000 });
  await page.evaluate((s) => localStorage.setItem('edu-rpg-save', JSON.stringify(s)), SAVE);
  await page.reload({ waitUntil: 'load', timeout: 120000 });
  await page.waitForFunction(() => !!window.__PHASER_GAME__, { timeout: 120000 });
  await page.evaluate(() => { const g = window.__PHASER_GAME__; if (g.scene.isActive('BootScene')) { g.scene.start('TitleScene'); g.scene.stop('BootScene'); } });
  await page.waitForFunction(() => { const g = window.__PHASER_GAME__, t = g && g.scene.getScene('TitleScene'); return t && g.scene.isActive('TitleScene') && t.menuItems && t.menuItems.length > 0; }, { timeout: 120000 });
  await page.waitForFunction(() => { const c = window.__QOK_COVER__; return !c || c.phase() !== 'boot'; }, { timeout: 60000 }).catch(() => {});
  await page.evaluate(() => { const t = window.__PHASER_GAME__.scene.getScene('TitleScene'); const i = t.menuItems.findIndex((m) => m.getData && m.getData('action') === 'continue'); t.selectedIndex = i; t.confirmTitle(); });
  const playable = () => page.waitForFunction(() => { const g = window.__PHASER_GAME__; const w = g.scene.getScene('WorldMapScene'); const T = window.__DQ_TILES__; return g.scene.isActive('WorldMapScene') && w.currentMapId === 'overworld' && T && T.ready && T.ready() && !w.showingMessage; }, { timeout: 120000 });
  await playable(); await page.waitForTimeout(1500);
  await page.evaluate(() => window.__perfSetDir('ArrowUp'));
  await page.waitForFunction(() => window.__PHASER_GAME__.scene.getScene('WorldMapScene').currentMapId === 'greenhollow', { timeout: 20000 });
  await page.evaluate(() => window.__perfSetDir(null));
  await page.waitForFunction(() => document.querySelector('#act1-hifi-preserved-root')?.dataset.ready === 'true', { timeout: 60000 });
  await page.waitForTimeout(800);
  const t0 = await page.evaluate(() => { document.querySelector('#act1-hifi-preserved-root iframe').contentWindow.focus(); window.__perfSetDir('ArrowDown'); return performance.now(); });
  await page.waitForFunction(() => window.__PHASER_GAME__.scene.getScene('WorldMapScene').currentMapId === 'overworld', { timeout: 40000 });
  await page.evaluate(() => window.__perfSetDir(null));
  await playable(); await page.waitForTimeout(4000);
  const log = await page.evaluate((t) => window.__veilLog.filter((e) => e[0] >= t).map((e) => [Math.round(e[0] - t), e[1], +(+e[2]).toFixed(2)]), t0);
  const shown = log.filter((e) => e[1] !== 'none');
  const ramp = shown.filter((e) => e[2] > 0.02 && e[2] < 0.95);
  const lastShown = shown.length ? shown[shown.length - 1] : null;
  const endedHidden = log.length && log[log.length - 1][1] === 'none';
  console.log('veil samples after exit:', log.length, 'shown:', shown.length, 'ramp samples:', ramp.length, 'last shown:', JSON.stringify(lastShown), 'ends hidden:', endedHidden);
  console.log('timeline:', shown.filter((e, i) => i % 3 === 0 || e[2] < 0.95).slice(-24).map((e) => e[0] + ':' + e[2]).join(' '));
  const ok = shown.length > 0 && ramp.length >= 2 && endedHidden;
  console.log(ok ? 'VEIL FADE: PASS' : 'VEIL FADE: FAIL');
  await browser.close(); process.exit(ok ? 0 : 1);
})().catch((e) => { console.error(e); process.exit(2); });
