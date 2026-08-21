DO THIS YOURSELF, one generation call, do not dispatch a sub-agent. Produce the image
and stop; do not review it, do not redraw it, do not ask another agent to improve it.

Draw this as hand-drawn, hard-edged pixel art at full detail.

THE INPUT IS A PLAN, NOT A PICTURE. It is a flat colour-coded diagram, and it is ONE QUADRANT --
tile (0,1) of a 2x2 grid -- of a small top-down JRPG mill village inside a round timber palisade, with one gate at the south. It has NO river and NO stream: the mill is driven by a wheel on its own wall. It is not a blurry painting to be sharpened and it is not a theme to riff on: it is a map
telling you WHERE EVERY SINGLE THING GOES inside this crop. Draw the finished village that this
exact crop describes, keeping every element in exactly the position, at exactly the size, and with
exactly the extent the plan gives it.

WHAT IS ACTUALLY IN THIS CROP, measured off the image you have been given:

  - DENSE FOREST CANOPY outside the palisade: individual rounded treetops drawn one by one, each with its own highlight and cast shadow, packed edge to edge so no two are identical. It must never be a flat field of colour -- if this area reads as plain dark green with no trees in it, the tile is wrong: 41.1% of this crop, spanning 5%-99% across and 1%-94% down
  - mid-green GRASS, inside the palisade: 26.9% of this crop, spanning 3%-79% across and 21%-98% down
  - pale PACKED-EARTH STREET AND YARD, the ground the player walks on: 11.2% of this crop, spanning 1%-41% across and 71%-99% down
  - brown BUILDING FACADE, the lower band of a building block: 5.9% of this crop, spanning 1%-69% across and 51%-80% down
  - slate-blue ROOF, the upper band of a building block: 4.0% of this crop, spanning 41%-70% across and 59%-72% down
  - red-brown ROOF, the upper band of a building block: 5.6% of this crop, spanning 1%-29% across and 32%-50% down
  - the TIMBER PALISADE, a wall of upright logs: 4.6% of this crop, spanning 2%-84% across and 16%-97% down; it meets the bottom edge at 82%-85%; left edge at 16%-20%
  - VILLAGE CLUTTER. Each amber mark is one piece of stored property standing on the ground: a barrel, a crate, a stack of firewood, a sack pile, a covered handcart, a water trough, a stack of crab pots or roof tiles, a coil of rope. Vary them, give each one a cast shadow, and draw them at the size and position of the mark. They belong to the buildings and the wall they stand against: 0.6% of this crop, spanning 0%-62% across and 64%-87% down

NOT PRESENT IN THIS CROP AT ALL, and therefore MUST NOT BE DRAWN INTO IT:
  WATER
  the ONE GATE through the palisade
  a round STONE WELL

READ THAT LIST LITERALLY. It is the complete contents of this crop. This is a QUADRANT of a larger
plan, so most of the village's landmarks are in the OTHER quadrants and are not your problem. Do not
add a gate, a well, a bridge, a watermill, a wheel, a pond, a building, a path or a stream that is
not in the list above, however natural it would look and however much the village as a whole might
have one somewhere else. Inventing a landmark here puts it in the wrong place on the finished town,
and the pale ground is the COLLISION MAP the game already uses -- so paving over grass or grassing
over paving changes where the player is allowed to walk.

GEOMETRY IS THE POINT. The palisade must follow the plan's brown curve along its whole length and
meet the crop's edges exactly where the list says it does, so that it continues into the neighbouring
quadrants. Water must do the same. A building's block must keep its position and footprint: the
coloured upper part is the ROOF and the brown lower part is the FACADE, so the building faces
DOWN-SCREEN. Give every building a door on that facade, and windows.

WHAT YOU ARE ADDING is craft, not content: texture, material, light, roof tiles, shutters, planks,
fence posts, cart ruts, individual cobbles, tussocks and planting at the edges of the grass. The
pale ground must read unmistakably as open, even, walkable ground -- worn earth and set stone, with
nothing built across it.

THE LEFT EDGE OF THIS IMAGE IS ALREADY FINISHED ARTWORK, carried over from the tile drawn before this
one. Reproduce those 148 pixels EXACTLY -- same shapes, same colours, same level of detail --
and continue that same drawing inward across the rest of the tile. Do not restyle them, do not
brighten them, do not reinterpret them. They are the join, and a visible change across it is a
failure.

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

LIGHT AND PALETTE. One upper-left sun, short soft shadows, warm late-morning daylight over open
farmland. Mean luminance about 90.

TWO IMAGES ARE ATTACHED, AND THEY DO DIFFERENT JOBS.
  IMAGE 1 is the PLAN. It sets WHERE everything goes, and only that. Its flat colours are a key, not
          a palette: do not reproduce them as flat fills.
  IMAGE 2 is FINISHED ART from the same game, and it sets HOW DENSELY DRAWN the result must be. Match
          its level of detail, its material texture, its dithering and its contrast -- individual
          stones, planks, tiles and leaves, everywhere, including across large areas of ground.
Do not copy image 2's buildings, layout or content. Take POSITION from image 1 and FINISH from image 2.

This is not a preference. Tiles drawn from the plan alone measure about half the pixel-step energy of
image 2 (mean absolute luminance step between neighbouring pixels 11.8 against 22.2, hard steps 14%
against 30%), because a flat plan gives you nothing to redraw and the result comes back as smooth
fields. Image 2 is what a finished plate of this town has to look like up close.
