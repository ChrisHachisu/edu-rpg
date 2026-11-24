'use strict';
// AUTHORED Acts 2-5 dungeons, end to end, by the real entry path (AGENTS.md rule 7): a v4 save
// seeded on the overworld at the dungeon's remapped exit, Continue from the title, a real walk
// into the mouth, then for every floor: the plan's own route, every chest, the crystals, the
// stairs; the boss on the last floor; the way out. One Chromium, phone viewport, a screenshot of
// every floor.
//
//   NODE_PATH=/opt/node-tools/node_modules PROBE_URL=http://127.0.0.1:5190/ PROBE_OUT=<dir> \
//     node scripts/acts/probe/dungeon_authored.cjs emberMines obsidianCavern [ironMine:smoke] [obsidianCavern:pillars]
//
// D2_NAV (default /home/user/work/e1/nav) holds the navigation grids export_runtime.py writes
// beside the runtime files (12 px cells where her soles may stand, the plan's route, the landings).
// `<id>:smoke` enables a manifest entry that ships disabled, and checks layout + art only on the
// floors the manifest carries. `<id>:pillars` checks walk-behind on floor 1's first pillar only;
// `<id>:off` checks the kill switch (localStorage['qok-dungeons2']='0'): the bundle's generated floor.
const fs = require('fs'), path = require('path');
const L = require('./lib.cjs');
const PT = require('./playthrough/ptio.cjs');
const ROOT = path.resolve(__dirname, '../../..');
const NAVDIR = process.env.D2_NAV || '/home/user/work/e1/nav';
const acts = JSON.parse(fs.readFileSync(path.join(ROOT, 'public/acts-hifi/manifest.json'), 'utf8'));
const man = JSON.parse(fs.readFileSync(path.join(ROOT, 'public/acts-dungeons/manifest.json'), 'utf8'));
const QUESTS = { emberMines: ['flameCloak'], obsidianCavern: ['lunasProphecy'], oasisDepths: ['lunasMap'], scorchedRuins: ['ancientRelic'] };
const CELL = 48;
const rows = [], shots = [];
const rec = (dungeon, check, ok, note) => { const r = { dungeon, check, status: ok === true ? 'PASS' : ok === false ? 'FAIL' : String(ok), note: note === undefined ? '' : (typeof note === 'string' ? note : JSON.stringify(note)).slice(0, 700) };
  rows.push(r); console.log(`[${r.status}] ${dungeon}: ${check}${r.note ? ' -- ' + r.note : ''}`); flush(); return ok === true; };
const flush = () => fs.writeFileSync(path.join(L.OUT, 'dungeon_authored.json'), JSON.stringify({ rows, shots }, null, 1));
const nav = key => JSON.parse(fs.readFileSync(path.join(NAVDIR, key + '.json'), 'utf8'));

// ---- in-page helpers -------------------------------------------------------------------------
const PILOT = () => {
  if (window.__D2P) return;
  const G = () => window.__PHASER_GAME__, W = () => G().scene.getScene('WorldMapScene');
  const wait = ms => new Promise(r => setTimeout(r, ms));
  const KC = { z: 90 };
  const fire = (type, key) => { const ev = new KeyboardEvent(type, { key, code: 'Key' + key.toUpperCase(), bubbles: true, cancelable: true });
    try { Object.defineProperty(ev, 'keyCode', { get: () => KC[key] }); Object.defineProperty(ev, 'which', { get: () => KC[key] }); } catch (e) {} window.dispatchEvent(ev); };
  const tapKey = async k => { fire('keydown', k); await wait(40); fire('keyup', k); };
  const onField = () => { const g = G(); return g.scene.isActive('WorldMapScene') && !g.scene.isPaused('WorldMapScene') && !g.scene.isActive('BattleScene'); };
  let msgs = [];
  const hook = () => { const w = W(); if (w.__d2pMsg) return; w.__d2pMsg = true; const o = w.showMessage;
    w.showMessage = function (t) { try { msgs.push(String(t)); } catch (e) {} return o.apply(this, arguments); }; };
  const footDy = 31;
  const state = () => { const w = W(), d = window.__QOK_DNG2__; return { map: w.currentMapId, floor: w.currentFloor || 1, x: w.heroTileX, y: w.heroTileY,
    hx: w.hero ? w.hero.x : null, hy: w.hero ? w.hero.y : null, w: w.mapData[0].length, h: w.mapData.length, msg: !!w.showingMessage, field: onField(),
    waiting: !!w.__a1dEntryWaiting, degraded: !!w.__a1dEntryDegraded, err: w.__a1dEntryError || null, d2: d ? d.state() : null,
    scenes: G().scene.getScenes(true).map(s => s.scene.key), hp: window.__GAME_STATE__.player.state.hp }; };
  const dismiss = async (max = 14) => { let n = 0; const w = W(); while (onField() && w.showingMessage && n < max) { await tapKey('z'); await wait(260); n++; } return n; };
  // Steer the stick through sole-point waypoints (world px). Ends on arrival, a floor/map change,
  // a message, a battle, or no progress.
  async function drive(pts, { tol = 7, maxMs = 60000, until = null, hold = 0 } = {}) {
    const w = W(), m0 = w.currentMapId, f0 = w.currentFloor || 1, t0 = performance.now(); let i = 0, stuck = 0, last = null, moved = 0, lastDir = null;
    try {
      for (;;) {
        if (w.currentMapId !== m0 || (w.currentFloor || 1) !== f0) return { ok: true, why: 'changed', moved };
        if (!onField()) return { ok: true, why: 'scene', moved };
        if (w.showingMessage) return { ok: true, why: 'message', moved };
        if (until && until()) return { ok: true, why: 'until', moved };
        if (i >= pts.length) {                                            // a player keeps pushing into a staircase: hold the last heading a moment
          if (hold && lastDir) { const t1 = performance.now(); while (performance.now() - t1 < hold && w.currentMapId === m0 && (w.currentFloor || 1) === f0 && onField() && !w.showingMessage) {
            window.__DQ_STICK__ = { x: lastDir[0], y: lastDir[1], m: 1 }; await new Promise(r => requestAnimationFrame(r)); } }
          return { ok: true, why: (w.currentMapId !== m0 || (w.currentFloor || 1) !== f0) ? 'changed' : 'arrived', moved }; }
        if (performance.now() - t0 > maxMs) return { ok: false, why: 'timeout', i, n: pts.length, at: [w.hero.x, w.hero.y + footDy], moved };
        const sx = w.hero.x, sy = w.hero.y + footDy, dx = pts[i][0] - sx, dy = pts[i][1] - sy, d = Math.hypot(dx, dy);
        if (d < tol) { i++; continue; }
        window.__DQ_STICK__ = { x: dx / d, y: dy / d, m: 1 }; lastDir = Math.abs(dx) >= Math.abs(dy) ? [Math.sign(dx), 0] : [0, Math.sign(dy)];
        await new Promise(r => requestAnimationFrame(r));
        if (last) { const st = Math.hypot(w.hero.x - last[0], w.hero.y - last[1]); moved += st; stuck = st < 0.02 ? stuck + 1 : 0; }
        last = [w.hero.x, w.hero.y];
        if (stuck > 150) return { ok: false, why: 'stuck', i, n: pts.length, at: [sx, sy], to: pts[i], moved };
      }
    } finally { window.__DQ_STICK__ = { x: 0, y: 0, m: 0 }; }
  }
  async function push(vx, vy, ms, until) { const t0 = performance.now(), w = W(), m0 = w.currentMapId, f0 = w.currentFloor || 1; const l = Math.hypot(vx, vy) || 1;
    try { while (performance.now() - t0 < ms) { if (w.currentMapId !== m0 || (w.currentFloor || 1) !== f0 || !onField() || w.showingMessage || (until && until())) break;
      window.__DQ_STICK__ = { x: vx / l, y: vy / l, m: 1 }; await new Promise(r => requestAnimationFrame(r)); } }
    finally { window.__DQ_STICK__ = { x: 0, y: 0, m: 0 }; } return state(); }
  window.__D2P = { state, dismiss, drive, push, wait, tapKey, onField, hook, msgs: () => msgs, clearMsgs: () => { msgs = []; },
    tile: (x, y) => { const r = W().mapData[y]; return r ? r[x] : undefined; },
    flags: () => ({ ...window.__GAME_STATE__.player.state.storyFlags }),
    prompt: () => { const e = document.getElementById('a1mInteract'); return e && e.classList.contains('a1m-show') ? e.textContent : null; },
    crystal: () => { const e = document.getElementById('a1mCrystal'); return e ? [...e.querySelectorAll('[role=button]')].map(b => b.textContent) : null; } };
  hook();
};

// ---- navigation on the exported grid (node side) -----------------------------------------------
function astar(N, from, goalFn) {                                   // from: nav cell [gx,gy]; returns list of nav cells or null
  // A cell where her CENTRE would stand on a staircase or a mouth is a way off the floor: only a goal may be one.
  const way = new Set((N.assets || []).filter(a => /^(stairsUp|stairsDown|mouth|mouth2)$/.test(a.kind)).map(a => a.x + ',' + a.y));
  const tileOf = (x, y) => Math.floor((x + .5) * N.cell / CELL) + ',' + Math.floor(((y + .5) * N.cell - N.footDy) / CELL);
  const onWay = (x, y) => { const k = tileOf(x, y); return way.has(k) && k !== goalFn.way; };
  const H = N.rows.length, Wd = N.rows[0].length, ok = (x, y) => x >= 0 && y >= 0 && x < Wd && y < H && N.rows[y][x] === '1' && (!onWay(x, y) || (x === from[0] && y === from[1]));
  const key = (x, y) => y * Wd + x, prev = new Int32Array(Wd * H).fill(-2), q = [from]; prev[key(from[0], from[1])] = -1;
  const D = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]];
  for (let i = 0; i < q.length; i++) { const [x, y] = q[i];
    if (goalFn(x, y)) { const out = []; let k = key(x, y); while (k >= 0) { out.push([k % Wd, (k / Wd) | 0]); k = prev[k]; } return out.reverse(); }
    for (const [dx, dy] of D) { const nx = x + dx, ny = y + dy; if (!ok(nx, ny) || prev[key(nx, ny)] !== -2) continue;
      if (dx && dy && (!ok(x + dx, y) || !ok(x, y + dy))) continue; prev[key(nx, ny)] = key(x, y); q.push([nx, ny]); } }
  return null;
}
const nearestNav = (N, sx, sy) => { const c = N.cell, H = N.rows.length, Wd = N.rows[0].length; let best = null, bd = 1e9; const gx = Math.floor(sx / c), gy = Math.floor(sy / c);
  for (let r = 0; r <= 6 && !best; r++) for (let y = gy - r; y <= gy + r; y++) for (let x = gx - r; x <= gx + r; x++) {
    if (x < 0 || y < 0 || x >= Wd || y >= H || N.rows[y][x] !== '1') continue; const d = Math.hypot((x + .5) * c - sx, (y + .5) * c - sy); if (d < bd) { bd = d; best = [x, y]; } }
  return best; };
const toPts = (N, cells) => cells.filter((_, i) => i % 2 === 1 || i === cells.length - 1).map(([x, y]) => [(x + .5) * N.cell, (y + .5) * N.cell]);

class Run {
  constructor(page, id) { this.page = page; this.id = id; this.n = 0; }
  ev(fn, arg) { return this.page.evaluate(fn, arg); }
  st() { return this.ev(() => window.__D2P.state()); }
  async shot(tag) { this.n++; const name = `${this.id}-${String(this.n).padStart(2, '0')}-${tag}`; const f = await L.shot(this.page, name); shots.push(path.basename(f)); return f; }
  async settle(ms = 20000) {                                       // floor picture + mask in, entry hold released
    const ok = await this.page.waitForFunction(() => { const s = window.__D2P.state(); return s.field && s.d2 && s.d2.art === 'ready' && s.d2.mask === 'ready' && !s.waiting; }, { timeout: ms }).then(() => true).catch(() => false);
    await this.page.waitForTimeout(700); return ok;
  }
  // Walk her soles to a nav cell chosen by goalFn(gx,gy).
  async go(N, goalFn, opts = {}) {
    // A message box left open (an arrival line, a sign) holds her: tap it away first, as a player does.
    // The text is kept in the log (window.__D2P.msgs()), so a wrong message is still visible to a check that reads it.
    let s = await this.st(); if (s.msg && s.field) { await this.ev(() => window.__D2P.dismiss()); s = await this.st(); }
    const from = nearestNav(N, s.hx, s.hy + N.footDy);
    if (!from) return { ok: false, why: 'off-grid', at: [s.hx, s.hy] };
    const p = astar(N, from, goalFn); if (!p) return { ok: false, why: 'no-path', from };
    return this.ev(([pts, o]) => window.__D2P.drive(pts, o), [toPts(N, p), { maxMs: opts.maxMs || 90000, tol: opts.tol || 7, hold: opts.hold || 0 }]);
  }
  nearCell(N, cx, cy, grow = 16) { const c = N.cell; return (gx, gy) => { const x = (gx + .5) * c, y = (gy + .5) * c;
    return x >= cx * CELL - grow && x <= (cx + 1) * CELL + grow && y >= cy * CELL - grow && y <= (cy + 1) * CELL + grow; }; }
  centreIn(N, cx, cy) { const c = N.cell; const fn = (gx, gy) => { const x = (gx + .5) * c, y = (gy + .5) * c - N.footDy;      // her CENTRE in the cell fires stairs and mouths
    return x >= cx * CELL + 6 && x <= (cx + 1) * CELL - 6 && y >= cy * CELL + 4 && y <= (cy + 1) * CELL - 4; }; fn.way = cx + ',' + cy; return fn; }
  // Walk up to an object the way a player does: stand square on one of its four sides, then push straight at it.
  // Ends in contact (the prompt pill is up, or the bump already opened / started it).
  async approach(N, cx, cy, pushMs = 700) {
    const c = N.cell, sides = [[(cx + .5) * CELL, (cy + 1) * CELL + 8, 0, -1], [cx * CELL - 8, (cy + .5) * CELL, 1, 0], [(cx + 1) * CELL + 8, (cy + .5) * CELL, -1, 0], [(cx + .5) * CELL, cy * CELL - 8, 0, 1]];
    let last = { ok: false, why: 'no-side' };
    for (const [px, py, dx, dy] of sides) {
      const gx = Math.floor(px / c), gy = Math.floor(py / c); if (!N.rows[gy] || N.rows[gy][gx] !== '1') continue;
      const g = await this.go(N, (x, y) => x === gx && y === gy, { tol: 4 }); last = g;
      if (!g.ok || g.why !== 'arrived') { if (g.why === 'message' || g.why === 'scene') return g; continue; }
      await this.ev(([dx, dy, ms]) => window.__D2P.push(dx, dy, ms, () => !!window.__D2P.prompt()), [dx, dy, pushMs]); await this.page.waitForTimeout(250);
      return { ok: true, why: 'contact', side: [dx, dy] };
    }
    return last;
  }
  async bump(cx, cy, ms = 1500) {                                   // push her soles at the cell's centre
    const s = await this.st(); const vx = (cx + .5) * CELL - s.hx, vy = (cy + .5) * CELL - (s.hy + 31);
    return this.ev(([vx, vy, ms]) => window.__D2P.push(vx, vy, ms), [vx, vy, ms]);
  }
  async tapPrompt() { const loc = this.page.locator('#a1mInteract.a1m-show').first(); const box = await loc.boundingBox().catch(() => null); if (!box) return false; await loc.tap({ timeout: 3000 }).catch(() => {}); await this.page.waitForTimeout(350); return true; }
  async tapCrystal(i) { const loc = this.page.locator('#a1mCrystal [role=button]').nth(i); const box = await loc.boundingBox().catch(() => null); if (!box) return false; await loc.tap({ timeout: 3000 }).catch(() => {}); return true; }
  async fight(maxMs = 150000) {
    const page = this.page, t0 = Date.now(); let roundsN = 0, monster = null;
    const ok = await page.waitForFunction(() => window.__PHASER_GAME__.scene.isActive('BattleScene'), { timeout: 20000 }).then(() => true).catch(() => false);
    if (!ok) return { entered: false };
    const tap = async (sel, timeout = 4000) => { const loc = page.locator(sel).first(); const dl = Date.now() + timeout; let box = null;
      while (Date.now() < dl) { box = await loc.boundingBox().catch(() => null); if (box && box.width >= 4) break; box = null; await page.waitForTimeout(150); } if (!box) return false; await loc.tap({ timeout: 4000 }).catch(() => {}); return true; };
    while (Date.now() - t0 < maxMs) {
      const s = await page.evaluate(() => { const g = window.__PHASER_GAME__, b = g.scene.getScene('BattleScene'); return { active: g.scene.isActive('BattleScene'), phase: b && b.phase, mon: b && b.monster && (b.monster.id || b.monster.nameKey), over: g.scene.isActive('GameOverScene') }; });
      if (!s.active) return { entered: true, won: !s.over, rounds: roundsN, monster };
      monster = monster || s.mon;
      if (s.phase === 'playerMenu') { await tap('[data-act="battleMenu"][data-i="0"]'); await page.waitForTimeout(500); }
      else if (/quiz/i.test(String(s.phase)) || (await page.evaluate(() => { const e = document.querySelector('#qok-ui .kpad, [data-act="quizAns"]'); return !!(e && e.offsetParent !== null); }))) {
        const idx = await page.evaluate(() => { const b = window.__PHASER_GAME__.scene.getScene('BattleScene'); const a = (b.quizQuestion && b.quizQuestion.answers) || []; return a.findIndex(x => !!x.isCorrect); }); roundsN++;
        if (idx < 0) await page.waitForTimeout(500); else { for (const qs of await L.quizTaps(page, idx)) await tap(qs); await page.waitForTimeout(800); } }
      else if (s.phase === 'message') { const t = await tap('[data-act="battleAdvance"]', 1500); if (!t) await page.mouse.click(195, 600).catch(() => {}); await page.waitForTimeout(450); }
      else { await page.waitForTimeout(300); await tap('[data-act="battleAdvance"]', 400); }
    }
    return { entered: true, won: false, timeout: true, rounds: roundsN, monster };
  }
}

async function runDungeon(spec) {
  let [id, mode] = spec.split(':');
  // A mechanic dungeon is played end to end by its own probe (mech/<mechanic>.cjs): here it gets the
  // layout checks of floor 1 (entry, landing, mouth, re-entry, the first stretch, a chest) with its
  // REAL module running, and the module API counted on that module ("layout", the default for them).
  const D0 = man.dungeons[id]; if (!mode && D0 && D0.mechanic && D0.mechanic !== 'none') mode = 'layout';
  const layout = mode === 'layout', smoke = mode === 'smoke' || layout;
  const D = man.dungeons[id]; if (!D) { rec(id, 'in the manifest', false); return; }
  const LM = acts.landmarks.find(l => l.mapId === id && !l.toFloor && !l.virtual);
  const { browser, page, errors } = await L.launch();
  const R = new Run(page, id);
  try {
    if (!LM) { rec(id, 'an overworld mouth (a portal-isle dungeon is entered from its isle: see its mech/ probe)', 'SKIP'); return; }
    // layout mode: the entrance locks of the bundle (Shadow Cave, Volcanic Forge, Magma Tunnels, and the Demon Castle's
    // four relics) are passed as a player who got there would
    const seed = { mapId: 'overworld', x: LM.exit[0], y: LM.exit[1], activeQuests: QUESTS[id] || [], flags: layout ? { ...L.allFlags(), 'boss.sandGolem.defeated': true } : {},
      ...(layout ? { inventory: [{ itemId: 'herb', quantity: 5 }, { itemId: 'flameCloak', quantity: 1 }, { itemId: 'windbreakerStone', quantity: 1 },
        ...['excalibur', 'aegisOfDawn', 'galeShield', 'crownOfWisdom'].map(itemId => ({ itemId, quantity: 1 }))] } : {}) };
    const extra = mode === 'smoke' ? { 'qok-dungeons2-smoke': '1' } : mode === 'off' ? { 'qok-dungeons2': '0' } : {};
    await L.bootSave(page, PT.seed() || L.save(seed), { extra });   // PT_SAVE: the story playthrough's own record
    await page.evaluate(PILOT);
    let p = await L.pos(page);
    rec(id, 'seeded save loads on the overworld at the remapped exit', p.map === 'overworld' && p.x === LM.exit[0] && p.y === LM.exit[1], p);
    // A do-nothing mechanic module under this dungeon's own mechanic id: proves every hook of the
    // module API fires and is handed the plan's mechanic data, without changing how the floor plays.
    const hookUp = () => layout ? wrapLive() : page.evaluate(mid => { const h = window.__d2hook = window.__d2hook || { load: 0, unload: 0, tick: 0, input: 0, free: 0, bump: 0, step: 0, interact: 0, mech: null };
      window.__QOK_DNG2__.register(mid, { load(c) { h.load++; h.mech = { id: c.mechanic.id, keys: Object.keys(c.mechanic), mechAssets: (c.plan.mech || []).map(a => a.kind), terrain: c.terrain(0, 0), flagKey: c.flagKey('x') }; },
        unload() { h.unload++; }, tick() { h.tick++; }, input() { h.input++; }, free() { h.free++; }, bump() { h.bump++; }, step() { h.step++; }, interact() { h.interact++; } }); }, D.mechanic);
    // layout mode: count the hooks of the live module (each wrapper hands the call on unchanged)
    const wrapLive = () => page.evaluate(() => { const h = window.__d2hook = window.__d2hook || { load: 0, unload: 0, tick: 0, input: 0, free: 0, bump: 0, step: 0, interact: 0, mech: null };
      const c = window.__QOK_DNG2__.ctx(), m = c && c.mod; if (!m) return false; if (m.__d2w) return true; m.__d2w = true;
      h.mech = { id: c.mechanic.id, keys: Object.keys(c.mechanic), mechAssets: (c.plan.mech || []).map(a => a.kind), terrain: c.terrain(0, 0), flagKey: c.flagKey('x'), real: true };
      for (const k of ['load', 'unload', 'tick', 'input', 'free', 'bump', 'step', 'interact']) { const o = m[k]; m[k] = function () { h[k]++; return o ? o.apply(this, arguments) : undefined; }; }
      return true; });
    await hookUp();
    const enter = async () => { await page.evaluate(() => window.__D2P && window.__D2P.dismiss());   // an open message box (a save repair, a quest line) holds her
      const r = await L.walkCells(page, [[LM.at[0], LM.at[1]]], { maxMs: 25000 }); await page.waitForTimeout(1200); await page.evaluate(PILOT); return r; };
    let r = await enter(); let s = await R.st();
    if (layout) { await R.settle(); rec(id, `the real ${D0.mechanic} module is running on floor 1`, await wrapLive(), await R.st().then(x => x.d2)); }
    if (!rec(id, 'walking into the overworld mouth enters floor 1', s.map === id && s.floor === 1, { r, s })) return;
    if (mode === 'off') {                                          // kill switch: nothing fetched, the bundle's generated floor, and she can walk on it
      await page.waitForTimeout(2500); s = await R.st(); const F = man.floors[`${id}-f1`];
      rec(id, 'kill switch: the manifest is not loaded and floor 1 is the generated floor', s.d2.off === true && s.d2.loaded === false && !(s.w === F.width && s.h === F.height), { w: s.w, h: s.h, d2: s.d2 });
      const a = await L.pos(page); await page.keyboard.down('ArrowUp'); await page.waitForTimeout(900); await page.keyboard.up('ArrowUp'); await page.keyboard.down('ArrowDown'); await page.waitForTimeout(1500); await page.keyboard.up('ArrowDown'); await page.waitForTimeout(1500);
      const b = await L.pos(page); rec(id, 'kill switch: she can move on the generated floor (or leaves by its exit)', b.map !== a.map || b.x !== a.x || b.y !== a.y || b.hy !== a.hy, { a: [a.map, a.x, a.y], b: [b.map, b.x, b.y] });
      await R.shot('off-generated'); const bad = errors.filter(e => !/favicon|audio|\.mp3|\.ogg/.test(e.m)); rec(id, 'no page errors or failed requests', bad.length === 0, bad.slice(0, 5)); return; }
    let okS = await R.settle();
    const F1 = man.floors[`${id}-f1`], N1 = nav(`${id}-f1`);
    s = await R.st();
    rec(id, 'floor 1 is the authored floor (size, art, mask, layer)', okS && s.w === F1.width && s.h === F1.height && s.d2.layer === 'material', s);
    rec(id, 'she arrives on the baked landing inside the mouth', s.x === F1.land.mouth.x && s.y === F1.land.mouth.y, { at: [s.x, s.y], land: F1.land.mouth });
    await R.shot('f1-arrive');

    // out by the mouth, back in: the remapped overworld exit
    const mouth = F1.assets.find(a => a.kind === 'mouth' && !a.extra);
    r = await R.go(N1, R.centreIn(N1, mouth.x, mouth.y), { hold: 900 }); await page.waitForTimeout(1500);
    p = await L.pos(page);
    rec(id, 'the mouth leads back to the remapped overworld exit', p.map === 'overworld' && p.x === LM.exit[0] && p.y === LM.exit[1], { r, p });
    await page.waitForTimeout(1500); await L.noEncounters(page);
    // the engine's one-step transition cooldown eats the first door query after any transition: step away first, as a player does
    await L.walkCells(page, [[LM.exit[0], LM.exit[1] + 1]], { maxMs: 6000 }); await page.waitForTimeout(300);
    r = await enter(); await R.settle(); s = await R.st();
    if (!rec(id, 're-entry works', s.map === id && s.floor === 1, s)) return;

    if (mode === 'pillars') {                                      // walk-behind: a pillar's top is drawn over her while her soles are north of its base
      const ov = (F1.over || [])[0]; if (!ov) { rec(id, 'f1 has a pillar', false); return; }
      const depths = () => page.evaluate(k => window.__PHASER_GAME__.scene.getScene('WorldMapScene').children.list.filter(o => o.texture && o.texture.key === 'a2dover_' + k).map(o => [Math.round(o.x), Math.round(o.y), o.depth]), `${id}-f1`);
      const c = N1.cell, bx = ov.x + ov.w / 2, at = async (dy) => { const g = await R.go(N1, (gx, gy) => Math.abs((gx + .5) * c - bx) <= 10 && Math.abs((gy + .5) * c - (ov.by + dy)) <= 12, { tol: 4 }); await page.waitForTimeout(400); return g; };
      let g = await at(-34); let d = (await depths()).find(o => o[0] === ov.x && o[1] === ov.y); const heroD = await page.evaluate(() => window.__PHASER_GAME__.scene.getScene('WorldMapScene').hero.depth);
      rec(id, 'f1: behind a pillar its top is drawn over her', g.ok && g.why === 'arrived' && !!d && d[2] > heroD, { g: g.why, sprite: d, heroDepth: heroD }); await R.shot('f1-pillar-behind');
      g = await at(46); d = (await depths()).find(o => o[0] === ov.x && o[1] === ov.y);
      rec(id, 'f1: in front of the pillar she is drawn over it', g.ok && g.why === 'arrived' && !!d && d[2] < heroD, { g: g.why, sprite: d, heroDepth: heroD }); await R.shot('f1-pillar-front');
      const bad = errors.filter(e => !/favicon|audio|\.mp3|\.ogg/.test(e.m)); rec(id, 'no page errors or failed requests', bad.length === 0, bad.slice(0, 5)); return; }
    const floors = layout ? [1] : D.authoredFloors, total = D.floors; let hpTest = false, resumeTest = false, encTest = false;
    for (const f of floors) {
      const key = `${id}-f${f}`, FL = man.floors[key], N = nav(key);
      s = await R.st();
      if (!rec(id, `f${f}: on the authored floor`, s.map === id && s.floor === f && s.w === FL.width && s.h === FL.height && s.d2.art === 'ready' && s.d2.mask === 'ready', s)) return;
      if (f > 1) { const want = FL.land.fromPrev; rec(id, `f${f}: arrives beside the stairs back`, want && s.x === want.x && s.y === want.y, { at: [s.x, s.y], want }); await R.shot(`f${f}-arrive`); }
      if (smoke) { await R.ev(() => window.__D2P.clearMsgs());
        // The plan's route begins ON the mouth tile (2 cells outside the landing). For a south-facing mouth her centre stays
        // a row above it, but for a west/east-facing one walking there walks her out of the dungeon: start at the landing,
        // and never aim at a staircase or mouth tile.
        const land = f === 1 ? FL.land.mouth : FL.land.fromPrev, way = new Set(FL.assets.filter(a => /^(stairsUp|stairsDown|mouth|mouth2)$/.test(a.kind)).map(a => a.x + ',' + a.y));
        const dl = c => Math.abs(c[0] - land.x) + Math.abs(c[1] - land.y);
        const k0 = land ? N.route.reduce((b, c, i) => (dl(c) < dl(N.route[b]) ? i : b), 0) : 0;   // the route point nearest the landing
        const pts = N.route.slice(k0).filter((c, i) => i % 4 === 0 && !way.has(c[0] + ',' + c[1])).slice(0, 8); let reached = 0;
        for (const c of pts) { let g = await R.go(N, R.nearCell(N, c[0], c[1], 0), { maxMs: 30000 });
          if (g.why === 'message') g = await R.go(N, R.nearCell(N, c[0], c[1], 0), { maxMs: 30000 });
          if (g.ok && g.why === 'arrived') reached++; else break; }
        rec(id, `f${f} (smoke): the first stretch of the route is walkable on the painted floor`, reached >= Math.min(3, pts.length), { reached, of: pts.length });
        await R.shot(`f${f}-smoke`);
        for (const c of FL.assets.filter(a => a.kind === 'chest').slice(0, 1)) { const g = await R.go(N, R.nearCell(N, c.x, c.y, 16), { maxMs: 60000 }); if (g.ok) await R.shot(`f${f}-smoke-chest`); }
        continue; }

      // save + Continue inside the floor (once, on the second floor)
      if (!resumeTest && f === Math.min(2, floors[floors.length - 1])) { resumeTest = true;
        const mid = N.route[Math.min(8, N.route.length - 1)]; await R.go(N, R.nearCell(N, mid[0], mid[1], 0));
        const before = await R.st();
        // Inside a dungeon the game's save is the AUTO save (ui-overhaul: crystals, boss fights and "return to title" all
        // write it); Continue is the title's slot picker -> slot 1 -> "Auto save", the path a player takes.
        const saved = await page.evaluate(() => { const gs = window.__GAME_STATE__; gs.saveGame(); const raw = localStorage.getItem('edu-rpg-autosave');
          localStorage.setItem('qok-slots-v1', '1'); localStorage.setItem('qok-active-slot', '1'); localStorage.setItem('qok-slot-1-auto', raw);
          return JSON.parse(raw).player.position; });
        await page.reload({ waitUntil: 'load' });
        await page.waitForSelector('[data-act="titleSlots"]', { state: 'visible', timeout: 90000 });
        await page.waitForFunction(() => { const k = window.__QOK_COVER__; return !k || k.phase() === 'waiting'; }, { timeout: 30000 }).catch(() => {});
        await page.waitForTimeout(300);
        await page.click('[data-act="titleSlots"]'); await page.click('[data-act="slotPick"][data-i="1"]');
        await page.waitForSelector('[data-act="slotLoad"][data-i="0"]', { state: 'visible', timeout: 15000 }); await page.click('[data-act="slotLoad"][data-i="0"]');
        await page.waitForFunction(() => { const g = window.__PHASER_GAME__, w = g.scene.getScene('WorldMapScene'); return w && g.scene.isActive('WorldMapScene') && w.hero && w.mapData; }, { timeout: 90000 });
        await page.waitForTimeout(2500); await page.evaluate(PILOT); await hookUp(); const okR = await R.settle(30000); await L.noEncounters(page);
        const after = await R.st();
        rec(id, `f${f}: save inside the floor, Continue resumes on the same cell of the authored floor`,
          okR && saved.mapId === id && saved.floor === f && after.map === id && after.floor === f && after.w === FL.width && Math.abs(after.x - before.x) <= 1 && Math.abs(after.y - before.y) <= 1 && !after.degraded,
          { saved, before: [before.x, before.y], after: [after.x, after.y, after.w, after.h], d2: after.d2 });
        await R.shot(`f${f}-resumed`);
      }
      // a random encounter from the dungeon's own table (once)
      if (!encTest && f === Math.min(2, floors[floors.length - 1])) { encTest = true;
        await page.evaluate(() => { try { delete window.__GAME_STATE__.encounterManager.onStep; } catch (e) {} });
        let met = null; const a = N.route[Math.min(8, N.route.length - 1)], b = N.route[Math.min(20, N.route.length - 1)];
        for (let k = 0; k < 14 && !met; k++) { const c = k % 2 ? a : b; const g = await R.go(N, R.nearCell(N, c[0], c[1], 0), { maxMs: 30000 });
          if (g.why === 'scene') { const zone = await page.evaluate(() => { const w = window.__PHASER_GAME__.scene.getScene('WorldMapScene'); return w.currentEncounterZone || null; }); await R.shot(`f${f}-encounter`);
            const fr = await R.fight(); met = { zone, ...fr }; await page.waitForTimeout(1500); } }
        await L.noEncounters(page);
        rec(id, `f${f}: a random encounter starts and is won`, !!(met && met.entered && met.won), met);
        await R.ev(() => window.__D2P.dismiss());
      }
      // chests
      const chests = FL.assets.filter(a => a.kind === 'chest');
      for (const c of chests) {
        await R.ev(() => window.__D2P.clearMsgs());
        const g = await R.approach(N, c.x, c.y);
        const prompt = await R.ev(() => window.__D2P.prompt());
        let opened = await R.ev(([x, y]) => window.__D2P.tile(x, y) === 8, [c.x, c.y]); const how = opened ? ['walked into it'] : [];
        for (let k = 0; k < 3 && !opened; k++) { const up = await R.ev(() => window.__D2P.prompt());   // the prompt pill (the phone's way), else walk into it
          if (up) { await R.tapPrompt(); how.push('tap'); } else { await R.approach(N, c.x, c.y, 900); how.push('push'); } await page.waitForTimeout(350);
          opened = await R.ev(([x, y]) => window.__D2P.tile(x, y) === 8, [c.x, c.y]); }
        const msg = await R.ev(() => window.__D2P.msgs().slice(-1)[0] || '');
        const flag = await R.ev(k => !!window.__D2P.flags()[k], `chest.${id}.f${f}.${c.x}.${c.y}`);
        rec(id, `f${f}: chest (${c.x},${c.y}) opens`, opened && flag, { g: g.why, prompt, how, msg: msg.replace(/\n/g, ' | '), st: opened ? undefined : await R.st() });
        if (c === chests[0]) await R.shot(`f${f}-chest`);
        await R.ev(() => window.__D2P.dismiss());
      }
      // crystals
      for (const c of FL.assets.filter(a => a.kind === 'save')) {
        const g = await R.approach(N, c.x, c.y); await page.waitForTimeout(400);
        const prompt = await R.ev(() => window.__D2P.prompt());
        if (f === 1) { const act = await R.ev(k => !!window.__D2P.flags()[k], `entrance.crystal.${id}.activated`);
          rec(id, 'f1: the entrance crystal is dormant until a deeper one is touched (no prompt)', act ? 'SKIP' : (g.ok && prompt === null), { g: g.why, prompt }); await R.shot('f1-crystal'); continue; }
        await page.evaluate(() => { const st = window.__GAME_STATE__.player.state; st.hp = Math.max(1, Math.floor(st.maxHp / 3)); });
        const tapped = await R.tapPrompt(); const menu = await R.ev(() => window.__D2P.crystal());
        await R.shot(`f${f}-crystal-menu`);
        const picked = await R.tapCrystal(0); await page.waitForTimeout(900); await R.ev(() => window.__D2P.dismiss());
        const after = await R.ev(() => { const st = window.__GAME_STATE__.player.state; return { hp: st.hp, max: st.maxHp }; });
        const fl = await R.ev(() => window.__D2P.flags());
        rec(id, `f${f}: crystal heals and becomes a warp target (no manual save)`, tapped && picked && after.hp === after.max && !!fl[`warp.${id}.f${f}`] && !!fl[`entrance.crystal.${id}.activated`],
          { prompt, menu, after, warp: !!fl[`warp.${id}.f${f}`] });
        if (!hpTest && f === floors[floors.length - 1]) { hpTest = true;      // warp to the entrance and back
          await R.approach(N, c.x, c.y); await page.waitForTimeout(300); await R.tapPrompt(); await R.tapCrystal(1); await page.waitForTimeout(2600); await page.evaluate(PILOT); await R.settle();
          let w1 = await R.st(); const want = F1.land.entrance;
          rec(id, `f${f}: "warp to entrance" lands beside the entrance crystal on floor 1`, w1.map === id && w1.floor === 1 && want && Math.abs(w1.x - want.x) <= 1 && Math.abs(w1.y - want.y) <= 1, { at: [w1.x, w1.y, w1.floor], want });
          await R.shot('f1-warped-entrance');
          const ec = F1.assets.find(a => a.kind === 'save');
          if (ec) { await R.approach(N1, ec.x, ec.y); await page.waitForTimeout(400); const pr = await R.ev(() => window.__D2P.prompt()); await R.tapPrompt(); const menu1 = await R.ev(() => window.__D2P.crystal()); await R.shot('f1-entrance-crystal-menu');
            const n = menu1 ? menu1.length - 2 : -1;                                 // last warp option = the deepest crystal
            if (n >= 0) await R.tapCrystal(n); await page.waitForTimeout(2600); await page.evaluate(PILOT); await R.settle();
            w1 = await R.st();
            rec(id, 'f1: the lit entrance crystal warps back to the deepest crystal touched', w1.map === id && w1.floor === f && Math.abs(w1.x - c.x) <= 1 && Math.abs(w1.y - c.y) <= 2, { prompt: pr, menu: menu1, at: [w1.x, w1.y, w1.floor] }); }
        }
      }
      // the plan's route, start to exit
      let walked = 0, routeOk = true, lastWhy = '';
      const marks = N.route.filter((_, i) => i % 5 === 0 || i === N.route.length - 1);
      for (let i = 0; i < marks.length; i++) { const c = marks[i];
        if (FL.assets.some(a => a.x === c[0] && a.y === c[1])) continue;
        const g = await R.go(N, R.nearCell(N, c[0], c[1], 2)); lastWhy = g.why;
        if (g.why === 'message') { await R.ev(() => window.__D2P.dismiss()); i--; continue; }
        if (!g.ok || g.why !== 'arrived') { routeOk = false; lastWhy = JSON.stringify(g); break; } walked++;
        if (i === Math.floor(marks.length / 2)) await R.shot(`f${f}-route-mid`);
      }
      rec(id, `f${f}: the plan's route is walkable start to exit`, routeOk, { marks: marks.length, walked, lastWhy });
      if (f < total) {
        const st = FL.assets.find(a => a.kind === 'stairsDown');
        await R.shot(`f${f}-stairs`);
        const g = await R.go(N, R.centreIn(N, st.x, st.y), { hold: 900 }); await page.waitForTimeout(1500); await page.evaluate(PILOT); await R.settle();
        s = await R.st();
        if (!rec(id, `f${f}: the stairs lead to floor ${f + 1}`, s.map === id && s.floor === f + 1, { g, s: [s.x, s.y, s.floor] })) return;
        if (f === 1) {                                              // and back up: the other staircase's landing
          const F2 = man.floors[`${id}-f2`], N2 = nav(`${id}-f2`), up = F2.assets.find(a => a.kind === 'stairsUp');
          await R.go(N2, R.centreIn(N2, up.x, up.y), { hold: 900 }); await page.waitForTimeout(1500); await page.evaluate(PILOT); await R.settle(); s = await R.st();
          rec(id, 'f2: the stairs back lead to floor 1, beside its stairs', s.floor === 1 && s.x === FL.land.fromNext.x && s.y === FL.land.fromNext.y, { at: [s.x, s.y, s.floor], want: FL.land.fromNext });
          await R.go(N, R.centreIn(N, st.x, st.y), { hold: 900 }); await page.waitForTimeout(1500); await page.evaluate(PILOT); await R.settle();
        }
      } else {
        const b = FL.assets.find(a => a.kind === 'boss');
        await R.go(N, R.nearCell(N, b.x, b.y, 40)); await page.waitForTimeout(500); await R.shot(`f${f}-boss`);
        const ap = await R.approach(N, b.x, b.y);
        const pr = await R.ev(() => window.__D2P.prompt());
        let started = false;
        for (let k = 0; k < 4 && !started; k++) {                  // first by walking into it (the engine's bump, and the module's bump hook), then by the prompt pill
          if (k === 0 && ap.side) await R.ev(([dx, dy]) => window.__D2P.push(dx, dy, 900), ap.side);
          else if (await R.ev(() => window.__D2P.prompt())) await R.tapPrompt(); else if (!(await R.st()).msg) await R.approach(N, b.x, b.y, 900);
          for (let j = 0; j < 12 && !started; j++) { await R.ev(() => window.__D2P.tapKey('z')); await page.waitForTimeout(300); started = await page.evaluate(() => window.__PHASER_GAME__.scene.isActive('BattleScene')); } }
        const fr = started ? await R.fight() : { entered: false };
        await page.waitForTimeout(2500); await R.ev(() => window.__D2P.dismiss(20));
        const fl = await R.ev(() => window.__D2P.flags());
        rec(id, `f${f}: the boss ${D.bossId} fight starts from its marker and is won`, !!(fr.entered && fr.won), { prompt: pr, fr });
        rec(id, `the bundle's own flag boss.${D.bossId}.defeated is set`, !!fl[`boss.${D.bossId}.defeated`]);
        await page.waitForTimeout(1500); await R.shot(`f${f}-after-boss`);
        // the way out: the boss's own cell becomes the exit; if this visit still holds the marker, leave by the crystal and the mouth
        s = await R.st(); let t = await R.ev(([x, y]) => window.__D2P.tile(x, y), [b.x, b.y]); let how = 'boss-cell tile ' + t;
        if (t === 10 || t === 12) {                                  // the way out opened where she stands: let go, then push into it
          await page.waitForTimeout(400); await R.bump(b.x, b.y, 1500); how += ' -> pushed into it';
          if ((await L.pos(page)).map === id) await R.go(N, R.centreIn(N, b.x, b.y), { hold: 900 }); }
        else { const g = await R.bump(b.x, b.y, 2500); how += ' -> pushed'; await page.waitForTimeout(800); }
        await page.waitForTimeout(2000); p = await L.pos(page);
        if (p.map !== 'overworld') { how += ' -> walk out by the stairs';
          for (let ff = f; ff >= 1 && p.map === id; ff--) { const k2 = `${id}-f${ff}`, FF = man.floors[k2], NN = nav(k2); await page.evaluate(PILOT); await R.settle();
            const tgt = FF.assets.find(a => a.kind === (ff > 1 ? 'stairsUp' : 'mouth') && !a.extra); await R.ev(() => window.__D2P.dismiss());
            await R.go(NN, R.centreIn(NN, tgt.x, tgt.y), { maxMs: 180000, hold: 900 }); await page.waitForTimeout(1800); p = await L.pos(page); } }
        rec(id, 'leaving after the boss returns her to the remapped overworld exit', p.map === 'overworld' && p.x === LM.exit[0] && p.y === LM.exit[1], { how, p });
        await page.waitForTimeout(1500); await R.shot('exit-overworld');
      }
    }
    const hk = await page.evaluate(() => window.__d2hook);
    rec(id, 'mechanic module API: load/unload/tick/input/free/step/interact hooks all fired' + (layout ? ' on the real module' : smoke ? '' : ', bump too (walking into the boss)'),
      !!hk && hk.load > 0 && hk.unload > 0 && hk.tick > 30 && hk.input > 30 && (layout || hk.free > 100) && hk.step > 3 && hk.interact > 30 && (smoke || hk.bump > 0) && hk.mech && hk.mech.id === D.mechanic, hk);
    const bad = errors.filter(e => !/favicon|audio|\.mp3|\.ogg/.test(e.m));
    rec(id, 'no page errors or failed requests', bad.length === 0, bad.slice(0, 5));
  } catch (e) { rec(id, 'probe crashed', false, String(e && e.stack || e).slice(0, 600)); await R.shot('crash').catch(() => {}); }
  finally { try { await PT.dump(page); } catch (e) {} await browser.close(); }
}

(async () => {
  const specs = process.argv.slice(2); if (!specs.length) specs.push('emberMines', 'obsidianCavern');
  for (const s of specs) await runDungeon(s);
  const fail = rows.filter(r => r.status === 'FAIL').length;
  console.log(`dungeon_authored: ${rows.length} checks, ${fail} FAIL`); flush();
  process.exit(fail ? 1 : 0);
})();
