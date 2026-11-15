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
* Everything else is the bundle's own: chests and their loot, the crystals (heal and warp; what
  they write is the auto save, as in every dungeon), the boss fight, its flags and rewards, random encounters from the dungeon's own zone,
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
  picture is blitted window by window through a 2D canvas (the Act 1 path), not uploaded whole
  as one GPU texture.
* **Walk-behind.** Wall tops overlap her through the mask alone (her soles stop at the painted
  foot of a wall, so her head overlaps the wall above, as in Act 1). Free-standing pillars are
  real walk-behind: each is a sprite from the `-over.webp` atlas at depth 10.6 while her soles are
  north of its base line, 9.4 otherwise.
* **Crystals.** Floor 1's crystal is the entrance crystal: dormant (tinted, no prompt) until a
  deeper one is touched; afterwards it lists every floor whose crystal she has touched
  (`warp.<id>.f<n>`). Deeper crystals heal and offer "warp to entrance". The manual save stays a
  town-only thing (`ui-overhaul.js` turns any dungeon save into the auto save).
* **Stairs and the boss's exit.** The engine ignores the first door it is asked about after any
  transition, and she lands right beside a staircase: a query eaten that way is asked again while
  she keeps pushing into the stairs (`a2dIsWayCell`, the Act 1 mouth's retry widened). After the
  boss falls, its cell becomes the exit (tile 10) while her centre already stands in it; pushing
  toward it fires the exit (`a2dOpenedUnder`).
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

Walk mask and mechanics: the mask opens the plan characters `. = g t z q h`; every other character
is rock, or the hazard the dungeon table in `d2common.py` names for it (chasm, lava, pillar). A
module that needs a cell closed or opened at runtime answers `free()`; it does not edit the mask.
`bump` is reported only when she is fully stopped by a cell-shaped blocker (see open issue 5).

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

All headless (Playwright + Chromium, 390x844 phone viewport), against the cloud copy
(`build_cloud_dist.sh`), never against a rebuilt bundle.

`scripts/acts/probe/dungeon_authored.cjs emberMines obsidianCavern ironMine:smoke`:
**112 checks, 0 FAIL** (2026-11-15). Per dungeon, by the real entry path (AGENTS.md rule 7: a v4
save on the overworld at the remapped exit, Continue, a walk into the mouth):

* floor 1 is the authored floor and she lands on the baked landing; the mouth leads back to the
  owner's exit cell; re-entry works;
* every floor: the plan's route is walkable start to exit; every chest opens by the prompt pill and
  sets the bundle's `chest.<id>.f<n>.<x>.<y>` flag (14 chests in Ember Mines, 14 in Obsidian
  Cavern); stairs down, and on floor 2 the stairs back, land beside the right staircase;
* crystals: floor 1's is dormant with no prompt; deeper ones heal, set `warp.<id>.f<n>` and
  `entrance.crystal.<id>.activated`; "warp to entrance" lands beside the entrance crystal, which
  then lists the touched floors and warps back;
* save inside floor 2 (the auto save, which is what the game writes in a dungeon), reload, the
  title's slot picker, "Auto save": same cell of the same authored floor;
* a random encounter on floor 2 from the dungeon's own zone (`magma-tunnels`, `volcanic-forge`),
  fought and won;
* the boss (`magmaBeetleKing`, `crystalHydra`) starts by walking into its marker, is won, sets the
  bundle's `boss.<id>.defeated`; pushing into the exit that opens in its cell returns her to the
  owner's exit cell;
* a do-nothing mechanic module registered under the dungeon's mechanic id: every hook fired and
  received the plan's mechanic data; no page error, no failed request;
* Iron Mine floor 1 (smoke flag on): entry, landing, exit, re-entry, the first stretch of the route.

Screenshots of every floor: `/mnt/project-files/edu-rpg/acts-integration/dungeons-e1/`.

Also run on the same copy:

| Check | Result |
|---|---|
| `dungeon_authored.cjs obsidianCavern:pillars` | 9 checks, 0 FAIL: the pillar's top sprite is at depth 10.6 (over her, 10) while she stands behind it and 9.4 in front |
| `dungeon_authored.cjs emberMines:off` | 5 checks, 0 FAIL: with the kill switch the manifest is not loaded and floor 1 is the bundle's generated 100x100 floor |
| `act1_dungeon_identity.cjs` (base: commit `dedec3b`, before this track) | 9 checks, 0 FAIL: Sunken Cellar f1 and f3, Coastal Reef f2, Misty Grotto f1 and a real walk into Sunken Cellar are pixel-identical (0 px differ); held into a wall she is stopped where the base stops her (within base-against-base noise) |
| `act1_identity.cjs` | 4/4: 0 px, 0 of 25,921 field samples differ at each spot |
| `towns.cjs` | 9/9 |
| `mouths.cjs` | 26/26; the Ember Mines and Obsidian Cavern rows now land on the authored floor, Iron Mine stays generated |
| `scripts/acts/check_world.py` | PASS: 34 doors, 11 segment checks, 1 story gate |
| `write_gate_manifest.py --check`, `restamp_cloud_pins.py --check` | OK (1,232 files; `dq-tiles.js` 697,178 B) |

## 9. Open issues

1. **Not played on a phone.** Everything above is headless. Feel, readability and frame rate on
   an iPhone are the owner's to judge on the TestFlight build.
2. **Ember Mines floor is busy.** The Codex floor sheet is pebbles with glowing embers. It was
   calmed three ways (`floor_calm`, `floor_soft`, `floor_sat` in `d2common.py`) and still reads
   busier than an Act 1 floor. One more turn of those numbers and a re-render of five floors is
   about 25 minutes.
3. **Second mouths are unproven.** None of the three dungeons has one. The code exists (tile 10,
   rock until the boss flag, `land.mouth2`, floor clamp for Haunted Forest) but has never run.
   A sealed second mouth is also still painted open; it needs a sealed overlay.
4. **Mechanic visuals are the module's job.** The renderer paints terrain only. Rails, carts,
   levers, plates and the like are listed in `ctx.plan.mech` and must be drawn by the module.
   Iron Mine floor 1 therefore shows bare floor where its rails run, and cannot be finished on
   foot (its stairs need the cart); it ships `enabled:false`.
5. **`bump` is reported only when she is fully stopped.** Against a painted wall she glides and no
   bump fires; pushed diagonally at a cell-shaped blocker she slides along its face. A push-block
   mechanic should use `interact`, or detect contact in `tick` / `free`.
6. **A pillar hides her completely** while she stands exactly behind it (it is one cell wide and
   1.5 cells tall). Correct walk-behind, but worth a look on the phone.
7. **Stairs in a walking lane.** A staircase fires when her centre enters its cell. Where a plan
   puts one in open floor beside the route (Ember Mines floor 2, stairs back), she can take it by
   accident. A layout note, not an engine fault.
8. **Arrival cooldown on the overworld side.** The engine ignores the first door it is asked about
   after any transition. Inside authored floors this is now retried while she keeps pushing; on
   the overworld a player who exits and walks straight back into the mouth must step off the cell
   first. This is the bundle's behaviour for every door and was left alone.
9. **Lava and chasm are still pictures.** No animation, no glow pulse, and lava is simply not
   walkable (no damage rule).
10. **Chest loot is the engine's roll** (`getTreasureReward()`); the plans carry no loot table.
   Opened chests can be walked through, as in the bundle and Act 1.
11. **The boss marker is Act 1's dark silhouette** at 2.2 cells, not the boss's own sprite; the
    exit after the fight is the engine's portal prop in the boss's cell.
12. **Size.** About 105-110 MB for all 18 dungeons at the current cap (section 7).
13. **Slow network on Continue.** If a save inside an authored floor is continued before the
    manifest arrives, the generated floor could show until the next tick re-applies. The resume
    check passes on a local server; a throttled run was not made.
14. **Mac-only pins.** `runtime_baseline.py verify-act1` still stops in the cloud on
    `ACT1_PAINT_MANIFEST_SHA256` (stale since build 91, as before this track). The cloud-stampable
    pins and the gate manifest (`runtime/manifests/acts-hifi-files.json`, now 1,232 files with
    `acts-dungeons/**`) are re-stamped and pass their own `--check`.
