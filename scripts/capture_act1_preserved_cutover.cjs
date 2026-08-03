#!/usr/bin/env node
/* Live preserved-artifact gate for the additive Act 1 high-fidelity cutover. */

const assert = require('node:assert/strict');
const { createHash } = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

let chromium;
try {
  ({ chromium } = require('playwright-core'));
} catch (_) {
  ({ chromium } = require('../../edu-rpg/.eduharness/node_modules/playwright-core'));
}

const ROOT = path.resolve(__dirname, '..');
const RUNTIME = path.join(
  ROOT,
  'design/review/overworld-art-blueprint/act-by-act/act1/runtime-v2',
);
const EVIDENCE = path.join(RUNTIME, 'preserved-cutover-v1/phone-evidence');
const URL = process.argv[2] || 'http://127.0.0.1:5174/';
const manifest = JSON.parse(fs.readFileSync(path.join(RUNTIME, 'manifest.json'), 'utf8'));
const geometry = JSON.parse(fs.readFileSync(path.join(RUNTIME, 'walkable-regions-v1.json'), 'utf8'));
const sha256 = file => createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const LANDMARK_TARGETS = [
  {
    id: 'port-sapphire', anchorId: 'portSapphire', routeId: 'millbrook-to-port-sapphire',
    detailRegionIds: ['port-sapphire-pixel-source-912-v1'],
    masters: [{
      path: 'port-pixel-source-v2/port-sapphire-authored-master-v2.png',
      sha256: '458d93125f57d37301ab4124ec06650ad39afa613c91ed41498ceade5ef47430',
    }],
  },
  {
    id: 'greenhollow', anchorId: 'greenhollow', routeId: 'greenhollow-to-sunken-cellar',
    detailRegionIds: ['greenhollow-hub-912-v1'],
    masters: [{
      path: 'western-hub-912-v2/greenhollow-hub-authored-master-v2.png',
      sha256: 'bd635ed99b6f8cda204ac513f5c8a45e943cc066bb4b10ec848ca9adb4d288d3',
    }],
  },
  {
    id: 'sunken-ruin', anchorId: 'sunkenCellar', routeId: 'greenhollow-to-sunken-cellar',
    detailRegionIds: ['sunken-deep-912-v1'],
    masters: [{
      path: 'deep-sunken-outer-west-912-v2/sunken-deep-authored-master-v2.png',
      sha256: 'c685d4b8b01ecd0de71256ae05c614217748cc321bc77af16999310027f832f8',
    }],
  },
  {
    id: 'millbrook', anchorId: 'millbrook', routeId: 'greenhollow-to-millbrook',
    detailRegionIds: ['millbrook-west-912-v1', 'millbrook-outer-west-912-v1'],
    masters: [
      {
        path: 'central-east-912-v2/millbrook-west-authored-master-v2.png',
        sha256: 'b6338f3e41c3067f5de2ebc2bc4518a9def4d91dbe5c93a6db04499856f98190',
      },
      {
        path: 'deep-sunken-outer-west-912-v2/millbrook-outer-west-authored-master-v2.png',
        sha256: '70df21cdb5f57b18e1dc1330183041a8396d6b246601a7f07729170d695dc9a1',
      },
    ],
  },
  {
    id: 'coral-reef', anchorId: 'coastalReef', routeId: 'port-sapphire-to-coastal-reef',
    detailRegionIds: ['coastal-reef-912-v2'],
    masters: [{
      path: 'coastal-reef-912-v2/coastal-reef-authored-master-v2.png',
      sha256: 'd700133209e0117fbacf644876f33a5bb64c695877c7dd2d47707ab24e1f8dea',
    }],
  },
];
function pngInfo(file) {
  const bytes = fs.readFileSync(file);
  assert.equal(bytes.subarray(1, 4).toString('ascii'), 'PNG', `${file}: PNG signature`);
  return {
    width: bytes.readUInt32BE(16),
    height: bytes.readUInt32BE(20),
    bitDepth: bytes[24],
    colorType: bytes[25],
  };
}
function bindLandmarkArt() {
  const regions = new Map(manifest.detailRegions.map(region => [region.id, region]));
  return LANDMARK_TARGETS.map(target => ({
    ...target,
    masters: target.masters.map(master => {
      const file = path.join(RUNTIME, master.path);
      assert.equal(sha256(file), master.sha256, `${target.id}: locked master hash`);
      assert.deepEqual(pngInfo(file), {
        width: 1254, height: 1254, bitDepth: 8, colorType: 2,
      }, `${target.id}: locked master must be 1254x1254 RGB`);
      return master;
    }),
    regions: target.detailRegionIds.map(id => {
      const region = regions.get(id);
      assert(region, `${target.id}: missing detail region ${id}`);
      const layers = Object.fromEntries([
        ['base', 'baseSha256'], ['water', 'waterSha256'], ['occlusion', 'occlusionSha256'],
      ].map(([key, hashKey]) => {
        const runtimeFile = path.join(RUNTIME, region[key]);
        const publicFile = path.join(ROOT, 'public/act1-hifi', region[key]);
        const distFile = path.join(ROOT, 'dist/act1-hifi', region[key]);
        for (const file of [runtimeFile, publicFile, distFile]) {
          assert.equal(sha256(file), region[hashKey], `${target.id}: ${key} twin hash`);
        }
        return [key, { path: region[key], sha256: region[hashKey] }];
      }));
      return { id, layers };
    }),
  }));
}
const landmarkArt = bindLandmarkArt();
const hashRuntimeSources = files => {
  const hash = createHash('sha256');
  for (const file of files) {
    hash.update(file);
    hash.update('\0');
    hash.update(fs.readFileSync(path.join(RUNTIME, file)));
    hash.update('\0');
  }
  return hash.digest('hex');
};
const proofBinding = {
  adapterSha256: sha256(path.join(ROOT, 'dist/act1-hifi/adapter.js')),
  bundleSha256: sha256(path.join(ROOT, 'dist/assets/index-BhoGQRaA.js')),
  manifestSha256: sha256(path.join(RUNTIME, 'manifest.json')),
  runtimeSourceSha256: hashRuntimeSources([
    'index.html',
    'walkable-regions-v1.json',
    'walkable-polygons.js',
    'walkable-route-state.js',
    'path-corridor.js',
  ]),
  landmarkArtSha256: createHash('sha256')
    .update(JSON.stringify(landmarkArt)).digest('hex'),
};
const routes = geometry.semanticRoutes.map(route => ({
  ...route,
  semanticCells: manifest.pathConstraints.corridors.find(corridor => corridor.id === route.id).semanticCells,
}));
const EXPECTED_TARGETS = {
  'greenhollow-to-sunken-cellar': 'sunkenCellar',
  'greenhollow-to-whispering-woods-cave': 'whisperingWoodsCave',
  'greenhollow-to-millbrook': 'millbrook',
  'millbrook-to-port-sapphire': 'portSapphire',
  'port-sapphire-to-coastal-reef': 'coastalReef',
  'port-sapphire-to-darkfang': 'mistyGrotto',
  'port-sapphire-to-crystal-cave': 'crystalCave',
};

function slug(value) {
  return value.replace(/[^a-z0-9]+/g, '-');
}

function saveAt(cell, routeId) {
  return {
    version: 4,
    timestamp: Date.now(),
    player: {
      name: 'Relay', heroColor: 'gray', level: 12, exp: 0, expToNext: 100,
      hp: 120, maxHp: 120, atk: 30, def: 25, spd: 18,
      equipment: { weapon: null, armor: null, shield: null, helmet: null, accessory: null },
      inventory: [{ itemId: 'herb', quantity: 3 }], gold: 500,
      position: { mapId: 'overworld', x: cell.x, y: cell.y, floor: 1 },
      act1HifiRouteId: routeId,
      storyFlags: { 'boss.giantToad.defeated': true },
      activeQuests: ['owlsLesson', 'drakeCargo'], completedQuests: [], questProgress: {},
      timerEnabled: true, quizDifficulty: '3', locale: 'en', soundEnabled: false,
      masterVolume: 0, kanjiMode: false,
    },
    playtime: 0,
    quizStats: {},
  };
}

function monitor(page) {
  const errors = [];
  page.on('pageerror', error => errors.push(`pageerror: ${error.message}`));
  page.on('console', message => {
    if (message.type() === 'error' && message.text() !== 'Failed to load resource: the server responded with a status of 404 (File not found)') {
      errors.push(`console: ${message.text()}`);
    }
  });
  page.on('requestfailed', request => {
    const failure = request.failure()?.errorText || '';
    const url = request.url();
    const cleanupAbort = failure === 'net::ERR_ABORTED'
      && (closingPages.has(page) || lifecycleTeardownPages.has(page))
      && (url.includes('/assets/monsters/')
        || url.includes('/act1-hifi/chunks/')
        || url.startsWith('blob:'));
    if (cleanupAbort) ignoredLifecycleAborts.push({ url, failure });
    else errors.push(`requestfailed: ${url} ${failure}`);
  });
  return errors;
}

const closingPages = new WeakSet();
const lifecycleTeardownPages = new WeakSet();
const ignoredLifecycleAborts = [];
async function closePage(page) {
  closingPages.add(page);
  await page.close();
}

async function startSavedGame(page, route, options = {}) {
  const query = new URLSearchParams({ act1Verification: '1', act1Route: route.id });
  if (options.holdTransitions) query.set('act1HoldTransitions', '1');
  if (options.demo) query.set('act1Demo', 'traverse');
  await page.addInitScript(save => {
    if (sessionStorage.getItem('__act1PreservedSaveInjected')) return;
    localStorage.setItem('edu-rpg-save', JSON.stringify(save));
    sessionStorage.setItem('__act1PreservedSaveInjected', '1');
  }, saveAt(route.semanticCells[0], route.id));
  await page.goto(`${URL}?${query}`, { waitUntil: 'load', timeout: 30_000 });
  await page.waitForFunction(() => window.__PHASER_GAME__, null, { timeout: 20_000 });
  lifecycleTeardownPages.add(page);
  await page.evaluate(() => {
    const game = window.__PHASER_GAME__;
    if (game.scene.isActive('BootScene')) {
      game.scene.start('TitleScene');
      game.scene.stop('BootScene');
    }
  });
  await page.waitForFunction(() => {
    const game = window.__PHASER_GAME__;
    const title = game?.scene?.getScene('TitleScene');
    return game?.scene?.isActive('TitleScene') && title?.menuItems?.length > 0;
  }, null, { timeout: 10_000 });
  lifecycleTeardownPages.delete(page);
  await page.evaluate(() => {
    const title = window.__PHASER_GAME__.scene.getScene('TitleScene');
    title.selectedIndex = title.menuItems.findIndex(item => item.getData?.('action') === 'continue');
    title.confirmTitle();
  });
  await page.waitForFunction(() => window.__ACT1_PRESERVED_CUTOVER__?.ready,
    null, { timeout: 45_000 });
}

async function snapshot(page) {
  return page.evaluate(() => window.__ACT1_PRESERVED_CUTOVER__.snapshot());
}

async function commitSemanticIndex(page, semanticIndex, transitionCooldown = null) {
  return page.evaluate(async ({ index, cooldown }) => {
    const api = window.__ACT1_PRESERVED_CUTOVER__;
    const runtime = api.frame.contentWindow.__ACT1_HIFI_G1__;
    const route = runtime.activeNavigationRoute;
    if (cooldown !== null) {
      window.__PHASER_GAME__.scene.getScene('WorldMapScene').transitionCooldown = cooldown;
    }
    const fraction = index / (runtime.activeCorridor.semanticCells.length - 1);
    const lengths = route.waypoints.slice(1).map((point, pointIndex) => Math.hypot(
      point.x - route.waypoints[pointIndex].x,
      point.y - route.waypoints[pointIndex].y,
    ));
    const total = lengths.reduce((sum, length) => sum + length, 0);
    const wanted = total * fraction;
    let traversed = 0;
    let position = { ...route.waypoints.at(-1) };
    for (let pointIndex = 1; pointIndex < route.waypoints.length; pointIndex += 1) {
      const length = lengths[pointIndex - 1];
      if (traversed + length >= wanted) {
        const from = route.waypoints[pointIndex - 1];
        const to = route.waypoints[pointIndex];
        const t = length === 0 ? 0 : (wanted - traversed) / length;
        position = { x: from.x + (to.x - from.x) * t, y: from.y + (to.y - from.y) * t };
        break;
      }
      traversed += length;
    }
    runtime.state.position = position;
    runtime.state.semanticIndex = index;
    runtime.state.cell = { ...runtime.activeCorridor.semanticCells[index] };
    runtime.state.commits += 1;
    const stage = api.frame.contentDocument.querySelector('#stage');
    const width = stage.clientWidth / runtime.camera.zoom;
    const height = stage.clientHeight / runtime.camera.zoom;
    runtime.camera.x = position.x - width / 2;
    runtime.camera.y = position.y - height / 2 + 40;
    await runtime.ensureVisibleAssets({
      left: runtime.camera.x, top: runtime.camera.y,
      right: runtime.camera.x + width, bottom: runtime.camera.y + height,
    }, true);
    runtime.streamStats.visibleAssetMisses = 0;
    runtime.streamStats.visibleDetailMisses = 0;
    runtime.streamStats.visibleDetailMissRegionIds = {};
    return api.flushSemanticState();
  }, { index: semanticIndex, cooldown: transitionCooldown });
}

function assertSnapshot(value, label) {
  assert.equal(value.error, null, `${label}: adapter error`);
  assert.equal(value.manifestRevision, 11, `${label}: manifest revision`);
  assert.equal(value.phoneFrame, '852x1846', `${label}: phone frame`);
  assert.equal(value.worldViewWidth, 208, `${label}: camera width`);
  assert.equal(value.walkPoseMs, 125, `${label}: 0-A-0-B cadence`);
  assert.equal(value.heroRuntimeDirections, 4, `${label}: cardinal runtime rows`);
  assert.equal(value.stream.visibleAssetMisses, 0, `${label}: visible chunk misses`);
  assert.equal(value.stream.visibleDetailMisses, 0, `${label}: visible detail misses`);
  assert(value.stream.peakLoadedChunks <= value.streamConfig.maxLoadedChunks,
    `${label}: chunk ceiling`);
  assert(value.stream.peakLoadedDetailRegions <= value.streamConfig.maxLoadedDetailRegions,
    `${label}: detail ceiling`);
  assert(value.stream.requiredChunks <= value.streamConfig.maxLoadedChunks,
    `${label}: required chunk ceiling`);
  assert(value.stream.requiredDetailRegions <= value.streamConfig.maxLoadedDetailRegions,
    `${label}: required detail ceiling`);
  assert(value.stream.peakResidentBytes > 0, `${label}: resident telemetry`);
  assert(value.resources.count > 0, `${label}: resource telemetry`);
  assert(value.resources.decodedBytes > 0, `${label}: resource byte telemetry`);
}

async function captureLandmarks(browser, allErrors, headed) {
  const results = [];
  for (const target of landmarkArt) {
    const route = routes.find(candidate => candidate.id === target.routeId);
    assert(route, `${target.id}: capture route missing`);
    const page = await browser.newPage({ viewport: { width: 852, height: 1846 } });
    const errors = monitor(page);
    await startSavedGame(page, route, { holdTransitions: true });
    const live = await page.evaluate(async ({ anchorId, detailRegionIds }) => {
      const api = window.__ACT1_PRESERVED_CUTOVER__;
      const runtime = api.frame.contentWindow.__ACT1_HIFI_G1__;
      const anchor = runtime.walkableGeometry.landmarkAnchors.find(item => item.id === anchorId);
      if (!anchor) throw new Error(`missing landmark anchor: ${anchorId}`);
      runtime.state.position = { x: anchor.point[0], y: anchor.point[1] };
      const stage = api.frame.contentDocument.querySelector('#stage');
      const width = stage.clientWidth / runtime.camera.zoom;
      const height = stage.clientHeight / runtime.camera.zoom;
      runtime.camera.x = runtime.state.position.x - width / 2;
      runtime.camera.y = runtime.state.position.y - height / 2 + 40;
      await runtime.ensureVisibleAssets({
        left: runtime.camera.x, top: runtime.camera.y,
        right: runtime.camera.x + width, bottom: runtime.camera.y + height,
      }, true);
      runtime.streamStats.visibleAssetMisses = 0;
      runtime.streamStats.visibleDetailMisses = 0;
      runtime.streamStats.visibleDetailMissRegionIds = {};
      await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      const gl = window.__PHASER_GAME__?.renderer?.gl || null;
      const rendererInfo = gl?.getExtension('WEBGL_debug_renderer_info') || null;
      return {
        anchor: { id: anchor.id, point: anchor.point },
        debugHidden: api.frame.contentDocument.querySelector('#debug').hidden,
        requiredDetailRegionIds: [...runtime.streamStats.lastRequiredDetailRegionIds],
        resourcePaths: api.frame.contentWindow.performance.getEntriesByType('resource')
          .map(entry => new URL(entry.name).pathname),
        requestedDetailRegionIds: detailRegionIds,
        webgl: gl ? {
          vendor: gl.getParameter(rendererInfo?.UNMASKED_VENDOR_WEBGL || gl.VENDOR),
          renderer: gl.getParameter(rendererInfo?.UNMASKED_RENDERER_WEBGL || gl.RENDERER),
          version: gl.getParameter(gl.VERSION),
        } : null,
      };
    }, { anchorId: target.anchorId, detailRegionIds: target.detailRegionIds });
    assert.equal(live.debugHidden, true, `${target.id}: route overlay visible`);
    if (headed) {
      assert(live.webgl, `${target.id}: preserved Phaser WebGL context missing`);
      assert(!/(swiftshader|llvmpipe|software)/i.test(live.webgl.renderer),
        `${target.id}: headed run used a software WebGL renderer: ${live.webgl.renderer}`);
    }
    for (const region of target.regions) {
      assert(live.requiredDetailRegionIds.includes(region.id),
        `${target.id}: detail region not required: ${region.id}`);
      assert(live.resourcePaths.some(resource => resource.endsWith(`/act1-hifi/${region.layers.base.path}`)),
        `${target.id}: exact base bytes were not loaded: ${region.layers.base.path}`);
    }
    const snap = await snapshot(page);
    assertSnapshot(snap, `${target.id} landmark capture`);
    const screenshot = path.join(EVIDENCE, `${target.id}-route-hidden-852x1846.png`);
    await page.screenshot({ path: screenshot, type: 'png' });
    results.push({
      id: target.id,
      proofBinding,
      art: target,
      screenshot: path.relative(ROOT, screenshot),
      live,
      snapshot: snap,
      errors,
    });
    allErrors.push(...errors);
    await closePage(page);
  }
  return results;
}

(async () => {
  fs.mkdirSync(EVIDENCE, { recursive: true });
  assert.equal(manifest.revision, 11);
  assert.equal(manifest.pathConstraints.movementSpeed, 52);
  assert.equal(geometry.semanticRoutes.length, 7);
  const headed = process.env.ACT1_HEADED === '1';
  const browser = await chromium.launch({
    headless: !headed,
    channel: 'chrome',
    args: [
      ...(headed ? [] : ['--use-angle=swiftshader']),
      '--enable-webgl', '--ignore-gpu-blocklist', '--mute-audio',
      '--disable-background-timer-throttling',
      '--disable-backgrounding-occluded-windows',
      '--disable-renderer-backgrounding',
    ],
  });
  const allErrors = [];
  const landmarkRuns = [];
  const routeRuns = [];
  const transitionRuns = [];
  try {
    for (const route of routes) {
      const checkpointPath = path.join(EVIDENCE, `${slug(route.id)}-preserved-result.json`);
      if (fs.existsSync(checkpointPath)) {
        const checkpoint = JSON.parse(fs.readFileSync(checkpointPath, 'utf8'));
        if (checkpoint.id === route.id
          && JSON.stringify(checkpoint.proofBinding) === JSON.stringify(proofBinding)
          && checkpoint.transitionProof?.parentTransitions === 1
          && Array.isArray(checkpoint.errors) && checkpoint.errors.length === 0) {
          assertSnapshot(checkpoint.end, `${route.id} checkpoint`);
          assert.equal(checkpoint.transition.mapId, EXPECTED_TARGETS[route.id],
            `${route.id}: checkpoint transition`);
          routeRuns.push({ id: route.id, end: checkpoint.end });
          transitionRuns.push({ id: route.id, ...checkpoint.transition });
          continue;
        }
      }
      const page = await browser.newPage({ viewport: { width: 852, height: 1846 } });
      const errors = monitor(page);
      await startSavedGame(page, route);
      await page.evaluate(() => {
        const stats = window.__ACT1_PRESERVED_CUTOVER__.frame.contentWindow.__ACT1_HIFI_G1__.streamStats;
        Object.assign(stats, {
          frameSamples: 0, maxFrameMs: 0, overBudgetFrames: 0,
          maxFrameWorkMs: 0, overBudgetFrameWork: 0,
        });
      });
      const last = route.semanticCells.length - 1;
      const samples = [...new Set([1, Math.floor(last / 4), Math.floor(last / 2), Math.floor(last * 3 / 4)])]
        .filter(index => index > 0 && index < last);
      for (const index of samples) {
        await commitSemanticIndex(page, index);
        await page.waitForFunction(expected => {
          const snap = window.__ACT1_PRESERVED_CUTOVER__.snapshot();
          return snap.parentCell?.x === expected.x && snap.parentCell?.y === expected.y;
        }, route.semanticCells[index], { timeout: 10_000 });
      }
      await commitSemanticIndex(page, last, 1);
      await page.waitForFunction(expected => {
        const snap = window.__ACT1_PRESERVED_CUTOVER__.snapshot();
        return snap.parentCell?.x === expected.x && snap.parentCell?.y === expected.y;
      }, route.semanticCells[last], { timeout: 10_000 });
      await page.waitForTimeout(250);
      const end = await snapshot(page);
      const finalCell = route.semanticCells.at(-1);
      assert.equal(end.routeId, route.id, `${route.id}: route ownership changed`);
      assert.deepEqual(end.semanticCell, finalCell, `${route.id}: runtime endpoint`);
      assert.deepEqual(end.parentCell, finalCell, `${route.id}: parent semantic endpoint`);
      assert(end.semanticCommits > 0, `${route.id}: no parent semantic commits`);
      assert.equal(end.parentTransitions, 0, `${route.id}: endpoint transitioned before release`);
      assertSnapshot(end, route.id);
      await page.screenshot({
        path: path.join(EVIDENCE, `${slug(route.id)}-preserved-end.jpg`),
        type: 'jpeg', quality: 94,
      });
      routeRuns.push({ id: route.id, end });
      const targetMap = EXPECTED_TARGETS[route.id];
      lifecycleTeardownPages.add(page);
      const transitionProof = await page.evaluate(() => {
        const api = window.__ACT1_PRESERVED_CUTOVER__;
        const runtime = api.frame.contentWindow.__ACT1_HIFI_G1__;
        const scene = window.__PHASER_GAME__.scene.getScene('WorldMapScene');
        scene.transitionCooldown = 0;
        runtime.state.commits += 1;
        return api.flushSemanticState();
      });
      assert.equal(transitionProof.parentTransitions, 1,
        `${route.id}: adapter did not own the endpoint transition`);
      await page.waitForFunction(expected => (
        window.__PHASER_GAME__.scene.getScene('WorldMapScene').currentMapId === expected
      ), targetMap, { timeout: 8_000 });
      const actual = await page.evaluate(() => {
        const scene = window.__PHASER_GAME__.scene.getScene('WorldMapScene');
        return { mapId: scene.currentMapId, x: scene.heroTileX, y: scene.heroTileY };
      });
      assert.equal(actual.mapId, targetMap, `${route.id}: real transition target`);
      lifecycleTeardownPages.delete(page);
      transitionRuns.push({ id: route.id, ...actual });
      fs.writeFileSync(checkpointPath, `${JSON.stringify({
        schema: 'act1-preserved-route-result-v1',
        id: route.id,
        proofBinding,
        end,
        transition: actual,
        transitionProof,
        errors,
      }, null, 2)}\n`);
      allErrors.push(...errors);
      await closePage(page);
    }

    const saveRoute = routes.find(route => route.id === 'greenhollow-to-millbrook');
    const savePage = await browser.newPage({ viewport: { width: 852, height: 1846 } });
    const saveErrors = monitor(savePage);
    await startSavedGame(savePage, saveRoute, { holdTransitions: true });
    const savedMidpoint = await savePage.evaluate(() => {
      const api = window.__ACT1_PRESERVED_CUTOVER__;
      const runtime = api.frame.contentWindow.__ACT1_HIFI_G1__;
      const index = Math.floor(runtime.activeCorridor.semanticCells.length / 2);
      runtime.state.semanticIndex = index;
      runtime.state.cell = { ...runtime.activeCorridor.semanticCells[index] };
      const points = runtime.activeNavigationRoute.waypoints;
      const lengths = points.slice(1).map((point, pointIndex) => Math.hypot(
        point.x - points[pointIndex].x,
        point.y - points[pointIndex].y,
      ));
      const total = lengths.reduce((sum, length) => sum + length, 0);
      const wanted = total * index / (runtime.activeCorridor.semanticCells.length - 1);
      let traversed = 0;
      runtime.state.position = { ...points.at(-1) };
      for (let pointIndex = 1; pointIndex < points.length; pointIndex += 1) {
        const length = lengths[pointIndex - 1];
        if (traversed + length >= wanted) {
          const from = points[pointIndex - 1];
          const to = points[pointIndex];
          const t = length === 0 ? 0 : (wanted - traversed) / length;
          runtime.state.position = {
            x: from.x + (to.x - from.x) * t,
            y: from.y + (to.y - from.y) * t,
          };
          break;
        }
        traversed += length;
      }
      runtime.state.commits += 1;
      api.flushSemanticState();
      return { index, cell: { ...runtime.state.cell }, routeId: runtime.activeCorridor.id };
    });
    await savePage.waitForFunction(expected => {
      const snap = window.__ACT1_PRESERVED_CUTOVER__.snapshot();
      return snap.parentCell?.x === expected.x && snap.parentCell?.y === expected.y;
    }, savedMidpoint.cell, { timeout: 3_000 });
    const savedSlot = await savePage.evaluate(() => {
      window.__GAME_STATE__.saveGame();
      const saved = JSON.parse(localStorage.getItem('edu-rpg-save'));
      history.replaceState(null, '', `${location.pathname}?act1Verification=1&act1HoldTransitions=1`);
      return saved;
    });
    assert.deepEqual(savedSlot.player.position,
      { mapId: 'overworld', x: savedMidpoint.cell.x, y: savedMidpoint.cell.y, floor: 1 });
    assert.equal(savedSlot.player.act1HifiRouteId, savedMidpoint.routeId);
    lifecycleTeardownPages.add(savePage);
    await savePage.reload({ waitUntil: 'load' });
    await savePage.waitForFunction(() => window.__PHASER_GAME__, null, { timeout: 20_000 });
    await savePage.evaluate(() => {
      const game = window.__PHASER_GAME__;
      if (game.scene.isActive('BootScene')) {
        game.scene.start('TitleScene');
        game.scene.stop('BootScene');
      }
    });
    await savePage.waitForFunction(() => window.__PHASER_GAME__.scene.getScene('TitleScene')?.menuItems?.length,
      null, { timeout: 10_000 });
    await savePage.evaluate(() => {
      const title = window.__PHASER_GAME__.scene.getScene('TitleScene');
      title.selectedIndex = title.menuItems.findIndex(item => item.getData?.('action') === 'continue');
      title.confirmTitle();
    });
    await savePage.waitForFunction(() => window.__ACT1_PRESERVED_CUTOVER__?.ready,
      null, { timeout: 45_000 });
    lifecycleTeardownPages.delete(savePage);
    const reloaded = await snapshot(savePage);
    assert.equal(reloaded.routeId, savedMidpoint.routeId, 'reload lost route affinity');
    assert.deepEqual(reloaded.semanticCell, savedMidpoint.cell, 'reload lost semantic cell');
    assert.deepEqual(reloaded.parentCell, savedMidpoint.cell, 'reload parent cell mismatch');
    assertSnapshot(reloaded, 'semantic save/reload');
    allErrors.push(...saveErrors);
    await closePage(savePage);

    const manualRoute = routes.find(route => route.id === 'greenhollow-to-sunken-cellar');
    const manualPage = await browser.newPage({ viewport: { width: 852, height: 1846 } });
    const manualErrors = monitor(manualPage);
    await startSavedGame(manualPage, manualRoute, { holdTransitions: true });
    await manualPage.evaluate(async () => {
      const runtime = window.__ACT1_PRESERVED_CUTOVER__.frame.contentWindow.__ACT1_HIFI_G1__;
      const probe = runtime.walkableGeometry.probes.walkable.find(item => item.id === 'greenhollow-open-north');
      runtime.state.position = { x: probe.point[0], y: probe.point[1] };
      const stage = window.__ACT1_PRESERVED_CUTOVER__.frame.contentDocument.querySelector('#stage');
      const width = stage.clientWidth / runtime.camera.zoom;
      const height = stage.clientHeight / runtime.camera.zoom;
      runtime.camera.x = runtime.state.position.x - width / 2;
      runtime.camera.y = runtime.state.position.y - height / 2 + 40;
      await runtime.ensureVisibleAssets({
        left: runtime.camera.x, top: runtime.camera.y,
        right: runtime.camera.x + width, bottom: runtime.camera.y + height,
      }, true);
      await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      runtime.streamStats.visibleAssetMisses = 0;
      runtime.streamStats.visibleDetailMisses = 0;
      runtime.streamStats.visibleDetailMissRegionIds = {};
      runtime.touch.firstInputAt = null;
      runtime.state.firstInputResponseMs = null;
      Object.assign(runtime.streamStats, {
        frameSamples: 0, maxFrameMs: 0, overBudgetFrames: 0,
        maxFrameWorkMs: 0, overBudgetFrameWork: 0,
      });
    });
    const manualPositions = [];
    const manualRouteHistory = [];
    for (const vector of [{ x: 0, y: -1 }, { x: 1, y: 0 }, { x: 0, y: 1 }, { x: -1, y: 0 }]) {
      const legStart = await manualPage.evaluate(input => {
        const runtime = window.__ACT1_PRESERVED_CUTOVER__.frame.contentWindow.__ACT1_HIFI_G1__;
        const start = { ...runtime.state.position };
        runtime.touch.x = input.x;
        runtime.touch.y = input.y;
        if (runtime.touch.firstInputAt === null) {
          runtime.touch.firstInputAt = window.__ACT1_PRESERVED_CUTOVER__.frame.contentWindow.performance.now();
        }
        return start;
      }, vector);
      await manualPage.waitForFunction(start => {
        const runtime = window.__ACT1_PRESERVED_CUTOVER__.frame.contentWindow.__ACT1_HIFI_G1__;
        return Math.hypot(runtime.state.position.x - start.x, runtime.state.position.y - start.y) >= 8;
      }, legStart, { timeout: 15_000 });
      const leg = await manualPage.evaluate(() => {
        const runtime = window.__ACT1_PRESERVED_CUTOVER__.frame.contentWindow.__ACT1_HIFI_G1__;
        runtime.touch.x = 0;
        runtime.touch.y = 0;
        return { position: { ...runtime.state.position }, routeId: runtime.activeCorridor.id };
      });
      manualPositions.push(leg.position);
      manualRouteHistory.push(leg.routeId);
    }
    const manual = await manualPage.evaluate(({ positions, routeHistory }) => {
      const runtime = window.__ACT1_PRESERVED_CUTOVER__.frame.contentWindow.__ACT1_HIFI_G1__;
      runtime.touch.x = 0;
      runtime.touch.y = 0;
      return {
        positions,
        routeHistory,
        firstInputResponseMs: runtime.state.firstInputResponseMs,
        routeSwitches: runtime.state.routeSwitches,
        frameSamples: runtime.streamStats.frameSamples,
        maxFrameWorkMs: runtime.streamStats.maxFrameWorkMs,
        overBudgetFrameWork: runtime.streamStats.overBudgetFrameWork,
      };
    }, { positions: manualPositions, routeHistory: manualRouteHistory });
    assert.equal(new Set(manual.positions.map(point => `${point.x.toFixed(1)},${point.y.toFixed(1)}`)).size, 4,
      'Greenhollow free-roam did not move on every leg');
    assert(manual.firstInputResponseMs !== null
      && manual.firstInputResponseMs >= 0 && manual.firstInputResponseMs < 80,
      `continuous input response exceeded 80 ms: ${manual.firstInputResponseMs}`);
    const allowedWorkHitches = Math.max(1, Math.floor(manual.frameSamples * 0.005));
    assert(manual.overBudgetFrameWork <= allowedWorkHitches,
      'repeated runtime frame-work hitch detected');
    assert(manual.maxFrameWorkMs <= 80, 'runtime frame-work maximum exceeded input budget');
    assert(manual.routeHistory.includes('greenhollow-to-whispering-woods-cave'),
      'painted Greenhollow north road did not select Whispering Woods ownership');
    assert(manual.routeSwitches >= 1, 'painted-road ownership never switched');
    const manualSnapshot = await snapshot(manualPage);
    assertSnapshot(manualSnapshot, 'manual free-roam and affinity');
    await manualPage.screenshot({
      path: path.join(EVIDENCE, 'greenhollow-free-roam-preserved.jpg'),
      type: 'jpeg', quality: 94,
    });
    allErrors.push(...manualErrors);
    await closePage(manualPage);

    const branchRoute = routes.find(route => route.id === 'millbrook-to-port-sapphire');
    const branchPage = await browser.newPage({ viewport: { width: 852, height: 1846 } });
    const branchErrors = monitor(branchPage);
    await startSavedGame(branchPage, branchRoute, { holdTransitions: true });
    const affinity = await branchPage.evaluate(async () => {
      const runtime = window.__ACT1_PRESERVED_CUTOVER__.frame.contentWindow.__ACT1_HIFI_G1__;
      const streamProbe = async point => {
        runtime.state.position = { ...point };
        const stage = window.__ACT1_PRESERVED_CUTOVER__.frame.contentDocument.querySelector('#stage');
        const width = stage.clientWidth / runtime.camera.zoom;
        const height = stage.clientHeight / runtime.camera.zoom;
        runtime.camera.x = point.x - width / 2;
        runtime.camera.y = point.y - height / 2 + 40;
        await runtime.ensureVisibleAssets({
          left: runtime.camera.x, top: runtime.camera.y,
          right: runtime.camera.x + width, bottom: runtime.camera.y + height,
        }, true);
        return [...runtime.streamStats.lastRequiredDetailRegionIds];
      };
      return {
        outbound: await streamProbe({ x: 1930, y: 1635 }),
        reversed: await streamProbe({ x: 1335, y: 1990 }),
      };
    });
    assert(affinity.outbound.includes('crystal-approach-south-912-v1'),
      'Port shared-trunk Crystal preload absent');
    assert(!affinity.reversed.includes('crystal-approach-south-912-v1'),
      'reversal retained obsolete Crystal affinity');
    allErrors.push(...branchErrors);
    await closePage(branchPage);

    const forkPage = await browser.newPage({ viewport: { width: 852, height: 1846 } });
    const forkErrors = monitor(forkPage);
    await startSavedGame(forkPage, branchRoute, { holdTransitions: true });
    const crystalTargets = await forkPage.evaluate(() => {
      const runtime = window.__ACT1_PRESERVED_CUTOVER__.frame.contentWindow.__ACT1_HIFI_G1__;
      const portProbe = runtime.walkableGeometry.probes.walkable.find(item => item.id === 'port-anchor');
      const crystalRoute = runtime.walkableGeometry.semanticRoutes.find(
        route => route.id === 'port-sapphire-to-crystal-cave',
      );
      runtime.state.position = { x: portProbe.point[0], y: portProbe.point[1] };
      return crystalRoute.waypoints.slice(1);
    });
    let forkSelected = false;
    for (const target of crystalTargets) {
      await forkPage.evaluate(point => {
        const runtime = window.__ACT1_PRESERVED_CUTOVER__.frame.contentWindow.__ACT1_HIFI_G1__;
        const dx = point.x - runtime.state.position.x;
        const dy = point.y - runtime.state.position.y;
        const length = Math.hypot(dx, dy);
        runtime.touch.x = dx / length;
        runtime.touch.y = dy / length;
      }, target);
      await forkPage.waitForFunction(point => {
        const runtime = window.__ACT1_PRESERVED_CUTOVER__.frame.contentWindow.__ACT1_HIFI_G1__;
        return Math.hypot(runtime.state.position.x - point.x, runtime.state.position.y - point.y) < 4;
      }, target, { timeout: 60_000 });
      forkSelected = await forkPage.evaluate(() => {
        const runtime = window.__ACT1_PRESERVED_CUTOVER__.frame.contentWindow.__ACT1_HIFI_G1__;
        runtime.touch.x = 0;
        runtime.touch.y = 0;
        return runtime.activeCorridor.id === 'port-sapphire-to-crystal-cave';
      });
      if (forkSelected) break;
    }
    assert(forkSelected, 'Port painted waypoints never selected Crystal ownership');
    const branch = await forkPage.evaluate(() => {
      const runtime = window.__ACT1_PRESERVED_CUTOVER__.frame.contentWindow.__ACT1_HIFI_G1__;
      runtime.touch.x = 0;
      runtime.touch.y = 0;
      return { routeId: runtime.activeCorridor.id, routeSwitches: runtime.state.routeSwitches };
    });
    assert.equal(branch.routeId, 'port-sapphire-to-crystal-cave',
      'Port shared trunk/fork did not resolve to Crystal ownership');
    assert(branch.routeSwitches >= 1, 'Port branch ownership never switched');

    lifecycleTeardownPages.add(forkPage);
    const titleRelease = await forkPage.evaluate(() => {
      const game = window.__PHASER_GAME__;
      game.scene.stop('WorldMapScene');
      game.scene.start('TitleScene');
      return true;
    });
    assert(titleRelease, 'could not leave WorldMapScene for title release proof');
    await forkPage.waitForFunction(() => {
      const api = window.__ACT1_PRESERVED_CUTOVER__;
      const title = window.__PHASER_GAME__?.scene?.getScene('TitleScene');
      return api && !api.ready && api.frame?.parentElement?.hidden
        && document.activeElement !== api.frame
        && window.__PHASER_GAME__.scene.isActive('TitleScene') && title?.menuItems?.length > 1;
    }, { timeout: 30_000 });
    lifecycleTeardownPages.delete(forkPage);
    const titleBefore = await forkPage.evaluate(() => {
      const title = window.__PHASER_GAME__.scene.getScene('TitleScene');
      title.selectedIndex = 0;
      title.updateSelection?.();
      window.__act1TitleKeyRelease = null;
      window.addEventListener('keydown', event => {
        if (event.key === 'ArrowDown') {
          window.__act1TitleKeyRelease = { defaultPrevented: event.defaultPrevented };
        }
      }, { once: true });
      return title.selectedIndex;
    });
    await forkPage.bringToFront();
    await forkPage.keyboard.press('ArrowDown');
    await forkPage.waitForFunction(() => window.__act1TitleKeyRelease !== null, null, { timeout: 5_000 });
    const titleKeyRelease = await forkPage.evaluate(() => ({
      ...window.__act1TitleKeyRelease,
      titleAfter: window.__PHASER_GAME__.scene.getScene('TitleScene').selectedIndex,
      activeTagName: document.activeElement?.tagName || null,
      activeIsFrame: document.activeElement === window.__ACT1_PRESERVED_CUTOVER__.frame,
    }));
    assert.equal(titleKeyRelease.activeIsFrame, false,
      'released cutover iframe retained keyboard focus');
    allErrors.push(...forkErrors);
    await closePage(forkPage);

    landmarkRuns.push(...await captureLandmarks(browser, allErrors, headed));
    assert.deepEqual(allErrors, [], `browser errors:\n${allErrors.join('\n')}`);
    const result = {
      schema: 'act1-preserved-cutover-phone-evidence-v1',
      proofBinding,
      manifestRevision: manifest.revision,
      landmarkRuns,
      routeRuns,
      transitionRuns,
      saveReload: { savedMidpoint, reloaded },
      manual,
      branch: { ...branch, affinity, titleRelease: { titleBefore, ...titleKeyRelease } },
      ignoredLifecycleAborts,
      errors: allErrors,
    };
    fs.writeFileSync(path.join(EVIDENCE, 'preserved-cutover-phone-telemetry.json'),
      `${JSON.stringify(result, null, 2)}\n`);
    console.log('ACT 1 PRESERVED CUTOVER PASS: seven routes, seven real transitions, save/reload, free-roam, affinity, exact phone telemetry');
  } finally {
    await browser.close();
  }
})().catch(error => {
  console.error(error.stack || error);
  process.exitCode = 1;
});
