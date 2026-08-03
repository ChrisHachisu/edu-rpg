---
date: 2026-07-15
type: handoff
project: edu-rpg
milestone: act1-heroine-g1
status: owner-approved-path-constraints-next
supersedes: docs/handoffs/2026-07-15-act1-hifi-g1-owner-review.md
---

# Act 1 heroine G1 owner review

## Outcome

Generated and integrated one production-direction heroine family for the locked
Act 1 world: female, uncovered face, brown ponytail, silver/gold armor, cobalt
cape, sword, and shield. The sheet contains down/left/right/up rows with idle
and two opposing contact poses. Profiles are separately authored, not mirrored.

## Verification

- `python3 scripts/test_act1_hifi_hero.py`: PASS, 12 padded RGBA frames,
  baseline `y=58`, no alpha `1..8` chroma residue.
- `python3 scripts/test_act1_hifi_chunks.py`: PASS, exact locked-world closure.
- Browser: ready, four-direction demo rendered, no warnings/errors.
- Independent review: design PASS, sheet PASS after edge cleanup, runtime-motion
  G1 PASS, desktop scale PASS.

## Current state

- Runtime sheet: `runtime-v2/hero-g1/hero-act1-female-walk-4x3-64-v3.png`.
- Native frames: `64 x 64`; current display: `36` world pixels.
- Motion: `0 -> A -> 0 -> B`, about `95 ms` per pose.
- `runtime-v2/?heroDemo=1` runs the bounded four-direction proof.
- GIF/MP4 and actual-scale still live under `hero-g1/evidence/`.

## Locked decisions

World G1 direction is owner-approved. Hero scale is deliberately smaller than
the proxy. On 2026-07-15 the owner approved the heroine identity and the
`36`-world-pixel display scale. Generated PNG characters remain allowed under
`ART-DIRECTION.md`.

## Risks and blockers

The 10 fps evidence capture is not a 60 fps device-performance gate. The
standalone motion runtime is not yet the shipped-game integration.

## Resume here

The heroine ledger row is locked. Continue with art-space path constraints,
then selective-runtime integration and canonical device/HUD performance
capture. Do not return to legacy `dq-tiles.js` rendering.

## Kickoff prompt

Read repo `AGENTS.md`, `design/ART-DIRECTION.md`, `design/GAME-FEEL.md`, this
handoff, and `hero-g1/HERO-G1-VERIFICATION.md`. Preserve the dirty tree. Do not
build, commit, deploy, change TestFlight, or modify Crystal Cave.
