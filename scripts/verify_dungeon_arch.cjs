#!/usr/bin/env node
/* Walk a seeded save into all four Act 1 dungeon mouths and PROVE the arch behaves.

   WHY IT EXISTS
     The arch has now been "fixed" four times, and every previous fix was signed off on source
     review or on a still frame of the bake. Both are blind to the only two questions that matter,
     because both are about the RUNNING GAME:

       Q1  Can she still stand on the arch?          -> ask the runtime's own collision, not the mask.
       Q2  Is she drawn UNDER the crown or ON TOP?   -> read the pixels where her sprite is.

     So this drives the real build: it seeds a save inside each dungeon, teleports the hero onto the
     cells around the mouth, asks `canMove`/the movement path whether the jamb is enterable, and
     screenshots her from above, below and both sides.

   IT ASKS THE RUNTIME, NOT THE ARTEFACT
     `a1mFree` is the authority on where she can be -- the walk mask is only its input, and the two
     have disagreed before (build 44 shipped three dungeons whose masks looked fine and which no
     body could enter). Every claim here is read back out of WorldMapScene after a real move.

   USAGE
     node scripts/verify_dungeon_arch.cjs [url] [--out DIR]
*/
const fs = require('node:fs');
const path = require('node:path');

/* The Playwright install is a repo-level harness, not a runtime dependency, and it lives at the
   MAIN checkout even when this script runs from a worktree -- so try the worktree copy, then the
   shared one. Hardcoding either path breaks in the other place. */
let chromium;
const HARNESS = [
  'playwright-core',
  '../.eduharness/node_modules/playwright-core',
  path.join(process.env.HOME || '', 'Documents/claudecode/edu-rpg/.eduharness/node_modules/playwright-core'),
];
for (const p of HARNESS) { try { ({ chromium } = require(p)); break; } catch (_) { /* next */ } }
if (!chromium) throw new Error('no playwright-core: install the .eduharness harness');

const args = process.argv.slice(2);
const url = args.find((a) => !a.startsWith('--')) || 'http://127.0.0.1:5174/';
const outIdx = args.indexOf('--out');
const OUT = outIdx >= 0 ? args[outIdx + 1] : path.join(__dirname, '..', 'design/act1-dungeons/arch/proof');

const FLOORS = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'dist/act1-dungeon-floors.json'), 'utf8')).floors;
const DUNGEONS = ['coastalReef', 'mistyGrotto', 'sunkenCellar', 'whisperingWoodsCave'];

function baseSave(mapId, x, y) {
  return {
    version: 4, timestamp: Date.now(),
    player: {
      name: 'Arch', heroColor: 'gray', level: 12, exp: 0, expToNext: 100,
      hp: 90, maxHp: 90, atk: 30, def: 15, spd: 10,
      equipment: { weapon: null, armor: null, shield: null, helmet: null, accessory: null },
      inventory: [{ itemId: 'herb', quantity: 3 }], gold: 500,
      position: { mapId, x, y, floor: 1 },
      storyFlags: {}, activeQuests: [], completedQuests: [], questProgress: {},
      timerEnabled: false, quizDifficulty: '3', locale: 'en', soundEnabled: false,
      masterVolume: 0, kanjiMode: false,
    },
    playtime: 0, quizStats: {},
  };
}

async function enterSavedGame(page, save) {
  await page.evaluate((s) => localStorage.setItem('edu-rpg-save', JSON.stringify(s)), save);
  await page.reload({ waitUntil: 'load' });
  await page.waitForFunction(() => !!window.__PHASER_GAME__, { timeout: 20_000 });
  await page.evaluate(() => {
    const game = window.__PHASER_GAME__;
    if (game.scene.isActive('BootScene')) { game.scene.start('TitleScene'); game.scene.stop('BootScene'); }
  });
  await page.waitForFunction(() => {
    const g = window.__PHASER_GAME__, t = g && g.scene.getScene('TitleScene');
    return t && g.scene.isActive('TitleScene') && t.menuItems?.length > 0;
  }, { timeout: 10_000 });
  await page.evaluate(() => {
    const t = window.__PHASER_GAME__.scene.getScene('TitleScene');
    const i = t.menuItems.findIndex((m) => m.getData?.('action') === 'continue');
    if (i < 0) throw new Error('continue unavailable');
    t.selectedIndex = i; t.confirmTitle();
  });
  await page.waitForFunction(() => window.__PHASER_GAME__.scene.isActive('WorldMapScene'), { timeout: 12_000 });
  await page.waitForTimeout(900);
}

/* Where her sprite lands ON SCREEN. The camera clamps on these small floors, so she is NOT at the
   centre of the frame and a centre crop photographs empty floor -- which is exactly how a proof
   sheet can look fine and show nothing. Ask the camera. */
async function heroScreen(page) {
  return page.evaluate(() => {
    const g = window.__PHASER_GAME__, w = g.scene.getScene('WorldMapScene');
    const cam = w.cameras?.main, canvas = g.canvas;
    if (!w.hero || !cam || !canvas) return null;
    // Phaser's camera coords are in GAME pixels; the canvas is letterboxed and CSS-scaled inside
    // the page, so a game-space point has to be mapped through the canvas rect before it means
    // anything to page.screenshot(). Reading only the camera is how the first proof sheet came
    // back showing four photographs of empty floor.
    const r = canvas.getBoundingClientRect();
    const sx = r.width / g.scale.gameSize.width, sy = r.height / g.scale.gameSize.height;
    return {
      x: Math.round(r.left + (w.hero.x - cam.scrollX) * cam.zoom * sx),
      y: Math.round(r.top + (w.hero.y - cam.scrollY) * cam.zoom * sy),
    };
  });
}

/* Put her on a cell WITHOUT walking there: the point is to interrogate cells the collision may
   refuse, and a walk that is correctly refused would never arrive to be photographed. */
async function standAt(page, x, y) {
  return page.evaluate(({ x, y }) => {
    const w = window.__PHASER_GAME__.scene.getScene('WorldMapScene');
    w.showingMessage = false; w.isMoving = false; w.hideMessage?.();
    w.heroTileX = x; w.heroTileY = y;
    const first = w.tileGrid?.[0]?.[0];
    const size = (first && first.displayWidth) || 48;
    if (w.hero) { w.hero.x = x * size + size / 2; w.hero.y = y * size + size / 2; }
    w.updatePosition?.(); w.updateCamera?.();
    return { x: w.heroTileX, y: w.heroTileY, mapId: w.currentMapId, floor: w.currentFloor || 1 };
  }, { x, y });
}

async function canMoveTo(page, x, y) {
  return page.evaluate(({ x, y }) => {
    const w = window.__PHASER_GAME__.scene.getScene('WorldMapScene');
    try { return !!w.canMove(x, y); } catch (e) { return null; }
  }, { x, y });
}

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch({
    headless: true, channel: 'chrome',
    args: ['--use-angle=swiftshader', '--enable-webgl', '--ignore-gpu-blocklist', '--mute-audio'],
  });
  const page = await browser.newPage({ viewport: { width: 960, height: 720 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  page.on('console', (m) => { if (m.type() === 'error' && !m.text().includes('Failed to load resource')) errors.push(`console: ${m.text()}`); });

  let failures = 0;
  const where = {};
  try {
    await page.goto(url, { waitUntil: 'load', timeout: 30_000 });
    await page.waitForFunction(() => !!window.__PHASER_GAME__, { timeout: 20_000 });

    for (const d of DUNGEONS) {
      const fl = FLOORS[`${d}-f1`];
      const mouth = fl.assets.find((a) => a.kind === 'mouth');
      // Seed somewhere safe on the floor, then teleport: seeding directly on the mouth would fire
      // the transition out of the dungeon before a single frame was drawn.
      const stairs = fl.assets.find((a) => a.kind === 'stairsDown');
      await enterSavedGame(page, baseSave(d, stairs.x, stairs.y));

      /* The overlay texture is fetched asynchronously by a1dOverheadTick, so sampling it once,
         immediately, races the network and reports MISSING on whichever floor happens to be slow.
         Wait for it and let the timeout be the failure. */
      const arrived = await page.waitForFunction(() => {
        const g = window.__PHASER_GAME__, w = g.scene.getScene('WorldMapScene');
        return g.textures.exists(`a1dover_${w.currentMapId}-f${w.currentFloor || 1}`);
      }, null, { timeout: 8_000 }).then(() => true).catch(() => false);

      const here = await page.evaluate(() => {
        const w = window.__PHASER_GAME__.scene.getScene('WorldMapScene');
        return { mapId: w.currentMapId, floor: w.currentFloor || 1, overhead: !!window.__PHASER_GAME__.textures.exists(`a1dover_${w.currentMapId}-f${w.currentFloor || 1}`) };
      });
      if (here.mapId !== d) { console.log(`  ${d}: FAILED to load (got ${here.mapId})`); failures++; continue; }

      // Q1 -- the four cells around the mouth, and whether the runtime lets her onto them.
      const sides = [
        ['north', mouth.x, mouth.y - 1],
        ['south', mouth.x, mouth.y + 1],
        ['west', mouth.x - 1, mouth.y],
        ['east', mouth.x + 1, mouth.y],
      ];
      const reach = {};
      for (const [name, x, y] of sides) reach[name] = await canMoveTo(page, x, y);

      // Q2 -- photograph her on every side the runtime admits, plus the approach cell itself.
      const shots = [];
      for (const [name, x, y] of sides) {
        if (!reach[name]) continue;
        await standAt(page, x, y);
        await page.waitForTimeout(450);
        const f = path.join(OUT, `walk-${d}-${name}.png`);
        await page.screenshot({ path: f });
        where[`${d}-${name}`] = await heroScreen(page);
        shots.push(name);
      }
      // and standing IN the mouth cell, which is where the crown must cover her.
      await standAt(page, mouth.x, mouth.y);
      await page.waitForTimeout(450);
      await page.screenshot({ path: path.join(OUT, `walk-${d}-mouth.png`) });
      where[`${d}-mouth`] = await heroScreen(page);

      const ok = arrived && here.overhead;
      if (!ok) failures++;
      console.log(`  ${d}-f1: overhead texture ${here.overhead ? 'LOADED' : 'MISSING'}; ` +
                  `canMove north=${reach.north} south=${reach.south} west=${reach.west} east=${reach.east}; ` +
                  `shots [${shots.join(',')},mouth]`);
    }
  } finally {
    await browser.close();
  }
  fs.writeFileSync(path.join(OUT, 'hero-screen.json'), JSON.stringify(where, null, 2));
  if (errors.length) { console.log('  PAGE ERRORS:'); errors.slice(0, 8).forEach((e) => console.log('   ', e)); failures++; }
  console.log(failures ? `ARCH VERIFY FAILURE (${failures})` : 'ARCH VERIFY PASS');
  process.exit(failures ? 1 : 0);
})();
