# Task: Port Sapphire town screen, v4 — fix five owner-flagged issues

Repo: /Users/christopherhachisu/Documents/claudecode/edu-rpg-map-engine-semantic-data
Previous attempt (scale approved, everything below still wrong): `design/act1-towns/portSapphire-screen-v3.png`

## Output
`design/act1-towns/portSapphire-screen.png`, exactly **1885 x 1885**, RGB.
65 x 65 world cells at 29 art px per cell. Do not output any other size.

## KEEP — the owner approved this in v3, do not regress it
Scale. The player is **65 art px** tall. Cottage ~196px, house/shop ~228px, inn ~293px.
About nine to eleven buildings across the width. A building must NEVER be near the player's
height. The town fills the map; the sea is a band along the south edge.

## THE FIVE FIXES

### 1. North edge: ONE exit, and plains
v3 gave the north edge dark forest and multiple ways out. The north margin must be **open
grassland/plains**, not forest, and there must be exactly **ONE trail reaching the north edge**.
West and east keep one trail each. Three exits total, one per edge. No fourth way out.
Keep the border margin to **2-3 cells** — v3 ran 4-6 cells deep, which ate the town.

### 2. Colour: match the overworld, which is BRIGHTER than v3
> STYLE-BLOCK OVERRIDE, owner-directed. `design/ART-DIRECTION.md`'s environment style block
> says "dark, dense, realistic old-growth ... deep forest shadows". That language is STALE — it
> predates the settled material overworld and is what pulled v3 too dark. Embed the style
> block's MATERIAL and COMPOSITION guidance, but IGNORE its tone/darkness language and use the
> measured targets below instead.

Measured from the settled overworld at Port Sapphire:

| | mean RGB | mean luminance |
|---|---|---|
| overworld (target) | (83, 96, 40) | **89.5** |
| v3 town (too dark) | (70, 72, 46) | 69.3 |
| v3 grass border (already correct) | (90, 102, 38) | 94.8 |

The grass border in v3 was RIGHT. The **town interior** is 20 luminance too dark and
desaturated to grey-green. Bring the built areas up to sit in the same daylight as that grass:
sunlit, clearly green where there is vegetation, warm where there is timber and earth. Keep the
single upper-left light source and real shadows, but shorter and lighter — this is a bright
coastal day, not dusk under a canopy.

### 3. Neatness and walkable clarity — the most important fix
The owner cannot tell where the player can walk. v3 scattered blocking clutter across the
ground everywhere. There will also be **NPCs standing in the town**, who need room.

- **Lanes are wide, clean and obvious: 3-4 cells (87-116 art px) of open, uncluttered ground.**
  A lane must read as a lane at a glance, with a continuous unobstructed path along it.
- **The square is generous and open** — a clear space several cells across, with room for
  people to stand around the well without blocking the way past.
- **Ground clutter belongs against walls and in corners, never in the middle of a lane or
  square.** Crates, barrels, nets, timber, carts, tools: tuck them tight against buildings and
  fences. Everything in the open middle of a walkable space is a defect.
- Fewer, larger, deliberate props. Not a scattering of small debris.
- Gardens, fences and hedges are fine but must clearly edge a space rather than speckle it.
- The overall read: a tidy working port that is swept, not a junkyard.

### 4. No stacked or overlapping buildings
In v3 a building on the right reads as two different houses stacked on top of each other. Every
building must read as ONE coherent structure with one roof mass and a consistent footprint.
Where buildings adjoin, make the join deliberate and legible; never let two roofs collide into
an ambiguous shape.

### 5. The shop and the healer — pre-determined, and usable from the street
Both front the **main square**, on opposite sides of it, each opening onto open walkable ground.
Neither is entered; the player talks to the keeper from the lane, so the interaction spot must
be obvious in the art.

**The shop** — ground floor opens to the square under a **wide awning**, with a **counter across
the full opening** and goods on display: barrels, sacks, crates, wares hung under the awning. It
must read as a shop instantly, from the building's shape alone. Leave the space directly in
front of the counter completely clear — that is where the player stands.

**The healer** — a **herbalist's porch**: bundles of drying herbs strung under the eaves, a
stone water basin, a low bench for waiting, planted pots. Warm and domestic, clearly NOT the
shop. Same rule: the ground in front of the porch stays completely clear.

Both buildings must be visually distinct from every ordinary house at a glance.

## Style continuity
`design/act1-towns/anchor/portSapphire-style-anchor-65.png` is the surrounding overworld terrain
at exactly this density — match its grass, water, grain, palette and daylight.

## Forbidden
- No people, animals, text, labels, numbers, signage with lettering, UI, borders, frames.
- No grid, no rectangular blocks, no repeated identical buildings, no straight ruled quay.
- No blocking clutter in the middle of lanes or the square. No building near player height.

## Return
Absolute path, exact dimensions, and confirm each of the five fixes in one line apiece,
including the measured mean luminance of your result (target ~90, v3 was 69).
If after 8 generation calls the lanes are still cluttered or the interior is still dark, STOP
and report rather than shipping another rejected frame.
