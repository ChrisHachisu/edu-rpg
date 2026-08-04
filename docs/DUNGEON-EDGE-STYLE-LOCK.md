# LOCKED — Act 1 dungeon edge style (owner, 2026-08-04)

Owner: *"much better. i love the clear rims. lock this style in the design and finish this
dungeon."*

## The lock

**Rock meets floor at a HARD-TERMINATED base band.** In
`scripts/render_dungeon_material_map.py`, the wall-base band's floor-side ramp is
`inner = clip((0.555 - fw) / 0.015, 0, 1)` — a hard stop where the floor begins. Its rock side
(`outer`) keeps the softer fade that dies away *under* the wall. That asymmetry is method rule 4
and it is now the locked look for every Act 1 dungeon floor.

Measured 10-90% luminance transition across the boundary, whole floor, ~2000 samples/orientation:

| | south | west | east | north |
|---|---|---|---|---|
| before (soft) | 6.88 px | 6.59 | 6.16 | 6.67 |
| **locked** | **4.37 px** | **3.44** | **3.36** | **3.37** |

3.4 px is the material edge itself — as crisp as a 48 px/cell lattice can resolve.

## What must NOT change to "improve" this

Each of these was tried, rendered and rejected. Do not re-litigate without the owner:

1. **Do not sharpen the floor mask** (`f = blur(up, px * 0.34)`). It squares the cave onto the
   tile lattice and destroys the organic silhouette. Owner: *"you misunderstood crispness with
   angularness."* The organic shape is liked and is not negotiable.
2. **Do not retune ambient occlusion or the cast-shadow blur.** Owner: *"you just made everything
   darker and the edge crispness did not change."*
3. **Do not add a contact-occlusion rim inside the rock.** Measured: it bottoms out 6 px inside
   the rock and is invisible at the boundary.
4. **Do not add a top-plane terminator on N/E/W.** Built and measured: moves the transition
   0.23 px, visually null.
5. **Nothing that is not edge-local.** Owner: *"i am purely talking about the edges of the walls,
   so anything that does more than that is probably wrong."* Acceptance test: floor >12 px from
   any wall must not change (measured 99.02 -> 99.02), and the mask's 0.5 iso-contour must be
   bit-identical so the silhouette provably cannot move.

## The SOUTH side is separate and already correct

`face` + `cast` (floor lies south of the rock) give the south side a near face and a drop shadow.
The owner likes it. The band fix does not touch it beyond the shared inner ramp.

## Hero density

The hero ships at her **native 64 px frame** (`scripts/build_hero_g3_walk.py`), rendered at
scale 1.0125 in `hero-override.js`. She used to be downscaled 64->48 and scaled back up ~1.35x,
i.e. resampled twice. Owner: *"the size is good but it needs to match the dungeon pixel count."*
64 source px at ~65 screen px is ~1:1 against 48 px/cell art. **Do not reintroduce a 48 px cut.**
