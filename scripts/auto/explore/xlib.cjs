'use strict';
// Explorer (track X) shared helpers, on top of scripts/acts/probe/lib.cjs.
//
// INSTRUMENT. dq-tiles.js keeps the game's own walkable test (a1mFree: the sole disc against the
// floor mask, the props, the authored mechanic's veto) and its interaction finder
// (a1mNearbyInteract) inside its closure. launchX() serves dq-tiles.js through a Playwright route
// that appends ONE read-only export, window.__XP__, just before window.__DQ_TILES__ is set. Nothing
// else in the file changes, and the game files on disk are untouched. __XP__.free(x,y) is the very
// function a1mStep asks before every substep, at the sprite-centre position (x,y).
//
// Output: everything under OUTX (default /home/user/work/explore) and the report folder.
const fs = require('fs'), path = require('path');
const L = require('../../acts/probe/lib.cjs');
const ROOT = path.resolve(__dirname, '../../..');
const OUTX = process.env.X_OUT || '/home/user/work/explore';
const REPORT = process.env.X_REPORT || '/mnt/project-files/edu-rpg/autoloop/explore/';
fs.mkdirSync(OUTX, { recursive: true });

const XP = `window.__XP__={
  sc:function(){ return worldScene(); },
  m:function(){ var sc=worldScene(); try{ return sc&&a1mAnyFor(sc); }catch(e){ return null; } },
  free:function(x,y){ var sc=worldScene(), m=null; try{ m=sc&&a1mAnyFor(sc); }catch(e){} return !!(m&&a1mFree(sc,m,x,y)); },
  near:function(x,y){ var sc=worldScene(), m=null; try{ m=sc&&a1mAnyFor(sc); }catch(e){} if(!sc||!sc.hero) return null; var h=sc.hero, ox=h.x, oy=h.y; h.x=x; h.y=y;
    try{ var r=a1mNearbyInteract(sc,m); return r?{tx:r.tx,ty:r.ty,t:r.t,verb:r.verb||null,mech:typeof r.act==='function'}:null; }catch(e){ return {err:String(e)}; } finally{ h.x=ox; h.y=oy; } },
  footDy:function(){ var sc=worldScene(), m=null; try{ m=sc&&a1mAnyFor(sc); }catch(e){} return m?a1mFootDy(sc,m):null; },
  bumpReach:function(){ var sc=worldScene(), m=null; try{ m=sc&&a1mAnyFor(sc); }catch(e){} return m?a1mMetric(m,A1M_BUMP_REACH):null; },
  field:function(){ var sc=worldScene(), m=null; try{ m=sc&&a1mAnyFor(sc); }catch(e){} return m?{ow:!!m.ow,ox:m.ox,oy:m.oy,W:m.W,H:m.H,local:!!m.local}:null; },
  prop:function(t){ var sc=worldScene(), m=null; try{ m=sc&&a1mAnyFor(sc); }catch(e){} return !!((m&&m.prop)||A1M_PROP)[t]; }
};
`;
async function launchX(opts = {}) {
  const S = await L.launch(opts);
  await S.ctx.route(/\/dq-tiles\.js(\?.*)?$/, async route => {
    const r = await route.fetch(); let body = await r.text();
    const k = body.indexOf('window.__DQ_TILES__={');
    if (k < 0) throw new Error('instrument: anchor not found in dq-tiles.js');
    body = body.slice(0, k) + XP + body.slice(k);
    await route.fulfill({ response: r, body, headers: { ...r.headers(), 'content-type': 'application/javascript' } });
  });
  S.consoleAll = [];
  S.page.on('console', m => { if (S.consoleAll.length < 400) S.consoleAll.push(m.type() + ': ' + m.text().slice(0, 200)); });
  return S;
}
async function jpeg(page, dir, name) {
  fs.mkdirSync(dir, { recursive: true }); const f = path.join(dir, name + '.jpg');
  await page.screenshot({ path: f, type: 'jpeg', quality: 78 }).catch(e => console.log('shot fail', e.message)); return f;
}
// seed + continue; waits for the dungeon layer when the save is inside a dungeon
async function boot(page, s, opts = {}) {
  // the record also goes into slot 1 (auto), as an installed game keeps it, so a later
  // reload + Continue through the five-slot title finds it (resume.cjs does the same)
  const extra = { ...(opts.slots ? { 'qok-slots-v1': '1', 'qok-active-slot': '1', 'qok-slot-1-auto': JSON.stringify(s) } : {}), ...(opts.extra || {}) };
  await L.bootSave(page, s, { url: L.URL_, ...opts, extra });
  await page.waitForFunction(() => { const d = window.__QOK_DNG2__, w = window.__PHASER_GAME__.scene.getScene('WorldMapScene');
    if (!w || w.currentMapId === 'overworld') return true; const st = d && d.state(); return !w.__a1dEntryWaiting && (!st || !st.key || (st.mask !== 'loading' && st.art !== 'loading')); }, { timeout: 45000 }).catch(() => {});
  await page.waitForTimeout(800);
  await L.noEncounters(page);
}
const append = (file, obj) => fs.appendFileSync(path.join(OUTX, file), JSON.stringify(obj) + '\n');

// ---- in-page: reachability flood over the game's own free() --------------------------------
// From the hero's current sprite position, flood a `step` px lattice (8-neighbour, each step tested
// with __XP__.free at its end and midpoint). Transition cells (6, 9, 10, 11, 12) are sinks: entering
// fires them. Returns entered cells, prompt targets (a1mNearbyInteract at every 2nd node), bump
// targets (a refused step at the boundary, a1mBump's own probe), and min distances to each target.
const FLOOD = async ({ step = 4, nearEvery = 2, extraTargets = [] } = {}) => {
  const X = window.__XP__, w = window.__PHASER_GAME__.scene.getScene('WorldMapScene'), md = w.mapData, H = md.length, Wd = md[0].length, T = 48;
  const fd = X.footDy(), reach = X.bumpReach();
  const sx = w.hero.x, sy = w.hero.y;
  const startFree = X.free(sx, sy);
  const TR = { 6: 1, 9: 1, 10: 1, 11: 1, 12: 1 }, PROMPT = { 4: 1, 7: 1, 14: 1, 18: 1 };
  const startCell = [(sx / T) | 0, (sy / T) | 0];
  const GW = Math.ceil(Wd * T / step) + 2, GH = Math.ceil(H * T / step) + 2;
  const ox = sx - Math.floor(sx / step) * step, oy = sy - Math.floor(sy / step) * step;
  const gx0 = Math.floor(sx / step), gy0 = Math.floor(sy / step);
  const seen = new Uint8Array(GW * GH), q = new Int32Array(GW * GH); let qh = 0, qt = 0;
  const px = gx => gx * step + ox, py = gy => gy * step + oy;
  const entered = new Map(), prompts = new Map(), bumps = new Map();
  let nodes = 0, nearErr = null;
  if (startFree) { seen[gy0 * GW + gx0] = 1; q[qt++] = gy0 * GW + gx0; }
  const D = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]];
  const pts = [];
  while (qh < qt) {
    const c = q[qh++], gx = c % GW, gy = (c / GW) | 0, x = px(gx), y = py(gy); nodes++;
    const tx = (x / T) | 0, ty = (y / T) | 0, k = tx + ',' + ty;
    if (!entered.has(k)) entered.set(k, md[ty] ? md[ty][tx] : undefined);
    if ((gx + gy) % 1 === 0 && (gx % nearEvery === 0) && (gy % nearEvery === 0)) pts.push([x, y]);
    const sink = TR[md[ty] && md[ty][tx]] && !(tx === startCell[0] && ty === startCell[1]);
    if (sink) continue;
    for (const [dx, dy] of D) {
      const nx = gx + dx, ny = gy + dy; if (nx < 0 || ny < 0 || nx >= GW || ny >= GH) continue; const n = ny * GW + nx;
      if (seen[n]) continue;
      const X1 = px(nx), Y1 = py(ny);
      if (X.free(X1, Y1) && X.free((x + X1) / 2, (y + Y1) / 2)) { seen[n] = 1; q[qt++] = n; }
      else if (dx === 0 || dy === 0) {                       // refused orthogonal step: what would a bump hit?
        const bx = ((x + dx * reach) / T) | 0, by = ((y + fd + dy * reach) / T) | 0, bt = md[by] && md[by][bx];
        if (bt !== undefined && X.prop(bt)) bumps.set(bx + ',' + by, bt);
      }
    }
    if (nodes > 600000) break;
  }
  for (const [x, y] of pts) { const r = X.near(x, y); if (r && r.err) { nearErr = r.err; continue; } if (r) { const k = r.tx + ',' + r.ty + (r.verb ? ':' + r.verb : ''); if (!prompts.has(k)) prompts.set(k, r); } }
  // targets in the map
  const targets = [];
  for (let y = 0; y < H; y++) for (let x = 0; x < Wd; x++) { const t = md[y][x]; if (TR[t] || PROMPT[t]) targets.push({ x, y, t }); }
  for (const e of extraTargets) targets.push(e);
  // min distance (px) from any reachable sole point to each target cell rect, sampled on pts
  for (const tg of targets) { let best = 1e9; const rx0 = tg.x * T, ry0 = tg.y * T;
    for (const [x, y] of pts) { const gy = y + fd, ex = Math.max(rx0 - x, 0, x - (rx0 + T)), ey = Math.max(ry0 - gy, 0, gy - (ry0 + T)); const d = Math.hypot(ex, ey); if (d < best) best = d; }
    tg.dist = Math.round(best);
    const k = tg.x + ',' + tg.y;
    tg.entered = entered.has(k); tg.prompt = [...prompts.keys()].some(p => p.split(':')[0] === k); tg.bump = bumps.has(k);
  }
  return { start: [sx, sy], startCell, startFree, startTile: md[startCell[1]] && md[startCell[1]][startCell[0]], nodes, footDy: fd, reach,
    w: Wd, h: H, map: w.currentMapId, floor: w.currentFloor || 1, targets, prompts: [...prompts.values()], nearErr,
    enteredTiles: [...new Set(entered.values())] };
};

// ---- in-page: walk to a cell for real. BFS over the same lattice as FLOOD (the game's own free())
// to the first node whose sprite-centre cell is `goal` (or within `near` px of its rect at the soles,
// for props), then the stick follows the nodes. Ends on arrival, a map/floor change, a message, stuck.
const GOTO = async ({ goal, near = -1, step = 6, maxMs = 90000 }) => {
  const X = window.__XP__, G = window.__PHASER_GAME__, w = G.scene.getScene('WorldMapScene'), T = 48, fd = X.footDy();
  const sx = w.hero.x, sy = w.hero.y, m0 = w.currentMapId, f0 = w.currentFloor || 1;
  const key = (x, y) => Math.round(x / step) + ',' + Math.round(y / step), prev = new Map([[key(sx, sy), null]]), pos = new Map([[key(sx, sy), [sx, sy]]]), q = [[sx, sy]];
  const hit = (x, y) => near < 0 ? (((x / T) | 0) === goal[0] && ((y / T) | 0) === goal[1])
    : Math.hypot(Math.max(goal[0] * T - x, 0, x - (goal[0] + 1) * T), Math.max(goal[1] * T - (y + fd), 0, (y + fd) - (goal[1] + 1) * T)) <= near;
  let end = null;
  for (let i = 0; i < q.length && i < 400000; i++) { const [x, y] = q[i]; if (hit(x, y)) { end = [x, y]; break; }
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]]) { const nx = x + dx * step, ny = y + dy * step, k = key(nx, ny); if (prev.has(k)) continue;
      if (!(hit(nx, ny) && near < 0) && !(X.free(nx, ny) && X.free(x + dx * step / 2, y + dy * step / 2))) continue; prev.set(k, key(x, y)); pos.set(k, [nx, ny]); q.push([nx, ny]); } }
  if (!end) return { ok: false, why: 'nopath', explored: q.length };
  const path = []; let k = key(end[0], end[1]); while (k) { path.unshift(pos.get(k)); k = prev.get(k); }
  const t0 = performance.now(); let i = 0, last = null, stuck = 0;
  try {
    while (i < path.length) {
      if (w.currentMapId !== m0 || (w.currentFloor || 1) !== f0) return { ok: true, why: 'changed', map: w.currentMapId, floor: w.currentFloor || 1 };
      if (w.showingMessage) return { ok: true, why: 'message', text: w.messageText && w.messageText.text };
      if (!G.scene.isActive('WorldMapScene') || G.scene.isActive('BattleScene')) return { ok: true, why: 'scene' };
      if (performance.now() - t0 > maxMs) return { ok: false, why: 'timeout', i, n: path.length };
      const dx = path[i][0] - w.hero.x, dy = path[i][1] - w.hero.y, d = Math.hypot(dx, dy);
      if (d < 4) { i++; continue; }
      window.__DQ_STICK__ = { x: dx / d, y: dy / d, m: 1 }; await new Promise(r => requestAnimationFrame(r));
      if (last && Math.hypot(w.hero.x - last[0], w.hero.y - last[1]) < 0.05) stuck++; else stuck = 0; last = [w.hero.x, w.hero.y];
      if (stuck > 150) return { ok: false, why: 'stuck', i, n: path.length, at: last.map(Math.round), to: path[i].map(Math.round) };
    }
    // keep pushing a little toward the goal centre (stairs fire on entering the cell)
    const gx = goal[0] * T + T / 2, gy = goal[1] * T + T / 2, t1 = performance.now();
    while (performance.now() - t1 < 1200 && w.currentMapId === m0 && (w.currentFloor || 1) === f0 && !w.showingMessage) { const dx = gx - w.hero.x, dy = gy - w.hero.y, d = Math.hypot(dx, dy) || 1; window.__DQ_STICK__ = { x: dx / d, y: dy / d, m: 1 }; await new Promise(r => requestAnimationFrame(r)); }
    return { ok: true, why: (w.currentMapId !== m0 || (w.currentFloor || 1) !== f0) ? 'changed' : 'arrived', n: path.length, map: w.currentMapId, floor: w.currentFloor || 1 };
  } finally { window.__DQ_STICK__ = { x: 0, y: 0, m: 0 }; }
};

// visibilitychange hide/show (ui-overhaul writes its auto save on hide) and reload + Continue through
// the real five-slot title (the last record button of slot 1 = the newest)
async function hide(page, on) { return page.evaluate(on => { Object.defineProperty(document, 'hidden', { value: on, configurable: true }); Object.defineProperty(document, 'visibilityState', { value: on ? 'hidden' : 'visible', configurable: true });
  document.dispatchEvent(new Event('visibilitychange')); }, on); }
async function reloadContinue(page, which = 'last') {
  await page.reload({ waitUntil: 'load' });
  // A hide leaves `edu-rpg-resume`: the relaunch goes straight back into the field (the app's
  // own resume), no title. Otherwise the five-slot title.
  const how = await page.waitForFunction(() => { const g = window.__PHASER_GAME__, w = g && g.scene.getScene('WorldMapScene');
    if (w && g.scene.isActive('WorldMapScene') && w.hero && w.mapData) return 'field';
    const b = document.querySelector('[data-act="titleSlots"]'); return b && b.offsetParent ? 'title' : false; }, null, { timeout: 120000, polling: 500 }).then(h => h.jsonValue(), () => 'none');
  if (how === 'field') { await page.waitForTimeout(5000); await L.noEncounters(page); return ['(auto resume into the field, no title)']; }
  const slots = how === 'title';
  if (!slots) {          // a single-save install (no slot table): the title's own Continue
    await L.toTitle(page);
    await page.evaluate(() => { const t = window.__PHASER_GAME__.scene.getScene('TitleScene'); const i = t.menuItems.findIndex(m => m.getData && m.getData('action') === 'continue'); if (i < 0) throw new Error('no continue'); t.selectedIndex = i; t.confirmTitle(); });
    await page.waitForFunction(() => { const g = window.__PHASER_GAME__, w = g && g.scene.getScene('WorldMapScene'); return w && g.scene.isActive('WorldMapScene') && w.hero && w.mapData; }, { timeout: 90000 });
    await page.waitForTimeout(3500); await L.noEncounters(page);
    return ['(no slots: title Continue)'];
  }
  await page.waitForFunction(() => { const k = window.__QOK_COVER__; return !k || k.phase() === 'waiting'; }, { timeout: 60000 }).catch(() => {});
  await page.waitForTimeout(300);
  await page.click('[data-act="titleSlots"]');
  await page.click('[data-act="slotPick"][data-i="1"]');
  await page.waitForSelector('[data-act="slotLoad"]', { state: 'visible' });
  const btns = await page.$$('[data-act="slotLoad"]'); const labels = []; for (const b of btns) labels.push((await b.textContent()).replace(/\s+/g, ' ').trim().slice(0, 60));
  await (which === 'first' ? btns[0] : btns[btns.length - 1]).click();
  await page.waitForFunction(() => { const g = window.__PHASER_GAME__, w = g && g.scene.getScene('WorldMapScene'); return w && g.scene.isActive('WorldMapScene') && w.hero && w.mapData; }, { timeout: 90000 });
  await page.waitForTimeout(3500); await L.noEncounters(page);
  return labels;
}
const where = page => page.evaluate(() => { const w = window.__PHASER_GAME__.scene.getScene('WorldMapScene'); return { map: w.currentMapId, floor: w.currentFloor || 1, cell: [w.heroTileX, w.heroTileY], hero: [Math.round(w.hero.x), Math.round(w.hero.y)], msg: !!w.showingMessage, text: w.showingMessage && w.messageText ? String(w.messageText.text) : null }; });

module.exports = { L, ROOT, OUTX, REPORT, launchX, jpeg, boot, append, FLOOD, GOTO, XP, hide, reloadContinue, where };
