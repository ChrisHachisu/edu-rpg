DO THIS YOURSELF, one generation call, do not dispatch a sub-agent. Produce the image
and stop; do not review it, do not redraw it, do not ask another agent to improve it.

# Task: paint the portSapphire town screen, top-down, for a 2D JRPG

THREE images are attached.
- The FIRST is Port Sapphire, an ALREADY-APPROVED town from this same game: it is the STYLE, the
  DENSITY, the DAYLIGHT and the DRAWING QUALITY you must match, and it shows how completely a town
  should fill its frame. It is NOT the layout -- do not copy its harbour, its coastline or its
  street plan.
- The SECOND is the ACTUAL OVERWORLD GROUND this town stands on, cut from the shipped world map at
  this town's own coordinates. **The country around your village must be THAT country.** The player
  walks in off it, so grass that turns to forest at the town gate is a continuity error. Match its
  grass, its shrubs, its wildflowers and its stone.
- The THIRD is this town's overworld map icon: identity and rough character only. It is NOT an
  instruction about whether to draw a wall.

## OUTPUT
One RGB PNG, square. Print its absolute path on a line of its own. Do not write under /tmp.

## THE TOWN
a small coastal harbour town called portSapphire. A WORKING HARBOUR TOWN, the biggest settlement in the act and the busiest. Along its SOUTH side lies the SEA: a stone QUAY, timber JETTIES running out over the water, and small fishing BOATS moored against them. Nets, lobster pots, coiled rope, crates of catch and stacked barrels belong along the quay. It is a prosperous little port, not a fishing hamlet. It has NO enclosing wall of any kind -- it is an open town.

four townsfolk live here: a healer, a wise woman, a sailor and a trader, so there must be open ground for people to stand in without blocking the way.

## THE SHAPE OF IT -- this is the layout and it is yours to design
- **WHETHER THIS VILLAGE IS WALLED IS YOUR DECISION.** A timber palisade, a thorn hedge, a low
  stone wall, a ditch and bank, or no enclosure at all with the forest simply closing in around
  the houses -- choose whatever suits the place and draw it convincingly. Do not draw a wall
  because you think one is expected.
- **ONE WAY IN AND OUT, AT THE TOP (NORTH).** A single trail leaves the town and runs UP to
  the TOP edge of the picture. **That trail is the ONLY place any walkable ground may touch
  the edge of the frame** -- the game reads the way out of your picture, so a second
  opening anywhere is a second exit and is wrong. If you draw an enclosure, it is unbroken except
  where that trail passes through it. If you draw none, the surrounding country must close the town
  in on the other three sides so there is nowhere else to walk out.
- **THE VILLAGE FILLS THE PICTURE.** Leave a border of only TWO OR THREE CELLS of open ground
  between the outermost building or fence and the edge of the frame. The attached approved town
  fills 97% of its frame; a deep margin of scenery around a small cluster in the middle is the
  single most common way this task is failed, and it makes the town look like a model of itself.
  Spread the buildings across the WHOLE width and height, not into a clump at the centre.
- eleven or twelve buildings, packed close along the lanes the way a port is, arranged the way a real village grows -- not on a circle, not evenly spaced, not in
  a ring. Some close together facing a lane, some set back with a garden. It must look grown rather
  than laid out.
- A generous open COMMON or yard with a stone WELL, big enough for several people to stand around
  the well without blocking the way past.
- Around the village: OPEN SUNLIT GRASS MEADOW on the NORTH, EAST and WEST -- the same bright grass as the attached approved town, scattered with shrubs, wildflowers and the odd grey stone, with fenced cottage gardens at the edges. NOT forest. The SOUTH of the picture is open SEA.

## WALKABLE CLARITY -- the most important rule, and the game reads it out of your picture
**Every lane, the common and the trail out are PALE GREY COBBLED STONE -- the SAME stone as the
lanes in the attached approved town.** Look at it and match it: light grey, faintly warm, laid as
individual cobbles with darker mortar between them. NOT sand, NOT bare earth, NOT dirt, NOT a
tan or yellow track. This is not a style preference: the game finds the walkable ground by looking
for exactly that pale stone, so a sandy lane is a lane the player cannot walk down. Earth and grass
are what lies BESIDE the stone, never what the stone is made of.

That pale stone IS where the player may walk, and it must form ONE single connected network -- every
lane joined to the common, the common joined to the trail out. An isolated patch of stone is a
place the player can never reach.

- **Lanes are wide, clean and obvious: 3 to 4 cells (90 to 120 px) of open, uncluttered ground**,
  each reading as a lane at a glance with a continuous unobstructed path along it.
- **Ground clutter belongs against walls, in corners and along any fence or enclosure -- NEVER
  in the middle of a lane or the common.** Barrels, crates, firewood, sacks, a handcart, a trough,
  tools: tuck them tight against the building they belong to. Anything left standing in open
  walkable ground is a defect.
- Fewer, larger, deliberate props. Not a scattering of small debris.
- Gardens, fences and hedges may edge a space but must not speckle it.
- The read: a tidy working village that is swept, not a junkyard.

## BUILDINGS
- Every building reads as ONE coherent structure: one roof mass, one consistent footprint. Where
  two adjoin, make the join deliberate and legible. **Never let two roofs collide into an ambiguous
  shape, and never let two buildings sit so close that they read as one long building.** Leave
  clear ground between neighbours.
- Vary them: different widths, roof colours, roof pitches, door and window placement. No two
  identical.
- **TWO BUILDINGS ARE SERVICES AND THE GAME NEEDS BOTH.** They must be instantly distinct from
  every ordinary house AND from each other, and the ground directly in front of each must be left
  completely clear open stone -- that is where the player stands to be served.

  **THE SHOP.** Its ground floor opens onto the common under a WIDE AWNING, with a COUNTER running
  the full width of the opening and goods on display: barrels, sacks, crates, strings of wares hung
  under the awning, produce in baskets. It must read as a shop instantly from the building's shape
  alone, before anyone looks at the detail. Do not draw a door and call it a shop.

  **THE HEALER.** A herbalist's porch: bundles of drying herbs strung under the eaves, a stone water
  basin, a low bench for waiting, planted pots. Warm and domestic, and clearly NOT the shop.

## SCALE, WHICH IS FIXED
One cell is 30 px and the picture is 65 cells across. The player character is about 68 px tall --
just over two cells. A cottage is 8 to 11 cells wide. **No building may ever be near the player's
height.** About nine to eleven buildings would span the full width, which is why eleven or twelve buildings, packed close along the lanes the way a port is
leaves so much open ground.

## LIGHT AND COLOUR -- measured, because "bright" in prose has already failed twice
**This is BRIGHT MIDDAY. It is not evening, not overcast, and not under a canopy.** The attached
approved town measures mean luminance 90 out of 255 and you must land within a few points of
it. Two earlier attempts at this game's towns came back at 69 and 65 -- both looked like dusk beside
the approved town and both were rejected, so treat anything below 85 as a failed frame.

Concretely: open sunlit ground reads LIGHT, sunlit grass is a clear bright green rather than a deep
forest green, and shadows are SHORT and soft from a single upper-left sun. The forest around the
village is the darkest thing in the picture and even it must not swallow the frame. Match the
attached town's palette, its daylight and its blue/red balance of about 0.674.

## FINISH
Hand-drawn, hard-edged pixel art. Crisp boundaries between materials -- a roof tile ends, it does
not fade out. Shading in discrete flat steps, two or three values per material, dithered where a
transition is needed. Detail that survives 3x magnification: individual roof tiles, individual
cobbles, individual planks, individual window panes, distinct leaf clumps. No airbrushed gradients,
no blur, no bloom, no soft focus. **Draw it hard; do not filter a soft image to fake it.**

## NOTHING MAY OVERHANG THE GROUND THE PLAYER WALKS ON
The game draws this picture flat and then draws the player ON TOP of it, so anything in the art that
should pass IN FRONT of her cannot. Port Sapphire had to have a whole extra transparent layer cut
out of it because a ship's mast, a hanging demijohn and a roof ridge reached out over the lanes, and
the player appeared to stand on them.

So: keep every tall or projecting thing OVER ITS OWN BUILDING or over grass, never over stone the
player can walk on. No mast, no crane arm, no gantry, no hanging sign or lamp on a bracket, no
overhanging balcony, no branch, no roof eave or ridge extending across a lane or the common. Chimneys
sit on roofs, not over the street. Awnings may cover the shop's own counter but must not reach out
across the open common.

## FORBIDDEN
No people, no animals, no text, no labels, no numbers, no lettered signage, no UI, no borders or
frames. No grid. No rectangular blocks. No repeated identical buildings. No river, no stream, no
pond, no sea. No second way out of the village. No blocking clutter in the middle of a
lane or the common.
