#!/usr/bin/env python3
"""Derive each landmark's facing from the terrain around it.

Two owner questions, 2026-07-30, both answerable from the owner's paint rather than by taste:

1. "dungeons need to blend in their terrain, we need the dungeons facing the correct direction
   depending on where they are located and the surrounding terrain." A cave mouth must be
   BACKED by blocked terrain (rock/forest/water) and OPEN toward the ground the player walks
   in from. So: face the most-open direction, backed by the most-blocked one.

2. "the one gate on the south side makes it seem like players can only enter from the south
   side, but this is not true right? ... if not we should have gates on all 4 sides for towns
   like these or orient the gates where the user is suspected to enter from." A town's gates
   should be on whichever sides actually have walkable approach.

Both are computed from `owner-terrain.json` + the land mask, so the artwork can be told the
answer instead of inventing one.

Usage:
    landmark_orientation.py [act ...]        # default: all acts
"""
from __future__ import annotations

import json
import os
import sys

import numpy as np

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DIR = os.path.join(ROOT, "design/continent-terrain-class-method/owner-terrain")
SRC = os.path.join(DIR, "owner-terrain.json")
PACK = os.path.join(ROOT, "design/review/overworld-art-blueprint/continent/continent-macro-g3")

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from build_owner_semantic_maps import kind_of  # noqa: E402

DIRS8 = [("N", 0, -1), ("NE", 1, -1), ("E", 1, 0), ("SE", 1, 1),
         ("S", 0, 1), ("SW", -1, 1), ("W", -1, 0), ("NW", -1, -1)]
# A dungeon mouth facing N/NE/NW sits on the FAR side of its own outcrop in a 3/4 top-down
# view and simply cannot be seen. Codex refused to deliver two N-facing sprites for exactly
# this reason (2026-07-30) rather than ship something wrong. So the approach direction is
# chosen from the visible half only -- terrain decides WHICH visible side, the projection
# decides which sides are candidates at all.
VISIBLE_FACINGS = {"S", "SE", "SW", "E", "W"}
DIRS4 = [("N", 0, -1), ("E", 1, 0), ("S", 0, 1), ("W", -1, 0)]
REACH = 7          # cells of context to look at
GATE_OPEN = 0.34   # a side needs at least this fraction walkable to earn a gate


def wedge(walk, water, cx, cy, dx, dy, reach=REACH, half=0.45):
    """Fraction walkable, and fraction water, in a wedge from (cx,cy) toward (dx,dy)."""
    h, w = walk.shape
    n = wt = tot = 0
    for r in range(2, reach + 1):
        span = max(1, int(r * half))
        for s in range(-span, span + 1):
            # step r along the direction, s across it
            px = cx + dx * r - dy * s
            py = cy + dy * r + dx * s
            if not (0 <= px < w and 0 <= py < h):
                continue
            tot += 1
            if walk[py, px]:
                n += 1
            if water[py, px]:
                wt += 1
    return (n / tot if tot else 0.0), (wt / tot if tot else 0.0)


def main() -> None:
    acts = sys.argv[1:] or None
    data = json.load(open(SRC))
    land = np.load(os.path.join(PACK, "land-mask.npy"))
    role = {".": "ground", "F": "vegetation", "M": "rock", "W": "water", "R": "path"}

    for act in sorted(data["acts"]):
        if acts and act not in acts:
            continue
        A = data["acts"][act]
        x0, y0, x1, y1 = A["bounds"]
        rows = A["terrainRows"]
        w, h = x1 - x0 + 1, y1 - y0 + 1
        walk = np.zeros((h, w), bool)
        water = np.zeros((h, w), bool)
        for yy in range(h):
            for xx in range(w):
                on_land = land[y0 + yy, x0 + xx]
                c = role[rows[yy][xx]]
                walk[yy, xx] = on_land and c in ("ground", "path")
                water[yy, xx] = (not on_land) or c == "water"

        print(f"\n=== act {act} ===")
        for name, (wx, wy) in sorted(A["landmarks"].items()):
            cx, cy = wx - x0, wy - y0
            k = kind_of(name)
            if k == "town":
                sides = []
                for d, dx, dy in DIRS4:
                    o, _ = wedge(walk, water, cx, cy, dx, dy)
                    sides.append((d, o))
                gates = [d for d, o in sides if o >= GATE_OPEN]
                detail = "  ".join(f"{d} {100*o:3.0f}%" for d, o in sides)
                print(f"  {name:<28} TOWN   open by side: {detail}")
                print(f"  {'':<28}        -> gates: {', '.join(gates) if gates else 'NONE'}"
                      f"  ({len(gates)} of 4)")
            else:
                scored = []
                for d, dx, dy in DIRS8:
                    o, wt = wedge(walk, water, cx, cy, dx, dy)
                    scored.append((d, o, wt))
                vis = [t for t in scored if t[0] in VISIBLE_FACINGS]
                face = max(vis, key=lambda t: t[1])
                blocked = max(scored, key=lambda t: t[1])
                back = min(scored, key=lambda t: t[1])
                wettest = max(scored, key=lambda t: t[2])
                # The mouth ALWAYS faces the walkable approach, never the water. An earlier
                # version of this script special-cased reefs to open toward the sea, which
                # recommended SW for Coastal Reef -- the owner rejected exactly that facing
                # and asked for N, which is the plain approach direction. Water nearby is
                # what makes it a reef; it is not where the door points.
                extra = ""
                if wettest[2] > 0.25:
                    extra = f"   (water {wettest[0]} {100*wettest[2]:.0f}%)"
                if back[1] > 0.9:
                    extra += "   NO BACKING -- sprite must bring its own outcrop"
                if blocked[0] not in VISIBLE_FACINGS and blocked[1] > face[1] + 0.02:
                    extra += f"   [{blocked[0]} is more open but is hidden in 3/4 view]"
                print(f"  {name:<28} {k.upper():<10} mouth faces {face[0]} "
                      f"({100*face[1]:.0f}% walkable), backed {back[0]} "
                      f"({100*back[1]:.0f}%){extra}")


if __name__ == "__main__":
    main()
