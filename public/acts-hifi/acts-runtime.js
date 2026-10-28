// ACTS 2-5 OVERWORLD RUNTIME -- PROTOTYPE, OFF BY DEFAULT.
//
// Design: docs/plans/2026-10-28-acts2-5-runtime-wiring.md. index.html only loads this file when
// localStorage['qok-multiact-hifi']==='1' or the URL carries ?multiact=1, so with the flag off it
// is never requested and Act 1 runs byte-for-byte as build 91.
//
// What it does, generalising the three Act 1 pieces to every other act:
//   1. STREAMING (act1-hifi chunk loader in dq-tiles.js): a camera-radius window of 16-cell chunks
//      per act, LRU-capped. Until an act's art exists its manifest entry has chunkPath:null and a
//      tinted placeholder is drawn instead, so the wiring is testable with no art.
//   2. DOORS (act1-world-map.js checkTransition wrapper): the owner's door cells fire the bundle's
//      own destination; the bundle's frozen doors for the same destinations are switched off; an
//      interior's return to its frozen overworld cell lands on the owner's exit cell instead.
//   3. COMPASS (act1-world-map.js getCompassTarget wrapper): frozen ox/oy -> owner cell.
// It deliberately does NOT write collision into mapData yet -- see the design doc, "collision".
(function () {
  'use strict';
  var flag = false;
  try { flag = localStorage.getItem('qok-multiact-hifi') === '1' || /[?&]multiact=1\b/.test(location.search); } catch (e) {}
  if (!flag) return;

  var CHUNK_DEPTH = 1.05;               // above the legacy terrain canvas (1), below Act 1 base (1.1)
  var M = null, req = false, fail = 0;
  var res = {}, lru = [], stats = { created: 0, destroyed: 0, wrapped: 0, entries: 0, exits: 0, suppressed: 0, compass: 0 };
  var ENTRY = {}, ARRIVAL = {}, RETURN = {}, COMPASS = {};

  function load() {
    if (M || req || fail >= 6) return;
    req = true;
    var r = new XMLHttpRequest(); r.open('GET', 'acts-hifi/manifest.json', true); r.timeout = 5000;
    r.onload = function () {
      req = false;
      try {
        var m = JSON.parse(r.responseText);
        if (!m || m.schema !== 'qok-acts-hifi-v1' || !m.acts) throw new Error('schema');
        index(m); M = m;
      } catch (e) { fail++; }
    };
    r.onerror = r.ontimeout = function () { req = false; fail++; };
    try { r.send(); } catch (e) { req = false; fail++; }
  }
  function key(t, x, y, f) { return t + '|' + x + '|' + y + '|' + (f || 0); }
  function index(m) {
    (m.landmarks || []).forEach(function (L) {
      ENTRY[L.at[0] + ',' + L.at[1]] = L;
      ARRIVAL[key(L.mapId, L.toX, L.toY, L.toFloor)] = L;
      if (L.exit) RETURN[L.oldReturn[0] + ',' + L.oldReturn[1]] = L;
      if (!COMPASS[L.oldFrom[0] + ',' + L.oldFrom[1]]) COMPASS[L.oldFrom[0] + ',' + L.oldFrom[1]] = L;
    });
    // The bundle's compass chain disagrees with its own connection table for one map.
    var sr = (m.landmarks || []).filter(function (L) { return L.mapId === 'scorchedRuins'; })[0];
    if (sr) COMPASS['278,95'] = sr;
  }

  function scene() {
    var g = window.__PHASER_GAME__;
    return g && g.scene && g.scene.getScene ? g.scene.getScene('WorldMapScene') : null;
  }
  function space() { var dq = window.__DQ_TILES__; return dq && dq.overworldSpace; }
  function act1Inside(x, y) {
    var W = window.__ACT1_WORLD_MAP__, b = W && W.bounds;
    return !!(b && x >= b[0] && x <= b[2] && y >= b[1] && y <= b[3]);
  }

  // ---- 2 + 3: doors and compass -------------------------------------------------------------
  function wrap(s) {
    if (!M || !s || s.__actsHifiWrapped) return;
    if (typeof s.checkTransition !== 'function' || typeof s.getCompassTarget !== 'function') return;
    var check = s.checkTransition, compass = s.getCompassTarget;
    s.checkTransition = function (x, y) {
      if (this.currentMapId === 'overworld' && !act1Inside(x, y)) {
        var L = ENTRY[x + ',' + y];
        if (L) {
          if (this.transitionCooldown > 0) { this.transitionCooldown--; return null; }
          stats.entries++;
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
    s.__actsHifiWrapped = true; stats.wrapped++;
  }

  // ---- 1: chunk streaming -------------------------------------------------------------------
  function placeholderKey(s, a, id) {
    var k = 'acts_ph_' + a.act + '_' + id;
    if (s.textures.exists(k)) return k;
    var n = 64, c = document.createElement('canvas'); c.width = c.height = n;   // 16 KB, not 1 MB
    var g = c.getContext('2d');
    g.fillStyle = a.tint; g.fillRect(0, 0, n, n);
    g.strokeStyle = 'rgba(0,0,0,0.35)'; g.lineWidth = 2; g.strokeRect(1, 1, n - 2, n - 2);
    g.fillStyle = 'rgba(0,0,0,0.55)'; g.font = '9px sans-serif';
    g.fillText('A' + a.act + ' ' + id, 4, 12);
    s.textures.addCanvas(k, c);
    return k;
  }
  function wanted(s) {
    var sp = space(), cam = s.cameras && s.cameras.main, v = cam && cam.worldView, out = [];
    if (!sp || !v || !(v.width > 0)) return out;
    // Prefetch margin is in CELLS, like Act 1's preloadMargin: a whole-chunk ring is 16 cells of
    // over-fetch on each side and multiplies residency (measured: 20 chunks vs 12 on a phone view).
    var cc = M.chunkCells, pm = (M.streaming && M.streaming.preloadCells) || 0;
    var cx0 = sp.cellAt(v.x) - pm, cy0 = sp.cellAt(v.y) - pm, cx1 = sp.cellAt(v.x + v.width) + pm, cy1 = sp.cellAt(v.y + v.height) + pm;
    M.acts.forEach(function (a) {
      var o = a.origin;
      var c0 = Math.max(0, Math.floor((cx0 - o[0]) / cc)), c1 = Math.min(a.cols - 1, Math.floor((cx1 - o[0]) / cc));
      var r0 = Math.max(0, Math.floor((cy0 - o[1]) / cc)), r1 = Math.min(a.rows - 1, Math.floor((cy1 - o[1]) / cc));
      for (var row = r0; row <= r1; row++) for (var col = c0; col <= c1; col++) out.push({ a: a, id: 'c' + col + '-r' + row, col: col, row: row });
    });
    return out;
  }
  function drop(id) {
    var e = res[id]; if (!e) return;
    try { e.img.destroy(); } catch (x) {}
    try { if (e.scene.textures.exists(e.tex)) e.scene.textures.remove(e.tex); } catch (x) {}
    delete res[id]; var i = lru.indexOf(id); if (i >= 0) lru.splice(i, 1); stats.destroyed++;
  }
  function dropAll() { Object.keys(res).forEach(drop); }
  function stream(s) {
    var sp = space(); if (!sp) return;
    var cap = (M.streaming && M.streaming.maxResident) || 12, pitch = sp.pitch, cc = M.chunkCells, want = {};
    wanted(s).forEach(function (w) {
      var id = 'a' + w.a.act + ':' + w.id, e = res[id];
      want[id] = 1;
      if (e && e.scene !== s) { drop(id); e = null; }
      if (!e) {
        // Real art: w.a.chunkPath is a template like "act2/chunks/{layer}/{id}.webp". Not wired in
        // the prototype (no art yet); the design doc specifies the loader it reuses from dq-tiles.
        var tex = placeholderKey(s, w.a, w.id);
        var img = s.add.image((w.a.origin[0] + w.col * cc) * pitch, (w.a.origin[1] + w.row * cc) * pitch, tex)
          .setOrigin(0, 0).setDepth(CHUNK_DEPTH + w.a.drawRank * 0.001);
        img.setScale(cc * pitch / 64);
        e = res[id] = { img: img, scene: s, tex: tex }; stats.created++;
      }
      var i = lru.indexOf(id); if (i >= 0) lru.splice(i, 1); lru.push(id);
    });
    // The cap evicts only what this tick did not ask for: the visible window is never thrashed.
    for (var i = 0; i < lru.length && lru.length > cap;) { if (want[lru[i]]) i++; else drop(lru[i]); }
  }

  function tick() {
    load();
    var s = scene();
    if (!M || !s) return;
    wrap(s);
    if (s.currentMapId === 'overworld' && s.sys && s.sys.isActive()) stream(s);
    else if (lru.length) dropAll();                    // town, dungeon, battle: hold nothing
  }
  setInterval(tick, 120);

  window.__QOK_MULTIACT__ = {
    status: function () {
      return { manifest: !!M, fail: fail, resident: lru.slice(), stats: JSON.parse(JSON.stringify(stats)) };
    },
    entryFor: function (x, y) { return ENTRY[x + ',' + y] || null; },
  };
})();
