/* Stormreach Spire: the storm terrace (mechanic id `storm-terrace`).

   Every terrace cell (`z`) belongs to a strike group (the digit grid `strikeGroups`). Group g is
   struck at tick g * ticksBetweenGroups of every period and stays deadly for `strikeTicks`; the
   stone of a group glows for `glowTicks` before its strike. Roofed ledges (plain floor) are never
   struck. Struck: small damage, and she is knocked back one tile along the way she came.
   Nothing persistent except the clock phase. The bundle's own wind gusts are switched off (the
   plan says no wind). */
(function () {
  'use strict';
  var D = window.__QOK_DNG2__; if (!D || !D.register) return;
  var T = 48;
  function kit() { return window.__QOK_D2KIT_B__; }
  // Kid timing (owner P9; day-2 kid-timing pass, 2026-11-24; day-3 grades 3-4, 2026-11-26). Shared by storm-terrace.js and
  // gust-walkways.js (whichever loads first defines it; both copies are identical). The warning before a strike / gust
  // lasts about twice the age group's reaction time and the cycle grows with it (the calm stretches grow so a child who
  // stops late is rarely caught). Quiz grades K, 1, 2: 1.5 s. Grades 3 and 4: 1.25 s warning (2.5x a 0.5 s reaction; 1.0 s measured worse), 1.6 s calm. Grades 5 and 6: the plan's glow plus a 0.6 s calm stretch (Stormreach only).
  // localStorage 'qok-kid-timing' = '0' restores the plan's timing for every grade.
  var KT = window.__QOK_KIDTIME__ || (window.__QOK_KIDTIME__ = {
    warnMs: 1500,      // the warning: about twice a grade-1 reaction (0.7 s)
    calmMs: 1000,      // Stormreach: after a group's strike the whole terrace is calm this long before the next glow
    gustShare: 6,      // Storm Nest: a lane blows for at most 1/6 of its cycle (a 200 ms late stop rarely meets a gust)
    mid: { warnMs: 1250, calmMs: 1600, gustShare: 5, gustWarnMs: 1000 },   // grades 3 and 4: 2.5x a 0.5 s reaction (Storm Nest: 2x, measured better)
    high: { warnMs: 700, calmMs: 600, gustShare: 0 },    // grades 5 and 6: the plan's glow (at least twice a 0.35 s reaction) plus a short calm stretch; gust lanes keep the plan
    tier: function () {
      try { if (window.localStorage && window.localStorage.getItem('qok-kid-timing') === '0') return null; } catch (e) {}
      var q; try { q = String(window.__GAME_STATE__.player.state.quizDifficulty).toLowerCase(); } catch (e) { return null; }
      if (q === 'k' || q === '0' || q === '1' || q === '2') return 'young';
      if (q === '3' || q === '4') return 'mid';
      if (q === '5' || q === '6') return 'high';
      return null;
    },
    young: function () { return this.tier() !== null; },
    cfg: function () { var t = this.tier(); return t === 'mid' ? this.mid : (t === 'high' ? this.high : this); },
    warnTicks: function (planTicks, ms, kind) { var c = this.cfg(); return Math.max(planTicks, Math.round(((kind === 'gust' && c.gustWarnMs) || c.warnMs) / ms)); },
    calmTicks: function (ms) { return Math.round(this.cfg().calmMs / ms); },
    share: function () { return this.cfg().gustShare; }
  });

  // ---- pure logic ---------------------------------------------------------------------------------
  function model(ctx) {
    var P = ctx.mechanic.params || {}, rows = ctx.mechanic.strikeGroups || [], G = P.groups || 1, gap = P.ticksBetweenGroups || 8, cells = [], x, y;
    for (var g = 0; g < G; g++) cells.push([]);
    for (y = 0; y < rows.length; y++) for (x = 0; x < rows[y].length; x++) { var ch = rows[y].charCodeAt(x) - 48; if (ch >= 0 && ch < G) cells[ch].push([x, y]); }
    return { G: G, gap: gap, period: P.periodTicks || G * gap, strike: P.strikeTicks || 2, glow: P.glowTicks || 5, rows: rows, cells: cells };
  }
  // grades K-2: a longer glow, the same strike, the same order; each group's slot grows so that after a
  // strike the terrace stays calm for calmMs before the next group starts to glow (the plan's slots have
  // no such gap: the next glow starts as a strike lands). M.plan keeps the plan's numbers.
  function kidScale(M, ms) {
    M.plan = { glow: M.glow, gap: M.gap, period: M.period }; M.kid = false;
    if (!KT.young()) return M;
    var glow = KT.warnTicks(M.glow, ms), gap = Math.max(M.gap + glow - M.glow, glow + M.strike + KT.calmTicks(ms));
    if (glow === M.glow && gap === M.gap) return M;
    M.period = M.period / M.gap * gap; M.glow = glow; M.gap = gap; M.kid = true; return M;
  }
  function groupAt(M, cx, cy) { var r = M.rows[cy]; if (!r) return -1; var ch = r.charCodeAt(cx) - 48; return (ch >= 0 && ch < M.G) ? ch : -1; }
  function mod(a, n) { return ((a % n) + n) % n; }
  function striking(M, g, tick) { return g >= 0 && mod(Math.floor(tick) - g * M.gap, M.period) < M.strike; }
  function glowing(M, g, tick) { return g >= 0 && !striking(M, g, tick) && mod(g * M.gap - Math.floor(tick), M.period) <= M.glow; }
  function glowAmount(M, g, tick) { var left = mod(g * M.gap - tick, M.period); return left <= M.glow ? 1 - left / M.glow : 0; }   // 0 -> 1 as the strike nears

  function ready(ctx) {
    var S = ctx.state; if (S.ok) return true;
    var K = kit(); if (!K) return false;
    S.K = K; S.ms = K.tickMs(ctx.mechanic.params); S.M = kidScale(model(ctx), S.ms); S.grace = Math.max(4, Math.round(2500 / S.ms)); S.spr = null; S.was = {};   // no bolt can hurt her in the first 2.5 s on a floor (arrival, or Continue out on a terrace)
    S.tick = K.clock(ctx, 0, S.M.period, S.ms); K.quiet(ctx.scene);
    S.ok = true; return true;
  }
  var TINT = [0xffe27a, 0x8fd0ff, 0xffb09a, 0xb4f0b0];
  function boltTex(sc, K) {
    return K.canvasTex(sc, 'd2b_bolt', 40, 150, function (g) {
      var pts = [[22, 0], [12, 34], [24, 40], [10, 78], [22, 84], [14, 118], [20, 150]];
      function line(w, col) { g.strokeStyle = col; g.lineWidth = w; g.lineJoin = 'miter'; g.beginPath(); g.moveTo(pts[0][0], pts[0][1]); for (var i = 1; i < pts.length; i++) g.lineTo(pts[i][0], pts[i][1]); g.stroke(); }
      line(11, 'rgba(120,170,255,0.35)'); line(6, '#b8d6ff'); line(2.5, '#ffffff');
    });
  }
  function build(ctx) {
    var S = ctx.state, K = S.K, sc = ctx.scene, M = S.M, g, i;
    S.spr = { glow: [], hit: [], bolts: [] };
    for (g = 0; g < M.G; g++) {
      var a = ctx.own(sc.add.graphics().setDepth(ctx.depth.ground + 0.2).setAlpha(0)), b = ctx.own(sc.add.graphics().setDepth(ctx.depth.ground + 0.3).setAlpha(0));
      a.fillStyle(TINT[g % TINT.length], 1); b.fillStyle(0xffffff, 1);
      for (i = 0; i < M.cells[g].length; i++) { var c = M.cells[g][i];
        a.fillRect(c[0] * T + 3, c[1] * T + 3, T - 6, T - 6); b.fillRect(c[0] * T + 1, c[1] * T + 1, T - 2, T - 2); }
      try { a.setBlendMode(1); b.setBlendMode(1); } catch (e) {}
      S.spr.glow.push(a); S.spr.hit.push(b);
    }
    var bt = boltTex(sc, K);
    for (i = 0; i < 7; i++) S.spr.bolts.push(ctx.own(sc.add.image(0, 0, bt).setOrigin(0.5, 1).setDepth(11).setVisible(false)));
  }
  function paint(ctx) {
    var S = ctx.state, M = S.M; if (!S.spr) build(ctx);
    var t = S.tick, g, i;
    for (g = 0; g < M.G; g++) {
      var st = striking(M, g, t), u = mod(t - g * M.gap, M.period);
      var ga = st ? 0 : glowAmount(M, g, t); if (M.kid && ga > 0) ga = 0.2 + 0.8 * ga;   // the longer glow is visible from its first moment
      var pulse = ga > 0 ? ga * (0.30 + 0.10 * Math.sin(t * (3 + 5 * ga))) + 0.05 : 0;
      S.spr.glow[g].setAlpha(Math.max(0, Math.min(0.5, pulse)));
      S.spr.hit[g].setAlpha(st ? Math.max(0.15, 0.75 - 0.6 * (u / M.strike)) : 0);
      if (st && !S.was[g]) {                                                 // a new strike: bolts on the stones of this group nearest her
        var h = ctx.hero(), hx = h ? h.x : 0, hy = h ? h.footY : 0, near = M.cells[g].map(function (c) { return [Math.abs(c[0] * T + 24 - hx) + Math.abs(c[1] * T + 24 - hy), c]; })
          .filter(function (q) { return q[0] < 9 * T; }).sort(function (p, q) { return p[0] - q[0]; });
        for (i = 0; i < S.spr.bolts.length; i++) { var bo = S.spr.bolts[i], pick = near[Math.min(near.length - 1, i * 3)];
          if (!pick || i * 3 >= near.length) { bo.setVisible(false); continue; }
          bo.setPosition(pick[1][0] * T + 24, pick[1][1] * T + 30).setVisible(true).setAlpha(1).setFlipX(!!(i & 1)); bo.__until = t + M.strike; }
        S.strikes = (S.strikes || 0) + 1;
      }
      S.was[g] = st;
    }
    for (i = 0; i < S.spr.bolts.length; i++) { var b2 = S.spr.bolts[i]; if (b2.visible) { var left = mod(b2.__until - t, M.period); if (left > M.strike || left <= 0.05) b2.setVisible(false); else b2.setAlpha(Math.min(1, left / M.strike + 0.2)); } }
  }
  function knock(ctx) {                                                       // one tile back along her own path, never onto stone that is being struck
    var S = ctx.state, K = S.K, s = K.soles(ctx); if (!s) return false;
    var p = K.trailBack(ctx, T);
    if (!p) { var v = K.DIRV[s.dir] || [0, 1], bx = s.x - v[0] * T, by = s.y - v[1] * T, ch = ctx.terrain(Math.floor(bx / T), Math.floor(by / T));
      if ((ch === 'z' || ch === '.') && (!ctx.maskFree || ctx.maskFree(bx, by))) p = [bx, by]; }
    if (!p) return false;
    K.placeSoles(ctx, p[0], p[1]); S.trail = [[p[0], p[1]]];
    return true;
  }

  D.register('storm-terrace', {
    logic: { model: model, kidScale: kidScale, groupAt: groupAt, striking: striking, glowing: glowing },
    load: function (ctx) { ready(ctx); },
    tick: function (ctx, dt) {
      if (!ready(ctx)) return;
      var S = ctx.state, K = S.K, M = S.M, t0 = S.tick;
      K.quiet(ctx.scene);
      S.tick = K.clock(ctx, dt, M.period, S.ms);
      if (S.grace > 0) S.grace -= mod(S.tick - t0, M.period);
      paint(ctx);
      K.trail(ctx);
      if (S.grace > 0 || !K.onField(ctx)) return;
      var s = K.soles(ctx); if (!s) return;
      if (striking(M, groupAt(M, s.cx, s.cy), S.tick)) {
        S.grace = M.strike + 1.5; S.struck = (S.struck || 0) + 1;
        knock(ctx);
        try { ctx.scene.cameras.main.shake(140, 0.008); } catch (e) {}
        K.hazard(ctx, 'd2.storm.struck', 0.1, [200, 225, 255]);
      }
    }
  });
})();
