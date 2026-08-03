---
date: 2026-07-20
type: geography-design-spec
project: edu-rpg-map-engine-semantic-data
milestone: act1-checkpoint2-gate1
status: design-authority-for-gate1
method: docs/plans/2026-07-20-act1-terrain-class-method-decision-brief.md
---

# Act 1 Gate 1 — macro geography design + barrier-continuity ledger

This is the **design authority** for the Gate 1 macro terrain-class map. It is authored by the lead (product judgment). The Codex worker implements a deterministic generator that realizes THIS geography; it does not invent geography. The naturalness must come from the generation METHOD (elevation fields, rivers by descent, forest matrix, noise-displaced boundaries), never from drawing bands.

## 0. Coordinate contract (authoritative, from the codebase)

- World grid: `320 x 400` (`ACT1_RUNTIME_SNAPSHOT_WORLD_SIZE`, `src/map-engine/generated/act1RuntimeSnapshot.ts:10`).
- Act 1 plate bounds: `[16, 218, 163, 399]` = x∈[16,163], y∈[218,399] (`ACT1_RUNTIME_SNAPSHOT_BOUNDS`, same file:12).
- Plate size: **148 wide × 182 tall**. Plate-local transform: `local = (world.x - 16, world.y - 218)`. Native transform: plate maps to the locked `2368 x 2912` frame (16 native px per world cell).
- **Orientation: low world.y = NORTH (top), high world.y = SOUTH (bottom).** Low x = WEST, high x = EAST.
- Terrain representation to match: `Act1SurfaceClass[][]` (`src/map-engine/act1Overworld.ts:19,34`). Author the macro map in the SAME world-coordinate system so anchors index it directly; only the plate sub-rectangle is meaningful.
- **Land/water authority = the canonical runtime snapshot, NOT a fresh downsample of the native PNG.** Use `ACT1_RUNTIME_SNAPSHOT_ROWS` (`src/map-engine/generated/act1RuntimeSnapshot.ts:14`), a 148×182 grid of digit-per-cell strings indexed `[world.y - 218][world.x - 16]`. A cell is **water iff its char === `'2'`** (this is exactly the runtime's own test, `act1Overworld.ts:364`); every other code (`0,1,3,6,7`) is LAND. This is the immutable macro coastline the runtime already uses — consuming it directly preserves the locked coastline and sidesteps the straddle-cell ambiguity of downsampling the 2368×2912 PNG. Water cells are FIXED as `water`; the generator classifies ONLY land cells into the organic terrain classes. (The native PNG `…/checkpoint-1-frame/frame-land-mask.png` remains the immutable art-scale coastline for later gates; a NEAREST downsample of it to 148×182 may be used only as a failable sanity cross-check against the snapshot, never as the source — if they disagree materially, STOP and report, do not silently override.)

## 1. Landmark anchors (validation inputs, not geometry sources)

Read exact `at` (threshold) + `approach` for all eight from `src/map-engine/act1Overworld.ts` (`GREENHOLLOW_APPROACH` … `CRYSTAL_GATE`, and each landmark's `at`). World coords, with plate-local in brackets:

| Landmark | approach (world) | plate-local | zone |
|---|---|---|---|
| Greenhollow (start town) | (60,341) | (44,123) | west-south — largest open basin |
| Sunken Cellar (dungeon) | (45,349) | (29,131) | far-west-south, Greenhollow spur |
| Whispering Woods Cave (side dungeon) | (80,311) | (64,93) | center-west, wooded pocket |
| Millbrook (floodplain town) | (100,321) | (84,103) | center, on the river |
| Port Sapphire (harbor town) | (130,291) | (114,73) | east, coastal hub |
| Coastal Reef (dungeon) | (140,349) | (124,131) | southeast bay, sea contact |
| Darkfang Grotto (dungeon) | (120,261) | (104,43) | far north, enclosed pocket |
| Crystal Cave / Act 2 | approach (148,294), gate (148,293) | (132,76)/(132,75) | far east, sealed pass |

Every landmark `at` and `approach` cell MUST be walkable in the final map. Bridges/decks already fixed: `ACT1_GREENHOLLOW_MILLBROOK_BRIDGE_DECK`, `ACT1_PORT_REEF_BRIDGE_DECK = [{x:140,y:345}]`, harbor channel `port-sapphire-harbor-channel`. Read and honor them.

## 2. Class palette (Gate-1 review palette; runtime mapping for Gate 3)

| class | walkable | indexed color (review) | runtime map (Gate 3) |
|---|---|---|---|
| water | no | deep blue `#1b3a5b` | water |
| meadow | yes | soft green `#7fae5a` | meadow |
| trail | yes (guidance) | tan `#c8a26a` | trail |
| lightForest (scrub) | yes | olive-green `#5f8043` | meadow (walkable) + forest-fringe render |
| forest (dense) | no | dark green `#24421f` | forest |
| cliff | no | grey-brown `#6b5d4f` | mountain |
| mountain | no | grey `#8a8f96` | mountain |
| structure (settlement) | no | warm stone `#a89078` | mountain (blocked footprint) |
| landmarkSolid | no | dark stone `#4a4038` | mountain (blocked, one opening) |
| bridge | yes | plank `#b98a4e` | trail (walkable over water) |

Owner caveat (locked): **lightForest = forest-floor ground walked BETWEEN sparse trunks; individual trunks/canopy are blockers, and the eventual art (Gate 4) must never depict walking on top of trees.** At macro scale lightForest is a walkable fringe class; the "trunks block" detail is enforced at Gate 3/4, not painted per-cell here.

## 3. Barrier-continuity ledger — every blocker belongs to a named continuous system

For each system: physical type, extent, generation method, and physical cause (why it exists here). No orphan blocker patches.

1. **Coastline (locked).** Type: land/sea boundary. Extent: full frame from the mask. Method: `water` = every black mask cell; classification only touches white cells. Cause: the sea. Port harbor and Coastal Reef must retain sea contact (≥1 contiguous coast run each, as in prior checks).

2. **Crystal Range (east wall).** Type: mountain range with cliff flanks. Extent: a continuous N–S spine along the eastern plate margin (roughly local x 118–148, y 20–110), wrapping east/north of the Crystal Cave anchor (132,76). Method: elevation-field ridge — seed a high-elevation ridgeline polyline along the east margin, build a distance-to-ridge field, `mountain` above a high elevation threshold, `cliff` on the steep flank band, foothills fade to forest. Displace the ridge polyline and thresholds with simplex noise so the range has an irregular crest and lobed foothills, never a straight edge. **One saddle** lowered at the Crystal Seal Gate (132,75) to a walkable throat. Cause: a coastal mountain range; the only way east is the pass.

3. **Darkfang Highlands (north wall).** Type: highland/cliff mass, continuous with the Crystal Range at the NE corner (one northern massif, not two patches). Extent: local x 80–120, y 12–52, enclosing Darkfang Grotto (104,43) in an interior pocket. Method: same elevation-ridge treatment, a second ridge seed running E–W across the north, joined to the Crystal Range. Darkfang's pocket = a small low-elevation clearing inside the massif. **One gap** (Darkfang Gap) lowered on the south flank toward Port. Cause: northern highlands; Darkfang is reached only through the gap.

4. **Dense Forest Matrix (the 47%).** Type: old-growth forest, the DEFAULT interior cover. Extent: all land that is not high-elevation (systems 2–3), not river/floodplain (system 5), and beyond the basin distance-fields (§4). Method: forest is the base fill of land; basins and corridors are CARVED OUT of it, not bands drawn into open space. Edges = basin-distance-field + simplex noise → lobed, never circular or straight. `lightForest` = the fringe band (a noise-perturbed distance ring) between open basins and dense forest. Cause: the land is forested; you move where valleys, floodplains, and clearings open the canopy.

5. **Millbrook River + floodplain (central divider).** Type: river (water) with an open floodplain. Extent: descends from the Darkfang Highlands (north) and runs south/southwest through the center past Millbrook (84,103), reaching the sea or a coastal confluence. Method: steepest-descent path on the elevation field from a highland source to a coast cell; widen to a 1–3 cell river with noise; `water`. Floodplain = a low, open `meadow` band hugging the river near Millbrook. The river is the barrier between Greenhollow Vale and the Millbrook/east side. Cause: a river; crossed only at bridges. **Bridge** at the Greenhollow–Millbrook deck.

6. **Coastal cliffs + Coral Reef shelf (south/SE).** Type: cliff bands on parts of the south coast; the Coral Reef dry rock shelf. Extent: intermittent `cliff` where the elevation gradient meets the south coast; the reef shelf at the SE bay around Reef (124,131). Method: cliff where steep gradient meets coast; the reef = a `cliff`/rock shelf carrying a curved approach to ONE `landmarkSolid` cave mouth (surviving Coral Reef v2 decision — curved approach, dry shelf, single cave, no dock/stairs). Cause: sea cliffs and reef rock.

## 4. Roaming basins — open country carved from the forest matrix

Three basins, each a broad free-roam area. Method: for each, a noise-perturbed distance field from the basin's anchor cluster defines `meadow` (inner) → `lightForest` (fringe) → `forest` (matrix). Radii tuned to hit the distribution targets (§6). Basins must be NON-CONVEX (lobed), never discs.

- **Greenhollow Vale (west-south, largest).** Anchors: Greenhollow (44,123), Sunken (29,131), reaching toward Whispering (64,93). Broadest open country per the reconstruction contract. Whispering Woods sits in its own wooded sub-pocket (denser fringe) at the vale's NE lobe.
- **Millbrook Floodplain (center).** Anchor: Millbrook (84,103). Open floodplain along the river; medium basin. Connects west (via the bridge) and east (via the Millbrook–Port pass).
- **Port Sapphire Basin (east, coastal).** Anchor: Port (114,73). Eastern coastal open area; the hub that reaches Reef (bridge, SE), Darkfang (gap, N), Crystal (seal pass, E).

## 5. Gateways — each a named natural formation, never a rectangular cut

| gateway | connects | formation | location (plate-local) | throat |
|---|---|---|---|---|
| Greenhollow–Millbrook Bridge | Vale ↔ Floodplain | bridge over the river | at the fixed bridge deck | 1–3 cells, `bridge` over `water` |
| Millbrook–Port Pass | Floodplain ↔ Port basin | wooded valley gap through the forest matrix / southern toe of the highlands | ~(100,85) corridor | ≥2 cells, `meadow`/`lightForest` |
| Port–Reef Causeway | Port ↔ Reef | causeway/bridge over the harbor bay + Coral Reef dry shelf → one cave mouth | Port–Reef deck (124,127)→Reef (124,131) | ≥1 cell `bridge`, then shelf |
| Port–Darkfang Gap | Port ↔ Darkfang | ridge saddle / canyon mouth in the highlands | ~(108,55) saddle | ≥2 cells |
| Port–Crystal Seal Gate | Port ↔ Crystal/Act2 | sealed mountain pass (one saddle) | (132,75) | ≥2 cells, dynamic seal overlay |

Gateways are produced by LOWERING the elevation ridge (pass/gap) or bridging water (deck) at the named location, so the opening is a consequence of the terrain, not a hole punched in a band. The dynamic Crystal seal is a SEPARATE overlay layer, never baked into the static class map (closed and open states both valid).

## 6. Distribution targets (reconstruction contract, measured over LAND cells)

- open (meadow + floodplain): **32% ±4%**
- trail (roads/aprons, guidance): **8% ±2%** — rendered as guidance; contributes zero to the walkable-boundary logic (walkable regardless).
- dense forest (blocked): **47% ±5%** (lightForest counts toward open/walkable, NOT toward this 47%).
- cliff + mountain (blocked): **13% ±3%** (Crystal Range + Darkfang Highlands + coastal cliffs).
- structure + landmarkSolid are small and counted separately; they do not blow the four buckets.

## 7. Generation method (deterministic, seed = 42) — organic BY CONSTRUCTION

Single seeded PRNG (`ACT1_OVERWORLD_CANONICAL_SEED = 42`), fixed stage order:
1. Load land mask → `water`/land.
2. Elevation field: ridge seeds (Crystal Range, Darkfang Highlands) high; coast low; simplex-noise perturbation. → `mountain`/`cliff` by threshold + gradient.
3. River by steepest descent from a highland source to coast; widen + noise → `water`; floodplain `meadow`.
4. Forest matrix = remaining land; carve basins via noise-perturbed distance fields from anchor clusters → `meadow` (inner), `lightForest` (fringe).
5. Gateways: lower ridge saddles (Millbrook–Port, Darkfang Gap, Crystal Gate); place `bridge` decks (Greenhollow–Millbrook, Port–Reef).
6. Landmark solids: place each dungeon/ruin `landmarkSolid` with ONE opening facing its approach; settlement `structure` footprints with open aprons; ensure every `at`/`approach` walkable.
7. Trails: thread `trail` along the 7 story routes as guidance only (walkable already).
8. Noise-displace EVERY class boundary (except the locked coast) so no edge is straight and no barrier is uniform-width.

## 8. Failable linters (must pass before owner review — mechanical, not approval)

1. No interior class boundary has an axis-aligned run > 3 cells (the locked coast is exempt).
2. Every blocker system's cross-section width varies (reject uniform-width bands): per-system min/max width ratio ≥ 1.5.
3. Blocker connected components have bounding-box fill ratio < 0.7 (reject rectangles/blocks).
4. Basins are non-convex: solidity (area / convex-hull area) < 0.9.
5. Every gateway throat ≥ its spec width and is the SOLE aperture between its two basins.
6. All 8 landmark `at` + `approach` cells walkable; all 7 story routes connect on the walkable union; guards hold (Reef only via Port; Whispering ⊬ Darkfang; Darkfang ⊬ Crystal directly).
7. Distribution within §6 tolerances.
8. Crystal closed-state and open-state both yield a valid walkable union (seal overlay applied).
9. Two-run determinism: identical output across two builds.
10. Coast contact preserved for Port and Coastal Reef.

## 9. Review views to render (for the owner Gate-1 pack)

- barrier-only view (blockers vs walkable, NO routes, NO labels) — for judging naturalness blind.
- terrain-logic view (full class palette).
- anchor + route overlay (validation evidence, drawn on TOP, clearly a separate layer).
- gateway close-up sheet (each gateway named with its formation).
- native-scale and locked-phone-scale renders.
- linter report (pass/fail per §8) + distribution table.

The owner judges NATURALNESS on the barrier-only + terrain-logic views; the mechanical linter PASS is necessary, not sufficient.
