---
date: 2026-07-18
type: handoff
project: edu-rpg
milestone: act1-approved-terrain-pilots-integration-readiness
status: active
relay_chain_id: edu-rpg-act1-overhaul
relay_sequence: "21"
relay_task_title: Edu-RPG Relay 21 — Approved Pilot Integration Readiness
relay_status: delegated
relay_predecessor_thread_id: 019f72e0-16ab-7b10-8406-aa772de3f0da
relay_successor_thread_id: 019f732a-180b-7571-86ed-e194c82e36d9
subagents_drained: true
background_sessions_drained: true
---

# Approved terrain-pilot integration readiness

## Outcome inherited from Relay 20

The owner accepted the Greenhollow–Sunken and Port–Coral semantic-mask-first
terrain-legibility pilots, including the recorded Sunken courtyard and Port
dock/clearing cautions, with “go with this” on 2026-07-18.

Relay 20 locked:

- the grayscale `0/127/255` traversability plane, with final candidate masks
  containing only `0` and `255`;
- the separate binary RGB semantic-role plane: water, structure, transition;
- candidate collision as an exact derivation of `traversability == 255`;
- approved landmark/water preservation with zero changed preservation pixels;
- six route-hidden exact-phone frames that passed fresh blind review.

Authoritative Relay 20 inputs:

- contract:
  `design/review/overworld-art-blueprint/act-by-act/act1/runtime-v2/terrain-legibility-pilot-r20/TERRAIN-LEGIBILITY-CONTRACT.md`
- verification:
  `design/review/overworld-art-blueprint/act-by-act/act1/runtime-v2/terrain-legibility-pilot-r20/VERIFICATION.md`
- inventory:
  `design/review/overworld-art-blueprint/act-by-act/act1/runtime-v2/terrain-legibility-pilot-r20/pilot-inventory.json`
- builder:
  `scripts/build_act1_terrain_legibility_pilots.py`

Locked hashes:

- builder: `97111cfb011c727ff99b1805c3f59e3082e4ea104b9a9e76cb683e37839a3997`
- inventory: `eceb82c7e4857fe86cbdc2007c9734b943baaaac22aaeba6de86d7b659eb05f8`
- contact sheet: `e425790586bee19502ccc63121adb031166b11006eb22f09c43138a8f53037db`
- preserved bundle: `a56026574b42168985b353e4cee824562716af83f92d03f408df04eac9127381`
- manifest twins: `a36eebf18c651ee7749f2bcff7006e0ce5173b34dc2d3010767f0adbde0cef16`
- adapter twins: `588b8db722c7a71890a0e45d0231e7a473789c3accce5beec15f15965ebc4526`

Branch remains `codex/map-engine-semantic-data` at inherited HEAD
`c4f97d5e30762b8a16deff36602252759decce31`. Preserve the shared dirty tree.

## Single next outcome

Produce one non-promoted integration-readiness pack for only the two approved
pilots:

1. Map the approved masks and exact candidate rectangles into the smallest
   adapter-ready geometry representation compatible with the current
   runtime-v2 collision consumer. Do not hand-tune around the approved mask.
2. Prove actor-foot radius `4`, maximum substep `2`, passage connectivity,
   blocked structures/water, and existing route/trigger/save boundaries against
   the current movement semantics.
3. Produce a deterministic candidate package, focused tests, a precise proposed
   promotion diff, and a rollback plan entirely under a new design-only Relay 21
   review directory.
4. End at owner review. Do not wire the package into manifest, compositor,
   public/dist runtime, adapter, routes, triggers, saves, or the preserved
   artifact.

## Failable gates

- Relay 20 hashes and all Relay 18/19 protected inputs remain exact.
- The adapter-ready geometry round-trips to the approved mask with zero
  unexplained mismatch; any necessary runtime clearance transformation is
  explicit, deterministic, and separately inventoried.
- Actor-radius and substep simulation proves every required pilot connection
  and rejects every locked blocked probe without tunneling or sticky seams.
- Existing routes, triggers, saves, runtime-v2 behavior, and preserved baseline
  tests remain unchanged and pass.
- Candidate generation reproduces byte-for-byte and writes only beneath the
  Relay 21 design-only review directory.
- Fresh independent static and movement-semantics reviews pass.
- `git diff --check`, syntax, JSON, deterministic inventory, preserved Act 1
  verification, and static smoke checks pass.

## Explicit non-goals

No repaint, semantic-mask revision, landmark redesign, full-map conversion,
manifest/compositor cutover, public/dist synchronization, adapter change,
route/trigger/save change, runtime promotion, Vite/npm source build, legacy
bundle replacement, branch/worktree, commit, push, deploy, release, TestFlight,
or App Store Connect action.

## Agent drain ledger

Relay 20's six read-only/review agents are completed. No working, waiting, or
idle child agent remains. No owned build, server, recorder, compiler, watcher,
or unified execution session remains live.

## Resume here

Work only in
`/Users/christopherhachisu/Documents/claudecode/edu-rpg-map-engine-semantic-data`
on the existing dirty checkout. Verify this handoff, branch/HEAD, relevant dirty
state, locked hashes, and the absence of inherited live agents or background
sessions. Read the approved Relay 20 contract, verification, inventory, masks,
candidate collision, current runtime-v2 collision consumer, movement tests, and
parent/project instructions. Then create only the design-only integration pack
and stop at owner review.

## Kickoff prompt

`[relay:edu-rpg-act1-overhaul:21]` — **Edu-RPG Relay 21 — Approved Pilot
Integration Readiness**

Work only in
`/Users/christopherhachisu/Documents/claudecode/edu-rpg-map-engine-semantic-data`
on the existing shared dirty checkout. Do not create a branch or worktree.

Resume from
`/Users/christopherhachisu/Documents/claudecode/edu-rpg-map-engine-semantic-data/docs/handoffs/2026-07-18-act1-approved-terrain-pilots-integration-readiness-relay.md`.
Read parent/project `AGENTS.md`, `$edu-rpg`, `$coding-skill`, `$ponytail`,
`$relay-fresh-sessions`, `$session-relay`, the approved Relay 20 contract,
verification, inventory, masks, collision candidates, the current runtime-v2
collision consumer, movement tests, and the Relay 18/19 protected contexts.
Before acting, verify the exact task title/handoff metadata, branch/HEAD/dirty
tree, locked hashes, and absence of inherited live agents or owned background
sessions.

Single outcome: produce a deterministic, non-promoted integration-readiness pack
for only Greenhollow–Sunken and Port–Coral. Map the approved mask-derived
collision into the smallest adapter-ready geometry compatible with current
runtime-v2 semantics; prove actor radius 4, maximum substep 2, required
connectivity, blocked structures/water, and route/trigger/save preservation;
write focused tests, a proposed promotion diff, and rollback plan under a new
design-only Relay 21 review directory. End at owner review.

Run every failable gate above. Do not revise the approved masks/art or modify
manifest, compositor, public/dist runtime, adapter, routes, triggers, saves, or
the preserved artifact. No full-map work, Vite/npm source build, legacy bundle
replacement, branch/worktree, commit, push, deploy, release, TestFlight, or App
Store Connect action. Use `$relay-fresh-sessions` at the next verified boundary.
