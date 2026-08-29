#!/usr/bin/env node
/* Entering a dungeon lands the player ON its mouth, FACING IN. Measured in the running game.
 *
 * WHY THE FACING NEEDS A TEST OF ITS OWN
 *   The position was already right and looked like the whole story. It is not: nothing ever set
 *   `heroDir`, so her facing on arrival was whatever her last step OUTSIDE left behind. That reads
 *   as correct by accident on three of the four mouths -- they are approached from the south, so
 *   walking up into the door leaves her facing up, which is also the way in. coastalReef's mouth
 *   opens WEST, so the same accident leaves her facing whichever way she happened to walk. A test
 *   that enters by walking cannot see this, because walking is what supplies the right answer.
 *
 *   So this does NOT walk in. It seeds the engine's own fixed landing -- LANDMARKS' leftover
 *   (50, 1), which is off the map or solid rock on all four floors -- and lets a1dRescueHero do the
 *   placing, which is exactly what happens on a real entry. Nothing here can leak a facing in.
 *
 * USAGE
 *   node scripts/verify_dungeon_entry.cjs [url] [--out DIR]
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
const URL_ = args.find(a => !a.startsWith('--')) || 'http://127.0.0.1:5178/';
const oi = args.indexOf('--out');
const OUT = oi >= 0 ? args[oi + 1] : path.join(__dirname, '..', 'design/act1-dungeons/arch/proof-entry');

const FLOORS = JSON.parse(fs.readFileSync(
  path.join(__dirname, '..', 'public/act1-dungeon-floors.json'), 'utf8')).floors;
const DUNGEONS = ['sunkenCellar', 'mistyGrotto', 'coastalReef', 'whisperingWoodsCave'];
const DIR_NAME = ['down', 'left', 'right', 'up'];

// dq-tiles.js A1D_BLOCK: '#' is rock. The one open neighbour of the mouth is the way in.
function expected(dungeon) {
  const fl = FLOORS[`${dungeon}-f1`];
  const m = fl.assets.find(a => a.kind === 'mouth');
  const opens = [[0, 1, 0], [-1, 0, 1], [1, 0, 2], [0, -1, 3]].filter(([dx, dy]) => {
    const y = m.y + dy, x = m.x + dx;
    return y >= 0 && y < fl.height && x >= 0 && x < fl.width && fl.rows[y][x] !== '#';
  });
  if (opens.length !== 1) throw new Error(`${dungeon}: mouth has ${opens.length} open neighbours`);
  return { mouth: m, dir: opens[0][2] };
}

function save(mapId) {
  return { version: 4, timestamp: Date.now(),
    player: { name: 'Probe', heroColor: 'gray', level: 12, exp: 0, expToNext: 100,
      hp: 90, maxHp: 90, atk: 30, def: 18, spd: 12,
      equipment: { weapon: null, armor: null, shield: null, helmet: null, accessory: null },
      inventory: [], gold: 200,
      position: { mapId, x: 50, y: 1, floor: 1 },       // the engine's own leftover landing
      storyFlags: { 'intro.done': true },
      activeQuests: [], completedQuests: [], questProgress: {},
      timerEnabled: false, quizDifficulty: '3', locale: 'en', soundEnabled: false,
      masterVolume: 0, kanjiMode: false },
    playtime: 0, quizStats: {} };
}

const results = [];
const check = (name, ok, detail) => {
  results.push({ name, ok, detail });
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  -- ${detail}` : ''}`);
};

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch({ headless: true, channel: 'chrome',
    args: ['--use-angle=swiftshader', '--enable-webgl', '--ignore-gpu-blocklist', '--mute-audio'] });
  const page = await browser.newPage({ viewport: { width: 960, height: 720 } });
  const errors = [];
  page.on('pageerror', e => errors.push(`pageerror: ${e.message}`));
  try {
    for (const d of DUNGEONS) {
      const want = expected(d);
      await page.goto(URL_, { waitUntil: 'load', timeout: 30_000 });
      await page.waitForFunction(() => !!window.__PHASER_GAME__, { timeout: 20_000 });
      await page.evaluate(s => { localStorage.clear(); localStorage.setItem('edu-rpg-save', JSON.stringify(s)); }, save(d));
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
        t.selectedIndex = t.menuItems.findIndex(m => m.getData?.('action') === 'continue');
        t.confirmTitle();
      });
      await page.waitForFunction(() => window.__PHASER_GAME__.scene.isActive('WorldMapScene'), { timeout: 20_000 });
      await page.waitForTimeout(2600);            // let the mask land and the rescue settle
      const got = await page.evaluate(() => {
        const w = window.__PHASER_GAME__.scene.getScene('WorldMapScene');
        return { map: w.currentMapId, floor: w.currentFloor, x: w.heroTileX, y: w.heroTileY,
                 dir: w.heroDir, frame: w.hero?.frame?.name ?? null };
      });
      // AT the entrance, not necessarily ON that exact cell: a mouth's cell CENTRE is a lattice
      // coordinate the art never promised was open, and where it is not, the mover settles her one
      // cell inward. One cell is arriving at the entrance; sixteen -- coastalReef, before this --
      // is arriving somewhere else entirely.
      const dist = Math.abs(got.x - want.mouth.x) + Math.abs(got.y - want.mouth.y);
      check(`${d}: lands at the mouth`, got.map === d && dist <= 1,
        `at (${got.x},${got.y}), mouth (${want.mouth.x},${want.mouth.y}), ${dist} cell(s) away`);
      check(`${d}: faces INTO the dungeon`, got.dir === want.dir,
        `heroDir ${got.dir} (${DIR_NAME[got.dir]}) want ${want.dir} (${DIR_NAME[want.dir]})`);
      check(`${d}: the sprite shows that facing, not the last one`, String(got.frame) === String(want.dir * 3),
        `frame ${got.frame} want ${want.dir * 3}`);
      await page.evaluate(() => {
        const w = window.__PHASER_GAME__.scene.getScene('WorldMapScene');
        w.fogEnabled = false; try { w.updateFogVisibility?.(); } catch (e) {}
      });
      await page.waitForTimeout(600);
      await page.screenshot({ path: path.join(OUT, `entry-${d}.png`) });
    }
  } finally { await browser.close(); }

  if (errors.length) console.log(`\npage errors:\n  ${errors.join('\n  ')}`);
  const failed = results.filter(r => !r.ok).length + errors.length;
  fs.writeFileSync(path.join(OUT, 'entry-verify.json'), `${JSON.stringify({ url: URL_, results, errors }, null, 2)}\n`);
  console.log(failed === 0
    ? `\nDUNGEON ENTRY VERIFY PASS: ${results.length} checks, all green (${OUT})`
    : `\nDUNGEON ENTRY VERIFY FAIL: ${failed} problem(s) (${OUT})`);
  process.exit(failed === 0 ? 0 : 1);
})();
