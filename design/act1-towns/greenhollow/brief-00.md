DO THIS YOURSELF, one generation call, do not dispatch a sub-agent. Produce the image
and stop.

Redraw this image at full detail as hand-drawn, hard-edged pixel art.

It is one tile (0,0) of a 2x2 grid covering a small top-down JRPG forest village: stone-and-timber cottages, a market stall and a healer's cottage around a stone well on pale paving, a low fence at the edges, a rock outcrop at the top and woodland pressing in, shown blurry because it has been
enlarged from a smaller rendering. Every building, street, fence, tree, boat, jetty and patch of
ground is ALREADY IN THE RIGHT PLACE at the right size. Reproduce all of it exactly where it is. Do
not move anything, do not resize anything, do not add a building, do not remove one, do not redesign
anything. Your only job is to draw what is here properly.


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

LIGHT AND PALETTE. One upper-left sun, short soft shadows, warm late-morning daylight. THE INPUT'S OWN COLOUR IS THE
AUTHORITY: reproduce its greens, its paving, its roof colours and its water exactly as they are.
Its mean luminance is about 108; come back within a few points of that. Do not darken,
brighten, warm or cool it, and do not restyle the grass.
