#!/usr/bin/env python3
"""Cut the generated ground sheet into seamlessly tiling materials at PLATE density.

WHY A SCALE FACTOR EXISTS AT ALL. The generator draws at whatever feature size it likes; what the
town needs is a feature size measured in CELLS. The shipped town runs 16 world px per cell, and a
plate that lands on an exact 3x device upscale carries 1.875 art px per world px -- so one cell is
30 plate px. A cobble in the raw sheet measures ~55 px of 627, i.e. 1.8 cells: nearly as wide as
the heroine is tall. Rescaling the quadrant to TILE px puts the cobble back at ~0.6 cells.

The tile is then wrap-quilted along a minimum-error cut, exactly as make_materials.py does for the
overworld -- safe on a material in a way it never was on a layout, because any patch of a uniform
field is as valid as any other.
"""
from __future__ import annotations
import argparse, importlib.util, os
import numpy as np
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
_spec = importlib.util.spec_from_file_location("mtm", os.path.join(ROOT, "scripts/make_town_materials.py"))
_mtm = importlib.util.module_from_spec(_spec); _spec.loader.exec_module(_mtm)

QUADS = {"grass": (0, 0), "paving": (1, 0), "shore": (0, 1), "edge": (1, 1)}


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("sheet")
    ap.add_argument("--tile", type=int, default=240, help="plate px per tile (30 px = one cell)")
    ap.add_argument("--out", default=os.path.join(ROOT, "design/act1-towns/ground"))
    a = ap.parse_args()

    im = Image.open(a.sheet).convert("RGB")
    W, H = im.size
    qw, qh = W // 2, H // 2
    os.makedirs(a.out, exist_ok=True)
    for name, (cx, cy) in QUADS.items():
        sw = im.crop((cx * qw, cy * qh, (cx + 1) * qw, (cy + 1) * qh)).resize((a.tile, a.tile), Image.LANCZOS)
        arr = np.asarray(sw)
        # The EDGE swatch is a border band: its grass->paving boundary runs down the middle and
        # must survive. Quilting it in x would cut straight through that boundary, so it is only
        # made seamless VERTICALLY -- which is the axis it actually repeats along.
        if name == "edge":
            arr = _mtm.wrap_axis(arr, max(8, a.tile // 6), 0)
        else:
            arr = _mtm.make_tileable(arr, max(8, a.tile // 6))
        p = os.path.join(a.out, f"ground-{name}.png")
        Image.fromarray(arr).save(p)
        print(f"  {name:7s} {a.tile}x{a.tile}  ({a.tile/30:.1f} cells)  -> {os.path.relpath(p, ROOT)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
