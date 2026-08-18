#!/usr/bin/env node
/* Play Millbrook. Prove she arrives, reaches and talks to all four NPCs, is held by the palisade
 * and by the buildings, and can leave -- by driving the real build with the keys a player presses.
 *
 * WHY IT EXISTS
 *   A town can pass every static gate and still be unplayable. `check_town_finish.py` measures the
 *   PLATE; `validateWalkableGeometry` measures the POLYGON; neither of them is the game. The three
 *   things that actually break a town -- an NPC standing where no body can reach, an arrival cell
 *   the runtime has to rescue the player from, and an exit that either never arms or fires the
 *   instant she spawns -- are invisible to both. So this walks her.
 *
 * IT DRIVES ARROW KEYS, NOT `window.__DQ_STICK__`.
 *   scripts/verify_act1_landmark_blockers.cjs measured the difference and it is not cosmetic: the
 *   synthetic stick moved the hero on seven of eight landmarks and did not move her ONE PIXEL on
 *   the eighth, from a seed where real arrow keys walked her to the door in 440 ms. An input path
 *   the player does not have can report "unreachable" for something that works every time, which is
 *   the exact failure this file exists to catch. town.html binds `keydown`/`keyup` on its own
 *   window, so these keys go in the same door a player's do.
 *
 * IT READS THE POSITION OUT OF THE GAME, NOT OUT OF ITS OWN MODEL.
 *   `?debug` makes town.html print the hero cell it is actually simulating into `#debug`, once per
 *   frame, from the same `position` collision is applied to. Every assertion below is made against
 *   that number rather than against where this script believes it steered her.
 *
 * PATHING IS RECOMPUTED EVERY TICK, DELIBERATELY.
 *   The runtime SLIDES the hero along a wall when a move is refused (`constrainWalkableMovement`),
 *   so a precomputed key sequence desynchronises the moment she grazes anything. Re-running the BFS
 *   from wherever she actually is, and re-pressing only when the direction changes, turns the wall
 *   slide from a failure mode into free pathing.
 *
 * THE BLOCK TESTS PUSH STRAIGHT AT THE OBSTACLE INSTEAD OF PATHING AROUND IT.
 *   Asking the pathfinder to enter a building proves nothing -- it would simply route around. The
 *   palisade and building checks hold one key down for seconds and then ask the walkable authority
 *   where she ended up. Passing means the runtime refused, not that this script never tried.
 *
 * USAGE
 *   python3 -m http.server 5174 --directory dist   # NEVER `serve -s dist`: it rewrites modules
 *   node scripts/millbrook_verify.cjs [url] [--out DIR] [--headed]
 */
const fs = require('node:fs');
const path = require('node:path');

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

const ROOT = path.join(__dirname, '..');
const args = process.argv.slice(2);
const BASE = (args.find(a => !a.startsWith('--')) || 'http://127.0.0.1:5174/').replace(/\/$/, '');
const outIdx = args.indexOf('--out');
const OUT = outIdx >= 0 ? args[outIdx + 1] : path.join(ROOT, 'design/act1-towns/millbrook/proof');
const HEADED = args.includes('--headed');

const TOWN = JSON.parse(fs.readFileSync(path.join(ROOT, 'public/act1-hifi/town/millbrook-town.json'), 'utf8'));
const SPEC = JSON.parse(fs.readFileSync(path.join(ROOT, 'design/act1-towns/millbrook/spec.json'), 'utf8'));
const CELL = TOWN.worldPxPerCell;
const STEP = 0.25;                      // cells per pathing-grid node
const N = Math.round(65 / STEP);
const NPC_BLOCK_RADIUS = 7;             // town.html's own constant
const ARROW = { left: 'ArrowLeft', right: 'ArrowRight', up: 'ArrowUp', down: 'ArrowDown' };

const results = [];
function record(name, pass, detail) {
  results.push({ name, pass, detail });
  console.log(`  ${pass ? 'PASS' : 'FAIL'}  ${name}  ${detail}`);
}

// ---- the pathing grid, built from the SAME authority and the SAME blockers the runtime uses -----
// town.html appends one dynamic blocker per NPC (halfWidth NPC_BLOCK_RADIUS) before it ever calls
// constrainWalkableMovement, so a grid built without them plans routes straight through the
// villagers and then reports a perfectly good town as unwalkable.
let WALK = null;
let INSIDE = null;
async function buildGrid() {
  const M = await import('../public/act1-hifi/walkable-polygons.js');
  const data = JSON.parse(fs.readFileSync(
    path.join(ROOT, 'public/act1-hifi/town/millbrook-walkable.json'), 'utf8'));
  data.dynamicBlockers = [
    ...(data.dynamicBlockers || []),
    ...TOWN.npcs.map(n => {
      const point = { x: n.cell[0] * CELL, y: n.cell[1] * CELL };
      return { id: `npc-${n.id}`, from: point, to: point, halfWidth: NPC_BLOCK_RADIUS };
    }),
  ];
  WALK = data;
  INSIDE = (cx, cy) => M.isInsideWalkable({ x: cx * CELL, y: cy * CELL }, data);
  const free = new Uint8Array(N * N);
  for (let i = 0; i < N; i += 1) {
    for (let j = 0; j < N; j += 1) free[i * N + j] = INSIDE(j * STEP, i * STEP) ? 1 : 0;
  }
  return free;
}

/* BFS over the free grid. Returns the predecessor field and the node it actually rooted at -- if
   the hero is standing on a node the grid calls solid (she legitimately can be: the grid samples
   at 0.25 cells and her real position is continuous) the search is seeded from the nearest free
   node instead of returning "no path", which would be a false unreachable. */
function bfs(free, si, sj) {
  const prev = new Int32Array(N * N).fill(-1);
  const seen = new Uint8Array(N * N);
  const q = new Int32Array(N * N);
  let head = 0, tail = 0, seed = si * N + sj;
  if (!free[seed]) {
    let best = -1, bd = Infinity;
    for (let i = Math.max(0, si - 12); i < Math.min(N, si + 13); i += 1) {
      for (let j = Math.max(0, sj - 12); j < Math.min(N, sj + 13); j += 1) {
        if (!free[i * N + j]) continue;
        const d = (i - si) ** 2 + (j - sj) ** 2;
        if (d < bd) { bd = d; best = i * N + j; }
      }
    }
    if (best < 0) return { prev, seed: -1 };
    seed = best;
  }
  seen[seed] = 1; q[tail] = seed; tail += 1;
  while (head < tail) {
    const cur = q[head]; head += 1;
    const ci = (cur / N) | 0, cj = cur % N;
    for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const a = ci + di, b = cj + dj;
      if (a < 0 || b < 0 || a >= N || b >= N) continue;
      const k = a * N + b;
      if (seen[k] || !free[k]) continue;
      seen[k] = 1; prev[k] = cur; q[tail] = k; tail += 1;
    }
  }
  return { prev, seed };
}

/* The node ~`lead` steps along the path towards the target, or null if there is no path at all.
   A LEAD rather than the immediate neighbour: steering at one 0.25-cell node makes the hero
   judder between two keys on a diagonal run and barely progress. */
function waypoint(free, from, to, lead = 8) {
  const { prev, seed } = bfs(free, from.i, from.j);
  if (seed < 0) return null;
  let cur = to.i * N + to.j;
  if (!free[cur]) {                       // aim at the nearest free node to the requested target
    let best = -1, bd = Infinity;
    for (let i = Math.max(0, to.i - 12); i < Math.min(N, to.i + 13); i += 1) {
      for (let j = Math.max(0, to.j - 12); j < Math.min(N, to.j + 13); j += 1) {
        if (!free[i * N + j] || (prev[i * N + j] === -1 && i * N + j !== seed)) continue;
        const d = (i - to.i) ** 2 + (j - to.j) ** 2;
        if (d < bd) { bd = d; best = i * N + j; }
      }
    }
    if (best < 0) return null;
    cur = best;
  }
  if (cur !== seed && prev[cur] === -1) return null;   // unreachable
  const chain = [];
  let guard = 0;
  while (cur !== -1 && cur !== seed && guard < N * N) { chain.push(cur); cur = prev[cur]; guard += 1; }
  if (!chain.length) return { i: (seed / N) | 0, j: seed % N, remaining: 0 };
  const node = chain[Math.max(0, chain.length - lead)];
  return { i: (node / N) | 0, j: node % N, remaining: chain.length };
}

/* `#debug` prints the cell to ONE DECIMAL, i.e. to 0.1 cells = 1.6 world px, and the hero's foot
   disk is only 4 world px. So a hero standing legitimately flush against a wall -- which is exactly
   where every block test leaves her -- reads back at a rounded position the polygon calls solid.
   Measured on the placeholder run: `building mill` and `palisade holds left` both failed on that
   alone, with her plainly inside the town. Asking whether ANY point inside the rounding box is
   legal is the same question asked at the precision the readout actually carries. */
function insideish(x, y) {
  if (INSIDE(x, y)) return true;
  for (const ox of [-0.1, 0, 0.1]) {
    for (const oy of [-0.1, 0, 0.1]) if (INSIDE(x + ox, y + oy)) return true;
  }
  return false;
}

async function readCell(page) {
  const t = await page.textContent('#debug');
  const m = /cell\s+(-?[\d.]+),\s*(-?[\d.]+)/.exec(t || '');
  if (!m) throw new Error(`#debug has no cell readout: ${JSON.stringify(t)}`);
  return { x: parseFloat(m[1]), y: parseFloat(m[2]) };
}

/* Walk to a cell, re-planning every tick. Returns the final position and why it stopped.
 *
 * THE DETOUR IS NOT OPTIONAL, AND THE FIRST VERSION WITHOUT IT REPORTED A WORKING TOWN AS BROKEN.
 * Steering on the DOMINANT AXIS towards a waypoint two cells ahead points the hero straight into a
 * wall whenever the path turns a corner: she presses `left` against the building she has to go
 * AROUND, makes no progress, and the run scores "stuck". Measured on the placeholder plate, that
 * alone failed `reach healer`, `reach herbalist` and `exit fires` -- while an offline BFS on the
 * IDENTICAL grid proved all three reachable from the exact cells she stalled on. So a stall is a
 * steering artefact, not a verdict, and the harness has to clear it itself before it is allowed to
 * report anything. On a stall it holds the PERPENDICULAR direction for 700 ms, alternating sides on
 * repeats, which walks her out of the corner and lets the next re-plan take over. */
async function walkTo(page, free, target, opts = {}) {
  const tol = opts.tol ?? 0.45;
  const timeout = opts.timeout ?? 60000;
  const t0 = Date.now();
  let held = null, stalled = 0, last = null, flip = 0, detour = null, detourUntil = 0;
  try {
    for (;;) {
      const pos = await readCell(page);
      const dist = Math.hypot(pos.x - target[0], pos.y - target[1]);
      if (dist <= tol) return { pos, reason: 'arrived' };
      if (Date.now() - t0 > timeout) return { pos, reason: 'timeout' };
      if (last && Math.hypot(pos.x - last.x, pos.y - last.y) < 0.02) stalled += 1;
      else stalled = 0;
      last = pos;
      if (stalled > 80) return { pos, reason: 'stuck' };

      const from = { i: Math.round(pos.y / STEP), j: Math.round(pos.x / STEP) };
      const to = { i: Math.round(target[1] / STEP), j: Math.round(target[0] / STEP) };
      const wp = waypoint(free, from, to);
      if (!wp) return { pos, reason: 'no-path' };
      const dx = wp.j * STEP - pos.x, dy = wp.i * STEP - pos.y;
      let dir;
      if (detour && Date.now() < detourUntil) {
        dir = detour;
      } else if (stalled > 12) {
        // perpendicular to whichever axis we were pushing on, alternating sides between stalls
        const perp = Math.abs(dx) > Math.abs(dy)
          ? (flip % 2 ? ['up', 'down'] : ['down', 'up'])
          : (flip % 2 ? ['left', 'right'] : ['right', 'left']);
        dir = perp[0]; detour = dir; detourUntil = Date.now() + 700; flip += 1; stalled = 0;
      } else {
        detour = null;
        dir = Math.abs(dx) > Math.abs(dy)
          ? (dx > 0 ? 'right' : 'left') : (dy > 0 ? 'down' : 'up');
      }
      const key = ARROW[dir];
      if (key !== held) {
        if (held) await page.keyboard.up(held);
        await page.keyboard.down(key);
        held = key;
      }
      await page.waitForTimeout(80);
    }
  } finally {
    if (held) await page.keyboard.up(held);
    await page.waitForTimeout(120);
  }
}

/* Hold one key straight at something solid. No pathing, on purpose -- see the header. */
async function push(page, dir, ms) {
  const key = ARROW[dir];
  await page.keyboard.down(key);
  await page.waitForTimeout(ms);
  await page.keyboard.up(key);
  await page.waitForTimeout(150);
  return readCell(page);
}

async function shot(page, name) {
  fs.mkdirSync(OUT, { recursive: true });
  const p = path.join(OUT, name);
  await page.screenshot({ path: p });
  return p;
}

async function main() {
  const free = await buildGrid();
  fs.mkdirSync(OUT, { recursive: true });
  /* `channel: 'chrome'` -- the SYSTEM browser, exactly as verify_act1_landmark_blockers.cjs and
     verify_dungeon_arch.cjs do it. The bundled playwright chromium build in this checkout is older
     than the installed playwright-core, so the default launch dies on a missing headless shell. */
  const browser = await chromium.launch({
    headless: !HEADED, channel: 'chrome',
    args: ['--use-angle=swiftshader', '--enable-webgl', '--ignore-gpu-blocklist', '--mute-audio'],
  });
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
  page.on('console', m => { if (m.type() === 'error') console.log('    [console] ' + m.text()); });
  page.on('pageerror', e => console.log('    [pageerror] ' + e.message));

  const url = `${BASE}/act1-hifi/town.html?town=millbrook&debug`;
  console.log(`\nMILLBROOK  ${url}\n`);
  await page.goto(url, { waitUntil: 'load' });

  /* Catch the exit the moment it fires. In standalone `parent === window`, so town.html's
     postMessage to the parent lands right here. Armed BEFORE anything walks. */
  await page.evaluate(() => {
    window.__EXIT__ = [];
    window.__SERVICE__ = [];
    addEventListener('message', e => {
      if (!e.data) return;
      if (e.data.type === 'act1-town-exit') window.__EXIT__.push(e.data);
      if (e.data.type === 'act1-town-service') window.__SERVICE__.push(e.data);
    });
  });
  await page.waitForFunction(() => /cell/.test(document.querySelector('#debug')?.textContent || ''),
    { timeout: 20000 });
  await page.waitForTimeout(600);

  // ---- 1. ARRIVAL -------------------------------------------------------------------------------
  // town.html falls back to a probe when startCell is outside the geometry. Landing exactly on the
  // authored cell is the evidence that no rescue happened.
  const arrival = await readCell(page);
  const dStart = Math.hypot(arrival.x - TOWN.startCell[0], arrival.y - TOWN.startCell[1]);
  record('arrival', dStart < 0.35 && insideish(arrival.x, arrival.y),
    `spawned at ${arrival.x},${arrival.y} vs startCell ${TOWN.startCell} (drift ${dStart.toFixed(2)} cells)`);
  await shot(page, '01-arrival.png');

  // ---- 2. REACH AND TALK TO ALL FOUR NPCS -------------------------------------------------------
  // nearestNpc() only answers from the SOUTH: |dx| <= 1.1 cells and dy in [-0.35, 2.1]. So the
  // target is a cell below the NPC's feet, and the proof is the dialogue box the game opens.
  for (const npc of TOWN.npcs) {
    // The approach cell must be free ON THE PATHING GRID, not merely inside the polygon: the grid
    // carries the NPC blockers the runtime adds, and a target the pathfinder cannot stand on
    // retargets to "the nearest free node", which can be on the wrong side of the NPC.
    let best = null;
    for (let dy = 0.5; dy <= 1.8 && !best; dy += 0.25) {
      for (const dx of [0, 0.25, -0.25, 0.5, -0.5, 0.75, -0.75, 1.0, -1.0]) {
        const cx = npc.cell[0] + dx, cy = npc.cell[1] + dy;
        const gi = Math.round(cy / STEP), gj = Math.round(cx / STEP);
        if (gi >= 0 && gj >= 0 && gi < N && gj < N && free[gi * N + gj]) { best = [cx, cy]; break; }
      }
    }
    if (!best) { record(`reach ${npc.id}`, false, 'no legal approach cell south of the NPC'); continue; }

    const w = await walkTo(page, free, best);
    const near = Math.abs(w.pos.x - npc.cell[0]) <= 1.1
      && (w.pos.y - npc.cell[1]) >= -0.35 && (w.pos.y - npc.cell[1]) <= 2.1;
    record(`reach ${npc.id}`, near,
      `walked to ${w.pos.x},${w.pos.y} (target ${best[0].toFixed(2)},${best[1].toFixed(2)}, ${w.reason})`);

    const label = await page.evaluate(() => {
      const el = document.querySelector('#prompt');
      return el?.dataset.show === 'true' ? el.textContent : null;
    });
    const svcBefore = await page.evaluate(() => window.__SERVICE__.length);
    await page.keyboard.press('Space');
    await page.waitForTimeout(300);
    const dlg = await page.evaluate(() => {
      const d = document.querySelector('#dialogue');
      return d?.dataset.open === 'true'
        ? { name: d.querySelector('b').textContent, text: d.querySelector('p').textContent } : null;
    });
    /* THE HEALER IS A SERVICE, NOT A DIALOGUE BOX, AND THAT IS THE SHIPPED DESIGN.
       town.html's interact() routes `npc.id === 'healer'` to `act1-town-service` so the shipped
       scene's `handleHealer` keeps sole ownership of the full-HP check, the gold check, the price
       and the confirm overlay -- "duplicating any of that would fork the economy". Port Sapphire
       behaves identically. So the healer's proof is the SERVICE message, and asserting a dialogue
       box for her would be asserting a bug. */
    const svc = await page.evaluate(n => window.__SERVICE__.slice(n), svcBefore);
    if (npc.id === 'healer') {
      record('talk healer', svc.some(s => s.kind === 'healer' && s.town === 'millbrook'),
        `prompt ${JSON.stringify(label)} -> act1-town-service ${JSON.stringify(svc)} `
        + '(service hand-off by design, not a dialogue box)');
    } else {
      record(`talk ${npc.id}`, !!dlg && dlg.name === npc.name,
        dlg ? `prompt ${JSON.stringify(label)} -> "${dlg.name}: ${dlg.text.slice(0, 48)}..."`
            : `prompt ${JSON.stringify(label)} -> NO DIALOGUE`);
    }
    await shot(page, `02-talk-${npc.id}.png`);
    await page.keyboard.press('Space');           // close
    await page.waitForTimeout(200);
  }

  // ---- 3. THE BUILDINGS HOLD --------------------------------------------------------------------
  // Walk to open ground beside each building, then push straight into its footprint. The pass
  // condition is where the walkable authority says she ended up, not whether she looked blocked.
  for (const b of SPEC.buildings) {
    const [bx, by, bw, bh] = b.box;
    const cx = bx + bw / 2, cy = by + bh / 2;
    /* TRY ALL FOUR SIDES, because a skipped test is not evidence. The first version only ever
       stood BELOW a building and pushed up, and two of the five -- healer and granary, both close
       to the south-west palisade -- have no open ground directly below them. They were scored
       "skipped, PASS", which is a pass this harness did not earn. Whichever side has reachable
       open ground is a perfectly good place to push from. */
    const sides = [
      { dir: 'up', seat: (d) => [cx, by + bh + d] },
      { dir: 'down', seat: (d) => [cx, by - d] },
      { dir: 'right', seat: (d) => [bx - d, cy] },
      { dir: 'left', seat: (d) => [bx + bw + d, cy] },
    ];
    let seat = null, pushDir = null;
    for (const s of sides) {
      for (let d = 1.0; d <= 6.0 && !seat; d += 0.25) {
        const [sx, sy] = s.seat(d);
        const gi = Math.round(sy / STEP), gj = Math.round(sx / STEP);
        if (gi >= 0 && gj >= 0 && gi < N && gj < N && free[gi * N + gj]) { seat = [sx, sy]; pushDir = s.dir; }
      }
      if (seat) break;
    }
    if (!seat) { record(`building ${b.id} blocks`, false, 'no open ground on ANY side to push from'); continue; }
    const w = await walkTo(page, free, seat, { tol: 0.6 });
    if (Math.hypot(w.pos.x - seat[0], w.pos.y - seat[1]) > 1.8) {
      record(`building ${b.id} blocks`, false,
        `could not reach a seat beside it at ${seat[0].toFixed(1)},${seat[1].toFixed(1)} (${w.reason}, got ${w.pos.x},${w.pos.y})`);
      continue;
    }
    const end = await push(page, pushDir, 3500);
    // 0.2 cells of margin inside the footprint: flush against the south wall is the CORRECT
    // outcome, and the rounded readout can put that a tenth of a cell either side of the line.
    const inBox = end.x > bx + 0.2 && end.x < bx + bw - 0.2
      && end.y > by + 0.2 && end.y < by + bh - 0.2;
    record(`building ${b.id} blocks`, !inBox && insideish(end.x, end.y),
      `pushed ${pushDir} from ${seat[0].toFixed(1)},${seat[1].toFixed(1)} into box [${b.box}] -> stopped at ${end.x},${end.y}`);
  }

  // ---- 4. THE PALISADE HOLDS --------------------------------------------------------------------
  // Push at the wall from the plaza in each of the three non-gate directions. The ring is centred
  // on SPEC.ring with radius r; anywhere outside it that is not the south gate lane is an escape.
  /* PUSH FROM THE LANE ENDS, NOT FROM THE PLAZA.
     The walkable body is the PAVING only -- `town_layout.py --check` reports it as 16.6% of the
     frame against the ~54% the palisade encloses -- so the grass inside the wall is already solid
     and a push from the plaza centre stops at the plaza edge. Measured: radius 5.9 to 9.1 out of a
     ring radius of 27, i.e. she never got within eighteen cells of the wall. That scores PASS while
     proving nothing about the palisade. The lanes are the only thing that runs outward, so their
     far ends are the closest a player can ever get to it, and that is where the push has to start.
     The invariant being tested is the real one: the ONLY way out of the ring is the south gate. */
  const { cx: rcx, cy: rcy, r } = SPEC.ring;

  /* DERIVE THE LANE ENDS FROM THE AUTHORITY; DO NOT GUESS THEM.
     The first version used the nominal lane endpoints out of spec.json -- (50,34) for the east lane
     and so on. Those are the PLAN's centreline endpoints, and the walkable body that town_layout.py
     actually emits stops short of them: measured, (49.5,34), (49,34), (48,34) and (47,35) are all
     solid, so the harness asked the pathfinder for a cell that does not exist and scored the town
     FAIL with "no-path". The honest question is "how close to the wall can a player actually get",
     and only the reachable set can answer it. */
  const reach = (() => {
    const si = Math.round(TOWN.startCell[1] / STEP), sj = Math.round(TOWN.startCell[0] / STEP);
    const seen = new Uint8Array(N * N); const q = [si * N + sj]; seen[si * N + sj] = 1;
    while (q.length) {
      const c = q.pop(); const ci = (c / N) | 0, cj = c % N;
      for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const a = ci + di, b = cj + dj;
        if (a < 0 || b < 0 || a >= N || b >= N) continue;
        const k = a * N + b;
        if (seen[k] || !free[k]) continue;
        seen[k] = 1; q.push(k);
      }
    }
    return seen;
  })();

  /* THE CONTAINMENT INVARIANT, STATED ONCE OVER THE WHOLE REACHABLE SET.
     Every cell a player can actually stand on is inside the palisade radius EXCEPT the south gate
     corridor. This is the property "she cannot walk out through the palisade" as a measurement
     rather than as three hopeful pushes. */
  let outside = 0, outsideNotGate = [];
  for (let i = 0; i < N; i += 1) {
    for (let j = 0; j < N; j += 1) {
      if (!reach[i * N + j]) continue;
      const x = j * STEP, y = i * STEP;
      if (Math.hypot(x - rcx, y - rcy) <= r + 0.75) continue;
      outside += 1;
      if (!(Math.abs(x - rcx) <= 3.5 && y > rcy)) outsideNotGate.push([x, y]);
    }
  }
  record('only the south gate leaves the palisade', outsideNotGate.length === 0,
    `${outside} reachable nodes lie outside ring r=${r}; ${outsideNotGate.length} of them are NOT in `
    + `the south gate corridor${outsideNotGate.length ? ` e.g. ${JSON.stringify(outsideNotGate.slice(0, 4))}` : ''}`);

  const ends = [];
  for (const [name, dir, pick] of [
    ['east edge', 'right', (a, b) => a[0] > b[0]],
    ['west edge', 'left', (a, b) => a[0] < b[0]],
    ['north edge', 'up', (a, b) => a[1] < b[1]],
  ]) {
    let best = null;
    for (let i = 0; i < N; i += 1) {
      for (let j = 0; j < N; j += 1) {
        if (!reach[i * N + j]) continue;
        const p = [j * STEP, i * STEP];
        if (!best || pick(p, best)) best = p;
      }
    }
    ends.push({ name, dir, at: best });
  }
  for (const e of ends) {
    const got = await walkTo(page, free, e.at, { tol: 1.2 });
    if (Math.hypot(got.pos.x - e.at[0], got.pos.y - e.at[1]) > 2.5) {
      record(`palisade holds at ${e.name}`, false,
        `could not reach the lane end ${e.at} (${got.reason}, got ${got.pos.x},${got.pos.y})`);
      continue;
    }
    const end = await push(page, e.dir, 9000);
    const rad = Math.hypot(end.x - rcx, end.y - rcy);
    const held = insideish(end.x, end.y) && rad <= r + 0.75;
    record(`palisade holds at ${e.name}`, held,
      `pushed ${e.dir} 9s from ${e.at} -> ${end.x},${end.y}  radius ${rad.toFixed(2)} of ring r=${r}`);
    await shot(page, `03-palisade-${e.name.replace(/\s+/g, '-')}.png`);
  }

  // ---- 5. SHE CAN LEAVE -------------------------------------------------------------------------
  const ex = TOWN.exit.cell;
  const w = await walkTo(page, free, ex, { tol: 0.8, timeout: 60000 });
  await page.waitForTimeout(500);
  const exits = await page.evaluate(() => window.__EXIT__ || []);
  record('exit fires', exits.length > 0
    && exits[0].targetMapId === 'overworld' && exits[0].toX === TOWN.exit.toX && exits[0].toY === TOWN.exit.toY,
    exits.length ? `act1-town-exit ${JSON.stringify(exits[0])} at ${w.pos.x},${w.pos.y}`
                 : `NO act1-town-exit; ended at ${w.pos.x},${w.pos.y} (${w.reason})`);
  await shot(page, '04-exit.png');

  await browser.close();

  console.log('');
  const failed = results.filter(r => !r.pass);
  fs.writeFileSync(path.join(OUT, 'result.json'), JSON.stringify({ results, base: BASE }, null, 1));
  console.log(failed.length ? `MILLBROOK VERIFY FAILED: ${failed.length}/${results.length}`
                            : `MILLBROOK VERIFY PASS: ${results.length}/${results.length}`);
  return failed.length ? 1 : 0;
}

main().then(c => process.exit(c)).catch(e => { console.error('MILLBROOK VERIFY ERROR:', e); process.exit(1); });
