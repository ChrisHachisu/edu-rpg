---
date: 2026-07-20
type: continent-design-authority
project: edu-rpg-map-engine-semantic-data
milestone: continent-first-macro-geography
status: design-authority-awaiting-continent-gate
method: docs/plans/2026-07-20-act1-terrain-class-method-decision-brief.md
supersedes-for-cross-act: docs/handoffs/2026-07-19-act2-one-way-art-geometry-plan.md (stale polygon-first method; its locked coords still hold)
---

# Continent macro geography — design authority (all 5 acts, one landmass)

Owner constraint (2026-07-20): the 5 acts must read as ONE connected continent with organic connection (continuous coastline / mountain / river / forest systems, no seams) and organic act-separators (natural gating geography between acts). Method: continent-first macro geometry (this doc), then per-act detail (Gates 2-4). Terrain-class-raster method per the decision brief; NOT polygon-first, NOT single-shot continent ART (that was tried and rejected — art stays per-act at Gate 4).

## 1. Coordinate system

- One shared world grid `320 x 400`, 16 native px/tile (`edu-rpg/src/data/maps.ts:24`).
- Terrain lives in the game as a single `overworld` map; only Act 1 currently has a numeric terrain snapshot (`ACT1_RUNTIME_SNAPSHOT_ROWS`, 148×182). There is NO continent-wide numeric land/water grid yet — the continent macro pass will produce the first one.
- Reference-only art: `design/review/overworld-art-blueprint/source-mosaic/world-current-clean.png` (5120×6400, legacy/current geography — reference, not authority); `.../generated/overworld-source-mosaic-redraw-v2.png` (macro/style guidance only, explicitly NOT topology authority per `ACT-THEME-CONTRACT.md:15-20`).

## 2. Act layout (art-pipeline bounds, world-tile [minX,minY,maxX,maxY])

| Act | bounds | native px | position | biome (LOCKED ladder) |
|---|---|---|---|---|
| 1 | [16,218,163,399] | 2368×2912 | SW (bottom-left) | verdant coastal old-growth frontier (darkens toward Crystal) |
| 2 | [161,222,312,399] | 2432×2848 | SE (east of Act1; x-overlap 161-163) | **fully snowy frozen highlands** (snow = primary identity; Frozen Lake + wind-cut canyon pass; Ravenhollow "haunted" = dark-evergreen sub-flavor, NOT a separate act) |
| 3 | [163,88,314,210] | 2432×1968 | E-center (north of Act2) | desert, oasis, wind canyon, bandit territory |
| 4 | [163,3,314,128] | 2432×2016 | NE (north of Act3; y-overlap 88-128 = shared landmass, 0 gap) | volcanic ashlands, obsidian, calderas |
| 5 | [9,7,158,206] | 2400×3200 | W/NW (endgame) | dark barren — charcoal earth, dead forest, mountain maze, Demon Castle moat/island; all 4 portals live here |

Journey loops the perimeter clockwise-ish: SW → SE → E-center → NE → W/NW. Act 5 (NW) sits geographically near Act 1 (SW) on the west side (y-gap ~206-218) but is story-distant (the end). The continent interior/center transitions between the perimeter biomes.

## 3. Lock status (what the continent macro MUST preserve vs MAY reshape)

- **Act 1: coastline LOCKED** (checkpoint-1 frame + land-mask, hash-gated; `design/OVERWORLD-MOVEMENT-BOUNDARIES.md:34-38`). The Act 1 region's land/water = `ACT1_RUNTIME_SNAPSHOT_ROWS` (water=='2'). Do not reshape Act 1 coast.
- **Acts 2-5: OPEN to redesign, but PRESERVE** (owner-locked: `design/review/preserved-overworld-land-bridges/README.md` 2026-07-14; `.../act-by-act/ACT-THEME-CONTRACT.md` 2026-07-15): the 320×400 grid, all 41 connection coords, all landmark POSITIONS + relationships, the route/story graph, the locked biome ladder, and world scale/terrain character. **Organic coastline redraw for acts 2-5 IS explicitly authorized (ACT-THEME-CONTRACT §8).** So: keep landmarks where they are and biomes as specified; reshape terrain/coast to be natural.
- `shippedOverworldBaselineDqReplay.mjs` = regression/rollback comparison artifact, NOT a design contract.
- Once an act's outgoing boundary is owner-approved it becomes immutable input to the next act (ACT-THEME-CONTRACT).

## 4. Landmarks (world coords, PRESERVE positions) — source `edu-rpg/src/data/maps.ts`

- **Act 1**: Greenhollow(60,341) start, Millbrook(100,321), Port Sapphire(130,291); dungeons Sunken Cellar(45,349), Whispering Woods(80,311), Coastal Reef(140,349), Darkfang(120,261), Crystal Cave(148,295 → Act2).
- **Act 2** (snow): Ironkeep(200,321), Frostwatch(222,263), Ravenhollow(252,243); dungeons ironMine(185,336), stormNest(280,296), hauntedForest(238,249), frozenLake(200,266), shadowCave(260,235 → Act3).
- **Act 3** (desert): oasisHaven(220,151), ruinsCamp(270,121); dungeons oasisDepths(225,161), desertTomb(250,141), banditHideout(298,131), scorchedRuins(208,120 — authority coord; maps.ts 278,83 is stale).
- **Act 4** (volcanic): embersRest(195,81); dungeons emberMines(202,49), magmaTunnels(242,94), obsidianCavern(185,49), volcanicForge(172,111 → Act5).
- **Act 5** (dark): lastBastion(100,151), havensEdge(70,101); dungeons demonBarracks(80,61), voidRift(120,71), demonCastle(85,31 final). 4 portal lands anchored (40,51),(130,41),(50,131),(120,141).

## 5. Act separators (connectors) — natural gating geography

Story is linear A1→A2→A3→A4→A5 (`QuestManager.ts`). Each separator sits on the shared internal boundary between two acts; it must be a readable natural formation gating progression (like the Crystal Range + seal gate), never an invisible wall or rectangular cut. Connector mouths (world tile, overworld↔dungeon-landing):

| separator | acts | mouth | current form | target formation |
|---|---|---|---|---|
| Crystal | 1→2 | (148,295)↔(172,305) | water gap | mountain range + sealed pass (Act1 verdant → Act2 snow ridge) |
| Shadow | 2→3 | (260,234)↔(260,198) | water gap | ridge/canyon pass (Act2 snow → Act3 desert; snowline→arid transition) |
| Magma | 3→4 | (242,93)↔(242,81) | ALREADY land-connected | volcanic ridge / lava-scarred pass (Act3 desert → Act4 volcanic) |
| Volcanic | 4→5 | (172,110)↔(148,110) | water gap | volcanic strait/bridge or ashen pass (Act4 volcanic → Act5 dark) |

The 3 water-gap separators (Crystal, Shadow, Volcanic) convert water→blocked land-neck per `preserved-overworld-land-bridges` (keeps the continent one landmass). Magma is already land.

## 6. Biome transitions (organic connection requirement)

Adjacent-act boundaries must blend, not hard-cut: Act1 verdant → (darken) → Act2 snow (snowline on the Crystal range); Act2 snow → Act3 desert (snow recedes to arid foothills across the Shadow pass); Act3 desert → Act4 volcanic (scorched/obsidian transition at Magma); Act4 volcanic → Act5 dark-barren (ash to charcoal at Volcanic). The continent reads as one landmass whose climate shifts along the journey.

## 7. Continent-macro generation approach

1. Validate the terrain-class generator METHOD on Act 1 first (in flight: `design/act1-terrain-class-method/G1-geography-spec.md`) — elevation-ridge ranges, meander rivers, forest matrix, carved basins, capped gateways, genuine linters, deterministic. Act 1's locked coastline + anchors make it the test bed; its output IS the Act 1 region of the continent (reused, not thrown away).
2. Scale the SAME generator to `320x400` with continent inputs: preserve all landmark positions + connector mouths + biome ladder + world scale; author (lead) the continental control geometry — one continuous coastline (Act 1 portion frozen; acts 2-5 organic redraw), the continent's mountain spines (which double as the act separators), major rivers, and forest/biome masses; rasterize organically (noise-displaced, ridge-crest ranges, meander rivers) exactly as the Act 1 method.
3. Continent-scale linters: organic-boundary checks + every landmark walkable + every connector a narrow readable pass + biome placement matches the ladder + one connected landmass + guards/route-graph reachable + determinism.
4. Owner reviews the CONTINENT MACRO once (barrier-only + biome view + separator close-ups, native + phone) for naturalness of the whole landmass and its act boundaries.
5. Per-act detail (Gates 2-4) proceeds one act at a time within the approved continental frame; each act's outgoing boundary freezes as the next act's input.

## 8. Continent organizing structure (lead design, 2026-07-20 — owner approved Act 1 method, wants the whole continent)

The continent is ONE landmass built around a **central mountain spine** (the geological backbone), with the five acts as lowland biome-basins ringing it and the act-separators as ranges/passes of that spine system. This makes organic connection (every range ties into one continental system, one continuous coast) and organic separators (each act boundary is a real ridge with a single pass) structural, not bolted on.

- **Central spine + divide:** a major N–S mountain system through the middle (world x≈150–175) separates the WEST acts (Act 1 SW, Act 5 NW) from the EAST acts (Act 2 SE, Act 3 E-center, Act 4 NE). The story loops clockwise across it: Act1→(Crystal pass, south)→Act2→(Shadow)→Act3→(Magma)→Act4→(Volcanic pass, north)→Act5.
- **Separators = ranges of the spine, each crossed ONLY at its connector pass:**
  - Crystal Range (Act1↔Act2), pass at world (148,295)↔(172,305) — verdant→snow.
  - Shadow Range (Act2↔Act3), pass at (260,234)↔(260,198) — snow→desert (snowline recedes to arid foothills).
  - Magma ridge (Act3↔Act4), pass at (242,93)↔(242,81) — already land-connected, desert→volcanic scar.
  - Volcanic pass (Act4↔Act5), (172,110)↔(148,110) — volcanic→dark-barren.
- **Acts as biome-basins ringing the spine:** Act1 verdant coastal (SW, = the approved v4 geography), Act2 snowy frozen highlands (SE), Act3 desert/oasis (E-center), Act4 volcanic ashlands (NE), Act5 dark-barren endgame (W/NW). Biomes BLEND at boundaries (snowline, arid foothills, ashfall gradients, charcoal fade), never hard-cut.
- **Coastline:** ONE continuous organic coast. Act 1's SW coast is pinned to the locked snapshot; acts 2-5 coasts are redrawn organically (noise-displaced, ACT-THEME-CONTRACT §8), keeping EVERY landmark on land with margin and the whole thing ONE connected landmass. Sea surrounds; Act 5's Demon Castle sits on a moat-island per its theme.
- **Rivers:** flow from the spine outward to the sea per act, biome-appropriate (Act1 Millbrook river; Act2 frozen river/glacier tongue; Act3 wadi/seasonal wash + oasis; Act4 lava channel; Act5 dark river/moat).
- **Connectivity:** the linear story path plus every act's intra-act routes to its preserved landmarks, connectivity-first (carve corridors, then drape barriers — the validated v4 order).

## 9. Generation approach + staging

Scale the VALIDATED v4 generator (`scripts/build_act1_terrain_class_macro_v4.py`; authored control geometry + connectivity-first corridor carving + organic noise rasterization) to the full 320×400 continent. Lead authors the continent SKELETON (§8: spine, 4 separator ranges + passes, biome regions, coastline rules, cross-act connectivity); the generator fills each act's INTERIOR with the v4 method (forest/biome matrix, lobed basins, minor rivers, corridors to landmarks). This pass prioritizes the CONTINENTAL STRUCTURE (how the acts connect + how the whole continent reads) over per-act interior polish, which is refined act-by-act later. Genuine linters + determinism as in v4. Owner taste gate on the continent macro before per-act native/exact/art work.
