// In-page "child pilot" for the feel harness (track K). Injected with page.evaluate(source).
//
// The child plays one authored floor the way a 6-12 year old does on a phone:
//  * INPUT goes through the real analog stick: synthetic TouchEvents on #dpad (index.html's own
//    touchstart/touchmove/touchend handlers -> moveKnob -> setVector -> arrow keys + __DQ_STICK__),
//    so the knob, the axis threshold and the key synthesis are the same as a thumb's. If #dpad has
//    no box on screen, it falls back to __DQ_STICK__ directly and says so (kid.inputPath).
//  * TIME is game time: the sum of Phaser's own frame deltas (game 'prestep'), so a slow host
//    does not make the child "faster". Every frame delta is recorded (frame stats per trial).
//  * PERCEPTION: each frame the mechanic adapter returns what is VISIBLE (the render state that
//    drives the on-screen cue: lane glowing/gusting, a stone glowing, crust cracking, a lit cone,
//    crystals shining...) restricted to what is inside the camera view. The child only ever sees
//    that snapshot as it was `reaction` ms of game time ago (one reaction time drawn per decision).
//    Hidden timers / phases / tick counters are never read for a decision.
//  * STEERING: the stick points at the next route waypoint plus a smooth heading error (uniform
//    +/- noise, re-drawn every 350 ms and eased in); when the child means to stop she lets go of
//    the stick `overshoot` ms late.
//  * ROUTE KNOWLEDGE: the floor's route (plan.route cells) is known, like a child after a try or two.
(() => {
  if (window.__KID) return;
  const G = () => window.__PHASER_GAME__, W = () => G().scene.getScene('WorldMapScene'), D = () => window.__QOK_DNG2__;
  const T = 48;
  // ---------------------------------------------------------------- rng
  let seed = 1;
  const rnd = () => { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
  const gauss = () => { let u = 0, v = 0; while (!u) u = rnd(); while (!v) v = rnd(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); };
  // ---------------------------------------------------------------- stick (real #dpad touch path)
  let touching = false, inputPath = null, lastTouch = null;
  function padBox() { const el = document.getElementById('dpad'); if (!el) return null; const r = el.getBoundingClientRect(); const cs = getComputedStyle(el);
    return (r.width > 20 && cs.display !== 'none' && cs.visibility !== 'hidden') ? { el, r } : null; }
  function touchEv(el, type, x, y) {
    const t = new Touch({ identifier: 7, target: el, clientX: x, clientY: y, radiusX: 11, radiusY: 11, force: 0.5 });
    const live = type === 'touchend' ? [] : [t];
    el.dispatchEvent(new TouchEvent(type, { touches: live, targetTouches: live, changedTouches: [t], bubbles: true, cancelable: true }));
  }
  function stick(vx, vy) {
    const pb = padBox();
    if (!pb) { inputPath = inputPath || 'direct'; window.__DQ_STICK__ = (vx || vy) ? { x: vx, y: vy, m: 1 } : { x: 0, y: 0, m: 0 }; return; }
    inputPath = 'touch#dpad';
    const { el, r } = pb, cx = r.left + r.width / 2, cy = r.top + r.height / 2, max = r.width / 2 - 22;
    if (!vx && !vy) { if (touching) { touchEv(el, 'touchend', lastTouch[0], lastTouch[1]); touching = false; } return; }
    const x = cx + vx * max * 1.05, y = cy + vy * max * 1.05;   // a child pushes the knob to the rim
    touchEv(el, touching ? 'touchmove' : 'touchstart', x, y); touching = true; lastTouch = [x, y];
  }
  const tapZ = () => { const f = t => { const e = new KeyboardEvent(t, { key: 'z', code: 'KeyZ', bubbles: true, cancelable: true }); try { Object.defineProperty(e, 'keyCode', { get: () => 90 }); Object.defineProperty(e, 'which', { get: () => 90 }); } catch (x) {} window.dispatchEvent(e); };
    f('keydown'); setTimeout(() => f('keyup'), 40); };
  // ---------------------------------------------------------------- clock + frame loop
  const K = { t: 0, frames: [], buf: [], job: null, prof: null, adapter: null, noise: { cur: 0, tgt: 0, next: 0 }, log: [] };
  function soles() { const w = W(), h = w.hero, fd = D() && D().footDy ? D().footDy() : 31; return h ? [h.x, h.y + fd] : null; }
  function camView() { try { const v = W().cameras.main.worldView; return [v.x, v.y, v.x + v.width, v.y + v.height]; } catch (e) { return null; } }
  function onFrame(time, delta) {
    try {
      const dt = Math.max(0, Math.min(delta, 250)); K.t += dt; K.frames.push(delta);
      if (K.frames.length > 20000) K.frames.splice(0, 10000);
      const ad = K.adapter;
      if (ad && D() && D().ctx() && D().ctx().mod) { let v = null; try { v = ad.visible(camView()); } catch (e) { v = { err: String(e) }; }
        const so = soles(); K.buf.push([K.t, v, so ? [Math.floor(so[0] / T), Math.floor(so[1] / T)] : null, window.__DQ_STICK__ && window.__DQ_STICK__.m ? 1 : 0]); while (K.buf.length > 2 && K.buf[1][0] < K.t - 6000) K.buf.shift(); }
      if (K.job) { const r = K.job.step(dt); if (r !== undefined) { const j = K.job; K.job = null; j.done(r); } }
    } catch (e) { K.log.push('frame ' + e); }
  }
  function perceived(rt) { const b = K.buf, want = K.t - rt; let v = b.length ? b[0][1] : null; for (let i = 0; i < b.length; i++) { if (b[i][0] <= want) v = b[i][1]; else break; } return v; }
  function install() { const g = G(); if (g.__kidHook) return; g.__kidHook = true; g.events.on('prestep', onFrame); }
  function run(job) { return new Promise(res => { if (K.job) { const o = K.job; K.job = null; stick(0, 0); o.done({ why: 'preempted' }); } job.done = res; K.job = job; }); }
  // ---------------------------------------------------------------- profile helpers
  const reaction = () => { const p = K.prof; return Math.max(p.rt - 2.5 * p.sd, p.rt + gauss() * p.sd); };
  function heading(dt) { const n = K.noise, p = K.prof; n.next -= dt; if (n.next <= 0) { n.tgt = (rnd() * 2 - 1) * p.noiseDeg * Math.PI / 180; n.next = 350; }
    n.cur += (n.tgt - n.cur) * Math.min(1, dt / 200); return n.cur; }
  // ---------------------------------------------------------------- jobs (all in game ms)
  const idle = ms => run({ left: ms, step(dt) { stick(0, 0); this.left -= dt; if (this.left <= 0) return { why: 'idle' }; } });
  const waitUntil = (fn, maxMs = 60000) => run({ t0: K.t, step() { stick(0, 0); const r = fn(); if (r) return { why: 'ok', r, ms: K.t - this.t0 }; if (K.t - this.t0 > maxMs) return { why: 'timeout', ms: K.t - this.t0 }; } });
  // Walk a polyline of SOLE points. opts.gate(i, pts) -> 'stop' | 'go' evaluated by the child each frame (her
  // perceived view); on 'stop' she lets go `overshoot` ms late, then waits (stick released) until 'go'.
  // opts.abort() -> truthy ends the walk at once (a failure event). opts.stopAtEnd: release with overshoot at the end.
  function walk(pts, opts = {}) {
    const p = K.prof, tolPt = opts.tol || 14;
    return run({ i: 0, mode: 'walk', over: 0, lastDir: null, lastPos: null, still: 0, t0: K.t, waited: 0, stops: 0, rtUsed: [],
      step(dt) {
        const s = soles(); if (!s) return { why: 'nohero' };
        const w = W(); if (!G().scene.isActive('WorldMapScene') || G().scene.isActive('BattleScene')) { stick(0, 0); return { why: 'scene' }; }
        if (opts.abort) { const a = opts.abort(); if (a) { stick(0, 0); return { why: 'abort', a, phase: this.mode, i: this.i, ms: K.t - this.t0, waited: this.waited, stops: this.stops, rts: this.rtUsed, backs: this.backs || 0 }; } }
        if (w.showingMessage) { stick(0, 0);   // a box: she reads it (1.5 s) and taps it away, then walks on
          this.read = (this.read || 0) + dt; this.reads = this.reads || 0;
          if (this.read > 1500) { this.read = 0; this.reads++; tapZ(); if (this.reads > 12) return { why: 'message', i: this.i, ms: K.t - this.t0 }; } return; }
        // day 2: a Z tap that closed a box next to a warp crystal can open the crystal's menu (a DOM card that
        // stops her); she taps its Cancel button like a child would and walks on (was: 60 s timeouts on Spire 5F)
        const cm = document.getElementById('a1mCrystal');
        if (cm) { stick(0, 0); this.crys = (this.crys || 0) + dt; if (this.crys > 1000) { this.crys = 0; this.crystals = (this.crystals || 0) + 1;
            const b = cm.querySelector('.cancel'); if (b) { b.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true })); b.dispatchEvent(new PointerEvent('pointerup', { bubbles: true })); } } return; }
        this.read = 0;
        if (K.t - this.t0 > (opts.maxMs || 120000)) { stick(0, 0); return { why: 'timeout', i: this.i, ms: K.t - this.t0 }; }
        // overshoot: she is still pushing after deciding to stop
        if (this.mode === 'over') { this.over -= dt; stick(this.lastDir[0], this.lastDir[1]); if (this.over <= 0) { stick(0, 0); this.mode = this.after; } return; }
        if (this.mode === 'wait') { stick(0, 0); this.waited += dt;
          if (this.rtLeft > 0) { this.rtLeft -= dt; return; }
          const g = opts.gate ? opts.gate(this.i, pts, perceived(this.rt), s, 'wait') : 'go';
          if (g === 'go') { this.anchor = null; this.mode = 'walk'; this.rt = reaction(); this.rtUsed.push(Math.round(this.rt)); }   // go: the next stop decision gets a fresh reaction time
          else if (g === 'act') { const e = document.getElementById('a1mInteract'); if (e && !this.acted) { this.acted = true; this.acts = (this.acts || 0) + 1; e.dispatchEvent(new PointerEvent('pointerdown', { pointerType: 'touch', bubbles: true, cancelable: true })); this.rtLeft = reaction(); } else this.acted = false; }
          else if (g === 'back') { const b = pts[Math.max(0, this.i - 2)], bx = b[0] - s[0], by = b[1] - s[1], bl = Math.hypot(bx, by) || 1; this.backs = (this.backs || 0) + 1; stick(bx / bl, by / bl); }
          return; }
        if (this.mode === 'end') { stick(0, 0); return { why: 'arrived', ms: K.t - this.t0, waited: this.waited, stops: this.stops, rts: this.rtUsed, backs: this.backs || 0, acts: this.acts || 0 }; }
        // advance along the polyline
        while (this.i < pts.length - 1) { const a = pts[this.i]; if (Math.hypot(a[0] - s[0], a[1] - s[1]) < tolPt) this.i++; else {
          // passed it? (projection beyond the point toward the next one)
          const b = pts[this.i + 1], ux = b[0] - a[0], uy = b[1] - a[1], L = Math.hypot(ux, uy) || 1; if (((s[0] - a[0]) * ux + (s[1] - a[1]) * uy) / L > 0 && Math.hypot(a[0] - s[0], a[1] - s[1]) < T) this.i++; else break; } }
        const tgt = pts[this.i], dx = tgt[0] - s[0], dy = tgt[1] - s[1], d = Math.hypot(dx, dy);
        if (this.i === pts.length - 1 && d < tolPt) { if (opts.stopAtEnd) { this.mode = 'over'; this.over = p.overshoot; this.after = 'end'; return; } stick(0, 0); return { why: 'arrived', ms: K.t - this.t0, waited: this.waited, stops: this.stops, rts: this.rtUsed }; }
        if (this.rt === undefined) this.rt = reaction();
        if (opts.gate) { const g = opts.gate(this.i, pts, perceived(this.rt), s, 'walk');
          if (g === 'stop') { this.stops++; this.mode = 'over'; this.over = p.overshoot; this.after = 'wait'; this.rtUsed.push(Math.round(this.rt)); this.rtLeft = 0;   // the same reaction delay carries into the wait (perception stays monotonic)
            if (!this.lastDir) { this.mode = 'wait'; } return; } }
        const a = Math.atan2(dy, dx) + heading(dt); let vx = Math.cos(a), vy = Math.sin(a); if (opts.xform) [vx, vy] = opts.xform(vx, vy, perceived(this.rt)); this.lastDir = [vx, vy]; stick(vx, vy);
        // stuck: pushing for 3 s of game time without getting 24 px away from where she was (sliding along a wall counts as stuck)
        if (!this.anchor || Math.hypot(s[0] - this.anchor[0], s[1] - this.anchor[1]) > 24) { this.anchor = s; this.anchorT = K.t; } else if (K.t - this.anchorT > 3000) { stick(0, 0); return { why: 'stuck', i: this.i, at: s, ms: K.t - this.t0 }; }
        this.lastPos = s;
      } });
  }
  // state changes of the visible snapshot, her cell and the stick over the last `ms` of game time (a failure's story)
  function trace(ms) { const out = []; let pv = null, pc = null, pk = null; for (const e of K.buf) { if (e[0] < K.t - ms) continue; const v = JSON.stringify(e[1]), c = JSON.stringify(e[2]);
      if (v !== pv || c !== pc || e[3] !== pk) { out.push([Math.round(e[0] - K.t), e[1], e[2], e[3]]); pv = v; pc = c; pk = e[3]; } } return out; }
  function frameStats(from) { const f = K.frames.slice(from || 0).filter(x => x > 0).sort((a, b) => a - b); if (!f.length) return { n: 0 };
    const mean = f.reduce((a, b) => a + b, 0) / f.length; return { n: f.length, mean: +mean.toFixed(1), p95: +f[Math.floor(f.length * 0.95)].toFixed(1), max: +f[f.length - 1].toFixed(1) }; }
  // The child's rule at a hazard, from her PERCEIVED snapshot only: walk up to the next hazard unit on the route;
  // if it looks dangerous, stop at its edge (release late) and wait until it looks safe; once on a
  // 'commit' unit keep going; if the cell she stands on looks dangerous while she waits, step back.
  function makeGate(ad, cells, margin) {
    const unit = c => ad.unitAt(c[0], c[1]);
    const box = (s, c) => { const ex = Math.max(Math.abs(s[0] - (c[0] * T + 24)) - 24, 0), ey = Math.max(Math.abs(s[1] - (c[1] * T + 24)) - 24, 0); return Math.hypot(ex, ey); };
    let lastJ = -2, m = margin, ap = null;   // where she means to stop: drawn per approach, 0.5..1.5 tiles short of the hazard cell (margin = [min, max] px)
    const gate = (i, pts, vis, s, mode) => {
      const here = [Math.floor(s[0] / T), Math.floor(s[1] / T)], hu = ad.unitAt(here[0], here[1]);
      let j = -1, ju = null; for (let k = Math.max(0, i - 1); k < Math.min(cells.length, i + 6); k++) { const u = unit(cells[k]); if (u && u !== hu) { j = k; ju = u; break; } }
      const look = ad.look || 1, dangerAt = k => { for (let q = k; q < Math.min(cells.length, k + look); q++) { const u = unit(cells[q]); if (u && ad.danger(vis, u)) return true; } return false; };
      if (mode === 'wait' && ad.threat && ad.threat(vis, here)) return 'back';
      if (mode === 'wait' && ad.act && ad.act(vis, here)) return 'act';
      if (hu) {
        const dHere = ad.danger(vis, hu);
        if (ad.commit) { if (mode === 'wait' && dHere) return 'back'; if (mode === 'wait' && ju && box(s, cells[j]) <= m && ad.danger(vis, ju)) return 'stop'; return 'go'; }
        if (dHere) { if (ju && box(s, cells[j]) <= m && ad.danger(vis, ju)) return 'back'; return 'go'; }
      }
      if (j < 0) return 'go';
      if (j !== lastJ) { lastJ = j; m = Array.isArray(margin) ? margin[0] + rnd() * (margin[1] - margin[0]) : margin; gate.margins.push(Math.round(m));
        ap = { unit: ju, j, seenT: null, edgeT: null, firstState: null }; gate.approaches.push(ap); }
      const bx = box(s, cells[j]), now = K.buf.length ? K.buf[K.buf.length - 1][1] : null, ns = ad.stateOf(now, ju);
      if (ap.seenT === null && ns !== 'unseen') { ap.seenT = K.t; ap.seenDist = Math.round(bx); }
      if (ap.edgeT === null && bx <= m) { ap.edgeT = K.t; ap.edgeState = ns; ap.perceived = ad.stateOf(vis, ju); }
      if (bx > m) return 'go';
      return dangerAt(j) ? 'stop' : 'go';
    };
    gate.margins = []; gate.approaches = [];
    return gate;
  }
  // a fresh path over the floor's walkable terrain (4-neighbour BFS), keeping off `avoid` cells: what a child does after she
  // has SEEN a hazard (sprung spikes stay up): she walks round it.
  function replan(from, to, avoid) {
    const c = D().ctx(), WALK = '.=gtzqh', bad = new Set(avoid.map(q => q[0] + ',' + q[1])), key = (x, y) => x + ',' + y;
    const ok = (x, y) => WALK.indexOf(c.terrain(x, y)) >= 0 && !bad.has(key(x, y));
    const prev = new Map([[key(from[0], from[1]), null]]), q = [from];
    for (let h = 0; h < q.length && q.length < 200000; h++) { const [x, y] = q[h]; if (x === to[0] && y === to[1]) { const out = []; let k = key(x, y), cur = [x, y]; while (cur) { out.push(cur); cur = prev.get(key(cur[0], cur[1])); } return out.reverse(); }
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const nx = x + dx, ny = y + dy, k = key(nx, ny); if (prev.has(k) || !ok(nx, ny)) continue; prev.set(k, [x, y]); q.push([nx, ny]); } }
    return null;
  }
  window.__KID = { makeGate, replan, trace, K, install, stick, idle, waitUntil, walk, perceived, reaction, soles, camView, frameStats,
    setProfile(p, s) { K.prof = p; seed = s || 1; }, setAdapter(a) { K.adapter = a; K.buf = []; }, rnd, gauss,
    now: () => K.t, frameMark: () => K.frames.length, inputPath: () => inputPath, cancel() { if (K.job) { const o = K.job; K.job = null; stick(0, 0); o.done({ why: 'cancelled' }); } } };
  install();
})();
