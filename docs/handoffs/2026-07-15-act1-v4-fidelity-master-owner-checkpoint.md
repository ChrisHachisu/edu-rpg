---
date: 2026-07-15
type: handoff
status: owner-lock-pending
project: edu-rpg
milestone: act1-v4-fidelity-master
supersedes: docs/handoffs/2026-07-15-act1-v4-fidelity-reset.md
---

# Act 1 V4 fidelity-master owner checkpoint

## Outcome

Created the exact-size V4 master without repaint or visible graph changes. V4
already expresses eight embedded landmarks and the seven-edge semantic graph;
coordinates, thresholds, flags, and no-bypass logic remain invisible.

## Locked source and candidate

- Authority: `design/review/overworld-art-blueprint/act-by-act/act1/generated/act1-artistic-plate-v4.png` (`1130x1392`, `6f266436...c3c114`).
- Candidate: `design/review/overworld-art-blueprint/act-by-act/act1/generated/act1-v4-fidelity-master-2368x2912.png` (`2368x2912`, RGB, `70c3e29a...3dccc`).
- Style: dark old-growth 3/4 JRPG; painterly materials; organic coast/trails;
  embedded landmarks; upper-left light; snowy Crystal.

## Verification

- Fresh art review: **6 PASS / 0 FAIL / 1 DEFERRED**.
- Evidence: `design/review/overworld-art-blueprint/act-by-act/act1/review/act1-v4-fidelity-master-owner-comparison.png` and its sibling verification MD.
- Semantic test: `bun src/map-engine/act1Overworld.test.ts` PASS (8 landmarks,
  7 edges, Port-rooted Reef, one Crystal gate/no bypass).

## Boundary

Not runtime-integrated; running-game/device fidelity is DEFERRED until owner
lock. The 4.99 MB runtime, dungeons, Crystal Cave, Git, and release state were
untouched. Reject procedural visuals, a ninth Darkfang marker, straight roads,
V4 silhouette changes, and Vite/build/dev.

## Resume here

Owner locks or rejects the comparison. If locked, start a fresh task for
atlas/chunk translation, real-game capture beside V4, and fresh review.

## Kickoff prompt

Read repo `AGENTS.md`, workflow, art direction, this handoff, V4, candidate, and
verification only. Ignore rejected reconstruction visuals. After explicit owner
lock, integrate additively and prove the running game against V4 on device.
