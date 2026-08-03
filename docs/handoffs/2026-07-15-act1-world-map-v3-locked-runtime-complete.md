---
date: 2026-07-15
type: handoff
status: invalidated-fidelity-failure
project: edu-rpg
milestone: act1-v3-locked-runtime
supersedes: docs/handoffs/2026-07-15-act1-routing-corrections-v3-owner-review.md
---

# Act 1 V3 locked runtime complete

> **Invalidated 2026-07-15:** this handoff incorrectly called a legacy
> `WorldMapScene`/`dq-tiles.js` repaint the completed redesign. It proved
> topology but did not render the locked V3 art or wire the selective movement,
> camera, chunk, and adapter modules into the browser. Continue from
> `design/review/overworld-art-blueprint/act-by-act/act1/runtime-v2/ACT1-HIFI-RUNTIME-CONTRACT.md`.

## Outcome

The owner-approved V3 design is now the locked Act 1 world-map contract and is
implemented as an additive overlay on the preserved shipped game.

The implemented map keeps all eight Act 1 landmarks and seven graph edges,
opens Port Sapphire's harbor to the sea beneath a layered road bridge, connects
that bridge to Coastal Reef, and closes Millbrook's unintended southern
shortcut with collision-solid old-growth forest. The legitimate
Greenhollow-to-Millbrook west-bridge route and Millbrook-to-Port Sapphire route
remain available. Crystal Cave's retained approach and Giant Toad progression
gate remain intact.

## Locked decisions

- Visual source of truth:
  `design/review/overworld-art-blueprint/act-by-act/act1/generated/act1-v4-routing-corrections-v3-2368x2912.png`
- Locked design SHA-256:
  `7f4b0b9be8633a1a16946cf90b7794f306d7b268d4ecb54381998a1fc55774fd`
- The owner explicitly accepted V3's softer, darker finish.
- Port Sapphire's sea channel, bridge, and Coastal Reef road are required.
- Millbrook's southeast Reef shortcut is forbidden and forest-blocked.
- Crystal Cave content generation is outside this slice; its retained gate is
  preserved.

## Current implementation

- Semantic source: `src/map-engine/act1Overworld.ts` (revision 5).
- Semantic contract tests: `src/map-engine/act1Overworld.test.ts`.
- Runtime compiler: `scripts/export_act1_runtime_override.mjs`.
- Runtime behavior tests: `scripts/test_act1_runtime_override.mjs`.
- Runtime twins: `public/act1-world-map.js` and
  `dist/act1-world-map.js`.
- Shipped integration twins: `public/dq-tiles.js` and `dist/dq-tiles.js`.
- Runtime overlay SHA-256:
  `7a1037634692a88c4b6cdf09642f25e4375098de452cb7b4a15808cd4c96fef7`.
- Runtime plate SHA-256:
  `c6554d2d75a94ee712594f4318d9d12af57fd4f56299c961a8d8438174042e6e`.

## Verification

All semantic, topology, progression, re-entry, old-save relocation, runtime
idempotence, replay, snapshot, protected-baseline, overlay-closure, syntax,
static-smoke, public/dist-twin, and whitespace checks pass.

A fresh independent read-only review also returned **PASS** with no
release-blocking issues.

The shipped bundle remains exactly `4,987,581` bytes with SHA-256
`a56026574b42168985b353e4cee824562716af83f92d03f408df04eac9127381`,
and all `75` monster PNGs remain present.

Full proof and live captures:
`design/review/overworld-art-blueprint/act-by-act/act1/runtime/act1-v3-runtime-verification.md`.

## Risks and boundaries

- The shipped renderer presents the bridge as a top-down layered crossing; no
  player-controlled boat system exists to animate a boat passing underneath.
- The worktree contained extensive pre-existing owner/session changes. Nothing
  was discarded, staged, committed, pushed, built, or deployed.
- A release remains a separate explicitly authorized task.

## Remaining work

No implementation work remains for this locked Act 1 map slice. The next task
may package and release it, or proceed to the next separately scoped world-map
slice.

## Resume here

Start with this handoff and the runtime verification record. Treat the V3 PNG
and hashes above as immutable unless the owner explicitly reopens the design.
Do not regenerate Crystal Cave or replace the preserved shipped bundle.

## Kickoff prompt

Read repo `AGENTS.md`, workflow, art direction, this handoff, and
`act1-v3-runtime-verification.md`. The Act 1 V3 design and semantic/runtime map
are locked and complete. Preserve the shipped bundle and additive overlay. Do
not commit, push, deploy, or alter Crystal Cave without explicit authorization.
