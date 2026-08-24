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

/* WHERE SHE HAS TO STAND TO BE ABLE TO TALK, per NPC, in cells -- DERIVED, NOT AUTHORED.

   town.html's nearestNpc() only sees her when |dx| <= 1.1 cells and dy is between -0.35 and +2.1
   cells (dy positive = she is BELOW the NPC, the owner's approach-from-the-south rule). Each NPC is
   also a dynamicBlocker disc of 7 world px and the hero carries a 4 px foot radius, so the band's
   inner edge is unusable.

   THIS USED TO BE A HARD-CODED TABLE OF SIX CELLS AND IT ROTTED, which is worse than useless
   because it fails as though the TOWN were broken. Run against HEAD on 2026-08-24 it scored four of
   six NPCs unreachable and then crashed on the shopkeeper, who has no entry at all because he was
   added after the table was written -- while `place_town_actors.py` reported every one of them
   reachable, correctly. A harness whose constants describe an older layout is not evidence.

   So the approach point is now solved against the LIVE geometry, in the page, using the same
   `isInsideWalkable` the runtime walks on. Among the band positions the predicate accepts, it takes
   the one with the most accepted neighbours -- open ground rather than a one-pixel notch -- and
   breaks ties toward straight-below the NPC. If the band has no accepted position at all, that IS
   the town failing, and it is reported as such rather than as a walking failure. */
const BAND = { dx: 1.1, dyMin: -0.35, dyMax: 2.1 };
/* The follower accepts a waypoint within 0.5 cells, so an approach point ON the band's edge can be
   "reached" from OUTSIDE the band and score a perfectly good NPC as unreachable -- which is what
   villager2 and the fisherman did, stopping at dx 1.20 and 1.34 against the band's 1.1 limit.
   The point is therefore chosen from the band shrunk by more than that tolerance on every side, so
   arriving anywhere the follower calls "arrived" is still inside the band the game reads. */
const MARGIN = 0.55;

const approachFor = (page, npcId) => page.evaluate(({ npcId, BAND, MARGIN }) => {
  const T = window.__ACT1_TOWN__;
  const C = T.town.worldPxPerCell;
  const npc = T.town.npcs.find(n => n.id === npcId);
  const cx = npc.cell[0] * C, cy = npc.cell[1] * C;
  const ok = (x, y) => window.__GH_INSIDE__({ x, y }, T.walkable);
  const search = (m) => {
    let best = null;
    for (let ox = -(BAND.dx - m) * C; ox <= (BAND.dx - m) * C; ox += 2) {
      for (let oy = (BAND.dyMin + m) * C; oy <= (BAND.dyMax - m) * C; oy += 2) {
        const x = cx + ox, y = cy + oy;
        if (!ok(x, y)) continue;
        let room = 0;
        for (const [nx, ny] of [[8, 0], [-8, 0], [0, 8], [0, -8], [8, 8], [-8, 8], [8, -8], [-8, -8]]) {
          if (ok(x + nx, y + ny)) room += 1;
        }
        const score = room * 1000 - Math.abs(ox);
        if (!best || score > best.score) best = { score, x: x / C, y: y / C, room, margin: m };
      }
    }
    return best;
  };
  // Fall back to the unshrunk band only if the margin leaves nothing: a genuinely tight NPC should
  // still be attempted, and reported honestly, rather than declared unreachable by the margin.
  return search(MARGIN) || search(0);
}, { npcId, BAND, MARGIN });

/* Where is she, in CELLS, according to the running game rather than according to us. */
const cellNow = page => page.evaluate(() => {
  const T = window.__ACT1_TOWN__;
  const p = T.position();
  return { x: p.x / T.town.worldPxPerCell, y: p.y / T.town.worldPxPerCell };
});

async function hold(page, dirs, ms) {
  const keys = (Array.isArray(dirs) ? dirs : [dirs]).filter(Boolean);
  for (const d of keys) await page.keyboard.down(ARROW[d]);
  await page.waitForTimeout(ms);
  for (const d of keys) await page.keyboard.up(ARROW[d]);
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
  /* KEEP EVERY SECOND LATTICE NODE, NOT EVERY FOURTH. At 8 world px a stride of four is 32 px --
     two cells -- and the straight push between two such waypoints cuts the corner of any lane
     narrower than that. Authoring building footprints on 2026-08-24 narrowed several greenhollow
     lanes to about that width, and the coarse stride started jamming her against cottage corners on
     routes the BFS had already proved. */
  const way = route.filter((_, i) => i % 2 === 0);
  way.push({ x: tx, y: ty });
  let idx = 0, stubborn = 0;
  while (idx < way.length && Date.now() < deadline) {
    const at = await cellNow(page);
    while (idx < way.length && Math.hypot(way[idx].x - at.x, way[idx].y - at.y) < 0.5) idx += 1;
    if (idx >= way.length) break;
    const dx = way[idx].x - at.x, dy = way[idx].y - at.y;
    const major = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : (dy > 0 ? 'down' : 'up');
    const minor = Math.abs(dx) > Math.abs(dy) ? (dy > 0 ? 'down' : 'up') : (dx > 0 ? 'right' : 'left');
    /* ONE AXIS AT A TIME, AND A DIAGONAL PRESS WAS TRIED AND IS WORSE -- MEASURED, so that nobody
       re-runs the experiment. Holding both keys whenever the waypoint was diagonal (minor axis over
       0.15 cells) took a run that had walked all six NPCs down to two, wedging her in the south lane
       at y~37 on four separate legs: the constant sideways component pushes her into the lane wall
       and the follower's own stall recovery then fights it. Pushing the major axis and only
       sidestepping when she actually stops is what works here. */
    await hold(page, major, 200);
    let after = await cellNow(page);
    if (Math.hypot(after.x - at.x, after.y - at.y) < 0.12) {
      /* SLIDE ALONG THE WALL RATHER THAN GIVING UP ON THE WAYPOINT. The old loop only ever pushed
         the major axis and skipped the waypoint after three stalls, so a hero pressed into a corner
         abandoned the route and the run scored a reachable NPC as unreachable -- differently on
         each run, because where she gave up depended on where the previous walk left her. The
         perpendicular push is what gets her off the corner; only a stall on BOTH axes counts. */
      await hold(page, minor, 200);
      after = await cellNow(page);
      if (Math.hypot(after.x - at.x, after.y - at.y) < 0.12) {
        stubborn += 1;
        if (stubborn >= 4) { idx += 1; stubborn = 0; }
      } else stubborn = 0;
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
      /* A `fixed` NPC stands inside his own building on purpose -- the shopkeeper, behind his
         counter -- and the player reaches his shop through `shopCounter`, not through nearestNpc().
         Walking at him is not a question this harness has any business asking. */
      if (npc.fixed) {
        console.log(`  ${npc.id.padEnd(10)} fixed -- stands inside its building, reached via shopCounter`);
        continue;
      }
      /* Approach is from the SOUTH by owner rule -- town.html's nearestNpc() only looks in the band
         BELOW an NPC -- and she is also a dynamicBlocker, so the target is the point in that band
         with full foot clearance, not her feet. approachFor() solves that point against the same polygon
         the runtime uses; if one of these were unreachable that would be the town's failure. */
      const spot = await approachFor(page, npc.id);
      if (!spot) {
        fail(`${npc.id}: nowhere inside the talk band the runtime will let her stand`);
        report.npcs.push({ id: npc.id, approach: null, reached: false });
        continue;
      }
      const goal = [spot.x, spot.y];
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

    /* AND EVERY BUILDING, DERIVED FROM THE AUTHORED FOOTPRINTS RATHER THAN FROM ONE MEMORISED BOX.
       This used to push north into "cottage-ne, cells x44-55 y18-26" and assert she stopped at
       y=26. That cottage is not where the current painting puts it -- the constant described the
       scrapped plan-primed layout -- so on 2026-08-24 the check walked to a cell that no longer
       exists as ground and then scored the town as letting her INTO a building.

       The footprints in design/act1-towns/greenhollow-authored-obstacles.json are the same polygons
       derive_town_walkable.py clears from the walkable mask, so this asks the runtime the exact
       question the owner asked: *"the towns are walkable on weird places like the roofs of
       houses."* For each footprint she is placed on open ground below its south edge and driven
       hard at it; every sampled position must stay outside the polygon. Footprints with no clear
       standing room below them (an NPC in the way, or the town edge) are reported as SKIPPED rather
       than silently passed. */
    const bands = JSON.parse(fs.readFileSync(
      path.join(__dirname, '..', 'design/act1-towns/greenhollow-authored-obstacles.json'),
      'utf8')).nonWalkableBands;
    const ART_PER_CELL = 30, WORLD_PER_CELL = 16;
    const inPoly = (px, py, poly) => {
      let hit = false;
      for (let i = 0, j = poly.length - 1; i < poly.length; j = i, i += 1) {
        const [xi, yi] = poly[i], [xj, yj] = poly[j];
        if ((yi > py) !== (yj > py) && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi) hit = !hit;
      }
      return hit;
    };
    for (const band of bands) {
      const poly = band.polygonArt;
      const xs = poly.map(p => p[0]), ys = poly.map(p => p[1]);
      const midX = (Math.min(...xs) + Math.max(...xs)) / 2 / ART_PER_CELL;
      const southY = Math.max(...ys) / ART_PER_CELL;
      /* Find open ground below the south edge that the runtime accepts and that is clear of every
         NPC blocker -- otherwise the push stops against a villager and scores her as a wall. */
      const start = await page.evaluate(({ midX, southY }) => {
        const T = window.__ACT1_TOWN__;
        const C = T.town.worldPxPerCell;
        const ok = (x, y) => window.__GH_INSIDE__({ x, y }, T.walkable);
        for (let dy = 0.6; dy <= 3.0; dy += 0.2) {
          for (const dx of [0, -0.6, 0.6, -1.2, 1.2, -1.8, 1.8]) {
            const cx = midX + dx, cy = southY + dy;
            if (!ok(cx * C, cy * C)) continue;
            if (T.town.npcs.some(n => Math.hypot(n.cell[0] - cx, n.cell[1] - cy) < 1.5)) continue;
            return { x: cx, y: cy };
          }
        }
        return null;
      }, { midX, southY });
      if (!start) {
        console.log(`  ${band.id.padEnd(18)} SKIPPED -- no clear standing room below its south edge`);
        report.buildings.push({ id: band.id, skipped: true });
        continue;
      }
      await walkTo(page, start.x, start.y, 30_000);
      const push = await pushAndSample(page, 'up', 2000, 14);
      const inside = push.filter(sm => inPoly(sm.at.x * ART_PER_CELL, sm.at.y * ART_PER_CELL, poly));
      const leftPolygon = push.some(sm => !sm.inside);
      const walkedIn = inside.length > 0 || leftPolygon;
      const deepest = Math.min(...push.map(sm => sm.at.y));
      report.buildings.push({ id: band.id, southEdgeCell: +southY.toFixed(2),
                              deepestY: +deepest.toFixed(2), entered: walkedIn });
      console.log(`  ${band.id.padEnd(18)} pushed north to y=${deepest.toFixed(2)}`
        + ` (south edge y=${southY.toFixed(1)})  `
        + (walkedIn ? '*** WALKED INTO THE BUILDING ***' : 'held'));
      if (walkedIn) failures += 1;
    }

    // ---- EXIT -----------------------------------------------------------------------------
    console.log('\nEXIT');
    /* Start the exit walk from the SPAWN, not from wherever the last building push left her.
       The building probes deliberately drive her hard into walls all over the village, so the exit
       leg was starting from an arbitrary corner and its outcome depended on the run's history --
       one run walked out and posted, the next stalled four cells short of the gate and scored the
       exit as broken. Re-homing makes this leg measure the exit rather than the walker. */
    await walkTo(page, townCfg.startCell[0], townCfg.startCell[1], 90_000);
    await walkTo(page, townCfg.exit.cell[0], townCfg.exit.cell[1], 60_000);
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
