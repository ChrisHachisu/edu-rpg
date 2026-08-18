/* Verify the two build-54 UI changes ON THE PRESERVED ARTIFACT, with REAL input, not by review.
 *
 * The grade wheel has shipped broken five times, every time on the strength of a check that could
 * not see the failure. So this test asserts the thing that actually failed in the field: that the
 * selection SURVIVES -- it drags, then forces repaints, then re-reads. A version that commits into
 * an event the engine never delivers passes a "did the highlight move" check and fails this one.
 *
 * Both input paths are exercised, because they are different code: mouse/pointer, and CDP touch
 * (Input.dispatchTouchEvent), which is what a finger produces.
 */
const { chromium } = require('playwright-core');
const fs = require('fs');
const OUT = process.argv[2] || '/tmp/edu-picker';
const ORIGIN = process.env.EDU_URL || 'http://127.0.0.1:5178';

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const b = await chromium.launch({ headless: true, channel: 'chrome', args: ['--use-angle=swiftshader', '--mute-audio'] });
  const p = await b.newPage({ viewport: { width: 393, height: 852 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true });
  const errs = [];
  p.on('pageerror', e => errs.push('PE ' + e.message));

  await p.goto(ORIGIN + '/', { waitUntil: 'load' });
  await p.waitForFunction(() => !!window.__PHASER_GAME__, { timeout: 20000 });
  await p.evaluate(() => { try { localStorage.removeItem('edu-rpg-save'); } catch (e) {} });
  await p.evaluate(() => { const g = window.__PHASER_GAME__; if (g.scene.isActive('BootScene')) { g.scene.start('TitleScene'); g.scene.stop('BootScene'); } });
  await p.waitForTimeout(1200);
  // New Game -> the create screen
  { const nb = await p.$('#qok-ui [data-act="titleNew"]'); const bb = await nb.boundingBox();
    await p.touchscreen.tap(bb.x + bb.width / 2, bb.y + bb.height / 2); }
  await p.waitForTimeout(900);
  await p.waitForSelector('#qok-gwheel', { timeout: 8000 });
  await p.waitForTimeout(400);

  const R = { errs, wheel: {}, name: {} };
  const state = () => p.evaluate(() => {
    const ts = window.__PHASER_GAME__.scene.getScene('TitleScene');
    const el = document.getElementById('qok-gwheel');
    const sel = document.querySelector('#qok-gwheel .gopt.sel');
    return { di: ts && ts.difficultyIndex, sel: sel && sel.getAttribute('data-i'), selText: sel && sel.textContent,
             offset: el && el.__gwO, wired: !!(el && el.__gwWired) };
  });
  const box = await (await p.$('#qok-gwheel')).boundingBox();
  const cx = box.x + box.width / 2, cy = box.y + box.height / 2;

  R.wheel.wired = (await state()).wired;
  R.wheel.before = await state();

  // ---- PATH 1: pointer (mouse) drag upward = move to a LATER grade -------------------------
  await p.mouse.move(cx, cy);
  await p.mouse.down();
  for (let i = 1; i <= 10; i++) { await p.mouse.move(cx, cy - i * 7); await p.waitForTimeout(12); }
  await p.mouse.up();
  await p.waitForTimeout(700);
  R.wheel.afterPointerDrag = await state();

  // FORCE REPAINTS. This is the step every previous check omitted: the field failure was the value
  // being restored by a rebuild, not the drag itself failing.
  await p.evaluate(() => { const ts = window.__PHASER_GAME__.scene.getScene('TitleScene'); for (let i = 0; i < 8; i++) ts.draw(); });
  await p.waitForTimeout(900);
  R.wheel.afterRepaints = await state();
  await p.screenshot({ path: `${OUT}/wheel-after-pointer-drag.png` });

  // ---- PATH 2: real touch, via CDP ----------------------------------------------------------
  const cdp = await p.context().newCDPSession(p);
  const touch = async (type, y) => cdp.send('Input.dispatchTouchEvent', {
    type, touchPoints: type === 'touchEnd' ? [] : [{ x: cx, y, radiusX: 12, radiusY: 12, force: 1, id: 1 }],
  });
  const beforeTouch = await state();
  await touch('touchStart', cy);
  for (let i = 1; i <= 10; i++) { await touch('touchMove', cy + i * 7); await p.waitForTimeout(12); }
  await touch('touchEnd', cy + 70);
  await p.waitForTimeout(700);
  R.wheel.touchBefore = beforeTouch;
  R.wheel.afterTouchDrag = await state();
  await p.evaluate(() => { const ts = window.__PHASER_GAME__.scene.getScene('TitleScene'); for (let i = 0; i < 8; i++) ts.draw(); });
  await p.waitForTimeout(900);
  R.wheel.afterTouchRepaints = await state();
  await p.screenshot({ path: `${OUT}/wheel-after-touch-drag.png` });

  // ---- NAME GATE ----------------------------------------------------------------------------
  await p.evaluate(() => {
    const ts = window.__PHASER_GAME__.scene.getScene('TitleScene');
    ts.heroName = ''; const i = document.getElementById('qok-name'); if (i) i.value = '';
    const sc = document.querySelector('#qok-ui .screen') || document.scrollingElement;
    if (sc) sc.scrollTop = sc.scrollHeight;              // start at the bottom, as a player would be
  });
  await p.waitForTimeout(300);
  const preScroll = await p.evaluate(() => {
    const pn = document.getElementById('qok-name-panel');
    return { panelTop: pn ? Math.round(pn.getBoundingClientRect().top) : null, vh: window.innerHeight };
  });
  await p.screenshot({ path: `${OUT}/name-before-tap.png` });
  { const sb = await p.$('#qok-ui [data-act="introStart"]'); const bb = await sb.boundingBox();
    await p.touchscreen.tap(bb.x + bb.width / 2, bb.y + bb.height / 2); }
  await p.waitForTimeout(1000);
  R.name = await p.evaluate(() => {
    const err = document.getElementById('qok-name-err');
    const pn = document.getElementById('qok-name-panel');
    const inp = document.getElementById('qok-name');
    const cs = err ? getComputedStyle(err) : null;
    const g = window.__PHASER_GAME__;
    return {
      errText: err ? err.textContent : null,
      errVisible: !!(cs && cs.opacity !== '0' && parseFloat(cs.maxHeight) > 0),
      shook: !!(pn && pn.classList.contains('name-shake')),
      panelTop: pn ? Math.round(pn.getBoundingClientRect().top) : null,
      vh: window.innerHeight,
      focused: document.activeElement === inp,
      stillOnCreate: g.scene.isActive('TitleScene') && !g.scene.isActive('WorldMapScene'),
    };
  });
  R.name.panelTopBefore = preScroll.panelTop;
  await p.screenshot({ path: `${OUT}/name-after-tap.png` });

  // typing clears it
  await p.evaluate(() => { const i = document.getElementById('qok-name'); i.value = 'Mia'; i.dispatchEvent(new Event('input', { bubbles: true })); });
  await p.waitForTimeout(400);
  R.name.clearedAfterTyping = await p.evaluate(() => (document.getElementById('qok-name-err') || {}).textContent === '');

  fs.writeFileSync(`${OUT}/report.json`, JSON.stringify(R, null, 2));
  console.log(JSON.stringify(R, null, 2));
  await b.close();
})();
