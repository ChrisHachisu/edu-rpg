Redraw this image at full detail as hand-drawn, hard-edged pixel art.

It is ONE NINTH of a top-down JRPG harbour town, tile (1,0) of a 3x3 grid, shown blurry because
it has been enlarged from a smaller rendering. Every building, street, fence, tree, boat, jetty and
patch of ground is ALREADY IN THE RIGHT PLACE at the right size. Reproduce all of it exactly where
it is. Do not move anything, do not resize anything, do not add a building, do not remove one, do
not redesign anything. Your only job is to draw what is here properly.

ONE THING IS MISSING FROM THE LAYOUT AND YOU MUST ADD IT. A STONE CHIMNEY on the big orange-tiled roof in the upper middle of this image. Its base sits on the roof slope at about pixel (900, 250), measuring from the top-left corner of this 1254x1254 image, and it stands straight up from there, about 64 pixels wide and 85 pixels tall, with its capped top at about (900, 165). Draw it as a square masonry stack of grey stone blocks with dark mortar lines, a slightly wider capstone with a dark open flue mouth, and a short hard-edged shadow falling down and to the right across the roof tiles beneath it. It sits ON the roof and does not touch the ground. No smoke, no glow. This is the single exception to
"do not add anything": everything ELSE is already in place and is only being drawn properly.

THE TOP EDGE OF THIS IMAGE IS ALREADY FINISHED ARTWORK, carried over from the tile
drawn before this one. Reproduce those 148 pixels EXACTLY -- same shapes, same colours, same
level of detail -- and continue that same drawing inward across the rest of the tile. Do not
restyle them, do not brighten them, do not reinterpret them. They are the join, and a visible
change across it is a failure.


OUTPUT: one RGB PNG the same pixel dimensions as the input. Print its absolute path on a line of
its own. Do not delete it and do not write anywhere under /tmp.

THE FINISH. Crisp definite boundaries between materials. Shading in discrete flat steps, two or
three values per material, dithering where a transition is needed. Individual roof tiles,
individual cobbles, individual planks, individual window panes, distinct leaf clumps. No airbrushed
gradients, no blur, no bloom, no soft focus, no photographic texture.

DRAW IT HARD; DO NOT FILTER A SOFT IMAGE TO FAKE IT. No sharpen, no unsharp mask, no posterize, no
palette reduction. A filtered attempt was rejected and it is measurable: filtering empties the
intermediate tones. Hand-drawn art of this kind measures, on the mean absolute luminance step
between neighbouring pixels, 26 or more overall, 34-52% of steps at 24 or above, and 22-40% of steps
between 4 and 20. That middle band is real shading inside shapes; keep it.

LIGHT AND PALETTE. One upper-left sun, short soft shadows, bright coastal daylight. Mean luminance
about 90. Do not darken, warm or cool it.
