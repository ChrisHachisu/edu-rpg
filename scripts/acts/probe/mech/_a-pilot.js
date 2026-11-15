// In-page pilot for the batch A mechanic probes. Injected with page.evaluate(source).
// Everything a probe does to the game goes through the stick (window.__DQ_STICK__), the prompt
// pill and the Z key, as a player's thumbs do. Navigation asks the ENGINE where her sprite may
// be (window.__QOK_DNG2__.free: painted mask + props + the mechanic module's own free()), so a
// path is exactly what the game allows right now, on any floor, with no baked grid.
(() => {
  if (window.__A) return;
  const G = () => window.__PHASER_GAME__, W = () => G().scene.getScene('WorldMapScene'), D = () => window.__QOK_DNG2__;
  const T = 48, STEP = 12;
  const wait = ms => new Promise(r => setTimeout(r, ms));
  const raf = () => new Promise(r => requestAnimationFrame(r));
  const fire = (type, key, kc) => { const ev = new KeyboardEvent(type, { key, code: 'Key' + key.toUpperCase(), bubbles: true, cancelable: true });
    try { Object.defineProperty(ev, 'keyCode', { get: () => kc }); Object.defineProperty(ev, 'which', { get: () => kc }); } catch (e) {} window.dispatchEvent(ev); };
  const tapKey = async k => { fire('keydown', k, 90); await wait(40); fire('keyup', k, 90); };
  const onField = () => { const g = G(); return g.scene.isActive('WorldMapScene') && !g.scene.isPaused('WorldMapScene') && !g.scene.isActive('BattleScene'); };
  let msgs = [];
  const hook = () => { const w = W(); if (w.__aMsg) return; w.__aMsg = true; const o = w.showMessage;
    w.showMessage = function (t) { try { msgs.push(String(t)); } catch (e) {} return o.apply(this, arguments); }; };
  const fdy = () => (D() && D().footDy ? D().footDy() : 31);
  const state = () => { const w = W(), d = D(), c = d && d.ctx(); return { map: w.currentMapId, floor: w.currentFloor || 1, x: w.heroTileX, y: w.heroTileY,
    hx: w.hero ? w.hero.x : null, hy: w.hero ? w.hero.y : null, sx: w.hero ? w.hero.x : null, sy: w.hero ? w.hero.y + fdy() : null,
    w: w.mapData[0].length, h: w.mapData.length, msg: !!w.showingMessage, field: onField(), battle: G().scene.isActive('BattleScene'),
    waiting: !!w.__a1dEntryWaiting, d2: d ? d.state() : null, hp: window.__GAME_STATE__.player.state.hp, moving: !!w.isMoving }; };
  const dismiss = async (max = 14) => { let n = 0; const w = W(); while (onField() && w.showingMessage && n < max) { await tapKey('z'); await wait(260); n++; } return n; };
  const tile = (x, y) => { const r = W().mapData[y]; return r ? r[x] : undefined; };
  const isWay = (x, y) => { const t = tile(x, y); return t === 6 || t === 9 || t === 10 || t === 12; };
  // goal: {cell:[cx,cy],grow}  soles inside the cell box grown by `grow` px (default 0)
  //       {beside:[cx,cy],reach} soles outside the cell but within `reach` px of its box (default 14): standing at an object
  //       {centre:[cx,cy]}       her sprite CENTRE inside the cell (what fires stairs and mouths)
  //       {soles:[px,py],r}      soles within r px of a point
  // opts.avoid: array of "x,y" sole cells never to enter; opts.avoidFn(sx,sy) -> true to refuse a sole position.
  function plan(goal, opts = {}) {
    const w = W(), d = D(), f = fdy(), x0 = w.hero.x, y0 = w.hero.y, Wd = w.mapData[0].length * T, Hd = w.mapData.length * T;
    const avoid = new Set(opts.avoid || []), avoidFn = opts.avoidFn || null;
    const gc = goal.centre || null, wayOk = (x, y) => { const cx = Math.floor(x / T), cy = Math.floor(y / T); return !isWay(cx, cy) || (gc && gc[0] === cx && gc[1] === cy); };
    const isGoal = (x, y) => { const sx = x, sy = y + f;
      if (goal.cell) { const g = goal.grow || 0, [cx, cy] = goal.cell; return sx >= cx * T - g && sx < (cx + 1) * T + g && sy >= cy * T - g && sy < (cy + 1) * T + g; }
      if (goal.beside) { const [cx, cy] = goal.beside, ex = Math.max(Math.abs(sx - (cx * T + 24)) - 24, 0), ey = Math.max(Math.abs(sy - (cy * T + 24)) - 24, 0), dd = Math.hypot(ex, ey); return dd <= (goal.reach || 14) && (goal.side ? goal.side(sx, sy) : true); }
      if (goal.centre) { const [cx, cy] = goal.centre; return x >= cx * T + 5 && x <= (cx + 1) * T - 5 && y >= cy * T + 4 && y <= (cy + 1) * T - 4; }
      if (goal.soles) return Math.hypot(sx - goal.soles[0], sy - goal.soles[1]) <= (goal.r || 8);
      return false; };
    const ok = (x, y) => x > 2 && y > 2 && x < Wd - 2 && y < Hd - 2 && d.free(x, y) && wayOk(x, y) && !avoid.has(Math.floor(x / T) + ',' + Math.floor((y + f) / T)) && !(avoidFn && avoidFn(x, y + f));
    const key = (i, j) => (i + 4096) * 8192 + (j + 4096), prev = new Map(), q = [[0, 0]]; prev.set(key(0, 0), null);
    const DD = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]];
    let end = null, n = 0;
    for (let h = 0; h < q.length; h++) { const [i, j] = q[h], x = x0 + i * STEP, y = y0 + j * STEP;
      if (isGoal(x, y)) { end = [i, j]; break; }
      if (++n > 400000) break;
      for (const [di, dj] of DD) { const ni = i + di, nj = j + dj, k = key(ni, nj); if (prev.has(k)) continue;
        const nx = x0 + ni * STEP, ny = y0 + nj * STEP; if (!ok(nx, ny)) continue;
        if (di && dj && (!ok(x + di * STEP, y) || !ok(x, y + dj * STEP))) continue;
        if (!d.free(x + di * STEP / 2, y + dj * STEP / 2)) continue;
        prev.set(k, [i, j]); q.push([ni, nj]); } }
    if (!end) return null;
    const out = []; let c = end; while (c) { out.push([x0 + c[0] * STEP, y0 + c[1] * STEP]); c = prev.get(key(c[0], c[1])); }
    return out.reverse();
  }
  // Steer the stick through hero-centre waypoints. Ends on arrival, a floor/map change, a message, a battle, `until`, or no progress.
  async function drive(pts, { tol = 5, maxMs = 90000, until = null, hold = 0 } = {}) {
    const w = W(), m0 = w.currentMapId, f0 = w.currentFloor || 1, t0 = performance.now(); let i = 0, stuck = 0, last = null, moved = 0, lastDir = null;
    try {
      for (;;) {
        if (w.currentMapId !== m0 || (w.currentFloor || 1) !== f0) return { ok: true, why: 'changed', moved };
        if (!onField()) return { ok: true, why: 'scene', moved };
        if (w.showingMessage) return { ok: true, why: 'message', moved };
        if (until && until()) return { ok: true, why: 'until', moved };
        if (i >= pts.length) {
          if (hold && lastDir) { const t1 = performance.now(); while (performance.now() - t1 < hold && w.currentMapId === m0 && (w.currentFloor || 1) === f0 && onField() && !w.showingMessage) {
            window.__DQ_STICK__ = { x: lastDir[0], y: lastDir[1], m: 1 }; await raf(); } }
          return { ok: true, why: (w.currentMapId !== m0 || (w.currentFloor || 1) !== f0) ? 'changed' : 'arrived', moved }; }
        if (performance.now() - t0 > maxMs) return { ok: false, why: 'timeout', i, n: pts.length, at: [w.hero.x, w.hero.y], moved };
        const dx = pts[i][0] - w.hero.x, dy = pts[i][1] - w.hero.y, d = Math.hypot(dx, dy);
        if (d < tol) { i++; continue; }
        window.__DQ_STICK__ = { x: dx / d, y: dy / d, m: 1 }; lastDir = Math.abs(dx) >= Math.abs(dy) ? [Math.sign(dx), 0] : [0, Math.sign(dy)];
        await raf();
        if (last) { const st = Math.hypot(w.hero.x - last[0], w.hero.y - last[1]); moved += st; stuck = st < 0.02 ? stuck + 1 : 0; }
        last = [w.hero.x, w.hero.y];
        if (stuck > 150) return { ok: false, why: 'stuck', i, n: pts.length, at: [w.hero.x, w.hero.y], to: pts[i], moved };
      }
    } finally { window.__DQ_STICK__ = { x: 0, y: 0, m: 0 }; }
  }
  async function go(goal, opts = {}) {
    for (let k = 0; k < 3; k++) {                                   // re-plan if she is pushed off the path (a slide, a knock-back)
      const p = plan(goal, opts); if (!p) return { ok: false, why: 'no-path', at: [W().hero.x, W().hero.y + fdy()] };
      const pts = p.filter((_, i) => i % 2 === 1 || i === p.length - 1);
      const r = await drive(pts, opts); if (r.ok || r.why !== 'stuck') return r;
    }
    return { ok: false, why: 'stuck' };
  }
  async function push(vx, vy, ms, until) { const t0 = performance.now(), w = W(), m0 = w.currentMapId, f0 = w.currentFloor || 1; const l = Math.hypot(vx, vy) || 1;
    try { while (performance.now() - t0 < ms) { if (w.currentMapId !== m0 || (w.currentFloor || 1) !== f0 || !onField() || w.showingMessage || (until && until())) break;
      window.__DQ_STICK__ = { x: vx / l, y: vy / l, m: 1 }; await raf(); } }
    finally { window.__DQ_STICK__ = { x: 0, y: 0, m: 0 }; } return state(); }
  const prompt = () => { const e = document.getElementById('a1mInteract'); return e && e.classList.contains('a1m-show') ? e.textContent : null; };
  // lean on a cell from where she stands until the prompt pill shows (or ms pass)
  async function lean(cx, cy, ms = 900, want = null) { const w = W(); const vx = cx * T + 24 - w.hero.x, vy = cy * T + 24 - (w.hero.y + fdy());
    return push(vx, vy, ms, () => { const p = prompt(); return !!p && (!want || p === want); }); }
  const waitFor = async (fn, ms = 10000) => { const t0 = performance.now(); while (performance.now() - t0 < ms) { if (fn()) return true; await raf(); } return false; };
  window.__A = { state, dismiss, plan, drive, go, push, lean, wait, raf, waitFor, tapKey, onField, hook, tile, prompt, fdy,
    msgs: () => msgs, clearMsgs: () => { msgs = []; }, flags: () => ({ ...window.__GAME_STATE__.player.state.storyFlags }),
    mstate: () => { const c = D() && D().ctx(); return c ? c.state : null; }, ctx: () => D() && D().ctx() };
  hook();
})();
