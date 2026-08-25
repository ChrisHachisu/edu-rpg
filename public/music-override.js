// public/music-override.js — REFERENCE IMPLEMENTATION, not yet installed.
//
// Replaces the procedural Tone.js BGM with the orchestral .m4a loops, as an ADDITIVE
// override (AGENTS.md rule 4) rather than logic frozen into the preserved bundle.
//
// PREREQUISITE: one line added to the bundle's existing `window.__QOK = {...}` literal,
// alongside the setVolume hook that is already there:
//
//     audio: typeof Jt !== "undefined" ? Jt : null
//
// That is the entire bundle change. It follows the surrounding object literal's own
// `typeof X !== "undefined"` convention, adds 54 bytes, and cannot affect gameplay: if it
// ever fails, __QOK.audio is null, this file no-ops, and the game keeps its chiptune.
//
// WHY THIS SEAM: AudioManager only ever touches four members of its composer
// (.currentBgm .play .stop .setVolume), so swapping the object is the designed extension
// point. The orphaned Tone composer is never started, so there is no chiptune underneath.
//
// VERIFIED 2026-08-17 against the real bundle call path on a scratch copy of dist:
//   playBgm routes here · track switching works · muted reads 0 energy · volume monotonic
//   (10% -> 1.9, 70% -> 8.4) · stop reads 0 · zero load failures.

(function () {
  'use strict';

  var LOOP_SECONDS = {
    title: 30, town: 30, overworld: 30, dungeon: 30, battle: 30,
    bossBattle: 30, finalBoss: 30, victory: 12, gameOver: 15
  };

  // AAC carries encoder priming samples. Left in place they are replayed on every wrap and
  // the loop clicks, however clean the crossfade is. Drop them and take exactly the
  // intended length. Do NOT switch this to <audio loop>; that is the bug this avoids.
  var PRIMING = 1024;

  var MAX_TRIES = 6;          // bounded, linear back-off, matching dq-tiles' a1aLd pattern
  var RETRY_BASE_MS = 400;

  function FilePlayer(am) {
    this.am = am;
    this.ctx = am.ctx;
    this.cur = null;
    this.src = null;
    this.buffers = {};
    this.inflight = {};
    // Music gets its own gain, deliberately NOT routed through am.masterGain. That mirrors
    // the Tone composer it replaces (Tone had its own master Volume), and it avoids the
    // double attenuation you would get from passing through masterGain while setVolume is
    // also applied here. Mute still works because AudioManager.setMuted calls stopBgm().
    this.out = this.ctx.createGain();
    this.out.gain.value = 1;
    this.out.connect(this.ctx.destination);

    // Failure bookkeeping, surfaced for proof. A silent catch in an audio loader produces
    // exactly the class of bug the "blue map" loaders had, except silence is harder to
    // notice than a blue screen.
    this.failed = {};
    this.tries = {};
  }

  Object.defineProperty(FilePlayer.prototype, 'currentBgm', {
    get: function () { return this.cur; }
  });

  // FETCH DOES NOT WORK ON CAPACITOR'S CUSTOM SCHEME, AND THAT IS WHAT BROKE BUILD 61.
  //
  // In the packaged app the document is `capacitor://localhost/index.html`, and
  // `fetch('audio/title.m4a')` there resolves, connects to nothing, and settles as
  // `ok=false status=0` -- measured in the iOS Simulator, six identical retries then PLAY-FAILED.
  // status 0 is not an HTTP status; it is "the request never happened". It is NOT visible in a
  // browser, where the same code over http:// works perfectly, which is exactly why this shipped.
  //
  // XMLHttpRequest DOES read app-bundle resources over the custom scheme, so it is the primary
  // path and fetch is kept only as a fallback for a plain-http context (the dev server, the
  // browser harness). `cache: 'force-cache'` is gone: on a custom scheme there is no HTTP cache
  // for it to consult and it can only add a failure mode.
  function loadBytes(url) {
    return new Promise(function (resolve, reject) {
      var xhr = new XMLHttpRequest();
      xhr.open('GET', url, true);
      xhr.responseType = 'arraybuffer';
      xhr.onload = function () {
        // A custom-scheme XHR reports status 0 on SUCCESS as well, so the payload is the test.
        if (xhr.response && xhr.response.byteLength > 0) resolve(xhr.response);
        else reject(new Error('empty response (status ' + xhr.status + ')'));
      };
      xhr.onerror = function () { reject(new Error('xhr error (status ' + xhr.status + ')')); };
      xhr.send();
    }).catch(function (e) {
      if (typeof fetch !== 'function') throw e;
      return fetch(url).then(function (r) {
        if (!r.ok) throw new Error('http ' + r.status);
        return r.arrayBuffer();
      });
    });
  }

  FilePlayer.prototype._decode = function (track) {
    var self = this;
    return loadBytes('audio/' + track + '.m4a')
      .then(function (ab) { return self.ctx.decodeAudioData(ab); })
      .then(function (raw) {
        var want = Math.round(LOOP_SECONDS[track] * raw.sampleRate);
        var n = Math.min(want, raw.length - PRIMING);
        if (!(n > 0)) throw new Error('decoded too short');
        var buf = self.ctx.createBuffer(raw.numberOfChannels, n, raw.sampleRate);
        for (var c = 0; c < raw.numberOfChannels; c++) {
          buf.copyToChannel(raw.getChannelData(c).subarray(PRIMING, PRIMING + n), c);
        }
        return buf;
      });
  };

  // Lazy: decode on first use, never all nine at init. Nine decoded 44.1k stereo buffers is
  // roughly 40MB of PCM, and this app has iPhone 13 memory-pressure history.
  FilePlayer.prototype._load = function (track) {
    var self = this;
    if (this.buffers[track]) return Promise.resolve(this.buffers[track]);
    if (this.inflight[track]) return this.inflight[track];

    var attempt = function (n) {
      self.tries[track] = n;
      return self._decode(track).then(function (buf) {
        self.buffers[track] = buf;
        delete self.inflight[track];
        delete self.failed[track];
        return buf;
      }, function (err) {
        if (n >= MAX_TRIES) {
          self.failed[track] = { tries: n, error: String(err && err.message || err) };
          delete self.inflight[track];
          console.warn('[music] gave up on', track, 'after', n, 'tries:', err);
          throw err;
        }
        return new Promise(function (res) { setTimeout(res, RETRY_BASE_MS * n); })
          .then(function () { return attempt(n + 1); });
      });
    };

    this.inflight[track] = attempt(1);
    return this.inflight[track];
  };

  FilePlayer.prototype.play = function (track) {
    var self = this;
    if (!LOOP_SECONDS.hasOwnProperty(track)) return;
    if (this.cur === track) return;
    this.stop();
    this.cur = track;
    this._load(track).then(function (buf) {
      if (self.cur !== track) return;              // a newer play() won the race
      var s = self.ctx.createBufferSource();
      s.buffer = buf;
      s.loop = true;
      s.connect(self.out);
      s.start();
      self.src = s;
    }, function () {
      if (self.cur === track) self.cur = null;     // let a later call retry this track
    });
  };

  FilePlayer.prototype.stop = function () {
    if (this.src) {
      try { this.src.stop(); } catch (e) { /* already stopped */ }
      try { this.src.disconnect(); } catch (e) { /* ignore */ }
      this.src = null;
    }
    this.cur = null;
  };

  // AudioManager hands us dB in roughly -30..0, or -Infinity for silence.
  FilePlayer.prototype.setVolume = function (db) {
    this.out.gain.value = (db === -Infinity || !isFinite(db)) ? 0 : Math.pow(10, db / 20);
  };

  // ---- install: wrap init() so we swap the composer the moment it exists ----------------

  // The one swap, factored out so BOTH entry points below use identical logic.
  // SWAP ONLY AFTER PROVING WE CAN ACTUALLY PLAY. FAIL SAFE, NOT SILENT.
  //
  // Build 61's real damage was not that the .m4a failed to load -- it was that the override had
  // ALREADY thrown the working chiptune away by then, so the failure mode was total silence,
  // strictly worse than the music it replaced. An override that cannot do its job must leave the
  // thing it is replacing alone. So: decode one track FIRST, and only take over if that succeeds.
  function swapWhenProven(am) {
    if (!am || !am.composer || am.composer instanceof FilePlayer) return;
    if (!am.ctx) return;
    if (am.__musicSwapPending) return;
    am.__musicSwapPending = true;
    var probe = new FilePlayer(am);
    probe._load('title').then(function () {
      am.__musicSwapPending = false;
      swap(am, probe);
    }, function (e) {
      // Leave the existing composer running. The game keeps its original music and the player
      // hears SOMETHING, which is the whole point of failing safe.
      am.__musicSwapPending = false;
      try { console.warn('[music-override] staying on the built-in composer:', e && e.message); } catch (x) {}
    });
  }

  function swap(am, prebuilt) {
    if (!am.composer || am.composer instanceof FilePlayer) return;
    if (!am.ctx) return;                       // pre-init: nothing to attach a graph to yet
    // CARRY THE PLAYING TRACK ACROSS THE SWAP.
    //
    // Read it BEFORE stop(), because stop() clears it. Without this the swap is silent-by-
    // construction whenever BGM had already started: the outgoing composer is stopped, the
    // FilePlayer starts with nothing playing, and nothing re-triggers it until some LATER
    // scene change happens to call playBgm() again -- which, for a scene whose music already
    // started, may be never. The result is no music at all, which is indistinguishable from
    // the override failing to load, and is worse than the chiptune it replaced.
    var carry = null;
    try { carry = am.composer.currentBgm || null; } catch (e) { /* ignore */ }
    try { am.composer.stop(); } catch (e) { /* ignore */ }
    var fp = prebuilt || new FilePlayer(am);
    // Mirror AudioManager.setVolume's own dB mapping so the first track is not at the wrong
    // level before any volume change arrives. masterVolume 1 -> -6 dB, which is exactly the
    // Tone.Volume(-6) the procedural composer used, so this is parity and not a new choice.
    fp.setVolume(am.masterVolume > 0 ? -30 + am.masterVolume * 24 : -Infinity);
    am.composer = fp;
    window.__QOK_MUSIC__ = fp;                 // verification handle: .failed / .tries / .cur
    if (carry) { try { fp.play(carry); } catch (e) { /* ignore */ } }
  }

  function install() {
    var am = window.__QOK && window.__QOK.audio;
    if (!am || typeof am.init !== 'function') return false;
    if (am.__musicOverridden) return true;
    am.__musicOverridden = true;

    // TWO ENTRY POINTS, because init() may have ALREADY RUN by the time this file installs.
    // AudioManager.init() early-returns once `initialized` is true, so wrapping it alone would
    // silently never fire in that case and the game would keep its chiptune -- a failure mode
    // that looks exactly like the override not being loaded at all. Handle both orders:
    //   * already initialised -> swap right now;
    //   * not yet             -> swap when init() resolves.
    var origInit = am.init.bind(am);
    am.init = function () { return origInit().then(function (r) { swapWhenProven(am); return r; }); };
    if (am.initialized) swapWhenProven(am);
    return true;
  }

  if (!install()) {
    // The bundle assigns __QOK during boot, which may be after this file runs.
    var tries = 0;
    var t = setInterval(function () {
      if (install() || ++tries > 100) clearInterval(t);
    }, 50);
  }
})();
