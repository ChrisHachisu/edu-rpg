"""Write the Codex generation package for the Acts 2-5 towns (Act 1 method) into one folder.

    python3 codex_briefs.py <dest>      # default /mnt/project-files/edu-rpg/codex-gen

Layout of <dest>:
  briefs/town-<id>.md        one painted plate per town (best-of, run.sh repeats each up to N times)
  briefs/npc-<id>.md         that town's NPC walk sheets
  briefs/kit-*.md            palm / dead-tree crown sheets, cliff-panel kits
  anchors/*.png              every image a brief attaches (copied or cut here, never referenced outside)
  run.sh                     sequential codex exec, explicit -m, logs to out/run.log
Each brief carries the placeholder @@OUT@@ (absolute output path, filled by run.sh).
"""
import json
import os
import shutil
import sys

import numpy as np
from PIL import Image

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", ".."))
SCR = os.environ.get("CODEXGEN_SCRATCH",
                     "/tmp/claude-0/-home-claude/c446ac0c-2689-576d-8fff-6176ff6d9aad/scratchpad")
OW = os.path.join(SCR, "acts", "overworld")
GEN = os.path.join(SCR, "codexgen")
MODEL = "gpt-5.6-sol"

STYLE = "design/act1-towns/_anchor/style-anchor-portSapphire-accepted.png"
STYLE_NUM = "(whole accepted plate) mean pixel step 22.2, hard steps (>=24) 29.7%, soft steps (4-20) 38.8%"

# --------------------------------------------------------------------------- per-town content
TOWNS = {
    "ironkeep": dict(
        name="Ironkeep", act=2, slug="ironkeep", landmark_dir="act2",
        identity="""A MOUNTAIN MINING TOWN in deep snow. Grey granite, dark timber, steep snow-laden
roofs, smoke from forge chimneys. Its landmarks: the MINE MOUTH, a timber-propped adit cut into a
rock shoulder at the top right (north-east), with a short ore-cart track running from it; and the
FORGE, a big open-fronted smithy with a glowing hearth, an anvil and a quench trough, at the top
left. The shopkeeper is Gordo the blacksmith, so THE SHOP IS A WEAPON-AND-ARMOUR FORGE COUNTER
(see SHOP below) rather than a general store.""",
        layout="""The town climbs the slope in THREE TERRACES, each held up by a dry-stone retaining
wall about 2 cells high, running roughly east-west across the town at about one third and two
thirds of the way down. STONE STAIRS, 3 to 4 cells wide, climb each terrace wall: one flight on
the main north-south street and one more on each terrace at a side lane. Top terrace: the mine
mouth (north-east) and the forge (north-west) with a forge yard between them. Middle terrace:
houses on a bending lane. Bottom terrace: the open yard with the save spot just north of the
centre, the healer on the west, the shop on the east, and the street leaving SOUTH through the
gate. A smelter shed with a tall stone chimney stands at the bottom right.""",
        border="snow-covered granite crags and a few snowy pines close the town in on the west, north "
               "and east; the open snowfield of the attached overworld lies to the south",
        lanes="dark grey granite setts with packed snow in the joints, clearly darker and greyer "
              "than the white snow beside them",
        npcs=[("healer", "the town healer"), ("soldier", "a soldier guarding the mountain pass"),
              ("blacksmith", "a blacksmith who knows the Iron Mine"), ("gordo", "Gordo, the forge's shopkeeper")],
        lights="forge glow, lit windows, a brazier in the forge yard"),
    "frostwatch": dict(
        name="Frostwatch", act=2, slug="frostwatch", landmark_dir="act2",
        identity="""A WALLED WATCH-POST on a snowfield: a garrison town. Its landmark is the
WATCHTOWER, a tall square stone tower with a crenellated top and a lit window, standing on the
north wall at the centre. A stone CURTAIN WALL with a walkway and merlons encloses the town on
all four sides; the GATEHOUSE, two squat towers flanking a 4-cell opening, is in the middle of the
SOUTH wall. Inside: a parade ground, a long barracks, a frozen pond with a stone rim.""",
        layout="""The curtain wall follows the frame about 3 cells in from every edge. One broad street
runs from the south gatehouse straight up to the watchtower; a cross street runs east-west at
about one third of the way down. The PARADE GROUND, an open paved square about 10 cells across,
sits in the middle of the town on that street with the save spot on it. Shop on the north-east
of the cross street, healer at the bottom left, barracks along the west wall, the frozen pond in
the east half. Lamp posts at the street corners.""",
        border="the wall itself is the edge; outside it, a 2-3 cell strip of the attached snowfield",
        lanes="grey dressed-stone paving swept clear, clearly darker than the snow",
        npcs=[("healer", "the healer"), ("frostElder", "the Frost Elder"), ("frostGuard", "a wall guard"),
              ("mountaineer", "a mountaineer"), ("frostVillager", "a villager")],
        lights="lit tower window, lamp posts, warm windows"),
    "hauntedVillage": dict(
        name="Ravenhollow", act=2, slug="ravenhollow", landmark_dir="act2",
        identity="""A CROOKED VILLAGE at the edge of a haunted forest, at dusk under a pale overcast
sky, light snow on the ground. Leaning timber houses with crooked roofs, a small stone CHAPEL with
a bell-cote, and on the east side a fenced GRAVEYARD of tilted headstones among LEAFLESS DEAD
TREES. Iron lanterns light the lanes; every house has a warm candle-lit window. Spooky but
friendly for children: no skulls, no blood, no ghosts.""",
        layout="""No straight streets: lanes WIND and KINK, meeting at odd angles. Houses sit at
slightly different angles and set-backs. The graveyard occupies the east-centre behind a low
picket fence with a lych-gate onto the lane. The chapel stands north-west. The save spot is in a
small irregular square just south of the centre. Shop on the east above the graveyard, healer
bottom left. One lane leaves SOUTH to the gate.""",
        border="a dense dark dead-and-evergreen forest presses in on west, north and east (match the "
               "attached overworld's dark forest)",
        lanes="uneven grey cobbles with snow in the joints, clearly darker than the snowy ground",
        npcs=[("healer", "the healer"), ("hauntedElder", "Elder Thorne"), ("hauntedGuard", "a village guard"),
              ("hauntedVillager", "a villager")],
        lights="lanterns on posts along the lanes, candle-lit windows, a lantern at the lych-gate"),
    "oasisHaven": dict(
        name="Oasis Haven", act=3, slug="oasis-haven", landmark_dir="act3",
        identity="""A DESERT BAZAAR TOWN built round a spring-fed OASIS POND. Sandstone and adobe
houses with flat roofs and some domes, striped cloth awnings, date PALMS in clumps round the pond,
reed beds at the water's edge, canvas market stalls and a couple of nomad tents.""",
        layout="""The POND, about 14 by 10 cells with a natural reedy edge and a stone landing on one
side, sits in the CENTRE. A broad paved LOOP ROAD runs all the way round it, 3-4 cells wide, with
palms between road and water. Buildings face inward onto the loop from all sides. The save spot is
on the loop south of the pond. Shop on the east side of the loop (a bazaar counter under a striped
awning), healer bottom left, a second market stall on the west. One road leaves SOUTH to the gate.""",
        border="low sandstone ridges and dunes close the town in on west, north and east",
        lanes="pale sandstone flagstones, clearly smoother and lighter-edged than the loose sand",
        npcs=[("healer", "the healer"), ("oasisElder", "the oasis elder"), ("archaeologist", "an archaeologist"),
              ("luna", "Luna, a star-reader")],
        lights="none needed: bright desert midday"),
    "ruinsCamp": dict(
        name="Ruins Camp", act=3, slug="ruins-camp", landmark_dir="act3",
        identity="""AN EXCAVATION CAMP among ancient ruins in a red sandstone canyon. A rectangular
DIG PIT with stepped earth sides, ladders and string grid lines; two rows of BROKEN COLUMNS (a
ruined colonnade) flanking the main way; low crumbling ruin walls; canvas TENTS of the
archaeologists; a timber DIG OFFICE hut; crates of finds and sieves stacked against walls.""",
        layout="""The canyon's red rock walls close in on west, north and east. The dig pit (about
18 by 12 cells) fills the west-centre. The main way runs from the south gate north between the
two colonnades to the dig office at the top centre. The save spot is on the main way just south
of the centre. Shop (a supply tent-stall with a counter) on the east, healer bottom left, tents
scattered on open ground to the east.""",
        border="red-orange sandstone mesa cliffs, matching the attached overworld",
        lanes="packed pale earth and old paving stones, clearly lighter than the red-tan sand",
        npcs=[("healer", "the camp medic"), ("explorer", "an explorer"), ("mercenary", "a mercenary")],
        lights="none needed: bright desert day"),
    "embersRest": dict(
        name="Ember's Rest", act=4, slug="embers-rest", landmark_dir="act4",
        identity="""A BASALT-AND-TIMBER TOWN beside living lava. Black basalt walls, dark timber,
heavy slate roofs, ember-orange light. Its landmark: a natural LAVA CHANNEL crossing the whole town
east-west, and two STONE BRIDGES over it. A big FORGE (the Forgemaster's) with a glowing hearth on
the north-west. Iron braziers along the main street.""",
        layout="""The lava channel, 2 to 4 cells wide (wider in pools), runs across the town at about the middle, with
a raised black-basalt rim on both banks. Bridge one carries the main north-south street over it in
the centre; bridge two crosses on the west. North of the channel: the forge, houses, a mine-office.
South of it: the yard with the save spot just north of the south half's centre, the healer bottom
left, the shop on the east. The street leaves SOUTH to the gate.""",
        border="the red sandstone mesa cliffs and black basalt crags of IMAGE 2 close the town in on "
               "west, north and east (this town sits where the red desert meets the volcanic fields: "
               "the open ground is IMAGE 2's tan sand dusted with dark ash, not pure black)",
        lanes="dark grey basalt flagstones, clearly darker and greyer than the tan sand ground",
        npcs=[("healer", "the healer"), ("forgemaster", "the Forgemaster"), ("lavaMiner", "a lava miner")],
        lights="the lava glow, the forge hearth, braziers, warm windows"),
    "cinderwatch": dict(
        name="Cinderwatch", act=4, slug="cinderwatch", landmark_dir="act4",
        identity="""A FORTIFIED WATCH TOWN on an ash plain under a volcano. Black basalt walls, dark
timber, a tall stone WATCHTOWER with a beacon fire on top at the north centre, a curved defensive
WALL along the north, and a LAVA MOAT across the south crossed by a stone bridge at the gate.""",
        layout="""The curved north wall with merlons runs from the west edge to the east edge with the
watchtower at its centre. The lava moat, 2 to 4 cells wide, runs across the bottom of the town
about 6 cells above the south edge; the GATE BRIDGE crosses it in the centre and the street runs
north to the tower. Houses on both sides of the street; the save spot on a small square at the
centre; healer bottom left above the moat; shop on the east.""",
        border="black basalt crags close the west and east sides; the wall closes the north",
        lanes="grey basalt flagstones, clearly lighter than the black ash ground",
        npcs=[("healer", "the healer"), ("watchCaptain", "the watch captain"), ("ashScout", "an ash scout"),
              ("cinderVillager", "a villager")],
        lights="the beacon on the tower, the lava glow, braziers, warm windows"),
    "lastBastion": dict(
        name="Last Bastion", act=5, slug="last-bastion", landmark_dir="act5",
        identity="""A REAL FORTRESS TOWN, the last stronghold before the Demon King. An OCTAGONAL
RING of thick grey stone curtain wall with a walkway and merlons; a GATEHOUSE of two round towers
in the middle of the SOUTH wall; a squat tower at each of the four corners; and a stone KEEP at the
north centre. A straight MUSTER ROAD from gate to keep, lined both sides with iron BRAZIERS.""",
        layout="""The wall ring follows the frame about 3 cells in, with the four corners cut off
(an octagon). The muster road runs straight north from the gatehouse to the keep, 4 cells wide.
A cross street at about one third and another at about two thirds of the way down. The save spot
is on a paved square on the muster road at the centre. Shop on the east, healer at the bottom
left; houses and an armoury against the walls.""",
        border="the wall itself is the edge; outside it, a 2-3 cell strip of the attached dead ground",
        lanes="grey dressed-stone paving, clearly lighter than the dark dead earth",
        npcs=[("healer", "the healer"), ("veteran", "an old veteran"), ("priestess", "a priestess")],
        lights="the braziers along the muster road, lit tower windows, warm windows"),
    "havensEdge": dict(
        name="Haven's Edge", act=5, slug="havens-edge", landmark_dir="act5",
        identity="""A CLIFF-EDGE HAMLET at the end of the world. The north-east third of the picture
is a sheer CLIFF dropping into a starry purple VOID (the edge of the world): a crumbling rock lip
with a visible rock face below it, and the void beyond. A handful of stout stone houses with dark
roofs cling to the south-west, a lookout lamp post on the promontory, a few leafless dead trees
and a tiny graveyard of three headstones.""",
        layout="""The cliff edge runs diagonally from the top centre down to the right edge at about
two thirds of the way down. The main street comes north from the south gate, a cross street runs
east-west at about one third of the way down toward the promontory. Save spot on a small square at
the centre; shop on the east just inside the cliff edge; healer bottom left; houses spread over the
south-west two thirds.""",
        border="dark grey dead-stone crags close the west and south-west; the void closes the north-east",
        lanes="grey cobbles, clearly lighter than the dark dead earth",
        npcs=[("healer", "the healer"), ("grizzledKnight", "a grizzled knight"), ("prophetess", "a prophetess"),
              ("kiki", "Kiki (ALREADY EXISTS: reuse greenhollow-kiki, do not draw)")],
        lights="the lookout lamp, lamp posts, warm windows"),
}

MAGMA = """
## MAGMA — it must look NATURAL, the owner rejected flat orange strips
Draw lava the way it really behaves, in pixel art:
- It flows in a **channel sunk into BLACK BASALT**, with a raised, cracked basalt rim on both banks
  (darker rock, broken blocks, a lit upper edge). Never a flat orange ribbon on flat ground.
- Most of the surface is **COOLED CRUST**: dark grey-black plates and rafts, cracked into
  irregular polygons, drifting. The **glow shows in the CRACKS between plates** and in a few open
  pools: deep red at depth, orange, and small yellow-white hot spots only where it is brightest.
- The glow lights the rim and the nearby ground (a warm orange bounce on rock faces and walls
  facing the channel), falling off within 2-3 cells.
- Banks are irregular and natural, not ruled lines. A little steam or heat haze over the hottest
  pool is fine; no smoke covering the town.
- Lava is NOT walkable. Bridges are solid dressed-stone arches with parapets.
"""

TOWN_BRIEF = """DO THIS YOURSELF, one generation call, do not dispatch a sub-agent. Produce the image
and stop; do not review it, do not redraw it, do not ask another agent to improve it.

# Task: paint the {name} town screen, top-down, for a 2D JRPG (Act {act})

FOUR images are attached, in this order, and they do different jobs.
- IMAGE 1 is a native-resolution crop (about 41 x 41 cells) of Port Sapphire, an ALREADY-APPROVED
  town from this same game. It sets the STYLE, the DRAWING DENSITY and the FINISH, pixel for pixel.
  It is NOT the layout and NOT the palette: do not copy its harbour, its green grass or its streets.
- IMAGE 2 is the ACTUAL OVERWORLD GROUND this town stands on, cut from this act's world map at the
  town's own coordinates, at exactly this picture's scale (65 cells across). **The country around
  the town must be THAT country**: its ground, rock, trees, palette and daylight. The player walks
  in off it, so a change of ground at the gate is a continuity error. Every building material must
  also belong to that country -- buildings that do not match the terrain are the reason the
  previous version of this town was rejected.
- IMAGE 3 is the LAYOUT GUIDE: a flat colour-key diagram of this town. It shows roughly WHERE
  things go (pale grey = walkable lanes and squares, coloured blocks = roofs, brown = building
  fronts, RED roof = the shop, GREEN roof = the healer, dark slate = walls, other flat colours =
  water/lava, cliffs, trees). Follow its arrangement; its flat colours are a key, NOT a palette.
- IMAGE 4 is this town's overworld map icon: identity and rough character only.

## OUTPUT
One RGB PNG, square, at the generator's native size. Write it to exactly this path:
    @@OUT@@
and print that absolute path on a line of its own. Do not resize, sharpen, posterize or
palette-reduce it. Do not write anywhere under /tmp and nowhere else in the filesystem.

## THE TOWN
{identity}

## THE SHAPE OF IT -- follow IMAGE 3
{layout}

- **ONE WAY IN AND OUT, AT THE BOTTOM (SOUTH)**, toward the overworld. A single street runs DOWN
  to the BOTTOM edge at the horizontal centre. **That is the ONLY place walkable ground may touch
  the edge of the frame**; a second opening anywhere is a second exit and is wrong. The other three
  sides are closed by: {border}.
- **THE TOWN FILLS THE PICTURE.** Only TWO OR THREE CELLS of surrounding country between the
  outermost building or wall and the frame. The approved town fills 97% of its frame.

## WALKABLE CLARITY -- the most important rule, and the game reads it out of your picture
Every street, square and the way out is **{lanes}.** That paving IS where the player may walk, and
it must form ONE connected network.
- **Lanes are wide, clean and obvious: 3 to 4 cells (90 to 120 px) of open, uncluttered paving**,
  each with a continuous unobstructed path along it. The gate opening and the main street are at
  least 4 cells wide.
- **Ground clutter belongs against walls, in corners and along fences -- NEVER in a lane or a
  square.** Barrels, crates, sacks, carts, tools: tight against the building they belong to.
- Fewer, larger, deliberate props. A tidy town that is swept, not a junkyard. NPCs will stand in
  the streets and need room.

## BUILDINGS
- Every building reads as ONE coherent structure: one roof mass, one footprint, a door on the
  down-screen (south) facade, windows. Never two roofs colliding into an ambiguous shape; leave
  clear ground between neighbours.
- Vary them: widths, roof pitches, roof materials within this country's palette. No two identical.
- **Materials come from IMAGE 2's country**: {materials}
- **TWO BUILDINGS ARE SERVICES AND THE GAME NEEDS BOTH.** Instantly distinct from every house and
  from each other; the ground directly in front of each is left completely clear paving -- that is
  where the player stands to be served.
  **THE SHOP.** {shop}
  **THE HEALER.** A healer's porch: bundles of drying herbs under the eaves, a stone water basin, a
  low bench, planted pots{healer_extra}. Warm and domestic, clearly NOT the shop.
{magma}
## SCALE, WHICH IS FIXED
One cell is 29 px and the picture is 65 cells across (1885 px at final size). The player is about
65 px tall -- just over two cells. A cottage is about 196 px wide, a house or the shop about 228 px,
the largest building about 293 px. **No building may ever be near the player's height.** About nine
to eleven buildings would span the full width.

## LIGHT AND COLOUR -- measured, because adjectives have failed before
IMAGE 2, the country this town stands in, measures **mean RGB {rgb}, mean luminance {lum}, blue/red
ratio {br}**. The town must sit in that SAME light: mean luminance within 8 of {lum}, the same
blue/red balance within 0.08. Do not darken the town below its own country and do not wash it out.
One upper-left light source, short shadows. Lit accents are welcome and help the darker towns read:
{lights}.

## FINISH
Hand-drawn, hard-edged pixel art at IMAGE 1's density: individual roof tiles, stones, planks,
window panes, leaf or needle clumps, cracks. Crisp boundaries between materials; shading in
discrete steps, two to four values per material, dithered where a transition is needed. No
airbrushed gradients, no blur, no bloom, no soft focus. **Draw it hard; do not filter a soft image
to fake it** (no sharpen, no posterize, no palette reduction).
IMAGE 1 measures {style_num}. Target at least mean step 20, hard steps 26%, and keep 22-40% of
steps in the 4-20 band (real shading inside shapes).

## NOTHING MAY OVERHANG THE GROUND THE PLAYER WALKS ON
The game draws this picture flat and draws the player ON TOP of it. Keep every tall or projecting
thing over its own building, wall or rough ground, never over paving: no crane arm, no hanging sign
on a bracket, no balcony, no branch, no eave reaching across a lane. Awnings cover only the shop's
own counter.

## FORBIDDEN
No people, no animals, no text, no labels, no numbers, no lettered signage, no UI, no borders or
frames. No grid. No repeated identical buildings. No second way out. No blocking clutter in a lane
or square. No building near player height. Nothing from IMAGE 1's harbour.

## RETURN
The absolute path, the pixel dimensions, and one line each: the measured mean RGB and mean
luminance of your image (target luminance {lum} +/- 8, blue/red {br} +/- 0.08), the one south
exit, shop and healer present with clear ground in front, and lane width. If a rule could not be
met, say which.
"""

MATERIALS = {
    2: "grey granite and fieldstone walls, dark weathered timber, steep roofs of dark slate or shingle "
       "carrying thick snow (snow sits ON the roof slopes and ridges, never spilling past the eaves "
       "onto walls)",
    3: "sandstone and adobe in the overworld's red-orange and tan, flat roofs and a few domes, wooden "
       "lintels, striped cloth awnings in faded reds and indigo",
    4: "black basalt blocks, dark charred timber, heavy dark slate roofs with ash on them, iron fittings, "
       "ember-orange light on the faces toward the lava",
    5: "dark grey dead-stone, old weathered timber, dark slate roofs, iron; cold violet-grey palette "
       "with warm window light as the only warmth",
}
SHOP = {
    "ironkeep": "Gordo's FORGE COUNTER: an open-fronted smithy ground floor under a heavy timber canopy "
                "with a COUNTER across the full opening, swords, shields and helmets on racks behind it, "
                "a glowing hearth inside. Reads as an arms shop instantly.",
}
SHOP_DEFAULT = ("Its ground floor opens onto the street under a WIDE AWNING, with a COUNTER across the "
                "full opening and goods on display: barrels, sacks, crates, wares hung under the awning. "
                "It reads as a shop from its shape alone. Do not draw a door and call it a shop.")


def measure(p):
    a = np.asarray(Image.open(p).convert("RGB")).astype(float)
    m = a.reshape(-1, 3).mean(0)
    L = 0.2126 * a[..., 0] + 0.7152 * a[..., 1] + 0.0722 * a[..., 2]
    return [int(round(v)) for v in m], round(float(L.mean()), 1), round(float(m[2] / m[0]), 2)


def on_magenta(src, dst, size=None):
    a = Image.open(src).convert("RGBA")
    bg = Image.new("RGBA", a.size, (255, 0, 255, 255))
    bg.alpha_composite(a)
    im = bg.convert("RGB")
    if size:
        im = im.resize(size, Image.LANCZOS)
    im.save(dst)


def main(dest):
    B, A = os.path.join(dest, "briefs"), os.path.join(dest, "anchors")
    for d in (B, A, os.path.join(dest, "out")):
        os.makedirs(d, exist_ok=True)
    # native-resolution crop (density is a per-pixel property; the full plate is 8.7 MB, over the
    # project folder's ~4 MB file limit)
    Image.open(os.path.join(ROOT, STYLE)).convert("RGB").crop((375, 175, 1575, 1375)).save(
        os.path.join(A, "style-portSapphire-accepted.png"), optimize=True)
    jobs = []
    for tid, t in TOWNS.items():
        ow = os.path.join(A, f"{tid}-overworld-65.png")
        Image.open(os.path.join(GEN, f"{tid}-overworld-anchor-65.png")).resize((1040, 1040), Image.LANCZOS).save(
            ow, optimize=True)                                  # 65 cells at 16 px (the game's world px)
        shutil.copy(os.path.join(GEN, f"{tid}-layout-guide.png"), os.path.join(A, f"{tid}-layout-guide.png"))
        lm = os.path.join(OW, t["landmark_dir"], "landmarks", t["slug"] + ".png")
        on_magenta(lm, os.path.join(A, f"{tid}-icon.png"))
        rgb, lum, br = measure(ow)
        lava = tid in ("embersRest", "cinderwatch")
        brief = TOWN_BRIEF.format(
            name=t["name"], act=t["act"], identity=t["identity"], layout=t["layout"], border=t["border"],
            lanes=t["lanes"], materials=MATERIALS[t["act"]], shop=SHOP.get(tid, SHOP_DEFAULT),
            healer_extra=", a lantern" if t["act"] in (4, 5) or tid == "hauntedVillage" else "",
            magma=MAGMA if lava else "", rgb=tuple(rgb), lum=lum, br=br, lights=t["lights"], style_num=STYLE_NUM)
        open(os.path.join(B, f"town-{tid}.md"), "w").write(brief)
        jobs.append(("town", tid, f"briefs/town-{tid}.md",
                     ["anchors/style-portSapphire-accepted.png", f"anchors/{tid}-overworld-65.png",
                      f"anchors/{tid}-layout-guide.png", f"anchors/{tid}-icon.png"]))
    npc_jobs(dest, jobs)
    kit_jobs(dest, jobs)
    json.dump([{"kind": k, "id": i, "brief": b, "images": im} for k, i, b, im in jobs],
              open(os.path.join(dest, "jobs.json"), "w"), indent=1)
    write_run(dest, jobs)


# --------------------------------------------------------------------------- NPCs
NPC_LOOK = {
    "ironkeep": {
        "healer": "female mountain healer, thick fur-lined grey-blue wool coat over a long skirt, knitted shawl, "
                  "a satchel of herbs and a steaming copper kettle in one hand. Dominant hue slate blue.",
        "soldier": "male pass guard, padded tabard in Ironkeep iron-grey with a red stripe, fur cloak collar "
                   "(no cape), a long spear held upright, a round fur cap. Dominant hue iron grey and red.",
        "blacksmith": "female smith's apprentice, leather apron over a rust-brown shirt, rolled sleeves, soot "
                      "on the cheek, short cropped hair, a pair of tongs. Dominant hue rust brown.",
        "gordo": "Gordo, the SHOPKEEPER and master blacksmith: very broad bald man, huge black beard, thick "
                 "leather apron, bare muscular arms, a big hammer on his shoulder. The broadest silhouette. "
                 "Dominant hue leather brown with soot black.",
    },
    "frostwatch": {
        "healer": "female, white wool hooded coat with a green cross-stitched trim, mittens, a basket of "
                  "bandages. Dominant hue white and moss green.",
        "frostElder": "male elder, long fur-trimmed indigo robe, long white beard and eyebrows, a carved "
                      "walking stick topped with an ice crystal. Dominant hue deep indigo.",
        "frostGuard": "female wall guard, steel cap, quilted blue gambeson, fur collar, a halberd held "
                      "upright. Dominant hue steel blue.",
        "mountaineer": "male, rope coils over both shoulders, ice axe, goggles pushed up on a woolly hat, "
                       "big boots, red scarf. Dominant hue red with tan.",
        "frostVillager": "young woman in a knitted mustard sweater and long brown skirt, ear muffs, "
                         "carrying a bundle of firewood. Dominant hue mustard.",
        "shopkeeper": "plump cheerful trader in a quilted teal coat and fur hat, holding a lantern and a "
                      "ledger. Dominant hue teal.",
    },
    "hauntedVillage": {
        "healer": "female, dark plum dress with a cream apron, a lantern and a bundle of dried lavender, "
                  "silver hair in a bun. Dominant hue plum.",
        "hauntedElder": "Elder Thorne: tall thin old man, long charcoal coat, a tall hat (not pointed), a "
                        "gnarled walking stick with a small lantern hanging from it. Dominant hue charcoal.",
        "hauntedGuard": "male village watchman, dark green tabard, leather cap, a lantern held high and a "
                        "short pole. Dominant hue forest green.",
        "hauntedVillager": "young man with a mop of hair, patched brown jacket, a woven basket of "
                           "mushrooms. Dominant hue warm brown.",
        "shopkeeper": "old woman shopkeeper, black shawl with a mauve dress, round spectacles, a black "
                      "cat-shaped bag (not a real cat). Dominant hue mauve.",
    },
    "oasisHaven": {
        "healer": "female, flowing sand-coloured robe with turquoise sash, head wrap, a water skin and a "
                  "clay jar of salve. Dominant hue turquoise on sand.",
        "oasisElder": "male elder, white robe and turban with a gold band, long grey beard, a staff topped "
                      "with a palm frond. Dominant hue white and gold.",
        "archaeologist": "female, khaki shirt and trousers, pith helmet, a brush and a notebook, "
                         "satchel. Dominant hue khaki.",
        "luna": "Luna the star-reader: young woman, deep blue robe scattered with small gold stars, a "
                "crescent-moon pendant, a small brass astrolabe. Dominant hue midnight blue.",
        "shopkeeper": "bazaar merchant, striped red-and-cream robe, a fez-like cap, a rolled carpet under "
                      "one arm. Dominant hue red stripe.",
    },
    "ruinsCamp": {
        "healer": "camp medic, rolled-sleeve cream shirt, red armband, a canvas medical bag. Dominant hue cream "
                  "with red.",
        "explorer": "male explorer, wide-brimmed leather hat, long brown duster coat (not a cape), a coiled "
                    "rope and a map. Dominant hue brown leather.",
        "mercenary": "female mercenary, short dark-red jacket, leather bracers, a crossbow on her back "
                     "(no sword, no shield), a bandana. Dominant hue dark red.",
        "shopkeeper": "quartermaster in a canvas apron with many pockets, a clipboard, spectacles on his "
                      "forehead. Dominant hue olive canvas.",
    },
    "embersRest": {
        "healer": "female, ash-grey robe with an ember-orange sash, a clay bowl of soothing salve, short "
                  "dark hair. Dominant hue ash grey with orange.",
        "forgemaster": "huge old male smith, heat-blackened leather apron, thick gloves, long grey braided "
                       "beard, goggles on his brow, a giant pair of tongs. Dominant hue charred leather.",
        "lavaMiner": "male miner, helmet with a lamp, soot-streaked orange overalls, a pickaxe over the "
                     "shoulder. Dominant hue orange.",
        "shopkeeper": "trader in a dark red apron over a black shirt, carrying a tray of potion bottles "
                      "and a small lantern. Dominant hue dark red.",
    },
    "cinderwatch": {
        "healer": "male healer, grey-green robe, a satchel of bandages, calm, with a lantern. Dominant hue "
                  "grey-green.",
        "watchCaptain": "female watch captain, blackened steel breastplate over a dark red tunic, a helmet "
                        "with a plume, a signal horn. No sword, no shield. Dominant hue dark red.",
        "ashScout": "young male scout, hooded ash-grey cloak worn as a short mantle (not a cape), face "
                    "scarf, a spyglass. Dominant hue ash grey.",
        "cinderVillager": "woman with a broom and a bucket of ash, rust-coloured headscarf, patched "
                          "apron. Dominant hue rust.",
        "shopkeeper": "stout trader with a soot-stained leather vest and goggles, holding a crate of "
                      "supplies. Dominant hue leather brown.",
    },
    "lastBastion": {
        "healer": "female battle-nurse, white tabard with a blue cross, a field kit, hair braided. "
                  "Dominant hue white and blue.",
        "veteran": "old male veteran, dented iron breastplate over a faded green tunic, eye patch, grey "
                   "moustache, leaning on a crutch-staff. No sword, no shield. Dominant hue faded green.",
        "priestess": "young priestess, long white-and-gold robe, a golden sun circlet, holding a glowing "
                     "prayer lamp. Dominant hue white and gold.",
        "shopkeeper": "armourer-quartermaster, chainmail vest, leather apron, a stack of helmets in his "
                      "arms. Dominant hue steel and leather.",
    },
    "havensEdge": {
        "healer": "female, dusky violet dress, star-shaped hairpin, a lantern and a cup of tea on a "
                  "saucer. Dominant hue dusky violet.",
        "grizzledKnight": "big scarred knight, battered black plate armour, helmet tucked under one arm, "
                          "grey stubble; no sword in hand, no shield, no cape. Dominant hue black steel.",
        "prophetess": "old woman, layered deep teal robes with silver embroidery, eyes closed, a crystal "
                      "orb held in both hands. Dominant hue deep teal.",
        "shopkeeper": "travelling pedlar with a huge backpack of goods, a wide hat, patched coat. "
                      "Dominant hue patched tan.",
    },
}

NPC_BRIEF = """DO THIS YOURSELF, one generation call per image, do not dispatch a sub-agent. Generate the
images, write them, print their paths, and stop. Do not analyse or redraw them afterwards.

# Task: {name} NPC walk sheets -- {n} characters, matching the attached Act 1 heroine

{name} is an Act {act} town ({setting}). These characters stand in the same town screen as the
player and must look like they came from the same hand as she did.

## THE ATTACHED IMAGES ARE THE CONTRACT
- IMAGE 1, the Act 1 heroine walk sheet: **the style, proportion, density and scale anchor.** Match
  her exactly.
- IMAGES 2 and 3, two ACCEPTED NPC sheets from Act 1 in the exact layout you are producing. Match
  their finish.

## THE FINISH RULE -- the one thing an earlier batch was rejected for
**No black keyline. No near-black keyline. No uniform dark contour of any kind** tracing the
silhouette, at any width. The edge is the form's own colour going a shade or two darker where it
turns from the light, as on the heroine. Dark accents (boot soles, hat-brim shade, a belt) are
materials where they belong, not a ring round the figure. Internal shapes separate by value and hue,
not black lines. Silhouette edges softly anti-aliased into the magenta, no hard 1 px cut.
Measured: the outermost opaque pixel ring must sit within about 20 luminance of the mean body
luminance (the rejected batch was 60-95 below). This is checked mechanically.

## LAYOUT -- one PNG per character
A **3 columns x 4 rows grid of twelve walk frames** on a **flat pure magenta (255, 0, 255)** field.
- Rows, in order: 0 down / toward camera, 1 left, 2 right, 3 up / away.
- Columns: 0 leading-foot contact, 1 passing pose, 2 opposite-foot contact.
- Same size in all twelve cells, feet on a shared baseline, each figure centred in its cell.
- **Clear magenta gutters between every row and column and a magenta margin round the grid.**
  Nothing touches another cell or the border; the grid is cut apart automatically.
- **Author left and right separately -- never mirror one to make the other.**
- No pure magenta in the artwork. No text, labels, numbers, borders, frames, grid lines, ground or
  drop shadows.

## STYLE -- locked
- **Chibi JRPG proportions, non-negotiable.** Big head, compact rounded body, short limbs, about
  2-3 heads tall. Match the heroine precisely.
- **Smooth faux-pixel illustration**: chunky pixel-textured strokes, crisp forms, soft painterly
  transitions, NO contour line. Not grid-true pixel art; no grid quantization.
- Stepped shading, 2-4 tones per hue. One dominant hue family plus one or two accents each.
- Single top-left light. 3/4 top-down field perspective. Warm, bright, readable; SNES Dragon Quest /
  Toriyama tradition; kid-friendly, never babyish.

## THE CHARACTERS
Each readable from the others **by silhouette alone**; none may read as the heroine (high brown
ponytail, silver-grey armour, cobalt cape, sword, shield). **No NPC carries a sword, a shield or a
cape.** Their clothes belong to this town's climate ({climate}).

{chars}

## OUTPUT -- exactly {n} PNG files, at these exact paths
{paths}

Write each at the generator's **native output resolution**. Do NOT resize, upscale, posterize,
sharpen, quantize or convert to indexed colour; a deterministic step reduces them to 192 x 256.
Write nowhere else. Print the {n} absolute paths, one per line.
"""
SETTING = {"ironkeep": "a snowy mountain mining town", "frostwatch": "a walled snowy watch-post",
           "hauntedVillage": "a crooked village by a haunted forest", "oasisHaven": "a desert oasis bazaar",
           "ruinsCamp": "an excavation camp in a red canyon", "embersRest": "a basalt town beside lava",
           "cinderwatch": "a fortified watch town on an ash plain", "lastBastion": "the last fortress",
           "havensEdge": "a hamlet on the cliff at the edge of the world"}
CLIMATE = {2: "deep snow and cold: wool, fur trims, hats, scarves", 3: "hot desert: light robes, head "
           "wraps, sun hats", 4: "volcanic heat and ash: leather, soot, heat-proof gear",
           5: "a cold dead land under a dark sky: heavy, sombre cloth with one warm accent"}


def npc_jobs(dest, jobs):
    A = os.path.join(dest, "anchors")
    shutil.copy(os.path.join(ROOT, "public/act1-hifi/hero-g3/hero-act1-female-walk-8x3-64-g3.png"),
                os.path.join(A, "npc-heroine-anchor.png"))
    for nm in ("portSapphire-healer", "portSapphire-drake"):
        shutil.copy(os.path.join(ROOT, f"public/act1-hifi/town/npc/{nm}-4x3-64.png"),
                    os.path.join(A, f"npc-{nm}-accepted.png"))
    for tid, t in TOWNS.items():
        looks = NPC_LOOK[tid]
        roster = [i for i, _ in t["npcs"] if i != "kiki"]
        if "shopkeeper" in looks and "gordo" not in roster:
            roster.append("shopkeeper")
        chars = "\n\n".join(f"**{k + 1}. {tid}-{i}** -- {looks[i]}" for k, i in enumerate(roster))
        paths = "\n".join(f"    @@OUTDIR@@/raw-{tid}-{i}.png" for i in roster)
        note = ""
        if tid == "havensEdge":
            note = "\n(Kiki also stands in this town; her sheet already exists as greenhollow-kiki and is reused.)"
        if tid == "ironkeep":
            note = "\n(Gordo IS this town's shopkeeper; his sheet ships as both ironkeep-gordo and ironkeep-shopkeeper.)"
        b = NPC_BRIEF.format(name=t["name"], act=t["act"], setting=SETTING[tid], n=len(roster),
                             climate=CLIMATE[t["act"]], chars=chars + note, paths=paths)
        open(os.path.join(dest, "briefs", f"npc-{tid}.md"), "w").write(b)
        jobs.append(("npc", tid, f"briefs/npc-{tid}.md",
                     ["anchors/npc-heroine-anchor.png", "anchors/npc-portSapphire-healer-accepted.png",
                      "anchors/npc-portSapphire-drake-accepted.png"]))


# --------------------------------------------------------------------------- kits
CROWN_BRIEF = """DO THIS YOURSELF, one generation call, do not dispatch a sub-agent. Produce the image
and stop.

# Task: Act {act} overworld {what} -- a 4 x 3 crown sheet in the existing canopy-atlas format

TWO images are attached.
- IMAGE 1 is the shipped Act 1 CANOPY ATLAS (shown on magenta): **12 tree clumps in a 4-column x
  3-row grid, each clump centred in its cell, viewed from the same 3/4 top-down angle, same light
  (upper left), same pixel density and same size.** Your sheet must be a drop-in sibling of it:
  same grid, same clump size per cell, same margins, same finish.
- IMAGE 2 is the Act {act} overworld ground at true scale, where these clumps will stand. Match its
  palette and daylight.

## THE SUBJECT
{subject}

## FORMAT
- One RGB PNG, **landscape 4:3** (the atlas is 1448 x 1086), 4 columns x 3 rows of equal cells.
- **Flat pure magenta (255, 0, 255) background**; it is keyed to alpha afterwards. No pure magenta
  in the artwork. Each clump keeps at least 8% clear magenta margin inside its cell on every side
  and never touches a neighbour.
- Twelve DIFFERENT clumps (vary the count, size and arrangement of the trees in each), each
  roughly as wide and tall as one Act 1 clump, with the trunk bases at the bottom of the clump.
- No ground, no shadows on the magenta, no grass tufts, no text, no grid lines, no frame.

## FINISH
Hand-drawn hard-edged pixel art at IMAGE 1's density: distinct {leaves}, stepped shading in 3-4
values, a darker underside and lit upper-left tops, dithered transitions. No blur, no airbrush, no
filter.

## OUTPUT
Write to exactly @@OUT@@ at the generator's native size, print the path, stop.
"""

CLIFF_BRIEF = """DO THIS YOURSELF, one generation call, do not dispatch a sub-agent. Produce the image
and stop.

# Task: Act {act} cliff-panel kit -- 4 large panels in the exact format of the Act 1 cliff kit

TWO images are attached.
- IMAGE 1 is the shipped Act 1 CLIFF KIT (shown on magenta): **four large cliff panels in a 2 x 2
  arrangement on a flat background, all at the same scale, lit from the upper left, with the same
  stacked-block pixel-art construction, a flat base line at the bottom of each panel and clean
  silhouettes.** Your kit must be a drop-in sibling: same 2 x 2 layout, same panel scale, same light
  direction, same density and finish.
- IMAGE 2 is the Act {act} overworld at true scale, where these cliffs stand. Match its palette and
  daylight; your rock should look like the cliffs already in it, drawn larger and better.

## THE ROCK
{rock}

## THE FOUR PANELS -- all LARGE, NO small spires
1. top-left: a broad rounded cliff mass, wider than tall.
2. top-right: a tall broad cliff with a stepped top, about as wide as it is tall.
3. bottom-left: a massive cliff with a high central peak and broad shoulders, base filling the cell.
4. bottom-right: a long cliff WALL, much wider than tall, with an even, slightly varied top line.
Unlike Act 1 there must be **no narrow spire or needle**: every panel is a broad mass whose base
fills most of its cell's width. Each panel's base is a level line at the bottom of its cell.

## FORMAT
One square RGB PNG at the generator's native size, **flat pure magenta (255, 0, 255) background**
(keyed to alpha afterwards; no magenta in the art), 2 x 2 equal cells, each panel centred in its
cell with clear magenta between panels and around the edges. No ground, no cast shadow on the
magenta, no text, no frame.

## FINISH
Hand-drawn hard-edged pixel art at IMAGE 1's density: individual blocks and facets, lit upper-left
planes, dark lower-right planes, stepped shading in 3-5 values, crisp edges. No blur, no filter.

## OUTPUT
Write to exactly @@OUT@@, print the path, stop.
"""

CLIFFS = {
    2: ("snow-capped grey GRANITE: cool blue-grey blocks and slabs, fractured vertical faces, thick white "
        "snow lying on every upward-facing ledge and on the tops (snow only on top surfaces), a little "
        "blue shadow in the snow.", "ironkeep"),
    3: ("red-orange SANDSTONE MESA: horizontal strata bands in rust, orange and cream, flat-topped "
        "tiers, vertical erosion grooves, sun-bleached tops, deep red-brown shade on the right faces.",
        "ruinsCamp"),
    4: ("black OBSIDIAN and basalt: glassy black-violet faceted columns with sharp highlights on the "
        "lit edges, and thin glowing EMBER CRACKS (orange-red, a few yellow-hot) running through the "
        "lower faces. The glow is in narrow cracks only, never a flat orange area.", "embersRest"),
    5: ("dark grey DEAD-STONE: cold charcoal-grey crumbling blocks with violet-tinted shade, cracked "
        "and weathered, no vegetation, no snow; the tops catch a faint cold light.", "havensEdge"),
}


def kit_jobs(dest, jobs):
    A = os.path.join(dest, "anchors")
    on_magenta(os.path.join(ROOT, "design/terrain-current-profile-20261007/r4-source/canopy-atlas-r4-hybrid.png"),
               os.path.join(A, "kit-canopy-atlas-act1.png"))
    on_magenta(os.path.join(ROOT, "design/terrain-current-profile-20261007/atlases/act1-cliff-kit-imagegen-v1.png"),
               os.path.join(A, "kit-cliff-act1.png"))
    for act, what, subj, leaves, tid in (
            (3, "PALM CLUMPS", "Clumps of 2-5 DATE PALMS each: curved slender ringed trunks leaning at "
             "different angles, crowns of long arching feathery fronds in olive and yellow-green with "
             "brown dead fronds hanging under them, a few date bunches. Desert oasis palms, not "
             "coconut-beach palms.", "fronds", "oasisHaven"),
            (5, "LEAFLESS DEAD-TREE CLUMPS", "Clumps of 2-5 LEAFLESS DEAD TREES each: twisted grey-"
             "brown trunks, bare forking branches ending in fine twigs, some broken limbs, NO leaves "
             "at all. Haunting but not scary for children: no faces, no skulls.", "branches and twigs",
             "havensEdge")):
        b = CROWN_BRIEF.format(act=act, what=what, subject=subj, leaves=leaves)
        name = f"kit-act{act}-{'palms' if act == 3 else 'deadtrees'}"
        open(os.path.join(dest, "briefs", name + ".md"), "w").write(b)
        jobs.append(("kit", name, f"briefs/{name}.md",
                     ["anchors/kit-canopy-atlas-act1.png", f"anchors/{tid}-overworld-65.png"]))
    for act, (rock, tid) in CLIFFS.items():
        b = CLIFF_BRIEF.format(act=act, rock=rock)
        name = f"kit-act{act}-cliffs"
        open(os.path.join(dest, "briefs", name + ".md"), "w").write(b)
        jobs.append(("kit", name, f"briefs/{name}.md",
                     ["anchors/kit-cliff-act1.png", f"anchors/{tid}-overworld-65.png"]))


# --------------------------------------------------------------------------- run.sh
RUN = r"""#!/usr/bin/env bash
# Codex image generation for the Acts 2-5 towns, NPCs and kits. Sequential: ONE codex exec at a
# time, explicit -m, brief on stdin (codex exec -i is variadic, so images go after -i and the brief
# can never be swallowed as an image). Every path is relative to this folder.
#
#   ./run.sh                     everything, in order (towns, then NPCs, then kits)
#   ./run.sh town-embersRest     one job (any brief name without .md)
#   TRIES=3 ./run.sh             best-of count per town plate (default 8; NPCs/kits default 2)
#   MODEL=... ./run.sh           override the model (default @@MODEL@@)
#
# Outputs: out/<job>/<job>-try<N>.png (towns, kits) or out/<job>/try<N>/raw-*.png (NPC sheets).
# Log:     out/run.log  (one line per call: time, job, try, exit code, seconds, files written).
# Each call runs inside its own out/<job>/work-try<N>/ so stray sub-agent redraws stay contained.
# Stops at once if codex reports a usage limit.
set -u
HERE="$(cd "$(dirname "$0")" && pwd)"
cd "$HERE"
MODEL="${MODEL:-@@MODEL@@}"
TRIES="${TRIES:-8}"
KIT_TRIES="${KIT_TRIES:-2}"
LOG="out/run.log"
mkdir -p out
command -v codex >/dev/null || { echo "codex not on PATH" >&2; exit 1; }

JOBS=(
@@JOBS@@
)

run_one() {   # kind name brief images...
  local kind="$1" name="$2" brief="$3"; shift 3
  local n="$TRIES"; [ "$kind" != "town" ] && n="$KIT_TRIES"
  local imgs=(); for i in "$@"; do imgs+=("$HERE/$i"); done
  mkdir -p "out/$name"
  for t in $(seq 1 "$n"); do
    local work="$HERE/out/$name/work-try$t"; mkdir -p "$work"
    local target outdir
    if [ "$kind" = "npc" ]; then
      outdir="$HERE/out/$name/try$t"; mkdir -p "$outdir"; target="$outdir"
      ls "$outdir"/*.png >/dev/null 2>&1 && { echo "skip $outdir (has output)"; continue; }
      sed -e "s#@@OUTDIR@@#$outdir#g" "$brief" > "$work/brief.md"
    else
      target="$HERE/out/$name/$name-try$t.png"
      [ -f "$target" ] && { echo "skip $target (exists)"; continue; }
      sed -e "s#@@OUT@@#$target#g" "$brief" > "$work/brief.md"
    fi
    local t0=$(date +%s)
    echo "$(date -u +%FT%TZ) START $name try$t" | tee -a "$LOG"
    ( cd "$work" && codex exec -m "$MODEL" --skip-git-repo-check -i "${imgs[@]}" < "$work/brief.md" ) \
        > "$work/codex.out" 2>&1
    local rc=$?
    local files
    if [ "$kind" = "npc" ]; then files=$(ls "$outdir"/*.png 2>/dev/null | wc -l); else files=$([ -f "$target" ] && echo 1 || echo 0); fi
    echo "$(date -u +%FT%TZ) END   $name try$t rc=$rc secs=$(( $(date +%s) - t0 )) files=$files" | tee -a "$LOG"
    if grep -qi "usage limit" "$work/codex.out"; then
      echo "codex usage limit hit -- stopping. See $work/codex.out" | tee -a "$LOG"; exit 2
    fi
  done
}

want="${1:-}"
for j in "${JOBS[@]}"; do
  # shellcheck disable=SC2086
  set -- $j
  if [ -z "$want" ] || [ "$want" = "$2" ]; then run_one "$@"; fi
done
"""


def write_run(dest, jobs):
    lines = []
    for kind, name, brief, imgs in jobs:
        jn = f"town-{name}" if kind == "town" else f"npc-{name}" if kind == "npc" else name
        lines.append(f'  "{kind} {jn} {brief} {" ".join(imgs)}"')
    s = RUN.replace("@@MODEL@@", MODEL).replace("@@JOBS@@", "\n".join(lines))
    p = os.path.join(dest, "run.sh")
    open(p, "w").write(s)
    os.chmod(p, 0o755)


if __name__ == "__main__":
    main(sys.argv[1] if len(sys.argv) > 1 else "/mnt/project-files/edu-rpg/codex-gen")
