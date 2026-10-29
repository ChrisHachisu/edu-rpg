"""Round-3 Codex town package: /mnt/project-files/edu-rpg/codex-gen/towns-r3/ (briefs/, anchors/, run.sh).

Builds on the r2 package (codex_briefs.py) -- same four images in the same order (style anchor,
overworld ground at 65 cells, layout guide, icon), same light/finish/material rules -- with:
  * IMAGE 3 replaced by the round-3 AUTHORED plan guide (r3_plans.py): every open part of the town
    is paving, doors marked, healer/shop landings and NPC spots verified with the feet stencil;
  * a NO TALL OBJECTS rule set (owner 2026-10-28) and identity/lighting text scrubbed of lamp posts,
    braziers, columns, banners on poles and trees beside lanes;
  * THREE tries per town by default.

  python3 r3_plans.py <dest> && python3 r3_package.py <dest>
"""
import json
import os
import shutil
import sys

from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import codex_briefs as cb  # noqa: E402
import r3_plans as rp  # noqa: E402

R2 = "/mnt/project-files/edu-rpg/codex-gen"

# identity text: remove every tall thing that could stand beside the walkable ground
SCRUB = {
    "ironkeep": [("smoke from forge chimneys", "smoke from forge chimneys (chimneys sit on their own roofs)")],
    "hauntedVillage": [("Iron lanterns light the lanes; every house has a warm candle-lit window.",
                        "Lanterns hang on the house walls (never on posts); every house has a warm candle-lit "
                        "window."),
                       ("among LEAFLESS DEAD\nTREES", "behind a low picket fence (the dead trees stand only in "
                                                      "the\nforest round the village, never in the graveyard)")],
    "oasisHaven": [("date PALMS in clumps round the pond,", "date PALMS only on the dunes round the town's outer "
                                                            "edge (never beside the pond or a lane),")],
    "ruinsCamp": [("two rows of BROKEN COLUMNS (a\nruined colonnade) flanking the main way; ",
                   "knee-high stubs of ruined walls (NO standing\ncolumns); ")],
    "embersRest": [("Iron braziers along the main street.", "Light comes from the lava and the windows; no "
                                                            "braziers or lamp posts.")],
    "frostwatch": [("the GATEHOUSE, two squat towers flanking a 4-cell opening, is in the middle of the\nSOUTH wall.",
                    "the GATE, a plain 6-cell opening with a portcullis arch NO TALLER THAN THE WALL ITSELF (no\n"
                    "flanking towers), is in the middle of the SOUTH wall.")],
    "lastBastion": [("a GATEHOUSE of two round towers\nin the middle of the SOUTH wall;",
                     "a plain GATE, a 6-cell opening no taller than\nthe wall itself (no flanking towers), in the middle "
                     "of the SOUTH wall;"),("A straight MUSTER ROAD from gate to keep, lined both sides with iron BRAZIERS.",
                     "A straight MUSTER ROAD from gate to keep, edged with a low stone kerb."),
                    ("a squat tower at each of the four corners; ", "")],
    "havensEdge": [("a lookout lamp post on the promontory, a few leafless dead trees\nand a tiny graveyard of "
                    "three headstones.", "a few leafless dead trees out on the crags\nbeyond the houses, and a "
                    "tiny graveyard of three low headstones.")],
}
LIGHTS = {
    "ironkeep": "forge glow through the open front, lit windows",
    "frostwatch": "the lit tower window, warm windows",
    "hauntedVillage": "lanterns hung on house walls, candle-lit windows",
    "oasisHaven": "none needed: bright desert midday",
    "ruinsCamp": "none needed: bright desert day",
    "embersRest": "the lava glow, the forge hearth, warm windows",
    "cinderwatch": "the beacon on top of the tower (it stands in the north wall), the lava glow, warm windows",
    "lastBastion": "lit keep windows, warm windows",
    "havensEdge": "warm windows; the void's starlight",
}
# what each feature kind is, in words, for the layout section
FEAT_WORD = {"water": "water", "lava": "lava", "pit": "the dig pit", "graveyard": "the graveyard",
             "rock": "rock", "terrace": "a dry-stone retaining wall", "void": "the void", "fence": "low fence",
             "well": "well", "bed": "flower bed", "cart": "low prop"}


YARD_WORD = {"snow": "packed snow", "haunted": "trodden snow and frosty grass", "desert": "firm sand",
             "ash": "ash-dusted earth", "barren": "dead grass and bare earth"}


def where(rect):
    x = (rect[0] + rect[2]) / 2
    y = (rect[1] + rect[3]) / 2
    ns = "north" if y < 22 else "south" if y > 40 else "middle"
    ew = "west" if x < 26 else "east" if x > 39 else "centre"
    return f"{ns} {ew}".replace("middle centre", "centre")


def layout_text(tid, plan):
    """The plan in words: paving vs yards, the services and their doors, features. Cells of 65."""
    L = []
    lm = [b for b in plan["buildings"] if b["role"] == "landmark"]
    L.append("IMAGE 3 is the plan, measured in cells (65 across). Follow it closely: the game's collision "
             "is built from the SAME plan, so a building, wall or prop drawn where IMAGE 3 shows open ground "
             "is a bug the player walks into.")
    L.append(f"- **TWO KINDS OF WALKABLE GROUND.** Mid grey = COBBLED streets and squares. The pale "
             f"{YARD_WORD[plan['biome']]} colour = open YARDS the player may also walk on: keep them open and "
             "smooth, decorated only with LOW things (flower beds, low fenced garden plots, a cart, crates, a "
             "low well). The darker flat colour inside the town = rough ground the player cannot enter "
             "(rock, back gardens, drifts).")
    L.append(f"- **The way in** runs north from the gate in the middle of the south edge, cells "
             f"{rp.GATE[0]:g}-{rp.GATE[1]:g} across (6 cells wide).")
    if lm:
        L.append(f"- **The landmark** ({lm[0]['note'] or lm[0]['id']}) stands at the top centre with its "
                 "back to the town edge; walkable ground reaches only its FRONT (south) face.")
    for b in plan["buildings"]:
        if b["role"] in ("healer", "shop"):
            what = ("**THE HEALER** (GREEN roof)" if b["role"] == "healer" else "**THE SHOP** (RED roof)")
            mark = "DOOR (dark mark)" if b["role"] == "healer" else "COUNTER (wide dark mark)"
            L.append(f"- {what}: {where(b['rect'])}, cells {b['rect'][0]:g}-{b['rect'][2]:g} across, south "
                     f"face at row {b['rect'][3]:g}. Its {mark} faces SOUTH at cell {b['door']:g} and opens "
                     "straight onto walkable ground with a clear landing at least 3 cells wide and 2 deep.")
    n = len([b for b in plan["buildings"] if b["role"] == "house"])
    L.append(f"- Every other building ({n}) has its door on its south face where IMAGE 3 marks it, opening "
             "onto walkable ground.")
    for f in plan["features"] + plan.get("deco", []):
        if f.get("note"):
            L.append(f"- {FEAT_WORD.get(f['kind'], f['kind']).capitalize()}: {f['note']}.")
    if plan.get("stairs"):
        L.append("- The ONLY ways across each retaining wall are the stone STAIRS shown (pale strips across "
                 "the wall); no other gaps, no ramps.")
    if plan.get("bridges"):
        L.append("- The ONLY crossings are the solid stone BRIDGES shown (pale strips across it), with LOW "
                 "parapets (knee height, no posts or lamps).")
    return "\n".join(L)


NO_TALL = """
## NOTHING TALL WHERE THE PLAYER WALKS -- owner rule, the previous round was rejected for it
The game cannot draw the player BEHIND anything: it paints this picture flat and draws the player on
top. Anything taller than the player that he could stand behind looks like he is walking over it.
- **FORBIDDEN inside the town or beside any paving:** lamp posts, lanterns on posts, pillars,
  columns, obelisks, statues, standing stones, tall signs or signposts, banners or flags on poles,
  braziers on stands, well cranes or winches, gallows, totems, trees of any kind, tall bushes,
  arches over a lane, fences taller than knee height. Not even one.
- **Allowed beside paving, LOW things only (knee height, under half a cell tall):** barrels, crates,
  sacks, low stone walls and kerbs, flower beds, planters, low hedges, a well with a low round rim
  (no roof, no crank post), low fences, benches, carts, woodpiles. Put them tight against a building
  wall or the town edge, never in a street.
- **Tall things live only at the town's OUTER EDGE, with their backs to blocked ground:** trees,
  crags, cliffs, towers, the landmark. Nothing walkable may lie NORTH of a tall thing within its
  height -- the player must never be able to stand behind it. Trees and fences stay in the border
  band outside the town (IMAGE 3's outer area), at least 2 cells away from any paving.
- A building's roof and chimney are fine: the whole building is solid. Signs hang flat on a
  building's own wall, never on a post or a bracket over the street.
"""

IMAGE3 = """- IMAGE 3 is the LAYOUT PLAN, drawn to scale (65 cells across) from the authored town plan the game's
  collision is built from. Mid grey = cobbled streets and squares; the pale ground colour = open
  walkable yards; the darker flat ground colour inside the town = rough ground nobody walks on;
  coloured blocks = roofs, brown band = the building's south front, DARK MARK on a front = its door
  (wide dark mark = the shop counter), RED roof = the shop, GREEN roof = the healer, light
  grey-violet block = the landmark, dark slate = walls, blue = water, orange = lava, near-black
  violet = the void, tan block = the dig pit, grey-green = the graveyard, small slate-blue oval = a
  low well, small green block = a flower bed, small brown block = a low prop, chequered outer area
  = the border country (trees/crags). Follow its arrangement exactly; its flat colours are a key,
  NOT a palette."""


def brief(tid):
    t = dict(cb.TOWNS[tid])
    ident = t["identity"]
    for a, b in SCRUB.get(tid, []):
        assert a in ident, (tid, a)
        ident = ident.replace(a, b)
    plan = rp.PLANS[tid]
    ow = os.path.join(R2, "anchors", f"{tid}-overworld-65.png")
    rgb, lum, br = cb.measure(ow)
    lava = tid in ("embersRest", "cinderwatch")
    s = cb.TOWN_BRIEF.format(
        name=t["name"], act=t["act"], identity=ident, layout=layout_text(tid, plan), border=t["border"],
        lanes=t["lanes"], materials=cb.MATERIALS[t["act"]], shop=cb.SHOP.get(tid, cb.SHOP_DEFAULT),
        healer_extra=", a lantern hung on its wall" if t["act"] in (4, 5) or tid == "hauntedVillage" else "",
        magma=cb.MAGMA.replace("Bridges are solid dressed-stone arches with parapets.",
                               "Bridges are solid dressed-stone arches with LOW parapets, no posts or lamps.")
        if lava else "",
        rgb=tuple(rgb), lum=lum, br=br, lights=LIGHTS[tid], style_num=cb.STYLE_NUM)
    a = s.index("- IMAGE 3 is the LAYOUT GUIDE")
    b = s.index("- IMAGE 4 is")
    s = s[:a] + IMAGE3 + "\n" + s[b:]
    s = s.replace("## THE SHAPE OF IT -- follow IMAGE 3", "## THE PLAN -- follow IMAGE 3")
    s = s.replace("That paving IS where the player may walk, and\nit must form ONE connected network.",
                  "That paving, together with the open yards IMAGE 3 shows beside it, is where the player\n"
                  "may walk, and the two form ONE connected network.")
    assert "open yards IMAGE 3 shows" in s, tid
    s = s.replace("- **Lanes are wide, clean and obvious: 3 to 4 cells (90 to 120 px) of open, uncluttered paving**",
                  "- **Streets are wide, clean and obvious: 3 to 6 cells of open, uncluttered paving**")
    s = s.replace("The gate opening and the main street are at\n  least 4 cells wide.",
                  "The gate opening and the main street are 6 cells wide.")
    s = s.replace("## NOTHING MAY OVERHANG", NO_TALL + "\n## NOTHING MAY OVERHANG")
    s = s.replace("No building near player height. Nothing from IMAGE 1's harbour.",
                  "No building near player height. Nothing from IMAGE 1's harbour. NO lamp posts, pillars, "
                  "columns, statues, tall signs, banners on poles, braziers on stands or trees anywhere near "
                  "the paving.")
    s = s.replace("shop and healer present with clear ground in front, and lane width.",
                  "shop and healer present with their doors opening straight onto paving, lane width, and a "
                  "confirmation that no tall object stands inside the town or beside the paving.")
    for bad in ("lamp posts at", "Lamp posts at"):
        assert bad not in s, (tid, bad)
    return s


def main(dest):
    B, A = os.path.join(dest, "briefs"), os.path.join(dest, "anchors")
    for d in (B, A, os.path.join(dest, "out")):
        os.makedirs(d, exist_ok=True)
    shutil.copy(os.path.join(R2, "anchors", "style-portSapphire-accepted.png"), A)
    jobs = []
    for tid in rp.ORDER:
        for f in (f"{tid}-overworld-65.png", f"{tid}-icon.png"):
            shutil.copy(os.path.join(R2, "anchors", f), A)
        open(os.path.join(B, f"town-{tid}.md"), "w").write(brief(tid))
        jobs.append(("town", tid, f"briefs/town-{tid}.md",
                     ["anchors/style-portSapphire-accepted.png", f"anchors/{tid}-overworld-65.png",
                      f"anchors/{tid}-layout-guide-r3.png", f"anchors/{tid}-icon.png"]))
    json.dump([{"kind": k, "id": i, "brief": b, "images": im} for k, i, b, im in jobs],
              open(os.path.join(dest, "jobs.json"), "w"), indent=1)
    cb.write_run(dest, jobs)
    p = os.path.join(dest, "run.sh")
    s = open(p).read()
    s = s.replace('TRIES="${TRIES:-8}"', 'TRIES="${TRIES:-3}"')
    s = s.replace("# Codex image generation for the Acts 2-5 towns, NPCs and kits.",
                  "# Codex image generation, ROUND 3 TOWNS ONLY (authored plans, no tall objects).")
    s = s.replace("everything, in order (towns, then NPCs, then kits)", "all nine towns, in order")
    s = s.replace("best-of count per town plate (default 8; NPCs/kits default 2)", "tries per town (default 3)")
    open(p, "w").write(s)


if __name__ == "__main__":
    dest = sys.argv[1] if len(sys.argv) > 1 else os.path.join(R2, "towns-r3")
    for t in rp.ORDER:                 # plans first (python3 r3_plans.py <dest> writes them + spots)
        assert os.path.exists(os.path.join(dest, "anchors", f"{t}-layout-guide-r3.png")), t
        assert json.load(open(os.path.join(dest, "plans", f"{t}-plan.json")))["checks"] == "PASS", t
    main(dest)
