// ACTS 2-5 OVERWORLD AND TOWN RUNTIME. ON by default.
//
// Design: docs/plans/2026-11-13-acts2-5-runtime.md (and the prototype study it grew from,
// docs/plans/2026-10-28-acts2-5-runtime-wiring.md on branch acts2-5-world-wip).
//
// DEBUG KILL SWITCH: localStorage['qok-multiact-hifi'] = '0' (or ?multiact=0). The script then
// returns on its first line: no global is defined, and every hook dq-tiles.js and
// act1-hifi/adapter.js would call is undefined, so both run exactly as they did before this file.
//
// What it does, generalising Act 1's three pieces to the other four acts:
//   1. ART      A camera window of 16-cell chunks per act (format flattened-ground-v0: opaque
//               ground, sparse front, sparse half-res crest frames), one chunk budget for the
//               whole world shared with Act 1, a coarse underpaint under chunks still loading,
//               the act's own landmark sprites, and nothing held while off the overworld.
//   2. TERRAIN  Each act's QOKF8COL pixel pack answers the hero's sole disc (the test Act 1's
//               forest bits answer, closing radius and glide normal included), and a cell plate is
//               written into mapData for the engine. Under act art the pack is the only authority.
//   3. DOORS    The owner's door cells fire the bundle's own destinations; the bundle's frozen
//               doors for those destinations are switched off; interiors return to the owner's
//               exit cells; the compass points at the owner's cells; encounter zones follow the
//               act that owns the ground; a saved position in the old geography is moved to a
//               door of the same act.
//   4. GATES    The index's story gates (the Act 2 wind canyon): tile 13 and a walled cell until
//               she holds the item, a drawn gust while it blows, the bundle's clearing moment once.
// The frozen bundle is not edited. Act 1 keeps act1-hifi/ and act1-world-map.js unchanged.
(function () {
  'use strict';
  try { if (localStorage.getItem('qok-multiact-hifi') === '0' || /[?&]multiact=0\b/.test(location.search)) return; } catch (e) {}

  var GW = 320, GH = 400;
  // Hi-fi town ids of Acts 2-5. act1-hifi/adapter.js adopts this Set as its TOWN_IDS (it is a
  // module, so it evaluates after this classic script); the index's `towns` list fills it.
  var TOWNS = window.__QOK_ACTS_TOWN_IDS__ = new Set();
  var M = null, ACTS = [], BY = {}, READY = [0, 0, 0, 0, 0, 0], PENDING = [0, 0, 0, 0, 0, 0];
  var CELL = null, OWN = null, REACH = null;      // per-cell rasters decoded from the index
  var req = false, fail = 0, nextTry = 0, bootAt = Date.now();
  var stats = { created: 0, destroyed: 0, wrapped: 0, entries: 0, exits: 0, suppressed: 0, compass: 0, uploads: 0,
    plateWrites: 0, relocated: 0, zone: 0, loadErrors: 0 };
  var ENTRY = {}, ARRIVAL = {}, RETURN = {}, ENTRY_EXIT = {}, COMPASS = {}, VIRTUAL = {}, HOSTED = {};
  var ZONE = { 2: 'iron-mountains', 3: 'scorched-wastes', 4: 'scorched-wastes', 5: 'demons-threshold' };

  // ---------------------------------------------------------------- loading
  // SLOW IS NOT BROKEN. A timeout only says the device is busy (a starved simulator, a phone under
  // memory pressure): bad(true), and the caller asks again with a longer budget, for as long as it
  // takes. An HTTP error, a network error or a file that does not parse is bad(false) and counts
  // towards giving up. `slow` is how many times this file has already timed out.
  function budget(slow) { return Math.min(120000, 20000 * Math.pow(2, Math.min(slow | 0, 3))); }
  function xhr(url, type, done, bad, slow) {
    var r = new XMLHttpRequest(); r.open('GET', url, true); r.timeout = budget(slow);
    if (type === 'bin') r.responseType = 'arraybuffer';
    r.onload = function () {
      if (r.status && r.status >= 400) { bad(false); return; }
      try { done(type === 'bin' ? r.response : JSON.parse(r.responseText)); } catch (e) { bad(false); }
    };
    r.onerror = function () { bad(false); };
    r.ontimeout = function () { bad(true); };
    try { r.send(); } catch (e) { bad(false); }
  }
  function rle(o, Type) {
    var out = new Type(GW * GH);
    if (!o || !o.rows) return out;
    for (var y = 0; y < o.rows.length && y < GH; y++) {
      var x = 0, runs = o.rows[y].split(',');
      for (var k = 0; k < runs.length; k++) {
        var p = runs[k].split(':'), v = +p[0], n = +p[1];
        for (var j = 0; j < n && x < GW; j++) out[y * GW + x++] = v;
      }
    }
    return out;
  }
  function key(t, x, y, f) { return t + '|' + x + '|' + y + '|' + (f || 0); }
  var idxSlow = 0;
  function loadIndex() {
    var now = Date.now();
    if (M || req || now < nextTry) return;
    req = true;
    xhr('acts-hifi/manifest.json', 'json', function (m) {
      req = false;
      if (!m || m.schema !== 'qok-acts-hifi-v2' || !m.acts) { fail++; nextTry = Date.now() + 2000; return; }
      OWN = rle(m.owner, Int8Array); CELL = rle(m.pack, Uint8Array); REACH = rle(m.reach, Uint8Array);
      (m.landmarks || []).forEach(function (L) {
        ENTRY[L.at[0] + ',' + L.at[1]] = L;
        if (L.oldFrom) {
          ARRIVAL[key(L.mapId, L.toX, L.toY, L.toFloor)] = L;
          RETURN[L.oldReturn[0] + ',' + L.oldReturn[1]] = L;
          if (!COMPASS[L.oldFrom[0] + ',' + L.oldFrom[1]]) COMPASS[L.oldFrom[0] + ',' + L.oldFrom[1]] = L;
        }
        if (L.exit) ENTRY_EXIT[L.exit[0] + ',' + L.exit[1]] = L;
        if (L.virtual) { VIRTUAL[L.virtual] = L; HOSTED[L.mapId] = L.virtual; }
      });
      // The bundle's compass chain disagrees with its own connection table for one map.
      var sr = (m.landmarks || []).filter(function (L) { return L.mapId === 'scorchedRuins'; })[0];
      if (sr) COMPASS['278,95'] = sr;
      (m.towns || []).forEach(function (id) { TOWNS.add(id); });
      // PENDING from here on: an act that is not in yet holds a hero who stands in it (hold(), free()),
      // whether its files have been asked for or not. schedule() decides when they are.
      ACTS = m.acts; ACTS.forEach(function (a) { BY[a.act] = a; if (a.runtime) PENDING[a.act] = 1; });
      M = m;
    }, function (slow) {
      req = false;
      if (slow) { idxSlow++; nextTry = Date.now() + 250; stats.slowLoads = (stats.slowLoads || 0) + 1; }
      else { fail++; nextTry = Date.now() + Math.min(8000, 500 * fail); }
    }, idxSlow);
  }
  // An act is READY when its chunk manifest, its plate and its collision pack are all in. Until
  // then the hero is held inside it (hold(), like Act 1's own readiness gate); if a file fails for
  // good the act falls back to the legacy terrain and the engine's tile rules instead of hanging.
  function loadAct(a) {
    if (!a.runtime || a.rt) return;
    a.rt = { manifest: null, plate: null, bits: null, byId: {}, tries: 0, failed: false, appliedTo: null };
    PENDING[a.act] = 1; stats.actLoads = (stats.actLoads || 0) + 1;
    var left = 3;
    function part(url, type, set) {
      (function go(n, slow) {
        xhr(a.runtime + url, type, function (v) {
          try { set(v); } catch (e) { giveUp(); return; }
          if (--left === 0) ready(a);
        }, function (timedOut) {
          if (a.rt.failed) return;
          // a timeout is asked again with a longer budget and never counts; five real errors give up
          if (timedOut) { stats.slowLoads = (stats.slowLoads || 0) + 1; setTimeout(function () { go(n, slow + 1); }, 250); return; }
          stats.loadErrors++; if (n < 4) setTimeout(function () { go(n + 1, slow); }, 400 * (n + 1)); else giveUp();
        }, slow);
      })(0, 0);
    }
    function giveUp() { if (a.rt.failed) return; a.rt.failed = true; PENDING[a.act] = 0; changed(); }
    part('manifest.json', 'json', function (m) {
      a.rt.manifest = m; (m.chunks || []).forEach(function (c) { a.rt.byId[c.id] = c; });
    });
    part('plate.json', 'json', function (p) { a.rt.plate = p; });
    part('collision.bin', 'bin', function (buf) { a.rt.bits = parsePack(buf, a); });
  }
  // QOKF8COL: the bitset Act 1 ships as forest-collision.bin (scripts/acts/export_collision_bin.py).
  // 1 bit per art px, 32 px per cell, origin at the act's first cell.
  function parsePack(buf, a) {
    var b = new Uint8Array(buf), v = new DataView(buf), magic = 'QOKF8COL';
    for (var i = 0; i < 8; i++) if (b[i] !== magic.charCodeAt(i)) throw new Error('magic');
    var w = v.getUint32(12, true), h = v.getUint32(16, true), ppc = v.getUint32(20, true);
    if (v.getUint16(8, true) !== 1 || v.getUint16(10, true) !== 64 || ppc !== 32 || b.length !== 64 + Math.ceil(w * h / 8)) throw new Error('header');
    return { data: new Uint8Array(buf, 64), w: w, h: h, x0: a.origin[0] * 32, y0: a.origin[1] * 32, act: a.act };
  }
  function ready(a) { READY[a.act] = 1; PENDING[a.act] = 0; a.rt.readyAt = Date.now(); changed(); }
  // The answer to artCell() just changed: the movement field and the prop overlay were built on the old one.
  // Both are built per terrain WINDOW (the camera plus a 12-cell border) and only on the overworld.
  // So nothing is rebuilt while she is off the overworld (loadMap builds them afresh on the way
  // back, and plate() runs again on that array), nor while every cell within NEAR of her is Act 1's:
  // no cell this runtime answers for is in her window, and the window she walks into next is built
  // with the new answers. Deep inside Act 1 an act arriving late costs her nothing, not a hitch.
  function changed() {
    var dq = window.__DQ_TILES__, s = scene();
    if (!s || s.currentMapId !== 'overworld' || !s.mapData || s.mapData.length !== GH) { stats.changedSkipped = (stats.changedSkipped || 0) + 1; return; }
    if (deepAct1(s)) { stats.changedSkipped = (stats.changedSkipped || 0) + 1; return; }
    stats.changed = (stats.changed || 0) + 1;
    try { dq.refreshMovementField(); } catch (e) {}
    try { dq.redraw(); } catch (e) {}
  }

  // ---------------------------------------------------------------- what to load, and when
  // ACT 1 NEVER WAITS ON ACTS 2-5. The index (80 KB: doors, towns, compass, minimap) is asked for at
  // once. An act's own files (chunk manifest, plate, a 2.4-4.2 MB collision pack) are asked for
  //   NOW    when she stands in it, when any of its cells is within NEAR of her on the overworld, or
  //          when she is inside a town or dungeon whose door leaves her in it;
  //   LATER  otherwise: one act at a time, nearest first, and only once the world she is in is
  //          presentable (the shell's loading cover has lifted and the ground under the camera is
  //          drawn). Build 97's first candidate asked for all four packs at script parse, on top of
  //          Act 1's own start-up loads; on a starved device that is the last thing it needs.
  // NEAR is wider than the terrain window's reach (camera half + 12-cell border, about 24 cells).
  var NEAR = 40, nearKey = null, nearSet = {}, nearDeep = true, quietSince = 0, lastLoadAt = 0;
  function nearScan(s) {
    var hx = Math.floor(+s.heroTileX), hy = Math.floor(+s.heroTileY), k = hx + ',' + hy;
    if (k === nearKey || !CELL) return;
    nearKey = k; nearSet = {}; nearDeep = true;
    for (var y = Math.max(0, hy - NEAR), y1 = Math.min(GH - 1, hy + NEAR); y <= y1; y++) {
      for (var x = Math.max(0, hx - NEAR), x1 = Math.min(GW - 1, hx + NEAR), i = y * GW + x; x <= x1; x++, i++) {
        var c = CELL[i], o = OWN[i];
        if (c !== 1) nearDeep = false;
        if (c > 1) nearSet[c] = 1;
        if (o > 1) nearSet[o] = 1;
      }
    }
    if (hy - NEAR < 0 || hx - NEAR < 0 || hy + NEAR >= GH || hx + NEAR >= GW) nearDeep = false;
  }
  function onOverworld(s) { return !!(s && s.currentMapId === 'overworld' && s.mapData && s.mapData.length === GH); }
  function deepAct1(s) { if (!CELL || !onOverworld(s)) return false; nearScan(s); return nearDeep; }
  function needed(s) {
    var out = {}, g = game();
    if (!s || !s.currentMapId || !g || !g.scene || !g.scene.isActive) return out;
    if (!(g.scene.isActive('WorldMapScene') || (g.scene.isPaused && g.scene.isPaused('WorldMapScene')))) return out;   // paused: a battle or a menu over the world
    if (onOverworld(s)) { nearScan(s); for (var k in nearSet) out[k] = 1; return out; }
    var v = currentVirtual();
    (M.landmarks || []).forEach(function (L) { if (L.mapId === s.currentMapId && (!L.virtual || L.virtual === v)) out[L.act] = 1; });
    return out;
  }
  function quiet(s) {
    var c = window.__QOK_COVER__, g = game(), now = Date.now(), ok = true;
    try { if (c && c.phase && c.phase() !== 'active') ok = false; } catch (e) {}
    if (ok && !(g && g.scene && g.scene.isActive && g.scene.isActive('WorldMapScene'))) ok = false;
    if (!ok) { quietSince = 0; return false; }
    if (!quietSince) quietSince = now;
    if (onOverworld(s) && now - quietSince < 20000) {          // (20 s: a chunk that never lands must not hold the rest back for good)
      var cov = null; try { cov = window.__A1_VISIBLE_BASE_COVERAGE__ ? window.__A1_VISIBLE_BASE_COVERAGE__(s) : null; } catch (e) {}
      if (cov && cov.visible > 0 && !cov.ready) return false;
      if (queue.length) return false;
    }
    return now - quietSince >= 1000 && now - lastLoadAt >= 400;
  }
  function schedule(s) {
    var todo = ACTS.filter(function (a) { return a.runtime && !a.rt; });
    if (!todo.length) return;
    var need = needed(s);
    todo.forEach(function (a) { if (need[a.act]) loadAct(a); });
    todo = todo.filter(function (a) { return !a.rt; });
    if (!todo.length) return;
    var busy = ACTS.some(function (a) { return a.rt && PENDING[a.act] === 1; });
    if (busy) { lastLoadAt = Date.now(); return; }
    if (!quiet(s)) return;
    var hx = +s.heroTileX || 0, hy = +s.heroTileY || 0, ow = onOverworld(s), cc = M.chunkCells;
    todo.sort(function (p, q) {                                // nearest rectangle first (off the overworld: index order)
      function d(a) { if (!ow) return 0; var x0 = a.origin[0], y0 = a.origin[1], x1 = x0 + a.cols * cc, y1 = y0 + a.rows * cc;
        var dx = hx < x0 ? x0 - hx : hx > x1 ? hx - x1 : 0, dy = hy < y0 ? y0 - hy : hy > y1 ? hy - y1 : 0; return dx + dy; }
      return d(p) - d(q);
    });
    loadAct(todo[0]); lastLoadAt = Date.now();
  }

  // ---------------------------------------------------------------- hooks for dq-tiles.js
  // Every position argument is canonical solver px (48 per cell); packs are 32 per cell.
  function cellAct(tx, ty) { return (CELL && tx >= 0 && ty >= 0 && tx < GW && ty < GH) ? CELL[ty * GW + tx] : 0; }
  function artCell(tx, ty) { var a = cellAct(tx, ty); return a > 1 && READY[a] === 1; }
  function hold(x, y) {
    if (!M) {                                                    // index still on its way: hold outside Act 1's rectangle
      var hx = Math.floor(x / 48), hy = Math.floor(y / 48);
      return !(hx >= 16 && hx <= 163 && hy >= 218) && fail < 6 && Date.now() - bootAt < 15000;
    }
    var a = cellAct(Math.floor(x / 48), Math.floor(y / 48));
    if (PENDING[a] === 1) return true;
    // her act is in but its plate is not on this map array yet (it waits for dq-tiles' own map setup)
    var s = scene(), A = a > 1 && READY[a] === 1 ? BY[a] : null;
    return !!(A && A.rt && s && s.mapData && s.mapData.length === GH && A.rt.appliedTo !== s.mapData && holding(s.mapData));
  }
  // Released after 3 s AND 30 of this runtime's own ticks (100 ms each when the device keeps up): on
  // a starved device three seconds can pass before dq-tiles has even set the new array up, and
  // letting her walk the unplated array then puts her inside the painted cliffs.
  var holdMap = null, holdAt = 0, holdTicks = 0, ticks = 0;
  function holding(md) {
    if (holdMap !== md) { holdMap = md; holdAt = Date.now(); holdTicks = ticks; }
    return Date.now() - holdAt < 3000 || ticks - holdTicks < 30;
  }
  function raw(P, px, py) {                                       // px,py in WORLD collision px
    px -= P.x0; py -= P.y0;
    if (px < 0 || py < 0 || px >= P.w || py >= P.h) return 0;
    var i = py * P.w + px; return P.data[i >> 3] & (1 << (i & 7));
  }
  // The disc meets the pack CLOSED by closeR, exactly as dq-tiles a1fClosedTile closes Act 1's
  // bits: every gap narrower than the closing is filled, nothing else moves. Built lazily per
  // 128 px tile (chamfer 3-4, dilate then erode) and cached.
  var CT = 128, CT_MAX = 128, closed = new Map();
  function chamfer(d, S) {
    var x, y, i, v;
    for (y = 0; y < S; y++) for (x = 0; x < S; x++) { i = y * S + x; v = d[i]; if (!v) continue;
      if (y > 0) { if (d[i - S] + 3 < v) v = d[i - S] + 3; if (x > 0 && d[i - S - 1] + 4 < v) v = d[i - S - 1] + 4; if (x < S - 1 && d[i - S + 1] + 4 < v) v = d[i - S + 1] + 4; }
      if (x > 0 && d[i - 1] + 3 < v) v = d[i - 1] + 3; d[i] = v; }
    for (y = S - 1; y >= 0; y--) for (x = S - 1; x >= 0; x--) { i = y * S + x; v = d[i]; if (!v) continue;
      if (y < S - 1) { if (d[i + S] + 3 < v) v = d[i + S] + 3; if (x < S - 1 && d[i + S + 1] + 4 < v) v = d[i + S + 1] + 4; if (x > 0 && d[i + S - 1] + 4 < v) v = d[i + S - 1] + 4; }
      if (x < S - 1 && d[i + 1] + 3 < v) v = d[i + 1] + 3; d[i] = v; }
  }
  function closedTile(P, tx, ty, R) {
    var k = P.act * 16777216 + ty * 4096 + tx, t = closed.get(k); if (t) return t;
    var A = 2 * R + 2, S = CT + 2 * A, n = S * S, d = new Uint16Array(n), x0 = tx * CT - A, y0 = ty * CT - A, x, y, i, any = 0;
    for (y = 0; y < S; y++) for (x = 0; x < S; x++) { if (raw(P, x0 + x, y0 + y)) { d[y * S + x] = 0; any = 1; } else d[y * S + x] = 60000; }
    t = new Uint8Array(CT * CT);
    if (any) {
      chamfer(d, S);
      for (i = 0; i < n; i++) d[i] = (d[i] <= 3 * R) ? 60000 : 0;
      chamfer(d, S);
      for (y = 0; y < CT; y++) for (x = 0; x < CT; x++) if (d[(y + A) * S + x + A] > 3 * R) t[y * CT + x] = 1;
    }
    if (closed.size >= CT_MAX) closed.delete(closed.keys().next().value);
    closed.set(k, t); return t;
  }
  // Is this world collision px blocked? The pack that answers is the one that owns the px's cell
  // (index `pack` raster: the owner act, except that a landmark's mask box answers to the act
  // that drew it, and Act 1's rectangle answers to Act 1's own pack in dq-tiles).
  function blocked(px, py, R) {
    if (SHUT && px >= 0 && py >= 0 && px < GW * 32 && py < GH * 32 && SHUT[(py >> 5) * GW + (px >> 5)]) return 1;   // a closed story gate
    var a = cellAct(px >> 5, py >> 5);
    if (a < 2) return a === 1 ? ovBit(px, py) : 0;
    var A = BY[a], P = A && A.rt && A.rt.bits;
    if (!P || READY[a] !== 1) return 0;
    if (raw(P, px, py)) return 1;
    var lx = px - P.x0, ly = py - P.y0;
    if (lx < 0 || ly < 0 || lx >= P.w || ly >= P.h) return 0;
    return closedTile(P, px >> 7, py >> 7, R)[(py & 127) * CT + (px & 127)];
  }
  var DISC = null, DISC_R = 0;
  function disc(r) {
    if (DISC && DISC_R === r) return DISC;
    var n = Math.ceil(r), out = [], dx, dy;
    for (dy = -n; dy <= n; dy++) for (dx = -n; dx <= n; dx++) if (dx * dx + dy * dy <= r * r) out.push(dx, dy);
    DISC_R = r; return (DISC = out);
  }
  function free(s, x, y, sole) {
    if (!M) return true;
    var tx = Math.floor(x / 48), ty = Math.floor(y / 48), a = cellAct(tx, ty);
    if (PENDING[a] === 1) return false;
    if (!sole) return !(a > 1 && READY[a] === 1);                // no stencil yet: hold on act art, like Act 1
    var gx = Math.round(x * 32 / 48 + sole.dx), gy = Math.round(y * 32 / 48 + sole.dy), n = Math.ceil(sole.r) + 1;
    // nothing but Act 1 / open sea within reach of the disc, and no override bits: skip the scan
    if (a < 2 && cellAct((gx - n) >> 5, (gy - n) >> 5) < 2 && cellAct((gx + n) >> 5, (gy - n) >> 5) < 2
        && cellAct((gx - n) >> 5, (gy + n) >> 5) < 2 && cellAct((gx + n) >> 5, (gy + n) >> 5) < 2 && !OV_BITS) return true;
    var d = disc(sole.r), R = sole.closeR;
    for (var j = 0; j < d.length; j += 2) if (blocked(gx + d[j], gy + d[j + 1], R)) { stats.blockedSteps = (stats.blockedSteps || 0) + 1; return false; }
    return true;
  }
  // dq-tiles a1fNormal for an act pack: the centroid of blocked px around the soles lies into the
  // wall, so soles-minus-centroid is the outward normal the glide slides along.
  function normal(s, x, y, sole) {
    if (!M || !sole) return null;
    var a = cellAct(Math.floor(x / 48), Math.floor(y / 48));
    if (!(a > 1 && READY[a] === 1)) return null;
    var gx = Math.round(x * 32 / 48 + sole.dx), gy = Math.round(y * 32 / 48 + sole.dy);
    var R = Math.ceil(sole.r) + sole.normalPad, R2 = R * R, sx = 0, sy = 0, n = 0, dx, dy;
    for (dy = -R; dy <= R; dy++) for (dx = -R; dx <= R; dx++) {
      if (dx * dx + dy * dy > R2 || !blocked(gx + dx, gy + dy, sole.closeR)) continue;
      sx += dx; sy += dy; n++; }
    if (!n) return null;
    var l = Math.sqrt(sx * sx + sy * sy); if (l < n * 0.5) return null;
    return { x: -sx / l, y: -sy / l };
  }
  // Is every cell of this view (cells, fractional) drawn by Act 1's plate, an act's art, or sea?
  function viewCovered(x0, y0, x1, y1) {
    if (!CELL) return false;
    var cx0 = Math.max(0, Math.floor(x0)), cy0 = Math.max(0, Math.floor(y0)), cx1 = Math.min(GW - 1, Math.floor(x1)), cy1 = Math.min(GH - 1, Math.floor(y1));
    for (var y = cy0; y <= cy1; y++) for (var x = cx0, i = y * GW + cx0; x <= cx1; x++, i++) {
      var a = CELL[i]; if (a > 1 && READY[a] !== 1) return false;
    }
    return true;
  }
  // THE GENERATOR'S TILES, KEPT FOR ACT 1. dq-tiles authenticates Act 1's baked movement field
  // (act1-overworld-walk.bin) against the map tiles it was baked over, and that support reaches 45
  // cells past Act 1's rectangle, into ground this runtime replaces. plate() copies the array once,
  // after dq-tiles has consolidated it and before the first act plate goes in; dq-tiles asks for
  // that copy (Act 1's own rectangle is always read live) when it checks the bake.
  var legacy = { map: null, rows: null };
  function keepLegacy(md) {
    var rows = new Array(GH);
    for (var y = 0; y < GH; y++) rows[y] = Uint8Array.from(md[y]);
    legacy.map = md; legacy.rows = rows;
  }
  function legacyMap(md) {
    if (legacy.map !== md || !legacy.rows || !CELL) return null;
    var out = new Array(GH);
    for (var y = 0, i = 0; y < GH; y++) {
      var src = legacy.rows[y], row = null, live = md[y];
      for (var x = 0; x < GW; x++, i++) if (CELL[i] === 1 && src[x] !== live[x]) { row = row || src.slice(); row[x] = live[x]; }
      out[y] = row || src;
    }
    return out;
  }
  window.__QOK_ACTS__ = { artCell: artCell, free: free, normal: normal, hold: hold, viewCovered: viewCovered, legacyMap: legacyMap };

  // override `block` (e.g. act1-crystal-cave): carved-entrance rock that Act 1's own pack does not
  // know about. It only ever ADDS blocking inside Act 1's rectangle (dq-tiles ANDs it with a1fHeroFree).
  var OV_BITS = null;
  function ovInit() {
    if (!M.overrides) return;
    M.overrides.forEach(function (o) {
      var b = o.block; if (!b || !b.b64) return;
      try {
        var rawb = atob(b.b64), d = new Uint8Array(rawb.length);
        for (var i = 0; i < rawb.length; i++) d[i] = rawb.charCodeAt(i);
        (OV_BITS = OV_BITS || []).push({ w: b.w, h: b.h, x0: b.origin[0] * 32, y0: b.origin[1] * 32, data: d });
      } catch (e) { stats.loadErrors++; }
    });
  }
  function ovBit(px, py) {
    if (!OV_BITS) return 0;
    for (var j = 0; j < OV_BITS.length; j++) if (raw(OV_BITS[j], px, py)) return 1;
    return 0;
  }

  // ---------------------------------------------------------------- story gates
  // Index `gates` (scripts/build_acts_hifi_manifest.py WIND_GATE, placement switched there). The
  // bundle's wind canyon, put back where the painted Act 2 needs it: Storm Harpy -> Windbreaker
  // Stone -> the pass east of Ironkeep -> Frostwatch, the Frozen Lake and the Haunted Forest.
  //   SHUT     while she lacks the item, each gate cell carries the gate tile (13) in mapData, so the
  //            engine's own rules answer it (canMove refuses 13 without the stone; dq-tiles a1mBump
  //            says overworld.canyonBlocked on a bump), and blocked() walls the whole cell for the
  //            sole disc. With the item the plate's own tile goes back, as the bundle's loadMap
  //            rewrites 13 -> 1, on the next tick: no reload.
  //   GUST     a drawn gust of wind and snow drifts out of the pass until the moment it clears.
  //   CLEARED  the first time she walks through holding the item, the bundle's one-time moment
  //            plays here (clearedFlag, openedKey) and the gust dies down. The bundle's own trigger
  //            sits on old cells (`oldTrigger`) that are not standable in this world
  //            (check_world.py), and only fires from the engine's step tween, which the mover replaced.
  var GATES = [], SHUT = null, GATE_AT = {}, GUST_DEPTH = 9.65;
  function gatesInit() {
    (M.gates || []).forEach(function (g) {
      if (!g || !g.cells || !g.cells.length) return;
      var b = [1e9, 1e9, -1, -1];
      g.cells.forEach(function (c) {
        GATE_AT[c[0] + ',' + c[1]] = g;
        b[0] = Math.min(b[0], c[0]); b[1] = Math.min(b[1], c[1]); b[2] = Math.max(b[2], c[0]); b[3] = Math.max(b[3], c[1]);
      });
      g.box = b; g.shut = false; g.gust = false; g.applied = null; g.fadeAt = 0; g.plays = 0; g.prev = null; g.gfx = null;
      g.fx = gustField(g);
      GATES.push(g);
    });
    if (GATES.length) SHUT = new Uint8Array(GW * GH);
  }
  function hasItem(id) {
    try { var inv = window.__GAME_STATE__.player.state.inventory || []; for (var i = 0; i < inv.length; i++) if (inv[i].itemId === id && inv[i].quantity > 0) return true; } catch (e) {}
    return false;
  }
  function flag(k) { var p = pstate(); return !!(k && p && p.storyFlags && p.storyFlags[k]); }
  function setFlag(k) { var p = pstate(); if (k && p && p.storyFlags) p.storyFlags[k] = true; }
  function gateTile(x, y, t) { if (!SHUT || !SHUT[y * GW + x]) return t; var g = GATE_AT[x + ',' + y]; return g ? g.tile : t; }
  function plateTileAt(a, x, y) {
    var p = a && a.rt && a.rt.plate; if (!p) return null;
    if (!p.tiles) eachPlateCell(a, function () {});
    var w = p.rows[0].length, rx = x - p.bounds[0], ry = y - p.bounds[1];
    if (rx < 0 || ry < 0 || rx >= w || ry >= p.rows.length) return null;
    var t = p.tiles[ry * w + rx]; return t >= 0 ? t : null;
  }
  // Once per tick, before plate(): the item decides, and mapData follows when it changes.
  function gateState(s) {
    GATES.forEach(function (g) {
      var shut = !hasItem(g.item), cleared = flag(g.clearedFlag);
      g.shut = shut;
      if (g.gust && !shut && cleared && !g.fadeAt) g.fadeAt = Date.now();      // cleared elsewhere (another device's save): fade
      g.gust = shut || !cleared;
      if (g.applied === shut) return;
      g.cells.forEach(function (c) { SHUT[c[1] * GW + c[0]] = shut ? 1 : 0; });
      var A = BY[g.act], md = s.mapData, n = 0;
      if (A && A.rt && A.rt.appliedTo === md) {
        g.cells.forEach(function (c) {
          var t = shut ? g.tile : plateTileAt(A, c[0], c[1]);
          if (t !== null && md[c[1]][c[0]] !== t) { md[c[1]][c[0]] = t; n++; }
        });
      }
      g.applied = shut; stats.gateSwitches = (stats.gateSwitches || 0) + 1;
      changed();
    });
  }
  function gateTick(s) {
    if (!GATES.length) return;
    // The bundle draws its own teal streaks over every tile-13 cell its generator left at loadMap
    // time: the OLD canyon, under this act's art. The gust below is the cue now.
    var wo = s._windTileOverlays;
    if (wo && wo.length) for (var i = 0; i < wo.length; i++) { try { if (wo[i].visible) wo[i].setVisible(false); } catch (e) {} }
    var hx = s.heroTileX, hy = s.heroTileY;
    GATES.forEach(function (g) {
      var b = g.box, near = hx >= b[0] - 2 && hx <= b[2] + 2 && hy >= b[1] - 1 && hy <= b[3] + 1;
      if (g.shut && near && s.showingMessage && g.seenFlag) setFlag(g.seenFlag);   // the bundle's first-refusal flag
      if (!g.shut && !flag(g.clearedFlag)) {
        var p = g.prev, inside = hx >= b[0] && hx <= b[2] && hy >= b[1] && hy <= b[3];
        var across = p && Math.abs(hx - p[0]) <= 4 && Math.abs(hy - p[1]) <= 4 && hy >= b[1] && hy <= b[3]
          && ((p[0] < b[0] && hx > b[2]) || (p[0] > b[2] && hx < b[0]) || (p[1] < b[1] && hy > b[3]) || (p[1] > b[3] && hy < b[1]));
        if (inside || across) playClear(s, g);
      }
      g.prev = [hx, hy];
    });
  }
  function zText(k) {
    try { var q = window.__QOK, z = q && q.Z, t = z ? z(k) : null; return t && t.charAt(0) !== '[' && t !== k ? t : null; } catch (e) { return null; }
  }
  // The bundle's wind-clearing moment (streaks flung on the wind, a pale flash, the message 180 ms
  // later), played at the gate, and the gust dies down behind it.
  function playClear(s, g) {
    setFlag(g.clearedFlag); g.plays++; g.fadeAt = Date.now(); g.gust = false; stats.gateClears = (stats.gateClears || 0) + 1;
    var sp = space(); if (!sp || !s.add || !s.tweens) return;
    var P = sp.pitch, d = g.wind || [-1, 0], b = g.box, cx = (b[0] + b[2] + 1) / 2 * P, cy = (b[1] + b[3] + 1) / 2 * P;
    var hx = s.hero ? s.hero.x : cx, hy = s.hero ? s.hero.y : cy, span = (Math.abs(d[0]) ? (b[3] - b[1] + 1) : (b[2] - b[0] + 1)) * P;
    try {
      for (var i = 0; i < 26; i++) {
        var o = (Math.random() - 0.5) * span, x0 = d[0] ? cx + (Math.random() - 0.5) * P : cx + o, y0 = d[0] ? cy + o : cy + (Math.random() - 0.5) * P;
        var len = P * (0.45 + Math.random() * 0.5), th = 2 + Math.random() * 1.5, run = P * (2.4 + Math.random() * 2.4);
        var dur = 520 + Math.random() * 300, dl = Math.random() * 160;
        [[th * 2.6, 0x8CC8F0, 0.5], [th, 0xF8FCFF, 0.95]].forEach(function (k) {     // blue halo under a white core, so it reads on snow
          var r = s.add.rectangle(x0, y0, d[0] ? len : k[0], d[0] ? k[0] : len, k[1], k[2]).setDepth(96);
          s.tweens.add({ targets: r, x: x0 + d[0] * run, y: y0 + d[1] * run, alpha: 0, scaleX: d[0] ? 0.3 : 1, scaleY: d[0] ? 1 : 0.3,
            duration: dur, delay: dl, ease: 'Sine.easeOut', onComplete: function () { r.destroy(); } });
        });
      }
      var f = s.add.ellipse(hx, hy, P * 2.5, P * 2.5, 0x9FD8FA, 0.45).setDepth(95);
      s.tweens.add({ targets: f, alpha: 0, scaleX: 1.9, scaleY: 1.9, duration: 480, ease: 'Power2', onComplete: function () { f.destroy(); } });
      var msg = zText(g.openedKey);
      if (msg && s.time) s.time.delayedCall(180, function () { try { s.showMessage(msg); } catch (e) {} });
    } catch (e) { stats.loadErrors++; }
  }
  // THE GUST. Soft white-blue wind ribbons and snow motes drifting out of the pass, across a band
  // a couple of cells either side of the gate, fading in and out at its ends: a cue, not a wall.
  // Seeded once per gate; drawn on one Graphics, redrawn each frame while the gate is on screen.
  function gustField(g) {
    var seed = 0; g.cells.forEach(function (c) { seed = (seed * 31 + c[0] * 7 + c[1]) >>> 0; });
    function rnd() { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; }
    var d = g.wind || [-1, 0], b = g.box, across = d[0] ? (b[3] - b[1] + 1) : (b[2] - b[0] + 1), along = d[0] ? (b[2] - b[0] + 1) : (b[3] - b[1] + 1);
    var fx = { d: d, n: [-d[1], d[0]], across: across, half: along / 2 + 2.4, ribbons: [], motes: [] };
    for (var i = 0; i < Math.round(across * 4); i++) fx.ribbons.push({ v: rnd(), per: 1.4 + rnd() * 1.1, ph: rnd(), len: 1.0 + rnd() * 1.0,
      amp: 0.05 + rnd() * 0.1, wl: 0.9 + rnd() * 0.8, w: 0.065 + rnd() * 0.055, wph: rnd() * 6.28 });
    for (i = 0; i < Math.round(across * 4.5); i++) fx.motes.push({ v: rnd(), per: 1.1 + rnd() * 1.1, ph: rnd(), r: 0.035 + rnd() * 0.03,
      amp: 0.08 + rnd() * 0.18, wob: 1.5 + rnd() * 2.5, wph: rnd() * 6.28 });
    return fx;
  }
  function hideGates() { GATES.forEach(function (g) { if (g.gfx) { try { g.gfx.destroy(); } catch (e) {} g.gfx = null; } }); }
  function animateGates() {
    if (!GATES.length || stats.gateDrawErrors > 5) return;
    try { drawGates(); } catch (e) { stats.gateDrawErrors = (stats.gateDrawErrors || 0) + 1; hideGates(); }   // never take the frame down with it
  }
  function drawGates() {
    var s = scene(), sp = space();
    if (!s || !sp || !wasOn || s.currentMapId !== 'overworld') return;
    var cam = s.cameras && s.cameras.main, v = cam && cam.worldView, now = Date.now(), t = now / 1000, P = sp.pitch;
    GATES.forEach(function (g) {
      var k = g.gust ? 1 : (g.fadeAt ? 1 - (now - g.fadeAt) / 1400 : 0);
      var A = BY[g.act];
      if (k <= 0 || !A || READY[g.act] !== 1) { if (g.gfx) { try { g.gfx.destroy(); } catch (e) {} g.gfx = null; } return; }
      var b = g.box, fx = g.fx, cx = (b[0] + b[2] + 1) / 2, cy = (b[1] + b[3] + 1) / 2, m = fx.half + 1;
      if (v && ((cx + m) * P < v.x || (cx - m) * P > v.x + v.width || (cy + m) * P < v.y || (cy - m) * P > v.y + v.height)) { if (g.gfx) g.gfx.clear(); return; }
      if (!g.gfx || g.gfx.scene !== s) { try { g.gfx = s.add.graphics().setDepth(GUST_DEPTH); } catch (e) { return; } }
      if (!fx.lanes) {           // across the cells she could walk (plate tile 0), not over the cliff ends
        var lo = 1e9, hi = -1e9;
        g.cells.forEach(function (c) { if (plateTileAt(A, c[0], c[1]) === 0) { var w = (c[0] + 0.5 - cx) * fx.n[0] + (c[1] + 0.5 - cy) * fx.n[1]; lo = Math.min(lo, w - 0.5); hi = Math.max(hi, w + 0.5); } });
        fx.lanes = lo < hi ? [lo + 0.1, hi - 0.1] : [-fx.across / 2 + 0.1, fx.across / 2 - 0.1];
      }
      var G = g.gfx, d = fx.d, n = fx.n, H = fx.half, ac = fx.across, lane = function (v) { return fx.lanes[0] + v * (fx.lanes[1] - fx.lanes[0]); };
      G.clear();
      var puff = k * (0.8 + 0.2 * Math.sin(t * 2.1) * Math.sin(t * 0.73 + 1.1));          // gusting, never still
      // where a point at along-offset u (cells from the gate centre, + = downwind) and across-offset w sits
      function X(u, w) { return (cx + d[0] * u + n[0] * w) * P; }
      function Y(u, w) { return (cy + d[1] * u + n[1] * w) * P; }
      function edge(u) { var e = Math.min(1, (H - Math.abs(u)) / 1.6); return e > 0 ? e * e * (3 - 2 * e) : 0; }
      // a breath of cold air over the mouth itself
      for (var h = 0; h < 3; h++) {
        var hw = 0.35 + h * 0.4;
        G.fillStyle(0xBFDFF7, 0.06 * puff);
        var l0 = fx.lanes[0], l1 = fx.lanes[1];
        G.fillRect(Math.min(X(-hw, l0), X(hw, l1)), Math.min(Y(-hw, l0), Y(hw, l1)), Math.abs(X(hw, l1) - X(-hw, l0)) || 1, Math.abs(Y(hw, l1) - Y(-hw, l0)) || 1);
      }
      var SEG = 9;
      fx.ribbons.forEach(function (r) {
        var u0 = ((t / r.per + r.ph) % 1), head = -H + u0 * (2 * H + r.len), life = Math.sin(Math.PI * u0);
        var w0 = lane(r.v), px = null, py = null;
        for (var j = 0; j <= SEG; j++) {
          var f = j / SEG, u = head - r.len * (1 - f);
          var w = w0 + r.amp * Math.sin((u / r.wl) * 6.28 + r.wph + t * 1.7);
          var x = X(u, w), y = Y(u, w);
          if (j) {
            var a = puff * life * edge(u) * (0.2 + 0.8 * f);
            if (a > 0.01) {
              var th = r.w * P * (0.45 + 0.55 * Math.sin(Math.PI * Math.min(1, f * 1.15)));
              G.lineStyle(th * 1.2, 0x56799E, 0.4 * a); G.lineBetween(px, py + th * 1.4, x, y + th * 1.4);   // a cool shadow, so it reads on snow
              G.lineStyle(th * 3, 0x8EC3EF, 0.62 * a); G.lineBetween(px, py, x, y);                          // soft blue halo
              G.lineStyle(th, 0xF8FCFF, 0.97 * a); G.lineBetween(px, py, x, y);                              // white core
            }
          }
          px = x; py = y;
        }
      });
      fx.motes.forEach(function (o) {
        var u0 = ((t / o.per + o.ph) % 1), u = -H + u0 * 2 * H, a = puff * Math.sin(Math.PI * u0) * edge(u);
        if (a < 0.02) return;
        var w = lane(o.v) + o.amp * Math.sin(t * o.wob + o.wph), x = X(u, w), y = Y(u, w), r = o.r * P;
        G.fillStyle(0x6F98C2, 0.55 * a); G.fillCircle(x, y + r * 0.35, r * 1.4);
        G.fillStyle(0xFFFFFF, 0.92 * a); G.fillCircle(x, y, r);
      });
    });
  }

  // ---------------------------------------------------------------- scene access
  function game() { return window.__PHASER_GAME__; }
  function scene() {
    var g = game();
    return g && g.scene && g.scene.getScene ? g.scene.getScene('WorldMapScene') : null;
  }
  function space() { var dq = window.__DQ_TILES__; return dq && dq.overworldSpace; }
  function pstate() { try { return window.__GAME_STATE__.player.state; } catch (e) { return null; } }

  // ---------------------------------------------------------------- doors, exits, compass, zones
  // A door answers a hero in front of it: on its gate side or level with it, never from behind.
  function inFront(s, L) {
    var hx = s.heroTileX, hy = s.heroTileY, p = s.__a1mPrevTile;
    if (hx === L.at[0] && hy === L.at[1] && p) { hx = p[0]; hy = p[1]; }
    return L.gate === 'north' ? hy <= L.at[1] : hy >= L.at[1];
  }
  var lastMap = null;
  function settle(s) {
    if (s.currentMapId !== 'overworld') return;
    var at = s.heroTileX + ',' + s.heroTileY, back = RETURN[at];
    if (back && back.exit) { place(s, back.exit[0], back.exit[1]); stats.exits++; stats.lateExits = (stats.lateExits || 0) + 1; markMigrated(); }
    else if (cellAct(s.heroTileX, s.heroTileY) !== 1) relocate(s, s.heroTileX, s.heroTileY);
  }
  function wrap(s) {
    if (!M || !s || s.__actsHifiWrapped) return;
    if (typeof s.checkTransition !== 'function' || typeof s.getCompassTarget !== 'function' || typeof s.loadMap !== 'function') return;
    var check = s.checkTransition, compass = s.getCompassTarget, loadMap = s.loadMap, talk = s.handleNpcInteraction;
    s.checkTransition = function (x, y) {
      if (this.currentMapId === 'overworld' && cellAct(x, y) !== 1) {
        var L = ENTRY[x + ',' + y];
        if (L) {
          if (!inFront(this, L)) return null;
          if (this.transitionCooldown > 0) { this.transitionCooldown--; return null; }
          stats.entries++;
          if (TOWNS.has(L.mapId)) window.__QOK_ACTS_WALKIN__ = L.mapId;   // adapter: spawn at the gate, not a resume cell
          setVirtual(L.virtual || null);
          var hit = { targetMap: L.mapId, toX: L.toX, toY: L.toY };
          if (L.toFloor) hit.toFloor = L.toFloor;
          return hit;
        }
      }
      var r = check.call(this, x, y);
      if (!r) return r;
      if (this.currentMapId === 'overworld' && ARRIVAL[key(r.targetMap, r.toX, r.toY, r.toFloor)]) {
        stats.suppressed++; return null;            // a frozen door whose destination now lives elsewhere
      }
      if (r.targetMap === 'overworld') {
        var back = RETURN[r.toX + ',' + r.toY];
        if (back) { r.toX = back.exit[0]; r.toY = back.exit[1]; stats.exits++; }
      }
      return r;
    };
    s.getCompassTarget = function () {
      var t = compass.call(this);
      if (!t) return t;
      var L = COMPASS[t.ox + ',' + t.oy];
      if (!L) return t;
      var copy = {}; for (var k in t) if (Object.prototype.hasOwnProperty.call(t, k)) copy[k] = t[k];
      copy.ox = L.at[0]; copy.oy = L.at[1]; stats.compass++; return copy;
    };
    // The hi-fi town overlay (act1-hifi/adapter.js handleTownExit) never calls checkTransition: it
    // sets heroTileX/Y from the town json's exit and calls loadMap('overworld'). A json that still
    // carries the bundle's frozen exit is remapped here through the door table.
    s.loadMap = function (mapId) {
      var want = null, late = false;
      if (mapId === 'overworld') {
        var at = this.heroTileX + ',' + this.heroTileY, back = RETURN[at], v = currentVirtual();
        if (!back && ENTRY[at]) back = ENTRY[at];                       // escape crystal used after entering from the door cell itself
        if (v && VIRTUAL[v] && !ENTRY_EXIT[at]) back = VIRTUAL[v];      // a hosted town leaves by its own door
        if (back && back.exit && !ENTRY_EXIT[at]) {
          this.heroTileX = back.exit[0]; this.heroTileY = back.exit[1]; stats.exits++;
          var p = pstate(); if (p && p.position) { p.position.x = back.exit[0]; p.position.y = back.exit[1]; }
        }
        // The bundle's Haunted Forest maze exits call loadMap FIRST and set the hero's overworld
        // cell AFTER it, so at this point her cell is still an interior one. settle() below runs
        // as a microtask, i.e. right after that synchronous code and before the next frame.
        else if (!back && !ENTRY_EXIT[at] && lastMap && lastMap !== 'overworld') late = true;
        setVirtual(null);
        want = [this.heroTileX, this.heroTileY];
      }
      lastMap = mapId;
      var r = loadMap.apply(this, arguments);
      // The frozen engine nudges an arrival off any cell its OWN terrain calls blocked, and it
      // judges that before this runtime has plated the new mapData (a town exit swaps the array).
      // Plate now, and put the hero back on a cell the index calls reachable (every exit cell is).
      if (late) {
        var self = this;
        try { plate(this, true); } catch (e) {}
        Promise.resolve().then(function () { settle(self); });
      } else if (want && M && want[0] >= 0 && want[1] >= 0 && want[0] < GW && want[1] < GH && cellAct(want[0], want[1]) !== 1) {
        try { plate(this, true); } catch (e) {}
        var wa = cellAct(want[0], want[1]), n0 = stats.relocated;
        if (ENTRY_EXIT[want[0] + ',' + want[1]]) markMigrated();   // came out of a door: a position in the new geography
        else relocate(this, want[0], want[1]);                    // Continue: migrate or repair (see relocate)
        if (stats.relocated === n0 && wa > 1 && READY[wa] === 1 && REACH[want[1] * GW + want[0]]
            && (this.heroTileX !== want[0] || this.heroTileY !== want[1])) { place(this, want[0], want[1]); stats.unnudged = (stats.unnudged || 0) + 1; }
      }
      return r;
    };
    // A hosted town's own people speak from the index's `strings` table: the bundle has no entry for them.
    if (typeof talk === 'function') {
      s.handleNpcInteraction = function (npc) {
        var st = npc && M.strings && M.strings[npc.dialogueKey];
        if (st && typeof this.showMessage === 'function') { this.showMessage(text(npc.dialogueKey), text(npc.nameKey) || undefined); return; }
        return talk.apply(this, arguments);
      };
    }
    // The bundle marks the engine map visited (compass.visited.<mapId>) on every town entry. Inside a
    // hosted town that would tick the HOST off the compass chain, so the hosted town is marked instead.
    if (typeof s.markTownVisited === 'function') {
      var visit = s.markTownVisited;
      s.markTownVisited = function (id) {
        var v = currentVirtual();
        if (v && VIRTUAL[v] && VIRTUAL[v].mapId === id) { var p = pstate(); if (p && p.storyFlags) p.storyFlags['compass.visited.' + v] = true; return; }
        return visit.apply(this, arguments);
      };
    }
    s.__actsHifiWrapped = true; stats.wrapped++;
  }
  // Encounter zones. The bundle picks the overworld zone from fixed coordinate rectangles
  // (x < 160 && y > 200 is Act 1, ...), which no longer match: Act 5 now reaches down to row 217
  // and Act 3 to row 221. The act that owns the ground decides instead; Act 1's rectangle is untouched.
  function wrapZone() {
    var gs = window.__GAME_STATE__;
    if (!gs || gs.__actsZone || typeof gs.getOverworldZone !== 'function') return;
    var base = gs.getOverworldZone;
    gs.getOverworldZone = function (x, y) {
      var a = cellAct(x, y) === 1 ? 1 : (OWN && x >= 0 && y >= 0 && x < GW && y < GH ? OWN[y * GW + x] : 0);
      if (a > 1 && ZONE[a]) { stats.zone++; return ZONE[a]; }
      return base.apply(this, arguments);
    };
    gs.__actsZone = true;
  }

  // ---------------------------------------------------------------- hosted ("virtual") towns
  // Cinderwatch has no map in the frozen bundle. It is entered as its HOST town's engine map
  // (the index names it: embersRest, the other Act 4 town, so shop stock and healer price are
  // Act 4's) while act1-hifi/adapter.js shows Cinderwatch's own plate, people and exit. The story
  // flag travels with every save, so Continue inside it resumes in the right town.
  function vflag(id) { return 'acts.town.' + id; }
  function setVirtual(id) {
    var p = pstate(); if (!p || !p.storyFlags) return;
    Object.keys(VIRTUAL).forEach(function (v) { if (v === id) p.storyFlags[vflag(v)] = true; else delete p.storyFlags[vflag(v)]; });
  }
  function virtualIn(flags, mapId) {
    if (!flags) return null;
    for (var v in VIRTUAL) if (flags[vflag(v)] && (!mapId || VIRTUAL[v].mapId === mapId)) return v;
    return null;
  }
  function currentVirtual() {
    var p = pstate(); return p ? virtualIn(p.storyFlags) : null;
  }
  // ui-overhaul.js names a SAVED place from the record's own flags (a slot written in Cinderwatch
  // lists as Cinderwatch whatever the live game is doing), and keeps the hosted town with the
  // defeat-respawn record so "return to the last town" goes back to the town she was really in.
  window.__QOK_ACTS_HOSTED__ = {
    current: function () { return currentVirtual(); },
    of: function (mapId, flags) { return virtualIn(flags, mapId); },
    name: function (mapId, flags) {
      var v = virtualIn(flags, mapId);
      if (v) {
        // in the bundle's CURRENT language (the title has no player locale of its own yet)
        var row = M && M.strings && M.strings['map.' + v], q0 = window.__QOK, ja = false, p0 = pstate();
        if (!row) return null;
        try { ja = q0 && typeof q0.loc === 'function' ? q0.loc() === 'ja' : !!(p0 && p0.locale === 'ja'); } catch (e) { ja = false; }
        return ja ? ((p0 && p0.kanjiMode) ? row.jaKanji : row.ja) : row.en;
      }
      var q = window.__QOK, z = q && q.Z && (q.Z.__base || q.Z);
      return z ? z('map.' + mapId) : null;
    },
    enter: function (v, state) {
      var p = state || pstate(); if (!p) return;
      if (!p.storyFlags) p.storyFlags = {};
      Object.keys(VIRTUAL).forEach(function (k) { if (k === v) p.storyFlags[vflag(k)] = true; else delete p.storyFlags[vflag(k)]; });
    }
  };
  // adapter.js asks which town plate to show for an engine map id.
  window.__QOK_ACTS_TOWN_ART__ = function (mapId) {
    var v = currentVirtual();
    return (v && VIRTUAL[v] && VIRTUAL[v].mapId === mapId) ? v : mapId;
  };
  function text(k) {
    var row = k && M && M.strings && M.strings[k]; if (!row) return null;
    var p = pstate();
    if (!p || p.locale !== 'ja') return row.en;
    return p.kanjiMode ? row.jaKanji : row.ja;
  }
  // adapter.js bundlePredates() falls back to this for keys the bundle's i18n does not know.
  window.__QOK_ACTS_TEXT__ = text;
  // The DOM UI (ui-overhaul.js: location chip, shop title, save-slot place name) asks the bundle's
  // translate function for 'map.<engine map id>'. Inside a hosted town that is the HOST's name, so
  // the exposed function is wrapped: the hosted town's own name while she is in it, and the index's
  // text for any key the bundle does not know. The bundle's own closure is not touched.
  function wrapText() {
    var q = window.__QOK;
    if (!q || typeof q.Z !== 'function' || q.Z.__acts) return;
    var base = q.Z;
    var f = function (k) {
      if (typeof k === 'string' && k.indexOf('map.') === 0) {
        var v = currentVirtual();
        if (v && VIRTUAL[v] && k === 'map.' + VIRTUAL[v].mapId) { var own = text('map.' + v); if (own) return own; }
      }
      var r = base.apply(this, arguments);
      if (M.strings && M.strings[k] && (r === k || (typeof r === 'string' && r.charAt(0) === '['))) { var t = text(k); if (t) return t; }
      return r;
    };
    f.__acts = true; f.__base = base; q.Z = f;
  }

  // The bundle writes the place name on its HUD with its own i18n function (not window.__QOK.Z), and
  // ui-overhaul.js copies that text into its chip. Inside a hosted town it must read the town's name.
  function nameHosted(s) {
    var v = currentVirtual(); if (!v || !VIRTUAL[v] || s.currentMapId !== VIRTUAL[v].mapId) return;
    var ft = s.floorText, own = text('map.' + v);
    if (ft && ft.active !== false && own && ft.text !== own && typeof ft.setText === 'function') { try { ft.setText(own); } catch (e) {} }
  }

  // ---------------------------------------------------------------- plates (mapData)
  // Written once per mapData array, like act1-world-map.js's shallow apply. Plates never touch
  // Act 1's rectangle (scripts/build_act_plate.py leaves it out), so the two never fight.
  function eachPlateCell(a, fn) {
    var p = a.rt && a.rt.plate; if (!p) return;
    var w = p.rows[0].length, h = p.rows.length, t = p.tiles, i, rx, ry;
    if (!t) {                                                      // decoded once: -1 = not this act's cell
      t = p.tiles = new Int8Array(w * h);
      for (ry = 0, i = 0; ry < h; ry++) for (rx = 0; rx < w; rx++, i++) { var ch = p.rows[ry].charAt(rx); t[i] = ch === '.' ? -1 : parseInt(ch, 36); }
    }
    for (ry = 0, i = 0; ry < h; ry++) for (rx = 0; rx < w; rx++, i++) if (t[i] >= 0) fn(p.bounds[0] + rx, p.bounds[1] + ry, t[i]);
  }
  var rimFor = null;
  function plate(s, fromExit) {
    if (!s.mapData || s.mapData.length !== GH || !CELL) return;
    var wrote = false, md = s.mapData, dq = window.__DQ_TILES__;
    // ORDER. dq-tiles consolidates a new overworld array and gives it Act 1's plate on its own
    // clock (owEnsureMapSetup). Nothing is written here before that: the consolidation must run
    // over the generator's map, and the copy Act 1's bake is checked against is taken right after.
    if (!dq || typeof dq.overworldSetupDone !== 'function' || !dq.overworldSetupDone(md)) return;
    if (legacy.map !== md) keepLegacy(md);
    ACTS.forEach(function (a) {
      if (!a.rt || READY[a.act] !== 1 || a.rt.appliedTo === md) return;
      eachPlateCell(a, function (x, y, t) { md[y][x] = gateTile(x, y, t); });
      a.rt.appliedTo = md; wrote = true; stats.plateWrites++;
    });
    // Cells no act owns are open sea in the owner's world; the bundle's old geography must not
    // show through there (old coast, old doors).
    if (rimFor !== md && ACTS.some(function (a) { return READY[a.act] === 1; })) {
      for (var y = 0; y < GH; y++) { var row = md[y]; for (var x = 0, i = y * GW; x < GW; x++, i++) if (CELL[i] === 0 && OWN[i] === 0) row[x] = 2; }
      rimFor = md; wrote = true;
    }
    if (wrote) { changed(); if (!fromExit) relocate(s, s.heroTileX, s.heroTileY); }
    else if (!fromExit && !migrated()) relocate(s, s.heroTileX, s.heroTileY);
    if (!wrote) keepPlate(md);
  }
  // INTEGRITY. dq-tiles.js conditions the overworld once per map load (consolidateMapData: stray
  // mountain cells pruned, hollows in a range filled) and may do so AFTER a plate went in, because
  // the packs arrive when they arrive. A filled hollow would make the engine refuse a cell the
  // pixel pack lets her into. One act per tick is compared with its plate and put back, as
  // act1-world-map.js keeps its own rectangle.
  var keepAt = 0;
  function keepPlate(md) {
    var a = ACTS[keepAt++ % ACTS.length], n = 0;
    if (!a || !a.rt || a.rt.appliedTo !== md) return;
    eachPlateCell(a, function (x, y, t) { var row = md[y]; t = gateTile(x, y, t); if (row[x] !== t) { row[x] = t; n++; } });
    if (n) { stats.plateRepairs = (stats.plateRepairs || 0) + n; changed(); }
  }
  // Cells where mapData no longer matches an act plate (verification only; should stay 0).
  function plateDrift() {
    var s = scene(), n = 0, first = null;
    if (!M || !s || !s.mapData) return null;
    ACTS.forEach(function (a) {
      if (a.rt && a.rt.appliedTo === s.mapData) eachPlateCell(a, function (x, y, t) { t = gateTile(x, y, t); if (s.mapData[y][x] !== t) { n++; first = first || [x, y, s.mapData[y][x], t]; } });
    });
    return { cells: n, first: first };
  }
  // SAVE RELOCATION. Two cases, both answered with a door's exit cell (always standable and
  // joined to its door: scripts/acts/check_world.py).
  //   MIGRATION  A save made before this runtime shipped holds an overworld position in the bundle's
  //              old geography. Wherever that cell falls in the new world, she belongs at the door
  //              she was nearest to THEN: the nearest old door of her old zone, at its new exit.
  //              Done once per save; the story flag GEO travels with every later save.
  //   REPAIR     Any later position the index's `reach` raster does not mark (sea, a range, a sealed
  //              pocket) goes to the nearest exit of the act that owns the ground.
  // Act 1's rectangle is never touched: act1-world-map.js relocates its own.
  var GEO = 'acts.geo2';
  function place(s, x, y) {
    var sp = space(); if (!sp) return;
    s.heroTileX = x; s.heroTileY = y;
    if (s.hero) { s.hero.x = sp.cellCenter(x); s.hero.y = sp.cellCenter(y); }
    var p = pstate(); if (p && p.position && p.position.mapId === 'overworld') { p.position.x = x; p.position.y = y; }
    try { if (typeof s.updatePosition === 'function') s.updatePosition(); if (typeof s.updateCamera === 'function') s.updateCamera(); } catch (e) {}
  }
  function oldZone(x, y) { return x < 160 ? (y > 200 ? 1 : 5) : (y > 200 ? 2 : 3); }   // the bundle's getOverworldZone split
  function nearestExit(x, y, migrate) {
    var c = CELL[y * GW + x], act = c > 1 ? c : OWN[y * GW + x], best = null, bd = 1e9;
    for (var pass = 0; pass < 2 && !best; pass++) {
      M.landmarks.forEach(function (L) {
        var ref = migrate ? L.oldFrom : L.exit;
        if (!L.exit || !ref || (BY[L.act] && BY[L.act].rt && BY[L.act].rt.failed)) return;
        if (pass === 0 && (migrate ? oldZone(ref[0], ref[1]) !== oldZone(x, y) : L.act !== act)) return;
        var d = Math.abs(ref[0] - x) + Math.abs(ref[1] - y); if (d < bd) { bd = d; best = L; }
      });
    }
    return best;
  }
  function migrated() { var p = pstate(); return !p || !p.storyFlags || !!p.storyFlags[GEO]; }
  function markMigrated() { var p = pstate(); if (p && p.storyFlags && !p.storyFlags[GEO]) p.storyFlags[GEO] = true; }
  function relocate(s, x, y) {
    if (!REACH || s.currentMapId !== 'overworld') return;
    if (!(x >= 0 && y >= 0 && x < GW && y < GH)) return;
    var c = CELL[y * GW + x];
    if (c === 1) { markMigrated(); return; }
    var mig = !migrated();
    if (!mig && REACH[y * GW + x]) return;
    var act = c > 1 ? c : OWN[y * GW + x];
    if (!mig && act > 1 && READY[act] !== 1) return;              // her act is not in yet (or fell back to the legacy terrain)
    var L = nearestExit(x, y, mig);
    markMigrated();
    if (!L) return;
    place(s, L.exit[0], L.exit[1]);
    stats.relocated++; stats.relocatedFrom = [x, y]; stats.relocatedTo = L.exit.slice(); stats.relocatedHow = mig ? 'migration' : 'repair';
  }

  // ---------------------------------------------------------------- art streaming
  var GROUND_DEPTH = 1.09, UNDER_DEPTH = 0.65, CREST_DEPTH = 1.091, FRONT_DEPTH = 10.5, LANDMARK_DEPTH = 9.6;   // hero is 10; Act 1 base 1.1
  var res = {}, lru = [], queue = [], crests = [], burstUntil = 0, wasOn = false;
  function wanted(s) {
    var sp = space(), cam = s.cameras && s.cameras.main, v = cam && cam.worldView, out = [];
    if (!sp || !v || !(v.width > 0)) return out;
    // Prefetch margin in CELLS, like Act 1's preloadMargin: a whole-chunk ring multiplied residency.
    var cc = M.chunkCells, pm = (M.streaming && M.streaming.preloadCells) || 0;
    var cx0 = sp.cellAt(v.x) - pm, cy0 = sp.cellAt(v.y) - pm, cx1 = sp.cellAt(v.x + v.width) + pm, cy1 = sp.cellAt(v.y + v.height) + pm;
    var mx = (cx0 + cx1) / 2, my = (cy0 + cy1) / 2;
    ACTS.forEach(function (a) {
      if (READY[a.act] !== 1) return;
      var o = a.origin;
      var c0 = Math.max(0, Math.floor((cx0 - o[0]) / cc)), c1 = Math.min(a.cols - 1, Math.floor((cx1 - o[0]) / cc));
      var r0 = Math.max(0, Math.floor((cy0 - o[1]) / cc)), r1 = Math.min(a.rows - 1, Math.floor((cy1 - o[1]) / cc));
      for (var row = r0; row <= r1; row++) for (var col = c0; col <= c1; col++) {
        var c = a.rt.byId['c' + col + '-r' + row]; if (!c) continue;         // no file: sea or unowned
        var dx = o[0] + col * cc + cc / 2 - mx, dy = o[1] + row * cc + cc / 2 - my;
        var x0 = o[0] + col * cc, y0 = o[1] + row * cc;               // on screen now, or only inside the prefetch margin?
        var vis = x0 <= cx1 - pm && x0 + cc >= cx0 + pm && y0 <= cy1 - pm && y0 + cc >= cy0 + pm;
        out.push({ a: a, c: c, col: col, row: row, d: dx * dx + dy * dy, vis: vis });
      }
    });
    out.sort(function (p, q) { return p.d - q.d; });
    return out;
  }
  // One image file -> decoded off the main thread where the browser can -> queued for upload.
  // A failed file is asked for again (three more times, backing off) while its chunk is still wanted:
  // one error under memory pressure used to leave that chunk on the underpaint until she walked away.
  function fetchLayer(e, layer, url, depth, n) {
    var im = new Image();
    if (!n) e.pending++;
    function done() {
      if (e.dead) return;
      e.imgs[layer] = im;
      if (e.parked) { e.pending--; return; }             // landed while off the overworld: uploaded on return
      queue.push({ e: e, layer: layer, im: im, depth: depth });
    }
    im.onload = function () { if (im.decode) im.decode().then(done, done); else done(); };
    im.onerror = function () {
      stats.loadErrors++;
      if (e.dead || (n | 0) >= 3) { e.pending--; return; }
      setTimeout(function () { if (e.dead) { e.pending--; return; } fetchLayer(e, layer, url, depth, (n | 0) + 1); }, 800 * ((n | 0) + 1));
    };
    im.src = url;
  }
  function upload(s, job) {
    var e = job.e; if (e.dead || e.parked || e.scene !== s) return;
    var k = 'acts_' + e.id + '_' + job.layer, sp = space(), c = e.c, a = e.a;
    try {
      if (!s.textures.exists(k)) s.textures.addImage(k, job.im);
      e.texs.push(k);
      var img = s.add.image(e.x, e.y, k).setOrigin(0, 0).setDepth(job.depth);
      img.setDisplaySize(c.width / 16 * sp.pitch, c.height / 16 * sp.pitch);
      if (job.layer.indexOf('crest') === 0) { img.__crest = +job.layer.charAt(5); img.setAlpha(0); crests.push(img); }
      e.objs.push(img); stats.uploads++;
      if (job.layer === 'ground') e.ground = true;
    } catch (x) { stats.loadErrors++; }
    e.pending--;
  }
  function open(s, w) {
    var a = w.a, c = w.c, sp = space(), cc = M.chunkCells, id = 'a' + a.act + '_' + c.id;
    var e = res[id] = { id: id, a: a, c: c, objs: [], texs: [], imgs: {}, scene: s, pending: 0,
      x: (a.origin[0] + w.col * cc) * sp.pitch, y: (a.origin[1] + w.row * cc) * sp.pitch };
    stats.created++;
    fetchLayer(e, 'ground', a.runtime + c.ground, GROUND_DEPTH + a.drawRank * 0.0001);   // overlaps: composite order
    if (c.front) fetchLayer(e, 'front', a.runtime + c.front, FRONT_DEPTH);
    for (var i = 0; i < 3; i++) if (c['crest' + i]) fetchLayer(e, 'crest' + i, a.runtime + c['crest' + i], CREST_DEPTH + i * 0.001);
    return e;
  }
  function gpuDrop(e) {
    e.objs.forEach(function (o) { var i = crests.indexOf(o); if (i >= 0) crests.splice(i, 1); try { o.destroy(); } catch (x) {} });
    e.texs.forEach(function (k) { try { if (e.scene.textures.exists(k)) e.scene.textures.remove(k); } catch (x) {} });
    e.objs = []; e.texs = []; e.ground = false;
  }
  function drop(id) {
    var e = res[id]; if (!e) return;
    e.dead = true; gpuDrop(e); e.imgs = {};
    delete res[id]; var i = lru.indexOf(id); if (i >= 0) lru.splice(i, 1); stats.destroyed++;
  }
  var onScreen = {};
  function stream(s, list) {
    var dq = window.__DQ_TILES__, cap = (M.streaming && M.streaming.maxResident) || 12, want = {};
    var a1 = 0; try { a1 = dq.act1Resident(); } catch (e) {}
    onScreen = {};
    list.forEach(function (w) {
      var id = 'a' + w.a.act + '_' + w.c.id, e = res[id];
      if (w.vis) onScreen[id] = 1;
      // Over budget (a seam, an overlap): a chunk that is only in the prefetch margin waits. What
      // is on screen is always opened; the underpaint covers the margin meanwhile.
      if (!e && !w.vis && lru.length + a1 >= cap) return;
      want[id] = 1;
      if (e && e.scene !== s) { drop(id); e = null; }
      if (!e) e = open(s, w);
      else if (e.parked) {                              // back from a town or a battle: re-upload what is still decoded
        e.parked = false;
        Object.keys(e.imgs).forEach(function (layer) {
          e.pending++;
          queue.push({ e: e, layer: layer, im: e.imgs[layer], depth: layer === 'ground' ? GROUND_DEPTH + e.a.drawRank * 0.0001 : layer === 'front' ? FRONT_DEPTH : CREST_DEPTH + (+layer.charAt(5)) * 0.001 });
        });
      }
      var i = lru.indexOf(id); if (i >= 0) lru.splice(i, 1); lru.push(id);
    });
    // ONE BUDGET FOR THE WORLD. Act 1's resident chunks and these share `cap`. What this tick did
    // not ask for goes first; then Act 1 is asked to hand back chunks its own window does not touch.
    for (var i = 0; i < lru.length && lru.length + a1 > cap;) { if (want[lru[i]]) i++; else drop(lru[i]); }
    if (lru.length + a1 > cap) { try { a1 = dq.trimAct1Chunks(Math.max(0, cap - lru.length)); } catch (e) {} }
    for (var j = list.length - 1; j >= 0 && lru.length + a1 > cap; j--) {      // still over: margin chunks, farthest first
      if (!list[j].vis) drop('a' + list[j].a.act + '_' + list[j].c.id);
    }
    // Uploads are metered like Act 1's (one texture upload can cost a frame): ground first and
    // nearest first; a burst only while arriving, when the player is watching a fade anyway.
    queue.sort(function (p, q) { return (p.layer === 'ground' ? 0 : 1) - (q.layer === 'ground' ? 0 : 1); });
    var n = Date.now() < burstUntil ? 8 : 2;
    while (n-- > 0 && queue.length) upload(s, queue.shift());
  }
  // LEAVING A TOWN. The adapter keeps the screen black until Act 1's base chunks under the camera
  // are on the GPU, and gives up after 5 s. Outside Act 1 there are none to wait for, so every town
  // of Acts 2-5 would open on five seconds of "Loading...". The same question is answered here for
  // the act chunks on screen: ready when each has its ground layer up (Act 1's answer still counts
  // where its chunks are in view too, at a seam).
  function wrapCoverage() {
    var orig = window.__A1_VISIBLE_BASE_COVERAGE__;
    if (typeof orig !== 'function' || orig.__acts) return;
    function coverage(s) {
      var r = orig(s), ids = Object.keys(onScreen);
      if (!r || !ids.length || !s || s.currentMapId !== 'overworld' || (r.visible > 0 && r.missing.length)) return r;
      var missing = ids.filter(function (id) { var e = res[id]; return !(e && !e.parked && e.ground); });
      return { ready: !missing.length, visible: r.visible + ids.length, missing: r.missing.concat(missing),
        reason: missing.length ? 'missing-visible-base' : 'ready', acts: ids.length };
    }
    coverage.__acts = true;
    window.__A1_VISIBLE_BASE_COVERAGE__ = coverage;
  }
  // Off the overworld (town, dungeon, battle) nothing stays on the GPU: every act layer is
  // dropped, as Act 1 drops its own at battle start. The decoded images of the window she left
  // are kept, so coming back is an upload, not a download.
  function park() {
    queue.length = 0;
    Object.keys(res).forEach(function (id) { var e = res[id]; gpuDrop(e); e.parked = true; });
    hideLandmarks(); hideOverrides(); hideUnder();
  }
  // Crest: three premultiplied frames cross-faded on a 1.2 s loop (Act 1's glint timing).
  function animateCrest() {
    if (!crests.length) return;
    var t = (Date.now() % 1200) / 400;
    for (var i = 0; i < crests.length; i++) {
      var o = crests[i], d = Math.abs(((t - o.__crest + 4.5) % 3) - 1.5);   // 0 at its own phase, 1.5 opposite
      o.setAlpha(Math.max(0, 1 - d));
    }
  }
  // Underpaint: one coarse image of the whole act under its chunks, so a chunk that has not
  // landed shows blurred ground instead of the sea backing. Loaded for the act she is near only.
  var under = {}, underTries = {};
  function hideUnder() { Object.keys(under).forEach(function (k) { var u = under[k]; if (u.img) { try { u.img.destroy(); } catch (x) {} u.img = null; } }); }
  function underpaint(s, list) {
    var near = {}, sp = space();
    list.forEach(function (w) { near[w.a.act] = w.a; });
    Object.keys(near).forEach(function (k) {
      var a = near[k], up = a.underpaint, u = under[k]; if (!up) return;
      if (!u) {
        u = under[k] = { im: null, img: null };
        var tries = underTries[k] = (underTries[k] | 0) + 1;
        var im = new Image(); im.onload = function () { u.im = im; underTries[k] = 0; };
        im.onerror = function () { stats.loadErrors++; if (tries < 4) setTimeout(function () { if (under[k] === u && !u.im) delete under[k]; }, 1500 * tries); };   // asked again on a later tick
        im.src = a.runtime + up.file;
      }
      if (u.im && (!u.img || u.img.scene !== s)) {
        var tk = 'acts_under_' + k;
        try {
          if (!s.textures.exists(tk)) s.textures.addImage(tk, u.im);
          u.img = s.add.image(a.origin[0] * sp.pitch, a.origin[1] * sp.pitch, tk).setOrigin(0, 0).setDepth(UNDER_DEPTH + a.drawRank * 0.0001);
          u.img.setDisplaySize(u.im.width / up.pixelsPerCell * sp.pitch, u.im.height / up.pixelsPerCell * sp.pitch);
        } catch (x) { u.img = null; }
      }
    });
    Object.keys(under).forEach(function (k) {
      if (near[k]) return;
      var u = under[k]; if (u.img) { try { u.img.destroy(); if (s.textures.exists('acts_under_' + k)) s.textures.remove('acts_under_' + k); } catch (x) {} u.img = null; }
    });
  }

  // ---------------------------------------------------------------- landmark sprites
  // The act's own sprites, walk-behind by contact row like Act 1. A `carved` landmark is painted
  // into the ground chunks; its door still fires.
  var lmImgs = {}, lmLoad = {};
  function hideLandmarks() { Object.keys(lmImgs).forEach(function (k) { try { lmImgs[k].destroy(); } catch (x) {} delete lmImgs[k]; }); }
  function landmarks(s) {
    var sp = space(), hero = s.hero, cam = s.cameras && s.cameras.main, v = cam && cam.worldView; if (!sp || !v) return;
    var cx0 = sp.cellAt(v.x) - 10, cy0 = sp.cellAt(v.y) - 10, cx1 = sp.cellAt(v.x + v.width) + 10, cy1 = sp.cellAt(v.y + v.height) + 10;
    ACTS.forEach(function (a) {
      var m = a.rt && a.rt.manifest; if (!m || !m.landmarks || READY[a.act] !== 1) return;
      m.landmarks.forEach(function (L) {
        if (L.carved) return;
        var k = 'acts_lm_' + a.act + '_' + L.slug, img = lmImgs[k];
        var near = L.cell[0] >= cx0 && L.cell[0] <= cx1 && L.cell[1] >= cy0 && L.cell[1] <= cy1;
        if (img && (img.scene !== s || !near)) { try { img.destroy(); } catch (x) {} img = null; delete lmImgs[k]; }
        if (!near) { if (!lmLoad[k] && s.textures.exists(k)) { try { s.textures.remove(k); } catch (x) {} } return; }
        if (!img) {
          if (!s.textures.exists(k)) {
            if (!lmLoad[k]) {
              lmLoad[k] = 1;
              var im = new Image();
              im.onload = function () { try { if (!s.textures.exists(k)) s.textures.addImage(k, im); } catch (x) {} delete lmLoad[k]; };
              im.onerror = function () { stats.loadErrors++; setTimeout(function () { delete lmLoad[k]; }, 3000); };
              im.src = a.runtime + 'landmarks/' + L.slug + '.png';
            }
            return;
          }
          img = lmImgs[k] = s.add.image(0, 0, k).setOrigin(L.anchor[0] / L.size, L.anchor[1] / L.size)
            .setPosition(sp.cellCenter(L.cell[0]), sp.cellCenter(L.cell[1])).setDisplaySize(L.size, L.size);
        }
        var behind = hero && hero.y < sp.cellCenter(L.cell[1]);
        img.setDepth(behind ? FRONT_DEPTH : LANDMARK_DEPTH);
      });
    });
  }

  // ---------------------------------------------------------------- art overrides over Act 1
  // Index `overrides` (scripts/acts/act1_seam_override.py, act1_entrance_override.py): release-side
  // repaints that sit over Act 1's layers without touching its files. Each tile: `base` at
  // depths.base (1.26: over Act 1 base/water/crest/foam, under its forest 9.5) and `front` at
  // depths.front (10.51). `hideAct1Landmarks` names the Act 1 sprite an override replaces.
  var ovImgs = {}, hideKeys = null;
  function hideOverrides() { Object.keys(ovImgs).forEach(function (k) { try { ovImgs[k].destroy(); } catch (x) {} delete ovImgs[k]; }); }
  function overrides(s) {
    var sp = space(), cam = s.cameras && s.cameras.main, v = cam && cam.worldView;
    if (!M.overrides || !M.overrides.length || !sp || !v || !(v.width > 0)) return;
    var pm = ((M.streaming && M.streaming.preloadCells) || 0) + 2, want = {};
    var cx0 = sp.cellAt(v.x) - pm, cy0 = sp.cellAt(v.y) - pm, cx1 = sp.cellAt(v.x + v.width) + pm, cy1 = sp.cellAt(v.y + v.height) + pm;
    M.overrides.forEach(function (o) {
      var oy = o.origin[1];
      if (oy > cy1 || oy + o.rows < cy0) return;
      (o.tiles || []).forEach(function (t) {
        if (t.x > cx1 || t.x + t.cols < cx0) return;
        ['base', 'front'].forEach(function (layer) {
          if (!t[layer]) return;
          var k = 'acts_ov_' + o.id + '_' + layer + '_' + t.x; want[k] = 1;
          if (ovImgs[k]) return;
          ovImgs[k] = { destroy: function () {} };          // loading
          var im = new Image();
          im.onload = function () {
            if (!ovImgs[k] || !want[k]) return;
            try {
              if (!s.textures.exists(k)) s.textures.addImage(k, im);
              var img = s.add.image(t.x * sp.pitch, oy * sp.pitch, k).setOrigin(0, 0).setDepth(o.depths[layer]);
              img.setScale(sp.pitch / (o.pixelsPerCell || 32)); ovImgs[k] = img;
            } catch (x) {}
          };
          im.onerror = function () { stats.loadErrors++; };
          im.src = o.path + t[layer];
        });
      });
    });
    Object.keys(ovImgs).forEach(function (k) {
      if (want[k]) return;
      try { ovImgs[k].destroy(); if (s.textures.exists(k)) s.textures.remove(k); } catch (x) {}
      delete ovImgs[k];
    });
    if (hideKeys === null) {
      hideKeys = {}; var any = false;
      M.overrides.forEach(function (o) { (o.hideAct1Landmarks || []).forEach(function (sl) { hideKeys['a1alm_' + sl] = 1; any = true; }); });
      if (!any) hideKeys = false;
    }
    if (hideKeys) {                                         // alpha, so dq's per-tick setVisible(true) does not bring it back
      var list = s.children.list;
      for (var i = 0; i < list.length; i++) { var o = list[i]; if (o.texture && hideKeys[o.texture.key] && o.alpha !== 0) o.setAlpha(0); }
    }
  }

  // ---------------------------------------------------------------- minimap
  // ui-overhaul.js draws one baked relief of the world plus a pin table. Both describe the bundle's
  // old geography outside Act 1; scripts/acts/bake_acts_minimap.py bakes this world's.
  var mmState = 0;                                             // 0 idle, 1 fetching, 2 fetched, 3 handed over / given up
  var mmData = null;
  function minimap() {
    if (mmState === 0) {
      mmState = 1;
      xhr('acts-hifi/minimap.json', 'json', function (d) { mmData = d; mmState = 2; }, function () { mmState = 3; stats.loadErrors++; });
    }
    if (mmState === 2 && window.__QOK_MINIMAP__ && typeof window.__QOK_MINIMAP__.set === 'function') {
      try { window.__QOK_MINIMAP__.set(mmData.src, mmData.marks); } catch (e) {}
      mmState = 3;
    }
  }

  // ---------------------------------------------------------------- tick
  var ovReady = false;
  function tick() {
    loadIndex();
    var s = scene(), g = game();
    if (!M || !s) return;
    ticks++;
    if (!ovReady) { ovReady = true; ovInit(); gatesInit(); }
    wrap(s); wrapZone(); wrapText(); wrapCoverage(); minimap();
    schedule(s);
    var on = s.currentMapId === 'overworld' && s.sys && s.sys.isActive() && !!s.mapData && s.mapData.length === GH;
    if (on) {
      if (!wasOn) burstUntil = Date.now() + 900;
      gateState(s);
      plate(s, false);
      gateTick(s);
      var list = wanted(s);
      underpaint(s, list); stream(s, list); landmarks(s); overrides(s);
      if (g && !g.__actsPrerender) { g.__actsPrerender = true; g.events.on('prerender', animateCrest); g.events.on('prerender', animateGates); }
    } else {
      if (wasOn) { park(); hideGates(); }
      nameHosted(s);
      if (s.sys && s.sys.isActive() && s.currentMapId && s.currentMapId !== 'overworld') markMigrated();
    }
    wasOn = on;
  }
  setInterval(tick, 100);

  window.__QOK_MULTIACT__ = {
    status: function () {
      var objs = 0, texs = 0; Object.keys(res).forEach(function (id) { objs += res[id].objs.length; texs += res[id].texs.length; });
      return { manifest: !!M, fail: fail, ready: READY.slice(), pending: PENDING.slice(), asked: ACTS.map(function (a) { return a.rt ? a.act : 0; }), resident: lru.slice(), onScreen: lru.filter(function (id) { return onScreen[id]; }).length, objects: objs, textures: texs,
        queue: queue.length, landmarks: Object.keys(lmImgs).length, closedTiles: closed.size, virtual: currentVirtual(),
        act1: (function () { try { return window.__DQ_TILES__.act1Resident(); } catch (e) { return null; } })(),
        stats: JSON.parse(JSON.stringify(stats)) };
    },
    entryFor: function (x, y) { return ENTRY[x + ',' + y] || null; },
    index: function () { return M; },
    cellAct: cellAct, reach: function (x, y) { return REACH ? REACH[y * GW + x] : null; },
    blocked: function (px, py) { return blocked(px, py, 20) ? 1 : 0; },
    plateDrift: plateDrift,
    gates: function () {
      return GATES.map(function (g) { return { id: g.id, placement: g.placement, cells: g.cells, shut: !!g.shut, gust: !!g.gust,
        drawn: !!(g.gfx && g.gfx.scene), cleared: !!flag(g.clearedFlag), plays: g.plays || 0 }; });
    }
  };
})();
