---
date: 2026-07-16
type: handoff
project: edu-rpg
milestone: act1-912-hero-g3-traversal
status: active
supersedes: docs/handoffs/2026-07-16-act1-port-pixel-source-owner-review.md
relay_chain_id: edu-rpg-act1-overhaul
relay_sequence: "03"
relay_status: delegated
relay_predecessor_thread_id: 019f6833-3207-7e00-9320-83a22af03839
relay_successor_thread_id: 019f6891-9ce7-7e50-8a06-6ccf2154c7ba
subagents_drained: true
background_sessions_drained: true
---

# 912 + heroine G3 locked; full traversal next

## Outcome

Owner locked 912 (`1.78125` source/world), camera 208, and manifest r4.
Integrated G3: native 64px/drawn 36 world px; eight authored directions;
`0-A-0-B`/95ms; ponytail/no helmet, cape, sword, shield; restrained 5px shield
crystal and 3px armor facet.

## Verification

PASS: deterministic 912; exact 30 chunks; G3 24-cell alpha/baseline/silhouette/
gait; JS/Python/JSON; Port sliding/clamp/no tunneling. Exact 852x1846 motion:
G3, Reef, 76 commits, peak 6 chunks, base/detail eviction, 25 contacts, zero
misses/errors and correct boot cover.

Evidence: `runtime-v2/hero-g3/evidence/`.

## Locked decisions / gap

912/G3 are final. Collision is geometry, never pixels. Only Port-to-Reef has a
corridor; six routes lack traversal proof. Motion shows down/down-left; all
eight rows pass mechanically but lack rendered proof.

## Agent drain ledger

Workers completed; server/capture/ffmpeg exited; port 4174 closed; no live work.

## Resume / kickoff

`[relay:edu-rpg-act1-overhaul:03]` — **Act 1 Relay 03 — Full-World Natural Traversal**.
Dirty tree only. Read AGENTS, this handoff, relay/art/feel/runtime contracts.
Author geometry-owned corridors/blockers for six remaining Act 1 overworld
routes; preserve topology/landmarks/912/G3/HUD/camera/speed/streamer; capture
all-eight-direction and traversal/collision motion. No pixel
collision, legacy rebuild, Vite, commit/release, dungeons, or Crystal Cave.
Use failable geometry/seam/streamer/boot tests, fresh review, and
$relay-fresh-sessions at the next verified boundary.
