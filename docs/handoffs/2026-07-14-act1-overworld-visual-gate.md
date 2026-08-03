---
date: 2026-07-14
type: handoff
status: active-uncommitted
project: edu-rpg
milestone: act1-overworld-design-gate
branch: codex/map-engine-semantic-data
supersedes: docs/handoffs/2026-07-14-progression-gated-reachability-slice.md
---

# Act 1 overworld visual gate

## Outcome

The uncommitted worktree contains the semantic contract, starter world, validators,
minimap, gates, and state-aware reachability. Nothing is runtime-wired. Terrain F's
natural trail and the 64 px field-character scale are approved.

## Current state and verification

- Worktree: `/Users/christopherhachisu/Documents/claudecode/edu-rpg-map-engine-semantic-data`; branch `codex/map-engine-semantic-data`.
- Map-engine test and `git diff --check`: PASS, 2026-07-14.
- Bundle: 4,987,581 bytes; SHA-256 `a560265...a9127381`; 75 monsters.
- No commit, deploy, runtime wiring, or dungeon changes.

## Locked decisions

- Semantic layers stay separate; gates open only for exact-`true` flags.
- Terrain F uses natural trails; forest is blocked.
- Hero/NPC fields target native 64×64 frames and Terrain F density; monsters stay.
  Anchor: `design/art-refs/field-character-scale-64-device-locked.png`.
- Characters follow the renderer/camera gate, before first-town art. Special assets
  wait for each map's locked topology and placements.

## Resume here

Create one 2–3 option Act 1 topology board around Greenhollow/Darkfang. Preserve
story identities/order, not legacy geography. Show routes, clearings, barriers,
spacing, and minimap readability. After signoff, encode the approved graph/tests.

## Kickoff prompt

Resume in the worktree above. Read parent `edu-rpg/AGENTS.md`, this handoff,
`docs/MAP-ENGINE-REBUILD.md`, `design/ART-DIRECTION.md`, and `docs/AGENT-WORKFLOW.md`.
Preserve dirty semantic work and the 4.99 MB runtime. Create the Act 1 option board
described above and get owner signoff before code. Do not generate production
characters, Vite/build, wire rendering, inspect dungeons, modify Crystal Cave,
commit, push, or deploy.
