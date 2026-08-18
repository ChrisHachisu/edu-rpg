# Task: Port Sapphire harbour ground — four seamless tiling materials, one sheet

One square image, a 2 x 2 sheet. Four equal quadrants, hard-butted, no gutters, labels or border.

    TOP-LEFT      HARBOUR WATER
    TOP-RIGHT     DRESSED QUAY STONE
    BOTTOM-LEFT   WOODEN DECKING
    BOTTOM-RIGHT  THE SEA WALL EDGE: quay stone above, water below

Each quadrant is a MATERIAL, not a scene. Flat even overhead daylight, no composition, no objects,
no boats, no ropes, no vignette, no baked light pooling.

## FINISH — hard-edged pixel art, matching the attached props sheet

Chunky pixel blocks, crisp material boundaries, stepped flat shading in two or three values,
dithering rather than gradients. NOT painted: no airbrushed gradients, no blur, no bloom, no
photographic texture. Saturation about 0.63 across the sheet.

## PALETTE — measured off the shipped town, hold it

    WATER   mean RGB (4, 49, 76). A deep clear blue-green harbour, DARK. Not turquoise, not teal.
    QUAY    pale warm grey dressed stone, a shade cooler and greyer than the town's cobble
            (which is RGB 129, 118, 99).
    DECK    warm mid-brown weathered planks, the colour of the jetties in the attached sheet.

## SCALE

Each quadrant is one repeating tile covering about 17 game cells; one cell is 30 pixels.

    a dressed quay block    about 20-34 px           a plank width      about 10-14 px
    a water ripple          about 14-26 px long      nothing over 60 px anywhere

## THE FOUR QUADRANTS

1. HARBOUR WATER. Deep blue-green, small stepped ripple bands, a few paler crests, some darker
   depth patches. Calm inside a harbour: no waves, no foam, no breaking water, no reflections of
   anything specific.

2. DRESSED QUAY STONE. Regular rectangular cut blocks laid in courses, pale warm grey, joints a
   shade darker, occasional block lighter or darker, faint salt staining low down. Regular, unlike
   the town's rounded cobbles, because a quay is engineered.

3. WOODEN DECKING. Parallel weathered planks running one way, iron nail heads, gaps a shade darker,
   grain in stepped values, a little bleaching.

4. THE SEA WALL EDGE. The TOP half is the quay stone of quadrant 2, the BOTTOM half is the water of
   quadrant 1, meeting along a horizontal line about a third of the way down: a stone kerb lip,
   then a band of darker wet stone below the waterline, then water. The line runs continuously from
   the left edge to the right edge of the quadrant. Slightly irregular, never ruler-straight.

## OUTPUT

Write the finished sheet as a PNG and then print its absolute path on a line of its own.
Do not delete it. Do not write anywhere under /tmp. Do not write into the repository.
Generate the image; do not analyse or verify it afterwards.
