#!/usr/bin/env python3
"""Can the player actually LEAVE each hi-fi town, and only where she is meant to?

WHY THIS EXISTS
---------------
The town exit has been wrong in three consecutive builds, each time in a way no gate could see,
because every previous check looked at the exit's OVERWORLD half (`toX`/`toY`, see
check_town_transitions.py) and nothing looked at its IN-TOWN half at all:

  build 57  `cell` sat 2.5-3.5 cells beyond the drawn gate, out on the open trail.
  build 62  `cell` was on the gate, but town.html's symmetric box fired a whole cell BEFORE it,
            so the screen changed while the player was still inside the fence.
  build 63  `cell` moved to the edge of the 65-cell canvas -- which is not the edge of the TOWN.
            Greenhollow's village stops at the fence around y 56; the player then walked eight
            cells across empty grass before anything happened.

town.html now treats `exit.cell` as a LINE across the town's mouth and fires when the player
CROSSES it. This asserts the three properties that arrangement has to have, all measured against the
walkable authority rather than read off the painting:

  1. ARMS ON ARRIVAL. `startCell` must be at least 0.75 cells INSIDE the line, so the player arms
     the moment she arrives and cannot be bounced straight back out to the overworld.
  2. THE EXIT IS REACHABLE. There must be standable ground beyond the line, inside the mouth, that
     a BFS from `startCell` can actually get to. An exit nobody can reach traps the player in town.
  3. NO WAY ROUND IT. Every reachable cell beyond the line must be inside the mouth's half-width.
     This is the one that bites silently: a player hugging the edge of a gate wider than the band
     walks straight past the trigger into the apron, and there is then no way to leave at all.
"""
from __future__ import annotations
import glob, importlib.util, json, os, sys
import numpy as np

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
TOWN_DIR = os.path.join(ROOT, "public/act1-hifi/town")
_spec = importlib.util.spec_from_file_location(
    "_pta", os.path.join(ROOT, "scripts/place_town_actors.py"))
_pta = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(_pta)

HALF_WIDTH = 2.4      # town.html's EXIT_HALF_WIDTH -- keep the two in step
ARM_MARGIN = 0.75     # town.html arms at outward <= -0.75


def main() -> int:
    bad, checked = [], 0
    for tj in sorted(glob.glob(os.path.join(TOWN_DIR, "*-town.json"))):
        town = os.path.basename(tj)[: -len("-town.json")]
        cfg = json.load(open(tj))
        ex = (cfg.get("exit") or {}).get("cell")
        if not ex:
            bad.append(f"  {town}: no exit.cell")
            continue
        walk = json.load(open(os.path.join(TOWN_DIR, os.path.basename(cfg["walkable"]))))
        cell = float(cfg["worldPxPerCell"])
        mask = _pta.standable(walk)
        h, w = mask.shape
        start = _pta.nearest(mask, cfg["startCell"][0] * cell, cfg["startCell"][1] * cell)
        if start is None:
            bad.append(f"  {town}: startCell has nowhere to stand")
            continue
        seen = _pta.reach(mask, (start[0], start[1]))
        # same axis rule as town.html: no town has an east/west mouth yet
        axis = (cfg["exit"].get("axis")
                or ("north" if ex[1] < cfg["cells"] / 2 else "south"))
        sign = -1 if axis == "north" else 1
        yy, xx = np.mgrid[0:h, 0:w]
        outward = (yy / cell - ex[1]) * sign
        lateral = np.abs(xx / cell - ex[0])

        checked += 1
        arm = (cfg["startCell"][1] - ex[1]) * sign
        if arm > -ARM_MARGIN:
            bad.append(f"  {town}: startCell is {arm:+.2f} cells outward of the exit line -- it "
                       f"must be at least {ARM_MARGIN} INSIDE or the exit never arms")
        reachable_exit = int((seen & (outward >= 0) & (lateral < HALF_WIDTH)).sum())
        if reachable_exit == 0:
            bad.append(f"  {town}: no reachable ground beyond the exit line at y {ex[1]} -- "
                       f"the player would be trapped in town")
        leak = int((seen & (outward >= 0) & (lateral >= HALF_WIDTH)).sum())
        if leak:
            ys, xs = np.nonzero(seen & (outward >= 0) & (lateral >= HALF_WIDTH))
            bad.append(f"  {town}: {leak} reachable world px lie beyond the exit line but OUTSIDE "
                       f"its {HALF_WIDTH}-cell mouth (e.g. cell "
                       f"{xs[0]/cell:.2f},{ys[0]/cell:.2f}) -- the player can walk round the exit")
        print(f"  {town:14s} exit line y={ex[1]:5.1f} ({axis:5s})  startCell {arm:+.2f} cells inside"
              f"  exit ground {reachable_exit:5d} px  round-the-side {leak} px")

    if bad:
        print("TOWN EXIT CHECK FAIL:")
        print("\n".join(bad))
        return 1
    print(f"TOWN EXIT CHECK PASS: {checked} town(s) arm on arrival, can reach their exit, "
          f"and have no way round it")
    return 0


if __name__ == "__main__":
    sys.exit(main())
