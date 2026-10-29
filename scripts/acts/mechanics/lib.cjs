/* Shared helpers for the dungeon-mechanics audit (scripts/acts/mechanics/).
 * Read-only against the game: drives the SERVED static runtime (baseline + public/ overrides)
 * through a seeded save and the real Title -> Continue entry path (AGENTS.md rule 7).
 * Nothing here writes game files. */
const { chromium } = require('playwright');

const URL_ = process.env.MECH_URL || 'http://127.0.0.1:5181/';

function save(mapId, floor, opts = {}) {
  return { version: 4, timestamp: Date.now(),
    player: { name: 'Probe', heroColor: 'gray', level: 40, exp: 0, expToNext: 100,
      hp: 400, maxHp: 400, atk: 120, def: 80, spd: 40,
      equipment: { weapon: null, armor: null, shield: null, helmet: null, accessory: null },
      inventory: opts.inventory || [], gold: 200,
      position: { mapId, x: opts.x ?? 50, y: opts.y ?? 1, floor },
      storyFlags: Object.assign({ 'intro.done': true }, opts.flags || {}),
      activeQuests: [], completedQuests: [], questProgress: {},
      timerEnabled: false, quizDifficulty: '3', locale: 'en', soundEnabled: false,
      masterVolume: 0, kanjiMode: false },
    playtime: 0, quizStats: {} };
}

async function newPage(browser) {
  const ctx = await browser.newContext({ viewport: { width: 960, height: 720 } });
  const page = await ctx.newPage();
  page.__errors = [];
  page.on('pageerror', e => page.__errors.push(String(e.message).slice(0, 300)));
  return page;
}
async function launch() {
  const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-webgl',
    '--ignore-gpu-blocklist', '--mute-audio'] });
  const page = await newPage(browser);
  return { browser, page };
}
// A fresh browser context per entry: the shell's recovery net (index.html) keeps state in
// localStorage/sessionStorage and can reload a page that was torn down mid-load; isolating each
// entry keeps one bad load from cascading into the next.
async function fresh(T) {
  try { await T.page.context().close(); } catch (e) {}
  T.page = await newPage(T.browser);
  return T.page;
}

// Real entry: seeded save -> reload -> Title -> Continue -> WorldMapScene.loadMap(save.mapId)
async function enter(page, mapId, floor, opts = {}) {
  await page.goto(URL_, { waitUntil: 'load', timeout: 60_000 });
  await page.waitForFunction(() => !!window.__PHASER_GAME__, { timeout: 30_000 });
  await page.evaluate(s => { localStorage.clear(); localStorage.setItem('edu-rpg-save', JSON.stringify(s)); },
    save(mapId, floor, opts));
  await page.reload({ waitUntil: 'load' });
  await page.waitForFunction(() => !!window.__PHASER_GAME__, { timeout: 30_000 });
  await page.evaluate(() => {
    const g = window.__PHASER_GAME__;
    if (g.scene.isActive('BootScene')) { g.scene.start('TitleScene'); g.scene.stop('BootScene'); }
  });
  await page.waitForFunction(() => {
    const g = window.__PHASER_GAME__, t = g && g.scene.getScene('TitleScene');
    return t && g.scene.isActive('TitleScene') && t.menuItems?.length > 0;
  }, { timeout: 30_000 });
  // Diagnostic only: snapshot every renderMap() input so the ENGINE's own floor (rendered inside
  // loadMap) can be compared with the authored A1D floor dq-tiles swaps in afterwards. Behaviour is
  // unchanged -- the wrapper records and then calls the original.
  await page.evaluate(() => {
    const w = window.__PHASER_GAME__.scene.getScene('WorldMapScene');
    if (!w || w.__snapWrapped) return;
    w.__snapWrapped = true; w.__renderSnaps = [];
    const orig = w.renderMap;
    w.renderMap = function () {
      try {
        const md = this.mapData, H = md.length, W = (md[0] || []).length, hist = {}, pos = {};
        for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const v = md[y][x]; hist[v] = (hist[v] || 0) + 1;
          if ([15, 17, 19, 20, 23, 24, 29].includes(v)) (pos[v] = pos[v] || []).push([x, y]); }
        const keys = [...(this.keyChestPositions || [])].map(k => { const [x, y] = k.split(',').map(Number); return [x, y, md[y]?.[x]]; });
        this.__renderSnaps.push({ map: this.currentMapId, floor: this.currentFloor, W, H, hist, pos, keys });
      } catch (e) {}
      return orig.apply(this, arguments);
    };
  });
  await page.evaluate(() => {
    const t = window.__PHASER_GAME__.scene.getScene('TitleScene');
    t.selectedIndex = t.menuItems.findIndex(m => m.getData?.('action') === 'continue');
    t.confirmTitle();
  });
  await page.waitForFunction(() => window.__PHASER_GAME__.scene.isActive('WorldMapScene'), { timeout: 30_000 });
  await page.waitForTimeout(opts.settle ?? 3000);
  // No random battles while probing; mechanic-triggered battles use startBattle directly and are
  // recorded by wrapping it.
  await page.evaluate(() => {
    const gs = window.__GAME_STATE__; const w = window.__PHASER_GAME__.scene.getScene('WorldMapScene');
    gs.encounterManager.onStep = () => null;
    w.__battles = [];
    const sb = w.startBattle.bind(w);
    w.startBattle = (m, b) => { w.__battles.push(m && (m.id || m.nameKey || String(m))); };
    w.__msgs = [];
    const sm = w.showMessage.bind(w);
    w.showMessage = (t, ...r) => { w.__msgs.push(String(t).slice(0, 120)); return sm(t, ...r); };
  });
}

async function scene(page, fn, arg) {
  return page.evaluate(([src, a]) => {
    const w = window.__PHASER_GAME__.scene.getScene('WorldMapScene');
    const gs = window.__GAME_STATE__;
    // eslint-disable-next-line no-new-func
    return (new Function('w', 'gs', 'a', src))(w, gs, a);
  }, [fn, arg]);
}

// Place the hero on a cell (engine coordinate convention: sprite centre on the cell centre).
async function teleport(page, x, y) {
  return scene(page, `
    w.isMoving=false; w.showingMessage=false; try{w.hideMessage()}catch(e){}
    w.heroTileX=a[0]; w.heroTileY=a[1]; w.hero.x=a[0]*48+24; w.hero.y=a[1]*48+24;
    w.updatePosition(); w.updateCamera(); return [w.heroTileX,w.heroTileY];`, [x, y]);
}

async function clearMsg(page) {
  await scene(page, `w.showingMessage=false; try{w.hideMessage()}catch(e){} w.dialogQueue=[];`);
}

const KEY = { up: 'ArrowUp', down: 'ArrowDown', left: 'ArrowLeft', right: 'ArrowRight' };
async function hold(page, dir, ms) {
  await page.keyboard.down(KEY[dir]);
  await page.waitForTimeout(ms);
  await page.keyboard.up(KEY[dir]);
}
// One engine step on an engine-stepped floor: hold until the tile changes or timeout.
async function step(page, dir, opts = {}) {
  const before = await scene(page, 'return [w.heroTileX,w.heroTileY]');
  await page.keyboard.down(KEY[dir]);
  const t0 = Date.now();
  let now = before;
  while (Date.now() - t0 < (opts.timeout ?? 1500)) {
    await page.waitForTimeout(30);
    now = await scene(page, 'return [w.heroTileX,w.heroTileY]');
    if (now[0] !== before[0] || now[1] !== before[1]) break;
  }
  await page.keyboard.up(KEY[dir]);
  await page.waitForTimeout(opts.after ?? 450);
  return { before, after: await scene(page, 'return [w.heroTileX,w.heroTileY]') };
}

function findTiles(md, v) {
  const out = [];
  for (let y = 0; y < md.length; y++) for (let x = 0; x < md[y].length; x++) if (md[y][x] === v) out.push([x, y]);
  return out;
}

module.exports = { URL_, save, launch, fresh, newPage, enter, scene, teleport, clearMsg, hold, step, findTiles, KEY };
