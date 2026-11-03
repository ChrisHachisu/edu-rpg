# Acts 2–5 town interiors (design previews, not wired)

Nine town plates for Acts 2–5, built in the cloud with **no image generation**. Every pixel of
building, prop, ground and cliff comes from the three shipped Act 1 plates
(`public/act1-hifi/town/{greenhollow,millbrook,portSapphire}-screen.png`), so the new towns are in
the same hand, at the same scale and on the same lattice as Act 1. Each town's collision is
derived from its own composition, which means art and collision agree by construction. Nothing in
`public/`, `dist/`, `src/` or the bundle was touched.

| act | town (maps.ts id) | biome / identity |
|---|---|---|
| 2 | Ironkeep (`ironkeep`) | snow mining town on two stone terraces with stairs; mine mouth, forge yard with braziers and anvil, smelter |
| 2 | Frostwatch (`frostwatch`) | square stone curtain wall, north watchtower, twin gatehouse towers, parade ground, frozen pond |
| 2 | Ravenhollow (`hauntedVillage`) | crooked lanes, houses at odd offsets, fenced graveyard with dead trees, chapel, lanterns, fog |
| 3 | Oasis Haven (`oasisHaven`) | loop road round a central oasis pond, palm ring, bazaar stalls and tents |
| 3 | Ruins Camp (`ruinsCamp`) | canyon camp: excavation pit, two colonnades, low ruined walls, tents, dig office |
| 4 | Ember's Rest (`embersRest`) | lava channel behind stone rims across the town, two bridges, forge, braziers |
| 4 | Cinderwatch (`cinderwatch`) | north-arc wall with a tower, lava moat bridged at the gate. **PROPOSAL: no maps.ts entry**, NPC ids are placeholders |
| 5 | Last Bastion (`lastBastion`) | octagonal crenellated curtain wall, gatehouse and corner towers, keep, brazier-lit muster road |
| 5 | Haven's Edge (`havensEdge`) | cliff-edge hamlet: the north-east drops into a dithered starlit void with floating islets |

## How to run

```bash
cd scripts/acts/towns
python3 extract_kit.py        # cut the Act 1 kit           -> $SCRATCH/kit/   (~20 s)
python3 procprops.py          # palms/pines/graves/etc.     -> $SCRATCH/kit/
python3 ground.py             # quilt lawn/cobble/cliff     -> $SCRATCH/ground/ (cached, ~40 s)
python3 build_town.py [ids]   # plate + collision + json + previews (~20 s per town)
python3 contact_sheets.py     # act{2,3,4,5}-towns.png
python3 render_all.py [ids]   # fast look: $SCRATCH/look/<id>-full.png + all.png (no collision)
ROOFS=1 python3 kit_sheet.py  # look at the kit (red = roof mask, blue = ground left in a cut-out)
```

`$SCRATCH` defaults to the session scratchpad (`TOWNS_SCRATCH` overrides it) and `$PREVIEW` to
`/mnt/project-files/edu-rpg/acts-preview/towns` (`TOWNS_PREVIEW` overrides it). Needs
numpy, scipy, Pillow and node (node runs the walkable validator).

## Pipeline (what each file does)

- `kit.json`: the curated kit. 26 buildings, each cut from an Act 1 plate using that town's
  **authored footprint band** (`design/act1-towns/<town>-authored-obstacles.json`) as the object
  seed, plus trees, bushes, rocks, the well and a fence.
- `extract_kit.py`: ground is pale cobble or sunlit lawn connected to the crop border, and goes
  transparent. The painted shadow is kept as a separate channel so it lands on snow, sand or ash.
  It also writes a roof mask (seeded on the roof chroma) and a "painted ground left inside" mask.
- `ground.py`: Efros–Freeman quilting of the Act 1 plates' own lawn, cobble and cliff. I did not
  use the generated `design/act1-towns/ground/*` swatches because their cobbles are larger than
  the shipped plates'.
- `procprops.py`: the few props Act 1 has no art for (palm, pine, gravestone, dead tree, tent,
  column, mine adit). They are drawn at half resolution, upscaled 2× nearest, outlined and
  textured with Act 1 leaf and stone pixels.
- `features.py`: stone masses (curtain walls with merlons and a dark outline, towers with lit
  windows), terraces with stairs, liquids (pools/channels with Act 1 water texture, cliff rim,
  shadowed north lip, lit south rim) and bridges.
- `layouts.py`: one dict per town, each with its own silhouette (`ringPoly`) and street plan, all in 65-cell units. The order follows Act 1's
  `compose_town.py` rule: streets first, buildings on frontages with door aprons, dressing
  against walls and never in a lane.
- `compose.py`: composites the town in Act 1 colour space and keeps a per-pixel surface-class
  map. It also handles the border (cliff, forest, wall or void), water, the dig pit, the
  painter's sort by foot line, and the blocked mask.
- `grade.py`: re-grades each surface class to the biome (lawn→snow/sand/ash/earth,
  cobble→frosted/sandstone/basalt, roofs→snow caps, foliage→evergreen/olive/dead, water→ice/
  turquoise/lava), adds ground scatter (tufts, pebbles, drifts, cracks), lit windows, then glow,
  smoke and fog. Detail restore takes, per pixel, the stronger of the source's high-pass and the
  output's own, so authored edges are kept and nothing exceeds either. The grade is keyed on source luminance, so the
  Act 1 shading and pixel clusters survive.
- `build_town.py`: builds the collision (feet-only). Blocked areas are building silhouettes,
  the lower 45% of trees and rocks, water, border and void. The result is traced with
  `scripts/derive_town_walkable.py`'s tracer into the `act1-art-fit-polygon-authority-v2`
  schema and checked by **the runtime's own validator**
  (`public/act1-hifi/walkable-polygons.js`). Actors are placed from maps.ts:
  16×16 (x,y) → cell `(v+0.5)*65/16`, then snapped onto foot-clear ground in startCell's
  connected component.

## Outputs

- Previews: `/mnt/project-files/edu-rpg/acts-preview/towns/`
  `act{2,3,4,5}-towns.png`, plus `<id>-plate.png` (full 1950) and `<id>-overlay.png` for each
  town. The overlay marks walkable in green, blocked with a red hatch, and the gate in yellow,
  and shows the NPCs, save point, shop and the hero for scale.
- Runtime-shaped files: `$SCRATCH/runtime/town/<id>-{screen.png,walkable.json,town.json}`.
  They are the same shape as `public/act1-hifi/town/*`. `_placementReport`, `_unreachable` and
  `_validator` are review-only keys.

## Verified

- All nine walkables pass `validateWalkableGeometry`.
- Every NPC, the save point and the shop counter are foot-clear and reachable from `startCell`.
  Moves over 1 cell from maps.ts: embersRest lavaMiner 1.42, hauntedVillage hauntedElder 1.39,
  lastBastion priestess 1.43 (each snapped off a new building/wall footprint); all others ≤ 0.94.
- Healers stand at their maps.ts cell; shopkeepers on the lane in front of their stall. The exit is the south mouth at maps.ts `fromX` (x 34.5).
- Plates are 1950×1950 RGB, 30 art px per cell, so they drop into town.html's 3× device lattice.

## Not verified / gaps

- **Not run in town.html or on device.** Wiring them in needs these steps, as Act 1 did:
  1. copy the three files into `public/act1-hifi/town/`, and their `dist/` twins
  2. add the ids to `TOWN_IDS` in `public/act1-hifi/adapter.js`
  3. add a `LANDMARKS` entry per town in `public/act1-world-map.js`. `exit.toX/toY` must be the
     landmark exit cell, not maps.ts (gated by `scripts/check_town_transitions.py`). I left the
     maps.ts values in place as placeholders.
  4. add pin keys in `scripts/runtime_baseline.py` `ACT1_TOWN_FILES` (see
     `scripts/millbrook_finish_plate.sh` for the three-key gotcha), then `npm run repin`
- **NPC sprites do not exist** for any Acts 2–5 NPC or shopkeeper. The `sheet` paths in the json
  are placeholders. Act 1's bar is `scripts/measure_npc_style.py` step ≥ 22.5 / hard% ≥ 33.
- **Cinderwatch** has no maps.ts, i18n or WorldMapScene entry. Its layout and NPC ids are a
  proposal for the owner to approve.
- Collision is the composition's footprints, not a re-derivation from pixels.
  `derive_town_walkable.py`'s colour classifiers are tuned for green and cobble and do not work
  on snow, sand or ash.
- Round 2 fixed: garden fringe lace on cut-outs, snow-roof bleed, flat ice/lava (textured, rimmed),
  flat Last Bastion wall (merlons, outline, darker coping), blurred snowy lanes.
- Remaining weak spots: the building set repeats (26 source buildings); procedural props are
  cleaner than the painted kit; Act 1 lawn flower specks still show faintly through dead earth.
- `check_town_finish.py --report` (mean step / hard%). Millbrook 15.23 / 19.98%. Ironkeep
  16.53/18.1, Frostwatch 14.88/16.2, Ravenhollow 15.37/18.6, Oasis 16.62/20.6, Ruins 15.71/18.8,
  Ember's Rest 15.21/20.9, Cinderwatch 15.39/20.9, Last Bastion 14.64/19.7, Haven's Edge
  12.96/16.4 (19% of that plate is night sky). All are under the gate's 17/22% floor, as Millbrook is.

## Round 3: back to the Act 1 method (Codex plates)

The owner rejected the kitbash ("buildings do not match the terrain"). These scripts prepare the
Codex image-generation package; generation itself runs only on the Mac.

- `plan_images.py <dir>`: flat colour-key layout guides from the round-2 compositions (shop roof
  red, healer roof green, pale lanes).
- `codex_briefs.py [dest]`: writes `/mnt/project-files/edu-rpg/codex-gen/`: `briefs/` (9 town
  plates, 9 NPC rosters, palm and dead-tree crown sheets, 4 cliff kits), `anchors/` (65-cell
  overworld crops around each town, layout guides, icons, Act 1 style/NPC/canopy/cliff anchors)
  and `run.sh` (sequential `codex exec -m gpt-5.6-sol --skip-git-repo-check -i ...` with the brief on
  stdin; best-of 8 per town, logged to `out/run.log`).
- `check_feet.py [ids]`: sweeps the hero's real feet stencil (dq-tiles `a1fBuildStencil`, scaled to
  the town lattice) from startCell to every NPC, the save point, the shop counter and the exit, at
  stencil width and at stencil + 1 cell. `OW_DIST=<dist>` also checks the overworld town doors.

### Round 3b: finishing the Codex town plates
- `author_codex_bands.py`: hand-authored footprints, lanes, exemptions, well/monument obstacles, shop counter, healer porch, and optional save/gate overrides, all in cells. Writes `<id>-authored-obstacles.json` (Act 1 format).
- `codex_finish.py build [ids]`: takes the pick, upscales 1254 to 1950 with LANCZOS and applies UnsharpMask(1.0, 220, 1). Walkable = lanes minus bands. Actors snap onto ground where the feet stencil fits; the save point gets a cell of extra room. Writes `runtime-codex/town/<id>-{screen,collision,walkable,town}` and the plate and overlay previews.
- `codex_sheets.py`: act contact sheets and the 3-try comparison per town.
- No foreground or roof layer: Act 1 retired it, and the briefs forbid overhangs.
- Lanes approximate the painted paths. NPC sheet paths are placeholders.
- Round 3c (open ground): walkable = floor-like painted ground (kNN on 10 px block texture features, trained on the authored lanes vs footprints and the plate rim, plus a calm-texture test inside the lanes' hull) minus hard bands (walls, towers, water, lava, voids, pits), minus building cores (rect eroded 2 cells), minus non-floor blobs, all with a 1-cell margin; plus the authored lanes; south of the gate row only the street; one component from the gate. Actors more than 3 cells off their maps.ts spot snap to the nearest walkable cell to that spot unless it lies in a footprint.

### Round 3 (towns-r3): authored plans before generation
- `r3_plans.py <dest>`: the authored plan for each town, in cells, keeping each town's r2 character. Walkable ground is cobbled paving plus open yards (snow, sand, ash, grass) with low decoration only; healer, shop and NPC spots are placed per town. Each building blocks its full silhouette and has a door on its south face. Trees and fences stay in the border band.
  - Checks, using the hero's feet stencil from the gate: every NPC spot, the save point (+1 cell clearance), every door landing, and the healer and shop landings (+1 cell). Walkable ground may touch the frame only at the gate, and must form a single component.
  - Writes `anchors/<id>-layout-guide-r3.png`, `plans/<id>-plan.json`, `review/` and `npc-spots-r3.json` (the maps.ts spots, including the moved ones).
- `r3_package.py <dest>`: the briefs (the r2 template plus the NO TALL OBJECTS rules, scrubbed identity and lighting text), `run.sh` (3 tries per town) and `jobs.json`.
- `check_feet.py` now also checks the town.json `"doors"` (healer, shop) in both strict and comfort modes; `pilot2.py` writes them.
- Round 3 finish: `r3_finish.py` with `r3_shapes.py`. Collision is hand-traced per object against each picked painting; tall rims and spires are blocked far enough north that the hero cannot stand behind them; paint-outs copy nearby plate pixels. Each town.json carries a `doors` list; `check_feet.py` skips the shopkeeper, who stands behind the counter, and checks the shop counter instead.
- Round 3 tight-boundary pass (Chris: "boundaries are still set at walkable locations"). The plates are approved and untouched: there are no paint-outs (`paint=[]` everywhere; the Ravenhollow pine is blocked instead).
  - Blockers in `r3_shapes.py` are seeds that `r3_finish.snap_block` snaps to the art with GrabCut per object. The seed is probable foreground, its eroded core is sure foreground, and a dilated ring of 1.2 cells is probable background. Each mask is cleaned with an opening, a hole fill and a core-connected filter.
  - Names starting `x-` are exact hand traces made on 2x crops and are never snapped. These cover terrain, lava rims, ponds and reeds, cliffs, wells, graves and props that GrabCut misreads. `wall-`/`fence`/`rail`/`edge`/`strip`/`cliff`/`bank`/`post-` keep their authored shape. `pond`/`reed`/`bed`/`garden`/`graves`/`pit`/`planter`/`shrub`/`bush` take the union of the snap and the seed.
  - QA (`r3_finish.qa`) only checks; it never sets a boundary. A kNN on 6 px texture and colour blocks, trained on a frozen sample (`<id>-qatrain.npz`; `QA_RETRAIN=1` resamples), flags two things: blocked pixels that look like ground and touch walkable, and walkable pixels that look like an object. The output is `<id>-qa.jpg` in the preview folder and `<id>-qaflags.png` in the runtime folder (R = blocked-looks-ground, B = walkable-looks-object).
  - Open-ground pass: each town's `ground` polygon now runs to the inner painted face of its outer edge (wall, cliff railing, spire face, lava-cliff lip). The courtyards and ring roads between houses and the walls are walkable, and the barrels, crates, shrubs and rubble on them are blocked as `x-` props. Last Bastion (east courtyard), Cinderwatch (east, west and NW ring), Ironkeep (east yard, west fence strip), Haven's Edge (east cliff-top) and Oasis (east sand by the spires) were opened.
