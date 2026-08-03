---
date: 2026-07-18
type: handoff
project: edu-rpg
milestone: act1-approved-terrain-pilots-integration-readiness-owner-review
status: active
relay_chain_id: edu-rpg-act1-overhaul
relay_sequence: "21"
relay_task_title: Edu-RPG Relay 21 — Approved Pilot Integration Readiness
relay_status: delegated
relay_predecessor_thread_id: 019f72e0-16ab-7b10-8406-aa772de3f0da
relay_current_thread_id: 019f732a-180b-7571-86ed-e194c82e36d9
relay_successor_thread_id: 019f73a6-7621-7ca2-ae4d-03e80c5ad216
subagents_drained: true
background_sessions_drained: true
---

# Approved terrain-pilot integration readiness owner review

## Outcome

Relay 21 produced the deterministic, design-only readiness pack under
`design/review/overworld-art-blueprint/act-by-act/act1/runtime-v2/terrain-legibility-integration-r21/`.
No manifest, compositor, public/dist runtime, adapter, route, trigger, save,
art, or preserved-artifact file changed.

The adapter-ready candidate passes against the current collision consumer:
five mask-derived admission regions, 1,563 selected exact blocked overrides,
zero mask mismatch, actor radius `4`, maximum substep `2`, four required
connections, seven transition probes, seven structure/water blockers, and no
tunneling or sticky RLE seams. Port–Coral has one explicit deterministic
clearance adjustment: `(1730,2380)` to `(1735,2380)`; the approved mask is
unchanged.

The exact data-only proposed promotion is **not ready**. The preservation audit
fails on 53 retained points: 26 route waypoints, three landmark anchors, 16
walkable probes, one boundary-inside probe, six blocked probes admitted, and
one boundary-outside probe admitted. The decisive example is Greenhollow
`(677,1957)`, blocked by the approved mask but retained as a landmark anchor and
the first waypoint of three routes. Re-admission would violate the mask; moving
it would violate the no-route/trigger-change lock.

Canonical review:

- `terrain-legibility-integration-r21/INTEGRATION-READINESS.md`
- `terrain-legibility-integration-r21/VERIFICATION.md`
- `terrain-legibility-integration-r21/promotion-conflicts.json`
- `terrain-legibility-integration-r21/PROPOSED-PROMOTION.diff`
- `terrain-legibility-integration-r21/ROLLBACK.md`

Current runtime-v2 polygon, path-corridor, runtime-override, retained behavior,
preserved Act 1 verification, and eight-request static smoke gates all pass.
The promotion-preservation gate intentionally fails and cannot be repaired
inside Relay 21 without reopening a locked owner boundary.

## Owner decision — approved 2026-07-18

The owner accepted the lead recommendation: reopen only the two pilot masks and
their coverage to reconcile the 53 retained runtime points. Preserve the
current routes, triggers, saves, and the accepted Relay 20 art byte-for-byte.
If corrected semantic collision would require an art change, record the visual
mismatch and stop at owner review; do not regenerate or revise art in Relay 22.

Relay 22 may revise only the Greenhollow–Sunken and Port–Coral traversability
masks, semantic-role agreement, derived review collision, inventories, focused
tests, and design-only review evidence needed to make the approved mask truth
compatible with the retained runtime contract. It must preserve the 26 route
waypoints, three landmark anchors, existing walkable/blocked/boundary/bridge
probes, actor radius `4`, maximum substep `2`, and all Relay 18–21 protected
hashes outside its new review directory.

This verdict does not authorize runtime promotion, route/trigger/save changes,
art changes, a narrower split-authority override, or work outside the two
pilots. Do not apply Relay 21's rejected promotion diff.

## Agent drain ledger

- `/root/relay21_static_review`: completed read-only; pack PASS, promotion NO;
  all hashes, write confinement, derivation, diff scope, rollback, syntax, and
  static checks passed. Its bytecode-cache hardening note was resolved by
  setting `sys.dont_write_bytecode = True` before the Relay 20 import.
- `/root/relay21_movement_review`: completed read-only; candidate movement PASS,
  proposed promotion FAIL with the same 53 conflicts.
- Owned shell sessions: candidate movement session completed; one earlier
  overlong proof run was interrupted and confirmed closed; no server, watcher,
  recorder, compiler, or unified execution session remains live. The unrelated
  pre-existing PID `31133` HTTP server on port `5180` was not started or touched
  by Relay 21.

## Resume here

Create exactly one fresh Relay 22 task on this same dirty checkout. Reconcile
the two pilot masks against the complete Relay 21 conflict ledger without
moving protected runtime points or revising accepted art. Return a new
design-only candidate, full preservation audit, exact visual-consistency
ledger, and owner-review handoff; do not promote it.

## Kickoff prompt after owner decision

`[relay:edu-rpg-act1-overhaul:22]` — **Edu-RPG Relay 22 — Pilot Mask Reconciliation**

Work only in `/Users/christopherhachisu/Documents/claudecode/edu-rpg-map-engine-semantic-data`
on the existing dirty checkout; no branch/worktree. Resume from this handoff and
the Relay 21 integration directory. Read parent/project `AGENTS.md`, `$edu-rpg`,
`$coding-skill`, `$ponytail`, `$relay-fresh-sessions`, `$session-relay`, and the
approved Option 1 verdict above.

Single outcome: revise only the Greenhollow–Sunken and Port–Coral semantic
traversability masks/coverage so the mask-derived candidate preserves all 53
Relay 21 retained points, all named routes and anchors, existing walkable,
blocked, boundary, and bridge probes, actor radius `4`, maximum substep `2`,
and required pilot connectivity. Keep accepted Relay 20 art byte-identical. If
the corrected mask no longer agrees visually with that art, inventory the exact
pixels/regions and stop for owner judgment rather than editing or regenerating
art. Produce deterministic masks, semantic-role agreement, derived review
collision, focused tests, a new proposed promotion diff, visual-consistency
ledger, rollback plan, and verification under a new design-only Relay 22 review
directory. End at owner review; do not promote runtime files.

Run every Relay 21 candidate and preservation gate plus deterministic rebuild,
zero mask/collision mismatch, protected-hash checks, current polygon/path/
runtime-override suites, retained behavior, preserved-artifact baseline, and
static smoke. Use fresh independent static, movement, and art/mask-consistency
reviews. Do not alter Relay 20/21 evidence in place.

No manifest, compositor, public/dist runtime, adapter, routes, triggers, saves,
accepted art, preserved artifact, full-map work, Vite/npm source build, legacy
bundle replacement, branch/worktree, commit, push, deploy, release, TestFlight,
or App Store Connect action. Preserve the shared dirty tree. Before acting,
verify the exact task title/handoff metadata, branch/HEAD/dirty tree, locked
hashes, and absence of inherited live agents or owned background sessions. Use
`$relay-fresh-sessions` at the next verified boundary.
