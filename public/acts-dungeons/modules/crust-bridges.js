/* Magma Tunnels: crust bridges (mechanic id `crust-bridges`).

   Each crossing of a lava river is a strip of `c` cells that crusts over and melts on a beat:
   with u = (tick - phase) mod period, it is CRUST while u < crust (walkable), the last `warn`
   ticks of that window are WARN (still walkable, the cracks glow), and MOLTEN otherwise. Crossings
   of the same floor share a period and sit in two phase groups half a period apart.
   Caught on it when it melts: small damage, and she is put back on the bank she came from.
   Nothing here is persistent except the clock phase (kit-b.js). */
(function () {
  'use strict';
  var D = window.__QOK_DNG2__; if (!D || !D.register) return;
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
  var T = 48, LAT = 10, EXT = 30;                                           // px: side inset of the walkable strip, reach into each bank
  function kit() { return window.__QOK_D2KIT_B__; }
  var WALK = '.=gtzqh';

  // ---- pure logic (also used by the unit test) -------------------------------------------------
  function phaseOf(b, tick) {
    var u = ((Math.floor(tick) - b.phase) % b.period + b.period) % b.period;
    return u >= b.crust ? 'molten' : (u >= b.crust - b.warn ? 'warn' : 'crust');
  }
  function warnAmount(b, tick) {                                             // 0..1 through the warning
    var u = ((tick - b.phase) % b.period + b.period) % b.period;
    return Math.max(0, Math.min(1, (u - (b.crust - b.warn)) / b.warn));
  }
  // kid timing: a longer cracks-glow warning (the crust lasts as much longer, the molten stretch stays the plan's), so a
  // child who sees the cracks has twice her reaction time left and a full crossing fits inside the crust. Same bridges, same
  // order. Works on copies (the plan's mechanic object is never changed); the plan's numbers stay in b.plan.
  function kidBridges(M, ms) {
    var bs = M.bridges || [], out = [], i, b, w, d, k, p;
    for (i = 0; i < bs.length; i++) { b = bs[i]; k = {}; for (p in b) k[p] = b[p]; k.plan = { period: b.period, crust: b.crust, warn: b.warn, phase: b.phase };
      w = KT.warnTicks(b.warn, ms); d = w - b.warn;
      if (d > 0) { k.phase = Math.round(b.phase * (b.period + d) / b.period); k.crust = b.crust + d; k.period = b.period + d; k.warn = w; k.kid = true; }
      out.push(k); }
    return out;
  }
  function layout(ctx, list) {
    var out = [], bs = (list || ctx.mechanic.bridges || []), i;
    for (i = 0; i < bs.length; i++) {
      var b = bs[i], r = b.rect, my = (r[1] + r[3]) >> 1, mx = (r[0] + r[2]) >> 1;
      var horiz = WALK.indexOf(ctx.terrain(r[0] - 1, my)) >= 0 || WALK.indexOf(ctx.terrain(r[2] + 1, my)) >= 0;
      var px = [r[0] * T, r[1] * T, (r[2] + 1) * T, (r[3] + 1) * T];       // the c cells
      var zone = horiz ? [px[0] - EXT, px[1] + LAT, px[2] + EXT, px[3] - LAT] : [px[0] + LAT, px[1] - EXT, px[2] - LAT, px[3] + EXT];
      var ends = horiz ? [[px[0] - T * 1.5, (px[1] + px[3]) / 2], [px[2] + T * 1.5, (px[1] + px[3]) / 2]]
                       : [[(px[0] + px[2]) / 2, px[1] - T * 1.5], [(px[0] + px[2]) / 2, px[3] + T * 1.5]];
      out.push({ b: b, horiz: horiz, px: px, zone: zone, ends: ends, mx: mx, my: my });
    }
    return out;
  }
  function inR(r, x, y) { return x >= r[0] && x < r[2] && y >= r[1] && y < r[3]; }

  function ready(ctx) {
    var S = ctx.state; if (S.ok) return true;
    var K = kit(); if (!K) return false;
    S.K = K; S.ms = K.tickMs(ctx.mechanic.params); S.kid = KT.young(); S.L = layout(ctx, S.kid ? kidBridges(ctx.mechanic, S.ms) : null); S.period = 1; S.tick = 0; S.bank = null; S.spr = null;
    for (var i = 0; i < S.L.length; i++) S.period = Math.max(S.period, S.L[i].b.period);
    S.tick = K.clock(ctx, 0, S.period, S.ms);
    S.ok = true; return true;
  }
  function build(ctx) {                                                      // one crust tile and one glow tile per cell
    var S = ctx.state, K = S.K, sc = ctx.scene, kc = K.art(sc, 'crust'), km = K.art(sc, 'molten');
    if (!kc || !km) return;
    S.spr = [];
    for (var i = 0; i < S.L.length; i++) {
      var cells = S.L[i].b.cells, list = [];
      for (var j = 0; j < cells.length; j++) {
        var x = cells[j][0], y = cells[j][1], h = (x * 7 + y * 13) & 7;
        var a = ctx.own(sc.add.image(x * T + T / 2, y * T + T / 2, kc).setDisplaySize(T + 1, T + 1).setDepth(ctx.depth.ground + 0.2));
        var g = ctx.own(sc.add.image(x * T + T / 2, y * T + T / 2, km).setDisplaySize(T + 1, T + 1).setDepth(ctx.depth.ground + 0.3).setAlpha(0));
        a.setFlip(!!(h & 1), !!(h & 2)); g.setFlip(!!(h & 1), !!(h & 2)); if (h & 4) { a.setAngle(90); g.setAngle(90); }
        list.push([a, g]);
      }
      S.spr.push({ list: list, a: -1, g: -1 });
    }
  }
  function paint(ctx) {
    var S = ctx.state; if (!S.spr) { build(ctx); if (!S.spr) return; }
    for (var i = 0; i < S.L.length; i++) {
      var b = S.L[i].b, ph = phaseOf(b, S.tick), e = S.spr[i], a, g = 0, j;
      if (ph === 'molten') a = Math.max(0, (e.a < 0 ? 0 : e.a) - 0.12);       // sinks away in a few frames
      else { a = Math.min(1, (e.a < 0 ? 1 : e.a) + 0.10);
        if (ph === 'warn') { var w = warnAmount(b, S.tick); g = 0.18 + 0.5 * w + 0.16 * Math.sin(S.tick * (2.2 + 3 * w)); } }
      if (Math.abs(a - e.a) > 0.004 || Math.abs(g - e.g) > 0.01) {
        e.a = a; e.g = g;
        for (j = 0; j < e.list.length; j++) { e.list[j][0].setAlpha(a); e.list[j][1].setAlpha(Math.max(0, Math.min(0.85, g)) * a); }
      }
    }
  }
  function onBridge(S, x, y, pad) {                                          // which crossing's own cells hold this sole point
    for (var i = 0; i < S.L.length; i++) { var p = S.L[i].px;
      if (x >= p[0] + pad && x < p[2] - pad && y >= p[1] + pad && y < p[3] - pad) return S.L[i]; }
    return null;
  }
  function inAnyZone(S, x, y) { for (var i = 0; i < S.L.length; i++) if (inR(S.L[i].zone, x, y) || inR(S.L[i].px, x, y)) return true; return false; }

  D.register('crust-bridges', {
    logic: { phaseOf: phaseOf, warnAmount: warnAmount, layout: layout },
    load: function (ctx) { ready(ctx); },
    tick: function (ctx, dt) {
      if (!ready(ctx)) return;
      var S = ctx.state, K = S.K;
      S.tick = K.clock(ctx, dt, S.period, S.ms);
      paint(ctx);
      var s = K.soles(ctx); if (!s) return;
      if (!inAnyZone(S, s.x, s.y)) S.bank = [s.x, s.y];                      // the last ground that is ground whatever the beat
      var L = onBridge(S, s.x, s.y, 3);
      if (L && phaseOf(L.b, S.tick) === 'molten' && K.onField(ctx)) {
        var back = S.bank, e = L.ends;
        if (!back) back = (Math.abs(e[0][0] - s.x) + Math.abs(e[0][1] - s.y) <= Math.abs(e[1][0] - s.x) + Math.abs(e[1][1] - s.y)) ? e[0] : e[1];
        K.placeSoles(ctx, back[0], back[1]);
        K.hazard(ctx, 'd2.crust.caught', 0.1, [255, 90, 30]);
        S.caught = (S.caught || 0) + 1;
      }
    },
    free: function (ctx, wx, wy, tx, ty) {
      if (!ready(ctx)) return undefined;
      var S = ctx.state, i;
      for (i = 0; i < S.L.length; i++) {
        var L = S.L[i];
        if (inR(L.zone, wx, wy)) { if (phaseOf(L.b, S.tick) !== 'molten') return true; if (inR(L.px, wx, wy)) return false; }
        else if (inR(L.px, wx, wy)) return false;                            // the strip's own rim
      }
      return undefined;
    },
    step: function (ctx) {                                                   // no ambush in the middle of a crossing
      if (!ready(ctx)) return undefined;
      var s = ctx.state.K.soles(ctx);
      return (s && onBridge(ctx.state, s.x, s.y, 0)) ? false : undefined;
    }
  });
})();
