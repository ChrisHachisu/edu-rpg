#!/usr/bin/env node
/* Exact-phone taste gate for the current, 896px, and 912px Port sources. */

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
const EVIDENCE = path.join(RUNTIME, 'port-pixel-source/phone-evidence');
const URL = process.argv[2]
  || 'http://127.0.0.1:4174/design/review/overworld-art-blueprint/act-by-act/act1/runtime-v2/';
const manifest = JSON.parse(fs.readFileSync(path.join(RUNTIME, 'manifest.json'), 'utf8'));

const variants = [
  {
    id: 'current-2x-control',
    base: 'port-hires/port-sapphire-hires-2x-v1.png',
    water: null,
    occlusion: null,
    pixelScale: 2,
  },
  {
    id: 'authored-896',
    base: 'port-pixel-source/port-sapphire-lattice-896-runtime-v1.png',
    water: 'port-pixel-source/port-sapphire-lattice-896-water-runtime-v1.png',
    occlusion: 'port-pixel-source/port-sapphire-lattice-896-occlusion-runtime-v1.png',
    featherWorld: 24,
    pixelScale: 896 / 512,
  },
  {
    id: 'authored-912',
    base: 'port-pixel-source/port-sapphire-lattice-912-runtime-v1.png',
    water: 'port-pixel-source/port-sapphire-lattice-912-water-runtime-v1.png',
    occlusion: 'port-pixel-source/port-sapphire-lattice-912-occlusion-runtime-v1.png',
    featherWorld: 24,
    pixelScale: 912 / 512,
  },
];

async function capture(browser, variant) {
  const context = await browser.newContext({
    viewport: { width: 852, height: 1846 },
    deviceScaleFactor: 1,
  });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(`pageerror: ${error.message}`));
  page.on('console', message => {
    if (message.type() === 'error') errors.push(`console: ${message.text()}`);
  });
  await page.route('**/manifest.json', route => {
    const reviewManifest = structuredClone(manifest);
    assert.equal(reviewManifest.detailRegions.length, 1);
    reviewManifest.detailRegions[0] = {
      ...reviewManifest.detailRegions[0],
      id: variant.id,
      base: variant.base,
      water: variant.water,
      occlusion: variant.occlusion,
      featherWorld: variant.featherWorld || 0,
      pixelScale: variant.pixelScale,
    };
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: `${JSON.stringify(reviewManifest)}\n`,
    });
  });
  await page.goto(URL, { waitUntil: 'networkidle', timeout: 30_000 });
  await page.waitForFunction(() => document.body.dataset.ready === 'true');
  await page.waitForTimeout(500);
  const state = await page.evaluate(() => ({
    width: innerWidth,
    height: innerHeight,
    worldViewWidth: Number(document.body.dataset.worldViewWidth),
    phoneFrame: document.body.dataset.phoneFrame,
    heroSheet: document.body.dataset.heroSheet,
    heroAsset: window.__ACT1_HIFI_G1__.heroSheet.currentSrc.split('/').slice(-2).join('/'),
    movementSpeed: window.__ACT1_HIFI_G1__.pathConstraints.movementSpeed,
    visibleDetailMisses: window.__ACT1_HIFI_G1__.streamStats.visibleDetailMisses,
  }));
  await page.screenshot({
    path: path.join(EVIDENCE, `${variant.id}-852x1846.png`),
  });
  await context.close();

  assert.deepEqual(errors, []);
  assert.deepEqual([state.width, state.height], [852, 1846]);
  assert.equal(state.worldViewWidth, 208);
  assert.equal(state.phoneFrame, '852x1846');
  assert.equal(state.heroSheet, '192x512');
  assert.equal(state.heroAsset, 'hero-g3/hero-act1-female-walk-8x3-64-g3.png');
  assert.equal(state.movementSpeed, 52);
  assert.equal(state.visibleDetailMisses, 0);
  return { ...variant, state };
}

(async () => {
  fs.mkdirSync(EVIDENCE, { recursive: true });
  for (const variant of variants) {
    for (const asset of [variant.base, variant.water, variant.occlusion].filter(Boolean)) {
      assert.ok(fs.existsSync(path.join(RUNTIME, asset)), asset);
    }
  }
  const browser = await chromium.launch({ headless: true, channel: 'chrome' });
  const results = [];
  for (const variant of variants) results.push(await capture(browser, variant));
  await browser.close();
  fs.writeFileSync(
    path.join(EVIDENCE, 'pixel-source-phone-telemetry.json'),
    `${JSON.stringify(results, null, 2)}\n`,
  );
  console.log(JSON.stringify(results, null, 2));
})().catch(error => {
  console.error(error.stack || error);
  process.exitCode = 1;
});
