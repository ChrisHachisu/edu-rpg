# Task: Port Sapphire — redraw the attached town at a hard, crisp finish. Same town.

The attached image is the shipped town. **Its design is approved and final.** Reproduce it. You are
not designing a town, not rearranging one, and not improving one. You are REDRAWING this exact
picture with a different rendering finish.

## OUTPUT

One RGB PNG, exactly **1950 x 1950**. Not any other size. Write it, print its absolute path on a
line of its own, do not delete it, do not write anywhere under /tmp.

The input is 1885 x 1885 and the output is 1950 x 1950 — the same picture, very slightly larger.
Every feature sits at the same place in the frame, scaled by 1.0345.

## WHAT MUST BE IDENTICAL — this is most of the task

- **Every building.** Same buildings, same count, same positions, same footprints, same heights,
  same roof shapes, same roof colours, same doors and windows on the same walls. The market stall
  with the blue-and-white striped awning stays exactly where it is and stays that shape. The
  herb-hung open-fronted building stays where it is. Do not add a building. Do not remove one. Do
  not move one by a single cell.
- **The street network.** The pale cobbled streets, the central square, the lanes and their
  junctions, all at the same widths and the same branch points. The game reads the streets out of
  this image to decide where the player may walk, so a lane drawn somewhere new silently changes
  where the player can go. This is the single easiest way to fail the task.
- **The harbour.** Same quay outline, same jetties in the same places, same boats, same moored
  sailing ship, same sea wall, same coastline.
- **The grass, the fences, the gardens, the trees** — same places, same shapes, same sizes.
- **The palette and the light.** Mean luminance about 90, blue/red ratio about 0.674, one upper-left
  sun, short soft shadows. Bright coastal daylight. Do not darken it, do not warm it, do not cool it.

If you are unsure whether to change something: do not change it.

## WHAT MUST CHANGE — the rendering finish, and only that

The shipped image is a soft PAINTING. In the game it is magnified 3x with nearest-neighbour
sampling, so every soft gradient becomes a large soft block and the whole town reads as mush beside
the player character, who is drawn crisply. That is the entire defect.

Redraw the same picture as **hand-drawn, hard-edged pixel art**:

- Crisp, definite boundaries between materials. A roof tile ends; it does not fade out.
- Shading in **discrete flat steps**, two or three values per material, with dithering where a
  transition is needed. No airbrushed gradients, no blur, no bloom, no photographic texture, no
  soft-focus anywhere.
- Detail that survives 3x magnification: individual roof tiles, individual cobbles, individual
  planks, individual window panes, distinct leaf clumps.

**Draw it hard. Do not FILTER a soft image to make it look hard.** Do not apply a sharpen, an
unsharp mask, a posterize or a palette reduction. A previous attempt did exactly that and was
rejected on sight, and it is measurable: filtering leaves the intermediate tones empty. On the mean
absolute luminance step between neighbouring pixels, hand-drawn art of this kind measures:

    mean step              26 or more     (the shipped painting is 11.7)
    steps of 24 or more    34% to 52%     (the shipped painting is 13.9%)
    steps between 4 and 20  22% to 40%    (the shipped painting is 47%; the FILTERED attempt
                                           collapsed to 9%, which is how it was caught)

That middle band is real shading INSIDE shapes — form, material, ambient occlusion. Hand-drawn art
keeps it and simply renders it in steps instead of smoothly. Emptying it is the signature of a
filter, and it is a failure.

## SCALE, WHICH THE INPUT ALREADY HAS RIGHT

Keep it. The player character is 68 px tall in the output. Buildings are 8 to 11 game cells wide,
one cell being 30 px. Nothing in the picture changes size relative to anything else.
