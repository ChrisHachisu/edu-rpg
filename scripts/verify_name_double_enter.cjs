#!/usr/bin/env node
/* Reproduce -- and then refute -- "the double enter required to enter the name".
 *
 * Owner, build 54: the create screen still needs TWO presses to commit a name. It was reported on
 * build 43 as "the player needs to tap check twice to commit the name", fixed by measuring a tap as
 * FINGER TRAVEL rather than element identity, and it is back.
 *
 * The failure is entirely about FOCUS and REFLOW, so it can only be seen with a real soft keyboard
 * and a real finger. This drives CDP touch on a phone-sized viewport, and after every step it reads
 * back the one fact that matters: WHO HOLDS FOCUS. A check that only asks "did the game start" would
 * pass on the second tap and never see the first one being eaten.
 *
 * Three sequences, because the owner named two ways in and they are different code paths:
 *   A  type the name, press Enter, then tap Start ONCE.
 *   B  type the name, tap OUTSIDE the field (tap-out), then tap Start ONCE.
 *   C  tap Start with the field still focused and never dismissed.
 * All three must commit on ONE press.
 */
const fs = require('node:fs');
const path = require('node:path');

let chromium;
const HARNESS = [
  'playwright-core',
  '../.eduharness/node_modules/playwright-core',
  path.join(process.env.HOME || '', 'Documents/claudecode/edu-rpg/.eduharness/node_modules/playwright-core'),
];
for (const p of HARNESS) { try { ({ chromium } = require(p)); break; } catch (_) { /* next */ } }
if (!chromium) throw new Error('no playwright-core: install the .eduharness harness');

const ORIGIN = process.argv[2] || process.env.EDU_URL || 'http://127.0.0.1:5174';
const OUT = process.argv[3] || '/tmp/edu-name';

async function freshCreateScreen(p) {
  await p.goto(ORIGIN + '/', { waitUntil: 'load' });
  await p.waitForFunction(() => !!window.__PHASER_GAME__, { timeout: 20000 });
  await p.evaluate(() => { try { localStorage.removeItem('edu-rpg-save'); } catch (e) {} });
  await p.evaluate(() => { const g = window.__PHASER_GAME__; if (g.scene.isActive('BootScene')) { g.scene.start('TitleScene'); g.scene.stop('BootScene'); } });
  await p.waitForTimeout(1200);
  const nb = await p.$('#qok-ui [data-act="titleNew"]');
  const bb = await nb.boundingBox();
  await p.touchscreen.tap(bb.x + bb.width / 2, bb.y + bb.height / 2);
  await p.waitForSelector('#qok-name', { timeout: 8000 });
  await p.waitForTimeout(600);
}

/* Press Start with a REBUILD landing between touchStart and touchEnd.
   This is the field failure in a form headless Chrome can actually produce. On iOS the first tap
   blurs the input, the soft keyboard collapses, the visual viewport grows and the intro panel is
   re-laid out mid-press; here the same thing is provoked by changing a term of the intro signature
   (the hero variant) between down and up, which is what makes renderIntro rewrite stage.innerHTML.
   Either way `downEl` is detached by the time pointerup arrives, and a router that requires it to
   still be connected drops the press. */
async function tapWithRebuild(p, sel) {
  const el = await p.$(sel);
  const bb = await el.boundingBox();
  const x = bb.x + bb.width / 2, y = bb.y + bb.height / 2;
  const cdp = await p.context().newCDPSession(p);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y, radiusX: 8, radiusY: 8, force: 1, id: 1 }] });
  await p.evaluate(() => {
    const cur = localStorage.getItem('edu-rpg-hero-variant');
    localStorage.setItem('edu-rpg-hero-variant', cur === 'b' ? 'a' : 'b');
  });
  await p.waitForTimeout(220);                      // let the 50ms poll rebuild the panel
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
}

/* WHO HOLDS FOCUS. There are TWO inputs on this screen -- ours (`#qok-name`) and an anonymous one
   the frozen TitleScene creates and focuses itself -- and telling them apart is the whole diagnosis:
   "the field re-takes focus" means something refocused an input after the player dismissed it. */
const focusState = (p) => p.evaluate(() => {
  const a = document.activeElement;
  const ts = window.__PHASER_GAME__.scene.getScene('TitleScene');
  return {
    tag: a ? a.tagName : null,
    id: a ? (a.id || '(anonymous)') : null,
    ours: !!(a && a.id === 'qok-name'),
    inputs: document.querySelectorAll('input').length,
    createRow: ts && ts.createRow,
    heroName: ts && ts.heroName,
    mode: ts && ts.mode,
    started: window.__PHASER_GAME__.scene.isActive('WorldMapScene'),
  };
});

async function tapEl(p, sel) {
  const el = await p.$(sel);
  if (!el) throw new Error('no element ' + sel);
  const bb = await el.boundingBox();
  await p.touchscreen.tap(bb.x + bb.width / 2, bb.y + bb.height / 2);
}

async function typeName(p, name) {
  await tapEl(p, '#qok-name');
  await p.waitForTimeout(250);
  await p.keyboard.type(name, { delay: 40 });
  await p.waitForTimeout(200);
}

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const b = await chromium.launch({ headless: true, channel: 'chrome', args: ['--use-angle=swiftshader', '--mute-audio'] });
  const p = await b.newPage({ viewport: { width: 393, height: 852 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true });
  const errs = [];
  p.on('pageerror', (e) => errs.push('PE ' + e.message));

  const R = {};
  let failures = 0;

  for (const seq of ['enter', 'tapout', 'direct', 'rebuild']) {
    await freshCreateScreen(p);
    await typeName(p, 'Mia');
    const afterType = await focusState(p);

    if (seq === 'enter') {
      await p.keyboard.press('Enter');
      await p.waitForTimeout(500);          // past nameErrorEffects' own 220ms refocus
    } else if (seq === 'tapout') {
      // Tap dead space at the top of the panel -- not a control, just "somewhere else".
      await p.touchscreen.tap(200, 120);
      await p.waitForTimeout(500);
    }
    const afterDismiss = await focusState(p);

    // ONE press of Start. If the first press is eaten, this is where it shows.
    if (seq === 'rebuild') await tapWithRebuild(p, '#qok-ui [data-act="introStart"]');
    else await tapEl(p, '#qok-ui [data-act="introStart"]');
    await p.waitForTimeout(1400);
    const afterOne = await focusState(p);
    await p.screenshot({ path: `${OUT}/name-${seq}-after-one-press.png` });

    // and a second, only to prove whether the FIRST was the one that was lost.
    let afterTwo = afterOne;
    if (!afterOne.started) {
      const btn = await p.$('#qok-ui [data-act="introStart"]');
      if (btn) { const bb = await btn.boundingBox(); await p.touchscreen.tap(bb.x + bb.width / 2, bb.y + bb.height / 2); }
      await p.waitForTimeout(1400);
      afterTwo = await focusState(p);
    }

    R[seq] = { afterType, afterDismiss, afterOne, afterTwo };
    // Enter must RELEASE the field. Leaving focus on it is what keeps the iOS keyboard up, and the
    // keyboard is what eats the next press -- so "Enter did nothing visible" IS the double press.
    const enterReleased = seq !== 'enter' || !afterDismiss.ours;
    if (!enterReleased) { failures++; console.log('  enter  : FAIL -- Enter left focus on the name field; the keyboard never drops'); }
    const ok = afterOne.started;
    if (!ok) failures++;
    console.log(`  ${seq.padEnd(7)}: name="${afterType.heroName}" | after dismiss focus=${afterDismiss.id} (ours=${afterDismiss.ours}) ` +
                `| ONE press started=${afterOne.started}` + (ok ? '' : `  <-- DOUBLE PRESS (second press started=${afterTwo.started})`));
  }

  fs.writeFileSync(path.join(OUT, 'result.json'), JSON.stringify({ R, errs }, null, 2));
  await b.close();
  if (errs.length) { console.log('  PAGE ERRORS:', errs.slice(0, 5).join(' | ')); }
  console.log(failures ? `NAME COMMIT FAILURE (${failures}/4 sequences need two presses)` : 'NAME COMMIT PASS: all four sequences commit on ONE press');
  process.exit(failures ? 1 : 0);
})();
