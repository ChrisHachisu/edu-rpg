---
date: 2026-07-18
type: handoff
project: edu-rpg
milestone: act1-landmark-art-runtime-cutover
status: complete
supersedes: docs/handoffs/2026-07-17-act1-landmark-art-v2-owner-review.md
relay_chain_id: edu-rpg-act1-overhaul
relay_sequence: "18"
relay_task_title: Edu-RPG Relay 18 — Approved Landmark Art Runtime Cutover
relay_status: complete
relay_predecessor_thread_id: 019f706e-2da2-7470-aa06-9c889ec938d1
relay_successor_thread_id: 019f71ff-2623-7263-a9e1-f68a9f997265
subagents_drained: true
background_sessions_drained: true
---

# Approved landmark art runtime cutover

## Outcome entering Relay 18

Owner approved Relay 17's exact Port Sapphire, Greenhollow, Sunken Ruin,
Millbrook v4, Coral Reef, and derived Millbrook outer-west integration. The
145-file art inventory is `7613ec6a…d0d4`; 563 preserved inputs remain
`878346fb…6f3a`. Millbrook is immutable `b6338f3e…f98190`; never use v5/v6.

Branch `codex/map-engine-semantic-data`, HEAD `c4f97d5e…ce31`, shared dirty tree
preserved. Current design/public/dist manifest twins are revision 9,
`67be41f9…a8724`. No owned agent or background session remains live.

## Single next outcome

Cut the owner-approved v2 landmark art inputs into the locked runtime manifest
and additive preserved-artifact `public/act1-hifi` + `dist/act1-hifi` twins,
then prove the live route-hidden `852x1846` game surface renders those exact
bytes. This is an art-only cutover: preserve current polygon, collision,
trigger, route, save, and adapter behavior exactly. Relay the separately
verified walkability/collision rebuild afterward.

## Failable checks

- Exact Relay 17 source hashes and `1254x1254 RGB` locks.
- Minimal manifest revision bump with only target art-region paths/hashes and
  required inventory metadata changed.
- Exact public/dist asset twins and manifest twins.
- Unchanged walkable polygons, route-state, triggers, saves, adapter semantics,
  non-target art, monsters, bundle, and other preserved assets.
- Live headed native-WebGL `852x1846` captures for all five landmarks with
  route overlay hidden and telemetry bound to exact manifest/art hashes.
- Healthy preserved bundle remains 4.5–5.5 MB with 75 monsters.
- `git diff --check`; fresh independent visual/static review.

## Non-goals

No art redesign/generation; no mask/polygon/collision/trigger/route/save or
adapter behavior; no Vite/npm source build; no branch/worktree/commit/push,
deploy/release/TestFlight/App Store Connect action.

## Agent drain ledger

- Collaboration tree: root only; no working/waiting/idle child.
- Builder/server/recorder sessions owned by Relay 17: none live.

## Kickoff prompt

`[relay:edu-rpg-act1-overhaul:18]` — **Edu-RPG Relay 18 — Approved Landmark
Art Runtime Cutover**

Work only in `/Users/christopherhachisu/Documents/claudecode/edu-rpg-map-engine-semantic-data`
on the existing shared dirty checkout; no branch/worktree. Resume from
`/Users/christopherhachisu/Documents/claudecode/edu-rpg-map-engine-semantic-data/docs/handoffs/2026-07-18-act1-landmark-art-runtime-cutover-relay.md`.
Read parent/project `AGENTS.md`, `$edu-rpg`, `$game-design`, `$coding-skill`,
`$ponytail`, `$relay-fresh-sessions`, `$session-relay`, the Relay 17 provenance,
verification, inventory, current manifest, and preserved-cutover exporter/
capture harness. Verify handoff metadata, branch/HEAD/dirty tree, exact locks,
and no inherited live work before editing.

Single outcome and checks/non-goals are exactly those above. Use the smallest
additive preserved-artifact cutover; never run Vite or rebuild the legacy
bundle. Stop on any required behavior change or unproven live surface. At the
verified boundary, drain all owned agents/sessions. Use `$relay-fresh-sessions`
at the next verified boundary.
