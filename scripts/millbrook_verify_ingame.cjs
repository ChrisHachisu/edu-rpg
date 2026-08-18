#!/usr/bin/env node
/* Walk into Millbrook FROM THE OVERWORLD, in the real build, and walk back out.
 *
 * WHAT THIS ADDS OVER scripts/millbrook_verify.cjs
 *   That script opens `town.html?town=millbrook` directly. It proves the town is playable; it
 *   cannot prove the town is REACHABLE, because nothing in it goes through the overworld, the
 *   landmark door, `TOWN_IDS`, or the adapter that mounts the iframe. Build 44 shipped three
 *   dungeons whose masks read fine and which no body could enter -- the artefact is not the game.
 *   So this seeds a save on the open ground south of Millbrook's door, pushes north with a real
 *   arrow key, and requires the town to actually come up.
 *
 * THE HERO POSITION COMES FROM `window.__ACT1_TOWN_VIEW__`, NOT FROM `#debug`.
 *   The adapter does not forward `?debug` into the town frame (`FORWARDED_QUERY` carries act1Demo,
 *   act1PathDebug, act1StartProbe and act1EdgeDemo, and nothing else), so the frame's debug readout
 *   is empty in-game. `publishTownView()` republishes `runtime.position()` onto the parent every
 *   tick for the field HUD, which is the same number at FULL precision rather than rounded to a
 *   tenth of a cell. Reading it is both possible and strictly better.
 *
 * KEYS GO TO THE FRAME, AND THE PARENT WILL NOT DO IT FOR YOU.
 *   adapter.js forwards MOVE_KEYS into the frame only while `activeMapId === 'overworld'`. Inside a
 *   town the frame listens on its own window, so the frame has to hold focus. The overworld leg
 *   therefore types at the page and the town leg types at the focused frame.
 *
 * USAGE
 *   python3 -m http.server 5174 --directory dist   # NEVER `serve -s dist`: it rewrites modules
 *   node scripts/millbrook_verify_ingame.cjs [url] [--out DIR]
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

const ROOT = path.join(__dirname, '..');
const args = process.argv.slice(2);
const BASE = (args.find(a => !a.startsWith('--')) || 'http://127.0.0.1:5174/').replace(/\/$/, '');
const oi = args.indexOf('--out');
const OUT = oi >= 0 ? args[oi + 1] : path.join(ROOT, 'design/act1-towns/millbrook/proof-ingame');

const TOWN = JSON.parse(fs.readFileSync(path.join(ROOT, 'public/act1-hifi/town/millbrook-town.json'), 'utf8'));
const CELL = TOWN.worldPxPerCell;
const STEP = 0.25, N = Math.round(65 / STEP), NPC_BLOCK_RADIUS = 7;
const ARROW = { left: 'ArrowLeft', right: 'ArrowRight', up: 'ArrowUp', down: 'ArrowDown' };

/* The millbrook landmark in public/act1-world-map.js:
   {"mapId":"millbrook","at":{"x":39,"y":344},"exit":{"x":39,"y":345}} -- the door tile and the open
   ground immediately south of it. The save is seeded on the exit tile and pushed north at the door. */
const DOOR = { x: 39, y: 344 };
const OUTSIDE = { x: 39, y: 345 };

const results = [];
function record(name, pass, detail) {
  results.push({ name, pass, detail });
  console.log(`  ${pass ? 'PASS' : 'FAIL'}  ${name}  ${detail}`);
}

let INSIDE = null;
async function buildGrid() {
  const M = await import('../public/act1-hifi/walkable-polygons.js');
  const data = JSON.parse(fs.readFileSync(
    path.join(ROOT, 'public/act1-hifi/town/millbrook-walkable.json'), 'utf8'));
  data.dynamicBlockers = [
    ...(data.dynamicBlockers || []),
    ...TOWN.npcs.map(n => {
      const p = { x: n.cell[0] * CELL, y: n.cell[1] * CELL };
      return { id: `npc-${n.id}`, from: p, to: p, halfWidth: NPC_BLOCK_RADIUS };
    }),
  ];
  INSIDE = (cx, cy) => M.isInsideWalkable({ x: cx * CELL, y: cy * CELL }, data);
  const free = new Uint8Array(N * N);
  for (let i = 0; i < N; i += 1) {
    for (let j = 0; j < N; j += 1) free[i * N + j] = INSIDE(j * STEP, i * STEP) ? 1 : 0;
  }
  return free;
}

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

function waypoint(free, from, to, lead = 8) {
  const { prev, seed } = bfs(free, from.i, from.j);
  if (seed < 0) return null;
  let cur = to.i * N + to.j;
  if (!free[cur] || (cur !== seed && prev[cur] === -1)) {
    let best = -1, bd = Infinity;
    for (let i = Math.max(0, to.i - 16); i < Math.min(N, to.i + 17); i += 1) {
      for (let j = Math.max(0, to.j - 16); j < Math.min(N, to.j + 17); j += 1) {
        const k = i * N + j;
        if (!free[k] || (k !== seed && prev[k] === -1)) continue;
        const d = (i - to.i) ** 2 + (j - to.j) ** 2;
        if (d < bd) { bd = d; best = k; }
      }
    }
    if (best < 0) return null;
    cur = best;
  }
  const chain = [];
  let guard = 0;
  while (cur !== -1 && cur !== seed && guard < N * N) { chain.push(cur); cur = prev[cur]; guard += 1; }
  if (!chain.length) return { i: (seed / N) | 0, j: seed % N };
  const node = chain[Math.max(0, chain.length - lead)];
  return { i: (node / N) | 0, j: node % N };
}

const townCell = page => page.evaluate(() => {
  const v = window.__ACT1_TOWN_VIEW__;
  if (!v) return null;
  return { x: v.hero.x / v.cellPx, y: v.hero.y / v.cellPx };
});

const focusFrame = page => page.evaluate(() => {
  const f = document.querySelector('#act1-hifi-preserved-root iframe');
  if (!f) throw new Error('the town frame is not mounted');
  f.contentWindow.focus();
});

async function walkTo(page, free, target, opts = {}) {
  const tol = opts.tol ?? 0.5;
  const timeout = opts.timeout ?? 60000;
  const t0 = Date.now();
  let held = null, stalled = 0, last = null, flip = 0, detour = null, detourUntil = 0;
  await focusFrame(page);
  try {
    for (;;) {
      const pos = await townCell(page);
      if (!pos) return { pos: last, reason: 'town-unmounted' };
      if (Math.hypot(pos.x - target[0], pos.y - target[1]) <= tol) return { pos, reason: 'arrived' };
      if (Date.now() - t0 > timeout) return { pos, reason: 'timeout' };
      if (last && Math.hypot(pos.x - last.x, pos.y - last.y) < 0.02) stalled += 1; else stalled = 0;
      last = pos;
      if (stalled > 80) return { pos, reason: 'stuck' };

      const wp = waypoint(free,
        { i: Math.round(pos.y / STEP), j: Math.round(pos.x / STEP) },
        { i: Math.round(target[1] / STEP), j: Math.round(target[0] / STEP) });
      if (!wp) return { pos, reason: 'no-path' };
      const dx = wp.j * STEP - pos.x, dy = wp.i * STEP - pos.y;
      let dir;
      if (detour && Date.now() < detourUntil) dir = detour;
      else if (stalled > 12) {
        const perp = Math.abs(dx) > Math.abs(dy)
          ? (flip % 2 ? ['up', 'down'] : ['down', 'up'])
          : (flip % 2 ? ['left', 'right'] : ['right', 'left']);
        dir = perp[0]; detour = dir; detourUntil = Date.now() + 700; flip += 1; stalled = 0;
      } else { detour = null; dir = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : (dy > 0 ? 'down' : 'up'); }
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
      activeQuests: ['drakeCargo', 'owlsLesson'], completedQuests: [], questProgress: {},
      timerEnabled: false, quizDifficulty: '3', locale: 'en', soundEnabled: false,
      masterVolume: 0, kanjiMode: false,
    },
    playtime: 0, quizStats: {},
  };
}

async function enterSavedGame(page, save) {
  await page.evaluate(s => localStorage.setItem('edu-rpg-save', JSON.stringify(s)), save);
  await page.reload({ waitUntil: 'load' });
  await page.waitForFunction(() => !!window.__PHASER_GAME__, { timeout: 20000 });
  await page.evaluate(() => {
    const g = window.__PHASER_GAME__;
    if (g.scene.isActive('BootScene')) { g.scene.start('TitleScene'); g.scene.stop('BootScene'); }
  });
  await page.waitForFunction(() => {
    const g = window.__PHASER_GAME__, t = g && g.scene.getScene('TitleScene');
    return t && g.scene.isActive('TitleScene') && t.menuItems?.length > 0;
  }, { timeout: 12000 });
  await page.evaluate(() => {
    const t = window.__PHASER_GAME__.scene.getScene('TitleScene');
    const i = t.menuItems.findIndex(m => m.getData?.('action') === 'continue');
    if (i < 0) throw new Error('continue unavailable');
    t.selectedIndex = i; t.confirmTitle();
  });
  await page.waitForFunction(() => window.__PHASER_GAME__.scene.isActive('WorldMapScene'), { timeout: 15000 });
  // The baked walk field arrives over XHR; until it does the override's stepper exits immediately
  // and the BASE tile stepper runs instead, which reads scene.cursors and never moves the hero.
  await page.waitForFunction(() => {
    const w = window.__PHASER_GAME__.scene.getScene('WorldMapScene');
    return w && w.currentMapId === 'overworld' && !!window.__ACT1_WORLD_MAP__
      && window.__ACT1_WORLD_MAP__.state.appliedMap === w.mapData;
  }, { timeout: 15000 });
  await page.waitForTimeout(1200);
}

const mapId = page => page.evaluate(() =>
  window.__PHASER_GAME__.scene.getScene('WorldMapScene')?.currentMapId);

async function shot(page, name) {
  fs.mkdirSync(OUT, { recursive: true });
  await page.screenshot({ path: path.join(OUT, name) });
}

async function main() {
  const free = await buildGrid();
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch({
    headless: true, channel: 'chrome',
    args: ['--use-angle=swiftshader', '--enable-webgl', '--ignore-gpu-blocklist', '--mute-audio'],
  });
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
  page.on('pageerror', e => console.log('    [pageerror] ' + e.message));

  console.log(`\nMILLBROOK IN-GAME  ${BASE}\n`);
  await page.goto(`${BASE}/`, { waitUntil: 'load' });
  await enterSavedGame(page, baseSave(OUTSIDE.x, OUTSIDE.y));
  record('seeded on the overworld', (await mapId(page)) === 'overworld',
    `currentMapId ${await mapId(page)} at overworld tile ${OUTSIDE.x},${OUTSIDE.y}`);
  await shot(page, '01-outside-the-door.png');

  // ---- WALK NORTH INTO THE DOOR ----------------------------------------------------------------
  await page.keyboard.down('ArrowUp');
  const deadline = Date.now() + 8000;
  for (;;) {
    await page.waitForTimeout(120);
    if (Date.now() > deadline) break;
    // eslint-disable-next-line no-await-in-loop
    if ((await mapId(page)) === 'millbrook') break;
  }
  await page.keyboard.up('ArrowUp');
  await page.waitForTimeout(800);
  record('the door opens Millbrook', (await mapId(page)) === 'millbrook',
    `pushed north at the door tile ${DOOR.x},${DOOR.y}; currentMapId is now ${await mapId(page)}`);

  // ---- THE OVERLAY MOUNTS AND SHE ARRIVES ON HER OWN START CELL --------------------------------
  await page.waitForFunction(() => !!window.__ACT1_TOWN_VIEW__, { timeout: 20000 }).catch(() => {});
  await page.waitForTimeout(1200);
  const view = await page.evaluate(() => window.__ACT1_TOWN_VIEW__ && {
    id: window.__ACT1_TOWN_VIEW__.id, cells: window.__ACT1_TOWN_VIEW__.cells,
  });
  record('the hi-fi town overlay mounts', !!view && view.id === 'millbrook',
    `__ACT1_TOWN_VIEW__ ${JSON.stringify(view)}`);
  const at = await townCell(page);
  const drift = at ? Math.hypot(at.x - TOWN.startCell[0], at.y - TOWN.startCell[1]) : Infinity;
  record('arrives inside, on startCell', drift < 0.35 && INSIDE(at.x, at.y),
    at ? `arrived at ${at.x.toFixed(2)},${at.y.toFixed(2)} vs startCell ${TOWN.startCell} (drift ${drift.toFixed(2)})`
       : 'no town view to read a position from');
  await shot(page, '02-arrived-inside.png');

  // ---- REACH AND TALK TO ALL FOUR, IN THE REAL GAME ---------------------------------------------
  for (const npc of TOWN.npcs) {
    let best = null;
    for (let dy = 0.5; dy <= 1.8 && !best; dy += 0.25) {
      for (const dx of [0, 0.25, -0.25, 0.5, -0.5, 0.75, -0.75, 1.0, -1.0]) {
        const cx = npc.cell[0] + dx, cy = npc.cell[1] + dy;
        const gi = Math.round(cy / STEP), gj = Math.round(cx / STEP);
        if (gi >= 0 && gj >= 0 && gi < N && gj < N && free[gi * N + gj]) { best = [cx, cy]; break; }
      }
    }
    const w = await walkTo(page, free, best);
    const near = w.pos && Math.abs(w.pos.x - npc.cell[0]) <= 1.1
      && (w.pos.y - npc.cell[1]) >= -0.35 && (w.pos.y - npc.cell[1]) <= 2.1;
    record(`reach ${npc.id}`, !!near,
      w.pos ? `walked to ${w.pos.x.toFixed(2)},${w.pos.y.toFixed(2)} (${w.reason})` : `no position (${w.reason})`);

    await focusFrame(page);
    await page.keyboard.press('Space');
    await page.waitForTimeout(400);
    /* The healer is a SERVICE, not a dialogue box: town.html hands `healer` to the shipped scene so
       `handleHealer` keeps sole ownership of the heal flow. In-game that hand-off is the parent
       ACTING on it, so the evidence is the game's own dialogue/overlay, read from the frame. */
    const dlg = await page.evaluate(() => {
      const f = document.querySelector('#act1-hifi-preserved-root iframe');
      const d = f?.contentDocument?.querySelector('#dialogue');
      return d?.dataset.open === 'true'
        ? { name: d.querySelector('b').textContent, text: d.querySelector('p').textContent } : null;
    });
    const healerHandled = npc.id === 'healer'
      ? await page.evaluate(() => document.body.classList.contains('qok-dialogue')
          || !!document.querySelector('.qok-confirm, #qok-dialogue, .qok-dialogue')) : false;
    record(`talk ${npc.id}`, npc.id === 'healer' ? (!!dlg || healerHandled) : (!!dlg && dlg.name === npc.name),
      dlg ? `"${dlg.name}: ${dlg.text.slice(0, 44)}..."`
          : npc.id === 'healer' ? `healer service hand-off taken by the parent: ${healerHandled}`
          : 'NO DIALOGUE');
    await shot(page, `03-talk-${npc.id}.png`);
    await focusFrame(page);
    await page.keyboard.press('Space');
    await page.waitForTimeout(250);
  }

  // ---- A BUILDING AND THE PALISADE STILL HOLD, IN-GAME -------------------------------------------
  // The exhaustive five-building / three-edge sweep is scripts/millbrook_verify.cjs's job; this is
  // the integration spot-check that collision is live under the adapter too.
  const granary = [50.0, 41.0];
  await walkTo(page, free, granary, { tol: 0.8 });
  await focusFrame(page);
  await page.keyboard.down('ArrowDown');
  await page.waitForTimeout(3500);
  await page.keyboard.up('ArrowDown');
  await page.waitForTimeout(250);
  const gp = await townCell(page);
  const inGranary = gp && gp.x > 44.2 && gp.x < 55.8 && gp.y > 42.2 && gp.y < 50.8;
  record('granary still blocks in-game', !!gp && !inGranary,
    gp ? `pushed down into box [44,42,12,9] -> stopped at ${gp.x.toFixed(2)},${gp.y.toFixed(2)}` : 'no position');

  // ---- SHE CAN LEAVE, AND LANDS BACK ON THE OVERWORLD -------------------------------------------
  const w = await walkTo(page, free, TOWN.exit.cell, { tol: 0.8, timeout: 70000 });
  await page.waitForTimeout(1500);
  const after = await mapId(page);
  record('exit returns her to the overworld', after === 'overworld',
    `left at ${w.pos ? `${w.pos.x.toFixed(2)},${w.pos.y.toFixed(2)}` : '?'} (${w.reason}); currentMapId ${after}`);
  const back = await page.evaluate(() => {
    const s = window.__PHASER_GAME__.scene.getScene('WorldMapScene');
    return { tx: s.heroTileX, ty: s.heroTileY };
  });
  record('lands beside the door', back.tx === TOWN.exit.toX && back.ty === TOWN.exit.toY,
    `heroTile ${back.tx},${back.ty} vs exit.toX/toY ${TOWN.exit.toX},${TOWN.exit.toY}`);
  await shot(page, '04-back-outside.png');

  await browser.close();
  const failed = results.filter(r => !r.pass);
  fs.writeFileSync(path.join(OUT, 'result.json'), JSON.stringify({ results, base: BASE }, null, 1));
  console.log('');
  console.log(failed.length ? `MILLBROOK IN-GAME FAILED: ${failed.length}/${results.length}`
                            : `MILLBROOK IN-GAME PASS: ${results.length}/${results.length}`);
  return failed.length ? 1 : 0;
}

main().then(c => process.exit(c)).catch(e => { console.error('MILLBROOK IN-GAME ERROR:', e); process.exit(1); });
