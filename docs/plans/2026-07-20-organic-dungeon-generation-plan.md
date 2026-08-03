---
date: 2026-07-20
type: decision-brief
project: edu-rpg-map-engine-semantic-data
milestone: dungeon-rebuild-method-selection
status: owner-approved-2026-07-20
related: docs/MAP-ENGINE-REBUILD.md (holistic dungeon-floor regeneration section)
---

# Organic dungeon generation: redesign plan

Planning-only. Goal: replace the current boxy room-and-corridor dungeon feel with organic, believable interiors while keeping full determinism, all gameplay contracts, and the pedagogical pacing. No code, generation, or bundle work until the owner approves.

## 1. Current state (verified against source)

- Generator: `src/utils/MapGenerator.ts` (identical copy in both repos), entry `generateDungeonMap(...)` at `MapGenerator.ts:1258`. Seed = `mapId.charCodeAt(0) * 251`, per-floor `+ (floor-1)*997`; PRNG is a simple LCG (`seededRandom`, `MapGenerator.ts:41`).
- Two families: a recursive-backtracker perfect maze for `forest-maze` dungeons, and a default branching-corridor system (rect rooms via `carveRoom`, bendy main corridor, branch corridors, key/locked-door sequences, hidden rooms, mechanic features: crystal pillars, wind corridors, bandit traps).
- Map format: `number[][]` tile grid, ~100x100 logical tiles, `TILE_SIZE 48`; the tile id IS both semantics and collision (walls=1, lava=5 block, etc.). Placement metadata rides alongside in `DungeonResult`.
- Art: per-theme runtime repaint in `public/dq-tiles.js` (`drawDungeon()`), plus Codex-generated 128px props for special tiles.
- Hard constraints: the shipped `dist/` bundle's PRNG stream is sacred (never add/remove an `h()` call; consume-but-ignore only); **Crystal Cave generation is never modified** under the standing safety rule; console force-loads are forbidden.
- Roadmap position: `docs/MAP-ENGINE-REBUILD.md` already defines a "holistic dungeon-floor regeneration" approach (preserved-behavior manifest, reachability/progression validators, structural-diversity checks) as migration step 7, not started. Entrance/arrival contracts are already captured in `src/map-engine/retainedBehaviorManifest.ts` / `retainedLaterGateBehavior.ts`.

Implication: the organic redesign is **not** a patch to the shipped bundle (the h()-stream rule makes meaningful in-place rework impossible by design). It is the step-7 rebuild: a new generator behind the preserved-behavior manifest, landing with the map engine.

## 2. Why current dungeons feel artificial

Rect rooms + corridor carving produce axis-aligned walls, uniform corridor widths, and tree-shaped connectivity (one path to everything, backtracking through the same corridor). These are the same failure signatures as the overworld blocker bands: shapes exist for traversal control, not because a cave, ruin, or forest would form that way.

## 3. Recommended pipeline (hybrid, industry-proven)

One new generator, one pipeline, theme-parameterized. All stages draw from a single seeded PRNG in fixed call order, so each dungeon remains a pure function of (mapId, floor).

1. **Mission graph first** (Dormans/Unexplored model, simplified; no grammar engine). Per floor, build a small graph: entrance, exit/stairs, boss, key→lock pairs, hidden rooms, mechanic feature nodes, side/treasure spurs. Deliberately include **cycles** (loops), not just trees: loops kill dead-end backtracking and read as natural. Existing metadata in `src/data/maps.ts` (floors, boss, mechanic, gate) feeds the graph builder, so gameplay contracts are inputs, not afterthoughts.
2. **Room realization with mixed shapes** (Brogue accretion model). Each graph node becomes a chamber whose shape family is theme-driven: cellular-automata blob chambers for caves/grottos, jittered-and-eroded rects for built spaces (ruins, castle, tomb), templates for pedagogically important rooms (boss, puzzle, save) where exact layout matters. Rooms are attached by accretion (attempt placement against the existing structure), which guarantees connectivity by construction.
3. **Organic corridors.** Graph edges are carved by biased drunkard's walk (wandering, variable width 2-4 tiles) instead of L-corridors; then 2-3 cellular-automata smoothing passes (4-5 rule) run over cave-theme boundaries so walls read as eroded rock, not extrusions. Built themes get lighter smoothing to keep masonry readable.
4. **Validation pass (all failable).** Flood-fill connectivity (single component containing entrance/exit/boss); minimum corridor width via erosion test (no 1-tile pinches on the critical path); lock/key solvability (critical path never hard-locked without its key reachable first, per lock-and-key convention); mechanic feature placement on validated tiles; the MAP-ENGINE-REBUILD structural-diversity check across floors; two-build determinism equality.
5. **Decoration pass.** Stalagmites, rubble, pools, roots as soft blockers placed only on proven non-critical tiles, so dressing can never break solvability. Special tiles keep the existing prop/art pipeline (`dq-tiles.js` + 128px props).
6. **Forest-maze mechanic** keeps its maze *gameplay* (wrong-exit design, `correctExitY`) but becomes a braided maze: knock a controlled fraction of walls out of the perfect maze to create loops, vary corridor widths, and CA-erode wall edges so it reads as dense forest, not a hedge diagram.

Tile-id contract, `DungeonResult` shape, entrance linking, grade scaling, and arrival contracts are preserved so `WorldMapScene`-equivalent runtime logic ports unchanged.

## 4. Exclusions and constraints

- Crystal Cave: untouched, unless the owner separately lifts the safety rule; if lifted, it migrates last, as its own gated milestone.
- Shipped `dist/` bundle: never modified for this work; the new generator ships only with the map-engine rebuild.
- Determinism: single seeded PRNG threaded through every stage, no `Math.random()`, fixed call order; upgrade LCG to mulberry32/xoshiro is allowed since this is a new stream (no h()-compatibility needed).
- 100x100-scale grids and grade scaling stay; generation cost target remains load-time-instant (all listed algorithms are O(n) per pass on a 10k-tile grid).

## 5. Gate ladder

- **D0 — method approval (this brief).** Owner approves pipeline + exclusions.
- **D1 — pilot dungeon.** One cave-theme dungeon (proposed: Darkfang Grotto / `mistyGrotto`) generated for all floors; review pack of rendered floor plans (native + phone scale), before/after against the current generator, plus validator results. Owner judges organic feel. Iterate parameters here.
- **D2 — theme and mechanic coverage.** One exemplar per theme family (cave, ruins/castle, forest-maze, desert/tomb) and per mechanic (keys/locks, pillars, wind, traps, hidden rooms), same review format.
- **D3 — engine integration.** Wire into the map-engine runtime behind the preserved-behavior manifest; arrival/exit contract verification (`retainedDungeonArrivalCorrection` items move to verified); full validator suite green; sim evidence.

Sequencing: this work is independent of the overworld checkpoint gates and can run in parallel or wait until overworld Gate 4; owner's call at D0. The overworld milestone stays the priority by default.

## 6. D0 decisions (owner, 2026-07-20)

1. Hybrid pipeline: **APPROVED**.
2. Crystal Cave: stays excluded.
3. D1 pilot: Darkfang Grotto (default accepted).
4. Sequencing: **after overworld art** — dungeon work starts once overworld Gate 4 passes; the Act 1 overworld milestone stays the sole focus until then.
