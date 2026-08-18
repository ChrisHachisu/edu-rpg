Draw this as hand-drawn, hard-edged pixel art at full detail.

THE INPUT IS A PLAN, NOT A PICTURE. It is a flat colour-coded diagram of one tile (0,1) of a
2x2 grid covering a small top-down JRPG mill village inside a timber palisade, with one gate at the SOUTH, a clear millstream running west to east across the north of the village, a working watermill with a wooden wheel turning in that stream, a plank bridge where the main lane crosses it, and a packed-earth yard around a stone well. It is not a blurry painting to be sharpened; it is a map telling you
WHERE EVERYTHING GOES. Draw the finished village that this plan describes, keeping every element in
exactly the position and at exactly the size the plan gives it.

READ THE COLOURS LIKE THIS, and change nothing about where they are:
  pale warm grey (176,168,148)  the packed-earth street and yard. THIS IS WHERE THE PLAYER WALKS, so
                                it must read unmistakably as open, even ground -- worn earth and set
                                stone, no clutter across it, no bushes or crates growing into it.
  mid green (96,132,70)         grass and planting INSIDE the palisade.
  dark green (58,92,48)         the woodland/meadow OUTSIDE the palisade.
  brown ring (104,82,54)        the TIMBER PALISADE. A continuous wall of upright logs. It must be
                                unbroken all the way round except at the one gate.
  tan gap at the bottom         THE ONE GATE, and the only way in or out. Draw a real gateway there:
                                posts, a lintel, open leaves. Everywhere else the wall is solid.
  brown blocks with a coloured  BUILDINGS. The coloured upper part is the ROOF, the brown lower part
  upper band                    is the facade, so each building faces DOWN-SCREEN toward the yard.
                                Give every one a door on that facade and windows, and stand it
                                exactly on its block.
  blue                          WATER.
  grey disc                     a stone well.

WHAT YOU ARE ADDING is craft, not content: texture, material, light, doors, windows, shutters, roof
tiles, fence posts, cart ruts, planting at the edges of the grass. Do not add a building the plan
does not have, do not move one, do not open a second gap in the wall, and do not pave over grass or
grass over paving -- the boundary between them is the collision the game already uses.

THE LEFT EDGE OF THIS IMAGE IS ALREADY FINISHED ARTWORK, carried over from the tile
drawn before this one. Reproduce those 148 pixels EXACTLY -- same shapes, same colours, same
level of detail -- and continue that same drawing inward across the rest of the tile. Do not
restyle them, do not brighten them, do not reinterpret them. They are the join, and a visible
change across it is a failure.


OUTPUT: one RGB PNG the same pixel dimensions as the input. Print its absolute path on a line of its
own. Do not delete it and do not write anywhere under /tmp.

THE FINISH. Crisp definite boundaries between materials. Shading in discrete flat steps, two or
three values per material, dithering where a transition is needed. Individual roof tiles, individual
cobbles, individual planks, individual window panes, distinct leaf clumps. No airbrushed gradients,
no blur, no bloom, no soft focus, no photographic texture.

DRAW IT HARD; DO NOT FILTER A SOFT IMAGE TO FAKE IT. No sharpen, no unsharp mask, no posterize, no
palette reduction. Hand-drawn art of this kind measures, on the mean absolute luminance step between
neighbouring pixels, 26 or more overall, 34-52% of steps at 24 or above, and 22-40% of steps between
4 and 20. That middle band is real shading inside shapes; keep it.

LIGHT AND PALETTE. One upper-left sun, short soft shadows, warm late-morning daylight over open farmland. Mean luminance about 90.
