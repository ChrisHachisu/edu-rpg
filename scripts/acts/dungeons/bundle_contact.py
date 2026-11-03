#!/usr/bin/env python3
"""One labelled tile per dungeon of the REAL (bundle-generator) floor-1 layout, cropped to content.
Tile colours: floor sand, wall dark, special tiles coloured (legend on the sheet)."""
import json, os, sys
import numpy as np
from PIL import Image, ImageDraw
import common
from specs import SPECS
from bundle_layouts import PAL, OUT
LEG = {0: "floor", 1: "wall", 2: "?2", 4: "chest", 5: "lava", 6: "up/exit", 7: "boss", 9: "down",
       14: "save", 17: "hidden", 18: "sign", 19: "wind", 24: "torch", 25: "ice", 26: "glyph?",
       27: "sand?", 28: "crack", 29: "portal", 30: "trip?"}


def tile(did, f, S=6):
    m = np.array(json.load(open(os.path.join(OUT, f"{did}-f{f}.json")))["map"])
    ys, xs = np.nonzero(m != 1)
    y0, y1, x0, x1 = max(0, ys.min() - 2), min(m.shape[0], ys.max() + 3), max(0, xs.min() - 2), min(m.shape[1], xs.max() + 3)
    m = m[y0:y1, x0:x1]
    rgb = np.zeros(m.shape + (3,), np.uint8)
    for v in np.unique(m):
        rgb[m == v] = PAL.get(int(v), (255, 0, 255))
    return Image.fromarray(rgb).resize((m.shape[1] * S, m.shape[0] * S), Image.NEAREST), (x0, y0)


def main(f=1, path=None):
    tiles = [(s, *tile(s["id"], f)) for s in SPECS]
    cols = 5; W = 380; H = 420
    rows = (len(tiles) + cols - 1) // cols
    sheet = Image.new("RGB", (cols * W, rows * H + 40), (14, 14, 18))
    d = ImageDraw.Draw(sheet)
    d.text((8, 8), f"REAL in-game floor {f} layouts (bundle generator Ap(), game seeds) — cropped to content, 1 cell = {6}px", fill=(240, 240, 240))
    d.text((8, 24), "  ".join(f"{k}:{v}" for k, v in LEG.items()), fill=(170, 170, 170))
    for i, (s, im, off) in enumerate(tiles):
        x, y = (i % cols) * W, 40 + (i // cols) * H
        im.thumbnail((W - 10, H - 30), Image.NEAREST)
        d.text((x + 5, y + 2), f"{s['id']} ({s.get('mechanic') or 'no mechanic'})", fill=(230, 230, 230))
        sheet.paste(im, (x + 5, y + 18))
    sheet.save(path or os.path.join(common.PREVIEW, f"bundle-layouts-f{f}.png"))


if __name__ == "__main__":
    main()
