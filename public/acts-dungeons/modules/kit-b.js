/* Shared helpers for the MECH-B mechanic modules of the authored Acts 2-5 dungeons
   (docs/plans/2026-11-15-authored-dungeons.md, section 5). Registers no mechanic itself.

   Loaded as one of the manifest's async module scripts, so a mechanic module may run before this
   file has: every module asks for the kit lazily (window.__QOK_D2KIT_B__) and waits a tick if it
   is not there yet.

   What lives here:
     * the string table of the eight mechanics (EN / JA kana / JA kanji, always all three);
     * the tick clock (one plan tick = periodSec / periodTicks, 0.185 s), kept in the story flags
       so a timed hazard is in the same phase after Save -> Continue;
     * small damage, the battle start (the bundle's own startBattle, with a monster from the
       dungeon's own encounter zone), sprite loading, sole-point helpers, a walked-path trail;
     * the switch-off of the bundle's built-in mechanic for the dungeon (its own hunter, portals
       and wind), which would otherwise run on top of the authored floor. */
(function () {
  'use strict';
  if (window.__QOK_D2KIT_B__) return;
  var TILE = 48, TICK_MS = 185;

  // ---- strings: every key carries en, ja (kana, spaced, for ages 6-8) and jaKanji -----------------
  var STR = {
    'd2.hp.lost': { en: '-{n} HP', ja: 'HP -{n}', jaKanji: 'HP -{n}' },
    'd2.crust.caught': {
      en: 'The crust melts under your feet!\nYou scramble back to the bank. -{n} HP',
      ja: 'あしもとの いわが とけだした！\nあわてて きしへ もどった。 HP -{n}',
      jaKanji: '足元の 岩が 溶けだした！\nあわてて 岸へ 戻った。 HP -{n}' },
    'd2.forge.verb.turn': { en: 'Turn', ja: 'まわす', jaKanji: '回す' },
    'd2.forge.verb.pour': { en: 'Pull', ja: 'ひく', jaKanji: '引く' },
    'd2.forge.filled': {
      en: 'Molten iron runs down the troughs, fills the mold\nand cools into a bridge!',
      ja: 'とけた てつが みぞを ながれて かたを みたし、\nひえて はしに なった！',
      jaKanji: '溶けた鉄が 溝を 流れて 型を 満たし、\n冷えて 橋に なった！' },
    'd2.forge.pooled': {
      en: 'The iron stops short, pools and cools.\nTurn the troughs and pour again.',
      ja: 'てつは とちゅうで とまり、 ひえて かたまった。\nみぞを まわして もういちど ながそう。',
      jaKanji: '鉄は 途中で 止まり、冷えて 固まった。\n溝を 回して もう一度 流そう。' },
    'd2.forge.done': {
      en: 'The iron runs down, but every mold it reaches\nis already a bridge.',
      ja: 'てつは ながれたが、 そのさきの かたは\nもう はしに なっている。',
      jaKanji: '鉄は 流れたが、その先の 型は\nもう 橋に なっている。' },
    'd2.guard.seen': {
      en: "A guard's lantern finds you!",
      ja: 'みはりの ランタンに てらされた！',
      jaKanji: '見張りの ランタンに 照らされた！' },
    'd2.ice.verb.ring': { en: 'Ring', ja: 'ならす', jaKanji: '鳴らす' },
    'd2.ice.bell': {
      en: 'The frost bell rings.\nThe ice blocks form again where they started.',
      ja: 'こおりの かねが なった。\nこおりの かたまりが もとの ばしょに あらわれた。',
      jaKanji: '氷の鐘が 鳴った。\n氷の塊が 元の場所に 現れた。' },
    'd2.ice.bellIdle': {
      en: 'The frost bell rings.\nEvery ice block is already in its place.',
      ja: 'こおりの かねが なった。\nこおりの かたまりは みな もとの ばしょに ある。',
      jaKanji: '氷の鐘が 鳴った。\n氷の塊は みな 元の場所に ある。' },
    'd2.ice.bridge': {
      en: 'The block slides into the water\nand freezes into a bridge!',
      ja: 'こおりが みずに すべりこみ、\nこおって はしに なった！',
      jaKanji: '氷が 水に 滑りこみ、\n凍って 橋に なった！' },
    'd2.storm.struck': {
      en: 'Lightning strikes!\nYou are thrown back. -{n} HP',
      ja: 'かみなりが おちた！\nうしろへ はじきとばされた。 HP -{n}',
      jaKanji: '雷が 落ちた！\n後ろへ 弾き飛ばされた。 HP -{n}' },
    'd2.hunter.wakes': {
      en: 'Somewhere in the maze, stone eyes open...',
      ja: 'めいろの どこかで、 いしの めが ひらいた…',
      jaKanji: '迷路の どこかで、石の目が 開いた…' },
    'd2.hunter.caught': {
      en: 'The stone guardian has caught you!',
      ja: 'いしの ばんにんに つかまった！',
      jaKanji: '石の番人に 捕まった！' }
  };
  function pstate() { var gs = window.__GAME_STATE__; return gs && gs.player && gs.player.state; }
  function variant() {
    var q = window.__QOK, p = pstate(), ja = false;
    try { ja = (q && typeof q.loc === 'function') ? q.loc() === 'ja' : !!(p && p.locale === 'ja'); } catch (e) { ja = false; }
    return ja ? ((p && p.kanjiMode) ? 'jaKanji' : 'ja') : 'en';
  }
  function text(key, vars) {
    var row = STR[key]; if (!row) return key;
    var s = row[variant()] || row.en, k;
    if (vars) for (k in vars) s = s.split('{' + k + '}').join(String(vars[k]));
    return s;
  }

  // ---- flags ---------------------------------------------------------------------------------------
  function getFlag(ctx, name) { return ctx.flags()[ctx.flagKey(name)]; }
  function setFlag(ctx, name, v) { var f = ctx.flags(), k = ctx.flagKey(name); if (v === undefined || v === null || v === false) delete f[k]; else f[k] = v; }

  // ---- the tick clock ------------------------------------------------------------------------------
  // ctx.state.clk is milliseconds on this floor, wrapped at the mechanic's period and mirrored into
  // the flag `clk` every frame, so the save always carries the phase she was playing in.
  function tickMs(params) {
    var p = params || {};
    var sec = p.periodSec || p.systemPeriodSec, n = p.periodTicks || p.systemPeriodTicks;
    return (sec && n) ? Math.max(120, Math.min(260, sec * 1000 / n)) : TICK_MS;
  }
  function clock(ctx, dtMs, periodTicks, ms) {
    var S = ctx.state, per = Math.max(1, periodTicks || 1) * ms;
    if (S.clk === undefined) { var v = +getFlag(ctx, 'clk'); S.clk = (v >= 0 && v < per) ? v : 0; }
    if (dtMs > 0) S.clk = (S.clk + Math.min(dtMs, 100)) % per;
    setFlag(ctx, 'clk', Math.round(S.clk));
    return S.clk / ms;                                                       // ticks, fractional
  }

  // ---- the hero ------------------------------------------------------------------------------------
  function soles(ctx) {
    var h = ctx.hero(); if (!h) return null;
    return { x: h.x, y: h.footY, cx: Math.floor(h.x / TILE), cy: Math.floor(h.footY / TILE), dy: h.footY - h.y, dir: h.dir, hx: h.x, hy: h.y };
  }
  // Put her SOLES at a pixel (ctx.place takes the sprite position).
  function placeSoles(ctx, sx, sy, dir) { var h = ctx.hero(); if (!h) return; ctx.place(sx, sy - (h.footY - h.y), dir); try { ctx.scene.updateCamera(); } catch (e) {} }
  // A short trail of sole positions she really stood on (every 6 px), newest last.
  function trail(ctx) {
    var S = ctx.state, s = soles(ctx); if (!s) return S.trail || [];
    var t = S.trail || (S.trail = []), l = t[t.length - 1];
    if (!l || Math.abs(l[0] - s.x) + Math.abs(l[1] - s.y) >= 6) { t.push([s.x, s.y]); if (t.length > 60) t.shift(); }
    return t;
  }
  function trailBack(ctx, px, ok) {                                         // the point about `px` back along her own path that `ok` accepts
    var t = ctx.state.trail || [], i, d = 0, hit = null;
    for (i = t.length - 1; i > 0; i--) {
      d += Math.abs(t[i][0] - t[i - 1][0]) + Math.abs(t[i][1] - t[i - 1][1]);
      if (d >= px && (!ok || ok(t[i - 1][0], t[i - 1][1]))) { hit = t[i - 1]; break; }
    }
    return hit;
  }
  var DIRV = { 0: [0, 1], 1: [-1, 0], 2: [1, 0], 3: [0, -1] };              // heroDir: 0 down, 1 left, 2 right, 3 up

  // ---- small damage ---------------------------------------------------------------------------------
  // The game's own hazard rule (its lava): a tenth of her full HP, never below 1.
  function hurt(ctx, frac, tint) {
    var gs = window.__GAME_STATE__, p = gs && gs.player, st = p && p.state; if (!st) return 0;
    var max = (p.totalMaxHp || st.maxHp || 10), dmg = Math.max(1, Math.floor(max * (frac || 0.1)));
    dmg = Math.min(dmg, Math.max(0, st.hp - 1)); st.hp = Math.max(1, st.hp - dmg);
    var sc = ctx.scene;
    try { sc.updateHUD(); } catch (e) {}
    try { var c = tint || [255, 60, 40]; sc.cameras.main.flash(180, c[0], c[1], c[2]); } catch (e) {}
    return dmg;
  }
  // "-N HP" drifting up from her head; the rule itself is said once per floor in the message box.
  function floatText(ctx, str, colour) {
    var sc = ctx.scene, h = ctx.hero(); if (!h) return;
    try {
      var t = sc.add.text(h.x, h.y - 30, str, { fontFamily: 'sans-serif', fontSize: '15px', fontStyle: 'bold', color: colour || '#ffe9a8', stroke: '#2a1408', strokeThickness: 4 })
        .setOrigin(0.5, 1).setDepth(60);
      sc.tweens.add({ targets: t, y: h.y - 62, alpha: 0, duration: 900, ease: 'Sine.easeOut', onComplete: function () { try { t.destroy(); } catch (e) {} } });
    } catch (e) {}
  }
  function hazard(ctx, key, frac, tint) {                                    // damage + feedback; returns the HP lost
    var n = hurt(ctx, frac, tint);
    if (!getFlag(ctx, 'told.' + key)) { setFlag(ctx, 'told.' + key, true); ctx.say(text(key, { n: n })); }
    else floatText(ctx, text('d2.hp.lost', { n: n }));
    return n;
  }

  // ---- battle ---------------------------------------------------------------------------------------
  // The bundle's own start path (flash, fade, BattleScene, pause), with a monster rolled from the
  // dungeon's own encounter zone; `want` names the one that fits the mechanic when the zone has it.
  var ZONE = { magmaTunnels: 'magma-tunnels', volcanicForge: 'volcanic-forge', demonBarracks: 'demons-threshold', frostfallCavern: 'frostfall-peaks',
    stormreachSpire: 'stormreach-isles', sunkenTempleDungeon: 'sunken-temple', twilightDungeon: 'twilight-realm', voidRift: 'demons-threshold' };
  function monsterFor(ctx, want) {
    var gs = window.__GAME_STATE__, em = gs && gs.encounterManager, zone = ZONE[ctx.id], m = null, i, steps;
    if (!em || !zone || typeof em.forceEncounter !== 'function') return null;
    steps = em.stepsSinceLastEncounter;
    for (i = 0; i < 40; i++) { var r = em.forceEncounter(zone); if (r && (!m || r.id === want)) m = r; if (!want || (m && m.id === want)) break; }
    em.stepsSinceLastEncounter = steps;                                      // the roll is ours: leave the random-encounter counter alone
    return m;
  }
  function battle(ctx, monster) {
    var sc = ctx.scene, m = monster || monsterFor(ctx); if (!m || typeof sc.startBattle !== 'function') return false;
    try { sc.currentEncounterZone = ZONE[ctx.id] || sc.currentEncounterZone; sc.startBattle(m); return true; } catch (e) { return false; }
  }
  function onField(ctx) {
    var sc = ctx.scene;
    return !(sc.isMoving || sc.showingMessage || (sc.scene && sc.scene.isPaused && sc.scene.isPaused()));
  }

  // ---- sprites --------------------------------------------------------------------------------------
  var asked = {};
  function tex(scene, key, url) {                                            // true once the texture is in; asks once
    if (scene.textures.exists(key)) return true;
    if (!asked[key]) { asked[key] = true; var im = new Image();
      im.onload = function () { try { if (!scene.textures.exists(key)) scene.textures.addImage(key, im); } catch (e) {} };
      im.onerror = function () { setTimeout(function () { asked[key] = false; }, 5000); };
      im.src = url; }
    return false;
  }
  function art(scene, name) { return tex(scene, 'd2b_' + name, 'acts-dungeons/modules/b-art/' + name + '.png') ? 'd2b_' + name : null; }
  function monsterTex(scene, m) {                                            // the bundle's own monster picture, loaded at boot or asked for here
    if (!m || !m.spriteKey) return null;
    if (scene.textures.exists(m.spriteKey)) return m.spriteKey;
    return tex(scene, 'd2b_' + m.spriteKey, 'assets/monsters/' + m.spriteKey + '.png') ? 'd2b_' + m.spriteKey : null;
  }
  function canvasTex(scene, key, w, h, draw) {                               // a small painted sprite, made once
    if (scene.textures.exists(key)) return key;
    try { var t = scene.textures.createCanvas(key, w, h); draw(t.getContext(), w, h); t.refresh(); return key; } catch (e) { return null; }
  }
  // In front of her or behind her: an object whose base line is `baseY` (world px).
  function sortDepth(ctx, baseY) { var h = ctx.hero(); return (h && h.footY < baseY) ? 10.5 : 9.5; }

  // ---- the bundle's own mechanics, off ----------------------------------------------------------------
  // The frozen bundle still arms its built-in mechanic for these map ids when the floor loads; on an
  // authored floor that is a second hunter, portals at cells of the generated maze, and a gust
  // message every few seconds. Called from load() and again every tick (the bundle arms after us).
  function quiet(scene) {
    try {
      if (scene.mazeHunterEnabled) { scene.mazeHunterEnabled = false; scene.mazeHunterActive = false;
        if (scene.mazeHunterBossSprite) { try { scene.mazeHunterBossSprite.destroy(); } catch (e) {} scene.mazeHunterBossSprite = undefined; } }
      if (scene.shadowPortalEnabled) { scene.shadowPortalEnabled = false; scene.portalPairs = []; }
      if (scene.windTowerEnabled) { scene.windTowerEnabled = false; scene.windTowerPushing = false; }
    } catch (e) {}
  }

  // ---- geometry -------------------------------------------------------------------------------------
  function inRect(r, x, y) { return x >= r[0] && x < r[2] && y >= r[1] && y < r[3]; }   // r = [x0,y0,x1,y1] px
  function cellRect(x0, y0, x1, y1) { return [x0 * TILE, y0 * TILE, (x1 + 1) * TILE, (y1 + 1) * TILE]; }

  window.__QOK_D2KIT_B__ = { TILE: TILE, TICK_MS: TICK_MS, STR: STR, text: text, variant: variant, getFlag: getFlag, setFlag: setFlag,
    tickMs: tickMs, clock: clock, soles: soles, placeSoles: placeSoles, trail: trail, trailBack: trailBack, DIRV: DIRV,
    hurt: hurt, floatText: floatText, hazard: hazard, ZONE: ZONE, monsterFor: monsterFor, battle: battle, onField: onField,
    tex: tex, art: art, monsterTex: monsterTex, canvasTex: canvasTex, sortDepth: sortDepth, quiet: quiet, inRect: inRect, cellRect: cellRect };
})();
