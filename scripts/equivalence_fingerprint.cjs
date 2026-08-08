#!/usr/bin/env node
/* Behavioural fingerprint of a BUILT edu-rpg tree.
 *
 * WHY THIS EXISTS
 *   The shipped bundle was hand-edited after compilation (docs/SOURCE-BUNDLE-DRIFT.md), so the
 *   tracked source cannot currently be recompiled into the running game. A previous attempt to
 *   rebuild from source BROKE the game: the reconstruction silently dropped code that existed
 *   only in the bundle, and nothing caught it until the game visibly failed.
 *
 *   The missing ingredient was never the rebuild. It was a way to tell a good reconstruction from
 *   a bad one BEFORE shipping it. That is this file.
 *
 *   It emits a set of hashes that describe what the game IS, not how it was made:
 *   the world's collision shape, its map data, the painted terrain and canopy textures, the Act 1
 *   plate, the display-object counts, and the presence of the three bundle-only globals whose
 *   absence is exactly what broke the last attempt. Two builds that agree on all of it are the
 *   same game, however they were produced.
 *
 * HOW TO USE IT
 *   1. Record the reference from the frozen, known-good build:
 *        node scripts/equivalence_fingerprint.cjs --out docs/EQUIVALENCE-REFERENCE.json
 *   2. Against any candidate rebuild:
 *        node scripts/equivalence_fingerprint.cjs --check docs/EQUIVALENCE-REFERENCE.json
 *      Non-zero exit means the candidate is NOT the same game. The report names which field moved.
 *
 * WHAT IT DELIBERATELY DOES NOT DO
 *   No timing. Every value here is a hash or a count, so the result is independent of machine load
 *   — unlike scripts/perf_probe.cjs, whose numbers are void above load 10. Run this whenever.
 *
 * VIEWPORT SENSITIVITY -- READ BEFORE COMPARING TWO RUNS
 *   dqterrain/dqcanopy are painted to fit the camera, so their hash AND their dimensions depend on
 *   the viewport. This script pins 960x720, which yields 1920x1824. Agents measuring at other
 *   viewports recorded 2112x1824 with different hashes; those are not disagreements, they are
 *   different questions. Always compare a candidate against a reference captured at the SAME
 *   viewport, or the texture rows will false-fail while the game is perfectly correct.
 *   canMove, blocked, and mapData are viewport-INDEPENDENT and are the stronger fields.
 *
 * WHAT IT DOES NOT VERIFY -- SAY THIS OUT LOUD WHEN QUOTING A PASS
 *   RENDERING. `renderedSignature` is informational only; see the long note at the comparison site
 *   for the three designs that were tried and why each failed. A PASS here means the world data,
 *   the collision shape, the display-object counts, the DOM UI and the bundle-only globals match.
 *   It does NOT mean the game looks the same. Prove that separately, per change.
 *
 * WHAT IT CANNOT SEE (be honest about the gaps when quoting it)
 *   Battle balance, quiz content, audio, save migration, and anything reachable only deeper than
 *   the Act 1 overworld and its first doors. A PASS here means "the world and the interface are
 *   the same", not "the whole game is the same".
 */

const { createHash } = require('node:crypto');
const { readFileSync, writeFileSync } = require('node:fs');
const { resolve } = require('node:path');

let chromium;
try { ({ chromium } = require('playwright-core')); }
catch (_) { ({ chromium } = require('../.eduharness/node_modules/playwright-core')); }

const args = process.argv.slice(2);
const flag = (name, dflt) => { const i = args.indexOf(name); return i < 0 ? dflt : args[i + 1]; };
const URL = flag('--url', 'http://127.0.0.1:5174/');
const OUT = flag('--out', null);
const CHECK = flag('--check', null);

const sha = (s) => createHash('sha256').update(s).digest('hex').slice(0, 16);

(async () => {
  // channel:'chrome' uses the installed Google Chrome, matching scripts/perf_probe.cjs. The
  // downloaded playwright browser is NOT installed on this machine, and more importantly the
  // bundled headless shell falls back to SwiftShader, which perf_probe's header records as
  // reporting 3.8 fps against the real GPU's 61. Hashes would still be correct, but keeping the
  // two harnesses on one renderer means a texture hash taken here is comparable to one taken there.
  const browser = await chromium.launch({ channel: 'chrome', args: ['--use-gl=angle', '--enable-gpu'] });
  const page = await browser.newPage({ viewport: { width: 960, height: 720 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  // Seed a save BEFORE first load, exactly as scripts/browser_runtime_smoke.cjs does. Without it
  // the title screen offers no "continue" action, the game never leaves the menu, and the terrain
  // gate waits forever -- which is how this script failed on its first run. The save deliberately
  // starts on the OVERWORLD: the fields below describe the Act 1 world, and entering anywhere else
  // would fingerprint a different map.
  const SAVE = {
    version: 4, timestamp: 0,
    player: {
      name: 'Fingerprint', heroColor: 'gray', level: 5, exp: 0, expToNext: 100,
      hp: 40, maxHp: 40, atk: 15, def: 5, spd: 6,
      equipment: { weapon: null, armor: null, shield: null, helmet: null, accessory: null },
      inventory: [], gold: 200,
      position: { mapId: 'overworld', x: 69, y: 257, floor: 1 },
      storyFlags: {}, activeQuests: [], completedQuests: [], questProgress: {},
      timerEnabled: true, quizDifficulty: '3', locale: 'en', soundEnabled: false,
      masterVolume: 0, kanjiMode: false,
    },
    playtime: 0, quizStats: {},
  };
  await page.addInitScript((save) => {
    try { localStorage.setItem('edu-rpg-save', JSON.stringify(save)); } catch (_) {}
  }, SAVE);
  await page.goto(URL, { waitUntil: 'domcontentloaded' });

  // Enter the saved game the same way scripts/browser_runtime_smoke.cjs does, then wait for the
  // terrain gate rather than a timeout -- __DQ_TILES__.ready() is the runtime's own definition of
  // "real terrain is on screen", and a timeout would fingerprint the placeholder.
  // Entry sequence copied verbatim from scripts/browser_runtime_smoke.cjs, which is the only
  // sequence in this repo known to work. Two details cost this script two failed runs: the boot
  // scene must be handed off to TitleScene explicitly, and the confirm method is confirmTitle(),
  // not confirmSelection(). Do not "simplify" this block.
  await page.waitForFunction(() => !!window.__PHASER_GAME__, { timeout: 20000 });
  await page.evaluate(() => {
    const game = window.__PHASER_GAME__;
    if (game.scene.isActive('BootScene')) { game.scene.start('TitleScene'); game.scene.stop('BootScene'); }
  });
  await page.waitForFunction(() => {
    const g = window.__PHASER_GAME__;
    const t = g && g.scene.getScene('TitleScene');
    return t && g.scene.isActive('TitleScene') && t.menuItems?.length > 0;
  }, { timeout: 20000 });
  await page.evaluate(() => {
    const t = window.__PHASER_GAME__.scene.getScene('TitleScene');
    const i = t.menuItems.findIndex((m) => m.getData?.('action') === 'continue');
    if (i < 0) throw new Error('continue action is unavailable');
    t.selectedIndex = i; t.confirmTitle();
  });
  await page.waitForFunction(() => window.__PHASER_GAME__.scene.isActive('WorldMapScene'), { timeout: 30000 });
  // Then wait for REAL terrain, not the procedural placeholder: __DQ_TILES__.ready() is the
  // runtime's own definition of "baked art is on screen".
  await page.waitForFunction(
    () => { const t = window.__DQ_TILES__; return t && t.ready && t.ready(); },
    { timeout: 180000 },
  );

  const fp = await page.evaluate(async () => {
    const fnv = (bytes) => { let h = 0x811c9dc5; for (let i = 0; i < bytes.length; i++) { h ^= bytes[i]; h = Math.imul(h, 0x01000193) >>> 0; } return h.toString(16).padStart(8, '0'); };
    const texHash = (key) => {
      const g = window.__PHASER_GAME__;
      const src = g.textures.exists(key) && g.textures.get(key).getSourceImage();
      if (!src) return null;
      const c = document.createElement('canvas');
      c.width = src.width; c.height = src.height;
      c.getContext('2d').drawImage(src, 0, 0);
      const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
      return `${fnv(d)}@${c.width}x${c.height}`;
    };
    const g = window.__PHASER_GAME__;
    const sc = g.scene.getScenes(true).find((s) => s.currentMapId === 'overworld');
    // THE OUTCOME CHECK. dqterrain/dqcanopy are intermediate buffers, and round 5 legitimately
    // deleted dqterrain by moving the baked chunks onto their own GPU textures -- the game was
    // pixel-identical and this file still reported EQUIVALENCE FAIL, because it was hashing how
    // the picture is made rather than the picture. Same failure shape as scoring SMOOTH-4 on
    // LoAF blockingDuration. So hash what the player sees. Animations and tweens are paused and
    // the hero hidden first, because a sprite's animation phase and the HUD clock are legitimately
    // free to differ between two runs of the same game.
    let renderedFrame = null;
    // NOTE ON HOW THIS IS READ, because the first version of it was VACUOUS and shipped that way.
    // It called g.renderer.snapshot() and then read g.canvas directly. With preserveDrawingBuffer
    // off -- Phaser's default -- the WebGL back buffer is already cleared by the time you read it,
    // so that produced a FULLY BLACK 768x672 image every time, mean luminance 0.00. The sanity
    // check sampled only the ALPHA channel, which is opaque even when the colour is black, so it
    // never fired. It was proven vacuous by running it against a build with a deliberately broken
    // canopy: identical hash. It therefore "verified" nothing, on any build.
    // The fix is to use snapshot's CALLBACK, which is the supported way to get pixels out, and to
    // check LUMINANCE rather than alpha so an all-black read fails loudly instead of silently.
    renderedFrame = await new Promise((resolve) => {
      const done = (v) => resolve(v);
      const timer = setTimeout(() => done('TIMEOUT'), 15000);
      try {
        g.scene.getScenes(true).forEach((s) => { try { s.tweens?.pauseAll(); s.anims?.pauseAll?.(); } catch (_) {} });
        const hero = sc && (sc.hero || sc.player || sc.heroSprite);
        if (hero) hero.visible = false;
        g.renderer.snapshot((image) => {
          clearTimeout(timer);
          try {
            const off = document.createElement('canvas');
            off.width = image.width; off.height = image.height;
            const c2 = off.getContext('2d');
            c2.drawImage(image, 0, 0);
            const px = c2.getImageData(0, 0, off.width, off.height).data;
            let lum = 0, n = 0;
            for (let i = 0; i < px.length; i += 4000) { lum += (px[i] + px[i + 1] + px[i + 2]) / 3; n++; }
            const mean = n ? lum / n : 0;
            if (hero) hero.visible = true;
            // An all-black or near-black read means the capture failed, NOT that the game is dark.
            // A full-frame HASH is sensitive but NOT stable here: water shimmer and the HUD clock
            // keep moving even with tweens and animations paused, so two runs of the identical build
            // disagree. Measured, not assumed. So emit a COARSE STRUCTURAL SIGNATURE instead: mean
            // luminance over a 16x14 grid, which is invariant to a few pixels of animation phase but
            // collapses immediately if terrain stops drawing (hiding 15 terrain objects moved mean
            // luminance 83.2 -> 21.3). Compared with a per-cell tolerance, not for equality.
            const GX = 16, GY = 14, cw = off.width / GX, ch = off.height / GY, sig = [];
            for (let gy = 0; gy < GY; gy++) for (let gx = 0; gx < GX; gx++) {
              const x0 = Math.floor(gx * cw), y0 = Math.floor(gy * ch);
              let acc = 0, cnt = 0;
              for (let y = y0; y < y0 + ch; y += 4) for (let x = x0; x < x0 + cw; x += 4) {
                const i = (y * off.width + x) * 4;
                acc += (px[i] + px[i + 1] + px[i + 2]) / 3; cnt++;
              }
              sig.push(Math.round(cnt ? acc / cnt : 0));
            }
            done(mean < 2 ? `UNREADABLE(mean=${mean.toFixed(2)})` : sig.join(','));
          } catch (e) { done('ERROR:' + String(e).slice(0, 50)); }
        });
      } catch (e) { clearTimeout(timer); done('ERROR:' + String(e).slice(0, 50)); }
    });

    // Collision shape: the authority for where the player may walk. This is the single most
    // valuable field here -- world generation moving by even one cell changes it.
    let canMove = null, blocked = 0;
    if (sc && typeof sc.canMove === 'function') {
      const w = sc.mapData[0].length, h = sc.mapData.length;
      const bits = [];
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const ok = !!sc.canMove(x, y); if (!ok) blocked++; bits.push(ok ? 1 : 0); }
      canMove = fnv(Uint8Array.from(bits));
    }
    const mapHash = sc ? fnv(Uint8Array.from(sc.mapData.flat())) : null;

    return {
      canMove, blocked, mapData: mapHash, renderedSignature: renderedFrame,
      dqterrain: texHash('dqterrain'), dqcanopy: texHash('dqcanopy'),
      tileLayerObjects: sc && sc.tileLayer ? sc.tileLayer.length : null,
      // The three bundle-only globals. Their ABSENCE is precisely what broke the last rebuild:
      // ui-overhaul.js disables the entire DOM interface when __QOK is missing, silently.
      has__QOK: typeof window.__QOK !== 'undefined',
      has__tapItems: typeof window.__tapItems !== 'undefined',
      // NOT wireSceneTaps: the first draft checked it and it is always false, because it lives
      // inside the appended IIFE's own scope rather than on window. The third bundle-only global
      // per docs/SOURCE-BUNDLE-DRIFT.md is __setControlOrientation, which index.html defines and
      // the bundle CALLS -- the dependency runs the other way, so a rebuild that drops the call
      // sites breaks the settings toggle silently.
      has__setControlOrientation: typeof window.__setControlOrientation !== 'undefined',
      domUI: !!document.getElementById('qok-ui'),
      mapId: sc ? sc.currentMapId : null,
    };
  });

  fp.pageErrors = errors.length;
  await browser.close();

  const bundle = createHash('md5').update(readFileSync(resolve(__dirname, '../dist/assets/index-BhoGQRaA.js'))).digest('hex');
  fp.bundleMd5 = bundle;

  if (OUT) { writeFileSync(OUT, JSON.stringify(fp, null, 2) + '\n'); console.log(`FINGERPRINT WRITTEN: ${OUT}`); }
  console.log(JSON.stringify(fp, null, 2));

  if (CHECK) {
    const ref = JSON.parse(readFileSync(CHECK, 'utf8'));
    // bundleMd5 is reported but NOT compared: a legitimate recompile changes it by definition.
    // Everything else describes behaviour and must match.
    // bundleMd5 is reported but not compared: a legitimate recompile changes it by definition.
    // dqterrain/dqcanopy are likewise INFORMATIONAL -- they are intermediate buffers, and an
    // implementation may legitimately stop using one (round 5 did exactly that). renderedFrame
    // is the field that actually answers "is this the same game to a player".
    const INFORMATIONAL = new Set(['bundleMd5', 'dqterrain', 'dqcanopy']);
    // renderedSignature compares with a per-cell tolerance rather than for equality, for the
    // reason documented at its capture site. TOL is deliberately tight: a genuine rendering
    // failure moves cells by tens, animation phase by a couple.
    // INFORMATIONAL, not a gate. Three designs were tried and none was both stable and sensitive:
    //   1. hash of g.canvas after snapshot()   -> VACUOUS. preserveDrawingBuffer is off, so it read
    //      a fully black frame every time and returned the same hash for a build with a visibly
    //      broken canopy. It "verified" nothing on any build, and shipped that way for one commit.
    //   2. hash of the snapshot() callback image -> sensitive (hiding 15 terrain objects moved mean
    //      luminance 83.2 -> 21.3) but UNSTABLE: two runs of the identical build disagreed.
    //   3. this coarse 16x14 luminance grid    -> mostly stable, but the same build still disagreed
    //      by 41 at one cell against a tolerance of 8, because chunks settle at slightly different
    //      times between runs.
    // So rendering equivalence is NOT covered by this gate, and pretending otherwise would give a
    // flaky failure that people learn to ignore -- worse than an admitted gap. The delta is printed
    // so a human can look, and a real visual-regression check needs a settled-state protocol
    // (wait until no chunk has arrived for N ms) which is its own piece of work.
    const TOL = 8;
    const diffs = Object.keys(ref).filter((k) => {
      if (INFORMATIONAL.has(k) || k === 'renderedSignature') return false;
      return String(ref[k]) !== String(fp[k]);
    });
    if (ref.renderedSignature && fp.renderedSignature) {
      const a = String(ref.renderedSignature).split(','), b = String(fp.renderedSignature).split(',');
      if (a.length !== b.length || String(fp.renderedSignature).startsWith('UNREADABLE')) {
        console.warn('  note: renderedSignature unreadable or reshaped (informational)');
      } else {
        let worst = 0, at = -1;
        for (let i = 0; i < a.length; i++) { const d = Math.abs(+a[i] - +b[i]); if (d > worst) { worst = d; at = i; } }
        console.log(`  renderedSignature: worst cell delta ${worst} (tolerance ${TOL}) at cell ${at}`);
        if (worst > TOL) console.warn(`  note: renderedSignature moved by ${worst} (informational, not a failure - see the header)`);
      }
    }
    for (const k of INFORMATIONAL) {
      if (k !== 'bundleMd5' && ref[k] !== undefined && String(ref[k]) !== String(fp[k])) {
        console.warn(`  note: ${k} changed (informational, not a failure): ${ref[k]} -> ${fp[k]}`);
      }
    }
    if (diffs.length) {
      console.error('\nEQUIVALENCE FAIL: this is not the same game. Fields that moved:');
      for (const k of diffs) console.error(`  ${k}: reference ${ref[k]}  ->  candidate ${fp[k]}`);
      process.exit(1);
    }
    console.log('\nEQUIVALENCE PASS: candidate matches the reference on every behavioural field.');
  }
})().catch((e) => { console.error(e); process.exit(1); });
