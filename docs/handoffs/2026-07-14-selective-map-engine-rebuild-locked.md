---
date: 2026-07-14
type: handoff
project: edu-rpg
milestone: selective-map-engine-rebuild
status: active
supersedes: 2026-07-13-terrain-f-movement-world-rebuild-decision.md
---

# Handoff: selective map-engine rebuild locked

## Outcome

The owner selected the natural dirt trail over the visible brick road and
approved a selective rebuild of the map engine. The approved comparison is now
locked at `design/art-refs/terrain-f-natural-trail-comparison-locked.png` and the
architecture contract is `docs/MAP-ENGINE-REBUILD.md`.

The scope now includes the overworld, towns rebuilt one by one, and holistic
dungeon-floor regeneration. Dungeon floor count and gameplay systems remain,
but existing floor topology and special-object coordinates are forbidden inputs.

The owner also approved a stabilization milestone before implementation so the
code/data baseline can support safe worktree delegation. The locked prerequisite
is `docs/STABILIZATION-PLAN.md`.

## Locked decisions

- Forest/tree terrain is impassable.
- Roads remain semantic data and render as natural dirt trails.
- The minimap independently renders the same terrain/route/landmark semantics.
- Use continuous grid-buffered movement, not free analog movement.
- Retain shipped battles, quests, progression, saves, UI, localization, and shell.
- Rebuild towns individually with natural, distinct layouts.
- Rebuild each dungeon from its behavior manifest; special placements are
  generator outputs and validated with progression-aware solvers.
- Crystal Cave remains excluded by repository safety rules.
- Stabilization and fresh-worktree proof must pass before selective-engine
  implementation or parallel delegation begins.
- Preserve the dirty tree and 4.99 MB shipped bundle; never run stale Vite.

## Current state

- No game code, map data, generated dungeon floor, runtime asset, deployment, or
  App Store Connect state changed in this milestone.
- `design/ART-DIRECTION.md` now records the locked environment direction.
- Read-only audits verified the local bundle at 4,987,581 bytes with SHA-256
  `a56026574b42168985b353e4cee824562716af83f92d03f408df04eac9127381`,
  found no source map, and proved that a fresh worktree cannot materialize the
  current shipped runtime.
- The next work is stabilization inventory and authority reconciliation, not
  map-engine implementation or production asset generation.

## Resume here

Read `AGENTS.md`, this handoff, `docs/STABILIZATION-PLAN.md`, and
`docs/MAP-ENGINE-REBUILD.md`. Begin with stabilization S0/S1. Do not inspect
existing dungeon floor tile arrays or use them as layout references. Do not start
parallel implementation worktrees until the stabilized baseline is explicitly
authorized, committed, and proven in a fresh worktree. Preserve the bundle and
do not build, deploy, delete the existing linked worktree, or generate an
environment batch without subsequent owner authorization.
