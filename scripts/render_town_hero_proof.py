#!/usr/bin/env python3
"""Show a town screen at the overworld's true scale, with the canonical Act-1 hero in it.

Owner, 2026-07-31: "show me how the town turns out with the hero in it."

EVERY NUMBER HERE COMES FROM designLocks. DO NOT HARDCODE A HERO PATH.
-----------------------------------------------------------------------
`public/act1-hifi/manifest.json` -> `designLocks` is the authority, and `docs/CANONICAL-ASSETS.md`
explains why this matters: two runtimes live in this repo at two different resolutions, and the
WRONG hero sits at the obvious path `public/assets/hero/` while the right one does not. A whole
art pass was scrapped on 2026-07-31 for taking the obvious one. So this script resolves the
hero from the manifest-adjacent hi-fi tree and asserts its shape, rather than trusting a
filename it happened to find.

Scale chain, all of it derived rather than assumed:
  16 world px per semantic cell        (owner-semantic-index.json pxPerCell)
  48 art px per cell in the artwork    (act1-material-map.png / (bounds width))  => art is 3x world
  hero 36 world px tall                (designLocks.heroWorldHeight)  => 108 art px at 3x
  camera 208 world px wide             (designLocks.cameraWorldWidth) => 624 art px at 3x

So the "camera" panel below is exactly what fits on screen in play, at the same zoom as the
overworld. If the hero looks wrong against the buildings in that panel, the artwork is at the
wrong scale -- that is the whole point of rendering it.
"""
from __future__ import annotations

import argparse
import json
import os

from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DIR = os.path.join(ROOT, "design/act1-towns")
HIFI = os.path.join(ROOT, "public/act1-hifi")
HERO = os.path.join(HIFI, "hero-g3/hero-act1-female-walk-8x3-64-g3.png")
SEMIDX = os.path.join(ROOT, "design/continent-terrain-class-method/owner-terrain/"
                            "owner-semantic-index.json")


def locks() -> dict:
    with open(os.path.join(HIFI, "manifest.json")) as fh:
        return json.load(fh)["designLocks"]


def hero_frame(row: int = 0, col: int = 0) -> Image.Image:
    """One 64x64 cell of the canonical sheet: 192x512, 3 cols x 8 rows, col 0 = idle.

    Row order per design/ART-DIRECTION.md: down, down-left, left, up-left, up, up-right,
    right, down-right. Runtime uses the four cardinals only.
    """
    sheet = Image.open(HERO).convert("RGBA")
    if sheet.size != (192, 512):
        raise SystemExit(f"hero sheet is {sheet.size}, expected (192, 512) -- wrong asset. "
                         f"See docs/CANONICAL-ASSETS.md")
    n = locks()["heroNativeFrame"]
    return sheet.crop((col * n, row * n, (col + 1) * n, (row + 1) * n))


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--screen", default=os.path.join(DIR, "portSapphire-screen.png"))
    ap.add_argument("--cells", type=int, default=65)   # 5x5 camera screens
    ap.add_argument("--at", default="", help="hero position as 'cx,cy' in cells; default = a "
                                             "landward approach near the middle-north")
    ap.add_argument("--out", default=os.path.join(DIR, "portSapphire-hero-proof.png"))
    args = ap.parse_args()

    dl = locks()
    world_px_per_cell = json.load(open(SEMIDX))["act1"]["pxPerCell"]        # 16
    screen = Image.open(args.screen).convert("RGBA")
    art_px_per_cell = screen.width / args.cells                            # 48
    art_per_world = art_px_per_cell / world_px_per_cell                    # 3.0

    hero_art_h = round(dl["heroWorldHeight"] * art_per_world)              # 108
    n = dl["heroNativeFrame"]
    frame = hero_frame()
    hero = frame.resize((round(n * hero_art_h / n), hero_art_h), Image.NEAREST)
    # non-integer scale (64 -> 108); NEAREST keeps her pixel character rather than blurring it

    cx, cy = (args.cells * 0.5, args.cells * 0.42)
    if args.at:
        cx, cy = (float(v) for v in args.at.split(","))
    hx = round(cx * art_px_per_cell - hero.width / 2)
    hy = round(cy * art_px_per_cell - hero.height)

    full = screen.copy()
    full.alpha_composite(hero, (max(0, hx), max(0, hy)))

    cam_w = round(dl["cameraWorldWidth"] * art_per_world)                  # 624
    left = min(max(0, hx + hero.width // 2 - cam_w // 2), full.width - cam_w)
    top = min(max(0, hy + hero.height // 2 - cam_w // 2), full.height - cam_w)
    cam = full.crop((left, top, left + cam_w, top + cam_w))

    gap = 20
    W = max(full.width, cam.width * 2)
    out = Image.new("RGB", (W, full.height + gap + cam.height * 2), (18, 20, 24))
    out.paste(full.convert("RGB"), ((W - full.width) // 2, 0))
    out.paste(cam.convert("RGB").resize((cam.width * 2, cam.height * 2), Image.NEAREST),
              ((W - cam.width * 2) // 2, full.height + gap))
    out.save(args.out)

    print(f"screen        {screen.size}  ({art_px_per_cell:g} art px/cell, "
          f"{art_per_world:g}x world)")
    print(f"hero          {hero.size}  = {dl['heroWorldHeight']} world px tall, "
          f"from a {n}px native frame")
    print(f"camera view   {cam.size}  = {dl['cameraWorldWidth']} world px wide")
    # the check the owner actually cares about: is a building meaningfully taller than she is?
    print(f"scale target  a house should stand {round(3 * hero_art_h)}-{round(4.5 * hero_art_h)} "
          f"art px tall (3x-4.5x the hero's {hero_art_h}); anything near {hero_art_h} is the "
          f"defect that got v1 rejected")
    print(f"  -> {args.out}   (top: whole town; bottom: one camera view at 2x)")


if __name__ == "__main__":
    main()
