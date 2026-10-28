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
  var ENTRY = {}, ARRIVAL = {}, RETURN = {}, ENTRY_EXIT = {}, COMPASS = {};

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
      if (L.exit) { RETURN[L.oldReturn[0] + ',' + L.oldReturn[1]] = L; ENTRY_EXIT[L.exit[0] + ',' + L.exit[1]] = L; }
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
    // The hi-fi town overlay (act1-hifi/adapter.js handleTownExit) never calls checkTransition: it
    // sets heroTileX/Y from the town json's frozen exit and calls loadMap('overworld'). Remap that
    // cell here, so a town's exit follows the door table instead of its own json.
    var loadMap = s.loadMap;
    s.loadMap = function (mapId) {
      if (mapId === 'overworld') {
        var back = RETURN[this.heroTileX + ',' + this.heroTileY];
        if (back && !ENTRY_EXIT[this.heroTileX + ',' + this.heroTileY]) {
          this.heroTileX = back.exit[0]; this.heroTileY = back.exit[1]; stats.exits++;
          try { var p = window.__GAME_STATE__.player.state.position; if (p) { p.x = back.exit[0]; p.y = back.exit[1]; } } catch (e) {}
        }
      }
      return loadMap.apply(this, arguments);
    };
    s.__actsHifiWrapped = true; stats.wrapped++;
  }

  // ---- 1: chunk streaming -------------------------------------------------------------------
  // An act whose index entry names a `runtime` folder streams its real export (format
  // flattened-ground-v0: opaque ground, sparse front, sparse half-res premultiplied crest0-2);
  // any other act draws a tinted placeholder so the wiring stays testable without art.
  var FRONT_DEPTH = 10.5, LANDMARK_DEPTH = 9.6, CREST_DEPTH = 1.091;     // hero is 10 (dq-tiles.js)
  function loadRuntime(a) {
    if (!a.runtime || a.rt) return;
    a.rt = { manifest: null, plate: null, byId: {} };
    get(a.runtime + 'manifest.json', function (m) {
      a.rt.manifest = m; (m.chunks || []).forEach(function (c) { a.rt.byId[c.id] = c; });
    });
    get(a.runtime + 'plate.json', function (p) { a.rt.plate = p; });
    get(a.runtime + 'collision.json', function (c) { a.rt.coll = c; loadBits(a); });
  }
  // The act's feet-only pack: the QOKF8COL bitset Act 1 ships as forest-collision.bin
  // (scripts/acts/export_collision_bin.py). 1 bit per art px, 32 px per cell, act-local origin.
  function loadBits(a) {
    var c = a.rt.coll && a.rt.coll.bin; if (!c) return;
    var r = new XMLHttpRequest(); r.open('GET', a.runtime + c.artifact, true); r.responseType = 'arraybuffer'; r.timeout = 15000;
    r.onload = function () {
      var buf = r.response, b = buf && new Uint8Array(buf), v = buf && new DataView(buf), magic = 'QOKF8COL';
      try {
        for (var i = 0; i < 8; i++) if (b[i] !== magic.charCodeAt(i)) throw 0;
        var w = v.getUint32(12, true), h = v.getUint32(16, true), ppc = v.getUint32(20, true);
        if (v.getUint16(8, true) !== 1 || v.getUint16(10, true) !== 64 || w !== c.dimensionsPx32[0] || h !== c.dimensionsPx32[1]
            || ppc !== 32 || b.length !== 64 + Math.ceil(w * h / 8)) throw 0;
        a.rt.bits = { data: new Uint8Array(buf, 64), w: w, h: h, ox: a.rt.coll.origin[0], oy: a.rt.coll.origin[1] };
      } catch (e) { fail++; }
    };
    r.onerror = r.ontimeout = function () { fail++; };
    try { r.send(); } catch (e) { fail++; }
  }
  // dq-tiles.js a1mFree calls this with canonical solver px (48 per cell) and its feet stencil
  // (a1fBuildStencil, collision px relative to the hero) -- a1fHeroFree with a per-act origin.
  function actsFree(s, x, y, pts) {
    if (!M || !pts) return true;
    var tx = Math.floor(x / 48), ty = Math.floor(y / 48);
    if (act1Inside(tx, ty)) return true;                // Act 1 keeps its own pack
    for (var i = 0; i < M.acts.length; i++) {
      var a = M.acts[i], B = a.rt && a.rt.bits, b = a.bounds;
      if (!B || tx < b[0] || tx > b[2] || ty < b[1] || ty > b[3]) continue;
      var cx = Math.round((x - B.ox * 48) * 32 / 48), cy = Math.round((y - B.oy * 48) * 32 / 48), mg = 1;
      for (var k = 0; k < pts.length; k++) {
        var px = cx + pts[k][0], py = cy + pts[k][1];
        if (bit(B, px, py) || bit(B, px - mg, py) || bit(B, px + mg, py) || bit(B, px, py - mg) || bit(B, px, py + mg)) { stats.blockedSteps = (stats.blockedSteps || 0) + 1; return false; }
      }
      return true;
    }
    return true;
  }
  function bit(B, px, py) {
    if (px < 0 || py < 0 || px >= B.w || py >= B.h) return 0;
    var i = py * B.w + px; return B.data[i >> 3] & (1 << (i & 7));
  }
  function get(url, done) {
    var r = new XMLHttpRequest(); r.open('GET', url, true); r.timeout = 8000;
    r.onload = function () { try { done(JSON.parse(r.responseText)); } catch (e) { fail++; } };
    r.onerror = r.ontimeout = function () { fail++; };
    try { r.send(); } catch (e) { fail++; }
  }
  function placeholderKey(s, a, id) {
    var k = 'acts_ph_' + a.act + '_' + id;
    if (s.textures.exists(k)) return k;
    var n = 64, c = document.createElement('canvas'); c.width = c.height = n;   // 16 KB, not 1 MB
    var g = c.getContext('2d');
    g.fillStyle = a.tint; g.fillRect(0, 0, n, n);
    g.strokeStyle = 'rgba(0,0,0,0.35)'; g.lineWidth = 2; g.strokeRect(1, 1, n - 2, n - 2);
    s.textures.addCanvas(k, c);
    return k;
  }
  // One image file -> one texture, loaded off the Phaser loader so a slow chunk never blocks it.
  function texture(s, e, k, url, then) {
    if (s.textures.exists(k)) { e.texs.push(k); then(k); return; }
    var im = new Image();
    im.onload = function () {
      if (e.dead) return;
      try { if (!s.textures.exists(k)) s.textures.addImage(k, im); e.texs.push(k); then(k); } catch (x) {}
    };
    im.onerror = function () { fail++; };
    im.src = url;
  }
  function chunkObjects(s, e, w, x, y, pitch) {
    var a = w.a, c = a.rt.byId[w.id], cc = M.chunkCells, base = a.runtime, pfx = 'acts_' + a.act + '_' + w.id + '_';
    if (!c) return;                                    // sea / unowned chunk: no file, nothing drawn
    function add(layer, url, depth, alpha) {
      texture(s, e, pfx + layer, base + url, function (k) {
        var img = s.add.image(x, y, k).setOrigin(0, 0).setDepth(depth).setAlpha(alpha);
        img.setScale(cc * pitch / img.width);
        if (layer.indexOf('crest') === 0) img.__crest = +layer.charAt(5);
        e.objs.push(img);
      });
    }
    add('ground', c.ground, CHUNK_DEPTH + 0.04, 1);   // 1.09: under Act 1's base (1.1) in the x161-163 overlap
    if (c.front) add('front', c.front, FRONT_DEPTH, 1);
    for (var i = 0; i < 3; i++) if (c['crest' + i]) add('crest' + i, c['crest' + i], CREST_DEPTH + i * 0.001, 0);
  }
  function wanted(s) {
    var sp = space(), cam = s.cameras && s.cameras.main, v = cam && cam.worldView, out = [];
    if (!sp || !v || !(v.width > 0)) return out;
    // Prefetch margin is in CELLS, like Act 1's preloadMargin: a whole-chunk ring is 16 cells of
    // over-fetch on each side and multiplies residency (measured: 20 chunks vs 12 on a phone view).
    var cc = M.chunkCells, pm = (M.streaming && M.streaming.preloadCells) || 0;
    var cx0 = sp.cellAt(v.x) - pm, cy0 = sp.cellAt(v.y) - pm, cx1 = sp.cellAt(v.x + v.width) + pm, cy1 = sp.cellAt(v.y + v.height) + pm;
    M.acts.forEach(function (a) {
      if (a.runtime && !(a.rt && a.rt.manifest)) return;          // real art still loading
      var o = a.origin;
      var c0 = Math.max(0, Math.floor((cx0 - o[0]) / cc)), c1 = Math.min(a.cols - 1, Math.floor((cx1 - o[0]) / cc));
      var r0 = Math.max(0, Math.floor((cy0 - o[1]) / cc)), r1 = Math.min(a.rows - 1, Math.floor((cy1 - o[1]) / cc));
      for (var row = r0; row <= r1; row++) for (var col = c0; col <= c1; col++) out.push({ a: a, id: 'c' + col + '-r' + row, col: col, row: row });
    });
    return out;
  }
  function drop(id) {
    var e = res[id]; if (!e) return;
    e.dead = true;
    e.objs.forEach(function (o) { try { o.destroy(); } catch (x) {} });
    e.texs.forEach(function (k) { try { if (e.scene.textures.exists(k)) e.scene.textures.remove(k); } catch (x) {} });
    delete res[id]; var i = lru.indexOf(id); if (i >= 0) lru.splice(i, 1); stats.destroyed++;
  }
  function dropAll() { Object.keys(res).forEach(drop); hideLandmarks(); }
  function stream(s) {
    var sp = space(); if (!sp) return;
    var cap = (M.streaming && M.streaming.maxResident) || 12, pitch = sp.pitch, cc = M.chunkCells, want = {};
    wanted(s).forEach(function (w) {
      var id = 'a' + w.a.act + ':' + w.id, e = res[id];
      want[id] = 1;
      if (e && e.scene !== s) { drop(id); e = null; }
      if (!e) {
        var x = (w.a.origin[0] + w.col * cc) * pitch, y = (w.a.origin[1] + w.row * cc) * pitch;
        e = res[id] = { objs: [], texs: [], scene: s }; stats.created++;
        if (w.a.runtime) chunkObjects(s, e, w, x, y, pitch);
        else {
          var img = s.add.image(x, y, placeholderKey(s, w.a, w.id)).setOrigin(0, 0)
            .setDepth(CHUNK_DEPTH + w.a.drawRank * 0.001).setScale(cc * pitch / 64);
          e.objs.push(img);
        }
      }
      var i = lru.indexOf(id); if (i >= 0) lru.splice(i, 1); lru.push(id);
    });
    // The cap evicts only what this tick did not ask for: the visible window is never thrashed.
    for (var i = 0; i < lru.length && lru.length > cap;) { if (want[lru[i]]) i++; else drop(lru[i]); }
  }
  // Crest: three premultiplied frames cross-faded on a 1.2 s loop (dq-tiles a1aWalkBehindTick's job for Act 1).
  function animateCrest() {
    var t = (Date.now() % 1200) / 400;
    Object.keys(res).forEach(function (id) {
      res[id].objs.forEach(function (o) {
        if (o.__crest === undefined) return;
        var d = Math.abs(((t - o.__crest + 4.5) % 3) - 1.5);   // 0 at its own phase, 1.5 opposite
        o.setAlpha(Math.max(0, 1 - d));
      });
    });
  }

  // ---- landmarks: the act's own sprites, walk-behind by contact row like Act 1 ------------------
  var lmImgs = {};
  function hideLandmarks() { Object.keys(lmImgs).forEach(function (k) { try { lmImgs[k].destroy(); } catch (x) {} delete lmImgs[k]; }); }
  function landmarks(s) {
    var sp = space(), hero = s.hero; if (!sp) return;
    M.acts.forEach(function (a) {
      var m = a.rt && a.rt.manifest; if (!m || !m.landmarks) return;
      m.landmarks.forEach(function (L) {
        var k = 'acts_lm_' + a.act + '_' + L.slug, img = lmImgs[k];
        if (img && img.scene !== s) { try { img.destroy(); } catch (x) {} img = null; delete lmImgs[k]; }
        if (!img) {
          if (!s.textures.exists(k)) {
            if (!lmImgs['load:' + k]) {
              lmImgs['load:' + k] = { destroy: function () {} };
              var im = new Image(); im.onload = function () { try { s.textures.addImage(k, im); } catch (x) {} delete lmImgs['load:' + k]; };
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

  // ---- collision: write the act's plate into mapData (act1-world-map.js writePlate) ----------
  // Written once per mapData array, like act1-world-map.js's shallow apply. There is no periodic
  // repair: the only other writer was act1-world-map's own plate in the x 161-163 strip both acts
  // claim, and scripts/build_act_plate.py now leaves Act 1's rectangle out of every act plate.
  function eachPlateCell(a, fn) {
    var p = a.rt && a.rt.plate; if (!p) return;
    for (var ry = 0; ry < p.rows.length; ry++) {
      var row = p.rows[ry];
      for (var rx = 0; rx < row.length; rx++) {
        var ch = row.charAt(rx); if (ch !== '.') fn(p.bounds[0] + rx, p.bounds[1] + ry, parseInt(ch, 36));
      }
    }
  }
  function plate(s) {
    if (!s.mapData || s.mapData.length !== 400) return;
    var wrote = false;
    M.acts.forEach(function (a) {
      if (!a.rt || !a.rt.plate || a.rt.appliedTo === s.mapData) return;
      eachPlateCell(a, function (x, y, t) { s.mapData[y][x] = t; });
      a.rt.appliedTo = s.mapData; wrote = true; stats.plateWrites = (stats.plateWrites || 0) + 1;
    });
    if (wrote) { try { window.__DQ_TILES__.redraw(); } catch (x) {} }
  }
  // Cells where mapData no longer matches an act plate (verification only; should stay 0).
  function plateDrift() {
    var s = scene(), n = 0, first = null;
    if (!M || !s || !s.mapData) return null;
    M.acts.forEach(function (a) {
      if (a.rt && a.rt.appliedTo === s.mapData) eachPlateCell(a, function (x, y, t) { if (s.mapData[y][x] !== t) { n++; first = first || [x, y, s.mapData[y][x], t]; } });
    });
    return { cells: n, first: first };
  }
  // The legacy procedural props (trees, mountains, old landmark sprites, depth 2-9.9) still draw
  // from the plate's tiles. Inside an act that has real art they are hidden every frame, the
  // same suppression dq-tiles applies inside Act 1's plate (a1aPlateCell).
  function realArtCell(x, y) {
    if (act1Inside(x, y)) return false;
    for (var i = 0; i < M.acts.length; i++) {
      var a = M.acts[i], b = a.bounds;
      if (a.rt && a.rt.manifest && x >= b[0] && x <= b[2] && y >= b[1] && y <= b[3]) return true;
    }
    return false;
  }
  var mine = null;
  function suppressLegacy() {
    var s = scene(), sp = space();
    if (!M || !s || !sp || s.currentMapId !== 'overworld' || !s.children) return;
    if (!mine || mine.frame !== s.game.loop.frame) {
      mine = { frame: s.game.loop.frame, set: new Set() };
      Object.keys(res).forEach(function (id) { res[id].objs.forEach(function (o) { mine.set.add(o); }); });
      Object.keys(lmImgs).forEach(function (k) { mine.set.add(lmImgs[k]); });
    }
    var list = s.children.list;
    for (var i = 0; i < list.length; i++) {
      var o = list[i];
      if (!o.visible || o === s.hero || o.scrollFactorX === 0 || mine.set.has(o)) continue;
      if (!(o.depth >= 1.5 && o.depth < 10)) continue;
      if (o.type === 'Container') {                    // dq's prop layer: one container, children in its own (scaled) space
        for (var j = 0; j < o.list.length; j++) {
          var ch = o.list[j]; if (!ch.visible) continue;
          if (realArtCell(sp.cellAt(o.x + ch.x * o.scaleX), sp.cellAt(o.y + ch.y * o.scaleY))) { ch.setVisible(false); stats.hidden = (stats.hidden || 0) + 1; }
        }
        continue;
      }
      if (realArtCell(sp.cellAt(o.x), sp.cellAt(o.y))) { o.setVisible(false); stats.hidden = (stats.hidden || 0) + 1; }
    }
  }

  function tick() {
    load();
    var s = scene();
    if (!M || !s) return;
    M.acts.forEach(loadRuntime);
    window.__QOK_ACTS_FREE__ = actsFree;              // dq-tiles a1mFree feet test (see there)
    window.__QOK_ACTS_ART_CELL__ = realArtCell;       // dq-tiles rebuildOverlay: no props under act art
    wrap(s);
    if (s.currentMapId === 'overworld' && s.sys && s.sys.isActive()) {
      plate(s); stream(s); landmarks(s);
      if (!s.game.__actsPrerender) { s.game.__actsPrerender = true; s.game.events.on('prerender', suppressLegacy); s.game.events.on('prerender', animateCrest); }
    } else if (lru.length) dropAll();                  // town, dungeon, battle: hold nothing
  }
  setInterval(tick, 120);

  window.__QOK_MULTIACT__ = {
    status: function () {
      return { manifest: !!M, fail: fail, resident: lru.slice(), stats: JSON.parse(JSON.stringify(stats)) };
    },
    entryFor: function (x, y) { return ENTRY[x + ',' + y] || null; },
    plateDrift: plateDrift,
  };
})();
