'use strict';
// Node harness for the MECH-B mechanic modules: loads kit-b.js and one module into a fake window
// with a stub Phaser scene, and hands back a ctx built from the plan JSON exactly as the engine's
// a2dMakeCtx builds it from the exported manifest floor (export_runtime.py: terrain = plan rows,
// mech = the plan's mechanic assets, zones, mechanic verbatim). No browser.
//   node scripts/acts/probe/mech/_b-unit.cjs [mechanic-id ...]
const fs = require('fs'), path = require('path'), vm = require('vm');
const ROOT = path.resolve(__dirname, '../../../..');
const PLANS = process.env.D2_PLANS || '/home/user/work/plans/out';
const MOD = path.join(ROOT, 'public/acts-dungeons/modules');
const STD = new Set(['mouth', 'stairsPrev', 'stairsNext', 'chest', 'boss', 'save', 'sign']);
const WALK = '.=gtzqh';

function thing(init) {                                             // a display object: remembers what set*() gave it
  const t = Object.assign({ x: 0, y: 0, alpha: 1, depth: 0, visible: true, destroyed: false, angle: 0 }, init || {});
  const p = new Proxy(t, {
    get(o, k) {
      if (k in o) return o[k];
      if (k === 'destroy') return () => { o.destroyed = true; };
      if (typeof k === 'string' && k.startsWith('set') && k.length > 3) return (...a) => { const n = k[3].toLowerCase() + k.slice(4);
        if (n === 'position') { o.x = a[0]; o.y = a[1]; } else o[n] = a.length > 1 ? a : a[0]; return p; };
      if (typeof k === 'symbol') return undefined;
      return () => p;
    },
    set(o, k, v) { o[k] = v; return true; }
  });
  return p;
}
const anyStub = () => new Proxy(function () {}, { get: (o, k) => (k === Symbol.toPrimitive ? () => 0 : anyStub()), apply: () => anyStub(), set: () => true });

function load(mechId) {
  const reg = {}, made = [], said = [], battles = [], tweens = [], timers = [];
  const state = { storyFlags: {}, hp: 100, maxHp: 100, locale: 'en', kanjiMode: false };
  const win = {
    __QOK_DNG2__: { register: (id, m) => { reg[id] = m; return m; } },
    __GAME_STATE__: { player: { state, totalMaxHp: 100 }, encounterManager: { stepsSinceLastEncounter: 0, forceEncounter: z => ({ id: z === 'sunken-temple' ? 'templeGuard' : 'demon', spriteKey: 'monster-x', zone: z }) } },
    __QOK: { loc: () => state.locale, Z: k => k },
    Image: function () { this.onload = null; }, setTimeout: () => 0, console
  };
  const wall = { now: 1000 }; win.Date = { now: () => wall.now };          // modules read wall time through Date.now()
  win.window = win;
  const sandbox = vm.createContext(win);
  for (const f of ['kit-b.js', mechId + '.js']) vm.runInContext(fs.readFileSync(path.join(MOD, f), 'utf8'), sandbox, { filename: f });
  const mod = reg[mechId]; if (!mod) throw new Error('module did not register ' + mechId);
  const hero = { x: 0, y: 0, dir: 0 };
  const scene = {
    hero, heroTileX: 0, heroTileY: 0, heroDir: 0, isMoving: false, showingMessage: false, mapData: null, currentMapId: null, currentFloor: 1,
    add: new Proxy({}, { get: (o, k) => (...a) => { const t = thing({ kind: k, args: a, x: typeof a[0] === 'number' ? a[0] : 0, y: typeof a[1] === 'number' ? a[1] : 0 }); made.push(t); return t; } }),
    textures: { exists: () => true, addImage() {}, createCanvas: () => ({ getContext: () => anyStub(), refresh() {} }), get: () => anyStub() },
    tweens: { add: cfg => { tweens.push(cfg); return thing(); }, isTweening: () => false, killTweensOf() {} },
    time: { now: 0, delayedCall: (ms, fn) => { timers.push({ at: scene.time.now + ms, fn }); return thing(); } },
    cameras: { main: anyStub() }, scene: { isPaused: () => false },
    showMessage: (t, n) => { said.push(t); }, startBattle: m => { battles.push(m); }, updateHUD() {}, updateCamera() {}, updatePosition() {},
    mazeHunterEnabled: true, shadowPortalEnabled: true, windTowerEnabled: true, portalPairs: [{}]
  };
  function ctxFor(fid) {
    const plan = JSON.parse(fs.readFileSync(path.join(PLANS, fid + '.json'), 'utf8'));
    const assets = [], mech = [];
    for (const a of plan.assets) (STD.has(a.kind) ? assets : mech).push(a);
    const fl = { width: plan.width, height: plan.height, rows: plan.rows.map(r => [...r].map(c => (WALK.includes(c) || c === '~') ? '.' : '#').join('')),
      assets, land: {}, mechanic: plan.mechanic, terrain: plan.rows, mech, zones: plan.zones || [] };
    const tiles = fl.rows.map(r => [...r].map(c => (c === '.' ? 0 : 1)));
    for (const a of assets) tiles[a.y][a.x] = { chest: 4, boss: 7, save: 14, sign: 18, mouth: 6, stairsPrev: 6, stairsNext: 9 }[a.kind];
    scene.mapData = tiles; scene.currentMapId = plan.dungeonId; scene.currentFloor = plan.floor;
    const owned = [];
    const ctx = { scene, id: plan.dungeonId, floor: plan.floor, key: fid, plan: fl, mechanic: plan.mechanic, TILE: 48, mod, state: {}, _owned: owned,
      depth: { ground: 2, object: 3, hero: 10, over: 10.6 },
      flags: () => state.storyFlags, flagKey: n => 'd2.' + plan.dungeonId + '.f' + plan.floor + '.' + n,
      tile: (x, y) => (tiles[y] ? tiles[y][x] : undefined), setTile: (x, y, t) => { if (tiles[y]) tiles[y][x] = t; },
      terrain: (x, y) => { const r = plan.rows[y]; return r && x >= 0 && x < r.length ? r.charAt(x) : '#'; },
      hero: () => ({ x: hero.x, y: hero.y, footY: hero.y + 31, tx: scene.heroTileX, ty: scene.heroTileY, dir: scene.heroDir }),
      place: (px, py, dir) => { hero.x = px; hero.y = py; scene.heroTileX = (px / 48) | 0; scene.heroTileY = (py / 48) | 0; if (dir !== undefined) scene.heroDir = dir; },
      own: o => { owned.push(o); return o; }, say: (t, n) => { said.push(t); } };
    ctx.rawPlan = plan;
    return ctx;
  }
  // put her SOLES at a pixel / at a cell centre
  const stand = (ctx, sx, sy) => ctx.place(sx, sy - 31);
  const standCell = (ctx, cx, cy) => stand(ctx, cx * 48 + 24, cy * 48 + 24);
  const flushTweens = () => { while (tweens.length) { const t = tweens.shift(); try { if (t.onUpdate) t.onUpdate({ progress: 1, getValue: () => 1 }, t.targets); if (t.onComplete) t.onComplete(); } catch (e) { console.log('tween', e); } } };
  const runTimers = ms => { scene.time.now += ms; for (const t of timers.splice(0)) { if (t.at <= scene.time.now) t.fn(); else timers.push(t); } };
  return { wall, win, mod, kit: win.__QOK_D2KIT_B__, scene, state, made, said, battles, tweens, ctxFor, stand, standCell, flushTweens, runTimers, hero };
}
const floorsOf = id => { const p = JSON.parse(fs.readFileSync(path.join(PLANS, id + '-f1.json'), 'utf8')); return Array.from({ length: p.totalFloors }, (_, i) => `${id}-f${i + 1}`); };
module.exports = { load, floorsOf, PLANS, MOD, ROOT, WALK };
