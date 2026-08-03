---
date: 2026-07-14
type: handoff
status: active-partial
project: edu-rpg
milestone: act1-retained-behavior-census
branch: codex/map-engine-semantic-data
supersedes: docs/handoffs/2026-07-14-overworld-vertical-slice-structural-gate.md
---

# Act 1 retained-behavior census complete

## Outcome

The Act 1 overworld now has a formal, validated retained-behavior manifest. It
locks the retained routing identity `overworld`, semantic data identity
`overworld-act1-slice`, all nine retained destination contracts, default versus
explicit floor behavior, exact story/quest guards, event ownership, save shape,
rollback obligations, and the adapter gaps that must be closed before runtime
cutover.

The census intentionally records behavior rather than geography. It contains no
dungeon floor topology, arrival coordinates, routes, rooms, terrain, or invented
semantic progression flags.

## Verification

- `pnpm run test:map-engine`: PASS for semantic graph, movement/events, retained
  census, chunks, camera/culling, minimap, relocation, and feature flags.
- The validator rejects an empty census, changed guard facts, unknown runtime
  capability fields, invalid arrival statuses, and inconsistent floor semantics.
- Fresh independent re-review: PASS; all four earlier findings are corrected and
  no findings remain at confidence 50 or above.
- `pnpm run verify:runtime` and `git diff --check`: PASS.
- Preserved bundle: 4,987,581 bytes; monster PNG count: 75.

## Current state

- `src/map-engine/retainedBehaviorManifest.ts` owns the closed Act 1 behavior
  contract and its pure validator.
- `src/map-engine/mapEngineShell.test.ts` includes positive and adversarial
  census coverage.
- The nine locked retained entries are Greenhollow, Millbrook, Port Sapphire,
  Darkfang/Misty Grotto, Crystal Cave floors 1 and 5, Sunken Cellar, Whispering
  Woods Cave, and Coastal Reef.
- The retained runtime still owns transition guards, encounter resolution,
  interaction, step handling, save version 4, and both save storage keys.
- No runtime router, adapter expansion, save mutation, production art, dungeon
  topology, Crystal Cave change, Vite/build, commit, push, or deploy occurred.

## Locked decisions

- Preserve both identities: `overworld` is the retained routing ID while
  `overworld-act1-slice` is the semantic data ID.
- Do not fabricate legacy map-revision provenance; the shipped save records none.
- Omitted retained floors remain omitted and are documented as effective floor 1;
  only the Crystal Cave floor-5 entry is explicit.
- Retained guards stay exact retained facts. They are not converted into
  semantic `requiredFlag` fields.
- Dungeon arrival correction remains `unverified`; no floor topology was read or
  copied to resolve it.
- Runtime integration must explicitly address encounter zones, interaction
  targets, transition outcomes, routing identity, revision provenance,
  pre-migration snapshots, HUD compatibility, retained scene-state sync, and
  selective runtime routing/re-entry.

## Roadmap status

- Stage 1 stabilization: complete.
- Stage 2 behavior census: Act 1 overworld slice complete. Town- and
  dungeon-specific manifests remain future per-map work and must still precede
  those migrations.
- Stage 3 engine shell: pure contracts complete; runtime routing remains unwired.
- Stage 4 overworld vertical slice: structurally partial and still active.
- Stages 5–10: not started in this workstream.

Seven forward roadmap stages remain, counting the partial Stage 4 plus Stages
5–10. Future per-map behavior manifests are obligations inside Stages 7–9, not
extra numbered roadmap stages.

## Risks and blockers

Stage 4 cannot pass its production visual gate because no shippable Terrain F
atlas, natural-route edge family, or culled chunk texture set exists. Camera
motion/video, chunk seams, occlusion, runtime transitions, save migration,
performance, and device proof also remain unverified. Runtime cutover additionally
needs approved revision provenance, pre-migration snapshots, selective routing,
and retained-scene compatibility synchronization.

## Resume here

Keep Stage 4 marked partial. The next implementation boundary should be approved
before changing the runtime: either scope production Terrain F asset work, or
lock and test a pure expanded adapter contract for encounter-zone identity,
interaction targets, transition outcomes, retained scene-state synchronization,
and selective legacy re-entry. Do not claim runtime parity from pure tests.

## Kickoff prompt

Resume in `/Users/christopherhachisu/Documents/claudecode/edu-rpg-map-engine-semantic-data`.
Read parent `edu-rpg/AGENTS.md`, this handoff, and the migration/save/rollback
sections of `docs/MAP-ENGINE-REBUILD.md`. Preserve the dirty tree and 4.99 MB
runtime. Seven forward stages remain: partial Stage 4 plus Stages 5–10. Choose
and explicitly scope the next Stage 4 boundary before editing. Do not copy
dungeon topology, modify Crystal Cave, Vite/build, wire or mutate the preserved
runtime/save data, commit, push, or deploy without authorization.
