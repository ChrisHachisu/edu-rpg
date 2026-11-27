'use strict';
// Census helpers (track C): phone viewport 390x844 at deviceScaleFactor 2, every capture a PNG in
// CENSUS_OUT (default /home/user/work/census/out) plus one JSON line in index.jsonl describing what
// it shows and how it was reached. finish.py turns the PNGs into JPEGs + index.json.
//   NODE_PATH=/opt/node-tools/node_modules PROBE_URL=http://127.0.0.1:5500/ node scripts/auto/census/<part>.cjs [args]
const fs = require('fs'), path = require('path');
process.env.PROBE_OUT = process.env.PROBE_OUT || '/home/user/work/census/probe-out';
const L = require('../../acts/probe/lib.cjs');
const ROOT = path.resolve(__dirname, '../../..');
const OUT = process.env.CENSUS_OUT || '/home/user/work/census/out';
fs.mkdirSync(OUT, { recursive: true });
const acts = JSON.parse(fs.readFileSync(path.join(ROOT, 'public/acts-hifi/manifest.json'), 'utf8'));
const dman = JSON.parse(fs.readFileSync(path.join(ROOT, 'public/acts-dungeons/manifest.json'), 'utf8'));
const A1 = (() => { const src = fs.readFileSync(path.join(ROOT, 'public/act1-world-map.js'), 'utf8'), m = /var LANDMARKS = (\[.*?\]);/.exec(src);
  return m ? JSON.parse(m[1]).map(l => ({ act: 1, mapId: l.mapId, name: l.mapId, at: [l.at.x, l.at.y], exit: [l.exit.x, l.exit.y], tile: l.tile })) : []; })();
const LANDMARKS = A1.concat(acts.landmarks.map(l => ({ ...l })));
const T0 = Date.now();
const log = (...a) => console.log(`[${((Date.now() - T0) / 1000).toFixed(0)}s]`, ...a);

// Every capture: wait a beat, screenshot, and record. `meta`: { area, shows, how, lang }
async function snap(page, name, meta = {}) {
  const f = path.join(OUT, name + '.png');
  let blank = null;
  await page.waitForFunction(() => { const c = window.__QOK_COVER__; return !c || !c.phase || c.phase() !== 'world'; }, { timeout: 30000 }).catch(() => log('cover still up', name));
  for (let tries = 0; tries < 4; tries++) {
    const ph = await page.evaluate(() => { const c = window.__QOK_COVER__; return c && c.phase ? c.phase() : null; }).catch(() => null);
    if (ph === 'error') { log('cover error, pressing Retry', name); await page.evaluate(() => { const b = document.querySelector('.bc-retry'); if (b) b.click(); }).catch(() => {}); await page.waitForTimeout(6000); }          // day 4: a black / spinner / flat frame is retaken after a wait (loading covers)
    try { await page.screenshot({ path: f }); } catch (e) { log('shot fail', name, e.message); return null; }
    blank = frameStats(f);
    if (!blank.flat) break;
    log('flat frame, retry', name, JSON.stringify(blank)); await page.waitForTimeout(2200);
  }
  const ph2 = await page.evaluate(() => { const c = window.__QOK_COVER__; return c && c.phase ? c.phase() : null; }).catch(() => null);
  if ((blank && blank.flat) || ph2 === 'error') meta = { ...meta, flatFrame: true, coverPhase: ph2 };
  let state = null; try { state = await page.evaluate(() => { const g = window.__PHASER_GAME__, w = g && g.scene.getScene('WorldMapScene');
    return { scenes: g ? g.scene.getScenes(true).map(s => s.scene.key) : [], map: w && w.currentMapId, floor: w && w.currentFloor, x: w && w.heroTileX, y: w && w.heroTileY }; }); } catch (e) {}
  fs.appendFileSync(path.join(OUT, 'index.jsonl'), JSON.stringify({ file: name + '.jpg', ...meta, state, at: new Date().toISOString() }) + '\n');
  log('shot', name); return f;
}
// Mean and spread of luminance over a sparse sample of the frame: a loading cover or black frame has almost none.
function frameStats(file) {
  try { const P = L.decodePng(fs.readFileSync(file)), n = P.w * P.h; let sum = 0, sq = 0, c = 0;
    for (let i = 0; i < n; i += 97) { const o = i * P.bpp, v = 0.3 * P.data[o] + 0.59 * P.data[o + 1] + 0.11 * P.data[o + 2]; sum += v; sq += v * v; c++; }
    const m = sum / c, sd = Math.sqrt(Math.max(0, sq / c - m * m)); return { mean: Math.round(m), sd: Math.round(sd), flat: sd < 14 }; } catch (e) { return { err: String(e).slice(0, 60), flat: false }; }
}
async function open() { return L.launch({ dpr: 2 }); }
// Boot a seeded save; options: locale 'en'|'ja', kanji bool, plus any L.save fields.
async function boot(page, o = {}, bootOpts = {}) {
  const { locale = 'en', kanji = false, flags = {}, all = true, mutate = null, ...rest } = o;
  const s = L.save({ ...rest, locale, kanjiMode: kanji, flags: { ...(all ? L.allFlags() : {}), ...flags } });
  s.player.name = 'Mika';
  if (mutate) mutate(s);
  await L.bootSave(page, s, bootOpts);
  await page.evaluate(() => { try { window.__GAME_STATE__.encounterManager.onStep = () => null; } catch (e) {} });
  return s;
}
const LANGS = [{ tag: 'en', locale: 'en', kanji: false }, { tag: 'ja-kana', locale: 'ja', kanji: false }, { tag: 'ja-kanji', locale: 'ja', kanji: true }];
const sleep = ms => new Promise(r => setTimeout(r, ms));
// Overworld camera helper: walk a few steps via stick in a direction (to move the view)
async function nudge(page, dx, dy, ms) { await L.stick(page, dx, dy, ms); await page.waitForTimeout(500); }
async function scenes(page) { return page.evaluate(() => window.__PHASER_GAME__.scene.getScenes(true).map(s => s.scene.key)); }
async function dismiss(page, max = 20) {
  for (let i = 0; i < max; i++) {
    const m = await page.evaluate(() => { const w = window.__PHASER_GAME__.scene.getScene('WorldMapScene'); return !!(w && w.showingMessage); }).catch(() => false);
    if (!m) return i;
    await page.keyboard.press('z'); await page.waitForTimeout(300);
  }
  return max;
}
module.exports = { frameStats, L, ROOT, OUT, acts, dman, LANDMARKS, snap, open, boot, LANGS, sleep, nudge, scenes, dismiss, log };
