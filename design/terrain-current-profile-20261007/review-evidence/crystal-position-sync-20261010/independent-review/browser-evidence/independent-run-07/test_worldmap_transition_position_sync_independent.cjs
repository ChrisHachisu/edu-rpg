#!/usr/bin/env node
'use strict';

// Exercise the exact pure position-sync helper from the shipped adapter source without starting
// Vite, Phaser, or a browser. Exact frozen-bundle transition/persistence behavior is covered by
// the separate production-path browser check.
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const net = require('node:net');
const path = require('node:path');
const { spawn } = require('node:child_process');
const vm = require('node:vm');

const adapterPath = '/Users/chris/.codex/workspaces/edu-rpg-forward-20261007/public/act1-hifi/adapter.js';
const source = fs.readFileSync(adapterPath, 'utf8');
const args = process.argv.slice(2);
const browserMode = args.includes('--browser');
const argValue = name => args.find(arg => arg.startsWith(`${name}=`))?.slice(name.length + 1) || '';
const start = source.indexOf('function syncPositionAfterSuccessfulMapLoad(');
const end = source.indexOf('\n\n// Hold only the legacy update', start);
assert(start >= 0 && end > start, 'adapter must retain the named map-position sync helper');
const helperSource = source.slice(start, end);
assert(source.includes('return callMapLoadWithPositionSync(this, mapId, args, originalLoadMap)'),
  'the live adapter loadMap wrapper must use the tested load/sync helper');

function run(scene, state) {
  const context = { playerState: () => state, console: { warn() {} }, installTownLoadingHold() {} };
  vm.runInNewContext(`${helperSource}\nglobalThis.syncPositionAfterSuccessfulMapLoad = syncPositionAfterSuccessfulMapLoad;\nglobalThis.callMapLoadWithPositionSync = callMapLoadWithPositionSync;`, context);
  return { sync: context.syncPositionAfterSuccessfulMapLoad, load: context.callMapLoadWithPositionSync };
}

let checks = 0;
function check(name, fn) {
  const pass = () => { checks += 1; process.stdout.write(`PASS ${name}\n`); };
  const result = fn();
  return result && typeof result.then === 'function' ? result.then(pass) : pass();
}

check('Crystal exit repairs only the successful cross-map position and retains other player data', () => {
  const state = { position: { mapId: 'crystalCave', x: 149, y: 279, floor: 1 }, hp: 461,
    storyFlags: { 'boss.giantToad.defeated': true } };
  const scene = { currentMapId: 'overworld', currentFloor: 1, heroTileX: 149, heroTileY: 279,
    mapData: Array.from({ length: 300 }, () => Array(200).fill(0)),
    updatePosition() { state.position = { mapId: this.currentMapId, x: this.heroTileX,
      y: this.heroTileY, floor: this.currentFloor }; } };
  assert.equal(run(scene, state).sync(scene, 'overworld', 'crystalCave'), true);
  assert.deepEqual(state.position, { mapId: 'overworld', x: 149, y: 279, floor: 1 });
  assert.equal(state.hp, 461);
  assert.equal(state.storyFlags['boss.giantToad.defeated'], true);
  const resume = JSON.parse(JSON.stringify({ version: 4, player: state })).player.position;
  assert.deepEqual(resume, { mapId: 'overworld', x: 149, y: 279, floor: 1 });
});

check('cross-map reentry writes the loaded destination map and its floor', () => {
  const state = { position: { mapId: 'overworld', x: 77, y: 32, floor: 1 } };
  const scene = { currentMapId: 'crystalCave', currentFloor: 2, heroTileX: 40, heroTileY: 26,
    mapData: Array.from({ length: 40 }, () => Array(50).fill(0)),
    updatePosition() { state.position = { mapId: this.currentMapId, x: this.heroTileX,
      y: this.heroTileY, floor: this.currentFloor }; } };
  assert.equal(run(scene, state).sync(scene, 'crystalCave', 'overworld'), true);
  assert.deepEqual(state.position, { mapId: 'crystalCave', x: 40, y: 26, floor: 2 });
});

check('initial scene creation and already-consistent Continue leave position alone', () => {
  const state = { position: { mapId: 'overworld', x: 69, y: 256, floor: 1 } };
  const scene = { currentMapId: 'overworld', currentFloor: 1, heroTileX: 69, heroTileY: 256,
    mapData: [[0]], updatePosition() { throw new Error('must not run'); } };
  const sync = run(scene, state).sync;
  assert.equal(sync(scene, 'overworld', undefined), false);
  assert.equal(sync(scene, 'overworld', 'overworld'), false);
  assert.equal(sync(scene, 'overworld', 'old-session-map'), false);
  assert.deepEqual(state.position, { mapId: 'overworld', x: 69, y: 256, floor: 1 });
});

check('same-map floor loads and failed or partial destination loads are nonmutating', () => {
  const state = { position: { mapId: 'crystalCave', x: 12, y: 15, floor: 1 } };
  const scene = { currentMapId: 'crystalCave', currentFloor: 2, heroTileX: 12, heroTileY: 15,
    mapData: [[0]], updatePosition() { throw new Error('must not run'); } };
  const sync = run(scene, state).sync;
  assert.equal(sync(scene, 'crystalCave', 'crystalCave'), false);
  assert.equal(sync(scene, 'overworld', 'crystalCave'), false);
  assert.deepEqual(state.position, { mapId: 'crystalCave', x: 12, y: 15, floor: 1 });
});

check('invalid/uninitialized coordinates and out-of-bounds destination do not mutate saves', () => {
  const state = { position: { mapId: 'crystalCave', x: 4, y: 8, floor: 1 } };
  for (const [x, y, mapData] of [
    [undefined, 2, [[0]]], [1.5, 0, [[0, 0]]], [4, 4, [[0]]],
  ]) {
    const scene = { currentMapId: 'overworld', currentFloor: 1, heroTileX: x, heroTileY: y, mapData,
      updatePosition() { throw new Error('must not run'); } };
    assert.equal(run(scene, state).sync(scene, 'overworld', 'crystalCave'), false);
    assert.deepEqual(state.position, { mapId: 'crystalCave', x: 4, y: 8, floor: 1 });
  }
});

const loadBehaviorCheck = check('wrapped load syncs only after success, waits for fulfillment, and preserves throws/rejections', async () => {
  const state = { position: { mapId: 'crystalCave', x: 149, y: 279, floor: 1 } };
  const makeScene = () => ({ currentMapId: 'crystalCave', currentFloor: 1, heroTileX: 149, heroTileY: 279,
    mapData: Array.from({ length: 300 }, () => Array(200).fill(0)),
    updatePosition() { state.position = { mapId: this.currentMapId, x: this.heroTileX,
      y: this.heroTileY, floor: this.currentFloor }; } });
  const load = run(null, state).load;
  const scene = makeScene();
  assert.equal(load(scene, 'overworld', [], function (id) { this.currentMapId = id; return 'loaded'; }), 'loaded');
  assert.deepEqual(state.position, { mapId: 'overworld', x: 149, y: 279, floor: 1 });

  state.position = { mapId: 'crystalCave', x: 149, y: 279, floor: 1 };
  scene.currentMapId = 'crystalCave';
  let resolveLoad;
  const pending = load(scene, 'overworld', [], function (id) {
    this.currentMapId = id;
    return new Promise(resolve => { resolveLoad = resolve; });
  });
  assert.deepEqual(state.position, { mapId: 'crystalCave', x: 149, y: 279, floor: 1 },
    'pending map load must not mutate position');
  resolveLoad('loaded');
  assert.equal(await pending, 'loaded');
  assert.deepEqual(state.position, { mapId: 'overworld', x: 149, y: 279, floor: 1 });

  state.position = { mapId: 'crystalCave', x: 149, y: 279, floor: 1 };
  scene.currentMapId = 'crystalCave';
  assert.throws(() => load(scene, 'overworld', [], function (id) {
    this.currentMapId = id;
    throw new Error('sync load failure');
  }), /sync load failure/);
  assert.deepEqual(state.position, { mapId: 'crystalCave', x: 149, y: 279, floor: 1 });

  state.position = { mapId: 'crystalCave', x: 149, y: 279, floor: 1 };
  scene.currentMapId = 'crystalCave';
  await assert.rejects(load(scene, 'overworld', [], function (id) {
    this.currentMapId = id;
    return Promise.reject(new Error('async load failure'));
  }), /async load failure/);
  assert.deepEqual(state.position, { mapId: 'crystalCave', x: 149, y: 279, floor: 1 });
});

function sha256(bytes) { return crypto.createHash('sha256').update(bytes).digest('hex'); }

async function runBrowserChecks() {
  let chromium;
  for (const candidate of ['playwright-core', '../.eduharness/node_modules/playwright-core',
    path.join(__dirname, '..', '.eduharness/node_modules/playwright-core')]) {
    try { ({ chromium } = require(candidate)); break; } catch (_) { /* try the next existing harness */ }
  }
  if (!chromium) throw new Error('no playwright-core found in the existing Edu RPG harness');

  const fixturePath = path.resolve(argValue('--fixture'));
  const evidenceDir = path.resolve(argValue('--evidence-dir'));
  const appPublic = path.resolve(argValue('--app-public'));
  if (!argValue('--fixture') || !argValue('--evidence-dir') || !argValue('--app-public')) {
    throw new Error('browser mode requires --fixture= --evidence-dir= and --app-public=');
  }
  const fixtureBytes = fs.readFileSync(fixturePath);
  const fixtureDoc = JSON.parse(fixtureBytes.toString('utf8'));
  const fixture = fixtureDoc.envelope;
  const provenance = fixtureDoc.provenance;
  assert.equal(fixtureDoc.schema, 'crystal-transition-test-fixture-v1');
  assert.equal(provenance.sourceBackupSha256,
    '62ae9515e38bedc52493c2d675447b6134fbc2df25c0340721aaa7bc6f34ead4');
  assert.equal(provenance.sourceRawSha256,
    'b5b8b2acc1dc7c96ef3127fff61836e7f3803cf09e31f47b541a4f5eaed044e1');
  assert.deepEqual(provenance.changedPlayerFields, ['position']);
  assert.equal(fixture.player.storyFlags['boss.giantToad.defeated'], true);
  assert.equal(fixture.player.storyFlags['boss.giantToad.encountered'], true);
  assert.deepEqual(fixture.player.position, { mapId: 'crystalCave', x: 76, y: 31, floor: 1 });
  fs.mkdirSync(evidenceDir, { recursive: true });

  const bundlePath = path.join(appPublic, 'assets', 'index-BhoGQRaA.js');
  const bundleSha256 = sha256(fs.readFileSync(bundlePath));
  assert.equal(bundleSha256, 'ab4fc9ad1204f23b4ea55dbae2d72bdf193a52e643271bcfe8642e2210556456',
    'served frozen bundle must be the exact Release84 candidate');
  const report = {
    schema: 'worldmap-transition-position-sync-browser-v1',
    candidatePublicPath: appPublic,
    frozenBundleSha256: bundleSha256,
    adapterSha256: sha256(source),
    fixturePath,
    fixtureSha256: sha256(fixtureBytes),
    fixtureProvenance: provenance,
    checks: [],
    pageErrors: [],
    diagnostics: [],
  };
  const browserChecks = [];
  const record = (name, passed, detail = '') => {
    const result = { name, passed: Boolean(passed), detail };
    report.checks.push(result);
    process.stdout.write(`${passed ? 'PASS' : 'FAIL'} browser ${name}${detail ? ` — ${detail}` : ''}\n`);
    if (!passed) throw new Error(`${name}: ${detail}`);
  };

  const probe = net.createServer();
  const port = await new Promise((resolve, reject) => {
    probe.once('error', reject);
    probe.listen(0, '127.0.0.1', () => {
      const value = probe.address().port;
      probe.close(error => error ? reject(error) : resolve(value));
    });
  });
  const server = spawn('python3', ['-m', 'http.server', String(port), '--bind', '127.0.0.1', '--directory', appPublic],
    { stdio: 'ignore' });
  const base = `http://127.0.0.1:${port}/`;
  const serverReady = async () => {
    for (let attempt = 0; attempt < 100; attempt += 1) {
      try {
        const response = await fetch(base);
        if (response.ok) return;
      } catch (_) { /* the child has not bound the chosen port yet */ }
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    throw new Error('static candidate server did not become ready');
  };
  let browser;
  try {
    await serverReady();
    browser = await chromium.launch({ headless: true, channel: 'chrome',
      args: ['--use-angle=swiftshader', '--enable-webgl', '--ignore-gpu-blocklist', '--mute-audio'] });
    const makePage = async (label, envelope) => {
      const page = await browser.newPage({ viewport: { width: 960, height: 720 } });
      page.on('pageerror', error => report.pageErrors.push(`${label}: ${error.message}`));
      await page.route('**/act1-hifi/adapter.js*', route => route.fulfill({
        status: 200, contentType: 'application/javascript; charset=utf-8', body: source,
      }));
      if (envelope) {
        const serialized = JSON.stringify(envelope);
        await page.addInitScript(({ data, marker }) => {
          if (sessionStorage.getItem(marker)) return;
          sessionStorage.setItem(marker, '1');
          localStorage.clear();
          localStorage.setItem('edu-rpg-save', data);
          localStorage.setItem('edu-rpg-resume', data);
        }, { data: serialized, marker: `__position_sync_seed_${label}` });
      }
      await page.goto(base, { waitUntil: 'domcontentloaded', timeout: 30000 });
      await page.waitForFunction(() => !!window.__PHASER_GAME__, { timeout: 25000 });
      return page;
    };
    const continuePage = async (label, envelope) => {
      const page = await makePage(label, envelope);
      await page.waitForSelector('[data-act="titleContinue"]', { timeout: 20000 });
      await page.locator('[data-act="titleContinue"]').click({ noWaitAfter: true });
      return page;
    };
    const waitForMap = async (page, mapId, timeout = 20000) => {
      try {
        await page.waitForFunction(id => {
          const game = window.__PHASER_GAME__;
          const scene = game?.scene?.getScene?.('WorldMapScene');
          return game?.scene?.isActive?.('WorldMapScene') && scene?.currentMapId === id;
        }, mapId, { timeout });
      } catch (error) {
        const diagnostic = await page.evaluate(() => {
          const game = window.__PHASER_GAME__;
          const manager = game?.scene;
          const world = manager?.getScene?.('WorldMapScene');
          const title = manager?.getScene?.('TitleScene');
          const summarizeRecord = key => {
            try {
              const value = JSON.parse(localStorage.getItem(key) || 'null');
              return value ? { timestamp: value.timestamp, mapId: value.player?.position?.mapId,
                position: value.player?.position, hp: value.player?.hp } : null;
            } catch (_) { return 'invalid-json'; }
          };
          return { url: location.href, ready: document.readyState,
            scenes: manager?.getScenes?.(true)?.map(scene => scene.sys?.settings?.key) || [],
            world: world ? { mapId: world.currentMapId, position: window.__GAME_STATE__?.player?.state?.position,
              active: manager.isActive?.('WorldMapScene'), paused: manager.isPaused?.('WorldMapScene'),
              showingMessage: world.showingMessage } : null,
            title: title ? { mode: title.mode, selectedIndex: title.selectedIndex,
              action: title.menuItems?.[title.selectedIndex]?.getData?.('action') } : null,
            cover: window.__QOK_COVER__?.phase?.() || null,
            save: summarizeRecord('edu-rpg-save'), resume: summarizeRecord('edu-rpg-resume'),
            adapter: { ready: window.__ACT1_PRESERVED_CUTOVER__?.ready || false,
              rootReady: document.querySelector('#act1-hifi-preserved-root')?.dataset.ready || null } };
        }).catch(diagError => ({ diagnosticError: diagError.message }));
        report.diagnostics.push({ expectedMapId: mapId, diagnostic });
        const imagePath = path.join(evidenceDir, `wait-failure-${mapId}.png`);
        try { await page.screenshot({ path: imagePath, timeout: 8000 }); } catch (_) {}
        throw new Error(`${error.message}; diagnostic=${JSON.stringify(diagnostic)}; screenshot=${imagePath}`);
      }
    };

    // Exact frozen bundle + earned Toad flags. The only fixture edit from its SQLite source is
    // player.position, changed in memory and in the documented portable fixture to Crystal B1F.
    const exitPage = await continuePage('crystal-exit', fixture);
    await waitForMap(exitPage, 'crystalCave');
    const entryState = await exitPage.evaluate(() => ({
      position: window.__GAME_STATE__?.player?.state?.position,
      defeated: window.__GAME_STATE__?.player?.state?.storyFlags?.['boss.giantToad.defeated'],
      encountered: window.__GAME_STATE__?.player?.state?.storyFlags?.['boss.giantToad.encountered'],
    }));
    record('earned Crystal fixture reaches B1F through Continue',
      entryState.position?.mapId === 'crystalCave' && entryState.defeated === true && entryState.encountered === true,
      JSON.stringify(entryState));
    const idleBefore = await exitPage.evaluate(() => window.__QOK_RECOVERY__?.writes?.().reasons?.idle || 0);
    await exitPage.keyboard.down('ArrowDown');
    try { await waitForMap(exitPage, 'overworld', 18000); }
    finally { await exitPage.keyboard.up('ArrowDown'); }
    const afterExit = await exitPage.evaluate(() => {
      const world = window.__PHASER_GAME__.scene.getScene('WorldMapScene');
      const player = window.__GAME_STATE__.player.state;
      return { mapId: world.currentMapId, x: world.heroTileX, y: world.heroTileY,
        position: player.position, defeated: player.storyFlags['boss.giantToad.defeated'],
        encountered: player.storyFlags['boss.giantToad.encountered'] };
    });
    record('Crystal exit immediately synchronizes live position without another step',
      afterExit.mapId === 'overworld' && afterExit.position?.mapId === 'overworld'
        && afterExit.position.x === afterExit.x && afterExit.position.y === afterExit.y,
      JSON.stringify(afterExit));
    record('earned Toad flags survive Crystal exit',
      afterExit.defeated === true && afterExit.encountered === true, JSON.stringify(afterExit));
    await exitPage.screenshot({ path: path.join(evidenceDir, 'crystal-exit-immediate.png') });
    await exitPage.waitForFunction(({ previousIdle }) => {
      const world = window.__PHASER_GAME__?.scene?.getScene?.('WorldMapScene');
      const live = window.__GAME_STATE__?.player?.state?.position;
      const recovery = window.__QOK_RECOVERY__;
      const snap = recovery?.snapshot?.();
      return world?.currentMapId === 'overworld'
        && (recovery?.writes?.().reasons?.idle || 0) > previousIdle
        && snap?.player?.position?.mapId === 'overworld'
        && snap.player.position.x === live?.x && snap.player.position.y === live?.y;
    }, { previousIdle: idleBefore }, { timeout: 25000 });
    const idleResume = await exitPage.evaluate(() => ({
      writes: window.__QOK_RECOVERY__.writes(),
      resume: window.__QOK_RECOVERY__.snapshot(),
      live: window.__GAME_STATE__.player.state.position,
      flags: window.__QOK_RECOVERY__.snapshot()?.player?.storyFlags,
    }));
    record('idle resume snapshot matches loaded overworld coordinates without another movement',
      idleResume.resume?.player?.position?.mapId === 'overworld'
        && idleResume.resume.player.position.x === idleResume.live.x
        && idleResume.resume.player.position.y === idleResume.live.y
        && idleResume.flags?.['boss.giantToad.defeated'] === true,
      JSON.stringify({ live: idleResume.live, resume: idleResume.resume?.player?.position,
        idleWrites: idleResume.writes?.reasons?.idle, defeated: idleResume.flags?.['boss.giantToad.defeated'] }));
    await exitPage.screenshot({ path: path.join(evidenceDir, 'crystal-exit-idle-resume.png') });

    // Reverse the verified real exit from its exact exterior landing position. This exercises
    // the frozen cross-map path again without inventing a second overworld route or a cliff cell.
    await exitPage.keyboard.down('ArrowUp');
    try { await waitForMap(exitPage, 'crystalCave', 12000); }
    finally { await exitPage.keyboard.up('ArrowUp'); }
    const reentryState = await exitPage.evaluate(() => {
      const world = window.__PHASER_GAME__.scene.getScene('WorldMapScene');
      const player = window.__GAME_STATE__.player.state;
      return { mapId: world.currentMapId, position: player.position,
        defeated: player.storyFlags['boss.giantToad.defeated'], encountered: player.storyFlags['boss.giantToad.encountered'] };
    });
    record('real-control re-entry from the Crystal exit synchronizes the cave map ID',
      reentryState.mapId === 'crystalCave' && reentryState.position?.mapId === 'crystalCave'
        && reentryState.defeated === true && reentryState.encountered === true,
      JSON.stringify(reentryState));
    await exitPage.screenshot({ path: path.join(evidenceDir, 'crystal-reentry.png') });
    await exitPage.close();

    // Legacy Continue and actual New Game startup exercise initial-load no-op behavior.
    const legacy = JSON.parse(JSON.stringify(fixture));
    legacy.player.position = { mapId: 'overworld', x: 69, y: 256, floor: 1 };
    const legacyPage = await continuePage('legacy-continue', legacy);
    await waitForMap(legacyPage, 'overworld');
    const legacyState = await legacyPage.evaluate(() => ({
      mapId: window.__PHASER_GAME__.scene.getScene('WorldMapScene').currentMapId,
      position: window.__GAME_STATE__.player.state.position,
      defeated: window.__GAME_STATE__.player.state.storyFlags['boss.giantToad.defeated'],
    }));
    record('legacy Continue preserves its loaded map and coordinates',
      legacyState.mapId === 'overworld' && legacyState.position?.mapId === 'overworld'
        && legacyState.position.x === 69 && legacyState.position.y === 256
        && legacyState.defeated === true, JSON.stringify(legacyState));
    await legacyPage.close();

    const newPage = await makePage('new-game', null);
    await newPage.waitForSelector('[data-act="titleNew"]', { timeout: 20000 });
    await newPage.locator('[data-act="titleNew"]').click({ noWaitAfter: true });
    await newPage.waitForSelector('[data-act="introStart"]', { timeout: 10000 });
    if (await newPage.locator('#qok-name').count()) await newPage.locator('#qok-name').fill('Position Sync Test');
    await newPage.locator('[data-act="introStart"]').click({ noWaitAfter: true });
    await newPage.waitForFunction(() => window.__PHASER_GAME__?.scene?.isActive?.('WorldMapScene'), { timeout: 20000 });
    await newPage.waitForFunction(() => {
      const world = window.__PHASER_GAME__?.scene?.getScene?.('WorldMapScene');
      const frame = document.querySelector('#act1-hifi-preserved-root iframe');
      return world?.showingMessage && /[?&]first=1/.test(frame?.src || '');
    }, { timeout: 25000 });
    const newGameState = await newPage.evaluate(() => ({
      mapId: window.__PHASER_GAME__.scene.getScene('WorldMapScene').currentMapId,
      showingMessage: window.__PHASER_GAME__.scene.getScene('WorldMapScene').showingMessage,
      townSrc: document.querySelector('#act1-hifi-preserved-root iframe')?.src || '',
    }));
    record('actual New Game keeps its Elder opening', newGameState.mapId === 'greenhollow'
      && newGameState.showingMessage && /[?&]first=1/.test(newGameState.townSrc), JSON.stringify(newGameState));
    await newPage.close();

    // Actual frozen loadMap throws after changing the target ID for an unknown map. The adapter
    // must not sync that failed/partial load into the player's previously valid position.
    const failedPage = await continuePage('failed-load', fixture);
    await waitForMap(failedPage, 'crystalCave');
    const failedLoad = await failedPage.evaluate(() => {
      const world = window.__PHASER_GAME__.scene.getScene('WorldMapScene');
      const player = window.__GAME_STATE__.player.state;
      const before = JSON.parse(JSON.stringify(player.position));
      let threw = false;
      try { world.loadMap('__position_sync_missing_map__'); } catch (_) { threw = true; }
      return { threw, before, after: player.position };
    });
    record('failed frozen load leaves player position unchanged', failedLoad.threw
      && JSON.stringify(failedLoad.after) === JSON.stringify(failedLoad.before), JSON.stringify(failedLoad));
    await failedPage.close();

    assert.deepEqual(report.pageErrors, [], `browser page errors: ${report.pageErrors.join('; ')}`);
  } catch (error) {
    report.error = error.stack || String(error);
    throw error;
  } finally {
    try { if (browser) await browser.close(); } catch (_) {}
    try { server.kill('SIGTERM'); } catch (_) {}
    const reportPath = path.join(evidenceDir, 'browser-report.json');
    fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);
    process.stdout.write(`BROWSER_REPORT ${reportPath} sha256=${sha256(fs.readFileSync(reportPath))}\n`);
    if (report.error) process.stdout.write(`BROWSER_ERROR ${report.error}\n`);
  }
}

loadBehaviorCheck.then(async () => {
  process.stdout.write(`\n${checks}/${checks} focused checks passed.\n`);
  if (browserMode) await runBrowserChecks();
}).catch(error => {
  process.stderr.write(`${error.stack || error}\n`);
  process.exitCode = 1;
});
