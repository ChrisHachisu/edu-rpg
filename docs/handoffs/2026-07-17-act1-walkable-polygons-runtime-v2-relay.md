---
date: 2026-07-17
type: handoff
project: edu-rpg
milestone: act1-walkable-polygons-runtime-v2
status: owner-rejected
supersedes: docs/handoffs/2026-07-16-act1-off-route-residual-912-owner-review.md
relay_chain_id: edu-rpg-act1-overhaul
relay_sequence: "09"
relay_status: owner-rejected-after-completion
relay_predecessor_thread_id: 019f6ac2-59ab-7fe1-9397-3011e84d4ae6
relay_successor_thread_id: 019f6bf6-bfa4-7af0-80bc-3e3c64995982
subagents_drained: true
background_sessions_drained: true
---

# Act 1 art-aligned walkable polygons are verified in runtime-v2

## Owner rejection received after verification

The owner rejected the route-first overlay on 2026-07-17. The mechanical
results below remain reproducible, but they do not establish correct visual
boundaries. This handoff is retained as failure evidence only. Do not refine
the existing polygons region by region; replace them from a route-hidden,
full-map visual ground mask.

## Outcome

The owner locked connected, Diablo/Hades-like overworld movement: broad painted
ground is freely walkable, narrow passages remain art-aligned, and painted roads
own route semantics without acting as movement rails. The isolated Act 1
`runtime-v2` now implements that decision.

Physical collision uses the union of 19 manually traced native-world polygons,
minus global structure/water obstacles and the dynamic Crystal seal. The actor
uses a 4-world-pixel foot disk, at most 2-world-pixel collision substeps, and
arbitrary-edge sliding. Continuous analog input, speed 52, camera width 208,
cardinal G3, and the 125 ms `0-A-0-B` walk cycle remain locked.

Seven painted-ground waypoint chains now own dynamic route selection, streaming
affinity, semantic progression, and save-cell commits. The legacy blue
centerlines own neither physical collision nor semantic projection. Ambiguous
shared trunk travel retains the inbound route until the painted Darkfang/
Crystal fork is distinguishable.

This is intentionally an isolated `runtime-v2` implementation, not a cutover of
the preserved shipped `dist/` artifact. The incoming relay explicitly forbade a
legacy build or shipped-source rebuild. No later-act painting was fabricated;
the method is global, while polygon authoring remains gated on each act's final
locked painting.

## Canonical files

- `design/OVERWORLD-MOVEMENT-BOUNDARIES.md` — locked global movement method.
- `design/GAME-FEEL.md` — smooth overworld movement feel contract.
- `design/review/overworld-art-blueprint/act-by-act/act1/runtime-v2/ACT1-HIFI-RUNTIME-CONTRACT.md`
  — Act 1 runtime requirements.
- `design/review/overworld-art-blueprint/act-by-act/act1/runtime-v2/walkable-regions-v1.json`
  — 19 regions, obstacles, probes, painted routes, and bounded affinity.
- `design/review/overworld-art-blueprint/act-by-act/act1/runtime-v2/walkable-polygons.js`
  — validated polygon union, actor-disk clearance, substeps, and sliding.
- `design/review/overworld-art-blueprint/act-by-act/act1/runtime-v2/walkable-route-state.js`
  — painted-route projection, hysteresis, ambiguity handling, and reversible
  forced affinity.
- `design/review/overworld-art-blueprint/act-by-act/act1/runtime-v2/index.html`
  — integrated runtime-v2 movement, saves, streaming, telemetry, and boot gate.
- `design/review/overworld-art-blueprint/act-by-act/act1/runtime-v2/WALKABLE-REGIONS-V1-VERIFICATION.md`
  — complete acceptance record.

## Deterministic proof

PASS:

- manifest revision 8 SHA-256
  `2e79b6770154df26b6918b770e79159b8622809face7005a5f6f7a9544806a3d`;
- locked `2368 x 2912` world source SHA-256
  `7f4b0b9be8633a1a16946cf90b7794f306d7b268d4ecb54381998a1fc55774fd`;
- collision reference SHA-256
  `8cdc9b24a3418f4dcd9417df21987e5e84403bc08e965f1f905a70ea8a731b85`;
- collision inventory SHA-256
  `8912fdb222c1fe159ee3bf24df600a6b02abef5b9dc63029edf6d3af298ef685`;
- walkable mask SHA-256
  `83963fe16cc1dce1703e0a3982ed76c7df6137d1fc2fd68e9154ecd029145ecf`;
- review overlay SHA-256
  `02c600008d454be0c89b0237e44afc73ae3bef574fd5f50fab5be9218ecd62b0`;
- review inventory SHA-256
  `702936761b7f4ec57dc013971a86e3cc4ed9522c80aeafc7505206ccdd4555b0`.

The collision builder and overlay renderer reproduced identical bytes twice.
Every accepted Relay 01-08 art byte and the 17-region manifest remain unchanged.
No art was generated, sharpened, or upscaled.

## Geometry and runtime proof

PASS:

- 19 regions, 18 actor-diameter-safe joins, 90 walkable probes, 75 blocked
  probes, all seven painted routes, both bridges, Crystal closed/open behavior,
  arbitrary-edge sliding, normalized input, and 5,000 deterministic movement
  steps;
- exhaustive all-seven route sampling at <=2-world-pixel intervals;
- exact 30-chunk reconstruction, G1/G2 hero contracts, legacy corridor/blocker/
  seal regressions, runtime override identity, and full map-engine/save/replay/
  retained-gate suites;
- performance telemetry SHA-256
  `9d58941b1a85f39a03a22ea3ed7898ed9748a6bfd96ec82c6e346586a5b8255e`;
- video telemetry SHA-256
  `ad3374a7cfdf74ac5c43c6df3b13b6df0ecc68d8d8032573a49ab4275a32d217`;
- seven named `852 x 1846` WebM traversals, exact endpoints and final semantic
  cells, <=6 chunks, <=4 resident/required details, and zero chunk/detail misses;
- Greenhollow keyboard free roam and painted-route junction selection at
  11.8 ms first-input response;
- manual analog Port-to-Crystal travel retains inbound Millbrook, never selects
  Darkfang, changes once at the real fork, reaches 23/23, and responds in 13.7 ms;
- actual-runtime turnaround requires four details outbound, then releases the
  Crystal preload and returns to three details when reversing toward Millbrook;
- boot cover remains opaque until readiness; no unready flash.

Performance and video evidence use separate modes so encoder work is not
misreported as runtime work. The clean performance run had no scheduler samples
above 34 ms on any of the seven route traversals; isolated runtime work samples
remained within the explicit sparse-event allowance. There was no repeated or
sustained hitch.

Fresh read-only native-art review passed the final overlay. A separate final
code review passed the affinity latch/reversal logic, route selection, resident
ceilings, asset misses, reconstruction, and accepted-artifact identity with no
remaining actionable finding.

## Repository state and prohibitions

- Worktree remains deliberately dirty on `codex/map-engine-semantic-data` at
  inherited HEAD `c4f97d5e30762b8a16deff36602252759decce31`.
- Existing unrelated edits and accumulated relay artifacts were preserved.
- No Vite command, `npm run build`, `npx vite`, legacy source rebuild, commit,
  push, deploy, publish, release, TestFlight/App Store Connect mutation,
  branch/worktree creation, dungeon expansion, or retained-landmark edit
  occurred.

## Agent drain ledger

- `r10_geometry_census`: completed bounded geometry corrections; root inspected
  and verified the final JSON and regenerated canonical evidence.
- `r10_polygon_visual_review`: completed read-only native-art PASS on overlay
  SHA `02c600...62b0`, with all seven joins and retained structures verified.
- `r10_code_check`: completed a final read-only PASS after the reversible
  affinity fix; no actionable findings.
- Final collaboration state contains only completed children.

## Background session drain ledger

- Performance capture session `4824` completed with exit 0.
- Video capture session `33028` completed with exit 0.
- Static server session `34453` stopped with Ctrl-C and exit 0.
- Final process inspection found no capture browser, recorder, Playwright
  profile, or port-4179 static server process.

## Relay 10 bounded objective

Cut the verified Act 1 walkable-polygon and painted-route-state implementation
into the preserved playable artifact through the smallest additive override
that does not rebuild or shrink the shipped `dist/` game. Reuse the exact
verified JSON/modules and preserve every locked art byte and behavior. Verify
the live static artifact—not only runtime-v2—with all seven routes, free-roam,
semantic saves/reloads, blockers/seal, exact phone motion, resource/resident
telemetry, and rendered boundary review. Stop if the preserved artifact cannot
accept the cutover without a prohibited rebuild or a material product decision.

Do not author later-act polygons until each later act has its own final locked
painting. Do not generate art. Preserve every prohibition and runtime ceiling
listed above.
