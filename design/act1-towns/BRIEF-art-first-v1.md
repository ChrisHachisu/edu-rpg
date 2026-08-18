# Task: Port Sapphire town screen — repaint the attached layout as finished art

The attached image IS the town. Its layout is FINAL and is the authority: the street network, the
position and the size of every building, the shoreline and the open ground are all correct and must
be reproduced exactly where they are. You are not designing a town. You are turning this blocked-in
layout into finished artwork.

## OUTPUT

A single RGB PNG, exactly **1950 x 1950**, the same pixel dimensions as the input. Do not output
any other size. Write it, then print its absolute path on a line of its own. Do not delete it. Do
not write anywhere under /tmp.

## WHAT MUST NOT MOVE

- **Every building stays at its exact position and its exact size.** Same footprint, same roof mass,
  same door on the same wall facing the same way. You may redraw the building; you may not move,
  resize, add or remove one.
- **The pale stone street network stays exactly where it is**, at the same width, with the same
  branches and the same junctions. The game reads the streets out of this image to decide where the
  player may walk, so a street drawn somewhere new silently changes where the player can go.
- **The shoreline, the water and the quay stay where they are.**
- Do not add a border, a frame, a title, a vignette or a signature.

## WHAT TO IMPROVE

Everything else. Make it finished artwork rather than assembled pieces:

- **Ground.** Break up the repetition in the grass and the cobble. Worn tracks where feet cross the
  grass, mud and puddles at junctions, moss between stones, tufts along walls, weathering where the
  paving meets a building. The ground should look walked on.
- **Gardens and plots.** Give the houses hedges, fences, vegetable beds, flower borders, woodpiles,
  washing lines, water butts. The gaps between buildings should read as somebody's yard.
- **The harbour.** It is empty. Add jetties, moored rowing boats and one small coastal sailing boat,
  mooring posts, nets, crates and barrels stacked against the quay wall. Keep the quay itself open
  down its length; the player walks there.
- **Light.** One consistent upper-left sun across the whole image, short soft shadows. Every building
  lit the same way.
- Small honest clutter tight against walls and fences: barrels, crates, tools, carts. Never in the
  middle of a lane or a square, which must stay open and clearly walkable.

## THE FINISH — this is what got the last three attempts rejected

Hand-drawn, hard-edged pixel art. Chunky pixel blocks, crisp material boundaries, shading stepped
in flat values, dithering rather than gradients.

**Drawn hard, not filtered hard.** Do not run a sharpen, an unsharp mask, a posterize or a colour
reduction over a soft painting. That is what the previous rejected attempt did and it is measurable:
it left only 9% of its pixel steps in the intermediate 4-20 luminance band, where hand-drawn art
sits at about 33%. Real drawn art still shades INSIDE a shape; it just does it in discrete steps.
Targets, measured on the mean absolute luminance step between neighbouring pixels:

    mean step             >= 26
    steps >= 24            34-52%
    steps in 4..20         22-40%   <- the band that catches a filter; do not empty it
    mean luminance         90 +/- 5
    blue/red ratio         0.674 +/- 0.05

**Also not painterly.** The town that ships today is a soft painting and the owner rejected it for
looking fuzzy in game. No airbrushed gradients, no blur, no bloom, no photographic texture.

## SCALE, WHICH THE INPUT ALREADY HAS RIGHT

The player is 68 px tall. A cottage is about 240 px wide, a two-storey house about 290 px. One game
cell is 30 px. Keep those relationships exactly as the input has them: a building must never
approach the player's height, and must never grow to swallow a lane.
