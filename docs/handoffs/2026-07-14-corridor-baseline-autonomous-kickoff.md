---
date: 2026-07-14
type: handoff
status: active-next-session
project: edu-rpg
milestone: preservation-first-corridor-baseline-and-gate-census
branch: codex/map-engine-semantic-data
supersedes: docs/handoffs/2026-07-14-preservation-first-mainland-locked.md
owner-checkpoint: exact-corridor-masks-and-barrier-treatment
---

# Autonomous kickoff: prove the three retained land-bridge corridors

## Outcome inherited from this session

The owner rejected further macro-world redesign. Preserve the current shipped
320×400 overworld progression, landmark placement, coordinates, general terrain,
biomes, and scale. Connect the mainland only by replacing Act-separating water
around three existing corridor families with land substrate plus blocked
mountains/trees:

- Crystal Cave, Act 1→2: mouths `(148,295)` and `(172,305)`;
- Shadow Cave, Act 2→3: mouths `(260,234)` and `(260,198)`;
- Volcanic Forge, Act 4→5: mouths `(172,110)` and `(148,110)`.

Act 3 and Act 4 already share the northeast land region. Do not create a new
separator or reshape it. Preserve every other water feature and all four
portal-overworld maps.

The shipped ordered connection manifest is authoritative. It contains 41
physical anchors: 11 towns, 26 dungeon anchors/mouths, and 4 portal anchors.
Checked-in source matches 40 of 41 records. Scorched Ruins is the known mismatch:
preserve shipped `(208,120)`, not stale `maps.ts` `(278,82)`.

## Current repository state

- Working directory:
  `/Users/christopherhachisu/Documents/claudecode/edu-rpg-map-engine-semantic-data`
- Branch: `codex/map-engine-semantic-data`
- Worktree: intentionally dirty with the uncommitted semantic-map-engine slices
  and design/handoff artifacts. Preserve unrelated and overlapping changes.
- Preserved opaque JS bundle: 4,987,581 bytes.
- Monster PNG count: 75.
- `pnpm run test:map-engine`: PASS.
- `pnpm run verify:runtime`: PASS.
- `git diff --check`: PASS.
- No runtime wiring, terrain conversion, bundle edit, dungeon topology change,
  Crystal Cave change, build, commit, push, or deployment has occurred.

## Authoritative reading — load only this set first

1. `/Users/christopherhachisu/Documents/claudecode/edu-rpg/AGENTS.md`
2. `/Users/christopherhachisu/Documents/claudecode/edu-rpg/docs/AGENT-WORKFLOW.md`
3. this handoff;
4. `design/review/preserved-overworld-land-bridges/README.md`;
5. `docs/MAP-ENGINE-REBUILD.md`;
6. `src/data/maps.ts`, targeted overworld section only;
7. `src/utils/MapGenerator.ts`, targeted overworld generator only;
8. `src/scenes/WorldMapScene.ts`, targeted movement/gate sections only;
9. `src/map-engine/retainedBehaviorManifest.ts`, adapter contract, and focused
   tests;
10. targeted preserved-bundle snippets only when reconciling shipped behavior.

Do not load or revive the rejected connected-mainland v1/v2 boards. The
installed edu-rpg `world-map.md` reference describes an older 120×160 layout and
is historical context, not current authority.

## Skills and execution style

Use `edu-rpg`, `orchestrator-pattern`, `fable-mode`, and `lock-decisions`.
Use `coding-skill`, `ponytail`, and `code-check` if pure map-engine code/tests are
changed. Use `game-design` only for deterministic review-board composition from
real extracted map evidence; do not generate a new fantasy macro-map.

Delegate heavily across two or three bounded read-only/disjoint tracks while the
root session owns integration and final verification. Suggested tracks:

1. shipped fixed-seed terrain/route/anchor extraction;
2. Shadow/Magma/Volcanic retained-behavior census and pure manifests/tests;
3. corridor-mask derivation, deterministic visual evidence, and independent QA.

Continue automatically across the stages below. Do not stop for routine choices,
status updates, low-risk naming, or facts discoverable from the repository.

## Authorized work before the owner checkpoint

Allowed:

- read and mechanically extract current shipped/source map evidence;
- add deterministic evidence, snapshots, and validation scripts/tests;
- add or extend pure `src/map-engine/` retained-behavior manifests and tests;
- create exact candidate masks without applying them to runtime terrain;
- create deterministic SVG/PNG/current-map annotations for owner review;
- update preservation-first documentation and write the checkpoint handoff;
- run map-engine tests, runtime verification, and static-artifact read-only
  rendered capture.

Not allowed before owner approval:

- modifying `src/utils/MapGenerator.ts`, legacy `src/data/maps.ts`, the opaque
  bundle, `public/`, or `dist/` to apply terrain changes;
- changing any landmark, route, portal, encounter zone, or save coordinate;
- changing dungeon floors, seeded random-call order, or Crystal Cave;
- Vite/build/dev-server workflows;
- commit, push, deploy, publish, or App Store Connect mutation.

## Autonomous stage map

### Stage A — establish machine-readable shipped baselines

1. Verify branch, dirty state, bundle size/hash, runtime manifest, and monster
   count before writes.
2. Extract or reconstruct the fixed-seed 320×400 shipped overworld terrain with
   enough evidence to identify tile IDs around all three corridors.
3. Freeze ordered snapshots for:
   - all 41 shipped connection records;
   - route cells;
   - landmark/special/portal tiles;
   - encounter-zone classifications;
   - water cells and connected components;
   - exact corridor-local windows.
4. Prove the known Scorched Ruins discrepancy is the only connection-coordinate
   mismatch, or stop early if another shipped/source mismatch is discovered.

If an exact shipped tile array cannot be extracted, return `UNVERIFIED` for that
artifact and use rendered/current bundle evidence. Do not silently substitute
stale source as shipped truth.

### Stage B — complete later-gate retained behavior census

Trace shipped entry, exit, floor, flag, reverse traversal, arrival, and rollback
behavior for:

- Shadow Cave;
- Magma Tunnels;
- Volcanic Forge.

Encode verified facts in the existing pure retained-manifest/adapter style with
failing-first focused tests. Do not invent flags or normalize compatibility
behavior. Crystal Cave remains read-only and unchanged.

### Stage C — derive the smallest three candidate masks

For each corridor, derive the minimum cardinal land neck that:

- changes only existing water inside an explicit finite mask;
- joins current land edges geographically;
- preserves both retained mouths and current approaches;
- uses ground substrate plus blocked mountain/tree terrain;
- provides no walkable bypass around the retained dungeon route;
- leaves every out-of-mask terrain cell unchanged.

Do not equalize Act areas, relocate landmarks, pad traversal, crop the map, or
reshape Act 3/4.

### Stage D — produce the owner-review checkpoint

Create a compact deterministic review artifact using actual extracted/current
map evidence. It must show, for all three corridors:

- current water-gap window;
- exact proposed changed-cell mask;
- ground versus mountain versus blocked-tree treatment;
- retained route and both mouth coordinates;
- before/after geographic connectivity;
- proof that ordinary walkability remains gated;
- changed-cell counts and preservation assertions.

Use a side-by-side or three-row comparison, not a redesigned world map. Render
and inspect the final artifact at original resolution with a fresh reviewer.

### Stage E — integration verification

Run at minimum:

- focused new manifest/snapshot tests;
- `pnpm run test:map-engine` with the bundled runtime on `PATH`:

  ```bash
  export PATH="/Users/christopherhachisu/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:/Users/christopherhachisu/.cache/codex-runtimes/codex-primary-runtime/dependencies/bin/fallback:$PATH"
  pnpm run test:map-engine
  ```

- `pnpm run verify:runtime`;
- bundle-size and monster-count checks;
- `git diff --check`;
- independent factual audit against the shipped bundle;
- independent visual audit of the owner-review artifact.

Record exact PASS/FAIL/UNVERIFIED evidence. Preserve the dirty worktree.

## Stop conditions

Do not ask the owner anything until Stages A–E are complete, unless one of these
material blockers appears:

- another shipped/source mismatch changes the preservation target;
- exact gate behavior cannot be determined without changing runtime state or
  touching Crystal Cave;
- a corridor cannot be connected without changing a retained route, landmark,
  portal, encounter zone, or valid save coordinate;
- the requested evidence requires bundle/runtime mutation outside this handoff's
  authority.

Routine uncertainty should be resolved from shipped evidence and documented.

## Required owner checkpoint

Stop after the verified three-corridor review artifact and checkpoint handoff are
complete. Ask the owner one consolidated question:

> Approve or revise the exact Crystal, Shadow, and Volcanic changed-cell masks
> and their mountain/tree treatment before terrain implementation?

The checkpoint must summarize the recommended answer, alternatives, changed-cell
counts, risks, and visual evidence. Do not apply any corridor terrain until the
owner answers.

## Required checkpoint handoff

Write a new active handoff named like:

`docs/handoffs/2026-07-XX-corridor-masks-owner-checkpoint.md`

It must contain completed evidence, code/tests added, exact verification, open
risks, the rendered artifact path, and a self-contained resume prompt for the
post-approval implementation session.

## Verbatim kickoff prompt

Resume autonomously in
`/Users/christopherhachisu/Documents/claudecode/edu-rpg-map-engine-semantic-data`
from
`docs/handoffs/2026-07-14-corridor-baseline-autonomous-kickoff.md`.

Read the named AGENTS/workflow files and authoritative preservation-first
contract, then execute Stages A–E without asking routine questions. Use heavy
bounded delegation for shipped baseline extraction, later-gate retained census,
and deterministic corridor review evidence; keep integration and verification
in the root session. Preserve the dirty tree and the shipped runtime. Do not
Vite/build, edit terrain/runtime/bundle, modify Crystal Cave or dungeon topology,
commit, push, deploy, or publish. Continue until the exact three corridor masks
and mountain/tree treatments are fully evidenced and independently reviewed,
then stop at the single owner-approval checkpoint specified in the handoff.
