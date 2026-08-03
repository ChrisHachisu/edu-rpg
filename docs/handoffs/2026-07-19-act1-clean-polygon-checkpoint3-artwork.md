---
date: 2026-07-19
type: handoff
project: edu-rpg-map-engine-semantic-data
milestone: act1-clean-polygon-checkpoint3-artwork
status: active
supersedes: docs/handoffs/2026-07-19-act1-full-map-route-hidden-ground-mask-relay.md
---

# Handoff: Act 1 clean polygon checkpoint 3 artwork

## Outcome

Checkpoint 1 frame and checkpoint 2 walkable polygon are owner-approved. The
next bounded outcome is a native-resolution owner-review artwork pack that
makes walkable and non-walkable terrain naturally match the approved polygon.

## Verification

- Frame clean SHA-256: `102e11d5d822985e3310487b46d5091224877416951df3314a65a932b48d72bf`
- Frame land mask SHA-256: `7e6ba5845d1db7c9044abfc2d30da4b54bb48a200148c29308f8a94f0def7ffb`
- Polygon authority SHA-256: `0f39f78ac4c7a2160e8154f0c0c4da1dc692787d1065ac79bab3b5a18f47f91d`
- Polygon mask SHA-256: `99af0c8d632a067132ba304104067d324f7f9a32c9fd45e7f90c11eb27e32940`
- Polygon review SHA-256: `f4323c00e513f59f34cf88ec68a3d75f19fb1126859cea5cfb0fb14beb3c54c6`
- Mechanical proof: one walkable component, one radius-4 component, minimum
  corridor width 62, maximum substep 2, zero ocean intrusion.
- Fresh static and native-scale visual reviews returned GO for owner geometry
  review.

## Current state

Read-only approved inputs:

- `design/review/overworld-art-blueprint/act-by-act/act1/runtime-v2/act1-clean-polygon-first-r27/checkpoint-1-frame/`
- `design/review/overworld-art-blueprint/act-by-act/act1/runtime-v2/act1-clean-polygon-first-r27/checkpoint-2-polygon/`

Create checkpoint 3 only under:

- `design/review/overworld-art-blueprint/act-by-act/act1/runtime-v2/act1-clean-polygon-first-r27/checkpoint-3-artwork/`

## Locked decisions

- Native canvas is exactly `2368 x 2912`.
- Use the approved current-art coastline/frame, not an older map frame.
- Polygon geometry is the visual authority for roads, paths, open areas, and
  blocking terrain.
- Main flow: Greenhollow northwest, south through Millbrook and Port Sapphire,
  then east/northeast through Darkfang to Crystal Cave / Act 2.
- Sunken Cellar is a substantial Greenhollow spur.
- Whispering Woods is a dedicated Millbrook story-canonical side-quest spur,
  with no Greenhollow connection.
- Port Sapphire and Coastal Reef touch the sea boundary.
- Crystal checkpoint visually sits at the cave-entry throat.
- Produce two owner images: clean artwork only, and the same artwork with the
  exact approved polygon/checkpoint overlay.

## Remaining work

Author coherent overworld artwork whose terrain clearly communicates the exact
walkable union without looking like a literal geometric mask. Paths may curve
naturally inside the locked polygon, while rocks, cliffs, vegetation, water,
and other blockers must make the outside visibly non-walkable. Preserve organic
open areas at towns and dungeons and make every entrance visually legible.

## Risks and blockers

- `src/systems/progression/QuestManager.ts` contains stale `owlsLesson`
  Greenhollow Elder/slime/bug data that conflicts with the Professor
  Sage/Millbrook story. Record it as a later runtime-integration blocker; do not
  edit runtime code during checkpoint 3.
- Do not alter the approved frame or polygon to accommodate generated art.
- Do not promote assets, change collision/routes/runtime, build Vite/npm, ship,
  commit, push, or deploy.

## Resume here

Read parent/project `AGENTS.md`, `docs/AGENT-WORKFLOW.md`, the `edu-rpg`,
`game-design`, `imagegen`, `coding-skill`, and `ponytail` skills, plus
`design/ART-DIRECTION.md`, `design/OVERWORLD-MOVEMENT-BOUNDARIES.md`, and both
approved checkpoint review files. Inspect the approved images at native scale.
Create only the checkpoint-3 owner-review pack, verify exact dimensions and
input hashes, then return both images and stop for owner review.

## Kickoff prompt

Work in `/Users/christopherhachisu/Documents/claudecode/edu-rpg-map-engine-semantic-data`
on the shared dirty checkout. Read and follow
`docs/handoffs/2026-07-19-act1-clean-polygon-checkpoint3-artwork.md`. Create the
checkpoint-3 native-resolution artwork owner-review pack using the locked frame
and polygon. Return exactly two principal review images: artwork only and the
same artwork with the approved polygon/checkpoint overlay. Do not modify
checkpoint 1 or 2, runtime, collision, routes, saves, accepted art, builds, or
deployment. Stop for owner review.
