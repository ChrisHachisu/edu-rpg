#!/usr/bin/env node
/* Exact-phone render and motion gate for the streamed Port Sapphire prototype. */

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
const EVIDENCE = process.env.ACT1_EVIDENCE_DIR
  ? path.resolve(ROOT, process.env.ACT1_EVIDENCE_DIR)
  : path.join(
    ROOT,
    'design/review/overworld-art-blueprint/act-by-act/act1/runtime-v2/streamed-port-g2/evidence',
  );
const URL = process.argv[2]
  || 'http://127.0.0.1:4174/design/review/overworld-art-blueprint/act-by-act/act1/runtime-v2/';

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
    return {
      worldViewWidth: Number(document.body.dataset.worldViewWidth),
      phoneFrame: document.body.dataset.phoneFrame,
      heroSheet: document.body.dataset.heroSheet,
      heroAsset: runtime.heroSheet.currentSrc.split('/').slice(-2).join('/'),
      movementSpeed: runtime.pathConstraints.movementSpeed,
      actorFootRadius: runtime.pathConstraints.actorFootRadius,
      position: [Number(status.dataset.x), Number(status.dataset.y)],
      facing: status.dataset.facing,
      commits: Number(status.dataset.commits),
      edgeContacts: Number(status.dataset.edgeContacts),
      endpointVisits: Number(status.dataset.endpointVisits),
      stream: { ...runtime.streamStats },
      streamConfig: { ...runtime.streamConfig },
      imageRequests: performance.getEntriesByType('resource')
        .filter(entry => /\/(chunks|hero-g[23]|port-hires|port-pixel-source)\//.test(entry.name)).length,
    };
  });
}

(async () => {
  fs.mkdirSync(EVIDENCE, { recursive: true });
  const browser = await chromium.launch({ headless: true, channel: 'chrome' });
  const context = await browser.newContext({
    viewport: { width: 852, height: 1846 },
    deviceScaleFactor: 1,
    recordVideo: { dir: EVIDENCE, size: { width: 852, height: 1846 } },
  });
  const page = await context.newPage();
  const errors = pageErrors(page);
  const video = page.video();

  await page.goto(`${URL}?heroDemo`, { waitUntil: 'networkidle', timeout: 30_000 });
  await page.waitForFunction(() => document.body.dataset.ready === 'true');
  await page.waitForTimeout(400);
  const start = await snapshot(page);
  await page.screenshot({ path: path.join(EVIDENCE, 'streamed-port-start.jpg'), type: 'jpeg', quality: 96 });

  const facings = new Set([start.facing]);
  const deadline = Date.now() + 22_000;
  let end = start;
  while (Date.now() < deadline && end.endpointVisits < 1) {
    await page.waitForTimeout(200);
    end = await snapshot(page);
    facings.add(end.facing);
  }
  await page.screenshot({ path: path.join(EVIDENCE, 'streamed-reef-end.jpg'), type: 'jpeg', quality: 96 });
  await page.close();
  await video.saveAs(path.join(EVIDENCE, 'streamed-port-to-reef.webm'));
  await context.close();

  const collisionPage = await browser.newPage({ viewport: { width: 852, height: 1846 } });
  const collisionErrors = pageErrors(collisionPage);
  await collisionPage.goto(`${URL}?edgeDemo=west&pathDebug`, { waitUntil: 'networkidle', timeout: 30_000 });
  await collisionPage.waitForFunction(() => document.body.dataset.ready === 'true');
  await collisionPage.waitForFunction(
    () => Number(document.querySelector('#status').dataset.edgeContacts) >= 12,
    { timeout: 5_000 },
  );
  const collision = await snapshot(collisionPage);
  await collisionPage.screenshot({ path: path.join(EVIDENCE, 'streamed-port-collision.jpg'), type: 'jpeg', quality: 96 });
  await collisionPage.close();

  const bootPage = await browser.newPage({ viewport: { width: 852, height: 1846 } });
  const bootErrors = pageErrors(bootPage);
  await bootPage.route(/\/(chunks|port-hires|port-pixel-source)\//, async route => {
    await new Promise(resolve => setTimeout(resolve, 500));
    await route.continue();
  });
  await bootPage.goto(URL, { waitUntil: 'domcontentloaded', timeout: 30_000 });
  await bootPage.waitForSelector('#boot-cover');
  await bootPage.waitForTimeout(120);
  const bootBefore = await bootPage.locator('#boot-cover').evaluate(element => ({
    opacity: getComputedStyle(element).opacity,
    visibility: getComputedStyle(element).visibility,
  }));
  await bootPage.screenshot({ path: path.join(EVIDENCE, 'streamed-boot-cover-delay.jpg'), type: 'jpeg', quality: 96 });
  await bootPage.waitForFunction(() => document.body.dataset.ready === 'true');
  await bootPage.waitForFunction(
    () => getComputedStyle(document.querySelector('#boot-cover')).visibility === 'hidden',
  );
  const bootAfter = await bootPage.locator('#boot-cover').evaluate(element => ({
    opacity: getComputedStyle(element).opacity,
    visibility: getComputedStyle(element).visibility,
  }));
  await bootPage.close();
  await browser.close();

  const result = {
    start,
    end,
    collision,
    boot: { before: bootBefore, after: bootAfter },
    facings: [...facings],
    errors: [...errors, ...collisionErrors, ...bootErrors],
  };
  fs.writeFileSync(
    path.join(EVIDENCE, 'streamed-port-telemetry.json'),
    `${JSON.stringify(result, null, 2)}\n`,
  );

  assert.deepEqual(result.errors, []);
  assert.equal(start.worldViewWidth, 208);
  assert.equal(start.phoneFrame, '852x1846');
  assert.equal(start.heroSheet, '192x512');
  assert.equal(start.heroAsset, 'hero-g3/hero-act1-female-walk-8x3-64-g3.png');
  assert.equal(start.movementSpeed, 52);
  assert.equal(start.actorFootRadius, 4);
  assert.ok(start.imageRequests < 30, `startup requested ${start.imageRequests} images`);
  assert.ok(end.endpointVisits >= 1, 'hero did not reach the Coastal Reef endpoint');
  assert.ok(end.commits >= 70, `only ${end.commits} semantic commits`);
  assert.ok(end.stream.peakLoadedChunks <= end.streamConfig.maxLoadedChunks);
  assert.ok(end.stream.evictions > 0, 'motion did not exercise the eviction policy');
  assert.ok(end.stream.detailEvictions > 0, 'Port detail region did not evict outside its preload margin');
  assert.equal(end.stream.loadedDetailRegions, 0, 'Port detail region remained loaded off-screen');
  assert.equal(end.stream.visibleAssetMisses, 0, 'visible base-layer asset missed a frame');
  assert.equal(end.stream.visibleDetailMisses, 0, 'visible detail region missed a frame');
  assert.ok(collision.edgeContacts >= 12, 'Port boundary did not block outward movement');
  assert.deepEqual(bootBefore, { opacity: '1', visibility: 'visible' });
  assert.deepEqual(bootAfter, { opacity: '0', visibility: 'hidden' });

  console.log(JSON.stringify(result, null, 2));
})().catch(error => {
  console.error(error.stack || error);
  process.exitCode = 1;
});
