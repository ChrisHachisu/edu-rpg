DO THIS YOURSELF, one generation call, do not dispatch a sub-agent. Produce the image
and stop; do not review it, do not redraw it, do not ask another agent to improve it.

Draw this as hand-drawn, hard-edged pixel art at full detail.

THE INPUT IS A PLAN, NOT A PICTURE. It is a flat colour-coded diagram, and it is ONE QUADRANT --
tile (1,0) of a 2x2 grid -- of a small top-down JRPG harbour town, its one gate at the north, buildings around a packed-earth market, and a stone quay along the south with timber piers running out into the bay. It is not a blurry painting to be sharpened and it is not a theme to riff on: it is a map
telling you WHERE EVERY SINGLE THING GOES inside this crop. Draw the finished village that this
exact crop describes, keeping every element in exactly the position, at exactly the size, and with
exactly the extent the plan gives it.

WHAT IS ACTUALLY IN THIS CROP, measured off the image you have been given:

  - dark-green WOODLAND, outside the palisade: 6.3% of this crop, spanning 0%-19% across and 1%-34% down
  - mid-green GRASS, inside the palisade: 8.2% of this crop, spanning 22%-88% across and 2%-34% down
  - pale PACKED-EARTH STREET AND YARD, the ground the player walks on: 12.0% of this crop, spanning 65%-100% across and 1%-62% down
  - brown BUILDING FACADE, the lower band of a building block: 5.9% of this crop, spanning 23%-65% across and 1%-32% down
  - slate-blue ROOF, the upper band of a building block: 4.5% of this crop, spanning 22%-64% across and 0%-35% down
  - the TIMBER PALISADE, a wall of upright logs: 1.1% of this crop, spanning 17%-24% across and 1%-34% down; it meets the top edge at 18%-21%
  - the HARBOUR, open salt water: 61.1% of this crop, spanning 2%-96% across and 36%-99% down; it meets the bottom edge at 0%-100%; left edge at 35%-100%; right edge at 68%-100%
  - a round STONE WELL: 0.4% of this crop, spanning 65%-100% across and 0%-62% down
  - VILLAGE CLUTTER. Each amber mark is one piece of stored property standing on the ground: a barrel, a crate, a stack of firewood, a sack pile, a covered handcart, a water trough, a stack of crab pots or roof tiles, a coil of rope. Vary them, give each one a cast shadow, and draw them at the size and position of the mark. They belong to the buildings and the wall they stand against: 0.4% of this crop, spanning 25%-61% across and 11%-37% down

NOT PRESENT IN THIS CROP AT ALL, and therefore MUST NOT BE DRAWN INTO IT:
  red-brown ROOF, the upper band of a building block
  the ONE GATE through the palisade

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

THE TOP EDGE OF THIS IMAGE IS ALREADY FINISHED ARTWORK, carried over from the tile drawn before this
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
