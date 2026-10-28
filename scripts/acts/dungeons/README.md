# Acts 2–5 dungeon interiors

> **2026-10-28 course correction (owner feedback on the Act 2 previews).** The first pass
> (sections further down) authored *new* karst-cave layouts with Act 1's generator. That drops every
> bundle mechanic and gives a tower or a forest the shape of a cave. **It is superseded.** The
> current path draws art on the **real in-game layouts**, which come from the shipped generator run
> headless. See `MECHANICS.md` in the preview folder for the per-dungeon structure, mechanic and art
> requirements, and for what the generator cannot express (a tower, rooms in a ruin or barracks).

> **Size pivot (same day, owner: "a phone app, realistic size").** Baking 111 floors like Act 1 is
> about 215 MB, so it cannot ship (`docs/plans/2026-10-28-app-size-budget.md` §4). The shippable art
> is now **per-dungeon materials + a per-floor 1/4-res field**, which a WebGL shader composites at
> runtime (about 16 MB in total). Every full-floor PNG below is a **design preview only**.
>
> | shippable piece | script | output (scratch `runtime/`) | measured |
> |---|---|---|---|
> | 4 materials per dungeon (floor/wall/rubble/accent, 531 px, q85 JPEG) | `material_pack.py import` then `pack` | `materials/<dungeon>/mat-*.jpg` + `pack.json` | 20 dungeons = **8.5 MB** (placeholders) |
> | the Codex sheets those come from, one per dungeon | `write_codex_briefs.py` | `codex-gen/dungeons/briefs/mat-*.md`, `MATERIALS-MAP.md`, `run-dungeons.sh` | 20 material briefs + 2 mechanic sheets + 2 maze autotile sheets |
> | per-floor field (8-bit L, 12 px/cell), feet walk mask (1-bit, same grid), JSON (offsetCells, assets, static mechanic cells, decals) | `fields.py --all`, then `fields.py --decals` | `fields/<floor>-{field,walk}.png`, `<floor>.json` | about 30–55 KB per trunk floor, 2 KB per maze floor |
> | reference composite for the shader port | `shader_preview.py` | `act<N>-shader-route.png` (mount) | — |
>
> `fields.py` uses `floor_field(scale=4)` (the same function as the Act 1 walk masks). It then
> **clamps every cell back to the game's wall grid**, so collision equals the engine's unchanged
> mapData (`cellsClampedToGame` records how many cells needed it). Mazes use the cell grid directly.
> What the shader route loses, as seen in `act2-shader-route.png`: the tower masonry and windows,
> and the forest's tree crowns. These came from the per-cell renderer's style code, not the
> materials. They return through the Codex material sheets (dressed masonry, tree walls), the
> `skyWindow` decals, and the maze autotile sheets.

## Current path: real layouts

| step | script | what |
|---|---|---|
| 1 | `extract_bundle_generator.py` | lifts `Ap()` plus its helpers (`Js`, `Cs`, `Mr`) **verbatim** from `runtime/baselines/v1.17.1-ipad-hud-walk/assets/index-BhoGQRaA.js` into `<scratch>/bundle-gen/apgen.js` (node) |
| 2 | `bundle_layouts.py [ids]` | runs it with loadMap's exact arguments (`id.charCodeAt(0)*251`, floor, floors, the multi-entrance flags, castle, mechanic) → `bundle-gen/<floor>.json` with the map plus every side channel (`portalPairs`, `patrolWaypoints`, `windCorridorDir`, `correctExitY`, …) |
| 3 | `bundle_contact.py` | `bundle-layouts-f1.png`: the real F1 of all 20 dungeons, tile-coloured |
| 4 | `bundle_render.py floor,floor [--fast \| --cells]` (`BUNDLE_ART_OUT` overrides the out dir; previews use `bundle-art-cells/`) | **trunk dungeons** use the shipped splat renderer on the content crop plus a 3-cell rock frame (`offsetCells` recorded for the runtime blit). **Mazes** (forest-maze, maze-hunter) use a per-cell autotiler, because the splat renderer deletes 1-cell walls. Writes `bundle-art/<floor>-{props,walk,mech-preview}.png` + `.json`, and **checks the art's walk mask against the game's walls cell by cell** (`collisionMismatchCells`). `--cells` runs the per-cell renderer on any dungeon in seconds, with a style per dungeon (`CELL_STYLE`): tower = dressed blocks + flagstones + sky window slits, masonry = dressed blocks, forest = tree crowns, cave. It bakes static mechanic ground (slide ice, stoppers, quicksand). All 20 F1s are 0 mismatches. |
| 5 | `runq_bundle.sh QUEUE [--fast]` | memory-aware render queue (touch `<scratch>/STOP` to stop dispatching) |
| 6 | `bundle_previews.py` | `act{N}-dungeons.png` + `<floor>-real-preview.png` on the mount |
| 7 | `write_codex_briefs.py` | Codex briefs + `run-dungeons.sh` in `/mnt/project-files/edu-rpg/codex-gen/dungeons/`: 9 material 2×2 sheets, 2 mechanic-tile 3×3 sheets, 2 maze autotile 4×4 sheets |

Facts established:

- Only `Math.random` inside `Ap()` is the darkness-pulse waypoint order and the tripwire shuffle.
  Neither changes the wall/floor grid, so the **layouts are deterministic** and safe to bake.
  Mechanic tiles (wind, ice, lava phase, quicksand, portals, tripwires) stay runtime layers.
- Seed collision: every "s" dungeon shares a base layout (stormNest, shadowCave, scorchedRuins,
  stormreachSpire, sunkenTempleDungeon). stormreachSpire's floors equal shadowCave's cell for cell
  in walkable count.
- Materials are still the derived placeholders (`themes.py`) until the Codex sheets come back.
  `make_dungeon_materials.py --quilt-only` turns a returned sheet into `mat-*.png`, and the
  renderers pick it up unchanged.
- Runtime wiring still to do (lead): a dq-tiles path that blits `<floor>-props.png` at
  `offsetCells*48` over the **unchanged** engine mapData for these dungeons. No mapData swap, so
  mechanics are kept. Each `-walk.png` is the feet-collision mask in crop coordinates.

---

# First pass (superseded): authored layouts, Act 1 method


Design previews and runtime-shaped files only. **No game code, no `public/`/`dist/` writes, no
builds.** Everything big lands in the scratch tree
(`$ACTS_DUNGEON_SCRATCH`, default `/tmp/claude-0/-home-claude/c446ac0c-2689-576d-8fff-6176ff6d9aad/scratchpad/acts/dungeons/`);
review PNGs go to `/mnt/project-files/edu-rpg/acts-preview/dungeons/` (`$ACTS_DUNGEON_PREVIEW`).

## How Act 1 got its layouts (and why Acts 2–5 follow it)

Act 1 floors are **not** the bundle's seeded generator. They are AUTHORED by
`scripts/build_dungeon_semantic.py` (joint-controlled karst patterns, ADR-0076 chests, 3-cell canvas
frame, `validate()`), cut to `public/act1-dungeon-floors.json` by `export_act1_dungeon_floors.py`,
and swapped into `scene.mapData` at runtime by `public/dq-tiles.js` (`A1D_MAPS`, `a1dApply`). The
engine reads `mapData` for collision, so **the authored JSON is the collision** — art and gameplay
agree by construction (986/986 cells verified on 2026-08-03).

The bundle generator (`Ap()` in `dist/assets/index-BhoGQRaA.js`) could in principle be run headless,
but it is the wrong reference: it seeds from `mapId.charCodeAt(0) * 251` (stormNest, shadowCave,
scorchedRuins, stormreachSpire, sunkenTempleDungeon and sunkenCellar all share seed 115), declares
every dungeon 100×100, and Act 1 rejected it outright (ART-DIRECTION rule 5). So these scripts import
`build_dungeon_semantic` **unchanged** and only swap its `DUNGEONS`/`OUT`/`ACT`. Same seed rule
(`crc32(id) + floor*7919`), so every layout is reproducible.

**Faithfulness statement:** these layouts are faithful to gameplay *exactly as Act 1's are* — once
the lead adds the dungeon to the mapData override. Without that override the game still runs its
procedural map and this art would not match it. Nothing here was invented outside the generator.

## Pipeline (run from repo root, in order)

| step | script | output | Act 1 equivalent |
|---|---|---|---|
| 0 | `bundle_dungeons.py` | drift check: floors/boss/mechanic vs the **shipped bundle** (exit 1 on drift) | — |
| 1 | `author_floors.py [--floor1-only] [--only id]` | `design/<id>-fN.json`, `<id>-review.png`, `index.json` | `build_dungeon_semantic.py` |
| 2 | `materials.py [--sheet PATH]` | `design/materials/<id>/mat-{floor,wall,rubble,accent}.png` + `materials.json` | `make_dungeon_materials.py` |
| 3 | `render_floors.py --all-f1 \| --all \| --floors a-f1,b-f2 [--fast]` | `runtime/act<N>-dungeon-art/<floor>-{props,walk}.png` | `render_dungeon_material_map.py --props` / `--emit-mask` |
| 4 | `bake_runtime.py [--floor1-only]` | `runtime/act<N>-dungeon-floors.json`, `<floor>-f1-overhead.png` (+ jamb-patched f1 walk), `<floor>-chests.png` | `export_act1_dungeon_floors.py`, `bake_dungeon_arch.py`, `make_dungeon_chest_patches.py` |
| 5 | `previews.py [--floors all]` | `act{2,3,4,5}-dungeons.png`, `<floor>-preview.png` | `build_dungeon_review_page.py` |

`specs.py` holds the 20 dungeon specs; `themes.py` the material recipes + TARGET/WATER grades;
`tune_specs.py` re-finds joint nudges if a spec stops validating.

Render cost: ~25 min and ~4.4 GB peak per 50×46 floor at 3-way parallel on 4 cores. Do not run
more than 3 at once on a 16 GB box.

## What is verified

- **Act 1 reproduces byte-identically** through the shipped renderer here
  (sunkenCellar-f1-props.png, max pixel diff 0) — the cloud path is the shipped path.
- `_h32` (the fast hash monkeypatched in `render_floors.py`) is **bit-identical** to the renderer's
  `_h` (array_equal on 9 M coords incl. negatives, 4 seeds). `--fast` blur is NOT bit-identical
  (≤1.5e-6 float diff) and is opt-in; floor-1 previews were rendered without it.
- All authored floors (105) pass `validate()` (ADR-0076 chest clearance, 3-cell frame, payoff
  distance, spacing, fill band). 12 dungeons needed a joint-bearing nudge (`tune_specs.py`).
- Floor counts / boss ids / mechanics match the **bundle** (`bundle_dungeons.py`), not
  `src/data/maps.ts`, which is stale for 15 of 20.
- Arch bake invariants (16 px body passes the jambs; overlay never hides the hero) run unchanged
  and refuse rather than write.

## Gaps (for the lead / owner)

1. **Mechanic dungeons cannot simply join `A1D_MAPS`.** 12 of 20 carry a bundle mechanic
   (wind, forest-maze, ice, darkness-pulse, sand-trap, lava-course, mirror, wind-tower, maze-hunter,
   shadow-portal). Their state comes from `Ap()`'s return (`portalPairs`, `patrolWaypoints`,
   `windCorridorDir`, `goldenChestPos`, `correctExitY`, lava/ice tile ids, fixed maze grids). A
   mapData swap discards it. Each needs either mechanic data authored into the floor JSON plus a
   dq-tiles adapter, or the mechanic dropped for that dungeon — an owner decision. The 8
   mechanic-free dungeons (ironMine, oasisDepths, banditHideout, scorchedRuins, emberMines,
   obsidianCavern, demonBarracks, voidRift) can use the Act 1 path as-is.
2. **Second entrances.** hauntedForest, shadowCave, magmaTunnels, volcanicForge have a second
   overworld link (`toFloor`) into a deeper floor; the authoring generator only puts a mouth on F1.
3. **Size curve not locked.** `base` sizes continue Act 1's growth but are a proposal.
4. **Materials are derivations, not generations.** No image tool here; every set is a recolour /
   overlay of the four Act 1 sets (same hand and texel scale), so floors visibly share source
   textures across themes. A Codex 2×2 sheet per theme via `make_dungeon_materials.py` is the
   upgrade path; the renderer would pick it up unchanged.
5. **Arch silhouettes are borrowed** from Act 1 (`bake_runtime.ARCH_FROM`). Owner rule is authored
   arches; none exist for Acts 2–5.
6. Props (chest, stairs, boss smoke, save, sign) are the shared Act 1 sheet — no per-theme props.
7. Boss ids in the layout JSON are the bundle's; the runtime export strips them anyway, like Act 1.

## Runtime wiring Act 1 needed (to extend, not done here)

- `public/dq-tiles.js`: `A1D_MAPS` (≈l.4376) scopes the override; `a1dFetch` loads
  `act1-dungeon-floors.json` (≈l.4385); `a1dFloorFor`/`a1dApply` swap mapData; `A1D_TILE` maps asset
  kinds → tile ids; walk mask `act1-dungeon-art/<key>-walk.png` (≈l.4955, feet collision
  `a1mFree` with `A1M_FOOT`12/`A1M_LEAN`4); layer ladder `-props.png`/`-overhead.png` (≈l.6992–7011);
  prop sprites `act1-dungeon-art/assets/` (≈l.7078); open-chest strips `-chests.png` (≈l.7113).
  Many guards are `floor===1 && A1D_MAPS[...]` (entry rescue, save marker, arch), so a new act needs
  its own floors JSON + art dir, or the Act 1 names generalised.
- `scripts/runtime_baseline.py` pins `act1-dungeon-*` files (hash + public/dist twin);
  `scripts/build-dist.sh` assembles `dist/` and the iOS payload; `dq-tiles.js` is pinned in four places
  and `act1RuntimeSnapshot.ts` is regenerated by `scripts/extract_act1_runtime_snapshot.mjs`.
- `seed_ios_save.py` derives dev spawns from the floors JSON.
- `scripts/check_hero_fits_wall_face.py` gates wall face 0.95 against the hero sheet — still holds,
  since the renderer is unchanged.
