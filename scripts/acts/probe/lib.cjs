'use strict';
// Headless probe helpers for the Acts 2-5 runtime (cloud: Playwright + Chromium/SwiftShader).
//   NODE_PATH=/opt/node-tools/node_modules node scripts/acts/probe/<probe>.cjs
// Environment: PROBE_URL (default http://127.0.0.1:5182/), PROBE_OUT (default ./probe-out).
// One Chromium at a time; every probe is a short run that writes JSON + screenshots.
const fs = require('fs'), path = require('path');
let chromium;
try { chromium = require('playwright').chromium; } catch (e) { chromium = require('playwright-core').chromium; }
const URL_ = process.env.PROBE_URL || 'http://127.0.0.1:5182/';
const OUT = process.env.PROBE_OUT || path.resolve('probe-out');
fs.mkdirSync(OUT, { recursive: true });

function save(o = {}) {
  const { mapId = 'overworld', x = 80, y = 262, floor = 1, flags = {}, inventory = [{ itemId: 'herb', quantity: 5 }] } = o;
  return { version: 4, timestamp: Date.now(), player: { name: 'Probe', heroColor: 'gray', level: 50, exp: 0, expToNext: 100,
    hp: 9999, maxHp: 9999, atk: 9999, def: 9999, spd: 999,
    equipment: { weapon: null, armor: null, shield: null, helmet: null, accessory: null }, inventory, gold: 5000,
    position: { mapId, x, y, floor }, storyFlags: { 'intro.done': true, 'acts.geo2': true, ...flags }, activeQuests: [], completedQuests: [], questProgress: {},
    timerEnabled: false, quizDifficulty: '3', locale: 'en', soundEnabled: false, masterVolume: 0, kanjiMode: false }, playtime: 0, quizStats: {} };
}
const BOSSES = ['giantToad', 'serpent', 'stormHarpy', 'phantomStag', 'dragon', 'sandWyrm', 'banditKing', 'pharaoh', 'magmaGolem',
  'obsidianKnight', 'forgeTitan', 'demonGeneral', 'voidHerald'];
const allFlags = () => Object.fromEntries(BOSSES.map(b => [`boss.${b}.defeated`, true]));

async function launch({ dpr = 1, storage = {} } = {}) {
  const browser = await chromium.launch({ headless: true, args: ['--enable-webgl', '--ignore-gpu-blocklist', '--mute-audio'] });
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: dpr, hasTouch: true, isMobile: true });
  await ctx.addInitScript(() => { window.Capacitor = { isNativePlatform: () => true }; });
  ctx.setDefaultTimeout(60000);
  const page = await ctx.newPage(); const errors = [], requests = [];
  page.on('pageerror', e => errors.push({ t: 'pageerror', m: e.message }));
  page.on('console', m => { if (m.type() === 'error' && !m.text().includes('Failed to load resource')) errors.push({ t: 'console', m: m.text().slice(0, 300) }); });
  page.on('response', r => { if (r.status() >= 400) errors.push({ t: 'http' + r.status(), m: r.url() }); });
  page.on('request', r => requests.push(r.url()));
  return { browser, ctx, page, errors, requests, storage };
}
async function toTitle(page) {
  await page.waitForFunction(() => !!window.__PHASER_GAME__, { timeout: 90000 });
  await page.evaluate(() => { const g = window.__PHASER_GAME__; if (g.scene.isActive('BootScene')) { g.scene.start('TitleScene'); g.scene.stop('BootScene'); } });
  await page.waitForFunction(() => { const g = window.__PHASER_GAME__, t = g && g.scene.getScene('TitleScene'); return t && g.scene.isActive('TitleScene') && t.menuItems && t.menuItems.length > 0; }, { timeout: 90000 });
  await page.waitForFunction(() => { const c = window.__QOK_COVER__; return !c || c.phase() !== 'boot'; }, { timeout: 30000 }).catch(() => {});
  await page.waitForTimeout(400);
}
// Seed a v4 save (plus any extra localStorage keys, e.g. the kill switch) and Continue into it.
async function bootSave(page, s, { url = URL_, extra = {}, settle = 2500, ready = true } = {}) {
  await page.goto(url, { waitUntil: 'domcontentloaded' });
  await page.evaluate(([s, extra]) => { localStorage.clear(); localStorage.setItem('edu-rpg-save', JSON.stringify(s)); for (const k in extra) localStorage.setItem(k, extra[k]); }, [s, extra]);
  await page.reload({ waitUntil: 'load' });
  await toTitle(page);
  await page.evaluate(() => { const t = window.__PHASER_GAME__.scene.getScene('TitleScene'); const i = t.menuItems.findIndex(m => m.getData && m.getData('action') === 'continue'); if (i < 0) throw new Error('no continue'); t.selectedIndex = i; t.confirmTitle(); });
  await page.waitForFunction(() => { const g = window.__PHASER_GAME__, w = g.scene.getScene('WorldMapScene'); return w && g.scene.isActive('WorldMapScene') && w.hero && w.mapData; }, { timeout: 90000 });
  if (ready) await page.waitForFunction(() => { const T = window.__DQ_TILES__; return T && T.ready && T.ready(); }, { timeout: 120000 }).catch(() => {});
  await page.waitForTimeout(settle);
  await noEncounters(page);
}
const noEncounters = page => page.evaluate(() => { try { window.__GAME_STATE__.encounterManager.onStep = () => null; } catch (e) {} });
const pos = page => page.evaluate(() => { const g = window.__PHASER_GAME__, w = g.scene.getScene('WorldMapScene'), sp = window.__DQ_TILES__ && window.__DQ_TILES__.overworldSpace;
  const ow = w.currentMapId === 'overworld';
  return { map: w.currentMapId, floor: w.currentFloor, x: w.heroTileX, y: w.heroTileY, hx: w.hero && w.hero.x, hy: w.hero && w.hero.y,
    cx: ow && sp ? sp.toCanonical(w.hero.x) / 48 : null, cy: ow && sp ? sp.toCanonical(w.hero.y) / 48 : null,
    msg: !!w.showingMessage, scenes: g.scene.getScenes(true).map(s => s.scene.key) }; });
async function shot(page, name) { const f = path.join(OUT, name + '.png'); await page.screenshot({ path: f }).catch(e => console.log('shot fail', e.message)); return f; }
async function stick(page, x, y, ms) { await page.evaluate(v => { window.__DQ_STICK__ = { x: v[0], y: v[1], m: 1 }; }, [x, y]); await page.waitForTimeout(ms); await page.evaluate(() => { window.__DQ_STICK__ = { x: 0, y: 0, m: 0 }; }); }
// Steer the stick at a list of cell-centre waypoints (overworld cells). Runs in the page so the
// heading follows the hero every frame. Stops early when the map changes (a door fired).
async function walkCells(page, cells, { tol = 0.3, maxMs = 20000 } = {}) {
  return page.evaluate(async ({ cells, tol, maxMs }) => {
    const g = window.__PHASER_GAME__, w = g.scene.getScene('WorldMapScene'), sp = window.__DQ_TILES__.overworldSpace;
    const map0 = w.currentMapId, t0 = performance.now(); let i = 0, stuck = 0, last = null, moved = 0;
    const here = () => [sp.toCanonical(w.hero.x) / 48, sp.toCanonical(w.hero.y) / 48];
    try {
      while (i < cells.length) {
        if (performance.now() - t0 > maxMs) return { ok: false, why: 'timeout', i, at: here(), moved };
        if (w.currentMapId !== map0 || !g.scene.isActive('WorldMapScene')) return { ok: true, why: 'map', map: w.currentMapId, i, moved };
        const [cx, cy] = here(), tx = cells[i][0] + 0.5, ty = cells[i][1] + 0.5, dx = tx - cx, dy = ty - cy, d = Math.hypot(dx, dy);
        if (d < tol) { i++; continue; }
        window.__DQ_STICK__ = { x: dx / d, y: dy / d, m: 1 };
        await new Promise(r => requestAnimationFrame(r));
        const n = here();
        if (last) { const st = Math.hypot(n[0] - last[0], n[1] - last[1]); moved += st; stuck = st < 0.0005 ? stuck + 1 : 0; }
        last = n;
        if (stuck > 90) return { ok: false, why: 'stuck', i, at: n, moved };
      }
      return { ok: true, why: 'arrived', at: here(), moved };
    } finally { window.__DQ_STICK__ = { x: 0, y: 0, m: 0 }; }
  }, { cells, tol, maxMs });
}
const multi = page => page.evaluate(() => (window.__QOK_MULTIACT__ ? window.__QOK_MULTIACT__.status() : null));
module.exports = { chromium, URL_, OUT, save, allFlags, BOSSES, launch, toTitle, bootSave, noEncounters, pos, shot, stick, walkCells, multi };
