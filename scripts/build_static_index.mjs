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
export const EXPECTED_STATIC_INDEX_SHA =
  'b4d8cc5ac12bd81fa26099d64cfe1753053fd83bdca0ef46524b7709709fbf7e';

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
