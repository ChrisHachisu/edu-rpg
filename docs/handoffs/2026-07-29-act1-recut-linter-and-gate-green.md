---
date: 2026-07-29
type: handoff
tags: [edu-rpg, overworld, semantic-maps, owner-placement, act1]
---

# Act 1 re-cut to the owner's placement — linter and gate both GREEN

Supersedes `2026-07-29-owner-placement-carve-in-progress.md`.

## What shipped

**Act 1 is re-cut to the owner's cells.** The generator's authority for act 1 now carries
the owner's placement verbatim, and every derived thing — routes, gateway formations,
ranges, river, bridge decks, basins — was re-authored around it, not fitted afterwards.

`scripts/act1_terrain_class_lib.py`

| landmark | owner world cell | plate-local | note |
|---|---|---|---|
| Greenhollow | (69,255) | (53,37) | town, start |
| Sunken Cellar | (30,274) | (14,56) | |
| Whispering Woods Cave | (101,233) | (85,15) | projected 2 cells |
| Millbrook | (39,344) | (23,126) | town |
| Darkfang Grotto | (91,378) | (75,160) | |
| Port Sapphire | (133,347) | (117,129) | town |
| Coastal Reef | (142,352) | (126,134) | projected 21 cells |
| Crystal Cave | (140,278) | (124,60) | projected 9 cells |

**The three projections are unchanged by the re-cut and always will be.** They come from
the runtime coastline in `src/map-engine/generated/act1RuntimeSnapshot.ts`, which the
re-cut does not touch — only act 1's terrain CLASSES were re-authored, never its
land/water mask. Re-derived this session and they land on the same three cells as before.

### The geography the re-cut discovered

Act 1's runtime coastline contains a **691-cell enclosed inland lake** (local x68-84,
y59-117) that the old layout never used. It is now the map's spine: the lake plus a new
east-west **Millbrook River** (lake shore → west coast at y≈91-100) completely severs the
northern Greenhollow basin from the southern Millbrook basin, and the **ford at
(23,94..96)** is the only crossing. Coastal Reef sits on a genuine offshore spit whose only
two mainland contacts are (124,126) and (125,126); the corridor takes the first and the
harbour channel cuts the second, so the **causeway deck at (124,126)** is a real bridge.

- `ROUTES` / `ROUTE_GUIDES` re-derived by **A\* over the act-1 land mask** with an
  inland-preferring cost plus long-wavelength relief, sampled every 3 cells. Straight
  interpolation swims the lake and two southern bays; sparse controls let the generator's
  cardinal fill hug a coastline instead of a valley.
- `CRYSTAL_CREST` now runs east-west across the eastern lobe through the sealed saddle at
  `CRYSTAL_GATE = (117,72)`; `DARKFANG_CREST` east-west across the southern peninsula.
- All ten v4 stages PASS, **all five gateways are sole apertures**, two-run determinism
  matches.

### Bridge decks (world coords = plate-local + WORLD_ORIGIN 16,218)

| deck | plate-local | world |
|---|---|---|
| greenhollow-millbrook-bridge | (23,94) (23,95) (23,96) | **(39,312) (39,313) (39,314)** |
| port-reef-causeway | (124,126) | **(140,344)** |

### The three held reverts — all undone

1. `assign_organic_biomes` `candidates` back to `(1,2,3,4,5)`.
2. Crystal Range restored to the owner's mouths `((140,278),(170,283))`, centre `(155,280)`;
   `Crystal Cave East` back to `(170,283)`; `connector-crystal` and `a2-crystal-ironkeep`
   re-authored; `STORY_CHAIN` entries 2 and 3 updated.
3. `carve_owner_blockers`'s `act1_zone` fence and `if act == 1: continue` guard removed —
   act 1's own strokes now apply (2021 cells).

## Both gates are GREEN

```bash
python3 scripts/build_continent_terrain_class_macro_g3_consolidated.py   # linter failures: []
python3 scripts/build_semantic_map.py
python3 scripts/check_semantic_map_gates.py                              # semantic map gates: PASS
```

- `--verify-determinism`: two identical hashes
  (`a09336f39bb98189e7037622316f899253a9663ba739e8f1983e302de13124da`).
- Town-to-town walkability **False** for 1→2, 2→3, 3→4, 4→5.
- **41 of 41 landmarks reachable from their own act's town**; both mouths of all four
  connectors approachable from their own side.
- `dist/assets/index-BhoGQRaA.js` byte-identical (4,987,581 bytes, md5
  `60d90b63607b6e6980eb170aeeed445e`). No commits; tree still dirty.

## Root causes fixed along the way (not coordinate nudges)

- **Obsidian Cavern stood on a 795-cell act-4 ISLAND.** Desert Tomb (act 3) sits five cells
  away and won the ground between them, so act 4's door was marooned inside act 3 — and
  nothing downstream could repair it, because `rescue_isolated_doors` and
  `open_landmark_approaches` are both forbidden from carving beside a foreign act's region.
  Fixed at the source: an act now claims the ground under its **own roads**
  (`ROUTE_CLAIM_STRENGTH/RADIUS` in g2), and `a4-embers-obsidian` was re-authored to
  approach from the **east** so act 3's and act 4's tongues run parallel instead of crossing.
- **The act-3/4 seal was broken by its own door stub.** `wall_act_borders` aimed each mouth's
  keep-corridor *away from the paired mouth*, which is only the act's direction when the pair
  is arranged in act order — and the owner's Magma Tunnels pair is not (act 3's mouth is 24
  cells NORTH of act 4's). Act 3's approach was aimed into act 4, `carve_stub` cut 37 cells to
  find a legal one, and the broken seal then made every act-4 door on that frontier
  unrescuable. The leg is now aimed at the act's **own town** and clipped to its own side of
  the pass, and each stub is a **transaction** reverted if it joins the two acts — the
  re-assertion `carve_stub`'s docstring already promised. All four separators now seal with
  **zero** stub cells.
- **Rock at 31-39% of every act's land starved the biome matrices.** The owner's strokes are
  range CRESTS, so they are painted as such now: a thin rock spine with the act's own dense
  matrix on the flanks (`OWNER_BLOCK_CREST_CLASS` / `OWNER_BLOCK_FLANK_CLASS`). Acts 3 and 4
  take their own rock class throughout — duneRock and obsidian ARE those biomes' rock.
- **The owner's strokes were painted straight through the rivers**, which is why the paint
  fragmented into bars. Strokes now stop at a watercourse.
- **Two gate checks were measuring the wrong thing** and are now stricter, not looser:
  a bridge is not a severance (`components(..., through=bridge)`), and a landmark MARKER is
  an annotation, not terrain — its ~7-cell disc is wider than the gate's own 5-cell window,
  so it hid the approach it stood on AND cut the flood in two. Marker pixels are now
  resolved against the class map, which is exact.
- **New pass `widen_render_fragile_roads`**: an authored road one cell wide is connected to a
  flood fill and *absent from the art map*, because the semantic map blurs one-hot masks and
  takes an argmax. Scoped to `protected`, never touches an owner-drawn range, and each neck
  is its own transaction (7 reverted, 173 cells painted).

## Also moved into lockstep

`design/continent-terrain-class-method/semantic-maps/landmark-roster.json` was stale for
**all five acts** (still the pre-owner layout) and the gate reads it. Regenerated from
`g2.LANDMARKS`, with the note naming that table as the authority. Semantic maps re-rendered.

## NOT done — and why (read before touching it)

**`src/map-engine/act1Overworld.ts` was deliberately left untouched, and its tests are
green.** The brief asked for the bridge-deck constants to move in lockstep. They cannot move
alone. That file is not two arrays — it is a **complete second model of act 1's old
geography**: 73 coordinate sites (landmark `at`/`approach`, seven `ROUTE_SPECS`, the harbour
water derivation, `ACT1_MILLBROOK_SOUTHEAST_FOREST_BLOCK`, `crystalBarrierKeys`'s hardcoded
box at x142-154/y286-302) plus a 370-line test with ~40 more hardcoded cells and topology
assertions. Moving only the decks would leave the runtime's `greenhollow-to-millbrook` route
crossing at the OLD ford with the deck gone from under it — precisely the "player walks onto
water" hazard the instruction exists to prevent. The correct unit of work is a full
migration, the same slice as maps.ts / WorldMapScene.

Baseline to preserve: `npm run test:map-engine` passes today.

## Still open

- **`act1Overworld.ts` migration** (above) — deck values are in the table at the top.
- `src/data/maps.ts` still holds OLD coords for voidRift and the 4 portals.
- `WorldMapScene.ts` ox/oy not yet moved with `g2.LANDMARKS` (the roster now has).
- Cinderwatch (257,42) as a real playable town: maps.ts entry, WorldMapScene connection,
  i18n, generic NPCs. Shop rebalance deferred by the owner; **the name is a placeholder the
  owner has not confirmed**.
- Act 2: lake beside Frozen Lake; Haunted Forest's second art mouth at (284,258).
- Act 4: volcano at the centre ring with magma flowing west.
- `DRAW_TRAILS = False` in `build_semantic_map.py` for the final art hand-off.
- The legacy `act1-terrain-class-g1` pack (`build_act1_terrain_class_macro.py` +
  `lint_act1_terrain_class_macro.py`) shares the re-cut lib but keeps its own old hardcoded
  geometry, so its linter now fails. Nothing in the gate path reads it; it is superseded by
  v4. Delete it or re-cut it, but do not treat its red as a regression in the shipped path.

## Invariants — do not break

- Dirty tree preserved; **no commits, no builds, never `npm run build`**
- `dist/assets/index-BhoGQRaA.js` byte-identical (4,987,581 bytes)
- Town-to-town walkability stays **false** for 1→2, 2→3, 3→4, 4→5
- `owner-layout.json` / `owner-layout-strokes.json` are the owner's INPUT — never rewrite
  them to match generator output

## Kickoff prompt

> Continue the edu-rpg overworld carve in
> `/Users/christopherhachisu/Documents/claudecode/edu-rpg-map-engine-semantic-data`
> (branch `codex/map-engine-semantic-data`). Read
> `docs/handoffs/2026-07-29-act1-recut-linter-and-gate-green.md` first. Act 1 is re-cut to
> the owner's placement and BOTH gates are green — `build_continent_terrain_class_macro_g3_consolidated.py`
> reports `failures: []` and `check_semantic_map_gates.py` reports PASS. Next slice: migrate
> `src/map-engine/act1Overworld.ts` to the new act-1 geography as ONE unit — landmark
> `at`/`approach`, the seven `ROUTE_SPECS`, both bridge decks (greenhollow-millbrook
> (39,312)(39,313)(39,314), port-reef causeway (140,344)), the harbour water derivation,
> `ACT1_MILLBROOK_SOUTHEAST_FOREST_BLOCK` and `crystalBarrierKeys`'s box, plus
> `act1Overworld.test.ts`. Do not move the decks alone. `npm run test:map-engine` passes
> today and must pass after. Preserve the dirty tree, no commits, never `npm run build`, and
> keep `dist/assets/index-BhoGQRaA.js` byte-identical.
