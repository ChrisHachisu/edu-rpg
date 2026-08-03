---
date: 2026-07-29
type: handoff
tags: [edu-rpg, overworld, semantic-maps, owner-placement]
---

# Owner placement carved into the generator — in progress

## What shipped

The owner's hand placement is now the generator's **input**, saved verbatim and never
re-derived:

- `design/continent-terrain-class-method/layout-planner/owner-layout.json` — 40 landmarks
- `design/continent-terrain-class-method/layout-planner/owner-layout-strokes.json` — blocker
  spines and path markers, split back into individual pen strokes

Applied:

- **`g2.LANDMARKS` re-authored** to the owner's cells for acts 2–5.
- **All four connectors now exist on both sides** (`Crystal Cave East`, `Shadow Cave North`,
  `Magma Tunnels South`, `Volcanic Forge West`) — this was the "acts 2 to 5 are all missing
  the connector dungeon" defect. `SEPARATORS` mouths updated to match.
- **New Act-4 town** seeded at the owner's scribble, `Cinderwatch` (257,42). Name is a
  placeholder; owner has not chosen one. Art only so far — no maps.ts / WorldMapScene /
  i18n / NPC data yet.
- **`carve_owner_blockers()`** (g3) grows each stroke into a range: noise-varied radius
  1.4–4.6 cells so ridges pinch and bulge. ~16.3k cells across acts 2–5.
- **`open_landmark_approaches` and `grow_reachable_ground` now take the blocker mask** and
  refuse to dissolve it. Those two passes silently reopening deliberate walls is the
  mechanism behind "the deliberately blocked paths are now connected at different places".
- **`ROUTE_GUIDES` and `STORY_CHAIN` re-authored** against the new placement, plus a new
  `a4-embers-cinderwatch` route.
- **`ACT_TOWN` updated** in g3 and `check_semantic_map_gates.py` — every reachability proof
  floods from the owner's towns now, not the old ones.

## Locked decisions

- **Act 5's Last Bastion next to Demon Castle is intentional** (owner, 2026-07-29): the
  player arrives, sees the castle, learns it needs the 4 relics, and is pushed south.
- **The Demon Castle route stays in `ROUTE_GUIDES`.** Deleting it deleted the moat —
  `apply_demon_moat` draws the moat *from* that route, and the moat is the gate.
- **Blocker strokes are read as range CRESTS, not region outlines.** Thickening outward
  from the line avoids the which-side-is-blocked ambiguity and looks natural.

## OWNER DECISION — act 1: **RE-CUT IT** (locked 2026-07-29)

The owner chose option **(b)**: re-cut act 1 to their placement, including moving the
bridge decks and updating the matching game runtime constants so the art and the game
agree. Act 1 is NOT to be left at its old layout.

That makes the three "held" reverts below temporary scaffolding. Undo all three as part of
the re-cut:

1. `assign_organic_biomes` `candidates` back to `(1, 2, 3, 4, 5)` (act 1 competes, so its
   own doors are claimed by the landmark-claim bias).
2. Crystal Range back to the owner's mouths `((140, 278), (170, 283))`, `Crystal Cave East`
   back to `(170, 283)`, `connector-crystal` and `a2-crystal-ironkeep` re-authored, and
   `STORY_CHAIN` entries 2 and 3 updated.
3. Remove the `act1_zone` fence and the `if act == 1: continue` guard in
   `carve_owner_blockers` so act 1's own strokes are finally applied.

And restore the owner's act-1 cells in `g2.LANDMARKS` (they are commented in place):
Greenhollow (69,255), Millbrook (39,344), Port Sapphire (133,347), Sunken Cellar (30,274),
Whispering Woods (101,233), Coastal Reef (142,352), Darkfang (91,378), Crystal Cave
(140,278). Note Whispering Woods / Coastal Reef / Crystal Cave are nudged 2 / 19 / 9 cells
from the raw owner cells onto genuine act-1 land — see the comment in `g2.LANDMARKS` for
why. **Once act 1 is re-cut those nudges may no longer be needed; re-derive them.**

### Why this is not just a coordinate swap

Act 1's authority lives in `scripts/act1_terrain_class_lib.py`:
`LANDMARKS` (`at`/`approach` cells), `ROUTES`, `GATEWAYS` (named formations: bridge, wooded
valley gap, causeway, highland saddle, sealed mountain saddle), `CRYSTAL_GATE`,
`RIVER_CREST` / `CRYSTAL_CREST` / `DARKFANG_CREST`, and `BRIDGE_DECKS`.

`build_act1_terrain_class_macro_v4.py` proves the skeleton connects via `ROUTES`, not
`ROUTE_GUIDES` — updating only `ROUTE_GUIDES` fails with
`STAGE CHECK FAILED: the pre-barrier corridor skeleton is not connected`. Both must move,
plus the `at`/`approach` pairs.

Straight interpolation between the owner's act-1 points swims across three bays. A*
routing over the act-1 land mask with an inland-preferring cost, sampled every ~3 cells,
is the approach that was working — sparse waypoints let the generator's own cardinal fill
swim between them again.

`BRIDGE_DECKS` is the piece that reaches into the game: the decks are world coords minus
`WORLD_ORIGIN`, mirrored in runtime constants. Moving Greenhollow/Millbrook/Port Sapphire
moves the greenhollow-millbrook bridge and the port-reef causeway, so the runtime constants
must move in lockstep or the player walks onto water.

## Original framing of the act-1 decision (superseded by the lock above)

**Act 1 is held at its previous layout.** The owner's act-1 placement is saved but not
applied, because act 1's terrain is not generated by this pipeline: it is an approved
raster from `build_act1_terrain_class_macro_v4.py`, whose `LANDMARKS` (`at`/`approach`),
`ROUTES`, `GATEWAYS` and **`BRIDGE_DECKS`** live in `scripts/act1_terrain_class_lib.py`.
The bridge decks carry an explicit instruction:

> Read from the runtime constants (world coords minus WORLD_ORIGIN): do not infer, resize,
> or redraw these decks in the macro generator.

The owner moved Greenhollow from (60,341) to (69,255), Darkfang from (120,261) to (91,378),
Crystal Cave from (148,295) to (140,278). Honouring that means re-cutting the approved
raster **and moving bridge decks that the game runtime pins** — a gameplay change, not an
art change. That is the owner's call, not the generator's.

Two consequences of holding act 1, both reverted deliberately and both marked in-code with
"restore at the same time as the owner's act-1 placement":

1. `assign_organic_biomes` `candidates` is back to `(2,3,4,5)`. Act 1 competing in the
   membership solve moved the act1/act2 border enough to cut Port Sapphire's roads.
2. The **whole Crystal Range is held** at `((148,295),(172,305))`. Using the owner's act-2
   mouth (170,283) against act 1's held (148,295) puts the two mouths 25 cells apart, so
   they stop being one pass and the border seal walls between them.
3. `carve_owner_blockers` skips the entire `ACT1_BOUNDS` rectangle. Skipping act-1 strokes
   alone was not enough — act-2 membership reaches west into act 1's crop and act-2 strokes
   were walling Port Sapphire's coastal roads inside the approved raster.

## Remaining linter failures (4)

Run: `python3 scripts/build_continent_terrain_class_macro_g3_consolidated.py`

| check | note |
|---|---|
| `all-authored-routes.routes.a4-embers-obsidian` | one act-4 route does not connect; likely crosses the owner's central volcano ring stroke |
| `separators-sealed` | seal proof against the moved mouths |
| `per-act-v4-interior-richness` | a biome's matrix/fringe/open share out of the 25–75 / ≥5 / ≥12 band after the blockers went in |
| `all-41-source-probes` | stale Scorched Ruins probe note still says `208,120`; owner cell is now `171,133` |

Act-1 route connectivity and the story path **pass**.

## Still not started

- Act 2: lake beside Frozen Lake; Haunted Forest 2nd art mouth at (284,258)
- Act 4: volcano at the centre ring, magma flowing west
- `src/data/maps.ts` still holds OLD coords for voidRift + the 4 portals
- `landmark-roster.json`, `WorldMapScene.ts` not yet moved in lockstep with `g2.LANDMARKS`
- Cinderwatch as real playable town (maps.ts, WorldMapScene, i18n, NPCs); shop rebalance deferred by owner
- `DRAW_TRAILS = False` for final art
- Brain capture

## Invariants — do not break

- Dirty tree preserved; **no commits, no builds, never `npm run build`**
- `dist/assets/index-BhoGQRaA.js` byte-identical (4,987,581 bytes)
- Town-to-town walkability must stay **false** for 1→2, 2→3, 3→4, 4→5
- `owner-layout.json` / `owner-layout-strokes.json` are the owner's input — never rewrite
  them to match generator output

## Kickoff prompt

> Continue the edu-rpg overworld carve in
> `/Users/christopherhachisu/Documents/claudecode/edu-rpg-map-engine-semantic-data`
> (branch `codex/map-engine-semantic-data`). Read
> `docs/handoffs/2026-07-29-owner-placement-carve-in-progress.md` first. The owner's
> placement is applied for acts 2–5 and held for act 1 pending their call on re-cutting the
> approved act-1 raster. Fix the four remaining linter failures listed there, starting with
> `a4-embers-obsidian`. Do not apply act 1 without the owner saying so.
