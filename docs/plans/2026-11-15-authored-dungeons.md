# Authored Acts 2–5 dungeons: engine, art pipeline, mechanic modules (track E1)

Date: 2026-11-15 · Branch `acts-world-wip` · Status: engine wired and ON for Ember Mines and
Obsidian Cavern (5 floors each); Iron Mine floor 1 ships disabled (layout smoke only).
Cloud-verified headless by `scripts/acts/probe/dungeon_authored.cjs` (section 8). Not yet played
on a phone by the owner. Layouts are data: plan JSON in, art and runtime data out, by script.

## 1. What the player gets

* An Acts 2–5 dungeon listed in `public/acts-dungeons/manifest.json` plays the owner-approved floor
  plan instead of the bundle's generated floor: hand-shaped rooms, painted organic walls from the
  Codex material sheets, chasms, lava and pillars, on the same continuous movement Act 1 dungeons
  use (the hero is stopped by the painted edge, not by a square).
* Everything else is the bundle's own: chests and their loot, the crystals (heal and warp, no
  save), the boss fight, its flags and rewards, random encounters from the dungeon's own zone,
  save and Continue. No story flag is added, removed or renamed.
* A dungeon that is not in the manifest, or is `enabled:false`, or a floor the manifest does not
  carry, keeps the generated floor. The game stays finishable while dungeons move over one by one.

## 2. Switch

ON by default for every `enabled` manifest entry. Debug kill switch:
`localStorage['qok-dungeons2'] = '0'` or `?dungeons2=0` (the manifest is not even fetched; all 18
dungeons are the bundle's generated ones again). Disabled (smoke) entries turn on with
`localStorage['qok-dungeons2-smoke'] = '1'` or `?d2smoke=1`.

## 3. Files

| File | Role |
|---|---|
| `public/dq-tiles.js` | The engine: block "AUTHORED ACTS 2-5 DUNGEONS" (`a2d*`) plus small guarded hooks in the Act 1 dungeon path (`a1d*`, `a1m*`) |
| `public/acts-dungeons/manifest.json` | `qok-dungeons2-v1`: `dungeons` (floors, authored floors, boss id, mechanic id, enabled, bytes), `floors` (grid, assets, landings, mechanic data, pillar atlas), `modules` (mechanic scripts to load) |
| `public/acts-dungeons/<id>/<id>-f<n>-material.webp` | The flattened floor picture, 48 px per cell |
| `public/acts-dungeons/<id>/<id>-f<n>-walk.png` | 1-bit walk mask, same size: white = her soles may stand |
| `public/acts-dungeons/<id>/<id>-f<n>-over.webp` | Only where a floor has pillars: lossless atlas of what stands in front of her |
| `scripts/acts/dungeons2/` | The pipeline (section 6) |
| `scripts/acts/probe/dungeon_authored.cjs`, `act1_dungeon_identity.cjs` | The proofs (section 8) |
| `scripts/acts/build_cloud_dist.sh`, `write_gate_manifest.py` | `acts-dungeons` added to the copy list and to the gate allowlist |

## 4. How the engine works

The authored floors JOIN the Act 1 dungeon path instead of copying it. `A1D_MAPS[id]` is `1` for an
Act 1 dungeon and `2` for an authored one; the manifest's floors are merged into `a1dFloors`.
From there the same code runs: the `mapData` swap inside the instance-level `loadMap` wrapper
(the bundle's generator still runs and its seeded `h()` calls are consumed and ignored, AGENTS.md
rule 6), the walk mask and its distance field, the continuous mover, the prompt pill, the boss
sprite, the crystal menu. Every rule that is Act 1's alone is now behind `A1D_MAPS[id]===1`
(wall-embedded entrance crystal, baked mouth arch, the three-floor limit), so Act 1 dungeons draw
and move exactly as before (pixel-identical, section 8).

What an authored floor adds:

* **Tiles.** The exporter turns plan terrain into `#` / `.` rows and the plan's assets into engine
  tiles: mouth 6 (every cell across the corridor), stairs back 6, stairs on 9, boss 7, chest 4,
  crystal 14, sign 18, a second mouth 10. The engine's own transition code then does the work:
  tile 6 on floor 1 leaves by the dungeon's first connection, which `acts-runtime.js` remaps to
  the owner's exit cell; 6 deeper is `__floor_up__`; 9 is `__floor_down__`; 10 leaves by the last
  connection.
* **Arrivals.** The engine places the hero after `loadMap` from a tile scan, which is ambiguous on
  an authored floor. The engine wraps `performTransition` to record how she came (`a2dVia`), picks
  the floor's baked landing (`land.mouth`, `mouth2`, `fromPrev`, `fromNext`, `entrance`), and
  applies it on the next dungeon tick, under the transition's black. Every landing is checked
  against the mask when it is exported.
* **Art.** One flattened picture per floor; stairs and mouths are painted in; chests, crystals,
  signs and the boss are live sprites (the Act 1 asset sprites) with baked contact shadows. The
  picture is blitted window by window through a 2D canvas, so its size is not bound by the GPU
  texture limit.
* **Walk-behind.** Wall tops overlap her through the mask alone (her soles stop at the painted
  foot of a wall, so her head overlaps the wall above, as in Act 1). Free-standing pillars are
  real walk-behind: each is a sprite from the `-over.webp` atlas at depth 10.6 while her soles are
  north of its base line, 9.4 otherwise.
* **Crystals.** Floor 1's crystal is the entrance crystal: dormant (tinted, no prompt) until a
  deeper one is touched; afterwards it lists every floor whose crystal she has touched
  (`warp.<id>.f<n>`). Deeper crystals heal and offer "warp to entrance". No crystal saves.
* **Second mouths.** A mouth on a deeper floor (or with `sealedUntil:"bossDefeated"`) is tile 10
  and is rock until the boss flag is set. Entering from the overworld onto a floor above 1 lands
  on `land.mouth2`. If the bundle's door table names a floor the authored dungeon does not have,
  the floor is clamped to the last one.
* **No minimap** in dungeons (the game has none; `ui-overhaul.js`). Fog is the bundle's, unchanged.

## 5. Mechanic module API (for the per-dungeon mechanic tracks)

A mechanic is one script, listed in the manifest's `modules` array (same-origin path), that calls

```js
window.__QOK_DNG2__.register('<mechanic id>', {
  load(ctx)                        {},  // floor applied (also after Continue): build sprites, read ctx.flags()
  unload(ctx)                      {},  // leaving the floor; everything passed to ctx.own() is destroyed for you
  tick(ctx, deltaMs)               {},  // every frame while she is on the floor
  input(ctx, stick, px, py)        {},  // before movement; stick is {x,y,m} or null. Return a new {x,y,m}, null to hold her, undefined to leave it
  free(ctx, px, py, tx, ty)        {},  // may her soles stand at this pixel? false = blocked, true = open (overrides the mask), undefined = the mask decides
  bump(ctx, tx, ty, dx, dy, tile)  {},  // she pushed into cell (tx,ty); return true if handled (the engine then skips its own chest / boss / sign bump)
  step(ctx, tx, ty, prevTx, prevTy){},  // her centre entered a new cell; return false to skip this step's encounter roll
  interact(ctx, px, footY, best)   {}   // return {tx,ty,dx,dy,verb,act} to show the prompt pill with `verb`; act() runs on tap. `best` is the engine's own candidate
});
```

The module id is the plan's `mechanic.id` (`mine-carts`, `ice-slide`, …); one module serves every
floor of every dungeon with that id. All hooks are optional and are wrapped in try/catch.

`ctx` (one per floor visit):

| Field | Meaning |
|---|---|
| `ctx.id`, `ctx.floor`, `ctx.key` | dungeon id, floor number, `<id>-f<n>` |
| `ctx.mechanic` | the plan's `mechanic` block, verbatim |
| `ctx.plan` | the manifest floor: `rows`, `assets`, `land`, and for a mechanic floor `terrain` (the plan's full character grid), `mech` (the plan's mechanic assets: levers, carts, plates, …), `zones` |
| `ctx.terrain(x,y)` | plan character of a cell (`=` rail, `+` junction, `_` chasm, …) |
| `ctx.tile(x,y)` / `ctx.setTile(x,y,t)` | engine tile; `setTile` marks the floor for redraw (open a door = set 0, close = 1) |
| `ctx.hero()` / `ctx.place(px,py,dir)` | `{x,y,footY,tx,ty,dir}` / move her (a cart ride, a slide, a teleport) |
| `ctx.flags()` / `ctx.flagKey(name)` | story flags object / `d2.<id>.f<n>.<name>`: persistent state goes there and nowhere else, so it is saved with the game |
| `ctx.state` | scratch object for this visit |
| `ctx.own(obj)` | register a Phaser object for automatic destroy |
| `ctx.depth` | `{ground:2, object:3, hero:10, over:10.6}` draw layers |
| `ctx.say(text, name)` | the game's message box (text must come from the string tables; keep EN/JA/kanji in sync) |
| `ctx.scene`, `ctx.TILE` | the WorldMapScene and 48 |

Walk mask and mechanics: the exporter leaves mechanic cells as the plan classes them (`=` rail and
`+` junction are floor unless the dungeon table makes them a hazard). A module that needs a cell
closed or opened at runtime answers `free()`; it does not edit the mask.

`window.__QOK_DNG2__` also exposes `ctx()`, `manifest()`, `authored(id)` and `state()` (used by
the probe). The probe registers a do-nothing module under each dungeon's mechanic id and asserts
that every hook fires.

## 6. Art pipeline (cloud, no build)

Inputs: the plans (`/home/user/work/plans/out/<id>-f<n>.json`, schema `qok-floorplan-v1`) and the
Codex material sheets (`/home/user/work/codex/out/mat-*.png`). Paths are in
`scripts/acts/dungeons2/d2common.py`, with the per-dungeon table (sheet, colour targets, which plan
characters are chasm / lava / pillar, floor calming).

```sh
# 1. once per dungeon: quilt the Codex sheet into seamless material tiles
python3 scripts/acts/dungeons2/import_materials.py emberMines obsidianCavern ironMine
# 2. one floor per process (3.5-8 min, 2.2-3.8 GB each; two at a time on 4 cores / 15 GB)
python3 scripts/acts/dungeons2/render_plan.py emberMines-f1 [--skip-existing] [--crop x0,y0,x1,y1] [--q 85]
# 3. plan + art -> runtime data, with validation (exit 1 on any failure)
python3 scripts/acts/dungeons2/export_runtime.py emberMines obsidianCavern --smoke ironMine:1
# 4. pins
python3 scripts/acts/write_gate_manifest.py && python3 scripts/acts/restamp_cloud_pins.py
# 5. a servable copy, and the proof
sh scripts/acts/build_cloud_dist.sh /abs/out
NODE_PATH=/opt/node-tools/node_modules PROBE_URL=http://127.0.0.1:5190/ PROBE_OUT=/abs/dir \
  node scripts/acts/probe/dungeon_authored.cjs emberMines obsidianCavern ironMine:smoke
```

`render_plan.py` reuses the Act 1 renderer (`scripts/render_dungeon_material_map.py`: organic wall
field, wall faces, tops, grading) and adds: floor calming, deep-rock darkening, chasm with a lit
lip and a cliff face, lava with crust and glow, mouths carried to the map edge with daylight,
pillars (painted, plus the over atlas), baked stairs, contact shadows under live props. The walk
mask is cut from the same fields as the paint, so blockers follow the painted edge. Output is
WebP q85, stepping down by 5 until the floor is under 1.6 MB; the mask is a 1-bit PNG; the over
atlas is lossless WebP.

`export_runtime.py` validates with the game's own sole model (foot offset 31 px, clearance 17 px):
every landing standable, every chest / crystal / staircase / boss reachable from the landing,
every route cell standable, no walkable pixel outside the plan's open cells. A layout tweak is:
edit the plan, re-render that floor, re-export, re-pin.

## 7. Sizes

Shipped in `public/acts-dungeons/` (floor pictures WebP, 48 px per cell; cap 1.6 MB per floor):

| Dungeon | Floors | Floor pictures (MB) | Masks + over atlas | Total |
|---|---|---|---|---|
| Ember Mines | 5 | 1.37 · 1.46 · 1.37 (q80) · 1.42 (q80) · 0.98 | 0.08 MB | **6.67 MB** |
| Obsidian Cavern | 5 | 1.10 · 1.18 · 1.37 (q80) · 1.56 (q80) · 0.80 | 0.14 MB | **6.15 MB** |
| Iron Mine (floor 1 only, disabled) | 1 of 4 | 1.03 | 0.01 MB | 1.04 MB |
| `manifest.json` | | | | 0.04 MB |

Unmarked floors are q85. Four of the ten floors met the cap only at q80.

**Estimate for all 18 dungeons (93 floors, 215,199 cells):** the eleven floors above cost
515 bytes per cell. At that rate, with the 1.6 MB cap holding the 15 largest floors (they will step
down to roughly q70-q75), the whole set is **about 105-110 MB** (per dungeon: 3.4 MB for Sunken
Temple up to about 9 MB for Demon Barracks and Void Rift). If that is too much for the app, the lever is the cap
(`CAP_MB` in `render_plan.py`): 1.2 MB per floor gives about 96 MB, 1.0 MB about 87 MB, at a
visibly lower quality on the large floors. A smaller render scale would save more but needs the
runtime to blit at a scale other than 48 px per cell; that is not built.
Render time for the remaining 82 floors: about 9 hours of one 4-core machine (two at a time).

## 8. Proof

@@PROOF@@

## 9. Open issues

@@ISSUES@@
