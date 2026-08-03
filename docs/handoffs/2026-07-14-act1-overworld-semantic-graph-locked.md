---
date: 2026-07-14
type: handoff
status: active-uncommitted
project: edu-rpg
milestone: act1-overworld-semantic-graph
branch: codex/map-engine-semantic-data
supersedes: docs/handoffs/2026-07-14-act1-overworld-visual-gate.md
---

# Act 1 overworld semantic graph locked

## Outcome

The owner approved **Option A — Braided Pilgrim Trail**. Revision 2 of the
starter semantic overworld now encodes the guided Greenhollow → Millbrook →
Port Sapphire → Darkfang (`mistyGrotto`) → Crystal Cave spine plus Sunken
Cellar, Whispering Woods Cave, and Coastal Reef spurs. The approved board and
decision record live in `design/review/act1-overworld-topology/`.

## Verification

- `pnpm run test:map-engine`: PASS after a failing-first inherited-true gate
  regression; all route endpoints and all minimap route cells are asserted.
- Fresh read-only code review: PASS, no findings at confidence 50 or above.
- Seed-42 snapshot: 11,315 bytes; SHA-256
  `b70bd82249e9b706539fc13f5b1b94d9e3bcba55a25876ca164594f0b64fbdf8`.
- `verify:runtime` and `git diff --check`: PASS. Bundle remains 4,987,581 bytes
  with 75 monster PNGs.

## Locked decisions

- Option A topology and revision 2 are locked; coordinates are new semantic
  review cells, not legacy geography.
- Forest, the Crystal ridge, and coast are blocked except for authored routes
  and approach clearings.
- Crystal has one semantic seal. It opens only when
  `boss.giantToad.defeated` is an own property with value exactly `true`.
- Optional quest entry guards remain in the retained transition adapter until
  authoritative boolean flag names exist; do not invent semantic flags.

## Current state

No runtime wiring, renderer, movement controller, save relocation, production
art, dungeon topology, Crystal Cave changes, commit, push, or deploy. Preserve
the dirty worktree and 4.99 MB runtime.

## Resume here

Complete the remaining pure selective-engine shell before rendering: buffered
cardinal movement with tile-center semantic commits and the narrow retained-map
event adapter contract, both with focused tests. Then use this locked graph for
the Terrain F renderer/camera/minimap vertical-slice gate. Do not Vite/build or
wire the preserved bundle until that integration boundary is explicitly scoped.

## Kickoff prompt

Resume in `/Users/christopherhachisu/Documents/claudecode/edu-rpg-map-engine-semantic-data`.
Read parent `edu-rpg/AGENTS.md`, this handoff, `docs/MAP-ENGINE-REBUILD.md`, and
the approved topology README. Preserve the dirty tree and runtime. Implement
only the pure movement/controller + retained-event adapter shell with focused
tests. Do not Vite/build, modify any dungeon or Crystal Cave, generate art,
wire runtime, commit, push, or deploy.
