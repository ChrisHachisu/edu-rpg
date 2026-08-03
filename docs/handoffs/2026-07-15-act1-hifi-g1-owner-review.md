---
date: 2026-07-15
type: handoff
status: owner-approved-with-hero-scale-calibration
project: edu-rpg
milestone: act1-high-fidelity-g1
supersedes: docs/handoffs/2026-07-15-act1-world-map-v3-locked-runtime-complete.md
---

# Act 1 high-fidelity G1 owner review

## Outcome

Reopened the prior Act 1 implementation as a fidelity failure. The browser had
never switched to the selective map engine: it still used legacy
`WorldMapScene`, numeric tiles, and `dq-tiles.js`. The old completion handoff and
runtime proof are explicitly invalidated.

The owner attachment is pixel-identical to locked V3. A new standalone G1
motion endpoint now renders those exact pixels as bounded chunks, adds separate
water and foreground-occlusion layers, and drives the Port Sapphire-to-Coastal
Reef route with fractional movement and camera motion.

## Verification

- Exact `2368 x 2912` reconstruction: PASS across 30 bounded base chunks.
- Generated layer set: 90 assets (base, water, occlusion).
- Scripted semantic traversal: PASS, 76 center commits from `(130,290)` to
  `(140,350)`.
- Browser load: PASS with no console/page errors.
- Independent G1 review: PASS; no release-blocking G1 findings.
- Proof: `design/review/overworld-art-blueprint/act-by-act/act1/runtime-v2/G1-VERIFICATION.md`.

## Current state

- Owner approved the world rendering direction on 2026-07-15 and requested the
  production heroine next, with a smaller player/world-scale calibration.

- `runtime-v2/index.html` is a playable standalone motion mockup.
- `scripts/build_act1_hifi_chunks.py` deterministically generates the chunk and
  layer set from locked V3.
- `scripts/test_act1_hifi_chunks.py` enforces exact visual closure.
- The prior legacy overlay files remain present only as the existing topology
  diagnostic/rollback path. They are not accepted visual evidence.
- No public/dist runtime integration, bundle change, commit, push, build,
  deployment, TestFlight change, or Crystal Cave generation occurred.

## Locked decisions

- Locked V3 is the actual runtime visual target, not inspiration.
- Semantic data owns collision/progression only; art-space owns visible
  geography and routes.
- The renderer uses bounded chunks and layers, not one scrolling bitmap and not
  legacy procedural tiles.
- Static screenshots cannot approve motion; the MP4/GIF is the G1 evidence.

## Remaining work

After owner approval, build the browser selective runtime and retained-system
adapter, extend art-space mapping to all eight landmarks/seven routes, replace
the proxy with the production 64 px hero family, add independent minimap and
transition/save/encounter behavior, then run complete Act 1 and canonical-device
performance/fidelity gates.

## Risks and blockers

- Owner approval of G1 motion/rendering direction is required by the
  `game-design` gate before runtime implementation.
- Full-Act-1 cutover must resolve whole-overworld versus coordinate-aware
  routing; `mapId` remains `overworld` outside this slice.

## Resume here

Review `g1-port-to-reef.mp4` or the compact GIF and the three captures in
`runtime-v2/`. If approved, lock G1 in the motion ledger and begin a real
selective browser scene/runtime. Do not return to `dq-tiles.js` for Act 1 visual
production and do not call the standalone mockup shipped runtime.

## Kickoff prompt

Read repo `AGENTS.md`, `docs/AGENT-WORKFLOW.md`,
`runtime-v2/ACT1-HIFI-RUNTIME-CONTRACT.md`, this handoff, and
`runtime-v2/G1-VERIFICATION.md`. Owner approval of the G1 motion endpoint is the
only missing decision. After approval, implement the selective browser runtime
around the existing semantic/movement/camera/retained-adapter contracts. Preserve
the dirty tree and 4.99 MB bundle. Do not Vite/build, commit, push, deploy, or
modify Crystal Cave.
