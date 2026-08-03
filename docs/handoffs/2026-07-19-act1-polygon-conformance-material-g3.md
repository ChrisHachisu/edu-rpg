---
date: 2026-07-19
status: ready
scope: design-only-material-g3
---

# Act 1 polygon-conformance G3 — material only

## Immutable authority

- Exact polygon/mask: `runtime-v2/polygon-first-authority-r25b/`.
- Verified roadless base: `runtime-v2/polygon-conformance-roadless-base-g2/roadless-base.png`.
- Verified exact composite guide: `runtime-v2/polygon-conformance-composite-g2/candidate-art.png`.
- Native size `2368x2912`; Port terminals remain disconnected; Sunken remains straight 11-wide `(411,2548) -> (370,2495)`.

## Locked style

> Dark, dense, realistic old-growth JRPG environment art viewed from a 3/4 top-down perspective: richly layered evergreen foliage, weathered stone and timber, moss, roots, leaf litter, natural terrain transitions, deep forest shadows, crisp faux-pixel material detail, controlled highlights from a single upper-left light source, and strong route and character readability. Avoid flat tiled repetition, bright toy-like terrain, empty lawns, rigid building grids, and generic rectangular rooms.

Style anchor: `design/art-refs/terrain-f-natural-trail-comparison-locked.png`, right panel only.

## Prior result

G2 is mechanical PASS but visual NO-GO: exact mask, byte-identical exterior, Port/Sunken pass, yet procedural terrain reads as polygon ribbons and octagonal hubs.

## Exact next batch

Use G2 candidate as an edit guide and improve only surface material: natural packed earth, patchy grass, mossy shoulders, roots, stones, leaf litter, canopy overlap, and biome-specific bridge/mountain/coastal treatment. Then normalize the generated result and deterministically keep **only pixels inside the exact polygon mask**, compositing them over the verified roadless base. Generated changes outside the mask are discarded. Produce native owner-review art, overlay, Port/Sunken crops, provenance, and a visual verdict.

Output only to `runtime-v2/polygon-conformance-material-g3/`. No accepted-art/runtime/manifest/public/dist/collision/routes/saves/build/git/release changes.
