#!/usr/bin/env node
/* The owner's town feedback items, verified against the SHIPPING dist payload.
 *
 * WHY A SCRIPT RATHER THAN A LOOK
 *   Item 1 is a state-lifetime bug: the opening played once per install and never again, which is
 *   invisible to any check that starts from a clean slate. The only honest test is to put the
 *   OWNER'S device state on the page -- a stale `edu-rpg-town-first-greenhollow` key left by build
 *   60/61 -- and start a fresh playthrough on top of it. That is case B below and it is the one
 *   that matters.
 *
 * WHAT IT DRIVES
 *   The real index.html -> adapter.js -> town.html chain out of dist/, i.e. the same bytes the iOS
 *   payload carries (asserted by scripts/sync-ios.sh). It walks the hero north through greenhollow's
 *   overworld door with a real arrow key, exactly as greenhollow_verify_entry.cjs does, rather than
 *   loading town.html directly -- opening the town page by hand would bypass adapter.js, which is
 *   the half of item 1 that actually changed.
 *
 * USAGE
 *   node scripts/verify_town_owner_items.cjs [url] [--out DIR]
 */
const fs = require('node:fs');
const path = require('node:path');

let chromium;
for (const p of ['playwright-core', '../.eduharness/node_modules/playwright-core',
                 path.join(__dirname, '..', '.eduharness/node_modules/playwright-core')]) {
  try { ({ chromium } = require(p)); break; } catch (_) { /* next */ }
}
if (!chromium) throw new Error('no playwright-core: install the .eduharness harness');

const args = process.argv.slice(2);
const URL_ = args.find(a => !a.startsWith('--')) || 'http://127.0.0.1:5174/';
const oi = args.indexOf('--out');
const OUT = oi >= 0 ? args[oi + 1] : path.join(__dirname, '..', 'design/act1-towns/greenhollow/proof-owner-items');

const SEED = { x: 69, y: 257 };            // one cell outside greenhollow's overworld door (69,256)
const TOWN = JSON.parse(fs.readFileSync(
  path.join(__dirname, '..', 'public/act1-hifi/town/greenhollow-town.json'), 'utf8'));
const FIRST = TOWN.firstEntryCell;         // [32.19, 23.61] -- in front of Elder Rowan
const START = TOWN.startCell;              // [32.5, 52.0]   -- the ARRIVAL cell at the gate
const EXIT = TOWN.exit.cell;               // [32.19, 57.0]  -- the town's MOUTH, a crossing line
const EXIT_SIGN = TOWN.exit.axis === 'north' ? -1 : 1;
const near = (a, b, tol) => Math.abs(a - b) <= tol;

function save(x, y, flags) {
  return { version: 4, timestamp: Date.now(),
    player: { name: 'Hollow', heroColor: 'gray', level: 8, exp: 0, expToNext: 100,
      hp: 70, maxHp: 70, atk: 22, def: 12, spd: 10,
      equipment: { weapon: null, armor: null, shield: null, helmet: null, accessory: null },
      inventory: [{ itemId: 'herb', quantity: 3 }], gold: 200,
      position: { mapId: 'overworld', x, y, floor: 1 },
      storyFlags: { 'intro.done': true, ...flags },
      activeQuests: [], completedQuests: [], questProgress: {},
      timerEnabled: false, quizDifficulty: '3', locale: 'en', soundEnabled: false,
      masterVolume: 0, kanjiMode: false },
    playtime: 0, quizStats: {} };
}

const results = [];
function check(name, ok, detail) {
  results.push({ name, ok, detail });
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  -- ${detail}` : ''}`);
}

async function bootToOverworld(page, storySeed, staleKey) {
  await page.goto(URL_, { waitUntil: 'load', timeout: 30_000 });
  await page.waitForFunction(() => !!window.__PHASER_GAME__, { timeout: 20_000 });
  await page.evaluate(([s, stale]) => {
    localStorage.clear();
    localStorage.setItem('edu-rpg-save', JSON.stringify(s));
    // the build-60/61 leftover that made the opening play exactly once per install
    if (stale) localStorage.setItem('edu-rpg-town-first-greenhollow', '1');
  }, [storySeed, staleKey]);
  await page.reload({ waitUntil: 'load' });
  await page.waitForFunction(() => !!window.__PHASER_GAME__, { timeout: 20_000 });
  await page.evaluate(() => {
    const g = window.__PHASER_GAME__;
    if (g.scene.isActive('BootScene')) { g.scene.start('TitleScene'); g.scene.stop('BootScene'); }
  });
  await page.waitForFunction(() => {
    const g = window.__PHASER_GAME__, t = g && g.scene.getScene('TitleScene');
    return t && g.scene.isActive('TitleScene') && t.menuItems?.length > 0;
  }, { timeout: 15_000 });
  await page.evaluate(() => {
    const t = window.__PHASER_GAME__.scene.getScene('TitleScene');
    const i = t.menuItems.findIndex(m => m.getData?.('action') === 'continue');
    if (i < 0) throw new Error('continue unavailable');
    t.selectedIndex = i; t.confirmTitle();
  });
  await page.waitForFunction(() => window.__PHASER_GAME__.scene.isActive('WorldMapScene'), { timeout: 20_000 });
  await page.waitForFunction(() => {
    const w = window.__PHASER_GAME__.scene.getScene('WorldMapScene');
    return w && w.currentMapId === 'overworld' && !!window.__ACT1_WORLD_MAP__
      && window.__ACT1_WORLD_MAP__.state.appliedMap === w.mapData;
  }, { timeout: 20_000 });
  await page.waitForTimeout(1200);
}

async function walkIn(page) {
  await page.evaluate(({ x, y }) => {
    const w = window.__PHASER_GAME__.scene.getScene('WorldMapScene');
    w.transitionCooldown = 0; w.showingMessage = false; w.isMoving = false; w.hideMessage?.();
    w.heroTileX = x; w.heroTileY = y;
    if (w.hero) { w.hero.x = x * 48 + 24; w.hero.y = y * 48 + 24; }
    w.updatePosition?.(); w.updateCamera?.();
  }, SEED);
  await page.waitForTimeout(400);
  await page.keyboard.down('ArrowUp');
  const deadline = Date.now() + 12_000;
  let seen = null;
  while (Date.now() < deadline) {
    await page.waitForTimeout(150);
    // eslint-disable-next-line no-await-in-loop
    seen = await page.evaluate(() => {
      const f = document.querySelector('#act1-hifi-preserved-root iframe');
      const t = f?.contentWindow?.__ACT1_TOWN__ ?? null;
      return { ready: document.querySelector('#act1-hifi-preserved-root')?.dataset.ready ?? null,
               src: f?.getAttribute('src') ?? null, townId: t?.town?.id ?? null };
    });
    if (seen.townId === 'greenhollow' && seen.ready === 'true') break;
  }
  await page.keyboard.up('ArrowUp');
  await page.waitForTimeout(900);
  return page.evaluate(() => {
    const f = document.querySelector('#act1-hifi-preserved-root iframe');
    const t = f?.contentWindow?.__ACT1_TOWN__;
    const p = t.position(), c = t.town.worldPxPerCell;
    return { src: f.getAttribute('src'), cell: [p.x / c, p.y / c], facing: t.state.facing,
             prompt: f.contentDocument.querySelector('#prompt')?.dataset.show === 'true'
               ? f.contentDocument.querySelector('#prompt').textContent : null,
             flag: window.__GAME_STATE__.player.state.storyFlags['act1.townOpened.greenhollow'] ?? null };
  });
}

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch({ headless: true, channel: 'chrome',
    args: ['--use-angle=swiftshader', '--enable-webgl', '--ignore-gpu-blocklist', '--mute-audio'] });
  const page = await browser.newPage({ viewport: { width: 960, height: 720 } });
  const errors = [];
  page.on('pageerror', e => errors.push(`pageerror: ${e.message}`));
  page.on('console', m => {
    if (m.type() === 'error' && !m.text().includes('Failed to load resource')) errors.push(`console: ${m.text()}`);
  });

  try {
    // ---- ITEM 1a: a playthrough that has never opened greenhollow opens at the elder ---------
    console.log('\nITEM 1a  first entry of a playthrough (no stale key)');
    await bootToOverworld(page, save(SEED.x, SEED.y), false);
    let e = await walkIn(page);
    await page.screenshot({ path: path.join(OUT, '01-first-entry-elder.png') });
    check('adapter passed first=1', /[?&]first=1/.test(e.src), e.src);
    check('opened at firstEntryCell (in front of Elder Rowan)',
      near(e.cell[0], FIRST[0], 0.35) && near(e.cell[1], FIRST[1], 0.35),
      `cell ${e.cell[0].toFixed(2)},${e.cell[1].toFixed(2)} vs ${FIRST}`);
    check('facing the elder', e.facing === TOWN.firstEntryFacing, `facing=${e.facing}`);
    check('the elder greeting prompt is up on the first frame', /Rowan|Elder/i.test(e.prompt || ''), `${e.prompt}`);
    check('the save now carries act1.townOpened.greenhollow', e.flag === true, `flag=${e.flag}`);

    // ---- ITEM 1b: THE REGRESSION. Same, on a device carrying the build-62 leftover ----------
    console.log('\nITEM 1b  the owner\'s device state: stale edu-rpg-town-first-greenhollow present');
    await bootToOverworld(page, save(SEED.x, SEED.y), true);
    e = await walkIn(page);
    await page.screenshot({ path: path.join(OUT, '02-first-entry-elder-with-stale-key.png') });
    check('stale key present on the page', await page.evaluate(
      () => localStorage.getItem('edu-rpg-town-first-greenhollow') === '1'), 'the build-62 leftover');
    check('STILL opens at firstEntryCell despite the stale key',
      near(e.cell[0], FIRST[0], 0.35) && near(e.cell[1], FIRST[1], 0.35),
      `cell ${e.cell[0].toFixed(2)},${e.cell[1].toFixed(2)} vs ${FIRST}`);

    // ---- ITEM 1c: a playthrough that HAS opened it arrives at the gate, not the elder -------
    console.log('\nITEM 1c  re-entry of the same playthrough uses the ARRIVAL cell');
    await bootToOverworld(page, save(SEED.x, SEED.y, { 'act1.townOpened.greenhollow': true }), false);
    e = await walkIn(page);
    await page.screenshot({ path: path.join(OUT, '03-re-entry-gate.png') });
    check('adapter did NOT pass first=1', !/[?&]first=1/.test(e.src), e.src);
    check('arrived at startCell (the gate)',
      near(e.cell[0], START[0], 0.35) && near(e.cell[1], START[1], 0.35),
      `cell ${e.cell[0].toFixed(2)},${e.cell[1].toFixed(2)} vs ${START}`);

    // ---- ITEM 3: the exit is at the map edge, and arrival armed it without firing -----------
    console.log('\nITEM 3  the exit sits on the map edge');
    let ex = await page.evaluate(() => {
      const t = document.querySelector('#act1-hifi-preserved-root iframe').contentWindow.__ACT1_TOWN__;
      return { exit: t.town.exit.cell, cells: t.town.cells, state: t.exitState() };
    });
    check('the exit line sits at the town mouth, not out on the empty apron',
      ex.exit[1] === EXIT[1] && EXIT[1] < ex.cells - 4,
      `exit ${ex.exit} on a ${ex.cells}-cell map (the apron below it is ${(ex.cells - EXIT[1]).toFixed(1)} cells)`);
    check('arrival ARMED the exit without firing it', ex.state.armed && !ex.state.exiting,
      JSON.stringify(ex.state));

    // walk south, sampling: it must NOT fire at the old gate line (y 55.5) and MUST fire at the edge
    const frameSel = '#act1-hifi-preserved-root iframe';
    await page.evaluate(sel => document.querySelector(sel).contentWindow.focus(), frameSel);
    // The exit firing TEARS THE OVERLAY DOWN -- adapter.js loads the overworld and __ACT1_TOWN__
    // goes with it -- so `exiting` is a flag this loop usually never gets to read. The deepest y it
    // saw before the town vanished is the honest measure of where the trigger sits, and the parent
    // returning to the overworld is the honest measure that it fired at all.
    // Sampled from OUTSIDE, the last position before teardown is whatever the poll happened to
    // catch -- at 120 ms she covers a whole cell between samples, which reads as "fired early".
    // Track it on the page's own rAF instead, so the recorded y is the one the exit test saw.
    await page.evaluate(sel => {
      window.__deepest = 0; window.__firedAt = null;
      (function tick() {
        const t = document.querySelector(sel)?.contentWindow?.__ACT1_TOWN__;
        if (!t) return;                                   // overlay torn down: the exit fired
        const p = t.position(), c = t.town.worldPxPerCell;
        window.__deepest = Math.max(window.__deepest, p.y / c);
        if (t.exitState().exiting && window.__firedAt === null) window.__firedAt = p.y / c;
        requestAnimationFrame(tick);
      })();
    }, frameSel);
    await page.keyboard.down('ArrowDown');
    let gone = false;
    const dl = Date.now() + 25_000;
    while (Date.now() < dl) {
      await page.waitForTimeout(120);
      // eslint-disable-next-line no-await-in-loop
      if (await page.evaluate(sel => !document.querySelector(sel)?.contentWindow?.__ACT1_TOWN__, frameSel)) {
        gone = true; break;
      }
    }
    await page.keyboard.up('ArrowDown');
    const { deepest, firedAt } = await page.evaluate(
      () => ({ deepest: window.__deepest, firedAt: window.__firedAt }));
    await page.waitForTimeout(1500);
    const backOut = await page.evaluate(
      () => window.__PHASER_GAME__.scene.getScene('WorldMapScene')?.currentMapId ?? null);
    // The two ways the old symmetric box got this wrong, asserted in both directions.
    check('it did NOT fire early -- the player reached the line before the screen changed',
      firedAt !== null && (firedAt - EXIT[1]) * EXIT_SIGN >= -0.05,
      `fired at y ${firedAt === null ? 'never' : firedAt.toFixed(2)}, line ${EXIT[1]}`);
    check('it fired the MOMENT she touched the line, not cells past it',
      firedAt !== null && (firedAt - EXIT[1]) * EXIT_SIGN <= 0.6,
      `fired ${firedAt === null ? 'never' : ((firedAt - EXIT[1]) * EXIT_SIGN).toFixed(2)} cells past `
      + `the line; the apron beyond runs ${(65 - EXIT[1]).toFixed(1)} cells`);
    check('the exit actually fired and handed back to the overworld', gone && backOut === 'overworld',
      `overlay gone=${gone}, parent map=${backOut}`);

    // ---- ITEMS 2 and 4: the healer clear of the herbs, the well gone and walkable -----------
    console.log('\nITEMS 2 and 4  healer placement and the covered well, in the running town');
    for (const [tag, at] of [['04-healer', '46.9,36.2'], ['05-well-centre', '33.1,33.5'],
                             ['06-sw-woodpile', '32.6,51.6']]) {
      await bootToOverworld(page, save(SEED.x, SEED.y, { 'act1.townOpened.greenhollow': true }), false);
      await walkIn(page);
      await page.evaluate(([sel, a]) => {
        const f = document.querySelector(sel);
        f.src = f.getAttribute('src').replace(/&at=[^&]*/, '') + `&at=${a}`;
      }, [frameSel, at]);
      await page.waitForFunction(sel => document.querySelector(sel)?.contentWindow?.__ACT1_TOWN__,
        frameSel, { timeout: 20_000 });
      await page.waitForTimeout(1200);
      const st = await page.evaluate(sel => {
        const f = document.querySelector(sel);
        const t = f.contentWindow.__ACT1_TOWN__, p = t.position(), c = t.town.worldPxPerCell;
        return { cell: [p.x / c, p.y / c],
                 prompt: f.contentDocument.querySelector('#prompt')?.dataset.show === 'true'
                   ? f.contentDocument.querySelector('#prompt').textContent : null };
      }, frameSel);
      await page.screenshot({ path: path.join(OUT, `${tag}.png`) });
      if (tag === '04-healer') {
        check('the healer is talkable from her south approach band', /Healer/i.test(st.prompt || ''),
          `standing at ${st.cell.map(n => n.toFixed(2))}, prompt ${st.prompt}`);
      } else if (tag === '05-well-centre') {
        check('the hero STANDS where the central well was (no invisible collision)',
          near(st.cell[0], 33.1, 0.6) && near(st.cell[1], 33.5, 0.6),
          `asked for 33.1,33.5 and the runtime placed her at ${st.cell.map(n => n.toFixed(2))}`);
      } else {
        // The owner's own viewpoint for the half-drawn well by the south-west woodpile. It carried
        // no collision, so there is nothing mechanical left to assert -- this capture is the check.
        check('the south-west woodpile view is reachable and renders',
          near(st.cell[0], 32.6, 0.6) && near(st.cell[1], 51.6, 0.6),
          `standing at ${st.cell.map(n => n.toFixed(2))}`);
      }
    }

    // ---- ITEM 5: a shop or a menu must not cost the player her position --------------------
    // The town's position lives in the iframe and nowhere else, so the real assertion is that the
    // IFRAME SURVIVES. A stamp on its window proves it: if the overlay was torn down and re-entered
    // -- which is exactly what used to happen, because a paused WorldMapScene reports isActive()
    // false -- the stamp is gone and she is standing on startCell again.
    console.log('\nITEM 5  opening a shop or a menu keeps the player where she was');
    for (const [kind, open, close] of [
      ['shop', async () => {
        await page.evaluate(sel => document.querySelector(sel).contentWindow.__ACT1_TOWN__.interact(),
          frameSel);
        await page.waitForFunction(
          () => window.__PHASER_GAME__.scene.isActive('ShopScene'), { timeout: 15_000 });
      }, async () => {
        await page.evaluate(() => window.__PHASER_GAME__.scene.getScene('ShopScene').leave());
      }],
      ['menu', async () => {
        await page.evaluate(() => {
          const w = window.__PHASER_GAME__.scene.getScene('WorldMapScene');
          w.scene.launch('MenuScene'); w.scene.pause();
        });
        await page.waitForFunction(
          () => window.__PHASER_GAME__.scene.isPaused('WorldMapScene'), { timeout: 15_000 });
      }, async () => {
        await page.evaluate(() => {
          const m = window.__PHASER_GAME__.scene.getScene('MenuScene');
          m.scene.stop(); m.scene.resume('WorldMapScene');
        });
      }],
    ]) {
      await bootToOverworld(page, save(SEED.x, SEED.y, { 'act1.townOpened.greenhollow': true }), false);
      await walkIn(page);
      // stand her beside the shop counter -- somewhere that is NOT startCell, so a reset shows up
      await page.evaluate(([sel, a]) => {
        const f = document.querySelector(sel);
        f.src = f.getAttribute('src').replace(/&at=[^&]*/, '') + `&at=${a}`;
      }, [frameSel, '16.06,37.0']);
      await page.waitForFunction(sel => document.querySelector(sel)?.contentWindow?.__ACT1_TOWN__,
        frameSel, { timeout: 20_000 });
      await page.waitForTimeout(900);
      const before = await page.evaluate(sel => {
        const f = document.querySelector(sel);
        f.contentWindow.__positionProbe = 'alive';        // dies with the document on any reload
        const t = f.contentWindow.__ACT1_TOWN__, p = t.position(), c = t.town.worldPxPerCell;
        return { cell: [p.x / c, p.y / c], src: f.getAttribute('src') };
      }, frameSel);
      await open();
      await page.waitForTimeout(900);
      await page.screenshot({ path: path.join(OUT, `07-${kind}-open.png`) });
      const during = await page.evaluate(sel => {
        const f = document.querySelector(sel);
        return { townAlive: Boolean(f?.contentWindow?.__ACT1_TOWN__),
                 stamp: f?.contentWindow?.__positionProbe ?? null,
                 src: f?.getAttribute('src') ?? null };
      }, frameSel);
      check(`the town runtime SURVIVES the ${kind} (frame not torn down)`,
        during.townAlive && during.stamp === 'alive' && during.src === before.src,
        `alive=${during.townAlive} stamp=${during.stamp} src ${during.src === before.src ? 'unchanged' : 'RELOADED'}`);
      await close();
      await page.waitForFunction(
        () => window.__PHASER_GAME__.scene.isActive('WorldMapScene'), { timeout: 15_000 });
      await page.waitForTimeout(900);
      const after = await page.evaluate(sel => {
        const f = document.querySelector(sel);
        const t = f?.contentWindow?.__ACT1_TOWN__;
        if (!t) return null;
        const p = t.position(), c = t.town.worldPxPerCell;
        return { cell: [p.x / c, p.y / c], stamp: f.contentWindow.__positionProbe ?? null,
                 hidden: document.querySelector('#act1-hifi-preserved-root').hidden };
      }, frameSel);
      check(`she is in the SAME position after closing the ${kind}`,
        after && near(after.cell[0], before.cell[0], 0.05) && near(after.cell[1], before.cell[1], 0.05),
        after ? `${before.cell.map(n => n.toFixed(2))} -> ${after.cell.map(n => n.toFixed(2))} `
                + `(startCell is ${START}, which is where the bug put her)`
              : 'the town runtime was gone entirely');
      check(`the town is visible again after the ${kind}`, after && after.hidden === false,
        `overlay hidden=${after?.hidden}`);
      await page.screenshot({ path: path.join(OUT, `08-after-${kind}.png`) });
    }

    // ---- ITEM 6: villager names, and closing the box by tapping beside it -------------------
    // Both need the PARENT in the loop. Opening town.html directly cannot reproduce the name bug
    // at all: with nobody answering `act1-town-strings-request` the town falls back to the name in
    // its own JSON and looks correct. The defect only exists when the shipped i18n answers, because
    // it answers `[npc.villager2.name]` -- that key is in src/i18n/locales and NOT in the frozen
    // bundle -- and a bracketed answer used to be taken as a translation.
    console.log('\nITEM 6  villager names are names, and a tap beside the box closes it');
    await bootToOverworld(page, save(SEED.x, SEED.y, { 'act1.townOpened.greenhollow': true }), false);
    await walkIn(page);
    const villager = TOWN.npcs.find(n => n.id === 'villager2');
    await page.evaluate(([sel, a]) => {
      const f = document.querySelector(sel);
      f.src = f.getAttribute('src').replace(/&at=[^&]*/, '') + `&at=${a}`;
    }, [frameSel, `${villager.cell[0]},${(villager.cell[1] + 1.4).toFixed(2)}`]);
    await page.waitForFunction(sel => document.querySelector(sel)?.contentWindow?.__ACT1_TOWN__,
      frameSel, { timeout: 20_000 });
    await page.waitForTimeout(1400);              // let the bulk strings round trip land
    await page.evaluate(sel => document.querySelector(sel).contentWindow.__ACT1_TOWN__.interact(),
      frameSel);
    await page.waitForTimeout(500);
    const box = await page.evaluate(sel => {
      const doc = document.querySelector(sel).contentDocument;
      const d = doc.querySelector('#dialogue'), r = d.getBoundingClientRect();
      return { open: d.dataset.open, name: d.querySelector('b').textContent,
               rect: { x: r.x, y: r.y, w: r.width, h: r.height } };
    }, frameSel);
    check('the dialogue opened on the villager', box.open === 'true', `open=${box.open}`);
    check('her name is a NAME, not a raw i18n key',
      !/^\[.*\]$/.test(box.name) && box.name === (villager.name || ''),
      `showed ${JSON.stringify(box.name)}, town JSON says ${JSON.stringify(villager.name)}`);
    await page.screenshot({ path: path.join(OUT, '09-villager-dialogue.png') });
    // tap well clear of the box -- the middle of the map, which is where a thumb actually lands
    await page.mouse.click(480, 240);
    await page.waitForTimeout(400);
    const afterTap = await page.evaluate(sel => {
      const doc = document.querySelector(sel).contentDocument;
      return doc.querySelector('#dialogue').dataset.open;
    }, frameSel);
    check('tapping BESIDE the box closes it', afterTap === 'false', `open=${afterTap}`);
    // and one tap must not close-then-reopen: the box handler used to run after the closer
    await page.evaluate(sel => document.querySelector(sel).contentWindow.__ACT1_TOWN__.interact(),
      frameSel);
    await page.waitForTimeout(300);
    const r2 = await page.evaluate(sel => {
      const d = document.querySelector(sel).contentDocument.querySelector('#dialogue');
      const r = d.getBoundingClientRect();
      return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
    }, frameSel);
    await page.mouse.click(r2.x, r2.y);
    await page.waitForTimeout(400);
    const onBox = await page.evaluate(sel =>
      document.querySelector(sel).contentDocument.querySelector('#dialogue').dataset.open, frameSel);
    check('tapping ON the box still closes it, once', onBox === 'false', `open=${onBox}`);
  } finally {
    await browser.close();
  }

  if (errors.length) console.log(`\npage errors:\n  ${errors.join('\n  ')}`);
  const failed = results.filter(r => !r.ok).length + errors.length;
  fs.writeFileSync(path.join(OUT, 'town-owner-items-verify.json'),
    `${JSON.stringify({ url: URL_, results, errors }, null, 2)}\n`);
  console.log(failed === 0
    ? `\nTOWN OWNER ITEM VERIFY PASS: ${results.length} checks, all green (${OUT})`
    : `\nTOWN OWNER ITEM VERIFY FAIL: ${failed} problem(s) (${OUT})`);
  process.exit(failed === 0 ? 0 : 1);
})();
