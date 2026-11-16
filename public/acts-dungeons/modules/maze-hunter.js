/* Sunken Temple: the maze hunter (mechanic id `maze-hunter`).

   The floor is a maze of halls on a 5-tile pitch (`cellGraph`: hall -> joined halls). A stone
   guardian sleeps in its home hall. After she has walked `wakesAfterCellsWalked` halls it wakes
   and walks the shortest way to the hall she is in, at `hunterMovesPerHeroCellMoves` of her own
   pace, eyes glowing. It never enters a staircase hall or the boss chamber, and stands still
   while she is in one. If it reaches her: a battle; afterwards it is back home, asleep, and the
   count starts again.
   Persistent: `hunter` = "<awake 0|1>|<hall i,j>|<halls walked>" (story flags), so Continue finds
   it where it was. The bundle's own maze hunter is switched off. */
(function () {
  'use strict';
  var D = window.__QOK_DNG2__; if (!D || !D.register) return;
  var T = 48, CATCH = 30;
  function kit() { return window.__QOK_D2KIT_B__; }

  // ---- pure logic ---------------------------------------------------------------------------------
  function model(ctx) {
    var P = ctx.mechanic.params || {}, g = ctx.mechanic.cellGraph || {}, W = P.mazeCells[0], H = P.mazeCells[1], pitch = P.cellPitchTiles || 5;
    var sp = String(P.hunterMovesPerHeroCellMoves || '1/2').split('/'), safe = {}, a = ctx.plan.assets || [], i;
    var M = { W: W, H: H, pitch: pitch, adj: g, ratio: (+sp[0] || 1) / (+sp[1] || 2), wake: P.wakesAfterCellsWalked || 3, home: ctx.mechanic.hunterHome.slice(), safe: safe };
    safe['0,' + (H - 1)] = 1;                                                // the hall she arrives in
    for (i = 0; i < a.length; i++) {
      if (a[i].kind === 'stairsDown' || a[i].kind === 'stairsNext' || a[i].kind === 'stairsUp' || a[i].kind === 'stairsPrev') safe[cellOfTile(M, a[i].x, a[i].y).join(',')] = 1;
      if (a[i].kind === 'boss') { safe[(W - 1) + ',0'] = 1; safe[(W - 2) + ',0'] = 1; safe[(W - 1) + ',1'] = 1; safe[(W - 2) + ',1'] = 1; }
    }
    return M;
  }
  function clampi(v, n) { return v < 0 ? 0 : v >= n ? n - 1 : v; }
  function cellOfTile(M, tx, ty) { return [clampi(Math.round((tx - 2) / M.pitch), M.W), clampi(Math.round((ty - 2) / M.pitch), M.H)]; }
  function cellOfPx(M, x, y) { return cellOfTile(M, x / T - 0.5, y / T - 0.5); }
  function centre(M, c) { return [(2 + M.pitch * c[0]) * T + T / 2, (2 + M.pitch * c[1]) * T + T / 2]; }
  function dists(M, from) {                                                  // halls from `from`, never through a safe hall
    var d = {}, q = [from], k = from.join(','); d[k] = 0;
    for (var i = 0; i < q.length; i++) { var u = q[i], nb = M.adj[u.join(',')] || [];
      for (var j = 0; j < nb.length; j++) { var kk = nb[j].join(','); if (d[kk] !== undefined || M.safe[kk]) continue; d[kk] = d[u.join(',')] + 1; q.push(nb[j]); } }
    return d;
  }
  function nextHall(M, at, target, d) {                                      // the neighbour of `at` nearest the target (ties: smallest hall)
    d = d || dists(M, target); var nb = M.adj[at.join(',')] || [], best = null, bd = 1e9, i;
    for (i = 0; i < nb.length; i++) { var k = nb[i].join(','); if (M.safe[k] || d[k] === undefined) continue;
      if (d[k] < bd || (d[k] === bd && (nb[i][0] < best[0] || (nb[i][0] === best[0] && nb[i][1] < best[1])))) { bd = d[k]; best = nb[i]; } }
    return best;
  }

  // ---- state --------------------------------------------------------------------------------------
  function ready(ctx) {
    var S = ctx.state; if (S.ok) return true;
    var K = kit(); if (!K) return false;
    S.K = K; S.M = model(ctx); S.spr = null; S.busy = false; S.grace = 500;
    var M = S.M, v = K.getFlag(ctx, 'hunter'), p = typeof v === 'string' ? v.split('|') : null, at = M.home.slice(), awake = false, walked = 0;
    if (p && p.length === 3) { var c = p[1].split(','); if (M.adj[p[1]] && !M.safe[p[1]]) at = [+c[0], +c[1]]; awake = p[0] === '1'; walked = Math.max(0, Math.min(M.wake, +p[2] || 0)); }
    var c0 = centre(M, at);
    S.h = { at: at, to: null, x: c0[0], y: c0[1], awake: awake, walked: walked, cell: null };
    S.monster = K.monsterFor(ctx, 'templeGuard'); K.quiet(ctx.scene);
    S.ok = true; return true;
  }
  function store(ctx) { var h = ctx.state.h; ctx.state.K.setFlag(ctx, 'hunter', (h.awake || h.walked) ? ((h.awake ? '1' : '0') + '|' + h.at.join(',') + '|' + h.walked) : false); }
  function sleep(ctx) { var S = ctx.state, h = S.h, c = centre(S.M, S.M.home); h.at = S.M.home.slice(); h.to = null; h.x = c[0]; h.y = c[1]; h.awake = false; h.walked = 0; store(ctx); }
  function heroSpeed() { return typeof window.__A1_DNG_SPEED__ === 'number' ? window.__A1_DNG_SPEED__ : 260; }
  function toward(h, x, y, step) { var dx = x - h.x, dy = y - h.y, d = Math.sqrt(dx * dx + dy * dy); if (d <= step) { h.x = x; h.y = y; return true; }
    h.x += dx / d * step; h.y += dy / d * step; if (Math.abs(dx) > Math.abs(dy)) h.face = dx > 0 ? 1 : -1; return false; }
  function advance(ctx, dt, sx, sy, hc) {                                     // one frame of the hunt
    var S = ctx.state, M = S.M, h = S.h, step = heroSpeed() * M.ratio * dt / 1000, same = h.at[0] === hc[0] && h.at[1] === hc[1], c;
    if (h.to) {
      var d = dists(M, hc), da = d[h.at.join(',')], dt2 = d[h.to.join(',')];
      if (da !== undefined && (dt2 === undefined || da < dt2)) { var sw = h.at; h.at = h.to; h.to = sw; }   // she doubled back: turn round on the spot
      c = centre(M, h.to);
      if (toward(h, c[0], c[1], step)) { h.at = h.to; h.to = null; store(ctx); }
      return;
    }
    if (same) { toward(h, sx, sy, step); return; }                              // in her hall: straight at her
    var n = nextHall(M, h.at, hc); c = centre(M, h.at);
    if (!n) { toward(h, c[0], c[1], step); return; }
    var ax = n[0] - h.at[0], ay = n[1] - h.at[1], off = Math.abs((h.x - c[0]) * ay) + Math.abs((h.y - c[1]) * ax);   // how far she pulled it off this corridor's line
    var back = (h.x - c[0]) * ax + (h.y - c[1]) * ay;
    if (off > 60 || back < -60) { toward(h, c[0], c[1], step); return; }        // out of another arm of the hall: via the middle
    h.to = n; c = centre(M, n); if (toward(h, c[0], c[1], step)) { h.at = n; h.to = null; store(ctx); }
  }

  // ---- pictures ------------------------------------------------------------------------------------
  function eyesTex(sc, K) {
    return K.canvasTex(sc, 'd2b_eyes', 44, 20, function (g) {
      [[12, 10], [32, 10]].forEach(function (p) { var gr = g.createRadialGradient(p[0], p[1], 1, p[0], p[1], 10); gr.addColorStop(0, 'rgba(255,250,200,1)'); gr.addColorStop(0.35, 'rgba(120,255,230,0.9)'); gr.addColorStop(1, 'rgba(60,220,255,0)');
        g.fillStyle = gr; g.fillRect(p[0] - 10, p[1] - 10, 20, 20); });
    });
  }
  function fallbackTex(sc, K) {
    return K.canvasTex(sc, 'd2b_hunter', 44, 60, function (g) {
      g.fillStyle = '#26383c'; g.fillRect(6, 14, 32, 40); g.fillStyle = '#6f8a86'; g.fillRect(9, 16, 26, 36); g.fillStyle = '#8fa9a2'; g.fillRect(9, 16, 26, 4);
      g.fillStyle = '#26383c'; g.fillRect(10, 0, 24, 18); g.fillStyle = '#7d9892'; g.fillRect(12, 2, 20, 14);
      g.fillStyle = '#1a2628'; g.fillRect(15, 8, 5, 3); g.fillRect(24, 8, 5, 3); g.fillRect(9, 52, 10, 8); g.fillRect(25, 52, 10, 8);
    });
  }
  function build(ctx) {
    var S = ctx.state, K = S.K, sc = ctx.scene, key = K.monsterTex(sc, S.monster);
    if (!key) { S.waited = (S.waited || 0) + 1; if (S.monster && S.waited < 180) return; key = fallbackTex(sc, K); }
    var body = ctx.own(sc.add.image(0, 0, key).setOrigin(0.5, 0.92)), k = 66 / Math.max(1, body.height || 66); body.setScale(k);
    S.spr = { body: body, shadow: ctx.own(sc.add.ellipse(0, 0, 38, 13, 0x000000, 0.32).setDepth(ctx.depth.object)),
      eyes: ctx.own(sc.add.image(0, 0, eyesTex(sc, K)).setDepth(11)), halo: ctx.own(sc.add.circle(0, 0, 46, 0x58f0e0, 0.0).setDepth(ctx.depth.ground + 0.3)) };
    try { S.spr.eyes.setBlendMode(1); S.spr.halo.setBlendMode(1); } catch (e) {}
  }
  function paint(ctx) {
    var S = ctx.state, K = S.K, h = S.h; if (!S.spr) { build(ctx); if (!S.spr) return; }
    var e = S.spr, t = (S.t || 0) / 1000, bob = h.awake ? Math.abs(Math.sin(t * 6)) * 3 : 0;
    e.body.setPosition(h.x, h.y + 18 - bob).setDepth(K.sortDepth(ctx, h.y + 18)); e.shadow.setPosition(h.x, h.y + 17);
    if (h.face) e.body.setFlipX(h.face < 0);
    if (h.awake) { e.body.clearTint(); e.eyes.setVisible(true).setPosition(h.x, h.y - 26 - bob).setAlpha(0.75 + 0.25 * Math.sin(t * 9)); e.halo.setPosition(h.x, h.y).setFillStyle(0x58f0e0, 0.10 + 0.05 * Math.sin(t * 5)); }
    else { e.body.setTint(0x6f8088); e.eyes.setVisible(false); e.halo.setFillStyle(0x58f0e0, 0); }
  }
  function caught(ctx) {
    var S = ctx.state, K = S.K, sc = ctx.scene;
    S.busy = true; S.battles = (S.battles || 0) + 1;
    var m = S.monster || K.monsterFor(ctx, 'templeGuard');
    var go = function () { S.busy = false; S.grace = 1500; sleep(ctx); if (!K.battle(ctx, m)) { try { sc.isMoving = false; } catch (e) {} } };
    try { sc.isMoving = true; ctx.say(K.text('d2.hunter.caught')); sc.time.delayedCall(650, go); } catch (e) { go(); }
  }

  D.register('maze-hunter', {
    logic: { model: model, cellOfPx: cellOfPx, cellOfTile: cellOfTile, centre: centre, dists: dists, nextHall: nextHall },
    load: function (ctx) { ready(ctx); },
    tick: function (ctx, dt) {
      if (!ready(ctx)) return;
      var S = ctx.state, K = S.K, M = S.M, h = S.h;
      K.quiet(ctx.scene); S.t = (S.t || 0) + dt;
      var s = K.soles(ctx);
      if (s && !S.busy && K.onField(ctx)) {
        var hc = cellOfPx(M, s.x, s.y), key = hc.join(','), safe = !!M.safe[key];
        if (h.cell !== null && h.cell !== key && !h.awake) {                   // one more hall walked
          h.walked = Math.min(M.wake, h.walked + 1);
          if (h.walked >= M.wake) { h.awake = true; S.wakes = (S.wakes || 0) + 1;
            if (!K.getFlag(ctx, 'told.wake')) { K.setFlag(ctx, 'told.wake', true); ctx.say(K.text('d2.hunter.wakes')); } }
          store(ctx);
        }
        h.cell = key;
        if (S.grace > 0) S.grace -= dt;
        else if (h.awake && !safe) {
          advance(ctx, Math.min(dt, 100), s.x, s.y, hc);
          var dx = h.x - s.x, dy = h.y - s.y;
          if (dx * dx + dy * dy <= CATCH * CATCH) caught(ctx);
        }
      }
      paint(ctx);
    },
    step: function (ctx) { if (!ready(ctx)) return undefined; return ctx.state.busy ? false : undefined; }
  });
})();
