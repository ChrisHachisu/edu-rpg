// In-page pilot for the batch B mechanic probes (scripts/acts/probe/mech/<mechanic-id>.cjs of the
// Act 4-5 dungeons). Injected with page.evaluate(source). Same idea as batch A's _a-pilot.js:
// everything a probe does to the game goes through the stick (window.__DQ_STICK__), the prompt
// pill and the Z key, as a player's thumbs do, and navigation asks the ENGINE where her sprite may
// be (window.__QOK_DNG2__.free: painted mask + props + the mechanic module's own free()).
// Added here for the timed mechanics (crust bridges, guards, lightning): timedGo(), a walk on the
// cell grid that looks ahead through the mechanic's own beat (the module's `logic`) and waits, as
// a careful player does, where it is safe.
(() => {
  if (window.__B) return;
  const G = () => window.__PHASER_GAME__, W = () => G().scene.getScene('WorldMapScene'), D = () => window.__QOK_DNG2__;
  const T = 48, STEP = 12;
  const wait = ms => new Promise(r => setTimeout(r, ms));
  const raf = () => new Promise(r => requestAnimationFrame(r));
  const fire = (type, key, kc) => { const ev = new KeyboardEvent(type, { key, code: 'Key' + key.toUpperCase(), bubbles: true, cancelable: true });
    try { Object.defineProperty(ev, 'keyCode', { get: () => kc }); Object.defineProperty(ev, 'which', { get: () => kc }); } catch (e) {} window.dispatchEvent(ev); };
  const tapKey = async k => { fire('keydown', k, 90); await wait(40); fire('keyup', k, 90); };
  const onField = () => { const g = G(); return g.scene.isActive('WorldMapScene') && !g.scene.isPaused('WorldMapScene') && !g.scene.isActive('BattleScene'); };
  let msgs = [];
  const hook = () => { const w = W(); if (w.__bMsg) return; w.__bMsg = true; const o = w.showMessage;
    w.showMessage = function (t) { try { msgs.push(String(t)); } catch (e) {} return o.apply(this, arguments); }; };
  const fdy = () => (D() && D().footDy ? D().footDy() : 31);
  const ctx = () => D() && D().ctx && D().ctx();
  const mod = () => { const c = ctx(); return c && c.mod; };
  const mstate = () => { const c = ctx(); return c ? c.state : null; };
  const state = () => { const w = W(), d = D(); return { map: w.currentMapId, floor: w.currentFloor || 1, x: w.heroTileX, y: w.heroTileY,
    hx: w.hero ? w.hero.x : null, hy: w.hero ? w.hero.y : null, sx: w.hero ? w.hero.x : null, sy: w.hero ? w.hero.y + fdy() : null,
    cx: w.hero ? Math.floor(w.hero.x / T) : null, cy: w.hero ? Math.floor((w.hero.y + fdy()) / T) : null,
    w: w.mapData[0].length, h: w.mapData.length, msg: !!w.showingMessage, field: onField(), battle: G().scene.isActive('BattleScene'),
    waiting: !!w.__a1dEntryWaiting, d2: d && d.state ? d.state() : null, hp: window.__GAME_STATE__.player.state.hp, maxHp: window.__GAME_STATE__.player.state.maxHp, moving: !!w.isMoving }; };
  const dismiss = async (max = 14) => { let n = 0; const w = W(); while (onField() && w.showingMessage && n < max) { await tapKey('z'); await wait(260); n++; } return n; };
  const tile = (x, y) => { const r = W().mapData[y]; return r ? r[x] : undefined; };
  const isWay = (x, y) => { const t = tile(x, y); return t === 6 || t === 9 || t === 10 || t === 12; };
  const here = () => { const w = W(); return [w.hero.x, w.hero.y + fdy()]; };
  const changed = (m0, f0) => { const w = W(); return w.currentMapId !== m0 || (w.currentFloor || 1) !== f0; };

  // ---- static navigation (the engine's free(), 12 px lattice from where she stands) -----------------
  // goal: {cell:[cx,cy],grow}  soles inside the cell box grown by `grow` px
  //       {beside:[cx,cy],reach} soles outside the cell but within `reach` px of its box (standing at an object)
  //       {centre:[cx,cy]}       her sprite CENTRE inside the cell (what fires stairs and mouths)
  //       {soles:[px,py],r}      soles within r px of a point
  // opts.avoidFn(sx,sy) -> true refuses a sole position; opts.openFn(sx,sy) -> true allows one the engine refuses now.
  function plan(goal, opts = {}) {
    const w = W(), d = D(), f = fdy(), x0 = w.hero.x, y0 = w.hero.y, Wd = w.mapData[0].length * T, Hd = w.mapData.length * T;
    const avoidFn = opts.avoidFn || null, openFn = opts.openFn || null;
    // her CENTRE in a stairs/mouth cell fires it: keep 10 px clear of every such cell but the goal's (the kept waypoints are
    // joined by straight lines), except right where she starts (she arrives beside the stairs she came by)
    const gc = goal.centre || null, way1 = (x, y) => { const cx = Math.floor(x / T), cy = Math.floor(y / T); return !isWay(cx, cy) || (gc && gc[0] === cx && gc[1] === cy); };
    const wayOk = (x, y) => way1(x, y) && (Math.hypot(x - x0, y - y0) < 26 || (way1(x - 10, y - 10) && way1(x + 10, y - 10) && way1(x - 10, y + 10) && way1(x + 10, y + 10)));
    const isGoal = (x, y) => { const sx = x, sy = y + f;
      if (goal.cell) { const g = goal.grow || 0, [cx, cy] = goal.cell; return sx >= cx * T - g && sx < (cx + 1) * T + g && sy >= cy * T - g && sy < (cy + 1) * T + g; }
      if (goal.beside) { const [cx, cy] = goal.beside, ex = Math.max(Math.abs(sx - (cx * T + 24)) - 24, 0), ey = Math.max(Math.abs(sy - (cy * T + 24)) - 24, 0), dd = Math.hypot(ex, ey);
        return dd <= (goal.reach || 14) && (goal.side ? goal.side(sx, sy) : true); }
      if (goal.centre) { const [cx, cy] = goal.centre; return x >= cx * T + 5 && x <= (cx + 1) * T - 5 && y >= cy * T + 4 && y <= (cy + 1) * T - 4; }
      if (goal.soles) return Math.hypot(sx - goal.soles[0], sy - goal.soles[1]) <= (goal.r || 8);
      return false; };
    const fr = (x, y) => d.free(x, y) || (openFn && openFn(x, y + f));
    const ok = (x, y) => x > 2 && y > 2 && x < Wd - 2 && y < Hd - 2 && fr(x, y) && wayOk(x, y) && !(avoidFn && avoidFn(x, y + f));
    const key = (i, j) => (i + 4096) * 8192 + (j + 4096), prev = new Map(), q = [[0, 0]]; prev.set(key(0, 0), null);
    const DD = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]];
    let end = null, n = 0;
    for (let h = 0; h < q.length; h++) { const [i, j] = q[h], x = x0 + i * STEP, y = y0 + j * STEP;
      if (isGoal(x, y)) { end = [i, j]; break; }
      if (++n > 400000) break;
      for (const [di, dj] of DD) { const ni = i + di, nj = j + dj, k = key(ni, nj); if (prev.has(k)) continue;
        const nx = x0 + ni * STEP, ny = y0 + nj * STEP; if (!ok(nx, ny)) continue;
        if (di && dj && (!ok(x + di * STEP, y) || !ok(x, y + dj * STEP))) continue;
        if (!fr(x + di * STEP / 2, y + dj * STEP / 2)) continue;
        prev.set(k, [i, j]); q.push([ni, nj]); } }
    if (!end) return null;
    const out = []; let c = end; while (c) { out.push([x0 + c[0] * STEP, y0 + c[1] * STEP]); c = prev.get(key(c[0], c[1])); }
    return out.reverse();
  }
  // Steer the stick through hero-centre waypoints. Ends on arrival, a floor/map change, a message, a battle, `until`, or no progress.
  async function drive(pts, { tol = 5, maxMs = 90000, until = null, hold = 0, msgOk = false } = {}) {
    const w = W(), m0 = w.currentMapId, f0 = w.currentFloor || 1, t0 = performance.now(); let i = 0, stuck = 0, last = null, moved = 0, lastDir = null;
    try {
      for (;;) {
        if (changed(m0, f0)) return { ok: true, why: 'changed', moved };
        if (!onField()) return { ok: true, why: 'scene', moved };
        if (w.showingMessage && !msgOk) return { ok: true, why: 'message', moved };
        if (until && until()) return { ok: true, why: 'until', moved };
        if (i >= pts.length) {
          if (hold && lastDir) { const t1 = performance.now(); while (performance.now() - t1 < hold && !changed(m0, f0) && onField() && !w.showingMessage) {
            window.__DQ_STICK__ = { x: lastDir[0], y: lastDir[1], m: 1 }; await raf(); } }
          return { ok: true, why: changed(m0, f0) ? 'changed' : 'arrived', moved }; }
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
    for (let k = 0; k < 3; k++) {                                   // re-plan if she is pushed off the path
      const p = plan(goal, opts); if (!p) return { ok: false, why: 'no-path', at: here() };
      const pts = p.filter((_, i) => i % 2 === 1 || i === p.length - 1);
      const r = await drive(pts, opts); if (r.ok || r.why !== 'stuck') return r;
    }
    return { ok: false, why: 'stuck', at: here() };
  }
  async function push(vx, vy, ms, until) { const t0 = performance.now(), w = W(), m0 = w.currentMapId, f0 = w.currentFloor || 1; const l = Math.hypot(vx, vy) || 1;
    try { while (performance.now() - t0 < ms) { if (changed(m0, f0) || !onField() || w.showingMessage || (until && until())) break;
      window.__DQ_STICK__ = { x: vx / l, y: vy / l, m: 1 }; await raf(); } }
    finally { window.__DQ_STICK__ = { x: 0, y: 0, m: 0 }; } return state(); }
  const prompt = () => { const e = document.getElementById('a1mInteract'); return e && e.classList.contains('a1m-show') ? e.textContent : null; };
  async function lean(cx, cy, ms = 900, want = null) { const w = W(); const vx = cx * T + 24 - w.hero.x, vy = cy * T + 24 - (w.hero.y + fdy());
    return push(vx, vy, ms, () => { const p = prompt(); return !!p && (!want || p === want); }); }
  const waitFor = async (fn, ms = 10000) => { const t0 = performance.now(); while (performance.now() - t0 < ms) { if (fn()) return true; await raf(); } return false; };

  // ---- timed navigation on the cell grid --------------------------------------------------------------
  // env: { walk(cx,cy) -> may she ever stand on this cell (cached here), safe(cx,cy,t) -> is the cell harmless at
  //        integer tick t, tick() -> the mechanic's clock now (fractional), period, goal(cx,cy) }
  // One cell is one tick at her walking speed. The search runs over (cell, tick mod period); a step into a cell needs
  // it harmless one tick either side of her arrival, a wait needs her cell harmless for the next two ticks. Re-planned
  // from the real clock at every cell, so a slow frame costs a wait, not a hit.
  function tplan(env, cx, cy, b) {
    const w = W(), Wc = w.mapData[0].length, Hc = w.mapData.length, P = env.period, N = Wc * Hc * P;
    if (!env._seen || env._seen.length !== N) { env._seen = new Int32Array(N); env._prev = new Int32Array(N); env._stamp = 0; env._walk = new Int8Array(Wc * Hc); }
    const seen = env._seen, prev = env._prev, stamp = ++env._stamp, wk = env._walk;
    // her soles on a cell's centre put her CENTRE in the cell above: a cell under stairs or a mouth is not a place to stand
    const walk = (x, y) => { if (x < 0 || y < 0 || x >= Wc || y >= Hc) return false; const i = y * Wc + x; if (!wk[i]) wk[i] = (!isWay(x, y) && !isWay(x, y - 1) && env.walk(x, y)) ? 1 : 2; return wk[i] === 1; };
    const id = (x, y, k) => (y * Wc + x) * P + (((b + k) % P) + P) % P;
    const q = [[cx, cy, 0]]; seen[id(cx, cy, 0)] = stamp; prev[id(cx, cy, 0)] = -1;
    const NB = [[1, 0], [-1, 0], [0, 1], [0, -1]];
    let end = -1;
    for (let h = 0; h < q.length && h < 600000; h++) { const [x, y, k] = q[h];
      if (env.goal(x, y)) { end = h; break; }
      const t = b + k;
      for (const [dx, dy] of NB) { const nx = x + dx, ny = y + dy; if (!walk(nx, ny)) continue;
        if (!(env.safe(nx, ny, t) && env.safe(nx, ny, t + 1) && env.safe(nx, ny, t + 2))) continue;
        const ni = id(nx, ny, k + 1); if (seen[ni] === stamp) continue; seen[ni] = stamp; prev[ni] = h; q.push([nx, ny, k + 1]); }
      if (env.safe(x, y, t + 1) && env.safe(x, y, t + 2)) { const ni = id(x, y, k + 1); if (seen[ni] !== stamp) { seen[ni] = stamp; prev[ni] = h; q.push([x, y, k + 1]); } }
    }
    if (end < 0) return null;
    let h = end, path = [q[end]];                                            // walk back to the first action: prev holds queue indices
    for (;;) { const s = q[h], p = prev[id(s[0], s[1], s[2])]; if (p < 0) break; h = p; path.push(q[h]); }
    path.reverse();
    return { len: path.length - 1, next: path.length > 1 ? [path[1][0], path[1][1]] : null, wait: path.length > 1 && path[1][0] === cx && path[1][1] === cy, path };
  }
  async function timedGo(env, opts = {}) {
    const w = W(), f = fdy(), m0 = w.currentMapId, f0 = w.currentFloor || 1, t0 = performance.now(), maxMs = opts.maxMs || 120000;
    const cell = () => [Math.floor(w.hero.x / T), Math.floor((w.hero.y + f) / T)];
    const to = async (cx, cy, tol, ms) => {                                  // soles to a cell centre
      const tx = cx * T + 24, ty = cy * T + 24 - f, t1 = performance.now(); let last = null, stuck = 0;
      for (;;) { const dx = tx - w.hero.x, dy = ty - w.hero.y, d = Math.hypot(dx, dy);
        if (d < tol) return true; if (changed(m0, f0) || !onField() || w.showingMessage) return false; if (performance.now() - t1 > ms) return false;
        window.__DQ_STICK__ = { x: dx / d, y: dy / d, m: 1 }; await raf();
        if (last) { stuck = Math.hypot(w.hero.x - last[0], w.hero.y - last[1]) < 0.02 ? stuck + 1 : 0; } last = [w.hero.x, w.hero.y];
        if (stuck > 40) return false; } };
    let waits = 0, moves = 0, nopath = 0, hp0 = window.__GAME_STATE__.player.state.hp;
    try {
      for (;;) {
        if (changed(m0, f0)) return { ok: true, why: 'changed', moves, waits };
        if (!onField()) return { ok: true, why: 'scene', moves, waits };
        if (w.showingMessage) return { ok: true, why: 'message', moves, waits };
        if (opts.until && opts.until()) return { ok: true, why: 'until', moves, waits };
        if (performance.now() - t0 > maxMs) return { ok: false, why: 'timeout', at: cell(), moves, waits };
        const [cx, cy] = cell(), b = Math.floor(env.tick());
        if (env.goal(cx, cy)) { await to(cx, cy, 6, 600); window.__DQ_STICK__ = { x: 0, y: 0, m: 0 }; return { ok: true, why: 'arrived', at: [cx, cy], moves, waits, hurt: hp0 - window.__GAME_STATE__.player.state.hp }; }
        const a = tplan(env, cx, cy, b);
        if (!a) { if (++nopath > 400) return { ok: false, why: 'no-path', at: [cx, cy], moves, waits }; window.__DQ_STICK__ = { x: 0, y: 0, m: 0 }; await raf(); continue; }
        nopath = 0;
        if (a.wait) { waits++; await to(cx, cy, 5, 250); window.__DQ_STICK__ = { x: 0, y: 0, m: 0 };
          const t1 = performance.now(); while (Math.floor(env.tick()) === b && performance.now() - t1 < 1000 && onField() && !w.showingMessage) await raf(); continue; }
        moves++;
        const got = await to(a.next[0], a.next[1], 7, 1200);
        if (!got && onField() && !w.showingMessage && !changed(m0, f0)) { await to(cx, cy, 5, 400); }   // nudged off: square up and look again
      }
    } finally { window.__DQ_STICK__ = { x: 0, y: 0, m: 0 }; }
  }
  // ---- a plain tile walk for the bundle's own small maps (the portal isles in front of four of these dungeons) -----
  async function tileWalk(tx, ty, pass) {
    const w = W(), m0 = w.currentMapId, Wc = w.mapData[0].length, Hc = w.mapData.length, ok = pass || (t => [2, 4, 6, 7, 8, 9, 10, 11, 12, 14, 15, 16, 19, 20, 21, 13].indexOf(t) < 0);
    for (let tries = 0; tries < 6; tries++) {
      const sx = w.heroTileX, sy = w.heroTileY, prev = new Map(), q = [[sx, sy]]; prev.set(sx + ',' + sy, null); let end = null;
      for (let h = 0; h < q.length; h++) { const [x, y] = q[h]; if (x === tx && y === ty) { end = q[h]; break; }
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const nx = x + dx, ny = y + dy, k = nx + ',' + ny; if (nx < 0 || ny < 0 || nx >= Wc || ny >= Hc || prev.has(k)) continue;
          if (!(nx === tx && ny === ty) && !ok(w.mapData[ny][nx])) continue; prev.set(k, [x, y]); q.push([nx, ny]); } }
      if (!end) return { ok: false, why: 'no-path', at: [sx, sy] };
      const path = []; let c = end; while (c) { path.push(c); c = prev.get(c[0] + ',' + c[1]); } path.reverse();
      let bad = false;
      for (let i = 1; i < path.length && !bad; i++) { const [nx, ny] = path[i], t1 = performance.now();
        while (!(w.heroTileX === nx && w.heroTileY === ny)) {
          if (w.currentMapId !== m0) { window.__DQ_STICK__ = { x: 0, y: 0, m: 0 }; return { ok: true, why: 'map', map: w.currentMapId }; }
          if (performance.now() - t1 > 2500) { bad = true; break; }
          const px = nx * T + 24 - w.hero.x, py = ny * T + 24 - w.hero.y, l = Math.hypot(px, py) || 1;
          window.__DQ_STICK__ = { x: px / l, y: py / l, m: 1 }; await raf(); } }
      window.__DQ_STICK__ = { x: 0, y: 0, m: 0 };
      if (w.currentMapId !== m0) return { ok: true, why: 'map', map: w.currentMapId };
      if (!bad) return { ok: true, why: 'arrived', at: [w.heroTileX, w.heroTileY] };
    }
    return { ok: false, why: 'stuck', at: [w.heroTileX, w.heroTileY] };
  }
  // the last cell of a plan route she can stand on without firing the stairs or the mouth at its end
  const standCell = route => { for (let i = route.length - 2; i >= 0; i--) { const [x, y] = route[i]; if (!isWay(x, y) && !isWay(x, y - 1)) return route[i]; } return route[0]; };
  const findTile = t => { const w = W(), out = []; for (let y = 0; y < w.mapData.length; y++) for (let x = 0; x < w.mapData[y].length; x++) if (w.mapData[y][x] === t) out.push([x, y]); return out; };
  const d2flags = () => { const f = window.__GAME_STATE__.player.state.storyFlags, o = {}; for (const k in f) if (k.indexOf('d2.') === 0) o[k] = f[k]; return o; };
  window.__B = { state, dismiss, plan, drive, go, push, lean, wait, raf, waitFor, tapKey, onField, hook, tile, prompt, fdy, here, timedGo, tplan, tileWalk, findTile, standCell, isWay,
    msgs: () => msgs, clearMsgs: () => { msgs = []; }, flags: () => ({ ...window.__GAME_STATE__.player.state.storyFlags }), d2flags,
    mstate, ctx, mod, logic: () => { const m = mod(); return m && m.logic; }, kit: () => window.__QOK_D2KIT_B__, T };
  hook();
})();
