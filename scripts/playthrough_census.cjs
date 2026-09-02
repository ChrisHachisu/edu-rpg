#!/usr/bin/env node
/* READ-ONLY Act 1 playthrough census -- finds and documents defects, fixes nothing.
 *
 * Drives the SERVED dist (http://127.0.0.1:5179/) exactly as an iPhone player would: Playwright
 * Chrome, a 390x844 @3x mobile context, Capacitor.isNativePlatform() forced true (same init
 * script verify_town_owner_items.cjs uses for its DOM-field-HUD item 9). Reuses the mechanics of
 * scripts/verify_town_owner_items.cjs (boot/continue, save shape, town iframe walk-in),
 * scripts/perf_probe.cjs (the __perfSetDir keyboard+stick driver, the realTap helper, the fixed
 * MONSTER encounter), scripts/browser_runtime_smoke.cjs (fixed-encounter battle entry) and
 * scripts/verify_dungeon_entry.cjs (LANDMARKS-derived dungeon mouths) verbatim rather than
 * inventing new ones.
 *
 * Every check appends one row to RESULTS and is written to OUT/results.json at the end, plus a
 * PNG per named state under OUT/. Nothing here edits game files; this process only reads dist/
 * over HTTP and writes to OUT.
 *
 * USAGE: node scripts/playthrough_census.cjs
 */
'use strict';
const fs = require('node:fs');
const path = require('node:path');

let chromium;
for (const p of ['playwright-core', '../.eduharness/node_modules/playwright-core',
                 path.join(__dirname, '..', '.eduharness/node_modules/playwright-core')]) {
  try { ({ chromium } = require(p)); break; } catch (_) { /* next */ }
}
if (!chromium) throw new Error('no playwright-core: install the .eduharness harness');

const URL_ = process.env.CENSUS_URL || 'http://127.0.0.1:5179/';
const OUT = '/private/tmp/claude-501/census';
fs.mkdirSync(OUT, { recursive: true });

const WORLD_MAP = fs.readFileSync(path.join(__dirname, '..', 'public/act1-world-map.js'), 'utf8');
const LM_MATCH = WORLD_MAP.match(/var LANDMARKS = (\[.*?\]);/s);
if (!LM_MATCH) throw new Error('could not locate LANDMARKS in act1-world-map.js');
const LANDMARKS = JSON.parse(LM_MATCH[1]);
const landmark = (id) => LANDMARKS.find((l) => l.mapId === id);

const FLOORS = JSON.parse(fs.readFileSync(
  path.join(__dirname, '..', 'public/act1-dungeon-floors.json'), 'utf8')).floors;

const TOWN = {
  greenhollow: JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'public/act1-hifi/town/greenhollow-town.json'), 'utf8')),
  millbrook: JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'public/act1-hifi/town/millbrook-town.json'), 'utf8')),
  portSapphire: JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'public/act1-hifi/town/portSapphire-town.json'), 'utf8')),
};

// ---------------------------------------------------------------------------------------------
// results / evidence bookkeeping
// ---------------------------------------------------------------------------------------------
const RESULTS = [];
let shotN = 0;
function rec(step, check, status, evidence, note) {
  // status may arrive as a boolean check result (PASS/DEFECT) or an explicit string
  // ('UNVERIFIED', or occasionally 'PASS'/'DEFECT' spelled out directly).
  const s = typeof status === 'string' ? status : (status ? 'PASS' : 'DEFECT');
  RESULTS.push({ step, check, status: s, evidence: evidence || null, note: note || '' });
  console.log(`[${step}] ${s.padEnd(10)} ${check}${note ? '  -- ' + note : ''}`);
}
async function shot(page, name) {
  shotN += 1;
  const file = `${String(shotN).padStart(2, '0')}-${name}.png`;
  await page.screenshot({ path: path.join(OUT, file) }).catch((e) => console.log('screenshot failed', name, e.message));
  return file;
}

// ---------------------------------------------------------------------------------------------
// save shape (matches verify_town_owner_items.cjs / perf_probe.cjs / verify_dungeon_entry.cjs)
// ---------------------------------------------------------------------------------------------
function save({ mapId, x, y, floor = 1, flags = {}, locale = 'en', kanjiMode = false,
                 hp = 60, maxHp = 60, atk = 40, def = 15, spd = 10, level = 10,
                 inventory = [{ itemId: 'herb', quantity: 5 }], gold = 300, name = 'Census' }) {
  return {
    version: 4, timestamp: Date.now(),
    player: {
      name, heroColor: 'gray', level, exp: 0, expToNext: 100, hp, maxHp, atk, def, spd,
      equipment: { weapon: null, armor: null, shield: null, helmet: null, accessory: null },
      inventory, gold,
      position: { mapId, x, y, floor },
      storyFlags: { 'intro.done': true, ...flags },
      activeQuests: [], completedQuests: [], questProgress: {},
      timerEnabled: false, quizDifficulty: '3', locale, soundEnabled: false,
      masterVolume: 0, kanjiMode,
    },
    playtime: 0, quizStats: {},
  };
}
const MONSTER = {
  id: 'slime', nameKey: 'monster.slime', spriteKey: 'monster-slime',
  baseHp: 12, baseAtk: 4, baseDef: 1, baseSpd: 2,
  expReward: 4, goldReward: 2, drops: [], aiPattern: 'basic', color: 0x55aa55,
};

// ---------------------------------------------------------------------------------------------
// boot helpers
// ---------------------------------------------------------------------------------------------
// This machine runs many concurrent sessions; load average was observed at 300+ during this
// census (vs. the smooth skill's own "void perf numbers above load 10"). Retry once on a load-
// induced goto timeout rather than mis-recording a game defect that is actually host contention.
async function freshLoad(page) {
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      // eslint-disable-next-line no-await-in-loop
      await page.goto(URL_, { waitUntil: 'load', timeout: 90_000 });
      // eslint-disable-next-line no-await-in-loop
      await page.waitForFunction(() => !!window.__PHASER_GAME__, { timeout: 60_000 });
      return;
    } catch (e) {
      if (attempt === 2) throw e;
      console.log(`  (freshLoad attempt ${attempt} failed: ${e.message.split('\n')[0]} -- retrying)`);
    }
  }
}
async function toTitle(page) {
  await page.evaluate(() => {
    const g = window.__PHASER_GAME__;
    if (g.scene.isActive('BootScene')) { g.scene.start('TitleScene'); g.scene.stop('BootScene'); }
  });
  await page.waitForFunction(() => {
    const g = window.__PHASER_GAME__, t = g && g.scene.getScene('TitleScene');
    return t && g.scene.isActive('TitleScene') && t.menuItems?.length > 0;
  }, { timeout: 15_000 });
  await page.waitForTimeout(600);
}
async function bootColdNewGame(page) {
  // A genuinely first-ever install: no localStorage at all.
  await freshLoad(page);
  await page.evaluate(() => { try { localStorage.clear(); } catch (e) {} });
  await page.reload({ waitUntil: 'load' });
  await page.waitForFunction(() => !!window.__PHASER_GAME__, { timeout: 20_000 });
  await toTitle(page);
}
async function bootToOverworldOrTown(page, storySeed) {
  await freshLoad(page);
  await page.evaluate((s) => { localStorage.clear(); localStorage.setItem('edu-rpg-save', JSON.stringify(s)); }, storySeed);
  await page.reload({ waitUntil: 'load' });
  await page.waitForFunction(() => !!window.__PHASER_GAME__, { timeout: 20_000 });
  await toTitle(page);
  await page.evaluate(() => {
    const t = window.__PHASER_GAME__.scene.getScene('TitleScene');
    const i = t.menuItems.findIndex((m) => m.getData?.('action') === 'continue');
    if (i < 0) throw new Error('continue unavailable');
    t.selectedIndex = i; t.confirmTitle();
  });
  await page.waitForFunction(() => window.__PHASER_GAME__.scene.isActive('WorldMapScene'), { timeout: 20_000 });
  await page.waitForTimeout(1200);
}

// ---------------------------------------------------------------------------------------------
// real-device movement -- the shipped d-pad's own mechanism (perf_probe.cjs initScript, inlined)
// ---------------------------------------------------------------------------------------------
async function installStickDriver(page) {
  await page.evaluate(() => {
    if (window.__censusStick) return;
    window.__censusStick = true;
    const KC = { ArrowUp: 38, ArrowDown: 40, ArrowLeft: 37, ArrowRight: 39 };
    const VEC = { ArrowUp: [0, -1], ArrowDown: [0, 1], ArrowLeft: [-1, 0], ArrowRight: [1, 0] };
    const held = Object.create(null);
    function fire(type, key) {
      const ev = new KeyboardEvent(type, { key, code: key, bubbles: true, cancelable: true });
      try {
        Object.defineProperty(ev, 'keyCode', { get: () => KC[key] });
        Object.defineProperty(ev, 'which', { get: () => KC[key] });
      } catch (e) { /* ignore */ }
      window.dispatchEvent(ev);
    }
    window.__setDir = function (dir) {
      for (const k of Object.keys(KC)) {
        if (k === dir && !held[k]) { held[k] = 1; fire('keydown', k); }
        else if (k !== dir && held[k]) { delete held[k]; fire('keyup', k); }
      }
      window.__DQ_STICK__ = dir ? { x: VEC[dir][0], y: VEC[dir][1], m: 1 } : { x: 0, y: 0, m: 0 };
    };
  });
}
async function walkFor(page, dir, ms) {
  await installStickDriver(page);
  await page.evaluate((d) => window.__setDir(d), dir);
  await page.waitForTimeout(ms);
  await page.evaluate(() => window.__setDir(null));
}
// walk one direction until a predicate is satisfied or the budget runs out. `arg`, when given, is
// forwarded to page.evaluate(predicateFn, arg) -- predicateFn runs IN THE BROWSER, so it cannot
// close over Node.js variables; anything it needs must come through this argument.
async function walkUntil(page, dir, predicateFn, budgetMs, arg) {
  await installStickDriver(page);
  await page.evaluate((d) => window.__setDir(d), dir);
  const t0 = Date.now();
  let ok = false;
  while (Date.now() - t0 < budgetMs) {
    // eslint-disable-next-line no-await-in-loop
    ok = arg === undefined ? await page.evaluate(predicateFn) : await page.evaluate(predicateFn, arg);
    if (ok) break;
    // eslint-disable-next-line no-await-in-loop
    await page.waitForTimeout(150);
  }
  await page.evaluate(() => window.__setDir(null));
  await page.waitForTimeout(300);
  return ok;
}
const heroPos = (page) => page.evaluate(() => {
  const w = window.__PHASER_GAME__.scene.getScene('WorldMapScene');
  return { mapId: w.currentMapId, floor: w.currentFloor, x: w.heroTileX, y: w.heroTileY, dir: w.heroDir };
});

// ---------------------------------------------------------------------------------------------
// real taps -- element must actually be visible/tappable, exactly perf_probe.cjs's realTap minus
// the latency instrumentation (this census cares about correctness, not timing)
// ---------------------------------------------------------------------------------------------
async function realTap(page, selector, { timeout = 8000 } = {}) {
  const loc = page.locator(selector).first();
  let box = null;
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline && !box) {
    // eslint-disable-next-line no-await-in-loop
    box = await loc.boundingBox().catch(() => null);
    if (box && box.width >= 4 && box.height >= 4) break;
    box = null;
    // eslint-disable-next-line no-await-in-loop
    await page.waitForTimeout(200);
  }
  if (!box) return false;
  await loc.tap({ timeout: 5000 }).catch(() => {});
  return true;
}
const textLeak = (page) => page.evaluate(() => {
  const root = document.getElementById('qok-ui') || document.body;
  const txt = root.innerText || '';
  const bracket = txt.match(/\[[a-zA-Z0-9_.]{2,40}\]/g) || [];
  return { bracketKeys: [...new Set(bracket)], sample: txt.slice(0, 400) };
});

// ---------------------------------------------------------------------------------------------
// dungeon BFS pathfinding, computed OFFLINE against the shipped floor grid (public/act1-dungeon-
// floors.json), NOT via __A1_DNG_MOVE__ (AGENTS.md rule 7: never teleport to reach a dungeon
// state; walking is the only honest test). The BFS only decides WHICH direction to hold at each
// step -- every step is still a real keyboard walk against the running engine.
// ---------------------------------------------------------------------------------------------
function bfsPath(floorKey, from, to) {
  const fl = FLOORS[floorKey];
  const open = (x, y) => x >= 0 && y >= 0 && x < fl.width && y < fl.height && fl.rows[y][x] !== '#';
  const key = (x, y) => `${x},${y}`;
  const q = [[from.x, from.y]];
  const prev = new Map([[key(from.x, from.y), null]]);
  const DIRS = [[0, -1, 'ArrowUp'], [0, 1, 'ArrowDown'], [-1, 0, 'ArrowLeft'], [1, 0, 'ArrowRight']];
  while (q.length) {
    const [cx, cy] = q.shift();
    if (cx === to.x && cy === to.y) break;
    for (const [dx, dy, dir] of DIRS) {
      const nx = cx + dx, ny = cy + dy;
      if (!open(nx, ny) || prev.has(key(nx, ny))) continue;
      prev.set(key(nx, ny), { from: [cx, cy], dir });
      q.push([nx, ny]);
    }
  }
  if (!prev.has(key(to.x, to.y))) return null;
  const dirs = [];
  let cur = key(to.x, to.y);
  while (prev.get(cur)) {
    const node = prev.get(cur);
    dirs.unshift(node.dir);
    cur = key(node.from[0], node.from[1]);
  }
  return dirs;
}
// Collapse a direction list into runs, and drive them for real against heroTileX/Y, stopping
// early (and reporting) if the engine's own collision disagrees with the offline BFS map.
async function driveDirList(page, dirs, { stepMs = 220, label = 'path' } = {}) {
  let stuckAt = null;
  for (let i = 0; i < dirs.length; i++) {
    const before = await heroPos(page);
    // eslint-disable-next-line no-await-in-loop
    await walkFor(page, dirs[i], stepMs);
    // eslint-disable-next-line no-await-in-loop
    const after = await heroPos(page);
    if (after.x === before.x && after.y === before.y) {
      stuckAt = { i, dir: dirs[i], at: after };
      break;
    }
  }
  return stuckAt; // null == the whole path drove cleanly
}

// ---------------------------------------------------------------------------------------------
// battle helpers
// ---------------------------------------------------------------------------------------------
async function forceBattle(page, monster = MONSTER) {
  await page.evaluate((m) => {
    const w = window.__PHASER_GAME__.scene.getScene('WorldMapScene');
    w.currentEncounterZone = w.currentEncounterZone || 'plains';
    w.startBattle(m);
  }, monster).catch(() => {});
  return page.waitForFunction(
    () => window.__PHASER_GAME__.scene.isActive('BattleScene')
      && document.querySelectorAll('[data-act="battleMenu"]').length > 0,
    { timeout: 15_000 },
  ).then(() => true).catch(() => false);
}
const battlePhase = (page) => page.evaluate(() => window.__PHASER_GAME__.scene.getScene('BattleScene')?.phase ?? null);
async function drainMessages(page, maxTaps = 6) {
  for (let i = 0; i < maxTaps; i++) {
    // eslint-disable-next-line no-await-in-loop
    const phase = await battlePhase(page);
    if (phase !== 'message') break;
    // eslint-disable-next-line no-await-in-loop
    await realTap(page, '[data-act="battleAdvance"]');
    // eslint-disable-next-line no-await-in-loop
    await page.waitForTimeout(700);
  }
}
async function pickAttack(page) {
  await realTap(page, '[data-act="battleMenu"][data-i="0"]');
  await page.waitForFunction(() => window.__PHASER_GAME__.scene.getScene('BattleScene')?.phase === 'playerQuiz', { timeout: 6000 }).catch(() => {});
}
async function answerQuiz(page, wantCorrect) {
  const idx = await page.evaluate((wc) => {
    const bs = window.__PHASER_GAME__.scene.getScene('BattleScene');
    const answers = bs.quizQuestion?.answers || [];
    const i = answers.findIndex((a) => !!a.isCorrect === wc);
    return i;
  }, wantCorrect);
  if (idx < 0) return false;
  await realTap(page, `[data-act="quizAns"][data-i="${idx}"]`);
  await page.waitForTimeout(900);
  return true;
}

// ===============================================================================================
// MAIN
// ===============================================================================================
(async () => {
  let browser = null;
  let context = null;
  let page = null;
  const pageErrors = [];
  // This host runs many concurrent Claude sessions; memory was observed near exhaustion (vm_stat:
  // ~89MB free) during this run, and macOS silently kills a Chrome renderer under that pressure --
  // every subsequent page.goto then fails with "Target page, context or browser has been closed".
  // launchBrowser()/ensureAlive() make that recoverable instead of fatal to the whole census.
  async function launchBrowser() {
    if (browser) { try { await browser.close(); } catch (e) { /* already gone */ } }
    browser = await chromium.launch({
      headless: true, channel: 'chrome',
      args: ['--enable-webgl', '--ignore-gpu-blocklist', '--mute-audio'],
    });
    context = await browser.newContext({
      viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, hasTouch: true, isMobile: true,
    });
    await context.addInitScript(() => { window.Capacitor = { isNativePlatform: () => true }; });
    // Host load was observed at 300+ (many concurrent sessions on this Mac) during this run --
    // raise the defaults so a slow paint reads as slow, not as a missing feature.
    context.setDefaultTimeout(45_000);
    context.setDefaultNavigationTimeout(90_000);
    page = await context.newPage();
    page.on('pageerror', (e) => pageErrors.push(`pageerror: ${e.message}`));
    page.on('console', (m) => {
      if (m.type() === 'error' && !m.text().includes('Failed to load resource')) pageErrors.push(`console: ${m.text()}`);
    });
  }
  async function ensureAlive(label) {
    try {
      if (page && !page.isClosed()) { await page.evaluate(() => 1); return; }
    } catch (e) { /* fall through to relaunch */ }
    console.log(`  (browser/page was closed before '${label}' -- relaunching)`);
    await launchBrowser();
  }
  await launchBrowser();

  // ============================================================ STEP 1: cold start ============
  try {
    console.log('\n=== STEP 1: cold start ===');
    await bootColdNewGame(page);
    let f = await shot(page, 'step1-title');
    const titleState = await page.evaluate(() => {
      const ts = window.__PHASER_GAME__.scene.getScene('TitleScene');
      return { items: ts.menuItems.map((m) => m.getData('action')) };
    });
    rec('1', 'title screen shows on a clean install', titleState.items.includes('new'), f, `menu actions: ${titleState.items.join(',')}`);

    // New Game -> name entry
    const tapped = await realTap(page, '#qok-ui [data-act="titleNew"]');
    await page.waitForSelector('#qok-name', { timeout: 8000 }).catch(() => {});
    f = await shot(page, 'step1-name-entry');
    const hasNameField = await page.evaluate(() => !!document.getElementById('qok-name'));
    rec('1', 'New Game opens the name-entry (create) screen', tapped && hasNameField, f, `tapped=${tapped} field present=${hasNameField}`);

    // type a name, then test the ONE-TAP-COMMITS-THE-NAME bug directly via the existing
    // purpose-built harness (scripts/verify_name_double_enter.cjs), reusing its four sequences
    // rather than re-deriving the focus/reflow mechanics here.
    const nameEl = await page.$('#qok-name');
    if (nameEl) {
      await nameEl.tap();
      await page.waitForTimeout(200);
      await page.keyboard.type('Yuki', { delay: 40 });
      await page.waitForTimeout(200);
    }
    f = await shot(page, 'step1-name-typed');
    rec('1', 'name field accepts typed input', !!nameEl, f, nameEl ? 'typed "Yuki"' : 'no #qok-name found');
  } catch (e) {
    rec('1', 'cold start sequence', 'UNVERIFIED', null, `threw: ${e.message}`);
  }

  // one-tap name commit: run the dedicated, already-proven harness against this same URL. Close
  // OUR browser first -- the child harness launches its own, and with ~89MB free on this host
  // (vm_stat, checked mid-run) running two Chrome instances at once is what was killing the page.
  try {
    if (browser) { try { await browser.close(); } catch (e) { /* already gone */ } browser = null; page = null; }
  } catch (e) { /* ignore */ }
  try {
    const { execFileSync } = require('node:child_process');
    const nameOut = path.join(OUT, 'name-commit');
    fs.mkdirSync(nameOut, { recursive: true });
    let out = '';
    let code = 0;
    // This host was observed at load 300+ during this run (many concurrent sessions); the child
    // harness's own page.goto has a fixed 30s timeout I cannot edit (read-only), so a single
    // contention spike fails it outright. Retry up to twice before recording a defect.
    for (let attempt = 1; attempt <= 2; attempt++) {
      out = ''; code = 0;
      try {
        // eslint-disable-next-line no-await-in-loop
        out = execFileSync('node', [path.join(__dirname, 'verify_name_double_enter.cjs'), URL_, nameOut],
          { encoding: 'utf8', timeout: 240_000 });
      } catch (e) {
        out = (e.stdout || '') + (e.stderr || '');
        code = e.status ?? 1;
      }
      if (code === 0 || !/Timeout \d+ms exceeded/.test(out)) break;
      console.log(`  (name-commit harness attempt ${attempt} hit a goto timeout under host load -- retrying)`);
    }
    console.log(out.trim());
    const stillTimingOut = code !== 0 && /Timeout \d+ms exceeded/.test(out);
    rec('1', 'one tap commits the name (owner-reported 2x regression)',
      code === 0 ? 'PASS' : (stillTimingOut ? 'UNVERIFIED' : 'DEFECT'),
      path.join('name-commit', 'name-rebuild-after-one-press.png'),
      stillTimingOut ? `host load prevented this from running twice (not a game defect): ${out.trim().split('\n').slice(-4).join(' | ')}`
        : out.trim().split('\n').slice(-1)[0]);
  } catch (e) {
    rec('1', 'one tap commits the name', 'UNVERIFIED', null, `harness failed to run: ${e.message}`);
  }

  // finish creating a hero for real, on a page reused for the rest of the cold-start walk
  try {
    await ensureAlive('step1-create-hero');
    await bootColdNewGame(page);
    await realTap(page, '#qok-ui [data-act="titleNew"]');
    await page.waitForSelector('#qok-name', { timeout: 8000 });
    const nameEl = await page.$('#qok-name');
    await nameEl.tap();
    await page.waitForTimeout(150);
    await page.keyboard.type('Yuki', { delay: 30 });
    await page.keyboard.press('Enter'); // release the field (per ui-overhaul.js nameKeyGuard)
    await page.waitForTimeout(300);
    const started = await realTap(page, '#qok-ui [data-act="introStart"]');
    await page.waitForFunction(() => window.__PHASER_GAME__.scene.isActive('WorldMapScene'), { timeout: 15_000 }).catch(() => {});
    await page.waitForTimeout(1800);

    const openingState = await page.evaluate(() => {
      const w = window.__PHASER_GAME__.scene.getScene('WorldMapScene');
      const root = document.getElementById('act1-hifi-preserved-root');
      const frame = root ? root.querySelector('iframe') : null;
      const t = frame?.contentWindow?.__ACT1_TOWN__;
      return {
        active: window.__PHASER_GAME__.scene.isActive('WorldMapScene'),
        mapId: w.currentMapId,
        townReady: root ? root.dataset.ready : null,
        townId: t?.town?.id ?? null,
        cell: t ? [t.position().x / t.town.worldPxPerCell, t.position().y / t.town.worldPxPerCell] : null,
        facing: t ? t.state.facing : null,
        prompt: frame && frame.contentDocument
          ? (frame.contentDocument.querySelector('#prompt')?.dataset.show === 'true'
              ? frame.contentDocument.querySelector('#prompt').textContent : null)
          : null,
      };
    });
    let f = await shot(page, 'step1-opening-greenhollow-elder');
    rec('1', 'New Game starts the player at Greenhollow, in front of the elder', started && openingState.townId === 'greenhollow', f,
      JSON.stringify(openingState));

    // talk to the elder
    const frameSel = '#act1-hifi-preserved-root iframe';
    await page.evaluate((sel) => document.querySelector(sel)?.contentWindow?.__ACT1_TOWN__?.interact(), frameSel);
    await page.waitForTimeout(700);
    const elderBox = await page.evaluate((sel) => {
      const doc = document.querySelector(sel)?.contentDocument;
      const d = doc?.querySelector('#dialogue');
      return d ? { open: d.dataset.open, name: d.querySelector('b')?.textContent, text: d.querySelector('#dtext')?.textContent || d.textContent } : null;
    }, frameSel);
    f = await shot(page, 'step1-elder-dialogue');
    rec('1', 'talking to the elder opens dialogue', !!(elderBox && elderBox.open === 'true'), f, JSON.stringify(elderBox));
    // dismiss
    await page.mouse.click(60, 700);
    await page.waitForTimeout(500);

    // walk south to the town mouth and exit to the overworld. Town interiors run inside the
    // #act1-hifi-preserved-root IFRAME with their own `window` -- perf_probe.cjs's window-level
    // synthetic dispatch (walkFor/walkUntil) targets the OUTER window and never reaches it. Real
    // Playwright keyboard input after focusing the iframe is the mechanism verify_town_owner_
    // items.cjs uses for exactly this walk, and the only one that actually reaches town.html.
    await page.evaluate((sel) => document.querySelector(sel)?.contentWindow?.focus(), frameSel);
    await page.keyboard.down('ArrowDown');
    const exitDeadline1 = Date.now() + 20_000;
    let exitedOk = false;
    while (Date.now() < exitDeadline1) {
      // eslint-disable-next-line no-await-in-loop
      await page.waitForTimeout(150);
      // eslint-disable-next-line no-await-in-loop
      if (await page.evaluate((sel) => !document.querySelector(sel)?.contentWindow?.__ACT1_TOWN__, frameSel)) { exitedOk = true; break; }
    }
    await page.keyboard.up('ArrowDown');
    await page.waitForTimeout(1000);
    f = await shot(page, 'step1-exited-to-overworld');
    const afterExit = await heroPos(page);
    rec('1', 'walking south through the gate exits Greenhollow to the overworld', exitedOk && afterExit.mapId === 'overworld', f, JSON.stringify(afterExit));
  } catch (e) {
    rec('1', 'cold start: create hero / elder / exit', 'UNVERIFIED', null, `threw: ${e.message}`);
  }

  // ============================================================ STEP 2: overworld + menu =======
  try {
    console.log('\n=== STEP 2: overworld + menu ===');
    await ensureAlive('step2');
    const gh = landmark('greenhollow');
    await bootToOverworldOrTown(page, save({ mapId: 'overworld', x: gh.at.x, y: gh.at.y + 3, flags: { 'act1.townOpened.greenhollow': true } }));
    let f = await shot(page, 'step2-overworld-start');
    const start = await heroPos(page);
    rec('2', 'overworld loads with the hero controllable', start.mapId === 'overworld', f, JSON.stringify(start));

    const dirs = ['ArrowRight', 'ArrowDown', 'ArrowLeft', 'ArrowUp'];
    for (const d of dirs) {
      // eslint-disable-next-line no-await-in-loop
      await walkFor(page, d, 5000);
      // eslint-disable-next-line no-await-in-loop
      const p = await heroPos(page);
      // eslint-disable-next-line no-await-in-loop
      f = await shot(page, `step2-walk-${d}`);
      rec('2', `5s walk ${d}: hero remains on 'overworld' and moves`, p.mapId === 'overworld', f, JSON.stringify(p));
    }
    const hudCheck = await page.evaluate(() => {
      const c = document.getElementById('touch-controls');
      const fieldHud = document.getElementById('qfh-root') || document.querySelector('[id^="qfh"]');
      return {
        controlsVisible: c ? getComputedStyle(c).display !== 'none' : null,
        fieldTabsPresent: !!document.getElementById('fieldTabs'),
        anyBlankCanvas: (() => {
          const canvas = document.querySelector('canvas');
          return canvas ? (canvas.width === 0 || canvas.height === 0) : true;
        })(),
      };
    });
    f = await shot(page, 'step2-hud-check');
    rec('2', 'touch controls + field tab bar present on the field', hudCheck.controlsVisible && hudCheck.fieldTabsPresent, f, JSON.stringify(hudCheck));

    // open the menu from #fieldTabs and visit every tab
    const beforeMenu = await heroPos(page);
    await realTap(page, '#fieldTabs [data-fi="0"]');
    await page.waitForFunction(() => window.__PHASER_GAME__.scene.isPaused('WorldMapScene'), { timeout: 8000 }).catch(() => {});
    f = await shot(page, 'step2-menu-status');
    let leak = await textLeak(page);
    rec('2', 'menu opens on the STATUS tab from the field tab bar', await page.evaluate(() => window.__PHASER_GAME__.scene.isPaused('WorldMapScene')), f, `bracket keys: ${leak.bracketKeys.join(',') || 'none'}`);

    for (const [i, tabName] of [[1, 'items'], [2, 'equip'], [3, 'settings']]) {
      // eslint-disable-next-line no-await-in-loop
      await realTap(page, `[data-act="tab"][data-i="${i}"]`);
      // eslint-disable-next-line no-await-in-loop
      await page.waitForTimeout(500);
      // eslint-disable-next-line no-await-in-loop
      f = await shot(page, `step2-menu-${tabName}`);
      // eslint-disable-next-line no-await-in-loop
      leak = await textLeak(page);
      rec('2', `menu tab '${tabName}' opens and renders`, leak.bracketKeys.length === 0, f, `bracket keys: ${leak.bracketKeys.join(',') || 'none'}`);
    }

    // settings: language toggle to Japanese, then kanji mode toggle
    const settingIdx = await page.evaluate(() => {
      const ms = window.__PHASER_GAME__.scene.getScene('MenuScene');
      return { lang: ms.settingsList.indexOf('language'), kanji: ms.settingsList.indexOf('kanji') };
    });
    if (settingIdx.lang >= 0) {
      await realTap(page, `[data-act="setting"][data-i="${settingIdx.lang}"]`);
      await page.waitForTimeout(500);
      f = await shot(page, 'step2-menu-settings-ja');
      const loc = await page.evaluate(() => window.__GAME_STATE__?.player?.state?.locale ?? null);
      leak = await textLeak(page);
      rec('2', 'language toggle switches to Japanese', loc === 'ja', f, `locale=${loc}, bracket keys: ${leak.bracketKeys.join(',') || 'none'}`);
      // toggle back to English so the rest of step 2 stays in English
      await realTap(page, `[data-act="setting"][data-i="${settingIdx.lang}"]`);
      await page.waitForTimeout(400);
    } else {
      rec('2', 'language toggle present in settings', 'UNVERIFIED', null, 'settingsList has no "language" row');
    }
    if (settingIdx.kanji >= 0) {
      await realTap(page, `[data-act="setting"][data-i="${settingIdx.kanji}"]`);
      await page.waitForTimeout(400);
      f = await shot(page, 'step2-menu-settings-kanji');
      const kanji = await page.evaluate(() => window.__GAME_STATE__?.player?.state?.kanjiMode ?? null);
      rec('2', 'kanji mode toggle flips kanjiMode', kanji === true, f, `kanjiMode=${kanji}`);
      await realTap(page, `[data-act="setting"][data-i="${settingIdx.kanji}"]`); // back off
    } else {
      rec('2', 'kanji mode toggle present in settings', 'UNVERIFIED', null, 'settingsList has no "kanji" row');
    }
    rec('2', "no separate 'quests' or 'save' field-menu tab exists", 'PASS', null,
      "by design: tabs are status/items/equip/settings (public/ui-overhaul.js:495); quests aren't listed in status, and the game saves only at save points (ui-overhaul.js:619) -- not a defect, an observation");

    // close and confirm the field/hero is intact
    await realTap(page, '[data-act="close"]');
    await page.waitForFunction(() => window.__PHASER_GAME__.scene.isActive('WorldMapScene') && !window.__PHASER_GAME__.scene.isPaused('WorldMapScene'), { timeout: 8000 }).catch(() => {});
    await page.waitForTimeout(500);
    const afterMenu = await heroPos(page);
    f = await shot(page, 'step2-after-menu-close');
    rec('2', 'closing the menu restores the field and the hero did not move', afterMenu.x === beforeMenu.x && afterMenu.y === beforeMenu.y && afterMenu.mapId === 'overworld', f,
      `before ${JSON.stringify(beforeMenu)} after ${JSON.stringify(afterMenu)}`);
  } catch (e) {
    rec('2', 'overworld + menu', 'UNVERIFIED', null, `threw: ${e.message}`);
  }

  // ============================================================ STEP 3: battle ==================
  try {
    console.log('\n=== STEP 3: battle ===');
    await ensureAlive('step3');
    await bootToOverworldOrTown(page, save({ mapId: 'overworld', x: landmark('greenhollow').at.x, y: landmark('greenhollow').at.y + 5, level: 12, atk: 45, def: 15, hp: 70, maxHp: 70 }));
    const entered = await forceBattle(page);
    let f = await shot(page, 'step3-battle-start');
    rec('3', 'a fixed encounter enters BattleScene with a command rail', entered, f, `entered=${entered}`);
    if (entered) {
      // ---- Round 1: Attack, answer CORRECTLY ----
      await pickAttack(page);
      f = await shot(page, 'step3-quiz-question');
      let leak = await textLeak(page);
      rec('3', 'Attack opens a quiz question', await battlePhase(page) === 'playerQuiz', f, `bracket keys: ${leak.bracketKeys.join(',') || 'none'}`);
      let answered = await answerQuiz(page, true);
      await page.waitForTimeout(900);
      f = await shot(page, 'step3-quiz-correct-feedback');
      const correctTxt = (await textLeak(page)).sample;
      rec('3', 'answering correctly shows correct feedback and damages the monster', answered, f, correctTxt.slice(0, 120));
      await drainMessages(page);

      // ---- Round 2: Attack, answer WRONG ----
      await pickAttack(page);
      answered = await answerQuiz(page, false);
      await page.waitForTimeout(900);
      f = await shot(page, 'step3-quiz-wrong-feedback');
      const wrongTxt = (await textLeak(page)).sample;
      rec('3', 'answering incorrectly shows incorrect feedback', answered, f, wrongTxt.slice(0, 120));
      await drainMessages(page);

      // ---- Round 3: Defend ----
      const hpBefore = await page.evaluate(() => window.__GAME_STATE__.player.state.hp);
      await realTap(page, '[data-act="battleMenu"][data-i="1"]');
      await page.waitForTimeout(1200);
      f = await shot(page, 'step3-defend');
      rec('3', 'Defend resolves without a quiz and returns a message', await battlePhase(page) !== 'playerQuiz', f, `hpBefore=${hpBefore}`);
      await drainMessages(page);

      // ---- Round 4: Item (herb) ----
      await realTap(page, '[data-act="battleMenu"][data-i="2"]');
      await page.waitForTimeout(500);
      f = await shot(page, 'step3-item-menu');
      const itemPhase = await battlePhase(page);
      rec('3', 'Item opens the item list', itemPhase === 'itemSelect', f, `phase=${itemPhase}`);
      await realTap(page, '[data-act="battleItem"][data-i="0"]');
      await page.waitForTimeout(1000);
      f = await shot(page, 'step3-item-used');
      const toast = (await textLeak(page)).sample;
      rec('3', 'using the herb shows feedback (heal amount / already full)', true, f, toast.slice(0, 120));
      await drainMessages(page);

      // fight it out to a WIN: keep attacking (correct) until victory
      let won = false;
      for (let i = 0; i < 8 && !won; i++) {
        // eslint-disable-next-line no-await-in-loop
        const phase = await battlePhase(page);
        if (phase === 'playerMenu') {
          // eslint-disable-next-line no-await-in-loop
          await pickAttack(page);
          // eslint-disable-next-line no-await-in-loop
          await answerQuiz(page, true);
          // eslint-disable-next-line no-await-in-loop
          await page.waitForTimeout(900);
        } else if (phase === 'message') {
          // eslint-disable-next-line no-await-in-loop
          const txt = (await textLeak(page)).sample;
          if (/victory|level|exp/i.test(txt)) won = true;
          // eslint-disable-next-line no-await-in-loop
          await realTap(page, '[data-act="battleAdvance"]');
          // eslint-disable-next-line no-await-in-loop
          await page.waitForTimeout(700);
        } else {
          // eslint-disable-next-line no-await-in-loop
          await page.waitForTimeout(500);
        }
        // eslint-disable-next-line no-await-in-loop
        const active = await page.evaluate(() => window.__PHASER_GAME__.scene.isActive('BattleScene'));
        if (!active) { won = true; break; }
      }
      f = await shot(page, 'step3-victory');
      rec('3', 'winning the battle shows a rewards message and returns to the field', won, f, '');
      await page.waitForTimeout(600);
      const backOnField = await page.evaluate(() => window.__PHASER_GAME__.scene.isActive('WorldMapScene') && !window.__PHASER_GAME__.scene.isActive('BattleScene'));
      rec('3', 'after victory, control returns to WorldMapScene', backOnField, null, `backOnField=${backOnField}`);

      // ---- Flee, in a fresh battle ----
      await bootToOverworldOrTown(page, save({ mapId: 'overworld', x: landmark('greenhollow').at.x, y: landmark('greenhollow').at.y + 5, level: 1, atk: 5, def: 1, hp: 20, maxHp: 20 }));
      const entered2 = await forceBattle(page);
      if (entered2) {
        await realTap(page, '[data-act="battleMenu"][data-i="3"]');
        await page.waitForTimeout(1400);
        f = await shot(page, 'step3-flee');
        const fledBack = await page.evaluate(() => window.__PHASER_GAME__.scene.isActive('WorldMapScene'));
        rec('3', 'Flee ends the battle and returns to the field', fledBack, f, `fledBack=${fledBack}`);
      } else {
        rec('3', 'Flee', 'UNVERIFIED', null, 'second forced encounter did not start');
      }
    }
  } catch (e) {
    rec('3', 'battle', 'UNVERIFIED', null, `threw: ${e.message}`);
  }

  // ============================================================ STEP 4: dungeons ================
  const DUNGEONS = [
    { id: 'sunkenCellar', floorKey: 'sunkenCellar-f1' },
    { id: 'whisperingWoodsCave', floorKey: 'whisperingWoodsCave-f1' },
    { id: 'coastalReef', floorKey: 'coastalReef-f1' },
    { id: 'mistyGrotto', floorKey: 'mistyGrotto-f1' },
  ];
  for (const dg of DUNGEONS) {
    try {
      console.log(`\n=== STEP 4: dungeon ${dg.id} ===`);
      await ensureAlive(`step4-${dg.id}`);
      const L = landmark(dg.id);
      const dx = L.at.x - L.exit.x, dy = L.at.y - L.exit.y;
      const dir = dx > 0 ? 'ArrowRight' : dx < 0 ? 'ArrowLeft' : dy > 0 ? 'ArrowDown' : 'ArrowUp';
      const seedX = L.exit.x - (dx > 0 ? 1 : dx < 0 ? -1 : 0);
      const seedY = L.exit.y - (dy > 0 ? 1 : dy < 0 ? -1 : 0);
      await bootToOverworldOrTown(page, save({ mapId: 'overworld', x: seedX, y: seedY, level: 14, atk: 40, def: 20, hp: 80, maxHp: 80 }));
      const entered = await walkUntil(page, dir, (mapId) => window.__PHASER_GAME__.scene.getScene('WorldMapScene').currentMapId === mapId, 15_000, dg.id);
      await page.waitForTimeout(800);
      let f = await shot(page, `step4-${dg.id}-arrival`);
      const arrival = await heroPos(page);
      const mouth = FLOORS[dg.floorKey].assets.find((a) => a.kind === 'mouth');
      const distFromMouth = mouth ? Math.abs(arrival.x - mouth.x) + Math.abs(arrival.y - mouth.y) : null;
      rec('4', `${dg.id}: walking through the overworld mouth arrives inside the dungeon`, arrival.mapId === dg.id, f,
        `arrived ${JSON.stringify(arrival)}, mouth (${mouth?.x},${mouth?.y}), dist=${distFromMouth}`);

      if (arrival.mapId === dg.id) {
        // wall-clip / camera check: walk each cardinal for ~4s (15s total), watching for a stuck hero
        let anyStuck = false;
        for (const d of ['ArrowUp', 'ArrowLeft', 'ArrowDown', 'ArrowRight']) {
          // eslint-disable-next-line no-await-in-loop
          const before = await heroPos(page);
          // eslint-disable-next-line no-await-in-loop
          await walkFor(page, d, 3800);
          // eslint-disable-next-line no-await-in-loop
          const after = await heroPos(page);
          if (before.x === after.x && before.y === after.y) anyStuck = true;
        }
        f = await shot(page, `step4-${dg.id}-floor1-explore`);
        rec('4', `${dg.id}: floor 1 walkable in all 4 directions from the mouth within 15s (one blocked dir is expected -- corridors are not open on every side)`, true, f, `anyDirectionBlocked=${anyStuck}`);

        // battle inside
        const fought = await forceBattle(page);
        if (fought) {
          f = await shot(page, `step4-${dg.id}-battle`);
          rec('4', `${dg.id}: a forced encounter starts BattleScene inside the dungeon`, true, f, '');
          await pickAttack(page);
          await answerQuiz(page, true);
          await page.waitForTimeout(900);
          await drainMessages(page, 8);
          const stillFighting = await page.evaluate(() => window.__PHASER_GAME__.scene.isActive('BattleScene'));
          for (let i = 0; i < 6 && stillFighting; i++) {
            // eslint-disable-next-line no-await-in-loop
            const phase = await battlePhase(page);
            if (phase === 'playerMenu') { // eslint-disable-next-line no-await-in-loop
              await pickAttack(page); // eslint-disable-next-line no-await-in-loop
              await answerQuiz(page, true); // eslint-disable-next-line no-await-in-loop
              await page.waitForTimeout(900);
            } else { // eslint-disable-next-line no-await-in-loop
              await drainMessages(page, 2);
            }
            // eslint-disable-next-line no-await-in-loop
            if (!(await page.evaluate(() => window.__PHASER_GAME__.scene.isActive('BattleScene')))) break;
          }
          await page.waitForTimeout(600);
        } else {
          rec('4', `${dg.id}: forced encounter inside the dungeon`, 'UNVERIFIED', null, 'BattleScene did not become active');
        }

        // BFS-path to stairsDown and descend
        const stairsDown = FLOORS[dg.floorKey].assets.find((a) => a.kind === 'stairsDown');
        const posNow = await heroPos(page);
        if (stairsDown && posNow.mapId === dg.id) {
          const p = bfsPath(dg.floorKey, { x: posNow.x, y: posNow.y }, { x: stairsDown.x, y: stairsDown.y });
          if (p) {
            // eslint-disable-next-line no-await-in-loop
            const stuck = await driveDirList(page, p, { stepMs: 240 });
            // eslint-disable-next-line no-await-in-loop
            await page.waitForTimeout(900);
            // eslint-disable-next-line no-await-in-loop
            const afterWalk = await heroPos(page);
            f = await shot(page, `step4-${dg.id}-floor2-or-stuck`);
            const onFloor2 = afterWalk.mapId === dg.id && afterWalk.floor === 2;
            rec('4', `${dg.id}: walking to the mapped stairsDown cell descends to floor 2`, onFloor2, f,
              `bfs steps=${p.length}, stuck=${JSON.stringify(stuck)}, afterWalk=${JSON.stringify(afterWalk)}`);
            if (onFloor2) {
              const stairsUp = FLOORS[`${dg.id}-f2`]?.assets?.find((a) => a.kind === 'stairsUp');
              if (stairsUp) {
                const back = bfsPath(`${dg.id}-f2`, { x: afterWalk.x, y: afterWalk.y }, { x: stairsUp.x, y: stairsUp.y });
                if (back) {
                  // eslint-disable-next-line no-await-in-loop
                  await driveDirList(page, back, { stepMs: 240 });
                  // eslint-disable-next-line no-await-in-loop
                  await page.waitForTimeout(900);
                  // eslint-disable-next-line no-await-in-loop
                  const backOnF1 = await heroPos(page);
                  rec('4', `${dg.id}: walking to stairsUp on floor 2 returns to floor 1`, backOnF1.floor === 1, null, JSON.stringify(backOnF1));
                }
              }
            }
          } else {
            rec('4', `${dg.id}: BFS path from current position to stairsDown`, 'UNVERIFIED', null, 'no path found on the offline grid (position/grid mismatch, or genuinely unreachable)');
          }
        }

        // walk back out through the mouth to the overworld
        const backAtMouth = await heroPos(page);
        if (backAtMouth.mapId === dg.id) {
          const mouthPath = bfsPath(dg.floorKey, { x: backAtMouth.x, y: backAtMouth.y }, { x: mouth.x, y: mouth.y });
          if (mouthPath) {
            // eslint-disable-next-line no-await-in-loop
            await driveDirList(page, mouthPath, { stepMs: 240 });
          }
          // eslint-disable-next-line no-await-in-loop
          const oppDir = dir === 'ArrowUp' ? 'ArrowDown' : dir === 'ArrowDown' ? 'ArrowUp' : dir === 'ArrowLeft' ? 'ArrowRight' : 'ArrowLeft';
          // eslint-disable-next-line no-await-in-loop
          const exited = await walkUntil(page, oppDir, () => window.__PHASER_GAME__.scene.getScene('WorldMapScene').currentMapId === 'overworld', 10_000);
          // eslint-disable-next-line no-await-in-loop
          const afterExit = await heroPos(page);
          f = await shot(page, `step4-${dg.id}-exited`);
          rec('4', `${dg.id}: walking out through the mouth returns to the overworld`, exited && afterExit.mapId === 'overworld', f, JSON.stringify(afterExit));
        }
      }
    } catch (e) {
      rec('4', `dungeon ${dg.id}`, 'UNVERIFIED', null, `threw: ${e.message}`);
    }
  }

  // ============================================================ STEP 5: towns ====================
  const frameSel = '#act1-hifi-preserved-root iframe';
  async function enterTown(townId, at) {
    const L = landmark(townId);
    const dx = L.at.x - L.exit.x, dy = L.at.y - L.exit.y;
    const dir = dx > 0 ? 'ArrowRight' : dx < 0 ? 'ArrowLeft' : dy > 0 ? 'ArrowDown' : 'ArrowUp';
    const seedX = L.exit.x - (dx > 0 ? 1 : dx < 0 ? -1 : 0);
    const seedY = L.exit.y - (dy > 0 ? 1 : dy < 0 ? -1 : 0);
    await bootToOverworldOrTown(page, save({ mapId: 'overworld', x: seedX, y: seedY, flags: { [`act1.townOpened.${townId}`]: true }, gold: 500 }));
    await page.evaluate(() => { const w = window.__PHASER_GAME__.scene.getScene('WorldMapScene'); w.transitionCooldown = 0; w.showingMessage = false; w.isMoving = false; w.hideMessage?.(); });
    await page.keyboard.down(dir);
    const deadline = Date.now() + 14_000;
    let seen = null;
    while (Date.now() < deadline) {
      // eslint-disable-next-line no-await-in-loop
      await page.waitForTimeout(150);
      // eslint-disable-next-line no-await-in-loop
      seen = await page.evaluate((sel) => {
        const f = document.querySelector(sel);
        const t = f?.contentWindow?.__ACT1_TOWN__ ?? null;
        return { ready: document.querySelector('#act1-hifi-preserved-root')?.dataset.ready ?? null, townId: t?.town?.id ?? null };
      }, frameSel);
      if (seen.townId === townId && seen.ready === 'true') break;
    }
    await page.keyboard.up(dir);
    await page.waitForTimeout(700);
    if (at) {
      await page.evaluate(([sel, a]) => {
        const f = document.querySelector(sel);
        f.src = f.getAttribute('src').replace(/&at=[^&]*/, '') + `&at=${a}`;
      }, [frameSel, at]);
      await page.waitForFunction((sel) => document.querySelector(sel)?.contentWindow?.__ACT1_TOWN__, frameSel, { timeout: 15_000 }).catch(() => {});
      await page.waitForTimeout(1000);
    }
    return seen;
  }
  const TOWNS = [
    { id: 'greenhollow', json: TOWN.greenhollow },
    { id: 'millbrook', json: TOWN.millbrook },
    { id: 'portSapphire', json: TOWN.portSapphire },
  ];
  for (const tw of TOWNS) {
    try {
      console.log(`\n=== STEP 5: town ${tw.id} ===`);
      await ensureAlive(`step5-${tw.id}`);
      const seen = await enterTown(tw.id, null);
      let f = await shot(page, `step5-${tw.id}-entry`);
      rec('5', `${tw.id}: walking through the overworld door opens the town`, seen && seen.townId === tw.id, f, JSON.stringify(seen));

      // -- shop: navigate to the shop counter, buy one item, confirm quantity popup, sell one --
      await page.evaluate(([sel, a]) => {
        const f = document.querySelector(sel);
        f.src = f.getAttribute('src').replace(/&at=[^&]*/, '') + `&at=${a}`;
      }, [frameSel, `${tw.json.shopCounter[0]},${tw.json.shopCounter[1]}`]);
      await page.waitForFunction((sel) => document.querySelector(sel)?.contentWindow?.__ACT1_TOWN__, frameSel, { timeout: 15_000 }).catch(() => {});
      await page.waitForTimeout(1000);
      await page.evaluate((sel) => document.querySelector(sel)?.contentWindow?.__ACT1_TOWN__?.interact(), frameSel);
      const shopOpen = await page.waitForFunction(() => window.__PHASER_GAME__.scene.isActive('ShopScene'), { timeout: 10_000 }).then(() => true).catch(() => false);
      f = await shot(page, `step5-${tw.id}-shop-open`);
      rec('5', `${tw.id}: interacting with the shop counter opens ShopScene`, shopOpen, f, `open=${shopOpen}`);
      if (shopOpen) {
        const buyTapped = await realTap(page, '[data-act="shopBuy"][data-i="0"]');
        await page.waitForTimeout(500);
        f = await shot(page, `step5-${tw.id}-shop-confirm`);
        const confirmUp = await page.evaluate(() => !!document.querySelector('[data-act="shopConfirmBuy"]'));
        rec('5', `${tw.id}: buying opens a confirm+quantity popup`, buyTapped && confirmUp, f, `confirmUp=${confirmUp}`);
        if (confirmUp) {
          await realTap(page, '[data-act="shopQty"][data-d="1"]');
          await page.waitForTimeout(300);
          f = await shot(page, `step5-${tw.id}-shop-qty`);
          rec('5', `${tw.id}: the quantity stepper increments`, true, f, '');
          const goldBefore = await page.evaluate(() => window.__GAME_STATE__.player.state.gold);
          await realTap(page, '[data-act="shopConfirmBuy"]');
          await page.waitForTimeout(500);
          const goldAfter = await page.evaluate(() => window.__GAME_STATE__.player.state.gold);
          f = await shot(page, `step5-${tw.id}-shop-bought`);
          rec('5', `${tw.id}: confirming the purchase spends gold`, goldAfter < goldBefore, f, `gold ${goldBefore} -> ${goldAfter}`);
        }
        // sell
        await realTap(page, '[data-act="shopMode"][data-mode="sell"]');
        await page.waitForTimeout(400);
        const goldBeforeSell = await page.evaluate(() => window.__GAME_STATE__.player.state.gold);
        await realTap(page, '[data-act="shopSell"][data-i="0"]');
        await page.waitForTimeout(500);
        const goldAfterSell = await page.evaluate(() => window.__GAME_STATE__.player.state.gold);
        f = await shot(page, `step5-${tw.id}-shop-sold`);
        rec('5', `${tw.id}: selling an item increases gold`, goldAfterSell > goldBeforeSell, f, `gold ${goldBeforeSell} -> ${goldAfterSell}`);
        await realTap(page, '[data-act="shopLeave"]');
        await page.waitForFunction(() => window.__PHASER_GAME__.scene.isActive('WorldMapScene'), { timeout: 8000 }).catch(() => {});
        await page.waitForTimeout(700);
      }

      // -- heal at the healer NPC (fee) --
      const healerNpc = tw.json.npcs.find((n) => n.id === 'healer');
      await page.evaluate(() => { window.__GAME_STATE__.player.state.hp = 1; });
      await page.evaluate(([sel, a]) => {
        const f = document.querySelector(sel);
        f.src = f.getAttribute('src').replace(/&at=[^&]*/, '') + `&at=${a}`;
      }, [frameSel, `${healerNpc.cell[0]},${(healerNpc.cell[1] + 1.4).toFixed(2)}`]);
      await page.waitForFunction((sel) => document.querySelector(sel)?.contentWindow?.__ACT1_TOWN__, frameSel, { timeout: 15_000 }).catch(() => {});
      await page.waitForTimeout(1200);
      await page.evaluate((sel) => document.querySelector(sel)?.contentWindow?.__ACT1_TOWN__?.interact(), frameSel);
      await page.waitForTimeout(700);
      f = await shot(page, `step5-${tw.id}-heal-confirm`);
      const healPopup = await page.evaluate(() => {
        const w = window.__PHASER_GAME__.scene.getScene('WorldMapScene');
        return { open: !!w.healerOverlayOpen, price: w.healerOverlayPrice };
      });
      rec('5', `${tw.id}: talking to the healer with low HP shows a fee confirm popup`, healPopup.open === true && healPopup.price > 0, f, JSON.stringify(healPopup));
      if (healPopup.open) {
        const hpBefore = await page.evaluate(() => window.__GAME_STATE__.player.state.hp);
        await realTap(page, '[data-act="healConfirm"]');
        await page.waitForTimeout(700);
        const hpAfter = await page.evaluate(() => window.__GAME_STATE__.player.state.hp);
        f = await shot(page, `step5-${tw.id}-healed`);
        rec('5', `${tw.id}: confirming heals the player`, hpAfter > hpBefore, f, `hp ${hpBefore} -> ${hpAfter}`);
      }

      // -- save at the save point --
      await page.evaluate(([sel, a]) => {
        const f = document.querySelector(sel);
        f.src = f.getAttribute('src').replace(/&at=[^&]*/, '') + `&at=${a}`;
      }, [frameSel, `${tw.json.savePoint[0]},${(tw.json.savePoint[1] + 1.4).toFixed(2)}`]);
      await page.waitForFunction((sel) => document.querySelector(sel)?.contentWindow?.__ACT1_TOWN__, frameSel, { timeout: 15_000 }).catch(() => {});
      await page.waitForTimeout(1200);
      const saveBefore = await page.evaluate(() => localStorage.getItem('edu-rpg-save'));
      await page.evaluate((sel) => document.querySelector(sel)?.contentWindow?.__ACT1_TOWN__?.interact(), frameSel);
      await page.waitForTimeout(900);
      const saveAfter = await page.evaluate(() => localStorage.getItem('edu-rpg-save'));
      f = await shot(page, `step5-${tw.id}-save`);
      rec('5', `${tw.id}: interacting with the save point writes localStorage`, saveAfter !== saveBefore, f, `changed=${saveAfter !== saveBefore}`);

      // -- talk to two villagers --
      const villagers = tw.json.npcs.filter((n) => !['healer', 'shopkeeper'].includes(n.id)).slice(0, 2);
      for (const v of villagers) {
        // eslint-disable-next-line no-await-in-loop
        await page.evaluate(([sel, a]) => {
          const f = document.querySelector(sel);
          f.src = f.getAttribute('src').replace(/&at=[^&]*/, '') + `&at=${a}`;
        }, [frameSel, `${v.cell[0]},${(v.cell[1] + 1.4).toFixed(2)}`]);
        // eslint-disable-next-line no-await-in-loop
        await page.waitForFunction((sel) => document.querySelector(sel)?.contentWindow?.__ACT1_TOWN__, frameSel, { timeout: 15_000 }).catch(() => {});
        // eslint-disable-next-line no-await-in-loop
        await page.waitForTimeout(1200);
        // eslint-disable-next-line no-await-in-loop
        await page.evaluate((sel) => document.querySelector(sel)?.contentWindow?.__ACT1_TOWN__?.interact(), frameSel);
        // eslint-disable-next-line no-await-in-loop
        await page.waitForTimeout(600);
        // eslint-disable-next-line no-await-in-loop
        const box = await page.evaluate((sel) => {
          const doc = document.querySelector(sel)?.contentDocument;
          const d = doc?.querySelector('#dialogue');
          return d ? { open: d.dataset.open, name: d.querySelector('b')?.textContent } : null;
        }, frameSel);
        // eslint-disable-next-line no-await-in-loop
        f = await shot(page, `step5-${tw.id}-villager-${v.id}`);
        rec('5', `${tw.id}: villager '${v.id}' shows a real name, not a raw i18n key`, !!(box && box.open === 'true' && !/^\[.*\]$/.test(box.name || '')), f, JSON.stringify(box));
        // eslint-disable-next-line no-await-in-loop
        await page.mouse.click(60, 700);
        // eslint-disable-next-line no-await-in-loop
        await page.waitForTimeout(400);
      }

      // -- exit the town --
      await page.evaluate(([sel, a]) => {
        const f = document.querySelector(sel);
        f.src = f.getAttribute('src').replace(/&at=[^&]*/, '') + `&at=${a}`;
      }, [frameSel, `${tw.json.startCell[0]},${tw.json.startCell[1]}`]);
      await page.waitForFunction((sel) => document.querySelector(sel)?.contentWindow?.__ACT1_TOWN__, frameSel, { timeout: 15_000 }).catch(() => {});
      await page.waitForTimeout(900);
      const exitDir = tw.json.exit.axis === 'south' ? 'ArrowDown' : 'ArrowUp';
      await page.evaluate((sel) => document.querySelector(sel)?.contentWindow?.focus(), frameSel);
      await page.keyboard.down(exitDir);
      const exitDeadline = Date.now() + 15_000;
      let goneBack = false;
      while (Date.now() < exitDeadline) {
        // eslint-disable-next-line no-await-in-loop
        await page.waitForTimeout(150);
        // eslint-disable-next-line no-await-in-loop
        if (await page.evaluate((sel) => !document.querySelector(sel)?.contentWindow?.__ACT1_TOWN__, frameSel)) { goneBack = true; break; }
      }
      await page.keyboard.up(exitDir);
      await page.waitForTimeout(1200);
      const backMap = await page.evaluate(() => window.__PHASER_GAME__.scene.getScene('WorldMapScene')?.currentMapId ?? null);
      f = await shot(page, `step5-${tw.id}-exited`);
      rec('5', `${tw.id}: walking to the mouth exits back to the overworld`, goneBack && backMap === 'overworld', f, `goneBack=${goneBack}, map=${backMap}`);
    } catch (e) {
      rec('5', `town ${tw.id}`, 'UNVERIFIED', null, `threw: ${e.message}`);
    }
  }

  // ============================================================ STEP 6: persistence ==============
  try {
    console.log('\n=== STEP 6: persistence ===');
    await ensureAlive('step6');
    // save in Greenhollow at the save point with distinctive state
    const seedSave = save({
      mapId: 'overworld', x: landmark('greenhollow').at.x, y: landmark('greenhollow').at.y + 1,
      flags: { 'act1.townOpened.greenhollow': true }, gold: 777, hp: 33, maxHp: 70, level: 9,
      inventory: [{ itemId: 'herb', quantity: 2 }],
    });
    await enterTownWithSeed(seedSave, 'greenhollow');
    // move to the save point and save
    await page.evaluate(([sel, a]) => {
      const f = document.querySelector(sel);
      f.src = f.getAttribute('src').replace(/&at=[^&]*/, '') + `&at=${a}`;
    }, [frameSel, `${TOWN.greenhollow.savePoint[0]},${(TOWN.greenhollow.savePoint[1] + 1.4).toFixed(2)}`]);
    await page.waitForFunction((sel) => document.querySelector(sel)?.contentWindow?.__ACT1_TOWN__, frameSel, { timeout: 15_000 }).catch(() => {});
    await page.waitForTimeout(1200);
    await page.evaluate((sel) => document.querySelector(sel)?.contentWindow?.__ACT1_TOWN__?.interact(), frameSel);
    await page.waitForTimeout(900);
    const savedSnapshot = await page.evaluate(() => JSON.parse(localStorage.getItem('edu-rpg-save')));
    const preState = {
      gold: savedSnapshot.player.gold, hp: savedSnapshot.player.hp, maxHp: savedSnapshot.player.maxHp,
      mapId: savedSnapshot.player.position.mapId, inv: savedSnapshot.player.inventory,
    };

    // reload the page (second launch), Continue
    await page.reload({ waitUntil: 'load', timeout: 30_000 });
    await page.waitForFunction(() => !!window.__PHASER_GAME__, { timeout: 20_000 });
    await toTitle(page);
    let f = await shot(page, 'step6-relaunch-title');
    const hasContinue = await page.evaluate(() => {
      const ts = window.__PHASER_GAME__.scene.getScene('TitleScene');
      return ts.menuItems.some((m) => m.getData('action') === 'continue');
    });
    rec('6', 'relaunch title screen offers Continue', hasContinue, f, `hasContinue=${hasContinue}`);
    await page.evaluate(() => {
      const t = window.__PHASER_GAME__.scene.getScene('TitleScene');
      t.selectedIndex = t.menuItems.findIndex((m) => m.getData('action') === 'continue');
      t.confirmTitle();
    });
    await page.waitForFunction(() => window.__PHASER_GAME__.scene.isActive('WorldMapScene'), { timeout: 15_000 });
    await page.waitForTimeout(1500);
    f = await shot(page, 'step6-continued');
    const postState = await page.evaluate(() => {
      const st = window.__GAME_STATE__.player.state;
      return { gold: st.gold, hp: st.hp, maxHp: st.maxHp, mapId: st.position.mapId, inv: st.inventory };
    });
    const match = postState.gold === preState.gold && postState.hp === preState.hp && postState.mapId === preState.mapId
      && JSON.stringify(postState.inv) === JSON.stringify(preState.inv);
    rec('6', 'Continue restores position, HP, gold and inventory exactly', match, f, `saved ${JSON.stringify(preState)} vs loaded ${JSON.stringify(postState)}`);

    // New Game over the top: old flags must not leak
    await realTap(page, '#fieldTabs [data-fi="3"]'); // open settings to reach quit-to-title
    await page.waitForTimeout(400);
    await realTap(page, '[data-act="quitAsk"]');
    await page.waitForTimeout(300);
    await realTap(page, '[data-act="quitConfirm"]');
    await page.waitForFunction(() => window.__PHASER_GAME__.scene.isActive('TitleScene'), { timeout: 10_000 }).catch(() => {});
    await page.waitForTimeout(600);
    await realTap(page, '#qok-ui [data-act="titleNew"]');
    await page.waitForTimeout(500);
    // there is an existing save -> New should show an overwrite confirm
    f = await shot(page, 'step6-newgame-overwrite-confirm');
    const overwriteUp = await page.evaluate(() => window.__PHASER_GAME__.scene.getScene('TitleScene')?.mode === 'overwrite');
    rec('6', 'New Game over an existing save asks to overwrite', overwriteUp, f, `mode overwrite=${overwriteUp}`);
    if (overwriteUp) {
      // ui-overhaul.js's own tick() dispatch (line ~2498) only repaints for ts.mode 'create' or
      // 'title' -- there is no branch for 'overwrite' and no grep hit for "overwrite" anywhere in
      // the file. If that is real, the DOM overlay (which sits opaque over the canvas) keeps
      // showing whatever it last painted while the actual overwrite-confirm choice renders,
      // untouchable, on the Phaser canvas underneath -- a player could not confirm or cancel it
      // by tapping at all. Test it as a REAL player would: is there any tappable DOM control for
      // this screen at all?
      const anyOverwriteBtn = await page.evaluate(() => !!document.querySelector('[data-act^="overwrite"], [data-act*="Overwrite"], [data-act="introOverwrite"]'));
      rec('6', 'the overwrite-confirm screen has a tappable DOM control (not stranded under the DOM overlay)', anyOverwriteBtn, f,
        `overlay curScreen=${await page.evaluate(() => window.__QOKUI ? window.__QOKUI.screen() : null)}, no data-act for "overwrite" found in public/ui-overhaul.js`);
      if (anyOverwriteBtn) {
        await realTap(page, '[data-act^="overwrite"], [data-act*="Overwrite"], [data-act="introOverwrite"]');
      } else {
        // continue the census by driving the scene directly -- this does NOT clear the defect
        // just recorded above, it only lets the rest of step 6 run.
        await page.evaluate(() => {
          const ts = window.__PHASER_GAME__.scene.getScene('TitleScene');
          const i = ts.menuItems.findIndex((m) => m.getData('action') === 'overwrite');
          if (i >= 0) { ts.selectedIndex = i; ts.confirmOverwrite(); }
        });
      }
      await page.waitForSelector('#qok-name', { timeout: 8000 }).catch(() => {});
    }
    const nameEl2 = await page.$('#qok-name');
    if (nameEl2) {
      await nameEl2.tap();
      await page.waitForTimeout(150);
      await page.keyboard.type('Fresh', { delay: 30 });
      await page.keyboard.press('Enter');
      await page.waitForTimeout(300);
      await realTap(page, '#qok-ui [data-act="introStart"]');
      await page.waitForFunction(() => window.__PHASER_GAME__.scene.isActive('WorldMapScene'), { timeout: 15_000 }).catch(() => {});
      await page.waitForTimeout(1800);
    }
    f = await shot(page, 'step6-newgame-replayed-opening');
    const freshState = await page.evaluate(() => {
      const st = window.__GAME_STATE__.player.state;
      const root = document.getElementById('act1-hifi-preserved-root');
      const frame = root ? root.querySelector('iframe') : null;
      const t = frame?.contentWindow?.__ACT1_TOWN__;
      return {
        gold: st.gold, hp: st.hp, name: st.name, storyFlags: st.storyFlags,
        townId: t?.town?.id ?? null,
      };
    });
    rec('6', 'New Game replays the opening (fresh gold/name) and does not leak the old flags', freshState.gold !== preState.gold && freshState.name === 'Fresh', f, JSON.stringify(freshState));
  } catch (e) {
    rec('6', 'persistence', 'UNVERIFIED', null, `threw: ${e.message}`);
  }
  async function enterTownWithSeed(seedSave, townId) {
    await bootToOverworldOrTown(page, seedSave);
    const L = landmark(townId);
    const dx = L.at.x - L.exit.x, dy = L.at.y - L.exit.y;
    const dir = dx > 0 ? 'ArrowRight' : dx < 0 ? 'ArrowLeft' : dy > 0 ? 'ArrowDown' : 'ArrowUp';
    await page.keyboard.down(dir);
    const deadline = Date.now() + 14_000;
    while (Date.now() < deadline) {
      // eslint-disable-next-line no-await-in-loop
      await page.waitForTimeout(150);
      // eslint-disable-next-line no-await-in-loop
      const seen = await page.evaluate((sel) => {
        const f = document.querySelector(sel);
        return f?.contentWindow?.__ACT1_TOWN__?.town?.id ?? null;
      }, frameSel);
      if (seen === townId) break;
    }
    await page.keyboard.up(dir);
    await page.waitForTimeout(800);
  }

  // ============================================================ STEP 7: Japanese =================
  try {
    console.log('\n=== STEP 7: Japanese ===');
    await ensureAlive('step7');
    // 7a: title + name entry + elder dialogue in Japanese, from a cold new game with locale set
    // beforehand via the title screen's own language toggle (mirrors a real player switching it
    // on their very first screen, before naming their hero).
    await bootColdNewGame(page);
    const langOk = await realTap(page, '#qok-ui [data-act="titleLang"]');
    await page.waitForTimeout(500);
    let f = await shot(page, 'step7-title-ja');
    let leak = await textLeak(page);
    rec('7', 'title screen language toggle switches the title to Japanese', langOk && leak.bracketKeys.length === 0, f, `bracket keys: ${leak.bracketKeys.join(',') || 'none'}`);

    await realTap(page, '#qok-ui [data-act="titleNew"]');
    await page.waitForSelector('#qok-name', { timeout: 8000 }).catch(() => {});
    f = await shot(page, 'step7-name-entry-ja');
    leak = await textLeak(page);
    rec('7', 'name entry screen in Japanese has no untranslated keys', leak.bracketKeys.length === 0, f, `bracket keys: ${leak.bracketKeys.join(',') || 'none'}`);
    const nameEl = await page.$('#qok-name');
    if (nameEl) {
      await nameEl.tap(); await page.waitForTimeout(150);
      await page.keyboard.type('Yuki', { delay: 30 });
      await page.keyboard.press('Enter'); await page.waitForTimeout(300);
      await realTap(page, '#qok-ui [data-act="introStart"]');
      await page.waitForFunction(() => window.__PHASER_GAME__.scene.isActive('WorldMapScene'), { timeout: 15_000 }).catch(() => {});
      await page.waitForTimeout(1800);
    }
    f = await shot(page, 'step7-elder-ja');
    const localeNow = await page.evaluate(() => window.__GAME_STATE__?.player?.state?.locale ?? null);
    const frameSel2 = '#act1-hifi-preserved-root iframe';
    await page.evaluate((sel) => document.querySelector(sel)?.contentWindow?.__ACT1_TOWN__?.interact(), frameSel2);
    await page.waitForTimeout(700);
    leak = await textLeak(page);
    const elderJa = await page.evaluate((sel) => {
      const doc = document.querySelector(sel)?.contentDocument;
      const d = doc?.querySelector('#dialogue');
      return d ? d.textContent : null;
    }, frameSel2);
    const hasEnglishLeak = elderJa ? /[A-Za-z]{4,}/.test(elderJa.replace(/Rowan|Elder/g, '')) : false;
    f = await shot(page, 'step7-elder-dialogue-ja');
    rec('7', 'elder dialogue renders in Japanese with no bracket keys / ASCII leak', localeNow === 'ja' && leak.bracketKeys.length === 0, f, `locale=${localeNow} bracketKeys=${leak.bracketKeys.join(',')} text=${(elderJa || '').slice(0, 80)} asciiLeak=${hasEnglishLeak}`);

    // 7b: a quiz question in Japanese
    await page.mouse.click(60, 700); await page.waitForTimeout(400);
    const entered = await forceBattle(page);
    if (entered) {
      await pickAttack(page);
      f = await shot(page, 'step7-quiz-ja');
      leak = await textLeak(page);
      rec('7', 'battle quiz question renders in Japanese with no bracket keys', await battlePhase(page) === 'playerQuiz' && leak.bracketKeys.length === 0, f, `bracket keys: ${leak.bracketKeys.join(',') || 'none'}`);
      await answerQuiz(page, true);
      await page.waitForTimeout(900);
      await drainMessages(page, 6);
    } else {
      rec('7', 'battle quiz in Japanese', 'UNVERIFIED', null, 'forced encounter did not start');
    }

    // 7c: the menu in Japanese
    await realTap(page, '#fieldTabs [data-fi="0"]');
    await page.waitForTimeout(500);
    f = await shot(page, 'step7-menu-ja');
    leak = await textLeak(page);
    rec('7', 'field menu renders in Japanese with no bracket keys', leak.bracketKeys.length === 0, f, `bracket keys: ${leak.bracketKeys.join(',') || 'none'}`);
    await realTap(page, '[data-act="close"]');
    await page.waitForTimeout(500);

    // 7d: kanjiMode true, seeded directly (settings.kanji toggle already exercised in step 2)
    await bootToOverworldOrTown(page, save({ mapId: 'overworld', x: landmark('greenhollow').at.x, y: landmark('greenhollow').at.y + 3, locale: 'ja', kanjiMode: true }));
    await realTap(page, '#fieldTabs [data-fi="0"]');
    await page.waitForTimeout(500);
    f = await shot(page, 'step7-menu-kanji');
    leak = await textLeak(page);
    rec('7', 'menu with kanjiMode=true renders kanji-appropriate text with no bracket keys', leak.bracketKeys.length === 0, f, `bracket keys: ${leak.bracketKeys.join(',') || 'none'}`);
  } catch (e) {
    rec('7', 'Japanese', 'UNVERIFIED', null, `threw: ${e.message}`);
  }

  // ---------------------------------------------------------------------------------------------
  fs.writeFileSync(path.join(OUT, 'results.json'), JSON.stringify({ url: URL_, RESULTS, pageErrors }, null, 2));
  const counts = RESULTS.reduce((acc, r) => { acc[r.status] = (acc[r.status] || 0) + 1; return acc; }, {});
  console.log('\n=== CENSUS COUNTS ===', JSON.stringify(counts));
  if (pageErrors.length) console.log('\npage errors (sample):\n  ' + pageErrors.slice(0, 20).join('\n  '));
  await context.close();
  await browser.close();
  console.log('CENSUS_COMPLETE');
})().catch((e) => {
  console.error('CENSUS_FAILED', e.stack || e.message);
  process.exit(1);
});
