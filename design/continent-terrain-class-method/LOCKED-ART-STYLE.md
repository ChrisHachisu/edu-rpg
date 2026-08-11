---
date: 2026-07-20
type: locked-art-style
project: edu-rpg
reaffirmed: 2026-08-11
status: OWNER-LOCKED
---

# Overworld art style + tone — OWNER-LOCKED 2026-07-20

> [!success] STILL BINDS — re-affirmed by the owner 2026-08-11, asked directly.
> `project:` said `edu-rpg-map-engine-semantic-data` until that ruling, which made this read as
> another repo's document; it is corrected above. Nothing in the shipped bake contradicts it, and
> the one clause that had been reported breached is not: **"no visible seams/joins"** measured
> across all 49 internal chunk joins gives mean |diff| **15.14 ACROSS** a join against **14.27** for
> two neighbouring pixels WITHIN a chunk — indistinguishable from ordinary texture. The "crease" the
> owner saw on build 14 was the procedural/baked boundary, a runtime defect, fixed 2026-08-11.

Locked by the owner after the Act 1 phone-frame pilot. Every overworld terrain generation MUST follow this. Do NOT let the model reinterpret the style (that caused the painterly/cartoony drift).

## Style = "Terrain F" (anchored)
- **Style anchor (attach as a reference image to EVERY terrain generation):** `design/art-refs/terrain-f-natural-trail-comparison-locked.png`. Reproduce its exact look: crisp faux-pixel finish, strong material definition, stepped shading, dense layered evergreen forest, mossy faceted rock, mossy grass/ferns, **natural dirt trail** (the right half of the comparison; NOT the brick road on the left). 3/4 top-down, single upper-left light.
- NOT oil-painting / painterly (rejected). NOT flat cartoony cel (rejected). Match the anchor.
- The hero was designed to match Terrain F's edge density; keep terrain at that density so hero + world cohere.

## Tone = lifted (owner picked the brighter option "B")
- Apply a modest shadow/midtone LIFT to the MAP so it is a little less dark than the raw Terrain F anchor. Reference params from the accepted preview: gamma ≈ 0.74, brightness ≈ 1.09 on the reduced map (or generate the master at this lighter value). Keep hues/saturation/material detail/mood — do NOT wash out or go toy-bright.
- The lift applies to the **map only**.

## Hero = UNCHANGED
- The hero is the locked asset `public/act1-hifi/hero-g3/hero-act1-female-walk-8x3-64-g3.png` at its original brightness. NEVER re-tone the hero.
- World art is generated **map-only** (no hero baked in); the hero is composited live at runtime. Preview composites use the ORIGINAL hero sprite over the lifted map.

## Pipeline (per region)
1. Generate a high-res Terrain-F-anchored master (attach the anchor), conformed to the region's class-map geometry, at the lifted tone.
2. Deterministic lattice/palette reduction to the hero density (912/512 = 1.78125 src-px/world-px).
3. Tile across large regions with overlap + seamless blending (no visible seams/joins).
4. Map-only output; composite the original hero only for previews.
