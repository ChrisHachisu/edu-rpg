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
  var FW = 64, FH = 64, FRAMES = 12;   // canonical g3 native frame; see scripts/build_hero_g3_walk.py
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
    // apply() bails while the PNG is undecoded (`if (!o.ready) return`), so the decode finishing
    // is itself a reason to re-run the swap. Without this the correction waited for the next
    // interval tick instead of landing the moment the art became usable.
    o.img.onload = function () { o.ready = true; applySoon(); };
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
    // `?hero=procedural` is an explicit debug opt-out. Publish the variant anyway: index.html's
    // loading cover waits on __HERO_VARIANT__, and a flag that is only ever set on the happy path
    // would hold the cover up for its full timeout on the one URL that asked for the old hero.
    if (!v) { window.__HERO_VARIANT__ = 'procedural'; return; }
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
    // ui-overhaul avatar cache snapshots hero-walk frame 0 per colour ONCE and never invalidates
    // it, so whichever hero existed at the first snapshot is what the menu, intro and battle
    // avatars show for the rest of the session. The swap below now normally beats that snapshot,
    // but "normally" is not a guarantee -- if the PNG is still decoding when a DOM screen first
    // paints, the knight gets cached permanently. Busting on every successful swap closes that
    // window for good and retires the stage-2 TODO this comment used to carry.
    try { if (window.__qokHeroArtChanged) window.__qokHeroArtChanged(); } catch (eb) {}

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

  // ---- land the swap in the SAME frame the procedural knight is rebuilt --------------------
  // 2026-08-07, owner: "i also saw ... the old hero asset before the current overworld loaded".
  //
  // The bundle destroys the g3 texture and redraws the closed-helm knight IMMEDIATELY before it
  // starts the overworld, on BOTH paths -- `xr(this, heroColor); this.scene.start("WorldMapScene")`
  // for Continue and the same pair after character creation for New Game. That cannot be
  // prevented from here; the bundle is frozen. What CAN be fixed is how long the wrong hero
  // survives: the only thing driving apply() used to be `setInterval(..., 200)` with no immediate
  // call, so the knight was on screen for up to a full interval -- and WorldMapScene.createHero()
  // runs well inside that window, so the overworld hero was BUILT from the knight texture.
  //
  // Phaser's TextureManager emits `addtexture-<key>` the instant the knight is added, so that
  // event is the exact moment to correct it. The re-apply is deferred to a MICROTASK rather than
  // run inline for two reasons: the bundle's generator adds its 12 frames AFTER generateTexture()
  // returns, so replacing the texture mid-call would fight it; and `scene.start()` only QUEUES the
  // scene -- Phaser processes that queue at the top of the next step, which is a later task. A
  // microtask therefore lands after the generator finishes and still before WorldMapScene exists.
  var applying = false, listening = false;
  function applySoon() {
    if (applying) return;                                  // our own addSpriteSheet re-emits ADD
    applying = true;
    Promise.resolve().then(function () {
      applying = false;
      try { apply(); } catch (e) {}
    });
  }
  function listen() {
    if (listening) return;
    var g = window.__PHASER_GAME__;
    if (!g || !g.textures || !g.textures.on) return;       // bundle has not constructed the game yet
    listening = true;
    g.textures.on('addtexture-hero-walk', applySoon);
    apply();                                               // do not wait a whole interval for the first one
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

  // Hero scale on the tile maps. Owner 2026-08-04: "the hero size on the map is too small."
  // The sheet is a 48px cell holding ~35x39px of character, so at scale 1 the heroine reads
  // SHORTER than one 48px tile and is dwarfed by the 144-192px landmark sprites beside her.
  // Render-only: collision, encounters and transitions all key off heroTileX/heroTileY, which
  // this does not touch. Tunable live via window.__HERO_SCALE__ for a quick judgement call.
  var HERO_SCALE = 1.0125;   // 64 * 1.0125 == the 48 * 1.35 the owner approved: same size, 1.78x the pixels
  function scaleHero() {
    var g = window.__PHASER_GAME__;
    if (!g || !g.scene) return;
    var s = (typeof window.__HERO_SCALE__ === 'number' && window.__HERO_SCALE__ > 0)
      ? window.__HERO_SCALE__ : HERO_SCALE;
    g.scene.scenes.forEach(function (sc) {
      var h = sc && sc.hero;
      if (!h || h.scaleX == null || !h.setScale) return;
      if (Math.abs(h.scaleX - s) < 0.001) return;                 // idempotent: the tick re-runs at 5 Hz
      try { h.setScale(s); } catch (e) {}
    });
  }

  // Start the DECODE at parse time. apply() cannot swap anything until the PNG is decoded, and it
  // used to only ever be asked for one from inside apply() itself -- so the first swap could not
  // possibly succeed, and the knight was guaranteed to be visible for at least one round trip.
  // This script is a classic tag in <body>; the 4.99 MB bundle is a deferred module, so this runs
  // BEFORE the game is even constructed and the decode overlaps the whole boot.
  try { var pv = wantVariant(); if (pv) load(pv); } catch (e) {}

  // DOMContentLoaded fires after deferred modules execute, so the game exists by then -- and
  // BootScene.create() (which builds the knight) is strictly later still, because Phaser boots
  // its scenes on DOM ready and BootScene first preloads 75 monster PNGs. The interval keeps
  // listen() as a backstop in case the game is ever constructed later than that.
  document.addEventListener('DOMContentLoaded', listen);
  listen();

  setInterval(function () { listen(); apply(); hideGuideOnTouch(); fixDefaultLocale(); scaleHero(); }, 200);
  window.__heroOverrideApply = apply;
})();
