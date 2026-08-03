---
date: 2026-07-20
type: handoff
project: edu-rpg-map-engine-semantic-data
milestone: act1-checkpoint3-artwork-r3-topology-control
status: active
supersedes: docs/handoffs/2026-07-20-act1-checkpoint3-artwork-r2.md
---

# Handoff: Act 1 checkpoint 3 artwork R3

## Outcome

Create a topology-controlled clean artwork pair at `2368 x 2912`. R2 achieved
the desired natural old-growth/mountain art but failed exact placement. Do not
use R1 or R2 generated images as visual inputs.

## Locked authorities

- Frame SHA `102e11d5d822985e3310487b46d5091224877416951df3314a65a932b48d72bf`
- Polygon SHA `99af0c8d632a067132ba304104067d324f7f9a32c9fd45e7f90c11eb27e32940`
- Authority SHA `0f39f78ac4c7a2160e8154f0c0c4da1dc692787d1065ac79bab3b5a18f47f91d`
- Terrain-F style anchor SHA `40a5811c4494985437019eb09b6d4c2b7fdc99b1993089ec0eceedfd76671549`
- Natural-trail anchor SHA `cb727d65237b379fd47a8692a7d65a7f3cf38237283e7de25ba874087f2c6cab`

## Method lock

Before generation, deterministically create one high-contrast topology control
plate from the raw frame mask, polygon, route controls, clearing centers, and
Crystal blocker. It must show exact walkable ground, eight distinct landmark
silhouettes at their locked centers, sea, dense-forest blocker zones, and a
continuous east mountain zone while leaving every route open. Use that plate
as the edit target/spatial authority; use only the two approved style anchors
for appearance. Embed the canonical environment STYLE BLOCK verbatim.

## Acceptance

- Every approved polygon pixel reads as plausible walkable ground; every edge
  is concealed by dense forest, cliffs, boulders, water, or east mountains.
- Continuous substantial eastern mountain range with open Darkfang/Crystal pass.
- Only eight required landmarks, centered and naturally embedded with visible
  entrances; no incidental structures.
- Natural varied trails/clearings, no filled-mask silhouette, halo, collage,
  circular washes, or blocker crossing.
- Principal outputs: `artwork-only.png` and exact `artwork-with-polygon.png`.

## Scope

Write only `.../act1-clean-polygon-first-r27/checkpoint-3-artwork-r3/`.
Checkpoint 1/2 and R1/R2 are read-only. Maximum three generation calls. No
runtime, collision, route, save, build, promotion, commit, push, or deployment.

## Resume here

Read project/image workflow, art direction, movement contract, and this
handoff. Inspect the control plate before generation. Reject any source whose
entrances or corridors miss the control. Verify native full map and eight
landmark crops, then return for independent review.
