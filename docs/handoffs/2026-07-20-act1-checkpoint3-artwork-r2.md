---
date: 2026-07-20
type: handoff
project: edu-rpg-map-engine-semantic-data
milestone: act1-checkpoint3-artwork-r2
status: active
supersedes: docs/handoffs/2026-07-19-act1-clean-polygon-checkpoint3-artwork.md
---

# Handoff: Act 1 checkpoint 3 artwork R2

## Outcome

Regenerate checkpoint 3 from a clean source. The first artwork batch is NO-GO
evidence and must not be used as a visual input. Return exactly two native
`2368 x 2912` images: artwork only, and identical artwork with the locked
polygon plus Crystal checkpoint overlaid.

## Locked inputs

- Frame `frame-clean.png` SHA `102e11d5d822985e3310487b46d5091224877416951df3314a65a932b48d72bf`
- Polygon `polygon-mask.png` SHA `99af0c8d632a067132ba304104067d324f7f9a32c9fd45e7f90c11eb27e32940`
- Authority SHA `0f39f78ac4c7a2160e8154f0c0c4da1dc692787d1065ac79bab3b5a18f47f91d`
- Style anchor `terrain-F-realistic-old-growth-mock.png` SHA `40a5811c4494985437019eb09b6d4c2b7fdc99b1993089ec0eceedfd76671549`
- Trail anchor `terrain-f-natural-trail-comparison-locked.png` SHA `cb727d65237b379fd47a8692a7d65a7f3cf38237283e7de25ba874087f2c6cab`

## Owner acceptance criteria

- Polygon remains exact, but its edges are visually concealed by clearly
  impassable dense forest, cliffs, boulders, water, or mountains.
- The map reads as one natural landscape, not a filled mask or pasted collage.
- Remove all incidental buildings/structures; include only the eight required
  town/dungeon landmarks.
- Add a continuous, substantial eastern mountain range integrated around the
  Darkfang/Crystal approach without blocking the approved route.
- Towns and dungeons must be naturally embedded, individually recognizable,
  appropriately scaled, and connected by visible entrances.
- Preserve Greenhollow northwest, Sunken spur, Millbrook-to-Whispering spur,
  Port/Coastal sea contact, Darkfang, and Crystal cave-entry checkpoint.

## Rejected failures

No uniform tan polygon fill, visible mask halo, pasted rectangular landmarks,
faint paths, circular forest washes, random ruins/buildings, missing east
mountains, or visually ambiguous blockers.

## Scope

Write only `.../act1-clean-polygon-first-r27/checkpoint-3-artwork-r2/`.
Checkpoint 1/2 and the rejected checkpoint-3 directory are read-only. No
runtime, collision, route, save, build, promotion, commit, push, or deployment.

## Resume here

Read parent/project instructions, image workflow, art direction, movement
contract, and this handoff. Inspect locked inputs at native scale. Use the
canonical environment STYLE BLOCK verbatim and only the two locked style
anchors plus frame/polygon authorities. Generate a clean coherent scene;
verify all five owner criteria and exact hashes/dimensions; stop for fresh
independent visual review.
