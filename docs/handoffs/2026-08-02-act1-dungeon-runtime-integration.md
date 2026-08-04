---
date: 2026-08-02
type: handoff
tags: [edu-rpg, act1, dungeons, runtime-integration, dq-tiles]
status: superseded
superseded_by: "[[2026-08-03-act1-design-lock-and-playability]]"
---

# Act-1 dungeons — art + layouts done, runtime integration started

Supersedes `2026-07-31-act1-dungeon-material-renderer.md` for the dungeon workstream.
Live state: `.relay/act1-dungeon-interiors.md`. Decision: [[ADR-0076-dungeon-chest-nine-square-clearance]].

## Where it stands

Art and layouts are **owner-approved**. Runtime integration is **step 1 of 3 done**.

The owner chose **option (a)**: bring the generated map data into the runtime, then blit the
matching render. Options (b) regenerate at 100x100 and (c) visual-only demo were rejected.

## THE SEAM — everything needed to write the hook

`public/dq-tiles.js` (157 KB, an additive override that patches the shipped Phaser scene):

| What | Where | Why it matters |
|---|---|---|
| `drawDungeon(ctx, map, X0, Y0, winW, winH)` | line **1535** | draws the dungeon procedurally; this is what the render replaces |
| `updateDng(scene, force)` | line **1553** | calls it at line 1558 |
| **`var map = scene.mapData`** | line **1554** | **THE MAP-DATA SEAM.** Override this for Act-1 dungeons and both layout and art follow |
| `N` / `TILE` = **48** | line 23 | **exactly the render scale** — source rect is `(X0*48, Y0*48, winW*48, winH*48)`, no rescaling |
| `dngState.image.setPosition(X0*TILE, Y0*TILE)` | line 1559 | the canvas is positioned in tile units |

**Data is already staged:** `public/act1-dungeon-floors.json` (42 KB) — all 18 floors, `rows`
(`#` = rock, anything else walkable), dimensions, theme, and asset placements.

### The mismatch the hook exists to resolve

The bundle declares each dungeon as ONE map, `width: 100, height: 100, floors: 3`. The generator
produces three floors of 34x28 / 36x30 / 38x32. **A draw-only hook can never activate** — the
layouts differ, so the art would not match collision. `scene.mapData` must be overridden first.

**Verify before writing code:** whether the engine reads `scene.mapData` for COLLISION as well as
drawing. If it does, overriding it moves layout and collision together and (a) is straightforward.
If collision comes from elsewhere, that path has to be found first. This is the single unknown
that decides the shape of the work.

## Next steps, in order

1. Confirm the collision question above.
2. Load `act1-dungeon-floors.json` and override `scene.mapData` for Act-1 dungeon maps.
3. Blit the matching `*-props.png` region in `drawDungeon` instead of drawing procedurally.
4. Re-render the 17 stale floors (see gate below).

## Invariants — do not break

- **NEVER rebuild the bundle.** `dist/assets/index-BhoGQRaA.js` stays byte-identical: 4,987,581
  bytes, md5 `60d90b63607b6e6980eb170aeeed445e`. Integration is additive `public/` overrides only.
- **Adding a runtime file is a REGISTRATION act, not a copy.** `scripts/ship-gate.sh` →
  `runtime_baseline.py verify-act1` enforces an exact file set for `dist/` and `ios/`. Register
  the path in the baseline deliberately. (This is why `act1-dungeon-floors.json` is in `public/`
  only for now.)
- Keep `public/` and `dist/` twins in sync for `dq-tiles.js` — ship-gate `cmp`s it.
- Dirty tree preserved, no commits, `design/continent-terrain-class-method/owner-terrain/**` is
  the overworld session's, read-only.

## Gotchas

- **THE SHIP GATE IS ALREADY RED AND IT IS NOT THIS WORKSTREAM.** 8 unregistered
  `act1-hifi/town/**` files from the concurrent Port Sapphire session. Verified by removing our
  own file and re-running. **Do not read a red gate as your own breakage, and never "fix" it by
  deleting another session's files — raise it.**
- **Use `--props` for review renders, never `--composite`.** The fast preview pastes onto a
  finished PNG with no wall mask, so it cannot occlude and shows a regression that is not there.
- **`~/.codex/generated_images` is shared across sessions.** Never adopt an artefact you cannot
  trace to your own run; `prov.py` now records this automatically.
- **Run `python3 scripts/freshness.py verify --brief` at session start.** `STALE`/`MODIFIED` are
  open items; `UNKNOWN` means unverifiable, not fine.
- **17 of 18 renders are STALE** — the chest rule changed every layout. Only `sunkenCellar-f3` is
  re-rendered. ~10 min per floor; the other four dungeons need material sheets generated first.
- **UNANSWERED, blocks the big render pass: `mat-wall.png` was replaced at 08:27 on 2026-08-01 by
  an untraced process.** All current art renders against that angular ochre wall. It cannot be
  reverted — no backup, no provenance record. Ask the owner before spending an hour rendering.

## Locked this session

- **[[ADR-0076-dungeon-chest-nine-square-clearance]]** — a chest's cell and all eight neighbours
  must be walkable. Replaces the old true-terminal rule. 57/57 comply. **Do not reinstate it.**
- **Boss = formless black smoke with red eyes**, 2.2 cells. Not the wraith, not the lich.
  Three-version table in `design/DUNGEON-ASSET-PROMPTS.md`.
- **Provenance system** — `scripts/prov.py`, `scripts/freshness.py`,
  `docs/superpowers/specs/2026-08-01-artefact-provenance-design.md`.

## Kickoff prompt

> Continue the Act-1 dungeon runtime integration in
> `/Users/christopherhachisu/Documents/claudecode/edu-rpg-map-engine-semantic-data` (branch
> `codex/map-engine-semantic-data`). Read
> `docs/handoffs/2026-08-02-act1-dungeon-runtime-integration.md` first, then
> `.relay/act1-dungeon-interiors.md`. Run `python3 scripts/freshness.py verify --brief`.
> The owner chose option (a): override the runtime's map data with the generated floors, then
> blit the matching render. Floor data is staged at `public/act1-dungeon-floors.json`. **Start by
> answering whether the engine reads `scene.mapData` (`public/dq-tiles.js:1554`) for COLLISION as
> well as drawing** — that decides the shape of the work. Then override `scene.mapData` for Act-1
> dungeons and hook `drawDungeon` at `dq-tiles.js:1535` to blit the matching `*-props.png` region
> (`N = TILE = 48` matches the render scale exactly, so no rescaling). Never rebuild the bundle,
> keep `dist/assets/index-BhoGQRaA.js` byte-identical, preserve the dirty tree, no commits. The
> ship gate is already red from the concurrent Port Sapphire session — do not fix it by deleting
> their files.
