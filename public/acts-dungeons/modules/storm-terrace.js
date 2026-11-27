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
  function kidScale(M, ms, opt) {
    M.plan = { glow: M.glow, gap: M.gap, period: M.thin ? M.period / 2 : M.period, strike: M.strike }; M.kid = false; M.opt = '';
    if (!KT.young()) return M;
    var glow = KT.warnTicks(M.glow, ms), gap = Math.max(M.gap + glow - M.glow, glow + M.strike + KT.calmTicks(ms));
    if (glow !== M.glow || gap !== M.gap) { M.period = M.period / M.gap * gap; M.glow = glow; M.gap = gap; M.kid = true; }
    M.opt = opt || '';
    if (M.opt.indexOf('b') >= 0 && M.strike > 1) M.strike = 1;              // option (b): the slot keeps its length, so the calm after a strike grows by the tick the strike lost
    return M;
  }
  // Day 4 (kid-timing track KT), the narrow-band floors: two options the owner has not ruled on, each behind its own value
  // of the kid-timing switch, neither on by default. localStorage 'qok-kid-timing' = 'a': a strike covers fewer bands at
  // once (thin, below); 'b': a strike lasts one tick instead of two; 'ab': both; '1': the age rule with neither option.
  // SPIRE_OPT is what plays for each age group when the switch is not set ('' = neither: one line to change after the
  // ruling). With the switch at '0', or a grade the helper does not know, the plan plays and no option applies.
  var SPIRE_OPT = { young: '', mid: '', high: '' };
  function spireOpt() {
    var v = null; try { v = window.localStorage.getItem('qok-kid-timing'); } catch (e) {}
    return (v === 'a' || v === 'b' || v === 'ab') ? v : (v === '1' ? '' : (SPIRE_OPT[KT.tier()] || ''));
  }
  // Option (a): every plan group's stones are struck in two turns instead of one. A group's bands (its connected runs of
  // cells) are dealt out one by one, top to bottom, each taking the other turn from its nearest band already dealt, so
  // two neighbouring bands of a group are not struck together. Groups g and g + G are the two halves of plan group g;
  // the order is the plan's, gone through twice; the period doubles; glow and strike lengths are untouched. It is still
  // the whole terrace, struck in timed turns, the stone glowing first. Works on a copy: the plan's rows are not changed.
  function thin(M) {
    var G = M.G, of = {}, seen = {}, comps = [], g, i, j, c, DX = [1, -1, 0, 0], DY = [0, 0, 1, -1];
    if (G * 2 > 10) return M;                                               // the group grid is one digit a cell
    for (g = 0; g < G; g++) for (i = 0; i < M.cells[g].length; i++) of[M.cells[g][i][0] + ',' + M.cells[g][i][1]] = g;
    for (g = 0; g < G; g++) for (i = 0; i < M.cells[g].length; i++) { c = M.cells[g][i]; if (seen[c[0] + ',' + c[1]]) continue;
      var q = [c], cs = [], sx = 0, sy = 0; seen[c[0] + ',' + c[1]] = 1;
      while (q.length) { var p = q.pop(); cs.push(p); sx += p[0]; sy += p[1];
        for (j = 0; j < 4; j++) { var nk = (p[0] + DX[j]) + ',' + (p[1] + DY[j]); if (of[nk] === g && !seen[nk]) { seen[nk] = 1; q.push([p[0] + DX[j], p[1] + DY[j]]); } } }
      comps.push({ g: g, cells: cs, x: sx / cs.length, y: sy / cs.length, half: 0 }); }
    comps.sort(function (a, b) { return (a.y - b.y) || (a.x - b.x) || (a.g - b.g); });
    for (i = 0; i < comps.length; i++) { var best = null, bd = 1e9;
      for (j = 0; j < i; j++) if (comps[j].g === comps[i].g) { var d = Math.abs(comps[j].x - comps[i].x) + Math.abs(comps[j].y - comps[i].y); if (d < bd) { bd = d; best = comps[j]; } }
      comps[i].half = best ? 1 - best.half : 0; }
    var cells = [], rows = [], grid = [];
    for (g = 0; g < G * 2; g++) cells.push([]);
    for (i = 0; i < M.rows.length; i++) grid.push(M.rows[i].split(''));
    for (i = 0; i < comps.length; i++) { var ng = comps[i].g + G * comps[i].half;
      for (j = 0; j < comps[i].cells.length; j++) { c = comps[i].cells[j]; cells[ng].push(c); grid[c[1]][c[0]] = String(ng); } }
    for (i = 0; i < grid.length; i++) rows.push(grid[i].join(''));
    return { G: G * 2, gap: M.gap, period: M.period * 2, strike: M.strike, glow: M.glow, rows: rows, cells: cells, thin: true, planG: G };
  }
  function groupAt(M, cx, cy) { var r = M.rows[cy]; if (!r) return -1; var ch = r.charCodeAt(cx) - 48; return (ch >= 0 && ch < M.G) ? ch : -1; }
  function mod(a, n) { return ((a % n) + n) % n; }
  function striking(M, g, tick) { return g >= 0 && mod(Math.floor(tick) - g * M.gap, M.period) < M.strike; }
  function glowing(M, g, tick) { return g >= 0 && !striking(M, g, tick) && mod(g * M.gap - Math.floor(tick), M.period) <= M.glow; }
  function glowAmount(M, g, tick) { var left = mod(g * M.gap - tick, M.period); return left <= M.glow ? 1 - left / M.glow : 0; }   // 0 -> 1 as the strike nears

  function ready(ctx) {
    var S = ctx.state; if (S.ok) return true;
    var K = kit(); if (!K) return false;
    S.K = K; S.ms = K.tickMs(ctx.mechanic.params); S.opt = KT.young() ? spireOpt() : '';
    S.M = kidScale(S.opt.indexOf('a') >= 0 ? thin(model(ctx)) : model(ctx), S.ms, S.opt); S.grace = Math.max(4, Math.round(2500 / S.ms)); S.spr = null; S.was = {};   // no bolt can hurt her in the first 2.5 s on a floor (arrival, or Continue out on a terrace)
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
  function buildOld(ctx) {
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
  function paintOld(ctx) {
    var S = ctx.state, M = S.M; if (!S.spr) buildOld(ctx);
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
  // ---- the look (day 4, owner ruling 2026-11-03: "no marked tiles, no rod; the stone glows before a strike") ----
  // Same cells, same clock, same alpha curve as the square cells below; only what is drawn differs. A group's
  // stones are one soft picture (every cell of the group fully inside it, the edge fading outward over about a
  // quarter cell, wavy like the stones' own outline), laid on the floor twice: a faint blue wash, and a light
  // that multiplies the painted stone (floor x (1 + light)), so the stone faces brighten and the joints stay
  // dark: it is the stone that glows, not a sheet over it. The strike is the same picture in white for the
  // same two ticks, and bolts that land on stones of the group inside the terrace, on screen, clear of the
  // stick and the HUD boxes. localStorage 'qok-d4-looks' = '0' draws the old square cells.
  var LOOKS = (function () { try { return window.localStorage.getItem('qok-d4-looks') !== '0'; } catch (e) { return true; } })();
  var RES = 8, PAD = 2;                                                      // mask px per cell; cells of margin round a group's box
  function hash(x, y) { var n = Math.sin(x * 127.1 + y * 311.7) * 43758.5453; return n - Math.floor(n); }
  function wave(x, y) { var xi = Math.floor(x), yi = Math.floor(y), fx = x - xi, fy = y - yi; fx = fx * fx * (3 - 2 * fx); fy = fy * fy * (3 - 2 * fy);
    var a = hash(xi, yi), b = hash(xi + 1, yi), c = hash(xi, yi + 1), d = hash(xi + 1, yi + 1); return a + (b - a) * fx + (c - a) * fy + (a - b - c + d) * fx * fy; }
  function grow(A, W, H) { var B = new Float32Array(W * H), x, y, i, m;      // every px takes the largest of itself and its neighbours
    for (y = 0; y < H; y++) for (x = 0; x < W; x++) { i = y * W + x; m = A[i];
      if (x > 0 && A[i - 1] > m) m = A[i - 1]; if (x < W - 1 && A[i + 1] > m) m = A[i + 1]; if (y > 0 && A[i - W] > m) m = A[i - W]; if (y < H - 1 && A[i + W] > m) m = A[i + W]; B[i] = m; }
    return B; }
  function blur(A, W, H, n) { var B = new Float32Array(W * H), x, y, i, k;
    for (k = 0; k < n; k++) {
      for (y = 0; y < H; y++) for (x = 0; x < W; x++) { i = y * W + x; B[i] = (A[i] * 2 + A[x > 0 ? i - 1 : i] + A[x < W - 1 ? i + 1 : i]) * 0.25; }
      for (y = 0; y < H; y++) for (x = 0; x < W; x++) { i = y * W + x; A[i] = (B[i] * 2 + B[y > 0 ? i - W : i] + B[y < H - 1 ? i + W : i]) * 0.25; } }
    return A; }
  // softMask(cells): {x, y (world px of the picture's corner), w, h (mask px), a: Float32Array 0..1}. Every cell of the
  // set keeps at least 0.8 over its whole area (the cells are grown by a px or two before the blur).
  function softMask(cells, seed) {
    var x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9, i, x, y;
    for (i = 0; i < cells.length; i++) { x0 = Math.min(x0, cells[i][0]); y0 = Math.min(y0, cells[i][1]); x1 = Math.max(x1, cells[i][0]); y1 = Math.max(y1, cells[i][1]); }
    if (!cells.length) return null;
    x0 -= PAD; y0 -= PAD; var W = (x1 - x0 + 1 + PAD) * RES, H = (y1 - y0 + 1 + PAD) * RES, A = new Float32Array(W * H);
    for (i = 0; i < cells.length; i++) { var px = (cells[i][0] - x0) * RES, py = (cells[i][1] - y0) * RES; for (y = 0; y < RES; y++) for (x = 0; x < RES; x++) A[(py + y) * W + px + x] = 1; }
    var A1 = grow(A, W, H), A2 = grow(A1, W, H), own = new Uint8Array(W * H);
    for (y = 0; y < H; y++) for (x = 0; x < W; x++) { i = y * W + x; own[i] = A[i] ? 1 : 0; A[i] = wave((x + x0 * RES) / 5.3 + seed, (y + y0 * RES) / 5.3) > 0.5 ? A2[i] : A1[i]; }
    return { x: x0 * T, y: y0 * T, w: W, h: H, a: blur(A, W, H, 2), own: own };
  }
  // The floor picture, once it is in, keeps the light off the sky beyond the terrace's painted edge: its brightness
  // per mask px (painted stone is about 0.7, the sky about 0.2). Inside the group's own cells only plain sky is
  // left dark; in the soft edge outside them anything darker than stone is.
  function artClip(ctx, m) {
    var im = ctx.art(); if (!im) return null;
    try { var s = (im.naturalWidth || im.width) / (ctx.plan.width * T), c = document.createElement('canvas'); c.width = m.w; c.height = m.h;
      var g = c.getContext('2d'); g.imageSmoothingEnabled = true; g.drawImage(im, m.x * s, m.y * s, m.w * T / RES * s, m.h * T / RES * s, 0, 0, m.w, m.h);
      var d = g.getImageData(0, 0, m.w, m.h).data, out = new Float32Array(m.w * m.h), i;
      for (i = 0; i < out.length; i++) out[i] = (d[i * 4] * 0.3 + d[i * 4 + 1] * 0.59 + d[i * 4 + 2] * 0.11) / 255;
      return blur(out, m.w, m.h, 1); } catch (e) { return null; }
  }
  function maskTex(ctx, g, m) {
    var sc = ctx.scene, key = 'd2s_stone_' + ctx.key + '_' + g, t, clip;
    try {
      t = sc.textures.exists(key) ? sc.textures.get(key) : sc.textures.createCanvas(key, m.w, m.h);
      if (t.__lit === 2 || (t.__lit === 1 && !ctx.art())) return key;
      clip = artClip(ctx, m);
      var cx = t.getContext(), im = cx.createImageData(m.w, m.h), d = im.data, i;
      for (i = 0; i < m.a.length; i++) { var c = 1;
        if (clip) { c = m.own[i] ? (clip[i] - 0.15) / 0.12 : (clip[i] - 0.34) / 0.16; c = c <= 0 ? 0 : c >= 1 ? 1 : c * c * (3 - 2 * c); }
        d[i * 4] = 255; d[i * 4 + 1] = 255; d[i * 4 + 2] = 255; d[i * 4 + 3] = Math.round(255 * Math.min(1, m.a[i] * 1.12) * c); }
      cx.putImageData(im, 0, 0); t.refresh(); try { t.setFilter(0); } catch (e) {}      // a soft light, not pixel art: sampled LINEAR
      t.__lit = clip ? 2 : 1;
    } catch (e) { return null; }
    return key;
  }
  // floor x (1 + light): the renderer's own blend table takes one more entry; without WebGL the light is added instead.
  function litBlend(sc) {
    try { var r = sc.sys.game.renderer, gl = r && r.gl; if (!gl || !r.addBlendMode) return 1;
      if (r.__qokLit === undefined) r.__qokLit = r.addBlendMode([gl.DST_COLOR, gl.ONE], gl.FUNC_ADD);
      return r.__qokLit; } catch (e) { return 1; }
  }
  function rnd(seed) { var s = seed || 1; return function () { s = (s * 1103515245 + 12345) & 0x7fffffff; return s / 0x7fffffff; }; }
  function boltTex2(sc, K, v) {                                              // a forked bolt that comes out of the air (its top fades) and ends at the bottom middle
    return K.canvasTex(sc, 'd2s_bolt' + v, 72, 168, function (g, w, h) {
      var r = rnd(17 + v * 71), pts = [], i, n = 9, x = w / 2 + (r() - 0.5) * 16;
      for (i = 0; i <= n; i++) { var y = h * i / n, k = i === n ? 0 : (r() - 0.5) * (i % 2 ? 22 : 12) * (1 - i / (n + 2)); pts.push([i === n ? w / 2 : Math.max(14, Math.min(w - 14, x + k)), y - (i === n ? 2 : 0)]); x += (w / 2 - x) * 0.35 + k * 0.4; }
      function line(P, lw, col) { g.strokeStyle = col; g.lineWidth = lw; g.lineJoin = 'round'; g.lineCap = 'round'; g.beginPath(); g.moveTo(P[0][0], P[0][1]); for (var j = 1; j < P.length; j++) g.lineTo(P[j][0], P[j][1]); g.stroke(); }
      var b0 = pts[4], fork = [b0, [b0[0] + (v ? -11 : 12), b0[1] + 16], [b0[0] + (v ? -8 : 9), b0[1] + 30], [b0[0] + (v ? -19 : 20), b0[1] + 46]];
      line(pts, 18, 'rgba(60,110,255,0.22)'); line(pts, 10, 'rgba(70,125,255,0.5)'); line(fork, 7, 'rgba(70,125,255,0.4)');   // a blue halo: it reads on lit stone too
      line(pts, 5.5, '#a9d0ff'); line(fork, 3, '#a9d0ff'); line(pts, 2.6, '#ffffff'); line(fork, 1.3, '#ffffff');
      var f = g.createLinearGradient(0, 0, 0, h * 0.42); f.addColorStop(0, 'rgba(0,0,0,1)'); f.addColorStop(1, 'rgba(0,0,0,0)');
      g.globalCompositeOperation = 'destination-out'; g.fillStyle = f; g.fillRect(0, 0, w, h * 0.42); g.globalCompositeOperation = 'source-over';
    });
  }
  function flashTex(sc, K) {                                                 // the light where a bolt lands, seen on the ground
    return K.canvasTex(sc, 'd2s_flash', 96, 64, function (g, w, h) {
      g.save(); g.translate(w / 2, h / 2); g.scale(1, h / w);
      var f = g.createRadialGradient(0, 0, 2, 0, 0, w / 2); f.addColorStop(0, 'rgba(255,255,255,0.95)'); f.addColorStop(0.3, 'rgba(200,228,255,0.6)'); f.addColorStop(1, 'rgba(120,170,255,0)');
      g.fillStyle = f; g.beginPath(); g.arc(0, 0, w / 2, 0, Math.PI * 2); g.fill(); g.restore();
    });
  }
  // The boxes of the HUD and the stick, in world px (a bolt is never drawn under one of them).
  var HUD = '#dpad, #fieldTabs > *, #a1mInteract.a1m-show, #qok-field-hud > *, #qok-quest-hud, #d2aGlyphHint';
  function hudBoxes(sc) {
    var out = [];
    try { var cv = sc.sys.game.canvas, cr = cv.getBoundingClientRect(), cam = sc.cameras.main, v = cam.worldView, k = v.width / cr.width, list = document.querySelectorAll(HUD), i;
      for (i = 0; i < list.length; i++) { var r = list[i].getBoundingClientRect(); if (r.width < 4 || r.height < 4 || r.width * r.height > cr.width * cr.height * 0.5) continue;
        out.push([v.x + (r.left - cr.left) * k - 6, v.y + (r.top - cr.top) * k - 6, v.x + (r.right - cr.left) * k + 6, v.y + (r.bottom - cr.top) * k + 6]); } } catch (e) {}
    return out;
  }
  function stone(ctx, cx, cy) { var c = ctx.terrain(cx, cy); return c === 'z' || c === '.'; }
  // Where the bolts of a strike on group g land: stones of the group on screen, nearest her first, at least two
  // cells apart, each with terrace above it for the bolt's own height (a bolt is as tall as that allows, 150 px
  // at most) and no HUD box over any part of it. [[x, y (where it lands), height]]
  function landings(ctx, g, max) {
    var S = ctx.state, M = S.M, sc = ctx.scene, h = ctx.hero(), hx = h ? h.x : 0, hy = h ? h.footY : 0, v, hud = hudBoxes(sc), cand = [], out = [], i, j;
    try { v = sc.cameras.main.worldView; } catch (e) { v = null; }
    for (i = 0; i < M.cells[g].length; i++) { var c = M.cells[g][i], x = c[0] * T + 24, y = c[1] * T + 30, n = 0;
      while (n < 3 && stone(ctx, c[0], c[1] - 1 - n)) n++;
      var ht = Math.min(150, 30 + n * T);
      if (v) { if (x < v.x + 20 || x > v.right - 20 || y > v.bottom - 6 || y < v.y + 50) continue; ht = Math.min(ht, y - v.y - 4); }
      var hit = false; for (j = 0; j < hud.length && !hit; j++) hit = x + 20 > hud[j][0] && x - 20 < hud[j][2] && y > hud[j][1] && y - ht < hud[j][3];
      if (hit) continue;
      cand.push([Math.abs(x - hx) + Math.abs(y - hy) + (n ? 0 : 6 * T), x, y, ht, c]); }
    cand.sort(function (p, q) { return p[0] - q[0]; });
    for (i = 0; i < cand.length && out.length < max; i++) { var far = true;
      for (j = 0; j < out.length && far; j++) far = Math.max(Math.abs(out[j][3][0] - cand[i][4][0]), Math.abs(out[j][3][1] - cand[i][4][1])) >= 2;
      if (far) out.push([cand[i][1], cand[i][2], cand[i][3], cand[i][4]]); }
    return out;
  }
  function build(ctx) {
    var S = ctx.state, K = S.K, sc = ctx.scene, M = S.M, g, i, dg = ctx.depth.ground;
    S.spr = { glow: [], wash: [], hit: [], bolts: [], flash: [], look: 2, lit: litBlend(sc), masks: [] };
    for (g = 0; g < M.G; g++) {
      var m = softMask(M.cells[g], g * 3.7), key = m && maskTex(ctx, g, m), sx = T / RES;
      if (!key) { S.spr = null; return buildOld(ctx); }                    // no canvas: the square cells are still a warning
      var w = ctx.own(sc.add.image(m.x, m.y, key).setOrigin(0, 0).setScale(sx).setDepth(dg + 0.2).setAlpha(0).setTint(0x2f6fe0));
      var a = ctx.own(sc.add.image(m.x, m.y, key).setOrigin(0, 0).setScale(sx).setDepth(dg + 0.25).setAlpha(0).setTint(S.spr.lit === 1 ? 0x8fc4ff : 0xa8d8ff));
      var b = ctx.own(sc.add.image(m.x, m.y, key).setOrigin(0, 0).setScale(sx).setDepth(dg + 0.3).setAlpha(0).setTint(0xe2f0ff));
      try { a.setBlendMode(S.spr.lit); b.setBlendMode(1); } catch (e) {}
      S.spr.wash.push(w); S.spr.glow.push(a); S.spr.hit.push(b); S.spr.masks.push(m);
    }
    for (i = 0; i < 7; i++) {
      var f = ctx.own(sc.add.image(0, 0, flashTex(sc, K)).setDepth(dg + 0.35).setVisible(false)); try { f.setBlendMode(1); } catch (e) {}
      S.spr.flash.push(f); S.spr.bolts.push(ctx.own(sc.add.image(0, 0, boltTex2(sc, K, i & 1)).setOrigin(0.5, 1).setDepth(11).setVisible(false)));
    }
  }
  function paint(ctx) {
    if (!LOOKS) return paintOld(ctx);
    var S = ctx.state, M = S.M; if (!S.spr) build(ctx);
    if (!S.spr || S.spr.look !== 2) return paintOld(ctx);
    var t = S.tick, g, i;
    if (!S.spr.clipped && ctx.art()) { S.spr.clipped = true; for (g = 0; g < M.G; g++) maskTex(ctx, g, S.spr.masks[g]); }   // the floor picture has arrived
    for (g = 0; g < M.G; g++) {
      var st = striking(M, g, t), u = mod(t - g * M.gap, M.period);
      var ga = st ? 0 : glowAmount(M, g, t); if (M.kid && ga > 0) ga = 0.2 + 0.8 * ga;   // the longer glow is visible from its first moment
      var pulse = ga > 0 ? ga * (0.30 + 0.10 * Math.sin(t * (3 + 5 * ga))) + 0.05 : 0, a = Math.max(0, Math.min(0.5, pulse));   // the old cells' own alpha: 0 exactly when they were dark
      var hk = st ? Math.max(0.15, 0.75 - 0.6 * (u / M.strike)) : 0;           // the old white cells' alpha through the strike
      // the strike: the stone itself stays lit at full, blue, for the whole strike, under a pale flash that lasts its
      // first tick (a lightning flash, not a white sheet: the stones show through it)
      if (S.spr.lit !== 1 && st) hk = u < 1 ? 0.06 + 0.2 * (1 - u) : 0.06;
      S.spr.glow[g].setAlpha(st ? 0.75 : a > 0 ? Math.min(1, (S.spr.lit === 1 ? 0.06 : 0.16) + a * (S.spr.lit === 1 ? 1.1 : 1.2)) : 0);
      S.spr.wash[g].setAlpha(st ? 0.6 : a * 0.62);
      S.spr.hit[g].setAlpha(hk);
      if (st && !S.was[g]) {                                                 // a new strike: bolts on stones of this group
        var L = landings(ctx, g, S.spr.bolts.length);
        for (i = 0; i < S.spr.bolts.length; i++) { var bo = S.spr.bolts[i], fl = S.spr.flash[i], p = L[i];
          if (!p) { bo.setVisible(false); fl.setVisible(false); continue; }
          bo.setPosition(p[0], p[1]).setDisplaySize(72 * Math.max(0.62, p[2] / 150), p[2]).setVisible(true).setAlpha(1).setFlipX(!!((i + (S.strikes || 0)) & 2)); bo.__until = t + M.strike;
          fl.setPosition(p[0], p[1] - 2).setVisible(true).setAlpha(1).setScale(0.7); }
        S.strikes = (S.strikes || 0) + 1; S.lastBolts = L.map(function (q) { return [q[0], q[1], q[2]]; });
      }
      S.was[g] = st;
    }
    for (i = 0; i < S.spr.bolts.length; i++) { var b2 = S.spr.bolts[i], f2 = S.spr.flash[i]; if (!b2.visible) continue;
      var left = mod(b2.__until - t, M.period);
      if (left > M.strike || left <= 0.05) { b2.setVisible(false); f2.setVisible(false); continue; }
      var q = left / M.strike; b2.setAlpha(Math.min(1, q + 0.2) * (0.82 + 0.18 * Math.sin(t * 31 + i)));
      f2.setAlpha(Math.min(1, q * 1.1)).setScale(0.7 + 0.7 * (1 - q)); }
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
    logic: { model: model, kidScale: kidScale, thin: thin, spireOpt: spireOpt, groupAt: groupAt, striking: striking, glowing: glowing },
    load: function (ctx) { ready(ctx); },
    unload: function (ctx) {                                                   // the groups' soft pictures are named for this floor: they go with it (a return draws them again)
      var S = ctx.state, sp = S && S.spr, tm = ctx.scene && ctx.scene.textures, g, i; if (!sp || sp.look !== 2) return;
      for (g = 0; g < sp.glow.length; g++) { var k = sp.glow[g] && sp.glow[g].texture && sp.glow[g].texture.key, three = [sp.wash[g], sp.glow[g], sp.hit[g]];
        for (i = 0; i < 3; i++) { try { if (three[i]) three[i].destroy(); } catch (e) {} }
        try { if (k && k.indexOf('d2s_stone_') === 0 && tm && tm.exists(k)) tm.remove(k); } catch (e) {} }
      S.spr = null;
    },
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
