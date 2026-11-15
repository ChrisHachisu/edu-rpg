/* Twilight Realm: matching portals (mechanic id `matching-portals`).

   Portals come in coloured pairs. Step onto one and she stands on its twin; every pair works both
   ways. The pad she arrives on is asleep until she steps off it and on again. While she is near a
   portal its twin shines, so a twin in sight shows where the step leads.
   Nothing persistent: the game saves where she stands, and a portal she loads on is asleep until
   she steps off. The bundle's own shadow portals (cells of the generated floor) are switched off. */
(function () {
  'use strict';
  var D = window.__QOK_DNG2__; if (!D || !D.register) return;
  var T = 48, ON = 20, OFF = 36, NEAR = 3.2 * T;                            // px: on the pad, off the pad, "near"
  var COL = { cyan: 0x4fe3ff, gold: 0xffd24a, violet: 0xb06cff, pink: 0xff7ac8, green: 0x6cf08a, orange: 0xff9a3c };
  function kit() { return window.__QOK_D2KIT_B__; }

  function model(ctx) {
    var ps = ctx.mechanic.pairs || [], pads = [], i;
    for (i = 0; i < ps.length; i++) { var p = ps[i], c = COL[p.colour] || 0xffffff;
      var a = { pair: p.pair, colour: p.colour, tint: c, x: p.a[0], y: p.a[1], px: p.a[0] * T + T / 2, py: p.a[1] * T + T / 2 };
      var b = { pair: p.pair, colour: p.colour, tint: c, x: p.b[0], y: p.b[1], px: p.b[0] * T + T / 2, py: p.b[1] * T + T / 2 };
      a.twin = b; b.twin = a; pads.push(a, b); }
    return pads;
  }
  function padAt(pads, x, y, r) { for (var i = 0; i < pads.length; i++) { var dx = pads[i].px - x, dy = pads[i].py - y; if (dx * dx + dy * dy <= r * r) return pads[i]; } return null; }

  function ready(ctx) {
    var S = ctx.state; if (S.ok) return true;
    var K = kit(); if (!K) return false;
    S.K = K; S.pads = model(ctx); S.asleep = null; S.first = true; S.spr = null; S.t = 0; S.hops = 0; K.quiet(ctx.scene);
    S.ok = true; return true;
  }
  function build(ctx) {
    var S = ctx.state, K = S.K, sc = ctx.scene, kr = K.art(sc, 'portal-ring'), ks = K.art(sc, 'portal-swirl'); if (!kr || !ks) return;
    S.spr = [];
    for (var i = 0; i < S.pads.length; i++) { var p = S.pads[i], dg = ctx.depth.ground;
      S.spr.push({ halo: ctx.own(sc.add.circle(p.px, p.py + 2, 40, p.tint, 0).setDepth(dg + 0.15)),
        ring: ctx.own(sc.add.image(p.px, p.py + 4, kr).setDisplaySize(86, 72).setDepth(dg + 0.2)),
        swirl: ctx.own(sc.add.image(p.px, p.py + 2, ks).setDisplaySize(86, 72).setDepth(dg + 0.3).setTint(p.tint)) });
      try { S.spr[i].halo.setBlendMode(1); S.spr[i].swirl.setBlendMode(1); } catch (e) {} }
  }
  function paint(ctx, s) {
    var S = ctx.state; if (!S.spr) { build(ctx); if (!S.spr) return; }
    var t = S.t / 1000, i;
    for (i = 0; i < S.pads.length; i++) { var p = S.pads[i], e = S.spr[i], shine = !!p.shine, sleep = S.asleep === p;
      var a = sleep ? 0.30 : shine ? 0.95 + 0.05 * Math.sin(t * 10) : 0.62 + 0.10 * Math.sin(t * 2.4 + i);
      e.swirl.setAlpha(a); e.swirl.setScale((86 / Math.max(1, e.swirl.width)) * (shine ? 1.10 + 0.06 * Math.sin(t * 8) : 1), (72 / Math.max(1, e.swirl.height)) * (shine ? 1.10 + 0.06 * Math.sin(t * 8) : 1));
      e.halo.setFillStyle(p.tint, shine ? 0.30 + 0.10 * Math.sin(t * 8) : 0.0); e.halo.setScale(shine ? 1.25 : 1); }
  }
  function hop(ctx, from) {
    var S = ctx.state, K = S.K, to = from.twin, sc = ctx.scene;
    K.placeSoles(ctx, to.px, to.py); S.asleep = to; S.hops++; S.last = [from.pair, from.colour];
    try { sc.cameras.main.flash(220, (to.tint >> 16) & 255, (to.tint >> 8) & 255, to.tint & 255); } catch (e) {}
    try { var q = window.__QOK; if (q && q.audio && q.audio.playSfx) q.audio.playSfx('crystal_obtain'); } catch (e) {}
    try { if (sc.fogEnabled && sc.updateFogVisibility) sc.updateFogVisibility(); } catch (e) {}
  }

  D.register('matching-portals', {
    logic: { model: model, padAt: padAt, COL: COL },
    load: function (ctx) { ready(ctx); },
    tick: function (ctx, dt) {
      if (!ready(ctx)) return;
      var S = ctx.state, K = S.K; K.quiet(ctx.scene); S.t += dt;
      var s = K.soles(ctx), i;
      if (s) {
        if (S.first) { S.first = false; S.asleep = padAt(S.pads, s.x, s.y, OFF); }      // loaded (or landed) on a pad: it sleeps until she steps off
        if (S.asleep && !padAt([S.asleep], s.x, s.y, OFF)) S.asleep = null;
        for (i = 0; i < S.pads.length; i++) S.pads[i].shine = false;
        for (i = 0; i < S.pads.length; i++) { var p = S.pads[i], dx = p.px - s.x, dy = p.py - s.y; if (dx * dx + dy * dy <= NEAR * NEAR) p.twin.shine = true; }
        if (K.onField(ctx)) { var on = padAt(S.pads, s.x, s.y, ON); if (on && on !== S.asleep) hop(ctx, on); }
      }
      paint(ctx, s);
    },
    step: function (ctx) {                                                    // no ambush on the pad she has just arrived on
      if (!ready(ctx)) return undefined;
      return ctx.state.asleep ? false : undefined;
    }
  });
})();
