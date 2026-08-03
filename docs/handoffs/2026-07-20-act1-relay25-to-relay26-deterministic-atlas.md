---
date: 2026-07-20
type: handoff
project: edu-rpg-map-engine-semantic-data
milestone: act1-checkpoint3-deterministic-atlas-recovery
status: active
relay_chain_id: edu-rpg-act1-overhaul
relay_sequence: 25
relay_status: delegated
relay_predecessor_thread_id: 019f73a6-7621-7ca2-ae4d-03e80c5ad216
relay_successor_thread_id: 019f7cec-4971-7872-8847-729793b4fea5
subagents_drained: true
background_sessions_drained: true
---

# Relay 25 handoff: Act 1 checkpoint 3

## Outcome and overrun audit

Relay 25 must end here. It began as a route-hidden ground-mask review but
absorbed TestFlight/device feedback, a full map redesign, frame and polygon
checkpoints, R1-R4 image loops, and a new deterministic-atlas task class. The
required fresh-task boundaries at owner review, asset-family changes, and the
eight-call image limit were missed. Do not repeat this scope accumulation.

Checkpoint 1 frame and checkpoint 2 polygon are owner-approved. R4 fixed the
art direction but failed exact polygon conformance. R5 changes to deterministic
assembly and is incomplete/visually rejected.

## Current evidence

- Worktree: `/Users/christopherhachisu/Documents/claudecode/edu-rpg-map-engine-semantic-data`
- Branch/HEAD: `codex/map-engine-semantic-data` / `c4f97d5e30762b8a16deff36602252759decce31`
- R5 directory: `design/review/overworld-art-blueprint/act-by-act/act1/runtime-v2/act1-clean-polygon-first-r27/checkpoint-3-artwork-r5-atlas/`
- `build_artwork.py` SHA `8b80c2d4acb7d09937791603e7f766633df94c7d1f48f915bdf84eebf34032c2`; `py_compile` and `git diff --check` pass.
- Current artwork SHA `88e306cd318735588c340426320a62eb91965eca2acb82005399a0a7e3998096`; overlay SHA `fa1adb70454a97b179bd6b246300ecca065271264c41a52717afc48f0c16f23a`.
- Native inspection verdict: **FAIL**. Exact geometry is visible as a pasted green/brown ribbon; hard oval clearings and clipped cliff fragments remain inside apparent walkable ground.
- `OWNER-REVIEW.md` is stale and incorrectly says GO with older hashes. Regenerate it before any review.
- No runtime, build, promotion, commit, push, deploy, or release action is authorized.

## Agent drain ledger

- `act1_checkpoint3_r5_atlas`: completed; produced first compositor and an unverified correction.
- `act1_checkpoint3_r5_fresh_review`: interrupted; no accepted result.
- Recheck: no live child/grandchild agents. No owned servers, watchers, or shell sessions.

## Resume here

Single outcome: make one bounded deterministic compositor correction and obtain
a fresh independent native-scale verdict. If it still looks like a mask ribbon,
stop NO-GO at owner review; do not start another method or image loop.

## Kickoff prompt

`[relay:edu-rpg-act1-overhaul:26]` — **Edu-RPG Relay 26 — Act 1 Deterministic Artwork Recovery**

Work in the existing dirty checkout at the absolute path above. Read parent and
project `AGENTS.md`, `$edu-rpg`, `$coding-skill`, `$ponytail`, `$game-design`,
`$orchestrator-pattern`, `$relay-fresh-sessions`, `$session-relay`, this handoff,
`design/ART-DIRECTION.md`, and `design/OVERWORLD-MOVEMENT-BOUNDARIES.md` completely.
Verify handoff metadata, branch/HEAD/dirty state, locked frame/polygon hashes,
R5 hashes, and no inherited live agents before editing.

Make at most one bounded correction inside the R5 directory so exact polygon
ground reads as a natural coherent landscape, not a pasted ribbon; remove clipped
blockers from required ground; preserve the coastline, sea contacts, east mountain
range, eight landmarks, and exact entrances. Regenerate all R5 evidence and stale
docs, run two clean deterministic rebuilds, native/phone-scale inspection, and a
fresh read-only visual audit. Stop at owner review with artwork-only and overlay.
No geometry/runtime/collision/routes/saves/build/TestFlight/promotion/commit/push/
deploy, no image generation, and no new branch/worktree. If the one correction
fails, return NO-GO with the exact blocker. Use `$relay-fresh-sessions` at the next
verified boundary and create no duplicate relay task.
