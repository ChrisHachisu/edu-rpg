Draw this as hand-drawn, hard-edged pixel art at full detail.

THE INPUT IS A PLAN, NOT A PICTURE. It is a flat colour-coded diagram of ONE QUADRANT -- tile
(0,1) of a 2x2 grid -- of a small top-down JRPG forest village inside a round timber palisade, with one gate at the SOUTH, cottages of stone and dark timber facing inward under steep shingled roofs, a packed-earth yard around a stone well, and dense green woodland pressing in beyond the palisade. It is not a blurry painting to be sharpened; it is a map
telling you WHERE EVERYTHING GOES. Draw the finished village that this plan describes, keeping every
element in exactly the position and at exactly the size the plan gives it.

YOU ARE SEEING ONE CORNER OF THE VILLAGE, NOT THE WHOLE OF IT. Everything below describes THIS CROP
and only this crop. Draw what is listed as present. Do not draw anything listed as absent, however
natural it would be in a village of this kind -- the missing parts are in the other three tiles and
drawing them here would put two of them in the finished map.

WHAT IS IN THIS TILE, AND WHAT EACH COLOUR MEANS HERE:
  dark green (58,92,48) is the WOODLAND OUTSIDE the palisade.
  mid green (96,132,70) is GRASS inside the palisade.
  pale warm grey (176,168,148) is the PACKED-EARTH STREET AND YARD, which is where the player walks.
  brown band (104,82,54) is the TIMBER PALISADE, a wall of upright logs.
  the block with the dull red upper band in the middle left is a BUILDING. The coloured part is its ROOF and the brown strip below it is its FACADE, so it faces DOWN-SCREEN. Give it a door on that facade and windows, and stand it exactly on its block. It is CUT OFF by the edge of this tile: draw only the part that is here, right up to the edge, and do not complete it.
  the block with the dull red upper band in the lower centre is a BUILDING. The coloured part is its ROOF and the brown strip below it is its FACADE, so it faces DOWN-SCREEN. Give it a door on that facade and windows, and stand it exactly on its block.
  the grey disc in the lower left is a STONE WELL. Only the part of it inside this tile is drawn here.

WHAT IS *NOT* IN THIS TILE. DO NOT DRAW ANY OF THESE:
  There is NO GATE in this tile. The palisade here is UNBROKEN: do not draw a gateway, a gap, a door or an opening through it anywhere in this tile.
  There is NO WATER anywhere in this village: no stream, no pond, no river, no well-fed channel, no bridge.

WHAT YOU ARE ADDING is craft, not content: texture, material, light, doors, windows, shutters, roof
tiles, fence posts, cart ruts, planting at the edges of the grass. Do not add a building the plan
does not have, do not move one, do not open a gap in the palisade, and do not pave over grass or
grass over paving -- the boundary between them is the collision the game already uses.

THE GRAIN IS COARSE, AND THIS IS THE MOST IMPORTANT INSTRUCTION ABOUT HOW IT IS DRAWN. Draw as
though the smallest mark you can make is a 3x3 block. No single-pixel speckle anywhere. No fine
noise, no stipple, no per-pixel value wobble.

  GRASS is flat areas of two or three greens with clean hard boundaries between them, plus a
  scattering of DISTINCT tufts and flowers big enough to see, not a carpet of tiny dots.
  PACKED EARTH AND PAVING is individually drawn stones 8 to 14 pixels across with a definite dark
  line of mortar or shadow between them, and flat worn earth between the stones. They must read one
  by one, not as gravel texture.
  ROOFS are individual tiles or shingles in rows, each one a flat block with a hard edge.
  WOODLAND is distinct tree crowns with hard silhouettes and flat interiors, two or three values
  each, not a fine-grained canopy texture.

Every boundary between two materials is a hard line, never a blend. Inside a material use two or
three flat values and dithering, never a gradient.
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
neighbouring pixels, 22 or more overall, with 30% or more of steps at 24 or above and 22-40% of
steps between 4 and 20. That middle band is real shading inside shapes; keep it, but do not let it
swamp the picture -- too much of it is what a painting looks like to this measurement.

LIGHT AND PALETTE. One upper-left sun, short soft shadows, warm late-morning woodland daylight. Mean luminance about 90; do not
draw it darker than that.
