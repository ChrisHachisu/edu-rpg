#!/usr/bin/env node
/* Exact-phone diagnostic gate for Act 1 seven-route geometry and cardinal analog motion. */

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
  : path.join(RUNTIME, 'full-world-traversal-r3/evidence');
const URL = process.argv[2] || `http://127.0.0.1:4174/${path.relative(ROOT, RUNTIME)}/`;
const manifest = JSON.parse(fs.readFileSync(path.join(RUNTIME, 'manifest.json'), 'utf8'));

function slug(routeId) {
  return routeId.replace(/[^a-z0-9]+/g, '-');
}

function routeDurationMs(route) {
  const length = route.points.slice(1).reduce((sum, point, index) => {
    const before = route.points[index];
    return sum + Math.hypot(point.x - before.x, point.y - before.y);
  }, 0);
  return Math.ceil(length / manifest.pathConstraints.movementSpeed * 1000 + 10_000);
}

function pageErrors(page) {
  const errors = [];
  page.on('pageerror', error => errors.push(`pageerror: ${error.message}`));
  page.on('console', message => {
    if (message.type() === 'error') errors.push(`console: ${message.text()}`);
  });
  return errors;
}

async function snapshot(page) {
  return page.evaluate(() => {
    const runtime = window.__ACT1_HIFI_G1__;
    const status = document.querySelector('#status');
    const resources = performance.getEntriesByType('resource');
    const resourceEntries = resources.map(entry => {
      const marker = '/runtime-v2/';
      const markerIndex = entry.name.indexOf(marker);
      return {
        path: markerIndex >= 0 ? entry.name.slice(markerIndex + marker.length) : entry.name,
        initiatorType: entry.initiatorType,
        transferBytes: entry.transferSize || 0,
        decodedBytes: entry.decodedBodySize || 0,
      };
    });
    return {
      routeId: status.dataset.routeId,
      worldViewWidth: Number(document.body.dataset.worldViewWidth),
      phoneFrame: document.body.dataset.phoneFrame,
      heroSheet: document.body.dataset.heroSheet,
      heroAsset: runtime.heroSheet.currentSrc.split('/').slice(-2).join('/'),
      heroRuntimeDirections: Number(document.body.dataset.heroRuntimeDirections),
      walkPoseMs: Number(document.body.dataset.walkPoseMs),
      movementSpeed: runtime.pathConstraints.movementSpeed,
      actorFootRadius: runtime.pathConstraints.actorFootRadius,
      position: [Number(status.dataset.x), Number(status.dataset.y)],
      facing: status.dataset.facing,
      facingFrameCounts: JSON.parse(status.dataset.facingFrameCounts || '{}'),
      firstInputResponseMs: status.dataset.firstInputResponseMs === ''
        ? null
        : Number(status.dataset.firstInputResponseMs),
      commits: Number(status.dataset.commits),
      semanticIndex: Number(status.dataset.semanticIndex),
      maxSemanticIndex: Number(status.dataset.maxSemanticIndex),
      edgeContacts: Number(status.dataset.edgeContacts),
      endpointVisits: Number(status.dataset.endpointVisits),
      touch: { x: runtime.touch.x, y: runtime.touch.y },
      stream: { ...runtime.streamStats },
      streamConfig: { ...runtime.streamConfig },
      resources: {
        count: resources.length,
        transferBytes: resources.reduce((sum, entry) => sum + (entry.transferSize || 0), 0),
        decodedBytes: resources.reduce((sum, entry) => sum + (entry.decodedBodySize || 0), 0),
        entries: resourceEntries,
      },
    };
  });
}

(async () => {
  fs.mkdirSync(EVIDENCE, { recursive: true });
  const browser = await chromium.launch({ headless: true, channel: 'chrome' });
  const routeRuns = [];
  const allErrors = [];

  for (const route of manifest.pathConstraints.corridors) {
    const context = await browser.newContext({
      viewport: { width: 852, height: 1846 },
      deviceScaleFactor: 1,
      recordVideo: { dir: EVIDENCE, size: { width: 852, height: 1846 } },
    });
    const page = await context.newPage();
    const errors = pageErrors(page);
    const video = page.video();
    const query = new URLSearchParams({ route: route.id, demo: 'traverse', crystalGate: 'open' });
    await page.goto(`${URL}?${query}`, { waitUntil: 'networkidle', timeout: 30_000 });
    await page.waitForFunction(() => document.body.dataset.ready === 'true');
    await page.waitForTimeout(250);
    const start = await snapshot(page);
    await page.screenshot({
      path: path.join(EVIDENCE, `${slug(route.id)}-start.jpg`),
      type: 'jpeg', quality: 94,
    });
    await page.waitForFunction(
      () => Number(document.querySelector('#status').dataset.endpointVisits) >= 1,
      null,
      { timeout: routeDurationMs(route) },
    );
    const end = await snapshot(page);
    await page.screenshot({
      path: path.join(EVIDENCE, `${slug(route.id)}-end.jpg`),
      type: 'jpeg', quality: 94,
    });
    await page.close();
    await video.saveAs(path.join(EVIDENCE, `${slug(route.id)}-traverse-852x1846.webm`));
    await context.close();
    allErrors.push(...errors);
    routeRuns.push({ id: route.id, start, end });
  }

  const blockerRuns = [];
  for (const route of manifest.pathConstraints.corridors) {
    for (const probe of route.blockerProbes) {
      const page = await browser.newPage({ viewport: { width: 852, height: 1846 } });
      const errors = pageErrors(page);
      const query = new URLSearchParams({
        route: route.id,
        demo: 'blocker',
        probe: probe.id,
        pathDebug: '1',
        crystalGate: 'open',
      });
      await page.goto(`${URL}?${query}`, { waitUntil: 'networkidle', timeout: 30_000 });
      await page.waitForFunction(() => document.body.dataset.ready === 'true');
      await page.waitForFunction(
        () => Number(document.querySelector('#status').dataset.edgeContacts) >= 8,
        null,
        { timeout: 5_000 },
      );
      const result = await snapshot(page);
      await page.screenshot({
        path: path.join(EVIDENCE, `${slug(route.id)}-${probe.id}-blocker.jpg`),
        type: 'jpeg', quality: 92,
      });
      await page.close();
      allErrors.push(...errors);
      blockerRuns.push({ routeId: route.id, probeId: probe.id, result });
    }
  }

  const facingContext = await browser.newContext({
    viewport: { width: 852, height: 1846 },
    deviceScaleFactor: 1,
    recordVideo: { dir: EVIDENCE, size: { width: 852, height: 1846 } },
  });
  const facingPage = await facingContext.newPage();
  const facingErrors = pageErrors(facingPage);
  const facingVideo = facingPage.video();
  await facingPage.goto(`${URL}?demo=facings`, { waitUntil: 'networkidle', timeout: 30_000 });
  await facingPage.waitForFunction(() => document.body.dataset.ready === 'true');
  await facingPage.waitForFunction(() => {
    const counts = JSON.parse(document.querySelector('#status').dataset.facingFrameCounts || '{}');
    return ['down', 'left', 'up', 'right'].every(direction => counts[direction] >= 8);
  }, null, { timeout: 5_000 });
  const facing = await snapshot(facingPage);
  await facingPage.screenshot({
    path: path.join(EVIDENCE, 'cardinal-facing-125ms.jpg'), type: 'jpeg', quality: 96,
  });
  await facingPage.close();
  await facingVideo.saveAs(path.join(EVIDENCE, 'cardinal-facing-125ms-852x1846.webm'));
  await facingContext.close();
  allErrors.push(...facingErrors);

  const joystickPage = await browser.newPage({ viewport: { width: 852, height: 1846 } });
  const joystickErrors = pageErrors(joystickPage);
  await joystickPage.goto(URL, { waitUntil: 'networkidle', timeout: 30_000 });
  await joystickPage.waitForFunction(() => document.body.dataset.ready === 'true');
  const box = await joystickPage.locator('#pad').boundingBox();
  const center = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
  await joystickPage.mouse.move(center.x, center.y);
  await joystickPage.mouse.down();
  await joystickPage.mouse.move(center.x + box.width * 0.24, center.y - box.height * 0.17, { steps: 3 });
  await joystickPage.waitForTimeout(70);
  const joystickActive = await snapshot(joystickPage);
  await joystickPage.screenshot({
    path: path.join(EVIDENCE, 'analog-joystick-active.jpg'), type: 'jpeg', quality: 96,
  });
  await joystickPage.mouse.up();
  await joystickPage.waitForTimeout(40);
  const joystickReleased = await snapshot(joystickPage);
  await joystickPage.screenshot({
    path: path.join(EVIDENCE, 'analog-joystick-recentered.jpg'), type: 'jpeg', quality: 96,
  });
  await joystickPage.close();
  allErrors.push(...joystickErrors);

  const bootPage = await browser.newPage({ viewport: { width: 852, height: 1846 } });
  const bootErrors = pageErrors(bootPage);
  await bootPage.route(/\/(chunks|port-pixel-source|central-east-912-v1|western-hub-912-v1|deep-sunken-outer-west-912-v1|coastal-reef-912-v1|hero-g3)\//, async route => {
    await new Promise(resolve => setTimeout(resolve, 350));
    await route.continue();
  });
  await bootPage.goto(URL, { waitUntil: 'domcontentloaded', timeout: 30_000 });
  await bootPage.waitForSelector('#boot-cover');
  await bootPage.waitForTimeout(80);
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
  await bootPage.close();
  allErrors.push(...bootErrors);
  await browser.close();

  const authored912RegionIds = manifest.detailRegions.map(region => region.id);
  const result = {
    routeRuns,
    blockerRuns,
    facing,
    joystick: { active: joystickActive, released: joystickReleased },
    boot: { before: bootBefore, after: bootAfter },
    errors: allErrors,
    authored912Coverage: {
      regionIds: authored912RegionIds,
      fullAct1: false,
      centralEastBatchComplete: true,
      westernHubBatchComplete: true,
      deepSunkenOuterWestBatchComplete: true,
      coastalReefBatchComplete: true,
      hardFailureReason: 'All seven locked phone-route footprints are authored at 912; remaining off-route Act 1 legacy coverage stays explicit diagnostic fallback only.',
      nextRelayRequired: true,
    },
  };
  fs.writeFileSync(
    path.join(EVIDENCE, 'full-world-traversal-telemetry.json'),
    `${JSON.stringify(result, null, 2)}\n`,
  );

  assert.deepEqual(allErrors, []);
  assert.equal(routeRuns.length, 7);
  for (const run of routeRuns) {
    const route = manifest.pathConstraints.corridors.find(candidate => candidate.id === run.id);
    assert.equal(run.start.phoneFrame, '852x1846');
    assert.equal(run.start.worldViewWidth, 208);
    assert.equal(run.start.heroSheet, '192x512');
    assert.equal(run.start.heroAsset, 'hero-g3/hero-act1-female-walk-8x3-64-g3.png');
    assert.equal(run.start.heroRuntimeDirections, 4);
    assert.equal(run.start.walkPoseMs, 125);
    assert.equal(run.start.movementSpeed, 52);
    assert.ok(run.end.endpointVisits >= 1, `${run.id} did not reach its endpoint`);
    assert.equal(run.end.maxSemanticIndex, route.semanticCells.length - 1, `${run.id} missed semantic commits`);
    assert.ok(run.end.stream.peakLoadedChunks <= run.end.streamConfig.maxLoadedChunks, `${run.id} chunk budget exceeded`);
    assert.ok(run.end.stream.peakLoadedDetailRegions <= run.end.streamConfig.maxLoadedDetailRegions, `${run.id} detail budget exceeded`);
    assert.ok(run.end.stream.peakRequiredDetailRegions <= run.end.streamConfig.maxLoadedDetailRegions, `${run.id} required detail budget exceeded`);
    assert.equal(run.end.stream.visibleAssetMisses, 0, `${run.id} visible chunk miss`);
    assert.equal(run.end.stream.visibleDetailMisses, 0, `${run.id} visible detail miss`);
    assert.ok(run.end.stream.overBudgetFrames / Math.max(1, run.end.stream.frameSamples) < 0.05,
      `${run.id} frame pacing exceeded 5% slow frames`);
  }
  const millbrookPort = routeRuns.find(run => run.id === 'millbrook-to-port-sapphire');
  const greenhollowSunken = routeRuns.find(run => run.id === 'greenhollow-to-sunken-cellar');
  const greenhollowWhisper = routeRuns.find(run => run.id === 'greenhollow-to-whispering-woods-cave');
  const greenhollowMillbrook = routeRuns.find(run => run.id === 'greenhollow-to-millbrook');
  const portCoastal = routeRuns.find(run => run.id === 'port-sapphire-to-coastal-reef');
  const portDarkfang = routeRuns.find(run => run.id === 'port-sapphire-to-darkfang');
  const portCrystal = routeRuns.find(run => run.id === 'port-sapphire-to-crystal-cave');
  assert.ok(greenhollowSunken.start.resources.entries.some(entry =>
    entry.path.includes('western-hub-912-v1/greenhollow-hub-lattice-912-runtime-v1.png')),
  'Greenhollow startup did not request its authored hub base');
  assert.ok(greenhollowSunken.end.resources.entries.some(entry =>
    entry.path.includes('western-hub-912-v1/sunken-approach-lattice-912-runtime-v1.png')),
  'Sunken traversal did not request its authored approach base');
  assert.ok(greenhollowSunken.end.resources.entries.some(entry =>
    entry.path.includes('deep-sunken-outer-west-912-v1/sunken-deep-lattice-912-runtime-v1.png')),
  'Sunken traversal did not request its authored deep base');
  assert.ok(greenhollowWhisper.end.resources.entries.some(entry =>
    entry.path.includes('western-hub-912-v1/whispering-approach-lattice-912-runtime-v1.png')),
  'Whispering traversal did not request its authored approach base');
  assert.ok(greenhollowMillbrook.end.resources.entries.some(entry =>
    entry.path.includes('western-hub-912-v1/greenhollow-millbrook-lattice-912-runtime-v1.png')),
  'Millbrook traversal did not request its authored western approach base');
  assert.ok(millbrookPort.start.resources.entries.some(entry =>
    entry.path.includes('central-east-912-v1/millbrook-west-lattice-912-runtime-v1.png')),
  'Millbrook startup did not request its authored 912 base');
  assert.ok(millbrookPort.start.resources.entries.some(entry =>
    entry.path.includes('deep-sunken-outer-west-912-v1/millbrook-outer-west-lattice-912-runtime-v1.png')),
  'Millbrook startup did not request its authored outer-west base');
  assert.ok(portCoastal.end.resources.entries.some(entry =>
    entry.path.includes('coastal-reef-912-v1/coastal-channel-lattice-912-runtime-v1.png')),
  'Coastal traversal did not request its authored channel base');
  assert.ok(portCoastal.end.resources.entries.some(entry =>
    entry.path.includes('coastal-reef-912-v1/coastal-reef-lattice-912-runtime-v1.png')),
  'Coastal traversal did not request its authored reef base');
  assert.ok(portDarkfang.start.resources.entries.some(entry =>
    entry.path.includes('port-pixel-source/port-sapphire-lattice-912-runtime-v1.png')),
  'Port startup did not request the locked Port 912 base');
  assert.ok(portDarkfang.end.resources.entries.some(entry =>
    entry.path.includes('central-east-912-v1/north-fork-lattice-912-runtime-v1.png')),
  'Darkfang traversal did not request the authored north-fork 912 base');
  assert.ok(portDarkfang.end.resources.entries.some(entry =>
    entry.path.includes('central-east-912-v1/darkfang-north-lattice-912-runtime-v1.png')),
  'Darkfang traversal did not request its authored northern continuation');
  assert.ok(portCrystal.end.resources.entries.some(entry =>
    entry.path.includes('central-east-912-v1/crystal-approach-north-lattice-912-runtime-v1.png')),
  'Crystal traversal did not request its authored northern continuation');
  assert.ok(routeRuns.some(run => run.end.stream.detailEvictions > 0),
    'the full traversal did not exercise detail-region eviction');
  assert.equal(blockerRuns.length, 21);
  assert.ok(blockerRuns.every(run => run.result.edgeContacts >= 8), 'a route/landmark blocker did not engage');
  assert.deepEqual(Object.keys(facing.facingFrameCounts).sort(), ['down', 'left', 'right', 'up']);
  assert.ok(Object.values(facing.facingFrameCounts).every(count => count >= 8), 'not all cardinal rows rendered');
  assert.ok(Math.hypot(joystickActive.touch.x, joystickActive.touch.y) > 0.2, 'analog knob did not track pointer displacement');
  assert.ok(joystickActive.firstInputResponseMs < 80, `analog first response was ${joystickActive.firstInputResponseMs}ms`);
  assert.deepEqual(joystickReleased.touch, { x: 0, y: 0 });
  assert.deepEqual(bootBefore, { opacity: '1', visibility: 'visible' });
  assert.deepEqual(bootAfter, { opacity: '0', visibility: 'hidden' });
  assert.equal(result.authored912Coverage.fullAct1, false, 'fuzzy fallback must remain an explicit hard failure');

  console.log(JSON.stringify(result, null, 2));
})().catch(error => {
  console.error(error.stack || error);
  process.exitCode = 1;
});
