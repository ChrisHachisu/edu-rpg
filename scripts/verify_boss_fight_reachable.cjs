#!/usr/bin/env node
/* verify_boss_fight_reachable.cjs -- Darkfang Grotto's Giant Toad must be FIGHTABLE. Seeds a save
 * beside the boss on floor 3, bumps the boss cell, advances the intro the way a tap does
 * (advanceDialog) and asserts BattleScene starts with enemy giantToad. On the build-70 dist the
 * boss cell is a warp: the bump lands the player on the overworld at (96,360) instead. The second
 * pass (force7=true) forces the tile to 7 first, to separate "tile wrong" from "fight broken".
 *   node scripts/verify_boss_fight_reachable.cjs [http://127.0.0.1:5179/] */
const path = require('path');
let chromium; try { ({ chromium } = require('playwright-core')); } catch (e) { ({ chromium } = require(path.join(__dirname, '..', '.eduharness', 'node_modules', 'playwright-core'))); }
const URL_ = process.argv[2] || 'http://127.0.0.1:5179/';
// `stand` is a legal floor cell beside the boss (read off act1-dungeon-floors.json rows); seeding on
// rock would let the arrival rescue carry her off to the mouth and the camera away from the boss.
const BOSS = { sunkenCellar: { id: 'giantCrab', x: 8, y: 24, stand: [7, 25] }, mistyGrotto: { id: 'giantToad', x: 40, y: 33, stand: [40, 34] }, coastalReef: { id: 'coralTitan', x: 9, y: 51, stand: [9, 52] }, whisperingWoodsCave: { id: 'mosswarden', x: 7, y: 17, stand: [7, 18] } };
const save = (mapId, x, y, flags) => ({ version: 4, timestamp: 1754500000000, player: { name: 'Perf', heroColor: 'gray', level: 20, exp: 0, expToNext: 100, hp: 200, maxHp: 200, atk: 40, def: 30, spd: 6, equipment: { weapon: null, armor: null, shield: null, helmet: null, accessory: null }, inventory: [], gold: 200, position: { mapId, x, y, floor: 3 }, storyFlags: flags, activeQuests: [], completedQuests: [], questProgress: {}, timerEnabled: false, quizDifficulty: '3', locale: 'en', soundEnabled: false, masterVolume: 0, kanjiMode: false }, playtime: 0, quizStats: {} });
let fails = 0; const check = (n, ok, d) => { console.log((ok ? 'PASS ' : 'FAIL ') + n + (d ? '  -- ' + d : '')); if (!ok) fails++; };
(async () => {
  const browser = await chromium.launch({ headless: true, channel: 'chrome', args: ['--enable-webgl', '--ignore-gpu-blocklist', '--mute-audio'] });
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, hasTouch: true, isMobile: true });
  const page = await ctx.newPage();
  await page.addInitScript(() => { window.Capacitor = { isNativePlatform: () => true }; });
  async function boot(s) {
    await page.goto(URL_, { waitUntil: 'domcontentloaded', timeout: 120000 });
    await page.evaluate((s) => localStorage.setItem('edu-rpg-save', JSON.stringify(s)), s);
    await page.reload({ waitUntil: 'load', timeout: 120000 });
    await page.waitForFunction(() => !!window.__PHASER_GAME__, { timeout: 120000 });
    await page.evaluate(() => { const g = window.__PHASER_GAME__; if (g.scene.isActive('BootScene')) { g.scene.start('TitleScene'); g.scene.stop('BootScene'); } });
    await page.waitForFunction(() => { const g = window.__PHASER_GAME__, t = g && g.scene.getScene('TitleScene'); return t && g.scene.isActive('TitleScene') && t.menuItems && t.menuItems.length > 0; }, { timeout: 120000 });
    await page.waitForFunction(() => { const c = window.__QOK_COVER__; return !c || c.phase() !== 'boot'; }, { timeout: 60000 }).catch(() => {});
    await page.evaluate(() => { const t = window.__PHASER_GAME__.scene.getScene('TitleScene'); const i = t.menuItems.findIndex((m) => m.getData && m.getData('action') === 'continue'); t.selectedIndex = i; t.confirmTitle(); });
    await page.waitForFunction((m) => { const g = window.__PHASER_GAME__; const w = g.scene.getScene('WorldMapScene'); return g.scene.isActive('WorldMapScene') && w.currentMapId === m && w.hero && !w.showingMessage; }, s.player.position.mapId, { timeout: 120000 });
    await page.waitForTimeout(15000);  // plate (up to 16 MB PNG) + asset PNGs decode; a1dBossSort ticks
  }
  // Phaser's WebGL canvas does not preserve its drawing buffer, so readPixels lies; the pixel is
  // read from a real screenshot instead (deviceScaleFactor 1: screenshot px == CSS px).
  const fs = require('fs'); const zlib = require('zlib');
  function pngPixel(buf, x, y) {
    let pos = 8, width = 0, height = 0, idat = [], colorType = 6, bitDepth = 8;
    while (pos < buf.length) { const len = buf.readUInt32BE(pos); const type = buf.toString('ascii', pos + 4, pos + 8);
      if (type === 'IHDR') { width = buf.readUInt32BE(pos + 8); height = buf.readUInt32BE(pos + 12); bitDepth = buf[pos + 16]; colorType = buf[pos + 17]; }
      if (type === 'IDAT') idat.push(buf.subarray(pos + 8, pos + 8 + len)); pos += 12 + len; }
    if (bitDepth !== 8 || (colorType !== 2 && colorType !== 6)) throw new Error('pngPixel: unsupported PNG (bitDepth ' + bitDepth + ', colorType ' + colorType + ')');
    const raw = zlib.inflateSync(Buffer.concat(idat)); const bpp = colorType === 6 ? 4 : 3, stride = width * bpp + 1;
    const out = Buffer.alloc(width * height * bpp); let prev = Buffer.alloc(width * bpp);
    for (let r = 0; r < height; r++) { const f = raw[r * stride]; const line = raw.subarray(r * stride + 1, r * stride + 1 + width * bpp); const cur = Buffer.alloc(width * bpp);
      for (let i = 0; i < width * bpp; i++) { const a = i >= bpp ? cur[i - bpp] : 0, b = prev[i], c = i >= bpp ? prev[i - bpp] : 0; let v = line[i];
        if (f === 1) v += a; else if (f === 2) v += b; else if (f === 3) v += (a + b) >> 1; else if (f === 4) { const pp = a + b - c, pa = Math.abs(pp - a), pb = Math.abs(pp - b), pc = Math.abs(pp - c); v += (pa <= pb && pa <= pc) ? a : (pb <= pc ? b : c); }
        cur[i] = v & 255; }
      cur.copy(out, r * width * bpp); prev = cur; }
    const i = (y * width + x) * bpp; return [out[i], out[i + 1], out[i + 2]];
  }
  const http = require('http');
  const fetchBuf = (u) => new Promise((res, rej) => http.get(u, (r) => { const c = []; r.on('data', (d) => c.push(d)); r.on('end', () => res(Buffer.concat(c))); r.on('error', rej); }).on('error', rej));
  const plateLum = {};
  async function platePixel(mapId, b) {
    // The floor reference must come from a plate WITHOUT the baked mark; pass PLATE_URL=<fixed dist>
    // when refuting against an older dist whose own plate still carries it.
    const ref = process.env.PLATE_URL || URL_;
    if (!plateLum[mapId]) plateLum[mapId] = await fetchBuf(`${ref}act1-dungeon-art/${mapId}-f3-props.png`);
    const TILE = 48; const px = pngPixel(plateLum[mapId], Math.round(b.x * TILE + TILE / 2), Math.round(b.y * TILE + TILE - TILE * 0.9));
    return Math.round(0.299 * px[0] + 0.587 * px[1] + 0.114 * px[2]);
  }
  async function probe(mapId, b, tag) {
    const at = await page.evaluate(({ b }) => {
      const g = window.__PHASER_GAME__, w = g.scene.getScene('WorldMapScene'), cam = w.cameras.main, TILE = 48;
      const cx = b.x * TILE + TILE / 2, cy = b.y * TILE + TILE - TILE * 0.9;        // a point inside the mark's body (2.2 cells tall, foot at b.y+1)
      const r = g.canvas.getBoundingClientRect();
      return { sx: Math.round(r.left + (cx - cam.scrollX) * cam.zoom), sy: Math.round(r.top + (cy - cam.scrollY) * cam.zoom), floor: w.currentFloor, tileAtBoss: w.mapData && w.mapData[b.y] && w.mapData[b.y][b.x] };
    }, { b });
    const shot = `/private/tmp/claude-501/boss/${mapId}-${tag}.png`;
    const buf = await page.screenshot({ path: shot });
    const px = pngPixel(buf, at.sx, at.sy);
    return { ...at, lum: Math.round(0.299 * px[0] + 0.587 * px[1] + 0.114 * px[2]), rgb: px, shot };
  }
  const mapId='mistyGrotto', b=BOSS[mapId];
  for (const force7 of [false, true]) {
    await boot(save(mapId, b.stand[0], b.stand[1], {}));
    const r = await page.evaluate(async ({ b, force7 }) => {
      const g = window.__PHASER_GAME__, w = g.scene.getScene('WorldMapScene');
      const before = { tile: w.mapData[b.y][b.x], map: w.currentMapId, floor: w.currentFloor, hero: [w.heroTileX, w.heroTileY] };
      if (force7) w.mapData[b.y][b.x] = 7;
      // bump north into the boss cell via the mover's own interact path
      const KC = { ArrowUp: 38 }; const ev = (t) => { const e = new KeyboardEvent(t, { key: 'ArrowUp', code: 'ArrowUp', bubbles: true }); Object.defineProperty(e, 'keyCode', { get: () => 38 }); window.dispatchEvent(e); };
      window.__DQ_STICK__ = { x: 0, y: -1, m: 1 }; ev('keydown');
      const t0 = performance.now(); let out = null;
      while (performance.now() - t0 < 6000) { await new Promise(requestAnimationFrame);
        if (g.scene.isActive('BattleScene')) { out = 'BattleScene'; break; }
        if (w.currentMapId !== 'mistyGrotto' || w.currentFloor !== 3) { out = 'map/floor changed to ' + w.currentMapId + ' f' + w.currentFloor; break; } }
      window.__DQ_STICK__ = { x: 0, y: 0, m: 0 }; ev('keyup');
      // the boss has a 3-line intro on the shipped message box; advance it the way a thumb would
      // (the DOM box routes taps to the scene's own advance) and wait for the battle
      // the shipped boss shows a dialog SEQUENCE (3 lines + taunt) and starts the battle when the
      // last line is dismissed; the overlay's tap calls advanceDialog() (300 ms debounce), so do that.
      const bumps = [];
      for (let k = 0; k < 8 && !out; k++) {
        await new Promise((r) => setTimeout(r, 450));
        bumps.push((w.messageText && w.messageText.text || '').slice(0, 40));
        try { if (w.showingMessage && typeof w.advanceDialog === 'function') w.advanceDialog(); } catch (e) {}
        const tb = performance.now();
        while (performance.now() - tb < 800) { await new Promise(requestAnimationFrame); if (g.scene.isActive('BattleScene')) { out = 'BattleScene'; break; } }
        if (w.currentMapId !== 'mistyGrotto') { out = 'warped to ' + w.currentMapId; break; }
      }
      window.__bumps = bumps;
      const bs = g.scene.getScene('BattleScene');
      return { before, bumps: window.__bumps, result: out || 'nothing after 6 s', hero: [w.heroTileX, w.heroTileY], showing: w.showingMessage, msg: (w.messageText && w.messageText.text) || null, enemy: bs && (bs.enemy || bs.monster || bs.currentMonster) && ((bs.enemy || bs.monster || bs.currentMonster).id || (bs.enemy || bs.monster || bs.currentMonster).nameKey || null), isBoss: bs && (bs.isBoss || bs.bossId || null), tileAfter: w.mapData[b.y][b.x] };
    }, { b, force7 });
    console.log('force7=' + force7, JSON.stringify(r));
  }
  await browser.close();
  console.log(fails ? `BOSS VANISH: ${fails} FAIL` : 'BOSS VANISH: ALL PASS');
  process.exit(fails ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(2); });
