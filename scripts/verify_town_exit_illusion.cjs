#!/usr/bin/env node
/* The illusion of leaving the map, on the way out of an Act 1 hi-fi town.
 *
 * WHY A SCRIPT RATHER THAN A LOOK
 *   Owner, build 70, his FOURTH report of the same defect across four different exit-line
 *   positions: "still not the edge of the map. the player needs to get the illusion that they are
 *   leaving the map." The line itself was never the problem (scripts/check_town_exits.py has
 *   verified its geometry since build 66) -- the problem is that nothing on screen ever said "this
 *   is the edge", and a hard cut to the overworld the instant she crosses it cannot read as leaving
 *   ANYTHING no matter where the line sits. That is a rendered-frame claim and a wall-clock timing
 *   claim, neither of which a static diff of town.html can make -- only driving the real page and
 *   sampling its canvas and its message traffic can.
 *
 * WHAT IT DRIVES
 *   The same real index.html -> adapter.js -> town.html chain scripts/verify_town_owner_items.cjs
 *   drives, out of a dist/ payload passed as the URL. Run it TWICE by hand for the refutation this
 *   file itself does not attempt (that needs a second, pre-fix dist/ on a second port -- see the
 *   task's return contract): once against the fixed dist, once against a dist built from the
 *   commit before this change.
 *
 * USAGE
 *   node scripts/verify_town_exit_illusion.cjs [url] [--out DIR] [--tag pre|post]
 */
const fs = require('node:fs');
const path = require('node:path');

let chromium;
for (const p of ['playwright-core', '../.eduharness/node_modules/playwright-core',
                 path.join(__dirname, '..', '.eduharness/node_modules/playwright-core')]) {
  try { ({ chromium } = require(p)); break; } catch (_) { /* next */ }
}
if (!chromium) throw new Error('no playwright-core: install the .eduharness harness');

const args = process.argv.slice(2);
const URL_ = args.find(a => !a.startsWith('--')) || 'http://127.0.0.1:5174/';
const oi = args.indexOf('--out');
const OUT = oi >= 0 ? args[oi + 1] : '/private/tmp/claude-501/town-exit';
const ti = args.indexOf('--tag');
const TAG = ti >= 0 ? args[ti + 1] : 'post';

const GREENHOLLOW = JSON.parse(fs.readFileSync(
  path.join(__dirname, '..', 'public/act1-hifi/town/greenhollow-town.json'), 'utf8'));
const SEED = { x: 69, y: 257 };
const DOOR = { seed: SEED, dir: 'ArrowUp' };
const EXIT_CELL = GREENHOLLOW.exit.cell;          // [32.19, 57.0], axis south (EXIT_SIGN=1)

const results = [];
function check(name, ok, detail) {
  results.push({ name, ok, detail });
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  -- ${detail}` : ''}`);
}

function save(x, y, flags) {
  return { version: 4, timestamp: Date.now(),
    player: { name: 'Hollow', heroColor: 'gray', level: 8, exp: 0, expToNext: 100,
      hp: 70, maxHp: 70, atk: 22, def: 12, spd: 10,
      equipment: { weapon: null, armor: null, shield: null, helmet: null, accessory: null },
      inventory: [{ itemId: 'herb', quantity: 3 }], gold: 200,
      position: { mapId: 'overworld', x, y, floor: 1 },
      storyFlags: { 'intro.done': true, ...flags },
      activeQuests: [], completedQuests: [], questProgress: {},
      timerEnabled: false, quizDifficulty: '3', locale: 'en', soundEnabled: false,
      masterVolume: 0, kanjiMode: false },
    playtime: 0, quizStats: {} };
}

async function gotoWithRetry(page, url, attempts = 6) {
  let lastErr;
  for (let i = 0; i < attempts; i += 1) {
    try {
      // eslint-disable-next-line no-await-in-loop
      await page.goto(url, { waitUntil: 'load', timeout: 45_000 });
      return;
    } catch (err) {
      lastErr = err;
      console.log(`  (goto attempt ${i + 1}/${attempts} timed out, retrying)`);
    }
  }
  throw lastErr;
}

async function bootToOverworld(page, storySeed) {
  await gotoWithRetry(page, URL_);
  await page.waitForFunction(() => !!window.__PHASER_GAME__, { timeout: 30_000 });
  await page.evaluate((s) => {
    localStorage.clear();
    localStorage.setItem('edu-rpg-save', JSON.stringify(s));
  }, storySeed);
  for (let i = 0; i < 6; i += 1) {
    try {
      // eslint-disable-next-line no-await-in-loop
      await page.reload({ waitUntil: 'load', timeout: 45_000 });
      break;
    } catch (err) {
      if (i === 5) throw err;
      console.log(`  (reload attempt ${i + 1}/6 timed out, retrying)`);
    }
  }
  await page.waitForFunction(() => !!window.__PHASER_GAME__, { timeout: 30_000 });
  await page.evaluate(() => {
    const g = window.__PHASER_GAME__;
    if (g.scene.isActive('BootScene')) { g.scene.start('TitleScene'); g.scene.stop('BootScene'); }
  });
  await page.waitForFunction(() => {
    const g = window.__PHASER_GAME__, t = g && g.scene.getScene('TitleScene');
    return t && g.scene.isActive('TitleScene') && t.menuItems?.length > 0;
  }, { timeout: 20_000 });
  await page.evaluate(() => {
    const t = window.__PHASER_GAME__.scene.getScene('TitleScene');
    const i = t.menuItems.findIndex(m => m.getData?.('action') === 'continue');
    if (i < 0) throw new Error('continue unavailable');
    t.selectedIndex = i; t.confirmTitle();
  });
  await page.waitForFunction(() => window.__PHASER_GAME__.scene.isActive('WorldMapScene'), { timeout: 25_000 });
  await page.waitForFunction(() => {
    const w = window.__PHASER_GAME__.scene.getScene('WorldMapScene');
    return w && w.currentMapId === 'overworld' && !!window.__ACT1_WORLD_MAP__
      && window.__ACT1_WORLD_MAP__.state.appliedMap === w.mapData;
  }, { timeout: 25_000 });
  await page.waitForTimeout(1200);
}

async function walkIn(page, townId, seed, dir, timeoutMs = 150_000) {
  await page.evaluate(({ x, y }) => {
    const w = window.__PHASER_GAME__.scene.getScene('WorldMapScene');
    w.transitionCooldown = 0; w.showingMessage = false; w.isMoving = false; w.hideMessage?.();
    w.heroTileX = x; w.heroTileY = y;
    if (w.hero) { w.hero.x = x * 48 + 24; w.hero.y = y * 48 + 24; }
    w.updatePosition?.(); w.updateCamera?.();
  }, seed);
  await page.waitForTimeout(400);
  await page.keyboard.down(dir);
  const deadline = Date.now() + timeoutMs;
  let seen = null;
  while (Date.now() < deadline) {
    await page.waitForTimeout(150);
    // eslint-disable-next-line no-await-in-loop
    seen = await page.evaluate(() => {
      const f = document.querySelector('#act1-hifi-preserved-root iframe');
      const t = f?.contentWindow?.__ACT1_TOWN__ ?? null;
      return { ready: document.querySelector('#act1-hifi-preserved-root')?.dataset.ready ?? null,
               townId: t?.town?.id ?? null };
    });
    if (seen.townId === townId && seen.ready === 'true') break;
  }
  await page.keyboard.up(dir);
  await page.waitForTimeout(900);
  if (seen?.townId !== townId) throw new Error(`never entered ${townId}: ${JSON.stringify(seen)}`);
}

async function placeAt(page, cell) {
  const frameSel = '#act1-hifi-preserved-root iframe';
  await page.evaluate(([sel, c]) => {
    const f = document.querySelector(sel);
    f.src = f.getAttribute('src').replace(/&at=[^&]*/, '') + `&at=${c}`;
  }, [frameSel, `${cell[0]},${cell[1]}`]);
  await page.waitForFunction(sel => document.querySelector(sel)?.contentWindow?.__ACT1_TOWN__,
    frameSel, { timeout: 20_000 });
  await page.waitForTimeout(900);
}

// Reads the town canvas pixel at a WORLD-space point, converting through the same camera transform
// draw() uses (dpr * camera.zoom scale, camera.x/y translate) so this samples the exact pixel the
// player would see, not a canvas-space guess.
async function readTownWorldPixel(page, worldX, worldY) {
  const frameSel = '#act1-hifi-preserved-root iframe';
  return page.evaluate(([sel, wx, wy]) => {
    const f = document.querySelector(sel);
    const win = f.contentWindow, doc = f.contentDocument;
    const t = win.__ACT1_TOWN__;
    const canvas = doc.querySelector('#world');
    const ctx = canvas.getContext('2d');
    const dpr = Math.min(3, win.devicePixelRatio || 1);
    const cx = Math.round((wx - t.camera.x) * dpr * t.camera.zoom);
    const cy = Math.round((wy - t.camera.y) * dpr * t.camera.zoom);
    const cxClamped = Math.max(0, Math.min(canvas.width - 1, cx));
    const cyClamped = Math.max(0, Math.min(canvas.height - 1, cy));
    const d = ctx.getImageData(cxClamped, cyClamped, 1, 1).data;
    return { r: d[0], g: d[1], b: d[2], cx, cy, canvasW: canvas.width, canvasH: canvas.height };
  }, [frameSel, worldX, worldY]);
}

function colorDistance(px, target) {
  return Math.sqrt((px.r - target[0]) ** 2 + (px.g - target[1]) ** 2 + (px.b - target[2]) ** 2);
}

async function meanBrightness(page, selectorInfo) {
  // selectorInfo: { where: 'town' } samples the town iframe's canvas; { where: 'overworld' } the
  // top-level Phaser canvas inside #game-container. Averages a small centre patch rather than the
  // whole frame -- cheap, and the fade is uniform so a patch is representative.
  return page.evaluate((where) => {
    let canvas;
    if (where === 'town') {
      const f = document.querySelector('#act1-hifi-preserved-root iframe');
      canvas = f?.contentDocument?.querySelector('#world') ?? null;
    } else {
      canvas = document.querySelector('#game-container canvas');
    }
    if (!canvas || !canvas.width || !canvas.height) return null;
    const ctx = canvas.getContext('2d') || canvas.getContext('webgl');
    let data;
    try {
      if (ctx.getImageData) {
        const w = Math.min(60, canvas.width), h = Math.min(60, canvas.height);
        const x0 = Math.floor((canvas.width - w) / 2), y0 = Math.floor((canvas.height - h) / 2);
        data = ctx.getImageData(x0, y0, w, h).data;
      } else {
        return null;   // WebGL overworld canvas: not readable this way, see the fade-div timeline instead
      }
    } catch (e) { return null; }
    let sum = 0, n = 0;
    for (let i = 0; i < data.length; i += 4) { sum += (data[i] + data[i + 1] + data[i + 2]) / 3; n += 1; }
    return sum / n;
  }, selectorInfo.where);
}

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch({ headless: true, channel: 'chrome',
    args: ['--use-angle=swiftshader', '--enable-webgl', '--ignore-gpu-blocklist', '--mute-audio'] });
  const page = await browser.newPage({ viewport: { width: 960, height: 720 } });
  const errors = [];
  page.on('pageerror', e => errors.push(`pageerror: ${e.message}`));
  page.on('console', m => {
    if (m.type() === 'error' && !m.text().includes('Failed to load resource')) errors.push(`console: ${m.text()}`);
  });

  try {
    // ================= CHECK 1: the map visibly ends at the mouth (pixel) =====================
    console.log(`\nPIXEL  (${TAG}) the apron beyond the mouth reads as void, not grass`);
    await bootToOverworld(page, save(SEED.x, SEED.y, { 'act1.townOpened.greenhollow': true }));
    await walkIn(page, 'greenhollow', DOOR.seed, DOOR.dir);
    // Standing AT the exit line itself never arms/fires it (outward starts at exactly 0, and arming
    // needs outward <= -0.75 to have been true at some point) -- see town.html's exit-crossing
    // block -- so this is a safe vantage point from which to sample without triggering the exit.
    await placeAt(page, EXIT_CELL);
    await page.screenshot({ path: path.join(OUT, `${TAG === 'pre' ? 'before' : 'after'}.png`) });
    const sample = await readTownWorldPixel(page,
      EXIT_CELL[0] * GREENHOLLOW.worldPxPerCell, (EXIT_CELL[1] + 3) * GREENHOLLOW.worldPxPerCell);
    const VOID = [2, 6, 10];
    const dist = colorDistance(sample, VOID);
    check('3 cells beyond the mouth reads within 40 of #02060a (void), not grass',
      dist <= 40, `rgb(${sample.r},${sample.g},${sample.b}) dist=${dist.toFixed(1)} from rgb(2,6,10) `
        + `at canvas (${sample.cx},${sample.cy}) of ${sample.canvasW}x${sample.canvasH}`);

    // ================= CHECK 2: timing -- fade holds the transition, not a cut ================
    console.log(`\nTIMING (${TAG}) crossing to act1-town-exit is held for a real fade, not instant`);
    await bootToOverworld(page, save(SEED.x, SEED.y, { 'act1.townOpened.greenhollow': true }));
    await walkIn(page, 'greenhollow', DOOR.seed, DOOR.dir);
    // Stand 2 cells inside the mouth (armed) and record the wall-clock the crossing test itself
    // flips `exiting` true, on the SAME clock (Date.now(), read from the top page) as the
    // act1-town-exit postMessage listener below, so the two timestamps are directly comparable.
    await placeAt(page, [EXIT_CELL[0], EXIT_CELL[1] - 2]);
    await page.evaluate(() => {
      window.__exitMsgAt = null;
      window.addEventListener('message', e => {
        if (e.data && e.data.type === 'act1-town-exit' && window.__exitMsgAt === null) {
          window.__exitMsgAt = Date.now();
        }
      });
      window.__crossAt = null;
      window.__brightnessLog = [];
      (function tick() {
        const f = document.querySelector('#act1-hifi-preserved-root iframe');
        const t = f?.contentWindow?.__ACT1_TOWN__;
        if (t) {
          if (window.__crossAt === null && t.exitState().exiting) window.__crossAt = Date.now();
        }
        if (window.__crossAt !== null && window.__brightnessLog.length < 60) {
          window.__brightnessLog.push({ t: Date.now() - window.__crossAt, phase: t ? 'town' : 'overworld' });
        }
        requestAnimationFrame(tick);
      })();
    });
    await page.evaluate(sel => document.querySelector(sel).contentWindow.focus(),
      '#act1-hifi-preserved-root iframe');
    await page.keyboard.down('ArrowDown');
    const dl = Date.now() + 20_000;
    let backOut = false;
    let frameN = 0;
    const savedFrames = [];
    while (Date.now() < dl) {
      // eslint-disable-next-line no-await-in-loop
      await page.waitForTimeout(40);
      // eslint-disable-next-line no-await-in-loop
      const crossed = await page.evaluate(() => window.__crossAt !== null);
      if (crossed && frameN < 12) {
        // eslint-disable-next-line no-await-in-loop
        const fp = path.join(OUT, `fade-${String(frameN).padStart(2, '0')}.png`);
        // eslint-disable-next-line no-await-in-loop
        await page.screenshot({ path: fp });
        savedFrames.push(fp);
        frameN += 1;
      }
      // eslint-disable-next-line no-await-in-loop
      if (await page.evaluate(() =>
        !document.querySelector('#act1-hifi-preserved-root iframe')?.contentWindow?.__ACT1_TOWN__)) {
        backOut = true;
        break;
      }
    }
    await page.keyboard.up('ArrowDown');
    // Keep sampling briefly after the swap for the fade-IN half.
    for (let i = 0; i < 8 && frameN < 20; i += 1) {
      // eslint-disable-next-line no-await-in-loop
      await page.waitForTimeout(40);
      // eslint-disable-next-line no-await-in-loop
      const fp = path.join(OUT, `fade-${String(frameN).padStart(2, '0')}.png`);
      // eslint-disable-next-line no-await-in-loop
      await page.screenshot({ path: fp });
      savedFrames.push(fp);
      frameN += 1;
    }
    const timing = await page.evaluate(() => ({
      crossAt: window.__crossAt, exitMsgAt: window.__exitMsgAt, log: window.__brightnessLog,
    }));
    const holdMs = (timing.crossAt !== null && timing.exitMsgAt !== null)
      ? timing.exitMsgAt - timing.crossAt : null;
    check('made it back to the overworld', backOut, `backOut=${backOut}`);
    check('the crossing was actually observed', timing.crossAt !== null, `crossAt=${timing.crossAt}`);
    check('act1-town-exit was held >= 250ms after the crossing (screen.transition=300ms)',
      holdMs !== null && holdMs >= 250, `held ${holdMs === null ? 'n/a (never posted)' : holdMs + 'ms'}`);
    console.log(`  frames saved: ${savedFrames.length} in ${OUT}`);

    // ---- brightness trend from the getImageData log, town-phase samples only (webgl overworld
    // canvas is not readable this way -- the fade-div opacity timeline below covers the overworld
    // half instead). ----
    const townSamples = [];
    for (const entry of timing.log || []) {
      if (entry.phase !== 'town') continue;
    }
    // Read brightness directly at a few of the saved instants instead of relying on the phase log
    // above (kept for the raw evidence file only): revisit is not possible after the fact for a
    // headless run, so this check instead asserts on the DIV opacity timeline, which is exact and
    // does not depend on canvas readback working on this GPU backend.
    fs.writeFileSync(path.join(OUT, `${TAG}-brightness-log.json`), JSON.stringify(timing, null, 2));

    // ================= CHECK 3: the fade elements actually animate (mechanism) ================
    console.log(`\nMECHANISM (${TAG}) #exitFade and #act1-overworld-fade opacity actually move`);
    await bootToOverworld(page, save(SEED.x, SEED.y, { 'act1.townOpened.greenhollow': true }));
    await walkIn(page, 'greenhollow', DOOR.seed, DOOR.dir);
    await placeAt(page, [EXIT_CELL[0], EXIT_CELL[1] - 2]);
    await page.evaluate(() => {
      window.__opacityLog = [];
      const f = document.querySelector('#act1-hifi-preserved-root iframe');
      (function tick() {
        const started = Date.now();
        if (!window.__opStart) window.__opStart = started;
        const townFade = f?.contentDocument?.querySelector('#exitFade');
        const owFade = document.querySelector('#act1-overworld-fade');
        window.__opacityLog.push({
          t: Date.now() - window.__opStart,
          town: townFade ? getComputedStyle(townFade).opacity : null,
          overworld: owFade ? getComputedStyle(owFade).opacity : null,
        });
        if (window.__opacityLog.length < 250) requestAnimationFrame(tick);
      })();
    });
    await page.evaluate(sel => document.querySelector(sel).contentWindow.focus(),
      '#act1-hifi-preserved-root iframe');
    await page.keyboard.down('ArrowDown');
    await page.waitForTimeout(1600);
    await page.keyboard.up('ArrowDown');
    // The overworld load that follows the swap blocks the main thread for seconds (SMOOTH-5), so
    // the rAF sampler above gets starved and the fade-in's release lands well after the crossing.
    // 600 ms here read the still-held fade as "never released" (2026-09-02); wait long enough for
    // the overworld to be placed and the 300 ms release to play before judging.
    await page.waitForTimeout(6000);
    const opLog = await page.evaluate(() => window.__opacityLog || []);
    fs.writeFileSync(path.join(OUT, `${TAG}-opacity-log.json`), JSON.stringify(opLog, null, 2));
    const townOpacities = opLog.map(e => parseFloat(e.town)).filter(n => !Number.isNaN(n));
    const owOpacities = opLog.map(e => parseFloat(e.overworld)).filter(n => !Number.isNaN(n));
    // What the PLAYER sees before the swap is the darker of the two veils: the town's #exitFade
    // inside the iframe and the parent's #act1-overworld-fade over the HUD (act1-town-exit-start).
    // Once the parent's veil is opaque Chrome stops advancing the occluded iframe's transition, so
    // the town's own number can stall at 0.5-0.7 while the screen is already black; judge the
    // combined visible opacity over the samples taken while the town frame still existed.
    const seen = opLog.filter(e => e.town !== null && e.town !== undefined)
      .map(e => Math.max(parseFloat(e.town) || 0, parseFloat(e.overworld) || 0));
    // The swap's own loadMap() blocks the main thread for ~2 s starting ~300 ms after the crossing,
    // so the sampler routinely misses the top of the ramp; accept the ramp if it was rising and
    // either reached 0.8 while the town was still up, or the parent veil is already at >= 0.9 on
    // the first sample after the town frame is gone (the held black the player actually sees).
    const firstAfter = opLog.find(e => (e.town === null || e.town === undefined) && e.overworld !== null);
    const heldAtSwap = firstAfter ? (parseFloat(firstAfter.overworld) || 0) >= 0.9 : false;
    const townRose = seen.some((v, i) => i > 0 && v > seen[i - 1] + 0.05)
      && (Math.max(...(seen.length ? seen : [0])) >= 0.8 || heldAtSwap);
    const owFellBackFromOne = owOpacities.some(v => v >= 0.8)
      && owOpacities[owOpacities.length - 1] < 0.2;
    check('the visible fade (town #exitFade or the parent veil) rose toward 1 before the swap', townRose,
      `max visible before swap=${seen.length ? Math.max(...seen).toFixed(2) : 'n/a'}, veil at swap=${firstAfter ? firstAfter.overworld : 'n/a'}`);
    check('#act1-overworld-fade opacity was held near 1 then released back toward 0', owFellBackFromOne,
      `samples=${owOpacities.length}, last=${owOpacities[owOpacities.length - 1]}`);
  } catch (err) {
    console.error('\nHARNESS ERROR', err.stack || err.message);
    check('harness completed without throwing', false, err.message);
  } finally {
    if (errors.length) console.log('\nPage errors observed:\n' + errors.map(e => `  ${e}`).join('\n'));
    await browser.close();
  }

  const fail = results.filter(r => r.ok === false).length;
  console.log(`\n${results.length - fail}/${results.length} PASS` + (fail ? `, ${fail} FAIL` : ''));
  process.exit(fail ? 1 : 0);
})();
