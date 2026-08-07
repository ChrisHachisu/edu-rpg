/* ============================================================
   Quest of Knowledge — "Storybook Quest" DOM UI controller.
   Renders the locked mockups as a full-screen DOM overlay driven
   by live game state; routes taps to the existing Phaser scene
   methods (which run the real logic). Keyboard is handled natively
   by the Phaser scenes, so this overlay is dual-input by polling
   scene state every frame and re-rendering when it changes.

   ADDITIVE: only shows while a recognized scene is active; the live
   game is untouched on any screen not yet implemented here.
   ============================================================ */
(function () {
  'use strict';

  // ---- bridges (never throw) ----
  function G()   { return window.__PHASER_GAME__; }
  function QOK() { return window.__QOK; }
  function GS()  { return window.__GAME_STATE__; }
  function Z(k, p) { var q = QOK(); return (q && q.Z) ? q.Z(k, p) : k; }
  function find(id) { var q = QOK(); return (q && q.find) ? q.find(id) : null; }
  function pstate() { var s = GS(); return (s && s.player && s.player.state) ? s.player.state : null; }
  function player()  { var s = GS(); return (s && s.player) ? s.player : null; }
  // true global locale (vi()) — matches what Z() renders; falls back to player state.
  function locale() { var q = QOK(); if (q && q.loc) { try { return q.loc(); } catch (e) {} } var s = pstate(); return (s && s.locale) || 'en'; }
  function isJa()   { return locale() === 'ja'; }

  function sceneActive(key) { var g = G(); try { return !!(g && g.scene && g.scene.isActive(key)); } catch (e) { return false; } }
  function getScene(key)    { var g = G(); try { return g && g.scene && g.scene.getScene(key); } catch (e) { return null; } }

  // ---- icon defs (injected once) ----
  var DEFS =
    '<svg id="qok-defs" width="0" height="0" style="position:absolute" aria-hidden="true">' +
    '<symbol id="qok-sword" viewBox="0 0 24 24"><g fill="currentColor" transform="rotate(42 12 12)">' +
      '<path d="M12 0.6 13.5 4.6 13.5 13.4 10.5 13.4 10.5 4.6Z"/><rect x="6.9" y="13.1" width="10.2" height="2.7" rx="1.2"/>' +
      '<rect x="10.85" y="15.8" width="2.3" height="5" rx="0.7"/><circle cx="12" cy="21.7" r="2"/></g></symbol>' +
    '<symbol id="qok-run" viewBox="0 0 24 24"><g fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round">' +
      '<path d="M15.4 8.4 11.7 12.7"/><path d="M15.6 9 19.7 10.7"/><path d="M13.7 9.1 10 7.5"/><path d="M11.7 12.7 15.7 14.5 14.2 19"/><path d="M11.7 12.7 8 13.9 5.3 17.8"/></g>' +
      '<circle cx="17" cy="4.5" r="2.3" fill="currentColor"/><g fill="currentColor"><rect x="1.2" y="4.4" width="4.8" height="1.8" rx="0.9" opacity="0.9"/><rect x="0.6" y="8.1" width="5.8" height="1.8" rx="0.9" opacity="0.72"/><rect x="2" y="11.8" width="4.4" height="1.8" rx="0.9" opacity="0.55"/></g></symbol>' +
    '<symbol id="qok-potion" viewBox="0 0 24 24"><path fill="currentColor" d="M9 2h6v2l-1 1v3.2l3.6 6.3A3 3 0 0114 19H10a3 3 0 01-3.6-4.5L10 8.2V5L9 4z"/><rect x="8" y="14" width="8" height="4" fill="#ffffff55"/></symbol>' +
    '<symbol id="qok-shield" viewBox="0 0 24 24"><path d="M12 2.4l8.2 2.7v6.3c0 5.7-3.5 9-8.2 10.9C7.3 20.4 3.8 17.1 3.8 11.4V5.1z" fill="#bf8a4a"/><path d="M12 2.4l8.2 2.7v6.3c0 5.7-3.5 9-8.2 10.9z" fill="#a8763c"/><path d="M12 4.6l6.1 2v5.1c0 4.4-2.7 6.9-6.1 8.4-3.4-1.5-6.1-4-6.1-8.4V6.6z" fill="#6fb6ea"/><path d="M12 4.6l6.1 2v5.1c0 4.4-2.7 6.9-6.1 8.4z" fill="#4f97d0"/><circle cx="12" cy="11" r="2.5" fill="#e0b757"/><circle cx="12" cy="11" r="2.5" fill="none" stroke="#9a7a36" stroke-width=".7"/><path d="M12 2.4l8.2 2.7v6.3c0 5.7-3.5 9-8.2 10.9C7.3 20.4 3.8 17.1 3.8 11.4V5.1z" fill="none" stroke="#6e4f23" stroke-width="1.1"/></symbol>' +
    // qok-shieldw is GONE. It hardcoded fill="#fff", so it was the one glyph in here that could
    // not be tinted at all -- it only ever looked right because it sat on a saturated blue block
    // that made white the only sane colour. Its sole consumer was BATTLE_ACT's Defend, which now
    // takes its glyph from the battle-icons mask, and a symbol that cannot follow currentColor is
    // a trap to leave lying around for the next screen that has no coloured block behind it.
    '<symbol id="qok-armorf" viewBox="0 0 24 24"><ellipse cx="5.4" cy="8.4" rx="3.2" ry="2.7" fill="#8d9bad"/><ellipse cx="18.6" cy="8.4" rx="3.2" ry="2.7" fill="#8d9bad"/><ellipse cx="5.4" cy="7.7" rx="3.1" ry="2" fill="#c2cedd"/><ellipse cx="18.6" cy="7.7" rx="3.1" ry="2" fill="#c2cedd"/><path d="M8 6c1.3 1.6 2.5 2.2 4 2.2s2.7-.6 4-2.2l.6 6.4c0 1.4-.5 2.6-1.1 3.2H8.5c-.6-.6-1.1-1.8-1.1-3.2z" fill="#aab8c9"/><path d="M12 8.2v7.6" stroke="#73828f" stroke-width="1"/><path d="M8.4 9.6c2.4 1.4 4.8 1.4 7.2 0" stroke="#828f9f" stroke-width=".8" fill="none"/><path d="M9.1 9.2c-.45 1.5-.45 3.1 0 4.7" stroke="#cdd8e6" stroke-width="1" fill="none" opacity=".5"/><path d="M14.9 9.2c.45 1.5.45 3.1 0 4.7" stroke="#cdd8e6" stroke-width="1" fill="none" opacity=".5"/><rect x="8" y="16" width="8" height="1.5" rx=".6" fill="#9aaabd"/><rect x="8.5" y="17.9" width="7" height="1.5" rx=".6" fill="#9aaabd"/><rect x="9" y="19.8" width="6" height="1.5" rx=".6" fill="#9aaabd"/><path d="M8 6c1.3 1.6 2.5 2.2 4 2.2s2.7-.6 4-2.2" fill="none" stroke="#e0b757" stroke-width="1.3"/></symbol>' +
    '<symbol id="qok-swordf" viewBox="0 0 24 24"><g transform="translate(12 12) rotate(42) scale(1.12) translate(-12 -12)"><path d="M12 1.4l1.7 3.8v8.6h-3.4V5.2z" fill="#cfd8e3"/><path d="M12 1.4l1.7 3.8v8.6H12z" fill="#a9b6c5"/><rect x="11.6" y="5.4" width="0.8" height="8.2" fill="#eef4fa"/><path d="M12 1.4l.9 2.6h-1.8z" fill="#f2f7fc"/><path d="M6.8 13.6h10.4l-1.1 2.4H7.9z" fill="#e0b757"/><path d="M6.8 13.6h10.4l-.5 1.1H7.3z" fill="#f2d684"/><circle cx="7.1" cy="14.3" r="1.05" fill="#c79a3f"/><circle cx="16.9" cy="14.3" r="1.05" fill="#c79a3f"/><rect x="10.7" y="16" width="2.6" height="4.6" rx=".6" fill="#7a4a28"/><rect x="10.7" y="16.9" width="2.6" height=".7" fill="#5a3620"/><rect x="10.7" y="18.3" width="2.6" height=".7" fill="#5a3620"/><rect x="10.7" y="19.7" width="2.6" height=".7" fill="#5a3620"/><circle cx="12" cy="21.4" r="1.7" fill="#e0b757"/><circle cx="12" cy="21.4" r="1.7" fill="none" stroke="#c79a3f" stroke-width=".5"/><circle cx="11.4" cy="20.9" r=".55" fill="#f2d684"/></g></symbol>' +
    '<symbol id="qok-helmf" viewBox="0 0 24 24"><path d="M5 11.2a7 7 0 0114 0v4.6a2.1 2.1 0 01-2.1 2.1H7.1A2.1 2.1 0 015 15.8z" fill="#aab8c9"/><path d="M12 4.2a7 7 0 017 7v4.6a2.1 2.1 0 01-2.1 2.1H12z" fill="#9aaabd"/><ellipse cx="9" cy="10" rx="2" ry="2.6" fill="#cdd8e6" opacity=".5"/><rect x="5.4" y="12" width="13.2" height="1.8" fill="#6b7888"/><rect x="11.1" y="11.6" width="1.8" height="6.4" rx=".4" fill="#39414f"/><rect x="7.6" y="14.6" width="2.2" height="1.1" rx=".4" fill="#39414f"/><rect x="14.2" y="14.6" width="2.2" height="1.1" rx=".4" fill="#39414f"/><path d="M12 2.2l1.8 3.4h-3.6z" fill="#e3594f"/><path d="M5 11.2a7 7 0 0114 0" fill="none" stroke="#e0b757" stroke-width="1.1"/></symbol>' +
    '<symbol id="qok-ringf" viewBox="0 0 24 24"><circle cx="12" cy="15.2" r="5.6" fill="none" stroke="#e0b757" stroke-width="2.6"/><circle cx="12" cy="15.2" r="5.6" fill="none" stroke="#b8902f" stroke-width="1" opacity=".55"/><path d="M8.4 8.6L12 2.8l3.6 5.8-3.6 2.1z" fill="#5aa9e6" stroke="#2f6ea0" stroke-width=".6"/><path d="M12 2.8l3.6 5.8-3.6 2.1z" fill="#3f86c4"/><path d="M10.4 4.8l1.4 2-1 1z" fill="#cfeaff" opacity=".85"/></symbol>' +
    '<symbol id="qok-person" viewBox="0 0 24 24"><circle cx="12" cy="8" r="4" fill="none" stroke="currentColor" stroke-width="2"/><path d="M5 20c0-4 3-6 7-6s7 2 7 6" fill="none" stroke="currentColor" stroke-width="2"/></symbol>' +
    '<symbol id="qok-bag" viewBox="0 0 24 24"><path d="M5 8h14l-1 11H6L5 8z" fill="none" stroke="currentColor" stroke-width="2"/><path d="M9 8V6a3 3 0 016 0v2" fill="none" stroke="currentColor" stroke-width="2"/></symbol>' +
    '<symbol id="qok-gear" viewBox="0 0 24 24"><path d="M19.4 13a7.5 7.5 0 000-2l2.1-1.6-2-3.5-2.5 1a7.5 7.5 0 00-1.7-1l-.4-2.6h-4l-.4 2.6a7.5 7.5 0 00-1.7 1l-2.5-1-2 3.5L6.6 11a7.5 7.5 0 000 2l-2.1 1.6 2 3.5 2.5-1a7.5 7.5 0 001.7 1l.4 2.6h4l.4-2.6a7.5 7.5 0 001.7-1l2.5 1 2-3.5z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/><circle cx="12" cy="12" r="3.2" fill="none" stroke="currentColor" stroke-width="2"/></symbol>' +
    '<symbol id="qok-heart" viewBox="0 0 24 24"><path d="M12 21s-7-4.5-7-10a4 4 0 018-1 4 4 0 018 1c0 5.5-7 10-7 10z" fill="#5fcc63" stroke="#2f9c5b" stroke-width="1.5"/></symbol>' +
    '<symbol id="qok-bomb" viewBox="0 0 24 24"><circle cx="11" cy="14" r="6" fill="#5a626f" stroke="#2e333c" stroke-width="1.5"/><path d="M15 8c1-2 3-2 4-1" fill="none" stroke="#7a6541" stroke-width="1.6"/><circle cx="19.5" cy="6" r="1.6" fill="#ffb13a"/></symbol>' +
    '<symbol id="qok-leaf" viewBox="0 0 24 24"><path d="M12 21c0-6 3-10 8-12-1 7-4 11-8 12z" fill="#5fcc63" stroke="#2f9c5b" stroke-width="1.2"/><path d="M12 21c0-5-2-8-6-10 1 6 3 9 6 10z" fill="#7ad07e" stroke="#2f9c5b" stroke-width="1.1"/></symbol>' +
    '<symbol id="qok-flask" viewBox="0 0 24 24"><path d="M10 3h4v4.2l3.3 6.2A3.2 3.2 0 0114.5 18h-5A3.2 3.2 0 016.7 13.4L10 7.2z" fill="currentColor" stroke="#00000040" stroke-width="1"/><rect x="9" y="2" width="6" height="2.4" rx="1" fill="#caa45a"/><ellipse cx="12" cy="15" rx="3.4" ry="2.4" fill="#ffffff44"/></symbol>' +
    '<symbol id="qok-flasko" viewBox="0 0 24 24"><path d="M9 3h6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><path d="M10.5 3.5v4.8l-4.6 8.1A2.2 2.2 0 007.8 19.7h8.4a2.2 2.2 0 001.9-3.3l-4.6-8.1V3.5" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/><path d="M8.4 13.5h7.2" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/></symbol>' +
    '<symbol id="qok-crystal" viewBox="0 0 24 24"><path d="M12 2l5.5 6L12 22 6.5 8z" fill="currentColor" stroke="#ffffff66" stroke-width="1"/><path d="M6.5 8h11M12 2v20" stroke="#ffffff55" stroke-width="0.9"/></symbol>' +
    '<symbol id="qok-armor" viewBox="0 0 24 24"><path d="M5 6l3.5-2L12 6l3.5-2L19 6v4c0 5.5-3.2 9.2-7 11-3.8-1.8-7-5.5-7-11z" fill="none" stroke="currentColor" stroke-width="2"/><path d="M12 6v15" stroke="currentColor" stroke-width="1.5"/></symbol>' +
    '<symbol id="qok-helm" viewBox="0 0 24 24"><path d="M5 11a7 7 0 0114 0v5a2 2 0 01-2 2H7a2 2 0 01-2-2z" fill="none" stroke="currentColor" stroke-width="2"/><path d="M5 13.5h14M11 11.5v6.5" stroke="currentColor" stroke-width="1.6"/></symbol>' +
    '<symbol id="qok-ring" viewBox="0 0 24 24"><circle cx="12" cy="15" r="5.5" fill="none" stroke="currentColor" stroke-width="2"/><path d="M9 8.5l3-4.5 3 4.5z" fill="#ffd23a" stroke="currentColor" stroke-width="1.1"/></symbol>' +
    '<symbol id="qok-bow" viewBox="0 0 24 24"><path d="M5 3a14 14 0 010 18" fill="none" stroke="currentColor" stroke-width="2"/><path d="M5 3v18" stroke="currentColor" stroke-width="1" opacity=".7"/><path d="M4 12h16M16 9l4 3-4 3" fill="none" stroke="currentColor" stroke-width="1.6"/></symbol>' +
    '<symbol id="qok-dagger" viewBox="0 0 24 24"><path d="M12 2l2 12h-4z" fill="currentColor"/><rect x="7.5" y="14" width="9" height="2.2" rx="1" fill="currentColor"/><rect x="11" y="16" width="2" height="6" rx="0.8" fill="currentColor"/></symbol>' +
    // stat icons (ATK / DEF / SPD) — flat single-color glyphs
    '<symbol id="qok-atk" viewBox="0 0 24 24"><g fill="#e3594f"><path d="M12 2l1.7 4.2v7.6h-3.4V6.2z"/><rect x="6.8" y="13.8" width="10.4" height="2.6" rx="1.1"/><rect x="10.7" y="16.4" width="2.6" height="4.6" rx=".7"/><circle cx="12" cy="21.4" r="1.7"/></g></symbol>' +
    '<symbol id="qok-def" viewBox="0 0 24 24"><path fill="#5aa9e6" d="M12 2.4l8.2 2.7v6.3c0 5.7-3.5 9-8.2 10.9C7.3 20.4 3.8 17.1 3.8 11.4V5.1z"/><path fill="#bfe0ff" opacity=".55" d="M12 5.4l5 1.7v4.3c0 4-2.4 6.3-5 7.6z"/></symbol>' +
    '<symbol id="qok-spd" viewBox="0 0 24 24"><path fill="#e0b757" d="M13.4 2L4.8 13.2H10l-1.8 8.8L19 10.4h-5.2z"/></symbol>' +
    '<symbol id="qok-check" viewBox="0 0 24 24"><path d="M5 13l4 4L19 7" fill="none" stroke="currentColor" stroke-width="2.4"/></symbol>' +
    '<symbol id="qok-arrow" viewBox="0 0 24 24"><path d="M5 12h14M13 6l6 6-6 6" fill="none" stroke="currentColor" stroke-width="2.4"/></symbol>' +
    // settings-row category icons
    '<symbol id="qok-clock" viewBox="0 0 24 24"><circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" stroke-width="2"/><path d="M12 7v5l3.5 2" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></symbol>' +
    '<symbol id="qok-speaker" viewBox="0 0 24 24"><path d="M4 9.5h3.5L12 5v14l-4.5-4.5H4z" fill="currentColor"/><path d="M15.5 9a4 4 0 010 6M18 6.5a8 8 0 010 11" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></symbol>' +
    '<symbol id="qok-globe" viewBox="0 0 24 24"><circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" stroke-width="2"/><path d="M3.5 12h17M12 3c3.2 2.5 3.2 15.5 0 18M12 3c-3.2 2.5-3.2 15.5 0 18" fill="none" stroke="currentColor" stroke-width="1.5"/></symbol>' +
    '<symbol id="qok-gauge" viewBox="0 0 24 24"><path d="M3.5 17a8.5 8.5 0 0117 0" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><path d="M12 17l5-4.5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><circle cx="12" cy="17" r="1.8" fill="currentColor"/></symbol>' +
    '<symbol id="qok-dpad" viewBox="0 0 24 24"><path d="M9.5 3.5h5V9H20v5h-5.5v5.5h-5V14H4V9h5.5z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/></symbol>' +
    '<symbol id="qok-text" viewBox="0 0 24 24"><path d="M5 6.5h14M12 6.5V19M8.5 19h7" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/></symbol>' +
    '</svg>';
  function use(id, cls, col) { return '<svg class="' + (cls || 'ic') + '"' + (col ? ' style="color:' + col + '"' : '') + '><use href="#qok-' + id + '"/></svg>'; }
  // Tab glyphs come from ui-icons/tab-icons.png -- one 512x128 sheet, four cells, in the order
  // status / items / equip / settings. It is an ALPHA MASK, not a picture: the cell is stamped
  // out of currentColor, so the active tab is gold and the rest muted with no second asset and
  // no per-theme re-export. data-ti carries the cell index; the CSS does the positioning.
  function tabIcon(i) { return '<i class="ic tabic" data-ti="' + i + '"></i>'; }
  // Battle command glyphs, same mechanism and same generated family: ui-icons/battle-icons.png,
  // one 512x128 sheet, four cells, in the order attack / defend / item / flee.
  //
  // They are masks rather than <symbol>s on purpose. The Gilded Rail selector the owner picked
  // drops the coloured button blocks, so a command's colour has to live ENTIRELY in its glyph --
  // Attack reads red and Defend reads blue off the tint alone. Baked-colour art cannot do that,
  // and neither could qok-shieldw, which is why it is gone. `col` is optional: with no argument
  // the glyph inherits whatever colour its button already sets.
  function battleIcon(i, col) {
    return '<i class="ic battleic" data-bi="' + i + '"' +
      (col ? ' style="color:' + col + '"' : '') + '></i>';
  }

  // ---- hero sprite ----
  // real in-game hero armor colors (only 4 exist: gray/blue/pink/black)
  var HEROHEX = { gray: '#8899bb', blue: '#4477dd', pink: '#cc6699', black: '#444455' };
  function heroSvg(size, color) {
    var c = HEROHEX[color] || '#3b63c4';
    return '<svg class="spr" width="' + size + '" height="' + size + '" viewBox="0 0 16 16">' +
      '<rect x="5" y="1" width="6" height="2" fill="#e0584f"/><rect x="4" y="3" width="8" height="4" fill="#9fb3c8"/>' +
      '<rect x="5" y="4" width="2" height="2" fill="#fff"/><rect x="9" y="4" width="2" height="2" fill="#fff"/>' +
      '<rect x="4" y="7" width="8" height="5" fill="' + c + '"/><rect x="6" y="12" width="4" height="3" fill="#5a3a22"/></svg>';
  }

  // ---- monster sprite: legacy PNGs (no real alpha) get their solid-black bg chroma-keyed
  // to transparent; PNGs with real alpha are trusted as-is (cached) ----
  var monCache = {}; // sprite -> dataURL | 'pending' | '' (failed)
  var monHdCache = {}; // sprite -> URL | 'pending' | 'failed'; never stores high-resolution data URLs
  function loadHdMonster(sprite) {
    if (!sprite || monHdCache[sprite]) return;
    monHdCache[sprite] = 'pending';
    var img = new Image();
    img.onload = function () { monHdCache[sprite] = 'assets/monsters-hd/' + sprite + '.webp'; lastSig = null; };
    img.onerror = function () { monHdCache[sprite] = 'failed'; };
    img.src = 'assets/monsters-hd/' + sprite + '.webp';
  }
  function isMonsterHd(sprite) { var v = monHdCache[sprite]; return !!(v && v !== 'pending' && v !== 'failed'); }
  function getMonsterSrc(sprite) {
    if (!sprite) return null;
    var hd = monHdCache[sprite];
    if (hd && hd !== 'pending' && hd !== 'failed') return hd;
    loadHdMonster(sprite); // lazy: only the active battle enemy requests an HD asset
    var v = monCache[sprite];
    if (v && v !== 'pending') return v;
    if (v === 'pending') return null;
    monCache[sprite] = 'pending';
    var img = new Image();
    img.onload = function () {
      try {
        var w = img.width, h = img.height;
        var cv = document.createElement('canvas'); cv.width = w; cv.height = h;
        var ctx = cv.getContext('2d'); ctx.drawImage(img, 0, 0);
        var d = ctx.getImageData(0, 0, w, h), px = d.data;
        var hasRealAlpha = false;
        for (var ai = 3; ai < px.length; ai += 4) { if (px[ai] !== 255) { hasRealAlpha = true; break; } }
        if (!hasRealAlpha) {
          var isBg = function (i) { return px[i] < 30 && px[i + 1] < 30 && px[i + 2] < 30; };
          var seen = new Uint8Array(w * h), stack = [];
          var push = function (x, y) { if (x < 0 || y < 0 || x >= w || y >= h) return; var p = y * w + x; if (seen[p]) return; seen[p] = 1; var i = p * 4; if (isBg(i)) { px[i + 3] = 0; stack.push(p); } };
          for (var x = 0; x < w; x++) { push(x, 0); push(x, h - 1); }
          for (var y = 0; y < h; y++) { push(0, y); push(w - 1, y); }
          while (stack.length) { var p = stack.pop(); var px0 = p % w, py0 = (p - px0) / w; push(px0 + 1, py0); push(px0 - 1, py0); push(px0, py0 + 1); push(px0, py0 - 1); }
          ctx.putImageData(d, 0, 0);
        }
        // Trim the transparent BOTTOM padding so the sprite's feet sit on the scene's ground line.
        // object-position:bottom anchors the IMAGE edge, not the monster's feet — without this the
        // monster floats by however much empty space the sprite has below it (~24% for the slime),
        // and the ground shadow detaches. Bottom-only keeps width/size unchanged. Per-sprite.
        var vb = h;
        for (var yy = h - 1; yy >= 0; yy--) { var hit = false; for (var xx = 0; xx < w; xx++) { if (px[(yy * w + xx) * 4 + 3] > 16) { hit = true; break; } } if (hit) { vb = yy + 1; break; } }
        if (vb > 0 && vb < h) { var cv2 = document.createElement('canvas'); cv2.width = w; cv2.height = vb; cv2.getContext('2d').drawImage(cv, 0, 0); cv = cv2; }
        monCache[sprite] = cv.toDataURL('image/png');
      } catch (e) { monCache[sprite] = 'assets/monsters/' + sprite + '.png'; }
      lastSig = null; // force re-render with the transparent sprite
    };
    img.onerror = function () { monCache[sprite] = ''; lastSig = null; };
    img.src = 'assets/monsters/' + sprite + '.png';
    return null;
  }

  // ---- real hero sprite: snapshot frame 0 of the Phaser 'hero-walk' texture (per color) ----
  var heroCache = {}; // color -> dataURL | 'none'
  function getHeroSrc(color, ensure) {
    var key = 'hero|' + (color || '');
    var v = heroCache[key];
    if (v) return v === 'none' ? null : v;
    var g = G();
    if (!g || !g.textures) return null;
    try { if (ensure) ensure(); } catch (e) {}
    var tex = g.textures.get('hero-walk');
    var img = tex ? (tex.getSourceImage ? tex.getSourceImage() : (tex.source && tex.source[0] && tex.source[0].image)) : null;
    if (!img || !img.width) return null; // not ready yet — retry next tick
    try {
      var fw = Math.floor(img.width / 12), fh = img.height; // 12-frame strip; frame 0 = front pose
      var cv = document.createElement('canvas'); cv.width = fw; cv.height = fh;
      var ctx = cv.getContext('2d'); ctx.imageSmoothingEnabled = false;
      ctx.drawImage(img, 0, 0, fw, fh, 0, 0, fw, fh);
      var url = cv.toDataURL('image/png');
      heroCache[key] = url; return url;
    } catch (e) { heroCache[key] = 'none'; return null; } // renderer can't read it — fall back to SVG
  }
  function heroImg(size, color, ensure) {
    var src = getHeroSrc(color, ensure);
    if (src) return '<img class="heroimg" width="' + size + '" height="' + size + '" src="' + src + '" alt="" />';
    return heroSvg(size, color); // graceful fallback until the texture is readable
  }

  // ---- A/B variant preview: read frame 0 of the STATIC variant sheet (no Phaser texture) ----
  var variantCache = {}; // variant -> dataURL | 'pending' | ''
  function variantSrc(variant) {
    var v = variantCache[variant];
    if (v && v !== 'pending') return v;
    if (v === 'pending') return null;
    variantCache[variant] = 'pending';
    var img = new Image();
    img.onload = function () {
      try {
        var fw = Math.floor(img.width / 12), fh = img.height; // 12-frame strip; frame 0 = down-idle
        var cv = document.createElement('canvas'); cv.width = fw; cv.height = fh;
        var ctx = cv.getContext('2d'); ctx.imageSmoothingEnabled = false;
        ctx.drawImage(img, 0, 0, fw, fh, 0, 0, fw, fh);
        variantCache[variant] = cv.toDataURL('image/png');
      } catch (e) { variantCache[variant] = ''; }
      lastSig = null; // force a re-render once the PNG is ready
    };
    img.onerror = function () { variantCache[variant] = ''; lastSig = null; };
    img.src = 'assets/hero/hero-' + variant + '-walk.png';
    return null;
  }
  function variantImg(size, variant) {
    var src = variantSrc(variant);
    if (src) return '<img class="heroimg" width="' + size + '" height="' + size + '" src="' + src + '" alt="" style="image-rendering:pixelated;" />';
    return heroSvg(size, 'gray'); // graceful fallback until the PNG loads
  }

  // ---- NPC sprite snapshot (e.g. shopkeeper portrait, cropped to the upper half) ----
  var npcCache = {};
  function getNpcSrc(key, topFrac) {
    var ck = 'npc|' + key + '|' + (topFrac || 1);
    var v = npcCache[ck];
    if (v) return v === 'none' ? null : v;
    var g = G();
    if (!g || !g.textures || !g.textures.exists(key)) return null;
    var tex = g.textures.get(key);
    var img = tex.getSourceImage ? tex.getSourceImage() : (tex.source && tex.source[0] && tex.source[0].image);
    if (!img || !img.width) return null;
    try {
      var sw = img.width, sh = img.height, ch = topFrac ? Math.round(sh * topFrac) : sh;
      var cv = document.createElement('canvas'); cv.width = sw; cv.height = ch;
      var ctx = cv.getContext('2d'); ctx.imageSmoothingEnabled = false;
      ctx.drawImage(img, 0, 0, sw, ch, 0, 0, sw, ch);
      var url = cv.toDataURL('image/png'); npcCache[ck] = url; return url;
    } catch (e) { npcCache[ck] = 'none'; return null; }
  }
  function shopAvatar() {
    var src = getNpcSrc('shopkeeper', 0.9); // show more of him so he sits smaller in the frame
    if (src) return '<img class="npcimg" src="' + src + '" alt="" />';
    return use('person', 'ic', '#e0b757'); // fallback
  }

  // ---- item icon: unique high-density art with the legacy SVGs as fallback ----
  var ITEM_ART = Object.create(null);
  ('herb potion hiPotion elixir smokeBomb escapeCrystal woodenSword bronzeSword ironSword steelSword mithrilSword flameSword crystalBlade holyBlade excalibur coralBlade galeBow frostbrand banditDagger magmaBlade clothArmor bronzeArmor leatherArmor chainMail mithrilArmor plateArmor dragonscaleArmor holyArmor aegisOfDawn sandstormCloak moltenGreaves woodenShield ironShield steelShield mithrilShield galeShield toadShield leatherCap ironHelm steelHelm mithrilHelm crownOfWisdom crystalPendant dragonheartAmulet ancientAmulet dungeonKey redCrystalShard blueCrystalShard greenCrystalShard windbreakerStone ironOre stolenBook starMapFragment flameCloak lightCrystal shadowCrystal crystalOfKnowledge holyAmulet').split(' ').forEach(function (id) { ITEM_ART[id] = 1; });
  var ITEM_ICON = {
    herb:          ['leaf', null],
    potion:        ['flask', '#e3594f'],
    hiPotion:      ['flask', '#5aa9e6'],
    elixir:        ['flask', '#e0b757'],
    smokeBomb:     ['bomb', null],
    escapeCrystal: ['crystal', '#4cc0b0'],
    // weapon sub-types
    galeBow:       ['bow', '#8893a6'],
    banditDagger:  ['dagger', '#8893a6']
  };
  function itemIcon(it) {
    if (!it) return use('flask', 'ic', '#8c6bd8');
    var artId = it.id || '';
    if (artId.indexOf('dungeonKey_') === 0) artId = 'dungeonKey';
    if (artId.indexOf('windbreakerStone_') === 0) artId = 'windbreakerStone';
    if (ITEM_ART[artId]) return '<img class="item-art" src="assets/item-icons/' + artId + '.webp" alt="" loading="lazy" decoding="async" draggable="false" />';
    var o = ITEM_ICON[it.id];
    if (o) return use(o[0], 'ic', o[1] || undefined);
    if (it.type === 'weapon') return use('swordf', 'ic');
    if (it.type === 'armor') return use('armorf', 'ic');
    if (it.type === 'shield') return use('shield', 'ic');
    if (it.type === 'helmet') return use('helmf', 'ic');
    if (it.type === 'accessory') return use('ringf', 'ic');
    if (it.effect && it.effect.type === 'heal') return use('flask', 'ic', '#5fcc63');
    if (it.effect && it.effect.type === 'escape') return use('bomb', 'ic');
    if (it.type === 'key') return use('crystal', 'ic', '#c79a3f');
    return use('flask', 'ic', '#8c6bd8');
  }
  // category icon by equip slot/type (reuses the locked artwork to signify each category)
  var CAT_SYM = { weapon: 'swordf', armor: 'armorf', shield: 'shield', helmet: 'helmf', accessory: 'ringf' };
  function catIcon(type, size) { var s = size || 16; return '<svg width="' + s + '" height="' + s + '" style="flex:none;"><use href="#qok-' + (CAT_SYM[type] || 'shield') + '"/></svg>'; }
  function esc(s) { return ('' + (s == null ? '' : s)).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }

  // ---- dom plumbing ----
  var root = null, stage = null, fx = null, attached = false, lastSig = null, curScreen = null;
  var draggingVolume = false;
  function ensure() {
    if (stage) return true;
    root = document.getElementById('qok-ui');
    if (!root) return false;
    root.insertAdjacentHTML('afterbegin', DEFS);
    stage = document.createElement('div');
    stage.id = 'qok-stage';
    stage.style.cssText = 'display:flex;flex:1;min-height:0;width:100%;';
    root.appendChild(stage);
    fx = document.createElement('div'); // transient battle-FX layer; sibling of stage so paint() never wipes an in-flight animation
    fx.id = 'qok-fx';
    root.appendChild(fx);
    if (!attached) {
      // Pointer-based routing that ALSO shields the live Phaser scene input underneath the overlay.
      // (WKWebView delivers pointerdown to the still-live Phaser scene FIRST and frequently synthesizes
      //  NO click at all, so the old click-only router mis-fired: taps hit stale Phaser handlers — e.g.
      //  a create-screen variant tap toggled the language, and the name field could not focus.)
      ['pointerdown', 'pointerup', 'touchstart', 'touchend', 'mousedown', 'mouseup', 'click'].forEach(function (tp) {
        document.addEventListener(tp, pointerGuard, true); // capture: run before Phaser's window/document listeners
      });
      // The name field is the ONE tap we let through natively (so iOS focuses it + opens the keyboard);
      // this bubble-phase shield then stops it reaching Phaser's window/document input.
      ['pointerdown', 'touchstart', 'mousedown', 'pointerup', 'touchend', 'mouseup', 'click'].forEach(function (tp) {
        root.addEventListener(tp, inputShield);
      });
      root.addEventListener('input', onInput, true);
      root.addEventListener('change', onInput, true);
      attached = true;
    }
    return true;
  }
  function activate(name, isBattle) {
    if (!root.classList.contains('active')) root.classList.add('active');
    root.classList.toggle('battle', !!isBattle);
    if (!isBattle) clearBattleBg();
    try { document.body.classList.add('qok-overlay'); } catch (e) {} // hide the Phaser canvas under us (no old-UI flash)
    if (curScreen !== name) { curScreen = name; lastSig = null; }
  }
  function deactivate() {
    if (root && root.classList.contains('active')) { root.classList.remove('active', 'battle'); stage.innerHTML = ''; }
    clearBattleBg();
    try { document.body.classList.remove('qok-overlay'); } catch (e) {} // show the canvas again (field/dungeon, or a non-overlaid Phaser scene)
    curScreen = null; lastSig = null;
  }
  function paint(html, sig) {
    if (sig === lastSig) return;
    lastSig = sig;
    stage.innerHTML = '<div class="screen"><div class="col">' + html + '</div></div>';
  }

  // ============================================================
  //  MENU
  // ============================================================
  // tab bar: items = outline flask (flasko) to match the other line-style tab icons; settings = cog gear
  // Retained as documentation of what each tab MEANS. The bars draw from the generated mask
  // sheet via tabIcon(index) now; these SVG symbol names are no longer looked up for them.
  var TAB_ICON = { status: 'person', items: 'flasko', equip: 'sword', settings: 'gear' };
  var TAB_KEY  = { status: 'menu.status', items: 'menu.items', equip: 'menu.equip', settings: 'menu.settings' };
  var SLOTS = ['weapon', 'armor', 'shield', 'helmet', 'accessory'];
  var SLOT_KEY = { weapon: 'equip.slot.weapon', armor: 'equip.slot.armor', shield: 'equip.slot.shield', helmet: 'equip.slot.helmet', accessory: 'equip.slot.accessory' };

  function topbar(p, st) {
    var maxHp = Math.max(1, p.totalMaxHp || st.maxHp || 1);
    var hpRatio = Math.max(0, Math.min(1, st.hp / maxHp));
    var hpTone = st.poisonedUntil && st.poisonedUntil > Date.now() ? ' poison' : (hpRatio <= .2 ? ' danger' : (hpRatio <= .5 ? ' warn' : ''));
    return '<div class="topbar">' +
      '<div class="av">' + heroImg(28, st.heroColor) + '</div>' +
      '<div class="who"><div class="nm">' + esc(st.name) + '</div>' +
        '<div class="who-meta"><span class="lv">' + esc(Z('menu.level')) + ' ' + st.level + '</span><span class="top-hp-num">' + esc(Z('menu.hp')) + ' ' + st.hp + '/' + maxHp + '</span></div>' +
        '<div class="top-hp" role="meter" aria-label="' + esc(Z('menu.hp')) + '" aria-valuemin="0" aria-valuemax="' + maxHp + '" aria-valuenow="' + st.hp + '"><i class="' + hpTone + '" style="width:' + Math.round(hpRatio * 100) + '%"></i></div></div>' +
      '<div class="headtools"><div class="coins">◎ ' + st.gold + '</div>' +
      '<button class="xbtn" data-act="close" aria-label="Close">✕</button></div></div>';
  }
  function tabbar(cur) {
    var h = '<div class="tabbar">';
    for (var i = 0; i < 4; i++) {
      var t = ['status', 'items', 'equip', 'settings'][i];
      h += '<button class="tab' + (cur === t ? ' on' : '') + '" data-act="tab" data-i="' + i + '">' + tabIcon(i) + esc(Z(TAB_KEY[t])) + '</button>';
    }
    return h + '</div>';
  }

  function statusBody(p, st) {
    var max = p.totalMaxHp, hpR = Math.max(0, Math.min(1, max ? st.hp / max : 1));
    var poisoned = !!(st.poisonedUntil && st.poisonedUntil > Date.now());
    var hpFill = poisoned ? 'background:linear-gradient(180deg,#c779e0,#a23bbf);' : '';
    var hpCol = poisoned ? '#a23bbf' : 'var(--ink-soft)';
    var stats = QOK().state ? QOK().state() : null;
    var qs = (player() && GS().quizManager) ? GS().quizManager.getStats() : { totalAsked: 0, totalCorrect: 0 };
    var acc = qs.totalAsked > 0 ? Math.round(qs.totalCorrect / qs.totalAsked * 100) : 0;
    var expN = st.expToNext || 1, expR = Math.max(0, Math.min(1, st.exp / expN));
    function statIcon(k) { return '<svg width="18" height="18" style="flex:none;"><use href="#qok-' + k + '"/></svg>'; }
    function statRow(icon, lbl, val) {
      return '<div class="row" style="justify-content:space-between;padding:2px 2px;"><span class="row" style="gap:8px;font-weight:800;color:var(--ink-soft);font-size:14px;">' + statIcon(icon) + esc(lbl) + '</span><span style="font-weight:900;color:var(--ink);font-size:16px;">' + val + '</span></div>';
    }
    var eq = '';
    for (var i = 0; i < SLOTS.length; i++) {
      var id = st.equipment[SLOTS[i]];
      var nm = id ? Z(find(id).nameKey) : '—';
      eq += '<div class="row" style="justify-content:space-between;"><span class="row" style="gap:7px;color:var(--ink-soft);font-weight:700;font-size:12px;">' + catIcon(SLOTS[i], 17) + esc(Z(SLOT_KEY[SLOTS[i]])) + '</span><span style="font-weight:800;font-size:12px;color:var(--ink);">' + esc(nm) + '</span></div>';
    }
    return '<div class="body"><div class="zc pad stack g10 grid2">' +
      '<div class="eyebrow">' + esc(Z('menu.status')) + '</div>' +
      '<div class="panel" style="padding:16px;display:flex;flex-direction:column;gap:12px;">' +
        '<div class="row" style="gap:14px;">' +
          '<div style="width:74px;height:74px;border-radius:16px;flex:none;display:grid;place-items:center;background:radial-gradient(closest-side,#262832,#1a1b22);box-shadow:inset 0 0 0 1px rgba(201,169,97,.40);">' + heroImg(48, st.heroColor) + '</div>' +
          '<div style="flex:1;"><div style="font-weight:900;font-size:20px;color:var(--ink);">' + esc(st.name) + '</div>' +
          '<div class="row" style="gap:6px;margin:2px 0 7px;"><span style="font-weight:800;color:var(--ink-soft);font-size:13px;">' + esc(Z('menu.level')) + ' ' + st.level + '</span>' + (poisoned ? '<span style="font-weight:800;font-size:10px;color:#fff;background:#a23bbf;border-radius:99px;padding:2px 8px;">☠ ' + esc(Z('status.poisoned') !== '[status.poisoned]' ? Z('status.poisoned') : (isJa() ? 'どく' : 'Poisoned')) + '</span>' : '') + '</div>' +
          '<div class="row"><div class="hp"><i style="width:' + (hpR * 100) + '%;' + hpFill + '"></i></div></div>' +
          '<div style="text-align:right;font-weight:800;font-size:12px;color:' + hpCol + ';margin-top:3px;">' + esc(Z('menu.hp')) + ' ' + st.hp + '/' + max + '</div></div>' +
        '</div>' +
        '<div style="border-top:1px solid #00000018;padding-top:8px;">' +
          statRow('atk', Z('menu.atk'), p.totalAtk) + statRow('def', Z('menu.def'), p.totalDef) + statRow('spd', Z('menu.spd'), st.spd) +
        '</div>' +
        '<div><div class="row" style="justify-content:space-between;"><span style="font-weight:800;color:var(--ink-soft);font-size:13px;">' + esc(Z('menu.exp')) + '</span><span style="font-weight:800;font-size:12px;color:var(--ink-soft);">' + st.exp + '/' + expN + '</span></div>' +
          '<div class="hp" style="margin-top:4px;"><i style="width:' + (expR * 100) + '%;background:linear-gradient(180deg,#f0c969,var(--gold2));"></i></div></div>' +
      '</div>' +
      '<div class="panel" style="padding:14px;display:flex;flex-direction:column;gap:6px;">' +
        '<div class="eyebrow" style="color:var(--ink-soft);padding-left:0;">' + esc(Z('menu.equip')) + '</div>' + eq +
        '<div class="row" style="justify-content:space-between;border-top:1px solid #00000018;padding-top:7px;margin-top:auto;"><span style="color:var(--ink-soft);font-weight:700;font-size:12px;">' + esc(Z('menu.accuracy')) + '</span><span style="font-weight:800;font-size:13px;color:var(--ink);">' + qs.totalCorrect + '/' + qs.totalAsked + ' (' + acc + '%)</span></div>' +
      '</div>' +
    '</div></div>';
  }

  function itemsBody(ms, st) {
    var list = ms.getConsumableItems();
    var h = '<div class="body"><div class="zc pad stack g10 grid2"><div class="eyebrow">' + esc(Z('menu.items')) + '</div>';
    if (!list.length) h += '<div class="card" style="opacity:.7;justify-content:center;cursor:default;"><div class="t" style="flex:none;"><div class="n">—</div></div></div>';
    for (var i = 0; i < list.length; i++) {
      var it = find(list[i].itemId);
      var sel = (ms.listIndex === i);
      h += '<div class="card' + (sel ? ' sel' : '') + '" data-act="item" data-i="' + i + '">' +
        '<div class="ic">' + itemIcon(it) + '</div>' +
        '<div class="t"><div class="n">' + esc(Z(it.nameKey)) + '</div><div class="d">' + esc(Z(it.descriptionKey)) + '</div></div>' +
        '<div class="qty">×' + list[i].quantity + '</div></div>';
    }
    return h + '</div></div>';
  }

  function equipBody(ms, p, st) {
    var filter = ms.equipTypeFilter || 'weapon';
    var h = '<div class="body"><div class="zc pad stack g10 grid2"><div class="eyebrow">' + esc(Z('menu.equip')) + '</div>';
    // equipped slots panel
    h += '<div class="panel span2" style="padding:11px 13px;display:flex;flex-direction:column;gap:4px;">';
    for (var s = 0; s < SLOTS.length; s++) {
      var slot = SLOTS[s], id = st.equipment[slot];
      var sel = (ms.equipMode === 'equipped' && s === ms.equipSlotIndex);
      var nm = id ? Z(find(id).nameKey) : '—';
      var dat = id ? find(id) : null;
      var statStr = '';
      if (dat && dat.stats) {
        if (dat.stats.atk) statStr += ' +' + dat.stats.atk + Z('menu.atk');
        if (dat.stats.def) statStr += ' +' + dat.stats.def + Z('menu.def');
      }
      h += '<div class="row" data-act="equipSlot" data-i="' + s + '" style="justify-content:space-between;padding:5px 6px;border-radius:8px;cursor:pointer;' + (sel ? 'background:var(--gold-glow);outline:2px solid var(--gold);' : '') + '">' +
        '<span class="row" style="gap:7px;font-weight:800;font-size:13px;color:' + (sel ? '#43340f' : 'var(--ink-soft)') + ';">' + catIcon(slot, 18) + esc(Z(SLOT_KEY[slot])) + '</span>' +
        '<span style="font-weight:800;font-size:13px;color:' + (id ? 'var(--ink)' : 'var(--ink-soft)') + ';">' + esc(nm) + '<span style="color:#1f8a44;font-weight:800;">' + esc(statStr) + '</span></span></div>';
    }
    h += '</div>';
    // owned header + type filter
    h += '<div class="row span2" style="gap:6px;"><b style="font-size:11px;letter-spacing:.1em;color:var(--gold);font-weight:800;flex:1;">' + esc(Z('equip.owned')) + '</b></div>';
    h += '<div class="seg segcat span2">';
    for (var f = 0; f < SLOTS.length; f++) {
      h += '<b class="' + (SLOTS[f] === filter ? 'on' : '') + '" data-act="equipFilter" data-type="' + SLOTS[f] + '">' + catIcon(SLOTS[f], 20) + '<span>' + esc(Z(SLOT_KEY[SLOTS[f]])) + '</span></b>';
    }
    h += '</div>';
    // inventory list
    var inv = ms.getEquipInventoryItems();
    if (!inv.length) {
      h += '<div class="card" style="opacity:.7;justify-content:center;cursor:default;"><div class="t" style="flex:none;"><div class="n">—</div></div></div>';
    } else {
      for (var k = 0; k < inv.length; k++) {
        var idt = find(inv[k].itemId);
        var isel = (ms.equipMode === 'inventory' && k === ms.equipInventoryIndex);
        var curEqId = st.equipment[idt.type], curEq = curEqId ? find(curEqId) : null;
        var atkV = idt.stats ? idt.stats.atk : undefined, defV = idt.stats ? idt.stats.def : undefined;
        var newVal = atkV !== undefined ? atkV : (defV !== undefined ? defV : 0);
        var oldVal = atkV !== undefined ? (curEq && curEq.stats && curEq.stats.atk || 0) : (defV !== undefined ? (curEq && curEq.stats && curEq.stats.def || 0) : 0);
        var d = newVal - oldVal;
        var dHtml = d > 0 ? '<div class="delta-up">▲ +' + d + '</div>' : (d < 0 ? '<div class="delta-dn">▼ ' + d + '</div>' : '');
        var ss = (atkV !== undefined ? '+' + atkV + Z('menu.atk') : '') + (defV !== undefined ? ' +' + defV + Z('menu.def') : '');
        h += '<div class="card' + (isel ? ' sel' : '') + '" data-act="equipInv" data-i="' + k + '">' +
          '<div class="ic">' + itemIcon(idt) + '</div>' +
          '<div class="t"><div class="n">' + esc(Z(idt.nameKey)) + '</div><div class="d">' + esc(ss) + '</div></div>' + dHtml + '</div>';
      }
    }
    return h + '</div></div>';
  }

  var SETTING_ICON = { difficulty: 'gauge', language: 'globe', kanji: 'text', timer: 'clock', sound: 'speaker', volume: 'speaker', controlOrientation: 'dpad' };
  function settingsBody(ms, st) {
    var listArr = ms.settingsList;
    var h = '<div class="body"><div class="zc pad stack g8 grid2"><div class="eyebrow">' + esc(Z('menu.settings')) + '</div>';
    for (var i = 0; i < listArr.length; i++) {
      var key = listArr[i], sel = (ms.listIndex === i), ctrl = '', lab = '';
      if (key === 'difficulty') { lab = Z('settings.difficulty'); ctrl = '<span class="val">' + esc(Z('grade.' + st.quizDifficulty)) + ' ›</span>'; }
      else if (key === 'language') {
        lab = Z('settings.language');
        ctrl = '<div class="toggle" style="pointer-events:none;"><span class="' + (!isJa() ? 'on' : '') + '">English</span><span class="' + (isJa() ? 'on' : '') + '">日本語</span></div>';
      } else if (key === 'kanji') {
        lab = 'もじ'; ctrl = '<span class="val">' + (st.kanjiMode ? 'むずかしい' : 'かんたん') + '</span>';
      } else if (key === 'timer') {
        lab = Z('settings.timer'); ctrl = '<div class="switch ' + (st.timerEnabled ? 'on' : '') + '" style="pointer-events:none;"></div>';
      } else if (key === 'sound') {
        lab = Z('settings.sound'); ctrl = '<div class="switch ' + (st.soundEnabled ? 'on' : '') + '" style="pointer-events:none;"></div>';
      } else if (key === 'volume') {
        lab = Z('settings.volume'); var v = Math.round((st.masterVolume || 0) * 100);
        ctrl = '<input id="qok-volume" data-native="1" type="range" min="0" max="100" step="1" value="' + v + '" aria-label="' + esc(lab) + '"><span id="qok-volume-value" class="val" style="min-width:42px;text-align:right;">' + v + '%</span>';
      } else if (key === 'controlOrientation') {
        lab = isJa() ? 'そうさボタン' : 'Controls';
        var ori = (window.localStorage && localStorage.getItem('eduControlOrientation')) || 'right';
        ctrl = '<div class="seg" style="pointer-events:none;flex:1;max-width:230px;"><b class="' + (ori === 'left' ? 'on' : '') + '">◀</b><b class="' + (ori === 'center' ? 'on' : '') + '">●</b><b class="' + (ori === 'right' ? 'on' : '') + '">▶</b></div>';
      }
      var sp = (key === 'volume' || key === 'controlOrientation') ? ' span2' : '';
      h += '<div class="setrow' + (sel ? ' sel' : '') + sp + '" data-act="setting" data-i="' + i + '"><span class="lab">' + use(SETTING_ICON[key] || 'gear') + esc(lab) + '</span>' + ctrl + '</div>';
    }
    return h + '</div></div>';
  }

  // ---- item-use toast ----
  // MenuScene.useItem() DOES work (applies the effect + decrements), but its feedback
  // (showItemMessage: "X used / healed Y", "already full", "can't use here") is a Phaser
  // popup hidden under the overlay -> at full HP nothing seems to happen. Surface it as a
  // DOM toast so the user sees the result.
  var _itemSeq = 0, _itemShown = 0, _itemMsg = '';
  function patchItemMsg(ms) {
    if (!ms || ms.__qokItemPatched || typeof ms.showItemMessage !== 'function') return;
    ms.__qokItemPatched = true;
    var orig = ms.showItemMessage.bind(ms);
    ms.showItemMessage = function (txt) { try { _itemMsg = String(txt == null ? '' : txt); _itemSeq++; } catch (e) {} return orig(txt); };
  }
  function showToast(text) {
    if (!fx || !text) return;
    var t = document.createElement('div'); t.className = 'qok-toast'; t.textContent = text;
    fx.appendChild(t);
    setTimeout(function () { try { t.remove(); } catch (e) {} }, 1900);
  }
  function runItemToast(ms) {
    patchItemMsg(ms);
    if (_itemSeq === _itemShown) return;
    _itemShown = _itemSeq;
    if (_itemMsg) showToast(_itemMsg);
  }
  function renderMenu() {
    var ms = getScene('MenuScene'), p = player(), st = pstate();
    if (!ms || !p || !st) return;
    // a field tab was tapped → open the menu directly on that tab
    if (pendingTab != null && ms.tabs && ms.tabs[pendingTab]) { ms.tabIndex = pendingTab; ms.currentTab = ms.tabs[pendingTab]; ms.listIndex = 0; pendingTab = null; }
    var tab = ms.currentTab || 'status';
    var body;
    if (tab === 'items') body = itemsBody(ms, st);
    else if (tab === 'equip') body = equipBody(ms, p, st);
    else if (tab === 'settings') body = settingsBody(ms, st);
    else body = statusBody(p, st);

    // signature — include everything the render depends on
    var invSig = st.inventory.map(function (x) { return x.itemId + ':' + x.quantity; }).join(',');
    var eqSig = SLOTS.map(function (s) { return st.equipment[s] || '-'; }).join(',');
    var qs = GS().quizManager ? GS().quizManager.getStats() : { totalAsked: 0, totalCorrect: 0 };
    var sig = 'menu|' + tab + '|' + ms.listIndex + '|' + ms.equipMode + '|' + ms.equipSlotIndex + '|' + ms.equipInventoryIndex + '|' + (ms.equipTypeFilter || '') +
      '|' + st.hp + '/' + p.totalMaxHp + '|atk' + p.totalAtk + '|def' + p.totalDef + '|spd' + st.spd + '|g' + st.gold + '|lv' + st.level + '|xp' + st.exp +
      '|' + invSig + '|' + eqSig + '|' + locale() + '|t' + st.timerEnabled + '|s' + st.soundEnabled + '|v' + (draggingVolume ? 'drag' : st.masterVolume) + '|k' + st.kanjiMode + '|d' + st.quizDifficulty +
      '|q' + qs.totalCorrect + '/' + qs.totalAsked + '|o' + ((window.localStorage && localStorage.getItem('eduControlOrientation')) || 'right') +
      '|psn' + (st.poisonedUntil && st.poisonedUntil > Date.now() ? 1 : 0);

    activate('menu', false);
    paint(topbar(p, st) + body + tabbar(tab), sig);
    runItemToast(ms); // surface item-use feedback (hidden Phaser popup) as a DOM toast
  }

  // ============================================================
  //  SHOP
  // ============================================================
  function shopSellList() {
    var st = pstate();
    return st.inventory.filter(function (x) { var d = find(x.itemId); return d && !d.unsellable && d.type !== 'key'; });
  }
  function renderShop() {
    var ss = getScene('ShopScene'), st = pstate(), q = QOK();
    if (!ss || !st || !q) return;
    var shops = q.shops || {};
    var shop = shops[ss.shopId] || { items: [] };
    var mode = ss.mode || 'menu';
    var EQ = ['weapon', 'armor', 'shield', 'helmet', 'accessory'];

    var shopTitle = Z('map.' + ss.shopId);
    if (!shopTitle || shopTitle.charAt(0) === '[') shopTitle = '';
    var h = '<div class="topbar">' +
      '<div class="av" style="background:linear-gradient(160deg,#5a3f2a,#3a2818);overflow:hidden;">' + shopAvatar() + '</div>' +
      '<div class="who" style="min-width:0;">' +
        (shopTitle ? '<div class="nm" style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">' + esc(shopTitle) + '</div>' : '') +
        '<div class="lv" style="display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;">' + esc(Z('shop.welcome')) + '</div>' +
      '</div>' +
      '<div class="coins">◎ ' + st.gold + '</div>' +
      '<button class="xbtn" data-act="shopLeave" aria-label="Close">✕</button></div>';

    h += '<div class="body"><div class="zc pad stack g8 grid2">';
    // mode seg (treat the shop's initial 'menu' state as the default Buy view)
    h += '<div class="seg span2" style="margin-bottom:2px;">' +
      '<b class="' + (mode !== 'sell' ? 'on' : '') + '" data-act="shopMode" data-mode="buy">' + esc(Z('shop.buy')) + '</b>' +
      '<b class="' + (mode === 'sell' ? 'on' : '') + '" data-act="shopMode" data-mode="sell">' + esc(Z('shop.sell')) + '</b>' +
      '<b data-act="shopLeave">' + esc(Z('shop.leave')) + '</b></div>';

    if (mode === 'sell') {
      var sl = shopSellList();
      if (!sl.length) h += '<div class="card" style="opacity:.7;justify-content:center;cursor:default;"><div class="t" style="flex:none;"><div class="n">' + esc(Z('shop.noItemsToSell')) + '</div></div></div>';
      for (var s = 0; s < sl.length; s++) {
        var sit = find(sl[s].itemId), ssel = (ss.listIndex === s);
        h += '<div class="card' + (ssel ? ' sel' : '') + '" data-act="shopSell" data-i="' + s + '">' +
          '<div class="ic">' + itemIcon(sit) + '</div>' +
          '<div class="t"><div class="n">' + esc(Z(sit.nameKey)) + ' ×' + sl[s].quantity + '</div><div class="d">' + esc(Z(sit.descriptionKey)) + '</div></div>' +
          '<div class="pill" style="background:#e0b75726;color:#8a6a26;">' + sit.sellPrice + ' G</div></div>';
      }
    } else {
      // buy (default)
      for (var i = 0; i < shop.items.length; i++) {
        var it = find(shop.items[i]); if (!it) continue;
        var sel = (mode === 'buy' && ss.listIndex === i);
        var isEq = EQ.indexOf(it.type) >= 0;
        var ownedInv = (player() && player().getItemCount) ? player().getItemCount(shop.items[i]) : 0;
        var ownedEq = (isEq && st.equipment[it.type] === shop.items[i]) ? 1 : 0;
        var owned = ownedInv + ownedEq;
        var blocked = isEq && owned > 0;
        var afford = st.gold >= it.buyPrice;
        var statStr = '';
        if (it.stats) { for (var k in it.stats) statStr += '+' + it.stats[k] + k.toUpperCase() + ' '; }
        var cnt = '';
        if (!isEq && owned > 0) cnt = '<div class="cnt">' + Z('shop.ownedEquip') + ' ×' + owned + '</div>';
        var price = blocked ? '<div class="pill" style="background:#00000014;color:var(--ink-soft);">' + esc(Z('shop.ownedEquip')) + '</div>' : '<div class="pill" style="background:#e0b75726;color:' + (afford ? '#8a6a26' : '#bb3a32') + ';">' + it.buyPrice + ' G</div>';
        h += '<div class="card' + (sel ? ' sel' : '') + '" data-act="shopBuy" data-i="' + i + '" style="' + (blocked ? 'opacity:.72;' : '') + '">' +
          '<div class="ic">' + itemIcon(it) + '</div>' +
          '<div class="t"><div class="n">' + esc(Z(it.nameKey)) + '</div>' + cnt + '<div class="d">' + esc(statStr || Z(it.descriptionKey)) + '</div></div>' + price + '</div>';
      }
    }
    if (ss.message) h += '<div class="msg span2" style="text-align:center;margin-top:4px;">' + esc(ss.message) + '</div>';
    h += '<button class="btn btn-gold mt6 span2" data-act="shopLeave">' + use('check') + esc(Z('shop.done')) + '</button>';
    h += '</div></div>';

    var slSig = mode === 'sell' ? shopSellList().map(function (x) { return x.itemId + ':' + x.quantity; }).join(',') : '';
    var sig = 'shop|' + ss.shopId + '|' + mode + '|' + ss.listIndex + '|g' + st.gold + '|' + locale() + '|m' + (ss.message || '') + '|' + slSig + '|eq' + EQ.map(function (e) { return st.equipment[e] || '-'; }).join(',');
    activate('shop', false);
    paint(h, sig);
  }

  // ============================================================
  //  HEALER (field overlay in WorldMapScene)
  // ============================================================
  function renderHealer() {
    var wm = getScene('WorldMapScene'), p = player(), st = pstate();
    if (!wm || !p || !st) return;
    var price = wm.healerOverlayPrice || 0;
    var max = p.totalMaxHp, heal = max - st.hp, hpR = Math.max(0, Math.min(1, max ? st.hp / max : 1));
    var h = '<div class="stack heal-wrap" style="flex:1;justify-content:center;padding:0 20px;gap:18px;">' +
      '<div style="display:grid;place-items:center;gap:12px;">' +
        '<div style="width:104px;height:104px;border-radius:50%;display:grid;place-items:center;background:radial-gradient(closest-side,#222a26,#1a1b22);box-shadow:0 0 0 1px rgba(111,158,126,.55),0 0 34px rgba(111,158,126,.22);">' +
          '<svg width="58" height="58" viewBox="0 0 24 24" fill="none"><path d="M12 21s-7-4.5-7-10a4 4 0 018-1 4 4 0 018 1c0 5.5-7 10-7 10z" fill="#5fcc63" stroke="#2f9c5b" stroke-width="1.4"/><path d="M8.3 4.7v5.4M5.6 7.4h5.4" stroke="#15532d" stroke-width="3.8" stroke-linecap="round"/><path d="M8.3 4.7v5.4M5.6 7.4h5.4" stroke="#fff" stroke-width="2" stroke-linecap="round"/></svg>' +
        '</div>' +
        '<div class="scene-h">' + esc(Z('npc.healer.popupTitle')) + '</div>' +
      '</div>' +
      '<div class="panel" style="padding:16px;">' +
        '<div class="row" style="justify-content:space-between;font-size:14px;font-weight:800;color:var(--ink-soft);margin-bottom:8px;"><span>' + esc(Z('menu.hp')) + '</span><span>' + st.hp + ' → <b style="color:#1f8a44;">' + max + '</b></span></div>' +
        '<div class="hp" style="height:14px;"><i style="width:' + (hpR * 100) + '%;"></i></div>' +
        '<div style="text-align:center;margin-top:14px;font-size:15px;font-weight:800;color:var(--ink);">' + esc(Z('menu.gold')) + ': <span style="color:#8a6a26;">' + price + ' G</span></div>' +
      '</div>' +
      '<div style="display:grid;grid-template-columns:1.4fr 1fr;gap:10px;">' +
        '<button class="btn btn-em' + (wm.healerOverlayIndex === 0 ? ' sel' : '') + '" data-act="healConfirm">' + use('check', 'ic') + esc(Z('npc.healer.healOption')) + '</button>' +
        '<button class="btn btn-slate' + (wm.healerOverlayIndex === 1 ? ' sel' : '') + '" data-act="healCancel">' + esc(Z('npc.healer.leaveOption')) + '</button>' +
      '</div>' +
    '</div>';
    var sig = 'healer|' + price + '|' + st.hp + '/' + max + '|' + wm.healerOverlayIndex + '|' + locale();
    activate('healer', false);
    paint(h, sig);
  }

  // ============================================================
  //  INTRO / HERO SETUP (TitleScene create mode)
  // ============================================================
  function renderIntro() {
    var ts = getScene('TitleScene');
    if (!ts) return;
    var VARIANTS = ['openface', 'feminine'];
    var variant = 'openface';
    try { var _lv = localStorage.getItem('edu-rpg-hero-variant'); if (_lv === 'openface' || _lv === 'feminine') variant = _lv; } catch (e) {}
    var grades = ts.difficultyOptions || ['k', '1', '2', '3', '4', '5', '6'];
    var di = ts.difficultyIndex || 0;
    var ja = isJa();

    var variantOpts = '';
    for (var vo = 0; vo < VARIANTS.length; vo++) {
      var vv = VARIANTS[vo];
      variantOpts += '<button class="variant-opt' + (vv === variant ? ' sel' : '') + '" data-act="introVariant" data-variant="' + vv + '" style="flex:1;min-width:0;display:flex;align-items:center;justify-content:center;background:' + (vv === variant ? 'rgba(201,168,76,.22)' : 'transparent') + ';border:2px solid ' + (vv === variant ? '#c9a84c' : '#d8c9a0') + ';border-radius:12px;padding:8px;cursor:pointer;">' + variantImg(56, vv) + '</button>';
    }
    var chips = '';
    for (var g = 0; g < grades.length; g++) {
      chips += '<b class="gchip' + (g === di ? ' sel' : '') + '" data-act="introGrade" data-i="' + g + '">' + esc(grades[g].toUpperCase()) + '</b>';
    }
    var langCtrl = '<div class="toggle" data-act="introLang"><span class="' + (!ja ? 'on' : '') + '">English</span><span class="' + (ja ? 'on' : '') + '">日本語</span></div>';
    var kanjiRow = ja ? ('<div class="panel" style="padding:12px 15px;display:flex;justify-content:space-between;align-items:center;gap:10px;"><span style="font-weight:800;color:var(--ink-soft);font-size:13px;">もじ</span><div class="toggle" data-act="introKanji"><span class="' + (!pstate() || !pstate().kanjiMode ? 'on' : '') + '">かんたん</span><span class="' + (pstate() && pstate().kanjiMode ? 'on' : '') + '">むずかしい</span></div></div>') : '';

    var h = '<div class="body"><div class="zc stack pad g10 grid2" style="padding-top:14px;padding-bottom:18px;">' +
      '<div class="span2" style="display:flex;justify-content:flex-start;"><button data-act="introBack" style="background:#2a2c4d;border:1.5px solid #9a7a36;color:#f3ead2;font-weight:800;font-size:14px;cursor:pointer;padding:6px 14px;border-radius:10px;display:inline-flex;align-items:center;gap:5px;">‹ ' + esc(Z('settings.back')) + '</button></div>' +
      '<div class="span2"><div class="scene-h">✦ ' + esc(Z('create.title')) + ' ✦</div></div>' +
      '<div class="span2" style="display:grid;place-items:center;margin:4px 0 2px;">' +
        '<div class="intro-hero">' + variantImg(120, variant) + '</div>' +
      '</div>' +
      '<div class="panel span2" style="padding:12px 15px;display:flex;align-items:center;gap:10px;">' +
        '<div style="font-weight:800;color:var(--ink-soft);font-size:13px;">' + esc(Z('create.name')) + '</div>' +
        '<input id="qok-name" data-act="name" type="text" maxlength="8" placeholder="' + esc(Z('create.namePlaceholder')) + '" style="flex:1;min-width:0;border:none;background:transparent;font-weight:900;font-size:18px;color:var(--ink);outline:none;" />' +
        '<svg width="18" height="18" viewBox="0 0 24 24" fill="none"><path d="M14 4l6 6-9 9-4 1 1-4 9-9-3-3z" stroke="#9a7a36" stroke-width="2"/></svg>' +
      '</div>' +
      '<div class="panel" style="padding:12px 15px;"><div style="font-weight:800;color:var(--ink-soft);font-size:12px;margin-bottom:9px;">' + (ja ? 'みため' : 'Look') + '</div><div style="display:flex;gap:10px;">' + variantOpts + '</div></div>' +
      '<div class="panel" style="padding:12px 15px;"><div style="font-weight:800;color:var(--ink-soft);font-size:12px;margin-bottom:9px;">' + esc(Z('settings.difficulty')) + '</div><div class="chiprow">' + chips + '</div>' +
        '<div style="text-align:center;font-weight:800;color:#8a6a26;font-size:13px;margin-top:9px;">' + esc(Z('grade.' + grades[di])) + '</div></div>' +
      '<div class="panel" style="padding:12px 15px;display:flex;justify-content:space-between;align-items:center;gap:10px;"><span style="font-weight:800;color:var(--ink-soft);font-size:13px;">' + esc(Z('settings.language')) + '</span>' + langCtrl + '</div>' +
      kanjiRow +
      '<button class="btn btn-gold span2" data-act="introStart" style="margin-top:8px;font-size:17px;">' + use('arrow', 'ic') + esc(Z('create.startGame')) + '</button>' +
      '<div id="qok-name-err" class="span2" style="text-align:center;color:#ff6b6b;font-size:12px;font-weight:700;min-height:14px;"></div>' +
    '</div></div>';

    // heroName excluded from sig so typing doesn't rebuild the input (keeps focus)
    var sig = 'intro|' + variant + '|' + di + '|' + ja + '|' + (pstate() && pstate().kanjiMode) + '|g' + grades.length;
    activate('intro', false);
    var rebuilt = (sig !== lastSig);
    paint(h, sig);
    if (rebuilt) { var inp = document.getElementById('qok-name'); if (inp) inp.value = (ts.heroName || ''); }
  }

  // ============================================================
  //  BATTLE HUD (hybrid: Phaser keeps the monster sprite/effects;
  //  DOM overlays the enemy card, bottom HUD, message, quiz)
  // ============================================================
  // `bi` is the cell index into ui-icons/battle-icons.png, not a symbol id -- see battleIcon().
  // `col` stays white here because these four still sit on saturated blocks; the point of the
  // swap is that the glyph is now TINTABLE, so when the blocks go the colour moves into the
  // glyph by changing this one value per row and nothing else.
  var BATTLE_ACT = [
    { key: 'battle.attack', cls: 'btn-ruby', bi: 0, col: '#fff' },
    { key: 'battle.defend', cls: 'btn-sky', bi: 1, col: '#fff' },
    { key: 'battle.item', cls: 'btn-em', bi: 2, col: '#fff' },
    { key: 'battle.flee', cls: 'btn-slate', bi: 3, col: '#fff' }
  ];
  function battlePlayerBar(p, st) {
    var max = p.totalMaxHp, r = Math.max(0, Math.min(1, max ? st.hp / max : 0));
    return '<div class="pbar"><div class="av" style="width:36px;height:36px;">' + heroImg(22, st.heroColor) + '</div>' +
      '<div style="flex:1;min-width:0;"><div style="font-weight:800;color:#fdf3da;font-size:12px;margin-bottom:5px;">' + esc(st.name) + ' · ' + esc(Z('menu.level')) + ' ' + st.level + '</div>' +
      '<div class="hp dark"><i style="width:' + (r * 100) + '%;"></i></div></div>' +
      '<div style="font-size:11px;font-weight:800;color:#ffeac0;">' + st.hp + '/' + max + '</div></div>';
  }
  // ---- battle damage FX ----
  // The Phaser BattleScene plays hit-flash / crit / camera-shake on the CANVAS (and on
  // the Phaser monster sprite), but the opaque overlay hides the canvas during battle and
  // the enemy is a DOM <img>, so none of it shows. We monkeypatch handleCombatResult to
  // capture each resolved hit, then re-bridge the visuals in the DOM. (Audio SFX still
  // fire from Phaser unaffected.)
  var _hitSeq = 0, _hitShown = 0, _lastHit = null;
  var _resolveBaseline = null; // messageText captured at answer-time; resolve feedback shows only until it changes
  function patchBattle(bs) {
    if (!bs || bs.__qokHitPatched) return;
    var orig = bs.handleCombatResult;
    if (typeof orig !== 'function') return;
    bs.__qokHitPatched = true;
    bs.handleCombatResult = function (x) {
      try {
        // record real damage hits only; victory/defeat/fled get their own screens
        if (x && typeof x.damage === 'number' && x.state !== 'victory' && x.state !== 'defeat' && x.state !== 'fled') {
          _lastHit = { who: this.quizForPlayer ? 'enemy' : 'player', dmg: x.damage | 0, crit: !!x.critical, seq: ++_hitSeq };
        }
      } catch (e) {}
      return orig.apply(this, arguments);
    };
  }
  function spawnFx(hit) {
    if (!fx || !root) return;
    var crit = hit.crit, dmg = hit.dmg, toEnemy = (hit.who === 'enemy'), miss = !(dmg > 0);
    var el = root.querySelector(toEnemy ? '.bmon' : '.pbar'), rect = el ? el.getBoundingClientRect() : null;
    if (toEnemy && el) {
      var hc = crit ? 'qok-crithit' : 'qok-hit';
      el.classList.remove('qok-hit', 'qok-crithit'); void el.offsetWidth; el.classList.add(hc);
      setTimeout(function () { try { el.classList.remove(hc); } catch (e) {} }, 600);
    } else if (!toEnemy) {
      stage.classList.remove('qok-shake'); void stage.offsetWidth; stage.classList.add('qok-shake');
      setTimeout(function () { try { stage.classList.remove('qok-shake'); } catch (e) {} }, 460);
      var hf = document.createElement('div'); hf.className = 'qok-hurtflash'; fx.appendChild(hf);
      setTimeout(function () { try { hf.remove(); } catch (e) {} }, 480);
    }
    if (crit) {
      var cflash = document.createElement('div'); cflash.className = 'qok-critflash'; fx.appendChild(cflash);
      setTimeout(function () { try { cflash.remove(); } catch (e) {} }, 440);
    }
    var cx = rect ? rect.left + rect.width / 2 : (window.innerWidth / 2);
    var cy = rect ? rect.top + rect.height * (toEnemy ? 0.42 : 0.3) : (window.innerHeight * (toEnemy ? 0.36 : 0.7));
    var d = document.createElement('div');
    d.className = 'dmgnum ' + (miss ? 'miss' : (crit ? 'crit' : (toEnemy ? 'enemyhit' : 'playerhit')));
    var missTxt = Z('battle.miss'); if (missTxt === 'battle.miss') missTxt = 'Miss';
    d.textContent = miss ? missTxt : ('-' + dmg);
    d.style.left = cx + 'px'; d.style.top = cy + 'px';
    fx.appendChild(d);
    setTimeout(function () { try { d.remove(); } catch (e) {} }, 950);
    if (crit) {
      var critTxt = Z('battle.critical'); if (critTxt === 'battle.critical') critTxt = 'Critical!';
      var cl = document.createElement('div'); cl.className = 'critlabel'; cl.textContent = critTxt;
      cl.style.left = cx + 'px'; cl.style.top = (cy - 40) + 'px';
      fx.appendChild(cl);
      setTimeout(function () { try { cl.remove(); } catch (e) {} }, 1100);
    }
  }
  function runBattleFx(bs) {
    patchBattle(bs);
    if (!_lastHit || _lastHit.seq === _hitShown) return;
    _hitShown = _lastHit.seq;
    try { spawnFx(_lastHit); } catch (e) {}
  }
  // ---- battle background (generated biome/boss art behind the battle) ----
  var MAP_BG = {
    sunkenCellar: 'coast', whisperingWoodsCave: 'forest', coastalReef: 'coast', mistyGrotto: 'cave_misty', crystalCave: 'cave_misty',
    ironMine: 'mountains', stormNest: 'storm_peak', hauntedForest: 'haunted_wood', frozenLake: 'frozen', shadowCave: 'cave_misty',
    oasisDepths: 'desert', desertTomb: 'tomb_ruins', banditHideout: 'canyon', scorchedRuins: 'desert',
    emberMines: 'magma', magmaTunnels: 'magma', obsidianCavern: 'obsidian', volcanicForge: 'magma',
    demonBarracks: 'demon_castle', voidRift: 'void', demonCastle: 'demon_castle',
    stormreachIsles: 'storm_peak', frostfallPeaks: 'frozen', sunkenTempleIsle: 'tomb_ruins', twilightRealm: 'void'
  };
  var BOSS_BG = { stormSentinel: 'boss_storm_sentinel', frostMonarch: 'boss_frost_monarch', swordWraith: 'boss_sword_wraith', celestialGuardian: 'boss_celestial_guardian', demonKing: 'boss_demon_king' };
  // Per-bg enemy-feet Y (% of the scene height). Most platforms sit at the default 64%, but a few
  // boss daises are drawn higher in the frame, so the enemy must rise to land ON them. Tuned visually.
  var FEET_Y = { boss_storm_sentinel: 58, boss_demon_king: 60 };
  // Every boss (not just the 5 arena bosses) renders larger than a regular monster. A monster is a
  // boss if aiPattern==='boss' OR its id is in the engine's mid/late/final-boss tier lists (getEnemyTier).
  var BOSS_IDS = { demonKing:1, flameTitan:1, swordWraith:1, celestialGuardian:1, stormSentinel:1, frostMonarch:1,
    giantToad:1, serpent:1, giantCrab:1, kraken:1, dragon:1, sandGolem:1, iceWyrm:1, lavaWyrm:1, stormHarpy:1, banditLord:1, lich:1 };
  function isBossMonster(m) { return !!(m && (m.aiPattern === 'boss' || BOSS_IDS[m.id])); }
  function overworldBg(y) { y = y || 0; if (y < 100) return 'demon_castle'; if (y < 170) return 'magma'; if (y < 260) return 'mountains'; if (y < 320) return 'forest'; return 'grass_plains'; }
  function battleBgKey(bs) {
    try {
      var m = bs && bs.monster;
      if (m && m.id && BOSS_BG[m.id]) return BOSS_BG[m.id]; // 5 legendary/final bosses get their own arena
      var pos = (pstate() && pstate().position) || {};
      if (pos.mapId && pos.mapId !== 'overworld') return MAP_BG[pos.mapId] || 'grass_plains';
      return overworldBg(pos.y); // overworld: biome by latitude band
    } catch (e) { return 'grass_plains'; }
  }
  var _curBg = null;
  function setBattleBg(bs) {
    if (!root) return;
    var key = battleBgKey(bs);
    if (key === _curBg) return;
    _curBg = key;
    // Full-bleed bg on #qok-ui (border-box → covers the safe-area padding too, so the scene
    // continues behind the HUD — no black panel). position:center bottom keeps the FOREGROUND
    // anchored low; the monster is pinned to the HUD-top (.bstage flex:1, bottom-aligned), which
    // lands on that foreground. Scrim darkens the bottom for HUD legibility, lifts in the middle
    // so the monster reads clearly. Set here so it survives paint().
    root.style.backgroundImage = "linear-gradient(180deg, rgba(8,9,20,.30) 0%, rgba(8,9,20,.08) 34%, rgba(8,9,20,.10) 58%, rgba(8,9,20,.38) 100%), url('assets/backgrounds/bg-" + key + ".webp')";
    root.style.setProperty('--qok-feety', (FEET_Y[key] || 64) + '%'); // raise the enemy onto bgs whose platform sits higher
  }
  function clearBattleBg() { if (root && _curBg !== null) { root.style.backgroundImage = ''; _curBg = null; } }
  function renderBattle() {
    var bs = getScene('BattleScene'), p = player(), st = pstate();
    if (!bs || !p || !st) return;
    var phase = bs.phase, loc = locale();
    var isQuiz = (phase === 'playerQuiz' || phase === 'enemyQuiz') && bs.quizQuestion;

    // ---- enemy card + monster + bottom HUD (fully opaque; enemy stays visible in EVERY phase, incl. quiz) ----
    var ehp = bs.engine ? bs.engine.monsterHp : 0, emax = (bs.monster && bs.monster.baseHp) || 1;
    var eR = Math.max(0, Math.min(1, emax ? ehp / emax : 0));
    var ename = bs.monster ? Z(bs.monster.nameKey) : '';
    var sprite = (bs.monster && bs.monster.spriteKey) ? bs.monster.spriteKey : '';
    var bossCls = isBossMonster(bs.monster) ? ' boss' : ''; // bosses render larger than regular monsters
    var enemyCard = '<div class="enemy-card"><div style="flex:1;"><div style="font-weight:800;color:#ffd9a6;font-size:14px;">' + esc(ename) + '</div>' +
      '<div class="hp dark mt6"><i style="width:' + (eR * 100) + '%;background:linear-gradient(180deg,#ef6a60,#bb3a32);"></i></div></div></div>';
    var msrc = getMonsterSrc(sprite);
    var hdCls = isMonsterHd(sprite) ? ' hd' : '';
    var monImg = msrc ? '<img class="bmon' + bossCls + hdCls + '" src="' + msrc + '" alt="" />' : (sprite ? '<div class="bmon' + bossCls + '" style="display:flex;"></div>' : '');

    var content = '', dyn = '', showPlayerBar = true;
    if (isQuiz) {
      var q = bs.quizQuestion;
      var qtext = (q.questionText && (q.questionText[loc] || q.questionText.en)) || '';
      var ans = q.answers || [];
      var timer = st.timerEnabled ? '<div class="qtimer" id="qok-qtimer"><i style="width:100%;"></i></div>' : '';
      var ah = '';
      for (var a = 0; a < ans.length; a++) {
        var at = (ans[a].text && (ans[a].text[loc] || ans[a].text.en)) || '';
        ah += '<button class="qbtn' + (a === bs.quizSelectedIndex ? ' sel' : '') + '" data-act="quizAns" data-i="' + a + '">' + esc(at) + '</button>';
      }
      content = '<div class="qcard panel">' + timer +
        '<div class="qprompt">' + esc(Z('quiz.answerToAttack')) + '</div>' +
        '<div class="qq">' + esc(qtext) + '</div><div class="qans">' + ah + '</div></div>';
      dyn = 'quiz|' + qtext + '|' + bs.quizSelectedIndex + '|' + ans.length;
      showPlayerBar = false; // the quiz card is tall; drop the player bar to keep the enemy on screen
    } else if (phase === 'itemSelect') {
      var ir = '<div class="itemrow">';
      var items = bs.itemMenuItems || [];
      for (var k = 0; k < items.length; k++) {
        var iid = items[k].getData && items[k].getData('itemId');
        if (!iid) continue;
        if (iid === '__cancel__') {
          ir += '<button class="btn btn-slate' + (k === bs.itemMenuIndex ? ' sel' : '') + '" data-act="battleItem" data-i="' + k + '">' + esc(Z('settings.back')) + '</button>';
        } else {
          var it = find(iid), cnt = (player().getItemCount ? player().getItemCount(iid) : 0);
          ir += '<button class="btn btn-gold' + (k === bs.itemMenuIndex ? ' sel' : '') + '" data-act="battleItem" data-i="' + k + '" style="justify-content:space-between;">' +
            '<span class="row" style="gap:8px;">' + itemIcon(it) + esc(Z(it.nameKey)) + '</span><span>×' + cnt + '</span></button>';
        }
      }
      content = ir + '</div>';
      dyn = (bs.itemMenuItems || []).map(function (m) { return (m.getData && m.getData('itemId')) || ''; }).join(',') + '|' + bs.itemMenuIndex;
    } else if (phase === 'playerMenu') {
      var ag = '<div class="actiongrid">';
      for (var m = 0; m < BATTLE_ACT.length; m++) {
        var act = BATTLE_ACT[m];
        ag += '<button class="btn ' + act.cls + (m === bs.menuIndex ? ' sel' : '') + '" data-act="battleMenu" data-i="' + m + '">' + battleIcon(act.bi, act.col) + esc(Z(act.key)) + '</button>';
      }
      content = ag + '</div>';
      dyn = 'menu' + bs.menuIndex;
    } else if (phase === 'message') {
      // After answering, confirmQuizAnswer sets phase=message for the ~1s "Correct/Incorrect"
      // resolve window BEFORE the result applies; the Phaser messageText is still the PREVIOUS
      // (stale) message and the real feedback is hidden behind our overlay. Show the answer
      // feedback ONLY while messageText is still the stale baseline; the moment it changes to the
      // real result (damage / "Victory! +EXP! Level up!" / etc.) show THAT — otherwise the resolve
      // feedback would mask the victory/level-up message on a winning blow (quizContainer lingers).
      var mt = (bs.messageText && bs.messageText.text) || '';
      if (bs.quizContainer && bs.quizQuestion && bs.quizQuestion.answers && mt === _resolveBaseline) {
        var _a = bs.quizQuestion.answers[bs.quizSelectedIndex];
        var _ok = !!(_a && _a.isCorrect);
        content = '<div class="msg" style="text-align:center;font-weight:900;color:' + (_ok ? '#5fd089' : '#ef6a60') + ';">' + esc(Z(_ok ? 'quiz.correct' : 'quiz.incorrect')) + '</div>';
        dyn = 'resolve' + _ok;
      } else {
        content = '<div class="msg" data-act="battleAdvance" style="cursor:pointer;text-align:center;white-space:pre-line;">' + esc(mt) + '</div>';
        dyn = 'msg' + mt;
      }
    } else {
      // intro / transitional — show only bars
      content = '';
      dyn = 'x' + phase;
    }

    // The Phaser BattleScene advances messages on a "tap anywhere" (s.input pointerdown),
    // but the opaque DOM overlay swallows those taps — so in the message phase we lay a
    // full-area tap target over everything so any tap advances (restores tap-to-continue).
    var tapAdvance = (phase === 'message') ? '<div data-act="battleAdvance" aria-label="Continue" style="position:absolute;inset:0;z-index:40;cursor:pointer;"></div>' : '';
    var hud = tapAdvance + '<div class="bstage">' + enemyCard + monImg + '</div><div class="hudwrap">' + content + (showPlayerBar ? battlePlayerBar(p, st) : '') + '</div>';
    var sig = 'battle|' + phase + '|' + sprite + '|e' + ehp + '/' + emax + '|h' + st.hp + '/' + p.totalMaxHp + '|' + loc + '|' + dyn;
    activate('battle', true);
    setBattleBg(bs); // biome/boss background behind the battle (cover-fit, full-bleed)
    paint(hud, sig);
    if (isQuiz) updateQuizTimer(bs);
    runBattleFx(bs); // spawn damage number / hit-flash / crit / shake (after paint, into the FX layer)
  }
  function updateQuizTimer(bs) {
    try {
      var el = document.querySelector('#qok-qtimer i');
      if (el && bs.quizTimerBar && bs.quizTimerBarFullWidth) {
        var r = Math.max(0, Math.min(1, bs.quizTimerBar.displayWidth / bs.quizTimerBarFullWidth));
        el.style.width = (r * 100) + '%';
        el.style.background = r > 0.5 ? 'linear-gradient(90deg,#5fd089,#2f9c5b)' : (r > 0.25 ? 'linear-gradient(90deg,#f0c969,#c79a3f)' : 'linear-gradient(90deg,#ef6a60,#bb3a32)');
      }
    } catch (e) {}
  }

  // ============================================================
  //  TITLE / LANDING SCREEN (TitleScene mode==='title')
  // ============================================================
  function renderTitle() {
    var ts = getScene('TitleScene');
    if (!ts) return;
    var hasSave = false; try { hasSave = !!(window.localStorage && localStorage.getItem('edu-rpg-save')); } catch (e) {}
    var ja = isJa();
    var heroColor = (ts.colorOptions && ts.colorOptions[ts.colorIndex || 0]) || 'gray';
    // spread vertically: title group at top, big hero in the middle, action buttons in the bottom thumb zone
    var h = '<div class="t-screen">' +
        '<div class="t-head">' +
          '<div class="title-kicker">✦ &nbsp;Quest of Knowledge&nbsp; ✦</div>' +
          '<div class="title-name">' + esc(Z('title.gameName')) + '</div>' +
          '<div class="scene-s">' + esc(Z('title.subtitle')) + '</div>' +
        '</div>' +
        '<div class="t-hero">' + heroImg(160, heroColor) + '</div>' +
        '<div class="t-actions">' +
          '<button class="btn btn-gold" data-act="titleNew" style="width:100%;font-size:18px;">' + use('arrow', 'ic') + esc(Z('title.newGame')) + '</button>' +
          (hasSave ? '<button class="btn btn-slate" data-act="titleContinue" style="width:100%;font-size:17px;">' + use('arrow', 'ic') + esc(Z('title.continue')) + '</button>' : '') +
          '<div class="toggle" data-act="titleLang" style="margin-top:4px;"><span class="' + (!ja ? 'on' : '') + '">English</span><span class="' + (ja ? 'on' : '') + '">日本語</span></div>' +
        '</div>' +
      '</div>';
    var sig = 'title|' + ja + '|' + hasSave + '|' + heroColor + '|' + (ts.ngPlus ? 1 : 0);
    activate('title', false);
    paint(h, sig);
  }

  // ============================================================
  //  TAP ROUTER
  // ============================================================
  // ---- pointer-based tap router (replaces the old click-only onTap) ----
  var downEl = null, downAct = null, gestureRouted = false;
  function isNameTarget(t) {
    if (!t) return false;
    var n = document.getElementById('qok-name');
    return !!(n && (t === n || (t.closest && t.closest('#qok-name'))));
  }
  function isNativeTarget(t) { return isNameTarget(t) || !!(t && t.closest && t.closest('[data-native]')); }
  // Capture-phase on document: swallow every overlay tap so the underlying Phaser scene input never
  // sees it, and route DOM buttons on pointer/touch UP (reliable on iOS — a click often never fires).
  // stopPropagation (not preventDefault) blocks Phaser without killing scroll of the overlay body.
  function pointerGuard(e) {
    if (!root || !root.classList.contains('active')) return; // overlay down: leave the game's own taps alone (d-pad etc.)
    var t = e.target;
    if (!t || !root.contains(t)) return;                     // not our event
    if (isNativeTarget(t)) {                                 // text/range controls keep native focus + drag behavior
      if (t.id === 'qok-volume' && (e.type === 'pointerdown' || e.type === 'touchstart')) draggingVolume = true;
      return;
    }
    e.stopPropagation();                                     // keep the tap away from the live Phaser scene
    var actEl = t.closest ? t.closest('[data-act]') : null;
    var ty = e.type;
    if (ty === 'pointerdown' || ty === 'touchstart') {
      downEl = actEl; downAct = actEl ? actEl.getAttribute('data-act') : null; gestureRouted = false;
    } else if (ty === 'pointerup' || ty === 'touchend') {
      if (!gestureRouted && actEl && actEl === downEl && downAct) { gestureRouted = true; fireTap(actEl, downAct); }
    }
    // mousedown/mouseup/click are swallowed above (no route) — routing already happened on UP.
  }
  // Bubble-phase on #qok-ui: the name field is the only tap we let reach here (pointerGuard passes it
  // through so it can focus). Stop it bubbling to Phaser's window/document listeners. NEVER preventDefault
  // here — that would block focus + the iOS keyboard.
  function inputShield(e) {
    if (root && root.classList.contains('active')) {
      e.stopPropagation();
      if (e.target && e.target.id === 'qok-volume' && (e.type === 'pointerup' || e.type === 'touchend' || e.type === 'mouseup')) {
        draggingVolume = false; lastSig = null; setTimeout(function () { try { tick(); } catch (er) {} }, 0);
      }
    }
  }
  function fireTap(el, act) {
    var iAttr = el.getAttribute('data-i');
    var i = (iAttr == null) ? null : parseInt(iAttr, 10);
    try { route(act, i, el); } catch (err) { /* never break the game */ }
    lastSig = null;              // reflect new state...
    try { tick(); } catch (e) {} // ...and re-render NOW (don't wait up to 50ms for the next poll) so taps feel instant
  }

  function route(act, i, el) {
    if (curScreen === 'menu') return routeMenu(act, i, el);
    if (curScreen === 'shop') return routeShop(act, i, el);
    if (curScreen === 'healer') return routeHealer(act, i, el);
    if (curScreen === 'intro') return routeIntro(act, i, el);
    if (curScreen === 'battle') return routeBattle(act, i, el);
    if (curScreen === 'title') return routeTitle(act, i, el);
    if (curScreen === 'gameover') return routeGameOver(act, i, el);
  }

  function routeGameOver(act, i) {
    var go = getScene('GameOverScene'); if (!go) return;
    if (act !== 'gameOverOpt') return;
    go.menuIndex = i;
    if (go.updateMenuHighlight) { try { go.updateMenuHighlight(); } catch (e) {} }
    // the scene confirms on a keydown-ENTER (inline handler reads menuTexts[menuIndex].action)
    ['keydown', 'keyup'].forEach(function (type) {
      var ev = new KeyboardEvent(type, { key: 'Enter', code: 'Enter', bubbles: true, cancelable: true });
      try { Object.defineProperty(ev, 'keyCode', { get: function () { return 13; } }); Object.defineProperty(ev, 'which', { get: function () { return 13; } }); } catch (e) {}
      window.dispatchEvent(ev);
    });
  }

  function routeTitle(act, i, el) {
    var ts = getScene('TitleScene'); if (!ts) return;
    if (act === 'titleLang') { ts.toggleLanguage(); return; }
    var action = act === 'titleNew' ? 'new' : act === 'titleContinue' ? 'continue' : null;
    if (!action) return;
    var idx = (ts.menuItems || []).findIndex(function (m) { return m.getData && m.getData('action') === action; });
    if (idx >= 0) { ts.selectedIndex = idx; if (ts.updateSelection) ts.updateSelection(); ts.confirm(); }
  }

  function routeBattle(act, i, el) {
    var bs = getScene('BattleScene'); if (!bs) return;
    if (act === 'battleMenu') {
      bs.menuIndex = i; if (bs.updateMenuSelection) bs.updateMenuSelection(); bs.confirmMenuAction();
    } else if (act === 'battleItem') {
      bs.itemMenuIndex = i; if (bs.updateItemSelection) bs.updateItemSelection(); bs.confirmItemSelection();
    } else if (act === 'quizAns') {
      // capture the stale message NOW; the resolve feedback shows only until messageText changes
      // to the result (damage / "Victory! +EXP! Level up!" / etc.), which then displays instead.
      _resolveBaseline = (bs.messageText && bs.messageText.text) || '';
      bs.quizSelectedIndex = i; if (bs.updateQuizSelection) bs.updateQuizSelection(); bs.confirmQuizAnswer();
    } else if (act === 'battleAdvance') {
      bs.advanceMessage();
    }
  }

  function routeShop(act, i, el) {
    var ss = getScene('ShopScene'); if (!ss) return;
    if (act === 'shopMode') {
      var mode = el.getAttribute('data-mode');
      ss.menuIndex = (mode === 'buy') ? 0 : 1; ss.mode = mode; ss.listIndex = 0; ss.message = '';
    } else if (act === 'shopBuy') {
      ss.mode = 'buy'; ss.listIndex = i; ss.buyItem();
    } else if (act === 'shopSell') {
      ss.mode = 'sell'; ss.listIndex = i; ss.sellItem();
    } else if (act === 'shopLeave') {
      ss.leave();
    }
  }

  function routeHealer(act, i, el) {
    var wm = getScene('WorldMapScene'); if (!wm) return;
    if (act === 'healConfirm') { wm.healerOverlayIndex = 0; wm.confirmHealerOption(); }
    else if (act === 'healCancel') { wm.healerOverlayIndex = 1; wm.confirmHealerOption(); }
  }

  function routeIntro(act, i, el) {
    var ts = getScene('TitleScene'); if (!ts) return;
    if (act === 'introVariant') { try { localStorage.setItem('edu-rpg-hero-variant', el.getAttribute('data-variant')); } catch (e) {} }
    else if (act === 'introGrade') { ts.difficultyIndex = i; }
    else if (act === 'introLang') { ts.createRow = 'language'; ts.toggleLanguage(); }
    else if (act === 'introKanji') { ts.createRow = 'kanji'; ts.toggleKanji(); }
    else if (act === 'introBack') {
      // return to the title screen (overlay auto-switches to renderTitle when mode==='title')
      ts.mode = 'title';
      try { if (ts.removeNameInput) ts.removeNameInput(); } catch (e) {}
      try { if (ts.drawTitle) ts.drawTitle(); } catch (e) {}
    }
    else if (act === 'introStart') {
      ts.createRow = 'start'; ts.confirmCreate();
      var err = document.getElementById('qok-name-err');
      if (err && ts.errorText && (!ts.heroName || !ts.heroName.trim())) err.textContent = Z('create.nameRequired');
    }
  }

  function onInput(e) {
    var el = e.target;
    if (!el) return;
    if (el.id === 'qok-name') {
      var ts = getScene('TitleScene');
      if (ts) { try { ts.heroName = (el.value || '').slice(0, 8); } catch (err) {} }
      return;
    }
    if (el.id === 'qok-volume') {
      var st = pstate(), v = Math.max(0, Math.min(100, parseInt(el.value, 10) || 0));
      if (st) st.masterVolume = v / 100;
      try { if (QOK() && typeof QOK().setVolume === 'function') QOK().setVolume(v / 100); } catch (err2) {}
      var value = document.getElementById('qok-volume-value'); if (value) value.textContent = v + '%';
      if (e.type === 'change') { draggingVolume = false; lastSig = null; try { tick(); } catch (err3) {} }
    }
  }

  function routeMenu(act, i, el) {
    var ms = getScene('MenuScene');
    if (!ms) return;
    if (act === 'tab') {
      ms.tabIndex = i; ms.currentTab = ms.tabs[i]; ms.listIndex = 0;
      ms.equipMode = 'equipped'; ms.equipSlotIndex = 0; ms.equipInventoryIndex = 0; ms.equipTypeFilter = 'weapon'; ms.equipScrollOffset = 0;
    } else if (act === 'item') {
      ms.listIndex = i; ms.useItem();
    } else if (act === 'equipSlot') {
      ms.equipMode = 'equipped'; ms.equipSlotIndex = i; ms.handleEquipAction();
    } else if (act === 'equipInv') {
      ms.equipMode = 'inventory'; ms.equipInventoryIndex = i; ms.handleEquipAction();
    } else if (act === 'equipFilter') {
      ms.equipTypeFilter = el.getAttribute('data-type'); ms.equipInventoryIndex = 0; ms.equipScrollOffset = 0; ms.equipMode = 'equipped';
    } else if (act === 'setting') {
      ms.listIndex = i; ms.handleSettingToggle(1);
    } else if (act === 'close') {
      ms.scene.stop(); ms.scene.resume('WorldMapScene');
    }
  }

  // ============================================================
  //  FIELD HUD — device-resolution DOM over the low-resolution Phaser world canvas
  // ============================================================
  // Scale.RESIZE deliberately keeps the world canvas in CSS pixels. That is ideal for nearest-neighbor
  // terrain, but it rasterizes HUD text/graphics at roughly 1/3 resolution on a DPR-3 phone. Recreate the
  // field-only HP, minimap, compass and dialogue in DOM/canvas so those elements stay sharp without
  // changing Phaser's renderer or its fragile touch-coordinate mapping.
  var fieldRoot = null, fieldHpText = null, fieldHpFill = null, fieldFloor = null;
  var fieldMap = null, fieldMapCanvas = null, fieldMapIcon = null, fieldMapCollapsed = false, fieldMapDrawAt = 0;
  var fieldCompass = null, fieldCompassArrow = null, fieldDialog = null, fieldDialogSpeaker = null, fieldDialogText = null;
  function hideNativeFieldHud(wm) {
    if (!wm || !fieldRoot || !fieldRoot.classList.contains('active')) return;
    [wm.hudHpPanel, wm.hpText, wm.hpBarBg, wm.hpBarFg, wm.hudFloorPanel, wm.floorText, wm.compassContainer,
      wm.minimapGfx, wm.minimapPlayerDot, wm._minimapBtn, wm._minimapBtnLabel, wm.messageBox, wm.messageSpeaker, wm.messageText].forEach(function (o) {
      try { if (o && o.setVisible) o.setVisible(false); } catch (e) {}
    });
    try { if (wm._minimapHit && wm._minimapHit.disableInteractive) wm._minimapHit.disableInteractive(); } catch (e2) {}
  }
  function nativeHudKey(wm) {
    var st = pstate() || {}, quests = st.activeQuests || [], progress = st.questProgress || {};
    return wm.currentMapId + '|' + wm.currentFloor + '|' + quests.join(',') + '|' + JSON.stringify(progress);
  }
  function patchFieldScene(wm) {
    if (!wm || wm.__qokFieldHudPatched) return; wm.__qokFieldHudPatched = true;
    wm.__qokNativeHudKey = nativeHudKey(wm);
    if (typeof wm.updateHUD === 'function') {
      var updateHUD = wm.updateHUD;
      wm.updateHUD = function () {
        if (fieldRoot && fieldRoot.classList.contains('active')) {
          var key = nativeHudKey(this);
          if (key === this.__qokNativeHudKey) { hideNativeFieldHud(this); return; }
          this.__qokNativeHudKey = key; this.__qokRefreshingNativeHud = true;
          try { return updateHUD.apply(this, arguments); }
          finally { this.__qokRefreshingNativeHud = false; hideNativeFieldHud(this); }
        }
        return updateHUD.apply(this, arguments);
      };
    }
    ['renderMinimap', 'updateCompass'].forEach(function (name) {
      if (typeof wm[name] !== 'function') return;
      var original = wm[name];
      wm[name] = function () {
        if (fieldRoot && fieldRoot.classList.contains('active') && !this.__qokRefreshingNativeHud) { hideNativeFieldHud(this); return; }
        var r = original.apply(this, arguments); hideNativeFieldHud(this); return r;
      };
    });
  }
  function ensureFieldHud() {
    if (fieldRoot) return fieldRoot;
    var d = document.createElement('div'); d.id = 'qok-field-hud';
    d.innerHTML = '<div class="qfhp"><div id="qfhp-text"></div><div class="qfhp-bar"><i id="qfhp-fill"></i></div></div>' +
      '<div id="qfh-floor"></div>' +
      '<button id="qfh-map" aria-label="Map"><canvas id="qfh-map-canvas"></canvas><span id="qfh-map-icon">▧</span></button>' +
      // COMPASS. Was a CSS border-triangle inside a bordered div: a solid gold wedge whose
      // rotation centre was the 0x0 border box rather than the needle's own middle, so it swung
      // off-axis and sat high in the dial. It is one SVG now -- ring, ticks, cardinals and needle
      // in a single coordinate system, rotating about an exact centre -- and drawn in the same
      // hairline language as the rest of the HUD instead of one heavy filled shape.
      // North half filled, south half hollow: the classic reading, and the only way a needle this
      // small says which end is the pointer.
      '<div id="qfh-compass">' +
        '<svg viewBox="0 0 68 68" aria-hidden="true">' +
          '<circle class="qfc-ring" cx="34" cy="34" r="31.5"/>' +
          '<g class="qfc-tick">' +
            '<path d="M34 3v3.5M34 65v-3.5M3 34h3.5M65 34h-3.5"/>' +
          '</g>' +
          '<g class="qfc-tick qfc-tick-min">' +
            '<path d="M12.1 12.1l1.4 1.4M55.9 12.1l-1.4 1.4M55.9 55.9l-1.4-1.4M12.1 55.9l1.4-1.4"/>' +
          '</g>' +
          '<text class="qfc-c qfc-n" x="34" y="17.6">N</text>' +
          '<text class="qfc-c" x="34" y="57.4">S</text>' +
          '<text class="qfc-c" x="54" y="37.5">E</text>' +
          '<text class="qfc-c" x="14" y="37.5">W</text>' +
          '<g id="qfh-compass-arrow">' +
            '<path class="qfc-nd" d="M34 17L37.4 34h-6.8z"/>' +
            '<path class="qfc-sd" d="M34 51L30.6 34h6.8z"/>' +
          '</g>' +
          '<circle class="qfc-pivot" cx="34" cy="34" r="2.2"/>' +
        '</svg>' +
      '</div>' +
      '<div id="qfh-dialog"><b id="qfh-dialog-speaker"></b><span id="qfh-dialog-text"></span></div>';
    (document.body || document.documentElement).appendChild(d);
    fieldRoot = d; fieldHpText = d.querySelector('#qfhp-text'); fieldHpFill = d.querySelector('#qfhp-fill');
    fieldFloor = d.querySelector('#qfh-floor'); fieldMap = d.querySelector('#qfh-map'); fieldMapCanvas = d.querySelector('#qfh-map-canvas'); fieldMapIcon = d.querySelector('#qfh-map-icon');
    fieldCompass = d.querySelector('#qfh-compass'); fieldCompassArrow = d.querySelector('#qfh-compass-arrow');
    fieldDialog = d.querySelector('#qfh-dialog'); fieldDialogSpeaker = d.querySelector('#qfh-dialog-speaker'); fieldDialogText = d.querySelector('#qfh-dialog-text');
    ['pointerdown', 'pointerup', 'touchstart', 'touchend', 'click'].forEach(function (type) { fieldMap.addEventListener(type, function (e) { e.preventDefault(); e.stopPropagation(); }); });
    fieldMap.addEventListener('pointerup', function () {
      var wm = getScene('WorldMapScene'); fieldMapCollapsed = !fieldMapCollapsed;
      if (wm) { wm.minimapCollapsed = fieldMapCollapsed; wm.lastMinimapUpdate = 0; try { wm.renderMinimap(); } catch (e) {} }
      fieldMapDrawAt = 0; updateFieldHud();
    });
    return d;
  }
  // ---- town minimap -----------------------------------------------------------------------
  // A town rendered by the Act 1 hi-fi overlay has no tile map to draw: it is one painting, one
  // walkable polygon and a 65-cell grid at 16 world px. drawFieldMap() below would read the
  // Phaser scene's 16x16 stub and a hero tile that is only written back on exit, i.e. a minimap
  // that is wrong in both the shape and the dot. act1-hifi/adapter.js publishes the real thing on
  // window.__ACT1_TOWN_VIEW__ instead; the walkable outline is rasterised once per town and then
  // only the hero and the markers move.
  var townMaskCanvas = null, townMaskId = '';
  function townView() {
    var v = window.__ACT1_TOWN_VIEW__;
    return v && v.walkable && v.world ? v : null;
  }
  function townMask(v) {
    if (townMaskCanvas && townMaskId === v.id) return townMaskCanvas;
    var N = 260;                                   // raster resolution of the 1040px town square
    var c = document.createElement('canvas'); c.width = N; c.height = N;
    var g = c.getContext('2d'), k = N / v.world;
    var poly = function (pts) {
      if (!pts || !pts.length) return;
      g.moveTo(pts[0].x * k, pts[0].y * k);
      for (var i = 1; i < pts.length; i++) g.lineTo(pts[i].x * k, pts[i].y * k);
      g.closePath();
    };
    g.clearRect(0, 0, N, N);
    // Ground first, with the region's holes punched out by the even-odd rule in the same path.
    g.fillStyle = '#2a2c35'; g.beginPath();
    (v.walkable.regions || []).forEach(function (r) {
      poly(r.outer);
      (r.holes || []).forEach(poly);
    });
    g.fill('evenodd');
    // Props (well, crates, stalls) read as blocked, same as a dungeon wall does.
    g.fillStyle = '#0a0b0f'; g.beginPath();
    (v.walkable.staticObstacles || []).forEach(function (o) { poly(o.polygon); });
    g.fill();
    townMaskCanvas = c; townMaskId = v.id;
    return c;
  }
  function drawTownMap(v) {
    if (!fieldMapCanvas) return;
    var now = Date.now(); if (now - fieldMapDrawAt < 160) return; fieldMapDrawAt = now;
    var css = Math.max(1, fieldMapCss());
    var dpr = Math.max(1, Math.min(4, window.devicePixelRatio || 1)), pxw = Math.round(css * dpr);
    if (fieldMapCanvas.width !== pxw || fieldMapCanvas.height !== pxw) { fieldMapCanvas.width = pxw; fieldMapCanvas.height = pxw; }
    var ctx = fieldMapCanvas.getContext('2d'); ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.imageSmoothingEnabled = true;
    ctx.clearRect(0, 0, css, css);
    ctx.fillStyle = '#101116'; ctx.fillRect(0, 0, css, css);
    // The whole town fits: 1040px across is roughly a screen and a half, so panning it would
    // hide the very thing a town map is for -- where the shop, the healer and the way out are.
    ctx.drawImage(townMask(v), 0, 0, css, css);
    var s = css / v.world, cp = v.cellPx;
    var dot = function (cell, fill, r) {
      if (!cell) return;
      ctx.fillStyle = fill; ctx.beginPath();
      ctx.arc(cell[0] * cp * s, cell[1] * cp * s, r, 0, 6.2832); ctx.fill();
    };
    (v.npcs || []).forEach(function (c) { dot(c, 'rgba(232,226,212,.42)', 2); });
    dot(v.shop, '#c9a961', 2.6);
    dot(v.save, '#6f9e7e', 2.6);
    dot(v.exit, '#c9a961', 3);
    ctx.strokeStyle = 'rgba(201,169,97,.28)'; ctx.lineWidth = 1; ctx.strokeRect(.5, .5, css - 1, css - 1);
    // The hero is the one thing on this map that must never be mistaken for a marker, and the
    // flat square it used to be was exactly that -- a fifth dot among the shop, save, exit and
    // NPC dots. Same reticle as the field map: this is one canvas to the player, so it must not
    // carry two different ideas of "you are here".
    mmHero(ctx, v.hero.x * s, v.hero.y * s);
  }
  // 34,34 is the centre of the compass SVG's 68-unit viewBox. Setting the attribute rather
  // than a CSS transform keeps the rotation origin explicit and identical in every engine.
  function setCompassBearing(deg) {
    if (!fieldCompassArrow) return;
    fieldCompassArrow.style.display = '';
    fieldCompassArrow.setAttribute('transform', 'rotate(' + deg.toFixed(1) + ' 34 34)');
  }
  // ---- overworld minimap: one baked image, pins on top -------------------------------------
  // The 320x400 overworld terrain is PRE-BAKED by scripts/bake_overworld_minimap.py into
  // ui-map/overworld-relief.png at 6 px/cell, so a draw is one window blit plus a pin per
  // visible landmark instead of the 6,402 fillRect calls the lattice below issues.
  //
  // Owner pick, 2026-08-07, variant B "Relief" of design/mockups/overworld-minimap-semantic.html:
  // flat land, NO road network, nothing competing with the coastline, the blocking masses and
  // the pins. "Tells you where you are, not where to go."
  //
  // The bake preserves the class at every cell CENTRE exactly, so the map cannot disagree with
  // collision; that is asserted in the bake and the build fails if a single centre is wrong.
  // Brightness encodes walkability -- every walkable class is lighter than every blocker and
  // water is darkest -- so "can I get there" is answered before colour is read.
  var MM_SPAN = 80, MM_BAKE = 6, MM_W = 320, MM_H = 400;
  var mmImg = null, mmImgState = 0;                 // 0 idle, 1 loading, 2 ready, 3 failed
  function mmImage() {
    if (mmImgState === 2) return mmImg;
    if (mmImgState === 0) {
      mmImgState = 1;
      var i = new Image();
      i.onload = function () { mmImg = i; mmImgState = 2; fieldMapDrawAt = 0; };
      i.onerror = function () { mmImgState = 3; };   // fall back to the lattice, never blank
      i.src = 'ui-map/overworld-relief.png';
    }
    return null;
  }
  // Landmark positions come from the GRID'S OWN landmark tiles, not from
  // semantic-maps/landmark-roster.json -- that roster puts every Act 1 landmark on plain grass
  // (Greenhollow is 85.7 cells out, Whispering Woods 80.1, Millbrook 65.4, Port Sapphire 56.8).
  // The table below is GENERATED: scripts/bake_overworld_minimap.py rewrites it in place from
  // the same grid it bakes, so the pins cannot drift away from the terrain under them.
  var MM_KINDS = ['town', 'castle', 'dungeon', 'portal', 'hauntedPortal', 'signpost', 'stormNest', 'gateCave', 'specialCave'];
  /* BEGIN GENERATED overworld-minimap-marks */
  var MM_MARKS = [[1,85,30], [3,130,40], [2,185,48], [2,202,48], [3,40,50], [2,80,60], [2,120,70], [0,195,80], [2,242,81], [5,194,82], [2,278,82], [2,242,93], [5,277,95], [0,70,100], [5,81,102], [5,101,102], [2,148,110], [2,172,110], [0,270,120], [3,50,130], [3,120,140], [8,250,140], [0,100,150], [0,220,150], [2,225,160], [2,260,198], [2,260,234], [0,252,242], [4,238,248], [4,242,248], [2,120,260], [0,222,262], [0,130,290], [5,129,292], [5,139,292], [7,148,295], [6,280,295], [7,172,305], [2,80,310], [0,100,320], [0,200,320], [5,99,322], [5,201,322], [5,223,322], [2,185,335], [0,60,340], [5,61,342], [5,81,342], [2,45,350], [2,140,350]];
  /* END GENERATED overworld-minimap-marks */
  // Every landmark is a FIXED-SIZE pin on its own dark seat, never a terrain colour. Fixed size
  // is what stops the signpost, special-cave and desert-signpost tiles from being two-pixel
  // specks, and the seat is what stops a pin's legibility depending on what is underneath it.
  var MM_PIN = {
    town:          { fill: '#c9a961', shape: 'diamond', r: 3.6 },
    castle:        { fill: '#c9a961', shape: 'diamond', r: 5.2 },
    dungeon:       { fill: '#a8564e', shape: 'dot',     r: 3.0 },
    specialCave:   { fill: '#a8564e', shape: 'dot',     r: 3.2, ring: '#c9a961' },
    stormNest:     { fill: '#a8564e', shape: 'diamond', r: 3.4 },
    gateCave:      { fill: '#8377a8', shape: 'dot',     r: 3.4, ring: '#c9a961' },
    portal:        { fill: '#8377a8', shape: 'ring',    r: 3.2 },
    hauntedPortal: { fill: '#4a3f63', shape: 'dot',     r: 3.2, ring: '#a8564e' },
    signpost:      { fill: '#a49e91', shape: 'tick',    r: 1.8 }
  };
  // Drawn smallest-first so a town never disappears under a signpost sharing its cell.
  var MM_ORDER = ['signpost', 'portal', 'hauntedPortal', 'dungeon', 'specialCave', 'stormNest', 'gateCave', 'town', 'castle'];
  function mmPin(ctx, p, x, y) {
    ctx.fillStyle = 'rgba(10,11,15,.72)';
    ctx.beginPath(); ctx.arc(x, y, p.r + 1.7, 0, 6.2832); ctx.fill();
    ctx.fillStyle = p.fill; ctx.strokeStyle = p.ring || 'rgba(10,11,15,.9)'; ctx.lineWidth = 1.2;
    if (p.shape === 'diamond') {
      ctx.beginPath(); ctx.moveTo(x, y - p.r); ctx.lineTo(x + p.r, y); ctx.lineTo(x, y + p.r);
      ctx.lineTo(x - p.r, y); ctx.closePath(); ctx.fill(); if (p.ring) ctx.stroke();
    } else if (p.shape === 'ring') {
      ctx.lineWidth = 1.9; ctx.strokeStyle = p.fill;
      ctx.beginPath(); ctx.arc(x, y, p.r - .6, 0, 6.2832); ctx.stroke();
    } else if (p.shape === 'tick') {
      ctx.fillRect(x - p.r, y - p.r, p.r * 2, p.r * 2);
    } else {
      ctx.beginPath(); ctx.arc(x, y, p.r, 0, 6.2832); ctx.fill(); if (p.ring) ctx.stroke();
    }
  }
  // The hero is a RETICLE, a bright core inside its own ring, because it is the one mark that
  // must never be mistaken for a landmark. The flat #e8e2d4 square this replaces vanished
  // completely when the camera sat between the two haunted portals at (240,248).
  function mmHero(ctx, x, y) {
    ctx.strokeStyle = 'rgba(10,11,15,.85)'; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.arc(x, y, 5.4, 0, 6.2832); ctx.stroke();
    ctx.strokeStyle = '#e8e2d4'; ctx.lineWidth = 1.3;
    ctx.beginPath(); ctx.arc(x, y, 5.4, 0, 6.2832); ctx.stroke();
    ctx.fillStyle = 'rgba(10,11,15,.85)';
    ctx.beginPath(); ctx.arc(x, y, 3.0, 0, 6.2832); ctx.fill();
    ctx.fillStyle = '#e8e2d4';
    ctx.beginPath(); ctx.arc(x, y, 2.0, 0, 6.2832); ctx.fill();
  }
  // The canvas is a fixed 146 CSS px (ui-overhaul.css:364), so measuring it on every draw was a
  // forced layout for a constant. Cached, and invalidated only by the events that can change it.
  var fieldMapCssPx = 0;
  function fieldMapCss() {
    if (!fieldMapCssPx) {
      var w = Math.round(fieldMapCanvas.getBoundingClientRect().width);
      if (w > 0) fieldMapCssPx = w; else return 150;   // collapsed/detached: do not cache a 0
    }
    return fieldMapCssPx;
  }
  try {
    window.addEventListener('resize', function () { fieldMapCssPx = 0; });
    window.addEventListener('orientationchange', function () { fieldMapCssPx = 0; });
  } catch (e) {}
  function drawFieldMap(wm) {
    if (!fieldMapCanvas || !wm || !wm.mapData || !wm.mapData.length) return;
    var now = Date.now(); if (now - fieldMapDrawAt < 220) return; fieldMapDrawAt = now;
    var css = Math.max(1, fieldMapCss());
    var dpr = Math.max(1, Math.min(4, window.devicePixelRatio || 1)), pxw = Math.round(css * dpr);
    if (fieldMapCanvas.width !== pxw || fieldMapCanvas.height !== pxw) { fieldMapCanvas.width = pxw; fieldMapCanvas.height = pxw; }
    var ctx = fieldMapCanvas.getContext('2d'); ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    var map = wm.mapData, H = map.length, W = (map[0] || []).length, span = MM_SPAN, half = span >> 1;
    var sx = Math.max(0, Math.min(Math.max(0, W - span), wm.heroTileX - half));
    var sy = Math.max(0, Math.min(Math.max(0, H - span), wm.heroTileY - half));
    var sc = css / span;
    // The bake IS the overworld. The four portal lands are 40x40 maps generated per portal and
    // have no baked image, so they keep the lattice -- 1,600 rects that also fit the window whole.
    var baked = (wm.currentMapId === 'overworld' && W === MM_W && H === MM_H) ? mmImage() : null;
    ctx.imageSmoothingEnabled = !!baked;
    ctx.clearRect(0, 0, css, css); ctx.fillStyle = '#101116'; ctx.fillRect(0, 0, css, css);
    if (baked) {
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(baked, sx * MM_BAKE, sy * MM_BAKE, span * MM_BAKE, span * MM_BAKE, 0, 0, css, css);
      for (var k = 0; k < MM_ORDER.length; k++) {
        var kind = MM_ORDER[k], p = MM_PIN[kind], ki = MM_KINDS.indexOf(kind);
        for (var m = 0; m < MM_MARKS.length; m++) {
          var mk = MM_MARKS[m]; if (mk[0] !== ki) continue;
          if (mk[1] < sx - 1 || mk[1] > sx + span + 1 || mk[2] < sy - 1 || mk[2] > sy + span + 1) continue;
          mmPin(ctx, p, (mk[1] - sx + .5) * sc, (mk[2] - sy + .5) * sc);
        }
      }
    } else {
      var col = { 0:'#338033',1:'#aa9966',2:'#1a3366',3:'#225522',4:'#666666',5:'#887744',6:'#ffcc00',7:'#cc3333',8:'#9933cc',9:'#33cc66',10:'#226622',11:'#887744',12:'#cc3333',13:'#99bbdd',14:'#1a4d1a',15:'#4488cc',16:'#88aacc',17:'#d8e8f8',18:'#dfc86c',19:'#d4a840',20:'#887744' };
      for (var y = sy; y < Math.min(H, sy + span); y++) for (var x = sx; x < Math.min(W, sx + span); x++) {
        var tile = map[y] && map[y][x] != null ? map[y][x] : 2; ctx.fillStyle = col[tile] || '#111111';
        var special = tile === 6 || tile === 7 || tile === 9 || tile === 10 || tile === 12 || tile === 15 || tile === 16;
        var castle = tile === 8, n = castle ? 3 : (special ? 2 : 1), off = castle ? 1 : (special ? .5 : 0);
        ctx.fillRect((x - sx - off) * sc, (y - sy - off) * sc, Math.ceil(sc * n), Math.ceil(sc * n));
      }
    }
    ctx.strokeStyle = 'rgba(201,169,97,.28)'; ctx.lineWidth = 1; ctx.strokeRect(.5, .5, css - 1, css - 1);
    mmHero(ctx, (wm.heroTileX - sx) * sc, (wm.heroTileY - sy) * sc);
  }
  function updateFieldHud() {
    var d = ensureFieldHud(), wm = getScene('WorldMapScene');
    patchFieldScene(wm);
    var touchHud = !!((window.matchMedia && window.matchMedia('(pointer:coarse), (hover:none)').matches) || (window.Capacitor && (!window.Capacitor.isNativePlatform || window.Capacitor.isNativePlatform())));
    var active = !!(touchHud && wm && sceneActive('WorldMapScene') && !sceneActive('MenuScene') && !sceneActive('ShopScene') && !sceneActive('BattleScene') && !sceneActive('GameOverScene'));
    d.classList.toggle('active', active); if (!active) { try { document.body.classList.remove('qok-dialogue'); } catch (e) {} return; }
    hideNativeFieldHud(wm);
    try { if (wm.compassContainer && wm.compassContainer.setPosition) wm.compassContainer.setPosition(-9999, -9999); } catch (ec) {}
    var p = player(), st = pstate();
    if (p && st) {
      var max = Math.max(1, p.totalMaxHp || st.maxHp || 1), ratio = Math.max(0, Math.min(1, st.hp / max));
      fieldHpText.textContent = Z('menu.level') + st.level + '  ' + Z('menu.hp') + ' ' + st.hp + '/' + max;
      fieldHpFill.style.width = Math.round(ratio * 100) + '%'; fieldHpFill.className = ratio <= .2 ? 'danger' : (ratio <= .5 ? 'warn' : '');
    }
    var tv = townView();
    var hasMap = !!(tv || wm.minimapGfx || wm.minimapPlayerDot || wm._minimapBtn || wm.currentMapId === 'overworld');
    var floorText = !hasMap && wm.floorText && wm.floorText.active !== false && wm.floorText.text ? String(wm.floorText.text) : '';
    fieldFloor.textContent = floorText; fieldFloor.style.display = floorText ? 'block' : 'none';
    fieldMap.style.display = hasMap ? 'block' : 'none';
    if (hasMap) {
      fieldMapCollapsed = !!wm.minimapCollapsed; fieldMap.classList.toggle('collapsed', fieldMapCollapsed); fieldMapIcon.style.display = fieldMapCollapsed ? 'block' : 'none';
      if (!fieldMapCollapsed) { if (tv) drawTownMap(tv); else drawFieldMap(wm); }
    }
    // In a town the compass points at the way OUT. wm.compassEnabled is false there and its
    // quest target is in overworld tiles, neither of which means anything inside the town's own
    // 65-cell space -- so the town view supplies both the origin and the target.
    var compassOn = !!(tv ? tv.exit : wm.compassEnabled);
    fieldCompass.style.display = compassOn ? 'block' : 'none';
    if (compassOn && tv) {
      setCompassBearing(Math.atan2(tv.exit[1] * tv.cellPx - tv.hero.y, tv.exit[0] * tv.cellPx - tv.hero.x) * 180 / Math.PI + 90);
    } else if (compassOn) {
      var target = null; try { target = wm.getCompassTarget && wm.getCompassTarget(); } catch (e2) {}
      if (target) { setCompassBearing(Math.atan2(target.oy - wm.heroTileY, target.ox - wm.heroTileX) * 180 / Math.PI + 90); }
      else fieldCompassArrow.style.display = 'none';
    }
    var showing = !!wm.showingMessage; fieldDialog.style.display = showing ? 'flex' : 'none';
    if (showing) {
      var speaker = wm.messageSpeaker && wm.messageSpeaker.text ? String(wm.messageSpeaker.text) : '';
      fieldDialogSpeaker.textContent = speaker; fieldDialogSpeaker.style.display = speaker ? 'block' : 'none';
      fieldDialogText.textContent = wm.messageText && wm.messageText.text ? String(wm.messageText.text) : '';
    }
    try { document.body.classList.toggle('qok-dialogue', showing); } catch (e3) {}
  }

  // ============================================================
  //  MAIN LOOP
  // ============================================================
  // ---- field/dungeon bottom tabs (replace the floating menu button): open the menu to the tapped tab ----
  var pendingTab = null, _fieldNavEl = null, _fieldNavSig = '';
  function fireEsc() {
    ['keydown', 'keyup'].forEach(function (type) {
      var ev = new KeyboardEvent(type, { key: 'Escape', code: 'Escape', bubbles: true, cancelable: true });
      try { Object.defineProperty(ev, 'keyCode', { get: function () { return 27; } }); Object.defineProperty(ev, 'which', { get: function () { return 27; } }); } catch (e) {}
      window.dispatchEvent(ev);
    });
  }
  function syncFieldNav() {
    var el = _fieldNavEl || (_fieldNavEl = document.getElementById('fieldTabs'));
    if (!el) return;
    var sig = 'fn|' + locale();
    if (sig !== _fieldNavSig) {
      _fieldNavSig = sig;
      var tabs = ['status', 'items', 'equip', 'settings'], h = '';
      for (var i = 0; i < 4; i++) { var t = tabs[i]; h += '<button class="ft" data-fi="' + i + '">' + tabIcon(i) + '<span>' + esc(Z(TAB_KEY[t])) + '</span></button>'; }
      el.innerHTML = h;
    }
    if (!el.__bound) {
      el.__bound = true;
      el.addEventListener('click', function (e) {
        var b = e.target && e.target.closest ? e.target.closest('[data-fi]') : null;
        if (!b) return;
        pendingTab = parseInt(b.getAttribute('data-fi'), 10);
        fireEsc();
      });
    }
  }

  // Measure the REAL safe-area insets with fixed probes (env() reads correctly on a
  // position:fixed probe but resolves unreliably on the toggled #qok-ui overlay in
  // WKWebView) and apply them to #qok-ui as explicit px padding so every overlay
  // (battle/menu/shop/title) clears the Dynamic Island / status bar.
  var _saSig = '', _saProbeL = null, _saProbeR = null, _saDirty = false;
  function measureSafeArea() {
    if (!root) return;
    // Reading offsetHeight forces a synchronous reflow; doing it every 50ms made the whole
    // overlay janky. Measure during the first ~1s (to let env() settle) and thereafter only
    // when a resize/rotation marks it dirty.
    if (__ticks > 20 && !_saDirty) return;
    if (!_saProbeL) {
      // TOP probe: definite 1px width so offsetHeight reliably reports env(top)
      _saProbeL = document.createElement('div');
      _saProbeL.style.cssText = 'position:fixed;top:0;left:0;width:1px;height:env(safe-area-inset-top,0px);visibility:hidden;pointer-events:none;';
      // LEFT probe: definite 1px height, width=env(left); RIGHT probe likewise
      _saProbeR = document.createElement('div');
      _saProbeR.style.cssText = 'position:fixed;top:0;left:0;height:1px;width:env(safe-area-inset-left,0px);visibility:hidden;pointer-events:none;';
      _saProbeL._rr = document.createElement('div');
      _saProbeL._rr.style.cssText = 'position:fixed;top:0;right:0;height:1px;width:env(safe-area-inset-right,0px);visibility:hidden;pointer-events:none;';
      // BOTTOM probe: the town overlay runs in a same-origin IFRAME, where env(safe-area-inset-*)
      // is not the root scroller's and reads 0. The town pad has to clear the home indicator AND
      // the field tab bar, so the measured value is published below and the adapter forwards it in.
      _saProbeL._bb = document.createElement('div');
      _saProbeL._bb.style.cssText = 'position:fixed;bottom:0;left:0;width:1px;height:env(safe-area-inset-bottom,0px);visibility:hidden;pointer-events:none;';
      document.body.appendChild(_saProbeL); document.body.appendChild(_saProbeR);
      document.body.appendChild(_saProbeL._rr); document.body.appendChild(_saProbeL._bb);
    }
    var t = _saProbeL.offsetHeight, l = _saProbeR.offsetWidth, r = _saProbeL._rr.offsetWidth;
    var bt = _saProbeL._bb.offsetHeight;
    var sig = t + '|' + l + '|' + r + '|' + bt;
    if (sig !== _saSig) {
      _saSig = sig;
      root.style.paddingTop = t + 'px';
      root.style.paddingLeft = l + 'px';
      root.style.paddingRight = r + 'px';
      // Seam: read by act1-hifi/adapter.js, which cannot measure this for the town iframe itself.
      window.__QOK_SAFE__ = { top: t, left: l, right: r, bottom: bt };
    }
    if (__ticks > 20) _saDirty = false;
  }
  if (typeof window !== 'undefined') {
    window.addEventListener('resize', function () { _saDirty = true; });
    window.addEventListener('orientationchange', function () { _saDirty = true; });
  }

  // ============================================================
  //  GAME OVER (GameOverScene) — Storybook overlay
  // ============================================================
  function renderGameOver() {
    var go = getScene('GameOverScene'); if (!go) return;
    var OPTS = [
      { a: 'retry', k: 'gameover.retry', cls: 'btn-gold' },
      { a: 'restart_save', k: 'gameover.restart_save', cls: 'btn-slate' },
      { a: 'title', k: 'gameover.title_screen', cls: 'btn-slate' }
    ];
    // the scene disables "restart from save point" when there's no save
    var saveDisabled = !!(go.menuTexts && go.menuTexts[1] && go.menuTexts[1].getData && go.menuTexts[1].getData('disabled'));
    var h = '<div class="go-screen"><div class="go-head"><div class="go-skull">☠</div>' +
      '<div class="go-title">' + esc(Z('gameover.title')) + '</div></div><div class="go-actions">';
    for (var i = 0; i < OPTS.length; i++) {
      var dis = (OPTS[i].a === 'restart_save' && saveDisabled);
      h += '<button class="btn ' + OPTS[i].cls + (dis ? ' go-dis' : '') + '"' +
        (dis ? '' : ' data-act="gameOverOpt" data-i="' + i + '"') +
        ' style="width:100%;font-size:18px;">' + esc(Z(OPTS[i].k)) + '</button>';
    }
    h += '</div></div>';
    var sig = 'gameover|' + saveDisabled + '|' + locale();
    activate('gameover', false);
    paint(h, sig);
  }

  // Overworld dialogue (WorldMapScene.showMessage) advances on a scene tap, but the DOM d-pad +
  // field-tabs overlap the message box and swallow those taps — so a player tapping the dialogue got
  // "stuck at the opening dialogue". Bridge a full-screen tap-to-advance whenever a WorldMap message is
  // showing. advanceDialog() has its own 300ms debounce, so a stray pointerup+touchend pair can't skip a page.
  var _msgCatcher = null;
  function ensureMsgCatcher() {
    if (_msgCatcher) return _msgCatcher;
    var d = document.createElement('div');
    d.id = 'qok-msg-advance';
    d.style.cssText = 'position:fixed;inset:0;z-index:150;display:none;background:transparent;';
    function adv(e) {
      e.preventDefault(); e.stopPropagation();
      var wm = getScene('WorldMapScene');
      if (wm && wm.showingMessage && typeof wm.advanceDialog === 'function') {
        try { wm.advanceDialog(); } catch (er) {}
        lastSig = null; try { tick(); } catch (er2) {}
      }
    }
    d.addEventListener('pointerup', adv);
    d.addEventListener('touchend', adv);
    (document.body || document.documentElement).appendChild(d);
    _msgCatcher = d;
    return d;
  }
  function syncMsgCatcher() {
    var wm = getScene('WorldMapScene');
    var showing = !!(wm && wm.showingMessage && sceneActive('WorldMapScene') && root && !root.classList.contains('active'));
    ensureMsgCatcher().style.display = showing ? 'block' : 'none';
  }

  // Re-render the overlay the instant a Phaser scene transitions (create/wake/sleep/etc.) so
  // it activates/deactivates in sync with the scene — the canvas-hide flips before the old
  // Phaser UI can paint, killing the flash. (Without this we'd wait up to one 50ms poll.)
  function hookScenes() {
    var g = (typeof window !== 'undefined') && window.__PHASER_GAME__;
    if (!g || !g.scene || !g.scene.scenes) return;
    g.scene.scenes.forEach(function (s) {
      if (!s || s.__qokHook) return; s.__qokHook = true;
      ['create', 'wake', 'sleep', 'shutdown', 'start', 'resume', 'pause'].forEach(function (ev) {
        try { s.events.on(ev, function () { try { tick(); } catch (e) {} }); } catch (e) {}
      });
    });
  }
  function update() {
    if (!ensure()) return;
    measureSafeArea();
    if (!QOK() || !GS()) { deactivate(); return; }
    hookScenes();
    syncFieldNav();
    syncMsgCatcher();
    updateFieldHud();
    // healer is a field overlay inside WorldMapScene — check before generic world
    var wm = getScene('WorldMapScene');
    if (wm && sceneActive('WorldMapScene') && wm.healerOverlayOpen) { renderHealer(); return; }
    if (sceneActive('MenuScene')) { renderMenu(); return; }
    if (sceneActive('ShopScene')) { renderShop(); return; }
    if (sceneActive('BattleScene')) { renderBattle(); return; }
    if (sceneActive('GameOverScene')) { renderGameOver(); return; }
    var ts = getScene('TitleScene');
    if (ts && sceneActive('TitleScene')) {
      if (ts.mode === 'create') { renderIntro(); return; }
      if (ts.mode === 'title') { renderTitle(); return; }
    }
    deactivate();
  }
  // Poll on a timer, NOT requestAnimationFrame: rAF is throttled/paused when the
  // page isn't compositing (headless, or a full-DOM screen that hides the canvas),
  // which would freeze state-driven re-renders. A timer fires reliably and 50ms is
  // far more than responsive enough for menu/state reflection.
  var __ticks = 0, __lastErr = null;
  function tick() {
    __ticks++;
    try { update(); } catch (e) { __lastErr = String(e && e.stack || e); }
  }
  window.__QOKUI = { ticks: function () { return __ticks; }, err: function () { return __lastErr; }, sig: function () { return lastSig; }, screen: function () { return curScreen; } };
  function startLoop() { tick(); setInterval(tick, 50); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', startLoop);
  else startLoop();
})();
