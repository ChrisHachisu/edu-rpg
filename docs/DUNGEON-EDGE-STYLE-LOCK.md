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

## Minimum wall mass — ≥6 cells of area AND ≥2 cells deep (owner, 2026-08-06)

A deeper band has a cost the owner named in the same breath: *"this also causes a minor problem
with small patches of walls since some do not have enough mass to support the massive shadow part,
so the easy fix is to just remove these and make a rule to only have larger wall masses that can
have a large shadow patch."* Then, having seen the first bake: *"i told you the issue with the
smaller walls so i need you to remove them or merge them into bigger walls."*

**The first version of this rule was too weak.** It failed a mass only on DEPTH — longest vertical
run under 2 cells — which is the band-fit test, so it caught single-cell slivers and nothing else,
1–8 specks a floor. Measured on the shipped bake, **27 wall masses under 6 cells survived it**, 19
of them in coastalReef, whose braided loops leave small rock cores between the bypasses. A 3-cell
island passes a depth test and still reads as a speck of grit rather than rock you walk beside.

A mass must now meet **both** conditions:

| | rule | why |
|---|---|---|
| **depth** | longest vertical run ≥ `MIN_WALL_DEPTH_CELLS` = 2 | the band eats `face_h` **northward** from the mass's southern boundary, so vertical run — not area — decides whether any lit top survives. At 45 px of band, one cell (48 px) leaves 3 px of top; two cells (96 px) leave 51. |
| **mass** | area ≥ `MIN_WALL_AREA_CELLS` = 6 | the owner's "larger wall masses". This one is about legibility, not lighting. |

**A failing mass is MERGED if it can be, and REMOVED if it cannot** — both remedies the owner
named. Merging is preferred because it keeps the rock the layout intended, but it is only safe
across a hairline: filling a wide gap would wall off a corridor. So a merge is allowed only into an
orthogonally adjacent gap of at most `MERGE_GAP` = 1 cell, **and only when the fill leaves every
floor cell still reachable — checked, not assumed**. Everything else is removed, which is always
safe because it can only ever open floor.

### It takes TWO passes, because the warp makes its own islands

`prune_thin_walls()` works on the **lattice**, before the boundary warp exists. That is the right
place for masses the layout authored — but it cannot see rock the warp itself breaks off the edge
of a bigger mass. Measured after the lattice rule alone shipped: masses under 6 cells fell 27 → 8,
and **every survivor (0.3–5.3 cells) had no lattice component behind it.**

So there is a second pass, `drop_rock_islands()`, applied to `fw` — the warped floor field — which
fills any rock island still under `MIN_WALL_AREA_CELLS`. The owner's rule is about what is on
screen, so it has to be enforced where the screen is decided.

Both passes run inside `floor_field()` — the one path both the picture and the collision mask go
through — so the art and the collision cannot disagree about where the rock is. `drop_rock_islands`
deliberately edits **`fw` itself** rather than cleaning the mask afterwards: cleaning them
separately would be two opinions about where rock is, and they would drift.

> [!note] The one scipy dependency in the repo
> Labelling islands in `fw` means connected components over ~13M pixels, which a Python flood fill
> cannot do inside a bake. Everything else in the renderer stays numpy + PIL.

## Every shaded part must have lit wall above it (owner, 2026-08-06)

*"we still have an issue where some edges cannot visually withstand the shadow part so they need to
be thicker in some locations (some parts only have shadows, so we need at least the same area of
walls above the shaded parts in every location)"*

**Taken literally — every wall column ≥ 2 × `face_h` — this is unsatisfiable**, and measuring says
so rather than intuition:

- 11,600 column-runs across the 12 floors are shallower than 90 px, overwhelmingly the one- and
  two-pixel tapers at the sides of masses.
- A naive northward thicken **sealed corridors**, splitting coastalReef-f2 and whisperingWoodsCave-f2
  into **six disconnected floor regions each**. All 12 floors are one region today.
- Squaring off every taper would break the organic silhouette that rule 1 below protects.

**What is actually visible is much smaller:** connected patches whose *whole depth* is band, big
enough to read as a dark smear rather than as the edge of a rock. Measured: **91 patches of ≥1 cell**
across the 12 floors, the largest 5.6 cells. Those, and only those, are the defect.

> [!danger] "Those, and only those" was wrong, and it is the sentence that cost the most
> Sizing a patch by AREA and stopping at 1 cell is what let the owner find this on a shipped floor.
> The defect he actually saw is the END of a wall mass, where the warp rounds the rock off, the
> vertical run drops under `need`, and a blunt dark lobe hangs off the rock with no lit top. Those
> lobes are **tall and thin** — the worst on sunkenCellar-f1 is **0.85 cells of area and 40 × 87
> world px on screen** — so an area test rated every one of them as beneath notice.
>
> Measured on the shipped bake: **87 all-shadow patches on sunkenCellar alone, every single one
> under the 1-cell threshold**, so `thicken_shadow_walls()` skipped all 87 and then truthfully
> reported zero. The count in the paragraph above is not a count of the defect; it is a count of
> what that detector could see.
>
> Visibility is now **area OR extent** (`MIN_SHADOW_PATCH_W_CELLS` 0.25 × `MIN_SHADOW_PATCH_H_CELLS`
> 0.75, i.e. a 12 × 36 px block of unbroken band), OR'd so it can only ever select more than before.
> sunkenCellar went 87 → 0. Two floors keep one patch each — `mistyGrotto-f3` and
> `whisperingWoodsCave-f3` — where no edit could be made without splitting the floor, and the pass
> correctly prefers the patch to the split.
>
> **The general lesson, because it recurred five times in one sitting:** this pass reasons about a
> boolean `rock` and then WRITES a feathered delta, and the two do not agree for anything thin. It
> validated a proxy of its output instead of its output — in patch detection, in removal, in the
> convergence test, in the prop-pocket ordering, and in the connectivity guard, which was also
> asking at the wrong resolution with the wrong reduce. `_passable_field()` now asks exactly what
> `walkable_mask()` asks. **If you change this pass, verify the FIELD it returns, never the boolean
> it checked.**

`thicken_shadow_walls()` therefore **thickens each visible patch northward** until it carries a lit
top at least as deep as its band, and **removes** the patch where there is no room. Both remedies
are the owner's. Two invariants are *enforced, not hoped for*:

| invariant | how |
|---|---|
| a corridor never drops below `MIN_CORRIDOR_CELLS` = 1 | the northward reach is capped by the measured gap |
| the floor stays **one** connected region | re-checked after every change; the change is reverted if not |

The edit is **feathered** into `fw`, not stamped on it: `a` is `(fw − 0.5) × 34`, so a hard write
would give the new wall edge a mechanical boundary in a picture whose whole point is that its
boundaries are not.

**Cost:** ≤13 cells added and ≤13 removed per floor; walkable area moves by at most 9 cells; every
floor ends with **zero** visible all-shadow patches and still one floor region.

**Measured cost across all 12 shipped floors: 63 cells in total, no asset on any of them, and the
smallest surviving mass on every floor is now ≥6 cells.** Walkable area moves by at most 4 cells a
dungeon (sunkenCellar −4, mistyGrotto −4, coastalReef **+3**, whisperingWoodsCave 0), so the
owner-approved Act-1 area curve is unaffected.

> [!warning] These figures are SUPERSEDED — re-measured 2026-08-06
> They described a pass that could not see the defect it existed to remove. The owner, playing the
> cellar: *"i see several places on the sunken cellar map where the walls are all shadow and has no
> top part. please check the ends of each wall."* He was right, and the numbers above were computed
> by the same broken detector that shipped **87 untreated patches on sunkenCellar alone** while
> reporting zero. A cost measured with a blind instrument is not a cost.
>
> Re-measured on the 2026-08-06 bake, against the shipped masks:
>
> | dungeon | walkable change | was documented |
> |---|---|---|
> | sunkenCellar | **+9.8 opened, −1.5 closed** | −4 |
> | whisperingWoodsCave | **+22.7 opened, −4.4 closed** | 0 |
> | mistyGrotto | **+33.0 opened, −1.8 closed** | −4 |
> | coastalReef | **+44.7 opened, −1.5 closed** | +3 |
>
> **The shape of the change matters more than its size, and it is visible on a per-floor diff:**
> almost every opened cell is a sub-cell sliver on the SOUTH face of a wall end — the lobe itself,
> removed. No corridor widens, no route opens, no room changes shape. coastalReef's +44.7 is
> roughly forty-five separate slivers across three floors.
>
> One change is not a sliver and is recorded because it is the exception: a **3.08-cell dead-end
> nub at the southern edge of whisperingWoodsCave-f2** (cells x 10–12, y 34–36) is filled. Nothing
> stood in it and the nearest chest, at (11, 32), remains reachable.
>
> All 12 floors still pass `check_dungeon_playable.py` as ONE region at the heroine's real 16 px
> clearance with every asset reachable, so the curve moved but nothing became unplayable. The area
> budget above is therefore **no longer the invariant** — playability is. Do not re-tighten
> `MIN_SHADOW_PATCH_W/H_CELLS` to recover the old numbers without the owner: that dial trades
> directly against the defect he asked to have fixed.

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
