#!/usr/bin/env python3
"""Paint a whole town from a WRITTEN BRIEF, with no grid as input. Stage 1 of the Port Sapphire
pipeline, restored for the two villages on 2026-08-21.

WHY THIS EXISTS, AND WHY town_layout.py's PRIMER IS NOT THE INPUT ANY MORE
    Owner, 2026-08-21, after two rounds of revisions on the plan-primed villages: "we need to go
    back to the initial port sapphire style that was working for all towns (style and boundary
    setting method)."

    `derive_town_walkable.py` states the rule this restores, and it was written down long before
    this session:

        "Towns are art-first. The painting is authored first and the collision geometry is DERIVED
        from it. A grid is never an input. The first Port Sapphire pass generated a semantic grid
        and painted into it, and the owner scrapped it outright."

    greenhollow and millbrook were then built the scrapped way -- `town_layout.py` authored a flat
    colour-block plan and the generator drew from it -- and the whole of this session's difficulty
    followed from that one decision. The plates measured half the accepted plate's pixel energy
    because a flat plan has no texture to redraw; the towns came out empty because the plan's
    vocabulary had no word for a barrel; the greens came out wrong because a plan colour is what
    the generator anchors a material to. Each was patched downstream and none of it was the cause.

    Port Sapphire's chain, which produced the plate the owner accepted and still likes:

        1. THIS FILE          a whole-town painting from prose (design/act1-towns/BRIEF-v4-that-worked.md)
        2. rebake_town_tiles  redraw that PAINTING as tiles at a hard finish, priming each tile
                              from the painting and from its already-finished neighbours
        3. derive_town_walkable  read the collision back OUT of the finished paving

    Step 2 works precisely because step 1 hands it a dense painting rather than flat blocks --
    "redraw this at full detail" needs something to redraw.

WHAT IS DELIBERATELY NOT HERE
    No layout scoring. There is no plan to correlate against, by design: the layout IS whatever the
    painter draws, and the collision is derived from it afterwards rather than imposed on it
    beforehand. What replaces the score is the owner's eye at this checkpoint, plus the measurable
    invariants in `audit()` -- daylight, one connected paving network, and exactly one place where
    that network touches the frame edge.

USAGE
    python3 scripts/town_paint.py --town millbrook            # write brief, paint, audit
    python3 scripts/town_paint.py --town greenhollow --dry-run  # write the brief only
"""
from __future__ import annotations

import argparse
import importlib.util
import os
import subprocess

import numpy as np
from PIL import Image
from scipy import ndimage

# The deriver owns the definition of "walkable stone"; this file must not hold a second opinion.
_dtw_spec = importlib.util.spec_from_file_location(
    "_dtw", os.path.join(os.path.dirname(os.path.abspath(__file__)), "derive_town_walkable.py"))
_dtw = importlib.util.module_from_spec(_dtw_spec)
_dtw_spec.loader.exec_module(_dtw)

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
MODEL = "gpt-5.6-sol"
# The accepted plate, passed alongside the brief so density and daylight are SHOWN, not described.
STYLE_ANCHOR = "design/act1-towns/_anchor/style-anchor-portSapphire-accepted.png"

# Measured off the accepted plate. Prose about "bright" is what produced a town 20 luminance too
# dark on the first Port Sapphire attempt; numbers are what fixed it.
TARGET_LUM = 90.0



# Where each town actually stands, from public/act1-world-map.js LANDMARKS. The town screen's
# border must agree with the ground the player was standing on one second earlier.
SITES = {"millbrook": (39, 344), "greenhollow": (69, 255), "portSapphire": (133, 349)}


def overworld_surround(town: str, rad_cells: int = 18) -> str:
    """Cut the REAL terrain around this town out of the shipped overworld chunks.

    Written because the first pass got this badly wrong. The briefs said "DENSE FOREST pressing in
    on all four sides" for both villages, on my inference from tile codes -- and the shipped
    overworld art says otherwise: millbrook stands in 89% open grass meadow with water seven cells
    west, greenhollow in 86% meadow with rocky cliffs two cells north-west. Neither has forest
    around it at all. A description of the terrain is a claim; a crop of the terrain is the terrain,
    so the painter now gets the crop.
    """
    import json
    m = json.load(open(os.path.join(ROOT, "public/act1-hifi/manifest.json")))
    bx, by = m["semanticBounds"][0], m["semanticBounds"][1]
    cx_cell, cy_cell = SITES[town]
    px, py = (cx_cell - bx) * 16, (cy_cell - by) * 16
    r = rad_cells * 16
    x0, y0, x1, y1 = px - r, py - r, px + r, py + r
    out = Image.new("RGBA", (x1 - x0, y1 - y0), (0, 0, 0, 255))
    for c in m["chunks"]:
        if c["x"] + c["width"] <= x0 or c["x"] >= x1: continue
        if c["y"] + c["height"] <= y0 or c["y"] >= y1: continue
        for layer in ("base", "canopy"):
            rel = c.get(layer)
            if not rel: continue
            fp = os.path.join(ROOT, "public/act1-hifi", rel)
            if os.path.exists(fp):
                out.alpha_composite(Image.open(fp).convert("RGBA"), (c["x"] - x0, c["y"] - y0))
    dest = os.path.join(ROOT, "design/act1-towns", town, "overworld-surround.png")
    out.convert("RGB").save(dest)
    return dest


TOWNS = {
    "millbrook": {
        "what": "a small mill village",
        "identity": (
            "A WORKING MILL VILLAGE. Its one landmark is the MILL: the largest building, with a "
            "timber WATER WHEEL mounted on its own wall. There is NO river and NO stream anywhere "
            "in this picture -- the surrounding country has no water in it, and a wheel on a dry "
            "wall is correct here. Sacks of grain, a handcart and stacked timber belong against "
            "the mill's walls."),
        "surround": (
            "OPEN SUNLIT GRASS MEADOW on every side -- the same bright grass as the attached "
            "approved town, scattered with small leafy shrubs, clumps of wildflowers and the odd "
            "grey stone. This is NOT forest. Do not ring the village with trees. A few individual "
            "trees standing in the meadow are fine; a wall of woodland is wrong. Along the WEST "
            "edge of the picture only, open WATER may show as a distant band -- the coast lies "
            "seven cells that way -- and a low grey rocky outcrop may break the grass toward the "
            "SOUTH-WEST."),
        "people": "four villagers live here: a miller, a sage, a herbalist and a healer",
        "buildings": "eight or nine buildings, the mill much the largest",
    },
    "greenhollow": {
        "what": "a small forest village",
        "identity": (
            "THE STARTING VILLAGE, and the friendliest place in the game. Cottages face inward "
            "around a common. An ELDER'S HALL is the largest building. There is NO river and NO "
            "stream anywhere in this picture."),
        "surround": (
            "OPEN SUNLIT GRASS MEADOW on every side -- the same bright grass as the attached "
            "approved town, scattered with small leafy shrubs, clumps of wildflowers and the odd "
            "grey stone. This is NOT forest. Do not ring the village with trees. A few individual "
            "trees standing in the meadow are fine; a wall of woodland is wrong. Toward the "
            "NORTH-WEST corner, GREY ROCKY CLIFFS and mossy boulders rise out of the grass and "
            "close that corner off -- they stand only two cells from the village and are the one "
            "strong landscape feature here."),
        "people": "six villagers live here, the most of any town in the act",
        "buildings": "nine or ten buildings, cottage-sized, around a wide common",
    },
}

BRIEF = """DO THIS YOURSELF, one generation call, do not dispatch a sub-agent. Produce the image
and stop; do not review it, do not redraw it, do not ask another agent to improve it.

# Task: paint the {town} town screen, top-down, for a 2D JRPG

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
{what} called {town}. {identity}

{people}, so there must be open ground for people to stand in without blocking the way.

## THE SHAPE OF IT -- this is the layout and it is yours to design
- **WHETHER THIS VILLAGE IS WALLED IS YOUR DECISION.** A timber palisade, a thorn hedge, a low
  stone wall, a ditch and bank, or no enclosure at all with the forest simply closing in around
  the houses -- choose whatever suits the place and draw it convincingly. Do not draw a wall
  because you think one is expected.
- **ONE WAY IN AND OUT, AT THE BOTTOM (SOUTH).** A single trail leaves the village southward and
  runs DOWN to the bottom edge of the picture. **That trail is the ONLY place any walkable ground
  may touch the edge of the frame** -- the game reads the way out of your picture, so a second
  opening anywhere is a second exit and is wrong. If you draw an enclosure, it is unbroken except
  where that trail passes through it. If you draw none, the surrounding country must close the
  village in on the other three sides so there is nowhere else to walk out.
- **THE VILLAGE FILLS THE PICTURE.** Leave a border of only TWO OR THREE CELLS of open ground
  between the outermost building or fence and the edge of the frame. The attached approved town
  fills 97% of its frame; a deep margin of scenery around a small cluster in the middle is the
  single most common way this task is failed, and it makes the town look like a model of itself.
  Spread the buildings across the WHOLE width and height, not into a clump at the centre.
- {buildings}, arranged the way a real village grows -- not on a circle, not evenly spaced, not in
  a ring. Some close together facing a lane, some set back with a garden. It must look grown rather
  than laid out.
- A generous open COMMON or yard with a stone WELL, big enough for several people to stand around
  the well without blocking the way past.
- Around the village: {surround}

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
- **The HEALER is a herbalist's porch** -- bundles of drying herbs strung under the eaves, a stone
  water basin, a low bench, planted pots -- warm, domestic, and instantly distinct from every
  ordinary house. The ground directly in front of it stays completely clear: the player stands
  there to talk.

## SCALE, WHICH IS FIXED
One cell is 30 px and the picture is 65 cells across. The player character is about 68 px tall --
just over two cells. A cottage is 8 to 11 cells wide. **No building may ever be near the player's
height.** About nine to eleven buildings would span the full width, which is why {buildings}
leaves so much open ground.

## LIGHT AND COLOUR -- measured, because "bright" in prose has already failed twice
**This is BRIGHT MIDDAY. It is not evening, not overcast, and not under a canopy.** The attached
approved town measures mean luminance {lum:.0f} out of 255 and you must land within a few points of
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

## FORBIDDEN
No people, no animals, no text, no labels, no numbers, no lettered signage, no UI, no borders or
frames. No grid. No rectangular blocks. No repeated identical buildings. No river, no stream, no
pond, no sea. No second way out of the village. No blocking clutter in the middle of a
lane or the common.
"""


def audit(path: str, town: str) -> list[str]:
    """The invariants that do not need an owner's eye. Reported, never auto-fixed.

    These replace the layout-correlation score, which cannot exist here: there is no plan to
    correlate against, because the plan IS the picture. What can be checked mechanically is the
    daylight, and the two things the derivation step depends on -- that the cobble forms one
    connected network, and that it reaches the frame edge in exactly one place.

    IT MEASURES THE COBBLE, NOT THE WHOLE FRAME, and that is not a detail. Whole-frame luminance is
    a COMPOSITION statistic: these villages measure 70-74 against Port Sapphire's 83 purely because
    they are ringed by dark forest where it has bright sea and open grass. Their sunlit cobble is
    165.7 and 169.4 against its 164.5 -- the same daylight. Judging them on the frame average said
    "too dark" about two correctly lit paintings, which is the same error that made a gate force
    village grass blue-green earlier the same day.

    It also uses derive_town_walkable's OWN paving_mask rather than a second opinion about what
    stone looks like. A first version of this audit rolled its own and reported a fragmented mess
    (0.0% connected) on paintings the real deriver reads cleanly at 8.8% and 10.8%.
    """
    notes = []
    rgb = np.asarray(Image.open(path).convert("RGB"))
    a = rgb.astype(float)
    lum = 0.2126 * a[:, :, 0] + 0.7152 * a[:, :, 1] + 0.0722 * a[:, :, 2]

    cob = _dtw.paving_mask(rgb)
    if cob.sum() < 500:
        notes.append("NO pale cobble found at all -- the deriver will find no walkable ground. "
                     "The lanes were probably drawn as sand or bare earth rather than grey stone.")
        return notes

    notes.append(f"cobble luminance {lum[cob].mean():.1f} "
                 f"(Port Sapphire's painting: 164.5 -- THIS is the daylight check)")
    notes.append(f"whole-frame luminance {lum.mean():.1f} (composition, NOT a target: a forest "
                 f"village is legitimately darker than a town with a sea in it)")

    d = np.concatenate([np.abs(np.diff(lum, axis=1)).ravel(),
                        np.abs(np.diff(lum, axis=0)).ravel()])
    notes.append(f"mean pixel step {d.mean():.2f}, hard>=24 {100*(d>=24).mean():.1f}% "
                 f"(a soft painting measures ~11.7 / 13.9%; the accepted plate 22.2 / 29.7%)")

    lab, n = ndimage.label(cob)
    sizes = ndimage.sum(cob, lab, range(1, n + 1))
    big = int(np.argmax(sizes)) + 1
    notes.append(f"cobble {100*cob.mean():.1f}% of frame, largest connected network "
                 f"{100*sizes.max()/cob.size:.2f}% (the accepted plate: 5.82%)")

    edge = np.zeros_like(cob)
    edge[0, :] = edge[-1, :] = edge[:, 0] = edge[:, -1] = True
    # MERGE CONTACTS THAT ARE THE SAME TRAIL. Hand-drawn cobble dithers, so a single trail meets the
    # frame as several short runs with a few dark pixels between them -- millbrook's one south trail
    # came back as "5 places", all inside 6% of the frame width. Counting raw components would report
    # five exits on a town that has one, and the whole point of this check is the exit COUNT.
    lab2, n2 = ndimage.label((lab == big) & edge)
    runs = []
    for k in range(1, n2 + 1):
        ys, xs = np.where(lab2 == k)
        side = ("TOP" if ys.min() == 0 else "BOTTOM" if ys.max() == cob.shape[0] - 1
                else "LEFT" if xs.min() == 0 else "RIGHT")
        along = (xs.min(), xs.max()) if side in ("TOP", "BOTTOM") else (ys.min(), ys.max())
        runs.append((side, int(along[0]), int(along[1])))
    gap = int(0.03 * cob.shape[0])          # a trail is a few cells wide; 3% closes dither, not a lane
    merged = []
    for side, a0, a1 in sorted(runs):
        if merged and merged[-1][0] == side and a0 - merged[-1][2] <= gap:
            merged[-1][2] = max(merged[-1][2], a1)
        else:
            merged.append([side, a0, a1])
    desc = ", ".join(f"{s} at {100*a0/cob.shape[1]:.0f}%-{100*a1/cob.shape[1]:.0f}%"
                     for s, a0, a1 in merged)
    notes.append(f"the walkable network reaches the frame edge in {len(merged)} place(s): "
                 f"{desc if merged else 'none'}   (want exactly 1, BOTTOM)"
                 + ("" if len(merged) == 1 and merged[0][0] == "BOTTOM" else "   <-- WRONG"))
    return notes


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--town", choices=sorted(TOWNS), required=True)
    ap.add_argument("--dry-run", action="store_true", help="write the brief, generate nothing")
    ap.add_argument("--audit", help="audit an existing painting and exit")
    a = ap.parse_args()

    out = os.path.join(ROOT, "design/act1-towns", a.town)
    os.makedirs(out, exist_ok=True)
    if a.audit:
        for line in audit(a.audit, a.town):
            print(f"    {line}")
        return 0

    t = TOWNS[a.town]
    brief = BRIEF.format(town=a.town, lum=TARGET_LUM, **t)
    bp = os.path.join(out, "brief-painting.md")
    open(bp, "w").write(brief)
    print(f"  brief -> {os.path.relpath(bp, ROOT)}")
    if a.dry_run:
        return 0

    imgs = [os.path.join(ROOT, STYLE_ANCHOR)]
    icon = os.path.join(ROOT, "public/act1-hifi/landmarks",
                        {"millbrook": "millbrook.png", "greenhollow": "greenhollow.png"}[a.town])
    if os.path.exists(icon):
        imgs.append(icon)
    cmd = ["codex", "exec", "-m", MODEL, "--skip-git-repo-check"]
    for i in imgs:
        cmd += ["-i", i]
    import time
    t0 = time.time() - 1
    r = subprocess.run(cmd, stdin=open(bp), capture_output=True, text=True, timeout=3000)

    root = os.path.expanduser("~/.codex/generated_images")
    cands = []
    for d, _, fs in os.walk(root):
        for f in fs:
            q = os.path.join(d, f)
            if f.endswith(".png") and os.path.getmtime(q) > t0:
                cands.append((os.path.getmtime(q), q))
    if not cands:
        print(f"    FAILED (exit {r.returncode}); last output:\n{r.stdout[-600:]}")
        return 1
    # No layout score exists here, so take the LAST arrival: with the one-call instruction there
    # should be exactly one, and if the model ignored it the latest is its own final answer.
    got = sorted(cands)[-1][1]
    dest = os.path.join(out, "painting-raw.png")
    Image.open(got).convert("RGB").save(dest)
    print(f"  painting -> {os.path.relpath(dest, ROOT)}  from {os.path.basename(got)}"
          f"  ({len(cands)} candidate(s))")
    for line in audit(dest, a.town):
        print(f"    {line}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
