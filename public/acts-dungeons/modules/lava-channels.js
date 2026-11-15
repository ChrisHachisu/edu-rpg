/* Volcanic Forge: lava channels (mechanic id `lava-channels`).

   A forge hall is a grid of 2x2 trough tiles between a furnace (in the wall above the first
   tile) and one or two bridge molds (lava gaps on the way on, or to a treasure ledge). Some
   tiles sit on turntables: standing on or beside one shows "Turn", and every tap turns it 90
   degrees clockwise. The lever by the hall door pours: iron runs from the furnace through every
   trough that joins up, and a mold it reaches fills and cools into a bridge, for good. A broken
   path just pools and cools: no penalty, turn and pour again.

   Persistent (story flags, ctx.flagKey): `rot.<x>.<y>` = quarter turns of a turntable (1..3),
   `mold.<hall>.<id>` = that bridge is cast. */
(function () {
  'use strict';
  var D = window.__QOK_DNG2__; if (!D || !D.register) return;
  var T = 48, LAT = 10, EXT = 30;
  var LET = { N: 0, E: 1, S: 2, W: 3 }, DV = [[0, -1], [1, 0], [0, 1], [-1, 0]];
  function kit() { return window.__QOK_D2KIT_B__; }

  // ---- pure logic ---------------------------------------------------------------------------------
  // model(ctx): halls -> { tiles (by "x,y" of the top-left cell), turntables, source, molds, lever }
  function model(ctx) {
    var halls = {}, order = [], a = ctx.plan.mech || [], hs = ctx.mechanic.halls || [], i, j;
    for (i = 0; i < hs.length; i++) { halls[hs[i].hall] = { id: hs[i].hall, tiles: {}, list: [], turn: [], molds: [], lever: null, furnace: null, source: null }; order.push(hs[i].hall);
      for (j = 0; j < hs[i].molds.length; j++) { var m = hs[i].molds[j], cs = m.cells, x0 = 1e9, y0 = 1e9, x1 = -1, y1 = -1, set = {};
        for (var k = 0; k < cs.length; k++) { x0 = Math.min(x0, cs[k][0]); y0 = Math.min(y0, cs[k][1]); x1 = Math.max(x1, cs[k][0]); y1 = Math.max(y1, cs[k][1]); set[cs[k][0] + ',' + cs[k][1]] = 1; }
        var horiz = (x1 - x0) > (y1 - y0), px = [x0 * T, y0 * T, (x1 + 1) * T, (y1 + 1) * T];
        halls[hs[i].hall].molds.push({ id: m.id, cells: cs, set: set, rect: [x0, y0, x1, y1], px: px, horiz: horiz,
          zone: horiz ? [px[0] - EXT, px[1] + LAT, px[2] + EXT, px[3] - LAT] : [px[0] + LAT, px[1] - EXT, px[2] - LAT, px[3] + EXT] }); } }
    for (i = 0; i < a.length; i++) { var o = a[i], H = halls[o.hall]; if (!H) continue;
      if (o.kind === 'trough' || o.kind === 'turntable') { var mask = 0; for (j = 0; j < o.open.length; j++) mask |= 1 << LET[o.open[j]];
        var t = { x: o.x, y: o.y, open0: mask, turntable: o.kind === 'turntable', rot: 0, hall: o.hall, key: o.x + ',' + o.y, asset: o };
        H.tiles[t.key] = t; H.list.push(t); if (t.turntable) H.turn.push(t); }
      else if (o.kind === 'lever') H.lever = { x: o.x, y: o.y, hall: o.hall };
      else if (o.kind === 'furnace') H.furnace = { x: o.x, y: o.y }; }
    for (i = 0; i < order.length; i++) { var h = halls[order[i]], f = h.furnace;                 // the tile right under the furnace
      if (f) h.source = h.tiles[f.x + ',' + (f.y + 1)] || h.tiles[(f.x - 1) + ',' + (f.y + 1)] || null; }
    return { halls: halls, order: order };
  }
  function openOf(t) { var r = t.rot & 3, m = t.open0; return ((m << r) | (m >> (4 - r))) & 15; }   // clockwise: N -> E -> S -> W
  function beyond(t, d) {                                                     // the two cells just past side d of a 2x2 tile
    return d === 0 ? [[t.x, t.y - 1], [t.x + 1, t.y - 1]] : d === 1 ? [[t.x + 2, t.y], [t.x + 2, t.y + 1]]
         : d === 2 ? [[t.x, t.y + 2], [t.x + 1, t.y + 2]] : [[t.x - 1, t.y], [t.x - 1, t.y + 1]];
  }
  // flow(H): tiles the iron reaches, in the order it reaches them, and the molds it fills
  function flow(H) {
    var out = { reach: [], depth: {}, molds: [], ends: [] }, s = H.source;
    if (!s || !(openOf(s) & 1)) return out;                                   // the first trough must open north, under the spout
    var q = [s]; out.depth[s.key] = 0; var fed = {};
    for (var i = 0; i < q.length; i++) { var t = q[i], op = openOf(t), led = false; out.reach.push(t);
      for (var d = 0; d < 4; d++) { if (!(op & (1 << d))) continue;
        if (t === s && d === 0) continue;
        var n = H.tiles[(t.x + DV[d][0] * 2) + ',' + (t.y + DV[d][1] * 2)];
        if (n) { if (openOf(n) & (1 << ((d + 2) & 3))) { led = true; if (out.depth[n.key] === undefined) { out.depth[n.key] = out.depth[t.key] + 1; q.push(n); } } continue; }
        var b = beyond(t, d);
        for (var m = 0; m < H.molds.length; m++) { var M = H.molds[m];
          if ((M.set[b[0][0] + ',' + b[0][1]] || M.set[b[1][0] + ',' + b[1][1]]) && !fed[M.id]) { fed[M.id] = 1; out.molds.push({ mold: M, from: t, dir: d }); led = true; } }
      }
      if (!led) out.ends.push(t);                                              // the iron pools here
    }
    return out;
  }
  // fewest taps that pour into mold `id` from the current rotations: [{tile index, taps}] or null
  function solve(H, ids) {
    var k = H.turn.length, save = H.turn.map(function (t) { return t.rot; }), best = null, n = Math.pow(4, k), c, i;
    for (c = 0; c < n; c++) { var taps = 0, v = c, plan = [];
      for (i = 0; i < k; i++) { var r = v & 3; v >>= 2; H.turn[i].rot = (save[i] + r) & 3; taps += r; if (r) plan.push({ i: i, taps: r }); }
      if (best && taps >= best.taps) continue;
      var f = flow(H), got = {}; for (i = 0; i < f.molds.length; i++) got[f.molds[i].mold.id] = 1;
      if (ids.every(function (id) { return got[id]; })) best = { taps: taps, plan: plan };
    }
    for (i = 0; i < k; i++) H.turn[i].rot = save[i];
    return best;
  }

  // ---- state --------------------------------------------------------------------------------------
  function ready(ctx) {
    var S = ctx.state; if (S.ok) return true;
    var K = kit(); if (!K) return false;
    S.K = K; S.M = model(ctx); S.anim = null; S.spr = null; S.t = 0;
    var o = S.M.order, i, j;
    for (i = 0; i < o.length; i++) { var H = S.M.halls[o[i]];
      for (j = 0; j < H.turn.length; j++) H.turn[j].rot = (+K.getFlag(ctx, 'rot.' + H.turn[j].key) || 0) & 3;
      for (j = 0; j < H.molds.length; j++) H.molds[j].cast = !!K.getFlag(ctx, 'mold.' + H.id + '.' + H.molds[j].id); }
    S.ok = true; return true;
  }
  function eachHall(S, fn) { for (var i = 0; i < S.M.order.length; i++) { var r = fn(S.M.halls[S.M.order[i]]); if (r !== undefined) return r; } }
  function inR(r, x, y) { return x >= r[0] && x < r[2] && y >= r[1] && y < r[3]; }

  // ---- pictures ------------------------------------------------------------------------------------
  function groove(g, mask, w, col) {                                          // channels from the centre to each open side of a 96 px tile
    g.fillStyle = col; var c = 48, h = w / 2;
    g.fillRect(c - h, c - h, w, w);
    if (mask & 1) g.fillRect(c - h, 0, w, c); if (mask & 2) g.fillRect(c, c - h, c, w);
    if (mask & 4) g.fillRect(c - h, c, w, c); if (mask & 8) g.fillRect(0, c - h, c, w);
  }
  function tileTex(sc, K, mask, tt) {
    return K.canvasTex(sc, 'd2b_trough_' + mask + (tt ? 't' : ''), 96, 96, function (g) {
      g.fillStyle = '#3b3438'; g.fillRect(0, 0, 96, 96);
      g.fillStyle = tt ? '#7d7068' : '#6c666b'; g.fillRect(2, 2, 92, 92);
      g.fillStyle = tt ? '#978776' : '#86808a'; g.fillRect(2, 2, 92, 3); g.fillRect(2, 2, 3, 92);
      g.fillStyle = tt ? '#5c5049' : '#514b52'; g.fillRect(2, 91, 92, 3); g.fillRect(91, 2, 3, 92);
      if (tt) { g.strokeStyle = '#c59a4c'; g.lineWidth = 4; g.beginPath(); g.arc(48, 48, 41, 0, Math.PI * 2); g.stroke();
        g.strokeStyle = '#6e4f1f'; g.lineWidth = 1.5; g.beginPath(); g.arc(48, 48, 44, 0, Math.PI * 2); g.stroke();
        g.fillStyle = '#e8c878'; [[19, 19], [77, 19], [19, 77], [77, 77]].forEach(function (p) { g.fillRect(p[0] - 2, p[1] - 2, 5, 5); }); }
      groove(g, mask, 30, '#2a2226'); groove(g, mask, 22, '#17110f'); groove(g, mask, 8, '#241a17');
    });
  }
  function ironTex(sc, K, mask) {
    return K.canvasTex(sc, 'd2b_iron_' + mask, 96, 96, function (g) { groove(g, mask, 22, '#ff7a1c'); groove(g, mask, 12, '#ffc247'); groove(g, mask, 4, '#fff1b0'); });
  }
  function leverTex(sc, K, on) {
    return K.canvasTex(sc, 'd2b_lever_' + (on ? 1 : 0), 48, 60, function (g) {
      g.fillStyle = 'rgba(0,0,0,0.28)'; g.beginPath(); g.ellipse(24, 52, 18, 6, 0, 0, Math.PI * 2); g.fill();
      g.fillStyle = '#3a3236'; g.fillRect(8, 38, 32, 16); g.fillStyle = '#6a6064'; g.fillRect(10, 36, 28, 14); g.fillStyle = '#8a8084'; g.fillRect(10, 36, 28, 3);
      g.fillStyle = '#1c1618'; g.fillRect(20, 40, 8, 6);
      g.save(); g.translate(24, 43); g.rotate(on ? 0.6 : -0.6);
      g.fillStyle = '#2a2224'; g.fillRect(-3, -34, 6, 34); g.fillStyle = '#b9bcc4'; g.fillRect(-2, -33, 3, 32);
      g.fillStyle = '#c0392b'; g.beginPath(); g.arc(0, -35, 6, 0, Math.PI * 2); g.fill(); g.fillStyle = '#ff8a70'; g.fillRect(-3, -39, 3, 3);
      g.restore();
    });
  }
  function furnaceTex(sc, K) {
    return K.canvasTex(sc, 'd2b_furnace', 96, 84, function (g) {
      g.fillStyle = '#241c1e'; g.fillRect(6, 6, 84, 70); g.fillStyle = '#51474b'; g.fillRect(9, 9, 78, 64);
      g.fillStyle = '#6d6166'; g.fillRect(9, 9, 78, 4); g.fillRect(9, 9, 4, 64); g.fillStyle = '#3a3034'; g.fillRect(9, 69, 78, 4);
      g.fillStyle = '#1a1012'; g.beginPath(); g.moveTo(26, 62); g.lineTo(26, 38); g.quadraticCurveTo(48, 12, 70, 38); g.lineTo(70, 62); g.closePath(); g.fill();
      var gr = g.createRadialGradient(48, 52, 3, 48, 48, 24); gr.addColorStop(0, '#fff3b8'); gr.addColorStop(0.45, '#ff9b2a'); gr.addColorStop(1, '#a82a08');
      g.fillStyle = gr; g.beginPath(); g.moveTo(30, 60); g.lineTo(30, 40); g.quadraticCurveTo(48, 19, 66, 40); g.lineTo(66, 60); g.closePath(); g.fill();
      g.fillStyle = '#2c2325'; g.fillRect(36, 62, 24, 22); g.fillStyle = '#ff9b2a'; g.fillRect(41, 62, 14, 22); g.fillStyle = '#ffe08a'; g.fillRect(45, 62, 6, 22);
      g.fillStyle = '#8c7e84'; [[14, 14], [80, 14], [14, 66], [80, 66]].forEach(function (p) { g.fillRect(p[0] - 2, p[1] - 2, 4, 4); });
    });
  }
  // The painted set: one atlas, relief-lit out of the Forge's own material tiles by
  // scripts/acts/mech-e4/make_art.py. Until it has loaded, the drawn pictures above stand in.
  var ART = 'd2b_forge';
  function atlas(sc, K) {
    if (!K.tex(sc, ART, 'acts-dungeons/modules/b-art/forge.webp')) return null;
    var t = sc.textures.get(ART), m;
    if (!t.has('t1')) { for (m = 1; m < 16; m++) { t.add('t' + m, 0, m * 96, 0, 96, 96); t.add('r' + m, 0, m * 96, 96, 96, 96); t.add('i' + m, 0, m * 96, 192, 96, 96); }
      t.add('furnace', 0, 0, 288, 96, 84); t.add('lever0', 0, 96, 288, 48, 60); t.add('lever1', 0, 144, 288, 48, 60); }
    return t;
  }
  function moldTex(sc, K, w, h, cast) {                                       // a mold of any size: cast plates, or the nine-sliced frame
    return K.canvasTex(sc, 'd2b_mold_' + w + 'x' + h + (cast ? 'c' : 'e'), w, h, function (g) {
      var src = sc.textures.get(ART).getSourceImage(), x, y, B = 14, L = 68, n;
      if (cast) {
        for (y = 0; y < h; y += T) for (x = 0; x < w; x += T) g.drawImage(src, 192, 288, T, T, x, y, T, T);
        g.fillStyle = 'rgba(255,255,255,0.16)'; g.fillRect(2, 2, w - 4, 1);
        g.fillStyle = 'rgba(0,0,0,0.30)'; g.fillRect(0, h - 5, w, 5); g.fillRect(w - 3, 0, 3, h);
        g.fillStyle = 'rgba(12,10,12,0.85)'; g.fillRect(0, 0, w, 2); g.fillRect(0, h - 2, w, 2); g.fillRect(0, 0, 2, h); g.fillRect(w - 2, 0, 2, h);
        return; }
      g.fillStyle = 'rgba(14,9,8,0.33)'; g.fillRect(B, B, w - 2 * B, h - 2 * B);
      for (x = B; x < w - B; x += L) { n = Math.min(L, w - B - x); g.drawImage(src, 288 + B, 288, n, B, x, 0, n, B); g.drawImage(src, 288 + B, 288 + 96 - B, n, B, x, h - B, n, B); }
      for (y = B; y < h - B; y += L) { n = Math.min(L, h - B - y); g.drawImage(src, 288, 288 + B, B, n, 0, y, B, n); g.drawImage(src, 288 + 96 - B, 288 + B, B, n, w - B, y, B, n); }
      g.drawImage(src, 288, 288, B, B, 0, 0, B, B); g.drawImage(src, 288 + 96 - B, 288, B, B, w - B, 0, B, B);
      g.drawImage(src, 288, 288 + 96 - B, B, B, 0, h - B, B, B); g.drawImage(src, 288 + 96 - B, 288 + 96 - B, B, B, w - B, h - B, B, B);
    });
  }
  function skinTile(ctx, e) {                                                 // the picture of a tile as it stands now, lit from the upper left
    var m = openOf(e.t); if (!m) return;
    try { ctx.scene.tweens.killTweensOf([e.tile, e.iron]); } catch (x) {}
    e.tile.setTexture(ART, (e.t.turntable ? 'r' : 't') + m).setAngle(0); e.iron.setTexture(ART, 'i' + m).setAngle(0); e.wait = 0;
  }
  function setLever(ctx, lv, on) { var S = ctx.state; lv.__on = !!on;
    if (S.skinned) lv.setTexture(ART, 'lever' + (on ? 1 : 0)); else lv.setTexture(leverTex(ctx.scene, S.K, on)); }
  function skin(ctx) {                                                        // swap the stand-ins for the painted set, once
    var S = ctx.state, k; if (S.skinned || !S.spr || !atlas(ctx.scene, S.K)) return;
    S.skinned = true;
    for (k in S.spr.tiles) skinTile(ctx, S.spr.tiles[k]);
    for (k in S.spr.molds) drawMold(ctx, S.spr.molds[k]);
    for (k in S.spr.levers) setLever(ctx, S.spr.levers[k], S.spr.levers[k].__on);
    for (k = 0; k < S.spr.furnaces.length; k++) S.spr.furnaces[k].setTexture(ART, 'furnace');
  }
  function build(ctx) {
    var S = ctx.state, K = S.K, sc = ctx.scene, dg = ctx.depth.ground;
    S.spr = { tiles: {}, molds: {}, levers: {}, furnaces: [] }; S.skinned = false;
    eachHall(S, function (H) {
      var i;
      for (i = 0; i < H.list.length; i++) { var t = H.list[i], cx = (t.x + 1) * T, cy = (t.y + 1) * T;
        var a = ctx.own(sc.add.image(cx, cy, tileTex(sc, K, t.open0, t.turntable)).setDepth(dg + 0.2).setAngle(t.rot * 90));
        var b = ctx.own(sc.add.image(cx, cy, ironTex(sc, K, t.open0)).setDepth(dg + 0.3).setAngle(t.rot * 90).setAlpha(0));
        S.spr.tiles[t.key] = { tile: a, iron: b, ang: t.rot * 90, t: t, wait: 0 }; }
      for (i = 0; i < H.molds.length; i++) { var M = H.molds[i], p = M.px, g = ctx.own(sc.add.graphics().setDepth(dg + 0.25));
        var mo = S.spr.molds[H.id + '.' + M.id] = { g: g, M: M, pic: ctx.own(sc.add.image(p[0], p[1], tileTex(sc, K, 0, false)).setOrigin(0, 0).setDepth(dg + 0.25).setVisible(false)),
          hot: ctx.own(sc.add.rectangle((p[0] + p[2]) / 2, (p[1] + p[3]) / 2, p[2] - p[0] - 8, p[3] - p[1] - 8, 0xffa02a).setDepth(dg + 0.35).setAlpha(0)) };
        drawMold(ctx, mo); }
      if (H.furnace) S.spr.furnaces.push(ctx.own(sc.add.image((H.furnace.x + 1) * T, (H.furnace.y + 1) * T + 6, furnaceTex(sc, K)).setOrigin(0.5, 1).setDepth(dg + 0.4)));
      if (H.lever) S.spr.levers[H.id] = ctx.own(sc.add.image(H.lever.x * T + T / 2, H.lever.y * T + T - 4, leverTex(sc, K, false)).setOrigin(0.5, 1).setDepth(9.5));
    });
    skin(ctx);
  }
  function drawMold(ctx, mo) {                                                // an empty mold is a frame over the lava; a cast one is an iron deck
    var g = mo.g, M = mo.M, p = M.px, w = p[2] - p[0], h = p[3] - p[1], x, y;
    g.clear();
    if (ctx.state.skinned) { var tk = moldTex(ctx.scene, ctx.state.K, w, h, !!M.cast); if (tk) { mo.pic.setTexture(tk).setVisible(true); return; } }
    if (!M.cast) { g.lineStyle(5, 0x2a2022, 0.95); g.strokeRect(p[0] + 4, p[1] + 4, w - 8, h - 8); g.lineStyle(2, 0x8a7a70, 0.9); g.strokeRect(p[0] + 7, p[1] + 7, w - 14, h - 14);
      g.fillStyle(0x15100f, 0.35); g.fillRect(p[0] + 9, p[1] + 9, w - 18, h - 18); return; }
    g.fillStyle(0x23262c, 1); g.fillRect(p[0] + 2, p[1] + 2, w - 4, h - 4);
    g.fillStyle(0x596070, 1); g.fillRect(p[0] + 5, p[1] + 5, w - 10, h - 10);
    g.fillStyle(0x7b8496, 1); g.fillRect(p[0] + 5, p[1] + 5, w - 10, 3);
    g.fillStyle(0x3d4350, 1);
    for (x = p[0] + T; x < p[2] - 4; x += T) g.fillRect(x - 1, p[1] + 5, 2, h - 10);
    for (y = p[1] + T; y < p[3] - 4; y += T) g.fillRect(p[0] + 5, y - 1, w - 10, 2);
    g.fillStyle(0xaab2c2, 1);
    for (x = p[0] + 12; x < p[2] - 8; x += 24) { g.fillRect(x, p[1] + 9, 3, 3); g.fillRect(x, p[3] - 13, 3, 3); }
  }

  // ---- the pour: a little timeline run from tick() ---------------------------------------------------
  var STEP = 150, HOLD = 500, COOL = 900;
  function pour(ctx, H) {
    var S = ctx.state, K = S.K; if (S.anim) return null;
    var f = flow(H), i, fresh = [];
    for (i = 0; i < f.molds.length; i++) { var M = f.molds[i].mold; if (!M.cast) { M.cast = true; M.fresh = true; K.setFlag(ctx, 'mold.' + H.id + '.' + M.id, true); fresh.push(M); } }
    var deep = 0; for (i = 0; i < f.reach.length; i++) deep = Math.max(deep, f.depth[f.reach[i].key]);
    S.anim = { H: H, f: f, t: 0, deep: deep, fresh: fresh, end: (deep + 1) * STEP + HOLD + COOL, said: false };
    S.poured = (S.poured || 0) + 1;
    var lv = S.spr && S.spr.levers[H.id]; if (lv) setLever(ctx, lv, true);
    return { reached: f.reach.length, fed: f.molds.map(function (m) { return m.mold.id; }), cast: fresh.map(function (m) { return m.id; }) };
  }
  function animate(ctx, dt) {
    var S = ctx.state, A = S.anim, K = S.K; if (!A) return;
    A.t += dt; var i, flowEnd = (A.deep + 1) * STEP;
    if (S.spr) {
      for (i = 0; i < A.f.reach.length; i++) { var t = A.f.reach[i], e = S.spr.tiles[t.key], at = A.f.depth[t.key] * STEP;
        var a = A.t < at ? 0 : A.t < flowEnd + HOLD ? Math.min(1, (A.t - at) / STEP) : Math.max(0, 1 - (A.t - flowEnd - HOLD) / COOL);
        e.iron.setAlpha(a); }
      for (i = 0; i < A.fresh.length; i++) { var M = A.fresh[i], m = S.spr.molds[A.H.id + '.' + M.id];
        if (A.t >= flowEnd && M.fresh) { M.fresh = false; drawMold(ctx, m); }
        m.hot.setAlpha(A.t < flowEnd ? 0 : Math.max(0, 0.9 - (A.t - flowEnd) / (HOLD + COOL) * 0.9)); }
    }
    if (!A.said && A.t >= flowEnd + 200) { A.said = true;
      ctx.say(K.text(A.fresh.length ? 'd2.forge.filled' : (A.f.molds.length ? 'd2.forge.done' : 'd2.forge.pooled'))); }
    if (A.t >= A.end) { var lv = S.spr && S.spr.levers[A.H.id]; if (lv) setLever(ctx, lv, false);
      for (i = 0; i < A.fresh.length; i++) if (A.fresh[i].fresh) { A.fresh[i].fresh = false; if (S.spr) drawMold(ctx, S.spr.molds[A.H.id + '.' + A.fresh[i].id]); }
      S.anim = null; }
  }
  function turn(ctx, t) {
    var S = ctx.state, K = S.K; if (S.anim) return false;
    var e = S.spr && S.spr.tiles[t.key];
    if (e && S.skinned) skinTile(ctx, e);                                     // the picture as it stands, before the quarter turn
    t.rot = (t.rot + 1) & 3; K.setFlag(ctx, 'rot.' + t.key, t.rot || false);
    if (e && S.skinned) { e.wait = 190;                                       // turn the picture, then settle on the newly lit one
      try { ctx.scene.tweens.add({ targets: [e.tile, e.iron], angle: 90, duration: 170, ease: 'Sine.easeOut' }); } catch (x) { skinTile(ctx, e); } }
    else if (e) { e.ang += 90; try { ctx.scene.tweens.add({ targets: [e.tile, e.iron], angle: e.ang, duration: 170, ease: 'Sine.easeOut' }); } catch (x) { e.tile.setAngle(e.ang); e.iron.setAngle(e.ang); } }
    S.turned = (S.turned || 0) + 1;
    return true;
  }

  D.register('lava-channels', {
    logic: { model: model, flow: flow, solve: solve, openOf: openOf, turn: turn, pour: pour },
    load: function (ctx) { ready(ctx); },
    tick: function (ctx, dt) {
      if (!ready(ctx)) return;
      var S = ctx.state; if (!S.spr) build(ctx);
      S.t += dt; animate(ctx, dt);
      if (S.spr && !S.skinned) skin(ctx);
      if (S.spr && S.skinned) for (var tk in S.spr.tiles) { var e = S.spr.tiles[tk]; if (e.wait > 0) { e.wait -= dt; if (e.wait <= 0) skinTile(ctx, e); } }
      if (S.spr) { var h = ctx.hero(); if (h) for (var k in S.spr.levers) { var lv = S.spr.levers[k], d = (h.footY < lv.y - 6) ? 10.5 : 9.5; if (lv.depth !== d) lv.setDepth(d); } }
    },
    free: function (ctx, wx, wy) {
      if (!ready(ctx)) return undefined;
      return eachHall(ctx.state, function (H) {
        var l = H.lever, i;
        if (l && wx >= l.x * T + 5 && wx < (l.x + 1) * T - 5 && wy >= l.y * T + 5 && wy < (l.y + 1) * T - 3) return false;   // the lever is a solid post
        for (i = 0; i < H.molds.length; i++) { var M = H.molds[i]; if (M.cast && inR(M.zone, wx, wy)) return true; }
      });
    },
    interact: function (ctx, px, footY, best) {
      if (!ready(ctx)) return undefined;
      var S = ctx.state, K = S.K, cand = null, cd = 1e9;
      if (S.anim) return undefined;
      eachHall(S, function (H) {
        var i, d;
        if (H.lever) { var lx = H.lever.x * T + T / 2, ly = H.lever.y * T + T / 2; d = Math.max(Math.abs(px - lx), Math.abs(footY - ly));
          if (d <= T * 1.15) { cd = d - 30; cand = { tx: H.lever.x, ty: H.lever.y, dx: Math.abs(px - lx) >= Math.abs(footY - ly) ? (lx > px ? 1 : -1) : 0, dy: Math.abs(px - lx) >= Math.abs(footY - ly) ? 0 : (ly > footY ? 1 : -1),
            verb: K.text('d2.forge.verb.pour'), act: function () { pour(ctx, H); } }; } }
        for (i = 0; i < H.turn.length; i++) { var t = H.turn[i], cx = (t.x + 1) * T, cy = (t.y + 1) * T; d = Math.max(Math.abs(px - cx), Math.abs(footY - cy));
          if (d <= T + 20 && d < cd) { cd = d; cand = { tx: t.x, ty: t.y, dx: 0, dy: 0, verb: K.text('d2.forge.verb.turn'), act: (function (t) { return function () { turn(ctx, t); }; })(t) }; } }
      });
      if (!cand) return undefined;
      if (best) { var bd = Math.max(Math.abs(px - (best.tx * T + T / 2)), Math.abs(footY - (best.ty * T + T / 2))); if (bd < cd) return undefined; }   // a chest right beside her wins
      return cand;
    }
  });
})();
