# Task: Port Sapphire GROUND materials, v1 — four seamless tiling swatches, one sheet

Generate ONE square image: a 2 x 2 sheet of four ground materials for a top-down JRPG town.
Four equal quadrants, hard-butted against each other, no gutters, no labels, no border, no
drop shadows, nothing outside the four quadrants.

    TOP-LEFT      GRASS
    TOP-RIGHT     PALE COBBLE PAVING
    BOTTOM-LEFT   DIRT / SAND SHORE
    BOTTOM-RIGHT  THE EDGE: grass on the left half meeting pale cobble paving on the right half

Each quadrant is a MATERIAL, not a scene. Flat, even, overhead daylight across the whole
quadrant. No composition, no objects, no buildings, no people, no paths leading anywhere, no
vignette, no baked large-scale light pooling or shadow. The renderer supplies shadows; a
material that arrives with its own baked highlights reappears as repeating blobs once it tiles.

## THE FINISH — this is the half that gets rejected, and it is a number

The art must be HARD-EDGED PIXEL ART, drawn the way the buildings in the attached props sheet
are drawn: chunky pixel blocks, crisp material boundaries, visible stepped shading in two or
three flat values per material, dithering rather than gradients.

It must NOT be painted. No soft airbrushed gradients, no blur, no bloom, no photographic
texture, no watercolour. The existing town is painted and the owner rejected it on sight for
being fuzzy in-game.

Measured on the mean absolute luminance step between neighbouring pixels, these are the
acceptance numbers:

    mean step            >= 28      (the painted town scores 12, the hero sprite scores 31.6)
    steps >= 24           >= 42%    (painted town 13%, hero 47.5%)
    steps in 4..20         22-40%   (painted town 47% -- too smeared; a posterize filter
                                     scores 9% -- too flat. Shade the shapes in flat steps.)

The middle band is checked FROM BOTH SIDES on purpose. Real hand-drawn art still shades inside
a shape; it just does it in discrete steps instead of a gradient.

## THE PALETTE — measured off the shipped town, hold it

    GRASS     mean RGB (119, 135, 26)   luminance 124   blue/red 0.22
              A bright, warm, yellow-leaning summer green. NOT emerald, NOT blue-green.
    PAVING    mean RGB (129, 118, 99)   luminance 119   blue/red 0.76
              Pale warm grey-buff worn stone. It must stay PALE: the game thresholds the
              paving out of this art to decide where the player may walk.
    SHORE     warm dry sand-buff, slightly lighter and less saturated than the paving.
    Saturation across the sheet averages about 0.63. The last batch came back at 0.70 and read
    slightly candy -- pull the saturation back to 0.63.

## SCALE — what one tile covers

Each quadrant is one repeating tile covering about 17 game cells across, and one cell is
30 pixels of this image. So:

    a cobble stone      about 12-20 px across      (a bit under a cell)
    a grass tuft        about 8-16 px
    a shore pebble      about 6-12 px

Nothing in any quadrant may be larger than about 60 px (two cells). A feature bigger than that
becomes a visible repeating stamp when the tile is laid across the town. Vary the stone sizes
and the grass value so the field does not read as a regular grid, but keep every feature small.

## THE FOUR QUADRANTS

1. GRASS. Dense short summer grass in small chunky tufts, three or four flat green values
   stepped against each other, occasional tiny dry-straw and pale-flower flecks. Even coverage
   edge to edge.

2. PALE COBBLE PAVING. Irregular rounded worn cobbles of varied size, pale warm grey-buff,
   tight mortar joints a shade or two darker, a few stones lighter and a few darker so the
   surface reads as laid by hand. No kerb, no border, no pattern radiating from a centre.

3. DIRT / SAND SHORE. Packed damp warm sand and fine grit, scattered small pebbles and shell
   chips, faint tide ripple lines. Dry, no standing water, no waves, no sea.

4. THE EDGE. The left half is the GRASS of quadrant 1, the right half is the PAVING of
   quadrant 2, and they meet down the middle along an IRREGULAR ORGANIC boundary -- wandering,
   never a straight line, never a smooth arc. Loose cobbles scatter a little way into the
   grass, and grass tufts push up between the outermost stones. This quadrant is used as a
   border band, so the boundary must run continuously from the top edge to the bottom edge of
   the quadrant.

## OUTPUT

Write the finished sheet as a PNG and then print its absolute path on a line of its own.
Do not delete it. Do not try to write anywhere under /tmp. Do not write into the repository.
Generate the image; do not analyse or verify it afterwards.
