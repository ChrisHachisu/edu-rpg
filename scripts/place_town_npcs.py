#!/usr/bin/env python3
"""Composite the town's NPCs onto its screen at true scale, and prove where they stand.

The scale chain and the anchor convention are taken from `render_town_hero_proof.py`, not
re-derived: a cell coordinate is the character's FEET (bottom-centre), and a 64px native frame
draws at the same height the heroine does, so an NPC and the player are the same size on the
ground. Getting either wrong is invisible in a thumbnail and glaring in play.

Positions and identities come from `design/act1-towns/portSapphire-npc-placement.json`. The ids
and dialogueKeys in that file are preserved from the shipped bundle and are not ours to invent.

`--markers` draws numbered pins instead of sprites, so placement can be reviewed and corrected
before the sprites exist. That is the whole reason this runs in two modes.

Usage:
    place_town_npcs.py [--placement p.json] [--markers] [--out o.png] [--cam id]
"""
from __future__ import annotations

import argparse
import json
import os

from PIL import Image, ImageDraw, ImageFilter, ImageFont

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
HIFI = os.path.join(ROOT, "public/act1-hifi")
SEMIDX = os.path.join(ROOT, "design/continent-terrain-class-method/owner-terrain/"
                            "owner-semantic-index.json")
ROW = {"down": 0, "left": 1, "right": 2, "up": 3}      # NPC sheets are 3 cols x 4 rows
KEY = (255, 0, 255)


def locks() -> dict:
    with open(os.path.join(HIFI, "manifest.json")) as fh:
        return json.load(fh)["designLocks"]


def font(size: int):
    for p in ("/System/Library/Fonts/Helvetica.ttc",
              "/System/Library/Fonts/Supplemental/Arial.ttf"):
        try:
            return ImageFont.truetype(p, size)
        except OSError:
            continue
    return ImageFont.load_default()


def key_cell(cell: Image.Image, tol: float = 88.0) -> Image.Image:
    """Chroma-key one cell off the magenta field, and DESPILL the edge.

    The generator returns opaque RGB and cannot emit alpha, so every character sheet arrives on
    magenta (design/LANDMARK-SPRITE-CONTRACT.md). Keying on distance alone is not enough: the
    generator's own edge softening leaves a 1-2px ring of half-magenta that survives the key and
    reads as a pink halo once the sprite is composited onto stone or grass.

    The despill is deliberately EDGE-ONLY, and that restriction is not fussiness. The obvious
    global fix -- wherever red and blue both exceed green, pull them down to it -- would strip
    the Wise Woman's plum robe and Captain Drake's navy coat, which are legitimately magenta-ward
    hues. So the correction is confined to a two-pixel band around the silhouette, where the
    artwork is the contract's near-black outline and has no purple to lose.
    """
    import numpy as np
    a = np.asarray(cell.convert("RGB")).astype(np.float32)
    d = np.sqrt(((a - np.array(KEY, dtype=np.float32)) ** 2).sum(axis=2))
    alpha = np.clip((d - tol) / 24.0, 0.0, 1.0)

    soft = alpha < 0.999
    band = soft.copy()
    for _ in range(3):                                     # dilate the soft ring by 3 px
        p = np.pad(band, 1, mode="constant", constant_values=False)
        band = (p[:-2, 1:-1] | p[2:, 1:-1] | p[1:-1, :-2] | p[1:-1, 2:] | band)
    edge = band & (alpha > 0.0)

    r, g, b = a[..., 0], a[..., 1], a[..., 2]
    spill = np.minimum(r, b) - g                           # how magenta-ward this pixel is

    # ---- isolated key-coloured specks, wherever they are --------------------------------------
    # The v2 sheets came back with single magenta pixels well INSIDE the silhouette -- on a
    # kerchief, a boot, a staff -- left by the generator's own edge post-processing. An edge-band
    # despill never reaches them.
    #
    # They are separable from real violet artwork by neighbourhood, not by colour: the Wise
    # Woman's plum robe is a large connected region of magenta-ward pixels, while a speck is a
    # lone pixel whose neighbours are not magenta-ward at all. So despill a magenta-ward pixel
    # away from the edge only when it is in a small minority locally.
    mw = (spill > 22)
    p = np.pad(mw.astype(np.float32), 1, mode="constant", constant_values=0.0)
    neigh = (p[:-2, :-2] + p[:-2, 1:-1] + p[:-2, 2:] + p[1:-1, :-2]
             + p[1:-1, 2:] + p[2:, :-2] + p[2:, 1:-1] + p[2:, 2:])
    speck = mw & (neigh <= 2)                              # <=2 of 8 neighbours agree

    take = np.where((edge | speck) & (spill > 0), spill, 0.0)
    a = np.dstack([r - take, g, b - take]).clip(0, 255)

    # ---- match the heroine's soft silhouette --------------------------------------------------
    # She is authored RGBA and carries ~14 partially-transparent edge px per 100 opaque; a sheet
    # delivered on a chroma key is a hard cut and measures under 1. That difference is visible as
    # a harder, more jagged outline beside her.
    #
    # Softening belongs HERE, not in the brief: asking the generator to anti-alias into magenta
    # would reintroduce exactly the contaminated ramp the despill above exists to remove. A
    # small blur of the alpha alone produces the same soft edge from clean pixels.
    alpha = np.asarray(Image.fromarray((alpha * 255).astype(np.uint8), "L")
                       .filter(ImageFilter.GaussianBlur(0.7)), dtype=np.float32) / 255.0
    return Image.fromarray(np.dstack([a, alpha * 255.0]).astype(np.uint8), "RGBA")


def npc_frame(path: str, facing: str) -> Image.Image:
    """One 64x64 idle cell (column 0) of a 3x4 NPC sheet, keyed and despilled."""
    sheet = Image.open(path)
    if sheet.size != (192, 256):
        raise SystemExit(f"{path} is {sheet.size}, expected (192, 256) -- 3 cols x 4 rows "
                         f"of 64x64. See design/act1-towns/BRIEF-npcs.md")
    r = ROW[facing]
    return key_cell(sheet.crop((0, r * 64, 64, (r + 1) * 64)))


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--placement",
                    default=os.path.join(ROOT, "design/act1-towns/"
                                               "portSapphire-npc-placement.json"))
    ap.add_argument("--markers", action="store_true",
                    help="draw numbered pins instead of sprites, to review placement early")
    ap.add_argument("--cam", help="also render one camera view centred on this npc id")
    ap.add_argument("--out", required=True)
    args = ap.parse_args()

    pl = json.load(open(args.placement))
    dl = locks()
    world_px_per_cell = json.load(open(SEMIDX))["act1"]["pxPerCell"]
    screen = Image.open(os.path.join(ROOT, pl["screen"])).convert("RGBA")
    cells = pl["cells"]
    art_px_per_cell = screen.width / cells
    art_per_world = art_px_per_cell / world_px_per_cell
    h_art = round(dl["heroWorldHeight"] * art_per_world)        # same height as the player

    full = screen.copy()
    d = ImageDraw.Draw(full)
    f = font(34)
    placed = []
    for i, npc in enumerate(pl["npcs"], 1):
        cx, cy = npc["cell"]
        x = round(cx * art_px_per_cell)
        y = round(cy * art_px_per_cell)
        if args.markers:
            r = 16
            d.ellipse((x - r, y - r, x + r, y + r), fill=(255, 40, 40), outline=(255, 255, 255),
                      width=4)
            d.line((x, y, x, y - h_art), fill=(255, 40, 40), width=5)
            d.rectangle((x - 13, y - h_art - 46, x + 13, y - h_art - 6), fill=(255, 40, 40))
            d.text((x - 8, y - h_art - 44), str(i), font=f, fill=(255, 255, 255))
            placed.append((npc["id"], cx, cy, "marker"))
        else:
            sp = npc_frame(os.path.join(ROOT, npc["sheet"]), npc.get("facing", "down"))
            sp = sp.resize((h_art, h_art), Image.NEAREST)      # 64 -> h_art, keep pixel character
            full.alpha_composite(sp, (x - sp.width // 2, y - sp.height))
            placed.append((npc["id"], cx, cy, f"{sp.width}px"))

    cam_w = round(dl["cameraWorldWidth"] * art_per_world)
    cam = None
    if args.cam:
        t = next((n for n in pl["npcs"] if n["id"] == args.cam), None)
        if t is None:
            raise SystemExit(f"no npc with id {args.cam!r}")
        cx, cy = t["cell"]
        left = min(max(0, round(cx * art_px_per_cell) - cam_w // 2), full.width - cam_w)
        top = min(max(0, round(cy * art_px_per_cell) - cam_w // 2), full.height - cam_w)
        cam = full.crop((left, top, left + cam_w, top + cam_w))

    gap = 20
    W = max(full.width, (cam.width * 2 if cam else 0))
    H = full.height + (gap + cam.height * 2 if cam else 0)
    out = Image.new("RGB", (W, H), (18, 20, 24))
    out.paste(full.convert("RGB"), ((W - full.width) // 2, 0))
    if cam:
        out.paste(cam.convert("RGB").resize((cam.width * 2, cam.height * 2), Image.NEAREST),
                  ((W - cam.width * 2) // 2, full.height + gap))
    out.save(args.out)

    print(f"screen  {screen.size}  {art_px_per_cell:g} art px/cell  ({art_per_world:g}x world)")
    print(f"npc     drawn at {h_art} art px = {dl['heroWorldHeight']} world px, "
          f"identical to the player")
    for name, cx, cy, how in placed:
        print(f"  {name:<11} cell ({cx:>5}, {cy:>5})  feet-anchored  {how}")
    print(f"  -> {args.out}")


if __name__ == "__main__":
    main()
