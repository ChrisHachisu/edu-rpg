---
date: 2026-07-14
type: handoff
status: slice-complete-uncommitted
project: edu-rpg
milestone: selective-map-engine-rebuild
branch: codex/map-engine-semantic-data
base: codex/stabilize-runtime-baseline
supersedes: docs/handoffs/2026-07-14-semantic-overworld-data-slice.md
---

# Progression-gated overworld reachability slice

## Outcome

The isolated worktree now includes progression-state gates and state-aware
landmark reachability on top of the standalone semantic overworld contract.
Closed gates block semantic traversal until their retained story flag is exactly
`true`. Structural validation rejects off-path, dead-end, and bypassed gates
that do not change landmark reachability.

The new map engine is still not wired into the legacy scene. Rendering, saves,
movement/camera, dungeon generation, Crystal Cave, and the opaque shipped bundle
were not changed.

## Files

- `src/map-engine/semanticMap.ts`
- `src/map-engine/starterOverworld.ts`
- `src/map-engine/semanticMap.test.ts`
- `docs/MAP-ENGINE-REBUILD.md`
- `tsconfig.map-engine.json`, `package.json`, `.gitignore`

All changes remain uncommitted. Nothing was pushed, deployed, uploaded, or
changed in App Store Connect.

## Verification

- focused `tsc` plus `semanticMap.test.js`: PASS
- `python3 scripts/test_runtime_baseline.py`: 3 tests PASS
- `python3 scripts/runtime_baseline.py verify --input dist`: PASS
- `python3 scripts/runtime_baseline.py verify-candidates`: PASS
- `python3 scripts/smoke_static_runtime.py --input dist`: PASS, seven key requests
- `git diff --check` plus untracked-file whitespace checks: PASS
- preserved bundle: 4,987,581 bytes; 75 monster PNGs; SHA-256
  `a56026574b42168985b353e4cee824562716af83f92d03f408df04eac9127381`

Fresh read-only review found two defects: inherited `Object.prototype` names
could open absent flags, and no-op gates could validate. Both were reproduced,
fixed, regression-tested, and re-reviewed. The final independent verdict was
clean, including prototype-name, bypass, and dead-end probes.

## Locked decisions

- progression gates remain a separate semantic layer;
- each gate occupies a route or clearing cell and names one retained story flag;
- only an exact `true` story-flag value opens a gate;
- reachability starts from an explicit landmark ID and returns reachable IDs;
- structural validation checks full topology independent of current state and
  proves every gate blocks at least one otherwise reachable landmark;
- terrain collision, routes, clearings, landmarks, specials, and gates remain
  separate concerns.
- future field heroes and NPCs use the owner-approved 64×64 native-frame scale
  and Terrain F-matched internal detail density shown in
  `design/art-refs/field-character-scale-64-device-locked.png`; existing monsters
  remain unchanged;
- character production waits for the overworld renderer/camera device gate and
  precedes first-town art integration; special assets wait for each map's locked
  topology, mechanic spaces, and placement manifest.

## Remaining work

Expand the semantic data toward the full overworld landmark/progression graph.
Save relocation, movement/camera, the legacy adapter and feature flag, chunk
rendering, minimap rendering, and final Terrain F art remain later slices.

## Resume here

Read `edu-rpg/AGENTS.md`, this handoff, `docs/MAP-ENGINE-REBUILD.md`, and
`src/map-engine/{semanticMap,starterOverworld,semanticMap.test}.ts`. Inspect the
uncommitted diff and rerun the focused map-engine check. The next bounded action
is to add the required Act 1 landmark/progression graph data and validation,
using current shipped identities and flags without copying legacy layout or
touching any dungeon generator.

## Kickoff prompt

Continue the selective map-engine rebuild in the existing
`codex/map-engine-semantic-data` worktree. Preserve the uncommitted semantic-map
and progression-gate slices and the stabilized 4.99 MB runtime. Add only the
required Act 1 overworld landmark/progression graph data and focused validation
tests, using current shipped landmark identities and retained story flags but
not legacy tile topology. Do not wire rendering, migrate saves, edit the opaque
bundle, inspect or modify dungeon layouts, modify Crystal Cave, commit, push,
or deploy. Run the focused map-engine test first, then the runtime verification
gates, and obtain a fresh read-only review.
