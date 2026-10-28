#!/usr/bin/env python3
"""Write the Codex image briefs for Acts 2-5 dungeon materials and mechanic tiles, plus
run-dungeons.sh, into /mnt/project-files/edu-rpg/codex-gen/dungeons/.

Material briefs reuse make_dungeon_materials.sheet_prompt()'s wording VERBATIM (the version that
scored 3.4x better than the long hedged prompt -- keep it short, name surfaces not objects, flat
lighting, nothing larger than a thumbnail). Only the theme and the four quadrant nouns change, and
the destination is ./out/<name>.png relative to the codex-gen/dungeons folder.
"""
import os
D = "/mnt/project-files/edu-rpg/codex-gen/dungeons"

MATERIALS = {
    # name: (theme, floor, wall, rubble, accent, used by, why a recolour cannot do it)
    "tower-storm": ("storm-battered stone tower interior",
        "worn grey flagstones with fine cracks and grit in the joints",
        "dressed blue-grey tower masonry in small courses, weathered and rain-streaked",
        "broken masonry chips and loose mortar grit",
        "wet flagstones with thin rain sheen and puddled joints",
        "stormNest", "Act 1 has no dressed masonry. The cellar blocks read as cave rock, not a built tower."),
    "tower-sky": ("sunlit sky tower interior high above clouds",
        "pale cream flagstones, wind-scoured and clean",
        "white-grey ashlar masonry with faint blue weathering",
        "pale masonry chips and grit",
        "flagstones dusted with drifting cloud mist",
        "stormreachSpire", "Needs pale built masonry. Every Act 1 wall is dark natural rock."),
    "forest-maze": ("haunted forest maze",
        "dark damp forest path of packed earth and fallen leaves",
        "a dense wall of gnarled dark tree trunks and twisted roots, seen from above",
        "fallen twigs, bark chips and dead leaves",
        "pale ghostly mist-damp moss over earth",
        "hauntedForest", "Its walls are TREES. Act 1 only has earth and rock walls."),
    "ice": ("frozen ice cave",
        "packed white snow with fine footprint texture and frost grit",
        "translucent blue glacial ice and frozen rock, crisp fracture planes",
        "small ice shards and frozen pebbles",
        "glassy smooth blue slide ice with fine skate scratches",
        "frozenLake", "Slide ice must look different from snow at a glance, because that is the mechanic."),
    "lava": ("volcanic lava tunnel",
        "dark cinder and ash-grey volcanic grit",
        "black basalt rock with thin glowing orange cracks",
        "sharp basalt and pumice fragments",
        "molten orange lava with a dark cooling crust",
        "magmaTunnels", "Lava has to GLOW. A recolour of dark rock can only make it look rusty (measured on the v1 renders)."),
    "void": ("void rift between worlds",
        "pale violet crystalline dust",
        "near-black void rock flecked with tiny distant stars",
        "dark glassy shards with violet edges",
        "open starfield void, deep indigo with faint nebula",
        "voidRift", "A starfield cannot be derived from any Act 1 texture."),
    "demon-castle": ("demon king's castle interior",
        "polished dark slate flagstones",
        "violet-black castle masonry with dull iron bands",
        "broken slate and iron rivet fragments",
        "mirror-polished black marble floor tiles reflecting faint light",
        "demonCastle", "The mirror floor announces the mirror mechanic, so it needs a real reflective surface."),
    "tomb": ("ancient sandstone desert tomb",
        "sand-dusted pale sandstone flagstones",
        "carved sandstone blocks with worn hieroglyph bands",
        "sandstone chips and drifted sand",
        "loose rippling quicksand, darker and wetter than the floor",
        "desertTomb", "Quicksand is a hazard and must read as one."),
    "sunken-temple": ("sunken temple maze",
        "wet carved stone tiles with algae in the joints",
        "drowned carved temple stone with barnacles and weed",
        "broken carved stone and shell grit",
        "shallow clear water over carved tiles",
        "sunkenTempleDungeon", "Carved temple stone is not in the Act 1 sets."),
    # One sheet per dungeon (size budget §4: the runtime shader composites 4 x 531^2 tiles per
    # dungeon, so the materials ARE the art; a derived recolour gives every Act 2-5 dungeon Act 1's
    # grain).
    "frost-crystal": ("crystal ice cavern",
        "pale blue wind-packed snow crust with frost sparkle",
        "rime-covered rock grown with clear blue ice crystal clusters",
        "broken ice crystals and frozen grit",
        "glassy smooth pale blue slide ice with fine scratches",
        "frostfallCavern", "Ice crystal walls and slide ice are not in the Act 1 sets."),
    "iron-mine": ("old iron mine",
        "packed brown earth with gravel and old cart ruts",
        "brown-grey rock with rust-orange iron ore seams",
        "ore chunks and loose gravel",
        "weathered wooden planks laid as a mine boardwalk",
        "ironMine", "Ore seams and mine timber need to be painted in; Act 1 rock carries neither."),
    "oasis-depths": ("cool cave under a desert oasis",
        "damp golden sand with small pebbles",
        "warm sandstone cave rock with dark water stains",
        "sandstone pebbles and shell grit",
        "still clear turquoise water over pale sand",
        "oasisDepths", "Warm sandstone and clear water are outside every Act 1 palette."),
    "bandit-hideout": ("bandit hideout dug into a hillside",
        "trampled dirt floor with scattered straw",
        "rough timber planks and posts holding back dark earth",
        "splintered wood, straw and dirt clods",
        "worn wooden floorboards",
        "banditHideout", "Plank walls read as a hideout. Rock reads as a cave."),
    "scorched-ruin": ("burnt ancient ruin",
        "ash-covered cracked flagstones",
        "fire-blackened broken masonry with faint ember-lit cracks",
        "charred stone rubble and ash",
        "glowing embers scattered in grey ash",
        "scorchedRuins", "Built masonry, burnt. A recolour of cave rock cannot show the stones were laid by hand."),
    "ember-mine": ("hot ember mine",
        "dark cinder floor with glowing specks",
        "soot-dark rock with thin glowing orange seams",
        "coal lumps and slag",
        "a bed of glowing red-orange embers",
        "emberMines", "The seams must glow (a recolour reads as rust)."),
    "obsidian": ("obsidian cavern",
        "dark grey volcanic glass sand",
        "glossy black obsidian with sharp facets and violet glints",
        "obsidian shards",
        "violet crystal growths on black glass",
        "obsidianCavern", "Glossy glass with specular glints cannot come from matte Act 1 rock."),
    "volcanic-forge": ("ancient volcanic forge",
        "soot-stained iron-plated stone floor slabs",
        "heavy forge masonry with iron bands, heat-stained",
        "slag and iron scraps",
        "a channel of molten glowing metal",
        "volcanicForge", "A forge is built masonry and iron, plus a molten channel."),
    "demon-barracks": ("demon army barracks",
        "dark worn flagstones scuffed by boots",
        "black-red barracks masonry with iron rivets",
        "broken stone and bent iron",
        "a worn crimson carpet runner",
        "demonBarracks", "Barracks masonry and a carpet runner say 'built', not 'cave'."),
    "shadow-cave": ("cave of living shadow",
        "dark violet-grey cave grit",
        "black cave rock with a faint violet sheen",
        "dark rock shards",
        "faintly glowing violet moss on dark rock",
        "shadowCave", "It must stay legible in the darkness-pulse dark phase, so it needs real value contrast, not a darkened Act 1 rock."),
    "twilight": ("twilight realm dungeon",
        "dusky lavender flagstones with fine gold dust",
        "dusk-blue stone with tiny inlaid gold stars",
        "lavender stone chips and gold flecks",
        "a starlit indigo floor with faint constellations",
        "twilightDungeon", "Portal pads have to read against the floor, which needs a deliberate dusk palette."),
}
# dungeon -> material sheet (one per dungeon; the 4 quilted tiles land in design/materials/<id>/)
MATERIAL_FOR = {"stormNest": "tower-storm", "stormreachSpire": "tower-sky", "hauntedForest": "forest-maze",
    "frozenLake": "ice", "frostfallCavern": "frost-crystal", "magmaTunnels": "lava", "voidRift": "void",
    "demonCastle": "demon-castle", "desertTomb": "tomb", "sunkenTempleDungeon": "sunken-temple",
    "ironMine": "iron-mine", "oasisDepths": "oasis-depths", "banditHideout": "bandit-hideout",
    "scorchedRuins": "scorched-ruin", "emberMines": "ember-mine", "obsidianCavern": "obsidian",
    "volcanicForge": "volcanic-forge", "demonBarracks": "demon-barracks", "shadowCave": "shadow-cave",
    "twilightDungeon": "twilight"}

MAT_TMPL = """Call the built-in image_gen tool ONCE, immediately. Read no files, no skills, no docs.

Prompt: A 2x2 grid of four seamless TEXTURE SWATCHES for a {theme}, 1024x1024, four equal \
quadrants, no gap or border.

TOP-LEFT: {floor}.
TOP-RIGHT: {wall}.
BOTTOM-LEFT: {rubble}.
BOTTOM-RIGHT: {accent}.

Flat even lighting, no cast shadows. Dense fine detail across every quadrant, strong contrast \
between grains, rich tinted colour. Detailed 16-bit SNES JRPG pixel texture. Nothing larger than \
a thumbnail. No objects, no layout, no text.

Then copy the generated file to ./out/{name}.png. Print the final path. \
Do not commit, do not build, modify no existing file."""

# Mechanic / prop sheets: same 3x3, magenta-keyed contract as the Act 1 prop sheet
# (design/DUNGEON-ASSET-PROMPTS.md: painterly, no black keyline, 3/4 top-down, upper-left light,
# saturated colour ONLY on gameplay signals).
SHEETS = {
    "mech-tiles-a": ("mechanic floor tiles", [
        "a stone floor tile crossed by pale swirling wind-gust streaks (a draught you can see)",
        "a stone floor tile with a pale wind streak pointing clearly to the RIGHT",
        "a narrow tower window slit set in a stone wall, bright blue sky and cloud through it",
        "a 2x2 swirl of sinking quicksand, dark and wet, a hazard",
        "a ring of loose sinking sand, lighter than quicksand, rippled",
        "a round ice boulder sitting on ice, the thing a slide stops against",
        "cracked blue ice with a white fracture star",
        "molten glowing orange lava filling a floor tile, bright, dangerous",
        "the same lava tile cooled to a dark safe crust with faint red cracks"],
        "stormNest, stormreachSpire, desertTomb, frozenLake, frostfallCavern, magmaTunnels, volcanicForge"),
    "mech-tiles-b": ("mechanic props", [
        "a round violet glowing portal pad set into the floor",
        "a matching round gold glowing portal pad set into the floor",
        "a tall ornate black mirror frame mounted on a castle wall",
        "a taut thin tripwire across a floor tile with two small iron pegs",
        "a bronze torch sconce on carved temple stone, lit",
        "a gap in a wall of dark trees glowing with soft pale light (the true forest exit)",
        "a slightly cracked section of wall that looks hollow (a secret door)",
        "a timber mine prop: two upright posts and a crossbeam",
        "a stack of wooden crates and a barrel"],
        "twilightDungeon, demonCastle, banditHideout, sunkenTempleDungeon, hauntedForest, ironMine"),
}
SHEET_TMPL = """Call the built-in image_gen tool ONCE, immediately. Read no files, no skills, no docs.

Prompt: A 3x3 grid of nine separate {what} for a top-down 16-bit SNES JRPG dungeon, 1024x1024, \
each centred in its own cell on a flat solid magenta #FF00FF background, no grid lines, no text.

{cells}

3/4 top-down view, light from the upper left. Painterly pixel shading, no black outline. Stone and \
wood stay muted; only the glowing or signal parts are saturated. Each item fills about 70% of its \
cell.

Then copy the generated file to ./out/{name}.png. Print the final path. \
Do not commit, do not build, modify no existing file."""

# Maze walls: 1-cell walls the material renderer cannot draw (it deletes wall masses <6 cells).
# 16 connectivity pieces = every N/E/S/W neighbour mask, so a per-cell autotiler can draw any maze.
MAZES = {
    "maze-forest": ("dark gnarled tree trunks, roots and bramble, leaf-litter path showing around them",
                    "hauntedForest"),
    "maze-temple": ("drowned carved temple stone wall with barnacles, wet stone path around it",
                    "sunkenTempleDungeon"),
}
MAZE_TMPL = """Call the built-in image_gen tool ONCE, immediately. Read no files, no skills, no docs.

Prompt: A 4x4 grid of sixteen square top-down maze WALL tiles for a 16-bit SNES JRPG, 1024x1024, \
equal cells, no gaps, no text. Material: {mat}. Each tile is one wall cell whose wall runs from the \
tile centre out to the edges named, and the rest of the tile is path:
row 1: isolated pillar | to N | to E | to N and E
row 2: to S | N and S (vertical) | E and S | N, E and S
row 3: to W | N and W | E and W (horizontal) | N, E and W
row 4: S and W | N, S and W | E, S and W | all four (cross)
Walls are about half a tile thick with a darker south-facing side, light from the upper left. Where \
a wall reaches a tile edge it is the same width, so the tiles join seamlessly.

Then copy the generated file to ./out/{name}.png. Print the final path. \
Do not commit, do not build, modify no existing file."""


def main():
    os.makedirs(os.path.join(D, "briefs"), exist_ok=True)
    os.makedirs(os.path.join(D, "out"), exist_ok=True)
    order = []
    for name, (theme, fl, wa, ru, ac, used, why) in MATERIALS.items():
        p = MAT_TMPL.format(theme=theme, floor=fl, wall=wa, rubble=ru, accent=ac, name=f"mat-{name}")
        open(os.path.join(D, "briefs", f"mat-{name}.md"), "w").write(
            f"<!-- used by: {used}. Why generation, not recolour: {why}\n"
            f"     Output feeds make_dungeon_materials.py --quilt-only (Act 1 path): split the 2x2, quilt each "
            f"tileable, then render. -->\n" + p + "\n")
        order.append(f"mat-{name}")
    for name, (what, cells, used) in SHEETS.items():
        txt = "\n".join(f"Cell {i + 1}: {c}." for i, c in enumerate(cells))
        open(os.path.join(D, "briefs", f"{name}.md"), "w").write(
            f"<!-- used by: {used}. Magenta-keyed like the Act 1 prop sheet; these stay RUNTIME layers "
            f"(lava phase, wind, portals, tripwires change state), never baked into -props.png. -->\n"
            + SHEET_TMPL.format(what=what, cells=txt, name=name) + "\n")
        order.append(name)
    for name, (mat, used) in MAZES.items():
        open(os.path.join(D, "briefs", f"{name}.md"), "w").write(
            f"<!-- used by: {used}. 1-cell maze walls: the Act 1 splat renderer prunes walls under 6 cells, "
            f"so mazes need a per-cell autotile layer drawn from these 16 pieces. -->\n"
            + MAZE_TMPL.format(mat=mat, name=name) + "\n")
        order.append(name)
    assert sorted(MATERIAL_FOR.values()) == sorted(MATERIALS), "one material sheet per dungeon"
    with open(os.path.join(D, "MATERIALS-MAP.md"), "w") as f:
        f.write("# Dungeon -> material sheet (Acts 2-5)\n\nThe runtime shader composites 4 tiles "
                "(floor/wall/rubble/accent, 531 px, from the 2x2 sheet) per dungeon over a 1/4-res field, "
                "so these sheets are the art. Quilt a returned sheet with\n`python3 scripts/make_dungeon_materials.py "
                "--quilt-only` (Act 1 path) into `design/materials/<dungeon>/`.\n\n| dungeon | sheet | why it needs generating |\n|---|---|---|\n")
        for did, m in MATERIAL_FOR.items():
            f.write(f"| {did} | out/mat-{m}.png | {MATERIALS[m][6]} |\n")
    sh = os.path.join(D, "run-dungeons.sh")
    open(sh, "w").write("""#!/bin/bash
# Run every Acts 2-5 dungeon brief through Codex image_gen, one at a time, into ./out/.
# Usage (from this folder):  ./run-dungeons.sh [brief-name ...]   (default: all, skipping done ones)
# Same flags as scripts/make_dungeon_materials.py. A brief's file is the prompt minus its <!-- --> note.
set -u
cd "$(dirname "$0")"
MODEL=${CODEX_MODEL:-gpt-5.6-sol}
mkdir -p out logs
NAMES=("$@"); [ ${#NAMES[@]} -eq 0 ] && NAMES=(""" + " ".join(order) + """)
for n in "${NAMES[@]}"; do
  if [ -s "out/$n.png" ]; then echo "skip $n (out/$n.png exists)"; continue; fi
  prompt=$(awk 'c==0 && /-->/ {c=1; next} c==1' "briefs/$n.md")
  echo "== $n"
  # USE_ANCHOR=1 attaches ONE small Act 1 style ref (<0.5 MB; >~8 MB of refs silently killed
  # image_gen in Act 1). Off by default: the Act 1 materials were generated without one.
  ref=(); if [ "${USE_ANCHOR:-0}" = 1 ]; then case "$n" in mat-*) ref=(-i anchors/act1-materials-style.jpg);; *) ref=(-i anchors/act1-props-style.jpg);; esac; fi
  timeout 900 codex exec -m "$MODEL" --skip-git-repo-check "${ref[@]}" "$prompt" > "logs/$n.log" 2>&1
  if [ -s "out/$n.png" ]; then echo "   ok out/$n.png"; else echo "   NOT PRODUCED (see logs/$n.log; image may be in ~/.codex/generated_images)"; fi
done
""")
    os.chmod(sh, 0o755)
    print("\n".join(order))


if __name__ == "__main__":
    main()
