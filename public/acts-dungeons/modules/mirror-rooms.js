/* Demon Castle: mirror rooms (mechanic id `mirror-rooms`).

   Plan data (ctx.mechanic, verbatim from plans/dungeons/demonCastle.py):
     rooms  [{id, type A-E, rect:[x0,y0,x1,y1] (the room's inside), doors:{entry:[[x,y]..], exit:[..]}}]
     params {swap:"left-right ...", pitHpCost:0, pitRespawn:"doorway entered by", knightTicksPerTile:2,
             knightTouch:"battle", bossFightControls:"normal"}
   ctx.plan.mech: `mirrorFrame` {cells, room, door} at every doorway, `guard` {waypoints (a loop),
   ticksPerTile} for a castle knight.

   The rule, as the owner reviewed it: inside a mirror room LEFT and RIGHT are swapped (up and down
   are not; the old bundle flipped both, and that is switched off here). "Inside" is her soles on
   the room's polished floor (the plan's rect). So that she is not thrown back out of the doorway
   she is walking through, the swap takes hold (and lets go again on the way out) the next time
   her thumb changes its left/right direction or lifts: she keeps walking the way she was going,
   and every new push after that is mirrored.

   A pit: the painted mask stops her at its lip; this module opens the lip, and the moment her
   soles are over a pit cell she falls, loses nothing, and stands again in the doorway she came in
   by. A knight walks its loop at `ticksPerTile` plan ticks a tile (0.185 s a tick: half her
   speed), ignores the mirror, and touching it starts a battle with a Dark Knight; afterwards it
   is half a loop away (the plan's solver model). The Demon King's fight is the bundle's own.

   What is drawn: at each doorway an ornate mirror on the wall end beside it, a bronze post and
   a shimmering film across the opening; while she is inside, a slow sheen over the room's floor
   and, while her controls are really swapped, a small left-right badge over her head.

   Persistent (story flags): d2.demonCastle.f<n>.door = "<room>:<entry|exit>" while she is inside
   a room (where a fall puts her back), d2.demonCastle.f<n>.clk (the knight's clock),
   d2.demonCastle.told.<what> (each line is said once per save). */
(function () {
  'use strict';
  var D = window.__QOK_DNG2__; if (!D || !D.register) return;
  var T = 48, EDGE = 0.25, LIP = 28, INTO = 4, FALL_MS = 460, RISE_MS = 260, TOUCH = 27;
  function kit() { return window.__QOK_D2KIT_B__; }

  // ---- strings: en, ja (kana, spaced, for ages 6-8) and jaKanji, always all three -------------------
  var STR = {
    'mirror.enter': {
      en: 'The mirror frame shimmers...\nIn this room, left and right are swapped!',
      ja: 'かがみの わくが ゆらめいた…\nこの へやでは みぎと ひだりが いれかわる！',
      jaKanji: '鏡の枠が 揺らめいた…\nこの部屋では 右と左が 入れ替わる！' },
    'mirror.fall': {
      en: 'You tumble into the pit!\n...and find yourself back at the mirror frame, unhurt.',
      ja: 'あなに おちてしまった！\n…きがつくと かがみの わくの まえに もどっていた。けがは ない。',
      jaKanji: '穴に 落ちてしまった！\n…気がつくと 鏡の枠の 前に 戻っていた。怪我は ない。' },
    'mirror.knight': {
      en: 'A castle knight bars your way!',
      ja: 'しろの きしが たちはだかった！',
      jaKanji: '城の騎士が 立ちはだかった！' }
  };
  function text(K, key) { var row = STR[key]; if (!row) return key; return row[K.variant()] || row.en; }

  // ---- pure logic ---------------------------------------------------------------------------------
  function sgn(v) { return v > 0 ? 1 : v < 0 ? -1 : 0; }
  function gcd(a, b) { while (b) { var t = a % b; a = b; b = t; } return a; }
  function ring(g) {                                                          // a loop's cells in walking order
    var w = g.waypoints || [], out = [], i, j;
    for (i = 0; i < w.length; i++) { var a = w[i], b = w[(i + 1) % w.length], dx = sgn(b[0] - a[0]), dy = sgn(b[1] - a[1]), n = Math.abs(b[0] - a[0]) + Math.abs(b[1] - a[1]);
      for (j = 0; j < n; j++) out.push([a[0] + dx * j, a[1] + dy * j]); }
    return out.length ? out : [[g.x, g.y]];
  }
  function model(ctx) {
    var rs = ctx.mechanic.rooms || [], a = ctx.plan.mech || [], rooms = [], frames = [], knights = [], i, per = 1;
    for (i = 0; i < rs.length; i++) { var r = rs[i], q = r.rect, R = { id: r.id, type: r.type, rect: q, px: [q[0] * T, q[1] * T, (q[2] + 1) * T, (q[3] + 1) * T], doors: [] };
      ['entry', 'exit'].forEach(function (n) { var cs = (r.doors || {})[n] || []; if (!cs.length) return;
        var y0 = 1e9, y1 = -1e9, k; for (k = 0; k < cs.length; k++) { y0 = Math.min(y0, cs[k][1]); y1 = Math.max(y1, cs[k][1]); }
        var x = cs[0][0], west = x < q[0];
        // where a fall puts her back: her soles in the middle of the doorway, facing the room
        R.doors.push({ name: n, room: R, x: x, y0: y0, y1: y1, west: west, spot: [(x + 0.5) * T, (y0 + y1 + 1) / 2 * T], dir: west ? 2 : 1 }); });
      rooms.push(R); }
    for (i = 0; i < a.length; i++) {
      if (a[i].kind === 'mirrorFrame') frames.push(a[i]);
      else if (a[i].kind === 'guard') { var rg = ring(a[i]), tpt = a[i].ticksPerTile || (ctx.mechanic.params || {}).knightTicksPerTile || 2;
        knights.push({ id: a[i].id, ring: rg, tpt: tpt, off: a[i].offsetTicks || 0, period: rg.length * tpt }); }
    }
    for (i = 0; i < knights.length; i++) per = per * knights[i].period / gcd(per, knights[i].period);
    return { rooms: rooms, frames: frames, knights: knights, period: per };
  }
  function roomAt(M, sx, sy) { for (var i = 0; i < M.rooms.length; i++) { var p = M.rooms[i].px; if (sx >= p[0] && sx < p[2] && sy >= p[1] && sy < p[3]) return M.rooms[i]; } return null; }
  function doorNear(R, sx, sy) { var best = null, bd = 1e9, i; for (i = 0; i < R.doors.length; i++) { var d = Math.abs(R.doors[i].spot[0] - sx) + Math.abs(R.doors[i].spot[1] - sy); if (d < bd) { bd = d; best = R.doors[i]; } } return best; }
  function doorNamed(M, v) { var p = String(v || '').split(':'), i, j; for (i = 0; i < M.rooms.length; i++) if (String(M.rooms[i].id) === p[0]) for (j = 0; j < M.rooms[i].doors.length; j++) if (M.rooms[i].doors[j].name === p[1]) return M.rooms[i].doors[j]; return null; }
  function mirrored(stick) { return { x: -stick.x, y: stick.y, m: stick.m }; }  // left <-> right only
  function knightAt(k, tick) {                                                // world px of its centre at a (fractional) plan tick, and the way it faces
    var n = k.ring.length, u = (((tick + k.off) / k.tpt) % n + n) % n, i = Math.floor(u), f = u - i, a = k.ring[i], b = k.ring[(i + 1) % n];
    return { x: (a[0] + (b[0] - a[0]) * f + 0.5) * T, y: (a[1] + (b[1] - a[1]) * f + 0.5) * T, dx: b[0] - a[0], dy: b[1] - a[1], cell: a, next: b };
  }
  // Her soles are at a pit's lip: the mask refuses the spot, a pit cell is within LIP px and no wall or pillar is.
  var RING = [[0, 0], [LIP, 0], [-LIP, 0], [0, LIP], [0, -LIP], [20, 20], [-20, 20], [20, -20], [-20, -20]];
  function atLip(ctx, wx, wy) {
    var pit = false, i, c;
    for (i = 0; i < RING.length; i++) { c = ctx.terrain(Math.floor((wx + RING[i][0]) / T), Math.floor((wy + RING[i][1]) / T));
      if (c === '#' || c === 'p') return false; if (c === '_') pit = true; }
    return pit;
  }
  // A doorway lip: the painted post at a doorway ends in a point that the mask draws up to ~22 px INTO the
  // doorway's cells, so a hero walking straight through along either wall stopped dead although the opening
  // beside the point is clear. The spot is a lip when it lies in a doorway's own cells (the first LIPD px from
  // the opening's top or bottom edge, within LIPX px of the doorway's column) and the mask is free again within
  // LIPW px on BOTH sides of it along the row: a point standing in the doorway, not a wall. Rows outside the
  // opening, and everything deeper than LIPD, stay as the mask has them. qok-door-lips = '0' turns this off.
  var LIPD = 28, LIPW = 64, LIPX = 72;
  function zones(M) {
    var out = [], i, j;
    for (i = 0; i < M.rooms.length; i++) for (j = 0; j < M.rooms[i].doors.length; j++) { var d = M.rooms[i].doors[j];
      out.push({ x0: d.x * T - LIPX, x1: (d.x + 1) * T + LIPX, top: d.y0 * T, bot: (d.y1 + 1) * T }); }
    return out;
  }
  function doorLip(ctx, wx, wy) {
    var Z = ctx.state.zones, i, k, l, r;
    for (i = 0; i < Z.length; i++) { var z = Z[i];
      if (wx < z.x0 || wx >= z.x1) continue;
      if (!((wy >= z.top && wy < z.top + LIPD) || (wy >= z.bot - LIPD && wy < z.bot))) continue;
      l = false; r = false;
      for (k = 2; k <= LIPW; k += 2) { if (!l && ctx.maskFree(wx - k, wy)) l = true; if (!r && ctx.maskFree(wx + k, wy)) r = true; if (l && r) return true; }
    }
    return false;
  }
  function lipsOn() { try { return window.localStorage.getItem('qok-door-lips') !== '0'; } catch (e) { return true; } }
  function overPit(ctx, sx, sy) {                                             // her soles are INTO px inside pit cells on every side
    var P = [[0, 0], [INTO, 0], [-INTO, 0], [0, INTO], [0, -INTO]], i;
    for (i = 0; i < P.length; i++) if (ctx.terrain(Math.floor((sx + P[i][0]) / T), Math.floor((sy + P[i][1]) / T)) !== '_') return false;
    return true;
  }

  // ---- state --------------------------------------------------------------------------------------
  function told(ctx, what) { var f = ctx.flags(), k = 'd2.' + ctx.id + '.told.' + what; if (f[k]) return true; f[k] = true; return false; }
  function legacyOff(sc) { try { if (sc.mirrorActive) sc.mirrorActive = false; if (sc.mirrorRoomBounds && sc.mirrorRoomBounds.length) sc.mirrorRoomBounds = [];
    if (sc.mirrorIcon) { sc.mirrorIcon.destroy(); sc.mirrorIcon = undefined; } } catch (e) {} }
  function ready(ctx) {
    var S = ctx.state; if (S.ok) return true;
    var K = kit(); if (!K) return false;
    S.K = K; S.M = model(ctx); S.zones = zones(S.M); S.lips = lipsOn(); S.ms = K.tickMs(ctx.mechanic.params); S.room = undefined; S.door = null; S.swap = false; S.latch = null;
    S.fall = null; S.hold = 0; S.grace = 800; S.busy = false; S.spr = null; S.t = 0; S.falls = 0; S.battles = 0; S.tick = 0;
    if (S.M.knights.length) S.tick = K.clock(ctx, 0, S.M.period, S.ms);
    legacyOff(ctx.scene);
    S.ok = true; return true;
  }
  // Where is she? Called before every move (input) and every frame (tick): the room her soles are in,
  // the door she came in by, and whether the swap applies to the stick as it is held now.
  function locate(ctx, sx, sy, stick) {
    var S = ctx.state, K = S.K, R = roomAt(S.M, sx, sy), held = stick && Math.abs(stick.x) > EDGE ? sgn(stick.x) : 0;
    if (S.room === undefined) {                                               // first look on this visit (also after Continue): no doorway was crossed
      S.room = R; S.latch = null;
      S.door = R ? (doorNamed(S.M, K.getFlag(ctx, 'door')) || doorNear(R, sx, sy)) : null;
      if (R && S.door && S.door.room !== R) S.door = doorNear(R, sx, sy);
      if (R && S.door) K.setFlag(ctx, 'door', R.id + ':' + S.door.name); else K.setFlag(ctx, 'door', false);
    } else if (R !== S.room) {                                                // a doorway was crossed
      S.latch = (held && !S.placed) ? { sign: held, swap: !!S.room } : null;   // she keeps walking the way she was going
      S.room = R; S.placed = false;
      if (R) { S.door = doorNear(R, sx, sy); K.setFlag(ctx, 'door', R.id + ':' + S.door.name); S.entered = (S.entered || 0) + 1;
        if (!told(ctx, 'mirror')) ctx.say(text(K, 'mirror.enter')); }
      else { S.door = null; K.setFlag(ctx, 'door', false); }
    }
    if (S.latch && held !== S.latch.sign) S.latch = null;                     // the thumb lifted or changed sides: the room's rule takes hold
    S.swap = S.latch ? S.latch.swap : !!S.room;
    return S.swap;
  }

  // ---- pictures ------------------------------------------------------------------------------------
  function filmTex(sc, K) {                                                   // the mirror's film seen edge-on: a soft upright blade of light
    return K.canvasTex(sc, 'd2m_film', 40, 64, function (g, w, h) {
      var gr = g.createLinearGradient(0, 0, w, 0);
      gr.addColorStop(0, 'rgba(150,130,255,0)'); gr.addColorStop(0.32, 'rgba(150,140,255,0.16)'); gr.addColorStop(0.46, 'rgba(206,214,255,0.62)');
      gr.addColorStop(0.5, 'rgba(255,255,255,0.95)'); gr.addColorStop(0.54, 'rgba(206,214,255,0.62)'); gr.addColorStop(0.68, 'rgba(150,140,255,0.16)'); gr.addColorStop(1, 'rgba(150,130,255,0)');
      g.fillStyle = gr; g.fillRect(0, 0, w, h);
      var v = g.createLinearGradient(0, 0, 0, h); v.addColorStop(0, 'rgba(0,0,0,1)'); v.addColorStop(0.16, 'rgba(0,0,0,0)'); v.addColorStop(0.9, 'rgba(0,0,0,0)'); v.addColorStop(1, 'rgba(0,0,0,0.8)');
      g.globalCompositeOperation = 'destination-out'; g.fillStyle = v; g.fillRect(0, 0, w, h); g.globalCompositeOperation = 'source-over';
    });
  }
  function sheenTex(sc, K) {                                                  // long soft reflections drifting over a polished floor (tileable)
    return K.canvasTex(sc, 'd2m_sheen', 256, 256, function (g, w, h) {
      var im = g.createImageData(w, h), d = im.data, x, y, i = 0;
      for (y = 0; y < h; y++) for (x = 0; x < w; x++, i += 4) {
        var u = (x + y * 0.5) / w * Math.PI * 2, v = y / h * Math.PI * 2;
        var a = Math.pow(Math.max(0, Math.sin(u * 2 + Math.sin(v) * 0.6)), 6) * 0.75 + Math.pow(Math.max(0, Math.sin(u * 3 + 1.7 + Math.sin(v * 2) * 0.4)), 10) * 0.5;
        d[i] = 214; d[i + 1] = 220; d[i + 2] = 255; d[i + 3] = Math.min(255, a * 255) | 0; }
      g.putImageData(im, 0, 0);
    });
  }
  function badgeTex(sc, K) {                                                  // "left and right are swapped", over her head
    return K.canvasTex(sc, 'd2m_badge', 44, 22, function (g, w, h) {
      function pill(x, y, pw, ph, r) { g.beginPath(); g.moveTo(x + r, y); g.lineTo(x + pw - r, y); g.arc(x + pw - r, y + r, r, -Math.PI / 2, Math.PI / 2); g.lineTo(x + r, y + ph); g.arc(x + r, y + r, r, Math.PI / 2, Math.PI * 1.5); g.closePath(); }
      var gr = g.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, 'rgba(92,70,170,0.95)'); gr.addColorStop(1, 'rgba(38,26,84,0.95)');
      pill(1, 1, w - 2, h - 2, (h - 2) / 2); g.fillStyle = gr; g.fill(); g.lineWidth = 1.5; g.strokeStyle = 'rgba(214,204,255,0.95)'; g.stroke();
      g.fillStyle = '#ffffff'; g.strokeStyle = '#ffffff'; g.lineWidth = 2.4; g.lineCap = 'round';
      g.beginPath(); g.moveTo(12, 8); g.lineTo(31, 8); g.stroke(); g.beginPath(); g.moveTo(34, 8); g.lineTo(28, 4.2); g.lineTo(28, 11.8); g.closePath(); g.fill();
      g.beginPath(); g.moveTo(32, 14); g.lineTo(13, 14); g.stroke(); g.beginPath(); g.moveTo(10, 14); g.lineTo(16, 10.2); g.lineTo(16, 17.8); g.closePath(); g.fill();
    });
  }
  // Day 4 (DC-05): the swap badge is a status of her CONTROLS, so it sits with the controls, beside the stick (the
  // outer end of the stick's top edge, level with the prompt pill and clear of it), and no longer floats over her
  // head where it covered what stood behind it (a chest, on 4F). Same picture, same fade, shown exactly while the
  // old badge was (its alpha is still kept on spr.badge, which is not drawn). 'qok-d4-looks' = '0': over her head.
  var LOOKS = (function () { try { return window.localStorage.getItem('qok-d4-looks') !== '0'; } catch (e) { return true; } })();
  var chipEl = null;
  function chipDrop() { if (chipEl) { try { chipEl.parentNode.removeChild(chipEl); } catch (e) {} chipEl = null; } }
  function chipMake(sc, K) {
    if (typeof document === 'undefined') return null;
    chipDrop();
    try {
      var src = sc.textures.get(badgeTex(sc, K)).getSourceImage(), c = document.createElement('canvas'); c.id = 'd2mSwapChip'; c.width = 132; c.height = 66;
      var g = c.getContext('2d'); g.imageSmoothingEnabled = true; g.drawImage(src, 0, 0, 44, 22, 0, 0, 132, 66);
      c.style.cssText = 'position:fixed;left:0;top:0;width:60px;height:30px;opacity:0;pointer-events:none;z-index:5;filter:drop-shadow(0 0 5px rgba(0,0,0,.55));';
      c.setAttribute('aria-hidden', 'true');
      (document.getElementById('touch-controls') || document.body).appendChild(c); chipEl = c;
    } catch (e) { chipEl = null; }
    return chipEl;
  }
  function chipPlace() {                                                      // above the stick, at the end of it that is nearer the screen's edge
    if (!chipEl) return;
    try { var d = document.getElementById('dpad'), r = d && d.getBoundingClientRect(), vw = window.innerWidth || 390, x, y;
      if (r && r.width > 20) { x = (r.left + r.width / 2 > vw / 2) ? r.right - 60 : r.left; y = r.top - 30 - 10; }
      else { x = vw - 60 - 20; y = (window.innerHeight || 844) - 300; }
      chipEl.style.left = Math.round(x) + 'px'; chipEl.style.top = Math.round(y) + 'px'; } catch (e) {}
  }
  function fallbackKnight(sc, K) {                                            // only if the Dark Knight's picture cannot be had
    return K.canvasTex(sc, 'd2m_knight', 40, 56, function (g) {
      g.fillStyle = '#16121e'; g.fillRect(8, 14, 24, 34); g.fillStyle = '#4a4660'; g.fillRect(10, 16, 20, 30);
      g.fillStyle = '#16121e'; g.fillRect(11, 2, 18, 16); g.fillStyle = '#6c6884'; g.fillRect(13, 4, 14, 12);
      g.fillStyle = '#d83a54'; g.fillRect(14, 9, 12, 2); g.fillStyle = '#16121e'; g.fillRect(11, 48, 7, 8); g.fillRect(22, 48, 7, 8);
    });
  }
  function monsterObj(id) {                                                   // the bundle's own monster record (its picture key), without touching the encounter counter
    var gs = window.__GAME_STATE__, em = gs && gs.encounterManager, m = null;
    if (!em || typeof em.rollEncounter !== 'function') return null;
    var steps = em.stepsSinceLastEncounter, w = console.warn; console.warn = function () {};
    try { m = em.rollEncounter({ monsters: [{ monsterId: id, weight: 1 }] }); } catch (e) { m = null; } finally { console.warn = w; }
    em.stepsSinceLastEncounter = steps;
    return m;
  }
  function build(ctx) {
    var S = ctx.state, K = S.K, sc = ctx.scene, M = S.M, i;
    var km = K.art(sc, 'mirror'), kp = K.art(sc, 'mirror-post'); if (!km || !kp) return;
    if (M.knights.length && S.kmon === undefined) S.kmon = monsterObj('darkKnight');
    var kk = null;
    if (M.knights.length) { kk = K.monsterTex(sc, S.kmon); if (!kk) { S.waited = (S.waited || 0) + 1; if (S.kmon && S.waited < 180) return; kk = fallbackKnight(sc, K); } }
    var spr = { frames: [], rooms: {}, knights: {}, badge: null };
    for (i = 0; i < M.frames.length; i++) { var f = M.frames[i], y0 = 1e9, y1 = -1e9, k;
      for (k = 0; k < f.cells.length; k++) { y0 = Math.min(y0, f.cells[k][1]); y1 = Math.max(y1, f.cells[k][1]); }
      var cx = (f.x + 0.5) * T, top = y0 * T, bot = (y1 + 1) * T, e = { cx: cx, top: top, bot: bot };
      e.mirror = ctx.own(sc.add.image(cx, top + 5, km).setOrigin(0.5, 1).setDepth(9.3).setScale(0.86));   // on the wall end over the doorway
      e.glint = ctx.own(sc.add.image(cx, top - 34, filmTex(sc, K)).setOrigin(0.5, 0.5).setDepth(9.35).setScale(0.5, 0.56).setAlpha(0)); try { e.glint.setBlendMode(1); } catch (x) {}
      e.film = ctx.own(sc.add.image(cx, bot - 2, filmTex(sc, K)).setOrigin(0.5, 1).setDepth(10.55)); e.film.setDisplaySize(34, bot - top + 8); try { e.film.setBlendMode(1); } catch (x) {}
      e.south = ctx.own(sc.add.image(cx, bot + 2, kp).setOrigin(0.5, 1).setDepth(10.5)); e.south.setDisplaySize(13, 58);
      e.shade = ctx.own(sc.add.ellipse(cx + 3, bot + 1, 22, 8, 0x000000, 0.34).setDepth(ctx.depth.ground + 0.45));
      spr.frames.push(e); }
    for (i = 0; i < M.rooms.length; i++) { var p = M.rooms[i].px, sh = ctx.own(sc.add.tileSprite(p[0], p[1], p[2] - p[0], p[3] - p[1], sheenTex(sc, K)).setOrigin(0, 0).setDepth(ctx.depth.ground + 0.4).setAlpha(0));
      try { sh.setBlendMode(1); sh.setTint(0xb4a8ff); } catch (x) {}
      spr.rooms[M.rooms[i].id] = { sheen: sh, a: 0 }; }
    for (i = 0; i < M.knights.length; i++) { var body = ctx.own(sc.add.image(0, 0, kk).setOrigin(0.5, 0.92)), s0 = 66 / Math.max(1, body.height || 66); body.setScale(s0);
      spr.knights[M.knights[i].id] = { body: body, scale: s0, shadow: ctx.own(sc.add.ellipse(0, 0, 36, 12, 0x000000, 0.32).setDepth(ctx.depth.object)) }; }
    spr.badge = ctx.own(sc.add.image(0, 0, badgeTex(sc, K)).setOrigin(0.5, 1).setDepth(60).setAlpha(0));
    if (LOOKS && chipMake(sc, K)) { spr.badge.setVisible(false); spr.chip = chipEl; S.chipAt = -1e9; }
    S.spr = spr;
  }
  function paint(ctx, dt) {
    var S = ctx.state, K = S.K, M = S.M, h = ctx.hero(), i;
    if (!S.spr) { build(ctx); if (!S.spr) return; }
    var sp = S.spr, w = S.t / 1000;
    for (i = 0; i < sp.frames.length; i++) { var e = sp.frames[i], ph = w * 2.1 + i * 1.3;
      e.film.setAlpha(0.50 + 0.22 * Math.sin(ph) + 0.10 * Math.sin(ph * 2.7 + 1));
      e.glint.setAlpha(Math.max(0, Math.sin(w * 0.9 + i * 2.1)) * 0.55); e.glint.x = e.cx - 9 + 18 * ((w * 0.18 + i * 0.37) % 1);
      if (h) e.south.setDepth(h.footY < e.bot - 2 ? 10.5 : 9.5); }
    for (i = 0; i < M.rooms.length; i++) { var r = sp.rooms[M.rooms[i].id], want = (S.room === M.rooms[i]) ? 0.115 + 0.03 * Math.sin(w * 1.7) : 0;
      r.a += (want - r.a) * Math.min(1, dt / 220); if (r.a < 0.004 && !want) r.a = 0;
      r.sheen.setAlpha(r.a); if (r.a > 0) { r.sheen.tilePositionX = -w * 22; r.sheen.tilePositionY = w * 5; } }
    for (i = 0; i < M.knights.length; i++) { var k = M.knights[i], q = knightAt(k, S.tick), o = sp.knights[k.id];
      var bob = Math.abs(Math.sin(S.tick / k.tpt * Math.PI)) * 3;
      o.body.setPosition(q.x, q.y + 17 - bob); o.shadow.setPosition(q.x, q.y + 16); o.body.setDepth(K.sortDepth(ctx, q.y + 17));
      if (q.dx) o.body.setFlipX(q.dx < 0); }
    if (sp.badge) { var on = S.swap && !S.fall && h, a = sp.badge.alpha + ((on ? 1 : 0) - sp.badge.alpha) * Math.min(1, dt / 140);
      sp.badge.setAlpha(a < 0.01 ? 0 : a); if (h) sp.badge.setPosition(h.x, h.y - 34 - 2 * Math.sin(w * 4));
      if (sp.chip && sp.chip === chipEl) { if (a >= 0.01 && S.t - S.chipAt > 400) { S.chipAt = S.t; chipPlace(); }
        var op = (a < 0.01 ? 0 : a).toFixed(2); if (chipEl.__op !== op) { chipEl.__op = op; chipEl.style.opacity = op; } } }
  }

  // ---- the fall -------------------------------------------------------------------------------------
  function startFall(ctx, s) {
    var S = ctx.state, K = S.K, sc = ctx.scene, hero = sc.hero, door = S.door || (S.room && doorNear(S.room, s.x, s.y));
    if (!door) { var R = null, bd = 1e9, i; for (i = 0; i < S.M.rooms.length; i++) { var d = doorNear(S.M.rooms[i], s.x, s.y), dd = d ? Math.abs(d.spot[0] - s.x) + Math.abs(d.spot[1] - s.y) : 1e9; if (dd < bd) { bd = dd; R = d; } } door = R; }
    if (!door) return;
    var cx = (Math.floor(s.x / T) + 0.5) * T, cy = (Math.floor(s.y / T) + 0.5) * T;
    S.fall = { t: 0, phase: 0, door: door, x0: s.x, y0: s.y, x1: s.x + (cx - s.x) * 0.6, y1: s.y + (cy - s.y) * 0.6 + 8,
      sx: hero ? hero.scaleX : 1, sy: hero ? hero.scaleY : 1 };
    S.falls++; S.latch = null;
    try { sc.cameras.main.shake(140, 0.004); } catch (e) {}
  }
  function fallTick(ctx, dt) {
    var S = ctx.state, K = S.K, F = S.fall, sc = ctx.scene, hero = sc.hero; if (!F) return;
    F.t += dt;
    if (F.phase === 0) {
      var u = Math.min(1, F.t / FALL_MS), e = u * u;
      K.placeSoles(ctx, F.x0 + (F.x1 - F.x0) * u, F.y0 + (F.y1 - F.y0) * e);
      if (hero) { try { hero.setAlpha(1 - e); hero.setScale(F.sx * (1 - 0.55 * e), F.sy * (1 - 0.55 * e)); } catch (x) {} }
      if (u >= 1) {                                                           // back in the doorway she came in by, nothing lost
        F.phase = 1; F.t = 0; S.placed = true;
        if (hero) { try { hero.setScale(F.sx, F.sy); hero.setAlpha(0); } catch (x) {} }   // her own size first: her soles are measured from it
        K.placeSoles(ctx, F.door.spot[0], F.door.spot[1], F.door.dir);
        try { sc.cameras.main.flash(220, 190, 180, 255); } catch (x) {}
      }
    } else {
      var v = Math.min(1, F.t / RISE_MS);
      if (hero) { try { hero.setAlpha(v); } catch (x) {} }
      if (v >= 1) { if (hero) { try { hero.setAlpha(1); hero.setScale(F.sx, F.sy); } catch (x) {} }
        S.fall = null; S.hold = 120;
        if (!told(ctx, 'fall')) ctx.say(text(K, 'mirror.fall')); }
    }
  }

  // ---- the knight ------------------------------------------------------------------------------------
  function caught(ctx, k) {
    var S = ctx.state, K = S.K, sc = ctx.scene;
    S.busy = true; S.battles++;
    var after = function () {                                                 // the field is back (won or fled): the knight is half a loop away
      S.busy = false; S.grace = 1500;
      if (S.clk !== undefined) { var per = S.M.period * S.ms; S.clk = (S.clk + (k.period * S.ms) / 2) % per; S.tick = K.clock(ctx, 0, S.M.period, S.ms); } };
    // she is held (input) from the touch on; the battle is the bundle's own start, with its Dark Knight
    var go = function () { if (!ctx.battle('darkKnight', after)) after(); };
    var first = !told(ctx, 'knight');
    try { if (first) ctx.say(text(K, 'mirror.knight')); sc.time.delayedCall(first ? 520 : 120, go); } catch (e) { go(); }
  }

  D.register('mirror-rooms', {
    logic: { model: model, ring: ring, roomAt: roomAt, knightAt: knightAt, mirrored: mirrored, atLip: atLip, doorLip: doorLip, overPit: overPit, STR: STR },
    load: function (ctx) { ready(ctx); },
    unload: function (ctx) { var S = ctx.state, hero = ctx.scene && ctx.scene.hero;      // never leave her faded or small
      if (S.fall && hero) { try { hero.setAlpha(1); hero.setScale(S.fall.sx, S.fall.sy); } catch (e) {} } S.fall = null; chipDrop(); },
    input: function (ctx, stick, px, py) {
      if (!ready(ctx)) return undefined;
      var S = ctx.state;
      if (S.fall || S.busy || S.hold > 0) return null;                        // held while she falls, stands up, or a knight has her
      var swap = locate(ctx, px, py + D.footDy(), stick);
      return (stick && swap) ? mirrored(stick) : undefined;
    },
    free: function (ctx, wx, wy) {
      if (!ready(ctx)) return undefined;
      if (ctx.maskFree(wx, wy)) return undefined;
      if (atLip(ctx, wx, wy)) return true;                                    // the lip of a pit is hers to step off
      return (ctx.state.lips && doorLip(ctx, wx, wy)) ? true : undefined;     // the point of a doorway's post is not a wall
    },
    step: function (ctx) { if (!ready(ctx)) return undefined; var S = ctx.state; return (S.fall || S.busy) ? false : undefined; },
    tick: function (ctx, dt) {
      if (!ready(ctx)) return;
      var S = ctx.state, K = S.K, M = S.M;
      S.t += dt; legacyOff(ctx.scene);
      if (M.knights.length && !S.busy) S.tick = K.clock(ctx, dt, M.period, S.ms);
      if (S.hold > 0) S.hold -= dt;
      if (S.fall) fallTick(ctx, dt);
      var s = K.soles(ctx);
      if (s && !S.fall && !S.busy && !ctx.inBattle() && !ctx.scene.showingMessage && overPit(ctx, s.x, s.y)) startFall(ctx, s);
      paint(ctx, dt);
      if (S.grace > 0) { S.grace -= dt; return; }
      if (S.busy || S.fall || !s || !K.onField(ctx)) return;
      for (var i = 0; i < M.knights.length; i++) { var q = knightAt(M.knights[i], S.tick);
        if (Math.abs(q.x - s.x) < TOUCH && Math.abs(q.y + 6 - s.y) < TOUCH) { caught(ctx, M.knights[i]); break; } }
    }
  });
})();
