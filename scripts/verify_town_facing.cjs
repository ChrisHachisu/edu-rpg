#!/usr/bin/env node
/* Facing continuity, entering and leaving an Act 1 hi-fi town.
 *
 * WHY A SCRIPT RATHER THAN A LOOK
 *   Before this fix, town.html hard-coded the arrival facing to 'down' no matter which side of the
 *   town the player walked in from, and adapter.js's act1-town-exit handler never touched heroDir
 *   at all, so leaving a town left the overworld hero facing whichever way she faced BEFORE she
 *   ever entered -- usually up, back into the door she just walked out of. Both halves are
 *   state-continuity bugs across the parent/iframe boundary, which a static read of either file
 *   cannot show: the only honest check is to actually walk her through the door and back out and
 *   read the facing the runtime renders on each side.
 *
 * WHAT IT DRIVES
 *   The same real index.html -> adapter.js -> town.html chain scripts/verify_town_owner_items.cjs
 *   drives, out of dist/ -- not town.html loaded standalone, which would bypass adapter.js (the
 *   half of this fix that builds the `?facing=` query and reapplies heroDir on exit).
 *
 * USAGE
 *   node scripts/verify_town_facing.cjs [url] [--out DIR]
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
const OUT = oi >= 0 ? args[oi + 1] : path.join(__dirname, '..', 'design/act1-towns/greenhollow/proof-facing');

const GREENHOLLOW = JSON.parse(fs.readFileSync(
  path.join(__dirname, '..', 'public/act1-hifi/town/greenhollow-town.json'), 'utf8'));
const PORT_SAPPHIRE = JSON.parse(fs.readFileSync(
  path.join(__dirname, '..', 'public/act1-hifi/town/portSapphire-town.json'), 'utf8'));

// Overworld door tiles, read from public/act1-world-map.js's own LANDMARKS (the authority
// scripts/verify_town_owner_items.cjs's SEED is measured against): the trigger tile the hero must
// step onto, approached from one cell further out, walking toward it.
const DOORS = {
  greenhollow: { seed: { x: 69, y: 257 }, dir: 'ArrowUp' },     // trigger (69,255), one cell south
  portSapphire: { seed: { x: 133, y: 351 }, dir: 'ArrowUp' },   // trigger (133,349), two cells south
};

const near = (a, b, tol) => Math.abs(a - b) <= tol;

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

const results = [];
function check(name, ok, detail) {
  results.push({ name, ok, detail });
  console.log(`  ${ok ? 'PASS' : ok === null ? 'UNVERIFIED' : 'FAIL'}  ${name}${detail ? `  -- ${detail}` : ''}`);
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
  return page.evaluate(() => {
    const view = window.__ACT1_TOWN_VIEW__;
    return { viewFacing: view?.facing ?? null,
             src: document.querySelector('#act1-hifi-preserved-root iframe')?.getAttribute('src') ?? null };
  });
}

async function walkOutAndRead(page, atCell, dir, timeoutMs = 90_000) {
  const frameSel = '#act1-hifi-preserved-root iframe';
  await page.evaluate(([sel, cell]) => {
    const f = document.querySelector(sel);
    f.src = f.getAttribute('src').replace(/&at=[^&]*/, '') + `&at=${cell}`;
  }, [frameSel, `${atCell[0]},${atCell[1]}`]);
  await page.waitForFunction(sel => document.querySelector(sel)?.contentWindow?.__ACT1_TOWN__,
    frameSel, { timeout: 20_000 });
  await page.waitForTimeout(900);
  await page.evaluate(sel => document.querySelector(sel).contentWindow.focus(), frameSel);
  await page.keyboard.down(dir);
  const deadline = Date.now() + timeoutMs;
  let backOut = false;
  while (Date.now() < deadline) {
    await page.waitForTimeout(150);
    // eslint-disable-next-line no-await-in-loop
    if (await page.evaluate(sel => !document.querySelector(sel)?.contentWindow?.__ACT1_TOWN__, frameSel)) {
      backOut = true; break;
    }
  }
  await page.keyboard.up(dir);
  if (!backOut) return { backOut: false };
  // Give the parent a moment to finish loadMap() and apply the facing rescue's rAF fallback.
  await page.waitForTimeout(1200);
  const state = await page.evaluate(() => {
    const w = window.__PHASER_GAME__.scene.getScene('WorldMapScene');
    return { mapId: w?.currentMapId, heroDir: w?.heroDir, frame: w?.hero?.frame?.name ?? w?.hero?.frame ?? null };
  });
  return { backOut: true, ...state };
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
    // ---- ENTERING, non-first entry: facing continuity from the overworld -------------------
    console.log('\nENTER-1  non-first entry, walking UP into greenhollow: arrives facing up');
    await bootToOverworld(page, save(69, 257, { 'act1.townOpened.greenhollow': true }));
    let e = await walkIn(page, 'greenhollow', DOORS.greenhollow.seed, DOORS.greenhollow.dir);
    await page.screenshot({ path: path.join(OUT, '01-enter-facing-up.png') });
    check('adapter did NOT pass first=1 (re-entry)', !/[?&]first=1/.test(e.src), e.src);
    check('adapter passed facing=up in the frame query', /[?&]facing=up\b/.test(e.src), e.src);
    check('__ACT1_TOWN_VIEW__.facing is up (she walked in facing up)', e.viewFacing === 'up',
      `facing=${e.viewFacing}`);

    // ---- ENTERING, first entry: firstEntryFacing still wins, unchanged --------------------
    console.log('\nENTER-2  first entry of a playthrough: firstEntryFacing still wins');
    await bootToOverworld(page, save(69, 257));
    e = await walkIn(page, 'greenhollow', DOORS.greenhollow.seed, DOORS.greenhollow.dir);
    await page.screenshot({ path: path.join(OUT, '02-enter-first-entry.png') });
    check('adapter passed first=1', /[?&]first=1/.test(e.src), e.src);
    check(`__ACT1_TOWN_VIEW__.facing is firstEntryFacing (${GREENHOLLOW.firstEntryFacing})`,
      e.viewFacing === GREENHOLLOW.firstEntryFacing, `facing=${e.viewFacing}`);

    // ---- LEAVING, greenhollow's south mouth: overworld heroDir/frame face south -----------
    console.log('\nEXIT-1  walking out of greenhollow\'s south mouth: overworld hero faces down');
    await bootToOverworld(page, save(69, 257, { 'act1.townOpened.greenhollow': true }));
    await walkIn(page, 'greenhollow', DOORS.greenhollow.seed, DOORS.greenhollow.dir);
    const exitCellGH = GREENHOLLOW.exit.cell;
    const atGH = [exitCellGH[0], exitCellGH[1] - 1.5];   // 1.5 cells inside the mouth, armed on load
    const out1 = await walkOutAndRead(page, atGH, 'ArrowDown');
    await page.screenshot({ path: path.join(OUT, '03-exit-greenhollow-south.png') });
    check('made it back to the overworld', out1.backOut && out1.mapId === 'overworld',
      JSON.stringify(out1));
    check('WorldMapScene.heroDir is 0 (down)', out1.heroDir === 0, `heroDir=${out1.heroDir}`);
    check('the drawn hero frame is 0 (down row)', out1.frame === 0, `frame=${JSON.stringify(out1.frame)}`);

    // ---- LEAVING, Port Sapphire's north mouth: overworld heroDir/frame face north ---------
    console.log('\nEXIT-2  walking out of Port Sapphire\'s north mouth: overworld hero faces up');
    let out2 = { backOut: false };
    try {
      await bootToOverworld(page, save(133, 351, { 'act1.townOpened.portSapphire': true }));
      await walkIn(page, 'portSapphire', DOORS.portSapphire.seed, DOORS.portSapphire.dir);
      const exitCellPS = PORT_SAPPHIRE.exit.cell;
      const atPS = [exitCellPS[0], exitCellPS[1] + 1.5];  // 1.5 cells inside the mouth (south of it)
      out2 = await walkOutAndRead(page, atPS, 'ArrowUp');
      await page.screenshot({ path: path.join(OUT, '04-exit-portsapphire-north.png') });
    } catch (err) {
      out2 = { backOut: false, error: err.message };
    }
    if (out2.backOut) {
      check('made it back to the overworld (Port Sapphire)', out2.mapId === 'overworld', JSON.stringify(out2));
      check('WorldMapScene.heroDir is 3 (up)', out2.heroDir === 3, `heroDir=${out2.heroDir}`);
      check('the drawn hero frame is 9 (up row = 3*3)', out2.frame === 9, `frame=${JSON.stringify(out2.frame)}`);
    } else {
      check('Port Sapphire north-mouth exit', null, `UNVERIFIED -- could not reach/exit within the harness: ${out2.error || JSON.stringify(out2)}`);
    }
  } catch (err) {
    console.error('\nHARNESS ERROR', err.stack || err.message);
    check('harness completed without throwing', false, err.message);
  } finally {
    if (errors.length) console.log('\nPage errors observed:\n' + errors.map(e => `  ${e}`).join('\n'));
    await browser.close();
  }

  const fail = results.filter(r => r.ok === false).length;
  const unverified = results.filter(r => r.ok === null).length;
  console.log(`\n${results.length - fail - unverified}/${results.length} PASS`
    + (unverified ? `, ${unverified} UNVERIFIED` : '') + (fail ? `, ${fail} FAIL` : ''));
  process.exit(fail ? 1 : 0);
})();
