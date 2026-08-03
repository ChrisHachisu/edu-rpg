#!/usr/bin/env node
/* Exact-phone Act 1 free-roam polygon collision and seven-route motion gate. */

const assert = require('node:assert/strict');
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
const EVIDENCE = process.env.ACT1_EVIDENCE_DIR
  ? path.resolve(ROOT, process.env.ACT1_EVIDENCE_DIR)
  : path.join(RUNTIME, 'walkable-regions-v1/phone-evidence');
const URL = process.argv[2]
  || `http://127.0.0.1:4174/${path.relative(ROOT, RUNTIME)}/`;
const geometry = JSON.parse(fs.readFileSync(path.join(RUNTIME, 'walkable-regions-v1.json'), 'utf8'));
const EVIDENCE_MODE = process.env.ACT1_EVIDENCE_MODE || 'performance';
assert(['performance', 'video'].includes(EVIDENCE_MODE),
  'ACT1_EVIDENCE_MODE must be performance or video');
const PERFORMANCE_MODE = EVIDENCE_MODE === 'performance';
const HEADED = process.env.ACT1_HEADED === '1';

function slug(value) {
  return value.replace(/[^a-z0-9]+/g, '-');
}

function routeDurationMs(route) {
  const length = route.waypoints.slice(1).reduce((sum, waypoint, index) => (
    sum + Math.hypot(
      waypoint.x - route.waypoints[index].x,
      waypoint.y - route.waypoints[index].y,
    )
  ), 0);
  return Math.ceil(length / geometry.movement.movementSpeed * 1000 + 8_000);
}

function monitor(page) {
  const errors = [];
  page.on('pageerror', error => errors.push(`pageerror: ${error.message}`));
  page.on('console', message => {
    if (message.type() === 'error') errors.push(`console: ${message.text()}`);
  });
  page.on('requestfailed', request => errors.push(
    `requestfailed: ${request.url()} ${request.failure()?.errorText || ''}`,
  ));
  return errors;
}

async function snapshot(page) {
  return page.evaluate(() => {
    const runtime = window.__ACT1_HIFI_G1__;
    const status = document.querySelector('#status');
    const resources = performance.getEntriesByType('resource');
    return {
      routeId: status.dataset.routeId,
      routeSwitches: Number(status.dataset.routeSwitches),
      position: [Number(status.dataset.x), Number(status.dataset.y)],
      facing: status.dataset.facing,
      commits: Number(status.dataset.commits),
      semanticIndex: runtime.state.semanticIndex,
      semanticCellCount: runtime.activeCorridor.semanticCells.length,
      semanticCell: { ...runtime.state.cell },
      endpointVisits: Number(status.dataset.endpointVisits),
      edgeContacts: Number(status.dataset.edgeContacts),
      firstInputResponseMs: status.dataset.firstInputResponseMs === ''
        ? null
        : Number(status.dataset.firstInputResponseMs),
      phoneFrame: document.body.dataset.phoneFrame,
      worldViewWidth: Number(document.body.dataset.worldViewWidth),
      walkPoseMs: Number(document.body.dataset.walkPoseMs),
      heroRuntimeDirections: Number(document.body.dataset.heroRuntimeDirections),
      geometry: {
        schema: runtime.walkableGeometry.schema,
        revision: runtime.walkableGeometry.revision,
        regions: runtime.walkableGeometry.regions.length,
        actorFootRadius: runtime.walkableGeometry.actorFootRadius,
        maxSubstep: runtime.walkableGeometry.maxSubstep,
      },
      stream: { ...runtime.streamStats },
      streamConfig: { ...runtime.streamConfig },
      resources: {
        count: resources.length,
        transferBytes: resources.reduce((sum, entry) => sum + (entry.transferSize || 0), 0),
        decodedBytes: resources.reduce((sum, entry) => sum + (entry.decodedBodySize || 0), 0),
      },
    };
  });
}

function assertSnapshot(result, label) {
  assert.equal(result.phoneFrame, '852x1846', `${label}: phone frame changed`);
  assert.equal(result.worldViewWidth, 208, `${label}: camera width changed`);
  assert.equal(result.walkPoseMs, 125, `${label}: walk cadence changed`);
  assert.equal(result.heroRuntimeDirections, 4, `${label}: cardinal runtime rows changed`);
  assert.equal(result.geometry.revision, 3, `${label}: walkable geometry revision changed`);
  assert.equal(result.geometry.regions, 18, `${label}: walkable-region count changed`);
  assert.equal(result.geometry.actorFootRadius, 4, `${label}: actor foot radius changed`);
  assert.equal(result.geometry.maxSubstep, 2, `${label}: collision substep changed`);
  assert.equal(result.stream.visibleAssetMisses, 0, `${label}: visible chunk asset miss`);
  assert.equal(result.stream.visibleDetailMisses, 0,
    `${label}: visible detail asset miss ${JSON.stringify(result.stream.visibleDetailMissRegionIds)}`);
  assert(result.stream.peakLoadedChunks <= result.streamConfig.maxLoadedChunks,
    `${label}: six-chunk ceiling exceeded`);
  assert(result.stream.peakLoadedDetailRegions <= result.streamConfig.maxLoadedDetailRegions,
    `${label}: four-detail ceiling exceeded`);
  assert(result.stream.peakResidentBytes > 0, `${label}: resident telemetry missing`);
  if (PERFORMANCE_MODE) {
    const isolatedFrameBudget = Math.max(1, Math.floor(result.stream.frameSamples * 0.005));
    assert(result.stream.overBudgetFrames <= isolatedFrameBudget,
      `${label}: repeated steady-state scheduler hitch detected`);
    assert(result.stream.maxFrameMs <= 100, `${label}: steady-state scheduler gap exceeded 100ms`);
    assert(result.stream.overBudgetFrameWork <= isolatedFrameBudget,
      `${label}: repeated runtime frame-work hitch detected`);
    assert(result.stream.maxFrameWorkMs <= 80, `${label}: runtime frame-work maximum exceeded input budget`);
  }
}

(async () => {
  fs.mkdirSync(EVIDENCE, { recursive: true });
  const browser = await chromium.launch({
    headless: !HEADED,
    channel: 'chrome',
    args: [
      '--disable-background-timer-throttling',
      '--disable-backgrounding-occluded-windows',
      '--disable-renderer-backgrounding',
      ...(HEADED ? ['--window-position=-20000,-20000'] : []),
    ],
  });
  try {
    const errors = [];
    const routeRuns = [];

  for (const route of geometry.semanticRoutes) {
    const contextOptions = {
      viewport: { width: 852, height: 1846 },
      deviceScaleFactor: 1,
    };
    if (!PERFORMANCE_MODE) {
      contextOptions.recordVideo = { dir: EVIDENCE, size: { width: 852, height: 1846 } };
    }
    const context = await browser.newContext(contextOptions);
    const page = await context.newPage();
    const runErrors = monitor(page);
    const video = PERFORMANCE_MODE ? null : page.video();
    const query = new URLSearchParams({
      route: route.id,
      demo: 'traverse-once',
      crystalGate: 'open',
    });
    await page.goto(`${URL}?${query}`, { waitUntil: 'networkidle', timeout: 30_000 });
    await page.waitForFunction(() => document.body.dataset.ready === 'true');
    const start = await snapshot(page);
    if (!PERFORMANCE_MODE) {
      await page.screenshot({
        path: path.join(EVIDENCE, `${slug(route.id)}-start.jpg`),
        type: 'jpeg', quality: 94,
      });
    }
    await page.evaluate(() => {
      const stats = window.__ACT1_HIFI_G1__.streamStats;
      stats.frameSamples = 0;
      stats.maxFrameMs = 0;
      stats.overBudgetFrames = 0;
      stats.maxFrameWorkMs = 0;
      stats.overBudgetFrameWork = 0;
    });
    await page.waitForFunction(
      () => Number(document.querySelector('#status').dataset.endpointVisits) >= 1,
      null,
      { timeout: routeDurationMs(route) },
    );
    const end = await snapshot(page);
    if (!PERFORMANCE_MODE) {
      await page.screenshot({
        path: path.join(EVIDENCE, `${slug(route.id)}-end.jpg`),
        type: 'jpeg', quality: 94,
      });
    }
    assert.equal(end.routeId, route.id, `${route.id}: semantic route changed during demo`);
    assert(end.endpointVisits >= 1, `${route.id}: endpoint was not reached`);
    assert.equal(end.semanticIndex, end.semanticCellCount - 1,
      `${route.id}: painted-ground traversal did not reach the final semantic save cell`);
    assert(end.commits > 0, `${route.id}: semantic progression did not commit`);
    console.log(
      `${route.id}: ${end.stream.overBudgetFrames}/${end.stream.frameSamples} frames >34ms, `
      + `max ${end.stream.maxFrameMs.toFixed(2)}ms, work `
      + `${end.stream.overBudgetFrameWork}/${end.stream.maxFrameWorkMs.toFixed(2)}ms`,
    );
    assertSnapshot(end, route.id);
    errors.push(...runErrors);
    await page.close();
    if (video) {
      const rawVideoPath = await video.path();
      const evidenceVideoPath = path.join(EVIDENCE, `${slug(route.id)}-852x1846.webm`);
      await video.saveAs(evidenceVideoPath);
      if (rawVideoPath !== evidenceVideoPath && fs.existsSync(rawVideoPath)) fs.unlinkSync(rawVideoPath);
    }
    await context.close();
    routeRuns.push({ id: route.id, start, end });
  }

  const freeRoamPage = await browser.newPage({ viewport: { width: 852, height: 1846 } });
  const freeRoamErrors = monitor(freeRoamPage);
  const freeRoamQuery = new URLSearchParams({
    route: 'greenhollow-to-sunken-cellar',
    crystalGate: 'open',
    startProbe: 'greenhollow-open-north',
  });
  await freeRoamPage.goto(`${URL}?${freeRoamQuery}`, { waitUntil: 'networkidle', timeout: 30_000 });
  await freeRoamPage.waitForFunction(() => document.body.dataset.ready === 'true');
  await freeRoamPage.evaluate(() => {
    const stats = window.__ACT1_HIFI_G1__.streamStats;
    stats.frameSamples = 0;
    stats.maxFrameMs = 0;
    stats.overBudgetFrames = 0;
    stats.maxFrameWorkMs = 0;
    stats.overBudgetFrameWork = 0;
  });
  await freeRoamPage.keyboard.down('ArrowUp');
  await freeRoamPage.waitForTimeout(300);
  await freeRoamPage.keyboard.up('ArrowUp');
  const manualJunction = await snapshot(freeRoamPage);
  assert.equal(manualJunction.routeId, 'greenhollow-to-whispering-woods-cave',
    'manual northbound movement did not select the painted Whispering Woods route');
  assert(manualJunction.routeSwitches >= 1, 'manual painted-route junction did not switch ownership');
  await freeRoamPage.keyboard.down('ArrowDown');
  await freeRoamPage.waitForTimeout(300);
  await freeRoamPage.keyboard.up('ArrowDown');
  const freeRoamPositions = [];
  for (const key of ['ArrowRight', 'ArrowDown', 'ArrowLeft', 'ArrowUp']) {
    await freeRoamPage.keyboard.down(key);
    await freeRoamPage.waitForTimeout(650);
    await freeRoamPage.keyboard.up(key);
    freeRoamPositions.push((await snapshot(freeRoamPage)).position);
  }
  const freeRoam = await snapshot(freeRoamPage);
  console.log(
    `greenhollow-free-roam: ${freeRoam.stream.overBudgetFrames}/${freeRoam.stream.frameSamples} `
    + `frames >34ms, max ${freeRoam.stream.maxFrameMs.toFixed(2)}ms, `
    + `work ${freeRoam.stream.maxFrameWorkMs.toFixed(2)}ms`,
  );
  if (!PERFORMANCE_MODE) {
    await freeRoamPage.screenshot({
      path: path.join(EVIDENCE, 'greenhollow-free-roam-loop.jpg'),
      type: 'jpeg', quality: 96,
    });
  }
  const distinctPositions = new Set(freeRoamPositions.map(value => value.join(',')));
  assert.equal(distinctPositions.size, 4, 'open-area free-roam loop did not move on every leg');
  assert(freeRoam.firstInputResponseMs !== null && freeRoam.firstInputResponseMs < 80,
    'first keyboard response exceeded 80ms');
  assertSnapshot(freeRoam, 'Greenhollow free-roam');
  errors.push(...freeRoamErrors);
  await freeRoamPage.close();

  const landmarkPage = await browser.newPage({ viewport: { width: 852, height: 1846 } });
  const landmarkErrors = monitor(landmarkPage);
  await landmarkPage.goto(`${URL}?${new URLSearchParams({
    route: 'greenhollow-to-sunken-cellar',
    crystalGate: 'open',
    startProbe: 'sunken-anchor',
  })}`, { waitUntil: 'networkidle', timeout: 30_000 });
  await landmarkPage.waitForFunction(() => document.body.dataset.ready === 'true');
  const sunkenBefore = await snapshot(landmarkPage);
  await landmarkPage.keyboard.down('ArrowLeft');
  await landmarkPage.waitForTimeout(800);
  await landmarkPage.keyboard.up('ArrowLeft');
  const sunkenAfter = await snapshot(landmarkPage);
  assert(sunkenAfter.position[0] >= 280,
    'Sunken west-arch pressure crossed the approved blocked ruin body');
  assert(sunkenAfter.edgeContacts > sunkenBefore.edgeContacts,
    'Sunken west-arch pressure did not register collision');
  await landmarkPage.screenshot({
    path: path.join(EVIDENCE, 'sunken-west-arch-blocked-852x1846.png'),
  });

  await landmarkPage.goto(`${URL}?${new URLSearchParams({
    route: 'greenhollow-to-millbrook',
    crystalGate: 'open',
    startProbe: 'millbrook-deck-east-edge',
  })}`, { waitUntil: 'networkidle', timeout: 30_000 });
  await landmarkPage.waitForFunction(() => document.body.dataset.ready === 'true');
  await landmarkPage.evaluate(() => {
    const stats = window.__ACT1_HIFI_G1__.streamStats;
    stats.frameSamples = 0;
    stats.maxFrameMs = 0;
    stats.overBudgetFrames = 0;
    stats.maxFrameWorkMs = 0;
    stats.overBudgetFrameWork = 0;
  });
  const millbrookPositions = [(await snapshot(landmarkPage)).position];
  for (const target of [{ x: 1280, y: 1998 }, { x: 1335, y: 1990 }]) {
    await landmarkPage.evaluate(point => {
      const runtime = window.__ACT1_HIFI_G1__;
      const dx = point.x - runtime.state.position.x;
      const dy = point.y - runtime.state.position.y;
      const length = Math.hypot(dx, dy);
      runtime.touch.x = dx / length;
      runtime.touch.y = dy / length;
      if (runtime.touch.firstInputAt === null) runtime.touch.firstInputAt = performance.now();
    }, target);
    await landmarkPage.waitForFunction(point => Math.hypot(
      window.__ACT1_HIFI_G1__.state.position.x - point.x,
      window.__ACT1_HIFI_G1__.state.position.y - point.y,
    ) < 2, target, { timeout: 5_000 });
    await landmarkPage.evaluate(() => {
      window.__ACT1_HIFI_G1__.touch.x = 0;
      window.__ACT1_HIFI_G1__.touch.y = 0;
    });
    millbrookPositions.push((await snapshot(landmarkPage)).position);
  }
  const millbrookAfter = await snapshot(landmarkPage);
  assert(millbrookAfter.position[0] >= 1333,
    'Millbrook west-east pass-through did not reach its approved east side');
  assertSnapshot(millbrookAfter, 'Millbrook west-east pass-through');
  await landmarkPage.screenshot({
    path: path.join(EVIDENCE, 'millbrook-west-east-pass-through-852x1846.png'),
  });

  await landmarkPage.goto(`${URL}?${new URLSearchParams({
    route: 'millbrook-to-port-sapphire',
    crystalGate: 'open',
    startProbe: 'port-entry-street',
  })}`, { waitUntil: 'networkidle', timeout: 30_000 });
  await landmarkPage.waitForFunction(() => document.body.dataset.ready === 'true');
  const portWestBefore = await snapshot(landmarkPage);
  await landmarkPage.keyboard.down('ArrowRight');
  await landmarkPage.waitForTimeout(900);
  await landmarkPage.keyboard.up('ArrowRight');
  const portWestAfter = await snapshot(landmarkPage);
  assert(portWestAfter.position[0] <= 1856,
    'Port west entrance pressure crossed into the non-traversable harbor interior');
  assert(portWestAfter.edgeContacts > portWestBefore.edgeContacts,
    'Port west entrance pressure did not register interior collision');
  await landmarkPage.screenshot({
    path: path.join(EVIDENCE, 'port-west-interior-blocked-852x1846.png'),
  });

  await landmarkPage.goto(`${URL}?${new URLSearchParams({
    route: 'port-sapphire-to-coastal-reef',
    crystalGate: 'open',
    startProbe: 'port-southeast-gate',
  })}`, { waitUntil: 'networkidle', timeout: 30_000 });
  await landmarkPage.waitForFunction(() => document.body.dataset.ready === 'true');
  const portSoutheastBefore = await snapshot(landmarkPage);
  await landmarkPage.keyboard.down('ArrowUp');
  await landmarkPage.waitForTimeout(900);
  await landmarkPage.keyboard.up('ArrowUp');
  const portSoutheastAfter = await snapshot(landmarkPage);
  assert(portSoutheastAfter.position[1] >= 1808,
    'Port southeast entrance pressure crossed into the non-traversable harbor interior');
  assert(portSoutheastAfter.edgeContacts > portSoutheastBefore.edgeContacts,
    'Port southeast entrance pressure did not register interior collision');
  await landmarkPage.screenshot({
    path: path.join(EVIDENCE, 'port-southeast-interior-blocked-852x1846.png'),
  });

  await landmarkPage.goto(`${URL}?${new URLSearchParams({
    route: 'greenhollow-to-sunken-cellar',
    crystalGate: 'open',
    startProbe: 'greenhollow-south-entrance',
  })}`, { waitUntil: 'networkidle', timeout: 30_000 });
  await landmarkPage.waitForFunction(() => document.body.dataset.ready === 'true');
  const heroFacings = {};
  for (const [facing, key] of Object.entries({
    up: 'ArrowUp', right: 'ArrowRight', down: 'ArrowDown', left: 'ArrowLeft',
  })) {
    await landmarkPage.keyboard.down(key);
    await landmarkPage.waitForTimeout(140);
    await landmarkPage.keyboard.up(key);
    heroFacings[facing] = await snapshot(landmarkPage);
    assert.equal(heroFacings[facing].facing, facing,
      `hero did not select the ${facing} source row`);
    await landmarkPage.screenshot({
      path: path.join(EVIDENCE, `hero-${facing}-complete-852x1846.png`),
    });
  }
  errors.push(...landmarkErrors);
  await landmarkPage.close();
  const landmarkContracts = {
    sunkenWestArch: { before: sunkenBefore, after: sunkenAfter },
    millbrookWestEast: { positions: millbrookPositions, end: millbrookAfter },
    portWestInterior: { before: portWestBefore, after: portWestAfter },
    portSoutheastInterior: { before: portSoutheastBefore, after: portSoutheastAfter },
    heroFacings,
  };

  const branchPage = await browser.newPage({ viewport: { width: 852, height: 1846 } });
  const branchErrors = monitor(branchPage);
  const branchQuery = new URLSearchParams({
    route: 'port-sapphire-to-crystal-cave',
    crystalGate: 'open',
    startProbe: 'port-north-gate',
  });
  await branchPage.goto(`${URL}?${branchQuery}`, { waitUntil: 'networkidle', timeout: 30_000 });
  await branchPage.waitForFunction(() => document.body.dataset.ready === 'true');
  await branchPage.evaluate(() => {
    const stats = window.__ACT1_HIFI_G1__.streamStats;
    stats.frameSamples = 0;
    stats.maxFrameMs = 0;
    stats.overBudgetFrames = 0;
    stats.maxFrameWorkMs = 0;
    stats.overBudgetFrameWork = 0;
  });
  const crystalRoute = geometry.semanticRoutes.find(
    route => route.id === 'port-sapphire-to-crystal-cave',
  );
  assert(crystalRoute, 'Crystal painted route is missing');
  const branchRouteHistory = [];
  let branchPrevious = crystalRoute.waypoints[0];
  const crystalTargets = crystalRoute.waypoints.slice(1);
  for (const [targetIndex, target] of crystalTargets.entries()) {
    await branchPage.evaluate(point => {
      const runtime = window.__ACT1_HIFI_G1__;
      const dx = point.x - runtime.state.position.x;
      const dy = point.y - runtime.state.position.y;
      const length = Math.hypot(dx, dy);
      runtime.touch.x = dx / length;
      runtime.touch.y = dy / length;
      if (runtime.touch.firstInputAt === null) runtime.touch.firstInputAt = performance.now();
    }, target);
    const segmentMs = Math.hypot(target.x - branchPrevious.x, target.y - branchPrevious.y)
      / geometry.movement.movementSpeed * 1000;
    await branchPage.waitForFunction(
      point => Math.hypot(
        window.__ACT1_HIFI_G1__.state.position.x - point.x,
        window.__ACT1_HIFI_G1__.state.position.y - point.y,
      ) < 2,
      target,
      { timeout: Math.ceil(segmentMs + 4_000) },
    );
    if (targetIndex === crystalTargets.length - 1) {
      await branchPage.waitForFunction(() => (
        window.__ACT1_HIFI_G1__.state.semanticIndex
          === window.__ACT1_HIFI_G1__.activeCorridor.semanticCells.length - 1
      ), null, { timeout: 2_000 });
    }
    await branchPage.evaluate(() => {
      window.__ACT1_HIFI_G1__.touch.x = 0;
      window.__ACT1_HIFI_G1__.touch.y = 0;
    });
    branchRouteHistory.push((await snapshot(branchPage)).routeId);
    branchPrevious = target;
  }
  await branchPage.evaluate(() => {
    window.__ACT1_HIFI_G1__.touch.x = 0;
    window.__ACT1_HIFI_G1__.touch.y = 0;
  });
  const manualPortCrystal = await snapshot(branchPage);
  assert.equal(manualPortCrystal.routeId, 'port-sapphire-to-crystal-cave',
    'manual Port branch did not resolve to Crystal ownership');
  assert.equal(manualPortCrystal.semanticIndex, manualPortCrystal.semanticCellCount - 1,
    'manual Port-Crystal traversal did not reach the final semantic save cell');
  assert(manualPortCrystal.routeSwitches >= 1, 'manual Port-Crystal traversal never switched ownership');
  assertSnapshot(manualPortCrystal, 'manual Port-Crystal branch');
  errors.push(...branchErrors);
  await branchPage.close();

  const turnaroundPage = await browser.newPage({ viewport: { width: 852, height: 1846 } });
  const turnaroundErrors = monitor(turnaroundPage);
  const turnaroundQuery = new URLSearchParams({
    route: 'millbrook-to-port-sapphire',
    crystalGate: 'open',
    startProbe: 'millbrook-anchor',
  });
  await turnaroundPage.goto(`${URL}?${turnaroundQuery}`, { waitUntil: 'networkidle', timeout: 30_000 });
  await turnaroundPage.waitForFunction(() => document.body.dataset.ready === 'true');
  async function streamingProbeAt(position) {
    return turnaroundPage.evaluate(async point => {
      const runtime = window.__ACT1_HIFI_G1__;
      runtime.state.position = { ...point };
      const canvas = document.querySelector('#world');
      const width = canvas.clientWidth / runtime.camera.zoom;
      const height = canvas.clientHeight / runtime.camera.zoom;
      runtime.camera.x = point.x - width / 2;
      runtime.camera.y = point.y - height / 2 + 40;
      const view = {
        left: runtime.camera.x,
        top: runtime.camera.y,
        right: runtime.camera.x + width,
        bottom: runtime.camera.y + height,
      };
      await runtime.ensureVisibleAssets(view, true);
      return {
        required: runtime.streamStats.requiredDetailRegions,
        ids: [...runtime.streamStats.lastRequiredDetailRegionIds],
      };
    }, position);
  }
  // Use accepted painted-route waypoints so the live movement loop never observes
  // an artificial position outside the actor-disk-safe walkable surface.
  const outboundAffinity = await streamingProbeAt({ x: 1930, y: 1635 });
  const reversedAffinity = await streamingProbeAt({ x: 1335, y: 1990 });
  assert(outboundAffinity.ids.includes('crystal-approach-south-912-v1'),
    'outbound Port approach did not trigger the shared Crystal preload');
  assert(!reversedAffinity.ids.includes('crystal-approach-south-912-v1'),
    'reversed Millbrook travel retained the obsolete Crystal preload');
  assert(reversedAffinity.required <= 4, 'reversed Millbrook travel exceeded four detail regions');
  errors.push(...turnaroundErrors);
  await turnaroundPage.close();

  const bootPage = await browser.newPage({ viewport: { width: 852, height: 1846 } });
  const bootErrors = monitor(bootPage);
  await bootPage.route(/\/(chunks|central-east-912-v1|western-hub-912-v1|hero-g3)\//, async route => {
    await new Promise(resolve => setTimeout(resolve, 250));
    await route.continue();
  });
  await bootPage.goto(URL, { waitUntil: 'domcontentloaded', timeout: 30_000 });
  await bootPage.waitForTimeout(60);
  const bootBefore = await bootPage.locator('#boot-cover').evaluate(element => ({
    opacity: getComputedStyle(element).opacity,
    visibility: getComputedStyle(element).visibility,
  }));
  await bootPage.waitForFunction(() => document.body.dataset.ready === 'true');
  await bootPage.waitForFunction(
    () => getComputedStyle(document.querySelector('#boot-cover')).visibility === 'hidden',
  );
  const bootAfter = await bootPage.locator('#boot-cover').evaluate(element => ({
    opacity: getComputedStyle(element).opacity,
    visibility: getComputedStyle(element).visibility,
  }));
  assert.equal(bootBefore.visibility, 'visible', 'boot cover exposed an unready frame');
  assert.equal(bootAfter.visibility, 'hidden', 'boot cover did not clear after readiness');
  errors.push(...bootErrors);
    await bootPage.close();

    assert.deepEqual(errors, [], `browser errors:\n${errors.join('\n')}`);
    const result = {
      schema: 'act1-walkable-polygons-phone-evidence-v1',
      mode: EVIDENCE_MODE,
      routeRuns,
      freeRoam: { manualJunction, positions: freeRoamPositions, end: freeRoam },
      landmarkContracts,
      manualPortCrystal: { routeHistory: branchRouteHistory, end: manualPortCrystal },
      affinityTurnaround: { outbound: outboundAffinity, reversed: reversedAffinity },
      boot: { before: bootBefore, after: bootAfter },
      errors,
    };
    fs.writeFileSync(
      path.join(EVIDENCE, PERFORMANCE_MODE
        ? 'walkable-polygons-phone-telemetry.json'
        : 'walkable-polygons-video-telemetry.json'),
      `${JSON.stringify(result, null, 2)}\n`,
    );
    console.log(
      `ACT 1 WALKABLE PHONE ${EVIDENCE_MODE.toUpperCase()} PASS: ${routeRuns.length} routes, Greenhollow free-roam, `
      + 'Sunken west blocker, Millbrook pass-through, 852x1846, six chunks/four details, no misses, boot cover',
    );
  } finally {
    await browser.close();
  }
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
