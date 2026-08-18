#!/usr/bin/env node
/* Play Greenhollow in the real runtime and prove it is a town rather than a picture of one.
 *
 * WHY IT EXISTS
 *   greenhollow-town.json can be read and believed. Every field can be right and the town still be
 *   unplayable: an NPC snapped onto a cell no body fits through the approach to, a palisade the
 *   walkable polygon does not actually close, an exit that never arms. `check_town_finish.py`
 *   measures the PICTURE and `validateWalkableGeometry` measures the POLYGON; neither of them
 *   walks. So this drives town.html in a headless Chrome and asks the five questions a player asks.
 *
 * IT PRESSES REAL ARROW KEYS. town.html's `held` set is fed from `keydown`/`keyup`, and the touch
 *   stick writes `touchVec` -- a separate channel. The sibling overworld harness
 *   (verify_act1_landmark_blockers.cjs) measured `window.__DQ_STICK__` failing to move the hero one
 *   pixel on an approach that real arrow keys walked in 440 ms, and reported a working door as
 *   unenterable because of it. An input path the player does not have is not evidence about the
 *   player's experience, so this uses `page.keyboard` throughout.
 *
 * WHAT IT MEASURES
 *   ARRIVE   she boots at startCell, inside the walkable authority, with the plate drawn.
 *   REACH    she WALKS from the gate to each of the six NPCs, along a route BFS'd over the game's
 *            own `isInsideWalkable`, and the game's own `nearestNpc()` then names that NPC.
 *   TALK     Enter opens the dialogue box carrying that NPC's name, text and dialogueKey -- except
 *            the healer, who is a SERVICE: town.html hands her to the shipped scene's heal flow and
 *            posts act1-town-service instead of opening a box, so that message is her proof.
 *   PALISADE she is driven hard at the wall from inside on every heading, for seconds, and never
 *            leaves the polygon; and driven into a building's footprint and never enters it.
 *            Asked of `isInsideWalkable` on her live position rather than of the JSON, because the
 *            question is whether the RUNTIME holds, not whether the geometry looks closed.
 *   EXIT     walking back out through the south gate posts act1-town-exit with the overworld cell.
 *
 * USAGE
 *   python3 -m http.server 5178 --directory dist    # NEVER `serve -s dist`: it rewrites modules
 *   node scripts/greenhollow_verify_town.cjs [url-root] [--out DIR]
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
const ROOT_URL = (args.find(a => !a.startsWith('--')) || 'http://127.0.0.1:5178/').replace(/\/?$/, '/');
const outIdx = args.indexOf('--out');
const OUT = outIdx >= 0 ? args[outIdx + 1]
  : path.join(__dirname, '..', 'design/act1-towns/greenhollow/proof');
const TOWN_URL = `${ROOT_URL}act1-hifi/town.html?town=greenhollow&debug`;

const ARROW = { left: 'ArrowLeft', right: 'ArrowRight', up: 'ArrowUp', down: 'ArrowDown' };

/* WHERE SHE HAS TO STAND TO BE ABLE TO TALK, per NPC, in cells.
   town.html's nearestNpc() only sees her when |dx| <= 1.1 cells and dy is between -0.35 and +2.1
   cells (dy positive = she is BELOW the NPC, the owner's approach-from-the-south rule). Each NPC is
   also a dynamicBlocker disc of 7 world px and the hero carries a 4 px foot radius, so the band's
   inner edge is unusable. These are the point in each NPC's band that is closest to straight-below
   while clearing the blocker, the region edge and every static obstacle -- solved against
   greenhollow-walkable.json, which is the same geometry the runtime loads. They are the harness's
   targets only; nothing in the game reads them. */
const APPROACH = {
  elder: [32.5, 22.4],
  kiki: [27.6, 24.2],
  healer: [21.5, 40.9],
  villager1: [18.5, 28.9],
  villager2: [46.5, 28.9],
  fisherman: [43.7, 41.8],
};

/* Where is she, in CELLS, according to the running game rather than according to us. */
const cellNow = page => page.evaluate(() => {
  const T = window.__ACT1_TOWN__;
  const p = T.position();
  return { x: p.x / T.town.worldPxPerCell, y: p.y / T.town.worldPxPerCell };
});

async function hold(page, dir, ms) {
  await page.keyboard.down(ARROW[dir]);
  await page.waitForTimeout(ms);
  await page.keyboard.up(ARROW[dir]);
}

/* ROUTE FIRST, THEN WALK -- and the first version of this file proves why the order matters.
   It walked greedily (push on the larger axis, sidestep when a push stops moving her) and that
   reached the two NPCs on the north spoke and then stalled in the grass between the two WEST
   spokes, reporting villager1, villager2 and the fisherman as unreachable. They are not: an
   approach point inside town.html's own talk band, with full foot clearance, exists for all six.
   Greenhollow is a hub with six spokes, so "walk toward it" is exactly the wrong instruction --
   the target is usually behind a cottage and the route is out to the plaza and back down a lane.
   A harness that cannot tell "no route" from "my walker gave up" cannot be evidence about a town.

   So the route is planned against the game's OWN predicate. `isInsideWalkable` is imported from
   the same module town.html imported, with the same data object -- NPC blockers, obstacles, foot
   radius and all -- and BFS'd over a 8 world-px lattice. The result is a path the runtime agrees
   with by construction, and if BFS finds none, that IS the town failing. */
const GRID = 8;                                   // world px per lattice step

async function planRoute(page, tx, ty) {
  return page.evaluate(({ tx, ty, GRID }) => {
    const T = window.__ACT1_TOWN__;
    const C = T.town.worldPxPerCell;
    const ok = (x, y) => window.__GH_INSIDE__({ x, y }, T.walkable);
    const W = Math.ceil(T.walkable.width / GRID), H = Math.ceil(T.walkable.height / GRID);
    const key = (i, j) => j * W + i;
    /* SNAP TO A LATTICE NODE THE PREDICATE ACCEPTS -- AT BOTH ENDS.
       The hero moves in continuous world pixels and the lattice is 8 px, so the node NEAREST a
       legal position is very often not itself legal. Measured, and it is not a corner case: after
       talking to the healer she stands at (340.8, 656), which the runtime is perfectly happy with,
       wedged between the healer building's east wall at x=336 and the healer's own 7 px blocker.
       Every one of the four neighbours of her rounded node is refused, so a BFS seeded there floods
       exactly ONE node and reports villager1, villager2 and the fisherman as unreachable -- three
       false failures from one rounding. The goal end has the same problem for the opposite reason:
       the approach points are exact to a tenth of a cell.

       So both ends spiral out to the nearest acceptable node. The start snap is allowed to travel
       further than the goal snap because the pocket she can be standing in is bounded by the
       blocker radius, and the follower walks her out of it on the first waypoint anyway. */
    const snap = (i0, j0, radius) => {
      if (ok(i0 * GRID, j0 * GRID)) return [i0, j0];
      for (let r = 1; r <= radius; r += 1) {
        for (let di = -r; di <= r; di += 1) {
          for (let dj = -r; dj <= r; dj += 1) {
            if (Math.max(Math.abs(di), Math.abs(dj)) !== r) continue;
            if (ok((i0 + di) * GRID, (j0 + dj) * GRID)) return [i0 + di, j0 + dj];
          }
        }
      }
      return null;
    };
    const from = T.position();
    const start = snap(Math.round(from.x / GRID), Math.round(from.y / GRID), 10);
    const goal = snap(Math.round(tx * C / GRID), Math.round(ty * C / GRID), 6);
    if (!start || !goal) return null;             // genuinely nowhere to stand: the town's failure
    const [si, sj] = start;
    const [gi, gj] = goal;
    const prev = new Map();
    const seen = new Uint8Array(W * H);
    let queue = [[si, sj]];
    seen[key(si, sj)] = 1;
    while (queue.length) {
      const next = [];
      for (const [i, j] of queue) {
        if (i === gi && j === gj) {
          const path = [];
          let cur = key(i, j), ci = i, cj = j;
          for (;;) {
            path.push({ x: (ci * GRID) / C, y: (cj * GRID) / C });
            const p = prev.get(cur);
            if (p === undefined) break;
            cur = p; ci = p % W; cj = (p - ci) / W;
          }
          return path.reverse();
        }
        for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const ni = i + di, nj = j + dj;
          if (ni < 0 || nj < 0 || ni >= W || nj >= H || seen[key(ni, nj)]) continue;
          if (!ok(ni * GRID, nj * GRID)) { seen[key(ni, nj)] = 1; continue; }
          seen[key(ni, nj)] = 1;
          prev.set(key(ni, nj), key(i, j));
          next.push([ni, nj]);
        }
      }
      queue = next;
    }
    return null;
  }, { tx, ty, GRID });
}

/* Follow the route with real arrow keys, against ONE budget for the whole walk rather than a burst
   quota per waypoint. The per-waypoint version spent its allowance on the early legs and left the
   elder's 70-node route unfinished at the halfway mark -- reported as unreachable, which she is
   not. Waypoints are thinned to about two cells apart because steering every 8 px spends the walk
   on round trips to the page; a waypoint that resists three pushes is skipped, since the route is
   known good and a stubborn one is just the hero sliding along a wall. */
async function walkTo(page, tx, ty, budgetMs = 90_000) {
  const deadline = Date.now() + budgetMs;
  const route = await planRoute(page, tx, ty);
  if (!route) return { arrived: false, noRoute: true, at: await cellNow(page), route: 0 };
  const way = route.filter((_, i) => i % 4 === 0);
  way.push({ x: tx, y: ty });
  let idx = 0, stubborn = 0;
  while (idx < way.length && Date.now() < deadline) {
    const at = await cellNow(page);
    while (idx < way.length && Math.hypot(way[idx].x - at.x, way[idx].y - at.y) < 0.5) idx += 1;
    if (idx >= way.length) break;
    const dx = way[idx].x - at.x, dy = way[idx].y - at.y;
    await hold(page, Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left')
      : (dy > 0 ? 'down' : 'up'), 200);
    const after = await cellNow(page);
    if (Math.hypot(after.x - at.x, after.y - at.y) < 0.12) {
      stubborn += 1;
      if (stubborn >= 3) { idx += 1; stubborn = 0; }
    } else stubborn = 0;
  }
  const at = await cellNow(page);
  return { arrived: Math.hypot(at.x - tx, at.y - ty) < 0.9, at, route: route.length };
}

/* Is the RUNTIME holding her inside? Asked of town.html's own imported predicate against her live
   position, so a polygon that validates but does not contain her still fails here. */
const insideNow = page => page.evaluate(() => {
  const T = window.__ACT1_TOWN__;
  return window.__GH_INSIDE__(T.position(), T.walkable);
});

/* Push at a heading for `ms`, sampling containment the whole way. A wall that leaks does so for a
   frame or two, so the answer has to be the WORST sample, not the last one. */
async function pushAndSample(page, dir, ms, samples = 12) {
  await page.keyboard.down(ARROW[dir]);
  const seen = [];
  for (let i = 0; i < samples; i += 1) {
    await page.waitForTimeout(Math.max(40, Math.round(ms / samples)));
    // eslint-disable-next-line no-await-in-loop
    seen.push({ inside: await insideNow(page), at: await cellNow(page) });
  }
  await page.keyboard.up(ARROW[dir]);
  await page.waitForTimeout(120);
  return seen;
}

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const townCfg = JSON.parse(fs.readFileSync(
    path.join(__dirname, '..', 'public/act1-hifi/town/greenhollow-town.json'), 'utf8'));

  const browser = await chromium.launch({
    headless: true, channel: 'chrome',
    args: ['--use-angle=swiftshader', '--enable-webgl', '--ignore-gpu-blocklist', '--mute-audio'],
  });
  const page = await browser.newPage({ viewport: { width: 900, height: 640 } });
  const errors = [];
  page.on('pageerror', e => errors.push(`pageerror: ${e.message}`));
  page.on('console', m => {
    if (m.type() === 'error' && !m.text().includes('Failed to load resource')) errors.push(`console: ${m.text()}`);
  });

  const report = { url: TOWN_URL, npcs: [], palisade: [], buildings: [], errors };
  let failures = 0;
  const fail = msg => { failures += 1; console.log(`  FAIL  ${msg}`); };

  try {
    await page.goto(TOWN_URL, { waitUntil: 'load', timeout: 30_000 });
    await page.waitForSelector('body[data-ready="true"]', { timeout: 30_000 });

    /* town.html keeps isInsideWalkable module-private. Import the same module the page did, from
       the same origin, so the predicate under test is byte-identical to the one the game runs. */
    await page.evaluate(async () => {
      const m = await import('./walkable-polygons.js');
      window.__GH_INSIDE__ = m.isInsideWalkable;
    });

    /* Listen for the exit message. town.html posts to `parent`, which for a top-level document is
       the window itself, so this catches it without an iframe. */
    await page.evaluate(() => {
      window.__GH_EXIT__ = [];
      window.__GH_TALK__ = [];
      window.__GH_SERVICE__ = [];
      addEventListener('message', e => {
        if (e.data?.type === 'act1-town-exit') window.__GH_EXIT__.push(e.data);
        if (e.data?.type === 'act1-town-interact') window.__GH_TALK__.push(e.data);
        if (e.data?.type === 'act1-town-service') window.__GH_SERVICE__.push(e.data);
      });
    });

    // ---- ARRIVE ---------------------------------------------------------------------------
    const boot = await cellNow(page);
    const bootInside = await insideNow(page);
    report.arrive = { cell: boot, inside: bootInside, startCell: townCfg.startCell };
    console.log(`\nARRIVE  boot cell ${boot.x.toFixed(2)},${boot.y.toFixed(2)}  inside=${bootInside}`);
    if (!bootInside) fail('she boots OUTSIDE the walkable authority');
    if (Math.hypot(boot.x - townCfg.startCell[0], boot.y - townCfg.startCell[1]) > 0.4) {
      fail(`boot cell is not startCell ${townCfg.startCell} -- town.html had to rescue the spawn`);
    }
    await page.screenshot({ path: path.join(OUT, '01-arrive-at-the-gate.png') });

    // ---- REACH + TALK ---------------------------------------------------------------------
    console.log('\nREACH + TALK');
    for (const npc of townCfg.npcs) {
      /* Approach is from the SOUTH by owner rule -- town.html's nearestNpc() only looks in the band
         BELOW an NPC -- and she is also a dynamicBlocker, so the target is the point in that band
         with full foot clearance, not her feet. APPROACH[] is measured against the same polygon
         the runtime uses; if one of these were unreachable that would be the town's failure. */
      const goal = APPROACH[npc.id];
      const walk = await walkTo(page, goal[0], goal[1], 45_000);
      const near = await page.evaluate(() => window.__ACT1_TOWN__.nearestNpc()?.id ?? null);
      await page.keyboard.press('Enter');
      await page.waitForTimeout(260);
      const said = await page.evaluate(() => ({
        open: document.querySelector('#dialogue').dataset.open === 'true',
        name: document.querySelector('#dialogue b').textContent,
        text: document.querySelector('#dialogue p').textContent,
        posted: (window.__GH_TALK__ || []).at(-1) ?? null,
        service: (window.__GH_SERVICE__ || []).at(-1) ?? null,
      }));
      /* THE HEALER IS A SERVICE, NOT A DIALOGUE, and expecting a box from her is how the first
         run of this file scored a working healer as broken. town.html hands her to the shipped
         scene -- `handleHealer` owns the full-HP check, the gold check and the confirm overlay --
         and posts act1-town-service instead of opening its own box, deliberately, so the town
         does not fork the economy. So talking to her is proved by that message. */
      const reached = near === npc.id;              // the GAME naming her, not our own arithmetic
      const talked = npc.id === 'healer'
        ? said.service?.kind === 'healer' && said.service?.town === 'greenhollow'
        : said.open && said.name === npc.name && said.text === npc.text
          && said.posted?.npc === npc.id && said.posted?.dialogueKey === npc.dialogueKey;
      const ok = reached && talked && !walk.noRoute;
      report.npcs.push({ id: npc.id, npcCell: npc.cell, approach: goal, walked: walk.arrived,
        routeNodes: walk.route, noRoute: !!walk.noRoute, stoppedAt: walk.at, nearest: near,
        said, reached, talked, ok });
      console.log(`  ${npc.id.padEnd(10)} route=${String(walk.route).padEnd(4)}`
        + ` stopped ${walk.at.x.toFixed(1)},${walk.at.y.toFixed(1)}`
        + `  nearest=${String(near).padEnd(10)}`
        + `  ${npc.id === 'healer' ? `service=${said.service?.kind ?? '-'}`
          : `box=${said.open ? `"${said.name}"` : 'CLOSED'} key=${said.posted?.dialogueKey ?? '-'}`}`
        + `  ${ok ? 'OK' : `*** FAIL ***${walk.noRoute ? ' NO ROUTE' : ''}`}`);
      if (!ok) failures += 1;
      if (npc.id === 'kiki' && said.open) {
        await page.screenshot({ path: path.join(OUT, '02-kiki-quest-dialogue.png') });
      }
      if (said.open) { await page.keyboard.press('Enter'); await page.waitForTimeout(180); }
    }

    // ---- PALISADE -------------------------------------------------------------------------
    /* From the plaza, push at every heading for two seconds each. The plaza is ringed by grass and
       then by the wall, so each of these ends against something that must hold. */
    console.log('\nPALISADE + BUILDINGS');
    for (const dir of ['up', 'down', 'left', 'right']) {
      await walkTo(page, 32.5, 33.5);               // back to the plaza between headings
      const seen = await pushAndSample(page, dir, 2400, 16);
      const leaked = seen.filter(s => !s.inside);
      const end = seen.at(-1).at;
      report.palisade.push({ dir, leaked: leaked.length, samples: seen.length, end });
      console.log(`  push ${dir.padEnd(5)} ended ${end.x.toFixed(1)},${end.y.toFixed(1)}`
        + `  outside on ${leaked.length}/${seen.length} samples`
        + `  ${leaked.length ? '*** LEAKED THROUGH ***' : 'held'}`);
      if (leaked.length) failures += 1;
    }
    await page.screenshot({ path: path.join(OUT, '03-against-the-palisade.png') });

    /* And a building specifically. cottage-ne's footprint is cells x44-55, y18-26, so its facade is
       the line y=26; stand under it and push north, and she must stop against the wall rather than
       walk into the room. cottage-ne rather than the elder hall because the hall has the elder
       standing in front of it: her 7 px blocker would stop the push first and the run would score
       an NPC as a building. Nothing here is within 1.1 cells of villager2, for the same reason. */
    await walkTo(page, 49.0, 27.6);
    const intoCottage = await pushAndSample(page, 'up', 2400, 16);
    const deepest = Math.min(...intoCottage.map(s => s.at.y));
    const walkedIn = intoCottage.some(s => !s.inside) || deepest < 26.0;
    report.buildings.push({ id: 'cottage-ne', facadeY: 26.0, deepestY: deepest, entered: walkedIn });
    console.log(`  cottage-ne  pushed north to y=${deepest.toFixed(2)}`
      + ` (facade at y=26)  ${walkedIn ? '*** WALKED INTO THE BUILDING ***' : 'held'}`);
    if (walkedIn) failures += 1;

    // ---- EXIT -----------------------------------------------------------------------------
    console.log('\nEXIT');
    await walkTo(page, townCfg.exit.cell[0], townCfg.exit.cell[1]);
    await page.waitForTimeout(400);
    const exits = await page.evaluate(() => window.__GH_EXIT__);
    const at = await cellNow(page);
    const exitOk = exits.length > 0 && exits[0].town === 'greenhollow'
      && exits[0].toX === townCfg.exit.toX && exits[0].toY === townCfg.exit.toY;
    report.exit = { fired: exits, at, ok: exitOk };
    console.log(`  walked back to ${at.x.toFixed(1)},${at.y.toFixed(1)}`
      + `  posted=${JSON.stringify(exits[0] ?? null)}  ${exitOk ? 'OK' : '*** NO EXIT ***'}`);
    if (!exitOk) failures += 1;
    await page.screenshot({ path: path.join(OUT, '04-back-out-through-the-gate.png') });
  } finally {
    fs.writeFileSync(path.join(OUT, 'town-walk.json'), `${JSON.stringify(report, null, 2)}\n`);
    await browser.close();
  }

  if (errors.length) { console.log(`\npage errors:\n  ${errors.join('\n  ')}`); failures += errors.length; }
  console.log(failures === 0
    ? `\nGREENHOLLOW TOWN VERIFY PASS: arrived, six NPCs walked to and talked to, wall held, exit fires (${OUT})`
    : `\nGREENHOLLOW TOWN VERIFY FAIL: ${failures} problem(s) (${OUT})`);
  process.exit(failures === 0 ? 0 : 1);
})();
