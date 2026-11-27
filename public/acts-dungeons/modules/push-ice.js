/* Frostfall Cavern: push the ice blocks (mechanic id `push-ice`).

   A puzzle chamber is a grid of 2x2-tile cells of ice floor between the door pad and a water
   gap. Ice blocks (one cell each) are pushed by walking against the side opposite the push and
   keeping the stick there for a moment; a block slides until a stop crystal, the chamber wall or
   another block stops it. Slid off the far column on the slipway row it drops into the water
   and freezes into a bridge cell, for good; when the gap is full, later blocks stop at the edge
   (blocks cannot leave the chamber). The frost bell by the door forms every block again at its
   starting place; bridges stay.

   The rules are the plan solver's own (dungeons/frostfallCavern.py puzzle_succ), so its "no
   soft-lock" proof holds: a block is only pushed from a cell inside the chamber or from the pad,
   never from the bridge, and the bell re-forms sunk blocks too.
   Persistent: `blk.<room>` = "i,j|i,j|x" (x = in the water), `fill.<room>` = bridge cells cast. */
(function () {
  'use strict';
  var D = window.__QOK_DNG2__; if (!D || !D.register) return;
  var T = 48, C = 96, MX = 12, MN = 8, MS = 14, LAT = 10, EXT = 30, HOLD = 230;   // px / ms
  function kit() { return window.__QOK_D2KIT_B__; }

  // ---- pure logic ---------------------------------------------------------------------------------
  function model(ctx) {
    var rooms = [], rs = ctx.mechanic.rooms || [], a = ctx.plan.mech || [], i, j;
    for (i = 0; i < rs.length; i++) { var r = rs[i], R = { id: r.room, gw: r.grid[0], gh: r.grid[1], ox: r.origin[0], oy: r.origin[1], sx: r.mirrored ? -1 : 1,
        row: r.slipwayRow, need: r.waterCellsToFill, start: r.blocks.map(function (b) { return [b[0], b[1]]; }), blocks: [], fill: 0, crystal: {}, bell: null, water: r.water };
      for (j = 0; j < r.crystals.length; j++) R.crystal[r.crystals[j][0] + ',' + r.crystals[j][1]] = 1;
      R.blocks = R.start.map(function (b) { return [b[0], b[1]]; });
      for (j = 0; j < a.length; j++) if (a[j].kind === 'resetBell' && a[j].room === r.room) R.bell = { x: a[j].x, y: a[j].y };
      rooms.push(R); }
    return rooms;
  }
  function cellPx(R, i, j) { return [(R.ox + R.sx * 2 * i) * T, (R.oy + 2 * j) * T]; }       // top-left px of a puzzle cell (also valid for i = gw, gw+1: the water)
  function blockAt(R, i, j, skip) { for (var k = 0; k < R.blocks.length; k++) if (k !== skip && R.blocks[k] && R.blocks[k][0] === i && R.blocks[k][1] === j) return k; return -1; }
  // push block k one way (LOCAL dx: +1 is toward the water): {moved, to:[i,j], sunk, cells}
  function push(R, k, dx, dy) {
    var b = R.blocks[k]; if (!b) return { moved: false };
    var bi = b[0] - dx, bj = b[1] - dy;                                     // the cell she pushes from
    if (bi >= R.gw || bj < 0 || bj >= R.gh || bi < -1) return { moved: false, why: 'behind' };
    if (bi >= 0 && (R.crystal[bi + ',' + bj] || blockAt(R, bi, bj, k) >= 0)) return { moved: false, why: 'behind' };
    var c = [b[0], b[1]], n = 0, sunk = false;
    for (;;) { var qi = c[0] + dx, qj = c[1] + dy;
      if (qi === R.gw && dx === 1 && qj === R.row && R.fill < R.need) { sunk = true; break; }
      if (qi < 0 || qi >= R.gw || qj < 0 || qj >= R.gh || R.crystal[qi + ',' + qj] || blockAt(R, qi, qj, k) >= 0) break;
      c = [qi, qj]; n++; }
    if (!sunk && n === 0) return { moved: false, why: 'stopped' };
    var from = [b[0], b[1]];
    if (sunk) { R.blocks[k] = null; R.fill++; return { moved: true, sunk: true, from: from, to: [R.gw + R.fill - 1, R.row], cells: n + R.fill }; }
    R.blocks[k] = c; return { moved: true, sunk: false, from: from, to: c, cells: n };
  }
  function bell(R) {                                                          // every block forms again at its start; bridges stay
    var same = R.blocks.length === R.start.length && R.blocks.every(function (b, i) { return b && b[0] === R.start[i][0] && b[1] === R.start[i][1]; });
    R.blocks = R.start.map(function (b) { return [b[0], b[1]]; });
    return !same;
  }
  function pack(R) { return R.blocks.map(function (b) { return b ? b[0] + ',' + b[1] : 'x'; }).join('|'); }
  function unpack(R, s) {
    if (typeof s !== 'string') return; var p = s.split('|'); if (p.length !== R.start.length) return;
    R.blocks = p.map(function (q) { if (q === 'x') return null; var v = q.split(','); return [+v[0], +v[1]]; });
  }
  function bridgeZone(R) {                                                    // px rect her soles may use on the frozen cells, or null
    if (!R.fill) return null;
    var a = cellPx(R, R.gw, R.row), b = cellPx(R, R.gw + R.fill - 1, R.row), full = R.fill >= R.need;
    var x0 = Math.min(a[0], b[0]), x1 = Math.max(a[0], b[0]) + C, y0 = a[1], y1 = a[1] + C;
    var west = R.sx > 0 ? EXT : (full ? EXT : -MN), east = R.sx > 0 ? (full ? EXT : -MN) : EXT;   // reach into the chamber, and into the far bank once complete
    return [x0 - west, y0 + LAT, x1 + east, y1 - LAT];
  }
  function solidRect(R, b) { var p = cellPx(R, b[0], b[1]); return [p[0] - MX, p[1] - MN, p[0] + C + MX, p[1] + C + MS]; }   // where her soles may not be

  // ---- state --------------------------------------------------------------------------------------
  function ready(ctx) {
    var S = ctx.state; if (S.ok) return true;
    var K = kit(); if (!K) return false;
    S.K = K; S.rooms = model(ctx); S.spr = null; S.busy = 0; S.hold = null;
    for (var i = 0; i < S.rooms.length; i++) { var R = S.rooms[i]; unpack(R, K.getFlag(ctx, 'blk.' + R.id)); R.fill = Math.min(R.need, +K.getFlag(ctx, 'fill.' + R.id) || 0); }
    S.ok = true; return true;
  }
  function store(ctx, R) {
    var K = ctx.state.K, same = pack(R) === R.start.map(function (b) { return b[0] + ',' + b[1]; }).join('|');
    K.setFlag(ctx, 'blk.' + R.id, same ? false : pack(R)); K.setFlag(ctx, 'fill.' + R.id, R.fill || false);
  }
  function inR(r, x, y) { return x >= r[0] && x < r[2] && y >= r[1] && y < r[3]; }

  // ---- pictures ------------------------------------------------------------------------------------
  function bellTex(sc, K) {
    return K.canvasTex(sc, 'd2b_bell', 48, 64, function (g) {
      g.fillStyle = 'rgba(0,0,0,0.25)'; g.beginPath(); g.ellipse(24, 58, 17, 5, 0, 0, Math.PI * 2); g.fill();
      g.fillStyle = '#31425e'; g.fillRect(6, 8, 5, 50); g.fillRect(37, 8, 5, 50); g.fillRect(4, 4, 40, 7);
      g.fillStyle = '#7f9cc4'; g.fillRect(7, 9, 2, 48); g.fillRect(38, 9, 2, 48); g.fillRect(5, 5, 38, 2);
      g.fillStyle = '#1f2c44'; g.fillRect(22, 10, 4, 6);
      g.fillStyle = '#5d86bf'; g.beginPath(); g.moveTo(14, 42); g.quadraticCurveTo(14, 16, 24, 15); g.quadraticCurveTo(34, 16, 34, 42); g.lineTo(37, 46); g.lineTo(11, 46); g.closePath(); g.fill();
      g.fillStyle = '#b9dcff'; g.fillRect(17, 22, 3, 16); g.fillStyle = '#e9f6ff'; g.fillRect(17, 22, 2, 6);
      g.fillStyle = '#31425e'; g.fillRect(11, 44, 26, 3); g.fillStyle = '#dff1ff'; g.beginPath(); g.arc(24, 50, 3.5, 0, Math.PI * 2); g.fill();
    });
  }
  // Day 4 (DC-10): the block's picture is a boulder on a floor plinth a little wider than its cell. Sorted as one
  // picture, the plinth's rim hid her right half when she stood beside the block to push it. The plinth lies on
  // the floor, so the whole picture is now drawn once under her (`.under`), and only the boulder (the picture
  // without the plinth's rim: BOULDER, texture px) keeps the old in-front / behind sorting.
  // localStorage 'qok-d4-looks' = '0': one picture, sorted whole, as before.
  var LOOKS = (function () { try { return window.localStorage.getItem('qok-d4-looks') !== '0'; } catch (e) { return true; } })();
  var BOULDER = [15, 0, 82, 90];                                             // x, y, w, h of the boulder inside the 112 x 108 picture
  function both(e) { return e.under ? [e, e.under] : [e]; }
  function build(ctx) {
    var S = ctx.state, K = S.K, sc = ctx.scene, kb = K.art(sc, 'ice-block'), kr = K.art(sc, 'ice-bridge'); if (!kb || !kr) return;
    S.spr = { blk: {}, br: {}, bell: {}, kb: kb, kr: kr };
    for (var i = 0; i < S.rooms.length; i++) { var R = S.rooms[i], j;
      for (j = 0; j < R.blocks.length; j++) { var top = S.spr.blk[R.id + '.' + j] = ctx.own(sc.add.image(0, 0, kb).setOrigin(0.5, 1).setVisible(false));
        if (LOOKS) { top.under = ctx.own(sc.add.image(0, 0, kb).setOrigin(0.5, 1).setDepth(ctx.depth.ground + 0.5).setVisible(false)); try { top.setCrop(BOULDER[0], BOULDER[1], BOULDER[2], BOULDER[3]); } catch (x) {} } }
      for (j = 0; j < R.need; j++) { var p = cellPx(R, R.gw + j, R.row);
        S.spr.br[R.id + '.' + j] = ctx.own(sc.add.image(p[0] + C / 2, p[1] + C / 2, kr).setDisplaySize(C + 2, C + 2).setDepth(ctx.depth.ground + 0.2).setVisible(j < R.fill)); }
      if (R.bell) S.spr.bell[R.id] = ctx.own(sc.add.image(R.bell.x * T + T / 2, R.bell.y * T + T - 2, bellTex(sc, K)).setOrigin(0.5, 1));
      sync(ctx, R); }
  }
  function sync(ctx, R) {                                                     // sprites to the model (no animation)
    var S = ctx.state; if (!S.spr) return;
    for (var j = 0; j < R.blocks.length; j++) { var e = S.spr.blk[R.id + '.' + j], b = R.blocks[j];
      if (!b) { e.setVisible(false); if (e.under) e.under.setVisible(false); continue; } var p = cellPx(R, b[0], b[1]); e.setPosition(p[0] + C / 2, p[1] + C + 6).setVisible(true).setAlpha(1);
      if (e.under) e.under.setPosition(e.x, e.y).setVisible(true).setAlpha(1); }
    for (j = 0; j < R.need; j++) S.spr.br[R.id + '.' + j].setVisible(j < R.fill);
  }
  function slide(ctx, R, k, res) {
    var S = ctx.state, e = S.spr && S.spr.blk[R.id + '.' + k], p = cellPx(R, res.to[0], res.to[1]), ms = Math.min(520, 90 + res.cells * 70);
    S.busy = ms + 60;
    if (!e) return;
    var done = function () { if (res.sunk) { e.setVisible(false); if (e.under) e.under.setVisible(false); var br = S.spr.br[R.id + '.' + (R.fill - 1)]; if (br) { br.setVisible(true).setAlpha(0.2);
        try { ctx.scene.tweens.add({ targets: br, alpha: 1, duration: 260 }); } catch (x) { br.setAlpha(1); } } } };
    try { ctx.scene.tweens.add({ targets: both(e), x: p[0] + C / 2, y: p[1] + C + 6, duration: ms, ease: 'Sine.easeOut', onComplete: done }); }
    catch (x) { e.setPosition(p[0] + C / 2, p[1] + C + 6); if (e.under) e.under.setPosition(e.x, e.y); done(); }
  }

  // Which block is she leaning on, and which way? The sole point sits just outside the block's
  // solid rect on one side, within the span of that side, and the stick points into it.
  function leaning(S, stick, sx, sy) {
    if (!stick || !(stick.m === undefined || stick.m > 0.3)) return null;
    var ax = Math.abs(stick.x), ay = Math.abs(stick.y); if (Math.max(ax, ay) < 0.55) return null;
    var dxw = ax >= ay ? (stick.x > 0 ? 1 : -1) : 0, dyw = ax >= ay ? 0 : (stick.y > 0 ? 1 : -1);
    for (var i = 0; i < S.rooms.length; i++) { var R = S.rooms[i];
      for (var k = 0; k < R.blocks.length; k++) { var b = R.blocks[k]; if (!b) continue;
        var r = solidRect(R, b), g = 7, hit = false;
        if (dxw > 0) hit = sx >= r[0] - g && sx < r[0] + 4 && sy > r[1] + 6 && sy < r[3] - 6;
        else if (dxw < 0) hit = sx <= r[2] + g && sx > r[2] - 4 && sy > r[1] + 6 && sy < r[3] - 6;
        else if (dyw > 0) hit = sy >= r[1] - g && sy < r[1] + 4 && sx > r[0] + 6 && sx < r[2] - 6;
        else hit = sy <= r[3] + g && sy > r[3] - 4 && sx > r[0] + 6 && sx < r[2] - 6;
        if (hit) return { R: R, k: k, dx: dxw * R.sx, dy: dyw, key: R.id + '.' + k + '.' + dxw + '.' + dyw }; } }
    return null;
  }
  function doPush(ctx, L) {
    var S = ctx.state, K = S.K, res = push(L.R, L.k, L.dx, L.dy);
    S.last = res; if (!res.moved) return res;
    S.pushes = (S.pushes || 0) + 1; store(ctx, L.R); slide(ctx, L.R, L.k, res);
    if (res.sunk && !K.getFlag(ctx, 'told.bridge')) { K.setFlag(ctx, 'told.bridge', true); S.sayAt = S.busy; }
    return res;
  }
  function ring(ctx, R) {
    var S = ctx.state, K = S.K, changed = bell(R); store(ctx, R); sync(ctx, R); S.rings = (S.rings || 0) + 1;
    if (changed && S.spr) for (var j = 0; j < R.blocks.length; j++) { var e = S.spr.blk[R.id + '.' + j]; e.setAlpha(0.15); if (e.under) e.under.setAlpha(0.15); try { ctx.scene.tweens.add({ targets: both(e), alpha: 1, duration: 420 }); } catch (x) { e.setAlpha(1); if (e.under) e.under.setAlpha(1); } }
    var bs = S.spr && S.spr.bell[R.id]; if (bs) { try { ctx.scene.tweens.add({ targets: bs, angle: 9, duration: 90, yoyo: true, repeat: 3 }); } catch (x) {} }
    ctx.say(K.text(changed ? 'd2.ice.bell' : 'd2.ice.bellIdle'));
  }

  D.register('push-ice', {
    logic: { model: model, push: push, bell: bell, pack: pack, cellPx: cellPx, bridgeZone: bridgeZone, solidRect: solidRect, leaning: leaning },
    load: function (ctx) { ready(ctx); },
    tick: function (ctx, dt) {
      if (!ready(ctx)) return;
      var S = ctx.state, K = S.K; if (!S.spr) build(ctx);
      if (S.busy > 0) { S.busy -= dt; if (S.sayAt !== undefined && S.busy <= 0) { S.sayAt = undefined; ctx.say(K.text('d2.ice.bridge')); } }
      if (S.spr) { var h = ctx.hero(); if (!h) return; var k, e;
        for (k in S.spr.blk) { e = S.spr.blk[k]; if (e.visible) { var d = h.footY < e.y - 12 ? 10.5 : 9.5; if (e.depth !== d) e.setDepth(d); } }
        for (k in S.spr.bell) { e = S.spr.bell[k]; var d2 = h.footY < e.y - 6 ? 10.5 : 9.5; if (e.depth !== d2) e.setDepth(d2); } }
    },
    input: function (ctx, stick, px, py) {                                    // leaning on a block for HOLD ms pushes it
      if (!ready(ctx)) return undefined;
      var S = ctx.state, h = ctx.hero(); if (!h || S.busy > 0) { S.hold = null; return undefined; }
      var L = leaning(S, stick, px, py + (h.footY - h.y)), now = Date.now();
      if (!L) { S.hold = null; return undefined; }
      if (!S.hold || S.hold.key !== L.key) { S.hold = { key: L.key, t: now }; return undefined; }
      if (now - S.hold.t >= HOLD) { S.hold = null; doPush(ctx, L); }
      return undefined;
    },
    free: function (ctx, wx, wy) {
      if (!ready(ctx)) return undefined;
      var S = ctx.state, i, k, open;
      for (i = 0; i < S.rooms.length; i++) { var R = S.rooms[i];
        for (k = 0; k < R.blocks.length; k++) if (R.blocks[k] && inR(solidRect(R, R.blocks[k]), wx, wy)) return false;
        if (R.bell && wx >= R.bell.x * T + 5 && wx < (R.bell.x + 1) * T - 5 && wy >= R.bell.y * T + 5 && wy < (R.bell.y + 1) * T - 3) return false;
        var z = bridgeZone(R); if (z && inR(z, wx, wy)) open = true; }
      return open ? true : undefined;
    },
    interact: function (ctx, px, footY, best) {
      if (!ready(ctx)) return undefined;
      var S = ctx.state, K = S.K; if (S.busy > 0) return undefined;
      for (var i = 0; i < S.rooms.length; i++) { var R = S.rooms[i], b = R.bell; if (!b) continue;
        var bx = b.x * T + T / 2, by = b.y * T + T / 2, dx = bx - px, dy = by - footY;
        if (Math.max(Math.abs(dx), Math.abs(dy)) <= T * 1.2) return { tx: b.x, ty: b.y, dx: Math.abs(dx) >= Math.abs(dy) ? (dx > 0 ? 1 : -1) : 0, dy: Math.abs(dx) >= Math.abs(dy) ? 0 : (dy > 0 ? 1 : -1),
          verb: K.text('d2.ice.verb.ring'), act: (function (R) { return function () { ring(ctx, R); }; })(R) }; }
      return undefined;
    }
  });
})();
