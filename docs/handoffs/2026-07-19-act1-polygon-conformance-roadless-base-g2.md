---
date: 2026-07-19
status: ready
scope: design-only-roadless-base-g2
---

# Act 1 polygon-conformance G2 — roadless base

## Immutable authority

- Polygon: `design/review/overworld-art-blueprint/act-by-act/act1/runtime-v2/polygon-first-authority-r25b/polygon-authority.json`
- Mask: sibling `review/polygon-mask.png`
- Exact size: `2368x2912`; actor radius `4`; substep `2`.
- Port terminals remain disconnected at west `(1840,1665)`, north `(1835,1635)`, southeast `(2114,1840)`.
- Sunken throat remains straight 11-wide `(411,2548) -> (370,2495)`.

## Locked style

> Dark, dense, realistic old-growth JRPG environment art viewed from a 3/4 top-down perspective: richly layered evergreen foliage, weathered stone and timber, moss, roots, leaf litter, natural terrain transitions, deep forest shadows, crisp faux-pixel material detail, controlled highlights from a single upper-left light source, and strong route and character readability. Avoid flat tiled repetition, bright toy-like terrain, empty lawns, rigid building grids, and generic rectangular rooms.

Anchors:

- `design/art-refs/terrain-f-natural-trail-comparison-locked.png` — style only, right panel.
- G1 `candidate-art.png` — strongest full-island style/layout source, never topology authority.
- R25 `source-reference.png` — fixed landmark/coast identity reference.

## G1 result

Five full-map edit calls stopped at retry boundary. All failed literal topology: connected Port, generalized hubs/corridors, approximate Sunken. G1 remains NO-GO and must not be promoted.

## Exact next batch

Generate one **roadless base**: preserve island/coast/water/mountain and isolated recognizable landmarks, but remove every road, trail, clearing connection, bridge approach, and town-through path. Fill removed routes with continuous biome-correct forest, cliff, snow-rock, or coast. No polygon rendering yet. This simpler base will receive exact polygon-clipped trail/clearing art through a deterministic compositor.

Output only to `runtime-v2/polygon-conformance-roadless-base-g2/`. No runtime, accepted-art, manifest, public/dist, collision, route, save, build, branch, commit, push, or deploy changes.
