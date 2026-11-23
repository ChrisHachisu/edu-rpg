/*
 * Battle recovery override.
 *
 * The shipped bundle autosaves after a boss defeat has reduced HP to zero.
 * Retry then loads that dead record.  This additive hook keeps the last live
 * auto-save as the retry checkpoint and carries forward only encounter/warp
 * flags produced by the failed encounter.  It deliberately does not touch
 * victory flags, manual saves, or scene transitions.
 */
(function installBattleRecovery(global) {
  'use strict';

  var INSTALL_KEY = '__BATTLE_RECOVERY__';
  var AUTO_KEY = 'edu-rpg-autosave';
  var POLL_MS = 50;
  var MAX_POLLS = 200;

  function clone(value) {
    if (value == null) return value;
    try { return JSON.parse(JSON.stringify(value)); } catch (_) { return null; }
  }

  function storage() {
    try { return global.localStorage; } catch (_) { return null; }
  }

  function readRecord(key) {
    var s = storage();
    if (!s) return null;
    try {
      var raw = s.getItem(key);
      if (!raw) return null;
      var data = JSON.parse(raw);
      if (!data || !data.player) return null;
      return data;
    } catch (_) { return null; }
  }

  function isLivingRecord(record) {
    var player = record && record.player;
    return !!(player && Number.isFinite(Number(player.hp)) && Number(player.hp) > 0);
  }

  function isLivingRuntime(gameState) {
    var player = gameState && gameState.player;
    var state = player && player.state;
    return !!(state && Number.isFinite(Number(state.hp)) && Number(state.hp) > 0
      && player.isAlive !== false);
  }

  function recoveryFlags(current, checkpoint) {
    var merged = Object.assign({}, checkpoint || {});
    var flags = current || {};
    Object.keys(flags).forEach(function (key) {
      if ((/^boss\.[^.]+\.encountered$/).test(key) || (/^warp\.[^.]+\.boss$/).test(key)) {
        if (flags[key]) merged[key] = true;
      }
    });
    return merged;
  }

  function writeRecord(record, key) {
    var s = storage();
    if (!s || !record) return false;
    try { s.setItem(key, JSON.stringify(record)); return true; } catch (_) { return false; }
  }

  function install(gameState) {
    // The frozen GameState exists on the title screen before loadGame/newGame
    // creates a player. Its methods can be wrapped safely at that point.
    if (!gameState || gameState[INSTALL_KEY]) return false;
    var originalAutoSave = typeof gameState.autoSave === 'function' ? gameState.autoSave : null;
    var originalLoadAutoSave = typeof gameState.loadAutoSave === 'function' ? gameState.loadAutoSave : null;
    var originalLoadGame = typeof gameState.loadGame === 'function' ? gameState.loadGame : null;
    if (!originalAutoSave || !originalLoadAutoSave) return false;

    var autoKey = AUTO_KEY;
    var recoveryFallbackPending = false;
    var diagnostics = { installed: true, liveCheckpoint: !!isLivingRecord(readRecord(autoKey)), lastAction: null };

    gameState.autoSave = function battleRecoveryAutoSave() {
      if (isLivingRuntime(gameState)) {
        var result = originalAutoSave.apply(gameState, arguments);
        var saved = readRecord(autoKey);
        diagnostics.lastAction = 'live-delegated';
        diagnostics.liveCheckpoint = !!isLivingRecord(saved);
        return result;
      }

      // Read the current persisted checkpoint each time.  An in-memory copy
      // could belong to a prior load/new-game session.
      var checkpoint = readRecord(autoKey);
      if (!isLivingRecord(checkpoint)) {
        // Preserve the raw storage and expose a marker.  No HP is made up and
        // the dead original autoSave is never allowed to overwrite a record.
        diagnostics.lastAction = 'dead-no-checkpoint';
        diagnostics.recoveryFailure = 'no-living-checkpoint';
        return undefined;
      }

      var merged = clone(checkpoint);
      var currentState = gameState.player && gameState.player.state;
      merged.player.storyFlags = recoveryFlags(currentState && currentState.storyFlags, merged.player.storyFlags);
      merged.timestamp = Date.now();
      // Retain checkpoint player data, playtime, quiz stats, inventory, and position.
      // Only the encounter/warp flags above are copied from the dead runtime.
      if (!writeRecord(merged, autoKey)) {
        diagnostics.lastAction = 'dead-write-failed';
        diagnostics.recoveryFailure = 'storage-write-failed';
        return undefined;
      }
      recoveryFallbackPending = false;
      diagnostics.lastAction = 'dead-preserved-live';
      diagnostics.liveCheckpoint = true;
      return undefined;
    };

    gameState.loadAutoSave = function battleRecoveryLoadAutoSave() {
      var raw = readRecord(autoKey);
      if (!raw || !isLivingRecord(raw)) {
        // Let GameOverScene's existing retry branch try the manual save next.
        // Raw saves remain untouched; this only prevents a dead or missing
        // record from being treated as a successful recovery.
        recoveryFallbackPending = true;
        diagnostics.lastAction = raw ? 'dead-autosave-rejected' : 'autosave-missing';
        diagnostics.recoveryFailure = raw ? 'dead-autosave' : 'autosave-missing';
        return false;
      }
      var result = originalLoadAutoSave.apply(gameState, arguments);
      if (!result || !isLivingRuntime(gameState)) {
        recoveryFallbackPending = true;
        diagnostics.lastAction = 'autosave-load-failed';
        diagnostics.recoveryFailure = 'invalid-autosave';
        return false;
      }
      recoveryFallbackPending = false;
      return result;
    };

    if (originalLoadGame) {
      gameState.loadGame = function battleRecoveryLoadGame() {
        var result = originalLoadGame.apply(gameState, arguments);
        if (recoveryFallbackPending && result && !isLivingRuntime(gameState)) {
          diagnostics.lastAction = 'dead-manual-save-rejected';
          diagnostics.recoveryFailure = 'no-living-fallback';
          return false;
        }
        if (result && isLivingRuntime(gameState)) recoveryFallbackPending = false;
        return result;
      };
    }

    gameState[INSTALL_KEY] = diagnostics;
    global.__BATTLE_RECOVERY__ = diagnostics;
    return true;
  }

  function poll() {
    var gameState = global.__GAME_STATE__;
    if (gameState && (gameState[INSTALL_KEY] || install(gameState))) return;
    if (poll.count++ < MAX_POLLS) global.setTimeout(poll, POLL_MS);
  }
  // The frozen module is deferred by the static shell, so it finishes before
  // DOMContentLoaded even when downloading it takes longer than the fast poll.
  // This one-shot retry also handles an override loaded after that event.
  function onDocumentReady() {
    var gameState = global.__GAME_STATE__;
    if (gameState && !gameState[INSTALL_KEY]) install(gameState);
  }
  if (global.document) {
    if (global.document.readyState !== 'complete')
      global.document.addEventListener('DOMContentLoaded', onDocumentReady, { once: true });
  }
  onDocumentReady();
  poll.count = 0;
  poll();
})(typeof window !== 'undefined' ? window : globalThis);

/*
 * Sword Wraith hunter fights must not count as the boss kill (2026-11-10).
 *
 * BattleScene.showVictory sets `boss.<id>.defeated` for every monster with the
 * boss AI pattern.  The Sunken Temple's Sword Wraith also hunts the player on
 * the floors BEFORE the last one (triggerMazeHunterBattle, non-final branch),
 * and winning one of those set `boss.swordWraith.defeated`.  The next floor
 * read that flag, never spawned the Wraith again, the final fight never ran,
 * Excalibur was never granted and the Demon Castle seal could never open: a
 * permanent soft-lock found by the round 1 playthrough census.
 *
 * Only the final-floor fight sets WorldMapScene.pendingBossId, and that is the
 * fight whose return grants Excalibur, so that is the test: a Sword Wraith win
 * without it is a hunter win and leaves the story flag as it was.
 */
(function installHunterVictoryFix(global) {
  'use strict';
  var tries = 0;
  function install() {
    var g = global.__PHASER_GAME__, b = null;
    try { b = g && g.scene && g.scene.getScene('BattleScene'); } catch (_) { b = null; }
    var proto = b && Object.getPrototypeOf(b);
    if (!proto || typeof proto.showVictory !== 'function') {
      if (++tries < 400) global.setTimeout(install, 50);
      return;
    }
    if (proto.showVictory.__hunterFix) return;
    var orig = proto.showVictory;
    var patched = function () {
      var id = this.monster && this.monster.id, flags = null, key = 'boss.' + id + '.defeated', had = true, hunter = false;
      try {
        flags = global.__GAME_STATE__.player.state.storyFlags;
        had = !!flags[key];
        var w = global.__PHASER_GAME__.scene.getScene('WorldMapScene');
        hunter = id === 'swordWraith' && !!w && w.pendingBossId !== 'swordWraith';
      } catch (_) { hunter = false; }
      var result = orig.apply(this, arguments);
      if (hunter && !had && flags) { try { delete flags[key]; } catch (_) {} }
      return result;
    };
    patched.__hunterFix = true;
    proto.showVictory = patched;
    /*
     * And the final-floor fight could never START.  The hunter's update calls
     * triggerMazeHunterBattle on every tick it is next to the hero, and the
     * final-floor branch answers with showDialogSequence each time -- which
     * resets the three-line dialog to line one and restamps msgShownAt, so
     * advanceDialog's 300 ms guard refuses every tap.  Measured 2026-11-10 on
     * floor 6: dialogQueue stuck at 2 under taps, clicks and every confirm key.
     * One trigger per encounter: ignore re-triggers while its own message or
     * dialog is still up, or while a hunter battle is already pending.
     */
    try {
      var w0 = global.__PHASER_GAME__.scene.getScene('WorldMapScene'), wp = w0 && Object.getPrototypeOf(w0);
      if (wp && typeof wp.triggerMazeHunterBattle === 'function' && !wp.triggerMazeHunterBattle.__hunterFix) {
        var trig = wp.triggerMazeHunterBattle;
        var guarded = function () {
          if (this.showingMessage || this._pendingMazeHunterBattle || this.dialogCallback) return;
          return trig.apply(this, arguments);
        };
        guarded.__hunterFix = true;
        wp.triggerMazeHunterBattle = guarded;
      }
    } catch (_) {}
  }
  if (global.setTimeout) install();
})(typeof window !== 'undefined' ? window : globalThis);

/*
 * Holy Amulet for a save that already emptied its chest (2026-11-23).
 *
 * The Sword Wraith turns 90% of every blow back on a hero without the Holy
 * Amulet, and the amulet comes from one golden chest in the Sunken Temple.
 * On the authored floor that chest gave ordinary loot until dq-tiles.js named
 * it to the engine (goldenChestPos).  A save that opened it before then holds
 * the chest's "opened" flag and no amulet, and the chest says "empty" for good.
 *
 * Repair, on the floor itself: the golden chest is recorded as opened, the
 * Wraith still stands and she carries no amulet -> the amulet goes into her
 * bag with the engine's own line for finding it.  The engine clears
 * goldenChestPos when it hands the amulet over itself, so a chest opened after
 * the fix never gets here.
 */
(function installAmuletRepair(global) {
  'use strict';
  function tick() {
    try {
      var g = global.__PHASER_GAME__, gs = global.__GAME_STATE__, pl = gs && gs.player, st = pl && pl.state;
      var w = g && g.scene && g.scene.getScene('WorldMapScene');
      if (!w || !st || !st.storyFlags || w.currentMapId !== 'sunkenTempleDungeon' || !g.scene.isActive('WorldMapScene')) return;
      var c = w.goldenChestPos;
      if (!c || w.showingMessage || st.storyFlags['boss.swordWraith.defeated'] || pl.hasItem('holyAmulet')) return;
      if (!st.storyFlags['chest.sunkenTempleDungeon.f' + (w.currentFloor || 1) + '.' + c.x + '.' + c.y]) return;
      if (!pl.addItem('holyAmulet', 1)) return;
      global.__AMULET_REPAIR__ = (global.__AMULET_REPAIR__ || 0) + 1;
      var z = global.__QOK && global.__QOK.Z, t = z ? z('dungeon.sunkenTempleDungeon.amuletFound') : null;
      if (t && t.charAt(0) !== '[' && typeof w.showMessage === 'function') w.showMessage(t);
    } catch (_) {}
  }
  if (global.setInterval) global.setInterval(tick, 500);
})(typeof window !== 'undefined' ? window : globalThis);

// ==== QOK balance + bag (autoloop 2026-11-23) ====
/*
 * Two things, measured by scripts/auto/honest (report: autoloop/honest/REPORT.md, REPORT-after.md)
 * and guarded by scripts/auto/checks/bag.cjs and scripts/auto/checks/balance.cjs.
 *
 * 1. BAG (a bug fix, always on).  Player.addItem refused a 21st stack and every giver ignored the
 *    refusal: boss rewards, quest rewards and chest items vanished, the Flame Cloak with them
 *    (Magma Tunnels then never opens).  Now:
 *      - key items and gear no shop sells (boss and quest rewards) never take one of the 20 slots
 *        and are never refused; a quest reward is never refused either;
 *      - a chest whose item will not fit stays shut and says the bag is full (the shop's own line);
 *      - taking gear off with a full bag is refused with the same line instead of deleting it;
 *      - putting gear on can never delete the piece it replaces (legendary auto-equip included);
 *      - a save that already lost a story item to this gets it back on load.
 *
 * 2. BALANCE (tuning, one table, switchable).  localStorage['qok-balance'] = '0' restores the
 *    shipped numbers, zones included.  Every value below is "shipped -> tuned" in the comment.
 *    Fields: hp/atk/def = the boss's base numbers (before the grade scale the engine applies:
 *    x0.85 grades K-2, x1.3 grades 5-6); regen/poison = fraction per turn; rage/charge = attack
 *    multipliers; chargeEvery = turns between charges; grade[g].scale = extra factor on
 *    hp/atk/def for that grade setting only.
 */
(function installBalanceAndBag(global) {
  'use strict';
  var CAP = 20;
  var BALANCE = {
    version: '2026-11-23d',
    bosses: {
      // regen 0.07 -> 0.03; grades 5-6: hp/atk/def x0.77 (cancels the x1.3 grade scale for the first boss only)
      mosswarden:         { regen: 0.03, grade: { '5': { scale: 0.77 }, '6': { scale: 0.77 } } },
      magmaBeetleKing:    { charge: 1.5 },    // charge 1.8 -> 1.5
      flameTitan:         { charge: 1.35 },   // charge 1.8 -> 1.35
      warGeneralMalachar: { charge: 1.3 },    // charge 2 -> 1.3
      nullDevourer:       { rage: 1.5 },      // rage 1.8 -> 1.5
      stormSentinel:      { charge: 1.4 },    // charge 2 -> 1.4
      frostMonarch:       { regen: 0.03 },    // regen 0.06 -> 0.03
      swordWraith:        { charge: 1.5 },    // charge 2 -> 1.5
      celestialGuardian:  { regen: 0.03 },    // regen 0.06 -> 0.03
      // hp 1875 -> 1500 (1400 grades 5-6); regen 0.03 -> 0.01;
      // rage 1.6 -> 1.5 (1.6 kept grades K-2, 1.3 grades 5-6); charge 2 -> 1.6 (1.35 grades 5-6)
      demonKing:          { hp: 1500, regen: 0.01, rage: 1.5, charge: 1.6, grade: {
        'k': { rage: 1.6 }, '1': { rage: 1.6 }, '2': { rage: 1.6 },
        '5': { hp: 1400, rage: 1.3, charge: 1.35 }, '6': { hp: 1400, rage: 1.3, charge: 1.35 } } }
    },
    // Ten dungeons roll a neighbour's monster table although the zone table holds one written for them.
    dungeonZones: {
      whisperingWoodsCave: { from: 'whispering-woods', to: 'whispering-woods-cave' },
      coastalReef:         { from: 'crystal-coast',    to: 'coastal-reef' },
      ironMine:            { from: 'iron-mountains',   to: 'iron-mine' },
      hauntedForest:       { from: 'whispering-woods', to: 'haunted-forest' },
      oasisDepths:         { from: 'scorched-wastes',  to: 'oasis-depths' },
      scorchedRuins:       { from: 'scorched-wastes',  to: 'scorched-ruins' },
      emberMines:          { from: 'magma-tunnels',    to: 'ember-mines' },
      obsidianCavern:      { from: 'volcanic-forge',   to: 'obsidian-cavern' },
      demonBarracks:       { from: 'demons-threshold', to: 'demon-barracks' },
      voidRift:            { from: 'demons-threshold', to: 'void-rift' }
    },
    // The bundle's "Greenhollow Plains" rectangle (x < 70, y > 330) is where Greenhollow stood on the
    // old map.  The town now stands at (69,255), inside "Whispering Woods": wolves at her door.
    // The plains now also cover the town and the road south to Millbrook.
    starterPlains: { from: 'whispering-woods', to: 'greenhollow-plains', xMax: 85, yMin: 240, yMax: 330 }
  };

  function on() { try { return global.localStorage.getItem('qok-balance') !== '0'; } catch (_) { return true; } }
  function GS() { return global.__GAME_STATE__; }
  function scene(k) { try { return global.__PHASER_GAME__.scene.getScene(k); } catch (_) { return null; } }
  function active(k) { try { return global.__PHASER_GAME__.scene.isActive(k); } catch (_) { return false; } }
  function Z(k, p) { var q = global.__QOK; try { return q && q.Z ? q.Z(k, p) : k; } catch (_) { return k; } }
  function DB() { var q = global.__QOK; return (q && q.db) || {}; }

  // ---------------------------------------------------------------- balance
  function tuned(m, grade) {
    var t = on() && m && BALANCE.bosses[m.id];
    if (!t) return m;
    var g = (t.grade && t.grade[String(grade)]) || {}, c = Object.assign({}, m);
    function pick(k) { return g[k] != null ? g[k] : t[k]; }
    if (pick('hp') != null) c.baseHp = pick('hp');
    if (pick('atk') != null) c.baseAtk = pick('atk');
    if (pick('def') != null) c.baseDef = pick('def');
    if (g.scale != null) {
      c.baseHp = Math.max(1, Math.round(c.baseHp * g.scale));
      c.baseAtk = Math.max(1, Math.round(c.baseAtk * g.scale));
      c.baseDef = Math.max(0, Math.round(c.baseDef * g.scale));
    }
    if (m.bossAbilities) c.bossAbilities = m.bossAbilities.map(function (a) {
      var b = Object.assign({}, a);
      if (a.type === 'regen' && pick('regen') != null) b.healFraction = pick('regen');
      if (a.type === 'poison' && pick('poison') != null) b.poisonFraction = pick('poison');
      if (a.type === 'rage') {
        if (pick('rage') != null) b.atkMultiplier = pick('rage');
        if (pick('rageAt') != null) b.hpThreshold = pick('rageAt');
      }
      if (a.type === 'charge') {
        if (pick('charge') != null) b.chargeMultiplier = pick('charge');
        if (pick('chargeEvery') != null) b.chargeInterval = pick('chargeEvery');
      }
      return b;
    });
    return c;
  }
  function zoneFor(mapId, zone) {
    var f = on() && BALANCE.dungeonZones[mapId];
    return f && zone === f.from ? f.to : zone;
  }
  function starterZone(x, y, zone) {
    var s = BALANCE.starterPlains;
    return on() && zone === s.from && x < s.xMax && y > s.yMin && y <= s.yMax ? s.to : zone;
  }

  // ---------------------------------------------------------------- bag
  var force = 0;
  function isProtected(id) { var d = DB()[id]; return !d || d.type === 'key' || !d.buyPrice; }
  function ordinaryStacks(inv) { var n = 0; for (var i = 0; i < inv.length; i++) if (!isProtected(inv[i].itemId)) n++; return n; }
  function stackOf(inv, id) { for (var i = 0; i < inv.length; i++) if (inv[i].itemId === id) return inv[i]; return null; }
  function canAdd(id) {
    var p = GS() && GS().player, inv = p && p.state && p.state.inventory;
    if (!inv) return false;
    return !!stackOf(inv, id) || isProtected(id) || ordinaryStacks(inv) < CAP;
  }
  function sayFull() {
    var text = Z('shop.inventoryFull');
    try {
      var ms = scene('MenuScene');
      if (ms && active('MenuScene') && typeof ms.showItemMessage === 'function') { ms.showItemMessage(text); return; }
      var w = scene('WorldMapScene');
      if (w && typeof w.showMessage === 'function') w.showMessage(text);
    } catch (_) {}
  }

  function patchPlayer(p) {
    var pp = p && Object.getPrototypeOf(p);
    if (!pp || pp.__qokBag || typeof pp.addItem !== 'function') return !!(pp && pp.__qokBag);
    var oEquip = pp.equip, oUnequip = pp.unequip;
    pp.addItem = function (id, n) {
      var inv = this.state.inventory, e = stackOf(inv, id);
      if (e) { e.quantity += n; return true; }
      if (!force && !isProtected(id) && ordinaryStacks(inv) >= CAP) return false;
      inv.push({ itemId: id, quantity: n });
      return true;
    };
    pp.equip = function () { force++; try { return oEquip.apply(this, arguments); } finally { force--; } };
    pp.unequip = function (slot) {
      var id = this.state.equipment && this.state.equipment[slot], d = id && DB()[id];
      if (id && !(d && d.unsellable) && !canAdd(id)) { sayFull(); return null; }
      return oUnequip.apply(this, arguments);
    };
    pp.__qokBag = true;
    return true;
  }

  function chestFlagSet(w, x, y) {
    var f = GS().player.state.storyFlags || {}, m = w.currentMapId;
    return !!(f['chest.' + m + '.f' + w.currentFloor + '.' + x + '.' + y] || f['chest.' + m + '.' + x + '.' + y]);
  }
  function patchWorld(w) {
    var wp = w && Object.getPrototypeOf(w);
    if (!wp || wp.__qokBag || typeof wp.tryOpenTreasure !== 'function') return !!(wp && wp.__qokBag);
    var oOpen = wp.tryOpenTreasure, oLoot = wp.getTreasureReward, oQuest = wp.applyQuestRewards;
    wp.getTreasureReward = function () {
      if (this.__qokChestLoot) { var r = this.__qokChestLoot; this.__qokChestLoot = null; return r; }
      return oLoot.apply(this, arguments);
    };
    wp.tryOpenTreasure = function (x, y) {
      var plain = false;
      try {
        var md = this.mapData, k = x + ',' + y;
        plain = !!md && y >= 0 && y < md.length && x >= 0 && x < md[0].length && md[y][x] === 4
          && this.currentMapId !== 'overworld' && !chestFlagSet(this, x, y)
          && !(this.mimicChestPositions && this.mimicChestPositions.has(k))
          && !(this.keyChestPositions && this.keyChestPositions.has(k))
          && !(this.goldenChestPos && this.goldenChestPos.x === x && this.goldenChestPos.y === y);
        if (plain) {
          // roll the chest once, before it opens: loot that will not fit leaves it shut
          var loot = oLoot.call(this);
          if (loot && loot.itemId && !canAdd(loot.itemId)) { this.showMessage(Z('shop.inventoryFull')); return true; }
          this.__qokChestLoot = loot;
        }
      } catch (_) { plain = false; this.__qokChestLoot = null; }
      // special chests (key, golden, mimic) hand out what the story needs: never refused
      if (!plain) force++;
      try { return oOpen.apply(this, arguments); } finally { if (!plain) force--; this.__qokChestLoot = null; }
    };
    if (typeof oQuest === 'function') wp.applyQuestRewards = function () {
      force++; try { return oQuest.apply(this, arguments); } finally { force--; }
    };
    wp.__qokBag = true;
    return true;
  }

  // A save that lost a story item to the full bag: the boss is beaten (it will not fight again),
  // the gate it opens is still shut and the item is nowhere.  Checked once after each load.
  var repairPending = true, repairSay = [];
  function repairSave(p) {
    var st = p.state, f = st.storyFlags || {}, got = [];
    function owns(id, slot) { return p.hasItem(id) || (slot && st.equipment && st.equipment[slot] === id); }
    function give(id, n) { force++; try { if (p.addItem(id, n || 1)) got.push(id); } finally { force--; } }
    if (f['boss.sandGolem.defeated'] && !f['boss.lavaWyrm.defeated'] && !owns('flameCloak')) give('flameCloak');
    if (f['boss.stormHarpy.defeated'] && !f['canyon.windCleared'] && !owns('windbreakerStone')) give('windbreakerStone');
    var legend = { swordWraith: ['excalibur', 'weapon'], celestialGuardian: ['aegisOfDawn', 'armor'], stormSentinel: ['galeShield', 'shield'], frostMonarch: ['crownOfWisdom', 'helmet'] };
    Object.keys(legend).forEach(function (b) { if (f['boss.' + b + '.defeated'] && !owns(legend[b][0], legend[b][1])) give(legend[b][0]); });
    if (!f['boss.demonKing.defeated'] && !owns('crystalOfKnowledge')) {
      var shards = ['serpent', 'stormHarpy', 'dragon', 'sandGolem', 'flameTitan'].filter(function (b) { return f['boss.' + b + '.defeated']; }).length;
      var have = p.getItemCount('shadowCrystal');
      if (shards > have) give('shadowCrystal', shards - have);
    }
    return got;
  }
  function wrapLoads(gs) {
    if (gs.__qokBagLoads) return;
    ['loadGame', 'loadAutoSave', 'newGame'].forEach(function (k) {
      var o = gs[k];
      if (typeof o !== 'function') return;
      gs[k] = function () { var r = o.apply(this, arguments); repairPending = true; return r; };
    });
    gs.__qokBagLoads = true;
  }

  // ---------------------------------------------------------------- install
  var done = { player: false, world: false, battle: false, zone: false, steps: false };
  function tick() {
    try {
      var gs = GS();
      if (!gs) return;
      wrapLoads(gs);
      if (!done.player && gs.player) done.player = patchPlayer(gs.player);
      var w = scene('WorldMapScene'), b = scene('BattleScene');
      if (!done.world && w) done.world = patchWorld(w);
      if (!done.battle && b) {
        var bp = Object.getPrototypeOf(b);
        if (bp && typeof bp.init === 'function') {
          if (!bp.init.__qokBalance) {
            var oInit = bp.init;
            bp.init = function (data) {
              try {
                if (data && data.monster) {
                  var m = tuned(data.monster, GS().player.state.quizDifficulty);
                  if (m !== data.monster) data = Object.assign({}, data, { monster: m });
                }
              } catch (_) {}
              return oInit.call(this, data);
            };
            bp.init.__qokBalance = true;
          }
          done.battle = true;
        }
      }
      if (!done.steps && gs.encounterManager) {
        var ep = Object.getPrototypeOf(gs.encounterManager);
        if (ep && typeof ep.onStep === 'function') {
          if (!ep.onStep.__qokBalance) {
            var oStep = ep.onStep;
            ep.onStep = function (zone) {
              try { var s = scene('WorldMapScene'); if (s && s.currentMapId) zone = zoneFor(s.currentMapId, zone); } catch (_) {}
              return oStep.call(this, zone);
            };
            ep.onStep.__qokBalance = true;
          }
          done.steps = true;
        }
      }
      if (!done.zone && typeof gs.getOverworldZone === 'function') {
        var oZone = gs.getOverworldZone;
        gs.getOverworldZone = function (x, y) { return starterZone(x, y, oZone.apply(this, arguments)); };
        done.zone = true;
      }
      if (gs.player && gs.player.state && w && active('WorldMapScene') && !active('BattleScene')) {
        if (repairPending && done.player) { repairPending = false; repairSay = repairSay.concat(repairSave(gs.player)); }
        if (repairSay.length && !w.showingMessage && !w.dialogCallback && typeof w.showMessage === 'function') {
          var id = repairSay.shift(), d = DB()[id];
          if (d && d.nameKey) w.showMessage(Z('treasure.foundItem', { item: Z(d.nameKey) }));
        }
      }
    } catch (e) { api.lastError = String(e && e.message || e); }
  }
  var api = global.__QOK_BALANCE__ = { on: on, table: BALANCE, tuned: tuned, zoneFor: zoneFor, starterZone: starterZone, canAdd: canAdd, isProtected: isProtected, cap: CAP, installed: done, lastError: null };
  function loop() {
    tick();
    global.setTimeout(loop, done.player && done.world && done.battle && done.zone && done.steps ? 500 : 50);
  }
  if (global.setTimeout) loop();
})(typeof window !== 'undefined' ? window : globalThis);
// ==== end QOK balance + bag (autoloop 2026-11-23) ====
