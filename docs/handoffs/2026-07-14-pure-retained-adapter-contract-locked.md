---
date: 2026-07-14
type: handoff
status: active-partial
project: edu-rpg
milestone: pure-retained-adapter-contract
branch: codex/map-engine-semantic-data
supersedes: docs/handoffs/2026-07-14-act1-retained-behavior-census-complete.md
---

# Pure retained-adapter contract locked

## Outcome

The next safe integration boundary is now explicit and pure. The retained
adapter contract carries save-compatible integer position, retained routing ID,
facing, encounter-zone identity, opaque semantic interaction targets, transition
requests with optional-floor preservation, and explicit blocked/completed/failed
transition outcomes.

Pure entry-routing functions translate a retained routing ID to an enabled
semantic data ID, return legacy `WorldMapScene` for exact-ID misses, keep blocked
transitions in place, use the final retained-corrected state after completion,
and require failed transitions to fall back to the same retained map while
disabling only that source routing ID.

## Verification

- Failing-first adapter tests exposed the missing module and then a nullable
  outcome typing issue before implementation.
- `pnpm run test:map-engine`: PASS for semantic graph, movement/events, retained
  census/adapter, chunks, camera/culling, minimap, relocation, and feature flags.
- Adversarial coverage rejects fractional retained positions, blank encounter
  zones, blank route identities, duplicate retained route identities, and
  cross-map failed fallbacks.
- Entry decisions and compatibility snapshots deep-clone and freeze retained
  state; later source mutation cannot alter an issued decision.
- Independent review found four contract defects; all were fixed and focused
  re-review passed with no remaining findings at confidence 50 or above.
- `pnpm run verify:runtime` and `git diff --check`: PASS.
- Preserved bundle: 4,987,581 bytes; monster PNG count: 75.

## Current state

- `src/map-engine/retainedAdapterContract.ts` owns only types, validation,
  compatibility snapshots, and pure routing decisions.
- `src/map-engine/mapEngineShell.test.ts` proves the adapter boundary and its
  adversarial cases.
- `src/map-engine/retainedBehaviorManifest.ts` remains the closed nine-entry Act
  1 shipped-behavior census.
- The existing `retainedMapEvents.ts` dispatcher remains unchanged and void-
  returning; the new port is not bound to it or to `WorldMapScene`.
- No runtime call, scene switch, storage access, feature-flag mutation, save
  migration, bundle change, production art, dungeon topology, Crystal Cave
  change, Vite/build, commit, push, or deploy occurred.

## Locked decisions

- Persisted and feature-selection identity is the retained map ID such as
  `overworld`; semantic data IDs are lookup identities and are never saved as
  `mapId`.
- Fractional movement coordinates never cross the retained adapter boundary.
- Semantic placement supplies encounter-zone and interaction-target identity;
  retained code continues to own pacing, RNG, behavior, dialogue, quests,
  battles, guards, final dungeon-arrival correction, saves, and localization.
- `encounterZoneId: null` means no semantic encounter zone; a blank ID is invalid.
- Omitted `toFloor` remains omitted.
- A blocked transition produces no entry-routing decision. A completed
  transition routes its final retained-corrected state. A failed transition must
  preserve a same-map fallback and disables only the failed source routing ID.
- Route tables require nonblank identities and unique retained routing IDs.

## Roadmap status

- Stage 1 stabilization: complete.
- Stage 2 behavior census: Act 1 overworld slice complete; later maps still need
  their own pre-migration manifests.
- Stage 3 engine shell: pure semantic, movement, event, flag, census, and adapter
  contracts complete; runtime binding remains unwired.
- Stage 4 overworld vertical slice: structurally partial and still active.
- Stages 5–10: not started in this workstream.

Seven forward roadmap stages remain: partial Stage 4 plus Stages 5–10.

## Remaining blockers

- No shippable Terrain F atlas, natural-route edge family, or culled chunk
  texture set exists, so Stage 4 cannot pass its production visual gate.
- Legacy saves have no map revision, and the required complete pre-migration
  snapshot is unimplemented.
- Same-progression-area relocation candidate provenance is not defined.
- No runtime port binding, selective router, legacy re-entry execution, retained
  scene-state synchronization, HUD bridge, save migration, rollback execution,
  camera motion/video, performance measurement, or device proof exists.

## Resume here

Do not wire the runtime yet. The next safe pure task is a re-entry eligibility
planner that always returns unchanged same-map legacy fallback while revision,
snapshot, candidate-provenance, or safe-relocation gates are missing, and only
emits a selective candidate after all gates pass. It must not read/write storage,
switch scenes, mutate feature flags, or claim migration was committed.

## Kickoff prompt

Resume in `/Users/christopherhachisu/Documents/claudecode/edu-rpg-map-engine-semantic-data`.
Read parent `edu-rpg/AGENTS.md`, this handoff, and the save/migration/rollback
sections of `docs/MAP-ENGINE-REBUILD.md`. Preserve the dirty tree and 4.99 MB
runtime. Seven forward stages remain. Implement only a pure re-entry eligibility
planner around the locked retained adapter and existing same-area relocation
primitive. It must default to unchanged same-map `WorldMapScene` while shipped
revision provenance is absent and snapshots/candidate provenance are
unimplemented. Do not wire runtime, access storage, mutate saves/flags, copy
dungeon topology, modify Crystal Cave, Vite/build, commit, push, or deploy.
