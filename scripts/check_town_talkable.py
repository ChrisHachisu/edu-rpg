#!/usr/bin/env python3
"""Can the player actually WALK to a spot where each NPC's talk prompt appears?

WHY THIS IS A SEPARATE QUESTION FROM `place_town_actors.py`
----------------------------------------------------------
That script proves each NPC STANDS on ground the player can reach. It does not prove the player can
reach a spot from which the game will let her TALK, and those are different: `town.html`'s
`nearestNpc()` only sees an NPC from the band BELOW her -- |dx| <= 1.1 cells, dy in [-0.35, +2.1],
the owner's approach-from-the-south rule -- and every stationary NPC is ALSO registered as a
`dynamicBlocker` disc of 7 world px, so she cannot stand on the near edge of her own band.

The reason this became a gate on 2026-08-24: authoring building footprints to get the player off the
roofs removed roughly a cell of margin around every building, and an NPC standing against a wall can
lose her whole approach band to that without any other check noticing. `place_town_actors.py` still
passes in that case, because the NPC's own cell is still reachable.

A `fixed` NPC (the shopkeeper, behind his counter inside the stall) is exempt by design: he is
deliberately not on walkable ground and the player reaches his shop through `shopCounter`, which
`place_town_actors.py` already proves reachable.
"""
from __future__ import annotations
import glob, importlib.util, json, os, sys
from collections import deque
import numpy as np

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
TOWN_DIR = os.path.join(ROOT, "public/act1-hifi/town")
_spec = importlib.util.spec_from_file_location(
    "_pta", os.path.join(ROOT, "scripts/place_town_actors.py"))
_pta = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(_pta)

NPC_BLOCK_RADIUS = 7.0          # world px, town.html's NPC_BLOCK_RADIUS
DX_MAX, DY_MIN, DY_MAX = 1.1, -0.35, 2.1     # town.html's nearestNpc() band, in cells


def main() -> int:
    bad, checked = [], 0
    for tj in sorted(glob.glob(os.path.join(TOWN_DIR, "*-town.json"))):
        town = os.path.basename(tj)[: -len("-town.json")]
        cfg = json.load(open(tj))
        walk = json.load(open(os.path.join(TOWN_DIR, os.path.basename(cfg["walkable"]))))
        cell = float(cfg["worldPxPerCell"])
        mask = _pta.standable(walk)
        h, w = mask.shape
        yy, xx = np.mgrid[0:h, 0:w]

        # every NPC is a solid disc, so subtract all of them before asking about any one of them
        npcs = cfg.get("npcs", [])
        blocked = np.zeros_like(mask)
        for n in npcs:
            cx, cy = n["cell"][0] * cell, n["cell"][1] * cell
            blocked |= (xx - cx) ** 2 + (yy - cy) ** 2 <= NPC_BLOCK_RADIUS ** 2
        free = mask & ~blocked

        s = _pta.nearest(free, cfg["startCell"][0] * cell, cfg["startCell"][1] * cell)
        if s is None:
            bad.append(f"  {town}: startCell has nowhere to stand once NPC blockers are applied")
            continue
        seen = _pta.reach(free, (s[0], s[1]))

        for n in npcs:
            if n.get("fixed"):
                continue
            checked += 1
            cx, cy = n["cell"][0] * cell, n["cell"][1] * cell
            band = ((np.abs(xx - cx) <= DX_MAX * cell)
                    & ((yy - cy) >= DY_MIN * cell) & ((yy - cy) <= DY_MAX * cell))
            ok = int((band & seen).sum())
            if not ok:
                loose = int((band & free).sum())
                bad.append(f"  {town}/{n['id']} at {n['cell']}: no REACHABLE standable pixel in the "
                           f"talk band ({loose} standable but unreachable) -- the prompt can never "
                           f"appear, so this NPC cannot be talked to")
            else:
                print(f"  {town}/{n['id']:<12} talk band: {ok:5d} reachable world px")
    if bad:
        print("TOWN TALKABLE CHECK FAIL:")
        print("\n".join(bad))
        return 1
    print(f"TOWN TALKABLE CHECK PASS: {checked} NPC(s) have a reachable spot to be talked to")
    return 0


if __name__ == "__main__":
    sys.exit(main())
