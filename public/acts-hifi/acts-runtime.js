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
  function xhr(url, type, done, bad) {
    var r = new XMLHttpRequest(); r.open('GET', url, true); r.timeout = 20000;
    if (type === 'bin') r.responseType = 'arraybuffer';
    r.onload = function () {
      if (r.status && r.status >= 400) { bad(); return; }
      try { done(type === 'bin' ? r.response : JSON.parse(r.responseText)); } catch (e) { bad(); }
    };
    r.onerror = r.ontimeout = bad;
    try { r.send(); } catch (e) { bad(); }
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
      ACTS = m.acts; ACTS.forEach(function (a) { BY[a.act] = a; });
      M = m;
      ACTS.forEach(loadAct);
    }, function () { req = false; fail++; nextTry = Date.now() + Math.min(8000, 500 * fail); });
  }
  // An act is READY when its chunk manifest, its plate and its collision pack are all in. Until
  // then the hero is held inside it (hold(), like Act 1's own readiness gate); if a file fails for
  // good the act falls back to the legacy terrain and the engine's tile rules instead of hanging.
  function loadAct(a) {
    if (!a.runtime) return;
    a.rt = { manifest: null, plate: null, bits: null, byId: {}, tries: 0, failed: false, appliedTo: null };
    PENDING[a.act] = 1;
    var left = 3;
    function part(url, type, set) {
      (function go(n) {
        xhr(a.runtime + url, type, function (v) {
          try { set(v); } catch (e) { giveUp(); return; }
          if (--left === 0) ready(a);
        }, function () { stats.loadErrors++; if (n < 4) setTimeout(function () { go(n + 1); }, 400 * (n + 1)); else giveUp(); });
      })(0);
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
  function ready(a) { READY[a.act] = 1; PENDING[a.act] = 0; changed(); }
  // The answer to artCell() just changed: the movement field and the prop overlay were built on the old one.
  function changed() {
    var dq = window.__DQ_TILES__;
    try { dq.refreshMovementField(); } catch (e) {}
    try { dq.redraw(); } catch (e) {}
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
    return PENDING[cellAct(Math.floor(x / 48), Math.floor(y / 48))] === 1;
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
  window.__QOK_ACTS__ = { artCell: artCell, free: free, normal: normal, hold: hold, viewCovered: viewCovered };

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
  function currentVirtual() {
    var p = pstate(); if (!p || !p.storyFlags) return null;
    for (var v in VIRTUAL) if (p.storyFlags[vflag(v)]) return v;
    return null;
  }
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
    f.__acts = true; q.Z = f;
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
    var wrote = false, md = s.mapData;
    ACTS.forEach(function (a) {
      if (!a.rt || READY[a.act] !== 1 || a.rt.appliedTo === md) return;
      eachPlateCell(a, function (x, y, t) { md[y][x] = t; });
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
    eachPlateCell(a, function (x, y, t) { var row = md[y]; if (row[x] !== t) { row[x] = t; n++; } });
    if (n) { stats.plateRepairs = (stats.plateRepairs || 0) + n; changed(); }
  }
  // Cells where mapData no longer matches an act plate (verification only; should stay 0).
  function plateDrift() {
    var s = scene(), n = 0, first = null;
    if (!M || !s || !s.mapData) return null;
    ACTS.forEach(function (a) {
      if (a.rt && a.rt.appliedTo === s.mapData) eachPlateCell(a, function (x, y, t) { if (s.mapData[y][x] !== t) { n++; first = first || [x, y, s.mapData[y][x], t]; } });
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
  function fetchLayer(e, layer, url, depth) {
    var im = new Image();
    e.pending++;
    function done() {
      if (e.dead) return;
      e.imgs[layer] = im;
      if (e.parked) { e.pending--; return; }             // landed while off the overworld: uploaded on return
      queue.push({ e: e, layer: layer, im: im, depth: depth });
    }
    im.onload = function () { if (im.decode) im.decode().then(done, done); else done(); };
    im.onerror = function () { e.pending--; stats.loadErrors++; };
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
    e.objs = []; e.texs = [];
  }
  function drop(id) {
    var e = res[id]; if (!e) return;
    e.dead = true; gpuDrop(e); e.imgs = {};
    delete res[id]; var i = lru.indexOf(id); if (i >= 0) lru.splice(i, 1); stats.destroyed++;
  }
  function stream(s, list) {
    var dq = window.__DQ_TILES__, cap = (M.streaming && M.streaming.maxResident) || 12, want = {};
    var a1 = 0; try { a1 = dq.act1Resident(); } catch (e) {}
    list.forEach(function (w) {
      var id = 'a' + w.a.act + '_' + w.c.id, e = res[id];
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
  var under = {};
  function hideUnder() { Object.keys(under).forEach(function (k) { var u = under[k]; if (u.img) { try { u.img.destroy(); } catch (x) {} u.img = null; } }); }
  function underpaint(s, list) {
    var near = {}, sp = space();
    list.forEach(function (w) { near[w.a.act] = w.a; });
    Object.keys(near).forEach(function (k) {
      var a = near[k], up = a.underpaint, u = under[k]; if (!up) return;
      if (!u) {
        u = under[k] = { im: null, img: null };
        var im = new Image(); im.onload = function () { u.im = im; }; im.onerror = function () { stats.loadErrors++; }; im.src = a.runtime + up.file;
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
    if (!ovReady) { ovReady = true; ovInit(); }
    wrap(s); wrapZone(); wrapText(); minimap();
    var on = s.currentMapId === 'overworld' && s.sys && s.sys.isActive() && !!s.mapData && s.mapData.length === GH;
    if (on) {
      if (!wasOn) burstUntil = Date.now() + 900;
      plate(s, false);
      var list = wanted(s);
      underpaint(s, list); stream(s, list); landmarks(s); overrides(s);
      if (g && !g.__actsPrerender) { g.__actsPrerender = true; g.events.on('prerender', animateCrest); }
    } else {
      if (wasOn) park();
      if (s.sys && s.sys.isActive() && s.currentMapId && s.currentMapId !== 'overworld') markMigrated();
    }
    wasOn = on;
  }
  setInterval(tick, 100);

  window.__QOK_MULTIACT__ = {
    status: function () {
      var objs = 0, texs = 0; Object.keys(res).forEach(function (id) { objs += res[id].objs.length; texs += res[id].texs.length; });
      return { manifest: !!M, fail: fail, ready: READY.slice(), pending: PENDING.slice(), resident: lru.slice(), objects: objs, textures: texs,
        queue: queue.length, landmarks: Object.keys(lmImgs).length, closedTiles: closed.size, virtual: currentVirtual(),
        act1: (function () { try { return window.__DQ_TILES__.act1Resident(); } catch (e) { return null; } })(),
        stats: JSON.parse(JSON.stringify(stats)) };
    },
    entryFor: function (x, y) { return ENTRY[x + ',' + y] || null; },
    index: function () { return M; },
    cellAct: cellAct, reach: function (x, y) { return REACH ? REACH[y * GW + x] : null; },
    blocked: function (px, py) { return blocked(px, py, 20) ? 1 : 0; },
    plateDrift: plateDrift
  };
})();
