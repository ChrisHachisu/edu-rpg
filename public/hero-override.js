// hero-override.js — SHIPPED additive override (same pattern as ui-overhaul.js / dq-tiles.js).
// Replaces the procedural `hero-walk` texture with the locked v17 walk sheet.
// 2026-08-03: the ONLY variant is g3, the canonical Act 1 heroine. openface and feminine are
// retired -- see VARIANTS below. [[ADR-0057]] / [[ADR-0060]].
//
// The 4-colour recolor (gray/blue/pink/black) is retired: v17 ships as a single locked palette,
// selected by VARIANT, not colour. Variant source (priority):
//   ?hero=procedural   (URL, debug only: keeps the built-in procedural hero)
//   -> window.__GAME_STATE__.player.heroVariant   (must be in VARIANTS, so only 'g3' passes)
//   -> 'g3'
// Old saves carry heroColor and may carry heroVariant:'openface'; both are ignored — every
// player renders g3, because nothing else is in VARIANTS to select.
//
// Sheet contract (verified 2026-07-11): 576x48 RGBA, 12 frames = dir*3 + pose,
//   dir 0=down 1=left 2=right 3=up, frame 0 = down-idle (the title/create/victory standing pose).
(function () {
  var FW = 48, FH = 48, FRAMES = 12;
  // 2026-08-03, owner: "use the canonical g3 as the default and stop using anything else."
  // openface and feminine are REMOVED from the table, not merely demoted. They were three
  // different characters shipping at once -- the tile runtime (overworld + every dungeon) drew
  // the closed-helm knight while the act1-hifi town overlay drew the g3 heroine, so leaving Port
  // Sapphire silently swapped your protagonist. Dropping them from VARIANTS is what makes the
  // swap total: every lookup below is guarded by `VARIANTS[...]`, so a stale
  // localStorage['edu-rpg-hero-variant'], an old save's heroVariant, or ?hero=openface all fail
  // that check and fall through to g3 rather than resurrecting the old sheet.
  // hero-g3-walk.png is a re-cut of the canonical 64px g3 sheet, not new art
  // (scripts/build_hero_g3_walk.py). ?hero=procedural still opts out to the built-in hero.
  var VARIANTS = { g3: 1 };
  var params = new URLSearchParams(location.search);
  var forced = params.get('hero');            // 'openface' | 'feminine' | 'procedural' | null
  var imgs = {};                              // variant -> { img, ready }

  function load(v) {
    if (imgs[v]) return imgs[v];
    var o = { ready: false, img: new Image() };
    o.img.onload = function () { o.ready = true; };
    o.img.onerror = function () { console.error('[hero-override] failed to load ' + v); };
    o.img.src = 'assets/hero/hero-' + v + '-walk.png';
    imgs[v] = o;
    return o;
  }

  function wantVariant() {
    if (forced === 'procedural') return null;              // explicit opt-out (leave built-in hero)
    if (forced && VARIANTS[forced]) return forced;
    try { var lv = localStorage.getItem('edu-rpg-hero-variant'); if (lv && VARIANTS[lv]) return lv; } catch (e) {}
    try {
      var st = window.__GAME_STATE__ && window.__GAME_STATE__.player;
      if (st && VARIANTS[st.heroVariant]) return st.heroVariant;   // future A/B picker
    } catch (e) {}
    return 'g3';                                           // the only shipped hero
  }

  function apply() {
    var g = window.__PHASER_GAME__;
    if (!g) return;
    var v = wantVariant();
    if (!v) return;                                        // procedural: don't swap
    var o = load(v);
    if (!o.ready) return;
    var tm = g.textures;
    var t = tm.exists('hero-walk') ? tm.get('hero-walk') : null;
    if (t && t.__heroV17 === v) return;                    // already ours for this variant
    if (t) tm.remove('hero-walk');
    var nt = tm.addSpriteSheet('hero-walk', o.img, { frameWidth: FW, frameHeight: FH });
    if (!nt) { console.error('[hero-override] addSpriteSheet failed'); return; }
    nt.__heroV17 = v;
    window.__HERO_VARIANT__ = v;

    // The procedural texture is rebuilt on title/colour changes (regenerateHeroSprites) and the
    // ui-overhaul avatar cache snapshots hero-walk frame 0 per colour. TODO(stage-2): bust the
    // ui-overhaul getHeroSrc cache so the menu/intro/battle avatars repaint to v17 (verify in-engine).

    // Re-point any live sprite still holding the old texture instance.
    g.scene.scenes.forEach(function (sc) {
      if (!sc.sys || !sc.sys.displayList) return;
      sc.sys.displayList.list.slice().forEach(function (obj) {
        if (obj.texture && obj.texture.key === 'hero-walk' && typeof obj.setTexture === 'function') {
          var f = obj.frame && !isNaN(+obj.frame.name) ? +obj.frame.name : 0;
          obj.setTexture('hero-walk', Math.min(f, FRAMES - 1));
        }
      });
    });
  }

  // Hide the desktop keyboard control hint (`↑↓←→: Move  Z: Talk  I: Items  ESC: Menu`, a Phaser
  // `scene.guideText`) on touch devices — it's meaningless without a keyboard. Web keeps it. [owner 2026-07-11]
  // NOTE: a bare feature test is unreliable in the iOS WKWebView Capacitor shell (the guide stayed
  // visible on-device even though it hides fine in the sim). The Capacitor build is ALWAYS a touch
  // device with no keyboard, so treat the native shell as touch unconditionally; the web (gh-pages)
  // build still falls back to real feature detection so desktop keeps its keyboard hint. [owner 2026-07-11]
  var IS_TOUCH = ('ontouchstart' in window) || (navigator.maxTouchPoints > 0) ||
    !!(window.Capacitor && (window.Capacitor.isNativePlatform ? window.Capacitor.isNativePlatform() : true));
  function hideGuideOnTouch() {
    if (!IS_TOUCH) return;
    var g = window.__PHASER_GAME__;
    if (!g) return;
    g.scene.scenes.forEach(function (sc) {
      if (sc.guideText && sc.guideText.setVisible && sc.guideText.visible) {
        try { sc.guideText.setVisible(false); } catch (e) {}
      }
    });
  }

  // Default the language to the DEVICE language on a fresh install. The bundle hardcodes `locale:"ja"`
  // with no device detection, so English devices open in Japanese. One-shot on cold start; respects an
  // existing save AND the user's manual toggle (never re-fires). [owner 2026-07-11]
  var localeFixed = false;
  function fixDefaultLocale() {
    if (localeFixed) return;
    var g = window.__PHASER_GAME__;
    if (!g || !g.scene) return;
    var ts = g.scene.getScene ? g.scene.getScene('TitleScene') : null;
    if (!ts || !g.scene.isActive('TitleScene')) return;
    var hasSave = false;
    try { hasSave = !!localStorage.getItem('edu-rpg-save'); } catch (e) {}
    if (hasSave) { localeFixed = true; return; }          // existing player: keep their saved locale
    var cur = null;
    try { cur = window.__QOK && window.__QOK.loc && window.__QOK.loc(); } catch (e) {}
    if (!cur) return;                                     // i18n not ready yet
    var deviceJa = ((navigator.language || navigator.userLanguage || '') + '').toLowerCase().indexOf('ja') === 0;
    if (!deviceJa && cur === 'ja' && ts.toggleLanguage) { try { ts.toggleLanguage(); } catch (e) {} }
    localeFixed = true;                                   // one-shot; never fight a manual toggle
  }

  setInterval(function () { apply(); hideGuideOnTouch(); fixDefaultLocale(); }, 200);
  window.__heroOverrideApply = apply;
})();
