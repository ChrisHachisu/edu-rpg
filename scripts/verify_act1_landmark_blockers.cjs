#!/usr/bin/env node
/* Walk at every Act 1 landmark from all four sides and PROVE only one of them lets you in.
 *
 * WHY IT EXISTS
 *   Owner, 2026-08-18: "only one entrance for towns and dungeons ... and the edge need to be
 *   blockers so the user cannot walk on top of it." The blockers are stamped into the collision
 *   plate by scripts/act1_landmark_footprints.mjs, and scripts/test_act1_runtime_override.mjs
 *   asserts the property against the generated artefact -- but the artefact is not the game. The
 *   overworld collider is `a1mFree`, the hero moves in CONTINUOUS PIXELS rather than tile steps,
 *   and a door fires from a REFUSED move (`a1mDoor`) rather than from standing anywhere. Those
 *   three facts together are why build 44 shipped three dungeons whose masks read fine and which
 *   no body could enter. Source review cannot see any of it.
 *
 *   So this drives the real build. For each landmark and each of north/south/east/west it seeds a
 *   save on open ground out on that side, pushes the movement stick straight at the door through
 *   the game's own input path, and reads back out of WorldMapScene what happened.
 *
 * IT COUNTS DOORS FIRING, NOT MAPS LOADING, and that distinction is the whole reliability of the
 * measurement. The first version scored a side as "entered" when `currentMapId` changed, and
 * reported Coastal Reef, Whispering Woods and Crystal Cave as having NO entrance at all. They have
 * one: the door fires, `performTransition` runs, and the QUEST GATE turns it down -- "The path
 * ahead is blocked... You should speak with someone in town first." That is story progression, not
 * collision, and a collision test that cannot tell them apart reports a false failure on every
 * story-locked destination. So `checkTransition` is wrapped in the page and the door's own firing
 * is what gets counted, with the hero's cell at that moment recorded beside it.
 *
 * IT NEVER JUDGES A CELL FROM `heroTileX/heroTileY`, and that is not fussiness. Those are derived
 * from the sprite CENTRE while collision works from her SOLES, so by the time a door fires her
 * centre has already crossed onto the door cell her feet are not on -- dq-tiles.js says so in as
 * many words, and `a1mDoor` relies on it. The first version of this file read them anyway and
 * reported every landmark as "fired from the door cell, expected the gateway" and two towns as
 * "rested on a blocker" while she was standing on clean grass one cell south with her shoulders
 * drawn over the palisade. Where her feet are is asked of `a1mFree` instead: put her somewhere,
 * let a frame run, and see whether the runtime moves her off it.
 *
 * THREE MEASUREMENTS PER LANDMARK
 *   1. CENSUS  -- place her on each of the four cells around the door and let one frame run. If
 *      `a1mFree` refuses the position, `a1mUnstick` moves her, so a displacement means the cell is
 *      not somewhere a hero with a body can stand. This is the erosion-by-clearance question asked
 *      of the runtime rather than of a mask.
 *   2. WALK    -- push at the door from each side and record whether the door fired.
 *   3. PERCH   -- after each walk, let a frame run with the stick released. If she is moved, she
 *      had come to rest somewhere illegal.
 *
 *   PASS, per landmark:
 *     INV-1  SINGLE ENTRANCE  at most ONE of the four cells round the door is standable, and if
 *                             one is, it is the landmark's own exit cell.
 *     INV-2  REACHABLE        the door still fires from at least one side.
 *     INV-3  NO PERCH         no walk leaves her anywhere the runtime has to rescue her from.
 *
 *   A side whose push still opens the door while its own seat is BLOCKED is not a second entrance:
 *   she slid along the wall to the one gateway and went in there. INV-1 is the entrance count;
 *   the per-side walks are the evidence that the wall held on the way.
 *
 * USAGE
 *   python3 -m http.server <port> --directory dist   # NEVER `serve -s dist`: it rewrites modules
 *   node scripts/verify_act1_landmark_blockers.cjs [url] [--out DIR]
 */
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

/* Playwright is a repo-level harness and lives at the MAIN checkout even when this runs from a
   worktree, so try the worktree copy first and then the shared one. */
let chromium;
const HARNESS = [
  'playwright-core',
  '../.eduharness/node_modules/playwright-core',
  path.join(process.env.HOME || '', 'Documents/claudecode/edu-rpg/.eduharness/node_modules/playwright-core'),
];
for (const p of HARNESS) { try { ({ chromium } = require(p)); break; } catch (_) { /* next */ } }
if (!chromium) throw new Error('no playwright-core: install the .eduharness harness');

const args = process.argv.slice(2);
const url = args.find(a => !a.startsWith('--')) || 'http://127.0.0.1:5174/';
const outIdx = args.indexOf('--out');
const OUT = outIdx >= 0 ? args[outIdx + 1] : path.join(__dirname, '..', 'design/act1-landmark-blockers/proof');

/* The plate, read in NODE rather than out of the page. The obvious version asks the live scene
   `canMove` for a start cell, but that probe has to run before any save is loaded -- at which point
   WorldMapScene is not on the overworld and every side answers "no ground", which is how the first
   run of this file reported eight unreachable landmarks against a build that was fine. Running the
   shipped override against a blank map here is what test_act1_runtime_override.mjs already does
   and needs nobody to be anywhere. */
const OVERWORLD_BLOCKED = new Set([2, 3, 4, 6, 7, 8, 9, 10, 11, 12, 14, 15, 16, 19, 20, 21]);
function loadPlateMap(distRoot) {
  const source = fs.readFileSync(path.join(distRoot, 'act1-world-map.js'), 'utf8');
  const win = { __GAME_STATE__: { player: { state: { storyFlags: {} } } } };
  vm.runInNewContext(source, { window: win, Error, Math, parseInt, Object, JSON });
  const runtime = win.__ACT1_WORLD_MAP__;
  const map = Array.from({ length: 400 }, () => new Array(320).fill(0));
  if (!runtime.ensurePlate({ currentMapId: 'overworld', mapData: map, heroTileX: 69, heroTileY: 257 }, true)) {
    throw new Error('the shipped Act 1 override refused to apply to a blank map');
  }
  return { runtime, map };
}

const SIDES = [['north', 0, -1], ['south', 0, 1], ['east', 1, 0], ['west', -1, 0]];
// The act-connecting gate. The owner's rule exempts it by name and this pass leaves it untouched,
// so it is walked for evidence and reported rather than held to the one-entrance rule.
const GATE_EXEMPT = new Set(['crystalCave']);
const WALK_MS = 2600;

function baseSave(x, y) {
  return {
    version: 4, timestamp: Date.now(),
    player: {
      name: 'Edge', heroColor: 'gray', level: 12, exp: 0, expToNext: 100,
      hp: 90, maxHp: 90, atk: 30, def: 15, spd: 10,
      equipment: { weapon: null, armor: null, shield: null, helmet: null, accessory: null },
      inventory: [{ itemId: 'herb', quantity: 3 }], gold: 500,
      position: { mapId: 'overworld', x, y, floor: 1 },
      storyFlags: { 'boss.giantToad.defeated': true },
      activeQuests: [], completedQuests: [], questProgress: {},
      timerEnabled: false, quizDifficulty: '3', locale: 'en', soundEnabled: false,
      masterVolume: 0, kanjiMode: false,
    },
    playtime: 0, quizStats: {},
  };
}

async function enterSavedGame(page, save) {
  await page.evaluate(s => localStorage.setItem('edu-rpg-save', JSON.stringify(s)), save);
  await page.reload({ waitUntil: 'load' });
  await page.waitForFunction(() => !!window.__PHASER_GAME__, { timeout: 20_000 });
  await page.evaluate(() => {
    const game = window.__PHASER_GAME__;
    if (game.scene.isActive('BootScene')) { game.scene.start('TitleScene'); game.scene.stop('BootScene'); }
  });
  await page.waitForFunction(() => {
    const g = window.__PHASER_GAME__, t = g && g.scene.getScene('TitleScene');
    return t && g.scene.isActive('TitleScene') && t.menuItems?.length > 0;
  }, { timeout: 12_000 });
  await page.evaluate(() => {
    const t = window.__PHASER_GAME__.scene.getScene('TitleScene');
    const i = t.menuItems.findIndex(m => m.getData?.('action') === 'continue');
    if (i < 0) throw new Error('continue unavailable');
    t.selectedIndex = i; t.confirmTitle();
  });
  await page.waitForFunction(() => window.__PHASER_GAME__.scene.isActive('WorldMapScene'), { timeout: 15_000 });
  // The baked walk field arrives over XHR. Until it does `a1mAnyFor` returns nothing, `a1mStep`
  // exits immediately and the BASE engine's tile stepper runs instead -- which reads scene.cursors,
  // not the stick, so the hero simply never moves. Measured: that is what a "she did not move at
  // all" result actually means, and waiting for a real step is the only way to rule it out.
  await page.waitForFunction(() => {
    const w = window.__PHASER_GAME__.scene.getScene('WorldMapScene');
    return w && w.currentMapId === 'overworld' && !!window.__ACT1_WORLD_MAP__
      && window.__ACT1_WORLD_MAP__.state.appliedMap === w.mapData;
  }, { timeout: 15_000 });
  await page.waitForTimeout(1200);
}

/* Record every door the game itself decides to open, and where she was standing when it decided.
   Wrapped rather than inferred: `performTransition` can refuse a fired door on story grounds, and
   the difference between "the collision let her reach it" and "the plot let her through" is the
   difference between a blocker bug and correct behaviour. */
async function armTransitionSpy(page) {
  await page.evaluate(() => {
    const w = window.__PHASER_GAME__.scene.getScene('WorldMapScene');
    window.__DOOR_LOG__ = [];
    if (w.__doorSpy) return;
    const original = w.checkTransition.bind(w);
    w.checkTransition = function spy(x, y) {
      const result = original(x, y);
      if (result && result.targetMap) {
        window.__DOOR_LOG__.push({
          asked: { x, y }, target: result.targetMap,
          heroTile: { x: w.heroTileX, y: w.heroTileY },
          heroPx: { x: Math.round(w.hero?.x ?? 0), y: Math.round(w.hero?.y ?? 0) },
        });
      }
      return result;
    };
    w.__doorSpy = true;
  });
}

async function walkToward(page, dx, dy, ms) {
  await page.evaluate(({ dx, dy }) => { window.__DQ_STICK__ = { x: dx, y: dy, m: 1 }; }, { dx, dy });
  await page.waitForTimeout(ms);
  await page.evaluate(() => { window.__DQ_STICK__ = { x: 0, y: 0, m: 0 }; });
  await page.waitForTimeout(300);
}

async function readOutcome(page) {
  return page.evaluate(() => {
    const w = window.__PHASER_GAME__.scene.getScene('WorldMapScene');
    return {
      mapId: w.currentMapId,
      cell: { x: Math.floor((w.hero?.x ?? 0) / 48), y: Math.floor((w.hero?.y ?? 0) / 48) },
      tile: { x: w.heroTileX, y: w.heroTileY },
      message: !!w.showingMessage,
      cooldown: w.transitionCooldown,
      doors: window.__DOOR_LOG__ || [],
    };
  });
}

/* `transitionCooldown` is the engine's DON'T-BOUNCE-STRAIGHT-BACK-IN guard, and the override's
   wrapper spends one unit of it per checkTransition call. `a1mDoor` is throttled to one ask per
   300 ms, so a cooldown of 30 takes NINE SECONDS of pushing to drain -- against a 2.6 s walk the
   door simply never gets asked, and the run reports "the door never fired" at Greenhollow and
   Coastal Reef while the collision is perfect. Measured: exactly that, and it moved between runs
   depending on how the save happened to load. Zero it deliberately; it guards re-entry, not the
   property under test. */
async function placeHero(page, x, y) {
  return page.evaluate(({ x, y }) => {
    const w = window.__PHASER_GAME__.scene.getScene('WorldMapScene');
    w.showingMessage = false; w.isMoving = false; w.hideMessage?.();
    w.transitionCooldown = 0;
    w.heroTileX = x; w.heroTileY = y;
    if (w.hero) { w.hero.x = x * 48 + 24; w.hero.y = y * 48 + 24; }
    w.updatePosition?.(); w.updateCamera?.();
  }, { x, y });
}

/* Can a hero with a body REST here? Place her and let one frame run: if `a1mFree` refuses the
   position, `a1mUnstick` moves her, so a displacement is the runtime saying no. */
async function census(page, x, y) {
  return page.evaluate(async c => {
    const w = window.__PHASER_GAME__.scene.getScene('WorldMapScene');
    if (w.currentMapId !== 'overworld') return { skipped: true };
    w.showingMessage = false; w.isMoving = false; w.hideMessage?.();
    w.transitionCooldown = 60;                       // do not let the census open a door
    w.hero.x = c.x * 48 + 24; w.hero.y = c.y * 48 + 24;
    w.heroTileX = c.x; w.heroTileY = c.y; w.updatePosition?.(); w.updateCamera?.();
    const bx = w.hero.x, by = w.hero.y;
    await new Promise(r => setTimeout(r, 90));
    const moved = Math.round(Math.hypot(w.hero.x - bx, w.hero.y - by));
    return { canMove: !!w.canMove(c.x, c.y), moved, stands: !!w.canMove(c.x, c.y) && moved <= 2 };
  }, { x, y });
}

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const DIST = path.join(__dirname, '..', 'dist');
  const { runtime: plateRuntime, map: plateMap } = loadPlateMap(DIST);
  const plateWalkable = (x, y) => {
    const row = plateMap[y];
    return !!row && !OVERWORLD_BLOCKED.has(row[x]);
  };

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
  const rows = [];
  try {
    await page.goto(url, { waitUntil: 'load', timeout: 30_000 });
    await page.waitForFunction(() => !!window.__PHASER_GAME__, { timeout: 20_000 });
    const served = await page.evaluate(() => {
      const W = window.__ACT1_WORLD_MAP__;
      return W ? { revision: W.revision, plateSha256: W.plateSha256 } : null;
    });
    if (!served) throw new Error('the page never installed __ACT1_WORLD_MAP__');
    if (served.plateSha256 !== plateRuntime.plateSha256) {
      throw new Error(`the served plate ${served.plateSha256} is not the one in dist `
        + `${plateRuntime.plateSha256} -- stale dist, or another server holds this port`);
    }
    const landmarks = plateRuntime.landmarks;
    const blocked = new Set(plateRuntime.landmarkBlockers.map(c => `${c.x},${c.y}`));
    console.log(`override revision ${served.revision}; ${landmarks.length} landmarks;`
      + ` ${plateRuntime.landmarkBlockers.length} blocker cells\n`);

    // ---- CENSUS: one load, every landmark's ring.
    await enterSavedGame(page, baseSave(69, 257));
    const stands = {};
    for (const landmark of landmarks) {
      for (const [side, dx, dy] of SIDES) {
        const x = landmark.at.x + dx, y = landmark.at.y + dy;
        // eslint-disable-next-line no-await-in-loop
        const r = await census(page, x, y);
        stands[`${landmark.mapId}:${side}`] = { x, y, ...r };
      }
    }

    // ---- WALK: a fresh load per side, so nothing carries over.
    for (const landmark of landmarks) {
      const exempt = GATE_EXEMPT.has(landmark.mapId);
      const firedFrom = new Set();
      for (const [side, dx, dy] of SIDES) {
        const seat = stands[`${landmark.mapId}:${side}`];
        let start = null;
        for (let step = 2; step <= 5 && !start; step += 1) {
          const x = landmark.at.x + dx * step, y = landmark.at.y + dy * step;
          if (plateWalkable(x, y)) start = { x, y, step };
        }
        if (!start) {
          rows.push({ mapId: landmark.mapId, side, start: null, seat: 'no ground',
            fired: null, verdict: 'NO GROUND' });
          console.log(`  ${landmark.mapId.padEnd(20)} ${side.padEnd(5)} NO GROUND (sea or rock out to 5 cells)`);
          continue;
        }

        // eslint-disable-next-line no-await-in-loop
        await enterSavedGame(page, baseSave(start.x, start.y));
        // eslint-disable-next-line no-await-in-loop
        await armTransitionSpy(page);
        // eslint-disable-next-line no-await-in-loop
        await placeHero(page, start.x, start.y);
        // eslint-disable-next-line no-await-in-loop
        await walkToward(page, -dx, -dy, WALK_MS);
        // eslint-disable-next-line no-await-in-loop
        const out = await readOutcome(page);

        const hits = out.doors.filter(d => d.target === landmark.mapId);
        const wrong = out.doors.filter(d => d.target !== landmark.mapId);
        const fired = hits.length > 0 ? hits[0] : null;
        if (fired) firedFrom.add(`${fired.heroTile.x},${fired.heroTile.y}`);
        // INV-3, asked of a1mFree rather than of the cell grid.
        // eslint-disable-next-line no-await-in-loop
        const perched = out.mapId !== 'overworld' ? false : await page.evaluate(async () => {
          const w = window.__PHASER_GAME__.scene.getScene('WorldMapScene');
          const bx = w.hero.x, by = w.hero.y;
          await new Promise(r => setTimeout(r, 250));
          return Math.hypot(w.hero.x - bx, w.hero.y - by) > 2;
        });
        const restedOnBlocker = perched;

        const verdict = fired ? (out.mapId === landmark.mapId ? 'DOOR FIRED, entered'
          : 'DOOR FIRED, story-gated') : 'REFUSED';
        rows.push({ mapId: landmark.mapId, side, start,
          seat: seat.stands ? 'standable' : (seat.canMove ? 'rescued' : 'blocked'),
          fired: fired ? fired.heroTile : null, endCell: out.cell, verdict,
          restedOnBlocker, wrongDoors: wrong.map(d => d.target) });

        if (wrong.length) failures += 1;
        if (restedOnBlocker) failures += 1;

        // eslint-disable-next-line no-await-in-loop
        await page.screenshot({ path: path.join(OUT, `${landmark.mapId}-${side}.png`) });
        console.log(`  ${landmark.mapId.padEnd(20)} ${side.padEnd(5)} from ${String(start.x).padStart(3)},${start.y}`
          + `  seat=${(seat.stands ? 'stand' : seat.canMove ? 'rescue' : 'block').padEnd(6)}`
          + `${verdict.padEnd(24)}`
          + `${fired ? ` from ${fired.heroTile.x},${fired.heroTile.y}` : ` stopped at ${out.cell.x},${out.cell.y}`}`
          + `${restedOnBlocker ? '  *** RESTED ON A BLOCKER ***' : ''}`
          + `${!fired && out.cooldown > 0 ? `  (cooldown ${out.cooldown} still draining)` : ''}`
          + `${wrong.length ? `  *** OPENED ${wrong.map(d => d.target).join()} ***` : ''}`);
      }

      const seatCells = SIDES
        .map(([s]) => stands[`${landmark.mapId}:${s}`])
        .filter(seat => seat.stands)
        .map(seat => `${seat.x},${seat.y}`);
      const gateway = `${landmark.exit.x},${landmark.exit.y}`;
      const inv1 = seatCells.length <= 1 && seatCells.every(cell => cell === gateway);
      const inv2 = firedFrom.size > 0;
      if (exempt) {
        console.log(`  ${landmark.mapId}: owner-exempt act gate, left as the owner's plate had it --`
          + ` ${seatCells.length} standable side(s) {${seatCells.join(' ')}}; door fires. Reported, not scored.\n`);
      } else if (inv1 && inv2) {
        console.log(`  ${landmark.mapId}: PASS -- INV-1 one entrance`
          + `${seatCells.length ? ` at ${gateway}` : ` (gateway ${gateway} is reachable but not a resting`
            + ' place; see the note below)'}, INV-2 door fires.\n`);
      } else {
        failures += 1;
        console.log(`  ${landmark.mapId}: FAIL -- INV-1 ${inv1 ? 'ok' : `standable sides {${seatCells.join(' ')}},`
          + ` expected at most ${gateway}`}; INV-2 ${inv2 ? 'ok' : 'the door never fired'}\n`);
      }
    }
  } finally {
    fs.writeFileSync(path.join(OUT, 'blocker-walk.json'),
      `${JSON.stringify({ url, rows, errors }, null, 2)}\n`);
    await browser.close();
  }

  if (errors.length) { console.log(`page errors:\n  ${errors.join('\n  ')}`); failures += errors.length; }
  console.log(failures === 0
    ? `ACT 1 LANDMARK BLOCKER VERIFY PASS: one entrance per landmark, no resting place on the art (${OUT})`
    : `ACT 1 LANDMARK BLOCKER VERIFY FAIL: ${failures} problem(s) (${OUT})`);
  process.exit(failures === 0 ? 0 : 1);
})();
