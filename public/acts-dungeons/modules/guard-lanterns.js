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
  function build(ctx) {
    var S = ctx.state, K = S.K, sc = ctx.scene, key = K.monsterTex(sc, S.monster);
    if (!key) { S.waited = (S.waited || 0) + 1; if (S.monster && S.waited < 180) return; key = fallbackTex(sc, K); }
    S.spr = { light: ctx.own(sc.add.graphics().setDepth(ctx.depth.ground + 0.3)), g: {} };
    try { S.spr.light.setBlendMode(1); } catch (e) {}
    for (var i = 0; i < S.M.guards.length; i++) { var g = S.M.guards[i]; if (g.gone) continue;
      var body = ctx.own(sc.add.image(0, 0, key).setOrigin(0.5, 0.92)), sh = ctx.own(sc.add.ellipse(0, 0, 34, 12, 0x000000, 0.3).setDepth(ctx.depth.object));
      var sc0 = 62 / Math.max(1, body.height || 62); body.setScale(sc0);
      S.spr.g[g.id] = { body: body, shadow: sh, lamp: ctx.own(sc.add.image(0, 0, lanternTex(sc, K)).setOrigin(0.5, 0)), scale: sc0 }; }
  }
  function paint(ctx) {
    var S = ctx.state, M = S.M, K = S.K; if (!S.spr) { build(ctx); if (!S.spr) return; }
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
  function caught(ctx, list) {
    var S = ctx.state, K = S.K, sc = ctx.scene, i;
    S.busy = true; S.battles = (S.battles || 0) + 1;
    for (i = 0; i < list.length; i++) { list[i].gone = true; K.setFlag(ctx, 'gone.' + list[i].id, true); }
    S.drawn = -1;
    var m = S.monster || K.monsterFor(ctx, 'demon');
    var go = function () { S.busy = false; S.grace = 1500; if (!K.battle(ctx, m)) { try { sc.isMoving = false; } catch (e) {} } };
    try { sc.isMoving = true; ctx.say(K.text('d2.guard.seen')); sc.time.delayedCall(650, go); } catch (e) { go(); }
  }

  D.register('guard-lanterns', {
    logic: { seq: seq, litCells: litCells, model: model, seenBy: seenBy, litBy: litBy },
    load: function (ctx) { ready(ctx); },
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
