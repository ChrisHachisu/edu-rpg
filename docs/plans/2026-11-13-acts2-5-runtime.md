# Acts 2–5 overworld and towns in the shipped game (build 96 base)

Date: 2026-11-13 · Branch `acts-world-wip` · Status: wired, ON by default, cloud-verified headless.
Grew from the build 91 prototype study `docs/plans/2026-10-28-acts2-5-runtime-wiring.md` (branch
`acts2-5-world-wip`). This document describes what is on this branch. Dungeon interiors are not
part of it: only their overworld mouths moved.

## 1. What the player gets

* Outside Act 1 the overworld is the owner-painted continent (Acts 2–5), streamed as 16-cell
  chunks, with the nine later towns as hi-fi towns (Cinderwatch included).
* The 33 owner doors open the bundle's own maps. Interiors return to the owner's exit cells. The
  compass, the minimap and encounter zones follow the new geography.
* Act 1 (`act1-hifi/`, `act1-world-map.js`) is untouched.

## 2. Switch

ON by default. Debug kill switch: `localStorage['qok-multiact-hifi'] = '0'` or `?multiact=0`.
`acts-hifi/acts-runtime.js` then returns on its first line. Every hook it would install is
`undefined`, and `dq-tiles.js`, `act1-hifi/adapter.js` and `ui-overhaul.js` guard each use, so the
game is the build 96 game with the bundle's old geography.

## 3. Files

| File | Role |
|---|---|
| `public/acts-hifi/acts-runtime.js` | The runtime: streaming, plates, pixel collision, doors, exits, compass, zones, save migration, hosted town, minimap hand-over |
| `public/acts-hifi/manifest.json` | Index (`qok-acts-hifi-v2`): acts, doors, `owner` / `pack` / `reach` rasters (RLE), texts of the hosted town |
| `public/acts-hifi/overworld-relief.png`, `minimap.json` | Minimap of the new world and its pins |
| `public/acts-hifi/towns.json` | Installed towns and Cinderwatch's texts (source of the index's `towns` / `strings`) |
| `public/act{2..5}-hifi/` | Per act: `manifest.json`, `chunks/{ground,front,crest}`, `collision.bin` (QOKF8COL, 32 px per cell), `plate.json`, `underpaint.webp`, `landmarks/*.png` |
| `public/act1-hifi/town/<id>-*` | The nine towns, Act 1 layout |
| `public/dq-tiles.js` | Hooks, all guarded by `window.__QOK_ACTS__`: sole-disc test and glide normal per act, hold while a pack loads, no procedural props or landmark props under act art, no legacy terrain canvas under act art, movement-field refresh, shared chunk budget (`act1Resident`, `trimAct1Chunks`), `soleSpec` |
| `public/act1-hifi/adapter.js` | Town id Set shared with the runtime, walk-in spawn, town art id for a hosted town, text fallback |
| `public/ui-overhaul.js` | `window.__QOK_MINIMAP__.set(src, marks)` |
| `index.html` | One script tag (`/acts-hifi/acts-runtime.js`) |

## 4. How it works

* **Collision.** Under an act's art its pixel pack is the only terrain authority. `dq-tiles.js`
  `a1mFree` calls `__QOK_ACTS__.free` with the same sole disc Act 1's forest bits answer (radius,
  offset, closing radius and glide normal come from one function, `a1fSoleSpec`). The cell plate
  in `mapData` only carries fully blocked cells (tile 2 or 4) and the doors, for the engine.
  In overlaps the `pack` raster says which act answers a cell: the owner act, except inside a
  landmark sprite's mask box, which answers to the act that drew it.
* **Doors.** A door answers a hero in front of it. The bundle's frozen doors for remapped maps
  return nothing. Door tiles are the bundle's own (6 town, 7 cave, 8 Demon Castle, 9 portal,
  10 Haunted Forest, 12 Storm Nest, 15 Crystal Cave, 16 Frozen Lake, 19 Desert Tomb).
* **Exits.** Chosen by the builder with the TIGHT sole-disc model: the cell in front of the gate,
  standable and joined to the place where the door answers. Dungeon exits are rewritten in
  `checkTransition`, town exits in the town json (and in `loadMap` as a net).
* **Cinderwatch** has no map in the bundle. It is entered as the engine map `embersRest` (shop,
  healer and save are Act 4's) while the adapter shows Cinderwatch's plate, people and exit. The
  story flag `acts.town.cinderwatch` says which town she is in, so Continue resumes correctly.
  Its three townspeople and its name come from the index's `strings` (EN, kana, kanji).
* **Save migration.** A save without the story flag `acts.geo2` that continues on the overworld
  outside Act 1 holds a position in the old geography. It is moved once to the new exit of the
  old door it was nearest to (same old zone). Later, a position the `reach` raster does not mark
  is moved to the nearest exit of its own act.
* **Memory.** One budget of 12 resident chunks for the whole world, shared with Act 1: act chunks
  not asked for go first, then Act 1 hands back chunks its window does not touch. Prefetch
  margin 4 cells. Off the overworld (town, dungeon, battle) every act layer leaves the GPU.
* **Act 1 keeps its baked movement field.** `dq-tiles.js` checks `act1-overworld-walk.bin` against
  the map tiles it was baked over, 45 cells past Act 1's rectangle and with a whole-map muted-water
  rule. So the act plates are written only after dq-tiles has consolidated a new overworld array
  and given it Act 1's plate (`__DQ_TILES__.overworldSetupDone`), the array is copied once before
  the first plate, and the bake check reads that copy outside Act 1's rectangle
  (`__QOK_ACTS__.legacyMap`). Without this Act 1 had no movement field whenever a plate landed
  first. A sweep (one act per tick) also puts back any plate cell something else rewrote.
* **Leaving a town.** The adapter holds the screen black until Act 1's base chunks under the
  camera are drawn, for at most 5 s. Outside Act 1 there are none, so the runtime answers the same
  question (`__A1_VISIBLE_BASE_COVERAGE__`, wrapped) for the act chunks on screen: ready when
  each has its ground layer up. Without the wrap every Acts 2-5 town opened on 5 s of "Loading".
* **Overrides over Act 1** (`public/acts-hifi/overrides/<id>/`, listed in the index):
  `act1-crystal-cave` (carved mouth art, extra rock bits, hides the old sprite) and
  `act1-north-seam` (rock over the canal and cut cliff tops where Act 1 meets Act 5; collision
  unchanged). Both are drawn over Act 1's layers; Act 1's files are not touched.
* **Encounter zones** follow the owner raster: Act 2 `iron-mountains`, Acts 3–4
  `scorched-wastes`, Act 5 `demons-threshold`. Act 1's rectangle keeps the bundle's rule.

## 5. Rebuilding after an art or town change

```
ACTS_VARIANT=C ACTS_OUT=<export root> python3 scripts/acts/export_collision_bin.py   # if the export has no .bin yet
sh scripts/acts/rebuild_world.sh <export root> [<towns root>]   # install, index + plates, minimap, world gate
python3 scripts/acts/write_gate_manifest.py                     # re-pin the files for the ship gate
sh scripts/acts/build_cloud_dist.sh /home/user/work/dist        # playable cloud dist (never the repo dist/)
```

`rebuild_world.sh` also installs `<export root>/overrides/*/`. The north seam is built with the
prototype branch's `scripts/acts/act1_seam_override.py` (needs the Codex kits and the Act 5
render; run it from a tree whose `public/` is this repository's, so it reads this build's Act 1
files) and its `override.json` + PNG tiles are copied to `public/acts-hifi/overrides/act1-north-seam/`.

`scripts/acts/check_world.py` is the gate (plan §5 of the prototype study). It must print PASS:
every door answers from a standable place, every exit is standable, each segment is one walkable
component (TIGHT model), and no two segments or Act 1 share one (LOOSE model). Segments:
`act2-west`, `act2-north` (behind Haunted Forest), `act3+act4-south`, `act4-north` (behind Magma
Tunnels, variant C), `act5`.

## 6. Ship gate allowlist

`scripts/runtime_baseline.py verify-act1` is a closed allowlist, and `scripts/build-dist.sh` copies
into `dist/` exactly what the gate reports missing. The Acts 2–5 files are pinned in one generated
manifest, `runtime/manifests/acts-hifi-files.json` (`path -> [bytes, sha256]`), written by
`scripts/acts/write_gate_manifest.py`. It covers `acts-hifi/**`, `act{2..5}-hifi/**` and the nine
towns' files under `act1-hifi/town/`. `runtime_baseline.py` unions those paths into the allowed
set and checks size, sha256 and the public/dist twin of each. Nothing else new is allowed.

## 7. Pins the Mac must confirm

Cloud re-stamped (values in `runtime-HANDOFF.md` of the integration run): `public/dq-tiles.js`
(four places), `public/ui-overhaul.js`, the derived static shell (two places), and the generated
manifest above. Not stampable in the cloud: `ACT1_PAINT_MANIFEST_SHA256` / `ACT1_PAINT_UNDERPAINT`
(stale since build 91), the forward terrain profile descriptor's `act1-hifi/adapter.js` sha, and
anything `scripts/regenerate_pins.py` derives from a Mac `dist/`. Never `npm run repin`.

## 8. Headless probes (`scripts/acts/probe/`)

`towns.cjs`, `mouths.cjs`, `walk.cjs`, `logic.cjs`, `act1_identity.cjs`. Each seeds a v4 save,
continues from the title, drives real input and writes JSON plus screenshots to `PROBE_OUT`.
`NODE_PATH=/opt/node-tools/node_modules PROBE_URL=http://127.0.0.1:5182/ node scripts/acts/probe/<probe>.cjs`.

## 9. Known gaps

* The bundle's two tile gates on the old overworld are not in the painted world: the wind canyon
  (tile 13, Windbreaker Stone) and the magma field (tile 21, Flame Cloak). The Flame Cloak check
  on entering Magma Tunnels still applies. The canyon needs an owner decision on where it sits.
* The six overworld signposts (tiles 11/20) are gone with the old geography.
* Entering Cinderwatch marks Ember's Rest visited, because the engine map is shared.
* The bundle plays a one-time wind effect and sets `canyon.windCleared` when she carries the
  Windbreaker Stone over the OLD canyon cells (x 221-222, y 275-298), now ordinary Act 2 ground.
* At the Act 1 / Act 2 seam Act 1 holds its own ring of chunks, so the shared count can reach 14
  (8 Act 1 + 6 on screen); the runtime then holds on-screen chunks only.
* `act1-north-seam` leaves a few straight panel edges (seen at x 102 and x 111, rows 216-218).
