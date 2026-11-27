/* Void Rift: drifting blocks (mechanic id `drifting-blocks`).

   A rift is crossed on square stone blocks, three tiles a side, each drifting up and down its own
   lane: `amplitude` tiles either side of the corridor line, one tile every `ticksPerTile`, a rest
   of `restTicks` at each lane end, `phaseTicks` into its period at tick 0. Two edges that overlap
   by two tiles or more are joined: block and ledge (offset -1..1), block and neighbouring block
   (offsets within 1), and a block resting at the lane end that touches a treasure islet. There
   is no jump and no fall: off a block she can only step across a joined edge. She rides the
   block she stands on.

   The joins are decided on the plan's own integer offsets (dungeons/voidRift.py `offs`), which is
   what its no-soft-lock proof used; the picture glides between them (half a step behind, so the
   drawn overlap is never under a tile and a half while a join is open).
   Persistent: only the clock phase, so Continue finds every block where it was. */
(function () {
  'use strict';
  var D = window.__QOK_DNG2__; if (!D || !D.register) return;
  var T = 48, B = 3 * T, M = 9, EXT = 30;                                   // px: tile, block side, rim she keeps clear of, reach into a ledge
  function kit() { return window.__QOK_D2KIT_B__; }

  // ---- pure logic ---------------------------------------------------------------------------------
  function mod(a, n) { return ((a % n) + n) % n; }
  function per(l) { return 2 * (2 * l.amplitude * l.ticksPerTile + l.restTicks); }
  function offs(l, t) {                                                      // integer tile offset at integer tick t
    var A = l.amplitude, s = l.ticksPerTile, dw = l.restTicks, move = 2 * A * s, u = mod(Math.floor(t) + l.phaseTicks, per(l));
    if (u < dw) return -A; u -= dw; if (u < move) return -A + Math.floor(u / s); u -= move; if (u < dw) return A; u -= dw; return A - Math.floor(u / s);
  }
  function glide(l, t) {                                                     // where the block is drawn (tiles, fractional): the same path, half a step late
    var A = l.amplitude, s = l.ticksPerTile, dw = l.restTicks, move = 2 * A * s, u = mod(t - s / 2 + l.phaseTicks, per(l));
    if (u < dw) return -A; u -= dw; if (u < move) return -A + u / s; u -= move; if (u < dw) return A; u -= dw; return A - u / s;
  }
  function model(ctx) {
    var gs = ctx.mechanic.gates || [], out = [], i, j;
    for (i = 0; i < gs.length; i++) { var g = gs[i], G = { id: g.id, lanes: [], islet: g.islet || null, cy: g.lanes[0].yCentre };
      for (j = 0; j < g.lanes.length; j++) { var l = g.lanes[j]; G.lanes.push({ l: l, x0: l.x * T, x1: l.x * T + B, o: 0, v: 0, y0: 0, y1: 0, top: (l.yCentre - 1 - l.amplitude) * T, bot: (l.yCentre + 2 + l.amplitude) * T }); }
      G.ledge = [(G.cy - 1) * T, (G.cy + 2) * T];                             // the corridor rows on either bank
      out.push(G); }
    return out;
  }
  function place(G, tick) {                                                  // offsets and drawn rects at this tick
    for (var j = 0; j < G.lanes.length; j++) { var L = G.lanes[j]; L.o = offs(L.l, tick); L.v = glide(L.l, tick); L.y0 = (L.l.yCentre - 1 + L.v) * T; L.y1 = L.y0 + B; }
  }
  // joins(G): the open links now, each with the px rect her soles may use to step across
  function joins(G) {
    var out = [], n = G.lanes.length, j, a, b, y0, y1;
    a = G.lanes[0];
    if (Math.abs(a.o) <= 1) { y0 = Math.max(a.y0, G.ledge[0]) + M; y1 = Math.min(a.y1, G.ledge[1]) - M; if (y1 > y0) out.push({ kind: 'ledgeL', lane: 0, rect: [a.x0 - EXT, y0, a.x0 + M + 2, y1], edge: [a.x0, y0 - M, a.x0, y1 + M] }); }
    for (j = 0; j + 1 < n; j++) { a = G.lanes[j]; b = G.lanes[j + 1];
      if (Math.abs(a.o - b.o) <= 1) { y0 = Math.max(a.y0, b.y0) + M; y1 = Math.min(a.y1, b.y1) - M; if (y1 > y0) out.push({ kind: 'block', lane: j, rect: [a.x1 - M - 2, y0, a.x1 + M + 2, y1], edge: [a.x1, y0 - M, a.x1, y1 + M] }); } }
    a = G.lanes[n - 1];
    if (Math.abs(a.o) <= 1) { y0 = Math.max(a.y0, G.ledge[0]) + M; y1 = Math.min(a.y1, G.ledge[1]) - M; if (y1 > y0) out.push({ kind: 'ledgeR', lane: n - 1, rect: [a.x1 - M - 2, y0, a.x1 + EXT, y1], edge: [a.x1, y0 - M, a.x1, y1 + M] }); }
    if (G.islet) { a = G.lanes[G.islet.lane];
      if (a.o === G.islet.at && Math.abs(a.v - a.o) < 0.02) {
        if (G.islet.side === 'top') out.push({ kind: 'islet', lane: G.islet.lane, rect: [a.x0 + M, a.y0 - EXT, a.x1 - M, a.y0 + M + 2], edge: [a.x0, a.y0, a.x1, a.y0] });
        else out.push({ kind: 'islet', lane: G.islet.lane, rect: [a.x0 + M, a.y1 - M - 2, a.x1 - M, a.y1 + EXT], edge: [a.x0, a.y1, a.x1, a.y1] }); } }
    return out;
  }
  function inR(r, x, y) { return x >= r[0] && x < r[2] && y >= r[1] && y < r[3]; }
  function blockUnder(gates, x, y) {                                         // the block whose top she stands on (whole face, rim included)
    for (var i = 0; i < gates.length; i++) for (var j = 0; j < gates[i].lanes.length; j++) { var L = gates[i].lanes[j]; if (x >= L.x0 && x < L.x1 && y >= L.y0 && y < L.y1) return L; }
    return null;
  }
  // free(): true on a block's face or across an open join; false anywhere else in a lane; undefined elsewhere
  function freeAt(S, x, y) {
    for (var i = 0; i < S.gates.length; i++) { var G = S.gates[i], j, inLane = false;
      for (j = 0; j < G.lanes.length; j++) { var L = G.lanes[j];
        if (x >= L.x0 + M && x < L.x1 - M && y >= L.y0 + M && y < L.y1 - M) return true;
        if (x >= L.x0 && x < L.x1 && y >= L.top && y < L.bot) inLane = true; }
      var js = G.joins || [];
      for (j = 0; j < js.length; j++) if (inR(js[j].rect, x, y)) return true;
      if (inLane) return false; }
    return undefined;
  }

  function ready(ctx) {
    var S = ctx.state; if (S.ok) return true;
    var K = kit(); if (!K) return false;
    S.K = K; S.gates = model(ctx); S.ms = K.tickMs(ctx.mechanic.params); S.spr = null;
    S.period = (ctx.mechanic.params && ctx.mechanic.params.systemPeriodTicks) || 48;
    S.tick = K.clock(ctx, 0, S.period, S.ms);
    for (var i = 0; i < S.gates.length; i++) { place(S.gates[i], S.tick); S.gates[i].joins = joins(S.gates[i]); }
    S.ok = true; return true;
  }
  // Day 4 (DC-14): an open join was a hard pale bar 6 px wide in the gap, which read as a rendering fault. It is
  // the cue that she may step across here, so it stays, drawn as a soft violet light along the join (a blurred
  // strip three times as wide, a little brighter for the first moment after a block docks).
  // localStorage 'qok-d4-looks' = '0': the old bar.
  var LOOKS = (function () { try { return window.localStorage.getItem('qok-d4-looks') !== '0'; } catch (e) { return true; } })();
  function joinTex(sc, K) {                                                  // a strip of light: bright along its middle line, fading to both sides and at both ends
    return K.canvasTex(sc, 'd2b_joinglow', 32, 64, function (g, w, h) {
      var a = g.createLinearGradient(0, 0, w, 0); a.addColorStop(0, 'rgba(190,170,255,0)'); a.addColorStop(0.36, 'rgba(190,170,255,0.30)'); a.addColorStop(0.5, 'rgba(232,222,255,0.95)'); a.addColorStop(0.64, 'rgba(190,170,255,0.30)'); a.addColorStop(1, 'rgba(190,170,255,0)');
      g.fillStyle = a; g.fillRect(0, 0, w, h);
      var b = g.createLinearGradient(0, 0, 0, h); b.addColorStop(0, 'rgba(0,0,0,1)'); b.addColorStop(0.14, 'rgba(0,0,0,0)'); b.addColorStop(0.86, 'rgba(0,0,0,0)'); b.addColorStop(1, 'rgba(0,0,0,1)');
      g.globalCompositeOperation = 'destination-out'; g.fillStyle = b; g.fillRect(0, 0, w, h); g.globalCompositeOperation = 'source-over';
    });
  }
  function build(ctx) {
    var S = ctx.state, K = S.K, sc = ctx.scene, kb = K.art(sc, 'void-block'); if (!kb) return;
    var dg = ctx.depth.ground, rails = ctx.own(sc.add.graphics().setDepth(dg + 0.1)), i, j;
    S.spr = { blocks: [], glow: [] };
    for (i = 0; i < S.gates.length; i++) { var G = S.gates[i], row = [];
      for (j = 0; j < G.lanes.length; j++) { var L = G.lanes[j];
        rails.fillStyle(0x9a86ff, 0.10); rails.fillRect(L.x0 + 4, L.top, 3, L.bot - L.top); rails.fillRect(L.x1 - 7, L.top, 3, L.bot - L.top);
        rails.fillStyle(0x9a86ff, 0.05); rails.fillRect(L.x0 + 7, L.top, B - 14, L.bot - L.top);
        row.push(ctx.own(sc.add.image(L.x0, L.y0, kb).setOrigin(0, 0).setDepth(dg + 0.4))); }
      S.spr.blocks.push(row); }
    var jt = LOOKS ? joinTex(sc, K) : null; S.spr.soft = !!jt;
    for (i = 0; i < 8; i++) { var g = ctx.own(jt ? sc.add.image(0, 0, jt).setDepth(dg + 0.5).setVisible(false) : sc.add.rectangle(0, 0, 8, 8, 0xd8ccff, 0.9).setDepth(dg + 0.5).setVisible(false)); try { g.setBlendMode(1); } catch (e) {} S.spr.glow.push(g); }
  }
  function paint(ctx) {
    var S = ctx.state; if (!S.spr) { build(ctx); if (!S.spr) return; }
    var i, j, n = 0, pulse = 0.55 + 0.35 * Math.sin(S.tick * 2.6), open = S.open || (S.open = {}), live = {}, k;
    for (i = 0; i < S.gates.length; i++) { var G = S.gates[i];
      for (j = 0; j < G.lanes.length; j++) S.spr.blocks[i][j].setPosition(G.lanes[j].x0, G.lanes[j].y0);
      for (j = 0; j < G.joins.length && n < S.spr.glow.length; j++, n++) { var e = G.joins[j].edge, g = S.spr.glow[n], v = e[0] === e[2];
        if (S.spr.soft) { var id = i + '.' + G.joins[j].kind + '.' + G.joins[j].lane, len = v ? e[3] - e[1] : e[2] - e[0];
          if (open[id] === undefined) open[id] = S.tick;                     // this join has just opened
          live[id] = 1; var fresh = Math.max(0, 1 - mod(S.tick - open[id], S.period) / 2.5);
          g.setPosition((e[0] + e[2]) / 2, (e[1] + e[3]) / 2).setDisplaySize(18 + 6 * fresh, len + 10).setRotation(v ? 0 : Math.PI / 2).setVisible(true).setAlpha(Math.min(1, 0.50 + 0.22 * Math.sin(S.tick * 2.6) + 0.3 * fresh));
          continue; }
        g.setPosition((e[0] + e[2]) / 2, (e[1] + e[3]) / 2).setDisplaySize(v ? 6 : e[2] - e[0], v ? e[3] - e[1] : 6).setVisible(true).setAlpha(pulse); } }
    for (; n < S.spr.glow.length; n++) S.spr.glow[n].setVisible(false);
    for (k in open) if (!live[k]) delete open[k];
  }

  D.register('drifting-blocks', {
    logic: { offs: offs, glide: glide, per: per, model: model, place: place, joins: joins, freeAt: freeAt, blockUnder: blockUnder },
    load: function (ctx) { ready(ctx); },
    tick: function (ctx, dt) {
      if (!ready(ctx)) return;
      var S = ctx.state, K = S.K, s = K.soles(ctx), on = s ? blockUnder(S.gates, s.x, s.y) : null, y0 = on ? on.y0 : 0, i;
      S.tick = K.clock(ctx, dt, S.period, S.ms);
      for (i = 0; i < S.gates.length; i++) { place(S.gates[i], S.tick); S.gates[i].joins = joins(S.gates[i]); }
      if (on && on.y0 !== y0) { var h = ctx.hero(); if (h) { ctx.place(h.x, h.y + (on.y0 - y0)); try { ctx.scene.updateCamera(); } catch (e) {} } }   // she rides it
      S.on = on;
      paint(ctx);
    },
    free: function (ctx, wx, wy) { if (!ready(ctx)) return undefined; return freeAt(ctx.state, wx, wy); },
    step: function (ctx) {                                                    // no ambush on a block over the void
      if (!ready(ctx)) return undefined;
      var s = ctx.state.K.soles(ctx);
      return (s && blockUnder(ctx.state.gates, s.x, s.y)) ? false : undefined;
    }
  });
})();
