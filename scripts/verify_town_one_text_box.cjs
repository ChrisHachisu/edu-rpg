#!/usr/bin/env node
/* verify_town_one_text_box.cjs -- while the PARENT's shipped message box is up, the town's interact()
 * must not open a second dialogue box (2026-09-02 census, defect 1). Loads town.html directly beside
 * Elder Rowan, raises the parent-dialogue flag the adapter posts, calls interact(), and asserts the
 * town box stays closed; then lowers the flag and asserts it opens. Refutes on a build-70 dist.
 *   node scripts/verify_town_one_text_box.cjs [http://127.0.0.1:5179/] */
const { chromium } = require(require('path').join(__dirname, '..', '.eduharness', 'node_modules', 'playwright-core'));
(async () => {
  const base = process.argv[2] || 'http://127.0.0.1:5179/';
  const browser = await chromium.launch({ headless: true, channel: 'chrome' });
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  // stand beside Elder Rowan (firstEntryCell) so nearestNpc() resolves
  await page.goto(base + 'act1-hifi/town.html?town=greenhollow&at=32.19,23.61', { waitUntil: 'load', timeout: 120000 });
  await page.waitForFunction(() => !!window.__ACT1_TOWN__ && document.body.dataset.ready === 'true', { timeout: 120000 });
  await page.waitForTimeout(500);
  const r = await page.evaluate(() => {
    const T = window.__ACT1_TOWN__, box = document.querySelector('#dialogue');
    const npc = T.nearestNpc(); const out = { npc: npc && npc.id };
    document.body.dataset.parentDialogue = 'true'; T.interact(); out.withParentBoxUp = box.dataset.open;
    document.body.dataset.parentDialogue = 'false'; T.interact(); out.withParentBoxDown = box.dataset.open;
    return out; });
  console.log(JSON.stringify(r));
  const ok = r.npc && r.withParentBoxUp !== 'true' && r.withParentBoxDown === 'true';
  console.log(ok ? 'ONE BOX: PASS' : 'ONE BOX: FAIL');
  await browser.close(); process.exit(ok ? 0 : 1);
})().catch((e) => { console.error(e); process.exit(2); });
