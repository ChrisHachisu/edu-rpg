---
date: 2026-07-15
type: handoff
status: active-next-session
project: edu-rpg
milestone: act1-v4-fidelity-reset
---

# Act 1 V4 fidelity reset

## Locked target

The actual game must visually match:
`design/review/overworld-art-blueprint/act-by-act/act1/generated/act1-artistic-plate-v4.png`

Anchor `1130x1392`; next review target `2368x2912`. V4 is authority, not
inspiration.

**Immutable style:** dark old-growth JRPG; 3/4 top-down; painterly terrain;
organic coast/curved trails; embedded landmarks; upper-left light; snowy
Crystal mountain. No flat cells, rigid roads, portals, labels, or UI.

## Reject / retain

Reject `design/review/overworld-art-blueprint/act-by-act/act1/reconstruction/*.png`,
`scripts/render_act1_reconstruction_review.mjs`, and the superseded approval.
They made the old coastline/straight roads visual authority and mistook
semantic correctness for fidelity.

Retain only the invisible substrate in `src/map-engine/act1Overworld.ts` and
tests: eight transitions, seven-edge graph, Port-rooted Reef, natural walkable
thresholds, Crystal gate, and no bypass. It must not dictate visible silhouette,
roads, cells, or landmark art.

## Next task

Read repo `AGENTS.md`, `docs/AGENT-WORKFLOW.md`, `design/ART-DIRECTION.md`, this
handoff, and V4 only. Use `edu-rpg`, `game-design`, `imagegen`,
`orchestrator-pattern`, and `coding-skill` as applicable.

Create a faithful exact-scale V4-derived visual with minimal graph fixes; owner
locks it before runtime work. Final PASS requires a running-game capture versus
V4 and fresh fidelity review. Topology tests alone cannot pass.

Preserve the dirty tree and 4.99 MB runtime. Never Vite/build/dev, change a
dungeon or Crystal Cave, commit, push, deploy, or publish without authority.

## Kickoff

Resume from this handoff. Treat V4 as the locked actual-game
target, reject the procedural visuals, retain only semantic substrate, and work
autonomously to the fidelity-first owner checkpoint. Ask no routine questions;
accept nothing that cannot be directly compared with V4.
