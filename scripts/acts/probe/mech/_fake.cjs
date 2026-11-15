'use strict';
// A fake engine for mechanic modules (batch A): loads kit-a.js and one module in a vm, feeds it a
// plan JSON through the same ctx shape dq-tiles.js gives (ctx.plan as export_runtime.py writes
// it), and moves a sole point over the plan's cells. No browser: this checks the RULES of a
// mechanic against the plan (the probes under this folder check it in the game).
//   const F = require('./_fake.cjs'); const w = F.world('ironMine', 1, 'mine-carts');
const fs = require('fs'), path = require('path'), vm = require('vm');
const ROOT = path.resolve(__dirname, '../../../..');
const PLANS = process.env.D2_PLANS || '/home/user/work/plans/out';
const TILE = 48, FOOT = 31;
const WALK = new Set('.=gtzqh'.split(''));
const OPEN = { frozenLake: '~', oasisDepths: 'wd' };
const KIND = { stairsPrev: 'stairsUp', stairsNext: 'stairsDown' };
const TILEOF = { mouth: 6, stairsUp: 6, stairsDown: 9, chest: 4, boss: 7, save: 14, sign: 18, mouth2: 10 };

function chain() {                                         // a Phaser object that accepts anything
  const o = { x: 0, y: 0, depth: 0, alpha: 1, visible: true, texture: { key: '' }, width: 48, height: 48, scene: null, list: [] };
  const self = new Proxy(o, { get(t, k) { if (k in t) return t[k]; if (typeof k === 'symbol') return undefined;
    return (...a) => { if (k === 'setPosition') { t.x = a[0]; t.y = a[1]; } else if (k === 'setDepth') t.depth = a[0]; else if (k === 'setAlpha') t.alpha = a[0];
      else if (k === 'setVisible') t.visible = a[0]; else if (k === 'setTexture') t.texture = { key: a[0] }; else if (k === 'destroy') t.destroyed = true; else if (k === 'setRotation') t.rotation = a[0];
      return self; }; }, set(t, k, v) { t[k] = v; return true; } });
  return self;
}
function world(id, floor, mechId, opts = {}) {
  const plan = JSON.parse(fs.readFileSync(path.join(PLANS, `${id}-f${floor}.json`), 'utf8'));
  const open = new Set([...WALK, ...(OPEN[id] || '')]);
  const W = plan.width, H = plan.height;
  const assets = [], mech = [];
  for (const a of plan.assets) { const k = KIND[a.kind] || a.kind;
    if (k === 'mouth') assets.push({ ...a, kind: (floor > 1 || a.sealedUntil) ? 'mouth2' : 'mouth' });
    else if (TILEOF[k] !== undefined) assets.push({ ...a, kind: k }); else mech.push(a); }
  const tiles = plan.rows.map(r => r.split('').map(c => open.has(c) ? 0 : 1));
  for (const a of assets) tiles[a.y][a.x] = TILEOF[a.kind];
  const flags = opts.flags || {};
  const msgs = [], battles = [], sfx = [], moves = [];
  const hero = { x: 0, y: 0, dir: 0 };
  const cam = { scrollX: 0, scrollY: 0, width: 390, height: 844, shake() {}, setBounds() {}, removeBounds() {}, pan() {}, stopFollow() {}, startFollow() {}, worldView: { x: 0, y: 0, width: 390, height: 844 }, zoom: 1 };
  const scene = { hero, mapData: tiles, currentMapId: id, currentFloor: floor, showingMessage: false, isMoving: false,
    add: new Proxy({}, { get: () => () => chain() }), make: new Proxy({}, { get: () => () => chain() }),
    textures: { exists: () => true, createCanvas: () => ({ getContext: () => new Proxy({}, { get: () => () => {} }), refresh() {} }) },
    tweens: { add: (c) => { if (c && c.onComplete) c.onComplete(); return chain(); }, killTweensOf() {} },
    time: { now: 0, delayedCall: (ms, fn) => { timers.push({ at: clock + ms, fn }); } },
    cameras: { main: cam }, events: { on() {}, off() {}, once() {} }, scene: { isActive: k => k === 'WorldMapScene', isPaused: () => false },
    updateHUD() {}, showMessage(t) { msgs.push(String(t)); } };
  const timers = []; let clock = 0;
  const win = { __GAME_STATE__: { player: { state: { storyFlags: flags, hp: 100, maxHp: 100, locale: 'en' }, totalMaxHp: 100 } },
    __QOK: { loc: () => opts.locale || 'en', state: () => win.__GAME_STATE__, audio: { playSfx: n => sfx.push(n) } }, setTimeout: (fn) => fn(), console };
  let mod = null;
  win.__QOK_DNG2__ = { register(mid, m) { if (mid === mechId) mod = m; return m; } };
  win.window = win;
  const sb = vm.createContext({ window: win, setTimeout: (fn) => fn(), console, Math, Date, JSON, Object, Array, String, Number, isNaN, parseInt, parseFloat, Infinity });
  for (const f of ['kit-a.js', mechId + '.js']) vm.runInContext(fs.readFileSync(path.join(ROOT, 'public/acts-dungeons/modules', f), 'utf8'), sb, { filename: f });
  if (!mod) throw new Error('module did not register ' + mechId);
  const fl = { width: W, height: H, totalFloors: plan.totalFloors, rows: plan.rows.map(r => r.split('').map(c => open.has(c) ? '.' : '#').join('')), assets, land: {},
    mechanic: plan.mechanic, terrain: plan.rows, mech, zones: plan.zones || [] };
  const maskFree = (px, py) => { const x = Math.floor(px / TILE), y = Math.floor(py / TILE); return !!(plan.rows[y] && open.has(plan.rows[y][x])) && [0, 4, 14, 18, 7].indexOf(tiles[y][x]) <= 0; };
  const owned = [];
  const ctx = { scene, id, floor, key: `${id}-f${floor}`, plan: fl, mechanic: plan.mechanic, TILE, mod, state: {}, _owned: owned,
    depth: { ground: 2, object: 3, hero: 10, over: 10.6 },
    flags: () => flags, flagKey: n => `d2.${id}.f${floor}.${n}`,
    tile: (x, y) => (tiles[y] ? tiles[y][x] : undefined), setTile: (x, y, t) => { if (tiles[y]) tiles[y][x] = t; },
    terrain: (x, y) => (plan.rows[y] && plan.rows[y][x]) || '#',
    hero: () => ({ x: hero.x, y: hero.y, footY: hero.y + FOOT, tx: Math.floor(hero.x / TILE), ty: Math.floor(hero.y / TILE), dir: hero.dir }),
    place: (px, py, dir) => { hero.x = px; hero.y = py; if (dir !== undefined) hero.dir = dir; },
    own: o => { owned.push(o); return o; }, say: (t) => { msgs.push(String(t)); scene.showingMessage = false; },
    maskFree, battle: (mid, after) => { battles.push(mid); if (after) after(); return true; }, busy: () => false, Z: k => k, locale: () => 'en',
    bossDown: () => !!opts.bossDown, art: () => null, toFloor: (fl2, spot) => { moves.push({ floor: fl2, spot }); return true; } };
  // can her soles be at (px,py)?
  const free = (px, py) => { const r = mod.free ? mod.free(ctx, px, py, Math.floor(px / TILE), Math.floor(py / TILE)) : undefined; return r === true ? true : r === false ? false : maskFree(px, py); };
  const soles = () => [hero.x, hero.y + FOOT];
  const setSoles = (sx, sy) => { hero.x = sx; hero.y = sy - FOOT; };
  let lastCell = null;
  // one engine frame: input hook, movement toward the stick, step hook, tick
  function frame(stick, dt = 16) {
    clock += dt; scene.time.now = clock;
    for (let i = timers.length - 1; i >= 0; i--) if (timers[i].at <= clock) { const t = timers.splice(i, 1)[0]; t.fn(); }
    let inp = stick || null;
    if (mod.input) { const r = mod.input(ctx, inp, hero.x, hero.y); if (r !== undefined) inp = r; }
    if (inp && (inp.x || inp.y)) { const l = Math.hypot(inp.x, inp.y) || 1, sp = 260 * dt / 1000 * (inp.m === undefined ? 1 : inp.m); const n = Math.max(1, Math.ceil(sp / 4));
      for (let k = 0; k < n; k++) { const [sx, sy] = soles(), nx = sx + inp.x / l * sp / n, ny = sy + inp.y / l * sp / n;
        if (free(nx, ny)) setSoles(nx, ny);
        else { if (mod.bump) mod.bump(ctx, Math.floor((sx + inp.x / l * 24) / TILE), Math.floor((sy + inp.y / l * 24) / TILE), inp.x / l, inp.y / l, undefined, { px: sx, py: sy, wall: true });
          if (free(nx, sy)) setSoles(nx, sy); else if (free(sx, ny)) setSoles(sx, ny); else break; } } }
    const c = [Math.floor(hero.x / TILE), Math.floor(hero.y / TILE)];
    if (!lastCell || c[0] !== lastCell[0] || c[1] !== lastCell[1]) { const p = lastCell || c; lastCell = c; if (mod.step) mod.step(ctx, c[0], c[1], p[0], p[1]); }
    if (mod.tick) mod.tick(ctx, dt);
  }
  // walk her soles to the centre of a cell by BFS over cells (4-neighbour, cell-centre free); returns true on arrival
  function walkTo(cx, cy, { maxFrames = 6000, stopIf = null } = {}) {
    for (let guard = 0; guard < 40; guard++) {
      const [sx, sy] = soles(), from = [Math.floor(sx / TILE), Math.floor(sy / TILE)];
      if (from[0] === cx && from[1] === cy && Math.hypot(sx - (cx + .5) * TILE, sy - (cy + .5) * TILE) < 6) return true;
      const prev = new Map(), q = [from]; prev.set(from.join(), null); let found = false;
      while (q.length) { const [x, y] = q.shift(); if (x === cx && y === cy) { found = true; break; }
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const nx = x + dx, ny = y + dy, k = nx + ',' + ny; if (prev.has(k) || nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
          if (!free((nx + .5) * TILE, (ny + .5) * TILE) && !(nx === cx && ny === cy)) continue; prev.set(k, [x, y]); q.push([nx, ny]); } }
      if (!found) return false;
      const pathc = []; let c = [cx, cy]; while (c) { pathc.push(c); c = prev.get(c.join()); } pathc.reverse();
      for (const [px, py] of pathc) { const tx = (px + .5) * TILE, ty = (py + .5) * TILE; let n = 0;
        for (;;) { const [ax, ay] = soles(), d = Math.hypot(tx - ax, ty - ay); if (d < 4) break; if (n++ > maxFrames) return false;
          const before = soles(); frame({ x: (tx - ax) / d, y: (ty - ay) / d, m: 1 });
          if (stopIf && stopIf()) return 'stopped';
          const after = soles(); if (Math.hypot(after[0] - before[0], after[1] - before[1]) < 0.01 && n > 30) break; } }
    }
    return false;
  }
  // push her soles toward a cell's centre for a few frames (walking up to an object)
  function pushAt(cx, cy, frames = 30) { for (let i = 0; i < frames; i++) { const [sx, sy] = soles(), dx = (cx + .5) * TILE - sx, dy = (cy + .5) * TILE - sy, d = Math.hypot(dx, dy) || 1; frame({ x: dx / d, y: dy / d, m: 1 }); } }
  // walk to a free cell beside (cx,cy), lean on it, and tap the prompt: returns the verb, or null
  function use(cx, cy) { for (const [dx, dy] of [[0, 1], [0, -1], [1, 0], [-1, 0]]) { const x = cx + dx, y = cy + dy; if (!free((x + .5) * TILE, (y + .5) * TILE)) continue;
    if (walkTo(x, y) !== true) continue; pushAt(cx, cy, 20); const v = tap(); if (v) return v; } return null; }
  function idle(ms, dt = 16) { for (let t = 0; t < ms; t += dt) frame(null, dt); }
  function prompt() { const [sx, sy] = soles(); return mod.interact ? mod.interact(ctx, sx, sy, null) : null; }
  function tap() { const p = prompt(); if (!p || !p.act) return null; p.act(); return p.verb; }
  mod.load && mod.load(ctx);
  return { plan, ctx, mod, scene, flags, msgs, battles, sfx, moves, hero, free, soles, setSoles, frame, walkTo, pushAt, use, idle, prompt, tap, tiles, reload() { ctx.state = {}; mod.load(ctx); lastCell = null; } };
}
let fails = 0;
function check(name, ok, note) { if (!ok) fails++; console.log(`[${ok ? 'PASS' : 'FAIL'}] ${name}${note !== undefined ? ' -- ' + (typeof note === 'string' ? note : JSON.stringify(note)) : ''}`); return ok; }
function done(label) { console.log(`${label}: ${fails} FAIL`); process.exit(fails ? 1 : 0); }
module.exports = { world, check, done, TILE, FOOT, PLANS };
