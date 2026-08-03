---
date: 2026-07-16
type: handoff
project: edu-rpg
milestone: act1-port-pixel-source-owner-review
status: active
supersedes: docs/handoffs/2026-07-16-act1-port-hires-streaming-owner-review.md
relay_chain_id: edu-rpg-act1-overhaul
relay_sequence: "02"
relay_status: owner-review
relay_predecessor_thread_id: 019f6803-5620-7ca0-a0a4-8845c1dec1d0
relay_successor_thread_id:
subagents_drained: true
background_sessions_drained: true
---

# Port pixel source: owner review

## Outcome

New `1254²` master; deterministic 896/912. Runtime uses 912
(`1.78125` source/world; `0.195%` from hero `64/36`), matching effects, and a
24-world feather. Geometry/landmarks, hero/HUD, camera 208, speed 52, eight
facings, collision, and streamer budgets are unchanged.

## Verification

PASS: hashes/alpha seam, exact 30-chunk reconstruction, path/collision,
eight-direction hero, static checks. `852x1846`: strong transitions `0.0143`
control vs `0.2022` 912; hero/912 clusters `2.304/2.300px`. Motion 14.68s: 76
commits, 22 contacts, six-chunk peak, eviction, zero misses, boot correct. Fresh
read-only verdict PASS.

Evidence: `runtime-v2/port-pixel-source/` phone comparison, MP4, metrics, provenance.

## State / locks

Dirty uncommitted branch; manifest r3 uses 912. Port-only; no build/commit/release/
Crystal Cave. No sharpening, high-pass, pixel collision, or naive upscale.

## Remaining work / risks

Owner chooses 912, near-identical 896, or rejection. Risks: busier than hero;
smooth but visible fade to unchanged fuzzy world. No Relay 03 before approval.

## Agent drain ledger

Agents completed; reviewer PASS/read-only. No live children. Server
exited; port 4174 closed; captures completed.

## Resume here / kickoff prompt

Show phone comparison/MP4. After approval create `[relay:edu-rpg-act1-overhaul:03]`
/ `Act 1 Relay 03 — <approved slice>` in this worktree. Read this handoff,
`AGENTS.md`, relay/art/feel/runtime contracts; preserve all locks and no-build/
release boundaries. Use `$relay-fresh-sessions` at the next verified boundary.
