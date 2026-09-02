#!/usr/bin/env node
/* verify_slow_chunks_no_veil.cjs -- with SLOW chunk art (each chunk layer delayed 1500 ms, the way
 * the owner's phone decodes), a 12 s overworld walk must NOT keep raising the "Loading the world"
 * veil for art that is off screen, and a missing on-screen chunk must show the relief placeholder
 * rather than the flat sea. Owner, build 74: "the frequent world loading really bothers me so we
 * definitely need to fix it." Refutes on the build-70 dist: the veil shows for seconds per walk.
 *   node scripts/verify_slow_chunks_no_veil.cjs [http://127.0.0.1:5179/] [delayMs] */
const path = require('path');
let chromium; try { ({ chromium } = require('playwright-core')); } catch (e) { ({ chromium } = require(path.join(__dirname, '..', '.eduharness', 'node_modules', 'playwright-core'))); }
const URL_ = process.argv[2] || 'http://127.0.0.1:5179/'; const DELAY = +(process.argv[3] || 1500);
const SAVE = { version: 4, timestamp: 1754500000000, player: { name: 'Perf', heroColor: 'gray', level: 5, exp: 0, expToNext: 100, hp: 40, maxHp: 40, atk: 15, def: 5, spd: 6, equipment: { weapon: null, armor: null, shield: null, helmet: null, accessory: null }, inventory: [{ itemId: 'herb', quantity: 3 }], gold: 200, position: { mapId: 'overworld', x: 69, y: 256, floor: 1 }, storyFlags: { 'act1.townOpened.greenhollow': true }, activeQuests: [], completedQuests: [], questProgress: {}, timerEnabled: true, quizDifficulty: '3', locale: 'en', soundEnabled: false, masterVolume: 0, kanjiMode: false }, playtime: 0, quizStats: {} };
let fails = 0; const check = (n, ok, d) => { console.log((ok ? 'PASS ' : 'FAIL ') + n + (d ? '  -- ' + d : '')); if (!ok) fails++; };
(async () => {
  const browser = await chromium.launch({ headless: true, channel: 'chrome', args: ['--enable-webgl', '--ignore-gpu-blocklist', '--mute-audio'] });
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, hasTouch: true, isMobile: true });
  const page = await ctx.newPage();
  await page.addInitScript(() => { window.Capacitor = { isNativePlatform: () => true };
    const KC = { ArrowUp: 38, ArrowDown: 40, ArrowLeft: 37, ArrowRight: 39 }; const VEC = { ArrowUp: [0, -1], ArrowDown: [0, 1], ArrowLeft: [-1, 0], ArrowRight: [1, 0] }; const held = {};
    function fire(type, key) { const ev = new KeyboardEvent(type, { key, code: key, bubbles: true }); Object.defineProperty(ev, 'keyCode', { get: () => KC[key] }); Object.defineProperty(ev, 'which', { get: () => KC[key] }); window.dispatchEvent(ev); }
    window.__perfSetDir = function (dir) { for (const k of Object.keys(KC)) { if (k === dir && !held[k]) { held[k] = 1; fire('keydown', k); } else if (k !== dir && held[k]) { delete held[k]; fire('keyup', k); } } window.__DQ_STICK__ = dir ? { x: VEC[dir][0], y: VEC[dir][1], m: 1 } : { x: 0, y: 0, m: 0 }; };
    // sample the veil + placeholders every frame from the start
    window.__veilLog = [];
    (function tick() { const v = document.getElementById('a1a-loading-veil'); const up = !!(v && v.style.display !== 'none' && v.style.display !== '');
      const ph = window.__A1A_PH__ ? Object.keys(window.__A1A_PH__.imgs).length : -1;
      window.__veilLog.push([performance.now(), up ? 1 : 0, ph]); requestAnimationFrame(tick); })();
  });
  await page.goto(URL_, { waitUntil: 'domcontentloaded', timeout: 120000 });
  await page.evaluate((s) => localStorage.setItem('edu-rpg-save', JSON.stringify(s)), SAVE);
  // slow every chunk layer from now on (the initial window too: that is the phone)
  await page.route(/act1-hifi\/chunks\//, async (route) => { await new Promise((r) => setTimeout(r, DELAY)); await route.continue(); });
  await page.reload({ waitUntil: 'load', timeout: 120000 });
  await page.waitForFunction(() => !!window.__PHASER_GAME__, { timeout: 120000 });
  await page.evaluate(() => { const g = window.__PHASER_GAME__; if (g.scene.isActive('BootScene')) { g.scene.start('TitleScene'); g.scene.stop('BootScene'); } });
  await page.waitForFunction(() => { const g = window.__PHASER_GAME__, t = g && g.scene.getScene('TitleScene'); return t && g.scene.isActive('TitleScene') && t.menuItems && t.menuItems.length > 0; }, { timeout: 120000 });
  await page.waitForFunction(() => { const c = window.__QOK_COVER__; return !c || c.phase() !== 'boot'; }, { timeout: 60000 }).catch(() => {});
  await page.evaluate(() => { const t = window.__PHASER_GAME__.scene.getScene('TitleScene'); const i = t.menuItems.findIndex((m) => m.getData && m.getData('action') === 'continue'); t.selectedIndex = i; t.confirmTitle(); });
  await page.waitForFunction(() => { const g = window.__PHASER_GAME__; const w = g.scene.getScene('WorldMapScene'); const T = window.__DQ_TILES__; return g.scene.isActive('WorldMapScene') && T && T.ready && T.ready() && !w.showingMessage; }, { timeout: 180000 });
  await page.waitForTimeout(3000);
  const t0 = await page.evaluate(() => performance.now());
  // a 14 s walk that re-aims whenever the way ahead is blocked (the same in-page driver the perf
  // probe uses), so she keeps crossing chunk boundaries at 5.4 cells/s instead of hugging a cliff
  const walk = page.evaluate(async () => {
    const w = window.__PHASER_GAME__.scene.getScene('WorldMapScene');
    const DIRS = ['ArrowRight', 'ArrowDown', 'ArrowLeft', 'ArrowUp']; const D = { ArrowRight: [1, 0], ArrowLeft: [-1, 0], ArrowDown: [0, 1], ArrowUp: [0, -1] };
    let di = 0; const pick = () => { for (let k = 0; k < 4; k++) { const d = DIRS[(di + k) % 4]; try { if (w.canMove(w.heroTileX + D[d][0] * 2, w.heroTileY + D[d][1] * 2)) { di = (di + k) % 4; return d; } } catch (e) { return d; } } return DIRS[di]; };
    let dir = pick(); window.__perfSetDir(dir); const t0 = performance.now(); let last = [w.heroTileX, w.heroTileY], lastMove = t0;
    while (performance.now() - t0 < 14000) { await new Promise(requestAnimationFrame);
      // a random encounter ends the walk's usefulness: flee it through the real command tap and carry on
      if (window.__PHASER_GAME__.scene.isActive('BattleScene')) { window.__perfSetDir(null); const b = document.querySelector('[data-act="battleMenu"][data-i="3"]'); if (b) b.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true })); await new Promise((r) => setTimeout(r, 1200)); if (b) b.dispatchEvent(new PointerEvent('pointerup', { bubbles: true })); await new Promise((r) => setTimeout(r, 2500)); window.__perfSetDir(dir); continue; }
      if (window.__A1A_PH__ && Object.keys(window.__A1A_PH__.imgs).length > 0 && !window.__phSeen) window.__phSeen = performance.now();
      if (w.heroTileX !== last[0] || w.heroTileY !== last[1]) { last = [w.heroTileX, w.heroTileY]; lastMove = performance.now(); }
      else if (performance.now() - lastMove > 400) { di = (di + 1) % 4; dir = pick(); window.__perfSetDir(dir); lastMove = performance.now(); } }
    window.__perfSetDir(null);
  });
  let phShot = null;
  for (let k = 0; k < 70 && !phShot; k++) { await page.waitForTimeout(200); const n = await page.evaluate(() => window.__A1A_PH__ ? Object.keys(window.__A1A_PH__.imgs).length : 0).catch(() => 0); if (n > 0) { phShot = '/private/tmp/claude-501/perf/shots/slow-chunks-placeholder.png'; await page.screenshot({ path: phShot }); } }
  await walk;
  const shot = '/private/tmp/claude-501/perf/shots/slow-chunks-walk.png'; await page.screenshot({ path: shot });
  if (phShot) console.log('placeholder screenshot: ' + phShot);
  const r = await page.evaluate((t0) => { const L = window.__veilLog.filter((e) => e[0] >= t0); let veilMs = 0, veilEpisodes = 0, prev = 0, phMax = 0, phFrames = 0;
    for (let i = 1; i < L.length; i++) { const dt = L[i][0] - L[i - 1][0]; if (L[i][1]) veilMs += dt; if (L[i][1] && !prev) veilEpisodes++; prev = L[i][1]; if (L[i][2] > phMax) phMax = L[i][2]; if (L[i][2] > 0) phFrames++; }
    const w = window.__PHASER_GAME__.scene.getScene('WorldMapScene');
    return { frames: L.length, veilMs: Math.round(veilMs), veilEpisodes, phMax, phFrames, hero: [w.heroTileX, w.heroTileY] }; }, t0);
  console.log(JSON.stringify(r));
  check(`walk of ${r.frames} frames with ${DELAY} ms chunk delay: the veil stays down (< 300 ms total, 0 episodes)`, r.veilMs < 300 && r.veilEpisodes === 0, `veil ${r.veilMs} ms in ${r.veilEpisodes} episodes`);
  check('a missing on-screen chunk showed the relief placeholder at least once during the walk', r.phMax > 0, `placeholders max ${r.phMax}, frames with one ${r.phFrames}`);
  check('the hero actually travelled', Math.abs(r.hero[0] - 69) + Math.abs(r.hero[1] - 256) >= 12, `hero ${r.hero}`);
  await browser.close();
  console.log(fails ? `SLOW CHUNKS: ${fails} FAIL` : 'SLOW CHUNKS: ALL PASS'); process.exit(fails ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(2); });
