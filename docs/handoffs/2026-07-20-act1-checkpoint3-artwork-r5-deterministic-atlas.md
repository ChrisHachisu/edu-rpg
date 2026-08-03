---
date: 2026-07-20
type: handoff
project: edu-rpg-map-engine-semantic-data
milestone: act1-checkpoint3-artwork-r5-deterministic-atlas
status: active
supersedes: docs/handoffs/2026-07-20-act1-checkpoint3-artwork-r4-targeted-conformance.md
---

# Handoff: Act 1 checkpoint 3 artwork R5

## Outcome

Create a deterministic native `2368 x 2912` owner-review composition in which
the locked checkpoint-2 polygon directly controls walkable ground and blocker
placement. Use R4 only as the approved visual direction and texture/landmark
source. Do not make another whole-scene generative edit.

## Immutable inputs

- Frame `checkpoint-1-frame/frame-clean.png` SHA `102e11d5d822985e3310487b46d5091224877416951df3314a65a932b48d72bf`
- Polygon `checkpoint-2-polygon/polygon-mask.png` SHA `99af0c8d632a067132ba304104067d324f7f9a32c9fd45e7f90c11eb27e32940`
- Polygon authority SHA `0f39f78ac4c7a2160e8154f0c0c4da1dc692787d1065ac79bab3b5a18f47f91d`
- R4 visual source `checkpoint-3-artwork-r4/artwork-only.png` SHA `58b0ff36ccc0dffad789feafc8a0b80496c03e59609940c642fad462ed78303e`
- Environment anchors: Terrain F and the locked natural-trail comparison named in `design/ART-DIRECTION.md`.

## Method

Build a small code-owned terrain atlas or chunk compositor. Assemble irregular
packed-earth/low-ground walkable material across the complete polygon footprint;
place dense forest, rock, mountain, or water blocker language immediately outside
it; hide the exact mask silhouette with deterministic edge variation that never
places blockers inside the polygon. Preserve the current coastline and continuous
east mountain range. Compose only the eight required landmarks, with entrances
and approaches centered on the checkpoint-2 authority. Buildings may occupy only
explicit future static-obstacle holes and must not block required ground.

## Deliverables and acceptance

Write only `.../act1-clean-polygon-first-r27/checkpoint-3-artwork-r5-atlas/`:
`artwork-only.png`, `artwork-with-polygon.png`, native inspection crops,
`build_artwork.py`, `artwork-authority.json`, and `OWNER-REVIEW.md`.

Two clean rebuilds must be byte-identical. Exact overlay must show genuine open
ground over every polygon pixel and unmistakable barrier terrain along every
blocked edge. All seven routes, eight landmark approaches, two sea contacts,
the eastern mountain pass, and the Crystal checkpoint must read naturally.

No image generation, geometry edits, checkpoint 1/2/R4 edits, runtime, collision,
routes, saves, promotion, build, commit, push, deploy, or TestFlight action.
