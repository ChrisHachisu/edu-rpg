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

Walk mask and mechanics: the mask opens the plan characters `. = g t z q h`, plus the characters
the dungeon table in `d2common.py` lists under `open` (the manifest floor repeats them as
`open`, e.g. `"~"`); every other character is rock, or the hazard the table names for it. A
module that needs a cell closed or opened at runtime answers `free()`; it does not edit the mask.
What is painted and what is left to the module is in section 6a.
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
# 2. one floor per process (0.5-3 min on a free core since E2, 2-4.7 GB each)
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
WebP q85, stepping down by 5 (to q40 at the lowest) until the floor is under 1.6 MB; the mask is
a 1-bit PNG; the over atlas is lossless WebP.

Rules the E2 floors added to the renderer (all in `render_plan.py`, after Act 1's `floor_field`):

- **Deep rock stays rock.** Act 1's passes remove rock too thin to carry a face; plan rock that
  touches no open cell is put back, so nothing opens out to the picture's edge.
- **A wall between two areas stays a wall.** Act 1's neck trimming removes walls about one cell
  thick. Any wall cell that touches two areas the plan keeps apart (no open cell joins them, not
  even corner to corner), and every `rock` character of the dungeon table (a cracked wall), is
  forced to rock, about 1.2 cells thick.
- **A route cell keeps its ground.** Where the organic wall edge swallows a route cell (no
  standable ground that continues out of the cell), a lane 0.9 cell wide is cut through it along
  the route. The render log names each such cell.
- **Posts.** Where the dungeon table names a `posts` character (Sunken Temple), a free-standing
  rectangle of wall at least 2x2 that Act 1's rules would remove is painted as one pier.
- **Edge-hugging plans** (open cells on the border, or a border wall one cell thick) render with
  two extra rock cells all round, cropped off again.
- **Mouths deep inside the map** (more than 3 rock cells from the edge) get a lit bay two cells
  deep instead of a corridor to the edge.
- **Speed.** Disc morphology by distance transform and value noise blended per lattice row are
  bit-identical to Act 1's and about 4x faster together; blurs of sigma >= 48 master px run on a
  reduced copy (mask identical, picture within WebP noise). `D2_SLOW_MORPH`, `D2_SLOW_NOISE`,
  `D2_SLOW_NOISE2`, `D2_EXACT_BLUR` switch each one off.

### 6a. What the picture holds, per mechanic (track E2)

No mechanic ASSET is painted or put in the mask (cart, buffer stop, lever, gust window, shadow,
crystal light, tablet, door, tripwire, spike patch, hint, trough, turntable, furnace, guard, block,
ice block, reset bell, hunter, portal, wheel): they arrive in `floor.mech`, the module draws them and
blocks the solid ones through `free()`. Terrain is painted like this:

| Dungeon | Painted | Mask |
|---|---|---|
| ironMine | `=` two rails and sleepers baked into the floor; `+` chasm with a timber trestle and the same rails; `_` chasm. Track runs through cell centres, rails 0.19 cell either side, quarter-circle turns, a junction carries every branch | `=` open, `+` `_` closed |
| frozenLake, frostfallCavern | `~` ice from the sheet's ice quadrant; `o` frosted rocks standing on it (walk-behind tops in the over atlas); frostfall `w` dark water | `~` open, `o` `w` closed |
| stormNest, stormreachSpire | `_` and `^` open air (sky / storm cloud) with the stone face of the walkway under each north lip; `q`, `z` plain floor | `q` `z` open, `_` `^` closed |
| desertTomb | each glyph-plate zone is a blank stone slab let into the floor (no glyph); door cells are plain floor | `g` open |
| scorchedRuins | `x` is ordinary wall, `h` ordinary floor | `x` closed, `h` open |
| magmaTunnels, volcanicForge | `l`, `c`, `m` lava; `t` plain floor | `c` `m` `l` closed, `t` open |
| demonBarracks | `p` pillars (walk-behind) | closed at the base |
| voidRift | `_` and `v` the same starry void | closed |
| oasisDepths | every channel (`w` flooded at the start, `d` dry) as its dry stone bed | `w` `d` open |
| sunkenTempleDungeon | the maze's free-standing 2x2 wall posts as square piers (walk-behind); Act 1's wall rules would have dropped them | closed at the base |
| shadowCave, hauntedForest, banditHideout, twilightDungeon | rock and floor only | |

A second mouth with `sealedUntil` is painted open. Its rock fall is a separate overlay,
`<floor>-seal.webp` (lossless RGBA) with `floor.seal = [{x,y,w,h,sx,sy}]` (floor px rectangle and
atlas origin): the engine draws it under the hero while the mouth is sealed and should block the
mouth cells it covers. A second mouth on floor 1 (Haunted Forest's north mouth) is `mouth2`
whether or not it is sealed.

`export_runtime.py` keeps the manifest entries of dungeons it is not asked about, lists every
`public/acts-dungeons/modules/*.js` in `modules` (sorted; the engine loads them async, so no
order is promised), and exports a mechanic dungeon `enabled:false` until `--enable <id>` (a
flipped entry stays flipped). Ground that she only reaches through the mechanic is declared in
the dungeon table, not waived: `links` are plan characters that are closed in the mask but that
the mechanic carries her across (trestle `+`, crust `c`, mold `m`, block lane `v`, cracked wall
`x`, frostfall water `w`), `pair_links` are asset kinds that teleport (twilight portals by
`pair`). The areas on either side of one link group are joined for every reachability check and
printed as "via mechanic"; anything still cut off fails the export.

`export_runtime.py` validates with the game's own sole model (foot offset 31 px, clearance 17 px):
every landing standable, every chest / crystal / staircase / boss reachable from the landing,
every route cell standable, no walkable pixel outside the plan's open cells (the corridor
beyond a mouth excepted), and no standable area that spans two areas the plan keeps apart (a
lost wall). A layout tweak is:
edit the plan, re-render that floor, re-export, re-pin.

## 7. Sizes

Shipped in `public/acts-dungeons/` after E2 (floor pictures WebP, 48 px per cell; cap 1.6 MB per
floor picture). Unmarked floors are q85:

| Dungeon | Floors | Floor pictures (MB) | Masks, over, seal | Total |
|---|---|---|---|---|
| obsidianCavern | 5 of 5 | 1.10 · 1.18 · 1.36 (q80) · 1.56 (q80) · 0.80 | 0.14 MB | **6.15 MB** |
| ironMine (disabled) | 4 of 4 | 0.88 · 1.46 · 1.23 · 1.56 | 0.05 MB | **5.18 MB** |
| frozenLake (disabled) | 5 of 5 | 0.81 · 1.04 · 1.08 · 1.15 · 0.97 | 0.07 MB | **5.13 MB** |
| stormNest (disabled) | 5 of 5 | 0.47 · 0.50 · 0.51 · 0.53 · 0.44 | 0.04 MB | **2.49 MB** |
| shadowCave (disabled) | 5 of 5 | 0.74 · 0.98 · 1.25 · 1.34 (q80) · 1.15 | 0.20 MB | **5.66 MB** |
| hauntedForest (disabled) | 1 of 1 | 1.58 (q45) | 0.02 MB | **1.60 MB** |
| desertTomb (disabled) | 5 of 5 | 0.67 · 0.75 · 0.87 · 0.97 · 1.12 | 0.04 MB | **4.43 MB** |
| banditHideout (disabled) | 5 of 5 | 0.69 · 0.88 · 1.35 · 1.40 · 0.83 | 0.06 MB | **5.21 MB** |
| magmaTunnels (disabled) | 5 of 5 | 0.80 · 1.17 · 1.48 · 1.53 (q80) · 1.21 | 0.18 MB | **6.37 MB** |
| scorchedRuins (disabled) | 5 of 5 | 0.93 · 1.14 · 1.34 · 1.41 · 1.23 | 0.05 MB | **6.09 MB** |
| volcanicForge (disabled) | 7 of 7 | 0.66 · 0.67 · 0.72 · 0.87 · 0.93 · 1.15 · 0.92 | 0.19 MB | **6.09 MB** |
| demonBarracks (disabled) | 6 of 6 | 0.88 · 1.23 · 1.38 · 1.48 · 1.59 · 1.14 | 0.44 MB | **8.13 MB** |
| frostfallCavern (disabled) | 6 of 6 | 0.81 · 0.82 · 1.18 · 0.85 · 0.83 · 0.83 | 0.07 MB | **5.38 MB** |
| stormreachSpire (disabled) | 6 of 6 | 0.78 · 0.84 · 0.82 · 0.77 · 0.77 · 0.66 | 0.03 MB | **4.67 MB** |
| twilightDungeon (disabled) | 6 of 6 | 0.70 · 0.77 · 0.81 · 1.08 · 1.11 · 1.48 | 0.07 MB | **6.03 MB** |
| sunkenTempleDungeon (disabled) | 6 of 6 | 0.64 · 0.85 · 0.98 · 1.19 · 1.34 · 1.57 | 0.32 MB | **6.89 MB** |
| voidRift (disabled) | 6 of 6 | 0.91 · 0.88 · 1.27 · 1.31 · 1.48 · 1.18 | 0.07 MB | **7.10 MB** |
| emberMines | 5 of 5 | 1.43 · 1.49 · 1.41 (q80) · 1.45 (q80) · 1.01 | 0.08 MB | **6.86 MB** |
| oasisDepths (disabled) | 5 of 5 | 0.77 · 0.61 · 0.69 · 0.66 · 0.64 | 0.02 MB | **3.39 MB** |
| `manifest.json` | | | | 0.67 MB |

**19 dungeons, 98 floors, 219,267 cells: 102.9 MB of art plus a 0.67 MB manifest** (469 bytes
per cell). Seven floors met the cap below q85: six at q80 and Haunted Forest's single 60x45 floor
at q45 (leaf litter over the whole floor; it still reads cleanly at 48 px). Demon Castle (9
floors) is not in the set: its layouts were never recovered (section 9).

If the total is too much for the app, the lever is the cap (`CAP_MB` in `render_plan.py`) and a
re-render: a full pass of all 98 floors is now about 2.5 hours of one core (it was 9 hours before
the E2 speedups). A smaller render scale would save more but needs the runtime to blit at a scale
other than 48 px per cell; that is not built.

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
2. **Ember Mines floor: calmed in E2.** What read as busy was colour, not grain: the floor's
   luminance texture already matched Obsidian's, its hue spread was 2.6 times larger (ember
   specks). `floor_sat` 0.10 and `floor_coarse` 0.42 pull the specks and the pebble blobs toward
   the floor's own colour; all five floors were re-rendered (numbers in section 7).
3. **Second mouths.** Shadow Cave f5, Magma Tunnels f5 and Volcanic Forge f7 have a sealed one,
   Haunted Forest an open north one. The picture shows a sealed mouth open; `<floor>-seal.webp`
   and `floor.seal` carry the rock fall (section 6a). The engine has to draw that overlay while
   the boss flag is unset, and keep the mouth cells blocked under it.
4. **Mechanic visuals are the module's job**, with the exceptions in section 6a (rails, trestles,
   ice, rocks, lava, void, piers, blank plate slabs, channel beds are painted). Tripwires, spike
   patches, portals, cooling crust, troughs, glyphs and every moving thing are not in the picture.
   A cracked wall is painted as wall: the module draws the opening once it is broken.
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
12. **Size.** 102.9 MB of art for 19 dungeons (section 7). The manifest is 0.67 MB of JSON
    (rows, terrain, mechanic data for 98 floors), fetched once at start.
13. **Slow network on Continue.** If a save inside an authored floor is continued before the
    manifest arrives, the generated floor could show until the next tick re-applies. The resume
    check passes on a local server; a throttled run was not made.
14. **Mac-only pins.** `runtime_baseline.py verify-act1` still stops in the cloud on
    `ACT1_PAINT_MANIFEST_SHA256` (stale since build 91, as before this track). The cloud-stampable
    pins and the gate manifest (`runtime/manifests/acts-hifi-files.json`, now 1,232 files with
    `acts-dungeons/**`) are re-stamped and pass their own `--check`.
15. **Demon Castle has no plans.** The planning page holds five mirror-room templates (A-E) and
    a table of which rooms each of the nine floors uses, and nothing else: no hall or corridor
    layout, no room positions, stairs, chests, crystals, throne or mouth. It was not invented;
    the castle still runs on the bundle's generated floors until someone lays it out.
    **Closed in E4:** the owner approved nine laid-out floor plans (`demonCastle-f1..9`, generator
    `plans/dungeons/demonCastle.py`). They are rendered (`d2common.py` entry `demonCastle`:
    polished slab floors in the mirror rooms from the sheet's accent quadrant, pits, piers, and on
    floor 9 a dais, carpet and throne), exported and enabled: 9 floors, 13.5 MB, which makes the
    set 20 dungeons, 107 floors, 116.4 MB. The module is `mirror-rooms.js` (left-right swap only,
    the bundle's both-axes flip switched off; pit falls go back to the doorway she came in by; a
    Dark Knight walks the guarded halls); floor 9's boss tile is the bundle's own Demon King
    fight and ending. Probe: `scripts/acts/probe/mech/mirror-rooms.cjs`.
16. **Oasis Depths is recovered but assumed in one place.** The five floors come cell for cell
    from the planning page's pictures (a solver over the recovered plans gives the page's own
    wheel-turn counts), except floor 1's mouth: the page draws the start inside the room, so a
    3-cell corridor and a mouth were added under it (`assumed: true` in the plan). It ships
    disabled: there is no `sluice-wheels` module. Channels are painted as flat stone beds;
    water is the module's to draw. No crystals: the page shows none.
17. **Re-rendered Ember Mines was validated by the exporter only.** `dungeon_authored.cjs
    emberMines` should be run again on the new pictures before the next build (masks moved by
    a few pixels).
18. **Light band on flat ground.** The stepped lamp light shows as a pale ellipse on very even
    floors (Desert Tomb plates, Oasis sand, Frostfall snow). Harmless, visible.
19. **A lost wall is now an export failure**, not a warning: the first Scorched Ruins pictures
    had no cracked walls at all (Act 1's thin-wall trimming) and passed every older check.

