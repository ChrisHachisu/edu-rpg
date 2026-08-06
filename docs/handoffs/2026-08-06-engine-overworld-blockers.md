---
date: 2026-08-06
type: handoff
project: edu-rpg
milestone: engine-track
status: active
branch: engine/overworld-blockers
worktree: ../edu-rpg-engine
tags: [handoff, edu-rpg, engine, collision, overworld, act1]
---

# Handoff — engine track: overworld blockers + consolidation race — 2026-08-06

Branch `engine/overworld-blockers` at **`81c830b`**, sitting directly on `main` (`6b04deb`).
Worktree clean. **Both mechanical gates pass on the committed tree.** One DONE criterion is
open: the visual/device proof.

## What shipped

### A. The overworld now collides on its painted edge, not on the tile lattice

`drawTerrain` decides every rendered pixel with two thresholds:

```js
var W   = waterField(map,wx,wy);                     // W  >= 0.50 is water
var Mf0 = (W<0.50 && hasMtn) ? mountainField(map,wx,wy) : -1;   // Mf0 >= 0.50 is rock
```

Collision read the raw tile lattice through `OW_BLOCK` instead. The file already admitted the
split at the road layer: the reskin dissolves the generator's path blobs *"in the RE-SKIN ONLY —
the deployed map data is never mutated, so walkability/barriers are unchanged."*

`owmBuild` evaluates **those same two functions at that same 0.50** over the renderer's own
window and chamfer-distances the result. The blocker and the visible edge cannot disagree,
because they are the same function. No new asset was needed — unlike the dungeons, the
overworld's two continuous masses are analytic.

The existing `a1m*` mover drives it **unchanged**. The field object gained `ox`/`oy` (origin in
world px) and a `prop` table; both are inert for dungeons (`0` / `A1M_PROP`), so the dungeon path
is arithmetically identical — that is why the DQ replay still reproduces byte-identical state.

Three decisions worth not re-litigating:

- **Discrete landmarks keep the tile test.** Cave mouths, tombs, signposts and villages are DRAWN
  as props standing on a cell, so a cell-shaped blocker is what their picture actually is — and
  bumping one is how the engine interacts with it. Exactly how the dungeon keeps `A1M_PROP`
  beside its mask. Only `2` and `4` were removed from the tile table; the field owns those now.
- **Bridges are carved back out after sampling.** `waterField` counts tile 5 as water on purpose
  so the deck is painted over real water rather than a hole. Blocking on the raw field would wall
  off every bridge on the map and strand the player.
- **Windowed, not whole-world.** The field is built on the renderer's own window (same origin,
  same size, same key), rebuilt only when that window moves — every `MARGIN`=12 cells of travel,
  not per frame. `MARGIN` also keeps the hero ~576 px from any edge, far beyond a frame's travel
  and twice `a1mUnstick`'s 288 px search. Outside it, `owmFor` returns null and the engine's own
  stepping takes over, fallback-safe like every other layer in the file.

### B. `consolidateMapData` re-runs after a town exit

`lastReskinMapId` is `id + dimensions`. Returning from a town hands the engine a **new** `mapData`
array with both unchanged, so the key gate skipped its entire body and the consolidation was
silently lost. Now guarded on the **array identity** — the same fix the Act-1 plate and
`updateDng`'s stale floor each got. `consolidateMapData` is itself identity-cached, so it stays
exactly-once per array; `owFresh` forces the cached terrain/overlay window to redraw.

## Gates — run on the committed tree, after the (no-op) rebase

```
npm run test:map-engine     8/8 PASS
./scripts/ship-gate.sh .    SHIP GATE PASS (53 pins, dist + iOS payload)
```

All four dq-tiles pins followed the identity move: `runtime_baseline.py` via
`regenerate_pins.py` (never hand-edited), the two hand-maintained `.mjs` shas, and
`act1RuntimeSnapshot.ts` via `node scripts/extract_act1_runtime_snapshot.mjs`.

New dq-tiles.js identity: **247945 B / `509556b94da5b2d87e8d7438fd3b5b557ebcfc835d63f9bb8259ed35f101013d`**

## STILL OPEN — the one criterion not met

**A device recording/screenshot pair of the player walking against a non-square overworld
boundary, after a full rebuild.** Not captured. Two things blocked it and both are worth knowing:

1. **The web path does not boot past `BootScene`.** Served with `scripts/serve_dist.py` (not
   `npx serve` — that one dies mid-load on the Act 1 chunks, which the script's own header
   explains). Loader reaches `progress: 1`, `isLoading() === false`, `0` pending, no console
   errors, all requests 200 — and `BootScene` still never hands off to `TitleScene`. This
   reproduces on the preserved artifact and is **not** caused by this change. Worth a look on its
   own; it blocks every headless verification of the overworld.
2. **`.eduharness/` is gitignored**, so a fresh worktree has no Playwright harness. It has to be
   copied from another worktree.

**The unmeasured risk that proof would settle:** `owmBuild` evaluates `waterField`/`mountainField`
per pixel over the window. At the shipped 320x400 that window is 31x33 cells = 1488x1584 ≈ 2.36 M
px, within a whisker of a dungeon floor's 2.3 M (measured under 40 ms). **But the browser canvas
came up 768x672, not 320x400** — if `worldView` is really that size the window is 40x38 cells =
1920x1824 ≈ 3.5 M px, ~50% more, and the per-pixel cost here is `vnoise`, not a PNG read, so it is
dearer per pixel than the dungeon's. Rebuilds happen every 12 cells (~2.2 s at 260 px/s), so a
slow build would read as a periodic hitch. **Measure `owmBuild` before trusting the feel.**
A presence-scan already skips both fields in windows with neither mass, so open ground is cheap.

If it does turn out too slow, the fix with the best ratio is to tap the mask out of `drawTerrain`'s
existing per-pixel loop (it already computes `W` and `Mf0`) rather than evaluating the fields a
second time — with the caveat that `drawTerrain` early-returns via `a1aBlit` on windows wholly
inside the baked Act-1 plate, which would need its own answer.

## Things found on the way that are not mine to fix

- **`dist/index.html` is gitignored but pinned.** A fresh worktree cannot reconstruct it, and
  `regenerate_pins.py` will happily re-pin it to the stale hydrated-baseline vintage
  (15094 -> 14414 B), silently reverting the HUD's shipped file. I hit this and backed it out.
  The correct copy currently lives only in other worktrees. HUD track owns the file.
- **`main`'s own `dist/` is stale** — 257 files, no `act1-hifi`, so `ship-gate.sh` cannot pass in
  `../edu-rpg` as it stands. `dist` = `hydrate` (257) + 148 Act-1 overlay paths from `public/`.
- **`public/act1-hifi/walkable-polygons.js`** (19.8 KB polygon-collision library) and
  `walkable-route-state.js` are loaded by **nothing** — authored for the town cutover, never
  wired up. Either wire or retire; right now they are unregistered runtime files.
- **Another session checked out `docs/process` in `edu-rpg-map-engine-semantic-data`**, the path
  most briefs still name as the `codex/map-engine-semantic-data` checkout.

## Kickoff prompt for the successor

```
edu-rpg — engine track, finish the overworld blocker proof.

Worktree ../edu-rpg-engine, branch engine/overworld-blockers at 81c830b (on main 6b04deb).
Tree clean; npm run test:map-engine and ./scripts/ship-gate.sh . both pass ON THIS TREE.
Read docs/handoffs/2026-08-06-engine-overworld-blockers.md first, and nothing else.

Note: a fresh worktree has no node_modules (symlink ../edu-rpg/node_modules; package.json is
byte-identical) and no .eduharness (copy from another worktree).

TASK 1 — measure owmBuild. Get the overworld running, time owmBuild over one window, and
report ms. The handoff's "unmeasured risk" section says what to do if it is slow.

TASK 2 — the DONE criterion still open: a screenshot pair on sim
4872FCF0-6444-4A31-8D76-F92CEA09BF8D (NEVER 24A4D890), after a FULL rebuild -- run-ios.sh
--skip-build reinstalls a stale app -- showing the player stopped against a curved water or
mountain edge rather than a square one. Set window.__DQ_OW_CONTINUOUS__=false to capture the
before shot from the same position; that is the escape hatch built for exactly this.

Do not boot a simulator if another session holds one. Do not edit ui-overhaul.*, dist/index.html,
scripts/render_*, design/act1-dungeon-interiors/, public/act1-dungeon-art/.
```
