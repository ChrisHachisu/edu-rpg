---
date: 2026-07-18
type: handoff
project: edu-rpg
milestone: act1-landmark-walkability-collision-rebuild
status: active
relay_chain_id: edu-rpg-act1-overhaul
relay_sequence: "19"
relay_task_title: Edu-RPG Relay 19 — Approved Landmark Walkability and Collision Rebuild
relay_status: delegated
relay_predecessor_thread_id: 019f71ff-2623-7263-a9e1-f68a9f997265
relay_successor_thread_id: 019f7270-ad49-7440-9757-7521027a585d
subagents_drained: true
background_sessions_drained: true
---

# Approved landmark walkability and collision rebuild

## Verified Relay 18 boundary

Relay 18 cut the owner-approved Port Sapphire, Greenhollow, Sunken Ruin,
exact Millbrook `b6338f3e…f98190`, derived Millbrook outer-west, and Coral Reef
art into manifest revision 10 and exact additive public/dist twins.

- Manifest: `a36eebf18c651ee7749f2bcff7006e0ce5173b34dc2d3010767f0adbde0cef16`
- Runtime source proof: `ad40cf8212452738d47a8ab9161b17f51104a3ca33919642e437354aa5aada52`
- Runtime HTML twins: `bb7fb54c587323f55676e6ab5c6ee38b8cde768cba18fbfb6aca30633dcb3942`
- Adapter: `588b8db722c7a71890a0e45d0231e7a473789c3accce5beec15f15965ebc4526`
- Preserved bundle: `a56026574b42168985b353e4cee824562716af83f92d03f408df04eac9127381`,
  `4,987,581` bytes, 75 monsters
- Landmark art proof: `7c4edb4963de2d20e1633d3a27fec64dcef36d257305dca705d56d11f97a1d44`

The final headed native-Metal proof passed seven routes, seven real
transitions, save/reload, free-roam, affinity, and five route-hidden
`852x1846` landmark captures with zero errors, zero ignored lifecycle aborts,
and zero visible asset/detail misses. Fresh independent static and visual
reviews passed. Verification is recorded in
`design/review/overworld-art-blueprint/act-by-act/act1/runtime-v2/LANDMARK-ART-RUNTIME-R18-VERIFICATION.md`.

Branch remains `codex/map-engine-semantic-data` at inherited HEAD
`c4f97d5e30762b8a16deff36602252759decce31`; preserve the shared dirty tree.
All Relay 18 agents and owned sessions are drained.

## Single next outcome

Audit the current walkable polygons and collision boundary against the exact
approved landmark art, then make only the minimum data corrections required
for the approved entrance/pass-through contract to be true in live play:

- Port Sapphire: west, north, and southeast gates; no invented internal
  through-road.
- Greenhollow: one south entrance and open surrounding ground.
- Sunken Ruin: blocked west arch and one northeast entrance.
- Millbrook: uninterrupted west-east pass-through.
- Coral Reef: preserve the approved entrance/channel continuity.

Start from current live collision/probe evidence and the locked art contexts;
do not infer geometry from names alone. Keep the Relay 18 art, manifest,
runtime compositor, adapter, routes, triggers, save semantics, and preserved
bundle exact. Stop if correct collision would require a route, trigger, save,
adapter, or art change, or if an entrance boundary remains materially
ambiguous.

## Failable checks

- Relay 18 manifest/art/runtime/public/dist/bundle hashes remain exact.
- Polygon/collision changes, if any, are localized to proven landmark boundary
  mismatches; unchanged regions and behavior files remain byte-identical.
- Deterministic walkable geometry validation, disk-safe joins, blockers,
  sliding, clamping, no-tunneling, route selection, and 5,000-step invariant
  pass with regenerated exact probe evidence.
- Headed native-WebGL `852x1846` live traversal proves each approved entrance,
  blocked edge, and Millbrook pass-through with route overlay hidden.
- Exact public/dist twins, static overlay verification, healthy preserved
  bundle/75 monsters, syntax checks, `git diff --check`, and fresh independent
  static/visual review pass.

## Non-goals

No art redesign/generation, manifest art cutover, route/trigger/save/adapter
behavior, Vite/npm source build, legacy bundle replacement, branch/worktree,
commit, push, deploy, release, TestFlight, or App Store Connect action.

## Kickoff prompt

`[relay:edu-rpg-act1-overhaul:19]` — **Edu-RPG Relay 19 — Approved Landmark
Walkability and Collision Rebuild**

Work only in `/Users/christopherhachisu/Documents/claudecode/edu-rpg-map-engine-semantic-data`
on the existing shared dirty checkout; no branch/worktree. Resume from this
handoff. Read parent/project `AGENTS.md`, `$edu-rpg`, `$game-design`,
`$coding-skill`, `$ponytail`, `$relay-fresh-sessions`, `$session-relay`, Relay
18 verification/telemetry, the current walkable geometry/probes/tests, and the
five locked landmark contexts. Verify task title/metadata, branch/HEAD/dirty
tree, exact Relay 18 hashes, owner locks, and the drain ledger before editing.

The single outcome, checks, stop conditions, and non-goals are exactly those
above. Use an audit-first, smallest-data-diff rebuild. At the next verified
boundary, drain every owned agent and session before creating one successor.
