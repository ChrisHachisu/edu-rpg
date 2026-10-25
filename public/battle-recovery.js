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
