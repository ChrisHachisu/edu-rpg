---
date: 2026-07-15
type: handoff
status: owner-review
project: edu-rpg
milestone: act1-exact-scale-semantic-material-reconstruction
branch: codex/map-engine-semantic-data
supersedes: docs/handoffs/2026-07-15-act1-v4-feedback-owner-checkpoint.md
owner-checkpoint: approve-act1-blueprint-before-runtime-wiring
---

# Act 1 exact-scale reconstruction owner checkpoint

## Outcome

Act 1 has been reconstructed as a deterministic semantic and renderer-material
blueprint on the exact shipped `320 x 400` global coordinate system. The clean
review crop is exactly `2368 x 2912`, or `148 x 182` source cells at 16 review
pixels per cell.

The reconstruction preserves the exact Act 1 source water footprint, lake,
coast, eight landmark coordinates, retained transition payloads, and required
seven-edge graph. V4's approved direction controls the larger open plains,
old-growth massing, compact landmark scale, material contrast, and Crystal
geology.

This checkpoint does not wire the new map into the preserved runtime, change
any dungeon, begin Act 2, build, deploy, commit, or push.

## Owner review images

- Clean terrain/material blueprint:
  `design/review/overworld-art-blueprint/act-by-act/act1/reconstruction/act1-reconstruction-exact-scale.png`
- Exact graph, thresholds, approaches, and Crystal gate:
  `design/review/overworld-art-blueprint/act-by-act/act1/reconstruction/act1-reconstruction-semantic-overlay.png`
- Exact 16-pixel and 21.33-pixel player footprint envelope:
  `design/review/overworld-art-blueprint/act-by-act/act1/reconstruction/act1-reconstruction-player-scale-overlay.png`
- Mechanical record:
  `design/review/overworld-art-blueprint/act-by-act/act1/reconstruction/act1-reconstruction-metrics.json`

## Natural landmark entries

No Act 1 landmark uses a generic portal or freestanding transition-special
asset. Each exact walkable threshold is part of a compact environment assembly:

- Greenhollow: old-growth village lanes;
- Millbrook: lakeside mill settlement;
- Port Sapphire: harbor street and forecourt;
- Sunken Cellar: ruined coastal cellar descent;
- Whispering Woods Cave: root-wrapped forest mouth;
- Coastal Reef: tidal shelf and reef descent;
- Darkfang (`mistyGrotto`): misty forest-cliff grotto;
- Crystal Cave: crystal-bearing mountain mouth.

All eight stored transition payloads and threshold event lookups are tested.

## Mechanical result

| Gate | Result |
|---|---:|
| Source land cells | `15,008` |
| Source water cells | `11,928` |
| Water-footprint mismatches | `0` |
| Meadow/exploration ground | `4,803` / `32.0029%` |
| Trail and settlement apron | `1,201` / `8.0024%` |
| Blocked forest | `7,053` / `46.9949%` |
| Blocked mountain/coastal rock | `1,951` / `12.9997%` |
| Landmarks | `8` exact thresholds and approaches |
| Route records | `7` exact approved edges |
| Transition specials | `0` |
| Walkable components with Crystal open | `1` |
| Closed Crystal bypass | none; only the approach and threshold are isolated |

The seven edges are Greenhollow-Sunken, Greenhollow-Whispering,
Greenhollow-Millbrook, Millbrook-Port, Port-Reef, Port-Darkfang, and
Port-Crystal. Port-Reef begins at the Port approach. The forbidden
Whispering-Darkfang and Darkfang-Crystal links do not exist. Every material
trail cell belongs to the connected approved route surface.

## Verification

- `pnpm run test:map-engine`: PASS, including the production-scale Act 1 test,
  exact runtime snapshot regeneration, natural-threshold validation, retained
  transition events, Crystal semantic/physical gating, shipped DQ replay, and
  multi-seed connectivity checks.
- `pnpm run verify:runtime`: PASS.
- Preserved bundle: unchanged at `4,987,581` bytes.
- Monster PNGs: unchanged at `75`.
- Exact review dimensions: PASS for all three `2368 x 2912` PNGs.
- Two-run render determinism: PASS, byte-identical.
- Independent semantic review: PASS after repairing isolated meadow cells and
  optimizing the connected-surface frontier.
- Independent visual review: PASS after separating the crowded Port/Crystal
  evidence labels.
- `git diff --check`: PASS.

Final review SHA-256:

- clean: `332b1d895eaec014cd7e08823e5b6feea35b21622c37458b53a67163fa59b88d`;
- semantic overlay: `f351453d92f6d8ef1659018fd47929453d3ebd815482a1486fc8b6b237d834c2`;
- player overlay: `d0d7b73407077d9e024ef4aad8f881bf310255ddcd61b376b6eaa541c067ab43`.

## Files added or integrated in this stage

- `scripts/extract_act1_runtime_snapshot.mjs`
- `scripts/render_act1_reconstruction_review.mjs`
- `src/map-engine/generated/act1RuntimeSnapshot.ts`
- `src/map-engine/act1Overworld.ts`
- `src/map-engine/act1Overworld.test.ts`
- `src/map-engine/act1LandmarkRenderRecipes.ts`
- natural-threshold validation and corrected starter-fixture topology in the
  existing semantic-map files;
- the deterministic reconstruction review package named above;
- the Act 1 reconstruction contract and map-engine design update.

## Owner decision

Recommended answer: **approve** this exact-scale semantic/material blueprint as
the construction authority for the Act 1 runtime implementation. The current
evidence is deliberately a deterministic faux-pixel material blueprint, not the
final production tileset artwork; runtime implementation still needs atlas,
chunk-renderer, camera, minimap, save, and device-performance gates.

Approve or revise the Act 1 reconstruction before runtime wiring and before
starting Act 2.

## Self-contained resume prompt

Resume in
`/Users/christopherhachisu/Documents/claudecode/edu-rpg-map-engine-semantic-data`
from this checkpoint. Read the repository AGENTS/workflow files, the exact Act 1
reconstruction contract, the reconstruction README/metrics, and the production
builder/tests. Preserve the dirty worktree and opaque runtime. If the owner
approves, plan the narrow Act 1 runtime integration boundary: deterministic
terrain/landmark atlas recipes, chunk renderer, camera/minimap, transition
adapter, save validation, rollback, simulator proof, and performance checks.
Do not begin Act 2, change any dungeon or Crystal Cave, rebuild Vite, edit the
opaque bundle directly, commit, push, deploy, or publish without new authority.
