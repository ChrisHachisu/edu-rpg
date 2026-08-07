#!/usr/bin/env node
/* =================================================================================================
 * perf_probe.cjs — the permanent smoothness measurement harness for Quest of Knowledge.
 *
 * WHY THIS EXISTS
 *   The owner's goal is "virtually no lag when playing the game". That sentence cannot be
 *   verified, so the `smooth` skill converts it into six numbers (SMOOTH-1..6). This file is the
 *   instrument that produces those six numbers. It is written ONCE and is thereafter READ-ONLY to
 *   every fixer agent: if the probe looks wrong, that is a NEEDS-CONSULT to the orchestrator, not
 *   a licence for a fixer to retune the thing that grades its own work. A perf loop whose
 *   instrument drifts under it cannot tell improvement from measurement error.
 *
 *   It measures. It does not fix, and it does not modify game behaviour. Everything is
 *   instrumented from OUTSIDE the game via Playwright `addInitScript`, exactly as the round-0
 *   scratch probe did. No file under public/ is touched, least of all public/dq-tiles.js.
 *
 * WHAT EACH NUMBER MEANS (targets from ~/.claude/skills/smooth/SKILL.md)
 *
 *   SMOOTH-1  "It takes forever to start"      target <= 1500 ms
 *       Continue tap -> hero controllable on REAL terrain. "Real" means the Act 1 baked chunks
 *       have actually been blitted (__DQ_TILES__.readyWhy().drew), NOT the procedural placeholder
 *       the engine paints first -- measuring the placeholder would score a green load for a screen
 *       the owner would call wrong. Reported twice, because the two diverge and both matter:
 *         loadRelativeMs     — from page load. What a cold app start costs.
 *         continueRelativeMs — from the Continue tap. What the owner actually sits through.
 *       Also gated on WorldMapScene being active and not holding a message box, i.e. controllable.
 *
 *   SMOOTH-2  "It's choppy when I walk"        target >= 55 fps
 *   SMOOTH-3  "It hitches"                     target <= 33 ms
 *       Median frame rate and p99 frame time over ONE continuous 10 s overworld walk. The hero is
 *       genuinely walking the whole time (see REAL INPUT below) -- an idle scene is a different
 *       and much cheaper scene, and measuring it would be measuring nothing.
 *
 *   SMOOTH-4  "It freezes"                     target <= 100 ms
 *       Longest single main-thread block after the first playable frame, from the
 *       'long-animation-frame' (LoAF) observer's blockingDuration.
 *       NOT from 'longtask': measured 2026-08-07, the Long Tasks API reports ZERO entries in this
 *       headless Chrome even with buffered:true, while LoAF over the identical load reported an
 *       11-entry list topping out at 4,040 ms. A probe built on longtask would have printed a
 *       confident "0 ms — GREEN" over a four-second freeze. Two independent methods are therefore
 *       recorded every run and cross-checked:
 *           blockingMs  — LoAF blockingDuration. NOT primary, and NOT comparable to the others:
 *                         it is a TBT-style measure that subtracts 50 ms per long task. Adjudicated
 *                         2026-08-08 (docs/SMOOTH-ROUND-4-REFUTATION.md) across five methods: its
 *                         gap to the watchdog is a near-CONSTANT 42-43 ms across a tenfold change
 *                         in block size, which is the fingerprint of a fixed per-task subtraction,
 *                         not of the two measuring different things. It also reported
 *                         blockingDuration = 0 for a real 130.8 ms animation frame that carried no
 *                         script attribution. It reads GREEN where four other methods read RED.
 *                         Kept only as a diagnostic. Never score on it.
 *           durationMs  — LoAF duration, the unsubtracted frame cost. This is the LoAF number that
 *                         is comparable to the watchdog, and the two agree closely.
 *           driftMs     — an 8 ms setInterval watchdog measuring its own scheduling delay
 *       The header previously called blockingMs "primary". It never was — the code has always
 *       scored on the max — but the wrong word in this comment is what let round 1's refutation
 *       lean on LoAF as a tie-breaker. Corrected 2026-08-08.
 *       They did NOT agree to within 2.5% at round 0: 4040 vs 4135 ms is 95 ms apart, and that gap
 *       was simply invisible when divided by a four-second block. A ratio test cannot see a
 *       constant offset, which is why the cross-check below is absolute as well as proportional.
 *       Blocks are also reported for the pre-playable window, because that is what SMOOTH-1 is
 *       made of, but SMOOTH-4 itself is scored only on blocks after the first playable frame.
 *
 *   SMOOTH-5  "Doors are slow"                 target <= 500 ms
 *       Map swap, measured in BOTH directions over the real entry path: the hero walks north into
 *       the Greenhollow door at (69,255) and later walks back out. Timed from the loadMap() call
 *       to the first frame the destination map is playable. It deliberately EXCLUDES the walk
 *       across the tile onto the door, which is intended movement, not lag.
 *
 *   SMOOTH-6  "It ignores my taps"             target <= 100 ms
 *       Tap -> visible response, for the two taps the owner makes most: opening the menu from the
 *       field tab bar, and picking a battle command. Timed in-page from a capture-phase click
 *       listener (installed before the game binds its own, so it runs first) to the first animation
 *       frame after the DOM actually changed. The click itself is a real CDP mouse event.
 *
 *   Two diagnostics ride along because they explain the numbers above and are already-evidenced
 *   cost sources (smooth skill section 5):
 *       splatsBeforeTerrain — full-viewport procedural repaints before real terrain appears. Each
 *                             is a per-pixel loop over the whole canvas.
 *       tileLayerObjects    — Phaser display objects in the overworld scene's tile container. The
 *                             engine walks this list every frame. 128,000 is the known baseline.
 *
 * THE THREE THINGS THAT MAKE OR BREAK THIS INSTRUMENT
 *
 *   1. RENDERER. Chrome must use the real GPU. Measured 2026-08-07 on this Mac, same scene,
 *      same walk:
 *          --use-angle=swiftshader  ->   3.8 fps median   (software raster)
 *          real GPU (Metal/ANGLE)   ->  61.0 fps median
 *      SwiftShader is a ~16x error. It is also what scripts/browser_runtime_smoke.cjs uses, which
 *      is correct for a behavioural smoke test and useless for a frame-rate one -- do not copy its
 *      launch args here. This probe launches WITHOUT an ANGLE override, asserts the reported
 *      renderer string is not SwiftShader, and voids the run loudly if it is.
 *
 *   2. TOUCH EMULATION IS MANDATORY (hasTouch + isMobile). index.html:63-85 hides the ENTIRE
 *      shipped control layer -- the analog stick AND the field tab bar -- behind
 *      `@media (pointer: coarse), (hover: none)`. In a plain desktop context #touch-controls is
 *      display:none, the tab buttons measure 0x0, and a real tap silently lands on whatever sits
 *      underneath (measured: it hit the boot cover). That is not a harder-to-measure version of
 *      the game, it is a different game from the one the owner plays. Emulating a coarse pointer
 *      is what makes SMOOTH-6 measurable at all, and it is the faithful configuration besides.
 *
 *   3. REAL INPUT, dispatched IN-PAGE. The shipped d-pad in index.html does not use native key
 *      events: it synthesises KeyboardEvents on `window` with keyCode patched in, and publishes
 *      the analog vector on window.__DQ_STICK__ alongside them (dq-tiles.js reads the stick, the
 *      frozen bundle reads the keys). This probe reproduces that pair exactly, so it drives the
 *      same code path the owner's thumb does. Doing it in-page also means ZERO CDP round-trips
 *      during the 10 s sample window -- a driver that calls back into Node every frame measures
 *      its own overhead.
 *
 * VOIDING RULES (smooth skill section 3 — these are not advisory)
 *   - `uptime` 1-minute load average is captured before AND after every run. Above 10.0 the run is
 *     VOID and the probe prints a loud banner. A timing number taken under load is not a verdict.
 *   - Every metric is run 3x minimum. Median and full spread are always emitted; a single sample
 *     is not a measurement.
 *   - Viewport is fixed and reported. It matters: the round-0 scratch probe measured 3,502,080 px
 *     procedural splats at 960x720 against the device's 2,965,248.
 *   - --compare runs two builds INTERLEAVED (A,B,A,B,...) rather than all-A-then-all-B, so a
 *     machine that warms or cools during the sequence biases both sides equally.
 *
 * USAGE
 *   Serve dist/ with scripts/serve_dist.py — never `npx serve` and never a one-shot Python
 *   http.server. Both serialise the ~19 MB of Act 1 chunk art and manufacture false timeouts.
 *
 *     python3 scripts/serve_dist.py --port 5174 &
 *     node scripts/perf_probe.cjs --runs 3 --label round-0 --out /tmp/round0.json
 *
 *   Or let the probe own the server for the duration of the measurement:
 *
 *     node scripts/perf_probe.cjs --serve dist --runs 3 --label round-0
 *
 *   Interleaved A/B against two servers:
 *
 *     node scripts/perf_probe.cjs --compare "base=http://127.0.0.1:5174/,fix=http://127.0.0.1:5175/"
 *
 *   Flags: --url --runs --label --viewport WxH --out --serve <dir> --port --headed --keep-open
 *
 * WHAT THIS PROBE IS NOT
 *   It is a browser number, and a browser number is a hypothesis about the device, never a
 *   substitute for it. The verdict device is the iOS simulator named in the smooth skill. This
 *   harness is the fast inner loop that tells you which hypothesis is worth taking to the device.
 * ===============================================================================================*/

'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');

// Playwright lives in .eduharness, which is verification tooling and is NOT tracked. An agent
// worktree under <repo>/.claude/worktrees/<name>/ therefore has no copy of it, so resolution walks
// up until it finds the real checkout's. Hardcoding '../.eduharness' works only from the main tree
// and fails on every worktree, which is where this probe usually runs.
let chromium;
(function resolvePlaywright() {
  const tried = [];
  try { ({ chromium } = require('playwright-core')); return; } catch (_) { tried.push('playwright-core (node_modules)'); }
  let dir = __dirname;
  for (let i = 0; i < 8; i++) {
    const p = path.join(dir, '.eduharness', 'node_modules', 'playwright-core');
    tried.push(p);
    try { ({ chromium } = require(p)); return; } catch (_) { /* keep walking */ }
    const up = path.dirname(dir);
    if (up === dir) break;
    dir = up;
  }
  console.error('cannot locate playwright-core. Looked in:\n  ' + tried.join('\n  ')
    + '\n.eduharness is untracked verification tooling; run this from a checkout that has it.');
  process.exit(1);
})();

// ------------------------------------------------------------------------------------------------
// Targets. Single source of truth for the pass/fail column; mirrors the smooth skill's table.
// ------------------------------------------------------------------------------------------------
const TARGETS = {
  'SMOOTH-1': { label: 'Continue -> playable on real terrain', unit: 'ms', limit: 1500, dir: 'max' },
  'SMOOTH-2': { label: 'Median fps, 10 s continuous walk', unit: 'fps', limit: 55, dir: 'min' },
  'SMOOTH-3': { label: 'p99 frame time, same walk', unit: 'ms', limit: 33, dir: 'max' },
  'SMOOTH-4': { label: 'Longest main-thread block after playable', unit: 'ms', limit: 100, dir: 'max' },
  'SMOOTH-5': { label: 'Map swap, tap -> playable', unit: 'ms', limit: 500, dir: 'max' },
  'SMOOTH-6': { label: 'Tap -> visible response', unit: 'ms', limit: 100, dir: 'max' },
};

const LOAD_CEILING = 10.0;
const SETTLE_MAX_MS = 6 * 60_000;   // longest we will wait for the machine to calm down per run
const WALK_MS = 10_000;     // SMOOTH-2/3 sample window. The skill says 10 s; do not shorten it.
const WARMUP_MS = 1_500;    // after first playable frame, before sampling: let the load tail drain.

// Deterministic entry. Resumed ON THE OVERWORLD at the cell act1-world-map.js puts the hero on
// when walking out of Greenhollow (LANDMARKS greenhollow.exit = 69,256). That is inside the Act 1
// art footprint (semanticBounds [16,218,163,399]), which is the only region where the baked chunks
// ARE the terrain -- measure outside it and "real terrain" never arrives. It is also one step south
// of the Greenhollow door at (69,255), which is what makes SMOOTH-5 a real walk-through-the-door.
const SAVE = {
  version: 4,
  timestamp: 1754500000000,
  player: {
    name: 'Perf', heroColor: 'gray', level: 5, exp: 0, expToNext: 100,
    hp: 40, maxHp: 40, atk: 15, def: 5, spd: 6,
    equipment: { weapon: null, armor: null, shield: null, helmet: null, accessory: null },
    inventory: [{ itemId: 'herb', quantity: 3 }], gold: 200,
    position: { mapId: 'overworld', x: 69, y: 256, floor: 1 },
    storyFlags: {}, activeQuests: [], completedQuests: [], questProgress: {},
    timerEnabled: true, quizDifficulty: '3', locale: 'en', soundEnabled: false,
    masterVolume: 0, kanjiMode: false,
  },
  playtime: 0,
  quizStats: {},
};

// Fixed encounter for the SMOOTH-6 battle tap. Same shape browser_runtime_smoke.cjs uses.
const MONSTER = {
  id: 'slime', nameKey: 'monster.slime', spriteKey: 'monster-slime',
  baseHp: 12, baseAtk: 4, baseDef: 1, baseSpd: 2,
  expReward: 4, goldReward: 2, drops: [], aiPattern: 'basic', color: 0x55aa55,
};

// ------------------------------------------------------------------------------------------------
// In-page instrumentation. Installed via addInitScript, so it is running before any game code.
// Everything here is passive observation plus one call-through wrapper on the scene's own loadMap.
// ------------------------------------------------------------------------------------------------
function initScript() {
  const P = {
    t0: performance.now(),
    splats: [],          // full-viewport procedural repaints: {t, px}
    splatsAny: 0,        // ALL createImageData calls, any size — proves the hook is live when
                         // splats is 0, so "0 splats" can be told apart from "0 instrumentation"
    maxSplatPx: 0,
    loaf: [],            // {t, dur, blocking} long-animation-frame
    drift: [],           // {t, over} watchdog overshoot
    frames: [],          // frame intervals, only while sampling
    swapPhaseAt: null,   // set by the harness; swaps before it are the initial load, not a swap
    sampling: false,
    drewAt: null,        // baked Act 1 chunks blitted (REAL terrain)
    readyAt: null,       // __DQ_TILES__.ready() — the terrain gate
    // The shipped boot cover (index.html) does not lift on terrain alone. Its worldReady() also
    // requires __QOKUI.iconsReady(), __QOKUI.mapArtReady() (overworld only) and __HERO_VARIANT__,
    // then fades for 400 ms. Terrain was ready at 3.6 s while the hero became controllable at
    // 9.3 s, so ~60% of SMOOTH-1 is one of these OTHER gates. Timing each separately is what tells
    // a fixer which one to attack; without it the obvious-looking target is the wrong one.
    // Tracked as LAST-SEEN-FALSE, not first-seen-true. These gates toggle: iconsReady and
    // mapArtReady are both satisfied on the title screen and go false again when the overworld
    // loads. A first-true timestamp therefore records the title screen and attributes ~0 ms to a
    // gate that actually held the cover down for seconds -- which is precisely backwards.
    gateFalse: { terrain: null, iconsReady: null, mapArtReady: null, heroVariant: null },
    coverGoneAt: null,
    lastCoverGate: null, // which gate was still outstanding on the most recent unsatisfied tick
    sceneAt: null,       // WorldMapScene active
    playableAt: null,    // all of the above + accepting input
    continueAt: null,    // when the harness pressed Continue
    swaps: [],           // completed map swaps
    pendingSwap: null,
    taps: [],            // {label, at, respondedAt}
    tapArmed: null,
    renderer: null,
  };
  window.__PERF = P;

  // --- procedural splat counter -------------------------------------------------------------
  // drawTerrain's per-pixel fallback is the only thing in this runtime that allocates an
  // ImageData of a million-plus pixels. Nothing else comes close, so the threshold is unambiguous.
  const origCID = CanvasRenderingContext2D.prototype.createImageData;
  CanvasRenderingContext2D.prototype.createImageData = function (w, h) {
    if (typeof w === 'number' && typeof h === 'number') {
      P.splatsAny++;
      if (w * h > P.maxSplatPx) P.maxSplatPx = w * h;
      if (w * h >= 1e6) P.splats.push({ t: performance.now() - P.t0, px: w * h });
    }
    return origCID.apply(this, arguments);
  };

  // --- main-thread block observers (SMOOTH-4) ------------------------------------------------
  // PRIMARY: long-animation-frame. Its blockingDuration is the part of the frame that actually
  // stalled input. 'longtask' is deliberately NOT used -- it reports nothing at all in headless
  // Chrome here (verified with buffered:true) and would have scored a 4 s freeze as 0 ms.
  try {
    new PerformanceObserver((list) => {
      for (const e of list.getEntries()) {
        P.loaf.push({ t: e.startTime - P.t0, dur: e.duration, blocking: e.blockingDuration || 0 });
      }
    }).observe({ type: 'long-animation-frame', buffered: true });
  } catch (e) { P.loafUnsupported = String(e && e.message); }

  // CROSS-CHECK: a short-interval watchdog. If the main thread is blocked, this callback cannot
  // run, so its overshoot is a direct lower bound on the block. Independent of any observer API,
  // which is the point -- it is here to catch the primary method being silently broken.
  const TICK = 8;
  let wdLast = performance.now();
  setInterval(() => {
    const n = performance.now();
    const over = n - wdLast - TICK;
    wdLast = n;
    if (over > 20) P.drift.push({ t: n - P.t0, over });
  }, TICK);

  // --- tap latency (SMOOTH-6) ----------------------------------------------------------------
  // Capture phase on window, registered here so it precedes every handler the game installs.
  // The response timestamp is the first animation frame AFTER the DOM actually mutated, which is
  // the closest a headless run gets to "the owner saw something change".
  const mo = new MutationObserver(() => {
    const t = P.tapArmed;
    if (t && t.mutatedAt === null) {
      t.mutatedAt = performance.now() - P.t0;
      requestAnimationFrame(() => {
        if (t.respondedAt === null) t.respondedAt = performance.now() - P.t0;
      });
    }
  });
  window.__perfArmTap = function (label, rootSel) {
    const root = document.querySelector(rootSel) || document.body;
    const rec = { label, at: null, mutatedAt: null, respondedAt: null };
    P.tapArmed = rec;
    P.taps.push(rec);
    mo.disconnect();
    mo.observe(root, { childList: true, subtree: true, attributes: true, characterData: true });
    return true;
  };
  window.__perfDisarmTap = function () { mo.disconnect(); P.tapArmed = null; };
  window.addEventListener('pointerdown', () => {
    const t = P.tapArmed;
    if (t && t.at === null) t.at = performance.now() - P.t0;
  }, true);
  window.addEventListener('click', () => {
    const t = P.tapArmed;
    if (t && t.at === null) t.at = performance.now() - P.t0;   // fallback if pointerdown is absent
  }, true);

  // --- real device input: the shipped d-pad's own mechanism ----------------------------------
  // index.html synthesises KeyboardEvents on window (keyCode patched in, because the frozen bundle
  // reads keyCode) and publishes the analog vector on __DQ_STICK__ for dq-tiles.js. Both channels,
  // together, are what a thumb on the stick produces. Reproduced verbatim.
  const KC = { ArrowUp: 38, ArrowDown: 40, ArrowLeft: 37, ArrowRight: 39 };
  const VEC = { ArrowUp: [0, -1], ArrowDown: [0, 1], ArrowLeft: [-1, 0], ArrowRight: [1, 0] };
  const held = Object.create(null);
  function fire(type, key) {
    const ev = new KeyboardEvent(type, { key, code: key, bubbles: true, cancelable: true });
    try {
      Object.defineProperty(ev, 'keyCode', { get: () => KC[key] });
      Object.defineProperty(ev, 'which', { get: () => KC[key] });
    } catch (e) { /* older engines: keyCode is already own-property writable */ }
    window.dispatchEvent(ev);
  }
  window.__perfSetDir = function (dir) {
    for (const k of Object.keys(KC)) {
      if (k === dir && !held[k]) { held[k] = 1; fire('keydown', k); }
      else if (k !== dir && held[k]) { delete held[k]; fire('keyup', k); }
    }
    window.__DQ_STICK__ = dir ? { x: VEC[dir][0], y: VEC[dir][1], m: 1 } : { x: 0, y: 0, m: 0 };
  };

  // --- the watcher ---------------------------------------------------------------------------
  // One rAF loop does state detection and frame sampling. Using the same loop for both means the
  // sampled interval is a genuine frame interval, not a timer's idea of one.
  const scene = () => {
    const g = window.__PHASER_GAME__;
    return g && g.scene && g.scene.getScene ? g.scene.getScene('WorldMapScene') : null;
  };
  const tiles = () => window.__DQ_TILES__;

  let prev = performance.now();
  function tick() {
    const raw = performance.now();
    const now = raw - P.t0;

    if (P.sampling) P.frames.push(raw - prev);
    prev = raw;

    try {
      const g = window.__PHASER_GAME__;
      const T = tiles();
      const w = scene();
      const active = !!(g && g.scene.isActive('WorldMapScene'));
      const why = (T && T.readyWhy) ? T.readyWhy() : null;

      if (P.drewAt === null && why && why.drew) P.drewAt = now;
      if (P.readyAt === null && T && T.ready && T.ready()) P.readyAt = now;
      if (P.sceneAt === null && active) P.sceneAt = now;
      // "Controllable" also means the shipped boot cover is gone. While #boot-cover is up it eats
      // every tap -- verified by hit-testing a field tab through it -- so a hero that is notionally
      // ready behind it is not one the owner can drive.
      // Time each of the boot cover's own gates, using the same public surfaces it reads.
      // Read-only: nothing here changes what the cover decides.
      const UI = window.__QOKUI;
      if (active) {
        const g = {
          terrain: !!(T && T.ready && T.ready()),
          iconsReady: !!(UI && UI.iconsReady && UI.iconsReady()),
          mapArtReady: !!(UI && UI.mapArtReady && UI.mapArtReady()),
          heroVariant: !!window.__HERO_VARIANT__,
        };
        for (const k of Object.keys(g)) if (!g[k]) P.gateFalse[k] = now;
      }

      const covered = (() => {
        const bc = document.getElementById('boot-cover');
        return !!(bc && getComputedStyle(bc).display !== 'none' && +getComputedStyle(bc).opacity > 0.01);
      })();
      if (P.coverGoneAt === null && !covered && P.sceneAt !== null) P.coverGoneAt = now;
      if (covered && active) {
        P.lastCoverGate =
          !(T && T.ready && T.ready()) ? 'terrain (__DQ_TILES__.ready)'
            : !(UI && UI.iconsReady && UI.iconsReady()) ? 'iconsReady'
              : !(UI && UI.mapArtReady && UI.mapArtReady()) ? 'mapArtReady'
                : !window.__HERO_VARIANT__ ? '__HERO_VARIANT__'
                  : 'all gates satisfied (cover fade / removal delay)';
      }
      if (P.playableAt === null && active && P.drewAt !== null && P.readyAt !== null
          && !covered && w && !w.showingMessage) P.playableAt = now;

      // Call-through wrapper on the scene's own loadMap: the only way to timestamp the START of a
      // map swap from outside. It adds one property write and one apply(); it changes nothing.
      if (w && !w.__perfWrapped && typeof w.loadMap === 'function') {
        w.__perfWrapped = true;
        const orig = w.loadMap;
        w.loadMap = function (id) {
          P.pendingSwap = {
            to: id, from: this.currentMapId,
            startAt: performance.now() - P.t0, playableAt: null,
          };
          return orig.apply(this, arguments);
        };
      }

      // Resolve a pending swap. For the overworld the terrain gate is ready(), which is derived
      // live from the scene's current window -- unlike readyWhy().drew, which latches true forever
      // once the first baked chunk lands and would score every swap back as instant.
      const ps = P.pendingSwap;
      if (ps && ps.playableAt === null && w && w.currentMapId === ps.to && !w.showingMessage) {
        if (T && T.ready && T.ready()) {
          ps.playableAt = now;
          ps.ms = +(ps.playableAt - ps.startAt).toFixed(1);
          // Only count swaps that began after the harness entered the SMOOTH-5 phase. The very
          // first loadMap of a session is the initial overworld load at Continue -- it is
          // SMOOTH-1, and counting it as a map swap made SMOOTH-5 a duplicate of SMOOTH-1
          // (3065 ms vs 3071 ms) on the probe's first run.
          ps.counted = P.swapPhaseAt !== null && ps.startAt >= P.swapPhaseAt;
          P.swaps.push(ps);
          P.pendingSwap = null;
        }
      }
    } catch (e) { /* pre-boot, or mid-scene-teardown; both are expected */ }

    requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);
}

// ------------------------------------------------------------------------------------------------
// stats helpers
// ------------------------------------------------------------------------------------------------
const num = (v) => (typeof v === 'number' && isFinite(v));
function median(a) {
  const s = a.filter(num).slice().sort((x, y) => x - y);
  if (!s.length) return null;
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}
function pct(a, p) {
  const s = a.filter(num).slice().sort((x, y) => x - y);
  if (!s.length) return null;
  return s[Math.min(s.length - 1, Math.floor(s.length * p))];
}
const r1 = (v) => (num(v) ? +v.toFixed(1) : null);
function spread(a) {
  const s = a.filter(num);
  if (!s.length) return null;
  return { n: s.length, min: r1(Math.min(...s)), median: r1(median(s)), max: r1(Math.max(...s)), all: s.map(r1) };
}
const load1 = () => +os.loadavg()[0].toFixed(2);

// Wait for the 1-minute load average to fall below `threshold` before measuring.
//
// This exists because the probe heats the machine it is measuring. A run drives a multi-second
// terrain build at 100% CPU, so the 1-min average is still carrying the PREVIOUS run when the next
// one starts: measured 2026-08-07, three back-to-back runs went 4.45 -> 7.11 -> 8.52 -> 28.74 and
// the last two voided themselves on load the probe had itself produced. Settling between runs is
// what makes "3 runs, all under the ceiling" achievable at all, and it keeps the void rule meaning
// "the machine was busy" rather than "we measured three times".
async function settle(threshold, log) {
  const t0 = Date.now();
  let l = load1();
  if (l < threshold) return { waitedMs: 0, load: l };
  if (log) process.stderr.write(`  waiting for load ${l} to fall below ${threshold} `);
  while (Date.now() - t0 < SETTLE_MAX_MS) {
    await new Promise((r) => setTimeout(r, 10_000));
    l = load1();
    if (log) process.stderr.write('.');
    if (l < threshold) break;
  }
  if (log) process.stderr.write(` now ${l}\n`);
  return { waitedMs: Date.now() - t0, load: l, timedOut: l >= threshold };
}

// ------------------------------------------------------------------------------------------------
// one run = one full page lifecycle producing all six numbers
// ------------------------------------------------------------------------------------------------
async function measureOnce(browser, url, viewport, runIndex) {
  // hasTouch + isMobile are NOT optional -- see header note 2. Without them the shipped analog
  // stick and field tab bar are display:none and SMOOTH-6 cannot be measured at all.
  const page = await browser.newPage({ viewport, hasTouch: true, isMobile: true });
  const pageErrors = [];
  page.on('pageerror', (e) => pageErrors.push(e.message));
  await page.addInitScript(initScript);

  const out = { run: runIndex, loadBefore: load1(), pageErrors };

  // -- boot, seed the save, reload so the parse-time prefetch sees it (a real Continue does this)
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60_000 });
  await page.evaluate((s) => localStorage.setItem('edu-rpg-save', JSON.stringify(s)), SAVE);
  await page.reload({ waitUntil: 'load', timeout: 60_000 });
  await page.waitForFunction(() => !!window.__PHASER_GAME__, { timeout: 60_000 });

  out.renderer = await page.evaluate(() => {
    try {
      const c = document.querySelector('canvas');
      const gl = c.getContext('webgl2') || c.getContext('webgl');
      const dbg = gl && gl.getExtension('WEBGL_debug_renderer_info');
      return dbg ? gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) : 'unknown';
    } catch (e) { return 'unavailable'; }
  });
  out.softwareRenderer = /swiftshader|software|llvmpipe/i.test(out.renderer || '');

  await page.evaluate(() => {
    const g = window.__PHASER_GAME__;
    if (g.scene.isActive('BootScene')) { g.scene.start('TitleScene'); g.scene.stop('BootScene'); }
  });
  await page.waitForFunction(() => {
    const g = window.__PHASER_GAME__, t = g && g.scene.getScene('TitleScene');
    return t && g.scene.isActive('TitleScene') && t.menuItems && t.menuItems.length > 0;
  }, { timeout: 60_000 });

  // ---------------------------------------------------------------- SMOOTH-1 : Continue -> playable
  //
  // Let the shipped boot cover finish its TITLE phase before tapping Continue. This is not
  // politeness, it is correctness, and getting it wrong cost this probe a whole baseline:
  //
  // index.html's cover only leaves phase 'boot' after titlePainted() is true for 3 CONSECUTIVE
  // frames, or after a 10 s TITLE_CAP safety valve. A harness that starts TitleScene and calls
  // confirmTitle() in the same breath never gives it 3 title frames, so the cover stayed pinned
  // until TITLE_CAP and then lifted 400 ms later. The probe duly reported SMOOTH-1 = 9357 ms with
  // a spread of 6 ms across three runs -- beautifully reproducible, and pure instrument artefact:
  // every one of the cover's real gates (terrain, iconsReady, mapArtReady, __HERO_VARIANT__) was
  // already satisfied, and terrain had been up since ~3.4 s. A real player looks at the title
  // screen for far longer than 3 frames, so this wait is what makes the measurement resemble them.
  await page.waitForFunction(
    () => { const c = window.__QOK_COVER__; return !c || c.phase() !== 'boot'; },
    { timeout: 30_000 },
  ).catch(() => { out.coverStuckInBoot = true; });
  await page.evaluate(() => {
    window.__PERF.coverPhaseAtContinue = window.__QOK_COVER__ ? window.__QOK_COVER__.phase() : 'n/a';
    window.__PERF.continueAt = performance.now() - window.__PERF.t0;
    const t = window.__PHASER_GAME__.scene.getScene('TitleScene');
    const i = t.menuItems.findIndex((m) => m.getData && m.getData('action') === 'continue');
    if (i < 0) throw new Error('title has no continue action');
    t.selectedIndex = i;
    t.confirmTitle();
  });
  await page.waitForFunction(() => window.__PERF.playableAt !== null, { timeout: 120_000 })
    .catch(() => { out.smooth1Timeout = true; });

  const s1 = await page.evaluate(() => {
    const P = window.__PERF;
    const before = P.drewAt === null ? P.splats.length : P.splats.filter((s) => s.t <= P.drewAt).length;
    const w = window.__PHASER_GAME__.scene.getScene('WorldMapScene');
    return {
      continueAt: P.continueAt, drewAt: P.drewAt, readyAt: P.readyAt,
      sceneAt: P.sceneAt, playableAt: P.playableAt,
      gateFalse: P.gateFalse, coverGoneAt: P.coverGoneAt, lastCoverGate: P.lastCoverGate,
      coverPhaseAtContinue: P.coverPhaseAtContinue,
      splatsTotal: P.splats.length, splatsBeforeTerrain: before,
      splatPx: P.splats.length ? P.splats[0].px : null,
      splatsAny: P.splatsAny, maxSplatPx: P.maxSplatPx,
      tileLayerObjects: (w && w.tileLayer && w.tileLayer.list) ? w.tileLayer.list.length : null,
      mapId: w && w.currentMapId, hero: w ? [w.heroTileX, w.heroTileY] : null,
      coarsePointer: matchMedia('(pointer: coarse)').matches,
      controlsVisible: getComputedStyle(document.getElementById('touch-controls')).display !== 'none',
      // Record what was ACTUALLY rendered, not just the requested viewport. Pixel count drives the
      // terrain cost directly -- the previous round measured 3,502,080 px of procedural splat at
      // 960x720 against a device's 2,965,248 -- so a baseline that omits this cannot be compared
      // against anything later.
      dpr: window.devicePixelRatio,
      innerSize: [window.innerWidth, window.innerHeight],
      canvasSize: (() => { const c = document.querySelector('canvas'); return c ? [c.width, c.height] : null; })(),
    };
  });
  out.smooth1 = {
    loadRelativeMs: r1(s1.playableAt),
    continueRelativeMs: r1(num(s1.playableAt) && num(s1.continueAt) ? s1.playableAt - s1.continueAt : null),
    continueAtMs: r1(s1.continueAt), firstRealTerrainMs: r1(s1.drewAt), terrainGateMs: r1(s1.readyAt),
    sceneActiveMs: r1(s1.sceneAt),
    // Which gate actually held the boot cover down, and when each one cleared. Continue-relative.
    // Each value is when that gate was LAST seen unsatisfied, Continue-relative -- i.e. the point
    // after which it stopped holding the boot cover down. The largest one is the gate that
    // actually governs SMOOTH-1.
    gates: (() => {
      const rel = (v) => r1(num(v) && num(s1.continueAt) ? v - s1.continueAt : null);
      return {
        terrainMs: rel(s1.gateFalse.terrain),
        iconsReadyMs: rel(s1.gateFalse.iconsReady),
        mapArtReadyMs: rel(s1.gateFalse.mapArtReady),
        heroVariantMs: rel(s1.gateFalse.heroVariant),
        coverGoneMs: rel(s1.coverGoneAt),
        lastOutstanding: s1.lastCoverGate,
        coverPhaseAtContinue: s1.coverPhaseAtContinue,
      };
    })(),
  };
  out.diagnostics = {
    splatsBeforeTerrain: s1.splatsBeforeTerrain, splatsTotal: s1.splatsTotal,
    splatPx: s1.splatPx, tileLayerObjects: s1.tileLayerObjects,
    // Liveness witnesses for the splat hook. If splatsBeforeTerrain is 0 AND createImageDataCalls
    // is also 0, the hook proved nothing; if calls are non-zero, a 0 splat count is a real result.
    createImageDataCalls: s1.splatsAny, largestImageDataPx: s1.maxSplatPx,
  };
  out.entry = {
    mapId: s1.mapId, hero: s1.hero,
    coarsePointer: s1.coarsePointer, controlsVisible: s1.controlsVisible,
    dpr: s1.dpr, innerSize: s1.innerSize, canvasSize: s1.canvasSize,
  };

  // ---------------------------------------------------------------- SMOOTH-6 (a) : menu tap
  // Taken here, on a freshly settled field, rather than after the swap and walk phases. Measured
  // 2026-08-07, taking it at the end reported "box null" every run: the post-swap field still had
  // a dialogue up, and body.qok-dialogue hides #touch-controls outright. This is also the state the
  // owner is actually in when they open the menu.
  const taps = [];
  await page.waitForTimeout(WARMUP_MS);
  // realTap is declared further down with the battle tap; it is a hoisted function declaration, so
  // both SMOOTH-6 measurements share one definition and neither can drift from the other.
  taps.push(await realTap('menu-open', '#fieldTabs button.ft', '#qok-ui'));
  await page.keyboard.press('Escape').catch(() => {});   // back to a clean field state
  await page.waitForTimeout(1000);

  // ---------------------------------------------------------------- SMOOTH-5 : map swaps
  // Measured BEFORE the walk, on purpose. The hero starts one tile south of the Greenhollow door;
  // the 10 s walk carries her ~20 tiles away from it, after which walking north reaches no door at
  // all and the swap silently never happens (observed: inbound.changed === false, and SMOOTH-5
  // then reported the initial load instead). Swaps first, walk second, both from known positions.
  //
  // Real entry path in both directions -- walk north through the door, later walk back out. No
  // console loadMap() calls: AGENTS.md rule 7 is explicit that those do not verify a transition.
  await page.waitForTimeout(WARMUP_MS);
  await page.evaluate(() => { window.__PERF.swapPhaseAt = performance.now() - window.__PERF.t0; });
  const swaps = await page.evaluate(async () => {
    const w = () => window.__PHASER_GAME__.scene.getScene('WorldMapScene');
    async function walkUntilMapChanges(dir, budgetMs) {
      const from = w().currentMapId;
      window.__perfSetDir(dir);
      const t0 = performance.now();
      while (performance.now() - t0 < budgetMs && w().currentMapId === from) {
        await new Promise(requestAnimationFrame);
      }
      window.__perfSetDir(null);
      const changed = w().currentMapId !== from;
      const s0 = performance.now();   // let the destination settle so the watcher can resolve it
      while (performance.now() - s0 < 5000 && window.__PERF.pendingSwap) {
        await new Promise(requestAnimationFrame);
      }
      return { from, to: w().currentMapId, changed, walkMs: +(performance.now() - t0).toFixed(0) };
    }
    const inbound = await walkUntilMapChanges('ArrowUp', 15_000);     // overworld -> greenhollow
    await new Promise((r) => setTimeout(r, 1000));
    const outbound = await walkUntilMapChanges('ArrowDown', 25_000);  // greenhollow -> overworld
    return { inbound, outbound, records: window.__PERF.swaps.slice() };
  });
  const rec = swaps.records.filter((s) => num(s.ms) && s.counted);
  out.smooth5 = {
    intoTownMs: r1((rec.find((s) => s.to !== 'overworld') || {}).ms),
    toOverworldMs: r1((rec.find((s) => s.to === 'overworld') || {}).ms),
    worstMs: rec.length ? r1(Math.max(...rec.map((s) => s.ms))) : null,
    transitions: rec.map((s) => ({ from: s.from, to: s.to, ms: r1(s.ms) })),
    inbound: swaps.inbound, outbound: swaps.outbound,
    uncounted: swaps.records.filter((s) => !s.counted).map((s) => ({ from: s.from, to: s.to, ms: r1(s.ms), why: 'initial load, not a swap' })),
  };
  if (!swaps.inbound.changed || !swaps.outbound.changed) {
    out.smooth5.incomplete = `inbound ${swaps.inbound.changed} / outbound ${swaps.outbound.changed}`;
  }

  // ---------------------------------------------------------------- SMOOTH-2 / 3 : the 10 s walk
  await page.waitForTimeout(WARMUP_MS);
  const walk = await page.evaluate(async ({ walkMs }) => {
    const P = window.__PERF;
    const w = window.__PHASER_GAME__.scene.getScene('WorldMapScene');
    const DIRS = ['ArrowRight', 'ArrowDown', 'ArrowLeft', 'ArrowUp'];
    const D = { ArrowRight: [1, 0], ArrowLeft: [-1, 0], ArrowDown: [0, 1], ArrowUp: [0, -1] };

    // Keep the hero genuinely walking for the whole window: re-aim whenever the tile ahead is
    // blocked, so the sample is a walk and not a shove into a cliff. Chosen in-page, so no CDP
    // round-trip lands inside the sample window.
    let di = 0;
    const pick = () => {
      for (let k = 0; k < 4; k++) {
        const d = DIRS[(di + k) % 4];
        try { if (w.canMove(w.heroTileX + D[d][0], w.heroTileY + D[d][1])) { di = (di + k) % 4; return d; } }
        catch (e) { return d; }
      }
      return DIRS[di];
    };
    const startPos = [w.heroTileX, w.heroTileY];
    let dir = pick();
    window.__perfSetDir(dir);

    P.frames = [];
    P.sampling = true;
    const t0 = performance.now();
    let lastAim = t0, turns = 0;
    while (performance.now() - t0 < walkMs) {
      await new Promise(requestAnimationFrame);
      const nowT = performance.now();
      if (nowT - lastAim >= 900) {                 // re-aim ~11x across the window
        lastAim = nowT;
        const nd = pick();
        if (nd !== dir) { dir = nd; turns++; window.__perfSetDir(dir); }
      }
    }
    P.sampling = false;
    window.__perfSetDir(null);
    const endPos = [w.heroTileX, w.heroTileY];
    return {
      frames: P.frames.slice(), durationMs: performance.now() - t0,
      startPos, endPos, turns,
      tilesTravelled: Math.abs(endPos[0] - startPos[0]) + Math.abs(endPos[1] - startPos[1]),
    };
  }, { walkMs: WALK_MS });

  // Drop the first two intervals: the first is the gap since sampling was switched on, the second
  // frequently carries the cost of the very keydown that started the walk. Neither is a walk frame.
  const fr = walk.frames.slice(2);
  const meanMs = fr.reduce((a, b) => a + b, 0) / fr.length;
  out.smooth2 = { medianFps: r1(median(fr) ? 1000 / median(fr) : null), medianFrameMs: r1(median(fr)) };
  out.smooth3 = { p99FrameMs: r1(pct(fr, 0.99)), p95FrameMs: r1(pct(fr, 0.95)), maxFrameMs: r1(Math.max(...fr)) };
  out.walk = {
    frames: fr.length, durationMs: r1(walk.durationMs), turns: walk.turns,
    startPos: walk.startPos, endPos: walk.endPos, tilesTravelled: walk.tilesTravelled,
    moved: walk.tilesTravelled > 0,
    // The distribution, not just its middle. Measured 2026-08-07 the median frame is a clean 60 fps
    // while the MEAN is ~39 fps -- i.e. most frames are perfect and a handful are catastrophic.
    // That gap IS the hitching the owner reports, and a median-only report hides it completely.
    // p99 over ~390 samples is the 4th-worst frame, so treat it as indicative, not precise.
    meanFps: r1(1000 / meanMs), meanFrameMs: r1(meanMs),
    framesOver33ms: fr.filter((f) => f > 33).length,
    framesOver100ms: fr.filter((f) => f > 100).length,
    framesOver500ms: fr.filter((f) => f > 500).length,
    worstFramesMs: fr.slice().sort((a, b) => b - a).slice(0, 5).map(r1),
  };

  // ---------------------------------------------------------------- SMOOTH-4 : longest block
  // Two independent methods, both reported. See the header for why 'longtask' is not one of them.
  const blocks = await page.evaluate(() => {
    const P = window.__PERF;
    const cut = P.playableAt;
    const afterL = cut === null ? P.loaf : P.loaf.filter((l) => l.t >= cut);
    const afterD = cut === null ? P.drift : P.drift.filter((d) => d.t >= cut);
    const beforeL = cut === null ? [] : P.loaf.filter((l) => l.t < cut);
    const mx = (a, f) => (a.length ? Math.max(...a.map(f)) : 0);
    return {
      loafSupported: !P.loafUnsupported, loafUnsupported: P.loafUnsupported || null,
      loafCountAfter: afterL.length,
      blockingMs: mx(afterL, (l) => l.blocking),
      durationMs: mx(afterL, (l) => l.dur),
      driftMs: mx(afterD, (d) => d.over),
      prePlayableBlockingMs: mx(beforeL, (l) => l.blocking),
      top: afterL.slice().sort((a, b) => b.blocking - a.blocking).slice(0, 5)
        .map((l) => ({ atMs: +l.t.toFixed(1), blockingMs: +l.blocking.toFixed(1), durMs: +l.dur.toFixed(1) })),
    };
  });
  // Cross-check: if the observer and the watchdog disagree badly, the run says so instead of
  // quietly trusting whichever is smaller. Only meaningful once either is above the noise floor.
  const b4 = blocks.blockingMs, d4 = blocks.driftMs, u4 = blocks.durationMs;
  // Cross-check the watchdog against LoAF's UNSUBTRACTED duration, not against blockingDuration.
  // blockingDuration subtracts 50 ms per long task, so comparing it here tests a known constant
  // offset and can only produce false alarms or (as it did until 2026-08-08) silence: at 65.8 vs
  // 116.4 the ratio is 0.565, just above the 0.5 threshold, so the guard never fired while the two
  // sat on opposite sides of the 100 ms target line.
  const cmpLo = Math.min(d4, u4), cmpHi = Math.max(d4, u4);
  const disagree = cmpHi > 100 && (cmpLo < cmpHi * 0.5 || cmpHi - cmpLo > 60);
  out.smooth4 = {
    // Score on the watchdog and LoAF's unsubtracted duration. blockingMs is deliberately EXCLUDED
    // from the max: it is systematically low by 50 ms per task and would flatter the result.
    // This is a tightening, adopted 2026-08-08 after adjudication; it can only raise the number.
    longestBlockMs: r1(Math.max(d4, u4)),      // the honest number is the larger lower bound
    loafBlockingMs: r1(b4), watchdogDriftMs: r1(d4), loafDurationMs: r1(blocks.durationMs),
    longestFrameMs: out.smooth3.maxFrameMs,
    prePlayableBlockingMs: r1(blocks.prePlayableBlockingMs),
    blockCount: blocks.loafCountAfter,
    methodsDisagree: disagree || null,
    loafUnsupported: blocks.loafUnsupported,
    top: blocks.top,
  };

  // ---------------------------------------------------------------- SMOOTH-6 (b) : battle tap
  // A real touch, not element.click(). element.click() bypasses hit-testing and would happily
  // "succeed" against a 0x0 button or one buried under the boot cover, reporting a latency for a
  // tap the owner could never have made. tap() goes through the same dispatch a finger does, so if
  // the control is not really there and really on top, this fails loudly instead of lying.
  async function realTap(label, selector, root) {
    const loc = page.locator(selector).first();
    // Wait for the control to actually become tappable rather than sampling once: the shipped
    // controls are hidden while a dialogue is up (body.qok-dialogue #touch-controls{display:none}),
    // so a single early check reports "box null" for a button that is merely busy.
    let box = null;
    for (let i = 0; i < 40 && !box; i++) {
      box = await loc.boundingBox().catch(() => null);
      if (box && box.width >= 4 && box.height >= 4) break;
      box = null;
      await page.waitForTimeout(250);
    }
    if (!box) {
      const why = await page.evaluate((sel) => {
        const tc = document.getElementById('touch-controls');
        const el = document.querySelector(sel);
        return {
          bodyClass: document.body.className,
          touchControlsDisplay: tc ? getComputedStyle(tc).display : 'missing',
          elPresent: !!el,
          elRect: el ? el.getBoundingClientRect().toJSON() : null,
          coarse: matchMedia('(pointer: coarse)').matches,
        };
      }, selector).catch(() => null);
      return { label, unavailable: `${selector} never became tappable`, diagnosis: why };
    }
    await page.evaluate(([l, r]) => window.__perfArmTap(l, r), [label, root]);
    let err = null;
    await loc.tap({ timeout: 10_000 }).catch((e) => { err = e.message.split('\n')[0]; });
    await page.waitForTimeout(1200);
    const rec = await page.evaluate((l) => {
      const t = window.__PERF.taps.find((x) => x.label === l);
      window.__perfDisarmTap();
      return t || null;
    }, label);
    if (rec && err) rec.tapError = err;
    return rec || { label, unavailable: err || 'no record' };
  }

  // (b) battle command tap. The encounter is forced (startBattle) because a random encounter is
  // not deterministic; the TAP being measured is real, and how battle was entered cannot affect
  // how long the UI takes to answer a click once it is up.
  await page.evaluate((m) => {
    const w = window.__PHASER_GAME__.scene.getScene('WorldMapScene');
    w.currentEncounterZone = w.currentEncounterZone || 'plains';
    w.startBattle(m);
  }, MONSTER).catch(() => {});
  const inBattle = await page.waitForFunction(
    () => window.__PHASER_GAME__.scene.isActive('BattleScene')
      && document.querySelectorAll('[data-act="battleMenu"]').length > 0,
    { timeout: 20_000 },
  ).then(() => true).catch(() => false);

  if (inBattle) {
    await page.waitForTimeout(1000);
    // nth(1): not the already-selected first command, so the tap has to actually change something
    // for the MutationObserver to see it.
    taps.push(await realTap('battle-command', '[data-act="battleMenu"] >> nth=1', '#qok-ui'));
  } else {
    taps.push({ label: 'battle-command', unavailable: 'BattleScene / command rail not reached' });
  }

  const EXPECTED_TAPS = ['menu-open', 'battle-command'];
  const tapMs = taps.filter((t) => t && num(t.at) && num(t.respondedAt)).map((t) => t.respondedAt - t.at);
  const missing = EXPECTED_TAPS.filter((l) => !taps.some((t) => t && t.label === l && num(t.at) && num(t.respondedAt)));
  out.smooth6 = {
    menuOpenMs: r1((() => { const t = taps.find((x) => x && x.label === 'menu-open'); return t && num(t.at) && num(t.respondedAt) ? t.respondedAt - t.at : null; })()),
    battleCommandMs: r1((() => { const t = taps.find((x) => x && x.label === 'battle-command'); return t && num(t.at) && num(t.respondedAt) ? t.respondedAt - t.at : null; })()),
    // worstMs is a worst-OF, so it is only meaningful when BOTH taps were actually measured. When
    // one is missing it goes null (-> UNVERIFIED) instead of quietly reporting the surviving one:
    // the two differ by ~8x here (menu ~200 ms, battle ~25 ms), so a silent worst-of-one would
    // have reported SMOOTH-6 GREEN off the cheap tap alone while the expensive tap was unmeasured.
    worstMs: (missing.length === 0 && tapMs.length) ? r1(Math.max(...tapMs)) : null,
    missingTaps: missing.length ? missing : null,
    detail: taps.map((t) => (t && num(t.at)
      ? { label: t.label, tapAtMs: r1(t.at), domChangedMs: r1(t.mutatedAt), paintedMs: r1(t.respondedAt) }
      : t)),
  };

  out.loadAfter = load1();
  out.voidReason = [];
  out.warnings = [];
  // loadBefore is the void criterion: it describes the machine the run STARTED on, which is the
  // only load figure the probe did not create. loadAfter is reported and warned on but does NOT
  // void, because a run that does several seconds of 100%-CPU terrain work always raises it --
  // voiding on it would make a valid three-run baseline unobtainable no matter how quiet the Mac.
  if (out.loadBefore > LOAD_CEILING) {
    out.voidReason.push(`load average was ${out.loadBefore} (> ${LOAD_CEILING}) when the run started`);
  }
  if (out.loadAfter > LOAD_CEILING) {
    out.warnings.push(`load rose to ${out.loadAfter} during the run (includes the probe's own CPU use)`);
  }
  if (out.softwareRenderer) out.voidReason.push(`software renderer: ${out.renderer}`);
  if (!out.walk.moved) out.voidReason.push('hero did not move during the 10 s walk window');
  if (!out.entry.controlsVisible) out.voidReason.push('shipped touch controls were not displayed (coarse-pointer emulation failed)');
  if (out.smooth6.missingTaps) out.warnings.push(`SMOOTH-6 incomplete, taps not measured: ${out.smooth6.missingTaps.join(', ')}`);
  // If Continue was pressed while the cover was still in 'boot', SMOOTH-1 is measuring the cover's
  // 10 s TITLE_CAP rather than the game. That is an artefact, and it voids the run.
  if (out.coverStuckInBoot || out.smooth1.gates.coverPhaseAtContinue === 'boot') {
    out.voidReason.push('boot cover was still in phase "boot" at Continue: SMOOTH-1 would measure the 10 s TITLE_CAP, not the load');
  }
  if (out.smooth5.incomplete) out.voidReason.push(`map swap did not complete: ${out.smooth5.incomplete}`);
  if (out.smooth4.methodsDisagree) {
    out.voidReason.push(`SMOOTH-4 methods disagree: LoAF duration ${out.smooth4.loafDurationMs} ms vs watchdog ${out.smooth4.watchdogDriftMs} ms`);
  }

  if (!process.argv.includes('--keep-open')) await page.close();
  return out;
}

// ------------------------------------------------------------------------------------------------
// reporting
// ------------------------------------------------------------------------------------------------
function aggregate(runs) {
  const pick = (f) => spread(runs.map(f));
  return {
    'SMOOTH-1': {
      continueRelativeMs: pick((r) => r.smooth1.continueRelativeMs),
      loadRelativeMs: pick((r) => r.smooth1.loadRelativeMs),
      firstRealTerrainMs: pick((r) => r.smooth1.firstRealTerrainMs),
      gateTerrainMs: pick((r) => r.smooth1.gates.terrainMs),
      gateIconsReadyMs: pick((r) => r.smooth1.gates.iconsReadyMs),
      gateMapArtReadyMs: pick((r) => r.smooth1.gates.mapArtReadyMs),
      gateHeroVariantMs: pick((r) => r.smooth1.gates.heroVariantMs),
      gateCoverGoneMs: pick((r) => r.smooth1.gates.coverGoneMs),
    },
    'SMOOTH-2': { medianFps: pick((r) => r.smooth2.medianFps), meanFps: pick((r) => r.walk.meanFps) },
    'SMOOTH-3': {
      p99FrameMs: pick((r) => r.smooth3.p99FrameMs), p95FrameMs: pick((r) => r.smooth3.p95FrameMs),
      // p99 over ~200-400 frames is only the 2nd-4th worst frame, so it jumps depending on how
      // many frames the window happened to contain. These two are the stable companions.
      maxFrameMs: pick((r) => r.smooth3.maxFrameMs),
      framesOver100ms: pick((r) => r.walk.framesOver100ms),
    },
    'SMOOTH-4': {
      longestBlockMs: pick((r) => r.smooth4.longestBlockMs),
      loafBlockingMs: pick((r) => r.smooth4.loafBlockingMs),
      watchdogDriftMs: pick((r) => r.smooth4.watchdogDriftMs),
    },
    'SMOOTH-5': {
      intoTownMs: pick((r) => r.smooth5.intoTownMs),
      toOverworldMs: pick((r) => r.smooth5.toOverworldMs),
      worstMs: pick((r) => r.smooth5.worstMs),
    },
    'SMOOTH-6': {
      menuOpenMs: pick((r) => r.smooth6.menuOpenMs),
      battleCommandMs: pick((r) => r.smooth6.battleCommandMs),
      worstMs: pick((r) => r.smooth6.worstMs),
    },
    walk: {
      meanFps: pick((r) => r.walk.meanFps),
      framesOver100ms: pick((r) => r.walk.framesOver100ms),
      framesOver500ms: pick((r) => r.walk.framesOver500ms),
      worstFrameMs: pick((r) => r.smooth3.maxFrameMs),
    },
    diagnostics: {
      splatsBeforeTerrain: pick((r) => r.diagnostics.splatsBeforeTerrain),
      tileLayerObjects: pick((r) => r.diagnostics.tileLayerObjects),
      splatPx: runs[0] && runs[0].diagnostics.splatPx,
    },
  };
}

// The headline number for each target: the one the skill's table actually grades.
function headline(agg, id) {
  const a = agg[id];
  if (id === 'SMOOTH-1') return a.continueRelativeMs;
  if (id === 'SMOOTH-2') return a.medianFps;
  if (id === 'SMOOTH-3') return a.p99FrameMs;
  if (id === 'SMOOTH-4') return a.longestBlockMs;
  if (id === 'SMOOTH-5') return a.worstMs;
  if (id === 'SMOOTH-6') return a.worstMs;
  return null;
}

function verdict(id, v) {
  if (v === null || v === undefined || v.median === null) return 'UNVERIFIED';
  const t = TARGETS[id];
  return (t.dir === 'max' ? v.median <= t.limit : v.median >= t.limit) ? 'GREEN' : 'RED';
}

function table(label, agg, meta) {
  const L = [];
  L.push('');
  L.push(`  edu-rpg smoothness baseline — ${label}`);
  L.push(`  ${meta.url}   viewport ${meta.viewport.width}x${meta.viewport.height}`
    + (meta.canvas ? ` (dpr ${meta.dpr}, canvas ${meta.canvas[0]}x${meta.canvas[1]})` : '')
    + `   runs ${meta.runs}   touch emulation ON`);
  L.push(`  renderer: ${meta.renderer}`);
  L.push(`  load avg (1 min): ${meta.loads.join(', ')}   ceiling ${LOAD_CEILING}`);
  L.push('');
  L.push('  ID        metric                                    median      spread            target     ');
  L.push('  ' + '-'.repeat(96));
  for (const id of Object.keys(TARGETS)) {
    const t = TARGETS[id];
    const v = headline(agg, id);
    const med = v && v.median !== null ? `${v.median} ${t.unit}` : '—';
    const sp = v && v.median !== null ? `${v.min}–${v.max}` : '—';
    const tgt = `${t.dir === 'max' ? '<=' : '>='} ${t.limit} ${t.unit}`;
    L.push(`  ${id.padEnd(9)} ${t.label.padEnd(41)} ${med.padEnd(11)} ${sp.padEnd(17)} ${tgt.padEnd(10)} ${verdict(id, v)}`);
  }
  L.push('  ' + '-'.repeat(96));
  // Where the headline numbers come from. Several targets are a worst-of, and which half is bad
  // is the whole story: SMOOTH-5's town entry is fine and its return to the overworld is not.
  const sub = (t, v) => `  ${t.padEnd(34)} ${v && v.median !== null ? `${v.median}  (${v.min}–${v.max})` : '—'}`;
  L.push(sub('S1 first real terrain', agg['SMOOTH-1'].firstRealTerrainMs));
  L.push(sub('S1 gate held until: terrain', agg['SMOOTH-1'].gateTerrainMs));
  L.push(sub('S1 gate held until: iconsReady', agg['SMOOTH-1'].gateIconsReadyMs));
  L.push(sub('S1 gate held until: mapArtReady', agg['SMOOTH-1'].gateMapArtReadyMs));
  L.push(sub('S1 gate held until: heroVariant', agg['SMOOTH-1'].gateHeroVariantMs));
  L.push(sub('S1 gate: cover lifted', agg['SMOOTH-1'].gateCoverGoneMs));
  L.push(sub('S2 mean fps (vs median above)', agg['SMOOTH-2'].meanFps));
  L.push(sub('S3 worst single frame, ms', agg['SMOOTH-3'].maxFrameMs));
  L.push(sub('S3 frames > 100 ms in the walk', agg['SMOOTH-3'].framesOver100ms));
  L.push(sub('S4 LoAF blocking / watchdog', agg['SMOOTH-4'].loafBlockingMs));
  L.push(sub('S4 watchdog drift', agg['SMOOTH-4'].watchdogDriftMs));
  L.push(sub('S5 overworld -> town', agg['SMOOTH-5'].intoTownMs));
  L.push(sub('S5 town -> overworld', agg['SMOOTH-5'].toOverworldMs));
  L.push(sub('S6 menu open', agg['SMOOTH-6'].menuOpenMs));
  L.push(sub('S6 battle command', agg['SMOOTH-6'].battleCommandMs));
  L.push('  ' + '-'.repeat(96));
  const d = agg.diagnostics;
  L.push(`  diagnostics: ${d.splatsBeforeTerrain ? d.splatsBeforeTerrain.median : '—'} full procedural splats before real terrain`
    + ` (${d.splatPx ? d.splatPx.toLocaleString() + ' px each' : 'n/a'});`
    + ` ${d.tileLayerObjects ? d.tileLayerObjects.median.toLocaleString() : '—'} Phaser objects in the overworld tile container`);
  if (meta.voids.length) {
    L.push('');
    L.push('  ' + '!'.repeat(96));
    L.push('  !! RESULTS VOID — per the smooth skill these numbers must NOT be recorded:');
    for (const v of meta.voids) L.push(`  !!   ${v}`);
    L.push('  ' + '!'.repeat(96));
  }
  L.push('');
  return L.join('\n');
}

// ------------------------------------------------------------------------------------------------
// main
// ------------------------------------------------------------------------------------------------
function arg(name, dflt) {
  const i = process.argv.indexOf(name);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : dflt;
}

async function waitForServer(url, ms) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    try {
      const res = await fetch(url, { method: 'GET' });
      if (res.ok) return true;
    } catch (e) { /* not up yet */ }
    await new Promise((r) => setTimeout(r, 300));
  }
  return false;
}

(async () => {
  const runs = Number(arg('--runs', 3));
  const label = arg('--label', 'run');
  const vp = arg('--viewport', '960x720').split('x').map(Number);
  const viewport = { width: vp[0], height: vp[1] };
  const outFile = arg('--out', null);
  const serveDir = arg('--serve', null);
  const port = Number(arg('--port', 5174));
  const compare = arg('--compare', null);

  if (runs < 3) {
    console.error(`refusing --runs ${runs}: the smooth skill requires at least 3 runs per metric.`);
    process.exit(2);
  }

  // Optionally own the server for the measurement. Always serve_dist.py: a single-threaded server
  // serialises the ~19 MB of Act 1 chunk art and manufactures false timeouts that read as lag.
  let server = null;
  if (serveDir) {
    server = spawn('python3', [path.join(__dirname, 'serve_dist.py'), '--port', String(port), '--dir', serveDir],
      { cwd: path.join(__dirname, '..'), stdio: 'ignore', detached: false });
    if (!await waitForServer(`http://127.0.0.1:${port}/`, 20_000)) {
      server.kill(); console.error(`server did not come up on ${port}`); process.exit(1);
    }
  }
  const defaultUrl = `http://127.0.0.1:${serveDir ? port : 5174}/`;

  // Targets: one label -> url, or several interleaved.
  const targets = compare
    ? compare.split(',').map((p) => { const [l, u] = p.split('='); return { label: l, url: u }; })
    : [{ label, url: arg('--url', defaultUrl) }];

  for (const t of targets) {
    if (!await waitForServer(t.url, 10_000)) {
      if (server) server.kill();
      console.error(`\n${t.url} is not reachable.\nStart it with:  python3 scripts/serve_dist.py --port 5174\n`
        + '(serve_dist.py specifically — npx serve and a single-threaded http.server both stall the Act 1 chunk art.)');
      process.exit(1);
    }
  }

  // NOTE: launched WITHOUT an ANGLE override so Chrome picks the real GPU. See the header: forcing
  // SwiftShader here understates frame rate by ~16x and would make SMOOTH-2/3 pure fiction.
  //
  // Also deliberately WITHOUT --disable-frame-rate-limit. Uncapping rAF would let a cheap frame
  // report 200 fps, which measures headroom, not smoothness, and would make the p99 frame-time
  // target meaningless. The phone is vsync-capped at 60; so is this.
  const browser = await chromium.launch({
    headless: !process.argv.includes('--headed'),
    channel: 'chrome',
    args: ['--enable-webgl', '--ignore-gpu-blocklist', '--mute-audio'],
  });

  const startLoad = load1();
  if (startLoad > LOAD_CEILING) {
    console.error('\n' + '!'.repeat(96));
    console.error(`!! LOAD AVERAGE ${startLoad} EXCEEDS ${LOAD_CEILING} BEFORE THE FIRST RUN.`);
    console.error('!! Per the smooth skill, numbers taken above this are VOID. Wait for the machine to settle.');
    console.error('!'.repeat(96) + '\n');
  }

  // Interleaved A,B,A,B,... so a machine that warms or cools mid-sequence biases both sides equally.
  const byLabel = Object.fromEntries(targets.map((t) => [t.label, []]));
  const settleAt = Number(arg('--settle', String(LOAD_CEILING * 0.7)));
  for (let i = 0; i < runs; i++) {
    for (const t of targets) {
      await settle(settleAt, true);
      process.stderr.write(`  [${t.label}] run ${i + 1}/${runs} (load ${load1()}) ... `);
      const r = await measureOnce(browser, t.url, viewport, i + 1);
      byLabel[t.label].push(r);
      process.stderr.write(`S1 ${r.smooth1.continueRelativeMs}ms  S2 ${r.smooth2.medianFps}fps  `
        + `S3 ${r.smooth3.p99FrameMs}ms  S4 ${r.smooth4.longestBlockMs}ms  `
        + `S5 ${r.smooth5.worstMs}ms  S6 ${r.smooth6.worstMs}ms\n`);
    }
  }
  await browser.close();
  if (server) server.kill();

  const report = { generatedAt: new Date().toISOString(), viewport, runs, targets: TARGETS, results: {} };
  for (const t of targets) {
    const rs = byLabel[t.label];
    const agg = aggregate(rs);
    const voids = [...new Set(rs.flatMap((r) => r.voidReason))];
    const loads = rs.flatMap((r) => [r.loadBefore, r.loadAfter]);
    report.results[t.label] = {
      url: t.url, aggregate: agg, runs: rs, voids,
      loadAvg: { min: Math.min(...loads), max: Math.max(...loads), all: loads },
      renderer: rs[0] && rs[0].renderer,
      verdicts: Object.fromEntries(Object.keys(TARGETS).map((id) => [id, verdict(id, headline(agg, id))])),
    };
    console.log(table(t.label, agg, {
      url: t.url, viewport, runs, loads, voids, renderer: rs[0] && rs[0].renderer,
      dpr: rs[0] && rs[0].entry.dpr, canvas: rs[0] && rs[0].entry.canvasSize,
    }));
  }

  if (outFile) {
    fs.writeFileSync(outFile, JSON.stringify(report, null, 2));
    console.log(`  full JSON -> ${outFile}\n`);
  } else {
    console.log(JSON.stringify(report, null, 2));
  }
})().catch((e) => { console.error('PROBE FAILED\n', e.stack || e); process.exit(1); });
