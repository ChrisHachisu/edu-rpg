---
date: 2026-07-14
type: handoff
status: active-uncommitted
project: edu-rpg
milestone: pure-map-engine-shell
branch: codex/map-engine-semantic-data
supersedes: docs/handoffs/2026-07-14-act1-overworld-semantic-graph-locked.md
---

# Pure map-engine shell complete

## Outcome

The selective map engine now has a pure cardinal movement controller and a
narrow retained-event dispatcher. Movement interpolates continuously in cell
units, buffers the latest cardinal request, checks collision only when leaving
a center, and commits semantic cells only on arrival at the next center.

The dispatcher preserves the shipped scene boundary: committed centers call
`onStep`, interaction requests call `interact`, and semantic transitions map to
the retained `performTransition({ targetMap, toX, toY, toFloor })` shape. Story
and quest entry guards remain authoritative inside retained transition handling.

## Verification

- Failing-first compile: PASS (missing shell modules caused the expected focused
  test failure before implementation).
- `pnpm run test:map-engine`: PASS for the approved Act 1 semantic graph and the
  new movement/event shell.
- Code check: PASS, no findings at confidence 50 or above.
- `pnpm run verify:runtime`: PASS.
- `git diff --check`: PASS.
- Preserved bundle: 4,987,581 bytes; monster PNG count: 75.

## Current state

- Added `src/map-engine/movementController.ts`,
  `src/map-engine/retainedMapEvents.ts`, and focused shell tests.
- Extended `test:map-engine` to execute both semantic-data and shell tests.
- No renderer, camera, runtime wiring, save relocation, production art, dungeon
  topology, Crystal Cave change, commit, push, or deploy.

## Locked decisions

- Movement remains cardinal and renderer-agnostic; render position may be
  fractional, but the authoritative semantic cell is always an integer center.
- The newest buffered input wins and is evaluated at the next center.
- Collision denial consumes that buffered request without emitting a commit.
- Optional quest gates stay in retained `performTransition`; do not invent
  semantic boolean flags.

## Remaining work

Use the locked revision-2 Act 1 graph and pure shell for the Terrain F
renderer/camera/minimap vertical-slice design gate. Scope and approve that
integration boundary before wiring the preserved runtime.

## Risks and blockers

The shell is unit-verified only because runtime integration is intentionally out
of scope. Continuous rendered feel, camera behavior, and minimap presentation
remain unverified until the vertical slice exists.

## Resume here

Read parent `edu-rpg/AGENTS.md`, this handoff, `docs/MAP-ENGINE-REBUILD.md`, and
the approved topology README. Scope the Terrain F renderer/camera/minimap
vertical slice around the pure APIs in `src/map-engine/`. Preserve the 4.99 MB
runtime and do not Vite/build, change dungeons or Crystal Cave, wire runtime,
commit, push, or deploy without an explicit new boundary and authorization.

## Kickoff prompt

Resume in `/Users/christopherhachisu/Documents/claudecode/edu-rpg-map-engine-semantic-data`.
Read parent `edu-rpg/AGENTS.md`,
`docs/handoffs/2026-07-14-pure-map-engine-shell-complete.md`,
`docs/MAP-ENGINE-REBUILD.md`, and
`design/review/act1-overworld-topology/README.md`. Preserve the dirty tree and
runtime. Begin only the Terrain F renderer/camera/minimap vertical-slice design
gate using the locked revision-2 semantic graph and pure movement/event shell.
Do not Vite/build, change dungeon topology or Crystal Cave, wire the preserved
bundle, generate production art, commit, push, or deploy without explicit scope.
