---
date: 2026-07-15
type: handoff
status: owner-review-pending
project: edu-rpg
milestone: act1-v4-routing-corrections-v3
supersedes: docs/handoffs/2026-07-15-act1-v4-fidelity-master-owner-checkpoint.md
---

# Act 1 routing corrections V3 owner review

## Outcome

Updated the V4-derived design from owner feedback:

- Port Sapphire now reaches open sea through a boat-width channel beneath an
  arched bridge carrying the Port-to-Coastal-Reef trail.
- Dense old-growth forest removes Millbrook's direct south/Reef shortcut.
- Greenhollow-to-Millbrook via the west bridge and Millbrook-to-Port remain open.

## Anchor and candidate

- Locked reference: `design/review/overworld-art-blueprint/act-by-act/act1/generated/act1-v4-fidelity-master-2368x2912.png`.
- Owner candidate: sibling `act1-v4-routing-corrections-v3-2368x2912.png`
  (`2368x2912`, opaque RGB, SHA-256 `7f4b0b9b...5774fd`).
- Provenance: built-in imagegen edit, then exact-size Lanczos normalization; no
  CLI/API fallback.

## Verification

- Fresh review: **8 PASS / 0 FAIL / 0 DEFER**.
- Evidence: `design/review/overworld-art-blueprint/act-by-act/act1/review/act1-v4-routing-corrections-v3-owner-comparison.png` and sibling verification MD.
- Rejected V2: its forest block also erased Greenhollow-to-Millbrook.

## Owner risk and boundary

V3 is a near-global repaint: about 9.8% darker and 35% lower in edge variation,
so it reads softer than crisp V4. Owner must accept or reject this finish. This
is design-only; runtime, device, build, and release remain untouched.

## Resume here

Owner reviews V3 and its comparison. If accepted, lock it before a fresh runtime
task. If rejected for softness/darkness, localize the edits onto crisp V4.

## Kickoff prompt

Read repo `AGENTS.md`, workflow, art direction, this handoff, the locked
reference, V3, and its verification only. Do not use V2 or rejected procedural
reconstructions. Proceed to runtime work only after explicit owner sign-off.
