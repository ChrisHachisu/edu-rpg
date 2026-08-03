---
date: 2026-07-17
type: handoff
project: edu-rpg
milestone: act1-visual-mask-sol-owner-review
status: active
supersedes: docs/handoffs/2026-07-17-act1-preserved-artifact-walkable-cutover-relay.md
relay_chain_id: edu-rpg-act1-overhaul
relay_sequence: "11"
relay_status: delegated
relay_predecessor_thread_id: 019f6bf6-bfa4-7af0-80bc-3e3c64995982
relay_successor_thread_id: 019f6d09-27da-7d41-83d9-ba69831a9964
subagents_drained: true
background_sessions_drained: true
---

# Act 1 requires a fresh Sol visual ground mask

## Outcome

The owner rejected `walkable-regions-v1`, its boundary overlay, and the Relay
10 additive cutover because the geometry was authored with the same route-first
mental model as the inaccurate blue paths. Mechanical traversal, collision,
streaming, save, and runtime tests remain valid only as internal-consistency
evidence. They do not establish correct visual walkability.

`design/OVERWORLD-MOVEMENT-BOUNDARIES.md` is authoritative. The replacement
must begin from the complete painted ground plane with all routes, waypoints,
semantic anchors, old polygons, and the rejected overlay hidden.

## Locked visual rules

- Trees and dense forest are boundaries; the actor cannot overlap tree art.
- Water is a boundary.
- Mountain and cliff faces are boundaries except at visibly painted passes.
- A bridge deck and its landings are walkable; both drop-off edges are
  boundaries.
- Buildings, town/dungeon silhouettes, roofs, walls, and landmark bodies are
  boundaries. A landmark is enterable only through its explicit entrance
  throat.
- Open grass, dirt, snow, sand, roads, clearings, and settlement ground are
  walkable whether or not a semantic route crosses them.
- Physical walkability is classified before routes. Roads guide the player but
  do not define collision.

## Current state

- Worktree remains deliberately dirty on `codex/map-engine-semantic-data` at
  inherited HEAD `c4f97d5e30762b8a16deff36602252759decce31`.
- Relay 10 locally mirrored the rejected geometry into the additive preserved
  artifact before owner feedback arrived. It was not committed, pushed,
  deployed, published, released, or sent to TestFlight/App Store Connect.
- The rejected geometry and cutover remain in the dirty tree as failure
  evidence. Do not use them as a tracing baseline and do not micro-adjust them.
- Accepted world/art bytes and manifest revision 8 remain locked.
- All inherited collaboration children are completed. No owned server,
  recorder, capture, watcher, or compiler remains. PID 31133 is an unrelated
  pre-existing server rooted at `/private/tmp/edu-sbx`; do not stop it.

## Single next outcome

Using explicitly selected `gpt-5.6-sol`, create a route-hidden,
native-resolution, full-map visual classification consisting of:

1. a lossless categorical mask with exactly walkable, non-walkable, and
   uncertain/occluded classes;
2. an overlay on the clean collision reference that makes every classification
   boundary legible without covering the underlying art;
3. a native-resolution overlapping-tile review sheet or equivalent evidence
   proving Sol inspected the entire map, not only the seven routes;
4. a concise uncertainty ledger naming every location that requires owner
   judgment.

Stop at owner review. Do not derive polygons, add actor clearance, edit route
semantics, change the adapter, regenerate art, or reintegrate runtime collision
until the owner approves the mask.

## Failable checks

- Inputs contain no blue routes, old polygons, semantic waypoints, or rejected
  overlay pixels.
- The complete `2368 x 2912` source is covered without gaps by inspected
  overlapping native-resolution tiles.
- Mask dimensions match exactly and use only the three locked class values.
- Every tree/forest, water body, mountain/cliff face, structure/landmark body,
  and bridge drop-off is non-walkable unless explicitly logged uncertain.
- Every visible open ground area, pass, bridge deck/landing, and entrance throat
  is walkable unless explicitly logged uncertain.
- No route-shaped ribbon appears where the painting shows broader open ground.
- A second route-hidden visual pass reviews the assembled full-map overlay.
- Deterministic rerender reproduces identical mask and overlay bytes.

## Resume here

Read this handoff, the parent/project `AGENTS.md` files, `edu-rpg`,
`game-design`, `lock-decisions`, `coding-skill`, `ponytail`, `code-check`,
`relay-fresh-sessions`, and `session-relay`, plus
`design/OVERWORLD-MOVEMENT-BOUNDARIES.md`. Use only the clean collision
reference and its accepted-art inventory as visual input. Do not inspect the
rejected overlay or old geometry while classifying.

## Kickoff prompt

`[relay:edu-rpg-act1-overhaul:11]` — **Act 1 Relay 11 — Sol Visual Ground Mask**

Work only in
`/Users/christopherhachisu/Documents/claudecode/edu-rpg-map-engine-semantic-data`.
Resume from
`/Users/christopherhachisu/Documents/claudecode/edu-rpg-map-engine-semantic-data/docs/handoffs/2026-07-17-act1-visual-mask-sol-owner-review-relay.md`.

Use `$relay-fresh-sessions` and `$session-relay`. Read the parent and project
`AGENTS.md` files and the exact skills/specs named under `Resume here`. Verify
handoff metadata, the shared dirty tree, accepted-art hashes, and the absence of
inherited live agents or owned background sessions before acting.

Single outcome: use your explicitly selected Sol visual judgment to classify
the entire clean `2368 x 2912` collision reference into a native-resolution
three-class ground mask: walkable, non-walkable, uncertain/occluded. Hide and do
not inspect all routes, waypoints, semantic anchors, old polygons, and the
rejected overlay during classification. Inspect the full map through
overlapping native-resolution tiles, assemble a legible full-map overlay, run a
second route-hidden visual review, produce a concise uncertainty ledger, and
stop for owner approval.

Trees/forest, water, mountain/cliff faces except visible passes, structures and
landmark bodies except explicit entrance throats, and bridge drop-off edges are
non-walkable. Open grass/dirt/snow/sand/roads/clearings/settlement ground,
visible passes, bridge decks/landings, and entrance throats are walkable. Do not
create route-shaped ribbons across broader ground.

Do not derive polygons, apply actor-foot clearance, alter semantic routes or
saves, change the adapter, reintegrate collision, generate art, run Vite,
rebuild legacy source, commit, push, deploy, publish, release, alter TestFlight/
App Store Connect, create a branch/worktree, expand dungeons, modify retained
landmarks, or author later-act masks. Preserve all accepted art bytes. Stop at
owner review even if the mask appears complete.

Failable checks are the exact list in this handoff. Use
`$relay-fresh-sessions` at the next verified boundary only after owner approval
or an explicit owner decision.
