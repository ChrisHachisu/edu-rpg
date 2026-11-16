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
  function layout(ctx) {
    var out = [], bs = (ctx.mechanic.bridges || []), i;
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
    S.K = K; S.ms = K.tickMs(ctx.mechanic.params); S.L = layout(ctx); S.period = 1; S.tick = 0; S.bank = null; S.spr = null;
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
