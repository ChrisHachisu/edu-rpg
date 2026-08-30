# Open items after build 70

Build 70 closed six of the eight items the owner raised on builds 67 and 68. **Two are open**, and
both are open for a reason worth reading before picking them up: each was ATTEMPTED, measured, and
backed out rather than shipped.

Closed in builds 68-70, for reference: the parent text box hiding the town controls, arrival at the
town gate, the Greenhollow heal fee, the stale speaker, the shop screen (scroll, sticky bar, confirm
popup with quantity and a wallet cap), the New-equipment badge, healer placement in millbrook and
Port Sapphire, the menu-to-dungeon camera snap, and the blue-screen veil.

---

## 1. Town and dungeon boundaries -- ATTEMPTED AND BACKED OUT

> "the boundaries in the town are slightly off in some locations (top side of houses, edges of the
> town, fenses, etc.) ... i'd say 90% are fine"
> "the top side of the walls look like they have an invisible barrier but the north side need to be
> touchable"

**The defect is real and measured.** Comparing the walk mask -- eroded by the hero's 12 px foot disc,
i.e. where her CENTRE may be -- against the floor the plate actually paints, there is painted floor
her body cannot reach on 2-26% of columns:

| floor | affected columns | median excess | p90 | max |
|---|---|---|---|---|
| sunkenCellar-f1 | 15% | 11 px | 49 px | 93 px |
| mistyGrotto-f1 | 2% | 2 px | 7 px | 12 px |
| coastalReef-f1 | 26% | 7 px | 37 px | 122 px |
| whisperingWoodsCave-f1 | 10% | 3 px | 24 px | 44 px |

Note the shape of that: it matches his own "90% are fine, there are just a little bit that needs
fixing" almost exactly.

**The obvious fix does not work, and this is the useful part.** I built an art-fit pass into
`bake_dungeon_arch.py`: learn floor-vs-rock per floor from the lattice (a cell's interior is
reliably what `rows` says, even where its boundary is not), then grow the walkable mask into painted
floor within reach of ground she can already stand on, guarded by "the number of connected walkable
regions may not rise".

* A 5x5 opening on the classifier added 270-2638 px per floor and the excess did **not move**: 306
  affected columns before, 306 after.
* A 3x3 opening added more pixels and sunkenCellar then tripped the region guard (5 -> 7 regions).

The reason it cannot work: the unreachable strips are the wall's SHADOW and base gradient. No
floor-vs-rock colour rule will ever claim those as floor -- and arguably it should not, since
standing inside a painted wall base is its own defect. **The mask is not where this lives.** It was
backed out rather than shipped: a collision change that moves no metric and refuses on one floor is
the speculative work the gates exist to stop.

Where to go instead, in order of likely payoff:

1. **Ask him to point at specific spots.** He said 90% are fine. A rendered audit of every boundary
   for him to mark would target the real 10% instead of moving everything.
2. If a systematic pass is still wanted it belongs in the ART, or in the mask DERIVATION
   (`render_dungeon_material_map.py`), not in a post-hoc grow: the wall bases need to be painted so
   that "floor" and "standable" agree, rather than reconciled afterwards.
3. The TOWNS are a different pipeline again -- their geometry is a polygon authority already fitted
   to the painting (`act1-art-fit-polygon-authority-v2`), so the town half is a re-fit of those
   polygons at the specific edges he names, not the same job as the dungeon mask.

## 2. The boss is baked into the plate -- ATTEMPTED AND BACKED OUT

> "you did not replace the boss sprite with something that can be removed completely when the boss
> is defeated ... the shadow does not remain even after defeating it"

**The shadow is not an artefact -- it is a deliberate cover, and dq-tiles.js says so.** The boss mark
is baked into `<floor>-props.png`, which nothing repaints, so when `a1dBossVanishPlay` animates a
live copy away it leaves "a soft dark patch (Phaser Graphics, no new asset) ... revealed as the
sprite fades, so the baked pixels stay hidden for good". **That patch is the shadow he is looking
at.** It exists only because the mark underneath cannot be removed. Anyone fixing this should know
that before touching the animation: the animation is fine, the cover-up is the symptom.

So the fix is three edits, and only the first is hard:
1. paint the boss OUT of the four boss-floor plates (crystalCave is off-limits per AGENTS.md and is
   not in `A1D_BOSS_ID` either),
2. let `dngSpecialObjects` draw tile 7 as a live sprite on the hi-fi layer (it is suppressed today
   precisely because the baked picture already shows it),
3. delete the dark cover patch in `a1dBossVanishPlay`, which then has nothing to hide.

**Step 1 defeated a clone-based approach and needs art regeneration.** I wrote and discarded
`cover_dungeon_boss.py`. Findings worth keeping:
* A plain disc mask leaves the mark's smoke tendrils behind -- a visible dark smudge beside the
  patch, i.e. the same shadow by another route.
* The mark's own connected component is the right SHAPE but not a safe size: on mistyGrotto it abuts
  the room's rock and runs to 5.1 x 5.1 cells, a quarter of the room. Component-intersected-with-a
  -2.5-cell-bound fixes that.
* The blocker is the DONOR. These boss rooms are small and their floors are strewn with loose
  stones, so there is no clean floor disc to clone: the cleanest within 13 cells is 69-82% floor on
  three of the four. Cloning it drags scenery in.
* Nearest-neighbour or diffusion inpainting would avoid the donor problem and produce streaks or
  blur against crisp pixel art.

Conclusion: regenerate the four boss-room floor patches as art (the repo's own route for this is
Codex), then apply steps 2 and 3, which are small.

