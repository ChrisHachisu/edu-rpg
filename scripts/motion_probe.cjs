#!/usr/bin/env node
/* =================================================================================================
 * motion_probe.cjs — motion UNIFORMITY on the overworld, in a phone-sized 3x context.
 *
 * WHY A SECOND PROBE. perf_probe.cjs measures frame TIME (SMOOTH-2/3/4). The owner's word on
 * build 70 was "jittery", and a walk can jitter at a perfect 60 fps: if the camera's scroll is
 * rounded to whole world pixels and one world pixel is three device pixels, a hero moving 4.33 px
 * per frame is drawn moving 4, 5, 4, 4, 5 -- a 25% velocity modulation the eye reads as shaking.
 * Frame timing cannot see that. This probe records, per animation frame while the hero walks:
 *   dt        the frame interval
 *   cam step  how far the camera scroll moved (world px), the thing the background does on screen
 *   hero step how far the hero sprite moved (world px)
 *   rel       hero minus camera, i.e. where the hero sits ON SCREEN -- if this changes while she
 *             walks in a straight line at constant speed, the hero visibly shakes against the ground
 * and reports the distribution of each. It is READ-ONLY: nothing in the page is modified beyond
 * the same input driver perf_probe.cjs uses (index.html's own d-pad mechanism, reproduced).
 *
 * The context is the owner's: 390x844 CSS px, deviceScaleFactor 3, coarse pointer, Capacitor flag.
 * A screenshot of the walking field is written at the end (full 3x framebuffer) so image quality
 * can be inspected at the resolution the owner sees, not at a desktop 1x.
 *
 * USAGE
 *   python3 scripts/serve_dist.py --port 5178 &
 *   node scripts/motion_probe.cjs --url http://127.0.0.1:5178/ --runs 3 --label b70 --out /tmp/m.json --shots /tmp/shots
 * ===============================================================================================*/
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');

let chromium;
(function resolvePlaywright() {
  try { ({ chromium } = require('playwright-core')); return; } catch (_) {}
  let dir = __dirname;
  for (let i = 0; i < 8; i++) {
    const p = path.join(dir, '.eduharness', 'node_modules', 'playwright-core');
    try { ({ chromium } = require(p)); return; } catch (_) {}
    const up = path.dirname(dir); if (up === dir) break; dir = up;
  }
  console.error('cannot locate playwright-core (.eduharness/node_modules)'); process.exit(1);
})();

const argv = process.argv.slice(2);
const arg = (k, d) => { const i = argv.indexOf(k); return i >= 0 && argv[i + 1] !== undefined ? argv[i + 1] : d; };
const URL_ = arg('--url', 'http://127.0.0.1:5178/');
const RUNS = +arg('--runs', 3);
const LABEL = arg('--label', 'motion');
const OUT = arg('--out', null);
const SHOTS = arg('--shots', null);
const WALK_MS = +arg('--walk', 6000);
const vp = arg('--viewport', '390x844').split('x').map(Number);
const DPR = +arg('--dpr', 3);
const load1 = () => +os.loadavg()[0].toFixed(2);

const SAVE = {
  version: 4, timestamp: 1754500000000,
  player: {
    name: 'Perf', heroColor: 'gray', level: 5, exp: 0, expToNext: 100,
    hp: 40, maxHp: 40, atk: 15, def: 5, spd: 6,
    equipment: { weapon: null, armor: null, shield: null, helmet: null, accessory: null },
    inventory: [{ itemId: 'herb', quantity: 3 }], gold: 200,
    position: { mapId: 'overworld', x: 69, y: 256, floor: 1 },
    storyFlags: {}, activeQuests: [], completedQuests: [], questProgress: {},
    timerEnabled: true, quizDifficulty: '3', locale: 'en', soundEnabled: false,
    masterVolume: 0, kanjiMode: false,
  },
  playtime: 0, quizStats: {},
};

function initScript() {
  window.Capacitor = { isNativePlatform: () => true };
  const P = { t0: performance.now(), frames: [], sampling: false, playableAt: null };
  window.__MOTION = P;
  const KC = { ArrowUp: 38, ArrowDown: 40, ArrowLeft: 37, ArrowRight: 39 };
  const VEC = { ArrowUp: [0, -1], ArrowDown: [0, 1], ArrowLeft: [-1, 0], ArrowRight: [1, 0] };
  const held = Object.create(null);
  function fire(type, key) {
    const ev = new KeyboardEvent(type, { key, code: key, bubbles: true, cancelable: true });
    try {
      Object.defineProperty(ev, 'keyCode', { get: () => KC[key] });
      Object.defineProperty(ev, 'which', { get: () => KC[key] });
    } catch (e) {}
    window.dispatchEvent(ev);
  }
  window.__perfSetDir = function (dir) {
    for (const k of Object.keys(KC)) {
      if (k === dir && !held[k]) { held[k] = 1; fire('keydown', k); }
      else if (k !== dir && held[k]) { delete held[k]; fire('keyup', k); }
    }
    window.__DQ_STICK__ = dir ? { x: VEC[dir][0], y: VEC[dir][1], m: 1 } : { x: 0, y: 0, m: 0 };
  };
  const scene = () => { try { return window.__PHASER_GAME__.scene.getScene('WorldMapScene'); } catch (e) { return null; } };
  let prev = performance.now();
  (function loop() {
    const now = performance.now();
    const dt = now - prev; prev = now;
    const g = window.__PHASER_GAME__, w = scene();
    if (P.playableAt === null && g && w && g.scene.isActive('WorldMapScene')) {
      const T = window.__DQ_TILES__;
      const bc = document.getElementById('boot-cover');
      const covered = !!(bc && getComputedStyle(bc).display !== 'none' && +getComputedStyle(bc).opacity > 0.01);
      if (T && T.ready && T.ready() && !covered && !w.showingMessage) P.playableAt = now - P.t0;
    }
    if (P.sampling && w && w.hero && w.cameras && w.cameras.main) {
      const c = w.cameras.main;
      P.frames.push([+(now - P.t0).toFixed(2), +dt.toFixed(2), w.hero.x, w.hero.y, c.scrollX, c.scrollY]);
    }
    requestAnimationFrame(loop);
  })();
}

function stats(a) {
  if (!a.length) return null;
  const s = a.slice().sort((x, y) => x - y);
  const med = s[Math.floor(s.length / 2)];
  const mean = a.reduce((x, y) => x + y, 0) / a.length;
  const sd = Math.sqrt(a.reduce((x, y) => x + (y - mean) * (y - mean), 0) / a.length);
  return { n: a.length, min: +s[0].toFixed(2), median: +med.toFixed(2), mean: +mean.toFixed(2), max: +s[s.length - 1].toFixed(2), sd: +sd.toFixed(2) };
}

async function measureOnce(browser, runIndex) {
  const ctx = await browser.newContext({ viewport: { width: vp[0], height: vp[1] }, deviceScaleFactor: DPR, hasTouch: true, isMobile: true });
  const page = await ctx.newPage();
  const errors = []; page.on('pageerror', (e) => errors.push(e.message));
  await page.addInitScript(initScript);
  const out = { run: runIndex, loadBefore: load1(), errors };
  await page.goto(URL_, { waitUntil: 'domcontentloaded', timeout: 60_000 });
  await page.evaluate((s) => localStorage.setItem('edu-rpg-save', JSON.stringify(s)), SAVE);
  await page.reload({ waitUntil: 'load', timeout: 60_000 });
  await page.waitForFunction(() => !!window.__PHASER_GAME__, { timeout: 60_000 });
  await page.evaluate(() => {
    const g = window.__PHASER_GAME__;
    if (g.scene.isActive('BootScene')) { g.scene.start('TitleScene'); g.scene.stop('BootScene'); }
  });
  await page.waitForFunction(() => {
    const g = window.__PHASER_GAME__, t = g && g.scene.getScene('TitleScene');
    return t && g.scene.isActive('TitleScene') && t.menuItems && t.menuItems.length > 0;
  }, { timeout: 60_000 });
  await page.waitForFunction(() => { const c = window.__QOK_COVER__; return !c || c.phase() !== 'boot'; }, { timeout: 30_000 }).catch(() => {});
  await page.evaluate(() => {
    const t = window.__PHASER_GAME__.scene.getScene('TitleScene');
    const i = t.menuItems.findIndex((m) => m.getData && m.getData('action') === 'continue');
    t.selectedIndex = i; t.confirmTitle();
  });
  await page.waitForFunction(() => window.__MOTION.playableAt !== null, { timeout: 120_000 });
  await page.waitForTimeout(1500);

  out.env = await page.evaluate(() => {
    const c = document.querySelector('canvas'); const g = window.__PHASER_GAME__;
    const w = g.scene.getScene('WorldMapScene');
    return { dpr: window.devicePixelRatio, inner: [innerWidth, innerHeight], canvas: [c.width, c.height],
      cssBox: (() => { const r = c.getBoundingClientRect(); return [Math.round(r.width), Math.round(r.height)]; })(),
      camZoom: w.cameras.main.zoom, scaleMode: g.scale.scaleMode, gameZoom: g.scale.zoom,
      roundPixels: !!g.config.roundPixels, pixelArt: !!g.config.pixelArt,
      heroAt: [w.heroTileX, w.heroTileY], heroSize: [w.hero.displayWidth, w.hero.displayHeight],
      coarse: matchMedia('(pointer: coarse)').matches };
  });

  // Straight walks in two directions; re-aim like perf_probe when the way ahead is blocked.
  const walk = await page.evaluate(async ({ walkMs }) => {
    const P = window.__MOTION; const w = window.__PHASER_GAME__.scene.getScene('WorldMapScene');
    const DIRS = ['ArrowRight', 'ArrowDown', 'ArrowLeft', 'ArrowUp'];
    const D = { ArrowRight: [1, 0], ArrowLeft: [-1, 0], ArrowDown: [0, 1], ArrowUp: [0, -1] };
    let di = 0;
    const pick = () => { for (let k = 0; k < 4; k++) { const d = DIRS[(di + k) % 4];
      try { if (w.canMove(w.heroTileX + D[d][0], w.heroTileY + D[d][1])) { di = (di + k) % 4; return d; } } catch (e) { return d; } }
      return DIRS[di]; };
    const segs = []; let dir = pick(); window.__perfSetDir(dir);
    P.frames = []; P.sampling = true;
    const t0 = performance.now(); let lastAim = t0; let segStart = P.frames.length;
    while (performance.now() - t0 < walkMs) {
      await new Promise(requestAnimationFrame);
      const n = performance.now();
      if (n - lastAim >= 1500) { lastAim = n; const nd = pick();
        if (nd !== dir) { segs.push({ dir, from: segStart, to: P.frames.length }); dir = nd; window.__perfSetDir(dir); segStart = P.frames.length; } }
    }
    segs.push({ dir, from: segStart, to: P.frames.length });
    P.sampling = false; window.__perfSetDir(null);
    return { frames: P.frames.slice(), segs, hero: [w.heroTileX, w.heroTileY] };
  }, { walkMs: WALK_MS });

  // Per-frame steps, dropping the first 3 frames of each segment (acceleration / re-aim frames).
  const dts = [], camSteps = [], heroSteps = [], relJumps = [], camAxis = [], heroAxis = [];
  for (const s of walk.segs) {
    const f = walk.frames.slice(s.from + 3, s.to);
    const ax = s.dir === 'ArrowLeft' || s.dir === 'ArrowRight' ? 0 : 1;
    for (let i = 1; i < f.length; i++) {
      const a = f[i - 1], b = f[i];
      dts.push(b[1]);
      const hs = Math.hypot(b[2] - a[2], b[3] - a[3]), cs = Math.hypot(b[4] - a[4], b[5] - a[5]);
      heroSteps.push(+hs.toFixed(2)); camSteps.push(+cs.toFixed(2));
      heroAxis.push(+((b[2 + ax]) - (a[2 + ax])).toFixed(2)); camAxis.push(+((b[4 + ax]) - (a[4 + ax])).toFixed(2));
      // where the hero is on screen, before and after (world px)
      const relA = a[2 + ax] - a[4 + ax], relB = b[2 + ax] - b[4 + ax];
      relJumps.push(+Math.abs(relB - relA).toFixed(2));
    }
  }
  // velocity per ms, so a slow frame is not counted as a jerk when the distance matched its time
  const camVel = camSteps.map((s, i) => dts[i] > 0 ? s / dts[i] : 0);
  const cv = stats(camVel);
  const jerky = camVel.filter((v) => cv && Math.abs(v - cv.median) > 0.25 * cv.median).length;
  const camStepsMoving = camSteps.filter((s) => s > 0);
  const distinct = {}; camStepsMoving.forEach((s) => { const k = Math.round(s); distinct[k] = (distinct[k] || 0) + 1; });
  out.motion = {
    frames: dts.length,
    dtMs: stats(dts),
    framesOver33: dts.filter((d) => d > 33).length, framesOver100: dts.filter((d) => d > 100).length,
    camStepPx: stats(camSteps), heroStepPx: stats(heroSteps),
    camVelPxPerMs: cv, heroVelPxPerMs: stats(heroSteps.map((s, i) => dts[i] > 0 ? s / dts[i] : 0)),
    // the two jitter numbers: how often the background's per-frame speed deviates >25% from its
    // median, and how far the hero moves ON SCREEN per frame (0 = glued to the centre)
    camVelJerkFrames: jerky, camVelJerkPct: +(100 * jerky / Math.max(1, camVel.length)).toFixed(1),
    heroOnScreenJumpPx: stats(relJumps), heroOnScreenJumpsOver1px: relJumps.filter((r) => r > 1).length,
    camStepHistogram: distinct,
    subpixelCam: camSteps.filter((s) => s > 0 && Math.abs(s - Math.round(s)) > 0.01).length,
    subpixelHero: heroSteps.filter((s) => s > 0 && Math.abs(s - Math.round(s)) > 0.01).length,
    segs: walk.segs.map((s) => ({ dir: s.dir, frames: s.to - s.from })), heroEnd: walk.hero,
  };
  out.sample = walk.frames.slice(20, 32);
  if (SHOTS) {
    fs.mkdirSync(SHOTS, { recursive: true });
    // still, then one mid-walk frame
    const still = path.join(SHOTS, `${LABEL}-run${runIndex}-still.png`);
    await page.screenshot({ path: still });
    await page.evaluate(() => window.__perfSetDir('ArrowRight'));
    await page.waitForTimeout(400);
    const moving = path.join(SHOTS, `${LABEL}-run${runIndex}-walking.png`);
    await page.screenshot({ path: moving });
    await page.evaluate(() => window.__perfSetDir(null));
    out.shots = { still, moving };
  }
  out.loadAfter = load1();
  await ctx.close();
  return out;
}

(async () => {
  const browser = await chromium.launch({ headless: true, channel: 'chrome', args: ['--enable-webgl', '--ignore-gpu-blocklist', '--mute-audio'] });
  const runs = [];
  for (let i = 0; i < RUNS; i++) {
    const r = await measureOnce(browser, i + 1);
    runs.push(r);
    const m = r.motion;
    console.log(`run ${i + 1}  load ${r.loadBefore}->${r.loadAfter}  frames ${m.frames}  dt med ${m.dtMs.median} max ${m.dtMs.max}  >33ms ${m.framesOver33} >100ms ${m.framesOver100}`);
    console.log(`       cam step px med ${m.camStepPx.median} sd ${m.camStepPx.sd}  cam vel jerk ${m.camVelJerkPct}%  hero on-screen jump med ${m.heroOnScreenJumpPx.median} max ${m.heroOnScreenJumpPx.max} (>1px: ${m.heroOnScreenJumpsOver1px})  hist ${JSON.stringify(m.camStepHistogram)}  subpx cam/hero ${m.subpixelCam}/${m.subpixelHero}`);
    if (r.errors.length) console.log('       page errors: ' + r.errors.join(' | '));
  }
  console.log('env', JSON.stringify(runs[0].env));
  await browser.close();
  if (OUT) fs.writeFileSync(OUT, JSON.stringify({ label: LABEL, url: URL_, viewport: vp, dpr: DPR, runs }, null, 1));
})().catch((e) => { console.error(e); process.exit(1); });
