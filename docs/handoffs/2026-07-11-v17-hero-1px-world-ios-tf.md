---
date: 2026-07-11
type: handoff
project: edu-rpg
milestone: v17-hero-1px-world-ios-tf
status: active
supersedes: "[[2026-07-02-dq-dungeon-world-art]]"
tags: [handoff]
---

# Handoff — v17 hero + all-1px world + iOS cleanup + TestFlight — 2026-07-11

Owner goal (verbatim): implement the v17 hero, then a **full iOS cleanup** (visual + playability
bugs), make the **UI/gameplay crisp** (current build is fuzzy on device), and **push to TestFlight**
to test on a phone. Everything goes to **1px** ([[ADR-0060-edu-rpg-1px-world-and-v17-hero]]).

## What shipped this session
- **Nothing deployed.** All work is local/sandbox. `dist/` and `gh-pages` are untouched.
- Build landmine defused: overrides (`dq-tiles.js`, `ui-overhaul.{js,css}`, `props/`, `owprops/`) promoted to `public/`; root `index.html` promoted from the real shipped page (was a stub missing the d-pad + `#qok-ui`). A throwaway `--outDir` build now reproduces them. Backups: `backups/build-landmine/`, `backups/dq-tiles/`.
- DQ world redrawn to N=24/2px and gated (superseded same session — see decision below).
- New tooling: `docs/detect_lattice.py` (sweeps block sizes; the gate), `docs/verify_hero_walk.py`, `docs/BUILD-AND-SHIP.md`, `.eduharness/{dq_pix_shot.js,dq_density_probe.js,dq_hero_motion.js,dq_texture_lattice.js,boot_check.js}`.

## Verification (run this session)
- typecheck: **`npx tsc --noEmit` → exit 0, clean** (2026-07-11).
- Throwaway build (`vite build --outDir /tmp/... --emptyOutDir`): succeeds, preserves all overrides + `#qok-ui` + d-pad. **But emits a DIFFERENT bundle** (2.44 MB / 72 monsters) vs shipped (4.99 MB / 75) — see gotcha.
- v17 hero: 576×48 RGBA both variants; all 4 directions verified as real art; `detect_lattice --expect 1` (1px). Frame-0 ≠ locked-v14 (different lineage, expected).
- N=48/SC=1 terrain: renders, **1px lattice, zero console errors** (sandbox `:5184`).

## Live state (verified 2026-07-11)
- **gh-pages / TestFlight: NOTHING pushed for this work.** Live gh-pages HEAD `1adab26`, bundle `index-BhoGQRaA.js` unchanged (per edu-rpg skill). No TF build exists for the v17/1px work.
- `dist/dq-tiles.js` = `N=16, SC=3` (the OLD 3px world — the shipped state).
- `public/dq-tiles.js` = `N=24, SC=2` (my redraw — **superseded**, keep as a rescale source).
- Original N=16 backup: `backups/dq-tiles/dq-tiles-N16-SC3-2026-07-10.js`.
- HEAD `8f86f9d` on `main` (source does NOT match the deployed bundle — normal for this repo).

## Locked decisions
- **Everything is 1px.** World → `N=48, SC=1, MARGIN=12`. v17 hero ships as-is (1px). Crisper world ships to TF. [[ADR-0060-edu-rpg-1px-world-and-v17-hero]].
- **A = openface (default), B = feminine.** `covered` dropped. [[ADR-0057-hero-ab-variant-lock-and-art-contract]].
- **NEVER `npm run build` to ship.** `dist/` is hand-patched source, not build output (72 vs 75 monsters). Ship additively; Capacitor wraps `dist/`. [[learning-20260710-dist-is-not-built-from-src]], `docs/BUILD-AND-SHIP.md`.
- **All subagent dispatch on Codex** (`gpt-5.6-terra` standard / `-luna` light / `-sol` escalation), never the Agent tool. [[ADR-0056-codex-subagent-dispatch]]. Codex **cannot launch Chrome** — the orchestrator owns every headless gate.

## Gotchas for next session
- **Verify the RENDER, never the source.** `dq-tiles.js` repaints tiles at runtime; source constants lie about what the player sees. [[learning-20260710-verify-the-render-not-the-source]].
- **Measure the lattice, don't assume it.** `detect_lattice.py` sweeps block sizes. For the 1px world, gate on `--expect 1`. [[learning-20260710-pixel-lattice-not-pixel-density]].
- **`dq-tiles.js` has THREE coordinate systems** — 49 fns follow `N` (auto-scale), ~10 are baked-int native px (redraw for N=48), 29 are raw 48px 1px art (ALREADY the target). Audit the diff against the code, not the brief. [[learning-20260710-three-coordinate-systems-in-dq-tiles]].
- **A mechanical gate certifies conformance, not quality.** Always pair `detect_lattice` with one look. [[learning-20260710-v14-hero-front-facing-only]].
- **iOS must be driven via `idb` sim, NOT Playwright** — Playwright has no safe-area and misses Dynamic Island / notch cutoffs. `idb ui tap/swipe`, `xcrun simctl io <UDID> screenshot`. (edu-rpg skill, error-archive "iOS-sim DRIVING is headless-capable".)
- **"Fuzzy gameplay" is almost certainly a render-scaling bug**, not the art lattice: non-integer canvas scaling / DPR mismatch → bilinear blur of nearest-neighbor pixel art on device. Investigate Phaser scale config (`pixelArt`, `roundPixels`, `resolution`), the canvas backing-store-vs-CSS size, CSS `image-rendering: pixelated`, and Capacitor viewport/meta. Some of this is editable in `index.html`/CSS (in `dist/`); Phaser config changes may need a **bundle patch** (can't rebuild).
- Stale sandboxes from this session (`:5180` v14, `:5182` N=24, `:5183` N=16 control, `:5184` N=48 test) — kill and rebuild fresh; don't trust them.
- Deploy additively via an isolated `/tmp` gh-pages worktree; `git checkout <commit> -- .` on gh-pages DELETES monster PNGs (edu-rpg skill).

## Resume here (load-on-demand — do NOT eager-read the corpus)
**Distilled state:** tsc clean; nothing shipped; owner wants v17 + all-1px world + crisp iOS build on TF. The world-1px mechanism (`N=48/SC=1`) is proven for terrain; the redraw of hand-drawn building art at 48-unit + wiring v17 + the iOS/crisp work + TF push remain.

**Next actions, in order:**
1. Redo the DQ world at `N=48/SC=1` (dispatch to Codex; gate `detect_lattice --expect 1` on overworld/greenhollow/mistyGrotto; re-verify every capture yourself — Codex can't run the gate). Terrain auto-scales; redraw the ~10 baked-coordinate building/wall fns at 48-unit; `asset*` already 1px.
2. Wire v17 hero: productionize `/tmp/edu-sbx/hero-swap.js` into a `dist/` override loading `hero-{openface,feminine}-walk.png`; A=default. Verify in-engine with `dq_hero_motion.js` (read the texture back, don't trust the script).
3. iOS cleanup + crisp render fix (idb sim; the fuzzy-render hypothesis above).
4. Push to TF via the `push-to-testflight` skill (fastlane beta), shipping the 1px world + v17.

**Pointers:**

| purpose | path | read when |
|---|---|---|
| The 1px + v17 decision | `claude_brain/02-Decisions/ADR-0060-*.md` | before any world/hero work |
| Build/ship model + never-rebuild | `edu-rpg/docs/BUILD-AND-SHIP.md` | before touching dist/ or building |
| Lattice gate | `edu-rpg/docs/detect_lattice.py` | gating any world capture |
| v17 assets | `~/Documents/codex/output/edu-rpg-locked-front-facing-dark-jrpg-2026-07-06/hero/walk-v17-male-front-leg-attachment/{game-48,locked-orientations,gifs}` | wiring the hero |
| Sandbox + capture harness | `edu-rpg/.eduharness/dq_pix_shot.js` (EDU_URL env), `dq_hero_motion.js` | any in-engine verify |
| iOS sim gotchas | edu-rpg skill → error-archive.md | iOS cleanup |
| DQ layer source | `edu-rpg/public/dq-tiles.js:23` (the `N,SC,MARGIN` line) | world redraw |

## Kickoff prompt (paste verbatim into next session)
```
Resume edu-rpg milestone v17-hero-1px-world-ios-tf. Read
edu-rpg/docs/handoffs/2026-07-11-v17-hero-1px-world-ios-tf.md FIRST, then
claude_brain/02-Decisions/ADR-0060-edu-rpg-1px-world-and-v17-hero.md and
edu-rpg/docs/BUILD-AND-SHIP.md. Follow the CLAUDE.md session protocol.

Owner wants: (1) the v17 hero implemented, (2) the whole DQ world redrawn at 1px
(N=48/SC=1) to match it, (3) a full iOS cleanup + crisp (non-fuzzy) render, (4) a
TestFlight push. Everything is 1px per ADR-0060. NEVER run `npm run build` to ship
(dist is hand-patched, 72 vs 75 monsters) — ship additively; Capacitor wraps dist/.
Dispatch subagent work on Codex (ADR-0056); the orchestrator owns every headless
gate because Codex can't launch Chrome. Gate the world on
`python3 docs/detect_lattice.py <capture> --crop <box> --expect 1` AND one visual
look. Drive iOS via idb sim, not Playwright. Start with the world 1px redraw
(step 1 in the handoff's Resume-here), verifying each Codex capture yourself.
```
