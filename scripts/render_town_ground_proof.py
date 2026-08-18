#!/usr/bin/env python3
"""Compose the ground pilot: tiled ground + approved props + the heroine, at TRUE GAME SCALE.

The proof is not the plate. What the owner judges is what his phone draws, and that is a specific
chain: the plate carries 1.875 art px per world px, the town camera shows 208 world px across
390 CSS px, and at dpr 3 that is an exact 3x NEAREST upscale -- 390 art px of plate becoming
1170 device px. So the view rendered here is a 390 px crop taken to 1170 by nearest neighbour, and
it is pixel-for-pixel what the device shows. Rendering the plate at any other magnification would
be a picture of the art rather than a picture of the game, and the whole complaint being answered
("the resolution is currently fuzzy on the app") lives in this chain, not in the art file.
"""
from __future__ import annotations
import argparse, json, os
import numpy as np
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PROPS = os.path.join(ROOT, "design/act1-towns/props")
HERO = os.path.join(ROOT, "public/act1-hifi/hero-g3/hero-act1-female-walk-8x3-64-g3.png")
TOWN = json.load(open(os.path.join(ROOT, "public/act1-hifi/town/portSapphire-town.json")))

PX_PER_CELL = 30.0            # 16 world px per cell * 1.875 art px per world px
WORLD_PX_PER_CELL = 16.0
HERO_WORLD_PX = 36.0          # canonical: reference_edu_rpg_canonical_hero
VIEW_ART = 390                # 208 world px * 1.875
DEVICE_UPSCALE = 3


def key_magenta(im: Image.Image) -> Image.Image:
    """Key the props off their flat magenta, then ERODE and DESPILL the rim.

    A plain threshold leaves a purple outline on every prop, and at an exact 3x nearest upscale
    that outline is three device pixels wide and impossible to miss -- it was visible on the shop
    pillar, the clinic and the blue-roofed house in the first proof. Two passes fix it: widen the
    key to catch the antialiased ring (the generator does not draw a hard 1px cut), then pull the
    red and blue of whatever rim survives back down towards its own green, which is what "spill"
    is. Never blur the alpha: a soft matte is the one thing this art must not have.
    """
    a = np.asarray(im.convert("RGBA")).astype(int)
    r, g, b = a[:, :, 0], a[:, :, 1], a[:, :, 2]
    mag = (r > 150) & (b > 150) & (g < np.minimum(r, b) - 40)
    al = np.where(mag, 0, a[:, :, 3])
    # erode one pixel: any opaque pixel touching the key goes with it
    o = al > 0
    nb = np.ones_like(o)
    for dy, dx in ((1, 0), (-1, 0), (0, 1), (0, -1)):
        nb &= np.roll(o, (dy, dx), (0, 1))
    al = np.where(o & ~nb, 0, al)
    a[:, :, 3] = al
    # despill the rim that remains
    spill = (al > 0) & (r > g + 25) & (b > g + 25)
    cap = g + 25
    a[:, :, 0] = np.where(spill, np.minimum(r, cap), r)
    a[:, :, 2] = np.where(spill, np.minimum(b, cap), b)
    return Image.fromarray(np.clip(a, 0, 255).astype(np.uint8))


def prop(i: int, cells_wide: float) -> Image.Image:
    im = key_magenta(Image.open(os.path.join(PROPS, f"v2-prop-{i:02d}.png")))
    bb = im.getbbox()
    if bb:
        im = im.crop(bb)
    w = int(round(cells_wide * PX_PER_CELL))
    h = int(round(im.size[1] * w / im.size[0]))
    # NEAREST keeps the drawn pixel hard. Any smooth filter here re-introduces exactly the softness
    # the redesign exists to remove, and it would do it to art the owner has already approved.
    return im.resize((w, h), Image.NEAREST)


def hero_frame(row=0, col=1) -> Image.Image:
    sheet = Image.open(HERO).convert("RGBA")
    f = sheet.crop((col * 64, row * 64, col * 64 + 64, row * 64 + 64))
    s = int(round(HERO_WORLD_PX * PX_PER_CELL / WORLD_PX_PER_CELL))
    return f.resize((s, s), Image.NEAREST)


def paste_at(base, sprite, cell, origin, anchor="feet"):
    """`cell` is the FEET cell (bottom-centre), matching render_town_hero_proof.py."""
    x = (cell[0] - origin[0]) * PX_PER_CELL
    y = (cell[1] - origin[1]) * PX_PER_CELL
    px = int(round(x - sprite.size[0] / 2))
    py = int(round(y - sprite.size[1])) if anchor == "feet" else int(round(y))
    base.alpha_composite(sprite, (px, py))


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--cells", default="18,20,46,40")
    ap.add_argument("--ground", default=os.path.join(ROOT, "design/act1-towns/ground/pilot-ground.png"))
    ap.add_argument("--out", default=os.path.join(ROOT, "design/act1-towns/ground"))
    ap.add_argument("--view-at", default="31.4,30.5", help="cell the true-scale view centres on")
    a = ap.parse_args()
    x0, y0, x1, y1 = (float(v) for v in a.cells.split(","))
    origin = (x0, y0)

    base = Image.open(a.ground).convert("RGBA")

    # Buildings, from the sheet the owner approved. Widths in CELLS so they sit against the hero
    # correctly: she is 36 world px = 2.25 cells tall, and a cottage must never approach her.
    #   10 market/shop (open counter under an awning)   12 herbalist (green roof, drying herbs)
    #   13 well            11 inn            00/01/03/05 houses      20/21 trees  22 bush
    #   23 fence           24 lamp           18 crates
    plan = [
        (13, 2.4, (31.4, 29.0)),                     # save point -> the well
        (10, 7.0, (24.5, 28.2)),                     # shop: its counter fronts cell 24.5,29.2
        (12, 6.6, (38.6, 28.9)),                     # healer's clinic, NPC stands at 38.6,29.9
        (11, 6.8, (30.4, 24.6)),                     # inn, north side of the square
        (5,  6.4, (20.2, 24.4)),
        (1,  5.8, (43.6, 24.8)),
        (3,  6.2, (36.0, 36.6)),
        (0,  6.0, (23.0, 36.9)),
        (20, 3.0, (27.6, 23.2)), (21, 3.2, (41.0, 36.0)), (20, 2.8, (19.4, 33.0)),
        (22, 1.6, (34.2, 26.6)), (22, 1.5, (28.9, 33.6)),
        (23, 3.4, (44.6, 31.4)), (24, 1.1, (33.3, 30.2)), (18, 2.2, (26.6, 31.6)),
    ]
    # Painter's order: anything whose feet are further down the screen draws later, so a prop in
    # front overlaps the one behind it instead of the other way round.
    for idx, wcells, cell in sorted(plan, key=lambda p: p[2][1]):
        paste_at(base, prop(idx, wcells), cell, origin)

    h = hero_frame()
    paste_at(base, h, (31.4, 30.9), origin)

    plate_p = os.path.join(a.out, "pilot-plate.png")
    base.convert("RGB").save(plate_p)

    # THE VIEW THE DEVICE DRAWS.
    vx, vy = (float(v) for v in a.view_at.split(","))
    cx = (vx - x0) * PX_PER_CELL
    cy = (vy - y0) * PX_PER_CELL
    left = int(round(max(0, min(base.size[0] - VIEW_ART, cx - VIEW_ART / 2))))
    top = int(round(max(0, min(base.size[1] - VIEW_ART, cy - VIEW_ART / 2))))
    view = base.convert("RGB").crop((left, top, left + VIEW_ART, top + VIEW_ART))
    dev = view.resize((VIEW_ART * DEVICE_UPSCALE, VIEW_ART * DEVICE_UPSCALE), Image.NEAREST)
    dev_p = os.path.join(a.out, "pilot-device-view.png")
    dev.save(dev_p)

    print(f"  plate  {base.size[0]}x{base.size[1]}  -> {os.path.relpath(plate_p, ROOT)}")
    print(f"  device {dev.size[0]}x{dev.size[1]} (390 art px, exact 3x nearest) -> "
          f"{os.path.relpath(dev_p, ROOT)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
