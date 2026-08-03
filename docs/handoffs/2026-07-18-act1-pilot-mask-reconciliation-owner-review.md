---
date: 2026-07-18
type: handoff
project: edu-rpg
milestone: act1-pilot-mask-reconciliation-owner-review
status: active
relay_chain_id: edu-rpg-act1-overhaul
relay_sequence: "22"
relay_task_title: Edu-RPG Relay 22 — Pilot Mask Reconciliation
relay_status: owner-review
relay_predecessor_thread_id: 019f732a-180b-7571-86ed-e194c82e36d9
relay_current_thread_id: 019f73a6-7621-7ca2-ae4d-03e80c5ad216
relay_successor_thread_id: null
subagents_drained: true
background_sessions_drained: true
---

# Pilot mask reconciliation owner review

## Outcome

Relay 22 produced a deterministic design-only reconciliation pack under
`design/review/overworld-art-blueprint/act-by-act/act1/runtime-v2/terrain-legibility-reconciliation-r22/`.
It changes no runtime, public/dist, route, trigger, save, manifest, adapter,
compositor, preserved artifact, or accepted art.

The corrected Greenhollow–Sunken and Port–Coral masks preserve all 53 Relay 21
contracts, all seven full semantic routes and 77 waypoints, eight anchors, all
walkable/blocked/boundary/bridge probes, actor radius `4`, maximum substep `2`,
four pilot connections, seven pilot blockers, and seven transitions. Eight
mask-derived admission regions plus 1,941 exact blocked overrides reconstruct
the corrected masks with zero collision mismatch and zero role-invariant
mismatch. Exactly the same four legacy static obstacles as Relay 21 are
superseded in the unapplied proposal.

Relay 20 accepted art remains byte-identical:

- Greenhollow–Sunken `7bb0d0bfb10e3b86224d65082c3f7a972330bc50310eef8d6f0ff938f50c4e02`;
- Port–Coral `07ace3bd35dc911ad24c25077b4793e0ee54cfd848139596c16e3d8688f32ccf`.

## Owner-review stop

Fresh static and movement reviews pass. Fresh art/mask review returns
**OWNER-JUDGMENT-REQUIRED**: the corrected mask is mechanically sound but the
locked art does not unambiguously support every changed region.

Material owner decisions are isolated in:

- Greenhollow roof/south threshold and Sunken ruin edge openings;
- dense-looking Greenhollow crop-top forest `[617,1664,633,1685)`;
- Port tree blocker `[1880,1395,1891,1406)` on road/open-looking ground;
- Port north transition blocker `[1860,1495,1871,1506)`;
- Port southeast transition blocker `[2085,1735,2096,1746)`;
- mildly ambiguous Crystal clearance squares `[2105,1200,2116,1211)` and
  `[2030,1265,2041,1276)`.

The full exact inventory is `visual-consistency-ledger.json`: 26 connected
delta regions with canonical pixel row runs and hashes. `VISUAL-CONSISTENCY.md`
summarizes the 13 direct role contradictions and independent art-reading notes.
Relay 22 does not edit art and does not apply `PROPOSED-PROMOTION.diff`.

## Verification

- confined deterministic rebuild: PASS, byte-identical;
- protected Relay 20/21/runtime hashes: PASS;
- Relay 21 candidate movement gate: PASS;
- Relay 22 focused movement: PASS;
- Relay 22 read-only preservation audit: PASS, zero conflicts/no write;
- current polygon/path-corridor/runtime-override suites: PASS;
- temporary TypeScript map-engine compile and four retained suites: PASS;
- shipped DQ replay, runtime snapshot, and runtime override checks: PASS;
- `runtime_baseline.py verify-act1 --input dist`: PASS;
- static smoke: PASS, eight key requests;
- syntax, JSON, diff-apply, whitespace, exact derivation: PASS.

Deterministic candidate hashes:

- adapter-ready geometry `649f85613da7582a8de2e0d2244531444e8d016d4d80a79143a4f951ee5f9175`;
- proposed geometry `4ac92bd74212763e282a62be5e8e51a9bf99cf71750659ed0334d77504dfcec0`;
- inventory `49226fe7618e28f747382eacc4f3f87922419b78a0f36b54b13997fdc8e029a2`.

## Agent drain ledger

- `/root/r22_contract_census`: completed read-only; exact 53-conflict baseline,
  protected hashes, commands, and confinement contract established.
- `/root/r22_movement_design`: completed read-only; point-only repair rejected;
  radius-safe route coverage plus seven blocked footprints recommended.
- `/root/r22_art_agreement`: completed read-only; art hashes, 31 unique centers,
  semantic contradictions, and exact row-run ledger method established.
- `/root/r22_builder`: interrupted after its timebox; no retained file from that
  attempt and no live process remains.
- `/root/r22_static_review`: completed read-only PASS; no material finding.
- `/root/r22_movement_review`: completed read-only PASS; blocker sweeps, detour,
  53 entries, and seven routes independently reproduced.
- `/root/r22_art_mask_review`: completed read-only OWNER-JUDGMENT-REQUIRED;
  exact delta reconstruction and material regions recorded above.
- All collaboration agents are completed or interrupted; none remains live.
- All owned builders, compilers, smoke servers, and unified execution sessions
  completed and closed. No listener remains on `5174`.
- Pre-existing `/private/tmp/edu-sbx` listeners on `5180` (PIDs `31133` and
  `72575`) were not started, owned, or touched by Relay 22.

## Locked decisions

- Do not alter Relay 20 accepted art or Relay 20/21 evidence.
- Do not move routes, triggers, anchors, saves, or probes.
- Do not promote runtime files from this handoff without a new explicit owner
  approval of the exact visual ambiguities above.
- Do not rebuild Vite, replace the legacy bundle, branch, commit, push, deploy,
  release, or mutate App Store Connect.

## Resume here

Owner action: review the two delta overlays and decide whether the exact
mechanically passing candidate is visually acceptable. If not, identify which
listed regions may reopen art, masks, or route semantics; no boundary is
assumed. Do not create a successor task before that decision.

## Kickoff prompt after exact-candidate approval

`[relay:edu-rpg-act1-overhaul:23]` — **Edu-RPG Relay 23 — Reconciled Pilot Promotion Review**

Work only in `/Users/christopherhachisu/Documents/claudecode/edu-rpg-map-engine-semantic-data`
on the existing dirty checkout; no branch/worktree. Resume from this handoff
and the Relay 22 review directory. Read parent/project `AGENTS.md`, `$edu-rpg`,
`$coding-skill`, `$ponytail`, `$relay-fresh-sessions`, and `$session-relay`.

Single outcome, only after explicit owner approval of the exact Relay 22 visual
candidate: verify and prepare the smallest authorized promotion of the three
`walkable-regions-v1.json` twins from the unapplied Relay 22 diff. Recheck all
Relay 22 gates, protected hashes, preserved artifact, static smoke, and rendered
visual consistency before any runtime write. No route, trigger, save, manifest,
adapter, compositor, art, bundle, Vite/npm source build, branch/worktree,
commit, push, deploy, release, TestFlight, or App Store Connect action unless
separately authorized. Use `$relay-fresh-sessions` at the next verified boundary.
