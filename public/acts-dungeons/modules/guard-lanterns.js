/* Demon Barracks: guards and their lanterns (mechanic id `guard-lanterns`).

   Every guard walks a fixed beat (the plan's waypoints, ping-pong or loop, two ticks per tile, a
   pause at each end, an offset into the 60-tick period) and throws a cone of lantern light ahead:
   every floor cell within `coneRangeTiles` (+0.5) of it, inside `coneHalfAngleDeg` of its facing,
   that no wall or pillar hides; plus the eight cells around it. Stand in the light and a battle
   starts; that guard (every guard whose light was on her) is gone afterwards, for good.

   The lit cells are computed exactly as the plan's solver did (same line-of-sight samples), so
   the route it proved unseen is unseen here, and the light on the floor is the trigger itself.
   Persistent: `gone.<guard id>` (story flags) and the clock phase. */
(function () {
  'use strict';
  var D = window.__QOK_DNG2__; if (!D || !D.register) return;
  var T = 48, WALK = '.=gtzqh';
  function kit() { return window.__QOK_D2KIT_B__; }

  // ---- pure logic ---------------------------------------------------------------------------------
  function sgn(v) { return v > 0 ? 1 : v < 0 ? -1 : 0; }
  // seq(g, P): [x, y, dx, dy] for every tick of the period (lib: dungeons/demonBarracks.py `beat`)
  function seq(g, P) {
    var way = g.waypoints, pts = way.slice(), legs = [], i, out = [], tpt = g.ticksPerTile || 2;
    if (g.mode === 'loop') pts.push(way[0]);
    for (i = 0; i + 1 < pts.length; i++) { var a = pts[i], b = pts[i + 1];
      legs.push({ a: a, d: [sgn(b[0] - a[0]), sgn(b[1] - a[1])], n: Math.abs(b[0] - a[0]) + Math.abs(b[1] - a[1]) }); }
    function run(ls) {
      for (var k = 0; k < ls.length; k++) { var l = ls[k], j, r;
        for (j = 0; j < l.n; j++) for (r = 0; r < tpt; r++) out.push([l.a[0] + l.d[0] * j, l.a[1] + l.d[1] * j, l.d[0], l.d[1]]);
        for (r = 0; r < (g.pauseTicks || 0); r++) out.push([l.a[0] + l.d[0] * l.n, l.a[1] + l.d[1] * l.n, l.d[0], l.d[1]]); }
    }
    run(legs);
    if (g.mode === 'pingpong') { var back = [];
      for (i = legs.length - 1; i >= 0; i--) { var l = legs[i]; back.push({ a: [l.a[0] + l.d[0] * l.n, l.a[1] + l.d[1] * l.n], d: [-l.d[0], -l.d[1]], n: l.n }); }
      run(back); }
    var one = out.slice(), n = one.length; out = [];
    for (i = 0; i < P; i++) out.push(one[(i + (g.offsetTicks || 0)) % n]);
    return out;
  }
  function pyRound(v) { var f = Math.floor(v), r = v - f; return r > 0.5 ? f + 1 : r < 0.5 ? f : (f % 2 === 0 ? f : f + 1); }   // round half to even, as the solver's round()
  function litCells(ctx, pos, R, cosHalf, cache) {
    var key = pos.join(','), hit = cache && cache[key]; if (hit) return hit;
    var s = {}, x, y, px = pos[0], py = pos[1], dx = pos[2], dy = pos[3];
    function solid(cx, cy) { var c = ctx.terrain(cx, cy); return c === '#' || c === 'p'; }
    function los(bx, by) { var n = Math.max(Math.abs(bx - px), Math.abs(by - py)) * 2, i;
      for (i = 1; i < n; i++) if (solid(pyRound(px + (bx - px) * i / n), pyRound(py + (by - py) * i / n))) return false;
      return true; }
    for (y = py - R; y <= py + R; y++) for (x = px - R; x <= px + R; x++) {
      if (WALK.indexOf(ctx.terrain(x, y)) < 0) continue;
      var vx = x - px, vy = y - py, dist = Math.sqrt(vx * vx + vy * vy);
      if (Math.max(Math.abs(vx), Math.abs(vy)) <= 1) s[x + ',' + y] = 1;
      else if (dist <= R + 0.5 && (vx * dx + vy * dy) / dist >= cosHalf && los(x, y)) s[x + ',' + y] = 1;
    }
    if (cache) cache[key] = s;
    return s;
  }
  function model(ctx) {
    var P = ctx.mechanic.params || {}, per = P.periodTicks || 60, a = ctx.plan.mech || [], gs = [], i;
    for (i = 0; i < a.length; i++) if (a[i].kind === 'guard') gs.push({ id: a[i].id, asset: a[i], seq: seq(a[i], per), gone: false });
    return { period: per, R: P.coneRangeTiles || 6, cosHalf: Math.cos((P.coneHalfAngleDeg || 40) * Math.PI / 180), guards: gs, cache: {} };
  }
  function litBy(ctx, M, g, tick) { var t = ((Math.floor(tick) % M.period) + M.period) % M.period; return litCells(ctx, g.seq[t], M.R, M.cosHalf, M.cache); }
  function seenBy(ctx, M, tick, cx, cy) {                                     // the live guards whose light is on this cell now
    var out = [], k = cx + ',' + cy, i;
    for (i = 0; i < M.guards.length; i++) if (!M.guards[i].gone && litBy(ctx, M, M.guards[i], tick)[k]) out.push(M.guards[i]);
    return out;
  }

  // ---- state and pictures ----------------------------------------------------------------------------
  function ready(ctx) {
    var S = ctx.state; if (S.ok) return true;
    var K = kit(); if (!K) return false;
    S.K = K; S.M = model(ctx); S.ms = K.tickMs(ctx.mechanic.params); S.grace = 600; S.spr = null; S.drawn = -1; S.busy = false;
    for (var i = 0; i < S.M.guards.length; i++) S.M.guards[i].gone = !!K.getFlag(ctx, 'gone.' + S.M.guards[i].id);
    S.monster = K.monsterFor(ctx, 'demon');
    S.tick = K.clock(ctx, 0, S.M.period, S.ms);
    S.ok = true; return true;
  }
  function lanternTex(sc, K) {
    return K.canvasTex(sc, 'd2b_lantern', 20, 28, function (g) {
      g.fillStyle = '#2a2018'; g.fillRect(8, 0, 4, 5); g.fillRect(4, 4, 12, 3); g.fillRect(4, 22, 12, 4);
      g.fillStyle = '#ffd866'; g.fillRect(5, 7, 10, 15); g.fillStyle = '#fff6c8'; g.fillRect(8, 10, 4, 9);
      g.fillStyle = '#2a2018'; g.fillRect(4, 7, 2, 15); g.fillRect(14, 7, 2, 15);
    });
  }
  function fallbackTex(sc, K) {                                               // only if the demon picture cannot be had
    return K.canvasTex(sc, 'd2b_guard', 40, 56, function (g) {
      g.fillStyle = '#3a1420'; g.fillRect(8, 14, 24, 34); g.fillStyle = '#7a2434'; g.fillRect(10, 16, 20, 30);
      g.fillStyle = '#3a1420'; g.fillRect(11, 2, 18, 16); g.fillStyle = '#a23246'; g.fillRect(13, 4, 14, 12);
      g.fillStyle = '#ffe070'; g.fillRect(15, 9, 3, 3); g.fillRect(22, 9, 3, 3);
      g.fillStyle = '#d8d0c0'; g.fillRect(9, 0, 3, 6); g.fillRect(28, 0, 3, 6); g.fillStyle = '#241018'; g.fillRect(11, 48, 7, 8); g.fillRect(22, 48, 7, 8);
    });
  }
  function buildOld(ctx) {
    var S = ctx.state, K = S.K, sc = ctx.scene, key = K.monsterTex(sc, S.monster);
    if (!key) { S.waited = (S.waited || 0) + 1; if (S.monster && S.waited < 180) return; key = fallbackTex(sc, K); }
    S.spr = { light: ctx.own(sc.add.graphics().setDepth(ctx.depth.ground + 0.3)), g: {} };
    try { S.spr.light.setBlendMode(1); } catch (e) {}
    for (var i = 0; i < S.M.guards.length; i++) { var g = S.M.guards[i]; if (g.gone) continue;
      var body = ctx.own(sc.add.image(0, 0, key).setOrigin(0.5, 0.92)), sh = ctx.own(sc.add.ellipse(0, 0, 34, 12, 0x000000, 0.3).setDepth(ctx.depth.object));
      var sc0 = 62 / Math.max(1, body.height || 62); body.setScale(sc0);
      S.spr.g[g.id] = { body: body, shadow: sh, lamp: ctx.own(sc.add.image(0, 0, lanternTex(sc, K)).setOrigin(0.5, 0)), scale: sc0 }; }
  }
  function paintOld(ctx) {
    var S = ctx.state, M = S.M, K = S.K; if (!S.spr) { buildOld(ctx); if (!S.spr) return; }
    var t0 = Math.floor(S.tick), fr = S.tick - t0, a = ((t0 % M.period) + M.period) % M.period, b = (a + 1) % M.period, i;
    for (i = 0; i < M.guards.length; i++) { var g = M.guards[i], e = S.spr.g[g.id]; if (!e) continue;
      if (g.gone) { e.body.setVisible(false); e.shadow.setVisible(false); e.lamp.setVisible(false); continue; }
      var p = g.seq[a], q = g.seq[b], x = (p[0] + (q[0] - p[0]) * fr + 0.5) * T, y = (p[1] + (q[1] - p[1]) * fr + 0.5) * T;
      var bob = (p[0] !== q[0] || p[1] !== q[1]) ? Math.abs(Math.sin(S.tick * Math.PI)) * 3 : 0;
      e.body.setPosition(x, y + 16 - bob); e.shadow.setPosition(x, y + 15); e.body.setDepth(K.sortDepth(ctx, y + 16));
      if (p[2]) e.body.setFlipX(p[2] < 0);
      e.lamp.setPosition(x + p[2] * 18 + (p[3] ? 14 : 0), y - 22 + p[3] * 6 - bob); e.lamp.setDepth(e.body.depth + (p[3] < 0 ? -0.05 : 0.05));
    }
    if (S.drawn !== t0) { S.drawn = t0; var L = S.spr.light, seen = {}, k; L.clear();
      for (i = 0; i < M.guards.length; i++) { if (M.guards[i].gone) continue; var lit = litBy(ctx, M, M.guards[i], t0), gp = M.guards[i].seq[a];
        for (k in lit) { if (seen[k]) continue; seen[k] = 1; var c = k.split(','), cx = +c[0], cy = +c[1];
          var d = Math.max(Math.abs(cx - gp[0]), Math.abs(cy - gp[1]));
          L.fillStyle(0xffd24a, d <= 1 ? 0.30 : Math.max(0.12, 0.28 - d * 0.022)); L.fillRect(cx * T + 1, cy * T + 1, T - 2, T - 2); } } }
  }
  // ---- the look (day 4): a soft pool of warm light and a drawn lantern -----------------------------------
  // The lit cells are the same cells (litCells, the trigger itself) at the same strength per cell as the square
  // cells below; they are drawn as one soft picture per guard instead: every lit cell fully inside it, no lines
  // between cells, the edge fading outward over about a quarter cell. The light of the current tick is always
  // there in full, and it is the ONLY bright light: a child reads the light as the rule, so the bright pool is
  // exactly the cells that catch her, on every tick. The light a guard is about to throw and the light it has
  // just left are only a faint breath (GHOST of the pool's strength, well under the dimmest lit cell), fading in
  // over the tick before and out over the tick after, so the pool does not jump from nothing.
  // Cost: a picture is redrawn only when its cells change and only while its lit cells are near the screen; on
  // the frame a tick turns only the catching light is redrawn, the two faint ones one and two frames later.
  // localStorage 'qok-d4-looks' = '0' draws the old square cells and the old flat lantern.
  var LOOKS = (function () { try { return window.localStorage.getItem('qok-d4-looks') !== '0'; } catch (e) { return true; } })();
  var RES = 6, PAD = 2, LIGHT = 0.30, GHOST = 0.16;                          // mask px per cell, cells of margin, the old cells' alpha beside the guard, the coming and leaving light's share of it
  function grow(A, W, H) { var B = new Float32Array(W * H), x, y, i, m;
    for (y = 0; y < H; y++) for (x = 0; x < W; x++) { i = y * W + x; m = A[i];
      if (x > 0 && A[i - 1] > m) m = A[i - 1]; if (x < W - 1 && A[i + 1] > m) m = A[i + 1]; if (y > 0 && A[i - W] > m) m = A[i - W]; if (y < H - 1 && A[i + W] > m) m = A[i + W]; B[i] = m; }
    return B; }
  function blur(A, W, H, n) { var B = new Float32Array(W * H), x, y, i, k;
    for (k = 0; k < n; k++) {
      for (y = 0; y < H; y++) for (x = 0; x < W; x++) { i = y * W + x; B[i] = (A[i] * 2 + A[x > 0 ? i - 1 : i] + A[x < W - 1 ? i + 1 : i]) * 0.25; }
      for (y = 0; y < H; y++) for (x = 0; x < W; x++) { i = y * W + x; A[i] = (B[i] * 2 + B[y > 0 ? i - W : i] + B[y < H - 1 ? i + W : i]) * 0.25; } }
    return A; }
  // soft(pos): the soft picture of the cells a guard at `pos` lights: {x, y (world px of its corner), w (px, square), a}
  function soft(ctx, M, pos) {
    var key = pos.join(','), hit = M.soft[key]; if (hit) return hit;
    if ((M.softN = (M.softN || 0) + 1) > 96) { M.soft = {}; M.softN = 1; }      // a guard's beat revisits the same few cells: keep the latest (three per guard are live each frame)
    var lit = litCells(ctx, pos, M.R, M.cosHalf, M.cache), n = M.R + 1 + PAD, x0 = pos[0] - n, y0 = pos[1] - n, W = (2 * n + 1) * RES, A = new Float32Array(W * W), k, x, y;
    var bx0 = 1e9, by0 = 1e9, bx1 = -1e9, by1 = -1e9;                          // the lit cells' own box (cells): what decides whether the picture is near the screen
    for (k in lit) { var c = k.split(','), cx = +c[0], cy = +c[1], d = Math.max(Math.abs(cx - pos[0]), Math.abs(cy - pos[1])), v = (d <= 1 ? 0.30 : Math.max(0.12, 0.28 - d * 0.022)) / LIGHT;   // the old cells' own alpha
      var px = (cx - x0) * RES, py = (cy - y0) * RES; if (px < 0 || py < 0 || px + RES > W || py + RES > W) continue;
      if (cx < bx0) bx0 = cx; if (cx > bx1) bx1 = cx; if (cy < by0) by0 = cy; if (cy > by1) by1 = cy;
      for (y = 0; y < RES; y++) for (x = 0; x < RES; x++) A[(py + y) * W + px + x] = v; }
    A = blur(grow(A, W, W), W, W, 2);
    for (k = 0; k < A.length; k++) A[k] = Math.min(1, A[k] * 1.2);
    return (M.soft[key] = { key: key, x: x0 * T, y: y0 * T, w: W, a: A, bx0: bx0 * T, by0: by0 * T, bx1: (bx1 + 1) * T, by1: (by1 + 1) * T });
  }
  function near(A, v) { return !v || (A.bx0 - T / 2 < v.right && A.bx1 + T / 2 > v.x && A.by0 - T / 2 < v.bottom && A.by1 + T / 2 > v.y); }   // its lit cells (and the soft edge, half a cell) reach the camera's view
  function put(sc, key, A, B) {                                               // picture A, less picture B where they overlap (the light that is new, or left behind)
    try { var t = sc.textures.exists(key) ? sc.textures.get(key) : sc.textures.createCanvas(key, A.w, A.w), g = t.getContext(), im = g.createImageData(A.w, A.w), d = im.data, W = A.w, x, y, i, v;
      var ox = B ? Math.round((A.x - B.x) / T * RES) : 0, oy = B ? Math.round((A.y - B.y) / T * RES) : 0;
      for (y = 0; y < W; y++) for (x = 0; x < W; x++) { i = y * W + x; v = A.a[i];
        if (B && v > 0) { var bx = x + ox, by = y + oy; if (bx >= 0 && by >= 0 && bx < W && by < W) v -= B.a[by * W + bx]; }
        d[i * 4] = 255; d[i * 4 + 1] = 255; d[i * 4 + 2] = 255; d[i * 4 + 3] = v > 0 ? Math.round(v * 255) : 0; }
      g.putImageData(im, 0, 0); t.refresh(); try { t.setFilter(0); } catch (e) {}
      return key; } catch (e) { return null; }
  }
  function lanternTex2(sc, K) {                                              // a small iron lantern: ring, cap, glass with a flame, foot
    return K.canvasTex(sc, 'd2b_lantern2', 24, 36, function (g) {
      g.strokeStyle = '#1c140e'; g.lineWidth = 2; g.beginPath(); g.arc(12, 5, 3.5, 0, Math.PI * 2); g.stroke();
      g.fillStyle = '#1c140e'; g.beginPath(); g.moveTo(8, 8); g.lineTo(16, 8); g.lineTo(20, 13); g.lineTo(4, 13); g.closePath(); g.fill();
      g.fillStyle = '#5a4a3a'; g.fillRect(9, 9, 6, 1);
      var gl = g.createRadialGradient(12, 21, 1, 12, 21, 10); gl.addColorStop(0, '#fffbe2'); gl.addColorStop(0.35, '#ffe07a'); gl.addColorStop(0.8, '#f5a030'); gl.addColorStop(1, '#b8601a');
      g.fillStyle = gl; g.fillRect(5, 13, 14, 16);
      g.fillStyle = '#fff6c8'; g.beginPath(); g.moveTo(12, 16); g.quadraticCurveTo(15.5, 21, 12, 25.5); g.quadraticCurveTo(8.5, 21, 12, 16); g.closePath(); g.fill();
      g.fillStyle = '#ffffff'; g.fillRect(11, 21, 2, 3);
      g.fillStyle = '#1c140e'; g.fillRect(4, 13, 1.6, 16); g.fillRect(18.4, 13, 1.6, 16); g.fillRect(11.4, 13, 1.2, 3); g.fillRect(11.4, 26.5, 1.2, 2.5);
      g.fillRect(3, 29, 18, 3.5); g.fillRect(6, 32, 12, 2); g.fillStyle = '#6a5846'; g.fillRect(4, 29, 16, 1);
    });
  }
  function haloTex(sc, K) {                                                   // the glow round the lantern itself
    return K.canvasTex(sc, 'd2b_lhalo', 64, 64, function (g) {
      var f = g.createRadialGradient(32, 32, 2, 32, 32, 32); f.addColorStop(0, 'rgba(255,236,170,0.85)'); f.addColorStop(0.35, 'rgba(255,196,90,0.38)'); f.addColorStop(1, 'rgba(255,160,50,0)');
      g.fillStyle = f; g.fillRect(0, 0, 64, 64);
    });
  }
  function build(ctx) {
    var S = ctx.state, K = S.K, sc = ctx.scene, key = K.monsterTex(sc, S.monster), dg = ctx.depth.ground;
    if (!key) { S.waited = (S.waited || 0) + 1; if (S.monster && S.waited < 180) return; key = fallbackTex(sc, K); }
    S.spr = { light: null, g: {}, look: 2 }; S.M.soft = {};
    for (var i = 0; i < S.M.guards.length; i++) { var g = S.M.guards[i]; if (g.gone) continue;
      var body = ctx.own(sc.add.image(0, 0, key).setOrigin(0.5, 0.92)), sh = ctx.own(sc.add.ellipse(0, 0, 34, 12, 0x000000, 0.3).setDepth(ctx.depth.object));
      var sc0 = 62 / Math.max(1, body.height || 62); body.setScale(sc0);
      var e = S.spr.g[g.id] = { body: body, shadow: sh, lamp: ctx.own(sc.add.image(0, 0, lanternTex2(sc, K)).setOrigin(0.5, 0)), scale: sc0, pool: [], sig: ['', '', ''] };
      e.halo = ctx.own(sc.add.image(0, 0, haloTex(sc, K)).setAlpha(0.8)); try { e.halo.setBlendMode(1); } catch (x) {}
      for (var j = 0; j < 3; j++) {                                           // 0: this tick's light, 1: the light coming, 2: the light left behind
        var tk = put(sc, 'd2b_pool_' + ctx.key + '_' + g.id + '_' + j, soft(ctx, S.M, g.seq[0]), j ? soft(ctx, S.M, g.seq[0]) : null);
        if (!tk) { S.spr = null; LOOKS = false; return buildOld(ctx); }       // no canvas: the square cells still show the light
        var im = ctx.own(sc.add.image(0, 0, tk).setOrigin(0, 0).setScale(T / RES).setDepth(dg + 0.3).setTint(0xffcc55).setVisible(false)); try { im.setBlendMode(1); } catch (x) {}
        e.pool.push(im); } }
  }
  function paint(ctx) {
    if (!LOOKS) return paintOld(ctx);
    var S = ctx.state, M = S.M, K = S.K, sc = ctx.scene; if (!S.spr) { build(ctx); if (!S.spr) return; }
    if (S.spr.look !== 2) return paintOld(ctx);
    var t0 = Math.floor(S.tick), fr = S.tick - t0, a = ((t0 % M.period) + M.period) % M.period, b = (a + 1) % M.period, z = (a - 1 + M.period) % M.period, i, j, v = null;
    try { v = sc.cameras.main.worldView; } catch (x) {}
    var ms = S.tick * S.ms, ease = fr * fr * (3 - 2 * fr), sp = S.spr;
    if (sp.t0 !== t0) { sp.t0 = t0; sp.since = 0; } else sp.since++;          // frames since the tick turned
    for (i = 0; i < M.guards.length; i++) { var g = M.guards[i], e = S.spr.g[g.id]; if (!e) continue;
      if (g.gone) { e.body.setVisible(false); e.shadow.setVisible(false); e.lamp.setVisible(false); e.halo.setVisible(false); for (j = 0; j < 3; j++) e.pool[j].setVisible(false); continue; }
      var p = g.seq[a], q = g.seq[b], x = (p[0] + (q[0] - p[0]) * fr + 0.5) * T, y = (p[1] + (q[1] - p[1]) * fr + 0.5) * T;
      var bob = (p[0] !== q[0] || p[1] !== q[1]) ? Math.abs(Math.sin(S.tick * Math.PI)) * 3 : 0;
      e.body.setPosition(x, y + 16 - bob); e.shadow.setPosition(x, y + 15); e.body.setDepth(K.sortDepth(ctx, y + 16));
      if (p[2]) e.body.setFlipX(p[2] < 0);
      e.lamp.setPosition(x + p[2] * 18 + (p[3] ? 14 : 0), y - 26 + p[3] * 6 - bob); e.lamp.setDepth(e.body.depth + (p[3] < 0 ? -0.05 : 0.05));
      var fl = 1.05 + 0.035 * Math.sin(ms * 0.011 + i * 2.1) + 0.02 * Math.sin(ms * 0.029 + i);   // a slow flicker, never dimmer than the old cells
      e.halo.setPosition(e.lamp.x, e.lamp.y + 21).setDepth(e.lamp.depth - 0.02).setScale(0.86 * fl).setAlpha(0.8 * fl - 0.1);
      // the pool: three pictures, each redrawn only when the cells it shows change and only while its lit cells are near the screen.
      // 0 is the light that catches her: in full, and redrawn on the very frame the tick turns. 2 and 1 (the light left behind,
      // then the light coming, which starts from nothing; never bright, see GHOST) wait one and two frames, hidden meanwhile, so
      // one frame never carries all three.
      var C = soft(ctx, M, p), N = soft(ctx, M, q), P = soft(ctx, M, g.seq[z]), want = [[C, null, LIGHT], [N, C, LIGHT * GHOST * ease], [P, C, LIGHT * GHOST * (1 - ease)]];
      for (j = 0; j < 3; j++) { var im = e.pool[j], A = want[j][0], B = want[j][1];
        if ((B && A.key === B.key) || !near(A, v)) { im.setVisible(false); continue; }
        var sig = A.key + (B ? '|' + B.key : '');
        if (e.sig[j] !== sig) { if (j && 3 - j > sp.since) { im.setVisible(false); continue; }
          e.sig[j] = sig; put(sc, im.texture.key, A, B); im.setPosition(A.x, A.y); }
        im.setVisible(true).setAlpha(Math.min(1, want[j][2] * fl)); }
    }
  }
  function caught(ctx, list) {
    var S = ctx.state, K = S.K, sc = ctx.scene, i;
    S.busy = true; S.battles = (S.battles || 0) + 1;
    for (i = 0; i < list.length; i++) K.setFlag(ctx, 'gone.' + list[i].id, true);     // gone for good from this moment (a save in the box keeps it)
    var m = S.monster || K.monsterFor(ctx, 'demon');
    var go = function () {                                                     // the guard stands in its light until the battle takes the screen
      for (var j = 0; j < list.length; j++) list[j].gone = true;
      S.drawn = -1; S.busy = false; S.grace = 1500; if (!K.battle(ctx, m)) { try { sc.isMoving = false; } catch (e) {} } };
    try { sc.isMoving = true; ctx.say(K.text('d2.guard.seen')); sc.time.delayedCall(650, go); } catch (e) { go(); }
  }

  D.register('guard-lanterns', {
    logic: { seq: seq, litCells: litCells, model: model, seenBy: seenBy, litBy: litBy },
    load: function (ctx) { ready(ctx); },
    unload: function (ctx) {                                                   // the pools' own textures (three per guard, named for this floor) go with the floor; a return draws them again
      var S = ctx.state, sp = S && S.spr, tm = ctx.scene && ctx.scene.textures, id, j; if (!sp || sp.look !== 2) return;
      for (id in sp.g) { var e = sp.g[id];
        for (j = 0; e.pool && j < e.pool.length; j++) { var im = e.pool[j], k = im && im.texture && im.texture.key;
          try { im.destroy(); if (k && k.indexOf('d2b_pool_') === 0 && tm && tm.exists(k)) tm.remove(k); } catch (x) {} }
        e.pool = []; }
      S.spr = null;
    },
    tick: function (ctx, dt) {
      if (!ready(ctx)) return;
      var S = ctx.state, K = S.K;
      S.tick = K.clock(ctx, dt, S.M.period, S.ms);
      paint(ctx);
      if (S.grace > 0) { S.grace -= dt; return; }
      if (S.busy || !K.onField(ctx)) return;
      var s = K.soles(ctx); if (!s) return;
      var who = seenBy(ctx, S.M, S.tick, s.cx, s.cy);
      if (who.length) caught(ctx, who);
    },
    step: function (ctx) { if (!ready(ctx)) return undefined; return ctx.state.busy ? false : undefined; }
  });
})();
