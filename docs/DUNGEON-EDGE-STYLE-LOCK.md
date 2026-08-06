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

## Wall face height — LOCKED at 0.95 (owner, 2026-08-06, second pass)

`face_h = max(2, int(px * 0.95))` in `scripts/render_dungeon_material_map.py`. Was 0.70, and 0.46
before that.

Owner, having played the cellar at 0.70: *"the bleeding in the wall looks much better now but the
character's top part still sticks out of the shadow part a bit, which makes it look unnatural so
the character needs to fit within the shadow area."*

**0.70 aimed at MOST of her inside the shade. The requirement is ALL of her, so this number is now
DERIVED, not judged.** Three measurements fix it:

| | value | source |
|---|---|---|
| her crown above her soles | **55 px** | the g3 sheet, **NORTH row** — see the warning below |
| her soles' stand-off from a north wall | 16 px | `A1M_FOOT` 12 + `A1M_LEAN` 4, `dq-tiles.js` |
| **so her highest pixel over the wall sits** | **39 px** above the junction | 55 − 16 |
| blur on the band's own top edge | ~3.4 px | `blur(..., px * 0.07)` |
| **minimum band** | **43 px** | 39 + 3.4 |

| face | band | verdict |
|---|---|---|
| 0.70 | 33 px | 3 px short — the sliver he could see |
| 0.85 | 40 px | 1 px margin, her crown lands inside the **blur** — not enough |
| **0.95** | **45 px** | 6 px clear of her crown and past the blur |

> [!warning] Measure the NORTH row, not "the hero"
> The renderer's old comment and `dq-tiles.js` both quote **52 px**, taken from a different
> direction. The row that matters against a north wall is the one you are actually looking at —
> **NORTH, her back** — and its piled hair makes it the **tallest of the eight** (crown at sprite
> row 3, soles at 58). Measuring the wrong row is what left 0.70 three pixels short, and would
> have left 0.85 one pixel short had it shipped.

## Minimum wall mass — a wall must be ≥2 cells deep (owner, 2026-08-06)

A deeper band has a cost the owner named in the same breath: *"this also causes a minor problem
with small patches of walls since some do not have enough mass to support the massive shadow part,
so the easy fix is to just remove these and make a rule to only have larger wall masses that can
have a large shadow patch."*

`prune_thin_walls()` in the renderer drops any wall component whose longest **vertical run** is
under `MIN_WALL_DEPTH_CELLS = 2`. Vertical run, not area, is the right measure: the band eats
`face_h` px *northward* from a mass's southern boundary, so a 10-cell wall that is 3 cells deep is
fine while a 1-cell-deep streak of the same length is all shadow and no solid. At 40 px of band, a
1-cell mass (48 px) keeps 8 px of lit top; two cells (96 px) keeps 56 px, which reads correctly.

It runs inside `floor_field()` — the one path both the picture and the collision mask go through —
so the art and the collision cannot disagree about where the rock is.

**Measured cost across all 18 authored floors: 1–8 cells a floor, every one an isolated speck, and
no asset sits on any of them.** Pruning only ever opens floor, so nothing can be stranded.

Owner, having played the cellar: *"the bleeding into the shaded area of the walls seem too much.
either the shading needs to be increased (to make the walls look taller) or the bleeding needs to
be reduced."* He named both levers; deepening the shading is the one that was taken.

The measurement that decided it: at 0.46 the drawn shaded face was **~22 px** while the heroine is
**52 px tall above her soles**. She physically cannot fit inside the shade, so her body always
spilled onto the LIT top. At 0.70 the face is ~34 px and most of her sits inside it.

Deepening beats the alternative because **more foot clearance narrows the cave**: `A1M_FOOT` 18
orphans three authored assets and strands 40 cells, so clearance is capped at 16 and cannot solve
this. A taller face costs no corridor width at all.

Do NOT reduce this back toward 0.46 to "recover floor brightness" without the owner — the trade was
made deliberately and with the character composited in at true scale.

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
