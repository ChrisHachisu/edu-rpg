#!/usr/bin/env node
/* Exact-phone rendered gate for the promoted R26 Act 1 runtime. */

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
const PACK = path.join(ROOT,
  'design/review/overworld-art-blueprint/act-by-act/act1/runtime-v2/act1-final-art-geometry-r26');
const EVIDENCE = path.join(PACK, 'runtime/phone-evidence');
const URL = process.argv[2] || 'http://127.0.0.1:5174/act1-hifi/runtime.html';
const manifest = JSON.parse(fs.readFileSync(path.join(PACK, 'runtime/manifest.json')));
const geometry = JSON.parse(fs.readFileSync(path.join(PACK, 'runtime/walkable-regions-r26.json')));
const headed = process.env.ACT1_HEADED === '1';

function slug(value) {
  return value.replace(/[^a-z0-9]+/g, '-');
}

function routeDurationMs(route) {
  const length = route.waypoints.slice(1).reduce((sum, point, index) => (
    sum + Math.hypot(point.x - route.waypoints[index].x, point.y - route.waypoints[index].y)
  ), 0);
  return Math.ceil(length / manifest.pathConstraints.movementSpeed * 1000 + 12_000);
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
    return {
      manifestRevision: runtime.manifest.revision,
      geometrySchema: runtime.walkableGeometry.schema,
      geometryRevision: runtime.walkableGeometry.revision,
      geometryRegions: runtime.walkableGeometry.regions.length,
      routeId: runtime.activeCorridor.id,
      position: { ...runtime.state.position },
      semanticIndex: runtime.state.semanticIndex,
      maxSemanticIndex: runtime.state.maxSemanticIndex,
      endpointVisits: runtime.state.endpointVisits,
      edgeContacts: runtime.state.edgeContacts,
      phoneFrame: document.body.dataset.phoneFrame,
      worldViewWidth: Number(document.body.dataset.worldViewWidth),
      stream: { ...runtime.streamStats },
      streamConfig: { ...runtime.streamConfig },
      resourcePaths: performance.getEntriesByType('resource').map(entry => new URL(entry.name).pathname),
    };
  });
}

function assertHealthy(result, label) {
  assert.equal(result.manifestRevision, 11, `${label}: manifest revision`);
  assert.equal(result.geometrySchema, 'act1-art-fit-polygon-authority-v2', `${label}: geometry schema`);
  assert.equal(result.geometryRevision, 2, `${label}: geometry revision`);
  assert.equal(result.geometryRegions, 25, `${label}: region inventory`);
  assert.equal(result.phoneFrame, '852x1846', `${label}: phone frame`);
  assert.equal(result.worldViewWidth, 208, `${label}: camera width`);
  assert.equal(result.stream.visibleAssetMisses, 0, `${label}: visible chunk misses`);
  assert.equal(result.stream.visibleDetailMisses, 0, `${label}: visible detail misses`);
  assert.equal(result.stream.requiredDetailRegions, 0, `${label}: stale detail requirement`);
  assert.equal(result.stream.peakRequiredDetailRegions, 0, `${label}: stale peak detail requirement`);
  assert(result.stream.peakLoadedChunks <= result.streamConfig.maxLoadedChunks, `${label}: chunk ceiling`);
  assert.equal(result.streamConfig.maxLoadedDetailRegions, 0, `${label}: stale detail budget`);
}

(async () => {
  fs.mkdirSync(EVIDENCE, { recursive: true });
  assert.equal(manifest.revision, 11);
  assert.deepEqual(manifest.detailRegions, []);
  assert.equal(geometry.semanticRoutes.length, 7);

  const browser = await chromium.launch({
    headless: !headed,
    channel: 'chrome',
    args: [
      ...(headed ? [] : ['--use-angle=swiftshader']),
      '--enable-webgl', '--ignore-gpu-blocklist', '--mute-audio',
      '--disable-background-timer-throttling', '--disable-renderer-backgrounding',
    ],
  });
  const runs = [];
  const allErrors = [];
  try {
    for (const route of geometry.semanticRoutes) {
      const page = await browser.newPage({ viewport: { width: 852, height: 1846 } });
      const errors = monitor(page);
      const query = new URLSearchParams({ route: route.id, demo: 'traverse-once', crystalGate: 'open' });
      await page.goto(`${URL}?${query}`, { waitUntil: 'networkidle', timeout: 30_000 });
      await page.waitForFunction(() => document.body.dataset.ready === 'true');
      const start = await snapshot(page);
      assertHealthy(start, `${route.id} start`);
      await page.screenshot({ path: path.join(EVIDENCE, `${slug(route.id)}-start-852x1846.png`) });
      await page.waitForFunction(
        () => window.__ACT1_HIFI_G1__.state.endpointVisits >= 1,
        null,
        { timeout: routeDurationMs(route) },
      );
      await page.waitForTimeout(150);
      const end = await snapshot(page);
      assertHealthy(end, `${route.id} end`);
      assert.equal(end.routeId, route.id, `${route.id}: route ownership`);
      assert.equal(end.maxSemanticIndex,
        manifest.pathConstraints.corridors.find(item => item.id === route.id).semanticCells.length - 1,
        `${route.id}: semantic endpoint`);
      assert(Math.hypot(
        end.position.x - route.waypoints.at(-1).x,
        end.position.y - route.waypoints.at(-1).y,
      ) < 0.1, `${route.id}: physical endpoint`);
      assert(end.resourcePaths.some(item => item.includes('/chunks/base/')), `${route.id}: R26 chunks absent`);
      await page.screenshot({ path: path.join(EVIDENCE, `${slug(route.id)}-end-852x1846.png`) });
      runs.push({ id: route.id, start, end });
      allErrors.push(...errors);
      await page.close();
    }

    const crystal = geometry.semanticRoutes.find(route => route.id === 'port-sapphire-to-crystal-cave');
    const closedPage = await browser.newPage({ viewport: { width: 852, height: 1846 } });
    const closedErrors = monitor(closedPage);
    await closedPage.goto(`${URL}?route=${crystal.id}`, {
      waitUntil: 'networkidle', timeout: 30_000,
    });
    await closedPage.waitForFunction(() => document.body.dataset.ready === 'true');
    await closedPage.evaluate(() => {
      const runtime = window.__ACT1_HIFI_G1__;
      runtime.state.position = { x: 2058, y: 1282 };
      const target = { x: 2105, y: 1245 };
      const dx = target.x - runtime.state.position.x;
      const dy = target.y - runtime.state.position.y;
      const length = Math.hypot(dx, dy);
      runtime.touch.x = dx / length;
      runtime.touch.y = dy / length;
    });
    await closedPage.waitForFunction(
      () => window.__ACT1_HIFI_G1__.state.edgeContacts > 0,
      null,
      { timeout: 5_000 },
    );
    await closedPage.evaluate(() => {
      window.__ACT1_HIFI_G1__.touch.x = 0;
      window.__ACT1_HIFI_G1__.touch.y = 0;
    });
    const closed = await snapshot(closedPage);
    assertHealthy(closed, 'Crystal closed');
    assert(Math.hypot(
      closed.position.x - crystal.waypoints.at(-1).x,
      closed.position.y - crystal.waypoints.at(-1).y,
    ) > 50, 'Crystal seal did not stop traversal');
    assert(closed.edgeContacts > 0, 'Crystal seal produced no collision contacts');
    await closedPage.screenshot({ path: path.join(EVIDENCE, 'crystal-seal-closed-852x1846.png') });
    allErrors.push(...closedErrors);
    await closedPage.close();

    assert.deepEqual(allErrors, []);
    const result = { manifestRevision: 11, geometrySha256: manifest.designLocks.collisionAuthoritySha256,
      routes: runs, crystalClosed: closed, errors: allErrors };
    fs.writeFileSync(path.join(EVIDENCE, 'r26-runtime-phone-telemetry.json'), `${JSON.stringify(result, null, 2)}\n`);
    console.log('ACT 1 R26 RENDER PASS: seven routes, exact endpoints, Crystal seal, 852x1846, zero misses/errors');
  } finally {
    await browser.close();
  }
})().catch(error => {
  console.error(error.stack || error);
  process.exitCode = 1;
});
