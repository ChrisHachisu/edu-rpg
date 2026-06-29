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
    '<symbol id="qok-armorf" viewBox="0 0 24 24"><ellipse cx="5.4" cy="8.4" rx="3.2" ry="2.7" fill="#8d9bad"/><ellipse cx="18.6" cy="8.4" rx="3.2" ry="2.7" fill="#8d9bad"/><ellipse cx="5.4" cy="7.7" rx="3.1" ry="2" fill="#c2cedd"/><ellipse cx="18.6" cy="7.7" rx="3.1" ry="2" fill="#c2cedd"/><path d="M8 6c1.3 1.6 2.5 2.2 4 2.2s2.7-.6 4-2.2l.6 6.4c0 1.4-.5 2.6-1.1 3.2H8.5c-.6-.6-1.1-1.8-1.1-3.2z" fill="#aab8c9"/><path d="M12 8.2v7.6" stroke="#73828f" stroke-width="1"/><path d="M8.4 9.6c2.4 1.4 4.8 1.4 7.2 0" stroke="#828f9f" stroke-width=".8" fill="none"/><path d="M9.1 9.2c-.45 1.5-.45 3.1 0 4.7" stroke="#cdd8e6" stroke-width="1" fill="none" opacity=".5"/><path d="M14.9 9.2c.45 1.5.45 3.1 0 4.7" stroke="#cdd8e6" stroke-width="1" fill="none" opacity=".5"/><rect x="8" y="16" width="8" height="1.5" rx=".6" fill="#9aaabd"/><rect x="8.5" y="17.9" width="7" height="1.5" rx=".6" fill="#9aaabd"/><rect x="9" y="19.8" width="6" height="1.5" rx=".6" fill="#9aaabd"/><path d="M8 6c1.3 1.6 2.5 2.2 4 2.2s2.7-.6 4-2.2" fill="none" stroke="#e0b757" stroke-width="1.3"/></symbol>' +
    '<symbol id="qok-swordf" viewBox="0 0 24 24"><g transform="translate(12 12) rotate(42) scale(1.12) translate(-12 -12)"><path d="M12 1.4l1.7 3.8v8.6h-3.4V5.2z" fill="#cfd8e3"/><path d="M12 1.4l1.7 3.8v8.6H12z" fill="#a9b6c5"/><rect x="11.6" y="5.4" width="0.8" height="8.2" fill="#eef4fa"/><path d="M12 1.4l.9 2.6h-1.8z" fill="#f2f7fc"/><path d="M6.8 13.6h10.4l-1.1 2.4H7.9z" fill="#e0b757"/><path d="M6.8 13.6h10.4l-.5 1.1H7.3z" fill="#f2d684"/><circle cx="7.1" cy="14.3" r="1.05" fill="#c79a3f"/><circle cx="16.9" cy="14.3" r="1.05" fill="#c79a3f"/><rect x="10.7" y="16" width="2.6" height="4.6" rx=".6" fill="#7a4a28"/><rect x="10.7" y="16.9" width="2.6" height=".7" fill="#5a3620"/><rect x="10.7" y="18.3" width="2.6" height=".7" fill="#5a3620"/><rect x="10.7" y="19.7" width="2.6" height=".7" fill="#5a3620"/><circle cx="12" cy="21.4" r="1.7" fill="#e0b757"/><circle cx="12" cy="21.4" r="1.7" fill="none" stroke="#c79a3f" stroke-width=".5"/><circle cx="11.4" cy="20.9" r=".55" fill="#f2d684"/></g></symbol>' +
    '<symbol id="qok-helmf" viewBox="0 0 24 24"><path d="M5 11.2a7 7 0 0114 0v4.6a2.1 2.1 0 01-2.1 2.1H7.1A2.1 2.1 0 015 15.8z" fill="#aab8c9"/><path d="M12 4.2a7 7 0 017 7v4.6a2.1 2.1 0 01-2.1 2.1H12z" fill="#9aaabd"/><ellipse cx="9" cy="10" rx="2" ry="2.6" fill="#cdd8e6" opacity=".5"/><rect x="5.4" y="12" width="13.2" height="1.8" fill="#6b7888"/><rect x="11.1" y="11.6" width="1.8" height="6.4" rx=".4" fill="#39414f"/><rect x="7.6" y="14.6" width="2.2" height="1.1" rx=".4" fill="#39414f"/><rect x="14.2" y="14.6" width="2.2" height="1.1" rx=".4" fill="#39414f"/><path d="M12 2.2l1.8 3.4h-3.6z" fill="#e3594f"/><path d="M5 11.2a7 7 0 0114 0" fill="none" stroke="#e0b757" stroke-width="1.1"/></symbol>' +
    '<symbol id="qok-ringf" viewBox="0 0 24 24"><circle cx="12" cy="15.2" r="5.6" fill="none" stroke="#e0b757" stroke-width="2.6"/><circle cx="12" cy="15.2" r="5.6" fill="none" stroke="#b8902f" stroke-width="1" opacity=".55"/><path d="M8.4 8.6L12 2.8l3.6 5.8-3.6 2.1z" fill="#5aa9e6" stroke="#2f6ea0" stroke-width=".6"/><path d="M12 2.8l3.6 5.8-3.6 2.1z" fill="#3f86c4"/><path d="M10.4 4.8l1.4 2-1 1z" fill="#cfeaff" opacity=".85"/></symbol>' +
    '<symbol id="qok-person" viewBox="0 0 24 24"><circle cx="12" cy="8" r="4" fill="none" stroke="currentColor" stroke-width="2"/><path d="M5 20c0-4 3-6 7-6s7 2 7 6" fill="none" stroke="currentColor" stroke-width="2"/></symbol>' +
    '<symbol id="qok-bag" viewBox="0 0 24 24"><path d="M5 8h14l-1 11H6L5 8z" fill="none" stroke="currentColor" stroke-width="2"/><path d="M9 8V6a3 3 0 016 0v2" fill="none" stroke="currentColor" stroke-width="2"/></symbol>' +
    '<symbol id="qok-gear" viewBox="0 0 24 24"><circle cx="12" cy="12" r="3" fill="none" stroke="currentColor" stroke-width="2"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M5 5l2 2M17 17l2 2M19 5l-2 2M7 17l-2 2" fill="none" stroke="currentColor" stroke-width="2"/></symbol>' +
    '<symbol id="qok-heart" viewBox="0 0 24 24"><path d="M12 21s-7-4.5-7-10a4 4 0 018-1 4 4 0 018 1c0 5.5-7 10-7 10z" fill="#5fcc63" stroke="#2f9c5b" stroke-width="1.5"/></symbol>' +
    '<symbol id="qok-bomb" viewBox="0 0 24 24"><circle cx="11" cy="14" r="6" fill="#5a626f" stroke="#2e333c" stroke-width="1.5"/><path d="M15 8c1-2 3-2 4-1" fill="none" stroke="#7a6541" stroke-width="1.6"/><circle cx="19.5" cy="6" r="1.6" fill="#ffb13a"/></symbol>' +
    '<symbol id="qok-leaf" viewBox="0 0 24 24"><path d="M12 21c0-6 3-10 8-12-1 7-4 11-8 12z" fill="#5fcc63" stroke="#2f9c5b" stroke-width="1.2"/><path d="M12 21c0-5-2-8-6-10 1 6 3 9 6 10z" fill="#7ad07e" stroke="#2f9c5b" stroke-width="1.1"/></symbol>' +
    '<symbol id="qok-flask" viewBox="0 0 24 24"><path d="M10 3h4v4.2l3.3 6.2A3.2 3.2 0 0114.5 18h-5A3.2 3.2 0 016.7 13.4L10 7.2z" fill="currentColor" stroke="#00000040" stroke-width="1"/><rect x="9" y="2" width="6" height="2.4" rx="1" fill="#caa45a"/><ellipse cx="12" cy="15" rx="3.4" ry="2.4" fill="#ffffff44"/></symbol>' +
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
    '</svg>';
  function use(id, cls, col) { return '<svg class="' + (cls || 'ic') + '"' + (col ? ' style="color:' + col + '"' : '') + '><use href="#qok-' + id + '"/></svg>'; }

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

  // ---- monster sprite: chroma-key the solid-black PNG bg to transparent (cached) ----
  var monCache = {}; // sprite -> dataURL | 'pending' | '' (failed)
  function getMonsterSrc(sprite) {
    if (!sprite) return null;
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
        var isBg = function (i) { return px[i] < 30 && px[i + 1] < 30 && px[i + 2] < 30; };
        var seen = new Uint8Array(w * h), stack = [];
        var push = function (x, y) { if (x < 0 || y < 0 || x >= w || y >= h) return; var p = y * w + x; if (seen[p]) return; seen[p] = 1; var i = p * 4; if (isBg(i)) { px[i + 3] = 0; stack.push(p); } };
        for (var x = 0; x < w; x++) { push(x, 0); push(x, h - 1); }
        for (var y = 0; y < h; y++) { push(0, y); push(w - 1, y); }
        while (stack.length) { var p = stack.pop(); var px0 = p % w, py0 = (p - px0) / w; push(px0 + 1, py0); push(px0 - 1, py0); push(px0, py0 + 1); push(px0, py0 - 1); }
        ctx.putImageData(d, 0, 0);
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

  // ---- item icon: unique per consumable, category-specific per equipment ----
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
  var root = null, stage = null, attached = false, lastSig = null, curScreen = null;
  function ensure() {
    if (stage) return true;
    root = document.getElementById('qok-ui');
    if (!root) return false;
    root.insertAdjacentHTML('afterbegin', DEFS);
    stage = document.createElement('div');
    stage.id = 'qok-stage';
    stage.style.cssText = 'display:flex;flex:1;min-height:0;width:100%;';
    root.appendChild(stage);
    if (!attached) { root.addEventListener('click', onTap, true); root.addEventListener('input', onInput, true); attached = true; }
    return true;
  }
  function activate(name, isBattle) {
    if (!root.classList.contains('active')) root.classList.add('active');
    root.classList.toggle('battle', !!isBattle);
    if (curScreen !== name) { curScreen = name; lastSig = null; }
  }
  function deactivate() {
    if (root && root.classList.contains('active')) { root.classList.remove('active', 'battle'); stage.innerHTML = ''; }
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
  var TAB_ICON = { status: 'person', items: 'bag', equip: 'sword', settings: 'gear' };
  var TAB_KEY  = { status: 'menu.status', items: 'menu.items', equip: 'menu.equip', settings: 'menu.settings' };
  var SLOTS = ['weapon', 'armor', 'shield', 'helmet', 'accessory'];
  var SLOT_KEY = { weapon: 'equip.slot.weapon', armor: 'equip.slot.armor', shield: 'equip.slot.shield', helmet: 'equip.slot.helmet', accessory: 'equip.slot.accessory' };

  function topbar(p, st) {
    return '<div class="topbar">' +
      '<div class="av">' + heroImg(28, st.heroColor) + '</div>' +
      '<div class="who"><div class="nm">' + esc(st.name) + '</div><div class="lv">' + esc(Z('menu.level')) + ' ' + st.level + '</div></div>' +
      '<div class="coins">◎ ' + st.gold + '</div>' +
      '<button class="xbtn" data-act="close" aria-label="Close">✕</button></div>';
  }
  function tabbar(cur) {
    var h = '<div class="tabbar">';
    for (var i = 0; i < 4; i++) {
      var t = ['status', 'items', 'equip', 'settings'][i];
      h += '<button class="tab' + (cur === t ? ' on' : '') + '" data-act="tab" data-i="' + i + '">' + use(TAB_ICON[t]) + esc(Z(TAB_KEY[t])) + '</button>';
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
          '<div style="width:74px;height:74px;border-radius:18px;flex:none;display:grid;place-items:center;background:radial-gradient(closest-side,#fff8e6,#eadbb0);box-shadow:inset 0 0 0 2px #d8c18a;">' + heroImg(48, st.heroColor) + '</div>' +
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

  function settingsBody(ms, st) {
    var listArr = ms.settingsList;
    var h = '<div class="body"><div class="zc pad stack g8 grid2"><div class="eyebrow">' + esc(Z('menu.settings')) + '</div>';
    for (var i = 0; i < listArr.length; i++) {
      var key = listArr[i], sel = (ms.listIndex === i), ctrl = '', lab = '';
      if (key === 'difficulty') { lab = Z('settings.difficulty'); ctrl = '<span class="val">' + esc(Z('grade.' + st.quizDifficulty)) + ' ›</span>'; }
      else if (key === 'language') {
        lab = Z('settings.language');
        ctrl = '<div class="toggle" style="pointer-events:none;"><span class="' + (!isJa() ? 'on' : '') + '">EN</span><span class="' + (isJa() ? 'on' : '') + '">日本語</span></div>';
      } else if (key === 'kanji') {
        lab = 'もじ'; ctrl = '<span class="val">' + (st.kanjiMode ? 'むずかしい' : 'かんたん') + '</span>';
      } else if (key === 'timer') {
        lab = Z('settings.timer'); ctrl = '<div class="switch ' + (st.timerEnabled ? 'on' : '') + '" style="pointer-events:none;"></div>';
      } else if (key === 'sound') {
        lab = Z('settings.sound'); ctrl = '<div class="switch ' + (st.soundEnabled ? 'on' : '') + '" style="pointer-events:none;"></div>';
      } else if (key === 'volume') {
        lab = Z('settings.volume'); var v = Math.round((st.masterVolume || 0) * 100);
        ctrl = '<div class="slider" style="pointer-events:none;max-width:140px;"><i style="width:' + v + '%;"></i><b style="left:' + v + '%;"></b></div><span class="val" style="min-width:42px;text-align:right;">' + v + '%</span>';
      } else if (key === 'controlOrientation') {
        lab = isJa() ? 'そうさボタン' : 'Controls';
        var ori = (window.localStorage && localStorage.getItem('eduControlOrientation')) || 'left';
        ctrl = '<div class="seg" style="pointer-events:none;flex:1;max-width:230px;"><b class="' + (ori === 'left' ? 'on' : '') + '">◀</b><b class="' + (ori === 'center' ? 'on' : '') + '">●</b><b class="' + (ori === 'right' ? 'on' : '') + '">▶</b></div>';
      }
      var sp = (key === 'volume' || key === 'controlOrientation') ? ' span2' : '';
      h += '<div class="setrow' + (sel ? ' sel' : '') + sp + '" data-act="setting" data-i="' + i + '"><span class="lab">' + esc(lab) + '</span>' + ctrl + '</div>';
    }
    return h + '</div></div>';
  }

  function renderMenu() {
    var ms = getScene('MenuScene'), p = player(), st = pstate();
    if (!ms || !p || !st) return;
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
      '|' + invSig + '|' + eqSig + '|' + locale() + '|t' + st.timerEnabled + '|s' + st.soundEnabled + '|v' + st.masterVolume + '|k' + st.kanjiMode + '|d' + st.quizDifficulty +
      '|q' + qs.totalCorrect + '/' + qs.totalAsked + '|o' + ((window.localStorage && localStorage.getItem('eduControlOrientation')) || 'left') +
      '|psn' + (st.poisonedUntil && st.poisonedUntil > Date.now() ? 1 : 0);

    activate('menu', false);
    paint(topbar(p, st) + body + tabbar(tab), sig);
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
        '<div style="width:104px;height:104px;border-radius:50%;display:grid;place-items:center;background:radial-gradient(closest-side,#dff6e6,#bfe6cf);box-shadow:0 0 0 3px #5fcc6355,0 0 34px #5fcc6340,inset 0 0 0 2px #fff;">' +
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
  var COLOR_HEX = HEROHEX;
  function renderIntro() {
    var ts = getScene('TitleScene');
    if (!ts) return;
    var colors = ts.colorOptions || ['gray', 'blue', 'pink', 'black'];
    var grades = ts.difficultyOptions || ['k', '1', '2', '3', '4', '5', '6'];
    var ci = ts.colorIndex || 0, di = ts.difficultyIndex || 0;
    var ja = isJa();
    var heroColor = colors[ci];

    var swatches = '';
    for (var c = 0; c < colors.length; c++) {
      swatches += '<i class="swatch' + (c === ci ? ' sel' : '') + '" data-act="introColor" data-i="' + c + '" style="background:' + (COLOR_HEX[colors[c]] || '#888') + ';"></i>';
    }
    var chips = '';
    for (var g = 0; g < grades.length; g++) {
      chips += '<b class="gchip' + (g === di ? ' sel' : '') + '" data-act="introGrade" data-i="' + g + '">' + esc(grades[g].toUpperCase()) + '</b>';
    }
    var langCtrl = '<div class="toggle" data-act="introLang"><span class="' + (!ja ? 'on' : '') + '">EN</span><span class="' + (ja ? 'on' : '') + '">日本語</span></div>';
    var kanjiRow = ja ? ('<div class="row" style="justify-content:space-between;padding:0 4px;"><span style="font-weight:800;color:#f3ead2;font-size:14px;">もじ</span><div class="toggle" data-act="introKanji"><span class="' + (!pstate() || !pstate().kanjiMode ? 'on' : '') + '">かんたん</span><span class="' + (pstate() && pstate().kanjiMode ? 'on' : '') + '">むずかしい</span></div></div>') : '';

    var h = '<div class="body"><div class="zc stack pad g10 grid2" style="padding-top:14px;padding-bottom:18px;">' +
      '<div class="span2"><div class="scene-h">✦ ' + esc(Z('create.title')) + ' ✦</div></div>' +
      '<div class="span2" style="display:grid;place-items:center;margin:2px 0;">' +
        '<div style="width:92px;height:92px;border-radius:24px;display:grid;place-items:center;background:radial-gradient(closest-side,#fff8e6,#eadbb0);box-shadow:inset 0 0 0 2px #d8c18a,0 6px 14px #0004;">' + heroImg(56, heroColor, function(){ if(ts.updateHeroPreview) ts.updateHeroPreview(); }) + '</div>' +
      '</div>' +
      '<div class="panel span2" style="padding:12px 15px;display:flex;align-items:center;gap:10px;">' +
        '<div style="font-weight:800;color:var(--ink-soft);font-size:13px;">' + esc(Z('create.name')) + '</div>' +
        '<input id="qok-name" data-act="name" type="text" maxlength="8" placeholder="' + esc(Z('create.namePlaceholder')) + '" style="flex:1;min-width:0;border:none;background:transparent;font-weight:900;font-size:18px;color:var(--ink);outline:none;" />' +
        '<svg width="18" height="18" viewBox="0 0 24 24" fill="none"><path d="M14 4l6 6-9 9-4 1 1-4 9-9-3-3z" stroke="#9a7a36" stroke-width="2"/></svg>' +
      '</div>' +
      '<div class="panel" style="padding:12px 15px;"><div style="font-weight:800;color:var(--ink-soft);font-size:12px;margin-bottom:9px;">' + esc(Z('create.color')) + '</div><div class="swatchrow">' + swatches + '</div></div>' +
      '<div class="panel" style="padding:12px 15px;"><div style="font-weight:800;color:var(--ink-soft);font-size:12px;margin-bottom:9px;">' + esc(Z('settings.difficulty')) + '</div><div class="chiprow">' + chips + '</div></div>' +
      '<div class="row" style="justify-content:space-between;padding:0 4px;"><span style="font-weight:800;color:#f3ead2;font-size:14px;">' + esc(Z('settings.language')) + '</span>' + langCtrl + '</div>' +
      kanjiRow +
      '<button class="btn btn-gold span2" data-act="introStart" style="margin-top:8px;font-size:17px;">' + use('arrow', 'ic') + esc(Z('create.startGame')) + '</button>' +
      '<div id="qok-name-err" class="span2" style="text-align:center;color:#ff6b6b;font-size:12px;font-weight:700;min-height:14px;"></div>' +
    '</div></div>';

    // heroName excluded from sig so typing doesn't rebuild the input (keeps focus)
    var sig = 'intro|' + ci + '|' + di + '|' + ja + '|' + (pstate() && pstate().kanjiMode) + '|c' + colors.length + '|g' + grades.length;
    activate('intro', false);
    var rebuilt = (sig !== lastSig);
    paint(h, sig);
    if (rebuilt) { var inp = document.getElementById('qok-name'); if (inp) inp.value = (ts.heroName || ''); }
  }

  // ============================================================
  //  BATTLE HUD (hybrid: Phaser keeps the monster sprite/effects;
  //  DOM overlays the enemy card, bottom HUD, message, quiz)
  // ============================================================
  var BATTLE_ACT = [
    { key: 'battle.attack', cls: 'btn-ruby', ic: 'sword', col: '#fff' },
    { key: 'battle.defend', cls: 'btn-sky', ic: 'shield', col: '#fff' },
    { key: 'battle.item', cls: 'btn-em', ic: 'potion', col: '#fff' },
    { key: 'battle.flee', cls: 'btn-slate', ic: 'run', col: '#fff' }
  ];
  function battlePlayerBar(p, st) {
    var max = p.totalMaxHp, r = Math.max(0, Math.min(1, max ? st.hp / max : 0));
    return '<div class="pbar"><div class="av" style="width:36px;height:36px;">' + heroImg(22, st.heroColor) + '</div>' +
      '<div style="flex:1;min-width:0;"><div style="font-weight:800;color:#fdf3da;font-size:12px;margin-bottom:5px;">' + esc(st.name) + ' · ' + esc(Z('menu.level')) + ' ' + st.level + '</div>' +
      '<div class="hp dark"><i style="width:' + (r * 100) + '%;"></i></div></div>' +
      '<div style="font-size:11px;font-weight:800;color:#ffeac0;">' + st.hp + '/' + max + '</div></div>';
  }
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
    var enemyCard = '<div class="enemy-card"><div style="flex:1;"><div style="font-weight:800;color:#ffd9a6;font-size:14px;">' + esc(ename) + '</div>' +
      '<div class="hp dark mt6"><i style="width:' + (eR * 100) + '%;background:linear-gradient(180deg,#ef6a60,#bb3a32);"></i></div></div></div>';
    var msrc = getMonsterSrc(sprite);
    var monImg = msrc ? '<img class="bmon" src="' + msrc + '" alt="" />' : (sprite ? '<div class="bmon" style="display:flex;"></div>' : '');

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
        ag += '<button class="btn ' + act.cls + (m === bs.menuIndex ? ' sel' : '') + '" data-act="battleMenu" data-i="' + m + '">' + use(act.ic, 'ic', act.col) + esc(Z(act.key)) + '</button>';
      }
      content = ag + '</div>';
      dyn = 'menu' + bs.menuIndex;
    } else if (phase === 'message') {
      var mt = (bs.messageText && bs.messageText.text) || '';
      content = '<div class="msg" data-act="battleAdvance" style="cursor:pointer;text-align:center;">' + esc(mt) + '</div>';
      dyn = 'msg' + mt;
    } else {
      // intro / transitional — show only bars
      content = '';
      dyn = 'x' + phase;
    }

    var hud = '<div class="bstage">' + enemyCard + monImg + '</div><div class="hudwrap">' + content + (showPlayerBar ? battlePlayerBar(p, st) : '') + '</div>';
    var sig = 'battle|' + phase + '|' + sprite + '|e' + ehp + '/' + emax + '|h' + st.hp + '/' + p.totalMaxHp + '|' + loc + '|' + dyn;
    activate('battle', true);
    paint(hud, sig);
    if (isQuiz) updateQuizTimer(bs);
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
  //  TAP ROUTER
  // ============================================================
  function onTap(e) {
    var el = e.target && e.target.closest ? e.target.closest('[data-act]') : null;
    if (!el || !root.contains(el)) return;
    e.preventDefault(); e.stopPropagation();
    var act = el.getAttribute('data-act');
    var iAttr = el.getAttribute('data-i');
    var i = (iAttr == null) ? null : parseInt(iAttr, 10);
    try { route(act, i, el); } catch (err) { /* never break the game */ }
    lastSig = null; // force immediate re-render reflecting new state
  }

  function route(act, i, el) {
    if (curScreen === 'menu') return routeMenu(act, i, el);
    if (curScreen === 'shop') return routeShop(act, i, el);
    if (curScreen === 'healer') return routeHealer(act, i, el);
    if (curScreen === 'intro') return routeIntro(act, i, el);
    if (curScreen === 'battle') return routeBattle(act, i, el);
  }

  function routeBattle(act, i, el) {
    var bs = getScene('BattleScene'); if (!bs) return;
    if (act === 'battleMenu') {
      bs.menuIndex = i; if (bs.updateMenuSelection) bs.updateMenuSelection(); bs.confirmMenuAction();
    } else if (act === 'battleItem') {
      bs.itemMenuIndex = i; if (bs.updateItemSelection) bs.updateItemSelection(); bs.confirmItemSelection();
    } else if (act === 'quizAns') {
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
    if (act === 'introColor') { ts.colorIndex = i; if (ts.updateHeroPreview) ts.updateHeroPreview(); }
    else if (act === 'introGrade') { ts.difficultyIndex = i; }
    else if (act === 'introLang') { ts.createRow = 'language'; ts.toggleLanguage(); }
    else if (act === 'introKanji') { ts.createRow = 'kanji'; ts.toggleKanji(); }
    else if (act === 'introStart') {
      ts.createRow = 'start'; ts.confirmCreate();
      var err = document.getElementById('qok-name-err');
      if (err && ts.errorText && (!ts.heroName || !ts.heroName.trim())) err.textContent = Z('create.nameRequired');
    }
  }

  function onInput(e) {
    var el = e.target;
    if (!el || el.id !== 'qok-name') return;
    var ts = getScene('TitleScene');
    if (ts) { try { ts.heroName = (el.value || '').slice(0, 8); } catch (err) {} }
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
  //  MAIN LOOP
  // ============================================================
  function update() {
    if (!ensure()) return;
    if (!QOK() || !GS()) { deactivate(); return; }
    // healer is a field overlay inside WorldMapScene — check before generic world
    var wm = getScene('WorldMapScene');
    if (wm && sceneActive('WorldMapScene') && wm.healerOverlayOpen) { renderHealer(); return; }
    if (sceneActive('MenuScene')) { renderMenu(); return; }
    if (sceneActive('ShopScene')) { renderShop(); return; }
    if (sceneActive('BattleScene')) { renderBattle(); return; }
    var ts = getScene('TitleScene');
    if (ts && sceneActive('TitleScene') && ts.mode === 'create') { renderIntro(); return; }
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
