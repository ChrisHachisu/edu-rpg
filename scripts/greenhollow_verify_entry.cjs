#!/usr/bin/env node
/* Walk into Greenhollow from the OVERWORLD, the way a player reaches it.
 *
 * WHY THIS IS A SECOND FILE
 *   greenhollow_verify_town.cjs opens town.html directly, which proves the town runtime. It does
 *   NOT prove the town is wired into the game: town.html loads for any `?town=` you name, whether
 *   or not `TOWN_IDS` in adapter.js has heard of it. The one thing that turns a built town into a
 *   reachable one is that Set, and the only honest way to test a Set the overlay reads on every
 *   frame is to make the overworld hand over to it.
 *
 *   So this seeds a save on the grass south of Greenhollow's door, presses the up arrow, and waits
 *   for the OVERLAY IFRAME to come up carrying the greenhollow runtime. It is measured on
 *   `frame.contentWindow.__ACT1_TOWN__`, i.e. the town runtime the player is now looking at, not on
 *   `currentMapId`, which changes the moment the door fires and would report a pass against an
 *   overlay that never loaded.
 *
 * USAGE
 *   python3 -m http.server 5178 --directory dist    # NEVER `serve -s dist`
 *   node scripts/greenhollow_verify_entry.cjs [url] [--out DIR]
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

const args = process.argv.slice(2);
const URL_ = args.find(a => !a.startsWith('--')) || 'http://127.0.0.1:5178/';
const outIdx = args.indexOf('--out');
const OUT = outIdx >= 0 ? args[outIdx + 1]
  : path.join(__dirname, '..', 'design/act1-towns/greenhollow/proof');

/* act1-world-map.js LANDMARKS: greenhollow sits at 69,255 with its one gateway at 69,256. Seed one
   cell further out so the approach is a real walk rather than a spawn on the doorstep. */
const DOOR = { x: 69, y: 255 };
const SEED = { x: 69, y: 257 };

function baseSave(x, y) {
  return {
    version: 4,
    timestamp: Date.now(),
    player: {
      name: 'Hollow', heroColor: 'gray', level: 8, exp: 0, expToNext: 100,
      hp: 70, maxHp: 70, atk: 22, def: 12, spd: 10,
      equipment: { weapon: null, armor: null, shield: null, helmet: null, accessory: null },
      inventory: [{ itemId: 'herb', quantity: 3 }], gold: 200,
      position: { mapId: 'overworld', x, y, floor: 1 },
      storyFlags: { 'intro.done': true },
      activeQuests: [], completedQuests: [], questProgress: {},
      timerEnabled: false, quizDifficulty: '3', locale: 'en', soundEnabled: false,
      masterVolume: 0, kanjiMode: false,
    },
    playtime: 0, quizStats: {},
  };
}

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch({
    headless: true, channel: 'chrome',
    args: ['--use-angle=swiftshader', '--enable-webgl', '--ignore-gpu-blocklist', '--mute-audio'],
  });
  const page = await browser.newPage({ viewport: { width: 960, height: 720 } });
  const errors = [];
  page.on('pageerror', e => errors.push(`pageerror: ${e.message}`));
  page.on('console', m => {
    if (m.type() === 'error' && !m.text().includes('Failed to load resource')) errors.push(`console: ${m.text()}`);
  });

  let failures = 0;
  const report = { url: URL_, seed: SEED, door: DOOR, errors };
  try {
    await page.goto(URL_, { waitUntil: 'load', timeout: 30_000 });
    await page.waitForFunction(() => !!window.__PHASER_GAME__, { timeout: 20_000 });
    await page.evaluate(s => localStorage.setItem('edu-rpg-save', JSON.stringify(s)), baseSave(SEED.x, SEED.y));
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
    /* The baked walk field arrives over XHR; until it lands the override's stepper exits and the
       hero simply never moves. Waiting for the applied plate is the only way to tell that apart
       from a collision failure -- see verify_act1_landmark_blockers.cjs. */
    await page.waitForFunction(() => {
      const w = window.__PHASER_GAME__.scene.getScene('WorldMapScene');
      return w && w.currentMapId === 'overworld' && !!window.__ACT1_WORLD_MAP__
        && window.__ACT1_WORLD_MAP__.state.appliedMap === w.mapData;
    }, { timeout: 20_000 });
    await page.waitForTimeout(1200);

    /* transitionCooldown guards re-entry, not the property under test, and a full one takes nine
       seconds of pushing to drain -- longer than this walk. Zero it deliberately. */
    await page.evaluate(({ x, y }) => {
      const w = window.__PHASER_GAME__.scene.getScene('WorldMapScene');
      w.transitionCooldown = 0; w.showingMessage = false; w.isMoving = false; w.hideMessage?.();
      w.heroTileX = x; w.heroTileY = y;
      if (w.hero) { w.hero.x = x * 48 + 24; w.hero.y = y * 48 + 24; }
      w.updatePosition?.(); w.updateCamera?.();
    }, SEED);
    await page.waitForTimeout(400);
    await page.screenshot({ path: path.join(OUT, '00-overworld-outside-the-door.png') });

    // ---- walk NORTH into the door, with a real arrow key -----------------------------------
    await page.keyboard.down('ArrowUp');
    const deadline = Date.now() + 9000;
    let entered = null;
    while (Date.now() < deadline) {
      await page.waitForTimeout(150);
      // eslint-disable-next-line no-await-in-loop
      entered = await page.evaluate(() => {
        const w = window.__PHASER_GAME__.scene.getScene('WorldMapScene');
        const f = document.querySelector('#act1-hifi-preserved-root iframe');
        const t = f?.contentWindow?.__ACT1_TOWN__ ?? null;
        return {
          mapId: w.currentMapId,
          overlayReady: document.querySelector('#act1-hifi-preserved-root')?.dataset.ready ?? null,
          frameSrc: f?.getAttribute('src') ?? null,
          townId: t?.town?.id ?? null,
          cell: t ? { x: t.position().x / t.town.worldPxPerCell, y: t.position().y / t.town.worldPxPerCell } : null,
          npcs: t ? t.npcs.map(n => n.id) : null,
        };
      });
      if (entered.townId === 'greenhollow' && entered.overlayReady === 'true') break;
    }
    await page.keyboard.up('ArrowUp');
    await page.waitForTimeout(900);

    const final = await page.evaluate(() => {
      const w = window.__PHASER_GAME__.scene.getScene('WorldMapScene');
      const f = document.querySelector('#act1-hifi-preserved-root iframe');
      const t = f?.contentWindow?.__ACT1_TOWN__ ?? null;
      return {
        mapId: w.currentMapId,
        overlayReady: document.querySelector('#act1-hifi-preserved-root')?.dataset.ready ?? null,
        hidden: document.querySelector('#act1-hifi-preserved-root')?.hidden ?? null,
        townId: t?.town?.id ?? null,
        npcs: t ? t.npcs.map(n => n.id) : null,
        cell: t ? { x: t.position().x / t.town.worldPxPerCell, y: t.position().y / t.town.worldPxPerCell } : null,
        heroSheet: f?.contentDocument?.body?.dataset?.heroSheet ?? null,
      };
    });
    report.entry = final;
    console.log(`\nENTRY  overworld mapId=${final.mapId}  overlay ready=${final.overlayReady}`
      + `  town runtime=${final.townId}  at cell ${final.cell ? `${final.cell.x.toFixed(1)},${final.cell.y.toFixed(1)}` : '-'}`);
    console.log(`       npcs loaded: ${final.npcs ? final.npcs.join(', ') : '(none)'}`);
    if (final.mapId !== 'greenhollow') { failures += 1; console.log('  FAIL  the door never took her to greenhollow'); }
    if (final.townId !== 'greenhollow') { failures += 1; console.log('  FAIL  the hi-fi town overlay never loaded greenhollow (TOWN_IDS?)'); }
    if (final.overlayReady !== 'true') { failures += 1; console.log('  FAIL  the overlay never reported ready'); }
    if (!final.npcs || final.npcs.length !== 6) { failures += 1; console.log(`  FAIL  expected 6 NPCs, got ${final.npcs?.length ?? 0}`); }
    await page.waitForTimeout(600);
    await page.screenshot({ path: path.join(OUT, '05-arrived-inside-greenhollow.png') });
  } finally {
    fs.writeFileSync(path.join(OUT, 'entry-walk.json'), `${JSON.stringify(report, null, 2)}\n`);
    await browser.close();
  }

  if (errors.length) { console.log(`\npage errors:\n  ${errors.join('\n  ')}`); failures += errors.length; }
  console.log(failures === 0
    ? `\nGREENHOLLOW ENTRY VERIFY PASS: walked in from the overworld door and the town overlay took over (${OUT})`
    : `\nGREENHOLLOW ENTRY VERIFY FAIL: ${failures} problem(s) (${OUT})`);
  process.exit(failures === 0 ? 0 : 1);
})();
