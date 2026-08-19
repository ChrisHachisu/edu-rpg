#!/usr/bin/env python3
"""Bake a town's four tiles from its authored plan, with a brief that describes EACH CROP.

WHY THIS EXISTS AND WHY IT IS NOT AN EDIT TO rebake_town_tiles.py
    Two reasons, and the second is the binding one.

    1. THE SHARED BRIEF ASKED FOR THE LEGEND AND GOT THE LEGEND. `PLAN_BRIEF` lists every colour
       the WHOLE-TOWN plan can contain -- "tan gap at the bottom THE ONE GATE", "grey disc a stone
       well", "blue WATER" -- and then hands the model ONE QUADRANT of that plan. Tile (0,0) of the
       first run came back with a gateway and a stone well drawn into it, neither of which appears
       anywhere in `primer-00.png`, and WITHOUT the millstream, which occupies rows 900-1070 of it.
       Measured: layout correlation against its own primer +0.282, against greenhollow's plan +0.163
       (so it was our own generation, not a neighbour's image); water-like pixels 2.1% in the art
       against 12.7% in the plan, and where the plan paints its blue band the art's mean colour is
       (71,68,36), olive grass. The model was completing "a village corner" from the legend instead
       of drawing the crop in front of it. A legend that names things absent from the input is an
       invitation to invent them.

    2. greenhollow IS BEING BAKED BY ANOTHER AGENT RIGHT NOW, THROUGH THAT SAME FILE. Editing
       `PLAN_BRIEF` in place would silently change a run already in flight, in a different worktree,
       that this agent does not own and cannot verify. Adding a millbrook-only script leaves that
       run untouched. The tiling mechanics below are therefore a faithful copy rather than an
       improvement: same GEN/PLATE/N/TILE/BAND, same per-axis primer scaling, same raw-band graft.

WHAT THIS CHANGES, AND ONLY THIS
    The brief now states what is ACTUALLY IN THIS CROP, measured off the crop itself
    (`inventory()`), and says in as many words that anything not listed is not present and must not
    be added. Edge crossings for the palisade and the millstream are given as percentages along each
    edge, because "the wall enters the top edge 64% across and leaves the bottom edge 18% across" is
    checkable by the model in a way that "keep everything where it is" is not.

USAGE
    python3 scripts/millbrook_bake.py                 # all four, sequential (reading order)
    python3 scripts/millbrook_bake.py --only 0,1      # one tile; earlier tiles must already exist
    python3 scripts/millbrook_bake.py --dry-run       # write primers + briefs, generate nothing
"""
from __future__ import annotations

import argparse
import os
import subprocess
import time

import numpy as np
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
TOWNS = {
    "millbrook":   {"water": "the MILLSTREAM, clear running water",
                    "subject": "a small top-down JRPG mill village inside a round timber palisade, "
                               "with one gate at the south and a millstream crossing it"},
    "greenhollow": {"water": "WATER",
                    "subject": "a small top-down JRPG forest village inside a round timber "
                               "palisade, with one gate at the south, cottages facing inward "
                               "around a packed-earth yard, and dense woodland beyond the wall"},
}
STYLE_ANCHOR = "public/act1-hifi/town/portSapphire-screen.png"
OUT = None            # both set from --town in main(); a town is a path, not a constant
REF = None

GEN = 1254          # what the image tool returns, always
PLATE = 1950        # 1.875 art px per world px -> an exact 3x device upscale
N = 2
TILE = PLATE // N   # 975
BAND = 130          # overlap band, in FINAL px, shared with the left/upper neighbours
MODEL = "gpt-5.6-sol"

# The plan's palette, sampled from primer.png. These are flat, exact fills.
PLAN = {
    "woodland": (58, 92, 48),
    "grass": (96, 132, 70),
    "paving": (176, 168, 148),
    "facade": (128, 96, 74),
    "roof_slate": (78, 96, 132),
    "roof_tile": (150, 78, 60),
    "palisade": (104, 82, 54),
    "water": (58, 104, 132),
    "gate": (150, 126, 92),
    "well": (120, 120, 126),
}
HUMAN = {
    "woodland": "dark-green WOODLAND, outside the palisade",
    "grass": "mid-green GRASS, inside the palisade",
    "paving": "pale PACKED-EARTH STREET AND YARD, the ground the player walks on",
    "facade": "brown BUILDING FACADE, the lower band of a building block",
    "roof_slate": "slate-blue ROOF, the upper band of a building block",
    "roof_tile": "red-brown ROOF, the upper band of a building block",
    "palisade": "the TIMBER PALISADE, a wall of upright logs",
    "water": "WATER",   # replaced per town in main()
    "gate": "the ONE GATE through the palisade",
    "well": "a round STONE WELL",
}


def candidates_since(t0):
    """EVERY image generated since t0, newest last -- not just the newest one.

    TWO measured failures live here. (1) `~/.codex/generated_images` is SHARED, so with two towns
    baking at once the newest file is not necessarily yours: millbrook's tile, generated at 08:02,
    was about to be grafted into greenhollow's plate. (2) `codex exec` does not reliably stop after
    producing an image -- it dispatches sub-agents that REDRAW it, each writing its own file. On
    millbrook tile (0,0) the correct image landed at 08:30:49 with layout correlation +0.884, then
    nineteen further minutes produced +0.865, +0.856, +0.868, +0.836, +0.674, +0.803 and +0.805.
    Taking the newest ships +0.805 and nobody ever sees the +0.884.

    So collect them all and let the caller SCORE them. Arrival order is not quality order.
    """
    root = os.path.expanduser("~/.codex/generated_images")
    out = []
    for d, _, fs in os.walk(root):
        for f in fs:
            if not f.endswith(".png"):
                continue
            q = os.path.join(d, f)
            if os.path.getmtime(q) > t0:
                out.append((os.path.getmtime(q), q))
    return [q for _, q in sorted(out)]


def score(cand: str, plan_only: Image.Image) -> float:
    """Layout fidelity: luminance correlation against the tile's own plan. Cheap and decisive --
    a model that answered from the legend instead of the crop scores +0.28 where a faithful one
    scores +0.88, and the two are indistinguishable by eye because both are beautifully drawn."""
    a = np.asarray(Image.open(cand).convert("RGB").resize((128, 128), Image.LANCZOS)).astype(float)
    b = np.asarray(plan_only.convert("RGB").resize((128, 128), Image.LANCZOS)).astype(float)
    la = 0.2126 * a[:, :, 0] + 0.7152 * a[:, :, 1] + 0.0722 * a[:, :, 2]
    lb = 0.2126 * b[:, :, 0] + 0.7152 * b[:, :, 1] + 0.0722 * b[:, :, 2]
    return float(np.corrcoef(la.ravel(), lb.ravel())[0, 1])


def mask_for(arr: np.ndarray, rgb) -> np.ndarray:
    """Nearest-colour membership. The plan is flat fills, but the crop is LANCZOS-resampled to
    1254, so boundaries carry blended pixels; nearest-of-the-palette is the honest reading."""
    names = list(PLAN)
    pal = np.array([PLAN[n] for n in names], dtype=float)
    d = ((arr[:, :, None, :].astype(float) - pal[None, None, :, :]) ** 2).sum(-1)
    return np.argmin(d, axis=2) == names.index(rgb)


def edge_crossings(m: np.ndarray) -> str:
    """Where a mask meets each edge of the crop, as percentages along that edge."""
    h, w = m.shape
    out = []
    for name, line in (("top", m[0, :]), ("bottom", m[-1, :]), ("left", m[:, 0]), ("right", m[:, -1])):
        idx = np.where(line)[0]
        if not len(idx):
            continue
        # report contiguous runs, so a wall crossing twice reads as two crossings
        runs, start = [], idx[0]
        for a, b in zip(idx, idx[1:]):
            if b != a + 1:
                runs.append((start, a)); start = b
        runs.append((start, idx[-1]))
        span = w if name in ("top", "bottom") else h
        out.append(f"{name} edge at " + ", ".join(
            f"{100*a/span:.0f}%-{100*b/span:.0f}%" for a, b in runs))
    return "; ".join(out) if out else None


def inventory(crop: Image.Image) -> str:
    """Describe what is REALLY in this crop, so the brief cannot be answered from the legend."""
    a = np.asarray(crop.convert("RGB"))
    lines, absent = [], []
    for key in PLAN:
        m = mask_for(a, key)
        frac = float(m.mean())
        if frac < 0.002:
            absent.append(key)
            continue
        ys, xs = np.where(m)
        # PERCENTILE BOUNDS, NOT min/max. The crop is LANCZOS-resampled, so a material's boundary
        # carries blended pixels that nearest-colour assigns to whichever palette entry is closest
        # -- slate roof (78,96,132) and millstream (58,104,132) are 46 apart and trade a scatter of
        # pixels at every edge. On min/max that scatter dragged the roof's reported box from
        # "28%-55% down" out to "28%-85% down", i.e. across the whole stream, which is precisely the
        # kind of wrong instruction this brief exists to stop giving.
        x0p, x1p = np.percentile(xs, [2, 98])
        y0p, y1p = np.percentile(ys, [2, 98])
        box = (f"spanning {100*x0p/a.shape[1]:.0f}%-{100*x1p/a.shape[1]:.0f}% across "
               f"and {100*y0p/a.shape[0]:.0f}%-{100*y1p/a.shape[0]:.0f}% down")
        extra = ""
        if key in ("palisade", "water"):
            e = edge_crossings(m)
            extra = (f"; it meets the {e}" if e
                     else "; it does not reach any edge of this crop, so do not run it to one")
        lines.append(f"  - {HUMAN[key]}: {100*frac:.1f}% of this crop, {box}{extra}")
    body = "\n".join(lines)
    if absent:
        body += ("\n\nNOT PRESENT IN THIS CROP AT ALL, and therefore MUST NOT BE DRAWN INTO IT:\n  "
                 + "\n  ".join(HUMAN[k] for k in absent))
    return body


# THE FIRST LINE IS NOT BOILERPLATE, AND LEAVING IT OFF COSTS BOTH TIME AND QUALITY.
# Measured 2026-08-19 on tile (0,0): `codex exec` produced a correct image at 08:30:49
# (layout correlation +0.884) and then DID NOT EXIT. It dispatched sub-agents, each of which got its
# own ~/.codex/generated_images session and redrew the tile -- 08:32 +0.865, 08:33 +0.856, then two
# further sessions at 08:37 +0.868 / 08:38 +0.836 / 08:40 +0.674 and 08:43 +0.803 / 08:45 +0.805.
# Nineteen minutes after the good image existed the process was still going. Two separate harms:
# the wall-clock cost, and the fact that `newest_since()` takes the NEWEST file when the call
# finally returns -- so the pipeline would have shipped a +0.805 redraw instead of the +0.884
# original. Telling it to generate once and stop removes both.
BRIEF = """DO THIS YOURSELF, one generation call, do not dispatch a sub-agent. Produce the image
and stop; do not review it, do not redraw it, do not ask another agent to improve it.

Draw this as hand-drawn, hard-edged pixel art at full detail.

THE INPUT IS A PLAN, NOT A PICTURE. It is a flat colour-coded diagram, and it is ONE QUADRANT --
tile ({i},{j}) of a 2x2 grid -- of {subject}. It is not a blurry painting to be sharpened and it is not a theme to riff on: it is a map
telling you WHERE EVERY SINGLE THING GOES inside this crop. Draw the finished village that this
exact crop describes, keeping every element in exactly the position, at exactly the size, and with
exactly the extent the plan gives it.

WHAT IS ACTUALLY IN THIS CROP, measured off the image you have been given:

{inventory}

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
{bandnote}
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
"""

STYLENOTE = """
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
"""

BANDNOTE = """
THE {which} OF THIS IMAGE IS ALREADY FINISHED ARTWORK, carried over from the tile drawn before this
one. Reproduce those {bandpx} pixels EXACTLY -- same shapes, same colours, same level of detail --
and continue that same drawing inward across the rest of the tile. Do not restyle them, do not
brighten them, do not reinterpret them. They are the join, and a visible change across it is a
failure.
"""


def primer(i, j):
    """The tile's input: this quadrant of the plan, plus any finished neighbour band AT FULL DETAIL.

    Copied from scripts/rebake_town_tiles.py, INCLUDING its per-axis scale fix. A tile with a band
    on only one side is not square in final pixels -- (1,0) covers 975x1105 -- while the primer is
    always 1254x1254, so px-per-final-px differs between the axes. Using the width's factor for a
    TOP graft stretches the grafted band ~13% vertically, and the generator faithfully reproduces
    the stretch; that was the measured cause of one plate's worst seam.
    """
    x0, y0 = j * TILE - (BAND if j else 0), i * TILE - (BAND if i else 0)
    x1, y1 = x0 + TILE + (BAND if j else 0), y0 + TILE + (BAND if i else 0)
    W, H = x1 - x0, y1 - y0
    ref = Image.open(REF).convert("RGB").resize((PLATE, PLATE), Image.LANCZOS)
    plan_only = ref.crop((x0, y0, x1, y1)).resize((GEN, GEN), Image.LANCZOS)
    pr = plan_only.copy()
    kx, ky = GEN / W, GEN / H

    def graft(ni, nj, side):
        raw_p = os.path.join(OUT, f"raw-{ni}{nj}.png")
        if not os.path.exists(raw_p):
            raise SystemExit(f"tile ({i},{j}) needs its neighbour ({ni},{nj}): {raw_p} is missing. "
                             f"Tiles are generated in reading order and each grafts its band from "
                             f"the raw output of the tile before it.")
        raw = Image.open(raw_p).convert("RGB")
        nW = TILE + (BAND if nj else 0)
        nH = TILE + (BAND if ni else 0)
        if side == "left":
            b = int(round(BAND * raw.size[0] / nW))
            strip = raw.crop((raw.size[0] - b, 0, raw.size[0], raw.size[1]))
            strip = strip.resize((int(round(BAND * kx)), GEN), Image.LANCZOS)
        else:
            b = int(round(BAND * raw.size[1] / nH))
            strip = raw.crop((0, raw.size[1] - b, raw.size[0], raw.size[1]))
            strip = strip.resize((GEN, int(round(BAND * ky))), Image.LANCZOS)
        pr.paste(strip, (0, 0))

    if j:
        graft(i, j - 1, "left")
    if i:
        graft(i - 1, j, "top")
    # The inventory is measured on the PLAN ONLY: the grafted band is finished art, and describing
    # it in plan colours would be describing something that is no longer there.
    return pr, plan_only, (x0, y0, x1, y1)


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--town", choices=sorted(TOWNS), required=True)
    ap.add_argument("--only", help="i,j to generate a single tile")
    ap.add_argument("--no-style-anchor", action="store_true",
                    help="generate from the plan alone. Measured to come back HALF as dense as the "
                         "accepted plate; kept only to reproduce that result.")
    ap.add_argument("--dry-run", action="store_true")
    a = ap.parse_args()

    global OUT, REF
    OUT = os.path.join(ROOT, "design/act1-towns", a.town)
    REF = os.path.join(OUT, "primer.png")
    HUMAN["water"] = TOWNS[a.town]["water"]
    os.makedirs(OUT, exist_ok=True)
    cells = ([tuple(int(v) for v in a.only.split(","))] if a.only
             else [(i, j) for i in range(N) for j in range(N)])
    for i, j in cells:
        pr, plan_only, box = primer(i, j)
        pp = os.path.join(OUT, f"primer-{i}{j}.png")
        pr.save(pp)
        which = ("LEFT EDGE" if j and not i else "TOP EDGE" if i and not j
                 else "LEFT AND TOP EDGES" if i and j else None)
        bn = "" if which is None else BANDNOTE.format(
            which=which, bandpx=int(round(BAND * GEN / (TILE + BAND))))
        brief = BRIEF.format(i=i, j=j, inventory=inventory(plan_only), bandnote=bn,
                             subject=TOWNS[a.town]["subject"]) + (
            "" if a.no_style_anchor else STYLENOTE)
        bp = os.path.join(OUT, f"brief-{i}{j}.md")
        open(bp, "w").write(brief)
        print(f"  tile {i},{j}  primer {pr.size}  box {box}  -> {os.path.relpath(pp, ROOT)}")
        if a.dry_run:
            continue
        t0 = time.time() - 1
        cmd = ["codex", "exec", "-m", MODEL, "--skip-git-repo-check", "-i", pp]
        if not a.no_style_anchor:
            cmd += [os.path.join(ROOT, STYLE_ANCHOR)]   # -i is VARIADIC; the brief goes on stdin
        r = subprocess.run(cmd, stdin=open(bp), capture_output=True, text=True, timeout=3000)
        cands = candidates_since(t0)
        if not cands:
            print(f"    FAILED (exit {r.returncode}); last output:\n{r.stdout[-600:]}")
            continue
        scored = sorted(((score(c, plan_only), c) for c in cands), reverse=True)
        for sc, c in scored:
            print(f"      candidate {os.path.basename(c):<28} layout {sc:+.3f}")
        best_score, got = scored[0]
        if best_score < 0.60:
            print(f"    REJECTED: best candidate scores {best_score:+.3f}, under the 0.60 floor. "
                  "The model answered from the legend rather than the crop; fix the brief, not the art.")
            continue
        Image.open(got).convert("RGB").save(os.path.join(OUT, f"raw-{i}{j}.png"))
        art = Image.open(got).convert("RGB").resize(
            (box[2] - box[0], box[3] - box[1]), Image.LANCZOS)
        art.save(os.path.join(OUT, f"tile-{i}{j}.png"))
        print(f"    -> raw-/tile-{i}{j}.png from {os.path.basename(got)}, layout {best_score:+.3f}")
    print("  BAKE DONE")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
