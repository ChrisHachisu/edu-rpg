---
date: 2026-07-31
type: handoff
tags: [edu-rpg, act1, dungeons, material-renderer, art-pipeline]
---

# Act-1 dungeon interiors — generator done, material art proven on one dungeon

Supersedes `2026-07-29-owner-painted-terrain-to-codex-art.md` for the DUNGEON workstream only.
The overworld is a separate live session; treat its directories as read-only.

## What shipped

**A complete Act-1 dungeon generator**, 18 floors across 5 dungeons, all validating.
`scripts/build_dungeon_semantic.py` → `design/act1-dungeon-interiors/*.json`.

- **Joint-controlled caves on six karst patterns** — branchwork, ramiform, spongework, network,
  anastomotic, loop. One per dungeon; Crystal Cave walks all six across its floors. Passages run
  along per-dungeon fracture bearings, so they meet at angles like real caves.
- **Placement is measured, not asserted.** Payoff at 79–98% of each floor's reach with 19–28
  cells of arena; 57 chests, every one at a TRUE terminal (one way in) and off the main route;
  save crystal in a carved dead-end pocket at the boss chamber mouth; plaque mounted on rock.
- **`validate()` re-derives every rule from the finished grid.** Ten-plus checks including the
  sealing invariant. 0 soft-locked floors.

**Material-renderer art, proven end to end on Sunken Cellar.**
`scripts/make_dungeon_materials.py` + `scripts/render_dungeon_material_map.py`.
All three floors, seam-free, from ONE generation, ~21 s per floor.

**Dungeon prop sprites**, one generation, chroma-keyed and composited.
`scripts/make_dungeon_assets.py` → `design/act1-dungeon-interiors/assets/asset-*.png`.

## What is next

1. **Four more material sheets** — `make_dungeon_materials.py --theme <whisperingWoodsCave |
   mistyGrotto | coastalReef | crystalCave>`. One Codex call each. **The owner wanted to review
   Sunken Cellar before these run — check with them first.**
2. **Render the remaining 15 floors** — `render_dungeon_material_map.py --floor <id> --scale 2`,
   then `make_dungeon_assets.py --composite <id>`.
3. **Two known gaps in the renderer.** The `accent` material is loaded and never splatted — it
   should be standing water in the hollows, which is the entire point of a *flooded* cellar. And
   the wall-base band could carry more presence at gameplay zoom.
4. **`mechanic: 'fog'` is missing from `src/data/maps.ts` for `mistyGrotto`.** The fog/torch
   system is fully implemented and switched on by nothing. Owner's call — it is source.
5. **Guiding dust + encounter multiplier** — designed and locked, not built. See
   `design/act1-dungeon-interiors/GUIDING-DUST-SPEC.md`.
6. Still open from earlier: **Crystal Cave's second mouth** (it is a two-mouth gate dungeon in
   maps.ts, arriving at floor 5); the **9 stale overworld connections** in maps.ts vs
   `owner-terrain.json`; **towns** (all three still 16×16 from one template).

## Locked decisions

- **Size curve** 32×28 → 56×48 through the act, +2 cells per dimension per floor. Grade scaling
  dropped for dungeons.
- **No keys, no locked doors** anywhere in the game. **Hidden rooms exist but are gated to Act 3+**
  (`HIDDEN_ROOMS_FROM_ACT`). No plain doors.
- **Save crystal** in its own carved pocket at the boss chamber mouth. **Plaque on the wall.**
- **Guiding dust**: one use per floor, lingers until the player leaves the dungeon, survives
  inter-floor transitions, first met as a shop discovery. Up to grade 3 start with 10 free and
  restock cheaply; grade 4+ expensive or scarce. The grade difference sits on AVAILABILITY, not
  on the mechanic.

## Gotchas that cost real time

> [!warning] Per-tile AI art does not work, and no prompt fixes it
> The overworld burned ~9.2M tokens on 56 tiles and never shipped one; this session burned ~11
> generations reaching the same wall. **The image tool exposes no seed, no style lock and no
> spatial conditioning.** Record: `design/act1-dungeon-interiors/ABANDONED-TILE-PASS.json`.
> Method that replaced it: `docs/MATERIAL-RENDERER-METHOD.md`. **Generate materials, not maps.**

- **One passing sample is not evidence of a reliable pipeline.** A pilot tile scored 0/676; nine
  production tiles from equally good bases scored 4–14% wrong. Several rounds were spent tuning a
  prompt against n=1.
- **Check the input before blaming the output.** Twice the defect was in what I sent, not what
  came back — a base that was itself 3.1% wrong, and a prompt whose *structure* I had rewritten.
- **When a prompt is verified working, its structure is load-bearing.** Parameterise the nouns
  inside the frame; do not reorganise the frame.
- **A metric can pass while measuring the wrong thing.** "Local maximum of the distance field"
  equals "dead end" only on a tree; every looping pattern broke it while the check reported 57/57.
- **Asset placement needs a collision model.** chest/boss/plaque/save are IMPASSABLE
  (`WorldMapScene.ts:1194`). Ignoring that soft-locked 6 of 18 floors — three sealed at the front
  door by the plaque.
- **This repo's `src/` is older than the shipped bundle.** "Absent from src/" never means "absent
  from the game" — the fog mechanic, `dungeonEscape` and Darkfang's name were all already there.
- **Darkfang Grotto IS `mistyGrotto`** (`en.ts:852`). Act 1 has FIVE dungeons. A phantom marker
  at `[96,359]` in `owner-terrain.json` still needs unsplitting by the overworld session.
- PIL's `GaussianBlur` refuses float images; use the separable blur. `codex exec` dies producing
  nothing if the prompt lets it read skills/AGENTS docs, and ~8 MB of attached references kills
  `image_gen` silently.

## Invariants — do not break

- Dirty tree preserved; **no commits, no builds, never `npm run build`**.
- `dist/assets/index-BhoGQRaA.js` byte-identical: 4,987,581 bytes, md5
  `60d90b63607b6e6980eb170aeeed445e`.
- `design/continent-terrain-class-method/owner-terrain/**` is the overworld session's and the
  owner's INPUT. Read-only.

## Kickoff prompt

> Continue the Act-1 dungeon interiors in
> `/Users/christopherhachisu/Documents/claudecode/edu-rpg-map-engine-semantic-data` (branch
> `codex/map-engine-semantic-data`). Read
> `docs/handoffs/2026-07-31-act1-dungeon-material-renderer.md` first, then
> `docs/MATERIAL-RENDERER-METHOD.md`. The 18-floor generator is done and validating; Sunken
> Cellar's art is rendered seam-free from one material generation and its props are composited.
> **The owner is reviewing Sunken Cellar — ask before generating the other four material
> sheets.** While waiting, fix the two known renderer gaps: the `accent` material is loaded but
> never splatted (it should be standing water in the hollows), and the wall-base band needs more
> presence at gameplay zoom. Do NOT generate art tile by tile — that path is abandoned and
> recorded in `ABANDONED-TILE-PASS.json`. Preserve the dirty tree, no commits, never
> `npm run build`, keep `dist/assets/index-BhoGQRaA.js` byte-identical, and treat
> `design/continent-terrain-class-method/owner-terrain/**` as read-only.
