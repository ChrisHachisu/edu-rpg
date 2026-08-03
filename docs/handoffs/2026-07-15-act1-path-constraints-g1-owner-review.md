---
date: 2026-07-15
type: handoff
project: edu-rpg
milestone: act1-path-constraints-g1
status: owner-review
supersedes: docs/handoffs/2026-07-15-act1-heroine-g1-owner-review.md
---

# Act 1 path-constraint G1 owner review

## Outcome

Locked the owner-approved heroine identity and `36`-world-pixel scale, then
replaced tile-center walking in the standalone high-fidelity runtime with free
multidirectional movement inside an authored art-space path corridor. The
heroine slides along trail edges instead of entering forest, water, or
structures.

## Verification

- Path-corridor unit/integration test: PASS.
- Exact locked-world chunk reconstruction and manifest test: PASS.
- Four-direction heroine asset test: PASS.
- Corrected forward/reverse runtime simulation: maximum semantic center `76`,
  152 commits, two endpoint visits, zero edge contacts.
- Sustained 120-frame off-path push: 105 blocked contacts, zero commits,
  semantic center remains `0`, and the heroine remains inside the corridor.
- Rendered browser traversal and edge-debug captures: no warnings/errors.
- Independent review: PASS after correcting an initial semantic-to-art spacing
  error; no remaining correctness findings.

## Current state

- Shared collision/projection code: `runtime-v2/path-corridor.js`.
- Authored corridor data: `runtime-v2/manifest.json`, generated from
  `scripts/build_act1_hifi_chunks.py`.
- Playable review page: `runtime-v2/index.html`.
- Proof ledger: `runtime-v2/path-g1/PATH-G1-VERIFICATION.md`.
- Motion and debug evidence: `runtime-v2/path-g1/evidence/`.

## Locked decisions

- Painted art-space corridors own continuous movement and collision.
- Semantic route cells own commits, progression, encounters, saves, and
  transitions; runtime movement projects onto them without render snapping.
- Collision is authored geometry, never sampled from painting pixels.
- The heroine uses normalized multidirectional movement and four separately
  authored facing rows.

## Remaining work

- Obtain owner feel approval for the G1 constrained traversal.
- Author art-space centerlines and widths for the remaining six Act 1 routes.
- Integrate the approved constraint module into the selective map-engine runtime
  and retained event/save adapters.
- Run canonical iPhone/HUD 60fps performance and all-eight-transition gates.

## Risks and blockers

Only Port Sapphire to Coastal Reef is path-constrained. The rest of Act 1 must
not be represented as complete until its route geometry is authored and
verified. The review video is 10fps evidence, not device-performance proof.

## Resume here

Review `path-constrained-port-to-reef.gif` and the two debug stills. If the feel
is approved, trace the remaining six routes against the exact locked V3 art and
add them to the manifest without changing semantic route order or thresholds.

## Kickoff prompt

Read repo `AGENTS.md`, `design/ART-DIRECTION.md`, `design/GAME-FEEL.md`,
`runtime-v2/ACT1-HIFI-RUNTIME-CONTRACT.md`, this handoff, and
`runtime-v2/path-g1/PATH-G1-VERIFICATION.md`. Preserve the dirty tree. Do not
build with Vite, commit, deploy, alter TestFlight, or modify Crystal Cave.
