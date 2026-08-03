---
date: 2026-07-14
type: handoff
status: active-partial
project: edu-rpg
milestone: overworld-vertical-slice-structural-gate
branch: codex/map-engine-semantic-data
supersedes: docs/handoffs/2026-07-14-pure-map-engine-shell-complete.md
---

# Overworld vertical-slice structural gate

## Outcome

The pure Stage 4 structure now covers deterministic row-major render chunks,
fractional camera windows, half-open chunk culling, world/minimap semantic
agreement, walkability-backed movement, one retained Darkfang transition,
same-area save relocation, and an exact-map selective-engine feature flag.

A standalone 393×852 canvas review proves the seed-42 semantics, visible chunk
IDs, fractional hero render center, camera centering, and independent minimap use
the same data. It is prominently labeled as structural only; placeholder colors
are not Terrain F production art.

## Verification

- Failing-first Stage 4 compile: PASS; the missing vertical-slice module caused
  the expected focused failure before implementation.
- `pnpm run test:map-engine`: PASS for semantic graph, movement/events, chunks,
  camera/culling, minimap agreement, relocation, and feature flags.
- Root code check: PASS after restoring the agreed deterministic chunk ID.
- Fresh independent review: initial camera-coordinate finding fixed; re-review
  PASS with no findings at confidence 50 or above.
- Rendered evidence:
  `design/review/act1-overworld-vertical-slice/evidence/seed42-393x852.png` —
  true PNG, 393×852 RGB, inspected at original detail.
- `pnpm run verify:runtime` and `git diff --check`: PASS.
- Preserved bundle: 4,987,581 bytes; monster PNG count: 75.

## Current state

- `src/map-engine/overworldVerticalSlice.ts` owns only pure chunk, camera,
  culling, transition, and relocation data/functions.
- `src/map-engine/mapEngineFeatureFlag.ts` is an exact map-ID allowlist predicate;
  no runtime router is wired.
- `src/map-engine/mapEngineShell.test.ts` covers the new contracts and errors.
- The standalone review imports only compiled pure modules; it does not load
  `dist`, Phaser, or `WorldMapScene`.
- No runtime wiring, save-schema mutation, production art, dungeon topology,
  Crystal Cave change, commit, push, or deploy occurred.

## Locked decisions

- Chunk IDs are deterministic `column,row` coordinates and chunks preserve
  row-major cell order.
- Camera culling uses half-open rectangles; the renderer converts movement
  coordinates to cell-edge render centers with a half-cell offset.
- Relocation accepts caller-supplied candidates already associated with the same
  progression area, filters them to safe semantic cells, and uses Manhattan
  distance with row-major ties.
- Empty/unlisted feature-flag IDs always select the retained legacy map path.
- Terrain F fidelity cannot be claimed from placeholder colors.

## Remaining work

- Stage 4 remains partial: no Terrain F atlas/natural-route edge assets exist;
  camera motion/video, chunk seams, occlusion, runtime transition, save migration,
  performance, and device proof are unverified.
- Save migration still needs approved legacy/rebuilt revision provenance and a
  legacy progression-area → semantic-candidate manifest.
- The deferred Stage 2 formal behavior census remains open. It should be created
  before town or dungeon rebuilding and must never copy dungeon floor topology.
- Seven forward roadmap stages remain, 4–10. Strictly, eight stages remain
  unfinished when deferred Stage 2 is counted and partial Stage 4 is included.

## Risks and blockers

Only reference images exist for Terrain F; there is no shippable terrain atlas,
culled chunk texture set, or natural-route edge family. Production art requires
an explicitly scoped asset milestone. Runtime routing and save-schema decisions
also remain outside this branch slice.

## Resume here

Use the available safe parallel track: create the formal Act 1 overworld
behavior-census contract from retained runtime evidence without copying any
dungeon floor topology. Lock canonical routing IDs, transition guards,
interactions, encounter ownership, and save/rollback responsibilities. Keep
runtime wiring and production art out of scope.

## Kickoff prompt

Resume in `/Users/christopherhachisu/Documents/claudecode/edu-rpg-map-engine-semantic-data`.
Read parent `edu-rpg/AGENTS.md`,
`docs/handoffs/2026-07-14-overworld-vertical-slice-structural-gate.md`, and the
behavior-census/migration sections of `docs/MAP-ENGINE-REBUILD.md`. Preserve the
dirty tree and 4.99 MB runtime. Build only the formal Act 1 overworld retained-
behavior census and focused validation; do not copy dungeon topology, modify
Crystal Cave, generate production art, wire the runtime, mutate saves, Vite/build,
commit, push, or deploy.
