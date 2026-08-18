#!/usr/bin/env python3
"""Does the new plate's PAVING agree with the collision the game actually uses?

portSapphire-walkable.json was derived from the painting ONCE and is now a frozen authored artefact
-- the runtime does not re-derive it. So a rebaked plate cannot change where the player may walk,
which is a relief; what it CAN do is disagree with it, putting stone where the player is blocked and
grass where he walks. That is the failure the owner saw as "the game is not build on squares" in a
different form, and it is invisible to the finish gate.

Also reports seam contrast on the 3x3 tile joins, because independently generated tiles drift and a
visible join ruins the plate regardless of how sharp it is.
"""
from __future__ import annotations
import argparse, json, os
import numpy as np
from PIL import Image, ImageDraw

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
WALK = os.path.join(ROOT, "public/act1-hifi/town/portSapphire-walkable.json")
PAVING_LUM_MIN = 150


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("plate")
    ap.add_argument("--tiles", type=int, default=3)
    a = ap.parse_args()
    im = Image.open(a.plate).convert("RGB")
    P = im.size[0]
    rgb = np.asarray(im).astype(float)
    lum = 0.2126 * rgb[:, :, 0] + 0.7152 * rgb[:, :, 1] + 0.0722 * rgb[:, :, 2]
    pav = lum >= PAVING_LUM_MIN

    reg = json.load(open(WALK))["regions"][0]
    s = P / 1040.0
    msk = Image.new("L", (P, P), 0)
    dr = ImageDraw.Draw(msk)
    dr.polygon([(p["x"] * s, p["y"] * s) for p in reg["outer"]], fill=255)
    for h in reg.get("holes", []):
        dr.polygon([(p["x"] * s, p["y"] * s) for p in h], fill=0)
    walk = np.asarray(msk) > 127

    inter = int((pav & walk).sum())
    print(f"PLATE vs WALKABLE AUTHORITY  {os.path.basename(a.plate)}  {P}x{P}")
    print(f"  walkable area that reads as paving   {100*inter/max(int(walk.sum()),1):5.1f}%"
          f"   (player walks on stone he can see)")
    print(f"  paving that is NOT walkable          {100*int((pav & ~walk).sum())/max(int(pav.sum()),1):5.1f}%"
          f"   (stone he is blocked on)")

    # seams: mean |step| ACROSS each join, against the plate's own mean step
    d_all = np.concatenate([np.abs(np.diff(lum, axis=1)).ravel(), np.abs(np.diff(lum, axis=0)).ravel()])
    base = d_all.mean()
    print(f"  plate mean |pixel step|              {base:5.2f}")
    worst = 0.0
    for k in range(1, a.tiles):
        x = P * k // a.tiles
        v = float(np.abs(lum[:, x] - lum[:, x - 1]).mean())
        h = float(np.abs(lum[P * k // a.tiles, :] - lum[P * k // a.tiles - 1, :]).mean())
        print(f"  seam x={x:4d} {v:5.2f}   seam y={x:4d} {h:5.2f}   (a join that matches its"
              f" neighbours reads near {base:.1f}, not above it)")
        worst = max(worst, v, h)
    print(f"\n  worst seam / plate mean = {worst/base:.2f}x   "
          f"{'OK' if worst < base * 1.6 else 'VISIBLE SEAM'}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
