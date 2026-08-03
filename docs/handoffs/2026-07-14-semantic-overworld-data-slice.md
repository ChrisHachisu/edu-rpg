---
date: 2026-07-14
type: handoff
status: slice-complete-uncommitted
project: edu-rpg
milestone: selective-map-engine-rebuild
branch: codex/map-engine-semantic-data
base: codex/stabilize-runtime-baseline
supersedes: docs/handoffs/2026-07-14-stabilized-runtime-worktree-ready.md
---

# Semantic overworld data slice

## Outcome

The first selective map-engine slice is implemented in the isolated worktree
`/Users/christopherhachisu/Documents/claudecode/edu-rpg-map-engine-semantic-data`.
It adds a standalone semantic map contract, deterministic starter overworld,
terrain-derived collision, route/clearing/landmark validation, and a minimap
model derived from the same data. It is not wired into the legacy scene yet.

## Files

- `src/map-engine/semanticMap.ts`
- `src/map-engine/starterOverworld.ts`
- `src/map-engine/semanticMap.test.ts`
- `tsconfig.map-engine.json`
- `package.json`, `.gitignore`
- `docs/MAP-ENGINE-REBUILD.md`

All changes are uncommitted. Nothing was pushed, deployed, uploaded, or changed
in `dist/`, the legacy dungeon generators, Crystal Cave, `gh-pages`, or App Store
Connect.

## Verification

- `npm run test:map-engine`: PASS
- `npm run test:runtime-tools`: 3 tests PASS
- `npm run verify:runtime`: PASS
- `npm run verify:candidates`: PASS
- `npm run smoke:runtime`: PASS, seven key requests
- preserved bundle: 4,987,581 bytes; SHA-256
  `a56026574b42168985b353e4cee824562716af83f92d03f408df04eac9127381`
- `git diff --check`: PASS

Lead code review found and fixed fractional-cell array indexing and a quadratic
flood-fill queue. Fresh collaboration-agent review was attempted three times,
but no agent returned a file-based verdict; independent review is therefore
`UNVERIFIED`, not a pass.

## Locked decisions

- integer, zero-based, row-major cells;
- terrain, routes, clearings, landmarks, and specials remain separate layers;
- forest, water, mountain, and structure are blocked by default;
- routes never override blocked terrain;
- minimap data never samples presentation pixels;
- final Terrain F art waits for validated blocker topology.

## Remaining work

Add progression-state gates and state-aware reachability to the semantic model,
then expand the starter slice toward the full overworld landmark graph. Save
relocation, movement/camera, the legacy adapter/feature flag, chunk rendering,
and final environment art remain later slices.

## Resume here

Read `AGENTS.md`, this handoff, `docs/MAP-ENGINE-REBUILD.md`, and
`src/map-engine/{semanticMap,starterOverworld,semanticMap.test}.ts`. Inspect the
uncommitted diff and rerun `npm run test:map-engine`. The next action is a
progression-gate type plus validator tests proving a gated landmark is
unreachable before its flag and reachable after it, without changing the opaque
runtime or any dungeon generator.

## Kickoff prompt

Continue the selective map-engine rebuild in the existing
`codex/map-engine-semantic-data` worktree. Preserve the uncommitted semantic-map
slice and the stabilized 4.99 MB runtime. Add only progression-state gates and
state-aware overworld reachability with focused tests. Do not wire rendering,
generate art, edit the opaque bundle, inspect dungeon layouts, modify Crystal
Cave, commit, push, or deploy. Run the focused map-engine test first, then the
runtime verification gates, and obtain a fresh read-only review if collaboration
review is available.
