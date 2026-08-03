---
date: 2026-08-03
type: handoff
tags: [edu-rpg, act1, dungeons, dq-tiles, runtime-integration]
---

# Act-1 dungeon runtime integration — SHIPPED and verified

Supersedes `2026-08-02-act1-dungeon-runtime-integration.md`.
Detail: `claude_brain/03-Changes/2026-08-03-act1-dungeon-runtime-integration-changes.md`.
Seam analysis: `claude_brain/04-Learnings/learning-20260803-edu-rpg-mapdata-is-the-collision-seam.md`.

**Orchestration:** the owner consolidated all three edu-rpg sessions on 2026-08-03. The **towns**
session (`local_1e6833d6-ad0d-453e-84cc-f49da6025f31`) sequences all workstreams. The overworld
session has stood down. Route anything touching `mapData`, dungeon collision or `drawDungeon` here.

## The question the last handoff called the single unknown — answered

**The engine reads `scene.mapData` for COLLISION, not just drawing.** `canMove(x,y)` indexes
`this.mapData[y][x]` directly and takes its bounds from `mapData`. Owner option (a) was therefore
straightforward. Three facts made it cleaner still:

1. `loadMap()` derives `effectiveWidth/effectiveHeight` **from mapData**, then calls `renderMap()`,
   which is idempotent — one swap carries collision, tile sprites, camera and minimap together.
2. Dungeon transitions are **tile-value driven** (6 = up/exit, 9 = down, 11 = boss warp), never
   coordinate driven, so the hardcoded `fromX:50, fromY:0` is harmless at 34x29.
3. `loadMap` never sets hero position — callers do, *after* it returns, **by reading `mapData`**.
   So the wrapper runs after the original and they land on the overridden map for free.

## What shipped

`public/dq-tiles.js` (+ `dist/` and `ios/App/App/public/` twins) — **171,773 /
`8785d7fa360c01a97da9aaeae239c5be2438640a78f48e1f8d3e88856adfac3a`**:

- wraps `WorldMapScene.loadMap` on the prototype, swaps `mapData`, re-derives dims, re-renders;
- blits the matching pre-rendered floor art in `drawDungeon` (N = TILE = 48 = render scale, no rescale);
- replays persisted progress (looted chest 4->8, defeated boss 7->10/12) — the engine does this
  *inside* `loadMap` and our swap lands after it;
- rescues the hero when the engine drops it out of bounds (overworld entry uses a fixed `toX/toY`
  of 50,0, off the edge of a 26x26 floor);
- guards the tick on **actual mapData dimensions**, not just a key — see gotcha 1.

Registered in `scripts/runtime_baseline.py` as `ACT1_DUNGEON_FILES` (hash-pinned + public/dist twin
check): `act1-dungeon-floors.json`, `act1-dungeon-art/sunkenCellar-f3-props.png`.

## Verified with numbers

- Collision parity **986/986 cells**, zero mismatches; out-of-bounds refused on all four new edges.
- Blit **837/837 sampled pixels identical** to source; source is exactly `effWidth*48 x effHeight*48`.
- Progress replay: mark chest looted -> reload -> tile is 8, chest count 2->1.
- **Traversal: all 9 in-scope floors pass BFS reachability — 0/9 with unreachable content.**
- `npm run test:map-engine` PASSES end to end; `SHIP GATE PASS` for `dist` + `ios`.
- Bundle byte-identical: 4,987,581 / md5 `60d90b63607b6e6980eb170aeeed445e`. No commits.

## Scope — owner-locked 2026-08-03, do not re-litigate

IN: `coastalReef`, `sunkenCellar`, `whisperingWoodsCave` (generated floors 3/3 = bundle `floors`).
OUT: `mistyGrotto` (bundle 5 vs generated 3) and `crystalCave` (bundle 5 vs generated 6,
`colored-keys` puzzle, standing "never modify Crystal Cave" rule) — both stay procedural.

Also locked: ADR-0076 (chest cell + all eight neighbours walkable), boss = formless black smoke
with red eyes at 2.2 cells.

## Gotchas

1. **A key-only guard is a silent-failure trap.** The overworld override was wiped because
   returning from a town hands the engine a NEW mapData array under an unchanged reskin key, so the
   re-apply was skipped and nothing looked wrong. All four `this.mapData =` assignments are inside
   `loadMap` (wrapper covers them), but the tick guard now compares dimensions so it self-heals.
2. **The Browser pane runs `document.hidden`**, which freezes RAF *and* `setInterval`. `dq-tiles.js`
   cannot run there at all. Drive it by pumping `game.loop.step()` and re-evaluating the source with
   `setInterval(tick,80)` swapped for a manual pump.
3. **A 4.2 MB PNG decodes slowly in a hidden tab.** An early pixel check read as a total regression
   (0/837 identical) when nothing was wrong; after decode it was 837/837. Measure after the asset
   resolves, not after N loop pumps.
4. **`scripts/ship-gate.sh` REQUIRES the repo root as `$1`.** Bare invocation fails with
   `repo root required`, which reads like a gate failure and is not one.
5. **`scripts/promote_act1_r26_runtime.py` is SUPERSEDED / DO NOT RUN.**
6. Re-read `scripts/runtime_baseline.py` immediately before writing — multiple sessions edit it.

## Open, needing the orchestrator's call

- **Only 1 of 9 in-scope floors has art.** `sunkenCellar-f3-props.png` is the sole render; the other
  8 fall back to the procedural draw — playable, but the seam is visible. Owner approved the current
  `mat-wall` ("keep it, start rendering"), but `coastalReef` and `whisperingWoodsCave` need material
  sheets generated first (Codex image-gen, then ~10 min/floor x 9). **Not started** — deliberately
  held so the orchestrator can sequence it against playability work.
- **No end-to-end playthrough has been done** (overworld -> town -> dungeon -> battle -> return).
- Baked props freeze visual state (a looted chest still *renders* closed; data is correct). The
  `-material.png` layer exists behind `window.__A1_DNG_LAYER__='material'` but is deliberately NOT
  shipped: raw assets are ~41px (`asset-boss.png` is 33x41, under one cell vs the locked 2.2), tile
  18 draws on the adjacent wall, and baked contact shadows would be lost.

## Kickoff prompt

> Continue Act-1 dungeon work in `edu-rpg-map-engine-semantic-data` (branch
> `codex/map-engine-semantic-data`). Read `docs/handoffs/2026-08-03-act1-dungeon-mapdata-override-shipped.md`
> first. The **towns** session orchestrates; check with it before starting long work. The mapData
> override is SHIPPED and verified (986/986 collision parity, 9/9 floors traversable, ship gate and
> `npm run test:map-engine` green). The open item is art: 8 of 9 in-scope floors have no render, and
> `coastalReef` + `whisperingWoodsCave` need material sheets generated before their floors can be
> rendered. Never rebuild the bundle, keep `dist/assets/index-BhoGQRaA.js` byte-identical, keep
> public/dist/ios twins in sync, preserve the dirty tree, no commits.
