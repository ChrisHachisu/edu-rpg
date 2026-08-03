#!/usr/bin/env python3
"""Prime a tile's base with its already-finished neighbours' art, then lock that band back.

The seam problem, stated plainly: every tile is a separate image call, so the model has never
seen the tile next door. One shared session helped (cross-call disagreement 28.5 -> same-call
19.4) but did not solve it, and the owner can still see where the joins are.

The fix is to stop asking the model to guess. Tiles overlap by 3 cells (144 px), so before
generating tile N its base gets its left/top neighbour's FINISHED ART pasted into that shared
band. The model is then doing img2img over real artwork at the edge and only has to continue
it inward -- the same trick as outpainting.

Then `--lock` pastes the neighbour's band back over the finished tile afterwards. So the shared
strip is byte-identical between neighbours by construction: the seam cannot be visible, because
there is nothing to disagree about. The generation's only job is to make the interior flow
naturally out of a band that is already correct.

Usage:
    prime_tile_base.py <act> --tile x,y            # write actN-tile-X-Y-primed.png
    prime_tile_base.py <act> --tile x,y --lock     # after generation, re-impose the bands
"""
from __future__ import annotations

import argparse
import json
import os

import numpy as np
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DIR = os.path.join(ROOT, "design/continent-terrain-class-method/owner-terrain/art-tiles")
PLAN = os.path.join(DIR, "tile-plan.json")


def neighbours(plan, act, tx, ty):
    """The left and top neighbours in world-cell space, if they exist in the plan."""
    stride = plan["strideCells"]
    bypos = {tuple(t["worldTopLeft"]): t for t in plan["acts"][act]["tiles"]}
    return bypos.get((tx - stride, ty)), bypos.get((tx, ty - stride))


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("act")
    ap.add_argument("--tile", required=True)
    ap.add_argument("--lock", action="store_true")
    args = ap.parse_args()

    plan = json.load(open(PLAN))
    PX, OV = plan["pxPerCell"], plan["overlapCells"] * plan["pxPerCell"]
    tx, ty = (int(v) for v in args.tile.split(","))
    left, top = neighbours(plan, args.act, tx, ty)

    base_p = os.path.join(DIR, f"act{args.act}-tile-{tx}-{ty}-base.png")
    art_p = os.path.join(DIR, f"act{args.act}-tile-{tx}-{ty}-ART.png")
    out_p = os.path.join(DIR, f"act{args.act}-tile-{tx}-{ty}-primed.png")

    target = art_p if args.lock else base_p
    if not os.path.exists(target):
        raise SystemExit(f"missing {os.path.basename(target)}")
    img = np.asarray(Image.open(target).convert("RGB")).copy()

    did = []
    if left is not None:
        lp = os.path.join(DIR, left["art"])
        if os.path.exists(lp):
            la = np.asarray(Image.open(lp).convert("RGB"))
            img[:, :OV] = la[:, -OV:]          # their right edge IS our left edge
            did.append("left")
    if top is not None:
        tp = os.path.join(DIR, top["art"])
        if os.path.exists(tp):
            ta = np.asarray(Image.open(tp).convert("RGB"))
            img[:OV, :] = ta[-OV:, :]
            did.append("top")

    if args.lock:
        Image.fromarray(img).save(art_p)
        print(f"locked {os.path.basename(art_p)}: re-imposed {', '.join(did) or 'nothing'} "
              f"band(s) -> shared strip now byte-identical to neighbour(s)")
    else:
        Image.fromarray(img).save(out_p)
        print(f"primed {os.path.basename(out_p)}: carries finished art on "
              f"{', '.join(did) or 'no'} edge(s)")
    print(f"  overlap band {OV}px = {plan['overlapCells']} cells")


if __name__ == "__main__":
    main()
