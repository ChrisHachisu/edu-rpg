#!/usr/bin/env node

/**
 * Derive the shipped static shell `dist/index.html` from the TRACKED root `index.html`.
 *
 * WHY THIS EXISTS
 *     `dist/` is gitignored, so for a long time the shipped shell existed in exactly one
 *     place -- an ignored directory, propagated between worktrees by copying. b050db8 fixed
 *     the source half of that ("build: the shipped shell had no tracked source"): root
 *     index.html became the authored shell, and `dist/index.html` is that file with seven
 *     path rewrites applied. What was still missing is the BUILD half -- nothing in the repo
 *     actually performed the derivation, so a fresh worktree had no way to produce the shell
 *     and fell back to copying one from a sibling. That is how a stale vintage travels.
 *
 * THE FAILURE MODE THIS CLOSES
 *     `scripts/runtime_baseline.py hydrate` writes a BASELINE index.html into dist/ -- an old
 *     14414-byte vintage that predates the analog-stick shell. It looks plausible and the game
 *     boots, so nothing obviously breaks. Worse, `scripts/regenerate_pins.py` resolves the
 *     `index.html` pin by falling back to `dist/` (there is no `public/index.html`), so running
 *     it against a stale hydrated dist SILENTLY re-pins the shell to that stale vintage -- after
 *     which every downstream identity check in the gate agrees with the wrong file.
 *
 *     So the shell cannot be verified against the pins; the pins are downstream of it. It has to
 *     be verified against the TRACKED source, which is what `--check` does. That check is immune
 *     to a poisoned pin, and it is branch-correct by construction: each branch derives its own
 *     shell from its own tracked index.html rather than from a hardcoded hash that only ever
 *     matches one branch.
 *
 * WHY THE GATE'S OLD SHELL CHECK WAS VACUOUS
 *     `ship-gate.sh` compared `dist/index.html` against `ios/App/App/public/index.html`. Both are
 *     gitignored (.gitignore:2, ios/.gitignore:4), so that only ever proved the two LOCAL copies
 *     agreed with each other. Measured 2026-08-07: three worktrees carried three different shells
 *     (14414, 15094, 15479 bytes) and all three passed the gate, each internally self-consistent.
 *     A check whose both sides are untracked cannot detect drift; it has to reach a tracked file.
 *
 * SINGLE SOURCE OF TRUTH
 *     The seven rewrites AND the shell's expected identity live here and nowhere else.
 *     `scripts/export_act1_preserved_cutover.mjs` imports both rather than keeping a second copy;
 *     two copies of a transform this exact is precisely how the shell drifted in the first place.
 *     The dependency points this way because the exporter is a top-level SCRIPT -- importing it
 *     would run the whole r26 cutover as a side effect -- so it cannot be the module others read.
 *
 *     build_static_index.mjs            write dist/index.html from root index.html
 *     build_static_index.mjs --check    exit 1 if dist/index.html is not that derivation
 */

import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/**
 * Identity of the derived shell. Moved here from export_act1_preserved_cutover.mjs (2026-08-07)
 * so the constant has ONE home: the exporter now imports it, and the ship gate checks against it.
 *
 * This is a deliberate pin, not derived data -- do NOT "fix" a mismatch by pasting in whatever is
 * on disk. If the authored shell genuinely changed, the diff to root index.html is the review, and
 * updating this line is the sign-off. Note this is exactly the pin that
 * `scripts/regenerate_pins.py` CANNOT be trusted to maintain: there is no `public/index.html`, so
 * its resolver falls back to `dist/`, and against a stale hydrated dist it silently re-pins the
 * shell to the wrong vintage. Keeping the authority in a tracked file the generator does not
 * rewrite is the point.
 */
// 2026-08-07: 29b0c698... -> 22d99202..., 15479 B -> 23956 B. The shell gained #boot-cover -- its
// markup, its styles and the two-gate controller that lifts it. Gate 1 replaces the black screen
// while BootScene loads 75 images and waits out its hardcoded 400 ms; gate 2 covers the world load,
// where the DOM HUD used to arrive complete over unpainted terrain, a lattice minimap and an
// undecoded tab-icon sheet (owner device capture, same day). Reviewed as a diff to index.html;
// this line is the sign-off.
//
// 2026-08-09: 22d99202... -> b4d8cc5a..., 23956 B -> 46401 B. The shell gained the memory-kill
// RECOVERY module (heartbeat + safe-state resume snapshot + loop guard + recovery counter), and
// two small edits to the boot cover so a recovery is covered end to end instead of flashing the
// title on the way past. This is a SAFETY NET for the WebContent-process kill that sends the
// owner's iPhone 13 back to the title on an encounter; it fixes nothing about the memory spike
// itself, and the count it keeps in `edu-rpg-recovery` is deliberately there so the defect cannot
// hide behind it. Reviewed as a diff to index.html; this line is the sign-off.
//
// 2026-08-09: b4d8cc5a... -> 5c2492d5..., 46401 B -> 49529 B. COMMENTS ONLY -- no executable byte
// of the recovery module changed, and the diff is two comment blocks. They record the measurement
// that refuted the freeze diagnosis (the 2 s localStorage pair costs ~7 microseconds; the A/B puts
// worst frame at 46 ms median without the module and 43 ms with it) and the measured 5.1 s dark
// gap a real WebContent kill costs the player. Written into the source per docs/GROUND-TRUTH.md's
// rule that a refuted claim is struck where it lives, not in a new document -- the next reader of
// this timer would otherwise "fix" it again. Reviewed as a diff to index.html; this is the sign-off.
// 2026-08-09: 5c2492d5... -> fab17fb9..., 49529 B -> 63508 B. ONE behavioural variable: the
// recovery net's 2 s setInterval no longer runs while the hero is walking. The snapshot moved to
// scene edges (battle/menu pause, resume, wake, map or floor create) plus the moment the thumb
// comes off the stick, and the timer that remains is cleared for the duration of every walk and
// restarted when it ends. The beacon therefore carries a new `mv` flag and gets a widened
// staleness window (FRESH_WALK_MS) when it was stamped at the start of a walk; the `vis` test
// that separates a kill from a force-quit is untouched, as are the loop guard, the counter, the
// toast and the restore path. This is deliberately an EXPERIMENT: the simulator says these writes
// cost ~7 microseconds, that measurement stands, and it is a simulator number -- the owner's
// iPhone 13 is the instrument that settles whether they are his freezes. The rest of the diff is
// comment: the claim that the freezes were really recoveries is struck where it lived, because he
// confirmed there is no toast on screen when they happen. Reviewed as a diff to index.html; this
// line is the sign-off. The scene hooks are armed by a bounded rAF loop at boot rather than by the
// first idle tick, and the FIRST walk still takes a snapshot: without either, a player who walks
// the instant the world appears had no restore point at all. Both were found by the harness, not
// by reading, which is why the harness counts setItem at the prototype and not in the module.
// The WorldMapScene pause/sleep edge also stands the hero down, so an encounter that fires while
// the thumb is still on the stick cannot carry the stopped timer and the widened window through
// the whole battle -- the kill-during-a-battle case keeps its 2 s beacon and 20 s window exactly.
//
// 2026-08-09: fab17fb9... -> 533f125a..., 63508 B -> 81844 B. THE BLACK BOX, on the owner's own
// suggestion: "why don't you build in an error message that displays depending on the error type
// on my phone? i can tell you the exact error message so you can pinpoint the issue." The page now
// records webglcontextlost, window.onerror, unhandledrejection, page lifecycle and a 20-entry
// breadcrumb ring, persists them across its own death, and on the next recovery boot shows a
// dismissable PANEL naming the class in plain words plus a short code (QOK-<CLASS>-<NNNN>) he can
// read down a phone line. No periodic work is added: breadcrumbs live in memory and reach storage
// only on the scene edges the resume snapshot already uses, errors write immediately because they
// are rare, and there is no timer in the module. The "no error recorded" class is a real finding,
// not a fallback. Reviewed as a diff to index.html; this line is the sign-off.
//
// 2026-08-11: 533f125a... -> f42b8d92..., 81844 B -> 95499 B. THE LIVE DIAGNOSTIC PANEL,
// because the owner's phone is the only instrument that has ever seen the periodic overworld freeze.
// A full profiling investigation (docs/TIMER-ATTRIBUTION.md) eliminated every candidate measurable
// here -- the four permanent timers cost ~285 ms across 60 s of walking, the minimap render
// 0.04-0.10 ms a draw, fresh-chunk image decode is a ONE-TIME warm-up rather than a per-chunk tax,
// and ZERO of ~3,598 sampled frames exceeded 33 ms. It does not reproduce in Chrome on an M-series
// Mac and has never reproduced on a simulator.
//
// Built to the owner's own instruction: "build in a persistent screen display of what is happening
// in the background while i move around ... i can take a screen shot and share that with you". A
// bottom-left panel shows, live: fps, the worst frame of the last 500 ms, map id (+floor), hero
// tile, whether the hero is MOVING, texture count, the chunk/bake state from readyWhy(), and the
// last three long frames WITH THE SECONDS BETWEEN THEM, each naming its SCREEN -- that gap field is the point, since it is
// what turns "it freezes sometimes" into a measurable period. One screenshot carries the story.
//
// IT ADDS PERIODIC WORK, AND SAYING OTHERWISE WOULD BE THE BUG. An earlier draft of this sign-off
// claimed "no periodic work is added"; that was FALSE and an adversarial review caught it. The truth:
// a 2 Hz display tick reads cheap scene state and writes textContent only when the text changed, and
// the expensive reads (Object.keys over the whole texture list, readyWhy + JSON.stringify) are
// sampled at 0.5 Hz. The per-frame path is one compare and one increment. That is small, and it is
// still 4x the cadence of the 2 s timer deliberately removed from the walk, and it is UNMEASURED on
// the iPhone 13. So: if freezes persist on this build, THIS PANEL IS ITSELF A SUSPECT and must not be
// excluded by a future reader. localStorage writes are rate-limited to one per 5 s because an
// unthrottled write fires right after a long frame, lands inside the next measured gap, and can trip
// the next detection -- slow device storage being the one hypothesis the simulator could not clear.
//
// Guards, every one of them learned from a defect in an earlier draft of this same module. ARMING:
// recording starts only once the map is playable (mapArtReady + WorldMapScene active, the boot
// cover's own test) plus a 3 s grace, RE-ARMED on every map change -- the first run logged 6 events
// topping out at 1614 ms before the hero had moved, which was the loader, and door/town/floor
// transitions run create() again and are expected to be slow. WAKE: the first frame after any
// visibility change is dropped UNCONDITIONALLY, not merely within a time window -- rAF stops while
// hidden, and a window fails open on exactly the memory-pressured device this is built for, pinning
// a bogus ~600000 ms as the worst-ever number the owner reads out. PLACEMENT: bottom + 256px clears
// the analog stick's full 172 px height, because `applyOrientation` moves that stick LEFT, centre or
// right and at ctrl-left the knob centre sat inside an earlier placement. POINTER-EVENTS:NONE
// because that draft was tappable and at ~250pt wide swallowed taps aimed at the game -- a
// diagnostic must never eat the input of the thing it is diagnosing. Events carry a SESSION marker
// so a reload is visible in the log rather than reading as time travel.
// Reviewed as a diff to index.html by a fresh adversarial agent; this line is the sign-off.
//
// 2026-08-11 — panel gains ONE line: `sp<n> cv<n> tx2·<n> pl<0|1>`, read from
// __DQ_TILES__.cost(). Signed off because the panel's whole purpose is that his phone is the only
// instrument that has seen the freeze, and "freezes 15, worst 1220ms" detects without attributing.
// A window-step stall has three candidates that are indistinguishable by duration -- the analytic
// splat, a 1536x1536 canopy composite, a chunk texture upload -- and `pl` guards the failure mode
// that would most look like a fix: sp0 because the Act 1 override never applied, rather than
// because the splat was suppressed. Read-only counters; no new timer, no new storage write; the
// values are already gathered on the existing HEAVY_MS tick beside `tex`, so this adds no work to
// the frame it measures. The panel remains a suspect in its own right -- see the note above.
//
// Same day, second line: `wb <ms> <what>` -- the worst SINGLE operation and its name. Signed off
// because counts turned out not to be enough: throttling the texture builds to one per tick left
// the window-step stall where it was (853/893 ms after, 661/939 ms before), and the counters
// refuted the obvious story themselves -- 24 builds and 8 composites in a session that produced
// only two long frames, so it is not that every build is dear. One of them is, and a stopwatch on
// the individual operation is the only thing that can name which. The timers wrap operations that
// already run; they add two performance.now() calls each and nothing else.
//
// Same day, third line: `owm <ms> <src>`. Not a new measurement -- dq-tiles.js has always timed the
// collision-window rebuild and published it on window.__DQ_OWM__, calling it "the one thing in the
// overworld that can drop a frame"; nothing surfaced it where the freeze log could be read beside
// it. Needed because the stopwatch refuted the texture theory too: a 684 ms stall was recorded in a
// session whose worst single terrain operation was 87 ms, so the cost is outside the terrain path
// entirely, and the collision window rebuilds on the same 12-cell boundary. Pure read of an existing
// global; worst-seen rather than last, because a rebuild is over before the next sample lands.
//
// 2026-08-13: `spr <live>/<want> fix<N>`. The blue screen has now outlived TWO confident diagnoses
// -- the a1vShow visibility latch, then GPU-context bookkeeping -- and the owner reported it again
// on the build that was meant to fix it. Both wrong calls were reasoned from code without ever
// reproducing the fault, on a Mac that does not have his phone's memory pressure. So the panel
// stops carrying theories and carries the INVARIANT: every chunk whose art has decoded should have
// a visible sprite. want 0 says the window never asked, live 0 against want 9 says the textures
// went away, and a non-zero fix count says the self-heal in a1aSpriteWatchdog is the only reason
// the terrain came back. Pure reads of counters the renderer already maintains.
//
// 2026-08-13: the same line gains ` d<N>`. Signed off because it is the one number that can settle
// the build-19 report, in which the self-heal above WORKED -- the owner saw the blue screen recover
// -- and the game then "went in loading again", i.e. WebContent was killed and the app reloaded.
// The heal is now graduated (a1aSpriteWatchdog): pass 1 re-uploads from decoded images already
// resident, pass 2 additionally drops the chunk records and re-decodes ~200 MB in one burst, which
// is the leading suspect for provoking that kill. `d` counts pass 2 only, so `fix5 d0` says every
// recovery was the cheap one and the suspect is dead, while any non-zero `d` says pass 1 was
// watched to fail. Read of an existing counter on the existing tick; no new work in the frame.
// 2026-08-13, second sign-off: the panel gains ` GLLOST`, read from `gl.isContextLost()` rather
// than inferred. Signed off because the counters beside it were MEASURED blind to the very failure
// they were written for: a healthy `spr 6/6` overworld whose GL context is genuinely lost still
// reads 6/6 after 600 pumped frames, since A1A.tex is our own bookkeeping and the sprites remain
// visible JS objects. A blue screen with GLLOST and one without are different faults, and the panel
// could not previously tell the owner which he was photographing. One boolean read on the existing
// tick; no new timer, no new storage write.
// 2026-08-13, third sign-off: the live panel steps aside for the black-box card, and the card's
// detail block grows from 132px to 44vh. Owner, verbatim: "you also need to move the debugging text
// box so the restart debug text box can show the full text." Both overlays sat at z-index 10001 in
// the lower half of a 360pt screen, so the panel covered the card's opening lines -- including the
// classifier verdict, the most useful line either prints. The panel now moves to the top while the
// card is up and drops below it in z-order, rather than hiding: the card is the post-mortem of the
// session that died and the panel is the live state of its replacement, and one photograph of both
// is worth more than either alone. Presentation only; no counter, timer or storage write changes.
// 2026-08-14, fourth sign-off: a BATTLE-EXIT COVER. Owner on build 27: "after battles, the screen
// briefly shows blue but that resolves pretty quickly. i am willing to allow a longer transition
// screen after the battle ends before going back to the overworld as long as we can load the
// overworld cleanly." Signed off because the battle path deliberately drops every chunk layer from
// the GPU -- that is what stopped the context loss -- so the return is ALWAYS a rebuild and racing
// it is a race we can only nearly win. The lid lifts on READINESS (sprLive >= sprWant), read from
// the terrain rather than guessed as a duration, and is hard-bounded at 4 s so it can never outlive
// its own condition and trap the player. Separate element from #boot-cover, which finish() removes
// from the DOM precisely so it cannot return; this one must be able to.
// 2026-08-15, fifth sign-off: the DEBUG UI is now OFF by default. Owner, after confirming the
// overworld blue screen fixed: "can you also remove the debug boxes since the overworld issue is
// resolved?" GATED, NOT DELETED -- these two surfaces are what solved that bug (the live panel's
// `spr live/want fix N` caught the watchdog making the blue screen worse; the black box reported
// `gl lost ... restored=1` then "page was killed outright", which turned it from a redraw bug into
// a memory one). The recording still runs; only the on-screen boxes are suppressed, so a regression
// is still captured. Re-enable on a device with no rebuild:
// localStorage.setItem('edu-rpg-debug','1'). Read once at boot, never per frame.
export const EXPECTED_STATIC_INDEX_SHA =
  '488492530912d89539c7bd638ffd7a3f5da978785f0b91c7211832486a5899d6';

/**
 * The authored shell loads its scripts by ABSOLUTE path so the Vite dev server resolves them;
 * the shipped shell is served from its own directory and must load them RELATIVE. The bundle
 * tag is the one substantive change: `/src/main.ts` becomes the frozen 4.99 MB artifact.
 */
export const REWRITES = [
  ['href="/ui-overhaul.css"', 'href="ui-overhaul.css"'],
  ['<script type="module" src="/src/main.ts"></script>',
    '<script type="module" crossorigin src="assets/index-BhoGQRaA.js"></script>'],
  ['src="/ui-overhaul.js"', 'src="ui-overhaul.js"'],
  ['src="/act1-world-map.js"', 'src="act1-world-map.js"'],
  ['src="/dq-tiles.js"', 'src="dq-tiles.js"'],
  ['src="/hero-override.js"', 'src="hero-override.js"'],
  ['src="/act1-hifi/adapter.js"', 'src="act1-hifi/adapter.js"'],
];

export const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');

/**
 * Apply the rewrites, asserting each one actually matched. `String.replace` on an absent needle
 * is a silent no-op, which would produce a shell that loads nothing and a diff nobody can read.
 */
export function staticIndexFrom(authored) {
  let html = authored;
  for (const [from, to] of REWRITES) {
    if (!html.includes(from)) {
      throw new Error(
        `authored index.html does not contain the rewrite source ${JSON.stringify(from)} -- ` +
        'the shell and this transform have diverged; fix one of them rather than shipping ' +
        'a partially rewritten shell',
      );
    }
    html = html.replace(from, to);
  }
  return html;
}

export async function deriveStaticIndex() {
  return staticIndexFrom(await readFile(path.join(ROOT, 'index.html'), 'utf8'));
}

/**
 * Known-bad vintages, for DIAGNOSTICS ONLY. The check itself is an equality test against the
 * derivation, so a fourth vintage is caught just as firmly as these two -- which is why this is
 * a lookup for the error message and never a blocklist. Surveyed across worktrees 2026-08-07.
 */
const STALE_SHELLS = new Map([
  [14414, 'the baseline vintage `runtime_baseline.py hydrate` writes (2026-07-12). dist/ was '
    + 'hydrated but the shell was never derived over the top of it.'],
  [15094, 'the PRE-HUD shell (purple/gold #2a2440 / #c9a84c). It predates the Charcoal & Gold '
    + 'Leaf theme that has already landed, and still ships in several sibling worktrees -- '
    + 'this dist/ was almost certainly seeded by copying one of them.'],
]);

async function main() {
  const check = process.argv.includes('--check');
  const expected = await deriveStaticIndex();
  const target = path.join(ROOT, 'dist/index.html');

  // FIRST anchor: the derivation of the TRACKED shell must still be the reviewed shell. This is
  // the half that reaches a tracked file, so it is what makes the gate non-vacuous -- without it
  // every remaining check compares one untracked copy against another.
  if (sha256(expected) !== EXPECTED_STATIC_INDEX_SHA) {
    console.error('STATIC SHELL FAIL: the tracked index.html no longer derives the pinned shell');
    console.error(`  derived   ${Buffer.byteLength(expected)} B  ${sha256(expected)}`);
    console.error(`  pinned    ${EXPECTED_STATIC_INDEX_SHA}`);
    console.error(
      '\n  Either root index.html changed without review, or it changed deliberately and ' +
      'EXPECTED_STATIC_INDEX_SHA in scripts/build_static_index.mjs is the sign-off that was ' +
      'not updated.',
    );
    return 1;
  }

  if (!check) {
    await mkdir(path.dirname(target), { recursive: true });
    await writeFile(target, expected);
    console.log(
      `STATIC SHELL WRITTEN: dist/index.html  ${Buffer.byteLength(expected)} B  ` +
      `${sha256(expected).slice(0, 16)}`,
    );
    return 0;
  }

  let actual;
  try {
    actual = await readFile(target, 'utf8');
  } catch {
    console.error('STATIC SHELL FAIL: dist/index.html does not exist. Run scripts/build-dist.sh');
    return 1;
  }
  if (actual === expected) {
    console.log(
      `STATIC SHELL CHECK PASS: dist/index.html matches the tracked shell  ` +
      `${Buffer.byteLength(expected)} B  ${sha256(expected).slice(0, 16)}`,
    );
    return 0;
  }

  console.error('STATIC SHELL FAIL: dist/index.html is not derived from the tracked index.html');
  console.error(`  on disk   ${Buffer.byteLength(actual)} B  ${sha256(actual)}`);
  console.error(`  expected  ${Buffer.byteLength(expected)} B  ${sha256(expected)}`);
  const known = STALE_SHELLS.get(Buffer.byteLength(actual));
  if (known) console.error(`\n  That is a KNOWN STALE VINTAGE: ${known}`);
  console.error(
    '\n  Rebuild with scripts/build-dist.sh. Do NOT run scripts/regenerate_pins.py to make ' +
    'this agree -- the index.html pin resolves from dist/, so that re-pins the gate to the ' +
    'stale shell instead of reporting it.',
  );
  return 1;
}

if (import.meta.url === `file://${process.argv[1]}`) process.exit(await main());
