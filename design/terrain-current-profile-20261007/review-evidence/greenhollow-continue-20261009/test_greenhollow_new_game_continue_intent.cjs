#!/usr/bin/env node
/* Exercises the real title actions, frozen game state, and town adapter. `serve` defaults to clean
 * URLs, which redirects town.html?town=... to /town and breaks its relative resources. Preserve
 * the extension while serving the frozen artifact:
 *
 *   printf '{"cleanUrls":false}\n' > /tmp/edu-rpg-serve.json
 *   npx serve -s dist -l 5174 --no-clipboard --config /tmp/edu-rpg-serve.json
 *   node scripts/test_greenhollow_new_game_continue_intent.cjs
 *
 * The test routes only act1-hifi/adapter.js to the actual public source under test; all other
 * requests are served from the preserved dist bundle and assets.
 */
const path = require('node:path');
const fs = require('node:fs');

let chromium;
for (const p of ['playwright-core', '../.eduharness/node_modules/playwright-core',
                 path.join(__dirname, '..', '.eduharness/node_modules/playwright-core')]) {
  try { ({ chromium } = require(p)); break; } catch (_) { /* next */ }
}
if (!chromium) throw new Error('no playwright-core: install the .eduharness harness');

const BASE = process.argv[2] || 'http://127.0.0.1:5174/';
const ONLY = process.argv.find(arg => arg.startsWith('--only='))?.slice('--only='.length) || '';
const ADAPTER = fs.readFileSync(path.join(__dirname, '../public/act1-hifi/adapter.js'), 'utf8');
const town = require('../public/act1-hifi/town/greenhollow-town.json');
const near = (a, b, tolerance = 0.35) => Math.abs(a - b) <= tolerance;
const CHECKS = [];
function check(name, ok, detail = '') {
  CHECKS.push({ name, ok, detail });
  console.log(`  ${ok ? 'PASS' : 'FAIL'} ${name}${detail ? ` — ${detail}` : ''}`);
}
function trackPageErrors(page, label, errors) {
  page.on('pageerror', error => errors.push(`${label}: ${error.message}`));
}
function save(mapId, x, y, flags = {}, introDone = true) {
  const storyFlags = { ...flags };
  if (introDone) storyFlags['intro.done'] = true;
  return { version: 4, timestamp: Date.now(), player: {
    name: 'Legacy Hero', heroColor: 'gray', level: 1, exp: 0, expToNext: 100,
    hp: 30, maxHp: 30, atk: 8, def: 3, spd: 5, equipment: {}, inventory: [], gold: 0,
    position: { mapId, x, y, floor: 1 }, storyFlags,
    activeQuests: [], completedQuests: [], questProgress: {}, timerEnabled: false,
    quizDifficulty: '3', locale: 'en', soundEnabled: false, masterVolume: 0, kanjiMode: false
  }, playtime: 0, quizStats: {} };
}
async function useProductionAdapter(page) {
  await page.route('**/act1-hifi/adapter.js', route => route.fulfill({
    status: 200, contentType: 'application/javascript; charset=utf-8', body: ADAPTER
  }));
}

async function seedOnce(page, values) {
  await page.addInitScript(seed => {
    if (location.origin === 'null') return;
    if (sessionStorage.getItem('__elder_intent_fixture_seeded')) return;
    sessionStorage.setItem('__elder_intent_fixture_seeded', '1');
    localStorage.clear();
    for (const [key, value] of Object.entries(seed)) localStorage.setItem(key, value);
  }, values);
}

async function waitForWorldMap(page, mapId, timeout = 20_000) {
  await page.waitForFunction(id => {
    const g = window.__PHASER_GAME__;
    const w = g?.scene?.getScene('WorldMapScene');
    return g?.scene?.isActive('WorldMapScene') && w?.currentMapId === id;
  }, mapId, { timeout });
}

async function worldIntroState(page) {
  return page.evaluate(() => {
    const w = window.__PHASER_GAME__?.scene?.getScene('WorldMapScene');
    const flags = window.__GAME_STATE__?.player?.state?.storyFlags || {};
    return { showingMessage: !!w?.showingMessage, message: w?.messageText?.text || null,
      introDone: flags['intro.done'] === true, position: window.__GAME_STATE__?.player?.state?.position || null };
  });
}

async function main() {
  const browser = await chromium.launch({ headless: true, channel: 'chrome',
    args: ['--use-angle=swiftshader', '--enable-webgl', '--ignore-gpu-blocklist', '--mute-audio'] });
  const page = await browser.newPage({ viewport: { width: 960, height: 720 } });
  const errors = [];
  trackPageErrors(page, 'new-game page', errors);
  try {
    if (ONLY !== 'continue-intent' && ONLY !== 'ngplus') {
    // Actual New Game button -> character setup -> Start Game calls frozen GameState.newGame().
    await useProductionAdapter(page);
    let townAttempts = 0;
    await page.route('**/act1-hifi/town.html*', async route => {
      townAttempts += 1;
      if (ONLY !== 'ngplus' && townAttempts === 1) await route.abort();
      else await route.continue();
    });
    await page.goto(BASE, { waitUntil: 'domcontentloaded', timeout: 30_000 });
    await page.waitForFunction(() => !!window.__PHASER_GAME__, { timeout: 20_000 });
    await page.waitForSelector('[data-act="titleNew"]', { timeout: 20_000 });
    await page.locator('[data-act="titleNew"]').click();
    await page.waitForSelector('[data-act="introStart"]', { timeout: 10_000 });
    const name = page.locator('#qok-name');
    if (await name.count()) await name.fill('Opening Test');
    await page.locator('[data-act="introStart"]').click();
    await page.waitForFunction(() => window.__PHASER_GAME__?.scene.isActive('WorldMapScene'), { timeout: 20_000 });
    if (ONLY !== 'ngplus') {
      await page.waitForFunction(() => window.__QOK_COVER__?.phase?.() === 'error', { timeout: 20_000 });
      check('New Game town start reaches the visible retry after the simulated first-frame failure',
        townAttempts === 1, `townAttempts=${townAttempts}`);
      await page.locator('#boot-cover .bc-retry').click();
    }
    try {
      await page.waitForFunction(() => {
        const root = document.querySelector('#act1-hifi-preserved-root');
        return root?.dataset.ready === 'true' && root.querySelector('iframe')?.contentWindow?.__ACT1_TOWN__;
      }, { timeout: 25_000 });
    } catch (error) {
      const state = await page.evaluate(() => {
        const root = document.querySelector('#act1-hifi-preserved-root');
        const frame = root?.querySelector('iframe');
        const world = window.__PHASER_GAME__?.scene?.getScene('WorldMapScene');
        return { phase: window.__QOK_COVER__?.phase?.(), rootReady: root?.dataset.ready,
          rootHidden: root?.hidden, frameSrc: frame?.src,
          frameDocumentReady: (() => { try { return frame?.contentDocument?.readyState || null; } catch (_) { return 'cross-origin'; } })(),
          townRuntimeReady: !!frame?.contentWindow?.__ACT1_TOWN__, worldActive: !!world,
          worldMap: world?.currentMapId || null,
          cutover: window.__ACT1_PRESERVED_CUTOVER__?.snapshot?.() || null };
      });
      throw new Error(`${error.message}; retry state: ${JSON.stringify({ townAttempts, ...state })}`);
    }
    const fresh = await page.evaluate(() => {
      const frame = document.querySelector('#act1-hifi-preserved-root iframe');
      const runtime = frame.contentWindow.__ACT1_TOWN__;
      const pos = runtime.position(), scale = runtime.town.worldPxPerCell;
      return { src: frame.src, cell: [pos.x / scale, pos.y / scale],
        flag: window.__GAME_STATE__.player.state.storyFlags['act1.townOpened.greenhollow'],
        intro: !!window.__PHASER_GAME__.scene.getScene('WorldMapScene').showingMessage };
    });
    check('actual New Game still starts the Elder opening', fresh.intro, JSON.stringify(fresh));
    check('actual New Game uses the Elder opening', /[?&]first=1/.test(fresh.src), fresh.src);
    check('New Game enters at the authored Elder cell',
      near(fresh.cell[0], town.firstEntryCell[0]) && near(fresh.cell[1], town.firstEntryCell[1]),
      `cell ${fresh.cell.map(n => n.toFixed(2))}`);
    check('successful opening writes the existing town-opened flag', fresh.flag === true, `${fresh.flag}`);
    if (ONLY !== 'ngplus') {
      check('retry consumed the original New Game intent only after the town became ready',
        townAttempts >= 2 && /[?&]first=1/.test(fresh.src), `attempts=${townAttempts}; ${fresh.src}`);
    }
    await page.close();
    } else {
      await page.close();
    }

    if (!ONLY || ONLY === 'continue-intent') {
    if (ONLY !== 'continue-intent') {
    // Legacy Continue: actual save selected by the TitleScene. It must stay on the overworld
    // until the player moves onto the authored entry cell, then arrive at the gate.
    const legacyPage = await browser.newPage({ viewport: { width: 960, height: 720 } });
    await useProductionAdapter(legacyPage);
    trackPageErrors(legacyPage, 'legacy-continue page', errors);
    const legacy = save('overworld', 69, 256, {}, false);
    await seedOnce(legacyPage, { 'edu-rpg-save': JSON.stringify(legacy) });
    await legacyPage.goto(BASE, { waitUntil: 'domcontentloaded', timeout: 30_000 });
    await legacyPage.waitForFunction(() => !!window.__PHASER_GAME__, { timeout: 20_000 });
    await legacyPage.waitForSelector('[data-act="titleContinue"]', { timeout: 20_000 });
    await legacyPage.locator('[data-act="titleContinue"]').click();
    await legacyPage.waitForFunction(() => window.__PHASER_GAME__?.scene.isActive('WorldMapScene')
      && window.__PHASER_GAME__.scene.getScene('WorldMapScene').currentMapId === 'overworld', { timeout: 20_000 });
    await legacyPage.waitForTimeout(900);
    const stayed = await legacyPage.evaluate(() => ({
      map: window.__PHASER_GAME__.scene.getScene('WorldMapScene').currentMapId,
      town: !!document.querySelector('#act1-hifi-preserved-root iframe')?.contentWindow?.__ACT1_TOWN__,
      position: window.__GAME_STATE__.player.state.position,
      introDone: window.__GAME_STATE__.player.state.storyFlags['intro.done'] === true
    }));
    check('successful legacy Continue migrates only the intro flag', stayed.introDone,
      JSON.stringify(stayed));
    check('legacy Continue stays at its saved overworld location until movement',
      stayed.map === 'overworld' && !stayed.town && stayed.position.mapId === 'overworld'
        && stayed.position.x === 69 && stayed.position.y === 256,
      JSON.stringify(stayed));
    await legacyPage.keyboard.down('ArrowUp');
    await legacyPage.waitForFunction(() => {
      const frame = document.querySelector('#act1-hifi-preserved-root iframe');
      return document.querySelector('#act1-hifi-preserved-root')?.dataset.ready === 'true'
        && frame?.contentWindow?.__ACT1_TOWN__?.town?.id === 'greenhollow';
    }, { timeout: 20_000 });
    await legacyPage.keyboard.up('ArrowUp');
    const legacyTown = await legacyPage.evaluate(() => {
      const frame = document.querySelector('#act1-hifi-preserved-root iframe');
      const runtime = frame.contentWindow.__ACT1_TOWN__;
      const pos = runtime.position(), scale = runtime.town.worldPxPerCell;
      return { src: frame.src, cell: [pos.x / scale, pos.y / scale] };
    });
    check('legacy Continue arrives at the town gate, not Elder Rowan',
      !/[?&]first=1/.test(legacyTown.src)
        && near(legacyTown.cell[0], town.startCell[0]) && near(legacyTown.cell[1], town.startCell[1]),
      `src=${legacyTown.src}; cell=${legacyTown.cell.map(n => n.toFixed(2))}`);
    await legacyPage.close();

    // Real Continue -> town Save service -> cold relaunch -> Continue, using the frozen bundle
    // and adapter. This catches the regression where town Save persisted compass.visited but not
    // intro.done, causing WorldMapScene.create() to replay the New-Game narration on next launch.
    const savedCell = [35.803, 33.573];
    const townPage = await browser.newPage({ viewport: { width: 960, height: 720 } });
    await useProductionAdapter(townPage);
    trackPageErrors(townPage, 'town-save page', errors);
    await seedOnce(townPage, { 'edu-rpg-save': JSON.stringify(save('greenhollow', ...savedCell, {}, false)) });
    await townPage.goto(BASE, { waitUntil: 'domcontentloaded', timeout: 30_000 });
    await townPage.waitForFunction(() => !!window.__PHASER_GAME__, { timeout: 20_000 });
    await townPage.waitForSelector('[data-act="titleContinue"]', { timeout: 20_000 });
    await townPage.locator('[data-act="titleContinue"]').click();
    await townPage.waitForFunction(() => {
      const frame = document.querySelector('#act1-hifi-preserved-root iframe');
      return document.querySelector('#act1-hifi-preserved-root')?.dataset.ready === 'true'
        && frame?.contentWindow?.__ACT1_TOWN__?.town?.id === 'greenhollow';
    }, { timeout: 25_000 });
    const introAfterTownContinue = await worldIntroState(townPage);
    check('saved-town Continue suppresses the legacy Elder opening before world start',
      introAfterTownContinue.introDone && !introAfterTownContinue.showingMessage,
      JSON.stringify(introAfterTownContinue));
    const service = await townPage.evaluate(() => {
      const frame = document.querySelector('#act1-hifi-preserved-root iframe');
      return frame.contentWindow.__ACT1_TOWN__.nearestService()?.kind || null;
    });
    check('saved position is at the actual Save service', service === 'save', `service=${service}`);
    await townPage.evaluate(() => document.querySelector('#act1-hifi-preserved-root iframe')
      .contentWindow.__ACT1_TOWN__.interact());
    await townPage.waitForFunction(() => {
      const saved = JSON.parse(localStorage.getItem('edu-rpg-save') || 'null');
      return saved?.player?.position?.mapId === 'greenhollow'
        && saved.player.storyFlags?.['intro.done'] === true;
    }, { timeout: 10_000 });
    const savedAfterService = await townPage.evaluate(() => JSON.parse(localStorage.getItem('edu-rpg-save')));
    check('real town Save persists intro.done and preserves the existing live flags',
      savedAfterService.player.storyFlags['intro.done'] === true
        && Object.keys(savedAfterService.player.storyFlags).every(key => key === 'intro.done'
          || key === 'compass.visited.greenhollow'), JSON.stringify(savedAfterService.player.storyFlags));
    // Force a normal cold title/Continue path rather than letting the crash-recovery beacon
    // choose Continue for us. The subsequent action is still the frozen TitleScene Continue.
    await townPage.evaluate(() => localStorage.removeItem('edu-rpg-hb'));
    await townPage.reload({ waitUntil: 'domcontentloaded', timeout: 30_000 });
    await townPage.waitForFunction(() => !!window.__PHASER_GAME__, { timeout: 20_000 });
    await townPage.waitForSelector('[data-act="titleContinue"]', { timeout: 20_000 });
    await townPage.locator('[data-act="titleContinue"]').click();
    await townPage.waitForFunction(() => {
      const frame = document.querySelector('#act1-hifi-preserved-root iframe');
      return document.querySelector('#act1-hifi-preserved-root')?.dataset.ready === 'true'
        && frame?.contentWindow?.__ACT1_TOWN__?.town?.id === 'greenhollow';
    }, { timeout: 25_000 });
    const savedTown = await townPage.evaluate(() => {
      const frame = document.querySelector('#act1-hifi-preserved-root iframe');
      const runtime = frame.contentWindow.__ACT1_TOWN__, pos = runtime.position();
      const scale = runtime.town.worldPxPerCell;
      const scene = window.__PHASER_GAME__.scene.getScene('WorldMapScene');
      return { src: frame.src, cell: [pos.x / scale, pos.y / scale],
        intro: !!scene.showingMessage,
        flags: window.__GAME_STATE__.player.state.storyFlags };
    });
    check('cold Continue restores saved town position without intro or New-Game marker',
      !/[?&]first=1/.test(savedTown.src)
        && near(savedTown.cell[0], savedCell[0]) && near(savedTown.cell[1], savedCell[1])
        && !savedTown.intro && savedTown.flags['intro.done'] === true,
      `src=${savedTown.src}; cell=${savedTown.cell.map(n => n.toFixed(2))}; intro=${savedTown.intro}; flags=${JSON.stringify(savedTown.flags)}`);
    await townPage.close();

    // Auto-recovery wraps loadGame and overlays snap.player after loading the manual save. The
    // migration must land outside that wrapper so its missing intro.done cannot overwrite it.
    const recoveryPage = await browser.newPage({ viewport: { width: 960, height: 720 } });
    await useProductionAdapter(recoveryPage);
    trackPageErrors(recoveryPage, 'recovery page', errors);
    const recoverySave = save('greenhollow', ...savedCell, {}, false);
    const heartbeat = JSON.stringify({ t: Date.now() - 1000, live: 1, vis: 1, mv: 0 });
    const recoveryLog = JSON.stringify({ total: 0, blocked: 0, events: [] });
    await seedOnce(recoveryPage, {
      'edu-rpg-save': JSON.stringify(recoverySave),
      'edu-rpg-resume': JSON.stringify(recoverySave),
      'edu-rpg-hb': heartbeat,
      'edu-rpg-recovery': recoveryLog,
    });
    await recoveryPage.goto(BASE, { waitUntil: 'domcontentloaded', timeout: 30_000 });
    await recoveryPage.waitForFunction(() => !!window.__PHASER_GAME__, { timeout: 20_000 });
    await recoveryPage.waitForFunction(() => {
      const g = window.__PHASER_GAME__;
      const w = g?.scene?.getScene('WorldMapScene');
      const rec = JSON.parse(localStorage.getItem('edu-rpg-recovery') || '{}');
      return rec.total === 1 && g?.scene?.isActive('WorldMapScene')
        && w?.currentMapId === 'greenhollow';
    }, { timeout: 25_000 });
    await recoveryPage.waitForFunction(() => document.querySelector('#act1-hifi-preserved-root')
      ?.dataset.ready === 'true', { timeout: 25_000 });
    const recoveryResult = await recoveryPage.evaluate(() => {
      const world = window.__PHASER_GAME__.scene.getScene('WorldMapScene');
      const frame = document.querySelector('#act1-hifi-preserved-root iframe');
      return { intro: !!world.showingMessage,
        introDone: window.__GAME_STATE__.player.state.storyFlags['intro.done'] === true,
        src: frame.src,
        position: window.__GAME_STATE__.player.state.position };
    });
    check('recovery snapshot missing intro.done is migrated after snapshot overlay',
      recoveryResult.introDone && !recoveryResult.intro && !/[?&]first=1/.test(recoveryResult.src),
      JSON.stringify(recoveryResult));
    await recoveryPage.close();
    }

    // A failed Continue must not migrate flags, start the world, or leave our temporary load
    // wrapper installed. Keep an explicit unrelated marker to catch broad flag replacement.
    const failedPage = await browser.newPage({ viewport: { width: 960, height: 720 } });
    await useProductionAdapter(failedPage);
    trackPageErrors(failedPage, 'failed-continue page', errors);
    await seedOnce(failedPage, { 'edu-rpg-save': JSON.stringify(save('overworld', 69, 256, {}, false)) });
    await failedPage.goto(BASE, { waitUntil: 'domcontentloaded', timeout: 30_000 });
    await failedPage.waitForFunction(() => !!window.__PHASER_GAME__, { timeout: 20_000 });
    await failedPage.waitForSelector('[data-act="titleContinue"]', { timeout: 20_000 });
    const failedResult = await failedPage.evaluate(() => {
      const state = window.__GAME_STATE__, title = window.__PHASER_GAME__.scene.getScene('TitleScene');
      if (!state.loadGame()) throw new Error('failed-Continue fixture save did not load');
      // Synthetic state-transition fixture: the UI does not expose Title Continue from the
      // visible failed-town cover. Model an interrupted New Game intent, then invoke the real
      // TitleScene Continue confirmation to verify its successful-load reset behavior.
      state.newGame();
      state.player.state.storyFlags = { keepExisting: 'yes' };
      const flagsBefore = JSON.stringify(state.player.state.storyFlags);
      const realLoad = state.loadGame;
      const failedLoad = () => false;
      state.loadGame = failedLoad;
      title.selectedIndex = title.menuItems.findIndex(item => item.getData?.('action') === 'continue');
      title.confirm();
      const result = { flags: state.player.state.storyFlags,
        flagsUnchanged: JSON.stringify(state.player.state.storyFlags) === flagsBefore,
        mode: title.mode,
        worldActive: window.__PHASER_GAME__.scene.isActive('WorldMapScene'),
        loadWrapperRestored: state.loadGame === failedLoad };
      state.loadGame = realLoad;
      return result;
    });
    check('failed Continue leaves flags unchanged and does not start the world',
      failedResult.flags.keepExisting === 'yes' && failedResult.flags['intro.done'] === undefined
        && failedResult.flagsUnchanged
        && failedResult.mode === 'title' && !failedResult.worldActive && failedResult.loadWrapperRestored,
      JSON.stringify(failedResult));
    await failedPage.evaluate(() => {
      const state = window.__GAME_STATE__, title = window.__PHASER_GAME__.scene.getScene('TitleScene');
      title.selectedIndex = title.menuItems.findIndex(item => item.getData?.('action') === 'continue');
      title.confirm();
    });
    await waitForWorldMap(failedPage, 'overworld');
    await failedPage.keyboard.down('ArrowUp');
    await failedPage.waitForFunction(() => {
      const root = document.querySelector('#act1-hifi-preserved-root');
      const frame = root?.querySelector('iframe');
      return root?.dataset.ready === 'true' && frame?.contentWindow?.__ACT1_TOWN__?.town?.id === 'greenhollow';
    }, { timeout: 20_000 });
    await failedPage.keyboard.up('ArrowUp');
    const afterContinue = await failedPage.evaluate(() => document.querySelector('#act1-hifi-preserved-root iframe').src);
    check('synthetic Continue clears an interrupted New Game opening intent only after load',
      !/[?&]first=1/.test(afterContinue), afterContinue);
    await failedPage.close();
    }

    if (!ONLY || ONLY === 'ngplus') {
    // Reach the actual frozen New Game+ route: VictoryScene action -> prepareNewGamePlus ->
    // TitleScene({ngPlus:true}) -> confirmCreate -> GameState.newGamePlus -> newGame hook.
    const ngPage = await browser.newPage({ viewport: { width: 960, height: 720 } });
    await useProductionAdapter(ngPage);
    trackPageErrors(ngPage, 'new-game-plus page', errors);
    // Begin New Game+ from a valid loaded overworld save. The first-time town cover is a separate
    // path; forcing Victory while that gate is pending leaves the retained cover above Title.
    await seedOnce(ngPage, { 'edu-rpg-save': JSON.stringify(save('overworld', 69, 256, {}, true)) });
    await ngPage.goto(BASE, { waitUntil: 'domcontentloaded', timeout: 30_000 });
    await ngPage.waitForFunction(() => !!window.__PHASER_GAME__, { timeout: 20_000 });
    await ngPage.waitForSelector('[data-act="titleContinue"]', { timeout: 20_000 });
    await ngPage.locator('[data-act="titleContinue"]').click();
    await waitForWorldMap(ngPage, 'overworld');
    await ngPage.waitForFunction(() => window.__QOK_COVER__?.phase?.() === 'active', { timeout: 25_000 });
    await ngPage.evaluate(() => window.__PHASER_GAME__.scene.start('VictoryScene'));
    await ngPage.waitForFunction(() => window.__PHASER_GAME__.scene.isActive('VictoryScene'), { timeout: 10_000 });
    await ngPage.keyboard.press('Enter');
    await ngPage.waitForSelector('[data-act="introStart"]', { timeout: 15_000 });
    const ngTitle = await ngPage.evaluate(() => {
      const t = window.__PHASER_GAME__.scene.getScene('TitleScene');
      return { ngPlus: t.ngPlus === true, savedName: t.heroName };
    });
    check('VictoryScene enters the actual New Game+ creation path',
      ngTitle.ngPlus && ngTitle.savedName === 'Legacy Hero',
      JSON.stringify(ngTitle));
    await ngPage.locator('[data-act="introStart"]').click();
    await waitForWorldMap(ngPage, 'greenhollow');
    await ngPage.waitForFunction(() => window.__PHASER_GAME__.scene.getScene('WorldMapScene')?.showingMessage,
      { timeout: 10_000 });
    await ngPage.waitForFunction(() => window.__QOK_COVER__?.phase?.() === 'active'
      && document.querySelector('#act1-hifi-preserved-root')?.dataset.ready === 'true', { timeout: 25_000 });
    const ngResult = await ngPage.evaluate(() => {
      const frame = document.querySelector('#act1-hifi-preserved-root iframe');
      const world = window.__PHASER_GAME__.scene.getScene('WorldMapScene');
      return { first: /[?&]first=1/.test(frame.src), intro: !!world.showingMessage,
        introDone: window.__GAME_STATE__.player.state.storyFlags['intro.done'] === true };
    });
    check('New Game+ retains the fresh-town opening and intro sequence',
      ngResult.first && ngResult.intro && !ngResult.introDone, JSON.stringify(ngResult));
    await ngPage.close();
    }
  } finally {
    await browser.close();
  }
  if (errors.length) console.log(`Page errors: ${errors.join(' | ')}`);
  const failed = CHECKS.filter(c => !c.ok).length + errors.length;
  console.log(failed ? `FAIL ${failed} issue(s)` : `PASS ${CHECKS.length} checks`);
  process.exitCode = failed ? 1 : 0;
}

main().catch(error => { console.error(error); process.exit(1); });
