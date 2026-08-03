---
date: 2026-07-16
type: handoff
project: edu-rpg
milestone: act1-port-hires-streaming-owner-review
status: active
supersedes: docs/handoffs/2026-07-16-act1-phone-g2-208-zoom-resolution-handoff.md
relay_chain_id: edu-rpg-act1-overhaul
relay_sequence: "01"
relay_status: delegated
relay_predecessor_thread_id: 019f63bf-a31e-7c71-aa43-6251222e8f8e
relay_successor_thread_id: 019f6833-3207-7e00-9320-83a22af03839
subagents_drained: true
background_sessions_drained: true
---

# Act 1 Port Sapphire 2x streaming prototype: owner review

## Outcome

The owner-locked 208-world-pixel camera now renders one genuinely higher-detail
Port Sapphire region and streams only the visible map neighborhood. The 512x512
world region at `(1856,1584)` uses a 1024x1024 master. Its 64px outer border is
pixel-exact to the locked deterministic 2x crop; generated imagery contributes
only aligned high-frequency surface detail. Camera, map geometry, heroine, HUD,
52-world-pixel speed, eight-direction rows, and authored collision are unchanged.

## Verification

- `python3 scripts/test_act1_hifi_chunks.py` — PASS: exact locked 2368x2912
  reconstruction, 30 base chunks, 2x Port region and hashes.
- `node scripts/test_act1_path_corridors.mjs` — PASS: widths, sliding collision,
  endpoint clamp, and semantic progress.
- `python3 scripts/test_act1_hifi_hero_g2.py` — PASS: 24 RGBA frames, all eight
  directions, cardinal rows exact.
- `node scripts/capture_act1_streamed_port.cjs` — PASS in 852x1846 at 208:
  14 startup images instead of 91; four initial chunks; six-chunk peak; two base
  evictions; one Port-detail eviction; zero visible asset/detail misses; all 76
  commits; 23 blocked Port-edge contacts; delayed-load boot cover visible then
  hidden only after readiness.
- Asset metrics: Laplacian RMS `2.429 -> 7.828` (+222.25%) and high-frequency
  edge fraction `0.1713 -> 0.3256` (+90.13%) versus naive Lanczos 2x; exact
  seam-border fraction 100%.
- Fresh read-only visual review — PASS for detail, locked geometry, framing,
  hero/HUD, motion seams/loading, and collision. Ready for owner taste review;
  not full Act 1 runtime acceptance.
- Code check — no issues found in the changed HTML/JS/Python/JSON files; syntax,
  JSON parse, and focused runtime checks pass.

Evidence:

- `design/review/overworld-art-blueprint/act-by-act/act1/runtime-v2/port-hires/port-sapphire-hires-2x-v1-comparison.png`
- `design/review/overworld-art-blueprint/act-by-act/act1/runtime-v2/streamed-port-g2/evidence/locked-vs-streamed-hires-208.jpg`
- `design/review/overworld-art-blueprint/act-by-act/act1/runtime-v2/streamed-port-g2/evidence/streamed-port-to-reef.mp4`
- `design/review/overworld-art-blueprint/act-by-act/act1/runtime-v2/streamed-port-g2/evidence/streamed-motion-contact-sheet.jpg`
- `design/review/overworld-art-blueprint/act-by-act/act1/runtime-v2/streamed-port-g2/evidence/streamed-port-telemetry.json`

## Current state

- Worktree: `/Users/christopherhachisu/Documents/claudecode/edu-rpg-map-engine-semantic-data`
- Branch remains dirty and uncommitted: `codex/map-engine-semantic-data`.
- Runtime: `design/review/overworld-art-blueprint/act-by-act/act1/runtime-v2/index.html`.
- Stream policy: 128-world-pixel preload margin, maximum six loaded base chunks,
  one optional detail region, LRU base eviction, and off-window detail eviction.
- No Vite, legacy rebuild, commit, deployment, TestFlight/App Store change, or
  Crystal Cave modification occurred.

## Locked decisions

- Camera width remains exactly 208 world pixels; heroine height remains 36 world
  pixels; HUD remains screen-space and device-crisp.
- Port bridge/harbor/road geometry, route topology, speed, eight-direction
  facing, and authored corridor collision remain locked.
- Collision never samples painted pixels.
- This is a Port local-region prototype only. Do not claim full Act 1 detail or
  full-route playability.

## Remaining work

Owner verdict: **reject the current detail-overlay approach**. The world remains
fuzzy because the locked source painting itself lacks a crisp pixel lattice;
high-pass detail cannot repair that source-resolution mismatch. The next slice
must re-author one genuinely high-resolution Port source and deterministically
pixelate it to the heroine's effective density before runtime integration.

At 36 world pixels from a native 64px hero frame, the heroine carries
`64 / 36 = 1.777...` source pixels per world pixel. Relay 02 should measure and
render-compare nearby practical world grids (for example 896px and 912px across
the same 512-world-pixel Port region) instead of assuming that a nominal 2x
canvas or added edge detail matches the heroine. Dimensions alone are not proof;
compare internal edge/transition density and the visible screen-space lattice.

## Risks and blockers

- The owner rejected the current result as still fuzzy. Do not extend or tune
  the high-pass donor; replace the source-resolution strategy.
- The final MP4 excludes browser-navigation frames. Runtime startup itself is
  separately verified under a 500ms artificial asset delay with a painted boot
  cover rather than HUD over a blank world.
- Full Act 1 remains out of scope; only Port Sapphire to Coastal Reef has an
  authored collision corridor.

## Agent drain ledger

- `port_hires_asset` — completed. Owned `runtime-v2/port-hires/**`; final master,
  comparison, and metrics inspected. Remaining work: none. Risk: restrained
  detail requires owner taste review.
- `port_visual_review` — completed read-only review and startup follow-up; final
  verdict PASS. Files changed: none. Remaining work: none.
- Unfinished agent work: none.
- Background session `51097` (local static server on port 4174): stopped by
  interrupt with exit 0; `lsof` and process recheck found no listener. Capture/
  recorder sessions `1953`, `7517`, `39264`, and `95732` completed. Raw recorder
  duplicates were removed; final MP4 and evidence remain.
- Drain recheck: both child agents are completed, no child or grandchild is
  working/waiting/idle, and no owned server/compiler/recorder session remains.

## Resume here

Create one fresh Relay 02 task against this same dirty worktree. Its first gate
is a Port-only source-resolution/pixel-lattice comparison in the exact 208 phone
frame. Do not expand the world until the owner accepts one crisp candidate.

## Kickoff prompt

`[relay:edu-rpg-act1-overhaul:02]` Title the task
`Act 1 Relay 02 — Pixel-Matched World Source`. Work only in
`/Users/christopherhachisu/Documents/claudecode/edu-rpg-map-engine-semantic-data`.
Resume from this handoff; the owner rejected Relay 01 as fuzzy and directed a
genuinely higher-resolution world source followed by deterministic pixelation
that matches the heroine's pixel density. Read
`AGENTS.md`, `docs/AUTONOMOUS-SESSION-RELAY.md`, `design/ART-DIRECTION.md`,
`design/GAME-FEEL.md`, and `runtime-v2/ACT1-HIFI-RUNTIME-CONTRACT.md`. Preserve
camera width 208, all locked geometry, heroine/HUD, speed, eight-direction
facing, authored collision, and the working visible-region streamer. Do not
sharpen, high-pass, or naively upscale the locked raster and call it fixed.
Re-author one Port-only high-resolution source, then compare deterministic
pixel grids calibrated around the hero's `64/36` source-pixels-per-world-pixel
ratio; include internal edge/transition density and exact-phone rendered proof.
Stop at the first owner taste gate. Do not use Vite, rebuild legacy source,
commit, deploy, alter TestFlight, or modify Crystal Cave. Use
`$relay-fresh-sessions` at the next verified boundary.
